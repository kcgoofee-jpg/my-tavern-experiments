// 伊甸庄园 · 构建工具：程序纹理、材质表、按材质合并的 Batch（控制 draw call）、实例化原型
// WP-B 段（从文件头到 Batch 注释行之前）：随机、矩阵、原型几何 G、程序纹理、材质（initMaterials）、着色几何 tint、实例原型
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------------- 随机 ---------------- */
export function srand(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const R = srand(11);

/* ---------------- 矩阵 ---------------- */
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function mat4(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/* ---------------- 原型几何 ---------------- */
const cache = new Map();
const memo = (k, f) => cache.get(k) || cache.set(k, f()).get(k);
// 光滑法线：去掉 uv/normal 后按位置焊接再算法线（挤出体默认是平面着色）
function smooth(g) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-5); g.computeVertexNormals(); return g; }
// 圆角板：沿 x 长 w，高 h（y），深 d（z）；r = y-z 剖面圆角（毛巾折边取 h/2），re = 两端（x）倒圆
function slabGeom(w, h, d, r, re, seg) {
  r = Math.max(0.0005, Math.min(r, h / 2 * 0.985, d / 2 * 0.985)); re = Math.max(0, Math.min(re, w / 2 * 0.9, r * 0.98));
  const s = new THREE.Shape(), x0 = -d / 2, x1 = d / 2, y0 = -h / 2, y1 = h / 2, P = Math.PI, Hh = P / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Hh, 0, false); s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Hh, false);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Hh, P, false); s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, P, P * 1.5, false);
  const depth = Math.max(0.0002, w - 2 * re);
  const g = new THREE.ExtrudeGeometry(s, re > 0 ? { depth, bevelEnabled: true, bevelThickness: re, bevelSize: re, bevelOffset: -re, bevelSegments: seg >= 4 ? 2 : 1, curveSegments: seg } : { depth, bevelEnabled: false, curveSegments: seg });
  g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2);
  return smooth(g);
}
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  cyl: (seg = 12, top = 1, open = false) => memo(`c${seg}_${top}_${open}`, () => new THREE.CylinderGeometry(top, 1, 1, seg, 1, open)),
  sph: (w = 12, h = 8) => memo(`s${w}_${h}`, () => new THREE.SphereGeometry(1, w, h)),
  hemi: (w = 16) => memo(`h${w}`, () => new THREE.SphereGeometry(1, w, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
  tor: (arc = Math.PI * 2, rs = 6, ts = 24, tube = 0.3) => memo(`t${arc}_${rs}_${ts}_${tube}`, () => new THREE.TorusGeometry(1, tube, rs, ts, arc).rotateX(Math.PI / 2)),
  cone: (seg = 8) => memo(`k${seg}`, () => new THREE.ConeGeometry(1, 1, seg)),
  // 三角棱柱：底边在 y=0，顶点 y=1，沿 z 厚度 1（山花、屋脊）
  prism: () => memo('prism', () => { const s = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]); return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5); }),
  // 弓形（弧形窗楣）：底平 y=0，拱高 1，沿 z 厚度 1
  seg: () => memo('seg', () => new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2)),
  lathe: (key, pts, seg = 12) => memo('l' + key, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg)),
  extrude: (key, f) => memo('e' + key, f),
  /* ---- 以下为 WP-B 新增（只加不改） ---- */
  // 圆角盒（实际尺寸，不再缩放）：r 为剖面圆角，re 为两端倒圆
  slab: (w, h, d, r = 0.02, re = r, seg = 3) => memo(`sl${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}_${r.toFixed(4)}_${re.toFixed(4)}_${seg}`, () => slabGeom(w, h, d, r, re, seg)),
  // 竖直平面（xy 平面，面朝 +z），uv 取图集中的一格 [u0,v0,u1,v1]
  vplane: (uvr = [0, 0, 1, 1]) => memo('vp' + uvr.join('_'), () => { const g = new THREE.PlaneGeometry(1, 1); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uvr[0] + uv.getX(i) * (uvr[2] - uvr[0]), uvr[1] + uv.getY(i) * (uvr[3] - uvr[1])); return g; }),
  // 圆盘（xz 平面，朝上），uv 取图集中的一格
  disc: (seg = 24, uvr = [0, 0, 1, 1]) => memo(`dc${seg}_` + uvr.join('_'), () => { const g = new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uvr[0] + uv.getX(i) * (uvr[2] - uvr[0]), uvr[1] + uv.getY(i) * (uvr[3] - uvr[1])); return g; }),
  // 任意平面形状挤出（shape 由 f 生成，key 唯一）
  shape: (key, f, depth = 1, bevel = 0, curveSegments = 8) => memo('sh' + key, () => { const g = new THREE.ExtrudeGeometry(f(), bevel ? { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments } : { depth, bevelEnabled: false, curveSegments }); g.translate(0, 0, -depth / 2); return g; }),
  // 光滑车削（法线连续）
  lathe2: (key, pts, seg = 16) => memo('L' + key, () => { const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); return g; }),
  custom: (key, f) => memo('u' + key, f),
};
export { smooth as smoothGeom };

/* ---------------- 顶点着色几何：同一材质、不同颜色合并成一次 draw call ---------------- */
const _tc = new Map();
export function tint(g, col) {
  const key = g.uuid + col; let t = _tc.get(key); if (t) return t;
  t = g.clone(); const c = new THREE.Color(col), n = t.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  t.setAttribute('color', new THREE.BufferAttribute(a, 3)); _tc.set(key, t); return t;
}
// 旧织物键 → [共享材质, 颜色]（furniture 里经包装批次自动换算；'key:#hex' 写法同理）
export const TINT = {
  fabCream: ['fab', '#EEE7D8'], fabRose: ['fab', '#C99A93'], fabIvory: ['fab', '#EEE7D8'],
  fabSage: ['velvet', '#2F5D4E'], fabNavy: ['velvet', '#2C3E63'], fabBurg: ['velvet', '#7B1E2B'], fabGold: ['velvet', '#CDB58A'],
};

/* ---------------- 程序纹理 ---------------- */
function cv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tx(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; return t;
}
function speck(g, w, h, n, cols, smin = 1, smax = 2) {
  for (let i = 0; i < n; i++) { g.fillStyle = cols[(R() * cols.length) | 0]; const s = smin + R() * (smax - smin); g.fillRect(R() * w, R() * h, s, s); }
}
const shade = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); };
const rgba = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`; };
// 无缝：在 9 个平移位置各画一次
const tile9 = (W, H, f) => { for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) f(ox, oy); };
// 大理石纹：蜿蜒折线 + 云斑
function veins(g, W, H, n, col, a0, a1, lw0, lw1, len = 1.2, wrap = true) {
  for (let i = 0; i < n; i++) {
    const pts = []; let x = R() * W, y = R() * H, a = R() * Math.PI * 2; const steps = (8 + R() * 18 * len) | 0, st = W / 22;
    for (let s = 0; s < steps; s++) { pts.push([x, y]); a += (R() - 0.5) * 0.9; x += Math.cos(a) * st; y += Math.sin(a) * st; }
    const al = a0 + R() * (a1 - a0), lw = lw0 + R() * (lw1 - lw0);
    let br = null; if (R() < 0.5) { br = []; let [bx, by] = pts[(R() * pts.length) | 0], ba = R() * 6.3; br.push([bx, by]); for (let s = 0; s < 6; s++) { ba += (R() - 0.5); bx += Math.cos(ba) * st * 0.7; by += Math.sin(ba) * st * 0.7; br.push([bx, by]); } }
    const line = (ps, ox, oy) => { g.beginPath(); ps.forEach(([px, py], k) => k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)); g.stroke(); };
    const draw = (ox, oy) => { g.strokeStyle = rgba(col, al); g.lineWidth = lw; line(pts, ox, oy); if (br) { g.lineWidth = lw * 0.4; g.strokeStyle = rgba(col, al * 0.7); line(br, ox, oy); } };
    if (wrap) tile9(W, H, draw); else draw(0, 0);
  }
}
function clouds(g, W, H, n, col, a) {
  for (let i = 0; i < n; i++) { const x = R() * W, y = R() * H, r = W * (0.08 + R() * 0.25);
    tile9(W, H, (ox, oy) => { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r); }); }
}
function marbleCanvas(W, base, vein, n, cloudA = 0.06, lw = [0.6, 2.2]) {
  const [c, g] = cv(W); g.fillStyle = base; g.fillRect(0, 0, W, W);
  clouds(g, W, W, 10, vein, cloudA); veins(g, W, W, n, vein, 0.18, 0.5, lw[0], lw[1]); veins(g, W, W, n, vein, 0.06, 0.16, lw[1], lw[1] * 3);
  return [c, g];
}
// 后处理：去饱和 + 磨损噪点 + 中央踩踏褪色（只用合成模式，不回读像素：getImageData 会让 GPU 画布强制回读，首帧卡数秒）
function wear(c, desat = 0.15, noise = 10, fade = 0) {
  const g = c.getContext('2d'), W = c.width, Hh = c.height;
  g.save(); g.globalCompositeOperation = 'saturation'; g.fillStyle = `rgba(128,128,128,${desat})`; g.fillRect(0, 0, W, Hh); g.restore();
  if (noise) speck(g, W, Hh, (W * Hh) / 40, [`rgba(0,0,0,${noise / 255})`, `rgba(255,255,255,${noise / 300})`], 1, 1.6);
  if (fade) { const gr = g.createRadialGradient(W / 2, Hh / 2, 0, W / 2, Hh / 2, Math.max(W, Hh) * 0.5); gr.addColorStop(0, `rgba(214,200,176,${fade})`); gr.addColorStop(1, 'rgba(214,200,176,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh); }
}
function woodGrain(g, W, H, base, dark, light, rows = 40, dir = 0) {
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let i = 0; i < rows * 3; i++) {
    const y = R() * H, a = 0.05 + R() * 0.12, amp = 1 + R() * 3, ph = R() * 6.3, lw = 0.4 + R() * 1.4, col = R() < 0.7 ? dark : light;
    tile9(W, H, (ox, oy) => { g.strokeStyle = rgba(col, a); g.lineWidth = lw; g.beginPath();
      for (let x = 0; x <= W; x += 8) { const yy = y + Math.sin(x / W * Math.PI * 2 * 2 + ph) * amp; if (dir) (x ? g.lineTo(yy + ox, x + oy) : g.moveTo(yy + ox, x + oy)); else (x ? g.lineTo(x + ox, yy + oy) : g.moveTo(x + ox, yy + oy)); } g.stroke(); });
  }
}

const TEX = {};
export const TEXTURES = TEX;
function makeTextures() {
  if (TEX.ashlar) return;
  const NERO = '#1E1E20', STAT = '#F2F0EC', CALA = '#F1ECE2';
  /* ---- 石材地面 ---- */
  // Statuario 大板：2 m 一张，1 m 见方
  { const [c, g] = marbleCanvas(256, STAT, '#9A9A9C', 9);
    g.strokeStyle = 'rgba(120,115,105,.18)'; g.lineWidth = 1; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 256); g.moveTo(0, i * 128); g.lineTo(256, i * 128); g.stroke(); }
    clouds(g, 256, 256, 6, '#b8ae98', 0.05); TEX.statuario = tx(c); }
  TEX.carrara = TEX.statuario; TEX.marble = TEX.statuario;
  // 台面用（无拼缝）
  { const [c] = marbleCanvas(256, STAT, '#9A9A9C', 8); TEX.statTop = tx(c); }
  // 卡拉卡塔金：金灰粗纹
  { const [c, g] = marbleCanvas(256, CALA, '#B89B6A', 7, 0.08, [0.8, 3.2]); veins(g, 256, 256, 5, '#8f8a82', 0.12, 0.3, 0.5, 1.4); TEX.calacatta = tx(c); }
  // 黑金花：白纹
  { const [c, g] = marbleCanvas(256, NERO, '#E8E6E0', 8, 0.035, [0.5, 1.8]); veins(g, 256, 256, 4, '#C9A24B', 0.1, 0.25, 0.4, 1); TEX.nero = tx(c); }
  // 斜置棋盘格：边长 1.2 m 的方块转 45°，贴图周期 1.2·√2 = 1.697 m
  { const [c, g] = marbleCanvas(256, NERO, '#E8E6E0', 6, 0.03, [0.4, 1.4]);
    g.save(); g.beginPath(); g.moveTo(128, 0); g.lineTo(256, 128); g.lineTo(128, 256); g.lineTo(0, 128); g.closePath(); g.clip();
    g.fillStyle = STAT; g.fillRect(0, 0, 256, 256); clouds(g, 256, 256, 5, '#9A9A9C', 0.05); veins(g, 256, 256, 8, '#9A9A9C', 0.15, 0.4, 0.5, 1.8, 1, false); g.restore();
    g.strokeStyle = 'rgba(60,55,50,.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(128, 0); g.lineTo(256, 128); g.lineTo(128, 256); g.lineTo(0, 128); g.closePath(); g.stroke();
    for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(255,255,255,${0.03 + R() * 0.04})`; g.lineWidth = 0.5 + R() * 2; g.beginPath(); const x = R() * 256, y = R() * 256; g.arc(x, y, 20 + R() * 60, R() * 6, R() * 6 + 0.8); g.stroke(); }
    TEX.checker = tx(c); }
  // 小方格 0.3 m：黑金花 / 卡拉卡塔金，一张 4×4 格 = 1.2 m
  { const [c, g] = cv(256); const a = TEX.nero.image, b = TEX.calacatta.image;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const src = (i + j) % 2 ? a : b; g.drawImage(src, i * 64, j * 64, 64, 64, i * 64, j * 64, 64, 64); }
    g.strokeStyle = 'rgba(60,55,50,.3)'; g.lineWidth = 1; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
    TEX.checkSmall = tx(c); }
  // 罗盘星形（眺望亭，512²，贴图 12.8 m 覆盖整个亭）
  { const S = 512, [c, g] = marbleCanvas(S, STAT, '#9A9A9C', 10); const cx = S / 2, cy = S / 2;
    const ring = (r0, r1, col) => { g.beginPath(); g.arc(cx, cy, r1, 0, Math.PI * 2); g.arc(cx, cy, r0, 0, Math.PI * 2, true); g.fillStyle = col; g.fill(); };
    ring(236, 250, NERO); ring(229, 233, '#B5913F'); ring(150, 156, '#B5913F');
    for (let k = 0; k < 32; k++) { const a = k * Math.PI / 16, long = k % 2 === 0, big = k % 4 === 0, main = k % 8 === 0; const r = main ? 225 : big ? 190 : long ? 150 : 110, w = main ? 0.2 : big ? 0.16 : 0.1;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a + s * w) * r * 0.28, cy + Math.sin(a + s * w) * r * 0.28); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.closePath(); g.fillStyle = (s > 0) === (k % 2 === 0) ? NERO : '#d9d5cc'; g.fill(); g.strokeStyle = 'rgba(181,145,63,.9)'; g.lineWidth = 1.2; g.stroke(); } }
    g.fillStyle = '#B5913F'; g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.fill();
    // 北（模型 −z，贴图 v 小的一侧 → 画布下方）
    g.fillStyle = '#C9A24B'; g.beginPath(); g.moveTo(cx, S - 8); g.lineTo(cx - 12, S - 34); g.lineTo(cx + 12, S - 34); g.closePath(); g.fill();
    const t = tx(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; TEX.compass = t; }
  /* ---- 木地板 ---- */
  const OAK = ['#A57A4B', '#9a6f43', '#ad8352', '#8f6a3e', '#a07448', '#b08858'];
  // 橡木直铺：2.4 m 一张，板宽 0.15 m
  { const [c, g] = cv(256); g.fillStyle = '#7E5A34'; g.fillRect(0, 0, 256, 256); const rows = 16, rh = 256 / rows;
    for (let r = 0; r < rows; r++) { let x = -R() * 120; while (x < 256) { const L = 70 + R() * 110, col = shade(OAK[(R() * 6) | 0], 0.95 + R() * 0.1);
      for (const ox of [0, -256, 256]) { g.fillStyle = col; g.fillRect(x + ox + 0.6, r * rh + 0.6, L - 1.2, rh - 1.2); g.fillStyle = 'rgba(70,40,15,.10)'; for (let k = 0; k < 5; k++) g.fillRect(x + ox + R() * L, r * rh + 1 + R() * (rh - 2), 10 + R() * 40, 0.6); }
      x += L; } }
    TEX.oak = tx(c); TEX.parquet = TEX.oak; }
  // 人字拼：板 8 × 32 cm，贴图 0.9 m（旋转 45° 后恰好无缝）
  { const [c, g] = cv(256); g.fillStyle = '#6e4d2c'; g.fillRect(0, 0, 256, 256); const Wd = 256 / (8 * Math.SQRT2), L = 4 * Wd;
    g.save(); g.translate(128, 128); g.rotate(Math.PI / 4);
    for (let m = -8; m <= 8; m++) for (let n = -24; n <= 24; n++) {
      const ox = m * L + n * Wd, oy = -m * L + n * Wd;
      g.fillStyle = shade(OAK[(R() * 6) | 0], 0.93 + R() * 0.12); g.fillRect(ox + 0.5, oy + 0.5, L - 1, Wd - 1);
      g.fillStyle = shade(OAK[(R() * 6) | 0], 0.93 + R() * 0.12); g.fillRect(ox + L + 0.5, oy + Wd - L + 0.5, Wd - 1, L - 1);
    }
    g.restore(); speck(g, 256, 256, 500, ['rgba(60,35,15,.08)', 'rgba(255,240,210,.05)'], 1, 3); TEX.herring = tx(c); }
  // 凡尔赛拼：1 m 一块，贴图 2 × 2 块
  { const [c, g] = cv(256); const P = 128;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const x0 = i * P, y0 = j * P;
      g.fillStyle = '#8a643b'; g.fillRect(x0, y0, P, P);
      g.save(); g.beginPath(); g.rect(x0 + 10, y0 + 10, P - 20, P - 20); g.clip(); g.fillStyle = shade('#A57A4B', 0.96 + R() * 0.08); g.fillRect(x0, y0, P, P);
      for (const s of [-1, 1]) for (let k = -3; k <= 3; k++) { g.strokeStyle = shade('#916a3f', 0.95 + R() * 0.1); g.lineWidth = 7; g.beginPath(); const o = k * 27; if (s > 0) { g.moveTo(x0 + o, y0); g.lineTo(x0 + o + P, y0 + P); } else { g.moveTo(x0 + P - o, y0); g.lineTo(x0 - o, y0 + P); } g.stroke(); g.strokeStyle = 'rgba(50,30,12,.35)'; g.lineWidth = 0.6; g.stroke(); }
      g.restore();
      g.fillStyle = shade('#9a6f43', 1.02); for (const [x, y, w, h] of [[x0, y0, P, 10], [x0, y0 + P - 10, P, 10], [x0, y0, 10, P], [x0 + P - 10, y0, 10, P]]) g.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
      g.strokeStyle = 'rgba(50,30,12,.4)'; g.lineWidth = 0.8; g.strokeRect(x0 + 0.5, y0 + 0.5, P - 1, P - 1); g.strokeRect(x0 + 10, y0 + 10, P - 20, P - 20); }
    speck(g, 256, 256, 600, ['rgba(60,35,15,.07)', 'rgba(255,240,210,.05)'], 1, 3); TEX.versailles = tx(c); }
  // 油毡（仿橡木色，细斑）
  { const [c, g] = cv(128); g.fillStyle = '#9C7F5B'; g.fillRect(0, 0, 128, 128); speck(g, 128, 128, 1500, ['rgba(80,55,30,.18)', 'rgba(200,170,130,.15)'], 1, 2.5); TEX.lino = tx(c); }
  // 石板（服务房间）：3 m 一张
  { const [c, g] = cv(256); g.fillStyle = '#a79f92'; g.fillRect(0, 0, 256, 256);
    let y = 0; while (y < 256) { const h = 48 + ((R() * 3) | 0) * 16; let x = -R() * 60; while (x < 256) { const w = 50 + R() * 70; g.fillStyle = shade('#cfc7b8', 0.92 + R() * 0.12);
      for (const ox of [0, -256, 256]) g.fillRect(x + ox + 1.2, y + 1.2, w - 2.4, Math.min(h, 256 - y) - 2.4); x += w; } y += h; }
    speck(g, 256, 256, 1400, ['rgba(0,0,0,.05)', 'rgba(255,255,255,.07)'], 1, 3); clouds(g, 256, 256, 8, '#7d7466', 0.07); TEX.stoneFlag = tx(c); }
  // 小方砖（浴室 / 备餐间）：1 m 一张
  { const [c, g] = cv(128); g.fillStyle = '#bdb6aa'; g.fillRect(0, 0, 128, 128);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { g.fillStyle = shade('#f1ede6', 0.97 + R() * 0.05); g.fillRect(i * 16 + 1, j * 16 + 1, 14, 14); }
    TEX.tile = tx(c); }
  // 石板铺地（露台、前庭平台）：4 m 一张
  { const [c, g] = cv(256); g.fillStyle = '#b9b0a2'; g.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const off = (j % 2) * 32; g.fillStyle = shade('#ddd5c7', 0.94 + R() * 0.09);
      for (const ox of [0, -256]) g.fillRect(i * 64 + off + ox + 1, j * 64 + 1, 62, 62); }
    speck(g, 256, 256, 900, ['rgba(0,0,0,.05)', 'rgba(255,255,255,.08)']); clouds(g, 256, 256, 6, '#8f8574', 0.06); TEX.pavers = tx(c); }
  /* ---- 外墙石材（加轻微风化斑） ---- */
  { const [c, g] = cv(256); g.fillStyle = '#d9d1c3'; g.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 5; i++) { const off = (j % 2) * 32; g.fillStyle = shade('#E4DED2', 0.985 + R() * 0.035);
      for (const ox of [0, -256]) g.fillRect(i * 64 + off + ox + 0.7, j * 32 + 0.7, 62.6, 30.6); }
    speck(g, 256, 256, 900, ['rgba(211,204,190,.5)', 'rgba(255,255,255,.08)']); clouds(g, 256, 256, 7, '#9c927f', 0.05); TEX.ashlar = tx(c); }
  { const [c, g] = cv(256); g.fillStyle = '#A89F8F'; g.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 3; i++) { const off = (j % 2) * 48, bh = 256 / 6; g.fillStyle = shade('#CFC7B8', 0.98 + R() * 0.05);
      for (const ox of [0, -256]) { g.fillRect(i * 96 + off + ox + 1, j * bh + 3, 94, bh - 6); } }
    speck(g, 256, 256, 600, ['rgba(120,100,80,.06)']); clouds(g, 256, 256, 7, '#7f7462', 0.06); TEX.rustic = tx(c); }
  /* ---- 园林 ---- */
  // 草坪：12 m 一张，修剪条纹（对比度减半）
  { const [c, g] = cv(256); for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#56753B' : '#5B7A3D'; g.fillRect(0, i * 64, 256, 64); }
    speck(g, 256, 256, 5000, ['rgba(40,60,20,.18)', 'rgba(170,190,110,.16)', 'rgba(60,80,30,.12)'], 1, 2.2); TEX.grass = tx(c); }
  { const [c, g] = cv(128); g.fillStyle = '#CFC6B0'; g.fillRect(0, 0, 128, 128);
    speck(g, 128, 128, 2600, ['#bdb39c', '#ddd5c2', '#aea48c', '#e6dfcf'], 1, 2.4); TEX.gravel = tx(c); }
  { const [c, g] = cv(128); g.fillStyle = '#2F4A26'; g.fillRect(0, 0, 128, 128);
    speck(g, 128, 128, 2400, ['#243a1d', '#3f5e33', '#4a6b3b', '#2a4222'], 1.5, 3.5); TEX.hedge = tx(c); }
  const flowers = (cols) => { const [c, g] = cv(128); g.fillStyle = '#4d6a36'; g.fillRect(0, 0, 128, 128);
    speck(g, 128, 128, 700, ['#3b5529', '#5f7f43'], 2, 4); speck(g, 128, 128, 900, cols, 1.5, 3.2); return tx(c); };
  TEX.flowers = flowers(['#e8dcef', '#c9a3d6', '#f4f1ea', '#e7b7c3', '#b58bc4']);
  TEX.roses = flowers(['#c2455a', '#e59aa9', '#f3d9dc', '#a8324a', '#f6f0ea']);
  { const [c, g] = cv(256); let y = 0;
    while (y < 256) { const h = 3 + R() * 14; g.fillStyle = ['#8a7d6c', '#9b8e7b', '#7a6d5e', '#a79a86', '#6f6457', '#938573'][(R() * 6) | 0]; g.fillRect(0, y, 256, h + 1); y += h; }
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(40,32,24,${0.1 + R() * 0.2})`; g.lineWidth = 0.6 + R(); g.beginPath(); const x = R() * 256, yy = R() * 256; g.moveTo(x, yy); g.lineTo(x + R() * 10 - 5, yy + 10 + R() * 30); g.stroke(); }
    speck(g, 256, 256, 3000, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.06)'], 1, 3); TEX.rock = tx(c); }
  // 书脊
  { const [c, g] = cv(256, 64); g.fillStyle = '#2a1d14'; g.fillRect(0, 0, 256, 64); let x = 0;
    while (x < 256) { const w = 3 + R() * 5, h = 44 + R() * 18; g.fillStyle = ['#6b2a2a', '#2e3f5c', '#41573f', '#7a5a33', '#5a2f45', '#c2b08a', '#27303a', '#8a6a3c', '#4a3322'][(R() * 9) | 0];
      g.fillRect(x, 64 - h, w - 0.6, h); g.fillStyle = 'rgba(230,195,106,.55)'; g.fillRect(x + 0.5, 64 - h + 6, w - 1.6, 1.2); g.fillRect(x + 0.5, 64 - 8, w - 1.6, 1); x += w; }
    TEX.books = tx(c, true, false); }
  /* ---- 木作 ---- */
  { const [c, g] = cv(256); woodGrain(g, 256, 256, '#5E2A1A', '#3E1A10', '#7a3a24'); clouds(g, 256, 256, 6, '#2a1008', 0.08); TEX.mahogany = tx(c); }
  { const [c, g] = cv(256); woodGrain(g, 256, 256, '#5A3A22', '#3A2414', '#77502f'); clouds(g, 256, 256, 6, '#24160b', 0.08); TEX.walnut = tx(c); }
  { const [c, g] = cv(128); woodGrain(g, 128, 128, '#D8B777', '#B8964E', '#ead0a0', 20); TEX.satinwood = tx(c); }
  // 护墙板（1.2 m 一张，两块竖板，凸板带斜面高光）
  const panelTex = (base, dark, light) => { const [c, g] = cv(256); woodGrain(g, 256, 256, base, dark, light, 30, 1);
    for (let i = 0; i < 2; i++) { const x0 = i * 128 + 18, y0 = 18, w = 92, h = 220;
      g.fillStyle = rgba(light, 0.18); g.fillRect(x0, y0, w, 4); g.fillRect(x0, y0, 4, h);
      g.fillStyle = rgba(dark, 0.45); g.fillRect(x0, y0 + h - 4, w, 4); g.fillRect(x0 + w - 4, y0, 4, h);
      g.strokeStyle = rgba(dark, 0.5); g.lineWidth = 1; g.strokeRect(x0 + 10, y0 + 10, w - 20, h - 20);
      g.strokeStyle = rgba(light, 0.2); g.strokeRect(x0 + 11, y0 + 11, w - 22, h - 22); }
    g.fillStyle = rgba(dark, 0.5); g.fillRect(0, 0, 256, 2); g.fillRect(127, 0, 2, 256); return tx(c); };
  TEX.panelWalnut = panelTex('#5A3A22', '#2c1b0e', '#8a6038'); TEX.panelMahog = panelTex('#5E2A1A', '#2e120a', '#8c4a30');
  /* ---- 墙面 ---- */
  // 石色抹灰加假石缝（1.2 × 0.6 m），贴图 2.4 m
  { const [c, g] = cv(256); g.fillStyle = '#E6DFD2'; g.fillRect(0, 0, 256, 256); clouds(g, 256, 256, 10, '#b9ae99', 0.07);
    g.strokeStyle = 'rgba(150,138,118,.45)'; g.lineWidth = 1; for (let j = 0; j < 4; j++) { const y = j * 64 + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let i = 0; i < 2; i++) { const x = i * 128 + (j % 2) * 64 + 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } }
    speck(g, 256, 256, 700, ['rgba(255,255,255,.08)', 'rgba(120,110,95,.05)']); TEX.plasterStone = tx(c); }
  // 锦缎（0.64 m 一个团花，错位排布）
  const damask = (base, motif, hi) => { const [c, g] = cv(128); g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    const med = (x, y, s) => { g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = motif;
      for (const sx of [-1, 1]) { g.save(); g.scale(sx, 1); g.beginPath(); g.moveTo(0, -30); g.bezierCurveTo(10, -26, 18, -12, 8, -4); g.bezierCurveTo(22, -6, 24, 10, 10, 12); g.bezierCurveTo(14, 20, 6, 28, 0, 32); g.closePath(); g.fill();
        g.beginPath(); g.ellipse(16, -20, 3, 7, 0.6, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(18, 22, 3, 6, -0.6, 0, Math.PI * 2); g.fill(); g.restore(); }
      g.fillStyle = hi; g.beginPath(); g.ellipse(0, 2, 3, 9, 0, 0, Math.PI * 2); g.fill(); g.restore(); };
    for (const [x, y] of [[64, 64], [0, 0], [128, 0], [0, 128], [128, 128]]) med(x, y, 0.95);
    for (const [x, y] of [[0, 64], [128, 64], [64, 0], [64, 128]]) med(x, y, 0.35);
    return tx(c); };
  TEX.damask = damask('#7B1E2B', '#5C1420', 'rgba(210,150,120,.25)');
  // 丝墙布：细竖纹（近白，材质色上色）
  { const [c, g] = cv(64); g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 64, 64); for (let x = 0; x < 64; x++) { g.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.05})`; g.fillRect(x, 0, 1, 64); }
    for (let x = 0; x < 64; x += 16) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, 0, 2, 64); } TEX.silk = tx(c, false); }
  // 中国风手绘壁纸（花鸟），贴图 2.4 m
  { const [c, g] = cv(256); g.fillStyle = '#E4E0C8'; g.fillRect(0, 0, 256, 256); clouds(g, 256, 256, 8, '#c9c3a0', 0.12);
    for (let b = 0; b < 5; b++) { let x = R() * 256, y = 256; const pts = []; while (y > -10) { pts.push([x, y]); x += (R() - 0.5) * 40; y -= 18 + R() * 20; }
      tile9(256, 256, (ox, oy) => { if (oy) return; g.strokeStyle = '#6d5a42'; g.lineWidth = 2.2; g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px + ox, py) : g.moveTo(px + ox, py)); g.stroke();
        for (const [px, py] of pts) { for (let l = 0; l < 3; l++) { g.fillStyle = ['#6f8a5a', '#879f6a', '#5b7a4e'][l]; g.beginPath(); g.ellipse(px + ox + (R() - 0.5) * 16, py + (R() - 0.5) * 12, 2.5, 6, R() * 3, 0, Math.PI * 2); g.fill(); }
          if (R() < 0.5) { g.fillStyle = R() < 0.5 ? '#e6a8a8' : '#f4efe4'; g.beginPath(); g.arc(px + ox + 6, py - 4, 3.2, 0, Math.PI * 2); g.fill(); } } }); }
    for (let k = 0; k < 4; k++) { const x = 30 + R() * 200, y = 30 + R() * 200; g.fillStyle = '#5f7f9a'; g.beginPath(); g.ellipse(x, y, 7, 4, -0.3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x - 18, y + 6); g.lineTo(x - 16, y + 1); g.fill(); g.fillStyle = '#d8b26a'; g.beginPath(); g.arc(x + 6, y - 2, 2.5, 0, Math.PI * 2); g.fill(); }
    TEX.chinoiserie = tx(c); }
  // 白瓷砖墙裙（地铁砖 15 × 7.5 cm），贴图 0.6 m
  { const [c, g] = cv(128); g.fillStyle = '#c9c4ba'; g.fillRect(0, 0, 128, 128);
    for (let j = 0; j < 8; j++) for (let i = -1; i < 5; i++) { const x = i * 32 + (j % 2) * 16; g.fillStyle = shade('#f3f0ea', 0.97 + R() * 0.04); g.fillRect(x + 1, j * 16 + 1, 30, 14); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 2, j * 16 + 2, 28, 2); }
    TEX.tileWhite = tx(c); }
  { const [c, g] = cv(128); g.fillStyle = '#E8D8A8'; g.fillRect(0, 0, 128, 128); clouds(g, 128, 128, 10, '#c9b27a', 0.1); speck(g, 128, 128, 300, ['rgba(255,255,255,.1)']); TEX.plasterYellow = tx(c); }
  // 仿斑岩人造大理石
  { const [c, g] = marbleCanvas(128, '#6B2E35', '#C4A48C', 4, 0.05, [0.4, 1.2]); speck(g, 128, 128, 380, ['rgba(196,164,140,.55)', 'rgba(40,12,16,.4)', 'rgba(230,210,190,.35)'], 0.8, 2.4); TEX.scagliola = tx(c); }
  /* ---- 织物与卫浴 ---- */
  // 毛巾绒圈法线（64²，无缝）
  { const N = 64, h = new Float32Array(N * N); for (let i = 0; i < 260; i++) { const x = R() * N, y = R() * N, r = 1.2 + R() * 1.6;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.hypot(dx, dy) / r; if (d < 1) { const ix = ((Math.round(x) + dx) % N + N) % N, iy = ((Math.round(y) + dy) % N + N) % N; h[iy * N + ix] += Math.cos(d * Math.PI / 2); } } }
    const [c, g] = cv(N), d = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const H0 = (xx, yy) => h[((yy + N) % N) * N + ((xx + N) % N)]; const nx = (H0(x - 1, y) - H0(x + 1, y)) * 0.9, ny = (H0(x, y - 1) - H0(x, y + 1)) * 0.9; const l = Math.hypot(nx, ny, 1);
      const i = (y * N + x) * 4; d.data[i] = (nx / l * 0.5 + 0.5) * 255; d.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; d.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); TEX.towelN = tx(c, false); }
  // 藤编（篮子）
  { const [c, g] = cv(64); g.fillStyle = '#7a5a33'; g.fillRect(0, 0, 64, 64);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const hz = (i + j) % 2; g.fillStyle = shade('#C49A5E', 0.9 + R() * 0.15); if (hz) g.fillRect(i * 8 + 0.5, j * 8 + 1.5, 7, 5); else g.fillRect(i * 8 + 1.5, j * 8 + 0.5, 5, 7); }
    TEX.rattan = tx(c); }
  /* ---- 地毯（各自成套；去饱和约 15%，磨损，短边 3 px 流苏） ---- */
  const rose = (g, x, y, r, c1, c2) => { g.fillStyle = c1; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = c2; g.lineWidth = Math.max(0.6, r * 0.25); for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x, y, r * (0.35 + k * 0.22), k, k + 3.6); g.stroke(); } };
  const leaf = (g, x, y, l, a, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, l, l * 0.38, a, 0, Math.PI * 2); g.fill(); };
  const fringe = (g, W, Hh, col, vertical = true) => { g.fillStyle = col; for (let x = 0; x < W; x += 2) { g.fillRect(x, 0, 1, 3); g.fillRect(x, Hh - 3, 1, 3); } };
  const wreath = (g, cx, cy, rx, ry, n, pal, rs = 3) => { for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      leaf(g, x, y, 5, a + 0.8, pal.leaf); leaf(g, x + Math.cos(a + 1.6) * 3, y + Math.sin(a + 1.6) * 3, 4, a - 0.6, shade(pal.leaf, 1.2)); if (k % 3 === 0) rose(g, x, y, rs + R() * 1.5, pal.rose, shade(pal.rose, 0.7)); } };
  const vineBand = (g, x0, y0, x1, y1, pal, n) => { const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L; g.strokeStyle = pal.gold; g.lineWidth = 1.4; g.beginPath();
    for (let s = 0; s <= L; s += 2) { const w = Math.sin(s / L * Math.PI * n) * 4; const x = x0 + ux * s - uy * w, y = y0 + uy * s + ux * w; s ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    for (let k = 0; k < n; k++) { const s = (k + 0.5) / n * L, w = Math.sin((k + 0.5) * Math.PI) * 4, x = x0 + ux * s - uy * w, y = y0 + uy * s + ux * w; if (k % 2) rose(g, x, y, 2.6, pal.rose, shade(pal.rose, 0.7)); else leaf(g, x, y, 4, Math.atan2(uy, ux) + 0.7, pal.leaf); } };
  const aubusson = (pal, sav = false) => { const W = 256, [c, g] = cv(W);
    g.fillStyle = pal.border; g.fillRect(0, 0, W, W); g.fillStyle = pal.gold; g.fillRect(8, 8, W - 16, W - 16); g.fillStyle = pal.border; g.fillRect(10, 10, W - 20, W - 20);
    g.fillStyle = pal.gold; g.fillRect(30, 30, W - 60, W - 60); g.fillStyle = pal.field; g.fillRect(32, 32, W - 64, W - 64);
    for (const [a, b, cc, d] of [[20, 20, W - 20, 20], [20, W - 20, W - 20, W - 20], [20, 20, 20, W - 20], [W - 20, 20, W - 20, W - 20]]) vineBand(g, a, b, cc, d, pal, 14);
    clouds(g, W, W, 6, pal.field2, 0.2);
    if (sav) { for (const s of [-1, 1]) for (const hz of [0, 1]) { g.strokeStyle = pal.leaf; g.lineWidth = 3; g.beginPath(); for (let t = 0; t <= 1.001; t += 0.05) { const u = 50 + t * 156, v = 50 + Math.sin(t * Math.PI) * 26; const [x, y] = hz ? [s > 0 ? W - v : v, u] : [u, s > 0 ? W - v : v]; t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
        for (let t = 0; t <= 1; t += 0.12) { const u = 50 + t * 156, v = 50 + Math.sin(t * Math.PI) * 26; const [x, y] = hz ? [s > 0 ? W - v : v, u] : [u, s > 0 ? W - v : v]; rose(g, x, y, 3.2, pal.rose, shade(pal.rose, 0.7)); } } }
    g.fillStyle = pal.med; g.beginPath(); g.ellipse(128, 128, 48, 40, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = pal.gold; g.lineWidth = 1.5; g.stroke();
    wreath(g, 128, 128, 52, 44, 30, pal, 3.5); wreath(g, 128, 128, 22, 18, 12, pal, 2.6); rose(g, 128, 128, 7, pal.rose, shade(pal.rose, 0.65));
    for (const [x, y] of [[32, 32], [W - 32, 32], [32, W - 32], [W - 32, W - 32]]) { g.save(); g.beginPath(); g.rect(32, 32, W - 64, W - 64); g.clip(); wreath(g, x, y, 34, 34, 18, pal, 3); g.restore(); }
    for (let k = 0; k < 14; k++) { const x = 50 + R() * 156, y = 50 + R() * 156; if (Math.hypot(x - 128, y - 128) < 64) continue; rose(g, x, y, 2.4, pal.rose, shade(pal.rose, 0.7)); leaf(g, x + 3, y + 2, 3, R() * 3, pal.leaf); }
    wear(c, 0.15, 12, 0.08); fringe(g, W, W, '#e8dcc4'); return tx(c, true, false); };
  const heriz = () => { const W = 256, [c, g] = cv(W), RED = '#7A2A22', IND = '#27304F', IV = '#E3D4B8', GD = '#C9A24B';
    g.fillStyle = IND; g.fillRect(0, 0, W, W); g.fillStyle = IV; g.fillRect(6, 6, W - 12, W - 12); g.fillStyle = IND; g.fillRect(8, 8, W - 16, W - 16);
    for (let s = 12; s < W - 12; s += 16) for (const [x, y] of [[s, 18], [s, W - 18], [18, s], [W - 18, s]]) { g.fillStyle = (s / 16) % 2 ? RED : IV; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.fill(); }
    g.fillStyle = GD; g.fillRect(28, 28, W - 56, W - 56); g.fillStyle = RED; g.fillRect(30, 30, W - 60, W - 60);
    const poly = (cx, cy, r, n, col, rot = 0) => { g.fillStyle = col; g.beginPath(); for (let k = 0; k < n * 2; k++) { const a = rot + k * Math.PI / n, rr = k % 2 ? r * 0.72 : r; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fill(); g.strokeStyle = GD; g.lineWidth = 1; g.stroke(); };
    poly(128, 128, 70, 8, IND); poly(128, 128, 54, 8, IV, Math.PI / 8); poly(128, 128, 38, 8, RED); poly(128, 128, 20, 4, IND, Math.PI / 4); poly(128, 128, 8, 4, GD);
    for (const [x, y] of [[30, 30], [W - 30, 30], [30, W - 30], [W - 30, W - 30]]) { g.save(); g.beginPath(); g.rect(30, 30, W - 60, W - 60); g.clip(); poly(x, y, 42, 4, IND, Math.PI / 4); poly(x, y, 26, 4, IV, Math.PI / 4); g.restore(); }
    for (let k = 0; k < 40; k++) { const x = 40 + R() * 176, y = 40 + R() * 176; if (Math.hypot(x - 128, y - 128) < 78) continue; g.fillStyle = [IV, IND, GD, '#5b6a4a'][(R() * 4) | 0]; g.fillRect(x, y, 4, 1.6); g.fillRect(x + 1.2, y - 1.2, 1.6, 4); }
    wear(c, 0.15, 14, 0.1); fringe(g, W, W, '#e8dcc4'); return tx(c, true, false); };
  const runner = (field, border, gold, med) => { const W = 128, Hh = 512, [c, g] = cv(W, Hh); g.fillStyle = border; g.fillRect(0, 0, W, Hh); g.fillStyle = gold; g.fillRect(12, 12, W - 24, Hh - 24); g.fillStyle = field; g.fillRect(14, 14, W - 28, Hh - 28);
    for (let y = 60; y < Hh - 40; y += 98) { g.fillStyle = med; g.beginPath(); g.ellipse(64, y, 30, 36, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = gold; g.lineWidth = 1.2; g.stroke(); wreath(g, 64, y, 22, 28, 14, { leaf: '#6F7F5B', rose: '#B7776B' }, 2.4); }
    for (let y = 16; y < Hh - 16; y += 12) { g.fillStyle = gold; g.fillRect(4, y, 4, 5); g.fillRect(W - 8, y + 6, 4, 5); }
    wear(c, 0.15, 12, 0.1); fringe(g, W, Hh, '#e8dcc4'); return tx(c, true, false); };
  TEX.rugAubAzure = aubusson({ field: '#2E4068', field2: '#3a5080', border: '#1f2b47', gold: '#C9A24B', leaf: '#C9A24B', rose: '#d9b56a', med: '#34487a' });
  TEX.rugAubCrimson = aubusson({ field: '#7A2A22', field2: '#8a3a2e', border: '#3a1a16', gold: '#C9A24B', leaf: '#6F7F5B', rose: '#E3C9A0', med: '#8a3328' });
  TEX.rugAubIvory = aubusson({ field: '#E3D4B8', field2: '#d6c3a0', border: '#8a6a55', gold: '#C9A24B', leaf: '#6F7F5B', rose: '#B7776B', med: '#eadcc4' });
  TEX.rugSavIvory = aubusson({ field: '#EAE0CA', field2: '#dccfb2', border: '#5b4638', gold: '#b89b6a', leaf: '#6F7F5B', rose: '#B7776B', med: '#f0e6d2' }, true);
  TEX.rugHeriz = heriz();
  TEX.rugRunner = runner('#7A2A22', '#27304F', '#C9A24B', '#8a3328');
  // 接触阴影
  { const [c, g] = cv(64); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); TEX.blob = tx(c, false, false); }
  // 栏杆面板（岛缘长栏杆用贴图代替实体小柱）
  { const [c, g] = cv(64); g.clearRect(0, 0, 64, 64); g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(24, 64); g.lineTo(40, 64); g.lineTo(38, 56); g.bezierCurveTo(46, 44, 44, 30, 36, 22); g.lineTo(38, 8); g.lineTo(26, 8); g.lineTo(28, 22); g.bezierCurveTo(20, 30, 18, 44, 26, 56); g.closePath(); g.fill();
    g.fillRect(22, 0, 20, 8); TEX.balPanel = tx(c, false); }
  /* ---- 画作图集 512 × 256：8 格（0–4 肖像，5 下层港口，6 星图表盘，7 湖景写生） ---- */
  { const [c, g] = cv(512, 256);
    const cell = (i) => [(i % 4) * 128, ((i / 4) | 0) * 128];
    const portrait = (i, v) => { const [x0, y0] = cell(i); g.save(); g.beginPath(); g.rect(x0, y0, 128, 128); g.clip();
      const bg = g.createRadialGradient(x0 + 60, y0 + 40, 10, x0 + 64, y0 + 64, 110); bg.addColorStop(0, v.bg1); bg.addColorStop(1, v.bg2); g.fillStyle = bg; g.fillRect(x0, y0, 128, 128);
      if (v.drape) { g.fillStyle = v.drape; g.beginPath(); g.moveTo(x0 + 90, y0); g.bezierCurveTo(x0 + 120, y0 + 40, x0 + 100, y0 + 80, x0 + 128, y0 + 128); g.lineTo(x0 + 128, y0); g.fill(); }
      g.fillStyle = v.coat; g.beginPath(); g.moveTo(x0 + 18, y0 + 128); g.bezierCurveTo(x0 + 24, y0 + 88, x0 + 40, y0 + 78, x0 + 64, y0 + 76); g.bezierCurveTo(x0 + 88, y0 + 78, x0 + 104, y0 + 88, x0 + 110, y0 + 128); g.fill();
      if (v.sash) { g.strokeStyle = v.sash; g.lineWidth = 7; g.beginPath(); g.moveTo(x0 + 40, y0 + 84); g.lineTo(x0 + 92, y0 + 128); g.stroke(); }
      g.fillStyle = v.collar; g.beginPath(); g.moveTo(x0 + 54, y0 + 78); g.lineTo(x0 + 64, y0 + 100); g.lineTo(x0 + 74, y0 + 78); g.fill();
      g.fillStyle = '#d6a984'; g.beginPath(); g.ellipse(x0 + 64, y0 + 56, 14, 18, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(120,70,40,.25)'; g.beginPath(); g.ellipse(x0 + 70, y0 + 60, 8, 14, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = v.hair; g.beginPath(); g.ellipse(x0 + 64, y0 + 44, 17, 12, 0, Math.PI, Math.PI * 2); g.fill(); if (v.long) { g.beginPath(); g.ellipse(x0 + 50, y0 + 60, 6, 16, 0.1, 0, Math.PI * 2); g.ellipse(x0 + 78, y0 + 60, 6, 16, -0.1, 0, Math.PI * 2); g.fill(); }
      if (v.star) { g.fillStyle = '#e6c36a'; g.beginPath(); g.arc(x0 + 46, y0 + 100, 3, 0, Math.PI * 2); g.fill(); }
      const vg = g.createRadialGradient(x0 + 64, y0 + 64, 40, x0 + 64, y0 + 64, 96); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,6,2,.45)'); g.fillStyle = vg; g.fillRect(x0, y0, 128, 128);
      g.restore(); };
    portrait(0, { bg1: '#5a4a34', bg2: '#1c150e', coat: '#1d2233', collar: '#efe8da', hair: '#d8d4cc', sash: '#2C3E63', star: 1 });
    portrait(1, { bg1: '#4a3a2c', bg2: '#150f0a', coat: '#3a1a1c', collar: '#f1e9d8', hair: '#3a2a1c', long: 1, drape: '#6b2028' });
    portrait(2, { bg1: '#3e4a3a', bg2: '#12160f', coat: '#23282a', collar: '#ece5d4', hair: '#6b4a2a', sash: '#7B1E2B' });
    portrait(3, { bg1: '#5c4a3a', bg2: '#1a120c', coat: '#2c3e63', collar: '#efe8da', hair: '#8a6a3c', long: 1 });
    portrait(4, { bg1: '#4a4034', bg2: '#16110c', coat: '#141414', collar: '#f3ede0', hair: '#9a9690', star: 1, drape: '#2C3E63' });
    { const [x0, y0] = cell(5); const sk = g.createLinearGradient(0, y0, 0, y0 + 128); sk.addColorStop(0, '#9fb3c4'); sk.addColorStop(0.6, '#e8d6b0'); sk.addColorStop(1, '#c9b48a'); g.fillStyle = sk; g.fillRect(x0, y0, 128, 128);
      g.fillStyle = 'rgba(255,255,255,.6)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x0 + R() * 128, y0 + 90 + R() * 30, 30, 6, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#6f6a5a'; g.beginPath(); g.moveTo(x0 + 20, y0 + 70); g.lineTo(x0 + 70, y0 + 64); g.lineTo(x0 + 60, y0 + 86); g.closePath(); g.fill(); g.fillStyle = '#8a7e66'; for (let k = 0; k < 8; k++) g.fillRect(x0 + 28 + k * 4, y0 + 60 - (k % 3) * 3, 3, 8);
      g.fillStyle = '#5b5446'; g.beginPath(); g.moveTo(x0 + 84, y0 + 50); g.lineTo(x0 + 116, y0 + 48); g.lineTo(x0 + 104, y0 + 64); g.closePath(); g.fill(); }
    { const [x0, y0] = cell(6); g.fillStyle = '#B5913F'; g.fillRect(x0, y0, 128, 128); const cx = x0 + 64, cy = y0 + 64;
      g.fillStyle = '#16213d'; g.beginPath(); g.arc(cx, cy, 60, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#e6c36a'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 58, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(cx, cy, 44, 0, Math.PI * 2); g.stroke();
      for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; g.lineWidth = k % 3 ? 1.2 : 3; g.beginPath(); g.moveTo(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46); g.lineTo(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56); g.stroke(); }
      g.fillStyle = '#f3e6b8'; for (let k = 0; k < 60; k++) { const a = R() * 6.28, r = R() * 42; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.3, 1.3); }
      g.strokeStyle = 'rgba(230,195,106,.6)'; g.lineWidth = 0.7; g.beginPath(); for (let k = 0; k < 7; k++) { const a = k * 0.8, r = 12 + k * 4; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.fillStyle = '#e6c36a'; g.beginPath(); g.arc(cx + 14, cy - 18, 3, 0, Math.PI * 2); g.fill(); }
    { const [x0, y0] = cell(7); const sk = g.createLinearGradient(0, y0, 0, y0 + 128); sk.addColorStop(0, '#b8c6cc'); sk.addColorStop(0.55, '#e9dfc4'); sk.addColorStop(0.56, '#6d8a7c'); sk.addColorStop(1, '#3f5a52'); g.fillStyle = sk; g.fillRect(x0, y0, 128, 128);
      g.fillStyle = '#4e6a3e'; for (let k = 0; k < 9; k++) { g.beginPath(); g.ellipse(x0 + k * 16 + R() * 6, y0 + 66, 10, 12, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#efe9dc'; g.fillRect(x0 + 58, y0 + 60, 14, 12); g.beginPath(); g.ellipse(x0 + 65, y0 + 60, 9, 6, 0, Math.PI, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x0 + 50, y0 + 80, 30, 2); }
    wear(c, 0.05, 8, 0); TEX.art = tx(c, true, false); }
}
// 图集格 i 的 uv 矩形（flipY：画布上方 = v 大）
export const ART = (i, inset = 0.06) => { const x = (i % 4) / 4, y = ((i / 4) | 0) / 2; const du = 0.25 * inset, dv = 0.5 * inset; return [x + du, 1 - y - 0.5 + dv, x + 0.25 - du, 1 - y - dv]; };

/* ---------------- 材质 ---------------- */
export const MATS = {};
export const UVS = {};          // 需要世界坐标 UV 的材质 → 每张纹理覆盖的米数
export const NOCAST = new Set(); // 不投影
export const GOLD = '#e6c36a';
export let TIER = 0;            // 0 桌面 / 1 移动 / 2 低配（无 Physical）
export function initMaterials(envMap, tier = 0) {
  TIER = tier | 0; makeTextures();
  const phys = TIER < 2;
  const PHYS = ['clearcoat', 'clearcoatRoughness', 'sheen', 'sheenRoughness', 'sheenColor', 'transmission', 'ior', 'thickness'];
  const S = (key, p, uv, cast = true) => {
    let m;
    const isPhys = phys && (p.clearcoat || p.sheen);
    if (isPhys) { const q = { vertexColors: true, ...p }; if (q.sheenColor !== undefined) q.sheenColor = new THREE.Color(q.sheenColor); m = new THREE.MeshPhysicalMaterial(q); }
    else { const q = { vertexColors: true }; for (const k in p) if (!PHYS.includes(k)) q[k] = p[k]; if (p.sheen && q.roughness !== undefined) q.roughness = Math.min(1, q.roughness + 0.05); m = new THREE.MeshStandardMaterial(q); }
    if (envMap) m.envMap = envMap; MATS[key] = m; if (uv) UVS[key] = uv; if (!cast) NOCAST.add(key); return m;
  };
  /* 外壳与构件（旧键） */
  S('stone', { color: '#ffffff', map: TEX.ashlar, roughness: 0.75 }, 4);
  S('rustic', { color: '#ffffff', map: TEX.rustic, roughness: 0.8 }, 4.2);
  S('trim', { color: '#F0ECE3', roughness: 0.6 });
  S('trimShade', { color: '#d8cfbf', roughness: 0.8 });
  S('frame', { color: '#f6f3ec', roughness: 0.5 });
  S('glass', { color: '#1A2229', roughness: 0.05, metalness: 0.3, envMapIntensity: 1.4, emissive: '#ffb865', emissiveIntensity: 0.25 });
  S('cap', { color: '#2d2723', roughness: 1 }, null, true);
  S('lead', { color: '#858B90', roughness: 0.7, metalness: 0.3 });
  S('gold', { color: GOLD, roughness: 0.25, metalness: 1, envMapIntensity: 1.3 });
  S('ormolu', { color: '#C9A24B', roughness: 0.3, metalness: 1, envMapIntensity: 1.2 });
  S('brass', { color: '#B5913F', roughness: 0.2, metalness: 1, envMapIntensity: 1.25 });
  S('nickel', { color: '#C7C9C8', roughness: 0.15, metalness: 1, envMapIntensity: 1.2 });
  S('iron', { color: '#26272A', roughness: 0.5, metalness: 0.8 });
  S('glow', { color: '#fff3d6', emissive: '#ffcf7a', emissiveIntensity: 1.6, roughness: 0.4 });
  S('crystal', { color: '#f2f5f7', roughness: 0.04, metalness: 0.25, envMapIntensity: 1.6, emissive: '#fff2d8', emissiveIntensity: 0.35 });
  S('mirror', { color: '#d9e0e2', roughness: 0.04, metalness: 1, envMapIntensity: 1.1 });
  /* 木作 */
  S('mahogany', { color: '#ffffff', map: TEX.mahogany, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.12 }, 1.2);
  S('walnut', { color: '#ffffff', map: TEX.walnut, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.15 }, 1.2);
  S('ebony', { color: '#1C1512', roughness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.1 });
  S('satinwood', { color: '#ffffff', map: TEX.satinwood, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.12 }, 0.8);
  S('woodDark', { color: '#ffffff', map: TEX.walnut, roughness: 0.4 }, 1.2);
  S('woodMid', { color: '#86603f', roughness: 0.5 });
  S('piano', { color: '#0d0d0f', roughness: 0.14, metalness: 0.2, envMapIntensity: 1.2, clearcoat: 1, clearcoatRoughness: 0.04 });
  /* 石材 */
  S('marble', { color: '#ffffff', map: TEX.statuario, roughness: 0.2, envMapIntensity: 0.7 }, 2, false);
  S('marbleC', { color: '#ffffff', map: TEX.statuario, roughness: 0.2, envMapIntensity: 0.7 }, 2, false);
  S('marbleW', { color: '#ffffff', map: TEX.statTop, roughness: 0.18, envMapIntensity: 0.8 }, 1.4);
  S('marbleGold', { color: '#ffffff', map: TEX.calacatta, roughness: 0.18, envMapIntensity: 0.8 }, 1.6);
  S('marbleBlack', { color: '#ffffff', map: TEX.nero, roughness: 0.15, envMapIntensity: 0.9 }, 1.6);
  S('checker', { color: '#ffffff', map: TEX.checker, roughness: 0.28, envMapIntensity: 0.6 }, 1.2 * Math.SQRT2, false);
  S('checkSmall', { color: '#ffffff', map: TEX.checkSmall, roughness: 0.25, envMapIntensity: 0.6 }, 1.2, false);
  S('compass', { color: '#ffffff', map: TEX.compass, roughness: 0.22, envMapIntensity: 0.6 }, 12.8, false);
  TEX.compass.offset.set(0.5, 0.5 - 2 / 12.8);
  S('scagliola', { color: '#ffffff', map: TEX.scagliola, roughness: 0.15, envMapIntensity: 0.9 }, 1);
  S('stoneFlag', { color: '#ffffff', map: TEX.stoneFlag, roughness: 0.85 }, 3, false);
  /* 地板 */
  S('parquet', { color: '#ffffff', map: TEX.oak, roughness: 0.45 }, 2.4, false);
  S('oak', { color: '#ffffff', map: TEX.oak, roughness: 0.45 }, 2.4, false);
  S('herring', { color: '#ffffff', map: TEX.herring, roughness: 0.42 }, 0.9, false);
  S('versailles', { color: '#ffffff', map: TEX.versailles, roughness: 0.42 }, 2, false);
  S('lino', { color: '#ffffff', map: TEX.lino, roughness: 0.6 }, 2, false);
  S('tile', { color: '#ffffff', map: TEX.tile, roughness: 0.3 }, 1, false);
  S('pavers', { color: '#ffffff', map: TEX.pavers, roughness: 0.85 }, 4, false);
  /* 墙面 */
  S('plaster', { color: '#E9E1CF', roughness: 0.85 });
  S('plasterStone', { color: '#ffffff', map: TEX.plasterStone, roughness: 0.85 }, 2.4);
  S('plasterYellow', { color: '#ffffff', map: TEX.plasterYellow, roughness: 0.85 }, 2);
  S('paint', { color: '#ebe5d8', roughness: 0.55 });
  S('paintIvory', { color: '#EDE6D6', roughness: 0.6 });
  S('paintSage', { color: '#a7b19a', roughness: 0.6 });
  S('damaskRed', { color: '#ffffff', map: TEX.damask, roughness: 0.6, sheen: 0.6, sheenRoughness: 0.5, sheenColor: '#d08a8a' }, 0.64);
  const silk = (key, col, sc) => S(key, { color: col, map: TEX.silk, roughness: 0.6, sheen: 0.6, sheenRoughness: 0.45, sheenColor: sc }, 0.5);
  silk('silkBlue', '#2C3E63', '#8aa0c8'); silk('silkGreen', '#2F5D4E', '#8fb8a4'); silk('silkRose', '#C99A93', '#f0d0c8'); silk('silkIvory', '#EEE7D8', '#ffffff'); silk('silkDuck', '#BFD3CB', '#ffffff');
  S('chinoiserie', { color: '#ffffff', map: TEX.chinoiserie, roughness: 0.75 }, 2.4);
  S('panelWalnut', { color: '#ffffff', map: TEX.panelWalnut, roughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.2 }, 1.2);
  S('panelMahog', { color: '#ffffff', map: TEX.panelMahog, roughness: 0.42, clearcoat: 0.2, clearcoatRoughness: 0.2 }, 1.2);
  S('tileWhite', { color: '#ffffff', map: TEX.tileWhite, roughness: 0.2 }, 0.6);
  /* 卫浴与织物 */
  S('porcelain', { color: '#F6F4EF', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  S('enamel', { color: '#ffffff', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08 });                      // 顶点着色：珐琅、漆面、纹章蓝
  S('towel', { color: '#ffffff', roughness: 1, normalMap: TEX.towelN, normalScale: new THREE.Vector2(0.9, 0.9), sheen: 0.8, sheenRoughness: 0.9, sheenColor: '#ffffff' }, 0.035);   // 顶点着色，默认 #F4EFE4
  S('linen', { color: '#F7F4EE', roughness: 0.9, sheen: 0.25, sheenRoughness: 0.6, sheenColor: '#ffffff' });
  S('fab', { color: '#ffffff', roughness: 0.75, sheen: 0.5, sheenRoughness: 0.5, sheenColor: '#e8dcc8' });           // 顶点着色：丝缎、亚麻
  S('velvet', { color: '#ffffff', roughness: 0.85, sheen: 0.9, sheenRoughness: 0.35, sheenColor: '#c8b8a0' });      // 顶点着色：丝绒
  S('velvetChamp', { color: '#CDB58A', roughness: 0.8, sheen: 0.9, sheenRoughness: 0.35, sheenColor: '#f0e2c0' });
  S('rattan', { color: '#ffffff', map: TEX.rattan, roughness: 0.8 }, 0.12);
  S('art', { color: '#ffffff', map: TEX.art, roughness: 0.55, vertexColors: false });
  S('fabCream', { color: '#EEE7D8', roughness: 0.95 });
  S('fabSage', { color: '#2F5D4E', roughness: 0.85 });
  S('fabNavy', { color: '#2C3E63', roughness: 0.85 });
  S('fabRose', { color: '#C99A93', roughness: 0.9 });
  S('fabBurg', { color: '#7B1E2B', roughness: 0.85 });
  S('fabGold', { color: '#CDB58A', roughness: 0.8 });
  S('leather', { color: '#5e3b27', roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4 });
  S('leatherG', { color: '#2f4a3a', roughness: 0.55 });
  S('books', { color: '#ffffff', map: TEX.books, roughness: 0.8 });
  S('screen', { color: '#10202c', emissive: '#6fb2e0', emissiveIntensity: 0.9, roughness: 0.3 });
  S('led', { color: '#223', emissive: '#7ee0a8', emissiveIntensity: 1.2 });
  /* 园林 */
  S('soil', { color: '#6f5a44', roughness: 1 }, null, false);
  S('grass', { color: '#ffffff', map: TEX.grass, roughness: 1 }, 12, false);
  S('gravel', { color: '#e6dccb', map: TEX.gravel, roughness: 1 }, 3, false);
  S('hedge', { color: '#ffffff', map: TEX.hedge, roughness: 1 }, 2);
  S('flowers', { color: '#ffffff', map: TEX.flowers, roughness: 1 }, 2, false);
  S('roses', { color: '#ffffff', map: TEX.roses, roughness: 1 }, 2, false);
  S('foliage', { color: '#5f7d45', roughness: 0.95 });
  S('bark', { color: '#5a4636', roughness: 1 });
  S('water', { color: '#2a4f5c', roughness: 0.08, metalness: 0.0, envMapIntensity: 0.6 }, null, false);
  S('rock', { color: '#ffffff', map: TEX.rock, roughness: 1 });
  S('root', { color: '#4a3b2c', roughness: 1 });
  S('moss', { color: '#5b6d3b', roughness: 1 });
  S('terracotta', { color: '#b0694a', roughness: 0.9 });
  /* 地毯（整张贴图，不用世界 UV） */
  const RUGS = { rugAubAzure: TEX.rugAubAzure, rugAubCrimson: TEX.rugAubCrimson, rugAubIvory: TEX.rugAubIvory, rugSavIvory: TEX.rugSavIvory, rugHeriz: TEX.rugHeriz, rugRunner: TEX.rugRunner,
    rugBurg: TEX.rugHeriz, rugNavy: TEX.rugAubAzure, rugSage: TEX.rugSavIvory, rugRose: TEX.rugAubIvory };
  for (const [k, t] of Object.entries(RUGS)) { S(k, { color: '#ffffff', map: t, roughness: 0.95 }, null, false); MATS[k].polygonOffset = true; MATS[k].polygonOffsetFactor = -1; }
  const tr = (key, p) => { const m = S(key, { transparent: true, depthWrite: false, ...p }, null, false); return m; };
  tr('blob', { color: '#000000', map: TEX.blob, opacity: 0.42, vertexColors: false });
  tr('glassHouse', { color: '#d9ece9', opacity: 0.3, roughness: 0.05, metalness: 0.2 });
  tr('spray', { color: '#f4fbff', opacity: 0.45, roughness: 0.2 });
  S('balPanel', { color: '#efe9de', map: TEX.balPanel, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, vertexColors: false });
  MATS.blob.polygonOffset = true; MATS.blob.polygonOffsetFactor = -2;
  return MATS;
}

/* ---------------- 世界坐标 UV ---------------- */
function worldUV(g, s) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, uv = g.attributes.uv.array;
  for (let i = 0, cnt = g.attributes.position.count; i < cnt; i++) {
    const ax = Math.abs(n[i * 3]), ay = Math.abs(n[i * 3 + 1]), az = Math.abs(n[i * 3 + 2]);
    let u, v;
    if (ay >= ax && ay >= az) { u = p[i * 3]; v = p[i * 3 + 2]; } else if (ax >= az) { u = p[i * 3 + 2]; v = p[i * 3 + 1]; } else { u = p[i * 3]; v = p[i * 3 + 1]; }
    uv[i * 2] = u / s; uv[i * 2 + 1] = v / s;
  }
}

/* ---------------- 实例原型 ---------------- */
export const PROTO = {};
function vcolGrad(g, y0, y1, c0, c1) {
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))); const f = c0 + (c1 - c0) * t; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
function jitter(g, amt, seed) {
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const r = srand(seed), p = g.attributes.position, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let d = map.get(k); if (d === undefined) { d = 1 + (r() - 0.5) * amt; map.set(k, d); }
    p.setXYZ(i, p.getX(i) * d, p.getY(i) * d, p.getZ(i) * d);
  }
  g.computeVertexNormals(); return g;
}
function prep(g) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); if (!g.attributes.color) vcolGrad(g, 0, 1, 1, 1); return g.index ? g.toNonIndexed() : g; }
export function initProtos() {
  const bal = [[0, 0], [.12, 0], [.12, .08], [.065, .16], [.125, .44], [.1, .56], [.055, .68], [.11, .78], [.12, .86], [0, .86]];
  PROTO.baluster = { geom: prep(new THREE.LatheGeometry(bal.map(p => new THREE.Vector2(p[0], p[1])), 6)), mat: 'trim' };
  PROTO.crown = { geom: vcolGrad(jitter(new THREE.IcosahedronGeometry(1, 1), 0.35, 3), -1, 1, 0.62, 1.08), mat: 'foliage' };
  PROTO.crown2 = { geom: vcolGrad(jitter(new THREE.IcosahedronGeometry(1, 1), 0.5, 9), -1, 1, 0.6, 1.1), mat: 'foliage' };
  PROTO.cone = { geom: vcolGrad(jitter(new THREE.ConeGeometry(1, 1, 9, 2).translate(0, 0.5, 0), 0.12, 5), 0, 1, 0.65, 1.05), mat: 'foliage' };
  PROTO.ball = { geom: vcolGrad(jitter(new THREE.IcosahedronGeometry(1, 1), 0.08, 4), -1, 1, 0.7, 1.05), mat: 'foliage' };
  PROTO.trunk = { geom: prep(new THREE.CylinderGeometry(0.6, 1, 1, 6).translate(0, 0.5, 0)), mat: 'bark' };
  PROTO.root = { geom: prep(new THREE.ConeGeometry(1, 1, 5).rotateX(Math.PI).translate(0, -0.5, 0)), mat: 'root' };
  // 灯柱：铁杆 + 灯笼（发光）+ 金顶
  { const parts = [
      [new THREE.CylinderGeometry(0.22, 0.3, 0.7, 8).translate(0, 0.35, 0), 0],
      [new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6).translate(0, 2.3, 0), 0],
      [new THREE.CylinderGeometry(0.22, 0.14, 0.12, 6).translate(0, 3.9, 0), 0],
      [new THREE.CylinderGeometry(0.2, 0.14, 0.55, 6).translate(0, 4.22, 0), 1],
      [new THREE.ConeGeometry(0.26, 0.3, 6).translate(0, 4.65, 0), 2]];
    const gs = parts.map(([g]) => prep(g)); const m = mergeGeometries(gs, true);
    PROTO.lamp = { geom: m, mat: ['iron', 'glow', 'gold'] }; }
  { const parts = [[new THREE.CylinderGeometry(0.12, 0.15, 0.8, 8).translate(0, 0.4, 0), 0], [new THREE.CylinderGeometry(0.13, 0.13, 0.14, 8).translate(0, 0.87, 0), 1]];
    PROTO.bollard = { geom: mergeGeometries(parts.map(([g]) => prep(g)), true), mat: ['iron', 'glow'] }; }
  // 石瓮（栏杆墩与花园点缀）
  const urn = [[0, 0], [.28, 0], [.28, .1], [.14, .16], [.12, .26], [.34, .42], [.4, .6], [.34, .76], [.22, .82], [.26, .88], [.26, .92], [0, .92]];
  PROTO.urn = { geom: prep(new THREE.LatheGeometry(urn.map(p => new THREE.Vector2(p[0], p[1])), 10)), mat: 'trim' };
}

/* ---------------- Batch：同一组里按材质合并成一个网格（WP-C 段：从本行到文件尾） ----------------
   new Batch(name, { tile })  tile = 空间分块边长（米），>0 时每个材质按 XZ 网格分块合并，块各有包围球，视锥剔除才生效
   b.sub(tag)                 懒创建子批次（'detail' | 'fine' | 'hi-z' | 'hi+z' | 'hi-x' | 'hi+x'）；子批次的 sub() 仍回到根批次
   b.build({ defer })         子批次成为子组，放在 grp.userData.subs[tag]；defer 里的标签先不建，留在 grp.userData.pending[tag]
   buildPending(grp, tag)     按需补建被推迟的子批次，返回子组（或 null）
   合并时保留索引（没有索引的几何补一个顺序索引），顶点量约为非索引的 1/3 */
const KEEP = ['position', 'normal', 'uv'];
const TILE_MIN = 8000, TILE_MIN_INST = 40;   // 分块后顶点数低于它的块并入零散块
const _seqIdx = (n) => { const a = n > 65535 ? new Uint32Array(n) : new Uint16Array(n); for (let i = 0; i < n; i++) a[i] = i; return new THREE.BufferAttribute(a, 1); };
export class Batch {
  constructor(name, opt = {}) { this.name = name; this.tile = opt.tile || 0; this.parts = new Map(); this.insts = new Map(); this.subs = null; this.root = opt.root || null; }
  sub(tag) {
    if (this.root) return this.root.sub(tag);
    if (!this.subs) this.subs = new Map();
    let s = this.subs.get(tag); if (!s) { s = new Batch(this.name + ':' + tag, { tile: this.tile, root: this }); s.tag = tag; this.subs.set(tag, s); }
    return s;
  }
  add(key, geom, m, ao) {
    const g = geom.clone();
    if (m) g.applyMatrix4(m);
    const baked = !ao && g.attributes.color && g.attributes.color.itemSize === 3 ? g.attributes.color : null;
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
    for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
    const n = g.attributes.position.count;
    if (!g.index) g.setIndex(_seqIdx(n));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (UVS[key]) worldUV(g, UVS[key]);
    let col = baked;
    if (!col) {
      const c = new Float32Array(n * 3), pos = g.attributes.position.array;
      for (let i = 0; i < n; i++) { let f = 1; if (ao) { const t = Math.min(1, Math.max(0, (pos[i * 3 + 1] - ao[0]) / ao[1])); f = ao[2] + (1 - ao[2]) * t; } c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = f; }
      col = new THREE.BufferAttribute(c, 3);
    }
    g.setAttribute('color', col);
    g.groups = [];
    let l = this.parts.get(key); if (!l) this.parts.set(key, l = []); l.push(g); return g;
  }
  put(key, geom, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0, ao) { if (Array.isArray(rx)) { ao = rx; rx = 0; } return this.add(key, geom, mat4(x, y, z, sx, sy, sz, ry, rx, rz), ao); }
  box(key, cx, cy, cz, w, h, d, ry = 0, ao) { return this.add(key, G.box, mat4(cx, cy, cz, w, h, d, ry), ao); }
  bb(key, x0, y0, z0, x1, y1, z1, ao) { if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return; return this.box(key, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, 0, ao); }
  inst(proto, m, color) { let l = this.insts.get(proto); if (!l) this.insts.set(proto, l = []); l.push([m, color]); }
  _cell(x, z) { const T = this.tile; return Math.floor(x / T) + ',' + Math.floor(z / T); }
  build(opt = {}) {
    const grp = new THREE.Group(); grp.name = this.name;
    const T = this.tile;
    // 材质 × 分块
    for (const [key, list] of this.parts) {
      if (!list.length) continue;
      const mat = MATS[key]; if (!mat) { console.warn('no material', key); continue; }
      let buckets;
      if (T > 0) {
        buckets = new Map();
        for (const g of list) {
          const p = g.attributes.position.array; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
          for (let i = 0; i < p.length; i += 3) { const x = p[i], z = p[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
          const c = this._cell((x0 + x1) / 2, (z0 + z1) / 2); let b = buckets.get(c); if (!b) buckets.set(c, b = []); b.push(g);
        }
        // 顶点很少的块并回一个「零散」块，避免 draw call 爆炸
        const rest = []; for (const [c, b] of buckets) { let n = 0; for (const g of b) n += g.attributes.position.count; if (n < TILE_MIN) { rest.push(...b); buckets.delete(c); } }
        if (rest.length) buckets.set('rest', rest);
      } else buckets = new Map([['', list]]);
      for (const geoms of buckets.values()) {
        const merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
        if (!merged) { console.warn('merge failed', key); continue; }
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat); mesh.name = key;
        mesh.castShadow = !NOCAST.has(key); mesh.receiveShadow = !mat.transparent;
        if (mat.transparent) mesh.renderOrder = key === 'blob' ? 1 : 3;
        mesh.matrixAutoUpdate = false; grp.add(mesh);
      }
    }
    // 实例化原型（同样按块分）
    const c = new THREE.Color(), _p = new THREE.Vector3();
    for (const [name, all] of this.insts) {
      const P = PROTO[name]; if (!P) { console.warn('no proto', name); continue; }
      const mat = Array.isArray(P.mat) ? P.mat.map(k => MATS[k]) : MATS[P.mat];
      let buckets;
      if (T > 0) {
        buckets = new Map(); for (const e of all) { _p.setFromMatrixPosition(e[0]); const k = this._cell(_p.x, _p.z); let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(e); }
        const rest = []; for (const [k, b] of buckets) if (b.length < TILE_MIN_INST) { rest.push(...b); buckets.delete(k); }
        if (rest.length) buckets.set('rest', rest);
      }
      else buckets = new Map([['', all]]);
      for (const list of buckets.values()) {
        const im = new THREE.InstancedMesh(P.geom, mat, list.length); im.name = name;
        const colored = list.some(([, col]) => col !== undefined);
        list.forEach(([m, col], i) => { im.setMatrixAt(i, m); if (colored) im.setColorAt(i, c.set(col === undefined ? '#ffffff' : col)); });
        im.castShadow = name !== 'root'; im.receiveShadow = true; im.computeBoundingSphere(); im.matrixAutoUpdate = false; grp.add(im);
      }
    }
    this.parts.clear(); this.insts.clear();
    // 子批次
    grp.userData.subs = {}; grp.userData.pending = {};
    if (this.subs) for (const [tag, s] of this.subs) {
      if (opt.defer && opt.defer.includes(tag)) { grp.userData.pending[tag] = s; continue; }
      const sg = s.build(); sg.userData.tag = tag; grp.add(sg); grp.userData.subs[tag] = sg;
    }
    this.subs = null;
    return grp;
  }
}
export function buildPending(grp, tag) {
  const u = grp && grp.userData; if (!u || !u.pending || !u.pending[tag]) return (u && u.subs && u.subs[tag]) || null;
  const sg = u.pending[tag].build(); sg.userData.tag = tag; delete u.pending[tag]; grp.add(sg); u.subs[tag] = sg; return sg;
}

/* ---------------- Kit：局部坐标系（家具、亭子等），ry 旋转后放到世界 ---------------- */
export class Kit {
  constructor(b, x, y, z, ry = 0) { this.b = b; this.T = mat4(x, y, z, 1, 1, 1, ry); }
  // 同变换、写入 b.sub(tag) 的 Kit
  sub(tag) { const k = Object.create(Object.getPrototypeOf(this)); Object.assign(k, this); k.b = this.b && this.b.sub ? this.b.sub(tag) : this.b; return k; }
  _(m) { return m.premultiply(this.T); }
  box(key, x, y, z, w, h, d, ry = 0, rx = 0, rz = 0) { this.b.add(key, G.box, this._(mat4(x, y, z, w, h, d, ry, rx, rz))); }
  // 以底面为基准的盒子（y 为底）
  bx(key, x, y, z, w, h, d, ry = 0) { this.box(key, x, y + h / 2, z, w, h, d, ry); }
  cyl(key, x, y, z, r, h, seg = 12, top = 1, sx = 1, sz = 1, rx = 0, rz = 0) { this.b.add(key, G.cyl(seg, top), this._(mat4(x, y + h / 2, z, r * sx, h, r * sz, 0, rx, rz))); }
  sph(key, x, y, z, rx, ry, rz, w = 12, h = 8) { this.b.add(key, G.sph(w, h), this._(mat4(x, y, z, rx, ry, rz))); }
  geo(key, g, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) { this.b.add(key, g, this._(mat4(x, y, z, sx, sy, sz, ry, rx, rz))); }
  inst(proto, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, color) { this.b.inst(proto, this._(mat4(x, y, z, sx, sy, sz, ry)), color); }
  blob(x, z, w, d, y = 0.015) { this.b.add('blob', G.plane, this._(mat4(x, y, z, w, 1, d))); }
  rug(key, x, z, w, d, y = 0.02) { this.b.add(key, G.plane, this._(mat4(x, y, z, w, 1, d))); }
}
