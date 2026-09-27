// v0.9.6 E2 / E13：名册行内「等级 / 核心数值」——coreStage 5 档阈值、adapter 的 gradeField / coreField 自动发现、「关闭」('-')、rowFields()
import test from 'node:test';
import assert from 'node:assert/strict';
import { coreStage, CORE_CUTS, rosters } from '../map/tavern/mvu.mjs';
import { findCoreCategories } from '../map/card-bind.mjs';
import { detect, effective, rowFields, NAME_FIELDS, OFF, DEFAULT_MAP } from '../map/tavern/adapter.mjs';

test('coreStage: thresholds ≤20 / ≤40 / ≤60 / ≤80 / ≤100', () => {
  assert.deepEqual(CORE_CUTS, [20, 40, 60, 80, 100]);
  const f = 'X值';   // 非默认字段：一律「档 n」
  for (const [n, k] of [[0, 1], [20, 1], [20.01, 2], [40, 2], [41, 3], [60, 3], [61, 4], [80, 4], [81, 5], [100, 5], [150, 5], [-5, 1]]) assert.equal(coreStage(f, n), `档 ${k}`, String(n));
  assert.equal(coreStage(f, NaN), ''); assert.equal(coreStage(f, '50'), '');
});

test('coreStage: names come from the card\'s own category table (runtime), else 档 n', () => {
  // 合成的中性样例：结构同卡的变量更新规则（字段: type / range / category: a-b: 名）
  const rule = ['变量规则:', '  园艺值:', '    type: number', '    range: 0~100', '    category:', '      0-20: 萌芽', '      21-40: 抽枝', '      41-60: 开花', '      61-80: 结果', '      81-100: 丰收', '    check:', '      - 无'].join('\n');
  const cats = findCoreCategories(['无关文本', rule], '园艺值');
  assert.deepEqual(cats.map(c => c.max), [20, 40, 60, 80, 100]);
  assert.deepEqual([10, 30, 50, 70, 90, 120].map(n => coreStage('园艺值', n, cats)), ['萌芽', '抽枝', '开花', '结果', '丰收', '丰收']);
  assert.equal(coreStage('园艺值', 50), '档 3');   // 没取到档名
  assert.equal(findCoreCategories([rule], '别的值'), null);
});

const STAT = { 世界: { 当前地点: 'x' }, 主角: { 声望: 5 },
  表一: { 甲: { 身份: '园丁', 级别: 'B', 数值: 72 }, 乙: { 身份: '厨师', $meta: 1 } }, 表二: { 丙: { 身份: '商人', 进度: '二' } } };

test('rowFields: field names seen in roster rows, $-keys skipped', () => {
  assert.deepEqual(rowFields(STAT).sort(), ['数值', '进度', '级别', '身份'].sort());
  assert.deepEqual(rowFields(null), []); assert.deepEqual(rowFields({ a: 1 }), []);
});

test('detect: gradeField / coreField found by field-name shape (no card wording in the repo)', () => {
  assert.ok(NAME_FIELDS.includes('gradeField') && NAME_FIELDS.includes('coreField'));
  assert.equal(DEFAULT_MAP.gradeField, ''); assert.equal(DEFAULT_MAP.coreField, ''); assert.equal(DEFAULT_MAP.codeField, '');
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
