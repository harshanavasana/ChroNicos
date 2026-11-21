'use strict';

const MessageValidation = (() => {
  const PLACEHOLDERS = [
    /\[\s*(?:name|company|role|title|insert|add|placeholder)\s*\]/i,
    /\{\{\s*[a-z][^}]*\}\}/i,
    /\b(?:lorem ipsum|todo|tbd|tba|placeholder)\b/i
  ];

  function normalizeSentence(sentence) {
    return String(sentence || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitSentences(message) {
    return String(message || '')
      .split(/[.!?\n]+/)
      .map(normalizeSentence)
      .filter(value => value.length >= 8);
  }

  function validateLocally(message, options = {}) {
    const text = String(message || '').replace(/\r/g, '').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const issues = [];
    if (!text) issues.push('The message is empty.');
    if (words > (options.maxWords || 120)) issues.push(`The message exceeds ${options.maxWords || 120} words.`);
    if (text.length > (options.maxCharacters || 600)) issues.push(`The message exceeds ${options.maxCharacters || 600} characters.`);
    if (PLACEHOLDERS.some(pattern => pattern.test(text))) issues.push('The message contains a placeholder.');

    const sentences = splitSentences(text);
    const seen = new Set();
    for (const sentence of sentences) {
      if (seen.has(sentence)) {
        issues.push('The message contains a duplicate sentence.');
        break;
      }
      seen.add(sentence);
    }
    if (text && !/[.!?,;:]$/.test(text) && !/\b(?:com|please|thanks|appreciate)\b/i.test(text)) {
      issues.push('The message may need a closing punctuation mark.');
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
      issues.push('The message contains invalid control characters.');
    }
    if (/\b(?:https?:\/\/|www\.|linkedin\.com)\b/i.test(text)) {
      issues.push('The message contains a URL or LinkedIn link.');
    }
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) ||
        /\b(?:phone|mobile|telephone|tel)\s*[:#]|\+\d[\d\s().-]{7,}\d\b/i.test(text)) {
      issues.push('The message contains private contact information.');
    }
    return {
      valid: issues.length === 0,
      issues,
      wordCount: words,
      characterCount: text.length
    };
  }

  function simpleHash(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  return { validateLocally, simpleHash };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MessageValidation;
