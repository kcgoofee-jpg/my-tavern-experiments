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

test('coreStage: default field uses the card stage names; 5th derived from field name', () => {
  const s = [10, 30, 50, 70, 90].map(n => coreStage(CORE_DEFAULT, n));
  assert.equal(new Set(s.slice(0, 4)).size, 4);
  assert.ok(s.slice(0, 4).every(x => x && !/^档/.test(x)));
  assert.equal(s[4], '完全' + CORE_DEFAULT.slice(0, -1) + '化');
});

const STAT = { 世界: { 当前地点: 'x' }, 主角: { 声望: 5 },
  表一: { 甲: { 身份: '园丁', 级别: 'B', 数值: 72 }, 乙: { 身份: '厨师', $meta: 1 } }, 表二: { 丙: { 身份: '商人', 进度: '二' } } };

test('rowFields: field names seen in roster rows, $-keys skipped', () => {
  assert.deepEqual(rowFields(STAT).sort(), ['数值', '进度', '级别', '身份'].sort());
  assert.deepEqual(rowFields(null), []); assert.deepEqual(rowFields({ a: 1 }), []);
});

test('detect: gradeField / coreField only when the default name appears in rows', () => {
  assert.ok(NAME_FIELDS.includes('gradeField') && NAME_FIELDS.includes('coreField'));
  let d = detect(STAT); assert.equal(d.gradeField, ''); assert.equal(d.coreField, '');
  const own = { ...STAT, 表一: { 甲: { 身份: 'a', [DEFAULT_MAP.gradeField]: 'S', [DEFAULT_MAP.coreField]: 30 } } };
  d = detect(own); assert.equal(d.gradeField, DEFAULT_MAP.gradeField); assert.equal(d.coreField, DEFAULT_MAP.coreField);
});

test('user mapping, and 「关闭」 (-) disables the field in rosters', () => {
  const m = effective({ gradeField: '级别', coreField: '数值' }, STAT);
  const r = rosters(STAT, m), a = r.members.items.find(i => i.name === '甲');
  assert.equal(a.grade, 'B'); assert.equal(a.core, 72); assert.equal(a.coreKey, '数值'); assert.equal(a.coreStage, '档 4');
  const off = rosters(STAT, effective({ gradeField: OFF, coreField: OFF }, STAT)).members.items.find(i => i.name === '甲');
  assert.equal(OFF, '-'); assert.ok(!('grade' in off) && !('core' in off) && !('coreStage' in off));
});
