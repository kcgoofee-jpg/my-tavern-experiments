// 外壳：控制列、唯一抽屉 / 右栏胶水、通知层、状态点、单手模式、双击缩放。
import { REG, cur, viewer } from './state.mjs';
import { $, afterLoadIdle, announce, esc, ico, post, tx } from './util.mjs';
import { declutter } from './tiers.mjs';
import { LANG, nm, postState, t } from './i18n.mjs';
import { narrowNow } from './estate.mjs';
import { jumpHere, setUserMoved, userMoved } from './locate.mjs';
import { TCSettings, showSet } from './settings.mjs';
import { P } from './plugins.mjs';
// ---------------- 外壳（UI v2）：控制列、唯一抽屉、通知层、状态点 ----------------
// 控制列 #dock：手机 = ⋯（设置首页，含上一级 / 关闭地图 / 切层）+ 缩放；桌面 = 层切换 + 缩放 + 标注。位置跟着抽屉（--sheet-h）/ 右栏（--rail-w-now）
function makeDock() {
  const dock = document.createElement('div'), tb = document.createElement('button'); dock.id = 'dock';
  tb.type = 'button'; tb.id = 'thumbBtn'; tb.className = 'btn ic'; tb.dataset.i18nAria = tb.dataset.i18nTitle = 'more';
  tb.setAttribute('aria-controls', 'setPop'); tb.setAttribute('aria-expanded', 'false'); tb.innerHTML = ico('more');
  tb.setAttribute('aria-label', t('more')); tb.title = t('more');
  dock.append(tb, $('#layers'), $('#zoom')); $('#stage').appendChild(dock); return dock;
}
// 层切换器：手机放在抽屉摘要行左侧（「中层 ▾」一次点开），桌面在控制列顶上常展开
export function placeLayers() {
  const lay = $('#layers'), S = window.TCSheet; if (!lay || !S) return;
  const want = narrowNow() ? S.lead : $('#dock'); if (lay.parentElement !== want) { if (want === $('#dock')) want.insertBefore(lay, $('#zoom')); else want.appendChild(lay); }
  lay.classList.add('compact'); sheetVis();
}
// 标注开关：开 =「Aa」+ 强调底色；关 = 带斜杠的「Aa」+ 灰色（不只靠颜色区分）
export function paintLbl() { const on = $('#tgLabels').checked, b = $('#lblTog'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.innerHTML = ico(on ? 'labels' : 'labelsOff'); }
export function toggleLabels(on) {
  const cb = $('#tgLabels'); cb.checked = on ?? !cb.checked; document.body.classList.toggle('nolabels', !cb.checked);
  paintLbl(); announce(tx(cb.checked ? 's.labels_on' : 's.labels_off', cb.checked ? '标注已显示' : '标注已隐藏'));
}
// 抽屉可见性：有事态、人物、地点卡、或手机上要放层名胶囊时显示；三维页（庄园）用它自己的抽屉
export function sheetVis() {
  const S = window.TCSheet; if (!S) return;
  const estate = document.body.classList.contains('estate'), ev = !S.button('ev').hidden, ch = !S.button('ch').hidden, card = !$('#card').hidden;
  const layChip = narrowNow() && !$('#layers').hidden;
  // 未上图（v2 门控遗留）：当前地点认不出时，抽屉 / 桌面收起的右栏条也留着，「地点」页给出「放到地图上」入口
  const um = typeof P.TCUnmapped !== 'undefined' ? P.TCUnmapped.name : null; placeEmpty(um);
  S.hide(estate || !(ev || ch || card || layChip || um));
  S.showTab('pl', ev || ch || card || !!um);
}
export function placeEmpty(um) {
  const e = $('#cardEmpty'); if (!e || e.dataset.um === (um || '')) return; e.dataset.um = um || '';
  if (!um) { e.textContent = ''; e.textContent = tx('s.place_empty', '点地图上的地点，这里显示它的介绍'); return; }
  let s = e.querySelector('span.umq'), b = e.querySelector('button');
  if (!s) { e.textContent = ''; s = document.createElement('span'); s.className = 'umq'; b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.onclick = () => P.TCUnmapped.open(); e.append(s, ' ', b); announce(tx('um.empty', '当前地点「{n}」还不在地图上。', { n: um })); }
  s.textContent = tx('um.empty', '当前地点「{n}」还不在地图上。', { n: um }) + tx('um.empty_sub', '放一次，这个聊天之后都会记住。'); b.textContent = tx('um.empty_btn', '放到地图上');   // 节点复用：焦点不丢
}
export function cardSheet(open) {
  const S = window.TCSheet; if (!S) return; sheetVis();
  if (open) { S.setTab('pl', S.state === 'full' ? 'full' : 'half'); return; }
  if (S.tab === 'pl') { const nx = !S.button('ev').hidden ? 'ev' : !S.button('ch').hidden ? 'ch' : null; if (nx) S.setTab(nx); S.set('peek'); }
}
export function initShell() {
  const dock = makeDock();
  const place = document.createElement('div'); place.id = 'placePane'; place.append($('#card'));
  const empty = document.createElement('p'); empty.id = 'cardEmpty'; place.append(empty);
  const S = window.TCSheet = UISheet.create({ host: $('#stage'), id: 'evbar', railKey: 'edenMapRailW',
    tabs: [{ id: 'ev', btnClass: 'evtab', icon: 'bell' }, { id: 'ch', btnClass: 'chtab', icon: 'users' }, { id: 'pl', btnClass: 'pltab', icon: 'pin', panel: place }],
    freshText: n => tx('ev.bar_new', '{n} 条新', { n }),
    onState: ({ state, tab, mode, h }) => {
      S.el.dataset.open = state === 'peek' ? '0' : '1'; S.el.dataset.tab = tab || ''; document.body.classList.toggle('evopen', state !== 'peek');
      document.body.classList.toggle('sheetfull', state === 'full' && mode === 'sheet'); dock.inert = state === 'full' && mode === 'sheet';
      // 半开时控制列最高到屏幕中线，超过就横排贴在抽屉上沿（§10.1）
      const st = $('#stage').getBoundingClientRect(); dock.classList.remove('row');
      if (mode === 'sheet' && state === 'half' && h + dock.offsetHeight + 12 > st.height * .5 + 1) dock.classList.add('row');
      declutter();   // 控制列换了位置 / 排法：重新避让地名
      if (tab === 'ch' || tab === 'ev') P.TCEvents.renderBar();
      post({ type: 'eden-map:chrome', bottom: h, top: $('header').offsetHeight }); noticeRefresh();
    } });
  S.label('pl', esc(tx('s.place', '地点')), {}); S.showTab('ev', false); S.showTab('ch', false); S.hide(true);
  // 点地图空白 = 抽屉回到收起（只认移动 < 8 px、< 250 ms 的轻点；点到地标 / 事态按地标处理，§10.4）
  let tp = null;
  $('#osd').addEventListener('pointerdown', e => { tp = e.isPrimary ? { x: e.clientX, y: e.clientY, t: e.timeStamp, on: !!e.target.closest?.('.mk, .ev, .realm, .chm, .tripin, .tc-ring a') } : null; }, true);
  $('#osd').addEventListener('pointerup', e => { if (!tp) return; const q = tp; tp = null;
    if (q.on || e.timeStamp - q.t > 250 || Math.hypot(e.clientX - q.x, e.clientY - q.y) > 8) return;
    if (S.open && S.mode === 'sheet') S.set('peek'); }, true);
  $('#lblTog').onclick = () => toggleLabels();
  $('#tgLabels').addEventListener('change', paintLbl);
  $('#stDot').onclick = () => { const ts = $('#tierState'); if (ts.classList.contains('stuck')) ts.click(); };
  new MutationObserver(stDotLabel).observe($('#tierState'), { attributes: true, childList: true, characterData: true, subtree: true });
  addEventListener('resize', () => { placeLayers(); });
}
export function stDotLabel() { const ts = $('#tierState'), d = $('#stDot'); if (!d) return; const txt = ts.textContent || tx('loaded', '✓ 已加载');
  d.setAttribute('aria-label', tx('s.status', '状态') + '：' + txt); d.title = ts.classList.contains('stuck') ? txt : txt; }
export function flashOk() { const d = $('#stDot'); d.classList.add('flash'); setTimeout(() => d.classList.remove('flash'), 1400); }
// ---------------- 通知（§3）：嵌入时交给宿主统一显示（eden-map:notice）；单独打开时自己渲染同一个组件 ui/notice.mjs ----------------
export let NT = null, ntQ = [];
const formBusy = () => { const a = document.activeElement; return !!a && !$('#setPop').hidden && $('#setPop').contains(a) && a.matches('input:not([type=checkbox]), textarea, select, [contenteditable]'); };
let ntLoad = null;
// 单独打开时通知组件不在首屏取：页面 load 后空闲时预取，或第一次 notify() 时取（v2b 冷开包体）；嵌入时由宿主渲染
afterLoadIdle(() => loadNotices());
function loadNotices() {
  if (window.top !== window || ntLoad) return; ntLoad = true;
  import(new URL('ui/notice.mjs', document.baseURI).href).then(m => {
    NT = m.createNotices({ doc: document, mount: document.body, baseCls: 'vw-nt', en: LANG === 'en', busy: formBusy, inertEls: () => [$('#app'), $('#setPop'), $('#layPop')],
      anchor: () => { const st = $('#stage').getBoundingClientRect(); return { left: st.left, top: st.top, width: st.width - (parseFloat(getComputedStyle($('#stage')).getPropertyValue('--rail-w-now')) || 0), height: st.height, top0: 0, bottom0: window.TCSheet && !TCSheet.el.hidden && TCSheet.mode === 'sheet' ? TCSheet.el.offsetHeight : 0, modal: true }; } });
    for (const n of ntQ.splice(0)) NT.push(n);
  }).catch(() => {});
}
function notify(n) {   // n = { key, level, title, lines, actions: [{ label, run | msg }] }
  if (window.top !== window) { n = { ...n, actions: (n.actions || []).map((a, i) => ({ ...a, id: a.id ?? 'a' + i })) };
    const { onClose, build, ...plain } = n; n = plain;   // 函数不能 postMessage（DataCloneError）；嵌入时由宿主渲染，关闭回调不跨窗口
    post({ type: 'eden-map:notice', n: { ...n, actions: n.actions.map(a => ({ label: a.label, primary: a.primary, id: a.id })) } }); if (n.actions.length) { ntActs[n.key] = n.actions; const ks = Object.keys(ntActs); if (ks.length > 20) delete ntActs[ks[0]]; } return; }
  if (NT) NT.push(n); else { ntQ.push(n); loadNotices(); }
}
export const ntActs = {};
export function noticeRefresh() { NT?.refresh(); if (window.top !== window) post({ type: 'eden-map:formbusy', on: formBusy() }); }
window.TCNotify = notify;
// 大版本 2 · 产品：第一次打开时的三步提示（P1 横幅，可关；本机只出一次，edenMapHint）。?hint=1 强制再出（测试 / 截图）
export function firstRunHint() {
  let seen = false; try { seen = TCStore.get('edenMapHint') === '1' && !/[?&]hint=1/.test(location.search); } catch (e) {}
  if (seen) return; const done = () => { try { TCStore.set('edenMapHint', '1'); } catch (e) {} };
  const emb = window.top !== window;
  notify({ key: 'hint', level: 1, title: tx('hint.title', '三步上手'), onClose: done, lines: [
    tx('hint.1', '① 点地图上的地标看介绍；有三维模型的地点（如伊甸庄园）从卡片进三维视图。') + (emb ? tx('hint.1b', '卡片底部的「去这里」「追问这件事」只填进聊天输入框，不会替你发送。') : ''),
    tx('hint.2', '② 地图默认打开世界地图；想看你现在在哪，点「当前位置」跳过去并高亮；地点认不出时会显示「未上图」，点它就能放到地图上。'),
    (narrowNow() ? tx('hint.3', '③ 切层、标注、人物、三维画质都在设置里（手机上是右下角 ⋯）。') : tx('hint.3d', '③ 切层、标注、人物、三维画质都在右上角的设置里。'))],
    actions: [{ label: tx('hint.settings', '打开设置'), run: () => { done(); TCSettings.open('home'); } }, { label: tx('hint.ok', '知道了'), primary: true, run: done }] });
  // 只有关掉或点了按钮才算看过；没理它，下次打开还会出（最多 3 次，之后不再打扰）
  try { const n = +(TCStore.get('edenMapHintN') || 0) + 1; TCStore.set('edenMapHintN', String(n)); if (n >= 3) done(); } catch (e) {}
}
export function initE7() {
  const tb = $('#thumbBtn'), pop = $('#setPop');
  // 「⋯」：设置首页，顶上是够得着的「返回上一级」「当前位置」「关闭地图」（手机上顶栏和酒馆面板的 × 都在最上面）
  tb.onclick = e => { e.stopPropagation(); showSet(pop.hidden); };
  $('#actUp').addEventListener('click', () => showSet(false));
  $('#actHere').onclick = () => { showSet(false); jumpHere($('#here').value); };
  $('#actClose').onclick = () => { showSet(false); post({ type: 'eden-map:esc' }); };   // 卡内脚本收到 esc 就关面板（旧版卡内脚本也认）
  // 惯用手
  const hs = $('#handSeg');
  const paint = () => hs.querySelectorAll('button').forEach(b => { const on = b.dataset.hand === window.__hand; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  hs.addEventListener('click', e => { const b = e.target.closest('button[data-hand]'); if (!b) return;
    window.__hand = b.dataset.hand; try { TCStore.set('edenMapHand', window.__hand); } catch (err) {}
    window.__applyHand(); paint(); postState(); });
  paint();
  addEventListener('storage', e => { if (e.key === 'edenMapFabPos' && window.__hand === 'auto') window.__applyHand(); });   // 自动：悬浮按钮拖到另一边，地图跟着换
  initQuickZoom();
}
export function setActs() { const up = $('#actUp'), cl = $('#actClose'), hg = $('#actHere'), par = cur && REG?.maps[cur]?.parent, nar = narrowNow();
  up.hidden = !(nar && par && REG.maps[par]); if (!up.hidden) { up.dataset.go = par; up.textContent = t('act_up', { title: nm(REG.maps[par], 'title') }); }
  hg.hidden = !(nar && !$('#hereGo').hidden);
  cl.hidden = !nar || window.top === window; $('#setPop .acts').hidden = up.hidden && cl.hidden && hg.hidden; }
// 单指缩放（像 Google 地图）：双击后第二下按住不放，往下拖放大、往上拖缩小；双击不拖 = 放大一倍。
// 只接手机触摸（pointerType = touch）、只在瓦片地图 #osd 上（庄园 iframe 不在里面）；第二下按下时截住事件，不让地图库当成平移；多指捏合照旧
function initQuickZoom() {
  const box = $('#osd'), SLOP = 10, TAP_MS = 300, GAP_MS = 320, GAP_PX = 40, rmq = matchMedia('(prefers-reduced-motion: reduce)');
  let tap = null, down = null, qz = null, lastQz = 0;
  const swallow = e => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };
  const px = e => { const r = viewer.container.getBoundingClientRect(); return new OpenSeadragon.Point(e.clientX - r.left, e.clientY - r.top); };
  box.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    if (qz || down) { qz = down = tap = null; return; }   // 第二根手指：不是单指手势
    const onMark = e.target.closest?.('.mk, .ev, .realm');
    if (!onMark && tap && e.timeStamp - tap.t < GAP_MS && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < GAP_PX && viewer.world.getItemCount() && !document.body.classList.contains('estate')) {
      swallow(e); tap = null; const vp = viewer.viewport;
      qz = { id: e.pointerId, y: e.clientY, z0: vp.getZoom(true), ref: vp.pointFromPixel(px(e), true), moved: false }; return;
    }
    tap = null; down = onMark ? null : { id: e.pointerId, t: e.timeStamp, x: e.clientX, y: e.clientY };
  }, true);
  box.addEventListener('pointermove', e => {
    if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > SLOP) down = null;
    if (!qz || e.pointerId !== qz.id) return; swallow(e);
    const dy = e.clientY - qz.y; if (!qz.moved && Math.abs(dy) < SLOP) return; qz.moved = true;
    const vp = viewer.viewport; vp.zoomTo(Math.min(vp.getMaxZoom(), Math.max(vp.getMinZoom(), qz.z0 * 2 ** (dy / 120))), qz.ref, true); setUserMoved(true);
  }, true);
  const up = e => {
    if (down && e.pointerId === down.id) { if (e.type === 'pointerup' && e.timeStamp - down.t < TAP_MS) tap = { t: e.timeStamp, x: e.clientX, y: e.clientY }; down = null; }
    if (!qz || e.pointerId !== qz.id) return; swallow(e);
    const vp = viewer.viewport;
    if (!qz.moved && e.type === 'pointerup') { vp.zoomTo(Math.min(vp.getMaxZoom(), qz.z0 * 2), qz.ref, rmq.matches); setUserMoved(true); }   // 减少动效：直接跳到位
    vp.applyConstraints(); qz = null; lastQz = performance.now();
  };
  box.addEventListener('pointerup', up, true); box.addEventListener('pointercancel', up, true);
  box.addEventListener('dblclick', e => { if (performance.now() - lastQz < 600) e.stopPropagation(); }, true);   // 浏览器补发的 dblclick 不再让地图库再放大一次
}
