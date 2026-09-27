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

const PLACEHOLDER = '（按原卡）';   // 同 card-bind.mjs PLACEHOLDER
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
/** 卡设定房间名 → 叫法：原名、去掉括注 / 「 ×2」的名字、「 / 」两侧各自（两个字以上） */
export function planWords(name) {
  const n = String(name || '').trim(); if (!n) return [];
  const base = n.replace(/[（(][^）)]*[）)]/g, '').replace(/\s*[×x]\s*\d+\s*$/, '').trim();
  const out = [n, base, ...base.split(/\s*[\/／]\s*/)].map(s => s.trim()).filter(s => [...s].length >= 2);
  return [...new Set(out)];
}

/** 由 maps.json（和可选的世界地点、英文名）建一次词表 */
// custom：用户自定义的叫法（不进仓库、不上 CDN），{ rooms: { 自定义名: 标准房间名 }, marks?: { 自定义名: 标准地标名 } }（v0.9.3 起来自聊天变量 eden_map.自定义，见 tavern/mvu.mjs aliasMap）。
// 当前地点写的是自定义名时，按对应的标准房间落点；来源见 viewer 的 EdenMap.setRoomAlias（存储见文件末尾 readCustom / setRoomAlias）。
// v0.9.6：custom 还可以有 areas / layers { 自定义名: 层名或大区名 } / world { 自定义名: 世界地名 } / ignore [名字]（未上图时选了「忽略」）。
// plan：map/data/eden_estate_rooms.json（卡设定分层房间）。房间名（及去掉括注、「 / 」拆开的叫法）进庄园房间词表（第 1 级），
//   落点带 std（标准房间名）与 floor（名字只在一层出现时），restricted 房间带 restricted（只认名字、画素框，不描述）。
//   名字不入库的卡房间 name 是占位「（按原卡）」，不进词表；调用方先用 card-bind.mjs 的 applyBinding 换成用户卡里的原名再传进来。
//   房间的 words（卡里的其他写法）也进词表；custom 里指向旧编号 / 旧名（card_id_alias / retired_names）的叫法换成现在的名字。
export function buildIndex(reg, world = null, names = null, custom = null, plan = null) {
  const maps = reg?.maps || {}, idx = { estate: null, marks: [], layers: [], tiancheng: null, world: [], ambiguous: [...(reg?.ambiguous?.words || [])] };
  const en = z => (names && names[z]) || null;
  // 庄园（kind=estate）：房间 / 区域词表；整座庄园的叫法 = alias 里不是房间也不是区域的词 + 标题 + 链接到它的地标（如上层的「伊甸庄园」）
  for (const [id, m] of Object.entries(maps)) {
    if (m.kind !== 'estate' || m.status === 'planned' || m.test) continue;   // test：viewer3d 测试件（挤奶厅），不是地点
    const rooms = [...(m.rooms || []), ...(m.rooms_en || [])], areas = [...(m.areas || []), ...(m.areas_en || [])];
    const whole = new Set([m.title, m.title_en, m.layer?.name, m.layer?.name_en, ...(m.alias || []).filter(w => !rooms.includes(w) && !areas.includes(w))]);
    for (const L of Object.values(maps)) for (const k of Object.values(L.markers || {}))
      if (k.link?.map === id) for (const w of [k.name, k.name_en, ...(k.alias || [])]) if (w && !rooms.includes(w) && !areas.includes(w)) whole.add(w);
    whole.delete(undefined); whole.delete(null); whole.delete('');
    const std = [...rooms], floor = {}, restricted = new Set(), planStd = {};
    for (const r of plan?.rooms || []) {
      if (!r?.name || r.name === PLACEHOLDER) continue;   // 占位不是名字：没从用户的卡绑定到原名的房间不进词表（见 card-bind.mjs）
      for (const w of [...planWords(r.name), ...(r.words || []), ...(r.synonyms || [])]) { if (!(w in planStd)) planStd[w] = r.name; if (!rooms.includes(w) && !areas.includes(w)) rooms.push(w); }
      floor[r.name] = r.name in floor && floor[r.name] !== r.floor ? null : r.floor;
      if (r.kind === 'restricted') restricted.add(r.name);
    }
    for (const w of rooms) if (!std.includes(w)) std.push(w);
    const alias = {};
    const oldName = r => { const cid = plan?.card_id_alias?.[r] || plan?.retired_names?.[r]; const c = cid && (plan.card_rooms || []).find(x => x.cid === cid); return c && c.name !== PLACEHOLDER ? c.name : null; };   // 旧编号 / 旧名（聊天里存过的）→ 现在的卡房间名
    for (const [w, r0] of Object.entries(custom?.rooms || {})) { const r = r0 && !rooms.includes(r0) ? oldName(r0) : r0; if (w && r && rooms.includes(r) && !std.includes(w)) { alias[w] = r; rooms.push(w); } }
    for (const [w, r] of Object.entries(custom?.areas || {})) if (w && r && areas.includes(r) && !areas.includes(w)) { alias[w] = r; areas.push(w); }
    idx.estate = { id, rooms, areas, whole: [...whole], alias, std, floor, restricted: [...restricted], planStd };
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
    // v0.9.3：地标的自定义显示名（custom.marks { 显示名: 标准地标名 }）也当成这个地标的叫法
    for (const [w, std] of Object.entries(custom?.marks || {})) { const k = idx.marks.find(x => x.map === id && x.words.includes(std)); if (w && k && !k.words.includes(w)) k.words.push(w); }
    const lw = [L.name, L.sub, L.sub_en, L.name_en && L.name_en + ' Tier', ...(m.districts || [])].filter(Boolean);
    for (const [w, std] of Object.entries(custom?.layers || {})) if (w && (std === id || lw.includes(std)) && !lw.includes(w)) lw.push(w);   // v0.9.6：层 / 大区的自定义叫法
    idx.layers.push({ map: id, words: lw });
  }
  // 「天城」：group 的标题（中英）+ 世界图上同名地点的英文名；落到该组第一张 points 地图
  for (const g of Object.values(reg?.groups || {})) {
    const first = (g.layers || []).find(k => maps[k]?.kind === 'points' && maps[k].status !== 'planned');
    if (first) { idx.tiancheng = { map: first, words: [g.title, g.title_en, en(g.title)].filter(Boolean) }; break; }
  }
  // 世界图地点
  const wid = Object.keys(maps).find(k => maps[k].kind === 'world');
  if (wid && world) for (const p of [...(world.places || []), ...(world.fiefs || []), ...(world.realms || [])]) {
    const ww = [p.name, p.name_en, en(p.name), ...(Array.isArray(p.alias) ? p.alias : [])].filter(Boolean);   // alias：卡里的别名（A23 灵枢秘派 → 虚灵古派）
    for (const [w, std] of Object.entries(custom?.world || {})) if (w && std === p.name && !ww.includes(w)) ww.push(w);   // v0.9.6：世界地名的自定义叫法
    idx.world.push({ map: wid, name: p.name, words: ww });
  }
  idx.ignore = [...new Set((custom?.ignore || []).map(s => String(s || '').trim()).filter(Boolean))];
  return idx;
}

// ---------------- v0.9.5 途中：「A至B的…」「从A到B」「前往B」「A → B」 ----------------
// 返回 { from, to, via } 文本（via = 句尾的交通工具 / 处所，如「…的某某舱内」）；认不出返回 null。只做字符串切分，不过滤。
const TAIL = /(?:的|之间|途中|路上|路途|航程|中途)/;
export function parseTransit(value) {
  const v = String(value || '').replace(/\{\{user\}\}/g, '').trim(); if (!v) return null;
  const cut = s => { const m = s.match(TAIL); if (!m) return [s.trim(), '']; const via = s.slice(m.index + m[0].length).trim(); return [s.slice(0, m.index).trim(), /^(路上|途中|中途|航程|之间|路途)?$/.test(via) ? '' : via]; };
  let m;
  if ((m = v.match(/^(.*?)从\s*(.+?)\s*(?:到|去往|去|前往|飞往|驶向|往)\s*(.+)$/))) { const [to, via] = cut(m[3]); return to && m[2] ? { from: (m[1] + m[2]).trim(), to, via } : null; }
  if ((m = v.match(/^(.+?)\s*(?:→|->|⇒)\s*(.+)$/))) { const [to, via] = cut(m[2]); return to ? { from: m[1].trim(), to, via } : null; }
  if ((m = v.match(/^(.+?)至(.+)$/)) && !/^[高少多今甚]/.test(m[2])) { const [to, via] = cut(m[2]); return to && [...m[1]].length >= 2 ? { from: m[1].trim(), to, via } : null; }
  if ((m = v.match(/^(.*?)(?:前往|去往|驶向|飞往|赶往|开往)\s*(.+)$/))) { const [to, via] = cut(m[2]); return to ? { from: m[1].replace(/[，,、\s]+$/, '').trim(), to, via } : null; }
  return null;
}
const layerPrefix = s => { const m = String(s).match(/^(.*?[·・])/); return m ? m[1] : ''; };
/** 途中地点 → { from: 落点|null, to: 落点|null, fromText, toText, via }；两端都认不出返回 null。终点没写层时借起点的层前缀再试一次 */
export function resolveTransit(value, idx) {
  const t = parseTransit(value); if (!t) return null;
  const from = t.from ? resolveOne(t.from, idx) : null;
  let to = resolveOne(t.to, idx); if (!to && layerPrefix(t.from)) { const r = resolveOne(layerPrefix(t.from) + t.to, idx); if (r && r.level <= 3) to = r; }
  if (!from && !to) return null;
  return { from, to, fromText: t.from, toText: t.to, via: t.via };
}
/** 标题栏胶囊的文字：「A → B（途中）」；不是途中返回 null */
export function transitLabel(value, en = false) {
  const t = parseTransit(value); if (!t) return null;
  const short = s => String(s).split(/[·・]/).filter(Boolean).pop() || s;
  return `${t.from ? short(t.from) + ' → ' : '→ '}${short(t.to)}${en ? ' (en route)' : '（途中）'}`;
}

/** 当前地点 → { level, map, room?, marker?, place?, word } 或 null */
export function resolveHere(value, idx) {
  // 写了多处（「A / B」）：按顺序取第一处认得出的（v0.9.2，和标题栏只显示第一处一致）
  const parts = String(value || '').split(/\s*[\/／|｜]\s*/).filter(Boolean);
  if (parts.length > 1) { for (const p of parts) { const r = resolveHere(p, idx); if (r) return r; } return null; }
  // 途中（v0.9.5）：落到起点（起点认不出就落终点），带上 transit 给地图画「在路上」
  const tr = resolveTransit(value, idx);
  if (tr) return { ...(tr.from || tr.to), transit: tr };
  return resolveOne(value, idx);
}
// 第 1 级落点：自定义叫法 → 标准房间名（custom）；卡设定房间 → std / floor / restricted
function roomHit(E, v, w) {
  const cu = E.alias?.[w], std = E.planStd?.[cu || w] || null;
  const r = cu ? { level: 1, map: E.id, room: cu, word: w, custom: true } : { level: 1, map: E.id, room: v, word: w };
  if (std) { r.std = std; if (E.floor?.[std]) r.floor = E.floor[std]; if (E.restricted?.includes(std)) r.restricted = true; }
  return r;
}
/** 未上图：当前地点非空、认不出（含途中两端都认不出）、也没被「忽略」→ 返回要显示的名字（多处取第一处），否则 null */
export function unmappedName(value, idx) {
  const v = String(value || '').replace(/\{\{user\}\}/g, '').trim();
  if (!v || !idx || resolveHere(v, idx)) return null;
  const first = v.split(/\s*[\/／|｜]\s*/).filter(Boolean)[0] || v;
  if ((idx.ignore || []).some(w => w === v || w === first)) return null;
  return first;
}
function resolveOne(value, idx) {
  const v = String(value || '').replace(/\{\{user\}\}/g, '').trim();
  if (!v || !idx) return null;
  // 各级最长匹配
  let mark = null; for (const k of idx.marks) { const w = longest(v, k.words); if (w && len(w) > len(mark?.word)) mark = { ...k, word: w }; }
  let lay = null; for (const k of idx.layers) { const w = longest(v, k.words); if (w && len(w) > len(lay?.word)) lay = { ...k, word: w }; }
  // 层 / 分区全称优先（canon_audit_0928 B8）：「上层悬浮庄园区」里的「庄园」是层名的一部分，不算写了庄园——庄园词只在层名以外的部分找
  const ev = lay ? v.split(lay.word).join('\u0000') : v;
  const E = idx.estate, eWhole = E && longest(ev, E.whole), eRoom = E && longest(ev, E.rooms), eArea = E && longest(ev, E.areas);
  // 泛称（maps.json ambiguous：大学、分局、修道院……卡里同名的地方不止一处）不短于地标词时不落地标：有层名落层，否则不跳转
  const amb = idx.ambiguous?.length ? longest(v, idx.ambiguous) : null;
  if (amb && len(amb) >= len(mark?.word) && !(E && eWhole && len(eWhole) > len(amb))) { mark = null; if (!lay) return null; }
  // 庄园：写了庄园（且没有更长的别处地标，如「财团家族庄园」），或只写了房间 / 区域而没有写别的层、地标
  const inEstate = E && ((eWhole && len(eWhole) >= len(mark?.word)) || (!eWhole && (eRoom || eArea) && !mark && !lay));
  if (inEstate) {
    if (eRoom && len(eRoom) >= len(eArea) - 1) return roomHit(E, v, eRoom);   // 「后庭浴室」这类两者都有时偏向房间
    if (eArea) return E.alias?.[eArea] ? { level: 2, map: E.id, room: E.alias[eArea], word: eArea, custom: true } : { level: 2, map: E.id, room: v, word: eArea };
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
