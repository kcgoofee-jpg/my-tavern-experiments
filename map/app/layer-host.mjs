// 视口图层宿主（P3-C，docs/reviews/architecture_and_stream_perf.md §6）：LayerRegistry 的查看器侧装配。
// 核心契约（槽位、排序、滤镜链、摘要）在 core/layer-registry.mjs（纯，测试机检）；这里只做查看器侧的事：
// ① registry 单例——各图层模块（fog / clouds / markers / events / trips / security…）向它注册，菜单与可见性调度都经它；
// ② initLayerHost——在 OSD 画布叠加上下文里按 SLOTS 挂 .vpslot 槽位容器（默认 pointer-events: none，见 viewer.html）；
// ③ window.LayerHostApi——调试 / 探针 / 自检读标准摘要的窗口面。
// 外层固定 UI（顶栏 / 弹层 / 设置 / 控制列）走 --zu-* 阶梯，不进注册中心。
import { LayerRegistry, SLOTS, slotZ } from '../core/layer-registry.mjs';
import { KERNEL_LAYERS, kernelDecl } from '../core/layer-defaults.mjs';
import { mergeLayers } from '../core/layer-spec.mjs';
import * as storage from '../core/storage.mjs';
import { $ } from './dom-helpers.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { mapRegistry, currentMapId } from './state.mjs';
import { applyOverlayToggle, routeGaps } from './sharpness-tiers.mjs';
import { ALT_KEY, swapBase } from './map-switch.mjs';
import { LANG } from './i18n.mjs';
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
/** declared(id, impl)：内核宣告（core/layer-defaults.mjs，K-R79）+ 模块自己的函数 → 注册用的描述符；未知 id 抛错 */
export function declared(id, impl = {}) {
  const d = kernelDecl(id); if (!d) throw new Error(`layers: ${id} 不在内核图层清单`);
  return { ...d, ...impl };
}
export let packLayers = [], layerProblems = [];
const adjust = new Map(); let hooked = false;
const patchOf = a => { const p = { ...a }; if (p.menu) { p.menu = { ...p.menu }; if (p.menu.label !== undefined) p.menu.labelKey = undefined; if (p.menu.title !== undefined) p.menu.titleKey = undefined; } return p; };
/** applyPackLayers(rows)（K-R79 / K-R85）：设定包的 layers 行并上内核清单；内核层的调整经 registry.patch（还没注册的等注册时补上），新层留在 packLayers（S8-2 画）；然后再渲染一次菜单 */
export function applyPackLayers(rows) {
  const r = mergeLayers(KERNEL_LAYERS, rows, { trust: 'pack' }); layerProblems = r.problems;
  packLayers = r.layers.filter(l => l.origin !== 'kernel');
  adjust.clear(); for (const l of r.layers) if (l.adjust) adjust.set(l.id, patchOf(l.adjust));
  for (const [id, p] of adjust) if (registry.has(id)) registry.patch(id, p);
  if (adjust.size && !hooked) { hooked = true; registry.onRegister(id => { const p = adjust.get(id); if (p) registry.patch(id, p); }); }
  renderLayerMenu();
}
window.LayerHostApi = { registry, describe: () => registry.describe(), slotZ, problems: () => layerProblems };

// ---------------- 核心图层登记 + #layList 数据驱动（P3-C 阶段 3）----------------
// 菜单行由 registry.menuRows() 渲染（menu.order 定序），各行的元素 id / 存储键 / 默认勾选与旧静态 #layList 完全一致——
// 事件层（events.mjs tgEvents）与安保层（security.mjs tgSec）在自己的模块里注册，菜单顺序照旧：国界、下方城市、航线、安保、行程、地名、标记、事态。
let coreDone = false;
export function registerCoreLayers() {
  if (coreDone) return; coreDone = true;
  // 岛屿结界轮廓（barriers）默认关，开了记在本机；世界图国界（dzi）默认开；航线（routes）默认开（S8-2 用户范围追加：2026-09-27 的「航线推迟」决定作废），用户关掉的记在本机
  registry.register(declared('base-overlay', { initialVisible: true,
    setVisible: v => { if (mapRegistry.maps[currentMapId]?.overlay?.type === 'barriers') { try { storage.set('edenMapBarriers', v ? '1' : '0'); } catch (e) {} } applyOverlayToggle(); } }));
  registry.register(declared('alt-base', { initialVisible: false,
    setVisible: v => { try { storage.set(ALT_KEY + currentMapId, v ? '1' : '0'); } catch (e) {} return swapBase(); } }));
  const routesOn = storage.get('edenMapRoutes') !== '0';
  registry.register(declared('routes', { initialVisible: routesOn,
    setVisible: v => { document.body.classList.toggle('noroutes', !v); routeGaps(); try { storage.set('edenMapRoutes', v ? '1' : '0'); } catch (e) {} } }));
  document.body.classList.toggle('noroutes', !routesOn);
  registry.register(declared('labels', { initialVisible: true,
    setVisible: v => { const cb = $('#tgLabels'); if (cb) { cb.checked = v; cb.dispatchEvent(new Event('change')); } document.body.classList.toggle('nolabels', !v); } }));
  registry.register(declared('markers', { initialVisible: true,
    setVisible: v => document.body.classList.toggle('nomarkers', !v) }));
}
var rowPass = null;   // var + a function declaration: declared-layers.mjs registers during the import cycle
/** the applicability pass over the menu rows (greying with a reason, S7-2 T4); registered by declared-layers.mjs, run after every render of the menu */
export function setRowPass(fn) { rowPass = fn; }
/** 渲染 #layList：行 = 菜单描述符（menu.order → 注册先后），勾选态来自 registry（存储键与默认值不变） */
export function renderLayerMenu() {
  const list = $('#layList'); if (!list) return;
  if (!document.getElementById('lyDescCss')) { const st = document.createElement('style'); st.id = 'lyDescCss'; st.textContent = '#layPop .tg{padding:var(--sp-3) 0;box-sizing:border-box}.tg .lyt{display:flex;flex-direction:column;min-width:0}#layPop .tg .lyt small,#setPop .tg .lyt small{margin:0;color:var(--muted);font-size:var(--fs-micro);line-height:1.35}#layList .lyh{margin:var(--sp-4) 0 var(--sp-2);font:600 var(--fs-small)/1.4 var(--font-ui);color:var(--ink-2)}#layList .lyna .tg{min-height:44px}#layList .tg.na>.lyt>span{color:var(--muted)}#layList .tg.na .lyw{display:block;margin:0;color:var(--muted);font-size:var(--fs-micro);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'; document.head.appendChild(st); }
  list.replaceChildren(...registry.menuRows().map(rec => {
    const m = rec.menu, lab = document.createElement('label'); lab.className = 'tg'; lab.dataset.layer = rec.id;
    if (m.id) lab.id = m.id;
    const tx = m.i18n?.[LANG]?.title ?? m.title;   // 设定包的行文字优先（K-R83）；内核行仍走字典
    if (tx) lab.title = m.titleKey && !m.i18n?.[LANG]?.title ? uiTextOr(m.titleKey, tx) : tx;
    if (m.titleKey) lab.setAttribute('data-i18n-title', m.titleKey);
    if (m.hidden || (rec.countNow && !rec.countNow())) lab.hidden = true;   // countNow: a kernel layer that shows its row only while it holds something (nav-ops, local-props)
    const span = document.createElement('span');
    span.textContent = m.i18n?.[LANG]?.label ?? (m.labelKey ? uiTextOr(m.labelKey, m.label || '') : (m.label || ''));
    if (m.labelKey) span.setAttribute('data-i18n', m.labelKey);
    const box = document.createElement('input'); box.type = 'checkbox'; box.setAttribute('role', 'switch');
    if (m.boxId) box.id = m.boxId;
    box.checked = registry.isVisible(rec.id);
    const desc = document.createElement('small');   // N10 (13): one muted description line per layer (the row's title); none when the row has no title
    if (tx) { desc.textContent = lab.title; if (m.titleKey && !m.i18n?.[LANG]?.title) desc.setAttribute('data-i18n', m.titleKey); }
    const col = document.createElement('div'); col.className = 'lyt'; col.append(span); if (tx) col.append(desc);
    lab.append(col, box);
    box.addEventListener('change', () => registry.setVisible(rec.id, box.checked));
    return lab;
  }));
  rowPass?.();
}
