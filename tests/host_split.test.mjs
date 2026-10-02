// C2 第 4 步：宿主脚本拆分（eden-map.js 入口 + host-th / host-routes / host-lifecycle）。
// 拆出的模块在 node 里直接跑一遍：搬家时漏传的自由变量会在这里抛 ReferenceError；入口只从这几个模块取、不再自带副本。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoutes, lineScore, scoreText, probeVerdict, PROBE_MIN_BYTES } from '../map/tavern/host-routes.mjs';
import { createLife } from '../map/tavern/host-lifecycle.mjs';
import { createWbAuto, createPrefs, fnOk, thFn } from '../map/tavern/host-tavernhelper.mjs';
import { createFacts } from '../map/tavern/feature-health.mjs';

const rd = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('host-routes：版本推断、换线路地址（与拆分前同一规则）', () => {
  const R = createRoutes({ scriptBase: 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@map-v0.9.5/map/', PACK_IN: null });
  assert.equal(R.VER, '0.9.5'); assert.ok(R.swappable); assert.deepEqual(R.LINES.map(l => l.key), ['vpn', 'cn']);
  assert.equal(R.baseFor('cn'), 'https://cdn.jsdmirror.com/gh/kcgoofee-jpg/my-tavern-experiments@map-v0.9.5/map/');
  assert.equal(R.tagOf('S2:0.1.0'), 'map-s2-v0.1.0'); assert.equal(R.plainVer('S2:0.1.0'), '0.1.0');
  const B = createRoutes({ scriptBase: 'https://cdn.jsdelivr.net/gh/o/r@preview/map/', PACK_IN: { manifest: { cdn: { repo: 'x/y' } } } });
  assert.equal(B.VER, null); assert.equal(B.REPO, 'x/y'); assert.equal(B.baseFor('cn'), 'https://cdn.jsdmirror.com/gh/o/r@preview/map/');
  const L = createRoutes({ scriptBase: 'http://localhost:8080/map/', PACK_IN: null }); assert.ok(!L.swappable); assert.equal(L.baseFor('cn'), 'http://localhost:8080/map/');
});

test('线路测速：按「字节 / 毫秒」算分，小响应不算有效测量（2026-09-29 重做）', () => {
  assert.equal(lineScore(105 * 1024, 100), 1075.2);          // 105 KB / 100 ms ≈ 1.05 MB/s
  assert.equal(lineScore(0, 100), 0);                        // 没有字节：0 分
  assert.equal(lineScore(100, 0), 0);                        // 没有耗时：0 分
  assert.equal(scoreText(1048576 / 1000), '1.00 MB/s');

  // 老实现是「谁先答完谁赢」：400 B 的小响应 5 ms 就能赢——那是缓存命中的 build.json，不是带宽。
  const small = probeVerdict(400, 5);
  const big = probeVerdict(PROBE_MIN_BYTES + 1, 120);
  assert.equal(small.ok, false); assert.equal(small.reason, 'small'); assert.equal(small.score, 0);
  assert.equal(big.ok, true);
  const winner = [small, big].filter(r => r.ok).sort((a, b) => b.score - a.score)[0];
  assert.equal(winner, big, '小响应不能因为快就胜出');
  // 边界：正好等于下限定为有效，少 1 字节无效
  assert.equal(probeVerdict(PROBE_MIN_BYTES, 100).ok, true);
  assert.equal(probeVerdict(PROBE_MIN_BYTES - 1, 100).ok, false);
});

test('线路清单与换线门槛：npm 线路仍禁用；测的是清单 data.maps（105 KB 级）而不是小文件', async () => {
  const man = JSON.parse(readFileSync(new URL('../map/packs/eden/manifest.json', import.meta.url), 'utf8'));
  const R = createRoutes({ scriptBase: 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@map-v0.9.6/map/', PACK_IN: null, manifest: Promise.resolve(man) });
  assert.deepEqual(R.LINES.map(l => l.key), ['vpn', 'cn']);   // npm（enabled:false）仍在禁用状态
  assert.equal(await R.probePath(), 'data/maps.json');         // 第一个包的路径读自它的清单
  assert.equal(await createRoutes({ scriptBase: 'http://x/map/', PACK_IN: { id: 'p', manifest: { data: { maps: 'maps.json' } } } }).probePath(), 'packs/p/maps.json');
  assert.equal(await createRoutes({ scriptBase: 'http://x/map/', PACK_IN: null }).probePath(), 'i18n/en.json');   // 没有清单：引擎自己的词典（够大）
  assert.equal(createRoutes({ scriptBase: 'https://cdn.jsdelivr.net/gh/o/r@map-v1.0.0/map/', PACK_IN: null, manifest: man }).PKG, man.cdn.npm); assert.equal(createRoutes({ scriptBase: 'https://cdn.jsdelivr.net/gh/o/r@map-v1.0.0/map/', PACK_IN: null, manifest: { cdn: { repo: 'x/y' } } }).PKG, '');   // 清单不写 npm = 没有 npm 线路，也不从 npm 路径认版本
  assert.equal(R.PROBE_MARGIN, 1.3);                          // 没快 30% 以上不换线
  assert.equal(typeof R.measure, 'function');
  assert.equal(typeof R.race, 'function');
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
  const W = createWbAuto({ scriptBase: new URL('../map/', import.meta.url).href, LS, lsGet, lsSet, life, base: () => 'http://127.0.0.1:9/map/', alive: () => true, uiLang: () => 'zh', thBtns: () => null,
    chatId: () => 'c1', cardKey: () => 'card', post: m => posts.push(m), hostToast: () => null, stateInject: () => injected++, macroSet: on => { macros = on; }, prefSync: () => synced++, facts: createFacts(), navFacts: () => ({}), macroVal: () => '', navSchedule() {} });
  await W.onTh({ op: 'state' });
  assert.equal(posts.at(-1).type, 'eden-map:th-state'); assert.deepEqual(posts.at(-1).prefs, { inj: true, depth: 2, budget: 150, macros: false, wbOn: true, wbTomb: false, wbWhere: null, dice: false, ledgerWrite: false, spatial: false, wbJit: false, wbXtal: false, invInj: true, nav: false, navCfg: { provider: '', base: '', model: '', hasKey: false }, stateOmit: [], spatialDepth: 2, spatialBudget: 120, navConsent: false, navCadence: 120000 });
  await W.onTh({ op: 'prefs', prefs: { inj: false, depth: 99, budget: 5, macros: true, wbOn: false } });
  assert.equal(ls.get('edenMapStateInj'), '0'); assert.equal(ls.get('edenMapStateDepth'), '20'); assert.equal(ls.get('edenMapStateBudget'), '40');
  assert.equal(macros, true); assert.equal(injected, 1); assert.equal(synced, 1); assert.equal(ls.get('edenMapWbOn'), '0');
  assert.equal(await W.wbAuto(), null, '总开关关着：不自动建');
  const n = posts.length; const dead = createLife(); dead.kill();
  const W2 = createWbAuto({ scriptBase: '', LS, lsGet, lsSet, life: dead, base: () => '', alive: () => false, uiLang: () => 'en', thBtns: () => null, chatId: () => '', cardKey: () => '', post: m => posts.push(m), hostToast: () => null, stateInject() {}, macroSet() {}, prefSync() {}, facts: createFacts(), navFacts: () => ({}), macroVal: () => '', navSchedule() {} });
  await W2.sendTh(); assert.equal(posts.length, n, '面板没开不发');
});

test('host-th：偏好与接口探测在 node 里可构造（没有酒馆助手时静默）', () => {
  const P = createPrefs(null); assert.equal(P.obj(), null); P.sync(); P.stop();
  assert.equal(fnOk('definitelyNotAFunction'), false); assert.equal(thFn('getVariables'), null);
});

test('入口只从 host-*.mjs 取，不再自带副本；worldbook 自动化的调用点不变', () => {
  const E = rd('map/tavern/eden-map.js');
  assert.match(E, /^import \{ cdnFetch, thFn, packNs, createPrefs \} from '\.\/host-tavernhelper\.mjs';$/m);   // S5-1：fnOk / hostFn / createWbAuto / fnGuard 随各自的代码搬进了 flow 模块，入口只留自己还用的
  for (const s of ['const cdnFetch =', 'const thFn =', 'const fnOk =', 'const hostFn =', 'const PREF_KEYS', 'const LINES =', 'async function wbAutoRun', 'let dead']) assert.ok(!E.includes(s), s);
  assert.ok(!/\bcreateWorldbook\b/.test(rd('map/tavern/host-tavernhelper.mjs')), '工厂名不能遮住酒馆助手的全局 createWorldbook');
  assert.match(rd('map/tavern/root-store.mjs'), /await createWorldbook\(WBN, \[entry\]\)/);   // 自定义世界书仍调酒馆助手的全局函数（S5-1：随 syncWb 搬进了 root-store.mjs）
  assert.match(E, /listen\(tavern_events\.CHAT_CHANGED, \(\) => \{ clearTimeout\(wbChatT\); wbChatT = setTimeout\(\(\) => \{ if \(!life\.dead\) afterGen\(\(\) => wbAuto\(\)/);
  assert.match(E, /setTimeout\(\(\) => \{ if \(!life\.dead\) afterGen\(\(\) => wbAuto\(\)\.catch/);
});

// ---------------------------------------------------------------------------------------------------------------------
// S5-1：eden-map.js 拆成入口 + 八个 flow 模块；custom-names-view.mjs / events.mjs 各自拆出几个小模块。行为不变，所以这里只钉「接口形状」：
// 行数上限、每个 flow 模块导出 DEPS + 工厂、入口的依赖袋提供每一个 DEPS 键、模块里用到的每个 host.X 都登记在 DEPS、缺键就抛、
// 在桩依赖下能创建并返回约定的接口。
// ---------------------------------------------------------------------------------------------------------------------
const lines = f => rd(f).split('\n').length - (rd(f).endsWith('\n') ? 1 : 0);
const FLOWS = {   // 文件 → [工厂名, 返回的接口]
  'llm-flow': ['createLlmFlow', 'addRoutes jitRound navFacts navSchedule opEvents planRoutes resetOps sendOps worldbookJitModule WBSm xtalClear xtalRound'],
  'route-flow': ['createRouteFlow', 'addSuggestions held macroSet macroValue onChat onHere onPlan onReady onRound'],   // S8-4b K-R111: the planned route and the class macros
  'stash-flow': ['createStashFlow', 'changedInv FRm frState gate gateFlush injectAction stash stashStoreModule stashRecomputeModule ledgerSync ledgerModule ledgerRecord lootFacts resetChat scanPickups sendInv settleCarry stealthCheck takeLoot'],
  'chars-flow': ['createCharsFlow', 'mvuBridge gallery placeText cardKey chatId clock computeTrips contextPipeline getHere mvuReaders mvuStat outfitNow pushMvu readVars refreshVarMap resetLayerSent routineModule rtSched sendChars sendRoutine sendTrips sentClock sentOutfit setVarUser tripsParseModule userName'],
  'timeline-flow': ['createTimelineFlow', 'keyframesModule kfReset kfView tlBtn tlCache tlEl tlExit timelineModule tlOn tlWalk'],
  'host-api': ['createHostApi', 'api cardId emit emitMoved exposed facts inner knowRooms onTh replayLayers scriptInfo sendTh subs tavernhelperApiModule transitMod wbAuto'],
  'root-store': ['createRootStore', 'storageBudget budgetSweep custom customChanged customChat customTags kindOf loadCustom reg regNow saveRoot sendCustom store storeWarn varsOk wbState'],
  'host-checks': ['createHostChecks', 'autoCheck checkAt checkFacts checkItems checkP finishCheck followCheck followHead followNewer hostToast openSettings runCheck SC sendCheck setQ showSplash showUpdPrompt splash splashDue switchBranch switchVersion toastEl toastOnce toastWait updEl updPrompt updWait viewerVer'],
  'modes-flow': ['createModesFlow', 'cardSkip checkpointResume checkpointStep conflictsNow cp cpResume injectPreview MDm pointsFor spatialInject SpatialM spatialNow stateInject stateNow'],
};
const mod = f => import('../map/tavern/' + f + '.mjs');
// 什么都接得住的桩：函数、对象、promise 之外的依赖都用它（创建期只会被存起来或在回调里用）
const anyStub = (() => { const f = function () {}; const p = new Proxy(f, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : p), apply: () => p, construct: () => p, set: () => true, has: () => true }); return p; })();

test('S5-1 行数：入口 ≤ 800、custom-names-view.mjs ≤ 400、events.mjs ≤ 400，新模块各 ≤ 400', () => {
  assert.ok(lines('map/tavern/eden-map.js') <= 800, 'eden-map.js ' + lines('map/tavern/eden-map.js'));
  assert.ok(lines('map/custom-names-view.mjs') <= 400, 'custom-names-view.mjs ' + lines('map/custom-names-view.mjs'));
  assert.ok(lines('map/events-view.mjs') <= 400, 'events.mjs ' + lines('map/events-view.mjs'));
  for (const f of Object.keys(FLOWS)) assert.ok(lines('map/tavern/' + f + '.mjs') <= 400, f);
  for (const f of ['custom-tint', 'custom-outfit', 'custom-hints', 'custom-dialog-view', 'events-fx']) assert.ok(lines('map/' + f + '.mjs') <= 400, f);
});

test('S5-1 flow 模块契约：导出 DEPS + 工厂；入口的依赖袋给齐每个 DEPS 键；模块里的每个 host.X 都登记在 DEPS', async () => {
  const E = rd('map/tavern/eden-map.js');
  const bag = E.slice(E.indexOf('const host = {'), E.indexOf('\n  };', E.indexOf('const host = {')));
  const provided = new Set([...bag.matchAll(/(?:^|[\s,{])(?:get |set )?([A-Za-z_]\w*)(?:\s*\(|:)/gm)].map(m => m[1]));
  for (const [f, [factory]] of Object.entries(FLOWS)) {
    const M = await mod(f), src = rd('map/tavern/' + f + '.mjs');
    assert.equal(typeof M[factory], 'function', f + ' 导出 ' + factory);
    assert.ok(Array.isArray(M.DEPS) && M.DEPS.length && M.DEPS.every(k => typeof k === 'string'), f + ' DEPS');
    assert.equal(new Set(M.DEPS).size, M.DEPS.length, f + ' DEPS 无重复');
    for (const k of M.DEPS) assert.ok(provided.has(k), `${f} 要 ${k}，入口依赖袋没给`);
    const used = new Set([...src.matchAll(/\bhost\.([A-Za-z_]\w*)/g)].map(m => m[1])); used.delete('entryUrl');
    for (const k of used) assert.ok(M.DEPS.includes(k), `${f} 用了 host.${k} 却没登记在 DEPS`);
    assert.match(E, new RegExp(`import \\{ ${factory} \\} from '\\./${f}\\.mjs';`), '入口 import ' + f);
    assert.match(E, new RegExp(`= ${factory}\\(host\\)`), '入口只调一次 ' + factory);
  }
  assert.ok(provided.has('entryUrl') && /entryUrl: import\.meta\.url/.test(bag), 'swapVer / branchUrl 要的是入口脚本地址，不是模块自己的');
});

test('S5-1 flow 模块在桩依赖下能创建、返回约定接口；缺键就抛（带模块名）', async () => {
  const hadWin = Object.getOwnPropertyDescriptor(globalThis, 'window'), hadDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.window = anyStub; globalThis.document = anyStub;
  try {
    for (const [f, [factory, api]] of Object.entries(FLOWS)) {
      const M = await mod(f);
      const host = Object.fromEntries(M.DEPS.map(k => [k, anyStub])); host.MAN = Promise.resolve(null); host.scriptBase = 'file:///nonexistent/map/'; host.entryUrl = 'file:///nonexistent/map/tavern/eden-map.js';
      const r = M[factory](host);
      assert.deepEqual(Object.keys(r).sort(), api.split(' ').sort(), f + ' 接口');
      assert.throws(() => M[factory]({}), new RegExp(f + ': missing dep'), f + ' 缺键报错');
    }
  } finally { hadWin ? Object.defineProperty(globalThis, 'window', hadWin) : delete globalThis.window; hadDoc ? Object.defineProperty(globalThis, 'document', hadDoc) : delete globalThis.document; }
});

test('S5-1 viewer 拆分：custom / events 拆出的小模块只导出自己的工厂；原文件只 import 它们', () => {
  const want = { 'custom-tint': ['createTint', 'NIGHT_KEY'], 'custom-outfit': ['createOutfit'], 'custom-hints': ['createHints'], 'custom-dialog-view': ['createDialogView'], 'events-fx': ['createEventsFx'] };
  for (const [f, names] of Object.entries(want)) {
    const exported = [...rd('map/' + f + '.mjs').matchAll(/^export (?:function|const) (\w+)/gm)].map(m => m[1]);
    assert.deepEqual(exported.sort(), names.sort(), f);
  }
  const C = rd('map/custom-names-view.mjs'), V = rd('map/events-view.mjs');
  for (const f of ['custom-tint', 'custom-outfit', 'custom-hints', 'custom-dialog-view']) assert.ok(C.includes(`'./${f}.mjs'`), f);
  assert.ok(V.includes("'./events-fx.mjs'"));
  assert.match(C, /^register\('CustomNamesView', CustomNamesView\);$/m); assert.match(V, /^register\('EventsView', EventsView\);$/m);   // 插件名与登记方式不变
  for (const s of ['function night()', 'function toast(', 'const KIND =', 'function listHtml', 'function editHtml', 'function setOutfit']) assert.ok(!C.includes(s), 'custom-names-view.mjs 不再带 ' + s);
  for (const s of ['function applyGlitch', 'function worldBadge']) assert.ok(!V.includes(s), 'events.mjs 不再带 ' + s);
});

test('S9-2：入口第一行 import 门卫；门卫、卡读取、v2 宿主模块不碰 Mvu / SillyTavern 全局（唯一属主是 mvu-bridge）', () => {
  const entry = rd('map/tavern/eden-map.js');
  assert.match(entry.split('\n')[10], /import '\.\/pack-gate\.mjs';/, 'pack-gate 在第 11 行已有的 import 上，入口不新增行');
  for (const f of ['pack-gate', 'card-source', 'pack-runtime-v2']) assert.doesNotMatch(rd('map/tavern/' + f + '.mjs').replace(/\/\/.*$/gm, ''), /\b(Mvu|SillyTavern)\b/, f);
  assert.match(rd('map/tavern/mvu-bridge.mjs'), /export function hostAccess/);
  assert.match(rd('map/tavern/host-tavernhelper.mjs'), /d\.type === 'eden-map:pack-pick'/);
});
