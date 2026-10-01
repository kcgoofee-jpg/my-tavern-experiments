// S6-2：聊天变量的根（tavern/root-store.mjs）——迁移一次、旧键只读：加载时 仓库 / 槽位 → stash；之后每次保存都把旧键的值原样带回去
// （saveRoot 整块替换，漏带 = 删掉用户的旧数据）；没有旧键的聊天不会多出它们；已有 stash 不再迁移。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../map/tavern/stash-store.mjs';
import * as MR from '../map/tavern/mvu-readers.mjs';
import { createRootStore, DEPS } from '../map/tavern/root-store.mjs';

const V1_INV = { seq: 2, items: { i2: { 名: '机密账本', 地点: '书房', 层: 'estate', 暗格: true }, s1a2b3c: { 名: '旧地图', 地点: '书房', 层: '', 暗格: false } } };
const V1_SLOT = { 名: '物品栏', 路径: '', 虚拟: true, 楼: 3, 件: 1, 物: { s1a2b3c: { 名: '旧地图', 楼: 3, 地点: '书房' } } };

/** 一个假聊天变量 + 酒馆助手的四个变量函数；返回 { vars, writes, root(宿主依赖袋), run(fn) } */
async function withChat(rootVars, fn) {
  const vars = { eden_map: rootVars }, writes = [];
  const had = Object.fromEntries(['window', 'getVariables', 'updateVariablesWith'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  globalThis.window = globalThis;
  globalThis.getVariables = () => vars;
  globalThis.updateVariablesWith = async f => { const next = f(JSON.parse(JSON.stringify(vars))); writes.push(JSON.parse(JSON.stringify(next.eden_map))); vars.eden_map = next.eden_map; };
  const host = Object.fromEntries(DEPS.map(k => [k, () => {}]));
  Object.assign(host, {
    contextPipeline: { tag: { floor: -1, log: [], seen: {} }, trips: [] }, LS: { getItem: () => null, setItem() {}, removeItem() {} }, MAN: Promise.resolve(null), PACK_ID: 'eden', PACK_IN: null, scriptBase: 'file:///x/map/', panel: { hidden: true },
    life: { dead: false }, post: () => {}, emit: () => {}, recomputeSoon: () => {}, readVars: () => vars.eden_map || {}, chatId: () => 'chat-1', checkpointResume: () => {}, kfReset: () => {},
    wrapLS: f => f, BASE: 'https://example.invalid/', explored: {}, cp: null, kfView: null, floorNow: 12, alive: true, custVer: 0, ghost: false, uiLang: 'zh', chars: [],
    mvuReaders: MR, stashStoreModule: S, stash: null, keyframesModule: null, explorationLedgerModule: null, tlWalk: null, worldbookJitModule: null, WBSm: null,
  });
  try { return await fn({ vars, writes, host, store: createRootStore(host) }); }
  finally { for (const [k, d] of Object.entries(had)) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k]; }
}

test('加载一份只有旧键的聊天：迁移一次、写回 stash，旧键的值一个字不动', async () => {
  await withChat({ 自定义: { items: {} }, 仓库: V1_INV, 槽位: V1_SLOT }, async ({ vars, writes, host, store }) => {
    await store.loadCustom();
    assert.deepEqual(Object.keys(host.stash.items), ['i2', 's1a2b3c'], '行与 id 全在');
    assert.equal(host.stash.items.s1a2b3c.src, 'map'); assert.equal(host.stash.from.msgIndex, null, '起点不取 floorNow（换聊天时它是上一个聊天的）');
    assert.equal(host.stash.since, null, '第一次扫描时才对齐最新一楼');
    assert.equal(writes.length, 1, '迁移结果落盘一次');
    assert.deepEqual(vars.eden_map.仓库, V1_INV); assert.deepEqual(vars.eden_map.槽位, V1_SLOT);
    assert.equal(vars.eden_map.stash.items.i2.name, '机密账本');
    // 之后的保存（改了背包）：旧键仍然原样带着，stash 是新的
    host.stash = S.put(host.stash, { name: '现金', place: '客厅', qty: 3 }).stash;
    await store.saveRoot();
    assert.deepEqual(vars.eden_map.仓库, V1_INV, '保存不改旧键'); assert.deepEqual(vars.eden_map.槽位, V1_SLOT);
    assert.ok(Object.values(vars.eden_map.stash.items).some(r => r.name === '现金'));
    // 再加载一次：已有 stash，不再迁移（没有多余的写）
    const n = writes.length;
    await store.loadCustom();
    assert.equal(writes.length, n, '没有迁移就没有写');
    assert.ok(Object.values(host.stash.items).some(r => r.name === '现金'), '读到的是 stash，不是旧键');
    assert.deepEqual(vars.eden_map.仓库, V1_INV);
  });
});

test('没有旧键的聊天：多出 stash，不会凭空多出 仓库 / 槽位', async () => {
  await withChat({ 自定义: { items: {} } }, async ({ vars, writes, host, store }) => {
    await store.loadCustom();
    assert.deepEqual(host.stash, S.empty(null));
    assert.equal(writes.length, 0, '没迁移、没改动：不写');
    host.stash = S.put(host.stash, { name: '钥匙', place: '书房' }).stash;
    await store.saveRoot();
    assert.ok(vars.eden_map.stash && !('仓库' in vars.eden_map) && !('槽位' in vars.eden_map));
  });
});

test('只有槽位的聊天也迁移；旧键之外的字段（行程、标签、探索……）照旧随保存带回', async () => {
  await withChat({ 自定义: { items: {} }, 槽位: V1_SLOT, 探索: { estate: [1, 2] } }, async ({ vars, host, store }) => {
    host.explorationLedgerModule = { norm: x => x };
    await store.loadCustom();
    assert.deepEqual(host.stash.items, {}); assert.equal(Object.keys(host.stash.slot.facts).length, 1);
    await store.saveRoot();
    assert.deepEqual(vars.eden_map.槽位, V1_SLOT); assert.deepEqual(vars.eden_map.探索, { estate: [1, 2] }); assert.ok(!('仓库' in vars.eden_map));
  });
});

test('存储模块还没到时，加载等它（不能带着空的旧键保存）', async () => {
  await withChat({ 自定义: { items: {} }, 仓库: V1_INV }, async ({ vars, host, store }) => {
    host.stashStoreModule = null;
    await store.loadCustom();
    assert.deepEqual(vars.eden_map.仓库, V1_INV, '旧键还在');
    assert.deepEqual(Object.keys(host.stash.items), ['i2', 's1a2b3c']);
  });
});
