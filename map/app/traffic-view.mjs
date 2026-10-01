// 城市车流 / 悬浮流光（Part 4-3）的查看器侧渲染：在 LayerRegistry 的 fx 槽位挂 canvas，
// 把 core/traffic.mjs 算出的归一化光点用 OSD 的 pixelFromPoint 换算到屏幕，画成带尾迹的流光。
// 路线数据来自当前图（curData.routes，与画航线的 SVG 同源、同一套归一化坐标）；没有路线的图一帧都不画。
// 节拍同天气层：可见性守卫按下暂停位即停（P7-4），省流档减车。
import { registry, slotEl, declared } from './layer-host.mjs';
import { trafficField, routeList, pathMetrics, trailOf } from '../core/traffic.mjs';
import { busOn } from './bus.mjs';
import { visibilityGuard } from './visibility.mjs';
import { lean } from './sharpness-tiers.mjs';
import { aspect, currentMapData, osdViewer } from './state.mjs';

let cv = null, cx = null, raf = 0, t0 = 0, W = 0, H = 0, mounted = false, night = false, seed = 7;
const quality = () => (lean() ? .5 : 1);

function size() {
  const host = cv?.parentElement; if (!host || !cv) return;
  const r = host.getBoundingClientRect();
  W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  cx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** 图坐标（nx, ny*aspect）→ 视口像素；OSD 没就绪返回 null（画布还没挂上就别算） */
function toScreen(nx, ny) {
  try {
    const p = osdViewer?.viewport?.pixelFromPoint(new OpenSeadragon.Point(nx, ny * aspect), true);
    return p?.x != null && Number.isFinite(p.x) ? p : null;
  } catch (e) { return null; }
}

function frame(ts) {
  if (!cx || !raf) return;
  if (!t0) t0 = ts;
  const t = (ts - t0) / 1000;
  cx.clearRect(0, 0, W, H);
  const routes = currentMapData?.routes;
  if (routes?.length && osdViewer?.viewport) {
    const list = routeList(routes);   // 与核心同一过滤顺序，车上的 ri 才对得上度量
    const mets = list.map(r => pathMetrics(r.pts));
    const cars = trafficField(routes, { t, seed, quality: quality(), night });
    cx.lineCap = 'round';
    for (const c of cars) {
      const p = toScreen(c.nx, c.ny); if (!p) continue;
      if (p.x < -40 || p.y < -40 || p.x > W + 40 || p.y > H + 40) continue;   // 视口外不画
      const back = trailOf(mets[c.ri], c.s, c.trail);
      const q = back ? toScreen(back.nx, back.ny) : null;
      if (q) {   // 尾迹：沿路线往回退一小段，画成渐隐的一笔（夜里更长更亮）
        cx.strokeStyle = `rgba(${c.color},${(c.alpha * .45).toFixed(3)})`;
        cx.lineWidth = Math.max(1, c.size * .9);
        cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(p.x, p.y); cx.stroke();
      }
      cx.fillStyle = `rgba(${c.color},${c.alpha.toFixed(3)})`;
      cx.beginPath(); cx.arc(p.x, p.y, c.size, 0, Math.PI * 2); cx.fill();
    }
  }
  raf = requestAnimationFrame(frame);
}
function start() { if (raf || !cx) return; t0 = 0; raf = requestAnimationFrame(frame); }
function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; if (cx) cx.clearRect(0, 0, W, H); }

/** 时钟的夜（宿主推 eden-map:clock）→ 夜里流光更亮更长 */
export const trafficNight = v => { night = !!v; };
export const trafficRunning = () => !!raf;

let done = false;
export function registerTrafficLayer() {
  if (done) return registry.has('traffic'); done = true;
  registry.register(declared('traffic', {
    initialVisible: true,
    mount: () => {
      const host = slotEl('fx'); if (!host) return false;
      cv = document.createElement('canvas');
      cv.className = 'trcv'; cv.setAttribute('aria-hidden', 'true');
      Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
      host.appendChild(cv); cx = cv.getContext('2d'); mounted = true; size(); start();
      return true;
    },
    unmount: () => { stop(); mounted = false; try { cv?.remove(); } catch (e) {} cv = null; cx = null; },
    setVisible: v => { if (!mounted) return; cv.style.display = v ? '' : 'none'; v ? start() : stop(); },
  }));
  busOn({ key: 'traffic.resize', type: 'resize', fn: () => size() });
  busOn({ key: 'traffic.hostMsg', type: 'message', fn: e => { if (window.__isFromHost?.(e) && e.data?.type === 'eden-map:clock') night = !!e.data.night; } });
  visibilityGuard.subscribe(paused => { paused ? stop() : (registry.isVisible('traffic') ? start() : null); });
  window.TrafficApi = { running: trafficRunning, night: trafficNight, describe: () => ({ cars: trafficField(routeList(currentMapData?.routes), { t: 0, seed, quality: quality(), night }).length, night }) };
  return true;
}
