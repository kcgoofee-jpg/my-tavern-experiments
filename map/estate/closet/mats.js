// 衣帽间样板间 · 材质表
// 每个材质键有 A（纯程序：canvas 纹理 + 参数）与 B（真实 CC0 扫描贴图：色 / 法线 / 粗糙度）两套配置，同一网格切换材质即可对比。
// 几何体的 UV 以「米」为单位（见 geo.js 的 metricUV），所以 rep = 一张贴图覆盖的米数。
import * as THREE from 'three';

export const GOLD = '#e6c36a';
const TEXDIR = new URL('./assets/tex/', import.meta.url).href;

/* ---------------- 随机 ---------------- */
export function srand(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const R = srand(7);

/* ---------------- 程序纹理（A 版，以及两版共用的图案：地毯、纹章、领带、窗外天空、尺码表） ---------------- */
function cv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tx(c, srgb = true) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function noise(g, w, h, n, a, smin = 1, smax = 2) { for (let i = 0; i < n; i++) { const v = R() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${a * R()})`; const s = smin + R() * (smax - smin); g.fillRect(R() * w, R() * h, s, s); } }

export const PT = {};
function makeProcTextures() {
  // 胡桃木：纵向木纹，1 张 = 0.6 m
  { const [c, g] = cv(512); g.fillStyle = '#6a3321'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 140; i++) { const x = R() * 512, w = 1 + R() * 5; g.fillStyle = `rgba(${R() < .5 ? '42,16,8' : '140,72,44'},${0.15 + R() * 0.25})`;
      g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= 512; y += 32) g.lineTo(x + Math.sin(y * 0.02 + i) * 6, y); g.lineTo(x + w, 512); g.lineTo(x + w, 0); g.fill(); }
    noise(g, 512, 512, 4000, 0.06); PT.walnut = tx(c); }
  // 人字拼橡木：阶梯排列（H 板 + V 板，带位移 (L, −L)），8 个板宽一周期可平铺；贴图旋转 45° 使用
  { const [c, g] = cv(512); g.fillStyle = '#5a3b22'; g.fillRect(0, 0, 512, 512);
    const U = 64, L = 4, cols = ['#a8774a', '#9a6a40', '#b3834f', '#8f6139', '#a5764b', '#9e7046', '#ad7c4d'];
    const plank = (x, y, w, h) => { for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) { const X = x * U + ox, Y = y * U + oy; if (X > 512 || Y > 512 || X + w * U < 0 || Y + h * U < 0) continue;
        g.fillStyle = cols[((x * 7 + y * 13) % cols.length + cols.length) % cols.length]; g.fillRect(X + 1, Y + 1, w * U - 2, h * U - 2);
        g.fillStyle = 'rgba(60,35,15,.13)'; for (let k = 0; k < 7; k++) { const t = ((x * 31 + y * 17 + k * 11) % 97) / 97; if (w > h) g.fillRect(X + 4, Y + 3 + t * (h * U - 6), w * U - 8, 0.8); else g.fillRect(X + 3 + t * (w * U - 6), Y + 4, 0.8, h * U - 8); } } };
    for (let band = -4; band < 4; band++) for (let k = -12; k < 12; k++) { const ox = band * L, oy = -band * L; plank(ox + k, oy + k, L, 1); plank(ox + k, oy + k + 1, 1, L); }
    noise(g, 512, 512, 3000, 0.05); PT.parquet = tx(c); }
  // 大理石（卡拉卡塔金）：象牙底 + 金灰纹
  const marble = (base, veins, n) => { const [c, g] = cv(512); g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let k = 0; k < n; k++) { g.strokeStyle = veins[(R() * veins.length) | 0]; g.lineWidth = 0.5 + R() * 2.5; g.beginPath(); let x = R() * 512, y = R() * 512; g.moveTo(x, y);
      for (let s = 0; s < 8; s++) { const nx = x + R() * 120 - 40, ny = y + R() * 80 - 40; g.quadraticCurveTo((x + nx) / 2 + R() * 30 - 15, (y + ny) / 2 + R() * 30 - 15, nx, ny); x = nx; y = ny; } g.stroke(); }
    noise(g, 512, 512, 3000, 0.04); return tx(c); };
  PT.calacatta = marble('#f1ece2', ['rgba(184,155,106,.55)', 'rgba(150,140,130,.35)', 'rgba(200,175,130,.4)'], 34);
  PT.nero = marble('#1e1e20', ['rgba(232,230,224,.55)', 'rgba(200,200,200,.3)'], 40);
  // 通用灰度底纹（织物、皮革、丝绒上色用）
  const gray = (n, a, s1, s2) => { const [c, g] = cv(256); g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, n, a, s1, s2); return tx(c); };
  PT.velvet = gray(3000, 0.12, 1, 3);
  PT.leather = gray(5000, 0.14, 1, 2.5);
  { const [c, g] = cv(128); g.fillStyle = '#d2d2d2'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 2) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(i, 0, 1, 128); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, i, 128, 1); }
    PT.weave = tx(c); }
  // 锦缎墙布：四叶纹（灰度，上天城蓝）
  { const [c, g] = cv(256); g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(255,255,255,.22)';
    for (const [cx, cy] of [[64, 64], [192, 192], [192, 64], [64, 192]]) { for (let a = 0; a < 4; a++) { g.beginPath(); g.ellipse(cx + Math.cos(a * Math.PI / 2) * 22, cy + Math.sin(a * Math.PI / 2) * 22, 20, 12, a * Math.PI / 2, 0, Math.PI * 2); g.fill(); } }
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 3; for (let i = 0; i < 256; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.lineTo(i, 256); g.stroke(); }
    PT.damask = tx(c); }
  // 地毯（奥布松：象牙底，玫瑰与叶，金色饰带），两版共用
  { const [c, g] = cv(1024, 768); g.fillStyle = '#6b2a2a'; g.fillRect(0, 0, 1024, 768);
    g.fillStyle = '#c9a86a'; g.fillRect(18, 18, 988, 732); g.fillStyle = '#6b2a2a'; g.fillRect(28, 28, 968, 712);
    g.fillStyle = '#e3d4b8'; g.fillRect(70, 70, 884, 628);
    // 边饰花串
    for (let i = 0; i < 40; i++) { const t = i / 40; for (const [x, y] of [[48 + t * 928, 48], [48 + t * 928, 720], [48, 48 + t * 672], [976, 48 + t * 672]]) { g.fillStyle = i % 2 ? '#b7776b' : '#d9b66e'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = '#6f7f5b'; g.beginPath(); g.ellipse(x + 10, y + 3, 6, 3, 0.6, 0, 7); g.fill(); } }
    g.strokeStyle = '#b89b6a'; g.lineWidth = 3; g.strokeRect(88, 88, 848, 592);
    // 中心大徽章 + 四角
    const rose = (x, y, r) => { for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; g.fillStyle = '#6f7f5b'; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 1.4, r * 0.7, r * 0.28, a, 0, 7); g.fill(); }
      g.fillStyle = '#b7776b'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = '#d99c90'; g.beginPath(); g.arc(x, y, r * 0.62, 0, 7); g.fill(); g.fillStyle = '#8c4a45'; g.beginPath(); g.arc(x, y, r * 0.25, 0, 7); g.fill(); };
    g.strokeStyle = '#b89b6a'; g.lineWidth = 4; g.beginPath(); g.ellipse(512, 384, 250, 170, 0, 0, 7); g.stroke(); g.lineWidth = 1.5; g.beginPath(); g.ellipse(512, 384, 232, 154, 0, 0, 7); g.stroke();
    rose(512, 384, 46); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; rose(512 + Math.cos(a) * 150, 384 + Math.sin(a) * 100, 18); }
    for (const [x, y] of [[180, 160], [844, 160], [180, 608], [844, 608]]) rose(x, y, 26);
    noise(g, 1024, 768, 26000, 0.07, 1, 2); PT.rug = tx(c); PT.rug.wrapS = PT.rug.wrapT = THREE.ClampToEdgeWrapping; }
  // 家族纹章（虚构：天城蓝盾、金苹果树立于白云、双翼、五瓣冠、白狮鹫持盾、格言带），两版共用。刺绣用金线，底为透明
  { const [c, g] = cv(512); g.clearRect(0, 0, 512, 512);
    const gold = '#e6c36a', blue = '#2c3e63';
    // 格言带
    g.fillStyle = '#efe6cf'; g.beginPath(); g.moveTo(80, 440); g.quadraticCurveTo(256, 480, 432, 440); g.lineTo(440, 470); g.quadraticCurveTo(256, 512, 72, 470); g.closePath(); g.fill();
    g.strokeStyle = gold; g.lineWidth = 3; g.stroke(); g.fillStyle = '#5c1420'; g.font = 'bold 22px Georgia, serif'; g.textAlign = 'center'; g.fillText('HORTUS SUPRA NUBES', 256, 468);
    // 狮鹫（简化为白色剪影翼）
    for (const s of [-1, 1]) { g.save(); g.translate(256 + s * 150, 280); g.scale(s, 1); g.fillStyle = '#f2efe8'; g.beginPath(); g.moveTo(0, 120); g.quadraticCurveTo(-40, 40, -10, -60); g.quadraticCurveTo(20, -100, 50, -70); g.quadraticCurveTo(30, -20, 40, 40); g.quadraticCurveTo(50, 90, 20, 130); g.closePath(); g.fill(); g.strokeStyle = gold; g.lineWidth = 2; g.stroke(); g.restore(); }
    // 盾
    g.fillStyle = blue; g.beginPath(); g.moveTo(166, 150); g.lineTo(346, 150); g.lineTo(346, 290); g.quadraticCurveTo(346, 380, 256, 420); g.quadraticCurveTo(166, 380, 166, 290); g.closePath(); g.fill(); g.strokeStyle = gold; g.lineWidth = 7; g.stroke();
    // 云
    g.fillStyle = '#f2efe8'; for (const [x, y, r] of [[216, 350, 22], [246, 342, 26], [280, 348, 22], [304, 356, 16], [196, 360, 14]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    // 苹果树
    g.fillStyle = gold; g.fillRect(250, 270, 12, 72); g.beginPath(); g.arc(256, 245, 48, 0, 7); g.fill();
    g.fillStyle = '#b8323c'; for (const [x, y] of [[236, 232], [270, 222], [258, 258], [228, 260], [284, 252]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
    // 双翼
    g.fillStyle = gold; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(256 + s * 40, 190); for (let k = 0; k < 5; k++) { g.lineTo(256 + s * (60 + k * 12), 175 - k * 6); g.lineTo(256 + s * (52 + k * 12), 190 - k * 2); } g.lineTo(256 + s * 30, 200); g.fill(); }
    // 冠
    g.fillStyle = gold; g.beginPath(); g.moveTo(196, 140); g.lineTo(316, 140); g.lineTo(326, 90); g.lineTo(296, 112); g.lineTo(286, 76); g.lineTo(256, 106); g.lineTo(226, 76); g.lineTo(216, 112); g.lineTo(186, 90); g.closePath(); g.fill();
    for (const x of [186, 226, 256, 286, 326]) { g.beginPath(); g.arc(x, x === 256 ? 100 : (x === 186 || x === 326 ? 88 : 74), 7, 0, 7); g.fill(); }
    PT.crest = tx(c); PT.crest.wrapS = PT.crest.wrapT = THREE.ClampToEdgeWrapping; }
  // 领带（丝，斜纹），1 张 = 8 条不同花色
  { const [c, g] = cv(256, 64); const cols = [['#2c3e63', '#e6c36a'], ['#7b1e2b', '#d8c8b8'], ['#2f5d4e', '#c9a24b'], ['#1c1c24', '#8a8d90'], ['#5c1420', '#2c3e63'], ['#c9a24b', '#2c3e63'], ['#3b2f5a', '#d9b66e'], ['#6b2e35', '#f0ece3']];
    cols.forEach(([a, b], i) => { g.fillStyle = a; g.fillRect(i * 32, 0, 32, 64); g.strokeStyle = b; g.lineWidth = 2; for (let k = -64; k < 64; k += 9) { g.beginPath(); g.moveTo(i * 32 + k, 0); g.lineTo(i * 32 + k + 64, 64); g.stroke(); } g.clearRect(i * 32 + 31, 0, 1, 64); });
    PT.ties = tx(c); }
  // 接触阴影贴片（径向渐变）
  { const [c, g] = cv(128); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 63); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); PT.blob = tx(c, false); PT.blob.wrapS = PT.blob.wrapT = THREE.ClampToEdgeWrapping; }
  // 窗外天空（云海），两版共用
  { const [c, g] = cv(256, 512); const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#9fc0dc'); gr.addColorStop(0.55, '#dfe9ef'); gr.addColorStop(0.62, '#fbf4e6'); gr.addColorStop(1, '#f4ede0'); g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
    g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 60; i++) { g.beginPath(); g.ellipse(R() * 256, 300 + R() * 200, 20 + R() * 40, 6 + R() * 10, 0, 0, 7); g.fill(); }
    PT.sky = tx(c); }
  // 历代家主制服尺码表（门内侧），两版共用：墨色由褐到黑
  { const [c, g] = cv(256, 512); g.fillStyle = '#efe6cf'; g.fillRect(0, 0, 256, 512); g.strokeStyle = '#b89b6a'; g.lineWidth = 3; g.strokeRect(10, 10, 236, 492);
    g.fillStyle = '#3a2a1a'; g.font = 'bold 18px Georgia, serif'; g.textAlign = 'center'; g.fillText('MENSURAE', 128, 44);
    const inks = ['#7a5230', '#6a4428', '#553620', '#3d2818', '#241810', '#0e0a08'];
    for (let r = 0; r < 6; r++) { g.fillStyle = inks[r]; g.font = 'italic 14px Georgia, serif'; g.textAlign = 'left'; g.fillText(['I', 'II', 'III', 'IV', 'V', 'VI'][r] + '.', 24, 90 + r * 66);
      for (let l = 0; l < 3; l++) { g.fillRect(56, 80 + r * 66 + l * 14, 60 + R() * 110, 1.4); } }
    PT.chart = tx(c); PT.chart.wrapS = PT.chart.wrapT = THREE.ClampToEdgeWrapping; }
  // 风景画（A 版画框里的画）
  { const [c, g] = cv(256, 192); const gr = g.createLinearGradient(0, 0, 0, 192); gr.addColorStop(0, '#c9b98f'); gr.addColorStop(0.5, '#e2d2a8'); gr.addColorStop(1, '#5d5a36'); g.fillStyle = gr; g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#4b5a33'; g.beginPath(); g.moveTo(0, 130); g.quadraticCurveTo(80, 100, 150, 125); g.quadraticCurveTo(210, 140, 256, 118); g.lineTo(256, 192); g.lineTo(0, 192); g.fill();
    g.fillStyle = '#3a4526'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(20 + i * 12, 110 - i * 3, 16, 0, 7); g.fill(); }
    g.fillStyle = '#d8cbb0'; g.fillRect(150, 96, 30, 24); g.fillStyle = '#7a3f2c'; g.beginPath(); g.moveTo(146, 96); g.lineTo(165, 82); g.lineTo(184, 96); g.fill();
    noise(g, 256, 192, 3000, 0.08); PT.painting = tx(c); PT.painting.wrapS = PT.painting.wrapT = THREE.ClampToEdgeWrapping; }
  // 钟面
  { const [c, g] = cv(256); g.fillStyle = '#efe6cf'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#2a2018'; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 110, 0, 7); g.stroke(); g.beginPath(); g.arc(128, 128, 84, 0, 7); g.stroke();
    g.fillStyle = '#2a2018'; g.font = 'bold 20px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const RN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    RN.forEach((s, i) => { const a = i / 12 * Math.PI * 2 - Math.PI / 2; g.fillText(s, 128 + Math.cos(a) * 97, 128 + Math.sin(a) * 97); });
    g.lineWidth = 5; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 40, 128 - 30); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 10, 128 - 76); g.stroke();
    PT.dial = tx(c); PT.dial.wrapS = PT.dial.wrapT = THREE.ClampToEdgeWrapping; }
}

/* ---------------- 材质定义 ---------------- */
// base：两版共用参数；A / B：各自贴图与调色（tint 覆盖 color）。map 名：PT.* 为程序纹理，'x_col' 等为 assets/tex/ 下的真实贴图。
// rep：一张贴图覆盖多少米（UV 以米计）。nrm：法线强度。
const P = THREE.MeshPhysicalMaterial;
const DEF = {
  walnut:     { base: { roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.2 }, A: { map: 'walnut', rep: 0.6, tint: '#ffffff' }, B: { map: 'walnut_col', nor: 'walnut_nor', rgh: 'walnut_rgh', rep: 0.8, tint: '#a06a5c', nrm: 0.5, roughness: 0.55, rot: Math.PI / 2 } },
  walnutPanel:{ base: { roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.2 }, A: { map: 'walnut', rep: 0.6, tint: '#f0e4d8' }, B: { map: 'walnut_col', nor: 'walnut_nor', rgh: 'walnut_rgh', rep: 0.8, tint: '#b07a68', nrm: 0.5, roughness: 0.55, rot: Math.PI / 2 } },
  ebony:      { base: { color: '#1c1512', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }, A: {}, B: { map: 'walnut_col', nor: 'walnut_nor', rep: 0.8, tint: '#4a2c22', nrm: 0.3, rot: Math.PI / 2 } },
  brass:      { base: { color: '#c9a24b', metalness: 1, roughness: 0.25 }, A: {}, B: {} },
  brassPol:   { base: { color: '#d4ae5a', metalness: 1, roughness: 0.14 }, A: {}, B: {} },
  gilt:       { base: { color: GOLD, metalness: 1, roughness: 0.28 }, A: {}, B: {} },
  steel:      { base: { color: '#c7c9c8', metalness: 1, roughness: 0.18 }, A: {}, B: {} },
  glass:      { base: { color: '#ffffff', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.08, envMapIntensity: 2.2, depthWrite: false, specularIntensity: 1 }, A: {}, B: {}, noCast: true },
  glassTint:  { base: { color: '#e8dcc4', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 2.0, depthWrite: false }, A: {}, B: {}, noCast: true },
  mirror:     { base: { color: '#8e979a', metalness: 1, roughness: 0.03 }, A: {}, B: {}, noCast: true },
  calacatta:  { base: { roughness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.06 }, A: { map: 'calacatta', rep: 1.4, tint: '#ffffff' }, B: { map: 'calacatta_col', nor: 'calacatta_nor', rgh: 'calacatta_rgh', rep: 1.2, tint: '#ffffff', nrm: 0.3, roughness: 0.2 } },
  nero:       { base: { roughness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.06 }, A: { map: 'nero', rep: 1.2, tint: '#ffffff' }, B: { map: 'nero_col', rgh: 'nero_rgh', rep: 1.2, tint: '#ffffff', roughness: 0.2 } },
  parquet:    { base: { roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.3 }, A: { map: 'parquet', rep: 0.72, tint: '#ffffff', rot: Math.PI / 4 }, B: { map: 'parquet_col', nor: 'parquet_nor', rgh: 'parquet_rgh', rep: 2.2, tint: '#ecd9c4', nrm: 0.8, roughness: 0.9 }, noCast: true },
  plaster:    { base: { color: '#f3efe6', roughness: 0.9 }, A: {}, B: {} },
  ivory:      { base: { color: '#ebe3d2', roughness: 0.55, clearcoat: 0.2 }, A: {}, B: {} },
  section:    { base: { color: '#2b2622', roughness: 1 }, A: {}, B: {} },
  damask:     { base: { color: '#2c3e63', roughness: 0.8, sheen: 0.8, sheenRoughness: 0.35, sheenColor: '#8ea3c9' }, A: { map: 'damask', rep: 0.35, tint: '#2c3e63' }, B: { map: 'damask_col', nor: 'damask_nor', rep: 0.28, tint: '#34497a', nrm: 1.0 } },
  velvetGreen:{ base: { color: '#2f5d4e', roughness: 0.95, sheen: 1, sheenRoughness: 0.45, sheenColor: '#7fb8a2' }, A: { map: 'velvet', rep: 0.3, tint: '#2f5d4e' }, B: { map: 'velvet_col', nor: 'velvet_nor', rgh: 'velvet_rgh', rep: 0.28, tint: '#2f5d4e', nrm: 0.6 } },
  velvetBlue: { base: { color: '#2c3e63', roughness: 0.95, sheen: 1, sheenRoughness: 0.45, sheenColor: '#8fa6d6' }, A: { map: 'velvet', rep: 0.3, tint: '#2c3e63' }, B: { map: 'velvet_col', nor: 'velvet_nor', rgh: 'velvet_rgh', rep: 0.28, tint: '#2c3e63', nrm: 0.6 } },
  velvetBurg: { base: { color: '#5c1420', roughness: 0.95, sheen: 1, sheenRoughness: 0.5, sheenColor: '#c46a78' }, A: { map: 'velvet', rep: 0.3, tint: '#5c1420' }, B: { map: 'velvet_col', nor: 'velvet_nor', rgh: 'velvet_rgh', rep: 0.28, tint: '#5c1420', nrm: 0.6 } },
  velvetNavy: { base: { color: '#141b30', roughness: 0.95, sheen: 1, sheenRoughness: 0.45, sheenColor: '#5a6f9e' }, A: { map: 'velvet', rep: 0.3, tint: '#141b30' }, B: { map: 'velvet_col', nor: 'velvet_nor', rgh: 'velvet_rgh', rep: 0.28, tint: '#1a2340', nrm: 0.6 } },
  curtain:    { base: { color: '#34497a', roughness: 0.9, sheen: 1, sheenRoughness: 0.4, sheenColor: '#9fb3de', side: THREE.DoubleSide }, A: { map: 'velvet', rep: 0.4, tint: '#34497a' }, B: { map: 'velvet_col', nor: 'velvet_nor', rgh: 'velvet_rgh', rep: 0.3, tint: '#34497a', nrm: 0.7 } },
  sheer:      { base: { color: '#f4ede0', roughness: 0.8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, sheen: 0.5, sheenColor: '#ffffff' }, A: {}, B: { map: 'linen_col', nor: 'linen_nor', rep: 0.25, tint: '#f4ede0', nrm: 0.6 }, noCast: true },
  leatherTan: { base: { color: '#8a5a34', roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.5 }, A: { map: 'leather', rep: 0.35, tint: '#8a5a34' }, B: { map: 'leather_col', nor: 'leather_nor', rgh: 'leather_rgh', rep: 0.4, tint: '#e0b48c', nrm: 0.8 } },
  leatherBlk: { base: { color: '#141213', roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.25 }, A: { map: 'leather', rep: 0.35, tint: '#191718' }, B: { nor: 'leather_nor', rgh: 'leather_rgh', rep: 0.35, nrm: 0.6 } },
  leatherRed: { base: { color: '#5c1a1e', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.4 }, A: { map: 'leather', rep: 0.35, tint: '#5c1a1e' }, B: { nor: 'leather_nor', rgh: 'leather_rgh', rep: 0.35, nrm: 0.6 } },
  leatherCrm: { base: { color: '#d9c7a6', roughness: 0.5, clearcoat: 0.3 }, A: { map: 'leather', rep: 0.35, tint: '#d9c7a6' }, B: { nor: 'leather_nor', rgh: 'leather_rgh', rep: 0.35, nrm: 0.6 } },
  leatherOld: { base: { color: '#6e4526', roughness: 0.6, clearcoat: 0.25 }, A: { map: 'leather', rep: 0.35, tint: '#6e4526' }, B: { map: 'leather_col', nor: 'leather_nor', rgh: 'leather_rgh', rep: 0.5, tint: '#b88a64', nrm: 1.0 } },
  patent:     { base: { color: '#0d0c0d', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }, A: {}, B: {} },
  insole:     { base: { color: '#9c7452', roughness: 0.75 }, A: { map: 'leather', rep: 0.2, tint: '#9c7452' }, B: { nor: 'leather_nor', rep: 0.2, nrm: 0.4 } },
  blob:       { base: { color: '#000000', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }, A: { map: 'blob', tint: '#000000', abs: true, alpha: true }, B: { map: 'blob', tint: '#000000', abs: true, alpha: true }, noCast: true },
  sole:       { base: { color: '#3a2618', roughness: 0.7 }, A: {}, B: {} },
  // 衣物（B 版：真实织物扫描贴图的灰度 + 法线，按色调上色）
  woolChar:   { base: { color: '#3a3b3f', roughness: 0.95, sheen: 0.5, sheenRoughness: 0.7, sheenColor: '#6f7078' }, A: { map: 'weave', rep: 0.08, tint: '#3a3b3f' }, B: { map: 'wool_col', nor: 'wool_nor', rep: 0.2, tint: '#3a3b40', nrm: 0.9 } },
  woolNavy:   { base: { color: '#1f2a44', roughness: 0.95, sheen: 0.5, sheenRoughness: 0.7, sheenColor: '#56648a' }, A: { map: 'weave', rep: 0.08, tint: '#1f2a44' }, B: { map: 'wool_col', nor: 'wool_nor', rep: 0.2, tint: '#1f2a46', nrm: 0.9 } },
  woolCamel:  { base: { color: '#a67b4f', roughness: 0.95, sheen: 0.6, sheenRoughness: 0.6, sheenColor: '#e0bf94' }, A: { map: 'weave', rep: 0.08, tint: '#a67b4f' }, B: { map: 'wool_col', nor: 'wool_nor', rep: 0.2, tint: '#a67b4f', nrm: 0.9 } },
  woolGrey:   { base: { color: '#8a8a88', roughness: 0.95, sheen: 0.5, sheenRoughness: 0.6, sheenColor: '#c8c8c4' }, A: { map: 'weave', rep: 0.08, tint: '#8a8a88' }, B: { map: 'wool_col', nor: 'wool_nor', rep: 0.2, tint: '#8f8f8c', nrm: 0.9 } },
  shirtW:     { base: { color: '#f4f1ea', roughness: 0.85, sheen: 0.3, sheenColor: '#ffffff' }, A: { map: 'weave', rep: 0.05, tint: '#f4f1ea' }, B: { map: 'linen_col', nor: 'linen_nor', rep: 0.18, tint: '#f6f3ec', nrm: 0.7 } },
  shirtB:     { base: { color: '#b9cde3', roughness: 0.85, sheen: 0.3, sheenColor: '#ffffff' }, A: { map: 'weave', rep: 0.05, tint: '#b9cde3' }, B: { map: 'linen_col', nor: 'linen_nor', rep: 0.18, tint: '#bcd0e6', nrm: 0.7 } },
  shirtP:     { base: { color: '#e8cfcf', roughness: 0.85, sheen: 0.3, sheenColor: '#ffffff' }, A: { map: 'weave', rep: 0.05, tint: '#e8cfcf' }, B: { map: 'linen_col', nor: 'linen_nor', rep: 0.18, tint: '#ecd3d2', nrm: 0.7 } },
  satinChamp: { base: { color: '#d8c3a0', roughness: 0.32, anisotropy: 0.7, anisotropyRotation: Math.PI / 2, sheen: 1, sheenRoughness: 0.25, sheenColor: '#fff1d6' }, A: {}, B: { map: 'satin_col', nor: 'satin_nor', rgh: 'satin_rgh', rep: 0.26, tint: '#dcc6a2', nrm: 0.6, roughness: 0.4 } },
  satinNight: { base: { color: '#1b2340', roughness: 0.32, anisotropy: 0.7, anisotropyRotation: Math.PI / 2, sheen: 1, sheenRoughness: 0.25, sheenColor: '#6f82c4' }, A: {}, B: { map: 'satin_col', nor: 'satin_nor', rgh: 'satin_rgh', rep: 0.26, tint: '#1d2646', nrm: 0.6, roughness: 0.4 } },
  satinBurg:  { base: { color: '#6b1825', roughness: 0.32, anisotropy: 0.7, anisotropyRotation: Math.PI / 2, sheen: 1, sheenRoughness: 0.25, sheenColor: '#e0808e' }, A: {}, B: { map: 'satin_col', nor: 'satin_nor', rgh: 'satin_rgh', rep: 0.26, tint: '#6d1a27', nrm: 0.6, roughness: 0.4 } },
  silkTies:   { base: { roughness: 0.35, anisotropy: 0.6, sheen: 0.8, sheenColor: '#ffffff', sheenRoughness: 0.3 }, A: { map: 'ties', tint: '#ffffff', abs: true }, B: { map: 'ties', tint: '#ffffff', abs: true } },
  rug:        { base: { roughness: 1, sheen: 0.6, sheenRoughness: 0.8, sheenColor: '#fff5e0', polygonOffset: true, polygonOffsetFactor: -1 }, A: { map: 'rug', tint: '#ffffff', abs: true }, B: { map: 'rug', tint: '#ffffff', abs: true, nor: 'wool_nor', rep: 0.1, nrm: 0.5 }, noCast: true },
  crest:      { base: { roughness: 0.55, metalness: 0.35, transparent: true, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -2, sheen: 0.6, sheenColor: '#fff1c8' }, A: { map: 'crest', tint: '#ffffff', abs: true }, B: { map: 'crest', tint: '#ffffff', abs: true } },
  sky:        { base: { color: '#000000', emissive: '#ffffff', emissiveIntensity: 1.25, roughness: 1 }, A: { emap: 'sky' }, B: { emap: 'sky' }, noCast: true },
  chart:      { base: { roughness: 0.9 }, A: { map: 'chart', tint: '#ffffff', abs: true }, B: { map: 'chart', tint: '#ffffff', abs: true } },
  painting:   { base: { roughness: 0.6 }, A: { map: 'painting', tint: '#ffffff', abs: true }, B: { map: 'painting', tint: '#ffffff', abs: true } },
  dial:       { base: { roughness: 0.3, clearcoat: 1 }, A: { map: 'dial', tint: '#ffffff', abs: true }, B: { map: 'dial', tint: '#ffffff', abs: true } },
  pearl:      { base: { color: '#f3ece0', roughness: 0.2, iridescence: 0.6, iridescenceIOR: 1.6, clearcoat: 1 }, A: {}, B: {} },
  gem:        { base: { color: '#9fd0ff', roughness: 0.02, metalness: 0.2, envMapIntensity: 3, clearcoat: 1 }, A: {}, B: {} },
  ruby:       { base: { color: '#b0102a', roughness: 0.02, metalness: 0.2, envMapIntensity: 3, clearcoat: 1 }, A: {}, B: {} },
  porcelain:  { base: { color: '#f6f4ef', roughness: 0.08, clearcoat: 1 }, A: {}, B: {} },
  sevres:     { base: { color: '#1f3f8f', roughness: 0.08, clearcoat: 1 }, A: {}, B: {} },
  led:        { base: { color: '#ffe6c2', emissive: '#ffc47a', emissiveIntensity: 2.2, roughness: 0.5 }, A: {}, B: {}, noCast: true },
  bulb:       { base: { color: '#fff6e6', emissive: '#ffcf8a', emissiveIntensity: 4, roughness: 0.3 }, A: {}, B: {}, noCast: true },
  shade:      { base: { color: '#f3e7cf', emissive: '#ffcf8a', emissiveIntensity: 0.9, roughness: 0.9, side: THREE.DoubleSide }, A: {}, B: {}, noCast: true },
  hangerWood: { base: { color: '#c09a6c', roughness: 0.35, clearcoat: 0.8 }, A: {}, B: { map: 'walnut_col', rep: 0.4, tint: '#f6dcbc' } },
  paperBox:   { base: { color: '#e9e0cc', roughness: 0.8 }, A: {}, B: { map: 'linen_col', nor: 'linen_nor', rep: 0.3, tint: '#ece3cf', nrm: 0.4 } },
  hatbox:     { base: { color: '#2c3e63', roughness: 0.7 }, A: { map: 'weave', rep: 0.08, tint: '#2c3e63' }, B: { map: 'damask_col', nor: 'damask_nor', rep: 0.25, tint: '#3a5080', nrm: 0.8 } },
};

export const MATS = {};     // key → 当前材质（同一个对象，切换 A / B 时改属性）
export const NOCAST = new Set();
const REAL = {};            // 真实贴图缓存
let texLoader;
const aniso = { v: 8 };

export function realTextureList() {
  const s = new Set();
  for (const d of Object.values(DEF)) for (const k of ['map', 'nor', 'rgh']) if (d.B[k] && d.B[k].includes('_')) s.add(d.B[k]);
  return [...s];
}

export async function loadReal(onProgress) {
  texLoader = texLoader || new THREE.TextureLoader();
  const list = realTextureList(); let n = 0;
  await Promise.all(list.map(name => new Promise(res => texLoader.load(TEXDIR + name + '.webp', t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso.v; if (name.endsWith('_col')) t.colorSpace = THREE.SRGBColorSpace; REAL[name] = t; onProgress && onProgress(++n / list.length); res();
  }, undefined, () => { console.warn('tex fail', name); res(); }))));
}

function texFor(name, rep, abs, rot) {
  const src = PT[name] || REAL[name]; if (!src) return null;
  const t = src.clone(); t.needsUpdate = true;
  if (!abs && rep) t.repeat.set(1 / rep, 1 / rep);
  if (rot) t.rotation = rot;
  return t;
}

export function initMaterials(maxAniso) {
  aniso.v = Math.min(8, maxAniso || 8);
  makeProcTextures();
  for (const k of Object.keys(PT)) PT[k].anisotropy = aniso.v;
  for (const [key, d] of Object.entries(DEF)) {
    const m = new P({ ...d.base }); m.name = key; m.userData.base = { ...d.base };
    MATS[key] = m; if (d.noCast) NOCAST.add(key);
  }
  applyMode('A');
  return MATS;
}

const texCache = new Map();
function cached(key, mode, slot, name, rep, abs, rot) {
  const id = `${key}|${mode}|${slot}`; if (texCache.has(id)) return texCache.get(id);
  const t = texFor(name, rep, abs, rot); if (t && slot !== 'map' && slot !== 'emissiveMap' && slot !== 'alphaMap') t.colorSpace = THREE.NoColorSpace;
  if (t) texCache.set(id, t); return t;
}

export const TIER = { mobile: false };
export let MODE = 'A';
export function applyMode(mode) {
  MODE = mode;
  for (const [key, d] of Object.entries(DEF)) {
    const m = MATS[key], cfg = d[mode] || {}, base = d.base;
    // 复位到 base
    m.color.set(base.color || '#ffffff'); m.roughness = base.roughness ?? 1; m.metalness = base.metalness ?? 0;
    m.map = null; m.normalMap = null; m.roughnessMap = null; m.emissiveMap = null;
    if (cfg.tint) m.color.set(cfg.tint);
    if (cfg.color) m.color.set(cfg.color);
    if (cfg.map && cfg.alpha) { m.alphaMap = cached(key, mode, 'alphaMap', cfg.map, 0, true); }
    else if (cfg.map) m.map = cached(key, mode, 'map', cfg.map, cfg.rep, cfg.abs, cfg.rot);
    if (cfg.emap) m.emissiveMap = cached(key, mode, 'emissiveMap', cfg.emap, 0, true);
    if (mode === 'B') {
      if (cfg.nor) { m.normalMap = cached(key, mode, 'nor', cfg.nor, cfg.nrep || cfg.rep, false, cfg.rot); const s = cfg.nrm ?? 1; m.normalScale.set(s, s); }
      if (cfg.rgh) { m.roughnessMap = cached(key, mode, 'rgh', cfg.rgh, cfg.rep, false, cfg.rot); if (cfg.roughness != null) m.roughness = cfg.roughness; }
    }
    // 真实贴图还没加载完：先保持 A 的颜色
    if (mode === 'B' && cfg.map && !m.map) { const a = d.A || {}; m.color.set(a.map ? (a.tint || base.color || '#fff') : (cfg.tint || base.color || '#fff')); if (a.map) m.map = cached(key, 'A', 'map', a.map, a.rep, a.abs); }
    if (TIER.mobile && ['walnut', 'walnutPanel', 'parquet', 'ivory'].includes(key)) m.clearcoat = 0;
    m.needsUpdate = true;
  }
}
