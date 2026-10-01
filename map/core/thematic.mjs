// The thematic look of a map (docs/kernel-schema.md K-R107, docs/transit-schema.md §4.2, §8): the colour of each function, the outline of each danger level,
// the function of a group of names, the padded hull of a group of points, and the model of a thematic automatic schematic (branches tinted by function,
// hubs, label ranks). Pure: no DOM, no storage. Shapes and colours only; the words come from the caller.
import { FUNCTIONS } from './transit-spec.mjs';
import { functionWord } from './vocab.mjs';

export const PALETTE = Object.freeze({ civic: '#6c8ebf', commerce: '#e0a64b', residential: '#8fb86a', industry: '#9a8f86', military: '#b5654f', religious: '#c9b25e', education: '#5aa9a1', medical: '#d97a9a', leisure: '#a685d1', transport: '#7f9fb3', nature: '#5f9f63', restricted: '#c05050', other: '#8a919b' });
/** Eight line colours, in branch order. */
export const LINE_PALETTE = Object.freeze(['#e8b33a', '#3fa7d6', '#59b36b', '#b07cd8', '#e0736a', '#2f9e9e', '#c76fa3', '#8a6d3b']);
/** Outline of a district by danger level 0..3; a null colour means the district's own fill colour. */
export const DANGER = Object.freeze([
  Object.freeze({ color: null, width: 0.8, dash: null }), Object.freeze({ color: '--gold', width: 1.2, dash: [6, 4] }),
  Object.freeze({ color: '--alert', width: 1.6, dash: [6, 3] }), Object.freeze({ color: '--alert', width: 2.4, dash: null }),
]);
const r4 = v => Math.round(v * 1e4) / 1e4;

/** centroid(pts) -> [x, y]: the area centroid of a polygon (the mean of the points when it has no area). */
export function centroid(pts) {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], c = x0 * y1 - x1 * y0;
    a += c; x += (x0 + x1) * c; y += (y0 + y1) * c;
  }
  if (Math.abs(a) < 1e-12) return [r4(pts.reduce((s, p) => s + p[0], 0) / pts.length), r4(pts.reduce((s, p) => s + p[1], 0) / pts.length)];
  return [r4(x / (3 * a)), r4(y / (3 * a))];
}
/** circlePts([x, y], r, n = 24, aspect = 1) -> n points on a circle of radius r (a fraction of the width); aspect = height / width keeps it round on a wide view. */
export const circlePts = ([x, y], r, n = 24, aspect = 1) => Array.from({ length: n }, (_, i) => [r4(x + r * Math.cos(2 * Math.PI * i / n)), r4(y + r * Math.sin(2 * Math.PI * i / n) / aspect)]);

/** functionOf(names, lang) -> the function most of the names point to (ties: the order of FUNCTIONS; none: 'other'). */
export function functionOf(names, lang) {
  const count = new Map();
  for (const n of names || []) { const f = functionWord(n, lang); if (f) count.set(f, (count.get(f) || 0) + 1); }
  let best = 'other', top = 0;
  for (const f of FUNCTIONS) if ((count.get(f) || 0) > top) { best = f; top = count.get(f); }
  return best;
}

/** hull(points, pad) -> the convex hull of the points pushed `pad` outward from its centre; one or two points give a circle (a fraction of the width). */
export function hull(points, pad = 0.04) {
  const p = [...new Map((points || []).map(q => [q.join(','), q])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) {
    if (!p.length) return [];
    const [a, b] = [p[0], p[p.length - 1]];
    return circlePts([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], Math.hypot(a[0] - b[0], a[1] - b[1]) / 2 + pad);
  }
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), half = list => {
    const h = [];
    for (const q of list) { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); }
    return h.slice(0, -1);
  };
  const h = [...half(p), ...half([...p].reverse())], c = centroid(h);
  if (h.length < 3) return circlePts(c, Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) / 2 + pad);
  return h.map(([x, y]) => { const d = Math.hypot(x - c[0], y - c[1]) || 1; return [r4(x + (x - c[0]) / d * pad), r4(y + (y - c[1]) / d * pad)]; });
}

/**
 * thematicModel(tree, owner, layout, { lang, min = 8 }) -> { on, branches, hubs, ranks } (§8). `layout` is core/schematic.mjs layoutSchematic's { id: { x, y } }.
 * on = the layout has at least `min` nodes and at least 2 branches (a branch = a child of the owner that has a child in the layout).
 * branch = { id, nodes, fn, color, line, hull, edges }; hubs = nodes with children in the layout; ranks = { id: 1 (the owner and the branches) | 2 (other hubs) | 3 (leaves) }.
 */
export function thematicModel(tree, owner, layout, { lang = 'zh', min = 8 } = {}) {
  const off = { on: false, branches: [], hubs: [], ranks: {} };
  if (!tree || !layout || !Object.hasOwn(layout, owner)) return off;
  const kids = id => tree.children(id).filter(c => Object.hasOwn(layout, c)), ids = Object.keys(layout);
  const heads = kids(owner).filter(c => kids(c).length);
  if (ids.length < min || heads.length < 2) return off;
  const below = id => [id, ...kids(id).flatMap(below)];
  const branches = heads.map((id, i) => {
    const nodes = below(id), fn = functionOf(nodes.map(n => tree.get(n)?.name), lang);
    return { id, nodes, fn, color: PALETTE[fn], line: LINE_PALETTE[i % LINE_PALETTE.length], hull: hull(nodes.map(n => [layout[n].x, layout[n].y]), 0.04), edges: nodes.filter(n => n !== id).map(n => [tree.parent(n), n]) };
  });
  const hubs = ids.filter(id => kids(id).length), ranks = {};
  for (const id of ids) ranks[id] = id === owner || heads.includes(id) ? 1 : kids(id).length ? 2 : 3;
  return { on: true, branches, hubs, ranks };
}
