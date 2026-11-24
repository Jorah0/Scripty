/* Scripty Model Lab core: hardware fit, VRAM estimates, catalog search, scratch-model design,
   training datasets and training kits. Pure functions, shared by main, renderer (window.ModelLab) and tests.
   Math follows the Local AI Marketplace handbook (pp. 6-7, 14-16, 22-25). Units are GiB (2^30 bytes). */
(function (root) {
  'use strict';
  const GiB = 2 ** 30;
  const r1 = x => Math.round(x * 10) / 10;

  // Effective bits per weight by GGUF quantization (llama.cpp averages incl. scales).
  const QUANT_BPW = { Q2_K: 2.6, Q3_K_S: 3.5, Q3_K_M: 3.9, Q4_0: 4.5, Q4_1: 5, Q4_K_S: 4.6, Q4_K_M: 4.85, Q5_0: 5.5, Q5_K_S: 5.5, Q5_K_M: 5.7,
    Q6_K: 6.6, Q8_0: 8.5, F16: 16, BF16: 16, F32: 32 };
  const bpwOf = q => QUANT_BPW[String(q || '').toUpperCase()] || null;

  const effectiveBudget = (freeGiB, reserveGiB) => Math.max(0, (Number(freeGiB) || 0) - Math.max(0, Number(reserveGiB) || 0));

  /** K+V bytes for uniform full attention: 2 x layers x KV heads x head dim x bytes x cached positions. */
  function kvBytes(arch, w) {
    return 2 * arch.layers * arch.kvHeads * arch.headDim * (w.kvBytes || 2) * (w.context || 4096) * (w.concurrency || 1);
  }

  /** Peak incremental VRAM range for full-GPU inference. Returns { range:[lo,hi] GiB | null, confidence, parts }. */
  function estimateVram(v, w) {
    w = w || {};
    const bpw = bpwOf(v && v.quant), size = v && v.installed && v.sizeBytes; // an installed file's size is the real weight footprint
    if (!v || (!v.params && !size)) return { range: null, confidence: 'unknown', reason: 'No parameter count for this variant.' };
    if (!bpw && !size) return { range: null, confidence: 'unknown', reason: 'Unknown quantization (' + (v.quant || 'none') + ').' };
    const weights = size || v.params * bpw / 8;
    // ponytail: unknown dims assume a typical GQA cache (128 KiB/token); flagged "rough" so the UI never shows it as measured.
    const kv = v.arch ? kvBytes(v.arch, w) : 131072 * (w.context || 4096) * (w.concurrency || 1);
    const lo = (weights + kv) / GiB + 0.3, hi = (weights * 1.08 + kv) / GiB + 1.0; // + graph/workspace and allocator margin
    return { range: [r1(lo), r1(hi)], confidence: v.arch ? 'estimated' : 'rough', parts: { weights: r1(weights / GiB), kv: r1(kv / GiB) }, reason: '' };
  }

  /** Handbook status logic: upper bound fits -> fits; lower bound over -> incompatible; straddles -> borderline. */
  function fitStatus(range, hw) {
    if (!range) return { status: 'unknown', reason: 'Not enough metadata for a defensible estimate.' };
    if (!hw || !(hw.totalGiB > 0)) return { status: 'unknown', reason: 'No GPU memory reading for this machine.' };
    const [lo, hi] = range, b = hw.budgetGiB;
    const pct = [Math.round(100 * lo / hw.totalGiB), Math.round(100 * hi / hw.totalGiB)];
    if (hi <= b) return { status: 'fits', pct, headroom: [r1(b - hi), r1(b - lo)], reason: 'Fits full GPU.' };
    if (lo > b) return { status: 'incompatible', pct, shortfall: [r1(lo - b), r1(hi - b)], reason: 'Too large for full-GPU on this profile.' };
    return { status: 'borderline', pct, reason: 'May exceed the budget. Try a shorter context, fewer requests or a smaller quant.' };
  }

  // ---------- scratch architecture (bias-free Llama-style decoder, RMSNorm, gated SiLU MLP, RoPE) ----------
  const PRESETS = {
    proof: { label: 'Pipeline proof · 26M', vocab: 8192, layers: 8, hidden: 512, mlp: 1376, heads: 8, kvHeads: 2, context: 1024, tied: true },
    small: { label: 'Small · ~100M', vocab: 16384, layers: 12, hidden: 768, mlp: 2048, heads: 12, kvHeads: 4, context: 2048, tied: true },
    medium: { label: 'Medium · ~1.1B', vocab: 32000, layers: 22, hidden: 2048, mlp: 5632, heads: 32, kvHeads: 4, context: 2048, tied: false },
  };
  const ARCH_FIELDS = ['vocab', 'layers', 'hidden', 'mlp', 'heads', 'kvHeads', 'context'];

  function validateArch(c) {
    const e = [];
    for (const k of ARCH_FIELDS) if (!(Number.isInteger(c[k]) && c[k] > 0)) e.push(k + ' must be a positive whole number.');
    if (e.length) return e;
    if (c.vocab < 1024) e.push('Vocabulary must be at least 1024 (byte fallback and special tokens need room).');
    for (const k of ['hidden', 'mlp']) if (c[k] % 32) e.push((k === 'mlp' ? 'MLP width ' : 'Hidden width ') + c[k] + ' must be a multiple of 32 (GGUF quantization blocks).');
    if (c.hidden % c.heads) e.push('Hidden width ' + c.hidden + ' must be divisible by heads (' + c.heads + ').');
    else if ((c.hidden / c.heads) % 2) e.push('Head dimension ' + (c.hidden / c.heads) + ' must be even for rotary positions.');
    if (c.heads % c.kvHeads) e.push('Heads (' + c.heads + ') must be divisible by KV heads (' + c.kvHeads + ').');
    return e;
  }
  /** Unique weights: V*d (x2 if untied) + L(2dHh + 2d*kv*h + 3dm + 2d) + d. */
  function paramCount(c) {
    const h = c.hidden / c.heads, d = c.hidden;
    return c.vocab * d * (c.tied ? 1 : 2) + c.layers * (2 * d * c.heads * h + 2 * d * c.kvHeads * h + 3 * d * c.mlp + 2 * d) + d;
  }
  const archOf = c => ({ layers: c.layers, kvHeads: c.kvHeads, headDim: c.hidden / c.heads, hidden: c.hidden });

  /** Training peak range. Full: bf16 weights+grads, fp32 master + AdamW m,v = 16 B/param. QLoRA: 4-bit base ~0.55 B/param. */
  function trainMemory(o) {
    const a = o.arch && o.arch.hidden ? o.arch : null;
    const act = a ? 34 * (o.seq || 1024) * (o.microbatch || 1) * a.hidden * a.layers : o.params * 0.5 * (o.seq || 1024) / 1024;
    const states = o.mode === 'lora' ? o.params * 0.55 : o.params * 16;
    return { range: [r1((states + act * 0.3) / GiB + 0.5), r1((states + act) / GiB + 1.5)], confidence: 'estimated' };
  }

  // ---------- catalog ----------
  function parseParams(s) {
    // "8x7B" counts every expert: an upper bound (shared layers make the real total smaller), never an underestimate.
    const m = /(?:(\d+)x)?(\d+(?:\.\d+)?)\s*([bm])(?![a-z])/i.exec(String(s || ''));
    return m ? Math.round((Number(m[1]) || 1) * parseFloat(m[2]) * (m[3].toLowerCase() === 'b' ? 1e9 : 1e6)) : null;
  }
  function variantFromOllama(tag, show) {
    const mi = (show && show.model_info) || {}, d = tag.details || {}, a = mi['general.architecture'];
    const g = k => mi[a + '.' + k];
    const layers = g('block_count'), heads = g('attention.head_count'), emb = g('embedding_length');
    const kvRaw = g('attention.head_count_kv'), kvH = (Array.isArray(kvRaw) ? Math.max(...kvRaw) : kvRaw) || heads, headDim = g('attention.key_length') || (emb && heads ? emb / heads : 0);
    return {
      id: 'ollama:' + tag.name, name: tag.name, source: 'ollama', publisher: 'Local', installed: true, family: d.family || a || '',
      quant: d.quantization_level || '', params: mi['general.parameter_count'] || parseParams(d.parameter_size),
      arch: layers && kvH && headDim ? { layers, kvHeads: kvH, headDim } : null, context: g('context_length') || null,
      sizeBytes: tag.size || null, digest: tag.digest || '', tags: [d.family, a, d.parameter_size, d.format].filter(Boolean),
    };
  }
  function variantFromHF(m) {
    const id = String(m.id || m.modelId || '');
    return { id: 'hf:' + id, name: id, source: 'huggingface', publisher: id.split('/')[0], installed: false, quant: 'Q4_K_M', quantAssumed: true,
      params: (m.gguf && m.gguf.total) || parseParams(id), arch: null, context: (m.gguf && m.gguf.context_length) || null,
      downloads: m.downloads || 0, likes: m.likes || 0, task: m.pipeline_tag || '', tags: (m.tags || []).slice(0, 12), url: 'https://huggingface.co/' + id };
  }
  /** ponytail: in-memory token AND match; PostgreSQL FTS / pg_trgm when the catalog outgrows a few thousand rows. */
  function searchCatalog(list, q) {
    const toks = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return list.slice();
    const exact = String(q).trim().toLowerCase();
    return list.filter(v => { const hay = [v.name, v.publisher, v.family, v.task, v.quant, ...(v.tags || [])].join(' ').toLowerCase(); return toks.every(t => hay.includes(t)); })
      .sort((a, b) => (b.name.toLowerCase() === exact) - (a.name.toLowerCase() === exact));
  }

  // ---------- learning data ----------
  function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  const splitOf = id => (fnv(String(id)) % 10 === 0 ? 'eval' : 'train'); // stable 90/10 split by example id
  /** Chat-format SFT JSONL. A premium teacher's target wins over the original output. Deterministic order and hash. */
  function buildDataset(examples) {
    const out = { train: [], eval: [] }, seen = new Set();
    for (const e of [...examples].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      const target = String(e.teacher || e.output || '').trim(), key = (e.system || '') + '\u0000' + e.user + '\u0000' + target;
      if (!target || !String(e.user || '').trim() || seen.has(key)) continue; // duplicates would leak across the split
      seen.add(key);
      const messages = [...(e.system ? [{ role: 'system', content: e.system }] : []), { role: 'user', content: e.user }, { role: 'assistant', content: target }];
      out[splitOf(e.id)].push(JSON.stringify({ messages }));
    }
    if (!out.train.length && out.eval.length) out.train.push(out.eval.shift()); // tiny sets: training data comes first
    out.hash = fnv(out.train.join('\n') + '\u0000' + out.eval.join('\n')).toString(16).padStart(8, '0');
    return out;
  }

  // ---------- training kit (Python worker + Ollama export) ----------
  const py = v => JSON.stringify(v);
  const pyBool = b => (b ? 'True' : 'False');
  const fill = (tpl, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split('__' + k + '__').join(String(v)), tpl); // every occurrence
  const safeName = s => String(s || 'custom').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'custom';
  function trainingKit(o) {
    const name = safeName(o.name);
    const epochs = Math.max(1, Math.min(50, Number(o.epochs) || (o.mode === 'lora' ? 1 : 3)));
    let train, ctx, template = '';
    if (o.mode === 'lora') {
      if (!/^[\w.-]+\/[\w.-]+$/.test(o.base || '')) throw new Error('Base model must be a Hugging Face id like Qwen/Qwen2.5-1.5B-Instruct.');
      const rank = Math.max(4, Math.min(256, Number(o.lora && o.lora.rank) || 16));
      ctx = Number.isInteger(o.context) && o.context >= 512 && o.context <= 131072 ? o.context : 4096;
      train = fill(LORA_PY, { BASE: py(o.base), RANK: rank, EPOCHS: epochs });
    } else {
      if (!o.design) throw new Error('Scratch mode needs a model design.');
      const d = o.design, errs = validateArch(d);
      if (errs.length) throw new Error(errs.join(' '));
      ctx = d.context;
      train = fill(SCRATCH_PY, { EXPECTED: paramCount(d), TOKENIZER: o.tokenizer === 'new' || !o.tokenizer ? 'None' : py(o.tokenizer), EPOCHS: epochs, TIED: pyBool(d.tied) });
      template = 'TEMPLATE """{{ if .System }}<|system|>\n{{ .System }}\n{{ end }}<|user|>\n{{ .Prompt }}\n<|assistant|>\n"""\nPARAMETER stop <|user|>\nPARAMETER stop <|eos|>\n';
    }
    const tag = 'scripty-' + name;
    return {
      'train.py': train,
      'requirements.txt': 'transformers>=4.46\ndatasets>=3.0\ntokenizers>=0.20\naccelerate>=1.0\n' + (o.mode === 'lora' ? 'peft>=0.13\ntrl>=0.12\nbitsandbytes>=0.45\n' : '') + 'sentencepiece\nprotobuf\n',
      Modelfile: 'FROM ./' + name + '-q4.gguf\nPARAMETER temperature 0.7\nPARAMETER num_ctx ' + ctx + '\n' + template,
      'run.ps1': fill(RUN_PS1, { NAME: name, TAG: tag }),
      'README.md': '# ' + tag + '\n\nGenerated by Scripty Model Lab (' + (o.mode === 'lora' ? 'QLoRA fine-tune of ' + o.base : 'from-scratch design, ' + paramCount(o.design).toLocaleString('en-US') + ' parameters') + ').\n\n' +
        '1. Install Python 3.10+ and Ollama. For export, clone and build llama.cpp, then `$env:LLAMA_CPP = "C:\\path\\to\\llama.cpp"`.\n' +
        '2. Run `powershell -ExecutionPolicy Bypass -File run.ps1`. It trains (resuming from the last checkpoint if stopped), converts to GGUF, quantizes to Q4_K_M and registers `' + tag + '` with Ollama.\n' +
        '3. In Scripty: Model Lab -> Refresh catalog, select `' + tag + '`, then use it like any other model.\n\n' +
        'train.jsonl / eval.jsonl: reviewed examples (premium-teacher targets where distilled). manifest.json records the dataset hash so the same examples rebuild the same dataset.\n' +
        'Pause training while streaming: stop the script; rerun to resume. Estimates shown in Scripty are not measurements; check peak VRAM with nvidia-smi during the first steps.\n',
    };
  }

  const SCRATCH_PY = `# Scripty Model Lab: train a model FROM SCRATCH (random weights). No pretrained weights are ever loaded here.
import json, os, glob, hashlib, shutil, torch
from transformers import LlamaConfig, LlamaForCausalLM, AutoTokenizer, Trainer, TrainingArguments
from datasets import Dataset

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "design.json")))["design"]
EXPECTED_PARAMS = __EXPECTED__   # the count Scripty showed; construction must match it exactly
REUSE_TOKENIZER = __TOKENIZER__  # None = train a fresh SentencePiece BPE tokenizer on the training split only
SEED, OUT = 42, os.path.join(HERE, "out")
ROLES = ["<|system|>", "<|user|>", "<|assistant|>"]

def rows(split):
    p = os.path.join(HERE, split + ".jsonl")
    if not os.path.exists(p): return []
    return ["".join(f"<|{x['role']}|>\\n{x['content']}\\n" for x in json.loads(line)["messages"]) for line in open(p, encoding="utf-8") if line.strip()]

train_text, eval_text = rows("train"), rows("eval")
assert train_text, "train.jsonl is empty: collect examples in Scripty first"
os.makedirs(OUT, exist_ok=True)

if REUSE_TOKENIZER:
    tokenizer = AutoTokenizer.from_pretrained(REUSE_TOKENIZER)
    tokenizer.add_special_tokens({"additional_special_tokens": ROLES})
    BOS, EOS = tokenizer.bos_token_id, tokenizer.eos_token_id
    PAD = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else EOS
    enc = lambda t: tokenizer(t)["input_ids"] + [EOS]
    n_tok = len(tokenizer)
else:
    # SentencePiece (tokenizer.model) exports to GGUF without llama.cpp's BPE pre-tokenizer allow-list.
    import sentencepiece as spm
    corpus = os.path.join(OUT, "tokenizer-corpus.txt")
    open(corpus, "w", encoding="utf-8").write("\\n".join(train_text))
    spm.SentencePieceTrainer.train(input=corpus, model_prefix=os.path.join(OUT, "spm"), vocab_size=D["vocab"], model_type="bpe",
        byte_fallback=True, split_digits=True, character_coverage=1.0, hard_vocab_limit=False, user_defined_symbols=ROLES,
        pad_id=0, unk_id=1, bos_id=2, eos_id=3, pad_piece="<|pad|>", unk_piece="<unk>", bos_piece="<|bos|>", eos_piece="<|eos|>", minloglevel=2)
    sp = spm.SentencePieceProcessor(model_file=os.path.join(OUT, "spm.model"))
    PAD, BOS, EOS = 0, 2, 3
    enc = lambda t: [BOS] + sp.encode(t) + [EOS]
    n_tok = sp.get_piece_size()
# A small corpus can learn fewer pieces than designed: the rest are reserved ids, so the model keeps its designed shape.
assert n_tok <= D["vocab"], f"tokenizer has {n_tok} ids but the design says vocab={D['vocab']}; raise the vocabulary"
print("tokenizer ids:", n_tok, "of", D["vocab"])

torch.manual_seed(SEED)
cfg = LlamaConfig(vocab_size=D["vocab"], hidden_size=D["hidden"], intermediate_size=D["mlp"], num_hidden_layers=D["layers"],
                  num_attention_heads=D["heads"], num_key_value_heads=D["kvHeads"], max_position_embeddings=D["context"],
                  tie_word_embeddings=__TIED__, attention_bias=False, mlp_bias=False, rms_norm_eps=1e-5,
                  pad_token_id=PAD, bos_token_id=BOS, eos_token_id=EOS)
model = LlamaForCausalLM(cfg)  # constructs fresh weights
count = sum(p.numel() for p in model.parameters())
assert count == EXPECTED_PARAMS, f"constructed {count} parameters, Scripty showed {EXPECTED_PARAMS}"
h = hashlib.sha256()
for p in model.parameters(): h.update(p.detach().cpu().contiguous().numpy().tobytes())
json.dump({"seed": SEED, "params": count, "init_sha256": h.hexdigest(), "torch": torch.__version__}, open(os.path.join(OUT, "init.json"), "w"), indent=2)
print("parameters:", count, "init sha256:", h.hexdigest())

def tok_ds(texts):
    return Dataset.from_dict({"input_ids": [enc(t)[:D["context"]] for t in texts]})
def collate(batch):  # right-pad; padding never counts toward the loss (the model shifts labels itself)
    n = max(len(b["input_ids"]) for b in batch)
    ids = torch.full((len(batch), n), PAD, dtype=torch.long); mask = torch.zeros((len(batch), n), dtype=torch.long)
    for i, b in enumerate(batch):
        ids[i, :len(b["input_ids"])] = torch.tensor(b["input_ids"]); mask[i, :len(b["input_ids"])] = 1
    return {"input_ids": ids, "attention_mask": mask, "labels": ids.masked_fill(mask == 0, -100)}
bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
steps = -(-len(train_text) // 16) * __EPOCHS__  # optimizer updates = ceil(rows / (batch 2 x accum 8)) x epochs
args = TrainingArguments(output_dir=os.path.join(OUT, "ckpt"), seed=SEED, num_train_epochs=__EPOCHS__,
    per_device_train_batch_size=2, gradient_accumulation_steps=8, learning_rate=3e-4, adam_beta1=0.9, adam_beta2=0.95,
    weight_decay=0.1, max_grad_norm=1.0, warmup_steps=max(1, int(0.02 * steps)), lr_scheduler_type="cosine", bf16=bf16,
    logging_steps=10, save_steps=200, save_total_limit=2, eval_strategy="epoch" if eval_text else "no", report_to=[])
trainer = Trainer(model=model, args=args, train_dataset=tok_ds(train_text), eval_dataset=tok_ds(eval_text) if eval_text else None,
                  data_collator=collate)
resume = bool(glob.glob(os.path.join(OUT, "ckpt", "checkpoint-*")))
trainer.train(resume_from_checkpoint=resume or None)
if eval_text: print("eval:", trainer.evaluate())
HF = os.path.join(OUT, "hf")
model.save_pretrained(HF)
if REUSE_TOKENIZER: tokenizer.save_pretrained(HF)
else:
    shutil.copy(os.path.join(OUT, "spm.model"), os.path.join(HF, "tokenizer.model"))
    json.dump({"tokenizer_class": "LlamaTokenizer", "bos_token": "<|bos|>", "eos_token": "<|eos|>", "pad_token": "<|pad|>", "unk_token": "<unk>",
               "add_bos_token": True, "add_eos_token": False}, open(os.path.join(HF, "tokenizer_config.json"), "w"), indent=2)
if torch.cuda.is_available(): print("peak VRAM GiB:", round(torch.cuda.max_memory_allocated() / 2**30, 2))
`;

  const LORA_PY = `# Scripty Model Lab: QLoRA fine-tune of an existing base on your reviewed examples, then merge for export.
import json, os, glob, torch
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, PeftModel, prepare_model_for_kbit_training
from trl import SFTConfig, SFTTrainer

HERE = os.path.dirname(os.path.abspath(__file__))
BASE, RANK, OUT = __BASE__, __RANK__, os.path.join(HERE, "out")
files = {s: os.path.join(HERE, s + ".jsonl") for s in ("train", "eval") if os.path.getsize(os.path.join(HERE, s + ".jsonl")) > 0}
ds = load_dataset("json", data_files=files)
tokenizer = AutoTokenizer.from_pretrained(BASE)
bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16 if bf16 else torch.float16)
model = prepare_model_for_kbit_training(AutoModelForCausalLM.from_pretrained(BASE, quantization_config=bnb, device_map="auto"))
lora = LoraConfig(r=RANK, lora_alpha=2 * RANK, lora_dropout=0.05, target_modules="all-linear", task_type="CAUSAL_LM")
steps = -(-len(ds["train"]) // 16) * __EPOCHS__
args = SFTConfig(output_dir=os.path.join(OUT, "ckpt"), num_train_epochs=__EPOCHS__, per_device_train_batch_size=1,
                 gradient_accumulation_steps=16, learning_rate=1e-4, warmup_steps=max(1, int(0.03 * steps)), gradient_checkpointing=True,
                 bf16=bf16, fp16=not bf16 and torch.cuda.is_available(), logging_steps=5, save_steps=100, save_total_limit=2,
                 eval_strategy="epoch" if "eval" in files else "no", report_to=[])
trainer = SFTTrainer(model=model, args=args, train_dataset=ds["train"], eval_dataset=ds.get("eval"), peft_config=lora, processing_class=tokenizer)
trainer.train(resume_from_checkpoint=bool(glob.glob(os.path.join(OUT, "ckpt", "checkpoint-*"))) or None)
trainer.save_model(os.path.join(OUT, "adapter"))
if torch.cuda.is_available(): print("peak VRAM GiB:", round(torch.cuda.max_memory_allocated() / 2**30, 2))
del model, trainer; torch.cuda.empty_cache()
# Merge into a clean 16-bit copy of the exact base for GGUF export.
base = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.bfloat16 if bf16 else torch.float16)
merged = PeftModel.from_pretrained(base, os.path.join(OUT, "adapter")).merge_and_unload()
merged.save_pretrained(os.path.join(OUT, "hf")); tokenizer.save_pretrained(os.path.join(OUT, "hf"))
`;

  // Native commands don't throw on failure, so every one is followed by Check (a failed convert must never register a stale GGUF).
  const RUN_PS1 = `$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" } }
if (-not (Test-Path .venv)) { python -m venv .venv; Check 'Creating the Python environment' }
$py = Join-Path $PSScriptRoot '.venv\\Scripts\\python.exe'
& $py -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('torch') else 1)"
if ($LASTEXITCODE -ne 0) {
  if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) { & $py -m pip install torch --index-url https://download.pytorch.org/whl/cu128; Check 'Installing PyTorch (CUDA)' }
  else { & $py -m pip install torch; Check 'Installing PyTorch' }
}
& $py -m pip install -r requirements.txt; Check 'Installing requirements'
& $py train.py; Check 'Training'
if (-not $env:LLAMA_CPP) { throw 'Training done (out\\hf). Set $env:LLAMA_CPP to your llama.cpp folder and run again to export to Ollama.' }
& $py -m pip install gguf; Check 'Installing gguf'
Remove-Item -ErrorAction SilentlyContinue __NAME__-f16.gguf, __NAME__-q4.gguf
& $py (Join-Path $env:LLAMA_CPP 'convert_hf_to_gguf.py') out\\hf --outfile __NAME__-f16.gguf --outtype f16; Check 'Converting to GGUF'
$q = Get-ChildItem -Path $env:LLAMA_CPP -Recurse -Filter 'llama-quantize.exe' | Select-Object -First 1
if (-not $q) { throw 'llama-quantize.exe not found under $env:LLAMA_CPP (build llama.cpp first).' }
& $q.FullName __NAME__-f16.gguf __NAME__-q4.gguf Q4_K_M; Check 'Quantizing'
ollama create __TAG__ -f Modelfile; Check 'Registering with Ollama'
ollama run __TAG__ "Return the single word READY."; Check 'Test run'
`;

  const ModelLab = { GiB, QUANT_BPW, PRESETS, ARCH_FIELDS, effectiveBudget, kvBytes, estimateVram, fitStatus, validateArch, paramCount, archOf,
    trainMemory, parseParams, variantFromOllama, variantFromHF, searchCatalog, splitOf, buildDataset, trainingKit, safeName };
  if (typeof module !== 'undefined' && module.exports) module.exports = ModelLab;
  else root.ModelLab = ModelLab;
})(typeof window !== 'undefined' ? window : globalThis);
