// 伊甸庄园 · 岛与园林（模型轴；岛椭圆中心在 (0, 25)，府邸在原点）
// 前半部规则式：前庭喷泉、刺绣花坛、中轴大道与椴树、雕像台座、玫瑰园、迷园、停靠平台
// 后半部风景式：后庭台地、人工湖（湖心圆亭、水榭船屋、白石小桥）、围墙花园与橘园、果园、林带
// 西北服务区（仆役楼、悬浮车库、工坊、悬浮载具库、载具停靠坪；原马车房 / 机库 / 机坪，几何未动）用绿篱和树团挡住；岛缘观景台与四座结界锚碑
import * as THREE from 'three';
import { G, mat4, Kit, srand, MATS } from './lib.js';
import * as P from './plan.js';
import { balustrade } from './building.js';
import * as FUR from './furniture.js';

const PI = Math.PI, TAU = PI * 2;
const R = srand(2024);
const ISLE = P.ISLE || { cx: 0, cz: 25, ...(P.ISLAND || { rx: 335, rz: 250 }) };
const CX = ISLE.cx || 0, CZ = ISLE.cz ?? 25;
const SUB = (b, t) => (b && typeof b.sub === 'function' ? b.sub(t) : b);
const DT = (b) => SUB(b, 'detail');   // 室外小件：栏杆柱、瓮、灯柱、系缆桩、花钵
const TINT = new Map();
function tint(geom, hex) {   // 顶点色烘焙：白底材质 + 顶点色
  const key = geom.uuid + hex; let g = TINT.get(key);
  if (!g) { g = geom.clone(); const n = g.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); TINT.set(key, g); }
  return g;
}
const BRONZE = '#6e5a3c', VERDI = '#5f9a86', BRICK = '#a4604a';

/* ---------- 岛轮廓（相对岛心） ---------- */
export function islandR(th) {
  const c = Math.cos(th), s = Math.sin(th);
  const e = 1 / Math.sqrt((c / ISLE.rx) ** 2 + (s / ISLE.rz) ** 2);
  let n = 0.034 * Math.sin(3 * th + 0.7) + 0.026 * Math.sin(5 * th + 2.1) + 0.013 * Math.sin(11 * th + 0.3) + 0.006 * Math.sin(23 * th + 1.1);
  const d = Math.atan2(Math.sin(th - PI / 2), Math.cos(th - PI / 2)); n *= 1 - Math.exp(-((d / 0.16) ** 2));   // 停靠平台处取直
  return e * (1 + n);
}
const NO = 180;
const OUT = []; for (let i = 0; i < NO; i++) { const th = i / NO * TAU, r = islandR(th); OUT.push([CX + Math.cos(th) * r, CZ + Math.sin(th) * r, th, r]); }
function inIsland(x, z, inset = 0) { const dx = x - CX, dz = z - CZ; return Math.hypot(dx, dz) < islandR(Math.atan2(dz, dx)) - inset; }
function rimFrac(x, z) { const dx = x - CX, dz = z - CZ; return Math.hypot(dx, dz) / islandR(Math.atan2(dz, dx)); }

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
function path(b, x0, z0, x1, z1, w = 6, y = 0.03, key = 'gravel') { const L = Math.hypot(x1 - x0, z1 - z0); b.put(key, G.box, (x0 + x1) / 2, y / 2, (z0 + z1) / 2, L, y, w, -Math.atan2(z1 - z0, x1 - x0)); }
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
function tree(b, x, z, s = 1, kind, col) {
  const h = (9 + R() * 6) * s, r = (3.4 + R() * 1.8) * s;
  kind = kind || (R() < 0.12 ? 'cone' : R() < 0.5 ? 'crown' : 'crown2');
  col = col || TREE_COL[(R() * TREE_COL.length) | 0];
  if (kind === 'cone') { b.inst('trunk', mat4(x, 0, z, 0.3 * s, h * 0.2, 0.3 * s)); b.inst('cone', mat4(x, h * 0.12, z, r * 0.62, h * 1.05, r * 0.62, R() * 6), '#3f5d36'); return; }
  b.inst('trunk', mat4(x, 0, z, 0.38 * s, h * 0.55, 0.38 * s));
  b.inst(kind, mat4(x, h * 0.64, z, r, r * (0.78 + R() * 0.22), r, R() * 6), col);
  const nl = 1 + ((R() * 2) | 0);
  for (let i = 0; i < nl; i++) { const a = R() * TAU, d = r * 0.58; b.inst(kind === 'crown' ? 'crown2' : 'crown', mat4(x + Math.cos(a) * d, h * (0.5 + R() * 0.14), z + Math.sin(a) * d, r * 0.6, r * 0.52, r * 0.6, R() * 6), col); }
}
function lamp(b, x, z, s = 1, y = 0) { DT(b).inst('lamp', mat4(x, y, z, s, s, s)); }
const FIG = () => G.lathe('fig', [[0, 0], [0.4, 0], [0.4, 0.12], [0.34, 0.14], [0.36, 0.6], [0.3, 1.1], [0.24, 1.35], [0.27, 1.55], [0.22, 1.72], [0.12, 1.8], [0.1, 1.86], [0, 1.88]], 10);
function statue(b, x, z, ry = 0, s = 1) {
  const k = new Kit(b, x, 0, z, ry);
  k.bx('trim', 0, 0, 0, 1.3 * s, 0.25 * s, 1.3 * s); k.bx('stone', 0, 0.25 * s, 0, 1.0 * s, 1.5 * s, 1.0 * s); k.bx('trim', 0, 1.75 * s, 0, 1.25 * s, 0.2 * s, 1.25 * s);
  k.geo('trim', FIG(), 0, 1.95 * s, 0, s, s, s);
  k.sph('trim', 0, 1.95 * s + 2.0 * s, 0, 0.14 * s, 0.17 * s, 0.15 * s, 8, 6);
  k.box('trim', 0.28 * s, 1.95 * s + 1.35 * s, 0.1 * s, 0.1 * s, 0.6 * s, 0.1 * s, 0, 0.5, 0.3);
}
function pedestal(b, x, z, ry = 0) {   // 大道雕像台座（带胸像 / 瓮交替）
  const k = new Kit(b, x, 0, z, ry);
  k.bx('trim', 0, 0, 0, 1.2, 0.2, 1.2); k.bx('stone', 0, 0.2, 0, 0.9, 1.4, 0.9); k.bx('trim', 0, 1.6, 0, 1.1, 0.18, 1.1);
  k.geo('trim', FIG(), 0, 1.78, 0, 0.8, 0.8, 0.8); k.sph('trim', 0, 1.78 + 1.62, 0, 0.12, 0.14, 0.12, 8, 6);
}
function urnPed(b, x, z, s = 1) { const k = new Kit(DT(b), x, 0, z); k.bx('trim', 0, 0, 0, 1.0 * s, 1.1 * s, 1.0 * s); k.bx('trim', 0, 1.1 * s, 0, 1.15 * s, 0.12 * s, 1.15 * s); k.inst('urn', 0, 1.22 * s, 0, 1.3 * s, 1.3 * s, 1.3 * s); }
function stoneBench(b, x, z, ry) { const k = new Kit(DT(b), x, 0, z, ry); k.bx('trim', 0, 0.42, 0, 2.2, 0.1, 0.6); for (const sx of [-0.8, 0.8]) k.bx('trimShade', sx, 0, 0, 0.3, 0.42, 0.5); }
function monopteros(b, x, z, r = 5, h = 5, y = 0, n = 8, domeMat = 'lead') {
  const k = new Kit(b, x, y, z);
  k.cyl('trim', 0, 0, 0, r + 1.0, 0.3, 32); k.cyl('trim', 0, 0.3, 0, r + 0.6, 0.3, 32);
  for (let i = 0; i < n; i++) { const a = i * TAU / n; const cx = Math.sin(a) * r, cz = Math.cos(a) * r;
    k.cyl('trim', cx, 0.6, cz, 0.35, 0.2, 12); k.cyl('trim', cx, 0.8, cz, 0.24, h - 0.6, 12, 0.88); k.cyl('trim', cx, h + 0.2, cz, 0.3, 0.2, 12, 1.2); }
  k.cyl('trim', 0, h + 0.4, 0, r + 0.45, 0.6, 32); k.cyl('trim', 0, h + 1.0, 0, r + 0.7, 0.2, 32);
  k.geo(domeMat, G.hemi(24), 0, h + 1.2, 0, r + 0.3, (r + 0.3) * 0.75, r + 0.3);
  k.sph('gold', 0, h + 1.2 + (r + 0.3) * 0.75 + 0.25, 0, 0.3, 0.3, 0.3); k.geo('gold', G.cone(6), 0, h + 1.2 + (r + 0.3) * 0.75 + 0.8, 0, 0.1, 0.9, 0.1);
}
function prop(name) { try { const Pp = FUR.PROP; return Pp && typeof Pp[name] === 'function' ? Pp[name] : null; } catch (e) { return null; } }

/* ================================================================ */
export function buildIsland(scene, b) {
  /* --- 顶面草坪 --- */
  const shape = new THREE.Shape(OUT.map(([x, z]) => new THREE.Vector2(x, -z)));
  b.add('grass', new THREE.ShapeGeometry(shape, 1).rotateX(-PI / 2), null);

  /* --- 岩基（倒锥）：顶部土层 + 岩层 --- */
  const rings = [[1.0, 0], [1.002, -0.6], [0.996, -3.2], [0.975, -8], [0.93, -17], [0.86, -30], [0.76, -48], [0.63, -70], [0.5, -95], [0.37, -122], [0.25, -150], [0.14, -178], [0.06, -204], [0.015, -222]];
  const nr = rings.length, na = NO + 1, pos = [], col = [], uv = [], idx = [];
  const soil = new THREE.Color('#6d5438'), moss = new THREE.Color('#6a7445'), rockTop = new THREE.Color('#b3a795'), rockBot = new THREE.Color('#5a5047');
  for (let k = 0; k < nr; k++) for (let i = 0; i < na; i++) {
    const th = (i % NO) / NO * TAU, r0 = islandR(th), [s, y] = rings[k];
    const nz = k < 2 ? 1 : 1 + 0.07 * Math.sin(7 * th + k * 1.3) + 0.045 * Math.sin(13 * th + k * 2.7) + 0.03 * Math.sin(29 * th + k);
    const r = r0 * s * nz;
    pos.push(CX + Math.cos(th) * r, y + (k > 1 ? Math.sin(th * 9 + k) * 2.5 : 0), CZ + Math.sin(th) * r);
    const c = new THREE.Color();
    if (k < 3) c.copy(soil); else if (k === 3) c.copy(moss).lerp(rockTop, 0.4); else c.copy(rockTop).lerp(rockBot, (k - 3) / (nr - 4));
    col.push(c.r, c.g, c.b);
    uv.push(i / NO * 30, y / 38);
  }
  for (let k = 0; k < nr - 1; k++) for (let i = 0; i < NO; i++) { const a = k * na + i, c = a + na; idx.push(a, a + 1, c, a + 1, c + 1, c); }
  const tip = pos.length / 3; pos.push(CX, -236, CZ); col.push(rockBot.r * 0.8, rockBot.g * 0.8, rockBot.b * 0.8); uv.push(0, -6);
  for (let i = 0; i < NO; i++) { const a = (nr - 1) * na + i; idx.push(a, a + 1, tip); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cg.setIndex(idx); cg.computeVertexNormals();
  b.add('rock', cg, null);
  // 垂挂根须与藤蔓
  for (let i = 0; i < 260; i++) {
    const th = R() * TAU, r = islandR(th) * (0.97 - R() * 0.2), y = -1 - R() * 6 - (R() < 0.3 ? R() * 25 : 0);
    const L = 5 + R() * 26 * (R() < 0.3 ? 1.6 : 1), w = 0.18 + R() * 0.45;
    b.inst('root', mat4(CX + Math.cos(th) * r, y, CZ + Math.sin(th) * r, w, L, w, 0, (R() - 0.5) * 0.25, (R() - 0.5) * 0.25), R() < 0.45 ? '#6f7f45' : '#5a4838');
  }
  // 周围几块漂浮碎岩
  for (const [th, d, y, s] of [[0.5, 1.12, -60, 9], [2.3, 1.1, -85, 6], [3.6, 1.15, -40, 7], [4.4, 1.08, -110, 5], [5.5, 1.13, -70, 8], [1.2, 1.18, -130, 4]]) {
    const r = islandR(th) * d * 0.9, g = new THREE.DodecahedronGeometry(1, 0);
    b.put('rock', g, CX + Math.cos(th) * r, y, CZ + Math.sin(th) * r, s * 1.2, s * 1.6, s, th, 0.3, 0.2);
    b.put('grass', G.cyl(8), CX + Math.cos(th) * r, y + s * 1.25, CZ + Math.sin(th) * r, s * 0.8, 0.3, s * 0.7);
  }

  /* --- 岛缘：石压顶 + 栏杆（贴图）+ 石墩（约 45 m 一个）；环岛步道与灯 --- */
  const bp = [];
  const ix = (p, d) => { const dx = p[0] - CX, dz = p[1] - CZ, r = Math.hypot(dx, dz); return [CX + dx * (1 - d / r), CZ + dz * (1 - d / r)]; };
  for (let i = 0; i < NO; i++) {
    const [x0, z0] = OUT[i], [x1, z1] = OUT[(i + 1) % NO];
    const inDock = Math.abs((x0 + x1) / 2) < 15 && (z0 + z1) / 2 > 250;
    const a = ix([x0, z0], 0.6), c = ix([x1, z1], 0.6), L = Math.hypot(c[0] - a[0], c[1] - a[1]), ang = -Math.atan2(c[1] - a[1], c[0] - a[0]);
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    b.put('trim', G.box, mx, 0.25, mz, L + 0.3, 0.5, 1.2, ang);
    if (!inDock) {
      b.put('trim', G.box, mx, 1.42, mz, L + 0.2, 0.14, 0.42, ang);
      const pg = new THREE.PlaneGeometry(L, 0.9); const u = pg.attributes.uv; for (let j = 0; j < u.count; j++) u.setX(j, u.getX(j) * L / 0.32);
      b.add('balPanel', pg, mat4(mx, 0.95, mz, 1, 1, 1, ang));
      if (i % 4 === 0) b.box('trim', a[0], 0.8, a[1], 0.7, 1.6, 0.7, ang);
      if (i % 12 === 0) DT(b).inst('urn', mat4(a[0], 1.6, a[1], 1, 1, 1));
    }
    const p0 = ix([x0, z0], 4), p1 = ix([x1, z1], 4), q0 = ix([x0, z0], 10), q1 = ix([x1, z1], 10);
    bp.push(p0, p1, q1, q0);
    if (i % 9 === 4 && !inDock) { const l = ix([x0, z0], 10.8); lamp(b, l[0], l[1], 0.9); }
  }
  { const g = new THREE.BufferGeometry(), Pp = [], N = [], U = [];
    for (let i = 0; i < bp.length; i += 4) { const [a, c, d, e] = bp.slice(i, i + 4); for (const p of [a, c, d, a, d, e]) { Pp.push(p[0], 0.035, p[1]); N.push(0, 1, 0); U.push(0, 0); } }
    g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    b.add('gravel', g, null); }
}

/* ================================================================ */
export function buildGardens(b) {
  ZONES.length = 0;
  /* --- 府邸周边：建筑群、门前车道、两侧铺装 --- */
  rect(-112, -32, 112, 36);
  b.bb('gravel', -58, 0, 16.5, 58, 0.04, 36);           // 车道与翼楼前铺装
  b.bb('gravel', -104, 0, 12.5, -58, 0.04, 16.5); b.bb('gravel', 58, 0, 16.5, 104, 0.04, 20);
  for (const sx of [-1, 1]) { hedgeLine(b, sx * 58, 17, sx * 58, 35, 0.9, 1.0); for (let z = 19; z <= 35; z += 4) cone(b, sx * 58, z, 3.4, 0.95); }

  /* --- 前庭：x ±55，z 36…70；喷泉 (0, 53)；两侧 3 × 2 格刺绣花坛 --- */
  rect(-62, 34, 62, 72);
  b.bb('gravel', -16, 0, 36, 16, 0.045, 70);
  for (const sx of [-1, 1]) {
    b.bb('gravel', sx > 0 ? 15 : -57, 0, 36, sx > 0 ? 57 : -15, 0.04, 70);
    for (const x of [22, 36, 50]) for (const z of [45, 61]) parterre(b, sx * x, z);
    for (let z = 37; z <= 69; z += 6.4) tree(b, sx * 61, z, 0.8, 'crown', '#5f7f46');   // 椴树林荫
  }
  fountain(b, 0, 53);
  for (const [x, z] of [[-9, 40], [9, 40], [-9, 66], [9, 66]]) urnPed(b, x, z, 0.9);
  for (let i = 0; i < 8; i++) { const a = i * PI / 4 + PI / 8; lamp(b, Math.sin(a) * 11.5, 53 + Math.cos(a) * 11.5, 1.0); }
  // 前庭与大道之间的铁艺门
  for (const sx of [-1, 1]) {
    for (const x of [sx * 4.2, sx * 16]) { b.bb('rustic', x - 0.8, 0, 69.2, x + 0.8, 3.4, 70.8); b.bb('trim', x - 1.0, 3.4, 69.0, x + 1.0, 3.62, 71.0); DT(b).inst('urn', mat4(x, 3.62, 70, 1.3, 1.3, 1.3)); }
    const xa = sx * 5, xb = sx * 15.2, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    b.bb('trim', x0, 0, 69.7, x1, 0.45, 70.3);
    b.bb('iron', x0, 2.2, 69.96, x1, 2.28, 70.04); b.bb('iron', x0, 0.9, 69.96, x1, 0.98, 70.04);
    for (let x = x0 + 0.15; x < x1; x += 0.3) { b.bb('iron', x - 0.02, 0.45, 69.98, x + 0.02, 2.45, 70.02); if (Math.round(x / 0.3) % 2 === 0) SUB(b, 'fine').bb('gold', x - 0.03, 2.45, 69.97, x + 0.03, 2.6, 70.03); }
  }

  /* --- 中轴大道：x ±3，z 70…270；条纹草坪 x ±25；椴树 x ±7；16 座雕像台座 x ±4.5，z 70…126 --- */
  rect(-27, 70, 27, 262);
  path(b, 0, 70, 0, 268, 6, 0.045);
  const stripe = tint(G.box, '#e3ead6');   // 割草条纹：隔条略暗（对比度减半）
  for (let z = 72; z < 268; z += 12.5) for (const sx of [-1, 1]) b.put('grass', stripe, sx * 14, 0.015, z + 3.125, 21.2, 0.03, 6.25);
  for (const sx of [-1, 1]) {
    for (let z = 74; z <= 262; z += 8) tree(b, sx * 7, z, z < 130 ? 0.6 : 0.72, 'crown', '#5c7c44');
    for (let z = 70; z <= 126; z += 8) pedestal(b, sx * 4.5, z, sx > 0 ? -PI / 2 : PI / 2);
    for (let z = 136; z <= 262; z += 16) lamp(b, sx * 4.2, z, 0.9);
    hedgeLine(b, sx * 25.5, 72, sx * 25.5, 262, 0.7, 0.7);
  }

  /* --- 横向小径：前庭 → 玫瑰园 / 迷园 --- */
  path(b, 57, 70, 70, 70, 4); path(b, -70, 70, -57, 70, 4);
  rect(55, 67, 72, 73); rect(-72, 67, -55, 73);

  /* --- 玫瑰园：(95, 70) 直径 50 的下沉圆园 --- */
  roseGarden(b, 95, 70);
  /* --- 迷园：(−95, 70) 50 × 50，中心日晷 --- */
  rect(-122, 43, -68, 97);
  b.bb('gravel', -121, 0, 44, -69, 0.04, 96);
  maze(b, -95, 70, 10, 4.8);

  /* --- 后庭：台阶下（z −31）到 −51 的下层庭院，再下到湖岸 --- */
  rect(-32, -54, 32, -22);
  b.bb('pavers', -30, 0, -51, 30, 0.05, -31);
  for (const sx of [-1, 1]) { const x0 = sx > 0 ? 6 : -28, x1 = sx > 0 ? 28 : -6; b.bb('grass', x0, 0, -49, x1, 0.08, -33); hedgeRect(b, x0, -49, x1, -33, 0.5, 0.5); urnPed(b, (x0 + x1) / 2, -41, 0.9); for (const [cx, cz] of [[x0 + 1, -34], [x1 - 1, -34], [x0 + 1, -48], [x1 - 1, -48]]) ball(b, cx, cz, 0.7); }
  balustrade(DT(b), -30, -51, -5, -51, 0, 1.0, { posts: 5, urns: 2 }); balustrade(DT(b), 5, -51, 30, -51, 0, 1.0, { posts: 5, urns: 2 });
  path(b, 0, -51, 0, -71, 8, 0.04, 'pavers');
  for (const sx of [-1, 1]) for (let z = -54; z >= -68; z -= 7) lamp(b, sx * 5, z, 0.9);

  /* --- 人工湖：x −60…75，z −70…−135 --- */
  lake(b);

  /* --- 围墙花园（菜园）x 110…180，z −85…−135；橘园靠北墙 --- */
  kitchenGarden(b);
  /* --- 果园 x 190…240，z −55…−105 --- */
  orchard(b);
  /* --- 预留草坪 ×2 (±175, 10)，105 × 95 --- */
  for (const sx of [-1, 1]) reserveLawn(b, sx * 175, 10);
  /* --- 服务区（西北）与紫藤廊 --- */
  serviceZone(shifted(b, 0, SZ_DZ)); pergolaWalk(b);
  /* --- 岛缘观景台、结界锚碑、停靠平台 --- */
  lookouts(b);
  for (const [x, z] of [[-235, -140], [235, -140], [-235, 190], [235, 190]]) anchor(b, x, z);
  dock(b);

  /* --- 连接小径 --- */
  path(b, 30, -51, 100, -62, 4); path(b, 100, -62, 112, -108, 4); path(b, -30, -51, -78, -58, 4);
  path(b, 104, 16, 122, 10, 4); path(b, -104, 14, -122, 10, 4);
  path(b, 180, -110, 190, -80, 4);

  /* --- 林带（岛缘 0.84–0.95）、风景园孤植、树团 --- */
  let n = 0;
  for (let tries = 0; tries < 9000 && n < 520; tries++) {
    const th = R() * TAU, f = 0.82 + R() * 0.13, rr = islandR(th) * f;
    const x = CX + Math.cos(th) * rr, z = CZ + Math.sin(th) * rr;
    if (!free(x, z, 4)) continue;
    if (Math.abs(x) < 34 && z > 60) continue;            // 中轴视线留空
    tree(b, x, z, 0.85 + R() * 0.4); n++;
  }
  // 后半部英式风景园：孤植大树与树团（湖区除外）
  const clumps = [[-70, -40], [60, -45], [-45, -150], [70, -150], [-100, -170], [110, -60], [95, -175], [-20, -165]];
  for (const [cx, cz] of clumps) for (let i = 0; i < 9; i++) { const a = R() * TAU, d = R() * 11, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (free(x, z, 2) && inIsland(x, z, 12)) tree(b, x, z, 0.9 + R() * 0.35); }
  for (let tries = 0, k = 0; tries < 600 && k < 40; tries++) {
    const x = -110 + R() * 220, z = -35 - R() * 170;
    if (!free(x, z, 8) || !inIsland(x, z, 20) || rimFrac(x, z) > 0.8) continue;
    tree(b, x, z, 1.15 + R() * 0.4, R() < 0.25 ? 'cone' : 'crown'); k++;
  }
  // 前半部两侧树丛
  for (let tries = 0, k = 0; tries < 2500 && k < 160; tries++) {
    const x = (R() * 2 - 1) * 250, z = 36 + R() * 220;
    if (!inIsland(x, z, 14) || !free(x, z, 5) || Math.abs(x) < 34) continue;
    const cl = Math.sin(x * 0.03) * Math.cos(z * 0.035) + Math.sin(x * 0.011 + z * 0.02);
    if (cl < 0.1) continue;
    tree(b, x, z, 0.85 + R() * 0.4); k++;
  }
}

/* ---------- 喷泉：外池 r 7，三层水盘，顶上铜像「持苹果的少女」 ---------- */
function fountain(b, x, z) {
  circ(x, z, 9);
  const k = new Kit(b, x, 0, z), s = 7 / 12.7;
  disc(b, 'pavers', x, z, 9, 0, 0.05, 48);
  const rim = G.lathe('frim', [[11.4, 0], [12.6, 0], [12.7, 0.25], [12.4, 0.35], [12.5, 0.75], [12.8, 0.85], [12.7, 0.95], [11.3, 0.95], [11.2, 0.6], [11.4, 0.3]], 64);
  k.geo('trim', rim, 0, 0, 0, s, 1, s); k.cyl('water', 0, 0, 0, 11.4 * s, 0.62, 48);
  const bowl = G.lathe('fbowl', [[0, 0], [0.9, 0], [1.2, 0.2], [2.6, 0.55], [4.0, 0.95], [4.2, 1.2], [4.0, 1.25], [0, 1.1]], 40);
  k.geo('trim', G.lathe('fped', [[0, 0], [1.6, 0], [1.6, 0.4], [1.0, 0.6], [0.7, 1.2], [0.55, 2.0], [0.7, 2.3], [0, 2.3]], 24), 0, 0.6, 0);
  k.geo('trim', bowl, 0, 2.7, 0, 0.9, 0.9, 0.9); k.cyl('water', 0, 3.65, 0, 3.45, 0.06, 32);
  k.geo('trim', G.lathe('fped2', [[0, 0], [0.7, 0], [0.45, 0.6], [0.35, 1.3], [0.5, 1.6], [0, 1.6]], 16), 0, 3.7, 0);
  k.geo('trim', bowl, 0, 5.2, 0, 0.55, 0.55, 0.55); k.cyl('water', 0, 5.78, 0, 2.1, 0.04, 24);
  k.geo('trim', G.lathe('fped3', [[0, 0], [0.4, 0], [0.26, 0.5], [0.22, 0.9], [0.3, 1.1], [0, 1.1]], 12), 0, 5.8, 0);
  k.geo('trim', bowl, 0, 6.9, 0, 0.3, 0.3, 0.3); k.cyl('water', 0, 7.2, 0, 1.12, 0.03, 20);
  // 铜像「持苹果的少女」
  const fy = 7.3, fig = tint(FIG(), BRONZE);
  k.geo('trim', tint(G.cyl(12), BRONZE), 0, fy + 0.08, 0, 0.35, 0.16, 0.35);
  k.geo('trim', fig, 0, fy + 0.16, 0, 0.95, 0.95, 0.95);
  k.geo('trim', tint(G.sph(10, 8), BRONZE), 0, fy + 2.06, 0, 0.14, 0.17, 0.15);
  k.geo('trim', tint(G.box, BRONZE), 0.22, fy + 1.9, 0.05, 0.09, 0.62, 0.09, 0, 0, -0.35);   // 举起的手臂
  k.sph('gold', 0.36, fy + 2.28, 0.05, 0.11, 0.11, 0.11);                                        // 金苹果
  // 水帘与水柱
  k.geo('spray', G.cyl(32, 1, true), 0, 1.7, 0, 3.75, 2.0, 3.75); k.geo('spray', G.cyl(24, 1, true), 0, 4.6, 0, 2.3, 1.2, 2.3); k.geo('spray', G.cyl(16, 1, true), 0, 6.3, 0, 1.2, 0.9, 1.2);
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; k.geo('spray', new THREE.TorusGeometry(1.4, 0.05, 4, 10, PI * 0.8), Math.sin(a) * 5.1, 0.6, Math.cos(a) * 5.1, 1, 1, 1, a + PI / 2); }
}

/* ---------- 刺绣花坛（每格 12 × 13） ---------- */
function parterre(b, cx, cz) {
  const w = 12, d = 13, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  b.bb('grass', x0, 0, z0, x1, 0.06, z1);
  hedgeRect(b, x0, z0, x1, z1, 0.5, 0.5);
  b.put('gravel', tint(G.box, '#c98f6f'), cx, 0.07, cz, w - 1.6, 0.04, d - 1.6);   // 彩色碎砖底
  hedgeRing(b, cx, cz, 3.2, TAU, 0, 0.22, 1.0); disc(b, 'flowers', cx, cz, 2.2, 0, 0.3, 24);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const qx = cx + sx * 3.4, qz = cz + sz * 3.9;
    hedgeRing(b, qx, qz, 1.4, PI * 1.3, Math.atan2(sz, -sx), 0.18, 1.0);    // 卷草
    disc(b, 'roses', qx + sx * 0.6, qz + sz * 0.8, 0.6, 0, 0.28, 12);
  }
  hedgeLine(b, x0 + 0.6, cz, cx - 3.4, cz, 0.3, 0.45); hedgeLine(b, cx + 3.4, cz, x1 - 0.6, cz, 0.3, 0.45);
  cone(b, x0 + 0.3, z0 + 0.3, 2.2, 0.55); cone(b, x1 - 0.3, z1 - 0.3, 2.2, 0.55);
}

/* ---------- 玫瑰园：圆形下沉园，4 条放射小径，中心铁艺凉亭，外圈攀缘蔷薇拱廊 ---------- */
function roseGarden(b, RX, RZ) {
  circ(RX, RZ, 27);
  const low = -0.9;   // 下沉 0.9 m
  b.put('trim', G.cyl(64, 1, true), RX, low / 2, RZ, 25, -low + 0.35, 25);
  b.put('trim', G.tor(TAU, 4, 64, 0.02), RX, 0.35, RZ, 25.2, 1, 25.2);
  disc(b, 'gravel', RX, RZ, 24.8, low, 0.05, 64);
  for (const [r0, r1] of [[5, 10], [13, 20]]) { b.put('roses', new THREE.RingGeometry(r0, r1, 64, 1).rotateX(-PI / 2), RX, low + 0.3, RZ); b.put('soil', new THREE.RingGeometry(r0, r1, 64, 1).rotateX(-PI / 2), RX, low + 0.12, RZ); hedgeRing(b, RX, RZ, r0, TAU, 0, 0.3, 1.1); hedgeRing(b, RX, RZ, r1, TAU, 0, 0.3, 1.1); }
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.put('gravel', G.box, RX + Math.sin(a) * 12.5, low + 0.36, RZ + Math.cos(a) * 12.5, 2.4, 0.04, 17, a); }
  for (let i = 0; i < 70; i++) { const a = R() * TAU, r = R() < 0.4 ? 6 + R() * 3.5 : 14 + R() * 5.5; DT(b).inst('ball', mat4(RX + Math.sin(a) * r, low + 0.3, RZ + Math.cos(a) * r, 0.5, 0.45, 0.5), ['#b8455a', '#d98aa0', '#e9c9cf', '#9e3346', '#6f8c4f'][(R() * 5) | 0]); }
  // 外圈拱廊
  for (let i = 0; i < 24; i++) { const a = i * TAU / 24; if (i % 6 === 0) continue; const k = new Kit(b, RX + Math.sin(a) * 22.5, low, RZ + Math.cos(a) * 22.5, a);
    for (const sx of [-1.2, 1.2]) k.cyl('iron', sx, 0, 0, 0.06, 2.5, 6);
    k.geo('iron', new THREE.TorusGeometry(1.2, 0.05, 4, 12, PI), 0, 2.5, 0, 1, 1, 1);
    for (let j = 0; j < 4; j++) k.inst('ball', (j - 1.5) * 0.7, 2.5 + Math.sin((j + 0.5) / 4 * PI) * 1.1, 0, 0.4, 0.36, 0.4, 0, j % 2 ? '#c85b6f' : '#6a8a4c'); }
  // 四向台阶
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; for (let s = 0; s < 3; s++) b.put('trim', G.box, RX + Math.sin(a) * (25.4 - s * 0.4), 0.35 - (s + 1) * 0.42, RZ + Math.cos(a) * (25.4 - s * 0.4), 3, 0.42, 0.4, a); }
  // 中心铁艺凉亭
  const k = new Kit(b, RX, low, RZ);
  k.cyl('trim', 0, 0, 0, 3.2, 0.25, 24);
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; k.cyl('iron', Math.sin(a) * 2.6, 0.25, Math.cos(a) * 2.6, 0.07, 2.8, 6); }
  k.geo('iron', G.tor(TAU, 4, 24, 0.03), 0, 3.05, 0, 2.7, 1, 2.7);
  k.geo('iron', G.cone(12), 0, 3.1 + 0.9, 0, 3.0, 1.8, 3.0); k.sph('gold', 0, 5.0, 0, 0.18, 0.18, 0.18);
}

/* ---------- 迷宫（中心日晷） ---------- */
function maze(b, cx, cz, n, s) {
  const r = srand(77), vis = Array.from({ length: n }, () => Array(n).fill(false));
  const E = Array.from({ length: n }, () => Array(n).fill(true)), S = Array.from({ length: n }, () => Array(n).fill(true));
  const st = [[0, 0]]; vis[0][0] = true;
  while (st.length) { const [i, j] = st[st.length - 1]; const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, c]) => [i + a, j + c, a, c]).filter(([a, c]) => a >= 0 && c >= 0 && a < n && c < n && !vis[a][c]);
    if (!nb.length) { st.pop(); continue; } const [a, c, di, dj] = nb[(r() * nb.length) | 0];
    if (di === 1) E[i][j] = false; if (di === -1) E[a][c] = false; if (dj === 1) S[i][j] = false; if (dj === -1) S[a][c] = false; vis[a][c] = true; st.push([a, c]); }
  const x0 = cx - n * s / 2, z0 = cz - n * s / 2, h = 2.2, w = 1.1;
  const line = (xa, za, xb, zb) => { if (xa === xb) b.bb('hedge', xa - w / 2, 0, Math.min(za, zb) - w / 2, xa + w / 2, h, Math.max(za, zb) + w / 2, [0, h, 0.6]); else b.bb('hedge', Math.min(xa, xb) - w / 2, 0, za - w / 2, Math.max(xa, xb) + w / 2, h, za + w / 2, [0, h, 0.6]); };
  const mid = n / 2 | 0;
  line(x0, z0, x0 + n * s, z0); line(x0, z0 + n * s, x0 + n * s, z0 + n * s);
  line(x0, z0, x0, z0 + mid * s); line(x0, z0 + (mid + 1) * s, x0, z0 + n * s);
  line(x0 + n * s, z0, x0 + n * s, z0 + mid * s); line(x0 + n * s, z0 + (mid + 1) * s, x0 + n * s, z0 + n * s);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const inC = (i === mid || i === mid - 1) && (j === mid || j === mid - 1);
    if (i < n - 1 && E[i][j] && !(inC && (i === mid - 1))) line(x0 + (i + 1) * s, z0 + j * s, x0 + (i + 1) * s, z0 + (j + 1) * s);
    if (j < n - 1 && S[i][j] && !(inC && (j === mid - 1))) line(x0 + i * s, z0 + (j + 1) * s, x0 + (i + 1) * s, z0 + (j + 1) * s);
  }
  // 中心日晷
  const k = new Kit(b, x0 + mid * s, 0, z0 + mid * s);
  k.cyl('pavers', 0, 0, 0, 3.4, 0.06, 32); k.cyl('trim', 0, 0.06, 0, 0.5, 0.2, 12);
  k.geo('trim', G.lathe('dialPed', [[0, 0], [0.34, 0], [0.22, 0.2], [0.18, 0.8], [0.3, 0.95], [0, 0.95]], 12), 0, 0.26, 0);
  k.cyl(mk2('brass'), 0, 1.21, 0, 0.5, 0.04, 24); k.box(mk2('brass'), 0, 1.4, 0, 0.03, 0.35, 0.5, 0, 0.6, 0);
  for (const [a, c] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { k.bx('trim', a * 2.4, 0, c * 2.4, 0.7, 0.4, 0.7); k.inst('ball', a * 2.4, 0.4, c * 2.4, 0.5, 0.5, 0.5, 0, '#4c6b3d'); }
}
// 材质键：WP-B 的新键缺失时退回旧键
const FB2 = { brass: 'gold', ormolu: 'gold', mahogany: 'woodDark', walnut: 'woodDark', stoneFlag: 'pavers', terracotta: 'trim' };
function mk2(k) { if (MATS[k] || !Object.keys(MATS).length) return k; const f = FB2[k]; return f && MATS[f] ? f : 'trim'; }

/* ---------- 人工湖：湖心圆亭、水榭船屋、白石小桥 ---------- */
function lake(b) {
  const LX = 7.5, LZ = -102.5, LRX = 67.5, LRZ = 32.5; ell(LX, LZ, LRX + 8, LRZ + 8);
  const lakeR = (th) => 1 + 0.06 * Math.sin(3 * th + 1) + 0.035 * Math.sin(5 * th + 0.4) + 0.02 * Math.sin(9 * th + 2);
  const lp = []; for (let i = 0; i < 120; i++) { const th = i / 120 * TAU, s = lakeR(th); lp.push([LX + Math.cos(th) * LRX * s, LZ + Math.sin(th) * LRZ * s, th]); }
  const lshape = new THREE.Shape(lp.map(([x, z]) => new THREE.Vector2(x, -z)));
  b.add('water', new THREE.ShapeGeometry(lshape, 1).rotateX(-PI / 2), mat4(0, 0.18, 0));
  const ringStrip = (key, d0, d1, y) => { const Pp = [], N = [], U = [];
    for (let i = 0; i < lp.length; i++) { const [x0, z0] = lp[i], [x1, z1] = lp[(i + 1) % lp.length];
      const o = (p, d) => { const dx = p[0] - LX, dz = p[1] - LZ, r = Math.hypot(dx, dz); return [p[0] + dx / r * d, p[1] + dz / r * d]; };
      const a = o([x0, z0], d0), c = o([x1, z1], d0), e = o([x1, z1], d1), f = o([x0, z0], d1);
      for (const p of [a, e, c, a, f, e]) { Pp.push(p[0], y, p[1]); N.push(0, 1, 0); U.push(0, 0); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); b.add(key, g, null); };
  ringStrip('trim', -0.3, 1.2, 0.36); ringStrip('gravel', 4, 8, 0.04);
  for (let i = 0; i < lp.length; i++) { const [x0, z0] = lp[i], [x1, z1] = lp[(i + 1) % lp.length]; b.put('trimShade', G.box, (x0 + x1) / 2, 0.18, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) + 0.1, 0.36, 1.5, -Math.atan2(z1 - z0, x1 - x0)); }
  for (let i = 0; i < lp.length; i += 10) { const [x, z] = lp[i], d = Math.hypot(x - LX, z - LZ); lamp(b, LX + (x - LX) * (1 + 9.2 / d), LZ + (z - LZ) * (1 + 9.2 / d), 0.9); }
  for (let i = 5; i < lp.length; i += 15) { const [x, z] = lp[i], d = Math.hypot(x - LX, z - LZ); stoneBench(b, LX + (x - LX) * (1 + 2.6 / d), LZ + (z - LZ) * (1 + 2.6 / d), -Math.atan2(z - LZ, x - LX) - PI / 2); }
  // 近岸半圆码头台阶（后庭轴线尽头）
  b.put('trim', G.cyl(32, 1), 0, 0.3, -70, 8, 0.6, 4); b.put('pavers', G.cyl(32, 1), 0, 0.62, -70, 7.5, 0.04, 3.6);
  // 湖心小岛与圆亭（8 柱，柱圈直径 5.6，高 7）
  b.put('grass', G.cyl(32), 15, 0.25, -102, 5, 0.5, 5); b.put('trim', G.cyl(32, 1, true), 15, 0.25, -102, 5.1, 0.55, 5.1);
  monopteros(b, 15, -102, 2.8, 5.0, 0.5, 8);
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + 0.3; b.inst('ball', mat4(15 + Math.sin(a) * 4.3, 0.4, -102 + Math.cos(a) * 4.3, 0.6, 0.5, 0.6), '#5a7a45'); }
  // 水榭：(62, −93) 16 × 10，石台架在湖上，下层船屋
  const WX = 62, WZ = -93, k = new Kit(b, WX, 0, WZ);
  for (const sx of [-7, -2.4, 2.4, 7]) for (const sz of [-4.5, 4.5]) k.bx('stone', sx, 0, sz, 0.9, 1.8, 0.9);
  k.bx('stone', -8, 0, -5, 16, 1.8, 0.6); k.bx('stone', 7.4, 0, -5, 0.6, 1.8, 10);   // 船屋背墙、侧墙
  for (const sx of [-4.7, 0, 4.7]) { k.geo('trimShade', tint(G.box, '#a89f8f'), sx, 1.2, 5.02, 3.6, 1.2, 0.05); }
  k.bx('trim', 0, 1.8, 0, 16.4, 0.3, 10.4); k.bx('pavers', 0, 2.1, 0, 16, 0.04, 10);
  for (const sx of [-6.5, -2.2, 2.2, 6.5]) for (const sz of [-4, 4]) { k.cyl('trim', sx, 2.14, sz, 0.26, 3.6, 12, 0.88); k.bx('trim', sx, 5.74, sz, 0.66, 0.16, 0.66); }
  k.bx('trim', 0, 5.9, 0, 15.2, 0.5, 9.2); k.bx('trim', 0, 6.4, 0, 15.8, 0.2, 9.8);
  k.geo('lead', G.cyl(4, 0.3), 0, 6.6 + 0.8, 0, 11.6, 1.6, 7.4, PI / 4);
  balustrade(DT(b), WX - 7.8, WZ + 4.9, WX + 7.8, WZ + 4.9, 2.1, 0.9, { posts: 3.9 });
  balustrade(DT(b), WX - 7.8, WZ - 4.9, WX - 7.8, WZ + 4.9, 2.1, 0.9, { posts: 3.3 });
  path(b, WX + 8, WZ, 84, WZ - 4, 3.2, 2.1, 'pavers'); b.bb('trim', 70, 0, WZ - 1.9, 76, 2.08, WZ + 1.5);   // 通东岸的石堤
  // 初代木船（传承件 14）
  const bk = new Kit(b, WX, 0.3, WZ, PI / 2), boat = prop('boat');
  if (boat) boat(bk, { len: 6 });
  else { bk.geo(mk2('mahogany'), G.sph(16, 8), 0, 0.1, 0, 0.9, 0.45, 3.0); bk.bx(mk2('walnut'), 0, 0.3, 0, 1.4, 0.06, 4.8); for (const z of [-1.2, 0, 1.2]) bk.bx(mk2('walnut'), 0, 0.36, z, 1.5, 0.08, 0.25); }
  // 白石小桥：湖西端的出水溪上
  b.put('water', G.box, -78, 0.16, -104, 34, 0.02, 5, 0.12);
  const bx = -72, bz = -103.3, bridge = new Kit(b, bx, 0, bz, PI / 2 + 0.12);
  for (let i = 0; i < 9; i++) { const t = (i - 4) / 4, y = 1.1 * (1 - t * t); bridge.bx('trim', 0, y, t * 4, 2.6, 0.25, 1.05); }
  for (const sx of [-1.25, 1.25]) for (let i = 0; i <= 8; i++) { const t = (i - 4) / 4; bridge.bx('trim', sx, 1.1 * (1 - t * t) + 0.25, t * 4, 0.18, 0.8, 0.18); }
  path(b, -60, -104, -66, -103.8, 3); path(b, -78, -102.3, -92, -100, 3);
  // 湖边树
  for (let i = 0; i < 40; i++) { const th = R() * TAU, dd = 14 + R() * 20; const x = LX + Math.cos(th) * (LRX * lakeR(th) + dd), z = LZ + Math.sin(th) * (LRZ * lakeR(th) + dd);
    if (z > -62 || !inIsland(x, z, 16) || !free(x, z, 2)) continue; tree(b, x, z, 0.9 + R() * 0.3); }
}

/* ---------- 围墙花园（菜园）与橘园 ---------- */
function kitchenGarden(b) {
  const x0 = 110, x1 = 180, z0 = -135, z1 = -85, cx = 145, cz = -110, H = 3.5;
  rect(x0 - 3, -140, x1 + 3, z1 + 3);
  b.bb('gravel', x0, 0, z0, x1, 0.04, z1);
  const brick = tint(G.box, BRICK);
  const wallSeg = (a0, b0, a1, b1) => { b.put('trim', brick, (a0 + a1) / 2, H / 2, (b0 + b1) / 2, a1 - a0, H, b1 - b0); b.bb('trim', a0 - 0.12, H, b0 - 0.12, a1 + 0.12, H + 0.18, b1 + 0.12); };
  wallSeg(x0, z1 - 0.5, cx - 2.5, z1); wallSeg(cx + 2.5, z1 - 0.5, x1, z1);   // 南墙（中门）
  wallSeg(x0, z0, x0 + 0.5, cz - 2.5); wallSeg(x0, cz + 2.5, x0 + 0.5, z1); wallSeg(x1 - 0.5, z0, x1, z1); wallSeg(x0, z0, x1, z0 + 0.5);
  for (const x of [cx - 3.1, cx + 3.1]) { b.bb('rustic', x - 0.6, 0, z1 - 0.7, x + 0.6, 4.2, z1 + 0.2); DT(b).inst('urn', mat4(x, 4.2, z1 - 0.25, 1, 1, 1)); }
  // 墙面树形果树（南墙内侧、东墙内侧）
  for (let x = x0 + 3; x < x1 - 2; x += 4) if (Math.abs(x - cx) > 4) b.put('hedge', G.box, x, 1.8, z1 - 0.75, 3.2, 2.6, 0.3);
  // 24 块菜畦与花畦（4 × 6）
  const cols = ['#58793f', '#6c8c47', '#4d6d38', '#7f9650', '#8c7e46'];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const bx0 = x0 + 4 + i * 10.8 + (i >= 3 ? 1.6 : 0), bz0 = z0 + 13 + j * 8.4 + (j >= 2 ? 1.6 : 0);
    b.bb('soil', bx0, 0, bz0, bx0 + 9, 0.3, bz0 + 6.6);
    b.put(R() < 0.6 ? 'hedge' : 'flowers', tint(G.box, cols[(i * 4 + j) % 5] === '#8c7e46' ? '#e8dcc0' : '#ffffff'), bx0 + 4.5, 0.45, bz0 + 3.3, 8.2, 0.3 + R() * 0.3, 5.8);
  }
  const k = new Kit(b, cx, 0, cz + 6); k.cyl('trim', 0, 0, 0, 3.0, 0.6, 32); k.cyl('water', 0, 0.1, 0, 2.6, 0.45, 32);
  path(b, x0 + 2, cz + 6, x1 - 2, cz + 6, 3); path(b, cx, z0 + 12, cx, z1 - 1, 3);
  // 园丁小屋
  const s = new Kit(b, x1 - 8, 0, z1 - 8); s.bx('trim', 0, 0, 0, 7, 3.2, 5, 0); s.geo(mk2('terracotta'), G.prism(), 0, 3.2, 0, 7.6, 2.0, 5.6); s.bx(mk2('walnut'), 0, 0, 2.51, 1.1, 2.1, 0.05);
  orangery(b);
}
function orangery(b) {   // x 121…169，z −127…−137，高 7；石柱加大玻璃窗，朝南
  const x0 = 121, x1 = 169, z0 = -137, z1 = -127, H = 7, cx = 145;
  b.bb('rustic', x0 - 0.5, 0, z0 - 0.5, x1 + 0.5, 0.6, z1 + 0.8);
  b.bb('stone', x0, 0.6, z0, x1, H, z0 + 0.8);                        // 北墙（即围墙北段）
  for (const [a, c] of [[x0, x0 + 0.8], [x1 - 0.8, x1]]) b.bb('stone', a, 0.6, z0, c, H, z1);
  for (let x = x0 + 0.4; x <= x1 - 0.4 + 0.01; x += 4) { b.bb('stone', x - 0.45, 0.6, z1 - 0.9, x + 0.45, H, z1); b.bb('trim', x - 0.6, 0.6, z1 - 1.0, x + 0.6, 1.1, z1 + 0.1); b.bb('trim', x - 0.55, H - 0.9, z1 - 0.95, x + 0.55, H - 0.6, z1 + 0.05); }
  for (let x = x0 + 2.4; x < x1 - 1; x += 4) { b.bb('glass', x - 1.55, 1.1, z1 - 0.5, x + 1.55, H - 1.4, z1 - 0.44); b.put('glass', G.cyl(16, 1, false), x, H - 1.4, z1 - 0.47, 1.55, 0.06, 1.55, 0, PI / 2); b.bb('trim', x - 0.2, H - 1.3, z1 - 0.4, x + 0.2, H - 0.7, z1 - 0.3); }
  b.bb('trim', x0 - 0.3, H, z0 - 0.3, x1 + 0.3, H + 0.5, z1 + 0.3); b.bb('stone', x0, H + 0.5, z0, x1, H + 1.1, z1); b.bb('trim', x0 - 0.1, H + 1.1, z0 - 0.1, x1 + 0.1, H + 1.2, z1 + 0.1);
  b.bb('glassHouse', x0 + 1, H + 1.2, z0 + 1, x1 - 1, H + 1.3, z1 - 1);
  b.put('stone', G.prism(), cx, H + 1.2, z1 - 0.1, 12, 2.0, 0.8);    // 中央山花
  for (let x = x0 + 3; x <= x1 - 3; x += 4.5) { const t = new Kit(b, x, 0, z1 + 3.5); const tp = FUR.topiaryPot; if (typeof tp === 'function') tp(t, 1.1); else { t.bx(mk2('walnut'), 0, 0, 0, 0.8, 0.8, 0.8); t.sph('foliage', 0, 1.6, 0, 0.7, 0.8, 0.7); t.sph('gold', 0.3, 1.6, 0.4, 0.08, 0.08, 0.08); } }
}

/* ---------- 果园（梅花形种植） ---------- */
function orchard(b) {
  const x0 = 190, x1 = 240, z0 = -105, z1 = -55; rect(x0 - 2, z0 - 2, x1 + 2, z1 + 2);
  b.bb('flowers', x0, 0, z0, x1, 0.04, z1);
  hedgeRect(b, x0, z0, x1, z1, 0.8, 1.2);
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) { const x = x0 + 4 + i * 7 + (j % 2 ? 3.5 : 0), z = z0 + 4 + j * 7; if (x > x1 - 3) continue;
    const col = ['#6c8f45', '#789a4c', '#5e8040'][(i + j) % 3]; b.inst('trunk', mat4(x, 0, z, 0.2, 1.6, 0.2)); b.inst('crown2', mat4(x, 2.6, z, 2.0, 1.6, 2.0, R() * 6), col);
    if ((i + j) % 2 === 0) for (let k = 0; k < 4; k++) { const a = R() * TAU; SUB(b, 'detail').put('gold', G.sph(6, 4), x + Math.cos(a) * 1.6, 2.2 + R() * 1.2, z + Math.sin(a) * 1.6, 0.1, 0.1, 0.1); } }
}

/* ---------- 预留草坪：绿篱框、十字步道、中心水盘、四角雕像 ---------- */
function reserveLawn(b, cx, cz) {
  const w = 105, d = 95, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  rect(x0, z0, x1, z1);
  hedgeRect(b, x0, z0, x1, z1, 1.0, 1.4);
  path(b, x0 + 1, cz, x1 - 1, cz, 4); path(b, cx, z0 + 1, cx, z1 - 1, 4);
  for (let i = 0; i < 8; i++) { const x = x0 + 1 + i * (w - 2) / 8; if (i % 2) b.bb('grass', x, 0, z0 + 1, x + (w - 2) / 8, 0.03, z1 - 1); }
  disc(b, 'trim', cx, cz, 6, 0, 0.5, 40); disc(b, 'water', cx, cz, 5.4, 0.1, 0.45, 40);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) statue(b, cx + sx * (w / 2 - 4), cz + sz * (d / 2 - 4), Math.atan2(-sx, -sz), 1);
}

/* ---------- 西北服务区 ---------- */
function serviceZone(b) {
  rect(-186, -148 + SZ_DZ, -84, -72 + SZ_DZ);
  b.bb('gravel', -184, 0, -146, -86, 0.04, -82);
  const house = (x0, x1, z0, z1, h, roofH, opt = {}) => {
    b.bb('stone', x0, 0, z0, x1, h, z1);
    b.bb('trim', x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.3, z1 + 0.3);
    if (opt.barrel) b.put('lead', G.extrude('svcBarrel', () => new THREE.CylinderGeometry(1, 1, 1, 20, 1, false, -PI / 2, PI).rotateX(-PI / 2)), (x0 + x1) / 2, h + 0.3, (z0 + z1) / 2, (x1 - x0) / 2 + 0.2, roofH, z1 - z0 + 0.4);
    else if (x1 - x0 >= z1 - z0) b.put('lead', G.prism(), (x0 + x1) / 2, h + 0.3, (z0 + z1) / 2, x1 - x0 + 0.6, roofH, z1 - z0 + 0.6);
    else b.put('lead', G.prism(), (x0 + x1) / 2, h + 0.3, (z0 + z1) / 2, z1 - z0 + 0.6, roofH, x1 - x0 + 0.6, PI / 2);
    const rows = opt.rows || [], face = z1 + 0.02;
    for (const v of rows) for (let x = x0 + 2; x < x1 - 1; x += opt.bay || 3.6) b.bb('glass', x - 0.55, v, face, x + 0.55, v + 1.5, face + 0.04);
  };
  // 仆役楼 x −172…−128，z −86…−100（2 层 + 阁楼）
  house(-172, -128, -100, -86, 7.4, 2.8, { rows: [1.0, 4.4] });
  for (const x of [-164, -150, -136]) { b.bb('stone', x - 0.7, 7.4, -94, x + 0.7, 12.2, -92); b.bb('trim', x - 0.85, 12.2, -94.15, x + 0.85, 12.45, -91.85); }
  // 马车房 x −170…−130，z −112…−122（1 层 + 草料阁），5 樘拱门朝南
  house(-170, -130, -122, -112, 5.2, 2.8, {});
  for (let i = 0; i < 5; i++) { const x = -166 + i * 8; b.bb(mk2('walnut'), x - 1.6, 0, -111.98, x + 1.6, 3.6, -111.9); b.put('stone', G.seg(), x, 3.6, -111.9, 1.7, 0.8, 0.2); }
  b.bb('glass', -151, 6.0, -111.98, -149, 7.0, -111.9);
  // 工坊 x −182…−174，z −90…−120（设定坐标与仆役楼重叠，西移 8 m）
  house(-182, -174, -120, -90, 5, 2.2, {});
  for (const z of [-96, -103]) b.put(mk2('brass'), G.cyl(16), -186.5, 1.4, z, 1.1, 2.8, 1.1);
  // 机库 x −122…−92，z −120…−140，高 9，筒拱屋面，大门朝南对机坪
  house(-122, -92, -140, -120, 6.8, 2.6, { barrel: true });
  b.bb(mk2('walnut'), -116, 0, -119.98, -98, 6.6, -119.9); for (let x = -116; x <= -98; x += 3) b.bb('iron', x - 0.05, 0, -119.9, x + 0.05, 6.6, -119.85);
  // 机坪 x −120…−90，z −92…−118
  b.bb('pavers', -120, 0, -118, -90, 0.06, -92);
  b.put('gold', new THREE.RingGeometry(7.6, 8.0, 48).rotateX(-PI / 2), -105, 0.07, -105);
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.put('gold', G.box, -105 + Math.sin(a) * 5, 0.07, -105 + Math.cos(a) * 5, 0.3, 0.01, 2.2, a); }
  for (const [x, z] of [[-119, -93], [-91, -93], [-119, -117], [-91, -117]]) DT(b).inst('bollard', mat4(x, 0.06, z, 1, 1, 1));
  // 遮挡：东侧与南侧高绿篱 + 树团（从主轴方向看不见）
  hedgeLine(b, -84, -80, -84, -148, 1.6, 4.2); hedgeLine(b, -186, -79, -84, -79, 1.6, 4.2);
  for (let i = 0; i < 110; i++) { const t = R(); const onE = R() < 0.5; const x = onE ? -80 + R() * 9 : -188 + t * 106, z = onE ? -74 - t * 78 : -75 + R() * 8; if (inIsland(x, z + SZ_DZ, 10)) tree(b, x, z, 1.25 + R() * 0.45, R() < 0.25 ? 'cone' : 'crown2'); }
  for (let x = -186; x <= -88; x += 4.6) tree(b, x + R() * 1.5, -82.5 + R() * 1.5, 1.55 + R() * 0.3, 'crown2');   // 紧贴建筑前的一排大树
  for (let x = -124; x <= -88; x += 4.2) tree(b, x + R(), -89 + R(), 1.7 + R() * 0.3, 'crown2');   // 机坪南缘
  for (let z = -86; z >= -146; z -= 4.6) tree(b, -86.5 + R() * 1.2, z, 1.5 + R() * 0.3, 'crown2');
  for (let i = 0; i < 30; i++) { const x = -190 - R() * 30, z = -80 - R() * 70; if (inIsland(x, z + SZ_DZ, 12) && free(x, z + SZ_DZ, 1)) tree(b, x, z, 0.9 + R() * 0.3); }
}
// 服务区整体北移 SZ_DZ（设定坐标下屋顶会探进首屏，挪到首屏上沿之外；AREAS 同步）
const SZ_DZ = P.SERVICE_DZ ?? -22;
function shifted(b, dx, dz) {   // 平移代理：put / box / bb / inst / sub 都带上偏移
  const T = new THREE.Matrix4().makeTranslation(dx, 0, dz), o = Object.create(b);
  o.add = (key, geom, m, ao) => b.add(key, geom, m ? m.clone().premultiply(T) : T.clone(), ao);
  o.inst = (proto, m, color) => b.inst(proto, m.clone().premultiply(T), color);
  o.sub = (tag) => shifted(b.sub ? b.sub(tag) : b, dx, dz);
  return o;
}
function pergolaWalk(b) {
  // 紫藤廊：主人通道暗门（后露台 x −9.4）→ 西行 → 北折到机坪
  const pts = [[-25, -26], [-80, -26], [-80, -108 + SZ_DZ], [-90, -108 + SZ_DZ]];
  for (let s = 0; s < pts.length - 1; s++) {
    const [xa, za] = pts[s], [xb, zb] = pts[s + 1], L = Math.hypot(xb - xa, zb - za), ux = (xb - xa) / L, uz = (zb - za) / L, n = Math.round(L / 3);
    path(b, xa, za, xb, zb, 2.4, 0.04, 'pavers');
    for (let i = 0; i <= n; i++) { const x = xa + ux * L * i / n, z = za + uz * L * i / n;
      for (const sd of [-1.3, 1.3]) b.put('trim', G.cyl(8), x - uz * sd, 1.25, z + ux * sd, 0.12, 2.5, 0.12);
      b.put(mk2('walnut'), G.box, x, 2.55, z, Math.abs(uz) * 3 + 0.12, 0.12, Math.abs(ux) * 3 + 0.12); }
    b.put('hedge', G.box, (xa + xb) / 2, 2.72, (za + zb) / 2, Math.abs(ux) * L + 3.2 * Math.abs(uz), 0.26, Math.abs(uz) * L + 3.2 * Math.abs(ux));
    const f = DT(b); for (let i = 0; i < n * 3; i++) { const t = (i * 0.618) % 1, sd = ((i * 0.381) % 1) * 2.6 - 1.3; f.put('trim', tint(G.cone(6), i % 2 ? '#9C86C8' : '#B9A6DC'), xa + ux * L * t - uz * sd, 2.35, za + uz * L * t + ux * sd, 0.14, 0.5, 0.14, 0, PI, 0); }
    rect(Math.min(xa, xb) - 2, Math.min(za, zb) - 2, Math.max(xa, xb) + 2, Math.max(za, zb) + 2);
  }
}

/* ---------- 岛缘观景台 ---------- */
function lookouts(b) {
  // 后轴 (0, −215)：半圆直径 20
  circ(0, -215, 12);
  b.put('pavers', G.cyl(32), 0, 0.05, -215, 10, 0.1, 10); b.put('trim', G.cyl(32), 0, 0.02, -215, 10.4, 0.04, 10.4);
  for (let i = 0; i < 12; i++) { const a = PI + i * PI / 12 + PI / 24; const a1 = a + PI / 12 - 0.01; balustrade(DT(b), Math.cos(a) * 10, -215 + Math.sin(a) * 10, Math.cos(a1) * 10, -215 + Math.sin(a1) * 10, 0.1, 1.0, { posts: 3 }); }
  for (const sx of [-4, 4]) stoneBench(b, sx, -209, 0);
  path(b, 0, -140, 0, -205, 4);
  // 东西小圆亭 (±315, 25)，直径 8
  for (const sx of [-1, 1]) { circ(sx * 315, 25, 7); monopteros(b, sx * 315, 25, 3.2, 3.8, 0.1, 6); path(b, sx * 228, 10, sx * 309, 24, 3); }
}

/* ---------- 结界锚碑：2 × 2 × 9 方尖碑，碑顶嵌以太晶 ---------- */
function anchor(b, x, z) {
  circ(x, z, 5);
  const k = new Kit(b, x, 0, z);
  k.bx('trim', 0, 0, 0, 3.4, 0.4, 3.4); k.bx('stone', 0, 0.4, 0, 2.6, 0.9, 2.6); k.bx('trim', 0, 1.3, 0, 2.3, 0.15, 2.3);
  k.geo('stone', G.cyl(4, 0.62), 0, 1.45 + 3.6, 0, 1.414, 7.2, 1.414, PI / 4);
  k.geo('glow', new THREE.OctahedronGeometry(1, 0), 0, 1.45 + 7.2 + 0.55, 0, 0.5, 0.75, 0.5);
  k.geo('gold', G.tor(TAU, 4, 16, 0.12), 0, 1.45 + 7.2, 0, 0.62, 0.3, 0.62);
  disc(b, 'gravel', x, z, 4.5, 0, 0.04, 24);
}

/* ---------- 停靠平台：圆心 (0, 277)，r 16；铜绿栏杆，金色引导环；候机亭 (0, 267) ---------- */
function dock(b) {
  const PX = 0, PZ = 277, PR = 16, y = 0.45;
  rect(-20, 256, 20, 300);
  b.bb('pavers', -12, 0, 256, 12, 0.08, 268);
  b.put('trim', G.cyl(48), PX, (y - 1.6) / 2, PZ, PR, y + 1.6, PR); b.put('pavers', G.cyl(48), PX, y + 0.015, PZ, PR - 0.3, 0.03, PR - 0.3);
  // 挑出部分：倒台状石托 + 一圈托檐
  b.put('trimShade', G.cyl(48, 2.2), PX, -4.6, PZ, PR / 2.2, 6, PR / 2.2);
  b.put('trim', G.cyl(48), PX, -1.75, PZ, PR + 0.25, 0.3, PR + 0.25);
  // 铜绿栏杆（外沿，南侧留登艇口）
  const rail = tint(G.box, VERDI), post = tint(G.cyl(8), VERDI);
  const seg = 40;
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, am = (a0 + a1) / 2;
    if (Math.sin(am) < -0.2) continue;                                   // 与岛相接的北侧不设栏杆
    if (Math.abs(am - PI / 2) < 0.2) continue;                           // 登艇口
    const x0 = PX + Math.cos(a0) * (PR - 0.4), z0 = PZ + Math.sin(a0) * (PR - 0.4), x1 = PX + Math.cos(a1) * (PR - 0.4), z1 = PZ + Math.sin(a1) * (PR - 0.4);
    const L = Math.hypot(x1 - x0, z1 - z0), ang = -Math.atan2(z1 - z0, x1 - x0);
    b.put('trim', rail, (x0 + x1) / 2, y + 1.08, (z0 + z1) / 2, L, 0.07, 0.1, ang);
    b.put('trim', rail, (x0 + x1) / 2, y + 0.5, (z0 + z1) / 2, L, 0.04, 0.05, ang);
    DT(b).put('trim', post, x0, y + 0.55, z0, 0.06, 1.1, 0.06);
    for (let j = 1; j < 5; j++) { const t = j / 5; DT(b).put('trim', post, x0 + (x1 - x0) * t, y + 0.55, z0 + (z1 - z0) * t, 0.02, 1.1, 0.02); }
  }
  // 金色引导环（传承件 1 的位置）与引导线
  b.put('gold', new THREE.RingGeometry(5.5, 6.0, 64).rotateX(-PI / 2), PX, y + 0.04, PZ);
  b.put('gold', new THREE.RingGeometry(9.2, 9.4, 64).rotateX(-PI / 2), PX, y + 0.04, PZ);
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; b.put('gold', G.box, PX + Math.cos(a) * 7.6, y + 0.04, PZ + Math.sin(a) * 7.6, 2.4, 0.01, 0.2, -a); }
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12 + 0.26; DT(b).inst('bollard', mat4(PX + Math.cos(a) * (PR - 1.4), y, PZ + Math.sin(a) * (PR - 1.4), 1, 1, 1)); }
  // 候机亭 (0, 267)：直径 6，高 5，玻璃墙，铜门
  const k = new Kit(b, 0, y, 267);
  k.cyl('trim', 0, 0, 0, 3.4, 0.25, 24);
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; k.cyl('trim', Math.sin(a) * 2.9, 0.25, Math.cos(a) * 2.9, 0.16, 3.6, 10); if (i !== 0 && i !== 4) k.geo('glassHouse', G.box, Math.sin(a + PI / 8) * 2.75, 2.0, Math.cos(a + PI / 8) * 2.75, 2.1, 3.4, 0.05, a + PI / 8); }
  for (const zz of [2.95, -2.95]) { k.bx(mk2('brass'), -0.55, 0.25, zz, 0.5, 2.4, 0.06); k.bx(mk2('brass'), 0.55, 0.25, zz, 0.5, 2.4, 0.06); k.sph('gold', -0.12, 1.3, zz + Math.sign(zz) * 0.06, 0.06, 0.06, 0.06); k.sph('gold', 0.12, 1.3, zz + Math.sign(zz) * 0.06, 0.06, 0.06, 0.06); }
  k.cyl('trim', 0, 3.85, 0, 3.3, 0.45, 24); k.geo('lead', G.hemi(24), 0, 4.3, 0, 3.2, 1.3, 3.2); k.sph('gold', 0, 5.75, 0, 0.22, 0.22, 0.22);
  for (const sx of [-1, 1]) for (let z = 258; z <= 266; z += 4) lamp(b, sx * 11, z, 0.9);
}
