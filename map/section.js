// 天城纵剖面插图。内部坐标 640×1078，由调用方用嵌套 <svg viewBox> 缩放。
// 所有带出处的元素都通过 tip() 挂上 data-src，装饰元素不接收鼠标事件。

export const SEC_W = 830, SEC_H = 1078;

export function drawSection(root, el, tip, D) {
  const R = mulberry32(2088);
  const X0 = 60, X1 = 630, PW = X1 - X0;
  const Y = h => 50 + (1500 - h) * 1010 / 1700;
  const item = key => D.SECTION.items.find(i => i.name.includes(key));
  const band = from => D.SECTION.bands.find(b => b.from === from);
  const deco = parent => el('g', { 'pointer-events': 'none' }, parent);

  // ---------- defs ----------
  const defs = el('defs', {}, root);
  defs.innerHTML = `
    <linearGradient id="s-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb2de"/><stop offset=".55" stop-color="#cfe3f1"/><stop offset="1" stop-color="#f6e7c8"/></linearGradient>
    <linearGradient id="s-mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4270"/><stop offset=".5" stop-color="#262040"/><stop offset="1" stop-color="#120f1d"/></linearGradient>
    <linearGradient id="s-low" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e2620"/><stop offset="1" stop-color="#0b0907"/></linearGradient>
    <linearGradient id="s-rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a7a68"/><stop offset=".5" stop-color="#6a5c50"/><stop offset="1" stop-color="#3e3833"/></linearGradient>
    <linearGradient id="s-rock-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a38b66"/><stop offset=".5" stop-color="#7c6a52"/><stop offset="1" stop-color="#4a4036"/></linearGradient>
    <linearGradient id="s-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ff0ff" stop-opacity=".75"/><stop offset="1" stop-color="#8ff0ff" stop-opacity="0"/></linearGradient>
    <linearGradient id="s-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9fd3ea"/><stop offset=".5" stop-color="#dff4fb"/><stop offset="1" stop-color="#6fa7c4"/></linearGradient>
    <linearGradient id="s-shadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="s-smoke" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#6b625a" stop-opacity=".7"/><stop offset="1" stop-color="#6b625a" stop-opacity="0"/></linearGradient>
    <radialGradient id="s-dome" cx=".5" cy="1" r="1"><stop offset=".55" stop-color="#bfefff" stop-opacity=".04"/><stop offset=".95" stop-color="#9fe3ff" stop-opacity=".28"/><stop offset="1" stop-color="#e6fbff" stop-opacity=".5"/></radialGradient>
    <radialGradient id="s-sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbe6"/><stop offset=".4" stop-color="#fff0b8" stop-opacity=".9"/><stop offset="1" stop-color="#fff0b8" stop-opacity="0"/></radialGradient>
    <filter id="s-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="s-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="s-plot"><rect x="${X0}" y="${Y(1500)}" width="${PW}" height="${Y(-200) - Y(1500)}"/></clipPath>`;

  // 外框
  el('rect', { x: 0, y: 0, width: SEC_W, height: SEC_H, rx: 8, fill: '#faf6ec', stroke: '#9c9484' }, root);
  el('text', { x: 14, y: 30, 'font-size': 19, 'font-weight': 800, fill: '#2b2a28', stroke: 'none' }, root, '天城纵剖面');
  el('text', { x: 134, y: 30, 'font-size': 12, fill: '#6f6b63', stroke: 'none' }, root, '垂直城市 · 阶级即高度');

  const plot = el('g', { 'clip-path': 'url(#s-plot)' }, root);
  // 三层底色（悬停显示各层出处）
  for (const [from, fill] of [[800, 's-sky'], [50, 's-mid'], [-200, 's-low']]) {
    const b = band(from); const r = el('rect', { x: X0, y: Y(b.to), width: PW, height: Y(b.from) - Y(b.to), fill: `url(#${fill})` }, plot); tip(r, b); }

  // ============ 上层 · 悬浮庄园区 ============
  const up = deco(plot);
  el('circle', { cx: 575, cy: 92, r: 60, fill: 'url(#s-sun)' }, up);
  el('circle', { cx: 575, cy: 92, r: 16, fill: '#fffbe9' }, up);
  // 远处的小岛剪影：暗示「数十座」
  for (let k = 0; k < 22; k++) { const x = X0 + 15 + R() * (PW - 30), y = Y(900 + R() * 560), s = 7 + R() * 9;
    el('path', { d: `M${x - s},${y} Q${x},${y + s * 1.6} ${x + s},${y} Z`, fill: '#8ea7bd', opacity: .45 }, up);
    el('ellipse', { cx: x, cy: y, rx: s, ry: s * .25, fill: '#a9c4b6', opacity: .5 }, up); }
  // 高空薄云
  for (const [x, y, s] of [[140, 90, 1], [420, 70, .8], [300, 150, .7]]) cloud(up, x, y, s, .55);

  // 其他庄园（风格各异）
  const isles = [
    { cx: 125, h: 1400, w: 70, st: 'glass' }, { cx: 175, h: 1250, w: 84, st: 'gothic' },
    { cx: 110, h: 1100, w: 64, st: 'villa' }, { cx: 590, h: 1420, w: 64, st: 'dome' },
    { cx: 592, h: 1300, w: 60, st: 'neo' }, { cx: 590, h: 1010, w: 70, st: 'villa' },
    { cx: 480, h: 950, w: 58, st: 'glass' }, { cx: 265, h: 990, w: 56, st: 'dome' },
  ];
  const others = el('g', {}, plot);
  for (const s of isles) { const g = el('g', {}, others); tip(g, { name: '悬浮庄园', tag: 'set', src: '天城·上层：每座岛屿为一座私人庄园，占地从数千到数万平方米不等；各庄园自带结界系统，隐私绝对保障；由以太驱动引擎维持悬浮' });
    island(g, s.cx, Y(s.h), s.w, s.st); }

  // 私人悬浮载具航线
  const routes = deco(plot);
  const hops = [[[125, Y(1400)], [175, Y(1250)]], [[175, Y(1250)], [370, Y(1170)]], [[370, Y(1170)], [592, Y(1300)]], [[110, Y(1100)], [265, Y(990)]], [[370, Y(1170)], [480, Y(950)]], [[592, Y(1300)], [590, Y(1420)]], [[480, Y(950)], [590, Y(1010)]]];
  for (const [a, b] of hops) { const mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - 30;
    el('path', { d: `M${a[0]},${a[1] - 6} Q${mx},${my} ${b[0]},${b[1] - 6}`, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.2, 'stroke-dasharray': '2 4', opacity: .85 }, routes);
    const t = .55, x = (1 - t) ** 2 * a[0] + 2 * t * (1 - t) * mx + t * t * b[0], y = (1 - t) ** 2 * (a[1] - 6) + 2 * t * (1 - t) * my + t * t * (b[1] - 6);
    car(routes, x, y, b[0] > a[0] ? 1 : -1); }
  { const g = el('g', {}, plot); tip(g, { name: '私人悬浮载具', tag: 'set', src: '天城·上层：岛屿间由私人悬浮载具通行，无公共交通（货币与贸易：私人悬浮载具 500万–3000万Æ）' });
    label(g, 470, Y(870), '私人悬浮载具航线 · 无公共交通', 'dark', 11); }

  // 骑士团空域巡防：环形巡逻线 + 骑士飞行器
  { const g = el('g', {}, plot); tip(g, { name: '议会骑士团空域巡防', tag: 'set', src: '军事与治安：议会直属骑士团负责上层悬浮区空域巡防，配备悬浮机动装置（短距离飞行/高速移动）' });
    el('ellipse', { cx: 345, cy: 250, rx: 280, ry: 172, fill: 'none', stroke: '#e0a800', 'stroke-width': 1.2, 'stroke-dasharray': '8 6', opacity: .75, 'pointer-events': 'stroke' }, g);
    for (const a of [.3, 2.2, 3.9, 5.3]) knight(g, 345 + Math.cos(a) * 280, 250 + Math.sin(a) * 172, Math.cos(a + 1.57) > 0 ? 1 : -1);
    label(g, 345, 72, '议会骑士团 · 空域巡防（悬浮机动装置）', 'gold', 11, 'middle'); }

  // 伊甸庄园（按「庄园布局」画细节）
  eden(el('g', {}, plot), 370, Y(1170), el('g', {}, root));

  // 云海：上层与中层之间
  for (let k = 0; k < 9; k++) cloud(up, X0 + 20 + k * 68 + R() * 20, Y(830) + R() * 16, .9 + R() * .5, .8);
  // 银冠堡
  silverCrown(el('g', {}, plot), 190, Y(800));
  // 以太气候调节塔
  climateTower(el('g', {}, plot), 80);

  // ============ 中层 · 钢铁霓虹区 ============
  const mid = deco(plot);
  // 上层岛屿投下的阴影（中层日照被遮挡）
  for (const x of [150, 300, 420, 560]) el('path', { d: `M${x - 30},${Y(800)} L${x + 30},${Y(800)} L${x + 60},${Y(560)} L${x - 60},${Y(560)} Z`, fill: 'url(#s-shadow)' }, mid);
  // 远景楼群
  for (let k = 0; k < 34; k++) { const w = 14 + R() * 22, x = X0 + R() * (PW - w), top = 220 + R() * 560;
    el('rect', { x, y: Y(top), width: w, height: Y(50) - Y(top), fill: '#3b3460', opacity: .75 }, mid); }
  // 近景楼群：窗带霓虹随高度递减（治安随高度递减）
  const towers = [];
  for (let k = 0; k < 24; k++) { const w = 18 + R() * 24, x = X0 + k * (PW / 24) + R() * 6 - 3, top = 120 + R() * 560; towers.push({ x, w, top });
    el('rect', { x, y: Y(top), width: w, height: Y(50) - Y(top) + 1, fill: k % 2 ? '#211c34' : '#2a2442', stroke: '#141020', 'stroke-width': .6 }, mid);
    for (let h = 70; h < top - 12; h += 14) for (let c = 3; c < w - 3; c += 5) {
      const p = h / 800; if (R() > .15 + p * .55) continue;
      el('rect', { x: x + c, y: Y(h), width: 2.4, height: 3, fill: R() < p ? ['#ff4fb0', '#3ee6ff', '#ffd23f'][Math.floor(R() * 3)] : '#8a7d5a', opacity: .5 + p * .4 }, mid); } }
  // 空中连廊
  for (let k = 0; k < 14; k++) { const a = towers[Math.floor(R() * 23)], b = towers[towers.indexOf(a) + 1], h = 120 + R() * Math.min(a.top, b.top, 600);
    if (h > Math.min(a.top, b.top) - 10) continue; el('rect', { x: a.x + a.w, y: Y(h), width: b.x - a.x - a.w, height: 3, fill: '#5a5280' }, mid); }
  // 全息广告牌
  for (let k = 0; k < 10; k++) { const t = towers[Math.floor(R() * 24)], h = 250 + R() * Math.max(0, t.top - 300); if (h > t.top - 30) continue;
    const col = ['#ff4fb0', '#3ee6ff', '#b36bff', '#ffd23f'][k % 4];
    el('rect', { x: t.x - 6, y: Y(h), width: t.w + 12, height: 16, fill: col, opacity: .22, filter: 'url(#s-glow)' }, mid);
    el('rect', { x: t.x - 6, y: Y(h), width: t.w + 12, height: 16, fill: 'none', stroke: col, 'stroke-width': 1.2, opacity: .9 }, mid);
    for (let l = 0; l < 3; l++) el('rect', { x: t.x - 2, y: Y(h) + 3 + l * 4, width: (t.w + 4) * (.4 + R() * .6), height: 1.5, fill: col, opacity: .9 }, mid); }
  // 悬浮轨道与列车
  { const g = el('g', {}, plot); tip(g, { name: '悬浮轨道系统', tag: 'set', src: '天城·中层：层层叠叠的立体建筑群，由悬浮轨道系统串联；悬浮轨道是主要公共交通工具，四通八达' });
    for (const [h, tx] of [[150, 380], [300, 150], [460, 460]]) {
      el('rect', { x: X0, y: Y(h), width: PW, height: 3, fill: '#1b3b4a' }, g);
      el('line', { x1: X0, y1: Y(h), x2: X1, y2: Y(h), stroke: '#3ee6ff', 'stroke-width': 1, opacity: .8, filter: 'url(#s-glow)' }, g);
      for (let c = 0; c < 4; c++) el('rect', { x: tx + c * 17, y: Y(h) - 8, width: 15, height: 7, rx: 3, fill: '#e8eef2', stroke: '#3ee6ff', 'stroke-width': .8 }, g); }
    label(g, X0 + 30, Y(300) + 14, '悬浮轨道', 'cyan', 10); }

  // 中层地标
  government(el('g', {}, plot), 330, item('议会'));
  cathedral(el('g', {}, plot), 150, item('辉光'));
  convent(el('g', {}, plot), 520, item('圣铁'));
  police(el('g', {}, plot), 300, item('执法局'));
  barracks(el('g', {}, plot), 560, item('环城'));
  apartment(el('g', {}, plot), 210, item('旧公寓'));
  // 18 辖区刻度 + 12 教区
  { const g = el('g', {}, plot); tip(g, D.SECTION.districts);
    for (let k = 0; k <= 18; k++) { const h = 50 + k * (750 / 18); el('line', { x1: X1 - 9, y1: Y(h), x2: X1, y2: Y(h), stroke: '#c9bff0', 'stroke-width': 1 }, g);
      if (k < 18 && k % 3 === 0) el('text', { x: X1 - 12, y: Y(h + 750 / 36) + 3, 'text-anchor': 'end', 'font-size': 8, fill: '#c9bff0', stroke: '#141020', 'stroke-width': 2 }, g, `${18 - k}区`); }
    const t = label(g, X1 - 16, Y(420), '执法局 18 辖区（按中层纵向高度）', 'lilac', 10, 'middle'); t.setAttribute('transform', `rotate(-90 ${X1 - 16} ${Y(420)})`); }
  { const g = el('g', {}, plot); tip(g, { name: '12 个教区', tag: 'set', src: '圣光教会：天城中层按区域划为十二个教区，每区设一座主教堂和若干礼拜堂；上层无教区，教会进不去悬浮岛' });
    label(g, X0 + 6, Y(470), '中层 12 教区 · 上层无教区', 'lilac', 10); }

  // ============ 管控线 ============
  for (const l of D.SECTION.lines) { const g = el('g', {}, plot); tip(g, l); const y = Y(l.at);
    el('line', { x1: X0, y1: y, x2: X1, y2: y, stroke: '#ffcf33', 'stroke-width': 2.2, 'stroke-dasharray': '7 4' }, g);
    el('line', { x1: X0, y1: y, x2: X1, y2: y, stroke: '#ffcf33', 'stroke-width': 6, opacity: .15 }, g);
    for (const gx of [470, 550]) { el('rect', { x: gx - 5, y: y - 18, width: 10, height: 22, fill: '#39334f', stroke: '#ffcf33', 'stroke-width': 1 }, g);
      el('circle', { cx: gx, cy: y - 20, r: 2.5, fill: '#ff5a5a', filter: 'url(#s-glow)' }, g); }
    el('rect', { x: 475, y: y - 5, width: 70, height: 6, fill: '#ffcf33', opacity: .5 }, g);
    label(g, X1 - 6, y + 15, l.name, 'gold', 10, 'end'); }

  // ============ 下层 · 地基区 ============
  const low = deco(plot);
  el('rect', { x: X0, y: Y(0), width: PW, height: 3, fill: '#8a7a5a' }, low);
  for (let k = 0; k < 7; k++) { const y = Y(-60 - k * 20); el('path', { d: `M${X0},${y} Q${X0 + PW / 2},${y + (R() - .5) * 10} ${X1},${y}`, stroke: '#3b3129', 'stroke-width': 1, fill: 'none', opacity: .6 }, low); }
  for (const h of [-120, -180]) { el('rect', { x: X0, y: Y(h) - 3, width: PW, height: 6, fill: '#4a3d31' }, low);
    for (let x = X0 + 10; x < X1; x += 40) el('rect', { x, y: Y(h) - 5, width: 4, height: 10, fill: '#6b5a44' }, low); }
  factories(el('g', {}, plot), item('工厂'));
  committee(el('g', {}, plot), 440, item('委员会'));
  blackMarket(el('g', {}, plot), 250, item('黑市'));
  outpost(el('g', {}, plot), 590, item('哨所'));
  ruinedChurches(el('g', {}, plot));

  // ---------- 层名 + 高度刻度 ----------
  for (const b of D.SECTION.bands) { const dark = b.from < 800;
    el('text', { x: X0 + 8, y: Y(b.to) + 20, 'font-size': 15, 'font-weight': 800, fill: dark ? '#f2eefc' : '#1f3550', stroke: dark ? '#141020' : '#eef6fb', 'stroke-width': 4, 'pointer-events': 'none' }, root, b.name); }
  for (const h of [-200, 0, 50, 200, 400, 600, 800, 1000, 1200, 1500]) {
    el('line', { x1: X0 - 6, y1: Y(h), x2: X0, y2: Y(h), stroke: '#555' }, root);
    el('text', { x: X0 - 9, y: Y(h) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#555', stroke: 'none' }, root, h + 'm'); }

  // =================================================================
  // 绘制函数
  // =================================================================
  function label(g, x, y, text, tone, size = 11, anchor = 'start') {
    const T = { dark: ['#1f3550', '#eef6fb'], gold: ['#7a5200', '#fff7de'], cyan: ['#8ff0ff', '#0d1a24'], lilac: ['#d8d0f5', '#141020'],
      white: ['#ffffff', '#141020'], inf: ['#ffb347', '#141020'], infDark: ['#9a5200', '#fff7de'], eden: ['#6b4200', '#fff7de'], red: ['#ff9a8a', '#140a08'] }[tone];
    return el('text', { x, y, 'text-anchor': anchor, 'font-size': size, 'font-weight': 600, fill: T[0], stroke: T[1], 'stroke-width': 3.5, 'paint-order': 'stroke' }, g, text); }
  function callout(g, x1, y1, x2, y2, text, tone = 'dark', size = 10.5) {
    el('path', { d: `M${x1},${y1} L${x2},${y2}`, stroke: tone === 'infDark' ? '#9a5200' : '#3a4a5a', 'stroke-width': .8, fill: 'none' }, g);
    el('circle', { cx: x1, cy: y1, r: 1.8, fill: tone === 'infDark' ? '#9a5200' : '#3a4a5a' }, g);
    label(g, x2 + (x2 >= x1 ? 3 : -3), y2 + 3.5, text, tone, size, x2 >= x1 ? 'start' : 'end'); }
  function cloud(g, x, y, s, op) { for (const [dx, dy, r] of [[0, 0, 22], [-20, 5, 15], [20, 4, 17], [-36, 9, 10], [36, 9, 11]])
    el('ellipse', { cx: x + dx * s, cy: y + dy * s, rx: r * s * 1.3, ry: r * s * .55, fill: '#ffffff', opacity: op }, g); }
  function car(g, x, y, dir) {
    el('path', { d: `M${x - 22 * dir},${y + 1} L${x - 6 * dir},${y + 1}`, stroke: '#ffffff', 'stroke-width': 2.2, opacity: .45, 'stroke-linecap': 'round' }, g);
    el('path', { d: `M${x - 6},${y + 2} Q${x - 6},${y - 3} ${x},${y - 3} Q${x + 7},${y - 3} ${x + 8 * dir},${y + 1} L${x + 7},${y + 3} L${x - 6},${y + 3} Z`, fill: '#2b3040', stroke: '#e8eef2', 'stroke-width': .6 }, g);
    el('circle', { cx: x + 7 * dir, cy: y + 1, r: 1.2, fill: '#fff6c8', filter: 'url(#s-glow)' }, g);
    el('ellipse', { cx: x, cy: y + 5, rx: 6, ry: 1.3, fill: '#8ff0ff', opacity: .7 }, g); }
  function knight(g, x, y, dir) {
    el('path', { d: `M${x - 9},${y - 2} L${x},${y - 7} L${x + 9},${y - 2} L${x},${y + 1} Z`, fill: '#d7dde3', stroke: '#4a5560', 'stroke-width': .7 }, g);
    el('rect', { x: x - 2, y: y - 6, width: 4, height: 8, rx: 1.5, fill: '#5a6570' }, g);
    el('path', { d: `M${x - 3 * dir},${y + 2} l${-14 * dir},4`, stroke: '#ffe07a', 'stroke-width': 1.5, opacity: .7 }, g); }

  // 通用悬浮岛
  function island(g, cx, cy, w, st, o = {}) {
    const rx = w / 2, ry = w * .17, depth = w * (o.depth || .72), r = mulberry32(Math.round(cx * 7 + cy));
    const L = [], Rr = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8, half = rx * Math.pow(1 - t, 1.25), y = cy + 2 + depth * t;
      L.push([cx - half - r() * 5 + 2, y]); Rr.push([cx + half + r() * 5 - 2, y]); }
    const tip0 = [cx + (r() - .5) * 8, cy + depth + 6];
    el('path', { d: 'M' + [...L, tip0, ...Rr.reverse()].map(p => p.join(',')).join(' L') + ' Z', fill: o.gold ? 'url(#s-rock-gold)' : 'url(#s-rock)', stroke: '#3a332c', 'stroke-width': .6 }, g);
    Rr.reverse();
    for (const t of [2, 4, 6]) el('path', { d: `M${L[t][0] + 2},${L[t][1]} Q${cx},${L[t][1] + 5 + r() * 4} ${Rr[t][0] - 2},${Rr[t][1]}`, stroke: '#2e2823', 'stroke-width': .8, fill: 'none', opacity: .45 }, g);
    for (let k = 0; k < Math.round(w / 18); k++) { const x = cx - rx * .8 + r() * rx * 1.6, len = 6 + r() * w * .18;
      el('path', { d: `M${x},${cy + 3} q${(r() - .5) * 6},${len / 2} ${(r() - .5) * 4},${len}`, stroke: '#5f7b4a', 'stroke-width': .9, fill: 'none', opacity: .8 }, g); }
    for (let k = 0; k < 2; k++) { const x = cx + (r() - .5) * w * .5, y = cy + depth + 14 + r() * 16, s = 2 + r() * 3;
      el('path', { d: `M${x - s},${y} L${x + s},${y} L${x},${y + s * 1.8} Z`, fill: '#5e544a' }, g); }
    // 以太驱动引擎
    el('path', { d: `M${tip0[0] - w * .06},${tip0[1]} L${tip0[0] + w * .06},${tip0[1]} L${tip0[0] + w * .16},${tip0[1] + w * .55} L${tip0[0] - w * .16},${tip0[1] + w * .55} Z`, fill: 'url(#s-beam)', opacity: .8 }, g);
    el('circle', { cx: tip0[0], cy: tip0[1] - 2, r: Math.max(2.5, w * .045), fill: '#d8fbff', stroke: '#3ee6ff', 'stroke-width': 1.2, filter: 'url(#s-glow)' }, g);
    // 地表
    el('ellipse', { cx, cy: cy + 3, rx, ry, fill: '#6b5a44' }, g);
    el('ellipse', { cx, cy, rx, ry, fill: '#9cc28a', stroke: '#5f7b4a', 'stroke-width': .8 }, g);
    for (let k = 0; k < Math.round(w / 9); k++) { const a = r() * Math.PI, x = cx + Math.cos(a) * rx * .85, y = cy - Math.sin(a) * ry * .75;
      el('circle', { cx: x, cy: y - 2, r: 2 + r() * 2, fill: r() < .5 ? '#5f8a52' : '#4e7644' }, g); }
    if (st) building(g, cx, cy + 2, w, st);
    // 结界穹顶
    const dh = o.domeH || w * .62;
    el('path', { d: `M${cx - rx - 3},${cy + 1} A${rx + 3},${dh} 0 0 1 ${cx + rx + 3},${cy + 1} Z`, fill: 'url(#s-dome)', stroke: '#bff4ff', 'stroke-width': .8, 'stroke-dasharray': '3 2', opacity: .9 }, g);
    return { tip: tip0, rx, ry, depth };
  }
  function building(g, cx, by, w, st) {
    const s = w / 90;
    if (st === 'glass') { el('rect', { x: cx - 8 * s, y: by - 52 * s, width: 16 * s, height: 52 * s, fill: 'url(#s-glass)', stroke: '#4a7a92', 'stroke-width': .6 }, g);
      el('rect', { x: cx + 8 * s, y: by - 30 * s, width: 12 * s, height: 30 * s, fill: '#7fb6cf', stroke: '#4a7a92', 'stroke-width': .6 }, g);
      for (let k = 1; k < 9; k++) el('line', { x1: cx - 8 * s, y1: by - k * 6 * s, x2: cx + 8 * s, y2: by - k * 6 * s, stroke: '#ffffff', 'stroke-width': .5, opacity: .7 }, g);
      el('circle', { cx, cy: by - 54 * s, r: 1.6, fill: '#ff4f4f', filter: 'url(#s-glow)' }, g); }
    else if (st === 'gothic') { for (const [dx, h] of [[-14, 30], [0, 46], [14, 30]]) { const x = cx + dx * s;
        el('rect', { x: x - 5 * s, y: by - h * s, width: 10 * s, height: h * s, fill: '#6c6478', stroke: '#3a3346', 'stroke-width': .6 }, g);
        el('path', { d: `M${x - 6 * s},${by - h * s} L${x},${by - (h + 20) * s} L${x + 6 * s},${by - h * s} Z`, fill: '#3a3346' }, g);
        el('rect', { x: x - 1.5 * s, y: by - (h - 8) * s, width: 3 * s, height: 7 * s, fill: '#ffd27a', opacity: .9 }, g); } }
    else if (st === 'dome') { el('rect', { x: cx - 16 * s, y: by - 18 * s, width: 32 * s, height: 18 * s, fill: '#f4efe2', stroke: '#8a826f', 'stroke-width': .6 }, g);
      el('path', { d: `M${cx - 11 * s},${by - 18 * s} A${11 * s},${12 * s} 0 0 1 ${cx + 11 * s},${by - 18 * s} Z`, fill: '#e3b94f', stroke: '#8a6a10', 'stroke-width': .6 }, g);
      el('line', { x1: cx, y1: by - 30 * s, x2: cx, y2: by - 36 * s, stroke: '#8a6a10', 'stroke-width': 1 }, g);
      for (let k = -3; k <= 3; k++) el('rect', { x: cx + k * 4 * s - .8 * s, y: by - 14 * s, width: 1.6 * s, height: 13 * s, fill: '#c9c0aa' }, g); }
    else if (st === 'villa') { el('rect', { x: cx - 26 * s, y: by - 12 * s, width: 34 * s, height: 12 * s, fill: '#eceae4', stroke: '#6f6a60', 'stroke-width': .6 }, g);
      el('rect', { x: cx - 10 * s, y: by - 22 * s, width: 26 * s, height: 10 * s, fill: '#f6f5f1', stroke: '#6f6a60', 'stroke-width': .6 }, g);
      el('rect', { x: cx - 8 * s, y: by - 20 * s, width: 22 * s, height: 5 * s, fill: '#9fd3ea' }, g);
      el('ellipse', { cx: cx + 22 * s, cy: by - 1, rx: 9 * s, ry: 3 * s, fill: '#5fc3e8', stroke: '#fff', 'stroke-width': .6 }, g); }
    else { el('rect', { x: cx - 18 * s, y: by - 20 * s, width: 36 * s, height: 20 * s, fill: '#f6f3ea', stroke: '#8a826f', 'stroke-width': .6 }, g);
      el('path', { d: `M${cx - 20 * s},${by - 20 * s} L${cx},${by - 30 * s} L${cx + 20 * s},${by - 20 * s} Z`, fill: '#e2dccb', stroke: '#8a826f', 'stroke-width': .6 }, g);
      for (let k = -4; k <= 4; k++) el('rect', { x: cx + k * 4 * s - .7 * s, y: by - 17 * s, width: 1.4 * s, height: 16 * s, fill: '#cfc8b4' }, g); }
  }

  // 伊甸庄园
  function eden(g, cx, cy, keyG) {
    const src = item('伊甸');
    const w = 214, rx = w / 2, ry = 36, depth = 150;
    tip(g, { name: '伊甸庄园', tag: 'set', src: '庄园布局：天城上层悬浮区，独占一座悬浮岛屿；占地约12000平方米（含室外庭园）；地上三层+地下两层；新古典主义白色石材建筑，内部融合以太魔法与高科技；全域覆盖结界系统' });
    const isl = island(g, cx, cy, w, null, { depth: depth / w, gold: true, domeH: 150 });
    // 地下两层剖切
    const cut = el('g', {}, g);
    el('path', { d: `M${cx - 58},${cy + 14} h116 v58 h-116 Z`, fill: '#2a241e', stroke: '#e6c36a', 'stroke-width': 1 }, cut);
    el('rect', { x: cx - 54, y: cy + 18, width: 108, height: 24, fill: '#3a4250', stroke: '#6d7a8c', 'stroke-width': .6 }, cut);
    el('rect', { x: cx - 54, y: cy + 45, width: 108, height: 23, fill: '#3a3140', stroke: '#6d5a78', 'stroke-width': .6 }, cut);
    for (const x of [-20, 18]) { el('line', { x1: cx + x, y1: cy + 18, x2: cx + x, y2: cy + 42, stroke: '#6d7a8c', 'stroke-width': .6 }, cut); }
    for (const x of [-26, -2, 26]) { el('line', { x1: cx + x, y1: cy + 45, x2: cx + x, y2: cy + 68, stroke: '#6d5a78', 'stroke-width': .6 }, cut); }
    el('rect', { x: cx + 40, y: cy - 20, width: 5, height: 88, fill: '#e6c36a', opacity: .85 }, cut);              // 主人专用电梯（推断）
    el('text', { x: cx - 50, y: cy + 34, 'font-size': 9, fill: '#d8e2ee', stroke: 'none' }, cut, 'B1 训练区');
    el('text', { x: cx - 50, y: cy + 60, 'font-size': 9, fill: '#e2d4ee', stroke: 'none' }, cut, 'B2 受限区');
    el('rect', { x: cx + 6, y: cy + 51, width: 12, height: 12, fill: '#3ee6ff', opacity: .7, filter: 'url(#s-glow)' }, cut);   // 结界发生器（推断）
    // 后庭园：人工湖 + 凉亭 + 训练场（在建筑后方）
    el('ellipse', { cx: cx - 62, cy: cy - 18, rx: 24, ry: 7, fill: '#6fbfe0', stroke: '#e8f6fb', 'stroke-width': .8 }, g);
    { const px = cx + 58, py = cy - 20;
      el('rect', { x: px - 26, y: py - 4, width: 18, height: 8, fill: '#c9b98a', stroke: '#8a7a50', 'stroke-width': .5 }, g);      // 露天训练场
      for (const dx of [-6, 6]) el('rect', { x: px + dx - .8, y: py - 9, width: 1.6, height: 9, fill: '#f4efe2' }, g);
      el('path', { d: `M${px - 9},${py - 9} L${px},${py - 16} L${px + 9},${py - 9} Z`, fill: '#8a6a4a' }, g); }
    // 主体建筑：中央三层 + 两翼，柱廊与山花
    const by = cy + 6;
    for (const side of [-1, 1]) { const x0 = cx + side * 30 - (side < 0 ? 34 : 0);
      el('rect', { x: x0, y: by - 26, width: 34, height: 26, fill: '#f3efe4', stroke: '#8a826f', 'stroke-width': .7 }, g);
      el('rect', { x: x0, y: by - 29, width: 34, height: 3, fill: '#e2dccb', stroke: '#8a826f', 'stroke-width': .5 }, g);
      for (let r2 = 0; r2 < 2; r2++) for (let c = 0; c < 5; c++) el('rect', { x: x0 + 3 + c * 6.2, y: by - 22 + r2 * 10, width: 3, height: 6, fill: '#9fb3c4' }, g); }
    el('rect', { x: cx - 30, y: by - 40, width: 60, height: 40, fill: '#f8f5ec', stroke: '#8a826f', 'stroke-width': .8 }, g);
    for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c < 8; c++) el('rect', { x: cx - 27 + c * 7.3, y: by - 37 + r2 * 12, width: 3.4, height: 7, fill: r2 === 2 && c > 2 && c < 5 ? '#e6c36a' : '#9fb3c4' }, g);
    el('path', { d: `M${cx - 22},${by - 22} L${cx},${by - 34} L${cx + 22},${by - 22} Z`, fill: '#ebe5d4', stroke: '#8a826f', 'stroke-width': .7 }, g);
    el('rect', { x: cx - 22, y: by - 22, width: 44, height: 3, fill: '#e2dccb' }, g);
    for (let k = 0; k < 8; k++) el('rect', { x: cx - 20 + k * 5.6, y: by - 19, width: 2, height: 19, fill: '#fffdf6', stroke: '#b8b09a', 'stroke-width': .3 }, g);
    for (let k = 0; k < 15; k++) el('rect', { x: cx - 30 + k * 4.1, y: by - 44, width: 1.4, height: 4, fill: '#d8d0bc' }, g);  // 女儿墙栏杆
    // 前庭：中轴步道 + 喷泉
    el('path', { d: `M${cx - 5},${by} L${cx + 5},${by} L${cx + 9},${cy + ry - 2} L${cx - 9},${cy + ry - 2} Z`, fill: '#e6dcc4' }, g);
    el('ellipse', { cx, cy: cy + 22, rx: 11, ry: 4, fill: '#6fbfe0', stroke: '#f4efe2', 'stroke-width': 1.4 }, g);
    for (const a of [-1, 0, 1]) el('path', { d: `M${cx},${cy + 20} q${a * 4},-9 ${a * 8},-2`, stroke: '#e8f8ff', 'stroke-width': 1, fill: 'none' }, g);
    for (const s2 of [-1, 1]) for (let k = 0; k < 3; k++) el('rect', { x: cx + s2 * (18 + k * 12) - 4, y: cy + 17 + k * 3, width: 8, height: 4, rx: 2, fill: '#5f8a52' }, g);
    // 访客悬浮载具降落平台 + 警卫岗（推断）
    { const px = cx + rx + 12, py = cy + 8;
      el('path', { d: `M${cx + rx - 8},${py - 2} L${px + 26},${py - 2} L${px + 20},${py + 6} L${cx + rx - 8},${py + 6} Z`, fill: '#c9ccd2', stroke: '#6f7580', 'stroke-width': .6 }, g);
      el('ellipse', { cx: px + 8, cy: py + 1, rx: 12, ry: 2.4, fill: 'none', stroke: '#ffcf33', 'stroke-width': .8 }, g);
      car(g, px + 8, py - 4, -1);
      el('rect', { x: cx + rx - 14, y: py - 12, width: 8, height: 10, fill: '#e8e4d8', stroke: '#6f6a60', 'stroke-width': .5 }, g); }
    el('text', { x: cx + 6, y: cy - 116, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 900, fill: '#6b4200', stroke: '#fff7de', 'stroke-width': 4, 'paint-order': 'stroke', 'letter-spacing': 3 }, g, '伊甸庄园');
    // 编号标记 + 右侧图例栏
    const px = cx + rx + 12, py = cy + 8;
    const notes = [
      [cx, by - 50, '主体建筑', '新古典主义白色石材；中央三层 + 两翼，正面柱廊与山花', 'set'],
      [cx + 16, cy + 24, '前庭花园 · 喷泉', '约 200㎡：石板步道、修剪植被、喷泉（庄园地标）', 'set'],
      [cx - 62, cy - 28, '后庭园 · 人工湖', '约 300㎡：草坪、人工湖；上方另有结界穹顶', 'set'],
      [cx + 58, cy - 32, '凉亭 · 露天训练场', '后庭园内：主人户外休息的凉亭、晨间训练场', 'set'],
      [px + 22, py - 12, '访客悬浮载具降落平台', '前庭花园内的访客停靠平台（位置在岛缘为推断）', 'set'],
      [cx + rx - 10, py - 20, '警卫岗', '庄园驻防：中低阶人员 + 结界 + AI 监控；岗亭位置推断', 'inf'],
      [cx - rx + 22, cy - 92, '外层结界', '覆盖整座悬浮岛，隔绝一切外部探查与入侵', 'set'],
      [cx - 64, cy + 30, '剖切：地下两层', 'B1 训练区 / B2 受限区（图上用中性名称）', 'set'],
      [cx + 56, cy + 30, '主人专用电梯', '主人经专用通道可达任何房间；电梯井为推断', 'inf'],
      [cx + 24, cy + 57, '结界发生器', '以太驱动持续供能；放在 B2 为推断', 'inf'],
      [isl.tip[0] + 12, isl.tip[1] + 4, '以太驱动引擎', '天城·上层：悬浮岛由以太驱动引擎维持悬浮', 'set'],
      [cx - rx + 6, cy + 6, '岛缘林地', '12000㎡ 中约 1 万㎡ 设定未述，画作林地与步道', 'inf'],
    ];
    notes.forEach(([x, y], k) => { const b = el('g', {}, g);
      el('circle', { cx: x, cy: y, r: 7, fill: notes[k][4] === 'inf' ? '#fff1dc' : '#fffbef', stroke: notes[k][4] === 'inf' ? '#b06000' : '#8a6a10', 'stroke-width': 1.3 }, b);
      el('text', { x, y: y + 3.5, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, fill: notes[k][4] === 'inf' ? '#b06000' : '#6b4200', stroke: 'none' }, b, k + 1); });
    // 图例栏
    const kx = 646, kw = 172;
    el('rect', { x: kx, y: 50, width: kw, height: 1010, rx: 6, fill: '#fffbef', stroke: '#d8c9a0' }, keyG);
    el('text', { x: kx + 12, y: 78, 'font-size': 19, 'font-weight': 900, fill: '#6b4200', 'letter-spacing': 3, stroke: 'none' }, keyG, '伊甸庄园');
    const meta = ['天城上层 · 独占一座悬浮岛', '约 12000㎡（含室外庭园）', '地上三层 + 地下两层', '新古典白石 · 以太魔法与高科技', '全域结界 · 以太气候系统'];
    meta.forEach((t, k) => el('text', { x: kx + 12, y: 100 + k * 17, 'font-size': 11, fill: '#5a4a2a', stroke: 'none' }, keyG, t));
    el('line', { x1: kx + 10, y1: 190, x2: kx + kw - 10, y2: 190, stroke: '#d8c9a0' }, keyG);
    let yy = 212;
    notes.forEach(([, , name, desc, tag], k) => { const row = el('g', {}, keyG);
      tip(row, { name, tag, src: desc });
      el('circle', { cx: kx + 18, cy: yy - 4, r: 7, fill: tag === 'inf' ? '#fff1dc' : '#fffbef', stroke: tag === 'inf' ? '#b06000' : '#8a6a10', 'stroke-width': 1.3 }, row);
      el('text', { x: kx + 18, y: yy - .5, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, fill: tag === 'inf' ? '#b06000' : '#6b4200', stroke: 'none' }, row, k + 1);
      el('text', { x: kx + 32, y: yy, 'font-size': 12, 'font-weight': 700, fill: tag === 'inf' ? '#9a5200' : '#3a2a10', stroke: 'none' }, row, name + (tag === 'inf' ? '（推断）' : ''));
      const lines = wrap(desc, 12); lines.forEach((ln, m) => el('text', { x: kx + 32, y: yy + 16 + m * 14, 'font-size': 10, fill: '#6f6450', stroke: 'none' }, row, ln));
      yy += 26 + lines.length * 14; });
    el('text', { x: kx + 12, y: 1046, 'font-size': 10, fill: '#8a7a5a', stroke: 'none' }, keyG, '棕框 = 设定原文　橙框 = 推断');
  }
  function wrap(t, n) { const out = []; for (let i = 0; i < t.length; i += n) out.push(t.slice(i, i + n));
    if (out.length > 1 && out[out.length - 1].length <= 2) out[out.length - 2] += out.pop(); return out; }

  function silverCrown(g, cx, y) {
    tip(g, item('银冠堡'));
    el('path', { d: `M${cx - 78},${y - 4} L${cx + 78},${y - 4} L${cx + 50},${y + 26} L${cx + 12},${y + 44} L${cx - 20},${y + 40} L${cx - 56},${y + 24} Z`, fill: 'url(#s-rock)', stroke: '#3a332c', 'stroke-width': .7 }, g);
    for (const dx of [-30, 30]) { el('path', { d: `M${cx + dx - 6},${y + 26} L${cx + dx + 6},${y + 26} L${cx + dx + 14},${y + 60} L${cx + dx - 14},${y + 60} Z`, fill: 'url(#s-beam)' }, g);
      el('circle', { cx: cx + dx, cy: y + 26, r: 3.5, fill: '#d8fbff', stroke: '#3ee6ff', filter: 'url(#s-glow)' }, g); }
    el('rect', { x: cx - 70, y: y - 22, width: 140, height: 18, fill: '#b9c1ca', stroke: '#5a6570', 'stroke-width': .8 }, g);
    for (let k = 0; k < 18; k++) el('rect', { x: cx - 70 + k * 8, y: y - 26, width: 5, height: 4, fill: '#b9c1ca', stroke: '#5a6570', 'stroke-width': .5 }, g);
    for (const [dx, h] of [[-62, 40], [-24, 58], [24, 58], [62, 40], [0, 74]]) { const x = cx + dx;
      el('rect', { x: x - 8, y: y - 22 - h + 18, width: 16, height: h - 18 + 4, fill: '#d2d9e0', stroke: '#5a6570', 'stroke-width': .7 }, g);
      el('path', { d: `M${x - 10},${y - 22 - h + 18} L${x},${y - 22 - h + 2} L${x + 10},${y - 22 - h + 18} Z`, fill: '#e4e9ee', stroke: '#5a6570', 'stroke-width': .7 }, g);
      el('rect', { x: x - 2, y: y - h + 4, width: 4, height: 6, fill: '#ffe07a' }, g); }
    el('line', { x1: cx, y1: y - 74 - 6, x2: cx, y2: y - 100, stroke: '#5a6570', 'stroke-width': 1 }, g);
    el('path', { d: `M${cx},${y - 100} l14,4 l-14,4 Z`, fill: '#c8a032' }, g);
    el('rect', { x: cx - 16, y: y - 16, width: 32, height: 12, rx: 6, fill: '#1b2a36' }, g);
    el('rect', { x: cx - 14, y: y - 14, width: 28, height: 8, rx: 4, fill: '#ffd86b', opacity: .5, filter: 'url(#s-glow)' }, g);
    label(g, cx + 84, y - 16, '银冠堡 · 议会骑士团总部', 'dark', 12);
    el('text', { x: cx + 84, y: y - 3, 'text-anchor': 'start', 'font-size': 9.5, fill: '#1f3550', stroke: '#eef6fb', 'stroke-width': 3, 'paint-order': 'stroke' }, g, '上层与中层交界的悬浮要塞');
  }
  function climateTower(g, x) {
    tip(g, D.SECTION.towers);
    el('rect', { x: x - 4, y: Y(880), width: 8, height: Y(0) - Y(880), fill: '#5fb9cc' }, g);
    el('rect', { x: x - 1, y: Y(880), width: 2, height: Y(0) - Y(880), fill: '#d6f7ff', opacity: .6 }, g);
    for (let h = 100; h < 880; h += 110) el('ellipse', { cx: x, cy: Y(h), rx: 9, ry: 3, fill: '#3e8fa3', stroke: '#bff4ff', 'stroke-width': .6 }, g);
    el('circle', { cx: x, cy: Y(890), r: 26, fill: '#bff4ff', opacity: .25, filter: 'url(#s-soft)' }, g);
    el('circle', { cx: x, cy: Y(890), r: 6, fill: '#e8fdff', stroke: '#3ee6ff', 'stroke-width': 1.2, filter: 'url(#s-glow)' }, g);
    label(g, x - 12, Y(918), '以太气候调节塔（推断）', 'infDark', 10); }

  function government(g, cx, it) { tip(g, it); const base = Y(560);
    for (const [dx, h, w] of [[-26, 640, 20], [26, 630, 20], [0, 700, 26]]) { const x = cx + dx;
      el('rect', { x: x - w / 2, y: Y(h), width: w, height: base - Y(h), fill: '#3a3252', stroke: '#c8a032', 'stroke-width': .8 }, g);
      for (let hh = h - 12; hh > 570 && hh > 0; hh -= 12) el('rect', { x: x - w / 2 + 3, y: Y(hh), width: w - 6, height: 2, fill: '#e6c36a', opacity: .55 }, g); }
    el('path', { d: `M${cx - 13},${Y(700)} L${cx},${Y(700) - 14} L${cx + 13},${Y(700)} Z`, fill: '#c8a032' }, g);
    label(g, cx, Y(700) - 18, '议会 / 执政厅 / 储备署（推断）', 'inf', 10.5, 'middle'); }
  function cathedral(g, cx, it) { tip(g, it); const y = Y(it.at);
    el('rect', { x: cx - 34, y: y + 6, width: 68, height: 8, fill: '#4a4462' }, g);
    el('rect', { x: cx - 26, y: y - 22, width: 52, height: 28, fill: '#d9d2e6', stroke: '#4a3a66', 'stroke-width': .8 }, g);
    el('path', { d: `M${cx - 28},${y - 22} L${cx},${y - 44} L${cx + 28},${y - 22} Z`, fill: '#8a7fa6', stroke: '#4a3a66', 'stroke-width': .8 }, g);
    for (const dx of [-32, 32]) { el('rect', { x: cx + dx - 5, y: y - 46, width: 10, height: 52, fill: '#cfc6de', stroke: '#4a3a66', 'stroke-width': .8 }, g);
      el('path', { d: `M${cx + dx - 6},${y - 46} L${cx + dx},${y - 66} L${cx + dx + 6},${y - 46} Z`, fill: '#4a3a66' }, g); }
    el('circle', { cx, cy: y - 10, r: 7, fill: '#ffd86b', stroke: '#8a6a10', 'stroke-width': .8, filter: 'url(#s-glow)' }, g);
    el('line', { x1: cx, y1: y - 44, x2: cx, y2: y - 54, stroke: '#ffd86b', 'stroke-width': 1.4 }, g);
    el('line', { x1: cx - 4, y1: y - 50, x2: cx + 4, y2: y - 50, stroke: '#ffd86b', 'stroke-width': 1.4 }, g);
    label(g, cx, y - 72, '辉光大教堂（圣光教会总部）', 'white', 10.5, 'middle'); }
  function convent(g, cx, it) { tip(g, it); const y = Y(it.at);
    el('rect', { x: cx - 44, y: y + 4, width: 88, height: 8, fill: '#4a4462' }, g);
    el('rect', { x: cx - 42, y: y - 10, width: 84, height: 14, fill: '#8f8a9e', stroke: '#2f2a3c', 'stroke-width': .8 }, g);
    for (let k = 0; k < 11; k++) el('rect', { x: cx - 42 + k * 8, y: y - 14, width: 5, height: 4, fill: '#8f8a9e', stroke: '#2f2a3c', 'stroke-width': .4 }, g);
    el('rect', { x: cx - 10, y: y - 34, width: 20, height: 24, fill: '#d8d4e2', stroke: '#2f2a3c', 'stroke-width': .8 }, g);
    el('path', { d: `M${cx - 12},${y - 34} L${cx},${y - 46} L${cx + 12},${y - 34} Z`, fill: '#5a5470' }, g);
    el('path', { d: `M${cx},${y - 46} v-8 M${cx - 4},${y - 50} h8`, stroke: '#e6e0f0', 'stroke-width': 1.4 }, g);
    el('rect', { x: cx + 18, y: y - 8, width: 20, height: 6, fill: '#b3a98a' }, g);
    label(g, cx, y - 60, '圣铁摇篮 · 战斗修女修道院', 'white', 10.5, 'middle'); }
  function police(g, cx, it) { tip(g, it); const y = Y(it.at);
    el('rect', { x: cx - 16, y: y - 50, width: 32, height: Y(50) - y + 50, fill: '#26324a', stroke: '#6fa0ff', 'stroke-width': .8 }, g);
    for (let hh = y - 44; hh < Y(60); hh += 10) el('rect', { x: cx - 13, y: hh, width: 26, height: 2, fill: '#6fa0ff', opacity: .45 }, g);
    el('circle', { cx: cx - 6, cy: y - 54, r: 3, fill: '#4f8bff', filter: 'url(#s-glow)' }, g);
    el('circle', { cx: cx + 6, cy: y - 54, r: 3, fill: '#ff4f4f', filter: 'url(#s-glow)' }, g);
    label(g, cx + 22, y - 36, '执法局总局', 'white', 10.5); }
  function barracks(g, cx, it) { tip(g, it); const y = Y(it.at);
    el('rect', { x: cx - 38, y: y - 4, width: 76, height: 10, fill: '#4b5345' }, g);
    for (let k = 0; k < 3; k++) el('rect', { x: cx - 34 + k * 24, y: y - 16, width: 20, height: 12, fill: '#6b7560', stroke: '#2e3328', 'stroke-width': .6 }, g);
    el('line', { x1: cx + 36, y1: y - 4, x2: cx + 36, y2: y - 30, stroke: '#2e3328', 'stroke-width': 1 }, g);
    el('path', { d: `M${cx + 36},${y - 30} l-12,4 l12,4 Z`, fill: '#9b2d20' }, g);
    label(g, cx + 30, y - 36, '防卫军 · 环城军营带', 'white', 10.5, 'end'); }
  function apartment(g, cx, it) { tip(g, it); const y = Y(it.at);
    el('rect', { x: cx - 22, y: y - 30, width: 44, height: Y(50) - y + 30, fill: '#3a2f2a', stroke: '#1d1714', 'stroke-width': .8 }, g);
    for (let r2 = 0; r2 < 6; r2++) for (let c = 0; c < 5; c++) el('rect', { x: cx - 19 + c * 8.4, y: y - 26 + r2 * 9, width: 4.5, height: 5, fill: (r2 * 5 + c) % 3 ? '#e8b060' : '#2a211d', opacity: .85 }, g);
    el('path', { d: `M${cx - 22},${y - 2} q22,6 44,0`, stroke: '#9a8a7a', 'stroke-width': .6, fill: 'none' }, g);
    el('rect', { x: cx + 22, y: y - 20, width: 10, height: 8, fill: '#ff4fb0', opacity: .8, filter: 'url(#s-glow)' }, g);
    label(g, cx, y - 36, '旧公寓楼（开局地点）', 'inf', 10.5, 'middle'); }

  function factories(g, it) { tip(g, it);
    for (const [x, w, h] of [[80, 46, 16], [132, 38, 22], [322, 44, 18], [520, 40, 20]]) { const y = Y(0) + 3;
      el('rect', { x, y, width: w, height: h, fill: '#3e342b', stroke: '#1a1410', 'stroke-width': .6 }, g);
      for (let k = 0; k < 3; k++) el('path', { d: `M${x + k * w / 3},${y} l${w / 6},-6 l${w / 6},6`, fill: '#4a3e33', stroke: '#1a1410', 'stroke-width': .4 }, g);
      const cx = x + w - 8; el('rect', { x: cx, y: y - 30, width: 5, height: 30, fill: '#554638' }, g);
      el('rect', { x: cx - 6, y: y - 60, width: 18, height: 32, fill: 'url(#s-smoke)', filter: 'url(#s-soft)' }, g);
      el('rect', { x: x + 4, y: y + h - 7, width: w - 8, height: 3, fill: '#ff8a3a', opacity: .6 }, g); }
    label(g, 84, Y(-44), '工厂 / 资源处理', 'white', 10); }
  function committee(g, cx, it) { tip(g, it); const y = Y(it.at);
    el('rect', { x: cx - 30, y: y - 14, width: 60, height: 26, fill: '#4b4f57', stroke: '#15171a', 'stroke-width': .8 }, g);
    el('rect', { x: cx - 8, y: y - 2, width: 16, height: 14, fill: '#22262c' }, g);
    for (const dx of [-24, 18]) el('rect', { x: cx + dx, y: y - 10, width: 6, height: 3, fill: '#ffcf33', opacity: .7 }, g);
    label(g, cx, y + 26, '资产管理委员会设施', 'white', 10, 'middle'); }
  function blackMarket(g, cx, it) { tip(g, it); const y = Y(it.at);
    for (let k = 0; k < 6; k++) { const x = cx - 50 + k * 17, h = 10 + (k * 7) % 9;
      el('rect', { x, y: y - h, width: 15, height: h, fill: '#2e2520', stroke: '#140f0c', 'stroke-width': .5 }, g);
      el('rect', { x: x + 2, y: y - h - 5, width: 11, height: 4, fill: ['#ff4f4f', '#ffd23f', '#3ee6ff'][k % 3], opacity: .85, filter: 'url(#s-glow)' }, g); }
    label(g, cx, y + 16, '黑市 / 帮派区', 'red', 10, 'middle'); }
  function outpost(g, cx, it) { tip(g, it); const y = Y(it.at);
    el('path', { d: `M${cx - 16},${y} L${cx - 12},${y - 10} L${cx + 12},${y - 10} L${cx + 16},${y} Z`, fill: '#555c4c', stroke: '#23261f', 'stroke-width': .6 }, g);
    el('rect', { x: cx - 7, y: y - 7, width: 14, height: 2, fill: '#ffe07a', opacity: .7 }, g);
    label(g, cx, y + 13, '防卫军前沿哨所', 'white', 9.5, 'middle'); }
  function ruinedChurches(g) {
    tip(g, { name: '下层三个教区', tag: 'set', src: '圣光教会：下层设有三个教区，但神职人员严重不足，教堂多处于半荒废状态' });
    for (const x of [120, 330, 590]) { const y = Y(-165);
      el('rect', { x: x - 8, y: y - 12, width: 16, height: 12, fill: '#3a332d', stroke: '#15110e', 'stroke-width': .5 }, g);
      el('path', { d: `M${x - 9},${y - 12} L${x - 2},${y - 20} L${x + 1},${y - 16}`, fill: 'none', stroke: '#5a5048', 'stroke-width': 1.2 }, g);
      el('path', { d: `M${x},${y - 22} v-6 M${x - 3},${y - 25} h6`, stroke: '#8a7a6a', 'stroke-width': 1 }, g); }
    label(g, 400, Y(-190), '三个半荒废教区', 'white', 9.5, 'middle'); }
}

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
