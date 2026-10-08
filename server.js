'use strict';

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { initDb, getCollections, closeDb } = require('./lib/db');
const { getTomorrowInfo } = require('./lib/tz');
const { PALETTE, isValidColor } = require('./lib/colors');
const { sseManager } = require('./lib/sse');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
      }
    }
  })
);

app.use(compression());
app.use(express.json({ limit: '2kb' }));

function hashToken(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const token = raw.trim();
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

function constantTimeCodeCheck(inputCode, expectedCode) {
  if (!expectedCode || !expectedCode.trim()) return true;
  if (typeof inputCode !== 'string') return false;
  const h1 = crypto.createHash('sha256').update(inputCode.trim()).digest();
  const h2 = crypto.createHash('sha256').update(expectedCode.trim()).digest();
  return crypto.timingSafeEqual(h1, h2);
}

function extractToken(req) {
  const headerToken = req.headers['x-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }
  return null;
}

async function getAuthMember(req) {
  const token = extractToken(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const { members } = getCollections();
  const member = await members.findOne({ tokenHash });
  return member || null;
}

async function buildState(member = null) {
  const { members, claims } = getCollections();
  const dayInfo = getTomorrowInfo();
  const day = dayInfo.day;
  const needCode = Boolean(process.env.TEAM_CODE && process.env.TEAM_CODE.trim());

  const [allMembers, allClaims] = await Promise.all([
    members.find().sort({ createdAt: 1 }).toArray(),
    claims.find({ day }).toArray()
  ]);

  const claimMap = new Map();
  for (const claim of allClaims) {
    claimMap.set(String(claim.memberId), claim.color);
  }

  const memberList = allMembers.map(m => ({
    id: String(m._id),
    name: m.name,
    color: claimMap.get(String(m._id)) || null
  }));

  return {
    day,
    dayLabel: dayInfo.dayLabel,
    needCode,
    me: member ? { id: String(member._id), name: member.name } : null,
    members: memberList
  };
}

async function broadcastState() {
  try {
    const baseState = await buildState(null);
    sseManager.broadcast(baseState);
  } catch (err) {
    console.error('[sse] Broadcast error:', err.message);
  }
}

const joinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many join attempts from this IP. Please try again later.' }
});

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
});

app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/palette', (req, res) => {
  res.json({ palette: PALETTE });
});

app.get('/api/state', async (req, res, next) => {
  try {
    const member = await getAuthMember(req);
    const state = await buildState(member);
    res.json(state);
  } catch (err) {
    next(err);
  }
});

app.post('/api/join', joinLimiter, async (req, res, next) => {
  try {
    const { name, code } = req.body || {};
    const expectedCode = process.env.TEAM_CODE;

    if (expectedCode && expectedCode.trim()) {
      if (!constantTimeCodeCheck(code, expectedCode)) {
        return res.status(403).json({ error: 'Invalid team code' });
      }
    }

    const rawName = typeof name === 'string' ? name : '';
    const cleanName = rawName.replace(/\s+/g, ' ').trim();

    if (!cleanName || cleanName.length < 1 || cleanName.length > 24) {
      return res.status(400).json({ error: 'Name must be between 1 and 24 characters' });
    }

    const { members } = getCollections();
    const nameLower = cleanName.toLowerCase();

    const existingName = await members.findOne({ nameLower });
    if (existingName) {
      return res.status(409).json({ error: 'Name already taken' });
    }

    let token = extractToken(req);
    if (!token) {
      token = crypto.randomUUID();
    }
    const tokenHash = hashToken(token);

    const existingTokenMember = await members.findOne({ tokenHash });
    let memberId;

    if (existingTokenMember) {
      await members.updateOne(
        { _id: existingTokenMember._id },
        { $set: { name: cleanName, nameLower } }
      );
      memberId = existingTokenMember._id;
    } else {
      const doc = {
        tokenHash,
        name: cleanName,
        nameLower,
        createdAt: new Date()
      };
      const result = await members.insertOne(doc);
      memberId = result.insertedId;
    }

    const me = { id: String(memberId), name: cleanName };

    broadcastState();

    res.status(200).json({
      ok: true,
      token,
      me
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Name already taken' });
    }
    next(err);
  }
});

app.post('/api/pick', async (req, res, next) => {
  try {
    const member = await getAuthMember(req);
    if (!member) {
      return res.status(401).json({ error: 'Please join your team first' });
    }

    const { color } = req.body || {};
    if (!isValidColor(color)) {
      return res.status(400).json({ error: 'Invalid colour chosen' });
    }

    const dayInfo = getTomorrowInfo();
    const day = dayInfo.day;
    const { claims, members } = getCollections();

    try {
      await claims.updateOne(
        { day, memberId: member._id },
        { $set: { color, createdAt: new Date() } },
        { upsert: true }
      );
    } catch (err) {
      if (err.code === 11000) {
        const existingClaim = await claims.findOne({ day, color });
        let ownerName = 'Another teammate';
        if (existingClaim) {
          const owner = await members.findOne({ _id: existingClaim.memberId });
          if (owner) ownerName = owner.name;
        }
        return res.status(409).json({
          error: 'taken',
          by: ownerName
        });
      }
      throw err;
    }

    broadcastState();

    res.json({ ok: true, color });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/pick', async (req, res, next) => {
  try {
    const member = await getAuthMember(req);
    if (!member) {
      return res.status(401).json({ error: 'Please join your team first' });
    }

    const dayInfo = getTomorrowInfo();
    const day = dayInfo.day;
    const { claims } = getCollections();

    await claims.deleteOne({ day, memberId: member._id });

    broadcastState();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/leave', async (req, res, next) => {
  try {
    const member = await getAuthMember(req);
    if (!member) {
      return res.status(401).json({ error: 'Please join your team first' });
    }

    const { members, claims } = getCollections();
    await claims.deleteMany({ memberId: member._id });
    await members.deleteOne({ _id: member._id });

    broadcastState();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const member = await getAuthMember(req);
    const initialState = await buildState(member);
    sseManager.addClient(req, res, initialState);
  } catch (err) {
    console.error('[sse] Failed to initialize SSE client:', err.message);
    res.status(500).end();
  }
});

app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true
  })
);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[server error]', err.message);
  if (res.headersSent) {
    return next(err);
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

let server = null;

async function startServer() {
  await initDb();
  server = app.listen(PORT, () => {
    console.log(`[server] nale eth shirt running on port ${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[server error] Port ${PORT} is already in use.`);
      console.error(`To use another port, run:`);
      console.error(`  PORT=3001 npm start\n`);
    } else {
      console.error('[server error]', err);
    }
    process.exit(1);
  });

  return server;
}

function gracefulShutdown(signal) {
  console.log(`[server] Received ${signal}. Shutting down gracefully...`);
  sseManager.closeAll();
  if (server) {
    server.close(async () => {
      await closeDb();
      console.log('[server] Server and DB connections closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
  startServer().catch(err => {
    console.error('[server] Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer
};
