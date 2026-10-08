'use strict';

const crypto = require('crypto');

class MongoDuplicateKeyError extends Error {
  constructor(message, keyPattern, keyValue) {
    super(message || 'E11000 duplicate key error collection');
    this.name = 'MongoServerError';
    this.code = 11000;
    this.keyPattern = keyPattern;
    this.keyValue = keyValue;
  }
}

class MemoryCollection {
  constructor(name) {
    this.name = name;
    this.docs = [];
    this.indexes = [];
  }

  async createIndex(keys, options = {}) {
    this.indexes.push({ keys, options });
    return Object.keys(keys).join('_');
  }

  _matches(doc, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;
    for (const key of Object.keys(filter)) {
      const val = filter[key];
      if (key === '_id' || key === 'memberId') {
        if (String(doc[key]) !== String(val)) return false;
      } else if (doc[key] !== val) {
        return false;
      }
    }
    return true;
  }

  _checkUnique(doc, excludeId = null) {
    for (const idx of this.indexes) {
      if (!idx.options.unique) continue;
      const keys = Object.keys(idx.keys);
      const hasAllKeys = keys.every(k => doc[k] !== undefined && doc[k] !== null);
      if (!hasAllKeys) continue;

      const conflict = this.docs.find(d => {
        if (excludeId && String(d._id) === String(excludeId)) return false;
        return keys.every(k => String(d[k]) === String(doc[k]));
      });

      if (conflict) {
        const keyValue = {};
        for (const k of keys) keyValue[k] = doc[k];
        throw new MongoDuplicateKeyError(
          `E11000 duplicate key error collection: index violation on ${keys.join('_')}`,
          idx.keys,
          keyValue
        );
      }
    }
  }

  async findOne(filter) {
    const found = this.docs.find(d => this._matches(d, filter));
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  find(filter = {}) {
    const results = this.docs
      .filter(d => this._matches(d, filter))
      .map(d => JSON.parse(JSON.stringify(d)));

    return {
      toArray: async () => results,
      sort: (sortObj) => {
        const [field, order] = Object.entries(sortObj)[0] || [];
        if (field) {
          results.sort((a, b) => {
            if (a[field] < b[field]) return order === 1 ? -1 : 1;
            if (a[field] > b[field]) return order === 1 ? 1 : -1;
            return 0;
          });
        }
        return {
          toArray: async () => results
        };
      }
    };
  }

  async insertOne(doc) {
    const toInsert = {
      _id: doc._id || crypto.randomUUID(),
      ...JSON.parse(JSON.stringify(doc))
    };
    this._checkUnique(toInsert);
    this.docs.push(toInsert);
    return { insertedId: toInsert._id, acknowledged: true };
  }

  async updateOne(filter, update, options = {}) {
    const idx = this.docs.findIndex(d => this._matches(d, filter));

    if (idx === -1) {
      if (options.upsert) {
        const newDoc = {
          _id: crypto.randomUUID(),
          ...filter
        };
        if (update.$set) {
          Object.assign(newDoc, update.$set);
        }
        this._checkUnique(newDoc);
        this.docs.push(newDoc);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: newDoc._id };
      }
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }

    const existing = this.docs[idx];
    const candidate = JSON.parse(JSON.stringify(existing));
    if (update.$set) {
      Object.assign(candidate, update.$set);
    }
    this._checkUnique(candidate, existing._id);
    this.docs[idx] = candidate;
    return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
  }

  async deleteOne(filter) {
    const idx = this.docs.findIndex(d => this._matches(d, filter));
    if (idx !== -1) {
      this.docs.splice(idx, 1);
      return { deletedCount: 1, acknowledged: true };
    }
    return { deletedCount: 0, acknowledged: true };
  }

  async deleteMany(filter) {
    const initialLen = this.docs.length;
    this.docs = this.docs.filter(d => !this._matches(d, filter));
    return { deletedCount: initialLen - this.docs.length, acknowledged: true };
  }

  async countDocuments(filter = {}) {
    return this.docs.filter(d => this._matches(d, filter)).length;
  }
}

class MemoryDb {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MemoryCollection(name));
    }
    return this.collections.get(name);
  }
}

module.exports = {
  MemoryDb,
  MongoDuplicateKeyError
};
