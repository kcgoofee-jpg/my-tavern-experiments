// 动态线索 / 任务节点（Part 6-3，后台静默推演的一半）：不编势力、不编剧情——
// 只把已经发生的事态（map/tavern/events.mjs 的九大类）按地点聚起来、按楼层差衰减，
// 冒头的地点在地图上给一枚「线索」节点：玩家没被明说也看得出哪里正在出事。
// 零 Token、确定性：同一 (事态, 楼层, 日, 种子) 永远得到同一批节点（回放与截图对拍靠这条）。
// 纯核心：不碰 DOM / 存储 / 酒馆全局（机检见 tools/check_architecture.py）。
import { seedOf } from './rng.mjs';

/** 大类 → 权重（与 events.mjs 的九大类同一张表；「其他」最轻） */
export const SEVERITY = { 灾害: 3, 军事: 3, 治安: 2.5, 空防: 2, 政治: 2, 气候: 1.5, 媒体: 1, 民生: 1, 人物: 1, 其他: 1 };
/** 楼层差衰减（与 events.mjs AGE 同口径：≤7 活跃、≤20 余波、≤40 淡出、再远不算） */
export const DECAY = [[7, 1], [20, .6], [40, .25]];
export const decayOf = d => { const f = Math.max(0, Number(d) || 0); for (const [n, w] of DECAY) if (f <= n) return w; return 0; };
export const severityOf = g => SEVERITY[g] ?? SEVERITY.其他;

/** 地点热度：事态按「地点名出现在事件文本里」归到地点，权重 × 衰减累加；返回 { 名: 热度 } */
export function heatOf(events, { floor = 0, places = [] } = {}) {
  const out = {};
  const names = places.map(p => String(p?.name || '')).filter(Boolean);
  for (const e of Array.isArray(events) ? events : []) {
    if (!e) continue;
    const w = severityOf(e.grp || e.group) * decayOf(Math.max(0, (Number(floor) || 0) - (Number(e.floor) ?? Number(floor) ?? 0)));
    if (!w) continue;
    const txt = [e.place, e.title, e.sub, e.at].filter(Boolean).join(' ');
    for (const n of names) if (n && txt.includes(n)) out[n] = (out[n] || 0) + w;
  }
  return out;
}

/**
 * 派发节点：[{ id, name, nx, ny, heat, urgency, expireDay, ev }]。
 * 热度 ≥ min 的地点按热度取前 max 个；urgency 归一到 (0,1]（= 热度 / 最高热度），expireDay = 当天 + 2…4 天。
 * 没有够热的地点就是空数组——没有线索不许硬造。
 */
export function dispatch({ events = [], places = [], floor = 0, day = 0, seed = 1, max = 3, min = 1.5 } = {}) {
  const heat = heatOf(events, { floor, places });
  const list = (Array.isArray(places) ? places : [])
    .filter(p => p && (heat[p.name] || 0) >= Number(min))
    .sort((a, b) => heat[b.name] - heat[a.name] || String(a.name).localeCompare(String(b.name)))
    .slice(0, Math.max(0, Number(max) || 0));
  const top = heat[list[0]?.name] || 1;
  return list.map((p, i) => ({
    id: `q:${Number(day) || 0}:${seedOf(String(p.name), seed)}`,
    name: String(p.name), nx: Number(p.nx) || 0, ny: Number(p.ny) || 0,
    heat: Math.round((heat[p.name] || 0) * 100) / 100,
    urgency: Math.max(.05, Math.min(1, (heat[p.name] || 0) / top)),
    expireDay: (Number(day) || 0) + 2 + (i % 3),
    ev: list.length,
  }));
}

/** 过期的丢掉（世界在走，旧线索不该永远挂在地图上） */
export const expire = (list, day) => (Array.isArray(list) ? list : []).filter(q => Number(q?.expireDay) >= Number(day));

/**
 * 一次后台推进：合并「没过期的旧节点」与「这一天新派发的」（同 id 不重复），
 * 返回 { quests, added, expired }——宿主 / 查看器拿它做增量渲染，也便于自检对账。
 */
export function tick(prev, opts = {}) {
  const old = expire(prev, opts.day);
  const fresh = dispatch(opts);
  const have = new Set(old.map(q => q.id));
  const added = fresh.filter(q => !have.has(q.id));
  return { quests: [...old, ...added], added: added.length, expired: (Array.isArray(prev) ? prev.length : 0) - old.length };
}

/** 摘要（上下文预算 / 自检）：{ n, top, names } */
export function describe(list) {
  const q = Array.isArray(list) ? list : [];
  return { n: q.length, top: q.slice().sort((a, b) => b.urgency - a.urgency).slice(0, 3).map(x => x.name),
    hottest: q.reduce((m, x) => Math.max(m, Number(x?.heat) || 0), 0) };
}
