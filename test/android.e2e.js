/* End-to-end test of the real Scripty Remote APK on an Android emulator against a real Remote Link server.
   Run: npm run test:android            (headless emulator, shut down afterwards)
        npm run test:android -- --show  (emulator window stays open so you can watch and keep using it)
   Needs android/dist/Scripty-Remote.apk (npm run android). Not part of npm test: it boots a whole phone. */
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createRemote } = require('../src/core/remote.js');

const SHOW = process.argv.includes('--show');
const ADB = path.join(process.env.LOCALAPPDATA || '', 'ScriptyToolchain', 'sdk', 'platform-tools', 'adb.exe');
const [maj, min, pat] = require('../package.json').version.split('.').map(Number);
const VERSION_CODE = maj * 10000 + min * 100 + pat; // same formula as android/app/build.gradle
const wait = ms => new Promise(r => setTimeout(r, ms));
let serial = '';
const adb = (...a) => execFileSync(ADB, ['-s', serial, ...a.map(String)], { encoding: 'utf8', timeout: 60000 });

async function until(fn, what, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('Timed out waiting for: ' + what);
    await wait(700);
  }
}
// The on-screen UI (native views and the WebView's page, via accessibility) as { label, x, y } nodes.
function screen() {
  adb('shell', 'rm', '-f', '/sdcard/ui.xml'); // a failed dump must not leave the previous screen to match against
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  const xml = adb('exec-out', 'cat', '/sdcard/ui.xml');
  return [...xml.matchAll(/<node [^>]*>/g)].map(([n]) => {
    const get = k => ((n.match(new RegExp(' ' + k + '="([^"]*)"')) || [])[1] || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const b = (get('bounds').match(/\d+/g) || [0, 0, 0, 0]).map(Number);
    return { label: [get('text'), get('content-desc'), get('resource-id'), get('hint')].join(' | '), x: (b[0] + b[2]) >> 1, y: (b[1] + b[3]) >> 1 };
  });
}
const find = (re, ms) => until(() => screen().find(n => re.test(n.label)), 'on screen: ' + re, ms);
async function tap(re) { const n = await find(re); adb('shell', 'input', 'tap', n.x, n.y); return n; }

async function main() {
  assert.ok(fs.existsSync(ADB), 'Android toolchain missing: run npm run android, then npm run emulator once');
  const commands = [];
  let devices = [];
  const remote = createRemote({
    staticDir: path.join(__dirname, '..', 'src'),
    onCommand: c => commands.push(c.type),
    loadDevices: () => devices,
    saveDevices: d => { devices = d; },
  });
  remote.setState({ title: 'Emulator e2e', type: 'YouTube', seconds: 30, target: 60, words: 80, editorMode: 'edit', prompter: {} });
  const { port } = await remote.start(0);
  const host = '10.0.2.2:' + port; // the emulator's address for this PC
  const steps = [];
  const step = async (name, fn) => { process.stdout.write('  ' + name + ' ... '); await fn(); steps.push(name); console.log('ok'); };

  let started = false; // only an emulator this run booted is ever shut down
  try {
    console.log('Booting the emulator and installing the APK (first run can take a few minutes)...');
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'android', 'emulator.ps1'),
      '-Url', 'http://' + host + '/?pair=' + remote.status().pairToken, '-Fresh', ...(SHOW ? [] : ['-Headless'])], { encoding: 'utf8', timeout: 15 * 60000, maxBuffer: 64 * 1024 * 1024 });
    const last = out.trim().split(/\r?\n/).pop();
    serial = (last.match(/^emulator-\d+/) || [])[0];
    started = / started$/.test(last); // emulator.ps1 shuts down its own emulator itself if setup fails
    assert.ok(serial, 'emulator.ps1 did not report a device:\n' + out);
    console.log('Testing on ' + serial);

    await step('links from a scanned pairing QR (deep link into the app)', () => until(() => devices.length === 1, 'device linked', 60000));
    await step('reports its app version to the desktop (native user agent)', () => until(() => devices[0].appVersion === VERSION_CODE, 'appVersion ' + VERSION_CODE));
    await step('holds a live connection', () => until(() => remote.status().online.includes(devices[0].id), 'device online'));
    await step('shows the desktop state', () => find(/Emulator e2e/));
    await step('a tap sends a command to the desktop', async () => { await tap(/Save snapshot/); await until(() => commands.includes('snapshot'), 'snapshot command'); });
    await step('the page sees the native app bridge', async () => { await tap(/Projects/); await find(new RegExp('version code ' + VERSION_CODE)); });
    await step('Back opens the native connect screen with the saved PC', async () => {
      adb('shell', 'input', 'keyevent', 4);
      await find(/PC address/);
      await find(new RegExp(host.replace(/\./g, '\\.')));
    });
    await step('Connect reopens the remote, still linked', async () => { await tap(/^Connect \|/); await find(/Emulator e2e|Projects/); });
    await step('relaunch remembers the PC and stays linked', async () => {
      adb('shell', 'am', 'force-stop', 'app.scripty.remote');
      await until(() => !remote.status().online.length, 'connection closed by force-stop');
      adb('shell', 'am', 'start', '-W', '-n', 'app.scripty.remote/.MainActivity');
      await until(() => remote.status().online.includes(devices[0].id), 'device back online', 45000);
    });
    await step('unlinking on the desktop sends the phone back to pairing', async () => { remote.revoke(devices[0].id); await find(/Link device/); });
    await step('links again by typing the 6-digit code', async () => {
      await tap(/pair-code/);
      adb('shell', 'input', 'text', remote.status().code);
      adb('shell', 'input', 'keyevent', 66); // Enter submits, like the Link button
      await until(() => devices.length === 1, 'device linked by code');
      await find(/Emulator e2e|Save snapshot/);
    });
    console.log('\nAndroid e2e passed: ' + steps.length + ' checks on the real APK.');
  } catch (e) {
    if (serial) {
      const shot = path.join(os.tmpdir(), 'scripty-android-e2e-failure.png');
      try { fs.writeFileSync(shot, execFileSync(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'])); console.error('\nScreenshot of the failure: ' + shot); } catch { /* no screenshot */ }
    }
    console.error('\nFAILED: ' + e.message);
    process.exitCode = 1;
  } finally {
    await remote.stop();
    if (started && !SHOW) { try { adb('emu', 'kill'); } catch { /* already gone */ } }
  }
}
main();
