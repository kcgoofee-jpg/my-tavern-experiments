// 活体世界氛围（Part 4-1）：tests/weather.test.mjs —— 纯数据，node 里跑，不需要浏览器。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WEATHERS, weatherOf, weatherFromStory, particleBudget, particleField, lightningAt, rng, describe, tintOf } from '../map/core/weather.mjs';
import { kernelDecl } from '../map/core/layer-defaults.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('预设表：id 唯一、clear 无粒子、只有 storm 有闪电', () => {
  const ids = WEATHERS.map(w => w.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(weatherOf('clear').particle, undefined);
  assert.equal(weatherOf('sand').id, 'sand');
  assert.equal(weatherOf('不存在的天气').id, 'clear', '认不出就 clear，不猜');
  for (const w of WEATHERS) if (w.id !== 'storm') assert.equal(w.lightning, undefined);
  assert.ok(weatherOf('storm').lightning);
});

test('剧情词推天气：命中权重最高的那条，夜雨升级雷暴雨', () => {
  assert.equal(weatherFromStory([]).id, 'clear');
  assert.equal(weatherFromStory('窗外下着雨').id, 'rain');
  assert.equal(weatherFromStory(['沙尘漫天', '风沙很大']).id, 'sand');
  assert.equal(weatherFromStory('一道闪电劈下').id, 'storm');
  assert.equal(weatherFromStory('下雨', { night: true }).id, 'rain', '只提一次雨不算雷暴');
  assert.equal(weatherFromStory(['下雨了', '雨越下越大'], { night: true }).id, 'storm', '夜里雨够大 → 雷暴雨');
  assert.equal(weatherFromStory(null).id, 'clear');
  assert.equal(weatherFromStory('落雪').intensity, weatherOf('snow').intensity);
});

test('粒子预算：随面积与画质缩放，封顶 600，clear 为 0', () => {
  assert.equal(particleBudget('clear'), 0);
  const full = particleBudget('rain', { w: 1280, h: 720, quality: 1 });
  assert.equal(full, weatherOf('rain').particle.count);
  assert.equal(particleBudget('rain', { w: 640, h: 360, quality: 1 }), Math.round(full / 4));
  assert.ok(particleBudget('storm', { w: 4000, h: 3000, quality: 1 }) <= 600, '大屏也要封顶');
  assert.equal(particleBudget('rain', { quality: 0 }), 0, 'quality 为 0 就是不画');
  assert.equal(particleBudget('rain', { quality: 5 }), full, '画质系数只许降不许升（上限 1）');
});

test('粒子场确定性 + 全在画面内 + 随时间推进', () => {
  const a = particleField('rain', { w: 800, h: 600, t: 1, seed: 7, quality: 1 });
  const b = particleField('rain', { w: 800, h: 600, t: 1, seed: 7, quality: 1 });
  assert.deepEqual(a, b, '同一 (预设, 尺寸, 时间, 种子) 必须逐点一致');
  assert.ok(a.length > 0);
  for (const p of a) {
    assert.ok(p.x >= -70 && p.x <= 870, `x 越界 ${p.x}`);
    assert.ok(p.y >= -25 && p.y <= 625, `y 越界 ${p.y}`);
    assert.ok(p.len > 0 && p.width > 0);
  }
  const c = particleField('rain', { w: 800, h: 600, t: 2, seed: 7 });
  assert.notDeepEqual(a.map(p => p.y), c.map(p => p.y), '时间推进粒子要动');
  assert.deepEqual(particleField('clear', { t: 3 }), []);
});

test('rng 确定性且落在 [0,1)', () => {
  const r = rng(42), s = rng(42);
  for (let i = 0; i < 20; i++) { const v = r(); assert.equal(v, s()); assert.ok(v >= 0 && v < 1); }
});

test('闪电：只在 storm 有，确定性，闪完归零', () => {
  assert.deepEqual(lightningAt('rain', { t: 3 }), { at: 0, alpha: 0 });
  const l1 = lightningAt('storm', { t: 10, seed: 3 }), l2 = lightningAt('storm', { t: 10, seed: 3 });
  assert.deepEqual(l1, l2);
  assert.ok(l1.at > 10, '返回的是下一道闪的时刻');
  let saw = 0;
  for (let t = 0; t < 60; t += .02) if (lightningAt('storm', { t, seed: 3 }).alpha > 0) saw++;
  assert.ok(saw > 0, '一分钟内总该闪几次');
  assert.equal(lightningAt('storm', { t: 0, seed: 3 }).alpha, 0, 't=0 起点不闪');
});

test('describe 摘要：粒子数 / 滤镜 / 是否在闪', () => {
  const d = describe('storm', { w: 1280, h: 720, t: 0 });
  assert.equal(d.id, 'storm');
  assert.ok(d.particles > 0);
  assert.match(d.filter, /brightness/);
  assert.equal(d.flashing, false);
  assert.equal(describe('clear').filter, '');
  assert.equal(tintOf('clear'), '', '晴天不铺色调');
  assert.match(tintOf('storm'), /^rgba\(/);
  assert.equal(tintOf('乱写的'), '');
});

test('纯核心身份：不碰 DOM / 存储 / 酒馆全局，且登记进看门狗白名单', () => {
  const src = readFileSync(join(ROOT, 'map/core/weather.mjs'), 'utf8');
  for (const g of ['window', 'document', 'localStorage', 'navigator', 'Mvu', 'SillyTavern']) {
    assert.ok(!new RegExp(`\\b${g}\\b`).test(src.replace(/\/\/[^\n]*/g, '')), `不该出现 ${g}`);
  }
  assert.doesNotMatch(src, /from '\.\.\//, 'core 是纯叶层，不许回引父目录');
  const app = readFileSync(join(ROOT, 'map/app/weather-view.mjs'), 'utf8');
  assert.ok(app.includes("declared('weather'"), '天气经内核宣告注册');
  assert.equal(kernelDecl('weather').slot, 'fx', '天气必须落在 LayerRegistry 的 fx 槽位（宣告在 core/layer-defaults.mjs）');
});
