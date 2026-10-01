// Entity protocol (docs/kernel-schema.md K-R71, K-R73; design docs/entity-protocol.md §2, §4). Pure: no DOM, no globals, no storage.
// People, items and events are entities on nodes, derived from the rows the host already sends; an entity is never stored as such.
//   Entity = { kind, id, name, node, place, source, msgIndex, present?, data }     node: node id | null (place unknown); data: the original row, untouched
//   personOf(row, nodeOf) / eventOf(row, nodeOf)   adapters; nodeOf(text) -> node id | null, and may carry nodeOf.has(id) (does the receiver's tree know this id)
//   presentAt(entities, here)                      PresentEntities: the entities with `present` set, or standing at node `here`
//   itemOf(row, nodeOf, source)                    item adapter (store row, world-stash row or in-card row); source = the channel when the row does not carry `src`
//   itemGroups({ store, legacy, world, card, here, hereMarker, taken, nodeOf })   the Items tab's four groups (K-R76): { carried, here, other: [{ place, rows }], card }
//   levelMode({ children, viewField }, mapId)      'macro' | 'micro' | null: the level of the open view (K-R73)
//   peopleSections({ people, tree, owner, here, mode })   the present group's sections, [{ key, node?, rows }]; [] = draw the flat list
import { normName } from './roster.mjs';

export const KINDS = Object.freeze(['person', 'item', 'event']);

const isInt = n => Number.isInteger(n);
// node by reference when the receiver's tree has the id, else located from the place text (K-R71 rule 2); null when there is no place
function nodeFor(row, nodeOf) {
  if (typeof row.node === 'string' && row.node !== '' && nodeOf?.has?.(row.node)) return row.node;
  return row.place ? (nodeOf?.(row.place) ?? null) : null;
}

export function personOf(row, nodeOf) {
  const src = row.src === 'tag' ? 'chat' : row.src ? row.src : 'infer';
  return { kind: 'person', id: normName(row.name), name: row.name, node: nodeFor(row, nodeOf), place: row.place || '', source: src,
    msgIndex: isInt(row.floor) ? row.floor : null, present: !!row.present, data: row };
}

export function eventOf(row, nodeOf) {
  return { kind: 'event', id: row.id, name: row.cat || '', node: nodeFor(row, nodeOf), place: row.place || '',
    source: row.src === 'op' ? 'op' : row.feed ? 'feed' : 'chat', msgIndex: isInt(row.last) ? row.last : null, data: row };
}

// an unknown place (node null) is never "here": `here` null matches nothing
export const presentAt = (entities, here) => (entities || []).filter(e => e.present === true || (here != null && e.node === here));

export function levelMode({ children, viewField } = {}, mapId) {
  if (!mapId || typeof children !== 'function') return null;
  const f = typeof viewField === 'function' ? viewField(mapId, 'x-people') : undefined;
  if (f === 'macro' || f === 'micro') return f;
  return (children(mapId) || []).length > 0 ? 'macro' : 'micro';
}

/**
 * people: [{ node, present, row, ... }]. Each person goes to the first section that takes them, in this order:
 *   here (present, or standing at the player's node) · macro only: n:<child> for each child node of `owner` (declaration order; the node is the child or inside it)
 *   · map (macro: the owner itself; micro: the owner or inside it) · else (a node outside the owner's subtree) · unknown (no node).
 * Empty sections are dropped. [] when the level is unknown, the owner is not in the tree, or fewer than two sections are left (the caller draws the flat list).
 */
export function peopleSections({ people, tree, owner, here, mode } = {}) {
  if (!mode || !owner || typeof tree?.has !== 'function' || !tree.has(owner)) return [];
  const inside = (n, top) => n === top || (tree.has(n) && tree.ancestors(n).includes(top));   // a node the tree does not have is inside nothing
  const kids = mode === 'macro' ? tree.children(owner) : [];
  const secs = [{ key: 'here', rows: [] }, ...kids.map(k => ({ key: 'n:' + k, node: k, rows: [] })), { key: 'map', rows: [] }, { key: 'else', rows: [] }, { key: 'unknown', rows: [] }];
  const by = Object.fromEntries(secs.map(s => [s.key, s]));
  for (const p of Array.isArray(people) ? people : []) {
    const n = p.node ?? null;
    let key;
    if (p.present === true || (here != null && n === here)) key = 'here';
    else if (n === null) key = 'unknown';
    else {
      const k = kids.find(c => inside(n, c));
      if (k !== undefined) key = 'n:' + k;
      else if (mode === 'macro' ? n === owner : inside(n, owner)) key = 'map';
      else key = 'else';
    }
    by[key].rows.push(p);
  }
  const out = secs.filter(s => s.rows.length);
  return out.length < 2 ? [] : out.map(s => (s.node === undefined ? { key: s.key, rows: s.rows } : s));
}

/** Item entity. A store row carries `src` (text, map, api, legacy); a world-stash row is source 'world', an in-card row 'mvu'. A world row whose place text does not
 *  locate falls back to its marker id when the receiver's tree has it (a marker is a node, K-R28). */
export function itemOf(row, nodeOf, source) {
  let node = nodeFor(row, nodeOf);
  if (node === null && typeof row.marker === 'string' && nodeOf?.has?.(row.marker)) node = row.marker;
  return { kind: 'item', id: row.id === undefined ? '' : String(row.id), name: row.name || '', node, place: row.place || '', source: row.src || source || 'legacy',
    msgIndex: isInt(row.msgIndex) ? row.msgIndex : null, data: row };
}

// a legacy `eden-map:inv.items` row ({ id, 名, 地点, 层, 暗格, 说明?, 数量? }) as a store row that is not carried (an old host sends no `stash`)
const fromLegacy = r => ({ id: r.id, name: r.名, place: r.地点 || '', map: r.层 || '', hidden: !!r.暗格, ...(r.说明 ? { note: r.说明 } : {}), ...(r.数量 > 1 ? { qty: r.数量 } : {}), src: 'legacy', carried: false, msgIndex: null });
const byPlace = (a, b) => (a.place === '' ? 1 : b.place === '' ? -1 : a.place < b.place ? -1 : a.place > b.place ? 1 : 0);   // code-point order, "no place" last

/**
 * The Items tab's groups (docs/entity-protocol.md §6.1). store = `eden-map:inv.stash.rows` (null for an old host: `legacy` rows are used, none carried), world = the world-stash
 * rows, card = the card's own rows (read only), taken = ids already in the store, here = the player's node, hereMarker = the landmark the location places the player at.
 *   carried  store rows with carried: true
 *   here     own rows (carried: false) at `here` + world rows at `here` that are not taken (a hidden one only on its own spot)
 *   other    the remaining own rows, one { place, rows } per place (code-point order, '' last)
 *   card     the in-card rows
 */
export function itemGroups({ store, legacy, world, card, here = null, hereMarker = '', taken, nodeOf } = {}) {
  const own = (Array.isArray(store) ? store : (Array.isArray(legacy) ? legacy : []).map(fromLegacy)).map(r => itemOf(r, nodeOf, r.src));
  const gone = new Set([...(taken || []), ...own.map(e => e.id)]);   // the store's ids are always taken
  const out = { carried: [], here: [], other: [], card: [] }, places = new Map();
  for (const e of own) {
    if (e.data.carried === true) { out.carried.push(e); continue; }
    if (here != null && e.node === here) { out.here.push(e); continue; }
    if (!places.has(e.place)) places.set(e.place, []);
    places.get(e.place).push(e);
  }
  for (const r of Array.isArray(world) ? world : []) {
    if (!r || gone.has(r.id)) continue;
    const e = itemOf(r, nodeOf, 'world');
    if (here != null && e.node === here && (!r.hidden || r.marker === hereMarker)) out.here.push(e);
  }
  out.other = [...places].map(([place, rows]) => ({ place, rows })).sort(byPlace);
  out.card = (Array.isArray(card) ? card : []).filter(r => r && r.name).map(r => itemOf(r, nodeOf, 'mvu'));
  return out;
}
