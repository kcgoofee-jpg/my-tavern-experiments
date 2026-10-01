// v0.9.6 E2 / E13：名册行内「等级 / 核心数值」——coreStage 5 档阈值、adapter 的 gradeField / coreField 自动发现、「关闭」('-')、rowFields()
import test from 'node:test';
import assert from 'node:assert/strict';
import { rosters } from '../map/tavern/mvu-readers.mjs';
import { detect, effective, rowFields, defaults, NAME_FIELDS, OFF } from '../map/tavern/stat-path-mapping.mjs';
import { useEden } from './helpers/eden-profile.mjs';
useEden();   // the first pack's variable and roster declarations (its overlay blocks); the engine itself names no card

// Core value bands come from the pack's gauge field (docs/kernel-schema.md K-R42): the cuts are the ladder's `up_to`; its own field shows the pack's band names, any other field 档 n.
const rowOf = (field, n) => rosters({ 世界: {}, 主角: {}, 表: { 甲: { 身份: 'x', [field]: n } } }, { coreField: field }).members.items[0];
test('core bands: thresholds ≤20 / ≤40 / ≤60 / ≤80 / ≤100; another field is 档 n', () => {
  for (const [n, k] of [[0, 1], [20, 1], [20.01, 2], [40, 2], [41, 3], [60, 3], [61, 4], [80, 4], [81, 5], [100, 5]]) assert.equal(rowOf('X值', n).coreStage, `档 ${k}`, String(n));
  assert.equal(rowOf('X值', '50').core, 50, 'a numeric string counts'); assert.equal(rowOf('X值', 'abc').core, undefined);
  assert.equal(rowOf('X值', 150).core, 100, 'the gauge clamps to max'); assert.equal(rowOf('X值', -5).coreStage, '档 1');
});

test('core bands: the pack\'s own field uses the pack\'s band names (verbatim)', () => {
  const own = defaults().coreField;
  assert.equal(own, '母畜值');
  assert.deepEqual([10, 30, 50, 70, 90, 120].map(n => rowOf(own, n).coreStage), ['抗拒期', '动摇期', '接受期', '沉溺期', '完全母畜化', '完全母畜化']);
  assert.equal(rowOf('园艺值', 50).coreStage, '档 3');
});

const STAT = { 世界: { 当前地点: 'x' }, 主角: { 声望: 5 },
  表一: { 甲: { 身份: '园丁', 级别: 'B', 数值: 72 }, 乙: { 身份: '厨师', $meta: 1 } }, 表二: { 丙: { 身份: '商人', 进度: '二' } } };

test('rowFields: field names seen in roster rows, $-keys skipped', () => {
  assert.deepEqual(rowFields(STAT).sort(), ['数值', '进度', '级别', '身份'].sort());
  assert.deepEqual(rowFields(null), []); assert.deepEqual(rowFields({ a: 1 }), []);
});

test('detect: gradeField / coreField default to the card field names, else found by field-name shape', () => {
  assert.ok(NAME_FIELDS.includes('gradeField') && NAME_FIELDS.includes('coreField'));
  const D = defaults(); assert.equal(D.gradeField, '母畜等级'); assert.equal(D.coreField, '母畜值'); assert.equal(D.codeField, '母畜代号');
  let d = detect(STAT); assert.equal(d.gradeField, ''); assert.equal(d.coreField, '');   // 「级别」「数值」太泛，不自动认
  const own = { ...STAT, 表一: { 甲: { 身份: 'a', 园丁等级: 'S', 园艺值: 30, 身高: 170 } } };
  d = detect(own); assert.equal(d.gradeField, '园丁等级'); assert.equal(d.coreField, '园艺值');
});

test('user mapping, and 「关闭」 (-) disables the field in rosters', () => {
  const m = effective({ gradeField: '级别', coreField: '数值' }, STAT);
  const r = rosters(STAT, m), a = r.members.items.find(i => i.name === '甲');
  assert.equal(a.grade, 'B'); assert.equal(a.core, 72); assert.equal(a.coreKey, '数值'); assert.equal(a.coreStage, '档 4');
  const off = rosters(STAT, effective({ gradeField: OFF, coreField: OFF }, STAT)).members.items.find(i => i.name === '甲');
  assert.equal(OFF, '-'); assert.ok(!('grade' in off) && !('core' in off) && !('coreStage' in off));
});
