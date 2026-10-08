'use strict';

const http = require('http');

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request('http://127.0.0.1:3000' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let buf = '';
      res.on('data', chunk => { buf += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch {
          resolve(buf);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const meera = await post('/api/join', { name: 'Meera' });
  if (meera.token) {
    await post('/api/pick', { color: 'Navy' }, { 'X-Token': meera.token });
  }

  await post('/api/join', { name: 'Rohan' });

  const vikram = await post('/api/join', { name: 'Vikram' });
  if (vikram.token) {
    await post('/api/pick', { color: 'Olive' }, { 'X-Token': vikram.token });
  }

  const alice = await post('/api/join', { name: 'Alice' });
  if (alice.token) {
    await post('/api/pick', { color: 'Sky blue' }, { 'X-Token': alice.token });
  }

  const arjun = await post('/api/join', { name: 'Arjun' }, { 'X-Token': 'demo-arjun-token-12345' });
  if (arjun.token) {
    await post('/api/pick', { color: 'Maroon' }, { 'X-Token': arjun.token });
  }
}

main().catch(console.error);
