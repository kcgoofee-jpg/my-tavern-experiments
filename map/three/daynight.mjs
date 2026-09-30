// 动态昼夜环境（Part 9-1）：把 core/clock.mjs 的确定性世界时钟翻译成一套光照 / 雾 / 自发光的参数。
// 纯渲染层：只吃时钟、只吐数据（+ 可选的 THREE 落地），不碰 core 的状态机、不碰 DOM / 存储 / 酒馆全局。
// THREE 由调用方传进来（子页 importmap 各自解析），所以本模块能在 node 里用假 THREE 直接测。
// 四个时段的关键帧按「归一化日内进度 0~1」排（at = 时刻 / 1440），相邻帧之间 smoothstep 插值 + 逐帧 lerp 过渡，
// 世界时钟一次跳 10 分钟也不会闪——lerp 过渡与 prefers-reduced-motion 降级都在这一个模块里收口。
import { MIN_PER_DAY, normClock, periodOf } from '../core/clock.mjs';

/** 关键帧（按 at 升序；夜里那帧跨 0 点，插值时按环形处理）。elev = 太阳高度角、azim = 方位角（度）。 */
export const PHASES = [
  {
    id: 'night', at: 30 / MIN_PER_DAY, label: '深夜', label_en: 'Night', from: 21 * 60, to: 4 * 60,
    sun: { color: [.38, .48, .92], intensity: .34, elev: 38, azim: 20 },
    ambient: { sky: [.10, .14, .26], ground: [.06, .07, .12], intensity: .55 },
    fog: { color: [.07, .10, .20], density: .0022 },
    emissive: 1, searchlight: 1, haze: .45,
  },
  {
    id: 'dawn', at: 390 / MIN_PER_DAY, label: '清晨', label_en: 'Dawn', from: 5 * 60, to: 8 * 60,
    sun: { color: [1, .80, .52], intensity: 1.15, elev: 7, azim: 100 },   // 低角度暖金，阴影拉长
    ambient: { sky: [.52, .55, .70], ground: [.30, .26, .22], intensity: 1.0 },
    fog: { color: [.62, .58, .60], density: .0016 },
    emissive: .35, searchlight: .25, haze: .85,
  },
  {
    id: 'noon', at: 750 / MIN_PER_DAY, label: '正午', label_en: 'Noon', from: 11 * 60, to: 14 * 60,
    sun: { color: [1, .98, .94], intensity: 1.9, elev: 72, azim: 165 },   // 中性高亮，散射最小
    ambient: { sky: [.86, .90, .96], ground: [.44, .42, .38], intensity: 1.35 },
    fog: { color: [.80, .85, .92], density: .0004 },
    emissive: 0, searchlight: 0, haze: .2,
  },
  {
    id: 'dusk', at: 1095 / MIN_PER_DAY, label: '黄昏', label_en: 'Dusk', from: 17 * 60, to: 19 * 60 + 30,
    sun: { color: [.98, .48, .50], intensity: 1.0, elev: 5, azim: 255 },   // 暖紫红余晖
    ambient: { sky: [.44, .32, .48], ground: [.24, .18, .20], intensity: .95 },
    fog: { color: [.48, .34, .42], density: .0014 },
    emissive: .55, searchlight: .6, haze: .7,
  },
];

export const PHASE_IDS = PHASES.map(p => p.id);
const wrap01 = t => ((t % 1) + 1) % 1;
const clamp01 = x => Math.max(0, Math.min(1, x));
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
/** 角度按最短弧插值（黄昏 255° → 夜 20° 走 +125°，不是 -235°） */
const lerpDeg = (a, b, k) => { let d = ((b - a) % 360 + 540) % 360 - 180; return a + d * k; };
const smoothstep = x => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export { smoothstep };

/** 时钟（{ day, min } 或分钟数）→ 归一化日内进度 0~1（0 = 00:00）。乱输入 → 0（不猜、不抛） */
export function dayProgress(clock) {
  const c = normClock(typeof clock === 'number' ? { min: clock } : clock);
  return wrap01(c.min / MIN_PER_DAY);
}

/** 太阳 / 月亮方向：elev 高度角 + azim 方位角 → 单位向量 [x, y, z]（y 向上） */
export function dirOf(elev, azim) {
  const e = elev * Math.PI / 180, a = azim * Math.PI / 180;
  const c = Math.cos(e);
  return [c * Math.cos(a), Math.sin(e), c * Math.sin(a)];
}

/** 时段判定：按关键帧之间的中点切分（深夜那帧跨 0 点）。t 为归一化进度 */
export function phaseOf(t) {
  const x = wrap01(t);
  let best = PHASES[0], bestD = Infinity;
  for (const p of PHASES) {                       // 环形距离最近的关键帧 = 当前时段
    const d = Math.abs(((x - p.at + 1.5) % 1) - .5);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best.id;
}

/** 找到 t 落在哪一段（返回 { a, b, u }：起止关键帧与段内原始比例） */
function segmentAt(t) {
  const x = wrap01(t);
  for (let i = 0; i < PHASES.length; i++) {
    const a = PHASES[i], b = PHASES[(i + 1) % PHASES.length];
    const span = wrap01(b.at - a.at) || 1;
    const u = wrap01(x - a.at) / span;
    if (u <= 1) return { a, b, u };
  }
  return { a: PHASES[0], b: PHASES[1], u: 0 };
}

/** 关键帧自身（不做插值）→ 一份完整环境参数 */
function envOf(p) {
  return {
    t: p.at, phase: p.id, night: p.id === 'night',
    sun: { color: [...p.sun.color], dir: dirOf(p.sun.elev, p.sun.azim), intensity: p.sun.intensity, elevation: p.sun.elev, azimuth: p.sun.azim },
    ambient: { sky: [...p.ambient.sky], ground: [...p.ambient.ground], intensity: p.ambient.intensity },
    fog: { color: [...p.fog.color], density: p.fog.density },
    emissive: p.emissive, searchlight: p.searchlight, haze: p.haze,
  };
}

/** 两份环境参数按 k 混合（lerp 过渡用：世界时钟跳变时不闪） */
export function blend(a, b, k) {
  const u = clamp01(k);
  const mixVec = (x, y) => [lerp(x[0], y[0], u), lerp(x[1], y[1], u), lerp(x[2], y[2], u)];
  const n = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  return {
    t: lerp(a.t, b.t, u), phase: u < .5 ? a.phase : b.phase, night: u < .5 ? a.night : b.night,
    sun: { color: mixVec(a.sun.color, b.sun.color), dir: n(mixVec(a.sun.dir, b.sun.dir)),
      intensity: lerp(a.sun.intensity, b.sun.intensity, u),
      elevation: lerp(a.sun.elevation, b.sun.elevation, u), azimuth: lerpDeg(a.sun.azimuth, b.sun.azimuth, u) },
    ambient: { sky: mixVec(a.ambient.sky, b.ambient.sky), ground: mixVec(a.ambient.ground, b.ambient.ground),
      intensity: lerp(a.ambient.intensity, b.ambient.intensity, u) },
    fog: { color: mixVec(a.fog.color, b.fog.color), density: lerp(a.fog.density, b.fog.density, u) },
    emissive: lerp(a.emissive, b.emissive, u), searchlight: lerp(a.searchlight, b.searchlight, u), haze: lerp(a.haze, b.haze, u),
  };
}

/**
 * 采样：t（归一化进度）→ 一份完整环境参数。
 * reducedMotion：吸附到最近的关键帧（光影不再连续漂移，只按时段整档切换，动画敏感用户不会看到渐变扫过）。
 */
export function sample(t, { reducedMotion = false } = {}) {
  const x = wrap01(t);
  if (reducedMotion) {
    let best = PHASES[0], bestD = Infinity;
    for (const p of PHASES) { const d = Math.abs(((x - p.at + 1.5) % 1) - .5); if (d < bestD) { bestD = d; best = p; } }
    return { ...envOf(best), snapped: true };
  }
  const { a, b, u } = segmentAt(x);
  const k = smoothstep(u);
  const ea = envOf(a), eb = envOf(b);
  const e = blend(ea, eb, k);
  e.t = x; e.phase = phaseOf(x); e.night = e.phase === 'night';
  return e;
}

/** 时钟 → 环境参数（一步到位；period 走 core/clock 的时段表，两者一致） */
export function envAt(clock, opts = {}) {
  const t = dayProgress(clock);
  const e = sample(t, opts);
  const c = normClock(clock);
  e.min = c.min; e.time = `${String(Math.floor(c.min / 60)).padStart(2, '0')}:${String(c.min % 60).padStart(2, '0')}`;
  e.period = periodOf(c.min).id;
  return e;
}

/**
 * 昼夜循环控制器：世界时钟跳变（每轮 +10 分钟）时按 lerp 过渡，不会闪。
 * setClock(clock) 设目标；update(dtSec) 推进过渡并返回当前环境参数。
 * reducedMotion：过渡时间归零（整档切换）+ 采样吸附到关键帧。
 */
export function createCycle({ clock, reducedMotion = false, fadeSec = 1.2, sample: sampleFn = sample } = {}) {
  let target = sampleFn(dayProgress(clock == null ? 0 : clock), { reducedMotion });
  let cur = target, k = 1;
  return {
    get env() { return cur; },
    get phase() { return cur.phase; },
    get settled() { return k >= 1; },
    setClock(c) { target = sampleFn(dayProgress(c), { reducedMotion }); k = reducedMotion ? 1 : 0; if (reducedMotion) cur = target; return target; },
    setReduced(v) { reducedMotion = !!v; if (v) { k = 1; cur = sampleFn(cur.t, { reducedMotion: true }); } },
    update(dtSec) {
      if (k >= 1) return cur;
      const step = fadeSec > 0 ? Math.min(1, (Number(dtSec) || 0) / fadeSec) : 1;
      k = Math.min(1, k + step);
      cur = blend(cur, target, smoothstep(k));
      return cur;
    },
    describe() { return { phase: cur.phase, t: +cur.t.toFixed(4), settled: k >= 1, reducedMotion, intensity: +cur.sun.intensity.toFixed(3) }; },
  };
}

/**
 * 落地：把环境参数写进 three 的目标对象。缺哪个就跳过哪个（页面没接的部分不受影响）。
 * targets = { sun, hemi, fog, emissives: [{ material, base }], searchlights: [{ light, base }], shadow }
 * 返回实际写入的目标数（自检 / 探针用）。
 */
export function apply({ THREE, env, targets = {}, sunDistance = 200 } = {}) {
  if (!env) return 0;
  let n = 0;
  const setRGB = (c, rgb) => { if (!c?.setRGB) return false; c.setRGB(rgb[0], rgb[1], rgb[2]); return true; };
  const sun = targets.sun;
  if (sun) {
    const d = env.sun.dir;
    if (setRGB(sun.color, env.sun.color)) n++;
    sun.intensity = env.sun.intensity; n++;
    if (sun.position?.set) { sun.position.set(d[0] * sunDistance, d[1] * sunDistance, d[2] * sunDistance); n++; }
    if (targets.shadow !== false && sun.shadow) {
      // 低角度（清晨 / 黄昏）阴影拉长：把正交阴影相机的范围按高度角放大
      const cam = sun.shadow.camera;
      if (cam) { const s = 1 + Math.max(0, 1 - Math.abs(env.sun.elevation) / 45) * 2.2;
        for (const key of ['left', 'right', 'top', 'bottom']) if (typeof cam[key] === 'number') cam[key] = Math.sign(['left', 'bottom'].includes(key) ? -1 : 1) * 60 * s;
        cam.updateProjectionMatrix?.(); }
    }
  }
  const hemi = targets.hemi;
  if (hemi) {
    if (setRGB(hemi.color, env.ambient.sky)) n++;
    if (hemi.groundColor && setRGB(hemi.groundColor, env.ambient.ground)) n++;
    hemi.intensity = env.ambient.intensity; n++;
  }
  const fog = targets.fog;
  if (fog) {
    if (setRGB(fog.color, env.fog.color)) n++;
    if (typeof fog.density === 'number') { fog.density = env.fog.density; n++; }
  }
  for (const e of targets.emissives || []) {
    const m = e?.material || e;
    if (!m) continue;
    const base = typeof (e?.base ?? m.userData?.emissiveBase) === 'number' ? (e?.base ?? m.userData?.emissiveBase) : 1;
    m.emissiveIntensity = base * (.15 + env.emissive * .85);
    if (m.emissive && setRGB(m.emissive, env.fog.color)) n++;   // 自发光跟着夜色偏冷，别在夜里发白光
    n++;
  }
  for (const s of targets.searchlights || []) {
    const l = s?.light || s;
    if (!l) continue;
    const base = typeof (s?.base ?? l.userData?.baseIntensity) === 'number' ? (s?.base ?? l.userData?.baseIntensity) : 1;
    l.intensity = base * env.searchlight;
    if ('visible' in l) l.visible = env.searchlight > .01;
    n++;
  }
  if (THREE && targets.renderer?.toneMappingExposure !== undefined) { targets.renderer.toneMappingExposure = lerp(.85, 1.15, 1 - env.emissive); n++; }
  return n;
}

/**
 * 烘焙场景（庄园外观那批 MeshBasic 不吃灯）用的调色系数：正午 ≈ 1（不改色），夜里冷蓝压暗，清晨 / 黄昏偏暖。
 * 一份曲线同时服务「有灯的室内」和「烘焙好的室外」——两者才不会一个黄昏一个正午。
 */
export function gradeOf(env) {
  if (!env) return { tint: [1, 1, 1], exposure: 1 };   // 没有环境参数就不动画面（宁可不调，也别调黑）
  const c = env?.sun?.color || [1, 1, 1];
  const i = Number.isFinite(env?.sun?.intensity) ? env.sun.intensity : 1;
  // 系数按线性色给（three 的 Color 在线性工作空间里），要压得比直觉更狠才能在 sRGB 输出上真的看出夜色
  const k = .22 + .78 * clamp01(i / 1.9);
  return { tint: [c[0] * k, c[1] * k, c[2] * k], exposure: k };
}

/** 把调色写进一批烘焙材质（materials = [{ material, base }]，base = 材质原本的颜色，缺省白） */
export function applyGrade({ env, materials = [] } = {}) {
  const g = gradeOf(env);
  let n = 0;
  for (const t of materials) {
    const m = t?.material || t;
    if (!m?.color?.setRGB) continue;
    const b = t?.base || [1, 1, 1];
    m.color.setRGB(b[0] * g.tint[0], b[1] * g.tint[1], b[2] * g.tint[2]);
    n++;
  }
  return n;
}

/** 摘要（上下文预算 / 自检 / 探针）：时段 + 光强 + 自发光 + 探照锥 */
export const describe = (env, opts = {}) => ({
  phase: env?.phase || 'noon', period: env?.period || '', time: env?.time || '',
  sun: +(env?.sun?.intensity ?? 0).toFixed(3), elevation: +(env?.sun?.elevation ?? 0).toFixed(1),
  emissive: +(env?.emissive ?? 0).toFixed(3), searchlight: +(env?.searchlight ?? 0).toFixed(3),
  fog: +(env?.fog?.density ?? 0).toFixed(5), reducedMotion: !!opts.reducedMotion,
});
