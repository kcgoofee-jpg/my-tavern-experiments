// The viewer's node tree (docs/kernel-schema.md §3, §4): the loaded schema-1 registry converted once by compat-v1 and read through
// core/nodes.mjs. The consumers ask "which maps lead here, which maps are below this one, which flat map stands for this 3D page";
// none of them walks `maps.<id>.parent` any more. Pure: no DOM, no host globals, no storage.
// A "map id" is an id of the registry: a node (world, layer, site, estate, zone) or a view (a 3D page shown by landmark nodes).
import { fromV1 } from '../core/compat-v1.mjs';
import { buildTree, positionOf, levelsOf } from '../core/nodes.mjs';

const FLAT = new Set(['tiles', 'image']);
const viewIds = n => (typeof n.view === 'string' ? [n.view] : Array.isArray(n.view) ? n.view.filter(v => typeof v === 'string') : []);

/**
 * makeRuntime({ manifest, maps, world, names, plan, lang }) -> the read API below (same inputs as compat-v1 `fromV1`).
 *   crumbs(id)    map ids from the root to `id` (inclusive); nodes of the tree that are not maps (groups, landmarks) are skipped
 *   parent(id)    nearest ancestor map id | null          ancestors(id)  the same, nearest first      children(id)  map ids whose parent is `id`
 *   levels(id)    K-R35 level switcher of the map (map ids; [] below two)
 *   kind(id)      kind of the map's own view ('tiles', 'model3d', ...) | null              isScene(id)  a 3D page
 *   standIn(id)   { map, marker } | null: the flat map (and the marker on it) that stands for a 3D page (K-R31, K-R32)
 *   host(id)      the node that stands for the map: itself, or for a 3D page the landmark that shows it
 * A 3D page shown by landmarks under several places belongs to the place of the last-declared one (v1 kept one `parent` per page);
 * its stand-in is the first landmark of that place that shows it.
 */
export function makeRuntime(inputs = {}) {
  const { pack } = fromV1(inputs), views = pack.views || {}, ui = pack.ui || {}, tree = buildTree(pack.nodes, { title: pack.title });
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
  const standIn = id => {
    if (kind(id) !== 'model3d') return null;
    const h = host(id); if (h === null) return null;
    for (const n of [h, ...tree.ancestors(h)]) {   // the nearest position of the page (or of what contains it) that is on a flat map
      const p = positionOf(tree, views, n);
      if (p && FLAT.has(views[p.view]?.kind)) return { map: p.view, marker: p.anchor ?? null };
    }
    return null;
  };
  return {
    tree, views, ui, host, kind, standIn, parent, ancestors,
    has: id => isMap(id) && (tree.has(id) || shown.has(id)),
    crumbs: id => [...ancestors(id).reverse(), id],
    children: id => ids.filter(k => up.get(k) === id),
    levels: id => { const h = host(id); return h === null ? [] : levelsOf(tree, views, ui, h).filter(isMap); },
    isScene: id => kind(id) === 'model3d',
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
export const isScene = id => !!RT?.isScene(id);
