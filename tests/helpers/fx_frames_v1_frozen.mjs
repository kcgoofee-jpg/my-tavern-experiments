// Frozen copies of the frame bodies of app/traffic-view.mjs and app/weather-view.mjs as they were before S8-2 (the drawing after the canvas was cleared).
import { trafficField, routeList, pathMetrics, trailOf } from '../../map/core/traffic.mjs';
import { weatherOf, particleField, lightningAt, tintOf } from '../../map/core/weather.mjs';

export function trafficFrameV1(cx, { routes, t, seed, quality, night, toScreen, W, H }) {
  if (routes?.length) {
    const list = routeList(routes);
    const mets = list.map(r => pathMetrics(r.pts));
    const cars = trafficField(routes, { t, seed, quality, night });
    cx.lineCap = 'round';
    for (const c of cars) {
      const p = toScreen(c.nx, c.ny); if (!p) continue;
      if (p.x < -40 || p.y < -40 || p.x > W + 40 || p.y > H + 40) continue;
      const back = trailOf(mets[c.ri], c.s, c.trail);
      const q = back ? toScreen(back.nx, back.ny) : null;
      if (q) {
        cx.strokeStyle = `rgba(${c.color},${(c.alpha * .45).toFixed(3)})`;
        cx.lineWidth = Math.max(1, c.size * .9);
        cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(p.x, p.y); cx.stroke();
      }
      cx.fillStyle = `rgba(${c.color},${c.alpha.toFixed(3)})`;
      cx.beginPath(); cx.arc(p.x, p.y, c.size, 0, Math.PI * 2); cx.fill();
    }
  }
}

export function weatherFrameV1(cx, { id, t, seed, quality, W, H }) {
  const p = weatherOf(id);
  const tint = tintOf(id);
  if (tint) { cx.fillStyle = tint; cx.fillRect(0, 0, W, H); }
  for (const q of particleField(p, { w: W, h: H, t, seed, quality })) {
    const sp = Math.hypot(q.vx, q.vy) || 1;
    cx.strokeStyle = q.color; cx.lineWidth = q.width;
    cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(q.x - q.vx / sp * q.len, q.y - q.vy / sp * q.len); cx.stroke();
  }
  const l = lightningAt(p, { t, seed });
  if (l.alpha > 0) { cx.fillStyle = `rgba(232,240,255,${l.alpha.toFixed(3)})`; cx.fillRect(0, 0, W, H); }
}
