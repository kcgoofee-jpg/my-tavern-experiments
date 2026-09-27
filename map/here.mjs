// 当前地点（MVU「世界.当前地点」）→ 地图上该落在哪里。纯函数：查看器 viewer.html 与 node 单测（tests/here.test.mjs）共用，不碰 DOM。
// 从最具体到最粗，六级：
//   1 庄园房间（主卧、书房……）            → eden_estate，庄园页按房间名切楼层并高亮（estate:room）
//   2 庄园室外区域（前庭、玫瑰园……）或只写庄园 → eden_estate 外观，庄园页聚焦该区域（同一条 estate:room，区域名也认）
//   3 天城地标（执法局、7 号井……）          → 所在层，聚焦该标记
//   4 只有层名或大区（中层、地基区、商业区……）→ 该层，默认视野（view.focus）
//   5 只有「天城」→ 天城最上面一层的默认视野；世界地名 → 世界图聚焦该地点
//   6 匹配不到 → null（保持现状，不跳转）
// 匹配：各级词表里取「当前地点」包含的最长词；中文按原样、英文不分大小写。
// 词表来自 maps.json：庄园地图的 rooms / areas（中英）与 alias；points 地图的 markers（name / alias / name_en）、layer、districts；
// 世界图的地点来自 world_markers.json（places / fiefs / realms），英文名来自 i18n/en.json 的 names（可选）。

const low = s => String(s || '').toLowerCase();
// v 里包含的 words 中最长的一个（长度按字符数）；没有返回 null
function longest(v, words) {
  let best = null;
  for (const w of words) {
    if (!w) continue;
    const hit = /[a-z]/i.test(w) ? low(v).includes(low(w)) : v.includes(w);
    if (hit && (!best || [...w].length > [...best].length)) best = w;
  }
  return best;
}
const len = w => (w ? [...w].length : 0);

/** 由 maps.json（和可选的世界地点、英文名）建一次词表 */
// custom：用户在本机自定义的房间叫法（不进仓库、不上 CDN），{ rooms: { 自定义名: 标准房间名 } }。
// 当前地点写的是自定义名时，按对应的标准房间落点；来源见 viewer 的 EdenMap.setRoomAlias（存储见文件末尾 readCustom / setRoomAlias）。
export function buildIndex(reg, world = null, names = null, custom = null) {
  const maps = reg?.maps || {}, idx = { estate: null, marks: [], layers: [], tiancheng: null, world: [] };
  const en = z => (names && names[z]) || null;
  // 庄园（kind=estate）：房间 / 区域词表；整座庄园的叫法 = alias 里不是房间也不是区域的词 + 标题 + 链接到它的地标（如上层的「伊甸庄园」）
  for (const [id, m] of Object.entries(maps)) {
    if (m.kind !== 'estate' || m.status === 'planned') continue;
    const rooms = [...(m.rooms || []), ...(m.rooms_en || [])], areas = [...(m.areas || []), ...(m.areas_en || [])];
    const whole = new Set([m.title, m.title_en, m.layer?.name, m.layer?.name_en, ...(m.alias || []).filter(w => !rooms.includes(w) && !areas.includes(w))]);
    for (const L of Object.values(maps)) for (const k of Object.values(L.markers || {}))
      if (k.link?.map === id) for (const w of [k.name, k.name_en, ...(k.alias || [])]) if (w && !rooms.includes(w) && !areas.includes(w)) whole.add(w);
    whole.delete(undefined); whole.delete(null); whole.delete('');
    const alias = {}; for (const [w, r] of Object.entries(custom?.rooms || {})) if (w && r && rooms.includes(r)) { alias[w] = r; rooms.push(w); }
    idx.estate = { id, rooms, areas, whole: [...whole], alias, std: rooms.filter(w => !alias[w]) };
    break;
  }
  const estateId = idx.estate?.id;
  // 地标（链接到庄园的那个地标算「整座庄园」，不在这里）与层 / 大区
  for (const [id, m] of Object.entries(maps)) {
    if (m.kind !== 'points' || m.status === 'planned') continue;
    for (const [mk, k] of Object.entries(m.markers || {})) {
      if (estateId && k.link?.map === estateId) continue;
      idx.marks.push({ map: id, marker: mk, words: [k.name, k.name_en, ...(k.alias || [])].filter(Boolean) });
    }
    const L = m.layer || {};
    idx.layers.push({ map: id, words: [L.name, L.sub, L.sub_en, L.name_en && L.name_en + ' Tier', ...(m.districts || [])].filter(Boolean) });
  }
  // 「天城」：group 的标题（中英）+ 世界图上同名地点的英文名；落到该组第一张 points 地图
  for (const g of Object.values(reg?.groups || {})) {
    const first = (g.layers || []).find(k => maps[k]?.kind === 'points' && maps[k].status !== 'planned');
    if (first) { idx.tiancheng = { map: first, words: [g.title, g.title_en, en(g.title)].filter(Boolean) }; break; }
  }
  // 世界图地点
  const wid = Object.keys(maps).find(k => maps[k].kind === 'world');
  if (wid && world) for (const p of [...(world.places || []), ...(world.fiefs || []), ...(world.realms || [])]) {
    idx.world.push({ map: wid, name: p.name, words: [p.name, p.name_en, en(p.name)].filter(Boolean) });
  }
  return idx;
}

/** 当前地点 → { level, map, room?, marker?, place?, word } 或 null */
export function resolveHere(value, idx) {
  const v = String(value || '').replace(/\{\{user\}\}/g, '').trim();
  if (!v || !idx) return null;
  // 各级最长匹配
  const E = idx.estate, eWhole = E && longest(v, E.whole), eRoom = E && longest(v, E.rooms), eArea = E && longest(v, E.areas);
  let mark = null; for (const k of idx.marks) { const w = longest(v, k.words); if (w && len(w) > len(mark?.word)) mark = { ...k, word: w }; }
  let lay = null; for (const k of idx.layers) { const w = longest(v, k.words); if (w && len(w) > len(lay?.word)) lay = { ...k, word: w }; }
  // 庄园：写了庄园（且没有更长的别处地标，如「财团家族庄园」），或只写了房间 / 区域而没有写别的层、地标
  const inEstate = E && ((eWhole && len(eWhole) >= len(mark?.word)) || (!eWhole && (eRoom || eArea) && !mark && !lay));
  if (inEstate) {
    if (eRoom && len(eRoom) >= len(eArea) - 1) return E.alias?.[eRoom] ? { level: 1, map: E.id, room: E.alias[eRoom], word: eRoom, custom: true } : { level: 1, map: E.id, room: v, word: eRoom };   // 「后庭浴室」这类两者都有时偏向房间
    if (eArea) return { level: 2, map: E.id, room: v, word: eArea };
    return { level: 2, map: E.id, room: v, word: eWhole };
  }
  if (mark) return { level: 3, map: mark.map, marker: mark.marker, word: mark.word };
  if (lay) return { level: 4, map: lay.map, word: lay.word };
  const tw = idx.tiancheng && longest(v, idx.tiancheng.words);
  if (tw) return { level: 5, map: idx.tiancheng.map, word: tw };
  let wp = null; for (const p of idx.world) { const w = longest(v, p.words); if (w && len(w) > len(wp?.word)) wp = { ...p, word: w }; }
  if (wp) return { level: 5, map: wp.map, place: wp.name, word: wp.word };
  return null;
}

// ---------------- 本机自定义叫法的存储（E6；viewer 的 window.EdenMap 与卡内脚本 eden-map.js 共用） ----------------
// 只在用户本机 localStorage：有聊天 id 时按聊天分开存「edenMap:chat:<id>:custom」，否则全局「edenMap:custom」。值 = JSON { rooms: { 自定义名: 标准房间名 } }。
// store = 带 getItem / setItem / removeItem 的对象（localStorage；单测里用假的）。不联网、不上传。
export const customKey = chat => (chat ? `edenMap:chat:${chat}:custom` : 'edenMap:custom');
export function readCustom(store, chat) {
  let o = null; try { o = JSON.parse(store?.getItem(customKey(chat)) || 'null'); } catch (e) {}
  const rooms = {};
  if (o && o.rooms && typeof o.rooms === 'object') for (const [k, v] of Object.entries(o.rooms)) if (typeof k === 'string' && typeof v === 'string' && k && v) rooms[k] = v;
  return { rooms };
}
function writeCustom(store, chat, c) {
  try { if (Object.keys(c.rooms).length) store.setItem(customKey(chat), JSON.stringify(c)); else store.removeItem(customKey(chat)); return true; } catch (e) { return false; }
}
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
/** 自定义名 → 标准房间名。valid = 标准房间名列表（知道时校验；不知道传 null，落点时 buildIndex 仍会忽略无效的）。返回 true / false */
export function setRoomAlias(store, chat, name, room, valid = null) {
  name = clean(name); room = clean(room);
  if (!name || !room || name === room || [...name].length > 40) return false;
  if (valid && (!valid.includes(room) || valid.includes(name))) return false;   // 只能指向标准房间；不能把标准房间名改指别处
  const c = readCustom(store, chat); c.rooms[name] = room; return writeCustom(store, chat, c);
}
export function removeRoomAlias(store, chat, name) {
  name = clean(name); const c = readCustom(store, chat);
  if (!(name in c.rooms)) return false; delete c.rooms[name]; return writeCustom(store, chat, c);
}
