// 圣都车流 / 悬浮流光（Part 4-3）的纯核心：把地图数据里的路线（data/*.json 的 routes，
// 归一化坐标 `[[nx, ny], …]`）变成一帧里该画在哪些位置的光点。
// 只算数据：不碰 DOM / 存储 / 酒馆全局（机检见 tools/check_architecture.py），画由 app/traffic.mjs 用 OSD 的
// pixelFromPoint 换算到屏幕。确定性：同一 (路线, 时间, 种子) 永远得到同一批车。
import { rng } from './rng.mjs';

/** 各类路线的光点性格：航线（lane）是高空磁悬浮主干，巡逻环（patrol*）是地面慢车 */
// trail 是尾迹长度，单位与坐标一致（归一化弧长，约占一条路的 1%）
export const LANE_KINDS = {
  lane: { speed: .16, size: 2.4, density: 34, color: '255,214,140', trail: .012 },
  patrol: { speed: .07, size: 1.8, density: 16, color: '150,205,235', trail: .006 },
  patrol_city: { speed: .05, size: 1.6, density: 12, color: '160,190,225', trail: .005 },
};
export const kindOf = k => LANE_KINDS[k] || LANE_KINDS.lane;

/** 折线度量：逐段长度（归一化单位）与累计弧长；点数不足返回 null（不画） */
export function pathMetrics(pts) {
  const raw = Array.isArray(pts) ? pts : [];
  const p = raw.map(q => [Number(q?.[0]), Number(q?.[1])]);
  if (p.length < 2 || p.some(q => !Number.isFinite(q[0]) || !Number.isFinite(q[1]))) return null;   // 脏点整条不画：偷偷丢点会把后面的路挪位
  const segs = []; let total = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const len = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    segs.push({ x0: p[i][0], y0: p[i][1], dx: p[i + 1][0] - p[i][0], dy: p[i + 1][1] - p[i][1], len, s0: total });
    total += len;
  }
  return { segs, total, closed: false };
}

/** 弧长 → 坐标（含朝向 dir，画尾迹用）；超出总长就回绕 */
export function along(m, s) {
  if (!m || !m.segs.length || !(m.total > 0)) return null;
  let d = ((s % m.total) + m.total) % m.total;
  for (const g of m.segs) {
    if (d <= g.s0 + g.len || g === m.segs[m.segs.length - 1]) {
      const k = g.len > 0 ? Math.min(1, Math.max(0, (d - g.s0) / g.len)) : 0;
      return { nx: g.x0 + g.dx * k, ny: g.y0 + g.dy * k, dir: Math.atan2(g.dy, g.dx), seg: g };
    }
  }
  return null;
}

/** 一条路线上该放几辆车：按总长 × 密度 × 画质，封顶 40（一条路排太密就成实心条了） */
export function carsFor(route, { quality = 1 } = {}) {
  const m = pathMetrics(route?.pts); if (!m) return 0;
  const q = Math.max(0, Math.min(1, Number(quality) || 0));
  return Math.max(0, Math.min(40, Math.round(m.total * kindOf(route.kind).density * q)));
}

/**
 * 一帧的车流：[{ nx, ny, dir, size, color, alpha, trail, kind }]，按路线分组排出。
 * t 是秒；night 只调亮度与尾迹（夜里流光更显眼）。车数总封顶 300。
 */
/** 真正会画车的路线（点够、度量算得出）——渲染层要按这个顺序取度量，序号才与车上的 ri 对得上 */
export const routeList = routes => (Array.isArray(routes) ? routes : []).filter(r => r?.pts?.length > 1 && pathMetrics(r.pts));

export function trafficField(routes, { t = 0, seed = 1, quality = 1, night = false, cap = 300 } = {}) {
  const list = routeList(routes);
  const out = [];
  let i = 0;
  for (const r of list) {
    const m = pathMetrics(r.pts); if (!m) continue;
    const k = kindOf(r.kind), n = carsFor(r, { quality });
    const rnd = rng(seed + i * 7919); i++;
    for (let j = 0; j < n; j++) {
      if (out.length >= cap) break;
      const off = rnd() * m.total, sp = k.speed * (.75 + rnd() * .5), s = off + t * sp;
      const p = along(m, s);
      if (!p) continue;
      // s 与 ri 一并给渲染层：尾迹要沿路线往回退，只有坐标算不出来
      out.push({ nx: p.nx, ny: p.ny, dir: p.dir, s, ri: i - 1, size: k.size * (.8 + rnd() * .5), color: k.color,
        alpha: (night ? .95 : .62) * (.7 + rnd() * .3), trail: k.trail * (night ? 1.6 : 1), kind: r.kind });
    }
  }
  return out;
}

/** 尾迹另一端（沿路线往回退 d 个弧长单位）——渲染层拿它画那一小段流光 */
export const trailOf = (m, s, d) => along(m, s - d);

/** 摘要（上下文预算 / 自检） */
export function describe(routes, opts = {}) {
  const list = routeList(routes);
  return { routes: list.length, cars: trafficField(list, opts).length,
    byKind: list.reduce((a, r) => { a[r.kind || 'lane'] = (a[r.kind || 'lane'] || 0) + 1; return a; }, {}) };
}
