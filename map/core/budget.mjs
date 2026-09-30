// Graphics memory budget policy (Part 3): the pure decision layer behind VRAM pressure control.
// Browsers do not expose real VRAM usage, so the runtime reports *estimated* bytes (see
// estimateTexture / estimateGeometry) plus renderer counters; this module only decides:
//   * the byte budget for the current device class,
//   * whether the reported usage means "pressure",
//   * what to evict first, in a stable order, without touching active near-detail assets.
// Pure module: no DOM, no host globals, no timers, no network (machine-checked by
// tools/check_architecture.py and tests/webgl_budget.test.mjs).

export const MB = 1048576;
export const DEFAULT_LIMIT_MB = 512;
/** Device classes: 'low' (phone / ≤4 GB), 'mid' (integrated GPU), 'high' (discrete / unknown desktop). */
export const DEVICE_LIMITS_MB = { low: 256, mid: 512, high: 1024 };
export const HIGH_WATER = 0.85;    // fraction of the limit that triggers eviction
export const LOW_WATER = 0.70;     // fraction the eviction loop aims for (hysteresis against thrash)
/** Eviction priority: lower number = evicted first. `active` and `near` are never evicted. */
export const PRIORITY = { transitionTexture: 0, tileTexture: 1, inactive: 2, placeholder: 3, far: 4, mid: 5, near: 90, active: 100 };

const num = (v, def = 0) => (Number.isFinite(+v) ? +v : def);
const clamp01 = v => Math.min(1, Math.max(0, v));

/** Device class from caller-supplied hints (the runtime does the feature detection). */
export function deviceClass(h = {}) {
  if (h.force && DEVICE_LIMITS_MB[h.force]) return h.force;
  const mem = num(h.deviceMemory, 8);
  const coarse = !!h.coarse, cores = num(h.hardwareConcurrency, 8);
  if (mem <= 4 || (coarse && mem <= 6)) return 'low';
  if (coarse || cores <= 4 || num(h.maxTextureSize, 8192) < 8192) return 'mid';
  return 'high';
}

export function limitFor(cls, overrideMB) {
  const mb = num(overrideMB, 0);
  if (mb > 0) return Math.round(mb * MB);
  return (DEVICE_LIMITS_MB[cls] || DEFAULT_LIMIT_MB) * MB;
}

/** RGBA bytes for one texture, mipmaps included (×4/3 for the full mip chain). */
export function estimateTexture(t = {}) {
  const w = Math.max(0, num(t.width, 0)), h = Math.max(0, num(t.height, 0));
  if (!w || !h) return 0;
  const depth = num(t.depth, 4);                       // bytes per pixel: 4 = RGBA8 uncompressed
  const mips = t.mipmaps === false ? 1 : 4 / 3;
  const faces = Math.max(1, num(t.faces, 1));
  // depth = bytes per pixel after compression: 4 for RGBA8, 0.5–1 for block-compressed (KTX2/Basis).
  return Math.round(w * h * depth * mips * faces);
}

/** Bytes for one buffer geometry: attribute arrays + optional index array. */
export function estimateGeometry(g = {}) {
  let b = 0;
  for (const a of g.attributes || []) b += num(a?.bytes, num(a?.count, 0) * num(a?.itemSize, 3) * 4);
  if (g.index) b += num(g.index.bytes, num(g.index.count, 0) * (g.index.bits === 32 ? 4 : 2));
  return Math.round(b);
}

/** Total estimated bytes of a resource inventory (textures + geometries + reported extras). */
export function estimateAll(inv = {}) {
  let b = 0;
  for (const t of inv.textures || []) b += estimateTexture(t);
  for (const g of inv.geometries || []) b += estimateGeometry(g);
  return b + num(inv.extraBytes, 0);
}

const priorityOf = r => {
  if (r?.active) return PRIORITY.active;
  if (r?.state === 'near') return PRIORITY.near;
  if (r?.kind && PRIORITY[r.kind] != null) return PRIORITY[r.kind];
  if (r?.state && PRIORITY[r.state] != null) return PRIORITY[r.state];
  return PRIORITY.inactive;
};

/** Pressure state with hysteresis: evict above the high-water mark until below the low-water mark. */
export function pressure(usedBytes, limitBytes, state = {}) {
  const limit = Math.max(1, num(limitBytes, DEFAULT_LIMIT_MB * MB));
  const used = Math.max(0, num(usedBytes, 0));
  const ratio = used / limit;
  const evicting = !!state.evicting;
  const on = evicting ? ratio > LOW_WATER : ratio >= HIGH_WATER;   // hysteresis: stop only under LOW_WATER
  return { used, limit, ratio: clamp01(ratio), evicting: on, overBytes: Math.max(0, used - Math.round(limit * LOW_WATER)) };
}

/**
 * Eviction order for the current inventory: cheapest-to-lose first (transition texture, then far
 * / inactive / mid detail, then low), never the active or near-detail assets. Ties break by size
 * (largest first) then by id, so the order is deterministic and testable.
 */
export function evictOrder(resources = []) {
  return [...resources]
    .filter(r => r && !r.active && r.state !== 'near' && priorityOf(r) < PRIORITY.near)
    .map(r => ({ ...r, _p: priorityOf(r), _b: num(r.bytes, 0), _t: num(r.lastUsed, 0), _id: String(r.id ?? '') }))
    .sort((a, b) => a._p - b._p || a._t - b._t || b._b - a._b || a._id.localeCompare(b._id))
    .map(({ _p, _b, _t, _id, ...r }) => r);
}

/** Pick what to release to drop `needBytes` (or down to the low-water mark), never the protected set. */
export function plan(usedBytes, limitBytes, resources = [], state = {}) {
  const p = pressure(usedBytes, limitBytes, state);
  const need = Math.max(0, num(state.needBytes, p.overBytes));
  const ordered = evictOrder(resources);
  const picked = [];
  let freed = 0;
  for (const r of ordered) {
    if (freed >= need) break;
    picked.push(r); freed += num(r.bytes, 0);
  }
  return { ...p, need, picked, freed, remainingBytes: Math.max(0, p.used - freed), exhausted: freed < need };
}

/**
 * Decoded tile cache capacity (OpenSeadragon's count-based cache): shrink under pressure, grow
 * back when idle, always clamped to [minCount, maxCount]. The runtime sets the OSD value.
 */
export function tileCacheCount(baseCount, { pressure: ratio = 0, minCount = 12, maxCount = 60 } = {}) {
  const base = Math.max(1, num(baseCount, 30));
  const r = clamp01(ratio);
  const k = r >= HIGH_WATER ? 0.5 : r >= LOW_WATER ? 0.75 : 1;
  return Math.round(Math.min(maxCount, Math.max(minCount, base * k)));
}

/** Standard summary (context budget / diagnostics): fixed keys, deterministic values. */
export function describe(s = {}) {
  const p = pressure(s.usedBytes, s.limitBytes, s);
  return {
    deviceClass: s.deviceClass || deviceClass(s.hints || {}),
    limitBytes: p.limit,
    usedBytes: p.used,
    ratio: p.ratio,
    evicting: p.evicting,
    highWater: HIGH_WATER,
    lowWater: LOW_WATER,
    textures: num(s.textures, 0),
    geometries: num(s.geometries, 0),
    evicted: num(s.evicted, 0),
    compressedTextures: num(s.compressedTextures, 0),
    tileCacheCount: num(s.tileCacheCount, 0),
  };
}

export const Budget = { MB, DEFAULT_LIMIT_MB, DEVICE_LIMITS_MB, HIGH_WATER, LOW_WATER, PRIORITY, deviceClass, limitFor, estimateTexture, estimateGeometry, estimateAll, pressure, evictOrder, plan, tileCacheCount, describe };
