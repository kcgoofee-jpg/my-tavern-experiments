// 地图切换：go（带可注册的包装）、snapshot、mapChrome、另一版底图。
import { mapRegistry, currentMapId, currentMapData, overviewMapData, pendingFocus, setCurrentMapId, setCurrentMapData, setOverviewMapData, setDepthData, setPendingFocus, osdViewer } from './state.mjs';
import { $ } from './dom-helpers.mjs';
import { getJSON } from './json-cache.mjs';
import { applyTier } from './sharpness-tiers.mjs';
import { localName, postState, uiText } from './i18n.mjs';
import { dropParked, estateFocus, leaveEstate, openEstate } from './subpage3d-host.mjs';
import { renderNav } from './map-level-nav.mjs';
import { closeCard } from './markers.mjs';
import { focusMarker, setUserMoved, userMoved } from './locate.mjs';
import { plugins } from './plugins.mjs';
import { syncGlow } from './theme.mjs';
// ---------------- 地图切换 ----------------
// alt：同一张图的另一版底图（上层默认云海，开关后显示下方城市）。只换底图，视角、标记、叠加层都不动；开关状态按地图记住
export const ALT_KEY = 'edenMapAlt:';
export const altOn = id => { try { return LocalStore.get(ALT_KEY + id) === '1'; } catch (e) { return false; } };
// periods：多时段底图（maps.json，如中层的昼 / 夜两张）。按世界时钟的有效档位换（P.CustomNamesView.todNow，关掉时段色调时为空 = 恒用 base）；
// 只认 day / night 两档（dawn / dusk 没有单独的渲染，继续用 base 叠色调）
const periodOf = id => { const tod = plugins.CustomNamesView?.todNow?.() || ''; return mapRegistry.maps[id]?.periods?.[tod === 'day' || tod === 'night' ? tod : ''] || null; };
const baseOf = id => { const m = mapRegistry.maps[id]; return m.alt && altOn(id) ? m.alt.base : (periodOf(id) || m.base); };
let lastBase = null;   // 第 0 层当前用的底图地址（go 打开 / swapBase 换上时记；applyPeriod 拿它判断要不要换）
export function swapBase() {
  const id = currentMapId, old = osdViewer.world.getItemAt(0); if (!old) return;
  lastBase = baseOf(id);
  osdViewer.addTiledImage({ tileSource: baseOf(id), index: 0, success: () => { if (currentMapId !== id) return; osdViewer.world.removeItem(old); applyTier(); },
    error: () => { try { LocalStore.remove(ALT_KEY + id); } catch (e) {} lastBase = baseOf(id); $('#tgAltBox').checked = false; $('#tierState').textContent = uiText('alt_missing'); } });
}
// 世界时钟时段变了（host-messages.mjs 的 eden-map:clock）：当前地图的底图档位变了才换，视角、标记、叠加层都不动
export function applyPeriod() {
  if (!currentMapId || lastBase === null) return;
  const want = baseOf(currentMapId);
  if (want !== lastBase) swapBase();
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
  dropParked();
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
  const srcs = [{ tileSource: baseOf(id) }];
  if (m.overlay?.type === 'dzi') srcs.push({ tileSource: m.overlay.src, opacity: $('#tgBorders').checked ? 1 : 0 });
  lastBase = srcs[0].tileSource;
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
/**
 * 署名（ⓘ）：这张图没有署名词条时把按钮与文字框一起收起来——原来按钮恒显示，点开是个空框，
 * 在世界图（奥伦帝国那类没有 credit 的层）上表现就是「点了没反应」的假死（任务三）。
 * fix3：只用展开的文字框，不再叠一个原生 title 提示。地图切换与主场景打开都走这里。
 */
export function applyCredit(m) {
  const credit = localName(m, 'credit');
  $('#credit').textContent = credit; $('#credit').removeAttribute('title'); window.__showCredits?.(false);
  $('#creditBtn').hidden = !credit; if (!credit) $('#credit').hidden = true;
}
export function mapChrome(m) {
  applyCredit(m);
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
