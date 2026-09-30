// 私有 API Key 网关（Part 6-1）：玩家自己的钥匙、自己选的端点。地图不内置任何 key、不代跑任何请求，
// 只在要用的时候把「该怎么发」算出来——请求由调用方发（宿主 / 后台领航员），本模块不碰网络、不碰存储、
// 不碰酒馆全局（node 单测直接喂配置，tests/llm.test.mjs）。
//
// 兼容四家：OpenAI（含一切 /v1/chat/completions 兼容端：DeepSeek、Moonshot、本地 llama.cpp…）、
// Claude（x-api-key + anthropic-version）、Gemini（?key= 查询串）、以及完全自定义的兼容端点。
export const PROVIDERS = [
  { id: 'openai', label: 'OpenAI / 兼容端点', base: 'https://api.openai.com/v1', path: '/chat/completions', auth: 'bearer', model: 'gpt-4o-mini' },
  { id: 'claude', label: 'Claude', base: 'https://api.anthropic.com/v1', path: '/messages', auth: 'header', header: 'x-api-key', version: '2023-06-01', model: 'claude-3-5-haiku-latest' },
  { id: 'gemini', label: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta', path: '/models/{model}:generateContent', auth: 'query', queryKey: 'key', model: 'gemini-1.5-flash' },
  { id: 'deepseek', label: 'DeepSeek', base: 'https://api.deepseek.com/v1', path: '/chat/completions', auth: 'bearer', model: 'deepseek-chat' },
  { id: 'custom', label: '自定义兼容端点', base: '', path: '/chat/completions', auth: 'bearer', model: '' },
];
export const providerOf = id => PROVIDERS.find(p => p.id === id) || null;

/** 体检：{ ok, errors }。缺 key / 端点 / 模型都只是「配不全」，不抛——设置页要能显示原因 */
export function checkConfig(cfg = {}) {
  const errors = [];
  const p = providerOf(cfg.provider);
  if (!p) errors.push('provider');
  if (!String(cfg.key || '').trim()) errors.push('key');
  const base = String(cfg.base || p?.base || '').trim();
  if (!base) errors.push('base');
  else if (!/^https?:\/\//i.test(base)) errors.push('base-scheme');
  if (!String(cfg.model || p?.model || '').trim()) errors.push('model');
  return { ok: errors.length === 0, errors };
}

/** 端点与请求：{ url, headers, body }。key 只进 headers / 查询串，不进日志（日志走 redact） */
export function buildRequest(cfg = {}, messages = [], opts = {}) {
  const p = providerOf(cfg.provider) || providerOf('custom');
  const base = String(cfg.base || p.base || '').replace(/\/+$/, '');
  const model = String(cfg.model || p.model || '').trim();
  const path = (p.path || '/chat/completions').replace('{model}', encodeURIComponent(model));
  const key = String(cfg.key || '').trim();
  const headers = { 'content-type': 'application/json' };
  let url = base + path;
  if (p.auth === 'bearer') headers.authorization = `Bearer ${key}`;
  else if (p.auth === 'header') { headers[p.header || 'x-api-key'] = key; if (p.version) headers['anthropic-version'] = p.version; }
  else if (p.auth === 'query') url += (url.includes('?') ? '&' : '?') + `${p.queryKey || 'key'}=${encodeURIComponent(key)}`;
  else headers.authorization = `Bearer ${key}`;   // 自定义：默认按兼容端点的 bearer 走
  const maxTokens = Math.max(1, Math.min(8192, Number(opts.maxTokens) || 512));
  const body = p.id === 'gemini'
    ? { contents: (Array.isArray(messages) ? messages : []).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content ?? '') }] })),
        generationConfig: { maxOutputTokens: maxTokens, temperature: Number.isFinite(Number(opts.temperature)) ? Number(opts.temperature) : .3 } }
    : { model, messages: (Array.isArray(messages) ? messages : []).map(m => ({ role: m.role || 'user', content: String(m.content ?? '') })),
        max_tokens: maxTokens, temperature: Number.isFinite(Number(opts.temperature)) ? Number(opts.temperature) : .3, stream: false };
  return { url, headers, body };
}

/** 读响应正文里的文本：各家形状不同，取不到就 ''（调用方按「没读出来」处理） */
export function readText(json) {
  try {
    if (typeof json?.text === 'string') return json.text;
    const c = json?.candidates?.[0]?.content?.parts;
    if (Array.isArray(c)) return c.map(p => String(p?.text || '')).join('');
    if (Array.isArray(json?.content)) return json.content.filter(b => b?.type === 'text').map(b => String(b.text || '')).join('');
    return String(json?.choices?.[0]?.message?.content ?? '');
  } catch (e) { return ''; }
}

/** 日志 / 界面显示用：钥匙只留前 3 与后 4 位 */
export const maskKey = k => { const s = String(k || ''); return s.length <= 8 ? (s ? '••••' : '') : `${s.slice(0, 3)}••••${s.slice(-4)}`; };
/** 深挖一份配置 / 请求里的钥匙（写日志前先过一遍） */
export function redact(o) {
  const j = JSON.stringify(o ?? null, (k, v) => (/key|authorization|token/i.test(k) ? maskKey(typeof v === 'string' ? v : '') : v));
  return JSON.parse(j);
}
