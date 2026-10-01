// Opening a schema-2 pack in the viewer (docs/kernel-schema.md K-R96): the validated pack is projected, in memory, to the registry shape the
// viewer already draws (maps, markers, virtual point files); the viewer's modules do not read schema 2 themselves. Pure: no DOM, no fetch.
import { buildTree, viewIdsOf, positionOf, viewOf, ROOT_ID } from './nodes.mjs';
import { layoutSchematic, schematicSvg, schematicUrl } from './schematic.mjs';
import { thematicModel } from './thematic.mjs';
import { recheck } from './pack-v2-spec.mjs';
import { under, mediaUrl } from './pack-media.mjs';

const MAP_KINDS = new Set(['tiles', 'image', 'schematic']), isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const str = v => (typeof v === 'string' && v !== '' ? v : '');
const SCHEMATIC = Object.freeze({ kind: 'schematic', layout: 'tree', depth: 2 });
const SIZE = [1600, 1000], DOT_R = 0.03;

/** K-R96 (implicit views): with no `views` block, a schematic view on the root and on every node with children; else {}. Never exported. */
export function implicitViews(pack) {
  if (isObj(pack?.views) && Object.keys(pack.views).length) return {};
  const tree = buildTree(pack?.nodes, { title: pack?.title }), out = {};
  for (const id of tree.ids()) if (id === tree.root || tree.children(id).length) out[id] = { ...SCHEMATIC };
  return out;
}
/** The views the viewer works with: the pack's own, else the implicit ones. */
export const viewsOf = pack => (isObj(pack?.views) && Object.keys(pack.views).length ? pack.views : implicitViews(pack));

const safeId = id => id === ROOT_ID || recheck.id(id) !== null;
const unknownSpot = i => ({ x: +(0.5 + 0.06 * Math.cos(i * 2.4)).toFixed(4), y: +(0.5 + 0.06 * Math.sin(i * 2.4)).toFixed(4) });
const clamp01 = v => Math.min(1, Math.max(0, v));

/**
 * projectV2(pack, { base }) -> { registry, files, problems }
 *   registry  { start, groups: {}, maps } with one map per node whose primary view is tiles, image or schematic (map id = node id);
 *             each map { title, title_en?, kind: 'points', base, data, view: { extent_m }, markers: { id: { name, name_en?, sub?, alias, link? } } }
 *   files     { 'v2/<pack id>/<map id>.json': { extent_m, markers: [{ id, nx, ny, r }] } } (the viewer's JSON cache is seeded with them)
 *   problems  [{ code, id }]: view-tiles-no-base, view-image-no-base, view-path, view-3d-not-shown
 * `base` is the folder of the pack's pictures relative to the viewer ('' = none: card and file packs, no tiles or pictures by path). `remoteOn`: the switch for pictures given by https link (K-R101).
 *  An image view whose frame is a pack picture (`media`) opens it through `mediaUrl`: a data URL, a path under the base, or an https link while the switch is on; refused = problem `view-media`.
 */
export function projectV2(pack, { base = '', remoteOn = false } = {}) {
  const tree = buildTree(pack?.nodes, { title: pack?.title }), views = viewsOf(pack), implicit = !(isObj(pack?.views) && Object.keys(pack.views).length), ui = isObj(pack?.ui) ? pack.ui : {};
  const registry = { start: '', groups: {}, maps: {} }, files = {}, problems = [], pid = str(pack?.id) || 'pack';
  const prim = id => { const v = viewIdsOf(tree, views, id)[0]; return v ? views[v] : null; };
  const owners = new Map();   // node id -> its view (projected kinds only)
  for (const id of tree.ids()) {
    const v = prim(id); if (!v) continue;
    if (v.kind === 'model3d') { problems.push({ code: 'view-3d-not-shown', id }); continue; }
    if (MAP_KINDS.has(v.kind) && safeId(id)) owners.set(id, v);
  }
  const homeOf = id => tree.ancestors(id).find(a => owners.has(a)) ?? null;   // the map a node is drawn on
  const nameOf = id => str(tree.get(id)?.name);
  const en = id => str(tree.get(id)?.i18n?.en?.name);
  const meta = (id, at) => {
    const n = tree.get(id), alias = [...new Set([nameOf(id), ...(Array.isArray(n.alias) ? n.alias : []), ...Object.values(isObj(n.i18n) ? n.i18n : {}).map(l => l?.name)].filter(str))];
    return { name: nameOf(id), ...(en(id) ? { name_en: en(id) } : {}), ...(str(n.sub) ? { sub: n.sub } : {}), alias, ...(id !== at && owners.has(id) ? { link: { map: id, marker: id } } : {}), ...(Array.isArray(n.media) && n.media.length ? { gallery: { id } } : {}) };
  };
  for (const [owner, v] of owners) {
    const extent = Array.isArray(v.extent) && v.extent.length === 2 && v.extent.every(n => typeof n === 'number' && n > 0) ? v.extent : SIZE;
    let source = null, spots = {}, ranks = null;
    if (v.kind === 'schematic') {
      spots = layoutSchematic(tree, owner, { layout: v.layout, depth: v.depth });
      for (const id of Object.keys(spots)) if (!safeId(id)) delete spots[id];
      const model = v['x-style'] === 'thematic' || (implicit && v['x-style'] !== 'plain') ? thematicModel(tree, owner, spots, { lang: pack?.lang }) : null;   // K-R114: tinted branches for a big enough tree
      if (model?.on) ranks = model.ranks;
      source = { type: 'image', url: schematicUrl(schematicSvg(spots, tree, model?.on ? model : undefined)) };
    } else {
      const media = v.kind === 'image' && v.media !== undefined ? mediaUrl(pack?.media?.[v.media], { base, remoteOn }) : null, path = v.src === undefined ? null : under(base, v.src);
      if (v.kind === 'image' && v.media !== undefined) { if (media) source = { type: 'image', url: media }; else problems.push({ code: 'view-media', id: owner }); }
      else if (v.kind === 'tiles' && !base) problems.push({ code: 'view-tiles-no-base', id: owner });
      else if (v.kind === 'image' && !base) problems.push({ code: 'view-image-no-base', id: owner });
      else if (!path) problems.push({ code: 'view-path', id: owner });
      else source = v.kind === 'tiles' ? path : { type: 'image', url: path };
      let k = 0;
      for (const id of tree.ids()) {
        if (id === owner || homeOf(id) !== owner || !safeId(id)) continue;
        const p = positionOf(tree, views, id);
        spots[id] = p && p.owner === owner && p.at ? { x: clamp01(p.at.x), y: clamp01(p.at.y) } : unknownSpot(k++);
      }
    }
    if (!source) continue;
    const path = `v2/${pid}/${owner}.json`, ids = Object.keys(spots);
    files[path] = { extent_m: extent, markers: ids.map(id => ({ id, nx: spots[id].x, ny: spots[id].y, r: DOT_R, ...(ranks?.[id] ? { rank: ranks[id] } : {}) })) };
    registry.maps[owner] = { title: nameOf(owner), ...(en(owner) ? { title_en: en(owner) } : {}), kind: 'points', base: source, data: path, view: { extent_m: extent, width_m: extent[0] }, markers: Object.fromEntries(ids.map(id => [id, meta(id, owner)])) };
  }
  const ok = id => Object.hasOwn(registry.maps, id);
  let s = viewOf(tree, views, str(ui.start) && tree.has(ui.start) ? ui.start : tree.root).owner;
  while (s !== null && !ok(s)) s = tree.parent(s);
  registry.start = s !== null && s !== undefined ? s : Object.keys(registry.maps)[0] || '';
  return { registry, files, problems };
}
