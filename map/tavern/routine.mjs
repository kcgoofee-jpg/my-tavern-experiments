// NPC 日常漫游 / 日程模拟（Part 5-3）纯核心：Pack 配置里给 NPC 一张时间日程表，聊天没提到他们时，
// 人物栏与地图也按「现在的时刻」把他们放在该在的地方（漫游感）。时刻取 MVU 世界时间（宿主传分钟数）。
// 配置口径（包数据 manifest.data.routine 指向的 JSON，或聊天变量）：
//   { "默认": "书房", "人物": { "名字或id": [ { "从": "08:00", "到": "12:00", "在": "书房" }, … ] } }
// 键名兼容英文（default / npc / from / to / at）。纯函数、无依赖；node 单测 tests/routine.test.mjs。

const minuteOf = t => {
  const m = String(t ?? '').trim().match(/^(\d{1,2})[:：点时](\d{1,2})?/);
  if (!m) return null;
  const h = +m[1], mm = m[2] ? +m[2] : 0;
  if (h > 24 || mm > 59) return null;
  return (h * 60 + mm) % 1440;
};
export { minuteOf };   // 宿主把 MVU 世界时刻（HH:MM）换算成分钟用
const VAL = (o, ...keys) => { for (const k of keys) if (o && o[k] !== undefined) return o[k]; return undefined; };

/** 日程表规范化：坏行丢弃；跨零点的段（从 22:00 到 06:00）拆成两段。返回 { default, byName }。 */
export function normSchedule(cfg) {
  const src = cfg && typeof cfg === 'object' ? cfg : {};
  const byName = {};
  const npcs = VAL(src, '人物', 'npc', 'byName') || {};
  for (const [name, slots] of Object.entries(npcs)) {
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
  const m = ((+minute % 1440) + 1440) % 1440, out = [];
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
  const m = ((+minute % 1440) + 1440) % 1440, slots = s.byName[name] || [];
  const next = slots.find(sl => sl.from > m);
  return next ? { at: next.from, place: next.at } : (slots.length ? { at: slots[0].from + 1440, place: slots[0].at } : null);
}
