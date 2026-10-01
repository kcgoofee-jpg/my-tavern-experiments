// 程序化空间环境音效（Part 4-4，2026-09-30）纯核心：不采样、不下载音频文件——WebAudio 按配方合成
// （滤波噪声 = 风 / 雨 / 噼啪，谐波振荡器 = 机械嗡鸣）。配方表 + 场景规则都是纯数据：数据来自 `sound` 图层（docs/layers-schema.md §12，K-R89）的 data——
// { "rules": [ { "match": { "map": "town_harbour" }, "scenes": [ { "id": "wind", "gain": 0.4 } ] } ], "recipes": { 自定义配方… } }（内联，或 file: 指向的 JSON）。
// 规则首个全键命中者生效；天气 rain/storm 自动附加 rain 场景（app 侧）。渲染层 app/sound-block.mjs 把配方接到 WebAudio 节点图。
// 纯函数、不碰 DOM / 全局（core 铁律）；node 单测 tests/ambience.test.mjs。

/** 内置配方（数据即声音）：kind = noise（滤波噪声，循环白噪声缓冲）| osc（谐波振荡器组）；
 *  filter = biquad 参数；lfo = 增益呼吸（rate Hz / depth 0..1 / wave sine|random）；gain 基准 0..1。 */
export const RECIPES = {
  wind:     { kind: 'noise', filter: { type: 'bandpass', freq: 320, q: 0.55 }, lfo: { rate: 0.07, depth: 0.55 }, gain: 0.5 },
  windHigh: { kind: 'noise', filter: { type: 'bandpass', freq: 900, q: 0.8 }, lfo: { rate: 0.11, depth: 0.6 }, gain: 0.4 },
  rain:     { kind: 'noise', filter: { type: 'highpass', freq: 1100 }, lfo: { rate: 0.23, depth: 0.18 }, gain: 0.34 },
  hum:      { kind: 'osc', freq: 55, harmonics: [1, 0.5, 0.25], lfo: { rate: 0.45, depth: 0.14 }, gain: 0.38 },
  humDeep:  { kind: 'osc', freq: 38, harmonics: [1, 0.6], lfo: { rate: 0.3, depth: 0.18 }, gain: 0.42 },
  crackle:  { kind: 'noise', filter: { type: 'bandpass', freq: 1900, q: 1.3 }, lfo: { rate: 2.7, depth: 0.72, wave: 'random' }, gain: 0.26 },
  birds:    { kind: 'noise', filter: { type: 'bandpass', freq: 2600, q: 2.2 }, lfo: { rate: 0.9, depth: 0.8, wave: 'random' }, gain: 0.16 },
};

const clamp01 = x => Math.max(0, Math.min(1, +x || 0));
const recipeOk = r => r && typeof r === 'object' && (r.kind === 'noise' || r.kind === 'osc') && clamp01(r.gain) > 0;

/** 配置规范化：规则保序、match 必须是对象、scenes 收敛为 { id, gain }；自定义 recipes 覆盖 / 追加内置。 */
export function normAmbience(cfg) {
  const src = cfg && typeof cfg === 'object' ? cfg : {};
  const recipes = { ...RECIPES };
  for (const [id, r] of Object.entries(src.recipes || {})) if (recipeOk(r)) recipes[id] = { ...r };
  const rules = [];
  for (const r of (Array.isArray(src.rules) ? src.rules : [])) {
    if (!r || typeof r.match !== 'object' || r.match === null) continue;
    const scenes = (Array.isArray(r.scenes) ? r.scenes : []).map(s => (s && typeof s.id === 'string' && recipes[s.id] && clamp01(s.gain ?? recipes[s.id].gain) > 0)
      ? { id: s.id, gain: clamp01(s.gain ?? recipes[s.id].gain) } : null).filter(Boolean);
    const match = {}; for (const k of ['map', 'layer', 'place', 'weather', 'night']) if (r.match[k] !== undefined) match[k] = r.match[k];
    if (scenes.length) rules.push({ match, scenes });
  }
  return { recipes, rules, master: clamp01(src.master ?? 1) };
}

/** 场景选择：ctx = { map, layer, place, weather, night }；match 里写了的键都要相等（night 布尔，place 支持前缀？不做，全等）。
 *  首个命中的规则生效；weather = rain / storm 时自动追加内置 rain 场景（去重）。返回 [{ id, gain }]。 */
export function pickScenes(ab, ctx = {}) {
  const hit = ab.rules.find(r => Object.entries(r.match).every(([k, v]) => (k === 'night' ? !!ctx.night === !!v : String(ctx[k] ?? '') === String(v))));
  const scenes = hit ? hit.scenes.slice() : [];
  if ((ctx.weather === 'rain' || ctx.weather === 'storm') && !scenes.some(s => s.id === 'rain')) scenes.push({ id: 'rain', gain: ctx.weather === 'storm' ? 0.45 : 0.3 });
  return scenes;
}

/** 混音计划：app 侧按它 diff 节点图（场景 id 集合没变就不重建）。 */
export function planFor(ab, ctx) { return pickScenes(ab, ctx).map(s => ({ id: s.id, gain: Math.min(1, s.gain * (ab.master || 1)), recipe: ab.recipes[s.id] })); }
