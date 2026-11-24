const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../src/core/scriptkit.js');

test('script types carry a speaking rate and a recommended range', () => {
  for (const [id, t] of Object.entries(K.SCRIPT_TYPES)) {
    assert.ok(t.wpm > 0, id + ' wpm');
    assert.ok(t.range && t.range[0] < t.range[1], id + ' range');
    assert.ok(t.label && t.guide, id + ' label/guide');
  }
  assert.ok(K.SCRIPT_TYPES.asmr.wpm < K.SCRIPT_TYPES.youtube.wpm, 'ASMR is spoken slower than YouTube');
});

test('lengthPlan converts minutes to target words at the type speaking rate', () => {
  const p = K.lengthPlan({ type: 'youtube', value: 10, unit: 'minutes' });
  assert.equal(p.seconds, 600);
  assert.equal(p.words, Math.round(10 * K.SCRIPT_TYPES.youtube.wpm));
  const w = K.lengthPlan({ type: 'youtube', value: 1500, unit: 'words' });
  assert.equal(w.words, 1500);
  assert.equal(w.seconds, Math.round(1500 / K.SCRIPT_TYPES.youtube.wpm * 60));
  const custom = K.lengthPlan({ type: 'youtube', value: 2, unit: 'minutes', wpm: 100 });
  assert.equal(custom.words, 200);
  const pages = K.lengthPlan({ type: 'screenplay', value: 90, unit: 'pages' });
  assert.equal(pages.seconds, 90 * 60, 'screenplay: one page ~ one minute');
});

test('adviseLength warns outside the recommended range and is calm inside it', () => {
  const shortTooLong = K.adviseLength('short', 180);
  assert.ok(shortTooLong.some(a => a.level === 'warn'));
  const ok = K.adviseLength('youtube', 10 * 60);
  assert.ok(!ok.some(a => a.level === 'warn'));
});

test('analyzeScript counts spoken words only and finds speakers and cues', () => {
  const text = [
    'INT. KITCHEN - NIGHT',
    '[SFX: rain on window]',
    'ALEX: Hello there, how are you?',
    '(whispering) Just checking in.',
    'SAM: Fine thanks.',
    '[MUSIC: soft piano]',
  ].join('\n');
  const a = K.analyzeScript(text, 150);
  assert.equal(a.cues.length, 2);
  assert.deepEqual(a.cues.map(c => c.kind), ['sfx', 'music']);
  assert.equal(a.speakers.ALEX, 5);
  assert.equal(a.speakers.SAM, 2);
  // spoken = 5 + 3 (the parenthetical is removed, "Just checking in.") + 2 ; heading + cues excluded
  assert.equal(a.spokenWords, 10);
  assert.equal(a.seconds, Math.round(10 / 150 * 60));
});

test('parseCues accepts common cue syntaxes', () => {
  const cues = K.parseCues('[SFX: door knock] (sfx: thunder) {SOUND: whoosh} **SFX:** page turn\n[Music: upbeat]');
  assert.deepEqual(cues.map(c => c.label), ['door knock', 'thunder', 'whoosh', 'page turn', 'upbeat']);
});

test('matchSound prefers user library keywords, then built-in sounds, else null', () => {
  const lib = [{ id: 'u1', name: 'My Knock', keywords: ['knock', 'door'] }];
  assert.equal(K.matchSound('loud door knock', lib, K.BUILTIN_SOUNDS).id, 'u1');
  assert.equal(K.matchSound('heavy rain outside', [], K.BUILTIN_SOUNDS).id, 'rain');
  assert.equal(K.matchSound('gentle tapping on wood', [], K.BUILTIN_SOUNDS).id, 'tap');
  assert.equal(K.matchSound('zzqx', [], K.BUILTIN_SOUNDS), null);
});

test('buildPrompt carries every brief field the user set', () => {
  const brief = {
    mode: 'revise', type: 'asmr', title: 'Sleepy Library', ideas: 'a quiet library at night',
    focus: 'relaxation', audience: 'insomniacs', tones: ['calm', 'cozy'], tags: ['sleep', 'books'],
    people: 2, characters: [{ name: 'Librarian', notes: 'soft-spoken' }],
    length: { value: 20, unit: 'minutes' }, options: ['Tapping', 'Page turning'],
    include: { sfx: true, music: false, visuals: false, timestamps: true },
    language: 'English', extra: 'no jump scares', source: 'OLD SCRIPT TEXT',
  };
  const p = K.buildPrompt(brief);
  for (const s of ['Sleepy Library', 'quiet library', 'relaxation', 'insomniacs', 'calm', 'sleep', 'Librarian',
    'soft-spoken', 'Tapping', 'no jump scares', 'OLD SCRIPT TEXT', 'ASMR']) {
    assert.ok((p.system + p.user).includes(s), 'missing ' + s);
  }
  assert.match(p.user, /2 (speakers|people|voices)/i);
  assert.match(p.user, /\d+ words/);
  assert.match(p.system, /\[SFX:/, 'SFX cue convention is taught when SFX enabled');
});

test('sound variation: identity at 0, bounded, and never repeats the previous variant', () => {
  assert.deepEqual(K.soundVariation(0), { pitch: 1, gain: 1, offset: 0, semis: 0 });
  let last = null;
  for (let i = 0; i < 300; i++) {
    const v = K.soundVariation(1, last);
    assert.ok(v.pitch > 0.83 && v.pitch < 1.2 && v.gain > 0.7 && v.gain < 1.42 && v.offset >= 0 && v.offset <= 0.03, JSON.stringify(v));
    if (last) assert.ok(Math.abs(v.semis - last.semis) >= 0.3, 'two plays in a row must differ audibly');
    last = v;
  }
});

test('AI sound recipes are parsed from chatty replies and clamped to safe limits', () => {
  const r = K.parseSoundRecipe('Here you go:\n```json\n{"name":"Laser Zap","keywords":["laser","zap","pew"],"layers":[' +
    '{"type":"tone","wave":"sawtooth","freq":99999,"freqTo":200,"dur":0.3,"gain":9,"repeat":5000,"every":0.1},' +
    '{"type":"noise","color":"plasma","filter":"evil","freq":3000,"dur":0.2}]}\n```');
  assert.equal(r.name, 'Laser Zap');
  assert.deepEqual(r.keywords, ['laser', 'zap', 'pew']);
  const [a, b] = r.layers;
  assert.equal(a.freq, 18000); assert.equal(a.gain, 1.5); assert.ok(a.repeat <= 200);
  assert.equal(b.color, 'white'); assert.equal(b.filter, 'bandpass');
  assert.ok(K.recipeDuration(r) <= 12);
  // Small local models echo the schema before answering, and leave trailing commas.
  const echoed = K.parseSoundRecipe('Format: {"name": "...", "layers": [...]}\n\n{"name":"Coins","keywords":["coins",],"layers":[{"type":"tone","freq":3000,"dur":0.1,},]}');
  assert.equal(echoed.name, 'Coins'); assert.equal(echoed.layers.length, 1);
  assert.equal(K.parseSoundRecipe('{"note":"a } in a string","name":"Q","layers":[{"type":"noise"}]}').name, 'Q');
  assert.throws(() => K.parseSoundRecipe('no json here'));
  assert.throws(() => K.parseSoundRecipe('{"name":"x","layers":[]}'), /no layers/);
  assert.ok(K.soundRecipePrompt('sci-fi door hiss').user.includes('sci-fi door hiss'));
});

test('hotkeys: keyboard events become Electron accelerators', () => {
  assert.equal(K.accelFromEvent({ key: 'F9' }), 'F9');
  assert.equal(K.accelFromEvent({ key: 'n', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+N');
  assert.equal(K.accelFromEvent({ key: ' ', altKey: true }), 'Alt+Space');
  assert.equal(K.accelFromEvent({ key: 'Control', ctrlKey: true }), null, 'a bare modifier is not a hotkey');
  assert.equal(K.accelFromEvent({ key: 'n' }), null, 'a plain letter would break typing');
});
