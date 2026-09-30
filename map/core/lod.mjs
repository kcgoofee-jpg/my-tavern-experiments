// Graphics LOD policy (Part 3): the pure decision layer behind dynamic model detail.
// The runtime (map/app/*) owns cameras, timers and async loads; this module only decides:
//   * which detail state a model should be in for a given camera/viewport observation,
//   * which state changes are allowed now (hysteresis),
//   * which async asset loads are still valid (generation tokens),
//   * which meshes should participate in GPU culling / instancing decisions.
// Pure module: no DOM, no host globals, no timers, no network (machine-checked by
// tools/check_architecture.py and tests/lod.test.mjs).

export const STATES = ['far', 'mid', 'near'];
export const RANK = { far: 0, mid: 1, near: 2 };
export const DEFAULT_BANDS = { near: 2.4, mid: 6 };     // multiples of the framed model size
export const HYSTERESIS = 0.12;                          // relative band slack against flapping

const num = (v, def = 0) => (Number.isFinite(+v) ? +v : def);
const clamp01 = v => Math.min(1, Math.max(0, v));
const clampPos = (v, def) => { const n = num(v, def); return n > 0 ? n : def; };

/**
 * Observation of one model for one frame. Only plain numbers; callers measure.
 *   distance  camera-to-target distance in world units
 *   size      framed size of the model (bounding-sphere diameter) in world units
 *   cover     fraction of the viewport the model covers (0..1), optional but preferred on
 *             orthographic cameras where distance is nearly constant
 *   visible   the model intersects the current frustum / viewport
 */
export function observe(m) {
  const size = clampPos(m?.size, 1);
  const distance = num(m?.distance, 0);
  return {
    size, distance,
    ratio: distance / size,                       // multiples of the model size: scale-free
    cover: clamp01(m?.cover ?? (size / Math.max(distance, size))),
    visible: m?.visible == null ? true : !!m.visible,
    screenPx: clampPos(m?.screenPx, 0),
  };
}

/** Raw band from a single observation: 'far' | 'mid' | 'near' (no hysteresis). */
export function band(o, bands = DEFAULT_BANDS) {
  const b = { ...DEFAULT_BANDS, ...(bands || {}) };
  const r = observe(o).ratio;
  if (r <= num(b.near, DEFAULT_BANDS.near)) return 'near';
  if (r <= num(b.mid, DEFAULT_BANDS.mid)) return 'mid';
  return 'far';
}

/**
 * Hysteresis gate: only accept a state change once the observation clears the neighbour band
 * by HYSTERESIS. Detail increases (far → near) need the tighter threshold to be crossed more
 * convincingly than the band itself; detail decreases are symmetric but never below 'far'.
 */
export function stepState(current, o, bands = DEFAULT_BANDS) {
  const cur = STATES.includes(current) ? current : 'far';
  const b = { ...DEFAULT_BANDS, ...(bands || {}) };
  const near = num(b.near, DEFAULT_BANDS.near), mid = num(b.mid, DEFAULT_BANDS.mid);
  const r = observe(o).ratio, k = 1 + HYSTERESIS;
  let want = cur;
  if (cur === 'near' && r > near * k) want = 'mid';
  else if (cur === 'mid') { if (r <= near / k) want = 'near'; else if (r > mid * k) want = 'far'; }
  else if (cur === 'far' && r <= mid / k) want = 'mid';
  return { state: want, changed: want !== cur, ratio: r };
}

/**
 * Load plan for a state change. 'far' shows a generated low-poly stand-in and frees high
 * detail; 'mid' loads/keeps the low asset; 'near' promotes to the high asset asynchronously.
 * `reject` marks loads that must be discarded when they land (stale generation).
 */
export function plan(cur, next, assets = {}) {
  const from = STATES.includes(cur) ? cur : 'far';
  const to = STATES.includes(next) ? next : 'far';
  const detail = { far: 'placeholder', mid: 'low', near: 'high' }[to];
  // Fallback order: the best available detail whose state is not finer than `to` (low asset
  // missing → stay on the placeholder; high asset missing → stay on low).
  const avail = { placeholder: assets.placeholder !== false, low: !!assets.low, high: !!assets.high };
  const wanted = avail[detail] ? detail
    : ['high', 'low', 'placeholder'].find(k => avail[k] && RANK[({ placeholder: 'far', low: 'mid', high: 'near' })[k]] <= RANK[to])
      || 'placeholder';
  return {
    from, to, detail: wanted,
    fallbackUsed: wanted !== detail,
    load: RANK[to] > RANK[from] && wanted !== 'placeholder' ? wanted : null,   // upgrade only
    unload: RANK[to] < RANK[from] ? ['high', 'low'].filter(k => RANK[({ high: 'near', low: 'mid' })[k]] > RANK[to]) : [],
    async: wanted !== 'placeholder',
  };
}

/** Async load tokens: `next` bumps the generation; `accept` tells a late load whether to apply. */
export function createTokens() {
  let gen = 0;
  return {
    get value() { return gen; },
    next() { return ++gen; },
    accept(token) { return Number.isFinite(token) && token === gen; },
    reset() { gen = 0; return gen; },
  };
}

/**
 * Frame budget for LOD re-evaluation: at most `perFrame` models may be re-evaluated per frame,
 * nearest first, and an already-pending model is skipped until its load settles.
 */
export function schedule(items, { perFrame = 4 } = {}) {
  const n = Math.max(1, perFrame | 0);
  return [...(items || [])]
    .filter(it => it && !it.pending)
    .sort((a, b) => num(a?.ratio, Infinity) - num(b?.ratio, Infinity) || String(a?.id).localeCompare(String(b?.id)))
    .slice(0, n)
    .map(it => it.id);
}

/** Culling policy: Three frustum culling stays on; this adds cheap distance/hidden gating. */
export function cullPolicy(o, { maxRatio = 0 } = {}) {
  const ob = observe(o);
  const offscreen = !ob.visible;
  const tooFar = maxRatio > 0 && ob.ratio > maxRatio;
  const tooSmall = ob.screenPx > 0 && ob.screenPx < 2;
  return { frustumCulled: true, render: !offscreen && !tooFar && !tooSmall, offscreen, tooFar, tooSmall };
}

/**
 * Instancing policy: group meshes that share geometry signature + material signature and are not
 * picked individually. `pickable` meshes (hotspots / interactive props) keep their own draw call
 * because raycasting and per-object highlight need the object identity.
 */
export function instanceGroups(meshes = [], { groupOf } = {}) {
  const keyOf = m => (typeof groupOf === 'function' ? groupOf(m) : m?.group) ?? (m?.pickable ? null : `${m?.geometryId || ''}|${m?.materialId || ''}`);
  const map = new Map();
  for (const m of meshes) {
    const key = keyOf(m);
    if (!key) continue;                                     // null = keep un-instanced
    if (!map.has(key)) map.set(key, { key, count: 0, ids: [] });
    const g = map.get(key); g.count++; if (m?.id != null) g.ids.push(m.id);
  }
  return [...map.values()].filter(g => g.count > 1).sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

/** Standard summary (context budget / diagnostics): fixed keys, deterministic values. */
export function describe(state = {}) {
  const counts = {};
  for (const s of STATES) counts[s] = num(state.counts?.[s], 0);
  return {
    states: [...STATES],
    counts,
    bands: { ...DEFAULT_BANDS, ...(state.bands || {}) },
    hysteresis: HYSTERESIS,
    generation: num(state.generation, 0),
    instanceGroups: num(state.instanceGroups, 0),
    drawCalls: num(state.drawCalls, 0),
    rejectedLoads: num(state.rejectedLoads, 0),
  };
}

export const LOD = { STATES, RANK, DEFAULT_BANDS, HYSTERESIS, observe, band, stepState, plan, createTokens, schedule, cullPolicy, instanceGroups, describe };
