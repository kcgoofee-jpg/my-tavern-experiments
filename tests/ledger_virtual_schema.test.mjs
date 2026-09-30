// W12 / 任务一：虚拟账本槽位（Schema 缺失自愈拦截）——宿主 stat_data 里一个背包字段都没有时，
// 地图自己声明一个虚拟槽位，把捕获的物理事实（拾取）**强制**落盘，并在下一轮回注成已知事实。
// 两条底线一起断言：① 事实绝不因为卡里没字段而丢；② 地图绝不往宿主 stat_data 里新开字段
//（卡的 MVU 带 zod 结构，未知键会被丢掉还可能触发校验报错，见 map/core/ledger.mjs 的同一段注释）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { slotProbe, slotDeclare, slotPut, slotLine, slotSave, audit } from '../map/core/ledger.mjs';
import { createSlotSink } from '../map/tavern/varsync.mjs';

test('探路：认得出背包字段就用它（子表也认），值不是对象 / 一个都没有 → 虚拟槽位', () => {
  assert.deepEqual(slotProbe(null), { key: '物品栏', path: '', virtual: true });
  assert.deepEqual(slotProbe({}), { key: '物品栏', path: '', virtual: true });
  assert.deepEqual(slotProbe({ 世界: { 当前地点: '中层·霓虹街' } }), { key: '物品栏', path: '', virtual: true });
  assert.deepEqual(slotProbe({ 背包: { i1: { 名: '钥匙' } } }), { key: '背包', path: '背包', virtual: false });
  assert.deepEqual(slotProbe({ 资产: { 物品栏: {} } }), { key: '物品栏', path: '资产.物品栏', virtual: false });
  assert.equal(slotProbe({ 道具: [] }).virtual, true);                  // 数组不当容器
  assert.equal(slotProbe({ 物品栏: '一整串文字' }).virtual, true);      // 字符串不当容器
  assert.equal(slotProbe({ 背包: {}, 物品栏: {} }).key, '物品栏');        // 候选表的顺序优先（更贴这张卡的说法）
  assert.equal(slotProbe({ Inventory: {} }).virtual, false);            // 英文键大小写不敏感
});

test('空 stat_data 下拾取：自动声明槽位 → 增量落盘（同一件只写一次），第二遍不再声明', () => {
  const stat = {};                                  // 老旧 / 非标卡片：一个背包字段都没有
  const calls = { declare: [], put: [] }, store = {};
  const sink = createSlotSink({
    declare: k => { calls.declare.push(k); store[k] = {}; return true; },
    put: (k, rows) => { for (const r of rows) store[k][r.id] = { 名: r.名, 地点: r.地点 || '' }; return true; },
  });
  const probe = slotProbe(stat);
  assert.equal(probe.virtual, true);
  sink.bind(probe); sink.ensure(probe);
  assert.deepEqual(calls.declare, ['物品栏']);        // 只声明一次，名字取候选表的第一项

  sink.capture({ id: 'i1', 名: '扳手', 地点: '车库' });
  sink.capture({ id: 'i1', 名: '扳手', 地点: '车库' });   // 同一件重复捕获 = 覆盖，不排队两次
  sink.capture({ id: 'i2', 名: '软膏' });
  assert.equal(sink.pending(), 2);
  assert.deepEqual(sink.flush(), { wrote: 2, pending: 0, ok: true });
  assert.deepEqual(Object.keys(store.物品栏).sort(), ['i1', 'i2']);
  assert.equal(store.物品栏.i1.名, '扳手');
  assert.equal(store.物品栏.i2.地点, '');               // 没说地点就不编

  sink.ensure(probe);                                 // 槽位已在：不再声明
  assert.equal(calls.declare.length, 1);
  assert.equal(sink.describe().declared, 1);
});

test('宿主卡自己有背包栏：什么都不建（只按缺口对齐），也不往 stat_data 写', () => {
  const calls = [];
  const sink = createSlotSink({ declare: k => { calls.push(k); return true; }, put: () => true });
  const probe = slotProbe({ 背包: { a: { 名: '钥匙' } } });
  sink.bind(probe);
  assert.equal(sink.ensure(probe), true);
  assert.deepEqual(calls, []);                        // 一个字节都不写宿主结构
  assert.equal(sink.describe().state, 'idle');
});

test('落盘失败不出队（下一轮重试，宁慢不丢）；换聊天 reset 后连槽位名一起忘掉', () => {
  const sink = createSlotSink({ put: () => false });
  sink.bind(slotProbe({})); sink.ensure(slotProbe({}));
  sink.capture({ id: 'i1', 名: '扳手' });
  assert.deepEqual(sink.flush(), { wrote: 0, pending: 1, ok: false });
  assert.deepEqual(sink.keys(), ['i1']);              // 还在队里
  sink.reset();
  assert.equal(sink.pending(), 0);
  assert.equal(sink.describe().key, null);
});

test('槽位声明幂等：名 / 路径 / 虚拟性都没变 → 对象原样（不抖出新的落盘）', () => {
  const probe = slotProbe({});
  const a = slotDeclare(null, probe, 7);
  assert.equal(a.名, '物品栏'); assert.equal(a.虚拟, true); assert.equal(a.楼, 7); assert.deepEqual(a.物, undefined);
  assert.equal(slotDeclare(a, probe, 9), a);                          // 同一条声明：引用都不换
  const b = slotDeclare(a, slotProbe({ 背包: {} }), 9);                // 卡那边冒出真字段了 → 换声明
  assert.equal(b.虚拟, false); assert.equal(b.名, '背包');
});

test('增量写入：已在账上不算新增（防「用掉道具后被审计器复活」的反向错误）', () => {
  let slot = slotDeclare(null, slotProbe({}), 7);
  slot = slotPut(slot, [{ id: 'i1', name: '扳手', place: '车库' }], 8);
  assert.equal(slot.件, 1); assert.equal(slot.added, 1);
  assert.equal(slot.物.i1.名, '扳手'); assert.equal(slot.物.i1.楼, 8); assert.equal(slot.物.i1.地点, '车库');
  const again = slotPut(slot, [{ id: 'i1', name: '扳手', place: '车库' }], 9);
  assert.equal(again.added, 0); assert.equal(again.件, 1);
  assert.equal(slotPut(slot, [{ id: '', name: '没编号' }, { id: 'i2' }]).件, 1);   // 没有 id / 没有名字：不入账
  assert.equal(slotSave(slot).件, 1);
  assert.equal(slotSave(slotPut(slotDeclare(null, slotProbe({})), [])), null);   // 空槽位不落空壳
});

test('回注文案：说清「本卡有没有背包栏」与件数，但不点名卡里的字段（附加规则不引用卡字段名）', () => {
  const v = slotDeclare(null, slotProbe({}), 3);
  assert.match(slotLine(slotPut(v, [{ id: 'i1', name: '扳手' }])), /自建槽位「物品栏」.*1 件/s);
  const real = slotDeclare(null, slotProbe({ 资产: { 物品栏: {} } }), 3);
  const line = slotLine(slotPut(real, [{ id: 'i1', name: '扳手' }]));
  assert.doesNotMatch(line, /资产|当前地点/);          // 不出现卡里的路径
  assert.match(line, /1 件/);
});

test('与漏项审计同一口径：没落盘才补一条单项，已落盘不再补', () => {
  const facts = [{ kind: 'loot', id: 'i1', name: '扳手', place: '车库', floor: 8, authority: 'verified' }];
  const miss = audit(facts, { assets: {} });
  assert.equal(miss.patches.length, 1);
  assert.equal(miss.patches[0].domain, 'assets'); assert.equal(miss.patches[0].id, 'i1');
  const landed = audit(facts, { assets: { i1: '扳手' } });
  assert.equal(landed.patches.length, 0); assert.equal(landed.ok, 1);
  assert.equal(audit(facts, { assets: {} }).pending.length, 0);   // 有视图、认得出来 = 不进退而求其次的待结算
});
