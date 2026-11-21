'use strict';

// Recent generated messages are local-only, bounded, and automatically expired.

const Cache = (() => {
  const KEY = 'recentContacts';
  const MAX = 5;
  const DEFAULT_RETENTION_DAYS = 7;

  async function getContacts() {
    const result = await new Promise((resolve, reject) => {
      chrome.storage.local.get([KEY, 'messageRetentionDays'], value => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(value);
      });
    });
    const days = [1, 7, 30].includes(Number(result.messageRetentionDays))
      ? Number(result.messageRetentionDays)
      : DEFAULT_RETENTION_DAYS;
    const expiration = Date.now() - days * 24 * 60 * 60 * 1000;
    const contacts = Array.isArray(result[KEY]) ? result[KEY] : [];
    const retained = contacts
      .filter(contact => contact && typeof contact === 'object' &&
        Number.isFinite(contact.timestamp) && contact.timestamp >= expiration)
      .map(contact => {
        const localOnlyHistory = { ...contact };
        delete localOnlyHistory.profileUrl;
        return localOnlyHistory;
      });
    const containsOldProfileUrls = contacts.some(contact => contact?.profileUrl);
    if (retained.length !== contacts.length || containsOldProfileUrls) await writeContacts(retained);
    return retained;
  }

  async function addContact(contact) {
    const contacts = await getContacts();
    const identity = item => `${String(item.name || '').trim().toLowerCase()}|${String(item.company || '').trim().toLowerCase()}`;
    const contactIdentity = identity(contact);
    const filtered = contacts.filter(item => identity(item) !== contactIdentity);
    const updated  = [contact, ...filtered].slice(0, MAX);
    await writeContacts(updated);
  }

  async function clearContacts() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(KEY, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  }

  function writeContacts(contacts) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [KEY]: contacts }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  }

  return { getContacts, addContact, clearContacts };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Cache;
