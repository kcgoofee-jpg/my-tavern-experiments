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
