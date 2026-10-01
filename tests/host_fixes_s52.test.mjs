// S5-2 T0：S5-1 原样搬出时带过来的两个潜伏 ReferenceError（I-10 领航员一轮、I-11 开场卡无分支 ref）。
// 两个都在 node 里用桩依赖直接跑：搬家时漏传的自由变量会在这里抛。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmFlow, DEPS as LLM_DEPS } from '../map/tavern/llm-flow.mjs';
import { createHostChecks, DEPS as CHECK_DEPS } from '../map/tavern/host-checks.mjs';

const SELF = new URL('../map/', import.meta.url).href;
const later = () => new Promise(r => setImmediate(r));
const anyStub = (() => { const f = function () {}; const p = new Proxy(f, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : p), apply: () => p, construct: () => p, set: () => true, has: () => true }); return p; })();

/** 最小的假 DOM：每个节点记下写入的属性；querySelector 按选择器记忆，所以能读回页脚文字。 */
function fakeNode() {
  const store = {}, kids = {};
  const p = new Proxy(function () {}, {
    get: (t, k) => {
      if (k === 'then') return undefined;
      if (k === 'querySelector') return s => (kids[s] ??= fakeNode());
      if (k === '_store') return store;
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      return k in store ? store[k] : p;
    },
    set: (t, k, v) => { store[k] = v; return true; }, apply: () => p, construct: () => p,
  });
  return p;
}

test('I-10：领航员一轮在桩依赖下不抛，请求形状是预期的（事态摘要经依赖袋的 eventsSummary 进来）', async () => {
  const sent = [], timers = [], saved = { window: globalThis.window, fetch: globalThis.fetch, setTimeout: globalThis.setTimeout };
  const ls = new Map([['edenMapNav', '1'], ['edenMapNavCfg', JSON.stringify({ provider: 'custom', key: 'k-test', base: 'http://127.0.0.1:9/v1', model: 'm-test' })], ['edenMapNavConsent', '1']]);
  globalThis.window = { confirm: () => true };
  globalThis.fetch = async (url, o) => { sent.push({ url, body: JSON.parse(o.body), headers: o.headers }); return { ok: true, json: async () => ({ choices: [{ message: { content: '<eden-ops></eden-ops>' } }] }) }; };
  globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  try {
    const calls = { summary: 0 };
    const host = Object.fromEntries(LLM_DEPS.map(k => [k, anyStub]));
    Object.assign(host, { SELF, life: { dead: false }, panel: { hidden: true }, GEN: { generating: false }, UL: 'zh', lsGet: k => ls.get(k) ?? null, lsSet: (k, v) => ls.set(k, String(v)),
      here: '某地·某屋', floorNow: 7, spatialNow: '', FRm: null, hostToast: () => {}, sendEvents: () => {}, eventsSummary: () => { calls.summary++; return '事态摘要 X'; } });
    createLlmFlow(host);
    for (let i = 0; i < 20 && !timers.length; i++) await later();   // 模块动态 import 完成后 navSchedule 才排上计时器
    const t = timers.find(x => x.ms >= 60000);
    assert.ok(t, '领航员开着：排了一次后台计时');
    await t.fn();   // navSchedule 的回调把 navRun 的异常吞掉——所以这里看「请求有没有发出」
    assert.equal(calls.summary, 1, '事态摘要由依赖袋给');
    assert.equal(sent.length, 1, '一轮发了一次请求');
    const r = sent[0];
    assert.equal(r.url, 'http://127.0.0.1:9/v1/chat/completions');
    assert.equal(r.headers.authorization, 'Bearer k-test');
    assert.equal(r.body.model, 'm-test'); assert.equal(r.body.max_tokens, 512); assert.equal(r.body.stream, false);
    assert.deepEqual(r.body.messages.map(m => m.role), ['system', 'user']);
    const user = r.body.messages[1].content;
    assert.ok(user.includes('【当前】某地·某屋（第 7 楼）'), user);
    assert.ok(user.includes('[事态]\n事态摘要 X'), user);
  } finally { for (const [k, v] of Object.entries(saved)) v === undefined ? delete globalThis[k] : (globalThis[k] = v); }
});

test('I-11：开场卡在没有分支 ref（正式版 / 本地构建）时能打开，页脚的 ref 用 refOf() 兜底', async () => {
  const saved = { window: globalThis.window, localStorage: globalThis.localStorage, requestAnimationFrame: globalThis.requestAnimationFrame };
  globalThis.window = { parent: {} }; globalThis.localStorage = { getItem: () => null, setItem: () => {} }; globalThis.requestAnimationFrame = f => f();
  try {
    const root = fakeNode(), pdoc = fakeNode(); let refCalls = 0;
    const host = Object.fromEntries(CHECK_DEPS.map(k => [k, anyStub]));
    Object.assign(host, { SELF, SCRIPT: {}, VER: null, UL: 'zh', ID: 'eden-map-root', root, pdoc, panel: { hidden: true }, ghost: false, alive: false, MAN: Promise.resolve(null), BASE: 'http://127.0.0.1:9/map/',
      lean: () => false, lineP: null, html: null, swappable: false, channel: () => 'ref', buildNow: async () => null, HS: () => '空间地图', runCheck: async () => {}, preload: async () => {}, refOf: () => { refCalls++; return ''; } });
    const C = createHostChecks(host);
    assert.equal(await C.showSplash(), true, 'showSplash 没抛、打开了卡');
    assert.equal(refCalls, 1, '没有 SCRIPT.ref：向 refOf 要（它从脚本地址里认，认不出就是空串）');
    for (let i = 0; i < 20; i++) await later();   // 开场卡后面的自检链在这里跑完，再还原全局
  } finally { for (const [k, v] of Object.entries(saved)) v === undefined ? delete globalThis[k] : (globalThis[k] = v); }
});
