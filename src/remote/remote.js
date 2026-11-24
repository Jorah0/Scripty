/* Scripty Remote: phone/tablet/PC companion. Pairs with the desktop app, mirrors its state over SSE, sends commands. */
'use strict';
const K = window.ScriptKit;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: stays in memory */ } },
  del: k => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
let token = store.get('scripty.token');
let tab = store.get('scripty.tab') || 'control';
let playHere = store.get('scripty.playHere') === '1';
let st = {}, es = null, lastContent = null;

// ---------- helpers ----------
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2600); }
function deviceName() {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : 'Device';
}
const fmt = s => K.fmtTime(s || 0);

// ---------- pairing & connection ----------
function showPair(msg) {
  $('#app').classList.add('hidden'); $('#pair').classList.remove('hidden');
  $('#pair-msg').textContent = msg || '';
  if (!$('#pair-name').value) $('#pair-name').value = deviceName();
}
async function pair(body) {
  const r = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, name: $('#pair-name').value || deviceName() }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Linking failed');
  token = j.token; store.set('scripty.token', token);
}
function unlinked(msg) {
  store.del('scripty.token'); token = null;
  if (es) es.close();
  showPair(msg || 'This device is not linked. Enter a new code from the desktop.');
}
function setConn(s) { const c = $('#conn'); c.className = 'conn ' + s; c.title = s === 'on' ? 'Connected' : s === 'off' ? 'Reconnecting…' : 'Connecting…'; }
function connect() {
  $('#pair').classList.add('hidden'); $('#app').classList.remove('hidden');
  if (es) es.close();
  setConn('');
  es = new EventSource('/api/events?token=' + encodeURIComponent(token));
  es.onopen = () => setConn('on');
  // The desktop pushed an app update to this phone only: download, install and restart via the Android app.
  es.addEventListener('app-update', e => { try { startAppUpdate(JSON.parse(e.data)); } catch { /* malformed push */ } });
  es.onmessage = e => { try { st = JSON.parse(e.data); } catch { return; } setConn('on'); update(); };
  es.onerror = async () => {
    setConn('off');
    const r = await fetch('/api/state', { headers: { authorization: 'Bearer ' + token } }).catch(() => null);
    if (r && r.status === 401) unlinked('This device was unlinked on the desktop.');
  };
  showTab(tab);
}
async function cmd(type, extra) {
  try {
    const r = await fetch('/api/command', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ type, ...(extra || {}) }) });
    if (r.status === 401) return unlinked('This device was unlinked on the desktop.');
    if (!r.ok) return toast('That did not work');
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(10); // haptic tap
  } catch { toast('Not connected to Scripty'); }
}

// ---------- Android app self-update ----------
const app = () => window.ScriptyApp || null; // only present inside the Scripty Remote Android app
function showUpdate(s) {
  $('#upd').classList.remove('hidden');
  $('#upd-msg').textContent = s.message || '';
  $('#upd-bar').style.width = Math.max(0, Math.min(100, s.percent || 0)) + '%';
  const finished = ['error', 'current', 'done'].includes(s.state);
  $('#upd-title').textContent = s.state === 'done' ? 'Scripty Remote updated' : s.state === 'error' ? 'Update didn’t finish' : s.state === 'current' ? 'Already up to date' : 'Updating Scripty Remote';
  $('#upd-close').classList.toggle('hidden', !finished);
  if (s.state === 'done') setTimeout(() => $('#upd').classList.add('hidden'), 3500);
}
window.onAppUpdate = showUpdate; // called by the Android app with progress
function startAppUpdate(v) {
  if (!v || !/^[0-9a-f]{64}$/.test(v.sha256 || '')) return;
  if (!app()) { toast('A new Android app (' + v.versionName + ') is ready on the PC.'); return; }
  if (v.versionCode <= app().versionCode()) { showUpdate({ state: 'current', message: 'This phone already has version ' + v.versionName + '.', percent: 100 }); return; }
  showUpdate({ state: 'starting', message: 'Version ' + v.versionName + ' is on its way from your PC…', percent: 0 });
  app().update(v.sha256, v.versionCode);
}
async function checkAppUpdate() {
  try {
    const r = await fetch('/api/app-update', { headers: { authorization: 'Bearer ' + token } });
    if (r.status === 401) return unlinked('This device was unlinked on the desktop.');
    if (!r.ok) return toast('No app update is available on the PC.');
    startAppUpdate(await r.json());
  } catch { toast('Not connected to Scripty'); }
}

// ---------- sound (desktop or on this device) ----------
function playSound(id) {
  if (playHere && Sound.has(id)) Sound.play(id); else cmd('play-sound', { id });
}
function playCue(label) {
  if (playHere) { if (!Sound.playCue(label, [], null)) toast('No built-in sound matches “' + label + '”'); }
  else cmd('play-cue', { label });
}

// ---------- tabs ----------
const TABS = {
  control: () => '<section class="card" id="c-now"></section>' +
    '<div class="grid2"><button class="big primary" id="b-gen"></button><button class="big" id="b-read"></button>' +
    '<button class="big" id="b-mode"></button><button class="big" data-cmd="snapshot">Save snapshot</button></div>' +
    '<section class="card"><h3>Desktop teleprompter</h3><div class="grid3">' +
      '<button class="btn" data-cmd="prompter-open">Open</button><button class="btn primary" id="b-pr"></button><button class="btn" data-cmd="prompter-close">Close</button>' +
      '<button class="btn" data-cmd="prompter-speed" data-delta="-10">Slower</button><div class="btn" id="c-speed" style="text-align:center"></div><button class="btn" data-cmd="prompter-speed" data-delta="10">Faster</button>' +
      '<button class="btn" data-cmd="prompter-scroll" data-delta="-260">▲ Back</button><button class="btn" data-cmd="stop-sounds">■ Sounds</button><button class="btn" data-cmd="prompter-scroll" data-delta="260">▼ Ahead</button>' +
    '</div></section><section class="card" id="c-live"></section>',
  sounds: () => '<section class="card"><div class="row between"><h3>Play sounds on</h3><button class="btn" data-cmd="stop-sounds">■ Stop</button></div>' +
      '<div class="seg"><button id="here-desk">Desktop</button><button id="here-phone">This device</button></div></section>' +
    '<section class="card"><h3>Cues in this script</h3><div id="s-cues" class="sounds"></div></section>' +
    '<section class="card" id="s-lib-card"><h3>My library (plays on desktop)</h3><div id="s-lib" class="sounds"></div></section>' +
    '<section class="card"><h3>Sound board</h3><div id="s-board"></div></section>',
  script: () => '<div class="grid2"><button class="big primary" data-cmd="read" data-from="0">▶ Table read</button><button class="big" id="b-local-pr">Teleprompter here</button></div>' +
    '<section class="card"><div id="sc-text" class="script"></div></section>',
  assist: () => '<section class="card"><h3>Quick edits</h3><p class="muted" style="margin:0">Applies to the text selected on the desktop, or the whole script.</p><div id="a-actions" class="grid3"></div></section>' +
    '<section class="card"><h3>Tell the AI what to change</h3><textarea id="a-text" rows="3" placeholder="e.g. Make it funnier and add a twist at the end"></textarea><button class="btn primary" id="a-go">Apply on desktop</button></section>' +
    '<section class="card"><h3>Extras</h3><div id="a-tools" class="grid2"></div></section><section class="card" id="a-result"></section>',
  projects: () => '<section class="card"><h3>New script</h3><select id="p-type"></select><button class="btn primary" id="p-new">Create on desktop</button></section>' +
    '<section class="card"><h3>Projects</h3><div id="p-list" class="row" style="flex-direction:column;gap:8px"></div></section>' +
    '<section class="card"><h3>This device</h3><p class="muted" style="margin:0">Linked to Scripty on your computer. Unlinking removes access until you pair again.</p>' +
      (app() ? '<p class="muted" style="margin:0">Scripty Remote app, version code ' + esc(app().versionCode()) + '</p><button class="btn" id="check-update">Check for app update</button>' : '') +
      '<button class="btn" id="unlink">Unlink this device</button></section>',
};
function showTab(t) {
  tab = TABS[t] ? t : 'control';
  store.set('scripty.tab', tab);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#content').innerHTML = TABS[tab]();
  lastContent = null;
  if (tab === 'sounds') renderBoard();
  update();
  window.scrollTo(0, 0);
}

// ---------- live updates (only dynamic parts, so inputs keep focus) ----------
function update() {
  $('#h-title').textContent = st.title || 'Scripty';
  $('#h-sub').textContent = [st.type, st.engine].filter(Boolean).join(' · ');
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  if (tab === 'control') {
    const pct = st.target ? Math.min(100, st.seconds / st.target * 100) : 0;
    set('c-now', '<div class="row between"><div class="time">' + fmt(st.seconds) + ' <small>/ ' + fmt(st.target) + '</small></div>' +
      (st.generating ? '<span class="pill live">AI writing…</span>' : st.reading ? '<span class="pill live">Reading</span>' : '<span class="pill">' + (st.words || 0) + ' words</span>') + '</div>' +
      '<div class="meter ' + (st.target && st.seconds > st.target * 1.1 ? 'over' : '') + '"><i style="width:' + pct + '%"></i></div>' +
      (st.readingNow ? '<div class="muted">▶ ' + esc(st.readingNow.slice(0, 160)) + '</div>' : ''));
    const g = $('#b-gen'); if (g) { g.className = 'big ' + (st.busy ? 'stop' : 'primary'); g.textContent = st.busy ? '■ Stop AI' : '✦ Generate'; }
    const r = $('#b-read'); if (r) { r.className = 'big' + (st.reading ? ' on' : ''); r.textContent = st.reading ? '■ Stop reading' : '▶ Table read'; }
    const m = $('#b-mode'); if (m) m.textContent = st.editorMode === 'perform' ? 'Switch to Write' : 'Switch to Perform';
    const pr = st.prompter || {};
    const p = $('#b-pr'); if (p) p.textContent = pr.playing ? '❚❚ Pause' : '▶ Play';
    set('c-speed', 'Speed ' + (pr.speed || '—'));
    set('c-live', st.live ? '<h3>' + esc(st.live.name) + ' · ' + st.live.words + ' words</h3><div class="live-text">' + esc(st.live.tail) + '</div>'
      : '<h3>AI output</h3><div class="muted">Nothing running. Press Generate to write from the desktop brief.</div>');
    const lt = document.querySelector('#c-live .live-text'); if (lt) lt.scrollTop = lt.scrollHeight;
  }
  if (tab === 'sounds') {
    $('#here-desk').classList.toggle('active', !playHere); $('#here-phone').classList.toggle('active', playHere);
    set('s-cues', (st.cues || []).length ? st.cues.map(c => '<button class="snd" data-cue="' + esc(c.label) + '"><span class="pl">▶</span><span><b>' + esc(c.label) + '</b><small>' + esc(c.match || 'no match') + '</small></span></button>').join('')
      : '<div class="muted">No [SFX: …] cues in the current script.</div>');
    $('#s-lib-card').classList.toggle('hidden', !(st.library || []).length);
    set('s-lib', (st.library || []).map(s => '<button class="snd" data-desk-sound="' + esc(s.id) + '"><span class="pl">▶</span><span><b>' + esc(s.name) + '</b></span></button>').join(''));
  }
  if (tab === 'script' && st.content !== lastContent) { lastContent = st.content; set('sc-text', renderScript(st.content || '')); }
  if (tab === 'assist') {
    const a = $('#a-actions'); if (a && !a.children.length && st.assist) a.innerHTML = st.assist.map(x => '<button class="btn" data-cmd="assist" data-k="' + esc(x.k) + '">' + esc(x.label) + '</button>').join('');
    const t = $('#a-tools'); if (t && !t.children.length && st.tools) t.innerHTML = st.tools.map(x => '<button class="btn" data-cmd="tool" data-k="' + esc(x.k) + '">' + esc(x.label) + '</button>').join('');
    set('a-result', st.live ? '<h3>' + esc(st.live.name) + '</h3><div class="live-text">' + esc(st.live.tail) + '</div>'
      : st.toolResult ? '<h3>' + esc(st.toolResult.title) + '</h3><div class="live-text">' + esc(st.toolResult.text) + '</div>' : '<h3>Results</h3><div class="muted">Extras like titles or the script doctor show up here.</div>');
  }
  if (tab === 'projects') {
    const sel = $('#p-type'); if (sel && !sel.options.length && st.types) sel.innerHTML = st.types.map(x => '<option value="' + esc(x.k) + '">' + esc(x.label) + '</option>').join('');
    set('p-list', (st.projects || []).map(p => '<button class="proj' + (p.id === st.projectId ? ' cur' : '') + '" data-project="' + esc(p.id) + '"><b>' + esc(p.title || 'Untitled') + '</b><small>' + esc(p.type) + ' · ' + (p.words || 0) + ' words</small></button>').join('') || '<div class="muted">No projects yet.</div>');
  }
}
function renderScript(text) {
  if (!text.trim()) return '<div class="muted">The desktop script is empty.</div>';
  return text.split(/\r?\n/).map(raw => {
    const line = raw.trim();
    if (!line) return '';
    if (/^#{1,6}\s/.test(line) || /^(INT[./ ]|EXT[./ ])/i.test(line)) return '<div class="hd">' + esc(line.replace(/^#+\s*/, '')) + '</div>';
    let out = '', last = 0;
    for (const c of K.parseCues(line)) {
      out += fmtText(line.slice(last, c.start));
      out += c.kind === 'pause' ? '<span class="cue" style="opacity:.6">pause ' + c.seconds + 's</span>' : '<button class="cue" data-cue="' + esc(c.label) + '">' + esc(c.label) + '</button>';
      last = c.end;
    }
    out += fmtText(line.slice(last));
    return '<div class="ln">' + out + '</div>';
  }).join('');
}
function fmtText(s) {
  return esc(s).replace(/^(\s*)([A-Z][A-Za-z0-9'. -]{0,28}?):/, '$1<span class="spk">$2</span>').replace(/\([^)]*\)/g, m => '<span class="par">' + m + '</span>');
}
function renderBoard() {
  const cats = {};
  for (const s of K.BUILTIN_SOUNDS) (cats[s.category] = cats[s.category] || []).push(s);
  $('#s-board').innerHTML = Object.entries(cats).map(([c, list]) => '<div class="cat">' + esc(c) + '</div><div class="sounds">' +
    list.map(s => '<button class="snd" data-sound="' + s.id + '"><span class="pl">▶</span><span><b>' + esc(s.name) + '</b></span></button>').join('') + '</div>').join('');
}

// ---------- phone teleprompter (runs locally) ----------
const lp = { playing: false, pos: 0, last: 0, speed: 40 };
function openLocalPrompter() {
  const text = (st.content || '').replace(/\[(SFX|SOUND|FX|MUSIC|AMBIENCE|AMBIENT|PAUSE|BEAT|BREATH)\b[^\]]*\]/gi, '').replace(/^#+\s*/gm, '');
  if (!text.trim()) return toast('The script is empty.');
  $('#pr-text').textContent = text;
  $('#prompter').classList.remove('hidden');
  $('#pr-scroll').scrollTop = 0; lp.pos = 0;
}
function toggleLocalPrompter() {
  lp.playing = !lp.playing;
  $('#pr-play').textContent = lp.playing ? 'Pause' : 'Start';
  if (!lp.playing) return;
  const sc = $('#pr-scroll'); lp.pos = sc.scrollTop; lp.last = performance.now();
  const step = now => {
    if (!lp.playing) return;
    lp.pos += lp.speed * (now - lp.last) / 1000; lp.last = now; sc.scrollTop = lp.pos;
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) return toggleLocalPrompter();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- events ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-cue]');
  if (!t) return;
  if (t.dataset.tab) return showTab(t.dataset.tab);
  if (t.dataset.cue != null) return playCue(t.dataset.cue);
  if (t.dataset.sound) return playSound(t.dataset.sound);
  if (t.dataset.deskSound) return cmd('play-sound', { id: t.dataset.deskSound });
  if (t.dataset.project) return cmd('open-project', { id: t.dataset.project });
  if (t.dataset.cmd) {
    const extra = {};
    if (t.dataset.delta) extra.delta = Number(t.dataset.delta);
    if (t.dataset.from) extra.from = Number(t.dataset.from);
    if (t.dataset.k) extra.k = t.dataset.k;
    return cmd(t.dataset.cmd, extra);
  }
  switch (t.id) {
    case 'pair-go': {
      const code = $('#pair-code').value.replace(/\D/g, '');
      if (code.length !== 6) { $('#pair-msg').textContent = 'Enter the 6-digit code shown on the desktop.'; return; }
      pair({ code }).then(connect).catch(err => { $('#pair-msg').textContent = err.message; });
      return;
    }
    case 'b-gen': return cmd(st.busy ? 'stop-generate' : 'generate');
    case 'b-read': return cmd(st.reading ? 'read-stop' : 'read', { from: 0 });
    case 'b-mode': return cmd('editor-mode', { mode: st.editorMode === 'perform' ? 'edit' : 'perform' });
    case 'b-pr': return cmd('prompter-toggle');
    case 'here-desk': playHere = false; store.set('scripty.playHere', '0'); return update();
    case 'here-phone': playHere = true; store.set('scripty.playHere', '1'); return update();
    case 'a-go': { const v = $('#a-text').value.trim(); if (!v) return toast('Describe the change first'); cmd('assist-custom', { text: v }); $('#a-text').value = ''; return; }
    case 'p-new': return cmd('new-project', { k: $('#p-type').value });
    case 'check-update': return checkAppUpdate();
    case 'upd-close': return $('#upd').classList.add('hidden');
    case 'unlink': return unlinked('Unlinked. Enter a new code from the desktop to link again.');
    case 'b-local-pr': return openLocalPrompter();
    case 'pr-play': return toggleLocalPrompter();
    case 'pr-slow': lp.speed = Math.max(5, lp.speed - 5); $('#pr-speed').textContent = lp.speed; return;
    case 'pr-fast': lp.speed = Math.min(200, lp.speed + 5); $('#pr-speed').textContent = lp.speed; return;
    case 'pr-close': if (lp.playing) toggleLocalPrompter(); $('#prompter').classList.add('hidden'); return;
  }
});
$('#pair-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#pair-go').click(); });

// ---------- boot ----------
// In an Android browser (not already inside the app), offer the Android app if this PC has it to give.
if (/Android/i.test(navigator.userAgent) && !/ScriptyRemoteApp/.test(navigator.userAgent)) {
  fetch('/scripty-remote.apk', { method: 'HEAD' }).then(r => { if (r.ok) $('#get-app').classList.remove('hidden'); }).catch(() => {});
}
(async function boot() {
  const qrToken = new URLSearchParams(location.search).get('pair');
  if (qrToken) {
    history.replaceState(null, '', '/'); // keep the one-time link out of history
    try { $('#pair-name').value = deviceName(); await pair({ pairToken: qrToken }); toast('Linked!'); }
    catch (err) { if (!token) return showPair(err.message + ' Ask for a new code on the desktop.'); }
  }
  if (token) connect(); else showPair();
})();
