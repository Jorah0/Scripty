// Installs npm dependencies when node_modules is missing or older than package-lock.json (fresh clone, or a pull
// that changed dependencies). Runs before start/smoke/verify/dist. Dev/build only: the packaged exe already
// bundles everything it needs inside app.asar.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mtime = f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

// npm rewrites node_modules/.package-lock.json on every install, so it marks when the last install happened.
function needsInstall(root) {
  const installed = mtime(path.join(root, 'node_modules', '.package-lock.json'));
  return !installed || mtime(path.join(root, 'package-lock.json')) > installed;
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  if (needsInstall(root)) {
    console.log('[ensure-deps] node_modules missing or out of date, running npm install…');
    execSync('npm install --no-audit --no-fund', { cwd: root, stdio: 'inherit' });
  }
}

module.exports = { needsInstall };
