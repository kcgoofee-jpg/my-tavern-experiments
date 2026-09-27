// MVU 读数与「地图.自定义」数据（v0.9.3）。纯函数：卡内脚本 eden-map.js、查看器 viewer.html、node 单测（tests/mvu.test.mjs）共用。
// 只读 MVU（stat_data），从不写卡自己的变量。我们自己的状态放在酒馆助手「聊天变量」的顶层键 eden_map 里（eden-map.js 负责读写），
// 不放进 stat_data：卡注册了 MVU zod 结构（z.object 默认丢掉未知键），stat_data 里多出来的键每次变量更新都会被删掉（docs/content-compat.md）。
// 任何字段缺了都返回空值，调用方照常工作（功能不显示而已）。只做技术兼容：不按内容过滤任何文字。

// ---------------- 通用 ----------------
/** MVU 旧格式的值可能是 [值, 说明]；新格式直接是值 */
export const val = v => (Array.isArray(v) && v.length === 2 && typeof v[1] === 'string' && (v[0] === null || typeof v[0] !== 'object') ? v[0] : v);
/** 按路径（a.b.c）取值，每一级都拆 [值, 说明] */
export function get(obj, path) {
  let v = val(obj);
  for (const k of path.split('.')) { if (v == null || typeof v !== 'object' || !(k in v)) return undefined; v = val(v[k]); }
  return v;
}
const str = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);

// ---------------- 1 在场人物的位置 ----------------
// 注意：这张卡的 zod 结构里在场人物的对象没有「位置」，模型写进去也会被 MVU 删掉；所以人物位置的主来源是聊天标签（characters.mjs），
// 这里只是「作者以后加了位置字段」时直接可用（docs/author-compat.md）。
export const PRESENT_KEYS = ['在场人物', '在场角色', '当前在场'];
export const POS_KEY = '位置';
// 表的每一项可能是：{ 名字: { 位置: '层·地点', … } }、{ 名字: '层·地点' }、{ 名字: '一句描述' }、['名字', …]、[{ 名字 / 姓名 / name, 位置 }]、'甲、乙'
const looksPlace = s => /[·・]/.test(s) && [...s].length <= 60;   // 字符串值只有写成「层·地点」才当位置（否则可能是描述）
/** stat_data → 在场人物 [{ name, place }]（place = '' 表示没写位置，调用方按玩家所在处推断）。没有在场表返回 null */
export function presentList(stat) {
  if (!stat || typeof stat !== 'object') return null;
  const key = PRESENT_KEYS.find(k => k in stat); if (!key) return null;
  const t = val(stat[key]), out = [], add = (n, p) => { n = clean(n); if (n && [...n].length <= 40 && !out.some(o => o.name === n)) out.push({ name: n, place: clean(p) }); };
  const posOf = o => { const p = str(val(o?.[POS_KEY])); return p; };
  if (typeof t === 'string') { for (const n of t.split(/[、,，;；\/]/)) add(n, ''); return out; }
  if (Array.isArray(t)) {
    for (const it of t) { const x = val(it);
      if (typeof x === 'string') add(x, '');
      else if (x && typeof x === 'object') add(str(val(x.名字)) || str(val(x.姓名)) || str(val(x.name)), posOf(x)); }
    return out;
  }
  if (!t || typeof t !== 'object') return out;
  for (const [n, raw] of Object.entries(t)) {
    const o = val(raw);
    if (typeof o === 'string') add(n, looksPlace(o) ? o : '');
    else if (o && typeof o === 'object' && !Array.isArray(o)) add(n, posOf(o));
    else add(n, '');
  }
  return out;
}

// ---------------- 4 世界时间 ----------------
/** stat_data → { date, time, period }（缺的是 ''） */
export function worldTime(stat) {
  return { date: str(get(stat, '世界.当前日期')), time: str(get(stat, '世界.当前时刻')), period: str(get(stat, '世界.当日时段')) };
}
const hourOf = t => { const m = String(t || '').match(/(\d{1,2})\s*[:：时]\s*(\d{0,2})/); return m ? +m[1] + (+m[2] || 0) / 60 : null; };
/** 夜间：时段写着「寝 / 夜 / 凌晨」，或时刻在 22:00–05:00 */
export function isNight(w) {
  if (!w) return false;
  if (/寝|夜|凌晨|night/i.test(w.period || '')) return true;
  if (/晨|日间|白天|午|day|morning/i.test(w.period || '')) return false;
  const h = hourOf(w.time); return h != null && (h >= 22 || h < 5);
}
/** 标题栏里的紧凑写法：「01.01 08:00」；全文（带年份与时段）放在 title */
export function clockLabel(w) {
  if (!w) return { short: '', full: '' };
  const d = String(w.date || '').match(/(\d{1,2})\s*[月.\-/]\s*(\d{1,2})/), md = d ? `${d[1].padStart(2, '0')}.${d[2].padStart(2, '0')}` : '';
  const short = [md, w.time].filter(Boolean).join(' '), full = [w.date, w.time, w.period].filter(Boolean).join(' ');
  return { short, full };
}
/** 事件的剧情内时间 → 可比较的数（「2088.01.12 21:40」「01-12 21:40」「21:40」）；认不出返回 null */
export function timeKey(s) {
  const t = String(s || ''); if (!t) return null;
  const y = t.match(/(\d{4})\s*[年.\-/]/), md = t.match(/(?:^|[^\d])(\d{1,2})\s*[月.\-/]\s*(\d{1,2})(?!\d)/), h = hourOf(t);
  if (!md && h == null) return null;
  return (y ? +y[1] : 0) * 1e6 + (md ? +md[1] * 1e4 + +md[2] * 100 : 0) + (h ?? 0);
}

// ---------------- 5 着装 ----------------
export const OUTFIT_KEYS = ['衣服', '裤子', '鞋子'];
const EMPTY = /^(待初始化|无|空|未知|none|-|—)?$/i;
/** stat_data → { 衣服, 裤子, 鞋子, … }（只收字符串，空和「待初始化」不算）；没有着装返回 null */
export function outfit(stat) {
  const o = get(stat, '主角.着装'); if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = {}; for (const [k, v] of Object.entries(o)) { const s = str(val(v)); if (s && !EMPTY.test(s)) r[k] = s; }
  return Object.keys(r).length ? r : null;
}
/** 卡片里的一行：「着装：a / b / c」，截断 */
export function outfitText(o, max = 48) {
  if (!o) return '';
  const keys = [...OUTFIT_KEYS.filter(k => k in o), ...Object.keys(o).filter(k => !OUTFIT_KEYS.includes(k))];
  return clip(keys.map(k => o[k]).join(' / '), max);
}

// ---------------- 2 自定义名称与用途（聊天变量 eden_map.自定义，在 stat_data 之外） ----------------
// 形状：{ items: { 标准名: { 类: 'room' | 'area' | 'landmark' | 'character', 名?: 显示名, 用途?: 备注, 别名?: [旧叫法], 源?: '手动' | '标签' } }, 同步世界书: bool, 同步手动?: true }
// v0.9.5：「同步到世界书」默认开。没动过开关（没有 同步手动）一律当开；自己关过的（同步手动 + 同步世界书 false）保持关。
export const VAR_ROOT = 'eden_map';   // 聊天变量顶层键：{ 自定义: {...}, 标签楼: 已处理到的楼层 }
export const KINDS = ['room', 'area', 'landmark', 'character'];
export const MAX_NAME = 40, MAX_NOTE = 200;
export function normCustom(raw) {
  const out = { items: {}, 同步世界书: true };
  if (!raw || typeof raw !== 'object') return out;
  if (raw.同步手动 === true) { out.同步手动 = true; out.同步世界书 = raw.同步世界书 === true; }
  for (const [k0, it] of Object.entries(raw.items || {})) {
    const k = clean(k0); if (!k || !it || typeof it !== 'object') continue;
    const e = { 类: KINDS.includes(it.类) ? it.类 : 'landmark' };
    const n = clean(it.名), u = String(it.用途 ?? '').trim();
    if (n && n !== k) e.名 = [...n].slice(0, MAX_NAME).join('');
    if (u) e.用途 = [...u].slice(0, MAX_NOTE).join('');
    const al = Array.isArray(it.别名) ? [...new Set(it.别名.map(clean).filter(a => a && a !== k && a !== e.名))] : [];
    if (al.length) e.别名 = al;
    if (it.源 === '标签' || it.源 === '手动') e.源 = it.源;
    if (e.名 || e.用途 || e.别名) out.items[k] = e;
  }
  return out;
}
/** 设置 / 修改一项（返回新对象；无效返回 null）。patch = { name?, note?, kind? }；name / note 传 '' = 清掉该项 */
export function setCustom(c, key, patch = {}) {
  key = clean(key); if (!key || [...key].length > MAX_NAME) return null;
  const n = normCustom(c), cur = { ...(n.items[key] || { 类: 'landmark' }) };
  if (patch.kind && KINDS.includes(patch.kind)) cur.类 = patch.kind;
  if (patch.source === 'tag' || patch.source === 'manual') cur.源 = patch.source === 'tag' ? '标签' : '手动';
  if ('name' in patch) { const v = clean(patch.name); if ([...v].length > MAX_NAME) return null; if (v && v !== key) cur.名 = v; else delete cur.名; }
  if ('note' in patch) { const v = String(patch.note ?? '').trim(); if ([...v].length > MAX_NOTE) return null; if (v) cur.用途 = v; else delete cur.用途; }
  n.items[key] = cur; return normCustom(n);
}
export function removeCustom(c, key) { const n = normCustom(c); key = clean(key); if (!(key in n.items)) return null; delete n.items[key]; return n; }
/** 显示名（没有自定义就是标准名） */
export const displayName = (c, key) => c?.items?.[key]?.名 || key;
/** 自定义叫法 → 标准名（含旧叫法）；kinds 只取这些类 */
export function aliasMap(c, kinds = KINDS) {
  const m = {}; for (const [k, e] of Object.entries(c?.items || {})) if (kinds.includes(e.类)) for (const a of [e.名, ...(e.别名 || [])]) if (a) m[a] = k;
  return m;
}
/** 查自定义项：标准名或显示名都认 */
export function findKey(c, word) { word = clean(word); if (!word) return null; if (c?.items?.[word]) return word; return aliasMap(c)[word] || null; }
/** 旧版本机叫法（here.mjs：{ rooms: { 自定义名: 标准房间名 } }）并进来；已有显示名的只记成旧叫法 */
export function migrateRooms(c, rooms) {
  const n = normCustom(c); let changed = 0;
  for (const [a, r] of Object.entries(rooms || {})) {
    const name = clean(a), key = clean(r); if (!name || !key || name === key) continue;
    const e = n.items[key] ||= { 类: 'room' };
    if (!e.名) { e.名 = name; changed++; } else if (e.名 !== name && !(e.别名 || []).includes(name)) { (e.别名 ||= []).push(name); changed++; }
  }
  return { custom: normCustom(n), changed };
}
/** 注入给模型的一句（紧凑、有上限）；没有返回 '' */
export function summarizeCustom(c, maxLen = 220) {
  const parts = Object.entries(c?.items || {}).map(([k, e]) => (e.名 ? `${k}→${e.名}` : k) + (e.用途 ? `（${e.用途}）` : '')).filter(Boolean);
  if (!parts.length) return '';
  return `[地图自定义·玩家起的名字与用途] ${clip(parts.join('；'), maxLen)}。`;
}
/** 同步到世界书「伊甸地图·自定义」的条目正文 */
export function wbContent(c) {
  const rows = Object.entries(c?.items || {}).map(([k, e]) => `- ${k}${e.名 ? `：玩家称为「${e.名}」` : ''}${e.用途 ? `；用途：${e.用途}` : ''}`);
  return rows.length ? `<地图自定义>\n以下地点 / 人物有玩家起的名字或用途，正文里可以用这些叫法：\n${rows.join('\n')}\n</地图自定义>` : '';
}
/** 0.9.3 → 0.9.5 迁移：旧数据总是写着 同步世界书 false。这一本聊天世界书已经建过（只有打开过同步才会建）→ 说明是自己关掉的，记成 同步手动 保持关 */
export function syncMigrate(raw, wbExists) {
  if (!raw || typeof raw !== 'object' || raw.同步手动 || raw.同步世界书 !== false || !wbExists) return raw;
  return { ...raw, 同步手动: true };
}
export const WB_NAME = '伊甸地图·自定义', WB_ENTRY = '地图自定义';
/** 按聊天分开的世界书名（多个聊天共用一本会互相串）：「伊甸地图·自定义·<聊天 id 的短哈希>」 */
export function wbName(chat) { let h = 2166136261; for (const c of String(chat || '')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return `${WB_NAME}·${(h >>> 0).toString(16).padStart(8, '0').slice(0, 6)}`; }

// ---------------- 剧情标签：⌖改名 / ⌖用途 ----------------
//   ⌖改名 书房 → 星图室        （→ / -> / ＞ / > 都认）
//   ⌖用途 书房：夜里看星图      （： / : 都认）
export const CUSTOM_EXAMPLES = new Set(['⌖改名 原名 → 新名', '⌖用途 地点：用途', '⌖改名 书房 → 星图室', '⌖用途 书房：整理旧地图']);
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[k]);
/** 一楼原文 → [{ op: 'name' | 'note', key, value }]（最多 6 条；代码块与示范原文跳过） */
export function parseCustomTags(raw) {
  if (!raw || (raw.indexOf('⌖改名') < 0 && raw.indexOf('⌖用途') < 0)) return [];
  const text = decode(String(raw)).replace(/```[\s\S]*?```/g, '').replace(/<code>[\s\S]*?<\/code>/gi, ''), out = [];
  for (const m of text.matchAll(/⌖(改名|用途)[\s:：]*([^<\n⌖]{1,260})/g)) {
    const body = m[2].trim();
    if (CUSTOM_EXAMPLES.has(`⌖${m[1]} ${body}`)) continue;
    if (m[1] === '改名') { const p = body.split(/\s*(?:→|->|＞|>|=>)\s*/); if (p.length === 2 && clean(p[0]) && clean(p[1])) out.push({ op: 'name', key: clean(p[0]), value: clean(p[1]).slice(0, MAX_NAME) }); }
    else { const i = body.search(/[：:]/); if (i > 0) { const k = clean(body.slice(0, i)), v = body.slice(i + 1).trim(); if (k && v) out.push({ op: 'note', key: k, value: [...v].slice(0, MAX_NOTE).join('') }); } }
  }
  return out.slice(0, 6);
}
/** 把新楼层的标签用到自定义数据上：msgs = [{floor, text}]，after = 已处理到的楼层。返回 { custom, applied: [{op,key,value,floor}], last } */
export function applyTags(c, msgs, after, kindOf = () => 'landmark') {
  let cur = normCustom(c), last = after; const applied = [];
  for (const { floor, text } of msgs) {
    if (!(floor > after)) continue; last = Math.max(last, floor);
    for (const t of parseCustomTags(text)) {
      const key = findKey(cur, t.key) || t.key, kind = cur.items[key]?.类 || kindOf(key);
      const nx = setCustom(cur, key, t.op === 'name' ? { name: t.value, kind, source: 'tag' } : { note: t.value, kind, source: 'tag' });
      if (nx) { cur = nx; applied.push({ ...t, key, floor }); }
    }
  }
  return { custom: cur, applied, last };
}
/** 一次性提示的文字 */
export const tagToast = a => (a.op === 'name' ? `${a.key} 改名为「${a.value}」` : `${a.key} 的用途已更新`);
