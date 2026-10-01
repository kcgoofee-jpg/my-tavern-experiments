// 唯一抽屉 / 右栏的胶水：层切换器落点、抽屉可见性、图例页、「地点」页空态、点卡开合抽屉、抽屉本体的创建（S5-2 自 shell.mjs 拆出，行为不变）。
import { depthData } from './state.mjs';
import { $, esc } from './dom-helpers.mjs';
import { announce } from './screen-reader-announce.mjs';
import { post } from './protocol-stamp.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { declutter } from './sharpness-tiers.mjs';
import { LANG } from './i18n.mjs';
import { narrowNow } from './subpage3d-host.mjs';
import { plugins } from './plugins.mjs';
import { busOn } from './bus.mjs';   // P2-3：全局监听统一登记
import { RT } from './nodes-runtime.mjs';
import { initLabelToggle, makeDock } from './control-column.mjs';
import { noticeRefresh } from './notice-layer.mjs';
import { initStatusDot } from './status-dot.mjs';
// 层切换器：手机放在抽屉摘要行左侧（「中层 ▾」一次点开），桌面在控制列顶上常展开
export function placeLayers() {
  const lay = $('#layers'), S = window.ViewerDrawer; if (!lay || !S) return;
  const want = narrowNow() ? S.lead : $('#dock'); if (lay.parentElement !== want) { if (want === $('#dock')) want.insertBefore(lay, $('#zoom')); else want.appendChild(lay); }
  lay.classList.add('compact'); sheetVis();
}

// 抽屉可见性：有事态、人物、地点卡、或手机上要放层名胶囊时显示；三维页（庄园）用它自己的抽屉
export function sheetVis() {
  const S = window.ViewerDrawer; if (!S) return;
  const estate = document.body.classList.contains('estate'), ev = !S.button('ev').hidden, ch = !S.button('ch').hidden, card = !$('#card').hidden;
  const layChip = narrowNow() && !$('#layers').hidden;
  // 未上图（v2 门控遗留）：当前地点认不出时，抽屉 / 桌面收起的右栏条也留着，「地点」页给出「放到地图上」入口
  const um = typeof plugins.UnmappedPlacePicker !== 'undefined' ? plugins.UnmappedPlacePicker.name : null; placeEmpty(um);
  S.hide(estate || !(ev || ch || card || layChip || um));
  S.showTab('pl', ev || ch || card || !!um);
  // U18：图例只在配了纵深数据的层出现，且包里写了图例条目（条目照 docs/upper-setting.md §4 图例）
  S.showTab('lg', !estate && !!depthData && legendItems().length > 0);
}

// 图例（U18）：一张说明「图上画的这些东西分别是什么」的清单；只有文字，不画矢量图例（设定稿：小样取成图裁片，另议）
// 条目是设定包 ui.legend 的数据（K-R70）：{ type, label, desc, i18n: { en: { label, desc } } }；没有条目 = 这一页不出现
const legendItems = () => (Array.isArray(RT?.ui?.legend) ? RT.ui.legend : []).filter(e => e && typeof e.label === 'string');
const lgText = (e, k) => (LANG === 'en' && e.i18n?.en?.[k]) || e[k] || '';
function legendEl() {
  const box = document.createElement('div'); box.className = 'lg'; box.id = 'legendPane';
  const h = document.createElement('h3'); h.textContent = uiTextOr('s.legend', '图例'); box.appendChild(h);
  const dl = document.createElement('dl');
  for (const e of legendItems()) {
    const dt = document.createElement('dt'); dt.textContent = lgText(e, 'label');
    const dd = document.createElement('dd'); dd.textContent = lgText(e, 'desc'); dl.append(dt, dd);
  }
  box.appendChild(dl); return box;
}

export function placeEmpty(um) {
  const e = $('#cardEmpty'); if (!e || e.dataset.um === (um || '')) return; e.dataset.um = um || '';
  if (!um) { e.textContent = ''; e.textContent = uiTextOr('s.place_empty', '点地图上的地点，这里显示它的介绍'); return; }
  let s = e.querySelector('span.umq'), b = e.querySelector('button');
  if (!s) { e.textContent = ''; s = document.createElement('span'); s.className = 'umq'; b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.onclick = () => plugins.UnmappedPlacePicker.open(); e.append(s, ' ', b); announce(uiTextOr('um.empty', '当前地点「{n}」还不在地图上。', { n: um })); }
  s.textContent = uiTextOr('um.empty', '当前地点「{n}」还不在地图上。', { n: um }) + uiTextOr('um.empty_sub', '放一次，这个聊天之后都会记住。'); b.textContent = uiTextOr('um.empty_btn', '放到地图上');   // 节点复用：焦点不丢
}

export function cardSheet(open) {
  const S = window.ViewerDrawer; if (!S) return; sheetVis();
  if (open) { S.setTab('pl', S.state === 'full' ? 'full' : 'half'); return; }
  if (S.tab === 'pl') { const nx = !S.button('ev').hidden ? 'ev' : !S.button('ch').hidden ? 'ch' : null; if (nx) S.setTab(nx); S.set('peek'); }
}

export function initShell() {
  const dock = makeDock();
  const place = document.createElement('div'); place.id = 'placePane'; place.append($('#card'));
  const empty = document.createElement('p'); empty.id = 'cardEmpty'; place.append(empty);
  const S = window.ViewerDrawer = UISheet.create({ host: $('#stage'), id: 'evbar', railKey: 'edenMapRailW',
    tabs: [{ id: 'ev', btnClass: 'evtab', icon: 'bell' }, { id: 'ch', btnClass: 'chtab', icon: 'users' }, { id: 'pl', btnClass: 'pltab', icon: 'pin', panel: place }, { id: 'lg', btnClass: 'lgtab', icon: 'info', panel: legendEl() }],
    freshText: n => uiTextOr('ev.bar_new', '{n} 条新', { n }),
    onState: ({ state, tab, mode, h }) => {
      S.el.dataset.open = state === 'peek' ? '0' : '1'; S.el.dataset.tab = tab || ''; document.body.classList.toggle('evopen', state !== 'peek');
      document.body.classList.toggle('sheetfull', state === 'full' && mode === 'sheet'); dock.inert = state === 'full' && mode === 'sheet';
      // 半开时控制列最高到屏幕中线，超过就横排贴在抽屉上沿（§10.1）
      const st = $('#stage').getBoundingClientRect(); dock.classList.remove('row');
      if (mode === 'sheet' && state === 'half' && h + dock.offsetHeight + 12 > st.height * .5 + 1) dock.classList.add('row');
      declutter();   // 控制列换了位置 / 排法：重新避让地名
      if (tab === 'ch' || tab === 'ev') plugins.EventsView.renderBar();
      post({ type: 'eden-map:chrome', bottom: h, top: $('header').offsetHeight }); noticeRefresh();
    } });
  S.label('pl', esc(uiTextOr('s.place', '地点')), {}); S.label('lg', esc(uiTextOr('s.legend', '图例')), {});
  S.showTab('ev', false); S.showTab('ch', false); S.showTab('lg', false); S.hide(true);
  // 点地图空白 = 抽屉回到收起（只认移动 < 8 px、< 250 ms 的轻点；点到地标 / 事态按地标处理，§10.4）
  let tp = null;
  $('#osd').addEventListener('pointerdown', e => { tp = e.isPrimary ? { x: e.clientX, y: e.clientY, t: e.timeStamp, on: !!e.target.closest?.('.mk, .ev, .realm, .chm, .tripin, .tc-ring a') } : null; }, true);
  $('#osd').addEventListener('pointerup', e => { if (!tp) return; const q = tp; tp = null;
    if (q.on || e.timeStamp - q.t > 250 || Math.hypot(e.clientX - q.x, e.clientY - q.y) > 8) return;
    if (S.open && S.mode === 'sheet') S.set('peek'); }, true);
  initLabelToggle();
  initStatusDot();
  busOn({ key: 'shell.resize', type: 'resize', fn: () => { placeLayers(); } });
}
