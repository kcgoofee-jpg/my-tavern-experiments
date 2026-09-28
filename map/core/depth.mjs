// 纵深系统数学（JS 版）。与 blender/depth.py 同一规格、函数一一对应；tests/fixtures/depth_golden.json 对拍（smoke 里跑）。
// 纯函数，不碰 DOM。常数只在 map/data/<layer>_depth.json（maps.json 该层的 "depth" 字段指向它）。设计：docs/design/depth-system.md
//   depthOf(isl, cfg)             d = isl.d（显式）或 clamp((alt_near − alt) / (alt_near − alt_far), 0, 1)
//   channel(name, d, cfg, ov)     线性插值 near → far；overrides 里有同名数值时直接用它
//   cloudsAbove(alt, cfg)         比这个海拔高的云片 id（从高到低）
//   迷雾探索 norm/visit/known/count  到过的地点（原 core/fog.mjs，C2 / U19 合并进来：雾 / 霾只走本模块）
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

// ---------- 迷雾探索（P3）的纯数据部分（原 map/core/fog.mjs）：宿主（tavern/eden-map.js）与查看器（app/fog.mjs）共用 ----------
// 数据 = { <地图 id>: [到过的地点名…] }，按聊天存在聊天变量 eden_map.探索（和自定义同一个顶层键，不进 stat_data）；
// 没有变量接口 / 单独打开时存本机。设置「迷雾探索」关掉时不记录。
export const MAX_MAPS = 40, MAX_PER_MAP = 300, MAX_NAME = 60;
const okId = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s);
const okName = s => typeof s === 'string' && s.trim() && s.length <= MAX_NAME;
/** 清洗：只留合法地图 id 与地点名，去重、限量（坏数据不抛） */
export function norm(raw) {
  const out = {}; if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, MAX_MAPS)) {
    if (!okId(k) || !Array.isArray(v)) continue;
    const s = [...new Set(v.filter(okName).map(x => x.trim()))].slice(-MAX_PER_MAP); if (s.length) out[k] = s;
  }
  return out;
}
/** 记一次到访；返回 { ex, changed }（不改原对象） */
export function visit(ex, map, name) {
  const n = norm(ex); if (!okId(map) || !okName(name)) return { ex: n, changed: false };
  name = name.trim(); const l = n[map] || []; if (l.includes(name)) return { ex: n, changed: false };
  if (!n[map] && Object.keys(n).length >= MAX_MAPS) return { ex: n, changed: false };
  n[map] = [...l, name].slice(-MAX_PER_MAP); return { ex: n, changed: true };
}
export const known = (ex, map, name) => !!ex?.[map]?.includes?.(name);
export const count = ex => Object.values(ex || {}).reduce((a, l) => a + (l?.length || 0), 0);
