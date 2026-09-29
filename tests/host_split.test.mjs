// C2 第 4 步：宿主脚本拆分（eden-map.js 入口 + host-th / host-routes / host-lifecycle）。
// 拆出的模块在 node 里直接跑一遍：搬家时漏传的自由变量会在这里抛 ReferenceError；入口只从这几个模块取、不再自带副本。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoutes } from '../map/tavern/host-routes.mjs';
import { createLife } from '../map/tavern/host-lifecycle.mjs';
import { createWbAuto, createPrefs, fnOk, thFn } from '../map/tavern/host-th.mjs';

const rd = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('host-routes：版本推断、换线路地址（与拆分前同一规则）', () => {
  const R = createRoutes({ SELF: 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@map-v0.9.5/map/', PACK_IN: null });
  assert.equal(R.VER, '0.9.5'); assert.ok(R.swappable); assert.deepEqual(R.LINES.map(l => l.key), ['vpn', 'cn']);
  assert.equal(R.baseFor('cn'), 'https://cdn.jsdmirror.com/gh/kcgoofee-jpg/my-tavern-experiments@map-v0.9.5/map/');
  assert.equal(R.tagOf('S2:0.1.0'), 'map-s2-v0.1.0'); assert.equal(R.plainVer('S2:0.1.0'), '0.1.0');
  const B = createRoutes({ SELF: 'https://cdn.jsdelivr.net/gh/o/r@preview/map/', PACK_IN: { manifest: { cdn: { repo: 'x/y' } } } });
  assert.equal(B.VER, null); assert.equal(B.REPO, 'x/y'); assert.equal(B.baseFor('cn'), 'https://cdn.jsdmirror.com/gh/o/r@preview/map/');
  const L = createRoutes({ SELF: 'http://localhost:8080/map/', PACK_IN: null }); assert.ok(!L.swappable); assert.equal(L.baseFor('cn'), 'http://localhost:8080/map/');
});

test('host-lifecycle：listen 登记、kill 之后不再登记、unlisten 全部撤掉', () => {
  const on = [], off = []; globalThis.eventOn = (ev, fn) => { on.push(ev); return ev + '#h'; }; globalThis.eventRemoveListener = (ev, fn, h) => off.push(h);
  const hadWin = 'window' in globalThis; if (!hadWin) globalThis.window = globalThis;   // fnOk 读 window[n]（浏览器里 window === globalThis）
  try {
    const life = createLife(); let extra = 0;
    life.listen('A', () => {}); life.add(() => extra++); assert.equal(life.dead, false);
    life.kill(); life.listen('B', () => {}); assert.equal(life.dead, true); assert.deepEqual(on, ['A']);
    life.unlisten(); assert.deepEqual(off, ['A#h']); assert.equal(extra, 1);
  } finally { delete globalThis.eventOn; delete globalThis.eventRemoveListener; if (!hadWin) delete globalThis.window; }
});

test('host-th createWbAuto：设置消息与总开关（搬家后自由变量都由 deps 提供）', async () => {
  const ls = new Map(), LS = { getItem: k => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
  const lsGet = k => LS.getItem(k), lsSet = (k, v) => LS.setItem(k, v);
  const posts = [], life = createLife(); let injected = 0, macros = null, synced = 0;
  const W = createWbAuto({ SELF: new URL('../map/', import.meta.url).href, LS, lsGet, lsSet, life, base: () => 'http://127.0.0.1:9/map/', alive: () => true, UL: () => 'zh', thBtns: () => null,
    chatId: () => 'c1', cardKey: () => 'card', post: m => posts.push(m), hostToast: () => null, stateInject: () => injected++, macroSet: on => { macros = on; }, prefSync: () => synced++ });
  await W.onTh({ op: 'state' });
  assert.equal(posts.at(-1).type, 'eden-map:th-state'); assert.deepEqual(posts.at(-1).prefs, { inj: true, depth: 2, budget: 150, macros: false, wbOn: true, wbTomb: false, wbWhere: null });
  await W.onTh({ op: 'prefs', prefs: { inj: false, depth: 99, budget: 5, macros: true, wbOn: false } });
  assert.equal(ls.get('edenMapStateInj'), '0'); assert.equal(ls.get('edenMapStateDepth'), '20'); assert.equal(ls.get('edenMapStateBudget'), '40');
  assert.equal(macros, true); assert.equal(injected, 1); assert.equal(synced, 1); assert.equal(ls.get('edenMapWbOn'), '0');
  assert.equal(await W.wbAuto(), null, '总开关关着：不自动建');
  const n = posts.length; const dead = createLife(); dead.kill();
  const W2 = createWbAuto({ SELF: '', LS, lsGet, lsSet, life: dead, base: () => '', alive: () => false, UL: () => 'en', thBtns: () => null, chatId: () => '', cardKey: () => '', post: m => posts.push(m), hostToast: () => null, stateInject() {}, macroSet() {}, prefSync() {} });
  await W2.sendTh(); assert.equal(posts.length, n, '面板没开不发');
});

test('host-th：偏好与接口探测在 node 里可构造（没有酒馆助手时静默）', () => {
  const P = createPrefs(null); assert.equal(P.obj(), null); P.sync(); P.stop();
  assert.equal(fnOk('definitelyNotAFunction'), false); assert.equal(thFn('getVariables'), null);
});

test('入口只从 host-*.mjs 取，不再自带副本；worldbook 自动化的调用点不变', () => {
  const E = rd('map/tavern/eden-map.js');
  assert.match(E, /^import \{ cdnFetch, thFn, fnOk, hostFn, packNs, createPrefs, createWbAuto \} from '\.\/host-th\.mjs';$/m);
  for (const s of ['const cdnFetch =', 'const thFn =', 'const fnOk =', 'const hostFn =', 'const PREF_KEYS', 'const LINES =', 'async function wbAutoRun', 'let dead']) assert.ok(!E.includes(s), s);
  assert.ok(!/\bcreateWorldbook\b/.test(rd('map/tavern/host-th.mjs')), '工厂名不能遮住酒馆助手的全局 createWorldbook');
  assert.match(E, /await createWorldbook\(WBN, \[entry\]\)/);   // 自定义世界书仍调酒馆助手的全局函数
  assert.match(E, /listen\(tavern_events\.CHAT_CHANGED, \(\) => \{ clearTimeout\(wbChatT\); wbChatT = setTimeout\(\(\) => \{ if \(!life\.dead\) afterGen\(\(\) => wbAuto\(\)/);
  assert.match(E, /setTimeout\(\(\) => \{ if \(!life\.dead\) afterGen\(\(\) => wbAuto\(\)\.catch/);
});
