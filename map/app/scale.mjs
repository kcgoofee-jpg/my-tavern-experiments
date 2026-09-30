// 从 viewer.html 内联脚本拆出（大版本 2，docs/design/arch-v2.md §6 第 6 步）。外部模块标签按 <base> 解析，srcdoc 里也安全。
// 核心状态与工具显式 import（app/state、util、nav…）；切层包装经 nav.mjs 的 setGo 注册。在所有外挂模块之后、DOMContentLoaded（main）之前执行。
// ---------------- 尺度衔接（v0.9.6，批准的设计）：世界 ↔ 天城缩放交接 + 「天城周边」过渡环 ----------------
// (a) 世界图放大到上限、天城在视野中部时继续放大 → 交叉淡入当前层（上次看的那层），落在对应的地理点、最远那一档（约 30 km）；
//     天城某层缩到最远（约 30 km）后继续缩小 → 交叉淡回世界图（最大放大、天城居中）。面包屑随之更新。
// (b) 过渡环：以城区（3000×1875 m）为中心、RING_W 倍宽的一圈，用世界底图里天城附近那几像素放大、柔化，再叠一圈程序生成的云海边，
//     盖住城区底图的硬边；城区完全占满屏幕时隐藏（不画巨大的叠加层）。不需要新渲染。城外 / 异兽类事态落在这一圈（events.mjs）。
// 减少动态效果：交接照常，但没有缩放动画。
// v0.9.6 起推广到所有「世界图地点有自己地图」的组（maps.json groups.<id>.place：天城、圣都、原域、旷野高地、圆桌封地）：
// 每组的交接点 = 世界图上该地点；环宽 = RING_W × 该组的 extent_m 宽；环的面包屑「<组名>周边」。
import { M, REG, aspect, cur, pendingFocus, pendingHome, setPendingFocus, setPendingHome, viewer } from './state.mjs';
import { $, toImg, tx } from './util.mjs';
import { nm } from './i18n.mjs';
import { getText } from './topbar.mjs';
import { go, groupView } from './nav.mjs';
import { RING_W } from './locate.mjs';
import { worldGroup } from './nodes-runtime.mjs';
const TCScale = (() => {
  const W_M = 12e6;
  const grp = id => { const m = REG?.maps?.[id]; return m && m.kind === 'points' && m.status !== 'planned' && m.group && REG.groups[m.group]?.place ? m.group : null; };
  const isTier = id => !!grp(id);
  const T_Mof = id => REG.maps[id]?.view?.extent_m?.[0] || 3000;
  let lastTier = {}, lastG = null, busy = false, pushes = [], ringOn = false, holder = null;
  const cache = {};
  const ptOf = gid => { const p = [...M.places, ...M.fiefs].find(q => q.id === REG.groups[gid]?.place); return p ? toImg(p.x, p.y) : null; };
  const places = () => Object.keys(REG.groups).filter(g => REG.groups[g].place && REG.groups[g].layers.some(isTier) && ptOf(g));
  // 程序噪声（值噪声 fbm，固定种子，每次一样）
  const h2 = (x, y) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  const fbm = (x, y) => vn(x, y) * .5 + vn(x * 2.1, y * 2.1) * .27 + vn(x * 4.3, y * 4.3) * .15 + vn(x * 8.7, y * 8.7) * .08;
  async function paint(upper, asp, gid, T_M) {
    const CW = 320, CH = Math.round(CW * asp), c = document.createElement('canvas'); c.width = CW; c.height = CH; const g = c.getContext('2d');
    g.fillStyle = upper ? '#c9d3dc' : '#7d8a6a'; g.fillRect(0, 0, CW, CH);
    try {   // 世界底图：天城附近 RING_W × 3 km 那一小块（约 20 px）放大
      const x = await getText('art/world.dzi'), T = +x.match(/TileSize="(\d+)"/)[1], ov = +(x.match(/Overlap="(\d+)"/)?.[1] || 0), f = x.match(/Format="(\w+)"/)[1];
      const W = +x.match(/Width="(\d+)"/)[1], H = +x.match(/Height="(\d+)"/)[1], top = Math.ceil(Math.log2(Math.max(W, H)));
      const [nx, ny] = ptOf(gid), px = nx * W, py = ny * H, col = Math.floor(px / T), row = Math.floor(py / T), x0 = col * T - (col ? ov : 0), y0 = row * T - (row ? ov : 0);
      const cw = RING_W * T_M / (W_M / W), ch = cw * asp;
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = `art/world_files/${top}/${col}_${row}.${f}`; await img.decode();
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(img, Math.max(0, px - x0 - cw / 2), Math.max(0, py - y0 - ch / 2), cw, ch, 0, 0, CW, CH);
    } catch (e) {}
    let id; try { id = g.getImageData(0, 0, CW, CH); } catch (e) { return c; }
    const D = id.data, cx0 = CW / 2 - CW / RING_W / 2, cx1 = CW / 2 + CW / RING_W / 2, cy0 = CH / 2 - CH / RING_W / 2, cy1 = CH / 2 + CH / RING_W / 2;
    const base = upper ? .1 : .5;   // 上层在云海之上：环里大多是云；中、下层：地面为主，城边一圈云
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const dx = Math.max(cx0 - x, 0, x - cx1), dy = Math.max(cy0 - y, 0, y - cy1), out = Math.hypot(dx, dy);
      const inn = Math.min(x - cx0, cx1 - x, y - cy0, cy1 - y), d = out > 0 ? out : -inn;   // 到城区矩形的带符号距离（像素，外正内负）
      const n = fbm(x / 26, y / 26), edge = Math.exp(-Math.max(d, 0) / 9);
      let k = Math.min(1, Math.max(0, (n - base) * 2.2 + edge * .95));
      const i = (y * CW + x) * 4, L = (D[i] * .3 + D[i + 1] * .59 + D[i + 2] * .11);
      for (let j = 0; j < 3; j++) { const b = D[i + j] * .6 + L * .4; D[i + j] = b + ([244, 246, 250][j] - b) * k; }
      const er = Math.hypot((x + .5) / CW * 2 - 1, (y + .5) / CH * 2 - 1) + (n - .45) * .12, outer = Math.min(1, Math.max(0, (.97 - er) / .32));   // 环的外缘按椭圆 + 噪声柔化淡出（以前按矩形，四角看得出方框）
      D[i + 3] = d >= 0 ? Math.round(255 * outer * outer * (3 - 2 * outer)) : Math.round(255 * k * Math.max(0, 1 + d / 3.5) * .85);   // 城内：只留 3–4 px 宽的云边，盖住底图硬边
    }
    g.putImageData(id, 0, 0); return c;
  }
  function ring() {
    if (!isTier(cur)) return;
    const gid = grp(cur), upper = (REG.groups[gid].upper || []).includes(cur), key = cur + ':' + aspect.toFixed(3);
    holder = document.createElement('div'); holder.className = 'tc-ring'; holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'pointer-events:none;'; const h = holder;
    viewer.addOverlay({ element: h, location: new OpenSeadragon.Rect(.5 - RING_W / 2, aspect / 2 - RING_W * aspect / 2, RING_W, RING_W * aspect) });
    (cache[key] ??= paint(upper, aspect, gid, T_Mof(cur))).then(c => { if (!h.isConnected) return; const cv = c.cloneNode(); cv.getContext('2d').drawImage(c, 0, 0);
      cv.style.cssText = 'width:100%;height:100%;display:block'; h.appendChild(cv); sync(); });
    sync();
  }
  function crumb() {
    const cr = $('#crumbs'); let el = cr.querySelector('.ringc');
    if (ringOn && !el && cr.querySelector('b')) { el = document.createElement('span'); el.className = 'ringc'; const gid = grp(cur), lab = tx('ring_of', REG.groups[gid].title + '周边', { name: nm(REG.groups[gid], 'title') });   // 每个组一个写法（首个组也一样：组名 + 周边）
      el.textContent = lab; const sep = document.createElement('span'); sep.className = 'sep'; sep.setAttribute('aria-hidden', 'true'); sep.textContent = ' › '; el.append(sep);
      el.style.color = 'var(--muted)'; cr.querySelector('b').before(el); }
    if (!ringOn && el) el.remove();
  }
  function sync() {
    if (!viewer?.world.getItemCount()) return;
    const w = viewer.viewport.getBounds(true).width, t = isTier(cur);
    const bb = viewer.viewport.getBounds(true), edge = bb.x < 0 || bb.y < 0 || bb.x + bb.width > 1 || bb.y + bb.height > aspect;   // 拖到图边露出外面：也显示环，不露黑底
    if (holder) holder.style.visibility = t && (w > .9 || edge) ? '' : 'hidden';
    const on = t && w > 1.6; if (on !== ringOn) { ringOn = on; crumb(); } else if (on) crumb();
  }
  // 世界图视野中心最近的那个地点（在视野宽 30% 以内才算）
  function nearest() { const vp = viewer.viewport, b = vp.getBounds(true), c = b.getCenter(); let best = null;
    for (const g of places()) { const [nx, ny] = ptOf(g), d = Math.hypot(c.x - nx, c.y - ny * aspect); if (d < b.width * .3 && (!best || d < best.d)) best = { g, d }; }
    return best?.g || null; }
  function handoffIn(ref, gid = nearest() || worldGroup(REG)) {
    const g = REG.groups[gid]; if (!g) return;
    const lt = lastTier[gid], id = lt && isTier(lt) ? lt : g.layers.find(isTier); if (!id) return;
    const vp = viewer.viewport, c = vp.getCenter(true), [nx, ny] = ptOf(gid), cs = vp.getContainerSize(), T_M = T_Mof(id);
    const dx = Math.max(-4, Math.min(4, (c.x - nx) * W_M / T_M)), dy = Math.max(-2.5, Math.min(2.5, (c.y - ny * aspect) * W_M / T_M));
    const a = REG.maps[id], asp = (a.view?.extent_m?.[1] || 1875) / (a.view?.extent_m?.[0] || 3000), port = cs.y > cs.x && a.view?.phone;
    const w = a.view?.phone ? a.view.phone[2] : 1, h = w * cs.y / cs.x;   // U2 / fix3：从世界图进城落在核心区（locate.mjs fitIn 再夹进图内），不再停在最远一档的周边云雾（白边）
    groupView[gid] = Object.assign(new OpenSeadragon.Rect(.5 + dx - w / 2, asp / 2 + dy - h / 2, w, h), { handoff: true });
    const sp = vp.pixelFromPoint(new OpenSeadragon.Point(nx, ny * aspect), true);
    window.__snapFx = { ox: sp.x, oy: sp.y, scale: 5 }; setPendingFocus(null); setPendingHome(false); go(id);
  }
  function handoffOut() {
    const vp = viewer.viewport, cs = vp.getContainerSize(), sp = vp.pixelFromPoint(new OpenSeadragon.Point(.5, aspect / 2), true);
    window.__snapFx = { ox: sp.x || cs.x / 2, oy: sp.y || cs.y / 2, scale: .2 }; window.__worldTC = REG.groups[grp(cur)]?.place || true; setPendingFocus(null); go('world');
  }
  function onZoom(e) {
    if (busy || !REG || !cur || !viewer.world.getItemCount() || !e || !Number.isFinite(e.zoom)) return;
    const vp = viewer.viewport, m = REG.maps[cur], z = vp.getZoom(true), now = performance.now();
    let dir = 0;
    let tgt = null;
    if (m.kind === 'world' && e.zoom > vp.getMaxZoom() * 1.01 && z >= vp.getMaxZoom() * .9) { tgt = nearest(); if (tgt) dir = 1; }
    if (isTier(cur) && e.zoom < vp.getMinZoom() * .99 && z <= vp.getMinZoom() * 1.12) dir = -1;
    if (!dir) return;   // 约束回弹时也会发 zoom 事件（值在范围内），不能因此清掉计数
    pushes = pushes.filter(p => p.d === dir && now - p.t < 1500); pushes.push({ d: dir, t: now });
    if (pushes.length < 2) return;   // 在极限处再推一下才交接，不会一碰就跳
    pushes = []; busy = true; setTimeout(() => { busy = false; }, 1200);
    dir > 0 ? handoffIn(e.refPoint, tgt) : handoffOut();
  }
  function init() {
    viewer.addHandler('zoom', onZoom); viewer.addHandler('animation', sync); viewer.addHandler('animation-finish', sync); viewer.addHandler('open', () => setTimeout(sync, 0));
    new MutationObserver(() => { if (isTier(cur)) { lastG = grp(cur); lastTier[lastG] = cur; } if (!isTier(cur)) { holder = null; ringOn = false; } }).observe(document.body, { attributes: true, attributeFilter: ['data-map'] });
  }
  const t0 = setInterval(() => { if (typeof viewer !== 'undefined' && viewer && typeof viewer.addHandler === 'function') { clearInterval(t0); init(); } }, 100);
  return { isTier, ring, sync, handoffIn, handoffOut, get ringOn() { return ringOn; }, get lastTier() { return lastTier[lastG] || null; }, grp, places };
})();
window.TCScale = TCScale;
