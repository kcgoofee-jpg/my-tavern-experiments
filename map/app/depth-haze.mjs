// 空气透视（Part 8-3，2026-09-30）：纵深数学（core/depth.mjs）与图层系统（core/layer-registry.mjs）的闭环这一段。
//   depth.describe(depthData, …) → currentHaze ──core/haze.mjs──▶ 滤镜链 ──▶ LayerRegistry 的 depth-haze 槽位
//                                                                        └─▶ #fogCv 迷雾画布（app/fog.mjs）
// 当前纵深平面 d = 当前地点所在岛的 d（人就在这儿 → 看的就是这一层的空气）；没解析出地点按近处（d = 0）。
// 切层 / 换图 / 当前地点变了 / 迷雾数据来了都重算一次，缩放时由视口变化带动当前地点解析，不需要另挂钩子。
//   滤镜只挂在这一层的元素上（backdrop-filter：模糊 + 去饱和 + 提亮），不动底图、不动标记；
//   省流档（lean）不挂——全屏 backdrop-filter 是实打实的合成开销。
import { describe as depthDescribe, island as depthIsland } from '../core/depth.mjs';
import * as Haze from '../core/haze.mjs';
import { cssFilter } from '../core/layer-registry.mjs';
import { registry, slotEl } from './layer-host.mjs';
import { mapRegistry, currentMapId, currentMapData, depthData } from './state.mjs';
import { lean } from './sharpness-tiers.mjs';
import { busOn } from './bus.mjs';

const ID = 'depth-haze';
const CSS_ID = 'hazeCss';
// 样式在本模块注入（stash-markers.mjs / wander.mjs 一个路子）：viewer.html 不为这一层留 CSS。
// 铺满视口、不吃点击；真正的滤镜值由 core/haze.mjs 算出来后写进 backdrop-filter。
const CSS = `.hazeveil { position: absolute; inset: 0; pointer-events: none; }`;
let el = null, d = 0, haze = 0, watch = null;

function css() { if (document.getElementById(CSS_ID)) return;
  const s = document.createElement('style'); s.id = CSS_ID; s.textContent = CSS; document.head.appendChild(s); }

/** 当前纵深：当前地点（.mk.here）所在岛的 d；认不出 / 没配纵深数据 = 0（近处） */
export function currentDepth() {
  const name = document.querySelector('.mk.here')?.dataset?.name;
  const metas = mapRegistry?.maps?.[currentMapId]?.markers;
  if (!name || !metas || !depthData?.islands) return 0;
  for (const m of Object.values(metas)) {
    if (m?.name !== name || !m.island || !depthData.islands[m.island]) continue;
    try { const v = depthIsland(m.island, depthData).d; return Number.isFinite(v) ? v : 0; } catch (e) { return 0; }
  }
  return 0;
}

/** 纵深系统标准化摘要（core/depth.mjs 的 describe）：maxDepth / currentHaze / exploredRatio / fogEnabled */
export function depthSummary() {
  return depthDescribe(depthData, {
    depth: d, map: currentMapId, markers: currentMapData?.markers?.length || 0,
    explored: window.FogApi?.raw?.() || {}, fogEnabled: window.FogApi?.on?.(),
  });
}

/** 当前挂着的滤镜链（探针 / 自检看：与 registry.filters('depth-haze') 同源） */
export const hazeChain = () => Haze.chain(haze);

function mount() {
  const host = slotEl('depth-haze'); if (!host) return false;
  if (!el) { el = document.createElement('div'); el.className = 'hazeveil'; el.setAttribute('aria-hidden', 'true'); }
  if (el.parentNode !== host) host.appendChild(el);
  return true;
}

/** 重算 + 上滤镜：一层挂 backdrop-filter，迷雾画布同一条链（app/fog.mjs 的 setHaze） */
export function applyHaze() {
  d = currentDepth();
  const s = depthSummary(); haze = s.currentHaze;
  const ch = Haze.chain(haze);
  if (registry.has(ID)) registry.setFilters(ID, ch);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(Haze.vars(haze))) root.style.setProperty(k, v);
  const css = lean() || !el ? '' : cssFilter(ch);   // 省流档：不花这份合成开销
  if (el) { el.style.backdropFilter = css; el.style.webkitBackdropFilter = css; el.style.display = css ? '' : 'none'; }
  try { window.FogApi?.setHaze?.(ch); } catch (e) {}
  return s;
}

let done = false;
export function registerDepthHazeLayer() {
  if (done) return registry.has(ID); done = true;
  registry.register({
    id: ID, slot: 'depth-haze', kind: 'dom', order: 0, initialVisible: true,
    mount: () => { css(); const ok = mount(); applyHaze(); return ok; },
    unmount: () => { try { el?.remove(); } catch (e) {} el = null; },
    setVisible: v => { if (!v && el) el.style.display = 'none'; else applyHaze(); },
  });
  // 切层 / 换图：body 的 data-map 变了就跟着重算（stash-markers.mjs 一个路子）；当前地点 / 迷雾数据由宿主消息带过来
  try { watch = new MutationObserver(() => setTimeout(applyHaze, 0)); watch.observe(document.body, { attributes: true, attributeFilter: ['data-map'] }); } catch (e) {}
  busOn({ key: 'depthhaze.hostMsg', type: 'message', fn: e => {
    if (!window.__isFromHost?.(e)) return;
    const t = e.data?.type;
    if (t === 'eden-map:here' || t === 'eden-map:fog' || t === 'eden-map:clock') setTimeout(applyHaze, 0);
  } });
  window.DepthHazeApi = { apply: applyHaze, summary: depthSummary, depth: currentDepth, chain: hazeChain, describe: () => Haze.describe(haze) };
  return true;
}
