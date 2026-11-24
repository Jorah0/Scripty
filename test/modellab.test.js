const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/core/modellab.js');

const GiB = 2 ** 30;

test('effective budget = max(0, free - reserve)', () => {
  assert.equal(L.effectiveBudget(18, 3), 15);
  assert.equal(L.effectiveBudget(2, 3), 0);
});

test('KV cache formula: handbook example is 1 GiB per 8K sequence, 2 GiB at two', () => {
  const arch = { layers: 32, kvHeads: 8, headDim: 128 };
  assert.equal(L.kvBytes(arch, { context: 8192, concurrency: 1, kvBytes: 2 }), GiB);
  assert.equal(L.kvBytes(arch, { context: 8192, concurrency: 2, kvBytes: 2 }), 2 * GiB);
});

test('fit status against the handbook 24 GiB / 15 GiB budget fixture', () => {
  const hw = { totalGiB: 24, budgetGiB: 15 };
  const a = L.fitStatus([8, 10], hw);
  assert.equal(a.status, 'fits');
  assert.deepEqual(a.pct, [33, 42]);
  assert.deepEqual(a.headroom, [5, 7]);
  assert.equal(L.fitStatus([14, 17], hw).status, 'borderline');
  const c = L.fitStatus([26, 30], hw);
  assert.equal(c.status, 'incompatible');
  assert.deepEqual(c.pct, [108, 125]);
  assert.deepEqual(c.shortfall, [11, 15]);
  assert.equal(L.fitStatus(null, hw).status, 'unknown');
  assert.equal(L.fitStatus([8, 10], { totalGiB: 0, budgetGiB: 0 }).status, 'unknown', 'no GPU telemetry -> unknown, not a fake verdict');
});

test('VRAM estimate scales with quantization and is unknown without a parameter count', () => {
  const q4 = L.estimateVram({ params: 7e9, quant: 'Q4_K_M', arch: { layers: 32, kvHeads: 8, headDim: 128 } }, { context: 8192, concurrency: 1 });
  const f16 = L.estimateVram({ params: 7e9, quant: 'F16', arch: { layers: 32, kvHeads: 8, headDim: 128 } }, { context: 8192, concurrency: 1 });
  assert.ok(q4.range[0] > 4 && q4.range[1] < 8, 'Q4 7B ~5-7 GiB: ' + q4.range);
  assert.ok(f16.range[0] > 13, 'F16 7B over 13 GiB: ' + f16.range);
  assert.ok(q4.range[0] < q4.range[1]);
  assert.equal(L.estimateVram({ quant: 'Q4_K_M' }, { context: 4096 }).range, null);
  assert.equal(L.estimateVram({ params: 7e9, quant: 'Q4_K_M' }, { context: 4096 }).confidence, 'rough', 'missing dims are flagged');
});

test('parameter count of the handbook scratch preset is exact', () => {
  const cfg = L.PRESETS.proof;
  assert.equal(L.paramCount(cfg), 26354176);
  assert.equal(L.paramCount({ ...cfg, tied: false }), 26354176 + 8192 * 512);
  assert.deepEqual(L.validateArch(cfg), []);
});

test('invalid architecture shapes are caught before a job starts', () => {
  const errs = L.validateArch({ ...L.PRESETS.proof, heads: 7, kvHeads: 3 });
  assert.ok(errs.some(e => /divisible by heads/.test(e)), errs.join('; '));
  assert.ok(L.validateArch({ ...L.PRESETS.proof, heads: 8, kvHeads: 3 }).some(e => /KV heads/.test(e)));
  assert.ok(L.validateArch({ ...L.PRESETS.proof, layers: 0 }).length);
});

test('ollama /api/show metadata becomes a catalog variant', () => {
  const v = L.variantFromOllama({ name: 'qwen2.5:7b', digest: 'sha256:abc', size: 4.7e9, details: { family: 'qwen2', parameter_size: '7.6B', quantization_level: 'Q4_K_M' } },
    { model_info: { 'general.architecture': 'qwen2', 'general.parameter_count': 7615616512, 'qwen2.block_count': 28, 'qwen2.attention.head_count': 28,
      'qwen2.attention.head_count_kv': 4, 'qwen2.embedding_length': 3584, 'qwen2.context_length': 32768 } });
  assert.equal(v.id, 'ollama:qwen2.5:7b');
  assert.equal(v.installed, true);
  assert.equal(v.params, 7615616512);
  assert.deepEqual(v.arch, { layers: 28, kvHeads: 4, headDim: 128 });
  assert.equal(v.quant, 'Q4_K_M');
});

test('parameter size parsed from names when metadata is missing', () => {
  assert.equal(L.parseParams('Qwen2.5-7B-Instruct-GGUF'), 7e9);
  assert.equal(L.parseParams('gemma-3-270m-it'), 270e6);
  assert.equal(L.parseParams('phi-3.5-mini'), null);
});

test('catalog search keeps every entry visible and ranks exact matches first', () => {
  const list = [{ id: 'a', name: 'llama3.2:3b' }, { id: 'b', name: 'qwen2.5-coder:7b', tags: ['coding'] }, { id: 'c', name: 'qwen2.5:7b' }];
  assert.deepEqual(L.searchCatalog(list, '').map(x => x.id), ['a', 'b', 'c']);
  assert.deepEqual(L.searchCatalog(list, 'qwen2.5:7b').map(x => x.id)[0], 'c');
  assert.deepEqual(L.searchCatalog(list, 'coding').map(x => x.id), ['b']);
});

test('dataset build is deterministic, prefers teacher targets and splits by id', () => {
  const ex = [{ id: 'e1', system: 'S', user: 'U1', output: 'local', teacher: 'premium' }, { id: 'e2', user: 'U2', output: 'O2' }, { id: 'e3', user: 'U3', output: '' }];
  const a = L.buildDataset(ex), b = L.buildDataset(ex);
  assert.equal(a.hash, b.hash);
  assert.equal(a.train.length + a.eval.length, 2, 'empty targets are dropped');
  const all = [...a.train, ...a.eval].map(l => JSON.parse(l));
  assert.equal(all.find(m => m.messages.some(x => x.content === 'U1')).messages.at(-1).content, 'premium');
  assert.equal(L.splitOf('same-id'), L.splitOf('same-id'));
});

test('training memory: full training costs far more than QLoRA on the same model', () => {
  const full = L.trainMemory({ mode: 'scratch', params: 1e9, arch: L.PRESETS.medium, seq: 1024, microbatch: 1 });
  const lora = L.trainMemory({ mode: 'lora', params: 1e9, arch: L.PRESETS.medium, seq: 1024, microbatch: 1 });
  assert.ok(full.range[0] > 14, 'full 1B >14 GiB: ' + full.range);
  assert.ok(lora.range[1] < full.range[0]);
});

test('training kit contains a runnable recipe pinned to the design', () => {
  const kit = L.trainingKit({ mode: 'scratch', design: L.PRESETS.proof, name: 'my-model', tokenizer: 'new' });
  assert.ok(kit['train.py'].includes('LlamaForCausalLM(cfg)'));
  assert.ok(kit['train.py'].includes('26354176'), 'script asserts the parameter count the app showed');
  assert.ok(!/from_pretrained\(\s*BASE/.test(kit['train.py']), 'scratch route never loads pretrained weights');
  assert.ok(kit.Modelfile.startsWith('FROM ./my-model-q4.gguf'));
  assert.ok(kit['run.ps1'].includes('ollama create scripty-my-model'));
  const lora = L.trainingKit({ mode: 'lora', base: 'Qwen/Qwen2.5-1.5B-Instruct', name: 'x', lora: { rank: 16 } });
  assert.ok(lora['train.py'].includes('LoraConfig') && lora['train.py'].includes('merge_and_unload'));
  for (const k of [kit, lora]) for (const [f, body] of Object.entries(k)) assert.ok(!/__[A-Z]+__/.test(body), f + ' has an unfilled placeholder');
  assert.throws(() => L.trainingKit({ mode: 'lora', base: 'bad name; rm -rf', name: 'x' }));
});

test('review fixes: quant search, unknown quant, installed size, per-layer KV arrays, MoE names, negative reserve', () => {
  const list = [{ id: 'a', name: 'qwen2.5-coder:7b', quant: 'Q4_K_M' }, { id: 'b', name: 'llama3:8b', quant: 'Q8_0' }];
  assert.deepEqual(L.searchCatalog(list, 'coder q4').map(x => x.id), ['a']);
  assert.equal(L.estimateVram({ params: 20e9, quant: 'MXFP4' }, { context: 4096 }).range, null, 'unknown quant is not guessed as 16-bit');
  const inst = L.estimateVram({ params: 20e9, quant: 'MXFP4', sizeBytes: 13e9, installed: true }, { context: 4096 });
  assert.ok(inst.range[0] > 12 && inst.range[1] < 16, 'installed size is used as the weights: ' + inst.range);
  const v = L.variantFromOllama({ name: 'h:1', details: {} }, { model_info: { 'general.architecture': 'h', 'h.block_count': 4, 'h.attention.head_count': 8,
    'h.attention.head_count_kv': [0, 2, 0, 2], 'h.embedding_length': 512 } });
  assert.equal(v.arch.kvHeads, 2);
  assert.equal(L.parseParams('Mixtral-8x7B-Instruct'), 56e9, 'MoE names count every expert (upper bound)');
  assert.equal(L.effectiveBudget(10, -5), 10);
});

test('review fixes: duplicate examples never straddle splits and one example still trains', () => {
  const ds = L.buildDataset([{ id: 'x1', user: 'U', output: 'O' }, { id: 'x2', user: 'U', output: 'O' }, { id: 'x3', user: 'V', output: 'P' }]);
  assert.equal(ds.train.length + ds.eval.length, 2);
  for (let i = 0; i < 40; i++) assert.equal(L.buildDataset([{ id: 'only' + i, user: 'U', output: 'O' }]).train.length, 1);
});

test('review fixes: shapes llama-quantize and SentencePiece reject are caught early', () => {
  assert.ok(L.validateArch({ ...L.PRESETS.proof, mlp: 1370 }).some(e => /multiple of 32/.test(e)));
  assert.ok(L.validateArch({ ...L.PRESETS.proof, vocab: 300 }).some(e => /at least 1024/.test(e)));
  assert.throws(() => L.trainingKit({ mode: 'scratch', name: 'x' }), /design/i);
  assert.ok(L.trainingKit({ mode: 'lora', base: 'a/b', name: 'x', context: -5 }).Modelfile.includes('num_ctx 4096'));
});

test('generated run.ps1 parses and checks every native command', { skip: process.platform !== 'win32' }, () => {
  const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
  for (const kit of [L.trainingKit({ mode: 'scratch', design: L.PRESETS.proof, name: 'p' }), L.trainingKit({ mode: 'lora', base: 'a/b', name: 'p' })]) {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ps1-')), 'run.ps1');
    fs.writeFileSync(f, kit['run.ps1']);
    const r = spawnSync('powershell', ['-NoProfile', '-Command', "$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('" + f + "',[ref]$null,[ref]$e); $e.Count"], { encoding: 'utf8' });
    assert.equal(r.stdout.trim(), '0', 'PowerShell parse errors: ' + r.stdout + r.stderr);
    assert.ok(kit['run.ps1'].includes('whl/cu128'));
    for (const line of kit['run.ps1'].split('\n')) if (/(^|\{ )(& |ollama |python )/.test(line) && !/find_spec/.test(line)) assert.ok(/; Check '/.test(line), 'exit code unchecked: ' + line);
  }
});
