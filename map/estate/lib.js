// 伊甸庄园 · 构建工具：程序纹理、材质表、按材质合并的 Batch（控制 draw call）、实例化原型
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

const TEX = {};
function makeTextures() {
  // 大理石棋盘：每格 1 m，一张 2×2 格
  { const [c, g] = cv(256); const tiles = [['#F2F0EC', '#2a2a2d'], ['#2a2a2d', '#F2F0EC']];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      g.fillStyle = tiles[j][i]; g.fillRect(i * 128, j * 128, 128, 128);
      g.save(); g.beginPath(); g.rect(i * 128, j * 128, 128, 128); g.clip();
      for (let k = 0; k < 5; k++) { g.strokeStyle = tiles[j][i] === '#2a2a2d' ? `rgba(232,230,224,${0.08 + R() * 0.12})` : `rgba(154,154,156,${0.1 + R() * 0.14})`; g.lineWidth = 0.6 + R() * 1.4; g.beginPath();
        const x0 = i * 128 + R() * 128, y0 = j * 128 + R() * 128; g.moveTo(x0, y0);
        g.bezierCurveTo(x0 + R() * 80 - 40, y0 + R() * 80 - 40, x0 + R() * 120 - 60, y0 + R() * 120 - 60, x0 + R() * 160 - 80, y0 + R() * 160 - 80); g.stroke(); }
      g.restore(); g.strokeStyle = 'rgba(80,70,60,.18)'; g.lineWidth = 1; g.strokeRect(i * 128 + .5, j * 128 + .5, 127, 127);
    }
    TEX.marble = tx(c); }
  // 卡拉拉白大板（浴室、电梯厅）：2 m 一张，1 m 见方
  { const [c, g] = cv(256); g.fillStyle = '#F2F0EC'; g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(154,154,156,${0.08 + R() * 0.16})`; g.lineWidth = 0.6 + R() * 1.6; g.beginPath(); const x0 = R() * 256, y0 = R() * 256; g.moveTo(x0, y0); g.bezierCurveTo(x0 + R() * 120 - 60, y0 + R() * 120 - 60, x0 + R() * 160 - 80, y0 + R() * 160 - 80, x0 + R() * 220 - 110, y0 + R() * 220 - 110); g.stroke(); }
    g.strokeStyle = 'rgba(120,115,105,.16)'; g.lineWidth = 1; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 256); g.moveTo(0, i * 128); g.lineTo(256, i * 128); g.stroke(); }
    TEX.carrara = tx(c); }
  // 人字 / 错缝木地板：2.4 m 一张
  { const [c, g] = cv(256); g.fillStyle = '#7E5A34'; g.fillRect(0, 0, 256, 256);
    const rows = 20, rh = 256 / rows;
    for (let r = 0; r < rows; r++) { let x = -R() * 80;
      while (x < 256) { const L = 50 + R() * 70; const col = shade(['#A57A4B', '#9a6f43', '#ad8352', '#8f6a3e', '#a07448'][(R() * 5) | 0], 0.95 + R() * 0.1);
        for (const ox of [0, -256, 256]) { g.fillStyle = col; g.fillRect(x + ox + 0.6, r * rh + 0.6, L - 1.2, rh - 1.2); }
        g.fillStyle = 'rgba(60,35,15,.12)'; for (let k = 0; k < 3; k++) g.fillRect(x + R() * L, r * rh + R() * rh, R() * 30, 0.6);
        x += L; } }
    TEX.parquet = tx(c); }
  // 小方砖（浴室 / 备餐间）：1 m 一张
  { const [c, g] = cv(128); g.fillStyle = '#bdb6aa'; g.fillRect(0, 0, 128, 128);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { g.fillStyle = shade('#f1ede6', 0.97 + R() * 0.05); g.fillRect(i * 16 + 1, j * 16 + 1, 14, 14); }
    TEX.tile = tx(c); }
  // 石板铺地（露台、前庭平台）：4 m 一张
  { const [c, g] = cv(256); g.fillStyle = '#b9b0a2'; g.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const off = (j % 2) * 32; g.fillStyle = shade('#ddd5c7', 0.94 + R() * 0.09);
      for (const ox of [0, -256]) g.fillRect(i * 64 + off + ox + 1, j * 64 + 1, 62, 62); }
    speck(g, 256, 256, 900, ['rgba(0,0,0,.05)', 'rgba(255,255,255,.08)']); TEX.pavers = tx(c); }
  // 墙面琢石：4 m 一张，1 m × 0.5 m 错缝，缝很淡
  { const [c, g] = cv(256); g.fillStyle = '#d9d1c3'; g.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 5; i++) { const off = (j % 2) * 32; g.fillStyle = shade('#E4DED2', 0.985 + R() * 0.035);
      for (const ox of [0, -256]) g.fillRect(i * 64 + off + ox + 0.7, j * 32 + 0.7, 62.6, 30.6); }
    speck(g, 256, 256, 900, ['rgba(211,204,190,.5)', 'rgba(255,255,255,.08)']); TEX.ashlar = tx(c); }
  // 底层粗面石（rustication）：深水平缝
  { const [c, g] = cv(256); g.fillStyle = '#A89F8F'; g.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 3; i++) { const off = (j % 2) * 48, bh = 256 / 6; g.fillStyle = shade('#CFC7B8', 0.98 + R() * 0.05);
      for (const ox of [0, -256]) { g.fillRect(i * 96 + off + ox + 1, j * bh + 3, 94, bh - 6); } }
    speck(g, 256, 256, 600, ['rgba(120,100,80,.06)']); TEX.rustic = tx(c); }
  // 草坪：12 m 一张，带淡淡的修剪条纹
  { const [c, g] = cv(256); for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#52703A' : '#5F7F3E'; g.fillRect(0, i * 64, 256, 64); }
    speck(g, 256, 256, 5000, ['rgba(40,60,20,.18)', 'rgba(170,190,110,.16)', 'rgba(60,80,30,.12)'], 1, 2.2); TEX.grass = tx(c); }
  // 砾石
  { const [c, g] = cv(128); g.fillStyle = '#CFC6B0'; g.fillRect(0, 0, 128, 128);
    speck(g, 128, 128, 2600, ['#bdb39c', '#ddd5c2', '#aea48c', '#e6dfcf'], 1, 2.4); TEX.gravel = tx(c); }
  // 树篱
  { const [c, g] = cv(128); g.fillStyle = '#2F4A26'; g.fillRect(0, 0, 128, 128);
    speck(g, 128, 128, 2400, ['#243a1d', '#3f5e33', '#4a6b3b', '#2a4222'], 1.5, 3.5); TEX.hedge = tx(c); }
  // 花坛：多色小点
  const flowers = (cols) => { const [c, g] = cv(128); g.fillStyle = '#4d6a36'; g.fillRect(0, 0, 128, 128);
    speck(g, 128, 128, 700, ['#3b5529', '#5f7f43'], 2, 4); speck(g, 128, 128, 900, cols, 1.5, 3.2); return tx(c); };
  TEX.flowers = flowers(['#e8dcef', '#c9a3d6', '#f4f1ea', '#e7b7c3', '#b58bc4']);
  TEX.roses = flowers(['#c2455a', '#e59aa9', '#f3d9dc', '#a8324a', '#f6f0ea']);
  // 岩层：u 60 m, v 40 m
  { const [c, g] = cv(256); let y = 0;
    while (y < 256) { const h = 3 + R() * 14; g.fillStyle = ['#8a7d6c', '#9b8e7b', '#7a6d5e', '#a79a86', '#6f6457', '#938573'][(R() * 6) | 0]; g.fillRect(0, y, 256, h + 1); y += h; }
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(40,32,24,${0.1 + R() * 0.2})`; g.lineWidth = 0.6 + R(); g.beginPath(); const x = R() * 256, yy = R() * 256; g.moveTo(x, yy); g.lineTo(x + R() * 10 - 5, yy + 10 + R() * 30); g.stroke(); }
    speck(g, 256, 256, 3000, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.06)'], 1, 3); TEX.rock = tx(c); }
  // 书脊
  { const [c, g] = cv(256, 64); g.fillStyle = '#2a1d14'; g.fillRect(0, 0, 256, 64); let x = 0;
    while (x < 256) { const w = 3 + R() * 5, h = 44 + R() * 18; g.fillStyle = ['#6b2a2a', '#2e3f5c', '#41573f', '#7a5a33', '#5a2f45', '#c2b08a', '#27303a', '#8a6a3c'][(R() * 8) | 0];
      g.fillRect(x, 64 - h, w - 0.6, h); g.fillStyle = 'rgba(230,195,106,.55)'; g.fillRect(x + 0.5, 64 - h + 6, w - 1.6, 1.2); x += w; }
    TEX.books = tx(c, true, false); }
  // 地毯（三种配色）
  const rug = (field, border, accent, line) => { const [c, g] = cv(256); g.fillStyle = border; g.fillRect(0, 0, 256, 256);
    g.fillStyle = accent; g.fillRect(10, 10, 236, 236); g.fillStyle = border; g.fillRect(16, 16, 224, 224);
    g.fillStyle = field; g.fillRect(28, 28, 200, 200);
    g.strokeStyle = line; g.lineWidth = 2; g.strokeRect(34, 34, 188, 188);
    for (let i = 0; i < 18; i++) for (let j = 0; j < 18; j++) if ((i + j) % 2 === 0) { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(40 + i * 10, 40 + j * 10, 4, 4); }
    g.fillStyle = accent; g.beginPath(); g.ellipse(128, 128, 46, 46, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = field; g.beginPath(); g.ellipse(128, 128, 38, 38, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = line; g.lineWidth = 1.5; for (let k = 0; k < 8; k++) { g.beginPath(); const a = k * Math.PI / 4; g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30); g.stroke(); }
    for (const [x, y] of [[40, 40], [216, 40], [40, 216], [216, 216]]) { g.fillStyle = accent; g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 12, y); g.lineTo(x, y + 12); g.lineTo(x - 12, y); g.fill(); }
    speck(g, 256, 256, 1500, ['rgba(0,0,0,.05)', 'rgba(255,255,255,.04)']); return tx(c, true, false); };
  TEX.rugBurg = rug('#7A2A22', '#27304F', '#C9A24B', 'rgba(230,200,140,.5)');      // 赫里兹
  TEX.rugNavy = rug('#27304F', '#E3D4B8', '#7A2A22', 'rgba(227,212,184,.5)');
  TEX.rugSage = rug('#E3D4B8', '#6F7F5B', '#B7776B', 'rgba(111,127,91,.55)');     // 奥布松
  TEX.rugRose = rug('#E3D4B8', '#B7776B', '#6F7F5B', 'rgba(183,119,107,.55)');
  // 接触阴影
  { const [c, g] = cv(64); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); TEX.blob = tx(c, false, false); }
  // 栏杆面板（岛缘长栏杆用贴图代替实体小柱）
  { const [c, g] = cv(64); g.clearRect(0, 0, 64, 64); g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(24, 64); g.lineTo(40, 64); g.lineTo(38, 56); g.bezierCurveTo(46, 44, 44, 30, 36, 22); g.lineTo(38, 8); g.lineTo(26, 8); g.lineTo(28, 22); g.bezierCurveTo(20, 30, 18, 44, 26, 56); g.closePath(); g.fill();
    g.fillRect(22, 0, 20, 8); TEX.balPanel = tx(c, false); }
}

/* ---------------- 材质 ---------------- */
export const MATS = {};
export const UVS = {};          // 需要世界坐标 UV 的材质 → 每张纹理覆盖的米数
export const NOCAST = new Set(); // 不投影
export const GOLD = '#e6c36a';
export function initMaterials(envMap) {
  makeTextures();
  const S = (key, p, uv, cast = true) => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...p }); if (envMap) m.envMap = envMap; MATS[key] = m; if (uv) UVS[key] = uv; if (!cast) NOCAST.add(key); return m; };
  S('stone', { color: '#ffffff', map: TEX.ashlar, roughness: 0.75 }, 4);
  S('rustic', { color: '#ffffff', map: TEX.rustic, roughness: 0.8 }, 4.2);
  S('trim', { color: '#F0ECE3', roughness: 0.6 });
  S('trimShade', { color: '#d8cfbf', roughness: 0.8 });
  S('frame', { color: '#f6f3ec', roughness: 0.5 });
  S('glass', { color: '#1A2229', roughness: 0.05, metalness: 0.3, envMapIntensity: 1.4 });
  S('cap', { color: '#2d2723', roughness: 1 }, null, true);
  S('lead', { color: '#8A8D90', roughness: 0.7, metalness: 0.3 });
  S('gold', { color: GOLD, roughness: 0.25, metalness: 1, envMapIntensity: 1.3 });
  S('ormolu', { color: '#C9A24B', roughness: 0.3, metalness: 1, envMapIntensity: 1.2 });
  S('mahogany', { color: '#5E2A1A', roughness: 0.18 });
  S('iron', { color: '#26272A', roughness: 0.5, metalness: 0.8 });
  S('glow', { color: '#fff3d6', emissive: '#ffcf7a', emissiveIntensity: 1.6, roughness: 0.4 });
  S('marble', { color: '#ffffff', map: TEX.marble, roughness: 0.2, envMapIntensity: 0.7 }, 2, false);
  S('marbleC', { color: '#ffffff', map: TEX.carrara, roughness: 0.2, envMapIntensity: 0.7 }, 2, false);
  S('parquet', { color: '#ffffff', map: TEX.parquet, roughness: 0.5 }, 2.4, false);
  S('tile', { color: '#ffffff', map: TEX.tile, roughness: 0.3 }, 1, false);
  S('pavers', { color: '#ffffff', map: TEX.pavers, roughness: 0.85 }, 4, false);
  S('plaster', { color: '#E9E1CF', roughness: 0.85 });
  S('marbleW', { color: '#f3f0ea', roughness: 0.25 });
  S('woodDark', { color: '#5A3A22', roughness: 0.3 });
  S('woodMid', { color: '#86603f', roughness: 0.5 });
  S('paint', { color: '#ebe5d8', roughness: 0.55 });
  S('paintSage', { color: '#a7b19a', roughness: 0.6 });
  S('fabCream', { color: '#EEE7D8', roughness: 0.95 });
  S('fabSage', { color: '#2F5D4E', roughness: 0.85 });
  S('fabNavy', { color: '#2C3E63', roughness: 0.85 });
  S('fabRose', { color: '#C99A93', roughness: 0.9 });
  S('fabBurg', { color: '#7B1E2B', roughness: 0.85 });
  S('fabGold', { color: '#CDB58A', roughness: 0.8 });
  S('linen', { color: '#F7F4EE', roughness: 0.9 });
  S('leather', { color: '#5e3b27', roughness: 0.55 });
  S('leatherG', { color: '#3e5747', roughness: 0.6 });
  S('piano', { color: '#0d0d0f', roughness: 0.14, metalness: 0.2, envMapIntensity: 1.2 });
  S('porcelain', { color: '#F6F4EF', roughness: 0.08 });
  S('books', { color: '#ffffff', map: TEX.books, roughness: 0.8 });
  S('screen', { color: '#10202c', emissive: '#6fb2e0', emissiveIntensity: 0.9, roughness: 0.3 });
  S('led', { color: '#223', emissive: '#7ee0a8', emissiveIntensity: 1.2 });
  S('soil', { color: '#6f5a44', roughness: 1 }, null, false);
  S('grass', { color: '#ffffff', map: TEX.grass, roughness: 1 }, 12, false);
  S('gravel', { color: '#e6dccb', map: TEX.gravel, roughness: 1 }, 3, false);
  S('hedge', { color: '#ffffff', map: TEX.hedge, roughness: 1 }, 2);
  S('flowers', { color: '#ffffff', map: TEX.flowers, roughness: 1 }, 2, false);
  S('roses', { color: '#ffffff', map: TEX.roses, roughness: 1 }, 2, false);
  S('foliage', { color: '#5f7d45', roughness: 0.95 });
  S('bark', { color: '#5a4636', roughness: 1 });
  S('water', { color: '#2a4f5c', roughness: 0.08, metalness: 0.0, envMapIntensity: 0.6 }, null, false);
  S('rugBurg', { color: '#ffffff', map: TEX.rugBurg, roughness: 1 }, null, false);
  S('rugNavy', { color: '#ffffff', map: TEX.rugNavy, roughness: 1 }, null, false);
  S('rugSage', { color: '#ffffff', map: TEX.rugSage, roughness: 1 }, null, false);
  S('rugRose', { color: '#ffffff', map: TEX.rugRose, roughness: 1 }, null, false);
  S('rock', { color: '#ffffff', map: TEX.rock, roughness: 1 });
  S('root', { color: '#4a3b2c', roughness: 1 });
  S('moss', { color: '#5b6d3b', roughness: 1 });
  S('terracotta', { color: '#b0694a', roughness: 0.9 });
  const tr = (key, p) => { const m = S(key, { transparent: true, depthWrite: false, ...p }, null, false); return m; };
  tr('blob', { color: '#000000', map: TEX.blob, opacity: 0.42, vertexColors: false });
  tr('glassHouse', { color: '#d9ece9', opacity: 0.3, roughness: 0.05, metalness: 0.2 });
  tr('spray', { color: '#f4fbff', opacity: 0.45, roughness: 0.2 });
  const bp = S('balPanel', { color: '#efe9de', map: TEX.balPanel, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, vertexColors: false });
  MATS.blob.polygonOffset = true; MATS.blob.polygonOffsetFactor = -2;
  for (const k of ['rugBurg', 'rugNavy', 'rugSage', 'rugRose']) { MATS[k].polygonOffset = true; MATS[k].polygonOffsetFactor = -1; }
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

/* ---------------- Batch：同一组里按材质合并成一个网格 ---------------- */
const KEEP = ['position', 'normal', 'uv'];
export class Batch {
  constructor(name) { this.name = name; this.parts = new Map(); this.insts = new Map(); }
  add(key, geom, m, ao) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (m) g.applyMatrix4(m);
    const baked = !ao && g.attributes.color && g.attributes.color.itemSize === 3 ? g.attributes.color : null;
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (UVS[key]) worldUV(g, UVS[key]);
    const col = new Float32Array(n * 3), pos = g.attributes.position.array;
    for (let i = 0; i < n; i++) { let f = 1; if (ao) { const t = Math.min(1, Math.max(0, (pos[i * 3 + 1] - ao[0]) / ao[1])); f = ao[2] + (1 - ao[2]) * t; } col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f; }
    g.setAttribute('color', baked || new THREE.BufferAttribute(col, 3));
    let l = this.parts.get(key); if (!l) this.parts.set(key, l = []); l.push(g); return g;
  }
  put(key, geom, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0, ao) { if (Array.isArray(rx)) { ao = rx; rx = 0; } return this.add(key, geom, mat4(x, y, z, sx, sy, sz, ry, rx, rz), ao); }
  box(key, cx, cy, cz, w, h, d, ry = 0, ao) { return this.add(key, G.box, mat4(cx, cy, cz, w, h, d, ry), ao); }
  bb(key, x0, y0, z0, x1, y1, z1, ao) { if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return; return this.box(key, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, 0, ao); }
  inst(proto, m, color) { let l = this.insts.get(proto); if (!l) this.insts.set(proto, l = []); l.push([m, color]); }
  build() {
    const grp = new THREE.Group(); grp.name = this.name;
    for (const [key, list] of this.parts) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list, false), MATS[key]);
      if (!MATS[key]) console.warn('no material', key);
      mesh.castShadow = !NOCAST.has(key); mesh.receiveShadow = !MATS[key].transparent;
      if (MATS[key].transparent) mesh.renderOrder = key === 'blob' ? 1 : 3;
      mesh.matrixAutoUpdate = false; grp.add(mesh);
    }
    for (const [name, list] of this.insts) {
      const P = PROTO[name]; const mat = Array.isArray(P.mat) ? P.mat.map(k => MATS[k]) : MATS[P.mat];
      const im = new THREE.InstancedMesh(P.geom, mat, list.length);
      const c = new THREE.Color();
      list.forEach(([m, col], i) => { im.setMatrixAt(i, m); if (col !== undefined) im.setColorAt(i, c.set(col)); });
      if (list.some(([, col]) => col !== undefined)) for (let i = 0; i < list.length; i++) if (list[i][1] === undefined) im.setColorAt(i, c.set('#ffffff'));
      im.castShadow = name !== 'root'; im.receiveShadow = true; im.computeBoundingSphere(); im.matrixAutoUpdate = false; grp.add(im);
    }
    this.parts.clear(); this.insts.clear();
    return grp;
  }
}

/* ---------------- Kit：局部坐标系（家具、亭子等），ry 旋转后放到世界 ---------------- */
export class Kit {
  constructor(b, x, y, z, ry = 0) { this.b = b; this.T = mat4(x, y, z, 1, 1, 1, ry); }
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
