// 人物栏（v0.9.2）：从聊天原文的人物位置标签和 MVU 变量里找出人物及其最新位置。纯函数：卡内脚本 eden-map.js、查看器、node 单测共用。
// 标签两种写法（与事态标签同一风格，一楼不限条数但只取前 8 条）：
//   <span style="display:none">⌖人物 名字 @ 层·地点</span>          （紧凑写法；「@」全角「＠」也认）
//   <span style="display:none" data-tcmap="人物=名字;地点=层·地点"></span>
// MVU：stat_data 里任何「人物名 → 对象」的表，对象里有 位置 / 当前位置 / 当前地点 / 所在地 / 地点 / location 字段 → 该人物在那里；
//      名字叫「在场人物 / 在场角色 / 当前在场」这类表（没有位置字段）→ 这些人和玩家在同一处（世界.当前地点的第一处）。
// v0.9.3：在场表每一项的「位置」字段（附加世界书教模型维护，格式「层·地点」）优先；表项是字符串也认（mvu.mjs presentList）。
//   来源 src：'mvu'（MVU 位置）→ 'tag'（聊天标签）→ 'infer'（在场但没写位置：推断和玩家同处）。
// 只做技术兼容：不按内容过滤任何名字或地点，原样显示。
import { presentList } from './mvu.mjs';
export const MAX_TAGS_PER_FLOOR = 8;
export const PRESENT_TAG_FRESH = 20, INJECT_FRESH = 30;   // 在场的人：标签超过 20 楼就改按「和你同处」；注入只放 30 楼内的位置（v0.9.3 审阅）
const LOC_KEYS = ['当前位置', '当前地点', '所在地', '所在位置', '位置', '地点', 'location', 'place'];
const PEOPLE = /人物|角色|人员|同伴|成员|NPC|character|people|npc/i, PERSONISH = ['身份', '姓名', '年龄', '性别', '职业', '外貌', '内心想法', '好感'];
const PRESENT = /^(在场人物|在场角色|当前在场|在场|同行人物|present)$/i;
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[k]);
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
// 世界书里的示范原文：模型原样复述时不算
export const EXAMPLES = new Set(['⌖人物 名字 @ 层·地点', '⌖人物 维克多 @ 下层·7号井', '人物=名字;地点=层·地点', '人物=维克多;地点=下层·7号井']);

/** 一楼原文 → [{name, place}] */
export function parseChars(raw) {
  if (!raw || (raw.indexOf('⌖人物') < 0 && raw.indexOf('人物=') < 0)) return [];
  const text = decode(String(raw)).replace(/```[\s\S]*?```/g, '').replace(/<code>[\s\S]*?<\/code>/gi, '');
  const found = [];
  for (const m of text.matchAll(/⌖人物[\s:：]+([^<\n⌖@＠]{1,40}?)\s*[@＠]\s*([^<\n⌖]{1,60})/g)) {
    if (EXAMPLES.has(`⌖人物 ${m[1].trim()} @ ${m[2].trim()}`)) continue;
    found.push([m.index, clean(m[1]), clean(m[2])]);
  }
  for (const m of text.matchAll(/data-tcmap\s*=\s*(["'])(.*?)\1/g)) {
    if (EXAMPLES.has(m[2].trim())) continue;
    const o = {}; for (const kv of m[2].split(/[;；]/)) { const k = kv.search(/[=＝]/); if (k > 0) o[kv.slice(0, k).trim()] = kv.slice(k + 1).trim(); }
    if (!o.人物 || o.类型 || o.标题) continue;   // 带类型 / 标题的是事态标签
    found.push([m.index, clean(o.人物), clean((o.层 && !(o.地点 || '').includes(o.层) ? o.层 + '·' : '') + (o.地点 || ''))]);
  }
  return found.sort((a, b) => a[0] - b[0]).filter(([, n, p]) => n && p).slice(0, MAX_TAGS_PER_FLOOR).map(([, name, place]) => ({ name, place }));
}

/** MVU stat_data → [{name, place}]；here = 玩家当前地点（在场表的人放在这里） */
export function mvuChars(stat, here, presentPath = '') {
  const out = [], first = String(here || '').split(/\s*[\/／|｜]\s*/)[0].trim();
  if (!stat || typeof stat !== 'object') return out;
  const pres = presentList(stat, presentPath), done = new Set();
  for (const p of pres || []) { done.add(p.name); if (p.place) out.push({ name: p.name, place: p.place }); else if (first) out.push({ name: p.name, place: first, present: true }); }
  for (const [tk, tbl] of Object.entries(stat)) {
    if (!tbl || typeof tbl !== 'object' || Array.isArray(tbl) || tk === '世界') continue;
    for (const [name, o] of Object.entries(tbl)) {
      if (done.has(clean(name))) continue;
      if (!o || typeof o !== 'object' || Array.isArray(o) || !clean(name) || [...name].length > 40) continue;
      const k = LOC_KEYS.find(k => typeof o[k] === 'string' && o[k].trim());
      const person = PEOPLE.test(tk) || PERSONISH.some(f => f in o);   // 只认人物表（或行里有人物字段）；物品 / 势力表带「位置」也不当人物
      if (k && person) out.push({ name: clean(name), place: clean(o[k]) });
      else if (PRESENT.test(tk) && first) out.push({ name: clean(name), place: first, present: true });
    }
  }
  return out;
}

/** 最近若干楼 [{floor, text}] + MVU（最新楼的状态）→ 每人最新位置 [{name, place, floor, src: 'mvu'|'tag'|'infer', present?}]，新的在前 */
export function collectChars(msgs, now, mvu = []) {
  const map = new Map();
  for (const { floor, text } of msgs) for (const c of parseChars(text)) map.set(c.name, { ...c, floor, src: 'tag' });
  for (const c of mvu) {   // MVU 是最新楼的状态：写了位置就以它为准；在场但没写位置时，有近期标签（≤ 20 楼）用标签，否则推断为和玩家同处
    if (c.present && map.has(c.name) && now - map.get(c.name).floor <= PRESENT_TAG_FRESH) continue;
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
export const colorOf = name => `hsl(${CHAR_HUES[fnv(String(name)) % CHAR_HUES.length]} 58% 46%)`;
/** 头像框里的字：中文取第一个字，西文取首字母（最多两个） */
export function initials(name) {
  const s = clean(name); if (!s) return '?';
  if (/^[A-Za-z]/.test(s)) return s.split(/[\s·.\-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return [...s][0];
}

/** 注入给模型的一句：最多 8 人，和玩家同处的合成一项。没有人物返回 '' */
export function summarizeChars(items, max = 8, maxLen = 160, now = null) {
  const list = items.filter(c => now == null || c.present || now - c.floor <= INJECT_FRESH).slice(0, max); if (!list.length) return '';
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
const okImg = s => typeof s === 'string' && s.length <= 400000 && /^(data:image\/(png|jpe?g|webp|gif);base64,|https?:\/\/|blob:)/i.test(s);
export function setAvatar(st, chat, name, src) {
  name = clean(name); if (!name || [...name].length > 40 || !okImg(src)) return false;
  const k = avatarKey(chat), o = readJ(st, k) || {}; o[name] = src;
  try { st.setItem(k, JSON.stringify(o)); return true; } catch (e) { return false; }
}
export function removeAvatar(st, chat, name) {
  name = clean(name); const k = avatarKey(chat), o = readJ(st, k) || {};
  if (!(name in o)) return false; delete o[name];
  try { Object.keys(o).length ? st.setItem(k, JSON.stringify(o)) : st.removeItem(k); return true; } catch (e) { return false; }
}
export function readCharPrefs(st, chat) { const o = readJ(st, charPrefKey(chat)) || {}; return { show: o.show !== false, off: Array.isArray(o.off) ? o.off.filter(x => typeof x === 'string') : [] }; }
export function writeCharPrefs(st, chat, p) { try { st.setItem(charPrefKey(chat), JSON.stringify({ show: !!p.show, off: [...new Set(p.off)] })); return true; } catch (e) { return false; } }
