'use strict';
const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const P = require('./src/core/providers.js');
const { createRemote } = require('./src/core/remote.js');
const QRCode = require('qrcode');

const SMOKE = process.argv.includes('--smoke');
const SHOT_DIR = (process.argv.find(a => a.startsWith('--shot=')) || '').slice(7);
if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'scripty-smoke-')));
app.setName('Scripty');
if (process.platform === 'win32') app.setAppUserModelId('app.scripty.studio');

const dataPath = (...p) => path.join(app.getPath('userData'), ...p);
const CONFIG = () => dataPath('config.json');
const SFX_DIR = () => dataPath('sfx');
const SFX_INDEX = () => dataPath('sfx', 'library.json');
const PROJECTS = () => dataPath('projects');

function readJSON(p, def) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; } }
function writeJSON(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2));
  fs.renameSync(tmp, p); // atomic replace: a crash mid-write never corrupts the original
}

const DEFAULT_SETTINGS = {
  theme: 'dark', accent: 'violet', editorFont: 'sans', editorSize: 16, temperature: 0.8, maxTokens: 8192,
  sfxVolume: 0.8, defaultType: 'youtube', readRate: 1, readSfx: true,
};
function loadConfig() {
  const c = readJSON(CONFIG(), {});
  return { settings: { ...DEFAULT_SETTINGS, ...(c.settings || {}) }, providers: c.providers || {}, keys: c.keys || {},
    remote: { enabled: false, port: 47830, devices: [], ...(c.remote || {}) } };
}
let config;
const saveConfig = () => writeJSON(CONFIG(), config);

// ---------- API keys: encrypted with the OS keystore (DPAPI on Windows); never sent to the renderer ----------
const ENV_KEYS = { anthropic: ['ANTHROPIC_API_KEY'], openai: ['OPENAI_API_KEY'], gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'], groq: ['GROQ_API_KEY'], mistral: ['MISTRAL_API_KEY'], deepseek: ['DEEPSEEK_API_KEY'],
  xai: ['XAI_API_KEY'], together: ['TOGETHER_API_KEY'] };
function envKey(id) { for (const k of ENV_KEYS[id] || []) if (process.env[k]) return process.env[k]; return ''; }
function encKey(k) {
  if (safeStorage.isEncryptionAvailable()) return { enc: true, data: safeStorage.encryptString(k).toString('base64') };
  return { enc: false, data: Buffer.from(k).toString('base64') };
}
function decKey(e) {
  if (!e) return '';
  try { return e.enc ? safeStorage.decryptString(Buffer.from(e.data, 'base64')) : Buffer.from(e.data, 'base64').toString(); } catch { return ''; }
}
function providerCfg(id, override) {
  const saved = config.providers[id] || {};
  return { ...saved, ...(override || {}), apiKey: decKey(config.keys[id]) || envKey(id) };
}
function publicProviders() {
  const out = {};
  for (const [id, p] of Object.entries(P.PROVIDERS)) {
    const saved = config.providers[id] || {};
    const keyStatus = config.keys[id] ? 'saved' : envKey(id) ? 'env' : 'none';
    out[id] = { id, label: p.label, vendor: p.vendor, kind: p.kind, color: p.color, local: !!p.local, needsKey: p.needsKey, keyUrl: p.keyUrl,
      defaultBaseUrl: p.baseUrl, baseUrl: saved.baseUrl || '', model: saved.model || p.defaultModel, models: saved.models || p.models,
      enabled: saved.enabled != null ? saved.enabled : false, keyStatus,
      ready: !p.needsKey || keyStatus !== 'none' };
  }
  return out;
}

// ---------- AI streaming ----------
// A stored key must only travel to that vendor's own URL; only local/custom servers take a renderer-supplied URL.
const urlOverridable = id => !!(P.PROVIDERS[id] && (P.PROVIDERS[id].local || id === 'custom'));
const running = new Map();
function friendlyError(id, err, status, bodyText) {
  const p = P.PROVIDERS[id] || { label: id };
  let msg = bodyText || (err && err.message) || 'Request failed';
  try { const j = JSON.parse(bodyText); msg = (j.error && (j.error.message || j.error)) || j.message || msg; } catch { /* not JSON */ }
  if (status === 401 || status === 403) return p.label + ': the API key was rejected (' + status + '). Check it on the Providers page.';
  if (status === 404) return p.label + ': not found (404). The model name may be wrong — use "Load models". ' + msg;
  if (status === 429) return p.label + ': rate limited or out of credit (429). ' + msg;
  const code = err && err.cause && err.cause.code;
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') return p.label + ': cannot reach ' + (providerCfg(id).baseUrl || p.baseUrl) + (p.local ? ' — is it running?' : ' — check your connection.');
  return p.label + (status ? ' (' + status + ')' : '') + ': ' + String(msg).slice(0, 400);
}

async function streamAI(sender, req) {
  const { reqId, provider, model, baseUrl, system, messages, temperature, maxTokens } = req;
  const p = P.PROVIDERS[provider];
  if (!p) throw new Error('Unknown provider ' + provider);
  const cfg = providerCfg(provider, { ...(model ? { model } : {}), ...(baseUrl && urlOverridable(provider) ? { baseUrl } : {}) });
  if (p.needsKey && !cfg.apiKey) throw new Error(p.label + ' has no API key yet. Add one on the Providers page.');
  const r = P.buildRequest(provider, cfg, messages, { system, temperature, maxTokens });
  const ctrl = new AbortController();
  running.set(reqId, ctrl);
  let full = '';
  try {
    let res;
    try { res = await fetch(r.url, { method: 'POST', headers: r.headers, body: JSON.stringify(r.body), signal: ctrl.signal }); }
    catch (e) { if (ctrl.signal.aborted) return { text: full, cancelled: true }; throw new Error(friendlyError(provider, e)); }
    if (!res.ok) throw new Error(friendlyError(provider, null, res.status, await res.text()));
    const send = (text) => { full += text; if (!sender.isDestroyed()) sender.send('ai:event', { reqId, type: 'chunk', text }); };
    if ((res.headers.get('content-type') || '').includes('application/json')) {
      const j = await res.json(); // server ignored stream:true
      send(p.kind === 'anthropic' ? ((j.content || []).map(c => c.text || '').join('')) : ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''));
      return { text: full };
    }
    const parse = P.createStreamParser(p.kind);
    const dec = new TextDecoder();
    try {
      for await (const chunk of res.body) {
        for (const t of parse(dec.decode(chunk, { stream: true }))) send(t);
      }
      for (const t of parse(dec.decode() + '\n\n')) send(t);
    } catch (e) {
      if (ctrl.signal.aborted) return { text: full, cancelled: true };
      throw new Error(friendlyError(provider, e));
    }
    return { text: full };
  } finally { running.delete(reqId); }
}

async function fetchJSON(url, headers, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 15000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) { const e = new Error(text); e.status = res.status; throw e; }
    return JSON.parse(text);
  } finally { clearTimeout(t); }
}

// ---------- window ----------
let win;
const THEME_BAR = { dark: { color: '#0b0d12', symbolColor: '#c7cede' }, light: { color: '#f6f7fb', symbolColor: '#3b4252' } };
function barFor(theme) { const t = theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme; return { ...(THEME_BAR[t] || THEME_BAR.dark), height: 46 }; }

function createWindow() {
  const theme = config.settings.theme;
  nativeTheme.themeSource = theme;
  win = new BrowserWindow({
    // Shown immediately (the dark backgroundColor avoids a white flash). Waiting for 'ready-to-show' left the app
    // running with an invisible window on some launches, and every later click then did nothing.
    width: 1480, height: 920, minWidth: 1100, minHeight: 680, show: true, title: 'Scripty',
    backgroundColor: barFor(theme).color, icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'hidden', titleBarOverlay: barFor(theme),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  let closing = false;
  win.on('close', (e) => {
    if (closing || SMOKE) return;
    e.preventDefault(); closing = true;
    const done = () => { if (!win.isDestroyed()) win.destroy(); };
    setTimeout(done, 2500);
    win.webContents.executeJavaScript('window.__scripty && window.__scripty.flush()').catch(() => {}).finally(done);
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('context-menu', (e, params) => {
    const items = [];
    for (const s of params.dictionarySuggestions || []) items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
    if (params.misspelledWord) items.push({ label: 'Add to dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: 'separator' });
    if (params.isEditable) items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    else if (params.selectionText) items.push({ role: 'copy' });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
  if (SMOKE) runSmoke();
}

function runSmoke() {
  const errors = [];
  win.webContents.on('console-message', (e, level, message, line, src) => { if (level >= 3) errors.push(message + ' @' + src + ':' + line); });
  win.webContents.on('preload-error', (e, p, err) => errors.push('preload: ' + err));
  win.webContents.on('render-process-gone', (e, d) => errors.push('renderer gone: ' + d.reason));
  win.setAlwaysOnTop(true); // covered windows stop painting, which would make screenshots show stale frames
  win.webContents.once('did-finish-load', async () => {
    await new Promise(r => setTimeout(r, 1500));
    let result = null;
    try { result = await win.webContents.executeJavaScript('window.__scripty.selfTest()'); } catch (e) { errors.push('selfTest threw: ' + e.message); }
    // The window must be visible without relying on 'ready-to-show', and a second launch must bring a hidden one back.
    if (!win.isVisible()) errors.push('window: not visible after load');
    win.hide();
    app.emit('second-instance', {}, [], process.cwd());
    if (!win.isVisible()) errors.push('window: second launch did not bring the hidden window back');
    if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });
    await smokeRemote(errors);
    if (SHOT_DIR) {
      for (const view of ['studio', 'perform', 'writers', 'providers', 'sounds', 'projects', 'settings', 'remote', 'models', 'light']) {
        try { await win.webContents.executeJavaScript('window.__scripty.show(' + JSON.stringify(view) + ')'); } catch (e) { errors.push('show ' + view + ': ' + e.message); }
        await new Promise(r => setTimeout(r, 500));
        fs.writeFileSync(path.join(SHOT_DIR, view + '.png'), (await win.webContents.capturePage()).toPNG());
      }
    }
    console.log('SMOKE ' + JSON.stringify({ result, errors }));
    app.exit(result === true && !errors.length ? 0 : 1);
  });
}

/** End-to-end Remote Link check: real server, real phone page linked via a QR URL, real command round-trip. */
async function smokeRemote(errors) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let phone;
  try {
    await remote.start(0);
    const st = remote.status(), base = 'http://127.0.0.1:' + st.port + '/';
    await win.webContents.executeJavaScript('refreshRemoteStatus()');
    phone = new BrowserWindow({ width: 390, height: 844, x: 40, y: 40, title: 'Scripty Remote (smoke)', alwaysOnTop: true, webPreferences: { sandbox: true } });
    phone.webContents.on('console-message', (e, level, message) => { if (level >= 3) errors.push('phone: ' + message); });
    await phone.loadURL(base + '?pair=' + encodeURIComponent(st.pairToken));
    await wait(1500);
    const linked = await phone.webContents.executeJavaScript('!!localStorage.getItem("scripty.token") && !document.getElementById("app").classList.contains("hidden")');
    if (!linked) errors.push('remote: phone did not link from the QR URL');
    const title = await phone.webContents.executeJavaScript('document.getElementById("h-title").textContent');
    if (!/Welcome/.test(title)) errors.push('remote: desktop state not mirrored to phone (title=' + title + ')');
    await phone.webContents.executeJavaScript('document.getElementById("b-mode").click()');
    await wait(900);
    const mode = await win.webContents.executeJavaScript('document.getElementById("perform").classList.contains("hidden") ? "edit" : "perform"');
    if (mode !== 'perform') errors.push('remote: phone command did not reach the desktop');
    const btn = await phone.webContents.executeJavaScript('document.getElementById("b-mode").textContent');
    if (!/Write/.test(btn)) errors.push('remote: phone did not receive the updated state (' + btn + ')');
    // App self-update push: desktop -> only this phone -> Android bridge (stubbed here) gets the verified version.
    const v = remote.status().apkVersion;
    if (v) {
      await phone.webContents.executeJavaScript('window.__upd = []; window.ScriptyApp = { versionCode: () => 1, update: (s, c) => window.__upd.push([s, c]) }; true');
      const dev = remote.status().devices[remote.status().devices.length - 1];
      if (remote.pushUpdate(dev.id) !== 1) errors.push('remote update: push did not reach the connected phone');
      await wait(700);
      const got = JSON.parse(await phone.webContents.executeJavaScript('JSON.stringify(window.__upd)'));
      if (!(got.length === 1 && got[0][0] === v.sha256 && got[0][1] === v.versionCode)) errors.push('remote update: phone bridge got ' + JSON.stringify(got));
      if (await phone.webContents.executeJavaScript('document.getElementById("upd").classList.contains("hidden")')) errors.push('remote update: progress overlay not shown');
      await phone.webContents.executeJavaScript('window.onAppUpdate({ state: "downloading", message: "Downloading the update from your PC…", percent: 62 }); true');
      const shown = await phone.webContents.executeJavaScript('document.getElementById("upd-msg").textContent + "|" + document.getElementById("upd-bar").style.width');
      if (shown !== 'Downloading the update from your PC…|62%') errors.push('remote update: progress not rendered (' + shown + ')');
      await wait(400);
      if (SHOT_DIR) fs.writeFileSync(path.join(SHOT_DIR, 'phone-update.png'), (await phone.webContents.capturePage()).toPNG());
      await phone.webContents.executeJavaScript('document.getElementById("upd").classList.add("hidden"); delete window.ScriptyApp; true');
    } else console.log('SMOKE note: no Android APK built, app-update push not exercised');
    if (SHOT_DIR) {
      for (const t of ['control', 'sounds', 'script', 'assist']) {
        await phone.webContents.executeJavaScript('document.querySelector(\'[data-tab="' + t + '"]\').click()');
        await wait(400);
        fs.writeFileSync(path.join(SHOT_DIR, 'phone-' + t + '.png'), (await phone.webContents.capturePage()).toPNG());
      }
    }
    await win.webContents.executeJavaScript('setEditorMode("edit")');
  } catch (e) { errors.push('remote e2e: ' + e.message); }
  finally { if (phone && !phone.isDestroyed()) phone.destroy(); }
}

// ---------- Remote Link (phone / tablet / other PC controls this app) ----------
let remote = null, remoteError = '';
function initRemote() {
  remote = createRemote({
    staticDir: path.join(__dirname, 'src'),
    // Android companion app: bundled in resources\android when packaged, android\dist during development
    apkPath: app.isPackaged ? path.join(process.resourcesPath, 'android', 'Scripty-Remote.apk') : path.join(__dirname, 'android', 'dist', 'Scripty-Remote.apk'),
    onCommand: (cmd) => { if (win && !win.isDestroyed()) win.webContents.send('remote:command', cmd); },
    loadDevices: () => config.remote.devices,
    saveDevices: (d) => { config.remote.devices = d; saveConfig(); },
  });
}
async function startRemote() {
  remoteError = '';
  try { await remote.start(config.remote.port); }
  catch (e) { remoteError = e.code === 'EADDRINUSE' ? 'Port ' + config.remote.port + ' is already in use. Pick another port.' : e.message; }
}
async function remoteStatus() {
  const s = remote.status();
  // One QR per address (the pair token is single-use, so whichever one gets scanned first wins).
  const qrs = await Promise.all(s.urls.map(u => QRCode.toDataURL(u + '?pair=' + encodeURIComponent(s.pairToken), { margin: 1, width: 240, color: { dark: '#111827', light: '#ffffff' } })));
  const apkQrs = s.apk ? await Promise.all(s.urls.map(u => QRCode.toDataURL(u + 'scripty-remote.apk', { margin: 1, width: 200, color: { dark: '#111827', light: '#ffffff' } }))) : [];
  return { ...s, pairToken: undefined, enabled: config.remote.enabled, configuredPort: config.remote.port, error: remoteError, qrs, apkQrs };
}

// ---------- IPC ----------
const SAFE_ID = /^[a-z0-9-]{6,64}$/;
function handle(ch, fn) { ipcMain.handle(ch, async (e, ...a) => fn(e, ...a)); }

function registerIPC() {
  handle('app:info', () => ({ version: app.getVersion(), dataDir: app.getPath('userData'), encryption: safeStorage.isEncryptionAvailable(), smoke: SMOKE }));
  handle('config:get', () => ({ settings: config.settings, providers: publicProviders(), encryption: safeStorage.isEncryptionAvailable() }));
  handle('config:setSettings', (e, s) => { config.settings = { ...config.settings, ...(s || {}) }; saveConfig(); return config.settings; });
  handle('config:setProvider', (e, id, patch) => {
    if (!P.PROVIDERS[id]) throw new Error('Unknown provider');
    const allowed = {};
    for (const k of ['model', 'baseUrl', 'enabled', 'models']) if (patch && k in patch) allowed[k] = patch[k];
    config.providers[id] = { ...(config.providers[id] || {}), ...allowed };
    saveConfig();
    return publicProviders()[id];
  });
  handle('config:setKey', (e, id, key) => {
    if (!P.PROVIDERS[id]) throw new Error('Unknown provider');
    key = String(key || '').trim();
    if (key) config.keys[id] = encKey(key); else delete config.keys[id];
    saveConfig();
    return publicProviders()[id];
  });

  handle('ai:models', async (e, id, baseUrl) => {
    const cfg = providerCfg(id, baseUrl && urlOverridable(id) ? { baseUrl } : {});
    const r = P.modelsRequest(id, cfg);
    try {
      const models = P.parseModels(await fetchJSON(r.url, r.headers));
      config.providers[id] = { ...(config.providers[id] || {}), models };
      saveConfig();
      return models;
    } catch (err) { throw new Error(friendlyError(id, err, err.status, err.status ? err.message : '')); }
  });
  handle('ai:stream', (e, req) => streamAI(e.sender, req));
  handle('ai:cancel', (e, reqId) => { const c = running.get(reqId); if (c) c.abort(); return !!c; });

  handle('projects:list', () => {
    fs.mkdirSync(PROJECTS(), { recursive: true });
    return fs.readdirSync(PROJECTS()).filter(f => f.endsWith('.json')).map(f => {
      const p = readJSON(path.join(PROJECTS(), f), null);
      return p && { id: p.id, title: p.title, type: p.brief && p.brief.type, updatedAt: p.updatedAt, createdAt: p.createdAt,
        words: (String(p.content || '').match(/\S+/g) || []).length, preview: String(p.content || '').slice(0, 220) };
    }).filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  });
  handle('projects:load', (e, id) => { if (!SAFE_ID.test(id)) throw new Error('Bad id'); return readJSON(path.join(PROJECTS(), id + '.json'), null); });
  handle('projects:save', (e, proj) => {
    if (!proj || !SAFE_ID.test(proj.id)) throw new Error('Bad project');
    writeJSON(path.join(PROJECTS(), proj.id + '.json'), proj);
    return true;
  });
  handle('projects:delete', (e, id) => { if (!SAFE_ID.test(id)) throw new Error('Bad id'); fs.rmSync(path.join(PROJECTS(), id + '.json'), { force: true }); return true; });

  handle('file:import', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Import script', properties: ['openFile'],
      filters: [{ name: 'Scripts & text', extensions: ['txt', 'md', 'fountain', 'srt', 'vtt', 'json', 'html', 'htm', 'rtf', 'csv'] }, { name: 'All files', extensions: ['*'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const f = r.filePaths[0];
    if (fs.statSync(f).size > 10 * 1024 * 1024) throw new Error('File is larger than 10 MB.');
    return { name: path.basename(f), ext: path.extname(f).slice(1).toLowerCase(), content: fs.readFileSync(f, 'utf8') };
  });
  handle('file:export', async (e, { format, name, content }) => {
    const filters = { txt: 'Plain text', md: 'Markdown', fountain: 'Fountain screenplay', html: 'Web page', pdf: 'PDF', srt: 'Subtitles (SRT)', json: 'Scripty project' };
    const safeName = String(name || 'script').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '').trim() || 'script';
    const r = await dialog.showSaveDialog(win, { title: 'Export', defaultPath: safeName + '.' + format, filters: [{ name: filters[format] || format, extensions: [format] }] });
    if (r.canceled || !r.filePath) return null;
    if (format === 'pdf') {
      const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
      try {
        await pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(content));
        fs.writeFileSync(r.filePath, await pw.webContents.printToPDF({ printBackground: true, pageSize: 'Letter', margins: { marginType: 'default' } }));
      } finally { pw.destroy(); }
    } else fs.writeFileSync(r.filePath, content, 'utf8');
    return r.filePath;
  });
  handle('file:reveal', (e, p) => { if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p); });

  const sfxLib = () => readJSON(SFX_INDEX(), []).map(s => ({ ...s, path: path.join(SFX_DIR(), s.file) }));
  handle('sfx:list', () => sfxLib());
  handle('sfx:import', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Add sounds to your library', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm', 'aac'] }] });
    if (r.canceled) return sfxLib();
    fs.mkdirSync(SFX_DIR(), { recursive: true });
    const lib = readJSON(SFX_INDEX(), []);
    for (const f of r.filePaths) {
      const id = crypto.randomUUID();
      const file = id + path.extname(f).toLowerCase();
      fs.copyFileSync(f, path.join(SFX_DIR(), file));
      const name = path.basename(f, path.extname(f)).replace(/[_\-]+/g, ' ').trim();
      lib.push({ id, name, file, volume: 1, keywords: name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2) });
    }
    writeJSON(SFX_INDEX(), lib);
    return sfxLib();
  });
  handle('sfx:update', (e, entry) => {
    const lib = readJSON(SFX_INDEX(), []);
    const i = lib.findIndex(s => s.id === entry.id);
    if (i >= 0) {
      lib[i] = { ...lib[i], name: String(entry.name || lib[i].name), volume: Number(entry.volume) || 1,
        keywords: (entry.keywords || []).map(k => String(k).toLowerCase().trim()).filter(Boolean) };
      writeJSON(SFX_INDEX(), lib);
    }
    return sfxLib();
  });
  handle('sfx:remove', (e, id) => {
    const lib = readJSON(SFX_INDEX(), []);
    const s = lib.find(x => x.id === id);
    if (s) fs.rmSync(path.join(SFX_DIR(), s.file), { force: true });
    writeJSON(SFX_INDEX(), lib.filter(x => x.id !== id));
    return sfxLib();
  });

  handle('shell:openExternal', (e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });
  handle('win:setTheme', (e, theme) => {
    nativeTheme.themeSource = theme;
    if (win && win.setTitleBarOverlay) win.setTitleBarOverlay(barFor(theme));
  });
  handle('data:open', () => shell.openPath(app.getPath('userData')));

  // ---------- Remote Link ----------
  handle('remote:status', () => remoteStatus());
  handle('remote:enable', async (e, on) => {
    config.remote.enabled = !!on; saveConfig();
    if (on) await startRemote(); else { await remote.stop(); remoteError = ''; }
    return remoteStatus();
  });
  handle('remote:port', async (e, port) => {
    port = Math.round(Number(port));
    if (!(port >= 1024 && port <= 65535)) throw new Error('Port must be between 1024 and 65535.');
    config.remote.port = port; saveConfig();
    if (config.remote.enabled) { await remote.stop(); await startRemote(); }
    return remoteStatus();
  });
  handle('remote:newCode', () => { remote.newPairing(); return remoteStatus(); });
  handle('remote:revoke', (e, id) => { remote.revoke(String(id)); return remoteStatus(); });
  handle('remote:pushUpdate', (e, id) => ({ sent: remote.pushUpdate(String(id)) }));
  ipcMain.on('remote:state', (e, s) => remote.setState(s));
}

if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();
else {
  // Clicking Scripty again always brings a usable window forward: restores, un-hides, or recreates it.
  app.on('second-instance', () => {
    if (!config) return;
    if (!win || win.isDestroyed()) return createWindow();
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  });
  app.whenReady().then(() => {
    config = loadConfig();
    initRemote();
    Menu.setApplicationMenu(null);
    registerIPC();
    createWindow();
    if (config.remote.enabled && !SMOKE) startRemote();
  });
  app.on('before-quit', () => remote && remote.stop());
  app.on('window-all-closed', () => app.quit());
}
