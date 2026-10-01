// 人物栏（v0.9.2）：从聊天原文的人物位置标签和 MVU 变量里找出人物及其最新位置。纯函数：卡内脚本 eden-map.js、查看器、node 单测共用。
// 标签两种写法（与事态标签同一风格，一楼不限条数但只取前 8 条）：
//   <span style="display:none">⌖人物 名字 @ 层·地点</span>          （紧凑写法；「@」全角「＠」也认）
//   <span style="display:none" data-tcmap="人物=名字;地点=层·地点"></span>
// MVU：stat_data 里任何「人物名 → 对象」的表，对象里有 位置 / 当前位置 / 当前地点 / 所在地 / 地点 / location 字段 → 该人物在那里；
//      名字叫「在场人物 / 在场角色 / 当前在场」这类表（没有位置字段）→ 这些人和玩家在同一处（当前地点变量的第一处）。
// v0.9.3：在场表每一项的「位置」字段（附加世界书教模型维护，格式「层·地点」）优先；表项是字符串也认（mvu-readers.mjs presentList）。
//   来源 src：'mvu'（MVU 位置）→ 'tag'（聊天标签）→ 'infer'（在场但没写位置：按同处显示）。
// 只做技术兼容：不按内容过滤任何名字或地点，原样显示。
import { presentList } from './mvu-readers.mjs';
import { getProfile } from './pack-profile.mjs';
import * as VOC from '../core/vocab.mjs';
import { AVATARS_PER_CHAT, AVATAR_TOTAL, measure, bytesOf, freeUp, safeSet, touch } from './storage-budget.mjs';
export { warnText } from './storage-budget.mjs';
export const MAX_TAGS_PER_FLOOR = 8;
export const PRESENT_TAG_FRESH = 20, INJECT_FRESH = 30, PRESENT_STALE = 30;   // 在场的人：标签超过 20 楼就改按「和你同处」；注入只放 30 楼内的位置（v0.9.3 审阅）；在场表超过 30 楼没变就不再按同处（2026-09-28 待查 2）
const personTable = (tk, o) => VOC.hasWord('people', tk) || Object.keys(o).some(k => VOC.exactRank('person', k) >= 0);   // 只认人物表（表名说是人，或行里有只有人才有的字段）；物品 / 势力表带「位置」也不当人物
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[k]);
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
// 世界书里的示范原文：模型原样复述时不算
export const EXAMPLES = new Set(['⌖人物 名字 @ 层·地点', '⌖人物 维克多 @ 下层·7号井', '人物=名字;地点=层·地点', '人物=维克多;地点=下层·7号井']);

/** 一楼原文 → [{name, place}] */
export function parseChars(raw) {
  if (!raw || (raw.indexOf('⌖人物') < 0 && raw.indexOf('人物=') < 0)) return [];
  const text = decode(String(raw)).replace(/```[\s\S]*?```/g, '').replace(/<code>[\s\S]*?<\/code>/gi, '');
  const found = [];
  // 地点到句读为止：世界书教的是隐藏 span，但模型常写成裸标签「⌖人物 雷恩 @ 下层·7号井，他推开铁门…」，
  // 以前会把后面的整句吃进地点，再进列表 / 地点卡 / 注入 / 行程（2026-09-27 接手 review P2）。
  for (const m of text.matchAll(/⌖人物[\s:：]+([^<\n⌖@＠]{1,40}?)\s*[@＠]\s*([^<\n⌖，。；、,;！？!?]{1,60})/g)) {
    const place = clean(m[2]).replace(/[\s和与及、]+$/, '');   // 两个标签挨着写时尾巴上会挂一个「和」
    if (EXAMPLES.has(`⌖人物 ${m[1].trim()} @ ${place}`)) continue;
    found.push([m.index, clean(m[1]), place]);
  }
  for (const m of text.matchAll(/data-tcmap\s*=\s*(["'])(.*?)\1/g)) {
    if (EXAMPLES.has(m[2].trim())) continue;
    const o = {}; for (const kv of m[2].split(/[;；]/)) { const k = kv.search(/[=＝]/); if (k > 0) o[kv.slice(0, k).trim()] = kv.slice(k + 1).trim(); }
    if (!o.人物 || o.类型 || o.标题) continue;   // 带类型 / 标题的是事态标签
    found.push([m.index, clean(o.人物), clean((o.层 && !(o.地点 || '').includes(o.层) ? o.层 + '·' : '') + (o.地点 || ''))]);
  }
  return found.sort((a, b) => a[0] - b[0]).filter(([, n, p]) => n && p).slice(0, MAX_TAGS_PER_FLOOR).map(([, name, place]) => ({ name, place }));
}

/** 名字对齐（v0.9.5 通读）：去掉世界书标签的 _idN 后缀；只写了名（伊莎贝拉）而已知名单里正好有一个以「名·」开头的全名 → 用全名。
 *  名字当姓用的（「维多利亚」与「某某·维多利亚」）不合并：只认「名·」前缀，且只有唯一一个时才认 */
export function canonName(name, known = []) {
  const n = clean(String(name || '').replace(/_id\d+$/i, '')); if (!n || known.includes(n) || /[·・]/.test(n)) return n;
  const full = known.filter(k => new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[·・]').test(k));
  return full.length === 1 ? full[0] : n;
}
/** 消息原文 → 解析标签前先去掉 MVU 的变量更新块（包括没有闭合的，开局九有一处） */
export const stripUpdate = s => String(s || '').replace(/<UpdateVariable>[\s\S]*?(?:<\/UpdateVariable>|$)/gi, ' ');
/** MVU stat_data → [{name, place}]；here = 玩家当前地点（在场表的人放在这里）。放变量路径的顶层表（世界、主角……：包的 vars）不当人物表 */
export function mvuChars(stat, here, presentPath = '') {
  const out = [], first = String(here || '').split(/\s*[\/／|｜]\s*/)[0].trim();
  if (!stat || typeof stat !== 'object') return out;
  const pres = presentList(stat, presentPath), done = new Set(), skip = new Set(Object.values(getProfile().paths).filter(Boolean).map(p => p.split('.')[0]));
  for (const p of pres || []) { done.add(p.name); if (p.place) out.push({ name: p.name, place: p.place }); else if (first) out.push({ name: p.name, place: first, present: true }); }
  for (const [tk, tbl] of Object.entries(stat)) {
    if (!tbl || typeof tbl !== 'object' || Array.isArray(tbl) || skip.has(tk)) continue;
    for (const [name, o] of Object.entries(tbl)) {
      if (done.has(clean(name))) continue;
      if (!o || typeof o !== 'object' || Array.isArray(o) || !clean(name) || [...name].length > 40) continue;
      const k = VOC.exactKey('place', o, undefined, v => typeof v === 'string' && v.trim());
      if (k && personTable(tk, o)) out.push({ name: clean(name), place: clean(o[k]) });
      else if (VOC.exactRank('presentTable', tk) >= 0 && first) out.push({ name: clean(name), place: first, present: true });
    }
  }
  return out;
}

/** 最近若干楼 [{floor, text}] + MVU（最新楼的状态）→ 每人最新位置 [{name, place, floor, src: 'mvu'|'tag'|'infer', present?}]，新的在前。
 *  presentFloor = 在场表最后一次更新的楼（默认 Infinity = 不衰减）。2026-09-28 待查 1/2/6：
 *  开局前（now ≤ 0，还没有玩家楼）在场表有人不按「和你同处」显示，标 prelude；在场表超过 PRESENT_STALE 楼没变时降级为
 *  位置未知（place=''，stale=隔了几天楼），floor 保留上次明确位置所在楼，UI 可显示「上次明确位置 N 楼前」。 */
export function collectChars(msgs, now, mvu = [], known = [], presentFloor = Infinity) {
  const map = new Map(), names = [...new Set([...mvu.map(c => c.name), ...known])];
  for (const { floor, text } of msgs) for (const c of parseChars(text)) { const n = canonName(c.name, names); map.delete(c.name); map.set(n, { ...c, name: n, floor, src: 'tag' }); }
  for (const c of mvu) {   // MVU 是最新楼的状态：写了位置就以它为准；在场但没写位置时，有近期标签（≤ 20 楼）用标签，否则按和玩家同处
    if (c.present && map.has(c.name) && now - map.get(c.name).floor <= PRESENT_TAG_FRESH) continue;
    if (c.present && now <= 0) { map.set(c.name, { name: c.name, place: '', floor: now, src: 'infer', prelude: true }); continue; }   // 开局前：不按同处，显示「开局前 · 卡初始」
    if (c.present && now - presentFloor > PRESENT_STALE) { const last = map.get(c.name); map.set(c.name, { name: c.name, place: '', floor: last?.floor ?? now, src: 'infer', stale: now - presentFloor }); continue; }   // 在场表久未变：降级未知
    map.set(c.name, { ...c, floor: now, src: c.present ? 'infer' : 'mvu' });
  }
  return [...map.values()].sort((a, b) => b.floor - a.floor || a.name.localeCompare(b.name));
}

// 人物颜色：按名字哈希取固定色。色相避开事态 9 个大类的颜色（地图上一眼分得开），全部中等明度、白字 / 深字都可读
export const CHAR_HUES = [100, 128, 152, 172, 244, 262, 342];
export function hueOf(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h;
}
const fnv = s => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export const colorOf = (name, hues = CHAR_HUES) => `hsl(${hues[fnv(String(name)) % hues.length]} 58% 46%)`;
/** 头像框里的字：中文取第一个字，西文取首字母（最多两个） */
export function initials(name) {
  const s = clean(name); if (!s) return '?';
  if (/^[A-Za-z]/.test(s)) return s.split(/[\s·.\-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return [...s][0];
}

/** 注入给模型的一句：最多 8 人，和玩家同处的合成一项。没有人物返回 '' */
export function summarizeChars(items, max = 8, maxLen = 160, now = null) {
  const list = items.filter(c => (now == null || c.present || now - c.floor <= INJECT_FRESH) && (c.place || c.present)).slice(0, max); if (!list.length) return '';
  const with_ = list.filter(c => c.present).map(c => c.name), rest = list.filter(c => !c.present);
  const parts = []; if (with_.length) parts.push('与你同处：' + with_.join('、'));
  for (const c of rest) parts.push(`${c.name}@${c.place}`);
  let s = parts.join('；'); if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
  return `[人物位置·仅背景，最新已知] ${s}。`;
}

// ---------------- 本机头像与显示开关（只在 localStorage，按聊天分开存；拿不到聊天 id 时存全局）----------------
export const avatarKey = chat => (chat ? `edenMap:chat:${chat}:avatars` : 'edenMap:avatars');
export const charPrefKey = chat => (chat ? `edenMap:chat:${chat}:chars` : 'edenMap:chars');
const readJ = (st, k) => { try { const o = JSON.parse(st?.getItem(k) || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };
export function readAvatars(st, chat) { return { ...(readJ(st, avatarKey('')) || {}), ...(chat ? readJ(st, avatarKey(chat)) || {} : {}) }; }
export const AVATAR_MAX = 160000;   // v0.9.5（通读 R3）：和状态栏共用同一份 localStorage 额度，单张 data URL 上限约 160 KB（查看器会先压缩）
const okImg = s => typeof s === 'string' && (s.startsWith('data:') ? s.length <= AVATAR_MAX : s.length <= 2000) && /^(data:image\/(png|jpe?g|webp|gif);base64,|https?:\/\/|blob:)/i.test(s);
// A-13：每个聊天最多 AVATARS_PER_CHAT 张；所有聊天合计超过 AVATAR_TOTAL 时先清最久没用的聊天的头像；撞额度按 LRU 腾地方再试（budget.mjs）
// 返回 { ok, reason?: 'invalid' | 'cap' | 'quota' | 'error' }，调用方据此告诉用户；setAvatar 仍返回布尔
export function setAvatarEx(st, chat, name, src) {
  name = clean(name); if (!st || !name || [...name].length > 40 || !okImg(src)) return { ok: false, reason: 'invalid' };
  const k = avatarKey(chat), o = readJ(st, k) || {};
  if (!(name in o) && Object.keys(o).length >= AVATARS_PER_CHAT) return { ok: false, reason: 'cap' };
  o[name] = src; const v = JSON.stringify(o);
  const was = (() => { try { return st.getItem(k) || ''; } catch (e) { return ''; } })();
  const over = () => measure(st).avatars - (was ? bytesOf(k, was) : 0) + bytesOf(k, v) - AVATAR_TOTAL;
  if (over() > 0) { freeUp(st, chat, over(), /:avatars$/); if (over() > 0) return { ok: false, reason: 'quota' }; }
  const r = safeSet(st, k, v, chat); if (r.ok) touch(st, chat); return r;
}
export const setAvatar = (st, chat, name, src) => setAvatarEx(st, chat, name, src).ok;
export function removeAvatar(st, chat, name) {
  name = clean(name); const k = avatarKey(chat), o = readJ(st, k) || {};
  if (!(name in o)) return false; delete o[name];
  try { Object.keys(o).length ? st.setItem(k, JSON.stringify(o)) : st.removeItem(k); return true; } catch (e) { return false; }
}
export function readCharPrefs(st, chat) { const o = readJ(st, charPrefKey(chat)) || {}; return { show: o.show !== false, off: Array.isArray(o.off) ? o.off.filter(x => typeof x === 'string') : [] }; }
export function writeCharPrefs(st, chat, p) { try { st.setItem(charPrefKey(chat), JSON.stringify({ show: !!p.show, off: [...new Set(p.off)] })); return true; } catch (e) { return false; } }
