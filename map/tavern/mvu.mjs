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
export function presentList(stat, path = '') {
  if (!stat || typeof stat !== 'object') return null;
  const key = path || PRESENT_KEYS.find(k => k in stat); if (!key) return null;
  const t0 = path ? get(stat, path) : stat[key]; if (t0 === undefined) return null;
  const t = val(t0), out = [], add = (n, p) => { n = clean(n); if (n && [...n].length <= 40 && !out.some(o => o.name === n)) out.push({ name: n, place: clean(p) }); };
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
export function worldTime(stat, m = {}) {
  return { date: str(get(stat, m.date || '世界.当前日期')), time: str(get(stat, m.time || '世界.当前时刻')), period: str(get(stat, m.period || '世界.当日时段')) };
}
const hourOf = t => { const m = String(t || '').match(/(\d{1,2})\s*[:：时]\s*(\d{0,2})/); return m ? +m[1] + (+m[2] || 0) / 60 : null; };
/** 夜间：时段写着「寝 / 夜 / 凌晨」，或时刻在 22:00–05:00 */
export function isNight(w) {
  if (!w) return false;
  if (/寝|夜|凌晨|night/i.test(w.period || '')) return true;
  if (/晨|日间|白天|午|day|morning/i.test(w.period || '')) return false;
  const h = hourOf(w.time); return h != null && (h >= 22 || h < 5);
}
/** v0.9.6（B11 / C1）时段色调：'dawn' | 'day' | 'dusk' | 'night' | ''（读不到）。时段文字优先（卡的五时段：晨起 / 晨间报到 → dawn、日间 → day、
 *  侍寝时段 → dusk、就寝 → night；通用：清晨 / 早 / 午 / 傍晚 / 黄昏 / 夜 / 凌晨），否则按时刻：05–07 dawn、07–17 day、17–20 dusk、其余 night */
export function todPhase(w) {
  if (!w) return '';
  const p = String(w.period || '');
  if (/就寝|深夜|夜|凌晨|night|midnight/i.test(p) && !/侍寝/.test(p)) return 'night';
  if (/侍寝|傍晚|黄昏|暮|dusk|evening/i.test(p)) return 'dusk';
  if (/晨|黎明|清晨|早|dawn|morning/i.test(p)) return 'dawn';
  if (/日间|白天|午|day|noon|afternoon/i.test(p)) return 'day';
  const h = hourOf(w.time); if (h == null) return '';
  return h >= 5 && h < 7 ? 'dawn' : h >= 7 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night';
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
export function outfit(stat, path = '') {
  const o = get(stat, path || '主角.着装'); if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
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
// v0.9.6：layer（层 / 大区）、world（世界地名）——「未上图」地点指派用；忽略 = 未上图时选了「忽略」的名字（不再提示）
export const KINDS = ['room', 'area', 'landmark', 'character', 'layer', 'world'];
export const MAX_IGNORE = 50;
export const MAX_NAME = 40, MAX_NOTE = 200;
export function normCustom(raw) {
  const out = { items: {}, 同步世界书: true };
  if (!raw || typeof raw !== 'object') return out;
  if (raw.同步手动 === true) { out.同步手动 = true; out.同步世界书 = raw.同步世界书 === true; }
  if (Array.isArray(raw.忽略)) { const ig = [...new Set(raw.忽略.map(clean).filter(a => a && [...a].length <= MAX_NAME))].slice(-MAX_IGNORE); if (ig.length) out.忽略 = ig; }
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
/** 设置 / 修改一项（返回新对象；无效返回 null）。patch = { name?, note?, kind?, alias?, unalias?, ignore? }；name / note 传 '' = 清掉该项
 *  v0.9.6：alias = 给标准名 key 加一个叫法（进 别名，不改显示名；「未上图」指派用）；unalias = 去掉一个叫法；
 *  ignore: true / false = 把 key 这个名字记进 / 移出「忽略」（不动 items） */
export function setCustom(c, key, patch = {}) {
  key = clean(key); if (!key || [...key].length > MAX_NAME) return null;
  const n = normCustom(c);
  if ('ignore' in patch) { const ig = (n.忽略 || []).filter(a => a !== key); if (patch.ignore) ig.push(key); n.忽略 = ig; return normCustom(n); }
  const cur = { ...(n.items[key] || { 类: 'landmark' }) };
  if ('alias' in patch) { const a = clean(patch.alias); if (!a || a === key || [...a].length > MAX_NAME) return null;
    for (const [k, e] of Object.entries(n.items)) if (k !== key && e.别名?.includes(a)) e.别名 = e.别名.filter(x => x !== a);   // 一个叫法只指向一处
    if (cur.名 !== a) cur.别名 = [...new Set([...(cur.别名 || []), a])].slice(-10);
    if (n.忽略) n.忽略 = n.忽略.filter(x => x !== a); }
  if ('unalias' in patch) { const a = clean(patch.unalias); cur.别名 = (cur.别名 || []).filter(x => x !== a); }
  if (patch.kind && KINDS.includes(patch.kind)) cur.类 = patch.kind;
  if (patch.source === 'tag' || patch.source === 'manual') cur.源 = patch.source === 'tag' ? '标签' : '手动';
  if ('name' in patch) { const v = clean(patch.name); if ([...v].length > MAX_NAME) return null;
    if (cur.名 && v && v !== key && cur.名 !== v) cur.别名 = [...new Set([...(cur.别名 || []), cur.名])].slice(-10);   // 改名：旧显示名留作旧叫法，之前楼层里的叫法仍认得
    if (v && v !== key) cur.名 = v; else delete cur.名; }
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

// ---------------- v0.9.5 人物栏的名册（只读）：按表的位置 / 通用字段名发现，不认具体卡的字段内容 ----------------
// stat_data 顶层：第 1 个键 = 世界、第 2 个键 = 主角（按位置）；在场表按 PRESENT_KEYS / 「在场 / present」认；
// 其余「以名字为键、值是对象」的表按出现顺序：第 1 张 = 成员（members），第 2 张 = 目标（targets）。map 参数可以指定（变量映射，见 docs/content-compat.md「换卡兼容」）。
const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);
const IDENT = /身份|identity|role|职业|头衔|title/i, STAGE = /进度|阶段|stage|progress/i, REP = /声望|reputation|名望/i;
const isRoster = t => { t = val(t); return plain(t) && Object.values(t).every(v => plain(val(v))); };
// v0.9.6（E2 / E13）：核心数值（0–100）按卡的 5 档阈值（≤20 / ≤40 / ≤60 / ≤80 / ≤100，docs/card-digest.md）换算档位名。
// 档名只对默认字段（这张卡）用卡自己的叫法，第 5 档由运行时读到的字段名派生；别的卡的字段一律「档 n」。
export const CORE_CUTS = [20, 40, 60, 80, 100], CORE_DEFAULT = '母畜值';
const CORE_NAMES = ['抗拒', '动摇', '接受', '沉溺'];
export function coreStage(field, n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  const i = CORE_CUTS.findIndex(c => n <= c), k = i < 0 ? 4 : i;
  if (field !== CORE_DEFAULT) return `档 ${k + 1}`;
  return k < 4 ? CORE_NAMES[k] : /值$/.test(field) ? '完全' + field.slice(0, -1) + '化' : `档 ${k + 1}`;
}
const num = v => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v : NaN);
function rows(tbl, stageKey, fk = {}) {
  const t = val(tbl); if (!plain(t)) return [];
  return Object.entries(t).filter(([n]) => clean(n) && [...n].length <= 40).map(([n, raw]) => {
    const o = val(raw) || {}, ik = Object.keys(o).find(k => IDENT.test(k)), sk = stageKey || Object.keys(o).find(k => STAGE.test(k));
    const it = { name: clean(n), identity: str(val(o[ik])) };
    if (sk) { const s = str(val(o[sk])); if (s) it.stage = s; }
    const gk = fk.gradeField, ck = fk.coreField;
    if (gk && gk !== '-' && gk in o) { const g = str(val(o[gk])); if (g) it.grade = g; }
    if (ck && ck !== '-' && ck in o) { const n = num(val(o[ck])); if (Number.isFinite(n)) { it.core = n; it.coreKey = ck; it.coreStage = coreStage(ck, n); } }
    const more = {};   // v0.9.6 E13 其余字段（人物卡「更多资料」）：只读，原样取值；布尔的外界知情保留 true / false
    for (const [f, k] of Object.entries(MORE_KEYS)) { const fk_ = fk[f]; if (!fk_ || fk_ === '-' || !(fk_ in o)) continue; const v = val(o[fk_]);
      if (typeof v === 'boolean') more[k] = v; else if (typeof v === 'number' && Number.isFinite(v)) more[k] = v; else { const s = str(v); if (s) more[k] = s.slice(0, 80); } }
    if (Object.keys(more).length) it.more = more;
    { const tk = fk.tierField; const t = combatTier(o, tk && tk !== '-' ? tk : '', tk === '-'); if (t) it.tier = t; }
    return it;
  });
}
// v0.9.6 E1 战力小签：只从卡里写明的内容推（战力字段，或任一文字字段里明写的「天灾级 / 超凡 N 阶 / 普通人」），不编造；读不到返回 ''。
// 阶梯：普通人 < 超凡一阶至五阶 < 天灾级（docs/card-digest.md）。off = 映射里关掉了（连文字也不扫）
const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
export function tierText(s) {
  s = String(s ?? ''); let m;
  if (/天灾级/.test(s)) return '天灾';   // 只认「天灾级」；「代号『天灾』」之类不算
  if ((m = s.match(/超凡\s*([一二三四五1-5])\s*阶/))) return `超凡 ${CN[m[1]] || m[1]} 阶`;
  if (/^\s*普通人\s*$|战力[:：]?\s*普通人/.test(s)) return '普通人';
  return '';
}
export function combatTier(o, key = '', off = false) {
  if (off || !plain(o)) return '';
  if (key && key in o) { const v = val(o[key]); const t = tierText(v); return t || (typeof v === 'string' && v.trim() && v.trim().length <= 12 ? v.trim() : ''); }
  for (const [k, v] of Object.entries(o)) { if (k.startsWith('$')) continue; const x = val(v); if (typeof x === 'string') { const t = tierText(x); if (t && t !== '普通人') return t; } }
  return '';
}
const MORE_KEYS = { codeField: 'code', socialField: 'social', heightField: 'height', weightField: 'weight', knownField: 'known', accessoryField: 'accessory' };
/** stat_data → { present, members, targets }：每项 { key: 表名, items: [{ name, identity, stage?, grade?, core?, coreKey?, coreStage? }] } 或 null；map = { present, members, targets } 表名覆盖，gradeField / coreField 行内字段名（'-' = 关闭） */
export function rosters(stat, map = {}) {
  const out = { present: null, members: null, targets: null }; if (!plain(stat)) return out;
  const keys = Object.keys(stat), pres = map.present || PRESENT_KEYS.find(k => k in stat) || keys.find(k => /在场|present/i.test(k));
  const others = keys.slice(2).filter(k => k !== pres && isRoster(stat[k]));
  const pick = { present: pres, members: map.members || others[0], targets: map.targets || others.filter(k => k !== map.members)[map.members ? 0 : 1] };
  for (const [g, k] of Object.entries(pick)) if (k && k in stat && isRoster(stat[k])) out[g] = { key: k, items: rows(stat[k], g === 'targets' ? map.stageField : null, map) };
  return out;
}
/** 主角（第 2 个顶层键）的声望（0–100 的数字）；没有返回 null。path 可指定（变量映射） */
export function reputation(stat, path = '') {
  if (!plain(stat)) return null;
  let v;
  if (path) v = val(get(stat, path));
  else { const p = val(stat[Object.keys(stat)[1]]); if (!plain(p)) return null; const k = Object.keys(p).find(k => REP.test(k)); v = k ? val(p[k]) : undefined; }
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}
/** 阶段的先后顺序：在卡自带的脚本 / 正则文本里找一个含有 values 全部取值的字符串数组（z.enum([...]) 或 ['…', …]），3–10 项；找不到返回 null */
export function findStageOrder(texts, values) {
  const want = [...new Set((values || []).filter(Boolean))]; if (!want.length) return null;
  for (const t of texts || []) {
    for (const m of String(t).matchAll(/\[\s*((?:(["'`])[^"'`\n]{1,24}\2\s*,\s*){2,9}(["'`])[^"'`\n]{1,24}\3)\s*,?\s*\]/g)) {
      const arr = [...m[1].matchAll(/(["'`])([^"'`\n]{1,24})\1/g)].map(x => x[2]);
      if (want.every(v => arr.includes(v))) return arr;
    }
  }
  return null;
}

/** 卡自带脚本里的默认立绘表（`defaultPortraits = { "名字": "地址", … }`）：只收原作者 CDN 上 /sfw/ 路径的 https 地址；找不到返回 {} */
export const PORTRAIT_OK = u => /^https:\/\/cdn\.jsdelivr\.net\/gh\/Yehehua1311\/[^?#]*\/sfw\/[^?#]+\.(png|jpe?g|webp)$/i.test(u);
export function findPortraits(texts) {
  const out = {};
  for (const t of texts || []) {
    const i = String(t).search(/defaultPortraits\s*=\s*\{/); if (i < 0) continue;
    const blk = String(t).slice(i, String(t).indexOf('}', i) + 1);
    for (const m of blk.matchAll(/["']([^"'\n]{1,40})["']\s*:\s*["']([^"'\s]+)["']/g)) if (PORTRAIT_OK(m[2])) out[clean(m[1])] = m[2];
  }
  return out;
}
