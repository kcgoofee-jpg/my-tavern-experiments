// 纵深 × 图层系统闭环（Part 8-3）：core/haze.mjs 的滤镜换算 + 与 core/layers.mjs（LayerRegistry）的契约对拍。
//   depth.describe().currentHaze → haze.chain() → registry.setFilters('depth-haze', …) → cssFilter / canvasFilter
// 数学只在 core：滤镜参数由 haze.mjs 换算一次，谁都不许在渲染层再抄一遍 haze 公式。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Haze from '../map/core/haze.mjs';
import { describe as depthDescribe } from '../map/core/depth.mjs';
import { LayerRegistry, cssFilter, canvasFilter, SLOTS } from '../map/core/layers.mjs';

const CFG = JSON.parse(readFileSync(new URL('./fixtures/depth_golden.json', import.meta.url), 'utf8')).cfg;

test('haze.parts：浓度 → 模糊 / 去饱和 / 提亮，单调、夹在 0–1', () => {
  assert.deepEqual(Haze.parts(0), { k: 0, blur: 0, saturate: 1, brightness: 1 });
  assert.deepEqual(Haze.parts(1), { k: 1, blur: Haze.HAZE_BLUR_MAX, saturate: 1 - Haze.HAZE_SAT_MAX, brightness: 1 + Haze.HAZE_LIFT_MAX });
  assert.deepEqual(Haze.parts(0.5), { k: 0.5, blur: 1.6, saturate: 0.825, brightness: 1.04 });
  assert.deepEqual(Haze.parts(2), Haze.parts(1), '超过 1 夹住');
  assert.deepEqual(Haze.parts(-3), Haze.parts(0), '负数按 0');
  assert.deepEqual(Haze.parts('x'), Haze.parts(0), '乱值按 0');
  assert.deepEqual(Haze.parts(null), Haze.parts(0));
  assert.ok(Haze.parts(0.7).blur > Haze.parts(0.3).blur, '越远越糊');
  assert.ok(Haze.parts(0.7).saturate < Haze.parts(0.3).saturate, '越远越灰');
});

test('haze.chain：LayerRegistry 的滤镜链形状（{ type, value }），css 与 canvas 各就各位', () => {
  const ch = Haze.chain(0.6);
  assert.ok(ch.length >= 3);
  for (const f of ch) {
    assert.ok(f.type === 'css' || f.type === 'canvas', `滤镜类型 ${f.type}`);
    assert.equal(typeof f.value, 'string');
    assert.ok(f.value.length);
  }
  assert.ok(ch.some(f => f.type === 'css' && f.value.startsWith('blur(')));
  assert.ok(ch.some(f => f.type === 'css' && f.value.includes('saturate(')));
  assert.ok(ch.some(f => f.type === 'canvas' && f.value.includes('brightness(')));
  assert.equal(Haze.chain(0.6, { canvas: false }).every(f => f.type === 'css'), true, 'canvas: false = 只要 css 项');
  assert.deepEqual(Haze.chain(0), [], '近处不挂滤镜（省一次全屏合成）');
  assert.deepEqual(Haze.chain(Haze.HAZE_EPS / 2), []);
  assert.ok(Haze.chain(Haze.HAZE_EPS).length, '到阈值就挂');
  // 真进注册表：形状不对会被 normChain 拦下（setFilters 抛错）
  const r = new LayerRegistry();
  r.register({ id: 'depth-haze', slot: 'depth-haze', kind: 'dom' });
  r.setFilters('depth-haze', Haze.chain(0.6));
  assert.equal(r.filters('depth-haze').length, Haze.chain(0.6).length);
  assert.ok(cssFilter(r.filters('depth-haze')).startsWith('blur('));
  assert.ok(canvasFilter(r.filters('depth-haze')).includes('saturate('));
  assert.ok(r.describe().filterSummary.some(x => x.id === 'depth-haze'));
  assert.ok(SLOTS.includes('depth-haze'), 'depth-haze 是固定槽位');
});

test('闭环：depth.describe().currentHaze → 滤镜链（同一份纵深数据，远端就是更糊更灰）', () => {
  const near = depthDescribe(CFG, { depth: 0 }).currentHaze;
  const far = depthDescribe(CFG, { depth: 1 }).currentHaze;
  assert.equal(near, 0);
  assert.equal(far, 0.45, '最远处 = channels.haze 的 far');
  assert.deepEqual(Haze.chain(near), [], '近处不挂');
  const c = Haze.chain(far), p = Haze.parts(far);
  assert.ok(cssFilter(c).startsWith(`blur(${p.blur}px)`), '滤镜值就是 haze 换算出来的那个数');
  // 中景：haze 与纵深数学同步（0.5 的 d → 0.225 的霾）
  const mid = depthDescribe(CFG, { depth: 0.5 }).currentHaze;
  assert.equal(mid, 0.225);
  assert.equal(Haze.describe(mid).haze, 0.225);
  assert.equal(Haze.describe(mid).on, true);
  assert.equal(Haze.describe(0).on, false);
});

test('haze.vars / describe：CSS 自定义属性与摘要，键固定', () => {
  const v = Haze.vars(0.5);
  assert.deepEqual(Object.keys(v).sort(), ['--haze', '--haze-blur', '--haze-lift', '--haze-sat']);
  assert.equal(v['--haze-blur'], '1.6px');
  assert.deepEqual(Object.keys(Haze.describe(0.3)).sort(), ['blur', 'brightness', 'haze', 'on', 'saturate']);
});

test('纯度：haze.mjs 不碰 DOM / 存储 / 酒馆全局，也不反向 import 上层', () => {
  const src = readFileSync(new URL('../map/core/haze.mjs', import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
  for (const g of ['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'Mvu', 'SillyTavern']) {
    assert.ok(!new RegExp(`\\b${g}\\b`).test(src), `不该出现 ${g}`);
  }
  assert.ok(!/from\s+['"]\.\./.test(src));
});
