// The item-level fields of the chat's custom data (docs/place-record.md section 5, K-R135). Pure: no DOM, no host globals, no storage.
// One item = what the player changed about one place in this chat: display name, use line, description, facts, extra names, plus the
// bookkeeping the record needs (fingerprints of the pack text the edit was based on, the floor it was saved at, a bounded undo list).
// tavern/mvu-readers.mjs (normCustom / setCustom) calls these; core/place-record.mjs and core/custom-book.mjs read the result.
export const MAX_DESC = 400, MAX_FACT = 120, MAX_FACTS = 12, MAX_UNDO = 20, MAX_ALIAS = 10, MAX_NAME = 40;
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => [...s].slice(0, n).join('');
export const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** Text fingerprint (FNV-1a over code points, base 36): the same hash the add-on sync uses for entry bodies. */
export function fp(s) { let h = 2166136261; for (const c of String(s ?? '')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
/** Facts list: trimmed one-liners, at most 12, each at most 120 characters, no repeats. */
export const normFacts = v => [...new Set((Array.isArray(v) ? v : []).map(x => cut(clean(x), MAX_FACT)).filter(Boolean))].slice(0, MAX_FACTS);
/** Fingerprints of the editable fields of a pack record (the text an edit was based on). `rec` = { baseName, desc, facts, use? }. */
export const baseOf = rec => ({ name: fp(rec?.baseName ?? rec?.name), desc: fp(rec?.desc), facts: fp((rec?.facts || []).join('\n')) });
const BASE_FIELDS = ['name', 'desc', 'facts'];

/** The new fields of one item, healed into `e` (`it` = the raw item): 说明, 事实, 基于, 楼, 标. */
export function normItemExtra(e, it) {
  const d = String(it.说明 ?? '').trim(); if (d) e.说明 = cut(d, MAX_DESC);
  const f = normFacts(it.事实); if (f.length) e.事实 = f;
  if (isObj(it.基于)) { const b = {}; for (const k of BASE_FIELDS) if (typeof it.基于[k] === 'string' && /^[a-z0-9]{1,12}$/.test(it.基于[k])) b[k] = it.基于[k]; if (Object.keys(b).length) e.基于 = b; }
  if (Number.isInteger(it.楼) && it.楼 >= 0) e.楼 = it.楼;
  if (typeof it.标 === 'string') { const s = clean(it.标); if (s && [...s].length <= MAX_NAME) e.标 = s; }   // the pack's own name, kept when the key is a node id (PLACE-1b)
  return e;
}
/** The pack's name of an item: what the key used to be (PLACE-1b: the key is a node id once the tree knows the place). */
export const stdOf = (item, key) => (item && typeof item.标 === 'string' && item.标) || key;
/** The undo list (`自定义.撤销`): the last 20 previous states, [{ key, prev: item | null, at }]; `normItem(key, raw)` heals one item. */
export function normUndo(raw, normItem) {
  const out = [];
  for (const u of Array.isArray(raw) ? raw : []) {
    if (!isObj(u) || typeof u.key !== 'string' || !clean(u.key)) continue;
    const prev = u.prev === null ? null : isObj(u.prev) ? normItem(clean(u.key), u.prev) : undefined; if (prev === undefined) continue;
    out.push({ key: clean(u.key), prev, at: Number.isInteger(u.at) ? u.at : 0 });
  }
  return out.slice(-MAX_UNDO);
}
/** Apply the editor's fields of `patch` onto the working item `cur` (mutated). Returns false for a value that is too long (the caller rejects the edit).
 *  patch: desc ('' clears), facts (array; [] clears), aliases (the whole list of extra names), base ({ field: fingerprint } | null), floor (number). */
export function applyPatch(cur, patch, key) {
  if ('desc' in patch) { const v = String(patch.desc ?? '').trim(); if ([...v].length > MAX_DESC) return false; if (v) cur.说明 = v; else delete cur.说明; }
  if ('facts' in patch) { const f = normFacts(patch.facts); if (f.length) cur.事实 = f; else delete cur.事实; }
  if ('aliases' in patch) { const a = [...new Set((Array.isArray(patch.aliases) ? patch.aliases : []).map(clean).filter(x => x && x !== key && x !== cur.名 && [...x].length <= MAX_NAME))].slice(0, MAX_ALIAS); if (a.length) cur.别名 = a; else delete cur.别名; }
  if ('std' in patch) { const s = clean(patch.std); if (s && s !== key && [...s].length <= MAX_NAME) cur.标 = s; else delete cur.标; }   // PLACE-1b: the pack's own name, when the key is a node id
  if ('base' in patch) { if (isObj(patch.base)) cur.基于 = { ...(cur.基于 || {}), ...patch.base }; else delete cur.基于; }
  if (Number.isInteger(patch.floor) && patch.floor >= 0) cur.楼 = patch.floor;
  return true;
}
/** Push the state before an edit: `list` = the current undo list, `prev` = the item before the edit (null when there was none). Keeps the last 20. */
export const pushUndo = (list, key, prev, at = 0) => [...(Array.isArray(list) ? list : []), { key, prev: prev ? JSON.parse(JSON.stringify(prev)) : null, at }].slice(-MAX_UNDO);
/** Undo the last edit (of `key` when given). `c` is normalised custom data, `normItem` heals an item. Returns the new custom data or null when there is nothing to undo. */
export function undoLast(c, key, norm) {
  const list = c.撤销 || [], i = key ? list.map(u => u.key).lastIndexOf(clean(key)) : list.length - 1; if (i < 0) return null;
  const u = list[i], n = { ...c, items: { ...c.items }, 撤销: list.filter((_, j) => j !== i) };
  if (u.prev) n.items[u.key] = u.prev; else delete n.items[u.key];
  if (!n.撤销.length) delete n.撤销;
  return norm(n);
}
/** The patch that puts fields back to the pack's text ("restore"): fields = any of name, use, desc, facts, aliases. */
export function restorePatch(fields) {
  const p = {}; for (const f of fields) { if (f === 'name') p.name = ''; else if (f === 'use') p.note = ''; else if (f === 'desc') p.desc = ''; else if (f === 'facts') p.facts = []; else if (f === 'aliases') p.aliases = []; }
  if (fields.some(f => BASE_FIELDS.includes(f))) p.base = null;
  return p;
}
/** Fields whose pack text changed since the edit was saved: [field] among name, desc, facts (the item's fingerprints vs the pack record now). */
export function staleFields(item, rec) {
  const was = item?.基于; if (!was) return [];
  const now = baseOf(rec), set = { name: !!item.名, desc: !!item.说明, facts: !!item.事实 };
  return BASE_FIELDS.filter(f => set[f] && was[f] && was[f] !== now[f]);
}
/** The item of a place: by node id, then by standard name, then by a display name or extra name. */
export function itemFor(c, rec) {
  const items = c?.items || {}; if (!rec) return null;
  for (const k of [rec.id, rec.baseName ?? rec.name]) if (k && items[k]) return { key: k, item: items[k] };
  for (const [k, e] of Object.entries(items)) if ((e.名 && e.名 === rec.name) || (e.别名 || []).includes(rec.name)) return { key: k, item: e };
  return null;
}
/** A record with the player's fields laid over it (field by field). The pack's own record is never changed. */
export function overlay(rec, item, story = []) {
  const out = { ...rec, baseName: rec.name, alias: [...(rec.alias || [])], facts: [...(rec.facts || [])], use: rec.use || '', storyFacts: story, edited: [], stale: [] };
  if (!item) return out;
  if (item.名) { out.name = item.名; out.alias = [...new Set([rec.name, ...out.alias])]; out.edited.push('name'); }
  if (item.用途) { out.use = item.用途; out.edited.push('use'); }
  if (item.说明) { out.desc = item.说明; out.edited.push('desc'); }
  if (item.事实) { out.facts = [...item.事实]; out.edited.push('facts'); }
  if (item.别名?.length) { out.alias = [...new Set([...out.alias, ...item.别名])]; out.edited.push('aliases'); }
  out.stale = staleFields(item, { baseName: rec.name, desc: rec.desc, facts: rec.facts });
  out.custom = true; return out;
}
/** Old keys are standard names; a node id is the key once the tree knows the name. `idOf(name)` -> node id | null. Items that cannot be resolved keep their key.
 *  A moved item remembers the name it came from in 标 (PLACE-1b), so every reader can still show the place by name. */
export function migrateKeys(c, idOf) {
  const items = {}; let moved = 0;
  for (const [k, e] of Object.entries(c?.items || {})) {
    const id = idOf(k);
    if (!id || id === k) { items[k] = items[k] ? { ...items[k], ...e } : e; continue; }   // 已经写在 id 下的那项逐字段优先
    const moved0 = { ...e, 标: stdOf(e, k) };   // an item already under the id wins field by field
    items[id] = items[id] ? { ...moved0, ...items[id] } : moved0; moved++;
  }
  const undo = (c.撤销 || []).map(u => { const id = idOf(u.key); return id && id !== u.key ? { ...u, key: id, prev: u.prev ? { ...u.prev, 标: stdOf(u.prev, u.key) } : null } : u; });
  return { custom: { ...c, items, ...(undo.length ? { 撤销: undo } : {}) }, moved };
}
