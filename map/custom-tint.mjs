// 夜色（上层、中层；设置里可关，默认开）：按世界时间的时段给地图叠色调，也是多时段底图的开关（S5-1 自 custom-names-view.mjs 原样搬出；行为不变）。
// 叠色的样式表留在 custom-names-view.mjs（z-index 账本）；这里只管判定与 body 上的类 / 数据属性。
import { mapRegistry } from './app/state.mjs';
import { viewField } from './app/nodes-runtime.mjs';
import { pickPeriod } from './core/period-pick.mjs';
export const NIGHT_KEY = 'edenMapNight';
export function createTint({ getClock }) {
  const nightOn = () => { try { return LocalStore.get(NIGHT_KEY) !== '0'; } catch (e) { return true; } };
  // v0.9.6（B11 / C1）：按时段分四档（晨 / 日 / 暮 / 夜）；颜色只参考 docs/drafts/upper_tod_*.jpg 的整体色调，不另出图。夜档保留旧的 nighttint 类
  // 有效档位（关掉开关 / 读不到世界时间时为 ''）也是多时段底图（maps.json periods，app/map-switch.mjs）的依据；已配底图的档位（昼 / 夜）不再叠色调，免得双重变暗
  // U-FIX-4：时钟胶囊里选了时段（clock.view）= 用户明确要看这一档，开关关着也照用
  function todNow() { const clock = getClock(); return clock?.view || (nightOn() ? (clock?.tod || (clock?.night ? 'night' : '')) : ''); }
  function night() { const clock = getClock(), m = document.body.dataset.map, tier = viewField(m, 'x-tint') === 'period', on = (nightOn() || !!clock?.view) && tier;
    const tod = on ? (clock?.tod || (clock?.night ? 'night' : '')) : '';
    const swapped = pickPeriod(mapRegistry?.maps?.[m]?.periods, tod, clock?.bands).exact;   // 这档有自己的底图 → 不再叠色调（免得双重上色）；用的是邻档的底图时仍叠本档色调
    document.body.classList.toggle('nighttint', tod === 'night' && !swapped);
    if (swapped) document.body.dataset.baseTod = tod; else delete document.body.dataset.baseTod;   // 底图本身就是这一档：CSS 不再叠这一档的色调
    if (tod && tod !== 'day') document.body.dataset.tod = tod; else delete document.body.dataset.tod; }
  new MutationObserver(night).observe(document.body, { attributes: true, attributeFilter: ['data-map'] });
  return { night, nightOn, todNow };
}
