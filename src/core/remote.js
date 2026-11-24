/* Scripty Remote Link: a tiny HTTP + Server-Sent-Events server that lets paired devices (phone, tablet, another PC)
   control the desktop app. Pure Node, no dependencies. Runs in the Electron main process. */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const COMMANDS = new Set(['generate', 'stop-generate', 'play-sound', 'play-cue', 'stop-sounds', 'read', 'read-stop',
  'prompter-open', 'prompter-toggle', 'prompter-close', 'prompter-speed', 'prompter-scroll', 'assist', 'assist-custom',
  'tool', 'open-project', 'new-project', 'editor-mode', 'insert-cue', 'snapshot', 'next-sound', 'replay-sound']);
const FIELDS = ['id', 'label', 'k', 'text', 'from', 'delta', 'mode'];
// Only these files are ever served: the remote web app plus the two shared modules it reuses.
const STATIC = {
  '/': ['remote/index.html', 'text/html; charset=utf-8'],
  '/remote.js': ['remote/remote.js', 'text/javascript; charset=utf-8'],
  '/remote.css': ['remote/remote.css', 'text/css; charset=utf-8'],
  '/manifest.webmanifest': ['remote/manifest.webmanifest', 'application/manifest+json'],
  '/icon.png': ['remote/icon.png', 'image/png'],
  '/scriptkit.js': ['core/scriptkit.js', 'text/javascript; charset=utf-8'],
  '/sfx.js': ['sfx.js', 'text/javascript; charset=utf-8'],
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'";
const PAIR_TTL = 10 * 60 * 1000;
const MAX_FAILS_PER_CODE = 5;
const MAX_FAILS_TOTAL = 20; // then pairing locks until the desktop user makes a new code

const sha = s => crypto.createHash('sha256').update(String(s)).digest();
function safeEq(a, b) { return crypto.timingSafeEqual(sha(a), sha(b)); }

// Rank adapters so the QR code points at one a phone can actually reach: real Wi-Fi/Ethernet first,
// Tailscale (works away from home) next, virtual adapters (VirtualBox, Hyper-V, WSL, Docker, VMware) last.
function rankAdapter(name, ip) {
  if (/virtualbox|vmware|vethernet|hyper-v|wsl|docker|vbox|loopback/i.test(name) || ip.startsWith('192.168.56.')) return 3;
  if (/tailscale|zerotier/i.test(name) || ip.startsWith('100.')) return 1;
  if (/wi-?fi|wlan|wireless|ethernet|^en\d|^eth\d/i.test(name)) return 0;
  return 2;
}
function lanNets(port) {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, url: 'http://' + a.address + ':' + port + '/', rank: rankAdapter(name, a.address) });
  }
  return out.sort((x, y) => x.rank - y.rank).map(({ name, url }) => ({ name, url }));
}

// Host names a real client uses: IP literals, localhost, mDNS (.local) and Tailscale (.ts.net). Anything else is
// a DNS-rebinding attempt from a web page in the PC user's own browser.
const HOST_OK = /^(\d{1,3}(\.\d{1,3}){3}|\[[\da-f:.]+\]|localhost|[\w-]+(\.[\w-]+)*\.(ts\.net|local))(:\d+)?$/i;
const AI_COMMANDS = new Set(['generate', 'assist', 'assist-custom', 'tool']);
const MAX_SSE_PER_DEVICE = 10;

function createRemote({ staticDir, onCommand, loadDevices, saveDevices, now = Date.now, apkPath = '' }) {
  const hasApk = () => !!apkPath && fs.existsSync(apkPath);
  // version.json is written next to the APK by android/build-apk.ps1: { versionCode, versionName, sha256 }
  function apkVersion() {
    if (!hasApk()) return null;
    try {
      const v = JSON.parse(fs.readFileSync(path.join(path.dirname(apkPath), 'version.json'), 'utf8'));
      return Number.isInteger(v.versionCode) && /^[0-9a-f]{64}$/.test(v.sha256) ? { versionCode: v.versionCode, versionName: String(v.versionName || ''), sha256: v.sha256 } : null;
    } catch { return null; }
  }
  let server = null, port = 0, stateJSON = '{}';
  const sockets = new Set(), clients = new Set(), rates = new Map();
  let pair, totalFails = 0, locked = false;

  // Only a desktop action ("New code") or a successful link clears the failure count; expiry and
  // per-code rotation keep it, so guessing can never outlast the lock by waiting.
  function rotate(resetFails) {
    pair = { code: String(crypto.randomInt(0, 1000000)).padStart(6, '0'), token: crypto.randomBytes(24).toString('base64url'), created: now(), fails: 0 };
    if (resetFails) { totalFails = 0; locked = false; }
  }
  const newPairing = () => rotate(true);
  rotate(true);
  function allow(deviceId, type) {
    const t = now(), r = rates.get(deviceId) || { s: t, n: 0, as: t, an: 0 };
    if (t - r.s >= 1000) { r.s = t; r.n = 0; }
    if (t - r.as >= 60000) { r.as = t; r.an = 0; }
    rates.set(deviceId, r);
    if (++r.n > 20) return false;                                  // 20 commands / second
    if (AI_COMMANDS.has(type) && ++r.an > 6) return false;         // 6 paid AI calls / minute
    return true;
  }

  const devices = () => loadDevices() || [];
  function findDevice(token) {
    if (!token) return null;
    const h = sha(token).toString('hex');
    const d = devices().find(x => x.hash.length === h.length && crypto.timingSafeEqual(Buffer.from(x.hash), Buffer.from(h)));
    if (d && now() - (d.lastSeen || 0) > 60000) { d.lastSeen = now(); saveDevices(devices()); }
    return d || null;
  }

  function send(res, code, body, type, extra) {
    res.writeHead(code, { ...(code === 204 ? {} : { 'Content-Type': type || 'application/json' }), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', ...(extra || {}) });
    res.end(body == null ? '' : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }
  function readJSON(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > 16384) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad json')); } });
      req.on('error', reject);
    });
  }
  function tokenOf(req, url) {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) return h.slice(7);
    return url.pathname === '/api/events' ? url.searchParams.get('token') : null; // only EventSource needs the query form
  }
  function sanitize(body) {
    const cmd = { type: body.type };
    for (const f of FIELDS) {
      const v = body[f];
      if (typeof v === 'string') cmd[f] = v.slice(0, 4000);
      else if (typeof v === 'number' && Number.isFinite(v)) cmd[f] = v;
    }
    if (cmd.k != null && !/^[a-z][a-z0-9_-]{0,39}$/.test(cmd.k)) return null;
    if (cmd.k && ['constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty'].includes(cmd.k)) return null;
    return cmd;
  }

  async function handle(req, res) {
    const host = String(req.headers.host || '');
    if (!HOST_OK.test(host)) return send(res, 421, { error: 'Bad host' });
    if (req.headers.origin && req.headers.origin !== 'http://' + host) return send(res, 403, { error: 'Cross-origin requests are not allowed' });
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if ((req.method === 'GET' || req.method === 'HEAD') && p === '/scripty-remote.apk') { // the Android companion app, public like the web page
      if (!hasApk()) return send(res, 404, 'Not found', 'text/plain');
      res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="Scripty-Remote.apk"',
        'Content-Length': fs.statSync(apkPath).size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(apkPath).pipe(res);
    }
    if (req.method === 'GET' && STATIC[p]) {
      const [file, type] = STATIC[p];
      fs.readFile(path.join(staticDir, file), (err, data) => err ? send(res, 404, 'Not found', 'text/plain')
        : send(res, 200, data, type, type.startsWith('text/html') ? { 'Content-Security-Policy': CSP } : {}));
      return;
    }
    // JSON-only POSTs force a CORS preflight, so other websites in the user's browser cannot drive this API.
    if (req.method === 'POST' && !String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'JSON only' });

    if (req.method === 'POST' && p === '/api/pair') {
      if (locked) return send(res, 429, { error: 'Pairing is locked after too many attempts. Make a new code on the desktop.' });
      let body; try { body = await readJSON(req); } catch { return send(res, 400, { error: 'Bad request' }); }
      if (locked) return send(res, 429, { error: 'Pairing is locked after too many attempts. Make a new code on the desktop.' }); // re-check: requests held open during the lock
      if (now() - pair.created > PAIR_TTL) rotate(false);
      const ok = (typeof body.pairToken === 'string' && safeEq(body.pairToken, pair.token)) || (typeof body.code === 'string' && safeEq(body.code.trim(), pair.code));
      if (!ok) {
        pair.fails++; totalFails++;
        if (totalFails >= MAX_FAILS_TOTAL) locked = true;
        else if (pair.fails >= MAX_FAILS_PER_CODE) rotate(false);
        return send(res, 403, { error: 'That code is not valid or has expired.' });
      }
      const token = crypto.randomBytes(32).toString('base64url');
      const d = { id: crypto.randomUUID(), name: String(body.name || 'Device').replace(/[^\w .'-]/g, '').slice(0, 40) || 'Device', hash: sha(token).toString('hex'), createdAt: now(), lastSeen: now() };
      saveDevices([...devices(), d]);
      rotate(true); // codes and QR links are single-use
      return send(res, 200, { token, name: d.name });
    }

    const device = findDevice(tokenOf(req, url));
    if (!device) return send(res, p.startsWith('/api/') ? 401 : 404, { error: p.startsWith('/api/') ? 'Not linked' : 'Not found' });

    // The Android app identifies itself as "ScriptyRemoteApp/<versionCode>"; remember it so the desktop can offer updates.
    const appMatch = /ScriptyRemoteApp\/(\d{1,9})/.exec(req.headers['user-agent'] || '');
    if (appMatch && device.appVersion !== Number(appMatch[1])) { device.appVersion = Number(appMatch[1]); saveDevices(devices()); }

    if (req.method === 'GET' && p === '/api/state') return send(res, 200, stateJSON);
    if (req.method === 'GET' && p === '/api/app-update') { const v = apkVersion(); return v ? send(res, 200, v) : send(res, 404, { error: 'No app update available' }); }
    if (req.method === 'GET' && p === '/api/events') {
      if ([...clients].filter(c => c.device === device.id).length >= MAX_SSE_PER_DEVICE) return send(res, 429, { error: 'Too many open connections' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
      res.write('retry: 2000\ndata: ' + stateJSON + '\n\n');
      const c = { res, device: device.id, beat: setInterval(() => res.write(': ping\n\n'), 25000) };
      clients.add(c);
      req.on('close', () => { clearInterval(c.beat); clients.delete(c); });
      return;
    }
    if (req.method === 'POST' && p === '/api/command') {
      let body; try { body = await readJSON(req); } catch { return send(res, 400, { error: 'Bad request' }); }
      const cmd = COMMANDS.has(body.type) ? sanitize(body) : null;
      if (!cmd) return send(res, 400, { error: 'Unknown command' });
      if (!allow(device.id, cmd.type)) return send(res, 429, { error: 'Slow down' });
      onCommand(cmd, device);
      return send(res, 204);
    }
    return send(res, 404, { error: 'Not found' });
  }

  return {
    start(p) {
      return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => handle(req, res).catch(() => { if (!res.headersSent) send(res, 500, { error: 'Server error' }); }));
        server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
        server.maxConnections = 64;      // bounds held-open requests (slowloris / parallel guessing)
        server.headersTimeout = 10000;
        server.requestTimeout = 15000;   // time to receive a request; SSE responses stay open
        server.keepAliveTimeout = 5000;
        server.once('error', e => { server = null; reject(e); });
        server.listen(p, '0.0.0.0', () => { port = server.address().port; resolve({ port }); });
      });
    },
    stop() {
      return new Promise(resolve => {
        for (const c of clients) { clearInterval(c.beat); c.res.end(); }
        clients.clear();
        if (!server) return resolve();
        server.close(() => resolve());
        for (const s of sockets) s.destroy();
        server = null;
      });
    },
    setState(s) {
      stateJSON = JSON.stringify(s || {});
      for (const c of clients) c.res.write('data: ' + stateJSON + '\n\n');
    },
    newPairing,
    /** Tell one linked device (only its open connections) to download and install the bundled app update. */
    pushUpdate(id) {
      const v = apkVersion();
      if (!v) return 0;
      let sent = 0;
      for (const c of clients) if (c.device === id) { c.res.write('event: app-update\ndata: ' + JSON.stringify(v) + '\n\n'); sent++; }
      return sent;
    },
    revoke(id) {
      saveDevices(devices().filter(d => d.id !== id));
      for (const c of [...clients]) if (c.device === id) { clearInterval(c.beat); c.res.end(); clients.delete(c); }
    },
    status() {
      const nets = server ? lanNets(port) : [];
      const online = new Set([...clients].map(c => c.device));
      return { running: !!server, port, apk: hasApk(), apkVersion: apkVersion(), online: [...online], code: pair.code, pairToken: pair.token, locked, nets, urls: nets.map(n => n.url),
        clients: clients.size, devices: devices().map(({ hash, ...d }) => d) };
    },
  };
}

module.exports = { createRemote, COMMANDS };
