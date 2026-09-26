// 伊甸庄园 · 建筑：帕拉第奥五段式府邸（中央主楼、两翼、爱奥尼亚柱廊连廊、图书馆塔亭、音乐厅亭）
// buildHouse(full, site)：各层外壳 full[0..4] + 基座台阶（site）；buildCut(b, fi)：第 fi 层剖切几何；buildShafts(floorGroups)：竖井色柱
// 内墙、门洞由房间矩形自动推出（共边 = 内墙，单边 = 外墙），外墙开洞按立面表；与内墙相撞的窗自动改为盲窗。
import * as THREE from 'three';
import { G, mat4, Kit, MATS } from './lib.js';
import { FLOORS, BLOCKS, CUT, ENTAB, SHAFTS, ROOMS } from './plan.js';
import * as FUR from './furniture.js';

const PI = Math.PI, TAU = PI * 2;
const EPS = 1e-6;
const SUB = (b, t) => (b && typeof b.sub === 'function' ? b.sub(t) : b);

/* ---------- 材质键兜底：WP-B 的新键未就位时退回旧键 ---------- */
const FB = {
  checker: 'marble', checkSmall: 'tile', marble: 'marbleC', marbleGold: 'marbleC', marbleBlack: 'piano', versailles: 'parquet', herring: 'parquet', oak: 'parquet',
  lino: 'paint', stoneFlag: 'pavers', compass: 'marbleC', tileWhite: 'tile', plasterStone: 'plaster', paintIvory: 'paint', scagliola: 'fabBurg',
  brass: 'gold', ormolu: 'gold', nickel: 'trim', mahogany: 'woodDark', walnut: 'woodDark', cap: 'iron', silkBlue: 'fabNavy', rugRunner: 'rugBurg',
};
function mk(k) {
  if (MATS[k] || !Object.keys(MATS).length) return k;
  const f = FB[k]; if (f && MATS[f]) return f;
  return MATS.plaster ? 'plaster' : 'trim';
}
// WP-B 的道具钩子（缺失时返回 null，调用方自带兜底）
function prop(name) { try { const P = FUR.PROP; return P && typeof P[name] === 'function' ? P[name] : null; } catch (e) { return null; } }
// 顶点色烘焙（Batch 保留烘好的颜色）：白底材质 + 顶点色 = 任意色
const TINT = new Map();
function tint(geom, hex) {
  const key = geom.uuid + hex; let g = TINT.get(key);
  if (!g) { g = geom.clone(); const n = g.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); TINT.set(key, g); }
  return g;
}

/* ---------- 几何原型 ---------- */
const SPANDREL = () => G.extrude('spandrel', () => {
  const L = new THREE.Shape(); L.moveTo(-1, 0); L.lineTo(-1, 1); L.lineTo(0, 1); L.absarc(0, 0, 1, PI / 2, PI, false);
  const R = new THREE.Shape(); R.moveTo(1, 0); R.lineTo(1, 1); R.lineTo(0, 1); R.absarc(0, 0, 1, PI / 2, 0, true);
  return new THREE.ExtrudeGeometry([L, R], { depth: 1, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -0.5);
});
const ABACUS = () => G.extrude('abacus', () => {   // 科林斯柱头顶板：四边内凹
  const s = new THREE.Shape(); s.moveTo(1, -0.82); s.quadraticCurveTo(0.8, 0, 1, 0.82); s.lineTo(0.82, 1); s.quadraticCurveTo(0, 0.8, -0.82, 1); s.lineTo(-1, 0.82);
  s.quadraticCurveTo(-0.8, 0, -1, -0.82); s.lineTo(-0.82, -1); s.quadraticCurveTo(0, -0.8, 0.82, -1); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 6 }).rotateX(-PI / 2);
});
const ATTIC = () => G.lathe('atticBase', [[0, 0], [1.42, 0], [1.44, 0.08], [1.46, 0.18], [1.42, 0.28], [1.3, 0.34], [1.16, 0.4], [1.1, 0.52], [1.2, 0.6], [1.26, 0.66], [1.28, 0.74], [1.22, 0.82], [1.1, 0.88], [1.06, 1.0], [0, 1.0]], 24);
const BELL = () => G.lathe('corBell', [[0, 0], [0.6, 0], [0.63, 0.05], [0.63, 0.1], [0.585, 0.14], [0.6, 0.5], [0.65, 0.95], [0.72, 1.3], [0.8, 1.57], [0, 1.57]], 24);
const HALFDOME = () => G.extrude('halfDome', () => new THREE.SphereGeometry(1, 16, 6, PI, PI, 0, PI / 2));
const BARREL = () => G.extrude('barrel', () => new THREE.CylinderGeometry(1, 1, 1, 24, 1, false, -PI / 2, PI).rotateX(-PI / 2));

/* ================================================================
 * 墙：ax='x' 沿 x（位于 z=at），ax='z' 沿 z（位于 x=at）；u 沿墙，v = 相对楼面高度
 * 开洞 p = { c, w, bot, top, kind?: 'door'|'arch'|'blind'|'secret', arch?: 半圆拱头 }
 * ================================================================ */
function piece(b, key, o, ua, ub, ya, yb, ao) {
  if (ub - ua < 1e-3 || yb - ya < 1e-3) return;
  if (o.ax === 'x') b.bb(key, ua, ya, o.at - o.t / 2, ub, yb, o.at + o.t / 2, ao);
  else b.bb(key, o.at - o.t / 2, ya, ua, o.at + o.t / 2, yb, ub, ao);
}
const isHole = (p) => p.kind !== 'blind' && p.kind !== 'secret';
function solids(u0, u1, h, ops) {
  const out = []; let u = u0;
  for (const p of ops.filter(isHole).sort((a, c) => a.c - c.c)) {
    const a = Math.max(u0, p.c - p.w / 2), e = Math.min(u1, p.c + p.w / 2);
    if (e <= a + 1e-4) continue;
    if (a > u) out.push([u, a, 0, h]);
    if (p.bot > 0) out.push([a, e, 0, Math.min(p.bot, h)]);
    if (p.top < h) out.push([a, e, Math.max(p.top, 0), h]);
    u = Math.max(u, e);
  }
  if (u1 > u) out.push([u, u1, 0, h]);
  return out;
}
function spandrel(b, key, o, c, vSpring, r) {
  const g = SPANDREL();
  if (o.ax === 'x') b.put(key, g, c, vSpring, o.at, r, r, o.t, 0); else b.put(key, g, o.at, vSpring, c, r, r, o.t, -PI / 2);
}
function fullWall(b, o) {
  for (const [ua, ub, va, vb] of solids(o.u0, o.u1, o.h, o.open || [])) piece(b, o.mat, o, ua, ub, o.y + va, o.y + vb, o.ao);
  for (const p of o.open || []) if (p.arch && isHole(p) && p.top <= o.h + EPS) spandrel(b, o.mat, o, p.c, o.y + p.top - p.w / 2, p.w / 2);
}
// 剖切墙：1.2 m 以下进主批次并盖截面帽；tag 给定时，1.2 m 以上到 hTop 进 hi 子批次
function cutWall(b, o, tag, hTop) {
  const capK = mk('cap'), hi = tag ? SUB(b, tag) : null, top = hi ? Math.max(hTop, CUT + 0.1) : CUT;
  const capO = { ...o, t: Math.max(0.05, o.t - 0.02) };
  for (const [ua, ub, va, vb] of solids(o.u0, o.u1, top, o.open || [])) {
    if (va < CUT - 1e-4) {
      const l1 = Math.min(vb, CUT);
      piece(b, o.mat, o, ua, ub, o.y + va, o.y + l1);
      if (vb >= CUT - 1e-4) piece(b, capK, capO, ua + 0.01, ub - 0.01, o.y + CUT, o.y + CUT + 0.02);
    }
    if (hi && vb > CUT + 1e-4) {
      const a = Math.max(va, CUT);
      piece(hi, o.mat, o, ua, ub, o.y + a, o.y + vb);
      if (vb >= top - 1e-4) piece(hi, capK, capO, ua + 0.01, ub - 0.01, o.y + top, o.y + top + 0.02);
    }
  }
  // 洞口里的玻璃与拱头
  const g = { ...o, t: 0.06 };
  for (const p of o.open || []) {
    if (!isHole(p)) continue;
    if (p.kind !== 'door' && p.kind !== 'arch') {
      const lo = Math.max(p.bot, 0), l1 = Math.min(p.top, CUT);
      if (l1 > lo + 0.02) piece(b, 'glass', g, p.c - p.w / 2, p.c + p.w / 2, o.y + lo, o.y + l1 - 0.02);
      if (hi && p.top > CUT) { const a = Math.max(lo, CUT), e = Math.min(p.top, top); if (e > a + 0.02) piece(hi, 'glass', g, p.c - p.w / 2, p.c + p.w / 2, o.y + a, o.y + e); }
    }
    if (hi && p.arch && p.top - p.w / 2 >= CUT && p.top <= top + EPS) spandrel(hi, o.mat, o, p.c, o.y + p.top - p.w / 2, p.w / 2);
  }
}

/* ---------- 立面贴面构件：s = { ax, at, t, out }；u 沿墙，v = 世界 y，off = 离外表面距离（向外为正） ---------- */
function fp(b, key, s, u, v, du, dv, off, dd) {
  const n = s.at + s.out * (s.t / 2 + off);
  if (s.ax === 'x') b.box(key, u, v, n, du, dv, dd); else b.box(key, n, v, u, dd, dv, du);
}
function fr(b, key, s, u, v, du, dv, off, dd, ang) {   // 在墙面内旋转 ang（拱石）
  const n = s.at + s.out * (s.t / 2 + off);
  if (s.ax === 'x') b.put(key, G.box, u, v, n, du, dv, dd, 0, 0, ang); else b.put(key, G.box, n, v, u, du, dv, dd, -PI / 2, 0, ang);
}
function fg(b, key, geom, s, u, v, sx, sy, sz, off) {
  const n = s.at + s.out * (s.t / 2 + off);
  if (s.ax === 'x') b.put(key, geom, u, v, n, sx, sy, sz, 0); else b.put(key, geom, n, v, u, sx, sy, sz, -PI / 2);
}
// 沿外墙一段的条带（腰线、檐口层）：off0..off1 离外表面；两端各外伸 off1 包住转角
function band(b, key, s, u0, u1, ya, yb, off0, off1) {
  const n0 = s.at + s.out * (s.t / 2 + off0), n1 = s.at + s.out * (s.t / 2 + off1);
  const a = Math.min(n0, n1), e = Math.max(n0, n1);
  if (s.ax === 'x') b.bb(key, u0 - off1, ya, a, u1 + off1, yb, e); else b.bb(key, a, ya, u0 - off1, e, yb, u1 + off1);
}
function sidesOf(blk) {
  const { x0, x1, z0, z1, t } = blk;
  return {
    S: { ax: 'x', at: z1, u0: x0 - t / 2, u1: x1 + t / 2, out: 1, t },
    N: { ax: 'x', at: z0, u0: x0 - t / 2, u1: x1 + t / 2, out: -1, t },
    E: { ax: 'z', at: x1, u0: z0 + t / 2, u1: z1 - t / 2, out: 1, t },
    W: { ax: 'z', at: x0, u0: z0 + t / 2, u1: z1 - t / 2, out: -1, t },
  };
}

/* ================================================================
 * 立面开洞表
 * ================================================================ */
const WING_X = [0, 1, 2, 3, 4, 5, 6].map((k) => 22.43 + 4.857 * k);   // 两翼 7 开间，中心 x ±37
const BAY9 = [-16.8, -12.6, -8.4, -4.2, 0, 4.2, 8.4, 12.6, 16.8];
const blockById = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));
const floorH = (blk, fi) => (blk.hs ? blk.hs[blk.floors.indexOf(fi)] : FLOORS[fi].h);
function rawFacade(bid, side, fi) {
  const W = (c, o = {}) => ({ c, ...o });
  // 各层窗型（相对楼面）
  const F1 = { w: 1.8, bot: 0.8, top: 4.0, arch: true }, F2 = { w: 1.6, bot: 0.6, top: 3.4 }, F3 = { w: 1.6, bot: 0.8, top: 3.0 }, F4 = { w: 1.0, bot: 0.95, top: 1.75 };
  const byFi = [F1, F2, F3, F4][fi];
  const noble = (list) => list.map((p, i) => ({ ...p, ped: i % 2 ? 'seg' : 'tri' }));
  if (bid === 'A') {
    if (fi === 3) {   // F4：只在檐壁开小窗；正面不开
      if (side === 'S') return [];
      if (side === 'N') return BAY9.map((c) => W(c, F4));
      return [17, 7, -2, -10, -18].map((c) => W(c, F4));
    }
    if (side === 'S') {
      const xs = [-17.75, -10.5, -5.5, 0, 5.5, 10.5, 17.75];
      let l = xs.map((c) => W(c, byFi));
      if (fi === 0) l = l.map((p) => (p.c === 0 ? { ...p, w: 2.4, bot: 0, top: 4.0, kind: 'door' } : p));
      if (fi === 1) l = noble(l).map((p) => ({ ...p, balcony: Math.abs(p.c) > 15 }));
      return l;
    }
    if (side === 'N') {
      let l = BAY9.map((c) => W(c, byFi));
      if (fi === 0) { l = l.map((p) => (Math.abs(p.c) < 5 ? { ...p, bot: 0, kind: 'door' } : p)); l.push({ c: -9.4, w: 1.0, bot: 0, top: 2.4, kind: 'secret' }); }   // 花园厅落地窗；主人通道暗门
      if (fi === 1) l = noble(l).map((p) => ({ ...p, balcony: p.c === 0 }));
      return l;
    }
    const l = [-19, 19].map((c) => W(c, byFi));   // 侧墙外露段
    return fi === 1 ? noble(l) : l;
  }
  if (bid === 'BW' || bid === 'BE') {
    const sg = bid === 'BW' ? -1 : 1, outer = bid === 'BW' ? 'W' : 'E';
    if (side === 'S' || side === 'N') {
      let l = WING_X.map((x) => W(sg * x, byFi));
      if (fi === 1) l = noble(l).map((p) => ({ ...p, balcony: side === 'S' && Math.abs(Math.abs(p.c) - 37) < 0.1 }));
      return l;
    }
    if (side === outer) {
      const l = [-11.5, -6.5, 6.5, 11.5].map((c) => W(c, byFi));
      if (fi === 0) l.push({ c: 0, w: 2.2, bot: 0, top: 3.6, kind: 'door', arch: true });
      if (fi === 2) l.push(W(0, byFi));
      return fi === 1 ? noble(l.sort((a, c) => a.c - c.c)) : l;
    }
    return [];
  }
  if (bid === 'C') {
    const P = fi === 0 ? { w: 1.8, bot: 0.8, top: 4.0, arch: true } : { w: 1.8, bot: 1.0, top: 4.8, arch: true };
    if (side === 'S' || side === 'N') return [-96, -90, -84].map((c) => W(c, P));
    if (side === 'W') return [-6, 0, 6].map((c) => W(c, P));
    return fi === 0 ? [W(-6, P), { c: 0, w: 2.2, bot: 0, top: 3.6, kind: 'door', arch: true }, W(6, P)] : [W(-6, P), W(6, P)];
  }
  if (bid === 'D') {
    const P = { w: 2.2, bot: 2.4, top: 8.8, arch: true }, Dr = { w: 2.8, bot: 0, top: 5.2, kind: 'door', arch: true };
    if (side === 'S') return [W(83, P), { c: 90, ...Dr }, W(97, P)];
    if (side === 'N') return [{ c: 90, w: 12, bot: 0, top: 9.0, kind: 'arch', arch: true }];   // 后殿拱口
    if (side === 'E') return [-10, -3.3, 3.3, 10].map((c) => W(c, P));
    return [W(-10, P), { c: 0, w: 2.2, bot: 0, top: 3.6, kind: 'door', arch: true }, W(10, P)];
  }
  return [];
}

/* ================================================================
 * 平面推导：房间矩形 → 内墙（带门）、外墙段、房间隔断、墙交点（盲窗判定）
 * ================================================================ */
let ROOMS_OF = null;
export function setRooms(fn) { ROOMS_OF = fn; LAYOUT.length = 0; }
const roomsOf = (fi) => (ROOMS_OF ? ROOMS_OF(fi) : ROOMS.filter((r) => r.floor === fi));
const inside = (r, blk) => r[0] >= blk.x0 - EPS && r[1] <= blk.x1 + EPS && r[2] >= blk.z0 - EPS && r[3] <= blk.z1 + EPS;
const blockOf = (r) => BLOCKS.find((b) => inside(r, b));
const overlap = (a, b) => a[0] < b[1] - EPS && b[0] < a[1] - EPS && a[2] < b[3] - EPS && b[2] < a[3] - EPS;
function roomH(r) {
  if (r.floor === 4) return r.id === '502' ? 6 : 3.2;
  const blk = blockOf(r.r); return blk ? floorH(blk, r.floor) : FLOORS[r.floor].h;
}
const HUB = new Set(['101', '106', '108', '115', '121', '201', '205', '207', '214', '221', '305', '307', '314', '319', '407']);
const HUB_STRICT = new Set(['108', '207', '307', '201']);   // 楼梯厅 / 楼座只接走廊
const EXTRA = new Set(['110|S', '109|110', '112|107', '113|114', '119|120', '203|204', '209|S', '215|216', '212|213', '303|304', '309|S', '310|311', '315|316', '312|313', '317|318', '401|402', '403|404', '405|406', '408|409', '412|S'].map((k) => k.split('|').sort().join('|')));
const DOOR_SPEC0 = {
  '101|106': { w: 6, top: 4.2, kind: 'arch' }, '106|107': { w: 2.4, top: 3.4 }, '106|108': { w: 3.2, top: 3.6, kind: 'arch' },
  '106|115': { w: 2.2, top: 3.2 }, '106|121': { w: 2.2, top: 3.2 }, '205|207': { w: 3.2, top: 3.4, kind: 'arch' }, '305|307': { w: 3.2, top: 3.4, kind: 'arch' },
  '201|205': { w: 2.4, top: 2.8 }, '112|107': { w: 1.0, top: 2.4 },
  '205|214': { w: 1.8, top: 3.0 }, '205|221': { w: 1.8, top: 3.0 }, '305|314': { w: 1.8, top: 3.0 }, '305|319': { w: 1.8, top: 3.0 },
};
const DOOR_SPEC = Object.fromEntries(Object.entries(DOOR_SPEC0).map(([k, v]) => [k.split('|').sort().join('|'), v]));
const idOf = (q) => q.id;
const shaftOf = (id) => (id === '109' || id === 'S' || id === '505' ? 'service' : id === '112' || id === '310' || id === 'M' || id === '503' ? 'master' : null);
function doorFor(A, B, fi, len, ax, at) {
  if (!A || !B) return null;
  const a = A.id, b = B.id, key = [a, b].sort().join('|');
  for (const q of [A, B]) if (q.shaft && !(q.shaft.stops || []).includes(fi)) return null;
  let ok = EXTRA.has(key);
  if (!ok) {
    const ha = HUB.has(a), hb = HUB.has(b);
    if (ha && hb) ok = true;
    else if (ax === 'z' && Math.abs(at) === 20) ok = false;   // 主楼与两翼交界只在走廊相通
    else if (ha || hb) { const hub = ha ? a : b, other = ha ? B : A; ok = !HUB_STRICT.has(hub) && !(other.room && other.room.void) && shaftOf(other.id) !== 'master'; }
  }
  if (!ok) return null;
  const sp = DOOR_SPEC[key] || {};
  const w = Math.min(sp.w || 1.4, len - 0.6);
  return w > 0.7 ? { w, bot: 0, top: sp.top || 2.6, kind: sp.kind || 'door' } : null;
}
function wallT(ax, at, A, B, fi) {
  const ba = blockOf(A.r), bb = blockOf(B.r);
  if (ba !== bb) return 0.9;
  const a = Math.abs(at);
  if (ba && ba.id === 'A') {
    if ((ax === 'z' && a === 12) || (ax === 'x' && (at === 2 || at === -6))) return 0.6;
    if (fi === 3 && ((ax === 'z' && a === 8) || (ax === 'x' && at === 10))) return 0.6;
  }
  if (ba && (ba.id === 'BW' || ba.id === 'BE') && ax === 'x' && a === 2) return 0.6;
  return 0.3;
}
function rectsOf(fi) {
  const rooms = roomsOf(fi).filter((r) => !r.container && !r.round);
  const list = rooms.map((r) => ({ id: r.id, r: r.r, room: r, shaft: null }));
  for (const s of SHAFTS) {
    if (s.id !== 'service' && s.id !== 'master') continue;
    if (!(s.floors || []).includes(fi)) continue;
    const own = rooms.find((r) => r.r.join() === s.r.join());
    if (own) { list.find((q) => q.room === own).shaft = s; continue; }
    if (!rooms.some((r) => overlap(r.r, s.r))) list.push({ id: s.id === 'service' ? 'S' : 'M', r: s.r, room: null, shaft: s });
  }
  return list;
}
function partsOf(room) {
  const out = [], P = room.parts || {};
  for (const [kind, v] of Object.entries(P)) {
    if (!Array.isArray(v) || !v.length) continue;
    const list = Array.isArray(v[0]) ? v : [v];
    for (const r of list) out.push({ kind, r });
  }
  return out;
}
// 同一直线上按区间归并：items = [{ ua, ub, side: -1|1, q }] → 段 [{ ua, ub, neg, pos }]
function sweep(items) {
  const pts = [...new Set(items.flatMap((s) => [s.ua, s.ub]))].sort((a, b) => a - b), segs = [];
  let cur = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], e = pts[i + 1], m = (a + e) / 2;
    const neg = (items.find((s) => s.side < 0 && s.ua <= m && s.ub >= m) || {}).q || null;
    const pos = (items.find((s) => s.side > 0 && s.ua <= m && s.ub >= m) || {}).q || null;
    if (!neg && !pos) { cur = null; continue; }
    if (cur && cur.neg === neg && cur.pos === pos && Math.abs(cur.ub - a) < EPS) cur.ub = e;
    else { cur = { ua: a, ub: e, neg, pos }; segs.push(cur); }
  }
  return segs;
}
function edgesOf(q, add) {
  const [x0, x1, z0, z1] = q.r;
  add('x', z0, x0, x1, 1, q); add('x', z1, x0, x1, -1, q); add('z', x0, z0, z1, 1, q); add('z', x1, z0, z1, -1, q);
}
const sideName = (ax, sgn) => (ax === 'x' ? (sgn > 0 ? '-z' : '+z') : (sgn > 0 ? '-x' : '+x'));   // 房间在线的 + 侧 → 这条线是它的 −边
const LAYOUT = [];
function layout(fi) {
  if (LAYOUT[fi]) return LAYOUT[fi];
  const L = { walls: [], parts: [], J: [], room: {} };
  LAYOUT[fi] = L;
  if (fi === 4) return L;
  const rects = rectsOf(fi), lines = new Map();
  const add = (ax, at, ua, ub, side, q) => { const k = ax + '|' + at; let l = lines.get(k); if (!l) lines.set(k, l = []); l.push({ ua, ub, side, q }); };
  rects.forEach((q) => edgesOf(q, add));
  const R = (q) => (q && q.room ? (L.room[q.id] || (L.room[q.id] = { ops: [], t: {}, ext: new Set() })) : null);
  // 1. 墙段
  for (const [k, items] of lines) {
    const [ax, s] = k.split('|'), at = +s;
    for (const g of sweep(items)) {
      const w = { ax, at, u0: g.ua, u1: g.ub, neg: g.neg, pos: g.pos, open: [] };
      if (g.neg && g.pos) { w.t = wallT(ax, at, g.neg, g.pos, fi); w.ext = false; }
      else {
        const q = g.neg || g.pos, blk = blockOf(q.r);
        w.t = blk ? blk.t : 0.9; w.ext = true; w.blk = blk;
        w.sideOfRoom = sideName(ax, g.pos ? 1 : -1);
        w.face = ax === 'x' ? (g.pos ? 'N' : 'S') : (g.pos ? 'W' : 'E');
      }
      L.walls.push(w);
    }
  }
  // 2. 房间隔断（套间的浴室 / 更衣 / 马桶间 / 光井）
  for (const q of rects) {
    if (!q.room) continue;
    const parts = partsOf(q.room).filter((p) => p.kind !== 'gallery'), pl = new Map();
    if (!parts.length) continue;
    const hasDress = parts.some((p) => p.kind === 'dress');
    const addp = (ax, at, ua, ub, side, pq) => { const [x0, x1, z0, z1] = q.r; if (ax === 'x' && (Math.abs(at - z0) < EPS || Math.abs(at - z1) < EPS)) return; if (ax === 'z' && (Math.abs(at - x0) < EPS || Math.abs(at - x1) < EPS)) return; const k = ax + '|' + at; let l = pl.get(k); if (!l) pl.set(k, l = []); l.push({ ua, ub, side, q: pq }); };
    parts.forEach((p) => edgesOf(p, addp));
    for (const [k, items] of pl) {
      const [ax, s] = k.split('|'), at = +s;
      for (const g of sweep(items)) {
        const ka = g.neg ? g.neg.kind : 'rest', kb = g.pos ? g.pos.kind : 'rest', pair = [ka, kb].sort().join('|');
        let door = !(ka === 'wc' && kb === 'wc') && ka !== 'void' && kb !== 'void';
        if (hasDress && (pair === 'bath|bed' || pair === 'bath|rest')) door = false;
        const len = g.ub - g.ua, w = { ax, at, u0: g.ua, u1: g.ub, t: ka === 'void' || kb === 'void' ? 0.2 : 0.15, open: [], room: q.room };
        if (door && len > 1.3) w.open.push({ c: (g.ua + g.ub) / 2, w: Math.min(0.9, len - 0.4), bot: 0, top: 2.3, kind: 'door' });
        L.parts.push(w);
      }
    }
  }
  // 3. 墙交点（内墙 / 隔断的端点落在外墙线上）
  for (const w of L.walls.concat(L.parts)) if (!w.ext) for (const e of [w.u0, w.u1]) L.J.push({ ax: w.ax === 'x' ? 'z' : 'x', at: e, u: w.at, t: w.t });
  // 4. 开洞
  for (const w of L.walls) {
    if (!w.ext) {
      const d = doorFor(w.neg, w.pos, fi, w.u1 - w.u0, w.ax, w.at);
      if (d) w.open.push({ c: (w.u0 + w.u1) / 2, ...d });
    } else if (w.blk) w.open = facadeOps(w.blk.id, w.face, fi).filter((p) => p.c > w.u0 - EPS && p.c < w.u1 + EPS);
    // 记到房间
    for (const [q, sgn] of [[w.neg, -1], [w.pos, 1]]) {
      const rr = R(q); if (!rr) continue;
      const side = sideName(w.ax, sgn);
      rr.t[side] = Math.max(rr.t[side] || 0, w.t);
      if (w.ext) rr.ext.add(side);
      for (const p of w.open) if (isHole(p)) rr.ops.push({ side, a: p.c - p.w / 2, b: p.c + p.w / 2, bot: p.bot, top: p.top, kind: p.kind || 'window' });
    }
  }
  return L;
}
// 立面开洞（与内墙相撞的改为盲窗）
function facadeOps(bid, side, fi) {
  const blk = blockById[bid], raw = rawFacade(bid, side, fi);
  const L = fi < 4 && blk.floors.includes(fi) ? layout(fi) : null;
  const S = sidesOf(blk)[side];
  return raw.map((p) => {
    if (!L || !isHole(p) || p.w > 6) return p;
    const hit = L.J.some((j) => j.ax === S.ax && Math.abs(j.at - S.at) < 0.01 && Math.abs(j.u - p.c) < p.w / 2 + j.t / 2 + 0.08);
    return hit ? { ...p, kind: 'blind', balcony: false } : p;
  });
}
// 外墙外露段（体块相接处不算）
function extRanges(blk, side, fi) {
  const s = sidesOf(blk)[side];
  if (blk.id === 'BW' && side === 'E') return [];
  if (blk.id === 'BE' && side === 'W') return [];
  if ((blk.id === 'BW' || blk.id === 'BE') && (side === 'S' || side === 'N')) return blk.id === 'BW' ? [[s.u0, -20.45]] : [[20.45, s.u1]];
  if (blk.id === 'A' && (side === 'E' || side === 'W') && fi <= 2) return [[s.u0, -16.45], [16.45, s.u1]];
  return [[s.u0, s.u1]];
}

/* ================================================================
 * 窗、门装饰（外观）
 * ================================================================ */
function deco(b, s, p, y, style) {
  const H = p.top - p.bot, vb = y + p.bot, vt = y + p.top, w = p.w, vm = (vb + vt) / 2, r = w / 2;
  const T = 'trim', FR = 'frame';
  if (p.kind === 'secret') {   // 暗门：只在石缝上留一圈细线
    for (const du of [-w / 2, w / 2]) fp(b, 'trimShade', s, p.c + du, vb + H / 2, 0.02, H, 0.004, 0.02);
    fp(b, 'trimShade', s, p.c, vt, w + 0.02, 0.02, 0.004, 0.02); return;
  }
  if (p.kind === 'blind') {
    fp(b, 'trimShade', s, p.c, p.arch ? (vb + vt - r) / 2 : vm, w, p.arch ? H - r : H, -0.1, 0.04);
  } else if (p.kind === 'door') {
    const dh = Math.min(H - (p.arch ? r : 0), 3.4), wood = mk('mahogany');
    fp(b, wood, s, p.c, vb + dh / 2, w, dh, -0.42, 0.1);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) fp(b, wood, s, p.c + sx * w / 4, vb + 0.35 + i * (dh - 0.5) / 3 + (dh - 0.5) / 6, w / 2 - 0.2, (dh - 0.5) / 3 - 0.14, -0.36, 0.02);
    fp(b, FR, s, p.c, vb + dh / 2, 0.06, dh, -0.36, 0.05);
    for (const sx of [-1, 1]) fp(b, mk('brass'), s, p.c + sx * 0.12, vb + 1.1, 0.05, 0.3, -0.34, 0.05);
    if (H > dh + 0.2) { fp(b, 'glass', s, p.c, (vb + dh + vt) / 2, w, vt - vb - dh, -0.4, 0.05); fp(b, FR, s, p.c, vb + dh + 0.05, w, 0.1, -0.37, 0.08); fp(b, FR, s, p.c, vb + dh + (H - dh) / 2, 0.06, H - dh, -0.37, 0.05); }
  } else if (p.kind !== 'arch') {
    fp(b, 'glass', s, p.c, vm, w, H, -0.32, 0.05);
    const fo = -0.29;
    fp(b, FR, s, p.c, vb + 0.05, w, 0.1, fo, 0.08);
    fp(b, FR, s, p.c - w / 2 + 0.05, vm, 0.1, H, fo, 0.08); fp(b, FR, s, p.c + w / 2 - 0.05, vm, 0.1, H, fo, 0.08);
    fp(b, FR, s, p.c, p.arch ? (vb + vt - r) / 2 : vm, 0.06, p.arch ? H - r : H, fo + 0.01, 0.05);
    const hs = p.arch ? H - r : H, bars = Math.max(1, Math.round(hs / 0.7));
    for (let i = 1; i < bars; i++) fp(b, FR, s, p.c, vb + hs * i / bars, w, 0.045, fo + 0.01, 0.05);
    if (p.arch) { fp(b, FR, s, p.c, vt - r, w, 0.08, fo, 0.08); for (const a of [PI / 4, PI / 2, 3 * PI / 4]) fr(b, FR, s, p.c + Math.cos(a) * r / 2, vt - r + Math.sin(a) * r / 2, 0.04, r, fo + 0.01, 0.04, a - PI / 2); }
    else fp(b, FR, s, p.c, vt - 0.05, w, 0.1, fo, 0.08);
  }
  // 窗套
  if (style === 'rustic' || style === 'hall') {
    if (p.arch) {   // 拱石 ×5 + 拱心石、拱脚垫石
      const R0 = r + 0.26, cy = vt - r;
      for (const a of [PI / 6, PI / 3, 2 * PI / 3, 5 * PI / 6]) fr(b, T, s, p.c + Math.cos(a) * R0, cy + Math.sin(a) * R0, 0.36, 0.52, 0.05, 0.12, a - PI / 2);
      fr(b, T, s, p.c, cy + R0 + 0.06, 0.46, 0.7, 0.09, 0.2, 0);
      for (const sx of [-1, 1]) fp(b, T, s, p.c + sx * (r + 0.2), cy - 0.08, 0.5, 0.18, 0.06, 0.14);
    } else fp(b, T, s, p.c, vt + 0.1, w + 0.3, 0.2, 0.04, 0.1);
    if (p.bot > 0) fp(b, T, s, p.c, vb - 0.07, w + 0.5, 0.14, 0.1, 0.26);
  } else if (style === 'noble' || style === 'plain' || style === 'frieze') {
    const aw = style === 'frieze' ? 0.12 : 0.22;
    fp(b, T, s, p.c - w / 2 - aw / 2, vm + aw / 2, aw, H + aw, 0.04, 0.1);
    fp(b, T, s, p.c + w / 2 + aw / 2, vm + aw / 2, aw, H + aw, 0.04, 0.1);
    fp(b, T, s, p.c, vt + aw / 2, w + aw * 2, aw, 0.04, 0.1);
    if (p.bot > 0 && style !== 'frieze') fp(b, T, s, p.c, vb - 0.07, w + 0.5, 0.14, 0.1, 0.26);
    if (style === 'noble') {
      fp(b, T, s, p.c, vt + 0.36, w + 0.9, 0.14, 0.12, 0.34);   // 窗楣檐口
      if (p.ped === 'tri') fg(b, T, G.prism(), s, p.c, vt + 0.43, w + 0.9, 0.55, 0.3, 0.12);
      else fg(b, T, G.seg(), s, p.c, vt + 0.43, (w + 0.9) / 2, 0.45, 0.3, 0.12);
      for (const sx of [-1, 1]) fp(b, T, s, p.c + sx * (w / 2 + 0.3), vt + 0.12, 0.16, 0.34, 0.14, 0.2);   // 托架
      if (p.balcony && p.kind !== 'blind') {
        fp(b, T, s, p.c, y - 0.1, w + 0.9, 0.2, 0.45, 0.9);
        fp(b, T, s, p.c, y - 0.28, w + 0.5, 0.16, 0.3, 0.6);
        const n = s.at + s.out * (s.t / 2 + 0.82);
        for (let i = 0; i <= 5; i++) { const u = p.c - (w + 0.6) / 2 + (w + 0.6) * i / 5; b.inst('baluster', s.ax === 'x' ? mat4(u, y, n, 0.7, 0.9, 0.7) : mat4(n, y, u, 0.7, 0.9, 0.7)); }
        fp(b, T, s, p.c, y + 0.86, w + 0.9, 0.1, 0.82, 0.2);
        for (const du of [-(w + 0.9) / 2 + 0.05, (w + 0.9) / 2 - 0.05]) fp(b, T, s, p.c + du, y + 0.43, 0.14, 0.86, 0.45, 0.8);
      }
    }
  }
}
function pilasterSeg(b, s, u, y0, y1, o = {}) {
  const w = o.w || 0.9;
  fp(b, 'trim', s, u, (y0 + y1) / 2, w, y1 - y0, 0, 0.3);
  if (o.base) { fp(b, 'trim', s, u, y0 + 0.16, w + 0.24, 0.32, 0.06, 0.42); fp(b, 'trim', s, u, y0 + 0.38, w + 0.12, 0.13, 0.04, 0.38); }
  if (o.cap) {   // 柱头块 0.9：柱颈、钟身、顶板
    fp(b, 'trim', s, u, y1 - 0.84, w + 0.08, 0.1, 0.02, 0.34);
    fp(b, 'trim', s, u, y1 - 0.45, w + 0.14, 0.62, 0.05, 0.38);
    fp(b, 'trim', s, u, y1 - 0.08, w + 0.36, 0.16, 0.1, 0.5);
    for (const sx of [-1, 1]) fp(b, 'trim', s, u + sx * (w / 2 + 0.02), y1 - 0.3, 0.16, 0.2, 0.2, 0.18);
  }
}

/* ================================================================
 * 柱
 * ================================================================ */
const PC = [-13, -8, -3, 3, 8, 13], PZ = 28.3, PR = 0.675, PRT = 0.574;
const P_BASE = 1.2 + 0.3, P_SHAFT0 = P_BASE + PR, P_SHAFT1 = ENTAB[0] - 1.57 - 0.2;   // 柱座顶 1.5 · 柱身 2.175 → 12.93 · 柱头 12.93 → 14.7
function pr(y) { const e = P_SHAFT0 + (P_SHAFT1 - P_SHAFT0) / 3; return y <= e ? PR : PR - (PR - PRT) * ((y - e) / (P_SHAFT1 - e)) ** 1.3; }
function corinthianSeg(b, x, z, ya, yb) {   // 门廊柱在 [ya, yb] 楼层带内的一段
  const k = new Kit(b, x, 0, z);
  if (ya <= 1.2 + EPS) { k.bx('trim', 0, 1.2, 0, 1.89, 0.3, 1.89); k.geo('trim', ATTIC(), 0, P_BASE, 0, PR, PR, PR); }
  const s0 = Math.max(ya, P_SHAFT0), s1 = Math.min(yb, P_SHAFT1);
  if (s1 > s0) k.cyl('trim', 0, s0, 0, pr(s0), s1 - s0, 28, pr(s1) / pr(s0));
  if (yb >= ENTAB[0] - EPS) {
    const y0 = P_SHAFT1;
    k.geo('trim', BELL(), 0, y0, 0, 1, 1, 1);
    for (const [ring, rr, yy, n0] of [[0, PRT * 1.05, 0.42, 0], [1, PRT * 1.15, 0.92, 0.5]]) {
      for (let i = 0; i < 8; i++) {
        const a = (i + n0) * PI / 4, R0 = rr + 0.04;
        k.geo('trim', G.sph(8, 6), Math.sin(a) * R0, y0 + yy, Math.cos(a) * R0, 0.2, 0.34, 0.08, a, 0.28);
        k.geo('trim', G.sph(6, 4), Math.sin(a) * (R0 + 0.12), y0 + yy + 0.3, Math.cos(a) * (R0 + 0.12), 0.13, 0.08, 0.1, a, 0.9);
      }
    }
    for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; k.geo('trim', G.sph(8, 6), Math.sin(a) * 0.86, y0 + 1.38, Math.cos(a) * 0.86, 0.13, 0.15, 0.13); }
    k.geo('trim', ABACUS(), 0, ENTAB[0] - 0.2, 0, 1, 0.2, 1);
    for (let i = 0; i < 4; i++) { const a = i * PI / 2; k.geo('trim', G.sph(8, 6), Math.sin(a) * 0.86, ENTAB[0] - 0.1, Math.cos(a) * 0.86, 0.1, 0.1, 0.06, a); }
  }
}
function ionic(b, x, z, y0, y1, r, key = 'trim', ry = 0) {
  const k = new Kit(b, x, 0, z, ry), T = 'trim';
  k.bx(T, 0, y0, 0, r * 2.9, 0.18, r * 2.9);
  k.geo(T, ATTIC(), 0, y0 + 0.18, 0, r, r * 0.8, r);
  const ye = y1 - r * 1.1;
  k.cyl(key, 0, y0 + 0.18 + r * 0.8, 0, r, ye - (y0 + 0.18 + r * 0.8), 20, 0.86);
  const rt = r * 0.86;
  k.geo(T, G.tor(TAU, 6, 20, 0.25), 0, ye + 0.04, 0, rt * 1.05, rt, rt * 1.05);
  k.cyl(T, 0, ye + 0.08, 0, rt * 1.1, r * 0.45, 16, 1.18);
  for (const sx of [-1, 1]) k.geo(T, G.cyl(14), sx * rt * 1.25, ye + r * 0.55, 0, rt * 0.4, rt * 2.2, rt * 0.4, 0, PI / 2);
  k.bx(T, 0, ye + r * 0.55, 0, rt * 2.6, r * 0.25, rt * 1.6);
  k.bx(T, 0, ye + r * 0.8, 0, r * 2.5, r * 0.3, r * 2.5);
}
function stub(b, x, z, y, r, seg = 18, key = 'trim') {
  b.put(key, G.cyl(seg), x, y + CUT / 2, z, r, CUT, r);
  b.put(mk('cap'), G.cyl(seg), x, y + CUT + 0.01, z, r * 0.98, 0.02, r * 0.98);
}

/* ================================================================
 * 栏杆（site.js 也用）：底座 + 实例化瓶柱 + 扶手；opt.posts 每隔多少米一个墩
 * ================================================================ */
function balustrade(b, x0, z0, x1, z1, y, h = 1.1, opt = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.3) return;
  const ang = Math.atan2(z1 - z0, x1 - x0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
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
// 锻铁栏杆（楼梯井、楼座）：铁立杆 + 扶手 + 鎏金小饰
function ironRail(b, x0, z0, x1, z1, y, h = 1.0, gilt = true) {
  const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.2) return;
  const ang = -Math.atan2(z1 - z0, x1 - x0), n = Math.max(2, Math.round(L / 0.14));
  b.put(mk('mahogany'), G.box, (x0 + x1) / 2, y + h, (z0 + z1) / 2, L, 0.07, 0.08, ang);
  b.put('iron', G.box, (x0 + x1) / 2, y + 0.08, (z0 + z1) / 2, L, 0.04, 0.05, ang);
  for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; b.bb('iron', x - 0.012, y + 0.08, z - 0.012, x + 0.012, y + h, z + 0.012); }
  if (gilt) { const f = SUB(b, 'fine'); for (let i = 1; i < n; i += 4) { const t = i / n; f.put(mk('ormolu'), G.sph(6, 4), x0 + (x1 - x0) * t, y + h * 0.55, z0 + (z1 - z0) * t, 0.09, 0.12, 0.09); } }
}
// 斜向扶手（楼梯段）：沿 z 或沿 x
function slopeRail(b, ax, fixed, ua, ub, ya, yb, h = 0.95) {
  const L = Math.hypot(ub - ua, yb - ya), ang = Math.atan2(yb - ya, Math.abs(ub - ua)), dir = Math.sign(ub - ua);
  const um = (ua + ub) / 2, ym = (ya + yb) / 2 + h, M = mk('mahogany');
  if (ax === 'z') b.put(M, G.box, fixed, ym, um, 0.08, 0.07, L, 0, dir < 0 ? ang : -ang);
  else b.put(M, G.box, um, ym, fixed, L, 0.07, 0.08, 0, 0, dir < 0 ? -ang : ang);
}

/* ================================================================
 * 外壳（full）
 * ================================================================ */
function wallMat(blk, fi) { return fi === 0 && blk.id !== 'D' ? 'rustic' : 'stone'; }
function styleOf(blk, fi) { if (blk.id === 'D' || blk.id === 'C') return fi === 0 && blk.id === 'C' ? 'rustic' : 'hall'; return ['rustic', 'noble', 'plain', 'frieze'][fi]; }
function shell(full) {
  for (const blk of BLOCKS) for (const fi of blk.floors) {
    if (blk.id === 'A' && fi === 3) continue;   // F4 外墙 = 檐部，见 entablature()
    const b = full[fi], y = FLOORS[fi].y, h = floorH(blk, fi), SS = sidesOf(blk), style = styleOf(blk, fi);
    for (const side of ['S', 'N', 'E', 'W']) {
      const s = SS[side], ops = facadeOps(blk.id, side, fi);
      for (const [u0, u1] of extRanges(blk, side, fi)) {
        const open = ops.filter((p) => p.c > u0 && p.c < u1);
        fullWall(b, { ...s, u0, u1, y, h, open, mat: wallMat(blk, fi), ao: fi === 0 ? [y, 3, 0.8] : null });
        for (const p of open) deco(b, s, p, y, style);
        // 腰线与隅石
        if (blk.id === 'A' || blk.id === 'BW' || blk.id === 'BE') {
          if (fi === 0) { band(b, 'trim', s, u0, u1, y + h - 0.42, y + h, 0, 0.24); band(b, 'trim', s, u0, u1, y + h - 0.54, y + h - 0.42, 0, 0.12); }
          if (fi === 1) band(b, 'trim', s, u0, u1, y + h - 0.2, y + h, 0, 0.1);
        }
        if (blk.id === 'C') { if (fi === 0) band(b, 'trim', s, u0, u1, y + h - 0.4, y + h, 0, 0.22); }
      }
    }
    // 壁柱（F2–F3 巨柱式；主楼门廊后 x ±13 从 F1 起）
    if (blk.id === 'A' && fi <= 2) {
      const P = []; const top = ENTAB[0];
      if (fi >= 1) { P.push(['S', -20.0], ['S', 20.0], ['N', -20.0], ['N', 20.0], ['E', 21.1], ['E', -21.1], ['W', 21.1], ['W', -21.1]); }
      P.push(['S', -13], ['S', 13]);
      for (const [sd, u] of P) {
        const s = SS[sd], y0 = sd === 'S' && Math.abs(u) === 13 ? 1.2 : 5.7;
        if (y + FLOORS[fi].h <= y0 + EPS) continue;
        pilasterSeg(b, s, u, Math.max(y, y0), Math.min(y + FLOORS[fi].h, top), { base: y <= y0 + EPS, cap: fi === 2 });
      }
    }
    if ((blk.id === 'BW' || blk.id === 'BE') && fi >= 1) {
      const sg = blk.id === 'BW' ? -1 : 1, top = 13.8, outer = blk.id === 'BW' ? 'W' : 'E';
      const P = [['S', sg * 20.95], ['N', sg * 20.95], ['S', sg * 53.55], ['S', sg * 52.35], ['N', sg * 53.55], ['N', sg * 52.35], [outer, 15.55], [outer, 14.35], [outer, -15.55], [outer, -14.35]];
      for (const [sd, u] of P) pilasterSeg(b, SS[sd], u, y, Math.min(y + FLOORS[fi].h, top), { base: fi === 1, cap: fi === 2 });
    }
    if (blk.id === 'C' && fi === 1) for (const [sd, us] of [['S', [-101.2, -100, -80, -78.8]], ['N', [-101.2, -100, -80, -78.8]], ['E', [-11.2, -10, 10, 11.2]], ['W', [-11.2, -10, 10, 11.2]]]) for (const u of us) pilasterSeg(b, SS[sd], u, y, y + h - 0.9, { base: true, cap: true, w: 0.7 });
    if (blk.id === 'D') for (const [sd, us] of [['S', [78.9, 86.5, 93.5, 101.1]], ['E', [-15.1, -6.6, 0, 6.6, 15.1]], ['W', [-15.1, -5, 5, 15.1]]]) for (const u of us) pilasterSeg(b, SS[sd], u, y, y + h - 1.1, { base: true, cap: true, w: 0.9 });
  }
}

/* ---------- 檐部（主楼 F4 外墙 = 额枋 + 檐壁 + 檐口 + 挡檐墙） ---------- */
function entablature(b) {
  const blk = blockById.A, SS = sidesOf(blk), y = FLOORS[3].y, h = FLOORS[3].h;
  for (const side of ['S', 'N', 'E', 'W']) {
    const s = SS[side], ops = facadeOps('A', side, 3);
    fullWall(b, { ...s, u0: s.u0, u1: s.u1, y, h, open: ops, mat: 'stone' });
    for (const p of ops) deco(b, s, p, y, 'frieze');
    const u0 = s.u0, u1 = s.u1;
    band(b, 'trim', s, u0, u1, 14.7, 15.0, 0, 0.04); band(b, 'trim', s, u0, u1, 15.0, 15.3, 0, 0.08); band(b, 'trim', s, u0, u1, 15.3, 15.52, 0, 0.12);
    band(b, 'trim', s, u0, u1, 15.52, 15.6, 0, 0.18);                 // 额枋三道面 + 冠线
    band(b, 'trim', s, u0, u1, 16.5, 16.66, 0, 0.26);                // 檐口：托线
    band(b, 'trim', s, u0, u1, 16.66, 16.84, 0, 0.36);
    band(b, 'trim', s, u0, u1, 16.84, 17.3, 0, 1.2);                 // 挑檐（出挑 1.2）
    band(b, 'trim', s, u0, u1, 17.3, 17.46, 0, 1.12);
    band(b, 'trim', s, u0, u1, 17.46, 17.6, 0, 1.0);                 // 冠顶
    band(b, 'trimShade', s, u0, u1, 16.82, 16.86, 0.36, 1.14);        // 挑檐底面
    for (let u = u0 + 0.2; u < u1 - 0.1; u += 0.42) fp(b, 'trim', s, u, 16.75, 0.2, 0.16, 0.44, 0.16);   // 齿饰
    for (let u = u0 + 0.5; u < u1 - 0.3; u += 1.26) fp(b, 'trim', s, u, 16.93, 0.3, 0.18, 0.6, 0.9);    // 飞檐托
    band(b, 'trim', s, u0, u1, 17.6, 17.78, 0, 0.1);                 // 挡檐墙座线
    band(b, 'trim', s, u0, u1, 18.52, 18.7, 0, 0.12);                // 挡檐墙压顶
  }
}

/* ---------- 门廊（科林斯 6 柱，10D）与山花 ---------- */
function portico(full) {
  for (const x of PC) FLOORS.slice(0, 3).forEach((f, fi) => corinthianSeg(full[fi], x, PZ, f.y, fi === 2 ? ENTAB[0] : FLOORS[fi + 1].y));
  const b = full[3], X = 14.8, zf = PZ + PRT + 0.08;   // 额枋正面约在柱顶外皮
  b.bb('trim', -X, 14.7, 22.45, X, 15.0, zf - 0.08); b.bb('trim', -X, 15.0, 22.45, X, 15.3, zf - 0.04); b.bb('trim', -X, 15.3, 22.45, X, 15.52, zf); b.bb('trim', -X - 0.1, 15.52, 22.45, X + 0.1, 15.6, zf + 0.08);
  b.bb('stone', -X, 15.6, 22.45, X, 16.5, zf - 0.02);                 // 檐壁
  for (const sx of [-1, 1]) b.bb('stone', sx > 0 ? X - 0.02 : -X, 15.6, 22.45, sx > 0 ? X : -X + 0.02, 16.5, zf);
  // 檐口：托线、齿饰、挑檐、冠顶
  b.bb('trim', -X - 0.25, 16.5, 22.45, X + 0.25, 16.66, zf + 0.26); b.bb('trim', -X - 0.35, 16.66, 22.45, X + 0.35, 16.84, zf + 0.36);
  for (let x = -X - 0.2; x <= X + 0.2; x += 0.42) b.bb('trim', x - 0.1, 16.67, zf + 0.36, x + 0.1, 16.83, zf + 0.52);
  b.bb('trim', -X - 1.1, 16.84, 22.45, X + 1.1, 17.3, zf + 1.2); b.bb('trim', -X - 1.02, 17.3, 22.45, X + 1.02, 17.46, zf + 1.12); b.bb('trim', -X - 0.9, 17.46, 22.45, X + 0.9, 17.6, zf + 1.0);
  for (let x = -X; x <= X + 0.01; x += 1.26) b.bb('trim', x - 0.15, 16.84, zf + 0.36, x + 0.15, 17.02, zf + 1.15);
  // 门廊顶棚藻井
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) { const x = -11.2 + i * 5.6, z = 24.2 + j * 2.6; b.bb('trimShade', x - 2.0, 14.66, z - 0.9, x + 2.0, 14.7, z + 0.9); b.bb(mk('ormolu'), x - 0.2, 14.62, z - 0.2, x + 0.2, 14.66, z + 0.2); }
  // 山花：底 17.6，宽 29.6，高 3.29（1:4.5）
  const PW = 29.6, PH = PW / 2 / 4.5, pb = 17.6, zt = 29.3, ang = Math.atan2(PH, PW / 2), L = Math.hypot(PW / 2, PH);
  b.put('stone', G.prism(), 0, pb, (22.45 + zt) / 2, PW - 1.1, PH - 0.3, zt - 22.45);                  // 山花墙（面在 z 29.3）
  b.put('lead', G.prism(), 0, pb + 0.35, (22.45 + zt - 0.02) / 2, PW + 0.6, PH + 0.15, zt - 0.02 - 22.45); // 屋面从主楼立面（z 22）做到山花墙
  for (const sx of [-1, 1]) {
    b.put('trim', G.box, sx * PW / 4, pb + PH / 2 + 0.12, zt + 0.45, L + 0.8, 0.46, 1.1, 0, 0, -sx * ang);   // 斜檐口
    b.put('trim', G.box, sx * PW / 4, pb + PH / 2 - 0.2, zt + 0.2, L + 0.2, 0.2, 0.6, 0, 0, -sx * ang);
    b.put('trim', G.box, sx * PW / 4, pb + PH / 2 + 0.4, zt + 0.55, L + 0.9, 0.12, 1.05, 0, 0, -sx * ang);
  }
  // 家徽（传承件 2）：WP-B 的 PROP.crest，缺失时用金色盾徽兜底
  const k = new Kit(b, 0, 18.9, zt + 0.05), crest = prop('crest');
  if (crest) crest(k, { w: 2.4, relief: true });
  else {
    const shield = G.extrude('shield', () => { const s = new THREE.Shape(); s.moveTo(-0.5, 0.55); s.lineTo(0.5, 0.55); s.lineTo(0.5, 0.05); s.quadraticCurveTo(0.45, -0.4, 0, -0.62); s.quadraticCurveTo(-0.45, -0.4, -0.5, 0.05); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 8 }); });
    k.geo('gold', shield, 0, 0, 0, 1.5, 1.5, 0.12);
    k.geo('gold', new THREE.TorusGeometry(1, 0.05, 6, 32), 0, 0.05, 0.06, 1.2, 1.2, 1.2);
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) { const a = -0.6 + i * 0.28; k.geo('gold', G.sph(6, 4), sx * Math.cos(a) * 1.45, Math.sin(a) * 1.1, 0.06, 0.28, 0.12, 0.06, 0, 0, sx * a); }
  }
  // 山花顶饰
  for (const [x, yy] of [[0, pb + PH + 0.35], [-PW / 2 + 0.4, pb + 0.4], [PW / 2 - 0.4, pb + 0.4]]) { b.bb('trim', x - 0.6, yy - 0.1, zt - 0.3, x + 0.6, yy + 0.4, zt + 0.7); b.inst('urn', mat4(x, yy + 0.4, zt + 0.2, 1.6, 1.6, 1.6)); }
}

/* ---------- 两翼屋顶：檐口 13.8–14.7、铅皮平顶、栏杆、烟囱、主浴室圆天窗 ---------- */
function wingRoofs(b) {
  for (const id of ['BW', 'BE']) {
    const blk = blockById[id], SS = sidesOf(blk), sg = id === 'BW' ? -1 : 1, outer = id === 'BW' ? 'W' : 'E';
    for (const side of ['S', 'N', outer]) for (const [u0, u1] of extRanges(blk, side, 2)) {
      const s = SS[side];
      band(b, 'stone', s, u0, u1, 13.8, 14.1, 0, 0.04); band(b, 'trim', s, u0, u1, 14.1, 14.22, 0, 0.2);
      for (let u = u0 + 0.2; u < u1 - 0.1; u += 0.4) fp(b, 'trim', s, u, 14.28, 0.18, 0.12, 0.3, 0.14);
      band(b, 'trim', s, u0, u1, 14.34, 14.56, 0, 0.62); band(b, 'trim', s, u0, u1, 14.56, 14.7, 0, 0.52);
    }
    const x0 = Math.min(sg * 20.45, sg * 54.45), x1 = Math.max(sg * 20.45, sg * 54.45);
    b.bb('lead', x0, 14.4, -16.45, x1, 14.62, 16.45);
    const xa = sg * 20.6, xb = sg * 54.2;
    balustrade(b, xa, 16.2, xb, 16.2, 14.7, 1.0, { posts: 4.86, urns: 2 });
    balustrade(b, xa, -16.2, xb, -16.2, 14.7, 1.0, { posts: 4.86, urns: 2 });
    balustrade(b, xb, -16.2, xb, 16.2, 14.7, 1.0, { posts: 4.1, urns: 4 });
    for (const [x, z] of [[30, 9], [30, -9], [46, 9], [46, -9]]) {
      if (id === 'BW' && x === 46 && z === -9) continue;   // 主浴室上方是天窗
      const k = new Kit(b, sg * x, 14.6, z); k.bx('stone', 0, 0, 0, 1.2, 2.4, 2.6); k.bx('trim', 0, 2.4, 0, 1.5, 0.22, 2.9);
      for (const dz of [-0.8, 0, 0.8]) k.cyl('terracotta', 0, 2.62, dz, 0.16, 0.5, 8);
    }
  }
  // 316 上方圆天窗
  b.put('trim', G.cyl(28), -47, 14.75, -9, 2.1, 0.3, 2.1); b.put('glass', G.hemi(24), -47, 14.9, -9, 1.8, 0.6, 1.8);
  for (let i = 0; i < 8; i++) b.put('trim', G.box, -47 + Math.sin(i * PI / 4) * 0.9, 15.15, -9 + Math.cos(i * PI / 4) * 0.9, 0.06, 0.05, 1.8, i * PI / 4, 0.3);
}

/* ---------- 图书馆塔亭：顶板、挡檐墙、八角塔身、铅皮小穹顶、浑天仪 ---------- */
function libraryTop(b) {
  const blk = blockById.C, SS = sidesOf(blk), top = 11.2;
  for (const side of ['S', 'N', 'E', 'W']) { const s = SS[side];
    band(b, 'trim', s, s.u0, s.u1, top - 0.9, top - 0.6, 0, 0.1); band(b, 'trim', s, s.u0, s.u1, top - 0.6, top - 0.3, 0, 0.3); band(b, 'trim', s, s.u0, s.u1, top - 0.3, top, 0, 0.7);
    band(b, 'stone', s, s.u0, s.u1, top, top + 0.9, -0.5, 0); band(b, 'trim', s, s.u0, s.u1, top + 0.9, top + 1.05, 0, 0.1); }
  b.bb('lead', -102, top, -12, -78, top + 0.1, 12);
  const cx = -90, k = new Kit(b, cx, top, 0), R8 = 5, t8 = 0.6, H8 = 12.8;   // 八角塔身 11.2 → 24.0
  for (let i = 0; i < 8; i++) {
    const a = i * PI / 4, ap = R8 * Math.cos(PI / 8), side = 2 * R8 * Math.sin(PI / 8);
    k.geo('stone', G.box, Math.sin(a) * (ap - t8 / 2), H8 / 2, Math.cos(a) * (ap - t8 / 2), side + 0.02, H8, t8, a);
    // 每面一扇高拱窗 + 窗套
    k.geo('glass', G.box, Math.sin(a) * (ap + 0.01), 7.6, Math.cos(a) * (ap + 0.01), 1.3, 3.4, 0.05, a);
    k.geo('glass', G.cyl(12, 1, false), Math.sin(a) * (ap + 0.01), 9.3, Math.cos(a) * (ap + 0.01), 0.65, 0.05, 0.65, a, PI / 2);
    k.geo('trim', G.box, Math.sin(a) * (ap + 0.06), 5.8, Math.cos(a) * (ap + 0.06), 1.8, 0.16, 0.2, a);
    k.geo('trim', G.box, Math.sin(a) * (ap + 0.08), 10.1, Math.cos(a) * (ap + 0.08), 0.4, 0.6, 0.18, a);
    // 转角壁柱
    const ac = a + PI / 8; k.geo('trim', G.box, Math.sin(ac) * (R8 - 0.2), H8 / 2, Math.cos(ac) * (R8 - 0.2), 0.7, H8, 0.5, ac);
  }
  const ring = (y, r, h, key = 'trim') => k.geo(key, G.cyl(8), 0, y + h / 2, 0, r, h, r, PI / 8);
  ring(0, R8 + 0.3, 0.6); ring(H8 - 0.8, R8 + 0.1, 0.3); ring(H8 - 0.5, R8 + 0.5, 0.3); ring(H8 - 0.2, R8 + 0.75, 0.2);
  k.geo('lead', G.hemi(8), 0, H8, 0, R8 * 0.92, 3.4, R8 * 0.92, PI / 8);
  k.cyl('trim', 0, H8 + 3.2, 0, 0.55, 0.5, 12); k.cyl('gold', 0, H8 + 3.7, 0, 0.3, 0.3, 10);
  // 浑天仪（传承件 12）：WP-B 的 PROP.armillary，原点 = 底座顶（y 28.0）
  const ka = new Kit(b, cx, top + H8 + 4.0, 0), arm = prop('armillary');
  if (arm) arm(ka, { r: 1.0 });
  else {
    ka.cyl('gold', 0, 0, 0, 0.08, 1.2, 8);
    const tr = new THREE.TorusGeometry(1, 0.04, 6, 36);
    ka.geo('gold', tr, 0, 1.2, 0, 0.95, 0.95, 0.95, 0, 0, 0); ka.geo('gold', tr, 0, 1.2, 0, 0.95, 0.95, 0.95, PI / 2, 0, 0);
    ka.geo('gold', tr, 0, 1.2, 0, 0.95, 0.95, 0.95, 0, PI / 2, 0.41); ka.geo('gold', tr, 0, 1.2, 0, 0.8, 0.8, 0.8, 0.6, 0.9, 0);
    ka.sph('gold', 0, 1.2, 0, 0.18, 0.18, 0.18);
  }
}

/* ---------- 音乐厅亭：檐口、挡檐墙、筒拱屋面、北端后殿 ---------- */
function musicHall(b, bc) {
  const blk = blockById.D, SS = sidesOf(blk), y = 1.2, top = y + 11;
  if (b) for (const side of ['S', 'N', 'E', 'W']) { const s = SS[side];
    band(b, 'trim', s, s.u0, s.u1, top - 1.1, top - 0.7, 0, 0.1); band(b, 'trim', s, s.u0, s.u1, top - 0.7, top - 0.35, 0, 0.35); band(b, 'trim', s, s.u0, s.u1, top - 0.35, top, 0, 0.8);
    band(b, 'stone', s, s.u0, s.u1, top, top + 0.6, -0.5, 0); band(b, 'trim', s, s.u0, s.u1, top + 0.6, top + 0.72, 0, 0.1); }
  // 筒拱：沿 z，跨 24 m，矢高 5
  if (b) {
    b.put('lead', BARREL(), 90, top + 0.5, 0, 12.3, 5.0, 32.4);
    for (const z of [-16.35, 16.35]) b.put('stone', BARREL(), 90, top + 0.5, z, 12.1, 4.8, 0.3);
    for (let i = 1; i < 8; i++) { const z = -16 + i * 4; b.put('trim', BARREL(), 90, top + 0.5, z, 12.36, 5.06, 0.25); }
  }
  // 后殿（圆心 (90,−16)，r 6）
  const segs = 14, R = 6, t = 0.9;
  const wallSegs = (bb, y0, y1, key) => { for (let i = 0; i < segs; i++) { const a = PI + (i + 0.5) * PI / segs, w = 2 * (R + t / 2) * Math.sin(PI / segs / 2) * 1.04; bb.put(key, G.box, 90 + Math.cos(a) * R, (y0 + y1) / 2, -16 + Math.sin(a) * R, w, y1 - y0, t, -a + PI / 2); } };
  if (b) {
    wallSegs(b, y, top, 'stone');
    for (let i = 0; i < 3; i++) { const a = PI + (i + 1) * PI / 4; b.put('glass', G.box, 90 + Math.cos(a) * (R + 0.46), 7.2, -16 + Math.sin(a) * (R + 0.46), 1.4, 4.2, 0.05, -a + PI / 2); b.put('trim', G.box, 90 + Math.cos(a) * (R + 0.5), 9.5, -16 + Math.sin(a) * (R + 0.5), 0.5, 0.6, 0.16, -a + PI / 2); }
    b.put('trim', G.cyl(28, 1), 90, top - 0.3, -16, R + 1.0, 0.6, R + 1.0);   // 檐口（与主体檐口相接，内侧被屋面挡住）
    b.put('lead', HALFDOME(), 90, top + 0.1, -16, R + 0.8, 4.2, R + 0.8);
  }
  if (bc) {   // 剖切：后殿墙截在 1.2 m，上段进 hi-z
    const hi = SUB(bc, 'hi-z');
    for (let i = 0; i < segs; i++) { const a = PI + (i + 0.5) * PI / segs, w = 2 * (R + t / 2) * Math.sin(PI / segs / 2) * 1.04, x = 90 + Math.cos(a) * R, z = -16 + Math.sin(a) * R;
      bc.put('stone', G.box, x, y + CUT / 2, z, w, CUT, t, -a + PI / 2); bc.put(mk('cap'), G.box, x, y + CUT + 0.01, z, w, 0.02, t - 0.02, -a + PI / 2);
      hi.put('stone', G.box, x, y + (CUT + 10.7) / 2, z, w, 10.7 - CUT, t, -a + PI / 2); }
    bc.put(mk('versailles'), G.cyl(28), 90, y + 0.0125, -16, R, 0.025, R);
  }
}

/* ---------- 柱廊连廊（爱奥尼亚单排柱，D 0.6，柱距 3，高 5.5） ---------- */
function links(bF, bC) {
  for (const sg of [-1, 1]) {
    const xa = sg * 54.45, xb = sg * 77.55, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), y = 1.2, top = 6.7;
    if (bF) {
      bF.bb('pavers', x0, y, -3, x1, y + 0.03, 3.2);
      bF.bb('stone', x0, y, -3.3, x1, top - 0.9, -2.8);   // 后墙
      for (let x = x0 + 1.5; x < x1 - 1; x += 3) { bF.bb('trimShade', x - 0.55, y + 0.9, -2.82, x + 0.55, y + 3.4, -2.78); bF.bb('trim', x - 0.75, y + 3.4, -2.8, x + 0.75, y + 3.55, -2.7); }
      for (let i = 0; i < 8; i++) { const x = sg * (55.5 + i * 3); ionic(bF, x, 2.6, y, top - 0.9, 0.3); }
      // 檐部与平顶
      const E = (ya, yb, za, zb, key = 'trim') => bF.bb(key, x0, ya, za, x1, yb, zb);
      E(top - 0.9, top - 0.6, -3.3, 2.98); E(top - 0.6, top - 0.3, -3.3, 2.96, 'stone'); E(top - 0.3, top - 0.15, -3.45, 3.2); E(top - 0.15, top, -3.55, 3.35);
      bF.bb('lead', x0, top, -3.2, x1, top + 0.08, 3.1);
      balustrade(bF, x0 + 0.3, 3.05, x1 - 0.3, 3.05, top, 0.9, { posts: 3 });
    }
    if (bC) {
      bC.bb('pavers', x0, y, -3, x1, y + 0.03, 3.2);
      cutWall(bC, { ax: 'x', at: -3.05, t: 0.5, u0: x0, u1: x1, y, h: 5.5, open: [], mat: 'stone' }, 'hi-z', 4.6);
      for (let i = 0; i < 8; i++) { const x = sg * (55.5 + i * 3); bC.bb('trim', x - 0.44, y, 2.16, x + 0.44, y + 0.18, 3.04); stub(bC, x, 2.6, y, 0.3, 14); }
    }
  }
}

/* ---------- 基座、门廊台基与台阶、后露台（site） ---------- */
function podium(site) {
  const rus = (x0, z0, x1, z1) => { site.bb('rustic', x0, 0, z0, x1, 1.2, z1, [0, 1.2, 0.8]); site.bb('trim', x0 - 0.2, 1.02, z0 - 0.2, x1 + 0.2, 1.22, z1 + 0.2); };
  for (const blk of BLOCKS) { const m = blk.t / 2 + 0.45; rus(blk.x0 - m, blk.z0 - m, blk.x1 + m, blk.z1 + m); }
  for (const sg of [-1, 1]) rus(Math.min(sg * 55, sg * 77), -3.8, Math.max(sg * 55, sg * 77), 3.8);
  site.put('rustic', G.cyl(28), 90, 0.6, -16, 7.35, 1.2, 7.35); site.put('trim', G.cyl(28), 90, 1.12, -16, 7.55, 0.2, 7.55);
  // 门廊台基 x ±15.5，z 22…29.5；前面 7 级台阶，踏面 0.4
  site.bb('rustic', -15.5, 0, 22.4, 15.5, 1.2, 29.5, [0, 1.2, 0.8]); site.bb('pavers', -15.3, 1.2, 22.4, 15.3, 1.23, 29.4);
  site.bb('trim', -15.6, 1.02, 22.4, 15.6, 1.22, 29.6);
  for (let i = 0; i < 7; i++) { const yy = 1.2 - i * 1.2 / 7; site.bb('trim', -14.8, 0, 29.5 + i * 0.4, 14.8, yy, 29.5 + (i + 1) * 0.4); }
  for (const sx of [-1, 1]) { site.bb('rustic', sx * 16.3 - 0.9, 0, 26.5, sx * 16.3 + 0.9, 1.9, 32.4); site.bb('trim', sx * 16.3 - 1.05, 1.9, 26.4, sx * 16.3 + 1.05, 2.1, 32.55); site.inst('lamp', mat4(sx * 16.3, 2.1, 31.6, 1.1, 1.1, 1.1)); }
  // 后露台：z −22.45 … −28，台阶下到后庭
  site.bb('pavers', -24, 0, -28, 24, 1.2, -22.4); site.bb('trim', -24.3, 1.05, -28.3, 24.3, 1.25, -22.4);
  balustrade(site, -24, -28.1, -7, -28.1, 1.25, 1.05, { posts: 4, urns: 2 }); balustrade(site, 7, -28.1, 24, -28.1, 1.25, 1.05, { posts: 4, urns: 2 });
  balustrade(site, -24, -28.1, -24, -22.6, 1.25, 1.05, { posts: 5.5 }); balustrade(site, 24, -28.1, 24, -22.6, 1.25, 1.05, { posts: 5.5 });
  for (let i = 0; i < 7; i++) { const yy = 1.2 - i * 1.2 / 7; site.bb('trim', -7, 0, -28 - (i + 1) * 0.45, 7, yy, -28 - i * 0.45); }
  for (const x of [-16, 16]) { const k = new Kit(site, x, 1.25, -25.2); k.bx('trim', 0, 0, 0, 1.3, 0.2, 1.3); k.inst('urn', 0, 0.2, 0, 1.4, 1.4, 1.4); k.sph('foliage', 0, 1.7, 0, 0.7, 0.55, 0.7); }
  // 柱廊连廊外端台阶（花园一侧）
  for (const sg of [-1, 1]) for (let i = 0; i < 4; i++) { const yy = 1.2 - i * 0.3; site.bb('trim', sg * 66 - 3, 0, 3.8 + i * 0.4, sg * 66 + 3, yy, 3.8 + (i + 1) * 0.4); }
}

/* ---------- 屋顶层（F5）：露台、退进栏杆、出口亭、紫藤廊、光井天窗、眺望亭鼓座与穹顶 ---------- */
const DRUM = { cx: 0, cz: 2, R: 7, t: 0.6, y0: 18.7, y1: 24.7 };
function drumSegs(fn) {
  const n = 64, Rm = DRUM.R - DRUM.t / 2, w = TAU * DRUM.R / n * 1.03;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) * TAU / n, win = ((i + 1) % 8 === 0 || i % 8 === 0);
    fn(DRUM.cx + Math.sin(a) * Rm, DRUM.cz + Math.cos(a) * Rm, a, w, win);
  }
}
const hiTagOf = (nx, nz) => (Math.abs(nz) >= Math.abs(nx) ? (nz < 0 ? 'hi-z' : 'hi+z') : (nx < 0 ? 'hi-x' : 'hi+x'));
const KIOSKS = [
  { id: '503', r: [-14, -8, -22, -14], h: 3.2, door: { side: '+z', c: -11 } },
  { id: '504', r: [12, 16, -17, -12], h: 3.4, door: { side: '+z', c: 14 } },
  { id: '505', r: [-20, -14, -14, -6], h: 3.0, door: { side: '+z', c: -17 } },
];
function kioskWalls(k) {
  const [x0, x1, z0, z1] = k.r, t = 0.3, y = FLOORS[4].y;
  const dOp = (side) => (k.door.side === side ? [{ c: k.door.c, w: 1.2, bot: 0, top: 2.4, kind: 'door' }] : []);
  return [
    { ax: 'x', at: z1, t, u0: x0 - t / 2, u1: x1 + t / 2, y, h: k.h, open: dOp('+z'), side: '+z', out: 1 },
    { ax: 'x', at: z0, t, u0: x0 - t / 2, u1: x1 + t / 2, y, h: k.h, open: [], side: '-z', out: -1 },
    { ax: 'z', at: x0, t, u0: z0 + t / 2, u1: z1 - t / 2, y, h: k.h, open: [], side: '-x', out: -1 },
    { ax: 'z', at: x1, t, u0: z0 + t / 2, u1: z1 - t / 2, y, h: k.h, open: [], side: '+x', out: 1 },
  ];
}
function roofLevel(b, cutMode) {
  const y = FLOORS[4].y;
  // 露台铺地（留出竖井、光井）
  const holes = holesOf(4);
  for (const r of rectMinus([-20.45, 20.45, -22.45, 22.45], holes)) b.bb('pavers', r[0], y, r[2], r[1], y + 0.03, r[3]);
  // 退进 1.5 m 的栏杆（遇出口亭断开）
  const X = 18.95, Z = 20.95, by = y + 0.03;
  balustrade(b, -X, Z, X, Z, by, 1.1, { posts: 4, urns: 2 });
  balustrade(b, -X, -Z, -14.2, -Z, by, 1.1, { posts: 4 }); balustrade(b, -7.8, -Z, X, -Z, by, 1.1, { posts: 4, urns: 2 });
  balustrade(b, -X, -Z, -X, -14.2, by, 1.1, { posts: 4 }); balustrade(b, -X, -5.8, -X, Z, by, 1.1, { posts: 4, urns: 2 });
  balustrade(b, X, -Z, X, Z, by, 1.1, { posts: 4, urns: 2 });
  // 光井天窗
  b.bb('trim', 8.3, y, -20.2, 12.2, y + 0.45, -7.8); b.put('glass', G.prism(), 10.25, y + 0.45, -14, 3.8, 0.9, 12.2);
  for (let z = -20; z <= -8; z += 2) b.put('frame', G.prism(), 10.25, y + 0.46, z, 3.9, 0.92, 0.05);
  // 出口亭
  for (const k of KIOSKS) {
    const [x0, x1, z0, z1] = k.r, walls = kioskWalls(k);
    for (const w of walls) {
      const o = { ...w, mat: 'stone' };
      if (cutMode) cutWall(b, o, 'hi' + w.side, k.h - 0.3);
      else { fullWall(b, o); for (const p of w.open) deco(b, { ax: w.ax, at: w.at, t: w.t, out: w.out }, p, y, 'plain'); }
    }
    if (cutMode) { for (const q of rectMinus(k.r, holes)) b.bb(mk(k.id === '504' ? 'marble' : 'stoneFlag'), q[0], y + 0.03, q[2], q[1], y + 0.05, q[3]); continue; }
    const yt = y + k.h;
    b.bb('trim', x0 - 0.35, yt - 0.3, z0 - 0.35, x1 + 0.35, yt, z1 + 0.35); b.bb('trim', x0 - 0.45, yt, z0 - 0.45, x1 + 0.45, yt + 0.12, z1 + 0.45);
    b.put('lead', G.cyl(4, 0.2), (x0 + x1) / 2, yt + 0.12 + 0.55, (z0 + z1) / 2, (x1 - x0 + 0.8) / Math.SQRT2, 1.1, (z1 - z0 + 0.8) / Math.SQRT2, PI / 4);
    if (k.id === '504') for (const sx of [-0.3, 0.3]) b.bb(mk('brass'), 14 + sx - 0.28, y, z1 + 0.16, 14 + sx + 0.28, y + 2.4, z1 + 0.2);
  }
  // 紫藤廊：503 → 鼓座西侧，约 20 m
  const pergola = (xa, za, xb, zb) => {
    const L = Math.hypot(xb - xa, zb - za), ux = (xb - xa) / L, uz = (zb - za) / L, nx = -uz, nz = ux, n = Math.max(2, Math.round(L / 2.5));
    for (let i = 0; i <= n; i++) { const t = i / n, x = xa + (xb - xa) * t, z = za + (zb - za) * t;
      for (const s of [-1.3, 1.3]) { b.put('trim', G.cyl(10), x + nx * s, y + 1.3, z + nz * s, 0.13, 2.6, 0.13); }
      b.put(mk('walnut'), G.box, x, y + 2.68, z, 3.2 * Math.abs(nx) + 0.12 * Math.abs(ux), 0.14, 3.2 * Math.abs(nz) + 0.12 * Math.abs(uz)); }
    for (const s of [-1.3, 1.3]) b.put(mk('walnut'), G.box, (xa + xb) / 2 + nx * s, y + 2.56, (za + zb) / 2 + nz * s, L * Math.abs(ux) + 0.12, 0.12, L * Math.abs(uz) + 0.12);
    b.put('hedge', G.box, (xa + xb) / 2, y + 2.86, (za + zb) / 2, L * Math.abs(ux) + 2.6 * Math.abs(nx) + 0.4, 0.28, L * Math.abs(uz) + 2.6 * Math.abs(nz) + 0.4);
    const f = SUB(b, 'fine'), R0 = (xa * 7 + za * 13) | 0;
    for (let i = 0; i < n * 6; i++) { const t = ((i * 0.618 + R0) % 1), s = ((i * 0.381) % 1) * 2.6 - 1.3;
      f.put('trim', tint(G.cone(6), i % 3 ? '#9C86C8' : '#B9A6DC'), xa + (xb - xa) * t + nx * s, y + 2.45, za + (zb - za) * t + nz * s, 0.13, 0.5, 0.13, 0, PI, 0); }
  };
  pergola(-11, -13.8, -11, 2); pergola(-11, 2, -7.2, 2);
}
function drumAndDome(b, cutMode) {
  const { cx, cz, R, t, y0, y1 } = DRUM;
  if (cutMode) {
    drumSegs((x, z, a, w, win) => {
      b.put('stone', G.box, x, y0 + CUT / 2, z, w, CUT, t, a); b.put(mk('cap'), G.box, x, y0 + CUT + 0.01, z, w - 0.01, 0.02, t - 0.02, a);
      const hi = SUB(b, hiTagOf(Math.sin(a), Math.cos(a))), top = 5.7;
      if (win) { hi.put('stone', G.box, x, y0 + (CUT + 1.5) / 2, z, w, 1.5 - CUT, t, a); hi.put('stone', G.box, x, y0 + (4.7 + top) / 2, z, w, top - 4.7, t, a); hi.put('glass', G.box, x, y0 + 3.1, z, w, 3.2, 0.05, a); }
      else hi.put('stone', G.box, x, y0 + (CUT + top) / 2, z, w, top - CUT, t, a);
    });
    b.put(mk('compass'), G.cyl(48), cx, y0 + 0.045, cz, R - t, 0.03, R - t);
    return;
  }
  drumSegs((x, z, a, w, win) => {
    if (!win) { b.put('stone', G.box, x, (y0 + y1) / 2, z, w, y1 - y0, t, a); return; }
    b.put('stone', G.box, x, y0 + 0.75, z, w, 1.5, t, a); b.put('stone', G.box, x, (y0 + 4.7 + y1) / 2, z, w, y1 - y0 - 4.7, t, a);
    b.put('glass', G.box, x, y0 + 3.1, z, w, 3.2, 0.05, a);
  });
  for (let k = 0; k < 8; k++) {   // 拱窗套：拱心石、窗台
    const a = k * PI / 4, Ro = R + 0.02;
    b.put('trim', G.box, cx + Math.sin(a) * Ro, y0 + 4.85, cz + Math.cos(a) * Ro, 0.4, 0.55, 0.2, a);
    b.put('trim', G.box, cx + Math.sin(a) * (Ro + 0.05), y0 + 1.45, cz + Math.cos(a) * (Ro + 0.05), 1.6, 0.12, 0.3, a);
    for (const da of [-0.13, 0.13]) b.put('trim', G.box, cx + Math.sin(a + da) * Ro, y0 + 3.0, cz + Math.cos(a + da) * Ro, 0.18, 3.3, 0.14, a + da);
  }
  for (let k = 0; k < 16; k++) {   // 16 根壁柱
    const a = k * PI / 8 + PI / 16, Ro = R + 0.08;
    b.put('trim', G.box, cx + Math.sin(a) * Ro, (y0 + y1) / 2, cz + Math.cos(a) * Ro, 0.6, y1 - y0, 0.2, a);
    b.put('trim', G.box, cx + Math.sin(a) * (Ro + 0.05), y1 - 0.3, cz + Math.cos(a) * (Ro + 0.05), 0.8, 0.5, 0.26, a);
    b.put('trim', G.box, cx + Math.sin(a) * (Ro + 0.04), y0 + 0.25, cz + Math.cos(a) * (Ro + 0.04), 0.8, 0.5, 0.24, a);
  }
  const k = new Kit(b, cx, y1, cz);
  k.geo('trim', G.cyl(48), 0, 0.1, 0, R + 0.35, 0.2, R + 0.35); k.geo('trim', G.cyl(48), 0, 0.3, 0, R + 0.55, 0.2, R + 0.55);
  k.geo('stone', G.cyl(48), 0, 0.5, 0, R + 0.1, 0.2, R + 0.1);
  const dr = 7.2, dh = 3.5, db = 0.5;   // 穹顶 r 7.2，基线 25.2，顶 28.7
  k.geo('lead', G.hemi(48), 0, db, 0, dr, dh, dr);
  const rib = new THREE.TorusGeometry(1, 0.016, 4, 20, PI / 2);
  for (let i = 0; i < 16; i++) k.geo('gold', rib, 0, db, 0, dr + 0.03, dh + 0.03, dr + 0.03, i * PI / 8);
  // 灯亭 r 1.6，高 3：28.5 → 31.5；金松果顶饰到约 32.2
  const ly = db + dh - 0.2;
  k.cyl('trim', 0, ly, 0, 1.75, 0.3, 16);
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; k.cyl('trim', Math.sin(a) * 1.4, ly + 0.3, Math.cos(a) * 1.4, 0.11, 2.0, 8); }
  k.cyl('glow', 0, ly + 0.3, 0, 1.1, 2.0, 12);
  k.cyl('trim', 0, ly + 2.3, 0, 1.75, 0.25, 16); k.cyl('trim', 0, ly + 2.55, 0, 1.6, 0.15, 16);
  k.geo('lead', G.hemi(16), 0, ly + 2.7, 0, 1.45, 0.4, 1.45);
  k.sph('gold', 0, ly + 3.36, 0, 0.24, 0.34, 0.24, 10, 8);   // 金松果，最高点约 32.2
  for (let i = 0; i < 3; i++) k.geo('gold', G.tor(TAU, 4, 12, 0.3), 0, ly + 3.2 + i * 0.12, 0, 0.25 - i * 0.05, 0.3, 0.25 - i * 0.05);
}

/* ================================================================
 * 楼板洞口与矩形减法
 * ================================================================ */
function holesOf(fi) {
  const H = [];
  if (fi === 1) H.push([-11.7, 11.7, 4, 21.55], [-96, -84, -6, 6]);                    // 大厅上空（楼座 z 2…4 保留）、图书馆中庭
  if (fi === 1 || fi === 2) H.push([10.4, 17.6, -21.55, -8], [8.3, 10.4, -21.55, -16.45]);   // 主楼梯井
  if (fi === 3 || fi === 4) H.push([8.3, 12, -20, -8], [12.5, 15.5, -16.5, -12.5]);        // 光井、电梯
  if (fi >= 1) H.push([-19.55, -14.45, -13.55, -8.2], [-15.6, -14.4, -7.6, -6.4], [-13.2, -8.8, -21.5, -17.1], [-11.7, -10.3, -16.2, -14.8]);
  return H;
}
function rectMinus(r, holes) {
  const hs = holes.map((h) => [Math.max(h[0], r[0]), Math.min(h[1], r[1]), Math.max(h[2], r[2]), Math.min(h[3], r[3])]).filter((h) => h[1] > h[0] + EPS && h[3] > h[2] + EPS);
  if (!hs.length) return [r];
  const xs = [...new Set([r[0], r[1], ...hs.flatMap((h) => [h[0], h[1]])])].sort((a, b) => a - b);
  const zs = [...new Set([r[2], r[3], ...hs.flatMap((h) => [h[2], h[3]])])].sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < zs.length - 1; j++) {
    let run = null; const zm = (zs[j] + zs[j + 1]) / 2;
    for (let i = 0; i < xs.length - 1; i++) {
      const xm = (xs[i] + xs[i + 1]) / 2, inH = hs.some((h) => xm > h[0] && xm < h[1] && zm > h[2] && zm < h[3]);
      if (inH) { run = null; continue; }
      if (run) run[1] = xs[i + 1]; else { run = [xs[i], xs[i + 1], zs[j], zs[j + 1]]; out.push(run); }
    }
  }
  return out;
}

/* ================================================================
 * 楼梯
 * ================================================================ */
function mainStair(b, y, H) {   // 悬挑双跑回转梯，绕电梯井三面：东跑（向北）→ 北跑（向西）→ 西跑（向南）
  const n = 9, r = H / 27, T = 'trim', M = mk('marble');
  const step = (x0, x1, z0, z1, top) => { b.bb(T, x0, top - 0.24, z0, x1, top - 0.02, z1); b.bb(M, x0, top - 0.02, z0, x1, top, z1); };
  const g1 = (19.6 - 16.45) / n;
  for (let i = 1; i <= n; i++) step(17.6, 19.8, -16.45 - i * g1, -16.45 - (i - 1) * g1, y + i * r);
  b.bb(T, 16.4, y + 9 * r - 0.3, -21.8, 19.8, y + 9 * r, -19.6);
  const g2 = (16.4 - 12.44) / n;
  for (let i = 1; i <= n; i++) step(16.4 - i * g2, 16.4 - (i - 1) * g2, -21.8, -19.6, y + (9 + i) * r);
  b.bb(T, 8.2, y + 18 * r - 0.3, -21.8, 12.44, y + 18 * r, -19.6);
  for (let i = 1; i <= n; i++) step(8.2, 10.4, -19.6 + (i - 1) * g1, -19.6 + i * g1, y + (18 + i) * r);
  // 栏杆（井一侧）
  const per = (x, z, top) => b.bb('iron', x - 0.012, top, z - 0.012, x + 0.012, top + 0.95, z + 0.012);
  for (let i = 1; i <= n; i++) { per(17.62, -16.45 - (i - 0.5) * g1, y + i * r); per(16.4 - (i - 0.5) * g2, -19.58, y + (9 + i) * r); per(10.38, -19.6 + (i - 0.5) * g1, y + (18 + i) * r); }
  slopeRail(b, 'z', 17.62, -16.45, -19.6, y, y + 9 * r); slopeRail(b, 'x', -19.58, 16.4, 12.44, y + 9 * r, y + 18 * r); slopeRail(b, 'z', 10.38, -19.6, -16.45, y + 18 * r, y + H);
  ironRail(b, 17.62, -19.58, 16.4, -19.58, y + 9 * r, 0.95); ironRail(b, 12.44, -19.58, 10.38, -19.58, y + 18 * r, 0.95);
  const f = SUB(b, 'fine'), O = mk('ormolu');
  for (const [x, z, top] of [[17.62, -16.45, y], [17.62, -19.58, y + 9 * r], [10.38, -19.58, y + 18 * r], [10.38, -16.45, y + H]]) { f.put(O, G.sph(8, 6), x, top + 1.05, z, 0.09, 0.09, 0.09); b.bb(mk('mahogany'), x - 0.06, top, z - 0.06, x + 0.06, top + 1.0, z + 0.06); }
  if (y < 2) b.bb(mk('rugRunner'), 17.8, y + 0.01, -16.3, 19.6, y + 0.03, -7);
}
function stairWell(b, y) {   // 楼梯井边的锻铁栏杆（F2 / F3）
  ironRail(b, 10.4, -8, 17.6, -8, y, 1.0);
  ironRail(b, 10.4, -16.45, 10.4, -8, y, 1.0);
  ironRail(b, 17.6, -21.55, 17.6, -8, y, 1.0);
}
function serviceStair(b, y, H) {
  const n = Math.max(10, Math.round(H / 2 / 0.18)), r = H / 2 / n, g = (12.3 - 8.2) / n, T = mk('stoneFlag');
  for (let i = 1; i <= n; i++) b.bb(T, -19.55, y + i * r - 0.2, -8.2 - i * g, -17.6, y + i * r, -8.2 - (i - 1) * g);
  b.bb(T, -19.55, y + H / 2 - 0.25, -13.55, -14.45, y + H / 2, -12.3);
  for (let i = 1; i <= n; i++) b.bb(T, -17.3, y + H / 2 + i * r - 0.2, -12.3 + (i - 1) * g, -15.8, y + H / 2 + i * r, -12.3 + i * g);
  slopeRail(b, 'z', -17.45, -8.2, -12.3, y, y + H / 2, 0.9); slopeRail(b, 'z', -17.45, -12.3, -8.2, y + H / 2, y + H, 0.9);
  for (let i = 0; i <= n; i += 2) { b.bb('iron', -17.47, y + i * r, -8.2 - i * g - 0.01, -17.43, y + i * r + 0.9, -8.2 - i * g + 0.01); b.bb('iron', -17.47, y + H / 2 + i * r, -12.3 + i * g - 0.01, -17.43, y + H / 2 + i * r + 0.9, -12.3 + i * g + 0.01); }
}
function dumbwaiter(b, y, fi) {
  const w = { ax: 'x', t: 0.1, y, h: FLOORS[fi].h, mat: 'plaster' };
  cutWall(b, { ...w, at: -7.6, u0: -15.6, u1: -14.4, open: [] }, null, 0);
  cutWall(b, { ...w, ax: 'z', at: -15.6, u0: -7.6, u1: -6.4, open: fi <= 3 ? [{ c: -7.0, w: 0.9, bot: 0.8, top: 1.7, kind: 'door' }] : [] }, null, 0);
  if (fi === 0) b.bb(mk('walnut'), -15.5, y + 0.8, -7.5, -14.5, y + 1.7, -6.5);
}
function masterSpiral(b, y, H, fi) {
  const cx = -11, cz = -19.3, n = Math.max(20, Math.round(H / 0.19)), r = H / n, T = mk('stoneFlag');
  b.put('trim', G.cyl(12), cx, y + H / 2, cz, 0.16, H, 0.16);
  for (let i = 0; i < n; i++) { const a = i * TAU / n; b.put(T, G.box, cx + Math.sin(a) * 1.1, y + (i + 1) * r - 0.08, cz + Math.cos(a) * 1.1, 0.62, 0.16, 1.9, a); }
  // 单人电梯井（1.4 × 1.4），停站层朝 +z 开门
  const stop = [0, 2, 4].includes(fi), w = { t: 0.12, y, h: FLOORS[fi].h, mat: mk('walnut') };
  cutWall(b, { ...w, ax: 'x', at: -14.8, u0: -11.76, u1: -10.24, open: stop ? [{ c: -11, w: 0.8, bot: 0, top: 2.2, kind: 'door' }] : [] }, null, 0);
  cutWall(b, { ...w, ax: 'x', at: -16.2, u0: -11.76, u1: -10.24, open: [] }, null, 0);
  cutWall(b, { ...w, ax: 'z', at: -11.7, u0: -16.2, u1: -14.8, open: [] }, null, 0);
  cutWall(b, { ...w, ax: 'z', at: -10.3, u0: -16.2, u1: -14.8, open: [] }, null, 0);
  if (fi === 0) b.bb(mk('walnut'), -11.6, y + 0.02, -16.1, -10.4, y + 0.06, -14.9);
}

/* ================================================================
 * 剖切：buildCut(b, fi)
 * ================================================================ */
function dress(b, room, arg) {
  const f = FUR.dressWalls;
  if (typeof f !== 'function') return;
  try { f(b, room, arg); } catch (e) { console.warn('dressWalls', room.id, e); }
}
export function buildCut(b, fi) {
  const f = FLOORS[fi], y = f.y;
  if (fi === 4) { buildRoofCut(b); return; }
  const L = layout(fi), holes = holesOf(fi), rooms = roomsOf(fi);
  // 楼板（F1 由基座承托）
  if (fi > 0) for (const blk of BLOCKS) {
    if (!blk.floors.includes(fi)) continue;
    const m = blk.t / 2;
    for (const r of rectMinus([blk.x0 - m, blk.x1 + m, blk.z0 - m, blk.z1 + m], holes)) b.bb('stone', r[0], y - 0.35, r[2], r[1], y, r[3]);
  }
  // 地面
  for (const r of rooms) {
    if (r.skipFloor) continue;
    if (r.void) { const gl = r.parts && r.parts.gallery; if (gl) b.bb(mk('oak'), gl[0], y, gl[2], gl[1], y + 0.025, gl[3]); continue; }
    const hs = holes.concat(partsOf(r).filter((p) => p.kind === 'void').map((p) => p.r));
    for (const q of rectMinus(r.r, hs)) b.bb(mk(r.mat), q[0], y, q[2], q[1], y + 0.025, q[3]);
  }
  // 竖井区的地面（伪房间）
  for (const q of rectsOf(fi)) if (!q.room) for (const rr of rectMinus(q.r, holes)) b.bb(mk('stoneFlag'), rr[0], y, rr[2], rr[1], y + 0.025, rr[3]);
  // 墙
  for (const w of L.walls) {
    const rN = w.neg && w.neg.room, rP = w.pos && w.pos.room;
    let tag = null, hTop = 0;
    if (w.ext) { const q = rN || rP; tag = 'hi' + w.sideOfRoom; hTop = (q ? roomH(q) : f.h) - 0.3; }
    else {
      if (rP && rP.tall && rP.tall.includes(sideName(w.ax, 1))) { tag = 'hi' + sideName(w.ax, 1); hTop = roomH(rP) - 0.3; }
      else if (rN && rN.tall && rN.tall.includes(sideName(w.ax, -1))) { tag = 'hi' + sideName(w.ax, -1); hTop = roomH(rN) - 0.3; }
    }
    const mat = w.ext ? (fi === 0 && (!w.blk || w.blk.id !== 'D') ? 'rustic' : 'stone') : 'plaster';
    const ex = w.ext ? w.t / 2 : 0;   // 外墙两端外伸半个墙厚，补齐转角
    cutWall(b, { ax: w.ax, at: w.at, t: w.t, u0: w.u0 - ex, u1: w.u1 + ex, y, h: f.h, open: w.open, mat }, tag, hTop);
  }
  for (const w of L.parts) cutWall(b, { ...w, y, h: f.h, mat: 'plaster' }, null, 0);
  // 楼梯与竖井
  if (fi <= 1) mainStair(b, y, FLOORS[fi + 1].y - y);
  if (fi === 1 || fi === 2) stairWell(b, y);
  if (fi <= 3) { serviceStair(b, y, FLOORS[fi + 1].y - y); masterSpiral(b, y, FLOORS[fi + 1].y - y, fi); }
  dumbwaiter(b, y, fi);
  if (fi === 3) {   // F4：电梯在本层凭钥匙开门
    const w = { t: 0.2, y, h: f.h, mat: 'plaster' };
    cutWall(b, { ...w, ax: 'x', at: -12.5, u0: 12.4, u1: 15.6, open: [{ c: 14, w: 1.2, bot: 0, top: 2.3, kind: 'door' }] }, null, 0);
    cutWall(b, { ...w, ax: 'x', at: -16.5, u0: 12.4, u1: 15.6, open: [] }, null, 0);
    for (const x of [12.5, 15.5]) cutWall(b, { ...w, ax: 'z', at: x, u0: -16.5, u1: -12.5, open: [] }, null, 0);
  }
  // 大厅柱（仿斑岩，x ±8，1.2 → 10.2 通高：F1 段 + F2 段）与楼座栏杆
  const HZ = [4.5, 9.5, 14.5, 19.5];
  if (fi === 0) for (const x of [-8, 8]) for (const z of HZ) {
    const k = new Kit(b, x, 0, z);
    k.bx('trim', 0, y, 0, 1.25, 0.25, 1.25); k.geo('trim', ATTIC(), 0, y + 0.25, 0, 0.45, 0.4, 0.45);
    k.cyl(mk('scagliola'), 0, y + 0.65, 0, 0.45, FLOORS[1].y - y - 0.65, 20, 0.985);
  }
  if (fi === 1) {
    for (const x of [-8, 8]) for (const z of HZ) {
      const k = new Kit(b, x, 0, z), top = FLOORS[2].y;
      k.cyl(mk('scagliola'), 0, y, 0, 0.443, top - y - 1.05, 20, 0.87);
      k.geo('trim', G.lathe('hallBell', [[0, 0], [0.4, 0], [0.42, 0.06], [0.4, 0.1], [0.44, 0.5], [0.52, 0.85], [0.6, 0.95], [0, 0.95]], 20), 0, top - 1.05, 0, 1, 1, 1);
      for (let i = 0; i < 8; i++) { const a = i * PI / 4; k.geo(mk('ormolu'), G.sph(6, 4), Math.sin(a) * 0.46, top - 0.7, Math.cos(a) * 0.46, 0.12, 0.22, 0.06, a, 0.3); }
      k.geo('trim', ABACUS(), 0, top - 0.12, 0, 0.62, 0.12, 0.62);
    }
    ironRail(b, -11.7, 4, 11.7, 4, y, 1.0);
    ironRail(b, -95.9, -6, -84.1, -6, y, 1.0); ironRail(b, -95.9, 6, -84.1, 6, y, 1.0); ironRail(b, -96, -6, -96, 6, y, 1.0); ironRail(b, -84, -6, -84, 6, y, 1.0);
  }
  if (fi === 2) for (const x of [-8, 8]) for (const z of HZ) ionic(b, x, z, y, FLOORS[3].y, 0.35, mk('marble'));
  // 门廊柱在本层的截面 + 连廊 / 音乐厅后殿
  if (fi <= 2) for (const x of PC) { stub(b, x, PZ, y, pr(Math.max(y, P_SHAFT0)), 24); if (fi === 0) b.bb('trim', x - 0.945, y, PZ - 0.945, x + 0.945, y + 0.3, PZ + 0.945); }
  if (fi === 0) { b.bb('pavers', -15.3, y, 22.45, 15.3, y + 0.03, 29.4); links(null, b); musicHall(null, b); }
  // 墙面装饰（WP-B）：每个非 minor 房间
  for (const r of rooms) {
    if (r.minor || r.container) continue;
    const info = L.room[r.id] || { ops: [], t: {}, ext: new Set() }, T = info.t;
    const rect = [r.r[0] + (T['-x'] || 0.3) / 2, r.r[1] - (T['+x'] || 0.3) / 2, r.r[2] + (T['-z'] || 0.3) / 2, r.r[3] - (T['+z'] || 0.3) / 2];
    const tallSides = [...new Set([...info.ext, ...(r.tall || [])])];
    dress(b, r, { y, h: roomH(r), rect, openings: info.ops, tallSides });
  }
}
function buildRoofCut(b) {
  const y = FLOORS[4].y;
  roofLevel(b, true);
  drumAndDome(b, true);
  for (const r of roomsOf(4)) {
    if (r.minor || r.container) continue;
    if (r.id === '502') { dress(b, r, { y, h: 6, rect: [-6.7, 6.7, -4.7, 8.7], openings: [], tallSides: ['-z', '+z', '-x', '+x'], round: { cx: 0, cz: 2, r: DRUM.R - DRUM.t } }); continue; }
    const k = KIOSKS.find((q) => q.id === r.id); if (!k) continue;
    const [x0, x1, z0, z1] = k.r, t = 0.15;
    dress(b, r, { y, h: k.h, rect: [x0 + t, x1 - t, z0 + t, z1 - t], openings: [{ side: k.door.side, a: k.door.c - 0.6, b: k.door.c + 0.6, bot: 0, top: 2.4, kind: 'door' }], tallSides: ['-z', '+z', '-x', '+x'] });
  }
}

/* ================================================================
 * buildHouse(full, site)；兼容旧调用 buildHouse(full, cut, site)
 * ================================================================ */
export function buildHouse(full, a, c) {
  let site = a, cut = null;
  if (c !== undefined) { cut = a; site = c; }
  LAYOUT.length = 0;
  shell(full);
  entablature(full[3]);
  portico(full);
  wingRoofs(full[2]);
  libraryTop(full[1]);
  musicHall(full[0], null);
  links(full[0], null);
  roofLevel(full[4], false);
  drumAndDome(full[4], false);
  podium(site);
  if (cut) cut.forEach((b, i) => buildCut(b, i));
}
// 旧接口：两翼已并入 buildHouse；等 main.js 删掉调用后移除
export function buildWings() { }

/* ================================================================
 * 竖井（半透明色柱，每层一段；只画 floors 里的层，停站层更亮）
 * ================================================================ */
export function buildShafts(floorGroups) {
  const mk2 = (s, op) => new THREE.MeshStandardMaterial({ color: s.color, transparent: true, opacity: op, depthWrite: false, roughness: 0.6, emissive: s.color, emissiveIntensity: 0.1 });
  const mats = SHAFTS.map((s) => mk2(s, 0.13)), dim = SHAFTS.map((s) => mk2(s, 0.06));
  const edgeMats = SHAFTS.map((s) => new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: 0.55 }));
  const out = [];
  FLOORS.forEach((f, fi) => {
    const g = new THREE.Group(); g.name = 'shafts' + fi;
    SHAFTS.forEach((s, si) => {
      const fl = s.floors || FLOORS.map((_, i) => i); if (!fl.includes(fi)) return;
      let y0 = f.y, h = fi === 4 ? 3.2 : f.h;
      if (fi === 0 && s.b1 != null) { y0 = s.b1; h = f.y + f.h - s.b1; }
      const [x0, x1, z0, z1] = s.r, box = new THREE.BoxGeometry(x1 - x0 - 0.1, h - 0.1, z1 - z0 - 0.1);
      const stop = (s.stops || fl).includes(fi);
      const m = new THREE.Mesh(box, stop ? mats[si] : dim[si]); m.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2); m.renderOrder = 4;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(box), edgeMats[si]); e.position.copy(m.position);
      m.userData.shaft = s; m.userData.stop = stop; g.add(m, e);
    });
    floorGroups[fi].add(g); out.push(g);
  });
  return out;
}

// 调试 / 断言用
export const _debug = { layout, facadeOps, rectMinus, holesOf };
