// 视线警戒锥（Vision Cones，Part 5-2）纯几何核心：守卫 / 机兵的半透明扇形视野——位置 + 朝向 + 距离 + 视场角，
// 遇墙（线段遮挡）被截断。渲染层（查看器叠加）拿 polygon 画扇形，潜行判断拿 pointVisible 问「这个点被看见了吗」。
// 坐标一律是地图数据坐标（maps.json / estate plan 的同一坐标系），本模块不做任何换算。
// 纯核心：不碰 DOM / 存储 / 酒馆全局（core 铁律）；node 单测 tests/vision.test.mjs。
// Part 5-2 第二步（2026-09-30）：守卫不是钉死在那儿的——沿地图数据里现成的巡逻环（data/*.json 的
// routes，kind = patrol / patrol_city）匀速走，锥跟着转；玩家两点之间的移动按同样一组锥做一次判断
// （是否被看到、最难的一处有多难躲）。
import { along, pathMetrics } from './traffic.mjs';   // 同一份折线度量：路线只有一个事实来源

const TAU = Math.PI * 2;
const norm2 = a => { a = ((a % 360) + 360) % 360; return a; };   // 角度归一到 [0,360)

/** 墙段表规范化：[[x1,y1,x2,y2], …] 或 {x1,y1,x2,y2} 都收；坏行丢弃。 */
export function normWalls(walls) {
  const out = [];
  for (const w of Array.isArray(walls) ? walls : []) {
    if (Array.isArray(w) && w.length >= 4 && [0, 1, 2, 3].every(i => Number.isFinite(+w[i]))) out.push([+w[0], +w[1], +w[2], +w[3]]);
    else if (w && typeof w === 'object' && ['x1', 'y1', 'x2', 'y2'].every(k => Number.isFinite(+w[k]))) out.push([+w.x1, +w.y1, +w.x2, +w.y2]);
  }
  return out;
}

/** 射线 vs 线段：apex 沿 (dx,dy) 方向，命中返回参数 t（0..1，相对射线长 len），否则 Infinity。 */
function rayHit(ax, ay, dx, dy, len, x1, y1, x2, y2) {
  const ex = x2 - x1, ey = y2 - y1;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return Infinity;   // 平行
  const t = ((x1 - ax) * ey - (y1 - ay) * ex) / den;             // 射线参数（按 dx,dy 单位向量：t = 距离）
  const u = ((x1 - ax) * dy - (y1 - ay) * dx) / den;             // 线段参数 0..1
  return t >= 0 && t <= len && u >= 0 && u <= 1 ? t : Infinity;
}

/** 朝向角 → 单位向量（0° = +x 右，90° = +y 下；地图坐标系 y 向下，视觉直觉一致）。 */
export const facingVec = deg => { const r = norm2(deg) * Math.PI / 180; return [Math.cos(r), Math.sin(r)]; };

/** 视锥多边形：{ x, y, facing, range, fov }（fov = 全角，度）+ 墙段表 → 顶点数组 [[x,y], …]（含圆心）。
 *  每条采样射线取「最近墙」截断；无墙 = 整扇弧。segments = 弧向采样数（默认 24）。 */
export function conePolygon(cone, walls, segments = 24) {
  if (!cone || !Number.isFinite(+cone.x) || !Number.isFinite(+cone.y)) return [];
  const x = +cone.x, y = +cone.y;
  const range = Math.max(0, +cone.range || 0), fov = Math.min(360, Math.max(0, +cone.fov || 0));
  if (range <= 0 || fov <= 0) return [];
  const ws = normWalls(walls);
  const half = fov / 2, start = norm2(+cone.facing || 0) - half, n = Math.max(2, segments);
  const pts = [[x, y]];
  for (let i = 0; i <= n; i++) {
    const deg = start + (fov * i) / n, [dx, dy] = facingVec(deg);
    let best = range;
    for (const w of ws) { const t = rayHit(x, y, dx, dy, range, w[0], w[1], w[2], w[3]); if (t < best) best = t; }
    pts.push([x + dx * best, y + dy * best]);
  }
  return pts;
}

/** 点是否被看见：距离 ≤ range、与朝向夹角 ≤ fov/2、且中间没有墙挡着。 */
export function pointVisible(cone, px, py, walls) {
  if (!cone || !Number.isFinite(+px) || !Number.isFinite(+py)) return false;
  const x = +cone.x, y = +cone.y, range = Math.max(0, +cone.range || 0);
  const dx = px - x, dy = py - y, dist = Math.hypot(dx, dy);
  if (dist <= 1e-9) return true;   // 与守卫同点：算被看见
  if (dist > range) return false;
  const half = Math.min(360, Math.max(0, +cone.fov || 0)) / 2;
  if (half < 180) {
    const [fx, fy] = facingVec(+cone.facing || 0);
    const dot = (dx * fx + dy * fy) / dist;
    if (Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI > half) return false;
  }
  for (const w of normWalls(walls)) if (rayHit(x, y, dx / dist, dy / dist, dist, w[0], w[1], w[2], w[3]) < dist - 1e-9) return false;
  return true;
}

/** TAU 导出给渲染层对拍用（扇形 SVG path 的角度换算） */
export { TAU };

// ---------------- 巡逻与潜行（Part 5-2 第二步） ----------------
/** 各类巡逻的性格（与 traffic.mjs 的巡逻车速同量级，走起来不快）：range / fov 是视线本身，count = 一条环上几个岗 */
export const GUARD_KINDS = {
  patrol: { range: .075, fov: 64, count: 2, speed: .07 },
  patrol_city: { range: .05, fov: 52, count: 2, speed: .05 },
};
export const guardKind = k => GUARD_KINDS[k] || GUARD_KINDS.patrol;

/**
 * 此刻地图上的警戒锥：每条巡逻环上均匀排 count 个岗，按 t（秒）沿环匀速走，朝向 = 前进方向。
 * 返回 [{ id, name, x, y, facing, range, fov, kind }]；quality（省流档）只减不增。
 */
export function patrolCones(routes, { t = 0, quality = 1 } = {}) {
  const out = [];
  let i = 0;
  for (const r of Array.isArray(routes) ? routes : []) {
    if (!r || !(r.kind === 'patrol' || r.kind === 'patrol_city')) continue;
    const m = pathMetrics(r.pts); if (!m) continue;
    const k = guardKind(r.kind), n = Math.max(1, Math.round(k.count * Math.max(0, Math.min(1, Number(quality) || 0))));
    const base = m.total * (i * .37);   // 每条环错开，免得几个岗叠在同一个点上转
    for (let j = 0; j < n; j++) {
      const p = along(m, base + (m.total * j) / n + (Number(t) || 0) * k.speed);
      if (!p) continue;
      out.push({ id: `${r.from || 'r'}${i}-${j}`, name: r.label || r.from || '', kind: r.kind,
        x: p.nx, y: p.ny, facing: p.dir * 180 / Math.PI, range: k.range, fov: k.fov });
    }
    i++;
  }
  return out;
}

/** 潜行难度（DC）：越近越难躲、走动着更难、夜里 / 有掩体容易些。返回 4–24 的整数 */
export function stealthDC({ dist = 0, range = .06, lit = 1, moving = true, cover = false, base = 10 } = {}) {
  const r = Math.max(1e-6, Number(range) || 1e-6);
  const near = 1 - Math.min(1, Math.max(0, (Number(dist) || 0) / r));   // 贴脸 = 1，锥边缘 = 0
  let dc = (Number(base) || 10) + Math.round(near * 6) + (moving ? 2 : 0) + (Number(lit) > .5 ? 2 : -2) + (cover ? -4 : 0);
  return Math.max(4, Math.min(24, dc));
}

export const SAMPLES = 12;
/**
 * 一次移动 (from → to) 会不会被看到：沿直线取 samples 个点逐个问 pointVisible。
 * 返回 { seen, hits, dc, worst, samples }；worst = 最难躲的那一下 { id, name, dc, dist, at }（回遇 / 潜行检定用）。
 * 只有一条腿的是两种情况：没被任何锥照到、或输入不成形（samples = 0）。
 */
export function crossing(from, to, cones, walls, o = {}) {
  const x1 = +from?.x, y1 = +from?.y, x2 = +to?.x, y2 = +to?.y;
  if (![x1, y1, x2, y2].every(Number.isFinite)) return { seen: false, hits: [], dc: 0, worst: null, samples: 0 };
  const list = Array.isArray(cones) ? cones : [];
  const n = Math.max(2, Math.min(64, Math.round(Number(o.samples) || SAMPLES)));
  const hits = new Set(); let worst = null;
  for (let i = 1; i <= n; i++) {
    const k = i / n, px = x1 + (x2 - x1) * k, py = y1 + (y2 - y1) * k;
    for (const c of list) {
      if (!pointVisible(c, px, py, walls)) continue;
      hits.add(c.id);
      const dist = Math.hypot(px - (+c.x), py - (+c.y));
      const dc = stealthDC({ dist, range: c.range, lit: o.lit, moving: true, cover: o.cover });
      if (!worst || dc > worst.dc) worst = { id: c.id, name: c.name || '', dc, dist, at: [px, py] };
    }
  }
  return { seen: hits.size > 0, hits: [...hits], dc: worst?.dc || 0, worst, samples: n };
}
