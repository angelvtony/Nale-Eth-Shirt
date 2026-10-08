'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

process.env.FORCE_MEMORY_DB = 'true';
process.env.SILENT_DB_LOG = 'true';
process.env.NODE_ENV = 'test';

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
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
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

test('Atomic claiming: two simultaneous claims on one colour, only one wins', async () => {
  const joinRes1 = await request('/api/join', {
    method: 'POST',
    body: { name: 'Alice' }
  });
  assert.equal(joinRes1.status, 200);
  const tokenAlice = joinRes1.body.token;

  const joinRes2 = await request('/api/join', {
    method: 'POST',
    body: { name: 'Bob' }
  });
  assert.equal(joinRes2.status, 200);
  const tokenBob = joinRes2.body.token;

  const [pickAlice, pickBob] = await Promise.all([
    request('/api/pick', {
      method: 'POST',
      headers: { 'X-Token': tokenAlice },
      body: { color: 'Navy' }
    }),
    request('/api/pick', {
      method: 'POST',
      headers: { 'X-Token': tokenBob },
      body: { color: 'Navy' }
    })
  ]);

  const statuses = [pickAlice.status, pickBob.status].sort();
  assert.deepEqual(statuses, [200, 409]);

  const winner = pickAlice.status === 200 ? 'Alice' : 'Bob';
  const loserRes = pickAlice.status === 409 ? pickAlice : pickBob;

  assert.equal(loserRes.body.error, 'taken');
  assert.equal(loserRes.body.by, winner);
});

test('Change pick and clear pick work properly', async () => {
  const joinRes = await request('/api/join', {
    method: 'POST',
    body: { name: 'Charlie' }
  });
  const token = joinRes.body.token;

  const pick1 = await request('/api/pick', {
    method: 'POST',
    headers: { 'X-Token': token },
    body: { color: 'Olive' }
  });
  assert.equal(pick1.status, 200);

  const pick2 = await request('/api/pick', {
    method: 'POST',
    headers: { 'X-Token': token },
    body: { color: 'Maroon' }
  });
  assert.equal(pick2.status, 200);

  const joinDave = await request('/api/join', {
    method: 'POST',
    body: { name: 'Dave' }
  });
  const pickDave = await request('/api/pick', {
    method: 'POST',
    headers: { 'X-Token': joinDave.body.token },
    body: { color: 'Olive' }
  });
  assert.equal(pickDave.status, 200);

  const clearRes = await request('/api/pick', {
    method: 'DELETE',
    headers: { 'X-Token': token }
  });
  assert.equal(clearRes.status, 200);
});

test('Case-insensitive name uniqueness rejection (409)', async () => {
  const joinFirst = await request('/api/join', {
    method: 'POST',
    body: { name: 'Eleanor' }
  });
  assert.equal(joinFirst.status, 200);

  const joinDup = await request('/api/join', {
    method: 'POST',
    body: { name: '  eleanor ' }
  });
  assert.equal(joinDup.status, 409);
  assert.match(joinDup.body.error, /already taken/i);
});
