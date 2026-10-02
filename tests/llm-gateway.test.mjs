// 私有 API Key 网关（Part 6-1）：tests/llm-gateway.test.mjs —— 不发任何真实请求，只验「该怎么发」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, providerOf, checkConfig, buildRequest, readText, maskKey, redact } from '../map/tavern/llm-gateway.mjs';

test('四家都在表上，认不出返回 null', () => {
  for (const id of ['openai', 'claude', 'gemini', 'deepseek']) assert.ok(providerOf(id)?.id === id);
  assert.ok(providerOf('custom'));
  assert.equal(providerOf('乱写'), null);
  assert.equal(new Set(PROVIDERS.map(p => p.id)).size, PROVIDERS.length);
});

test('体检：缺哪一项报哪一项，不抛', () => {
  assert.deepEqual(checkConfig({ provider: 'openai', key: 'sk-x', model: 'm' }), { ok: true, errors: [] });
  assert.deepEqual(checkConfig({}).errors, ['provider', 'key', 'base', 'model']);
  assert.deepEqual(checkConfig({ provider: 'openai', key: 'sk-x' }).errors, [], '有预设默认模型时不算缺 model');
  assert.deepEqual(checkConfig({ provider: 'custom', base: 'https://x/v1', key: 'k' }).errors, ['model'], '自定义端点没有默认模型，必须自己填');
  assert.deepEqual(checkConfig({ provider: 'openai', model: 'm' }).errors, ['key']);
  assert.deepEqual(checkConfig({ provider: 'openai', key: 'sk-x', model: 'm', base: 'ftp://x' }).errors, ['base-scheme'], '只认 http(s)');
  assert.deepEqual(checkConfig({ provider: 'custom', key: 'k', model: 'm' }).errors, ['base'], '自定义端点必须自己填地址');
});

test('OpenAI / DeepSeek：Bearer 头 + /chat/completions', () => {
  const r = buildRequest({ provider: 'deepseek', key: 'sk-deep', model: 'deepseek-chat' }, [{ role: 'user', content: '你好' }], { maxTokens: 64 });
  assert.equal(r.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(r.headers.authorization, 'Bearer sk-deep');
  assert.equal(r.body.model, 'deepseek-chat');
  assert.equal(r.body.max_tokens, 64);
  assert.equal(r.body.temperature, .3);
  assert.deepEqual(r.body.messages, [{ role: 'user', content: '你好' }]);
});

test('Claude：x-api-key + anthropic-version，不是 Bearer', () => {
  const r = buildRequest({ provider: 'claude', key: 'sk-ant' }, [{ role: 'user', content: 'hi' }]);
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.headers['x-api-key'], 'sk-ant');
  assert.equal(r.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.headers.authorization, undefined);
});

test('Gemini：key 走查询串，正文是 contents / parts', () => {
  const r = buildRequest({ provider: 'gemini', key: 'AIza', model: 'gemini-1.5-flash' }, [{ role: 'user', content: 'hi' }]);
  assert.equal(r.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIza');
  assert.equal(r.headers.authorization, undefined);
  assert.deepEqual(r.body.contents, [{ role: 'user', parts: [{ text: 'hi' }] }]);
  assert.equal(r.body.generationConfig.maxOutputTokens, 512);
});

test('自定义兼容端点：base 末尾斜杠与模型缺省都处理好', () => {
  const r = buildRequest({ provider: 'custom', base: 'http://localhost:11434/v1/', key: 'k', model: 'qwen2.5' }, [{ role: 'user', content: 'x' }]);
  assert.equal(r.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(r.body.model, 'qwen2.5');
  const r2 = buildRequest({ provider: 'openai', key: 'k', model: 'm' }, []);
  assert.deepEqual(r2.body.messages, [], '空消息列表不炸');
});

test('读文本：OpenAI / Claude / Gemini / 纯文本四种形状', () => {
  assert.equal(readText({ choices: [{ message: { content: '甲' } }] }), '甲');
  assert.equal(readText({ content: [{ type: 'text', text: '乙' }] }), '乙');
  assert.equal(readText({ candidates: [{ content: { parts: [{ text: '丙' }, { text: '丁' }] } }] }), '丙丁');
  assert.equal(readText({ text: '戊' }), '戊');
  assert.equal(readText(null), '');
  assert.equal(readText({}), '');
});

test('钥匙脱敏：日志与界面只留头尾', () => {
  assert.equal(maskKey('sk-1234567890abcd'), 'sk-••••abcd');
  assert.equal(maskKey('short'), '••••');
  assert.equal(maskKey(''), '');
  const r = redact({ provider: 'openai', key: 'sk-abcdefghijkl', headers: { authorization: 'Bearer sk-abcdefghijkl' } });
  assert.equal(r.key, 'sk-••••ijkl');
  assert.equal(r.headers.authorization, 'Bea••••ijkl');
  assert.equal(r.provider, 'openai', '非敏感字段原样保留');
});

test('FIX-B6：每家的默认模型与请求形状（url、头、正文）', () => {
  const msg = [{ role: 'user', content: 'hi' }];
  const c = buildRequest({ provider: 'claude', key: 'K' }, msg);
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(c.headers['x-api-key'], 'K');
  assert.equal(c.body.model, 'claude-haiku-4-5');
  assert.deepEqual(c.body.messages, msg);
  const g = buildRequest({ provider: 'gemini', key: 'K' }, msg);
  assert.equal(g.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=K');
  assert.equal(g.headers['anthropic-dangerous-direct-browser-access'], undefined);
  assert.equal(g.body.model, undefined);
  const o = buildRequest({ provider: 'openai', key: 'K' }, msg);
  assert.equal(o.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(o.headers.authorization, 'Bearer K');
  assert.equal(o.headers['anthropic-dangerous-direct-browser-access'], undefined);
  assert.equal(o.body.model, 'gpt-4.1-mini');
  const d = buildRequest({ provider: 'deepseek', key: 'K' }, msg);
  assert.equal(d.body.model, 'deepseek-chat');
});
