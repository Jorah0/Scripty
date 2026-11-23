const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/core/providers.js');

const msgs = [{ role: 'user', content: 'hi' }];

test('catalog covers the major providers', () => {
  for (const id of ['anthropic', 'openai', 'gemini', 'ollama', 'openrouter', 'groq', 'mistral', 'deepseek', 'xai', 'lmstudio', 'custom']) {
    assert.ok(P.PROVIDERS[id], id);
  }
});

test('anthropic request uses native messages API with system split out', () => {
  const r = P.buildRequest('anthropic', { apiKey: 'k', model: 'm' }, msgs, { system: 'S', temperature: 0.5, maxTokens: 100 });
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.headers['x-api-key'], 'k');
  assert.ok(r.headers['anthropic-version']);
  assert.equal(r.body.system, 'S');
  assert.equal(r.body.stream, true);
  assert.deepEqual(r.body.messages, msgs);
});

test('openai-compatible request puts system first and bearer auth; ollama needs no key', () => {
  const r = P.buildRequest('openai', { apiKey: 'k', model: 'm' }, msgs, { system: 'S' });
  assert.equal(r.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(r.headers.Authorization, 'Bearer k');
  assert.deepEqual(r.body.messages[0], { role: 'system', content: 'S' });
  const o = P.buildRequest('ollama', { model: 'llama3' }, msgs, {});
  assert.equal(o.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(o.headers.Authorization, undefined);
  const c = P.buildRequest('custom', { baseUrl: 'http://x/v1/', model: 'm' }, msgs, {});
  assert.equal(c.url, 'http://x/v1/chat/completions');
});

test('stream parser extracts text deltas across chunk boundaries', () => {
  const a = P.createStreamParser('anthropic');
  const ev = 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n';
  const ev2 = 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n';
  const whole = ev + ev2;
  const out = [...a(whole.slice(0, 30)), ...a(whole.slice(30))].join('');
  assert.equal(out, 'Hello');

  const o = P.createStreamParser('openai');
  const s = 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: {"choices":[{"delta":{"content":" there"}}]}\n\ndata: [DONE]\n\n';
  assert.equal(o(s).join(''), 'Hi there');
});

test('stream parser surfaces provider errors', () => {
  const a = P.createStreamParser('anthropic');
  assert.throws(() => a('data: {"type":"error","error":{"message":"overloaded"}}\n\n'), /overloaded/);
});

test('model list URL and parse', () => {
  assert.equal(P.modelsRequest('openai', { apiKey: 'k' }).url, 'https://api.openai.com/v1/models');
  assert.deepEqual(P.parseModels({ data: [{ id: 'b' }, { id: 'a' }] }), ['a', 'b']);
  assert.deepEqual(P.parseModels({ models: [{ name: 'models/gemini-x' }] }), ['gemini-x']);
});
