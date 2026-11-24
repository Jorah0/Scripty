const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createRemote } = require('../src/core/remote.js');

function setup() {
  const commands = [];
  let devices = [];
  const clock = { t: Date.now() };
  const remote = createRemote({
    staticDir: path.join(__dirname, '..', 'src'),
    onCommand: c => commands.push(c),
    loadDevices: () => devices,
    saveDevices: d => { devices = d; },
    now: () => clock.t,
  });
  return { remote, commands, clock, devices: () => devices };
}
const http = require('http');
function raw(port, p, headers) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, headers }, res => { res.resume(); resolve(res.statusCode); });
    r.on('error', reject); r.end();
  });
}
async function req(port, p, opts = {}) {
  const res = await fetch('http://127.0.0.1:' + port + p, opts);
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
}
const post = (port, p, body, token) => req(port, p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });

test('pairing: wrong code rejected, right code issues a working token, commands reach the app', async () => {
  const { remote, commands } = setup();
  const { port } = await remote.start(0);
  try {
    const st = remote.status();
    assert.match(st.code, /^\d{6}$/);
    assert.equal((await post(port, '/api/pair', { code: st.code === '000000' ? '111111' : '000000', name: 'x' })).status, 403);
    const ok = await post(port, '/api/pair', { code: st.code, name: 'Phone' });
    assert.equal(ok.status, 200);
    const token = ok.body.token;
    assert.ok(token && token.length >= 40);
    assert.equal((await post(port, '/api/command', { type: 'play-sound', id: 'rain' })).status, 401, 'no token');
    assert.equal((await post(port, '/api/command', { type: 'play-sound', id: 'rain' }, 'bogus')).status, 401, 'bad token');
    assert.equal((await post(port, '/api/command', { type: 'rm -rf' }, token)).status, 400, 'unknown command type');
    assert.equal((await post(port, '/api/command', { type: 'play-sound', id: 'rain' }, token)).status, 204);
    assert.deepEqual(commands, [{ type: 'play-sound', id: 'rain' }]);
    assert.equal(remote.status().devices[0].name, 'Phone');
    assert.ok(!JSON.stringify(remote.status().devices).includes(token), 'raw token never exposed');
  } finally { await remote.stop(); }
});

test('QR pair token is single-use; code rotates after 5 failures', async () => {
  const { remote } = setup();
  const { port } = await remote.start(0);
  try {
    const qr = remote.status().pairToken;
    assert.equal((await post(port, '/api/pair', { pairToken: qr, name: 'A' })).status, 200);
    assert.equal((await post(port, '/api/pair', { pairToken: qr, name: 'B' })).status, 403, 'reuse rejected');
    const code = remote.status().code;
    for (let i = 0; i < 5; i++) await post(port, '/api/pair', { code: 'bad' + i, name: 'x' });
    assert.notEqual(remote.status().code, code, 'code rotated after brute-force attempts');
    assert.equal((await post(port, '/api/pair', { code, name: 'x' })).status, 403);
  } finally { await remote.stop(); }
});

test('brute-force counter survives code expiry: 20 total failures lock pairing', async () => {
  const { remote, clock } = setup();
  const { port } = await remote.start(0);
  try {
    for (let i = 0; i < 15; i++) await post(port, '/api/pair', { code: 'x' + i });
    clock.t += 11 * 60 * 1000; // code expires; this must NOT reset the failure count
    for (let i = 0; i < 5; i++) await post(port, '/api/pair', { code: 'y' + i });
    assert.equal((await post(port, '/api/pair', { code: remote.status().code })).status, 429, 'locked even with the right code');
    remote.newPairing(); // desktop user unlocks
    assert.equal((await post(port, '/api/pair', { code: remote.status().code })).status, 200);
  } finally { await remote.stop(); }
});

test('DNS-rebinding hosts and foreign origins are rejected; token in query only for events', async () => {
  const { remote } = setup();
  const { port } = await remote.start(0);
  try {
    assert.equal(await raw(port, '/', { host: 'evil.example.com' }), 421);
    assert.equal(await raw(port, '/', { host: 'my-pc.tail1234.ts.net:' + port }), 200);
    assert.equal(await raw(port, '/', { host: '127.0.0.1:' + port, origin: 'http://evil.example.com' }), 403);
    const token = (await post(port, '/api/pair', { code: remote.status().code })).body.token;
    assert.equal((await req(port, '/api/state?token=' + token)).status, 401, 'query token not accepted on normal routes');
  } finally { await remote.stop(); }
});

test('commands are rate limited per device; AI commands more strictly', async () => {
  const { remote, commands } = setup();
  const { port } = await remote.start(0);
  try {
    const token = (await post(port, '/api/pair', { code: remote.status().code })).body.token;
    const codes = [];
    for (let i = 0; i < 8; i++) codes.push((await post(port, '/api/command', { type: 'generate' }, token)).status);
    assert.deepEqual(codes.slice(0, 6), [204, 204, 204, 204, 204, 204]);
    assert.equal(codes[7], 429, 'AI commands limited to 6/min');
    assert.equal(commands.length, 6);
    assert.equal((await post(port, '/api/command', { type: 'assist', k: 'constructor' }, token)).status, 400, 'prototype keys rejected');
  } finally { await remote.stop(); }
});

test('serves the Android app download when it is bundled, 404 otherwise', async () => {
  const fs = require('fs'), os = require('os');
  const apk = path.join(os.tmpdir(), 'scripty-test-' + process.pid + '.apk');
  fs.writeFileSync(apk, 'PK-fake-apk');
  const remote = createRemote({ staticDir: path.join(__dirname, '..', 'src'), onCommand() {}, loadDevices: () => [], saveDevices() {}, apkPath: apk });
  const { port } = await remote.start(0);
  try {
    const res = await fetch('http://127.0.0.1:' + port + '/scripty-remote.apk');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/vnd.android.package-archive');
    assert.match(res.headers.get('content-disposition'), /attachment; filename="Scripty-Remote.apk"/);
    assert.equal(await res.text(), 'PK-fake-apk');
    assert.equal(remote.status().apk, true);
  } finally { await remote.stop(); fs.rmSync(apk, { force: true }); }
  const { remote: r2 } = setup();
  const p2 = (await r2.start(0)).port;
  try { assert.equal((await req(p2, '/scripty-remote.apk')).status, 404); assert.equal(r2.status().apk, false); } finally { await r2.stop(); }
});

test('app update: records phone app version, pushes the update only to the chosen connected phone', async () => {
  const fs = require('fs'), os = require('os'), crypto = require('crypto');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scripty-upd-'));
  const apk = path.join(dir, 'Scripty-Remote.apk');
  fs.writeFileSync(apk, 'PK-new-version');
  const sha = crypto.createHash('sha256').update('PK-new-version').digest('hex');
  fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ versionCode: 10200, versionName: '1.2.0', sha256: sha }));
  let devices = [];
  const remote = createRemote({ staticDir: path.join(__dirname, '..', 'src'), onCommand() {}, loadDevices: () => devices, saveDevices: d => { devices = d; }, apkPath: apk });
  const { port } = await remote.start(0);
  const sse = (token, ua) => new Promise((resolve, reject) => {
    const r = http.get({ host: '127.0.0.1', port, path: '/api/events?token=' + token, headers: { 'user-agent': ua } }, res => {
      let buf = ''; res.setEncoding('utf8');
      const s = { res, events: () => buf, close: () => r.destroy() };
      res.on('data', d => { buf += d; });
      setTimeout(() => resolve(s), 100);
    });
    r.on('error', reject);
  });
  try {
    const phone = (await post(port, '/api/pair', { code: remote.status().code, name: 'Pixel' })).body.token;
    const other = (await post(port, '/api/pair', { code: remote.status().code, name: 'Tablet' })).body.token;
    const s1 = await sse(phone, 'Mozilla/5.0 (Linux; Android 14) ScriptyRemoteApp/10100');
    const s2 = await sse(other, 'Mozilla/5.0 (Linux; Android 14) ScriptyRemoteApp/10100');
    const st = remote.status();
    assert.equal(st.apkVersion.versionCode, 10200);
    const pixel = st.devices.find(d => d.name === 'Pixel');
    assert.equal(pixel.appVersion, 10100, 'phone app version recorded from its user agent');
    assert.equal(remote.pushUpdate(pixel.id), 1, 'delivered to the one connected stream of that phone');
    await new Promise(r => setTimeout(r, 100));
    assert.match(s1.events(), /event: app-update\ndata: \{"versionCode":10200,"versionName":"1.2.0","sha256":"[0-9a-f]{64}"/);
    assert.doesNotMatch(s2.events(), /app-update/, 'other devices are not told to update');
    assert.equal(remote.pushUpdate('nope'), 0);
    const info = await req(port, '/api/app-update', { headers: { authorization: 'Bearer ' + phone } });
    assert.equal(info.status, 200);
    assert.equal(info.body.sha256, sha);
    assert.equal((await req(port, '/api/app-update')).status, 401, 'update info needs a linked device');
    s1.close(); s2.close();
  } finally { await remote.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('revoked devices lose access; state requires auth; static files are whitelisted', async () => {
  const { remote } = setup();
  const { port } = await remote.start(0);
  try {
    const token = (await post(port, '/api/pair', { code: remote.status().code, name: 'P' })).body.token;
    remote.setState({ title: 'Hello' });
    const s = await req(port, '/api/state', { headers: { authorization: 'Bearer ' + token } });
    assert.equal(s.status, 200);
    assert.equal(s.body.title, 'Hello');
    assert.equal((await req(port, '/api/state')).status, 401);
    remote.revoke(remote.status().devices[0].id);
    assert.equal((await req(port, '/api/state', { headers: { authorization: 'Bearer ' + token } })).status, 401);
    assert.equal((await req(port, '/')).status, 200);
    assert.equal((await req(port, '/sfx.js')).status, 200);
    assert.equal((await req(port, '/..%2f..%2fpackage.json')).status, 404);
    assert.equal((await req(port, '/app.js')).status, 404, 'desktop renderer code not served');
  } finally { await remote.stop(); }
});
