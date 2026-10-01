// The node runtime of a schema-2 pack opened in the viewer (docs/kernel-schema.md K-R96): the same read API as nodes-runtime.mjs `makeRuntime`,
// built straight from the pack's node tree and the projected registry (core/pack-v2-view.mjs). Map ids = the projected maps; a map is its own host.
// Pure: no DOM, no host globals, no storage.
import { buildTree, viewIdsOf, levelsOf } from '../core/nodes.mjs';
import { makeGeo, taxonomyOf } from '../core/event-geo.mjs';
import { viewsOf } from '../core/pack-v2-view.mjs';

/** makeRuntimeV2(pack, registry) -> { tree, views, ui, host, geo, kind, standIn, parent, ancestors, has, crumbs, children, levels, isScene, strip, anchorIn, zoneChildren } */
export function makeRuntimeV2(pack, registry) {
  const views = viewsOf(pack), ui = pack?.ui && typeof pack.ui === 'object' ? pack.ui : {}, tree = buildTree(pack?.nodes, { title: pack?.title });
  const maps = registry?.maps && typeof registry.maps === 'object' ? registry.maps : {}, ids = Object.keys(maps), isMap = id => Object.hasOwn(maps, id);
  const up = new Map(ids.map(id => [id, [...tree.ancestors(id)].find(isMap) ?? null]));   // nearest ancestor that is a map
  const parent = id => up.get(id) ?? null;
  const ancestors = id => { const out = []; for (let p = parent(id); p && !out.includes(p) && out.length < 64; p = parent(p)) out.push(p); return out; };
  const kind = id => { const v = viewIdsOf(tree, views, id)[0]; return v ? views[v].kind : null; };
  let geo = null;
  return {
    tree, views, ui, media: (pack?.media && typeof pack.media === 'object' ? pack.media : {}), layers: Array.isArray(pack?.layers) ? pack.layers : [], host: id => id, kind, parent, ancestors, standIn: () => null, zoneChildren: () => ({}), anchorIn: () => null,
    geo: () => (geo ??= makeGeo({ tree, views, lang: pack.lang, lexicon: pack.lexicon, ...taxonomyOf(pack) })),
    has: isMap,
    crumbs: id => [...ancestors(id).reverse(), id],
    children: id => ids.filter(k => up.get(k) === id),
    levels: id => (tree.has(id) ? levelsOf(tree, views, ui, id).filter(isMap) : []),
    isScene: () => false,
    strip: () => [],
  };
}
