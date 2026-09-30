// Schema 1 side inputs -> schema 2 blocks (docs/kernel-schema.md Appendix A.5 - A.7): events, roster, stash, worldbook,
// legacy names, ui strings, and the user's custom names. Pure; carries no card terms (the caller passes the ones it needs).
import { fnv36, cut } from './lexicon.mjs';
import { prefixOf, chatVarOf } from './pack.mjs';
import { put, uniq } from './compat-v1-geo.mjs';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const str = v => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const HEX = /^#[0-9a-fA-F]{6}$/;
const V1_NAMES = { worldbook_marker: 'eden_', protocol_prefix: 'eden-map:', event_attr: 'data-tcmap' };   // v1 used these for every pack

/** K-R09: the names v1 derived for a pack; `extra` (caller's legacy, e.g. the add-on book name) wins. write stays `legacy` until S10. */
export function legacyOf(manifest, extra) {
  const out = { chat_var: chatVarOf(manifest.id, manifest), storage_prefix: prefixOf(manifest.id), ...V1_NAMES };
  for (const [k, v] of Object.entries(isObj(extra) ? extra : {})) if (v !== undefined && v !== null && v !== '') out[k] = v;
  out.write = 'legacy'; return out;
}

/** `strings` (key, key@en) -> ui.strings.<lang>.key / ui.strings.en.key. */
export function stringsOf(strings, lang) {
  const out = {};
  for (const [k, v] of Object.entries(isObj(strings) ? strings : {})) {
    if (typeof v !== 'string') continue;
    const at = k.endsWith('@en'), key = at ? k.slice(0, -3) : k;
    if (!/^[a-z][a-z0-9_.]{0,63}$/.test(key)) continue;
    const l = at ? 'en' : lang; (out[l] ||= {})[key] = v;
  }
  return out;
}

/** v1 events.json -> { events, tag, hints }: groups g_<hash>, types t_<hash>, aliases folded into their type (A.5). `hints` = [{ map, word }] to add
 *  to a map's node (layer `match` words that are not aliases already). */
export function eventsOf(ev, isAlias) {
  if (!isObj(ev)) return null;
  const gs = isObj(ev.groups) ? ev.groups : {}, order = Array.isArray(ev.order) ? ev.order.filter(k => k in gs) : Object.keys(gs);
  const gid = {}, groups = [];
  for (const name of [...new Set([...order, ...Object.keys(gs)])]) {
    if (!HEX.test(gs[name])) continue;
    gid[name] = `g_${fnv36(name)}`;
    groups.push(put({ id: gid[name], label: cut(name, 30), color: gs[name] }, 'shape', str(isObj(ev.shapes) ? ev.shapes[name] : undefined)));
  }
  const types = {};
  for (const [name, t] of Object.entries(isObj(ev.types) ? ev.types : {})) {
    if (!isObj(t) || !gid[t.g]) continue;
    const alias = Object.entries(isObj(ev.alias) ? ev.alias : {}).filter(([, to]) => to === name).map(([w]) => w);
    types[`t_${fnv36(name)}`] = put(put(put(put({ label: cut(name, 30), group: gid[t.g] }, 'alias', alias), 'icon', str(t.ch)), 'source', str(t.src)), 'rare', Number.isInteger(t.rare) ? t.rare : undefined);
  }
  const events = { groups, types };
  put(events, 'closed', Array.isArray(ev.closed) ? ev.closed.filter(str) : []); put(events, 'examples', Array.isArray(ev.examples) ? ev.examples.filter(str) : []);
  const hints = [];
  for (const l of Array.isArray(ev.layers) ? ev.layers : []) for (const w of Array.isArray(l?.match) ? l.match : []) if (str(w) && l.map && !isAlias(l.map, w)) hints.push({ map: l.map, word: w });
  return { events, tag: str(ev.tag), hints };
}

/** roster { members: [{ name, identity }] } -> entities (one `members` group with fallback rows, `identity` as the role field). */
export function rosterOf(roster, roleField = 'identity') {
  const list = Array.isArray(roster?.members) ? roster.members : [];
  const rows = list.filter(r => isObj(r) && str(r.name)).slice(0, 200).map(r => put({ name: r.name.trim().replace(/\s+/g, ' ').slice(0, 40) }, 'values', str(r.identity) ? { [roleField]: r.identity } : undefined));
  if (!rows.length) return null;
  return { groups: [{ id: 'members', label: 'members', i18n: { zh: { label: '成员' } }, fallback: rows }],
    fields: [{ field: roleField, label: 'identity', kind: 'text', show: 'subtitle', i18n: { zh: { label: '身份' } } }] };
}

/** stash { items } -> items.stash: `node` = the marker's node, else the map's node (A.7); rows whose place is unknown are dropped. */
export function stashOf(stash, has, idmap) {
  const rows = [];
  for (const r of Array.isArray(stash?.items) ? stash.items : []) {
    if (!isObj(r) || !str(r.name)) continue;
    const node = [r.marker && (idmap[r.marker] || r.marker), r.map && (idmap[r.map] || r.map)].find(x => x && has(x));
    if (!node) continue;
    const row = { name: cut(r.name, 60), node };
    if (typeof r.id === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(r.id)) row.id = r.id;
    put(row, 'hidden', str(r.hidden) && cut(r.hidden, 60)); put(row, 'note', str(r.note) && cut(r.note, 200));
    if (Number.isInteger(r.dc) && r.dc >= 1 && r.dc <= 30) row.dc = r.dc;
    if (Number.isInteger(r.qty) && r.qty >= 1 && r.qty <= 999) row.qty = r.qty;
    rows.push(row);
  }
  return rows.slice(0, 200);
}

/** worldbook { entries: [{ name, content }] } -> llm.worldbook.entries (id wb_<hash of name>). */
export function worldbookOf(wb) {
  const entries = [], seen = new Set();
  for (const e of Array.isArray(wb?.entries) ? wb.entries : []) {
    if (!isObj(e) || !str(e.name) || !str(e.content)) continue;
    const id = `wb_${fnv36(e.name)}`; if (seen.has(id)) continue; seen.add(id);
    entries.push({ id, name: e.name, content: e.content });
  }
  return entries;
}

/** The user's custom names (v1 shape) -> { custom: [{ word, node, canonical? }], ignore: [name] } against the converted nodes. */
export function customOf(c, geo, has) {
  const custom = [], { ctx } = geo, E = ctx.estate, idmap = ctx.idmap, k = isObj(c) ? c : {};
  const push = (word, node, canonical) => { if (str(word) && node && has(node)) custom.push(put({ word, node }, 'canonical', canonical)); };
  if (E) {
    const rooms = new Set(E.rooms), std = new Set(E.std), areas = new Set(E.areas);
    for (const [w, r0] of Object.entries(isObj(k.rooms) ? k.rooms : {})) {
      const r = r0 && !rooms.has(r0) ? E.oldName(r0) : r0;
      if (w && r && rooms.has(r) && !std.has(w)) { push(w, E.planStd[r] && E.roomNode[E.planStd[r]] ? E.roomNode[E.planStd[r]] : E.id, r); rooms.add(w); }
    }
    for (const [w, r] of Object.entries(isObj(k.areas) ? k.areas : {})) if (w && r && areas.has(r) && !areas.has(w)) { push(w, E.id, r); areas.add(w); }
  }
  for (const [w, std] of Object.entries(isObj(k.marks) ? k.marks : {})) { const l = ctx.landmarks.find(x => x.words.includes(std)); if (w && l && !l.words.includes(w)) { push(w, l.node, std); l.words.push(w); } }
  for (const [w, std] of Object.entries(isObj(k.layers) ? k.layers : {})) {
    for (const [node, lw] of Object.entries(ctx.layerWords)) if (w && has(node) && (std === node || lw.includes(std)) && !lw.includes(w)) { push(w, node, std === node ? undefined : std); lw.push(w); }
  }
  for (const [w, std] of Object.entries(isObj(k.world) ? k.world : {})) for (const e of ctx.entities) if (w && e.name === std) push(w, e.node, std);
  const ignore = uniq((Array.isArray(k.ignore) ? k.ignore : []).map(s => String(s ?? '').trim()));
  return { custom, ignore };
}
