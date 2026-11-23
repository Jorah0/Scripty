'use strict';
const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const P = require('./src/core/providers.js');

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
  autosave: true, sfxVolume: 0.8, defaultType: 'youtube', readRate: 1, readSfx: true,
};
function loadConfig() {
  const c = readJSON(CONFIG(), {});
  return { settings: { ...DEFAULT_SETTINGS, ...(c.settings || {}) }, providers: c.providers || {}, keys: c.keys || {} };
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
  const cfg = providerCfg(provider, { ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) });
  const p = P.PROVIDERS[provider];
  if (!p) throw new Error('Unknown provider ' + provider);
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
    width: 1480, height: 920, minWidth: 1100, minHeight: 680, show: false, title: 'Scripty',
    backgroundColor: barFor(theme).color, icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'hidden', titleBarOverlay: barFor(theme),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());
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
  win.webContents.once('did-finish-load', async () => {
    await new Promise(r => setTimeout(r, 1500));
    let result = null;
    try { result = await win.webContents.executeJavaScript('window.__scripty.selfTest()'); } catch (e) { errors.push('selfTest threw: ' + e.message); }
    if (SHOT_DIR) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      for (const view of ['studio', 'perform', 'writers', 'providers', 'sounds', 'projects', 'settings', 'light']) {
        try { await win.webContents.executeJavaScript('window.__scripty.show(' + JSON.stringify(view) + ')'); } catch (e) { errors.push('show ' + view + ': ' + e.message); }
        await new Promise(r => setTimeout(r, 500));
        fs.writeFileSync(path.join(SHOT_DIR, view + '.png'), (await win.webContents.capturePage()).toPNG());
      }
    }
    console.log('SMOKE ' + JSON.stringify({ result, errors }));
    app.exit(result === true && !errors.length ? 0 : 1);
  });
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
    const cfg = providerCfg(id, baseUrl ? { baseUrl } : {});
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
}

if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    config = loadConfig();
    Menu.setApplicationMenu(null);
    registerIPC();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
