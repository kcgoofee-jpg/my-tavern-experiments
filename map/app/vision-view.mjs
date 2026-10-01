// 拓扑视野锥与潜行（Part 5-2 第三步，2026-09-30）的查看器侧：渲染 + 移动判定。
//   ① 锥：地图数据里的巡逻环（curData.routes 的 patrol / patrol_city）由 core/vision.mjs 换成此刻的岗哨，
//      这里把每个人的 polygon 画成半透明扇形（有墙的包会被截断——几何在 core，这里只画）。
//   ② 走路要躲：当前地点从一个地标挪到另一个地标时，两点之间的直线丢给 crossing 问一次——
//      被谁看见了，就把最难的一下（DC）报给宿主（eden-map:stealth），要不要替玩家说这句话由宿主 / 设置决定。
// 节拍与车流 / 天气一致：fx 槽位画布 + 可见性守卫（P7-4）；省流档岗哨减半。
// 数据不另起门户：岗位来自地图自己的巡逻环，城墙（walls）默认没有，有水系 / 隔墙的包可由宿主推来。
import { registry, slotEl } from './layer-host.mjs';
import { conePolygon, crossing, patrolCones } from '../core/vision.mjs';
import { busOn } from './bus.mjs';
import { visibilityGuard } from './visibility.mjs';
import { lean } from './sharpness-tiers.mjs';
import { post } from './protocol-stamp.mjs';
import { aspect, currentMapId, currentMapData, mapRegistry, osdViewer } from './state.mjs';

let cv = null, cx = null, raf = 0, t0 = 0, W = 0, H = 0, mounted = false, night = false, now = 0;
let lastId = null, walls = [];
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
const toScreen = (nx, ny) => { try { const p = osdViewer?.viewport?.pixelFromPoint(new OpenSeadragon.Point(nx, ny * aspect), true); return p?.x != null && Number.isFinite(p.x) ? p : null; } catch (e) { return null; } };

/** 此刻的岗哨：没有巡逻环的图一个都不出（多数地图一帧不画） */
export const conesNow = t => patrolCones(currentMapData?.routes, { t, quality: quality() });

/** 标记 id → 归一化坐标（当前图的小表，切图整份换） */
const xyCache = new Map();
export function markerXY(id) {
  if (xyCache.has(id)) return xyCache.get(id);
  const k = (currentMapData?.markers || []).find(q => q.id === id);
  const v = k && Number.isFinite(k.nx) ? { x: k.nx, y: k.ny } : null;
  xyCache.set(id, v); return v;
}
export const nameOf = id => mapRegistry?.maps?.[currentMapId]?.markers?.[id]?.name || id || '';

/** 站在哪个地标上：当前地点字符串 → 本图的标记（id 或地主名字互相涵盖都认，与 locate.mjs 的 markHere 同一比对） */
export function markerOf(here) {
  const v = String(here || '').trim(); if (!v) return null;
  const meta = mapRegistry?.maps?.[currentMapId]?.markers || {};
  for (const k of currentMapData?.markers || []) {
    if (!k.id) continue;
    if (v.includes(k.id)) return k;                                    // 地点里直接写了标记 id（机兵 / 哨位这类）
    const nm = meta[k.id]?.name;
    if (nm && (v.includes(nm) || nm.includes(v))) return k;            // 中英名字互相涵盖
  }
  return null;
}

/** 移动判定：replay（时间轴回放）不判定；同一地标挪回来也不算一次穿越 */
export function tryMove(here, { replay = false } = {}) {
  const to = markerOf(here), prevId = lastId;
  lastId = to?.id || null;
  if (replay || !to || !prevId || prevId === to.id) return null;
  const a = markerXY(prevId), b = markerXY(to.id);
  if (!a || !b) return null;
  const res = crossing(a, b, conesNow(now), walls, { lit: night ? .2 : 1 });
  if (res.seen) post({ type: 'eden-map:stealth', from: nameOf(prevId), to: nameOf(to.id), dc: res.dc, seen: true, hits: res.hits, worst: res.worst || undefined });   // worst（最难的一下：目击者 + 坐标）W2 补发，检定失败环用
  return res;
}

function frame(ts) {
  if (!cx || !raf) return;
  if (!t0) t0 = ts;
  now = (ts - t0) / 1000;
  cx.clearRect(0, 0, W, H);
  if (osdViewer?.viewport && currentMapData?.routes?.length) {
    cx.lineWidth = 1;
    for (const c of conesNow(now)) {
      const poly = conePolygon(c, walls, 20); if (poly.length < 3) continue;
      const pts = [];
      for (const [x, y] of poly) { const p = toScreen(x, y); if (!p) { pts.length = 0; break; } pts.push(p); }
      if (pts.length < 3) continue;
      cx.beginPath(); cx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i].x, pts[i].y);
      cx.closePath();
      cx.fillStyle = night ? 'rgba(150,205,235,.14)' : 'rgba(150,205,235,.09)';
      cx.fill();
      cx.strokeStyle = night ? 'rgba(150,205,235,.5)' : 'rgba(150,205,235,.34)';
      cx.stroke();
      const apex = toScreen(c.x, c.y);
      if (apex) { cx.fillStyle = 'rgba(190,225,250,.85)'; cx.beginPath(); cx.arc(apex.x, apex.y, 2, 0, Math.PI * 2); cx.fill(); }
    }
  }
  raf = requestAnimationFrame(frame);
}
function start() { if (raf || !cx) return; t0 = 0; raf = requestAnimationFrame(frame); }
function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; if (cx) cx.clearRect(0, 0, W, H); }

let done = false;
export function registerVisionLayer() {
  if (done) return registry.has('vision'); done = true;
  registry.register({
    id: 'vision', slot: 'fx', kind: 'canvas', order: 25, initialVisible: true,
    menu: { order: 49, boxId: 'tgVision', labelKey: 'vision.layer', label: '视野锥', titleKey: 'vision.layer_title', title: '巡逻岗哨 / 机兵的警戒视野（沿地图自己的巡逻环在动）' },
    mount: () => {
      const host = slotEl('fx'); if (!host) return false;
      cv = document.createElement('canvas'); cv.className = 'vscv'; cv.setAttribute('aria-hidden', 'true');
      Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
      host.appendChild(cv); cx = cv.getContext('2d'); mounted = true; xyCache.clear(); size(); start();
      return true;
    },
    unmount: () => { stop(); mounted = false; try { cv?.remove(); } catch (e) {} cv = null; cx = null; },
    setVisible: v => { if (!mounted) return; cv.style.display = v ? '' : 'none'; v ? start() : stop(); },
  });
  busOn({ key: 'vision.resize', type: 'resize', fn: () => size() });
  busOn({ key: 'vision.hostMsg', type: 'message', fn: e => {
    if (!window.__isFromHost?.(e)) return;
    const d = e.data; if (!d) return;
    if (d.type === 'eden-map:clock') night = !!d.night;
    if (d.type === 'eden-map:here') tryMove(d.value, { replay: !!d.replay });
  } });
  visibilityGuard.subscribe(paused => { paused ? stop() : (registry.isVisible('vision') ? start() : null); });
  window.VisionApi = { cones: conesNow, markerOf, tryMove, setWalls: w => ((walls = w || []), xyCache.clear()), getWalls: () => walls.slice(), night: () => night };
  return true;
}
