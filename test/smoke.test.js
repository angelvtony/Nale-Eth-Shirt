'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

process.env.FORCE_MEMORY_DB = 'true';
process.env.SILENT_DB_LOG = 'true';
process.env.NODE_ENV = 'test';
process.env.TEAM_CODE = 'secretteamcode123';

const { app } = require('../server');
const { initDb, closeDb } = require('../lib/db');

let server;
let baseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

test.before(async () => {
  await initDb();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeDb();
});

test('GET /healthz returns ok with uptime and timestamp', async () => {
  const res = await request('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.ok(typeof res.body.uptime === 'number');
  assert.ok(res.body.timestamp);
});

test('GET /api/palette returns 10 colours', async () => {
  const res = await request('/api/palette');
  assert.equal(res.status, 200);
  assert.equal(res.body.palette.length, 10);
  assert.equal(res.body.palette[0].name, 'Navy');
});

test('GET /api/state returns day, needCode, me, and members list', async () => {
  const res = await request('/api/state');
  assert.equal(res.status, 200);
  assert.ok(res.body.day);
  assert.equal(res.body.needCode, true);
  assert.equal(res.body.me, null);
  assert.ok(Array.isArray(res.body.members));
});

test('POST /api/join validates team code and input sanitization', async () => {
  const badCodeRes = await request('/api/join', {
    method: 'POST',
    body: { name: 'Vikram', code: 'wrongcode' }
  });
  assert.equal(badCodeRes.status, 403);
  assert.match(badCodeRes.body.error, /invalid team code/i);

  const longNameRes = await request('/api/join', {
    method: 'POST',
    body: { name: 'A'.repeat(25), code: 'secretteamcode123' }
  });
  assert.equal(longNameRes.status, 400);

  const okRes = await request('/api/join', {
    method: 'POST',
    body: { name: '  Vikram   Sharma  ', code: 'secretteamcode123' }
  });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.body.me.name, 'Vikram Sharma');
  assert.ok(okRes.body.token);

  const authState = await request('/api/state', {
    headers: { 'X-Token': okRes.body.token }
  });
  assert.equal(authState.status, 200);
  assert.equal(authState.body.me.name, 'Vikram Sharma');

  const leaveRes = await request('/api/leave', {
    method: 'POST',
    headers: { 'X-Token': okRes.body.token }
  });
  assert.equal(leaveRes.status, 200);
});
