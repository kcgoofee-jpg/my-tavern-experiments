// 房间图集：真正读写 IndexedDB 的薄封装（只在浏览器里跑）。纯逻辑（尺寸/配额/导出结构）见 map/core/room-gallery-logic.mjs，那份用 node --test 测。
// 数据库：edenRoomGallery，一个 store `images`，key = `${scope}::${roomId}::${imgId}`（imageRecordKey 只管 roomId+imgId，这里前面再拼 scope 隔离聊天/全局）。
// 记录：{ key, scope, roomId, id, order, visibility, w, h, bytes, note, createdAt, blob }（blob 是已转好的 webp Blob）。
import { imageRecordKey, checkQuota, DEFAULT_QUOTA_BYTES } from './room-gallery-logic.mjs';

const DB_NAME = 'edenRoomGallery';
const STORE = 'images';
const DB_VERSION = 1;

export function indexedDBAvailable() {
  try { return typeof indexedDB !== 'undefined' && indexedDB != null; } catch (e) { return false; }
}

let dbPromise = null;
function openDB() {
  if (!indexedDBAvailable()) return Promise.reject(new Error('IndexedDB 不可用（隐私模式或浏览器不支持）'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'key' });
        os.createIndex('byScopeRoom', ['scope', 'roomId'], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('打开 IndexedDB 失败'));
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

function tx(db, mode) { const t = db.transaction(STORE, mode); return { t, store: t.objectStore(STORE) }; }
function reqp(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error || new Error('IndexedDB 操作失败')); }); }

// 列出某作用域+房间的所有图（不含 blob 以外字段也都在，前端按需取 blob 生成 objectURL）
export async function listImages(scope, roomId) {
  const db = await openDB();
  const { store } = tx(db, 'readonly');
  const idx = store.index('byScopeRoom');
  const range = IDBKeyRange.only([scope, roomId]);
  const out = await reqp(idx.getAll(range));
  return out.sort((a, b) => a.order - b.order);
}

// 某作用域下所有图（用于计算已用字节数、配额检查）
export async function listScopeUsage(scope) {
  const db = await openDB();
  const { store } = tx(db, 'readonly');
  const all = await reqp(store.getAll());
  const mine = all.filter((r) => r.scope === scope);
  return { count: mine.length, bytes: mine.reduce((s, r) => s + (r.bytes | 0), 0) };
}

// 清掉一个作用域的全部图（重置本聊天 / 清理已删聊天的孤儿）；返回删掉的张数
export async function deleteScope(scope) {
  const db = await openDB();
  const { t, store } = tx(db, 'readwrite');
  const all = await reqp(store.getAll());
  let n = 0;
  for (const r of all) if (r.scope === scope) { store.delete(r.key); n++; }
  await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  return n;
}

// 库里出现过的全部作用域（孤儿清理用）
export async function listScopes() {
  const db = await openDB();
  const { store } = tx(db, 'readonly');
  const all = await reqp(store.getAll());
  return [...new Set(all.map((r) => r.scope))];
}

export async function putImage(scope, meta, blob) {
  const db = await openDB();
  const key = `${scope}::${imageRecordKey(meta.roomId, meta.id)}`;
  const rec = { ...meta, scope, key, blob };
  const { t, store } = tx(db, 'readwrite');
  store.put(rec);
  await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  return rec;
}

export async function deleteImage(scope, roomId, imgId) {
  const db = await openDB();
  const key = `${scope}::${imageRecordKey(roomId, imgId)}`;
  const { t, store } = tx(db, 'readwrite');
  store.delete(key);
  await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
}

export async function updateMeta(scope, roomId, imgId, patch) {
  const db = await openDB();
  const key = `${scope}::${imageRecordKey(roomId, imgId)}`;
  const { t, store } = tx(db, 'readwrite');
  const cur = await reqp(store.get(key));
  if (!cur) throw new Error('找不到这张图: ' + key);
  const next = { ...cur, ...patch, key };
  store.put(next);
  await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  return next;
}

export async function reorderImages(scope, roomId, orderedIds) {
  const db = await openDB();
  const { t, store } = tx(db, 'readwrite');
  for (let i = 0; i < orderedIds.length; i++) {
    const key = `${scope}::${imageRecordKey(roomId, orderedIds[i])}`;
    const cur = await reqp(store.get(key));
    if (cur) store.put({ ...cur, order: i });
  }
  await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
}

// 把 File/Blob 缩到 ≤1600px 长边，转 webp。返回 { blob, w, h }
export async function resizeToWebp(file, maxDim, quality) {
  const bmp = await createImageBitmap(file);
  const { fitSize } = await import('./room-gallery-logic.mjs');
  const { w, h } = fitSize(bmp.width, bmp.height, maxDim);
  const canvas = ('OffscreenCanvas' in self) ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  let blob;
  if (canvas.convertToBlob) blob = await canvas.convertToBlob({ type: 'image/webp', quality });
  else blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', quality));
  if (!blob) throw new Error('浏览器不支持生成 webp');
  return { blob, w, h };
}

export async function scopeUsageAndCheck(scope, incomingBytes, quota = DEFAULT_QUOTA_BYTES) {
  const { bytes } = await listScopeUsage(scope);
  return checkQuota(bytes, incomingBytes, quota);
}
