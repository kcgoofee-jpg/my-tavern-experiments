// 确定性伪随机（mulberry32）：粒子 / 车流 / 势力暗流都要「同一 seed 同一结果」——
// 回放、截图对拍、多端一致都靠这条；也别各写一份（以前每家自己抄，改一处漏一处）。
// 纯核心：不碰 DOM / 存储 / 酒馆全局。

/** 32 位确定性序列：rng(42) 每次调用都出同样的 [0,1) 数列 */
export function rng(seed) {
  let a = (Number(seed) || 0) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 由字符串 / 数字混出一颗种子（势力 id + 天数这类组合键用） */
export function seedOf(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts.map(String).join('').split('')) { h ^= p.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
