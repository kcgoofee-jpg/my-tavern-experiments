// MVU 读数与「地图.自定义」数据（v0.9.3）。纯函数：卡内脚本 eden-map.js、查看器 viewer.html、node 单测（tests/mvu-readers.test.mjs）共用。
// 只读 MVU（stat_data），从不写卡自己的变量。我们自己的状态放在酒馆助手「聊天变量」的顶层键 eden_map 里（eden-map.js 负责读写），
// 不放进 stat_data：卡注册了 MVU zod 结构（z.object 默认丢掉未知键），stat_data 里多出来的键每次变量更新都会被删掉（docs/content-compat.md）。
// 任何字段缺了都返回空值，调用方照常工作（功能不显示而已）。只做技术兼容：不按内容过滤任何文字。

import { getProfile } from './pack-profile.mjs';
import { bandOf } from '../core/periods.mjs';
import { slotDef, SLOTS, portraitOk as avatarOk } from '../core/profile.mjs';
import { fieldValue } from '../core/pack-v2-rows.mjs';
import * as VOC from '../core/vocab.mjs';

// ---------------- 通用 ----------------
/** MVU 旧格式的值可能是 [值, 说明]；新格式直接是值 */
export const val = v => (Array.isArray(v) && v.length === 2 && typeof v[1] === 'string' && (v[0] === null || typeof v[0] !== 'object') ? v[0] : v);
/** 按路径（a.b.c）取值，每一级都拆 [值, 说明] */
export function getByPath(obj, path) {
  let v = val(obj);
  for (const k of path.split('.')) { if (v == null || typeof v !== 'object' || !(k in v)) return undefined; v = val(v[k]); }
  return v;
}
const str = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);

// ---------------- 1 在场人物的位置 ----------------
// 注意：有的卡的 zod 结构里在场人物的对象没有「位置」，模型写进去也会被 MVU 删掉；所以人物位置的主来源是聊天标签（characters-parse.mjs），
// 这里只是「作者以后加了位置字段」时直接可用（docs/author-compat.md）。表名和位置字段名来自包（core/profile.mjs tables.present / place），没写就按内核词表找。
// 表的每一项可能是：{ 名字: { 位置: '层·地点', … } }、{ 名字: '层·地点' }、{ 名字: '一句描述' }、['名字', …]、[{ 名字 / 姓名 / name, 位置 }]、'甲、乙'
const looksPlace = s => /[·・]/.test(s) && [...s].length <= 60;   // 字符串值只有写成「层·地点」才当位置（否则可能是描述）
const placeOf = o => { const k = getProfile().place || VOC.exactKey('position', o); return k ? str(val(o?.[k])) : ''; };
const nameOf = x => { for (const k of VOC.exactWords('name')) { const n = str(val(x[k])); if (n) return n; } return ''; };
/** stat_data → 在场人物 [{ name, place }]（place = '' 表示没写位置，调用方按玩家所在处处理（默认同处））。没有在场表返回 null */
export function presentList(stat, path = '') {
  if (!stat || typeof stat !== 'object') return null;
  const declared = getProfile().tables[getProfile().presentId], key = path || (declared && declared in stat ? declared : VOC.exactKey('presentKey', stat)); if (!key) return null;
  const t0 = path ? getByPath(stat, path) : stat[key]; if (t0 === undefined) return null;
  const t = val(t0), out = [], add = (n, p) => { n = clean(n); if (n && [...n].length <= 40 && !out.some(o => o.name === n)) out.push({ name: n, place: clean(p) }); };
  if (typeof t === 'string') { for (const n of t.split(/[、,，;；\/]/)) add(n, ''); return out; }
  if (Array.isArray(t)) {
    for (const it of t) { const x = val(it);
      if (typeof x === 'string') add(x, '');
      else if (x && typeof x === 'object') add(nameOf(x), placeOf(x)); }
    return out;
  }
  if (!t || typeof t !== 'object') return out;
  for (const [n, raw] of Object.entries(t)) {
    const o = val(raw);
    if (typeof o === 'string') { if (clean(o)) add(n, looksPlace(o) ? o : ''); }   // 空字符串 = 卡模板占位 / 未填槽，不算在场人物（2026-09-28 待查 3，只按结构不按内容）
    else if (o && typeof o === 'object' && !Array.isArray(o)) add(n, placeOf(o));   // null / 数字等原始值 = 空槽，跳过
  }
  return out;
}

// ---------------- 4 世界时间 ----------------
/** stat_data → { date, time, period }（缺的是 ''）；路径来自变量映射（adapter.effective），没有路径的项读不到 */
export function worldTime(stat, m = {}) {
  const at = p => (p ? str(getByPath(stat, p)) : '');
  return { date: at(m.date), time: at(m.time), period: at(m.period) };
}
const hourOf = t => { const m = String(t || '').match(/(\d{1,2})\s*[:：时]\s*(\d{0,2})/); return m ? +m[1] + (+m[2] || 0) / 60 : null; };
/** 夜间：世界时钟落在包的「暗」时段里（core/periods.mjs bandOf，K-R39；默认时段里是 20:00 起的 night） */
export const isNight = w => !!(w && bandOf(getProfile().periods, w)?.dark);
/** 时段色调：时段的 id（默认 dawn / day / dusk / night；包可以自起名、自带时段词），读不到返回 ''。时段文字里的词优先，否则按时刻落在哪个时段 */
export const todPhase = w => (w ? bandOf(getProfile().periods, w)?.id || '' : '');
/** 标题栏里的紧凑写法：zh「1月1日 08:00」、en「Jan 1 08:00」（读起来是日期，用户 2026-09-28）；全文（带年份与时段）放在 title */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function clockLabel(w, lang = 'zh') {
  if (!w) return { short: '', full: '' };
  const d = String(w.date || '').match(/(\d{1,2})\s*[月.\-/]\s*(\d{1,2})/);
  const md = !d ? '' : lang === 'en' ? `${MON[(+d[1] - 1) % 12] || d[1]} ${+d[2]}` : `${+d[1]}月${+d[2]}日`;
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
/** stat_data → { 衣服, 裤子, 鞋子, … }（只收字符串，空和「待初始化」不算）；没有着装（或没有路径）返回 null */
export function outfit(stat, path = '') {
  const o = path ? getByPath(stat, path) : undefined; if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = {}; for (const [k, v] of Object.entries(o)) { const s = str(val(v)); if (s && !VOC.isEmptyValue(s)) r[k] = s; }
  return Object.keys(r).length ? r : null;
}
/** 卡片里的一行：「着装：a / b / c」，截断 */
export function outfitText(o, max = 48) {
  if (!o) return '';
  const first = VOC.exactWords('outfitOrder'), keys = [...first.filter(k => k in o), ...Object.keys(o).filter(k => !first.includes(k))];
  return clip(keys.map(k => o[k]).join(' / '), max);
}

// ---------------- 2 自定义名称与用途（聊天变量 eden_map.自定义，在 stat_data 之外） ----------------
// 形状：{ items: { 标准名: { 类: 'room' | 'area' | 'landmark' | 'character', 名?: 显示名, 用途?: 备注, 别名?: [旧叫法], 源?: '手动' | '标签' } }, 同步世界书: bool, 同步手动?: true }
// v0.9.5：「同步到世界书」默认开。没动过开关（没有 同步手动）一律当开；自己关过的（同步手动 + 同步世界书 false）保持关。
export let VAR_ROOT = 'eden_map';   // 聊天变量顶层键：{ 自定义: {...}, 标签楼: 已处理到的楼层 }；设定包可改（core/pack.mjs chatVar，setVarRoot）
export function setVarRoot(k) { if (typeof k === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(k)) VAR_ROOT = k; return VAR_ROOT; }
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
/** 旧版本机叫法（core/legacy-custom.mjs readCustom：{ rooms: { 自定义名: 标准房间名 } }）并进来；已有显示名的只记成旧叫法 */
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
/** 同步到世界书「<包名>·自定义」的条目正文 */
export function wbContent(c) {
  const rows = Object.entries(c?.items || {}).map(([k, e]) => `- ${k}${e.名 ? `：玩家称为「${e.名}」` : ''}${e.用途 ? `；用途：${e.用途}` : ''}`);
  return rows.length ? `<地图自定义>\n以下地点 / 人物有玩家起的名字或用途，正文里可以用这些叫法：\n${rows.join('\n')}\n</地图自定义>` : '';
}
/** 0.9.3 → 0.9.5 迁移：旧数据总是写着 同步世界书 false。这一本聊天世界书已经建过（只有打开过同步才会建）→ 说明是自己关掉的，记成 同步手动 保持关 */
export function syncMigrate(raw, wbExists) {
  if (!raw || typeof raw !== 'object' || raw.同步手动 || raw.同步世界书 !== false || !wbExists) return raw;
  return { ...raw, 同步手动: true };
}
export let WB_NAME = '';   // 包的世界书名前缀 +「·自定义」：宿主读到清单后调 setWbName（没调用前为空 = 没有这本书）
export const WB_ENTRY = '地图自定义';
/** 设定包：世界书名 =「<前缀>·自定义」；前缀见 core/pack.mjs worldbookPrefix（宿主与桥都会调，包括第一个包） */
export function setWbName(title) { if (typeof title === 'string' && title.trim()) WB_NAME = title.trim().slice(0, 40) + '·自定义'; return WB_NAME; }
/** 按聊天分开的世界书名（多个聊天共用一本会互相串）：「<包名>·自定义·<聊天 id 的短哈希>」 */
export function wbName(chat) { if (!WB_NAME) return ''; let h = 2166136261; for (const c of String(chat || '')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return `${WB_NAME}·${(h >>> 0).toString(16).padStart(8, '0').slice(0, 6)}`; }

// ---------------- 剧情标签：⌖改名 / ⌖用途 / ⌖事实 ----------------
//   ⌖改名 书房 → 星图室        （→ / -> / ＞ / > 都认）
//   ⌖用途 书房：夜里看星图      （： / : 都认）
//   ⌖事实 书房：暗格通向地下室   （W7 事实结晶的输入：不落 custom items——wb_crystallize 从消息窗口重放收集，
//     「聊天记录是唯一真相」不破；applyTags 对 fact 跳过）
export const CUSTOM_EXAMPLES = new Set(['⌖改名 原名 → 新名', '⌖用途 地点：用途', '⌖改名 书房 → 星图室', '⌖用途 书房：整理旧地图', '⌖事实 地点：坐实的事实']);
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[k]);
/** 一楼原文 → [{ op: 'name' | 'note' | 'fact', key, value }]（最多 6 条；代码块与示范原文跳过） */
export function parseCustomTags(raw) {
  if (!raw || (raw.indexOf('⌖改名') < 0 && raw.indexOf('⌖用途') < 0 && raw.indexOf('⌖事实') < 0)) return [];
  const text = decode(String(raw)).replace(/```[\s\S]*?```/g, '').replace(/<code>[\s\S]*?<\/code>/gi, ''), out = [];
  for (const m of text.matchAll(/⌖(改名|用途|事实)[\s:：]*([^<\n⌖]{1,260})/g)) {
    const body = m[2].trim();
    if (CUSTOM_EXAMPLES.has(`⌖${m[1]} ${body}`)) continue;
    if (m[1] === '改名') { const p = body.split(/\s*(?:→|->|＞|>|=>)\s*/); if (p.length === 2 && clean(p[0]) && clean(p[1])) out.push({ op: 'name', key: clean(p[0]), value: clean(p[1]).slice(0, MAX_NAME) }); }
    else { const i = body.search(/[：:]/); if (i > 0) { const k = clean(body.slice(0, i)), v = body.slice(i + 1).trim(); if (k && v) out.push({ op: m[1] === '事实' ? 'fact' : 'note', key: k, value: [...v].slice(0, MAX_NOTE).join('') }); } }
  }
  return out.slice(0, 6);
}
/** 把新楼层的标签用到自定义数据上：msgs = [{floor, text}]，after = 已处理到的楼层。返回 { custom, applied: [{op,key,value,floor}], last } */
export function applyTags(c, msgs, after, kindOf = () => 'landmark') {
  let cur = normCustom(c), last = after; const applied = [];
  for (const { floor, text } of msgs) {
    if (!(floor > after)) continue; last = Math.max(last, floor);
    for (const t of parseCustomTags(text)) {
      if (t.op === 'fact') continue;   // W7 事实：不落 custom items，wb_crystallize 从消息窗口重放收集
      const key = findKey(cur, t.key) || t.key, kind = cur.items[key]?.类 || kindOf(key);
      const nx = setCustom(cur, key, t.op === 'name' ? { name: t.value, kind, source: 'tag' } : { note: t.value, kind, source: 'tag' });
      if (nx) { cur = nx; applied.push({ ...t, key, floor }); }
    }
  }
  return { custom: cur, applied, last };
}
/** 一次性提示的文字 */
export const tagToast = a => (a.op === 'name' ? `${a.key} 改名为「${a.value}」` : `${a.key} 的用途已更新`);

// ---------------- v0.9.5 人物栏的名册（只读）：表名和行内字段来自包（core/profile.mjs），没写的按表的形状 / 内核词表发现，不认具体卡的字段内容 ----------------
// 组（K-R41）：在场表 = 包的 present 组，或名字在内核「在场」词表里的表；其余「以名字为键、行是对象、行里有人物 / 地点字段」的表按出现顺序分给包声明的其余各组（第 1 张给在场组之后的第一组，依此类推）
// （放变量路径的顶层表——世界、主角——不算）。map 参数可以指定（变量映射，见 docs/content-compat.md「换卡兼容」）。
const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);
const isRoster = t => { t = val(t); return plain(t) && Object.values(t).every(v => plain(val(v))); };
const personRow = o => Object.keys(o || {}).some(k => VOC.hasWord('role', k) || VOC.exactRank('place', k) >= 0 || VOC.exactRank('person', k) >= 0 || SLOTS.some(sl => VOC.slotHit(sl, k)));   // K-06: a place- or person-like field (the roster slots' words count)
const isPeople = t => isRoster(t) && Object.values(val(t)).some(r => personRow(val(r)));
const num = v => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v : NaN);
// 槽位取值（core/profile.mjs SLOTS）：字段名 = 变量映射里生效的（用户选的 / detect 找到的，'-' = 关），种类和档位来自包里的槽位字段，包没写就用内核默认。
// 文字 / 标签保留原值的类型（布尔、数字不转字符串：人物卡按类型显示单位和「知情」）。
const slotKey = (slot, fk) => { const k = fk[slot + 'Field']; return k && k !== '-' ? k : ''; };
function slotRead(slot, key, o) {
  const d = slotDef(getProfile(), slot), raw = val(o[key]);
  if (typeof raw === 'boolean' || (typeof raw === 'number' && Number.isFinite(raw) && d.kind !== 'gauge')) return raw;
  const v = fieldValue({ ...d, field: key, show: undefined }, { [key]: raw });
  return v === null ? undefined : v;
}
function coreRead(key, o) {   // 核心数值（gauge）：值夹在 min..max；档位名只在字段就是包声明的那一个时用包里的，别的字段一律「档 n」（档界相同）
  const d = slotDef(getProfile(), 'core'), own = getProfile().slots?.core?.field === key;
  const bands = d.ladder.map((b, i) => ({ ...b, label: own ? b.label : `档 ${i + 1}` }));
  const g = fieldValue({ ...d, field: key, ladder: bands }, { [key]: val(o[key]) });
  return g ? { core: g.value, coreKey: key, coreStage: g.band || '' } : null;
}
// 战力小签（E1）：只从卡里写明的内容推，不编造；读不到返回 ''。没有字段名（默认）：逐个文字值在包的阶梯里找（scan）；有字段名（用户指定 / 按名找到）：阶梯里的词，否则 12 字内的原文。off = 映射里关掉了
function tierRead(o, key, off) {
  if (off || !plain(o)) return '';
  const d = slotDef(getProfile(), 'tier'), row = Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, val(v)]));
  if (key && key in row) { const r = fieldValue({ ...d, field: key, scan: false }, row); if (r) return r.label; const v = row[key]; return typeof v === 'string' && v.trim() && v.trim().length <= 12 ? v.trim() : ''; }
  const r = fieldValue({ ...d, field: '', scan: true }, row); return r ? r.label : '';
}
const MORE_KEYS = { code: 'code', social: 'social', height: 'height', weight: 'weight', known: 'known', accessory: 'accessory' };
function rows(tbl, stageKey, fk = {}) {
  const t = val(tbl); if (!plain(t)) return [];
  const sd = getProfile().slots?.stage?.field;
  return Object.entries(t).filter(([n]) => clean(n) && [...n].length <= 40).map(([n, raw]) => {
    const o = val(raw) || {}, ik = Object.keys(o).find(k => VOC.hasWord('role', k)), sk = stageKey || (sd && sd in o ? sd : Object.keys(o).find(k => VOC.hasWord('stage', k)));
    const it = { name: clean(n), identity: str(val(o[ik])) };
    if (sk) { const s = str(val(o[sk])); if (s) it.stage = s; }
    const gk = slotKey('grade', fk), ck = slotKey('core', fk);
    if (gk && gk in o) { const g = str(val(o[gk])); if (g) it.grade = g; }
    if (ck && ck in o && Number.isFinite(num(val(o[ck])))) Object.assign(it, coreRead(ck, o));
    const more = {};   // v0.9.6 E13 其余字段（人物卡「更多资料」）：只读，原样取值；布尔的知情度保留 true / false
    for (const [slot, k] of Object.entries(MORE_KEYS)) { const f = slotKey(slot, fk); if (!f || !(f in o)) continue; const v = slotRead(slot, f, o); if (v !== undefined && v !== '') more[k] = v; }
    if (Object.keys(more).length) it.more = more;
    { const tk = fk.tierField; const tv = tierRead(o, tk && tk !== '-' ? tk : '', tk === '-'); if (tv) it.tier = tv; }
    return it;
  });
}
/** stat_data → { <组 id>: { key: 表名, items: [{ name, identity, stage?, grade?, core?, coreKey?, coreStage?, more?, tier? }] } | null }，每个包声明的组一项（包没声明就是 present / members / targets 三组）；
 * map = { <组 id>: 表名 } 表名覆盖（变量映射），各 *Field 行内字段名（'-' = 关闭）
 * fallback = 包的保底名册（manifest.data.roster 的 members，[{ name, identity }]；Pack 0 数据挂载点，通用化 v1 从这里的硬编码数组抽离）——
 * 设定兜底（用户 2026-09-29：「成员不能空」）：MVU 成员表是剧情写出来的，还没开局 / 剧情还没写到成员表 / 变量快照缺失时，
 * 人物页不该是空的。保底名册补在在场组之后的第一组；src:'设定' 供界面标注来源；MVU 表里已有的人不重复补（MVU 为准），剧情新加的人照常追加在后面。 */
export function rosters(stat, map = {}, fallback = []) {
  const P = getProfile(), PID = P.presentId, rest = P.groups.filter(g => g.id !== PID), T = P.tables;
  const out = Object.fromEntries(P.groups.map(g => [g.id, null]));
  if (plain(stat)) {
    const keys = Object.keys(stat), vp = P.paths, worldKeys = new Set(Object.values(vp).filter(Boolean).map(p => p.split('.')[0]));
    const pres = map[PID] || (T[PID] && T[PID] in stat ? T[PID] : VOC.exactKey('presentKey', stat)) || keys.find(k => VOC.hasWord('present', k));
    const others = keys.filter(k => k !== pres && !worldKeys.has(k) && isPeople(stat[k])), named = id => (T[id] && T[id] !== pres && T[id] in stat && isRoster(stat[T[id]]) ? T[id] : '');
    const pick = { [PID]: pres }, used = new Set();   // 其余组：用户映射 > 包声明的表 > 按出现顺序发现（已被前面的组用掉的不再用）
    for (const g of rest) { const k = map[g.id] || named(g.id) || others.filter(x => !used.has(x))[0]; pick[g.id] = k; if (k) used.add(k); }
    const stageAt = new Set(rest.slice(1).map(g => g.id));   // 阶段字段的映射覆盖只作用在第二组起（第一组按包里的槽位字段找）
    for (const [g, k] of Object.entries(pick)) if (k && k in stat && isRoster(stat[k])) out[g] = { key: k, items: rows(stat[k], stageAt.has(g) ? map.stageField : null, map) };
  }
  // 设定兜底：没有这一组的表（连 stat 都没有）时整组用包的保底名册；有表时只补表里没有的人
  const fid = rest[0]?.id;
  if (fid) {
    const have = new Set((out[fid]?.items || []).map(i => i.name));
    const fb = (Array.isArray(fallback) ? fallback : []).filter(m => !have.has(m?.name)).map(m => ({ ...m, src: '设定' }));
    if (fb.length) out[fid] = { key: out[fid] ? out[fid].key : '设定名册', items: [...(out[fid] ? out[fid].items : []), ...fb] };
  }
  return out;
}
/** 主角的声望（0–100 的数字）；没有返回 null。path 是变量映射里的路径；没有路径就在前 3 层里找名字带「声望」词的数字（浅的优先） */
export function reputation(stat, path = '') {
  if (!plain(stat)) return null;
  let v;
  if (path) v = val(getByPath(stat, path));
  else {
    const walk = (o, d) => { const hits = [], sub = [];
      for (const [k, raw] of Object.entries(o)) { const x = val(raw); if (k.startsWith('$')) continue; if (plain(x)) { if (d < 3) sub.push(x); } else if (typeof x === 'number' && VOC.hasWord('reputation', k)) hits.push(x); }
      return hits.length ? hits : sub.flatMap(x => walk(x, d + 1)); };
    v = walk(stat, 1)[0];
  }
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

/** 卡自带脚本里的默认立绘表（`defaultPortraits = { "名字": "地址", … }`）：只收包的 avatar 规则放行的 https 图片地址（core/profile.mjs portraitOk，K-R43）；
 *  包没有 avatar.from 'card-script' 就一张不取；找不到返回 {} */
// 只加载作者在卡里声明的立绘，不复制图片、不存地址表；关掉「使用原作头像」开关则一张都不取。
export const portraitOk = u => avatarOk(getProfile().avatar, u);
export function findPortraits(texts) {
  const out = {}; if (!(getProfile().avatar.from || []).includes('card-script')) return out;
  for (const t of texts || []) {
    const i = String(t).search(/defaultPortraits\s*=\s*\{/); if (i < 0) continue;
    const blk = String(t).slice(i, String(t).indexOf('}', i) + 1);
    for (const m of blk.matchAll(/["']([^"'\n]{1,40})["']\s*:\s*["']([^"'\s]+)["']/g)) if (portraitOk(m[2])) out[clean(m[1])] = m[2];
  }
  return out;
}

// ---------------- the card's own item table (K-R76, read only) ----------------
const INV_ROWS = 100;
const cut = (s, n) => [...s].slice(0, n).join('');
const firstNum = o => { for (const v of Object.values(o)) { const x = val(v); if (typeof x === 'number' && Number.isFinite(x)) return x; } return undefined; };
const firstStr = o => { for (const v of Object.values(o)) { const x = val(v); if (typeof x === 'string' && clean(x)) return clean(x); } return ''; };
const plainObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
/** The table at `path` of the card's stat_data as rows `[{ name, qty?, text? }]` (at most 100; names <= 60 code points, text <= 80): `{ path, rows }`, or null when `path`
 *  does not hold a table. An object keyed by item name (value: a number is the quantity, a string the text, an object its first number and first string) or a list
 *  (strings are names; objects: the name field by the kernel's name words, else the first string field, and the first number as the quantity). MVU `[value, note]`
 *  pairs are unwrapped; keys starting with `_` or `$` are skipped. Reads only: nothing is written to stat_data. */
export function cardInventory(stat, path) {
  if (typeof path !== 'string' || !path) return null;
  const t = getByPath(stat, path);
  if (!t || typeof t !== 'object') return null;
  const rows = [], add = (name, qty, text) => {
    const n = cut(clean(name), 60); if (!n || rows.length >= INV_ROWS) return;
    rows.push({ name: n, ...(qty !== undefined ? { qty } : {}), ...(text ? { text: cut(clean(text), 80) } : {}) });
  };
  if (Array.isArray(t)) {
    for (const it of t) {
      const x = val(it);
      if (typeof x === 'string') add(x);
      else if (plainObj(x)) { const k = VOC.exactKey('name', x, undefined, v => typeof val(v) === 'string' && clean(val(v)) !== ''); add(k !== undefined ? val(x[k]) : firstStr(x), firstNum(x)); }
    }
  } else {
    for (const [k, raw] of Object.entries(t)) {
      if (k.startsWith('_') || k.startsWith('$')) continue;
      const x = val(raw);
      if (typeof x === 'number') add(k, Number.isFinite(x) ? x : undefined);
      else if (typeof x === 'string') add(k, undefined, x);
      else if (plainObj(x)) add(k, firstNum(x), firstStr(x));
      else add(k);
    }
  }
  return { path, rows };
}
/** The path of the card's item table: the pack's `vars.inventory`, else the real (not virtual) field the slot probe found (K-R76); '' = none. */
export const inventoryPath = probe => getProfile().paths?.inventory || (probe && !probe.virtual && probe.path ? probe.path : '');
