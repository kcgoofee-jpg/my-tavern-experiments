// 空间化背包 · 查看器侧（Part 5-1）：宿主推来的 eden-map:inv（聊天变量 eden_map.仓库）落在地点卡上——
// 打开某房间的地点卡，能看到这里存放 / 藏起来的东西（CRPG 搜刮感）。编辑走宿主 EdenMap.setInv / removeInv
//（本机扩展接口，docs/content-compat.md）；单独打开地图（无宿主）时没有数据源，列表为空不显示。
// 插件模式与 custom-names-view.mjs 一致（app/plugins.mjs 的 P.StashView；没加载时调用处带守卫）。
import { esc } from './app/dom-helpers.mjs';
import { register } from './app/plugins.mjs';
import { uiTextOr } from './app/text-lookup.mjs';
const StashView = (() => {
  let items = [];   // [{ id, 名, 地点, 层, 暗格, 说明?, 数量? }]
  function fromHost(d) { items = Array.isArray(d?.items) ? d.items : []; }
  /** 地点卡装饰（markers.mjs 在 CustomNamesView.decorateCard 之后调）：先清旧行（卡片复用），该地点有存放物才加一行 */
  function decorate(el, title) {
    const c = document.getElementById('card'); if (!c || c.hidden) return;
    const ex = c.querySelector('.extra'); if (!ex) return;
    ex.querySelectorAll('.cu-inv').forEach(n => n.remove());
    const key = title || el?.dataset?.name;
    const here = items.filter(i => i.地点 === key);
    if (!here.length) return;
    const p = document.createElement('p'); p.className = 'cu-inv';
    p.innerHTML = `<b>${esc(uiTextOr('inv.stored', '存放'))}</b> `;
    p.append(document.createTextNode(here.map(rowText).join('、')));
    ex.prepend(p);
  }
  const rowText = e => (e.暗格 ? uiTextOr('inv.hidden', '暗格·') + e.名 : e.名) + (e.数量 > 1 ? '×' + e.数量 : '');
  return { fromHost, decorate, get rows() { return items.map(i => ({ ...i })); } };
})();
register('StashView', StashView);
