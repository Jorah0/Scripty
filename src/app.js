/* Scripty renderer: UI, AI orchestration (single + Writers' Room), editor tools, performance tools. */
'use strict';
const K = window.ScriptKit;
const api = window.scripty;

// ================= utilities =================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => crypto.randomUUID();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const cleanErr = e => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function timeAgo(t) {
  const s = (Date.now() - (t || 0)) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return new Date(t).toLocaleDateString();
}
function cleanOutput(t) {
  t = String(t || '').trim();
  const m = /^```[\w-]*\n([\s\S]*?)\n?```$/.exec(t);
  return m ? m[1].trim() : t;
}

const ICONS = {
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
  wave: '<path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  wand: '<path d="m15 4 5 5M3 21l12-12M14 7l3 3"/><path d="M20 15v4M18 17h4M8 2v4M6 4h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  timer: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M3 21v-5h5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0M12 17v5"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM20 17v5H6.5A2.5 2.5 0 0 1 4 19.5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 17h8M10 13h4"/>',
  'panel-left': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  'panel-right': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.6 5.6 0 0 0 22 10c0-4.4-4.5-8-10-8z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8z"/>',
  headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  film: '<rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  gamepad: '<path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/><rect x="2" y="6" width="20" height="12" rx="2"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
};
const ic = name => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
function hydrateIcons(root) { $$('i[data-icon]', root).forEach(i => { i.outerHTML = ic(i.dataset.icon); }); }

const GROUP_ICON = { Video: 'video', Audio: 'headphones', Screen: 'film', Marketing: 'megaphone', Live: 'mic', Interactive: 'gamepad', Written: 'book' };
const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Polish', 'Russian', 'Ukrainian', 'Turkish', 'Arabic', 'Hindi',
  'Bengali', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Indonesian', 'Vietnamese', 'Thai', 'Filipino', 'Swedish', 'Greek', 'Hebrew'];
const POVS = ['', 'First person (I)', 'Second person (you)', 'Third person', 'Mixed'];
const RATINGS = ['', 'Family-friendly', 'Teen', 'Mature'];
const ACCENTS = { violet: ['#8b5cf6', '#ec4899'], blue: ['#3b82f6', '#06b6d4'], emerald: ['#10b981', '#84cc16'], amber: ['#f59e0b', '#ef4444'], rose: ['#f43f5e', '#f97316'] };
const FONTS = { sans: ['Sans', 'var(--ui)'], serif: ['Serif', 'Georgia, Cambria, "Times New Roman", serif'], mono: ['Mono', '"Cascadia Code", Consolas, monospace'], courier: ['Courier (screenplay)', '"Courier Prime", "Courier New", Courier, monospace'] };
const SPK_COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#84cc16', '#f97316', '#14b8a6'];
const NON_SPOKEN = /^(VISUALS?|B-ROLL|BROLL|ON-SCREEN|ON SCREEN|TEXT|NOTES?|CAMERA|SHOT|OVERLAY|GRAPHICS?|CAPTION|SUPER|LOWER THIRD)\s*:/i;
const STRATEGIES = {
  synthesize: ['Draft & Merge', 'Every AI writes a draft at the same time, then the lead AI merges the best parts into one script.'],
  relay: ['Relay', 'Outline → Draft → Critique → Polish. Each stage is handled by the AI you assign.'],
  judge: ['Compete & Judge', 'Every AI writes a draft; a judge AI scores them and picks the winner. You can still use any draft.'],
};
const GEN_LABEL = { create: 'Generate script', revise: 'Revise script', fix: 'Fix & polish', continue: 'Continue writing', adapt: 'Adapt to script' };

// ================= state =================
const state = {
  settings: null, providers: {}, info: {}, project: null, sfxLib: [], view: 'studio', editorMode: 'edit', tool: 'runs',
  analysis: K.analyzeScript('', 150), liveRuns: new Set(), genRun: null, readSeq: [], reading: false, readToken: null, voices: [], dirty: false,
};
const brief = () => state.project.brief;
const editor = () => $('#editor');
const wpm = () => Number(brief().wpm) || K.typeOf(brief().type).wpm;
const targetPlan = () => K.lengthPlan({ type: brief().type, value: brief().length.value, unit: brief().length.unit, wpm: brief().wpm });
const pname = id => (state.providers[id] && state.providers[id].label) || id;
const pcolor = id => (state.providers[id] && state.providers[id].color) || '#888';
const defModel = id => (state.providers[id] && state.providers[id].model) || '';

function defaultEngine() {
  return {
    mode: 'single', single: { provider: 'anthropic', model: '' }, strategy: 'synthesize',
    room: [{ provider: 'anthropic', model: '' }, { provider: 'openai', model: '' }, { provider: 'gemini', model: '' }],
    lead: { provider: 'anthropic', model: '' },
    relay: { outline: { provider: 'gemini', model: '' }, draft: { provider: 'anthropic', model: '' }, critique: { provider: 'openai', model: '' }, polish: { provider: 'anthropic', model: '' } },
  };
}
function withDefaults(s) {
  const e = defaultEngine();
  s.engine = { ...e, ...(s.engine || {}), relay: { ...e.relay, ...((s.engine || {}).relay || {}) } };
  if (s.autoApply == null) s.autoApply = true;
  if (s.sfxVary == null) s.sfxVary = 0.5;
  s.hotkeys = { next: 'F9', replay: 'F8', stop: 'F10', global: false, ...(s.hotkeys || {}) };
  return s;
}

function newProject(type) {
  type = K.SCRIPT_TYPES[type] ? type : 'youtube';
  const t = K.typeOf(type);
  return {
    id: uid(), title: 'Untitled script', createdAt: Date.now(), updatedAt: Date.now(), content: '', snapshots: [], runs: [], voices: {}, sfxOverrides: {},
    brief: {
      mode: 'create', type, title: '', ideas: '', focus: '', audience: '', tones: [], tags: [], pov: '', rating: '', language: 'English',
      people: 1, characters: [{ name: '', notes: '' }], length: { value: t.defaultLength[0], unit: t.defaultLength[1] }, wpm: 0, options: [],
      include: { sfx: true, music: false, visuals: false, timestamps: false, pauses: ['asmr', 'meditation'].includes(type) },
      extra: '', useEditorAsSource: true, source: '',
    },
  };
}
function normalizeProject(p) {
  const d = newProject(p && p.brief && p.brief.type);
  const b = (p && p.brief) || {};
  const SAFE = /^[\w-]{1,64}$/;
  const safeRun = r => r && SAFE.test(r.id) && Array.isArray(r.lanes) && r.lanes.every(l => l && SAFE.test(l.id) && SAFE.test(String(l.provider || '')))
    && [r.final, r.activeLane, r.winner, r.applied].every(x => x == null || SAFE.test(x));
  const fixRun = r => r.status === 'running' ? { ...r, status: 'cancelled', lanes: (r.lanes || []).map(l => ['running', 'waiting'].includes(l.status) ? { ...l, status: 'cancelled' } : l) } : r;
  return {
    ...d, ...p,
    brief: { ...d.brief, ...b, length: { ...d.brief.length, ...(b.length || {}) }, include: { ...d.brief.include, ...(b.include || {}) },
      characters: Array.isArray(b.characters) && b.characters.length ? b.characters : d.brief.characters },
    snapshots: (p.snapshots || []).filter(s => s && SAFE.test(s.id) && typeof s.content === 'string').map(s => ({ ...s, words: Number(s.words) || K.countWords(s.content), t: Number(s.t) || Date.now(), label: String(s.label || 'Snapshot') })),
    runs: (p.runs || []).filter(safeRun).map(fixRun), voices: p.voices || {}, sfxOverrides: p.sfxOverrides || {},
  };
}
function welcomeProject() {
  const p = newProject('youtube');
  p.title = 'Welcome to Scripty';
  p.brief.people = 2;
  p.brief.characters = [{ name: 'Alex', notes: 'curious host' }, { name: 'Sam', notes: 'skeptical co-host' }];
  p.brief.tones = ['Conversational', 'Funny'];
  p.brief.include.music = true;
  p.brief.include.timestamps = true;
  p.content = [
    '## [00:00] Cold Open',
    '[MUSIC: upbeat intro sting]',
    'ALEX: What if your next script could practically write itself — and still sound like you?',
    'SAM: (laughing) You say that about every app.',
    '[SFX: whoosh]',
    '',
    '## [00:15] The Hook',
    'ALEX: Today three different AIs get the same brief. One judge. One winner.',
    'SAM: And the loser reads the sponsor segment in an ASMR whisper.',
    '[SFX: drum roll]',
    'VISUAL: Split screen of three AI logos racing each other.',
    '',
    '## [00:45] Round One',
    'ALEX: First up, a cozy rainy-night story.',
    '[SFX: rain on the window]',
    '[PAUSE 2s]',
    'SAM: (whispering) Okay. I am already sleepy.',
    '[SFX: page turn]',
    'ALEX: Switch to Perform mode and click any sound chip to hear it. Then hit Table read.',
    '[SFX: door knock]',
    'SAM: Who is there?',
    '[SFX: applause]',
  ].join('\n');
  return p;
}

// ================= persistence =================
const saveSettings = debounce(() => api.setSettings(state.settings), 400);
const saveSoon = debounce(() => saveNow(), 800);
function markDirty() { state.dirty = true; const s = $('#save-state'); s.textContent = 'Unsaved'; s.classList.add('dirty'); saveSoon(); }
async function saveNow() {
  if (!state.project) return;
  const p = state.project;
  p.content = editor().value;
  p.title = $('#project-title').value.trim() || 'Untitled script';
  p.updatedAt = Date.now();
  try {
    await api.saveProject(p);
    state.dirty = false;
    const s = $('#save-state'); s.textContent = 'Saved'; s.classList.remove('dirty');
  } catch (e) { toast('Save failed: ' + cleanErr(e), 'err'); }
}

// ================= toasts, modals, menus =================
function toast(msg, kind, action) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button>' + esc(action.label) + '</button>' : '');
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.remove(); };
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 4000);
}
function openModal({ title, body, actions = [], wide }) {
  const root = $('#modal-root');
  root.innerHTML = '<div class="backdrop"><div class="modal ' + (wide ? 'wide' : '') + '" role="dialog" aria-label="' + esc(title) + '"><div class="modal-head"><h2>' + esc(title) +
    '</h2><button class="icon-btn" data-close style="margin-left:auto">' + ic('x') + '</button></div><div class="modal-body">' + body + '</div><div class="modal-foot">' +
    actions.map((a, i) => '<button class="btn ' + (a.primary ? 'primary' : '') + (a.danger ? ' danger' : '') + '" data-mi="' + i + '">' + esc(a.label) + '</button>').join('') + '</div></div></div>';
  const close = () => { root.innerHTML = ''; };
  root.querySelector('.backdrop').addEventListener('mousedown', e => { if (e.target.classList.contains('backdrop')) close(); });
  root.querySelector('[data-close]').onclick = close;
  root.querySelectorAll('[data-mi]').forEach(b => { b.onclick = async () => { const a = actions[+b.dataset.mi]; const r = a.onClick ? await a.onClick() : undefined; if (r !== false) close(); }; });
  hydrateIcons(root);
  return close;
}
function confirmModal(text, okLabel) {
  return new Promise(res => openModal({ title: 'Are you sure?', body: '<p>' + esc(text) + '</p>', actions: [{ label: 'Cancel', onClick: () => res(false) }, { label: okLabel || 'Confirm', primary: true, danger: true, onClick: () => res(true) }] }));
}
function closeMenu() { $('#menu-root').innerHTML = ''; document.removeEventListener('mousedown', menuOutside); }
function menuOutside(e) { if (!e.target.closest('.menu')) closeMenu(); }
function openMenu(anchor, items) {
  closeMenu();
  const root = $('#menu-root');
  root.innerHTML = '<div class="menu">' + items.map((it, i) => it === '-' ? '<hr>' : '<button data-mi="' + i + '">' + (it.icon ? ic(it.icon) : '') + esc(it.label) + (it.hint ? '<span>' + esc(it.hint) + '</span>' : '') + '</button>').join('') + '</div>';
  const m = root.firstChild, r = anchor.getBoundingClientRect();
  m.style.left = Math.min(r.left, innerWidth - m.offsetWidth - 10) + 'px';
  m.style.top = (r.bottom + m.offsetHeight + 8 > innerHeight ? r.top - m.offsetHeight - 6 : r.bottom + 6) + 'px';
  m.querySelectorAll('[data-mi]').forEach(b => { b.onclick = () => { closeMenu(); items[+b.dataset.mi].onClick(); }; });
  setTimeout(() => document.addEventListener('mousedown', menuOutside), 0);
}

// ================= settings & theme =================
function resolvedTheme() { const t = state.settings.theme; return t === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t; }
function applySettings() {
  const s = state.settings, root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  root.dataset.accent = s.accent || 'violet';
  root.style.setProperty('--editor-font', (FONTS[s.editorFont] || FONTS.sans)[1]);
  root.style.setProperty('--editor-size', (Number(s.editorSize) || 16) + 'px');
  Sound.setVolume(s.sfxVolume);
  Sound.setVariation(s.sfxVary);
  $('#read-rate').value = s.readRate || 1;
  $('#read-sfx').checked = !!s.readSfx;
  $('#view-studio').classList.toggle('no-brief', !!s.hideBrief);
  $('#view-studio').classList.toggle('no-tools', !!s.hideTools);
  const tbtn = $('[data-action="toggle-theme"]');
  if (tbtn) tbtn.innerHTML = ic(resolvedTheme() === 'dark' ? 'sun' : 'moon');
}
function setTheme(t) { state.settings.theme = t; applySettings(); api.setTheme(t); saveSettings(); if (state.view === 'settings') renderSettings(); }

// ================= data binding =================
function getPath(o, p) { return p.split('.').reduce((x, k) => (x == null ? x : x[k]), o); }
function setPath(o, p, v) {
  const ks = p.split('.');
  let x = o;
  for (let i = 0; i < ks.length - 1; i++) { if (x[ks[i]] == null) x[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; x = x[ks[i]]; }
  x[ks[ks.length - 1]] = v;
}
function onBind(el) {
  const path = el.dataset.bind;
  const isS = path.startsWith('S:');
  const target = isS ? state.settings : state.project;
  const p = isS ? path.slice(2) : path;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.type === 'number') v = v === '' ? 0 : Number(v);
  if (el.dataset.type === 'bool') v = !!v;
  setPath(target, p, v);
  if (p.endsWith('.provider')) setPath(target, p.replace(/\.provider$/, '.model'), '');
  if (isS) saveSettings(); else markDirty();
  if (p === 'brief.type') onTypeChanged();
  if (p.startsWith('brief.length') || p === 'brief.wpm') { renderLengthCalc(); refreshAnalysis(); }
  if (el.dataset.apply != null) applySettings();
  if (p === 'temperature') { const o = $('#temp-out'); if (o) o.textContent = v; }
  if (p === 'sfxVolume') Sound.setVolume(v);
  if (el.dataset.rerender != null) renderBrief();
}
function onTypeChanged() {
  const b = brief(), t = K.typeOf(b.type);
  b.length = { value: t.defaultLength[0], unit: t.defaultLength[1] };
  b.wpm = 0;
  b.options = b.options.filter(o => t.options.includes(o));
  if (['asmr', 'meditation'].includes(b.type)) b.include.pauses = true;
  renderBrief(); refreshAnalysis(); renderTitleBadge();
  toast('Length set to a typical ' + t.label + ': ' + t.defaultLength[0] + ' ' + t.defaultLength[1]);
}

// ================= brief panel =================
function typeOptions(sel) {
  const groups = {};
  for (const [id, t] of Object.entries(K.SCRIPT_TYPES)) (groups[t.group] = groups[t.group] || []).push([id, t]);
  return Object.entries(groups).map(([g, list]) => '<optgroup label="' + g + '">' + list.map(([id, t]) => '<option value="' + id + '"' + (id === sel ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') + '</optgroup>').join('');
}
function opts(list, sel, labels) { return list.map((v, i) => '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(labels ? labels[i] : (v || '—')) + '</option>').join(''); }
function providerOptions(sel) {
  return Object.values(state.providers).map(p => '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.label) + '</option>').join('');
}
/** A model text box with a ▾ button that opens the full, scrollable, searchable model list. */
function modelCombo(inputHtml, provider) {
  return '<div class="combo">' + inputHtml + '<button class="combo-btn" data-action="model-menu" data-provider="' + esc(provider) + '" title="Show all models" aria-label="Show all models">▾</button></div>';
}
function openModelMenu(btn) {
  const id = btn.dataset.provider, input = btn.parentElement.querySelector('input');
  closeMenu();
  const root = $('#menu-root');
  root.innerHTML = '<div class="menu model-menu"><input class="input" id="mm-q" placeholder="Search models…" spellcheck="false" autocomplete="off">' +
    '<div class="mm-list" id="mm-list"></div><div class="mm-foot"><span class="hint" id="mm-count"></span>' +
    '<button class="icon-btn" id="mm-refresh" title="Fetch the latest list from the provider">' + ic('refresh') + 'Refresh</button></div></div>';
  const m = root.firstChild, r = btn.parentElement.getBoundingClientRect();
  m.style.width = Math.max(r.width, 300) + 'px';
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  const below = innerHeight - r.bottom;
  m.style.top = (below < 300 && r.top > below ? Math.max(8, r.top - m.offsetHeight - 6) : r.bottom + 6) + 'px';
  let status = '';
  const all = () => [...new Set([state.providers[id].model, ...(state.providers[id].models || [])].filter(Boolean))];
  const draw = () => {
    const q = $('#mm-q').value.trim().toLowerCase(), cur = input.value.trim() || state.providers[id].model;
    const list = all().filter(x => !q || x.toLowerCase().includes(q));
    $('#mm-list').innerHTML = list.map(x => '<button class="mm-item' + (x === cur ? ' on' : '') + '" data-model="' + esc(x) + '">' + esc(x) +
        (x === state.providers[id].model ? '<span>default</span>' : '') + '</button>').join('') +
      (q && !list.includes($('#mm-q').value.trim()) ? '<button class="mm-item custom" data-model="' + esc($('#mm-q').value.trim()) + '">Use “' + esc($('#mm-q').value.trim()) + '”</button>' : '') +
      (status ? '<div class="hint mm-status">' + status + '</div>' : '');
    $('#mm-count').textContent = list.length + ' of ' + all().length + ' models';
    const on = $('#mm-list .on'); if (on && !q) on.scrollIntoView({ block: 'nearest' });
  };
  const pick = model => {
    input.value = model;
    input.dispatchEvent(new Event('input', { bubbles: true })); // runs the normal save/bind path
    closeMenu();
  };
  const refresh = async () => {
    const p = state.providers[id];
    if (!p.ready) { status = esc(p.label) + ' needs an API key before its model list can be loaded.'; return draw(); }
    status = '<span class="spinner"></span> Loading models from ' + esc(p.label) + '…'; draw();
    try { p.models = await api.models(id, p.baseUrl || undefined); renderDatalists(); status = ''; }
    catch (e) { status = esc(cleanErr(e)); }
    if (document.getElementById('mm-list')) draw();
  };
  $('#mm-q').addEventListener('input', draw);
  $('#mm-q').addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('#mm-list [data-model]'); if (f) pick(f.dataset.model); } });
  $('#mm-list').addEventListener('click', e => { const b = e.target.closest('[data-model]'); if (b) pick(b.dataset.model); });
  $('#mm-refresh').onclick = refresh;
  draw();
  $('#mm-q').focus();
  setTimeout(() => document.addEventListener('mousedown', menuOutside), 0);
  if (all().length <= 1 || !(state.providers[id].models || []).length) refresh(); // first open: fetch the full list
}
function memberRow(path, m, role, removeIdx) {
  const p = state.providers[m.provider];
  const warn = p && !p.ready ? '<div class="member-warn">' + esc(p.label) + ' needs an API key · <a href="#" data-action="goto-providers">set up</a></div>' : '';
  return '<div class="member">' + (role ? '<div class="role">' + esc(role) + '</div>' : '') +
    '<select class="input" data-bind="' + path + '.provider" data-rerender>' + providerOptions(m.provider) + '</select>' +
    modelCombo('<input class="input" data-bind="' + path + '.model" value="' + esc(m.model || '') + '" placeholder="' + esc(defModel(m.provider) || 'model') + '" spellcheck="false" title="Model (blank = provider default)">', m.provider) +
    (removeIdx != null && state.settings.engine.room.length > 1 ? '<button class="icon-btn" data-action="room-rm" data-i="' + removeIdx + '" title="Remove writer">' + ic('x') + '</button>' : '<span></span>') + warn + '</div>';
}
function engineCard() {
  const e = state.settings.engine, room = e.mode === 'room';
  let body;
  if (!room) body = memberRow('S:engine.single', e.single) + '<div class="hint">One AI writes everything. Fastest and cheapest.</div>';
  else {
    body = '<div class="field"><label>Strategy</label><select class="input" data-bind="S:engine.strategy" data-rerender>' +
      Object.entries(STRATEGIES).map(([k, [l]]) => '<option value="' + k + '"' + (e.strategy === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
      '<div class="strategy-desc">' + STRATEGIES[e.strategy][1] + '</div>';
    if (e.strategy === 'relay') body += K.RELAY_STAGES.map(s => memberRow('S:engine.relay.' + s.id, e.relay[s.id], s.label)).join('');
    else body += e.room.map((m, i) => memberRow('S:engine.room.' + i, m, 'Writer ' + (i + 1), i)).join('') +
      (e.room.length < 6 ? '<button class="btn sm ghost" data-action="room-add">' + ic('plus') + 'Add writer</button>' : '') +
      memberRow('S:engine.lead', e.lead, e.strategy === 'judge' ? 'Judge' : 'Lead (merges the drafts)');
  }
  return '<details class="card" open><summary>' + ic('cpu') + 'AI engine<span class="sum-meta">' + esc(room ? STRATEGIES[e.strategy][0] : pname(e.single.provider)) + '</span></summary><div class="card-body">' +
    '<div class="seg full"><button data-action="engine-mode" data-mode="single" class="' + (!room ? 'active' : '') + '">' + ic('zap') + 'Single AI</button>' +
    '<button data-action="engine-mode" data-mode="room" class="' + (room ? 'active' : '') + '">' + ic('users') + 'Writers\' Room</button></div>' + body + '</div></details>';
}
function sourceCard() {
  const b = brief();
  return '<details class="card" open><summary>' + ic('file') + 'Source material</summary><div class="card-body">' +
    '<div class="seg full"><button data-action="source-mode" data-v="editor" class="' + (b.useEditorAsSource ? 'active' : '') + '">Script in editor</button>' +
    '<button data-action="source-mode" data-v="paste" class="' + (!b.useEditorAsSource ? 'active' : '') + '">Paste / import</button></div>' +
    (b.useEditorAsSource ? '<div class="hint" id="source-hint">The ' + K.countWords(editor().value).toLocaleString() + ' words in the editor will be sent as the source.</div>'
      : '<textarea class="input" rows="6" data-bind="brief.source" placeholder="Paste the existing script, article, notes or transcript…">' + esc(b.source) + '</textarea>' +
        '<button class="btn sm ghost" data-action="import-source">' + ic('upload') + 'Import a file into the source</button>') + '</div></details>';
}
function renderBrief() {
  const b = brief(), t = K.typeOf(b.type);
  const scroll = $('#brief-body').scrollTop;
  const includes = [['sfx', 'Sound effect cues', '[SFX: …] lines you can click to play'], ['music', 'Music cues', '[MUSIC: …]'], ['pauses', 'Timed pauses', '[PAUSE 3s]'],
    ['visuals', 'Visual / B-roll notes', 'VISUAL: …'], ['timestamps', 'Section timestamps', '## [01:30] Section']];
  $('#brief-body').innerHTML = engineCard() +
    '<details class="card" open><summary>' + ic('file') + 'Script<span class="sum-meta">' + esc(t.label) + '</span></summary><div class="card-body">' +
      '<div class="field"><label>Task</label><div class="seg wrap">' + Object.entries(K.MODES).map(([k, m]) => '<button data-action="set-mode" data-mode="' + k + '" class="' + (b.mode === k ? 'active' : '') + '" title="' + esc(m.hint) + '">' + m.label + '</button>').join('') + '</div><div class="hint">' + esc(K.MODES[b.mode].hint) + '</div></div>' +
      '<div class="field"><label>Script type</label><select class="input" data-bind="brief.type">' + typeOptions(b.type) + '</select></div>' +
      '<div class="field"><label>Working title</label><input class="input" data-bind="brief.title" value="' + esc(b.title) + '" placeholder="Optional"></div></div></details>' +
    (b.mode !== 'create' ? sourceCard() : '') +
    '<details class="card" open><summary>' + ic('bulb') + 'Concept<span class="sum-meta"></span></summary><div class="card-body">' +
      '<div class="field"><label>Ideas / premise <span class="aside"><button class="icon-btn" data-action="brainstorm" title="Let the AI suggest ideas">' + ic('sparkles') + 'Brainstorm</button></span></label>' +
      '<textarea class="input" rows="3" data-bind="brief.ideas" placeholder="What is it about? Key points, story beats, anything…">' + esc(b.ideas) + '</textarea><div id="idea-list" class="idea-list"></div></div>' +
      '<div class="field"><label>Focus / goal</label><input class="input" data-bind="brief.focus" value="' + esc(b.focus) + '" placeholder="e.g. help viewers fall asleep · sell the course · explain black holes"></div>' +
      '<div class="field"><label>Audience</label><input class="input" data-bind="brief.audience" value="' + esc(b.audience) + '" placeholder="Who is it for?"></div></div></details>' +
    '<details class="card" open><summary>' + ic('palette') + 'Style<span class="sum-meta">' + esc(b.tones.join(', ')) + '</span></summary><div class="card-body">' +
      '<div class="field"><label>Tone</label><div class="chips">' + K.TONES.map(x => '<span class="chip ' + (b.tones.includes(x) ? 'on' : '') + '" data-action="toggle-tone" data-v="' + x + '">' + x + '</span>').join('') + '</div></div>' +
      '<div class="field"><label>Tags & keywords</label><div class="tag-input" data-action="focus-tag">' + b.tags.map((g, i) => '<span class="tag">' + esc(g) + '<button data-action="rm-tag" data-i="' + i + '" title="Remove">×</button></span>').join('') +
        '<input id="tag-in" placeholder="' + (b.tags.length ? '' : 'Type and press Enter') + '"></div></div>' +
      '<div class="three"><div class="field"><label>Point of view</label><select class="input" data-bind="brief.pov">' + opts(POVS, b.pov) + '</select></div>' +
        '<div class="field"><label>Rating</label><select class="input" data-bind="brief.rating">' + opts(RATINGS, b.rating) + '</select></div>' +
        '<div class="field"><label>Language</label><select class="input" data-bind="brief.language">' + opts(LANGUAGES, b.language) + '</select></div></div></div></details>' +
    '<details class="card" open><summary>' + ic('users') + 'Cast<span class="sum-meta">' + b.people + (b.people === 1 ? ' person' : ' people') + '</span></summary><div class="card-body">' +
      '<div class="row gap"><span class="lbl">Number of people</span><div class="stepper"><button data-action="people" data-d="-1" aria-label="Fewer">−</button><span>' + b.people + '</span><button data-action="people" data-d="1" aria-label="More">+</button></div>' +
      '<button class="icon-btn" data-action="detect-cast" title="Fill from the speakers in your script" style="margin-left:auto">' + ic('search') + 'Detect</button></div>' +
      b.characters.map((c, i) => '<div class="char-row"><input class="input" data-bind="brief.characters.' + i + '.name" value="' + esc(c.name) + '" placeholder="Name ' + (i + 1) + '"><input class="input" data-bind="brief.characters.' + i + '.notes" value="' + esc(c.notes) + '" placeholder="Role, voice, personality"></div>').join('') + '</div></details>' +
    '<details class="card" open><summary>' + ic('timer') + 'Length<span class="sum-meta" id="len-meta"></span></summary><div class="card-body">' +
      '<div class="three"><div class="field"><label>Target</label><input class="input" type="number" min="0" step="any" data-bind="brief.length.value" data-type="number" value="' + esc(b.length.value) + '"></div>' +
      '<div class="field"><label>Unit</label><select class="input" data-bind="brief.length.unit">' + opts(K.UNITS, b.length.unit) + '</select></div>' +
      '<div class="field"><label title="Speaking rate, words per minute">WPM</label><input class="input" type="number" min="40" max="320" data-bind="brief.wpm" data-type="number" value="' + (b.wpm || '') + '" placeholder="' + t.wpm + '"></div></div>' +
      '<div class="length-out" id="len-out"></div><div class="advice" id="len-advice"></div></div></details>' +
    '<details class="card" open><summary>' + ic('list') + 'Format & elements<span class="sum-meta"></span></summary><div class="card-body">' +
      '<div class="field"><label>' + esc(t.label) + ' elements</label><div class="chips">' + t.options.map(o => '<span class="chip ' + (b.options.includes(o) ? 'on' : '') + '" data-action="toggle-option" data-v="' + esc(o) + '">' + esc(o) + '</span>').join('') + '</div></div>' +
      includes.map(([k, l, h]) => '<div class="switch-row"><div><div>' + l + '</div><div class="hint">' + esc(h) + '</div></div><label class="switch"><input type="checkbox" data-bind="brief.include.' + k + '" data-type="bool"' + (b.include[k] ? ' checked' : '') + '><span></span></label></div>').join('') + '</div></details>' +
    '<details class="card"' + (b.extra ? ' open' : '') + '><summary>' + ic('msg') + 'Extra instructions<span class="sum-meta"></span></summary><div class="card-body"><textarea class="input" rows="4" data-bind="brief.extra" placeholder="Must-include lines, things to avoid, references, style notes…">' + esc(b.extra) + '</textarea></div></details>';
  $('#brief-body').scrollTop = scroll;
  renderLengthCalc();
  updateGenerateBtn();
}
function renderLengthCalc() {
  const b = brief(), plan = targetPlan(), t = K.typeOf(b.type);
  const out = $('#len-out');
  if (!out) return;
  out.innerHTML = '<b>≈ ' + plan.words.toLocaleString() + '</b> words <span class="muted">· ' + K.fmtTime(plan.seconds) + (t.reading ? ' reading' : ' spoken') + ' at ' + plan.wpm + ' wpm</span>';
  $('#len-meta').textContent = K.fmtTime(plan.seconds);
  $('#len-advice').innerHTML = K.adviseLength(b.type, plan.seconds).map(a => '<div class="' + a.level + '">' + esc(a.text) + '</div>').join('');
}
function renderTitleBadge() { $('#type-badge').textContent = K.typeOf(brief().type).label; }
function updateGenerateBtn() {
  const btn = $('#generate-btn');
  if (state.genRun) { btn.className = 'btn stop grow'; btn.innerHTML = ic('stop') + '<span>Stop</span>'; return; }
  const e = state.settings.engine;
  const n = e.mode === 'room' ? (e.strategy === 'relay' ? 4 : e.room.length + 1) : 1;
  btn.className = 'btn primary grow';
  btn.innerHTML = ic(e.mode === 'room' ? 'users' : 'sparkles') + '<span>' + GEN_LABEL[brief().mode] + (n > 1 ? ' · ' + n + ' AI steps' : '') + '</span>';
}

// ================= editor =================
function refreshAnalysis() {
  state.analysis = K.analyzeScript(editor().value, wpm());
  renderStatus();
  if (state.editorMode === 'perform') renderPerform();
  if (['length', 'cues'].includes(state.tool)) renderTool();
  const sh = $('#source-hint');
  if (sh) sh.textContent = 'The ' + K.countWords(editor().value).toLocaleString() + ' words in the editor will be sent as the source.';
}
const refreshSoon = debounce(refreshAnalysis, 250);
function onEditorInput() { markDirty(); refreshSoon(); }
function selectionText() { const ed = editor(); return state.editorMode === 'edit' ? ed.value.slice(ed.selectionStart, ed.selectionEnd) : ''; }
function renderStatus() {
  const a = state.analysis, plan = targetPlan();
  const pct = plan.seconds ? Math.min(100, a.seconds / plan.seconds * 100) : 0;
  const over = plan.seconds && a.seconds > plan.seconds * 1.1;
  const sel = selectionText();
  $('#statusbar').innerHTML = '<span><b>' + a.words.toLocaleString() + '</b> words</span><span><b>' + a.spokenWords.toLocaleString() + '</b> spoken</span>' +
    '<span title="Estimated runtime vs target">' + ic('timer') + ' <b>' + K.fmtTime(a.seconds) + '</b> / ' + K.fmtTime(plan.seconds) + '</span>' +
    '<div class="meter ' + (over ? 'over' : '') + '" title="' + Math.round(a.seconds / (plan.seconds || 1) * 100) + '% of target"><i style="width:' + pct + '%"></i></div>' +
    '<span>' + Object.keys(a.speakers).length + ' speakers</span><span>' + a.cues.filter(c => c.kind !== 'pause').length + ' cues</span>' +
    (sel.trim() ? '<span class="sel">' + K.countWords(sel) + ' words selected</span>' : '');
  updateSelNote();
}
function updateSelNote() {
  const n = $('#sel-note');
  if (!n) return;
  const sel = selectionText();
  n.innerHTML = sel.trim() ? 'Applies to your <b>selection</b> (' + K.countWords(sel) + ' words).' : 'Applies to the <b>whole script</b>. Select text in the editor to target a passage.';
}
function replaceRange(s, e, text, snapLabel) {
  const snapId = snapLabel ? snapshot(snapLabel, true) : null;
  const ed = editor();
  if (state.editorMode === 'edit') {
    ed.focus();
    ed.setSelectionRange(s, e);
    if (!document.execCommand('insertText', false, text)) ed.setRangeText(text, s, e, 'end'); // keeps native undo when possible
  } else ed.value = ed.value.slice(0, s) + text + ed.value.slice(e);
  markDirty(); refreshAnalysis();
  return snapId;
}
function replaceEditor(text, label) { return replaceRange(0, editor().value.length, text, label); }
function insertAtCursor(text) { const ed = editor(); replaceRange(ed.selectionStart, ed.selectionEnd, text); }
function appendToEditor(text, label) { const v = editor().value; return replaceRange(v.length, v.length, (v && !v.endsWith('\n') ? '\n\n' : v ? '\n' : '') + text, label); }
function insertSnippet(text, back) {
  if (state.editorMode !== 'edit') setEditorMode('edit');
  const ed = editor(), s = ed.selectionStart;
  const before = ed.value.slice(0, s);
  const prefix = before && !before.endsWith('\n') ? '\n' : '';
  replaceRange(s, ed.selectionEnd, prefix + text);
  const pos = s + prefix.length + text.length - (back || 0);
  ed.setSelectionRange(pos, pos);
}
function setEditorValue(v) { editor().value = v; markDirty(); refreshAnalysis(); }
function setEditorMode(mode) {
  state.editorMode = mode;
  $$('#editor-mode button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  editor().classList.toggle('hidden', mode !== 'edit');
  $('#perform').classList.toggle('hidden', mode !== 'perform');
  $('#read-bar').classList.toggle('hidden', mode !== 'perform');
  if (mode === 'perform') renderPerform(); else stopRead();
  renderStatus();
}

// find & replace
function findOpts() { return { q: $('#find-q').value, cs: $('#find-case').checked }; }
function findRegex() { const { q, cs } = findOpts(); return q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (cs ? '' : 'i')) : null; }
function updateFindCount() { const re = findRegex(); $('#find-count').textContent = re ? ((editor().value.match(re) || []).length + ' found') : ''; }
function findNext() {
  const { q, cs } = findOpts(); if (!q) return;
  if (state.editorMode !== 'edit') setEditorMode('edit');
  const ed = editor(), hay = cs ? ed.value : ed.value.toLowerCase(), needle = cs ? q : q.toLowerCase();
  let i = hay.indexOf(needle, ed.selectionEnd);
  if (i < 0) i = hay.indexOf(needle);
  if (i < 0) { toast('No matches for “' + q + '”'); return; }
  ed.focus(); ed.setSelectionRange(i, i + q.length);
  const line = ed.value.slice(0, i).split('\n').length;
  ed.scrollTop = Math.max(0, (line - 5) * parseFloat(getComputedStyle(ed).lineHeight));
}
function replaceOne() {
  const { q, cs } = findOpts(); const ed = editor(); const sel = ed.value.slice(ed.selectionStart, ed.selectionEnd);
  if (q && (cs ? sel === q : sel.toLowerCase() === q.toLowerCase())) replaceRange(ed.selectionStart, ed.selectionEnd, $('#find-r').value);
  findNext(); updateFindCount();
}
function replaceAll() {
  const re = findRegex(); if (!re) return;
  const n = (editor().value.match(re) || []).length;
  if (!n) return toast('No matches');
  const r = $('#find-r').value;
  replaceEditor(editor().value.replace(re, () => r), 'Before replace all');
  toast('Replaced ' + n + ' match' + (n === 1 ? '' : 'es'), 'ok'); updateFindCount();
}

// snapshots
/** Save a version; returns its id, the id of an identical latest version, or null when the editor is empty. */
function snapshot(label, auto) {
  const c = editor().value;
  if (!c.trim()) return null;
  const last = state.project.snapshots[0];
  if (last && last.content === c) return last.id;
  const id = uid();
  state.project.snapshots.unshift({ id, t: Date.now(), label: label || 'Snapshot', content: c, words: K.countWords(c), auto: !!auto });
  state.project.snapshots = state.project.snapshots.slice(0, 40);
  markDirty();
  if (state.tool === 'history') renderTool();
  return id;
}
/** Undo an AI change: keep the AI version as a snapshot, then put back what was there before (possibly an empty editor). */
function undoTo(snapId) {
  if (snapId) return restoreSnapshot(snapId, true);
  snapshot('Before undo', true);
  replaceEditor('');
  toast('Undone', 'ok');
}
function restoreSnapshot(id, snapFirst) {
  const s = state.project.snapshots.find(x => x.id === id);
  if (!s) return;
  if (snapFirst) snapshot('Before restore', true);
  replaceEditor(s.content);
  toast('Restored “' + s.label + '”', 'ok');
}

// ================= perform view =================
function cueMatch(label) {
  const ov = state.project.sfxOverrides[String(label).toLowerCase()];
  if (ov) { const s = state.sfxLib.find(x => x.id === ov) || K.BUILTIN_SOUNDS.find(x => x.id === ov); if (s) return s; }
  return K.matchSound(label, state.sfxLib, K.BUILTIN_SOUNDS);
}
function speechText(s) { return s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/[*_#>`~]/g, '').replace(/\s+/g, ' ').trim(); }
function fmtInline(s) { return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\([^)]*\)/g, m => '<span class="paren">' + m + '</span>'); }
/** Turn script text into rendered blocks and an ordered read sequence (speech, cues, pauses). */
function buildPerform(text, interactive) {
  const seq = [], html = [], colors = {};
  let ci = 0, current = null, bid = 0, cid = 0;
  const color = n => colors[n] || (colors[n] = SPK_COLORS[ci++ % SPK_COLORS.length]);
  const chip = c => {
    const id = 'cue' + (cid++);
    if (c.kind === 'pause') { seq.push({ type: 'pause', seconds: c.seconds, el: id }); return '<span class="cue pause" id="' + id + '">⏸ ' + c.seconds + 's pause</span>'; }
    const m = cueMatch(c.label);
    seq.push({ type: c.kind, label: c.label, el: id });
    return '<span class="cue ' + c.kind + (m ? '' : ' nomatch') + '" id="' + id + '"' + (interactive ? ' data-action="play-cue" data-label="' + esc(c.label) + '"' : '') +
      ' title="' + (m ? 'Plays: ' + esc(m.name) : 'No matching sound — assign one in the Sounds tab') + '"><span class="pi">' + ic('play') + '</span>' +
      (c.kind === 'music' ? 'MUSIC' : 'SFX') + ': ' + esc(c.label) + (m ? ' <small>· ' + esc(m.name) + '</small>' : '') + '</span>';
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { current = null; continue; }
    if (/^#{1,6}\s/.test(line)) { html.push('<div class="blk blk-heading md">' + fmtInline(line.replace(/^#+\s*/, '')) + '</div>'); current = null; continue; }
    if (/^(INT[./ ]|EXT[./ ]|I\/E[. ]|SCENE\s+\d|ACT\s+[IVX\d])/i.test(line)) { html.push('<div class="blk blk-heading">' + esc(line) + '</div>'); current = null; continue; }
    const cues = K.parseCues(line);
    let rest = line;
    for (const c of cues.slice().reverse()) rest = rest.slice(0, c.start) + rest.slice(c.end);
    if (cues.length && !rest.replace(/[\s*_-]/g, '')) { html.push('<div class="blk blk-cue">' + cues.map(chip).join(' ') + '</div>'); continue; }
    if (NON_SPOKEN.test(line)) { html.push('<div class="blk blk-visual">' + fmtInline(line) + '</div>'); continue; }
    if (/^[A-Z][A-Z0-9'. -]{1,28}(\s*\([^)]*\))?$/.test(line) && line.split(/\s+/).length <= 4) { current = line.replace(/\s*\(.*\)$/, '').trim(); continue; }
    let speaker = current, body = line;
    const sp = /^\s*(?:\*\*)?([A-Z][A-Za-z0-9'. -]{0,28}?)(?:\s*\(([^)]*)\))?(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*)$/.exec(line);
    if (sp && sp[1].trim().split(/\s+/).length <= 3) { speaker = sp[1].trim().toUpperCase(); body = (sp[2] ? '(' + sp[2] + ') ' : '') + sp[3]; }
    const id = 'pb' + (bid++), start = seq.length;
    let inner = '', spoken = '', last = 0;
    const flush = () => { const t = speechText(spoken); if (t) seq.push({ type: 'speech', speaker: speaker || 'NARRATOR', text: t, el: id }); spoken = ''; };
    for (const c of K.parseCues(body)) { inner += fmtInline(body.slice(last, c.start)); spoken += body.slice(last, c.start); flush(); inner += chip(c); last = c.end; }
    inner += fmtInline(body.slice(last)); spoken += body.slice(last); flush();
    html.push('<div class="blk speech" id="' + id + '"' + (interactive ? ' data-action="read-from" data-seq="' + start + '"' : '') + '>' +
      (speaker ? '<span class="spk" style="background:' + color(speaker) + '">' + esc(speaker) + '</span>' : '') + inner + '</div>');
  }
  return { html: html.join(''), seq };
}
function renderPerform() {
  const host = $('#perform'), text = editor().value;
  if (!text.trim()) { host.innerHTML = '<div class="empty">' + ic('play') + '<div>Nothing to perform yet. Write or generate a script first.</div></div>'; state.readSeq = []; return; }
  const scroll = host.scrollTop;
  const r = buildPerform(text, true);
  host.innerHTML = r.html;
  host.scrollTop = scroll;
  state.readSeq = r.seq;
}
function playCueLabel(label, elId, maxSeconds) {
  const m = cueMatch(label);
  if (!m) {
    toast('No sound matches “' + label + '”. Assign one in the Sounds tab or add a file to your library.', 'err', { label: 'Open Sounds', fn: () => setTool('cues') });
    return null;
  }
  const el = elId && document.getElementById(elId);
  if (el) el.classList.add('playing');
  const done = Sound.play(m, maxSeconds);
  done.then(() => el && el.classList.remove('playing'));
  return done;
}

// table read (text-to-speech with per-speaker voices + SFX)
function loadVoices() { state.voices = speechSynthesis.getVoices(); }
function voiceFor(speaker) {
  const map = state.project.voices[speaker];
  const voices = state.voices;
  if (map && map.voice) return { voice: voices.find(v => v.name === map.voice) || null, pitch: map.pitch || 1 };
  const speakers = Object.keys(state.analysis.speakers);
  const lang = (LANG_CODES[brief().language] || 'en');
  const pool = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(lang)).length ? voices.filter(v => v.lang.toLowerCase().startsWith(lang)) : voices;
  const i = Math.max(0, speakers.indexOf(speaker));
  return { voice: pool.length ? pool[i % pool.length] : null, pitch: [1, 0.85, 1.15, 0.95, 1.08][i % 5] };
}
const LANG_CODES = { English: 'en', Spanish: 'es', French: 'fr', German: 'de', Portuguese: 'pt', Italian: 'it', Dutch: 'nl', Polish: 'pl', Russian: 'ru', Japanese: 'ja', Korean: 'ko', 'Chinese (Simplified)': 'zh', 'Chinese (Traditional)': 'zh', Hindi: 'hi', Arabic: 'ar', Turkish: 'tr' };
function speak(text, speaker, token) {
  return new Promise(res => {
    const chunks = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
    let i = 0;
    const next = () => {
      if (i >= chunks.length || state.readToken !== token) return res(); // a newer read (or stop) owns the voice now
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      const v = voiceFor(speaker);
      if (v.voice) u.voice = v.voice;
      u.pitch = v.pitch; u.rate = Number(state.settings.readRate) || 1;
      u.onend = next; u.onerror = next;
      speechSynthesis.speak(u);
    };
    next();
  });
}
async function tableRead(from) {
  if (state.reading) { stopRead(); return; }
  if (!state.readSeq.length) return toast('Nothing to read yet.');
  state.reading = true;
  const token = state.readToken = {};
  updateReadBtn();
  for (let i = from || 0; i < state.readSeq.length; i++) {
    if (state.readToken !== token) return;
    const it = state.readSeq[i];
    state.readingNow = it.type === 'speech' ? it.speaker + ': ' + it.text : it.type === 'pause' ? 'Pause ' + it.seconds + 's' : (it.type === 'music' ? 'MUSIC: ' : 'SFX: ') + it.label;
    $$('#perform .reading').forEach(x => x.classList.remove('reading'));
    const el = document.getElementById(it.el);
    if (el) { (el.closest('.blk') || el).classList.add('reading'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    if (it.type === 'speech') await speak(it.text, it.speaker, token);
    else if (it.type === 'pause') await sleep(it.seconds * 1000 / (Number(state.settings.readRate) || 1));
    else if (state.settings.readSfx) { const p = playCueLabel(it.label, it.el, it.type === 'music' ? 4 : 6); if (p) await p; }
  }
  if (state.readToken === token) stopRead();
}
function stopRead() {
  if (!state.reading) return;
  state.reading = false; state.readToken = null;
  speechSynthesis.cancel(); Sound.stopAll();
  $$('#perform .reading').forEach(x => x.classList.remove('reading'));
  updateReadBtn();
}
function updateReadBtn() { const b = $('[data-action="read-play"]'); b.innerHTML = ic(state.reading ? 'stop' : 'play') + '<span>' + (state.reading ? 'Stop reading' : 'Table read') + '</span>'; }
function voicesModal() {
  loadVoices();
  const speakers = [...new Set([...Object.keys(state.analysis.speakers), 'NARRATOR'])];
  if (!state.voices.length) return toast('No text-to-speech voices are installed on this PC.', 'err');
  openModal({
    title: 'Voices for the table read',
    body: '<div class="hint">Pick a voice and pitch for each speaker. Lines without a speaker use NARRATOR.</div>' + speakers.map(s => {
      const cur = voiceFor(s);
      return '<div class="member" style="grid-template-columns:110px 1fr 90px auto"><b>' + esc(s) + '</b><select class="input" data-voice="' + esc(s) + '">' +
        state.voices.map(v => '<option' + (cur.voice && cur.voice.name === v.name ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') + '</select>' +
        '<input type="range" min="0.5" max="1.6" step="0.05" value="' + cur.pitch + '" data-pitch="' + esc(s) + '" title="Pitch">' +
        '<button class="icon-btn" data-test-voice="' + esc(s) + '" title="Preview">' + ic('play') + '</button></div>';
    }).join(''),
    actions: [{ label: 'Cancel' }, { label: 'Save voices', primary: true, onClick: () => {
      for (const s of speakers) state.project.voices[s] = { voice: $('[data-voice="' + CSS.escape(s) + '"]').value, pitch: Number($('[data-pitch="' + CSS.escape(s) + '"]').value) };
      markDirty(); toast('Voices saved', 'ok');
    } }],
  });
  $$('[data-test-voice]').forEach(b => { b.onclick = () => {
    const s = b.dataset.testVoice; speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('Hi, I am ' + s.toLowerCase() + '. This is how I sound.');
    u.voice = state.voices.find(v => v.name === $('[data-voice="' + CSS.escape(s) + '"]').value) || null;
    u.pitch = Number($('[data-pitch="' + CSS.escape(s) + '"]').value);
    speechSynthesis.speak(u);
  }; });
}

// ================= AI orchestration =================
async function callAI(member, system, user, onChunk, reqId, o) {
  o = o || {};
  reqId = reqId || uid();
  const off = api.onAI(d => { if (d.reqId === reqId && d.type === 'chunk' && onChunk) onChunk(d.text); });
  try {
    const r = await api.stream({ reqId, provider: member.provider, model: member.model || undefined, system, messages: [{ role: 'user', content: user }],
      temperature: o.temperature != null ? o.temperature : Number(state.settings.temperature), maxTokens: o.maxTokens || Number(state.settings.maxTokens) });
    return r.text || '';
  } finally { off(); }
}
function primaryMember() { const e = state.settings.engine; return e.mode === 'room' ? e.lead : e.single; }
function checkReady(members) {
  for (const m of members) {
    const p = state.providers[m.provider];
    if (!p) { toast('Unknown provider ' + m.provider, 'err'); return false; }
    if (!p.ready) { toast(p.label + ' needs an API key before it can write.', 'err', { label: 'Set up', fn: () => setView('providers') }); return false; }
  }
  return true;
}
function newRun(kind, title, strategy) {
  const r = { id: uid(), kind, title, strategy: strategy || '', createdAt: Date.now(), status: 'running', lanes: [], winner: null, activeLane: null, final: null };
  state.project.runs.unshift(r);
  state.project.runs = state.project.runs.slice(0, 25);
  state.liveRuns.add(r.id);
  setTool('runs');
  updateGhost();
  return r;
}
function addLane(r, member, role) {
  const model = member.model || defModel(member.provider);
  const l = { id: uid(), provider: member.provider, model, name: (role ? role + ' · ' : '') + pname(member.provider) + (model ? ' · ' + model : ''), role: role || '', text: '', status: 'waiting' };
  r.lanes.push(l);
  r.activeLane = l.id;
  renderToolIf('runs');
  return l;
}
async function runLane(r, lane, prompt) {
  if (r.cancelled) { lane.status = 'cancelled'; return null; }
  lane.status = 'running'; lane.reqId = uid(); r.activeLane = lane.id;
  lanePrompts.set(lane.id, prompt);
  if (lanePrompts.size > 300) lanePrompts.delete(lanePrompts.keys().next().value);
  renderToolIf('runs');
  try {
    const text = await callAI(lane, prompt.system, prompt.user, t => { lane.text += t; laneUpdated(lane); }, lane.reqId);
    lane.text = text || lane.text;
    lane.status = r.cancelled ? 'cancelled' : 'done';
  } catch (e) { lane.status = 'error'; lane.error = cleanErr(e); }
  renderToolIf('runs'); updateGhost(); markDirty();
  return lane.status === 'done' && lane.text.trim() ? lane.text : null;
}
function finishRun(r, proj) {
  if (proj && proj !== state.project) api.saveProject(proj); // finished after the user switched projects: save it to its own project
  r.status = r.cancelled ? 'cancelled' : r.lanes.some(l => l.status === 'done') ? 'done' : 'error';
  if (r.final) r.activeLane = r.final;
  state.liveRuns.delete(r.id);
  renderToolIf('runs'); updateGhost(); markDirty();
}
function cancelRun(r) {
  r.cancelled = true;
  for (const l of r.lanes) if (l.status === 'running') api.cancel(l.reqId);
  toast('Stopping…');
}
const pendingLanes = new Set();
let laneRaf = 0;
function laneUpdated(lane) {
  pendingLanes.add(lane);
  if (laneRaf) return;
  laneRaf = requestAnimationFrame(() => {
    laneRaf = 0;
    for (const l of pendingLanes) {
      const el = document.getElementById('lb-' + l.id);
      if (!el) continue;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      el.textContent = l.text;
      if (atBottom) el.scrollTop = el.scrollHeight;
    }
    pendingLanes.clear();
    updateGhost();
  });
}
function updateGhost() {
  const g = $('#stream-ghost');
  const live = state.project.runs.filter(r => state.liveRuns.has(r.id));
  const lanes = live.flatMap(r => r.lanes.filter(l => l.status === 'running'));
  if (!lanes.length) { g.classList.add('hidden'); return; }
  g.classList.remove('hidden');
  g.innerHTML = '<span class="spinner"></span>' + lanes.map(l => esc(pname(l.provider)) + ' · ' + K.countWords(l.text).toLocaleString() + ' words').join(' &nbsp;|&nbsp; ');
}

function buildBriefForAI(silent) {
  const b = JSON.parse(JSON.stringify(brief()));
  b.characters = (b.characters || []).slice(0, b.people);
  b.wpm = Number(b.wpm) || 0;
  if (b.mode !== 'create') {
    b.source = b.useEditorAsSource ? editor().value : b.source;
    if (!String(b.source || '').trim() && !silent) {
      toast(b.mode === 'adapt' ? 'Add source material to adapt (paste it or import a file).' : 'There is no script to ' + K.MODES[b.mode].label.toLowerCase() + ' yet. Write, paste or import one first.', 'err');
      return null;
    }
  }
  return b;
}
async function generate(customPrompt) {
  if (state.genRun) { cancelRun(state.genRun); return; }
  const b = buildBriefForAI();
  if (!b) return;
  const e = state.settings.engine;
  const title = K.MODES[b.mode].label + ' · ' + K.typeOf(b.type).label;
  const proj = state.project, startText = editor().value;
  let r;
  try {
    if (e.mode === 'single' || customPrompt) {
      const m = customPrompt ? primaryMember() : e.single;
      if (!checkReady([m])) return;
      r = state.genRun = newRun('generate', title);
      updateGenerateBtn();
      const lane = addLane(r, m);
      if (await runLane(r, lane, customPrompt || K.buildPrompt(b))) r.final = lane.id;
    } else if (e.strategy === 'relay') {
      if (!checkReady(K.RELAY_STAGES.map(s => e.relay[s.id]))) return;
      r = state.genRun = newRun('generate', title, 'Relay');
      updateGenerateBtn();
      const hist = {};
      let prev = '';
      for (const st of K.RELAY_STAGES) {
        const lane = addLane(r, e.relay[st.id], st.label);
        const out = await runLane(r, lane, st.make(b, prev, hist));
        if (!out) break;
        hist[st.id] = out; hist[st.id + 'Lane'] = lane.id; prev = out;
      }
      r.final = hist.polish ? hist.polishLane : hist.draft ? hist.draftLane : null;
    } else {
      if (!checkReady([...e.room, e.lead])) return;
      r = state.genRun = newRun('generate', title, STRATEGIES[e.strategy][0]);
      updateGenerateBtn();
      const lanes = e.room.map(m => addLane(r, m, 'Draft'));
      const texts = await Promise.all(lanes.map(l => runLane(r, l, K.buildPrompt(b))));
      const drafts = lanes.map((l, i) => texts[i] ? { name: pname(l.provider), text: texts[i], lane: l } : null).filter(Boolean);
      if (drafts.length === 1) r.final = drafts[0].lane.id;
      else if (drafts.length > 1 && !r.cancelled) {
        if (e.strategy === 'judge') {
          const judge = addLane(r, e.lead, 'Judge');
          const verdict = await runLane(r, judge, K.judgePrompt(drafts, b));
          const w = K.parseWinner(verdict, drafts.length);
          if (w >= 0) { r.winner = drafts[w].lane.id; r.final = r.winner; }
          else toast('The judge did not name a winner. Pick a draft yourself in AI Runs.');
        } else {
          const lead = addLane(r, e.lead, 'Merge');
          r.final = (await runLane(r, lead, K.synthesisPrompt(drafts, b))) ? lead.id : drafts[0].lane.id;
        }
      }
    }
    finishRun(r, proj);
    const unchanged = state.project === proj && editor().value === startText;
    if (r.final && !r.cancelled && state.settings.autoApply && !unchanged) toast('The script or project changed while the AI was writing, so nothing was replaced. Use the result from AI Runs.', 'err');
    else if (r.final && !r.cancelled && state.settings.autoApply) applyLane(r, r.lanes.find(l => l.id === r.final), b.mode === 'continue' ? 'append' : 'replace');
    else if (r.status === 'error') toast('Generation failed — see AI Runs for details.', 'err');
  } finally {
    state.genRun = null;
    updateGenerateBtn();
  }
}
function applyLane(r, lane, how) {
  if (!lane || !lane.text) return;
  const text = cleanOutput(lane.text);
  let snapId;
  if (how === 'append') snapId = appendToEditor(text, 'Before ' + r.title);
  else if (how === 'insert') { snapId = snapshot('Before insert', true); insertAtCursor(text); }
  else snapId = replaceEditor(text, 'Before ' + r.title);
  r.applied = lane.id;
  if (state.lab.autoLearn) learn(r, lane);
  toast('Script updated from ' + pname(lane.provider), 'ok', { label: 'Undo', fn: () => undoTo(snapId) });
}
async function assist(instruction, label, wholeOnly) {
  const ed = editor();
  const s = ed.selectionStart, e = ed.selectionEnd, whole = ed.value;
  const hasSel = !wholeOnly && state.editorMode === 'edit' && e > s && whole.slice(s, e).trim();
  const passage = hasSel ? whole.slice(s, e) : whole;
  if (!passage.trim()) return toast('Write or generate a script first.', 'err');
  const m = primaryMember();
  if (!checkReady([m])) return;
  const proj = state.project;
  const r = newRun('assist', label + (hasSel ? ' · selection' : ' · whole script'));
  const lane = addLane(r, m);
  const out = await runLane(r, lane, K.buildAssistPrompt(instruction, passage, brief(), whole));
  r.final = out ? lane.id : null;
  finishRun(r, proj);
  if (!out || r.cancelled || !state.settings.autoApply) return;
  if (state.project !== proj) return toast('You switched projects, so the result stayed in that project\'s AI Runs.', 'err');
  const text = cleanOutput(out);
  let snapId;
  if (hasSel && editor().value.slice(s, e) === passage) { snapId = replaceRange(s, e, text, 'Before ' + label); r.applied = lane.id; }
  else if (!hasSel && editor().value === whole) { snapId = replaceEditor(text, 'Before ' + label); r.applied = lane.id; }
  else return toast('The script changed while the AI was working, so nothing was replaced. Use the result in AI Runs.', 'err');
  if (state.lab.autoLearn) learn(r, lane);
  toast(label + ' applied', 'ok', { label: 'Undo', fn: () => undoTo(snapId) });
}
async function runTool(key, extra) {
  const t = K.TOOL_ACTIONS[key] || { label: 'Answer', prompt: extra };
  const m = primaryMember();
  if (!checkReady([m])) return;
  const proj = state.project;
  const r = newRun('tool', t.label);
  const lane = addLane(r, m);
  const prompt = K.buildToolPrompt(t.prompt, editor().value, brief());
  if (!editor().value.trim()) prompt.user += '\n\nBrief:\n' + K.buildPrompt({ ...brief(), mode: 'create' }).user;
  await runLane(r, lane, prompt);
  finishRun(r, proj);
}
async function brainstorm() {
  const m = primaryMember();
  if (!checkReady([m])) return;
  const list = $('#idea-list');
  list.innerHTML = '<span class="muted"><span class="spinner"></span> Brainstorming with ' + esc(pname(m.provider)) + '…</span>';
  try {
    const text = await callAI(m, 'You are Scripty, a creative script ideation partner.', K.TOOL_ACTIONS.ideas.prompt + '\n\nBrief so far:\n' + K.buildPrompt({ ...brief(), mode: 'create' }).user, null, null, { maxTokens: 1500 });
    const ideas = text.split('\n').map(x => x.replace(/^[\s\-*•\d.)]+/, '').trim()).filter(x => x.length > 8).slice(0, 10);
    list.innerHTML = ideas.map(i => '<button data-action="use-idea" data-v="' + esc(i) + '" title="Add to ideas">' + esc(i) + '</button>').join('') || '<span class="muted">No ideas came back.</span>';
  } catch (err) { list.innerHTML = ''; toast(cleanErr(err), 'err'); }
}
function previewPrompt() {
  const b = buildBriefForAI(true);
  const p = K.buildPrompt(b);
  const tokens = Math.round((p.system.length + p.user.length) / 4);
  const room = state.settings.engine.mode === 'room';
  openModal({
    title: 'Prompt preview', wide: true,
    body: '<div class="hint">This is exactly what Scripty sends' + (room ? ' to each writer (the Writers\' Room adds its merge, judge or relay steps afterwards)' : '') +
      '. About ' + tokens.toLocaleString() + ' input tokens. Edit it and generate with your version if you like.</div>' +
      '<div class="field"><label>System</label><textarea class="input" id="pp-sys" rows="8">' + esc(p.system) + '</textarea></div>' +
      '<div class="field"><label>Message</label><textarea class="input" id="pp-user" rows="14">' + esc(p.user) + '</textarea></div>',
    actions: [
      { label: 'Copy', onClick: () => { navigator.clipboard.writeText('SYSTEM:\n' + $('#pp-sys').value + '\n\nUSER:\n' + $('#pp-user').value); toast('Copied', 'ok'); return false; } },
      { label: 'Generate with this prompt', primary: true, onClick: () => { const c = { system: $('#pp-sys').value, user: $('#pp-user').value }; setTimeout(() => generate(c)); } },
    ],
  });
}

// ================= tools panel =================
function setTool(t) { state.tool = t; renderTool(); }
function renderToolIf(t) { if (state.tool === t) renderTool(); }
function renderTool() {
  $$('#tool-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tool === state.tool));
  const body = $('#tool-body');
  const scroll = body.scrollTop;
  ({ runs: renderRuns, assist: renderAssist, length: renderLengthTool, cues: renderCuesTool, history: renderHistory })[state.tool](body);
  body.scrollTop = scroll;
}
function statusPill(s) { return { running: '<span class="pill run"><span class="spinner"></span></span>', done: '<span class="pill ok">Done</span>', error: '<span class="pill err">Failed</span>', cancelled: '<span class="pill">Stopped</span>' }[s] || ''; }
function laneStatus(l) { return { waiting: '<span class="st faint">•</span>', running: '<span class="spinner"></span>', done: '<span class="st" style="color:var(--ok)">✓</span>', error: '<span class="st" style="color:var(--err)">✕</span>', cancelled: '<span class="st faint">■</span>' }[l.status] || ''; }
function runCard(r) {
  const active = r.lanes.find(l => l.id === r.activeLane) || r.lanes[r.lanes.length - 1];
  if (!active) return '';
  const btn = (act, label, icon, cls) => '<button class="btn sm ' + (cls || '') + '" data-action="' + act + '" data-run="' + r.id + '" data-lane="' + active.id + '">' + (icon ? ic(icon) : '') + label + '</button>';
  const actions = active.status === 'done' && active.text ? '<div class="lane-actions">' +
    (r.kind !== 'tool' ? btn('lane-use', r.applied === active.id ? 'Applied' : 'Use in editor', 'check', 'primary') + btn('lane-insert', 'Insert at cursor') + btn('lane-append', 'Append') : btn('lane-insert', 'Insert at cursor')) +
    btn('lane-copy', 'Copy', 'copy', 'ghost') + (lanePrompts.has(active.id) ? btn('lane-teach', 'Teach', 'bulb', 'ghost') : '') + '</div>' : '';
  return '<div class="run"><div class="run-head">' + statusPill(r.status) + '<b>' + esc(r.title) + '</b>' + (r.strategy ? '<span class="pill">' + esc(r.strategy) + '</span>' : '') +
    '<span class="when">' + timeAgo(r.createdAt) + '</span>' +
    (r.status === 'running' ? '<button class="btn sm stop" data-action="cancel-run" data-run="' + r.id + '">' + ic('stop') + 'Stop</button>' : '<button class="icon-btn" data-action="rm-run" data-run="' + r.id + '" title="Remove">' + ic('x') + '</button>') + '</div>' +
    (r.lanes.length > 1 ? '<div class="lanes">' + r.lanes.map(l => '<button class="lane-tab ' + (l === active ? 'active' : '') + '" data-action="lane" data-run="' + r.id + '" data-lane="' + l.id + '" title="' + esc(l.name) + '">' +
      '<span class="provider-dot" style="background:' + pcolor(l.provider) + '"></span>' + esc(l.role || pname(l.provider)) + (l.role ? ' · ' + esc(pname(l.provider)) : '') + ' ' + laneStatus(l) +
      (r.winner === l.id ? ' <span class="winner" title="Judge\'s pick">' + ic('crown') + '</span>' : '') + '</button>').join('') + '</div>' : '<div class="lanes"><span class="hint">' + esc(active.name) + '</span></div>') +
    '<div class="lane-body ' + (active.status === 'error' ? 'err' : '') + (active.status === 'running' ? ' caret' : '') + '" id="lb-' + active.id + '">' +
      (active.status === 'error' ? esc(active.error) : active.text ? esc(active.text) : '<span class="muted">' + (active.status === 'waiting' ? 'Waiting for the previous step…' : 'Thinking…') + '</span>') + '</div>' + actions + '</div>';
}
function renderRuns(body) {
  const runs = state.project.runs;
  body.innerHTML = runs.length ? runs.map(runCard).join('') + '<button class="btn sm ghost" data-action="clear-runs" style="width:100%">Clear history</button>'
    : '<div class="empty">' + ic('layers') + '<div><b>AI output appears here.</b></div><div class="hint">Press Generate, or use Assist on a selection. Writers\' Room runs show every AI\'s draft side by side.</div></div>';
}
function renderAssist(body) {
  const typeSel = '<select class="input" id="convert-type">' + typeOptions(brief().type) + '</select>';
  body.innerHTML = '<div class="sel-note" id="sel-note"></div>' +
    '<div class="tool-section"><h4>' + ic('wand') + 'Quick edits</h4><div class="action-grid">' +
      Object.entries(K.ASSIST_ACTIONS).map(([k, a]) => '<button class="btn" data-action="assist" data-k="' + k + '">' + esc(a.label) + '</button>').join('') + '</div></div>' +
    '<div class="tool-section"><h4>' + ic('pen') + 'Tell the AI what to change</h4><textarea class="input" id="custom-instr" rows="3" placeholder="e.g. Make Sam sarcastic · Add a twist at the midpoint · Replace jargon with plain words"></textarea>' +
      '<div class="row gap" style="margin-top:6px"><button class="btn sm primary" data-action="assist-custom">' + ic('sparkles') + 'Apply</button></div></div>' +
    '<div class="tool-section"><h4>' + ic('palette') + 'Change tone · translate · convert</h4>' +
      '<div class="row gap"><select class="input" id="tone-sel">' + opts(K.TONES, 'Funny') + '</select><button class="btn sm" data-action="assist-tone">Retone</button></div>' +
      '<div class="row gap" style="margin-top:6px"><select class="input" id="lang-sel">' + opts(LANGUAGES, 'Spanish') + '</select><button class="btn sm" data-action="assist-translate">Translate</button></div>' +
      '<div class="row gap" style="margin-top:6px">' + typeSel + '<button class="btn sm" data-action="assist-convert">Convert</button></div></div>' +
    '<div class="tool-section"><h4>' + ic('sparkles') + 'Publish & review (results stay in AI Runs)</h4><div class="action-grid">' +
      Object.entries(K.TOOL_ACTIONS).filter(([k]) => k !== 'ideas').map(([k, a]) => '<button class="btn" data-action="tool" data-k="' + k + '">' + esc(a.label) + '</button>').join('') + '</div></div>' +
    '<div class="tool-section"><h4>' + ic('msg') + 'Ask about this script</h4><div class="row gap"><input class="input" id="ask-q" placeholder="Is the pacing right for a 10-minute video?"><button class="btn sm" data-action="ask">Ask</button></div></div>';
  const ct = $('#convert-type');
  if (ct) ct.value = brief().type === 'short' ? 'youtube' : 'short';
  updateSelNote();
}
function renderLengthTool(body) {
  const a = state.analysis, plan = targetPlan(), t = K.typeOf(brief().type);
  if (!a.spokenWords) { body.innerHTML = '<div class="empty">' + ic('timer') + '<div><b>Live length analysis</b></div><div class="hint">Target: ' + plan.words.toLocaleString() + ' words (' + K.fmtTime(plan.seconds) + '). Start writing and this panel tracks runtime, pacing and speaker balance.</div></div>' +
    '<div class="advice">' + K.adviseLength(brief().type, plan.seconds).map(x => '<div class="' + x.level + '">' + esc(x.text) + '</div>').join('') + '</div>'; return; }
  const max = Math.max(plan.seconds * 1.4, a.seconds, 1);
  const over = a.seconds > plan.seconds * 1.1, under = a.seconds < plan.seconds * 0.9;
  const diff = Math.abs(a.spokenWords - plan.words);
  const verdict = over ? '<div class="warn">About ' + K.fmtTime(a.seconds - plan.seconds) + ' over target. Trim roughly ' + diff.toLocaleString() + ' words.</div>'
    : under ? '<div class="warn">About ' + K.fmtTime(plan.seconds - a.seconds) + ' under target. Add roughly ' + diff.toLocaleString() + ' words.</div>'
    : '<div class="ok">On target — within 10% of ' + K.fmtTime(plan.seconds) + '.</div>';
  const total = Object.values(a.speakers).reduce((x, y) => x + y, 0) || 1;
  let ci = 0;
  const bars = Object.entries(a.speakers).sort((x, y) => y[1] - x[1]).map(([s, n]) => '<div class="bar-row"><span>' + esc(s) + '</span><div class="bar"><i style="width:' + (n / total * 100) + '%;background:' + SPK_COLORS[ci++ % SPK_COLORS.length] + '"></i></div><span class="muted">' + Math.round(n / total * 100) + '%</span></div>').join('');
  const stat = (v, l) => '<div class="stat"><b>' + v + '</b><span>' + l + '</span></div>';
  body.innerHTML = '<div class="tool-section"><div class="lbl">Estimated ' + (t.reading ? 'reading time' : 'runtime') + '</div><div class="big-time">' + K.fmtTime(a.seconds) + ' <small>/ ' + K.fmtTime(plan.seconds) + ' target</small></div>' +
    '<div class="gauge"><div class="zone" style="left:' + (plan.seconds * 0.9 / max * 100) + '%;width:' + (plan.seconds * 0.2 / max * 100) + '%"></div><div class="fill ' + (over ? 'over' : '') + '" style="width:' + (a.seconds / max * 100) + '%"></div></div>' +
    '<div class="hint">Green zone = within 10% of target · ' + wpm() + ' wpm' + (a.pauseSeconds ? ' · includes ' + K.fmtTime(a.pauseSeconds) + ' of pauses' : '') + '</div></div>' +
    '<div class="advice">' + verdict + '</div>' +
    ((over || under) ? '<div class="row gap" style="margin:10px 0"><button class="btn sm primary" data-action="fit-length">' + ic('wand') + (over ? 'Trim' : 'Expand') + ' to ~' + plan.words.toLocaleString() + ' words</button></div>' : '') +
    '<div class="stat-grid">' + stat(a.words.toLocaleString(), 'total words') + stat(a.spokenWords.toLocaleString(), 'spoken words') + stat(a.scenes, 'sections') +
      stat(a.cues.filter(c => c.kind === 'sfx').length, 'sound cues') + stat(a.avgSentence, 'words / sentence') + stat(a.flesch, K.readingLevel(a.flesch)) + '</div>' +
    (bars ? '<div class="tool-section"><h4>' + ic('users') + 'Speaking share</h4>' + bars + '</div>' : '') +
    '<div class="tool-section"><h4>' + ic('info') + 'Advice for ' + esc(t.label) + '</h4><div class="advice">' + K.adviseLength(brief().type, a.seconds).map(x => '<div class="' + x.level + '">' + esc(x.text) + '</div>').join('') +
      (a.avgSentence > 22 && !t.reading ? '<div class="warn">Sentences average ' + a.avgSentence + ' words. Spoken scripts read best under about 20.</div>' : '') + '</div></div>';
}
function soundOptions(sel) {
  return '<option value="">Auto match</option>' + (state.sfxLib.length ? '<optgroup label="My library">' + state.sfxLib.map(s => '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</optgroup>' : '') +
    '<optgroup label="Built-in">' + K.BUILTIN_SOUNDS.map(s => '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</optgroup>';
}
function renderCuesTool(body) {
  const seen = new Set();
  const cues = state.analysis.cues.filter(c => c.kind !== 'pause' && !seen.has(c.label.toLowerCase()) && seen.add(c.label.toLowerCase()));
  body.innerHTML = deckHTML() + '<div class="tool-section"><h4>' + ic('wave') + 'Cues in this script (' + cues.length + ')</h4>' +
    (cues.length ? cues.map(c => { const m = cueMatch(c.label); const ov = state.project.sfxOverrides[c.label.toLowerCase()] || '';
      return '<div class="list-row"><button class="round-play" data-action="play-cue" data-label="' + esc(c.label) + '" title="Play">' + ic('play') + '</button>' +
        '<div class="meta"><b>' + (c.kind === 'music' ? 'MUSIC: ' : '') + esc(c.label) + '</b><span>' + (m ? '→ ' + esc(m.name) : '<span style="color:var(--warn)">No match</span>') + '</span></div>' +
        (m ? '' : '<button class="btn sm" data-action="gen-cue" data-label="' + esc(c.label) + '" title="Have your AI design this sound">' + ic('sparkles') + 'AI</button>') +
        '<select class="input" style="width:130px" data-override="' + esc(c.label.toLowerCase()) + '">' + soundOptions(ov) + '</select></div>'; }).join('') +
      '<button class="btn sm" data-action="play-all-cues" style="margin-top:4px">' + ic('play') + 'Play all in order</button>'
      : '<div class="hint">No [SFX: …] or [MUSIC: …] cues yet. Turn on “Sound effect cues” in the brief, use Assist → Add SFX cues, or insert them from the board below.</div>') + '</div>' +
    '<div class="tool-section"><h4>' + ic('music') + 'Quick board <span class="hint" style="text-transform:none;letter-spacing:0;font-weight:400">· click to play, Shift+click to insert</span></h4><div class="mini-board">' +
      K.BUILTIN_SOUNDS.map(s => '<button data-action="board-play" data-id="' + s.id + '" data-name="' + esc(s.name) + '" title="' + esc(s.keywords.join(', ')) + '">' + esc(s.name) + '</button>').join('') + '</div></div>';
}
function renderHistory(body) {
  const snaps = state.project.snapshots;
  body.innerHTML = '<button class="btn sm primary" data-action="snapshot" style="width:100%;margin-bottom:10px">' + ic('save') + 'Save snapshot now</button>' +
    (snaps.length ? snaps.map(s => '<div class="list-row"><div class="meta"><b>' + esc(s.label) + '</b><span>' + timeAgo(s.t) + ' · ' + s.words.toLocaleString() + ' words' + (s.auto ? ' · auto' : '') + '</span></div>' +
      '<button class="icon-btn" data-action="snap-view" data-id="' + s.id + '" title="Preview">' + ic('eye') + '</button>' +
      '<button class="btn sm" data-action="snap-restore" data-id="' + s.id + '">Restore</button>' +
      '<button class="icon-btn" data-action="snap-rm" data-id="' + s.id + '" title="Delete">' + ic('trash') + '</button></div>').join('')
      : '<div class="empty">' + ic('history') + '<div class="hint">Snapshots are saved automatically before every AI change, so you can always go back.</div></div>');
}

// ================= pages =================
async function setView(v) {
  state.view = v;
  $$('#rail .rail-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $$('#views .view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  if (v === 'projects') await renderProjects();
  if (v === 'sounds') renderSounds();
  if (v === 'providers') renderProviders();
  if (v === 'settings') renderSettings();
  if (v === 'remote') { renderRemote(); refreshRemoteStatus(); }
  if (v === 'lab') openLab();
  if (v !== 'studio') stopRead();
}
async function renderProjects() {
  const list = await api.listProjects();
  const q = $('#project-search').value.trim().toLowerCase();
  $('#template-grid').innerHTML = Object.entries(K.SCRIPT_TYPES).map(([id, t]) => '<button class="tpl" data-action="new-from-type" data-type="' + id + '"><div class="tpl-ic">' + ic(GROUP_ICON[t.group] || 'file') + '</div><b>' + esc(t.label) + '</b><span>' + esc(t.guide.split('. ')[0]) + '.</span></button>').join('');
  const shown = list.filter(p => !q || (p.title + ' ' + p.preview).toLowerCase().includes(q));
  $('#project-grid').innerHTML = shown.map(p => '<div class="pcard ' + (p.id === state.project.id ? 'current' : '') + '" data-action="open-project" data-id="' + p.id + '"><h3>' + esc(p.title || 'Untitled') + '</h3><p>' + esc(p.preview || 'Empty script') + '</p>' +
    '<div class="foot"><span class="badge">' + esc(K.typeOf(p.type).label) + '</span><span>' + p.words.toLocaleString() + ' words · ' + timeAgo(p.updatedAt) + '</span><div class="acts">' +
    '<button class="icon-btn" data-action="dup-project" data-id="' + p.id + '" title="Duplicate">' + ic('copy') + '</button><button class="icon-btn" data-action="del-project" data-id="' + p.id + '" title="Delete">' + ic('trash') + '</button></div></div></div>').join('') ||
    '<div class="empty">' + ic('folder') + '<div>' + (q ? 'No projects match.' : 'No projects yet.') + '</div></div>';
}
function renderSounds() {
  $('#sfx-volume').value = state.settings.sfxVolume;
  $('#library-list').innerHTML = state.sfxLib.length ? state.sfxLib.map(s => '<div class="list-row"><button class="round-play" data-action="lib-play" data-id="' + s.id + '">' + ic('play') + '</button>' +
    '<input class="input" style="max-width:220px" data-lib="name" data-id="' + s.id + '" value="' + esc(s.name) + '" title="Name">' +
    '<input class="input" data-lib="keywords" data-id="' + s.id + '" value="' + esc((s.keywords || []).join(', ')) + '" placeholder="keywords that trigger it, comma separated" title="Cue keywords">' +
    '<input type="range" min="0.1" max="1" step="0.05" data-lib="volume" data-id="' + s.id + '" value="' + (s.volume || 1) + '" title="Volume" style="width:90px">' +
    '<button class="icon-btn" data-action="lib-rm" data-id="' + s.id + '" title="Remove">' + ic('trash') + '</button></div>').join('')
    : '<div class="card" style="padding:16px"><div class="hint">Add your own .mp3 / .wav / .ogg files. Give each a few keywords, and any cue containing those words (e.g. <code>[SFX: dog barking]</code>) plays your file instead of a built-in sound.</div></div>';
  const cats = {};
  for (const s of K.BUILTIN_SOUNDS) (cats[s.category] = cats[s.category] || []).push(s);
  $('#board-grid').innerHTML = Object.entries(cats).map(([c, list]) => '<div class="board-cat"><h4>' + esc(c) + '</h4><div class="board">' + list.map(s =>
    '<div class="snd" data-action="board-play" data-id="' + s.id + '" data-name="' + esc(s.name) + '"><span class="round-play">' + ic('play') + '</span><div class="meta"><b>' + esc(s.name) + '</b><span>' + esc(s.keywords.slice(0, 3).join(' · ')) + '</span></div>' +
    '<button class="icon-btn ins" data-action="board-insert" data-name="' + esc(s.name) + '" title="Insert as a cue in the script">' + ic('plus') + '</button></div>').join('') + '</div></div>').join('');
}
function renderProviders() {
  $('#provider-grid').innerHTML = Object.values(state.providers).map(p => {
    const st = p.local ? ['Local', 'run'] : p.keyStatus === 'saved' ? ['Key saved', 'ok'] : p.keyStatus === 'env' ? ['From env', 'ok'] : p.needsKey ? ['Needs key', 'err'] : ['Optional key', 'run'];
    return '<div class="pv"><div class="pv-head"><div class="pv-logo" style="background:' + p.color + (p.id === 'xai' ? ';color:#111' : '') + '">' + esc(p.label.slice(0, 2)) + '</div><div><b>' + esc(p.label) + '</b><span>' + esc(p.vendor) + (p.kind === 'openai' && p.id !== 'openai' ? ' · OpenAI-compatible' : '') + '</span></div><span class="pill ' + st[1] + '">' + st[0] + '</span></div>' +
      (!p.local ? '<div class="field"><label>' + ic('key') + 'API key</label><div class="row gap"><input class="input" type="password" id="key-' + p.id + '" placeholder="' + (p.keyStatus === 'saved' ? '•••••••• saved — paste to replace' : p.keyStatus === 'env' ? 'Using environment variable' : 'Paste your API key') + '" autocomplete="off" spellcheck="false">' +
        '<button class="btn sm" data-action="save-key" data-id="' + p.id + '">Save</button>' + (p.keyStatus === 'saved' ? '<button class="icon-btn" data-action="clear-key" data-id="' + p.id + '" title="Remove key">' + ic('trash') + '</button>' : '') + '</div></div>' : '') +
      (p.local || p.id === 'custom' ? '<div class="field"><label>' + ic('link') + 'Server URL</label><input class="input" data-pbind="baseUrl" data-id="' + p.id + '" value="' + esc(p.baseUrl) + '" placeholder="' + esc(p.defaultBaseUrl || 'https://your-server/v1') + '" spellcheck="false"></div>' : '') +
      '<div class="field"><label>' + ic('cpu') + 'Default model</label><div class="row gap">' + modelCombo('<input class="input" data-pbind="model" data-id="' + p.id + '" value="' + esc(p.model) + '" spellcheck="false" placeholder="model id">', p.id) +
        '<button class="btn sm" data-action="load-models" data-id="' + p.id + '" title="Fetch the models available to you">' + ic('refresh') + 'Models</button></div>' +
        ((p.models || []).length ? '<div class="hint">' + p.models.length + ' models available — pick one from the list.</div>' : p.local ? '<div class="hint">Start ' + esc(p.label) + ', then press Models to list what you have installed.</div>' : '') + '</div>' +
      '<div class="row gap"><button class="btn sm" data-action="test-provider" data-id="' + p.id + '">' + ic('zap') + 'Test</button>' +
        (p.keyUrl ? '<button class="btn sm ghost" data-action="open-url" data-url="' + esc(p.keyUrl) + '">' + ic('external') + (p.local ? 'Download' : 'Get a key') + '</button>' : '') + '<span class="pv-test muted" id="pvt-' + p.id + '"></span></div></div>';
  }).join('');
}
function renderDatalists() {
  $('#datalists').innerHTML = Object.values(state.providers).map(p => '<datalist id="dl-' + p.id + '">' + [...new Set([p.model, ...(p.models || [])].filter(Boolean))].map(m => '<option value="' + esc(m) + '">').join('') + '</datalist>').join('');
}
function renderSettings() {
  const s = state.settings;
  const sw = (k, l, h) => '<div class="switch-row"><div><div>' + l + '</div>' + (h ? '<div class="hint">' + h + '</div>' : '') + '</div><label class="switch"><input type="checkbox" data-bind="S:' + k + '" data-type="bool" data-apply' + (s[k] ? ' checked' : '') + '><span></span></label></div>';
  $('#settings-body').innerHTML =
    '<div class="card"><h3>' + ic('palette') + 'Appearance</h3>' +
      '<div class="field"><label>Theme</label><div class="seg">' + ['dark', 'light', 'system'].map(t => '<button data-action="set-theme" data-v="' + t + '" class="' + (s.theme === t ? 'active' : '') + '">' + cap(t) + '</button>').join('') + '</div></div>' +
      '<div class="field"><label>Accent</label><div class="swatches">' + Object.entries(ACCENTS).map(([k, c]) => '<span class="swatch ' + (s.accent === k ? 'on' : '') + '" data-action="set-accent" data-v="' + k + '" style="background:linear-gradient(135deg,' + c[0] + ',' + c[1] + ')" title="' + k + '"></span>').join('') + '</div></div>' +
      '<div class="two"><div class="field"><label>Editor font</label><select class="input" data-bind="S:editorFont" data-apply>' + Object.entries(FONTS).map(([k, [l]]) => '<option value="' + k + '"' + (s.editorFont === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Editor text size</label><input class="input" type="number" min="12" max="28" data-bind="S:editorSize" data-type="number" data-apply value="' + s.editorSize + '"></div></div></div>' +
    '<div class="card"><h3>' + ic('keyboard') + 'Sound hotkeys &amp; variation</h3>' +
      ['next', 'replay', 'stop'].map(a => '<div class="switch-row"><div>' + { next: 'Play the next cue', replay: 'Replay the last cue', stop: 'Stop all sounds' }[a] + '</div>' +
        '<button class="btn sm hk-btn" data-action="hk-capture" data-a="' + a + '">' + hkLabel(a) + '</button></div>').join('') +
      '<div class="switch-row"><div><div>Work in other apps</div><div class="hint">The keys fire even while OBS, a game or your browser has focus.</div></div><label class="switch"><input type="checkbox" id="hk-global"' + (s.hotkeys.global ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="field"><label>Variation per play <span class="aside">' + Math.round(s.sfxVary * 100) + '%</span></label><input type="range" min="0" max="1" step="0.05" data-bind="S:sfxVary" data-type="number" data-apply value="' + s.sfxVary + '">' +
        '<div class="hint">Pitch, level and timing shift a little on every play, so repeats never sound identical. 0% plays the exact same sound each time.</div></div></div>' +
    '<div class="card"><h3>' + ic('sparkles') + 'AI generation</h3>' +
      '<div class="field"><label>Creativity (temperature) <span class="aside" id="temp-out">' + s.temperature + '</span></label><input type="range" min="0" max="1.5" step="0.05" data-bind="S:temperature" data-type="number" value="' + s.temperature + '"></div>' +
      '<div class="field"><label>Max output length</label><select class="input" data-bind="S:maxTokens" data-type="number">' + [2048, 4096, 8192, 16000, 32000, 64000].map(n => '<option value="' + n + '"' + (Number(s.maxTokens) === n ? ' selected' : '') + '>' + n.toLocaleString() + ' tokens (≈ ' + Math.round(n * 0.75).toLocaleString() + ' words)</option>').join('') + '</select><div class="hint">Scripts over ~30 minutes need 16k or more. Some models cap lower.</div></div>' +
      sw('autoApply', 'Apply AI results to the editor automatically', 'A snapshot is saved first, so every change can be undone.') + '</div>' +
    '<div class="card"><h3>' + ic('play') + 'Performance</h3>' +
      '<div class="field"><label>Table-read speed <span class="aside">' + s.readRate + '×</span></label><input type="range" min="0.6" max="1.6" step="0.1" data-bind="S:readRate" data-type="number" data-apply value="' + s.readRate + '"></div>' +
      sw('readSfx', 'Play sound cues during the table read') +
      '<div class="field"><label>Sound effect volume</label><input type="range" min="0" max="1" step="0.05" data-bind="S:sfxVolume" data-type="number" value="' + s.sfxVolume + '"></div></div>' +
    '<div class="card"><h3>' + ic('monitor') + 'Window & startup</h3>' +
      sw('minimizeOnClose', 'Minimize to the taskbar when closed', 'The X button keeps Scripty running. To quit, right-click it in the taskbar and choose Close window.') +
      sw('openAtLogin', 'Start Scripty when Windows starts', 'Opens minimized in the taskbar.') + '</div>' +
    '<div class="card"><h3>' + ic('file') + 'Defaults</h3><div class="field"><label>Script type for new projects</label><select class="input" data-bind="S:defaultType">' + typeOptions(s.defaultType) + '</select></div>' +
      '<div class="hint">Tip: the brief keeps a separate speaking rate (WPM) per project, so you can match your own delivery.</div></div>' +
    '<div class="card"><h3>' + ic('key') + 'Privacy & data</h3><div class="hint">Projects, settings and your sound library are stored on this computer:</div><code>' + esc(state.info.dataDir) + '</code>' +
      '<div class="hint">API keys are ' + (state.info.encryption ? 'encrypted with Windows DPAPI (tied to your Windows account)' : 'stored obfuscated because OS encryption is unavailable') + '. Scripts are only sent to the AI providers you choose.</div>' +
      '<div class="row gap"><button class="btn sm" data-action="open-data">' + ic('folder') + 'Open data folder</button></div></div>' +
    '<div class="card"><h3>' + ic('info') + 'About</h3><div class="row gap"><svg viewBox="0 0 64 64" width="44" height="44">' + $('.logo').innerHTML + '</svg><div><b>Scripty ' + esc(state.info.version) + '</b><div class="hint">AI Script Studio — write, revise and perform scripts with Claude, ChatGPT, Gemini, Ollama and more.</div></div></div>' +
      '<button class="btn sm ghost" data-action="shortcuts">' + ic('keyboard') + 'Keyboard shortcuts</button></div>';
}

// ================= projects =================
async function openProjectObj(p) {
  stopRead();
  if (state.project) await saveNow();
  state.project = p;
  state.settings.lastProjectId = p.id;
  saveSettings();
  editor().value = p.content || '';
  $('#project-title').value = p.title;
  renderAll();
  await saveNow();
  await setView('studio');
}
async function openProject(id) {
  const p = await api.loadProject(id);
  if (!p) return toast('Could not open that project.', 'err');
  await openProjectObj(normalizeProject(p));
}
async function newScript(type) {
  const p = newProject(type || state.settings.defaultType);
  await openProjectObj(p);
  toast('New ' + K.typeOf(p.brief.type).label + ' script — fill in the brief and press Generate, or start typing.');
}

// ================= import / export =================
async function importFile(intoSource) {
  let f;
  try { f = await api.importFile(); } catch (e) { return toast(cleanErr(e), 'err'); }
  if (!f) return;
  let text = f.content;
  if (f.ext === 'json') {
    try {
      const j = JSON.parse(text);
      if (j && typeof j.content === 'string' && j.brief) { await openProjectObj(normalizeProject({ ...j, id: uid(), updatedAt: Date.now() })); return toast('Project imported', 'ok'); }
    } catch { /* plain JSON text */ }
  }
  if (f.ext === 'srt' || f.ext === 'vtt') text = text.replace(/^WEBVTT.*$/m, '').split(/\r?\n/).filter(l => !/^\d+$/.test(l.trim()) && !/-->/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  else if (f.ext === 'html' || f.ext === 'htm') text = (new DOMParser().parseFromString(text, 'text/html').body.textContent || '').trim();
  else if (f.ext === 'rtf') text = text.replace(/\\par[d]?/g, '\n').replace(/\{\*?\\[^{}]+}|[{}]|\\\n?[A-Za-z]+\n?(?:-?\d+)?[ ]?/g, '').trim();
  if (intoSource) { brief().source = text; brief().useEditorAsSource = false; renderBrief(); markDirty(); return toast('Imported “' + f.name + '” into the source material', 'ok'); }
  const title = f.name.replace(/\.[^.]+$/, '');
  if (editor().value.trim()) {
    const p = newProject(brief().type);
    p.title = title; p.content = text; p.brief.mode = 'fix';
    await openProjectObj(p);
  } else {
    setEditorValue(text);
    $('#project-title').value = title;
    brief().mode = 'fix';
    renderBrief();
  }
  toast('Imported “' + f.name + '”. Choose Revise or Fix & Polish in the brief, or use Assist.', 'ok');
}
function exportHTML() {
  const p = state.project, a = state.analysis, r = buildPerform(editor().value, false);
  const css = 'body{font:15px/1.7 "Segoe UI",system-ui,sans-serif;color:#161a26;max-width:780px;margin:40px auto;padding:0 24px}h1{margin:0 0 4px}.meta{color:#667;margin-bottom:28px;font-size:13px}' +
    '.blk{margin:0 0 6px}.blk-heading{font-weight:800;margin:22px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px;text-transform:uppercase;font-size:13px;color:#555}.blk-heading.md{text-transform:none;font-size:17px;color:#161a26}' +
    '.spk{display:inline-block;font-size:11px;font-weight:800;padding:1px 7px;border-radius:5px;margin-right:8px;color:#fff}.paren{color:#777;font-style:italic}.blk-visual{color:#0369a1;font-size:13px;border-left:3px solid #38bdf8;padding-left:10px}' +
    '.cue{display:inline-block;border:1px solid #ccd;border-radius:99px;padding:0 10px;font-size:12px;font-weight:600;background:#f4f5fb}.cue .pi{display:none}.cue small{color:#889}';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(p.title) + '</title><style>' + css + '</style></head><body><h1>' + esc(p.title) + '</h1><div class="meta">' +
    esc(K.typeOf(brief().type).label) + ' · ' + a.words.toLocaleString() + ' words · est. ' + K.fmtTime(a.seconds) + ' · ' + new Date().toLocaleDateString() + '</div>' + r.html + '</body></html>';
}
function toSRT() {
  const r = buildPerform(editor().value, false), rate = wpm();
  const out = []; let t = 0, n = 1;
  const ts = s => { const ms = Math.round(s * 1000); const p = (x, l) => String(x).padStart(l || 2, '0'); return p(Math.floor(ms / 3600000)) + ':' + p(Math.floor(ms % 3600000 / 60000)) + ':' + p(Math.floor(ms % 60000 / 1000)) + ',' + p(ms % 1000, 3); };
  for (const it of r.seq) {
    if (it.type === 'pause') { t += it.seconds; continue; }
    if (it.type !== 'speech') continue;
    const words = it.text.split(/\s+/);
    for (let i = 0; i < words.length; i += 10) {
      const chunk = words.slice(i, i + 10), d = chunk.length / rate * 60;
      out.push(n++ + '\n' + ts(t) + ' --> ' + ts(t + d) + '\n' + chunk.join(' ') + '\n');
      t += d;
    }
  }
  return out.join('\n');
}
async function exportAs(fmt) {
  await saveNow();
  const p = state.project, text = editor().value;
  if (!text.trim() && fmt !== 'json') return toast('Nothing to export yet.', 'err');
  const content = fmt === 'txt' ? text : fmt === 'md' ? '# ' + p.title + '\n\n' + text
    : fmt === 'fountain' ? 'Title: ' + p.title + '\nCredit: Written with Scripty\nDraft date: ' + new Date().toLocaleDateString() + '\n\n' + text
    : fmt === 'html' || fmt === 'pdf' ? exportHTML() : fmt === 'srt' ? toSRT() : JSON.stringify(p, null, 2);
  try {
    const path = await api.exportFile({ format: fmt, name: p.title, content });
    if (path) toast('Exported ' + fmt.toUpperCase(), 'ok', { label: 'Show file', fn: () => api.reveal(path) });
  } catch (e) { toast('Export failed: ' + cleanErr(e), 'err'); }
}

// ================= teleprompter =================
const pr = { playing: false, pos: 0, last: 0 };
function prompterHTML(text, showCues) {
  return text.split(/\r?\n/).map(line => {
    let h = esc(line);
    h = h.replace(/\[(SFX|SOUND|FX|MUSIC|AMBIENCE|AMBIENT|PAUSE|BEAT|BREATH)\b[^\]]*\]/gi, m => showCues ? '<span class="pc">' + m + '</span>' : '');
    h = h.replace(/^(\s*)([A-Z][A-Za-z0-9'. -]{0,28}?)(\s*\([^)]*\))?:/, (m, s, n, par) => s + '<span class="ps">' + n + ':</span>' + (par ? '<span class="pc">' + par + '</span>' : ''));
    h = h.replace(/\([^)]*\)/g, m => '<span class="pc">' + m + '</span>').replace(/^#+\s*/, '');
    return h;
  }).join('\n');
}
function openPrompter() {
  const text = editor().value;
  if (!text.trim()) return toast('Nothing to show in the teleprompter yet.');
  $('#prompter-text').innerHTML = prompterHTML(text, $('#pr-cues').checked);
  $('#prompter').classList.remove('hidden');
  pr.pos = 0; $('#prompter-scroll').scrollTop = 0;
  stylePrompter();
}
function stylePrompter() { const t = $('#prompter-text'); t.style.fontSize = $('#pr-size').value + 'px'; t.classList.toggle('mirror', $('#pr-mirror').checked); }
function prompterToggle() {
  pr.playing = !pr.playing;
  const b = $('[data-action="prompter-play"]');
  b.innerHTML = ic(pr.playing ? 'stop' : 'play') + '<span>' + (pr.playing ? 'Pause' : 'Start') + '</span>';
  if (!pr.playing) return;
  const sc = $('#prompter-scroll');
  pr.pos = sc.scrollTop; pr.last = performance.now();
  const step = now => {
    if (!pr.playing) return;
    pr.pos += Number($('#pr-speed').value) * (now - pr.last) / 1000; pr.last = now;
    sc.scrollTop = pr.pos;
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) { prompterToggle(); return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function closePrompter() { if (pr.playing) prompterToggle(); $('#prompter').classList.add('hidden'); }

// ================= actions (event delegation) =================
const ACTIONS = {
  'new-project': () => newScript(),
  'new-from-type': el => newScript(el.dataset.type),
  'open-project': el => openProject(el.dataset.id),
  'dup-project': async el => { const p = await api.loadProject(el.dataset.id); if (!p) return; await api.saveProject({ ...p, id: uid(), title: p.title + ' (copy)', updatedAt: Date.now() }); renderProjects(); toast('Duplicated', 'ok'); },
  'del-project': async el => {
    if (!(await confirmModal('Delete this project permanently? This cannot be undone.', 'Delete'))) return;
    await api.deleteProject(el.dataset.id);
    if (el.dataset.id === state.project.id) { state.project = null; await newScript(); await setView('projects'); }
    renderProjects();
  },
  import: () => importFile(false),
  'import-source': () => importFile(true),
  'export-menu': el => openMenu(el, [
    { label: 'PDF document', icon: 'file', onClick: () => exportAs('pdf') }, { label: 'Web page (HTML)', icon: 'globe', onClick: () => exportAs('html') },
    { label: 'Plain text', icon: 'file', onClick: () => exportAs('txt') }, { label: 'Markdown', icon: 'file', onClick: () => exportAs('md') },
    { label: 'Fountain screenplay', icon: 'film', onClick: () => exportAs('fountain') }, { label: 'Subtitles (SRT, timed)', icon: 'msg', onClick: () => exportAs('srt') }, '-',
    { label: 'Copy script to clipboard', icon: 'copy', onClick: () => { navigator.clipboard.writeText(editor().value); toast('Copied', 'ok'); } },
    { label: 'Scripty project (.json)', icon: 'save', onClick: () => exportAs('json') }]),
  teleprompter: () => openPrompter(),
  'prompter-play': () => prompterToggle(),
  'prompter-close': () => closePrompter(),
  'toggle-theme': () => setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark'),
  'set-theme': el => setTheme(el.dataset.v),
  'set-accent': el => { state.settings.accent = el.dataset.v; applySettings(); saveSettings(); renderSettings(); },
  shortcuts: () => openModal({ title: 'Keyboard shortcuts', body: [['Ctrl+Enter', 'Generate / stop'], ['Ctrl+S', 'Save snapshot'], ['Ctrl+F', 'Find & replace'], ['Ctrl+P', 'Toggle Write / Perform'], ['Ctrl+T', 'Teleprompter'],
    ['Ctrl+N', 'New script'], ['Ctrl+O', 'Projects'], ['Ctrl+E', 'Export menu'], ['Esc', 'Stop sounds & reading, close dialogs'], ['Space / ↑ ↓', 'Teleprompter play · speed']]
    .map(([k, d]) => '<div class="switch-row"><span>' + d + '</span><span>' + k.split(' / ').map(x => '<span class="kbd">' + x + '</span>').join(' ') + '</span></div>').join(''), actions: [{ label: 'Close', primary: true }] }),
  'open-data': () => api.openData(),
  'open-url': el => api.openExternal(el.dataset.url),
  'goto-providers': (el, e) => { e.preventDefault(); setView('providers'); },
  'model-menu': el => openModelMenu(el),
  'copy-text': el => { navigator.clipboard.writeText(el.dataset.v); toast('Copied', 'ok'); },
  'remote-update': async el => {
    const { sent } = await api.remotePushUpdate(el.dataset.id);
    toast(sent ? 'Update sent to ' + el.dataset.name + '. The phone downloads it, installs it and restarts Scripty Remote.' : el.dataset.name + ' is not connected right now. Open Scripty Remote on it and try again.', sent ? 'ok' : 'err');
  },
  'remote-qr': el => { state.remoteQr = Number(el.dataset.i) || 0; renderRemote(); },
  'remote-newcode': async () => { state.remote = await api.remoteNewCode(); renderRemote(); },
  'remote-revoke': async el => {
    if (!(await confirmModal('Unlink this device? It will need a new code to connect again.', 'Unlink'))) return;
    state.remote = await api.remoteRevoke(el.dataset.id); renderRemote();
  },
  'remote-port': async () => { state.remote = await api.remotePort(Number($('#remote-port').value)); lastRemoteJSON = ''; renderRemote(); },
  // brief
  'engine-mode': el => { state.settings.engine.mode = el.dataset.mode; saveSettings(); renderBrief(); },
  'room-add': () => { const used = state.settings.engine.room.map(m => m.provider); const next = Object.values(state.providers).find(p => p.ready && !used.includes(p.id)) || Object.values(state.providers)[0];
    state.settings.engine.room.push({ provider: next.id, model: '' }); saveSettings(); renderBrief(); },
  'room-rm': el => { state.settings.engine.room.splice(+el.dataset.i, 1); saveSettings(); renderBrief(); },
  'set-mode': el => { brief().mode = el.dataset.mode; markDirty(); renderBrief(); },
  'source-mode': el => { brief().useEditorAsSource = el.dataset.v === 'editor'; markDirty(); renderBrief(); },
  'toggle-tone': el => { const t = brief().tones, v = el.dataset.v; const i = t.indexOf(v); if (i >= 0) t.splice(i, 1); else t.push(v); el.classList.toggle('on'); markDirty(); },
  'toggle-option': el => { const o = brief().options, v = el.dataset.v; const i = o.indexOf(v); if (i >= 0) o.splice(i, 1); else o.push(v); el.classList.toggle('on'); markDirty(); },
  'focus-tag': (el, e) => { if (e.target === el) $('#tag-in').focus(); },
  'rm-tag': el => { brief().tags.splice(+el.dataset.i, 1); markDirty(); renderBrief(); $('#tag-in').focus(); },
  people: el => { const b = brief(); b.people = Math.max(1, Math.min(20, b.people + Number(el.dataset.d))); while (b.characters.length < b.people) b.characters.push({ name: '', notes: '' }); b.characters.length = b.people; markDirty(); renderBrief(); },
  'detect-cast': () => {
    const names = Object.keys(state.analysis.speakers);
    if (!names.length) return toast('No speakers found. Lines need to look like “NAME: text”.');
    const b = brief(), old = b.characters;
    b.people = names.length;
    b.characters = names.map(n => { const o = old.find(c => c.name.toUpperCase() === n); return { name: o ? o.name : cap(n.toLowerCase()), notes: o ? o.notes : '' }; });
    markDirty(); renderBrief(); toast('Found ' + names.length + ' speakers', 'ok');
  },
  brainstorm: () => brainstorm(),
  'use-idea': el => { const b = brief(); b.ideas = (b.ideas ? b.ideas.trim() + '\n' : '') + el.dataset.v; const ta = $('[data-bind="brief.ideas"]'); if (ta) ta.value = b.ideas; el.remove(); markDirty(); },
  'preview-prompt': () => previewPrompt(),
  generate: () => generate(),
  // editor
  'editor-mode': el => setEditorMode(el.dataset.mode),
  'insert-menu': el => openMenu(el, [
    { label: 'Sound effect cue', hint: '[SFX: ]', icon: 'wave', onClick: () => insertSnippet('[SFX: ]', 1) },
    { label: 'Music cue', hint: '[MUSIC: ]', icon: 'music', onClick: () => insertSnippet('[MUSIC: ]', 1) },
    { label: 'Pause', hint: '[PAUSE 3s]', icon: 'timer', onClick: () => insertSnippet('[PAUSE 3s]') },
    { label: 'Speaker line', hint: 'NAME:', icon: 'users', onClick: () => { const c = brief().characters.find(x => x.name); insertSnippet((c ? c.name.toUpperCase() : 'NAME') + ': '); } },
    { label: 'Scene heading', hint: 'INT.', icon: 'film', onClick: () => insertSnippet('INT. LOCATION - DAY') },
    { label: 'Section with timestamp', hint: '##', icon: 'list', onClick: () => insertSnippet('## [' + K.fmtTime(state.analysis.seconds) + '] Section') },
    { label: 'Visual / B-roll note', hint: 'VISUAL:', icon: 'eye', onClick: () => insertSnippet('VISUAL: ') }]),
  find: () => { $('#findbar').classList.remove('hidden'); const sel = selectionText(); if (sel && sel.length < 80) $('#find-q').value = sel; $('#find-q').focus(); $('#find-q').select(); updateFindCount(); },
  'find-next': () => findNext(), 'replace-one': () => replaceOne(), 'replace-all': () => replaceAll(),
  'find-close': () => $('#findbar').classList.add('hidden'),
  snapshot: () => { const before = state.project.snapshots.length; snapshot('Manual snapshot'); saveNow(); toast(state.project.snapshots.length > before ? 'Snapshot saved' : 'Nothing new to snapshot', 'ok'); },
  'font-down': () => { state.settings.editorSize = Math.max(12, state.settings.editorSize - 1); applySettings(); saveSettings(); },
  'font-up': () => { state.settings.editorSize = Math.min(28, state.settings.editorSize + 1); applySettings(); saveSettings(); },
  'toggle-brief': () => { state.settings.hideBrief = !state.settings.hideBrief; applySettings(); saveSettings(); },
  'toggle-tools': () => { state.settings.hideTools = !state.settings.hideTools; applySettings(); saveSettings(); },
  'play-cue': el => playCueLabel(el.dataset.label, el.id),
  'read-from': (el, e) => { if (e.target.closest('.cue')) return; stopRead(); tableRead(+el.dataset.seq); },
  'read-play': () => tableRead(0),
  'read-stop': () => stopRead(),
  voices: () => voicesModal(),
  // tools
  'cancel-run': el => { const r = state.project.runs.find(x => x.id === el.dataset.run); if (r) cancelRun(r); },
  'rm-run': el => { state.project.runs = state.project.runs.filter(x => x.id !== el.dataset.run); markDirty(); renderTool(); },
  'clear-runs': () => { state.project.runs = state.project.runs.filter(r => state.liveRuns.has(r.id)); markDirty(); renderTool(); },
  lane: el => { const r = state.project.runs.find(x => x.id === el.dataset.run); if (r) { r.activeLane = el.dataset.lane; renderTool(); } },
  'lane-use': el => laneAct(el, 'replace'), 'lane-insert': el => laneAct(el, 'insert'), 'lane-append': el => laneAct(el, 'append'),
  'lane-copy': el => { const l = findLane(el); if (l) { navigator.clipboard.writeText(cleanOutput(l.text)); toast('Copied', 'ok'); } },
  assist: el => { const a = K.ASSIST_ACTIONS[el.dataset.k]; assist(a.prompt, a.label); },
  'assist-custom': () => { const v = $('#custom-instr').value.trim(); if (!v) return toast('Describe the change first.'); assist(v, 'Custom edit'); },
  'assist-tone': () => { const t = $('#tone-sel').value; assist('Rewrite this in a more ' + t.toLowerCase() + ' tone, keeping the content, structure and cues.', 'Retone: ' + t); },
  'assist-translate': () => { const l = $('#lang-sel').value; assist('Translate this into ' + l + '. Keep speaker names, cue tags like [SFX: …] (translate their descriptions), formatting and timing natural for ' + l + ' speakers.', 'Translate: ' + l); },
  'assist-convert': () => { const t = K.typeOf($('#convert-type').value); assist('Convert this into a ' + t.label + ' script. ' + t.guide, 'Convert to ' + t.label); },
  tool: el => runTool(el.dataset.k),
  ask: () => { const q = $('#ask-q').value.trim(); if (!q) return; runTool(null, 'Answer this question about the script concisely and specifically: ' + q); },
  'fit-length': () => {
    const plan = targetPlan(), a = state.analysis, over = a.seconds > plan.seconds;
    assist((over ? 'Trim' : 'Expand') + ' this script to about ' + plan.words + ' spoken words (it has ' + a.spokenWords + ' now). Keep the structure, voice, cues and best lines; ' +
      (over ? 'cut repetition, filler and the weakest beats.' : 'add depth, examples and beats that fit the brief.'), over ? 'Trim to length' : 'Expand to length', true);
  },
  'play-all-cues': async () => { for (const c of state.analysis.cues.filter(x => x.kind !== 'pause')) { const p = playCueLabel(c.label, null, 4); if (p) await p; } },
  'board-play': (el, e) => {
    if (e.target.closest('[data-action="board-insert"]')) return;
    if (e.shiftKey) { insertSnippet('[SFX: ' + el.dataset.name.toLowerCase() + ']'); setView('studio'); return; }
    el.classList.add('playing'); Sound.play(el.dataset.id).then(() => el.classList.remove('playing'));
  },
  'board-insert': el => { setView('studio'); insertSnippet('[SFX: ' + el.dataset.name.toLowerCase() + ']'); toast('Inserted cue', 'ok'); },
  'snap-view': el => { const s = state.project.snapshots.find(x => x.id === el.dataset.id); if (s) openModal({ title: s.label + ' · ' + new Date(s.t).toLocaleString(), wide: true, body: '<pre>' + esc(s.content) + '</pre>', actions: [{ label: 'Close' }, { label: 'Restore this version', primary: true, onClick: () => restoreSnapshot(s.id, true) }] }); },
  'snap-restore': el => restoreSnapshot(el.dataset.id, true),
  'snap-rm': el => { state.project.snapshots = state.project.snapshots.filter(x => x.id !== el.dataset.id); markDirty(); renderTool(); },
  // sounds page
  'stop-sounds': () => Sound.stopAll(),
  'sfx-import': async () => { state.sfxLib = await api.sfxImport(); renderSounds(); },
  'lib-play': el => { const s = state.sfxLib.find(x => x.id === el.dataset.id); if (s) Sound.play(s); },
  'lib-rm': async el => { if (!(await confirmModal('Remove this sound from your library?', 'Remove'))) return; state.sfxLib = await api.sfxRemove(el.dataset.id); renderSounds(); },
  // providers
  'save-key': async el => {
    const id = el.dataset.id, v = $('#key-' + id).value.trim();
    if (!v) return toast('Paste a key first.');
    state.providers[id] = await api.setKey(id, v);
    toast(pname(id) + ' key saved' + (state.info.encryption ? ' and encrypted' : ''), 'ok');
    renderProviders(); renderBrief();
    api.models(id).then(m => { state.providers[id].models = m; renderDatalists(); renderProviders(); }).catch(() => {});
  },
  'clear-key': async el => { state.providers[el.dataset.id] = await api.setKey(el.dataset.id, ''); renderProviders(); renderBrief(); toast('Key removed'); },
  'load-models': async el => {
    const id = el.dataset.id; el.disabled = true;
    try { const m = await api.models(id, state.providers[id].baseUrl || undefined); state.providers[id].models = m; renderDatalists(); renderProviders(); toast(m.length + ' models loaded for ' + pname(id), 'ok'); }
    catch (e) { toast(cleanErr(e), 'err'); } finally { el.disabled = false; }
  },
  'test-provider': async el => {
    const id = el.dataset.id, out = $('#pvt-' + id), t0 = performance.now();
    out.innerHTML = '<span class="spinner"></span> Testing…';
    try {
      const txt = await callAI({ provider: id, model: '' }, 'You are a connection test.', 'Reply with exactly: OK', null, null, { maxTokens: 60, temperature: 0 });
      out.innerHTML = '<span style="color:var(--ok)">✓ Connected in ' + Math.round(performance.now() - t0) + ' ms</span>' + (txt ? ' · “' + esc(txt.trim().slice(0, 24)) + '”' : '');
    } catch (e) { out.innerHTML = '<span style="color:var(--err)">' + esc(cleanErr(e)) + '</span>'; }
  },
};
function findLane(el) { const r = state.project.runs.find(x => x.id === el.dataset.run); return r && r.lanes.find(l => l.id === el.dataset.lane); }
function laneAct(el, how) { const r = state.project.runs.find(x => x.id === el.dataset.run), l = findLane(el); if (r && l) { applyLane(r, l, how); renderToolIf('runs'); } }

function bindEvents() {
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-view]');
    if (nav && nav.closest('#rail')) return setView(nav.dataset.view);
    const tab = e.target.closest('#tool-tabs [data-tool]');
    if (tab) return setTool(tab.dataset.tool);
    const a = e.target.closest('[data-action]');
    if (a && ACTIONS[a.dataset.action]) { Promise.resolve(ACTIONS[a.dataset.action](a, e)).catch(err => toast(cleanErr(err), 'err')); }
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.bind) onBind(el);
    else if (el.dataset.lab) { if (el.tagName !== 'SELECT' && el.type !== 'checkbox') labInput(el, false); }
    else if (el.dataset.pbind) saveProviderField(el);
    else if (el.id === 'editor') onEditorInput();
    else if (el.id === 'project-title') { markDirty(); }
    else if (el.id === 'project-search') renderProjects();
    else if (el.id === 'matcher-q') { const m = K.matchSound(el.value, state.sfxLib, K.BUILTIN_SOUNDS); $('#matcher-out').innerHTML = !el.value.trim() ? '' : m ? '→ <b>' + esc(m.name) + '</b> ' + (m.path ? '(your library)' : '(built-in)') : 'No match'; if (m) Sound.play(m, 3); }
    else if (el.id === 'sfx-volume') { state.settings.sfxVolume = Number(el.value); Sound.setVolume(el.value); saveSettings(); }
    else if (el.id === 'read-rate') { state.settings.readRate = Number(el.value); saveSettings(); }
    else if (el.id === 'find-q' || el.id === 'find-case') updateFindCount();
    else if (el.id === 'pr-size' || el.id === 'pr-mirror') stylePrompter();
    else if (el.id === 'pr-cues') $('#prompter-text').innerHTML = prompterHTML(editor().value, el.checked);
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.override != null) { if (el.value) state.project.sfxOverrides[el.dataset.override] = el.value; else delete state.project.sfxOverrides[el.dataset.override]; markDirty(); renderTool(); if (state.editorMode === 'perform') renderPerform(); }
    else if (el.dataset.lib) saveLibField(el);
    else if (el.dataset.lab && (el.tagName === 'SELECT' || el.type === 'checkbox')) labInput(el, true);
    else if (el.id === 'hk-global') { state.settings.hotkeys.global = el.checked; saveSettings(); applyHotkeys(); }
    else if (el.id === 'read-sfx') { state.settings.readSfx = el.checked; saveSettings(); }
    else if (el.id === 'remote-on') {
      api.remoteEnable(el.checked).then(s => { state.remote = s; lastRemoteJSON = ''; $('#remote-dot').classList.toggle('hidden', !s.running); renderRemote(); pushRemote(); })
        .catch(err => toast(cleanErr(err), 'err'));
    }
  });
  const ed = editor();
  ['select', 'keyup', 'mouseup'].forEach(ev => ed.addEventListener(ev, () => renderStatus()));
  document.addEventListener('keydown', e => {
    if (hkCapture) {
      e.preventDefault();
      const acc = e.key === 'Escape' ? null : K.accelFromEvent(e);
      if (e.key !== 'Escape' && !acc) return toast('Use an F-key, or hold Ctrl/Alt/Shift with a letter so typing never fires a sound.');
      if (acc) { state.settings.hotkeys[hkCapture] = acc; saveSettings(); applyHotkeys(); }
      hkCapture = null; renderSettings(); renderToolIf('cues'); return;
    }
    const acc = K.accelFromEvent(e), hk = state.settings.hotkeys;
    const act = acc && (!hk.global || hkFailed.includes(acc)) && ['next', 'replay', 'stop'].find(a => hk[a] === acc); // global keys arrive via onHotkey instead
    if (act) { e.preventDefault(); runHotkey(act); return; }
    if (!$('#prompter').classList.contains('hidden')) {
      if (e.key === 'Escape') closePrompter();
      else if (e.key === ' ') { e.preventDefault(); prompterToggle(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const s = $('#pr-speed'); s.value = Number(s.value) + (e.key === 'ArrowUp' ? 5 : -5); }
      return;
    }
    if (e.target.id === 'tag-in' && (e.key === 'Enter' || e.key === ',')) {
      e.preventDefault();
      const v = e.target.value.trim().replace(/,$/, '');
      if (v && !brief().tags.includes(v)) { brief().tags.push(v); markDirty(); renderBrief(); $('#tag-in').focus(); }
      return;
    }
    if (e.target.id === 'tag-in' && e.key === 'Backspace' && !e.target.value && brief().tags.length) { brief().tags.pop(); markDirty(); renderBrief(); $('#tag-in').focus(); return; }
    if (e.target.id === 'find-q' && e.key === 'Enter') { e.preventDefault(); findNext(); return; }
    if (e.key === 'Escape') { if ($('#modal-root').innerHTML) { $('#modal-root').innerHTML = ''; return; } closeMenu(); stopRead(); Sound.stopAll(); $('#findbar').classList.add('hidden'); return; }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    const map = { enter: () => generate(), s: () => ACTIONS.snapshot(), f: () => ACTIONS.find(), p: () => setEditorMode(state.editorMode === 'edit' ? 'perform' : 'edit'),
      t: () => openPrompter(), n: () => newScript(), o: () => setView('projects'), e: () => ACTIONS['export-menu']($('[data-action="export-menu"]')) };
    if (map[k]) { e.preventDefault(); if (state.view !== 'studio' && ['enter', 'f', 'p'].includes(k)) setView('studio'); map[k](); }
  });
  window.addEventListener('beforeunload', () => { if (state.dirty) saveNow(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applySettings());
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
}
const providerSavers = {};
function saveProviderField(el) {
  const id = el.dataset.id, field = el.dataset.pbind;
  state.providers[id][field] = el.value.trim();
  clearTimeout(providerSavers[id + field]);
  providerSavers[id + field] = setTimeout(async () => { const p = await api.setProvider(id, { [field]: el.value.trim() }); state.providers[id] = { ...state.providers[id], ...p }; renderDatalists(); }, 500);
}
async function saveLibField(el) {
  const s = state.sfxLib.find(x => x.id === el.dataset.id);
  if (!s) return;
  const f = el.dataset.lib;
  s[f] = f === 'keywords' ? el.value.split(',').map(x => x.trim()).filter(Boolean) : f === 'volume' ? Number(el.value) : el.value;
  state.sfxLib = await api.sfxUpdate(s);
}

// ================= live cue deck: next-cue hotkey, replay, recorded timing =================
const deck = { i: 0, last: -1, rec: null, t0: 0, timers: [] };
let hkCapture = null, hkFailed = [];
const deckCues = () => state.analysis.cues.filter(c => c.kind !== 'pause');
function deckPlay(idx) {
  const c = deckCues()[idx];
  if (!c) return;
  deck.last = idx;
  if (deck.rec) deck.rec.push({ label: c.label, t: Math.round(performance.now() - deck.t0) / 1000 });
  playCueLabel(c.label); // Sound.play makes every hit a fresh variation
  renderDeck();
}
function deckNext() {
  const n = deckCues().length;
  if (!n) return toast('No [SFX: …] cues in this script yet.');
  if (deck.i >= n) { deck.i = 0; toast('Back to the first cue.'); }
  deckPlay(deck.i++);
}
function deckReplay() { if (deck.last >= 0 && deck.last < deckCues().length) deckPlay(deck.last); else deckNext(); }
function deckStop() { deck.timers.forEach(clearTimeout); deck.timers = []; Sound.stopAll(); renderDeck(); }
function runHotkey(a) { if (a === 'next') deckNext(); else if (a === 'replay') deckReplay(); else if (a === 'stop') deckStop(); }
const hkLabel = a => esc((state.settings.hotkeys || {})[a] || '—');
function deckHTML() {
  const cues = deckCues(), next = cues[deck.i], timing = state.project.cueTiming || [];
  return '<div class="tool-section deck" id="deck-box"><h4>' + ic('zap') + 'Live cue deck</h4>' +
    '<div class="deck-next">' + (cues.length ? 'Next: <b>' + esc(next ? next.label : 'back to the first cue') + '</b> <span class="hint">' + Math.min(deck.i + 1, cues.length) + ' / ' + cues.length + '</span>' : '<span class="hint">No cues yet.</span>') + '</div>' +
    '<div class="row gap wrap"><button class="btn sm primary" data-action="deck-next">' + ic('play') + 'Next <kbd>' + hkLabel('next') + '</kbd></button>' +
      '<button class="btn sm" data-action="deck-replay">' + ic('refresh') + 'Replay <kbd>' + hkLabel('replay') + '</kbd></button>' +
      '<button class="btn sm ghost" data-action="deck-stop">' + ic('stop') + 'Stop <kbd>' + hkLabel('stop') + '</kbd></button>' +
      '<button class="btn sm ghost" data-action="deck-reset" title="Start again from the first cue">' + ic('history') + 'Restart</button></div>' +
    '<div class="row gap wrap"><button class="btn sm' + (deck.rec ? ' danger' : '') + '" data-action="deck-rec">' + ic(deck.rec ? 'stop' : 'mic') + (deck.rec ? 'Stop recording (' + deck.rec.length + ' presses)' : 'Record timing') + '</button>' +
      (timing.length ? '<button class="btn sm" data-action="deck-play-timed">' + ic('timer') + 'Play timed · ' + timing.length + ' cues over ' + (Number(timing[timing.length - 1].t) || 0).toFixed(1) + 's</button>' : '') + '</div>' +
    '<div class="hint">Every press plays a new variation of the sound. Record timing remembers when you pressed Next; Play timed fires the same cues on the same beats.</div></div>';
}
function renderDeck() { const el = $('#deck-box'); if (el) el.outerHTML = deckHTML(); }
function applyHotkeys() {
  return api.setHotkeys(state.settings.hotkeys).then(r => {
    hkFailed = r.failed;
    if (r.failed.length) toast('Could not use ' + r.failed.join(', ') + ' system-wide (another app has it). It still works inside Scripty.', 'err');
  });
}

async function generateSound(desc, btn) {
  desc = String(desc || '').trim();
  if (!desc) return toast('Describe the sound first.');
  const m = primaryMember();
  if (!checkReady([m])) return;
  const out = $('#gen-out');
  if (btn) btn.disabled = true;
  if (out) out.innerHTML = '<span class="spinner"></span> ' + esc(pname(m.provider)) + ' is designing “' + esc(desc) + '”…';
  try {
    const p = K.soundRecipePrompt(desc);
    const ask = () => callAI(m, p.system, p.user, null, null, { temperature: 0.7, maxTokens: 4000 });
    let recipe;
    try { recipe = K.parseSoundRecipe(await ask()); }
    catch { if (out) out.innerHTML = '<span class="spinner"></span> That design came back garbled — asking again…'; recipe = K.parseSoundRecipe(await ask()); } // small models: one retry
    // The description's own words always match, so a cue that asked for this sound finds it.
    recipe.keywords = [...new Set([...desc.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2), ...recipe.keywords])].slice(0, 12);
    Sound.play({ id: 'ai-preview', recipe });
    state.sfxLib = await api.sfxAddGenerated(recipe, desc);
    if (state.view === 'sounds') renderSounds();
    renderToolIf('cues');
    if (out) out.innerHTML = 'Added <b>' + esc(recipe.name) + '</b> to your library · keywords: ' + esc(recipe.keywords.join(', '));
    toast('AI sound “' + recipe.name + '” added to your library', 'ok');
  } catch (e) { if (out) out.textContent = cleanErr(e); toast(cleanErr(e), 'err'); }
  finally { if (btn) btn.disabled = false; }
}
Object.assign(ACTIONS, {
  'deck-next': () => deckNext(), 'deck-replay': () => deckReplay(), 'deck-stop': () => deckStop(),
  'deck-reset': () => { deck.i = 0; deck.last = -1; renderDeck(); },
  'deck-rec': () => {
    if (deck.rec) {
      if (deck.rec.length) { state.project.cueTiming = deck.rec; markDirty(); toast('Saved timing for ' + deck.rec.length + ' cues', 'ok'); }
      deck.rec = null;
    } else { deckStop(); deck.i = 0; deck.last = -1; deck.rec = []; deck.t0 = performance.now(); toast('Recording — press Next (' + (state.settings.hotkeys.next || 'button') + ') on each beat.'); }
    renderDeck();
  },
  'deck-play-timed': () => {
    deckStop();
    for (const m of state.project.cueTiming || []) deck.timers.push(setTimeout(() => playCueLabel(m.label), Math.max(0, Number(m.t) || 0) * 1000));
    toast('Playing your recorded timing. Stop ends it.');
  },
  'gen-sound': el => generateSound($('#gen-q').value, el),
  'gen-cue': el => generateSound(el.dataset.label, el),
  'hk-capture': el => { hkCapture = el.dataset.a; el.textContent = 'Press a key… (Esc cancels)'; },
});

// ================= Model Lab =================
const ML = window.ModelLab;
const LAB_PROFILES = { idle: ['Idle (nothing else running)', 0], obs: ['OBS live / streaming', 3], gaming: ['Gaming', 6], custom: ['Custom reserve', null] };
const LAB_DEFAULTS = { profile: { source: 'local', preset: 'idle', reserveGiB: 0, manual: { host: '', totalGiB: 24, freeGiB: 22, ramGiB: 64 } },
  workload: { context: 4096, concurrency: 1 }, route: 'scratch', design: { ...ML.PRESETS.proof }, base: 'Qwen/Qwen2.5-1.5B-Instruct', loraRank: 16, tokenizer: 'new',
  name: 'my-scripty-model', epochs: 3, teacher: { provider: 'anthropic', model: '' }, autoLearn: false, filters: { q: '', fitOnly: false, installedOnly: false } };
function withLabDefaults(s) {
  const d = LAB_DEFAULTS, p = (s && s.profile) || {};
  s = s || {};
  return { ...d, ...s, profile: { ...d.profile, ...p, manual: { ...d.profile.manual, ...(p.manual || {}) } }, workload: { ...d.workload, ...(s.workload || {}) },
    design: { ...d.design, ...(s.design || {}) }, teacher: { ...d.teacher, ...(s.teacher || {}) }, filters: { ...d.filters, ...(s.filters || {}) } };
}
const lab = { hw: null, catalog: null, sources: [], examples: null, loading: false, pull: null };
const saveLab = debounce(() => api.labSet(state.lab), 400);
const fmtParams = n => (n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : Math.max(1, Math.round(n / 1e6)) + 'M');
const gib = x => (Math.round(x * 10) / 10) + ' GiB';
/** The machine the model will run on: this PC's largest NVIDIA GPU, or a manual profile for another machine on the network. */
function labHW() {
  const p = state.lab.profile;
  if (p.source === 'manual') { const m = p.manual; return { totalGiB: Number(m.totalGiB) || 0, freeGiB: Number(m.freeGiB) || 0, budgetGiB: ML.effectiveBudget(m.freeGiB, p.reserveGiB), label: m.host || 'Other machine' }; }
  // ponytail: one GPU (the largest); splitting a model across GPUs depends on the backend, so capacity is never summed.
  const g = lab.hw && [...lab.hw.gpus].sort((a, b) => b.totalGiB - a.totalGiB)[0];
  if (!g) return { totalGiB: 0, freeGiB: 0, budgetGiB: 0, label: lab.hw ? 'No NVIDIA GPU detected' : 'Scanning…' };
  return { totalGiB: g.totalGiB, freeGiB: g.freeGiB, budgetGiB: ML.effectiveBudget(g.freeGiB, p.reserveGiB), label: g.name };
}
const FIT_PILL = { fits: ['Fits', 'ok'], borderline: ['Borderline', 'warn'], incompatible: ['Too large', 'err'], unknown: ['Unknown', ''] };
function fitHtml(est, hw) {
  const f = ML.fitStatus(est.range, hw), [t, c] = FIT_PILL[f.status];
  const range = est.range ? est.range[0] + '–' + est.range[1] + ' GiB' + (f.pct ? ' · ' + f.pct[0] + '–' + f.pct[1] + '% of ' + gib(hw.totalGiB) : '') : 'VRAM unknown';
  const extra = f.headroom ? ' · leaves ' + f.headroom[0] + '–' + f.headroom[1] + ' GiB' : f.shortfall ? ' · short by ' + f.shortfall[0] + '–' + f.shortfall[1] + ' GiB' : '';
  return { status: f.status, html: '<span class="pill ' + c + '" title="' + esc(f.reason) + '">' + t + '</span> <span class="hint">' + esc(range + extra + (est.range && est.confidence === 'rough' ? ' · rough estimate' : est.range ? ' · estimate' : '')) + '</span>' };
}
async function openLab() {
  renderLab();
  api.labHardware().then(h => { lab.hw = h; if (state.view === 'lab') renderLab(); }).catch(() => {}); // free VRAM changes as models load, so re-read on every visit
  if (!lab.catalog && !lab.loading) labRefresh(false);
  if (!lab.examples) { lab.examples = await api.labExamples(); if (state.view === 'lab') renderLab(); }
}
async function labRefresh(withHF) {
  const seq = lab.seq = (lab.seq || 0) + 1; // only the newest refresh may write the catalog
  lab.loading = true; renderLabCatalog();
  try {
    const r = await api.labCatalog(state.lab.filters.q, withHF);
    if (seq !== lab.seq) return;
    const keep = withHF ? [] : (lab.catalog || []).filter(v => v.source === 'huggingface' && !r.items.some(i => i.id === v.id));
    lab.catalog = [...r.items, ...keep];
    lab.sources = [...r.sources, ...(withHF ? [] : lab.sources.filter(s => s.id === 'huggingface'))];
  } catch (e) { if (seq === lab.seq) toast(cleanErr(e), 'err'); } finally { if (seq === lab.seq) { lab.loading = false; if (state.view === 'lab') renderLab(); } }
}
function labInput(el, full) {
  const keys = el.dataset.lab.split('.');
  const v = el.type === 'checkbox' ? el.checked : el.dataset.type === 'number' ? Number(el.value) : el.value;
  let o = state.lab;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = v;
  if (el.dataset.lab === 'profile.preset' && LAB_PROFILES[v] && LAB_PROFILES[v][1] != null) state.lab.profile.reserveGiB = LAB_PROFILES[v][1];
  saveLab();
  if (full) renderLab(); else renderLabLive();
}
function renderLabLive() { renderLabBudget(); renderLabCatalog(); renderLabDesignOut(); }

function renderLab() {
  if (!$('#lab-body')) return;
  const L = state.lab, p = L.profile, w = L.workload, hw = lab.hw;
  const num = (k, label, attrs) => '<div class="field"><label>' + label + '</label><input class="input" type="number" data-lab="' + k + '" data-type="number" ' + (attrs || '') + ' value="' + esc(k.split('.').reduce((o, x) => o[x], L)) + '"></div>';
  const local = !hw ? '<div class="hint"><span class="spinner"></span> Scanning this PC…</div>'
    : (hw.gpus.length ? hw.gpus.map(g => '<div class="list-row"><div class="meta"><b>' + esc(g.name) + '</b><span>' + gib(g.totalGiB) + ' VRAM · ' + gib(g.freeGiB) + ' free now · driver ' + esc(g.driver) + '</span></div></div>').join('')
      : '<div class="advice"><div class="warn">No NVIDIA GPU found (or nvidia-smi is unavailable). Models can still run on the CPU in Ollama, slowly. Using an AMD/Intel GPU or another machine? Choose "Another machine" and enter its memory.</div></div>') +
      '<div class="hint">' + esc(hw.cpu) + ' · ' + hw.cores + ' threads · ' + gib(hw.ramGiB) + ' RAM' + (hw.diskFreeGiB != null ? ' · ' + gib(hw.diskFreeGiB) + ' disk free' : '') + ' · read ' + timeAgo(hw.at) + '</div>' +
      '<button class="btn sm ghost" data-action="lab-rescan">' + ic('refresh') + 'Re-scan</button>';
  const manual = '<div class="field"><label>Machine name</label><input class="input" data-lab="profile.manual.host" placeholder="e.g. Studio PC (RTX 4090)" value="' + esc(p.manual.host) + '"></div>' +
    '<div class="lab-arch">' + num('profile.manual.totalGiB', 'GPU memory (GiB)', 'min="0" step="1"') + num('profile.manual.freeGiB', 'Free GPU memory', 'min="0" step="0.5"') + num('profile.manual.ramGiB', 'System RAM (GiB)', 'min="0"') + '</div>' +
    '<div class="hint">To list and run that machine\'s models, point Ollama at it on the AI page → Ollama → Server URL (for example <code>http://192.168.1.20:11434/v1</code>), then press Installed below.</div>';
  const teachers = Object.values(state.providers).filter(x => !x.local && x.id !== 'custom');
  $('#lab-body').innerHTML =
    '<div class="card"><h3>' + ic('monitor') + 'Your machine</h3>' +
      '<div class="seg full">' + [['local', 'This PC'], ['manual', 'Another machine']].map(([k, l]) => '<button data-action="lab-source" data-v="' + k + '" class="' + (p.source === k ? 'active' : '') + '">' + l + '</button>').join('') + '</div>' +
      (p.source === 'local' ? local : manual) +
      '<div class="two"><div class="field"><label>While it runs</label><select class="input" data-lab="profile.preset">' + Object.entries(LAB_PROFILES).map(([k, [l]]) => '<option value="' + k + '"' + (p.preset === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
        num('profile.reserveGiB', 'Keep free for other apps (GiB)', 'min="0" step="0.5"') + '</div>' +
      '<div class="two"><div class="field"><label>Context length</label><select class="input" data-lab="workload.context" data-type="number">' + [2048, 4096, 8192, 16384, 32768].map(n => '<option value="' + n + '"' + (w.context === n ? ' selected' : '') + '>' + n.toLocaleString() + ' tokens</option>').join('') + '</select></div>' +
        num('workload.concurrency', 'Simultaneous requests', 'min="1" max="8"') + '</div>' +
      '<div class="advice" id="lab-budget"></div></div>' +
    '<div class="card"><h3>' + ic('bulb') + 'Learning</h3>' +
      '<div class="switch-row"><div><div>Learn from results I accept</div><div class="hint">Each AI result you use in the editor is saved as a training example, prompt and answer. Examples stay on this PC.</div></div>' +
        '<label class="switch"><input type="checkbox" data-lab="autoLearn"' + (L.autoLearn ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="field"><label>Premium teacher</label><div class="row gap"><select class="input" data-lab="teacher.provider" style="max-width:170px">' + teachers.map(t => '<option value="' + t.id + '"' + (L.teacher.provider === t.id ? ' selected' : '') + '>' + esc(t.label) + (t.ready ? '' : ' (no key)') + '</option>').join('') + '</select>' +
        '<input class="input" data-lab="teacher.model" list="dl-' + esc(L.teacher.provider) + '" placeholder="' + esc(defModel(L.teacher.provider) || 'default model') + '" value="' + esc(L.teacher.model) + '" spellcheck="false"></div>' +
        '<div class="hint">The teacher writes its best answer for each saved prompt, and your model trains on those answers (distillation). Calls use that provider\'s API credit.</div></div>' +
      '<div class="row gap"><button class="btn sm primary" data-action="lab-distill">' + ic('sparkles') + 'Improve 10 with teacher</button><button class="btn sm ghost" data-action="lab-clear-examples">' + ic('trash') + 'Clear all</button></div>' +
      '<div id="lab-examples"></div></div>' +
    '<div class="card wide"><h3>' + ic('search') + 'Model catalog</h3>' +
      '<div class="row gap"><input class="input" id="lab-q" data-lab="filters.q" placeholder="Search name, family, task, quant… e.g. qwen coder q4" value="' + esc(L.filters.q) + '" spellcheck="false">' +
        '<button class="btn sm" data-action="lab-refresh">' + ic('refresh') + 'Installed</button><button class="btn sm" data-action="lab-hf">' + ic('globe') + 'Search Hugging Face</button></div>' +
      '<div class="row gap"><label class="mini"><input type="checkbox" data-lab="filters.fitOnly"' + (L.filters.fitOnly ? ' checked' : '') + '> Fits my hardware</label>' +
        '<label class="mini"><input type="checkbox" data-lab="filters.installedOnly"' + (L.filters.installedOnly ? ' checked' : '') + '> Installed</label><span class="hint" id="lab-sources"></span></div>' +
      '<div id="lab-pull"></div><div id="lab-cat-list"></div></div>' +
    '<div class="card wide"><h3>' + ic('wand') + 'Design your model</h3>' +
      '<div class="seg full">' + [['scratch', 'Create from scratch'], ['lora', 'Fine-tune an existing model']].map(([k, l]) => '<button data-action="lab-route" data-v="' + k + '" class="' + (L.route === k ? 'active' : '') + '">' + l + '</button>').join('') + '</div>' +
      (L.route === 'scratch'
        ? '<div class="field"><label>Start from a preset</label><div class="seg wrap">' + Object.entries(ML.PRESETS).map(([k, x]) => '<button data-action="lab-preset" data-v="' + k + '">' + esc(x.label) + '</button>').join('') + '</div></div>' +
          '<div class="lab-arch">' + [['vocab', 'Vocabulary'], ['layers', 'Layers'], ['hidden', 'Hidden width'], ['mlp', 'MLP width'], ['heads', 'Attention heads'], ['kvHeads', 'KV heads'], ['context', 'Context (tokens)']]
            .map(([k, l]) => num('design.' + k, l, 'min="1" step="1"')).join('') +
          '<div class="field"><label>Tokenizer</label><input class="input" data-lab="tokenizer" value="' + esc(L.tokenizer) + '" placeholder="new" spellcheck="false" title="new = train a fresh tokenizer on your examples, or a Hugging Face id to reuse one"></div></div>' +
          '<label class="mini"><input type="checkbox" data-lab="design.tied"' + (L.design.tied ? ' checked' : '') + '> Tie input and output embeddings (fewer parameters)</label>'
        : '<div class="field"><label>Base model (Hugging Face id)</label><input class="input" data-lab="base" value="' + esc(L.base) + '" spellcheck="false" placeholder="Qwen/Qwen2.5-1.5B-Instruct">' +
            '<div class="hint">The original safetensors repo, not a -GGUF repo: GGUF files can be run but not trained.</div></div>' +
          '<div class="two"><div class="field"><label>LoRA rank</label><select class="input" data-lab="loraRank" data-type="number">' + [8, 16, 32, 64].map(n => '<option' + (L.loraRank === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div><div></div></div>') +
      '<div class="two">' + '<div class="field"><label>Model name</label><input class="input" data-lab="name" value="' + esc(L.name) + '" spellcheck="false"></div>' + num('epochs', 'Epochs', 'min="1" max="50"') + '</div>' +
      '<div class="advice" id="lab-design-out"></div>' +
      '<div class="row gap"><button class="btn primary" data-action="lab-export">' + ic('download') + 'Export training kit</button>' +
        '<span class="hint">Trains on this PC (or copy the folder to your GPU machine), converts to GGUF, quantizes and registers it with Ollama as <code>scripty-' + esc(ML.safeName(L.name)) + '</code>.</span></div></div>';
  renderLabLive(); renderLabExamples(); renderLabPull();
}
function renderLabBudget() {
  const el = $('#lab-budget');
  if (!el) return;
  const hw = labHW(), p = state.lab.profile, w = state.lab.workload;
  el.innerHTML = hw.totalGiB
    ? '<div class="ok">Budget for models: <b>' + gib(hw.budgetGiB) + '</b> = ' + gib(hw.freeGiB) + ' free − ' + gib(Number(p.reserveGiB) || 0) + ' reserved, on ' + esc(hw.label) + ' (' + gib(hw.totalGiB) + ' total). Workload: ' + (Number(w.context) || 0).toLocaleString() + ' tokens × ' + (Number(w.concurrency) || 1) + '.</div>'
    : '<div class="warn">' + esc(hw.label) + '. Fit checks show “Unknown” until GPU memory is known.</div>';
}
function renderLabCatalog() {
  const el = $('#lab-cat-list');
  if (!el) return;
  const L = state.lab, hw = labHW();
  if (lab.loading && !lab.catalog) { el.innerHTML = '<div class="hint"><span class="spinner"></span> Reading the catalog…</div>'; return; }
  $('#lab-sources').textContent = (lab.loading ? 'Refreshing… ' : '') + lab.sources.map(s => s.label + ': ' + (s.ok ? s.count + (s.partial ? ' top results' : ' models') + ' · ' + timeAgo(s.at) : s.error)).join(' · ');
  if (!lab.catalog) { el.innerHTML = '<div class="hint">Press Installed to list your Ollama models, or search Hugging Face.</div>'; return; }
  const rows = ML.searchCatalog(lab.catalog, L.filters.q).map(v => ({ v, fit: fitHtml(ML.estimateVram(v, L.workload), hw) }))
    .filter(x => (!L.filters.fitOnly || x.fit.status === 'fits') && (!L.filters.installedOnly || x.v.installed));
  el.innerHTML = rows.length ? rows.slice(0, 150).map(({ v, fit }) => '<div class="list-row"><div class="meta"><b>' + esc(v.name) + (v.installed ? ' <span class="pill ok">Installed</span>' : '') + '</b>' +
    '<span>' + esc([v.publisher, v.family, v.quant ? v.quant + (v.quantAssumed ? ' (typical)' : '') : '', v.params ? fmtParams(v.params) + ' params' : '', v.context ? v.context.toLocaleString() + ' ctx' : '',
      v.task, v.downloads ? v.downloads.toLocaleString() + ' downloads' : ''].filter(Boolean).join(' · ')) + '</span><div class="lab-fit">' + fit.html + '</div></div>' +
    (v.installed ? '<button class="btn sm primary" data-action="lab-use" data-name="' + esc(v.name) + '" data-fit="' + fit.status + '">' + ic('check') + 'Use</button>'
      : '<button class="btn sm" data-action="lab-pull" data-name="' + esc('hf.co/' + v.name) + '">' + ic('download') + 'Install</button><button class="icon-btn" data-action="open-url" data-url="' + esc(v.url) + '" title="Model card">' + ic('external') + '</button>') + '</div>').join('')
    : '<div class="hint">No models match.' + (L.filters.fitOnly ? ' <button class="btn sm ghost" data-action="lab-clear-fit">Show all matches</button>' : '') + '</div>';
}
function renderLabDesignOut() {
  const el = $('#lab-design-out');
  if (!el) return;
  const L = state.lab, hw = labHW(), out = [];
  const line = (label, f) => '<div class="' + (f.status === 'fits' ? 'ok' : f.status === 'unknown' ? '' : 'warn') + '">' + label + ': ' + f.html + '</div>';
  if (L.route === 'scratch') {
    const d = L.design, errs = ML.validateArch(d);
    if (errs.length) errs.forEach(e => out.push('<div class="warn">' + esc(e) + '</div>'));
    else {
      const n = ML.paramCount(d), arch = ML.archOf(d);
      out.push('<div class="ok"><b>' + n.toLocaleString() + '</b> parameters (' + fmtParams(n) + '), random initial weights, ' + (d.tied ? 'tied' : 'separate') + ' embeddings.</div>');
      out.push(line('Training it (full, AdamW)', fitHtml(ML.trainMemory({ mode: 'scratch', params: n, arch, seq: d.context, microbatch: 2 }), hw)));
      out.push(line('Running it (Q4_K_M)', fitHtml(ML.estimateVram({ params: n, quant: 'Q4_K_M', arch }, { context: d.context, concurrency: L.workload.concurrency }), hw)));
      if (n > 3e8) out.push('<div class="warn">A from-scratch model this size needs billions of training tokens to write well. With a few hundred examples, fine-tuning an existing model works far better.</div>');
    }
  } else {
    const params = ML.parseParams(L.base);
    if (!/^[\w.-]+\/[\w.-]+$/.test(L.base || '')) out.push('<div class="warn">Enter a Hugging Face id like Qwen/Qwen2.5-1.5B-Instruct.</div>');
    else if (!params) out.push('<div>The size isn\'t in the name, so memory can\'t be estimated. Check nvidia-smi during the first training steps.</div>');
    else {
      out.push(line('Training it (QLoRA, 4-bit)', fitHtml(ML.trainMemory({ mode: 'lora', params, seq: 1024 }), hw)));
      out.push(line('Running it (Q4_K_M)', fitHtml(ML.estimateVram({ params, quant: 'Q4_K_M' }, L.workload), hw)));
    }
  }
  const ex = lab.examples || [];
  out.push('<div>Training data: ' + ex.length + ' examples' + (ex.length ? ', ' + ex.filter(e => e.teacher).length + ' improved by a teacher' : '') + '. ' + (ex.length < 50 ? 'Aim for 200+ before training.' : '') + '</div>');
  el.innerHTML = out.join('');
}
function renderLabExamples() {
  const el = $('#lab-examples');
  if (!el) return;
  const ex = lab.examples || [];
  el.innerHTML = '<div class="hint">' + ex.length + ' examples · ' + ex.filter(e => e.teacher).length + ' improved by a teacher</div>' +
    ex.slice(-25).reverse().map(e => '<div class="list-row"><div class="meta"><b>' + esc(e.label || 'Example') + '</b><span>' + esc(pname(e.provider) + (e.model ? ' · ' + e.model : '') + ' · ' + timeAgo(e.createdAt)) +
      (e.teacher ? ' · <span style="color:var(--ok)">teacher: ' + esc(e.teacherModel) + '</span>' : '') + '</span></div>' +
      '<button class="icon-btn" data-action="lab-rm-example" data-id="' + esc(e.id) + '" title="Remove">' + ic('trash') + '</button></div>').join('');
}
function renderLabPull() {
  const el = $('#lab-pull');
  if (!el) return;
  const p = lab.pull;
  el.innerHTML = p ? '<div class="list-row"><div class="meta"><b>Installing ' + esc(p.name) + '</b><span>' + esc(p.status || '') + (p.pct ? ' · ' + p.pct + '%' : '') + '</span><div class="lab-bar"><i style="width:' + (p.pct || 0) + '%"></i></div></div>' +
    '<button class="btn sm ghost" data-action="lab-cancel-pull">' + ic('x') + 'Cancel</button></div>' : '';
}
const lanePrompts = new Map(); // laneId -> prompt; session-only so saved projects never grow
function learn(r, lane) {
  const p = lanePrompts.get(lane.id);
  if (!p || !lane.text) return false;
  api.labAddExample({ system: p.system, user: p.user, output: cleanOutput(lane.text), label: r.title, provider: lane.provider, model: lane.model })
    .then(ex => { if (ex && lab.examples) lab.examples.push(ex); }).catch(() => {});
  return true;
}
Object.assign(ACTIONS, {
  'lab-rescan': async () => { lab.hw = null; renderLab(); lab.hw = await api.labHardware(); renderLab(); },
  'lab-source': el => { state.lab.profile.source = el.dataset.v; saveLab(); renderLab(); },
  'lab-route': el => { state.lab.route = el.dataset.v; saveLab(); renderLab(); },
  'lab-preset': el => { state.lab.design = { ...ML.PRESETS[el.dataset.v] }; saveLab(); renderLab(); },
  'lab-refresh': () => labRefresh(false),
  'lab-hf': () => labRefresh(true),
  'lab-clear-fit': () => { state.lab.filters.fitOnly = false; saveLab(); renderLab(); },
  'lab-use': async el => {
    const name = el.dataset.name;
    state.providers.ollama = { ...state.providers.ollama, ...(await api.setProvider('ollama', { model: name, enabled: true })) };
    state.settings.engine.mode = 'single'; state.settings.engine.single = { provider: 'ollama', model: name };
    saveSettings(); renderBrief(); renderDatalists();
    toast('Scripty now writes with ' + name + (el.dataset.fit === 'incompatible' ? ' — it may not fit your GPU, so expect slow CPU offload.' : '.'), el.dataset.fit === 'incompatible' ? 'err' : 'ok');
  },
  'lab-pull': async el => {
    if (lab.pull) return toast('One download at a time.');
    const name = el.dataset.name;
    lab.pull = { name, status: 'starting', pct: 0 }; renderLabPull();
    try { if (await api.labPull(name)) { toast(name + ' installed', 'ok'); await labRefresh(false); } }
    catch (e) { toast(cleanErr(e), 'err'); } finally { lab.pull = null; renderLabPull(); }
  },
  'lab-cancel-pull': () => { if (lab.pull) api.labCancelPull(lab.pull.name); },
  'lab-export': async el => {
    const L = state.lab;
    el.disabled = true;
    try {
      const r = await api.labExportKit({ route: L.route, design: L.design, base: L.base, loraRank: L.loraRank, tokenizer: String(L.tokenizer || '').trim() || 'new', name: L.name, epochs: L.epochs, context: L.workload.context });
      toast('Training kit ready: ' + r.train + ' training + ' + r.eval + ' held-out examples (dataset ' + r.hash + '). Run run.ps1 in the folder.', 'ok', { label: 'Open folder', fn: () => api.reveal(r.dir) });
    } finally { el.disabled = false; }
  },
  'lab-distill': async el => {
    const t = state.lab.teacher, p = state.providers[t.provider];
    if (!p || !p.ready) return toast('Pick a premium teacher that has an API key (AI page).', 'err', { label: 'Set up', fn: () => setView('providers') });
    lab.examples = await api.labExamples();
    const todo = lab.examples.filter(e => !e.teacher).slice(0, 10);
    if (!todo.length) return toast(lab.examples.length ? 'Every example already has a teacher answer.' : 'No examples yet. Turn on learning or press Teach on an AI result.');
    el.disabled = true;
    let done = 0;
    try {
      for (const e of todo) {
        el.innerHTML = '<span class="spinner"></span> Teacher ' + (done + 1) + ' / ' + todo.length;
        const text = await callAI({ provider: t.provider, model: t.model || '' }, e.system, e.user, null, null, { temperature: 0.4 });
        if (text.trim()) { await api.labPatchExample(e.id, { teacher: cleanOutput(text), teacherModel: pname(t.provider) + ' · ' + (t.model || defModel(t.provider)) }); done++; }
      }
      toast(done + ' examples improved by ' + pname(t.provider), 'ok');
    } finally { lab.examples = await api.labExamples(); if (state.view === 'lab') renderLab(); }
  },
  'lab-rm-example': async el => { await api.labRemoveExample(el.dataset.id); lab.examples = lab.examples.filter(e => e.id !== el.dataset.id); renderLabExamples(); renderLabDesignOut(); },
  'lab-clear-examples': async () => {
    if (!(await confirmModal('Delete all ' + (lab.examples || []).length + ' training examples?', 'Delete'))) return;
    await api.labRemoveExample('*'); lab.examples = []; renderLab();
  },
  'lane-teach': el => {
    const r = state.project.runs.find(x => x.id === el.dataset.run), l = findLane(el);
    if (r && l && learn(r, l)) toast('Saved as a training example', 'ok', { label: 'Model Lab', fn: () => setView('lab') });
  },
});

// ================= remote link =================
let lastRemoteJSON = '', remoteTick = 0;
async function refreshRemoteStatus() {
  try { state.remote = await api.remoteStatus(); } catch { return; }
  $('#remote-dot').classList.toggle('hidden', !state.remote.running);
  if (state.view === 'remote') renderRemote();
}
async function refreshRemoteProjects() {
  state.remoteProjects = (await api.listProjects()).slice(0, 60).map(p => ({ id: p.id, title: p.title, type: K.typeOf(p.type).label, words: p.words, updatedAt: p.updatedAt }));
}
const verName = code => Math.floor(code / 10000) + '.' + Math.floor(code / 100) % 100 + '.' + code % 100; // 10203 -> 1.2.3
function renderRemote() {
  const r = state.remote || {}, port = r.configuredPort || 47830, on = !!r.running; // show what is actually listening
  const qi = Math.min(state.remoteQr || 0, Math.max(0, (r.nets || []).length - 1));
  $('#remote-body').innerHTML = '<div class="remote-grid"><div class="card remote-main">' +
    '<div class="switch-row"><div><b>Remote Link</b><div class="hint">' + (on ? 'On · port ' + r.port + ' · ' + r.clients + ' device' + (r.clients === 1 ? '' : 's') + ' connected now'
      : r.enabled ? 'Could not start.' : 'Off — nothing on this PC is reachable from other devices.') + '</div></div>' +
    '<label class="switch"><input type="checkbox" id="remote-on"' + (r.enabled || on ? ' checked' : '') + '><span></span></label></div>' +
    (r.error ? '<div class="advice"><div class="warn">' + esc(r.error) + '</div></div>' : '') +
    (on && r.locked ? '<div class="advice"><div class="warn">Pairing is locked after too many wrong codes.</div></div><button class="btn sm" data-action="remote-newcode">' + ic('refresh') + 'New code</button>' : '') +
    (on && !r.locked ? '<div class="pair">' + ((r.qrs || [])[qi] ? '<img class="qr" src="' + r.qrs[qi] + '" alt="Pairing QR code">' : '') +
      '<div class="pair-info"><div class="lbl">Scan with your phone camera, or open an address below and type the code</div>' +
      '<div class="pair-code">' + esc(String(r.code).slice(0, 3) + ' ' + String(r.code).slice(3)) + '</div>' +
      (r.nets || []).map((n, i) => '<div class="url-row' + (i === qi ? ' sel' : '') + '"><button class="url-pick" data-action="remote-qr" data-i="' + i + '" title="Show the QR code for this address">' +
        '<code>' + esc(n.url) + '</code><small>' + esc(n.name) + (i === qi ? ' · in QR' : '') + '</small></button>' +
        '<button class="icon-btn" data-action="copy-text" data-v="' + esc(n.url) + '" title="Copy">' + ic('copy') + '</button></div>').join('') +
      ((r.nets || []).length > 1 ? '<div class="hint">Phone can’t connect? Tap a different address to switch the QR code.</div>' : '') +
      (r.urls && r.urls.length ? '' : '<div class="hint">No network connection found.</div>') +
      '<div class="hint">Each code and QR link works once and expires after 10 minutes.</div><button class="btn sm ghost" data-action="remote-newcode">' + ic('refresh') + 'New code</button></div></div>' : '') +
    '</div><div class="card"><h3>' + ic('phone') + 'Linked devices</h3>' +
    ((r.devices || []).length ? r.devices.map(d => {
      const online = (r.online || []).includes(d.id), latest = r.apkVersion;
      const app = d.appVersion ? 'Android app ' + verName(d.appVersion) : 'browser';
      const outdated = d.appVersion && latest && d.appVersion < latest.versionCode;
      return '<div class="list-row"><div class="meta"><b>' + esc(d.name) + ' <span class="pill ' + (online ? 'ok' : '') + '">' + (online ? 'Online' : 'Offline') + '</span></b>' +
        '<span>' + esc(app) + (outdated ? ' · <b style="color:var(--warn)">update ' + esc(latest.versionName) + ' available</b>' : d.appVersion && latest ? ' · up to date' : '') + ' · last seen ' + timeAgo(d.lastSeen) + '</span></div>' +
        (outdated ? '<button class="btn sm primary" data-action="remote-update" data-id="' + esc(d.id) + '" data-name="' + esc(d.name) + '"' + (online ? '' : ' disabled title="Open Scripty Remote on the phone first"') + '>Update app</button>' : '') +
        '<button class="btn sm danger" data-action="remote-revoke" data-id="' + esc(d.id) + '">Unlink</button></div>';
    }).join('') : '<div class="hint">No devices linked yet.</div>') +
    '<div class="field" style="margin-top:10px"><label>Port</label><div class="row gap"><input class="input" id="remote-port" type="number" min="1024" max="65535" value="' + port + '" style="max-width:130px"><button class="btn sm" data-action="remote-port">Apply</button></div></div></div>' +
    '<div class="card"><h3>' + ic('phone') + 'Android app</h3>' +
      (r.apk ? (on ? '<div class="pair">' + ((r.apkQrs || [])[qi] ? '<img class="qr small" src="' + r.apkQrs[qi] + '" alt="Android app download QR code">' : '') +
          '<div class="pair-info hint remote-help"><p><b>1.</b> Scan this with your Android phone to download <b>Scripty Remote</b>, or open <code>' + esc(((r.nets || [])[qi] || {}).url || '') + 'scripty-remote.apk</code>.</p>' +
          '<p><b>2.</b> Open the download. If Android asks, allow installing apps from your browser.</p>' +
          '<p><b>3.</b> Open Scripty Remote and type this PC’s address, or scan the pairing QR above with your camera and choose <i>Open with Scripty Remote</i>.</p></div></div>'
        : '<div class="hint">Switch on Remote Link to show the download QR code for your phone.</div>')
        : '<div class="hint">The Android app isn’t bundled in this build yet. Build it with <code>npm run android</code>, then <code>npm run dist</code>. Until then, the remote works in your phone’s browser.</div>') +
    '</div>' +
    '<div class="card"><h3>' + ic('globe') + 'Use it from anywhere</h3><div class="hint remote-help">' +
      '<p><b>Same Wi-Fi:</b> works right away. The first time, let Scripty through Windows Firewall on <i>Private</i> networks.</p>' +
      '<p><b>Away from home:</b> install the free <b>Tailscale</b> app on this PC and on your phone and sign in to both. Then open <code>http://&lt;this PC’s Tailscale name&gt;:' + port + '/</code> on the phone and link with a code. Everything travels inside your own encrypted network.</p>' +
      '<p><b>Keep it private:</b> don’t port-forward this to the public internet. The link is built for trusted networks.</p>' +
      '<p><b>Install like an app:</b> after linking, choose “Add to Home Screen” in your phone’s browser.</p></div></div></div>';
}
function remoteSnapshot() {
  const a = state.analysis, b = brief(), seen = new Set();
  const live = state.project.runs.filter(r => state.liveRuns.has(r.id)).flatMap(r => r.lanes.filter(l => l.status === 'running'))[0];
  const tool = state.project.runs.find(r => r.kind === 'tool' && r.status === 'done');
  const toolLane = tool && tool.lanes.find(l => l.status === 'done');
  return {
    title: state.project.title, projectId: state.project.id, type: K.typeOf(b.type).label, content: editor().value.slice(0, 80000),
    words: a.words, seconds: a.seconds, target: targetPlan().seconds, editorMode: state.editorMode,
    cues: a.cues.filter(c => c.kind !== 'pause' && !seen.has(c.label.toLowerCase()) && seen.add(c.label.toLowerCase()))
      .map(c => { const m = cueMatch(c.label); return { label: c.label, kind: c.kind, match: m ? m.name : null }; }),
    library: state.sfxLib.map(s => ({ id: s.id, name: s.name })),
    reading: state.reading, readingNow: state.reading ? state.readingNow || '' : '',
    prompter: { open: !$('#prompter').classList.contains('hidden'), playing: pr.playing, speed: Number($('#pr-speed').value) },
    generating: !!state.genRun, busy: state.liveRuns.size > 0,
    live: live ? { name: live.name, words: K.countWords(live.text), tail: live.text.slice(-1500) } : null,
    toolResult: toolLane ? { title: tool.title, text: toolLane.text.slice(0, 6000) } : null,
    engine: state.settings.engine.mode === 'room' ? 'Writers\' Room · ' + STRATEGIES[state.settings.engine.strategy][0] : pname(state.settings.engine.single.provider),
    projects: state.remoteProjects || [],
    assist: Object.entries(K.ASSIST_ACTIONS).map(([k, x]) => ({ k, label: x.label })),
    tools: Object.entries(K.TOOL_ACTIONS).filter(([k]) => k !== 'ideas').map(([k, x]) => ({ k, label: x.label })),
    types: Object.entries(K.SCRIPT_TYPES).map(([k, t]) => ({ k, label: t.label })),
  };
}
function pushRemote() {
  if (!state.remote || !state.remote.running || !state.project) return;
  if (++remoteTick % 40 === 0) refreshRemoteProjects();
  const s = remoteSnapshot(), j = JSON.stringify(s);
  if (j !== lastRemoteJSON) { lastRemoteJSON = j; api.sendRemoteState(s); }
}
/** Commands from linked devices. main.js only forwards allow-listed types with sanitized fields. */
function handleRemote(c) {
  const studio = () => { if (state.view !== 'studio') setView('studio'); };
  const quiet = ['play-sound', 'play-cue', 'stop-sounds', 'next-sound', 'replay-sound', 'prompter-speed', 'prompter-scroll'];
  switch (c.type) {
    case 'generate': studio(); if (!state.genRun) generate(); break;
    case 'stop-generate': if (state.genRun) cancelRun(state.genRun); else for (const r of state.project.runs) if (state.liveRuns.has(r.id)) cancelRun(r); break;
    case 'play-sound': { const s = state.sfxLib.find(x => x.id === c.id) || K.BUILTIN_SOUNDS.find(x => x.id === c.id); if (s) Sound.play(s); break; }
    case 'play-cue': if (c.label) playCueLabel(c.label); break;
    case 'stop-sounds': Sound.stopAll(); break;
    case 'read': studio(); stopRead(); setEditorMode('perform'); tableRead(Math.max(0, Number(c.from) || 0)); break;
    case 'read-stop': stopRead(); break;
    case 'prompter-open': openPrompter(); break;
    case 'prompter-toggle': if ($('#prompter').classList.contains('hidden')) openPrompter(); if (!$('#prompter').classList.contains('hidden')) prompterToggle(); break;
    case 'prompter-close': closePrompter(); break;
    case 'prompter-speed': { const s = $('#pr-speed'); s.value = Math.max(5, Math.min(200, Number(s.value) + (Number(c.delta) || 0))); break; }
    case 'prompter-scroll': { const sc = $('#prompter-scroll'); sc.scrollTop += Number(c.delta) || 0; pr.pos = sc.scrollTop; break; }
    case 'assist': { const a = Object.hasOwn(K.ASSIST_ACTIONS, c.k || '') && K.ASSIST_ACTIONS[c.k]; if (a) { studio(); assist(a.prompt, a.label); } break; }
    case 'assist-custom': if (c.text && c.text.trim()) { studio(); assist(c.text.slice(0, 2000), 'Remote edit'); } break;
    case 'tool': if (Object.hasOwn(K.TOOL_ACTIONS, c.k || '')) runTool(c.k); break;
    case 'open-project': if (/^[\w-]{6,64}$/.test(c.id || '')) openProject(c.id); break;
    case 'new-project': newScript(Object.hasOwn(K.SCRIPT_TYPES, c.k || '') ? c.k : undefined); break;
    case 'editor-mode': studio(); setEditorMode(c.mode === 'perform' ? 'perform' : 'edit'); break;
    case 'insert-cue': if (c.label) { studio(); insertSnippet('[SFX: ' + c.label.replace(/[[\]\r\n]/g, '').slice(0, 80) + ']'); } break;
    case 'snapshot': ACTIONS.snapshot(); break;
    case 'next-sound': deckNext(); break;
    case 'replay-sound': deckReplay(); break;
    default: return;
  }
  if (!quiet.includes(c.type)) toast('Remote: ' + c.type.replace(/-/g, ' '));
}

// ================= boot =================
function renderAll() {
  $('#project-title').value = state.project.title;
  renderTitleBadge();
  renderDatalists();
  renderBrief();
  refreshAnalysis();
  setEditorMode(state.editorMode);
  renderTool();
  updateGhost();
}
async function init() {
  hydrateIcons(document);
  const cfg = await api.getConfig();
  state.settings = withDefaults(cfg.settings);
  state.providers = cfg.providers;
  state.info = await api.info();
  state.lab = withLabDefaults(await api.labGet());
  api.onLab(d => { if (lab.pull && d.name === lab.pull.name) { lab.pull.status = d.status; if (d.total) lab.pull.pct = Math.round(100 * (d.completed || 0) / d.total); renderLabPull(); } });
  state.sfxLib = await api.sfxList();
  let p = null;
  if (state.settings.lastProjectId) p = await api.loadProject(state.settings.lastProjectId).catch(() => null);
  if (!p) { const list = await api.listProjects(); if (list[0]) p = await api.loadProject(list[0].id); }
  state.project = normalizeProject(p || welcomeProject());
  state.settings.lastProjectId = state.project.id;
  editor().value = state.project.content;
  applySettings();
  bindEvents();
  renderAll();
  await saveNow();
  api.onHotkey(runHotkey);
  applyHotkeys().catch(() => {});
  api.onRemoteCommand(cmd => { try { handleRemote(cmd); } catch (e) { toast(cleanErr(e), 'err'); } });
  await refreshRemoteProjects();
  await refreshRemoteStatus();
  setInterval(pushRemote, 500);
  setInterval(() => { if (state.view === 'remote') refreshRemoteStatus(); }, 3000);
}

// Hooks used by the --smoke self-check and screenshot run.
window.__scripty = {
  async flush() { await saveNow(); await api.setSettings(state.settings); return true; },
  async selfTest() {
    const errs = [];
    const ok = (c, m) => { if (!c) errs.push(m); };
    for (let i = 0; i < 50 && !state.project; i++) await sleep(100);
    ok(state.project, 'project loaded');
    ok(Sound.selfTest() === K.BUILTIN_SOUNDS.length, 'one synth recipe per built-in sound');
    for (const s of K.BUILTIN_SOUNDS) ok(Sound.has(s.id), 'recipe for ' + s.id);
    ok(state.analysis.words > 0 && Object.keys(state.analysis.speakers).length === 2, 'welcome script analysed');
    setEditorMode('perform');
    ok($$('#perform .cue.sfx').length >= 4 && !$$('#perform .cue.nomatch').length, 'perform view renders matched SFX chips');
    ok(state.readSeq.some(x => x.type === 'speech') && state.readSeq.some(x => x.type === 'pause'), 'read sequence has speech and pauses');
    setEditorMode('edit');
    for (const t of ['assist', 'length', 'cues', 'history', 'runs']) setTool(t);
    for (const v of ['projects', 'sounds', 'providers', 'settings', 'lab', 'studio']) await setView(v);
    ok($$('#provider-grid .pv').length === Object.keys(state.providers).length, 'provider cards');
    await setView('lab');
    ok($('#lab-design-out').textContent.includes(ML.paramCount(ML.PRESETS.proof).toLocaleString()), 'model lab shows the scratch parameter count');
    state.lab.profile = { ...state.lab.profile, source: 'manual', reserveGiB: 3, manual: { host: 'Test rig', totalGiB: 24, freeGiB: 18, ramGiB: 64 } };
    renderLab();
    ok(/15 GiB/.test($('#lab-budget').textContent), 'manual profile budget = free − reserve');
    lab.catalog = [ML.variantFromHF({ id: 'test/Tiny-1B-GGUF', gguf: { total: 1e9 } }), ML.variantFromHF({ id: 'test/Huge-70B-GGUF', gguf: { total: 70e9 } })];
    renderLabCatalog();
    ok($$('#lab-cat-list .list-row').length === 2 && $('#lab-cat-list').textContent.includes('Too large'), 'catalog keeps incompatible models visible with a reason');
    state.lab.filters.fitOnly = true; renderLabCatalog();
    ok($$('#lab-cat-list .list-row').length === 1, 'fit filter hides the model that does not fit');
    state.lab = withLabDefaults({}); lab.catalog = null;
    await setView('studio');
    ok($$('#board-grid .snd').length === K.BUILTIN_SOUNDS.length, 'sound board');
    const rec = K.parseSoundRecipe('{"name":"Zap","layers":[{"type":"tone","freq":800,"freqTo":200,"dur":0.2}]}');
    Sound.setVolume(0); Sound.play({ id: 'selftest-ai', recipe: rec }); const v1 = Sound.lastVariation('pop'); Sound.play('pop'); const v2 = Sound.lastVariation('pop'); Sound.play('pop');
    ok(Sound.lastVariation('selftest-ai') && v2 && Sound.lastVariation('pop').semis !== v2.semis && (!v1 || v1.semis !== v2.semis), 'every play is a new variation (AI recipe and built-in)');
    deck.i = 0; deck.last = -1; deckNext(); ok(deck.i === 1 && deck.last === 0, 'next-cue hotkey advances the deck');
    deck.rec = []; deck.t0 = performance.now(); deckNext(); ok(deck.rec.length === 1 && deck.rec[0].label === deckCues()[1].label, 'record timing captures presses');
    deck.rec = null; deck.i = 0; deck.last = -1; Sound.stopAll(); Sound.setVolume(state.settings.sfxVolume);
    ok(toSRT().includes('-->') && exportHTML().includes('<h1>'), 'exports build');
    // model picker: lists every model (not just matches for the current value) and saves the pick
    state.settings.engine.mode = 'single'; state.settings.engine.single = { provider: 'anthropic', model: 'claude-sonnet-5-5' }; renderBrief();
    openModelMenu($('#brief-body .combo-btn'));
    const items = $$('#mm-list .mm-item').map(b => b.dataset.model);
    ok(items.length === state.providers.anthropic.models.length && items.length >= 4, 'model picker lists all models (' + items.length + ')');
    $('#mm-list [data-model="claude-opus-5-5"]').click();
    ok(state.settings.engine.single.model === 'claude-opus-5-5' && !$('#mm-list'), 'model picker saves the pick and closes');
    state.settings.engine.single.model = ''; renderBrief();
    const p = K.buildPrompt(buildBriefForAI(true));
    ok(p.user.includes('Alex') && p.user.includes('words'), 'prompt built from brief');
    if (errs.length) { console.error('selfTest: ' + errs.join('; ')); return errs.join('; '); }
    return true;
  },
  async show(v) {
    if (v === 'perform') { await setView('studio'); setEditorMode('perform'); setTool('cues'); return; }
    if (v === 'writers') {
      await setView('studio'); setEditorMode('edit');
      state.settings.engine.mode = 'room'; state.settings.engine.strategy = 'synthesize'; renderBrief();
      const r = { id: uid(), kind: 'generate', title: 'Create · YouTube Video', strategy: 'Draft & Merge', createdAt: Date.now(), status: 'done', lanes: [], final: null };
      for (const [prov, role] of [['anthropic', 'Draft'], ['openai', 'Draft'], ['gemini', 'Draft'], ['anthropic', 'Merge']]) r.lanes.push({ id: uid(), provider: prov, model: defModel(prov), role, name: role + ' · ' + pname(prov), status: 'done', text: editor().value.slice(0, 600) });
      r.final = r.activeLane = r.lanes[3].id;
      state.project.runs.unshift(r); setTool('runs'); return;
    }
    if (v === 'lab-design') { await setView('lab'); $('#lab-design-out').scrollIntoView({ block: 'center' }); return; }
    if (v === 'light') { state.settings.theme = 'light'; applySettings(); await setView('studio'); setEditorMode('edit'); setTool('length'); return; }
    if (v === 'studio') { await setView('studio'); setEditorMode('edit'); setTool('assist'); return; }
    if (v === 'models') {
      await setView('providers');
      state.providers.openai.models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-5', 'gpt-5-mini', 'o3', 'o4-mini', 'chatgpt-4o-latest', 'gpt-4-turbo', 'gpt-3.5-turbo'];
      renderProviders(); openModelMenu($('#provider-grid .pv:nth-child(2) .combo-btn')); return;
    }
    await setView(v);
  },
};

init().catch(e => { console.error(e); toast('Startup error: ' + cleanErr(e), 'err'); });
