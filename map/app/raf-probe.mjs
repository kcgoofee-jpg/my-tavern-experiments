// Read-only activity counter behind the debug surface getter `raf` (S7-2 T4, docs/ui-refactor.md 4 item 5): animation frames requested per owning module, live setInterval timers and their callbacks, and the
// running Web Animations, over the window since the last reset. The probes (tools/browser/raf_pause.mjs) read it; nothing in the product does. The wrappers only count; they change no timing.
let t0 = 0, frames = new Map(), calls = 0, byOwner = new Map();
const live = new Map();   // interval id -> the module that created it
const owner = stack => {
  for (const l of String(stack).split('\n').slice(2)) { const m = /\/([\w.-]+?)\.(?:mjs|js|html)/.exec(l); if (m && !/raf-probe|viewer-debug/.test(m[1])) return m[1]; }
  return 'other';
};
let installed = false;
function install() {
  if (installed || typeof window === 'undefined') return; installed = true;
  const raf = window.requestAnimationFrame.bind(window), si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  window.requestAnimationFrame = cb => { const k = owner(new Error().stack); frames.set(k, (frames.get(k) || 0) + 1); return raf(cb); };
  window.setInterval = (cb, ms, ...a) => { if (typeof cb !== 'function') return si(cb, ms, ...a); const who = owner(new Error().stack), id = si(function (...x) { calls++; byOwner.set(who, (byOwner.get(who) || 0) + 1); return cb.apply(this, x); }, ms, ...a); live.set(id, who); return id; };
  window.clearInterval = id => { live.delete(id); return ci(id); };
}
install();
/** raf(reset?) -> { ms, frames: { owner: n }, total, intervals: { live, calls }, waapi } since the last reset; raf(true) starts a new window */
export function raf(reset = false) {
  const now = performance.now(), out = { ms: Math.round(now - t0), frames: Object.fromEntries(frames), total: [...frames.values()].reduce((a, b) => a + b, 0), intervals: { live: live.size, calls, byOwner: Object.fromEntries(byOwner) },
    waapi: typeof document.getAnimations === 'function' ? document.getAnimations().filter(a => a.playState === 'running').length : 0 };
  if (reset) { t0 = now; frames = new Map(); calls = 0; byOwner = new Map(); }
  return out;
}
