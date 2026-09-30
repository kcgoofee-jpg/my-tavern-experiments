// 社区预设的半结构化字段（Part 7-2）：第三方高级预设（Ako / 斯德哥尔摩症 / 智脑-Z 这类）在状态栏里写的
// 「地点 / 时间 / 在场」不是 XML 块，剥不掉也不该剥——这里把它读成标准字段，给当前地点 / 世界时间的兜底用。
// 与 sanitize.mjs 分工：那边剥块（<thinking> / <liwe> / <state>…），这边吸字段；两者都不碰酒馆全局 / DOM
// （登记在 tools/check_architecture.py 的纯流水线白名单）。
// 读不出就是空对象——宁可没有，不可猜错（猜错的地点比没有地点更糟）。

/** 键名 → 标准字段。预设之间文案会漂，同义键都收。 */
export const FIELD_ALIASES = {
  当前地点: 'location', 地点: 'location', 位置: 'location', 所在地: 'location', 场景: 'location',
  时间: 'time', 时刻: 'time', 时段: 'time', 日期: 'time',
  在场: 'present', 在场人物: 'present', 人物: 'present',
  着装: 'outfit', 天气: 'weather', 状态: 'status',
};

/** 已知预设指纹：命中 markers 任一条即认（不要求全中）。拿不准返回 null——后面就不该用这家的键名约定。 */
export const PRESET_PROFILES = [
  { id: 'ako', markers: ['ako', '【当前地点】'] },
  { id: 'stockholm', markers: ['斯德哥尔摩', '■ 精神状态'] },
  { id: 'zhinao-z', markers: ['智脑', 'znz', '<zn'] },
];

/** 猜是哪套预设：命中返回 id，拿不准返回 null */
export function detectPreset(text) {
  const s = String(text ?? '').toLowerCase();
  if (!s) return null;
  for (const p of PRESET_PROFILES) if (p.markers.some(m => s.includes(String(m).toLowerCase()))) return p.id;
  return null;
}

// 三类写法：方括号【键】值、方块符 ■键：值、行首 键：值。
// 前两类的括号 / 方块本身就是预设的标记，键名可以放宽；行首那条没有标记，只认登记过的键名——
// 否则「他走进大厅：灯火通明」会被当成「键：值」，把叙事正文吸成字段（比读不到更糟）。
const HEAD_KEYS = new Set([...Object.keys(FIELD_ALIASES), 'location', 'time', 'present', 'outfit', 'weather', 'status']);
const LABEL_PATTERNS = [
  { re: /【([^】\n]{1,12})】\s*([^\n【]*)/g },
  { re: /■\s*([^：:\n]{1,12})\s*[：:]\s*([^\n]*)/g },
  { re: /^\s*([^：:\n]{1,12})\s*[：:]\s*(\S[^\n]*)$/gm, strict: true },
];

/**
 * 吸字段：{ location, time, present, ... }。同一字段多处出现取最后一次（社区预设常见「先草稿后定稿」）；
 * 值两端去空白与括号残片、空值与过长值（>120 字，多半是正文而不是字段）丢弃。
 */
export function extractFields(text, _profileId = null) {
  const src = String(text ?? '');
  const out = {};
  const put = (rawKey, rawVal, strict) => {
    const k = String(rawKey || '').trim();
    const v = String(rawVal || '').replace(/^[\s「"'（(]*|[\s」"'）)]*$/g, '').trim();
    if (!k || !v || v.length > 120) return;
    if (strict && !HEAD_KEYS.has(k)) return;
    const key = FIELD_ALIASES[k] || k.toLowerCase().replace(/\s+/g, '');
    if (!key) return;
    out[key] = v;
  };
  for (const { re, strict } of LABEL_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) put(m[1], m[2], strict);
  }
  return out;
}

/** 只取一个字段（宿主兜底最常用）：没有就返回 '' */
export const fieldOf = (text, name) => String(extractFields(text)[name] || '');
