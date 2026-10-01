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
  const g = layerIds(m), nav = $('#layers');
  nav.hidden = !g.length;
  nav.title = uiTextOr('layers.keys', 'PageUp / PageDown 或 [ ] 切换上下层');
  if (g.length) nav.innerHTML = g.map(k => { const L = mapRegistry.maps[k], planned = L.status === 'planned';
    return `<button type="button" data-go="${k}" class="${k === currentMapId ? 'on' : ''}" ${k === currentMapId ? 'aria-current="page"' : ''} ${planned ? `disabled title="${esc(uiTextOr('layers.planned', '制作中'))}"` : ''}>${esc(localName(L.layer))}<i class="hd" title="${esc(uiTextOr('layers.here', '当前地点在这一层'))}"></i><em class="evn"></em><small>${esc(planned ? uiTextOr('layers.planned', '制作中') : localName(L.layer, 'alt'))}</small></button>`; }).join('');
  nav.classList.add('compact');
  // 上一级（桌面顶栏 ‹）与「⋯」首页的切层快捷（手机、三维页）
  const pid = parentMap(currentMapId), par = pid && mapRegistry.maps[pid]; $('#upBtn').hidden = !par; if (par) { $('#upBtn').dataset.go = pid; if (anchorIn(currentMapId)) $('#upBtn').dataset.focus = anchorIn(currentMapId); else delete $('#upBtn').dataset.focus; $('#upBtn').title = uiTextOr('act_up', `返回${localName(par, 'title')}`, { title: localName(par, 'title') }); }
  $('#setPop .qlayers').innerHTML = g.length ? g.map(k => { const L = mapRegistry.maps[k], pl = L.status === 'planned';
    return `<button type="button" class="btn${k === currentMapId ? ' on' : ''}" data-go="${k}" ${k === currentMapId ? 'aria-current="page"' : ''} ${pl ? 'disabled' : ''}>${esc(localName(L.layer))}</button>`; }).join('') : '';
  updateLayerBadges(); placeLayers();
  if (!narrowNow()) requestAnimationFrame(layoutHeader);   // 面包屑变长（切到更深的图）后重新量工具栏放不放得下（E5 r3 设计 D8 / 无障碍 F-14）
}
export function updateLayerBadges() {
  const m = currentMapId && mapRegistry.maps[currentMapId], g = layerIds(m); if (!g.length) return;
  let others = 0; const r = hereRes($('#here').value), hk = r && r.level <= 4 && g.includes(r.map) ? r.map : null;
  document.querySelectorAll('#layers button').forEach(b => {
    const k = b.dataset.go, n = plugins.EventsView.countOn?.(k) || 0;
    b.classList.toggle('here', k === hk && !n);   // 一个按钮只挂一种红色标记：有事态数就只显示数字，当前地点写进 aria / title（v0.9.2）
    b.querySelector('.evn').textContent = n ? (n > 9 ? '9+' : n) : '';
    b.querySelector('.evn').title = n ? uiTextOr('layers.events', `${n} 起未解除的事态`, { n }) : '';
    if (k !== currentMapId && n) others++;
    b.setAttribute('aria-label', [b.firstChild?.textContent || '', k === hk ? uiTextOr('layers.here', '当前地点在这一层') : '', n ? uiTextOr('layers.events', `${n} 起未解除的事态`, { n }) : ''].filter(Boolean).join('，'));
  });
  $('#layers').classList.toggle('evs', others > 0);
}
// 键盘切层：PageUp / [ 往上，PageDown / ] 往下（跳过制作中的层）
export function stepLayer(d) {
  const g = d ? layerIds(mapRegistry.maps[currentMapId]) : []; if (!g.length) return;
  for (let j = g.indexOf(currentMapId) + d; j >= 0 && j < g.length; j += d)
    if (mapRegistry.maps[g[j]].status !== 'planned') { setPendingFocus(null); go(g[j]); return; }
}
// Esc 只作用于最上面一层（§10.6）：对话框 > 设置 > 图层菜单 > 展开的层列表 > 抽屉降一档 > 地点卡；都没有时交给酒馆（关面板）。嵌入时不冒泡给酒馆
function escTop() {
  if (!$('#setPop').hidden) { showSet(false); ($(narrowNow() ? '#thumbBtn' : '#setBtn'))?.focus(); return true; }
  if (!$('#layPop').hidden) { showLay(false); $('#layBtn').focus(); return true; }
  const lay = $('#layers'); if (narrowNow() && !lay.hidden && !lay.classList.contains('compact')) { lay.classList.add('compact'); lay.querySelector('button.on')?.focus(); return true; }
  const S = window.ViewerDrawer; if (S && !S.el.hidden && S.down()) { if (S.state === 'peek') S.el.querySelector('.uis-tog')?.focus({ preventScroll: true }); return true; }
  if (!$('#card').hidden) { closeCard(true); return true; }
  return false;
}
export function onEsc() { if (noticeLayer?.blocking) return; if (!escTop()) post({ type: 'eden-map:esc' }); }   // P0 阻断卡开着：Esc 不关任何东西
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
  const el = !$('#card').hidden ? $('#cardTitle') : $('#layers:not([hidden]) button[aria-current]') || $('#crumbs b');
  if (el) { if (el.tagName === 'B') el.tabIndex = -1; el.focus({ preventScroll: true }); }
}
