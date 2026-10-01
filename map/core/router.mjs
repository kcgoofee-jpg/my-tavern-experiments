// The router (docs/kernel-schema.md K-R109, docs/transit-schema.md §3): the graph of a transit block, where a place attaches to it, the cheapest plan
// (minutes, then changes, then stops, then declaration order), the host's re-check of a plan, the plan as text and the validated "suggest a route" op.
// Pure: no DOM, no storage, no host globals. The search is a priority queue over (station, current line, has ridden) states with a virtual source
// and target; the same inputs always give the same plan.
import { stationName } from './transit-spec.mjs';

export const KERNEL_TEMPLATES = Object.freeze({
  zh: Object.freeze({ route_plan: '计划路线：{legs}。全程约 {min} 分钟，换乘 {changes} 次。', route_leg: '{from} → {to}（{how}，约 {min} 分钟）', route_danger: '途经危险区域（等级 {danger}）。', join: '；' }),
  en: Object.freeze({ route_plan: 'Planned route: {legs}. About {min} min in all, {changes} change(s).', route_leg: '{from} → {to} ({how}, about {min} min)', route_danger: 'Passes a dangerous district (level {danger}).', join: '; ' }),
});
const r1 = v => Math.round(v * 10) / 10, r6 = v => Math.round(v * 1e6) / 1e6;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };

/** buildGraph(transit) -> { transit, stations, lines, modes, options, adj, linesAt, interchanges, order, byNode } | null (no network). */
export function buildGraph(transit) {
  if (!isObj(transit) || !Array.isArray(transit.stations) || !transit.stations.length) return null;
  const stations = new Map(transit.stations.map(s => [s.id, s])), order = new Map(transit.stations.map((s, i) => [s.id, i]));
  const lines = new Map((transit.lines || []).map(l => [l.id, l])), adj = new Map(), linesAt = new Map(), byNode = new Map();
  for (const s of transit.stations) { adj.set(s.id, []); linesAt.set(s.id, new Set()); if (s.node !== undefined) push(byNode, s.node, s.id); }
  for (const l of lines.values()) {
    const n = l.stops.length, segs = l.loop ? n : n - 1;
    for (const st of l.stops) linesAt.get(st).add(l.id);
    for (let i = 0; i < segs; i++) {
      const a = l.stops[i], b = l.stops[(i + 1) % n], min = l.min[i];
      adj.get(a).push({ to: b, kind: 'ride', mode: l.mode, line: l.id, min });
      if (!l.oneway) adj.get(b).push({ to: a, kind: 'ride', mode: l.mode, line: l.id, min });
    }
  }
  for (const k of transit.links || []) {
    adj.get(k.from).push({ to: k.to, kind: 'link', mode: k.mode, line: null, min: k.min });
    if (!k.oneway) adj.get(k.to).push({ to: k.from, kind: 'link', mode: k.mode, line: null, min: k.min });
  }
  const interchanges = new Set();
  for (const [s, ls] of linesAt) if (ls.size >= 2) interchanges.add(s);
  for (const k of transit.links || []) for (const [s, t] of [[k.from, k.to], [k.to, k.from]]) {
    const a = linesAt.get(s), b = linesAt.get(t);
    if (a.size && [...b].some(l => !a.has(l))) interchanges.add(s);
  }
  return { transit, stations, lines, modes: transit.modes || {}, options: transit.options, adj, linesAt, interchanges, order, byNode };
}

const tooClose = (tree, a, b) => !!a && !!b && (a === b || (!!tree && (tree.isAncestor(a, b) || tree.isAncestor(b, a))));
const meters = (env, pa, pb) => { const e = env?.extent?.(pa.view); return e ? Math.hypot((pa.x - pb.x) * e[0], (pa.y - pb.y) * e[1]) : null; };
const posOf = (env, thing) => { const p = thing?.pos ?? env?.pos?.(thing); return p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.view ? p : null; };

/** attach(graph, end, env) -> [{ station, min, how }]; end = { node?, pos? }, env = { tree?, pos?(stationOrEnd), extent?(view) } (§3.2). */
export function attach(graph, end, env = {}) {
  if (!graph || !isObj(end)) return [];
  const { tree } = env, o = graph.options, all = [...graph.stations.values()];
  if (end.node !== undefined && end.node !== null) {
    const at = graph.byNode.get(end.node);
    if (at) return at.map(station => ({ station, min: 0, how: 'at' }));
    if (tree) {
      for (const a of tree.ancestors(end.node)) if (graph.byNode.has(a)) return graph.byNode.get(a).map(station => ({ station, min: 0, how: 'inside' }));
      const within = all.filter(s => s.node !== undefined && tree.isAncestor(end.node, s.node));
      if (within.length) return within.map(s => ({ station: s.id, min: 0, how: 'within' }));
    }
  }
  const p = posOf(env, end);
  if (!p || !(o.access_max_min > 0)) return [];
  const out = [];
  for (const s of all) {
    const q = posOf(env, s), d = q && q.view === p.view ? meters(env, p, q) : null;
    if (d === null) continue;
    const min = r1(d * o.detour / o.walk_m_per_min);
    if (min <= o.access_max_min) out.push({ station: s.id, min, how: 'walk' });
  }
  return out.sort((a, b) => a.min - b.min || graph.order.get(a.station) - graph.order.get(b.station)).slice(0, 4);
}

class Heap {   // binary min-heap on a comparison function
  constructor(less) { this.a = []; this.less = less; }
  get size() { return this.a.length; }
  add(x) { const a = this.a; let i = a.push(x) - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { let m = i; for (const c of [2 * i + 1, 2 * i + 2]) if (c < a.length && this.less(a[c], a[m])) m = c; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top;
  }
}
const less = (x, y) => x.cost !== y.cost ? x.cost < y.cost : x.legs !== y.legs ? x.legs < y.legs : x.stops !== y.stops ? x.stops < y.stops : x.seq < y.seq;

/** The danger of the districts a set of stations lies in (by the station's own district, else a district on the station's node or an ancestor); null when none is known. */
function dangerOf(graph, ids, tree) {
  let top = null;
  for (const id of ids) {
    const s = graph.stations.get(id);
    const d = (graph.transit.districts || []).find(x => x.id === s?.district) || (s?.district === undefined && s?.node !== undefined && tree
      ? (graph.transit.districts || []).find(x => x.node !== undefined && (x.node === s.node || tree.isAncestor(x.node, s.node))) : null);
    if (d) top = Math.max(top ?? 0, d.danger || 0);
  }
  return top;
}

/** Legs -> the numbers every plan carries; `walk` legs are charged at the minutes they hold, rides and links at the network's (the caller passes them already). */
function finish(graph, legs, tree, base) {
  const stops = legs.flatMap(l => l.stops), total = legs.reduce((t, l) => t + l.min, 0);
  const rides = legs.filter(l => l.kind === 'ride').length, modes = [...new Set(legs.map(l => l.mode))];
  return { ...base, legs, min: Math.max(1, Math.round(total + extra(graph, legs))), changes: Math.max(0, rides - 1), modes, danger: dangerOf(graph, stops, tree) };
}
function extra(graph, legs) {   // waits and transfers (§3.3): charged when a ride boards a line other than the current one
  let cur = null, ridden = false, t = 0;
  for (const l of legs) {
    if (l.kind === 'ride') { if (cur !== l.line) { t += graph.lines.get(l.line).wait + (ridden ? graph.options.transfer_min : 0); cur = l.line; } ridden = true; } else if (l.kind === 'link') cur = null;
  }
  return t;
}
const mergeEdges = path => {   // consecutive rides of one line, and links of one mode, become one leg
  const legs = [];
  for (const e of path) {
    const last = legs[legs.length - 1];
    if (last && last.kind === e.kind && last.mode === e.mode && last.line === e.line) { last.stops.push(e.to); last.min += e.min; } else legs.push({ kind: e.kind, mode: e.mode, line: e.line, stops: [e.from, e.to], min: e.min });
  }
  return legs.map(l => ({ ...l, min: r1(l.min) }));
};
const nameOfEnd = (graph, end, station, tree) => (typeof end.name === 'string' && end.name) || (end.node !== undefined && tree?.get(end.node)?.name) || (station ? stationName(graph.transit, station, undefined, n => tree?.get(n)?.name) : '');
const endOf = (graph, end, station, tree) => ({ node: end.node ?? null, station: station ?? null, name: nameOfEnd(graph, end, station, tree) });

/** planRoute(graph, from, to, { env, modes, src }) -> Plan | null (§3.3, §3.4). */
export function planRoute(graph, from, to, { env = {}, modes = null, src = 'user' } = {}) {
  if (!graph || !isObj(from) || !isObj(to) || tooClose(env.tree, from.node, to.node)) return null;
  const A = attach(graph, from, env), B = attach(graph, to, env), o = graph.options, ok = e => !modes || modes.includes(e.mode);
  const pf = posOf(env, from), pt = posOf(env, to), direct = pf && pt && pf.view === pt.view ? meters(env, pf, pt) : null;
  const dMin = direct === null ? Infinity : r1(direct * o.detour / o.walk_m_per_min);
  const heap = new Heap(less), best = new Map(), targets = new Map(B.map(b => [b.station, b.min]));
  let seq = 0;
  const offer = (n, key) => { const old = best.get(key); if (old && !less(n, old)) return; best.set(key, n); heap.add(n); };
  for (const a of A) offer({ cost: a.min, legs: 0, stops: 0, seq: seq++, station: a.station, line: null, ridden: false, prev: null, edge: null, access: a }, `${a.station}||0`);
  let found = null;
  while (heap.size && !found) {
    const n = heap.pop();
    if (n.term) { found = n; break; }
    if (best.get(`${n.station}|${n.line || ''}|${n.ridden ? 1 : 0}`) !== n) continue;
    if (n.prev && targets.has(n.station)) heap.add({ ...n, term: true, cost: r6(n.cost + targets.get(n.station)), seq: seq++, tail: n });
    for (const e of graph.adj.get(n.station)) {
      if (!ok(e)) continue;
      const board = e.kind === 'ride' && e.line !== n.line;
      const cost = r6(n.cost + e.min + (board ? graph.lines.get(e.line).wait + (n.ridden ? o.transfer_min : 0) : 0));
      const line = e.kind === 'ride' ? e.line : null, ridden = n.ridden || e.kind === 'ride';
      offer({ cost, legs: n.legs + (board ? 1 : 0), stops: n.stops + 1, seq: seq++, station: e.to, line, ridden, prev: n, edge: { ...e, from: n.station } }, `${e.to}|${line || ''}|${ridden ? 1 : 0}`);
    }
  }
  const base = { v: 1, src: src === 'op' ? 'op' : 'user' };
  if (direct !== null && dMin <= 2 * o.access_max_min && (!found || dMin <= found.cost)) {
    const leg = { kind: 'walk', mode: 'walk', line: null, stops: [], min: dMin };
    return finish(graph, [leg], env.tree, { ...base, from: endOf(graph, from, null, env.tree), to: endOf(graph, to, null, env.tree) });
  }
  if (!found) return null;
  const path = []; let n = found.tail;
  for (; n.prev; n = n.prev) path.unshift(n.edge);
  const a = n.access, b = B.find(x => x.station === found.tail.station);
  const legs = [...(a.how === 'walk' ? [{ kind: 'walk', mode: 'walk', line: null, stops: [a.station], min: a.min }] : []), ...mergeEdges(path),
    ...(b.how === 'walk' ? [{ kind: 'walk', mode: 'walk', line: null, stops: [b.station], min: b.min }] : [])];
  return finish(graph, legs, env.tree, { ...base, from: endOf(graph, from, a.station, env.tree), to: endOf(graph, to, b.station, env.tree) });
}

/** checkPlan(graph, plan, { tree }) -> a rebuilt Plan | null (§3.5): minutes recomputed from the network, walks capped, names rebuilt; anything inconsistent is null. */
export function checkPlan(graph, plan, { tree = null } = {}) {
  const NO = null, o = graph?.options;
  if (!graph || !isObj(plan) || plan.v !== 1 || !Array.isArray(plan.legs) || !plan.legs.length || plan.legs.length > 60) return NO;
  const ends = ['from', 'to'].map(k => (isObj(plan[k]) ? plan[k] : {}));
  for (const e of ends) if (e.node !== undefined && e.node !== null && (typeof e.node !== 'string' || (tree && !tree.has(e.node)))) return NO;
  const out = [], n = plan.legs.length;
  for (const l of plan.legs) {
    if (!isObj(l) || !Array.isArray(l.stops) || l.stops.some(s => !graph.stations.has(s))) return NO;
    if (l.kind === 'walk') {
      if (l.mode !== 'walk' || !Number.isFinite(l.min) || l.min < 0 || l.stops.length > 1) return NO;
      if (l.stops.length === 0 && n !== 1) return NO;
      out.push({ kind: 'walk', mode: 'walk', line: null, stops: [...l.stops], min: r1(Math.min(l.min, l.stops.length ? o.access_max_min : 2 * o.access_max_min)) });
      continue;
    }
    if ((l.kind !== 'ride' && l.kind !== 'link') || l.stops.length < 2) return NO;
    let min = 0;
    for (let j = 0; j + 1 < l.stops.length; j++) {
      const hits = graph.adj.get(l.stops[j]).filter(e => e.to === l.stops[j + 1] && e.kind === l.kind && (l.kind === 'ride' ? e.line === l.line : e.mode === l.mode));
      if (!hits.length) return NO;
      min += Math.min(...hits.map(e => e.min));
    }
    if (l.kind === 'ride' && graph.lines.get(l.line)?.mode !== l.mode) return NO;
    out.push({ kind: l.kind, mode: l.mode, line: l.kind === 'ride' ? l.line : null, stops: [...l.stops], min: r1(min) });
  }
  const net = out.filter(l => l.kind !== 'walk');
  if (out.length > 1 || out[0].stops.length) {
    if (!net.length) return NO;
    for (const [i, l] of out.entries()) if (l.kind === 'walk') {
      const nb = i === 0 ? out[1] : out[i - 1], touch = i === 0 ? nb?.stops[0] : nb?.stops[nb.stops.length - 1];
      if ((i !== 0 && i !== out.length - 1) || nb?.kind === 'walk' || touch !== l.stops[0]) return NO;
    }
  }
  for (let i = 0; i + 1 < net.length; i++) if (net[i].stops[net[i].stops.length - 1] !== net[i + 1].stops[0]) return NO;
  const sa = out[0].stops[0], sb = out[out.length - 1].stops[out[out.length - 1].stops.length - 1];
  const direct = out.length === 1 && out[0].kind === 'walk' && !out[0].stops.length;
  return finish(graph, out, tree, { v: 1, src: plan.src === 'op' ? 'op' : 'user', from: endOf(graph, { node: ends[0].node ?? undefined }, direct ? null : sa, tree), to: endOf(graph, { node: ends[1].node ?? undefined }, direct ? null : sb, tree) });
}

const fill = (t, vals) => String(t).replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vals, k) ? String(vals[k]) : ''));
const tplFor = (templates, lang) => {
  const base = /^zh/i.test(String(lang || '')) ? 'zh' : 'en', own = isObj(templates?.[lang]) ? templates[lang] : isObj(templates?.[base]) ? templates[base] : isObj(templates) ? templates : {};
  const pick = k => (typeof own[k] === 'string' && own[k] ? own[k] : KERNEL_TEMPLATES[base][k]);
  return { plan: pick('route_plan'), leg: pick('route_leg'), danger: pick('route_danger'), join: KERNEL_TEMPLATES[base].join, sep: base === 'zh' ? '' : ' ' };
};
/** planText(plan, { lang, templates, nameOf, modeLabel, lineName }) -> the plan as a sentence (§5.3); never throws, a missing name is `?`. */
export function planText(plan, { lang = 'zh', templates, nameOf, modeLabel, lineName } = {}) {
  try {
    const t = tplFor(templates, lang), nm = id => String(nameOf?.(id) ?? '?'), legs = Array.isArray(plan?.legs) ? plan.legs : [];
    const parts = legs.map((l, i) => {
      const st = Array.isArray(l.stops) ? l.stops : [], a = st.length ? nm(st[0]) : plan.from?.name || '?', b = st.length ? nm(st[st.length - 1]) : plan.to?.name || '?';
      const [from, to] = l.kind === 'walk' && st.length === 1 ? (i === 0 ? [plan.from?.name || '?', a] : [a, plan.to?.name || '?']) : [a, b];
      const how = l.kind === 'ride' ? String(lineName?.(l.line) ?? '?') : String(modeLabel?.(l.mode) ?? '?');
      return fill(t.leg, { from, to, how, min: Math.max(1, Math.round(l.min)) });
    });
    const main = fill(t.plan, { legs: parts.join(t.join), min: plan?.min ?? '?', changes: plan?.changes ?? 0 });
    return plan?.danger >= 2 ? main + t.sep + fill(t.danger, { danger: plan.danger }) : main;
  } catch (e) { return ''; }
}

/** routeOp(op, { graph, locate, here, floor, map, tree }) -> { from, to, fromNode, toNode, why, floor, map } | null (§3.5); `locate(text)` -> a node id or null, `here` = the current node id or { node, name }. */
export function routeOp(op, { graph, locate, here, floor, map, tree = null } = {}) {
  const t = (v, max) => typeof v === 'string' && v.trim() !== '' && [...v].length <= max;
  if (!graph || !isObj(op) || typeof locate !== 'function' || !t(op.to, 40) || (op.from !== undefined && !t(op.from, 40)) || (op.why !== undefined && (typeof op.why !== 'string' || [...op.why].length > 60))) return null;
  const h = isObj(here) ? here : { node: here }, fromText = op.from ?? h.name ?? h.node;
  const toNode = locate(op.to), fromNode = op.from !== undefined ? locate(op.from) : h.node;
  if (typeof toNode !== 'string' || typeof fromNode !== 'string' || typeof fromText !== 'string' || tooClose(tree, fromNode, toNode)) return null;
  return { from: fromText, to: op.to, fromNode, toNode, why: op.why ?? '', floor, map };
}
