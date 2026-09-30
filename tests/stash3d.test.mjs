// 三维藏物落点（Part 8-1）：map/core/stash3d.mjs —— 藏物表 → 三维坐标的纯映射、楼层 / 已拾取过滤、呼吸系数、摘要。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spots, placeOf, propGlow, describe, PROP_R, GLOW_PERIOD } from '../map/core/stash3d.mjs';
import { normStash, rowId } from '../map/core/stash.mjs';

const PLACES = [
  { id: 'study', name: '书房', alias: ['主人书房'], floor: 'F2', x: 10, y: 20, z: 6 },
  { id: 'hall', name: '大厅', floor: 'F1', x: -4, y: -8, z: 0 },
  { id: 'garden', name: '后庭', floor: null, x: 0, y: 40, z: 0, r: 2 },
];
const stash = normStash({ items: [
  { map: 'eden', marker: 'study', place: '书房', name: '机密账本' },
  { map: 'eden', marker: 'hall', place: '大厅', name: '门房登记簿' },
  { map: 'eden', marker: 'garden', place: '后庭', name: '掉落的钥匙', hidden: '花坛' },
  { map: 'eden', marker: 'nope', place: '不存在的角落', name: '认不出落点的东西' },
  { map: 'other', marker: 'study', place: '书房', name: '别的图上的东西' },
] });

test('spots：地点名 / 标记 id / 别名都能对上落点，坐标原样带出', () => {
  const s = spots(stash, { map: 'eden', places: PLACES });
  assert.deepEqual(s.map(x => x.name), ['机密账本', '门房登记簿', '掉落的钥匙']);
  assert.deepEqual(s[0], { id: s[0].id, name: '机密账本', hidden: false, place: '书房', floor: 'F2', x: 10, y: 20, z: 6, r: PROP_R });
  assert.equal(s[2].hidden, true, '暗格里的东西照旧落点（显不显示由调用方按「人就在这儿」定）');
  assert.equal(s[2].r, 2, '落点自带半径就用地点的');
  assert.equal(s[0].id, rowId({ map: 'eden', marker: 'study', place: '书房', name: '机密账本' }), 'id 与 core/stash.mjs 同一个口径');
});

test('spots：认不出落点 / 别的图 / 已到手 → 不落点', () => {
  assert.equal(spots(stash, { map: 'eden', places: PLACES }).length, 3, '认不出落点的那一行丢掉');
  assert.equal(spots(stash, { places: PLACES }).length, 4, '不限图：别的图上的东西也落点（地图维度由调用方挑）');
  const taken = new Set([spots(stash, { map: 'eden', places: PLACES })[0].id]);
  assert.equal(spots(stash, { map: 'eden', places: PLACES, taken }).length, 2, '拿到手的不重复画');
  assert.equal(spots(stash, { map: 'eden', places: PLACES, taken: () => true }).length, 0, 'taken 也收函数');
});

test('spots：楼层过滤（切到哪层就画哪层；室外 floor = null 只在不限层时出现）', () => {
  assert.deepEqual(spots(stash, { map: 'eden', places: PLACES, floor: 'F2' }).map(x => x.name), ['机密账本']);
  assert.deepEqual(spots(stash, { map: 'eden', places: PLACES, floor: 'F1' }).map(x => x.name), ['门房登记簿']);
  assert.deepEqual(spots(stash, { map: 'eden', places: PLACES, floor: null }).map(x => x.name), ['掉落的钥匙']);
  assert.equal(spots(stash, { map: 'eden', places: PLACES, floor: 'F3' }).length, 0);
});

test('spots：名字归一——括注 / 大小写 / 空白都不影响对账', () => {
  const st = normStash({ items: [{ map: 'eden', place: '主卧（套间）', name: '夹层的信' }] });
  const pl = [{ id: 'mbr', name: '主卧', floor: 'F2', x: 1, y: 2, z: 3 }];
  assert.equal(spots(st, { map: 'eden', places: pl }).length, 1, '「主卧（套间）」对上「主卧」');
  const pl2 = [{ id: 'mbr', name: '书房', alias: [' 主 卧 '], floor: 'F2', x: 1, y: 2, z: 3 }];
  assert.equal(spots(st, { map: 'eden', places: pl2 }).length, 1, '别名去掉空白也算');
});

test('spots：坏输入不抛（没落点表 / 落点缺坐标 / 藏物表是乱的）', () => {
  assert.deepEqual(spots(null, { places: PLACES }), []);
  assert.deepEqual(spots(stash, { map: 'eden', places: null }), []);
  assert.deepEqual(spots(stash, { map: 'eden', places: [{ name: '空坐标' }, null, { name: 'x', x: 0, y: 0, z: 0 }] }), []);
  assert.deepEqual(spots({ items: '不是数组' }, { places: PLACES }), []);
});

test('placeOf：落点表 × 地点名（三维页给 NPC 找站位用同一套对账）', () => {
  assert.deepEqual(placeOf(PLACES, '书房'), PLACES[0]);
  assert.deepEqual(placeOf(PLACES, 'study'), PLACES[0], 'id 也算');
  assert.deepEqual(placeOf(PLACES, '主人书房'), PLACES[0], '别名也算');
  assert.deepEqual(placeOf(PLACES, ' 书 房 '), PLACES[0], '空白 / 括注归一');
  assert.equal(placeOf(PLACES, '不在表上'), null);
  assert.equal(placeOf(PLACES, null), null);
  assert.equal(placeOf(null, '书房'), null);
  assert.equal(placeOf([{ name: 'x' }], 'x'), null, '缺坐标的落点不算（可选：调用方自己保证）');
});

test('propGlow：0–1 的呼吸，周期与二维发光点同频，乱值不炸', () => {
  assert.equal(propGlow(0), 0.5);
  assert.ok(Math.abs(propGlow(GLOW_PERIOD / 4) - 1) < 1e-9, '四分之一周期到最亮');
  assert.ok(propGlow(1) >= 0 && propGlow(1) <= 1);
  assert.ok(propGlow(-3) >= 0 && propGlow(-3) <= 1);
  assert.equal(propGlow(null), 0.5);
  assert.equal(GLOW_PERIOD, 2.4);
});

test('describe：{ total, hidden, floors }，乱输入 = 空账', () => {
  assert.deepEqual(describe(spots(stash, { map: 'eden', places: PLACES })), { total: 3, hidden: 1, floors: ['F1', 'F2', null].sort() });
  assert.deepEqual(describe(null), { total: 0, hidden: 0, floors: [] });
  assert.deepEqual(describe([{ hidden: true, floor: 'F1' }]), { total: 1, hidden: 1, floors: ['F1'] });
});

test('纯度：不碰 DOM / 存储 / 酒馆全局，也不反向 import 上层', () => {
  const src = readFileSync(new URL('../map/core/stash3d.mjs', import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
  for (const g of ['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'Mvu', 'SillyTavern']) {
    assert.ok(!new RegExp(`\\b${g}\\b`).test(src), `不该出现 ${g}`);
  }
  assert.ok(!/from\s+['"]\.\./.test(src), 'core 是纯叶层，不许回引上层目录');
});
