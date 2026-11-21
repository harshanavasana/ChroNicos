'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('manifest permissions and network host access stay within the allowlist', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'alarms', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://api.anthropic.com/*']);
  assert.equal(manifest.content_security_policy.extension_pages.includes("'unsafe-eval'"), false);
});

test('extension source contains no embedded Anthropic key or unsafe DOM execution', () => {
  const files = [
    'background.js',
    'popup.js',
    'profile.js',
    'request-data.js',
    'research-data.js',
    'resume-data.js',
    'resume-parser.mjs',
    'utils/cache.js',
    'utils/message-validation.js'
  ];
  const source = files.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');

  assert.doesNotMatch(source, /\bsk-ant-api\d{2}-[A-Za-z0-9_-]{20,}\b/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.doesNotMatch(source, /\beval\s*\(|new\s+Function\s*\(/);
  assert.doesNotMatch(source, /chrome\.storage\.sync/);
});
