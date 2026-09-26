// 伊甸庄园 · 家具、卫浴、床品与织物、墙面线脚（dressWalls）、传承件（PROP）与按房间编号布置（furnish）
// 约定：每件家具的局部坐标原点在地面、背靠局部 −z、面朝 +z；Kit 负责平移旋转，Batch 按材质合并（draw call 固定）。
// 近景细件写入 sub('fine')；1.2 m 以上的壁挂物写入 sub('hi±x/z')（只挂在会升高的墙上）。
import * as THREE from 'three';
import { G, Kit, mat4, srand, tint, TINT, TIER, ART } from './lib.js';
import * as PLAN from './plan.js';
import { mergeVertices as mergeV } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI, H = PI / 2;
const FLOORS = PLAN.FLOORS || [];
const ROOMS = PLAN.ROOMS || [];

/* ================================================================
 * 基础设施
 * ================================================================ */
// 包装批次：'key:#hex' 与旧织物键（fabBurg…）→ 共享材质 + 顶点色（Batch 保留烘好的颜色）
const _res = new Map();
function res(key) {
  let r = _res.get(key); if (r !== undefined) return r;
  const i = key.indexOf(':'); r = i > 0 ? [key.slice(0, i), key.slice(i + 1)] : (TINT[key] || null);
  _res.set(key, r); return r;
}
const WR = new WeakMap();
function wrapB(b) {
  if (!b || b.__wpb) return b;
  let w = WR.get(b); if (w) return w;
  w = Object.create(b); w.__wpb = true; w.__base = b;
  w.add = (key, g, m, ao) => { const t = res(key); return t ? b.add(t[0], tint(g, t[1]), m, ao) : b.add(key, g, m, ao); };
  w.inst = (...a) => b.inst(...a);
  w.sub = (tag) => (b.sub ? wrapB(b.sub(tag)) : w);
  WR.set(b, w); return w;
}
function wk(k) { if (k.b && k.b.__wpb) return k; const n = new Kit(wrapB(k.b), 0, 0, 0); n.T = k.T.clone(); return n; }
// 子批次 Kit（同变换）；C 的 Batch.sub 未就绪时退回主批次
function SUB(k, tag) {
  if (!tag) return k; const b = k.b; if (!b.sub) return k;
  const n = new Kit(wrapB(b.sub(tag)), 0, 0, 0); n.T = k.T.clone(); return n;
}
// 近景细件：hi 子批次里的细件跟着 hi 走（否则远墙隐藏时细件会悬空）
const FINE = (k) => { const b = k.b && (k.b.__base || k.b); const t = b && b.tag; return t && t.startsWith('hi') ? k : SUB(k, 'fine'); };
// 局部子坐标系：平移 (x, y, z)、绕 y 转 ry、再绕 x 转 rx，可带缩放
function loc(k, x, z, ry = 0, y = 0, rx = 0, sc) {
  const n = new Kit(k.b, 0, 0, 0); const m = mat4(x, y, z, 1, 1, 1, ry, rx);
  if (sc) m.scale(new THREE.Vector3(sc[0], sc[1], sc[2]));
  n.T = k.T.clone().multiply(m); return n;
}
const LO = () => TIER >= 2;
const _up = new THREE.Vector3(0, 1, 0), _dv = new THREE.Vector3(), _mv = new THREE.Vector3(), _qq = new THREE.Quaternion(), _sv = new THREE.Vector3();
// 两点之间的圆杆（局部坐标）
function rod(k, key, a, b, r, seg = 6, r2 = r) {
  _dv.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _dv.length(); if (L < 1e-5) return; _dv.divideScalar(L);
  _qq.setFromUnitVectors(_up, _dv);
  const M = new THREE.Matrix4().compose(_mv.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _qq, _sv.set(r, L, r2));
  k.b.add(key, G.cyl(seg, 1, true), M.premultiply(k.T));
}
// 圆角块（中心定位）
const sl = (k, key, x, y, z, w, h, d, r = 0.02, ry = 0, rx = 0, rz = 0, re = 0, seg = 2) => k.geo(key, G.slab(w, h, d, r, re, seg), x, y, z, 1, 1, 1, ry, rx, rz);
// 沿 x / 沿 z 的圆柱（中心定位）
const cx_ = (k, key, x, y, z, r, len, seg = 8) => k.geo(key, G.cyl(seg), x, y, z, r, len, r, 0, 0, H);
const cz_ = (k, key, x, y, z, r, len, seg = 8) => k.geo(key, G.cyl(seg), x, y, z, r, len, r, 0, H);
// 竖直圆盘（面朝 +z）
const vdisc = (k, key, x, y, z, rx_, ry_, t = 0.01, seg = 16) => k.geo(key, G.cyl(seg), x, y, z, rx_, t, ry_, 0, H);
const shadeHex = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); };

// 调色
export const COL = {
  ivory: '#EEE7D8', champ: '#CDB58A', crimson: '#7B1E2B', azure: '#2C3E63', empire: '#2F5D4E', rose: '#C99A93', pearl: '#BDBAB4', paleGold: '#D8C28A',
  towel: '#F4EFE4', bottle: '#23402F', duck: '#BFD3CB', oxblood: '#5E1B18', sevres: '#1F3F8F', crestBlue: '#2E4B8F', linen: '#F7F4EE',
};

/* ================================================================
 * 通用单件
 * ================================================================ */
const TLEG = [[0, 0], [0.6, 0], [0.42, 0.3], [0.7, 0.5], [0.42, 0.68], [1, 0.9], [0, 1]];
function legs(k, w, d, h, r = 0.03, mat = 'mahogany', inset = 0.05, style = 'turn') {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (w / 2 - inset), z = sz * (d / 2 - inset);
    if (style === 'turn') k.geo(mat, G.lathe('tleg2', TLEG, 5), x, 0, z, r, h, r);
    else if (style === 'sq') k.geo(mat, G.cyl(4, 1.5), x, h / 2, z, r, h, r, PI / 4);
    else k.cyl(mat, x, 0, z, r, h, 6, 0.75);
  }
}
export { legs };
const SPLAT = () => G.shape('splat3', () => { const s = new THREE.Shape(); s.moveTo(-0.05, -0.2); s.bezierCurveTo(-0.02, -0.1, -0.12, -0.02, -0.08, 0.1); s.bezierCurveTo(-0.05, 0.18, -0.12, 0.2, -0.14, 0.22); s.lineTo(0.14, 0.22); s.bezierCurveTo(0.12, 0.2, 0.05, 0.18, 0.08, 0.1); s.bezierCurveTo(0.12, -0.02, 0.02, -0.1, 0.05, -0.2); s.closePath(); return s; }, 0.015, 0, 3);
// 乔治式餐椅：方锥腿、软垫座、镂空瓶形背板
export function chair(k, fab = 'enamel:#6e1f1b', wood = 'mahogany') {
  k = wk(k); const f = FINE(k);
  legs(k, 0.46, 0.46, 0.4, 0.024, wood, 0.035, 'sq');
  k.bx(wood, 0, 0.36, 0, 0.48, 0.06, 0.48);
  sl(k, fab, 0, 0.455, 0.01, 0.47, 0.07, 0.46, 0.028, 0, 0, 0, 0, 1);
  for (const sx of [-1, 1]) k.box(wood, sx * 0.21, 0.72, -0.225, 0.035, 0.62, 0.035, 0, -0.08);
  k.box(wood, 0, 1.02, -0.25, 0.5, 0.055, 0.045, 0, -0.08);
  k.box(wood, 0, 0.62, -0.228, 0.1, 0.3, 0.012, 0, -0.08); f.geo(wood, SPLAT(), 0, 0.72, -0.226, 1.1, 1.1, 1, 0, -0.08);
  f.box('brass', 0, 0.445, 0.245, 0.46, 0.012, 0.004);
  k.blob(0, 0, 0.8, 0.8, 0.03);
}
// 路易十六式扶手椅（镀金或桃花心木框、丝绒面）
export function armchair(k, fab = 'fabSage', frame = 'mahogany') {
  k = wk(k); const f = FINE(k);
  legs(k, 0.72, 0.68, 0.2, 0.03, frame, 0.05, 'turn');
  sl(k, frame, 0, 0.26, 0, 0.76, 0.12, 0.72, 0.03);
  sl(k, fab, 0, 0.38, 0.03, 0.66, 0.14, 0.64, 0.05);
  sl(k, fab, 0, 0.72, -0.31, 0.66, 0.6, 0.12, 0.05, 0, -0.1);
  sl(k, frame, 0, 1.04, -0.35, 0.7, 0.06, 0.07, 0.03, 0, -0.1);
  for (const sx of [-1, 1]) { sl(k, fab, sx * 0.34, 0.52, 0.0, 0.1, 0.18, 0.62, 0.04); sl(k, frame, sx * 0.35, 0.63, 0.02, 0.07, 0.05, 0.62, 0.025); k.cyl(frame, sx * 0.35, 0.3, 0.3, 0.025, 0.33, 6); }
  f.box('gold', 0, 0.32, 0.365, 0.7, 0.02, 0.01);
  k.blob(0, 0, 1.1, 1.1, 0.03);
}
export function sofa(k, fab = 'fabCream', w = 2.2, cush = 3, frame = 'mahogany') {
  k = wk(k); const f = FINE(k);
  legs(k, w, 0.84, 0.16, 0.03, frame, 0.07, 'turn');
  sl(k, frame, 0, 0.22, 0, w, 0.12, 0.88, 0.03);
  sl(k, fab, 0, 0.3, 0, w - 0.06, 0.14, 0.84, 0.04);
  const cw = (w - 0.34) / cush;
  for (let i = 0; i < cush; i++) { const x = -w / 2 + 0.17 + cw * (i + 0.5); sl(k, fab, x, 0.44, 0.05, cw - 0.02, 0.14, 0.66, 0.05); sl(k, fab, x, 0.72, -0.27, cw - 0.03, 0.44, 0.16, 0.06, 0, -0.14); }
  sl(k, fab, 0, 0.66, -0.38, w - 0.04, 0.72, 0.12, 0.04);
  sl(k, frame, 0, 1.02, -0.4, w - 0.02, 0.05, 0.08, 0.02);
  for (const sx of [-1, 1]) { sl(k, fab, sx * (w / 2 - 0.08), 0.48, 0, 0.16, 0.26, 0.84, 0.05); k.geo(fab, G.cyl(12), sx * (w / 2 - 0.08), 0.64, 0.02, 0.1, 0.84, 0.1, 0, H); }
  pillowAt(k, 'fab:#F7F4EE', -w / 2 + 0.42, 0.66, -0.16, 0.4, 0.14, 0.36, -0.35);
  pillowAt(k, 'velvet:#CDB58A', w / 2 - 0.42, 0.66, -0.16, 0.4, 0.14, 0.36, -0.35);
  f.box('gold', 0, 0.29, 0.425, w - 0.1, 0.02, 0.01);
  k.blob(0, 0, w + 0.5, 1.3, 0.03);
}
// 切斯特菲尔德（皮面、滚臂、同高靠背；fine 里加拉扣）
export function chesterfield(k, w = 2.2, fab = 'enamel:#4a1d16') {
  k = wk(k); const f = FINE(k);
  legs(k, w, 0.9, 0.1, 0.03, 'walnut', 0.08, 'plain');
  sl(k, fab, 0, 0.3, 0, w, 0.4, 0.92, 0.06);
  sl(k, fab, 0, 0.48, 0.06, w - 0.3, 0.12, 0.72, 0.05);
  sl(k, fab, 0, 0.62, -0.38, w, 0.44, 0.18, 0.06);
  for (const sx of [-1, 1]) { sl(k, fab, sx * (w / 2 - 0.1), 0.56, 0, 0.2, 0.36, 0.92, 0.06); k.geo(fab, G.cyl(12), sx * (w / 2 - 0.1), 0.78, 0.0, 0.13, 0.94, 0.13, 0, H); }
  cx_(k, fab, 0, 0.84, -0.38, 0.1, w, 12);
  for (let i = 0; i < 9; i++) for (let j = 0; j < 2; j++) f.sph('enamel:#2a0f0c', -w / 2 + 0.3 + i * (w - 0.6) / 8, 0.58 + j * 0.14, -0.285, 0.012, 0.012, 0.008, 6, 4);
  k.blob(0, 0, w + 0.5, 1.3, 0.03);
}
function pillowG() {
  return G.custom('pillow', () => {
    const g = new THREE.SphereGeometry(1, 12, 7); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const X = Math.sign(x) * Math.pow(Math.abs(x), 0.42), Z = Math.sign(z) * Math.pow(Math.abs(z), 0.42), m = Math.max(Math.abs(X), Math.abs(Z));
      p.setXYZ(i, X, y * (1 - 0.72 * Math.pow(m, 5)), Z); }
    g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m = mergeV(g); m.computeVertexNormals(); return m;
  });
}
// 枕头（w 宽 × t 厚 × d 深，rx 前倾）
function pillowAt(k, key, x, y, z, w, t, d, rx = 0, ry = 0) { k.geo(key, pillowG(), x, y, z, w / 2, t / 2, d / 2, ry, rx); }
export function coffeeTable(k, w = 1.3, d = 0.7, top = 'marbleW') {
  k = wk(k);
  legs(k, w, d, 0.4, 0.028, 'mahogany', 0.06, 'turn'); k.bx('mahogany', 0, 0.34, 0, w - 0.04, 0.07, d - 0.04); k.bx(top, 0, 0.41, 0, w, 0.035, d);
  k.bx('mahogany', 0, 0.1, 0, w - 0.12, 0.025, d - 0.12);
  const f = FINE(k); f.bx('books', -w / 4, 0.445, 0, 0.3, 0.06, 0.22); f.bx('books', -w / 4 + 0.02, 0.505, 0.01, 0.24, 0.045, 0.18, 0.2);
  f.geo('porcelain', G.lathe('bowl', [[0, 0], [0.05, 0], [0.1, 0.04], [0.13, 0.08], [0.12, 0.085]], 14), w / 4, 0.445, 0);
  k.blob(0, 0, w + 0.4, d + 0.4, 0.03);
}
export function sideTable(k, lamp = true) {
  k = wk(k);
  k.geo('mahogany', G.lathe('stped', [[0, 0], [0.2, 0], [0.2, 0.04], [0.07, 0.08], [0.05, 0.3], [0.07, 0.5], [0.05, 0.56], [0, 0.56]], 10), 0, 0, 0);
  k.cyl('marbleW', 0, 0.56, 0, 0.26, 0.035, 16); FINE(k).geo('ormolu', G.tor(PI * 2, 4, 24, 0.12), 0, 0.58, 0, 0.265, 0.1, 0.265);
  if (lamp) tableLamp(loc(k, 0, 0, 0, 0.6));
}
export function tableLamp(k, shade = 'fab:#EEE7D8') {
  k = wk(k); const f = FINE(k);
  f.geo('porcelain', G.lathe('lampbase', [[0, 0], [0.08, 0], [0.1, 0.1], [0.07, 0.25], [0.03, 0.32], [0, 0.32]], 12), 0, 0, 0);
  f.cyl('ormolu', 0, 0, 0, 0.085, 0.02, 12); k.cyl('ormolu', 0, 0.0, 0, 0.03, 0.44, 5);
  k.geo(shade, G.cyl(16, 0.62, true), 0, 0.52, 0, 0.18, 0.22, 0.18); k.cyl(shade, 0, 0.62, 0, 0.11, 0.004, 16);
  k.cyl('glow', 0, 0.42, 0, 0.05, 0.05, 8);
}
export function floorLamp(k, shade = 'fab:#EEE7D8') {
  k = wk(k); k.cyl('ormolu', 0, 0, 0, 0.16, 0.03, 12); k.cyl('ormolu', 0, 0.03, 0, 0.015, 1.45, 6);
  k.geo(shade, G.cyl(16, 0.6, true), 0, 1.6, 0, 0.22, 0.28, 0.22); k.cyl('glow', 0, 1.5, 0, 0.06, 0.06, 8); k.blob(0, 0, 0.6, 0.6, 0.03);
}
export function roundTable(k, r = 0.6, top = 'mahogany', h = 0.75) {
  k = wk(k);
  k.geo('mahogany', G.lathe('rtped', [[0, 0], [0.45, 0], [0.45, 0.05], [0.14, 0.1], [0.09, 0.3], [0.13, 0.5], [0.08, 0.62], [0.12, 0.9], [0, 0.9]], 12), 0, 0, 0, r, h / 0.9 * 0.93, r);
  k.cyl(top, 0, h - 0.04, 0, r, 0.04, 28); k.geo('ormolu', G.tor(PI * 2, 4, 28, 0.06), 0, h - 0.035, 0, r + 0.005, 0.05, r + 0.005);
  k.blob(0, 0, r * 2.4, r * 2.4, 0.03);
}
export function teaSet(k, y = 0.75) {
  k = FINE(wk(k)); const f = k;
  k.geo('porcelain', G.lathe('teapot', [[0, 0], [0.05, 0], [0.075, 0.04], [0.07, 0.09], [0.035, 0.12], [0.02, 0.14], [0, 0.15]], 12), 0, y, 0);
  f.geo('enamel:#1F3F8F', G.tor(PI * 2, 4, 16, 0.12), 0, y + 0.06, 0, 0.074, 0.12, 0.074);
  for (let i = 0; i < 3; i++) { const a = i * 2.1, x = Math.sin(a) * 0.25, z = Math.cos(a) * 0.25; k.cyl('porcelain', x, y, z, 0.07, 0.008, 14); k.cyl('porcelain', x, y + 0.008, z, 0.04, 0.05, 10, 1.2); f.cyl('gold', x, y + 0.056, z, 0.049, 0.003, 12); }
}
export function flowers(k, y, r = 0.3, cols = ['#C99A93', '#F7F4EE', '#7B1E2B']) {
  k = FINE(wk(k));
  k.geo('porcelain', G.lathe('vase', [[0, 0], [0.1, 0], [0.16, 0.12], [0.14, 0.3], [0.08, 0.38], [0.11, 0.44], [0, 0.44]], 12), 0, y, 0, r / 0.3, r / 0.3, r / 0.3);
  const yy = y + 0.44 * r / 0.3; k.sph('foliage', 0, yy + r * 0.3, 0, r * 1.1, r * 0.8, r * 1.1, 8, 6);
  for (let i = 0; i < 11; i++) { const a = i * 2.4, rr = r * (0.3 + (i % 3) * 0.3); const c = cols[i % cols.length]; k.sph('fab:' + (c[0] === '#' ? c : '#C99A93'), Math.sin(a) * rr, yy + r * (0.55 + (i % 2) * 0.25), Math.cos(a) * rr, r * 0.26, r * 0.22, r * 0.26, 6, 4); }
}
// 青花大瓶
export function vase(k, h = 1.4) {
  k = wk(k); const s = h / 1.4;
  k.geo('porcelain', G.lathe('bwvase', [[0, 0], [0.2, 0], [0.24, 0.06], [0.36, 0.45], [0.38, 0.7], [0.3, 0.95], [0.16, 1.12], [0.14, 1.28], [0.19, 1.4], [0, 1.4]], 20), 0, 0, 0, s, s, s);
  for (const [y, r] of [[0.3, 0.33], [0.7, 0.385], [1.2, 0.15]]) k.geo('enamel:#1F3F8F', G.cyl(20, 1, true), 0, y * s, 0, r * s * 1.01, 0.12 * s, r * s * 1.01);
  k.blob(0, 0, 0.9 * s, 0.9 * s, 0.03);
}
export function diningTable(k, len = 11, wid = 1.6, chairFab = 'enamel:#6e1f1b', o = {}) {
  k = wk(k); const f = FINE(k);
  sl(k, 'mahogany', 0, 0.725, 0, len, 0.05, wid, 0.02); k.bx('mahogany', 0, 0.6, 0, len - 0.3, 0.1, wid - 0.2);
  const nl = Math.max(2, Math.round(len / 2.4));
  for (let i = 0; i <= nl; i++) { const x = -len / 2 + 0.6 + (len - 1.2) * i / nl; k.geo('mahogany', G.lathe('dtped', [[0, 0], [0.5, 0], [0.5, 0.03], [0.1, 0.08], [0.07, 0.3], [0.1, 0.45], [0.06, 0.6], [0, 0.6]], 10), x, 0, 0, 1, 1, 1); for (const sz of [-1, 1]) k.box('mahogany', x, 0.04, sz * 0.32, 0.08, 0.06, 0.6, 0, sz * 0.2); }
  k.bx('linen', 0, 0.751, 0, len - 1.0, 0.004, 0.52);
  const n = o.n || Math.floor((len - 1.4) / 1.3), sp = (len - 1.4) / n;
  for (let i = 0; i < n; i++) { const x = -((n - 1) * sp) / 2 + i * sp;
    chair(loc(k, x, wid / 2 + 0.3, PI), chairFab); chair(loc(k, x, -wid / 2 - 0.3, 0), chairFab);
    for (const sz of [-1, 1]) { const p = loc(k, x, sz * (wid / 2 - 0.3)); p.cyl('porcelain', 0, 0.752, 0, 0.14, 0.008, 10); f.geo('enamel:#1F3F8F', G.tor(PI * 2, 3, 24, 0.1), 0, 0.761, 0, 0.125, 0.05, 0.125); f.geo('gold', G.tor(PI * 2, 3, 24, 0.05), 0, 0.762, 0, 0.138, 0.03, 0.138);
      f.cyl('porcelain', 0, 0.76, 0, 0.1, 0.006, 16); f.box('nickel', 0.2, 0.755, 0, 0.012, 0.004, 0.2); f.box('nickel', -0.2, 0.755, 0, 0.012, 0.004, 0.2);
      f.geo('crystal', G.lathe('wglass', [[0, 0], [0.03, 0], [0.004, 0.01], [0.004, 0.09], [0.03, 0.12], [0.035, 0.18], [0, 0.18]], 8), x + 0.12, 0.752, sz * (wid / 2 - 0.5)); }
  }
  if (!o.noEnds) { chair(loc(k, len / 2 + 0.4, 0, -H), chairFab); if (!o.hostChair) chair(loc(k, -len / 2 - 0.4, 0, H), chairFab); }
  const nc = o.candles || 3;
  for (let i = 0; i < nc; i++) { const x = -len / 2 + len * (i + 0.5) / nc; if (i % 2 === 1 && nc > 2) { flowers(loc(k, x, 0), 0.755, 0.22, [COL.rose, COL.linen, COL.champ]); continue; } candelabra(loc(k, x, 0, 0, 0.755)); }
  k.blob(0, 0, len + 1.6, wid + 1.8, 0.03);
}
export function candelabra(k, h = 0.55, arms = 4) {
  k = FINE(wk(k));
  k.geo('ormolu', G.lathe('cdbase', [[0, 0], [0.1, 0], [0.1, 0.02], [0.03, 0.06], [0.02, 0.3], [0.035, 0.34], [0.015, 0.5], [0, 0.5]], 10), 0, 0, 0, 1, h / 0.5, 1);
  for (let i = 0; i < arms; i++) { const a = i * 2 * PI / arms, x = Math.sin(a) * 0.16, z = Math.cos(a) * 0.16; rod(k, 'ormolu', [0, h * 0.72, 0], [x, h * 0.86, z], 0.008, 5); k.cyl('ormolu', x, h * 0.86, z, 0.02, 0.02, 8); k.cyl('porcelain', x, h * 0.88, z, 0.01, 0.12, 6); k.geo('glow', G.cone(5), x, h * 0.88 + 0.14, z, 0.008, 0.03, 0.008); }
  k.cyl('porcelain', 0, h, 0, 0.011, 0.14, 6); k.geo('glow', G.cone(5), 0, h + 0.16, 0, 0.008, 0.03, 0.008);
}
export function sideboard(k, w = 2.4, mat = 'mahogany', top = 'marbleW') {
  k = wk(k); const f = FINE(k);
  legs(k, w, 0.52, 0.16, 0.03, mat, 0.08, 'turn');
  k.bx(mat, 0, 0.16, 0, w, 0.74, 0.52); k.bx(top, 0, 0.9, 0, w + 0.06, 0.04, 0.56);
  const n = Math.max(2, Math.round(w / 0.6));
  for (let i = 0; i < n; i++) { const x = -w / 2 + w * (i + 0.5) / n; panelDoor(f, x, 0.22, 0.26, w / n - 0.06, 0.62); k.sph('brass', x, 0.56, 0.275, 0.018, 0.018, 0.014, 8, 6); }
  f.box('ormolu', 0, 0.86, 0.262, w - 0.04, 0.025, 0.008);
  flowers(loc(k, -w / 3, 0), 0.94, 0.16); candelabra(loc(k, w / 3, 0, 0, 0.94), 0.4, 3);
  k.blob(0, 0.1, w + 0.4, 0.9, 0.03);
}
// 镶板门：1 cm 框线（写入 fine）
function panelDoor(f, x, y0, z, w, h, mat = 'mahogany') {
  const t = 0.01, d = 0.008, i = 0.05;
  f.box(mat, x, y0 + i, z, w - 2 * i, t, d); f.box(mat, x, y0 + h - i, z, w - 2 * i, t, d);
  f.box(mat, x - w / 2 + i, y0 + h / 2, z, t, h - 2 * i, d); f.box(mat, x + w / 2 - i, y0 + h / 2, z, t, h - 2 * i, d);
}
// 壁炉：背靠墙（局部 −z），面朝 +z；stone 为石材键（可带 :#tint）；o.mirror 在炉台上立一面带烛臂的镜
export function fireplace(k, w = 2.0, o = {}) {
  if (typeof o === 'string') o = { stone: o };
  k = wk(k); const f = FINE(k); const st = o.stone || 'marbleW';
  k.bx('marbleBlack', 0, 0, 0.12, w + 0.5, 0.03, 0.75);
  for (const sx of [-1, 1]) { k.bx(st, sx * (w / 2 - 0.13), 0, -0.02, 0.28, 1.1, 0.36); k.bx(st, sx * (w / 2 - 0.13), 0.02, 0.0, 0.34, 0.14, 0.4); k.geo(st, G.cyl(4, 1), sx * (w / 2 - 0.13), 0.62, 0.17, 0.08, 0.9, 0.04, PI / 4); }
  k.bx(st, 0, 1.08, -0.02, w, 0.26, 0.38); sl(k, st, 0, 1.39, 0.0, w + 0.24, 0.06, 0.46, 0.015);
  k.bx('cap', 0, 0.03, -0.12, w - 0.54, 1.02, 0.1); k.bx('iron', 0, 0.03, -0.02, w - 0.6, 0.02, 0.28);
  k.bx('glow', 0, 0.08, -0.05, w - 0.9, 0.1, 0.16); for (let i = 0; i < 3; i++) cx_(k, 'bark', 0, 0.12 + i * 0.03, -0.04 + i * 0.03, 0.04, w - 1.0, 6);
  f.box('ormolu', 0, 1.2, 0.18, 0.3, 0.12, 0.01); for (const sx of [-1, 1]) f.box('brass', sx * 0.4, 0.05, 0.4, 0.03, 0.12, 0.03);
  k.bx('brass', 0, 0.03, 0.47, w - 0.2, 0.05, 0.02);
  if (o.clock) mantelClock(loc(k, 0, 0.05, 0, 1.42));
  if (o.candles !== false) for (const sx of [-1, 1]) candelabra(loc(k, sx * (w / 2 - 0.2), 0.05, 0, 1.42), 0.42, 2);
  if (o.mirror) { const m = loc(k, 0, -0.05, 0, 1.42); m.bx('gold', 0, 0, 0, w - 0.1, o.mirror, 0.06); m.bx('mirror', 0, 0.08, 0.035, w - 0.3, o.mirror - 0.16, 0.01); m.geo('gold', G.seg(), 0, o.mirror, 0, (w - 0.1) / 2, 0.25, 0.06); for (const sx of [-1, 1]) sconce(loc(m, sx * (w / 2 - 0.25), 0.04, 0, o.mirror * 0.45), { arms: 2 }); }
}
export function mantelClock(k) {
  k = FINE(wk(k)); k.bx('ormolu', 0, 0, 0, 0.36, 0.05, 0.14); k.bx('marbleBlack', 0, 0.05, 0, 0.3, 0.26, 0.12); k.geo('ormolu', G.seg(), 0, 0.31, 0, 0.15, 0.1, 0.12);
  vdisc(k, 'porcelain', 0, 0.2, 0.062, 0.07, 0.07, 0.004, 16); k.sph('ormolu', 0, 0.44, 0, 0.03, 0.04, 0.03, 8, 6);
}
export function piano(k) {
  k = wk(k);
  const g = G.extrude('piano', () => { const s = new THREE.Shape(); s.moveTo(-0.75, 0); s.lineTo(0.75, 0); s.lineTo(0.75, 0.35);
    s.bezierCurveTo(0.72, 0.95, 0.15, 1.05, 0.05, 1.55); s.bezierCurveTo(-0.05, 1.95, -0.25, 2.1, -0.55, 2.1); s.lineTo(-0.75, 2.05); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 10 }).rotateX(-H); });
  k.geo('piano', g, 0, 0.62, 0.3, 1, 0.32, 1);
  k.geo('mahogany', g, 0, 0.93, 0.3, 0.97, 0.005, 0.97);
  k.geo('piano', g, 0.75, 0.96, 0.3, 1, 0.025, 1, 0, 0, 0.55);
  k.box('piano', 0.55, 1.2, -0.7, 0.02, 0.62, 0.02, 0, 0, 0.3);
  for (const [x, z] of [[-0.6, 0.15], [0.6, 0.15], [-0.4, -1.6]]) { k.cyl('piano', x, 0, z, 0.06, 0.62, 8, 1.3); k.cyl('brass', x, 0, z, 0.04, 0.04, 8); }
  k.bx('porcelain', 0, 0.9, 0.42, 1.36, 0.035, 0.18); for (let i = 0; i < 18; i++) k.bx('piano', -0.62 + i * 0.075, 0.935, 0.37, 0.03, 0.02, 0.1);
  k.bx('piano', 0, 0.94, 0.32, 1.1, 0.25, 0.02);
  const b = loc(k, 0, 0.95); legs(b, 0.72, 0.34, 0.45, 0.025, 'piano', 0.04, 'turn'); b.bx('piano', 0, 0.42, 0, 0.8, 0.06, 0.38); sl(b, 'enamel:#1a1a1a', 0, 0.5, 0, 0.76, 0.05, 0.34, 0.02);
  k.blob(0, -0.6, 2.2, 3.0, 0.03);
}
export function uprightPiano(k) {
  k = wk(k); k.bx('walnut', 0, 0, 0, 1.5, 1.3, 0.6); k.bx('walnut', 0, 0.7, 0.3, 1.46, 0.06, 0.25); k.bx('porcelain', 0, 0.74, 0.34, 1.3, 0.02, 0.16);
  for (let i = 0; i < 18; i++) k.bx('ebony', -0.6 + i * 0.07, 0.76, 0.31, 0.025, 0.02, 0.09); for (const sx of [-1, 1]) candelabra(loc(k, sx * 0.55, 0.05, 0, 1.3), 0.25, 1);
  const b = loc(k, 0, 0.9); legs(b, 0.7, 0.34, 0.45, 0.025, 'walnut', 0.04); b.bx('walnut', 0, 0.42, 0, 0.76, 0.05, 0.36); k.blob(0, 0.2, 1.8, 1.5, 0.03);
}
// 吊灯：y 为灯体高度（相对地面），arms 总臂数，按层分配；水晶坠写入 fine
export function chandelier(k, y, r = 1.0, tiers = 2, ceil = 1.2, arms) {
  k = wk(k); const f = FINE(k); const lo = LO();
  arms = arms || (tiers === 1 ? 8 : tiers === 2 ? 12 : 24);
  if (TIER >= 1) arms = Math.max(6, Math.round(arms / 2));
  const top = y + r * 0.35;
  k.cyl('ormolu', 0, top, 0, 0.022, ceil, 6); k.geo('ormolu', G.lathe('chcanopy', [[0, 0], [0.16, 0], [0.12, 0.08], [0, 0.1]], 10), 0, top + ceil - 0.1, 0, r, 1, r);
  k.geo('ormolu', G.lathe('chbody', [[0, -0.5], [0.12, -0.35], [0.18, -0.1], [0.08, 0.05], [0.1, 0.2], [0, 0.35]], 10), 0, y, 0, r, r, r);
  const share = tiers === 1 ? [1] : tiers === 2 ? [0.64, 0.36] : [0.5, 0.33, 0.17];
  for (let t = 0; t < tiers; t++) {
    const rr = r * (1 - t * 0.3), yy = y - 0.1 * r + t * 0.3 * r, n = Math.max(3, Math.round(arms * share[t]));
    k.geo('ormolu', G.tor(PI * 2, 3, 20, 0.025), 0, yy - 0.05 * r, 0, rr * 0.55, rr * 0.55, rr * 0.55);
    for (let i = 0; i < n; i++) {
      const a = (i + t * 0.5) * 2 * PI / n, s = Math.sin(a), c = Math.cos(a), x = s * rr, z = c * rr;
      const ka = n > 12 && i % 2 ? f : k;
      rod(ka, 'ormolu', [s * rr * 0.55, yy - 0.05 * r, c * rr * 0.55], [s * rr * 0.9, yy - 0.12 * r, c * rr * 0.9], 0.012 * r + 0.005, 4);
      rod(ka, 'ormolu', [s * rr * 0.9, yy - 0.12 * r, c * rr * 0.9], [x, yy, z], 0.012 * r + 0.005, 4);
      f.cyl('ormolu', x, yy, z, 0.028 * r + 0.008, 0.02, 6, 1.4);
      k.geo('porcelain', G.cyl(4, 1, true), x, yy + 0.02 + (0.11 * r + 0.03) / 2, z, 0.012 * r + 0.006, 0.11 * r + 0.03, 0.012 * r + 0.006);
      k.geo('glow', G.cone(4), x, yy + 0.16 * r + 0.045, z, 0.01 * r + 0.006, 0.05 * r + 0.012, 0.01 * r + 0.006);
      if (!lo) { f.geo('crystal', G.cyl(6, 1.6), x, yy - 0.004, z, 0.03 * r + 0.012, 0.006, 0.03 * r + 0.012); f.geo('crystal', G.sph(5, 4), s * rr * 0.9, yy - 0.2 * r, c * rr * 0.9, 0.018 * r + 0.004, 0.05 * r + 0.01, 0.018 * r + 0.004); }
    }
    if (!lo) for (let i = 0; i < n * 2; i++) { const a = i * PI / n; f.geo('crystal', G.sph(4, 3), Math.sin(a) * rr * 0.75, yy - 0.2 * r - (i % 2) * 0.03 * r, Math.cos(a) * rr * 0.75, 0.012 * r + 0.003, 0.014 * r + 0.003, 0.012 * r + 0.003); }
  }
  k.geo('crystal', G.sph(8, 6), 0, y - 0.62 * r, 0, 0.07 * r, 0.1 * r, 0.07 * r);
  if (!lo) for (let i = 0; i < 12; i++) { const a = i * PI / 6; f.geo('crystal', G.sph(4, 3), Math.sin(a) * 0.12 * r, y - 0.45 * r - (i % 3) * 0.04 * r, Math.cos(a) * 0.12 * r, 0.02 * r, 0.03 * r, 0.02 * r); }
}
// 旧名：简化吊灯
export function pendant(k, y, drop = 0.9) { k = wk(k); k.cyl('iron', 0, y, 0, 0.012, drop, 4); k.cyl('ormolu', 0, y - 0.25, 0, 0.28, 0.25, 12, 0.3); k.cyl('glow', 0, y - 0.28, 0, 0.12, 0.04, 8); }
// 铜框玻璃灯笼（过厅、楼梯）
export function lantern(k, y, drop = 1.0, s = 1, mat = 'brass') {
  k = wk(k); k.cyl(mat, 0, y + 0.7 * s, 0, 0.012, drop, 4);
  k.geo(mat, G.cyl(6, 0.3), 0, y + 0.62 * s, 0, 0.26 * s, 0.14 * s, 0.26 * s); k.geo(mat, G.cyl(6), 0, y, 0, 0.22 * s, 0.03 * s, 0.22 * s);
  for (let i = 0; i < 6; i++) { const a = i * PI / 3; rod(k, mat, [Math.sin(a) * 0.22 * s, y, Math.cos(a) * 0.22 * s], [Math.sin(a) * 0.26 * s, y + 0.55 * s, Math.cos(a) * 0.26 * s], 0.008 * s, 4); }
  k.geo('glassHouse', G.cyl(6, 1.18, true), 0, y + 0.27 * s, 0, 0.22 * s, 0.52 * s, 0.22 * s);
  k.cyl('porcelain', 0, y + 0.02, 0, 0.03 * s, 0.18 * s, 6); k.geo('glow', G.cone(5), 0, y + 0.24 * s, 0, 0.02 * s, 0.07 * s, 0.02 * s); k.sph(mat, 0, y - 0.05 * s, 0, 0.04 * s, 0.05 * s, 0.04 * s, 6, 4);
}
// 壁灯：局部原点 = 背板中心，墙面在 z=0，面朝 +z
export function sconce(k, o = {}) {
  k = wk(k); const f = FINE(k); const arms = o.arms || 2, m = o.mat || 'ormolu';
  k.geo(m, G.cyl(12), 0, 0, 0.012, 0.045, 0.024, 0.09, 0, H); k.geo(m, G.cone(6), 0, -0.13, 0.02, 0.02, 0.08, 0.02, 0, PI);
  for (let i = 0; i < arms; i++) {
    const x = arms === 1 ? 0 : (i / (arms - 1) - 0.5) * 0.3, z = 0.15, y = 0.08;
    rod(k, m, [0, -0.04, 0.02], [x * 0.7, -0.06, z * 0.8], 0.007, 4); rod(k, m, [x * 0.7, -0.06, z * 0.8], [x, y, z], 0.007, 4);
    k.cyl(m, x, y, z, 0.025, 0.018, 6, 1.4); k.cyl('porcelain', x, y + 0.018, z, 0.011, 0.1, 5); k.geo('glow', G.cone(4), x, y + 0.15, z, 0.009, 0.035, 0.009);
    if (o.shade) k.geo('fab:' + o.shade, G.cyl(10, 0.55, true), x, y + 0.15, z, 0.07, 0.1, 0.07); else f.geo('crystal', G.cyl(6, 1.6), x, y - 0.002, z, 0.035, 0.005, 0.035);
  }
}
// 立式烛台灯柱（楼梯脚、音乐厅）
export function torchere(k, h = 1.8) {
  k = wk(k); k.geo('ormolu', G.lathe('torch', [[0, 0], [0.22, 0], [0.22, 0.05], [0.08, 0.12], [0.05, 0.5], [0.07, 0.55], [0.035, 0.95], [0.06, 1], [0, 1]], 10), 0, 0, 0, 1, h - 0.3, 1);
  candelabra(loc(k, 0, 0, 0, h - 0.3), 0.3, 5); k.blob(0, 0, 0.7, 0.7, 0.03);
}
export function bench(k, len = 2.0, fab = 'fabBurg', frame = 'mahogany') {
  k = wk(k); const f = FINE(k);
  legs(k, len, 0.48, 0.34, 0.03, frame, 0.07, 'turn'); k.bx(frame, 0, 0.3, 0, len, 0.07, 0.48); sl(k, fab, 0, 0.42, 0, len - 0.04, 0.1, 0.46, 0.035);
  f.box('gold', 0, 0.33, 0.245, len - 0.1, 0.02, 0.008); k.blob(0, 0, len + 0.4, 0.9, 0.03);
}
export function stool(k, fab = 'velvet:#CDB58A', w = 0.5, d = 0.4) { k = wk(k); legs(k, w, d, 0.4, 0.022, 'mahogany', 0.04, 'turn'); k.bx('mahogany', 0, 0.36, 0, w, 0.05, d); sl(k, fab, 0, 0.44, 0, w - 0.02, 0.09, d - 0.02, 0.03); k.blob(0, 0, w + 0.3, d + 0.3, 0.03); }
export function chaise(k, fab = 'velvet:#CDB58A', len = 1.8) {
  k = wk(k); legs(k, len, 0.66, 0.18, 0.028, 'mahogany', 0.06, 'turn'); sl(k, 'mahogany', 0, 0.24, 0, len, 0.1, 0.7, 0.03);
  sl(k, fab, 0, 0.36, 0.02, len - 0.04, 0.16, 0.64, 0.05); k.geo(fab, G.cyl(12), -len / 2 + 0.12, 0.62, 0, 0.16, 0.66, 0.16, 0, H); sl(k, fab, -len / 2 + 0.08, 0.5, 0, 0.12, 0.5, 0.66, 0.05);
  sl(k, fab, -0.2, 0.62, -0.28, len * 0.7, 0.42, 0.1, 0.04, 0, -0.12); pillowAt(k, 'fab:#EEE7D8', -len / 2 + 0.35, 0.52, 0, 0.36, 0.14, 0.4, 0, H * 0.9); k.blob(0, 0, len + 0.4, 1.1, 0.03);
}
export function plant(k, h = 1.6, pot = 'urn') {
  k = wk(k);
  if (pot === 'urn') k.inst('urn', 0, 0, 0, 0.7, 0.7, 0.7); else if (pot === 'jard') { k.geo('porcelain', G.lathe('jard', [[0, 0], [0.18, 0], [0.26, 0.2], [0.3, 0.42], [0.27, 0.5], [0, 0.5]], 14), 0, 0, 0); k.geo('enamel:#1F3F8F', G.cyl(14, 1, true), 0, 0.32, 0, 0.29, 0.08, 0.29); }
  else k.cyl('terracotta', 0, 0, 0, 0.28, 0.5, 10, 1.25);
  const top = pot === 'urn' ? 0.62 : 0.48;
  k.cyl('bark', 0, top, 0, 0.04, h * 0.55, 5, 0.6);
  for (let i = 0; i < 7; i++) { const a = i * 0.9; k.sph('foliage', Math.sin(a) * 0.32, top + h * 0.55 - 0.02, Math.cos(a) * 0.32, 0.12, 0.05, 0.5, 6, 4); }
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.45; const g = loc(k, 0, 0, a, top + h * 0.55); g.box('foliage', 0, 0.02, 0.35, 0.16, 0.03, 0.72, 0, 0.45); }
  k.blob(0, 0, 1.0, 1.0, 0.03);
}
// 柑橘 / 月桂盆栽（球冠）
export function citrus(k, h = 1.5) {
  k = wk(k); k.bx('paintIvory', 0, 0, 0, 0.6, 0.55, 0.6); for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.sph('ormolu', sx * 0.29, 0.6, sz * 0.29, 0.04, 0.04, 0.04, 6, 4);
  k.cyl('bark', 0, 0.55, 0, 0.035, h * 0.45, 5); k.inst('ball', 0, 0.55 + h * 0.62, 0, 0.45, 0.42, 0.45, 0, '#5d7f3e');
  for (let i = 0; i < 9; i++) { const a = i * 2.3; k.sph('enamel:#E39A2B', Math.sin(a) * 0.36, 0.55 + h * 0.6 + (i % 3 - 1) * 0.14, Math.cos(a) * 0.36, 0.035, 0.035, 0.035, 6, 4); }
  k.blob(0, 0, 1.0, 1.0, 0.03);
}
export function topiaryPot(k, h = 1.2) {
  k = wk(k);
  k.bx('paint', 0, 0, 0, 0.8, 0.7, 0.8); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.bx('paintSage', sx * 0.38, 0, sz * 0.38, 0.1, 0.8, 0.1); k.sph('gold', sx * 0.38, 0.84, sz * 0.38, 0.06, 0.06, 0.06, 6, 4); }
  k.cyl('bark', 0, 0.7, 0, 0.05, h * 0.5, 5); k.inst('ball', 0, 0.7 + h * 0.55 + 0.35, 0, 0.55, 0.5, 0.55, 0, '#6f8f4e');
  for (let i = 0; i < 6; i++) { const a = i * 1.05; k.sph('fabGold', Math.sin(a) * 0.45, 0.7 + h * 0.55 + 0.3 + (i % 2) * 0.2, Math.cos(a) * 0.45, 0.06, 0.06, 0.06, 5, 4); }
  k.blob(0, 0, 1.3, 1.3, 0.03);
}
// 书柜；o.hk 给出时，1.2 m 以上写入 hk（远墙升高时才显示）
export function bookshelf(k, w = 2.0, h = 2.5, d = 0.42, o = {}) {
  k = wk(k); const wood = o.wood || 'walnut'; const hk = o.hi ? SUB(k, o.hi) : null; const f = FINE(k);
  const put = (y0, y1, fn) => { if (!hk || y1 <= 1.2) fn(k, y0, y1); else if (y0 >= 1.2) fn(hk, y0, y1); else { fn(k, y0, 1.2); fn(hk, 1.2, y1); } };
  k.bx(wood, 0, 0, 0, w, 0.12, d); put(h - 0.12, h + 0.02, (kk, a, b) => kk.bx(wood, 0, a, 0, w + 0.1, b - a, d + 0.06));
  for (const sx of [-1, 1]) put(0, h - 0.12, (kk, a, b) => kk.bx(wood, sx * (w / 2 - 0.03), a, 0, 0.06, b - a, d));
  put(0, h - 0.12, (kk, a, b) => kk.bx(wood, 0, a, -d / 2 + 0.015, w, b - a, 0.03));
  const rows = Math.floor((h - 0.3) / 0.38);
  for (let i = 0; i < rows; i++) { const y = 0.12 + i * 0.38; const kk = hk && y + 0.36 > 1.2 ? hk : k; kk.bx(wood, 0, y, 0, w - 0.08, 0.03, d - 0.02); kk.box('books', 0, y + 0.18, 0.02, w - 0.12, 0.3, d - 0.12); }
  if (o.rail) { const kk = hk || k; cx_(kk, 'brass', 0, h - 0.35, d / 2 + 0.06, 0.012, w, 8); }
  f.box(wood, 0, h - 0.1, d / 2 + 0.03, w + 0.08, 0.03, 0.01);
  k.blob(0, 0.05, w + 0.3, d + 0.4, 0.03);
}
// 图书梯（黄铜滑轨）
export function libraryLadder(k, h = 2.8) { k = wk(k); for (const sx of [-1, 1]) rod(k, 'walnut', [sx * 0.22, 0, 0.55], [sx * 0.2, h, 0.05], 0.022, 5); for (let i = 1; i < 8; i++) { const t = i / 8; cx_(k, 'walnut', 0, t * h, 0.55 - t * 0.5, 0.016, 0.42, 5); } k.cyl('brass', -0.2, h - 0.05, 0.05, 0.02, 0.06, 6); k.cyl('brass', 0.2, h - 0.05, 0.05, 0.02, 0.06, 6); }
export function desk(k, w = 1.9, d = 0.95, chairFab = 'leather', o = {}) {
  k = wk(k); const f = FINE(k); const wood = o.wood || 'mahogany';
  for (const sx of [-1, 1]) { k.bx(wood, sx * (w / 2 - 0.25), 0.04, 0, 0.46, 0.68, d - 0.05); k.bx(wood, sx * (w / 2 - 0.25), 0, 0, 0.5, 0.05, d); for (let i = 0; i < 3; i++) { f.box(wood, sx * (w / 2 - 0.25), 0.18 + i * 0.2, (d - 0.05) / 2 + 0.006, 0.4, 0.17, 0.01); k.box('brass', sx * (w / 2 - 0.25), 0.2 + i * 0.2, (d - 0.05) / 2 + 0.012, 0.07, 0.015, 0.012); } }
  sl(k, wood, 0, 0.745, 0, w, 0.05, d, 0.012); k.bx('leatherG', 0, 0.771, 0, w - 0.3, 0.003, d - 0.3);
  k.bx('linen', -0.1, 0.774, 0.1, 0.3, 0.008, 0.22); k.box('brass', 0.3, 0.8, -0.2, 0.2, 0.05, 0.1);
  bankerLamp(loc(k, -w / 2 + 0.3, -d / 2 + 0.25, 0, 0.77));
  if (chairFab) armchair(loc(k, 0, -d / 2 - 0.55, 0), chairFab);
  k.blob(0, 0, w + 0.4, d + 0.4, 0.03);
}
function bankerLamp(k, arms = 1) {
  k.cyl('brass', 0, 0, 0, 0.08, 0.02, 12); k.cyl('brass', 0, 0.02, 0, 0.012, 0.32, 6);
  for (let i = 0; i < arms; i++) { const x = arms === 1 ? 0 : (i ? 0.14 : -0.14); if (arms > 1) cx_(k, 'brass', 0, 0.3, 0, 0.008, 0.3, 6); k.geo('enamel:#1d4a33', G.cyl(12, 1, true), x, 0.36, 0, 0.12, 0.07, 0.07, 0, 0, H); k.cyl('glow', x, 0.33, 0, 0.08, 0.015, 6); }
}
export function globe(k, r = 0.4) {
  k = wk(k); const s = r / 0.4;
  for (let i = 0; i < 3; i++) { const a = i * 2.09; k.box('walnut', Math.sin(a) * 0.22 * s, 0.32 * s, Math.cos(a) * 0.22 * s, 0.04 * s, 0.66 * s, 0.04 * s, a, 0.3); }
  k.geo('walnut', G.tor(PI * 2, 5, 28, 0.1), 0, 0.64 * s, 0, 0.44 * s, 0.44 * s, 0.44 * s);
  k.sph('enamel:#C9B98A', 0, 1.02 * s, 0, r, r, r, 20, 14); k.geo('brass', new THREE.TorusGeometry(1, 0.025, 4, 32), 0, 1.02 * s, 0, r + 0.03, r + 0.03, r + 0.03, 0.4);
  k.blob(0, 0, 1.0 * s, 1.0 * s, 0.03);
}
export function nightstand(k, wood = 'mahogany') {
  k = wk(k); const f = FINE(k);
  legs(k, 0.5, 0.42, 0.12, 0.022, wood, 0.03, 'turn'); k.bx(wood, 0, 0.1, 0, 0.5, 0.5, 0.42); k.bx('marbleW', 0, 0.6, 0, 0.54, 0.025, 0.46);
  f.box(wood, 0, 0.42, 0.215, 0.44, 0.14, 0.008); k.box('ormolu', 0, 0.49, 0.225, 0.07, 0.018, 0.015);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box('ormolu', sx * 0.26, 0.612, sz * 0.22, 0.03, 0.01, 0.03);
  tableLamp(loc(k, 0, -0.04, 0, 0.625)); k.bx('books', 0.14, 0.625, 0.1, 0.16, 0.04, 0.12, 0.3);
}
export function wardrobe(k, w = 1.6, mat = 'mahogany', h = 2.2) {
  k = wk(k); const f = FINE(k);
  k.bx(mat, 0, 0.1, 0, w, h - 0.1, 0.62); legs(k, w - 0.05, 0.56, 0.12, 0.04, mat, 0.04, 'turn');
  k.bx(mat, 0, h, 0, w + 0.12, 0.12, 0.7); k.geo(mat, G.seg(), 0, h + 0.12, 0.05, w / 3, 0.12, 0.06);
  for (const sx of [-1, 1]) panelDoor(f, sx * w / 4, 0.25, 0.315, w / 2 - 0.08, h - 0.45, mat);
  k.bx(mat, 0, 0.2, 0.318, 0.03, h - 0.3, 0.01);
  for (const sx of [-1, 1]) k.box('brass', sx * 0.06, h * 0.52, 0.335, 0.025, 0.14, 0.02);
  k.blob(0, 0.05, w + 0.4, 1.0, 0.03);
}
export function chest(k, w = 1.2, mat = 'mahogany') {
  k = wk(k); const f = FINE(k); legs(k, w, 0.5, 0.12, 0.03, mat, 0.05); k.bx(mat, 0, 0.1, 0, w, 0.8, 0.5); k.bx('marbleW', 0, 0.9, 0, w + 0.04, 0.03, 0.54);
  for (let i = 0; i < 4; i++) { f.box(mat, 0, 0.2 + i * 0.19, 0.255, w - 0.08, 0.16, 0.008); for (const sx of [-1, 1]) k.box('brass', sx * w * 0.28, 0.2 + i * 0.19, 0.265, 0.08, 0.015, 0.015); }
}
// 梳妆台（缎木）＋三折镜 ＋ 软凳
export function vanity(k, o = {}) {
  k = wk(k); const f = FINE(k); const wood = o.wood || 'satinwood';
  legs(k, 1.1, 0.46, 0.72, 0.022, wood, 0.05, 'turn'); k.bx(wood, 0, 0.6, 0, 1.15, 0.14, 0.5); sl(k, 'marbleW', 0, 0.76, 0, 1.2, 0.03, 0.52, 0.01);
  const m = loc(k, 0, -0.18, 0, 0.78);
  m.bx('gold', 0, 0.02, 0, 0.46, 0.66, 0.04); m.bx('mirror', 0, 0.06, 0.022, 0.4, 0.58, 0.006);
  for (const s of [-1, 1]) { const w = loc(m, s * 0.235, 0, -s * 0.5); w.bx('gold', s * 0.12, 0.06, 0, 0.24, 0.56, 0.03); w.bx('mirror', s * 0.12, 0.1, 0.016, 0.2, 0.48, 0.005); }
  k.cyl('crystal', -0.4, 0.775, 0.08, 0.03, 0.1, 8, 0.5); k.cyl('crystal', -0.33, 0.775, 0.1, 0.025, 0.08, 8, 0.6); f.sph('gold', -0.4, 0.89, 0.08, 0.018, 0.018, 0.018, 6, 4);
  k.bx('gold', 0.35, 0.775, 0.08, 0.2, 0.012, 0.14);
  stool(loc(k, 0, 0.58), o.fab || 'velvet:#C99A93', 0.46, 0.36);
  k.blob(0, 0.2, 1.5, 1.2, 0.03);
}
// 穿衣镜（落地转镜，鎏金框）
export function chevalMirror(k, h = 1.8) {
  k = wk(k); for (const sx of [-1, 1]) { k.box('gold', sx * 0.36, h / 2, 0, 0.04, h, 0.04); k.bx('gold', sx * 0.36, 0, 0, 0.05, 0.03, 0.4); }
  const m = loc(k, 0, 0, 0, h * 0.52, -0.06); m.bx('gold', 0, -h * 0.42, 0, 0.62, h * 0.84, 0.04); m.bx('mirror', 0, -h * 0.4, 0.022, 0.54, h * 0.8, 0.006); m.geo('gold', G.seg(), 0, h * 0.42, 0, 0.31, 0.12, 0.04);
  k.blob(0, 0, 0.9, 0.6, 0.03);
}
export function cabinetGlass(k, w = 1.5, wood = 'mahogany', h = 2.1) {
  k = wk(k); const f = FINE(k);
  k.bx(wood, 0, 0, 0, w, 0.85, 0.45); k.bx(wood, 0, 0.85, -0.12, w, h - 0.85, 0.21); k.bx(wood, 0, h, 0, w + 0.1, 0.1, 0.5);
  for (let i = 0; i < 4; i++) { k.bx(wood, 0, 0.9 + i * 0.3, 0, w - 0.08, 0.02, 0.4); for (let j = 0; j < 4; j++) { const x = -w / 2 + 0.25 + j * (w - 0.5) / 3; k.cyl('porcelain', x, 0.92 + i * 0.3, 0.02, 0.07, 0.012, 14); f.cyl('enamel:#1F3F8F', x, 0.932 + i * 0.3, 0.02, 0.071, 0.004, 14); } }
  for (const sx of [-1, 1]) k.bx(wood, sx * (w / 2 - 0.02), 0.85, 0.1, 0.04, h - 0.85, 0.04);
  k.bx('glass', 0, 0.9, 0.206, w - 0.1, h - 0.95, 0.008); k.bx(wood, 0, 0.9, 0.212, 0.03, h - 0.95, 0.01);
  panelDoor(f, -w / 4, 0.1, 0.228, w / 2 - 0.06, 0.65, wood); panelDoor(f, w / 4, 0.1, 0.228, w / 2 - 0.06, 0.65, wood);
  k.blob(0, 0.05, w + 0.3, 0.8, 0.03);
}
// 展柜（乌木框玻璃平柜，珍藏室）
export function vitrine(k, w = 1.6) {
  k = wk(k); legs(k, w, 0.7, 0.75, 0.03, 'ebony', 0.04, 'turn'); k.bx('ebony', 0, 0.75, 0, w, 0.12, 0.7);
  k.bx('fab:#2C3E63', 0, 0.87, 0, w - 0.06, 0.005, 0.64); k.bx('glass', 0, 0.87, 0, w - 0.02, 0.22, 0.66);
  for (let i = 0; i < 4; i++) k.bx(['enamel:#d8c69a', 'brass', 'enamel:#b9a57a', 'gold'][i], -w / 2 + 0.25 + i * (w - 0.5) / 3, 0.875, 0, 0.18, 0.02, 0.24);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('ebony', sx * (w / 2 - 0.01), 0.98, sz * 0.33, 0.02, 0.22, 0.02); k.bx('ebony', 0, 1.09, 0, w, 0.02, 0.7);
  k.blob(0, 0, w + 0.3, 1.0, 0.03);
}
export function screenFold(k, fab = 'fabSage') {
  k = wk(k);
  for (let i = 0; i < 4; i++) { const x = -0.75 + i * 0.5, a = (i % 2 ? 0.35 : -0.35); k.box('mahogany', x, 0.95, 0, 0.5, 1.8, 0.04, a); k.box(fab, x, 1.0, 0, 0.42, 1.55, 0.05, a); }
}
export function filing(k, n = 3, mat = 'mahogany') { k = wk(k); for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.56; k.bx(mat, x, 0, 0, 0.52, 1.3, 0.6); for (let j = 0; j < 4; j++) { k.bx(mat, x, 0.1 + j * 0.3, 0.301, 0.46, 0.26, 0.01); k.box('brass', x, 0.28 + j * 0.3, 0.31, 0.1, 0.02, 0.02); } } k.blob(0, 0, n * 0.56 + 0.3, 0.9, 0.03); }
// 布草架（毛巾叠放在格里）
export function rack(k, w = 3.0, tiers = 4, towels = true) {
  k = wk(k);
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) k.bx('paintIvory', sx * (w / 2 - 0.03), 0, sz * 0.25, 0.04, 2.0, 0.04);
  const cols = [COL.towel, '#FBF9F4', COL.towel, '#EDE6D6', COL.linen];
  for (let i = 0; i < tiers; i++) { const y = 0.15 + i * 0.48; k.bx('oak', 0, y, 0, w, 0.03, 0.56);
    if (!towels) continue;
    for (let j = 0; j < 5; j++) { const x = -w / 2 + 0.34 + j * (w - 0.68) / 4, n = 3 + ((i + j) % 3), c = cols[(i + j) % 5];
      k.geo('towel:' + c, G.slab(0.42, n * 0.05, 0.34, 0.02, 0.01, 1), x, y + 0.03 + n * 0.025, 0.02); for (let m = 1; m < n; m++) FINE(k).box('towel:' + shadeHex(c, 0.8), x, y + 0.03 + m * 0.05, 0.19, 0.4, 0.004, 0.002); } }
  k.blob(0, 0, w + 0.3, 0.9, 0.03);
}
export function workTable(k, w = 2.6, d = 1.1, top = 'marbleW') { k = wk(k); legs(k, w, d, 0.85, 0.04, 'paintIvory', 0.08, 'plain'); k.bx('paintIvory', 0, 0.75, 0, w - 0.1, 0.1, d - 0.1); k.bx(top, 0, 0.85, 0, w, 0.05, d); k.bx('paintIvory', 0, 0.15, 0, w - 0.2, 0.03, d - 0.2); k.blob(0, 0, w + 0.4, d + 0.4, 0.03); }
export function counter(k, w = 4, d = 0.65, top = 'marbleW') { k = wk(k); k.bx('paintIvory', 0, 0, 0, w, 0.85, d); k.bx(top, 0, 0.85, 0.02, w + 0.04, 0.05, d + 0.04); for (let i = 0; i < Math.floor(w / 0.6); i++) { const x = -w / 2 + 0.3 + i * 0.6; k.bx('paintSage', x, 0.08, d / 2 + 0.005, 0.54, 0.68, 0.01); k.box('brass', x, 0.62, d / 2 + 0.015, 0.1, 0.02, 0.02); } }
export function washTub(k) { k = wk(k); k.cyl('woodMid', 0, 0, 0, 0.45, 0.7, 14, 1.12); k.geo('iron', G.tor(PI * 2, 4, 20, 0.04), 0, 0.2, 0, 0.47, 0.47, 0.47); k.geo('iron', G.tor(PI * 2, 4, 20, 0.04), 0, 0.55, 0, 0.5, 0.5, 0.5); k.geo('water', G.cyl(14), 0, 0.62, 0, 0.44, 0.01, 0.44); k.blob(0, 0, 1.3, 1.3, 0.03); }
export function serverRack(k) { k = wk(k); k.bx('walnut', 0, 0, 0, 0.62, 2.0, 0.9); for (let i = 0; i < 10; i++) { k.bx('cap', 0, 0.15 + i * 0.18, 0.451, 0.54, 0.14, 0.01); k.bx('led', -0.2 + (i % 3) * 0.05, 0.2 + i * 0.18, 0.456, 0.03, 0.02, 0.01); } k.blob(0, 0, 0.9, 1.2, 0.03); }
// 以太监视墙（黄铜框）
export function monitorWall(k, w = 6, rows = 3) {
  k = wk(k); k.bx('walnut', 0, 0.75, 0, w, rows * 0.72 + 0.3, 0.12); const n = Math.floor(w / 1.4);
  for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) { const x = -w / 2 + 0.7 + i * (w - 1.4) / Math.max(1, n - 1); k.box('brass', x, 1.2 + j * 0.72, 0.07, 1.24, 0.64, 0.02); k.box('screen', x, 1.2 + j * 0.72, 0.082, 1.12, 0.54, 0.01); }
}
export function monitorDesk(k, R = 3.4, n = 5) {
  k = wk(k);
  for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * 0.36; const s = loc(k, Math.sin(a) * R, -Math.cos(a) * R + R, a);
    s.bx('walnut', 0, 0, 0, 1.2, 0.72, 0.7); sl(s, 'walnut', 0, 0.74, 0.02, 1.26, 0.04, 0.8, 0.01); s.bx('leatherG', 0, 0.761, 0.05, 1.0, 0.003, 0.5);
    s.box('brass', 0, 1.05, -0.28, 0.9, 0.5, 0.04, 0, -0.1); s.box('screen', 0, 1.05, -0.255, 0.8, 0.42, 0.01, 0, -0.1);
    if (i % 2 === 0) armchair(loc(s, 0, 0.75, PI), 'enamel:#3a2a22');
  }
}
export function cardTable(k, fab = 'fabGold') {
  k = wk(k); legs(k, 0.9, 0.9, 0.72, 0.03, 'mahogany', 0.05, 'turn'); k.bx('mahogany', 0, 0.68, 0, 0.92, 0.06, 0.92); k.bx('fab:#2f5a3e', 0, 0.741, 0, 0.8, 0.004, 0.8);
  for (let i = 0; i < 4; i++) chair(loc(k, Math.sin(i * H) * 0.8, Math.cos(i * H) * 0.8, i * H + PI), fab);
  k.blob(0, 0, 2.4, 2.4, 0.03);
}
// 镀金边桌（大理石台面）；o.mk 为镜子的 Kit（远墙 hi 子批次），o.mirror 为镜高
export function consoleT(k, w = 1.6, mirror = true, o = {}) {
  k = wk(k); const f = FINE(k);
  for (const sx of [-1, 1]) { k.geo('gold', G.lathe('cleg', [[0, 0], [0.04, 0], [0.05, 0.1], [0.03, 0.4], [0.045, 0.7], [0.035, 0.82], [0, 0.82]], 8), sx * (w / 2 - 0.08), 0, 0.12, 1, 1, 1); k.bx('gold', sx * (w / 2 - 0.08), 0, -0.14, 0.06, 0.82, 0.06); }
  k.bx('gold', 0, 0.68, 0, w, 0.14, 0.42); k.sph('gold', 0, 0.66, 0.212, 0.14, 0.07, 0.02, 10, 6); sl(k, o.top || 'marbleW', 0, 0.84, 0, w + 0.08, 0.04, 0.48, 0.012);
  k.bx('gold', 0, 0.08, 0, w - 0.2, 0.03, 0.3); f.sph('gold', 0, 0.62, 0.215, 0.05, 0.05, 0.02, 8, 6);
  if (o.vase !== false) flowers(loc(k, -w / 4, 0), 0.86, 0.14); candelabra(loc(k, w / 4, 0, 0, 0.86), 0.4, 3);
  if (mirror) { const m = o.mk ? wk(o.mk) : k, mh = o.mirror || 1.2, y0 = 0.9;
    m.bx('gold', 0, y0, -0.19, w * 0.85, mh, 0.05); m.bx('mirror', 0, y0 + 0.08, -0.162, w * 0.85 - 0.16, mh - 0.16, 0.006);
    m.geo('gold', G.seg(), 0, y0 + mh, -0.19, w * 0.43, 0.32, 0.05); m.sph('gold', 0, y0 + mh + 0.36, -0.18, 0.14, 0.1, 0.03, 10, 6); }
  k.blob(0, 0, w + 0.4, 0.8, 0.03);
}
export function telescope(k) {
  k = wk(k);
  for (let i = 0; i < 3; i++) { const a = i * 2.09; k.box('walnut', Math.sin(a) * 0.3, 0.6, Math.cos(a) * 0.3, 0.035, 1.25, 0.035, a, 0.25); }
  k.geo('brass', G.cyl(12), 0, 1.35, 0.1, 0.07, 1.5, 0.07, 0, -1.2); k.geo('brass', G.cyl(12), 0, 1.66, 0.72, 0.1, 0.25, 0.1, 0, -1.2);
  k.blob(0, 0, 1.2, 1.2, 0.03);
}
export function billiard(k) {
  k = wk(k); const f = FINE(k);
  for (let i = 0; i < 3; i++) for (const sz of [-1, 1]) k.geo('mahogany', G.lathe('bleg', [[0, 0], [0.08, 0], [0.1, 0.1], [0.07, 0.3], [0.1, 0.5], [0.08, 0.66], [0, 0.66]], 10), -1.3 + i * 1.3, 0, sz * 0.65);
  sl(k, 'mahogany', 0, 0.72, 0, 3.2, 0.14, 1.8, 0.03); k.bx('fab:#1f5a32', 0, 0.79, 0, 2.85, 0.01, 1.45);
  for (const sz of [-1, 1]) sl(k, 'mahogany', 0, 0.83, sz * 0.8, 3.1, 0.06, 0.16, 0.02); for (const sx of [-1, 1]) sl(k, 'mahogany', sx * 1.5, 0.83, 0, 0.16, 0.06, 1.6, 0.02);
  for (const x of [-1.45, 0, 1.45]) for (const sz of [-1, 1]) f.cyl('ebony', x, 0.8, sz * 0.74, 0.045, 0.03, 10);
  for (const [x, z, c] of [[0.6, 0, '#f4efe0'], [0.9, 0.1, '#b01e1e'], [-0.8, -0.2, '#f0d060']]) k.sph('enamel:' + c, x, 0.822, z, 0.027, 0.027, 0.027, 10, 8);
  rod(k, 'walnut', [-0.4, 0.83, 0.2], [0.9, 0.9, 0.5], 0.008, 5);
  k.blob(0, 0, 3.8, 2.4, 0.03);
}
export function cueRack(k) { k = wk(k); k.bx('mahogany', 0, 0.3, 0, 0.8, 1.2, 0.1); for (let i = 0; i < 6; i++) rod(k, 'walnut', [-0.3 + i * 0.12, 0.35, 0.08], [-0.3 + i * 0.12, 1.75, 0.07], 0.008, 5); }
// 铃板（36 个铃，黄铜牌、以太指示灯）
export function bellBoard(k, n = 36, w = 2.0) {
  k = wk(k); const f = FINE(k); k.bx('mahogany', 0, 1.2, 0, w, 0.9, 0.06); f.box('ormolu', 0, 2.1, 0.03, w, 0.04, 0.02);
  const cols = 9, rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) { const x = -w / 2 + 0.15 + (i % cols) * (w - 0.3) / (cols - 1), y = 1.3 + Math.floor(i / cols) * 0.2; k.box('brass', x, y + 0.08, 0.04, 0.16, 0.05, 0.01); k.sph(i % 7 === 3 ? 'glow' : 'led', x, y + 0.02, 0.04, 0.02, 0.02, 0.01, 6, 4); }
}
export function coatStand(k) { k = wk(k); k.cyl('mahogany', 0, 0, 0, 0.22, 0.04, 10); k.cyl('mahogany', 0, 0.04, 0, 0.025, 1.8, 6); for (let i = 0; i < 6; i++) { const a = i * PI / 3; rod(k, 'brass', [0, 1.62, 0], [Math.sin(a) * 0.16, 1.72, Math.cos(a) * 0.16], 0.008, 4); } k.sph('brass', 0, 1.86, 0, 0.03, 0.03, 0.03, 6, 4); k.blob(0, 0, 0.6, 0.6, 0.03); }
export function umbrellaStand(k) { k = wk(k); k.cyl('brass', 0, 0, 0, 0.14, 0.6, 12, 1, 1, 1, true); for (let i = 0; i < 4; i++) rod(k, ['enamel:#1a1a1a', 'walnut', 'enamel:#23402F', 'ebony'][i], [(i - 1.5) * 0.04, 0.1, 0], [(i - 1.5) * 0.08, 0.95, (i % 2) * 0.05], 0.012, 5); }
export function windsor(k) { k = wk(k); legs(k, 0.44, 0.42, 0.44, 0.02, 'oak', 0.05, 'turn'); sl(k, 'oak', 0, 0.46, 0, 0.46, 0.04, 0.44, 0.015); k.geo('oak', G.tor(PI, 4, 12, 0.08), 0, 0.5, -0.1, 0.22, 0.6, 0.22, 0, -H); for (let i = 0; i < 7; i++) rod(k, 'oak', [-0.18 + i * 0.06, 0.48, -0.18], [-0.18 + i * 0.06, 0.62 + Math.sin((i + 0.5) / 7 * PI) * 0.35, -0.2], 0.008, 4); k.blob(0, 0, 0.7, 0.7, 0.03); }
export function gramophone(k) {
  k = wk(k); legs(k, 0.6, 0.5, 0.2, 0.025, 'walnut', 0.04); k.bx('walnut', 0, 0.2, 0, 0.6, 0.62, 0.5); k.cyl('enamel:#1a1a1a', 0, 0.82, 0, 0.16, 0.01, 20);
  rod(k, 'brass', [0.18, 0.84, -0.15], [0.12, 1.0, -0.1], 0.02, 6); k.geo('brass', G.cyl(20, 1, true), 0.05, 1.14, 0.05, 0.03, 0.4, 0.03, 0, -0.6); k.geo('brass', G.cyl(20, 12, true), -0.02, 1.35, 0.25, 0.022, 0.25, 0.022, 0, -1.0);
  k.blob(0, 0, 0.9, 0.8, 0.03);
}
export function chessTable(k) {
  k = wk(k); legs(k, 0.6, 0.6, 0.7, 0.025, 'ebony', 0.05, 'turn'); k.bx('ebony', 0, 0.66, 0, 0.64, 0.06, 0.64);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) k.box((i + j) % 2 ? 'ebony' : 'porcelain', -0.245 + i * 0.07, 0.722, -0.245 + j * 0.07, 0.07, 0.004, 0.07);
  const r = srand(41); for (let p = 0; p < 14; p++) { const i = (r() * 8) | 0, j = (r() * 8) | 0; k.cyl(p % 2 ? 'ebony' : 'porcelain', -0.245 + i * 0.07, 0.724, -0.245 + j * 0.07, 0.016, 0.03 + (p % 4) * 0.012, 8, 0.6); }
  chair(loc(k, 0, 0.62, PI), 'velvet:#2C3E63'); chair(loc(k, 0, -0.62, 0), 'velvet:#2C3E63');
}
// 早餐保温器（黄铜罩）
export function chafing(k) { k = wk(k); for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.42; k.cyl('brass', x, 0, 0, 0.16, 0.08, 14); k.geo('brass', G.hemi(14), x, 0.08, 0, 0.16, 0.12, 0.16); k.sph('brass', x, 0.21, 0, 0.02, 0.02, 0.02, 6, 4); } }
// 以太悬浮天城仪
export function isleModel(k) {
  k = wk(k); k.geo('brass', G.lathe('isped', [[0, 0], [0.22, 0], [0.18, 0.08], [0.06, 0.12], [0.05, 0.85], [0.12, 0.9], [0, 0.9]], 12), 0, 0, 0); k.cyl('glow', 0, 0.9, 0, 0.1, 0.02, 12);
  k.geo('rock', G.cone(10), 0, 1.02, 0, 0.18, 0.18, 0.18, 0, PI); k.cyl('grass', 0, 1.1, 0, 0.19, 0.012, 14); k.bx('trim', 0, 1.112, 0, 0.05, 0.03, 0.04); k.blob(0, 0, 0.6, 0.6, 0.03);
}

/* ================================================================
 * 卫浴：马桶、毛巾、浴缸、台盆、镜
 * ================================================================ */
const WC_BOWL = [[0.05, 0], [0.13, 0.01], [0.18, 0.05], [0.2, 0.1], [0.205, 0.13]];
const WC_IN = [[0.19, 0.128], [0.17, 0.08], [0.12, 0.04], [0.05, 0.03], [0.0, 0.03]];
// 马桶：背靠墙（局部 −z），面朝 +z。type 'low' 低水箱（外露铜冲水管）/ 'high' 高位桃花心木水箱 / 'close' 连体
export function toilet(k, o = {}) {
  k = wk(k); const f = FINE(k);
  const type = o.type || 'low', trim = o.trim === 'nickel' ? 'nickel' : 'brass';
  const seat = o.seat === 'ebony' ? 'ebony' : o.seat === 'white' ? 'enamel:#F5F2EC' : o.seat === 'satinwood' ? 'satinwood' : 'mahogany';
  const zb = 0.46;                                   // 碗中心离墙
  // 基座（收腰、线脚）＋ 莨苕叶浮雕环（fine）
  k.geo('porcelain', G.lathe2('wcPed', [[0, 0], [0.2, 0], [0.205, 0.02], [0.2, 0.05], [0.165, 0.09], [0.14, 0.2], [0.155, 0.3], [0.19, 0.38], [0, 0.38]], 18), 0, 0, zb - 0.02, 0.8, 0.74, 0.98);
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2, s = Math.sin(a), c = Math.cos(a); f.geo('porcelain', G.sph(6, 4), s * 0.128, 0.13, zb - 0.02 + c * 0.155, 0.034, 0.07, 0.014, a); }
  // 碗、卷边、水面
  const yb = 0.27;
  k.geo('porcelain', G.lathe2('wcBowl', WC_BOWL, 20), 0, yb, zb, 1, 1, 1.3);
  k.geo('porcelain', G.lathe2('wcIn', WC_IN, 20), 0, yb, zb, 1, 1, 1.3);
  k.geo('porcelain', G.tor(PI * 2, 5, 28, 0.12), 0, yb + 0.132, zb, 0.205, 0.1, 0.268);
  k.geo('enamel:#c9dcde', G.cyl(20), 0, yb + 0.05, zb + 0.02, 0.1, 0.004, 0.13);
  // 座圈（3 cm）＋ 盖（大一圈、掀起 8°）＋ 两个铜合页
  const ys = yb + 0.132 + 0.012 + 0.015;
  k.geo(seat, G.tor(PI * 2, 6, 28, 0.25), 0, ys, zb + 0.01, 0.18, 0.06, 0.235);
  const zh = zb - 0.27, yh = ys + 0.012, a = 10 * PI / 180, L = 0.29;
  k.geo(seat, G.cyl(28), 0, yh + Math.sin(a) * L + 0.009, zh + Math.cos(a) * L, 0.232, 0.02, L + 0.01, 0, -a);
  k.geo(seat, G.cyl(20), 0, yh + Math.sin(a) * (L + 0.01) + 0.022, zh + Math.cos(a) * (L + 0.01), 0.2, 0.012, L - 0.03, 0, -a);
  for (const sx of [-1, 1]) { cx_(k, trim, sx * 0.1, yh, zh + 0.01, 0.013, 0.06, 8); k.box(trim, sx * 0.1, yh - 0.004, zh + 0.04, 0.05, 0.006, 0.05); }
  // 水箱
  const lever = (x, y, z) => { vdisc(k, trim, x, y, z + 0.004, 0.022, 0.022, 0.008, 12); rod(k, trim, [x, y, z + 0.012], [x + 0.12, y - 0.018, z + 0.03], 0.0065, 6); k.sph('porcelain', x + 0.125, y - 0.019, z + 0.031, 0.017, 0.017, 0.017, 8, 6); };
  if (type === 'high') {
    const yc = 2.0;
    sl(k, 'mahogany', 0, yc + 0.14, 0.13, 0.54, 0.28, 0.24, 0.02); k.bx('mahogany', 0, yc + 0.28, 0.13, 0.58, 0.03, 0.27); k.bx('mahogany', 0, yc - 0.02, 0.13, 0.56, 0.03, 0.26);
    f.box('mahogany', 0, yc + 0.14, 0.253, 0.44, 0.18, 0.008); f.box('brass', 0.16, yc + 0.08, 0.255, 0.1, 0.05, 0.006);   // 铸铜铭牌（三代翻新）
    for (const sx of [-1, 1]) { k.geo('ormolu', G.tor(PI / 2, 5, 8, 0.12), sx * 0.2, yc - 0.18, 0.02, 0.2, 0.2, 0.2, 0, -H, 0); k.box('ormolu', sx * 0.2, yc - 0.04, 0.12, 0.03, 0.02, 0.22); }
    rod(k, trim, [0, yb + 0.12, zb - 0.26], [0, yb + 0.2, 0.07], 0.022, 10); rod(k, trim, [0, yb + 0.2, 0.07], [0, yc - 0.02, 0.07], 0.02, 10);
    rod(k, trim, [0.22, yc + 0.04, 0.22], [0.28, yc + 0.04, 0.3], 0.006, 5);
    rod(f, trim, [0.28, yc + 0.03, 0.3], [0.28, 1.5, 0.3], 0.003, 4); k.geo('porcelain', G.lathe('wcpull', [[0, 0], [0.018, 0.01], [0.022, 0.06], [0.012, 0.1], [0, 0.11]], 10), 0.28, 1.39, 0.3);
    for (let i = 0; i < 20; i++) f.geo(trim, G.tor(PI * 2, 3, 6, 0.3), 0.28, yc - 0.02 - i * 0.026, 0.3, 0.008, 0.008, 0.008, (i % 2) * H, H);
  } else {
    const yc = type === 'close' ? yb + 0.145 : 0.58, hc = 0.38;
    sl(k, 'porcelain', 0, yc + hc / 2, 0.12, 0.5, hc, 0.2, 0.025, 0, 0, 0, 0.025, 4);
    sl(k, 'porcelain', 0, yc + 0.02, 0.12, 0.52, 0.04, 0.215, 0.012);
    sl(k, o.lid || 'marbleW', 0, yc + hc + 0.016, 0.12, 0.52, 0.032, 0.22, 0.008);
    f.box('porcelain', 0, yc + hc - 0.06, 0.222, 0.44, 0.012, 0.006);
    lever(-0.19, yc + hc - 0.08, 0.22);
    if (type === 'low') { rod(k, trim, [0, yb + 0.12, zb - 0.26], [0, yb + 0.2, 0.12], 0.022, 10); rod(k, trim, [0, yb + 0.2, 0.12], [0, yc + 0.02, 0.12], 0.022, 10); k.cyl(trim, 0, yc - 0.03, 0.12, 0.034, 0.03, 10); for (const sx of [-1, 1]) k.box(trim, sx * 0.2, yc - 0.03, 0.06, 0.03, 0.06, 0.12); }
    else sl(k, 'porcelain', 0, yb + 0.1, zb - 0.28, 0.3, 0.2, 0.2, 0.05);
  }
  // 纸巾架（落地铜柱）
  if (o.paper !== false) { const px = 0.46, pz = zb - 0.05; k.cyl(trim, px, 0, pz, 0.06, 0.015, 12); k.cyl(trim, px, 0.015, pz, 0.012, 0.72, 8); k.sph(trim, px, 0.75, pz, 0.02, 0.02, 0.02, 8, 6);
    cx_(k, trim, px - 0.07, 0.66, pz, 0.006, 0.14, 6); k.geo('linen', G.cyl(16), px - 0.085, 0.66, pz, 0.055, 0.105, 0.055, 0, 0, H); f.geo('linen', G.cyl(12), px - 0.085, 0.6, pz + 0.03, 0.001, 0.105, 0.05, 0, 0, H); }
  k.blob(0, zb - 0.1, 0.7, 0.95, 0.03);
}
// 毛巾折层（y-z 剖面圆角 = 厚度一半 → 前后折边是圆柱）
const foldG = (w, t, d) => G.slab(w, t, d, t * 0.5, Math.min(0.009, t * 0.35), 3);
// 叠放毛巾：n 条，每折厚 t（默认 2.8 cm）；最上一条前沿金色刺绣带 + 3 cm 家徽圆片
export function towelStack(k, n, w, d, o = {}) {
  k = wk(k); const f = FINE(k); const t = o.t || 0.028, col = o.col || COL.towel, key = 'towel:' + col, r = srand(o.seed || ((n * 131 + w * 1000) | 0));
  const band = 'towel:' + shadeHex(col, 0.86);
  // 远景：主批次只放一块藏在折层里面的整块；近景（fine）才放逐条折层
  const lod = n >= 3 && o.lod !== false, kf = lod ? f : k;
  if (lod) { const e = t / 2 + 0.003; k.geo(key, G.slab(w - 2 * e, n * t * 0.97 - 2 * e * 0.6, d - 2 * e, 0.006, 0, 1), 0, n * t * 0.97 / 2, 0); }
  let y = 0, dx = 0, dz = 0, a = 0;
  for (let i = 0; i < n; i++) {
    dx = (r() - 0.5) * 0.008; dz = (r() - 0.5) * 0.008; a = (r() - 0.5) * 0.052;
    kf.geo(key, foldG(w, t, d), dx, y + t / 2, dz, 1, 1, 1, a);
    if (!o.plain) { const s = Math.sin(a), c = Math.cos(a); f.box(band, dx + s * (d / 2 + 0.0008), y + t / 2, dz + c * (d / 2 + 0.0008), w - 0.03, t * 0.36, 0.002, a); }
    y += t * 0.97;
  }
  if (o.crest !== false && !o.plain) {
    const s = Math.sin(a), c = Math.cos(a), yT = y - t * 0.97 + t / 2;
    f.box('gold', dx + s * (d / 2 + 0.0015), yT, dz + c * (d / 2 + 0.0015), w - 0.04, 0.01, 0.002, a);
    const cd = d / 2 - 0.045; f.cyl('gold', dx + s * cd, y - 0.001, dz + c * cd, 0.015, 0.002, 14); f.cyl('enamel:' + COL.crestBlue, dx + s * cd, y + 0.0005, dz + c * cd, 0.0095, 0.0012, 12);
  }
  return y;
}
// 垂挂的一片毛巾：竖直的厚片，截面是跑道形；中段微鼓，纵向两道软褶，两侧边略向后卷（顶、底被搭杆包边和滚边盖住）
function panelG(w, drop, t, side, col = COL.towel) {
  return G.custom(`tpanel${w}_${drop}_${t}_${side}_${col}`, () => {
    const nf = 7, nr = 3, r = t / 2, pts = [];
    for (let i = 0; i <= nf; i++) pts.push([-w / 2 + r + (w - 2 * r) * i / nf, r, 0, 1]);
    for (let i = 1; i < nr; i++) { const a = PI / 2 - PI * i / nr; pts.push([w / 2 - r + Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a)]); }
    for (let i = 0; i <= nf; i++) pts.push([w / 2 - r - (w - 2 * r) * i / nf, -r, 0, -1]);
    for (let i = 1; i < nr; i++) { const a = -PI / 2 - PI * i / nr; pts.push([-w / 2 + r + Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a)]); }
    const n = pts.length, pos = [], idx = [];
    const base = new THREE.Color(col), cols = [], VS = [0, 0.2, 0.42, 0.64, 0.82, 0.83, 0.9, 0.91, 0.94, 0.955, 1], band = (v) => (v >= 0.83 && v <= 0.9) || (v >= 0.94 && v <= 0.955) ? 0.8 : 1;
    for (const vv of VS) { const y = -drop * vv, s = Math.pow(Math.sin(PI * Math.min(1, vv * 1.03)), 0.7);
      for (const [x, z, nx, nz] of pts) { const u = x / (w / 2), wave = Math.sin(u * PI * 2.2 + 0.7), dz = side * (0.012 * s + 0.007 * s * wave - 0.008 * Math.pow(Math.abs(u), 4) * s);
        pos.push(x * (1 - 0.02 * s), y, z + dz); const f = band(vv) * (0.9 + 0.1 * (0.5 + 0.5 * wave * side * Math.sign(nz || 1))) * (1 - 0.08 * (1 - s)); cols.push(base.r * f, base.g * f, base.b * f); } }
    const R2 = VS.length;
    for (let j = 0; j < R2 - 1; j++) for (let i = 0; i < n; i++) { const a = j * n + i, b = j * n + (i + 1) % n, c = a + n, d = b + n; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; });
}
// 搭挂毛巾：对折搭在杆上（杆轴沿局部 x，在原点），两片之间留 gap，下缘圆滚边
export function towelHang(k, w, drop, o = {}) {
  k = wk(k); const f = FINE(k); const gap = o.gap ?? 0.04, t = o.t || 0.012, col = o.col || COL.towel, key = 'towel:' + col;
  const rIn = gap / 2, rOut = gap / 2 + t, zc = rIn + t / 2;
  const wrap = G.custom(`twrap${w}_${gap}_${t}`, () => { const s = new THREE.Shape(); s.absarc(0, 0, rOut, 0, PI, false); s.absarc(0, 0, rIn, PI, 0, true);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, -w / 2); g.rotateY(H); return g; });
  k.geo(key, wrap, 0, 0, 0);
  const dF = drop, dB = drop * (o.back ?? 0.93);
  k.geo('towel', panelG(w, dF, t, 1, col), 0, 0, zc); k.geo('towel', panelG(w, dB, t, -1, col), 0, 0, -zc);
  cx_(k, key, 0, -dF + 0.004, zc, 0.0125, w - 0.004, 10);
  cx_(k, key, 0, -dB + 0.004, -zc, 0.0125, w - 0.004, 10);
  if (o.plain) return;
  const zf = zc + t / 2 + 0.0045, band = 'towel:' + shadeHex(col, 0.86);
  f.box('gold', 0, -dF + 0.105, zf, w - 0.02, 0.008, 0.002);
  if (o.crest !== false) { vdisc(f, 'gold', 0, -dF + 0.18, zf, 0.015, 0.015, 0.002, 14); vdisc(f, 'enamel:' + COL.crestBlue, 0, -dF + 0.18, zf + 0.0012, 0.0095, 0.0095, 0.0012, 12); }
}
// 电热毛巾架（梯形，默认 5 根横杆）；返回各杆高度
export function towelRail(k, w = 0.6, h = 1.1, bars = 5, trim = 'brass') {
  k = wk(k); const f = FINE(k);
  for (const sx of [-1, 1]) { const x = sx * w / 2; k.cyl(trim, x, 0, 0, 0.035, 0.03, 10); k.cyl(trim, x, 0.03, 0, 0.017, h - 0.03, 10); k.sph(trim, x, h + 0.01, 0, 0.024, 0.024, 0.024, 10, 6);
    f.geo(trim, G.cyl(8), x, h - 0.08, -0.05, 0.01, 0.1, 0.01, 0, H); f.geo(trim, G.cyl(10), x, h - 0.08, -0.1, 0.03, 0.01, 0.03, 0, H); }
  const ys = []; for (let i = 0; i < bars; i++) { const y = h - 0.04 - i * (h * 0.6) / Math.max(1, bars - 1); ys.push(y); cx_(k, trim, 0, y, 0, 0.011, w, 10); }
  f.cyl('enamel:#E8E2D4', w / 2 - 0.02, 0.08, 0.03, 0.008, 0.02, 8);
  k.blob(0, 0, w + 0.3, 0.4, 0.03);
  return ys;
}
// 华夫格浴袍（挂在铜钩上）：局部原点 = 墙面上的钩位（hy 为钩高），袍子挂在 +z 前方
export function robe(k, hy = 1.72, col = '#F6F2E8', trim = 'brass') {
  k = wk(k); const f = FINE(k); const key = 'towel:' + col;
  k.geo(trim, G.cyl(8), 0, hy, 0.04, 0.011, 0.08, 0.011, 0, H); k.sph(trim, 0, hy + 0.012, 0.085, 0.018, 0.018, 0.018, 8, 6); vdisc(k, trim, 0, hy, 0.004, 0.03, 0.03, 0.008, 12);
  const body = G.custom('robeBody', () => { const s = new THREE.Shape(); s.moveTo(-0.13, 0); s.lineTo(0.13, 0); s.bezierCurveTo(0.24, -0.05, 0.3, -0.4, 0.31, -1.0); s.quadraticCurveTo(0.31, -1.06, 0.26, -1.06); s.lineTo(-0.26, -1.06); s.quadraticCurveTo(-0.31, -1.06, -0.31, -1.0); s.bezierCurveTo(-0.3, -0.4, -0.24, -0.05, -0.13, 0); return s; });
  const bg = G.custom('robeBodyG', () => { const g = new THREE.ExtrudeGeometry(body, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 1, curveSegments: 5 }); g.translate(0, 0, -0.03); g.deleteAttribute('uv'); g.deleteAttribute('normal'); const m = mergeV(g, 1e-5); m.computeVertexNormals(); return m; });
  k.geo(key, bg, 0, hy - 0.02, 0.1);
  for (const sx of [-1, 1]) { sl(k, key, sx * 0.25, hy - 0.42, 0.13, 0.14, 0.6, 0.11, 0.045, 0, 0, sx * 0.1); sl(k, key, sx * 0.27, hy - 0.73, 0.14, 0.15, 0.06, 0.12, 0.025, 0, 0, sx * 0.1); }
  for (const sx of [-1, 1]) sl(k, key, sx * 0.07, hy - 0.2, 0.155, 0.08, 0.42, 0.03, 0.012, 0, 0.05, sx * 0.3);
  k.geo(key, G.tor(PI * 2, 6, 20, 0.2), 0, hy - 0.55, 0.1, 0.27, 0.12, 0.08);
  sl(k, key, 0.06, hy - 0.72, 0.18, 0.05, 0.34, 0.012, 0.005, 0, 0.05, 0.08); sl(k, key, -0.02, hy - 0.7, 0.18, 0.05, 0.3, 0.012, 0.005, 0, 0.05, -0.05);
  vdisc(f, 'gold', 0.12, hy - 0.3, 0.165, 0.022, 0.022, 0.002, 12);
}
// 藤编篮（装用过的毛巾）
export function basket(k, r = 0.2, h = 0.34) {
  k = wk(k);
  k.geo('rattan', G.lathe('basket', [[0, 0], [0.85, 0], [0.95, 0.4], [1, 1]], 16), 0, 0, 0, r, h, r * 0.8);
  k.geo('rattan', G.lathe('basketIn', [[1, 1], [0.95, 0.4], [0.85, 0.05], [0, 0.05]].map(p => [p[0] * 0.96, p[1]]), 16), 0, 0, 0, r, h, r * 0.8);
  k.geo('rattan', G.tor(PI * 2, 5, 24, 0.08), 0, h, 0, r, r, r * 0.8);
  for (const sx of [-1, 1]) k.geo('rattan', G.tor(PI, 4, 10, 0.12), sx * r, h, 0, 0.07, 0.07, 0.07, H * sx, -H);
  k.geo('towel:' + COL.towel, pillowG(), 0.03, h - 0.02, 0.02, r * 0.8, 0.07, r * 0.55, 0.4, 0.3); k.geo('towel:#EDE6D6', pillowG(), -0.05, h + 0.02, -0.03, r * 0.6, 0.06, r * 0.4, -0.5, -0.4);
  k.blob(0, 0, r * 2.6, r * 2.2, 0.03);
}
// 洗手台：桃花心木柜（镶板门）＋ marbleGold 台面（带挡水）＋ 台下椭圆盆 ＋ 鹅颈龙头与十字把手；o.mk = 镜子/壁灯所在 Kit
export function basins(k, w = 2.6, o = {}) {
  if (typeof o === 'number') o = { n: o };
  k = wk(k); const f = FINE(k);
  const n = o.n || (w >= 1.8 ? 2 : 1), top = o.top || 'marbleGold', trim = o.trim || 'brass', cab = o.cab || 'mahogany', d = 0.56, Ht = 0.86;
  k.bx(cab, 0, 0, 0.0, w - 0.06, 0.1, d - 0.08); k.bx(cab, 0, 0.1, 0, w, 0.56, d); for (const sx of [-1, 1]) k.bx(cab, sx * (w / 2 - 0.02), 0.66, 0, 0.04, 0.17, d); k.bx(cab, 0, 0.66, d / 2 - 0.02, w, 0.17, 0.04); k.bx(cab, 0, 0.66, -d / 2 + 0.02, w, 0.17, 0.04); k.bx(cab, 0, 0.8, d / 2 - 0.005, w + 0.02, 0.03, 0.03);
  const xs = []; for (let i = 0; i < n; i++) xs.push(n === 1 ? 0 : (i - (n - 1) / 2) * (w / n) * 1.05);
  const nd = Math.max(2, Math.round(w / 0.55));
  for (let i = 0; i < nd; i++) { const x = -w / 2 + w * (i + 0.5) / nd; panelDoor(f, x, 0.14, d / 2 + 0.004, w / nd - 0.04, 0.62, cab); k.sph(trim, x + (i % 2 ? -1 : 1) * (w / nd / 2 - 0.07), 0.46, d / 2 + 0.014, 0.014, 0.014, 0.012, 8, 6); }
  // 台面：挖椭圆孔
  const topG = G.custom(`vtop${w}_${n}`, () => { const s = new THREE.Shape(); const W = w + 0.04, D = d + 0.03; s.moveTo(-W / 2, -D / 2); s.lineTo(W / 2, -D / 2); s.lineTo(W / 2, D / 2); s.lineTo(-W / 2, D / 2); s.closePath();
    for (const x of xs) { const hp = new THREE.Path(); hp.absellipse(x, 0.02, 0.19, 0.14, 0, PI * 2, true); s.holes.push(hp); }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false, curveSegments: 9 }); g.rotateX(-H); return g; });
  k.geo(top, topG, 0, Ht - 0.03, 0.015 - 0.0);
  k.bx(top, 0, Ht, -d / 2 - 0.0, w + 0.04, 0.12, 0.02); k.bx(top, 0, Ht - 0.07, d / 2 + 0.025, w + 0.04, 0.07, 0.02);
  for (const x of xs) {
    const zb = -0.02;
    k.geo('porcelain', G.lathe2('basinIn', [[1, 0], [0.9, -0.35], [0.6, -0.72], [0.25, -0.92], [0, -0.95]], 18), x, Ht - 0.03, zb + 0.015, 0.19, 0.13, 0.14);
    k.cyl(trim, x, Ht - 0.03 - 0.124, zb + 0.015, 0.02, 0.004, 10);
    // 鹅颈龙头（弯管在 yz 竖面、出水朝 +z）
    const zp = -d / 2 + 0.06, yb = Ht;
    k.cyl(trim, x, yb, zp, 0.03, 0.015, 10); k.cyl(trim, x, yb, zp, 0.016, 0.2, 8);
    k.geo(trim, G.tor(PI, 5, 12, 0.14), x, yb + 0.2, zp + 0.08, 0.08, 0.08, 0.08, -H, -H);
    k.cyl(trim, x, yb + 0.17, zp + 0.16, 0.014, 0.03, 8, 1.2);
    for (const s of [-1, 1]) { const hx = x + s * 0.12; k.cyl(trim, hx, yb, zp, 0.024, 0.012, 8); k.cyl(trim, hx, yb + 0.012, zp, 0.012, 0.045, 6);
      k.box(trim, hx, yb + 0.065, zp, 0.085, 0.011, 0.011); k.box(trim, hx, yb + 0.065, zp, 0.011, 0.011, 0.085); k.sph(trim, hx, yb + 0.065, zp, 0.016, 0.014, 0.016, 6, 4);
      k.cyl('enamel:#F5F2EC', hx, yb + 0.075, zp, 0.011, 0.008, 8); f.cyl(s < 0 ? 'enamel:#b0262a' : 'enamel:#2a4a9a', hx, yb + 0.0835, zp, 0.005, 0.001, 8); }
    FINE(k).geo('porcelain', G.lathe('soap', [[0, 0], [0.04, 0], [0.06, 0.015], [0.058, 0.02]], 12), x + 0.3 * (n === 1 ? 1 : Math.sign(x) || 1), Ht, zp + 0.05, 1, 1, 0.8);
    const mk = o.mk === false ? null : o.mk ? wk(o.mk) : k;
    if (mk) { mirrorOval(loc(mk, x, -d / 2 + 0.005, 0, 1.62), 0.62, 0.86, o.frame); for (const s of [-1, 1]) sconce(loc(mk, x + s * 0.48, -d / 2 + 0.005, 0, 1.68), { arms: 1, mat: trim === 'nickel' ? 'nickel' : 'ormolu' }); }
  }
  k.blob(0, 0.05, w + 0.4, 1.0, 0.03);
  return xs;
}
// 椭圆鎏金镜：局部原点 = 镜心，墙面 z=0，面朝 +z
export function mirrorOval(k, w = 0.6, h = 0.85, frame = 'gold') {
  k = wk(k); const f = FINE(k);
  k.geo(frame, G.tor(PI * 2, 5, 28, 0.1), 0, 0, 0.03, w / 2, 0.3, h / 2, 0, H);
  k.geo('mirror', G.cyl(24), 0, 0, 0.022, w / 2 * 0.95, 0.01, h / 2 * 0.95, 0, H);
  f.geo(frame, G.tor(PI * 2, 4, 40, 0.04), 0, 0, 0.042, w / 2 * 0.9, 0.3, h / 2 * 0.9, 0, H);
  k.sph(frame, 0, h / 2 + 0.06, 0.03, 0.09, 0.07, 0.025, 10, 6); f.sph(frame, 0, -h / 2 - 0.03, 0.03, 0.05, 0.04, 0.02, 8, 6);
  for (const s of [-1, 1]) f.geo(frame, G.tor(PI, 4, 10, 0.25), s * 0.07, h / 2 + 0.05, 0.03, 0.06, 0.06, 0.06, 0, H, s * 0.4);
}
export function mirrorRect(k, w = 0.7, h = 0.9, frame = 'brass') { k = wk(k); k.box(frame, 0, 0, 0.02, w, h, 0.03); k.box('mirror', 0, 0, 0.037, w - 0.08, h - 0.08, 0.004); }
// 浴缸：slipper = 整石拖鞋缸（Statuario，一端 0.75、一端 0.6，卷边），roll = 铸铁卷边缸（外壁漆色）；o.dais 圆台
export function tub(k, o = {}) {
  k = wk(k); const f = FINE(k);
  const kind = o.kind || 'roll', len = o.len || (kind === 'slipper' ? 2.0 : 1.8), wid = kind === 'slipper' ? 0.86 : 0.78, trim = o.trim || 'brass';
  let y0 = 0;
  if (o.dais) { const R0 = o.dais === true ? 1.6 : o.dais / 2; k.cyl('marbleBlack', 0, 0, 0, R0, 0.15, 48); k.cyl('marbleW', 0, 0.15, 0, R0 - 0.1, 0.004, 48); k.geo('brass', G.tor(PI * 2, 4, 64, 0.1), 0, 0.152, 0, R0 - 0.1, 0.02, R0 - 0.1); y0 = 0.154; }
  const fh = 0.12, lowH = 0.6 - fh, highH = kind === 'slipper' ? 0.75 - fh : 0.66 - fh;
  const PROF = [[0.7, 0.0], [0.8, 0.04], [0.9, 0.22], [0.97, 0.6], [1.0, 0.88], [1.035, 0.93], [1.05, 0.975], [1.035, 1.01], [0.995, 1.0], [0.965, 0.95], [0.925, 0.6], [0.84, 0.25], [0.72, 0.1], [0.4, 0.08], [0, 0.08]];
  const shell = G.custom(`tub_${kind}_${len}`, () => {
    const g = new THREE.LatheGeometry(PROF.map(p => new THREE.Vector2(p[0], p[1])), 36); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), xn = x / 1.05;
      const s = kind === 'slipper' ? Math.min(1, Math.max(0, (xn + 0.15) / 1.15)) : Math.abs(xn); const e = s * s * (3 - 2 * s);
      p.setXYZ(i, x * len / 2 / 1.05, y * (lowH + (highH - lowH) * e), z * wid / 2 / 1.05); }
    g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m = mergeV(g, 1e-5); m.computeVertexNormals(); return m; });
  const skin = G.custom(`tubskin_${kind}_${len}`, () => { const g = shell.clone(); const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * 0.004, p.getY(i) + n.getY(i) * 0.004, p.getZ(i) + n.getZ(i) * 0.004); return g; });
  const shellKey = kind === 'slipper' ? 'marbleW' : 'porcelain';
  k.geo(shellKey, shell, 0, y0 + fh, 0);
  if (kind !== 'slipper') k.geo('enamel:' + (o.col || COL.azure), G.custom(`tubout_${kind}_${len}`, () => { const g = skin.clone(); const p = g.attributes.position, nn = g.attributes.normal; const idx = g.index.array, keep = [];
      for (let t = 0; t < idx.length; t += 3) { let out = true; for (let j = 0; j < 3; j++) { const v = idx[t + j]; if (nn.getY(v) > 0.25 || nn.getX(v) * p.getX(v) / (len * len) + nn.getZ(v) * p.getZ(v) / (wid * wid) <= 0) out = false; } if (out) keep.push(idx[t], idx[t + 1], idx[t + 2]); }
      g.setIndex(keep); return g; }), 0, y0 + fh, 0);
  k.geo('enamel:#bcd5d8', G.cyl(28), 0, y0 + fh + lowH * 0.55, 0, len / 2 * 0.82, 0.004, wid / 2 * 0.78);
  // 爪足：球 + 三趾 + 兽腿
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = sx * len * 0.34, z = sz * wid * 0.3, a = Math.atan2(sx, sz);
    rod(k, 'ormolu', [x, y0 + 0.05, z], [x * 0.94, y0 + fh + 0.06, z * 0.9], 0.032, 8); k.sph('ormolu', x, y0 + 0.045, z, 0.045, 0.045, 0.045, 8, 6);
    for (const da of [-0.55, 0, 0.55]) { const b = a + da; k.geo('ormolu', G.sph(5, 3), x + Math.sin(b) * 0.045, y0 + 0.022, z + Math.cos(b) * 0.045, 0.014, 0.018, 0.04, b); }
    f.geo('ormolu', G.sph(6, 4), x * 0.97, y0 + fh + 0.02, z * 0.95, 0.05, 0.06, 0.03, a); }
  // 落地龙头（低端 −x）：两根立管 + 混水体 + 十字把手 + 鹅颈 + 手持花洒托架
  const fx = -len / 2 - 0.22;
  for (const s of [-1, 1]) { const z = s * 0.08; k.cyl(trim, fx, y0, z, 0.04, 0.02, 12); k.cyl(trim, fx, y0 + 0.02, z, 0.017, 0.78, 10);
    k.cyl(trim, fx, y0 + 0.83, z, 0.013, 0.05, 8); k.box(trim, fx, y0 + 0.885, z, 0.09, 0.011, 0.011); k.box(trim, fx, y0 + 0.885, z, 0.011, 0.011, 0.09); k.cyl('enamel:#F5F2EC', fx, y0 + 0.89, z, 0.012, 0.012, 10);
    f.cyl(s < 0 ? 'enamel:#b0262a' : 'enamel:#2a4a9a', fx, y0 + 0.9025, z, 0.006, 0.001, 8); }
  cz_(k, trim, fx, y0 + 0.8, 0, 0.022, 0.2, 10);
  k.cyl(trim, fx, y0 + 0.8, 0, 0.016, 0.22, 10);
  k.geo(trim, G.tor(PI, 6, 16, 0.12), fx + 0.13, y0 + 1.02, 0, 0.13, 0.13, 0.13, 0, -H);
  k.cyl(trim, fx + 0.26, y0 + 0.97, 0, 0.014, 0.05, 8, 1.3);
  rod(k, trim, [fx, y0 + 0.8, 0.1], [fx - 0.02, y0 + 0.96, 0.14], 0.01, 6); k.box(trim, fx - 0.02, y0 + 0.97, 0.14, 0.06, 0.012, 0.03);
  k.geo(trim, G.cyl(10), fx - 0.02, y0 + 0.99, 0.14, 0.018, 0.2, 0.018, 0, H); k.geo(trim, G.cyl(12, 1.6), fx - 0.02, y0 + 0.99, 0.26, 0.028, 0.05, 0.028, 0, H);
  f.geo('porcelain', G.cyl(10), fx - 0.02, y0 + 0.99, 0.2, 0.019, 0.05, 0.019, 0, H);
  for (let i = 0; i < 8; i++) { const t = i / 7; f.geo(trim, G.sph(5, 4), fx - 0.02 + Math.sin(t * PI) * 0.05, y0 + 0.97 - Math.sin(t * PI) * 0.35, 0.14 - t * 0.06, 0.012, 0.012, 0.012); }
  f.cyl(trim, -len / 2 + 0.28, y0 + fh + 0.12 * lowH, 0, 0.025, 0.004, 10);
  k.blob(0, 0, len + 0.8, wid + 0.6, y0 + 0.03);
}
// 淋浴间：玻璃 + 黄铜框，顶上大花洒
export function shower(k, w = 2.4, d = 2.4, h = 2.3, trim = 'brass') {
  k = wk(k); k.bx('marbleW', 0, 0, 0, w, 0.06, d); k.cyl(trim, 0, 0.06, 0, 0.05, 0.004, 10);
  for (const [x, z] of [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]]) k.bx(trim, x, 0, z, 0.04, h, 0.04);
  for (const [x, z, ww, dd] of [[0, d / 2, w, 0.04], [w / 2, 0, 0.04, d], [0, -d / 2, w, 0.04], [-w / 2, 0, 0.04, d]]) { k.bx(trim, x, h - 0.04, z, ww, 0.04, dd); k.bx(trim, x, 0.06, z, ww, 0.03, dd); }
  k.bx('glassHouse', 0, 0.09, d / 2, w - 0.04, h - 0.13, 0.01); k.bx('glassHouse', w / 2, 0.09, 0.3, 0.01, h - 0.13, d - 0.64);
  k.bx(trim, 0.1, 0.09, d / 2 + 0.01, 0.03, h - 0.13, 0.02); cz_(k, trim, 0.1, 1.05, d / 2 + 0.06, 0.012, 0.12, 6);
  rod(k, trim, [-w / 2 + 0.3, 0.06, -d / 2 + 0.06], [-w / 2 + 0.3, h - 0.15, -d / 2 + 0.06], 0.018, 8); rod(k, trim, [-w / 2 + 0.3, h - 0.15, -d / 2 + 0.06], [0, h - 0.15, 0], 0.014, 8);
  k.cyl(trim, 0, h - 0.2, 0, 0.18, 0.04, 20, 0.6); for (const s of [-1, 1]) { k.cyl(trim, -w / 2 + 0.3 + s * 0.1, 1.1, -d / 2 + 0.07, 0.02, 0.02, 8); k.box(trim, -w / 2 + 0.3 + s * 0.1, 1.13, -d / 2 + 0.08, 0.07, 0.01, 0.01); }
}

/* ================================================================
 * 床与织物
 * ================================================================ */
// 床：原点在床头板背面，床身沿 +z。o = { fab, canopy:'none'|'poster'|'crown', pillows:6|4|2, deco:3|2|0, crest, wood, duvet, throw, drape }
export function bed(k, w = 1.9, l = 2.2, o = {}) {
  if (typeof o === 'string') o = { fab: o, canopy: arguments[4] ? 'poster' : 'none' };
  k = wk(k); const f = FINE(k); const lo = LO();
  const fab = o.fab || 'velvet:' + COL.champ, wood = o.wood || 'mahogany', duv = 'fab:' + (o.duvet || '#F8F5EF'), sheet = 'linen', hb = o.hb ?? 1.35;
  // 床架、床脚、床裙
  sl(k, wood, 0, 0.29, l / 2 + 0.05, w + 0.1, 0.26, l, 0.03);
  for (const sx of [-1, 1]) for (const z of [0.12, l]) k.geo(wood, G.lathe('tleg2', TLEG, 5), sx * (w / 2 + 0.02), 0, z, 0.05, 0.16, 0.05);
  // 床垫
  sl(k, sheet, 0, 0.53, l / 2 + 0.06, w - 0.02, 0.22, l - 0.06, 0.06);
  const top = 0.64, dt = 0.075, dz0 = 0.78, zEnd = l + 0.08, dl = zEnd - dz0, drop = 0.26;
  // 被子：顶板 + 两侧和床尾垂边 + 圆边
  sl(k, duv, 0, top + dt / 2, dz0 + dl / 2, w + 0.12, dt, dl, 0.035);
  for (const sx of [-1, 1]) { sl(k, duv, sx * (w / 2 + 0.07), top - drop / 2 + 0.02, dz0 + dl / 2 + 0.02, 0.045, drop, dl - 0.04, 0.02); k.geo(duv, G.cyl(10), sx * (w / 2 + 0.05), top + 0.02, dz0 + dl / 2, 0.05, dl - 0.02, 0.05, 0, H); }
  sl(k, duv, 0, top - drop / 2 + 0.02, zEnd + 0.02, w + 0.14, drop, 0.045, 0.02); cx_(k, duv, 0, top + 0.02, zEnd - 0.01, 0.05, w + 0.1, 10);
  // 被头翻折 0.35 ＋ 折边滚圆 ＋ 床单翻边
  cx_(k, duv, 0, top + dt * 0.95, dz0, dt * 0.95, w + 0.12, 12);
  sl(k, duv, 0, top + dt + dt * 0.42, dz0 + 0.175, w + 0.12, dt * 0.84, 0.35, 0.03);
  sl(k, 'fab:#FFFFFF', 0, top + dt * 1.86, dz0 + 0.3, w + 0.1, 0.012, 0.12, 0.005);
  f.box('gold', 0, top + dt * 1.87, dz0 + 0.36, w + 0.08, 0.004, 0.012);
  // 枕头：6 羽绒（两排，前排略小）＋ 装饰枕
  const np = o.pillows || 4, perRow = np >= 6 ? 3 : 2, pw = Math.min(0.74, (w - 0.12) / perRow);
  for (let r = 0; r < 2; r++) for (let i = 0; i < perRow; i++) { const x = (i - (perRow - 1) / 2) * pw * 0.96, s = r ? 0.9 : 1;
    pillowAt(k, 'fab:#FBF9F4', x + (r ? 0.02 : 0), top + (r ? 0.17 : 0.24), 0.2 + r * 0.17, pw * s, 0.22 * s, 0.5 * s, r ? -0.75 : -1.05); }
  const nd = o.deco ?? 2, dc = o.decoCol || (fab.includes(':') ? fab.split(':')[1] : COL.champ);
  for (let i = 0; i < nd; i++) { const c = nd === 3 && i === 1, x = nd === 1 ? 0 : (i - (nd - 1) / 2) * 0.46;
    if (c) { pillowAt(k, 'velvet:' + COL.champ, 0, top + 0.17, 0.58, 0.46, 0.14, 0.3, -0.5); vdisc(loc(f, 0, 0.58, 0, top + 0.17, -0.5), 'gold', 0, 0, 0.075, 0.05, 0.05, 0.004, 16); vdisc(loc(f, 0, 0.58, 0, top + 0.17, -0.5), 'enamel:' + COL.crestBlue, 0, 0, 0.078, 0.032, 0.036, 0.003, 12); }
    else { pillowAt(k, 'velvet:' + dc, x, top + 0.2, 0.52, 0.44, 0.16, 0.44, -0.62, x * 0.2); if (!lo) for (const sx of [-1, 1]) f.sph('gold', x + sx * 0.21, top + 0.2 + 0.2, 0.52 - 0.1, 0.012, 0.03, 0.012, 5, 4); } }
  // 床尾三折搭毯（金色丝绒），垂到床沿
  if (o.throw !== false) { const tk = 'velvet:' + (o.throwCol || '#C9A24B'), tz = zEnd - 0.42;
    for (let i = 0; i < 3; i++) sl(k, tk, 0, top + dt + 0.012 + i * 0.016, tz, w + 0.18, 0.016, 0.52 - i * 0.004, 0.008);
    for (const sx of [-1, 1]) sl(k, tk, sx * (w / 2 + 0.11), top + dt - 0.1, tz, 0.03, 0.26, 0.52, 0.012);
    f.box('gold', 0, top + dt + 0.06, tz + 0.262, w + 0.16, 0.008, 0.004); }
  // 床头板
  sl(k, wood, 0, hb / 2, 0.04, w + 0.3, hb, 0.08, 0.02);
  sl(k, fab, 0, 0.62 + (hb - 0.75) / 2, 0.095, w - 0.02, hb - 0.7, 0.06, 0.03);
  k.geo(wood, G.seg(), 0, hb, 0.04, (w + 0.3) / 2, 0.28, 0.08);
  for (const sx of [-1, 1]) k.geo(wood, G.lathe('bpostS', [[0, 0], [0.06, 0], [0.05, 0.1], [0.045, 0.9], [0.06, 1], [0, 1.05]], 6), sx * (w / 2 + 0.12), 0, 0.05, 1, hb + 0.08, 1);
  if (!lo) for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) f.sph(fab, (i - 2) * (w / 5), 0.8 + j * 0.25, 0.128, 0.012, 0.012, 0.008, 6, 4);
  if (o.crest) PROP.crest(loc(k, 0, 0.13, 0, hb - 0.08), { w: 0.5 });
  // 床尾板
  sl(k, wood, 0, 0.3, l + 0.1, w + 0.2, 0.52, 0.07, 0.02); cx_(k, wood, 0, 0.58, l + 0.1, 0.05, w + 0.2, 12);
  // 华盖
  const drapeCol = o.drape || '#EDE3CC', dk = 'fab:' + drapeCol;
  if (o.canopy === 'poster') {
    for (const sx of [-1, 1]) for (const z of [0.05, l + 0.1]) { k.geo(wood, G.lathe('bpost', [[0, 0], [0.07, 0], [0.07, 0.2], [0.05, 0.25], [0.045, 0.4], [0.06, 0.45], [0.035, 0.95], [0.045, 1], [0, 1.02]], 8), sx * (w / 2 + 0.12), 0, z, 1, 2.3, 1); k.sph('ormolu', sx * (w / 2 + 0.12), 2.37, z, 0.05, 0.07, 0.05, 8, 6); }
    for (const sx of [-1, 1]) { k.bx(wood, sx * (w / 2 + 0.12), 2.24, l / 2 + 0.07, 0.07, 0.1, l + 0.1); k.bx(fab, sx * (w / 2 + 0.16), 1.98, l / 2 + 0.07, 0.02, 0.28, l + 0.2); }
    for (const z of [0.05, l + 0.1]) { k.bx(wood, 0, 2.24, z, w + 0.3, 0.1, 0.07); k.bx(fab, 0, 1.98, z + (z > 1 ? 0.04 : -0.02), w + 0.34, 0.28, 0.02); }
    f.box('gold', 0, 1.99, l + 0.16, w + 0.34, 0.03, 0.01); for (const sx of [-1, 1]) f.box('gold', sx * (w / 2 + 0.175), 1.99, l / 2 + 0.07, 0.01, 0.03, l + 0.2);
    for (const sx of [-1, 1]) for (const z of [0.1, l + 0.05]) for (let i = 0; i < 3; i++) { const x = sx * (w / 2 + 0.2 - i * 0.06); rod(k, dk, [x, 1.96, z + (i - 1) * 0.05], [sx * (w / 2 + 0.22), 1.0, z], 0.045, 6); rod(k, dk, [sx * (w / 2 + 0.22), 1.0, z], [x + sx * 0.05, 0.02, z + (i - 1) * 0.08], 0.05, 6); }
  } else if (o.canopy === 'crown') {
    const cy = 3.1, cz = 0.12, cr = 0.42; const ck = loc(k, 0, cz, 0, cy);
    ck.geo('ormolu', G.tor(PI * 2, 6, 36, 0.12), 0, 0, 0, cr, cr, cr); ck.cyl('ormolu', 0, -0.06, 0, cr, 0.06, 28, 1, 1, 1);
    for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; ck.geo('ormolu', G.cone(5), Math.sin(a) * cr, 0.12, Math.cos(a) * cr, 0.05, 0.22, 0.03, a); if (i % 3 === 0) ck.sph('ormolu', Math.sin(a) * cr, 0.25, Math.cos(a) * cr, 0.03, 0.03, 0.03, 6, 4); }
    ck.geo('ormolu', G.lathe('crownTop', [[0, 0], [0.2, 0], [0.12, 0.12], [0.05, 0.25], [0.08, 0.3], [0, 0.4]], 10), 0, 0.02, 0); ck.sph('gold', 0, 0.44, 0, 0.05, 0.06, 0.05, 8, 6);
    k.bx('ormolu', 0, cy - 0.35, 0.02, 0.06, 0.4, 0.04);
    const panel = (pts, np = 8) => { for (let i = 0; i < np; i++) { const t = (i / (np - 1) - 0.5), zo = (i % 2 ? 0.03 : -0.03);
        for (let s = 0; s < pts.length - 1; s++) { const a = pts[s], b = pts[s + 1]; rod(k, dk, [a[0] + t * a[3], a[1], a[2] + zo], [b[0] + t * b[3], b[1], b[2] + zo], 0.04, 6); } } };
    // 两片垂在床头墙面，两片向两侧撩起、系在床侧
    for (const sx of [-1, 1]) panel([[sx * 0.2, cy - 0.05, 0.06, 0.28], [sx * (w / 2 - 0.05), 1.6, 0.04, 0.5], [sx * (w / 2 - 0.02), 0.02, 0.04, 0.55]]);
    for (const sx of [-1, 1]) panel([[sx * 0.36, cy - 0.05, cz + 0.2, 0.22], [sx * (w / 2 + 0.3), 1.25, 0.5, 0.12], [sx * (w / 2 + 0.42), 0.02, 0.75, 0.42]]);
    for (const sx of [-1, 1]) { k.geo('gold', G.tor(PI * 2, 4, 14, 0.25), sx * (w / 2 + 0.3), 1.25, 0.5, 0.1, 0.12, 0.1); f.geo('gold', G.cone(6), sx * (w / 2 + 0.3), 1.08, 0.53, 0.035, 0.14, 0.035); }
  }
  k.blob(0, l / 2, w + 0.9, l + 0.7, 0.03);
}
// 窗帘：局部原点 = 窗中心底（地面），墙面 z=0；每侧 8 条褶交替错开 ±3 cm，0.45 高处金流苏系带，上方鎏金帘盒
export function drapes(k, w, h, o = {}) {
  k = wk(k); const f = FINE(k); const lo = LO();
  const col = o.col || COL.champ, key = (o.velvet ? 'velvet:' : 'fab:') + col, np = lo ? 5 : 8, tieY = h * 0.45, top = h;
  for (const s of [-1, 1]) {
    const xa = s * (w / 2 - 0.06), xb = s * (w / 2 + 0.34), xt = s * (w / 2 + 0.18);
    for (let i = 0; i < np; i++) { const u = i / (np - 1), zo = 0.09 + (i % 2 ? 0.03 : -0.03), xtop = xa + (xb - xa) * u, xtie = xt + s * (u - 0.5) * 0.14, xfl = xt + s * (u - 0.5) * 0.42 + s * 0.04;
      rod(k, key, [xtop, top, zo], [xtie, tieY, zo + 0.02], 0.042, 6, 0.03); rod(k, key, [xtie, tieY, zo + 0.02], [xfl, 0.0, zo + 0.05], 0.046, 6, 0.032); }
    k.geo('gold', G.tor(PI * 2, 4, 14, 0.2), xt, tieY, 0.11, 0.12, 0.12, 0.08);
    f.geo('gold', G.cone(6), xt + s * 0.02, tieY - 0.14, 0.2, 0.035, 0.16, 0.035); f.sph('gold', xt + s * 0.02, tieY - 0.05, 0.2, 0.025, 0.03, 0.025, 6, 4);
  }
  const pw = w + 0.9;
  if (o.pelmet !== false) { k.bx('gold', 0, top, 0.1, pw, 0.3, 0.16); k.bx('gold', 0, top + 0.28, 0.11, pw + 0.06, 0.05, 0.2); f.box('ormolu', 0, top + 0.15, 0.185, pw - 0.1, 0.03, 0.008);
    if (!lo) for (let i = 0; i < Math.round(pw / 0.22); i++) f.geo(key, G.hemi(8), -pw / 2 + 0.11 + i * 0.22, top, 0.17, 0.1, 0.08, 0.02, 0, PI); }
}
// 罗马帘（浴室）
export function romanBlind(k, w, h, o = {}) {
  k = wk(k); const key = 'fab:' + (o.col || '#EEE7D8'); const y0 = h - 0.9;
  for (let i = 0; i < 4; i++) sl(k, key, 0, y0 + 0.1 + i * 0.2, 0.08, w + 0.06, 0.2, 0.05 + (3 - i) * 0.01, 0.02);
  k.bx('gold', 0, h, 0.06, w + 0.16, 0.08, 0.1); FINE(k).box('gold', 0, y0 + 0.03, 0.1, w + 0.06, 0.02, 0.012);
}
// 地毯（贴图整张），y 由调用方给
function rugPlane(b, key, x, y, z, w, d, ry = 0) { b.add(key, G.plane, mat4(x, y, z, w, 1, d, ry)); }

/* ================================================================
 * 传承件 PROP
 * ================================================================ */
const SHIELD = () => G.shape('shield', () => { const s = new THREE.Shape(); s.moveTo(-0.5, 0.5); s.lineTo(0.5, 0.5); s.lineTo(0.5, 0.05); s.quadraticCurveTo(0.5, -0.42, 0, -0.62); s.quadraticCurveTo(-0.5, -0.42, -0.5, 0.05); s.closePath(); return s; }, 1);
const WING = () => G.shape('wing', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(0.3, 0.1, 0.7, 0.45, 1.0, 0.95); s.lineTo(0.92, 0.72); s.lineTo(0.86, 0.8); s.lineTo(0.78, 0.56); s.lineTo(0.7, 0.64); s.lineTo(0.62, 0.42); s.lineTo(0.52, 0.48); s.lineTo(0.44, 0.28); s.lineTo(0.32, 0.3); s.bezierCurveTo(0.2, 0.12, 0.08, 0.06, 0, 0.1); s.closePath(); return s; }, 1);
// 家徽图形：局部 xy 平面、面朝 +z，盾心在原点；sw = 盾宽
function crestFigure(k, sw, o = {}) {
  const f = FINE(k), dz = o.depth || 1, d = sw < 0.5 ? f : k;
  k.geo('gold', SHIELD(), 0, 0, 0.012 * dz, sw * 1.08, sw * 1.08, 0.024 * dz * sw);
  k.geo('enamel:' + COL.crestBlue, SHIELD(), 0, 0, 0.03 * dz * sw, sw, sw, 0.02 * dz * sw);
  const z = 0.042 * dz * sw;
  k.box('gold', 0, -0.16 * sw, z, 0.06 * sw, 0.3 * sw, 0.012 * sw);
  for (const s of [-1, 1]) k.box('gold', s * 0.05 * sw, -0.06 * sw, z, 0.03 * sw, 0.14 * sw, 0.01 * sw, 0, 0, s * 0.6);
  vdisc(k, 'gold', 0, 0.05 * sw, z, 0.2 * sw, 0.16 * sw, 0.012 * sw * dz, 18);
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; d.sph('gold', Math.sin(a) * 0.13 * sw, 0.05 * sw + Math.cos(a) * 0.1 * sw, z + 0.012 * sw * dz, 0.028 * sw, 0.028 * sw, 0.016 * sw * dz, 6, 4); }
  for (let i = 0; i < 4; i++) d.sph('trim', (i - 1.5) * 0.12 * sw, -0.33 * sw, z, 0.08 * sw, 0.045 * sw, 0.014 * sw * dz, 6, 4);
  k.geo('gold', WING(), 0.06 * sw, 0.22 * sw, z, 0.32 * sw, 0.26 * sw, 0.012 * sw * dz);
  k.geo('gold', WING(), -0.06 * sw, 0.22 * sw, z, 0.32 * sw, 0.26 * sw, 0.012 * sw * dz, PI);
  // 五瓣冠
  k.box('gold', 0, 0.6 * sw, 0.02 * sw * dz, 0.5 * sw, 0.08 * sw, 0.04 * sw * dz);
  for (let i = 0; i < 5; i++) { const x = (i - 2) * 0.11 * sw; k.geo('gold', G.cone(4), x, 0.7 * sw, 0.02 * sw * dz, 0.035 * sw, 0.14 * sw, 0.02 * sw * dz); d.sph(i === 2 ? 'enamel:#b0262a' : 'gold', x, 0.78 * sw, 0.02 * sw * dz, 0.025 * sw, 0.025 * sw, 0.015 * sw * dz, 5, 3); }
  if (o.supporters) for (const s of [-1, 1]) { const x = s * 0.72 * sw;
    k.sph('trim', x, -0.05 * sw, 0.03 * sw * dz, 0.16 * sw, 0.3 * sw, 0.06 * sw * dz, 8, 6); k.sph('trim', x - s * 0.06 * sw, 0.34 * sw, 0.03 * sw * dz, 0.09 * sw, 0.1 * sw, 0.05 * sw * dz, 6, 5);
    k.geo('gold', G.cone(5), x - s * 0.16 * sw, 0.33 * sw, 0.03 * sw * dz, 0.03 * sw, 0.09 * sw, 0.02 * sw * dz, 0, 0, s * H);
    k.geo('trim', WING(), x + s * 0.04 * sw, 0.1 * sw, 0.01 * sw * dz, 0.34 * sw, 0.42 * sw, 0.02 * sw * dz, s > 0 ? 0 : PI);
    for (const dy of [-0.34, 0.12]) k.box('trim', x - s * 0.12 * sw, dy * sw, 0.03 * sw * dz, 0.2 * sw, 0.05 * sw, 0.04 * sw * dz, 0, 0, s * 0.5); }
  if (o.motto !== false) { for (let i = -2; i <= 2; i++) d.box('trim', i * 0.2 * sw, -0.78 * sw + Math.abs(i) * 0.05 * sw, 0.02 * sw * dz, 0.22 * sw, 0.1 * sw, 0.015 * sw * dz, 0, 0, -i * 0.12);
    f.box('gold', 0, -0.76 * sw, 0.03 * sw * dz, 0.7 * sw, 0.012 * sw, 0.004 * sw); }
}
export const PROP = {
  // 家徽：默认为立面浮雕（面朝 +z，底在原点）；o.inlay 为地面镶嵌圆盘（直径 w）
  crest(k, o = {}) {
    k = wk(k); const w = o.w || 1.0;
    if (o.inlay) {
      const R0 = w / 2;
      k.cyl('brass', 0, 0.002, 0, R0, 0.004, 64); k.cyl('marbleGold:#E0B860', 0, 0.004, 0, R0 - 0.08, 0.003, 64);
      k.geo('marbleBlack', G.cyl(64, 1, true), 0, 0.0055, 0, R0 * 0.8, 0.002, R0 * 0.8); k.cyl('marbleBlack', 0, 0.005, 0, R0 * 0.8, 0.0012, 64); k.cyl('marbleGold:#E0B860', 0, 0.0055, 0, R0 * 0.76, 0.0012, 64);
      k.geo('brass', G.tor(PI * 2, 3, 64, 0.06), 0, 0.007, 0, R0 * 0.78, 0.005, R0 * 0.78);
      for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; k.box('brass', Math.sin(a) * R0 * 0.88, 0.0065, Math.cos(a) * R0 * 0.88, 0.05, 0.002, R0 * 0.12, a); }
      crestFigure(loc(k, 0, 0.12 * w, 0, 0.006, -H), w * 0.34, { depth: 0.12, supporters: true });
      return;
    }
    const sup = o.supporters !== false, sw = sup ? w * 0.42 : w * 0.8; crestFigure(loc(k, 0, 0, 0, sw * 0.9), sw, { supporters: sup, motto: o.motto });
  },
  // 长箱钟（胡桃木，2.6 m，表盘星图）；背靠 −z
  longcaseClock(k, o = {}) {
    k = wk(k); const f = FINE(k); const h = o.h || 2.6, s = h / 2.6, W = 'walnut';
    k.bx(W, 0, 0, 0, 0.6, 0.08, 0.34); k.bx(W, 0, 0.08, 0, 0.56, 0.3, 0.3); k.bx(W, 0, 0.38, 0, 0.6, 0.05, 0.33);
    k.bx(W, 0, 0.43, 0, 0.46, 1.12 * s, 0.26); f.box(W, 0, 0.5 + 0.5 * s, 0.132, 0.36, 0.95 * s, 0.01);
    vdisc(k, 'glass', 0, 0.5 + 0.35 * s, 0.136, 0.07, 0.07, 0.006, 16); vdisc(k, 'brass', 0, 0.5 + 0.35 * s, 0.13, 0.055, 0.055, 0.004, 16); rod(f, 'brass', [0, 0.5 + 0.36 * s, 0.128], [0, 0.5 + 0.95 * s, 0.128], 0.004, 4);
    const yh = 0.43 + 1.12 * s;
    k.bx(W, 0, yh, 0, 0.56, 0.06, 0.32); k.bx(W, 0, yh + 0.06, 0, 0.54, 0.56 * s, 0.32);
    k.geo('art', G.vplane(ART(6, 0.02)), 0, yh + 0.06 + 0.28 * s, 0.163, 0.36 * s, 0.36 * s, 1);
    k.geo('brass', G.tor(PI * 2, 4, 32, 0.08), 0, yh + 0.06 + 0.28 * s, 0.163, 0.2 * s, 0.2 * s, 0.2 * s, 0, H);
    rod(k, 'gold', [0, yh + 0.06 + 0.28 * s, 0.168], [0.05, yh + 0.06 + 0.38 * s, 0.168], 0.004, 4); rod(k, 'gold', [0, yh + 0.06 + 0.28 * s, 0.17], [-0.12, yh + 0.06 + 0.27 * s, 0.17], 0.003, 4);
    for (const sx of [-1, 1]) { k.cyl('ormolu', sx * 0.24, yh + 0.06, 0.15, 0.02, 0.54 * s, 8); f.box('ormolu', sx * 0.24, yh + 0.06 + 0.55 * s, 0.15, 0.05, 0.03, 0.05); }
    const yt = yh + 0.06 + 0.56 * s; k.bx(W, 0, yt, 0, 0.62, 0.06, 0.36); k.geo(W, G.seg(), 0, yt + 0.06, 0, 0.3, 0.2, 0.34);
    for (const x of [-0.26, 0, 0.26]) { k.cyl('ormolu', x, yt + (x ? 0.08 : 0.24), 0.02, 0.035, 0.05, 8); k.sph('ormolu', x, yt + (x ? 0.16 : 0.33), 0.02, 0.04, 0.05, 0.04, 8, 6); k.geo('ormolu', G.cone(6), x, yt + (x ? 0.24 : 0.42), 0.02, 0.018, 0.1, 0.018); }
    k.blob(0, 0, 0.9, 0.7, 0.03);
  },
  // 胸像台座（空座只留铜牌）
  bust(k, o = {}) {
    k = wk(k); const f = FINE(k);
    k.bx('marbleW', 0, 0, 0, 0.52, 0.1, 0.52); k.bx('marbleW', 0, 0.1, 0, 0.46, 0.06, 0.46);
    k.bx('scagliola', 0, 0.16, 0, 0.36, 0.92, 0.36); k.bx('marbleW', 0, 1.08, 0, 0.44, 0.05, 0.44); k.bx('marbleW', 0, 1.13, 0, 0.48, 0.04, 0.48);
    f.box('brass', 0, 0.9, 0.182, 0.2, 0.07, 0.004);
    if (o.empty) { f.box('ormolu', 0, 1.17, 0, 0.3, 0.004, 0.3); return; }
    const y = 1.17, m = 'marbleW';
    k.geo(m, G.lathe('socle', [[0, 0], [0.1, 0], [0.1, 0.03], [0.06, 0.06], [0.05, 0.12], [0, 0.12]], 12), 0, y, 0);
    k.sph(m, 0, y + 0.24, 0, 0.23, 0.14, 0.13, 10, 7); k.sph(m, 0, y + 0.22, 0.02, 0.17, 0.12, 0.12, 8, 6);
    k.cyl(m, 0, y + 0.3, 0, 0.055, 0.12, 8); k.sph(m, 0, y + 0.5, 0.01, 0.085, 0.105, 0.095, 10, 8);
    k.sph(m, 0, y + 0.55, -0.015, 0.09, 0.08, 0.09, 12, 8); k.geo(m, G.cone(5), 0, y + 0.49, 0.1, 0.018, 0.04, 0.02, 0, 0.3);
    if ((o.seed || 0) % 2) for (const sx of [-1, 1]) k.sph(m, sx * 0.08, y + 0.47, -0.02, 0.035, 0.07, 0.05, 8, 6);
    f.geo(m, G.tor(PI, 4, 10, 0.25), 0.1, y + 0.3, 0.1, 0.12, 0.12, 0.12, 0, -H, 0.4);
  },
  // 肖像画框：局部原点 = 画框中心、墙面 z=0；o.empty → 金框衬深红丝
  portraitFrame(k, o = {}) {
    k = wk(k); const f = FINE(k); const w = o.w || 0.95, h = o.h || 1.2, b = 0.11;
    for (const [x, y, ww, hh] of [[0, h / 2 - b / 2, w, b], [0, -h / 2 + b / 2, w, b], [-w / 2 + b / 2, 0, b, h - 2 * b], [w / 2 - b / 2, 0, b, h - 2 * b]]) sl(k, 'gold', x, y, 0.04, ww, hh, 0.07, 0.02);
    for (const [x, y, ww, hh] of [[0, h / 2 - b - 0.01, w - 2 * b, 0.02], [0, -h / 2 + b + 0.01, w - 2 * b, 0.02], [-w / 2 + b + 0.01, 0, 0.02, h - 2 * b], [w / 2 - b - 0.01, 0, 0.02, h - 2 * b]]) k.box('ormolu', x, y, 0.03, ww, hh, 0.02);
    if (o.empty) { k.box('velvet:' + COL.crimson, 0, 0, 0.012, w - 2 * b, h - 2 * b, 0.01); f.box('gold', 0, -h / 2 + b + 0.06, 0.02, 0.18, 0.04, 0.004); }
    else k.geo('art', G.vplane(ART(o.cell ?? 0)), 0, 0, 0.018, w - 2 * b, h - 2 * b, 1);
    k.geo('gold', G.seg(), 0, h / 2, 0.04, 0.2, 0.12, 0.06); f.sph('gold', 0, h / 2 + 0.1, 0.05, 0.05, 0.05, 0.03, 8, 6);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) f.sph('gold', sx * (w / 2 - 0.05), sy * (h / 2 - 0.05), 0.08, 0.04, 0.04, 0.02, 6, 4);
    if (o.lamp !== false) { k.cyl('brass', 0, h / 2 + 0.02, 0.04, 0.012, 0.18, 6); rod(k, 'brass', [0, h / 2 + 0.2, 0.04], [0, h / 2 + 0.24, 0.2], 0.008, 5); k.geo('brass', G.cyl(10, 1, true), 0, h / 2 + 0.23, 0.22, 0.035, w * 0.6, 0.035, 0, 0, H); f.box('glow', 0, h / 2 + 0.205, 0.235, w * 0.55, 0.01, 0.02); }
  },
  // 黄铜笼式电梯：局部原点 = 井道中心地面；o.w/o.d 井道尺寸，o.h 层高，o.car 轿厢在本层，门在 +z
  liftCage(k, o = {}) {
    k = wk(k); const f = FINE(k); const W = o.w || 3, D = o.d || 4, h = o.h || 4.5, lo = LO(), hh = h - 0.15;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.bx('brass', sx * W / 2, 0, sz * D / 2, 0.07, hh, 0.07);
    for (const y of [0.05, 1.0, hh - 0.35, hh - 0.08]) { for (const sz of [-1, 1]) k.bx('brass', 0, y, sz * D / 2, W, 0.05, 0.05); for (const sx of [-1, 1]) k.bx('brass', sx * W / 2, y, 0, 0.05, 0.05, D); }
    const step = lo ? 0.25 : 0.14;
    for (const sx of [-1, 1]) for (let z = -D / 2 + step; z < D / 2 - 0.05; z += step) k.bx('brass', sx * W / 2, 0.08, z, 0.018, hh - 0.2, 0.018);
    for (let x = -W / 2 + step; x < W / 2 - 0.05; x += step) k.bx('brass', x, 0.08, -D / 2, 0.018, hh - 0.2, 0.018);
    // 门（折叠铜栅）
    const dw = 1.2; for (const sx of [-1, 1]) { k.bx('brass', sx * dw / 2, 0, D / 2, 0.06, 2.3, 0.06); }
    k.bx('brass', 0, 2.3, D / 2, dw + 0.1, 0.08, 0.06);
    for (let x = -W / 2 + step; x < W / 2 - 0.05; x += step) if (Math.abs(x) > dw / 2) k.bx('brass', x, 0.08, D / 2, 0.018, hh - 0.2, 0.018);
    for (let i = 0; i < 8; i++) { const x = -dw / 2 + 0.08 + i * (dw - 0.16) / 7; rod(k, 'brass', [x - 0.07, 0.1, D / 2 + 0.02], [x + 0.07, 2.2, D / 2 + 0.02], 0.007, 4); rod(f, 'brass', [x + 0.07, 0.1, D / 2 + 0.03], [x - 0.07, 2.2, D / 2 + 0.03], 0.007, 4); }
    // 机械表盘
    const dk = loc(k, 0, D / 2 + 0.05, 0, 2.62); dk.geo('brass', G.cyl(24, 1, false), 0, 0.02, 0.0, 0.34, 0.03, 0.34, 0, H);
    dk.geo('porcelain', G.cyl(24), 0, 0.02, 0.018, 0.3, 0.004, 0.3, 0, H); dk.bx('brass', 0, -0.32, 0.01, 0.7, 0.34, 0.03);
    for (let i = 0; i < 5; i++) { const a = -H + i * PI / 4 - PI / 2 + H; f.box('ebony', Math.sin(a - H) * 0.24, 0.02 + Math.cos(a - H) * 0.24, 0.022, 0.012, 0.05, 0.003, 0, 0, -(a - H)); }
    const pa = (o.dial ?? 0) * PI / 4 - H; rod(dk, 'gold', [0, 0.02, 0.026], [Math.sin(pa) * 0.26, 0.02 + Math.cos(pa) * 0.26, 0.026], 0.008, 4); dk.sph('ormolu', 0, 0.02, 0.028, 0.03, 0.03, 0.012, 8, 6);
    dk.geo('gold', G.seg(), 0, 0.36, 0.0, 0.2, 0.12, 0.04);
    if (o.car) {
      const cw = W - 0.25, cd = D - 0.25, ch = 2.45;
      k.bx('rugAubCrimson', 0, 0.02, 0, cw, 0.01, cd);
      for (const sx of [-1, 1]) sl(k, 'mahogany', sx * (cw / 2 - 0.03), ch / 2 + 0.03, 0, 0.05, ch, cd, 0.01); sl(k, 'mahogany', 0, ch / 2 + 0.03, -cd / 2 + 0.03, cw, ch, 0.05, 0.01);
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const z = -cd / 2 + cd * (i + 0.5) / 3; for (const y of [0.5, 1.5]) { f.box('ormolu', sx * (cw / 2 - 0.058), y, z, 0.006, 0.8, 0.012); } }
      k.bx('mahogany', 0, ch + 0.03, 0, cw, 0.08, cd); k.cyl('glow', 0, ch - 0.02, 0, 0.18, 0.04, 12); k.geo('ormolu', G.tor(PI * 2, 4, 20, 0.1), 0, ch - 0.01, 0, 0.2, 0.2, 0.2);
      bench(loc(k, 0, -cd / 2 + 0.35), cw - 0.6, 'velvet:' + COL.crimson); mirrorRect(loc(k, 0, -cd / 2 + 0.06, 0, 1.55), 0.8, 0.6, 'gold');
      k.bx('brass', cw / 2 - 0.1, 1.0, cd / 2 - 0.3, 0.1, 0.3, 0.04);
    }
  },
  // 初代书桌（3 × 1.5 m 伙伴桌，右手边墨水渍）；访客侧在 +z，坐者在 −z
  foundersDesk(k, o = {}) {
    k = wk(k); const f = FINE(k); const W = 'mahogany';
    for (const sx of [-1, 1]) { k.bx(W, sx * 1.02, 0, 0, 0.9, 0.08, 1.4); k.bx(W, sx * 1.02, 0.08, 0, 0.86, 0.62, 1.36);
      for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) { f.box(W, sx * 1.02, 0.2 + i * 0.19, sz * 0.683, 0.76, 0.16, 0.008); k.box('brass', sx * 1.02, 0.2 + i * 0.19, sz * 0.69, 0.1, 0.015, 0.015); } }
    k.bx(W, 0, 0.62, 0, 1.16, 0.08, 1.36); sl(k, W, 0, 0.73, 0, 3.0, 0.05, 1.5, 0.015);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.box('ormolu', sx * 1.48, 0.73, sz * 0.73, 0.06, 0.055, 0.06); f.sph('ormolu', sx * 1.02, 0.4, sz * 0.7, 0.06, 0.08, 0.01, 8, 6); }
    k.bx('leatherG', 0, 0.756, 0, 2.7, 0.003, 1.2); f.box('gold', 0, 0.7565, 0.595, 2.7, 0.0015, 0.008); f.box('gold', 0, 0.7565, -0.595, 2.7, 0.0015, 0.008);
    k.geo('enamel:#120f0c', G.cyl(12), -0.92, 0.7585, -0.38, 0.1, 0.0015, 0.065, 0.4); k.geo('enamel:#120f0c', G.cyl(8), -0.8, 0.7585, -0.33, 0.035, 0.0015, 0.025);
    k.cyl('brass', -0.55, 0.756, -0.45, 0.08, 0.02, 12); k.cyl('crystal', -0.58, 0.776, -0.45, 0.03, 0.05, 8); rod(k, 'porcelain', [-0.5, 0.79, -0.44], [-0.38, 0.95, -0.52], 0.004, 4);
    bankerLamp(loc(k, 0, -0.5, 0, 0.756), 2);
    { const t = loc(k, 1.05, -0.42, 0.2, 0.756); t.bx('walnut', 0, 0, 0, 0.42, 0.26, 0.3); t.box('brass', 0, 0.16, 0.152, 0.34, 0.18, 0.01); t.box('screen', 0, 0.16, 0.158, 0.28, 0.13, 0.004); t.bx('brass', 0, 0, 0.18, 0.4, 0.02, 0.1); }
    k.bx('books', 0.5, 0.756, 0.1, 0.32, 0.08, 0.24, 0.15); k.bx('linen', 0, 0.757, -0.15, 0.4, 0.004, 0.3);
    // 高背酒红皮转椅
    { const c = loc(k, 0, -1.05); c.cyl('walnut', 0, 0, 0, 0.3, 0.05, 5); c.cyl('brass', 0, 0.05, 0, 0.035, 0.36, 8); sl(c, 'enamel:#5a1717', 0, 0.48, 0, 0.62, 0.12, 0.58, 0.05); sl(c, 'enamel:#5a1717', 0, 0.95, -0.3, 0.62, 0.86, 0.14, 0.06, 0, -0.08); for (const sx of [-1, 1]) sl(c, 'enamel:#5a1717', sx * 0.32, 0.64, 0, 0.1, 0.18, 0.5, 0.04); }
    for (const sx of [-1, 1]) armchair(loc(k, sx * 0.6, 1.2, PI + sx * 0.15), 'enamel:#5a1717');
    k.blob(0, 0, 3.6, 2.2, 0.03);
  },
  // 主位家徽椅：更高的椅背，背板雕家徽
  crestChair(k) {
    k = wk(k); legs(k, 0.56, 0.52, 0.42, 0.028, 'mahogany', 0.04, 'sq'); k.bx('mahogany', 0, 0.38, 0, 0.6, 0.06, 0.54);
    sl(k, 'enamel:#6e1f1b', 0, 0.48, 0.01, 0.58, 0.08, 0.52, 0.03);
    for (const sx of [-1, 1]) { k.box('mahogany', sx * 0.26, 0.9, -0.25, 0.045, 1.0, 0.045, 0, -0.06); k.sph('ormolu', sx * 0.26, 1.44, -0.28, 0.035, 0.045, 0.035, 8, 6); sl(k, 'mahogany', sx * 0.3, 0.7, 0.0, 0.05, 0.05, 0.5, 0.02); k.cyl('mahogany', sx * 0.3, 0.44, 0.22, 0.02, 0.26, 6); }
    sl(k, 'mahogany', 0, 1.36, -0.285, 0.58, 0.1, 0.05, 0.02, 0, -0.06); k.geo('mahogany', G.seg(), 0, 1.41, -0.285, 0.29, 0.1, 0.05);
    k.box('mahogany', 0, 0.98, -0.268, 0.44, 0.62, 0.02, 0, -0.06);
    PROP.crest(loc(k, 0, -0.25, 0, 0.72, -0.06), { w: 0.38, supporters: false });
    k.blob(0, 0, 0.9, 0.9, 0.03);
  },
  // 管风琴（贴金外壳）：背靠 −z，面朝 +z
  organ(k, o = {}) {
    k = wk(k); const f = FINE(k); const h = o.h || 9, w = o.w || 9, lo = LO();
    k.bx('walnut', 0, 0, 0, w, 2.4, 1.6); k.bx('gold', 0, 2.4, 0.02, w + 0.2, 0.15, 1.7); f.box('gold', 0, 1.2, 0.81, w - 0.2, 0.04, 0.01);
    for (let i = 0; i < 6; i++) panelDoor(f, -w / 2 + w * (i + 0.5) / 6, 0.2, 0.805, w / 6 - 0.2, 1.8, 'gold');
    // 演奏台
    const c = loc(k, 0, 1.25); c.bx('walnut', 0, 0, 0, 2.2, 0.75, 0.9); for (let m = 0; m < 3; m++) { c.bx('porcelain', 0, 0.78 + m * 0.1, 0.25 - m * 0.08, 1.5, 0.02, 0.16); if (!lo) for (let i = 0; i < 20; i++) f.box('ebony', -0.7 + i * 0.075, 1.25 + 0.8 + m * 0.1, 0.23 - m * 0.08, 0.025, 0.015, 0.09); }
    c.bx('walnut', 0, 0.75, -0.3, 2.2, 0.6, 0.3); if (!lo) for (let i = 0; i < 16; i++) for (const sx of [-1, 1]) f.cyl('porcelain', sx * (0.85 + (i % 2) * 0.1), 1.25 + 0.9 + (i >> 1) * 0.06, -0.15 + 1.25, 0.015, 0.03, 6);
    bench(loc(c, 0, 0.9), 1.6, 'enamel:#2a1a12', 'walnut');
    // 管塔：中央圆塔、两侧平面、两端圆塔
    const tower = (x, tw, th, n, round) => { const y0 = 2.55;
      k.bx('gold', x, y0, -0.1, tw + 0.1, 0.12, 1.1);
      for (let i = 0; i < n; i++) { const u = n === 1 ? 0 : i / (n - 1) - 0.5, px = x + u * tw, pz = round ? 0.25 - Math.pow(u * 2, 2) * 0.35 : 0.2, L = th * (round ? 1 - Math.abs(u) * 0.25 : 0.75 + Math.abs(u) * 0.3), r = tw / n * 0.42;
        k.geo('gold', G.cone(6), px, y0 + 0.12 + 0.2, pz, r, 0.4, r, 0, PI); k.geo('nickel', G.cyl(lo ? 5 : 8, 1, true), px, y0 + 0.5 + (L - 0.5) / 2, pz, r, L - 0.5, r); f.box('ebony', px, y0 + 0.75, pz + r * 0.95, r * 0.8, 0.12, 0.004); }
      k.bx('gold', x, y0 + th + 0.1, -0.1, tw + 0.2, 0.18, 1.1); k.geo('gold', G.seg(), x, y0 + th + 0.28, -0.1, tw / 2 + 0.1, round ? 0.6 : 0.3, 1.1);
      k.sph('gold', x, y0 + th + (round ? 0.95 : 0.65), -0.1, 0.15, 0.2, 0.15, 10, 8);
      k.bx('walnut', x, y0 + 0.12, -0.5, tw + 0.1, th, 0.3); };
    tower(0, 2.0, h - 3.6, lo ? 7 : 11, true); for (const s of [-1, 1]) { tower(s * 2.1, 1.8, h - 4.8, lo ? 6 : 10, false); tower(s * 3.7, 1.3, h - 4.0, lo ? 5 : 7, true); }
    for (const s of [-1, 1]) { k.bx('gold', s * (w / 2 - 0.1), 2.55, -0.2, 0.2, h - 3.6, 0.9); f.box('gold', s * (w / 2 - 0.1), 3.5, 0.26, 0.08, h - 5.6, 0.02); }
    k.blob(0, 0, w + 1, 2.4, 0.03);
  },
  // 浑天仪：底座 + 子午圈、地平圈、赤道圈、黄道圈、极轴
  armillary(k, o = {}) {
    k = wk(k); const r = o.r || 1.0, y = o.base === false ? r : r * 1.15;
    if (o.base !== false) { k.geo('ormolu', G.lathe('armBase', [[0, 0], [0.3, 0], [0.3, 0.06], [0.1, 0.15], [0.06, 0.8], [0.14, 0.9], [0, 0.9]], 12), 0, 0, 0, r, r * 0.3 / 0.9 * 3, r); }
    k.geo('gold', G.tor(PI * 2, 6, 48, 0.05), 0, y, 0, r, r, r, 0, H);
    k.geo('gold', G.tor(PI * 2, 6, 48, 0.05), 0, y, 0, r * 0.98, r * 0.98, r * 0.98);
    const eq = loc(k, 0, 0, 0, y, 0.41); eq.geo('gold', G.tor(PI * 2, 6, 48, 0.06), 0, 0, 0, r * 0.9, r * 0.9, r * 0.9);
    const ec = loc(eq, 0, 0, 0, 0, 0.41); ec.geo('gold', G.tor(PI * 2, 6, 48, 0.1), 0, 0, 0, r * 0.88, r * 0.9, r * 0.88);
    const ax = loc(k, 0, 0, 0, y, 0.41); rod(ax, 'gold', [0, -r * 1.1, 0], [0, r * 1.1, 0], r * 0.02, 6); ax.sph('enamel:' + COL.crestBlue, 0, 0, 0, r * 0.14, r * 0.14, r * 0.14, 14, 10);
    k.sph('gold', 0, y + r * 1.05, 0, r * 0.06, r * 0.06, r * 0.06, 8, 6);
  },
  // 初代木船（清漆桃花心木，桨两支）：沿局部 x
  boat(k, o = {}) {
    k = wk(k); const len = o.len || 5, B = len * 0.13, D = len * 0.08;
    const hull = (inner) => G.custom(`hull${len}${inner}`, () => { const nu = 18, nv = 10, pos = [], idx = [];
      for (let i = 0; i <= nu; i++) { const u = i / nu, t = 2 * u - 1, b = B * Math.pow(Math.max(0, 1 - t * t), 0.55) * (inner ? 0.94 : 1), d = D * (1 - 0.3 * t * t) * (inner ? 0.9 : 1), sh = 0.12 * len * 0.08 * t * t * 4;
        for (let j = 0; j <= nv; j++) { const a = j / nv * PI; pos.push(t * len / 2, -Math.sin(a) * d + sh, Math.cos(a) * b); } }
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; if (inner) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; });
    k.geo('mahogany', hull(false), 0, D, 0); k.geo('walnut', hull(true), 0, D + 0.01, 0);
    for (const x of [-0.25, 0.1, 0.4]) k.bx('walnut', x * len * 0.6, D - 0.08, 0, 0.22, 0.03, B * 1.7);
    for (const s of [-1, 1]) { rod(k, 'walnut', [-len * 0.3, D + 0.02, s * B * 0.7], [len * 0.35, D + 0.04, s * B * 0.72], 0.025, 5); rod(k, 'walnut', [-len * 0.05, D + 0.06, s * B * 0.95], [len * 0.25, D + 0.06, s * B * 1.9], 0.02, 5); k.box('walnut', len * 0.29, D + 0.06, s * B * 2.1, 0.5, 0.012, 0.14, 0.4 * s); }
    FINE(k).box('gold', 0, D - 0.02, B * 0.98, len * 0.4, 0.03, 0.004);
  },
};

/* ================================================================
 * 墙面：踢脚、护墙压条、墙布 / 镶板皮、檐口带、门套、窗帘（WP-A 在 buildCut 里对每个非 minor 房间调用）
 * ================================================================ */
const SIDES = ['-z', '+z', '-x', '+x'];
function sideFrame(rect, side) {
  const [x0, x1, z0, z1] = rect;
  if (side === '-z') return { ox: x0, oz: z0, ry: 0, L: x1 - x0, t: (a) => a - x0 };
  if (side === '+z') return { ox: x1, oz: z1, ry: PI, L: x1 - x0, t: (a) => x1 - a };
  if (side === '-x') return { ox: x0, oz: z1, ry: H, L: z1 - z0, t: (a) => z1 - a };
  return { ox: x1, oz: z0, ry: -H, L: z1 - z0, t: (a) => a - z0 };
}
const WAINS = { damaskRed: 'panelWalnut', silkBlue: 'paintIvory', silkGreen: 'paintIvory', silkRose: 'paintIvory', silkIvory: 'paintIvory', silkDuck: 'paintIvory', chinoiserie: 'paintIvory', plasterYellow: 'paintIvory', plasterStone: 'plasterStone' };
const DRAPE = { '107': COL.champ, '113': COL.azure, '119': COL.crimson, '105': COL.crimson, '212': '#23402F', '202': COL.paleGold, '206': COL.ivory, '315': COL.ivory, '312': COL.azure, '301': COL.crimson, '219': COL.azure, '220': COL.rose, '222': COL.empire, '317': COL.pearl, '120': COL.empire, 'D1': COL.crimson, 'C1': '#23402F' };
const drapeCol = (room) => DRAPE[room.id] || { damaskRed: COL.crimson, silkBlue: COL.azure, silkGreen: COL.empire, silkRose: COL.rose, silkIvory: COL.ivory, silkDuck: COL.champ, panelWalnut: '#23402F', panelMahog: COL.crimson }[room.wall] || COL.champ;
export function dressWalls(b, room, o = {}) {
  if (!room || room.minor || room.void || room.skipFloor) return;
  try {
    b = wrapB(b);
    const F = FLOORS[room.floor] || { y: 0, h: 4.5 };
    const y = o.y ?? F.y, h = o.h ?? F.h, rect = o.rect || [room.r[0] + 0.15, room.r[1] - 0.15, room.r[2] + 0.15, room.r[3] - 0.15];
    const rank = room.rank || 2, wall = room.wall || 'paintIvory', tall = new Set(o.tallSides || []), inTall = new Set(room.tall || []);
    const ops = o.openings || [], top = h - 0.3, lo = LO();
    const isPanel = wall.startsWith('panel'), isBath = wall === 'marbleGold' || wall === 'tileWhite';
    const skirtM = isPanel ? (wall === 'panelMahog' ? 'mahogany' : 'walnut') : isBath ? 'marbleBlack' : 'trim';
    const sk = rank === 1 ? 0.22 : 0.18, cb = rank === 1 ? 0.25 : 0.12;
    for (const side of SIDES) {
      const fr = sideFrame(rect, side); if (fr.L < 0.3) continue;
      const km = new Kit(b, fr.ox, y, fr.oz, fr.ry), kh = tall.has(side) ? SUB(km, 'hi' + side) : null, kf = FINE(km);
      const ext = tall.has(side) && !inTall.has(side);
      // 开口 → 沿墙区间
      const gaps = ops.filter((p) => p.side === side && p.kind !== 'blind' && p.kind !== 'secret').map((p) => { let a = fr.t(p.a), c = fr.t(p.b); if (a > c) [a, c] = [c, a]; return { a: Math.max(0, a), b: Math.min(fr.L, c), top: p.top > h + 0.01 ? p.top - y : (p.top || 2.4), bot: p.bot || 0, kind: p.kind || 'window' }; }).filter((g) => g.b > g.a + 0.05).sort((p, q) => p.a - q.a);
      const segs = []; let t0 = 0; for (const g of gaps) { if (g.a > t0 + 0.02) segs.push([t0, g.a]); t0 = Math.max(t0, g.b); } if (fr.L > t0 + 0.02) segs.push([t0, fr.L]);
      const band = (kk, key, a, c, y0, y1, d, z = 0) => { if (c - a < 0.01 || y1 - y0 < 0.005) return; kk.box(key, (a + c) / 2, (y0 + y1) / 2, z + d / 2, c - a, y1 - y0, d); };
      for (const [a, c] of segs) {
        band(km, skirtM, a, c, 0, sk, 0.025);
        if (rank === 3) { if (isBath) { band(km, wall, a, c, sk, 1.2, 0.01); if (kh) band(kh, wall, a, c, 1.2, 1.5, 0.01); } continue; }
        if (!lo) band(kf, skirtM, a, c, sk, sk + 0.02, 0.03);
        // 墙裙 / 护墙板
        if (isBath) {
          band(km, wall, a, c, sk, 1.2, 0.012); if (kh) { band(kh, wall, a, c, 1.2, wall === 'marbleGold' ? 2.4 : 1.5, 0.012); band(kh, 'paintIvory', a, c, wall === 'marbleGold' ? 2.4 : 1.5, top - cb, 0.008); band(kh, 'marbleBlack', a, c, wall === 'marbleGold' ? 2.4 : 1.5, (wall === 'marbleGold' ? 2.4 : 1.5) + 0.05, 0.02); }
        } else {
          const wains = isPanel ? wall : (WAINS[wall] || 'paintIvory');
          band(km, wains, a, c, sk, 0.9, 0.012);
          band(km, isPanel ? skirtM : 'trim', a, c, 0.88, 0.94, 0.035);
          band(km, wall, a, c, 0.94, 1.2, 0.01);
          if (kh) band(kh, wall, a, c, 1.2, top - cb, 0.01);
          // 墙裙镶板线（fine）
          if (!lo && c - a > 0.8) { const n = Math.max(1, Math.round((c - a) / 1.2)), pw = (c - a) / n; for (let i = 0; i < n; i++) { const u0 = a + i * pw + 0.12, u1 = a + (i + 1) * pw - 0.12; for (const yy of [sk + 0.1, 0.8]) band(kf, isPanel ? skirtM : 'trim', u0, u1, yy, yy + 0.018, 0.02, 0.012); for (const u of [u0, u1 - 0.018]) band(kf, isPanel ? skirtM : 'trim', u, u + 0.018, sk + 0.1, 0.818, 0.02, 0.012); } }
          // 高墙段：ormolu 细线分块（rank 1）
          if (kh && rank === 1 && c - a > 1.2) { const n = Math.max(1, Math.round((c - a) / 2.4)), pw = (c - a) / n, yb = 1.45, yt = top - cb - 0.25;
            for (let i = 0; i < n; i++) { const u0 = a + i * pw + 0.18, u1 = a + (i + 1) * pw - 0.18; band(kh, 'ormolu', u0, u1, yb, yb + 0.02, 0.018, 0.01); band(kh, 'ormolu', u0, u1, yt - 0.02, yt, 0.018, 0.01); band(kh, 'ormolu', u0, u0 + 0.02, yb, yt, 0.018, 0.01); band(kh, 'ormolu', u1 - 0.02, u1, yb, yt, 0.018, 0.01); } }
        }
        // 檐口带
        if (kh) { band(kh, 'trim', a - 0.02, c + 0.02, top - cb, top, 0.04); band(kh, 'trim', a - 0.02, c + 0.02, top - cb * 0.45, top, 0.09); if (rank === 1) { band(kh, 'trim', a - 0.02, c + 0.02, top - 0.07, top, 0.15); band(kh, 'ormolu', a, c, top - cb - 0.015, top - cb, 0.05); } }
      }
      // 门套 / 窗套；外墙窗挂窗帘
      for (const g of gaps) {
        const w = g.b - g.a, cx = (g.a + g.b) / 2, gt = Math.min(g.top, top - 0.05);
        if (g.kind === 'window' && g.bot > 0.3) { band(km, skirtM, g.a, g.b, 0, sk, 0.025); if (rank < 3 && !isBath) { const wn = isPanel ? wall : (WAINS[wall] || 'paintIvory'); band(km, wn, g.a, g.b, sk, Math.min(g.bot, 0.9), 0.012); if (g.bot > 0.95) { band(km, isPanel ? skirtM : 'trim', g.a, g.b, 0.88, 0.94, 0.035); band(km, wall, g.a, g.b, 0.94, Math.min(1.2, g.bot), 0.01); } } else if (isBath) band(km, wall, g.a, g.b, sk, Math.min(1.2, g.bot), 0.012); band(km, 'marbleW', g.a - 0.05, g.b + 0.05, g.bot - 0.04, g.bot, 0.06); }
        if (!ext) {
          for (const u of [g.a - 0.07, g.b + 0.07]) band(km, 'trim', u - 0.07, u + 0.07, 0, Math.min(1.2, gt + 0.12), 0.04);
          if (kh) { for (const u of [g.a - 0.07, g.b + 0.07]) band(kh, 'trim', u - 0.07, u + 0.07, 1.2, gt + 0.12, 0.04); band(kh, 'trim', g.a - 0.14, g.b + 0.14, gt, gt + 0.14, 0.04);
            if (rank === 1) { band(kh, 'trim', g.a - 0.2, g.b + 0.2, gt + 0.14, gt + 0.4, 0.03); band(kh, 'trim', g.a - 0.28, g.b + 0.28, gt + 0.4, gt + 0.5, 0.1); band(kh, 'ormolu', g.a - 0.1, g.b + 0.1, gt + 0.26, gt + 0.28, 0.034); } }
        } else if (kh) {
          for (const u of [g.a - 0.06, g.b + 0.06]) band(kh, 'trim', u - 0.06, u + 0.06, 1.2, gt + 0.1, 0.03); band(kh, 'trim', g.a - 0.12, g.b + 0.12, gt, gt + 0.12, 0.03);
          if (rank < 3 && g.kind === 'window' && w < 4.2 && w > 0.6) { const dk = loc(kh, cx, 0.04); if (isBath) romanBlind(dk, w, gt + 0.05); else drapes(dk, w, gt + 0.12, { col: drapeCol(room), velvet: rank === 1 && !['silkIvory', 'silkDuck', 'chinoiserie'].includes(wall) }); }
        }
      }
      // 远墙壁灯（rank 1：窗间墙中央）
      if (kh && rank === 1 && !isBath) for (const [a, c] of segs) if (c - a > 1.6 && c - a < 6) sconce(loc(kh, (a + c) / 2, 0.02, 0, 1.85), { arms: 2 });
    }
  } catch (e) { console.warn('dressWalls', room && room.id, e); }
}

/* ================================================================
 * 房间布置
 * ================================================================ */
function isExt(room, side) {
  const [x0, x1, z0, z1] = room.r, e = 0.35, cx = (x0 + x1) / 2, fl = room.floor;
  if (Math.abs(cx) > 70) return true;
  if (x0 >= -20 - e && x1 <= 20 + e) {
    if (side === '-z') return z0 <= -22 + e; if (side === '+z') return z1 >= 22 - e;
    const beyond = fl >= 3 || z0 >= 16 - e || z1 <= -16 + e;
    if (side === '-x') return x0 <= -20 + e && beyond; return x1 >= 20 - e && beyond;
  }
  if (side === '-z') return z0 <= -16 + e; if (side === '+z') return z1 >= 16 - e;
  if (side === '-x') return x0 <= -54 + e; return x1 >= 54 - e;
}
// 墙半厚（与 building.js 的 wallT 一致：外墙及主楼 / 两翼交界 0.9，主楼承重墙与翼楼走廊墙 0.6，其余 0.3）
function wallHalf(room, side) {
  if (isExt(room, side)) return 0.45;
  const [x0, x1, z0, z1] = room.r, e = 0.05, fl = room.floor, main = x0 >= -20 - e && x1 <= 20 + e;
  const at = side === '-z' ? z0 : side === '+z' ? z1 : side === '-x' ? x0 : x1, a = Math.abs(at), xs = side[1] === 'x';
  if (xs && Math.abs(a - 20) < e) return 0.45;
  if (main) { if (xs && Math.abs(a - 12) < e) return 0.3; if (!xs && (Math.abs(at - 2) < e || Math.abs(at + 6) < e)) return 0.3; if (fl === 3 && ((xs && Math.abs(a - 8) < e) || (!xs && Math.abs(at - 10) < e))) return 0.3; }
  else if (!xs && Math.abs(a - 2) < e) return 0.3;
  return 0.15;
}
const HER = () => PLAN.HERITAGE || [];
const her = (kind, room) => HER().find((h) => h.kind === kind && h.room === room);
const vecSide = (x, z) => (Math.abs(x) > Math.abs(z) ? (x > 0 ? '+x' : '-x') : (z > 0 ? '+z' : '-z'));
function ctx(b, room, F) {
  const [x0, x1, z0, z1] = room.r, y = F.y, h = F.h;
  const R = { b, room, id: room.id, y, h, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
  R.K = (x, z, ry = 0, dy = 0) => new Kit(b, x, y + dy, z, ry);
  R.A = (fn, x, z, ry = 0, ...a) => fn(new Kit(b, x, y, z, ry), ...a);
  R.rug = (key, x, z, w, d, ry = 0) => rugPlane(b, key, x, y + 0.032, z, w, d, ry);
  R.ext = (s) => isExt(room, s);
  R.tall = (s) => R.ext(s) || (room.tall || []).includes(s);
  // 靠墙：返回 [x, z, ry]（背靠该墙、面朝房间）；t 为沿墙的世界坐标
  // off 按 0.3 m 隔墙（半厚 0.15）约定；厚墙自动外推到墙面
  R.wall = (side, t, off = 0.45, r = room.r) => { off += wallHalf(room, side) - 0.15; return side === '-z' ? [t, r[2] + off, 0] : side === '+z' ? [t, r[3] - off, PI] : side === '-x' ? [r[0] + off, t, H] : [r[1] - off, t, -H]; };
  R.inset = (rect, gap = 0.02) => [rect[0] + (edgeOf(R, rect, '-x') ? wallHalf(room, '-x') : 0.12) + gap, rect[1] - (edgeOf(R, rect, '+x') ? wallHalf(room, '+x') : 0.12) - gap, rect[2] + (edgeOf(R, rect, '-z') ? wallHalf(room, '-z') : 0.12) + gap, rect[3] - (edgeOf(R, rect, '+z') ? wallHalf(room, '+z') : 0.12) - gap];
  R.W = (fn, side, t, off, ...a) => { const [x, z, ry] = R.wall(side, t, off); return fn(new Kit(b, x, y, z, ry), ...a); };
  // 壁挂 Kit：墙高升起才返回（写入 hi 子批次），否则 null
  R.WH = (side, t, hy, off = 0.17, force) => { if (!force && !R.tall(side)) return null; const [x, z, ry] = R.wall(side, t, off); return SUB(new Kit(b, x, y + hy, z, ry), 'hi' + side); };
  R.hiOf = (k, lx, lz) => { const e = k.T.elements; const wx = e[0] * lx + e[8] * lz, wz = e[2] * lx + e[10] * lz; return vecSide(wx, wz); };
  R.chand = (x, z, r, arms, tiers = 2, hang = 1.1, ceil) => { const yb = (ceil ?? h - 0.3) - hang; chandelier(R.K(x, z), yb, r, tiers, Math.max(0.15, hang - 0.35 * r), arms); };
  R.band = (inset = 0.3, wid = 0.6) => floorBand(R, inset, wid);
  return R;
}
// 地面黑金花饰带 + 黄铜细线
function floorBand(R, inset, wid) {
  const y = R.y + 0.028, [x0, x1, z0, z1] = [R.x0 + inset, R.x1 - inset, R.z0 + inset, R.z1 - inset], b = R.b;
  const put = (key, a, c, d, e, yy = y) => b.add(key, G.box, mat4((a + c) / 2, yy, (d + e) / 2, c - a, 0.006, e - d));
  put('marbleBlack', x0, x1, z0, z0 + wid); put('marbleBlack', x0, x1, z1 - wid, z1); put('marbleBlack', x0, x0 + wid, z0 + wid, z1 - wid); put('marbleBlack', x1 - wid, x1, z0 + wid, z1 - wid);
  const f = FINE(R.K(0, 0)).b, i = wid + 0.04;
  for (const [a, c, d, e] of [[x0 + i, x1 - i, z0 + i, z0 + i + 0.015], [x0 + i, x1 - i, z1 - i - 0.015, z1 - i], [x0 + i, x0 + i + 0.015, z0 + i, z1 - i], [x1 - i - 0.015, x1 - i, z0 + i, z1 - i]]) f.add('brass', G.box, mat4((a + c) / 2, y + 0.001, (d + e) / 2, c - a, 0.006, e - d));
}
// 局部框架（矩形 rect 内，背墙在 side）：u 沿墙，v 离墙；返回 { k, L, D, at(u,v,ry) }
function frame(R, rect, side, orig) {
  const [x0, x1, z0, z1] = rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const ry = side === '-z' ? 0 : side === '+z' ? PI : side === '-x' ? H : -H, along = side === '-z' || side === '+z' ? x1 - x0 : z1 - z0, deep = side === '-z' || side === '+z' ? z1 - z0 : x1 - x0;
  const k = R.K(cx, cz, ry); const L = along / 2, D = deep / 2;
  const toSide = (lx, lz) => R.hiOf(k, lx, lz);
  return { k, L, D, ry, side, at: (u, v, r = 0) => loc(k, u, v - D, r), hk: (lx, lz, u, v, hy, r = 0) => { const s = toSide(lx, lz); const onEdge = edgeOf(R, orig || rect, s) || Math.abs((s === '-z' ? rect[2] - R.z0 : s === '+z' ? R.z1 - rect[3] : s === '-x' ? rect[0] - R.x0 : R.x1 - rect[1]) - wallHalf(R.room, s)) < 0.1; if (!onEdge || !R.tall(s)) return null; return SUB(loc(k, u, v - D, r, hy), 'hi' + s); }, toSide };
}
const edgeOf = (R, rect, s) => { const e = 0.05; return s === '-z' ? Math.abs(rect[2] - R.z0) < e : s === '+z' ? Math.abs(rect[3] - R.z1) < e : s === '-x' ? Math.abs(rect[0] - R.x0) < e : Math.abs(rect[1] - R.x1) < e; };
// 选背墙：优先外墙（窗对面放床则取反），其次房间边
function pickSide(R, rect, prefer = 'ext', avoidExt = false) {
  const on = SIDES.filter((s) => edgeOf(R, rect, s)), ext = on.filter((s) => R.ext(s));
  const opp = { '-z': '+z', '+z': '-z', '-x': '+x', '+x': '-x' };
  if (avoidExt) { if (ext.length) { const o = opp[ext[0]]; return o; } return on[0] || '-z'; }
  if (ext.length) return ext[0]; if (on.length) return on[0];
  return (rect[1] - rect[0]) >= (rect[3] - rect[2]) ? '-z' : '-x';
}
const inset = (r, e) => [r[0] + e, r[1] - e, r[2] + e, r[3] - e];

// 卧室区：床头靠非窗墙、面朝窗
function bedroomArea(R, rect, o = {}) {
  const side = o.head || pickSide(R, rect, 'ext', true), F = frame(R, R.inset(rect), side), { L, D } = F;
  const bw = o.bw || 2.0, bl = o.bl || 2.1;
  const rugK = F.at(0, 0.2 + bl / 2 + 0.3); { const e = rugK.T.elements; rugPlane(R.b, o.rug || 'rugAubIvory', e[12], R.y + 0.032, e[14], Math.min(2 * L - 0.6, bw + 2.6), Math.min(2 * D - 0.5, bl + 2.2), F.ry); }
  bed(F.at(0, 0.02), bw, bl, { fab: o.fab, canopy: o.canopy || 'poster', pillows: o.pillows || 4, deco: o.deco ?? 2, crest: o.crest, drape: o.drape, duvet: o.duvet, throwCol: o.throwCol, decoCol: o.decoCol });
  for (const s of [-1, 1]) nightstand(F.at(s * (bw / 2 + 0.45), 0.3));
  bench(F.at(0, bl + 0.75), Math.min(1.5, bw - 0.3), o.fab || 'fabGold');
  const hk = F.hk(0, -1, 0, 0.02, 1.7); if (hk && o.art !== false) PROP.portraitFrame(loc(hk, 0, 0, 0, 0.55), { w: 0.62, h: 0.5, cell: o.bedArt ?? 7, lamp: false });
  if (hk) for (const s of [-1, 1]) sconce(loc(hk, s * (bw / 2 + 0.45), 0, 0, 0.05), { arms: 1, shade: o.drape || COL.ivory });
  if (L > 3.2) {
    const fx = L - 0.1; fireplace(F.at(fx - 0.2, D, -H), 1.5, { stone: o.stone || 'marbleW', mirror: 0.9 });
    armchair(F.at(fx - 1.6, D + 0.8, -H - 0.5), o.chairFab || 'fabCream'); stool(F.at(fx - 1.3, D + 1.5), o.chairFab || 'fabCream', 0.46, 0.36);
    desk(F.at(-L + 0.65, 2 * D - 1.4, H), 1.3, 0.65, o.chairFab || 'fabCream');
    vanity(F.at(-L + 0.5, D - 0.1, H), { fab: o.chairFab ? o.chairFab : undefined });
    if (2 * D > 7) { const lr = F.at(fx - 0.3, 2 * D - 0.9, -H); lr.bx('mahogany', 0, 0, 0, 0.9, 0.5, 0.5); lr.bx('enamel:#6b4a2e', 0, 0.5, 0, 0.8, 0.25, 0.45); }
  }
  const e = F.at(0, D).T.elements; R.chand(e[12], e[14], 0.55, o.arms || 8, 1);
}
// 更衣区
function dressArea(R, rect, o = {}) {
  const side = pickSide(R, rect, 'room'), F = frame(R, R.inset(rect), side), { L, D } = F;
  wardrobe(F.at(-L / 2 + 0.2, 0.02), Math.min(1.8, L - 0.4), 'mahogany'); if (L > 2.2) chest(F.at(L / 2 + 0.3, 0.02), 1.1);
  chevalMirror(F.at(L - 0.5, D + 0.5, -H)); coatStand(F.at(-L + 0.35, 2 * D - 0.4)); R.rug('rugSavIvory', F.at(0, D).T.elements[12], F.at(0, D).T.elements[14], 1.4, 1.0, F.ry);
}
// 客房浴室：铸铁卷边缸、台盆、马桶、电热毛巾架（2 浴巾）、台面叠手巾与面巾、小凳上叠浴袍
function bathFloor(R, rect, key = 'marbleGold') { const r = R.inset(rect, -0.01); R.b.add(key, G.box, mat4((r[0] + r[1]) / 2, R.y + 0.029, (r[2] + r[3]) / 2, r[1] - r[0], 0.006, r[3] - r[2])); }
function bathArea(R, rect, o = {}) {
  const side = pickSide(R, rect, 'ext'), F = frame(R, R.inset(rect), side), { L, D } = F, trim = o.trim || 'brass';
  bathFloor(R, rect);
  const tubLen = Math.min(1.8, 2 * L - 1.7);
  tub(F.at(-L + tubLen / 2 + 0.45, 0.5), { kind: 'roll', len: tubLen, col: o.col || COL.azure, trim });
  toilet(F.at(L - 0.55, 0.0), { type: o.wcType || 'low', seat: o.seat || 'mahogany', trim });
  const hk = F.hk(0, -1, 0, 0, 0);
  const sconceK = hk ? loc(hk, L - 0.55, 0.0, 0, 1.75) : null; if (sconceK) sconce(sconceK, { arms: 1, mat: trim === 'nickel' ? 'nickel' : 'ormolu' });
  // 台盆（右侧墙）
  const bwid = Math.min(1.4, 2 * D - 2.2);
  const bk = F.at(L - 0.02, D + 0.35, -H);
  const mk = F.hk(1, 0, L - 0.02, D + 0.35, 0, -H);
  basins(bk, bwid, { n: 1, trim, top: 'marbleGold', mk: mk || bk, frame: trim === 'nickel' ? 'nickel' : 'gold' });
  towelStack(loc(bk, -bwid / 2 + 0.2, 0.02, 0, 0.862), 2, 0.3, 0.22, { col: o.towel || COL.towel, seed: 3 });
  towelStack(loc(bk, -bwid / 2 + 0.2, 0.02, 0, 0.862 + 0.056), 2, 0.2, 0.18, { t: 0.022, col: o.towel || COL.towel, seed: 5 });
  // 电热毛巾架（左墙）挂浴巾两条
  const rk = F.at(-L + 0.14, D + 0.9, H); const ys = towelRail(rk, 0.72, 1.1, 5, trim);
  towelHang(loc(rk, -0.18, 0, 0, ys[0]), 0.32, 0.58, { col: o.towel || COL.towel }); towelHang(loc(rk, 0.18, 0, 0, ys[0]), 0.32, 0.54, { col: o.towel || COL.towel });
  // 浴缸边小凳 + 叠好的华夫格浴袍
  const sk = F.at(-L + tubLen + 0.8, 0.45); stool(sk, 'fab:' + (o.stool || '#E7DDC8'), 0.46, 0.36); towelStack(loc(sk, 0, 0, 0.1, 0.49), 2, 0.4, 0.3, { t: 0.055, col: '#F6F2E8', crest: false, seed: 7 });
  basket(F.at(-L + tubLen + 0.8, 1.15), 0.17, 0.3);
  { const e = F.at(-L + tubLen / 2 + 0.45, 1.45).T.elements; rugPlane(R.b, 'rugSavIvory', e[12], R.y + 0.034, e[14], 1.1, 0.65, F.ry); }
  { const e = F.at(0, D).T.elements; lantern(R.K(e[12], e[14]), R.h - 1.2, 0.8, 0.7, trim); }
}
function suite(R, o) {
  const P = R.room.parts || {};
  bedroomArea(R, P.bed || R.room.r, o);
  if (P.bath) bathArea(R, P.bath, o);
  if (P.dress) dressArea(R, P.dress, o);
}
// 通用布置（未单列的房间）
function generic(R) {
  const rank = R.room.rank || 2, n = R.room.name || '';
  if (rank === 3) { R.A(desk, R.cx, R.cz - R.d * 0.15, 0, 1.4, 0.7, 'fabCream'); R.W(bookshelf, '-z', R.cx, 0.45, Math.min(2, R.w - 1), 2.2); R.chand(R.cx, R.cz, 0.35, 6, 1); return; }
  R.rug('rugAubIvory', R.cx, R.cz, R.w * 0.55, R.d * 0.5);
  R.A(sofa, R.cx, R.cz - 1.4, 0, 'fabCream', 2.2); R.A(coffeeTable, R.cx, R.cz, 0, 1.2, 0.6);
  for (const s of [-1, 1]) R.A(armchair, R.cx + s * 1.6, R.cz + 0.6, s * -2.4, 'fabGold');
  R.chand(R.cx, R.cz, 0.6, 12, 2);
}

// 廊：长地毯 + 灯笼
function corridor(R, lamps = true) {
  const along = R.w >= R.d, L = along ? R.w : R.d, W = along ? R.d : R.w;
  R.rug('rugRunner', R.cx, R.cz, Math.min(2.2, W - 1.2), L - 1.6, along ? H : 0);
  if (lamps) { const n = Math.max(2, Math.round(L / 9)); for (let i = 0; i < n; i++) { const t = -L / 2 + L * (i + 0.5) / n; lantern(R.K(R.cx + (along ? t : 0), R.cz + (along ? 0 : t)), R.h - 1.5, 1.1, 0.8); } }
}
function liftOnly(R) {
  const sh = (PLAN.SHAFTS || []).find((s) => (s.name || '').includes('电梯')); const r = sh ? sh.r : [12.5, 15.5, -16.5, -12.5];
  if (r[0] < R.x0 - 0.1 || r[1] > R.x1 + 0.1) return;
  PROP.liftCage(R.K((r[0] + r[1]) / 2, (r[2] + r[3]) / 2), { w: r[1] - r[0], d: r[3] - r[2], h: R.h, car: false, dial: R.room.floor });
}
// 马桶间 / 小浴室的通用小件
function wcNook(R, rect, o = {}) {
  const side = o.side || pickSide(R, rect, 'ext'), F = frame(R, R.inset(rect), side), { L, D } = F;
  toilet(F.at(0, 0.0), { type: o.type || 'low', seat: o.seat, trim: o.trim, lid: o.lid });
  const hk = F.hk(0, -1, 0, 0, 0); if (hk) sconce(loc(hk, 0.5, 0.0, 0, 1.7), { arms: 1, mat: o.trim === 'nickel' ? 'nickel' : 'ormolu' });
  return F;
}

const ROOMFN = {
  /* ---------------- F1 ---------------- */
  '101'(R) {
    R.band(0.35, 0.6);
    const c = her('crest', '101') || { x: 0, z: 12 }; PROP.crest(R.K(c.x, c.z, 0, 0.027), { inlay: true, w: 4 });
    R.rug('rugAubAzure', 0, R.z1 - 3.1, 6, 4);
    const lc = her('longcaseClock', '101') || { x: -11.3, z: 16, ry: H }; PROP.longcaseClock(R.K(lc.x, lc.z, lc.ry ?? H));
    for (const sx of [-1, 1]) { const [x, z] = R.wall('-z', sx * 4.6, 0.4); R.A(consoleT, x, z, 0, 1.9, true, { mk: R.tall('-z') ? SUB(R.K(x, z), 'hi-z') : null, mirror: 2.3 }); }
    for (const z of [6.5, 11.5, 20.2]) R.A(bench, -11.25, z, H, 2.0, 'velvet:' + COL.crimson, 'gold');
    for (const z of [7, 12, 17]) R.A(bench, 11.25, z, -H, 2.0, 'velvet:' + COL.crimson, 'gold');
    for (const sx of [-1, 1]) R.A(vase, sx * 2.9, R.z1 - 0.9, 0, 1.4);
    for (const sx of [-1, 1]) { const k = R.K(sx * 10.6, R.z0 + 0.9, sx > 0 ? -PI / 4 : PI / 4); k.bx('marbleW', 0, 0, 0, 0.8, 1.1, 0.8); PROP.bust(loc(k, 0, 0, 0, -0.05), { seed: sx > 0 ? 1 : 2 }); }
    { const k = R.K(11.2, 20.4, -H - 0.3); rod(k, 'brass', [-0.3, 0, 0.2], [-0.25, 1.9, 0], 0.015); rod(k, 'brass', [0.3, 0, 0.2], [0.25, 1.9, 0], 0.015); rod(k, 'brass', [0, 0, -0.35], [0, 1.8, -0.02], 0.015); k.box('brass', 0, 1.4, 0.05, 0.8, 1.0, 0.04, 0, -0.1); k.box('fab:#2f4a3a', 0, 1.4, 0.075, 0.7, 0.9, 0.01, 0, -0.1); for (let i = 0; i < 4; i++) FINE(k).box('linen', -0.18 + (i % 2) * 0.34, 1.6 - (i >> 1) * 0.36, 0.085 - (1.6 - (i >> 1) * 0.36 - 1.4) * 0.1, 0.22, 0.28, 0.004, 0, -0.1); }
    for (const sx of [-1, 1]) for (const z of [4.5, 9.5, 14.5, 19.5]) sconce(R.K(sx * (8 - 0.46), z, sx > 0 ? -H : H, 2.7), { arms: 2 });
    R.chand(0, 7.2, 1.2, 48, 3, 4.0, 8.7); R.chand(0, 16.8, 1.2, 48, 3, 4.0, 8.7);
  },
  '102'(R) {
    for (let i = 0; i < 3; i++) R.W(wardrobe, '+z', R.x0 + 1.4 + i * 2.6, 0.45, 2.4, 'mahogany', 2.8);
    { const [x, z, ry] = R.wall('-x', R.cz, 0.2); const k = R.K(x, z, ry); k.bx('mahogany', 0, 1.35, 0, 7.0, 0.14, 0.05); k.bx('mahogany', 0, 1.8, 0.1, 7.0, 0.03, 0.25); for (let i = 0; i < 20; i++) { const u = -3.3 + i * 0.35; k.geo('brass', G.tor(PI, 4, 8, 0.2), u, 1.44, 0.07, 0.03, 0.03, 0.03, H, 0); FINE(k).box('enamel:#F5F2EC', u, 1.36, 0.03, 0.05, 0.035, 0.004); } }
    R.A(bench, R.cx + 1.5, R.cz - 1.5, 0, 1.6, 'enamel:#3a2a22'); R.A(umbrellaStand, R.x1 - 0.8, R.z1 - 0.9); R.W(chevalMirror, '+x', R.cz + 2, 0.5); R.W(cabinetGlass, '+x', R.cz - 2.2, 0.45, 1.4);
    R.rug('rugRunner', R.cx, R.cz, 1.6, 6); R.chand(R.cx, R.cz, 0.4, 6, 1);
  },
  '103'(R) {
    const wc = (R.room.parts && R.room.parts.wc) || [[R.x0, R.cx, R.z0, R.z0 + 6], [R.cx, R.x1, R.z0, R.z0 + 6]];
    wc.forEach((rc, i) => {
      const F = frame(R, R.inset(rc), '-z'), { L, D } = F;
      toilet(F.at(-L / 2 + 0.3, 0), { type: 'high', seat: 'mahogany', trim: 'brass' });
      const bk = F.at(L - 0.02, D * 0.9, -H); basins(bk, 1.0, { n: 1, cab: 'mahogany', mk: bk });
      towelStack(loc(bk, -0.36, 0.05, 0, 0.862), 6, 0.2, 0.2, { t: 0.018, seed: 11 + i }); towelStack(loc(bk, -0.36, -0.17, 0, 0.862), 6, 0.2, 0.2, { t: 0.018, seed: 21 + i });
      flowers(loc(bk, 0.38, -0.15), 0.89, 0.09);
      const rg = F.at(-L + 0.05, D + 0.8, H); rg.geo('brass', G.tor(PI * 2, 6, 24, 0.08), 0, 1.25, 0.1, 0.1, 0.1, 0.1, 0, H); vdisc(rg, 'brass', 0, 1.36, 0.01, 0.03, 0.03, 0.01);
      towelHang(loc(rg, 0, 0.1, 0, 1.16), 0.26, 0.42, { col: '#EFE9DB', gap: 0.012 });
      basket(F.at(-L + 0.35, 2 * D - 0.35), 0.16, 0.28); R.rug('rugSavIvory', F.at(0, D).T.elements[12], F.at(0, D).T.elements[14], 0.9, 0.6, 0);
      lantern(R.K(F.at(0, D).T.elements[12], F.at(0, D).T.elements[14]), R.h - 1.2, 0.8, 0.55);
    });
    const az = R.z0 + 7.2; R.A(vanity, R.cx, R.z1 - 0.6, PI, { wood: 'satinwood', fab: 'velvet:' + COL.empire }); R.A(sofa, R.cx - 2.6, R.z1 - 1.0, PI, 'velvet:' + COL.empire, 1.6, 2); R.A(stool, R.cx + 2.4, R.z1 - 1.2, 0, 'velvet:' + COL.empire);
    R.chand(R.cx, (az + R.z1) / 2, 0.4, 6, 1);
  },
  '104'(R) {
    R.W(counter, '-x', R.cz, 0.5, 3.2, 0.7, 'mahogany'); const k = R.K(R.x0 + 0.9, R.cz, H); k.bx('leatherG', 0, 0.9, 0, 3.0, 0.004, 0.5);
    R.W(bookshelf, '+z', R.cx - 1, 0.45, 2.2, 2.3, 0.4, { wood: 'mahogany' }); R.A(windsor, R.cx, R.cz - 1, PI); R.A(windsor, R.cx + 1, R.cz - 1.2, PI);
    { const [x, z, ry] = R.wall('+x', R.cz, 0.12); const s = R.K(x, z, ry); s.bx('brass', 0, 1.0, 0, 1.6, 1.0, 0.06); s.bx('screen', 0, 1.06, 0.035, 1.46, 0.86, 0.01); }
    { const [x, z, ry] = R.wall('-z', R.cx + 2, 0.2); const s = R.K(x, z, ry); s.bx('mahogany', 0, 0.9, 0, 1.0, 1.2, 0.2); for (let i = 0; i < 16; i++) FINE(s).box('brass', -0.4 + (i % 8) * 0.115, 1.1 + (i >> 3) * 0.5, 0.11, 0.02, 0.06, 0.01); }
    bankerLamp(R.K(R.x0 + 0.9, R.cz + 1, H, 0.92)); R.chand(R.cx, R.cz, 0.35, 6, 1);
  },
  '105'(R) {
    R.rug('rugHeriz', R.cx, R.cz + 0.5, 5, 6);
    R.W(fireplace, '-z', R.cx, 0.2, 1.8, { stone: 'marbleBlack:#c8736a', clock: true });
    const hk = R.WH('-z', R.cx, 1.95, 0.08); if (hk) { PROP.portraitFrame(loc(hk, 0, 0, 0, 0.55), { w: 1.4, h: 1.0, cell: 5, lamp: true }); for (const s of [-1, 1]) sconce(loc(hk, s * 1.25, 0, 0, -0.1), { arms: 2 }); }
    R.A(armchair, R.cx - 1.4, R.z0 + 2.2, 0.5, 'velvet:' + COL.crimson); R.A(armchair, R.cx + 1.4, R.z0 + 2.2, -0.5, 'velvet:' + COL.crimson);
    R.A(sofa, R.cx, R.z0 + 4.8, PI, 'velvet:' + COL.champ, 2.2); R.A(coffeeTable, R.cx, R.z0 + 3.4, 0, 1.2, 0.6);
    { const k = R.K(R.x1 - 0.6, R.z1 - 1.2, -H); legs(k, 0.5, 0.36, 0.7, 0.02, 'mahogany', 0.03); for (let i = 0; i < 3; i++) k.box('books', 0, 0.35 + i * 0.12, 0, 0.44, 0.02, 0.3, 0, 0.1); }
    R.chand(R.cx, R.cz, 0.6, 12, 2);
  },
  '106'(R) {
    R.band(0.3, 0.4);
    const bz = (her('bust', '106') || {}).z ?? -5.3, empty = (her('bust', '106') || { x: 18 }).x;
    [-18, -14.5, -11, 11, 14.5, 18].forEach((x, i) => PROP.bust(R.K(x, bz), { empty: Math.abs(x - empty) < 0.3, seed: i }));
    for (const sx of [-1, 1]) { const [x, z] = R.wall('-z', sx * 5.5, 0.4); R.A(consoleT, x, z, 0, 1.6, true, { mk: R.tall('-z') ? SUB(R.K(x, z), 'hi-z') : null, mirror: 1.6 }); }
    for (const sx of [-1, 1]) R.A(consoleT, sx * 16, R.z1 - 0.55, PI, 1.6, false);
    for (const x of [-17, -8, -2.5, 2.5, 8, 17]) lantern(R.K(x, R.cz), R.h - 1.6, 1.2, 0.9);
    R.rug('rugRunner', 0, R.cz, 2.2, 14, H);
  },
  '107'(R) {
    R.rug('rugSavIvory', R.cx, R.cz, 10, 8);
    for (const s of [-1, 1]) { const cx = R.cx + s * 3.8, cz = R.cz;
      R.A(sofa, cx, cz + s * 0 + 1.6, PI, 'velvetChamp', 2.2, 3, 'gold'); R.A(coffeeTable, cx, cz + 0.2, 0, 1.2, 0.6);
      R.A(armchair, cx - 1.4, cz - 1.2, 0.5, 'velvetChamp', 'gold'); R.A(armchair, cx + 1.4, cz - 1.2, -0.5, 'velvetChamp', 'gold'); R.A(floorLamp, cx + s * 2.6, R.z0 + 1.2); }
    R.A(roundTable, R.cx, R.cz - 3.5, 0, 0.7, 'marbleW'); flowers(R.K(R.cx, R.cz - 3.5), 0.75, 0.3, [COL.rose, COL.linen, COL.champ]);
    R.A(piano, R.x1 - 2.2, R.z1 - 2.6, 2.5);
    for (const s of [-1, 1]) R.A(plant, R.cx + s * 6.6, R.z0 + 0.9, 0, 1.4, 'jard');
    for (const u of [-6.2, -2.1, 2.1, 6.2]) R.W(chevalMirror, '+z', R.cx + u, 0.35, 2.9);
    R.chand(R.cx, R.cz, 0.9, 24, 2);
  },
  '108'(R) {
    const lc = her('liftCage', '108') || { x: 14, z: -14.5 }; const sh = (PLAN.SHAFTS || []).find((s) => (s.name || '').includes('电梯')); const r = sh ? sh.r : [12.5, 15.5, -16.5, -12.5];
    PROP.liftCage(R.K((r[0] + r[1]) / 2, (r[2] + r[3]) / 2), { w: r[1] - r[0], d: r[3] - r[2], h: R.h, car: true, dial: 0 });
    for (const x of [R.x0 + 0.8, R.x1 - 0.8]) R.A(torchere, x, R.z1 - 0.8, 0, 1.9);
    lantern(R.K(R.cx - 3.2, R.cz + 2), 3.3, 1.3, 1.2);
  },
  '110'(R) { R.W(bellBoard, '-x', R.cz, 0.08); R.A(desk, R.cx + 0.5, R.cz, -H, 1.4, 0.7, 'enamel:#3a2a22', { wood: 'oak' }); R.A(windsor, R.cx - 0.8, R.cz + 1.6, 0); R.W(wardrobe, '+x', R.z0 + 1.2, 0.45, 1.4, 'oak'); R.W(counter, '-z', R.cx, 0.4, 2.0, 0.55); { const [x, z, ry] = R.wall('+z', R.cx, 0.1); const k = R.K(x, z, ry); k.bx('walnut', 0, 1.1, 0, 1.4, 0.9, 0.04); k.bx('linen', 0, 1.15, 0.025, 1.3, 0.8, 0.005); } R.chand(R.cx, R.cz, 0.35, 6, 1); },
  '111'(R) { R.W(filing, '-x', R.cz, 0.35, 4, 'oak'); { const [x, z, ry] = R.wall('+z', R.cx, 0.1); const k = R.K(x, z, ry); k.bx('iron', 0, 0, 0, 1.2, 2.0, 0.2); k.cyl('brass', 0, 1.0, 0.1, 0.18, 0.04, 16, 1, 1, 1, H); } R.A(workTable, R.cx + 0.8, R.cz, H, 2.0, 0.9, 'leatherG'); pendant(R.K(R.cx + 0.8, R.cz), R.h - 0.6, 0.9); },
  '113'(R) {
    const lenT = Math.min(16.5, R.w - 7), cz = R.cz;
    R.rug('rugAubCrimson', R.cx + 0.5, cz, lenT + 1.5, 6);
    R.A(diningTable, R.cx + 0.6, cz, 0, lenT, 1.7, 'enamel:#6e1f1b', { n: 11, hostChair: true, candles: 5 });
    const cc = her('crestChair', '113') || { x: R.cx + 0.6 - lenT / 2 - 0.45, z: cz, ry: H }; PROP.crestChair(R.K(cc.x, cc.z, cc.ry ?? H));
    R.W(sideboard, '-x', cz, 0.35, 2.6); R.W(sideboard, '+x', cz, 0.35, 2.6);
    for (const u of [-6, 6]) R.W(fireplace, '-z', R.cx + u, 0.2, 1.9, { stone: 'marbleW', clock: u < 0 });
    for (const [i, u] of [[5, -6], [7, 0], [5, 6]].entries()) { const hk = R.WH('-z', R.cx + u[1], i === 1 ? 2.35 : 2.25, 0.08); if (hk) PROP.portraitFrame(hk, { w: i === 1 ? 2.2 : 1.6, h: i === 1 ? 1.5 : 1.1, cell: u[0] }); }
    for (const u of [-9, -3, 3, 9]) { const hk = R.WH('-z', R.cx + u, 1.9, 0.02); if (hk) sconce(hk, { arms: 3 }); }
    for (const x of [-6, 0, 6]) R.chand(R.cx + 0.6 + x, cz, 0.9, 36, 3);
  },
  '114'(R) { R.rug('rugSavIvory', R.cx, R.cz, 5, 5); R.A(roundTable, R.cx, R.cz, 0, 0.9, 'walnut'); for (let i = 0; i < 8; i++) { const a = i * PI / 4; R.A(chair, R.cx + Math.sin(a) * 1.35, R.cz + Math.cos(a) * 1.35, a + PI, 'velvet:#6F7F5B', 'walnut'); } flowers(R.K(R.cx, R.cz), 0.75, 0.22); R.W(sideboard, '-x', R.cz, 0.35, 2.4, 'walnut'); chafing(R.K(R.x0 + 0.4, R.cz, H, 0.95)); for (const s of [-1, 1]) R.A(citrus, R.x1 - 0.8, R.cz + s * 4.5, 0, 1.5); lantern(R.K(R.cx, R.cz), R.h - 1.3, 0.9, 0.9); },
  '116'(R) { R.W(counter, '-z', R.cx, 0.4, R.w - 2, 0.65); R.A(workTable, R.cx, R.cz + 0.8, 0, 3.4, 1.2); R.W(cabinetGlass, '+z', R.cx - 3, 0.3, 1.6, 'oak'); R.W(cabinetGlass, '+z', R.cx + 3, 0.3, 1.6, 'oak'); { const [x, z, ry] = R.wall('+x', R.cz, 0.35); const k = R.K(x, z, ry); k.bx('marbleW', 0, 0, 0, 1.4, 0.9, 0.6); k.bx('brass', 0, 0.9, 0, 0.9, 0.02, 0.45); k.geo('brass', G.tor(PI, 6, 12, 0.14), 0, 1.15, -0.2, 0.08, 0.08, 0.08, -H, -H); } for (let i = 0; i < 3; i++) pendant(R.K(R.cx - 2 + i * 2, R.cz + 0.8), R.h - 0.8, 1.0); },
  '117'(R) { for (let i = 0; i < 4; i++) R.W(cabinetGlass, '-z', R.x0 + 1.4 + i * 2.2, 0.3, 2.0, 'paintIvory', 2.6); R.A(workTable, R.cx, R.cz + 1, 0, 3.0, 1.1); flowers(R.K(R.cx - 0.8, R.cz + 1), 0.9, 0.2); flowers(R.K(R.cx + 0.6, R.cz + 1), 0.9, 0.16, [COL.linen, COL.champ]); R.W(counter, '+x', R.cz, 0.35, 2.4, 0.6); pendant(R.K(R.cx - 1, R.cz + 1), R.h - 0.8, 1.0); pendant(R.K(R.cx + 1, R.cz + 1), R.h - 0.8, 1.0); },
  '118'(R) { R.A(bench, R.cx, R.cz - 2, 0, 1.6, 'enamel:#3a2a22', 'walnut'); R.A(umbrellaStand, R.x1 - 0.6, R.z1 - 0.8); R.A(coatStand, R.x1 - 0.6, R.z0 + 0.8); R.A(windsor, R.cx - 1, R.cz + 2, H); R.A(windsor, R.cx + 1, R.cz + 2, -H); R.W(chest, '+x', R.cz, 0.3, 1.4, 'walnut'); R.rug('rugRunner', R.cx, R.cz, 1.6, 6); lantern(R.K(R.cx, R.cz), R.h - 1.4, 1.0, 0.8); },
  '119'(R) {
    for (const s of [-1, 1]) { const cx = R.cx + s * 6, cz = R.cz + 0.4;
      R.rug('rugSavIvory', cx, cz, 8, 6);
      R.A(sofa, cx, cz + 1.8, PI, 'velvet:' + COL.crimson, 2.4, 3, 'gold'); R.A(coffeeTable, cx, cz + 0.3, 0, 1.3, 0.65);
      R.A(armchair, cx - 1.6, cz - 1.2, 0.6, 'velvet:' + COL.champ, 'gold'); R.A(armchair, cx + 1.6, cz - 1.2, -0.6, 'velvet:' + COL.champ, 'gold');
      R.A(sideTable, cx + s * 2.2, cz + 1.8, 0); }
    R.W(fireplace, '-z', R.cx, 0.2, 2.2, { stone: 'marbleW', clock: true });
    const hk = R.WH('-z', R.cx, 1.55, 0.08); if (hk) { hk.bx('gold', 0, 0, 0, 1.9, 2.35, 0.06); hk.bx('mirror', 0, 0.1, 0.035, 1.66, 2.12, 0.006); hk.geo('gold', G.seg(), 0, 2.35, 0, 0.95, 0.25, 0.06); for (const s of [-1, 1]) { PROP.portraitFrame(loc(hk, s * 3.4, 0, 0, 1.2), { w: 1.3, h: 2.3, cell: s < 0 ? 0 : 4 }); sconce(loc(hk, s * 1.5, 0, 0, 1.1), { arms: 3 }); } }
    R.W(cabinetGlass, '+x', R.cz, 0.3, 1.8); R.W(consoleT, '-x', R.cz, 0.3, 1.6, false);
    R.A(cardTable, R.cx, R.z1 - 2.2, 0.3, 'velvet:' + COL.crimson);
    for (const s of [-1, 1]) R.chand(R.cx + s * 6, R.cz + 0.4, 0.9, 36, 3);
  },
  '120'(R) { R.rug('rugAubIvory', R.cx, R.cz, 5, 6); R.W(fireplace, '+x', R.cz, 0.2, 1.6, { stone: 'marbleBlack:#7fae90', clock: true }); R.A(sofa, R.cx - 1.8, R.cz, H, 'velvet:' + COL.empire, 1.7, 2); R.A(armchair, R.cx + 0.6, R.cz - 1.6, 0.4, 'fabCream'); R.A(armchair, R.cx + 0.6, R.cz + 1.6, PI - 0.4, 'fabCream'); R.A(coffeeTable, R.cx - 0.5, R.cz, H, 1.0, 0.55); R.W(desk, '-z', R.cx, 0.9, 1.4, 0.7, 'fabCream'); R.W(bookshelf, '+z', R.cx, 0.45, 2.2, 2.6); R.chand(R.cx, R.cz, 0.6, 12, 2); },
  '122'(R) { R.A(billiard, R.cx, R.cz, 0); R.W(cueRack, '-x', R.cz, 0.15); for (const s of [-1, 1]) R.A(armchair, R.cx + s * 2.2, R.z1 - 1.0, PI + s * 0.3, 'enamel:#4a1d16'); for (const s of [-1, 1]) R.A(armchair, R.cx + s * 2.2, R.z0 + 1.2, -s * 0.3, 'enamel:#4a1d16'); R.W(sideboard, '+x', R.cz, 0.35, 2.0, 'walnut'); { const [x, z, ry] = R.wall('-z', R.cx, 0.1); const k = R.K(x, z, ry); k.bx('walnut', 0, 1.0, 0, 1.2, 0.8, 0.05); k.bx('enamel:#1b1b1b', 0, 1.05, 0.03, 1.1, 0.7, 0.005); for (let i = 0; i < 6; i++) FINE(k).box('porcelain', -0.4 + i * 0.07, 1.5, 0.035, 0.012, 0.08, 0.002); } { const k = R.K(R.cx, R.cz); k.cyl('brass', 0, R.h - 1.2, 0, 0.012, 0.9, 4); cx_(k, 'brass', 0, R.h - 1.25, 0, 0.02, 2.4, 6); for (const x of [-0.9, 0, 0.9]) { k.geo('enamel:#1d4a33', G.cyl(12, 0.35, true), x, R.h - 1.45, 0, 0.26, 0.2, 0.26); k.cyl('glow', x, R.h - 1.56, 0, 0.12, 0.02, 8); } } },
  '123'(R) { for (let i = 0; i < 3; i++) R.W(vitrine, '-z', R.x0 + 2 + i * 3.8, 0.6, 1.8); for (let i = 0; i < 3; i++) R.W(cabinetGlass, '+z', R.x0 + 2 + i * 3.8, 0.3, 1.8, 'ebony', 2.4); R.A(vitrine, R.cx, R.cz + 0.5, 0, 2.2); R.A(desk, R.cx, R.cz - 2, 0, 1.6, 0.8, 'fabCream'); R.chand(R.cx, R.cz, 0.5, 8, 1); },
  '124'(R) { ROOMFN['118'](R); },
  C1(R) {
    R.rug('rugHeriz', R.cx, R.cz, 8, 8);
    for (const side of ['-z', '+z', '-x', '+x']) { const L = side[1] === 'z' ? R.w : R.d; const n = Math.floor((L - 3) / 2.2); for (let i = 0; i < n; i++) { const t = (side[1] === 'z' ? R.cx : R.cz) + (i - (n - 1) / 2) * 2.2; if (Math.abs(i - (n - 1) / 2) < 0.6) continue; R.W(bookshelf, side, t, 0.3, 2.1, 3.6, 0.42, { hi: R.tall(side) ? 'hi' + side : null, rail: true, wood: 'walnut' }); } }
    R.W(libraryLadder, '-x', R.cz + 3.3, 0.3, 3.4);
    for (const s of [-1, 1]) { R.A(desk, R.cx + s * 3, R.cz, s * H, 1.6, 0.8, 'enamel:#4a1d16'); }
    R.A(globe, R.cx, R.cz + 3, 0, 0.4); R.A(chesterfield, R.cx, R.cz - 2.6, 0, 2.2); R.A(coffeeTable, R.cx, R.cz - 1.2, 0, 1.2, 0.6);
    R.chand(R.cx, R.cz, 0.9, 16, 2);
  },
  D1(R) {
    const o = her('organ', 'D1') || { x: 90, z: -19 }; PROP.organ(R.K(o.x, Math.max(o.z, R.z0 + 1.2) , 0), { h: Math.min(9, R.h + 6.3), w: 9 });
    R.A(piano, R.cx - 3, R.z0 + 5.5, 2.4);
    { const k = R.K(R.cx, R.z0 + 5.2); k.bx('mahogany', 0, 0, 0, 10, 0.3, 4); k.bx('rugAubCrimson', 0, 0.3, 0, 9.4, 0.005, 3.4); }
    for (let r = 0; r < 4; r++) for (let i = 0; i < 10; i++) { if (i === 4 || i === 5) continue; R.A(chair, R.cx - 4.5 + i * 1.0, R.z0 + 10 + r * 1.2, PI, 'velvet:' + COL.crimson, 'gold'); }
    R.rug('rugRunner', R.cx, R.z0 + 13.5, 1.6, 8);
    for (const s of [-1, 1]) for (const z of [R.z0 + 8, R.z1 - 4]) R.A(torchere, R.cx + s * (R.w / 2 - 1), z, 0, 2.0);
    for (const z of [R.cz - 2, R.cz + 7]) R.chand(R.cx, z, 1.1, 36, 3, 5.2, 10.6);
  },
  /* ---------------- F2 ---------------- */
  '202'(R) {
    R.rug('rugAubIvory', R.cx, R.cz, 4, 16);
    for (const z of [R.z0 + 4, R.cz, R.z1 - 4]) { R.A(roundTable, R.x0 + 1.6, z, 0, 0.45, 'marbleW'); teaSet(R.K(R.x0 + 1.6, z)); R.A(armchair, R.x0 + 1.6, z - 1.0, 0, 'velvet:' + COL.paleGold); R.A(armchair, R.x0 + 1.6, z + 1.0, PI, 'velvet:' + COL.paleGold); }
    R.W(sofa, '+x', R.cz, 0.5, 'velvet:' + COL.paleGold, 2.6, 3); R.A(coffeeTable, R.x1 - 2.0, R.cz, H, 1.2, 0.55);
    { const [x, z, ry] = R.wall('+x', R.cz - 4.5, 0.35); const k = R.K(x, z, ry); k.bx('enamel:#1a1a1a', 0, 0, 0, 1.6, 1.0, 0.5); k.bx('enamel:#1a1a1a', 0, 1.0, -0.1, 1.6, 0.9, 0.3); FINE(k).box('gold', 0, 0.5, 0.252, 1.4, 0.6, 0.002); teaSet(loc(k, 0, 0.05), 1.0); }
    { const [x, z, ry] = R.wall('+x', R.cz + 4.5, 0.4); const k = R.K(x, z, ry); legs(k, 0.6, 0.5, 0.7, 0.02, 'mahogany'); k.bx('mahogany', 0, 0.68, 0, 0.64, 0.04, 0.54); k.geo('nickel', G.lathe('samovar', [[0, 0], [0.12, 0], [0.08, 0.06], [0.16, 0.2], [0.17, 0.35], [0.1, 0.5], [0.05, 0.56], [0.08, 0.6], [0, 0.66]], 14), 0, 0.72, 0); }
    for (const z of [R.z0 + 5, R.z1 - 5]) R.chand(R.cx, z, 0.5, 8, 1);
  },
  '203'(R) { R.W(rack, '-x', R.cz, 0.35, 3.0); R.A(workTable, R.cx + 0.6, R.cz, H, 2.0, 0.6, 'fab:#F7F4EE'); R.W(desk, '+z', R.cx, 0.9, 1.2, 0.6, 'fabCream'); pendant(R.K(R.cx, R.cz), R.h - 0.6, 0.9); },
  '204'(R) { R.W(rack, '-x', R.cz, 0.35, 3.0); R.W(rack, '+x', R.cz, 0.35, 3.0); pendant(R.K(R.cx, R.cz), R.h - 0.6, 0.9); },
  '206'(R) {
    R.rug('rugAubIvory', R.cx, R.cz, 9, 7);
    R.A(sofa, R.cx - 1.2, R.cz + 1.8, PI, 'fab:' + COL.ivory, 3.0, 3); R.A(sofa, R.cx - 3.3, R.cz - 0.2, H, 'fab:' + COL.ivory, 2.2, 2); R.A(coffeeTable, R.cx - 1.2, R.cz, 0, 1.4, 0.7);
    for (const [dx, dz, a] of [[1.4, -1.4, -0.6], [1.8, 0.4, -1.3]]) R.A(armchair, R.cx + dx, R.cz + dz, a, 'velvet:#6F7F5B');
    R.A(chessTable, R.cx + 4.5, R.cz - 3.5, 0.3);
    R.W(fireplace, '-x', R.cz, 0.2, 1.8, { stone: 'marbleGold', clock: true, mirror: 1.1 });
    R.W(bookshelf, '+z', R.cx - 4, 0.45, 2.2, 2.6); R.W(bookshelf, '+z', R.cx + 4, 0.45, 2.2, 2.6);
    R.W(uprightPiano, '+x', R.cz + 3.5, 0.45); R.W(desk, '+x', R.cz - 2.5, 0.8, 1.3, 0.65, 'velvet:#6F7F5B', { wood: 'satinwood' });
    R.A(floorLamp, R.cx - 4.2, R.cz + 2.8); R.A(floorLamp, R.cx + 3.2, R.cz + 1.6);
    R.chand(R.cx, R.cz, 0.7, 16, 2);
  },
  '209'(R) { R.W(counter, '-x', R.cz, 0.4, 3.0, 0.6); R.W(cabinetGlass, '+x', R.cz, 0.3, 1.6, 'oak'); pendant(R.K(R.cx, R.cz), R.h - 0.6, 0.9); },
  '211'(R) { R.W(rack, '-x', R.cz, 0.35, 3.0, 4, false); pendant(R.K(R.cx, R.cz), R.h - 0.6, 0.9); },
  '212'(R) {
    R.rug('rugHeriz', R.cx, R.cz, 9, 7);
    for (let i = 0; i < 8; i++) { const x = R.x0 + 1.4 + i * 2.25; if (x > R.x1 - 1) break; R.W(bookshelf, '-z', x, 0.3, 2.2, R.h - 0.45, 0.42, { hi: R.tall('-z') ? 'hi-z' : null, rail: true }); }
    for (const t of [R.z0 + 1.6, R.z1 - 1.6]) R.W(bookshelf, '-x', t, 0.3, 2.4, R.h - 0.45, 0.42, { hi: R.tall('-x') ? 'hi-x' : null, rail: true });
    R.W(libraryLadder, '-z', R.x0 + 6, 0.3, R.h - 0.5);
    R.W(fireplace, '-x', R.cz, 0.2, 1.8, { stone: 'marbleBlack', clock: true });
    { const hk = R.WH('-x', R.cz, 1.9, 0.08); if (hk) PROP.portraitFrame(loc(hk, 0, 0, 0, 0.55), { w: 1.0, h: 1.3, cell: 0 }); }
    const fd = her('foundersDesk', '212') || { x: -30, z: 9 }; PROP.foundersDesk(R.K(fd.x, fd.z, fd.ry ?? 0));
    for (const s of [-1, 1]) R.A(chesterfield, R.x0 + 4.2, R.cz + s * 1.8, s > 0 ? PI : 0, 2.2); R.A(coffeeTable, R.x0 + 4.2, R.cz, H, 1.2, 0.6);
    R.A(globe, R.x1 - 2.2, R.z0 + 2.0, 0, 0.4); R.A(isleModel, R.x1 - 2.2, R.z1 - 2.0, 0);
    { const k = R.K(R.x1 - 4.5, R.z0 + 1.4); k.bx('walnut', 0, 0, 0, 1.6, 0.9, 1.0); for (let i = 0; i < 6; i++) FINE(k).box('walnut', 0, 0.1 + i * 0.13, 0.502, 1.5, 0.11, 0.008); k.bx('leatherG', 0, 0.9, 0, 1.5, 0.004, 0.9); }
    R.chand(R.cx, R.cz, 0.7, 12, 2);
  },
  '213'(R) { for (const s of [-1, 1]) R.A(desk, R.cx + s * 3, R.cz, 0, 1.6, 0.8, 'enamel:#3a2a22'); R.W(filing, '-z', R.cx, 0.35, 5); R.W(bench, '+z', R.cx, 0.4, 2.0, 'enamel:#3a2a22'); { const hk = R.WH('-x', R.cz, 2.3, 0.1); if (hk) { vdisc(hk, 'walnut', 0, 0, 0.03, 0.3, 0.3, 0.06, 24); vdisc(hk, 'porcelain', 0, 0, 0.065, 0.25, 0.25, 0.004, 24); rod(hk, 'ebony', [0, 0, 0.07], [0.1, 0.12, 0.07], 0.006, 4); } } { const k = R.K(R.cx, R.cz + 3); k.bx('walnut', 0, 0, 0, 1.2, 0.75, 0.6); k.bx('brass', 0, 0.75, 0, 0.6, 0.12, 0.35); k.bx('screen', 0, 0.87, -0.05, 0.4, 0.2, 0.02); } R.chand(R.cx, R.cz, 0.45, 8, 1); },
  '215'(R) { for (let i = 0; i < 3; i++) R.W(filing, '-z', R.x0 + 2.5 + i * 4.3, 0.35, 5, 'walnut'); R.A(workTable, R.cx, R.cz + 1.2, 0, 4.0, 1.4, 'leatherG'); for (let i = 0; i < 3; i++) R.A(chair, R.cx - 1.2 + i * 1.2, R.cz + 2.2, PI, 'enamel:#3a2a22', 'walnut'); pendant(R.K(R.cx, R.cz + 1.2), R.h - 0.6, 0.9); },
  '216'(R) { { const [x, z, ry] = R.wall('+z', R.cx, 0.15); const k = R.K(x, z, ry); k.bx('walnut', 0, 0, 0, 1.4, 2.2, 0.3); k.cyl('brass', 0, 1.1, 0.15, 0.25, 0.06, 20, 1, 1, 1, H); } R.W(filing, '-x', R.cz, 0.35, 3, 'walnut'); R.W(filing, '+x', R.cz, 0.35, 3, 'walnut'); },
  '217'(R) {
    R.band(0.25, 0.3);
    const side = pickSide(R, R.room.r, 'ext'), F = frame(R, R.inset(R.room.r), side), { L, D } = F;
    toilet(F.at(-L + 0.8, 0), { type: 'close', seat: 'ebony', trim: 'brass' });
    const hk = F.hk(0, -1, 0, 0, 0); if (hk) sconce(loc(hk, -L + 1.35, 0, 0, 1.7), { arms: 1 });
    const bk = F.at(L - 0.02, D, -H); basins(bk, 1.1, { n: 1, cab: 'walnut', top: 'marbleW', mk: false });
    const mk = F.hk(1, 0, L - 0.02, D, 0, -H) || bk; mirrorRect(loc(mk, 0, -0.26, 0, 1.6), 0.7, 0.9, 'brass'); for (const s of [-1, 1]) sconce(loc(mk, s * 0.55, -0.26, 0, 1.65), { arms: 1 });
    const rk = F.at(-L + 0.14, D + 0.8, H); const ys = towelRail(rk, 0.55, 1.0, 4, 'nickel');
    towelHang(loc(rk, -0.13, 0, 0, ys[0]), 0.24, 0.42, { col: '#1F3A2C' }); towelHang(loc(rk, 0.13, 0, 0, ys[0]), 0.24, 0.4, { col: '#1F3A2C' });
    { const m = F.hk(0, -1, L - 1.3, 0, 1.55); if (m) { mirrorRect(m, 0.34, 0.44, 'brass'); FINE(m).box('enamel:#cfd3d4', 0, 0, 0.045, 0.28, 0.36, 0.002); } }
  },
  '218'(R) { R.rug('rugAubIvory', R.cx, R.cz, 5, 5); R.A(armchair, R.cx - 1, R.cz, 0.4, 'velvet:#6F7F5B'); R.A(armchair, R.cx + 1, R.cz, -0.4, 'velvet:#6F7F5B'); R.A(stool, R.cx, R.cz + 1.1, 0, 'velvet:#6F7F5B'); R.A(floorLamp, R.cx - 1.8, R.cz - 0.6); R.A(roundTable, R.cx, R.cz - 1.2, 0, 0.45); R.A(chaise, R.cx, R.z0 + 1.0, 0, 'fab:' + COL.ivory); R.W(bookshelf, '+z', R.cx, 0.45, 2.4, 2.5); R.A(telescope, R.x0 + 1.4, R.z0 + 1.2, PI + 0.3); R.chand(R.cx, R.cz, 0.5, 8, 1); },
  '219'(R) { suite(R, { fab: 'velvet:' + COL.azure, col: COL.azure, drape: '#D9DDE6', chairFab: 'velvet:' + COL.azure, canopy: 'poster', decoCol: COL.azure }); },
  '220'(R) { suite(R, { fab: 'velvet:' + COL.rose, col: '#B7776B', drape: '#EAD6CF', chairFab: 'fab:' + COL.rose, canopy: 'poster', decoCol: COL.rose }); },
  '222'(R) { suite(R, { fab: 'velvet:' + COL.empire, col: COL.empire, drape: '#D6E0D6', chairFab: 'velvet:' + COL.empire, canopy: 'poster', decoCol: COL.empire, bedArt: 7 }); },
  '223'(R) { for (const s of [-1, 1]) { R.rug('rugSavIvory', R.cx + s * 4, R.cz, 5, 4.5); R.A(sofa, R.cx + s * 4, R.cz + 1.4, PI, 'fab:' + COL.ivory, 2.2); R.A(coffeeTable, R.cx + s * 4, R.cz, 0, 1.2, 0.6); R.A(armchair, R.cx + s * 4 - 1.3, R.cz - 1.2, 0.5, 'velvet:' + COL.champ); R.A(armchair, R.cx + s * 4 + 1.3, R.cz - 1.2, -0.5, 'velvet:' + COL.champ); } R.W(fireplace, '+z', R.cx, 0.2, 1.8, { clock: true }); R.W(desk, '+x', R.cz, 0.8, 1.4, 0.7, 'fabCream'); R.W(bookshelf, '-x', R.cz, 0.45, 2.2, 2.5); R.A(cardTable, R.cx, R.z0 + 1.8, 0.2); R.W(sideboard, '-z', R.cx + 4, 0.35, 1.8); for (const s of [-1, 1]) R.chand(R.cx + s * 4, R.cz, 0.55, 12, 2); },
  C2(R) { for (const side of ['-z', '+z', '-x', '+x']) { const L = side[1] === 'z' ? R.w : R.d; const n = Math.floor((L - 2) / 2.2); for (let i = 0; i < n; i++) { const t = (side[1] === 'z' ? R.cx : R.cz) + (i - (n - 1) / 2) * 2.2; R.W(bookshelf, side, t, 0.3, 2.1, 3.0, 0.42, { hi: R.tall(side) ? 'hi' + side : null, rail: true }); } } for (const s of [-1, 1]) R.A(desk, R.cx + s * 4, R.cz + s * 4, s > 0 ? PI : 0, 1.4, 0.7, 'enamel:#4a1d16'); R.chand(R.cx, R.cz, 0.6, 12, 2); },
  /* ---------------- F3 ---------------- */
  '301'(R) {
    R.rug('rugRunner', R.cx, R.cz, 3, R.d - 3);
    const ef = her('portraitFrame', '301') || { x: 10, z: 2.35 };
    let cell = 0;
    for (let i = 0; i < 6; i++) { const z = 4.5 + i * 3; const hk = R.WH('-x', z, 2.4, 0.17, true); if (hk) PROP.portraitFrame(hk, { w: 1.1, h: 1.45, cell: (cell++) % 5 }); }
    for (const x of [-10, -7, -4, 4, 7, 10]) { const hk = R.WH('-z', x, 2.4, 0.17, true); if (!hk) continue; const empty = Math.abs(x - ef.x) < 0.3; PROP.portraitFrame(hk, { w: 1.1, h: 1.45, cell: (cell++) % 5, empty }); }
    for (let i = 0; i < 4; i++) R.A(bench, R.cx, R.z0 + 3.4 + i * 4.8, H, 1.8, 'velvet:' + COL.crimson, 'gold');
    for (const s of [-1, 1]) { const k = R.K(R.x1 - 0.6, R.cz + s * 4, -H); consoleT(k, 1.6, false, { vase: false }); PROP.crest(loc(k, 0, -0.1, 0, 0.87), { w: 0.55, supporters: false }); }
    for (let i = 0; i < 4; i++) R.chand(R.cx, R.z0 + 3 + i * 5, 0.45, 8, 1, 1.2);
  },
  '302'(R) { R.A(workTable, R.cx, R.cz - 3, 0, 2.2, 0.6, 'fab:#F7F4EE'); R.W(rack, '-x', R.cz + 4, 0.35, 3.0); R.W(desk, '+x', R.cz, 0.8, 1.3, 0.65, 'fabCream'); R.W(bellBoard, '-x', R.cz - 5, 0.08, 12, 1.2); { const k = R.K(R.cx, R.cz + 1); k.bx('walnut', 0, 0, 0, 0.9, 0.9, 0.5); k.bx('brass', 0, 0.9, 0, 0.5, 0.35, 0.35); } R.chand(R.cx, R.cz, 0.35, 6, 1); },
  '303'(R) { R.W(rack, '-x', R.cz, 0.35, 3.2); R.W(rack, '+x', R.cz, 0.35, 3.2); pendant(R.K(R.cx, R.cz), R.h - 0.6, 0.9); },
  '304'(R) {
    R.band(0.25, 0.3);
    const side = pickSide(R, R.room.r, 'ext'), F = frame(R, R.inset(R.room.r), side), { L, D } = F;
    toilet(F.at(-L + 0.8, 0), { type: 'close', seat: 'satinwood', trim: 'brass' });
    const bk = F.at(L - 0.02, D, -H); basins(bk, 1.1, { n: 1, cab: 'satinwood', top: 'marbleW', mk: false });
    const mk = F.hk(1, 0, L - 0.02, D, 0, -H) || bk; mirrorRect(loc(mk, 0, -0.26, 0, 1.6), 0.7, 0.9, 'brass'); for (const s of [-1, 1]) sconce(loc(mk, s * 0.55, -0.26, 0, 1.65), { arms: 1 });
    const rk = F.at(-L + 0.14, D + 0.8, H); const ys = towelRail(rk, 0.55, 1.0, 4, 'nickel');
    towelHang(loc(rk, -0.13, 0, 0, ys[0]), 0.24, 0.42, { col: '#F3EBDD' }); towelHang(loc(rk, 0.13, 0, 0, ys[0]), 0.24, 0.4, { col: '#F3EBDD' });
    towelStack(loc(bk, -0.35, 0, 0, 0.862), 3, 0.26, 0.2, { col: '#F3EBDD', seed: 17 });
  },
  '306'(R) { R.rug('rugAubIvory', R.cx, R.cz, 7, 5.5); R.A(diningTable, R.cx, R.cz, 0, 3.4, 1.4, 'velvet:#6F7F5B', { n: 3, candles: 3 }); R.W(sideboard, '+z', R.cx - 3, 0.35, 2.2, 'walnut'); R.W(cabinetGlass, '+z', R.cx + 3, 0.3, 1.8, 'walnut'); R.W(fireplace, '-x', R.cz, 0.2, 1.7, { stone: 'marbleGold:#E0B860', clock: true, mirror: 1.0 }); R.A(roundTable, R.x1 - 1.6, R.z0 + 1.6, 0, 0.55); R.A(chair, R.x1 - 2.4, R.z0 + 1.6, H, 'velvet:#6F7F5B'); R.A(chair, R.x1 - 0.8, R.z0 + 1.6, -H, 'velvet:#6F7F5B'); R.chand(R.cx, R.cz, 0.6, 12, 2); },
  '309'(R) { R.W(bellBoard, '-x', R.cz, 0.08, 18, 1.4); R.A(windsor, R.cx, R.cz - 1, 0); R.A(windsor, R.cx + 1, R.cz - 1, 0); R.W(counter, '+x', R.cz, 0.35, 2.0, 0.55); pendant(R.K(R.cx, R.cz), R.h - 0.6, 0.8); },
  '311'(R) { R.A(coatStand, R.cx - 1.5, R.cz + 2.5); R.W(mirrorRect, '+x', R.cz, 0.02, 0.8, 1.2, 'gold'); R.W(consoleT, '-x', R.cz, 0.3, 1.2, false); R.rug('rugRunner', R.cx, R.cz, 1.4, 5); lantern(R.K(R.cx, R.cz), R.h - 1.4, 1.0, 0.8); },
  '312'(R) {
    R.rug('rugSavIvory', R.cx, R.cz, 9, 7);
    R.W(fireplace, '-z', R.cx, 0.2, 2.0, { stone: 'marbleW', clock: true });
    { const hk = R.WH('-z', R.cx, 1.95, 0.08); if (hk) { PROP.portraitFrame(loc(hk, 0, 0, 0, 0.55), { w: 1.6, h: 1.1, cell: 7 }); for (const s of [-1, 1]) sconce(loc(hk, s * 1.3, 0, 0, -0.1), { arms: 2 }); } }
    R.A(sofa, R.cx, R.cz + 1.8, PI, 'velvet:' + COL.azure, 2.8, 3); R.A(coffeeTable, R.cx, R.cz + 0.3, 0, 1.4, 0.7);
    R.A(armchair, R.cx - 1.8, R.z0 + 2.3, 0.6, 'velvet:' + COL.champ); R.A(armchair, R.cx + 1.8, R.z0 + 2.3, -0.6, 'velvet:' + COL.champ);
    R.W(desk, '+z', R.cx - 5.5, 0.8, 1.5, 0.75, 'velvet:' + COL.azure, { wood: 'satinwood' });
    R.W(bookshelf, '-x', R.cz - 2, 0.45, 2.2, 2.6); R.W(bookshelf, '-x', R.cz + 2, 0.45, 2.2, 2.6); R.W(gramophone, '+x', R.cz, 0.5);
    R.A(floorLamp, R.cx - 3.2, R.cz + 2.2); R.chand(R.cx, R.cz, 0.7, 16, 2);
  },
  '313'(R) {
    for (let i = 0; i < 4; i++) R.W(wardrobe, '-x', R.z0 + 1.5 + i * 2.6, 0.45, 2.4, 'mahogany', 3.1);
    for (let i = 0; i < 3; i++) R.W(wardrobe, '-z', R.x0 + 4.5 + i * 2.6, 0.45, 2.4, 'mahogany', 3.1);
    { const k = R.K(R.cx + 0.5, R.cz + 0.5); chest(loc(k, -0.6, 0), 1.2); chest(loc(k, 0.6, 0), 1.2); chest(loc(k, -0.6, 0, PI), 1.2); chest(loc(k, 0.6, 0, PI), 1.2); k.bx('marbleW', 0, 0.93, 0, 2.5, 0.03, 1.1); k.bx('velvet:' + COL.azure, 0, 0.962, 0, 0.5, 0.06, 0.35); }
    { const k = R.K(R.x1 - 1.2, R.z1 - 2.2, PI + 0.3); for (const s of [-1, 0, 1]) { const m = loc(k, s * 0.62, 0, -s * 0.5); chevalMirror(m, 2.0); } }
    R.W(vanity, '+x', R.cz - 2.5, 0.35, { wood: 'mahogany', fab: 'velvet:' + COL.azure }); R.A(chaise, R.cx + 3, R.z0 + 1.2, 0, 'velvet:' + COL.champ); R.A(coatStand, R.x1 - 0.8, R.z0 + 0.8);
    R.rug('rugAubIvory', R.cx + 0.5, R.cz + 0.5, 5, 4); R.chand(R.cx, R.cz, 0.5, 8, 1);
  },
  '315'(R) {
    R.rug('rugAubIvory', R.cx, R.cz, R.w - 3.2, R.d - 2.6);
    const bk = R.K(R.cx, R.z1 - 0.3, PI);
    bed(bk, 2.4, 2.2, { fab: 'velvet:' + COL.champ, canopy: 'crown', pillows: 6, deco: 3, crest: true, drape: '#EEE4CC', duvet: '#F8F5EF', throwCol: '#C9A24B', decoCol: COL.champ });
    for (const s of [-1, 1]) nightstand(loc(bk, s * 1.75, 0.28));
    bench(loc(bk, 0, 2.95), 1.8, 'velvet:' + COL.champ, 'gold');
    { const k = FINE(bk); k.box('glow', 0, 0.06, 1.2, 2.2, 0.01, 0.02); }
    R.W(fireplace, '-x', R.cz, 0.2, 1.9, { stone: 'marbleW', clock: true, mirror: 1.1 });
    R.A(armchair, R.x0 + 2.8, R.cz - 1.6, H + 0.6, 'velvet:' + COL.rose); R.A(armchair, R.x0 + 2.8, R.cz + 1.6, H - 0.6, 'velvet:' + COL.rose); R.A(roundTable, R.x0 + 3.4, R.cz, 0, 0.4, 'marbleW', 0.62);
    R.A(chaise, R.cx + 5.5, R.z0 + 1.6, PI - 0.3, 'velvet:' + COL.champ);
    R.W(desk, '+x', R.cz + 2.5, 0.8, 1.4, 0.7, 'velvet:' + COL.rose, { wood: 'satinwood' });
    R.W(vanity, '+x', R.cz - 2.6, 0.35, { fab: 'velvet:' + COL.rose });
    R.A(floorLamp, R.x0 + 1.4, R.z1 - 1.2);
    R.chand(R.cx, R.cz, 0.75, 16, 2);
  },
  '316'(R) {
    R.band(0.3, 0.45);
    const cx = R.cx, cz = R.cz;
    // 整石浴缸（圆台）
    const t = her('tub', '316') || { x: cx, z: cz }; const tk = R.K(t.x, t.z, t.ry ?? 0);
    tub(tk, { kind: 'slipper', len: 2.0, dais: 3.2 });
    lantern(R.K(t.x, t.z), 2.35, R.h - 0.3 - 2.35 - 0.7, 0.75);
    PROP.crest(R.K(cx, R.z1 - 1.9, 0, 0.027), { inlay: true, w: 1.3 });
    // 马桶间
    const wc = (R.room.parts && R.room.parts.wc) || [R.x0, R.x0 + 3, R.z0, R.z0 + 3];
    { const F = frame(R, R.inset(wc), '-z'); toilet(F.at(-0.2, 0.0), { type: 'low', seat: 'mahogany', trim: 'brass', lid: 'marbleW' });
      const hk = F.hk(0, -1, 0, 0, 0); if (hk) sconce(loc(hk, 0.55, 0, 0, 1.7), { arms: 1 });
      const sk = F.at(F.L - 0.16, F.D * 0.9, -H); bookshelf(sk, 0.7, 1.1, 0.26, { wood: 'mahogany' }); }
    // 双台盆（−x 外墙），镜与壁灯挂在远墙
    const vz = cz - 0.6, [bx0, bz0] = R.wall('-x', vz, 0.45), bk = R.K(bx0, bz0, H), hkx = R.tall('-x') ? SUB(R.K(bx0, bz0, H), 'hi-x') : bk;
    basins(bk, 3.0, { n: 2, top: 'marbleGold', mk: hkx });
    towelStack(loc(bk, -0.12, 0.02, 0, 0.862), 4, 0.3, 0.22, { seed: 31 });
    towelStack(loc(bk, 0.2, 0.04, 0, 0.862), 6, 0.2, 0.19, { t: 0.024, seed: 37 });
    // 两组电热毛巾架，各挂两条浴巾（背靠 −z 外墙）
    for (const [i, x] of [[0, R.x0 + 5.6], [1, R.x0 + 7.4]].entries()) { const [rx0, rz0] = R.wall('-z', x[1], 0.27), rk = R.K(rx0, rz0, 0); const ys = towelRail(rk, 0.78, 1.15, 5, 'brass');
      towelHang(loc(rk, -0.19, 0, 0, ys[0]), 0.34, 0.62 - i * 0.03, { seed: i }); towelHang(loc(rk, 0.19, 0, 0, ys[0]), 0.34, 0.58 + i * 0.02); }
    // 浴袍两件（黄铜挂钩，−x 远墙）
    for (const [i, z] of [R.z1 - 2.2, R.z1 - 3.2].entries()) { const [rx0, rz0] = R.wall('-x', z, 0.15); const k = R.tall('-x') ? SUB(R.K(rx0, rz0, H), 'hi-x') : R.K(rx0, rz0, H); robe(k, 1.72, i ? '#EFE7D6' : '#F6F2E8'); }
    basket(R.K(t.x + 1.9, t.z + 1.0), 0.2, 0.34);
    { const k = R.K(t.x - 1.9, t.z - 0.9); legs(k, 0.5, 0.4, 0.62, 0.02, 'ormolu', 0.04, 'turn'); k.bx('marbleW', 0, 0.62, 0, 0.54, 0.03, 0.44); towelStack(loc(k, 0.05, 0, 0.2, 0.65), 2, 0.3, 0.22, { seed: 41 }); candelabra(loc(k, -0.17, 0.08, 0, 0.65), 0.3, 1); }
    // 淋浴间（+x 后角）
    shower(R.K(R.x1 - 1.6, R.z0 + 1.6, 0), 2.4, 2.4, 2.3);
    // 三折化妆镜梳妆台、丝绒扶手椅、屏风
    R.W(vanity, '+x', cz + 1.6, 0.35, { wood: 'satinwood', fab: 'velvet:' + COL.champ });
    R.A(armchair, R.x1 - 1.7, R.z1 - 1.4, PI + 0.6, 'velvet:' + COL.champ);
    R.A(screenFold, R.x1 - 3.6, R.z1 - 0.8, 0.3, 'fab:' + COL.ivory);
    R.rug('rugSavIvory', t.x, t.z + 2.1, 1.5, 0.8);
    R.chand(cx, cz + 3.0, 0.45, 8, 1);
  },
  '317'(R) { suite(R, { fab: 'velvet:' + COL.pearl, col: '#B9B6AF', drape: '#E7E3DA', chairFab: 'fab:' + COL.pearl, canopy: 'poster', trim: 'nickel', seat: 'white', decoCol: COL.paleGold, throwCol: COL.paleGold, bedArt: 3 }); },
  '318'(R) { R.rug('rugAubIvory', R.cx, R.cz, 6, 6); R.A(sofa, R.cx, R.cz + 1.6, PI, 'fab:' + COL.ivory, 2.4); R.A(armchair, R.cx - 1.6, R.cz - 1.2, 0.5, 'velvet:' + COL.champ); R.A(armchair, R.cx + 1.6, R.cz - 1.2, -0.5, 'velvet:' + COL.champ); R.A(coffeeTable, R.cx, R.cz + 0.2, 0, 1.2, 0.6); R.W(fireplace, '+x', R.cz, 0.2, 1.6, { clock: true, mirror: 1.0 }); R.W(bookshelf, '-z', R.cx, 0.45, 2.4, 2.5); R.A(cardTable, R.cx - 3, R.z1 - 2, 0.2); R.W(gramophone, '-x', R.cz + 3, 0.5); { const k = R.K(R.cx + 3, R.z0 + 1.2); for (let i = 0; i < 4; i++) { k.box('ormolu', -0.3 + i * 0.2, 0.9, 0, 0.12, 0.16, 0.015, 0, -0.15); } } R.chand(R.cx, R.cz, 0.55, 12, 2); },
  '320'(R) {
    // 中性房间：只放普通家具（沙发、扶手椅、书桌和椅子、书柜、衣柜、单人床、茶几、台灯）
    R.A(sofa, R.cx - 3, R.cz + 1.5, PI, 'fab:' + COL.ivory, 2.2, 3); R.A(coffeeTable, R.cx - 3, R.cz, 0, 1.1, 0.55); R.A(armchair, R.cx - 3, R.cz - 1.5, 0, 'fab:' + COL.ivory);
    R.W(desk, '+x', R.cz, 0.8, 1.4, 0.7, 'fab:' + COL.ivory); R.W(bookshelf, '-z', R.cx - 2, 0.45, 2.2, 2.3); R.W(wardrobe, '-z', R.cx + 2, 0.45, 1.6);
    R.W(bed, '+z', R.cx + 3, 0.02, 1.0, 2.0, { fab: 'fab:#D9D2C3', canopy: 'none', pillows: 2, deco: 0, throw: false });
    R.W(sideTable, '+z', R.cx + 4.3, 0.35); R.chand(R.cx, R.cz, 0.3, 6, 1);
  },
  '321'(R) {
    const P = R.room.parts || {}; const bath = P.bath;
    const bedR = bath ? [R.x0, bath[0], R.z0, R.z1] : R.room.r;
    bedroomArea(R, bedR, { fab: 'fab:#CBBFA8', canopy: 'none', pillows: 4, deco: 2, chairFab: 'fab:' + COL.ivory, arms: 8 });
    if (bath) { bathFloor(R, bath); const F = frame(R, R.inset(bath), pickSide(R, bath, 'ext')), { L, D } = F; toilet(F.at(-L + 0.6, 0), { type: 'low', seat: 'white', trim: 'nickel' }); const bk = F.at(L - 0.02, D, -H); basins(bk, 0.9, { n: 1, trim: 'nickel', top: 'marbleW', cab: 'paintIvory' }); const rk = F.at(L - 0.6, 2 * D - 0.2, PI); const ys = towelRail(rk, 0.5, 1.0, 4, 'nickel'); towelHang(loc(rk, 0, 0, 0, ys[0]), 0.34, 0.5, { col: '#FBF9F4', crest: false }); }
  },
  /* ---------------- F4 ---------------- */
  '401'(R) { R.rug('rugHeriz', R.cx, R.cz, 4.5, 4); R.A(desk, R.cx, R.cz + 0.8, PI, 1.8, 0.9, 'enamel:#3a2a22'); R.A(chair, R.cx - 0.7, R.cz - 0.8, 0, 'enamel:#5E1B18'); R.A(chair, R.cx + 0.7, R.cz - 0.8, 0, 'enamel:#5E1B18'); R.W(filing, '-x', R.cz, 0.35, 3); R.W(cabinetGlass, '+x', R.cz, 0.3, 1.6); R.W(fireplace, '-z', R.cx, 0.2, 1.3, { clock: true, candles: false }); { const hk = R.WH('+z', R.cx, 1.8, 0.08); if (hk) { hk.bx('walnut', 0, 0, 0, 1.6, 0.9, 0.05); hk.bx('linen', 0, 0.05, 0.03, 1.5, 0.8, 0.004); for (let i = 0; i < 12; i++) FINE(hk).box('brass', -0.6 + (i % 6) * 0.24, 0.2 + (i >> 1 & 1) * 0.35, 0.04, 0.02, 0.05, 0.005); } } pendant(R.K(R.cx, R.cz), R.h - 0.6, 0.8); },
  '402'(R) { const P = R.room.parts || {}; R.A(bed, R.x0 + 2.0, R.z1 - 0.4, PI, 1.1, 2.0, { fab: 'fab:' + COL.duck, canopy: 'none', pillows: 2, deco: 0 }); R.A(nightstand, R.x0 + 3.2, R.z1 - 0.6, PI); R.W(wardrobe, '-x', R.cz - 1, 0.45, 1.4); R.W(desk, '+z', R.cx + 1.4, 0.8, 1.2, 0.6, 'fab:' + COL.duck); R.A(armchair, R.cx, R.cz, 0.4, 'fab:' + COL.duck); pendant(R.K(R.cx - 1, R.cz + 1), R.h - 0.6, 0.8);
    if (P.bath) { bathFloor(R, P.bath, 'marbleW'); const F = frame(R, R.inset(P.bath), pickSide(R, P.bath, 'ext')), { L, D } = F; toilet(F.at(-L + 0.55, 0), { type: 'low', seat: 'white', trim: 'nickel' }); const bk = F.at(L - 0.02, D, -H); basins(bk, 0.8, { n: 1, trim: 'nickel', top: 'marbleW', cab: 'paintIvory', mk: false }); const rk = F.at(0.4, 2 * D - 0.15, PI); const ys = towelRail(rk, 0.46, 0.95, 4, 'nickel'); towelHang(loc(rk, 0, 0, 0, ys[0]), 0.3, 0.45, { col: '#FBF9F4', crest: false }); } },
  '403'(R) {
    // 中性房间：长桌、椅子、储物柜、书架、吸顶灯
    R.A(workTable, R.cx, R.cz, 0, 4.0, 1.2, 'oak'); for (let i = 0; i < 4; i++) for (const s of [-1, 1]) R.A(chair, R.cx - 1.5 + i, R.cz + s * 0.95, s > 0 ? PI : 0, 'fab:#8a8f86', 'oak');
    R.W(filing, '-x', R.cz, 0.35, 3, 'oak'); R.W(wardrobe, '+x', R.cz - 2, 0.45, 1.4, 'oak'); R.W(bookshelf, '+z', R.cx, 0.45, 2.4, 2.3, 0.4, { wood: 'oak' });
    R.K(R.cx, R.cz).cyl('porcelain', 0, R.h - 0.35, 0, 0.3, 0.08, 16, 0.6);
  },
  '404'(R) { R.A(diningTable, R.cx, R.cz, 0, 6.0, 1.2, 'fab:#6F7F5B', { n: 6, candles: 1 }); R.W(sofa, '-x', R.cz, 0.5, 'fab:#6F7F5B', 2.0, 2); R.W(bookshelf, '+x', R.cz, 0.45, 2.0, 2.2, 0.4, { wood: 'oak' }); R.W(counter, '-z', R.cx + 4, 0.35, 2.0, 0.55); for (const x of [-2, 0, 2]) pendant(R.K(R.cx + x, R.cz), R.h - 0.6, 0.8); },
  '405'(R) { for (let i = 0; i < 3; i++) { const k = R.K(R.x0 + 2 + i * 3.2, R.cz + 1, 0.2); legs(k, 1.3, 0.35, 0.85, 0.015, 'iron', 0.1, 'plain'); k.bx('fab:#EDE6D6', 0, 0.85, 0, 1.4, 0.03, 0.38); k.bx('brass', 0.4, 0.88, 0, 0.22, 0.1, 0.1); } R.A(workTable, R.cx, R.cz - 2.2, 0, 3.0, 1.0, 'marbleW'); towelStack(R.K(R.cx - 0.8, R.cz - 2.2, 0.1, 0.9), 5, 0.4, 0.32, { t: 0.05, plain: true, seed: 3 }); towelStack(R.K(R.cx + 0.2, R.cz - 2.2, -0.1, 0.9), 4, 0.4, 0.32, { t: 0.05, plain: true, seed: 5 }); R.W(rack, '-z', R.cx + 3, 0.35, 3.0); { const k = R.K(R.x1 - 1.2, R.z1 - 1.0); k.bx('iron', 0, 1.7, 0, 2.0, 0.03, 0.03); for (let i = 0; i < 4; i++) towelHang(loc(k, -0.75 + i * 0.5, 0, 0, 1.7), 0.4, 0.7, { col: COL.towel, plain: true }); for (const s of [-1, 1]) k.bx('iron', s * 1.0, 0, 0, 0.03, 1.7, 0.4); } pendant(R.K(R.cx, R.cz), R.h - 0.6, 0.8); },
  '406'(R) { for (let i = 0; i < 3; i++) R.W(rack, '-z', R.x0 + 2 + i * 3.8, 0.35, 3.4, 4, false); R.W(rack, '+z', R.cx, 0.35, 3.4, 4, false); R.W(desk, '+x', R.cz, 0.8, 1.2, 0.6, 'enamel:#3a2a22', { wood: 'oak' }); pendant(R.K(R.cx, R.cz), R.h - 0.6, 0.8); },
  '408'(R) { R.W(monitorWall, '-z', R.cx, 0.15, Math.min(8, R.w - 2), 2); R.A(monitorDesk, R.cx, R.cz - 0.6, PI, 3.4, 3); R.W(filing, '+x', R.cz, 0.35, 2); pendant(R.K(R.cx, R.cz), R.h - 0.6, 0.8); },
  '409'(R) { const k = R.K(R.cx, R.cz); k.geo('brass', G.lathe('ward', [[0, 0], [1.2, 0], [1.2, 0.1], [1.0, 0.2], [0.9, 0.85], [1.05, 0.95], [0, 0.95]], 24), 0, 0, 0); k.geo('crystal', G.sph(10, 8), 0, 1.35, 0, 0.3, 0.42, 0.3); k.cyl('glow', 0, 0.95, 0, 0.35, 0.05, 16); for (let i = 0; i < 4; i++) { const a = i * H + PI / 4; k.cyl('brass', Math.sin(a) * 2.6, 0, Math.cos(a) * 2.6, 0.08, 1.1, 8); vdisc(loc(k, Math.sin(a) * 2.6, Math.cos(a) * 2.6, a, 1.3), 'porcelain', 0, 0, 0.0, 0.2, 0.2, 0.02, 16); } R.W(desk, '-z', R.cx + 4.5, 0.8, 1.4, 0.7, 'enamel:#3a2a22', { wood: 'oak' }); lantern(R.K(R.cx, R.cz), R.h - 1.0, 0.6, 0.9); },
  '410'(R) { const P = R.room.parts || {}; const vx = P.void ? P.void[1] : R.x0; const x0 = vx + 0.3, n = 3, dz = R.d / n; for (let i = 0; i < n; i++) { const z0 = R.z0 + i * dz; R.A(bed, R.x1 - 0.3, z0 + dz / 2, -H, 1.0, 2.0, { fab: 'fab:#B8C4C0', canopy: 'none', pillows: 2, deco: 0, throw: false }); R.A(nightstand, R.x1 - 0.6, z0 + dz / 2 + 0.95, -H); R.A(wardrobe, x0 + 0.4, z0 + 0.9, H, 1.0, 'oak'); R.A(desk, x0 + 0.5, z0 + dz - 1.0, H, 1.0, 0.5, 'fab:#B8C4C0', { wood: 'oak' }); pendant(R.K((x0 + R.x1) / 2, z0 + dz / 2), R.h - 0.6, 0.7); } },
  '412'(R) { const n = 2, dx = R.w / n; for (let i = 0; i < n; i++) { const x = R.x0 + dx * (i + 0.5); const F = frame(R, [R.x0 + dx * i + 0.2, R.x0 + dx * (i + 1) - 0.2, R.z0 + 0.3, R.cz], '-z'); toilet(F.at(-0.6, 0), { type: 'low', seat: 'white', trim: 'nickel', lid: 'porcelain' }); const bk = R.K(x, R.cz + 0.7, PI); basins(bk, 0.8, { n: 1, trim: 'nickel', top: 'marbleW', cab: 'paintIvory', mk: false }); shower(R.K(x, R.z1 - 1.0, PI), 1.3, 1.2, 2.2, 'nickel'); const rk = R.K(x + 0.8, R.cz - 0.4, -H); const ys = towelRail(rk, 0.5, 1.0, 4, 'nickel'); towelHang(loc(rk, 0, 0, 0, ys[0]), 0.34, 0.5, { col: '#FBF9F4', plain: true }); } },
  '413'(R) { R.W(rack, '-x', R.cz, 0.35, 3.2); R.W(rack, '+x', R.cz, 0.35, 3.2); pendant(R.K(R.cx, R.cz), R.h - 0.6, 0.8); },
  /* ---------------- F5 ---------------- */
  '501'(R) {
    const lounger = (x, z, ry) => { const k = R.K(x, z, ry); legs(k, 0.7, 1.9, 0.28, 0.025, 'oak', 0.04, 'plain'); k.bx('oak', 0, 0.25, 0.2, 0.72, 0.05, 1.3); sl(k, 'fab:' + COL.ivory, 0, 0.34, 0.2, 0.66, 0.08, 1.28, 0.03); k.box('oak', 0, 0.55, -0.72, 0.72, 0.06, 0.8, 0, -0.75); sl(k, 'fab:' + COL.ivory, 0, 0.6, -0.68, 0.66, 0.08, 0.78, 0.03, 0, -0.75); pillowAt(k, 'fab:#F7F4EE', 0, 0.84, -0.95, 0.4, 0.12, 0.26, -0.75); k.blob(0, 0, 1.1, 2.4, 0.03); };
    for (const x of [-11, -8.4, -5.8, 5.8, 8.4, 11]) lounger(x, 16.8, PI);
    for (const s of [-1, 1]) { R.A(sideTable, s * 7.1, 15.6, 0, false); R.A(citrus, s * 17.5, 19.5, 0, 1.4); R.A(citrus, s * 17.5, -2, 0, 1.5); }
    R.A(roundTable, 0, 15, 0, 0.7, 'marbleW'); flowers(R.K(0, 15), 0.75, 0.22);
  },
  '502'(R) {
    const c = [0, 2], rr = 5.7, n = 16;
    for (let i = 0; i < n; i++) { if (i % 4 === 0) continue; const a = i / n * PI * 2; const k = R.K(c[0] + Math.sin(a) * rr, c[1] + Math.cos(a) * rr, a + PI); sl(k, 'mahogany', 0, 0.2, 0, 1.9, 0.3, 0.55, 0.03); sl(k, 'velvet:' + COL.azure, 0, 0.42, 0.02, 1.9, 0.14, 0.55, 0.05); sl(k, 'velvet:' + COL.azure, 0, 0.72, -0.25, 1.9, 0.5, 0.12, 0.05, 0, -0.1); }
    R.A(telescope, c[0] + 2.8, c[1] - 2.2, PI - 0.6);
    { const k = R.K(c[0], c[1]); roundTable(k, 0.8, 'marbleW', 0.8); k.geo('art', G.disc(32, ART(7, 0.02)), 0, 0.803, 0, 0.7, 1, 0.7); }
    { const k = R.K(c[0] - 2.8, c[1] + 2.4); k.geo('brass', G.lathe('wx', [[0, 0], [0.25, 0], [0.18, 0.1], [0.06, 0.2], [0.05, 1.0], [0.1, 1.1], [0, 1.1]], 12), 0, 0, 0); k.geo('crystal', G.sph(10, 8), 0, 1.3, 0, 0.16, 0.2, 0.16); k.geo('brass', G.tor(PI * 2, 4, 24, 0.05), 0, 1.3, 0, 0.24, 0.24, 0.24, 0, H); k.cyl('glow', 0, 1.1, 0, 0.12, 0.03, 10); }
  },
  '503'(R) { lantern(R.K(R.cx, R.cz), R.h - 1.6, 1.0, 0.8); },
  /* ---------------- 过厅、廊、竖井站（minor 也在这里轻量布置） ---------------- */
  '112'(R) { lantern(R.K(R.cx + 1.5, R.cz + 2.5), R.h - 1.4, 1.0, 0.7); },
  '310'(R) { lantern(R.K(R.cx + 1.5, R.cz + 2.5), R.h - 1.4, 1.0, 0.7); },
  '207'(R) { liftOnly(R); }, '307'(R) { liftOnly(R); },
  '115'(R) { corridor(R); }, '121'(R) { corridor(R); }, '214'(R) { corridor(R, false); }, '221'(R) { corridor(R, false); }, '314'(R) { corridor(R, false); }, '319'(R) { corridor(R, false); },
  '205'(R) { corridor(R); }, '305'(R) { corridor(R); },
  '201'(R) { const g = (R.room.parts && R.room.parts.gallery) || [R.x0, R.x1, R.z0, R.z0 + 2]; for (let i = 0; i < 4; i++) { const x = g[0] + 5 + i * (g[1] - g[0] - 10) / 3, z = (g[2] + g[3]) / 2 - 0.35; R.A(chair, x, z, 0, 'velvet:' + COL.crimson, 'gold'); const k = R.K(x, z + 0.72, PI); rod(k, 'brass', [0, 0, 0], [0, 1.1, 0], 0.012, 5); k.box('brass', 0, 1.18, 0.02, 0.45, 0.3, 0.01, 0, -0.35); } },
  '504'(R) { lantern(R.K(R.cx, R.cz), R.h - 1.6, 1.0, 0.8); },
  '505'(R) { },
};

/* ================================================================
 * 按楼层布置（main.js 对每层调用一次）
 * ================================================================ */
export function furnish(b, fi, only) {
  b = wrapB(b);
  const F = FLOORS[fi]; if (!F) return;
  const rooms = ROOMS.filter((r) => r.floor === fi);
  for (const room of rooms) {
    if (!room.id || (only && room.id !== only)) continue;
    const fn = ROOMFN[room.id];
    if (!fn && (room.minor || room.void || room.skipFloor)) continue;
    try { const R = ctx(b, room, F); if (fn) fn(R); else generic(R); }
    catch (e) { console.warn('furnish', room.id, e); }
  }
}
export { ROOMFN as ROOM_FURNISH };
