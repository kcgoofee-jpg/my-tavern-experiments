// 从 viewer.html 内联脚本拆出（大版本 2，docs/design/arch-v2.md §6 第 6 步）。外部模块标签按 <base> 解析，srcdoc 里也安全。
// 核心状态与工具显式 import（app/state、util、nav…）；切层包装经 map-switch.mjs 的 setGo 注册。在所有外挂模块之后、DOMContentLoaded（main）之前执行。
// ---------------- 尺度衔接（v0.9.6，批准的设计）：世界 ↔ 主城缩放交接 + 「主城周边」过渡环 ----------------
// (a) 世界图放大到上限、主城在视野中部时继续放大 → 交叉淡入当前层（上次看的那层），落在对应的地理点、最远那一档（约 30 km）；
//     主城某层缩到最远（约 30 km）后继续缩小 → 交叉淡回世界图（最大放大、主城居中）。面包屑随之更新。
// (b) 城外雾（v0.9.7 FOG-1，D39）：以城区（3000×1875 m）为中心、RING_W 倍宽的一圈时段雾 —— 贴城边薄、向外增稠，
//     软噪声成雾不是平涂；近环里世界底图仍隐约可见，随雾浓淡出，夜里整体压成深蓝灰；到环外缘已全雾。
//     城区矩形本身不再画云边：底图外缘由 tier-fog.mjs 的羽化渐隐接进雾。颜色按时段走 --fog-* 令牌。
//     城区完全占满屏幕时隐藏（不画巨大的叠加层）。不需要新渲染。城外 / 异兽类事态落在这一圈（events.mjs）。
// 减少动态效果：交接照常，但没有缩放动画。
// v0.9.6 起推广到所有「世界图地点有自己地图」的组（maps.json groups.<id>.place：主城与各大区）：
// 每组的交接点 = 世界图上该地点；环宽 = RING_W × 该组的 extent_m 宽；环的面包屑「<组名>周边」。
import { worldData, mapRegistry, aspect, currentMapId, pendingFocus, pendingHome, setPendingFocus, setPendingHome, osdViewer } from './state.mjs';
import { $ } from './dom-helpers.mjs';
import { toImg } from './coordinates.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { localName } from './i18n.mjs';
import { getText } from './topbar.mjs';
import { go, groupView } from './map-switch.mjs';
import { RING_W } from './locate.mjs';
import { periodNow } from './period-now.mjs';
import { fogColors } from './tier-fog.mjs';
import { worldGroup } from './nodes-runtime.mjs';
import { artUrl } from './current-pack.mjs';
import { busOn } from './bus.mjs';
import { isOblique } from './oblique.mjs';
const ScaleHandoffApi = (() => {
  const W_M = 12e6;
  const grp = id => { const m = mapRegistry?.maps?.[id]; return m && m.kind === 'points' && m.status !== 'planned' && m.group && mapRegistry.groups[m.group]?.place ? m.group : null; };
  const isTier = id => !!grp(id);
  const T_Mof = id => mapRegistry.maps[id]?.view?.extent_m?.[0] || 3000;
  let lastTier = {}, lastG = null, busy = false, pushes = [], ringOn = false, holder = null;
  const cache = {};
  const ptOf = gid => { const p = [...worldData.places, ...worldData.fiefs].find(q => q.id === mapRegistry.groups[gid]?.place); return p ? toImg(p.x, p.y) : null; };
  const places = () => Object.keys(mapRegistry.groups).filter(g => mapRegistry.groups[g].place && mapRegistry.groups[g].layers.some(isTier) && ptOf(g));
  // 程序噪声（值噪声 fbm，固定种子，每次一样）
  const h2 = (x, y) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  const fbm = (x, y) => vn(x, y) * .5 + vn(x * 2.1, y * 2.1) * .27 + vn(x * 4.3, y * 4.3) * .15 + vn(x * 8.7, y * 8.7) * .08;
  const hexRgb = s => { const m = /^#?([0-9a-f]{6})$/i.exec(s || ''); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [233, 237, 238]; };
  async function paint(upper, asp, gid, T_M, period) {
    const CW = 320, CH = Math.round(CW * asp), c = document.createElement('canvas'); c.width = CW; c.height = CH; const g = c.getContext('2d');
    const [fog, hi] = [fogColors(period).fog, fogColors(period).hi].map(hexRgb);
    g.fillStyle = `rgb(${fog.join(',')})`; g.fillRect(0, 0, CW, CH);
    try {   // 世界底图：主城附近 RING_W × 3 km 那一小块（约 20 px）放大 —— 近环里透过薄雾隐约可见（item 4）
      const x = await getText(artUrl('art/world.dzi')), T = +x.match(/TileSize="(\d+)"/)[1], ov = +(x.match(/Overlap="(\d+)"/)?.[1] || 0), f = x.match(/Format="(\w+)"/)[1];
      const W = +x.match(/Width="(\d+)"/)[1], H = +x.match(/Height="(\d+)"/)[1], top = Math.ceil(Math.log2(Math.max(W, H)));
      const [nx, ny] = ptOf(gid), px = nx * W, py = ny * H, col = Math.floor(px / T), row = Math.floor(py / T), x0 = col * T - (col ? ov : 0), y0 = row * T - (row ? ov : 0);
      const cw = RING_W * T_M / (W_M / W), ch = cw * asp;
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = artUrl(`art/world_files/${top}/${col}_${row}.${f}`); await img.decode();
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(img, Math.max(0, px - x0 - cw / 2), Math.max(0, py - y0 - ch / 2), cw, ch, 0, 0, CW, CH);
    } catch (e) { console.warn('[scale-handoff] world sample', e); }
    let id; try { id = g.getImageData(0, 0, CW, CH); } catch (e) { return c; }
    const D = id.data, cx0 = CW / 2 - CW / RING_W / 2, cx1 = CW / 2 + CW / RING_W / 2, cy0 = CH / 2 - CH / RING_W / 2, cy1 = CH / 2 + CH / RING_W / 2;
    const cityW = CW / RING_W, DMAX = cityW * 1.5, terr = upper ? .5 : .75;   // 雾在约 1.5 城宽处到全浓（再远只是加深到 1，看不见地形）；上层的地面更远、更暗
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const i = (y * CW + x) * 4;
      const dx = Math.max(cx0 - x, 0, x - cx1), dy = Math.max(cy0 - y, 0, y - cy1), out = Math.hypot(dx, dy);
      const inn = Math.min(x - cx0, cx1 - x, y - cy0, cy1 - y), d = out > 0 ? out : -inn;   // 到城区矩形的带符号距离（像素，外正内负）
      if (d < 0) { D[i + 3] = 0; continue; }   // 城区：底图自己（tier-fog 的羽化边缘接雾），环不再伸进来
      const n = fbm(x / 26, y / 26), n2 = fbm(x / 9, y / 9);
      const t = Math.min(1, d / DMAX), e4 = t * t * (3 - 2 * t);   // 平滑步进：贴城薄、向外增稠
      const k = Math.min(1, e4 * (.88 + .12 * n2) + Math.exp(-d / 10) * .18);   // 贴城一圈约 0.2（地形透得出来），到 DMAX 基本吃满
      const L = (D[i] * .3 + D[i + 1] * .59 + D[i + 2] * .11), hj = Math.max(0, Math.min(1, (n - .45) * 1.4)) * .55 * k;   // 雾里的亮斑也随浓度淡出：远圈是平雾，不是一团一团
      const er = Math.hypot((x + .5) / CW * 2 - 1, (y + .5) / CH * 2 - 1) + (n - .45) * .12, outer = Math.min(1, Math.max(0, (.97 - er) / .32));   // 环的外缘按椭圆 + 噪声柔化淡出
      for (let j = 0; j < 3; j++) { const b = (D[i + j] * .6 + L * .4) * terr; D[i + j] = Math.round((b + (fog[j] + (hi[j] - fog[j]) * hj - b) * k)); }
      D[i + 3] = Math.round(255 * (k * outer * outer * (3 - 2 * outer) + (1 - outer) * 0));   // 全浓的雾也随外缘柔化收进页面底色
    }
    g.putImageData(id, 0, 0); return c;
  }
  function ring() {
    if (!isTier(currentMapId)) return;
    if (isOblique()) {   // 斜视图用渲出来的外圈（views.oblique.outskirts，app/tier-fog.mjs），不再画 DOM 雾环
      if (holder) try { osdViewer.removeOverlay(holder); } catch (e) { console.warn('[scale-handoff] overlay', e); }
      holder = null; return;
    }
    const gid = grp(currentMapId), upper = (mapRegistry.groups[gid].upper || []).includes(currentMapId), period = periodNow() || 'day';
    const key = currentMapId + ':' + aspect.toFixed(3) + ':' + period;
    if (holder) try { osdViewer.removeOverlay(holder); } catch (e) { console.warn('[scale-handoff] overlay', e); }   // 时段变了重画：旧环先摘掉
    holder = document.createElement('div'); holder.className = 'tc-ring'; holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'pointer-events:none;'; const h = holder;
    osdViewer.addOverlay({ element: h, location: new OpenSeadragon.Rect(.5 - RING_W / 2, aspect / 2 - RING_W * aspect / 2, RING_W, RING_W * aspect) });
    (cache[key] ??= paint(upper, aspect, gid, T_Mof(currentMapId), period)).then(c => { if (!h.isConnected) return; const cv = c.cloneNode(); cv.getContext('2d').drawImage(c, 0, 0);
      cv.style.cssText = 'width:100%;height:100%;display:block'; h.appendChild(cv); sync(); });
    sync();
  }
  function crumb() {
    const cr = $('#crumbs'); let el = cr.querySelector('.ringc');
    if (ringOn && !el && cr.querySelector('b')) { el = document.createElement('span'); el.className = 'ringc'; const gid = grp(currentMapId), lab = uiTextOr('ring_of', mapRegistry.groups[gid].title + '周边', { name: localName(mapRegistry.groups[gid], 'title') });   // 每个组一个写法（首个组也一样：组名 + 周边）
      el.textContent = lab; const sep = document.createElement('span'); sep.className = 'sep'; sep.setAttribute('aria-hidden', 'true'); sep.textContent = ' › '; el.append(sep);
      el.style.color = 'var(--muted)'; cr.querySelector('b').before(el); }
    if (!ringOn && el) el.remove();
  }
  function sync() {
    if (!osdViewer?.world.getItemCount()) return;
    const w = osdViewer.viewport.getBounds(true).width, t = isTier(currentMapId);
    const bb = osdViewer.viewport.getBounds(true), edge = bb.x < 0 || bb.y < 0 || bb.x + bb.width > 1 || bb.y + bb.height > aspect;   // 拖到图边露出外面：也显示环，不露黑底
    if (holder) holder.style.visibility = t && (w > .9 || edge) ? '' : 'hidden';
    const on = t && w > 1.6; if (on !== ringOn) { ringOn = on; crumb(); } else if (on) crumb();
  }
  // 世界图视野中心最近的那个地点（在视野宽 30% 以内才算）
  function nearest() { const vp = osdViewer.viewport, b = vp.getBounds(true), c = b.getCenter(); let best = null;
    for (const g of places()) { const [nx, ny] = ptOf(g), d = Math.hypot(c.x - nx, c.y - ny * aspect); if (d < b.width * .3 && (!best || d < best.d)) best = { g, d }; }
    return best?.g || null; }
  function handoffIn(ref, gid = nearest() || worldGroup(mapRegistry)) {
    const g = mapRegistry.groups[gid]; if (!g) return;
    const lt = lastTier[gid], id = lt && isTier(lt) ? lt : g.layers.find(isTier); if (!id) return;
    const vp = osdViewer.viewport, c = vp.getCenter(true), [nx, ny] = ptOf(gid), cs = vp.getContainerSize(), T_M = T_Mof(id);
    const dx = Math.max(-4, Math.min(4, (c.x - nx) * W_M / T_M)), dy = Math.max(-2.5, Math.min(2.5, (c.y - ny * aspect) * W_M / T_M));
    const a = mapRegistry.maps[id], asp = (a.view?.extent_m?.[1] || 1875) / (a.view?.extent_m?.[0] || 3000), port = cs.y > cs.x && a.view?.phone;
    const w = a.view?.phone ? a.view.phone[2] : 1, h = w * cs.y / cs.x;   // U2 / fix3：从世界图进城落在核心区（locate.mjs fitIn 再夹进图内），不再停在最远一档的周边云雾（白边）
    groupView[gid] = Object.assign(new OpenSeadragon.Rect(.5 + dx - w / 2, asp / 2 + dy - h / 2, w, h), { handoff: true });
    const sp = vp.pixelFromPoint(new OpenSeadragon.Point(nx, ny * aspect), true);
    window.__zoomSnapEffect = { ox: sp.x, oy: sp.y, scale: 5 }; setPendingFocus(null); setPendingHome(false); go(id);
  }
  function handoffOut() {
    const vp = osdViewer.viewport, cs = vp.getContainerSize(), sp = vp.pixelFromPoint(new OpenSeadragon.Point(.5, aspect / 2), true);
    window.__zoomSnapEffect = { ox: sp.x || cs.x / 2, oy: sp.y || cs.y / 2, scale: .2 }; window.__worldFocusPlace = mapRegistry.groups[grp(currentMapId)]?.place || true; setPendingFocus(null); go('world');
  }
  function onZoom(e) {
    if (busy || !mapRegistry || !currentMapId || !osdViewer.world.getItemCount() || !e || !Number.isFinite(e.zoom)) return;
    const vp = osdViewer.viewport, m = mapRegistry.maps[currentMapId], z = vp.getZoom(true), now = performance.now();
    let dir = 0;
    let tgt = null;
    if (m.kind === 'world' && e.zoom > vp.getMaxZoom() * 1.01 && z >= vp.getMaxZoom() * .9) { tgt = nearest(); if (tgt) dir = 1; }
    if (isTier(currentMapId) && e.zoom < vp.getMinZoom() * .99 && z <= vp.getMinZoom() * 1.12) dir = -1;
    if (!dir) return;   // 约束回弹时也会发 zoom 事件（值在范围内），不能因此清掉计数
    pushes = pushes.filter(p => p.d === dir && now - p.t < 1500); pushes.push({ d: dir, t: now });
    if (pushes.length < 2) return;   // 在极限处再推一下才交接，不会一碰就跳
    pushes = []; busy = true; setTimeout(() => { busy = false; }, 1200);
    dir > 0 ? handoffIn(e.refPoint, tgt) : handoffOut();
  }
  function init() {
    osdViewer.addHandler('zoom', onZoom); osdViewer.addHandler('animation', sync); osdViewer.addHandler('animation-finish', sync); osdViewer.addHandler('open', () => setTimeout(sync, 0));
    busOn({ key: 'scale-handoff.clock', type: 'message', fn: e => { if (!window.__isFromHost?.(e) || e.data?.type !== 'eden-map:clock') return; if (isTier(currentMapId)) ring(); } });   // 时段变了 → 雾换色重画
    new MutationObserver(() => { if (isTier(currentMapId)) { lastG = grp(currentMapId); lastTier[lastG] = currentMapId; } if (!isTier(currentMapId)) { holder = null; ringOn = false; } }).observe(document.body, { attributes: true, attributeFilter: ['data-map'] });
  }
  const t0 = setInterval(() => { if (typeof osdViewer !== 'undefined' && osdViewer && typeof osdViewer.addHandler === 'function') { clearInterval(t0); init(); } }, 100);
  return { isTier, ring, sync, handoffIn, handoffOut, get ringOn() { return ringOn; }, get lastTier() { return lastTier[lastG] || null; }, grp, places };
})();
window.ScaleHandoffApi = ScaleHandoffApi;
