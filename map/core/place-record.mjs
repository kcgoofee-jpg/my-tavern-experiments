// One record per place (docs/place-record.md section 2, K-R134): world names, landmarks, buildings, rooms and outdoor zones read as the same shape,
// computed on the spot from the pack's own files; nothing is copied or stored. Pure: no DOM, no host globals, no storage.
// The same functions serve the viewer (the record card), the builder (tools/place_records.mjs -> tools/build_worldbook_addon.py writes the
// world-book entries with entryText) and the tavern script (floor mates for the entry switch). The player's own changes (core/custom-record.mjs)
// lie over the pack's text field by field; the pack's record is never changed.
//
// `pack` (the sources, all optional):
//   nodes     the pack's node list (K-R10..), fields id name type parent alias sub desc facts access media
//   plan      the 3D room table { floors: [{ id, name, z }], rooms: [{ node, floor, name, note, access, area, words, synonyms, poly }], units }
//   addon     [{ id, name, alias, text, use?, estate? }]  places described in their own world-book entry (the text becomes the record's description, `use` its one-line note)
//   building  { title, subtitle, summary }  the building's words (K-R132)
//   zones     [{ id, name, alias, en }] outdoor hotspots;   extras  { room_alias, sub_rooms, vehicle_card }
//   points    { <map id>: { markers: [{ id, nx, ny, ax?, ay? }] } }  flat-map coordinates (nearby places on a flat map)
//   index     { <record id>: [entry id] }  the shipped record -> world-book entry table
import { itemFor, overlay } from './custom-record.mjs';

const arr = v => (Array.isArray(v) ? v : []);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const text = s => String(s ?? '').trim();
const uniq = a => [...new Set(a.filter(Boolean))];
const KIND = { world: 'site', realm: 'site', site: 'site', group: 'site', landmark: 'place', layer: 'place', estate: 'building', room: 'room', zone: 'zone' };
const cache = new WeakMap();
const idOf = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function build(pack) {
  const list = [], by = new Map(), floors = arr(pack.plan?.floors);
  const add = r => { if (!by.has(r.id)) { by.set(r.id, r); list.push(r); } return by.get(r.id); };
  const blank = (id, name, kind, o = {}) => ({ id, name: clean(name), kind, type: '', parent: null, anchor: '', sub: '', use: '', desc: '', facts: [], access: '', rows: [], media: [], alias: [], floors: [], where: '', wb: arr(pack.index?.[id]), ...o });
  const fname = id => floors.find(f => f.id === id)?.name || id, forder = id => { const i = floors.findIndex(f => f.id === id); return i < 0 ? 999 : i; };
  for (const n of arr(pack.nodes)) {
    if (!isObj(n) || typeof n.id !== 'string' || n.type === 'group') continue;
    add(blank(n.id, n.name, KIND[n.type] || 'place', { type: n.type || '', parent: n.parent || null, anchor: n.anchor || '', sub: clean(n.sub), desc: text(n.desc), facts: arr(n.facts).map(clean).filter(Boolean), access: clean(n.access), media: arr(n.media), alias: arr(n.alias).filter(a => a !== n.name) }));
  }
  const buildings = list.filter(r => r.kind === 'building'), main = buildings[0] || null;
  if (main && isObj(pack.building)) {   // the building's words (K-R132): subtitle, summary, and the title as one more name
    const b = pack.building; main.sub = main.sub || clean(b.subtitle); main.desc = main.desc || text(b.summary); if (b.title && b.title !== main.name) main.alias = uniq([...main.alias, clean(b.title)]);
  }
  // rooms: the table's rows that share a node merge into one record (floors in plan order, words and synonyms become names)
  const rows = new Map(); for (const r of arr(pack.plan?.rooms)) if (isObj(r) && r.node) rows.set(r.node, [...(rows.get(r.node) || []), r]);
  const ra = isObj(pack.extras?.room_alias) ? pack.extras.room_alias : {};
  for (const [node, rs] of rows) {
    const rec = by.get(node) || add(blank(node, rs[0].name, 'room', { type: 'room', parent: main?.id || null }));
    const fl = uniq(rs.map(r => r.floor)).sort((a, b) => forder(a) - forder(b));
    rec.floors = fl.map(id => ({ id, name: fname(id) }));
    rec.desc = rec.desc || text(rs.find(r => text(r.note))?.note); rec.access = rec.access || clean(rs.find(r => clean(r.access))?.access);
    const areas = uniq(rs.map(r => r.area).filter(a => Number.isFinite(+a) && +a > 0).map(a => +a)), unit = pack.plan?.units === 'm' ? '㎡' : '';
    if (areas.length && !rec.rows.some(x => x.key === 'area')) rec.rows.push({ key: 'area', label: '面积', text: areas.join(' / ') + (unit ? ' ' + unit : '') });
    rec.alias = uniq([...rec.alias, ...rs.flatMap(r => [...arr(r.words), ...arr(r.synonyms)]), ...arr(ra[rec.name])].map(clean)).filter(a => a !== rec.name);
    const parent = by.get(rec.parent), fnames = rec.floors.map(f => f.name).join(' / '), title = clean(pack.building?.title) || parent?.name || '';
    rec.where = [parent?.name, fnames].filter(Boolean).join(' '); rec.sub = rec.sub || [fnames, title].filter(Boolean).join(' · ');
  }
  for (const s of arr(pack.extras?.sub_rooms)) {   // a hotspot inside a room: its own record under the room's node
    const home = [...rows].find(([, rs]) => rs.some(r => r.id === s.parent))?.[0] || null;   // the plan row it sits in -> that row's node
    const rec = add(blank('sub_' + idOf(s.id), s.name, 'room', { type: 'room', parent: home || main?.id || null, desc: text(s.note), alias: arr(s.alias).map(clean).filter(a => a !== clean(s.name)) }));
    const par = by.get(home); rec.floors = [{ id: s.floor, name: fname(s.floor) }]; rec.where = [par?.name || main?.name, fname(s.floor)].filter(Boolean).join(' '); rec.sub = [rec.floors[0].name, clean(s.where)].filter(Boolean).join(' · ');
  }
  for (const p of arr(pack.addon)) {   // a place with its own world-book text: the text is the description, `use` the one-line 说明 (PLACE-1b)
    const rec = by.get(p.id) || add(blank(p.id, p.name, 'place', { parent: p.estate && main ? main.id : null }));
    rec.desc = text(p.text); rec.use = text(p.use); rec.addon = true; rec.alias = uniq([...rec.alias, ...arr(p.alias).map(clean)]).filter(a => a !== rec.name);
  }
  for (const z of arr(pack.zones)) {   // outdoor hotspots: a node of the same id is enriched, otherwise a zone record under the building
    const rec = by.get(z.id) || add(blank('zone_' + idOf(z.id), z.name, 'zone', { type: 'zone', parent: main?.id || null }));
    rec.alias = uniq([...rec.alias, ...arr(z.alias).map(clean), clean(z.en)]).filter(a => a !== rec.name);
  }
  const v = pack.extras?.vehicle_card;
  if (isObj(v) && v.name) {
    const [first, ...rest] = arr(v.rows);
    add(blank('zone_vehicle', v.name, 'zone', { type: 'zone', parent: main?.id || null, sub: clean(v.sub), desc: text(first?.text), rows: rest.filter(r => r?.label && r?.text).map(r => ({ key: '', label: clean(r.label), text: clean(r.text) })) }));
  }
  return { list, by, floors };
}
const S = pack => { if (!isObj(pack)) return { list: [], by: new Map(), floors: [] }; if (!cache.has(pack)) cache.set(pack, build(pack)); return cache.get(pack); };

/** Every record of the pack, in node order, then the table-only ones (sub-rooms, zones). */
export const records = pack => S(pack).list;
/** One record with the player's fields laid over it (custom = normalised custom data or null); null when the id is unknown.
 *  o.story = { <place name>: [fact] }: facts the story itself established (kept apart from the pack's own). */
export function placeRecord(pack, id, custom = null, o = {}) {
  const rec = S(pack).by.get(id); if (!rec) return null;
  const hit = custom ? itemFor(custom, rec) : null, out = overlay(rec, hit?.item || null, arr(o.story?.[rec.name]).slice(0, 12));
  if (hit) out.itemKey = hit.key; return out;
}
/** The ancestors of a record, top-down, as [{ id, name }]; a record on exactly one floor ends with that floor ({ id: '<parent>#<floor>', name, floor }). */
export function chainOf(pack, id) {
  const { by } = S(pack), r = by.get(id), out = []; if (!r) return out;
  const seen = new Set([id]);
  for (let p = r.parent; p && by.has(p) && !seen.has(p) && out.length < 16; p = by.get(p).parent) { seen.add(p); out.unshift({ id: p, name: by.get(p).name }); }
  if (r.floors.length === 1 && r.parent) out.push({ id: `${r.parent}#${r.floors[0].id}`, name: r.floors[0].name, floor: r.floors[0].id });
  return out;
}
const mid = poly => { const p = arr(poly).filter(a => Array.isArray(a) && a.length >= 2); return p.length ? [p.reduce((s, a) => s + a[0], 0) / p.length, p.reduce((s, a) => s + a[1], 0) / p.length] : null; };
/** The n closest places: a room -> rooms on the same floor by distance between plan polygons; a place on a flat map -> the closest markers of that map. [{ id, name }]. */
export function nearby(pack, id, n = 8) {
  const { by, list } = S(pack), r = by.get(id); if (!r) return [];
  const byDist = (xs, d) => xs.map(x => [d(x), x]).filter(([d0]) => Number.isFinite(d0)).sort((a, b) => a[0] - b[0] || (a[1].name < b[1].name ? -1 : 1)).slice(0, n).map(([, x]) => ({ id: x.id, name: x.name }));
  if (r.kind === 'room' && r.floors.length) {
    const f = r.floors[0].id, at = new Map(); for (const x of arr(pack.plan?.rooms)) if (x.floor === f && x.node && !at.has(x.node)) at.set(x.node, mid(x.poly));
    const me = at.get(id); if (!me) return [];
    return byDist([...at].filter(([k, c]) => k !== id && c && by.has(k) && by.get(k).kind === 'room').map(([k, c]) => ({ id: k, name: by.get(k).name, c })), x => Math.hypot(x.c[0] - me[0], x.c[1] - me[1]));
  }
  const pts = arr(pack.points?.[r.parent]?.markers), mk = x => pts.find(m => m.id === (x.anchor || x.id)), xy = m => [m.ax ?? m.nx, m.ay ?? m.ny], me = mk(r); if (!me) return [];
  const a = xy(me); return byDist(list.filter(x => x.parent === r.parent && x.id !== id && mk(x)).map(x => ({ id: x.id, name: x.name, c: xy(mk(x)) })), x => Math.hypot(x.c[0] - a[0], x.c[1] - a[1]));
}
/** Names that belong to places under two or more buildings (a generic word such as a hallway): { name: true }. */
export function sharedNames(pack) {
  const { list, by } = S(pack), own = id => { for (let p = by.get(id)?.parent, i = 0; p && i < 16; p = by.get(p)?.parent, i++) if (by.get(p)?.kind === 'building') return p; return ''; };
  const seen = new Map(), out = {};
  for (const r of list) { const o = seen.get(r.name); if (o === undefined) seen.set(r.name, own(r.id)); else if (o !== own(r.id)) out[r.name] = true; }
  return out;
}
/** The resolver core/custom-record.mjs migrateKeys needs: a place name (or one of its other names) -> its node id, or null.
 *  The first record of a name wins, so a name that several records share (a generic word) never moves an item. */
export const idFinder = pack => {
  const m = new Map();
  for (const r of records(pack)) { if (r.name && !m.has(r.name)) m.set(r.name, r.id); for (const a of arr(r.alias)) if (a && !m.has(a)) m.set(a, r.id); }
  return n => m.get(clean(n)) || null;
};
/** The words that trigger a record's entry: its name and its other names (two characters or more). */
export const entryKeys = rec => uniq([rec.name, ...arr(rec.alias)].map(clean)).filter(k => [...k].length >= 2);
/** Does the record have anything to say beyond its name? (the rule for having a world-book entry) */
export const hasText = rec => !!(text(rec.desc) || arr(rec.facts).length || clean(rec.access) || clean(rec.use));

export const LABELS = { zh: { tag: '地点', access: '出入', use: '用途', facts: '事实' }, en: { tag: 'Place', access: 'Access', use: 'Use', facts: 'Facts' } };
const stop = s => (/[。！？.!?]$/.test(s) ? s : s + (/[A-Za-z0-9]$/.test(s) ? '.' : '。'));
/** The world-book entry text of a record: THE one source of it (the builder writes it, the record card shows it, the sync compares it).
 *  Rooms read as one line "name: building floor. description. Access: ..."; other places carry the description as written, plus lines for
 *  use / facts / access when the record has them. o = { lang: 'zh' | 'en', lead: a sentence under the opening tag (the player's per-chat entry) }. */
export function entryText(rec, o = {}) {
  const L = LABELS[o.lang] || LABELS.zh, tag = `${L.tag}·${rec.name}`, facts = arr(rec.facts).filter(Boolean);
  let body;
  if (rec.kind === 'room') {
    const parts = [`${rec.name}${o.lang === 'en' ? ': ' : '：'}${rec.where || ''}`.replace(/[:：]\s*$/, ''), text(rec.desc), clean(rec.use) && `${L.use}${o.lang === 'en' ? ': ' : '：'}${clean(rec.use)}`, facts.length && `${L.facts}${o.lang === 'en' ? ': ' : '：'}${facts.join(o.lang === 'en' ? '; ' : '；')}`, clean(rec.access) && `${L.access}${o.lang === 'en' ? ': ' : '：'}${clean(rec.access)}`].filter(Boolean);
    body = parts.map(stop).join(o.lang === 'en' ? ' ' : '');
  } else {
    const c = o.lang === 'en' ? ': ' : '：';
    body = [text(rec.desc), clean(rec.use) && `${L.use}${c}${clean(rec.use)}`, facts.length && `${L.facts}${c}${facts.join(o.lang === 'en' ? '; ' : '；')}`, clean(rec.access) && `${L.access}${c}${clean(rec.access)}`].filter(Boolean).join('\n');
  }
  return `<${tag}>\n${o.lead ? o.lead + '\n' : ''}${body}\n</${tag}>`;
}
/** The text between the wrapping tag lines (the record card shows this; "show original" shows all of it). */
export const unwrap = t => String(t ?? '').replace(/^<[^<>\n]+>\n/, '').replace(/\n<\/[^<>\n]+>\s*$/, '');

/** Floor mates for the world-book entry switch: floorIndex(plan).matesOf(roomName) -> the names of every room on the floors that room is on. */
export function floorIndex(plan) {
  const rooms = arr(plan?.rooms).filter(r => isObj(r) && r.name);
  return { matesOf(name) {
    const n = clean(name); if (!n) return [];
    const fl = new Set(rooms.filter(r => clean(r.name) === n || arr(r.words).includes(n) || arr(r.synonyms).includes(n)).map(r => r.floor));
    return fl.size ? uniq(rooms.filter(r => fl.has(r.floor)).map(r => clean(r.name))) : [];
  } };
}
