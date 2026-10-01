// 本人着装（宿主推来的着装文字；着装显示在人物页顶部「你（主角）」一行，见 characters-view.mjs）：这里只存最近一份并通知事态栏重画（S5-1 自 custom-names-view.mjs 原样搬出）。
import { P } from './app/plugins.mjs';
export function createOutfit() {
  let outfit = null;
  function setOutfit(o) { outfit = o && o.text ? o : null; P.EventsView?.renderBar?.(); }
  return { setOutfit, get outfit() { return outfit; } };
}
