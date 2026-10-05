// Settings profiles (PROFILE-1, D34): the actions behind the settings section. No DOM and no globals: the caller passes `io` (the preference store) so the
// same code runs in the viewer and in tests.
//   io = { read(key) -> string | null, write(key, value), remove(key), load() -> raw stored profiles JSON | null, save(jsonString) }
//   hooks.applied(changedKeys) runs after an apply wrote the store (the viewer refreshes its live state there)
// Applying writes only preference keys (core/profiles.mjs prefKeys): never per-chat data, never the AI advisor's endpoint config or consent.
import * as P from '../core/profiles.mjs';

export function createProfiles(io, hooks = {}) {
  const store = () => P.normStore(io.load());
  const persist = s => { io.save(JSON.stringify(s)); return s; };
  const current = () => { const s = store(), p = P.find(s, s.active) || P.BUILTIN[0]; return { store: s, profile: p, modified: !P.same(p.values, P.snapshot(io.read)) }; };
  /** apply(id) -> { ok, changed } : write every preference key the profile decides, then refresh live state */
  function apply(id) {
    const s = store(), p = P.find(s, id); if (!p) return { ok: false, changed: 0 };
    const changes = P.plan(p.values, io.read);
    for (const c of changes) { if (c.to === null) io.remove(c.key); else io.write(c.key, c.to); }
    persist({ ...s, active: p.id });
    hooks.applied?.(changes.map(c => c.key));
    return { ok: true, changed: changes.length };
  }
  /** saveAs(name, taken) -> { ok, reason?, id? }: save the live preferences under a name (an existing user profile of that name is replaced; `taken` = names that are not allowed, e.g. the built-in ones) */
  function saveAs(name, taken = []) {
    const nm = P.cleanName(name); if (!nm) return { ok: false, reason: 'name' };
    if (taken.includes(nm)) return { ok: false, reason: 'taken' };
    const r = P.add(store(), nm, P.snapshot(io.read)); persist(r.store); return { ok: true, id: r.profile.id };
  }
  function rename(id, name, taken = []) {
    const nm = P.cleanName(name), s = store(); if (!nm) return { ok: false, reason: 'name' };
    if (taken.includes(nm) || s.list.some(p => p.name === nm && p.id !== id)) return { ok: false, reason: 'taken' };
    if (!s.list.some(p => p.id === id)) return { ok: false, reason: 'builtin' };
    persist(P.rename(s, id, nm)); return { ok: true };
  }
  function remove(id) { const s = store(); if (!s.list.some(p => p.id === id)) return { ok: false }; persist(P.remove(s, id)); return { ok: true }; }
  /** the file body of a profile; the built-in ones export too (name is the caller's display name) */
  function exportText(id, displayName) {
    const p = P.find(store(), id); if (!p) return null;
    return JSON.stringify(P.exportDoc({ ...p, name: displayName || p.name }), null, 2);
  }
  /** importText(text, taken) -> { ok, id?, name?, dropped?, reason? }: adds a user profile (does not apply it); a name already used by a user profile gets a number */
  function importText(text, taken = []) {
    const r = P.parseImport(text); if (!r.ok) return r;
    const s = store(), used = new Set([...taken, ...s.list.map(p => p.name)]);
    let name = r.name, n = 2; while (used.has(name)) name = P.cleanName(r.name.slice(0, P.NAME_MAX - 3) + ' ' + n++);
    const added = P.add({ ...s, list: s.list }, name, r.values);
    persist({ ...added.store, active: s.active });
    return { ok: true, id: added.profile.id, name, dropped: r.dropped };
  }
  function bind(targetKey, profileId) { const s = store(); persist(P.bind(s, targetKey, profileId)); return { ok: true }; }
  function unbind(targetKey) { const s = store(); persist(P.unbind(s, targetKey)); return { ok: true }; }
  function boundProfile(targetKey) { return P.boundId(store(), targetKey); }
  return { store, current, apply, saveAs, rename, remove, exportText, importText, bind, unbind, boundProfile };
}
