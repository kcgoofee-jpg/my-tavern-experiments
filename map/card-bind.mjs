// 卡原名绑定（v0.9.7）：公开仓库只存稳定编号 + 卡内结构定位，运行时从用户自己加载的卡 / 世界书文本里按结构取回卡的原名。
// 取到的名字只在本机内存里用（识别、显示），不存盘、不上传、不进仓库。取不到（换了卡、条目改过结构）就保持中性占位，功能照常。
//
// 1）庄园房间：map/data/eden_estate_rooms.json 的 card_rooms 给卡里每一间房一个稳定编号（楼层 + 卡内顺序，如 B1-C01）。
//    名字能公开的房间，仓库里就是卡的原名；其余只存占位「（按原卡）」+ bind：{ floor, n, area }
//    = 「卡的庄园布局条目里，该楼层段内第 n 个带面积的房间，面积约 area」。→ bindCardRooms / applyBinding
// 2）其余原名（地标别名、分区别名、剖面标签）：map/data/card_bind.json 的 binds，每条 = 稳定 id + 键路径 + 取法。→ bindSpecs / applyToRegistry
// 3）名册行的字段名与核心数值的档名：从卡的变量结构 / 更新规则里按结构发现（findCoreCategories），仓库不写死。

export const PLACEHOLDER = '（按原卡）';
const NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };

/** 楼层段标题 → 楼层 id：「地上一层…」→ F1，「地下二层…」→ B2（也认「地上1层」「一楼」「B1」「F2」这类写法） */
export function floorOf(head) {
  const s = String(head || '');
  let m = s.match(/(地上|地下)\s*([一二三四五1-5])\s*层/);
  if (m) return (m[1] === '地上' ? 'F' : 'B') + (NUM[m[2]] || +m[2]);
  m = s.match(/^\s*([一二三四五])楼/); if (m) return 'F' + NUM[m[1]];
  m = s.match(/^\s*([FB])([1-5])\b/i); if (m) return m[1].toUpperCase() + m[2];
  return null;
}

/**
 * 解析一段「庄园布局」式的缩进文本（YAML 风格：楼层段 → 房间标题 → 面积 / 功能 / 设施…）。
 * 返回 { F1: [{ name, area, order }], B1: [...] }：每层只收带「面积」的房间标题，order 从 1 起按卡内先后。
 * 找不到任何楼层段时返回 null。只看结构，不看内容。
 */
export function parseLayout(text) {
  const lines = String(text || '').split(/\r?\n/), out = {};
  const ind = l => l.match(/^\s*/)[0].replace(/\t/g, '  ').length;
  const head = l => { const m = l.match(/^\s*([^\s:：\-#][^:：]{0,40}?)\s*[:：]\s*$/); return m ? m[1].trim() : null; };
  let fl = null, flInd = -1, roomInd = -1, cur = null, found = false;
  for (const l of lines) {
    if (!l.trim()) continue;
    const i = ind(l), h = head(l);
    if (fl && i <= flInd) { fl = null; cur = null; }
    const f = h && floorOf(h);
    if (f && (!fl || i <= flInd)) { fl = f; flInd = i; roomInd = -1; cur = null; out[f] ??= []; found = true; continue; }
    if (!fl) continue;
    if (h && (roomInd < 0 || i === roomInd) && i > flInd) { roomInd = i; cur = { name: h, area: null }; continue; }
    if (cur && i > roomInd && cur.area == null) {
      const m = l.match(/面积\s*[:：]\s*各?约?\s*(\d+(?:\.\d+)?)/);
      if (m) { cur.area = +m[1]; out[fl].push({ name: cur.name, area: cur.area, order: out[fl].length + 1 }); }
    }
  }
  return found ? out : null;
}

/** 名字里去掉层段前缀那类下划线后缀（「母畜寝区_总述」这类段标题不是房间）；房间名本身原样返回 */
const clean = s => String(s || '').trim();

/**
 * 按结构把 card_rooms 里带 bind 的房间绑到卡的原名。
 * cardRooms：eden_estate_rooms.json 的 card_rooms；texts：卡 / 世界书的文本数组（字符串）。
 * 返回 { names: { cid: 原名 }, want, bound, misses: [cid] }。
 * 规则：先按「同层第 n 个 + 面积相符（±15%）」；不成再在同层找唯一一个面积相符的；都不成就不绑（宁缺毋错）。
 */
export function bindCardRooms(cardRooms, texts) {
  const want = (cardRooms || []).filter(r => r?.bind?.floor);
  const res = { names: {}, want: want.length, bound: 0, misses: [] };
  if (!want.length) return res;
  let best = null, score = 0;
  for (const t of texts || []) {
    if (typeof t !== 'string' || t.length < 40 || !/面积/.test(t)) continue;
    const p = parseLayout(t); if (!p) continue;
    const s = Object.values(p).reduce((a, x) => a + x.length, 0) + Object.keys(p).length * 10;
    if (s > score) { best = p; score = s; }
  }
  const ok = (a, b) => b == null || (a != null && Math.abs(a - b) <= Math.max(1, b * 0.15));
  for (const r of want) {
    const { floor, n, area } = r.bind, list = best?.[floor] || [];
    let hit = list.find(x => x.order === n && ok(x.area, area));
    if (!hit && area != null) { const c = list.filter(x => ok(x.area, area)); if (c.length === 1) hit = c[0]; }
    const name = hit && clean(hit.name);
    if (name && name !== PLACEHOLDER) { res.names[r.cid] = name; res.bound++; } else res.misses.push(r.cid);
  }
  return res;
}

/**
 * 把绑定结果套到房间数据上（返回新对象，不改原数据）：
 * - 多边形房间（rooms）按 card_id 找到绑定名：name 换成原名；原来仓库里的名字（不是占位时）进 words，仍然认得。
 * - card_rooms 同样换名。
 * names 为空时原样返回。
 */
export function applyBinding(plan, names) {
  if (!plan || !names || !Object.keys(names).length) return plan;
  const sw = r => {
    const nm = names[r.card_id || r.cid]; if (!nm) return r;
    const words = [...(r.words || [])]; if (r.name && r.name !== PLACEHOLDER && r.name !== nm && !words.includes(r.name)) words.push(r.name);
    return { ...r, name: nm, words, bound: true };
  };
  return { ...plan, rooms: (plan.rooms || []).map(sw), card_rooms: (plan.card_rooms || []).map(sw) };
}

/** 旧编号 / 旧占位名 → 现在的房间名（用于聊天里存过的自定义叫法、飞行目标）。找不到返回 null。 */
export function resolveOld(plan, key) {
  if (!plan || !key) return null;
  const cid = plan.card_id_alias?.[key] || plan.retired_names?.[key] || (plan.card_rooms || []).find(r => r.cid === key)?.cid;
  if (!cid) return null;
  const r = (plan.card_rooms || []).find(r => r.cid === cid);
  return r && r.name && r.name !== PLACEHOLDER ? r.name : null;
}

/** 从一份角色卡数据（getCharData 的返回值）和世界书条目里收集文本（只收字符串内容，不改任何东西） */
export function layoutTexts(charData, extraEntries = []) {
  const out = [], push = s => { if (typeof s === 'string' && s.length > 40) out.push(s); };
  const book = charData?.data?.character_book || charData?.character_book;
  for (const e of book?.entries || []) push(e?.content);
  for (const e of extraEntries || []) push(typeof e === 'string' ? e : e?.content);
  return out;
}

// ---------------- 通用：缩进文本（YAML 风格）按键路径取值 ----------------
const indent = l => l.match(/^\s*/)[0].replace(/\t/g, '  ').length;
/**
 * 在缩进文本里按键路径找一段：path = ['中层_钢铁霓虹区', '特征']；键名以 '*' 结尾表示前缀匹配（如 '地下一层_*'）。
 * 返回 { key, value（冒号后同一行的值）, lines（子行）} 或 null。只看结构。
 */
export function findPath(text, path) {
  const lines = String(text || '').split(/\r?\n/);
  const go = (lo, hi, ks) => {   // 同名键可能出现多处：逐处往下试，第一处走得通的为准
    const k = ks[0];
    for (let i = lo; i < hi; i++) {
      const l = lines[i]; if (!l.trim()) continue;
      const m = l.match(/^\s*([^\s:：\-][^:：]{0,40}?)\s*[:：]\s*(.*)$/); if (!m) continue;
      const key = m[1].trim();
      if (!(k.endsWith('*') ? key.startsWith(k.slice(0, -1)) && key.length > k.length - 1 : key === k)) continue;
      const ind = indent(l); let j = i + 1; while (j < hi && (!lines[j].trim() || indent(lines[j]) > ind)) j++;
      if (ks.length === 1) return { key, value: m[2].trim(), lines: lines.slice(i + 1, j) };
      const r = go(i + 1, j, ks.slice(1)); if (r) return r;
    }
    return null;
  };
  return path?.length ? go(0, lines.length, path) : null;
}
const okName = s => typeof s === 'string' && s.length >= 2 && [...s].length <= 24 && !/[\n{}<>]/.test(s);
/**
 * 按一条 bind 规格取名字：{ path, take: 'value' | 'bullet' | 'suffix', n?（第几条列表项，从 1 起）, cut?（正则：只留它前面）,
 *   split?（正则：再切开）, pick?（切开后取第几段，数组，从 1 起；'all' = 全部）, whole?（也保留切开前的整段）}。
 * 返回名字数组（可能为空）。
 */
export function takeSpec(text, b) {
  const f = findPath(text, b.path); if (!f) return [];
  let s = '';
  if (b.take === 'suffix') { const i = f.key.indexOf('_'); s = i >= 0 ? f.key.slice(i + 1) : ''; }
  else if (b.take === 'bullet') { const items = f.lines.filter(l => /^\s*-\s+/.test(l)).map(l => l.replace(/^\s*-\s+/, '').trim()); s = items[(b.n || 1) - 1] || ''; }
  else s = f.value;
  if (b.cut) s = s.split(new RegExp(b.cut))[0];
  s = s.trim(); if (!s) return [];
  const out = [];
  if (b.split) {
    const parts = s.split(new RegExp(b.split)).map(x => x.trim()).filter(Boolean);
    const pick = b.pick === 'all' || !b.pick ? parts : b.pick.map(i => parts[i - 1]).filter(Boolean);
    if (b.whole) out.push(s);
    out.push(...pick);
  } else out.push(s);
  return [...new Set(out.filter(okName))];
}
/** 全部 bind 规格 → { names: { id: [名字…] }, want, bound, misses: [id] }；每条在所有文本里取第一处取得到的 */
export function bindSpecs(spec, texts) {
  const binds = spec?.binds || [], res = { names: {}, want: binds.length, bound: 0, misses: [] };
  for (const b of binds) {
    let got = [];
    for (const t of texts || []) { if (typeof t !== 'string' || !t.includes(String(b.path?.[0] || '').replace(/\*$/, ''))) continue; got = takeSpec(t, b); if (got.length) break; }
    if (got.length) { res.names[b.id] = got; res.bound++; } else res.misses.push(b.id);
  }
  return res;
}
/**
 * 把取到的名字套到 maps.json 上（返回新对象，不改原数据）：target { map, marker } → 该地标的 alias；{ map, districts: true } → 该层 districts。
 * use = 'label' 的（如剖面标签）不在这里，调用方按 id 自取。
 */
export function applyToRegistry(reg, spec, names) {
  if (!reg?.maps || !names || !Object.keys(names).length) return reg;
  const maps = { ...reg.maps };
  for (const b of spec?.binds || []) {
    const ns = names[b.id], t = b.target; if (!ns?.length || !t?.map || !maps[t.map]) continue;
    const m = maps[t.map] = { ...maps[t.map] };
    if (t.marker && m.markers?.[t.marker]) { m.markers = { ...m.markers }; const k = m.markers[t.marker] = { ...m.markers[t.marker] }; k.alias = [...new Set([...(k.alias || []), ...ns])]; }
    else if (t.districts) m.districts = [...new Set([...(m.districts || []), ...ns])];
  }
  return { ...reg, maps };
}
/** 数值字段的档名：卡的变量更新规则里「<字段>: … category: { 'a-b': 名 }」→ [{ max, name }]（按上限升序）；找不到返回 null */
export function findCoreCategories(texts, field) {
  if (!field) return null;
  for (const t of texts || []) {
    if (typeof t !== 'string' || !t.includes(field) || !/category/.test(t)) continue;
    const f = findPath(t, [field, 'category']); if (!f) continue;
    const cats = f.lines.map(l => l.match(/^\s*(\d+)\s*[-~～]\s*(\d+)\s*[:：]\s*(.+?)\s*$/)).filter(Boolean).map(m => ({ max: +m[2], name: m[3] })).filter(c => okName(c.name));
    if (cats.length >= 2) return cats.sort((a, b) => a.max - b.max);
  }
  return null;
}
