// Host-fed layer values (docs/layers-schema.md §3.2 and §9, K-R86): the host reads the card variables that a pack's layers name (profile.layerPaths) and sends the
// values to the viewer. Read only: nothing here writes. A value is capped before it leaves the host: more than 200 list items or more than 4 KB of JSON is cut
// and marked `…truncated`. Pure: no DOM, no storage, no host globals (the caller passes the snapshot and the path reader).
export const VALUE_LIMITS = Object.freeze({ bytes: 4096, items: 200, paths: 8 });
export const TRUNCATED = '…truncated';
const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
const size = v => { const s = JSON.stringify(v) ?? ''; return enc ? enc.encode(s).length : s.length; };
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** capValue(v) -> the value, cut to the limits and marked, or undefined for a value that cannot travel (undefined, a function). */
export function capValue(v) {
  if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return undefined;
  if (v === null || ['number', 'boolean'].includes(typeof v)) return v;
  if (typeof v === 'string') {
    if (size(v) <= VALUE_LIMITS.bytes) return v;
    let s = v.slice(0, VALUE_LIMITS.bytes); while (size(s) > VALUE_LIMITS.bytes - 16) s = s.slice(0, Math.floor(s.length * 0.9));
    return s + TRUNCATED;
  }
  if (Array.isArray(v)) {
    let out = v.slice(0, VALUE_LIMITS.items).map(x => capValue(x) ?? null), cut = v.length > VALUE_LIMITS.items;
    while (out.length && size(cut ? [...out, TRUNCATED] : out) > VALUE_LIMITS.bytes) { out = out.slice(0, Math.max(0, Math.floor(out.length * 0.8))); cut = true; }
    return cut ? [...out, TRUNCATED] : out;
  }
  if (isObj(v)) {
    const out = {}; let cut = false;
    for (const [k, x] of Object.entries(v)) { const c = capValue(x); if (c === undefined) continue; out[k] = c; if (size(out) > VALUE_LIMITS.bytes) { delete out[k]; cut = true; break; } }
    if (cut) out[TRUNCATED] = true;
    return out;
  }
  return undefined;
}

/** pickValues(stat, paths, get) -> { <path>: value }: `get(stat, path)` is the host's path reader (it unwraps `[value, note]` pairs); a missing path is absent; at most 8 paths. */
export function pickValues(stat, paths, get) {
  const out = {};
  if (!isObj(stat) || !Array.isArray(paths) || typeof get !== 'function') return out;
  for (const p of paths.slice(0, VALUE_LIMITS.paths)) {
    if (typeof p !== 'string') continue;
    let v; try { v = get(stat, p); } catch (e) { v = undefined; }
    const c = capValue(v); if (c !== undefined) out[p] = c;
  }
  return out;
}
