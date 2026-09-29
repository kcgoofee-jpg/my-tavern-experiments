// ContextPipeline（P2 解耦第二步，docs/reviews/architecture_and_stream_perf.md §4）：聊天上下文交互流水线。
// 原来 eden-map.js 里的 readMsgs（窗口规范化 + (楼层, 原文) 缓存 + 指纹）、recompute 的轮次计算（事件收集、人物栏、
// 名册、轮次签名、新事态数）、customTags（⌖改名 / ⌖用途的撤销-重放状态机）、computeTrips（行程序列）搬来这里。
//
// 纯数据进出：不碰酒馆全局、不碰 DOM、不发消息、不注入——发送 / 保存 / 提示 / 空闲调度都由宿主拿着返回值自己做。
// 宿主只留调度（RFC §4：去抖、事件接线、restNow 空闲补做、注入与推送）。node 单测直接喂数据（tests/context.test.mjs）。
import { parseText } from './msgtext.mjs';
import { lostTags } from './shujuku.mjs';
import * as MV from './mvu.mjs';

/** 楼层原文指纹（FNV-1a，36 进制）：标签记录 / 楼层指纹用它识别「这一楼原文变了」 */
export const hashText = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

export class ContextPipeline {
  constructor({ scan = 80 } = {}) {
    this.SCAN = scan;             // 窗口楼数：未解除的事件在窗口内一直列出（events.mjs tierOf）
    this.msgCache = new Map();    // A-3：(楼层, 原文) 缓存 { msg, m: { floor, raw, text, h }, trip?, tripKey? }
    this.roundSig = ''; this.lastMsgs = [];
    // 剧情标签状态（持久化在聊天变量 eden_map.标签楼 / 标签记录 / 楼层指纹；loadCustom 整块换入）
    this.tag = { floor: -1, log: [], seen: {} };
    this.trips = []; this.tripSig = '';   // 行程与它的签名（saveRoot 读 trips）
  }

  /** 宿主把楼层列表（getChatMessages 的原文）递进来，这里规范化 + 缓存 → [{ floor, raw, text, h }]。
   *  text 剥思考链与变量更新块（msgtext.mjs，G1）；raw 留给行程的 JSONPatch、变量提取用完整原文。
   *  extra._acu_original_content = 数据库插件「正文优化」改写前的原文：丢掉的 ⌖ 标签从原文补回（只补标签，不动正文）。 */
  readMsgs(list, lastId) {
    let out = [];
    if (Array.isArray(list) && lastId >= 0) out = list.map(m => {
      let msg = String(m.message || ''); const c0 = m.extra?._acu_original_content;
      if (typeof c0 === 'string' && c0.includes('⌖')) msg += lostTags(c0, msg);
      const c = this.msgCache.get(m.message_id);
      if (c && c.msg === msg) return c.m;
      const raw = msg.replace(/<%[\s\S]*?%>/g, '');   // 原文里可能还留着 EJS 模板源码，里面的示例标签不算事件
      const e = { msg, m: { floor: m.message_id, raw, text: parseText(raw) } };
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
        const nx = MV.setCustom(custom, r.key, r.op === 'name' ? { name: r.prev || '' } : { note: r.prev || '' }); if (nx) { custom = nx; undone++; } }
      tag.log = tag.log.filter(r => !changed.has(r.floor)); dirty = true;
    }
    const todo = msgs.filter(m => changed.has(m.floor) || m.floor > tag.floor);
    const applied = [];
    for (const m of todo) {
      const before = MV.normCustom(custom), r = MV.applyTags(custom, [m], m.floor - 1, kindOf);
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
   *  d = { TRm, CHM?, perFloorStat(floor), mvuGet(st, path), varMap, keywords, fantasy, parseTransit(s) }。
   *  每楼的解析结果按 (楼层, 原文) 缓存在 msgCache 条目上（key 变了才重算）。返回 { changed, trips }。 */
  computeTrips(msgs, d) {
    const { TRm, CHM, perFloorStat, mvuGet, varMap, keywords, fantasy, parseTransit } = d;
    const lp = '/' + String(varMap.location || '世界.当前地点').split('.').join('/'), recentMsgs = msgs.slice(-30), seq = [], tags = [];
    for (const m of recentMsgs) {
      const e = this.msgCache.get(m.floor), key = lp + '|' + varMap.time + '|' + !!CHM;   // 按映射与人物栏开关缓存
      if (!e?.trip || e.tripKey !== key || e.m !== m) {
        const st = perFloorStat(m.floor);
        const place = String(mvuGet(st, varMap.location) ?? '').trim() || TRm.patchPlace(m.raw || m.text, lp), text = m.text.slice(0, 4000);
        const trip = { seq: { floor: m.floor, place, text, time: String(mvuGet(st, varMap.time) ?? '') }, tags: CHM ? CHM.parseChars(m.text).map(c => ({ floor: m.floor, name: c.name, place: c.place, text })) : [] };
        if (!e || e.m !== m) { seq.push(trip.seq); tags.push(...trip.tags); continue; }
        e.trip = trip; e.tripKey = key;
      }
      seq.push(e.trip.seq); tags.push(...e.trip.tags);
    }
    const next = TRm.recent([...TRm.playerTrips(seq, parseTransit, keywords), ...TRm.charTrips(tags, keywords)], 5);
    const sig = JSON.stringify(next);
    if (sig === this.tripSig) return { changed: false, trips: this.trips };
    this.tripSig = sig; this.trips = next;
    return { changed: true, trips: next };
  }

  /** 换聊天 / 重置：清行程与标签楼层状态（标签状态随后由 loadCustom 整块换入） */
  reset() { this.roundSig = ''; this.lastMsgs = []; this.trips = []; this.tripSig = ''; }
}
