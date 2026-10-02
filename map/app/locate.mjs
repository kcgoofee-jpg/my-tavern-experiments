// 初始视角与当前地点：focusStart、markHere、当前地点的落点（app/place-resolver.mjs：nodes.locate 落到节点树，再还原成原来的结果形状）、jumpHere。
import { worldData, mapRegistry, aspect, currentMapId, currentMapData, pendingFocus, pendingHome, setPendingFocus, setPendingHome, osdViewer } from './state.mjs';
import { $ } from './dom-helpers.mjs';
import { toImg } from './coordinates.mjs';
import { leanBg } from './sharpness-tiers.mjs';
import { go, groupView } from './map-switch.mjs';
import { estFail, estateRoom, estateStandIn } from './subpage3d-host.mjs';
import { updateLayerBadges } from './map-level-nav.mjs';
import { rebuildHere } from './extension-api.mjs';
import { activeInset } from './hires-inset-tiles.mjs';
import { localName, uiText } from './i18n.mjs';
import { plugins } from './plugins.mjs';
import { isScene, eventGeo, groupPlaces } from './nodes-runtime.mjs';
import { drawPlace } from './spot.mjs';
// ---------------- 初始视角与当前地点 ----------------
export let userMoved = false;
let focusHere = false;   // 「当前位置」在同一张图上：飞到当前地点而不是核心区
// 地图的实际尺度（maps.json 的 view.extent_m）：米 → 占图宽的比例
const viewNorm = (m, key) => { const v = m.view; return v?.[key] && v.extent_m?.[0] ? v[key] / v.extent_m[0] : null; };
// 最大放大：按 view.min_width_m（最大放大时还能看见多宽）；没有 view 的图沿用全局的 maxZoomPixelRatio
// 另加像素上限：最多放大到底图 1 像素 ≈ 1.5 个屏幕像素（CSS），再放大只是糊（2026-09-28 从 1.25 调到 1.5，配合局部高清插图收紧），取两者中更「远」的那个。
// 放大到某个地方（主场景等）另外渲了一张局部高清插图（maps.json insets[]）时，这条像素上限改按插图自己的分辨率算，
// 而不是按底图——插图分辨率够高，允许再多放大一些（目标：插图最深处约 1 源像素 ≈ 1 屏幕像素）；插图本身见 app/hires-inset-tiles.mjs。
export const MAX_PX = 1.5, INSET_MAX_PX = 1, RING_W = 10;
export function applyZoomLimit() { if (mapRegistry.maps[currentMapId]?.kind === 'estate') return; const it = osdViewer.world.getItemAt(0); if (!it) return;
  const mw = viewNorm(mapRegistry.maps[currentMapId], 'min_width_m') || 0, cw = osdViewer.container.clientWidth;
  const ins = activeInset();
  // 插图覆盖的范围只占底图的一小块（bounds 宽度），像素上限要按「那一小块在屏幕上能占多宽」折算，不能直接拿插图像素宽比整张底图宽
  const pw = ins ? cw / (ins.res_px[0] / (ins.bounds[2] - ins.bounds[0]) * INSET_MAX_PX) : cw / (it.getContentSize().x * MAX_PX);
  // v0.9.6「主城周边」：主城各层最远能缩到 RING_W 倍图宽（约 30 km），城边拖得出去（visibilityRatio 放宽），不再撞到硬边
  const ring = window.ScaleHandoffApi?.isTier(currentMapId); osdViewer.viewport.minZoomLevel = ring ? 1 / RING_W : null; osdViewer.viewport.visibilityRatio = ring ? .15 : 1;
  osdViewer.viewport.maxZoomLevel = 1 / Math.max(mw, pw); osdViewer.viewport.applyConstraints();
  zoomHint(ins);
}
// 到清晰度上限、且这个地方有自己的细节页（link，比如主场景的三维页）时给个小提示：放大已经到头，点进去才有更细的画面
// 有插图的地方（比如主场景）用插图登记的 marker；没有插图但视野中心就落在某个带 link 的地标上（半径 r 内）也算，
// 这样不用为每个地标都建插图才有提示
function zoomHint(ins) {
  const el = document.getElementById('zoomHint'); if (!el) return;
  const m = mapRegistry.maps[currentMapId], atCap = osdViewer.viewport.getZoom(true) >= osdViewer.viewport.getMaxZoom() - 1e-6;
  let mk = ins?.marker && m?.markers?.[ins.marker];
  if (!mk && atCap && m?.kind === 'points') {
    const c = osdViewer.viewport.getCenter(true);
    const near = (currentMapData?.markers || []).find(k => Math.hypot(k.nx - c.x, k.ny - c.y / aspect) <= (k.r || .02) * 1.5);
    mk = near && m.markers?.[near.id];
  }
  if (atCap && mk?.link) { el.textContent = uiText('zoom_hint', { name: localName(mk, 'name') }); el.hidden = false; }
  else el.hidden = true;
}
export function focusStart(immediately) {
  if (userMoved || !osdViewer || !osdViewer.world.getItemCount()) return;
  const m = mapRegistry.maps[currentMapId], cs = osdViewer.viewport.getContainerSize();
  // fix3（用户 2026-09-28）：切层 / 切图一律按本层核心区取景并夹在图内（不露空白 / 白边）；只有从世界图放大进城（handoffIn 给的 groupView）沿用交接视野，同样夹在图内
  const gv = m.group && m.kind === 'points' && groupView[m.group];
  const home = pendingHome; setPendingHome(false);
  if (gv && gv.handoff && immediately && !pendingFocus && !home) { delete groupView[m.group]; fitIn(gv, true); userMoved = true; return; }
  let nx, ny, w;
  if (m.kind === 'world' && window.__worldFocusPlace) {   // v0.9.6 从主城缩出来：世界图最大放大、主城居中
    const pid = typeof window.__worldFocusPlace === 'string' ? window.__worldFocusPlace : m.view?.focus; window.__worldFocusPlace = false;   // 缩出来落在哪：那个组的地点，没有就是世界图的 view.focus
    const p = [...worldData.places, ...worldData.fiefs].find(q => q.id === pid) || worldData.places.find(q => q.id === m.view?.focus) || worldData.places[0]; [nx, ny] = toImg(p.x, p.y);
    const w0 = (viewNorm(m, 'min_width_m') || .06) * (cs.y > cs.x ? cs.x / cs.y : 1), h0 = w0 * cs.y / cs.x;
    fitIn(new OpenSeadragon.Rect(nx - w0 / 2, ny * aspect - h0 / 2, w0, h0), immediately); return;
  }
  if (m.kind === 'world') {
    const fp = [...worldData.places, ...worldData.fiefs].find(q => q.id === m.view?.focus)?.name;   // 世界图 view.focus 指的那个地点
    const el = document.querySelector('.mk.here') || [...document.querySelectorAll('.mk')].find(e => e.dataset.name === fp);
    const p = el && worldData.places.find(q => q.name === el.dataset.name) || worldData.fiefs.find(q => q.name === el?.dataset.name) || worldData.places.find(q => q.id === m.view?.focus) || worldData.places[0];
    [nx, ny] = toImg(p.x, p.y); w = .34;
  } else {
    const here = document.querySelector('.mk.here')?.dataset.name, mk = currentMapData?.markers || [];
    const id = pendingFocus || Object.entries(m.markers || {}).find(([, v]) => v.name === here)?.[0] || m.view?.focus || m.focus;
    const k = mk.find(q => q.id === id) || { nx: .5, ny: .5 }; nx = k.nx; ny = k.ny; w = .3;
  }
  // U2 / fix3：没有要聚焦的地点时，按 view.phone（核心区 [x, y, w, h]，归一化）取景——桌面与手机都用；没有核心区的图（世界图、封地）沿用 view.width_m
  const core = m.view?.phone, toHere = focusHere; focusHere = false;
  if (core && !pendingFocus && !toHere) { fitIn(new OpenSeadragon.Rect(core[0], core[1] * aspect, core[2], core[3] * aspect), immediately); return; }
  const vw = viewNorm(m, 'width_m');
  if (vw) w = cs.y > cs.x ? vw * cs.x / cs.y : vw;
  fitIn(new OpenSeadragon.Rect(nx - w / 2, ny * aspect - w * cs.y / cs.x / 2, w, w * cs.y / cs.x), immediately);
}
// 取景：先把矩形扩成容器的宽高比，再整体缩进图内（宽 ≤ 1、高 ≤ aspect），最后平移到图内——打开时视口里只有底图，没有空白 / 周边白边
export function frameRect(r, cs, asp) {
  const ar = cs.x / cs.y; let { x, y, width: w, height: h } = r;
  if (w / h < ar) { const nw = h * ar; x -= (nw - w) / 2; w = nw; } else { const nh = w / ar; y -= (nh - h) / 2; h = nh; }
  const k = Math.min(1, 1 / w, asp / h); if (k < 1) { const cx = x + w / 2, cy = y + h / 2; w *= k; h *= k; x = cx - w / 2; y = cy - h / 2; }
  x = Math.max(0, Math.min(1 - w, x)); y = Math.max(0, Math.min(asp - h, y));
  return { x, y, width: w, height: h };
}
function fitIn(r, immediately) { const f = frameRect(r, osdViewer.viewport.getContainerSize(), aspect); osdViewer.viewport.fitBounds(new OpenSeadragon.Rect(f.x, f.y, f.width, f.height), immediately); }
// 当前地点高亮（由 MVU 的当前地点变量驱动）；世界图上，主场景与主城内部的地点都归到「主城」
export const ALIAS = {};   // 世界图地点名 → 落在它里面的词；boot.mjs 按每个地点的 here_words 建，再并进它的各层地图 / 地标别名
export function markHere(v) {
  v = (v || '').replace('{{user}}', '');
  // 解析出的落点也算：主场景里的任何地方 → 上层的「主场景」标记与世界图的「主城」；主城任一层 → 「主城」；地标 → 该标记
  const r = hereRes(v), m = currentMapId && mapRegistry.maps[currentMapId];
  const extra = new Set();
  if (r) {
    for (const n of groupPlaces(mapRegistry, [...worldData.places, ...worldData.fiefs], r.map)) extra.add(n);   // 这张图属于哪个组，世界图上就高亮那个组的地点
    const s = isScene(r.map) ? estateStandIn(r.map) : null; if (s && s.map === currentMapId && s.marker) extra.add(m?.markers?.[s.marker]?.name);   // a 3D page: the marker that stands for it on this map
    if (r.marker && r.map === currentMapId) extra.add(m.markers?.[r.marker]?.name);
    if (r.place) extra.add(r.place);
  }
  document.querySelectorAll('.mk').forEach(e => { const n = e.dataset.name, al = e.dataset.alias ? e.dataset.alias.split('|') : ALIAS[n] || [];
    const hit = !!v && (extra.has(n) || v.includes(n) || n.includes(v) || al.some(k => v.includes(k)));
    e.classList.toggle('here', hit); });
  if (r) window.FogApi?.here(r);   // 迷雾探索：记一次到访（开着时）
  if (typeof plugins.UnmappedPlacePicker !== 'undefined') plugins.UnmappedPlacePicker.update(v);   // v0.9.6 未上图
  updateLayerBadges(); estateRoom(); if (typeof plugins.TripsView !== 'undefined') plugins.TripsView.render();   // v0.9.5 途中：两端之间的虚线弧
}
// ---------------- 自动跳到当前地点（app/place-resolver.mjs 的落点；设置里可关，默认开） ----------------
// 主场景房间 / 区域 → 主场景（房间由 estate:room 高亮，切楼层由主场景页自己做）；地标 → 该层并打开地点卡；层 / 大区 / 主城 → 该层默认视野；世界地名 → 世界图；匹配不到不动。
// 打开面板（或唤醒）后的第一条地点一定跳；之后只有地点变了才跳，不打断用户自己在别的图上浏览。
export let estPlan = null;   // v0.9.6 包数据的分层房间表（卡设定分层房间，房间名照抄卡）
export let placeIndex = null;   // app/place-resolver.mjs 的 makeHere 结果（extension-api.mjs rebuildHere 建；没建好之前认不出任何地点）
export const hereRes = v => (placeIndex ? placeIndex.here(v) : null);
// where a located place (a person, a trip end) is drawn: the node tree's answer for the place text, or for a result already placed (app/spot.mjs)
export const drawnAt = (r, text) => drawPlace(r, text, { hasMap: id => !!mapRegistry?.maps[id], isScene, standIn: estateStandIn, spot: n => eventGeo()?.spot(n) ?? null, zone: (m, t) => plugins.EventsView?.zoneXY?.(m, t) ?? null });
export function jumpHere(v) {   // 只由「当前位置」按钮调用（不再在打开 / 地点更新时自动跳）
  let r = hereRes(v);
  if (!r || !mapRegistry?.maps[r.map] || mapRegistry.maps[r.map].status === 'planned') return false;
  // 本次会话主场景三维加载失败过、或省流设备：落到它的平面替身（上层的主场景地标），地点卡里有「进入主场景」
  if (isScene(r.map) && (estFail || leanBg())) { const sub = estateStandIn(r.map); if (sub) r = { ...r, map: sub.map, marker: sub.marker }; }
  if (r.map === currentMapId && isScene(r.map)) { estateRoom(); return true; }   // HEADER-1: in a 3D page the locate icon sends the page back to the room of the current place
  if (r.map !== currentMapId) { setPendingFocus(r.marker || null); setPendingHome(!r.marker && !r.place); go(r.map); return true; }
  if ((r.marker || r.place) && osdViewer?.world.getItemCount()) { userMoved = false; markHere(v); focusHere = true; focusStart(false); }   // 同一张图：飞到地标 / 世界地名
  return true;
}
export function setUserMoved(v) { return (userMoved = v); }
/**
 * 同一张图内聚焦某个落点（任务三）：地点卡里的链接指向「当前这张图」时用——原来 go() 会因为 id === cur
 * 直接静默返回，点上去毫无反应（宏观世界里最常被当成「点击无响应」的那一类）。返回是否真的动了。
 */
export function focusMarker(name) {
  const id = name == null ? '' : String(name).trim();
  if (!id || !osdViewer?.world.getItemCount()) return false;
  setPendingFocus(id); userMoved = false; focusHere = true; focusStart(false); return true;
}
/**
 * 任务三（b）：启动时**只在「人已经在主场景里」时**跳过宏观世界层，直接下钻到主场景（楼层剖切由主场景页按
 * 当前地点自己做）。这是对 2026-09-28「不再在打开时自动跳」的唯一例外，范围收得很窄：
 *   ① 只有当六级落点解出的地图是 kind=estate 的三维场景时才成立（世界地名 / 主城各层照旧先开世界图）；
 *   ② 本次会话主场景三维失败过、或省流设备 → 不进（会落到平面替身，等于白跳一次）。
 * 返回 true = 已经开好目标图（调用方不要再 go(REG.start)）。
 */
export function startInScene(v0) {
  const v = String(v0 ?? $('#here')?.value ?? '').trim();   // 宿主有时直接把它刚推来的地点递进来（那时输入框还没写）
  if (!v) return false;
  const r = hereRes(v);
  if (!r?.map || !mapRegistry?.maps[r.map] || mapRegistry.maps[r.map].status === 'planned') return false;
  if (mapRegistry.maps[r.map].kind !== 'estate' || estFail || leanBg()) return false;
  return jumpHere(v);
}
export function setPlaceIndex(v) { return (placeIndex = v); }
export function setEstPlan(v) { return (estPlan = v); }
