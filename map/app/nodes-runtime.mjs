// The viewer's node tree (docs/kernel-schema.md §3, §4): the loaded schema-1 registry converted once by compat-v1 and read through
// core/nodes.mjs. The consumers ask "which maps lead here, which maps are below this one, which flat map stands for this 3D page";
// none of them walks `maps.<id>.parent` any more. Pure: no DOM, no host globals, no storage.
// A "map id" is an id of the registry: a node (world, layer, site, estate, zone) or a view (a 3D page shown by landmark nodes).
import { fromV1 } from '../core/compat-v1.mjs';
import { buildTree, positionOf, levelsOf } from '../core/nodes.mjs';
import { makeGeo, taxonomyOf } from '../core/event-geo.mjs';

const FLAT = new Set(['tiles', 'image']);
const viewIds = n => (typeof n.view === 'string' ? [n.view] : Array.isArray(n.view) ? n.view.filter(v => typeof v === 'string') : []);

/**
 * makeRuntime({ manifest, maps, world, names, plan, lang }) -> the read API below (same inputs as compat-v1 `fromV1`).
 *   crumbs(id)    map ids from the root to `id` (inclusive); nodes of the tree that are not maps (groups, landmarks) are skipped
 *   parent(id)    nearest ancestor map id | null          ancestors(id)  the same, nearest first      children(id)  map ids whose parent is `id`
 *   levels(id)    K-R35 level switcher of the map (map ids; [] below two)
 *   strip(id)     the layer strip of a map: its group's levels (declared by the pack), a single-layer group = its own one button, no group = []
 *   kind(id)      kind of the map's own view ('tiles', 'model3d', ...) | null              isScene(id)  a 3D page
 *   standIn(id)   { map, marker } | null: the flat map (and the marker on it) that stands for a 3D page (K-R31, K-R32)
 *   zoneChildren(id)  { region id: [map id] } the children of `id` that are anchored to a region (zone) of its 3D page; {} when none
 *   anchorIn(id)  the region of the parent's 3D page that `id` is anchored to | null (a marker anchor on a flat parent is not a region)
 *   host(id)      the node that stands for the map: itself, or for a 3D page the landmark that shows it
 *   geo()         the event geography of the tree (core/event-geo.mjs, built on first use): where a place text or a node belongs, and where its pin goes
 * A 3D page shown by landmarks under several places belongs to the place of the last-declared one (v1 kept one `parent` per page);
 * its stand-in is the first landmark of that place that shows it.
 */
export function makeRuntime(inputs = {}) {
  const { pack, custom } = fromV1(inputs), views = pack.views || {}, ui = pack.ui || {}, tree = buildTree(pack.nodes, { title: pack.title });
  const maps = inputs.maps && typeof inputs.maps.maps === 'object' && inputs.maps.maps ? inputs.maps.maps : {};
  const ids = Object.keys(maps), isMap = id => Object.hasOwn(maps, id);
  const shown = new Map();   // view id -> the nodes (declaration order) that list it
  for (const n of pack.nodes || []) for (const v of viewIds(n)) shown.set(v, [...(shown.get(v) || []), n.id]);
  const host = id => {
    if (tree.has(id)) return id;
    const hs = shown.get(id) || []; if (!hs.length) return null;
    const place = tree.parent(hs[hs.length - 1]);
    return hs.find(h => tree.parent(h) === place);
  };
  const up = new Map(ids.map(id => {   // a map the tree does not know (planned, unbuilt) has no place in it
    const h = host(id);
    return [id, h === null ? null : [h, ...tree.ancestors(h)].find(a => a !== id && isMap(a)) ?? null];
  }));
  const parent = id => up.get(id) ?? null;
  const ancestors = id => { const out = []; for (let p = parent(id); p && !out.includes(p) && out.length < 64; p = parent(p)) out.push(p); return out; };
  const kind = id => views[id]?.kind || null;
  const levels = id => { const h = host(id); return h === null ? [] : levelsOf(tree, views, ui, h).filter(isMap); };
  const standIn = id => {
    if (kind(id) !== 'model3d') return null;
    const h = host(id); if (h === null) return null;
    for (const n of [h, ...tree.ancestors(h)]) {   // the nearest position of the page (or of what contains it) that is on a flat map
      const p = positionOf(tree, views, n);
      if (p && FLAT.has(views[p.view]?.kind)) return { map: p.view, marker: p.anchor ?? null };
    }
    return null;
  };
  let geo = null;
  return {
    tree, views, ui, host, geo: () => (geo ??= makeGeo({ tree, views, lang: pack.lang, lexicon: pack.lexicon, custom, ...taxonomyOf(pack) })), kind, standIn, parent, ancestors,
    has: id => isMap(id) && (tree.has(id) || shown.has(id)),
    crumbs: id => [...ancestors(id).reverse(), id],
    children: id => ids.filter(k => up.get(k) === id),
    levels,
    isScene: id => kind(id) === 'model3d',
    strip: id => {   // the K-R35 sibling fallback (levels of sites that belong to other groups) is not this map's strip
      const g = maps[id]?.group; if (!g) return [];
      const lv = levels(id); return lv.includes(id) && lv.every(k => maps[k]?.group === g) ? lv : [id];
    },
    anchorIn: id => { const a = tree.get(id)?.anchor; return typeof a === 'string' && a && kind(parent(id)) === 'model3d' ? a : null; },
    zoneChildren: id => {
      const out = {}; if (kind(id) !== 'model3d') return out;
      for (const k of ids) { if (up.get(k) !== id) continue; const a = tree.get(k)?.anchor; if (typeof a === 'string' && a) (out[a] ||= []).push(k); }
      return out;
    },
  };
}

// ---- the viewer's one runtime: built at boot from the loaded registry, rebuilt when the registry changes (boot, plan arrives) ----
export let RT = null;
export function buildRuntime(inputs) {
  try { RT = makeRuntime(inputs); } catch (e) { RT = null; }   // silent self-heal: without a tree the consumers below answer "no ancestors"
  return RT;
}
export const crumbs = id => RT?.crumbs(id) ?? [id];
export const parentMap = id => RT?.parent(id) ?? null;
export const childMaps = id => RT?.children(id) ?? [];
export const standIn = id => RT?.standIn(id) ?? null;
export const anchorIn = id => RT?.anchorIn(id) ?? null;
export const zoneChildren = id => RT?.zoneChildren(id) ?? {};
export const strip = id => RT?.strip(id) ?? null;   // null = no runtime: the caller falls back to the registry's groups
export const isScene = id => !!RT?.isScene(id);
export const eventGeo = () => RT?.geo() ?? null;   // null without a runtime: events are then listed and not drawn

// ---- what the pack says about the view as a whole (docs/kernel-schema.md K-R70): flags on the view, the group the world map starts on, the level the event list falls back to ----
export const viewField = (id, k) => RT?.views?.[id]?.[k];   // e.g. 'x-clouds', 'x-tint'
/** The group whose place is the focus of the world view (the map the viewer starts on), else the registry's first group; null when there are none. */
export const worldGroup = reg => {
  const gs = reg?.groups && typeof reg.groups === 'object' ? reg.groups : {}, f = Object.values(reg?.maps || {}).find(m => m?.kind === 'world')?.view?.focus;
  return Object.keys(gs).find(k => gs[k]?.place === f) ?? Object.keys(gs)[0] ?? null;
};
/** The map the event list falls back to while no tier is open: the pack's `ui["x-event-level"]`, else the first flat layer of the world group (the first layer when none is flat). */
export const eventLevel = reg => {
  const lv = RT?.ui?.['x-event-level'], ls = reg?.groups?.[worldGroup(reg)]?.layers || [];
  return (reg?.maps?.[lv] ? lv : null) ?? ls.find(k => reg?.maps?.[k]?.kind === 'points') ?? ls[0] ?? '';
};
/** The world-map place names of the groups that have `mapId` among their layers (places = the world's places and fiefs): "this map belongs to that place". */
export const groupPlaces = (reg, places, mapId) => Object.values(reg?.groups || {}).filter(g => (g?.layers || []).includes(mapId)).map(g => (places || []).find(q => q.id === g.place)?.name).filter(Boolean);
/** Does the place text name the node of map `id`, or a node above it (a place that covers the whole view, e.g. "the whole city")? */
export const inScope = (text, id) => {
  const g = RT?.geo(), n = g?.place(text)?.node, h = RT?.host(id);
  return !!n && !!h && (n === h || g.tree.ancestors(h).includes(n));
};
