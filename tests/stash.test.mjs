// 世界藏物表（Part 5-1 第二步）node 单测：规范化 / 过滤 / 难度与检定 / 交给背包的具名行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { normStash, rows, dcOf, search, glow, lootPut, rowId, DC_DEFAULT, DC_HIDDEN_BONUS } from '../map/core/stash.mjs';

const RAW = {
  items: [
    { map: 'tc_mid', marker: 'enforcement_hq', place: '天城执法局总局', name: '值班表副本', hidden: '值班柜夹层', note: '夹在值班登记本里', dc: 11 },
    { map: 'tc_mid', marker: 'old_apartment', place: '旧公寓楼', name: '欠租账册' },
    { map: '', marker: 'well7', name: '没写地点：拿标记当局点' },
    { name: '没有地图也没有标记' },
    '垃圾行',
    { map: 'tc_mid', marker: 'x', name: '', },
  ],
};

test('normStash：坏行丢弃、字段裁剪、缺省 id 按内容混出（稳定可复现）', () => {
  const s = normStash(RAW);
  assert.deepEqual(s.items.map(r => r.name), ['值班表副本', '欠租账册', '没写地点：拿标记当局点', '没有地图也没有标记']);
  const [a, b, c] = s.items;
  assert.equal(a.dc, 11);
  assert.equal(b.dc, DC_DEFAULT, '没写 dc = 默认难度');
  assert.equal(c.place, 'well7', '没写地点：退回标记 id');
  assert.match(a.id, /^s[0-9a-z]+$/, '自动 id 是 ASCII');
  assert.equal(a.id, rowId(a), 'id = fnv(map|marker|place|name)，重算不变');
  assert.equal(normStash(null).items.length, 0);
  assert.equal(normStash({ items: [] }).items.length, 0);
});

test('normStash：难度与数量收敛（1..30 / 2..999，1 不写）', () => {
  const s = normStash({ items: [{ name: 'a', dc: 999 }, { name: 'b', dc: -5 }, { name: 'c', qty: 5000 }, { name: 'd', qty: 1 }, { name: 'e', qty: 2 }] });
  assert.deepEqual(s.items.map(r => r.dc), [30, 1, DC_DEFAULT, DC_DEFAULT, DC_DEFAULT]);
  assert.equal(s.items[2].qty, 999);
  assert.equal('qty' in s.items[3], false, '数量 1 = 不写（等于默认）');
  assert.equal(s.items[4].qty, 2);
});

test('rows：按图 / 地点 / 标记 / 暗格过滤；没写图的行任意图都算', () => {
  const s = normStash(RAW);
  assert.equal(rows(s, { map: 'tc_mid' }).length, 4, '两张中层 + 两行没写图');
  assert.deepEqual(rows(s, { map: 'tc_mid', place: '天城执法局总局' }).map(r => r.name), ['值班表副本']);
  assert.deepEqual(rows(s, { marker: 'old_apartment' }).map(r => r.name), ['欠租账册'], '标记 id 也能比');
  assert.deepEqual(rows(s, { map: 'tc_mid', hidden: true }).map(r => r.name), ['值班表副本']);
  assert.deepEqual(rows(s, { map: 'tc_mid', hidden: false }).map(r => r.name), ['欠租账册', '没写地点：拿标记当局点', '没有地图也没有标记']);
  assert.equal(rows(s, { map: 'world' }).length, 2, '别的图只剩没写图那两行');
});

test('rows：已到手的排除（Set / 数组 / 谓词三种写法）', () => {
  const s = normStash(RAW);
  const id = s.items[0].id;
  assert.equal(rows(s, { taken: new Set([id]) }).length, 3);
  assert.equal(rows(s, { taken: [id] }).length, 3);
  assert.equal(rows(s, { taken: x => x === id }).length, 3);
  assert.equal(rows(s, { taken: '不是什么合法的写法' }).length, 4, '认不出的 taken 一律不删项');
});

test('dcOf / search：暗格 +3；d20 夹 1–20；边界刚好过线', () => {
  const open = { name: 'x', dc: 10 }, hid = { name: 'x', dc: 10, hidden: '柜后' };
  assert.equal(dcOf(open), 10);
  assert.equal(dcOf(hid), 10 + DC_HIDDEN_BONUS);
  assert.equal(search(open, 10).found, true, '正好等于 DC = 找到');
  assert.equal(search(open, 9).found, false);
  assert.equal(search(open, 9, 1).found, true, '加值算进去');
  assert.deepEqual(search(open, 100), { found: true, roll: 20, mod: 0, dc: 10, margin: 10 }, 'roll 夹到 20');
  assert.deepEqual(search(open, -100, -3), { found: false, roll: 1, mod: -3, dc: 10, margin: -12 }, 'roll 夹到 1');
  assert.equal(search(open, NaN).roll, 1, '乱数当 0 → 夹到 1');
});

test('glow：0–1 之间、周期端点回到起点', () => {
  assert.ok(glow(0) >= 0 && glow(0) <= 1);
  assert.ok(Math.abs(glow(0.6, 2.4) - 1) < 1e-9, '四分之一周期 = 峰值');
  assert.ok(Math.abs(glow(2.4, 2.4) - glow(0, 2.4)) < 1e-9, '一个周期回到原值');
  assert.ok(Number.isNaN(glow(undefined, 0)) === false, '周期 0 不许出 NaN');
});

test('lootPut：id 原样带上、暗格写进说明、数量缺省 1', () => {
  const r = normStash(RAW).items[0];
  assert.deepEqual(lootPut(r), {
    id: r.id, name: '值班表副本', place: '天城执法局总局', map: 'tc_mid', hidden: true,
    note: '藏在值班柜夹层：夹在值班登记本里', qty: 1,
  });
  assert.deepEqual(lootPut(normStash(RAW).items[1]).note, undefined, '没有暗格也没有备注：不带 note');
});
