// 空气透视滤镜（Part 8-3，2026-09-30）：把纵深系统（core/depth.mjs）算出的霾浓度变成一条看得见的滤镜链。
// 数据流闭环：depth.describe() 的 currentHaze（当前纵深平面 d 上 channels.haze 的插值）→ 本模块的滤镜链 →
//   LayerRegistry 的 depth-haze 槽位（core/layer-registry.mjs 的 { type: 'css' | 'canvas', value } 契约）与 #fogCv 迷雾画布。
// 数学在这里只换算一次、纯函数；谁都不许在渲染层再抄一遍 haze 公式（与 core/depth.mjs 同一条纪律）。
// 纯核心：不碰 DOM / 存储 / 酒馆全局；node 单测 tests/depth_layers.test.mjs。
/** 最远处的模糊半径（px）：再大就近处也糊了，看不清图钉 */
export const HAZE_BLUR_MAX = 3.2;
/** 最远处抽掉的饱和度比例：远的东西发灰 */
export const HAZE_SAT_MAX = 0.35;
/** 最远处的提亮比例：远处泛白（霾把光散开） */
export const HAZE_LIFT_MAX = 0.08;
/** 低于这个浓度不挂滤镜：省一次全屏合成（近处本来就该清清楚楚） */
export const HAZE_EPS = 0.02;

const NUM = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const r3 = x => Math.round(x * 1000) / 1000;

/** 浓度 → 三个滤镜参数：{ k, blur, saturate, brightness }。乱值 / 负数按 0（= 不挂滤镜） */
export function parts(haze) {
  const k = clamp01(NUM(haze, 0));
  return { k: r3(k), blur: r3(k * HAZE_BLUR_MAX), saturate: r3(1 - k * HAZE_SAT_MAX), brightness: r3(1 + k * HAZE_LIFT_MAX) };
}

/**
 * 滤镜链（LayerRegistry 契约）：[{ type: 'css', value }, …, { type: 'canvas', value }]。
 * css 项给图层根（backdrop-filter / filter），canvas 项给 CanvasRenderingContext2D.filter（#fogCv 用同一串）。
 * 浓度低于 HAZE_EPS 返回空链 = 不设滤镜（cssFilter / canvasFilter 会自动得到 ''）。
 */
export function chain(haze, opt = {}) {
  const p = parts(haze);
  if (p.k < HAZE_EPS) return [];
  const blur = `blur(${p.blur}px)`, tone = `saturate(${p.saturate}) brightness(${p.brightness})`;
  const out = [{ type: 'css', value: blur }, { type: 'css', value: tone }];
  if (opt.canvas !== false) out.push({ type: 'canvas', value: `${blur} ${tone}` });
  return out;
}

/** CSS 自定义属性（查看器里给不想整条链替换的地方用；与 chain 同一个数） */
export function vars(haze) {
  const p = parts(haze);
  return { '--haze': String(p.k), '--haze-blur': p.blur + 'px', '--haze-sat': String(p.saturate), '--haze-lift': String(p.brightness) };
}

/** 标准摘要（自检 / 上下文预算）：{ haze, blur, saturate, brightness, on } */
export function describe(haze) {
  const p = parts(haze);
  return { haze: p.k, blur: p.blur, saturate: p.saturate, brightness: p.brightness, on: p.k >= HAZE_EPS };
}

export const Haze = { HAZE_BLUR_MAX, HAZE_SAT_MAX, HAZE_LIFT_MAX, HAZE_EPS, parts, chain, vars, describe };
