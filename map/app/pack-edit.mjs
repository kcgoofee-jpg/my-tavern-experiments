// Edit mode, the model side (docs/kernel-schema.md K-R100; docs/zero-config.md §7): the draft of one pack, its operations and its storage. The draft itself (shape, merge, overlay) is core/pack-draft.mjs.
// `createEditor({ pack, draft, onChange })` holds the draft over a loaded (validated) pack; every operation checks its input, writes the draft and calls `onChange(draft)`; the viewer then
// re-projects the applied pack (app/pack-live.mjs). Operations return { ok: true, id? } or { ok: false, code }. Text and pictures a user types or picks are checked again by validate2 on export.
// Storage: the draft without picture bytes in `edenMap:edit:<pack id>` (LocalStore), the bytes in the gallery IndexedDB under scope `edit:<pack id>` (private pictures are another scope and never enter a draft).
import { emptyDraft, normDraft, applyDraft, isEmptyDraft } from '../core/pack-draft.mjs';
import { buildTree } from '../core/nodes.mjs';
import { fnv36, cpLen, normalise } from '../core/lexicon.mjs';
import { decodedBytes, srcKind, MAX_PICTURE, MAX_ITEMS } from '../core/pack-media.mjs';

export const DRAFT_PREFIX = 'edenMap:edit:', EDIT_SCOPE = id => `edit:${id}`, PIC_ROOM = 'media';
const clone = v => JSON.parse(JSON.stringify(v));
const no = code => ({ ok: false, code }), yes = (id, extra) => ({ ok: true, ...(id !== undefined ? { id } : {}), ...(extra || {}) });
const unit = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const ID = /^[a-z][a-z0-9_]{0,63}$/;

export function createEditor({ pack, draft = null, onChange = () => {} } = {}) {
  let d = normDraft(draft);
  const applied = () => applyDraft(pack, d).pack;
  const treeOf = () => buildTree(applied().nodes, { title: pack.title });
  const touch = () => { try { onChange(d); } catch (e) { console.warn('[edit] onChange', e); } return d; };
  const node = id => d.nodes[id] || (d.nodes[id] = {});
  const exists = id => typeof id === 'string' && treeOf().has(id);
  const E = {
    get draft() { return d; },
    applied,
    pack: () => pack,
    isEmpty: () => isEmptyDraft(d),
    /** K-R31: editors always write `at.view` (the view the position is in); x and y are fractions of the picture. */
    move(id, at) {
      if (!exists(id)) return no('node');
      if (!at || !unit(at.x) || !unit(at.y) || typeof at.view !== 'string' || !ID.test(at.view)) return no('at');
      node(id).at = { x: +at.x.toFixed(4), y: +at.y.toFixed(4), view: at.view }; touch(); return yes(id);
    },
    /** A node cannot go under itself or under one of its descendants (no cycle can be made); the root stays the root. */
    reparent(id, parent) {
      const t = treeOf();
      if (!t.has(id) || !t.has(parent)) return no('node');
      if (id === t.root) return no('root');
      if (id === parent || t.ancestors(parent).includes(id)) return no('cycle');
      node(id).parent = parent; touch(); return yes(id);
    },
    addAlias(id, word) {
      const w = typeof word === 'string' ? word.trim() : '';
      if (!exists(id)) return no('node');
      if (!w || cpLen(w) > 60 || /\n/.test(w)) return no('word');
      const n = treeOf().get(id), have = [n.name, ...(Array.isArray(n.alias) ? n.alias : [])];
      if (have.some(a => normalise(a) === normalise(w))) return no('dup');
      if ((Array.isArray(n.alias) ? n.alias.length : 0) >= 64) return no('limit');
      const c = node(id); c.alias_add = [...(c.alias_add || []), w]; touch(); return yes(id);
    },
    /** A new place under `parent`, at a point of the parent's frame: id `e_<fnv36(name + parent)>`. */
    addPlace(parent, name, at) {
      const nm = typeof name === 'string' ? name.trim() : '', t = treeOf();
      if (!t.has(parent)) return no('node');
      if (!nm || cpLen(nm) > 80 || /\n/.test(nm)) return no('name');
      if (at !== undefined && (!unit(at?.x) || !unit(at?.y) || typeof at.view !== 'string' || !ID.test(at.view))) return no('at');
      const id = `e_${fnv36(nm + '\n' + parent)}`;
      if (t.has(id)) return no('dup');
      if (d.add.length >= 500) return no('limit');
      d.add.push({ id, name: nm, parent, ...(at ? { at: { x: +at.x.toFixed(4), y: +at.y.toFixed(4), view: at.view } } : {}) }); touch(); return yes(id);
    },
    setStart(id) { if (!exists(id)) return no('node'); d.start = id; touch(); return yes(id); },
    /** A picture for the pack: { src (data URL), w?, h?, note? } -> its media id (`m_<hash of the picture>`); the same picture twice is one item. */
    addPicture(item) {
      const src = item?.src;
      if (srcKind(src) !== 'data') return no('src');
      if (decodedBytes(src) > MAX_PICTURE) return no('size');
      const id = `m_${fnv36(src)}`, have = { ...(applied().media || {}) };
      if (!have[id] && Object.keys(have).length >= MAX_ITEMS) return no('limit');
      d.media[id] = { ...(d.media[id] || {}), src, ...(Number.isInteger(item.w) && item.w > 0 ? { w: item.w } : {}), ...(Number.isInteger(item.h) && item.h > 0 ? { h: item.h } : {}), ...(typeof item.note === 'string' && item.note ? { note: item.note } : {}) };
      touch(); return yes(id);
    },
    attach(id, mediaId) {
      const p = applied();
      if (!exists(id)) return no('node');
      if (!p.media || !p.media[mediaId]) return no('media');
      const list = d.attach[id] || [], now = treeOf().get(id).media || [];
      if (now.includes(mediaId)) return no('dup');
      if (now.length >= 32) return no('limit');
      d.attach[id] = [...list, mediaId]; touch(); return yes(id);
    },
    detach(id, mediaId) { const l = d.attach[id]; if (!l || !l.includes(mediaId)) return no('media'); d.attach[id] = l.filter(m => m !== mediaId); if (!d.attach[id].length) delete d.attach[id]; touch(); return yes(id); },
    /** "Use a picture as this place's map" (§7.3): the node gets an image view framed by the picture; `positions` = { child id: { x, y } } (the children's positions on their current view) become their first `at` in the new frame. */
    useAsMap(id, mediaId, positions = {}, extent) {
      const p = applied(), item = p.media && p.media[mediaId];
      if (!exists(id)) return no('node');
      if (!item) return no('media');
      if (!ID.test(id)) return no('id');
      const w = item.w || 1600, h = item.h || 1000;
      d.views[id] = { kind: 'image', media: mediaId, extent: Array.isArray(extent) ? extent : [1600, +(1600 * h / w).toFixed(1)] };
      for (const [cid, pt] of Object.entries(positions)) if (cid !== id && unit(pt?.x) && unit(pt?.y) && exists(cid)) node(cid).at = { x: +pt.x.toFixed(4), y: +pt.y.toFixed(4), view: id };
      touch(); return yes(id);
    },
    discard() { d = emptyDraft(); touch(); return yes(); },
  };
  return E;
}

// ---- storage (K-R100: a local draft per pack id; the pictures in IndexedDB) ----
const strip = draft => { const x = clone(draft); for (const m of Object.values(x.media)) delete m.src; return x; };
/** `store` = { get(key), set(key, value), remove(key) } (LocalStore); `pics` = { read(id) -> data URL | null, write(id, dataUrl), clear(keep: [ids]) }. */
export async function saveDraft(packId, draft, { store, pics }) {
  if (isEmptyDraft(draft)) { store.remove(DRAFT_PREFIX + packId); try { await pics?.clear([]); } catch (e) {} return; }
  store.set(DRAFT_PREFIX + packId, JSON.stringify(strip(draft)));
  if (pics) try { for (const [id, m] of Object.entries(draft.media)) if (m.src) await pics.write(id, m.src); await pics.clear(Object.keys(draft.media)); } catch (e) { console.warn('[edit] pictures not saved', e); }
}
export async function loadDraft(packId, { store, pics }) {
  let raw = null; try { raw = JSON.parse(store.get(DRAFT_PREFIX + packId) || 'null'); } catch (e) {}
  const d = normDraft(raw);
  for (const id of Object.keys(d.media)) {
    let src = null; try { src = pics ? await pics.read(id) : null; } catch (e) {}
    if (srcKind(src) === 'data' && decodedBytes(src) <= MAX_PICTURE) d.media[id].src = src; else delete d.media[id];   // bytes gone: the item goes, its attachments are dropped by the cross check
  }
  return d;
}
/** The IndexedDB side (core/room-gallery-db.mjs, scope `edit:<pack id>`); loaded on first use. */
export function idbPictures(packId) {
  const scope = EDIT_SCOPE(packId), db = () => import('../core/room-gallery-db.mjs');
  const toBlob = u => { const [h, b] = u.split(','), bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: h.slice(5, h.indexOf(';')) }); };
  const toUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  return {
    async read(id) { const D = await db(), l = await D.listImages(scope, PIC_ROOM), r = l.find(x => x.id === id); return r ? toUrl(r.blob) : null; },
    async write(id, url) { const D = await db(), b = toBlob(url); await D.putImage(scope, { id, roomId: PIC_ROOM, order: 0, visibility: 'private', w: 0, h: 0, bytes: b.size, note: '', createdAt: Date.now() }, b); },
    async clear(keep) { const D = await db(); for (const r of await D.listImages(scope, PIC_ROOM)) if (!keep.includes(r.id)) await D.deleteImage(scope, PIC_ROOM, r.id); },
  };
}
