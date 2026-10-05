// Settings profiles (PROFILE-1, D34): a named set of every user preference, savable and re-appliable. Pure: no DOM, no storage access of its own
// (callers pass read functions). A profile = { id, name, values } where `values` maps a preference key (KEYS entries with pref: true, plus the
// parked-feature keys edenMapOn:<id>) to its stored string; a key missing from `values` means "unset" = the registry / code default.
// Never part of a profile: per-chat data, session keys, hint-seen flags, logs and caches, the variable mapping, the chosen pack, and secrets
// (the AI advisor's endpoint config and consent are `pref: false`, so a profile can neither carry nor apply them).
import { KEYS } from './storage.mjs';
import { PARKED, PARK_PREFIX } from './parked.mjs';

export const PROFILES_KEY = 'edenMapProfiles', SCHEMA = 1, NAME_MAX = 24;
export const REC_ID = 'recommended', LEAN_ID = 'lean';
/** layer visibility the viewer keeps in the edenMapLayers blob, with the visibility each layer has when nothing is stored */
export const LAYER_DEFAULTS = Object.freeze({ weather: true, quests: true, wander: true, traffic: false, vision: false, transit: false, 'nav-ops': false, 'local-props': false });
/** the lean profile: decorative and animated layers, motion, glass effects and background extras off, the cheapest picture tier (rows of docs/feature-inventory.md with a running animation or a background cost) */
export const LEAN = Object.freeze({
  edenMapLayers: '{"quests":"0","traffic":"0","vision":"0","wander":"0","weather":"0"}',
  edenMapRM: 'on', edenMapNoFx: '1', edenMapPortraits: '0', edenMap3dQ: '1', edenMapTierV2: 'save', edenMap3dAutoRotate: '0', edenMapGlassClock: '0', edenMapTick: '0', edenMapGallery: '0',
});
export const BUILTIN = Object.freeze([
  Object.freeze({ id: REC_ID, nameKey: 'prof.rec', name: '推荐', builtin: true, values: Object.freeze({}) }),
  Object.freeze({ id: LEAN_ID, nameKey: 'prof.lean', name: '精简', builtin: true, values: LEAN }),
]);

/** every preference key a profile covers (parked-feature keys expanded) */
export const prefKeys = () => [...Object.entries(KEYS).filter(([, o]) => o.pref === true && !o.prefix).map(([k]) => k), ...PARKED.map(id => PARK_PREFIX + id)];
export const isPrefKey = k => typeof k === 'string' && prefKeys().includes(k);

const sortObj = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const jsonOf = v => { try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };
/** defaults that live in code rather than in the registry (the stored value 'auto' is the same as nothing stored) */
const IMPLICIT_DEF = Object.freeze({ edenMapTierV2: 'auto' });
/** canon(key, value) -> the value compared / stored: null when unset or equal to the registry default; JSON values with sorted keys (the layer blob also without entries equal to a layer's default) */
export function canon(k, v) {
  if (v == null || v === '') return null;
  v = String(v);
  if (k === 'edenMapLayers') { const o = jsonOf(v); if (!o || Array.isArray(o)) return null; const c = {}; for (const [id, x] of Object.entries(o)) if ((x === '1' || x === '0') && !(id in LAYER_DEFAULTS && (x === '1') === LAYER_DEFAULTS[id])) c[id] = x; return Object.keys(c).length ? JSON.stringify(sortObj(c)) : null; }
  if (k === 'edenMapStateOmit') { const o = jsonOf(v) ?? (v === '[]' ? [] : null); return Array.isArray(o) && o.length ? JSON.stringify([...o].sort()) : null; }
  return (KEYS[k]?.def ?? IMPLICIT_DEF[k]) === v ? null : v;
}
/** snapshot(read) -> { key: value } for every preference key that is set to something other than its default (`read(key)` returns the stored string or null) */
export function snapshot(read) {
  const out = {};
  for (const k of prefKeys()) { let v = null; try { v = read(k); } catch (e) { v = null; } const c = canon(k, v); if (c !== null) out[k] = c; }
  return out;
}
/** same(a, b) -> true when two value maps mean the same settings */
export const same = (a = {}, b = {}) => prefKeys().every(k => canon(k, a[k]) === canon(k, b[k]));
/** plan(values, read) -> [{ key, from, to }] for the keys whose stored value differs from what the profile says (to === null: remove the key, back to its default) */
export function plan(values, read) {
  const out = [];
  for (const k of prefKeys()) { let cur = null; try { cur = read(k); } catch (e) { cur = null; } const from = canon(k, cur), to = canon(k, values?.[k]); if (from !== to) out.push({ key: k, from, to }); }
  return out;
}
/** cleanValues(obj) -> { values, dropped }: keeps only known preference keys with a string value (secrets and every other key are dropped and counted) */
export function cleanValues(obj) {
  const values = {}; let dropped = 0;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { values, dropped };
  const ok = new Set(prefKeys());
  for (const [k, v] of Object.entries(obj)) {
    if (!ok.has(k) || (typeof v !== 'string' && typeof v !== 'number')) { dropped++; continue; }
    const c = canon(k, String(v)); if (c !== null) values[k] = c;
  }
  return { values, dropped };
}
export const cleanName = n => String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** normStore(raw) -> { active, list, binds } from the stored JSON (anything unreadable = no user profiles, the recommended one active) */
export function normStore(raw) {
  let o = null; try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { o = null; }
  const list = [], seen = new Set();
  for (const p of Array.isArray(o?.list) ? o.list : []) {
    const name = cleanName(p?.name), id = typeof p?.id === 'string' && /^[\w-]{1,32}$/.test(p.id) ? p.id : '';
    if (!name || !id || seen.has(id) || BUILTIN.some(b => b.id === id)) continue;
    seen.add(id); list.push({ id, name, values: cleanValues(p.values).values });
  }
  const active = typeof o?.active === 'string' && (seen.has(o.active) || BUILTIN.some(b => b.id === o.active)) ? o.active : REC_ID;
  const binds = {};
  if (o?.binds && typeof o.binds === 'object' && !Array.isArray(o.binds)) {
    for (const [k, v] of Object.entries(o.binds)) {
      if (typeof k === 'string' && k.length > 0 && k.length <= 64 && typeof v === 'string' && (seen.has(v) || BUILTIN.some(b => b.id === v))) binds[k] = v;
    }
  }
  return { active, list, binds };
}
/** all(store) -> built-in profiles then the user's */
export const all = store => [...BUILTIN, ...(store?.list || [])];
export const find = (store, id) => all(store).find(p => p.id === id) || null;
/** add(store, name, values) -> { store, profile } (an existing user profile of the same name is replaced) */
export function add(store, name, values) {
  const nm = cleanName(name); if (!nm) return { store, profile: null };
  const old = store.list.find(p => p.name === nm), profile = { id: old?.id || newId(), name: nm, values: cleanValues(values).values };
  return { store: { active: profile.id, list: old ? store.list.map(p => (p === old ? profile : p)) : [...store.list, profile], binds: { ...(store.binds || {}) } }, profile };
}
export function rename(store, id, name) { const nm = cleanName(name); if (!nm || !store.list.some(p => p.id === id) || store.list.some(p => p.name === nm && p.id !== id)) return store; return { ...store, list: store.list.map(p => (p.id === id ? { ...p, name: nm } : p)) }; }
export function remove(store, id) {
  if (!store.list.some(p => p.id === id)) return store;
  const binds = { ...(store.binds || {}) };
  for (const [k, v] of Object.entries(binds)) if (v === id) delete binds[k];
  return { active: store.active === id ? REC_ID : store.active, list: store.list.filter(p => p.id !== id), binds };
}
/** bind(store, targetKey, profileId) -> store with targetKey bound to profileId */
export function bind(store, targetKey, profileId) {
  const k = String(targetKey ?? '').trim(), p = find(store, profileId);
  if (!k || !p) return store;
  return { ...store, binds: { ...(store.binds || {}), [k]: p.id } };
}
/** unbind(store, targetKey) -> store without targetKey */
export function unbind(store, targetKey) {
  const k = String(targetKey ?? '').trim();
  if (!k || !(k in (store.binds || {}))) return store;
  const binds = { ...(store.binds || {}) };
  delete binds[k];
  return { ...store, binds };
}
/** boundId(store, targetKey) -> profile id bound to this target key, or null */
export function boundId(store, targetKey) {
  const k = String(targetKey ?? '').trim();
  const id = store?.binds?.[k];
  return id && find(store, id) ? id : null;
}
/** cardKey(card) -> stable identifier key for binding (e.g. k<hash> or k0) */
export function cardKey(card) {
  const name = String(card?.name || '').trim(), avatar = String(card?.avatar || '').trim();
  if (!name && !avatar) return 'k0';
  let h = 2166136261;
  for (const c of (name + '\n' + avatar)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return 'k' + (h >>> 0).toString(36);
}
/** exportDoc(profile) -> the file body { schema, name, values } */
export const exportDoc = p => ({ schema: SCHEMA, name: p.name, values: cleanValues(p.values).values });
/** parseImport(text) -> { ok, name, values, dropped } | { ok: false, reason }: unknown keys are dropped and counted, nothing secret is ever read */
export function parseImport(text) {
  let o = null; try { o = JSON.parse(text); } catch (e) { return { ok: false, reason: 'json' }; }
  if (!o || typeof o !== 'object' || o.schema !== SCHEMA) return { ok: false, reason: 'schema' };
  const name = cleanName(o.name); if (!name) return { ok: false, reason: 'name' };
  const { values, dropped } = cleanValues(o.values);
  return { ok: true, name, values, dropped };
}
