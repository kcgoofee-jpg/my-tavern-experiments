// 标记与地点卡：placeN、trackEl、marker、showCard / closeCard、世界图与点位图叠加。
import { M, REG, aspect, cur, curData, ovData, depthData, viewer } from './state.mjs';
import * as TCStore from '../core/storage.mjs';   // Part 6-4：动作注入模式（edenMapInject）从本机读
import { $, esc, narrow, toImg } from './util.mjs';
import { island as depthIsland, parallaxOn } from '../core/depth.mjs';
import { declutter } from './tiers.mjs';
import { LANG, nm, t, tr } from './i18n.mjs';
import { cardSheet } from './shell.mjs';
import { P } from './plugins.mjs';
// ---------------- 标记 ----------------
export function placeN(el, nx, ny, placement = OpenSeadragon.Placement.TOP_LEFT) {
  viewer.addOverlay({ element: el, location: new OpenSeadragon.Point(nx, ny * aspect), placement });
}
function place(el, x, y, placement) { const [nx, ny] = toImg(x, y); placeN(el, nx, ny, placement); }
// 叠加层的点击追踪器：OSD 的 MouseTracker 要显式 destroy，否则元素移走后监听还在（切层 20 轮监听 792 → 9065，E4 N11）。
// 同时让它可以用键盘操作：Tab 聚焦、Enter / 空格打开（E4 N18）
let trackers = [];
export function trackEl(el, onOpen, label) {
  const tk = new OpenSeadragon.MouseTracker({ element: el, clickHandler: () => { cardFrom = el; onOpen(); } });
  trackers.push(tk); el._tk = tk;
  el.tabIndex = 0; el.setAttribute('role', 'button'); if (label) el.setAttribute('aria-label', label);
  el.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); e.stopPropagation(); cardFrom = el; onOpen(); $('#cardTitle').focus({ preventScroll: true }); });
  return tk;
}
export function untrack(el) { const tk = el?._tk; if (!tk) return; el._tk = null; trackers = trackers.filter(x => x !== tk); tk.destroy(); }
export function untrackAll() { const all = trackers; trackers = []; for (const tk of all) { if (tk.element) tk.element._tk = null; tk.destroy(); } }
export let cardFrom = null;   // 打开卡片的元素：卡片关闭后焦点回到这里
// 开局编号：标签上连续的写成区间（开局一至五）；opening_dest = 该开局的目的地（起点在庄园书房），卡片里逐个列出
function markerEl({ name, sub, cls = '', tag = 'set', src, extra = '', alias, name_en, sub_en, openings, opening_dest, cover }) {
  const el = document.createElement('div'); el.className = 'mk ' + cls + (tag === 'inf' ? ' inf' : '');
  const dn = LANG === 'en' ? name_en || tr(name) : name, ds = sub && (LANG === 'en' ? sub_en || tr(sub) : sub);   // 显示名随语言；dataset.name 保持中文（当前地点匹配用）
  // U16 / U17：标签与图钉包一层 .mki，视差位移与漂浮只动这一层（.mk 自身的 transform 是 OSD 定位用的）
  el.innerHTML = `<div class="mki"><div class="lab">${esc(dn)}${ds ? '<small> · ' + esc(ds) + '</small>' : ''}</div><div class="pin"></div></div>`;
  el.dataset.name = name; if (alias) el.dataset.alias = alias.join('|');
  // v0.9.6（用户 2026-09-27）：地图上不再显示「开局 N」金色标签与地点卡里的开局列表（地图跟随 MVU 当前地点，选了开局就跳过去）；openings 数据只留给自检与文档
  el._open = () => showCard(el, dn, tag, src, extra, ds, cover);
  trackEl(el, el._open, dn + (ds ? ' · ' + ds : ''));
  return el;
}
function marker(o) { const el = markerEl(o); place(el, o.x, o.y); return el; }
// 卡片：顶行 tag + 关闭；标题；副标题；正文（设定原文）或字段区；链接行（规范 3.2）
export function showCard(el, name, tag, src, extra, sub, cover) {
  document.querySelectorAll('.mk.active').forEach(e => e.classList.remove('active')); el && el.classList.add('active');
  const c = $('#card'); c.hidden = false; c.classList.remove('person2'); document.body.classList.add('cardopen');
  cardSheet(true);   // UI v2：地点卡 = 抽屉「地点」页，半开（已经全开就保持）
  const tg = c.querySelector('.tag'); tg.textContent = t(tag === 'inf' ? 'tag_inf' : 'tag_set'); tg.className = 'tag' + (tag === 'inf' ? ' inf' : ''); tg.removeAttribute('style');   // 事态卡的数据色不带到地点卡
  const cv = c.querySelector('.cover');
  if (cv) { if (cover?.src_800) { cv.hidden = false; cv.src = cover.src_800; cv.alt = (LANG === 'en' ? (cover.alt_en || cover.alt) : cover.alt) || ''; } else { cv.hidden = true; cv.removeAttribute('src'); cv.alt = ''; } }
  c.querySelector('.sub').textContent = sub || '';
  const sv = c.querySelector('.src'); c.querySelector('h2').textContent = name; sv.textContent = src || '';
  if (LANG === 'en' && /[\u4e00-\u9fff]/.test(src || '') && t('src_note')) sv.dataset.note = t('src_note'); else delete sv.dataset.note;   // 英文界面：设定原文保持中文，加一行说明
  // extra 也接受函数：开卡那一刻才算（Part 6-4 的注入入口要跟着设置实时出现 / 消失，
  // 不必重画整层标记——重画会重复 addOverlay，标记会叠一层）
  c.querySelector('.extra').innerHTML = (typeof extra === 'function' ? extra() : extra) || '';
  if (typeof P.TCCustom !== 'undefined') P.TCCustom.decorateCard(el, name);   // v0.9.3：自定义显示名 / 用途；本人地点卡的着装
  if (typeof P.TCInv !== 'undefined') P.TCInv.decorate(el, name);   // 空间化背包（Part 5-1）：这里存放的东西
  if (typeof P.TCScrap !== 'undefined') P.TCScrap.decorate(el, name);   // 见闻录（Part 5-5）：这里钉过的图与手记
  if (typeof P.TCSecurity !== 'undefined') P.TCSecurity.decorate(el, name);   // v0.9.6 安保叠加层开着时：结界 / 监控 / 门禁
  if (typeof P.TCWb !== 'undefined') P.TCWb.decorate(el, name);   // W8 世界书档案胶囊：附加书里这个地点的条目摘要（只读）
  if (typeof P.TCCompose !== 'undefined') P.TCCompose.attach(el || tag === 'set' ? { go: el?.dataset?.name || name, ask: el?.dataset?.name || name } : null);   // v0.9.6 地图 → 聊天：地点卡；事件 / 人物卡由 events.js / chars.js 另挂
  declutter();
}
// user = 用户主动关闭（× / Esc）：焦点回到打开卡片的元素
export function closeCard(user) {
  const c = $('#card'), had = !c.hidden, inCard = c.contains(document.activeElement);
  c.hidden = true; document.body.classList.remove('cardopen'); document.querySelectorAll('.mk.active').forEach(e => e.classList.remove('active'));
  if (had) cardSheet(false);
  if (had && (user === true || inCard) && cardFrom?.isConnected) cardFrom.focus({ preventScroll: true });
  if (had) declutter();
}
export function worldOverlays() {
  for (const r of M.realms) { const el = document.createElement('div'); el.className = 'realm ' + r.id;
    el.innerHTML = `<b>${esc(tr(r.name))}</b><span>${esc(tr(r.sub))}</span>`;
    trackEl(el, () => showCard(null, tr(r.name), r.tag, r.src), tr(r.name));
    const off = { oren: -95, fed: -150, xl: -110 }[r.id]; place(el, r.c[0], r.c[1] + off, OpenSeadragon.Placement.CENTER); }
  for (const m of M.minors) { if (m.n < 600) continue; const el = document.createElement('div'); el.className = 'minor'; el.textContent = t('minor');
    place(el, m.c[0], m.c[1], OpenSeadragon.Placement.CENTER); }
  { const el = document.createElement('div'); el.className = 'realm'; el.innerHTML = `<b style="font-size:20px;letter-spacing:${LANG === 'en' ? 2 : 6}px">${esc(tr('海外诸地'))}</b><span>${esc(tr('稀有矿物 · 异域人员输出地'))}</span>`;
    trackEl(el, () => showCard(null, tr('海外诸地'), 'inf', '货币与贸易：天城输入稀有矿物、异域特殊体质人员（部分来自海外）'), tr('海外诸地'));
    place(el, M.overseas[0], M.overseas[1], OpenSeadragon.Placement.CENTER); }
  const gOf = id => id && Object.keys(REG.groups).find(k => REG.groups[k].place === id);   // 世界图地点 → 有地图的组（天城、开局地点）
  const enter = gid => { const g = gid && REG.groups[gid]; if (!g) return ''; return g.layers.map(k => { const L = REG.maps[k];
    return L.status === 'planned' ? `<span class="planned">${esc(nm(L.layer))}${esc(t('planned_paren'))}</span>` : `<a data-go="${k}" role="button" tabindex="0">${esc(t('enter', { name: nm(L.layer) }))}</a>`; }).join(''); };
  for (const p of M.places) {
    const gid = gOf(p.id);
    marker({ name: p.name, sub: p.sub, cls: (p.type === 'capital' ? 'capital' : 'start') + (gid ? ' drill' : ''), tag: p.tag, src: p.src, x: p.x, y: p.y, openings: p.openings, extra: enter(gid) });
  }
  for (const f of M.fiefs) { const gid = gOf(f.id); marker({ name: f.name, cls: gid ? 'drill' : '', tag: f.tag, src: f.src, x: f.x, y: f.y, extra: enter(gid) }); }
}
// 闭合多边形 → 平滑闭合曲线（Catmull-Rom 转三次贝塞尔，曲线经过每个顶点）
function smoothPath(P) {
  const n = P.length, f = v => v.toFixed(1); let d = `M${f(P[0][0])},${f(P[0][1])}`;
  for (let k = 0; k < n; k++) {
    const p0 = P[(k - 1 + n) % n], p1 = P[k], p2 = P[(k + 1) % n], p3 = P[(k + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}
// ---------------- 纵深（U16 视差 / 漂浮、U17 标签按远近） ----------------
// 数据只有一份：map/data/<layer>_depth.json（maps.json 的 depth 字段，切层时由 nav.mjs 取来）；公式只在 core/depth.mjs，这里不再实现第二遍。
//   标签不透明度 = label 通道（近 1.0 → 远 0.65）；远岛（d ≥ FAR_D）平时只留图钉，悬停 / 聚焦 / 打开卡片才全显。
//   视差 = parallax 通道（近 1.0 → 远 0.2），按底图屏幕位移累加；漂浮 ±2 px、周期 8–14 s（越远越慢）。
//   开关：数据里 channels.parallax.enabled 是总开关；手机（narrow）与「减少动态效果」一律不晃（设定稿 §手机 375 px：手机视差默认关）。
const RMq = matchMedia('(prefers-reduced-motion: reduce)');
const FAR_D = 0.6;
let depthEls = [], depthAcc = { x: 0, y: 0, last: null }, depthHooked = false;
const depthOn = () => parallaxOn(depthData) && !narrow && !RMq.matches;
function depthFx(el, meta) {
  el.style.removeProperty('--lab'); el.classList.remove('far', 'flt'); el._par = 1;
  const cfg = depthData, id = meta?.island;
  if (!cfg?.islands?.[id]) return;
  const isl = depthIsland(id, cfg);
  el._par = isl.parallax;
  el.style.setProperty('--lab', String(isl.label));
  el.classList.toggle('far', isl.d >= FAR_D);
  if (depthOn()) { el.classList.add('flt'); el.style.setProperty('--fdur', (8 + isl.d * 6).toFixed(1) + 's'); }
}
function depthPan() {
  if (!depthEls.length || !depthOn()) return;
  const vp = viewer.viewport, c = vp.getCenter(true), sc = viewer.container.clientWidth / vp.getBounds(true).width;
  if (depthAcc.last) {
    depthAcc.x -= (c.x - depthAcc.last.x) * sc; depthAcc.y -= (c.y - depthAcc.last.y) * sc;
    for (const el of depthEls) {
      const p = el._par ?? 1;
      el.style.setProperty('--px', (depthAcc.x * p).toFixed(1) + 'px');
      el.style.setProperty('--py', (depthAcc.y * p).toFixed(1) + 'px');
    }
  }
  depthAcc.last = c;
}
function hookDepth() {
  if (depthHooked || !viewer) return; depthHooked = true;
  viewer.addHandler('viewport-change', depthPan); viewer.addHandler('animation', depthPan);
}
// Part 6-4：改了注入模式后关掉当前卡片即可——入口是开卡时现算的（见 showCard 的 extra），
// 不走「重画整层标记」那条路：pointOverlays 只加不清，重画会把标记叠一层。
window.TCMarkers = { closeCard: () => { try { closeCard(); } catch (e) {} } };
// 渲染脚本导出的点位地图（天城各层）：标记 + 结界圈（或别的地图的岛屿轮廓，如中层的「上层投影」）
export function pointOverlays() {
  const m = REG.maps[cur], d = curData || { markers: [], islands: [] }, od = ovData || {};
  depthEls = []; depthAcc = { x: 0, y: 0, last: null }; hookDepth();   // 切层：视差累加归零，重新收集有纵深的标记
  window.TCScale?.ring();   // v0.9.6：城外一圈（最先加，排在标记下面）
  if (m.overlay?.type === 'barriers' && od.islands?.length) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), VW = 1000, VH = 1000 * aspect;
    svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.classList.add('barriers');
    if (m.overlay.from) svg.classList.add('proj');
    // 有 outline（渲染脚本导出的岛轮廓，归一化、左上原点）就按轮廓画平滑闭合曲线；没有时退回椭圆
    // 结界比岛缘略向外扩（5%），投影就是岛本身的轮廓
    const grow = m.overlay.from ? 1 : 1.05;
    for (const i of od.islands) { let e;
      if (Array.isArray(i.outline) && i.outline.length >= 8) {
        e = document.createElementNS(ns, 'path');
        e.setAttribute('d', smoothPath(i.outline.map(([x, y]) => [(i.nx + (x - i.nx) * grow) * VW, (i.ny + (y - i.ny) * grow) * VH])));
      } else {
        e = document.createElementNS(ns, 'ellipse');
        e.setAttribute('cx', i.nx * VW); e.setAttribute('cy', i.ny * VH); e.setAttribute('rx', i.rx * VW * 1.08); e.setAttribute('ry', i.ry * VH * 1.08);
        e.setAttribute('transform', `rotate(${-i.rot * 180 / Math.PI} ${i.nx * VW} ${i.ny * VH})`);
      }
      if (i.id === 'eden') e.classList.add('eden');
      svg.appendChild(e); }
    svg.style.pointerEvents = 'none';
    viewer.addOverlay({ element: svg, location: new OpenSeadragon.Rect(0, 0, 1, aspect) });
  }
  // 航线与巡逻环（上层数据的 routes：[{kind: lane | patrol | patrol_city, from, to, pts: [[nx, ny] …]}]）
  if (d.routes?.length) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), VW = 1000, VH = 1000 * aspect;
    svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.classList.add('routes');
    // U8（spec §2.6）：航线在地名标签、人物头像处断开——遮罩里的黑块由 routeGaps() 按标签实际位置更新
    svg.innerHTML = `<defs><mask id="rtGap" maskUnits="userSpaceOnUse" x="0" y="0" width="${VW}" height="${VH}"><rect x="0" y="0" width="${VW}" height="${VH}" fill="#fff"/><g class="gaps"></g></mask></defs><g mask="url(#rtGap)" class="rtg"></g>`;
    const dOf = r => r.pts.map(([x, y], j) => `${j ? 'L' : 'M'}${(x * VW).toFixed(1)},${(y * VH).toFixed(1)}`).join('') + (r.kind !== 'lane' && r.from === r.to ? 'Z' : '');
    for (const pass of ['halo', 'line']) for (const r of d.routes) { if (!(r.pts?.length > 1)) continue;
      const e = document.createElementNS(ns, 'path'); e.setAttribute('d', dOf(r));
      e.setAttribute('class', pass === 'halo' ? 'halo' : ['lane', 'patrol', 'patrol_city'].includes(r.kind) ? r.kind : 'lane'); svg.querySelector('.rtg').appendChild(e); }
    viewer.addOverlay({ element: svg, location: new OpenSeadragon.Rect(0, 0, 1, aspect) });
  }
  // link：跨层通道（如中层检查点 ↔ 下层 7 号井），地点卡里给一个直达链接
  // 卡片链接：通道 meta.link + 可选的三维 meta.link3d（app/cardlinks.mjs；模块没到时退回只渲染通道）
  // 结算方式 / 消费档位（card-omissions C6 / C10 / C15）：标记自己的 econ 优先，否则用本层的 econ
  const econHtml = meta => { const e = nm(meta, 'econ') || nm(m, 'econ'); return e ? `<small class="econ"><b>${esc(t('econ'))}</b> ${esc(e)}</small>` : ''; };
  // 动作注入入口（Part 6-4）：模式不是 off 才在卡片底部多一个链接；模式从本机存储读（默认 off）
  // 注入模式每次开卡重读（设置里改了立刻生效）
  const injMode = () => { try { return TCStore.get('edenMapInject') || 'off'; } catch (e) { return 'off'; } };
  const ctx = () => ({ REG, nm, t, esc, mode: injMode(), cur });   // Part 6-4：注入模式每次开卡重读；cur = 三维视口入口判据③（人已经在三维场景里）
  const links = meta => { const linkCtx = ctx();   // 每次开卡重算：注入模式改了立刻生效
    return (window.TCCardLinks ? window.TCCardLinks.linksHtml(meta, linkCtx)
      : meta.link && REG.maps[meta.link.map] && REG.maps[meta.link.map].status !== 'planned' ? `<a data-go="${esc(meta.link.map)}" data-focus="${esc(meta.link.marker || '')}" role="button" tabindex="0">${esc(nm(meta.link, 'label') || t('goto', { title: nm(REG.maps[meta.link.map], 'title') }))}</a>` : '')
      + (window.TCCardLinks?.injectHtml?.(meta, linkCtx) || ''); };
  // 上层导出了标记锚点 ax / ay（岸边停靠平台或主楼旁的空地），图钉落在锚点上，不再压住岛心的主楼；聚焦、飞行也用它（B2 第 2 轮本机 P1）
  for (const k of d.markers || []) if (k.ax != null && k.ay != null) { k.nx = k.ax; k.ny = k.ay; }
  for (const k of d.markers || []) { const meta = m.markers?.[k.id]; if (!meta) continue;
    const el = markerEl({ ...meta, sub: (meta.sub || '').replace(/\{\{user\}\}\s*/g, t('you')), extra: () => econHtml(meta) + links(meta) });
    if (k.id === (m.view?.focus || m.focus)) el.dataset.focus = '1'; if (meta.link) el.dataset.link = '1';   // 标签避让的优先级
    depthFx(el, meta); depthEls.push(el);
    placeN(el, k.nx, k.ny); }
}
export function setCardFrom(v) { return (cardFrom = v); }
