// F0-3a：宿主适配层的接口契约（docs/plans/spatial-os.md 阶段 F / docs/extension-study.md §4）。
// 1) 形状：七个能力分组 + 三个底层取法（fn / ok / raw / hfn / top），F1 的原生实现必须给同一个形状；
// 2) 静默降级：宿主全局一个都没装（node、独立窗口、脚本先于酒馆跑）→ 每个方法安静返回，绝不抛；
// 3) 语义对拍：每个方法转发的接口名与参数逐条核对（拆分前后行为一致的地基）；
// 4) 三种查找语义原样保留：fn = 全局 → TavernHelper 命名空间；raw = 只认全局；hfn = 再退父窗口命名空间。
import test from 'node:test';
import assert from 'node:assert/strict';
import { TH_API, createHostAdapter, hostAdapter } from '../map/tavern/host-adapter.mjs';

const GROUPS = { events: ['present', 'name', 'on', 'onLast', 'off', 'emit'], chat: ['lastId', 'messages', 'floors', 'floorCount', 'floorAt', 'context', 'parentContext'],
  mvu: ['present', 'data', 'events', 'wait'], vars: ['read', 'assign', 'replace', 'update', 'canWrite'], inject: ['present', 'apply', 'remove', 'swap'],
  wb: ['names', 'book', 'create', 'createOrReplace', 'update', 'replace', 'remove', 'globalNames', 'charNames', 'chatName', 'bindGlobal', 'bindChar', 'bindChat', 'canCreate'],
  macro: ['present', 'register', 'unregister'], ui: ['scriptId', 'scriptInfo', 'globalApi', 'displayedMessage', 'charData', 'regexes', 'preset', 'probeContext', 'probeCharName'] };

test('TH_API：冻结名单（闸门词表），四个宿主对象在册', () => {
  assert.ok(Array.isArray(TH_API) && TH_API.length > 30); assert.ok(Object.isFrozen(TH_API));
  assert.equal(new Set(TH_API).size, TH_API.length, '名单不许有重名');
  for (const g of ['Mvu', 'SillyTavern', 'TavernHelper', 'tavern_events']) assert.ok(TH_API.includes(g), g + ' 要在册');
});

test('接口形状：每个分组的方法都在（F1 的原生实现按同一张表核对）', () => {
  const A = createHostAdapter();
  for (const [g, ms] of Object.entries(GROUPS)) { assert.equal(typeof A[g], 'object', g); for (const m of ms) assert.equal(typeof A[g][m], 'function', `${g}.${m}`); }
  for (const k of ['fn', 'ok', 'okRaw', 'raw', 'hfn', 'top']) assert.equal(typeof A[k], 'function', k);
  assert.equal(typeof hostAdapter, 'object', '引擎用的单例');
});

test('静默降级：宿主全局一个都没装，每个方法安静返回，不抛', () => {
  const A = createHostAdapter({ top: () => undefined });
  assert.equal(A.events.present(), false); assert.equal(A.events.name('CHAT_CHANGED'), null);
  assert.equal(A.events.on('e', () => {}), undefined); assert.equal(A.events.onLast('e', () => {}), null);
  assert.equal(A.chat.lastId(), undefined); assert.equal(A.chat.floors(), null); assert.equal(A.chat.floorCount(), -1); assert.equal(A.chat.floorAt(0), null);
  assert.equal(A.chat.context(), null); assert.equal(A.mvu.present(), false); assert.equal(A.mvu.data({}), null); assert.equal(A.mvu.events(), null);
  assert.equal(A.vars.read('chat'), undefined); assert.equal(A.vars.canWrite(), false);
  assert.equal(A.inject.present(), false); assert.equal(A.inject.apply([]), undefined); assert.equal(A.inject.swap(['1'], []), false);
  assert.equal(A.wb.names(), undefined); assert.equal(A.wb.canCreate(), false);
  assert.equal(A.macro.present(), false); assert.equal(A.ui.scriptId(), undefined); assert.equal(A.ui.probeContext(null), null);
  return A.mvu.wait('x').then(v => assert.equal(v, undefined, '没装 waitGlobalInitialized：落定即可（楼层事件照常挂）'));
});

test('转发对拍：每个方法打的接口名与参数（假宿主表记录）', async () => {
  const calls = []; const argmap = {}; const json = a => JSON.stringify(a, (k, v) => (typeof v === 'function' ? '<fn>' : v));
  const mk = n => (...a) => { calls.push(`${n}${json(a) === '[]' ? '' : json(a)}`); argmap[n] = a; return 'R:' + n; };
  const fns = {}; for (const n of TH_API) if (!['Mvu', 'SillyTavern', 'TavernHelper', 'tavern_events'].includes(n)) fns[n] = mk(n);
  const A = createHostAdapter({ fn: n => fns[n] ?? null, raw: n => fns[n] ?? null, ok: n => !!fns[n], hfn: n => fns[n] ?? null, top: () => ({}) });
  A.events.on('e', () => {}); A.events.onLast('e2', () => {}); A.events.emit('e3', { a: 1 });
  A.chat.lastId(); A.chat.messages({ first_message: 0 }, { skip: 1 });
  A.vars.read('script'); A.vars.assign({ a: 1 }, 'chat'); A.vars.replace({ b: 2 }, 'global'); A.vars.update(m => m, 'chat');
  A.inject.apply([{ id: 'x', depth: 2 }]); A.inject.remove(['x']);
  A.wb.names(); A.wb.book('B'); A.wb.createOrReplace('B', []); A.wb.update('B', m => m); A.wb.remove('B'); A.wb.bindGlobal(['B']); A.wb.bindChar('current', ['B']); A.wb.bindChat('current', 'B');
  A.macro.register(/x/g, () => ''); A.macro.unregister(/x/g);
  A.ui.scriptId(); A.ui.scriptInfo({ name: 'n' }); A.ui.globalApi('EdenMap', {}); A.ui.charData('current'); A.ui.regexes({ scope: 'character' }); A.ui.preset('light');
  const got = calls.slice();
  assert.deepEqual(got, ['eventOn["e","<fn>"]', 'eventMakeLast["e2","<fn>"]', 'eventEmit["e3",{"a":1}]', 'getLastMessageId',
    'getChatMessages[{"first_message":0},{"skip":1}]', 'getVariables[{"type":"script"}]', 'insertOrAssignVariables[{"a":1},{"type":"chat"}]',
    'replaceVariables[{"b":2},{"type":"global"}]', 'updateVariablesWith["<fn>",{"type":"chat"}]', 'injectPrompts[[{"id":"x","depth":2}]]',
    'uninjectPrompts[["x"]]', 'getWorldbookNames', 'getWorldbook["B"]', 'createOrReplaceWorldbook["B",[]]', 'updateWorldbookWith["B","<fn>"]',
    'deleteWorldbook["B"]', 'rebindGlobalWorldbooks[["B"]]', 'rebindCharWorldbooks["current",["B"]]', 'rebindChatWorldbook["current","B"]',
    'registerMacroLike[{},"<fn>"]', 'unregisterMacroLike[{}]', 'getScriptId', 'replaceScriptInfo[{"name":"n"}]',
    'initializeGlobal["EdenMap",{}]', 'getCharData["current"]', 'getTavernRegexes[{"scope":"character"}]', 'getPreset["light"]']);
  assert.ok(argmap.registerMacroLike[0] instanceof RegExp, '正则原样转发（JSON 里它才是 {}）'); assert.equal(argmap.unregisterMacroLike[0].flags, 'g');
  assert.equal(A.vars.canWrite(), true); assert.equal(A.inject.present(), true); assert.equal(A.wb.canCreate(), true); assert.equal(A.macro.present(), true);
});

test('查找语义：fn 认命名空间、raw 只认全局、hfn 再退父窗口（与拆分前的 thFn / 裸调用 / hostFn 一致）', () => {
  const saved = [];
  const put = (k, v) => { const d = Object.getOwnPropertyDescriptor(globalThis, k); saved.push([k, d]); if (v === undefined) delete globalThis[k]; else globalThis[k] = v; };
  put('window', globalThis); put('parent', { TavernHelper: { onlyParent: () => 'P' } });
  put('TavernHelper', { nsOnly: () => 'N' }); put('both', () => 'G'); globalThis.rawOnly = () => 'R';
  const A = createHostAdapter();
  try {
    assert.equal(typeof A.fn('nsOnly'), 'function', '命名空间里的接口 fn 取得到'); assert.equal(A.fn('nsOnly')(), 'N');
    assert.equal(A.raw('nsOnly'), null, 'raw 只认全局：命名空间里的那份不算');
    assert.equal(A.fn('both')(), 'G', '全局优先'); assert.equal(A.raw('rawOnly')(), 'R');
    assert.equal(A.ok('nsOnly'), true); assert.equal(A.ok('nothingHere'), false);
    assert.equal(A.okRaw('nsOnly'), false, 'okRaw 是旧 fnOk 口径：只认全局，命名空间里那份不算'); assert.equal(A.okRaw('both'), true);
    assert.equal(A.hfn('onlyParent'), null, '本窗口有命名空间：只认它，父窗口那份不算（旧 hostFn 口径）');
    assert.equal(A.hfn('nsOnly')(), 'N');
    put('TavernHelper', undefined);
    assert.equal(A.hfn('onlyParent')(), 'P', '本窗口没有命名空间：退到父窗口那份'); assert.equal(A.hfn('nothingHere'), null);
    assert.equal(A.top(), globalThis.parent);
  } finally {
    for (const [k, d] of saved.reverse()) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
    delete globalThis.rawOnly;
  }
});

test('mvu / chat 读的是全局对象本身：Mvu.getMvuData、SillyTavern.chat、getContext', () => {
  const saved = [];
  const put = (k, v) => { const d = Object.getOwnPropertyDescriptor(globalThis, k); saved.push([k, d]); if (v === undefined) delete globalThis[k]; else globalThis[k] = v; };
  put('window', globalThis); put('Mvu', { getMvuData: q => ({ stat_data: { q } }), events: { VARIABLE_UPDATE_ENDED: 'v' } });
  put('SillyTavern', { chat: [1, 2], getContext: () => ({ chatId: 'c' }) });
  const A = createHostAdapter();
  try {
    assert.equal(A.mvu.present(), true); assert.deepEqual(A.mvu.data({ type: 'message', message_id: 'latest' }).stat_data.q, { type: 'message', message_id: 'latest' });
    assert.deepEqual(A.mvu.events(), { VARIABLE_UPDATE_ENDED: 'v' });
    assert.deepEqual(A.chat.floors(), [1, 2]); assert.equal(A.chat.floorCount(), 2); assert.equal(A.chat.floorAt(1), 2); assert.equal(A.chat.floorAt(9), null);
    assert.deepEqual(A.chat.context(), { chatId: 'c' });
  } finally { for (const [k, d] of saved.reverse()) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } }
});

test('事件与注入的边角：off 优先 eventRemoveListener、缺了退 eventOff；swap 先撤再注', () => {
  const seen = [];
  const A = createHostAdapter({ fn: n => ({ eventRemoveListener: (...a) => seen.push(['rm', ...a]), eventOff: (...a) => seen.push(['off', ...a]),
    injectPrompts: p => seen.push(['in', p.length]), uninjectPrompts: i => seen.push(['un', i]) })[n] ?? null });
  const h = () => {}; A.events.off('e', h, 7); assert.deepEqual(seen.at(-1), ['rm', 'e', h, 7]);
  const B = createHostAdapter({ fn: n => (n === 'eventOff' ? (...a) => seen.push(['off', ...a]) : null) });
  B.events.off('e2', h); assert.deepEqual(seen.at(-1), ['off', 'e2', h]);
  assert.equal(A.inject.swap(['a'], [{ id: 'a' }]), true); assert.deepEqual(seen.slice(-2), [['un', ['a']], ['in', 1]]);
  const C = createHostAdapter({ fn: () => null }); assert.equal(C.inject.swap(['a'], []), false, '没有注入接口：什么都不做');
});
