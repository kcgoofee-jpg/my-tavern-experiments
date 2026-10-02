// 层导航与键盘：层切换条、上一级、Esc 分层、单字符快捷键。
import { mapRegistry, currentMapId, pendingFocus, pendingHome, setPendingFocus, setPendingHome, osdViewer } from './state.mjs';
import { $, esc } from './dom-helpers.mjs';
import { post } from './protocol-stamp.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { localName } from './i18n.mjs';
import { layoutHeader } from './topbar.mjs';
import { go } from './map-switch.mjs';
import { narrowNow } from './subpage3d-host.mjs';
import { closeCard } from './markers.mjs';
import { focusStart, hereRes, setUserMoved, userMoved } from './locate.mjs';
import { SettingsApi, kbdHelp, showLay, showSet } from './settings.mjs';
import { noticeLayer } from './notice-layer.mjs';
import { placeLayers } from './drawer-glue.mjs';
import { toggleLabels } from './control-column.mjs';
import { plugins } from './plugins.mjs';
import { anchorIn, crumbs, parentMap, strip } from './nodes-runtime.mjs';
import { close as closeCrumbMenu, isOpen as crumbMenuOpen, paintSwitcher, refreshMenu } from './crumb-menu.mjs';
import * as EstateShell from './estate-shell.mjs';   // S7-3: while a 3D page is open the strip shows the building's floors
// v0.9.6 手机层切换器：收起时点当前层 = 展开；展开后点任一层 = 切过去并收起；点别处收起
$('#layers').addEventListener('click', e => { if (!narrowNow()) return; const nav = $('#layers'), b = e.target.closest('button');
  if (nav.classList.contains('compact')) { if (b) { e.stopPropagation(); e.preventDefault(); nav.classList.remove('compact'); } return; }
  if (b && b.dataset.go === currentMapId) { e.stopPropagation(); e.preventDefault(); }
  nav.classList.add('compact'); }, true);
document.addEventListener('pointerdown', e => { if (!e.target.closest?.('#layers')) $('#layers').classList.add('compact'); });
// 主场景时层按钮条上的滚轮不带着宿主页滚（主场景里没有 OSD 接滚轮）
$('#layers').addEventListener('wheel', e => { if (document.body.classList.contains('estate')) e.preventDefault(); }, { passive: false });

// 层切换条的成员：运行时节点树的 levels()（strip）；没有运行时（自愈）就退回登记表的分组
const layerIds = m => strip(currentMapId) ?? (m?.group && mapRegistry.groups[m.group]?.layers) ?? [];
export function renderNav() {
  const m = mapRegistry.maps[currentMapId], chain = crumbs(currentMapId);
  const zone = k => anchorIn(k) ? ` data-focus="${esc(anchorIn(k))}"` : '';   // 返回一张三维页时，落到我在它里面所挂的区域上（S2-B）
  $('#crumbs').innerHTML = chain.map((k, i) => { const ti = localName(mapRegistry.maps[k], 'title');
    return i < chain.length - 1 ? `<a data-go="${k}"${zone(chain[i + 1])} role="button" tabindex="0">${esc(ti)}</a><span class="sep" aria-hidden="true">›</span>` : `<b aria-current="page">${esc(ti)}</b>`; }).join('');
  const nav = $('#layers'), floors = EstateShell.stripFloors(nav);   // floors = the 3D shell drew the floor strip; in 2D the levels live in the breadcrumb menu (HEADER-1, D36)
  if (!floors) { nav.hidden = true; nav.replaceChildren(); }   // a 2D map keeps no floating level strip (and a map without levels keeps no buttons of the previous one)
  nav.title = uiTextOr('layers.keys', 'PageUp / PageDown 或 [ ] 切换上下层');
  nav.classList.add('compact');
  paintSwitcher(); placeLayers();
  if (!narrowNow()) requestAnimationFrame(layoutHeader);   // 面包屑变长（切到更深的图）后重新量工具栏放不放得下（E5 r3 设计 D8 / 无障碍 F-14）
}
/** the events or the place changed: the breadcrumb menu (when open) recounts its badges and here-mark */
export function updateLayerBadges() { refreshMenu(); }
// 键盘切层：PageUp / [ 往上，PageDown / ] 往下（跳过制作中的层）
export function stepLayer(d) {
  if (EstateShell.active()) { EstateShell.stepFloor(d); return; }   // in 3D PageUp / PageDown step the building's floors
  const g = d ? layerIds(mapRegistry.maps[currentMapId]) : []; if (!g.length) return;
  for (let j = g.indexOf(currentMapId) + d; j >= 0 && j < g.length; j += d)
    if (mapRegistry.maps[g[j]].status !== 'planned') { setPendingFocus(null); go(g[j]); return; }
}
// Esc 只作用于最上面一层（§10.6）：对话框 > 设置 > 图层菜单 > 展开的层列表 > 抽屉降一档 > 地点卡；都没有时交给酒馆（关面板）。嵌入时不冒泡给酒馆
function escTop() {
  if (crumbMenuOpen()) { closeCrumbMenu(true); return true; }
  if (!$('#setPop').hidden) { showSet(false); ($(narrowNow() ? '#thumbBtn' : '#setBtn'))?.focus(); return true; }
  if (!$('#card').hidden) { closeCard(true); return true; }   // S7-2 (docs/ui-refactor.md 6): card -> popover -> drawer (half -> peek)
  if (!$('#layPop').hidden) { showLay(false); $('#layBtn').focus(); return true; }
  const lay = $('#layers'); if (narrowNow() && !lay.hidden && !lay.classList.contains('compact')) { lay.classList.add('compact'); lay.querySelector('button.on')?.focus(); return true; }
  const S = window.ViewerDrawer; if (S && !S.el.hidden && S.down()) { if (S.state === 'peek') S.el.querySelector('.uis-tog')?.focus({ preventScroll: true }); return true; }
  const up = EstateShell.active() && parentMap(currentMapId); if (up) { go(up); return true; }   // S7-3: in a 3D building Esc steps back up to the 2D map
  return false;
}
export function onEsc() { if (noticeLayer?.blocking) return; if (!escTop()) post({ type: 'eden-map:esc', from: 'key' }); }   // P0 阻断卡开着：Esc 不关任何东西；from = key：宿主还有自己的一层（回放条）要先关（U-FIX-5 X-01）
const keysOn = () => { try { return LocalStore.get('edenMapKeys') !== '0'; } catch (e) { return true; } };
document.addEventListener('keydown', e => {
  if (typeof plugins.CustomNamesView !== 'undefined' && plugins.CustomNamesView.dlgKey(e)) return;   // 「自定义」对话框开着：按键归它（Esc 逐页返回 / 关闭）
  if (e.isComposing || e.keyCode === 229) return;   // 输入法组字中
  if (e.key === 'Escape') {
    if (document.querySelector('#umDlg:not([hidden])')) return;   // 未上图选择器自己处理
    e.preventDefault(); e.stopPropagation(); onEsc(); return;
  }
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  // 站内跳转（面包屑、「进入上层」、跨层通道）是 role=button 的链接：Enter / 空格触发
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-go][role="button"]')) { e.preventDefault(); e.target.click(); return; }
  const d = { PageUp: -1, PageDown: 1 }[e.key] ?? (keysOn() ? { '[': -1, ']': 1 }[e.key] : undefined);
  if (d) { e.preventDefault(); kbdGo = true; stepLayer(d); return; }
  if (!keysOn() || e.key.length !== 1) return;
  // 单字符快捷键（§6、§10.7；设置「高级」可关，WCAG 2.1.4）：只在查看器有焦点、不在输入框时
  const k = e.key.toLowerCase(), vp = osdViewer?.viewport, estate = document.body.classList.contains('estate');
  if ((k === '+' || k === '=') && vp && !estate) { setUserMoved(true); vp.zoomBy(1.5); vp.applyConstraints(); }
  else if (k === '-' && vp && !estate) { setUserMoved(true); vp.zoomBy(1 / 1.5); vp.applyConstraints(); }
  else if (k === '0' && vp && !estate) { setUserMoved(false); setPendingHome(false); focusStart(false); }
  else if (k === 'l' && !estate) toggleLabels();
  else if (k === 'm') { SettingsApi.open('data'); setTimeout(() => { const v = $('#vmBox'); if (v) { v.open = true; v.querySelector('summary')?.focus(); v.scrollIntoView({ block: 'start' }); } }, 30); }
  else if (k === ',') SettingsApi.open('home');   // S7-2: settings
  else if ((k === '1' || k === '2' || k === '3') && estate && EstateShell.onKey(k)) { /* S7-3: 3D view modes 1 exterior, 2 x-ray, 3 section (the last floor) */ }
  else if (k === '/') { SettingsApi.open('home'); setTimeout(() => $('#setQ')?.focus(), 30); }
  else if (k === '?') { SettingsApi.open('adv'); kbdHelp(true); }
  else return;
  e.preventDefault();
}, true);
// 键盘触发的站内跳转（click 的 detail = 0）：新图打开后把焦点放到卡片标题或当前层按钮，不掉到 body（E4b R06）
let kbdGo = false;
document.addEventListener('click', e => { const a = e.target.closest('[data-go]'); if (a && !a.disabled) { e.preventDefault(); setPendingFocus(a.dataset.focus || null); kbdGo = e.detail === 0 && a.dataset.go !== currentMapId; go(a.dataset.go); } });
export function focusAfterGo() {
  if (!kbdGo) return; kbdGo = false;
  const el = !$('#card').hidden ? $('#cardTitle') : $('#layers:not([hidden]) button[aria-current]') || $('#crumbs .cur') || $('#crumbs b');
  if (el) { if (el.tagName === 'B') el.tabIndex = -1; el.focus({ preventScroll: true }); }
}
