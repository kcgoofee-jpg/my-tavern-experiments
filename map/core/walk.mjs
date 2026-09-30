// 确定性时钟驱动的行走引擎（Part 8-2，2026-09-30）：
//   ① tickClock —— 世界时刻由「页面开着多久」算出来，不读系统时间、不问模型、不靠宿主推送。
//      同一个 (起点时钟, 经过毫秒) 永远得到同一个时刻：截图对比、多端一致、回放都站得住（core/clock.mjs 的口径）。
//   ② createWalker —— NPC 换地方时不要瞬移：在渲染循环里插值走过去（「减少动态效果」时一步到位）。
//      坐标是任意维的数值数组（二维 [x, y] 给人物标记，三维 [x, y, z] 给三维页），插值按分量算。
// 纯核心：不碰 DOM / 存储 / 酒馆全局，不自己起定时器（节拍由渲染循环给）；node 单测 tests/walk.test.mjs。
import { normClock, advance, DEFAULT_MIN_PER_ROUND } from './clock.mjs';

/** 一段路的时长（毫秒）：与二维人物标记的 CSS 补间同一个数，换过去不别扭 */
export const DEFAULT_DUR_MS = 1200;
/** 一个世界「轮」= 多少真实毫秒（默认 1 分钟：一局里挪人的节奏看得出来，又不至于满地图乱窜） */
export const DEFAULT_ROUND_MS = 60000;
/** 一次补推的轮数上限：页面挂了半天回来不要一口气推进几千轮（时间轴拉到最左会停在起点） */
export const MAX_ROUNDS = 720;

const NUM = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp01 = k => k < 0 ? 0 : k > 1 ? 1 : k;
/** 缓入缓出（与二维标记的 cubic-bezier(.35,.1,.25,1) 同感；三维页也用这条，两边同步） */
export const easeInOut = k => { const x = clamp01(k); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
/** 按分量线性插值：a / b 维数不同按短的算，非数值分量记 0（坏数据不抛） */
export function lerpN(a, b, k) {
  const x = Array.isArray(a) ? a : [], y = Array.isArray(b) ? b : [], n = Math.min(x.length, y.length), t = clamp01(k), out = [];
  for (let i = 0; i < n; i++) { const p = NUM(x[i], 0), q = NUM(y[i], 0); out.push(p + (q - p) * t); }
  return out;
}
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * 确定性 tick：{ clock, rounds, elapsed, nextIn }。
 * 起点时钟 base（{ day, min }）+ 真实经过的毫秒（now − t0）→ 该有的世界时刻；rounds 是这段时间折合的轮数。
 * 同一组入参永远同一结果（不看系统时钟）；乱值（没给 now / 负间隔）按 0 轮走。
 */
export function tickClock(base, opt = {}) {
  const b = normClock(base);
  const roundMs = Math.max(0, NUM(opt.roundMs, DEFAULT_ROUND_MS));
  const now = NUM(opt.now, 0), t0 = NUM(opt.t0, now);
  const elapsed = Math.max(0, now - t0);
  const rounds = roundMs > 0 ? Math.min(MAX_ROUNDS, Math.floor(elapsed / roundMs)) : 0;
  const minPerRound = NUM(opt.minPerRound, DEFAULT_MIN_PER_ROUND);
  return { clock: advance(b, rounds, minPerRound), rounds, elapsed, nextIn: roundMs > 0 && rounds < MAX_ROUNDS ? roundMs - (elapsed % roundMs) : Infinity };
}

/**
 * 行走引擎：每个名字一条「从哪儿 → 到哪儿」的线段，渲染循环喂 nowMs 推进。
 *   to(name, target, now)   设目标；第一次出现 = 直接落在该处（不凭空走一段）
 *   step(now)               推进所有线段，返回 { moving, done }（done = 这一步走到家的名字）
 *   at(name)                当前插值坐标（不在走 = null）
 *   clear()                 切图 / 卸载：全部清空
 * reduced（「减少动态效果」）时 dur = 0：一设目标就到位，不排队、不补间。
 */
export function createWalker(opt = {}) {
  let durMs = Math.max(0, NUM(opt.durMs, DEFAULT_DUR_MS)), reduced = !!opt.reduced;
  const seg = new Map();   // name → { from, to, t0, dur }
  const cur = (s, now) => (s.dur > 0 ? lerpN(s.from, s.to, easeInOut((now - s.t0) / s.dur)) : s.to);
  return {
    /** 设目标：同一个目标不重开一段；没有旧位置就当作已经在那儿 */
    to(name, target, now = 0) {
      if (!Array.isArray(target) || !target.length) return false;
      const t = NUM(now, 0), old = seg.get(name);
      if (old && same(old.to, target)) return false;
      if (!old) { seg.set(name, { from: target, to: target, t0: t, dur: 0 }); return false; }
      const from = cur(old, t);
      if (same(from, target)) { seg.set(name, { from: target, to: target, t0: t, dur: 0 }); return false; }
      seg.set(name, { from, to: target, t0: t, dur: reduced ? 0 : durMs });
      return true;
    },
    /** 直接落位（不补间）：切图 / 首次出现 / 跨图传送都走这条 */
    snap(name, p) { if (Array.isArray(p) && p.length) seg.set(name, { from: p, to: p, t0: 0, dur: 0 }); else seg.delete(name); },
    /** 推进：返回 { moving, done } */
    step(now) {
      const t = NUM(now, 0), done = [];
      for (const [name, s] of [...seg]) {
        if (s.dur > 0 && t - s.t0 >= s.dur) { seg.set(name, { from: s.to, to: s.to, t0: s.t0, dur: 0 }); done.push(name); }
      }
      return { moving: [...seg.values()].some(s => s.dur > 0), done };
    },
    /** 当前坐标（不在走 = 上一次的落点；没这个 = null） */
    at(name, now = 0) { const s = seg.get(name); return s ? cur(s, NUM(now, 0)) : null; },
    /** 还在走的：给渲染循环看「这一帧要不要继续排」 */
    moving() { return [...seg.values()].some(s => s.dur > 0); },
    target(name) { return seg.get(name)?.to ?? null; },
    has(name) { return seg.has(name); },
    clear() { seg.clear(); },
    setReduced(v) { reduced = !!v; if (reduced) for (const [name, s] of [...seg]) if (s.dur > 0) seg.set(name, { from: s.to, to: s.to, t0: s.t0, dur: 0 }); },
    setDur(v) { durMs = Math.max(0, NUM(v, DEFAULT_DUR_MS)); },
    /** 标准摘要（自检 / 探针）：{ walking, names, durMs, reduced } */
    describe() {
      const names = [...seg.keys()];
      return { walking: [...seg.values()].filter(s => s.dur > 0).length, names, durMs, reduced };
    },
  };
}

export const Walk = { DEFAULT_DUR_MS, DEFAULT_ROUND_MS, MAX_ROUNDS, tickClock, createWalker, lerpN, easeInOut };
