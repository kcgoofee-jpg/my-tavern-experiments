// 地图切换：go（带可注册的包装）、snapshot、mapChrome、另一版底图。
import { mapRegistry, currentMapId, currentMapData, overviewMapData, pendingFocus, setCurrentMapId, setCurrentMapData, setOverviewMapData, setDepthData, setPendingFocus, osdViewer } from './state.mjs';
import { $ } from './dom-helpers.mjs';
import { getJSON } from './json-cache.mjs';
import { applyTier } from './sharpness-tiers.mjs';
import { localName, postState, uiText } from './i18n.mjs';
import { dropParked, estateFocus, leaveEstate, openEstate } from './subpage3d-host.mjs';
import { renderNav } from './map-level-nav.mjs';
import { closeCard } from './markers.mjs';
import { applyZoomLimit, focusMarker, setUserMoved, userMoved } from './locate.mjs';
import { baseFrame } from '../core/base-frame.mjs';
import { plugins } from './plugins.mjs';
import { syncGlow } from './theme.mjs';
import { pickPeriod } from '../core/period-pick.mjs';
// ---------------- 地图切换 ----------------
// alt：同一张图的另一版底图（上层默认云海，开关后显示下方城市）。只换底图，视角、标记、叠加层都不动；开关状态按地图记住
export const ALT_KEY = 'edenMapAlt:';
export const altOn = id => { try { return LocalStore.get(ALT_KEY + id) === '1'; } catch (e) { return false; } };
// periods：多时段底图（maps.json）。按世界时钟的有效档位换（P.CustomNamesView.todNow，关掉时段色调时为空 = 恒用 base）；档位取自包的时段（K-R39，
// 时钟消息带 bands）。地图没有该档位的底图时取顺序上最近的一档（core/period-pick.mjs；平手取不暗的、再取靠前的），一档都没有 = base
const periodOf = id => { const c = plugins.CustomNamesView?.clock; return pickPeriod(mapRegistry.maps[id]?.periods, plugins.CustomNamesView?.todNow?.() || '', c?.bands).src; };
export const srcKey = b => (b && typeof b === 'object' ? b.url : b);   // 底图可以是 DZI 路径，也可以是 { type: 'image', url }（schema-2 包的示意图 / 单张图，K-R96）
const baseOf = id => { const m = mapRegistry.maps[id]; return m.alt && altOn(id) ? m.alt.base : (periodOf(id) || m.base); };
let lastBase = null;   // 第 0 层当前用的底图地址（go 打开 / swapBase 换上时记；applyPeriod 拿它判断要不要换）
// 底图一律按视图范围（view.extent_m）摆：一个世界单位宽、从原点起，与 DZI 有多少像素无关（N10-P0）；标记 / 路线 / 缩放上限都是视图的比例
const placeOf = id => { const f = baseFrame(mapRegistry.maps[id]?.view?.extent_m); return { x: f.x, y: f.y, width: f.width }; };
// N13：底图（或失败时的占位底图）无论像素多少都落在视图框里；不在框里就拨回去。占位底图 = 中性的一张图，同样按视图框摆，标记 / 路线 / 缩放上限照常对得上
export function snapToFrame(id = currentMapId) {
  const it = osdViewer?.world.getItemAt(0), f = baseFrame(mapRegistry.maps[id]?.view?.extent_m); if (!it || !f.aspect) return;
  const b = it.getBounds(true), bad = Math.abs(b.x - f.x) > 1e-4 || Math.abs(b.y - f.y) > 1e-4 || Math.abs(b.width - f.width) > 1e-4;
  if (bad) { it.setPosition(new OpenSeadragon.Point(f.x, f.y), true); it.setWidth(f.width, true); }
}
export function placeholderSource(id = currentMapId) {
  const a = baseFrame(mapRegistry.maps[id]?.view?.extent_m).aspect || .625, W = 1000, H = Math.round(W * a);
  return { type: 'image', url: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#1a1d24"/><path d="M0 0H${W}V${H}H0Z" fill="none" stroke="#2c313c" stroke-width="2"/></svg>`) };
}
let phId = null;   // 这张图已经换过占位底图（每次打开最多一次，go 重置）
export function openPlaceholder(id = currentMapId, then) {   // 底图的 DZI 打不开：换一张占位底图，视图框、标记、缩放上限照常，失败提示由调用方在 open 之后再亮出来
  const m = mapRegistry.maps[id]; if (!m || m.kind === 'estate' || !osdViewer || phId === id) return false; phId = id;
  osdViewer.addOnceHandler('open', () => { snapToFrame(id); then?.(); });
  osdViewer.open([{ tileSource: placeholderSource(id), ...placeOf(id) }]); return true;
}
export function swapBase() {
  const id = currentMapId, old = osdViewer.world.getItemAt(0); if (!old) return;
  const was = lastBase, altWanted = !!(mapRegistry.maps[id]?.alt && altOn(id));
  lastBase = baseOf(id);
  osdViewer.addTiledImage({ tileSource: baseOf(id), index: 0, ...placeOf(id), success: e => {
      // 加载期间世界被 open() 换掉了（切图）或又换了一档：这张不用了，别让它混进新世界
      if (currentMapId !== id || osdViewer.world.getIndexOfItem(old) < 0) { try { osdViewer.world.removeItem(e.item); } catch (x) {} return; }
      osdViewer.world.removeItem(old); snapToFrame(id); applyTier(); applyZoomLimit(); },   // 缩放上限按新底图的像素重算（原来沿用上一档底图的像素数）
    error: () => { if (!altWanted) { lastBase = was; return; }   // 时段底图打不开：留着现在的底图，下次时钟变化再试（N13）
      try { LocalStore.remove(ALT_KEY + id); } catch (e) {} lastBase = baseOf(id); $('#tgAltBox').checked = false; $('#tierState').textContent = uiText('alt_missing'); } });
}
// 世界时钟时段变了（host-messages.mjs 的 eden-map:clock）：当前地图的底图档位变了才换，视角、标记、叠加层都不动
export function applyPeriod() {
  if (!currentMapId || lastBase === null) return;
  const want = baseOf(currentMapId);
  if (srcKey(want) !== srcKey(lastBase)) swapBase();
}
// 同组（主城）各层平面坐标对齐：切层时沿用同一个归一化视野（中心 + 缩放），只有第一次进入这一组时才按 view.focus 定位
export const groupView = {};
export function saveView() {
  const m = mapRegistry.maps[currentMapId];
  if (m?.group && m.kind === 'points' && osdViewer?.world.getItemCount()) groupView[m.group] = osdViewer.viewport.getBounds();
}
// 切层淡入：把当前画布拷一份盖在上面，新底图第一张瓦片画出来后淡出
function snapshot() {
  const src = osdViewer?.drawer?.canvas; if (!src?.width || !osdViewer.world.getItemCount()) return null;
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.className = 'snap';
  try { c.getContext('2d').drawImage(src, 0, 0); } catch (e) { return null; }
  $('#stage').appendChild(c); return c;
}
export function fadeAway(el, cb) {
  if (!el) return; let gone = false;
  const done = () => { if (gone) return; gone = true; el.classList.add('out'); el.classList.remove('on'); setTimeout(() => { el.remove(); cb?.(); }, 230); };
  osdViewer.addOnceHandler('tile-drawn', () => setTimeout(done, 60));
  setTimeout(done, 1500);   // 瓦片迟迟不到也不一直盖着
}
export async function go(id) {   // 云脚本块（文末）会包一层：主城各层之间切换时加《部落冲突》式转场
  const m = mapRegistry.maps[id]; if (!m || m.status === 'planned') return;
  // 点到「当前就是这张图」：不再静默返回（任务三：宏观层最常被当成「点击无响应 / 找不到目标实体」的那一类）。
  // 三维场景（kind=estate）→ 把落点名字发给主场景页聚焦；平面图 → 飞到落点标记。
  if (id === currentMapId) { focusSameMap(id); return; }
  const prev = currentMapId && mapRegistry.maps[currentMapId], fromEstate = prev?.kind === 'estate';
  saveView();
  setCurrentMapId(id); setUserMoved(false); closeCard(); plugins.EventsView.collapse?.(); document.body.dataset.map = id; syncGlow(id);
  if (m.kind === 'estate') return openEstate(id, m, !!prev);
  dropParked(); phId = null;
  // 离开主场景：iframe 留到新底图画出来再淡出
  const oldFrame = leaveEstate();
  // 叠加层可以取别的地图的数据（overlay.from），例如中层的「上层投影」用上层的岛屿轮廓
  const ovSrc = m.overlay?.from && mapRegistry.maps[m.overlay.from]?.data;
  // 纵深数据（maps.json 的 depth 字段，U16 / U17）：只有配了它的层才取，取不到不阻塞（视差、标签按 d 全部退回默认）
  const [cd, od, dd] = await Promise.all([m.data ? getJSON(m.data) : null, ovSrc ? getJSON(ovSrc) : null, m.depth ? getJSON(m.depth) : null]);
  if (id !== currentMapId) return;   // 加载期间又切换了地图
  setCurrentMapData(cd); setOverviewMapData(ovSrc ? od : cd); setDepthData(dd || null);
  renderNav(); mapChrome(m); if (m.alt) $('#tgAltBox').checked = altOn(id);
  $('#tgRoutes').hidden = !(cd?.routes?.length);
  // 从别的地图切过来（有旧画面或主场景盖着）：不上整屏遮罩，只看顶部进度条；首次打开才显示遮罩
  const snap = !fromEstate && prev ? snapshot() : null, quiet = !!(snap || oldFrame);
  $('#loading').classList.remove('done', 'over', 'cover'); $('#loading').classList.toggle('thumb', id === 'world'); $('#loading span').textContent = uiText('loading_map', { title: localName(m, 'title') });
  if (quiet) $('#loading').classList.add('done');
  const srcs = [{ tileSource: baseOf(id), ...placeOf(id) }];
  if (m.overlay?.type === 'dzi') srcs.push({ tileSource: m.overlay.src, ...placeOf(id), opacity: $('#tgBorders').checked ? 1 : 0 });
  lastBase = srcs[0].tileSource;
  osdViewer.addOnceHandler('open', () => { snapToFrame(id); applyPeriod(); });   // 载入期间时钟又变了（applyPeriod 当时看的是旧图）：打开后再对一次档位
  osdViewer.open(srcs);
  // v0.9.6 世界 ↔ 主城的缩放衔接：旧画面以主城为中心放大（进城）或缩小（出城）淡出，而不是原地淡出
  const fx = window.__zoomSnapEffect; window.__zoomSnapEffect = null;
  if (snap && fx) { snap.style.transformOrigin = `${fx.ox}px ${fx.oy}px`; const kill = () => snap.remove();
    const a = snap.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: `scale(${fx.scale})`, opacity: 0 }], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 560, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    a.finished.then(kill, kill); setTimeout(kill, 1000); } else fadeAway(snap);
  fadeAway(oldFrame);
  postState();
}
// 随地图变的工具栏文字（叠加层、另一版底图的开关名）
export function mapChrome(m) {
  if (m.overlay) { let on = m.overlay.type !== 'barriers'; if (!on) try { on = LocalStore.get('edenMapBarriers') === '1'; } catch (e) {} $('#tgBorders').checked = on; }
  $('#tgOverlay span').textContent = m.overlay ? localName(m.overlay, 'label') || uiText('overlay') : uiText('overlay'); $('#tgOverlay').hidden = !m.overlay;
  $('#tgAlt').hidden = !m.alt; if (m.alt) $('#tgAlt span').textContent = localName(m.alt, 'label') || uiText('alt_base');
}
export function setGo(v) { return (go = v); }
/**
 * 点到「当前就是这张图」时的动作（任务三）：消费掉待聚焦的落点，按图的类型分流——
 *   kind=estate（主场景 / 通用三维查看器）→ 把名字发给三维页聚焦（房间 / 热点由它自己找人）；
 *   其余 → 地图内飞到该标记。落点为空时什么都不做（点的是同图但没有指定目标）。
 */
function focusSameMap(id) {
  const focus = pendingFocus; setPendingFocus(null);
  if (!focus) return;
  if (mapRegistry.maps[id]?.kind === 'estate') { estateFocus(focus); return; }
  focusMarker(focus);
}
