// Part 9-1：昼夜环境着色管线（map/three/daynight.mjs）的 node 单测。
// 测的是「时钟 → 光照参数」的策略与落地接线，不是 three 本身（three 的行为由浏览器探针守）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PHASES, PHASE_IDS, dayProgress, dirOf, phaseOf, sample, envAt, blend, smoothstep, createCycle, apply, gradeOf, applyGrade, describe } from '../map/three/daynight.mjs';
import { MIN_PER_DAY } from '../map/core/clock.mjs';

const hh = (h, m = 0) => ({ day: 1, min: h * 60 + m });

// ---------------- 假 three ----------------
const color = () => ({ r: 0, g: 0, b: 0, setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; } });
const mkLight = (o = {}) => ({ color: color(), intensity: 0, position: { v: null, set(x, y, z) { this.v = [x, y, z]; } }, visible: true, ...o });
const mkHemi = () => ({ color: color(), groundColor: color(), intensity: 0 });

test('daynight：时钟 → 归一化日内进度（0 = 00:00，跨天环绕）', () => {
  assert.equal(dayProgress(hh(0)), 0);
  assert.ok(Math.abs(dayProgress(hh(12)) - .5) < 1e-9);
  assert.ok(Math.abs(dayProgress(hh(23, 59)) - 1439 / 1440) < 1e-9);
  assert.ok(Math.abs(dayProgress({ day: 1, min: MIN_PER_DAY + 60 }) - 60 / MIN_PER_DAY) < 1e-9, '超过一天的分钟数环绕回来');
  assert.equal(dayProgress(null), 0, '乱输入 → 零点');
  assert.equal(dayProgress(360), .25, '直接给分钟数也认');
});

test('daynight：四个时段的关键帧覆盖任务书给的时段窗（清晨 / 正午 / 黄昏 / 深夜）', () => {
  assert.deepEqual(PHASE_IDS, ['night', 'dawn', 'noon', 'dusk']);
  const inWin = (p, h, m = 0) => {   // 时段窗（可能跨 0 点）包含该时刻
    const x = h * 60 + m;
    return p.from <= p.to ? (x >= p.from && x < p.to) : (x >= p.from || x < p.to);
  };
  for (const [id, hours] of [['dawn', [5, 6, 7]], ['noon', [11, 12, 13]], ['dusk', [17, 18, 19]], ['night', [21, 23, 1, 3]]]) {
    const p = PHASES.find(q => q.id === id);
    for (const h of hours) assert.equal(inWin(p, h), true, `${id} 应覆盖 ${h}:00`);
    assert.equal(phaseOf(dayProgress(hh(p.at * 24))), id, `${id} 的关键帧自己判成 ${id}`);
  }
  assert.equal(phaseOf(dayProgress(hh(3))), 'night');
  assert.equal(phaseOf(dayProgress(hh(9))), 'dawn', '清晨与正午的中点之前仍算清晨');
  assert.equal(phaseOf(dayProgress(hh(14))), 'noon');
  assert.equal(phaseOf(dayProgress(hh(20))), 'dusk', '黄昏时段一直延到深夜之前');
});

test('daynight：深夜自发光与守卫探照锥开，正午两者归零', () => {
  const night = envAt(hh(0, 30)), noon = envAt(hh(12, 30));
  assert.equal(night.phase, 'night'); assert.equal(noon.phase, 'noon');
  assert.equal(night.emissive, 1); assert.equal(night.searchlight, 1);
  assert.equal(noon.emissive, 0); assert.equal(noon.searchlight, 0);
  assert.ok(night.sun.intensity < noon.sun.intensity, '夜里光强弱于正午');
  assert.ok(noon.fog.density < night.fog.density, '正午雾霾散射最小');
  assert.ok(night.fog.color[2] > night.fog.color[0], '夜幕偏蓝');
  const dusk = envAt(hh(18, 15));
  assert.ok(dusk.sun.color[0] > dusk.sun.color[2], '黄昏暖紫红：红多于蓝');
  assert.ok(dusk.sun.elevation < 10 && envAt(hh(6, 30)).sun.elevation < 10, '清晨 / 黄昏是低角度平行光');
  assert.ok(envAt(hh(12, 30)).sun.elevation > 60, '正午高角度');
});

test('daynight：关键帧之间 smoothstep 插值——中点正好取两端中值，全程连续无跳变', () => {
  const dawn = envAt(hh(6, 30)), noon = envAt(hh(12, 30));
  const mid = sample((6.5 * 60 + 12.5 * 60) / 2 / MIN_PER_DAY);
  assert.ok(Math.abs(mid.sun.intensity - (dawn.sun.intensity + noon.sun.intensity) / 2) < 1e-6, `中点 = 两端中值：${mid.sun.intensity}`);
  assert.equal(smoothstep(.5), .5); assert.equal(smoothstep(-1), 0); assert.equal(smoothstep(2), 1);

  let prev = sample(0), maxJump = 0;
  for (let m = 1; m <= MIN_PER_DAY; m++) {   // 逐分钟扫一圈：任意相邻一分钟的光强变化都要小
    const e = sample(m / MIN_PER_DAY);
    maxJump = Math.max(maxJump, Math.abs(e.sun.intensity - prev.sun.intensity));
    assert.ok(Math.abs(e.sun.dir[0]) <= 1.0000001 && Math.abs(e.sun.dir[1]) <= 1, '方向保持单位向量');
    prev = e;
  }
  assert.ok(maxJump < .02, `逐分钟最大跳变 ${maxJump} 应远小于一档`);
  const a = sample(1439 / MIN_PER_DAY), b = sample(0);
  assert.ok(Math.abs(a.sun.intensity - b.sun.intensity) < .02, '跨 0 点也是连续的');
});

test('daynight：reduced-motion 吸附到关键帧（光影不再连续漂移）', () => {
  const rm = t => sample(t, { reducedMotion: true });
  const e1 = rm(dayProgress(hh(7))), e2 = rm(dayProgress(hh(7, 40)));
  assert.deepEqual(e1.sun.color, e2.sun.color, '同一时段内不同时刻参数完全一致');
  assert.equal(e1.snapped, true);
  assert.equal(e1.sun.intensity, PHASES[1].sun.intensity, '吸附后就是关键帧本身');
  const e3 = rm(dayProgress(hh(13)));
  assert.equal(e3.phase, 'noon');
  assert.ok(Math.abs(e3.sun.intensity - PHASES[2].sun.intensity) < 1e-9);
});

test('daynight：createCycle 的 lerp 过渡——时钟跳变不闪，reduced-motion 整档切换', () => {
  const cyc = createCycle({ clock: hh(12, 30) });
  assert.equal(cyc.phase, 'noon');
  cyc.setClock(hh(0, 30));                       // 世界时钟一次跳到深夜
  assert.equal(cyc.settled, false, '跳变后进入过渡');
  const e1 = cyc.update(.3);
  assert.ok(e1.sun.intensity < 1.9 && e1.sun.intensity > .34, '过渡中间值落在两端之间');
  assert.ok(Math.abs(e1.sun.color[0] - 1) > 1e-6, '颜色也在过渡，不是瞬间换掉');
  for (let i = 0; i < 10; i++) cyc.update(.3);
  assert.equal(cyc.settled, true);
  assert.ok(Math.abs(cyc.env.sun.intensity - .34) < .01, '过渡结束落在深夜那一档');

  const cyc2 = createCycle({ clock: hh(12, 30), reducedMotion: true });
  cyc2.setClock(hh(0, 30));
  assert.equal(cyc2.settled, true, '减弱动效：整档切换，不做渐变');
  assert.equal(cyc2.env.phase, 'night');
  assert.deepEqual(cyc2.describe(), { phase: 'night', t: +(30 / MIN_PER_DAY).toFixed(4), settled: true, reducedMotion: true, intensity: .34 });
});

test('daynight：apply 把环境写进太阳 / 半球光 / 雾 / 自发光 / 探照锥', () => {
  const sun = mkLight(), hemi = mkHemi(), fog = { color: color(), density: 0 };
  const mat = { emissive: color(), emissiveIntensity: 0 };
  const cone = mkLight({ intensity: 3 });
  const targets = { sun, hemi, fog, emissives: [{ material: mat, base: 2 }], searchlights: [{ light: cone, base: 4 }] };

  const n = apply({ THREE: {}, env: envAt(hh(0, 30)), targets });
  assert.ok(n >= 8, `写进 ${n} 个目标`);
  assert.ok(Math.abs(sun.intensity - .34) < 1e-9);
  assert.ok(sun.position.v[1] > 0, '夜里那盏（月亮）也在地平线之上');
  assert.ok(Math.abs(hemi.color.r - .10) < 1e-9 && Math.abs(hemi.color.b - .26) < 1e-9, '半球光的天空色跟着夜色走');
  assert.ok(Math.abs(hemi.groundColor.r - .06) < 1e-9, '地面色也一起换');
  assert.ok(Math.abs(hemi.intensity - .55) < 1e-9);
  assert.ok(Math.abs(fog.density - .0022) < 1e-9);
  assert.ok(Math.abs(mat.emissiveIntensity - 2) < 1e-9, '深夜自发光 = base × 1');
  assert.equal(cone.intensity, 4); assert.equal(cone.visible, true, '夜里探照锥亮着');

  apply({ THREE: {}, env: envAt(hh(12, 30)), targets });
  assert.ok(Math.abs(mat.emissiveIntensity - .3) < 1e-9, '正午自发光 = base × 0.15（下限，不是全黑）');
  assert.equal(cone.intensity, 0); assert.equal(cone.visible, false, '正午探照锥整个关掉');
  assert.equal(apply({ THREE: {}, env: null, targets }), 0, '没有环境参数就什么都不写');
  assert.equal(apply({ THREE: {}, env: envAt(hh(12)), targets: {} }), 0, '没有目标就什么都不写');
});

test('daynight：烘焙场景调色——正午接近中性、夜里冷蓝压暗、清晨 / 黄昏偏暖', () => {
  const noon = gradeOf(envAt(hh(12, 30))), night = gradeOf(envAt(hh(0, 30)));
  const dawn = gradeOf(envAt(hh(6, 30))), dusk = gradeOf(envAt(hh(18, 15)));
  assert.ok(Math.abs(noon.tint[0] - 1) < 1e-9 && Math.abs(noon.tint[1] - .98) < 1e-9, '正午几乎不改色');
  assert.ok(night.tint[2] > night.tint[0] * 1.5, '夜里是冷色（蓝远高于红）');
  assert.ok(night.tint[2] < .6 && night.tint[0] < .3, '夜里整体压暗');
  assert.ok(dawn.tint[0] > dawn.tint[2], '清晨偏暖金'); assert.ok(dusk.tint[0] > dusk.tint[2], '黄昏偏暖红');
  assert.deepEqual(gradeOf(null).tint, [1, 1, 1], '没有环境参数时是中性（不把画面调黑）');

  const mats = [{ material: { color: color() }, base: [1, 1, 1] }, { material: { color: color() }, base: [.5, .5, .5] }];
  assert.equal(applyGrade({ env: envAt(hh(0, 30)), materials: mats }), 2);
  assert.ok(Math.abs(mats[0].material.color.b - night.tint[2]) < 1e-9);
  assert.ok(Math.abs(mats[1].material.color.r - .5 * night.tint[0]) < 1e-9, '基准色会被保留（1.22 倍高亮的顶点色材质不会被抹平）');
  assert.equal(applyGrade({ env: envAt(hh(0, 30)), materials: [{ material: null }] }), 0);
  assert.equal(applyGrade({}), 0);
});

test('daynight：blend 混合两份参数；describe 摘要给上下文预算用', () => {
  const a = envAt(hh(0, 30)), b = envAt(hh(12, 30));
  const m = blend(a, b, .5);
  assert.ok(Math.abs(m.sun.intensity - (a.sun.intensity + b.sun.intensity) / 2) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...m.sun.dir) - 1) < 1e-9, '混合后方向重新归一化');
  const d = describe(envAt(hh(18, 15)));
  assert.deepEqual(d, { phase: 'dusk', period: 'dusk', time: '18:15', sun: 1, elevation: 5, emissive: .55, searchlight: .6, fog: .0014, reducedMotion: false });
});

test('daynight：太阳方向由高度角 / 方位角算出（清晨在东、黄昏在西）', () => {
  const dawn = dirOf(7, 100), dusk = dirOf(5, 255);
  assert.ok(Math.abs(Math.hypot(...dawn) - 1) < 1e-9);
  assert.ok(dawn[1] > 0 && dusk[1] > 0, '都在地平线之上');
  assert.notEqual(Math.sign(dawn[2]), Math.sign(dusk[2]), '清晨与黄昏的太阳在相反的两侧（东 / 西）');
});

test('map/three/daynight.mjs：纯渲染层约束（只许 import core，不许碰宿主全局 / DOM）', () => {
  const src = readFileSync(new URL('../map/three/daynight.mjs', import.meta.url), 'utf8');
  for (const m of src.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)) {
    const p = m[2];
    if (!p.startsWith('.')) continue;
    assert.equal(/\bapp\/|\btavern\/|\bestate\//.test(p), false, `不许 import ${p}`);
    assert.ok(p.startsWith('../core/'), `只允许 import core：${p}`);
  }
  assert.doesNotMatch(src, /\b(localStorage|sessionStorage|Mvu|SillyTavern|document|window)\b/);
});
