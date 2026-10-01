// 夜色（上层、中层；设置里可关，默认开）：按世界时间的时段给地图叠色调，也是多时段底图的开关（S5-1 自 custom-names-view.mjs 原样搬出；行为不变）。
// 叠色的样式表留在 custom-names-view.mjs（z-index 账本）；这里只管判定与 body 上的类 / 数据属性。
import { mapRegistry } from './app/state.mjs';
import { viewField } from './app/nodes-runtime.mjs';
export const NIGHT_KEY = 'edenMapNight';
export function createTint({ getClock }) {
  const nightOn = () => { try { return LocalStore.get(NIGHT_KEY) !== '0'; } catch (e) { return true; } };
  // v0.9.6（B11 / C1）：按时段分四档（晨 / 日 / 暮 / 夜）；颜色只参考 docs/drafts/upper_tod_*.jpg 的整体色调，不另出图。夜档保留旧的 nighttint 类
  // 有效档位（关掉开关 / 读不到世界时间时为 ''）也是多时段底图（maps.json periods，app/map-switch.mjs）的依据；已配底图的档位（昼 / 夜）不再叠色调，免得双重变暗
  function todNow() { const clock = getClock(); return nightOn() ? (clock?.tod || (clock?.night ? 'night' : '')) : ''; }
  function night() { const clock = getClock(), m = document.body.dataset.map, tier = viewField(m, 'x-tint') === 'period', on = nightOn() && tier;
    const tod = on ? (clock?.tod || (clock?.night ? 'night' : '')) : '';
    const swapped = typeof mapRegistry !== 'undefined' && !!mapRegistry?.maps?.[m]?.periods?.[tod === 'day' || tod === 'night' ? tod : ''];
    document.body.classList.toggle('nighttint', tod === 'night' && !swapped);
    if (tod && tod !== 'day') document.body.dataset.tod = tod; else delete document.body.dataset.tod; }
  new MutationObserver(night).observe(document.body, { attributes: true, attributeFilter: ['data-map'] });
  return { night, nightOn, todNow };
}
