// 探索账本（迷雾探索的纯数据部分，S5-2 自 core/depth.mjs 拆出，原 map/core/fog.mjs）：宿主（tavern/eden-map.js）与查看器（app/fog.mjs）共用；纵深数学留在 core/depth.mjs。
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
