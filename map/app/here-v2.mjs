// The viewer's "current location" (docs/kernel-schema.md §3, K-R17..K-R25): the text of the location variable is placed by
// nodes.locate over the node tree, then mapped back to the result shape every consumer of the app has always read
// (locate, chars, trips, wander, fog, layers, estate). This is the one place that knows both vocabularies.
//   makeHere({ manifest, maps, world, names, plan, custom, lang }) -> engine, same inputs as compat-v1 `fromV1`
//   engine.here(text)      -> { level, map, word, node, via, marker?, place?, room?, std?, floor?, restricted?, custom?, transit? } | null
//   engine.unmapped(text)  -> the name to offer as "unmapped" | null
//   engine.estate          -> { id, std, alias } | null   the standard room names and the user's names for them
// level: 1 a room, 2 the estate or an area of it, 3 a marker, 4 a map (layer / district), 5 the group or a world place.
// `word` is the kernel's (docs/kernel-schema.md A.9: a merged site reports its longest alias). Pure: no DOM, no host globals.
import { fromV1 } from '../core/compat-v1.mjs';
import { buildTree, vocabulary, locate, unmapped } from '../core/nodes.mjs';
import { occurrences } from '../core/locate.mjs';
import { normalise, normText, journey } from '../core/lexicon.mjs';

const has = s => typeof s === 'string' && s !== '';
const PARTS = /\s*[/／|｜]\s*/;   // where v1 and the kernel both split a written place ("A / B")
const MACRO = /\{\{\s*user\s*\}\}/gi;

export function makeHere(inputs = {}) {
  const r = fromV1(inputs), tree = buildTree(r.pack.nodes, { title: r.pack.title }), lang = r.pack.lang;
  const vocab = vocabulary(tree, { custom: r.custom, lang, lexicon: r.pack.lexicon }), lx = vocab.lex(lang);
  const M = inputs.maps?.maps && typeof inputs.maps.maps === 'object' ? inputs.maps.maps : {}, G = inputs.maps?.groups || {};
  const live = id => !!M[id] && M[id].status !== 'planned', flat = id => M[id]?.kind === 'points' && live(id) && tree.has(id);
  // ---- what the registry says about the nodes (registry ids are node ids, except where idmap says otherwise) ----
  const estateId = Object.keys(M).find(k => live(k) && M[k].kind === 'estate' && !M[k].viewer3d) || null, E = estateId && tree.has(estateId) ? estateId : null;
  const roomWords = E ? [...(M[E].rooms || []), ...(M[E].rooms_en || [])] : [], areaWords = E ? [...(M[E].areas || []), ...(M[E].areas_en || [])] : [];
  const rooms = new Set(roomWords.map(normalise)), planned = E ? tree.children(E).filter(i => tree.get(i).type === 'room').flatMap(i => tree.get(i).hints || []) : [];
  const marker = new Map();   // marker id -> its map
  for (const [mid, m] of Object.entries(M)) if (flat(mid)) for (const k of Object.keys(m.markers || {})) if (tree.parent(k) === mid) marker.set(k, mid);
  const layerWords = new Map();   // map id -> the words that name the map as a layer / district (the user's names for it included)
  for (const [mid, m] of Object.entries(M)) if (flat(mid)) layerWords.set(mid, [m.layer?.name, m.layer?.sub, m.layer?.sub_en, m.layer?.name_en && `${m.layer.name_en} Tier`, ...(m.districts || [])].filter(has).map(normalise));
  for (const c of r.custom) { const l = layerWords.get(c.node); if (l && (!c.canonical || l.includes(normalise(c.canonical)))) l.push(normalise(c.word)); }
  const worldId = Object.keys(M).find(k => live(k) && M[k].kind === 'world') || null;
  const places = new Map();   // node id -> the world place it stands for
  for (const p of [...(inputs.world?.places || []), ...(inputs.world?.fiefs || []), ...(inputs.world?.realms || [])]) { const id = p?.id && (r.idmap[p.id] || p.id); if (id && tree.has(id) && !places.has(id)) places.set(id, p); }
  const groupMap = id => (G[id]?.layers || []).find(flat) || null;   // the first flat map of a group
  let head = null;   // v1 placed the first group with a flat map by its title words; every other group is the world place it stands for
  for (const g of Object.values(G)) { const m = (g.layers || []).find(flat); if (m) { head = { map: m, words: [g.title, g.title_en, inputs.names?.[g.title]].filter(has).map(normalise) }; break; } }
  const inEstate = id => !!E && (id === E || tree.isAncestor(E, id));

  // ---- a located node -> the v1 result; `text` is the place as written (the layer / group words decide between two readings) ----
  function shape(id, word, text, canonical) {
    const n = tree.get(id), t = normText(text), out = { map: null, word, node: id };
    if (inEstate(id)) {
      const room = n.type === 'room';
      Object.assign(out, { level: room || (id === E && rooms.has(normalise(canonical || word))) ? 1 : 2, map: E, room: canonical || text });
      if (room) { out.std = n.name; if (n['x-storey']) out.floor = n['x-storey']; if (n['x-plan-kind'] === 'restricted') out.restricted = true; }
      if (canonical) out.custom = true;
      return out;
    }
    if (marker.has(id)) return Object.assign(out, { level: 3, map: marker.get(id), marker: id });
    if (layerWords.has(id) && (!places.has(id) || layerWords.get(id).some(w => t.includes(w)))) return Object.assign(out, { level: 4, map: id });   // a map that is also a world place: the map only when a layer word is written
    if (G[id] && groupMap(id) && (!places.has(id) || (head && head.map === groupMap(id) && head.words.some(w => t.includes(w))))) return Object.assign(out, { level: 5, map: groupMap(id) });
    if (places.has(id) && worldId) return Object.assign(out, { level: 5, map: worldId, place: places.get(id).name });
    return null;
  }
  // the two ends of a journey as written (original case): the kernel's own patterns run on the original part; the normalised texts are the fallback
  const ends = (part, seg) => { const j = journey(part.replace(MACRO, ' ').trim(), lx, occurrences); return j && normText(j.from) === normText(seg.from) && normText(j.to) === normText(seg.to) ? j : seg; };
  function here(value) {
    // a written place holding several ("A / B"): the first that places, as the kernel does; `part` is that one as written
    const v = String(value ?? '').replace(MACRO, '').trim(), parts = v.split(PARTS).filter(Boolean);
    let h = null, part = v;
    for (const p of parts.length > 1 ? parts : [v]) if ((h = locate(p, tree, vocab, { lang }))) { part = p; break; }
    if (!h) return null;
    const canon = h.via === 'user' ? h.canonical : null;
    let out = shape(h.node, h.word, part, canon);
    // a node that is no map, marker or world place (a district of the pack's overlay, K-R67) stands for the nearest one above it that is
    for (let up = tree.parent(h.node), n = 0; !out && up && n < 16; up = tree.parent(up), n++) out = shape(up, h.word, part, canon);
    if (!out) return null;
    if (h.transit) {
      const t = h.transit, d = ends(part, { from: t.from_text, to: t.to_text }), end = (id, text) => (id ? shape(id, '', text, null) : null);
      out = { ...out, transit: { from: end(t.from, d.from), to: end(t.to, d.to), fromText: d.from, toText: d.to, via: t.route } };
    }
    return { ...out, via: h.via };
  }
  const std = E ? [...new Set([...roomWords, ...planned.filter(w => !areaWords.includes(w))])] : [], alias = {};
  if (E) for (const c of r.custom) if (c.canonical && (c.node === E || tree.parent(c.node) === E)) alias[c.word] = c.canonical;
  // the name to offer as "unmapped": the kernel decides, the name is shown as written (first place of "A / B"), as the chip always did
  const unmappedName = value => {
    if (unmapped(value, tree, vocab, { lang, ignore: r.ignore }) === null) return null;
    const v = String(value ?? '').replace(MACRO, '').trim(); return v.split(PARTS).filter(Boolean)[0] || v;
  };
  return { tree, vocab, here, estate: E ? { id: E, std, alias } : null, unmapped: unmappedName };
}

// ---- the user's own names for rooms, kept on this machine (E6; the viewer's window.EdenMap and the card script share this) ----
// With a chat id the names are stored per chat under "edenMap:chat:<id>:custom", else globally under "edenMap:custom"; the value is
// JSON { rooms: { name: room } }. store = an object with getItem / setItem / removeItem (localStorage; a fake in tests). Nothing goes online.
export const customKey = chat => (chat ? `edenMap:chat:${chat}:custom` : 'edenMap:custom');
export function readCustom(store, chat) {
  let o = null; try { o = JSON.parse(store?.getItem(customKey(chat)) || 'null'); } catch (e) {}
  const rooms = {};
  if (o && o.rooms && typeof o.rooms === 'object') for (const [k, v] of Object.entries(o.rooms)) if (typeof k === 'string' && typeof v === 'string' && k && v) rooms[k] = v;
  return { rooms };
}
