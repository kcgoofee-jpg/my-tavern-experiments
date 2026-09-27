// node tests/custom095.test.mjs —— v0.9.5「自定义」面板：同步到世界书默认开 + 旧数据迁移、来源（手动 / 剧情标签）、选择器分组 / 搜索、飞行目标、表单校验
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as V from '../map/tavern/mvu.mjs';
import * as P from '../map/tavern/picker.mjs';
import * as plan from '../map/estate/plan.js';

const REG = JSON.parse(fs.readFileSync(new URL('../map/data/maps.json', import.meta.url), 'utf8'));
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

t('同步到世界书：没动过开关 = 开；自己关过的保持关；打开过的保持开', () => {
  assert.equal(V.normCustom(undefined).同步世界书, true);
  assert.equal(V.normCustom({ items: {} }).同步世界书, true);
  assert.equal(V.normCustom({ 同步世界书: false }).同步世界书, true);            // 0.9.3 写进去的默认 false，没动过
  assert.equal(V.normCustom({ 同步世界书: false, 同步手动: true }).同步世界书, false);
  assert.equal(V.normCustom({ 同步世界书: true, 同步手动: true }).同步世界书, true);
  assert.equal(V.normCustom({ 同步世界书: true }).同步世界书, true);
});
t('0.9.3 → 0.9.5 迁移：建过那本世界书（说明打开后又关掉）→ 记成手动关', () => {
  const old = { items: {}, 同步世界书: false };
  assert.equal(V.normCustom(V.syncMigrate(old, true)).同步世界书, false);
  assert.equal(V.normCustom(V.syncMigrate(old, false)).同步世界书, true);
  assert.equal(V.syncMigrate({ 同步世界书: true }, true).同步手动, undefined);
  assert.equal(V.syncMigrate(null, true), null);
});
t('来源：剧情标签 → 标签；手动编辑 → 手动；外部 setCustom 不写来源', () => {
  let c = V.applyTags({}, [{ floor: 3, text: '⌖改名 书房 → 观星室' }], 0, () => 'room').custom;
  assert.equal(c.items.书房.源, '标签');
  c = V.setCustom(c, '书房', { note: '夜里看星图', source: 'manual' }); assert.equal(c.items.书房.源, '手动');
  c = V.setCustom(c, '餐厅', { name: '长桌厅' }); assert.equal(c.items.餐厅.源, undefined);
  assert.equal(V.normCustom({ items: { a: { 名: 'b', 源: '别的' } } }).items.a.源, undefined);
});
const G = P.buildGroups({ reg: REG, plan, chars: ['米拉', '卡尔'] });
t('选择器分组：上 / 中 / 下层地标 → 庄园按楼层 → B1 / 其他 → 室外 → 人物', () => {
  const ids = G.map(g => g.id);
  assert.deepEqual(ids.slice(0, 3), ['lm:tc_upper', 'lm:tc_mid', 'lm:tc_low']);
  assert.ok(ids.includes('room:F1') && ids.includes('room:F2') && ids.includes('room:F3'));
  assert.ok(ids.indexOf('room:F1') < ids.indexOf('room:other') && ids.indexOf('room:other') < ids.indexOf('area:eden_estate'));
  assert.equal(ids.at(-1), 'char');
  assert.match(G.find(g => g.id === 'room:F1').label, /^伊甸庄园 · 1F/);
  assert.ok(G.find(g => g.id === 'room:other').items.some(i => i.key === '酒窖'));
});
t('选择器：同一间房的多个叫法只列一个（其余当搜索别名），不重复', () => {
  const keys = G.flatMap(g => g.items.map(i => i.key));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('大厅') && !keys.includes('门厅') && !keys.includes('玄关'));
  const hall = P.findItem(G, '大厅'); assert.ok(hall.alias.includes('门厅')); assert.deepEqual(hall.target, { map: 'eden_estate', room: '大厅' });
  const mk = P.findItem(G, '天城执法局总局'); assert.deepEqual(mk.target, { map: 'tc_mid', marker: 'enforcement_hq' }); assert.equal(mk.kind, 'landmark');
  assert.deepEqual(P.findItem(G, '米拉').target, { character: '米拉' });
  assert.equal(P.findItem(G, '前庭').kind, 'area');
});
t('英文分组名', () => {
  const E = P.buildGroups({ reg: REG, plan, lang: 'en' });
  assert.equal(E[0].label, 'Upper tier · landmarks'); assert.match(E.find(g => g.id === 'room:F1').label, /^Eden Manor · 1F/);
});
t('没有 plan.js（庄园页没取到）：房间整组列在「其他」里', () => {
  const g = P.buildGroups({ reg: REG }); assert.ok(g.find(x => x.id === 'room:other').items.length >= 40);   // v0.9.7：只剩卡房间名 + 卡里的写法 + 通用叫法
});
t('搜索：标准名、别名、英文名、显示名、用途都认；空串原样', () => {
  const c = V.setCustom({}, '书房', { name: '星图室', note: '整理旧地图' });
  const k = q => P.filterGroups(G, q, c).flatMap(g => g.items.map(i => i.key));
  assert.ok(k('星图').includes('书房')); assert.ok(k('旧地图').includes('书房')); assert.ok(k('门厅').includes('大厅'));
  assert.ok(k('enforcement').includes('天城执法局总局')); assert.ok(k('  执法局 ').includes('天城执法局总局'));
  assert.deepEqual(k('不存在的词'), []);
  const b = P.filterGroups(G, '书房', c); assert.equal(b[0].id, 'best'); assert.equal(b[0].items[0].key, '书房'); assert.equal(P.filterGroups(G, '', c), G);
});
t('飞行目标：只留认识的字段；地标要有 map', () => {
  assert.deepEqual(P.normTarget({ map: 'tc_mid', marker: 'x', junk: 1 }), { map: 'tc_mid', marker: 'x' });
  assert.equal(P.normTarget({ marker: 'x' }), null);
  assert.deepEqual(P.normTarget({ room: ' 书房 ' }), { room: '书房' });
  assert.deepEqual(P.normTarget({ character: '米拉' }), { character: '米拉' });
  assert.equal(P.normTarget(null), null); assert.equal(P.normTarget({ map: 'tc_mid' }), null); assert.equal(P.normTarget({ room: 3 }), null);
});
t('表单校验：重名、太长、都空', () => {
  const c = V.setCustom({}, '书房', { name: '星图室' }), keys = G.flatMap(g => g.items.map(i => i.key));
  assert.equal(P.validate({ key: '餐厅', name: '星图室', custom: c, keys }).name, 'dup_name');
  assert.equal(P.validate({ key: '餐厅', name: '大厅', custom: c, keys }).name, 'dup_std');
  assert.equal(P.validate({ key: '书房', name: '星图室', custom: c, keys }).ok, true);
  assert.equal(P.validate({ key: '餐厅', name: 'x'.repeat(41), keys }).name, 'too_long');
  assert.equal(P.validate({ key: '餐厅', note: '字'.repeat(201), keys }).note, 'too_long');
  assert.equal(P.validate({ key: '餐厅', note: '字'.repeat(200), keys }).ok, true);
  assert.equal(P.validate({ key: '餐厅', name: ' ', note: '', keys }).name, 'empty');
  assert.equal(P.validate({ key: '餐厅', name: '餐厅', keys }).name, 'empty');
});
t('改名保留旧显示名为旧叫法；{{user}} 宏不露出', () => {
  let c = V.setCustom({}, '书房', { name: '星图室' }); c = V.setCustom(c, '书房', { name: '观星室' });
  assert.deepEqual(c.items.书房.别名, ['星图室']); assert.equal(V.findKey(c, '星图室'), '书房');
  assert.ok(!P.buildGroups({ reg: REG }).some(g => g.items.some(i => /\{\{user\}\}/.test(i.sub))));
});
console.log(`${n} passed`);
