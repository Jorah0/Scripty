const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { needsInstall } = require('../build/ensure-deps.js');

test('installs when node_modules is missing or older than the lockfile, not when it is current', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scripty-deps-'));
  const lock = path.join(root, 'package-lock.json'), marker = path.join(root, 'node_modules', '.package-lock.json');
  fs.writeFileSync(lock, '{}');
  assert.equal(needsInstall(root), true, 'no node_modules');
  fs.mkdirSync(path.dirname(marker));
  fs.writeFileSync(marker, '{}');
  fs.utimesSync(lock, new Date(), new Date(Date.now() + 60000)); // lockfile changed after the last install
  assert.equal(needsInstall(root), true, 'stale install');
  fs.utimesSync(marker, new Date(), new Date(Date.now() + 120000));
  assert.equal(needsInstall(root), false, 'current install');
  fs.rmSync(root, { recursive: true, force: true });
});
