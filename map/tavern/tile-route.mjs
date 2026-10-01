// Which route to try when the map tiles of the current one all fail (N13). Pure: no DOM, no network, no storage.
//   nextRoute({ lines, current, swappable, lastAt, now, windowMs }) -> key | null
// The host calls it once per failure report from the viewer; it answers with the other usable route, or null (nothing to switch to, the
// script is not loaded from a CDN, or a switch already happened a moment ago: the viewer then shows its own toast).
export const SWITCH_WINDOW_MS = 120000;

export function nextRoute({ lines, current, swappable, lastAt = 0, now = Date.now(), windowMs = SWITCH_WINDOW_MS } = {}) {
  if (!swappable || !Array.isArray(lines) || lines.length < 2) return null;
  if (lastAt && now - lastAt < windowMs) return null;
  const keys = lines.map(l => l && l.key).filter(Boolean), i = keys.indexOf(current);
  const other = keys.filter((k, j) => j !== i);
  return other.length ? (i < 0 ? other[0] : keys[(i + 1) % keys.length]) : null;
}
