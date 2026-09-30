// 空间化图文拍立得见闻录（Part 5-5，2026-09-30）：把玩家在自己这局里攒下的图与手记钉到地标上——
// 以后点开这个地标，除了地点本身的设定，还能翻出「我上次在这里留下了什么」。
// 分工（图不进聊天、不进聊天变量，这条与房间图集一致）：
//   图的字节：IndexedDB（map/core/room-gallery-db.mjs，roomId = 'sb:' + 地点名），与房间图集同一份库、同一套配额；
//   图与手记的索引（谁钉在哪、第几楼、说明文字）：本模块管，落在本机存储（按聊天分）。
// 纯核心：不碰 DOM / 存储 / 酒馆全局；node 单测 tests/scrapbook.test.mjs。
const CUT = (s, n) => [...String(s ?? '').trim()].slice(0, n).join('');

export const ROOM_PREFIX = 'sb:';       // 图集里的 roomId 前缀：与「房间图集」分开，两边互不串台
export const MAX_ITEMS = 300;           // 一个聊天最多钉多少条（图 + 手记合计）
export const MAX_TEXT = 500;            // 单条手记 / 图注上限
export const IMAGE_MAX_BYTES = 400000;  // 单张图上限（缩图转 webp 之后的字节数；与图集 200 MB 软配额无关）

/** 地点名 → 图集里的 roomId（前缀让两个图集不共用一张列表） */
export const roomIdOf = place => ROOM_PREFIX + CUT(place, 60);
/** 反向：roomId 是见闻录的才认，返回地点名；否则 null */
export function placeOf(roomId) {
  const s = String(roomId ?? '');
  return s.startsWith(ROOM_PREFIX) ? s.slice(ROOM_PREFIX.length) : null;
}

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/**
 * 索引规范化：坏行丢弃、字段裁剪、乱序不动（按写入顺序，新的在后）。
 * 行：{ id, place, map, at（楼层）, kind: 'image' | 'note', ref?（图集里的图片 id）, text?, w?, h?, bytes? }
 */
export function norm(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const items = [];
  for (const e of Array.isArray(src.items) ? src.items.slice(0, MAX_ITEMS) : []) {
    if (!e || typeof e !== 'object') continue;
    const id = CUT(e.id, 40), place = CUT(e.place, 60);
    if (!id || !place) continue;
    const kind = e.kind === 'note' ? 'note' : (e.kind === 'image' ? 'image' : null);
    if (!kind) continue;
    const row = { id, place, map: CUT(e.map, 40), at: Math.max(0, Math.round(num(e.at))), kind };
    if (kind === 'image') { if (!e.ref) continue; row.ref = CUT(e.ref, 60); if (num(e.w) > 0) row.w = Math.round(num(e.w)); if (num(e.h) > 0) row.h = Math.round(num(e.h)); if (num(e.bytes) > 0) row.bytes = Math.round(num(e.bytes)); }
    const t = CUT(e.text, MAX_TEXT); if (t) row.text = t;
    items.push(row);
  }
  return { items };
}

/** 钉一条：{ place, map?, at?, kind, ref?, text?, id? }。没给 id 就按内容混一个（ASCII、可复现）；满了 / 没地点 / 图不带 ref → 不写。 */
export function pin(meta, rec = {}) {
  const cur = norm(meta);
  const place = CUT(rec.place, 60);
  if (!place) return { items: cur.items, ok: false, reason: 'place' };
  const kind = rec.kind === 'note' ? 'note' : 'image';
  if (kind === 'image' && !CUT(rec.ref, 60)) return { items: cur.items, ok: false, reason: 'ref' };
  if (cur.items.length >= MAX_ITEMS) return { items: cur.items, ok: false, reason: 'full' };
  const id = CUT(rec.id, 40) || ('x' + fnv([kind, place, rec.ref || '', rec.text || ''].join('|')).toString(36));
  if (cur.items.some(r => r.id === id)) return { items: cur.items, ok: false, reason: 'dup', id };
  const row = { id, place, map: CUT(rec.map, 40), at: Math.max(0, Math.round(num(rec.at))), kind };
  if (kind === 'image') { row.ref = CUT(rec.ref, 60); for (const k of ['w', 'h', 'bytes']) if (num(rec[k]) > 0) row[k] = Math.round(num(rec[k])); }
  const t = CUT(rec.text, MAX_TEXT); if (t) row.text = t;
  return { items: [...cur.items, row], ok: true, id };
}

/** 摘掉一条（图与手记同表）；返回删掉的行（用于连带删 IndexedDB 里的字节） */
export function unpin(meta, id) {
  const cur = norm(meta);
  const row = cur.items.find(r => r.id === id) || null;
  return { items: cur.items.filter(r => r.id !== id), ok: !!row, row };
}

/** 某个地点上钉的东西（按楼层 / 写入序；图在前、手记在后，看着像一本册子） */
export function byPlace(meta, place, map) {
  const all = norm(meta).items.filter(r => r.place === CUT(place, 60) && (!map || !r.map || r.map === map));
  const imgs = all.filter(r => r.kind === 'image'), notes = all.filter(r => r.kind === 'note');
  return [...imgs, ...notes];
}

/** 统计：{ images, notes }（地点卡标题上的「见闻录 3」） */
export function countOf(meta, place, map) {
  const list = byPlace(meta, place, map);
  return { images: list.filter(r => r.kind === 'image').length, notes: list.filter(r => r.kind === 'note').length };
}

/** 注入给模型的一行（≤ cap 字）：「见闻录：主人主卧（2 图 / 1 手记）」——只给数量不给图，图本身到地标上翻。空 = '' */
export function digest(meta, cap = 80) {
  const items = norm(meta).items;
  if (!items.length) return '';
  const by = new Map();
  for (const r of items) { const k = r.place; const c = by.get(k) || { images: 0, notes: 0 }; r.kind === 'image' ? c.images++ : c.notes++; by.set(k, c); }
  let out = '见闻录：';
  for (const [p, c] of by) out += `${p}（${c.images} 图 / ${c.notes} 手记）、`;
  out = out.replace(/、$/, '');
  return out.length > cap ? out.slice(0, cap - 1) + '…' : out;
}

/** 摘要（上下文预算 / 自检）：{ items, images, notes, places } */
export function describe(meta) {
  const items = norm(meta).items;
  return { items: items.length, images: items.filter(r => r.kind === 'image').length, notes: items.filter(r => r.kind === 'note').length,
    places: new Set(items.map(r => r.place)).size };
}

function fnv(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
