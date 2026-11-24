/* AI provider catalog, request builders and streaming parsers. Used by the Electron main process. */
'use strict';

// kind: 'anthropic' = native Messages API; 'openai' = OpenAI-compatible /chat/completions (covers most vendors and local servers).
const PROVIDERS = {
  anthropic: { label: 'Claude', vendor: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', needsKey: true, color: '#D97757',
    defaultModel: 'claude-sonnet-5-5', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'], keyUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { label: 'ChatGPT', vendor: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, color: '#10A37F',
    defaultModel: 'gpt-4o', models: [], keyUrl: 'https://platform.openai.com/api-keys' },
  gemini: { label: 'Gemini', vendor: 'Google', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true, color: '#4285F4',
    defaultModel: 'gemini-2.5-flash', models: [], keyUrl: 'https://aistudio.google.com/app/apikey' },
  ollama: { label: 'Ollama', vendor: 'Local', kind: 'openai', baseUrl: 'http://localhost:11434/v1', needsKey: false, local: true, color: '#9CA3AF',
    defaultModel: 'llama3.2', models: [], keyUrl: 'https://ollama.com/download' },
  lmstudio: { label: 'LM Studio', vendor: 'Local', kind: 'openai', baseUrl: 'http://localhost:1234/v1', needsKey: false, local: true, color: '#7C3AED',
    defaultModel: '', models: [], keyUrl: 'https://lmstudio.ai' },
  openrouter: { label: 'OpenRouter', vendor: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, color: '#6366F1',
    defaultModel: 'openrouter/auto', models: [], keyUrl: 'https://openrouter.ai/keys' },
  groq: { label: 'Groq', vendor: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true, color: '#F55036',
    defaultModel: 'llama-3.3-70b-versatile', models: [], keyUrl: 'https://console.groq.com/keys' },
  mistral: { label: 'Mistral', vendor: 'Mistral AI', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', needsKey: true, color: '#FA520F',
    defaultModel: 'mistral-large-latest', models: [], keyUrl: 'https://console.mistral.ai/api-keys' },
  deepseek: { label: 'DeepSeek', vendor: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', needsKey: true, color: '#4D6BFE',
    defaultModel: 'deepseek-chat', models: [], keyUrl: 'https://platform.deepseek.com/api_keys' },
  xai: { label: 'Grok', vendor: 'xAI', kind: 'openai', baseUrl: 'https://api.x.ai/v1', needsKey: true, color: '#E5E7EB',
    defaultModel: 'grok-3', models: [], keyUrl: 'https://console.x.ai' },
  together: { label: 'Together AI', vendor: 'Together', kind: 'openai', baseUrl: 'https://api.together.xyz/v1', needsKey: true, color: '#0F6FFF',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', models: [], keyUrl: 'https://api.together.xyz/settings/api-keys' },
  custom: { label: 'Custom (OpenAI-compatible)', vendor: 'Any', kind: 'openai', baseUrl: '', needsKey: false, color: '#14B8A6',
    defaultModel: '', models: [], keyUrl: '' },
};

function baseOf(id, cfg) {
  const p = PROVIDERS[id];
  if (!p) throw new Error('Unknown provider: ' + id);
  const base = String((cfg && cfg.baseUrl) || p.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error(p.label + ' needs a base URL (Providers page).');
  return { p, base };
}

function buildRequest(id, cfg, messages, opts) {
  opts = opts || {};
  const { p, base } = baseOf(id, cfg);
  const model = (cfg && cfg.model) || p.defaultModel;
  if (!model) throw new Error('Choose a model for ' + p.label + '.');
  if (p.kind === 'anthropic') {
    const body = { model, max_tokens: opts.maxTokens || 8192, messages, stream: true };
    if (opts.system) body.system = opts.system;
    if (opts.temperature != null) body.temperature = Math.max(0, Math.min(1, opts.temperature)); // Anthropic accepts 0..1 only
    return {
      url: base + '/messages',
      headers: { 'content-type': 'application/json', 'x-api-key': (cfg && cfg.apiKey) || '', 'anthropic-version': '2023-06-01' },
      body,
    };
  }
  const headers = { 'content-type': 'application/json' };
  if (cfg && cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;
  if (id === 'openrouter') { headers['HTTP-Referer'] = 'https://scripty.app'; headers['X-Title'] = 'Scripty'; }
  const body = { model, messages: opts.system ? [{ role: 'system', content: opts.system }, ...messages] : messages, stream: true };
  // OpenAI reasoning models reject custom temperature and max_tokens; others accept both.
  const reasoning = id === 'openai' && /^(o\d|gpt-5)/i.test(model);
  if (opts.temperature != null && !reasoning) body.temperature = opts.temperature;
  if (opts.maxTokens) body[id === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = opts.maxTokens;
  return { url: base + '/chat/completions', headers, body };
}

function modelsRequest(id, cfg) {
  const { p, base } = baseOf(id, cfg);
  if (p.kind === 'anthropic') {
    return { url: base + '/models?limit=100', headers: { 'x-api-key': (cfg && cfg.apiKey) || '', 'anthropic-version': '2023-06-01' } };
  }
  const headers = {};
  if (cfg && cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;
  return { url: base + '/models', headers };
}

function parseModels(json) {
  const list = (json && (json.data || json.models)) || [];
  const ids = list.map(m => String(m.id || m.name || m.model || '').replace(/^models\//, '')).filter(Boolean);
  return [...new Set(ids)].sort();
}

// Returns push(chunkText) -> array of text deltas. Buffers partial SSE events between chunks.
function createStreamParser(kind) {
  let buf = '';
  return function push(chunk) {
    buf += chunk;
    const events = buf.split(/\r?\n\r?\n/);
    buf = events.pop();
    const out = [];
    for (const ev of events) {
      const data = ev.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
      if (!data || data === '[DONE]') continue;
      let obj;
      try { obj = JSON.parse(data); } catch { continue; }
      if (obj.error || obj.type === 'error') {
        const e = obj.error || {};
        throw new Error(e.message || (typeof e === 'string' ? e : 'Provider error'));
      }
      if (kind === 'anthropic') {
        if (obj.type === 'content_block_delta' && obj.delta && obj.delta.type === 'text_delta') out.push(obj.delta.text);
      } else {
        const c = obj.choices && obj.choices[0];
        const t = c && c.delta && c.delta.content;
        if (t) out.push(t);
      }
    }
    return out;
  };
}

module.exports = { PROVIDERS, buildRequest, modelsRequest, parseModels, createStreamParser };
