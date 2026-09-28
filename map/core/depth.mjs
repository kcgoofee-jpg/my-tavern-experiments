// 纵深系统数学（JS 版）。与 blender/depth.py 同一规格、函数一一对应；tests/fixtures/depth_golden.json 对拍（smoke 里跑）。
// 纯函数，不碰 DOM。常数只在 map/data/<layer>_depth.json（maps.json 该层的 "depth" 字段指向它）。设计：docs/design/depth-system.md
//   depthOf(isl, cfg)             d = isl.d（显式）或 clamp((alt_near − alt) / (alt_near − alt_far), 0, 1)
//   channel(name, d, cfg, ov)     线性插值 near → far；overrides 里有同名数值时直接用它
//   cloudsAbove(alt, cfg)         比这个海拔高的云片 id（从高到低）
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

export function island(id, cfg) {
  const isl = cfg.islands[id], d = depthOf(isl, cfg), ov = isl.overrides || {};
  const out = { d };
  for (const n of Object.keys(cfg.channels)) out[n] = channel(n, d, cfg, ov);
  out.clouds = cloudsAbove(isl.alt, cfg); out.ward_edge = ov.ward_edge ?? null;
  return out;
}
