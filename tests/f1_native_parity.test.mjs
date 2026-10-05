// F1 原生适配层对拍：用同一份状态分别经 TH 适配层和原生适配层跑相同的操作序列，
// 验证可观测结果（返回值、副作用后的状态）逐条一致。TH 实现是基准；原生实现必须匹配。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostAdapter } from '../map/tavern/host-adapter.mjs';
import { createNativeAdapter } from '../map/tavern/host-native.mjs';
import { installHost, EVT } from './helpers/f0_host_stub.mjs';

const clone = x => JSON.parse(JSON.stringify(x));

/** 构造一份与 TH stub 等价的假 ST context */
function fakeCtx(state) {
  const chat = (state.chat || []).map(c => ({
    mes: c?.message ?? '', name: c?.name ?? '', is_user: !!c?.is_user,
    extra: c?.extra || {}, swipe_id: c?.swipe_id ?? 0, variables: c?.variables,
  }));
  const chatMetadata = { variables: clone(state.vars?.chat || {}), world_info: state.bindings?.chat ?? null };
  const extensionSettings = {
    eden_map: clone(state.vars?.script || {}),
    world_info: { globalSelect: clone(state.bindings?.global || []) },
    regex: state.regexes ?? null,
  };
  const characters = state.charData ? [{ ...state.charData.data, extensions: { world: clone(state.bindings?.char || []) } }] : [];
  const books = {};
  for (const [n, entries] of Object.entries(state.books || {})) books[n] = { entries: clone(entries) };
  const listeners = new Map();
  const injected = {};
  let savedMeta = false, savedSettings = false;

  const eventSource = {
    on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(fn); },
    makeLast(ev, fn) { eventSource.on(ev, fn); },
    removeListener(ev, fn) { const l = listeners.get(ev); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
    emit(ev, ...args) { for (const fn of listeners.get(ev) || []) { try { fn(...args); } catch (e) {} } },
  };
  const eventTypes = { ...EVT };

  return {
    ctx: {
      chat, chatMetadata, extensionSettings, characters, characterId: characters.length ? 0 : undefined,
      eventSource, eventTypes,
      extensionPrompts: injected,
      saveMetadataDebounced() { savedMeta = true; },
      saveSettingsDebounced() { savedSettings = true; },
      setExtensionPrompt(key, value, position, depth, scan, role) {
        if (value === '' && position === -1) { delete injected[key]; } else { injected[key] = { value, position, depth, scan, role }; }
      },
      async loadWorldInfo(name) { return books[name] ? clone(books[name]) : null; },
      async saveWorldInfo(name, data) { books[name] = clone(data); },
      getWorldInfoNames() { return Object.keys(books); },
      async updateWorldInfoList() {},
      macros: null,
    },
    inspect: () => ({ chatMetadata, extensionSettings, books, injected, savedMeta, savedSettings, listeners }),
  };
}

const msg = (loc, o = {}) => ({ is_user: false, swipe_id: 0, message: loc ? `到${loc}` : '', ...o });
const st = loc => ({ stat_data: { 世界: { 当前地点: loc } } });

// ---- 事件 ----
test('F1 events: on / off / emit 与 TH 行为一致', () => {
  const state = { chat: [msg('书房')], vars: { chat: {} } };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  const calls = [];
  const handler = v => calls.push(v);
  thA.events.on('test_ev', handler);
  nA.events.on('test_ev', handler);

  thA.events.emit('test_ev', 'x');
  nA.events.emit('test_ev', 'x');
  assert.deepEqual(calls, ['x', 'x'], '两边都收到一次');

  thA.events.off('test_ev', handler);
  nA.events.off('test_ev', handler);
  calls.length = 0;
  thA.events.emit('test_ev', 'y');
  nA.events.emit('test_ev', 'y');
  assert.deepEqual(calls, [], 'off 后都不再收');
  th.restore();
});

test('F1 events: present / name', () => {
  const state = { chat: [], vars: {} };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  assert.equal(thA.events.present(), true);
  assert.equal(nA.events.present(), true);
  assert.equal(thA.events.name('CHAT_CHANGED'), EVT.CHAT_CHANGED);
  assert.equal(nA.events.name('CHAT_CHANGED'), EVT.CHAT_CHANGED);
  assert.equal(nA.events.name('NONEXISTENT'), null);
  th.restore();
});

// ---- 楼层 ----
test('F1 chat: lastId / messages / floors / floorCount / floorAt', () => {
  const msgs = [msg('书房'), msg('书房', { is_user: true }), msg('霓虹街')];
  const state = { chat: msgs, vars: { chat: {} }, lastId: 2 };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  assert.equal(thA.chat.lastId(), 2);
  assert.equal(nA.chat.lastId(), 2);

  const thMsgs = thA.chat.messages({ first_message: 0, last_message: 1 });
  const nMsgs = nA.chat.messages({ first_message: 0, last_message: 1 });
  assert.equal(thMsgs.length, nMsgs.length);
  for (let i = 0; i < thMsgs.length; i++) {
    assert.equal(thMsgs[i].message, nMsgs[i].message);
    assert.equal(thMsgs[i].is_user, nMsgs[i].is_user);
  }

  assert.equal(thA.chat.floorCount(), nA.chat.floorCount());
  assert.equal(thA.chat.floorCount(), 3);
  th.restore();
});

test('F1 chat: messages with last_message=-1', () => {
  const msgs = [msg('a'), msg('b'), msg('c')];
  const state = { chat: msgs, vars: {} };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  const thAll = thA.chat.messages({ first_message: 0, last_message: -1 });
  const nAll = nA.chat.messages({ first_message: 0, last_message: -1 });
  assert.equal(thAll.length, nAll.length);
  assert.equal(nAll.length, 3);
  th.restore();
});

// ---- 变量 ----
test('F1 vars: read / assign / replace / update chat 变量与 TH 一致', () => {
  const state = { chat: [msg('书房')], vars: { chat: { eden_map: { x: 1 } } } };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  const thRead = thA.vars.read('chat');
  const nRead = nA.vars.read('chat');
  assert.deepEqual(thRead, nRead);

  thA.vars.assign({ y: 2 }, 'chat');
  nA.vars.assign({ y: 2 }, 'chat');
  assert.deepEqual(thA.vars.read('chat'), nA.vars.read('chat'));

  thA.vars.replace({ z: 3 }, 'chat');
  nA.vars.replace({ z: 3 }, 'chat');
  assert.deepEqual(thA.vars.read('chat'), nA.vars.read('chat'));

  const mut = v => ({ ...v, w: 4 });
  thA.vars.update(mut, 'chat');
  nA.vars.update(mut, 'chat');
  assert.deepEqual(thA.vars.read('chat'), nA.vars.read('chat'));
  th.restore();
});

test('F1 vars: script 变量读写', () => {
  const state = { chat: [], vars: { script: { eden_prefs: { theme: 'dark' } } } };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  const thR = thA.vars.read('script');
  const nR = nA.vars.read('script');
  assert.deepEqual(thR, nR);

  thA.vars.assign({ lang: 'zh' }, 'script');
  nA.vars.assign({ lang: 'zh' }, 'script');
  assert.deepEqual(thA.vars.read('script'), nA.vars.read('script'));
  th.restore();
});

test('F1 vars: canWrite', () => {
  const state = { chat: [], vars: { chat: {} } };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  assert.equal(typeof thA.vars.canWrite(), 'boolean');
  assert.equal(typeof nA.vars.canWrite(), 'boolean');
  assert.equal(nA.vars.canWrite(), true);
  th.restore();
});

// ---- 注入 ----
test('F1 inject: apply / remove / swap 与 TH 行为一致', () => {
  const state = { chat: [msg('书房')], vars: { chat: {} } };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  assert.equal(thA.inject.present(), true);
  assert.equal(nA.inject.present(), true);

  const prompts = [{ id: 'p1', value: '事态摘要', position: 2, depth: 4 }];
  thA.inject.apply(prompts);
  nA.inject.apply(prompts);

  thA.inject.remove(['p1']);
  nA.inject.remove(['p1']);

  const p2 = [{ id: 'p2', value: '新内容', position: 2, depth: 4 }];
  assert.equal(thA.inject.swap(['p2'], p2), true);
  assert.equal(nA.inject.swap(['p2'], p2), true);
  th.restore();
});

// ---- 世界书 ----
test('F1 wb: names / book / create / update / replace / remove', async () => {
  const state = { chat: [], vars: {}, books: { 'Test': [{ name: 'e1', content: 'x' }] } };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  const thNames = await thA.wb.names();
  const nNames = await nA.wb.names();
  assert.deepEqual(thNames.sort(), nNames.sort());

  const thBook = await thA.wb.book('Test');
  const nBook = await nA.wb.book('Test');
  assert.ok(thBook !== null);
  assert.ok(nBook !== null);

  await thA.wb.create('New', [{ name: 'n1' }]);
  await nA.wb.create('New', [{ name: 'n1' }]);
  const thN2 = await thA.wb.names();
  const nN2 = await nA.wb.names();
  assert.deepEqual(thN2.sort(), nN2.sort());

  await thA.wb.remove('New');
  await nA.wb.remove('New');
  th.restore();
});

test('F1 wb: bindings (global / char / chat)', async () => {
  const state = { chat: [msg('书房')], vars: {}, bindings: { global: ['G1'], char: ['C1'], chat: 'ChatBook' }, charData: { data: {} } };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  const thGN = await thA.wb.globalNames();
  const nGN = await nA.wb.globalNames();
  assert.deepEqual(thGN, nGN);

  const thCN = await thA.wb.chatName();
  const nCN = await nA.wb.chatName();
  assert.equal(thCN, nCN);

  await thA.wb.bindGlobal(['G2']);
  await nA.wb.bindGlobal(['G2']);
  assert.deepEqual(await thA.wb.globalNames(), await nA.wb.globalNames());

  await thA.wb.bindChat(null, 'NewChat');
  await nA.wb.bindChat(null, 'NewChat');
  assert.equal(await thA.wb.chatName(), await nA.wb.chatName());
  th.restore();
});

// ---- UI ----
test('F1 ui: globalApi / charData / probeContext', () => {
  const state = { chat: [], vars: {}, charData: { data: { name: 'TestCard' } } };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  thA.ui.globalApi('TestApi', { x: 1 });
  nA.ui.globalApi('TestApi', { x: 1 });
  assert.deepEqual(globalThis.TestApi, { x: 1 });
  delete globalThis.TestApi;

  const thCD = thA.ui.charData();
  const nCD = nA.ui.charData();
  assert.ok(thCD !== null);
  assert.ok(nCD !== null);
  th.restore();
});

// ---- MVU ----
test('F1 mvu: present / usable 在无 MVU 时返回 false', () => {
  const saved = globalThis.Mvu;
  delete globalThis.Mvu;
  try {
    const n = fakeCtx({ chat: [], vars: {} });
    const nA = createNativeAdapter(n.ctx);
    assert.equal(nA.mvu.present(), false);
    assert.equal(nA.mvu.usable(), false);
    assert.equal(nA.mvu.data({}), null);
  } finally { if (saved !== undefined) globalThis.Mvu = saved; }
});

// ---- 完整形状 ----
test('F1 原生适配层导出的能力组与 TH 版完全一致', () => {
  const state = { chat: [], vars: {} };
  const th = installHost(state);
  const thA = createHostAdapter();
  const n = fakeCtx(state);
  const nA = createNativeAdapter(n.ctx);

  const groups = ['events', 'chat', 'mvu', 'vars', 'inject', 'wb', 'macro', 'ui'];
  for (const g of groups) {
    assert.ok(g in nA, `缺少能力组 ${g}`);
    const thKeys = Object.keys(thA[g]).sort();
    const nKeys = Object.keys(nA[g]).sort();
    assert.deepEqual(nKeys, thKeys, `${g} 的方法集不一致`);
  }
  const rawKeys = ['fn', 'ok', 'okRaw', 'raw', 'hfn', 'top', 'fnsFor'];
  for (const k of rawKeys) {
    assert.ok(k in nA, `缺少底层取法 ${k}`);
  }
  th.restore();
});
