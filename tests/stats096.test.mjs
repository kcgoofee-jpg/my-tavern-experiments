// v0.9.6 E2 / E13：名册行内「等级 / 核心数值」——coreStage 5 档阈值、adapter 的 gradeField / coreField 自动发现、「关闭」('-')、rowFields()
import test from 'node:test';
import assert from 'node:assert/strict';
import { coreStage, CORE_CUTS, CORE_DEFAULT, rosters } from '../map/tavern/mvu.mjs';
import { detect, effective, rowFields, NAME_FIELDS, OFF, DEFAULT_MAP } from '../map/tavern/adapter.mjs';

test('coreStage: thresholds ≤20 / ≤40 / ≤60 / ≤80 / ≤100', () => {
  assert.deepEqual(CORE_CUTS, [20, 40, 60, 80, 100]);
  const f = 'X值';   // 非默认字段：一律「档 n」
  for (const [n, k] of [[0, 1], [20, 1], [20.01, 2], [40, 2], [41, 3], [60, 3], [61, 4], [80, 4], [81, 5], [100, 5], [150, 5], [-5, 1]]) assert.equal(coreStage(f, n), `档 ${k}`, String(n));
  assert.equal(coreStage(f, NaN), ''); assert.equal(coreStage(f, '50'), '');
});

test('coreStage: the card\'s default field uses the card\'s own stage names (verbatim), other fields 档 n', () => {
  assert.equal(CORE_DEFAULT, DEFAULT_MAP.coreField);
  assert.deepEqual([10, 30, 50, 70, 90, 120].map(n => coreStage(CORE_DEFAULT, n)), ['抗拒期', '动摇期', '接受期', '沉溺期', '完全母畜化', '完全母畜化']);
  assert.equal(coreStage('园艺值', 50), '档 3');
});

const STAT = { 世界: { 当前地点: 'x' }, 主角: { 声望: 5 },
  表一: { 甲: { 身份: '园丁', 级别: 'B', 数值: 72 }, 乙: { 身份: '厨师', $meta: 1 } }, 表二: { 丙: { 身份: '商人', 进度: '二' } } };

test('rowFields: field names seen in roster rows, $-keys skipped', () => {
  assert.deepEqual(rowFields(STAT).sort(), ['数值', '进度', '级别', '身份'].sort());
  assert.deepEqual(rowFields(null), []); assert.deepEqual(rowFields({ a: 1 }), []);
});

test('detect: gradeField / coreField default to the card field names, else found by field-name shape', () => {
  assert.ok(NAME_FIELDS.includes('gradeField') && NAME_FIELDS.includes('coreField'));
  assert.equal(DEFAULT_MAP.gradeField, '母畜等级'); assert.equal(DEFAULT_MAP.coreField, '母畜值'); assert.equal(DEFAULT_MAP.codeField, '母畜代号');
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
