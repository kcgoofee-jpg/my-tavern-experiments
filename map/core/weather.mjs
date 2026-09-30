// 活体世界氛围（Part 4-1）：天气的纯核心——预设表、由剧情 / 时钟推当前天气、粒子场与闪电时序。
// 只算数据：不碰 DOM / 存储 / 酒馆全局（机检见 tools/check_architecture.py），渲染由 app/weather.mjs 用这里的输出画。
// 确定性：同一 (预设, 尺寸, 时间片, 种子) 永远得到同一份粒子——回放与截图对比才站得住，也便于单测。

/** 预设表。kind: rain | sand | snow | lightning | clear；filter 是给 LayerRegistry 的 css 滤镜链（底图压暗 / 偏色）。 */
export const WEATHERS = [
  { id: 'clear', kind: 'clear', label: '晴', label_en: 'Clear', intensity: 0, filter: [] },
  { id: 'rain', kind: 'rain', label: '雨', label_en: 'Rain', intensity: .5, filter: [{ type: 'css', value: 'saturate(.75) brightness(.82)' }],
    particle: { count: 160, len: 14, speed: 900, angle: 12, color: 'rgba(190,215,240,.55)', width: 1 } },
  { id: 'storm', kind: 'rain', label: '雷暴雨', label_en: 'Thunderstorm', intensity: .9, filter: [{ type: 'css', value: 'saturate(.6) brightness(.62)' }],
    particle: { count: 320, len: 20, speed: 1500, angle: 24, color: 'rgba(205,220,245,.7)', width: 1.4 }, lightning: { every: [2.5, 7], flash: .55 } },
  { id: 'sand', kind: 'sand', label: '沙尘暴', label_en: 'Sandstorm', intensity: .8, filter: [{ type: 'css', value: 'sepia(.35) saturate(1.1) brightness(.8)' }],
    particle: { count: 260, len: 26, speed: 1200, angle: 6, color: 'rgba(214,183,120,.4)', width: 2 } },
  { id: 'snow', kind: 'snow', label: '雪', label_en: 'Snow', intensity: .4, filter: [{ type: 'css', value: 'brightness(.95) saturate(.8)' }],
    particle: { count: 120, len: 5, speed: 220, angle: 4, color: 'rgba(255,255,255,.75)', width: 2 } },
];

/** 剧情词 → 天气（通用天气词，不含任何卡专有人名 / 地名）。命中越多的词、强度越高。 */
export const STORY_WORDS = [
  { w: ['雷暴', '雷雨', '闪电', '雷'], id: 'storm', weight: 3 },
  { w: ['暴雨', '大雨', '雨夜', '下雨', '雨'], id: 'rain', weight: 2 },
  { w: ['沙尘', '风沙', '沙暴'], id: 'sand', weight: 3 },
  { w: ['雪', '飘雪', '落雪'], id: 'snow', weight: 2 },
];

export const weatherOf = id => WEATHERS.find(w => w.id === id) || WEATHERS[0];

/** 全屏色调（渲染层在 canvas 里铺一层）：比 css 滤镜便宜，也不牵动底层图层的合成 */
export const TINTS = { clear: '', rain: 'rgba(24,36,52,.16)', storm: 'rgba(10,16,28,.30)', sand: 'rgba(150,118,58,.18)', snow: 'rgba(222,232,242,.12)' };
export const tintOf = id => TINTS[weatherOf(id).id] || '';

/**
 * 由剧情（事态标题 / 摘要）与时钟推当前天气：{ id, intensity, night }。
 * 命中多条取得分最高的一条（同分取表内靠前的）；一条都没命中就是 clear。
 * night（时钟的夜）不直接改天气，只把雨升级成雷暴雨的门槛降低一点（夜雨更容易打雷）。
 */
export function weatherFromStory(texts, { night = false } = {}) {
  const src = (Array.isArray(texts) ? texts : [texts]).map(t => String(t ?? '')).join(' ');
  const score = {};
  for (const g of STORY_WORDS) for (const w of g.w) {
    let at = -1;
    while ((at = src.indexOf(w, at + 1)) >= 0) score[g.id] = (score[g.id] || 0) + g.weight;
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  let id = best ? best[0] : 'clear';
  if (night && id === 'rain' && (score.rain || 0) >= 6) id = 'storm';   // 只提一次雨不算雷暴（「下雨」一词里有两个同义写法，别被重复计数带上去）
  const w = weatherOf(id);
  return { id: w.id, intensity: w.intensity, night: !!night };
}

/** 粒子预算：面积 × 密度 × 画质档（省流 / 手机自动减半）；返回整数个数，上限封顶防低端机爆掉 */
export function particleBudget(preset, { w = 1280, h = 720, quality = 1 } = {}) {
  const p = weatherOf(typeof preset === 'string' ? preset : preset?.id);
  if (!p.particle) return 0;
  const area = Math.max(0, w) * Math.max(0, h) / (1280 * 720);
  const q0 = Number(quality), q = Number.isFinite(q0) ? Math.max(0, Math.min(1, q0)) : 1;
  if (!q) return 0;   // 0 = 一个都不画（省流到底 / 关掉）
  return Math.max(0, Math.min(600, Math.round(p.particle.count * area * q)));
}

// 32 位确定性伪随机（mulberry32）：同一 seed 同一序列。实现挪到 core/rng.mjs（车流 / 势力暗流共用）
import { rng } from './rng.mjs';
export { rng };

/**
 * 一帧的粒子场（确定性）：从 seed 起铺 count 个粒子，按 t（秒）推进，出界从顶部 / 上风侧回绕。
 * 返回 [{ x, y, vx, vy, len, color, width }]；clear / 无粒子预设返回空数组。
 */
export function particleField(preset, { w = 1280, h = 720, t = 0, seed = 1, quality = 1 } = {}) {
  const p = weatherOf(typeof preset === 'string' ? preset : preset?.id);
  const n = particleBudget(p, { w, h, quality });
  if (!n || !p.particle) return [];
  const r = rng(seed);
  const sp = p.particle.speed, ang = p.particle.angle * Math.PI / 180;
  const vx = Math.sin(ang) * sp, vy = Math.cos(ang) * sp;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x0 = r() * (w + 120) - 60, y0 = r() * (h + 40), ph = r();   // 出生点略微出界，免得边缘出现一条齐整的空带
    const y = (y0 + t * vy * (.7 + ph * .6)) % (h + 40) - 20;
    const x = (x0 + t * vx * (.7 + ph * .6)) % (w + 120) - 60;
    out.push({ x, y, vx, vy, len: p.particle.len * (.6 + ph * .8), color: p.particle.color, width: p.particle.width });
  }
  return out;
}

/** 闪电（只在 storm 有）：{ at, alpha } —— at = 下一次闪的时刻（秒），alpha = 这次闪的亮度。
 *  给 0 就是当前不闪（比如没到点）。确定性：由 seed 与时间片算出第几道闪和它的亮度。 */
export function lightningAt(preset, { t = 0, seed = 1 } = {}) {
  const p = weatherOf(typeof preset === 'string' ? preset : preset?.id);
  if (!p.lightning) return { at: 0, alpha: 0 };
  const [lo, hi] = p.lightning.every, r = rng(seed ^ 0x9e3779b9), life = .28;
  let at = 0, prev = 0;   // 时刻序列：0（起点不闪）+ 每道之间隔 [lo, hi] 秒
  for (let k = 0; k < 5000; k++) { prev = at; at += lo + r() * (hi - lo); if (at > t) break; }
  const dt = t - prev;
  let alpha = 0;
  if (prev > 0 && dt >= 0 && dt <= life) {   // 一道闪是「亮—暗—再亮」三下，不是一条平滑衰减
    for (const b of [0, .06, .16]) if (dt >= b && dt < b + .07) alpha = Math.max(alpha, p.lightning.flash * (1 - (dt - b) / .07));
  }
  return { at, alpha };
}

/** 摘要（上下文预算 / 自检）：{ id, intensity, particles, filter, flashing } */
export function describe(preset, opts = {}) {
  const p = weatherOf(typeof preset === 'string' ? preset : preset?.id);
  return { id: p.id, intensity: p.intensity, particles: particleBudget(p, opts),
    filter: p.filter?.length ? p.filter.map(f => f.value).join(' ') : '', flashing: lightningAt(p, opts).alpha > 0 };
}
