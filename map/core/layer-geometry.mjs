// Declared layers, pure geometry and style resolution (docs/layers-schema.md §2.3, §4; K-R80): the paths the line / area blocks and the routes
// layer draw, converters from the view data files to features, the style a feature gets and the swatch the legend shows.
// Pure: no DOM, no storage, no host globals. The numbers and the markup rules are the ones the routes layer drew before this module existed
// (tests/layer_geometry.test.mjs compares `routePaths` with a frozen copy of the old loop).

const ROUTE_CLASSES = ['lane', 'patrol', 'patrol_city'];
const f1 = v => (v).toFixed(1);

/** pathD(pts, closed, VW, VH) -> an SVG path `d` for points in the 0..1 frame of the view (x of the width, y of the height). */
export const pathD = (pts, closed, VW, VH) => (Array.isArray(pts) ? pts : []).map(([x, y], j) => `${j ? 'L' : 'M'}${f1(x * VW)},${f1(y * VH)}`).join('') + (closed ? 'Z' : '');

/** circlePath(at, r, VW, VH) -> a closed circle as two arcs; the radius is a fraction of the width (the overlay is square-scaled, so it is round). */
export function circlePath([x, y], r, VW, VH) {
  const cx = x * VW, cy = y * VH, rr = r * VW;
  return `M${f1(cx - rr)},${f1(cy)}A${f1(rr)},${f1(rr)} 0 1 0 ${f1(cx + rr)},${f1(cy)}A${f1(rr)},${f1(rr)} 0 1 0 ${f1(cx - rr)},${f1(cy)}Z`;
}

/** routePaths(routes, VW, VH) -> [{ pass: 'halo' | 'line', d, cls }]: two passes (every halo, then every line); a route with fewer than two points is skipped. */
export function routePaths(routes, VW, VH) {
  const out = [], list = Array.isArray(routes) ? routes : [];
  for (const pass of ['halo', 'line']) for (const r of list) {
    if (!(r?.pts?.length > 1)) continue;
    out.push({ pass, d: pathD(r.pts, r.kind !== 'lane' && r.from === r.to, VW, VH), cls: pass === 'halo' ? 'halo' : ROUTE_CLASSES.includes(r.kind) ? r.kind : 'lane' });
  }
  return out;
}

/** routesAsFeatures(routes) -> line features: { pts, kind, closed } (`view:routes`, §3.2). */
export const routesAsFeatures = routes => (Array.isArray(routes) ? routes : []).filter(r => r?.pts?.length > 1)
  .map(r => ({ pts: r.pts, kind: r.kind, closed: r.kind !== 'lane' && r.from === r.to }));

/** markersAsFeatures(markers) -> point features: { id, at, kind? } (`view:markers`); the anchor `ax` / `ay` is used first, as the pins are. */
export const markersAsFeatures = markers => (Array.isArray(markers) ? markers : []).map(k => {
  const x = k?.ax ?? k?.nx, y = k?.ay ?? k?.ny;
  return Number.isFinite(x) && Number.isFinite(y) ? { id: k.id, at: [x, y] } : null;
}).filter(Boolean);

/** featuresOnView(features, view, kinds?) -> the features drawn on the open view (a feature without `view` is a node feature: the caller places it); `kinds` = filter.kinds. */
export const featuresOnView = (features, view, kinds) => (Array.isArray(features) ? features : [])
  .filter(f => f && (f.view === undefined || f.view === view) && (!kinds?.length || kinds.includes(f.kind)));

const DEFAULTS = { color: '--accent', opacity: 1, pulse: false, tone: 'chip', width: 1.4, halo: false, fill_opacity: 0.18, speed: 0.07, density: 12, trail: 0.006, preset: 'rain' };
const SIZE = { point: 10, flow: 1.8, label: 'micro' };

/** styleFor(layer, kind) -> the resolved style: the design §4 defaults, then layer.style, then layer.style.by[kind]. */
export function styleFor(layer, kind) {
  const { by, ...own } = (layer && layer.style) || {}, over = kind !== undefined && by ? by[kind] || {} : {};
  const s = { ...DEFAULTS, ...own, ...over };
  if (s.size === undefined && SIZE[layer?.type] !== undefined) s.size = SIZE[layer.type];
  if (layer?.type === 'tint' && own.opacity === undefined && over.opacity === undefined) s.opacity = 0.25;
  if (s.fill === undefined) s.fill = s.color;
  if (s.dash === undefined) s.dash = null;
  return s;
}

/** swatchOf(layer, kind) -> { shape: 'stroke' | 'fill' | 'dot' | null, color, dash } for the legend (§7). */
export function swatchOf(layer, kind) {
  const s = styleFor(layer, kind), t = layer?.type;
  const shape = t === 'line' || t === 'flow' ? 'stroke' : t === 'area' || t === 'tint' ? 'fill' : t === 'point' ? 'dot' : null;
  return { shape, color: shape === 'fill' && t === 'area' ? s.fill : s.color, dash: s.dash };
}

/** rgbOf('#rrggbb' | '#rrggbbaa') -> 'r,g,b' | null (the canvas renderers build rgba() strings from it). */
export function rgbOf(hex) {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(typeof hex === 'string' ? hex : ''); if (!m) return null;
  const n = parseInt(m[1], 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`;
}

/** flowKinds(layer, features, rgb) -> the `kinds` table of core/traffic.mjs for a flow layer: `default` plus one entry per feature kind (`rgb` turns a colour into 'r,g,b'). */
export function flowKinds(layer, features, rgb = rgbOf) {
  const one = kind => { const s = styleFor(layer, kind); return { speed: s.speed, size: s.size, density: s.density, color: rgb(s.color) || '255,255,255', trail: s.trail }; };
  const out = { default: one(undefined) };
  for (const k of new Set((features || []).map(f => f.kind).filter(Boolean))) out[k] = one(k);
  return out;
}

/** flowRoutes(features) -> the routes a flow draws: a closed feature whose last point is not its first gets the first point appended. */
export const flowRoutes = features => (features || []).filter(f => f?.pts?.length > 1).map(f => {
  const a = f.pts[0], b = f.pts[f.pts.length - 1];
  return { pts: f.closed && (a[0] !== b[0] || a[1] !== b[1]) ? [...f.pts, a] : f.pts, kind: f.kind };
});

/** cssToRgb('#rrggbb' | 'rgb(r, g, b)' | 'rgba(r, g, b, a)') -> 'r,g,b' | null (a resolved token value read from the computed style). */
export function cssToRgb(v) {
  if (typeof v !== 'string') return null;
  const h = rgbOf(v.trim()); if (h) return h;
  const m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(v.trim());
  return m && [m[1], m[2], m[3]].every(n => +n <= 255) ? `${+m[1]},${+m[2]},${+m[3]}` : null;
}

/** initialVisible(layer, stored) -> the first visibility of a declared layer (L-07, L-08): the stored '1' / '0' of `edenMapLayers`, else `menu.default !== false`; a sound layer is off until switched on. */
export const initialVisible = (layer, stored) => (stored === '1' ? true : stored === '0' ? false : layer?.type === 'sound' ? false : layer?.menu?.default !== false);

const pick = (o, k, lang) => (o?.i18n?.[lang]?.[k] ?? o?.[k] ?? '');
/** legendRowsOf(recs, lang) -> [{ id, heading, rows: [{ label, desc, swatch }] }] (K-R84): one group per layer record that has legend rows, in the order given; a record is { id, type, style, menu, legend }. */
export const legendRowsOf = (recs, lang = 'zh') => (recs || []).filter(r => Array.isArray(r?.legend) && r.legend.length)
  .map(r => ({ id: r.id, heading: pick(r.menu, 'label', lang), rows: r.legend.map(l => ({ label: pick(l, 'label', lang), desc: pick(l, 'desc', lang), swatch: swatchOf(r, l.kind) })) }));
