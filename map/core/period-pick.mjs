// Which period base a map shows (docs/kernel-schema.md K-R39; I-24). Pure.
//   pickPeriod(variants, tod, bands) -> { key, src, exact }
//     variants: { <band id>: source } the map registers (maps.json `periods`, a view's `variants`)
//     tod:      the current band id ('' = no time / tint off)       bands: [{ id, dark? }] in time order (default: DEFAULT_PERIODS)
// Rule: the band's own variant when the map has one; else the NEAREST registered band by circular distance in band order
// (the day wraps: the last band is next to the first); on a tie the lighter band (not `dark`) wins, then the earlier one.
// No variants, no tod, or none of the registered keys is a band of the pack -> no pick (the map's single base).
import { DEFAULT_PERIODS } from './periods.mjs';

export function pickPeriod(variants, tod, bands) {
  const none = { key: '', src: null, exact: false };
  if (!variants || typeof variants !== 'object' || !tod) return none;
  const order = (Array.isArray(bands) && bands.length ? bands : DEFAULT_PERIODS).filter(b => b && b.id), n = order.length;
  const at = order.findIndex(b => b.id === tod); if (at < 0) return none;
  let best = null;
  order.forEach((b, i) => {
    if (!variants[b.id]) return;
    const d = Math.abs(i - at), dist = Math.min(d, n - d), dark = b.dark ? 1 : 0;
    if (!best || dist < best.dist || (dist === best.dist && dark < best.dark)) best = { key: b.id, dist, dark };
  });
  return best ? { key: best.key, src: variants[best.key], exact: best.key === tod } : none;
}

// 借图档的调色（OBLIQUE-CODE 时段）：一档底图被多个时段共用时（中层晨用昏图、下层两班各服务两档），
// 排序靠后的档是这张图「原本的时段」，靠前的档（借用方）由查看器整体调色区分 —— gradetod = 当前时段。
// 纯函数：variants = { 档: 源 }，pick = pickPeriod 的结果，order = 档位顺序；不共用 / 自己是最后一档 → ''。
export function tintBand(variants, pick, bands) {
  if (!pick?.src) return '';
  const order = (Array.isArray(bands) && bands.length ? bands : DEFAULT_PERIODS).filter(b => b && b.id);
  let last = '';
  for (const b of order) if (variants[b.id] === pick.src) last = b.id;
  return last && last !== pick.key ? pick.key : '';
}
