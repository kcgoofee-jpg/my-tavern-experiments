// v0.9.6 E13 其余字段：人物卡「更多资料」——adapter 的行内字段映射（默认名 / 按名自动找 / 关闭）与 mvu.rosters 的 more
import test from 'node:test';
import assert from 'node:assert/strict';
import { detect, effective, MORE_FIELDS, NAME_FIELDS, DEFAULT_MAP, OFF } from '../map/tavern/adapter.mjs';
import { rosters } from '../map/tavern/mvu.mjs';

const CARD = { 世界: { 当前地点: 'x' }, 主角: {}, 表一: { 甲: { 社会身份: '讲师', 母畜代号: '青鸟', 身高: 168, 体重: 52, 外界知情: false, 项圈: '银链' } } };
const OTHER = { 世界: {}, 主角: {}, 名册: { 乙: { 身份: '园丁', 代号: 'K', height: '170', 饰物: '胸针' } } };

test('默认字段名在行里就用它', () => {
  assert.ok(MORE_FIELDS.every(f => NAME_FIELDS.includes(f) && DEFAULT_MAP[f]));
  const d = detect(CARD);
  assert.deepEqual(MORE_FIELDS.map(f => d[f]), ['母畜代号', '社会身份', '身高', '体重', '外界知情', '项圈']);
  const it = rosters(CARD, d).members.items[0];
  assert.deepEqual(it.more, { code: '青鸟', social: '讲师', height: 168, weight: 52, known: false, accessory: '银链' });
});

test('别的卡：按字段名自动找；没有的留空', () => {
  const d = detect(OTHER);
  assert.equal(d.codeField, '代号'); assert.equal(d.heightField, 'height'); assert.equal(d.accessoryField, '饰物'); assert.equal(d.weightField, '');
  assert.deepEqual(rosters(OTHER, d).members.items[0].more, { code: 'K', height: '170', accessory: '胸针' });
});

test('关闭（-）不读；全关没有 more', () => {
  const off = Object.fromEntries(MORE_FIELDS.map(f => [f, OFF]));
  const it = rosters(CARD, effective(off, CARD)).members.items[0];
  assert.equal(it.more, undefined);
  const one = rosters(CARD, effective({ codeField: OFF }, CARD)).members.items[0];
  assert.equal(one.more.code, undefined); assert.equal(one.more.social, '讲师');
});
