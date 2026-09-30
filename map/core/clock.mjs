// 零 Token 确定性世界时钟（Part 6-5）：世界时间由「推进了多少轮」算出来，不靠模型、不靠网络、不读系统时间。
// 同一个 (起点, 轮数) 永远得到同一个时刻——回放、截图对比、多端一致都站得住。
// 纯核心：不碰 DOM / 存储 / 酒馆全局（机检见 tools/check_architecture.py）。持久化与推送由宿主做。

export const MIN_PER_DAY = 1440;
/** 默认每轮（一次玩家输入 + 一次模型输出）推进的世界分钟数 */
export const DEFAULT_MIN_PER_ROUND = 10;
/** 时段：以世界分钟为单位，[起, 止) */
export const PERIODS = [
  { id: 'night', label: '夜', label_en: 'Night', from: 0, to: 300 },      // 00:00–05:00
  { id: 'dawn', label: '清晨', label_en: 'Dawn', from: 300, to: 420 },    // 05:00–07:00
  { id: 'day', label: '白天', label_en: 'Day', from: 420, to: 1020 },     // 07:00–17:00
  { id: 'dusk', label: '黄昏', label_en: 'Dusk', from: 1020, to: 1200 },  // 17:00–20:00
  { id: 'night', label: '夜', label_en: 'Night', from: 1200, to: 1440 },  // 20:00–24:00
];

const wrap = n => ((Math.floor(n) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;

/** 规范时钟：{ day, min }。乱输入 → 零点第 1 天（不猜、不抛） */
export function normClock(c) {
  const day = Number(c?.day);
  const min = Number(c?.min);
  return { day: Number.isFinite(day) && day >= 0 ? Math.floor(day) : 1, min: Number.isFinite(min) ? wrap(min) : 0 };
}

/** 时段：{ id, label, label_en }；认不出就按白天（保守，不把正午判成夜） */
export function periodOf(min) {
  const m = wrap(min);
  return PERIODS.find(p => m >= p.from && m < p.to) || PERIODS[2];
}

/** 推进 n 轮：{ day, min }。n 可以是负（回溯时间轴用） */
export function advance(clock, rounds = 1, minPerRound = DEFAULT_MIN_PER_ROUND) {
  const c = normClock(clock);
  const step = (Number.isFinite(Number(rounds)) ? Math.floor(Number(rounds)) : 0) * (Number.isFinite(Number(minPerRound)) ? Number(minPerRound) : DEFAULT_MIN_PER_ROUND);
  const total = c.min + step;
  const days = Math.floor(total / MIN_PER_DAY);
  const day = c.day + days;
  if (day < 1) return { day: 1, min: 0 };   // 不能退到开局之前（时间轴拖到最左就停在起点）
  return { day, min: wrap(total) };
}

/** HH:MM（世界时间，不是真实时间） */
export function hhmm(min) {
  const m = wrap(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 完整钟面：时钟 + 时段 + 中英文案 + 是否夜间（地图夜色用） */
export function describeClock(clock) {
  const c = normClock(clock), p = periodOf(c.min);
  return { day: c.day, min: c.min, time: hhmm(c.min), period: p.id, night: p.id === 'night',
    short: `第${c.day}日 ${hhmm(c.min)}`, short_en: `Day ${c.day} ${hhmm(c.min)}`,
    label: p.label, label_en: p.label_en };
}

/** 摘要（上下文预算 / 自检）：{ day, time, period } */
export const summarize = clock => { const d = describeClock(clock); return { day: d.day, time: d.time, period: d.period }; };
