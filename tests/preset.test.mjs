// 社区预设半结构化字段（Part 7-2）：tests/preset.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectPreset, extractFields, fieldOf, PRESET_PROFILES, FIELD_ALIASES } from '../map/tavern/preset.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('预设指纹识别：命中才认、拿不准返回 null', () => {
  assert.equal(detectPreset('Ako预设输出'), 'ako');
  assert.equal(detectPreset('智脑-Z 输出'), 'zhinao-z');
  assert.equal(detectPreset('斯德哥尔摩症预设'), 'stockholm');
  assert.equal(detectPreset('一段普通叙事'), null);
  assert.equal(detectPreset(null), null);
  for (const p of PRESET_PROFILES) assert.ok(p.id && p.markers.length);
});

test('半结构化字段吸收：中文键映射标准字段、后写的覆盖先写的', () => {
  const f = extractFields('【当前地点】圣都铁匠铺\n■ 时间：黄昏\n【当前地点】圣都监狱');
  assert.equal(f.location, '圣都监狱');
  assert.equal(f.time, '黄昏');
  assert.equal(fieldOf('■ 时间：黄昏', 'time'), '黄昏');
  assert.equal(fieldOf('没有', 'time'), '');
});

test('噪声不误判：叙事正文、超长值、空值都不收', () => {
  assert.deepEqual(extractFields('他走进大厅：灯火通明，人声鼎沸'), {}, '行首短键那条也要扛住普通叙事');
  assert.equal(extractFields('【地点】' + 'x'.repeat(200)).location, undefined);
  assert.deepEqual(extractFields(''), {});
  assert.deepEqual(extractFields(null), {});
  assert.deepEqual(extractFields(undefined), {});
});

test('值两端去括号与引号残片；未登记的键小写原样返回', () => {
  assert.equal(extractFields('【地点】「圣都」').location, '圣都');
  assert.equal(extractFields('【自定义键】值').自定义键, '值');
  assert.ok(Object.keys(FIELD_ALIASES).length >= 10);
});

test('模块保持纯流水线身份（登记进架构看门狗，不碰宿主全局）', () => {
  const pip = readFileSync(join(ROOT, 'tools/check_architecture.py'), 'utf8');
  assert.ok(pip.includes('map/tavern/preset.mjs'), '必须登记进 PIPELINE 白名单');
  const src = readFileSync(join(ROOT, 'map/tavern/preset.mjs'), 'utf8');
  for (const g of ['window', 'document', 'localStorage', 'Mvu', 'SillyTavern']) assert.ok(!src.includes(g), `不该出现 ${g}`);
});
