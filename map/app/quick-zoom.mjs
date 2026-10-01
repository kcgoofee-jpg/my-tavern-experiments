// 双击缩放：手机单指缩放（S5-2 自 shell.mjs 拆出，行为不变）。
import { osdViewer } from './state.mjs';
import { $ } from './dom-helpers.mjs';
import { setUserMoved } from './locate.mjs';
// 单指缩放（像 Google 地图）：双击后第二下按住不放，往下拖放大、往上拖缩小；双击不拖 = 放大一倍。
// 只接手机触摸（pointerType = touch）、只在瓦片地图 #osd 上（主场景 iframe 不在里面）；第二下按下时截住事件，不让地图库当成平移；多指捏合照旧
export function initQuickZoom() {
  const box = $('#osd'), SLOP = 10, TAP_MS = 300, GAP_MS = 320, GAP_PX = 40, rmq = matchMedia('(prefers-reduced-motion: reduce)');
  let tap = null, down = null, qz = null, lastQz = 0;
  const swallow = e => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };
  const px = e => { const r = osdViewer.container.getBoundingClientRect(); return new OpenSeadragon.Point(e.clientX - r.left, e.clientY - r.top); };
  box.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    if (qz || down) { qz = down = tap = null; return; }   // 第二根手指：不是单指手势
    const onMark = e.target.closest?.('.mk, .ev, .realm');
    if (!onMark && tap && e.timeStamp - tap.t < GAP_MS && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < GAP_PX && osdViewer.world.getItemCount() && !document.body.classList.contains('estate')) {
      swallow(e); tap = null; const vp = osdViewer.viewport;
      qz = { id: e.pointerId, y: e.clientY, z0: vp.getZoom(true), ref: vp.pointFromPixel(px(e), true), moved: false }; return;
    }
    tap = null; down = onMark ? null : { id: e.pointerId, t: e.timeStamp, x: e.clientX, y: e.clientY };
  }, true);
  box.addEventListener('pointermove', e => {
    if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > SLOP) down = null;
    if (!qz || e.pointerId !== qz.id) return; swallow(e);
    const dy = e.clientY - qz.y; if (!qz.moved && Math.abs(dy) < SLOP) return; qz.moved = true;
    const vp = osdViewer.viewport; vp.zoomTo(Math.min(vp.getMaxZoom(), Math.max(vp.getMinZoom(), qz.z0 * 2 ** (dy / 120))), qz.ref, true); setUserMoved(true);
  }, true);
  const up = e => {
    if (down && e.pointerId === down.id) { if (e.type === 'pointerup' && e.timeStamp - down.t < TAP_MS) tap = { t: e.timeStamp, x: e.clientX, y: e.clientY }; down = null; }
    if (!qz || e.pointerId !== qz.id) return; swallow(e);
    const vp = osdViewer.viewport;
    if (!qz.moved && e.type === 'pointerup') { vp.zoomTo(Math.min(vp.getMaxZoom(), qz.z0 * 2), qz.ref, rmq.matches); setUserMoved(true); }   // 减少动效：直接跳到位
    vp.applyConstraints(); qz = null; lastQz = performance.now();
  };
  box.addEventListener('pointerup', up, true); box.addEventListener('pointercancel', up, true);
  box.addEventListener('dblclick', e => { if (performance.now() - lastQz < 600) e.stopPropagation(); }, true);   // 浏览器补发的 dblclick 不再让地图库再放大一次
}
