// 视口图层宿主（P3-C，docs/reviews/architecture_and_stream_perf.md §6）：LayerRegistry 的查看器侧装配。
// 核心契约（槽位、排序、滤镜链、摘要）在 core/layers.mjs（纯，测试机检）；这里只做查看器侧的事：
// ① registry 单例——各图层模块（fog / clouds / markers / events / trips / security…）向它注册，菜单与可见性调度都经它；
// ② initLayerHost——在 OSD 画布叠加上下文里按 SLOTS 挂 .vpslot 槽位容器（默认 pointer-events: none，见 viewer.html）；
// ③ window.TCLayers——调试 / 探针 / 自检读标准摘要的窗口面。
// 外层固定 UI（顶栏 / 弹层 / 设置 / 控制列）走 --zu-* 阶梯，不进注册中心。
import { LayerRegistry, SLOTS, slotZ } from '../core/layers.mjs';
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
