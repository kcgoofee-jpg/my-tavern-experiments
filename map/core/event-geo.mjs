// Where an event happens (docs/kernel-schema.md K-R24, K-R51): the place text of an event is placed by nodes.locate over the node
// tree, the same algorithm as the current location. Pure; no card terms: every tier, district and outskirts word is pack data.
//   makeGeo({ tree, views, lang, lexicon, custom }) -> geo          geoFromV1(inputs) -> geo   (inputs of compat-v1 `fromV1`, overlay included)
//   geo.place(text, { here? }) -> null | { node, via, word, map, owner, layer, ring }
//       node   the located node id        map    the view id that draws it (null: no flat map)       owner  the node that owns that map
//       layer  the label of `owner` (its `x-layer`, else its name)              ring   the node is the city's outskirts (`x-ring`)
//   geo.taxonomy()         { events, tag }: the pack's event taxonomy and injected-line tag (K-R49, K-R68); `events` undefined = the kernel's neutral one (K-R53)
//   geo.placeNode(id)      the same result for a node id that is already known (null when the tree lacks it)
//   geo.layerOf(text)      the label of the map that owns the place, '' when it places nowhere       geo.layers()  every such label
//   geo.strip(text, owner) the place text without the leading map label and the names of the places above it ("A·B·C" -> "C")
//   geo.position(node)     positionOf: { view, owner, at } | { view, owner, anchor } | null
//   geo.spot(node)         { x, y, map } when the node has an explicit `at` on its map (a district), else null
//   spotOf(geo, placed, { key, xy, markers, world }) -> { nx, ny, marker?, name?, approx?, ring?, none? }   where the viewer draws the pin (0..1 of the map)
// A point on a map (a node with an explicit `at`) belongs to the map that frames it; any other node belongs to its scope (K-R51).
import { buildTree, vocabulary, locate, positionOf, scopeOf, viewIdsOf } from './nodes.mjs';
import { fromV1 } from './compat-v1.mjs';

const FLAT = new Set(['tiles', 'image']);
const esc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function makeGeo({ tree, views = {}, lang = 'zh', lexicon, custom, events, tag } = {}) {
  const vocab = vocabulary(tree, { custom, lang, lexicon });
  const label = id => { const n = tree.get(id); return n ? (typeof n['x-layer'] === 'string' && n['x-layer'] ? n['x-layer'] : String(n.name ?? '')) : ''; };
  function home(id) {
    const p = positionOf(tree, views, id);
    if (p && p.at) return { owner: p.owner, map: p.view };
    const s = scopeOf(tree, views, id), v = viewIdsOf(tree, views, s)[0];
    return { owner: s, map: v && FLAT.has(views[v]?.kind) ? v : null };
  }
  function placeNode(node, via = 'node', word = '') {   // a node id the tavern script already resolved
    if (!tree.has(node)) return null;
    const { owner, map } = home(node);
    return { node, via, word, map, owner, layer: label(owner), ring: tree.get(node)['x-ring'] === true };
  }
  function place(text, { here } = {}) {
    const t = String(text ?? '').trim(); if (!t) return null;
    const h = locate(t, tree, vocab, { lang, here });
    return h ? placeNode(h.node, h.via, h.word) : null;
  }
  function strip(text, owner) {
    const names = id => [label(id), String(tree.get(id)?.name ?? '')].filter(Boolean);
    const lay = [...new Set(names(owner))], reg = [...new Set(tree.ancestors(owner).filter(a => a !== tree.synth).flatMap(names))];
    let s = String(text ?? '');
    const first = lay.find(l => s.startsWith(l)); if (first) s = s.slice(first.length);
    s = s.replace(/^·+/, '');
    if (lay.length) s = s.replace(new RegExp('^(' + (reg.length ? reg.map(esc).join('|') : '(?!)') + ')?·?(' + lay.map(esc).join('|') + ')·?'), '');
    if (reg.length) s = s.replace(new RegExp('^(' + reg.map(esc).join('|') + ')·'), '');
    return s.replace(/^·+/, '');
  }
  const position = id => (tree.has(id) ? positionOf(tree, views, id) : null);
  const spot = id => { const p = position(id); return p && p.at && FLAT.has(views[p.view]?.kind) ? { x: p.at.x, y: p.at.y, map: p.view } : null; };
  const owners = () => tree.ids().filter(id => id !== tree.synth && FLAT.has(views[viewIdsOf(tree, views, id)[0]]?.kind)).map(label);
  return { tree, views, vocab, label, home, place, placeNode, strip, spot, position, layerOf: text => place(text)?.layer ?? '', layers: () => [...new Set(owners())],
    taxonomy: () => ({ events, tag }) };   // the pack's event taxonomy (K-R49) and injected-line tag, as the tree's pack declared them (undefined: the kernel's neutral one, K-R53)
}

/** { events, tag } of a converted pack: its events block and the tag of its injected line (`llm.templates.<lang>.tag`). */
export const taxonomyOf = pack => ({ events: pack.events, tag: pack.llm?.templates?.[pack.lang]?.tag });

/** inputs of compat-v1 `fromV1` (manifest, maps, world, names, plan, events, overlay, ...) -> geo. */
export function geoFromV1(inputs = {}) {
  const r = fromV1(inputs);
  return makeGeo({ tree: buildTree(r.pack.nodes, { title: r.pack.title }), views: r.pack.views || {}, lang: r.pack.lang, lexicon: r.pack.lexicon, custom: r.custom, ...taxonomyOf(r.pack) });
}

/** A fixed number in [0, 1) for a string: the same event always lands on the same spot. */
export const hash01 = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return (h >>> 0) / 4294967296; };

/**
 * The spot of a placed event (`placed` = geo.place result) on its map. Order: the outskirts ring around the city (a fixed spot 0.6-1.1 map widths out); a world map draws only the node's own
 * `at`; an explicit `xy` ("x,y", 0..1); the node's marker, or the nearest one above it (`markers`: Map id -> { nx, ny, name? } of the map's points file); a district's `at` with a small fixed jitter; else a fixed spot inside the middle of the map, flagged `approx`. `key` seeds the jitter (the event's key or id).
 */
export function spotOf(geo, placed, { key = '', xy = '', markers = null, world = false } = {}) {
  if (!placed) return { nx: .5, ny: .5, approx: true, none: true };
  const at = geo.spot(placed.node), j = hash01(key), j2 = hash01(key + '~');
  if (placed.ring) { const a = j * Math.PI * 2, r = .62 + .5 * hash01(key + '#'); return { nx: .5 + Math.cos(a) * r, ny: .5 + Math.sin(a) * r * .8, approx: true, ring: true }; }
  if (world) return at ? { nx: at.x, ny: at.y, marker: true } : { nx: .5, ny: .5, approx: true, none: true };
  const p = String(xy || '').split(/[,，]/).map(Number);
  if (p.length === 2 && p.every(v => v >= 0 && v <= 1)) return { nx: p[0], ny: p[1] };
  const find = id => (markers ? (typeof markers.get === 'function' ? markers.get(id) : markers[id]) : null);
  let mk = null;   // the node's own marker, else the nearest place above it that has one (a room -> its house)
  for (const id of [placed.node, ...geo.tree.ancestors(placed.node)]) if ((mk = find(geo.position(id)?.anchor ?? id) || find(id))) break;
  if (mk) return { nx: mk.nx, ny: mk.ny, marker: true, name: mk.name };
  if (at) return { nx: at.x + (j - .5) * .04, ny: at.y + (j2 - .5) * .06 };
  return { nx: .2 + .6 * j, ny: .2 + .6 * j2, approx: true };
}
