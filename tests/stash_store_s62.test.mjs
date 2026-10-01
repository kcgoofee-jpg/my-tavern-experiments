// S6-2：统一背包存储（tavern/stash-store.mjs，K-R74）：norm 的上限与默认值、migrate（旧键 仓库 / 槽位 → stash，一次、不改输入、保 id）、
// put / remove 的 id 与按名规则与冻结的 v1 一致、墓碑、retag、wireRows 与 digestLine 对拍 v1、槽位形状（ledger.slotNorm）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../map/tavern/stash-store.mjs';
import * as V1 from './helpers/stash_store_v1_frozen.mjs';
import { itemId } from '../map/core/pickup.mjs';
import { slotNorm, slotDeclare, slotPut, slotProbe, slotLine, slotSave } from '../map/core/ledger.mjs';

const clone = v => JSON.parse(JSON.stringify(v));

test('norm：上限与默认值', () => {
  const n = S.norm({
    items: {
      a: { name: 'x'.repeat(80), place: 'p'.repeat(80), map: 'm'.repeat(80), note: 'n'.repeat(300), node: 'estate_study', qty: 1, src: 'text', msgIndex: 4, mark: 'k'.repeat(30) },
      b: { name: '甲', node: 'Bad Node', qty: 1000.7, src: 'weird', carried: false, msgIndex: 1.5 },
      c: { name: '乙', src: 'map' }, d: { name: '丙', src: 'api' }, e: { name: '丁', src: 'api', carried: true }, f: { place: '没名字' }, g: 5,
    },
  });
  assert.equal(n.items.a.name.length, 60); assert.equal(n.items.a.place.length, 60); assert.equal(n.items.a.map.length, 40); assert.equal(n.items.a.note.length, 200);
  assert.equal(n.items.a.node, 'estate_study'); assert.equal(n.items.a.qty, undefined, 'qty 1 = 不记'); assert.equal(n.items.a.mark.length, 16);
  assert.equal(n.items.b.node, '', 'node 不合规 = 未解析'); assert.equal(n.items.b.qty, 999); assert.equal(n.items.b.src, 'legacy'); assert.equal(n.items.b.carried, false); assert.equal(n.items.b.msgIndex, null);
  assert.equal(n.items.a.carried, true, 'carried 缺省：text / map = true');
  assert.equal(n.items.c.carried, true); assert.equal(n.items.d.carried, false); assert.equal(n.items.e.carried, true, '显式 carried 优先');
  assert.deepEqual(Object.keys(n.items), ['a', 'b', 'c', 'd', 'e'], '没名字 / 非对象的行丢弃');
  assert.deepEqual(S.norm(S.norm(n)), S.norm(n), '幂等');
});

test('norm：墓碑最多 200（最旧的先丢）、seq 取显式与 i<n> 的最大、slot 过 slotNorm', () => {
  const removed = Object.fromEntries(Array.from({ length: 230 }, (_, i) => ['t' + i, 1000 - i]));
  const n = S.norm({ removed, items: { i7: { name: 'a' } }, seq: 3, slot: { name: '物品栏', path: '', virtual: true, msgIndex: 2, facts: { x1: { name: 'k', msgIndex: 2 } } } });
  assert.equal(Object.keys(n.removed).length, 200);
  assert.ok(n.removed.t0 === 1000 && !('t229' in n.removed), '值最小（最旧）的被丢');
  assert.equal(n.seq, 7);
  assert.deepEqual(n.slot.facts, { x1: { name: 'k', msgIndex: 2 } });
  assert.equal(S.norm({ slot: { 名: '物品栏' } }).slot, null, '旧形状的槽位不是 ASCII 形状：丢');
});

const V1_ROOT = Object.freeze({
  自定义: { items: {} },
  仓库: { seq: 3, items: {
    i3: { 名: '机密账本', 地点: '书房', 层: 'estate', 暗格: true, 说明: '塞在书架第三层', 数量: 2 },
    [itemId('黄铜钥匙')]: { 名: '黄铜钥匙', 地点: '客厅', 层: '', 暗格: false, 说明: '正文拾取 · 第 4 楼' },
    s1a2b3c: { 名: '旧地图', 地点: '书房', 层: 'estate', 暗格: false },
    estate_key: { 名: '备用钥匙', 地点: '车库' },
  } },
  槽位: { 名: '物品栏', 路径: '', 虚拟: true, 楼: 4, 件: 2, 物: { [itemId('黄铜钥匙')]: { 名: '黄铜钥匙', 楼: 4, 地点: '客厅' }, x9z: { 名: '银怀表', 楼: 6 } } },
});

test('migrate：旧键 → stash（设计 §5.4）：行、id、src / carried、seq、槽位、起点、from', () => {
  const before = JSON.stringify(V1_ROOT);
  const { stash, migrated } = S.migrate(V1_ROOT, { msgIndex: 9, worldIds: new Set(['estate_key']) });
  assert.equal(migrated, true);
  assert.equal(JSON.stringify(V1_ROOT), before, '输入原样（不改旧键）');
  assert.deepEqual(Object.keys(stash.items), ['i3', itemId('黄铜钥匙'), 's1a2b3c', 'estate_key'], 'id 全部保留，顺序不变');
  const row = id => stash.items[id];
  assert.deepEqual(row('i3'), { name: '机密账本', place: '书房', map: 'estate', node: '', hidden: true, note: '塞在书架第三层', qty: 2, src: 'legacy', carried: false, msgIndex: null });
  assert.equal(row(itemId('黄铜钥匙')).src, 'text'); assert.equal(row(itemId('黄铜钥匙')).carried, true);
  assert.equal(row('s1a2b3c').src, 'map'); assert.equal(row('s1a2b3c').carried, true);
  assert.equal(row('estate_key').src, 'map', '藏物表里有的 id = 地图拾取');
  assert.equal(stash.seq, 3);
  assert.deepEqual(stash.slot, { name: '物品栏', path: '', virtual: true, msgIndex: 4, facts: { [itemId('黄铜钥匙')]: { name: '黄铜钥匙', msgIndex: 4, place: '客厅' }, x9z: { name: '银怀表', msgIndex: 6 } } });
  assert.equal(stash.since, 9); assert.equal(stash.upTo, 8);
  assert.deepEqual(stash.from, { keys: [S.V1_KEYS.inventory, S.V1_KEYS.slot], msgIndex: 9 });
  assert.deepEqual(stash.removed, {});
  // 藏物表晚到：认不出来源的旧行里，id 在藏物表里的升格为地图拾取（一次，幂等）
  const late = S.migrate(V1_ROOT, { msgIndex: 9 });
  assert.equal(late.stash.items.estate_key.src, 'legacy');
  const up = S.retag(late.stash, new Set(['estate_key', 'i3']));
  assert.equal(up.changed, true); assert.equal(up.stash.items.estate_key.src, 'map'); assert.equal(up.stash.items.estate_key.carried, true);
  assert.equal(up.stash.items.i3.src, 'map', '旧行 msgIndex 为空、id 在藏物表里：升格');
  assert.equal(S.retag(up.stash, new Set(['estate_key'])).changed, false, '幂等');
  assert.equal(S.retag(S.norm({ items: { k: { name: 'a', src: 'legacy' } } }), new Set(['k'])).changed, false, '没有 from 的存储不动');
});

test('migrate：已有 stash 不再迁移；两样都没有 = 空存储；只有槽位也行；坏数据不炸', () => {
  const have = S.migrate({ stash: S.norm({ items: { a: { name: '甲', src: 'api' } } }), 仓库: V1_ROOT.仓库 }, { msgIndex: 5 });
  assert.equal(have.migrated, false); assert.deepEqual(Object.keys(have.stash.items), ['a'], '旧键被忽略');
  assert.deepEqual(S.migrate({ 自定义: {} }, { msgIndex: 5 }), { stash: S.empty(5), migrated: false });
  assert.deepEqual(S.migrate(null), { stash: S.empty(null), migrated: false });
  assert.deepEqual(S.empty(5), { v: 1, items: {}, seq: 0, slot: null, removed: {}, since: 5, upTo: 4 });
  assert.deepEqual(S.empty(null), { v: 1, items: {}, seq: 0, slot: null, removed: {}, since: null, upTo: null });
  const onlySlot = S.migrate({ 槽位: V1_ROOT.槽位 }, { msgIndex: 2 });
  assert.equal(onlySlot.migrated, true); assert.deepEqual(onlySlot.stash.items, {}); assert.deepEqual(onlySlot.stash.from.keys, [S.V1_KEYS.slot]);
  assert.equal(Object.keys(onlySlot.stash.slot.facts).length, 2);
  assert.equal(S.migrate({ 仓库: 'x', 槽位: [] }).migrated, false);
  assert.equal(S.migrate({ 槽位: { 名: 5 } }, { msgIndex: 1 }).stash.slot, null, '槽位没有名字：不迁');
});

test('put / remove：id 与按名规则与冻结的 v1 一致（同一串操作，行逐条相同）', () => {
  const ops = [
    { op: 'put', a: { name: '机密账本', place: '书房', map: 'estate', hidden: true, note: '书架第三层' } },
    { op: 'put', a: { name: '机密账本', place: '客厅' } },
    { op: 'put', a: { id: 'i9', name: '现金', place: '保险柜', qty: 3 } },
    { op: 'put', a: { name: '现金' } },
    { op: 'put', a: { name: '现金', qty: 1, hidden: false, note: '' } },
    { op: 'put', a: { name: 'Gun', place: '车库' } },
    { op: 'put', a: { name: 'gun', qty: 12 } },
    { op: 'put', a: { id: 'x1', name: '自带编号', note: '外部系统' } },
    { op: 'put', a: { name: '  ' } },
    { op: 'put', a: { name: '新东西', place: '地下室', qty: 5000 } },
    { op: 'remove', a: 'i9' }, { op: 'remove', a: '机密账本' }, { op: 'remove', a: '没有这个' },
    { op: 'put', a: { name: '再来一个' } },
  ];
  let v1 = V1.norm(null), v2 = S.norm(null);
  for (const [i, o] of ops.entries()) {
    const r1 = o.op === 'put' ? V1.put(v1, o.a) : V1.remove(v1, o.a), r2 = o.op === 'put' ? S.put(v2, o.a) : S.remove(v2, o.a);
    assert.equal(r2.changed, r1.changed, `操作 ${i} 的 changed`);
    v1 = r1.inv; v2 = r2.stash;
    assert.deepEqual(S.wireRows(v2), V1.rows(v1), `操作 ${i} 之后的行`);
    assert.equal(v2.seq, v1.seq, `操作 ${i} 之后的 seq`);
    assert.equal(S.digestLine(v2), V1.digestLine(v1), `操作 ${i} 之后的摘要`);
  }
});

test('墓碑与来源：删掉 text 行留墓碑；别的来源不留；put 默认 src api / carried 跟来源', () => {
  let st = S.put(S.empty(0), { id: 'xa', name: '银怀表', src: 'text', carried: true, msgIndex: 2, mark: 'h2' }).stash;
  st = S.put(st, { id: 'sm1', name: '旧地图', src: 'map', msgIndex: 3 }).stash;
  st = S.put(st, { name: '账本', place: '书房' }).stash;
  assert.deepEqual(Object.values(st.items).map(r => [r.src, r.carried]), [['text', true], ['map', true], ['api', false]]);
  assert.equal(st.items.xa.mark, 'h2'); assert.equal(Object.values(st.items)[2].mark, undefined, '只有 text 行记 mark');
  const a = S.remove(st, '银怀表', 8);
  assert.deepEqual(a.stash.removed, { xa: 8 });
  assert.deepEqual(S.remove(st, 'sm1', 9).stash.removed, {}, 'map 行删了不留墓碑');
  assert.deepEqual(S.remove(st, '账本').stash.removed, {});
  assert.equal(S.put(a.stash, { id: 'xa', name: '银怀表', src: 'text', msgIndex: 9 }).stash.removed.xa, 8, '再次入账后墓碑保留（它是删除的唯一记录）');
});

test('rows / wireRows / digestLine：新字段上的 v1 语义（过滤 + 同一排序）；carried 过滤', () => {
  const st = S.norm({ items: { a: { name: '现金', place: '客厅', qty: 3, src: 'api' }, b: { name: '账本', place: '书房', hidden: true, src: 'text' }, c: { name: '药', place: '书房', src: 'map' }, d: { name: '旧卷', src: 'legacy' } } });
  assert.deepEqual(S.rows(st).map(r => r.id), ['b', 'c', 'a', 'd'].sort((x, y) => ((st.items[x].place || '未归位') < (st.items[y].place || '未归位') ? -1 : 1)), '码点序：书房 < 客厅 < 未归位');
  assert.deepEqual(S.rows(st, { carried: true }).map(r => r.id), ['b', 'c']);
  assert.deepEqual(S.rows(st, { carried: false }).map(r => r.id), ['a', 'd']);
  assert.deepEqual(S.rows(st, { place: '书房', hidden: false }).map(r => r.id), ['c']);
  assert.deepEqual(S.wireRows(st)[0], { id: 'b', 名: '账本', 地点: '书房', 层: '', 暗格: true });
  assert.deepEqual(S.wireRows(st).find(r => r.id === 'a'), { id: 'a', 名: '现金', 地点: '客厅', 层: '', 暗格: false, 数量: 3 });
  assert.equal(S.digestLine(st), '随身仓与藏物：书房·暗格 账本；书房 药；客厅 现金×3；未归位 旧卷');
});

test('槽位（ledger）：slotNorm 校验 ASCII 形状；slotLine 与 slotSave 用 name / facts', () => {
  assert.equal(slotNorm(null), null); assert.equal(slotNorm({ name: '' }), null); assert.equal(slotNorm({ 名: '物品栏' }), null);
  const s = slotPut(slotDeclare(null, slotProbe({}), 3), [{ id: 'a', name: '钥匙', place: '书房' }, { id: 'b', 名: '旧写法', 地点: '客厅', floor: 5 }], 4);
  assert.deepEqual(s.facts, { a: { name: '钥匙', msgIndex: 4, place: '书房' }, b: { name: '旧写法', msgIndex: 5, place: '客厅' } }, '行里的 名 / 地点 / floor 也认');
  assert.equal(s.added, 2);
  assert.deepEqual(slotNorm(s), { name: '物品栏', path: '', virtual: true, msgIndex: 3, facts: s.facts }, 'added 不落盘');
  assert.equal(slotNorm({ name: 'n', path: '', virtual: false, msgIndex: 1.5, facts: { k: { name: 'x', msgIndex: 'y' }, q: { name: '' } } }).facts.k.msgIndex, null);
  assert.equal(slotLine(s), '[地图账本·槽位] 本卡变量没有背包字段：地图已自建槽位「物品栏」，拾取事实一律记进地图账本（现 2 件），不写变量也不会丢。');
  assert.equal(slotSave(slotDeclare(null, slotProbe({}), 3)), null, '没有事实的槽位不落空壳');
  assert.equal(slotSave(s), s);
  const many = slotPut(null, Array.from({ length: 230 }, (_, i) => ({ id: 'k' + i, name: 'n' + i })), 1);
  assert.equal(Object.keys(slotNorm(many).facts).length, 200);
  assert.deepEqual(clone(slotNorm(slotNorm(many))), clone(slotNorm(many)), '幂等');
});
