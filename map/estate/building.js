// 伊甸庄园 · 主楼与两翼：外墙（带真实窗洞 / 门洞）、每层「完整」与「剖切」两套几何、门廊山花、屋顶灯亭穹顶
import * as THREE from 'three';
import { G, mat4, Kit } from './lib.js';
import { FLOORS, HOUSE, CUT, ENTAB, SHAFTS } from './plan.js';

/* ---------- 墙：沿 x（ax='x'，位于 z=at）或沿 z（ax='z'，位于 x=at），openings 在墙上开洞 ---------- */
function piece(b, key, o, ua, ub, ya, yb, ao) {
  if (o.ax === 'x') b.bb(key, ua, ya, o.at - o.t / 2, ub, yb, o.at + o.t / 2, ao);
  else b.bb(key, o.at - o.t / 2, ya, ua, o.at + o.t / 2, yb, ub, ao);
}
export function wall(b, o, cut) {
  const ops = (o.open || []).slice().sort((a, c) => a.c - c.c);
  const top = cut ? o.y + Math.min(o.h, CUT) : o.y + o.h;
  const seg = (ua, ub, ya, yb) => {
    if (ub - ua < 1e-3) return; const y2 = Math.min(yb, top); if (y2 - ya < 1e-3) return;
    if (cut && yb >= top - 1e-6) { piece(b, o.mat, o, ua, ub, ya, y2 - 0.07, o.ao); piece(b, 'cap', o, ua, ub, y2 - 0.07, y2 + 0.01); }
    else piece(b, o.mat, o, ua, ub, ya, y2, o.ao);
  };
  let u = o.u0;
  for (const p of ops) {
    const a = p.c - p.w / 2, e = p.c + p.w / 2;
    if (p.kind === 'blind') continue;
    seg(u, a, o.y, o.y + o.h);
    if (p.bot > 0) seg(a, e, o.y, o.y + p.bot);
    if (p.top < o.h) seg(a, e, o.y + p.top, o.y + o.h);
    if (cut && p.kind !== 'door' && p.bot < CUT) { // 剖切时洞口里的玻璃
      const g = { ...o, t: 0.06 }; piece(b, 'glass', g, a, e, o.y + p.bot, o.y + Math.min(p.top, CUT) - 0.02);
    }
    u = e;
  }
  seg(u, o.u1, o.y, o.y + o.h);
}

/* ---------- 立面贴面构件：u 沿墙，v = 世界 y，off = 离外表面距离（向外为正） ---------- */
function fp(b, key, s, u, v, du, dv, off, dd) {
  const n = s.at + s.out * (s.t / 2 + off);
  if (s.ax === 'x') b.box(key, u, v, n, du, dv, dd); else b.box(key, n, v, u, dd, dv, du);
}
function fg(b, key, geom, s, u, v, sx, sy, sz, off) {
  const n = s.at + s.out * (s.t / 2 + off);
  const ry = s.ax === 'x' ? (s.out > 0 ? 0 : Math.PI) : (s.out > 0 ? Math.PI / 2 : -Math.PI / 2);
  if (s.ax === 'x') b.put(key, geom, u, v, n, sx, sy, sz, ry); else b.put(key, geom, n, v, u, sx, sy, sz, ry);
}
function sides(blk) {
  const { x0, x1, z0, z1, t } = blk;
  return {
    S: { ax: 'x', at: z1, u0: x0 - t / 2, u1: x1 + t / 2, out: 1, t },
    N: { ax: 'x', at: z0, u0: x0 - t / 2, u1: x1 + t / 2, out: -1, t },
    E: { ax: 'z', at: x1, u0: z0 + t / 2, u1: z1 - t / 2, out: 1, t },
    W: { ax: 'z', at: x0, u0: z0 + t / 2, u1: z1 - t / 2, out: -1, t },
  };
}
// 外表面一圈条带（腰线、檐口层）：off0..off1 为离外表面距离
function ring(b, key, blk, ya, yb, off0, off1) {
  const { x0, x1, z0, z1, t } = blk, h = t / 2;
  b.bb(key, x0 - h - off1, ya, z1 + h + off0, x1 + h + off1, yb, z1 + h + off1);
  b.bb(key, x0 - h - off1, ya, z0 - h - off1, x1 + h + off1, yb, z0 - h - off0);
  b.bb(key, x1 + h + off0, ya, z0 - h - off0, x1 + h + off1, yb, z1 + h + off0);
  b.bb(key, x0 - h - off1, ya, z0 - h - off0, x0 - h - off0, yb, z1 + h + off0);
}
// 实心檐口叠层（下面是墙，上面是楼板或屋面，所以可以做实心）
function cornice(b, blk, y, scale = 1, dentils = true) {
  const { x0, x1, z0, z1, t } = blk, h = t / 2;
  const L = (ya, yb, o, key = 'trim') => b.bb(key, x0 - h - o, ya, z0 - h - o, x1 + h + o, yb, z1 + h + o);
  const s = scale;
  L(y, y + 0.55 * s, 0.06 * s, 'trim');                 // 额枋
  L(y + 0.55 * s, y + 0.62 * s, 0.14 * s);
  L(y + 0.62 * s, y + 1.0 * s, 0.04 * s, 'stone');      // 檐壁
  L(y + 1.0 * s, y + 1.08 * s, 0.2 * s);
  L(y + 1.08 * s, y + 1.2 * s, 0.34 * s);
  L(y + 1.2 * s, y + 1.4 * s, 0.75 * s);                // 挑檐
  if (dentils) { // 齿饰
    const yy = y + 1.14 * s, st = 0.5;
    for (const sd of Object.values(sides(blk))) {
      for (let u = sd.u0 + 0.3; u < sd.u1 - 0.2; u += st) fp(b, 'trim', sd, u, yy, 0.22, 0.12 * s, 0.4 * s, 0.14);
    }
  }
}
function balustrade(b, x0, z0, x1, z1, y, h = 1.1, opt = {}) {
  // 直线栏杆：底座 + 实例化小柱 + 扶手；opt.posts 每隔多少米一个墩
  const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = opt.w || 0.36, sc = h / 1.1;
  b.put('trim', G.box, cx, y + 0.09 * sc, cz, L, 0.18 * sc, w + 0.06, -ang);
  b.put('trim', G.box, cx, y + h - 0.08 * sc, cz, L, 0.16 * sc, w + 0.1, -ang);
  const postEvery = opt.posts || 4, np = Math.max(1, Math.round(L / postEvery));
  for (let i = 0; i <= np; i++) {
    const t = i / np, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
    b.put('trim', G.box, px, y + h / 2, pz, 0.48 * sc + 0.06, h, 0.48 * sc + 0.06, -ang);
    b.put('trim', G.box, px, y + h + 0.04, pz, 0.6 * sc + 0.06, 0.08, 0.6 * sc + 0.06, -ang);
    if (opt.urns && (i === 0 || i === np || i % opt.urns === 0)) b.inst('urn', mat4(px, y + h + 0.08, pz, 1.1 * sc, 1.1 * sc, 1.1 * sc));
  }
  const bsp = 0.34 * sc;
  for (let i = 0; i < np; i++) {
    const a = i / np * L + 0.34 * sc, e = (i + 1) / np * L - 0.34 * sc; const n = Math.max(1, Math.floor((e - a) / bsp));
    for (let k = 0; k <= n; k++) { const d = a + (e - a) * k / n; b.inst('baluster', mat4(x0 + ux * d, y + 0.18 * sc, z0 + uz * d, sc, (h - 0.34 * sc) / 0.86, sc)); }
  }
}
export { balustrade };

/* ---------- 窗、门装饰 ---------- */
function windowDeco(b, s, p, y, style) {
  const H = p.top - p.bot, vb = y + p.bot, vm = vb + H / 2, w = p.w;
  if (p.kind === 'blind') {
    fp(b, 'trimShade', s, p.c, vm, w, H, -0.02, 0.04);
  } else if (p.kind === 'door') {
    const dh = Math.min(H, 3.6);
    fp(b, 'woodDark', s, p.c, vb + dh / 2, w, dh, -0.35, 0.12);
    fp(b, 'gold', s, p.c - 0.2, vb + 1.2, 0.08, 0.3, -0.27, 0.06); fp(b, 'gold', s, p.c + 0.2, vb + 1.2, 0.08, 0.3, -0.27, 0.06);
    fp(b, 'frame', s, p.c, vb + dh / 2, 0.08, dh, -0.28, 0.06);
    if (H > dh + 0.2) { fp(b, 'glass', s, p.c, vb + (dh + H) / 2, w, H - dh, -0.3, 0.05); fp(b, 'frame', s, p.c, vb + dh + 0.05, w, 0.12, -0.28, 0.08); }
  } else {
    fp(b, 'glass', s, p.c, vm, w, H, -0.32, 0.05);
    const fo = -0.29;
    fp(b, 'frame', s, p.c, vb + 0.05, w, 0.1, fo, 0.08); fp(b, 'frame', s, p.c, vb + H - 0.05, w, 0.1, fo, 0.08);
    fp(b, 'frame', s, p.c - w / 2 + 0.05, vm, 0.1, H, fo, 0.08); fp(b, 'frame', s, p.c + w / 2 - 0.05, vm, 0.1, H, fo, 0.08);
    fp(b, 'frame', s, p.c, vm, 0.07, H, fo + 0.01, 0.06);
    const bars = Math.max(1, Math.round(H / 0.75)) ;
    for (let i = 1; i < bars; i++) fp(b, 'frame', s, p.c, vb + H * i / bars, w, 0.05, fo + 0.01, 0.05);
  }
  // 窗套
  if (style !== 'rustic') {
    fp(b, 'trim', s, p.c - w / 2 - 0.13, vm + 0.07, 0.26, H + 0.14, 0.05, 0.1);
    fp(b, 'trim', s, p.c + w / 2 + 0.13, vm + 0.07, 0.26, H + 0.14, 0.05, 0.1);
    fp(b, 'trim', s, p.c, vb + H + 0.13, w + 0.52, 0.26, 0.05, 0.1);
  } else {
    fp(b, 'trim', s, p.c, vb + H + 0.32, 0.46, 0.64, 0.08, 0.16);   // 拱心石
    fp(b, 'trim', s, p.c, vb + H + 0.08, w + 0.2, 0.16, 0.03, 0.06);
  }
  if (p.bot > 0) fp(b, 'trim', s, p.c, vb - 0.07, w + 0.56, 0.14, 0.1, 0.26);
  if (style === 'noble') {
    fp(b, 'trim', s, p.c, vb + H + 0.34, w + 0.9, 0.14, 0.12, 0.34);
    if (p.ped === 'tri') fg(b, 'trim', G.prism(), s, p.c, vb + H + 0.41, w + 0.9, 0.62, 0.3, 0.12);
    else fg(b, 'trim', G.seg(), s, p.c, vb + H + 0.41, (w + 0.9) / 2, 0.5, 0.3, 0.12);
    if (p.balcony) { // 小阳台
      fp(b, 'trim', s, p.c, y - 0.1, w + 0.9, 0.2, 0.45, 0.9);
      fp(b, 'trim', s, p.c, y - 0.28, w + 0.5, 0.16, 0.3, 0.6);
      const n = s.at + s.out * (s.t / 2 + 0.82);
      for (let i = 0; i <= 5; i++) { const u = p.c - (w + 0.6) / 2 + (w + 0.6) * i / 5; const m = s.ax === 'x' ? mat4(u, y, n, 0.7, 0.9, 0.7) : mat4(n, y, u, 0.7, 0.9, 0.7); b.inst('baluster', m); }
      fp(b, 'trim', s, p.c, y + 0.86, w + 0.9, 0.1, 0.82, 0.2);
      for (const du of [-(w + 0.9) / 2 + 0.05, (w + 0.9) / 2 - 0.05]) fp(b, 'trim', s, p.c + du, y + 0.43, 0.14, 0.86, 0.45, 0.8);
    }
  } else if (style === 'plain') {
    fp(b, 'trim', s, p.c, vb + H + 0.34, w + 0.7, 0.12, 0.1, 0.28);
  }
}

/* ---------- 主楼立面开洞表 ---------- */
const BAYX = []; for (let x = -36; x <= 36; x += 4) BAYX.push(x);
const BAYZ = [-10, -6, -2, 2, 6, 10];
function houseOpenings(side, fi) {
  const list = [], cs = (side === 'S' || side === 'N') ? BAYX : BAYZ;
  for (const c of cs) {
    let p;
    if (fi === 0) p = { c, w: 1.8, bot: 0.9, top: 4.3 };
    else if (fi === 1) p = { c, w: 1.8, bot: 0, top: 3.5 };
    else if (fi === 2) p = { c, w: 1.6, bot: 0.8, top: 3.3 };
    else p = { c, w: 1.4, bot: 1.0, top: 2.6 };
    if (side === 'S' && fi === 0 && c === 0) p = { c, w: 3.2, bot: 0, top: 5.0, kind: 'door' };
    if (side === 'N' && Math.abs(c) <= 9 && fi < 4) p.kind = 'blind';            // 交通核背后
    if (side === 'N' && fi === 0 && (c === -20 || c === -28)) { p.bot = 0; p.top = 4.3; }   // 会客厅通后庭露台
    p.ped = (Math.round(c / 4) % 2) ? 'seg' : 'tri';
    p.balcony = fi === 1 && (side === 'S' || side === 'N') && Math.abs(c) >= 16 && p.kind !== 'blind';
    list.push(p);
  }
  return list;
}
const STYLE = ['rustic', 'noble', 'plain', 'attic'];

/* ---------- 内墙表 ---------- */
const D = (c, w = 1.6) => ({ c, w, bot: 0, top: 2.5, kind: 'door' });
const IW = [
  [['x', -3, -14, 14, [D(0, 10)]], ['z', -14, -13, 13, [D(5, 3), D(-8)]], ['z', 14, -13, 13, [D(5, 3), D(-8)]], ['x', -4, 14, 38, [D(20), D(32)]], ['z', 26, -13, -4, [D(-8.5, 1.4)]]],
  [['x', -3, -14, 14, [D(0, 10)]], ['z', -14, -13, 13, [D(6.5), D(-8)]], ['z', 14, -13, 13, [D(5, 2.4), D(-8)]], ['x', 0, -38, -14, []]],
  [['x', -3, -14, 14, [D(0, 10)]], ['z', -14, -13, 13, [D(5, 2.4)]], ['x', -4, -38, -14, [D(-32), D(-20)]], ['z', -26, -13, -4, [D(-8.5, 1.4)]], ['z', 14, -13, 13, [D(6.5), D(-6.5)]], ['x', 0, 14, 38, [D(26)]]],
  [['x', -3, -14, 14, [D(0, 10)]], ['z', -14, -13, 13, [D(6.5), D(-6.5)]], ['x', 0, -38, -14, []], ['z', 14, -13, 13, [D(6.5), D(-6.5)]], ['x', 0, 14, 38, []]],
  [],
];
function shaftWalls(fi) {
  const w = [['z', 6, -13, -9.5, []], ['x', -9.5, 6, 9, [D(7.5, 1.2)]], ['z', 9, -13, -9.5, []], ['z', -6, -13, -9.5, []], ['z', -9, -13, -9.5, []]];
  w.push(['x', -9.5, -9, -6, (fi % 2 === 0) ? [D(-7.5, 1.2)] : []]);   // 主人通道只在 1F / 3F / 5F 开门
  return w;
}

/* ---------- 楼梯（U 形双跑） ---------- */
function stairs(b, y, H) {
  const n = Math.max(10, Math.round(H / 2 / 0.17)), rise = H / 2 / n, run = 6.5 / n;
  for (let i = 0; i < n; i++) {
    const za = -4 - i * run, top = y + rise * (i + 1);
    b.bb('trim', 0.2, top - 0.2, za - run, 4.8, top, za);         // 第一跑（往后升）
    const zb = -10.5 + i * run, top2 = y + H / 2 + rise * (i + 1);
    b.bb('trim', -4.8, top2 - 0.2, zb, -0.2, top2, zb + run);     // 第二跑（往前升）
  }
  b.bb('trim', -4.8, y + H / 2 - 0.25, -12.5, 4.8, y + H / 2, -10.5);   // 平台
  b.bb('rugBurg', 0.9, y + 0.01, -4.6, 4.1, y + 0.03, -3.2);
  // 斜梁与扶手
  const L = Math.hypot(6.5, H / 2), a = Math.atan2(H / 2, 6.5);
  for (const [x, dir, y0] of [[0.1, -1, y], [-0.1, 1, y + H / 2], [4.9, -1, y], [-4.9, 1, y + H / 2]]) {
    const cz = dir < 0 ? -7.25 : -7.25, yy = y0 + H / 4;
    b.put('woodDark', G.box, x, yy - 0.2 + 1.0, cz, 0.1, 0.1, L, 0, dir < 0 ? a : -a);
    b.put('trim', G.box, x, yy - 0.35, cz, 0.18, 0.35, L, 0, dir < 0 ? a : -a);
    for (let i = 1; i < 12; i++) { const t = i / 12, zz = dir < 0 ? -4 - 6.5 * t : -10.5 + 6.5 * t, yb = y0 + H / 2 * t; b.bb('iron', x - 0.02, yb, zz - 0.02, x + 0.02, yb + 1.0, zz + 0.02); }
  }
}

/* ---------- 门廊柱 ---------- */
const PCOLS = [-10, -6, -2, 2, 6, 10], PZ = 19.8, PR = 0.66;
function column(b, x, z, y0, y1, r, opts = {}) {
  const k = new Kit(b, x, 0, z);
  if (opts.base) { k.bx('trim', 0, y0, 0, r * 2.5, 0.28, r * 2.5); k.geo('trim', G.tor(Math.PI * 2, 6, 20, 0.3), 0, y0 + 0.36, 0, r * 1.05, r * 0.9, r * 1.05); }
  const ys = opts.base ? y0 + 0.36 : y0;
  const ye = opts.cap ? y1 - 0.9 : y1;
  k.cyl(opts.mat || 'trim', 0, ys, 0, r * (opts.rb || 1), ye - ys, 18, (opts.rt || 1) / (opts.rb || 1));
  if (opts.cap) { // 爱奥尼亚式简化：钟形 + 涡卷 + 顶板
    const rt = r * (opts.rt || 1);
    k.geo('trim', G.tor(Math.PI * 2, 6, 20, 0.25), 0, ye + 0.05, 0, rt * 1.05, rt, rt * 1.05);
    k.cyl('trim', 0, ye + 0.1, 0, rt * 1.05, 0.4, 16, 1.2);
    for (const sx of [-1, 1]) k.geo('trim', G.cyl(14), sx * rt * 1.1, ye + 0.5, 0, rt * 0.34, rt * 2.1, rt * 0.34, 0, Math.PI / 2);
    k.bx('trim', 0, ye + 0.62, 0, rt * 2.9, 0.28, rt * 2.9);
  }
}
function stub(b, x, z, y, r, seg = 18) {
  b.put('trim', G.cyl(seg), x, y + (CUT - 0.07) / 2, z, r, CUT - 0.07, r);
  b.put('cap', G.cyl(seg), x, y + CUT - 0.03, z, r, 0.08, r);
}

/* ================================================================
 * 主楼
 * full[i]：该层完整外观（外墙、窗、柱、檐口…）；cut[i]：该层剖切（墙截在 1.2 m、楼板、地面材质、楼梯）
 * ================================================================ */
export function buildHouse(full, cut, site) {
  const blk = { ...HOUSE }, S = sides(blk);
  FLOORS.forEach((f, fi) => {
    const bF = full[fi], bC = cut[fi], y = f.y;
    // 楼板
    const slab = (b) => b.bb('stone', blk.x0 - 0.45, y - 0.35, blk.z0 - 0.45, blk.x1 + 0.45, y, blk.z1 + 0.45);
    slab(bF); slab(bC);
    if (fi < 4) {
      // 外墙
      const wallMat = fi === 0 ? 'rustic' : 'stone', wallH = fi === 2 ? ENTAB[0] - y : f.h;
      for (const [k, s] of Object.entries(S)) {
        const open = houseOpenings(k, fi);
        const o = { ...s, y, h: wallH, open, mat: wallMat, ao: fi === 0 ? [0, 4, 0.78] : null };
        wall(bF, o, false); wall(bC, o, true);
        for (const p of open) windowDeco(bF, s, p, y, STYLE[fi]);
        // 壁柱：2F–3F 巨柱式，在每个开间分界
        if ((fi === 1 || fi === 2) && (k === 'S' || k === 'N')) {
          for (let u = -34; u <= 34; u += 4) { if (Math.abs(u) < 13 && k === 'S') continue; if (Math.abs(u) % 8 !== 2 && Math.abs(u) !== 34) continue;
            fp(bF, 'trim', s, u, y + wallH / 2, 0.8, wallH, 0.08, 0.16);
            if (fi === 2) { fp(bF, 'trim', s, u, y + wallH - 0.25, 1.1, 0.5, 0.14, 0.28); }
            if (fi === 1) fp(bF, 'trim', s, u, y + 0.2, 1.0, 0.4, 0.14, 0.28);
          }
        }
        // 转角隅石
        if (fi > 0) for (const u of [s.u0 + 0.5, s.u1 - 0.5]) for (let v = y + 0.25; v < y + wallH - 0.2; v += 0.9) fp(bF, 'trim', s, u + (u < 0 ? 0.1 : -0.1) * 0, v, (Math.round((v - y) / 0.9) % 2) ? 1.0 : 0.7, 0.42, 0.04, 0.1);
      }
      // 腰线
      if (fi === 0) { ring(bF, 'trim', blk, y + f.h - 0.4, y + f.h, 0, 0.22); ring(bF, 'trim', blk, y + f.h - 0.52, y + f.h - 0.4, 0, 0.12); }
      if (fi === 1) ring(bF, 'trim', blk, y + f.h - 0.25, y + f.h, 0, 0.1);
      if (fi === 2) cornice(bF, blk, ENTAB[0], 1.0);
      if (fi === 3) { ring(bF, 'trim', blk, y + f.h - 0.35, y + f.h, 0, 0.3); ring(bF, 'trim', blk, y + f.h - 0.45, y + f.h - 0.35, 0, 0.12); }
      // 内墙（剖切）
      for (const [ax, at, u0, u1, open] of IW[fi].concat(shaftWalls(fi))) {
        const o = { ax, at, u0, u1, t: ax === 'x' && at === -3 ? 0.45 : 0.3, y, h: f.h, open, mat: 'plaster' };
        wall(bC, o, true);
      }
      stairs(bC, y, (FLOORS[fi + 1].y - y));
    }
    // 地面材质
    for (const r of ROOMS_OF(fi)) if (!r.skipFloor) bC.bb(r.mat, r.r[0], y, r.r[2], r.r[1], y + 0.025, r.r[3]);
  });

  /* --- 大厅内两列柱（剖切显示柱础截面） --- */
  for (const x of [-8, 8]) for (const z of [1, 5, 9]) { stub(cut[0], x, z, FLOORS[0].y, 0.45); cut[0].bb('trim', x - 0.6, FLOORS[0].y, z - 0.6, x + 0.6, FLOORS[0].y + 0.2, z + 0.6); }

  /* --- 门廊 --- */
  const yb = FLOORS[0].y;
  for (const x of PCOLS) {
    // 每层一段，便于剖切
    column(full[0], x, PZ, yb, FLOORS[1].y, PR, { base: true, rb: 1, rt: 0.97 });
    column(full[1], x, PZ, FLOORS[1].y, FLOORS[2].y, PR, { rb: 0.97, rt: 0.93 });
    column(full[2], x, PZ, FLOORS[2].y, ENTAB[0], PR, { cap: true, rb: 0.93, rt: 0.88 });
    stub(cut[0], x, PZ, yb, PR); stub(cut[1], x, PZ, FLOORS[1].y, PR * 0.97); stub(cut[2], x, PZ, FLOORS[2].y, PR * 0.93);
    cut[0].bb('trim', x - 0.85, yb, PZ - 0.85, x + 0.85, yb + 0.28, PZ + 0.85);
  }
  // 门廊背后的壁柱（对应柱）
  for (const x of [-10, 10]) for (let fi = 0; fi < 3; fi++) { const y0 = FLOORS[fi].y, y1 = fi === 2 ? ENTAB[0] : FLOORS[fi + 1].y; full[fi].bb('trim', x - 0.55, y0, 13.45, x + 0.55, y1, 13.7); }
  // 门廊檐部 + 山花
  const pb = { x0: -12.2, x1: 12.2, z0: 13.2, z1: 21.2, t: 0.6 };
  cornice(full[2], pb, ENTAB[0], 1.0);
  const py = ENTAB[1], pw = 26.6, ph = 4.9;
  full[3].put('lead', G.prism(), 0, py, 17.0, pw, ph, 7.9);
  full[3].put('stone', G.prism(), 0, py + 0.12, 21.2, pw - 1.6, ph - 0.75, 0.5);
  const ang = Math.atan2(ph, pw / 2), L = Math.hypot(pw / 2, ph);
  for (const sx of [-1, 1]) {
    full[3].put('trim', G.box, sx * pw / 4, py + ph / 2 - 0.05, 21.72, L + 0.3, 0.5, 0.7, 0, 0, -sx * ang);
    full[3].put('trim', G.box, sx * pw / 4, py + ph / 2 - 0.35, 21.62, L - 0.4, 0.2, 0.5, 0, 0, -sx * ang);
  }
  full[3].put('gold', G.cyl(28), 0, py + 1.6, 21.5, 1.05, 0.1, 1.05, 0, Math.PI / 2);
  full[3].put('trim', new THREE.TorusGeometry(1, 0.07, 6, 28), 0, py + 1.6, 21.52, 1.2, 1.2, 1.2);
  for (let i = 0; i < 10; i++) { const a = (i / 9 - 0.5) * 2.2; full[3].put('gold', G.sph(6, 4), Math.sin(a) * 1.55 * (i < 5 ? -1 : 1) * 0 + Math.sin(a) * 1.55, py + 1.6 - Math.cos(a) * 1.45, 21.48, 0.16, 0.09, 0.05, 0, 0, a); }
  for (const [x, yy] of [[0, py + ph + 0.1], [-pw / 2 + 0.4, py + 0.1], [pw / 2 - 0.4, py + 0.1]]) { full[3].bb('trim', x - 0.6, yy - 0.1, 21.1, x + 0.6, yy + 0.4, 22.1); full[3].inst('urn', mat4(x, yy + 0.4, 21.6, 1.6, 1.6, 1.6)); }

  /* --- 屋顶露台（5F）：楼板、铺地、栏杆女儿墙、烟囱 --- */
  const y5 = FLOORS[4].y;
  for (const b of [full[4], cut[4]]) {
    b.bb('pavers', blk.x0 + 0.45, y5, blk.z0 + 0.45, blk.x1 - 0.45, y5 + 0.03, blk.z1 - 0.45);
    b.bb('trim', blk.x0 - 0.55, y5, blk.z0 - 0.55, blk.x1 + 0.55, y5 + 0.2, blk.z0 + 0.45);
    b.bb('trim', blk.x0 - 0.55, y5, blk.z1 - 0.45, blk.x1 + 0.55, y5 + 0.2, blk.z1 + 0.55);
    b.bb('trim', blk.x0 - 0.55, y5, blk.z0 + 0.45, blk.x0 + 0.45, y5 + 0.2, blk.z1 - 0.45);
    b.bb('trim', blk.x1 - 0.45, y5, blk.z0 + 0.45, blk.x1 + 0.55, y5 + 0.2, blk.z1 - 0.45);
    const e = 0.0, yy = y5 + 0.2;
    balustrade(b, blk.x0 + e, blk.z1, blk.x1 - e, blk.z1, yy, 1.05, { posts: 4, urns: 2 });
    balustrade(b, blk.x0 + e, blk.z0, blk.x1 - e, blk.z0, yy, 1.05, { posts: 4, urns: 2 });
    balustrade(b, blk.x0, blk.z0, blk.x0, blk.z1, yy, 1.05, { posts: 4.4, urns: 3 });
    balustrade(b, blk.x1, blk.z0, blk.x1, blk.z1, yy, 1.05, { posts: 4.4, urns: 3 });
  }
  for (const x of [-30, 30]) for (const z of [-7, 7]) {
    const k = new Kit(full[4], x, y5, z);
    k.bx('stone', 0, 0, 0, 2.6, 2.6, 1.2); k.bx('trim', 0, 2.6, 0, 2.9, 0.25, 1.5);
    for (const dx of [-0.8, 0, 0.8]) k.cyl('terracotta', dx, 2.85, 0, 0.18, 0.5, 8);
  }

  /* --- 穹顶灯亭（私人电梯厅） --- */
  const pv = { x0: -10, x1: 10, z0: -13, z1: 1, t: 0.6 }, PS = sides(pv), ph5 = 5.4;
  const pvOpen = { S: [{ c: 0, w: 3, bot: 0, top: 3.8, kind: 'door' }, { c: -6, w: 1.6, bot: 0.4, top: 3.8 }, { c: 6, w: 1.6, bot: 0.4, top: 3.8 }],
    E: [{ c: -3, w: 1.6, bot: 0.4, top: 3.8 }, { c: -9, w: 1.6, bot: 0.4, top: 3.8 }], W: [{ c: -3, w: 1.6, bot: 0.4, top: 3.8 }, { c: -9, w: 1.6, bot: 0.4, top: 3.8 }],
    N: [{ c: -6, w: 1.6, bot: 0.4, top: 3.8, kind: 'blind' }, { c: 6, w: 1.6, bot: 0.4, top: 3.8, kind: 'blind' }] };
  for (const [k, s] of Object.entries(PS)) {
    const o = { ...s, y: y5, h: ph5, open: pvOpen[k], mat: 'stone' };
    wall(full[4], o, false); wall(cut[4], o, true);
    for (const p of pvOpen[k]) windowDeco(full[4], s, p, y5, 'plain');
    for (const u of [s.u0 + 0.4, s.u1 - 0.4]) fp(full[4], 'trim', s, u, y5 + ph5 / 2, 0.9, ph5, 0.06, 0.14);
  }
  for (const [ax, at, u0, u1, open] of shaftWalls(4)) wall(cut[4], { ax, at, u0, u1, t: 0.3, y: y5, h: 3.2, open, mat: 'plaster' }, true);
  cornice(full[4], pv, y5 + ph5, 0.8, false);
  const top = y5 + ph5 + 1.12, cz = -6;
  const dk = new Kit(full[4], 0, top, cz);
  dk.cyl('stone', 0, 0, 0, 6.3, 3.3, 32);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; dk.box('glass', Math.sin(a) * 6.28, 1.6, Math.cos(a) * 6.28, 1.0, 1.9, 0.1, a); dk.box('trim', Math.sin(a) * 6.34, 2.7, Math.cos(a) * 6.34, 1.4, 0.2, 0.2, a);
    const a2 = i * Math.PI / 4; dk.box('trim', Math.sin(a2) * 6.4, 1.65, Math.cos(a2) * 6.4, 0.6, 3.3, 0.25, a2); }
  dk.geo('trim', G.cyl(32), 0, 3.45, 0, 6.8, 0.3, 6.8);
  dk.geo('trim', G.cyl(32), 0, 3.7, 0, 6.5, 0.2, 6.5);
  dk.geo('lead', G.hemi(32), 0, 3.8, 0, 6.35, 6.6, 6.35);
  const rib = new THREE.TorusGeometry(1, 0.012, 4, 16, Math.PI / 2);
  for (let i = 0; i < 12; i++) dk.geo('gold', rib, 0, 3.8, 0, 6.38, 6.63, 6.38, i * Math.PI / 6);
  // 灯笼亭
  dk.cyl('trim', 0, 10.2, 0, 1.5, 0.3, 16);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; dk.cyl('trim', Math.sin(a) * 1.25, 10.5, Math.cos(a) * 1.25, 0.12, 1.9, 8); }
  dk.cyl('glow', 0, 10.5, 0, 1.0, 1.9, 12);
  dk.cyl('trim', 0, 12.4, 0, 1.6, 0.25, 16);
  dk.geo('lead', G.hemi(16), 0, 12.65, 0, 1.4, 1.3, 1.4);
  dk.sph('gold', 0, 14.2, 0, 0.35, 0.35, 0.35); dk.geo('gold', G.cone(8), 0, 15.0, 0, 0.12, 1.4, 0.12);

  /* --- 基座、门廊台阶、后露台（静态，放 site） --- */
  site.bb('rustic', blk.x0 - 0.9, 0, blk.z0 - 0.9, blk.x1 + 0.9, 1.2, blk.z1 + 0.9, [0, 1.2, 0.8]);
  ring(site, 'trim', blk, 1.02, 1.22, 0, 0.62);
  site.bb('pavers', -12.9, 0, 13, 12.9, 1.22, 22.2);
  for (let i = 0; i < 7; i++) { const yy = 1.2 - i * 0.171; site.bb('trim', -14 - i * 0.3, 0, 22.2 + i * 0.55, 14 + i * 0.3, yy, 22.2 + (i + 1) * 0.55); }
  for (const sx of [-1, 1]) { site.bb('rustic', sx * 14 - 1.2, 0, 13, sx * 14 + 1.2, 1.9, 26.2); site.bb('trim', sx * 14 - 1.35, 1.9, 22.5, sx * 14 + 1.35, 2.1, 26.3); site.inst('lamp', mat4(sx * 14, 2.1, 25.2, 1.1, 1.1, 1.1)); }
  // 后露台
  site.bb('pavers', -30, 0, -28, 30, 1.2, -13.8); site.bb('trim', -30.3, 1.05, -28.3, 30.3, 1.25, -13.8);
  balustrade(site, -30, -28, -6, -28, 1.25, 1.05, { posts: 4, urns: 2 }); balustrade(site, 6, -28, 30, -28, 1.25, 1.05, { posts: 4, urns: 2 });
  balustrade(site, -30, -28, -30, -14, 1.25, 1.05, { posts: 4.6 }); balustrade(site, 30, -28, 30, -14, 1.25, 1.05, { posts: 4.6 });
  for (let i = 0; i < 7; i++) { const yy = 1.2 - i * 0.171; site.bb('trim', -6, 0, -28 - (i + 1) * 0.55, 6, yy, -28 - i * 0.55); }
  for (const x of [-18, 18]) { const k = new Kit(site, x, 1.25, -21); k.bx('trim', 0, 0, 0, 1.3, 0.2, 1.3); k.inst('urn', 0, 0.2, 0, 1.4, 1.4, 1.4); k.sph('foliage', 0, 1.7, 0, 0.7, 0.55, 0.7); }
}
let ROOMS_OF = () => [];
export function setRooms(fn) { ROOMS_OF = fn; }

/* ================================================================
 * 两翼：帕拉第奥式柱廊连廊 + 两座翼楼（西：仆役楼；东：机库 / 马车房）
 * ================================================================ */
export function buildWings(site) {
  for (const sx of [-1, 1]) {
    // 连廊 38..58
    const xa = sx * 38.45, xb = sx * 58;
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    site.bb('rustic', x0, 0, -2, x1, 1.2, 6.4, [0, 1.2, 0.8]);
    site.bb('pavers', x0, 1.2, -1.6, x1, 1.23, 6.0);
    site.bb('stone', x0, 1.2, -2, x1, 7.2, -1.2);
    for (let x = x0 + 2.7; x < x1 - 1; x += 3.3) { const k = new Kit(site, x, 1.2, -1.15); k.bx('trimShade', 0, 1.0, 0, 1.2, 3.4, 0.08); k.bx('trim', 0, 4.5, 0, 1.5, 0.15, 0.2); }
    for (let x = x0 + 1.05; x <= x1 + 0.01; x += (x1 - x0 - 2.1) / 6) column(site, x, 5.2, 1.2, 7.2, 0.36, { base: true, cap: true, rb: 1, rt: 0.9 });
    const lb = { x0, x1, z0: -1.6, z1: 5.8, t: 0.4 };
    cornice(site, lb, 7.2, 0.7, false);
    site.bb('lead', x0, 8.18, -1.4, x1, 8.25, 5.6);
    balustrade(site, x0 + 0.6, 5.9, x1 - 0.6, 5.9, 8.2, 0.9, { posts: 3.3 });

    // 翼楼
    const w = { x0: sx < 0 ? -82 : 58, x1: sx < 0 ? -58 : 82, z0: -12, z1: 16, t: 0.8 }, WS = sides(w);
    const hangar = sx > 0;
    site.bb('rustic', w.x0 - 0.6, 0, w.z0 - 0.6, w.x1 + 0.6, 1.2, w.z1 + 0.6, [0, 1.2, 0.8]);
    site.bb('trim', w.x0 - 0.7, 1.05, w.z0 - 0.7, w.x1 + 0.7, 1.25, w.z1 + 0.7);
    const cx = (w.x0 + w.x1) / 2;
    for (const [fi, y, h] of [[0, 1.2, 6.0], [1, 7.2, 4.5]]) {
      for (const [k, s] of Object.entries(WS)) {
        const cs = (k === 'S' || k === 'N') ? [-10, -6, -2, 2, 6, 10].map(d => cx + d) : [-8, -4, 0, 4, 8, 12];
        let open = cs.map(c => fi === 0 ? { c, w: 1.7, bot: 0.9, top: 4.1 } : { c, w: 1.6, bot: 0.7, top: 3.3 });
        if (fi === 0 && k === 'S') open = hangar ? [-8, 0, 8].map(d => ({ c: cx + d, w: 5, bot: 0, top: 5.2, kind: 'door' })) : open.map(p => Math.abs(p.c - cx) < 3 ? { c: cx, w: 2.4, bot: 0, top: 4.2, kind: 'door' } : p).filter((p, i, a) => a.findIndex(q => q.c === p.c) === i);
        if (k === (sx < 0 ? 'E' : 'W')) open = open.filter(p => p.c > 7 || p.c < -3);   // 连廊接头处不开窗
        const o = { ...s, y, h, open, mat: fi === 0 ? 'rustic' : 'stone', ao: fi === 0 ? [0, 4, 0.78] : null };
        wall(site, o, false);
        for (const p of open) windowDeco(site, s, p, y, fi === 0 ? 'rustic' : 'plain');
      }
      if (fi === 0) { ring(site, 'trim', w, 6.8, 7.2, 0, 0.2); }
    }
    site.bb('stone', w.x0, 7.0, w.z0, w.x1, 7.2, w.z1);
    cornice(site, w, 11.7, 0.9, true);
    // 四坡铅皮屋顶
    const rw = w.x1 - w.x0 + 1.2, rd = w.z1 - w.z0 + 1.2;
    site.put('lead', G.cyl(4, 0.42), cx, 12.96 + 1.9, (w.z0 + w.z1) / 2, rw / Math.SQRT2, 3.8, rd / Math.SQRT2, Math.PI / 4);
    // 正面小山花
    site.put('stone', G.prism(), cx, 12.96, w.z1 + 0.5, 13, 2.6, 1.2);
    for (const s2 of [-1, 1]) site.put('trim', G.box, cx + s2 * 3.25, 12.96 + 1.28, w.z1 + 1.12, Math.hypot(6.5, 2.6) + 0.3, 0.35, 0.4, 0, 0, -s2 * Math.atan2(2.6, 6.5));
    // 东翼钟亭 + 风向标；西翼两个烟囱
    if (hangar) {
      const k = new Kit(site, cx, 16.4, 2);
      k.cyl('stone', 0, 0, 0, 1.8, 2.4, 8); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; k.box('glass', Math.sin(a) * 1.7, 1.3, Math.cos(a) * 1.7, 0.6, 1.4, 0.08, a); }
      k.cyl('trim', 0, 2.4, 0, 2.1, 0.25, 8); k.cyl('lead', 0, 2.65, 0, 2.0, 1.8, 8, 0.05);
      k.sph('gold', 0, 4.6, 0, 0.2, 0.2, 0.2); k.box('gold', 0, 5.2, 0, 1.1, 0.06, 0.06); k.box('gold', 0, 5.2, 0, 0.04, 1.0, 0.04);
      k.cyl('gold', 0, 1.3, 1.85, 0.7, 0.06, 20, 1, 1, 1, Math.PI / 2);   // 钟面
    } else for (const dz of [-6, 8]) { const k = new Kit(site, cx, 12.9, dz); k.bx('stone', 0, 0, 0, 1.6, 4.4, 1.1); k.bx('trim', 0, 4.4, 0, 1.9, 0.25, 1.4); for (const dx of [-0.4, 0.4]) k.cyl('terracotta', dx, 4.65, 0, 0.16, 0.45, 8); }
    // 翼楼前停车 / 机坪铺地
    if (hangar) { site.bb('pavers', 58, 0, 16.6, 82, 0.05, 34); for (const d of [-8, 0, 8]) site.bb('gold', cx + d - 0.08, 0.05, 20, cx + d + 0.08, 0.06, 33); }
  }
}

/* ---------- 竖井（半透明色柱，每层一段） ---------- */
export function buildShafts(floorGroups) {
  const mats = SHAFTS.map(s => new THREE.MeshStandardMaterial({ color: s.color, transparent: true, opacity: 0.13, depthWrite: false, roughness: 0.6, emissive: s.color, emissiveIntensity: 0.1 }));
  const edgeMats = SHAFTS.map(s => new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: 0.55 }));
  const out = [];
  FLOORS.forEach((f, fi) => {
    const g = new THREE.Group(); g.name = 'shafts' + fi;
    const h = fi === 4 ? 3.4 : f.h;
    SHAFTS.forEach((s, si) => {
      const [x0, x1, z0, z1] = s.r, box = new THREE.BoxGeometry(x1 - x0 - 0.1, h - 0.1, z1 - z0 - 0.1);
      const m = new THREE.Mesh(box, mats[si]); m.position.set((x0 + x1) / 2, f.y + h / 2, (z0 + z1) / 2); m.renderOrder = 4;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(box), edgeMats[si]); e.position.copy(m.position);
      m.userData.shaft = s; g.add(m, e);
    });
    floorGroups[fi].add(g); out.push(g);
  });
  return out;
}
