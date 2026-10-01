// ContextPipeline（P2 解耦第二步，docs/reviews/architecture_and_stream_perf.md §4）：聊天上下文交互流水线。
// 原来 eden-map.js 里的 readMsgs（窗口规范化 + (楼层, 原文) 缓存 + 指纹）、recompute 的轮次计算（事件收集、人物栏、
// 名册、轮次签名、新事态数）、customTags（⌖改名 / ⌖用途的撤销-重放状态机）、computeTrips（行程序列）搬来这里。
//
// 纯数据进出：不碰酒馆全局、不碰 DOM、不发消息、不注入——发送 / 保存 / 提示 / 空闲调度都由宿主拿着返回值自己做。
// 宿主只留调度（RFC §4：去抖、事件接线、restNow 空闲补做、注入与推送）。node 单测直接喂数据（tests/context.test.mjs）。
import { parseText } from './msgtext.mjs';
import { lostTags } from './tabledb-bridge.mjs';
import { sanitize } from './sanitize.mjs';
import * as mvuReaders from './mvu-readers.mjs';

/** 楼层原文指纹（FNV-1a，36 进制）：标签记录 / 楼层指纹用它识别「这一楼原文变了」 */
export const hashText = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// ---------------- 会话快照（Session Replay Fixtures）：纯数据的导出、校验与回放 ----------------
// SessionSnapshot（version 1）形状：
//   { version: 1,
//     meta: { timestamp, characterId?, cardName?, chatId?, floorNow? },
//     mvu: { stat, vars, floors? },   // floors = { [楼层号]: stat_data }：回放 computeTrips 的每楼变量（mvu-bridge dumpState 附带）
//     messages: [{ floor, role, text, raw?, original? }],
//       // text = parseText(raw)（剥思考链 / 变量块后）；raw = 剥 EJS 模板后的完整原文（行程 JSONPatch 用）；
//       // original = 「正文优化」改写前原文（extra._acu_original_content，回放时经 readMsgs 补回丢掉的 ⌖ 标签）
//     state?: { tag? } }              // ⌖ 标签状态机快照（可选：完整恢复 customTags 的撤销-重放水位）
// 导出与回放全是纯函数：不碰全局 / DOM / 异步时序，node 单测直接喂 JSON（tests/session_replay.test.mjs）。
export const SNAPSHOT_VERSION = 1;
const EJS = /<%[\s\S]*?%>/g;

/** 把一个窗口的楼层 + MVU 状态组装成标准 SessionSnapshot。
 *  msgs 的楼层两种都收：宿主原始楼层（getChatMessages：message_id / message / is_user / is_system / extra）
 *  或已规范化的楼层（readMsgs 产物：floor / raw / text，或别的快照的 messages 条目：floor / role / text / raw / original）。 */
export function exportSessionSnapshot({ msgs, stat = null, vars = {}, meta = {}, floors = null, tagState = null } = {}) {
  const messages = (Array.isArray(msgs) ? msgs : []).map(m => {
    if (!m || typeof m !== 'object') return null;
    if (m.message_id != null) {   // 宿主原始楼层：与 readMsgs 同一条规范化路径（补丢标签 → 剥 EJS → 剥思考链 / 变量块）
      let msg = String(m.message || ''); const orig = m.extra?._acu_original_content;
      if (typeof orig === 'string' && orig.includes('⌖')) msg += lostTags(orig, msg);
      const raw = msg.replace(EJS, '');
      return { floor: m.message_id, role: m.is_user ? 'user' : (m.is_system ? 'system' : 'assistant'), text: parseText(raw), raw,
        ...(typeof orig === 'string' && orig.includes('⌖') ? { original: orig } : {}) };
    }
    if (typeof m.text !== 'string' || m.floor == null) return null;   // 已规范化 / 快照条目
    const raw = typeof m.raw === 'string' && m.raw ? m.raw : m.text;
    return { floor: m.floor, role: m.role || 'assistant', text: m.text, raw, ...(m.original ? { original: m.original } : {}) };
  }).filter(Boolean);
  const mvu = { stat: stat ?? null, vars: vars && typeof vars === 'object' ? vars : {} };
  if (floors && typeof floors === 'object' && !Array.isArray(floors)) mvu.floors = floors;
  const out = { version: SNAPSHOT_VERSION, meta: { timestamp: Date.now(), ...(meta && typeof meta === 'object' ? meta : {}) }, mvu, messages };
  if (tagState && typeof tagState === 'object' && !Array.isArray(tagState)) out.state = { tag: tagState };
  return out;
}

/** 快照体检：{ ok, errors }。只报告不抛——回放侧拿它做降级决策（畸形快照能救多少救多少）。 */
export function validateSessionSnapshot(snap) {
  const errors = [];
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return { ok: false, errors: ['snapshot is not an object'] };
  if (typeof snap.version !== 'number') errors.push('version is not a number');
  else if (snap.version !== SNAPSHOT_VERSION) errors.push(`unsupported version ${snap.version}`);
  if (!Array.isArray(snap.messages)) errors.push('messages is not an array');
  else snap.messages.forEach((m, i) => {
    if (!m || typeof m !== 'object') { errors.push(`messages[${i}] is not an object`); return; }
    const f = Number(m.floor);
    if (!Number.isFinite(f) || f < 0) errors.push(`messages[${i}].floor is not a valid floor`);
    if (typeof m.text !== 'string') errors.push(`messages[${i}].text is not a string`);
  });
  if (snap.mvu !== undefined && (!snap.mvu || typeof snap.mvu !== 'object' || Array.isArray(snap.mvu))) errors.push('mvu is not an object');
  return { ok: errors.length === 0, errors };
}

/** 快照 → computeTrips 的 perFloorStat 回调：每楼变量表命中优先；建了表但没有那一楼 → null（走原文 JSONPatch 兜底）；
 *  没建表 → 整局 stat。 */
export function perFloorStatOf(snap) {
  const floors = snap?.mvu?.floors;
  return floor => (floors && typeof floors === 'object' && floor in floors ? floors[floor] ?? null : floors ? null : snap?.mvu?.stat ?? null);
}

export class ContextPipeline {
  constructor({ scan = 80, stripTags = null } = {}) {
    this.SCAN = scan;             // 窗口楼数：未解除的事件在窗口内一直列出（events.mjs tierOf）
    this.stripTags = stripTags;   // 社区预设净化（Part 7）：要剥的块标签表；null / 空 = 不剥（msgtext 的 think / UpdateVariable 惯例不受影响）
    this.msgCache = new Map();    // A-3：(楼层, 原文) 缓存 { msg, tags, m: { floor, raw, text, h }, trip?, tripKey? }
    this.roundSig = ''; this.lastMsgs = [];
    // 剧情标签状态（持久化在聊天变量 eden_map.标签楼 / 标签记录 / 楼层指纹；loadCustom 整块换入）
    this.tag = { floor: -1, log: [], seen: {} };
    this.trips = []; this.tripSig = '';   // 行程与它的签名（saveRoot 读 trips）
  }

  /** 宿主把楼层列表（getChatMessages 的原文）递进来，这里规范化 + 缓存 → [{ floor, raw, text, h }]。
   *  text 剥思考链与变量更新块（msgtext.mjs，G1）；raw 留给行程的 JSONPatch、变量提取用完整原文。
   *  先剥社区预设块（sanitize.mjs，标签表在构造时给；换标签表缓存跟着失效），再剥 EJS。
   *  extra._acu_original_content = 数据库插件「正文优化」改写前的原文：丢掉的 ⌖ 标签从原文补回（只补标签，不动正文）。 */
  readMsgs(list, lastId) {
    let out = [];
    const tagKey = Array.isArray(this.stripTags) && this.stripTags.length ? this.stripTags.join(',') : '';
    if (Array.isArray(list) && lastId >= 0) out = list.map(m => {
      let msg = String(m.message || ''); const c0 = m.extra?._acu_original_content;
      if (typeof c0 === 'string' && c0.includes('⌖')) msg += lostTags(c0, msg);
      const c = this.msgCache.get(m.message_id);
      if (c && c.msg === msg && c.tags === tagKey) return c.m;
      const raw = (tagKey ? sanitize(msg, this.stripTags) : msg).replace(EJS, '');   // 原文里可能还留着 EJS 模板源码，里面的示例标签不算事件
      const e = { msg, tags: tagKey, m: { floor: m.message_id, raw, text: parseText(raw) } };
      e.m.h = hashText(e.m.text) + (raw.length !== e.m.text.length ? '.' + hashText(raw) : '');
      this.msgCache.set(m.message_id, e); return e.m;
    });
    if (this.msgCache.size > this.SCAN * 2) { const keep = new Set(out.map(m => m.floor)); for (const k of this.msgCache.keys()) if (!keep.has(k)) this.msgCache.delete(k); }
    return out;
  }

  /** 一轮重算的纯计算部分。d = { floorNow, msgs, stSig, dbSig, varSig, custVer, customChat, chatId, seen, wbState,
   *      hasReg, hasCHM, hasMV, hasTRm, hasHereMod, hereNow, collect（events.mjs collect）, charsDeps? }
   *  charsDeps = { mvuChars（CHM.mvuChars 的结果）, known, dbCharacters, collectChars, rosters, reputation, presentKey }。
   *  轮次签名没变 → { changed:false }；变了 → { events, chars, roster, rep, fresh }（fresh = 未读的活跃事件数）。 */
  round(d) {
    const { floorNow, msgs, stSig, dbSig, varSig, custVer, customChat, chatId, seen, wbState, hasReg, hasCHM, hasMV, hasTRm, hasHereMod, hereNow, collect } = d;
    const sig = [floorNow, msgs.map(m => m.floor + ':' + m.h).join(), stSig, dbSig, varSig, custVer, customChat, chatId, seen, wbState, hasReg, hasCHM, hasMV, hasTRm, hasHereMod, hereNow].join('|');
    if (sig === this.roundSig) return { changed: false, sig };
    this.roundSig = sig; this.lastMsgs = msgs;
    const events = collect(msgs, floorNow);
    const out = { changed: true, sig, events, chars: null, roster: null, rep: null, fresh: events.filter(e => e.last > seen && e.tier !== 'fade').length };
    if (d.charsDeps) {   // 人物栏（v0.9.2）：标签 + MVU 位置 + 数据库插件人物表 → 每人最新位置
      const { mvuChars, known, dbCharacters, collectChars, rosters, reputation, presentKey } = d.charsDeps;
      const mc = [...mvuChars];
      for (const c of dbCharacters) if (!mc.some(x => x.name === c.name)) mc.push(c);   // 数据库插件人物表里的位置（只读，MVU 优先）
      // 在场表最后一次更新在哪一楼：扫窗口内各楼的变量更新块（raw 保留了 UpdateVariable）里有没有提到在场表名；从没提过 = 至少整个窗口没变（2026-09-28 待查 2）
      let presentFloor = Infinity;
      if (presentKey) { presentFloor = -1; for (const m of msgs) if (m.raw && m.raw.includes(presentKey)) presentFloor = m.floor; if (presentFloor < 0) presentFloor = msgs.length ? msgs[0].floor - 1 : floorNow; }
      out.chars = collectChars(msgs, floorNow, mc, known, presentFloor);
      out.roster = rosters; out.rep = reputation;
    }
    return out;
  }

  /** ⌖改名 / ⌖用途（v0.9.3）：某一楼原文变了（重 roll / 编辑 / 删楼）先倒序撤销那一楼用过的标签，再按新原文重扫比 标签楼 新的楼。
   *  返回 null（没动）或 { custom, tag, applied, undone }——提示与保存由宿主做（有应用 / 撤销才 customChanged，否则只 saveRoot）。
   *  kindOf(key) = 这个名字算人物 / 房间 / 区域 / 地标（宿主拿人物栏与注册表判）。 */
  customTags(custom, msgs, floorNow, kindOf) {
    const tag = this.tag;
    if (!custom) return null;
    if (floorNow >= 0 && floorNow < tag.floor) tag.floor = floorNow;   // 删过楼：之后的新楼照常处理
    const lo = msgs.length ? msgs[0].floor : Infinity, have = new Map(msgs.map(m => [m.floor, m.text]));
    const changed = new Set(Object.keys(tag.seen).map(Number).filter(f => f >= lo && f <= tag.floor && hashText(have.get(f) ?? '') !== tag.seen[f]));
    let dirty = false, undone = 0;
    if (changed.size) {
      for (const r of tag.log.filter(r => changed.has(r.floor)).reverse()) {   // 倒序撤销：同一项被改过两次时回到最早的值
        const nx = mvuReaders.setCustom(custom, r.key, r.op === 'name' ? { name: r.prev || '' } : { note: r.prev || '' }); if (nx) { custom = nx; undone++; } }
      tag.log = tag.log.filter(r => !changed.has(r.floor)); dirty = true;
    }
    const todo = msgs.filter(m => changed.has(m.floor) || m.floor > tag.floor);
    const applied = [];
    for (const m of todo) {
      const before = mvuReaders.normCustom(custom), r = mvuReaders.applyTags(custom, [m], m.floor - 1, kindOf);
      for (const a of r.applied) { const e = before.items[a.key] || {}; tag.log.push({ floor: a.floor, key: a.key, op: a.op, prev: a.op === 'name' ? e.名 || '' : e.用途 || '' }); before.items[a.key] = { ...e, [a.op === 'name' ? '名' : '用途']: a.value }; }
      custom = r.custom; applied.push(...r.applied); tag.seen[m.floor] = hashText(m.text); dirty = true;
    }
    for (const f of changed) if (!have.has(f)) delete tag.seen[f];
    if (!dirty) return null;
    tag.floor = Math.max(tag.floor, ...todo.map(m => m.floor));
    tag.log = tag.log.slice(-30); const keep = Object.keys(tag.seen).map(Number).sort((a, b) => b - a).slice(0, 100); tag.seen = Object.fromEntries(keep.map(f => [f, tag.seen[f]]));
    return { custom, tag: { floor: tag.floor, log: [...tag.log], seen: { ...tag.seen } }, applied, undone };
  }

  /** 行程（v0.9.5）：最近 30 楼每楼的地点（那一楼的变量，拿不到就读原文里的 JSONPatch）+ 人物标签 → 最近 5 段（玩家、人物各 5）。
   *  d = { tripsParseModule, CHM?, perFloorStat(floor), mvuGet(st, path), varMap, keywords, fantasy, parseTransit(s) }。
   *  每楼的解析结果按 (楼层, 原文) 缓存在 msgCache 条目上（key 变了才重算）。返回 { changed, trips }。 */
  computeTrips(msgs, d) {
    const { tripsParseModule, CHM, perFloorStat, mvuGet, varMap, keywords, fantasy, parseTransit } = d;
    const loc = String(varMap.location || ''), lp = loc ? '/' + loc.split('.').join('/') : '', recentMsgs = msgs.slice(-30), seq = [], tags = [];
    for (const m of recentMsgs) {
      const e = this.msgCache.get(m.floor), key = lp + '|' + varMap.time + '|' + !!CHM;   // 按映射与人物栏开关缓存
      if (!e?.trip || e.tripKey !== key || e.m !== m) {
        const st = perFloorStat(m.floor);
        const place = String(mvuGet(st, varMap.location) ?? '').trim() || tripsParseModule.patchPlace(m.raw || m.text, lp), text = m.text.slice(0, 4000);
        const trip = { seq: { floor: m.floor, place, text, time: String(mvuGet(st, varMap.time) ?? '') }, tags: CHM ? CHM.parseChars(m.text).map(c => ({ floor: m.floor, name: c.name, place: c.place, text })) : [] };
        if (!e || e.m !== m) { seq.push(trip.seq); tags.push(...trip.tags); continue; }
        e.trip = trip; e.tripKey = key;
      }
      seq.push(e.trip.seq); tags.push(...e.trip.tags);
    }
    const next = tripsParseModule.recent([...tripsParseModule.playerTrips(seq, parseTransit, keywords), ...tripsParseModule.charTrips(tags, keywords)], 5);
    const sig = JSON.stringify(next);
    if (sig === this.tripSig) return { changed: false, trips: this.trips };
    this.tripSig = sig; this.trips = next;
    return { changed: true, trips: next };
  }

  /** 换聊天 / 重置：清行程与标签楼层状态（标签状态随后由 loadCustom 整块换入） */
  reset() { this.roundSig = ''; this.lastMsgs = []; this.trips = []; this.tripSig = ''; }

  /** 从静态 SessionSnapshot 一键恢复流水线（Session Replay）：绕过浏览器与异步时序，把 messages 走一遍
   *  readMsgs（同一条规范化路径：补丢标签 → 剥 EJS → 指纹缓存），可选恢复 ⌖ 标签状态机。
   *  畸形快照不抛：救得动的楼层照常回放，救不动的跳过并记入 degraded（体检明细见 validateSessionSnapshot）。
   *  返回 { pipeline, msgs, degraded }。 */
  static fromSnapshot(snap, opts = {}) {
    const pipeline = new ContextPipeline(opts);
    const v = validateSessionSnapshot(snap);
    if (!snap || typeof snap !== 'object' || !Array.isArray(snap.messages)) return { pipeline, msgs: [], degraded: v.errors };
    const list = [], skipped = [];
    snap.messages.forEach((m, i) => {
      const floor = Number(m?.floor);
      if (!Number.isFinite(floor) || floor < 0 || typeof m?.text !== 'string') { skipped.push(`messages[${i}] skipped`); return; }
      const raw = typeof m.raw === 'string' && m.raw ? m.raw : m.text;
      list.push({ message_id: Math.floor(floor), message: raw, extra: typeof m.original === 'string' ? { _acu_original_content: m.original } : undefined });
    });
    const msgs = pipeline.readMsgs(list, list.length ? list[list.length - 1].message_id : -1);
    if (snap.state?.tag && typeof snap.state.tag === 'object' && !Array.isArray(snap.state.tag)) pipeline.tag = { floor: -1, log: [], seen: {}, ...snap.state.tag };
    return { pipeline, msgs, degraded: [...skipped, ...v.errors.filter(e => !e.startsWith('messages['))] };
  }
}
