'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const store = {};
let storageFailure = null;
function withStorageError(message, callback) {
  if (!storageFailure) {
    callback();
    return;
  }
  chrome.runtime.lastError = { message: storageFailure };
  callback();
  chrome.runtime.lastError = null;
}
global.chrome = {
  runtime: { lastError: null },
  storage: {
    local: {
      get(keys, callback) {
        withStorageError(storageFailure, () => {
          callback(Object.fromEntries(keys.filter(key => key in store).map(key => [key, store[key]])));
        });
      },
      set(values, callback) {
        if (storageFailure) {
          withStorageError(storageFailure, callback);
          return;
        }
        Object.assign(store, values);
        callback();
      },
      remove(keys, callback) {
        (Array.isArray(keys) ? keys : [keys]).forEach(key => delete store[key]);
        callback();
      }
    }
  }
};

const Cache = require('../utils/cache.js');

test('expires recent messages according to the configured retention period', async () => {
  store.messageRetentionDays = 1;
  store.recentContacts = [
    { name: 'Recent', timestamp: Date.now() - 12 * 60 * 60 * 1000, profileUrl: 'https://linkedin.com/in/example' },
    { name: 'Expired', timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 }
  ];

  const contacts = await Cache.getContacts();
  assert.deepEqual(contacts.map(contact => contact.name), ['Recent']);
  assert.equal(contacts[0].profileUrl, undefined);
  assert.deepEqual(store.recentContacts.map(contact => contact.name), ['Recent']);
});

test('clears recent message history', async () => {
  store.recentContacts = [{ name: 'Saved', timestamp: Date.now() }];
  await Cache.clearContacts();
  assert.equal(store.recentContacts, undefined);
});

test('reports local storage quota errors without replacing existing history', async () => {
  const existing = [{ name: 'Existing', timestamp: Date.now(), message: 'Keep this.' }];
  store.recentContacts = existing;
  storageFailure = 'QUOTA_BYTES quota exceeded';

  await assert.rejects(
    Cache.addContact({ name: 'New', timestamp: Date.now(), message: 'New message.' }),
    /QUOTA_BYTES/
  );
  assert.deepEqual(store.recentContacts, existing);
  storageFailure = null;
});

test('reports local storage read failures explicitly', async () => {
  storageFailure = 'Storage unavailable';
  await assert.rejects(Cache.getContacts(), /Storage unavailable/);
  storageFailure = null;
});
