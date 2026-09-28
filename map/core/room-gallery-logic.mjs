// 房间图集：与 IndexedDB / DOM 无关的纯逻辑（缩放尺寸、配额检查、导出包结构），单独拆出来方便 node --test 直接测。
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

// 生成图片记录（不含二进制数据，供列表/排序/导出用）
export function makeImageMeta({ id, roomId, order, visibility = 'private', w, h, bytes, note = '', createdAt = Date.now() }) {
  if (!id || !roomId) throw new Error('makeImageMeta 需要 id 与 roomId');
  if (!['private', 'public'].includes(visibility)) throw new Error('visibility 只能是 private(自用) / public(公开)');
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

// 公开导出包：只导出 visibility === 'public' 的图，产出 manifest.json（合并进仓库 map/data/gallery.json 用）+ 每张图的文件名清单。
// 实际二进制打包（zip）由调用方用浏览器端的 zip 逻辑做；这里只定结构，方便测试与 UI 复用同一份逻辑。
export function buildExportManifest({ roomId, images, author = '', note = '' }) {
  if (!roomId) throw new Error('buildExportManifest 需要 roomId');
  const pub = images.filter(x => x.visibility === 'public').sort((a, b) => a.order - b.order);
  const files = pub.map((img, i) => ({
    id: img.id,
    file: `${roomId}_${String(i + 1).padStart(2, '0')}.webp`,
    w: img.w, h: img.h, note: img.note || '',
  }));
  return {
    manifest: {
      room: roomId, author, note, exportedAt: new Date().toISOString(),
      images: files.map(f => ({ file: f.file, w: f.w, h: f.h, note: f.note })),
    },
    files,
    count: files.length,
  };
}

// GitHub issue/PR 预填链接：只给维护者模式用的自用快捷方式（见 room-gallery-panel.js），不面向陌生访客——
// 本函数不做任何身份判断，是否显示由调用方按维护者模式开关决定。
export function buildIssueUrl({ repo, roomId, count }) {
  const title = encodeURIComponent(`[图集投稿] ${roomId} · ${count} 张`);
  const body = encodeURIComponent(
    `房间：${roomId}\n图片数：${count}\n\n请把附件里的 manifest.json + 图片文件合并进 map/data/gallery.json 与对应目录（见 docs 里图集说明）。`
  );
  return `https://github.com/${repo}/issues/new?title=${title}&body=${body}`;
}

// ---------------- 公开图集来源守卫（真正的「谁能发布」由 GitHub 仓库权限把关：只有仓库所有者能提交 map/data/gallery.json，
// 客户端脚本没法安全鉴权任何人——这里只保证查看器自己绝不去显示 gallery.json 之外、或不在 map/art/gallery/ 目录下的图） ----------------
export const GALLERY_DIR = 'art/gallery/';
export const GALLERY_MAX_BYTES = 3 * 1024 * 1024;
export const GALLERY_EXT = ['.webp', '.jpg', '.jpeg', '.png'];

// 校验 gallery.json 里一条 { file } 记录的文件名本身合法（不含路径穿越、类型在白名单里）
export function isValidGalleryFile(file) {
  if (!file || typeof file !== 'string') return false;
  if (file.includes('/') || file.includes('\\') || file.startsWith('.')) return false;
  const ext = (file.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
  return GALLERY_EXT.includes(ext);
}

// 拼出公开图的相对地址，并同时保证落在 map/art/gallery/<roomId>/ 下——查看器渲染前必须过这一步，
// 不接受 gallery.json 之外的任何来源（例如直接把某个外部 URL 塞进 note/file 字段）。返回 null 表示拒绝显示。
export function safeGalleryImagePath(roomId, file) {
  if (!roomId || typeof roomId !== 'string') return null;
  if (!isValidGalleryFile(file)) return null;
  return `${GALLERY_DIR}${encodeURIComponent(roomId)}/${encodeURIComponent(file)}`;
}

// 本机「维护者模式」开关：默认关闭，只有仓库所有者自己在 设置→高级 里手动打开，才会看到「投稿」「导出」相关 UI。
// 这不是安全边界（客户端脚本没法鉴权），只是给所有者自己用的工作流开关；普通用户看不到「公开」这个概念，图片永远本地私有。
export const MAINTAINER_MODE_KEY = 'edenGalleryMaintainerMode';
export function readMaintainerMode(storage) {
  try { return storage?.getItem(MAINTAINER_MODE_KEY) === '1'; } catch (e) { return false; }
}
