// The drawing of a transit network and of a planned route (docs/kernel-schema.md K-R109, docs/transit-schema.md §4.2-§4.5): octilinear paths, parallel offsets
// on shared segments, and the synthetic layer declarations ({ id, type, slot, style, features }) the S8-2 building blocks draw. No pixel is drawn here.
// Pure: no DOM, no storage. Positions come from the caller (`posOf(stationId)` -> [x, y] on the open view, or null).
import { stationName, functionLabelKey } from './transit-spec.mjs';
import { PALETTE, DANGER, centroid, circlePts } from './thematic.mjs';

export { centroid, circlePts };
const r4 = v => Math.round(v * 1e4) / 1e4, key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`), kind = (p, id) => `${p}-${id}`.slice(0, 32);
const fallbackT = k => String(k).split('.').pop();

/** octo(a, b, aspect, prev?) -> [a, b] or [a, bend, b]: horizontal, vertical or 45 degrees (measured with y x aspect, aspect = height / width). A segment that is none of them gets one bend;
 *  with `prev` (the line's stop before a) the first leg is the one that goes on closest to the way the line came in, else the straight leg comes first. */
export function octo(a, b, aspect = 1, prev) {
  const dx = b[0] - a[0], dy = (b[1] - a[1]) * aspect, ax = Math.abs(dx), ay = Math.abs(dy), e = 1e-9;
  if (ax < e || ay < e || Math.abs(ax - ay) < e) return [a, b];
  const sx = Math.sign(dx), sy = Math.sign(dy), m = Math.min(ax, ay);
  const diag = [sx * m, sy * m], straight = ax > ay ? [sx * (ax - m), 0] : [0, sy * (ay - m)];
  let first = straight;
  if (prev) {
    const inx = a[0] - prev[0], iny = (a[1] - prev[1]) * aspect, dot = v => v[0] * inx + v[1] * iny;
    if (dot(diag) / Math.hypot(...diag) > dot(straight) / Math.hypot(...straight)) first = diag;
  }
  return [a, [r4(a[0] + first[0]), r4(a[1] + first[1] / aspect)], b];
}

/** sharedOffsets(graph) -> Map<"a|b", lineId[]>: the lines that run over each segment (a, b sorted), in line order. */
export function sharedOffsets(graph) {
  const out = new Map();
  for (const l of graph.lines.values()) for (let i = 0; i < (l.loop ? l.stops.length : l.stops.length - 1); i++) {
    const k = key(l.stops[i], l.stops[(i + 1) % l.stops.length]);
    if (!out.has(k)) out.set(k, []);
    if (!out.get(k).includes(l.id)) out.get(k).push(l.id);
  }
  return out;
}
/** offsetPath(pts, k, i, step = 0.004) -> the polyline moved sideways by (i - (k - 1) / 2) x step (perpendicular, in map units; at a bend the two normals are averaged). */
export function offsetPath(pts, k, i, step = 0.004) {
  const d = (i - (k - 1) / 2) * step;
  if (!d || pts.length < 2) return pts;
  const norm = (p, q) => { const x = q[0] - p[0], y = q[1] - p[1], h = Math.hypot(x, y) || 1; return [-y / h, x / h]; };
  return pts.map((p, j) => {
    const ns = [j > 0 ? norm(pts[j - 1], p) : null, j < pts.length - 1 ? norm(p, pts[j + 1]) : null].filter(Boolean), n = [ns.reduce((s, v) => s + v[0], 0) / ns.length, ns.reduce((s, v) => s + v[1], 0) / ns.length];
    return [r4(p[0] + n[0] * d), r4(p[1] + n[1] * d)];
  });
}

const modeLook = (graph, id, width) => {   // the look of a link or a walk in a mode (§2.2)
  const m = graph.modes[id] || {}, road = m.trip === 'road', air = m.trip === 'air';
  return { color: m.color || (road ? '--muted' : '--ink'), width: road ? 1.2 : air ? 1.4 : width, dash: m.dash || (road ? [1, 4] : air ? [6, 4] : null) };
};
/** The path of the segment a -> b of a line (octilinear, shifted when other lines share it). */
function segment(graph, shared, a, b, lineId, posOf, aspect, prev) {
  const pa = posOf(a), pb = posOf(b);
  if (!pa || !pb) return null;
  const pts = octo(pa, pb, aspect, prev ? posOf(prev) : undefined), ls = lineId ? shared.get(key(a, b)) || [] : [];
  return ls.length > 1 ? offsetPath(pts, ls.length, ls.indexOf(lineId)) : pts;
}
const layer = (id, type, style, features) => ({ id, type, slot: 'routes', style, features });
const segs = l => { const n = l.stops.length; return Array.from({ length: l.loop ? n : n - 1 }, (_, i) => [l.stops[i], l.stops[(i + 1) % n], i > 0 ? l.stops[i - 1] : undefined]); };

/** transitLayers(graph, view, { posOf, viewOf, nodePos, lang, t, nameOf, hasMarker, viewTitle, style, aspect }) -> synthetic layers in drawing order (§4.2-§4.4); empty ones are left out.
 *  viewOf(stationId) = the view a station is drawn on (for stubs); nodePos(nodeId) = where a node is drawn (a district given as a node and a radius); t(key) = a kernel word; aspect = height / width. */
export function transitLayers(graph, view, { posOf, viewOf, nodePos, lang, t = fallbackT, nameOf, hasMarker = () => false, viewTitle = id => id, style, aspect = 1 } = {}) {
  const T = graph.transit, st = style || T.style || {}, width = st.width || 2.5, labels = st.labels !== false, shared = sharedOffsets(graph);   // A10-lite (D42): thin lines
  const name = id => (nameOf ? nameOf(id) : stationName(T, id, lang));
  const dist = { by: {} }, ar = [], lk = { by: {} }, ln = { by: {} }, lkF = [], lnF = [], dots = { by: { s: { size: 7, fill: '--map-label-ink', color: '--map-label-ink' }, x: { size: 11, fill: '#ffffff', color: '--map-label-ink', width: 2 } } }, dotF = [];
  const rank = { by: { r1: { size: 'body', tone: 'plain' }, r2: { size: 'small', tone: 'chip' }, r3: { size: 'micro', tone: 'plain', opacity: 0.85 } } }, rankF = [];
  const badge = { by: { stub: { size: 'micro', tone: 'chip' } } }, badgeF = [];
  for (const d of T.districts || []) {
    if (d.view !== view) continue;
    const k = kind('d', `${d.function}-${d.danger}`), o = DANGER[d.danger] || DANGER[0], color = (st.functions?.[d.function]?.color) || PALETTE[d.function] || PALETTE.other;
    const at = d.node !== undefined ? nodePos?.(d.node) : null, geo = d.pts ? { pts: d.pts } : at ? { at, r: d.r } : null;
    if (!geo) continue;
    dist.by[k] = { fill: color, fill_opacity: 0, color: o.color || color, width: o.width, dash: o.dash };   // A10-lite (D42): zones untinted — the outline and the legend carry the colour
    ar.push({ view, kind: k, ...geo });
    if (labels) {
      const c = d.pts ? centroid(d.pts) : at, words = [pickName(d, lang), t(functionLabelKey(d.function))];
      if (d.danger > 0) words.push(t('transit.danger.' + d.danger));
      rankF.push({ view, at: c, kind: 'r1', label: words.join(' · ') });
    }
  }
  const stub = (a, b, other) => {   // an edge that leaves the open view: a chip at the station on this view
    const ov = viewOf?.(other);
    if (posOf(a) && !posOf(b) && ov && ov !== view) badgeF.push({ view, at: posOf(a), kind: 'stub', label: `→ ${name(other)} · ${viewTitle(ov)}` });
  };
  for (const k of T.links || []) {
    const p = segment(graph, shared, k.from, k.to, null, posOf, aspect);
    if (p) { lkF.push({ view, pts: p, kind: kind('k', k.mode) }); lk.by[kind('k', k.mode)] = modeLook(graph, k.mode, width); } else { stub(k.from, k.to, k.to); stub(k.to, k.from, k.from); }
  }
  for (const l of graph.lines.values()) {
    const kd = kind('l', l.id);
    for (const [a, b, prev] of segs(l)) { const p = segment(graph, shared, a, b, l.id, posOf, aspect, prev); if (p) { lnF.push({ view, pts: p, kind: kd }); ln.by[kd] = { color: l.color, width, halo: true }; } else { stub(a, b, b); stub(b, a, a); } }
    const on = l.stops.filter(s => posOf(s));
    if (l.number && on.length) for (const s of [...new Set(l.loop ? [on[0]] : [on[0], on[on.length - 1]])]) { badgeF.push({ view, at: posOf(s), kind: kind('n', l.id), label: l.number }); badge.by[kind('n', l.id)] = { color: l.color, size: 'small', tone: 'chip', badge: true }; }
  }
  for (const s of T.stations) {
    const p = posOf(s.id);
    if (!p || s.hidden) continue;
    const x = graph.interchanges.has(s.id);
    dotF.push({ view, at: p, kind: x ? 'x' : 's' });
    if (labels && !hasMarker(s.id)) rankF.push({ view, at: p, kind: x ? 'r2' : 'r3', label: name(s.id) });
  }
  return [layer('transit-districts', 'area', dist, ar), layer('transit-links', 'line', lk, lkF), layer('transit-lines', 'line', ln, lnF), layer('transit-stations', 'point', dots, dotF),
    layer('transit-labels', 'label', rank, rankF), layer('transit-badges', 'label', badge, badgeF)].filter(l => l.features.length);
}
const pickName = (o, lang) => (typeof lang === 'string' && (o.i18n?.[lang]?.name ?? o.i18n?.[lang.split('-')[0]]?.name)) || o.name;

/** planLayers(graph, plan, view, { posOf, endPos, viewOf, suggested, viewTitle, style, aspect }) -> synthetic layers of a plan on `view` (§4.5); endPos('from' | 'to') = where the places themselves are. */
export function planLayers(graph, plan, view, { posOf, endPos, viewOf, suggested = false, viewTitle = id => id, style, aspect = 1 } = {}) {
  const width = (style || graph.transit.style || {}).width || 2.5, shared = sharedOffsets(graph), lines = { by: {} }, pts = { by: {} }, lab = { by: { 'p-stub': { size: 'micro', tone: 'chip' } } }, lf = [], pf = [], bf = [];
  const dash = suggested ? [8, 6] : null, opacity = suggested ? 0.8 : 1;
  plan.legs.forEach((leg, i) => {
    if (leg.kind === 'walk') {   // an access walk joins the place and its station; a direct walk joins the two places
      const st = leg.stops.length ? posOf(leg.stops[0]) : null;
      const a = !leg.stops.length ? endPos?.('from') : i === 0 ? endPos?.('from') : st, b = !leg.stops.length ? endPos?.('to') : i === 0 ? st : endPos?.('to');
      if (a && b) { lf.push({ view, pts: [a, b], kind: 'p-walk' }); lines.by['p-walk'] = { color: '--accent', width: 2, dash: [1, 4], opacity }; }
      return;
    }
    const m = modeLook(graph, leg.mode, width), l = leg.line ? graph.lines.get(leg.line) : null, kd = leg.kind === 'ride' ? kind('p', leg.line) : kind('p-k', leg.mode);
    lines.by[kd] = leg.kind === 'ride' ? { color: l.color, width: width + 3, halo: true, dash, opacity } : { color: m.color, width: m.width + 1, dash: dash || m.dash, opacity };
    for (let j = 0; j + 1 < leg.stops.length; j++) {
      const [a, b] = [leg.stops[j], leg.stops[j + 1]], p = segment(graph, shared, a, b, leg.line, posOf, aspect, j ? leg.stops[j - 1] : undefined);
      if (p) lf.push({ view, pts: p, kind: kd });
      else for (const [x, y] of [[a, b], [b, a]]) { const ov = viewOf?.(y); if (posOf(x) && ov && ov !== view) bf.push({ view, at: posOf(x), kind: 'p-stub', label: `→ ${viewTitle(ov)}` }); }
    }
    if (i > 0 && posOf(leg.stops[0])) { pf.push({ view, at: posOf(leg.stops[0]), kind: 'p-change' }); pts.by['p-change'] = { size: 12, fill: '#ffffff', color: '--map-label-ink', width: 2 }; }
  });
  const first = plan.legs[0], last = plan.legs[plan.legs.length - 1];
  const s = endPos?.('from') || (first.stops.length ? posOf(first.stops[0]) : null), e = endPos?.('to') || (last.stops.length ? posOf(last.stops[last.stops.length - 1]) : null);
  if (s) { pf.push({ view, at: s, kind: 'p-start' }); pts.by['p-start'] = { size: 12, fill: '--ok', color: '--ok' }; }
  if (e) { pf.push({ view, at: e, kind: 'p-end' }); pts.by['p-end'] = { size: 12, fill: '--alert', color: '--alert', pulse: !suggested }; }
  return [layer('route-plan-lines', 'line', lines, lf), layer('route-plan-points', 'point', pts, pf), layer('route-plan-labels', 'label', lab, bf)].filter(l => l.features.length);
}

/** pathOf(graph, plan, view, posOf, aspect = 1) -> one polyline of the plan's rides and links on `view` (without parallel offsets); [] when no leg is on the view. */
export function pathOf(graph, plan, view, posOf, aspect = 1) {
  const out = [];
  for (const leg of plan.legs) if (leg.kind !== 'walk') for (let j = 0; j + 1 < leg.stops.length; j++) {
    const [a, b] = [leg.stops[j], leg.stops[j + 1]], pa = posOf(a), pb = posOf(b);
    if (!pa || !pb) continue;
    for (const p of octo(pa, pb, aspect, j ? posOf(leg.stops[j - 1]) || undefined : undefined)) { const q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p); }
  }
  return out;
}
