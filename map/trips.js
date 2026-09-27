// 天城 · 行程层（查看器用，v0.9.5）：
//   1 途中：当前地点写成「A至B的…」「从A到B」「前往B」时（here.mjs resolveTransit），在两端之间画一条虚线弧，玩家点放在弧的中点；终点认不出时在起点画「前往 B」箭头。
// 线画在一个铺满两端外框的 SVG 叠加层里（OSD Rect 叠加层，随缩放伸缩；线宽、虚线用 non-scaling-stroke 保持屏幕像素）。
// 读查看器的全局：viewer、REG、cur、curData、aspect、estateStandIn、hereRes、esc、$、trackEl、untrack、showCard。
const TCTrips = (() => {
  const T = (k, zh, v = {}) => { const r = window.I18N?.t?.(k, v); if (r && r !== k) return r; return Object.entries(v).reduce((s, [a, b]) => s.split('{' + a + '}').join(b), zh); };
  let els = [], fitFor = null;
  // 落点 → 当前图上的归一化坐标（地标；庄园 → 它在上层的替身地标）；不在当前图返回 null
  function xy(r) {
    if (!r || typeof REG === 'undefined' || !REG || !cur) return null;
    let map = r.map, mk = r.marker;
    if (REG.maps[map]?.kind === 'estate') { const s = estateStandIn(map); if (!s) return null; map = s.map; mk = s.marker; }
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
    const open = () => showCard(null, lab, 'inf', '', '', t.via || '');
    if (a && b) { const { mid } = arc(a, b, { cls: 'transit' }); pin(mid, '<i></i>', 'you', lab, open);
      if (fitFor !== v && !(typeof userMoved !== 'undefined' && userMoved)) { fitFor = v; const pad = Math.hypot(b.x - a.x, b.y - a.y) * .3 + .01;   // 第一次看到这段途中：把两端都框进视野
        setTimeout(() => viewer.viewport.fitBounds(new OpenSeadragon.Rect(Math.min(a.x, b.x) - pad, Math.min(a.y, b.y) - pad, Math.abs(b.x - a.x) + 2 * pad, Math.abs(b.y - a.y) + 2 * pad)), 300); } }
    else if (a || b) pin(a || b, `<i></i><b>${esc(a ? T('tr.to', '前往 {b}', { b: short(t.toText) }) : T('tr.from', '从 {a} 来', { a: short(t.fromText) }))}</b>`, 'you edge', lab, open);
  }
  function render() {
    clear();
    if (typeof viewer === 'undefined' || !viewer || !cur || !viewer.world.getItemCount() || REG.maps[cur]?.kind !== 'points') return;
    renderTransit();
  }
  const css = `
  svg.trip{overflow:visible;pointer-events:none;z-index:1}
  svg.trip path{fill:none;stroke:var(--alert);stroke-width:2.5;stroke-linecap:round;filter:drop-shadow(0 0 2px rgba(0,0,0,.6))}
  .tripin{position:relative;width:0;height:0;overflow:visible;z-index:3}
  .tripin i{position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;background:var(--alert);border:2px solid #fff;box-sizing:border-box;box-shadow:0 0 0 4px color-mix(in srgb,var(--alert) 30%,transparent)}
  .tripin.you{cursor:pointer;pointer-events:auto}
  .tripin.you::before{content:'';position:absolute;left:-22px;top:-22px;width:44px;height:44px}
  .tripin b{position:absolute;left:12px;top:-10px;white-space:nowrap;font:600 var(--fs-micro,11px)/1.3 var(--font-ui,sans-serif);color:var(--map-label-ink,#fff);background:var(--map-label-bg,rgba(8,10,14,.8));padding:2px 7px;border-radius:var(--r-pill,999px)}
  @media (prefers-reduced-motion:no-preference){.tripin.you i{animation:trpulse 2s ease-in-out infinite}}
  @keyframes trpulse{50%{box-shadow:0 0 0 8px color-mix(in srgb,var(--alert) 12%,transparent)}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  return { render, xy, arc, pin, clear };
})();
