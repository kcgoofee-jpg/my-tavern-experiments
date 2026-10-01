// 空间化背包（Part 5-1）node 单测：norm / put / remove / rows / digestLine 的纯数据行为，
// 与协议形状（eden-map:inv 在 SCHEMA 里、载荷过 check）。S6-2：统一背包（ASCII 键、src / carried / msgIndex），断言一一对应旧版。
import test from 'node:test';
import assert from 'node:assert/strict';
import { norm, put, remove, rows, findRow, digestLine } from '../map/tavern/stash-store.mjs';
import { SCHEMA, check } from '../map/core/protocol.mjs';

test('norm：坏数据丢弃、字段裁剪、数量收敛、seq 推断', () => {
  assert.deepEqual(norm(null), { v: 1, items: {}, seq: 0, slot: null, removed: {}, since: null, upTo: null });
  assert.deepEqual(norm({ items: { a: { name: '账本', place: '书房', hidden: 1, qty: 3, note: 'x' }, b: { place: '没名字' }, c: '垃圾' } }), {
    v: 1, items: { a: { name: '账本', place: '书房', map: '', node: '', hidden: true, note: 'x', qty: 3, src: 'legacy', carried: false, msgIndex: null } }, seq: 1,
    slot: null, removed: {}, since: null, upTo: null,
  });
  const big = norm({ items: { i26: { name: 'x'.repeat(99), qty: 5000 } } });
  assert.equal(big.items.i26.name.length, 60);
  assert.equal(big.items.i26.qty, 999);
  assert.equal(big.items.i26.hidden, false);
  assert.equal(big.seq, 26, 'seq = max(显式, 最大 i 后缀)');
});

test('put：新增自动编号、按 id / 名更新、空字段不动旧值、没有名字不动', () => {
  let inv = norm(null);
  let r = put(inv, { name: '机密账本', place: '书房', map: 'estate', hidden: true, note: '书架第三层' });
  assert.equal(r.changed, true);
  inv = r.stash;
  const [id] = Object.keys(inv.items);
  assert.equal(id, 'i1');
  r = put(inv, { name: '机密账本', place: '客厅' });   // 按名更新：只改地点，暗格 / 说明保留
  inv = r.stash;
  assert.deepEqual(inv.items.i1, { name: '机密账本', place: '客厅', map: 'estate', node: '', hidden: true, note: '书架第三层', src: 'api', carried: false, msgIndex: null });
  r = put(inv, { id: 'i9', name: '现金', place: '保险柜', qty: 3 });
  inv = r.stash;
  assert.ok(inv.items.i9 && inv.items.i9.qty === 3, 'id 不存在 = 新增（用给定的 id）');
  assert.equal(inv.seq, 9);
  r = put(inv, {}); r = put(inv, { name: '  ' });
  assert.equal(r.changed, false, '没有有效名字：不写入');
  r = put(inv, { name: '现金' });   // 按名更新，place 缺省 = 不动
  assert.equal(r.stash.items.i9.place, '保险柜');
});

test('remove / findRow：按 id 或名字；不存在 = changed false', () => {
  let inv = norm({ items: { i1: { name: '账本', place: '书房' } } });
  assert.equal(findRow(inv, 'i1')[0], 'i1');
  assert.equal(findRow(inv, '账本')[0], 'i1');
  assert.equal(findRow(inv, '账本'.toUpperCase())[0], 'i1', '英文名大小写不敏感');
  assert.equal(findRow(inv, '没有'), null);
  const r = remove(inv, '账本');
  assert.equal(r.changed, true);
  assert.deepEqual(r.stash.items, {});
  assert.equal(remove(inv, '没有').changed, false);
});

test('rows：过滤 + 排序（地点 → 名）', () => {
  const inv = norm({ items: { i2: { name: '现金', place: '客厅' }, i1: { name: '账本', place: '书房', hidden: true }, i3: { name: '药', place: '书房' } } });
  assert.deepEqual(rows(inv, { place: '书房' }).map(r => r.id), ['i1', 'i3']);
  assert.deepEqual(rows(inv, { hidden: true }).map(r => r.id), ['i1']);
  assert.deepEqual(rows(inv, { name: '现' }).map(r => r.id), ['i2']);
  assert.deepEqual(rows(inv, { map: 'estate' }), [], '层过滤：没写层的都滤掉');
});

test('digestLine：按地点归组、空仓空串、超长截断', () => {
  const inv = norm({ items: { i1: { name: '机密账本', place: '书房', hidden: true }, i2: { name: '现金', place: '客厅', qty: 3 }, i3: { name: '旧卷·残页' } } });
  const line = digestLine(inv);
  assert.ok(line.startsWith('随身仓与藏物：'), line);
  assert.ok(line.includes('书房·暗格 机密账本'), line);
  assert.ok(line.includes('客厅 现金×3'), line);
  assert.ok(line.includes('未归位 旧卷·残页'), line);
  assert.equal(digestLine(norm(null)), '');
  assert.ok(digestLine(inv, 30).length <= 30);
});

test('协议：eden-map:inv 在 SCHEMA 且载荷过 check；缺省 items 可空；新字段 stash / card（K-R74、K-R76）', () => {
  assert.ok(SCHEMA['eden-map:inv']);
  assert.equal(check({ type: 'eden-map:inv', v: 2, items: [] }).ok, true);
  assert.equal(check({ type: 'eden-map:inv', v: 2 }).ok, true, 'items 可缺（宿主模块没到时发空推）');
  assert.equal(check({ type: 'eden-map:inv', v: 2, items: 'x' }).ok, false);
  assert.equal(check({ type: 'eden-map:inv', v: 2, items: [], stash: { v: 1, rows: [], slot: null }, card: { path: 'a', rows: [] } }).ok, true, '新字段都带上');
  assert.equal(check({ type: 'eden-map:inv', v: 2, items: [], card: null }).ok, true, 'card 为 null = 没读到卡的物品表');
});
