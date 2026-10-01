// 地图事件层的「盖在地图上的效果」：按类型声明的屏幕特效（花屏）与世界图城市标记上的事态数角标（S5-1 自 events.mjs 原样搬出；行为不变）。
// 状态与事件表仍在 events.mjs 的 TCEvents 里，这里经依赖对象取（活的变量 = 取值函数）；花屏的样式表留在 events.mjs（z-index 账本）。
import { REG, cur } from './app/state.mjs';
import { $ } from './app/dom-helpers.mjs';
import { announce } from './app/screen-reader-announce.mjs';
import { eventGeo, inScope, worldGroup } from './app/nodes-runtime.mjs';
export function createEventsFx({ T, all, vis, live, mapOf, isShown, floorNow, evm }) {
  let glitchLv = 0;
  // 屏幕特效（花屏）：类型声明 fx 为 glitch 的事件，在它影响的层（或全城）持续期内「花屏」：间歇的色散、横向撕裂、马赛克块，强度随等级（预设给了 intensity 就按它）；配 ⚠ 与提示，一看就知道是剧情。持续楼数：事件的 duration，否则预设的 x-messages，否则 3
  const fxOf = e => (e.fx !== undefined ? e.fx : evm()?.classify(e.cat).fx) || null;
  const fxLevel = (e, f) => (typeof f.intensity === 'number' ? Math.round(f.intensity * 3) : Math.max(1, e.lvl));
  function applyGlitch() {
    const lv = !isShown() ? 0 : Math.max(0, ...all().filter(e => fxOf(e)?.block === 'glitch' && !e.closed && (e.feed || floorNow() - e.last <= (e.dur || fxOf(e)['x-messages'] || 3)) &&
      ((e.scope && inScope(e.scope, cur)) || mapOf(e) === cur || (e.scope && eventGeo()?.place(e.scope)?.map === cur))).map(e => fxLevel(e, fxOf(e))));
    document.body.dataset.glitch = lv || '';
    $('#glitchNote').hidden = !lv; $('#glitchNote').textContent = T('ev.glitch', '⚠ 数据链路受扰');
    if (lv && !glitchLv && typeof announce === 'function') announce(T('ev.glitch', '⚠ 数据链路受扰').replace(/^⚠\s*/, ''));   // 花屏开始时播报一次
    glitchLv = lv;
  }
  // 世界图：城内未解除的事件汇成城市标记上的一个数字角标
  function worldBadge() {
    const n = vis().filter(e => live(e) && mapOf(e) && mapOf(e) !== 'world').length;
    const wg = worldGroup(REG), lab = [...document.querySelectorAll('.mk')].find(x => x.dataset.group === wg)?.querySelector('.lab');
    if (lab) { if (n) lab.dataset.ev = n; else delete lab.dataset.ev; }
  }
  return { applyGlitch, worldBadge };
}
