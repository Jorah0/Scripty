/* Scripty core: script types, length planning, script analysis, cue parsing, prompt building.
   Pure functions, shared by the renderer (window.ScriptKit) and tests (require). */
(function (root) {
  'use strict';

  // range = typical runtime in seconds [min, max]; sweet = the spot most creators aim for.
  const SCRIPT_TYPES = {
    youtube: {
      label: 'YouTube Video', group: 'Video', wpm: 150, range: [240, 1800], sweet: [480, 900], defaultLength: [10, 'minutes'],
      guide: 'Long-form YouTube video. Open with a hook in the first 15 seconds that states the payoff, then deliver value in clear segments with retention beats (open loops, pattern interrupts, re-hooks every 60-90s). Conversational, spoken-word phrasing. End with a CTA and an end-screen tease.',
      options: ['15-second hook', 'Open loops', 'Pattern interrupts', 'B-roll notes', 'On-screen text', 'Chapter markers', 'Sponsor slot', 'Subscribe CTA', 'End-screen tease'],
      tips: ['8+ minutes unlocks mid-roll ads; 8-15 minutes is the usual retention sweet spot.', 'Front-load value: most viewers decide to stay in the first 30 seconds.'],
    },
    short: {
      label: 'Shorts / TikTok / Reels', group: 'Video', wpm: 165, range: [15, 90], sweet: [20, 45], defaultLength: [45, 'seconds'],
      guide: 'Vertical short-form video. The first line must hook in under 2 seconds. One idea only, fast cuts, punchy sentences, captions-first writing. End on a payoff or a loop back to the opening line.',
      options: ['1-second hook', 'Loopable ending', 'Captions-first', 'Text overlays', 'Trend/sound note', 'Comment-bait question'],
      tips: ['Under 60 seconds reaches every short-form platform; 20-45 seconds tends to get the best completion rate.'],
    },
    asmr: {
      label: 'ASMR', group: 'Audio', wpm: 95, range: [600, 3600], sweet: [900, 2700], defaultLength: [20, 'minutes'],
      guide: 'ASMR script. Slow, soft, intimate delivery, usually second person ("you"). Generous pauses marked [PAUSE Ns]. Trigger sounds as [SFX: ...] lines describing exactly what the performer does (tapping, crinkling, brushing). Personal-attention phrasing, gentle repetition, no sudden loud moments. Wind down toward the end.',
      options: ['Whispering', 'Soft-spoken', 'Personal attention', 'Roleplay', 'Tapping', 'Scratching', 'Crinkling', 'Brushing', 'Page turning', 'Layered sounds', 'Binaural L/R cues', 'Sleep fade-out'],
      tips: ['15-45 minutes is typical; sleep-focused ASMR often runs an hour or more.', 'Pauses count toward runtime, so mark them with [PAUSE Ns] to get honest timing.'],
    },
    podcast: {
      label: 'Podcast Episode', group: 'Audio', wpm: 155, range: [600, 5400], sweet: [1200, 2700], defaultLength: [25, 'minutes'],
      guide: 'Podcast script or detailed run-sheet. Cold open, intro, segments with transitions, natural back-and-forth between hosts, ad read slots, outro with CTA.',
      options: ['Cold open', 'Segment breaks', 'Ad read', 'Listener Q&A', 'Show notes', 'Natural banter'],
      tips: ['20-45 minutes matches an average commute.'],
    },
    audiodrama: {
      label: 'Audio Drama', group: 'Audio', wpm: 140, range: [300, 3600], sweet: [900, 1800], defaultLength: [15, 'minutes'],
      guide: 'Audio drama. Everything must be understood by ear: establish setting through ambience [SFX] and dialogue, name characters in speech, use foley cues for action. Scene headings for location changes.',
      options: ['Scene ambience', 'Narrator', 'Foley-heavy', 'Cliffhanger', 'Cold open'],
      tips: ['Serialized episodes commonly run 15-30 minutes.'],
    },
    screenplay: {
      label: 'Screenplay / Film', group: 'Screen', wpm: 140, range: [300, 9000], sweet: [5400, 7200], defaultLength: [10, 'pages'], pageSeconds: 60,
      guide: 'Screenplay. Scene headings (INT./EXT. LOCATION - TIME), present-tense action lines, character name in caps before dialogue, parentheticals sparingly, transitions only when meaningful. Show, don\'t tell.',
      options: ['Fountain format', 'Scene headings', 'Parentheticals', 'Transitions', 'Montage', 'Visual storytelling'],
      tips: ['One screenplay page is about one minute of screen time. Features run 90-120 pages; shorts under 15.'],
    },
    tv: {
      label: 'TV Episode', group: 'Screen', wpm: 145, range: [1200, 3600], sweet: [1320, 2640], defaultLength: [30, 'pages'], pageSeconds: 60,
      guide: 'TV episode script with a teaser/cold open, act breaks, and a tag. Screenplay formatting.',
      options: ['Cold open / teaser', 'Act breaks', 'Tag scene', 'A/B storylines'],
      tips: ['Half-hour comedies are about 22 minutes (22-35 pages); hour dramas about 44 minutes (45-60 pages).'],
    },
    stage: {
      label: 'Stage Play', group: 'Screen', wpm: 135, range: [600, 7200], sweet: [3600, 5400], defaultLength: [15, 'minutes'],
      guide: 'Stage play. Character names, dialogue, and stage directions in parentheses. Everything happens in front of a live audience on a limited set.',
      options: ['Stage directions', 'Monologue', 'Aside to audience', 'Intermission break'],
      tips: ['One-acts run 10-60 minutes; full-length plays 90-120 minutes.'],
    },
    commercial: {
      label: 'Commercial / Ad', group: 'Marketing', wpm: 160, range: [6, 120], sweet: [15, 60], defaultLength: [30, 'seconds'],
      guide: 'Advertisement. Grab attention immediately, one clear message, benefit-led, a single strong call to action. Two-column style visual/audio notes welcome.',
      options: ['Problem-Agitate-Solve', 'Testimonial', 'Offer + urgency', 'Jingle/tagline', 'Legal disclaimer', 'Visual/audio columns'],
      tips: ['Broadcast spots are 15, 30 or 60 seconds. Every word counts: about 75 words fit in 30 seconds.'],
    },
    vsl: {
      label: 'Sales Letter / VSL', group: 'Marketing', wpm: 155, range: [180, 3600], sweet: [600, 1500], defaultLength: [10, 'minutes'],
      guide: 'Video sales letter. Hook, problem, agitation, story, solution, proof, offer, guarantee, urgency, CTA.',
      options: ['Story-driven', 'Social proof', 'Objection handling', 'Guarantee', 'Scarcity'],
      tips: ['Price drives length: low-ticket VSLs are short; high-ticket ones often run 20-45 minutes.'],
    },
    explainer: {
      label: 'Explainer / Educational', group: 'Video', wpm: 145, range: [60, 1200], sweet: [120, 360], defaultLength: [3, 'minutes'],
      guide: 'Explainer. Start with the question or problem, build understanding step by step with analogies and examples, recap at the end. Plain language.',
      options: ['Analogies', 'Step-by-step', 'Recap', 'Quiz question', 'Diagram notes'],
      tips: ['Product explainers do best at 60-120 seconds; lessons at 6-12 minutes.'],
    },
    tutorial: {
      label: 'Tutorial / How-To', group: 'Video', wpm: 140, range: [120, 1800], sweet: [300, 720], defaultLength: [8, 'minutes'],
      guide: 'Tutorial. State the end result first, list prerequisites, then numbered steps with exact actions, common mistakes, and a final result check.',
      options: ['Numbered steps', 'Prerequisites', 'Common mistakes', 'Screen-capture notes', 'Timestamps'],
      tips: ['Show the finished result in the first 20 seconds.'],
    },
    documentary: {
      label: 'Documentary Narration', group: 'Video', wpm: 130, range: [300, 5400], sweet: [900, 2700], defaultLength: [15, 'minutes'],
      guide: 'Documentary narration. Measured, authoritative voice, narrative arc, interview bite placeholders, archival/visual notes.',
      options: ['Interview bites', 'Archival notes', 'Lower thirds', 'Act structure'],
      tips: ['Narration usually leaves room for visuals: aim for less voice than runtime.'],
    },
    voiceover: {
      label: 'Voiceover', group: 'Audio', wpm: 150, range: [15, 900], sweet: [30, 180], defaultLength: [90, 'seconds'],
      guide: 'Voiceover copy timed against visuals. Short, rhythmic sentences that are easy to read aloud; note visual sync points.',
      options: ['Visual sync points', 'Emphasis marks', 'Pronunciation notes'],
      tips: [],
    },
    audiobook: {
      label: 'Narration / Audiobook', group: 'Audio', wpm: 155, range: [300, 7200], sweet: [900, 2700], defaultLength: [15, 'minutes'],
      guide: 'Narration for audio. Prose written for the ear: clear attributions, varied sentence rhythm, distinct character voices noted in parentheses.',
      options: ['Character voice notes', 'Chapter breaks', 'Narrator asides'],
      tips: ['Audiobook narrators average about 155 words per minute.'],
    },
    meditation: {
      label: 'Meditation / Sleep Story', group: 'Audio', wpm: 90, range: [180, 3600], sweet: [600, 1800], defaultLength: [10, 'minutes'],
      guide: 'Guided meditation or sleep story. Very slow, warm, second person. Breathing cues, long pauses [PAUSE Ns], gentle imagery, gradual wind-down, no sudden shifts.',
      options: ['Breathing cues', 'Body scan', 'Visualization', 'Long pauses', 'Ambient soundscape'],
      tips: ['Pauses are most of a meditation\'s runtime; mark them with [PAUSE Ns].'],
    },
    speech: {
      label: 'Speech / Presentation', group: 'Live', wpm: 130, range: [60, 3600], sweet: [300, 1200], defaultLength: [7, 'minutes'],
      guide: 'Speech or talk. Strong opening, signposting, rule of three, stories over statistics, audience interaction, memorable close that calls back to the opening.',
      options: ['Slide cues', 'Audience interaction', 'Personal story', 'Rule of three', 'Callback ending'],
      tips: ['TED-style talks cap at 18 minutes; toasts at 2-4 minutes.'],
    },
    livestream: {
      label: 'Livestream Run-of-Show', group: 'Live', wpm: 150, range: [900, 14400], sweet: [3600, 7200], defaultLength: [60, 'minutes'],
      guide: 'Livestream run-of-show: timed segments, talking points (not word-for-word), chat engagement prompts, sponsor reads, contingency notes.',
      options: ['Segment timings', 'Chat prompts', 'Sponsor reads', 'Giveaway', 'Raid/outro'],
      tips: ['Write talking points rather than verbatim lines for long streams.'],
    },
    interview: {
      label: 'Interview / Q&A', group: 'Live', wpm: 150, range: [300, 5400], sweet: [1200, 2700], defaultLength: [20, 'minutes'],
      guide: 'Interview plan: intro, ordered questions from easy to deep, follow-up prompts, closing question.',
      options: ['Follow-up prompts', 'Rapid-fire round', 'Guest intro'],
      tips: [],
    },
    sketch: {
      label: 'Comedy Sketch', group: 'Screen', wpm: 160, range: [60, 600], sweet: [120, 300], defaultLength: [4, 'minutes'],
      guide: 'Comedy sketch. Establish the game fast, heighten it with escalating beats, end on a button.',
      options: ['Clear game', 'Escalation', 'Callback', 'Button ending'],
      tips: ['Most sketches land in 2-5 minutes.'],
    },
    game: {
      label: 'Video Game Dialogue', group: 'Interactive', wpm: 150, range: [30, 3600], sweet: [120, 900], defaultLength: [5, 'minutes'],
      guide: 'Game dialogue. Speaker-tagged lines, branching choices labelled [CHOICE A]/[CHOICE B], barks, emotion tags in parentheses for voice actors.',
      options: ['Branching choices', 'Barks', 'Emotion tags', 'Quest text'],
      tips: [],
    },
    written: {
      label: 'Written Piece (article, story, blog)', group: 'Written', wpm: 238, range: [60, 1800], sweet: [240, 600], defaultLength: [1200, 'words'], reading: true,
      guide: 'Written piece meant to be read, not performed. Strong headline and lede, scannable structure, varied sentences, a satisfying ending.',
      options: ['SEO headings', 'Short paragraphs', 'Pull quotes', 'Story arc', 'Listicle'],
      tips: ['Times shown are silent reading time (about 238 words per minute).', 'Long-form articles that rank well are often 1,500-2,500 words.'],
    },
  };

  const TONES = ['Calm', 'Cozy', 'Conversational', 'Energetic', 'Funny', 'Witty', 'Dramatic', 'Suspenseful', 'Mysterious', 'Dark',
    'Inspirational', 'Heartfelt', 'Romantic', 'Whimsical', 'Playful', 'Sarcastic', 'Educational', 'Authoritative', 'Professional', 'Urgent'];

  const MODES = {
    create: { label: 'Create', hint: 'Write a new script from your brief.' },
    revise: { label: 'Revise', hint: 'Rework an existing script to match the brief.' },
    fix: { label: 'Fix & Polish', hint: 'Fix grammar, flow and continuity; keep the voice.' },
    continue: { label: 'Continue', hint: 'Keep writing from where the script ends.' },
    adapt: { label: 'Adapt', hint: 'Turn source material into this script type.' },
  };

  const UNITS = ['minutes', 'seconds', 'words', 'pages'];

  function typeOf(id) { return SCRIPT_TYPES[id] || SCRIPT_TYPES.youtube; }

  function lengthPlan({ type, value, unit, wpm }) {
    const t = typeOf(type);
    const rate = Number(wpm) > 0 ? Number(wpm) : t.wpm;
    const v = Math.max(0, Number(value) || 0);
    let seconds, words;
    if (unit === 'words') { words = Math.round(v); seconds = Math.round(v / rate * 60); }
    else if (unit === 'pages') {
      if (t.pageSeconds) { seconds = Math.round(v * t.pageSeconds); words = Math.round(seconds / 60 * rate); }
      else { words = Math.round(v * 250); seconds = Math.round(words / rate * 60); }
    } else {
      seconds = Math.round(unit === 'seconds' ? v : v * 60);
      words = Math.round(seconds / 60 * rate);
    }
    return { seconds, words, wpm: rate };
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }

  function adviseLength(type, seconds) {
    const t = typeOf(type);
    const out = [];
    const [lo, hi] = t.range;
    if (seconds && seconds < lo) out.push({ level: 'warn', text: 'Shorter than usual for ' + t.label + ' (typical ' + fmtTime(lo) + '-' + fmtTime(hi) + ').' });
    else if (seconds > hi) out.push({ level: 'warn', text: 'Longer than usual for ' + t.label + ' (typical ' + fmtTime(lo) + '-' + fmtTime(hi) + '). Consider splitting it into parts.' });
    else if (t.sweet && seconds >= t.sweet[0] && seconds <= t.sweet[1]) out.push({ level: 'ok', text: 'In the sweet spot for ' + t.label + ' (' + fmtTime(t.sweet[0]) + '-' + fmtTime(t.sweet[1]) + ').' });
    else if (seconds) out.push({ level: 'info', text: 'Within the normal range; the sweet spot is ' + fmtTime(t.sweet[0]) + '-' + fmtTime(t.sweet[1]) + '.' });
    for (const tip of t.tips || []) out.push({ level: 'info', text: tip });
    return out;
  }

  // ---------- cues ----------
  const CUE_WORDS = 'SFX|SOUND|FX|MUSIC|AMBIENCE|AMBIENT|PAUSE|BEAT|BREATH';
  const CUE_RE = new RegExp(
    '\\[\\s*(' + CUE_WORDS + ')\\b\\s*[:\\-\\u2013]?\\s*([^\\]]*)\\]' +
    '|\\(\\s*(SFX|SOUND|FX|MUSIC|AMBIENCE)\\b\\s*[:\\-\\u2013]\\s*([^)]*)\\)' +
    '|\\{\\s*(SFX|SOUND|FX|MUSIC|AMBIENCE)\\b\\s*[:\\-\\u2013]?\\s*([^}]*)\\}' +
    '|\\*\\*\\s*(SFX|SOUND|MUSIC)\\s*:\\s*\\*\\*\\s*([^\\n\\[({]*)', 'gi');

  function cueKind(word) {
    word = word.toUpperCase();
    if (word === 'MUSIC') return 'music';
    if (word === 'PAUSE' || word === 'BEAT' || word === 'BREATH') return 'pause';
    return 'sfx';
  }

  function parseCues(text) {
    const cues = [];
    CUE_RE.lastIndex = 0;
    let m;
    while ((m = CUE_RE.exec(text || ''))) {
      const word = m[1] || m[3] || m[5] || m[7];
      const label = (m[2] || m[4] || m[6] || m[8] || '').trim();
      const kind = cueKind(word);
      const cue = { kind, label, raw: m[0], start: m.index, end: m.index + m[0].length };
      if (kind === 'pause') {
        const n = /(\d+(?:\.\d+)?)\s*(s|sec|seconds?)?\b/i.exec(label);
        cue.seconds = n ? Number(n[1]) : (word.toUpperCase() === 'BEAT' ? 1 : 2);
      }
      cues.push(cue);
    }
    return cues;
  }

  // ---------- sounds ----------
  const BUILTIN_SOUNDS = [
    ['rain', 'Rain', 'Nature', 'rain,drizzle,downpour,raindrops,rainfall,storm'],
    ['thunder', 'Thunder', 'Nature', 'thunder,lightning,thunderclap'],
    ['wind', 'Wind', 'Nature', 'wind,breeze,gust,howling,windy'],
    ['ocean', 'Ocean Waves', 'Nature', 'ocean,waves,wave,sea,surf,shore,beach'],
    ['water', 'Water / Bubbles', 'Nature', 'water,stream,river,bubble,bubbles,drip,dripping,pour,pouring,liquid'],
    ['fire', 'Fire Crackle', 'Nature', 'fire,crackle,crackling,campfire,fireplace,embers,flames'],
    ['birds', 'Birds', 'Nature', 'bird,birds,chirp,chirping,birdsong,tweet,forest'],
    ['knock', 'Door Knock', 'Foley', 'knock,knocks,knocking'],
    ['door', 'Door Creak', 'Foley', 'door,creak,creaking,creaky,hinge,slam'],
    ['footsteps', 'Footsteps', 'Foley', 'footstep,footsteps,steps,walking,walks,pacing'],
    ['tap', 'Tapping', 'ASMR', 'tap,tapping,taps,nail,nails,fingertip'],
    ['crinkle', 'Crinkling', 'ASMR', 'crinkle,crinkling,crinkly,plastic,wrapper,foil,crumple,rustle,rustling,bag'],
    ['paper', 'Page Turn', 'ASMR', 'page,pages,paper,book,flip,flipping,page turn'],
    ['brush', 'Brushing', 'ASMR', 'brush,brushing,bristle,bristles,comb,combing,hair'],
    ['scratch', 'Scratching', 'ASMR', 'scratch,scratching,scrape,scraping'],
    ['breath', 'Breath', 'ASMR', 'breath,breathing,breathe,inhale,exhale,sigh,blow'],
    ['pen', 'Pen Writing', 'ASMR', 'pen,pencil,writing,scribble,scribbling,sketch'],
    ['typing', 'Keyboard Typing', 'Tech', 'typing,keyboard,keys,typewriter,type'],
    ['click', 'Click', 'Tech', 'click,clicks,mouse,switch,button,toggle'],
    ['beep', 'Beep / Alarm', 'Tech', 'beep,beeping,alarm,buzzer,error,wrong,warning'],
    ['phone', 'Phone Ring', 'Tech', 'phone,ring,ringing,ringtone,call,telephone'],
    ['camera', 'Camera Shutter', 'Tech', 'camera,shutter,photo,snapshot,picture'],
    ['static', 'Static / Radio', 'Tech', 'static,radio,glitch,white noise,interference,tv'],
    ['whoosh', 'Whoosh', 'Transitions', 'whoosh,woosh,swoosh,swish,swipe,transition,zoom'],
    ['pop', 'Pop', 'Transitions', 'pop,popping,bubble pop,cork'],
    ['ding', 'Ding / Bell', 'UI', 'ding,bell,chime,notification,ping,alert'],
    ['success', 'Success / Sparkle', 'UI', 'success,win,level up,correct,coin,reward,sparkle,magic,twinkle'],
    ['boom', 'Boom / Impact', 'Impact', 'boom,explosion,blast,impact,hit,thud,slam,crash'],
    ['glass', 'Glass Clink', 'Foley', 'glass,clink,cheers,cup,mug,toast,ice'],
    ['heartbeat', 'Heartbeat', 'Body', 'heartbeat,heart,pulse,heartbeats'],
    ['clock', 'Clock Ticking', 'Foley', 'clock,tick,ticking,tock,timer,watch'],
    ['zipper', 'Zipper', 'Foley', 'zip,zipper,zipping,unzip'],
    ['splash', 'Splash', 'Nature', 'splash,splashing,dive,plunge'],
    ['applause', 'Applause', 'Crowd', 'applause,clap,clapping,claps,ovation'],
    ['crowd', 'Crowd Murmur', 'Crowd', 'crowd,murmur,chatter,restaurant,cafe,people talking,audience'],
    ['engine', 'Engine', 'Vehicles', 'engine,car,motor,traffic,truck,driving,drive'],
    ['drumroll', 'Drum Roll', 'Comedy', 'drumroll,drum roll,suspense'],
    ['rimshot', 'Rimshot', 'Comedy', 'rimshot,ba dum,badum,joke'],
    ['pad', 'Ambient Pad', 'Music', 'music,pad,ambient,piano,score,melody,soft music,background music,calm music,lofi'],
    ['stinger', 'Dramatic Sting', 'Music', 'sting,stinger,dramatic,reveal,tension,dun dun'],
  ].map(([id, name, category, kw]) => ({ id, name, category, keywords: kw.split(',') }));

  function scoreKeywords(label, words, keywords) {
    let score = 0;
    for (const k of keywords || []) {
      const kw = String(k).toLowerCase().trim();
      if (!kw) continue;
      if (kw.includes(' ')) { if (label.includes(kw)) score += 2; }
      else if (words.some(w => w === kw)) score += 2;
      else if (kw.length >= 3 && words.some(w => w.startsWith(kw))) score += 1;
    }
    return score;
  }

  function matchSound(label, library, builtins) {
    const l = String(label || '').toLowerCase();
    const words = l.split(/[^a-z0-9]+/).filter(Boolean);
    for (const set of [library || [], builtins || BUILTIN_SOUNDS]) {
      let best = null, bestScore = 0;
      for (const s of set) {
        const sc = scoreKeywords(l, words, s.keywords);
        if (sc > bestScore) { best = s; bestScore = sc; }
      }
      if (best) return best;
    }
    return null;
  }

  // ---------- analysis ----------
  const NON_SPOKEN_LABELS = new Set(['VISUAL', 'VISUALS', 'B-ROLL', 'BROLL', 'ON-SCREEN', 'ON SCREEN', 'TEXT', 'NOTE', 'NOTES', 'CAMERA',
    'SHOT', 'OVERLAY', 'GRAPHIC', 'GRAPHICS', 'TITLE', 'LOWER THIRD', 'CUT', 'TRANSITION', 'SCENE', 'SETTING', 'CAPTION', 'SUPER', 'TIMESTAMP', 'CHOICE A', 'CHOICE B']);
  const HEADING_RE = /^\s*(#{1,6}\s|INT[\.\/ ]|EXT[\.\/ ]|I\/E[\. ]|EST[\. ]|SCENE\s+\d|ACT\s+[IVX\d]|(FADE|CUT|SMASH CUT|DISSOLVE)\b.*(TO|IN|OUT)[:.]?\s*$)/i;
  const SPEAKER_RE = /^\s*(?:\*\*)?([A-Z][A-Za-z0-9'\.\- ]{0,28}?)(?:\s*\([^)]*\))?(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*)$/;
  const CAPS_NAME_RE = /^\s*([A-Z][A-Z0-9'\.\- ]{1,28})(\s*\((V\.O\.|O\.S\.|CONT'D|O\.C\.)\))?\s*$/;

  function countWords(s) { const m = String(s || '').match(/[A-Za-z0-9À-ɏЀ-ӿ']+/g); return m ? m.length : 0; }

  function syllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!word) return 0;
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const m = word.match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }

  function analyzeScript(text, wpm) {
    text = String(text || '');
    const rate = Number(wpm) > 0 ? Number(wpm) : 150;
    const cues = parseCues(text);
    const speakers = {};
    let spokenWords = 0, scenes = 0, pauseSeconds = 0, current = null;
    const spokenParts = [];
    for (const c of cues) if (c.kind === 'pause') pauseSeconds += c.seconds || 0;
    for (const raw of text.split(/\r?\n/)) {
      let line = raw.replace(CUE_RE, ' ').trim();
      if (!line) { current = null; continue; }
      if (HEADING_RE.test(line)) { scenes++; current = null; continue; }
      const caps = CAPS_NAME_RE.exec(line);
      if (caps && countWords(caps[1]) <= 4 && !NON_SPOKEN_LABELS.has(caps[1].trim())) { current = caps[1].trim(); continue; }
      let speaker = current;
      const sp = SPEAKER_RE.exec(line);
      if (sp && countWords(sp[1]) <= 3) {
        const name = sp[1].trim().toUpperCase();
        if (NON_SPOKEN_LABELS.has(name)) continue;
        speaker = name; line = sp[2];
      }
      line = line.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ')
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ').replace(/[*_>#`~|]/g, ' ').replace(/^\s*[-•]\s+/, '');
      const n = countWords(line);
      if (!n) continue;
      spokenWords += n;
      spokenParts.push(line);
      if (speaker) speakers[speaker] = (speakers[speaker] || 0) + n;
    }
    const spoken = spokenParts.join(' ');
    const sentences = Math.max(1, (spoken.match(/[.!?]+(\s|$)/g) || []).length);
    const wordList = spoken.match(/[A-Za-z']+/g) || [];
    const syl = wordList.reduce((a, w) => a + syllables(w), 0);
    const flesch = wordList.length ? Math.round(206.835 - 1.015 * (wordList.length / sentences) - 84.6 * (syl / wordList.length)) : 0;
    return {
      words: countWords(text.replace(CUE_RE, ' ')),
      spokenWords,
      seconds: Math.round(spokenWords / rate * 60 + pauseSeconds),
      pauseSeconds,
      speakers,
      cues,
      scenes,
      sentences: spokenWords ? sentences : 0,
      avgSentence: spokenWords ? Math.round(spokenWords / sentences * 10) / 10 : 0,
      flesch,
    };
  }

  function readingLevel(flesch) {
    if (flesch >= 90) return 'Very easy';
    if (flesch >= 70) return 'Easy';
    if (flesch >= 60) return 'Plain English';
    if (flesch >= 50) return 'Fairly difficult';
    if (flesch >= 30) return 'Difficult';
    return 'Very difficult';
  }

  // ---------- prompts ----------
  function formatRules(brief) {
    const inc = brief.include || {};
    const rules = [
      'Write each spoken line as `NAME: line` when there is more than one speaker (single narrators may omit the name).',
      'Put performance directions in (parentheses), e.g. (whispering), (laughs).',
    ];
    if (inc.sfx !== false) rules.push('Mark every sound effect on its own line as [SFX: short concrete description], e.g. [SFX: door knock], [SFX: rain on window], [SFX: tapping on wood]. Use plain, searchable words: these cues are linked to a sound board.');
    if (inc.music) rules.push('Mark music on its own line as [MUSIC: description], e.g. [MUSIC: soft piano fades in].');
    if (inc.pauses || ['asmr', 'meditation'].includes(brief.type)) rules.push('Mark deliberate silences as [PAUSE Ns], e.g. [PAUSE 3s].');
    if (inc.visuals) rules.push('Put visual / B-roll / on-screen-text notes on their own line starting with `VISUAL:`.');
    if (inc.timestamps) rules.push('Start each section with a markdown heading containing an estimated timestamp, e.g. `## [01:30] The Twist`.');
    if (['screenplay', 'tv'].includes(brief.type)) rules.push('Use standard screenplay conventions (scene headings INT./EXT., character names in caps above dialogue).');
    return rules;
  }

  function buildPrompt(brief) {
    brief = brief || {};
    const t = typeOf(brief.type);
    const mode = brief.mode || 'create';
    const plan = lengthPlan({ type: brief.type, value: brief.length && brief.length.value, unit: brief.length && brief.length.unit, wpm: brief.wpm });

    const system = [
      'You are Scripty, a professional script writer and script doctor who writes production-ready scripts.',
      'Script type: ' + t.label + '. ' + t.guide,
      'Formatting conventions:',
      ...formatRules(brief).map(r => '- ' + r),
      '- Output only the script itself: no preamble, no explanations, no closing remarks.',
      brief.language && brief.language !== 'English' ? '- Write the script in ' + brief.language + '.' : '',
    ].filter(Boolean).join('\n');

    const opening = {
      create: 'Write a complete ' + t.label + ' script from this brief.',
      revise: 'Revise the existing script in <source> so it fits this brief. Keep what works and change what the brief asks for.',
      fix: 'Fix and polish the existing script in <source>: grammar, clarity, pacing, continuity and formatting. Preserve the author\'s voice, story and structure; only add material where it is needed to fix a problem.',
      continue: 'Continue the existing script in <source> seamlessly from where it ends, matching its voice and format. Output only the new continuation.',
      adapt: 'Adapt the source material in <source> into a ' + t.label + ' script.',
    }[mode] || '';

    const lines = [opening, '', '## Brief'];
    const add = (k, v) => { if (v && String(v).trim()) lines.push('- ' + k + ': ' + String(v).trim()); };
    add('Title', brief.title);
    add('Idea / premise', brief.ideas);
    add('Focus / goal', brief.focus);
    add('Audience', brief.audience);
    add('Tone', (brief.tones || []).join(', '));
    add('Tags / keywords', (brief.tags || []).join(', '));
    add('Point of view', brief.pov);
    add('Content rating', brief.rating);
    const people = Number(brief.people) || 0;
    if (people) {
      const cast = (brief.characters || []).filter(c => c && c.name).map(c => c.name + (c.notes ? ' (' + c.notes + ')' : ''));
      add('Cast', people + (people === 1 ? ' speaker' : ' speakers') + (cast.length ? ': ' + cast.join('; ') : ''));
    }
    if (plan.words) add('Target length', '~' + plan.words + ' words (about ' + fmtTime(plan.seconds) + (t.reading ? ' of reading' : ' spoken at ' + plan.wpm + ' words per minute') + '). Stay within 10% of this.');
    add('Include these elements', (brief.options || []).join(', '));
    add('Additional instructions', brief.extra);
    if (brief.source && mode !== 'create') lines.push('', '<source>', brief.source, '</source>');
    return { system, user: lines.join('\n'), plan };
  }

  const ASSIST_ACTIONS = {
    rewrite: { label: 'Rewrite', prompt: 'Rewrite this passage so it reads better while keeping its meaning.' },
    shorten: { label: 'Shorten', prompt: 'Make this passage about 30% shorter without losing key points.' },
    expand: { label: 'Expand', prompt: 'Expand this passage with more detail, color and beats (about 50% longer).' },
    punch: { label: 'Punch up', prompt: 'Punch this up: sharper lines, stronger verbs, more energy and memorable phrasing.' },
    simplify: { label: 'Simplify', prompt: 'Simplify the language so it is easy to say aloud and easy to follow.' },
    grammar: { label: 'Fix grammar', prompt: 'Fix grammar, spelling and punctuation only. Change nothing else.' },
    funnier: { label: 'Make funnier', prompt: 'Make this funnier with jokes that fit the characters and tone.' },
    emotional: { label: 'More emotional', prompt: 'Deepen the emotion and stakes of this passage.' },
    sfx: { label: 'Add SFX cues', prompt: 'Add fitting [SFX: ...] cue lines throughout. Keep all existing text unchanged.' },
    hook: { label: 'Stronger hook', prompt: 'Rewrite the opening so the first lines hook the audience immediately. Return the full passage.' },
    cta: { label: 'Add CTA', prompt: 'Add a natural, persuasive call to action that fits the script. Return the full passage.' },
    dialogue: { label: 'Better dialogue', prompt: 'Make the dialogue sound more natural and give each speaker a distinct voice.' },
  };

  const TOOL_ACTIONS = {
    doctor: { label: 'Script doctor', prompt: 'Act as a script doctor. Give a concise, prioritized critique: what works, the biggest problems (structure, pacing, hook, clarity, character, length), and specific fixes with line references. Use short markdown sections.' },
    titles: { label: 'Titles', prompt: 'Suggest 10 compelling titles for this script. For video, optimize for click-through without clickbait lies. Return a numbered list.' },
    description: { label: 'Description & tags', prompt: 'Write a publish-ready description (with a hook line, summary, and chapter list if useful) and then 15-25 comma-separated tags/keywords.' },
    thumbnail: { label: 'Thumbnail ideas', prompt: 'Suggest 6 thumbnail concepts: short on-image text (max 4 words), the visual, and the emotion it targets.' },
    chapters: { label: 'Chapters', prompt: 'Produce a chapter list with estimated timestamps (MM:SS) based on a natural speaking pace, one line per chapter.' },
    summary: { label: 'Logline & summary', prompt: 'Write a one-sentence logline and a 100-word summary.' },
    ideas: { label: 'Brainstorm ideas', prompt: 'Brainstorm 10 distinct, specific ideas or angles for this script. One per line, each a single vivid sentence, no numbering.' },
  };

  function briefContext(brief) {
    const t = typeOf(brief && brief.type);
    const bits = ['Script type: ' + t.label];
    if (brief && brief.title) bits.push('Title: ' + brief.title);
    if (brief && brief.tones && brief.tones.length) bits.push('Tone: ' + brief.tones.join(', '));
    if (brief && brief.audience) bits.push('Audience: ' + brief.audience);
    return bits.join(' | ');
  }

  function buildAssistPrompt(instruction, passage, brief, wholeScript) {
    const system = 'You are Scripty, an expert script editor. ' + briefContext(brief) + '\n' +
      formatRules(brief || {}).map(r => '- ' + r).join('\n') +
      '\nReturn only the revised passage, ready to paste back in place. No commentary, no quotes around it.';
    const user = (wholeScript && wholeScript !== passage ? 'Context (full script, for reference only):\n<script>\n' + wholeScript.slice(0, 24000) + '\n</script>\n\n' : '') +
      'Instruction: ' + instruction + '\n\nPassage to revise:\n<passage>\n' + passage + '\n</passage>';
    return { system, user };
  }

  function buildToolPrompt(instruction, script, brief) {
    return {
      system: 'You are Scripty, an expert script consultant. ' + briefContext(brief),
      user: instruction + '\n\n<script>\n' + (script || '(empty — base it on the brief)') + '\n</script>',
    };
  }

  // ---------- multi-AI (Writers' Room) ----------
  function synthesisPrompt(drafts, brief) {
    const base = buildPrompt(brief);
    const body = drafts.map((d, i) => '<draft id="' + (i + 1) + '" author="' + d.name + '">\n' + d.text + '\n</draft>').join('\n\n');
    return {
      system: base.system,
      user: base.user + '\n\nSeveral writers produced drafts for this brief. Merge them into one definitive script: take the strongest hook, best lines, structure and ideas from each, fix weaknesses, and hit the target length. Output only the final script.\n\n' + body,
    };
  }

  function judgePrompt(drafts, brief) {
    const base = buildPrompt(brief);
    const body = drafts.map((d, i) => '<draft id="' + (i + 1) + '">\n' + d.text + '\n</draft>').join('\n\n');
    return {
      system: 'You are a strict, fair script competition judge.',
      user: 'Brief the drafts were written for:\n' + base.user + '\n\nScore each draft 1-10 on: hook, structure, voice/tone fit, brief adherence, length fit, and overall. Then explain the winner in two sentences. ' +
        'End with a final line exactly like `WINNER: <id>`.\n\n' + body,
    };
  }

  function parseWinner(text, count) {
    const m = /WINNER:\s*(?:draft\s*)?#?(\d+)/i.exec(text || '');
    const n = m ? Number(m[1]) : 0;
    return n >= 1 && n <= count ? n - 1 : -1;
  }

  const RELAY_STAGES = [
    { id: 'outline', label: 'Outline', make: (brief) => { const p = buildPrompt(brief); return { system: p.system.replace('Output only the script itself', 'Output only the outline'), user: p.user + '\n\nFirst, produce only a detailed beat-by-beat outline (sections, beats, key lines, cues, estimated timings) — not the full script.' }; } },
    { id: 'draft', label: 'Draft', make: (brief, prev) => { const p = buildPrompt(brief); return { system: p.system, user: p.user + '\n\nWrite the full script following this outline:\n<outline>\n' + prev + '\n</outline>' }; } },
    { id: 'critique', label: 'Critique', make: (brief, prev) => ({ system: 'You are a demanding script editor.', user: 'Brief:\n' + buildPrompt(brief).user + '\n\nCritique this draft against the brief. List the 5-10 most important, specific improvements (hook, pacing, clarity, voice, length, cues).\n\n<draft>\n' + prev + '\n</draft>' }) },
    { id: 'polish', label: 'Polish', make: (brief, prev, history) => { const p = buildPrompt(brief); return { system: p.system, user: p.user + '\n\nApply this editorial critique to the draft and output the final, polished script.\n\n<draft>\n' + history.draft + '\n</draft>\n\n<critique>\n' + prev + '\n</critique>' }; } },
  ];

  const ScriptKit = {
    SCRIPT_TYPES, TONES, MODES, UNITS, BUILTIN_SOUNDS, ASSIST_ACTIONS, TOOL_ACTIONS, RELAY_STAGES,
    typeOf, lengthPlan, adviseLength, fmtTime, parseCues, matchSound, analyzeScript, readingLevel, countWords,
    buildPrompt, buildAssistPrompt, buildToolPrompt, synthesisPrompt, judgePrompt, parseWinner,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ScriptKit;
  else root.ScriptKit = ScriptKit;
})(typeof window !== 'undefined' ? window : globalThis);
