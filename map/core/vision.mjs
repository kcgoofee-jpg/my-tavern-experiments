// 视线警戒锥（Vision Cones，Part 5-2）纯几何核心：守卫 / 机兵的半透明扇形视野——位置 + 朝向 + 距离 + 视场角，
// 遇墙（线段遮挡）被截断。渲染层（查看器叠加）拿 polygon 画扇形，潜行判断拿 pointVisible 问「这个点被看见了吗」。
// 坐标一律是地图数据坐标（maps.json / estate plan 的同一坐标系），本模块不做任何换算。
// 纯函数、无依赖、不碰 DOM / 全局（core 铁律）；node 单测 tests/vision.test.mjs。

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
