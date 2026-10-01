// v0.9.6 E13 其余字段：人物卡「更多资料」——adapter 的行内字段映射（默认名 / 按名自动找 / 关闭）与 mvu.rosters 的 more
import test from 'node:test';
import assert from 'node:assert/strict';
import { detect, effective, defaults, MORE_FIELDS, NAME_FIELDS, OFF } from '../map/tavern/stat-path-mapping.mjs';
import { useEden } from './helpers/eden-profile.mjs';
useEden();   // the first pack's variable and roster declarations (its overlay blocks); the engine itself names no card
import { rosters } from '../map/tavern/mvu-readers.mjs';

const CARD = { 世界: { 当前地点: 'x' }, 主角: {}, 表一: { 甲: { 社会身份: '讲师', 园丁代号: '青鸟', 身高: 168, 体重: 52, 外界知情: false, 项圈: '银链' } } };
const OTHER = { 世界: {}, 主角: {}, 名册: { 乙: { 身份: '园丁', 代号: 'K', height: '170', 饰物: '胸针' } } };

test('默认字段名在行里就用它', () => {
  assert.ok(MORE_FIELDS.every(f => NAME_FIELDS.includes(f) && (defaults()[f] || f === 'codeField')));   // v0.9.7：代号字段不写死卡原文，按「…代号」自动找
  const d = detect(CARD);
  assert.deepEqual(MORE_FIELDS.map(f => d[f]), ['园丁代号', '社会身份', '身高', '体重', '外界知情', '项圈']);
  const it = rosters(CARD, d).members.items[0];
  assert.deepEqual(it.more, { code: '青鸟', social: '讲师', height: 168, weight: 52, known: false, accessory: '银链' });
});

test('别的卡：按字段名自动找；没有的留空', () => {
  const d = detect(OTHER);
  assert.equal(d.codeField, '代号'); assert.equal(d.heightField, 'height'); assert.equal(d.accessoryField, '饰物'); assert.equal(d.weightField, '');
  assert.deepEqual(rosters(OTHER, d).members.items[0].more, { code: 'K', social: '园丁', height: '170', accessory: '胸针' });   // v0.9.7：兜底正则补「身份」（naming_model_compat P0疑似②），名册「身份」也映射社会身份列
});

test('关闭（-）不读；全关没有 more', () => {
  const off = Object.fromEntries(MORE_FIELDS.map(f => [f, OFF]));
  const it = rosters(CARD, effective(off, CARD)).members.items[0];
  assert.equal(it.more, undefined);
  const one = rosters(CARD, effective({ codeField: OFF }, CARD)).members.items[0];
  assert.equal(one.more.code, undefined); assert.equal(one.more.social, '讲师');
});

// The combat tier is the pack's ladder field (scan: every text value of the row; a field named in the mapping: the ladder's words, else a short raw text).
const tierOf = (row, map = {}) => rosters({ 世界: {}, 主角: {}, 表: { 甲: row } }, map).members.items[0].tier;
test('E1 战力小签：只认卡里写明的，不编造', () => {
  assert.equal(tierOf({ 身份: '超凡三阶' }), '超凡 3 阶'); assert.equal(tierOf({ 身份: '超凡 5 阶' }), '超凡 5 阶'); assert.equal(tierOf({ 身份: '天灾级' }), '天灾级');
  assert.equal(tierOf({ 身份: '一个普通人家的孩子' }), undefined); assert.equal(tierOf({ 身份: '教授' }), undefined);
  assert.equal(tierOf({ 身份: '骑士团战斗修女，代号「天灾」' }), undefined, 'a codename that holds the word is not a tier'); assert.equal(tierOf({ 身份: '天灾级战力' }), '天灾级');
  assert.equal(tierOf({ 身份: '园丁' }), undefined);
  assert.equal(tierOf({ 战力: '普通人' }, { tierField: '战力' }), '普通人');
  assert.equal(tierOf({ 身份: '超凡四阶影卫' }, { tierField: '-' }), undefined);
  const st = { 世界: {}, 主角: {}, 表: { 甲: { 战力: '超凡二阶' } } }, d = detect(st);
  assert.equal(d.tierField, '战力');
  assert.equal(rosters(st, d).members.items[0].tier, '超凡 2 阶');
  assert.equal(rosters(CARD, detect(CARD)).members.items[0].tier, undefined);
});
