// 夜色（上层、中层；设置里可关，默认开）：按世界时间的时段给地图叠色调，也是多时段底图的开关（S5-1 自 custom-names-view.mjs 原样搬出；行为不变）。
// 叠色的样式表留在 custom-names-view.mjs（z-index 账本）；这里只管判定与 body 上的类 / 数据属性。
import { mapRegistry } from './app/state.mjs';
import { viewField } from './app/nodes-runtime.mjs';
import { pickPeriod, tintBand } from './core/period-pick.mjs';
import { altOn } from './app/map-switch.mjs';
import { periodsOf } from './app/oblique.mjs';
export const NIGHT_KEY = 'edenMapNight';
export function createTint({ getClock }) {
  const nightOn = () => { try { return LocalStore.get(NIGHT_KEY) !== '0'; } catch (e) { return true; } };
  // v0.9.6（B11 / C1）：按时段分四档（晨 / 日 / 暮 / 夜）；颜色只参考 docs/drafts/upper_tod_*.jpg 的整体色调，不另出图。
  // 有效档位（关掉开关 / 读不到世界时间时为 ''）也是多时段底图（maps.json periods，app/map-switch.mjs）的依据；已配底图的档位（昼 / 夜）不再叠色调，免得双重变暗
  // U-FIX-4：时钟胶囊里选了时段（clock.view）= 用户明确要看这一档，开关关着也照用
  // FOG-1（D40 / A7）：合成模式（alt.composite）各层都取自己的时段底图，与「这档有自己的底图」同样不再叠色 —— 旧式 alt 备用底图
  //（没有 composite、没有时段版本）照旧叠色；完全没有时段底图的图（世界图 / 各地点图）改挂 data-gradetod，由 A7 的整体调色接管。
  function todNow() { const clock = getClock(); return clock?.view || (nightOn() ? (clock?.tod || (clock?.night ? 'night' : '')) : ''); }
  function night() { const clock = getClock(), m = document.body.dataset.map, tier = viewField(m, 'x-tint') === 'period', on = (nightOn() || !!clock?.view) && tier;
    const tod = on ? (clock?.tod || (clock?.night ? 'night' : '')) : '';
    const variants = periodsOf(mapRegistry?.maps?.[m]);   // 档位表按当前视图取（斜视 / 俯视，app/oblique.mjs）
    const pick = pickPeriod(variants, tod, clock?.bands);
    const legacyAlt = altOn(m) && !!mapRegistry?.maps?.[m]?.alt?.base && !mapRegistry?.maps?.[m]?.alt?.composite;
    const swapped = !legacyAlt && pick.exact;
    document.body.classList.toggle('nighttint', tod === 'night' && !swapped && !!pick.src);
    if (swapped) document.body.dataset.baseTod = tod; else delete document.body.dataset.baseTod;   // 底图本身就是这一档：CSS 不再叠这一档的色调
    // 整体调色（A7）：完全没有时段底图的图；这一档自己的图缺、借了相邻档的图；或多个档共用一张图时借用方（中层晨用昏图、下层两班，
    // OBLIQUE-CODE 时段）——显示的图都不是「这一档自己的」，按当前时段调色区分
    const grade = pick.src === null && tod ? tod : (!pick.exact && tod) || tintBand(variants, pick, clock?.bands);
    if (grade) document.body.dataset.gradetod = grade; else delete document.body.dataset.gradetod;
    if (tod && tod !== 'day') document.body.dataset.tod = tod; else delete document.body.dataset.tod; }
  new MutationObserver(night).observe(document.body, { attributes: true, attributeFilter: ['data-map'] });
  document.addEventListener('change', e => { if (e.target?.id === 'tgAltBox') setTimeout(night, 0); });   // 备用底图开 / 关：色调判定跟着变
  return { night, nightOn, todNow };
}
