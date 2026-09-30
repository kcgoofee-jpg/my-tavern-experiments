// NPC 日常漫游 / 日程（Part 5-3 的纯计算，2026-09-30 下沉到 core：三维 / 二维前端都要按同一张日程表挪人，
// 而 core 不许回引 map/tavern/，所以这份数学放在共享的叶子层；宿主侧 map/tavern/routine.mjs 原样转发）。
// 配置口径（包数据 manifest.data.routine 指向的 JSON，或聊天变量）：
//   { "默认": "书房", "人物": { "名字或id": [ { "从": "08:00", "到": "12:00", "在": "书房" }, … ] } }
// 键名兼容英文（default / npc / from / to / at）。纯函数、无依赖；node 单测 tests/routine.test.mjs / walk.test.mjs。
import { normClock, MIN_PER_DAY } from './clock.mjs';

const minuteOf = t => {
  const m = String(t ?? '').trim().match(/^(\d{1,2})[:：点时](\d{1,2})?/);
  if (!m) return null;
  const h = +m[1], mm = m[2] ? +m[2] : 0;
  if (h > 24 || mm > 59) return null;
  return (h * 60 + mm) % 1440;
};
export { minuteOf };   // 世界时刻（HH:MM）换算成分钟用
const VAL = (o, ...keys) => { for (const k of keys) if (o && o[k] !== undefined) return o[k]; return undefined; };

/**
 * 日程表规范化：坏行丢弃；跨零点的段（从 22:00 到 06:00）拆成两段。返回 { default, byName }。
 * 两种写法都收（包数据文件只允许 ASCII 键，所以用数组那一种）：
 *   对象：{ "人物": { "名字": [ { "从": "08:00", "到": "12:00", "在": "书房" } ] } }
 *   数组：{ "npcs": [ { "name": "名字", "slots": [ { "from": "08:00", "to": "12:00", "at": "书房" } ] } ] }
 */
export function normSchedule(cfg) {
  const src = cfg && typeof cfg === 'object' ? cfg : {};
  const byName = {};
  const raw = VAL(src, '人物', 'npc', 'byName', 'npcs');
  const npcs = Array.isArray(raw) ? raw.flatMap(e => (e && typeof e === 'object' && e.name != null ? [[String(e.name), e.slots]] : [])) : Object.entries(raw || {});
  for (const [name, slots] of npcs) {
    if (!name || !Array.isArray(slots)) continue;
    const out = [];
    for (const s of slots) {
      if (!s || typeof s !== 'object') continue;
      const from = minuteOf(VAL(s, '从', 'from')), to = minuteOf(VAL(s, '到', 'to')), at = String(VAL(s, '在', 'at', 'place') ?? '').trim().slice(0, 60);
      if (from == null || at == null || !at) continue;
      const to2 = to == null ? (from + 120) % 1440 : to;   // 没写「到」：默认两小时
      if (to2 === from) continue;
      if (to2 > from) out.push({ from, to: to2, at });
      else { out.push({ from, to: 1440, at }); out.push({ from: 0, to: to2, at }); }   // 跨零点
    }
    if (out.length) byName[name] = out.sort((a, b) => a.from - b.from);
  }
  const def = String(VAL(src, '默认', 'default') ?? '').trim().slice(0, 60) || null;
  return { default: def, byName };
}

/** 名单里谁现在该在哪：[{ name, place, source: 'routine' }]。known 里已经有位置的（聊天刚写过）不由日程接管——宿主先滤。
 *  schedule 没配该人物 → 按 default（没配默认 = 不出结果）。 */
export function whoWhere(schedule, minute, knownNames = []) {
  const s = schedule && typeof schedule === 'object' && schedule.byName ? schedule : normSchedule(schedule);
  if (!Number.isFinite(+minute)) return [];
  const m = ((+minute % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY, out = [];
  for (const [name, slots] of Object.entries(s.byName)) {
    if (knownNames.includes(name)) continue;   // 聊天 / MVU 已经知道位置：日程不覆盖
    const hit = slots.find(sl => m >= sl.from && m < sl.to);
    const place = hit ? hit.at : s.default;
    if (place) out.push({ name, place, source: 'routine' });
  }
  return out;
}

/** 下一次去向（提示 / 漫游动画用）：{ at, place } 或 null。 */
export function nextMove(schedule, name, minute) {
  const s = schedule && typeof schedule === 'object' && schedule.byName ? schedule : normSchedule(schedule);
  if (!Number.isFinite(+minute)) return null;
  const m = ((+minute % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY, slots = s.byName[name] || [];
  const next = slots.find(sl => sl.from > m);
  return next ? { at: next.from, place: next.at } : (slots.length ? { at: slots[0].from + MIN_PER_DAY, place: slots[0].at } : null);
}

/** 世界时钟（core/clock.mjs 的 { day, min }）→ 当天分钟；与 whoWhere 的 minute 同一个口径 */
export const minuteOfClock = clock => normClock(clock).min;

/** 时钟驱动的落点：whoWhere 的时钟版本（时刻从 { day, min } 取，不再要调用方自己算分钟） */
export const placesAt = (schedule, clock, knownNames = []) => whoWhere(schedule, minuteOfClock(clock), knownNames);
