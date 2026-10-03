// Canvas building blocks (docs/layers-schema.md §2.3, K-R80): `flow`, `particles` and `tint` draw on a canvas in a layer slot.
// canvasLayer() is the canvas setup the traffic and weather layers used to carry twice (size with the dpr cap, mount into the slot, rAF start / stop,
// resize); drawFlow / drawParticles / drawTint are the frame bodies moved out of those two layers verbatim, so the first pack's layers and a pack's
// declared layers draw through the same code. tests/block_canvas.test.mjs compares their recorded context calls with frozen copies of the old frames.
import { slotEl } from './layer-host.mjs';
import { busOn } from './bus.mjs';
import { visibilityGuard } from './visibility.mjs';
import { trafficField, routeList, pathMetrics, trailOf } from '../core/traffic.mjs';
import { weatherOf, particleField, lightningAt, tintOf } from '../core/weather.mjs';
import { aspect, osdViewer } from './state.mjs';
import { isOblique, projectPt, zAt } from './oblique.mjs';

const CSS_ID = 'blkCss';
const CSS = '.blkcv { position: absolute; inset: 0; pointer-events: none; } .blkcv[hidden] { display: none; }';
function css() {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const s = document.createElement('style'); s.id = CSS_ID; s.textContent = CSS; document.head.appendChild(s);
}
/** 图坐标（nx, ny*aspect）→ 视口像素；OSD 没就绪返回 null（画布还没挂上就别算）。斜视图按相机投影（附录 OBLIQUE-CODE C） */
export function toScreen(nx, ny) {
  try {
    let x = nx, y = ny;
    if (isOblique()) [x, y] = projectPt(nx, ny, zAt(nx, ny));
    const p = osdViewer?.viewport?.pixelFromPoint(new OpenSeadragon.Point(x, y * aspect), true);
    return p?.x != null && Number.isFinite(p.x) ? p : null;
  } catch (e) { return null; }
}
const reduced = () => { try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/**
 * canvasLayer({ key, slot, cls, frame, idle, still }) -> { mount, unmount, setVisible, start, stop, size, running, canvas }
 *   frame(cx, t, W, H)  one frame (t in seconds since start; the canvas is cleared first)
 *   idle()              true = nothing to animate right now (start() does nothing)
 *   still               true = honour prefers-reduced-motion (K-R80: a declared layer draws nothing while it is set)
 * `key` names the resize / visibility subscriptions (once per layer). A canvas covers its slot; device pixels are capped at 2x.
 */
export function canvasLayer({ key, slot, cls, frame, idle = () => false, still = false }) {
  let cv = null, cx = null, raf = 0, t0 = 0, W = 0, H = 0, mounted = false, vis = true, unsub = null;
  const size = () => {
    const host = cv?.parentElement; if (!host || !cv) return;
    const r = host.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    cx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const loop = ts => {
    if (!cx || !raf) return;
    if (!t0) t0 = ts;
    cx.clearRect(0, 0, W, H);
    frame(cx, (ts - t0) / 1000, W, H);
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; if (cx) cx.clearRect(0, 0, W, H); };
  const start = () => { if (raf || !cx || idle() || (still && reduced())) return; t0 = 0; raf = requestAnimationFrame(loop); };
  const mount = () => {
    const host = slotEl(slot); if (!host) return false;
    css(); cv = document.createElement('canvas');
    cv.className = 'blkcv ' + cls; cv.setAttribute('aria-hidden', 'true'); cv.hidden = !vis;
    host.appendChild(cv); cx = cv.getContext('2d'); mounted = true; size();
    if (vis) start();
    if (!unsub) {
      busOn({ key: key + '.resize', type: 'resize', fn: size });
      unsub = visibilityGuard.subscribe(paused => { paused ? stop() : (vis ? start() : null); });
    }
    return true;
  };
  const unmount = () => { stop(); mounted = false; try { cv?.remove(); } catch (e) {} cv = null; cx = null; };
  const setVisible = v => { vis = !!v; if (!mounted) return; cv.hidden = !vis; vis ? start() : stop(); };
  return { mount, unmount, setVisible, start, stop, size, running: () => !!raf, canvas: () => cv };
}

/** drawFlow(cx, { routes, t, seed, quality, night, toScreen, W, H, kinds, path }): the dots (with fading trails) that move along the routes.
 *  `path` ({ color, width, dash, opacity }) strokes the polyline first (a pack flow layer, L-04); the first pack's traffic layer passes none. */
export function drawFlow(cx, { routes, t, seed, quality, night, toScreen, W, H, kinds, path }) {
  if (!routes?.length) return;
  const list = routeList(routes);   // the same filter order as the core: the `ri` of a car indexes these metrics
  const mets = list.map(r => pathMetrics(r.pts));
  if (path) {
    cx.save(); cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = path.color; cx.lineWidth = path.width; cx.globalAlpha = path.opacity ?? 1; cx.setLineDash?.(path.dash || []);
    for (const r of list) {
      cx.beginPath(); let n = 0;
      for (const [x, y] of r.pts) { const p = toScreen(x, y); if (!p) { n = 0; break; } n++ ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y); }
      if (n) cx.stroke();
    }
    cx.restore();
  }
  const cars = trafficField(routes, { t, seed, quality, night, ...(kinds ? { kinds } : {}) });
  cx.lineCap = 'round';
  for (const c of cars) {
    const p = toScreen(c.nx, c.ny); if (!p) continue;
    if (p.x < -40 || p.y < -40 || p.x > W + 40 || p.y > H + 40) continue;   // outside the viewport: not drawn
    const back = trailOf(mets[c.ri], c.s, c.trail);
    const q = back ? toScreen(back.nx, back.ny) : null;
    if (q) {   // the trail: a fading stroke back along the route (longer and brighter at night)
      cx.strokeStyle = `rgba(${c.color},${(c.alpha * .45).toFixed(3)})`;
      cx.lineWidth = Math.max(1, c.size * .9);
      cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(p.x, p.y); cx.stroke();
    }
    cx.fillStyle = `rgba(${c.color},${c.alpha.toFixed(3)})`;
    cx.beginPath(); cx.arc(p.x, p.y, c.size, 0, Math.PI * 2); cx.fill();
  }
}

/** drawParticles(cx, { preset, t, seed, quality, W, H }): the preset's tint, its particle strokes and (storm) lightning. */
export function drawParticles(cx, { preset, t, seed, quality, W, H }) {
  const p = weatherOf(preset);
  const tint = tintOf(p.id);
  if (tint) { cx.fillStyle = tint; cx.fillRect(0, 0, W, H); }
  for (const q of particleField(p, { w: W, h: H, t, seed, quality })) {
    const sp = Math.hypot(q.vx, q.vy) || 1;
    cx.strokeStyle = q.color; cx.lineWidth = q.width;
    cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(q.x - q.vx / sp * q.len, q.y - q.vy / sp * q.len); cx.stroke();
  }
  const l = lightningAt(p, { t, seed });
  if (l.alpha > 0) { cx.fillStyle = `rgba(232,240,255,${l.alpha.toFixed(3)})`; cx.fillRect(0, 0, W, H); }
}

/** drawTint(cx, { color, opacity, W, H }): one translucent fill (`color` is a CSS colour the caller resolved). */
export function drawTint(cx, { color, opacity, W, H }) {
  cx.save(); cx.globalAlpha = opacity; cx.fillStyle = color; cx.fillRect(0, 0, W, H); cx.restore();
}
