'use strict';

const { MongoClient } = require('mongodb');
const { MemoryDb } = require('./memoryDb');

let client = null;
let db = null;
let isInMemory = false;

async function initDb(uri = process.env.MONGODB_URI) {
  if (db) return { db, isInMemory };

  if (uri && !process.env.FORCE_MEMORY_DB) {
    try {
      client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000
      });
      await client.connect();
      db = client.db();
      isInMemory = false;
      console.log('[db] Connected to MongoDB Atlas/server successfully.');
    } catch (err) {
      console.error('[db] Failed to connect to MongoDB URI:', err.message);
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      console.warn('[db] Falling back to built-in in-memory MongoDB store for development.');
      db = new MemoryDb();
      isInMemory = true;
    }
  } else {
    if (!process.env.SILENT_DB_LOG) {
      console.log('[db] No MONGODB_URI set. Using built-in in-memory MongoDB store.');
    }
    db = new MemoryDb();
    isInMemory = true;
  }

  const members = db.collection('members');
  const claims = db.collection('claims');

  await members.createIndex({ tokenHash: 1 }, { unique: true });
  await members.createIndex({ nameLower: 1 }, { unique: true });

  await claims.createIndex({ day: 1, color: 1 }, { unique: true });
  await claims.createIndex({ day: 1, memberId: 1 }, { unique: true });
  await claims.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3 * 24 * 60 * 60 });

  return { db, isInMemory };
}

function getCollections() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return {
    members: db.collection('members'),
    claims: db.collection('claims')
  };
}

async function closeDb() {
  if (client) {
    await client.close();
    client = null;
  }
  db = null;
}

module.exports = {
  initDb,
  getCollections,
  closeDb
};
