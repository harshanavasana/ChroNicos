'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const MessageValidation = require('../utils/message-validation.js');

test('local validation rejects empty, placeholder, duplicate, URL, and private-contact messages', () => {
  assert.equal(MessageValidation.validateLocally('').valid, false);
  assert.equal(MessageValidation.validateLocally('Hi [name], I would enjoy connecting.').valid, false);
  assert.equal(MessageValidation.validateLocally('I enjoy NLP. I enjoy NLP.').valid, false);
  assert.equal(MessageValidation.validateLocally('Visit https://example.com to learn more.').valid, false);
  assert.equal(MessageValidation.validateLocally('Call me at +1 555 123 4567.').valid, false);
});

test('local validation accepts a concise, non-duplicate outreach message', () => {
  const result = MessageValidation.validateLocally(
    'Hi Jordan, I enjoyed learning about your work in machine learning and would value exchanging ideas.'
  );
  assert.equal(result.valid, true);
  assert.equal(result.wordCount > 0, true);
});
