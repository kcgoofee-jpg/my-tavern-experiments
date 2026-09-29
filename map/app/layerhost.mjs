// 视口图层宿主（P3-C，docs/reviews/architecture_and_stream_perf.md §6）：LayerRegistry 的查看器侧装配。
// 核心契约（槽位、排序、滤镜链、摘要）在 core/layers.mjs（纯，测试机检）；这里只做查看器侧的事：
// ① registry 单例——各图层模块（fog / clouds / markers / events / trips / security…）向它注册，菜单与可见性调度都经它；
// ② initLayerHost——在 OSD 画布叠加上下文里按 SLOTS 挂 .vpslot 槽位容器（默认 pointer-events: none，见 viewer.html）；
// ③ window.TCLayers——调试 / 探针 / 自检读标准摘要的窗口面。
// 外层固定 UI（顶栏 / 弹层 / 设置 / 控制列）走 --zu-* 阶梯，不进注册中心。
import { LayerRegistry, SLOTS, slotZ } from '../core/layers.mjs';
import * as TCStore from '../core/storage.mjs';
import { $, tx } from './util.mjs';
import { REG, cur } from './state.mjs';
import { applyOverlayToggle, routeGaps } from './tiers.mjs';
import { ALT_KEY, swapBase } from './nav.mjs';
export const registry = new LayerRegistry();
let slots = null;
/** 在 OSD 画布叠加上下文（.openseadragon-canvas）里挂槽位容器；幂等，画布未就绪返回 false（boot 会在 open 后重试） */
export function initLayerHost(viewer) {
  if (slots) return true;
  const host = viewer?.drawer?.canvas?.parentNode; if (!host) return false;
  slots = {};
  for (const slot of SLOTS) {
    const el = document.createElement('div'); el.className = 'vpslot'; el.dataset.slot = slot; el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('z-index', String(slotZ(slot))); host.appendChild(el); slots[slot] = el;
  }
  return true;
}
export function slotEl(slot) { return slots?.[slot] || null; }
window.TCLayers = { registry, describe: () => registry.describe(), slotZ };

// ---------------- 核心图层登记 + #layList 数据驱动（P3-C 阶段 3）----------------
// 菜单行由 registry.menuRows() 渲染（menu.order 定序），各行的元素 id / 存储键 / 默认勾选与旧静态 #layList 完全一致——
// 事件层（events.mjs tgEvents）与安保层（security.mjs tgSec）在自己的模块里注册，菜单顺序照旧：国界、下方城市、航线、安保、行程、地名、标记、事态。
let coreDone = false;
export function registerCoreLayers() {
  if (coreDone) return; coreDone = true;
  // 岛屿结界轮廓（barriers）默认关（用户 2026-09-27，和航线一样；两者永久推迟，不再打磨），开了记在本机；世界图国界（dzi）照旧默认开
  registry.register({ id: 'base-overlay', slot: 'base', kind: 'osd', initialVisible: true,
    menu: { order: 10, id: 'tgOverlay', boxId: 'tgBorders', label: '国界' },
    setVisible: v => { if (REG.maps[cur]?.overlay?.type === 'barriers') { try { TCStore.set('edenMapBarriers', v ? '1' : '0'); } catch (e) {} } applyOverlayToggle(); } });
  registry.register({ id: 'alt-base', slot: 'base', kind: 'osd', order: 1, initialVisible: false,
    menu: { order: 20, id: 'tgAlt', boxId: 'tgAltBox', label: '显示下方城市', titleKey: 'alt_title', title: '高级：换成带下方城市的底图（图更大）', hidden: true },
    setVisible: v => { try { TCStore.set(ALT_KEY + cur, v ? '1' : '0'); } catch (e) {} return swapBase(); } });
  const routesOn = TCStore.get('edenMapRoutes') === '1';
  registry.register({ id: 'routes', slot: 'routes', kind: 'osd', initialVisible: routesOn,
    menu: { order: 30, id: 'tgRoutes', boxId: 'tgRoutesBox', labelKey: 'routes', label: '航线', titleKey: 'routes_title', title: '上层航线（金色虚线）与银冠堡巡逻环（淡蓝点划线）', hidden: true },
    setVisible: v => { document.body.classList.toggle('noroutes', !v); routeGaps(); try { TCStore.set('edenMapRoutes', v ? '1' : '0'); } catch (e) {} } });
  document.body.classList.toggle('noroutes', !routesOn);
  registry.register({ id: 'labels', slot: 'labels', kind: 'osd', initialVisible: true,
    menu: { order: 60, boxId: 'tgLabels', labelKey: 'labels', label: '地名' },
    setVisible: v => { const cb = $('#tgLabels'); if (cb) { cb.checked = v; cb.dispatchEvent(new Event('change')); } document.body.classList.toggle('nolabels', !v); } });
  registry.register({ id: 'markers', slot: 'markers', kind: 'osd', initialVisible: true,
    menu: { order: 70, boxId: 'tgMarkers', labelKey: 'markers', label: '标记' },
    setVisible: v => document.body.classList.toggle('nomarkers', !v) });
}
/** 渲染 #layList：行 = 菜单描述符（menu.order → 注册先后），勾选态来自 registry（存储键与默认值不变） */
export function renderLayerMenu() {
  const list = $('#layList'); if (!list) return;
  list.replaceChildren(...registry.menuRows().map(rec => {
    const m = rec.menu, lab = document.createElement('label'); lab.className = 'tg';
    if (m.id) lab.id = m.id;
    if (m.title) lab.title = m.titleKey ? tx(m.titleKey, m.title) : m.title;
    if (m.titleKey) lab.setAttribute('data-i18n-title', m.titleKey);
    if (m.hidden) lab.hidden = true;
    const span = document.createElement('span');
    span.textContent = m.labelKey ? tx(m.labelKey, m.label || '') : (m.label || '');
    if (m.labelKey) span.setAttribute('data-i18n', m.labelKey);
    const box = document.createElement('input'); box.type = 'checkbox'; box.setAttribute('role', 'switch');
    if (m.boxId) box.id = m.boxId;
    box.checked = registry.isVisible(rec.id);
    lab.append(span, box);
    box.addEventListener('change', () => registry.setVisible(rec.id, box.checked));
    return lab;
  }));
}
