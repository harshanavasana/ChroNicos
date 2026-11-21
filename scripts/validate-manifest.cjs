'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3, 'Manifest V3 is required.');
assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'alarms', 'storage']);
assert.deepEqual(manifest.host_permissions, ['https://api.anthropic.com/*']);
assert.equal(manifest.content_security_policy.extension_pages.includes("'unsafe-eval'"), false);

const popup = fs.readFileSync(path.join(root, manifest.action.default_popup), 'utf8');
const resources = [
  manifest.action.default_popup,
  manifest.background.service_worker,
  ...Object.values(manifest.icons || {}),
  ...[...popup.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)].map(match => match[1])
];
for (const resource of resources) {
  assert.ok(fs.existsSync(path.join(root, resource)), `Missing manifest resource: ${resource}`);
}

console.log('Manifest permissions, CSP, host allowlist, and referenced resources are valid.');
