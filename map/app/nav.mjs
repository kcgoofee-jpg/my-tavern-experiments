// 地图切换：go（带可注册的包装）、snapshot、mapChrome、另一版底图。
import { REG, cur, curData, ovData, setCur, setCurData, setOvData, viewer } from './state.mjs';
import { $, getJSON } from './util.mjs';
import { applyTier } from './tiers.mjs';
import { nm, postState, t } from './i18n.mjs';
import { dropParked, leaveEstate, openEstate } from './estate.mjs';
import { renderNav } from './layers.mjs';
import { closeCard } from './markers.mjs';
import { setUserMoved, userMoved } from './locate.mjs';
import { P } from './plugins.mjs';
// ---------------- 地图切换 ----------------
// alt：同一张图的另一版底图（上层默认云海，开关后显示下方城市）。只换底图，视角、标记、叠加层都不动；开关状态按地图记住
export const ALT_KEY = 'edenMapAlt:';
export const altOn = id => { try { return TCStore.get(ALT_KEY + id) === '1'; } catch (e) { return false; } };
const baseOf = id => { const m = REG.maps[id]; return m.alt && altOn(id) ? m.alt.base : m.base; };
export function swapBase() {
  const id = cur, old = viewer.world.getItemAt(0); if (!old) return;
  viewer.addTiledImage({ tileSource: baseOf(id), index: 0, success: () => { if (cur !== id) return; viewer.world.removeItem(old); applyTier(); },
    error: () => { try { TCStore.remove(ALT_KEY + id); } catch (e) {} $('#tgAltBox').checked = false; $('#tierState').textContent = t('alt_missing'); } });
}
// 同组（天城）各层平面坐标对齐：切层时沿用同一个归一化视野（中心 + 缩放），只有第一次进入这一组时才按 view.focus 定位
export const groupView = {};
export function saveView() {
  const m = REG.maps[cur];
  if (m?.group && m.kind === 'points' && viewer?.world.getItemCount()) groupView[m.group] = viewer.viewport.getBounds();
}
// 切层淡入：把当前画布拷一份盖在上面，新底图第一张瓦片画出来后淡出
function snapshot() {
  const src = viewer?.drawer?.canvas; if (!src?.width || !viewer.world.getItemCount()) return null;
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.className = 'snap';
  try { c.getContext('2d').drawImage(src, 0, 0); } catch (e) { return null; }
  $('#stage').appendChild(c); return c;
}
export function fadeAway(el, cb) {
  if (!el) return; let gone = false;
  const done = () => { if (gone) return; gone = true; el.classList.add('out'); el.classList.remove('on'); setTimeout(() => { el.remove(); cb?.(); }, 230); };
  viewer.addOnceHandler('tile-drawn', () => setTimeout(done, 60));
  setTimeout(done, 1500);   // 瓦片迟迟不到也不一直盖着
}
export async function go(id) {   // 云脚本块（文末）会包一层：天城各层之间切换时加《部落冲突》式转场
  const m = REG.maps[id]; if (!m || m.status === 'planned' || id === cur) return;
  const prev = cur && REG.maps[cur], fromEstate = prev?.kind === 'estate';
  saveView();
  setCur(id); setUserMoved(false); closeCard(); P.TCEvents.collapse?.(); document.body.dataset.map = id;
  if (m.kind === 'estate') return openEstate(id, m, !!prev);
  dropParked();
  // 离开庄园：iframe 留到新底图画出来再淡出
  const oldFrame = leaveEstate();
  // 叠加层可以取别的地图的数据（overlay.from），例如中层的「上层投影」用上层的岛屿轮廓
  const ovSrc = m.overlay?.from && REG.maps[m.overlay.from]?.data;
  const [cd, od] = await Promise.all([m.data ? getJSON(m.data) : null, ovSrc ? getJSON(ovSrc) : null]);
  if (id !== cur) return;   // 加载期间又切换了地图
  setCurData(cd); setOvData(ovSrc ? od : cd);
  renderNav(); mapChrome(m); if (m.alt) $('#tgAltBox').checked = altOn(id);
  $('#tgRoutes').hidden = !(cd?.routes?.length);
  // 从别的地图切过来（有旧画面或庄园盖着）：不上整屏遮罩，只看顶部进度条；首次打开才显示遮罩
  const snap = !fromEstate && prev ? snapshot() : null, quiet = !!(snap || oldFrame);
  $('#loading').classList.remove('done', 'over', 'cover'); $('#loading').classList.toggle('thumb', id === 'world'); $('#loading span').textContent = t('loading_map', { title: nm(m, 'title') });
  if (quiet) $('#loading').classList.add('done');
  const srcs = [{ tileSource: baseOf(id) }];
  if (m.overlay?.type === 'dzi') srcs.push({ tileSource: m.overlay.src, opacity: $('#tgBorders').checked ? 1 : 0 });
  viewer.open(srcs);
  // v0.9.6 世界 ↔ 天城的缩放衔接：旧画面以天城为中心放大（进城）或缩小（出城）淡出，而不是原地淡出
  const fx = window.__snapFx; window.__snapFx = null;
  if (snap && fx) { snap.style.transformOrigin = `${fx.ox}px ${fx.oy}px`; const kill = () => snap.remove();
    const a = snap.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: `scale(${fx.scale})`, opacity: 0 }], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 560, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    a.finished.then(kill, kill); setTimeout(kill, 1000); } else fadeAway(snap);
  fadeAway(oldFrame);
  postState();
}
// 随地图变的工具栏文字（叠加层、另一版底图的开关名）
export function mapChrome(m) {
  $('#credit').textContent = nm(m, 'credit'); $('#credit').removeAttribute('title');   // fix3：署名只用展开的文字框，不再叠一个原生 title 提示 $('#creditBtn').hidden = !nm(m, 'credit'); window.__creditShow?.(false);
  if (m.overlay) { let on = m.overlay.type !== 'barriers'; if (!on) try { on = TCStore.get('edenMapBarriers') === '1'; } catch (e) {} $('#tgBorders').checked = on; }
  $('#tgOverlay span').textContent = m.overlay ? nm(m.overlay, 'label') || t('overlay') : t('overlay'); $('#tgOverlay').hidden = !m.overlay;
  $('#tgAlt').hidden = !m.alt; if (m.alt) $('#tgAlt span').textContent = nm(m.alt, 'label') || t('alt_base');
}
export function setGo(v) { return (go = v); }
