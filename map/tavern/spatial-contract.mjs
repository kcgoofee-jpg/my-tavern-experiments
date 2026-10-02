// 空间坐标契约编译器（W1，docs/plans/llm-campaign.md 裁决 5 / 12 / 13）：把「当前地点 + 周边几何」编译成
// ≤budget token 的紧凑 JSON 坐标契约，取代模糊的方位散文——网格世界空间表征（grid-world spatial
// representation）：坐标结构化输入的规划正确率显著高于散文 / 字符网格。纯模块：数据进、契约出；不 fetch、
// 不碰 DOM / 全局 / 存储
// （node 单测 tests/spatial_encoder.test.mjs 机械检查）。宿主接线：tavern/eden-map.js spatialInject（默认关）。
// 坐标系：points 数据的归一化 0–1（nx/ny，y 向下；ax/ay 是渲染校正位，优先），量化 3 位小数；
// 同一输入字节级同输出（键序固定、候选按「距离 → 名字」稳定排序）。token 估算与 modes.tokens 同一口径。
// 邻接纪律（裁决 12）：连通只认 marker.link 显式跨层通道与同层几何邻近（builder neighbours 先例）；
// routes（巡逻折线）不作邻接源，只出守卫锥。拓扑块与 tools/build_worldbook_addon.py 的 [TOPO] 输出同语义。
import { makeHere } from '../app/place-resolver.mjs';
import { patrolCones } from '../core/vision.mjs';
import { tokens } from './interaction-modes.mjs';

export const SPATIAL_ID = 'eden-map-spatial';
export const DEFAULTS = { depth: 2, budget: 120, pois: 4, guards: 3, near: 3 };

const q = n => { const x = +n; return Number.isFinite(x) ? Math.round(x * 1000) / 1000 : 0; };
const gx = c => (c.nx != null ? +c.nx : +c.x);
const gy = c => (c.ny != null ? +c.ny : +c.y);
const d2 = (a, b) => Math.hypot(gx(a) - gx(b), gy(a) - gy(b));
const cname = s => String(s || '').replace(/\s+/g, '');
const byNear = (a, b) => (a.d - b.d) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const norm360 = a => { a = ((a % 360) + 360) % 360; return Number.isFinite(a) ? a : 0; };

// 注册表 → 节点树上的当前地点引擎（app/place-resolver.mjs，与查看器同一套）：同一份注册表只建一次
const engines = new WeakMap(), NOPLAN = {};
const mapsOf = reg => reg?.maps || reg || {};
function engineOf(reg, plan = null) {
  if (!reg || typeof reg !== 'object') return null;
  let by = engines.get(reg); if (!by) engines.set(reg, by = new WeakMap());
  const key = plan && typeof plan === 'object' ? plan : NOPLAN;   // the pack's layered room plan joins the vocabulary when the caller has it (the place pill, HEADER-1)
  if (!by.has(key)) { let e = null; try { e = makeHere({ maps: reg.maps ? reg : { maps: reg }, ...(key === NOPLAN ? {} : { plan: key }) }); } catch (err) { e = null; } by.set(key, e); }
  return by.get(key);
}
/** 地图的层名（注册表给的层名；没有就回落地图 id）——「L」与出口目标都用它 */
const levelOf = (reg, mapId) => engineOf(reg)?.level(mapId) || mapsOf(reg)[mapId]?.layer?.name || mapId || '';

/** 当前地点 → 落点 { level, mapId, markerId, name, room } | null（主场景房间 level 1–2 没有坐标，name 照抄）。地点由节点树定（nodes.locate） */
export function locate(reg, here) {
  const v = String(here || '').trim();
  if (!v || !reg) return null;
  const e = engineOf(reg), r = e?.here(v);
  if (!r) return null;
  const nm = (r.marker && e.tree.get(r.marker)?.name) || r.room || r.place || r.layer || r.word || v;
  return { level: r.level, mapId: r.map, markerId: r.marker || null, name: cname(nm), room: r.room || null };
}

/** 地点栏的写法（U-FIX-5 H2-01；plan = 包的分层房间表，HEADER-1：「地下二层 惩罚室」这类「层名 + 房间」写法落到房间）：落在某栋楼里的房间 → 「楼 · 房间」（变量里只写了房间也带上上级）；不是房间 / 认不出 → null（调用方照原文） */
export function chainOf(reg, here, plan = null) {
  const v = String(here || '').trim(), e = v ? engineOf(reg, plan) : null, r = e?.here(v);
  if (!r?.room || !r.node) return null;
  // the room is the standard name the resolver found (「<floor word> <room>」 reads as the room); an unplaced written form falls back to its last part
  const nd = e.tree.get(r.node), owner = cname((nd?.type === 'room' ? e.tree.get(e.tree.parent(r.node)) : nd)?.name || ''), room = cname(r.std || String(r.room).split(/\s*[·・‧•]\s*/).filter(Boolean).pop() || '');
  return !owner || !room ? null : owner === room ? owner : `${owner} · ${room}`;
}

/** points 数据 → { id: {nx, ny} }（ax/ay 渲染校正位优先；量化 3 位小数，坏行丢弃） */
export function coordIndex(points) {
  const out = {};
  for (const m of points?.markers || []) if (m?.id && Number.isFinite(+m.nx) && Number.isFinite(+m.ny))
    out[m.id] = { nx: q(m.ax ?? m.nx), ny: q(m.ay ?? m.ny) };
  return out;
}

/** 显式跨层出口（marker.link 通道）：[{ id, name, to, nx, ny }]；link.map 指向带 layer 的层图才算空间出口，
 *  指向 lm_* 三维地标图（kind=estate、无 layer）不算——routes 也不作邻接源（裁决 12）。 */
export function exitsOf(reg, mapId, ci = null) {
  const maps = reg?.maps || reg || {}, m = maps[mapId] || {}, out = [];
  for (const [id, k] of Object.entries(m.markers || {})) {
    const to = k?.link?.map, layer = to && maps[to]?.layer?.name && levelOf(reg, to); if (!layer) continue;
    out.push({ id, name: cname(k.name), to: layer, nx: ci?.[id]?.nx, ny: ci?.[id]?.ny });
  }
  return out;
}

/**
 * 空间坐标契约：o = { reg, here, pointsByMap, t?, fog?, budget? } →
 * `[地图空间] {"L":"中层","p":["霓虹市场",0.512,0.333],"e":[["执法局总局",0.552,0.361,"下层"]],"g":[["巡逻",…,朝向,半径]],"n":[["悬空公园",…]],"f":0.62}`
 * 降级阶梯（超预算先砍）：雾 f → 最远邻近 n → 最远守卫 g → 最远出口 e；p（当前地点）永不丢；
 * 预算小到连 p 都放不下 → 返回 ''（宁缺毋滥，不输出截断的坏 JSON）。
 */
export function coordView(o = {}) {
  const budget = Math.max(20, Math.round(+o.budget) || DEFAULTS.budget);
  const loc = o.reg ? locate(o.reg, o.here) : null;
  if (!loc) return '';
  const maps = o.reg.maps || o.reg, m = maps[loc.mapId] || {};
  const pts = loc.mapId ? o.pointsByMap?.[loc.mapId] : null;
  const ci = pts ? coordIndex(pts) : null;
  const p = loc.markerId && ci?.[loc.markerId] ? [loc.name, ci[loc.markerId].nx, ci[loc.markerId].ny] : [loc.name];
  const hereXY = p.length > 1 ? { nx: p[1], ny: p[2] } : null;
  const e = hereXY ? exitsOf(o.reg, loc.mapId, ci).filter(x => Number.isFinite(x.nx) && x.name)
    .map(x => ({ ...x, d: d2(x, hereXY) })).sort(byNear) : [];
  const g = hereXY && pts?.routes?.length ? patrolCones(pts.routes, { t: Math.max(0, +o.t || 0) })
    .filter(c => c && Number.isFinite(+c.x) && cname(c.name))
    .map(c => ({ name: cname(c.name), nx: q(c.x), ny: q(c.y), f: Math.round(norm360(+c.facing)), r: q(c.range), d: d2(c, hereXY) }))
    .sort(byNear) : [];
  const n = hereXY ? Object.entries(ci).filter(([id]) => id !== loc.markerId && !e.some(x => x.id === id))
    .map(([id, c]) => ({ name: cname(m.markers?.[id]?.name || id), nx: c.nx, ny: c.ny, d: d2(c, hereXY) }))
    .filter(x => x.name).sort(byNear) : [];
  const f = Number.isFinite(+o.fog) ? q(o.fog) : null;
  const build = (nn, ng, ne, wf) => {
    const v = { L: levelOf(o.reg, loc.mapId), p };
    if (ne) v.e = e.slice(0, ne).map(x => [x.name, x.nx, x.ny, x.to]);
    if (ng) v.g = g.slice(0, ng).map(x => [x.name, x.nx, x.ny, x.f, x.r]);
    if (nn) v.n = n.slice(0, nn).map(x => [x.name, x.nx, x.ny]);
    if (wf && f != null) v.f = f;
    return '[地图空间] ' + JSON.stringify(v);
  };
  const cap = { n: DEFAULTS.pois, g: DEFAULTS.guards, e: DEFAULTS.pois, f: true };
  const step = () => {
    if (cap.f) cap.f = false; else if (cap.n > 0) cap.n--; else if (cap.g > 0) cap.g--;
    else if (cap.e > 0) cap.e--; else return false;
    return true;
  };
  let out = build(cap.n, cap.g, cap.e, cap.f);
  while (tokens(out) > budget && step()) out = build(cap.n, cap.g, cap.e, cap.f);
  if (tokens(out) > budget) out = build(0, 0, 0, false);
  if (tokens(out) > budget) return '';
  return out;
}

/**
 * JIT 激活集（W6 wb_jit 的底座，先在这里立纯函数）：当前地点 + 显式出口目标（层名）+ 同层最近 near 个地标名。
 * 返回 Set<string>（名字已去空格，与条目关键词同口径）；认不出的地点返回空集（JIT 对空集不动任何条目）。
 * place = { matesOf(房间名) -> 同层房间名[] }（PLACE-1a，core/place-record.mjs floorIndex）：玩家在房间里时再加同层房间与所在建筑名。
 */
export function activationOf(reg, here, pointsByMap = {}, { near = DEFAULTS.near, place = null } = {}) {
  const loc = reg ? locate(reg, here) : null;
  const set = new Set();
  if (!loc) return set;
  set.add(loc.name);
  if (loc.room && place?.matesOf) {   // PLACE-1a: in a room -> the rooms of its floor(s) (core/place-record.mjs floorIndex) and the building's name; in the city no room entry is switched on
    for (const n of place.matesOf(String(loc.room).split(/\s*[·・‧•]\s*/).filter(Boolean).pop() || '')) set.add(cname(n));   // the room is written "<building>·<room>"
    const e = engineOf(reg), r = e?.here(String(here || '').trim()), b = r?.node && e.tree.get(r.node)?.name; if (b) set.add(cname(b));
  }
  const maps = reg.maps || reg;
  const pts = loc.mapId ? pointsByMap[loc.mapId] : null, ci = pts ? coordIndex(pts) : null;
  for (const x of exitsOf(reg, loc.mapId, ci)) { if (x.name) set.add(x.name); if (x.to) set.add(cname(x.to)); }
  if (loc.markerId && ci?.[loc.markerId]) {
    const nearIds = Object.entries(ci).filter(([id]) => id !== loc.markerId)
      .map(([id, c]) => [d2(c, ci[loc.markerId]), id]).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1))
      .slice(0, Math.max(0, Math.round(+near) || 0));
    for (const [, id] of nearIds) { const nm = maps[loc.mapId]?.markers?.[id]?.name; if (nm) set.add(cname(nm)); }
  }
  return set;
}

/** 注入对象：固定 id（重生 / swipe / 重载都覆盖同一条，不叠）；与 modes.statePrompt 同一形状 */
export function spatialPrompt(content, depth = DEFAULTS.depth) {
  return { id: SPATIAL_ID, position: 'in_chat', depth: Math.max(0, Math.min(20, Math.round(+depth) || 0)), role: 'system', content, should_scan: false };
}
/** 写进酒馆：先撤同 id 再注入（空内容 = 只撤）。fn = 取 TH 接口（与 modes.applyState 同一守卫） */
export function applySpatial(fn, content, depth) {
  const un = fn('uninjectPrompts'), inj = fn('injectPrompts'); if (!inj) return false;
  try { un?.([SPATIAL_ID]); if (content) inj([spatialPrompt(content, depth)]); return true; } catch (e) { return false; }
}
