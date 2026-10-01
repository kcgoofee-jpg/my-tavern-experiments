// The browser store for imported packs (docs/kernel-schema.md K-R99, docs/zero-config.md §2.6, §11): IndexedDB database `edenMapPacks`, store `packs`, key = card key,
// value { kind: 'url' | 'file', url?, text, savedAt }. A file pack keeps its text here; a URL pack keeps the last good copy so a later start works offline.
// Every call is wrapped: no IndexedDB (private window, blocked site data), a failed open or a failed request reads as "nothing" and never throws.
// createStore(idb) takes the factory so node tests can pass a fake; the default export object uses the page's own indexedDB.
export const DB_NAME = 'edenMapPacks', STORE = 'packs', DB_VERSION = 1;

const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('idb')); });

export function createStore(getIdb = () => (typeof indexedDB !== 'undefined' ? indexedDB : null)) {
  let dbP = null;
  const open = () => dbP ??= new Promise((res, rej) => {
    const idb = getIdb(); if (!idb) return rej(new Error('no-idb'));
    const r = idb.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('open'));
  }).catch(e => { dbP = null; throw e; });
  const run = async (mode, f) => {   // { ok, v }
    try { const db = await open(), t = db.transaction(STORE, mode); return { ok: true, v: await req(f(t.objectStore(STORE))) }; }
    catch (e) { return { ok: false, v: undefined }; }
  };
  const key = k => (typeof k === 'string' && k ? k : null);
  return {
    /** the record of a card key, or null */
    get: async k => (key(k) ? (await run('readonly', s => s.get(k))).v ?? null : null),
    /** keeps { kind, url?, text }, stamped with savedAt; true when written */
    put: async (k, rec) => !!key(k) && !!rec && typeof rec.text === 'string'
      && (await run('readwrite', s => s.put({ kind: rec.kind === 'file' ? 'file' : 'url', ...(rec.url ? { url: String(rec.url) } : {}), text: rec.text, savedAt: Date.now() }, k))).ok,
    remove: async k => !!key(k) && (await run('readwrite', s => s.delete(k))).ok,
  };
}
export const packStore = createStore();
