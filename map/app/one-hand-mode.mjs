// 单手模式：「⋯」设置首页的动作、惯用手切换与悬浮按钮跟随、手机单指缩放（S5-2 自 shell.mjs 拆出，行为不变）。
import { $ } from './dom-helpers.mjs';
import { postState } from './i18n.mjs';
import { busOn } from './bus.mjs';   // P2-3：全局监听统一登记
import { initActs } from './control-column.mjs';
import { initQuickZoom } from './quick-zoom.mjs';
export function initE7() {
  initActs();
  // 惯用手
  const hs = $('#handSeg');
  const paint = () => hs.querySelectorAll('button').forEach(b => { const on = b.dataset.hand === window.__hand; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  hs.addEventListener('click', e => { const b = e.target.closest('button[data-hand]'); if (!b) return;
    window.__hand = b.dataset.hand; try { LocalStore.set('edenMapHand', window.__hand); } catch (err) {}
    window.__applyHand(); paint(); postState(); });
  paint();
  busOn({ key: 'shell.storage', type: 'storage', fn: e => { if (e.key === 'edenMapFabPos' && window.__hand === 'auto') window.__applyHand(); } });   // 自动：悬浮按钮拖到另一边，地图跟着换
  initQuickZoom();
}
