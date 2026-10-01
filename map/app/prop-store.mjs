// The local prop store (docs/layers-schema.md §11, K-R88, E-03): the files a user adds as props live in this browser only: IndexedDB database `spatialProps`, store `props`, key
// `<pack id>::<prop id>`, record { key, pack, id, name, type, bytes, w?, h?, createdAt, blob }. Nothing leaves the device (no network call, no message to the host, no URL other than `blob:`).
// The pure rules (signature, size and svg limits, ids) are core/prop-pack.mjs; this is the thin wrapper in the pattern of core/room-gallery-db.mjs. Images are shown only through object URLs
// in <img> elements; the URLs are revoked when a prop is removed. A prop's name is user text and reaches the page only through textContent.
import { sniff, checkProp, propId, PROP_LIMITS } from '../core/prop-pack.mjs';
import { setPropResolver } from './block-overlay.mjs';

const DB = 'spatialProps', STORE = 'props', MIME = { glb: 'model/gltf-binary', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };
const pack = () => globalThis.__packId || 'eden';
let dbp = null, cache = null, loading = null;
const subs = new Set();
const emit = () => { for (const fn of subs) { try { fn(); } catch (e) {} } };
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('IndexedDB')); });
const done = t => new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error || new Error('IndexedDB')); t.onabort = () => rej(t.error || new Error('IndexedDB')); });
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) return reject(new Error('no IndexedDB'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'key' }); s.createIndex('byPack', 'pack', { unique: false }); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error || new Error('IndexedDB'));
  }).catch(e => { dbp = null; throw e; });
  return dbp;
}
/** onPropsChange(fn) -> off(): called after a prop is added or removed */
export const onPropsChange = fn => { subs.add(fn); return () => subs.delete(fn); };
/** loadProps() -> Map id -> { meta, url }: reads this pack's records once (object URLs are made here); an unavailable IndexedDB gives an empty map */
export function loadProps() {
  if (cache) return Promise.resolve(cache);
  return (loading ||= (async () => {
    const m = new Map();
    try {
      const db = await openDB(), recs = await req(db.transaction(STORE).objectStore(STORE).index('byPack').getAll(pack()));
      for (const r of recs.sort((a, b) => a.createdAt - b.createdAt)) m.set(r.id, { meta: { id: r.id, name: r.name, type: r.type, bytes: r.bytes, w: r.w, h: r.h }, url: URL.createObjectURL(r.blob) });
    } catch (e) {}
    cache = m; emit(); return m;
  })());
}
export const urlOf = id => cache?.get(id)?.url || null;   // synchronous: null until loadProps() has finished
export const metaOf = id => cache?.get(id)?.meta || null;
setPropResolver(urlOf);
const fail = (...problems) => ({ ok: false, id: null, problems });
const decodes = url => new Promise(res => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res(null); im.src = url; });

/** addProp(file, { name }) -> { ok, id, problems }: sniff, check, quota (64 props, 64 MB), decode an image, then store; refusals are listed, nothing is written */
export async function addProp(file, { name } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') return fail('prop-file');
  const c = await loadProps();
  if (c.size >= PROP_LIMITS.count) return fail('prop-count');
  const buf = new Uint8Array(await file.arrayBuffer()), type = sniff(buf, file.name || name || '');
  if (!type) return fail('prop-type');
  const ck = checkProp({ type, bytes: buf.length, text: type === 'svg' ? new TextDecoder().decode(buf) : undefined });
  if (!ck.ok) return fail(...ck.problems);
  if ([...c.values()].reduce((n, e) => n + e.meta.bytes, 0) + buf.length > PROP_LIMITS.total) return fail('prop-quota');
  const blob = new Blob([buf], { type: MIME[type] });
  let dim = {}; if (type !== 'glb') { const u = URL.createObjectURL(blob), d = await decodes(u); URL.revokeObjectURL(u); if (!d) return fail('prop-decode'); dim = d; }
  const id = propId(name || file.name, [...c.keys()]), label = String(name || file.name || id).replace(/[\r\n]+/g, ' ').slice(0, 60);
  const rec = { key: `${pack()}::${id}`, pack: pack(), id, name: label, type, bytes: buf.length, ...dim, createdAt: Date.now(), blob };
  try { const db = await openDB(), t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(rec); await done(t); } catch (e) { return fail('prop-storage'); }
  c.set(id, { meta: { id, name: label, type, bytes: buf.length, w: dim.w, h: dim.h }, url: URL.createObjectURL(blob) }); emit();
  return { ok: true, id, problems: [] };
}
/** removeStoredProp(id) -> boolean: the record, its object URL and the cache entry go */
export async function removeStoredProp(id) {
  const c = await loadProps(), e = c.get(id); if (!e) return false;
  try { const db = await openDB(), t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(`${pack()}::${id}`); await done(t); } catch (x) {}
  try { URL.revokeObjectURL(e.url); } catch (x) {}
  c.delete(id); emit(); return true;
}
/** listProps() -> [{ id, name, type, bytes }] in the order they were added */
export const listProps = async () => [...(await loadProps()).values()].map(e => ({ id: e.meta.id, name: e.meta.name, type: e.meta.type, bytes: e.meta.bytes }));
