// 柏宝绘（ST-BaiBai-Image）桥：**可选依赖**——宿主里没有 globalThis.STBaiBaiImage 时，
// 这里每一个函数都安静降级（返空 / 返 ok:false），地图照常跑，只是相关按钮不出现。
//
// 它提供三件事：
//   1) 读：角色外貌库（含历史楼层快照）、后端就绪状态、变更订阅；
//   2) 写：按我们自己的提示词出图（走它的并发闸门）；
//   3) 拼：画师串 + 场景 + 角色 tag 的机械拼装（去重、定序）。
//
// 三条不越界的规矩（照它 PUBLIC_API.md 的明文要求）：
//   a. 绝不绕过它直接打 NAI 的 generate-image：它的闸门（429 冷却 / 最小间隔 / 指数退避）包在接口里，
//      绕过去会让**用户的账号**吃一串密集 429，而用户只会以为是柏宝绘坏了；
//   b. 只读它公开返回的字段，不碰服务地址与 API Key（它本来也不返回这两样）；
//   c. 它生成的图默认不进聊天记录、不写 message.extra。我们要把图留下来，就收进**我们自己的**
//      IndexedDB 图集（map/core/room-gallery-db.mjs），而不是塞回聊天或楼层。
//
// 接口版本：只认 apiVersion === 1（结构只增不改不删，改含义才升版本）。不匹配就不调 generate，
// 免得把一个我们不认识的参数形态塞进去。

const KEY = 'STBaiBaiImage';
const READY_EVT = 'st-baibai-image:ready';
const CHANGED_EVT = 'st-baibai-image:changed';
const API_VERSION = 1;

// 找接口：本窗口 → 上层窗口 → 顶层窗口。
// 为什么必须往上看：地图与庄园页是嵌在酒馆页面里的 iframe（srcdoc / 仓库页），而柏宝绘装的是
// **酒馆页面**的扩展，它的 globalThis 在父窗上，不在我们 iframe 里。同源能直接取；跨域会抛，忽略即可。
export function api() {
  const lookups = [() => globalThis[KEY]];
  try { if (typeof window !== 'undefined' && window.parent && window.parent !== window) lookups.push(() => window.parent[KEY]); } catch (e) { }
  try { if (typeof window !== 'undefined' && window.top && window.top !== window) lookups.push(() => window.top[KEY]); } catch (e) { }
  for (const get of lookups) {
    try { const a = get(); if (a) return a; } catch (e) { /* 跨域 / 还没挂上：看下一处 */ }
  }
  return null;
}
export function available() { return !!api(); }

// 错误码 → 人话。按它文档的要求用 code 分支，不匹配 message 文案（那里随时会改）。
export const ERROR_TEXT = {
  aborted: { zh: '已取消', en: 'Cancelled' },
  not_configured: { zh: '柏宝绘还没配好出图渠道（在它的「渠道」页配 ComfyUI 或 NovelAI）', en: 'BaiBai Image has no backend configured yet (set one up on its Backends page).' },
  invalid_args: { zh: '请求不合法（提示词为空？）', en: 'Invalid request (empty prompt?)' },
  rate_limited: { zh: '被限流了，稍等一下再试', en: 'Rate limited — try again in a moment.' },
  backend_error: { zh: '出图后端报错（检查渠道配置或网络）', en: 'Backend error (check the backend config or network).' },
  missing: { zh: '没装柏宝绘（或它还没加载）', en: 'BaiBai Image is not installed (or not loaded yet).' },
  version: { zh: '柏宝绘接口版本不匹配（本桥只认 v1）', en: 'BaiBai Image API version mismatch (this bridge speaks v1).' },
};

export function normalizeError(err) {
  const code = (err && typeof err === 'object' && typeof err.code === 'string' && err.code) ? err.code : 'backend_error';
  const key = ERROR_TEXT[code] ? code : 'backend_error';
  return { code: key, message: String((err && err.message) || ''), text: ERROR_TEXT[key] };
}

// 一个统一的「现在能不能用」探测：装了 + 版本对 + 后端配好。
// reason 用人话（中文直接来自柏宝绘的 getBackendStatus().reason），方便 UI 直接展示。
export function status() {
  const out = {
    available: false, callable: false, apiVersion: 0, pluginVersion: '', capabilities: null,
    backend: '', model: '', configured: false, supportsCharacters: false, reason: '', text: ERROR_TEXT.missing,
  };
  const a = api();
  if (!a) return out;
  out.available = true;
  try { out.apiVersion = a.apiVersion | 0; } catch (e) { /* 读不到就当 0 */ }
  try { out.pluginVersion = String(a.pluginVersion || ''); } catch (e) { }
  try { out.capabilities = a.capabilities ? { ...a.capabilities } : null; } catch (e) { out.capabilities = null; }
  if (out.apiVersion !== API_VERSION) { out.reason = 'version'; out.text = ERROR_TEXT.version; return out; }
  try {
    const st = typeof a.getBackendStatus === 'function' ? a.getBackendStatus() : null;
    if (st) {
      out.backend = String(st.backend || '');
      out.model = String(st.model || '');
      out.configured = !!st.configured;
      out.supportsCharacters = !!st.supportsCharacters;
      out.reason = out.configured ? '' : String(st.reason || 'not_configured');
    }
  } catch (e) { out.reason = 'backend_error'; }
  out.callable = out.configured;
  // 没配好时优先把柏宝绘自己那句人话原样透出去（它本来就是给用户看的），识别不出来才用我们的话兜底
  if (!out.configured) out.text = ERROR_TEXT[out.reason] || { zh: out.reason || ERROR_TEXT.not_configured.zh, en: out.reason || ERROR_TEXT.not_configured.en };
  return out;
}

export function callable() { return status().callable === true; }

// 等它在当前页面加载出来（别的扩展可能比我们晚挂上）。超时就返 null，绝不挂住调用方。
// 事件也是往上看一层：它在酒馆页面上派发（同源可听，跨域时抛错忽略）。
export function waitFor(timeoutMs = 4000) {
  if (callable()) return Promise.resolve(api());
  if (typeof window === 'undefined' || !window.addEventListener) return Promise.resolve(api());
  return new Promise((resolve) => {
    const targets = [window];
    try { if (window.parent && window.parent !== window) targets.push(window.parent); } catch (e) { }
    try { if (window.top && window.top !== window) targets.push(window.top); } catch (e) { }
    let settled = false;
    const finish = (v) => {
      if (settled) return; settled = true;
      for (const t of targets) { try { t.removeEventListener(READY_EVT, onReady); } catch (e) { } }
      clearTimeout(timer); resolve(v);
    };
    const onReady = () => finish(api());
    for (const t of targets) { try { t.addEventListener(READY_EVT, onReady, { once: true }); } catch (e) { } }
    const timer = setTimeout(() => finish(api()), Math.max(0, timeoutMs | 0));
  });
}

// 读角色外貌库。floor 传楼层号会拿到「那一楼**之前**」的快照（它按 mesid 零基、不含该楼），
// 用来做「那一刻她长什么样」——这是我们能白白捡到的读取加强：时间线不用自己维护。
export function characters(floor) {
  const empty = { revision: 0, floor: (floor ?? null), pluginVersion: '', list: [] };
  const a = api();
  if (!a || typeof a.getCharacters !== 'function' || (a.apiVersion | 0) !== API_VERSION) return empty;
  try {
    const raw = (floor === undefined || floor === null) ? a.getCharacters() : a.getCharacters({ floor: floor | 0 });
    if (!raw) return empty;
    const list = (Array.isArray(raw.characters) ? raw.characters : []).map((c) => ({
      name: String((c && c.name) || '').trim(),
      tag: String((c && c.tag) || '').trim(),
      nl: String((c && c.nl) || '').trim(),
      source: String((c && c.source) || ''),
      scope: String((c && c.scope) || ''),
      fields: (c && c.fields && typeof c.fields === 'object') ? { ...c.fields } : null,
    })).filter((c) => c.name || c.tag);
    return { revision: raw.revision | 0, floor: (raw.floor ?? null), pluginVersion: String(raw.pluginVersion || ''), list };
  } catch (e) { console.warn('[baibai] 读角色库失败', e); return empty; }
}

// 订阅角色库变更（切聊天 / 建档 / 改档都会来）。优先用它自己的 subscribe，退回 DOM 事件。
// 返回退订函数，永远可安全调用。
export function onChange(cb) {
  if (typeof cb !== 'function') return () => { };
  const a = api();
  if (a && typeof a.subscribe === 'function') {
    try { const off = a.subscribe(cb); return () => { try { off && off(); } catch (e) { } }; } catch (e) { /* 退回 DOM 事件 */ }
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    const h = (e) => { try { cb((e && e.detail) || {}); } catch (err) { console.warn('[baibai] onChange 回调抛错', err); } };
    window.addEventListener(CHANGED_EVT, h);
    return () => { try { window.removeEventListener(CHANGED_EVT, h); } catch (e) { } };
  }
  return () => { };
}

// 拼提示词：画师串放最前（它文档里就是这么建议的——一次定好整幅画的画风基调），
// 然后场景，再角色 tag。逐段按逗号拆开、去重（大小写不敏感）、清空段，避免重复 tag 叠权重。
export function composePrompt({ style = '', scene = '', characterTags = [], extra = '' } = {}) {
  const parts = [style, scene, ...(Array.isArray(characterTags) ? characterTags : [characterTags]), extra];
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    for (const raw of String(part == null ? '' : part).split(',')) {
      const tag = raw.trim().replace(/\s+/g, ' ');
      if (!tag) continue;
      const k = tag.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(tag);
    }
  }
  return out.join(', ');
}

// 多角色：只在后端支持时走它的 characters 字段。它在文档里明说**刻意不降级**把角色拼进 prompt
// （那样会画出多份躯干重叠的图），所以不支持多角色时我们退回单角色：只拼第一个人的 tag。
export function splitCharacters(list, names, supports) {
  const want = Array.isArray(names) ? names : [];
  const picked = (Array.isArray(list) ? list : []).filter((c) => want.includes(c && c.name) && c.tag);
  if (!picked.length) return { promptTags: [], characters: [], picked: [] };
  if (supports) return { promptTags: [], characters: picked.map((c) => ({ name: c.name, tag: c.tag, ...(c.nl ? { nl: c.nl } : {}) })), picked };
  return { promptTags: [picked[0].tag], characters: [], picked: [picked[0]] };
}

// 出图。永远不抛：返回 { ok:true, ... } 或 { ok:false, code, text, message }。
// 进度回调原样转给它（phase: queued / generating / queued-remote / retrying / saving）。
export async function generate(req = {}, opts = {}) {
  const a = api();
  if (!a || typeof a.generate !== 'function') return { ok: false, code: 'missing', text: ERROR_TEXT.missing, message: '' };
  if ((a.apiVersion | 0) !== API_VERSION) return { ok: false, code: 'version', text: ERROR_TEXT.version, message: '' };
  const prompt = String(req.prompt || '').trim();
  if (!prompt) return { ok: false, code: 'invalid_args', text: ERROR_TEXT.invalid_args, message: 'empty prompt' };

  const payload = { prompt };
  if (req.nl) payload.nl = String(req.nl);
  if (Array.isArray(req.characters) && req.characters.length) payload.characters = req.characters;
  if (req.size === 'portrait' || req.size === 'landscape') payload.size = req.size;
  if (Number.isFinite(req.seed)) payload.seed = Math.max(1, Math.floor(req.seed));
  payload.save = req.save !== false;               // 默认让它落一份进柏宝绘图库（用户自己能在那边翻到）
  if (req.character) payload.character = String(req.character);

  const opt = {};
  if (opts.signal) opt.signal = opts.signal;
  if (typeof opts.onProgress === 'function') opt.onProgress = (p) => { try { opts.onProgress(p); } catch (e) { console.warn('[baibai] onProgress 抛错', e); } };

  try {
    const r = await a.generate(payload, opt);
    return {
      ok: true,
      dataUrl: String((r && r.dataUrl) || ''),
      format: String((r && r.format) || ''),
      path: (r && r.path) != null ? r.path : null,          // 落盘失败是 null，不算错
      seed: (r && r.seed) != null ? r.seed : null,          // 记下来才能复现
      backend: String((r && r.backend) || ''),
      charactersApplied: !!(r && r.charactersApplied),
    };
  } catch (err) {
    const e = normalizeError(err);
    return { ok: false, code: e.code, text: e.text, message: e.message };
  }
}

// data URL → Blob。它明确是 data URL（不是 blob URL，不用配对 revokeObjectURL），
// 我们在「决定把图收进本机图集」时转一次，转完就把 dataUrl 丢掉——它文档提醒过别长期留内存。
export function dataUrlToBlob(dataUrl) {
  const s = String(dataUrl || '');
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(s);
  if (!m) return null;
  const mime = m[1] || 'image/png';
  const body = m[3];
  let bytes;
  if (m[2]) {
    let bin;
    if (typeof atob === 'function') bin = atob(body);
    else if (typeof Buffer !== 'undefined') bin = Buffer.from(body, 'base64').toString('binary');
    else return null;
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    try { bytes = new TextEncoder().encode(decodeURIComponent(body)); } catch (e) { return null; }
  }
  return new Blob([bytes], { type: mime });
}

// 生成结果的记账串（写进我们图集记录的 note 字段）。seed 留在里面，下次想复现直接抄回去。
export function resultNote(result, prompt, { lang = 'zh' } = {}) {
  if (!result || !result.ok) return '';
  const zh = lang !== 'en';
  const head = zh ? '柏宝绘' : 'BaiBai';
  const seedTxt = result.seed == null ? (zh ? '种子未知' : 'seed unknown') : `seed ${result.seed}`;
  const model = result.backend ? `${result.backend}` : '';
  return [head, model, seedTxt, String(prompt || '').trim()].filter(Boolean).join(' · ');
}
