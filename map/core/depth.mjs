// 纵深系统数学（JS 版）。与 blender/depth.py 同一规格、函数一一对应；tests/fixtures/depth_golden.json 对拍（smoke 里跑）。
// 纯函数，不碰 DOM。常数只在 map/data/<layer>_depth.json（maps.json 该层的 "depth" 字段指向它）。设计：docs/design/depth-system.md
//   depthOf(isl, cfg)             d = isl.d（显式）或 clamp((alt_near − alt) / (alt_near − alt_far), 0, 1)
//   channel(name, d, cfg, ov)     线性插值 near → far；overrides 里有同名数值时直接用它
//   cloudsAbove(alt, cfg)         比这个海拔高的云片 id（从高到低）
//   探索账本 norm/visit/known/count  到过的地点：S5-2 起在 core/exploration-ledger.mjs（describe 只读它的 norm / count）
import { norm, count } from './exploration-ledger.mjs';
const r4 = x => Math.floor(x * 1e4 + 0.5) / 1e4;   // 与 blender/depth.py 同一取整
const lerp = (a, b, t) => a + (b - a) * t;

export function depthOf(isl, cfg) {
  if (isl.d !== undefined && isl.d !== null) return r4(isl.d);
  const c = cfg.camera, span = c.alt_near - c.alt_far;
  return r4(Math.min(1, Math.max(0, (c.alt_near - isl.alt) / span)));
}

export function channel(name, d, cfg, ov = {}) {
  if (typeof ov[name] === 'number') return r4(ov[name]);
  const ch = cfg.channels[name];
  if (name === 'label') return r4(lerp(ch.opacity_near, ch.opacity_far, d));
  if (name === 'tint') return { mul: ch.near.map((a, i) => r4(lerp(a, ch.far[i], d))), sat: r4((ch.sat_far ?? 0) * d), gamma: r4(lerp(1, ch.gamma_far ?? 1, d)) };
  return r4(lerp(ch.near, ch.far, d));
}

export function cloudsAbove(alt, cfg) {
  return [...(cfg.cloud_sheets || [])].sort((a, b) => b.alt - a.alt).filter(c => c.alt > alt).map(c => c.id);
}

// 视差（U16）总开关：数据在 channels.parallax.enabled；设备（手机关）与「减少动态效果」由前端另行判断
export const parallaxOn = cfg => cfg?.channels?.parallax?.enabled === true;
// 非岛实体（云片 c1 / c2 / c3）的深度：同一公式，按海拔算（云片 alt 越高越靠前，d 越小）
export const altDepth = (alt, cfg) => depthOf({ alt }, cfg);

export function island(id, cfg) {
  const isl = cfg.islands[id], d = depthOf(isl, cfg), ov = isl.overrides || {};
  const out = { d };
  for (const n of Object.keys(cfg.channels)) out[n] = channel(n, d, cfg, ov);
  out.clouds = cloudsAbove(isl.alt, cfg); out.ward_edge = ov.ward_edge ?? null;
  return out;
}

// ---------- P3-A 标准化摘要（docs/reviews/architecture_and_stream_perf.md §2）：纵深配置 + 探索度概览，给上下文预算 / 多卡通用契约消费 ----------
// 纯函数：只读入参、不改任何对象、不碰 DOM / 存储（迷雾的两个存储键统一登记在 core/storage.mjs，由 app/fog.mjs 消费）。
//   maxDepth       纵深平面数 = 岛 + 云片（这张图把世界分了多少层深浅）
//   currentHaze    当前纵深 d（0 近 → 1 远）的霾浓度，channels.haze 插值
//   exploredRatio  探索度 = 到过的地点数 / 标记总数（给了 map 只算这张图，没给算全部）；markers ≤ 0 记 0
//   fogEnabled     迷雾探索开关（调用方传入实际开关状态；缺省按登记默认「开」）
export function describe(cfg, opt = {}) {
  const d = opt.depth ?? 0, ex = norm(opt.explored);
  const seen = opt.map != null ? (ex[opt.map]?.length || 0) : count(ex);
  const markers = Math.max(0, opt.markers || 0);
  return {
    maxDepth: Object.keys(cfg?.islands || {}).length + (Array.isArray(cfg?.cloud_sheets) ? cfg.cloud_sheets.length : 0),
    currentHaze: cfg?.channels?.haze ? channel('haze', d, cfg) : 0,
    exploredRatio: markers > 0 ? r4(Math.min(1, seen / markers)) : 0,
    fogEnabled: opt.fogEnabled == null ? true : !!opt.fogEnabled,
  };
}
