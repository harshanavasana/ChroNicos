import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MessageValidation = require('../utils/message-validation.js');

describe('message validation', () => {
  it('rejects empty messages, placeholders, duplicates, and private links', () => {
    expect(MessageValidation.validateLocally('').valid).toBe(false);
    expect(MessageValidation.validateLocally('Hi [name], I would enjoy connecting.').valid).toBe(false);
    expect(MessageValidation.validateLocally('I enjoy NLP. I enjoy NLP.').valid).toBe(false);
    expect(MessageValidation.validateLocally('Visit https://example.com.').valid).toBe(false);
  });

  it('accepts a short, well-formed outreach message', () => {
    const result = MessageValidation.validateLocally(
      'Hi Jordan, I enjoyed learning about your machine learning work and would value exchanging ideas.'
    );
    expect(result.valid).toBe(true);
    expect(result.wordCount).toBeGreaterThan(0);
  });
});
