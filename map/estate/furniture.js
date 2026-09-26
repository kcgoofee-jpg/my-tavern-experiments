// 伊甸庄园 · 家具（组合几何：腿、坐垫、靠背…）与各房间布置
import * as THREE from 'three';
import { G, Kit } from './lib.js';
import { ROOMS, FLOORS } from './plan.js';

const PI = Math.PI, H = PI / 2;
const sub = (k, x, z, ry = 0, y = 0) => { const n = new Kit(k.b, 0, 0, 0); n.T = k.T.clone().multiply(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z)); return n; };
// 在楼层 y 上、世界坐标 (x,z)、朝向 ry 放一件家具
const at = (b, y) => (fn, x, z, ry = 0, ...a) => fn(new Kit(b, x, y, z, ry), ...a);

/* ---------------- 单件 ---------------- */
function legs(k, w, d, h, r = 0.035, mat = 'woodDark', inset = 0.05) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(mat, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), r, h, 6, 0.75);
}
export function chair(k, fab = 'fabCream', wood = 'woodDark') {
  legs(k, 0.46, 0.46, 0.45, 0.022, wood, 0.04);
  k.bx(wood, 0, 0.4, 0, 0.48, 0.05, 0.48); k.bx(fab, 0, 0.45, 0.01, 0.44, 0.07, 0.42);
  for (const sx of [-1, 1]) k.bx(wood, sx * 0.2, 0.45, -0.21, 0.04, 0.58, 0.04);
  k.bx(fab, 0, 0.58, -0.215, 0.36, 0.38, 0.04); k.bx(wood, 0, 1.0, -0.21, 0.46, 0.05, 0.05);
  k.blob(0, 0, 0.8, 0.8);
}
export function armchair(k, fab = 'fabSage') {
  legs(k, 0.78, 0.78, 0.12, 0.03, 'woodDark', 0.06);
  k.bx(fab, 0, 0.12, 0, 0.84, 0.28, 0.84); k.bx(fab, 0, 0.4, 0.05, 0.6, 0.12, 0.66);
  k.box(fab, 0, 0.72, -0.34, 0.8, 0.62, 0.16, 0, -0.12);
  for (const sx of [-1, 1]) { k.bx(fab, sx * 0.35, 0.4, 0, 0.14, 0.22, 0.8); k.geo(fab, G.cyl(10), sx * 0.35, 0.64, 0, 0.1, 0.8, 0.1, 0, H); }
  k.blob(0, 0, 1.2, 1.2);
}
export function sofa(k, fab = 'fabCream', w = 2.2, cush = 3) {
  legs(k, w, 0.88, 0.12, 0.03, 'woodDark', 0.08);
  k.bx(fab, 0, 0.12, 0, w, 0.28, 0.9);
  const cw = (w - 0.34) / cush;
  for (let i = 0; i < cush; i++) { const x = -w / 2 + 0.17 + cw * (i + 0.5); k.bx(fab, x, 0.4, 0.06, cw - 0.03, 0.13, 0.68); k.box(fab, x, 0.78, -0.3, cw - 0.04, 0.46, 0.18, 0, -0.14); }
  k.bx(fab, 0, 0.4, -0.38, w, 0.62, 0.14);
  for (const sx of [-1, 1]) { k.bx(fab, sx * (w / 2 - 0.08), 0.4, 0, 0.16, 0.24, 0.88); k.geo(fab, G.cyl(10), sx * (w / 2 - 0.08), 0.66, 0.02, 0.11, 0.86, 0.11, 0, H); }
  k.bx('linen', -w / 2 + 0.45, 0.53, -0.18, 0.4, 0.34, 0.12); k.bx('fabGold', w / 2 - 0.45, 0.53, -0.18, 0.4, 0.34, 0.12);
  k.blob(0, 0, w + 0.5, 1.3);
}
export function coffeeTable(k, w = 1.3, d = 0.7, top = 'marbleW') {
  legs(k, w, d, 0.4, 0.03, 'woodDark', 0.06); k.bx('woodDark', 0, 0.36, 0, w - 0.05, 0.06, d - 0.05); k.bx(top, 0, 0.42, 0, w, 0.04, d);
  k.bx('woodDark', 0, 0.1, 0, w - 0.1, 0.03, d - 0.1);
  k.bx('books', -w / 4, 0.46, 0, 0.3, 0.06, 0.22); k.cyl('porcelain', w / 4, 0.46, 0, 0.08, 0.2, 10, 0.7);
  k.blob(0, 0, w + 0.4, d + 0.4);
}
export function sideTable(k, lamp = true) {
  k.cyl('woodDark', 0, 0, 0, 0.06, 0.6, 8); k.cyl('woodDark', 0, 0, 0, 0.2, 0.05, 12); k.cyl('marbleW', 0, 0.6, 0, 0.26, 0.04, 16);
  if (lamp) tableLamp(sub(k, 0, 0, 0, 0.64));
}
export function tableLamp(k, shade = 'fabCream') {
  k.geo('porcelain', G.lathe('lampbase', [[0, 0], [0.08, 0], [0.1, 0.1], [0.07, 0.25], [0.03, 0.32], [0, 0.32]], 10), 0, 0, 0);
  k.cyl('gold', 0, 0.32, 0, 0.012, 0.12, 6); k.cyl(shade, 0, 0.42, 0, 0.17, 0.2, 12, 0.6);
  k.cyl('glow', 0, 0.4, 0, 0.06, 0.03, 8);
}
export function roundTable(k, r = 0.6, top = 'woodDark', h = 0.75) {
  k.cyl('woodDark', 0, 0, 0, r * 0.45, 0.06, 14); k.cyl('woodDark', 0, 0.06, 0, 0.06, h - 0.1, 8, 1.4); k.cyl(top, 0, h - 0.04, 0, r, 0.04, 20);
  k.blob(0, 0, r * 2.4, r * 2.4);
}
export function teaSet(k, y = 0.75) {
  k.cyl('porcelain', 0, y, 0, 0.07, 0.12, 10, 0.8); k.cyl('porcelain', 0, y + 0.12, 0, 0.03, 0.03, 6);
  for (let i = 0; i < 3; i++) { const a = i * 2.1; k.cyl('porcelain', Math.sin(a) * 0.25, y, Math.cos(a) * 0.25, 0.04, 0.05, 8, 1.2); }
}
export function flowers(k, y, r = 0.3, cols = ['fabRose', 'linen', 'fabBurg']) {
  k.geo('porcelain', G.lathe('vase', [[0, 0], [0.1, 0], [0.16, 0.12], [0.14, 0.3], [0.08, 0.38], [0.11, 0.44], [0, 0.44]], 12), 0, y, 0, r / 0.3, r / 0.3, r / 0.3);
  const yy = y + 0.44 * r / 0.3; k.sph('foliage', 0, yy + r * 0.3, 0, r * 1.1, r * 0.8, r * 1.1, 8, 6);
  for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = r * (0.3 + (i % 3) * 0.3); k.sph(cols[i % cols.length], Math.sin(a) * rr, yy + r * (0.55 + (i % 2) * 0.25), Math.cos(a) * rr, r * 0.28, r * 0.24, r * 0.28, 6, 4); }
}
export function diningTable(k, len = 11, wid = 1.6, chairFab = 'fabBurg') {
  k.bx('mahogany', 0, 0.68, 0, len, 0.07, wid); k.bx('mahogany', 0, 0.58, 0, len - 0.3, 0.1, wid - 0.2);
  const nl = Math.round(len / 2.2);
  for (let i = 0; i <= nl; i++) for (const sz of [-1, 1]) { const x = -len / 2 + 0.25 + (len - 0.5) * i / nl; k.cyl('mahogany', x, 0, sz * (wid / 2 - 0.12), 0.05, 0.62, 8, 0.7); }
  k.bx('linen', 0, 0.751, 0, len - 1.2, 0.01, 0.5);
  for (let i = -1; i <= 1; i++) {
    if (i === 0) flowers(sub(k, 0, 0), 0.755, 0.22, ['fabRose', 'linen', 'fabGold']);
    else { const c = sub(k, i * len / 3.4, 0); c.cyl('gold', 0, 0.755, 0, 0.1, 0.03, 10); c.cyl('gold', 0, 0.78, 0, 0.02, 0.45, 6);
      c.box('gold', 0, 1.15, 0, 0.5, 0.025, 0.025); for (const dx of [-0.25, 0, 0.25]) { c.cyl('porcelain', dx, 1.16, 0, 0.018, 0.16, 6); c.cyl('glow', dx, 1.32, 0, 0.012, 0.03, 4); } }
  }
  const n = Math.floor((len - 1.4) / 1.25);
  for (let i = 0; i < n; i++) { const x = -((n - 1) * 1.25) / 2 + i * 1.25;
    chair(sub(k, x, wid / 2 + 0.28, PI), chairFab); chair(sub(k, x, -wid / 2 - 0.28, 0), chairFab);
    for (const sz of [-1, 1]) { const p = sub(k, x, sz * (wid / 2 - 0.3)); p.cyl('porcelain', 0, 0.755, 0, 0.14, 0.012, 16); p.cyl('gold', 0.2, 0.755, 0, 0.012, 0.01, 4); }
  }
  chair(sub(k, len / 2 + 0.35, 0, -H), chairFab); chair(sub(k, -len / 2 - 0.35, 0, H), chairFab);
  k.blob(0, 0, len + 1.6, wid + 1.8);
}
export function sideboard(k, w = 2.4, mat = 'woodDark') {
  legs(k, w, 0.5, 0.15, 0.03, mat, 0.08);
  k.bx(mat, 0, 0.15, 0, w, 0.75, 0.5); k.bx('marbleW', 0, 0.9, 0, w + 0.06, 0.04, 0.54);
  const n = Math.max(2, Math.round(w / 0.6));
  for (let i = 0; i < n; i++) { const x = -w / 2 + w * (i + 0.5) / n; k.bx(mat, x, 0.22, 0.255, w / n - 0.06, 0.6, 0.02); k.bx('gold', x, 0.55, 0.27, 0.05, 0.05, 0.02); }
  flowers(sub(k, -w / 3, 0), 0.94, 0.16); tableLamp(sub(k, w / 3, 0, 0, 0.94));
  k.blob(0, 0.1, w + 0.4, 0.9);
}
export function fireplace(k, w = 2.0) {
  // 背靠墙（局部 -z），面朝 +z
  k.bx('marbleW', 0, 0, 0.05, w + 0.4, 0.04, 0.9);
  for (const sx of [-1, 1]) k.bx('marbleW', sx * (w / 2 - 0.15), 0, -0.05, 0.3, 1.15, 0.36);
  k.bx('marbleW', 0, 1.1, -0.05, w, 0.3, 0.38); k.bx('marbleW', 0, 1.4, -0.03, w + 0.25, 0.07, 0.48);
  k.bx('cap', 0, 0.02, -0.15, w - 0.6, 1.08, 0.12); k.bx('glow', 0, 0.06, -0.08, w - 0.9, 0.12, 0.2);
  k.bx('gold', 0, 1.55, -0.2, w - 0.3, 1.35, 0.05); k.bx('glass', 0, 1.62, -0.17, w - 0.5, 1.2, 0.02);
  k.cyl('gold', -w / 2 + 0.35, 1.47, 0, 0.05, 0.3, 6); k.cyl('gold', w / 2 - 0.35, 1.47, 0, 0.05, 0.3, 6);
  k.bx('woodDark', 0, 1.47, 0, 0.3, 0.32, 0.14); k.cyl('porcelain', 0, 1.62, 0.07, 0.09, 0.02, 12, 1, 1, 1, H);
}
export function piano(k) {
  const g = G.extrude('piano', () => { const s = new THREE.Shape(); s.moveTo(-0.75, 0); s.lineTo(0.75, 0); s.lineTo(0.75, 0.35);
    s.bezierCurveTo(0.72, 0.95, 0.15, 1.05, 0.05, 1.55); s.bezierCurveTo(-0.05, 1.95, -0.25, 2.1, -0.55, 2.1); s.lineTo(-0.75, 2.05); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 10 }).rotateX(-H); });
  k.geo('piano', g, 0, 0.62, 0.3, 1, 0.32, 1);
  k.geo('piano', g, 0.75, 0.96, 0.3, 1, 0.025, 1, 0, 0, 0.55); // 琴盖（开）
  k.box('woodDark', 0.55, 1.2, -0.7, 0.02, 0.62, 0.02, 0, 0, 0.3);
  for (const [x, z] of [[-0.6, 0.15], [0.6, 0.15], [-0.4, -1.6]]) k.cyl('piano', x, 0, z, 0.06, 0.62, 8, 1.3);
  k.bx('porcelain', 0, 0.9, 0.42, 1.36, 0.04, 0.2); for (let i = 0; i < 18; i++) k.bx('piano', -0.62 + i * 0.075, 0.94, 0.37, 0.03, 0.02, 0.1);
  k.bx('piano', 0, 0.94, 0.32, 1.1, 0.25, 0.02);
  k.bx('piano', 0, 0.45, 0.95, 0.8, 0.06, 0.38); legs(sub(k, 0, 0.95), 0.72, 0.3, 0.45, 0.025, 'piano', 0.04); k.bx('leather', 0, 0.51, 0.95, 0.76, 0.04, 0.34);
  k.blob(0, -0.6, 2.2, 3.0);
}
export function chandelier(k, y, r = 1.0, tiers = 2, ceil = 1.2) {
  k.cyl('ormolu', 0, y, 0, 0.025, ceil, 6);
  k.geo('ormolu', G.lathe('chbody', [[0, -0.5], [0.12, -0.35], [0.18, -0.1], [0.08, 0.05], [0.1, 0.2], [0, 0.3]], 10), 0, y, 0, r, r, r);
  for (let t = 0; t < tiers; t++) {
    const rr = r * (1 - t * 0.38), yy = y - 0.12 * r + t * 0.32 * r, n = 8 - t * 2;
    k.geo('ormolu', G.tor(PI * 2, 5, 24, 0.03), 0, yy, 0, rr, rr, rr);
    for (let i = 0; i < n; i++) { const a = i * 2 * PI / n; const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      k.cyl('porcelain', x, yy, z, 0.025 * r + 0.01, 0.14 * r, 6); k.sph('glow', x, yy + 0.17 * r, z, 0.035 * r + 0.01, 0.05 * r + 0.015, 0.035 * r + 0.01, 6, 4);
      k.sph('glow', x * 0.8, yy - 0.18 * r, z * 0.8, 0.03 * r, 0.06 * r, 0.03 * r, 6, 4); }
  }
}
export function pendant(k, y, drop = 0.9) { k.cyl('iron', 0, y, 0, 0.012, drop, 4); k.cyl('ormolu', 0, y - 0.25, 0, 0.28, 0.25, 12, 0.3); k.cyl('glow', 0, y - 0.28, 0, 0.12, 0.04, 8); }
export function bench(k, len = 2.0, fab = 'fabBurg') {
  legs(k, len, 0.5, 0.35, 0.03, 'woodDark', 0.08); k.bx('woodDark', 0, 0.32, 0, len, 0.06, 0.5); k.bx(fab, 0, 0.38, 0, len - 0.04, 0.1, 0.46);
  k.blob(0, 0, len + 0.4, 0.9);
}
export function plant(k, h = 1.6, pot = 'urn') {
  if (pot === 'urn') k.inst('urn', 0, 0, 0, 0.7, 0.7, 0.7); else k.cyl('terracotta', 0, 0, 0, 0.28, 0.5, 10, 1.25);
  const top = pot === 'urn' ? 0.62 : 0.48;
  k.cyl('bark', 0, top, 0, 0.04, h * 0.55, 5, 0.6);
  for (let i = 0; i < 7; i++) { const a = i * 0.9; k.sph('foliage', Math.sin(a) * 0.32, top + h * 0.55 - 0.02, Math.cos(a) * 0.32, 0.12, 0.05, 0.5, 6, 4); }
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.45; const g = sub(k, 0, 0, a, top + h * 0.55); g.box('foliage', 0, 0.02, 0.35, 0.16, 0.03, 0.72, 0, 0.45); }
  k.blob(0, 0, 1.0, 1.0);
}
export function topiaryPot(k, h = 1.2) {
  k.bx('paint', 0, 0, 0, 0.8, 0.7, 0.8); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.bx('paintSage', sx * 0.38, 0, sz * 0.38, 0.1, 0.8, 0.1); k.sph('gold', sx * 0.38, 0.84, sz * 0.38, 0.06, 0.06, 0.06, 6, 4); }
  k.cyl('bark', 0, 0.7, 0, 0.05, h * 0.5, 5); k.inst('ball', 0, 0.7 + h * 0.55 + 0.35, 0, 0.55, 0.5, 0.55, 0, '#6f8f4e');
  for (let i = 0; i < 6; i++) { const a = i * 1.05; k.sph('fabGold', Math.sin(a) * 0.45, 0.7 + h * 0.55 + 0.3 + (i % 2) * 0.2, Math.cos(a) * 0.45, 0.06, 0.06, 0.06, 5, 4); }
  k.blob(0, 0, 1.3, 1.3);
}
export function bookshelf(k, w = 2.0, h = 2.5, d = 0.42) {
  k.bx('woodDark', 0, 0, 0, w, 0.12, d); k.bx('woodDark', 0, h - 0.1, 0, w + 0.1, 0.14, d + 0.06);
  for (const sx of [-1, 1]) k.bx('woodDark', sx * (w / 2 - 0.03), 0, 0, 0.06, h, d);
  k.bx('woodDark', 0, 0, -d / 2 + 0.02, w, h, 0.03);
  const rows = Math.floor((h - 0.3) / 0.4);
  for (let i = 0; i < rows; i++) { const y = 0.12 + i * 0.4; k.bx('woodDark', 0, y, 0, w - 0.08, 0.03, d - 0.02); k.box('books', 0, y + 0.17, 0.02, w - 0.14, 0.3, d - 0.12); }
  k.blob(0, 0.05, w + 0.3, d + 0.4);
}
export function desk(k, w = 1.9, d = 0.95, chairFab = 'leather') {
  for (const sx of [-1, 1]) { k.bx('woodDark', sx * (w / 2 - 0.25), 0, 0, 0.46, 0.72, d - 0.05); for (let i = 0; i < 3; i++) k.bx('gold', sx * (w / 2 - 0.25), 0.15 + i * 0.2, (d - 0.05) / 2 + 0.01, 0.06, 0.03, 0.02); }
  k.bx('woodDark', 0, 0.72, 0, w, 0.05, d); k.bx('leatherG', 0, 0.771, 0, w - 0.3, 0.005, d - 0.3);
  k.bx('linen', -0.1, 0.776, 0.1, 0.3, 0.01, 0.22); k.bx('gold', 0.3, 0.776, -0.2, 0.2, 0.05, 0.1);
  const l = sub(k, -w / 2 + 0.3, -d / 2 + 0.25, 0, 0.77); l.cyl('gold', 0, 0, 0, 0.08, 0.02, 10); l.cyl('gold', 0, 0.02, 0, 0.012, 0.35, 6); l.geo('leatherG', G.cyl(12, 1, true), 0, 0.4, 0, 0.14, 0.08, 0.08, 0, 0, H); l.cyl('glow', 0, 0.36, 0, 0.1, 0.02, 6);
  armchair(sub(k, 0, -d / 2 - 0.55, 0), chairFab === 'leather' ? 'leather' : chairFab);
  k.blob(0, 0, w + 0.4, d + 0.4);
}
export function globe(k) {
  for (let i = 0; i < 3; i++) { const a = i * 2.09; k.box('woodDark', Math.sin(a) * 0.2, 0.3, Math.cos(a) * 0.2, 0.04, 0.62, 0.04, a, 0.3); }
  k.geo('woodDark', G.tor(PI * 2, 5, 24, 0.12), 0, 0.62, 0, 0.36, 0.36, 0.36);
  k.sph('paintSage', 0, 0.95, 0, 0.3, 0.3, 0.3, 16, 12); k.geo('gold', new THREE.TorusGeometry(1, 0.03, 4, 24), 0, 0.95, 0, 0.33, 0.33, 0.33, 0.4);
  k.blob(0, 0, 0.9, 0.9);
}
export function bed(k, w = 1.9, l = 2.2, fab = 'fabSage', poster = false) {
  k.bx('woodDark', 0, 0.08, l / 2, w + 0.1, 0.3, l); legs(sub(k, 0, l / 2), w + 0.05, l - 0.05, 0.1, 0.05, 'woodDark', 0.05);
  k.bx('linen', 0, 0.38, l / 2, w - 0.04, 0.22, l - 0.08);
  k.bx(fab, 0, 0.5, l / 2 + 0.22, w + 0.08, 0.14, l - 0.5); k.bx(fab, 0, 0.18, l - 0.02, w + 0.08, 0.44, 0.04); for (const sx of [-1, 1]) k.bx(fab, sx * (w / 2 + 0.03), 0.18, l / 2 + 0.22, 0.04, 0.44, l - 0.5);
  k.bx('linen', 0, 0.62, 0.62, w + 0.08, 0.03, 0.4);
  for (const sx of [-1, 1]) { k.sph('linen', sx * w / 4, 0.7, 0.3, w / 4.4, 0.12, 0.2, 10, 6); k.sph(fab === 'linen' ? 'fabCream' : 'fabGold', sx * w / 5, 0.72, 0.5, w / 7, 0.12, 0.08, 10, 6); }
  // 床头板
  k.bx('woodDark', 0, 0, 0.03, w + 0.3, 1.25, 0.08); k.bx(fab, 0, 0.5, 0.08, w + 0.1, 0.7, 0.06); k.geo(fab, G.seg(), 0, 1.25, 0.05, (w + 0.3) / 2, 0.3, 0.1);
  k.bx('woodDark', 0, 0, l + 0.02, w + 0.2, 0.55, 0.06);
  if (poster) {
    for (const sx of [-1, 1]) for (const z of [0.05, l]) { k.cyl('woodDark', sx * (w / 2 + 0.1), 0, z, 0.05, 2.3, 8, 0.8); k.sph('gold', sx * (w / 2 + 0.1), 2.33, z, 0.07, 0.07, 0.07, 6, 4); }
    for (const sx of [-1, 1]) k.bx('woodDark', sx * (w / 2 + 0.1), 2.2, l / 2, 0.08, 0.12, l);
    for (const z of [0.05, l]) k.bx('woodDark', 0, 2.2, z, w + 0.28, 0.12, 0.08);
  }
  k.blob(0, l / 2, w + 0.8, l + 0.6);
}
export function nightstand(k) {
  k.bx('woodDark', 0, 0.06, 0, 0.5, 0.52, 0.42); legs(k, 0.48, 0.4, 0.08, 0.02); k.bx('marbleW', 0, 0.58, 0, 0.54, 0.03, 0.46);
  k.bx('woodDark', 0, 0.36, 0.215, 0.42, 0.16, 0.01); k.bx('gold', 0, 0.44, 0.225, 0.08, 0.02, 0.02);
  tableLamp(sub(k, 0, 0, 0, 0.61));
}
export function wardrobe(k, w = 1.6, mat = 'woodDark') {
  k.bx(mat, 0, 0.1, 0, w, 2.1, 0.62); legs(k, w - 0.05, 0.56, 0.12, 0.04, mat, 0.04);
  k.bx(mat, 0, 2.18, 0, w + 0.12, 0.12, 0.7); k.bx('trim', 0, 2.2, 0.0, w + 0.02, 0.05, 0.66);
  k.bx(mat === 'paint' ? 'paintSage' : 'woodMid', 0, 0.2, 0.312, w - 0.12, 1.85, 0.01); k.bx(mat, 0, 0.2, 0.318, 0.03, 1.85, 0.01);
  for (const sx of [-1, 1]) k.bx('gold', sx * 0.06, 1.1, 0.33, 0.03, 0.2, 0.02);
  k.blob(0, 0.05, w + 0.4, 1.0);
}
export function vanity(k) {
  legs(k, 1.1, 0.45, 0.72, 0.022, 'paint', 0.05); k.bx('paint', 0, 0.62, 0, 1.15, 0.14, 0.5); k.bx('marbleW', 0, 0.76, 0, 1.2, 0.03, 0.52);
  k.geo('gold', new THREE.TorusGeometry(1, 0.05, 6, 28), 0, 1.35, -0.2, 0.36, 0.48, 0.5); k.geo('glass', G.cyl(24), 0, 1.35, -0.21, 0.35, 0.02, 0.47, 0, H);
  k.cyl('porcelain', -0.35, 0.79, 0.05, 0.04, 0.12, 8); k.cyl('gold', 0.35, 0.79, 0.05, 0.05, 0.08, 8);
  const s = sub(k, 0, 0.55); legs(s, 0.4, 0.34, 0.42, 0.02, 'paint', 0.03); s.bx('fabRose', 0, 0.4, 0, 0.44, 0.1, 0.36);
  k.blob(0, 0.2, 1.5, 1.2);
}
export function tub(k) {
  k.geo('porcelain', G.cyl(28), 0, 0.42, 0, 0.9, 0.56, 0.42); k.geo('porcelain', G.tor(PI * 2, 6, 28, 0.05), 0, 0.7, 0, 0.9, 0.9, 0.42);
  k.geo('water', G.cyl(28), 0, 0.66, 0, 0.8, 0.02, 0.33);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.sph('gold', sx * 0.62, 0.1, sz * 0.24, 0.07, 0.1, 0.07, 6, 4);
  k.cyl('gold', 0.9, 0.1, 0, 0.03, 1.0, 6); k.box('gold', 0.8, 1.08, 0, 0.25, 0.04, 0.04);
  k.blob(0, 0, 2.3, 1.2);
}
export function basins(k, w = 2.6) {
  k.bx('paint', 0, 0.1, 0, w, 0.75, 0.56); k.bx('marbleW', 0, 0.85, 0.02, w + 0.1, 0.05, 0.6); legs(k, w - 0.05, 0.5, 0.1, 0.03, 'gold', 0.04);
  for (const sx of [-1, 1]) { const x = sx * w / 4; k.cyl('porcelain', x, 0.9, 0.04, 0.22, 0.08, 16, 1.1); k.geo('water', G.cyl(16), x, 0.975, 0.04, 0.18, 0.01, 0.18);
    k.cyl('gold', x, 0.9, -0.2, 0.02, 0.22, 6); k.box('gold', x, 1.1, -0.13, 0.03, 0.03, 0.15);
    k.bx('gold', x, 1.3, -0.25, 0.72, 1.0, 0.04); k.bx('glass', x, 1.35, -0.23, 0.62, 0.9, 0.01); }
  k.blob(0, 0.05, w + 0.4, 1.0);
}
export function cabinetGlass(k, w = 1.5) {
  k.bx('woodMid', 0, 0, 0, w, 2.1, 0.45); k.bx('woodMid', 0, 2.1, 0, w + 0.1, 0.1, 0.5);
  for (let i = 0; i < 4; i++) { k.bx('woodMid', 0, 0.9 + i * 0.3, 0, w - 0.08, 0.02, 0.4); for (let j = 0; j < 4; j++) k.cyl('porcelain', -w / 2 + 0.25 + j * (w - 0.5) / 3, 0.92 + i * 0.3, 0.02, 0.06, 0.13, 8, 0.7); }
  k.bx('glass', 0, 0.85, 0.226, w - 0.1, 1.2, 0.01); k.bx('woodMid', 0, 0.85, 0.232, 0.03, 1.2, 0.01);
  k.blob(0, 0.05, w + 0.3, 0.8);
}
export function screenFold(k, fab = 'fabSage') {
  for (let i = 0; i < 4; i++) { const x = -0.75 + i * 0.5, a = (i % 2 ? 0.35 : -0.35); k.box('woodDark', x, 0.95, 0, 0.5, 1.8, 0.04, a); k.box(fab, x, 1.0, 0, 0.42, 1.55, 0.05, a); }
}
export function filing(k, n = 3) { for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.56; k.bx('paintSage', x, 0, 0, 0.52, 1.3, 0.6); for (let j = 0; j < 4; j++) { k.bx('paint', x, 0.1 + j * 0.3, 0.301, 0.46, 0.26, 0.01); k.bx('gold', x, 0.28 + j * 0.3, 0.31, 0.1, 0.02, 0.02); } } k.blob(0, 0, n * 0.56 + 0.3, 0.9); }
export function rack(k, w = 3.0) {
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) k.bx('iron', sx * (w / 2 - 0.03), 0, sz * 0.25, 0.04, 2.0, 0.04);
  const cols = ['linen', 'fabCream', 'fabSage', 'linen', 'fabRose', 'fabNavy'];
  for (let i = 0; i < 4; i++) { const y = 0.15 + i * 0.5; k.bx('woodMid', 0, y, 0, w, 0.03, 0.56);
    for (let j = 0; j < 6; j++) { const x = -w / 2 + 0.3 + j * (w - 0.6) / 5; if ((i + j) % 4 === 3) { k.cyl('woodMid', x, y + 0.03, 0, 0.2, 0.3, 10, 1.1); continue; } for (let s = 0; s < 3; s++) k.bx(cols[(i * 3 + j + s) % 6], x, y + 0.03 + s * 0.09, 0, 0.36, 0.08, 0.42); } }
  k.blob(0, 0, w + 0.3, 0.9);
}
export function workTable(k, w = 2.6, d = 1.1, top = 'marbleW') { legs(k, w, d, 0.85, 0.04, 'paint', 0.08); k.bx('paint', 0, 0.75, 0, w - 0.1, 0.1, d - 0.1); k.bx(top, 0, 0.85, 0, w, 0.05, d); k.bx('paint', 0, 0.15, 0, w - 0.2, 0.03, d - 0.2); k.blob(0, 0, w + 0.4, d + 0.4); }
export function counter(k, w = 4, d = 0.65) { k.bx('paint', 0, 0, 0, w, 0.85, d); k.bx('marbleW', 0, 0.85, 0.02, w + 0.04, 0.05, d + 0.04); for (let i = 0; i < Math.floor(w / 0.6); i++) { const x = -w / 2 + 0.3 + i * 0.6; k.bx('paintSage', x, 0.08, d / 2 + 0.005, 0.54, 0.68, 0.01); k.bx('gold', x, 0.62, d / 2 + 0.015, 0.1, 0.02, 0.02); } }
export function washTub(k) { k.cyl('woodMid', 0, 0, 0, 0.45, 0.7, 14, 1.12); k.geo('iron', G.tor(PI * 2, 4, 20, 0.04), 0, 0.2, 0, 0.47, 0.47, 0.47); k.geo('iron', G.tor(PI * 2, 4, 20, 0.04), 0, 0.55, 0, 0.5, 0.5, 0.5); k.geo('water', G.cyl(14), 0, 0.62, 0, 0.44, 0.01, 0.44); k.blob(0, 0, 1.3, 1.3); }
export function serverRack(k) { k.bx('iron', 0, 0, 0, 0.62, 2.0, 0.9); for (let i = 0; i < 10; i++) { k.bx('cap', 0, 0.15 + i * 0.18, 0.451, 0.54, 0.14, 0.01); k.bx('led', -0.2 + (i % 3) * 0.05, 0.2 + i * 0.18, 0.456, 0.03, 0.02, 0.01); } k.blob(0, 0, 0.9, 1.2); }
export function monitorDesk(k, R = 3.4, n = 5) {
  for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * 0.36; const s = sub(k, Math.sin(a) * R, -Math.cos(a) * R + R, a);
    s.bx('iron', 0, 0, 0, 1.2, 0.72, 0.7); s.bx('woodDark', 0, 0.72, 0.02, 1.26, 0.04, 0.8);
    for (const dx of [-0.3, 0.3]) { s.cyl('iron', dx, 0.76, -0.25, 0.015, 0.25, 4); s.box('iron', dx, 1.2, -0.27, 0.56, 0.36, 0.04, 0, -0.08); s.box('screen', dx, 1.2, -0.245, 0.52, 0.32, 0.01, 0, -0.08); }
    s.bx('cap', 0, 0.76, 0.1, 0.45, 0.02, 0.16);
    if (i % 2 === 0) chair(sub(s, 0, 0.75, PI), 'fabNavy', 'iron');
  }
}

export function cardTable(k, fab = 'fabGold') {
  legs(k, 0.9, 0.9, 0.72, 0.03); k.bx('woodDark', 0, 0.68, 0, 0.92, 0.06, 0.92); k.bx('leatherG', 0, 0.741, 0, 0.8, 0.005, 0.8);
  for (let i = 0; i < 4; i++) chair(sub(k, Math.sin(i * H) * 0.8, Math.cos(i * H) * 0.8, i * H + PI), fab);
  k.blob(0, 0, 2.4, 2.4);
}
export function consoleT(k, w = 1.6, mirror = true) {
  legs(k, w, 0.42, 0.82, 0.025, 'gold', 0.05); k.bx('gold', 0, 0.74, 0, w, 0.08, 0.42); k.bx('marbleW', 0, 0.82, 0, w + 0.06, 0.04, 0.46);
  flowers(sub(k, -w / 4, 0), 0.86, 0.14); k.cyl('gold', w / 4, 0.86, 0, 0.05, 0.3, 6);
  if (mirror) { k.bx('gold', 0, 1.1, -0.19, w * 0.8, 1.2, 0.04); k.bx('glass', 0, 1.18, -0.165, w * 0.8 - 0.14, 1.06, 0.01); }
  k.blob(0, 0, w + 0.4, 0.8);
}
export function telescope(k) {
  for (let i = 0; i < 3; i++) { const a = i * 2.09; k.box('woodMid', Math.sin(a) * 0.3, 0.6, Math.cos(a) * 0.3, 0.035, 1.25, 0.035, a, 0.25); }
  k.geo('gold', G.cyl(12), 0, 1.35, 0.1, 0.07, 1.5, 0.07, 0, -1.2); k.geo('gold', G.cyl(12), 0, 1.66, 0.72, 0.1, 0.25, 0.1, 0, -1.2);
  k.blob(0, 0, 1.2, 1.2);
}

/* ---------------- 房间布置 ---------------- */
export function furnish(b, fi) {
  const y = FLOORS[fi].y, A = at(b, y);
  const rug = (key, x, z, w, d) => b.add(key, G.plane, new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.03, z), new THREE.Quaternion(), new THREE.Vector3(w, 1, d)));
  const K = (x, z, ry = 0) => new Kit(b, x, y, z, ry);
  const ceilY = (h) => h;
  if (fi === 0) {
    // 大厅
    A(flowers, 0, 5, 0, 0.8, 0.45, ['fabRose', 'linen', 'fabGold']); A(roundTable, 0, 5, 0, 1.2, 'marbleW', 0.8);
    rug('rugNavy', 0, 5, 7, 7);
    for (const sx of [-1, 1]) { A(bench, sx * 12.8, 1, sx * -H, 2.2); A(plant, sx * 12, 11.8, 0, 1.8); A(plant, sx * 12, -1.8, 0, 1.6);
      const k = K(sx * 6.6, -2.3); k.bx('trim', 0, 0, 0, 0.8, 1.1, 0.8); k.inst('urn', 0, 1.1, 0, 1.1, 1.1, 1.1); }
    chandelier(K(0, 5), 4.6, 1.5, 3, 1.4);
    rug('rugBurg', 0, 11, 3, 3.4); for (const sx of [-1, 1]) { const k = K(sx * 2.6, 12.1); k.bx('trim', 0, 0, 0, 0.7, 1.2, 0.7); k.inst('urn', 0, 1.2, 0, 1, 1, 1); A(consoleT, sx * 13.45, 9.4, sx > 0 ? -H : H, 1.8, true); }
    for (const sx of [-1, 1]) chandelier(K(sx * 8, -0.6), 4.8, 0.7, 2, 1.2);
    // 楼梯厅
    for (const sx of [-1, 1]) { A(armchair, sx * 12, -5.6, sx > 0 ? -H : H, 'fabBurg'); A(sideTable, sx * 12, -7.2, 0); A(plant, sx * 12.2, -11.8, 0, 1.4); }
    // 会客厅
    A(fireplace, -14.4, -1.5, -H, 2.6); rug('rugBurg', -19.5, -1.5, 6.5, 6);
    A(sofa, -23, -1.5, H, 'fabCream', 2.6, 3); A(armchair, -19.2, -4.6, 0, 'fabSage'); A(armchair, -19.2, 1.6, PI, 'fabSage'); A(coffeeTable, -19.5, -1.5, H, 1.4, 0.75);
    A(sideTable, -23, 0.4, 0); A(sideTable, -23, -3.4, 0);
    rug('rugSage', -30, 7, 7, 6); A(sofa, -30, 9.6, PI, 'fabNavy', 2.4, 3); A(sofa, -30, 4.4, 0, 'fabNavy', 2.4, 3); A(coffeeTable, -30, 7, 0, 1.4, 0.8);
    A(armchair, -33.8, 7, H, 'fabGold'); A(armchair, -26.2, 7, -H, 'fabGold');
    rug('rugNavy', -29, -7.5, 5.5, 5.5); A(piano, -29.5, -6.2, 0.35);
    A(cabinetGlass, -34, -12.2, 0, 1.6); A(cabinetGlass, -16.5, -12.2, 0, 1.6);
    A(cardTable, -19.5, 9.6, 0.2); A(consoleT, -14.5, 5, -H, 1.8, false); A(sideTable, -22.5, 11.8, 0); A(plant, -26, 12.1, 0, 1.4);
    A(plant, -36.6, 12, 0, 1.8); A(plant, -15.4, 12, 0, 1.6); A(plant, -36.6, -12, 0, 1.6); A(screenFold, -36.4, -4, H, 'fabRose');
    chandelier(K(-30, 7), 4.4, 1.0, 2, 1.6); chandelier(K(-19.5, -1.5), 4.4, 0.9, 2, 1.6); chandelier(K(-29, -7), 4.4, 0.8, 2, 1.6);
    // 餐厅
    rug('rugBurg', 26, 4.5, 14, 5.2); A(diningTable, 26, 4.5, 0, 11, 1.6, 'fabBurg');
    A(sideboard, 26, -3.45, 0, 2.8); A(sideboard, 15.2, 4.5, H, 2.2); A(fireplace, 37.5, 4, -H, 1.9);
    for (const [x, z] of [[15.2, 12], [37, 12], [15.2, -3.2], [37, -3.2]]) A(plant, x, z, 0, 1.6);
    chandelier(K(22.5, 4.5), 4.2, 1.0, 2, 1.8); chandelier(K(29.5, 4.5), 4.2, 1.0, 2, 1.8);
    // 备餐间
    A(counter, 20, -12.15, 0, 11); A(workTable, 20, -8, 0, 3.2, 1.2); A(cabinetGlass, 14.55, -11.2, H, 1.4); A(counter, 25.4, -6.8, -H, 3.5);
    for (let i = 0; i < 3; i++) pendant(K(18.5 + i * 1.5, -8), 3.8, 1.2);
    // 仆从值班室
    A(desk, 32, -7, PI, 1.6, 0.8, 'fabNavy'); A(wardrobe, 37.2, -11.2, -H, 1.2, 'paint'); A(wardrobe, 37.2, -9.6, -H, 1.2, 'paint');
    A(roundTable, 29, -10.5, 0, 0.55); A(chair, 28.2, -10.5, H, 'fabNavy'); A(chair, 29.8, -10.5, -H, 'fabNavy');
    { const k = K(34.5, -4.35, PI); k.bx('woodDark', 0, 1.3, 0, 1.6, 0.9, 0.06); for (let i = 0; i < 12; i++) k.sph('gold', -0.6 + (i % 6) * 0.24, 1.55 + Math.floor(i / 6) * 0.35, 0.04, 0.04, 0.04, 0.02, 6, 4); }
    A(bench, 30.5, -12.3, 0, 2.0, 'fabNavy');
  }
  if (fi === 1) {
    // 起居 / 茶室
    rug('rugRose', 0, 4.5, 8, 6); A(sofa, -3.3, 4.5, H, 'fabCream', 2.4); A(sofa, 3.3, 4.5, -H, 'fabCream', 2.4); A(coffeeTable, 0, 4.5, H, 1.4, 0.7);
    for (const [x, z] of [[-9.5, 9.5], [9.5, 9.5], [-9.5, 1.2], [9.5, 1.2]]) { A(roundTable, x, z, 0, 0.55, 'marbleW'); teaSet(K(x, z)); A(chair, x - 0.95, z, H, 'fabSage'); A(chair, x + 0.95, z, -H, 'fabSage'); A(chair, x, z + 0.95, PI, 'fabSage'); }
    A(cabinetGlass, -9.5, -2.55, 0, 1.8); A(cabinetGlass, 9.5, -2.55, 0, 1.8); A(screenFold, -12.9, 5.2, H, 'fabGold');
    A(plant, -13, 12, 0, 1.6); A(plant, 13, 12, 0, 1.6); A(plant, 6.5, -2.3, 0, 1.3); A(plant, -6.5, -2.3, 0, 1.3);
    chandelier(K(0, 4.5), 3.3, 1.1, 2, 1.1);
    for (const sx of [-1, 1]) A(armchair, sx * 11, -5.8, sx > 0 ? -H : H, 'fabRose');
    // 客房 A / B（镜像）
    for (const [zs, ry, rk] of [[1, 0, 'rugSage'], [-1, PI, 'rugRose']]) {
      const z0 = zs * 0.2;
      rug(rk, -26, zs * 2.2, 4.4, 3.6); A(bed, -26, z0, ry, 1.9, 2.2, zs > 0 ? 'fabSage' : 'fabRose');
      A(nightstand, -27.55, zs * 0.45, ry); A(nightstand, -24.45, zs * 0.45, ry); A(bench, -26, zs * 2.9, ry, 1.6, zs > 0 ? 'fabSage' : 'fabRose');
      A(wardrobe, -14.55, zs * 10.8, -H, 1.8); A(vanity, -37.2, zs * 4, H);
      A(armchair, -34.2, zs * 10, zs > 0 ? PI * 0.75 : PI * 0.25, 'fabCream'); A(armchair, -31.4, zs * 11, zs > 0 ? -PI * 0.8 : -PI * 0.2, 'fabCream'); A(sideTable, -33, zs * 11.8, 0);
      A(desk, -15.2, zs * 2.2, -H, 1.4, 0.7, 'fabCream'); A(plant, -36.8, zs * 12, 0, 1.4);
      chandelier(K(-26, zs * 5.5), 3.2, 0.7, 1, 1.0);
    }
    // 书房
    for (const [z0, z1] of [[-12.3, -9.2], [-6.8, 3.6], [6.4, 12.3]]) { const n = Math.round((z1 - z0) / 2); for (let i = 0; i < n; i++) { const z = z0 + (z1 - z0) * (i + 0.5) / n; A(bookshelf, 14.4, z, H, (z1 - z0) / n - 0.04, 2.6); } }
    for (const x of [18, 22, 26, 30, 34]) A(bookshelf, x, -12.3, 0, 2.1, 2.6);
    A(fireplace, 37.5, 0, -H, 1.9); rug('rugBurg', 33.2, 0, 6, 6); A(sofa, 30.6, 0, H, 'fabBurg', 2.4); A(armchair, 34, -2.3, 0, 'leather'); A(armchair, 34, 2.3, PI, 'leather'); A(coffeeTable, 33.2, 0, H, 1.2, 0.6);
    rug('rugNavy', 26, 7.6, 6.5, 5); A(desk, 26, 8.2, PI, 2.2, 1.0);
    A(armchair, 25, 6.2, 0, 'fabSage'); A(armchair, 27, 6.2, 0, 'fabSage'); A(globe, 32.8, 9.6, 0);
    { const k = K(22, -4.5); k.bx('woodDark', 0, 0.72, 0, 1.3, 0.06, 4.2); legs(k, 1.2, 4.0, 0.72, 0.04); k.blob(0, 0, 2, 5);
      for (const dz of [-1.3, 0, 1.3]) { chair(sub(k, -0.95, dz, H), 'leather'); chair(sub(k, 0.95, dz, -H), 'leather'); }
      for (const dz of [-1.2, 1.2]) tableLamp(sub(k, 0, dz, 0, 0.78), 'leatherG'); k.bx('books', 0, 0.78, 0.3, 0.3, 0.08, 0.24); }
    A(plant, 37, 12, 0, 1.7); A(plant, 37, -12, 0, 1.5);
    chandelier(K(22, -4.5), 3.3, 0.8, 2, 1.0); chandelier(K(26, 7.6), 3.3, 0.8, 2, 1.0); chandelier(K(33, 0), 3.3, 0.7, 1, 1.0);
  }
  if (fi === 2) {
    // 廊厅
    rug('rugNavy', 0, 5, 8, 6); A(roundTable, 0, 5, 0, 0.8, 'marbleW'); flowers(K(0, 5), 0.75, 0.3);
    A(sofa, -3.8, 5, H, 'fabSage', 2.4); A(sofa, 3.8, 5, -H, 'fabSage', 2.4); A(armchair, 0, 8.4, PI, 'fabGold'); A(armchair, 0, 1.6, 0, 'fabGold');
    for (const sx of [-1, 1]) { A(sideboard, sx * 9.5, -2.55, 0, 2.2, 'paint'); A(bench, sx * 13.4, 10, sx * -H, 1.8, 'fabSage'); A(plant, sx * 13, 12.2, 0, 1.5); A(plant, sx * 6.2, -2.3, 0, 1.2); }
    chandelier(K(0, 5), 3.3, 1.1, 2, 1.1);
    // 主卧
    rug('rugRose', -26, -1.0, 5.4, 4.8); A(bed, -26, -3.75, 0, 2.3, 2.3, 'fabCream', true);
    A(nightstand, -27.75, -3.5, 0); A(nightstand, -24.25, -3.5, 0); A(bench, -26, -0.6, 0, 1.8, 'fabRose');
    A(fireplace, -37.5, 4, H, 1.9); A(armchair, -34.2, 2.2, -1.0, 'fabRose'); A(armchair, -34.2, 5.8, -2.14, 'fabRose'); A(sideTable, -35, 4, 0, false);
    A(vanity, -14.5, 10, -H); A(sofa, -21, 11.6, PI, 'fabCream', 2.0, 2); A(coffeeTable, -21, 9.8, 0, 1.0, 0.55); A(plant, -36.8, 12, 0, 1.6); A(plant, -15.2, -2.8, 0, 1.4);
    chandelier(K(-26, 2), 3.2, 0.9, 2, 1.1);
    A(desk, -31, 12.0, 0, 1.6, 0.75, 'fabRose'); A(bookshelf, -14.45, -1.6, -H, 2.2, 2.4); A(screenFold, -36.8, -2.2, H, 'fabRose'); rug('rugNavy', -34.5, 4, 4, 5);
    // 更衣室
    A(wardrobe, -26.6, -11.4, -H, 1.8, 'paint'); A(wardrobe, -26.6, -5.6, -H, 1.8, 'paint'); A(wardrobe, -34, -12.15, 0, 1.8, 'paint'); A(wardrobe, -30, -12.15, 0, 1.8, 'paint');
    { const k = K(-32, -7.8); k.bx('paint', 0, 0, 0, 1.8, 0.85, 0.9); k.bx('marbleW', 0, 0.85, 0, 1.9, 0.04, 1.0); k.blob(0, 0, 2.3, 1.4); }
    { const k = K(-37.1, -8, H); k.bx('gold', 0, 0.1, 0, 0.8, 1.9, 0.06); k.bx('glass', 0, 0.2, 0.04, 0.66, 1.7, 0.01); }
    A(bench, -32, -5.2, 0, 1.4, 'fabRose');
    // 浴室
    A(tub, -20.5, -10.4, 0); A(basins, -14.55, -8.5, -H, 3.0); rug('rugSage', -20.5, -7.2, 2.4, 1.4);
    A(plant, -25.2, -4.8, 0, 1.3); { const k = K(-24.6, -12, 0); k.cyl('gold', 0, 0, 0, 0.03, 1.1, 6); k.box('gold', 0, 1.1, 0, 0.6, 0.03, 0.03); k.box('linen', 0, 0.8, 0, 0.5, 0.6, 0.04); }
    chandelier(K(-20.5, -8.5), 3.2, 0.5, 1, 1.0);
    // 私人房间 A（中性）
    rug('rugNavy', 30, 2.2, 4.4, 3.6); A(bed, 30, 0.2, 0, 1.9, 2.2, 'fabNavy'); A(nightstand, 28.45, 0.45, 0); A(nightstand, 31.55, 0.45, 0);
    A(wardrobe, 14.55, 10.8, H, 1.8); A(sofa, 21, 11.8, PI, 'fabSage', 2.2); A(coffeeTable, 21, 10, 0, 1.1, 0.55);
    A(desk, 36.9, 8, -H, 1.4, 0.7, 'fabNavy'); A(plant, 37, 12, 0, 1.4);
    chandelier(K(26, 6), 3.2, 0.7, 1, 1.0);
    A(bookshelf, 22.5, 0.45, 0, 2.2, 2.3); A(armchair, 33.5, 11.3, PI + 0.4, 'fabCream'); A(armchair, 31.2, 11.8, PI - 0.3, 'fabCream'); A(sideTable, 32.4, 10.3, 0, false); A(screenFold, 18, 1.4, 0, 'fabNavy');
    // 小客厅
    A(fireplace, 37.5, -4, -H, 1.9); rug('rugSage', 33.3, -4, 6, 6); A(sofa, 30.6, -4, H, 'fabNavy', 2.2); A(armchair, 34, -6.4, 0, 'fabCream'); A(armchair, 34, -1.6, PI, 'fabCream'); A(coffeeTable, 33.3, -4, H, 1.1, 0.55);
    A(bookshelf, 22, -12.3, 0, 2.1, 2.5); A(bookshelf, 26, -12.3, 0, 2.1, 2.5); A(roundTable, 19, -8, 0, 0.55); A(chair, 18, -8, H); A(chair, 20, -8, -H); A(plant, 15.2, -1, 0, 1.4);
    chandelier(K(30, -5), 3.2, 0.7, 1, 1.0);
  }
  if (fi === 3) {
    // 仆役厅
    { const k = K(0, 5); k.bx('woodMid', 0, 0.72, 0, 10, 0.06, 1.4); legs(k, 9.6, 1.2, 0.72, 0.05, 'woodMid'); k.blob(0, 0, 11, 3);
      for (let i = 0; i < 6; i++) { const x = -4.1 + i * 1.64; chair(sub(k, x, 1.0, PI), 'fabNavy', 'woodMid'); chair(sub(k, x, -1.0, 0), 'fabNavy', 'woodMid'); } }
    for (const x of [-3, 0, 3]) pendant(K(x, 5), 3.3, 0.8);
    A(sideboard, -9.5, -2.55, 0, 2.6, 'woodMid'); A(sideboard, 9.5, -2.55, 0, 2.6, 'woodMid');
    { const k = K(-13.8, 5, H); k.bx('woodMid', 0, 1.0, 0, 2.4, 1.2, 0.05); for (let i = 0; i < 6; i++) k.bx('linen', -0.9 + (i % 3) * 0.8, 1.2 + Math.floor(i / 3) * 0.5, 0.03, 0.5, 0.35, 0.01); }
    A(plant, 13, 12, 0, 1.3, 'pot'); A(plant, -13, 12, 0, 1.3, 'pot');
    // 女仆长办公室
    rug('rugBurg', -26, 7, 5, 4.5); A(desk, -26, 8.4, PI, 1.8, 0.9); A(chair, -26.8, 6.4, 0, 'fabBurg'); A(chair, -25.2, 6.4, 0, 'fabBurg');
    A(filing, -14.6, 10.5, -H, 3); A(bookshelf, -32, 0.45, 0, 2.2, 2.3); A(bookshelf, -20, 0.45, 0, 2.2, 2.3); A(sofa, -37.0, 5, H, 'fabCream', 2.0, 2); A(plant, -36.8, 12, 0, 1.3, 'pot');
    pendant(K(-26, 7.5), 3.3, 0.8);
    // 附属用房（中性）
    A(bed, -30, -0.2, PI, 1.6, 2.1, 'fabCream'); A(nightstand, -31.4, -0.45, PI); A(wardrobe, -14.6, -10.5, -H, 1.6); A(desk, -22, -12.1, 0, 1.4, 0.7, 'fabCream');
    A(armchair, -35.5, -10, PI / 4, 'fabSage'); rug('rugSage', -30, -3, 3.8, 3); pendant(K(-27, -6), 3.3, 0.8);
    rug('rugRose', -21, -5, 5, 4); A(sofa, -21, -7.2, 0, 'fabSage', 2.2); A(coffeeTable, -21, -5, 0, 1.1, 0.6); A(armchair, -18.2, -4.5, -H, 'fabCream'); A(plant, -15.2, -1, 0, 1.3, 'pot');
    // 洗衣 / 储藏
    for (const x of [17.5, 21.5, 25.5, 29.5, 33.5]) A(rack, x, 0.5, 0, 3.2);
    for (const z of [6.2, 10]) A(workTable, 25, z, 0, 3.4, 1.1, 'paint');
    A(washTub, 36.4, 4.5, 0); A(washTub, 36.4, 7.5, 0); A(counter, 37.1, 10.8, -H, 2.6);
    for (const [x, z] of [[20, 8], [30.5, 11.8], [19, 11.8]]) { const k = K(x, z); k.cyl('woodMid', 0, 0, 0, 0.3, 0.45, 12, 1.15); k.bx('linen', 0, 0.4, 0, 0.4, 0.1, 0.3); }
    for (const x of [21, 29]) pendant(K(x, 7), 3.3, 0.8);
    // 监控室
    { const k = K(26, -0.25, PI); k.bx('iron', 0, 0.9, 0, 8.4, 2.3, 0.08); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) k.box('screen', -3.15 + i * 2.1, 1.35 + j * 0.72, 0.05, 1.95, 0.62, 0.02); }
    A(monitorDesk, 26, -6.6, PI, 3.4, 5);
    for (const z of [-11.8, -10.8, -9.8, -8.8]) A(serverRack, 37.1, z, -H);
    { const k = K(19.5, -10); k.bx('woodDark', 0, 0, 0, 2.2, 0.9, 1.4); k.box('screen', 0, 0.93, 0, 2.0, 0.02, 1.2); k.blob(0, 0, 2.6, 1.8); }
    A(filing, 14.6, -4, H, 2);
  }
  if (fi === 4) {
    // 屋顶露台
    const para = (x, z, fab = 'linen') => { const k = K(x, z); k.cyl('iron', 0, 0, 0, 0.35, 0.08, 12); k.cyl('woodMid', 0, 0, 0, 0.04, 2.5, 6); k.cyl(fab, 0, 2.2, 0, 1.7, 0.5, 10, 0.02); k.geo(fab, G.cyl(10, 1, true), 0, 2.15, 0, 1.72, 0.14, 1.72); k.sph('gold', 0, 2.75, 0, 0.06, 0.06, 0.06, 6, 4); };
    const lounger = (x, z, ry) => { const k = K(x, z, ry); legs(k, 0.7, 1.9, 0.28, 0.025, 'woodMid', 0.04); k.bx('woodMid', 0, 0.25, 0.2, 0.72, 0.05, 1.3); k.bx('linen', 0, 0.3, 0.2, 0.66, 0.08, 1.28); k.box('woodMid', 0, 0.55, -0.72, 0.72, 0.06, 0.8, 0, -0.75); k.box('linen', 0, 0.6, -0.68, 0.66, 0.08, 0.78, 0, -0.75); k.blob(0, 0, 1.1, 2.4); };
    for (const sx of [-1, 1]) {
      para(sx * 23, 7); lounger(sx * 21.6, 8.2, 0); lounger(sx * 24.4, 8.2, 0); A(sideTable, sx * 23, 9.4, 0, false);
      para(sx * 26, -6.5, 'fabSage'); A(roundTable, sx * 26, -6.5, 0, 0.8, 'marbleW');
      for (let i = 0; i < 4; i++) { const a = i * H; A(chair, sx * 26 + Math.sin(a) * 1.15, -6.5 + Math.cos(a) * 1.15, a + PI, 'linen', 'iron'); }
      for (const x of [6.5, 14, 32]) A(topiaryPot, sx * x, 11.6, 0);
      for (const z of [-9, 0, 9]) A(topiaryPot, sx * 36.6, z, 0);
      A(plant, sx * 11.2, 2.2, 0, 1.4);
    }
    for (const sx of [-1, 1]) { A(telescope, sx * 9.5, 11.4, sx * 0.4); lounger(sx * 30.2, 8.2, 0); A(bench, sx * 36.7, 4.5, sx > 0 ? -H : H, 2.2, 'linen'); A(bench, sx * 36.7, -4.5, sx > 0 ? -H : H, 2.2, 'linen'); }
    para(0, 7.2, 'fabGold'); A(roundTable, 0, 7.2, 0, 0.7, 'marbleW'); A(armchair, -1.3, 7.2, H, 'linen'); A(armchair, 1.3, 7.2, -H, 'linen');
    // 私人电梯厅
    rug('rugBurg', 0, -1.6, 5, 4); A(roundTable, 0, -1.6, 0, 0.7, 'marbleW'); flowers(K(0, -1.6), 0.75, 0.26);
    A(armchair, -7.5, -1.2, H, 'fabBurg'); A(armchair, 7.5, -1.2, -H, 'fabBurg'); A(plant, -9, 0, 0, 1.5); A(plant, 9, 0, 0, 1.5);
    chandelier(K(0, -1.6), 4.2, 0.9, 2, 1.0);
  }
}
