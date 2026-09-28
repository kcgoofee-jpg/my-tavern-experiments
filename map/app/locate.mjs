// 初始视角与当前地点：focusStart、markHere、here.mjs 六级落点、jumpHere。
import { M, REG, aspect, cur, curData, pendingFocus, pendingHome, setPendingFocus, setPendingHome, viewer } from './state.mjs';
import { $, toImg } from './util.mjs';
import { leanBg } from './tiers.mjs';
import { go, groupView } from './nav.mjs';
import { estFail, estateRoom, estateStandIn } from './estate.mjs';
import { updateLayerBadges } from './layers.mjs';
import { rebuildHere } from './extapi.mjs';
import { P } from './plugins.mjs';
// ---------------- 初始视角与当前地点 ----------------
export let userMoved = false;
let focusHere = false;   // 「当前位置」在同一张图上：飞到当前地点而不是核心区
// 地图的实际尺度（maps.json 的 view.extent_m）：米 → 占图宽的比例
const viewNorm = (m, key) => { const v = m.view; return v?.[key] && v.extent_m?.[0] ? v[key] / v.extent_m[0] : null; };
// 最大放大：按 view.min_width_m（最大放大时还能看见多宽）；没有 view 的图沿用全局的 maxZoomPixelRatio
// 另加像素上限：最多放大到底图 1 像素 ≈ 1.25 个屏幕像素（CSS），再放大只是糊（用户 2026-09-27 同意），取两者中更「远」的那个
export const MAX_PX = 1.25, RING_W = 10;
export function applyZoomLimit() { if (REG.maps[cur]?.kind === 'estate') return; const it = viewer.world.getItemAt(0); if (!it) return;
  const mw = viewNorm(REG.maps[cur], 'min_width_m') || 0, pw = viewer.container.clientWidth / (it.getContentSize().x * MAX_PX);
  // v0.9.6「天城周边」：天城各层最远能缩到 RING_W 倍图宽（约 30 km），城边拖得出去（visibilityRatio 放宽），不再撞到硬边
  const ring = window.TCScale?.isTier(cur); viewer.viewport.minZoomLevel = ring ? 1 / RING_W : null; viewer.viewport.visibilityRatio = ring ? .15 : 1;
  viewer.viewport.maxZoomLevel = 1 / Math.max(mw, pw); viewer.viewport.applyConstraints(); }
export function focusStart(immediately) {
  if (userMoved || !viewer || !viewer.world.getItemCount()) return;
  const m = REG.maps[cur], cs = viewer.viewport.getContainerSize();
  // fix3（用户 2026-09-28）：切层 / 切图一律按本层核心区取景并夹在图内（不露空白 / 白边）；只有从世界图放大进城（handoffIn 给的 groupView）沿用交接视野，同样夹在图内
  const gv = m.group && m.kind === 'points' && groupView[m.group];
  const home = pendingHome; setPendingHome(false);
  if (gv && gv.handoff && immediately && !pendingFocus && !home) { delete groupView[m.group]; fitIn(gv, true); userMoved = true; return; }
  let nx, ny, w;
  if (m.kind === 'world' && window.__worldTC) {   // v0.9.6 从天城缩出来：世界图最大放大、天城居中
    const pid = typeof window.__worldTC === 'string' ? window.__worldTC : 'tiancheng'; window.__worldTC = false;
    const p = [...M.places, ...M.fiefs].find(q => q.id === pid) || M.places.find(q => q.id === 'tiancheng'); [nx, ny] = toImg(p.x, p.y);
    const w0 = (viewNorm(m, 'min_width_m') || .06) * (cs.y > cs.x ? cs.x / cs.y : 1), h0 = w0 * cs.y / cs.x;
    fitIn(new OpenSeadragon.Rect(nx - w0 / 2, ny * aspect - h0 / 2, w0, h0), immediately); return;
  }
  if (m.kind === 'world') {
    const el = document.querySelector('.mk.here') || [...document.querySelectorAll('.mk')].find(e => e.dataset.name === '天城');
    const p = el && M.places.find(q => q.name === el.dataset.name) || M.fiefs.find(q => q.name === el?.dataset.name) || M.places.find(q => q.id === m.view?.focus) || M.places[0];
    [nx, ny] = toImg(p.x, p.y); w = .34;
  } else {
    const here = document.querySelector('.mk.here')?.dataset.name, mk = curData?.markers || [];
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
function fitIn(r, immediately) { const f = frameRect(r, viewer.viewport.getContainerSize(), aspect); viewer.viewport.fitBounds(new OpenSeadragon.Rect(f.x, f.y, f.width, f.height), immediately); }
// 当前地点高亮（由 MVU 变量「世界.当前地点」驱动）；世界图上，庄园与天城内部的地点都归到「天城」
export const ALIAS = { '天城': ['天城', '伊甸', '庄园', '书房', '主卧', '大厅', '餐厅', '会客厅', '客房', '寝', '浴室', '后庭', '前庭', '上层', '中层', '下层', '钢铁霓虹', '地基', '公寓', '银冠堡'] };
export function markHere(v) {
  v = (v || '').replace('{{user}}', '');
  $('#hereGo').hidden = !hereRes(v);
  // 解析出的落点也算：庄园里的任何地方 → 上层的「伊甸庄园」标记与世界图的「天城」；天城任一层 → 「天城」；地标 → 该标记
  const r = hereRes(v), tcLayers = REG?.groups?.tiancheng?.layers || [], m = cur && REG.maps[cur];
  const extra = new Set();
  if (r) {
    if (tcLayers.includes(r.map)) extra.add('天城');
    for (const k of Object.values(m?.markers || {})) if (k.link?.map === r.map && REG.maps[r.map]?.kind === 'estate') extra.add(k.name);
    if (r.marker && r.map === cur) extra.add(m.markers?.[r.marker]?.name);
    if (r.place) extra.add(r.place);
  }
  document.querySelectorAll('.mk').forEach(e => { const n = e.dataset.name, al = e.dataset.alias ? e.dataset.alias.split('|') : ALIAS[n] || [];
    const hit = !!v && (extra.has(n) || v.includes(n) || n.includes(v) || al.some(k => v.includes(k)));
    e.classList.toggle('here', hit); });
  if (r) window.TCFog?.here(r);   // 迷雾探索：记一次到访（开着时）
  if (typeof P.TCUnmapped !== 'undefined') P.TCUnmapped.update(v);   // v0.9.6 未上图
  updateLayerBadges(); estateRoom(); if (typeof P.TCTrips !== 'undefined') P.TCTrips.render();   // v0.9.5 途中：两端之间的虚线弧
}
// ---------------- 自动跳到当前地点（map/here.mjs 六级落点；设置里可关，默认开） ----------------
// 庄园房间 / 区域 → 庄园（房间由 estate:room 高亮，切楼层由庄园页自己做）；地标 → 该层并打开地点卡；层 / 大区 / 天城 → 该层默认视野；世界地名 → 世界图；匹配不到不动。
// 打开面板（或唤醒）后的第一条地点一定跳；之后只有地点变了才跳，不打断用户自己在别的图上浏览。
export let estPlan = null;   // v0.9.6 map/data/eden_estate_rooms.json（卡设定分层房间，房间名照抄卡）
export let HX = null, hereIdx = null;
export const hereRes = v => (HX && hereIdx ? HX.resolveHere(v, hereIdx) : null);
export function jumpHere(v) {   // 只由「当前位置」按钮调用（不再在打开 / 地点更新时自动跳）
  let r = hereRes(v);
  if (!r || !REG?.maps[r.map] || REG.maps[r.map].status === 'planned') return false;
  // 本次会话庄园三维加载失败过、或省流设备：落到它的平面替身（上层的伊甸地标），地点卡里有「进入庄园」
  if (REG.maps[r.map].kind === 'estate' && (estFail || leanBg())) { const sub = estateStandIn(r.map); if (sub) r = { ...r, map: sub.map, marker: sub.marker }; }
  if (r.map !== cur) { setPendingFocus(r.marker || null); setPendingHome(!r.marker && !r.place); go(r.map); return true; }
  if ((r.marker || r.place) && viewer?.world.getItemCount()) { userMoved = false; markHere(v); focusHere = true; focusStart(false); }   // 同一张图：飞到地标 / 世界地名
  return true;
}
export function setUserMoved(v) { return (userMoved = v); }
export function setHereIdx(v) { return (hereIdx = v); }
export function setEstPlan(v) { return (estPlan = v); }
export function setHX(v) { return (HX = v); }
