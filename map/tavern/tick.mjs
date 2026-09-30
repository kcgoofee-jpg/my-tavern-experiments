// 后台静默推演的调度器（Part 6-2）：面板关着 / 后台时，隔一段时间以只读方式把新楼层扫一遍、把缓存补齐，
// 等玩家重新打开地图，事态 / 人物 / 行程已经是热的——不用在开面板那一刻现算（那条路已经在赶首屏 500 ms 的预算）。
// 三条底线：① 只读（不写变量、不注入、不发消息给查看器）；② 生成期间与面板开着时一律让路；
// ③ 每次只扫增量楼层，且有上限——长会话不能越跑越久。
// 纯模块：不碰酒馆全局 / DOM / 定时器（时间由调用方注入）；node 单测 tests/tick.test.mjs。
export const KEY = 'edenMapTick';
export const DEFAULT_MS = 60000;        // 默认 60 s 一次
export const MIN_MS = 15000;            // 再急也不许低于 15 s（后台推演不该抢聊天首屏的算力）
export const MAX_FLOORS = 60;           // 一次最多扫这么多新楼层
export const MAX_MS = 300000;

/** 设置项 → 间隔（毫秒）。0 / 负值 / 乱值 = 关（不跑） */
export function intervalOf(get) {
  try {
    const raw = get?.(KEY);
    const s = String(raw ?? '').trim();
    if (!s) return DEFAULT_MS;                       // 没设过 = 默认 60 s（后台推演默认开）
    if (s === '1') return DEFAULT_MS;                // 设置里的开关：开 = 默认间隔
    const v = Number(s);
    if (!Number.isFinite(v) || v <= 0) return 0;     // '0' / 负数 / 乱值 = 关
    return Math.max(MIN_MS, Math.min(MAX_MS, Math.round(v)));
  } catch (e) { return 0; }
}

/**
 * 该不该跑这一次：{ run, reason }。
 * 让路的四种情况：间隔没到、面板活着（前台在算，后台就别插一脚）、正在生成、实例已死。
 */
export function plan(now, { lastAt = 0, intervalMs = DEFAULT_MS, alive = false, generating = false, dead = false } = {}) {
  const t = Number(now) || 0;
  if (dead) return { run: false, reason: 'dead' };
  const iv = Number(intervalMs) || 0;
  if (!iv) return { run: false, reason: 'off' };
  if (alive) return { run: false, reason: 'alive' };
  if (generating) return { run: false, reason: 'generating' };
  const since = t - (Number(lastAt) || 0);
  if (Number.isFinite(since) && since < iv) return { run: false, reason: 'wait', wait: Math.max(0, Math.ceil(iv - since)) };
  return { run: true, reason: 'due', waited: Math.max(0, Math.round(since)) };
}

/**
 * 这一轮要读哪些楼层：只取 lastFloor 之后的新楼层，超过上限就取最近的那批（老的那几楼宁可漏读，
 * 也不能让一次后台推演扫一千楼）。返回 { from, to, n, dropped }；没有新楼层时 n = 0。
 */
export function pick(floorNow, lastFloor, { maxFloors = MAX_FLOORS, scan = 80 } = {}) {
  const now = Number(floorNow), last = Number(lastFloor);
  if (!Number.isFinite(now) || now < 0) return { from: 0, to: 0, n: 0, dropped: 0 };
  const from = Number.isFinite(last) && last >= 0 ? last + 1 : Math.max(0, now - (Number(scan) || 80));
  const to = now;
  const total = Math.max(0, to - from + 1);
  const cap = Math.max(1, Number(maxFloors) || MAX_FLOORS);
  if (total <= cap) return { from, to, n: total, dropped: 0 };
  const cut = to - cap + 1;
  return { from: cut, to, n: cap, dropped: total - cap };
}

/** 一轮跑完的记账：{ lastAt, lastFloor, runs, lastMs, lastN }——自检与设置页看得到「后台在不在干活」 */
export function ledger(prev, { now, floorNow, ms = 0, n = 0 } = {}) {
  const p = prev && typeof prev === 'object' ? prev : {};
  return { lastAt: Number(now) || p.lastAt || 0, lastFloor: Number.isFinite(Number(floorNow)) ? Number(floorNow) : (p.lastFloor ?? -1),
    runs: (Number(p.runs) || 0) + 1, lastMs: Math.max(0, Math.round(Number(ms) || 0)), lastN: Math.max(0, Math.round(Number(n) || 0)) };
}

/** 摘要（自检用） */
export const describe = (get, led) => ({ intervalMs: intervalOf(get), ...led, key: KEY });
