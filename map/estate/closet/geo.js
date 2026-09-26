// 衣帽间样板间 · 几何工具：米制 UV、按材质合并（控制 draw call）、布料（衣物垂褶、窗帘）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MATS, NOCAST, srand } from './mats.js';

export const PI = Math.PI;

// 按法线主轴投影的米制 UV（在几何体自身坐标、缩放之后计算，所以贴图在各处比例一致）
export function metricUV(g, rot = false) {
  const p = g.attributes.position, n = g.attributes.normal; let uv = g.attributes.uv;
  if (!uv) { uv = new THREE.BufferAttribute(new Float32Array(p.count * 2), 2); g.setAttribute('uv', uv); }
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    if (rot) [u, v] = [v, u];
    uv.setXY(i, u, v);
  }
  return g;
}
function clean(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g.index ? g.toNonIndexed() : g;
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export function M(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(s, s, s));
}

// 构建器：add(mat, geom, matrix) 收集，build() 按材质合并。支持局部坐标系（push / pop）。
export class Kit {
  constructor() { this.parts = new Map(); this.stack = [new THREE.Matrix4()]; }
  get T() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) { this.stack.push(this.T.clone().multiply(M(x, y, z, ry, rx, rz, s))); return this; }
  pop() { this.stack.pop(); return this; }
  add(mat, g, m) {
    g = clean(g); const mm = m ? this.T.clone().multiply(m) : this.T; g.applyMatrix4(mm);
    if (!this.parts.has(mat)) this.parts.set(mat, []); this.parts.get(mat).push(g); return this;
  }
  // 轴对齐盒（底面中心在 y，局部坐标）；uvRot 让木纹竖向
  box(mat, x, y, z, w, h, d, o = {}) {
    const g = o.r ? new RoundedBoxGeometry(w, h, d, 2, o.r) : new THREE.BoxGeometry(w, h, d); metricUV(g, o.uvRot);
    return this.add(mat, g, M(x, y + h / 2, z, o.ry || 0, o.rx || 0, o.rz || 0));
  }
  cyl(mat, x, y, z, r, h, seg = 16, rTop = null, o = {}) {
    const g = new THREE.CylinderGeometry(rTop ?? r, r, h, seg, 1, !!o.open); if (!o.keepUV) metricUV(g);
    const cy = (o.rx || o.rz) ? y : y + h / 2;
    return this.add(mat, g, M(x, cy, z, o.ry || 0, o.rx || 0, o.rz || 0));
  }
  sph(mat, x, y, z, rx, ry, rz, w = 16, h = 10) { const g = new THREE.SphereGeometry(1, w, h); g.scale(rx, ry, rz); metricUV(g); return this.add(mat, g, M(x, y, z)); }
  tor(mat, x, y, z, R, r, arc = PI * 2, o = {}) { const g = new THREE.TorusGeometry(R, r, o.rs || 6, o.ts || 24, arc); return this.add(mat, g, M(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0)); }
  lathe(mat, x, y, z, pts, seg = 20, o = {}) { const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); metricUV(g); return this.add(mat, g, M(x, y, z, o.ry || 0)); }
  plane(mat, x, y, z, w, h, o = {}) { const g = new THREE.PlaneGeometry(w, h); if (!o.keepUV) metricUV(g); return this.add(mat, g, M(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0)); }
  // 两点之间的圆杆
  rod(mat, a, b, r, seg = 10) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
    const g = new THREE.CylinderGeometry(r, r, L, seg); metricUV(g);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    return this.add(mat, g, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  }
  build(name = 'kit') {
    const grp = new THREE.Group(); grp.name = name;
    for (const [mat, list] of this.parts) {
      const g = mergeGeometries(list, false); if (!g) { console.warn('merge fail', mat); continue; }
      const m = new THREE.Mesh(g, MATS[mat]); m.name = name + ':' + mat;
      m.castShadow = !NOCAST.has(mat); m.receiveShadow = true; m.userData.mat = mat; grp.add(m);
    }
    return grp;
  }
}

/* ---------------- 布料 ---------------- */
// 挂着的衣物：椭圆截面的管，宽度沿 z（衣架方向垂直于墙），厚度沿 x；越往下褶越深（垂坠）。
// prof: [[t, halfWidth, halfThick], ...]，t 从 0（肩）到 1（下摆）。
export function garment(H, prof, o = {}) {
  const rnd = srand(o.seed || 1), segA = o.segA || 28, segY = o.segY || 22, folds = o.folds || 7, amp = o.amp ?? 0.012;
  const ph = rnd() * 6, ph2 = rnd() * 6, lean = (rnd() - 0.5) * 0.02;
  const at = (t) => { let i = 0; while (i < prof.length - 2 && prof[i + 1][0] < t) i++; const [t0, w0, d0] = prof[i], [t1, w1, d1] = prof[i + 1]; const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); const s = f * f * (3 - 2 * f); return [w0 + (w1 - w0) * s, d0 + (d1 - d0) * s]; };
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segY; j++) {
    const t = j / segY, y = -t * H; const [hw, hd] = at(t); let arc = 0, px = null, pz = null;
    for (let i = 0; i <= segA; i++) {
      const a = i / segA * PI * 2; const fold = (amp * Math.pow(t, 1.3) * (1 + 0.5 * Math.sin(a * 3 + ph2))) * Math.sin(a * folds + ph + t * 1.5);
      const x = Math.cos(a) * (hd + fold * 0.6) + lean * t * H, z = Math.sin(a) * (hw + fold);
      if (px !== null) arc += Math.hypot(x - px, z - pz); px = x; pz = z;
      pos.push(x, y, z); uv.push(arc, y);
    }
  }
  for (let j = 0; j < segY; j++) for (let i = 0; i < segA; i++) { const a = j * (segA + 1) + i, b = a + segA + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  // 下摆封底
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// 帷幔：竖向褶皱的平面，gather(t) 控制每个高度的收拢宽度（束带处收窄）
export function drape(W, H, o = {}) {
  const segX = o.segX || 48, segY = o.segY || 24, folds = o.folds || 9, amp = o.amp || 0.05, rnd = srand(o.seed || 3), ph = rnd() * 6;
  const gather = o.gather || (() => 1), side = o.side || 1;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segY; j++) {
    const t = j / segY, y = -t * H, gw = gather(t) * W;
    for (let i = 0; i <= segX; i++) {
      const s = i / segX; const x = (side > 0 ? s : 1 - s) * gw * side; const a = s * folds * PI * 2 + ph;
      const z = Math.sin(a) * amp * (0.6 + 0.4 * gather(t)) + Math.sin(a * 2.3 + t * 3) * amp * 0.15;
      pos.push(x, y, z); uv.push(s * W * 1.4, y);
    }
  }
  for (let j = 0; j < segY; j++) for (let i = 0; i < segX; i++) { const a = j * (segX + 1) + i, b = a + segX + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// 挤出剖面线脚：沿 x 方向拉伸的 2D 剖面（[y, z] 点列，z 向外）
export function moulding(len, prof) {
  const s = new THREE.Shape(); prof.forEach(([y, z], i) => i ? s.lineTo(z, y) : s.moveTo(z, y));
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, steps: 1 }); g.rotateY(-PI / 2); g.translate(len / 2, 0, 0); g.computeVertexNormals(); metricUV(g); return g;
}
