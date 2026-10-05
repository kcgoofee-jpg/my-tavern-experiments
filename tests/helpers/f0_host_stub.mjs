// F0 记录式对拍（tests/f0_call_parity.test.mjs）用的假宿主：把酒馆助手 / 酒馆的全局接口装成可记录的桩，
// 调用按发生顺序记进 model.calls（参数 JSON 化，函数 → <fn>，时间戳 / 日期打码）。
// 名单来自 map/tavern/host-adapter.mjs 的 TH_API（对拍与闸门共用一张表）；拆分前后跑同一批场景，序列必须逐条相同。
import { TH_API } from '../../map/tavern/host-adapter.mjs';

// 事件名表：值取酒馆助手实际用的字符串形态，场景里只当键用（拆分前后同一份，不影响对拍）
export const EVT = Object.freeze({
  CHAT_CHANGED: 'chatChanged', CHAT_LOADING: 'chatLoading', GENERATION_STARTED: 'generationStarted',
  GENERATION_ENDED: 'generationEnded', GENERATION_STOPPED: 'generationStopped', MESSAGE_RECEIVED: 'messageReceived',
  SWIPER_CHANGED: 'swiperChanged', VARIABLE_UPDATE: 'variableUpdate', MESSAGE_CONTEXT: 'messageContext',
  CHARACTER_BOOK_CHANGED: 'characterBookChanged', WORLDBOOK_CHANGED: 'worldbookChanged',
});

const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const num = v => (Number.isFinite(v) ? v : 0);

/** 内容指纹打码（norm 用它，快照文件按同一口径读进来） */
export const fpMask = s => String(s).replace(/"(eden_hash|hash)":"[a-z0-9]{1,16}"/g, '"$1":"<fp>"');

/** 参数快照：函数变成 <fn>，13 位时间戳、ISO 日期与「日期 时:分」打码（世界书说明条目里有「何时写的」）；
 *  eden_hash 是「写入时内容」的指纹，内容里的时间戳变了它就变（同一份代码两次跑必然不同），所以它自己也要打码——
 *  它只是内容的摘要，摘要之后的正文仍在逐字比对里，真变了照样露出来。 */
export function norm(v) {
  let s;
  try { s = JSON.stringify(v, (k, x) => (typeof x === 'function' ? '<fn>' : (typeof x === 'number' && Math.abs(x) > 1e11 ? '<t>' : x))); }
  catch (e) { s = '<unserializable>'; }
  if (s === undefined) s = 'undefined';
  return fpMask(s.replace(/\d{10,}/g, '<t>').replace(/20\d\d-\d\d-\d\d \d{1,2}:\d{2}/g, '<date> <time>').replace(/20\d\d-\d\d-\d\d/g, '<date>'));
}

/** 内存 localStorage（同一实例给 window.parent 和本机，engine 两处都读） */
export function memStore(seed = new Map()) {
  const m = new Map(seed);
  return {
    get length() { return m.size; }, key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); },
    clear: () => m.clear(), map: m,
  };
}

/**
 * 装假宿主。state = {
 *   chat, latest, vars: { chat, script, global }, books: { 名: [条目] }, ls, lastId, charData, regexes, preset,
 *   without: [不装的接口名], fetch: { url: json }（cdnFetch 的假响应，不计入对拍）, bindings: { chat, char, global }
 * } → { model, restore }（model.calls = 记录）
 */
export function installHost(state = {}) {
  const model = {
    calls: [], chat: state.chat || [], latest: state.latest ?? null,
    vars: { chat: {}, script: {}, global: {}, ...(state.vars || {}) },
    books: clone(state.books || {}), bindings: { chat: null, char: [], global: [], ...(state.bindings || {}) },
    listeners: [], injected: {}, macros: [], store: memStore(state.ls),
    lastId: state.lastId ?? Math.max(-1, (state.chat || []).length - 1),
    charData: state.charData ?? null, regexes: state.regexes ?? null, preset: state.preset ?? null,
    scripts: [], display: state.display ?? null,
  };
  const rec = (name, ...args) => model.calls.push([name, norm(args)]);
  const without = new Set(state.without || []);
  const readVars = o => { const t = o?.type || 'chat'; return clone(model.vars[t] || {}); };
  const writeVars = (o, next) => { const t = o?.type || 'chat'; model.vars[t] = next; return clone(next); };

  const impl = {
    // ---- 事件 ----
    eventOn: (ev, fn) => { model.listeners.push([ev, fn, 'on']); return () => {}; },
    eventMakeLast: (ev, fn) => { model.listeners.push([ev, fn, 'last']); return { stop: () => {} }; },
    eventRemoveListener: (ev, fn) => { const i = model.listeners.findIndex(l => l[0] === ev && l[1] === fn); if (i >= 0) model.listeners.splice(i, 1); },
    eventOff: (ev, fn) => { const i = model.listeners.findIndex(l => l[0] === ev && l[1] === fn); if (i >= 0) model.listeners.splice(i, 1); },
    eventEmit: (ev, payload) => { for (const [e, fn] of model.listeners) if (e === ev) { try { fn(payload); } catch (x) {} } },
    // ---- 楼层与变量 ----
    getChatMessages: (range) => { const n = model.chat.length, from = num(range?.first_message), to = range?.last_message === -1 ? n - 1 : num(range?.last_message ?? n - 1);
      return model.chat.slice(Math.max(0, from), Math.min(n, to + 1)).map(c => ({ message: c?.message ?? '', name: c?.name ?? '', is_user: !!c?.is_user, extra: c?.extra || {}, swipe_id: c?.swipe_id ?? 0 })); },
    getLastMessageId: () => model.lastId,
    getVariables: o => readVars(o),
    insertOrAssignVariables: (obj, o) => { const cur = readVars(o); writeVars(o, { ...cur, ...clone(obj) }); },
    replaceVariables: (obj, o) => { writeVars(o, clone(obj)); },
    updateVariablesWith: (mut, o) => { const nx = mut(readVars(o)); writeVars(o, nx); },
    waitGlobalInitialized: () => Promise.resolve(true),
    // ---- 卡与 UI ----
    getCharData: () => clone(model.charData),
    getTavernRegexes: () => clone(model.regexes),
    getPreset: () => clone(model.preset),
    getScriptId: () => 'fake-script-id',
    replaceScriptInfo: info => { model.scripts.push(norm(info)); },
    initializeGlobal: (name, value) => { model.globals ??= {}; model.globals[name] = value; },
    retrieveDisplayedMessage: id => (model.display === null ? undefined : clone(model.display)),
    // ---- 注入 ----
    injectPrompts: list => { for (const p of Array.isArray(list) ? list : []) model.injected[p.id] = norm(p); return list?.length; },
    uninjectPrompts: ids => { for (const id of Array.isArray(ids) ? ids : [ids]) delete model.injected[id]; },
    // ---- 世界书（异步：酒馆助手的读写都返回 Promise）----
    getWorldbook: async n => (n in model.books ? clone(model.books[n]) : null),
    getWorldbookNames: async () => Object.keys(model.books),
    createWorldbook: async (n, entries) => { model.books[n] = clone(entries || []); return true; },
    createOrReplaceWorldbook: async (n, entries) => { model.books[n] = clone(entries || []); return true; },
    updateWorldbookWith: async (n, mut) => { const list = mut(clone(model.books[n] || [])); model.books[n] = clone(list); return list; },
    replaceWorldbook: async (n, entries) => { model.books[n] = clone(entries || []); return true; },
    deleteWorldbook: async n => { delete model.books[n]; return true; },
    getGlobalWorldbookNames: async () => clone(model.bindings.global),
    getCharWorldbookNames: async () => clone(model.bindings.char),
    getChatWorldbookName: async () => model.bindings.chat,
    rebindGlobalWorldbooks: async list => { model.bindings.global = clone(list || []); },
    rebindCharWorldbooks: async (which, list) => { model.bindings.char = clone(list || []); },
    rebindChatWorldbook: async (which, n) => { model.bindings.chat = n; },
    getLorebooks: async () => [], getLorebookEntries: async () => [], getLorebookSettings: async () => ({}), getCharLorebooks: async () => [], getChatLorebook: async () => null,
    // ---- 类宏与按钮 ----
    registerMacroLike: (re, fn) => { model.macros.push([String(re), fn]); return { unregister: () => {} }; },
    unregisterMacroLike: re => { const i = model.macros.findIndex(m => m[0] === String(re)); if (i >= 0) model.macros.splice(i, 1); },
    appendInexistentScriptButtons: list => { model.buttons = clone(list); },
    getButtonEvent: n => 'button:' + n,
  };

  const saved = new Map();
  const put = (k, v) => { saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); globalThis[k] = v; };
  for (const name of TH_API) {
    if (without.has(name)) continue;
    if (name === 'tavern_events') { put('tavern_events', { ...EVT }); continue; }
    if (name === 'Mvu') { put('Mvu', {
      getMvuData: q => { rec('Mvu.getMvuData', q); return q?.message_id === 'latest' ? (model.latest ? { stat_data: clone(model.latest) } : null)
          : (() => { const c = model.chat[q?.message_id]; const v = c?.variables?.[c.swipe_id ?? 0]; return v ? { stat_data: clone(v.stat_data ?? v) } : null; })(); },
      events: { VARIABLE_UPDATE_ENDED: 'variableUpdateEnded', MESSAGE_RECEIVED: 'messageReceived' } }); continue; }
    if (name === 'SillyTavern') { put('SillyTavern', { getContext: () => { rec('SillyTavern.getContext'); return model.ctx ??= { name1: 'Tester', chatId: 'chat-1', characterId: 0, characters: [{ avatar: 'card.png' }], groups: [], getRequestHeaders: null }; }, chat: model.chat }); continue; }
    if (name === 'TavernHelper') { put('TavernHelper', {}); continue; }
    const f = impl[name]; if (!f) continue;
    put(name, (...a) => { rec(name, ...a); return f(...a); });
  }
  // 父窗口（脚本跑在卡的 iframe 里，面板挂在宿主那一层）：store() 与暴露点走 window.parent
  const parent = { localStorage: model.store, document: { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, appendChild() {} }) }, matchMedia: () => ({ matches: false, addEventListener() {} }), __edenMapIds: {}, navigator: {} };
  put('parent', parent);
  put('window', globalThis);
  put('localStorage', model.store);
  if (state.fetch) {
    const table = state.fetch;
    put('fetch', async u => { const key = Object.keys(table).find(k => String(u).includes(k));
      return key ? { ok: true, status: 200, headers: { get: () => null }, json: async () => clone(table[key]), text: async () => JSON.stringify(table[key]) } : { ok: false, status: 404, text: async () => '' }; });
  }
  const restore = () => { for (const [k, d] of saved) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } model.ctx = null; };
  return { model, rec, restore, store: model.store };
}

/** 对拍用序列：[['名字', '参数快照'], …] → '名字 参数' 行 */
export const seqOf = calls => calls.map(([n, a]) => (a === '[]' ? n : `${n} ${a}`));
