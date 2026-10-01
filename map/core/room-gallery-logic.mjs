// 房间图集：与 IndexedDB / DOM 无关的纯逻辑（缩放尺寸、配额检查、图片记录、来源守卫），单独拆出来方便 node --test 直接测。
// 真正读写 IndexedDB 的薄封装见 map/core/room-gallery-db.mjs（只在浏览器里跑，不在这里测）。

export const MAX_DIM = 1600;           // 长边上限（px）
export const WEBP_QUALITY = 0.82;
export const DEFAULT_QUOTA_BYTES = 200 * 1024 * 1024;   // 每个作用域（单聊天 / 全局）默认 200MB 软上限，超了提示存储已满

// 给定原图宽高，算出缩放后的宽高（长边 ≤ MAX_DIM，不放大小图）
export function fitSize(w, h, max = MAX_DIM) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (w <= max && h <= max) return { w, h };
  const s = max / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

// 作用域 key：单聊天用 chatId 隔离，全局共享用固定 key。roomId 是标准房间名（不是自定义显示名），保证改名不影响存储。
export function scopeKey(scope, chatId) {
  if (scope === 'chat') { if (!chatId) throw new Error('chat scope 需要 chatId'); return `chat:${chatId}`; }
  return 'global';
}

export function imageRecordKey(roomId, imgId) { return `${roomId}::${imgId}`; }

// 配额检查：传入当前作用域已用字节数 + 这张新图预计字节数，超过 quota 就返回需要提示的信息，不阻止调用方决定要不要继续
export function checkQuota(usedBytes, incomingBytes, quota = DEFAULT_QUOTA_BYTES) {
  const total = usedBytes + incomingBytes;
  return { ok: total <= quota, usedBytes, incomingBytes, quota, over: Math.max(0, total - quota) };
}

// 生成图片记录（不含二进制数据，供列表/排序用）。可见性只有 'private'（私人图，只在本机、永不导出，K-R102）和 'pack'（已复制进设定包草稿的标记）；
// 以前存下的 'public' 一律读作 'private'（那个旧标记从来不会自己导出任何东西）。
export function makeImageMeta({ id, roomId, order, visibility = 'private', w, h, bytes, note = '', createdAt = Date.now() }) {
  if (!id || !roomId) throw new Error('makeImageMeta 需要 id 与 roomId');
  if (visibility === 'public') visibility = 'private';
  if (!['private', 'pack'].includes(visibility)) throw new Error("visibility 只能是 private(私人) / pack(设定包)");
  return { id, roomId, order: order | 0, visibility, w: w | 0, h: h | 0, bytes: bytes | 0, note, createdAt };
}

// 重新编号 order（删除/拖拽排序后调用），保持稳定顺序、去掉空洞
export function reorder(list, fromId, toIndex) {
  const arr = list.slice().sort((a, b) => a.order - b.order);
  const idx = arr.findIndex(x => x.id === fromId);
  if (idx < 0) return arr.map((x, i) => ({ ...x, order: i }));
  const [item] = arr.splice(idx, 1);
  arr.splice(Math.max(0, Math.min(toIndex, arr.length)), 0, item);
  return arr.map((x, i) => ({ ...x, order: i }));
}

// ---------------- 来源守卫（K-R101 的第 1 条「包目录下的相对路径」由此推广：查看器自己绝不去显示不在 art/gallery/<房间>/ 下、文件名不合法或类型不在白名单里的图） ----------------
export const GALLERY_DIR = 'art/gallery/';
export const GALLERY_MAX_BYTES = 3 * 1024 * 1024;
export const GALLERY_EXT = ['.webp', '.jpg', '.jpeg', '.png'];

// 校验一条图片记录的文件名本身合法（不含路径穿越、类型在白名单里）
export function isValidGalleryFile(file) {
  if (!file || typeof file !== 'string') return false;
  if (file.includes('/') || file.includes('\\') || file.startsWith('.')) return false;
  const ext = (file.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
  return GALLERY_EXT.includes(ext);
}

// 拼出图的相对地址，并同时保证落在 art/gallery/<roomId>/ 下——不接受任何别的来源（例如直接把某个外部 URL 塞进 file 字段）。返回 null 表示拒绝显示。
export function safeGalleryImagePath(roomId, file) {
  if (!roomId || typeof roomId !== 'string') return null;
  if (!isValidGalleryFile(file)) return null;
  return `${GALLERY_DIR}${encodeURIComponent(roomId)}/${encodeURIComponent(file)}`;
}
