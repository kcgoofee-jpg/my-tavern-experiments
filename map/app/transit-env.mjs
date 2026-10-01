// The viewer's router environment (docs/kernel-schema.md K-R109..K-R112, docs/transit-schema.md §3.2, §5.1, §6): the transit graph of the open pack (built once), where each station and each
// place is drawn (the same path as the trips layer and node features: the node tree's answer for the place text, then the marker anchor from that map's points file, read through the JSON
// cache, so the first answer is asynchronous), and the router's `env`. Nothing is stored; a pack swap starts a new table. Pack text only passes through; no card words here.
import { buildGraph, planRoute } from '../core/router.mjs';
import { stationName, modeLabel, lineName } from '../core/transit-spec.mjs';
import { pathOf } from '../core/transit-geometry.mjs';
import { RT, eventGeo } from './nodes-runtime.mjs';
import { mapRegistry, currentMapId } from './state.mjs';
import { hereRes, drawnAt } from './locate.mjs';
import { getJSON } from './json-cache.mjs';
import { LANG, translateName, localName } from './i18n.mjs';

let memo = { key: null, graph: null, pos: new Map(), nodes: new Map(), ready: null }, trips = new Map();
const fresh = key => { memo = { key, graph: null, pos: new Map(), nodes: new Map(), ready: null }; trips = new Map(); return memo; };
const cur = () => (memo.key === (RT?.transit ?? null) ? memo : fresh(RT?.transit ?? null));

/** graphNow() -> the router graph of the open pack's `transit` block (built once per pack), or null. */
export const graphNow = () => { const m = cur(); return m.key ? (m.graph ??= buildGraph(m.key)) : null; };

async function pointOf(d) {   // a drawn place ({ map, marker } | { map, nx, ny }) -> { view, x, y, marker? }
  if (!d?.map) return null;
  if (d.marker) {
    const data = mapRegistry.maps[d.map]?.data ? await getJSON(mapRegistry.maps[d.map].data) : null, k = (data?.markers || []).find(x => x.id === d.marker);
    return k ? { view: d.map, x: k.ax ?? k.nx, y: k.ay ?? k.ny, marker: true } : null;
  }
  return Number.isFinite(d.nx) && Number.isFinite(d.ny) ? { view: d.map, x: d.nx, y: d.ny } : null;
}
const pointOfText = async text => { try { return await pointOf(drawnAt(hereRes(text), text)); } catch (e) { return null; } };

/** ready() -> a promise of the position table (stations and the nodes the districts name), computed once per pack; stays open to a retry while no place resolves yet. */
export function ready() {
  const m = cur(), g = graphNow();
  if (!g) return Promise.resolve(null);
  return (m.ready ??= (async () => {
    let nodeStations = 0, found = 0;
    for (const s of g.transit.stations) {
      if (s.view && s.at) { m.pos.set(s.id, { view: s.view, x: s.at[0], y: s.at[1] }); continue; }
      if (s.node === undefined) continue;
      nodeStations++;
      const p = await pointOfText(RT?.tree?.get?.(s.node)?.name || ''); if (p) { m.pos.set(s.id, p); found++; }
    }
    for (const d of g.transit.districts || []) if (d.node !== undefined && !m.nodes.has(d.node)) { const p = await pointOfText(RT?.tree?.get?.(d.node)?.name || ''); if (p) m.nodes.set(d.node, p); }
    if (nodeStations && !found) m.ready = null;   // the place index is not built yet: ask again next time
    return m;
  })());
}

export const stationView = id => cur().pos.get(id)?.view ?? null;
/** posOn(view) -> (stationId) => [x, y] when the station is drawn on `view`, else null */
export const posOn = view => id => { const p = cur().pos.get(id); return p && p.view === view ? [p.x, p.y] : null; };
export const nodePosOn = view => nodeId => { const p = cur().nodes.get(nodeId); return p && p.view === view ? [p.x, p.y] : null; };
export const hasMarkerOn = view => id => { const p = cur().pos.get(id); return !!p && p.marker === true && p.view === view; };
export const extentOf = view => { const e = mapRegistry?.maps?.[view]?.view?.extent_m; return Array.isArray(e) && e[0] > 0 && e[1] > 0 ? e : null; };
export const aspectOf = view => { const e = extentOf(view); return e ? e[1] / e[0] : 1; };
export const viewTitle = id => localName(mapRegistry?.maps?.[id], 'title') || String(id);

/** the router's env: the node tree, where a station is drawn (a place carries its own `pos`), the metric extent of a view */
export const envFor = () => ({ tree: RT?.tree ?? null, pos: t => { const p = t?.id ? cur().pos.get(t.id) : null; return p ? { view: p.view, x: p.x, y: p.y } : null; }, extent: extentOf });
export const nameOf = id => stationName(graphNow()?.transit, id, LANG, n => translateName(RT?.tree?.get?.(n)?.name));
export const lineLabel = id => lineName(graphNow()?.transit, id, LANG);
export const modeText = id => modeLabel(graphNow()?.transit, id, LANG);
export const lineColor = id => graphNow()?.lines.get(id)?.color ?? null;

/** endOf(text) -> { node, pos, name } | null: a place text as the router wants it (the tree's node, where the place is drawn); async. */
export async function endOf(text) {
  const t = String(text ?? '').replace('{{user}}', '').trim();
  if (!t || !graphNow()) return null;
  await ready();
  let node = null; try { node = eventGeo()?.place(t)?.node ?? null; } catch (e) {}
  const pos = await pointOfText(t);
  return node || pos ? { node, pos, name: (node && RT?.tree?.get?.(node)?.name) || t } : null;
}
/** planBetween(from, to, opts) -> a Plan | null for two ends (`endOf` results); `opts` = router options (modes, src). */
export const planBetween = (from, to, opts = {}) => { const g = graphNow(); return g && from && to ? planRoute(g, { node: from.node ?? undefined, pos: from.pos ?? undefined, name: from.name }, { node: to.node ?? undefined, pos: to.pos ?? undefined, name: to.name }, { env: envFor(), ...opts }) : null; };
/** the ends of a plan as the router saw them: where each place is drawn on `view` (for the start and end markers) */
export const endPosOn = (ends, view) => k => { const p = ends?.[k]?.pos; return p && p.view === view ? [p.x, p.y] : null; };

const classModes = (g, cls) => (cls ? Object.entries(g.modes).filter(([id, m]) => id !== 'walk' && m.trip === cls || id === 'walk' && cls === 'road').map(([id]) => id) : null);
/**
 * tripRoute(trip, onDone) -> { pts } | null | undefined (K-R112): the polyline of a trip along the network on the open view (OSD units: y x aspect), null when the trip is not routed
 * (an air / teleport trip, no network, an end that does not attach, no plan, fewer than two points here), undefined while the plan is being worked out (onDone runs once it is).
 */
export function tripRoute(trip, onDone) {
  const g = graphNow(); if (!g || !trip || ['air', 'teleport'].includes(trip.mode) || !currentMapId) return null;
  const key = `${trip.from}|${trip.to}|${trip.mode || ''}`, T = trips;
  if (!T.has(key)) {
    T.set(key, undefined);   // pending
    Promise.all([endOf(trip.from), endOf(trip.to)]).then(([a, b]) => {
      const modes = trip.mode ? classModes(g, trip.mode) : null;
      T.set(key, modes && !modes.length ? null : planBetween(a, b, { modes })); if (T === trips) onDone?.();
    }).catch(() => { T.set(key, null); });
    return undefined;
  }
  const c = T.get(key);
  if (c === undefined) return undefined;
  if (!c) return null;
  const asp = aspectOf(currentMapId), pts = pathOf(g, c, currentMapId, posOn(currentMapId), asp).map(([x, y]) => ({ x, y: y * asp }));
  return pts.length >= 2 ? { pts } : null;
}
