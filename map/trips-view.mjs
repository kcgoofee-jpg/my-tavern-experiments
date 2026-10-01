// 天城 · 行程层（查看器用，v0.9.5）：
//   2 最近的行程（卡内脚本推出，最多玩家 5 段 + 人物 5 段）：按交通方式画——air 虚线弧、underground 点线、teleport 不连线只有两端脉冲点、rail / road 贴地实线；
//     越旧越淡；人物的行程是细线、用人物的颜色；点一段看楼层和时间。图层菜单「行程」开关（默认开，存本机）。
//   1 途中：当前地点写成「A至B的…」「从A到B」「前往B」时（app/place-resolver.mjs 的 transit），在两端之间画一条虚线弧，玩家点放在弧的中点；终点认不出时在起点画「前往 B」箭头。
// 线画在一个铺满两端外框的 SVG 叠加层里（OSD Rect 叠加层，随缩放伸缩；线宽、虚线用 non-scaling-stroke 保持屏幕像素）。
// 查看器核心的状态与工具从 app/*.mjs 显式 import（arch-v2 §6 第 7 步）；别的外挂经 app/plugins.mjs 的 P 取（可能没加载，调用处带守卫）。
import { REG, aspect, cur, curData, viewer } from './app/state.mjs';
import { esc } from './app/dom-helpers.mjs';
import { registry } from './app/layer-host.mjs';
import { showCard, trackEl, untrack } from './app/markers.mjs';
import { drawnAt, hereRes, userMoved } from './app/locate.mjs';
import { P, register } from './app/plugins.mjs';
const TCTrips = (() => {
  const T = (k, zh, v) => window.I18N.tx(k, zh, v);   // 共享 i18n 服务（viewer.html window.I18N）
  let els = [], fitFor = null, trips = [];
  const TK = 'edenMapTrips', on = () => { try { return TCStore.get(TK) !== '0'; } catch (e) { return true; } };
  // 落点 → 当前图上的归一化坐标（地标；庄园 → 它在上层的替身地标）；不在当前图返回 null
  function xy(r) {
    if (!r || typeof REG === 'undefined' || !REG || !cur) return null;
    const d = drawnAt(r), map = d?.map, mk = d?.marker;
    if (map !== cur || !mk) return null;
    const k = curData?.markers?.find(x => x.id === mk); return k ? { x: k.ax ?? k.nx, y: (k.ay ?? k.ny) * aspect } : null;
  }
  function clear() { for (const el of els) { if (typeof untrack === 'function') untrack(el); viewer?.removeOverlay(el); } els = []; }
  // 两点之间的弧：控制点在中垂线上，偏移 = 距离 × bend；返回 SVG 元素（已加到地图）与中点
  function arc(a, b, { cls = '', bend = .18, dash = '6 5' } = {}) {
    const pad = Math.hypot(b.x - a.x, b.y - a.y) * .35 + 1e-4;
    const x0 = Math.min(a.x, b.x) - pad, y0 = Math.min(a.y, b.y) - pad, w = Math.abs(b.x - a.x) + 2 * pad, h = Math.abs(b.y - a.y) + 2 * pad;
    const P = p => [((p.x - x0) / w) * 1000, ((p.y - y0) / h) * 1000];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, c = { x: mx - dy * bend, y: my + dx * bend };
    const [ax, ay] = P(a), [bx, by] = P(b), [cx, cy] = P(c);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 1000 1000'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'trip ' + cls); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<path d="M${ax} ${ay} Q${cx} ${cy} ${bx} ${by}" ${dash ? `stroke-dasharray="${dash}"` : ''} vector-effect="non-scaling-stroke"/>`;
    viewer.addOverlay({ element: svg, location: new OpenSeadragon.Rect(x0, y0, w, h) }); els.push(svg);
    return { svg, mid: { x: .25 * a.x + .5 * c.x + .25 * b.x, y: .25 * a.y + .5 * c.y + .25 * b.y } };
  }
  function pin(p, html, cls, label, onOpen) {
    const el = document.createElement('div'); el.className = 'tripin ' + cls; el.innerHTML = html;
    el._open = onOpen; if (onOpen && typeof trackEl === 'function') trackEl(el, onOpen, label); else el.setAttribute('aria-hidden', 'true');
    viewer.addOverlay({ element: el, location: new OpenSeadragon.Point(p.x, p.y), placement: OpenSeadragon.Placement.CENTER }); els.push(el);
  }
  const short = s => String(s || '').split(/[·・]/).filter(Boolean).pop() || s;
  function renderTransit() {
    const v = (document.getElementById('here')?.value || '').replace('{{user}}', ''), r = typeof hereRes === 'function' ? hereRes(v) : null, t = r?.transit;
    if (!t) return;
    const a = xy(t.from), b = xy(t.to), lab = T('tr.en_route', '{a} → {b}（途中）', { a: short(t.fromText) || '?', b: short(t.toText) });
    const open = () => showCard(null, lab, '', '', t.via || '');
    if (a && b) { const { mid } = arc(a, b, { cls: 'transit' }); pin(mid, '<i></i>', 'you', lab, open);
      if (fitFor !== v && !(typeof userMoved !== 'undefined' && userMoved)) { fitFor = v; const pad = Math.hypot(b.x - a.x, b.y - a.y) * .3 + .01;   // 第一次看到这段途中：把两端都框进视野
        setTimeout(() => viewer.viewport.fitBounds(new OpenSeadragon.Rect(Math.min(a.x, b.x) - pad, Math.min(a.y, b.y) - pad, Math.abs(b.x - a.x) + 2 * pad, Math.abs(b.y - a.y) + 2 * pad)), 300); } }
    else if (a || b) pin(a || b, `<i></i><b>${esc(a ? T('tr.to', '前往 {b}', { b: short(t.toText) }) : T('tr.from', '从 {a} 来', { a: short(t.fromText) }))}</b>`, 'you edge', lab, open);
  }
  const STY = { air: { bend: .2, dash: '7 6' }, underground: { bend: .06, dash: '1.5 6' }, rail: { bend: 0, dash: '' }, road: { bend: 0, dash: '' }, '': { bend: .14, dash: '4 6' } };
  const MODE_T = { air: ['tr.air', '空中'], underground: ['tr.underground', '地下'], teleport: ['tr.teleport', '传送'], rail: ['tr.rail', '轨道'], road: ['tr.road', '地面'], '': ['tr.unknown', '方式未知'] };
  function renderTrips() {
    if (!on() || !trips.length) return;
    const n = trips.length;
    trips.forEach((t, i) => {
      const a = xy(hereRes(t.from)), b = xy(hereRes(t.to)); if (!a || !b || (a.x === b.x && a.y === b.y)) return;
      const age = (n - 1 - i) / Math.max(1, n - 1), op = (1 - age * .65).toFixed(2), who = t.who ? dn(t.who) : T('tr.you', '你');
      const lab = T('tr.trip', '{who}：{a} → {b}', { who, a: short(dn(t.from)), b: short(dn(t.to)) });
      const open = () => showCard(null, lab, '', '', [T('tr.floor', '第 {n} 楼', { n: t.floor }), t.time && esc(t.time), T(...MODE_T[t.mode || ''])].filter(Boolean).join(' · '));
      const col = t.who && typeof P.TCChars !== 'undefined' ? `--tc:${charColor(t.who)}` : '';
      if (t.mode === 'teleport') { for (const p of [a, b]) pin(p, '<i></i>', 'tp' + (t.who ? ' ch' : ''), lab, open); els.slice(-2).forEach(e => { e.style.opacity = op; if (col) e.setAttribute('style', e.getAttribute('style') + ';' + col); }); return; }
      const st = STY[t.mode] || STY[''], { svg, mid } = arc(a, b, { cls: `hist m-${t.mode || 'x'}${t.who ? ' ch' : ''}`, bend: st.bend, dash: st.dash });
      svg.style.opacity = op; if (col) svg.setAttribute('style', svg.getAttribute('style') + ';' + col);
      pin(mid, '', 'hit', lab, open);
    });
  }
  const dn = n => (typeof P.TCCustom !== 'undefined' ? P.TCCustom.name(n) : n);
  const charColor = n => (typeof P.TCChars !== 'undefined' && P.TCChars.color ? P.TCChars.color(n) : '#888');
  function set(items) { trips = Array.isArray(items) ? items.slice(-10) : []; render(); }
  function setOn(v) { try { TCStore.set(TK, v ? '1' : '0'); } catch (e) {} render(); }
  // P3-C：行程层登记为 trips 槽的 osd 图层；「行程」菜单行由 LayerRegistry 渲染（app/layer-host.mjs），存储键 edenMapTrips 与默认开不变
  registry.register({ id: 'trips', slot: 'trips', kind: 'osd', initialVisible: on(),
    menu: { order: 50, id: 'tgTrips', boxId: 'tgTripsBox', labelKey: 'trips', label: '行程' },
    setVisible: v => setOn(v) });
  function render() {
    clear();
    if (typeof viewer === 'undefined' || !viewer || !cur || !viewer.world.getItemCount() || REG.maps[cur]?.kind !== 'points') return;
    renderTrips(); renderTransit();
  }
  const css = `
  svg.trip{overflow:visible;pointer-events:none;z-index:var(--zv-trips,50)}
  svg.trip path{fill:none;stroke:var(--alert);stroke-width:2.5;stroke-linecap:round;filter:drop-shadow(0 0 2px rgba(0,0,0,.6))}
  .tripin{position:relative;width:0;height:0;overflow:visible;z-index:var(--zv-trips,50)}
  .tripin i{position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;background:var(--alert);border:2px solid #fff;box-sizing:border-box;box-shadow:0 0 0 4px color-mix(in srgb,var(--alert) 30%,transparent)}
  .tripin.you{cursor:pointer;pointer-events:auto}
  .tripin.you::before{content:'';position:absolute;left:-22px;top:-22px;width:44px;height:44px}
  .tripin b{position:absolute;left:12px;top:-10px;white-space:nowrap;font:600 var(--fs-micro,11px)/1.3 var(--font-ui,sans-serif);color:var(--map-label-ink,#fff);background:var(--map-label-bg,rgba(8,10,14,.8));padding:2px 7px;border-radius:var(--r-pill,999px)}
  svg.trip.hist path{stroke:var(--accent);stroke-width:2}
  svg.trip.hist.ch path{stroke:var(--tc,var(--accent-2));stroke-width:1.2}
  svg.trip.m-rail path,svg.trip.m-road path{stroke-width:1.6;filter:none;opacity:.9}
  .tripin.hit{cursor:pointer;pointer-events:auto}.tripin.hit::before{content:'';position:absolute;left:-16px;top:-16px;width:32px;height:32px}
  @media (pointer:coarse){.tripin.hit::before{left:-22px;top:-22px;width:44px;height:44px}}
  .tripin.tp{cursor:pointer;pointer-events:auto}.tripin.tp i{left:-6px;top:-6px;width:12px;height:12px;background:var(--accent);border-color:var(--surface)}
  .tripin.tp.ch i{background:var(--tc,var(--accent-2))}
  @media (prefers-reduced-motion:no-preference){.tripin.tp i{animation:trpulse 1.6s ease-in-out infinite}}
  @media (prefers-reduced-motion:no-preference){.tripin.you i{animation:trpulse 2s ease-in-out infinite}}
  @keyframes trpulse{50%{box-shadow:0 0 0 8px color-mix(in srgb,var(--alert) 12%,transparent)}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  return { render, set, setOn, get items() { return trips.map(t => ({ ...t })); }, xy, arc, pin, clear };
})();
register('TCTrips', TCTrips);
export { TCTrips };
