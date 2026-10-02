// 状态点 #stDot：加载 / 档位状态的圆点与读屏标签（S5-2 自 shell.mjs 拆出，行为不变）。
import { $ } from './dom-helpers.mjs';
import { uiTextOr } from './text-lookup.mjs';
export function stDotLabel() { const ts = $('#tierState'), d = $('#stDot'); if (!d) return; const txt = ts.textContent || uiTextOr('loaded', '已加载');
  d.setAttribute('aria-label', uiTextOr('s.status', '状态') + '：' + txt); d.title = ts.classList.contains('stuck') ? txt : txt; }
export function flashOk() { const d = $('#stDot'); d.classList.add('flash'); setTimeout(() => d.classList.remove('flash'), 1400); }
export function initStatusDot() {
  $('#stDot').onclick = () => { const ts = $('#tierState'); if (ts.classList.contains('stuck')) ts.click(); };
  new MutationObserver(stDotLabel).observe($('#tierState'), { attributes: true, childList: true, characterData: true, subtree: true });
}
