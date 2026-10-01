// 脚本 ↔ 卡 交互方式（docs/interaction-modes.md）(a) 紧凑状态注入、(d) 标签对账、(e) 最小检查点。纯函数，node 单测 tests/interaction-modes.test.mjs。
// 只处理「状态字段」（地点、在场、时间、行程），不看、不过滤正文内容；注入只陈述状态，不下指令。

// ---------------- (a) 紧凑状态注入 ----------------
export const STATE_ID = 'eden-map-state';
export const DEFAULTS = { depth: 2, budget: 150 };
/** 粗估 token：中日韩约 1 字 1 token，其余约 4 字符 1 token（和 build_worldbook_addon.py tokens 同一口径） */
export function tokens(s) { let c = 0, o = 0; for (const ch of String(s || '')) { if (/[⺀-鿿＀-￯　-〿]/.test(ch)) c++; else o++; } return c + Math.ceil(o / 4); }
/** 卡自己的提示词里已经有哪些字段（有就不再注入）：文本里引用了 stat_data 的该路径、或 MVU 宏 / getvar 读了它 */
export function cardHas(texts, paths = {}) {
  const all = (texts || []).filter(t => typeof t === 'string').join('\n'); if (!all) return {};
  const refs = p => { if (!p) return false; const segs = String(p).split('.'), last = segs[segs.length - 1];
    return all.includes('stat_data.' + p) || all.includes('stat_data/' + segs.join('/')) || new RegExp(`(get_(?:message|chat)_variable|getvar)[^\\n]{0,40}${last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(all); };
  const whole = /\{\{\s*get_(?:message|chat)_variable::stat_data\s*\}\}|getvar\(\s*['"]stat_data['"]\s*\)/.test(all);   // 整个 stat_data 都进了提示词
  return { here: whole || refs(paths.location), time: whole || refs(paths.time), present: whole || refs(paths.present), trips: false };
}
/**
 * 一行状态：[地图状态] 地点：…；在场：…；时间：…；行程：…
 * s = { here, present: [名字], time, trips: [{ from, to, who?, live? }], state: 'ok' | 'pending' | 'stale' | 'none', skip: cardHas 的结果 }
 * 数据没确认（pending / stale）时来自快照的字段后面标「未确认」；超预算先砍行程、再砍在场名单，地点永远保留。
 */
export function stateLine(s, budget = DEFAULTS.budget) {
  const sk = s.skip || {}, unsure = s.state === 'pending' || s.state === 'stale', U = unsure ? '（未确认）' : '';
  const here = String(s.here || '').trim(), time = String(s.time || '').trim();
  const present = [...new Set((s.present || []).map(x => String(x || '').trim()).filter(Boolean))];
  const trips = (s.trips || []).filter(t => t && t.to).slice(-3).reverse();
  const tripTxt = t => `${t.who ? t.who + '：' : ''}${t.from || '?'}→${t.to}${t.live ? '（途中）' : ''}`;
  const build = (np, nt) => {
    const parts = [];
    if (here && !sk.here) parts.push(`地点：${here}${U}`);
    if (np && present.length && !sk.present) parts.push(`在场：${present.slice(0, np).join('、')}${present.length > np ? ` 等${present.length}人` : ''}${U}`);
    if (time && !sk.time) parts.push(`时间：${time}${U}`);
    if (nt && trips.length && !sk.trips) parts.push(`行程：${trips.slice(0, nt).map(tripTxt).join('；')}`);
    return parts.length ? '[地图状态] ' + parts.join('；') : '';
  };
  let np = Math.min(present.length, 8), nt = trips.length, line = build(np, nt);
  while (tokens(line) > budget && nt > 0) line = build(np, --nt);
  while (tokens(line) > budget && np > 1) line = build(--np, nt);
  if (tokens(line) > budget) line = build(0, 0);
  if (tokens(line) > budget) line = [...line].slice(0, budget).join('');
  return line;
}
/** 注入对象：固定 id（重生 / swipe / 重载都覆盖同一条，不叠）；in_chat 固定深度；不参与世界书扫描 */
export function statePrompt(content, depth = DEFAULTS.depth) {
  return { id: STATE_ID, position: 'in_chat', depth: Math.max(0, Math.min(20, Math.round(+depth) || 0)), role: 'system', content, should_scan: false };
}
/** 写进酒馆：先撤同 id 再注入（空内容 = 只撤）。fn = 取 TH 接口 */
export function applyState(fn, content, depth) {
  const un = fn('uninjectPrompts'), inj = fn('injectPrompts'); if (!inj) return false;
  try { un?.([STATE_ID]); if (content) inj([statePrompt(content, depth)]); return true; } catch (e) { return false; }
}
/**
 * 这一轮生成该用哪一楼的状态：
 * - 普通发送（最后一楼是用户楼）：pickStat(最后一楼)；
 * - swipe / 重新生成（最后一楼是要被替换的助手楼）：它的变量是旧回复写的，不能当「生成前的状态」→ 从前一楼往前找。
 * pick = mvu-snapshot.mjs pickStat 同签名。
 */
export function snapFor(pick, readFloor, lastId, { type = 'normal', generating = false } = {}) {
  const last = readFloor(lastId);
  const replacing = (type === 'swipe' || type === 'regenerate') && last && last.role === 'assistant';
  void generating;   // 选的是「生成前」已提交的状态，不因正在生成而标 pending
  return pick(readFloor, replacing ? lastId - 1 : lastId, { generating: false });
}

// ---------------- (d) 标签对账 ----------------
// 两份数据由宿主装入（configure，tavern/event-geo-load.mjs）：世界书里的写法模板（设定包 llm["x-tag-examples"]，不当作真地点）；地点开头的大区名（各组在世界图上的地点名，比较时去掉）
let EX = new Set(), PFX = [];
const lines = v => (Array.isArray(v) ? v.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()) : []);
export function configure({ examples, prefixes } = {}) {
  EX = new Set(lines(examples));
  PFX = [...new Set(lines(prefixes).map(s => s.replace(SEP, '')).filter(Boolean))].sort((a, b) => b.length - a.length);
}
const SEP = /[\s·・.\-—_/／|｜]/g;
const clean = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
/** 一楼原文里明确写的玩家当前地点：⌖地点 X（隐藏 span 或裸写）、或 data-tcmap="地点=…"（不带 人物 / 类型 / 标题）；取最后一个 */
export function parseHereTag(raw) {
  if (!raw || (raw.indexOf('⌖地点') < 0 && raw.indexOf('地点=') < 0)) return null;
  const text = String(raw).replace(/```[\s\S]*?```/g, ''); let best = null;
  for (const m of text.matchAll(/⌖地点[\s:：]+([^<\n⌖，。；,;！？!?]{1,60})/g)) { const p = clean(m[1]); if (p && !EX.has(p)) best = [m.index, p]; }
  for (const m of text.matchAll(/data-tcmap\s*=\s*(["'])(.*?)\1/g)) {
    const o = {}; for (const kv of m[2].split(/[;；]/)) { const k = kv.search(/[=＝]/); if (k > 0) o[kv.slice(0, k).trim()] = kv.slice(k + 1).trim(); }
    if (!o.地点 || o.人物 || o.类型 || o.标题) continue; const p = clean((o.层 && !o.地点.includes(o.层) ? o.层 + '·' : '') + o.地点);
    if (p && !EX.has(p) && (!best || m.index > best[0])) best = [m.index, p];
  }
  return best ? best[1] : null;
}
const norm = s => { const x = clean(s).replace(SEP, ''), p = PFX.find(q => x.startsWith(q)); return p ? x.slice(p.length) : x; };
/** 两个地点说的是不是一处：规范化后一个包含另一个 */
export const samePlace = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };
/**
 * MVU 为准：mvu = { place, state }（state 同 pickStat），tag = 本楼正文标签地点或 null
 * → { place, source: 'mvu' | 'tag' | 'none', conflict: null | { mvu, tag } }
 */
export function reconcile(mvu, tag) {
  const mp = clean(mvu?.place), ok = mvu?.state === 'ok' || mvu?.state === undefined;
  if (mp && ok) return { place: mp, source: 'mvu', conflict: tag && !samePlace(mp, tag) ? { mvu: mp, tag } : null };
  if (tag) return { place: tag, source: 'tag', conflict: null };   // 本楼 MVU 没有快照（pending / stale / none）：用正文明确写的
  return { place: mp, source: mp ? 'mvu' : 'none', conflict: null };
}
/** 最近几楼里 MVU 与标签不一致的楼：floors = [{ floor, mvu: 那一楼的地点, raw }] → [{ floor, mvu, tag }]（最多 max 条，新的在后） */
export function conflicts(floors, max = 10) {
  const out = []; for (const f of floors || []) { const t = parseHereTag(f.raw); if (t && f.mvu && !samePlace(f.mvu, t)) out.push({ floor: f.floor, mvu: clean(f.mvu), tag: t }); }
  return out.slice(-max);
}

// ---------------- (e) 最小检查点 ----------------
/** 只在「确认过」（ok 且快照就在最新楼）时前进；内容没变返回原对象（调用方据此不写，幂等） */
export function nextCheckpoint(prev, { floor, top, swipe, state }) {
  if (state !== 'ok' || floor !== top || !Number.isInteger(floor) || floor < 0) return prev || null;
  const sw = Number.isInteger(swipe) ? swipe : 0;
  if (prev && prev.楼 === floor && prev.swipe === sw) return prev;
  return { 楼: floor, swipe: sw };
}
/**
 * 启动时对照检查点（readFloor(i) → { swipe, hasStat, role } | null）：
 * - match：那一楼还在、swipe 没变，之后没有缺快照的新楼；
 * - ahead：之后有新楼还没有快照（被杀在生成 / 解析中途）→ 按「未确认」显示，从聊天记录重推；
 * - swiped：那一楼换了 swipe；missing：那一楼没了（删楼 / 分支）→ 检查点作废，重推；
 * - none：没有检查点。
 */
export function resume(cp, readFloor, lastId) {
  if (!cp || !Number.isInteger(cp.楼)) return { reason: 'none', floor: -1 };
  const f = readFloor(cp.楼);
  if (!f) return { reason: 'missing', floor: cp.楼 };
  if ((f.swipe ?? 0) !== (cp.swipe ?? 0)) return { reason: 'swiped', floor: cp.楼 };
  for (let i = lastId; i > cp.楼; i--) { const g = readFloor(i); if (g && g.role === 'assistant' && !g.hasStat) return { reason: 'ahead', floor: cp.楼 }; }
  return { reason: 'match', floor: cp.楼 };
}
