// 动态线索节点（Part 6-3）的查看器侧渲染：把 core/quests.mjs 派发的节点画成会呼吸的圈。
// 数据源全是现成的：当前图的标记（地点 + 归一化坐标）与事态外挂的事件；不编势力、不编剧情——
// 哪里正在出事，全看事态自己说了什么（热度 = 大类权重 × 楼层差衰减，与 events.mjs 同口径）。
// 节拍与天气 / 车流一致：可见性守卫按下暂停位即停（P7-4）；节点每 2 s 重算一次（事态变了才动）。
import { registry, slotEl, declared } from './layer-host.mjs';
import { dispatch, tick } from '../core/quests.mjs';
import { seedOf } from '../core/rng.mjs';
import { busOn } from './bus.mjs';
import { visibilityGuard } from './visibility.mjs';
import { aspect, currentMapId, currentMapData, worldData, mapRegistry, osdViewer } from './state.mjs';
import { plugins } from './plugins.mjs';

let cv = null, cx = null, raf = 0, t0 = 0, W = 0, H = 0, mounted = false;
let list = [], day = 0, lastCalc = 0;

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

/** 当前图的地点：标记名（有 meta 就用 meta 的） + 归一化坐标 */
function placesNow() {
  const m = mapRegistry.maps[currentMapId], meta = m?.markers || {};
  return (currentMapData?.markers || []).map(k => ({ name: meta[k.id]?.name || k.name || k.id, nx: k.nx ?? k.ax, ny: k.ny ?? k.ay }))
    .filter(p => p.name && Number.isFinite(p.nx) && Number.isFinite(p.ny));
}
/** 世界日期 → 天序号（时钟没给日期时按会话内推进：同一份事态不会天天重排） */
export function setQuestDay(d) { day = Number(d) || 0; }
export function questDay(clock) { const s = String(clock?.date || clock?.full || ''); return s ? (seedOf(s) % 1000) : day; }

function recalc() {
  const t = Date.now(); if (t - lastCalc < 2000) return;   // 事态不是每帧都变，2 s 一次够了
  lastCalc = t;
  const events = (() => { try { return plugins.EventsView?.events || []; } catch (e) { return []; } })();
  const places = placesNow();
  const floor = Number(currentMapData?.floor ?? 0) || 0;
  let topFloor = floor;
  for (const e of events) if (Number.isFinite(Number(e.floor))) topFloor = Math.max(topFloor, Number(e.floor));
  list = tick(list, { events, places, floor: topFloor, day, seed: seedOf(String(currentMapId || ''), places.length) }).quests;
}

function frame(ts) {
  if (!cx || !raf) return;
  if (!t0) t0 = ts;
  const t = (ts - t0) / 1000;
  cx.clearRect(0, 0, W, H);
  if (ts - lastCalc >= 2000) recalc();
  for (const q of list) {
    const p = toScreen(q.nx, q.ny); if (!p) continue;
    if (p.x < -30 || p.y < -30 || p.x > W + 30 || p.y > H + 30) continue;
    const pulse = .5 + .5 * Math.sin(t * (1.2 + q.urgency * 1.8));
    const r = 9 + q.urgency * 10 + pulse * 5;
    cx.strokeStyle = `rgba(255,196,96,${(.25 + .55 * q.urgency * pulse).toFixed(3)})`;
    cx.lineWidth = 1.6;
    cx.beginPath(); cx.arc(p.x, p.y, r, 0, Math.PI * 2); cx.stroke();
    cx.fillStyle = `rgba(255,214,140,${(.35 + .5 * pulse).toFixed(3)})`;
    cx.beginPath(); cx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); cx.fill();
  }
  raf = requestAnimationFrame(frame);
}
function start() { if (raf || !cx) return; t0 = 0; raf = requestAnimationFrame(frame); }
function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; if (cx) cx.clearRect(0, 0, W, H); }

let done = false;
export function registerQuestLayer() {
  if (done) return registry.has('quests'); done = true;
  registry.register(declared('quests', {
    initialVisible: true,
    mount: () => {
      const host = slotEl('fx'); if (!host) return false;
      cv = document.createElement('canvas'); cv.className = 'qscv'; cv.setAttribute('aria-hidden', 'true');
      Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
      host.appendChild(cv); cx = cv.getContext('2d'); mounted = true; size(); start();
      return true;
    },
    unmount: () => { stop(); mounted = false; try { cv?.remove(); } catch (e) {} cv = null; cx = null; },
    setVisible: v => { if (!mounted) return; cv.style.display = v ? '' : 'none'; v ? start() : stop(); },
  }));
  busOn({ key: 'quests.resize', type: 'resize', fn: () => size() });
  busOn({ key: 'quests.hostMsg', type: 'message', fn: e => { if (window.__isFromHost?.(e) && e.data?.type === 'eden-map:clock') setQuestDay(questDay(e.data)); } });
  visibilityGuard.subscribe(paused => { paused ? stop() : (registry.isVisible('quests') ? start() : null); });
  window.QuestsApi = { now: () => list.slice(), setDay: setQuestDay, recalc };
  return true;
}
