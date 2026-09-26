// 伊甸庄园 · 岛与园林：倒锥岩基、岛缘石栏、前庭喷泉、法式花坛、人工湖与水榭、迷宫、玫瑰园、温室、菜园、停靠平台、树木
import * as THREE from 'three';
import { G, mat4, Kit, srand } from './lib.js';
import { ISLAND } from './plan.js';
import { balustrade } from './building.js';
import { topiaryPot, bench as benchF } from './furniture.js';

const PI = Math.PI, TAU = PI * 2;
const R = srand(2024);

/* ---------- 岛轮廓 ---------- */
export function islandR(th) {
  const c = Math.cos(th), s = Math.sin(th);
  const e = 1 / Math.sqrt((c / ISLAND.rx) ** 2 + (s / ISLAND.rz) ** 2);
  let n = 0.034 * Math.sin(3 * th + 0.7) + 0.026 * Math.sin(5 * th + 2.1) + 0.013 * Math.sin(11 * th + 0.3) + 0.006 * Math.sin(23 * th + 1.1);
  const d = Math.atan2(Math.sin(th - PI / 2), Math.cos(th - PI / 2)); n *= 1 - Math.exp(-((d / 0.16) ** 2));   // 停靠平台处取直
  return e * (1 + n);
}
const NO = 180;
const OUT = []; for (let i = 0; i < NO; i++) { const th = i / NO * TAU, r = islandR(th); OUT.push([Math.cos(th) * r, Math.sin(th) * r, th, r]); }
function inIsland(x, z, inset = 0) { const th = Math.atan2(z, x), r = Math.hypot(x, z); return r < islandR(th) - inset; }

/* ---------- 禁种区（规则园林、建筑、路） ---------- */
const ZONES = [];
const rect = (x0, z0, x1, z1) => ZONES.push({ t: 'r', x0, z0, x1, z1 });
const circ = (x, z, r) => ZONES.push({ t: 'c', x, z, r });
const ell = (x, z, rx, rz) => ZONES.push({ t: 'e', x, z, rx, rz });
function free(x, z, pad = 0) {
  for (const q of ZONES) {
    if (q.t === 'r' && x > q.x0 - pad && x < q.x1 + pad && z > q.z0 - pad && z < q.z1 + pad) return false;
    if (q.t === 'c' && Math.hypot(x - q.x, z - q.z) < q.r + pad) return false;
    if (q.t === 'e' && ((x - q.x) / (q.rx + pad)) ** 2 + ((z - q.z) / (q.rz + pad)) ** 2 < 1) return false;
  }
  return true;
}

/* ---------- 小工具 ---------- */
function path(b, x0, z0, x1, z1, w = 6, y = 0.03) {  // 直线砾石路
  const L = Math.hypot(x1 - x0, z1 - z0); b.put('gravel', G.box, (x0 + x1) / 2, y / 2, (z0 + z1) / 2, L + w * 0.0, y, w, -Math.atan2(z1 - z0, x1 - x0));
}
function disc(b, key, x, z, r, y0 = 0, h = 0.05, seg = 48) { b.put(key, G.cyl(seg), x, y0 + h / 2, z, r, h, r); }
const torR = new Map();
function hedgeRing(b, x, z, r, arc = TAU, rot = 0, tube = 0.4, h = 1.6, key = 'hedge') {
  const k = `${r}_${arc}_${tube}`; let g = torR.get(k);
  if (!g) { g = new THREE.TorusGeometry(r, tube, 5, Math.max(12, Math.ceil(r * arc * 1.2)), arc).rotateX(PI / 2); torR.set(k, g); }
  b.put(key, g, x, tube * h * 0.5, z, 1, h, 1, rot);
}
function hedgeLine(b, x0, z0, x1, z1, w = 0.8, h = 0.8) { const L = Math.hypot(x1 - x0, z1 - z0); b.put('hedge', G.box, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, L, h, w, -Math.atan2(z1 - z0, x1 - x0), [0, h, 0.65]); }
function hedgeRect(b, x0, z0, x1, z1, w = 0.8, h = 0.8) { hedgeLine(b, x0, z0, x1, z0, w, h); hedgeLine(b, x0, z1, x1, z1, w, h); hedgeLine(b, x0, z0 + w / 2, x0, z1 - w / 2, w, h); hedgeLine(b, x1, z0 + w / 2, x1, z1 - w / 2, w, h); }
const CONE_COL = ['#46643a', '#4d6c3e', '#3f5c35'];
function cone(b, x, z, h = 3, r = 0.9) { b.inst('cone', mat4(x, 0, z, r, h, r), CONE_COL[(R() * 3) | 0]); }
function ball(b, x, z, r = 0.8, y = 0) { b.inst('ball', mat4(x, y + r, z, r, r * 0.95, r), '#577a44'); }
const TREE_COL = ['#56743f', '#62824a', '#4c6a3a', '#6f8a4e', '#5a7a47', '#7d8a4a', '#48653a'];
function tree(b, x, z, s = 1, kind) {
  const h = (9 + R() * 6) * s, r = (3.4 + R() * 1.8) * s;
  kind = kind || (R() < 0.12 ? 'cone' : R() < 0.5 ? 'crown' : 'crown2');
  const col = TREE_COL[(R() * TREE_COL.length) | 0];
  if (kind === 'cone') { b.inst('trunk', mat4(x, 0, z, 0.3 * s, h * 0.2, 0.3 * s)); b.inst('cone', mat4(x, h * 0.12, z, r * 0.62, h * 1.05, r * 0.62, R() * 6), '#3f5d36'); return; }
  b.inst('trunk', mat4(x, 0, z, 0.38 * s, h * 0.55, 0.38 * s));
  b.inst(kind, mat4(x, h * 0.64, z, r, r * (0.78 + R() * 0.22), r, R() * 6), col);
  const nl = 1 + ((R() * 2) | 0);
  for (let i = 0; i < nl; i++) { const a = R() * TAU, d = r * 0.58; b.inst(kind === 'crown' ? 'crown2' : 'crown', mat4(x + Math.cos(a) * d, h * (0.5 + R() * 0.14), z + Math.sin(a) * d, r * 0.6, r * 0.52, r * 0.6, R() * 6), col); }
}
function lamp(b, x, z, s = 1, y = 0) { b.inst('lamp', mat4(x, y, z, s, s, s)); }
function statue(b, x, z, ry = 0, s = 1) {
  const k = new Kit(b, x, 0, z, ry);
  k.bx('trim', 0, 0, 0, 1.3 * s, 0.25 * s, 1.3 * s); k.bx('stone', 0, 0.25 * s, 0, 1.0 * s, 1.5 * s, 1.0 * s); k.bx('trim', 0, 1.75 * s, 0, 1.25 * s, 0.2 * s, 1.25 * s);
  const fig = G.lathe('fig', [[0, 0], [0.4, 0], [0.4, 0.12], [0.34, 0.14], [0.36, 0.6], [0.3, 1.1], [0.24, 1.35], [0.27, 1.55], [0.22, 1.72], [0.12, 1.8], [0.1, 1.86], [0, 1.88]], 10);
  k.geo('trim', fig, 0, 1.95 * s, 0, s, s, s);
  k.sph('trim', 0, 1.95 * s + 2.0 * s, 0, 0.14 * s, 0.17 * s, 0.15 * s, 8, 6);
  k.box('trim', 0.28 * s, 1.95 * s + 1.35 * s, 0.1 * s, 0.1 * s, 0.6 * s, 0.1 * s, 0, 0.5, 0.3);
}
function urnPed(b, x, z, s = 1) { const k = new Kit(b, x, 0, z); k.bx('trim', 0, 0, 0, 1.0 * s, 1.1 * s, 1.0 * s); k.bx('trim', 0, 1.1 * s, 0, 1.15 * s, 0.12 * s, 1.15 * s); k.inst('urn', 0, 1.22 * s, 0, 1.3 * s, 1.3 * s, 1.3 * s); }
function stoneBench(b, x, z, ry) { const k = new Kit(b, x, 0, z, ry); k.bx('trim', 0, 0.42, 0, 2.2, 0.1, 0.6); for (const sx of [-0.8, 0.8]) k.bx('trimShade', sx, 0, 0, 0.3, 0.42, 0.5); }
function monopteros(b, x, z, r = 5, h = 5, y = 0, n = 8, domeMat = 'lead') {
  const k = new Kit(b, x, y, z);
  k.cyl('trim', 0, 0, 0, r + 1.0, 0.3, 32); k.cyl('trim', 0, 0.3, 0, r + 0.6, 0.3, 32);
  for (let i = 0; i < n; i++) { const a = i * TAU / n; const cx = Math.sin(a) * r, cz = Math.cos(a) * r;
    k.cyl('trim', cx, 0.6, cz, 0.35, 0.2, 12); k.cyl('trim', cx, 0.8, cz, 0.24, h - 0.6, 12, 0.88); k.cyl('trim', cx, h + 0.2, cz, 0.3, 0.2, 12, 1.2); }
  k.cyl('trim', 0, h + 0.4, 0, r + 0.45, 0.6, 32); k.cyl('trim', 0, h + 1.0, 0, r + 0.7, 0.2, 32);
  k.geo(domeMat, G.hemi(24), 0, h + 1.2, 0, r + 0.3, (r + 0.3) * 0.75, r + 0.3);
  k.sph('gold', 0, h + 1.2 + (r + 0.3) * 0.75 + 0.25, 0, 0.3, 0.3, 0.3); k.geo('gold', G.cone(6), 0, h + 1.2 + (r + 0.3) * 0.75 + 0.8, 0, 0.1, 0.9, 0.1);
}

/* ================================================================ */
export function buildIsland(scene, b) {
  /* --- 顶面草坪 --- */
  const shape = new THREE.Shape(OUT.map(([x, z]) => new THREE.Vector2(x, -z)));
  const top = new THREE.ShapeGeometry(shape, 1).rotateX(-PI / 2);
  b.add('grass', top, null);

  /* --- 岩基（倒锥）：顶部土层 + 岩层 --- */
  const rings = [[1.0, 0], [1.002, -0.6], [0.996, -3.2], [0.975, -8], [0.93, -17], [0.86, -30], [0.76, -48], [0.63, -70], [0.5, -95], [0.37, -122], [0.25, -150], [0.14, -178], [0.06, -204], [0.015, -222]];
  const nr = rings.length, na = NO + 1, pos = [], col = [], uv = [], idx = [];
  const soil = new THREE.Color('#6d5438'), moss = new THREE.Color('#6a7445'), rockTop = new THREE.Color('#b3a795'), rockBot = new THREE.Color('#5a5047');
  for (let k = 0; k < nr; k++) for (let i = 0; i < na; i++) {
    const th = (i % NO) / NO * TAU, r0 = islandR(th), [s, y] = rings[k];
    const nz = k < 2 ? 1 : 1 + 0.07 * Math.sin(7 * th + k * 1.3) + 0.045 * Math.sin(13 * th + k * 2.7) + 0.03 * Math.sin(29 * th + k);
    const r = r0 * s * nz;
    pos.push(Math.cos(th) * r, y + (k > 1 ? Math.sin(th * 9 + k) * 2.5 : 0), Math.sin(th) * r);
    const c = new THREE.Color();
    if (k < 3) c.copy(soil); else if (k === 3) c.copy(moss).lerp(rockTop, 0.4); else c.copy(rockTop).lerp(rockBot, (k - 3) / (nr - 4));
    col.push(c.r, c.g, c.b);
    uv.push(i / NO * 30, y / 38);
  }
  for (let k = 0; k < nr - 1; k++) for (let i = 0; i < NO; i++) { const a = k * na + i, c = a + na; idx.push(a, a + 1, c, a + 1, c + 1, c); }
  const tip = pos.length / 3; pos.push(0, -236, 0); col.push(rockBot.r * 0.8, rockBot.g * 0.8, rockBot.b * 0.8); uv.push(0, -6);
  for (let i = 0; i < NO; i++) { const a = (nr - 1) * na + i; idx.push(a, a + 1, tip); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cg.setIndex(idx); cg.computeVertexNormals();
  b.add('rock', cg, null);
  // 垂挂根须与藤蔓
  for (let i = 0; i < 260; i++) {
    const th = R() * TAU, r = islandR(th) * (0.97 - R() * 0.2), y = -1 - R() * 6 - (R() < 0.3 ? R() * 25 : 0);
    const L = 5 + R() * 26 * (R() < 0.3 ? 1.6 : 1), w = 0.18 + R() * 0.45;
    b.inst('root', mat4(Math.cos(th) * r, y, Math.sin(th) * r, w, L, w, 0, (R() - 0.5) * 0.25, (R() - 0.5) * 0.25), R() < 0.45 ? '#6f7f45' : '#5a4838');
  }
  // 周围几块漂浮碎岩
  for (const [th, d, y, s] of [[0.5, 1.12, -60, 9], [2.3, 1.1, -85, 6], [3.6, 1.15, -40, 7], [4.4, 1.08, -110, 5], [5.5, 1.13, -70, 8], [1.2, 1.18, -130, 4]]) {
    const r = islandR(th) * d * 0.9, g = new THREE.DodecahedronGeometry(1, 0);
    b.put('rock', g, Math.cos(th) * r, y, Math.sin(th) * r, s * 1.2, s * 1.6, s, th, 0.3, 0.2);
    b.put('grass', G.cyl(8), Math.cos(th) * r, y + s * 1.25, Math.sin(th) * r, s * 0.8, 0.3, s * 0.7);
  }

  /* --- 岛缘：石压顶 + 栏杆（贴图）+ 立墩；环岛步道与灯 --- */
  const bp = [];
  for (let i = 0; i < NO; i++) {
    const [x0, z0, th] = OUT[i], [x1, z1] = OUT[(i + 1) % NO];
    const inDock = Math.abs(((x0 + x1) / 2)) < 27 && (z0 + z1) / 2 > 200;
    const ix = (p, d) => { const r = Math.hypot(p[0], p[1]); return [p[0] * (1 - d / r), p[1] * (1 - d / r)]; };
    const a = ix([x0, z0], 0.6), c = ix([x1, z1], 0.6), L = Math.hypot(c[0] - a[0], c[1] - a[1]), ang = -Math.atan2(c[1] - a[1], c[0] - a[0]);
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    b.put('trim', G.box, mx, 0.25, mz, L + 0.3, 0.5, 1.2, ang);
    if (!inDock) {
      b.put('trim', G.box, mx, 1.42, mz, L + 0.2, 0.14, 0.42, ang);
      const pg = new THREE.PlaneGeometry(L, 0.9); const u = pg.attributes.uv; for (let j = 0; j < u.count; j++) u.setX(j, u.getX(j) * L / 0.32);
      b.add('balPanel', pg, mat4(mx, 0.95, mz, 1, 1, 1, ang));
      if (i % 4 === 0) { b.box('trim', x0 * (1 - 0.6 / Math.hypot(x0, z0)), 0.8, z0 * (1 - 0.6 / Math.hypot(x0, z0)), 0.6, 1.6, 0.6, ang); }
      if (i % 12 === 0) b.inst('urn', mat4(a[0], 1.6, a[1], 1, 1, 1));
    }
    // 步道
    const p0 = ix([x0, z0], 4), p1 = ix([x1, z1], 4), q0 = ix([x0, z0], 10), q1 = ix([x1, z1], 10);
    bp.push(p0, p1, q1, q0);
    if (i % 9 === 4 && !inDock) { const l = ix([x0, z0], 10.8); lamp(b, l[0], l[1], 0.9); }
  }
  { const g = new THREE.BufferGeometry(), P = [], N = [], U = [];
    for (let i = 0; i < bp.length; i += 4) { const [a, c, d, e] = bp.slice(i, i + 4); for (const p of [a, c, d, a, d, e]) { P.push(p[0], 0.035, p[1]); N.push(0, 1, 0); U.push(0, 0); } }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    b.add('gravel', g, null); }
}

/* ================================================================ */
export function buildGardens(b) {
  /* --- 建筑周边铺装、荣誉庭院、车道 --- */
  rect(-90, -34, 90, 38);
  b.bb('gravel', -86, 0, 14, 86, 0.04, 66); rect(-56, 26, 56, 66);
  // 荣誉庭院两块草坪（tapis vert），中间留车道
  for (const sx of [-1, 1]) { const x0 = sx > 0 ? 17 : -51, x1 = sx > 0 ? 51 : -17;
    b.bb('grass', x0, 0, 31, x1, 0.07, 60); hedgeRect(b, x0, 31, x1, 60, 0.5, 0.45);
    b.bb('flowers', x0 + 1, 0, 31.8, x1 - 1, 0.3, 33); b.bb('flowers', x0 + 1, 0, 58, x1 - 1, 0.3, 59.2);
    urnPed(b, (x0 + x1) / 2, 45.5, 0.9); for (const [cx, cz] of [[x0 + 1.2, 34.2], [x1 - 1.2, 34.2], [x0 + 1.2, 56.8], [x1 - 1.2, 56.8]]) ball(b, cx, cz, 0.75); }
  b.bb('gravel', -44, 0, -33, 44, 0.04, -12);
  // 荣誉庭院两侧低树篱 + 锥形紫杉
  for (const sx of [-1, 1]) { hedgeLine(b, sx * 56, 36, sx * 56, 64, 0.9, 1.0); for (let z = 38; z <= 64; z += 6.5) cone(b, sx * 56, z, 3.6, 1.0); }
  // 铁艺大门与门柱（前庭与喷泉广场之间）
  for (const sx of [-1, 1]) {
    for (const x of [sx * 9, sx * 30, sx * 52]) { b.bb('rustic', x - 1, 0, 65, x + 1, 3.6, 67); b.bb('trim', x - 1.2, 3.6, 64.8, x + 1.2, 3.85, 67.2); b.inst('urn', mat4(x, 3.85, 66, 1.4, 1.4, 1.4)); }
    const xa = sx * 10, xb = sx * 51;
    b.bb('trim', Math.min(xa, xb), 0, 65.6, Math.max(xa, xb), 0.5, 66.4);
    b.bb('iron', Math.min(xa, xb), 2.3, 65.95, Math.max(xa, xb), 2.4, 66.05); b.bb('iron', Math.min(xa, xb), 0.9, 65.95, Math.max(xa, xb), 1.0, 66.05);
    for (let x = Math.min(xa, xb) + 0.15; x < Math.max(xa, xb); x += 0.3) { b.bb('iron', x - 0.02, 0.5, 65.98, x + 0.02, 2.55, 66.02); if (Math.round(x / 0.3) % 2 === 0) b.bb('gold', x - 0.03, 2.55, 65.97, x + 0.03, 2.7, 66.03); }
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) { const x = sx * (6 - i * 0.5); b.bb('iron', Math.min(x, sx * 8.5), 0, 65.97, Math.max(x, sx * 8.5), 3.2, 66.03); }

  /* --- 喷泉广场（前庭） --- */
  const FX = 0, FZ = 92; circ(FX, FZ, 34);
  disc(b, 'gravel', FX, FZ, 33, 0, 0.045, 64);
  fountain(b, FX, FZ);
  for (let i = 0; i < 8; i++) { const a = i * PI / 4 + PI / 8, r = 21;
    const x = FX + Math.sin(a) * r, z = FZ + Math.cos(a) * r;
    b.put('hedge', G.box, x, 0.4, z, 6.5, 0.8, 3.6, a, [0, 0.8, 0.6]); b.put('flowers', G.box, x, 0.45, z, 5.5, 0.9, 2.6, a);
    cone(b, FX + Math.sin(a + 0.2) * 26.5, FZ + Math.cos(a + 0.2) * 26.5, 3.2, 0.9); cone(b, FX + Math.sin(a - 0.2) * 26.5, FZ + Math.cos(a - 0.2) * 26.5, 3.2, 0.9); }
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; statue(b, FX + Math.sin(a) * 29, FZ + Math.cos(a) * 29, a + PI, 1.1); }
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; lamp(b, FX + Math.sin(a) * 31.5, FZ + Math.cos(a) * 31.5, 1.0); }

  /* --- 中轴林荫道 + 刺绣花坛 --- */
  rect(-8, 60, 8, 240); path(b, 0, 66, 0, 238, 14);
  rect(-80, 120, 80, 222); b.bb('gravel', -78, 0, 122, 78, 0.04, 220);
  for (const [cx, cz] of [[-43, 148], [43, 148], [-43, 195], [43, 195]]) parterre(b, cx, cz, 58, 40);
  for (const sx of [-1, 1]) {
    for (let z = 126; z <= 216; z += 6) cone(b, sx * 11, z, 3.4, 0.95);
    for (let z = 130; z <= 214; z += 16) lamp(b, sx * 8.5, z, 1.0);
    for (const z of [171.5]) { statue(b, sx * 20, z, sx > 0 ? -PI / 2 : PI / 2, 1.0); statue(b, sx * 66, z, sx > 0 ? -PI / 2 : PI / 2, 1.0); }
    for (let z = 70; z <= 118; z += 12) lamp(b, sx * 8.5, z, 1.0);
  }
  // 两侧椴树林荫道
  for (const sx of [-1, 1]) for (let z = 40; z <= 222; z += 9) { tree(b, sx * 86, z, 0.95, 'crown'); tree(b, sx * 96, z + 4.5, 0.95, 'crown'); }
  for (const sx of [-1, 1]) { path(b, sx * 91, 34, sx * 91, 226, 6); rect(sx > 0 ? 82 : -100, 34, sx > 0 ? 100 : -82, 226); }

  /* --- 横轴：z=104 东西向林荫道（通迷宫与菜园）；后轴 z=-44 --- */
  path(b, -252, 104, -34, 104, 8); path(b, 34, 104, 252, 104, 8); rect(-252, 99, -34, 109); rect(34, 99, 252, 109);
  for (const sx of [-1, 1]) for (let x = 44; x <= 244; x += 10) { if (Math.abs(x - 91) < 8) continue; if (inIsland(sx * x, 96, 14)) tree(b, sx * x, 96, 0.85, 'crown2'); if (inIsland(sx * x, 112, 14)) tree(b, sx * x, 112, 0.85, 'crown2'); }
  path(b, -260, -44, 260, -44, 7); rect(-262, -48, 262, -40);
  path(b, -140, -44, -140, 104, 6); path(b, 140, -44, 140, 104, 6); rect(-143, -44, -137, 104); rect(137, -44, 143, 104);
  for (const sx of [-1, 1]) for (let z = -36; z <= 96; z += 12) { tree(b, sx * 134, z, 0.8, 'cone'); tree(b, sx * 146, z + 6, 0.8, 'cone'); }

  /* --- 后庭：人工湖、环湖步道、水榭 --- */
  const LX = 0, LZ = -120, LRX = 94, LRZ = 56; ell(LX, LZ, LRX + 12, LRZ + 12);
  const lakeR = (th) => 1 + 0.05 * Math.sin(3 * th + 1) + 0.03 * Math.sin(5 * th + 0.4);
  const lp = []; for (let i = 0; i < 96; i++) { const th = i / 96 * TAU, s = lakeR(th); lp.push([LX + Math.cos(th) * LRX * s, LZ + Math.sin(th) * LRZ * s, th]); }
  const lshape = new THREE.Shape(lp.map(([x, z]) => new THREE.Vector2(x, -z)));
  b.add('water', new THREE.ShapeGeometry(lshape, 1).rotateX(-PI / 2), mat4(0, 0.18, 0));
  const ringStrip = (key, d0, d1, y) => { const P = [], N = [], U = [];
    for (let i = 0; i < lp.length; i++) { const [x0, z0] = lp[i], [x1, z1] = lp[(i + 1) % lp.length];
      const o = (p, d) => { const dx = p[0] - LX, dz = p[1] - LZ, r = Math.hypot(dx, dz); return [p[0] + dx / r * d, p[1] + dz / r * d]; };
      const a = o([x0, z0], d0), c = o([x1, z1], d0), e = o([x1, z1], d1), f = o([x0, z0], d1);
      for (const p of [a, e, c, a, f, e]) { P.push(p[0], y, p[1]); N.push(0, 1, 0); U.push(0, 0); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); b.add(key, g, null); };
  ringStrip('trim', -0.3, 1.4, 0.42); ringStrip('gravel', 4, 10, 0.04);
  // 压顶石的立面
  for (let i = 0; i < lp.length; i++) { const [x0, z0] = lp[i], [x1, z1] = lp[(i + 1) % lp.length]; b.put('trimShade', G.box, (x0 + x1) / 2, 0.21, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) + 0.1, 0.42, 1.6, -Math.atan2(z1 - z0, x1 - x0)); }
  for (let i = 0; i < lp.length; i += 8) { const [x, z, th] = lp[i]; const s = 1 + 11 / Math.hypot(x - LX, z - LZ) * 1; lamp(b, LX + (x - LX) * (1 + 11.5 / Math.hypot(x - LX, z - LZ)), LZ + (z - LZ) * (1 + 11.5 / Math.hypot(x - LX, z - LZ)), 0.9); }
  for (let i = 4; i < lp.length; i += 12) { const [x, z] = lp[i]; const d = Math.hypot(x - LX, z - LZ); stoneBench(b, LX + (x - LX) * (1 + 3 / d), LZ + (z - LZ) * (1 + 3 / d), -Math.atan2(z - LZ, x - LX) - PI / 2); }
  // 近岸半圆码头台阶
  b.put('trim', G.cyl(32, 1), 0, 0.3, -64, 10, 0.6, 5); b.put('pavers', G.cyl(32, 1), 0, 0.62, -64, 9.4, 0.04, 4.6);
  path(b, 0, -32, 0, -60, 10);
  // 水榭（远岸）
  b.put('trim', G.cyl(32), 0, 0.35, -172, 10.5, 0.7, 10.5); b.put('pavers', G.cyl(32), 0, 0.72, -172, 10, 0.04, 10);
  path(b, 0, -178, 0, -192, 6); monopteros(b, 0, -172, 5.2, 5.4, 0.72, 8);
  for (let i = 0; i < 6; i++) { const a = PI * 0.15 + i * PI * 0.14; urnPed(b, Math.cos(a) * 10 + 0, -172 + Math.sin(a) * 10 * -1 + 0, 0.7); }
  // 湖边树（柳 / 圆冠）
  for (let i = 0; i < 44; i++) { const th = R() * TAU, d = 16 + R() * 20; const x = LX + Math.cos(th) * (LRX * lakeR(th) + d), z = LZ + Math.sin(th) * (LRZ * lakeR(th) + d);
    if (z > -58 || !inIsland(x, z, 16)) continue; if (Math.abs(x) < 14 && z < -170) continue; tree(b, x, z, 0.9 + R() * 0.3); }

  /* --- 树篱迷宫（西） --- */
  const MX = -205, MZ = 40, MC = 12, MS = 8, MH = MC * MS; rect(MX - MH / 2 - 6, MZ - MH / 2 - 6, MX + MH / 2 + 6, MZ + MH / 2 + 6);
  b.bb('gravel', MX - MH / 2 - 5, 0, MZ - MH / 2 - 5, MX + MH / 2 + 5, 0.04, MZ + MH / 2 + 5);
  maze(b, MX, MZ, MC, MS);
  path(b, MX + MH / 2 + 5, MZ + 4, -140, MZ + 4, 6);

  /* --- 玫瑰园（西南） --- */
  const RX = -200, RZ = -112; circ(RX, RZ, 48);
  disc(b, 'gravel', RX, RZ, 45, 0, 0.045, 64);
  for (const [r0, r1] of [[7, 13], [18, 27]]) { b.put('roses', new THREE.RingGeometry(r0, r1, 64, 1).rotateX(-PI / 2), RX, 0.28, RZ); b.put('soil', new THREE.RingGeometry(r0, r1, 64, 1).rotateX(-PI / 2), RX, 0.1, RZ); hedgeRing(b, RX, RZ, r0, TAU, 0, 0.35, 1.3); hedgeRing(b, RX, RZ, r1, TAU, 0, 0.35, 1.3); }
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; b.put('gravel', G.box, RX + Math.sin(a) * 17, 0.34, RZ + Math.cos(a) * 17, 2.6, 0.04, 22, a); }
  for (let i = 0; i < 90; i++) { const a = R() * TAU, r = R() < 0.4 ? 8 + R() * 4.5 : 19 + R() * 7.5; b.inst('ball', mat4(RX + Math.sin(a) * r, 0.3, RZ + Math.cos(a) * r, 0.55, 0.5, 0.55), ['#b8455a', '#d98aa0', '#e9c9cf', '#9e3346', '#6f8c4f'][(R() * 5) | 0]); }
  // 拱架回廊
  for (let i = 0; i < 28; i++) { const a = i * TAU / 28; if (i % 7 === 0) continue; const k = new Kit(b, RX + Math.sin(a) * 36, 0, RZ + Math.cos(a) * 36, a);
    for (const sx of [-1.3, 1.3]) k.cyl('iron', sx, 0, 0, 0.07, 2.6, 6);
    k.geo('iron', new THREE.TorusGeometry(1.3, 0.06, 4, 12, PI), 0, 2.6, 0, 1, 1, 1);
    for (let j = 0; j < 4; j++) k.inst('ball', (j - 1.5) * 0.8, 2.6 + Math.sin((j + 0.5) / 4 * PI) * 1.2, 0, 0.45, 0.4, 0.45, 0, j % 2 ? '#c85b6f' : '#6a8a4c'); }
  monopteros(b, RX, RZ, 3.2, 3.8, 0.2, 6, 'lead');
  path(b, RX + 45, RZ, -140, RZ + 20, 6);

  /* --- 温室（东南）+ 前面的柑橘箱阵列 --- */
  orangery(b, 200, -100);
  path(b, 140, -60, 200, -60, 6);

  /* --- 围墙菜园（东） --- */
  kitchenGarden(b, 205, 45);

  /* --- 停靠平台与引道 --- */
  dock(b);

  /* --- 后方树林、各处树丛（在禁种区外随机） --- */
  let n = 0;
  for (let tries = 0; tries < 5000 && n < 420; tries++) {
    const x = (R() * 2 - 1) * ISLAND.rx, z = (R() * 2 - 1) * ISLAND.rz;
    if (!inIsland(x, z, 16) || !free(x, z, 5)) continue;
    // 成簇：离已有随机中心近的更容易出现
    const cl = Math.sin(x * 0.03) * Math.cos(z * 0.035) + Math.sin(x * 0.011 + z * 0.02);
    if (cl < -0.2 && R() < 0.75) continue;
    tree(b, x, z, 0.85 + R() * 0.45); n++;
  }
}

/* ---------- 喷泉：三层盆 ---------- */
function fountain(b, x, z) {
  const k = new Kit(b, x, 0, z);
  const rim = G.lathe('frim', [[11.4, 0], [12.6, 0], [12.7, 0.25], [12.4, 0.35], [12.5, 0.75], [12.8, 0.85], [12.7, 0.95], [11.3, 0.95], [11.2, 0.6], [11.4, 0.3]], 64);
  k.geo('trim', rim, 0, 0, 0); k.cyl('water', 0, 0, 0, 11.4, 0.62, 48);
  const bowl = G.lathe('fbowl', [[0, 0], [0.9, 0], [1.2, 0.2], [2.6, 0.55], [4.0, 0.95], [4.2, 1.2], [4.0, 1.25], [0, 1.1]], 40);
  k.geo('trim', G.lathe('fped', [[0, 0], [2.2, 0], [2.2, 0.4], [1.4, 0.6], [0.9, 1.2], [0.7, 2.0], [0.9, 2.3], [0, 2.3]], 24), 0, 0.6, 0);
  k.geo('trim', bowl, 0, 2.7, 0); k.cyl('water', 0, 3.75, 0, 3.85, 0.06, 32);
  k.geo('trim', G.lathe('fped2', [[0, 0], [0.8, 0], [0.5, 0.6], [0.4, 1.4], [0.6, 1.7], [0, 1.7]], 16), 0, 3.8, 0);
  k.geo('trim', bowl, 0, 5.4, 0, 0.5, 0.5, 0.5); k.cyl('water', 0, 5.92, 0, 1.9, 0.04, 24);
  k.geo('trim', G.lathe('ffin', [[0, 0], [0.35, 0], [0.2, 0.5], [0.3, 0.9], [0.12, 1.2], [0, 1.4]], 12), 0, 6.0, 0);
  k.sph('gold', 0, 7.45, 0, 0.22, 0.3, 0.22, 10, 8);
  // 水帘与水柱
  k.geo('spray', G.cyl(32, 1, true), 0, 1.75, 0, 4.15, 2.3, 4.15); k.geo('spray', G.cyl(24, 1, true), 0, 4.8, 0, 2.05, 1.3, 2.05);
  k.geo('spray', G.cone(8), 0, 8.4, 0, 0.18, 1.6, 0.18);
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; k.geo('spray', new THREE.TorusGeometry(2.4, 0.07, 4, 10, PI * 0.8), Math.sin(a) * 8.6, 0.6, Math.cos(a) * 8.6, 1, 1, 1, a + PI / 2); }
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; const q = new Kit(b, x + Math.sin(a) * 12.1, 0.95, z + Math.cos(a) * 12.1); q.bx('trim', 0, 0, 0, 1.0, 0.5, 1.0); q.inst('urn', 0, 0.5, 0, 1.2, 1.2, 1.2); }
}

/* ---------- 刺绣花坛 ---------- */
function parterre(b, cx, cz, w, d) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  b.bb('grass', x0, 0, z0, x1, 0.06, z1);
  hedgeRect(b, x0, z0, x1, z1, 0.8, 0.75);
  // 内圈花境
  for (const [a0, a1, b0, b1] of [[x0 + 1, x1 - 1, z0 + 1, z0 + 2.6], [x0 + 1, x1 - 1, z1 - 2.6, z1 - 1], [x0 + 1, x0 + 2.6, z0 + 2.6, z1 - 2.6], [x1 - 2.6, x1 - 1, z0 + 2.6, z1 - 2.6]]) b.bb('flowers', a0, 0, b0, a1, 0.35, b1);
  hedgeRect(b, x0 + 3.2, z0 + 3.2, x1 - 3.2, z1 - 3.2, 0.5, 0.55);
  // 彩色砂石带
  b.bb('gravel', x0 + 3.6, 0, cz - 1.2, x1 - 3.6, 0.08, cz + 1.2); b.bb('gravel', cx - 1.2, 0, z0 + 3.6, cx + 1.2, 0.08, z1 - 3.6);
  // 中心圆 + 角部涡卷 + 斜线
  hedgeRing(b, cx, cz, 7, TAU, 0, 0.35, 1.3); hedgeRing(b, cx, cz, 4.6, TAU, 0, 0.3, 1.2);
  disc(b, 'roses', cx, cz, 4.2, 0, 0.3, 32);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const qx = cx + sx * (w / 2 - 9), qz = cz + sz * (d / 2 - 8);
    hedgeRing(b, qx, qz, 4.2, PI, Math.atan2(sz, -sx) + (sx * sz > 0 ? 0 : PI) - PI / 2, 0.3, 1.2);
    hedgeRing(b, qx, qz, 1.8, TAU, 0, 0.28, 1.1); disc(b, 'flowers', qx, qz, 1.5, 0, 0.32, 16);
    const ex = cx + sx * 7.3 * 0.707, ez = cz + sz * 7.3 * 0.707; hedgeLine(b, ex, ez, qx - sx * 4.6 * 0.7, qz - sz * 4.6 * 0.7, 0.5, 0.55);
    cone(b, cx + sx * (w / 2 - 0.2), cz + sz * (d / 2 - 0.2), 3.2, 0.9);
  }
  urnPed(b, cx, cz, 1.0);
}

/* ---------- 迷宫 ---------- */
function maze(b, cx, cz, n, s) {
  const r = srand(77), vis = Array.from({ length: n }, () => Array(n).fill(false));
  const E = Array.from({ length: n }, () => Array(n).fill(true)), S = Array.from({ length: n }, () => Array(n).fill(true));
  const st = [[0, 0]]; vis[0][0] = true;
  while (st.length) { const [i, j] = st[st.length - 1]; const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, c]) => [i + a, j + c, a, c]).filter(([a, c]) => a >= 0 && c >= 0 && a < n && c < n && !vis[a][c]);
    if (!nb.length) { st.pop(); continue; } const [a, c, di, dj] = nb[(r() * nb.length) | 0];
    if (di === 1) E[i][j] = false; if (di === -1) E[a][c] = false; if (dj === 1) S[i][j] = false; if (dj === -1) S[a][c] = false; vis[a][c] = true; st.push([a, c]); }
  const x0 = cx - n * s / 2, z0 = cz - n * s / 2, h = 2.4, w = 1.3;
  const line = (xa, za, xb, zb) => { if (xa === xb) b.bb('hedge', xa - w / 2, 0, Math.min(za, zb) - w / 2, xa + w / 2, h, Math.max(za, zb) + w / 2, [0, h, 0.6]); else b.bb('hedge', Math.min(xa, xb) - w / 2, 0, za - w / 2, Math.max(xa, xb) + w / 2, h, za + w / 2, [0, h, 0.6]); };
  const mid = n / 2 | 0;
  // 外墙（东侧中间留入口，西侧中间留出口）
  line(x0, z0, x0 + n * s, z0); line(x0, z0 + n * s, x0 + n * s, z0 + n * s);
  line(x0, z0, x0, z0 + mid * s); line(x0, z0 + (mid + 1) * s, x0, z0 + n * s);
  line(x0 + n * s, z0, x0 + n * s, z0 + mid * s); line(x0 + n * s, z0 + (mid + 1) * s, x0 + n * s, z0 + n * s);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const inC = (i === mid || i === mid - 1) && (j === mid || j === mid - 1);
    if (i < n - 1 && E[i][j] && !(inC && (i === mid - 1))) line(x0 + (i + 1) * s, z0 + j * s, x0 + (i + 1) * s, z0 + (j + 1) * s);
    if (j < n - 1 && S[i][j] && !(inC && (j === mid - 1))) line(x0 + i * s, z0 + (j + 1) * s, x0 + (i + 1) * s, z0 + (j + 1) * s);
  }
  // 中心小喷泉
  const k = new Kit(b, x0 + mid * s, 0, z0 + mid * s);
  k.cyl('trim', 0, 0, 0, 3.2, 0.6, 32); k.cyl('water', 0, 0.1, 0, 2.8, 0.45, 32); k.cyl('trim', 0, 0.5, 0, 0.4, 1.2, 12); k.geo('trim', G.lathe('mz', [[0, 0], [0.2, 0], [1.2, 0.35], [1.25, 0.5], [0, 0.4]], 20), 0, 1.7, 0); k.sph('gold', 0, 2.3, 0, 0.2, 0.25, 0.2);
  for (const [a, c] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { k.bx('trim', a * 5.5, 0, c * 5.5, 0.9, 0.45, 0.9); k.inst('ball', a * 5.5, 0.45, c * 5.5, 0.6, 0.6, 0.6, 0, '#4c6b3d'); }
}

/* ---------- 温室 ---------- */
function orangery(b, cx, cz) {
  const w = 70, d = 16, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, H = 8;
  rect(x0 - 4, z0 - 6, x1 + 4, z1 + 36);
  b.bb('pavers', x0 - 3, 0, z0 - 3, x1 + 3, 0.5, z1 + 12);
  b.bb('rustic', x0, 0.5, z0, x1, 1.4, z1);
  b.bb('stone', x0, 1.4, z0, x1, H, z0 + 0.8);
  // 端部与中央石亭
  for (const [a, c, hh] of [[x0, x0 + 10, H + 1.5], [x1 - 10, x1, H + 1.5], [cx - 6, cx + 6, H + 2.5]]) {
    b.bb('stone', a, 1.4, z0, c, hh, z1 + (a === cx - 6 ? 1.2 : 0));
    const m = (a + c) / 2, zf = z1 + (a === cx - 6 ? 1.2 : 0);
    b.bb('trim', a - 0.4, hh, z0 - 0.4, c + 0.4, hh + 0.5, zf + 0.4);
    b.put('stone', G.prism(), m, hh + 0.5, zf - 0.1, c - a + 0.6, 2.2, 1.0);
    b.put('lead', G.prism(), m, hh + 0.5, (z0 + zf) / 2 - 0.4, c - a + 0.2, 2.1, zf - z0 - 0.4);
    // 拱窗
    for (const u of a === cx - 6 ? [m] : [m - 2.5, m + 2.5]) { b.bb('glass', u - 1.1, 2.0, zf + 0.01, u + 1.1, hh - 1.6, zf + 0.05); b.bb('trim', u - 1.35, hh - 1.6, zf, u + 1.35, hh - 1.3, zf + 0.15); if (a === cx - 6) b.bb('woodDark', u - 1.0, 1.4, zf + 0.02, u + 1.0, 4.4, zf + 0.08); }
  }
  // 玻璃长廊：石墩 + 大玻璃 + 玻璃屋顶
  for (let x = x0 + 10; x <= x1 - 10 + 0.01; x += 4) { if (x > cx - 6 && x < cx + 6) continue; b.bb('stone', x - 0.5, 1.4, z1 - 0.8, x + 0.5, H, z1); }
  for (const [a, c] of [[x0 + 10, cx - 6], [cx + 6, x1 - 10]]) {
    b.bb('glassHouse', a, 1.4, z1 - 0.5, c, H, z1 - 0.4);
    b.bb('trim', a, H, z0, c, H + 0.4, z1);
    b.put('glassHouse', G.prism(), (a + c) / 2, H + 0.4, (z0 + z1) / 2, c - a, 3.0, d, 0);
    for (let x = a; x <= c + 0.01; x += 2) { b.bb('frame', x - 0.04, 1.4, z1 - 0.48, x + 0.04, H, z1 - 0.4); const L = Math.hypot(d / 2, 3); for (const s of [-1, 1]) b.put('frame', G.box, x, H + 0.4 + 1.5, (z0 + z1) / 2 + s * d / 4, 0.06, 0.06, L, 0, s * Math.atan2(3, d / 2)); }
    for (let x = a + 2; x < c - 1; x += 4) { const k = new Kit(b, x, 1.4, cz + 2); topiaryPot(k, 1.1); }
  }
  // 门前柑橘箱阵
  for (let x = x0 + 4; x <= x1 - 4; x += 5.5) { topiaryPot(new Kit(b, x, 0.5, z1 + 6), 1.1); }
  for (let x = x0; x <= x1; x += 10) b.inst('ball', mat4(x, 0.5, z1 + 22, 1.4, 1.3, 1.4), '#56794a');
  b.bb('grass', x0 + 2, 0, z1 + 13, x1 - 2, 0.07, z1 + 32); hedgeRect(b, x0 + 2, z1 + 13, x1 - 2, z1 + 32, 0.7, 0.7);
  disc(b, 'water', cx, z1 + 22.5, 5, 0.05, 0.1, 32); hedgeRing(b, cx, z1 + 22.5, 5.4, TAU, 0, 0.35, 1.0, 'trim');
}

/* ---------- 围墙菜园 ---------- */
function kitchenGarden(b, cx, cz) {
  const w = 90, d = 80, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  rect(x0 - 3, z0 - 3, x1 + 3, z1 + 3);
  b.bb('gravel', x0, 0, z0, x1, 0.04, z1);
  const wallSeg = (a0, b0, a1, b1) => { b.bb('stone', a0, 0, b0, a1, 2.2, b1); b.bb('trim', a0 - 0.15, 2.2, b0 - 0.15, a1 + 0.15, 2.4, b1 + 0.15); };
  wallSeg(x0, z0, x1, z0 + 0.6); wallSeg(x0, z1 - 0.6, cx - 3, z1); wallSeg(cx + 3, z1 - 0.6, x1, z1); wallSeg(x0, z0, x0 + 0.6, z1); wallSeg(x1 - 0.6, z0, x1, cz - 3); wallSeg(x1 - 0.6, cz + 3, x1, z1);
  for (const x of [cx - 3.6, cx + 3.6]) { b.bb('rustic', x - 0.6, 0, z1 - 0.7, x + 0.6, 3.2, z1 + 0.1); b.inst('urn', mat4(x, 3.2, z1 - 0.3, 1, 1, 1)); }
  const cols = ['#58793f', '#6c8c47', '#4d6d38', '#7f9650', '#8c7e46'];
  for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bx0 = qx < 0 ? x0 + 4 : cx + 3, bx1 = qx < 0 ? cx - 3 : x1 - 4, bz0 = qz < 0 ? z0 + 4 : cz + 3, bz1 = qz < 0 ? cz - 3 : z1 - 4;
    for (let z = bz0; z < bz1 - 1; z += 3.2) { b.bb('soil', bx0, 0, z, bx1, 0.3, z + 2.2); const c = cols[(R() * 5) | 0];
      b.bb(R() < 0.5 ? 'hedge' : 'flowers', bx0 + 0.4, 0.3, z + 0.6, bx1 - 0.4, 0.62 + R() * 0.3, z + 1.6); }
  }
  const k = new Kit(b, cx, 0, cz); k.cyl('trim', 0, 0, 0, 3.4, 0.6, 32); k.cyl('water', 0, 0.1, 0, 3.0, 0.45, 32);
  for (let x = x0 + 4; x < x1 - 2; x += 8) { tree(b, x, z0 + 2.5, 0.35, 'crown2'); }
  // 园丁小屋
  const s = new Kit(b, x0 + 8, 0, z0 + 8); s.bx('stone', 0, 0, 0, 8, 3.6, 6); s.geo('terracotta', G.prism(), 0, 3.6, 0, 8.6, 2.2, 6.6); s.bx('woodDark', 0, 0, 3.01, 1.2, 2.2, 0.05);
  path(b, x0 - 1, cz, 140, cz, 6);
}

/* ---------- 停靠平台 ---------- */
function dock(b) {
  const x0 = -24, x1 = 24, zA = 226, zB = 300, y = 0.45;
  rect(-32, 214, 32, 306);
  b.bb('pavers', -30, 0, 214, 30, 0.08, 246);
  b.bb('trim', x0, -1.6, 238, x1, y, zB); b.bb('pavers', x0 + 0.3, y, 238, x1 - 0.3, y + 0.03, zB - 0.3);
  // 挑出部分的托梁与斜撑
  for (let x = x0 + 3; x <= x1 - 3; x += 7) {
    b.bb('trimShade', x - 0.8, -3.2, 244, x + 0.8, -1.6, zB - 1);
    const L = Math.hypot(40, 26); b.put('trimShade', G.box, x, -15, 262, 1.2, 1.4, L, 0, -Math.atan2(26, 40));
  }
  b.bb('trimShade', x0, -3.4, zB - 1.4, x1, -1.6, zB);
  // 两侧与端部栏杆（端部中间留登船口）
  balustrade(b, x0 + 0.4, 250, x0 + 0.4, zB - 0.4, y, 1.1, { posts: 5, urns: 2 });
  balustrade(b, x1 - 0.4, 250, x1 - 0.4, zB - 0.4, y, 1.1, { posts: 5, urns: 2 });
  balustrade(b, x0 + 0.4, zB - 0.4, -7, zB - 0.4, y, 1.1, { posts: 5.6 }); balustrade(b, 7, zB - 0.4, x1 - 0.4, zB - 0.4, y, 1.1, { posts: 5.6 });
  // 停靠圈与引导线
  const ringG = new THREE.RingGeometry(8.6, 9.2, 64).rotateX(-PI / 2); b.put('gold', ringG, 0, y + 0.05, 278);
  b.put('gold', new THREE.RingGeometry(5.4, 5.6, 48).rotateX(-PI / 2), 0, y + 0.05, 278);
  for (let z = 250; z < 268; z += 3) b.bb('gold', -0.15, y + 0.03, z, 0.15, y + 0.06, z + 1.6);
  for (let z = 252; z <= 296; z += 4) for (const x of [x0 + 1.6, x1 - 1.6]) b.inst('bollard', mat4(x, y, z, 1, 1, 1));
  for (const x of [-7, 7]) { b.bb('trim', x - 0.7, y, zB - 1.1, x + 0.7, y + 0.5, zB + 0.3); b.inst('lamp', mat4(x, y + 0.5, zB - 0.4, 1.5, 1.5, 1.5)); }
  // 两座候船亭
  for (const sx of [-1, 1]) monopteros(b, sx * 19, 232, 2.4, 3.4, 0.08, 6, 'lead');
  for (const sx of [-1, 1]) for (let z = 218; z <= 244; z += 6.5) lamp(b, sx * 11, z, 1);
}
