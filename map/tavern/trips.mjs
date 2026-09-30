// v0.9.5 行程（纯函数；卡内脚本与单测共用）：从每楼的地点（MVU 或消息原文里的 JSONPatch）和人物标签推出「A → B」的行程，按交通方式分样式。
// 交通方式 = 关键词表（可在「变量映射」里改，换个世界只要改几个词）：
//   air 虚线弧 · underground 点线 · teleport 不连线、两端脉冲 · rail / road 贴地的实线。
// 默认词表按这张卡写（docs/card-digest.md §2）；通用奇幻词单独一组，默认不启用。
export const MODES = ['air', 'rail', 'road', 'underground', 'teleport'];
export const DEFAULT_KEYWORDS = {
  air: ['私人悬浮载具', '悬浮载具', '悬浮车', '悬浮机动装置', '飞行器', '飞艇'],
  rail: ['跨城高速运输管道', '运输管道', '悬浮轨道', '地面轨道', '轨道'],
  road: ['步行连廊', '货运通道', '步行', '走路'],
  underground: ['地铁', '地道', '地下通道'],
  teleport: [],
};
export const FANTASY_KEYWORDS = { air: ['飞行法宝', '御剑'], underground: ['遁地'], teleport: ['传送阵', '瞬移', '传送'] };
/** 合并词表：base + （开了通用奇幻词时）fantasy */
export function keywords(base = DEFAULT_KEYWORDS, fantasy = false) {
  const out = {}; for (const m of MODES) out[m] = [...new Set([...(base?.[m] || []), ...(fantasy ? FANTASY_KEYWORDS[m] || [] : [])])].filter(Boolean);
  return out;
}
/** 文本 → 交通方式（最长的关键词胜出）；都没有返回 '' */
export function modeOf(text, kw = DEFAULT_KEYWORDS) {
  const s = String(text || ''); let best = '', len = 0;
  for (const m of MODES) for (const w of kw?.[m] || []) if (w && s.includes(w) && [...w].length > len) { best = m; len = [...w].length; }
  return best;
}
/** 消息原文里 MVU 的 JSONPatch：取「当前地点」的最后一次写入（path 可换，默认 /世界/当前地点）；没有返回 '' */
export function patchPlace(text, path = '') {
  if (!path) return '';
  const s = String(text || ''), esc = path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); let last = '';
  const re = new RegExp(`\\{[^{}]*"path"\\s*:\\s*"${esc}"[^{}]*\\}`, 'g');
  for (const m of s.matchAll(re)) { const v = m[0].match(/"value"\s*:\s*"((?:[^"\\]|\\.)*)"/); if (v) try { last = JSON.parse(`"${v[1]}"`); } catch (e) { last = v[1]; } }
  return last.trim();
}
const same = (a, b) => String(a || '').trim() === String(b || '').trim();
/** 玩家的行程：seq = [{ floor, place, text?, time? }]（按楼层升序）；transit = core/transit.mjs 的 parseTransit。
 *  相邻两楼地点变了 → 一段 A → B；地点本身写成「A至B」→ 这一楼一段。mode 按这一楼的原文 + 地点找 */
export function playerTrips(seq, transit = () => null, kw = DEFAULT_KEYWORDS) {
  const out = []; let prev = null;
  for (const s of seq) {
    if (!s.place) continue;
    const t = transit(s.place);
    if (t && t.to) { const from = t.from || prev?.place || ''; if (from) out.push({ floor: s.floor, from, to: t.to, mode: modeOf(t.via + ' ' + s.place + ' ' + (s.text || ''), kw), time: s.time || '', live: true }); }
    else if (prev && !same(prev.place, s.place) && !transit(prev.place)) out.push({ floor: s.floor, from: prev.place, to: s.place, mode: modeOf(s.text, kw), time: s.time || '' });
    else if (prev && transit(prev.place) && !same(transit(prev.place).to, s.place)) out.push({ floor: s.floor, from: transit(prev.place).to, to: s.place, mode: modeOf(s.text, kw), time: s.time || '' });
    prev = s;
  }
  // 「途中」只在它是最新一段时算进行中
  out.forEach((t, i) => { if (i < out.length - 1) delete t.live; });
  return out;
}
/** 人物的行程：tags = [{ floor, name, place, text? }]（按楼层升序）→ 每人相邻两次地点不同 → 一段 */
export function charTrips(tags, kw = DEFAULT_KEYWORDS) {
  const last = new Map(), out = [];
  for (const t of tags) { const p = last.get(t.name); if (p && !same(p, t.place)) out.push({ floor: t.floor, who: t.name, from: p, to: t.place, mode: modeOf(t.text, kw) }); last.set(t.name, t.place); }
  return out;
}
/** 只留最近 n 段（玩家与人物各自 n 段），新的在后 */
export function recent(trips, n = 5) {
  const me = trips.filter(t => !t.who).slice(-n), ch = trips.filter(t => t.who).slice(-n);
  return [...me, ...ch].sort((a, b) => a.floor - b.floor);
}
