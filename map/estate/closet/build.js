// 衣帽间样板间 · 场景构建（单位：米；x 向东，−z 为后墙（窗与柜墙），y 向上；房间 8 × 6 m，净高 3.5 m）
// 两版共用同一套几何：A / B 只换材质；另外 B 版把座钟、梳妆镜、吊灯、祖传衣箱、画框、怀表、瓷瓶换成真实 CC0 模型（main.js 加载）。
import * as THREE from 'three';
import { Kit, M, PI, garment, drape, moulding, metricUV } from './geo.js';
import { srand } from './mats.js';

export const ROOM = { x0: -4, x1: 4, z0: -3, z1: 3, h: 3.5, cut: 1.05, t: 0.24 };
const CAB_D = 0.62, CAB_TOP = 2.85, ZF = ROOM.z0 + CAB_D; // 柜体前沿 z

/* ---------------- 房间壳体 ---------------- */
function shell(k) {
  const { x0, x1, z0, z1, h, cut, t } = ROOM;
  // 地板（人字拼）+ 地板下的剖切厚度
  k.box('parquet', 0, -0.02, 0, x1 - x0, 0.02, z1 - z0);
  k.box('section', 0, -0.3, 0, x1 - x0 + 2 * t, 0.28, z1 - z0 + 2 * t);
  // 后墙（留窗洞 x −0.65…0.65，y 0.55…3.05）、左墙：满高；前墙、右墙：剖切到 cut 高
  const wx0 = -0.65, wx1 = 0.65, wy0 = 0.55, wy1 = 3.05;
  k.box('plaster', (x0 - t + wx0) / 2, 0, z0 - t / 2, wx0 - (x0 - t), h, t);
  k.box('plaster', (wx1 + x1 + t) / 2, 0, z0 - t / 2, x1 + t - wx1, h, t);
  k.box('plaster', 0, 0, z0 - t / 2, wx1 - wx0, wy0, t);
  k.box('plaster', 0, wy1, z0 - t / 2, wx1 - wx0, h - wy1, t);
  k.box('plaster', x0 - t / 2, 0, 0, t, h, z1 - z0);
  // 剖切墙：前墙留门洞 x 1.3…2.9
  k.box('plaster', x1 + t / 2, 0, 0, t, cut, z1 - z0 + 2 * t);
  k.box('plaster', (x0 - t + 1.3) / 2, 0, z1 + t / 2, 1.3 - (x0 - t), cut, t);
  k.box('plaster', (2.9 + x1) / 2, 0, z1 + t / 2, x1 - 2.9, cut, t);
  // 剖切面（深色 poché）
  k.box('section', x1 + t / 2, cut, 0, t + 0.004, 0.012, z1 - z0 + 2 * t);
  k.box('section', (x0 - t + 1.3) / 2, cut, z1 + t / 2, 1.3 - (x0 - t), 0.012, t + 0.004);
  k.box('section', (2.9 + x1) / 2, cut, z1 + t / 2, x1 - 2.9, 0.012, t + 0.004);
  k.box('section', (x0 - t + x1 + t) / 2, h, z0 - t / 2, x1 - x0 + 2 * t, 0.012, t + 0.004);
  k.box('section', x0 - t / 2, h, 0, t + 0.004, 0.012, z1 - z0);
  // 门套（胡桃木）+ 门槛（黑金花）
  for (const x of [1.3, 2.9]) k.box('walnut', x + (x < 2 ? -0.06 : 0.06), 0, z1 - 0.02, 0.12, cut, t + 0.08);
  k.box('nero', 2.1, -0.005, z1 + t / 2, 1.6, 0.012, t + 0.1);
  // 剖切墙内侧护墙板
  k.box('walnutPanel', x1 - 0.015, 0, 0, 0.03, cut - 0.02, z1 - z0);
  k.box('walnutPanel', (x0 + 1.3) / 2, 0, z1 - 0.015, 1.3 - x0, cut - 0.02, 0.03);
  k.box('walnutPanel', (2.9 + x1) / 2, 0, z1 - 0.015, x1 - 2.9, cut - 0.02, 0.03);
  k.box('brass', x1 - 0.035, cut - 0.06, 0, 0.012, 0.012, z1 - z0);
  k.box('brass', (x0 + 1.3) / 2, cut - 0.06, z1 - 0.035, 1.3 - x0, 0.012, 0.012);
  // 踢脚线（乌木）
  k.box('ebony', x1 - 0.04, 0, 0, 0.03, 0.14, z1 - z0);
  // 顶棚（只朝下的单面，外面俯视时自动看不见）+ 顶棚圆花饰
  const ceil = new THREE.PlaneGeometry(x1 - x0, z1 - z0); ceil.rotateX(PI / 2); metricUV(ceil); k.add('plaster', ceil, M(0, h, 0));
  // 冠顶线脚：后墙、左墙（剖面：由下至上外挑）
  const crown = [[0, 0], [0, 0.02], [0.05, 0.03], [0.09, 0.08], [0.14, 0.1], [0.2, 0.18], [0.24, 0.2], [0.28, 0.26], [0.3, 0.26], [0.3, 0]];
  k.add('plaster', moulding(x1 - x0, crown), M(0, h - 0.3, z0));
  k.add('plaster', moulding(z1 - z0, crown), M(x0, h - 0.3, 0, PI / 2));
  k.add('gilt', moulding(x1 - x0, [[0, 0.03], [0.012, 0.045], [0.024, 0.03]]), M(0, h - 0.33, z0));
  k.add('gilt', moulding(z1 - z0, [[0, 0.03], [0.012, 0.045], [0.024, 0.03]]), M(x0, h - 0.33, 0, PI / 2));
}

/* ---------------- 左墙饰面：胡桃木护墙 + 天城蓝锦缎 + 黄铜细框 ---------------- */
function leftWall(k) {
  const x = ROOM.x0, z0 = ZF, z1 = ROOM.z1;
  k.box('walnutPanel', x + 0.02, 0, (z0 + z1) / 2, 0.04, 0.95, z1 - z0);
  k.box('ebony', x + 0.045, 0, (z0 + z1) / 2, 0.03, 0.14, z1 - z0);
  k.add('walnut', moulding(z1 - z0, [[0, 0], [0, 0.07], [0.03, 0.07], [0.05, 0.05], [0.06, 0]]), M(x, 0.95, (z0 + z1) / 2, PI / 2));
  // 护墙板方格
  const n = 6, L = (z1 - z0) / n;
  for (let i = 0; i < n; i++) { const zc = z0 + L * (i + 0.5); k.box('walnut', x + 0.045, 0.22, zc, 0.012, 0.58, L - 0.16); k.box('brass', x + 0.052, 0.22, zc, 0.006, 0.008, L - 0.16); }
  // 锦缎墙面（0.99…3.15）
  k.box('damask', x + 0.012, 0.99, (z0 + z1) / 2, 0.024, 2.2, z1 - z0);
  // 黄铜细框分格
  for (const [a, b] of [[z0 + 0.1, -1.0], [-0.95, 0.95], [0.95, z1 - 0.1]]) {
    const zc = (a + b) / 2, w = b - a - 0.12;
    for (const y of [1.08, 3.05]) k.box('brass', x + 0.03, y, zc, 0.01, 0.012, w);
    for (const s of [-1, 1]) k.box('brass', x + 0.03, 1.08, zc + s * w / 2, 0.01, 1.98, 0.012);
  }
}

/* ---------------- 柜体：胡桃木 + 黄铜嵌条 + 玻璃门 + LED ---------------- */
function cabinetCarcass(k, xa, xb, o = {}) {
  const z0 = ROOM.z0, d = CAB_D, zc = z0 + d / 2, w = xb - xa, xc = (xa + xb) / 2;
  k.box('walnut', xc, 0, z0 + 0.01, w, CAB_TOP, 0.02);                // 背板
  k.box('ebony', xc, 0, zc + 0.02, w, 0.08, d - 0.06);                 // 踢脚
  k.box('walnut', xc, 0.08, zc, w, 0.03, d);                           // 底板
  k.box('walnut', xc, CAB_TOP - 0.05, zc, w, 0.05, d);                 // 顶板
  // 檐口：胡桃木 + 黄铜线
  k.add('walnut', moulding(w + 0.06, [[0, 0], [0, 0.03], [0.04, 0.05], [0.07, 0.1], [0.12, 0.12], [0.12, 0]]), M(xc, CAB_TOP - 0.12, ZF));
  k.box('brassPol', xc, CAB_TOP - 0.13, ZF + 0.005, w, 0.012, 0.012);
  // 柜顶到冠顶线脚之间的锦缎饰带
  k.box('damask', xc, CAB_TOP, z0 + 0.02, w, ROOM.h - 0.3 - CAB_TOP, 0.02);
  const nb = o.bays || 3, bw = w / nb;
  for (let i = 0; i <= nb; i++) {
    const x = xa + i * bw; k.box('walnut', x, 0.08, zc, 0.04, CAB_TOP - 0.13, d);
    k.box('brassPol', x, 0.12, ZF + 0.002, 0.012, CAB_TOP - 0.26, 0.006);  // 竖向黄铜嵌条
  }
  return { bw, nb };
}

function glassDoors(k, xa, xb, y0, y1, openBay = -1, nb = 3) {
  // 桃花心木框门（§313）：下段实木凸板，上段玻璃 + 细黄铜格条，竖向黄铜圆柱把手
  const bw = (xb - xa) / nb, h = y1 - y0, hp = 0.82;
  for (let b = 0; b < nb; b++) for (const s of [0, 1]) {
    const w = bw / 2 - 0.006, hx = s ? xa + (b + 1) * bw - 0.003 : xa + b * bw + 0.003; // 铰链侧
    const open = b === openBay; const ang = open ? (s ? -1 : 1) * 1.9 : 0;
    k.push(hx, y0, ZF + 0.02, ang);
    const dir = s ? -1 : 1, cx = dir * w / 2, st = 0.055;
    k.box('walnut', cx, 0, 0, w, st, 0.032); k.box('walnut', cx, h - st, 0, w, st, 0.032);
    k.box('walnut', dir * st / 2, 0, 0, st, h, 0.032); k.box('walnut', dir * (w - st / 2), 0, 0, st, h, 0.032);
    k.box('walnut', cx, hp, 0, w, 0.05, 0.032);
    // 下段凸板 + 线脚
    k.box('walnutPanel', cx, st, 0, w - 2 * st, hp - st, 0.02);
    k.box('walnut', cx, st + 0.06, 0.012, w - 2 * st - 0.12, hp - st - 0.12, 0.016, { r: 0.006 });
    // 上段玻璃 + 黄铜格条（2 列 × 4 行）
    const gy0 = hp + 0.05, gh = h - st - gy0, gw = w - 2 * st;
    k.box('glassTint', cx, gy0, 0, gw, gh, 0.006);
    k.box('brassPol', cx, gy0, 0.006, 0.008, gh, 0.006);
    for (let j = 1; j < 4; j++) k.box('brassPol', cx, gy0 + j * gh / 4, 0.006, gw, 0.008, 0.006);
    for (const yy of [gy0, gy0 + gh - 0.006]) k.box('brassPol', cx, yy, 0.017, gw, 0.006, 0.004);
    // 把手：竖向黄铜圆柱 + 两端座
    const hxp = dir * (w - st / 2);
    k.rod('brassPol', [hxp, hp - 0.12, 0.055], [hxp, hp + 0.34, 0.055], 0.011, 14);
    for (const yy of [hp - 0.1, hp + 0.32]) { k.rod('brassPol', [hxp, yy, 0.016], [hxp, yy, 0.055], 0.006); k.cyl('brassPol', hxp, yy, 0.016, 0.014, 0.006, 12, null, { rx: PI / 2 }); }
    // 打开的门：门内侧贴历代家主制服尺码表（传承细节）
    if (open && s === 0) k.plane('chart', cx, hp + 0.35, -0.018, 0.2, 0.4, { ry: PI, keepUV: true });
    k.pop();
  }
}

export function blob(k, x, y, z, w, d, ry = 0) { k.plane('blob', x, y, z, w, d, { rx: -PI / 2, rz: ry, keepUV: true }); }
function led(k, x, y, z, w, axis = 'x') { axis === 'x' ? k.box('led', x, y, z, w, 0.008, 0.012) : k.box('led', x, y, z, 0.012, 0.008, w); }

/* ---------------- 衣架与衣物 ---------------- */
function hanger(k, x, y, z) {
  k.tor('brassPol', x, y + 0.035, z, 0.022, 0.0028, PI * 1.3, { rs: 5, ts: 12, ry: PI / 2, rz: PI * 0.1 });
  k.rod('brassPol', [x, y, z], [x, y + 0.02, z], 0.0028, 6);
  // 宽肩木衣架（浅色，肩端加厚）
  const g = new THREE.TorusGeometry(0.6, 0.016, 6, 18, 0.72); g.rotateZ(PI / 2 - 0.36); g.scale(1, 1, 1.9);
  k.add('hangerWood', g, M(x, y - 0.6 + 0.005, z, PI / 2, 0, 0));
}
const PROF = {
  jacket: [[0, 0.07, 0.035], [0.03, 0.2, 0.07], [0.08, 0.225, 0.085], [0.3, 0.215, 0.085], [0.55, 0.195, 0.075], [1, 0.215, 0.07]],
  shirt:  [[0, 0.06, 0.025], [0.03, 0.18, 0.05], [0.08, 0.205, 0.055], [0.45, 0.19, 0.045], [1, 0.175, 0.035]],
  coat:   [[0, 0.07, 0.04], [0.03, 0.21, 0.08], [0.08, 0.235, 0.09], [0.35, 0.225, 0.09], [1, 0.26, 0.085]],
  gown:   [[0, 0.04, 0.02], [0.06, 0.15, 0.05], [0.22, 0.13, 0.06], [0.35, 0.16, 0.08], [1, 0.3, 0.16]],
  trouser:[[0, 0.18, 0.012], [0.1, 0.17, 0.02], [1, 0.16, 0.024]],
};
// 衣物：挂在杆上时略转向观者（ry），可以看到门襟 / 领口；肩部有落肩，袖子贴在侧前方下垂
function garmentAt(k, mat, type, x, y, z, H, seed, o = {}) {
  hanger(k, x, y, z);
  const ry = o.ry ?? 0.28;
  k.push(x, y - 0.02, z, ry);
  const g = garment(H, PROF[type], { seed, amp: o.amp ?? (type === 'gown' ? 0.03 : 0.012), folds: o.folds || (type === 'gown' ? 9 : 6), segA: type === 'gown' ? 36 : 26 });
  k.add(mat, g);
  if (type === 'jacket' || type === 'shirt' || type === 'coat') {
    const P = PROF[type], hd = P[3][2], sl = type === 'coat' ? 0.74 : type === 'jacket' ? 0.62 : 0.6;
    // 袖：从肩端垂下，靠前
    for (const s of [-1, 1]) { const sg = garment(sl, [[0, 0.05, 0.045], [0.2, 0.046, 0.04], [1, 0.036, 0.03]], { seed: seed * 3 + s, amp: 0.005, folds: 4, segA: 12, segY: 10 });
      k.add(mat, sg, M(hd * 0.55, -0.06, s * 0.19, 0, 0, s * 0.06)); }
    const fx = hd + 0.004;
    if (type === 'shirt') {
      // 领：立领两片 + 门襟 + 纽扣
      for (const s of [-1, 1]) k.box(mat, fx - 0.02, -0.085, s * 0.03, 0.03, 0.05, 0.05, { rx: -s * 0.5, r: 0.008 });
      k.box(mat, fx - 0.004, -0.6 * H, 0, 0.006, 0.6 * H - 0.08, 0.026);
      for (let i = 0; i < 5; i++) k.sph('porcelain', fx, -0.14 - i * 0.1, 0, 0.004, 0.006, 0.006, 6, 4);
    } else {
      // 西装 / 大衣：V 形驳领（同料，略亮的缎面边）+ 胸袋口袋巾
      for (const s of [-1, 1]) { k.push(fx - 0.012, -0.08, s * 0.015, 0, -s * 0.34); k.box(mat, 0, -0.26, s * 0.035, 0.012, 0.28, 0.06, { r: 0.004 }); k.pop(); }
      k.box(type === 'coat' ? 'shirtW' : 'shirtW', fx - 0.03, -0.3, 0, 0.02, 0.2, 0.05);
      k.box('satinBurg', fx - 0.006, -0.19, 0.12, 0.01, 0.025, 0.05, { rz: 0.1 });
      for (let i = 0; i < 2; i++) k.sph('ebony', fx + 0.002, -0.42 - i * 0.1, 0.035, 0.005, 0.008, 0.008, 6, 4);
    }
  }
  if (type === 'gown') k.tor('gilt', 0, -0.33, 0, 0.13, 0.006, PI * 2, { rs: 4, ts: 20, rx: PI / 2 }); // 腰间金色细带
  k.pop();
}

function hangingRun(k) {
  const xa = -3.95, xb = -0.95; const { bw } = cabinetCarcass(k, xa, xb);
  const zc = ROOM.z0 + CAB_D / 2 - 0.02, rnd = srand(21);
  const rod = (x0, x1, y) => { k.rod('brassPol', [x0 + 0.02, y, zc], [x1 - 0.02, y, zc], 0.014, 12); for (const x of [x0 + 0.03, x1 - 0.03]) k.cyl('brassPol', x, y - 0.03, zc, 0.02, 0.06, 10, null, { rz: PI / 2 }); };
  // 顶层搁板 + LED
  for (let b = 0; b < 3; b++) { const x0 = xa + b * bw, x1 = x0 + bw, xc = (x0 + x1) / 2;
    k.box('walnut', xc, 2.42, zc + 0.02, bw - 0.04, 0.03, CAB_D - 0.04); k.box('brassPol', xc, 2.42, ZF - 0.01, bw - 0.04, 0.03, 0.006);
    led(k, xc, 2.405, ZF - 0.05, bw - 0.08);
    // 搁板上：帽盒、叠好的毛衣
    if (b === 0) { k.cyl('hatbox', xc - 0.22, 2.45, zc, 0.2, 0.26, 24); k.cyl('gilt', xc - 0.22, 2.7, zc, 0.205, 0.012, 24); k.cyl('paperBox', xc + 0.22, 2.45, zc, 0.18, 0.22, 24); k.cyl('velvetBurg', xc + 0.22, 2.66, zc, 0.184, 0.02, 24); }
    else { const cols = b === 1 ? ['woolGrey', 'woolCamel', 'woolNavy', 'shirtW'] : ['woolChar', 'woolNavy', 'woolCamel', 'woolGrey'];
      for (let s = 0; s < 3; s++) for (let j = 0; j < 4; j++) k.box(cols[(j + s) % 4], x0 + 0.17 + s * 0.3, 2.45 + j * 0.055, zc + 0.02, 0.27, 0.05, 0.34, { r: 0.012 }); }
  }
  // 1 号格：长挂（礼服 + 大衣）
  { const x0 = xa, x1 = x0 + bw; rod(x0, x1, 2.24);
    const items = [['satinNight', 'gown', 1.6], ['satinChamp', 'gown', 1.62], ['satinBurg', 'gown', 1.58], ['woolCamel', 'coat', 1.15], ['woolChar', 'coat', 1.12], ['woolNavy', 'coat', 1.18]];
    items.forEach(([m, t, H], i) => garmentAt(k, m, t, x0 + 0.1 + i * 0.155, 2.2, zc, H, 11 + i, { ry: t === 'gown' ? 0.2 : 0.28 })); }
  // 2 号格：双层（衬衫 / 西裤）
  { const x0 = xa + bw, x1 = x0 + bw; rod(x0, x1, 2.24); rod(x0, x1, 1.22);
    const sh = ['shirtW', 'shirtW', 'shirtW', 'shirtP', 'shirtP', 'shirtB', 'shirtB'];
    sh.forEach((m, i) => garmentAt(k, m, 'shirt', x0 + 0.1 + i * 0.13, 2.2, zc, 0.78, 31 + i));
    const tr = ['woolCamel', 'woolGrey', 'woolGrey', 'woolNavy', 'woolNavy', 'woolChar'];
    tr.forEach((m, i) => garmentAt(k, m, 'trouser', x0 + 0.12 + i * 0.15, 1.18, zc, 0.6, 51 + i, { ry: 0.12 })); }
  // 3 号格：西装 + 下部抽屉
  { const x0 = xa + 2 * bw, x1 = x0 + bw, xc = (x0 + x1) / 2; rod(x0, x1, 2.24);
    const js = ['woolCamel', 'woolGrey', 'woolGrey', 'woolNavy', 'woolNavy', 'woolChar'];
    js.forEach((m, i) => garmentAt(k, m, 'jacket', x0 + 0.11 + i * 0.155, 2.2, zc, 0.8, 71 + i));
    for (let j = 0; j < 3; j++) { const y = 0.12 + j * 0.3; k.box('walnut', xc, y, ZF - 0.03, bw - 0.06, 0.27, 0.03, { r: 0.004 }); k.box('walnutPanel', xc, y + 0.04, ZF - 0.012, bw - 0.18, 0.19, 0.012, { r: 0.004 }); for (const d of [-0.2, 0.2]) { k.cyl('brassPol', xc + d, y + 0.2, ZF, 0.012, 0.012, 10, null, { rx: PI / 2 }); k.tor('brassPol', xc + d, y + 0.18, ZF + 0.012, 0.018, 0.003, PI * 2, { rs: 4, ts: 14 }); } }
    k.box('walnut', xc, 1.03, zc, bw - 0.04, 0.03, CAB_D - 0.04); led(k, xc, 1.015, ZF - 0.05, bw - 0.08); }
  // 立柱内侧竖向 LED
  for (let b = 0; b <= 3; b++) { const x = xa + b * bw; for (const s of [-1, 1]) if ((b > 0 || s > 0) && (b < 3 || s < 0)) k.box('led', x + s * 0.024, 0.2, ZF - 0.04, 0.006, 2.18, 0.01); }
  glassDoors(k, xa, xb, 0.1, 2.78, 1);
}

/* ---------------- 鞋墙：倾斜展示层板 + 每层灯带；下部包袋格 ---------------- */
function shoe(k, type, mat, x, y, z, ry, s = 1) {
  k.push(x, y, z, ry, 0, 0, s);
  if (type === 'oxford' || type === 'loafer') {
    // 皮底带沿条、1.5 cm 后跟；鞋面：鞋头收窄的杏仁头，后帮略高；鞋口露浅色内衬
    const hl = 0.028;
    k.box('sole', 0, 0, -0.105, 0.064, hl, 0.07, { r: 0.006 });
    k.push(0, hl * 0.6, 0, 0, 0.07);
    k.box('sole', 0, -0.01, -0.02, 0.078, 0.012, 0.21, { r: 0.005 }); k.sph('sole', 0, -0.004, 0.08, 0.036, 0.006, 0.06, 14, 6);
    k.sph(mat, 0, 0.004, 0.07, 0.034, 0.03, 0.07, 18, 10);
    k.box(mat, 0, -0.004, -0.04, 0.074, 0.062, 0.17, { r: 0.03 });
    k.sph('insole', 0, 0.057, -0.06, 0.026, 0.004, 0.052, 14, 4);
    k.tor(mat, 0, 0.056, -0.06, 0.03, 0.005, PI * 2, { rs: 5, ts: 20, rx: PI / 2 });
    if (type === 'oxford') { for (let i = 0; i < 4; i++) k.box('sole', 0, 0.045 + i * 0.003, 0.012 - i * 0.012, 0.028, 0.0025, 0.003); k.box(mat, 0, 0.03, 0.035, 0.07, 0.003, 0.004, { rx: 0.3 }); }
    if (type === 'loafer') { k.box(mat, 0, 0.03, 0.028, 0.06, 0.012, 0.03, { r: 0.004 }); k.tor('brassPol', 0, 0.046, 0.036, 0.016, 0.0028, PI, { rs: 4, ts: 10, rx: -PI / 2 + 0.25 }); }
    k.pop();
  } else if (type === 'pump') {
    k.push(0, 0.042, 0, 0, 0.36);
    k.box('sole', 0, -0.004, 0, 0.07, 0.007, 0.24, { r: 0.003 }); k.sph(mat, 0, 0.004, 0.07, 0.034, 0.03, 0.075, 16, 8);
    k.box(mat, 0, 0, -0.06, 0.072, 0.04, 0.1, { r: 0.014 }); k.sph('insole', 0, 0.041, -0.035, 0.027, 0.003, 0.058, 12, 4);
    k.pop(); k.cyl(mat, 0, 0, -0.1, 0.005, 0.078, 8, 0.011); k.cyl('sole', 0, 0, -0.1, 0.006, 0.006, 8);
  } else if (type === 'boot') {
    // 骑士靴：靴筒有脚踝收腰与小腿弧度
    k.box('sole', 0, 0, -0.105, 0.064, 0.03, 0.07, { r: 0.006 });
    k.push(0, 0.018, 0, 0, 0.07); k.box('sole', 0, -0.008, -0.02, 0.08, 0.012, 0.21, { r: 0.005 }); k.sph(mat, 0, 0.004, 0.07, 0.036, 0.034, 0.07, 16, 8); k.box(mat, 0, -0.004, -0.03, 0.076, 0.07, 0.16, { r: 0.03 }); k.pop();
    k.lathe(mat, 0, 0.05, -0.06, [[0.036, 0], [0.04, 0.03], [0.036, 0.08], [0.042, 0.16], [0.05, 0.24], [0.052, 0.3], [0.048, 0.34], [0.044, 0.34]], 18);
    k.sph('insole', 0, 0.39, -0.06, 0.044, 0.003, 0.044, 12, 4);
  }
  k.pop();
}
function shoeWall(k) {
  const xa = 0.95, xb = 3.95; const { bw } = cabinetCarcass(k, xa, xb);
  const zc = ROOM.z0 + CAB_D / 2 - 0.02, rnd = srand(33);
  const sets = [
    [['oxford', 'patent'], ['oxford', 'leatherTan'], ['loafer', 'leatherRed']],
    [['pump', 'leatherBlk'], ['pump', 'satinBurg'], ['pump', 'leatherCrm']],
    [['loafer', 'leatherTan'], ['oxford', 'leatherBlk'], ['loafer', 'velvetGreen']],
    [['pump', 'satinNight'], ['pump', 'satinChamp'], ['pump', 'patent']],
    [['boot', 'leatherBlk'], ['boot', 'leatherTan'], ['boot', 'leatherRed']],
  ];
  for (let b = 0; b < 3; b++) {
    const x0 = xa + b * bw, xc = x0 + bw / 2;
    // 下部：包袋格（两格，皮革衬里）+ 分隔
    k.box('walnut', xc, 0.95, zc, bw - 0.04, 0.035, CAB_D - 0.04); k.box('brassPol', xc, 0.95, ZF - 0.01, bw - 0.04, 0.035, 0.006);
    led(k, xc, 0.935, ZF - 0.05, bw - 0.08);
    k.box('walnut', xc, 0.11, zc, 0.03, 0.84, CAB_D - 0.04);
    for (const s of [-1, 1]) k.box('leatherCrm', xc + s * bw / 4, 0.115, zc - 0.05, bw / 2 - 0.06, 0.005, CAB_D - 0.2);
    // 上部：5 层倾斜层板
    for (let r = 0; r < 5; r++) {
      const y = 1.12 + r * 0.33, tilt = 0.24;
      k.push(xc, y, zc + 0.02, 0, tilt);
      k.box('walnut', 0, 0, 0, bw - 0.05, 0.022, CAB_D - 0.1);
      k.box('brassPol', 0, 0.02, (CAB_D - 0.1) / 2 - 0.01, bw - 0.05, 0.028, 0.01); // 挡鞋黄铜条
      led(k, 0, -0.01, (CAB_D - 0.1) / 2 - 0.04, bw - 0.1);
      const set = sets[(r + b) % sets.length];
      set.slice(0, 2).forEach(([t, m], i) => { const px = (i - 0.5) * (bw - 0.1) / 2; for (const s of [-1, 1]) shoe(k, t, m, px + s * 0.058, 0.02, 0.02 + (rnd() - 0.5) * 0.01, s * 0.06, 0.95); });
      blob(k, 0, 0.0115, 0.02, bw - 0.1, 0.34);
      k.pop();
    }
  }
  // 包袋（下格）
  const bags = [['leatherTan', 0.34, 0.26, 0.15], ['leatherBlk', 0.3, 0.22, 0.12], ['leatherRed', 0.32, 0.24, 0.14], ['leatherCrm', 0.36, 0.28, 0.16], ['leatherBlk', 0.28, 0.2, 0.1], ['velvetGreen', 0.24, 0.16, 0.08]];
  bags.forEach(([m, w, h, d], i) => { const b = (i / 2) | 0, s = i % 2 ? 1 : -1, xc = xa + b * bw + bw / 2 + s * bw / 4; bag(k, m, xc, 0.12, zc + 0.02, w, h, d); });
}
function bag(k, m, x, y, z, w, h, d) {
  k.box(m, x, y, z, w, h, d, { r: 0.025 });
  k.box(m, x, y + h - 0.01, z + d / 2 - 0.005, w * 0.98, 0.07, 0.012, { r: 0.004, rx: 0.12 }); // 翻盖
  k.box('brassPol', x, y + h - 0.075, z + d / 2 + 0.006, 0.04, 0.03, 0.008, { r: 0.004 });   // 锁扣
  k.tor(m, x, y + h, z, w * 0.28, 0.009, PI, { rs: 6, ts: 14 });                           // 提手
  for (const s of [-1, 1]) k.tor('brassPol', x + s * w * 0.28, y + h + 0.004, z, 0.012, 0.003, PI * 2, { rs: 4, ts: 10, ry: PI / 2 });
}

/* ---------------- 窗：落地窗洞、窗座、丝绒帷幔 + 纱帘、刺绣家徽帷头 ---------------- */
function windowBay(k) {
  const z0 = ROOM.z0, wx0 = -0.65, wx1 = 0.65, wy0 = 0.55, wy1 = 3.05;
  // 窗外天空
  k.plane('sky', 0, (wy0 + wy1) / 2, z0 - 0.3, 1.7, 2.75, { keepUV: true });
  // 窗框与窗棂（象牙漆）
  const w = wx1 - wx0, h = wy1 - wy0, zf = z0 - 0.12;
  k.box('ivory', 0, wy0, zf, w, 0.06, 0.08); k.box('ivory', 0, wy1 - 0.06, zf, w, 0.06, 0.08);
  for (const x of [wx0 + 0.03, wx1 - 0.03, 0]) k.box('ivory', x, wy0, zf, 0.05, h, 0.08);
  for (let j = 1; j < 5; j++) k.box('ivory', 0, wy0 + j * h / 5, zf, w, 0.025, 0.05);
  for (const x of [-w / 4, w / 4]) k.box('ivory', x, wy0, zf, 0.022, h, 0.05);
  k.box('glass', 0, wy0, zf, w, h, 0.01);
  k.box('brassPol', 0.04, wy0 + h * 0.45, zf + 0.05, 0.02, 0.12, 0.02);
  // 窗洞侧壁（胡桃木）与窗座
  for (const x of [-0.95, 0.95]) k.box('walnut', x + (x < 0 ? 0.015 : -0.015), 0, z0 + CAB_D / 2 - 0.12, 0.03, CAB_TOP, CAB_D + 0.24);
  k.box('walnut', 0, 0, z0 + CAB_D / 2 - 0.05, 1.9, 0.44, CAB_D + 0.1);
  k.box('brassPol', 0, 0.44, ZF + 0.05, 1.9, 0.012, 0.012);
  for (const x of [-0.6, 0, 0.6]) k.box('walnut', x, 0.12, ZF + 0.058, 0.52, 0.24, 0.01, { r: 0.004 });
  k.box('velvetBlue', 0, 0.45, z0 + CAB_D / 2 - 0.06, 1.84, 0.1, CAB_D + 0.02, { r: 0.04 });
  for (let i = 0; i < 3; i++) k.box('damask', -0.55 + i * 0.55, 0.55, z0 + 0.12, 0.42, 0.34, 0.12, { r: 0.05, rx: -0.25 }); // 靠枕
  // 窗楣上方：檐口延续
  k.box('walnut', 0, CAB_TOP - 0.05, z0 + CAB_D / 2, 1.9, 0.05, CAB_D);
  k.box('damask', 0, CAB_TOP, z0 + 0.02, 1.9, ROOM.h - 0.3 - CAB_TOP, 0.02);
  // 帷头（丝绒 + 金穗 + 刺绣家徽）
  const pz = ZF + 0.04;
  k.box('curtain', 0, 2.6, pz, 2.0, 0.34, 0.06, { r: 0.02 });
  for (let i = 0; i < 25; i++) k.cyl('gilt', -0.96 + i * 0.08, 2.53, pz + 0.035, 0.008, 0.07, 5, 0.004);
  k.box('gilt', 0, 2.6, pz + 0.031, 2.0, 0.012, 0.004);
  k.plane('crest', 0, 2.78, pz + 0.032, 0.3, 0.3, { keepUV: true });
  // 帷幔：两侧，腰部束带
  const gather = (t) => t < 0.45 ? 1 - 0.55 * Math.sin(t / 0.45 * PI / 2) : 0.45 + 0.35 * Math.pow((t - 0.45) / 0.55, 1.2);
  k.add('curtain', drape(0.62, 2.55, { seed: 5, gather, side: 1, amp: 0.045, folds: 7 }), M(-0.98, 2.6, pz - 0.02));
  k.add('curtain', drape(0.62, 2.55, { seed: 9, gather, side: -1, amp: 0.045, folds: 7 }), M(0.98, 2.6, pz - 0.02));
  for (const s of [-1, 1]) { k.tor('gilt', s * 0.78, 1.45, pz, 0.08, 0.012, PI * 2, { rs: 6, ts: 18, rx: PI / 2 }); k.cyl('gilt', s * 0.74, 1.24, pz + 0.02, 0.03, 0.18, 8, 0.012); }
  // 纱帘（内层）
  k.add('sheer', drape(1.3, 2.45, { seed: 12, side: 1, amp: 0.02, folds: 16 }), M(-0.65, 2.55, z0 - 0.02));
}

/* ---------------- 中岛：大理石台面 + 玻璃首饰 / 腕表展示 + 领带抽屉 ---------------- */
function island(k, o = {}) {
  const X = 0, Z = 0.25, W = 2.4, D = 1.1, Hh = 0.95;
  k.push(X, 0, Z);
  k.box('brass', 0, 0, 0, W - 0.16, 0.08, D - 0.16);
  k.box('walnut', 0, 0.08, 0, W - 0.06, Hh - 0.24, D - 0.06);
  // 台面下的围板（让玻璃展示窗下留出 11 cm 深的丝绒托盘空间）
  for (const sz of [-1, 1]) k.box('walnut', 0, Hh - 0.16, sz * (D / 2 - 0.05), W - 0.06, 0.11, 0.08);
  for (const sx of [-1, 1]) k.box('walnut', sx * (W / 2 - 0.05), Hh - 0.16, 0, 0.08, 0.11, D - 0.06);
  k.box('walnut', -0.62, Hh - 0.16, 0, 1.1, 0.11, D - 0.06); k.box('walnut', 1.12, Hh - 0.16, 0, 0.1, 0.11, D - 0.06);
  // 抽屉面：两长边 4 列 × 3 行，黄铜嵌线 + 拉手
  const cols = 4, cw = (W - 0.12) / cols;
  for (const s of [-1, 1]) for (let c = 0; c < cols; c++) for (let r = 0; r < 3; r++) {
    if (s > 0 && c === 0 && r === 2) continue; // 被拉开的领带抽屉单独做
    const x = -W / 2 + 0.06 + cw * (c + 0.5), y = 0.1 + r * 0.25;
    k.box('walnut', x, y, s * (D / 2 - 0.02), cw - 0.02, 0.23, 0.02, { r: 0.004 });
    k.box('walnutPanel', x, y + 0.035, s * (D / 2 - 0.006), cw - 0.1, 0.16, 0.01, { r: 0.004 });
    k.cyl('brassPol', x, y + 0.115, s * (D / 2), 0.02, 0.006, 16, null, { rx: PI / 2 }); k.sph('brassPol', x, y + 0.115, s * (D / 2 + 0.014), 0.012, 0.012, 0.012, 12, 8);
    
  }
  // 两端：竖向黄铜嵌条
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('brassPol', sx * (W / 2 - 0.03), 0.08, sz * (D / 2 - 0.03), 0.01, Hh - 0.14, 0.01);
  // 台面：大理石框 + 中间玻璃展示窗（x −0.05…1.05）
  const T = 0.05, gx0 = -0.05, gx1 = 1.05, gz = 0.36;
  k.box('calacatta', (-W / 2 - 0.02 + gx0) / 2, Hh - T, 0, gx0 + W / 2 + 0.02, T, D + 0.04);
  k.box('calacatta', (gx1 + W / 2 + 0.02) / 2, Hh - T, 0, W / 2 + 0.02 - gx1, T, D + 0.04);
  for (const s of [-1, 1]) k.box('calacatta', (gx0 + gx1) / 2, Hh - T, s * (gz + (D / 2 + 0.02 - gz) / 2), gx1 - gx0, T, D / 2 + 0.02 - gz);
  for (const s of [-1, 1]) { k.box('brassPol', (gx0 + gx1) / 2, Hh - 0.01, s * (gz + 0.006), gx1 - gx0 + 0.024, 0.014, 0.014); k.box('brassPol', s > 0 ? gx1 + 0.006 : gx0 - 0.006, Hh - 0.01, 0, 0.014, 0.014, gz * 2 + 0.024); }
  k.box('glass', (gx0 + gx1) / 2, Hh - 0.01, 0, gx1 - gx0, 0.008, gz * 2);
  // 展示托盘（丝绒）
  const ty = Hh - 0.16; k.box('velvetNavy', (gx0 + gx1) / 2, ty, 0, gx1 - gx0, 0.02, gz * 2);
  led(k, (gx0 + gx1) / 2, Hh - 0.04, -gz + 0.02, gx1 - gx0 - 0.04);
  // 腕表：表枕 + 表壳 + 表盘
  for (let i = 0; i < 6; i++) {
    const x = gx0 + 0.1 + (i % 3) * 0.16, z = -0.18 + ((i / 3) | 0) * 0.2, y = ty + 0.02;
    k.box('velvetBurg', x, y, z, 0.07, 0.045, 0.1, { r: 0.02 });
    k.tor(i % 2 ? 'leatherBlk' : 'steel', x, y + 0.03, z, 0.036, 0.007, PI * 2, { rs: 5, ts: 18, rz: PI / 2 });
    k.cyl(i % 3 === 1 ? 'steel' : 'brassPol', x, y + 0.065, z, 0.019, 0.01, 20, null, { rx: 0 });
    k.cyl('dial', x, y + 0.075, z, 0.015, 0.002, 20, null, { keepUV: true });
  }
  // 首饰：珍珠项链、戒指、胸针、袖扣（右半托盘）
  { const cx = 0.72, cz = -0.08; for (let i = 0; i < 40; i++) { const a = i / 40 * PI * 2; k.sph('pearl', cx + Math.cos(a) * 0.1, ty + 0.03, cz + Math.sin(a) * 0.13, 0.009, 0.009, 0.009, 8, 6); }
    k.sph('ruby', cx, ty + 0.035, cz + 0.13, 0.016, 0.02, 0.012, 8, 6);
    for (let i = 0; i < 4; i++) { const x = 0.62 + i * 0.07, z = 0.2; k.tor('brassPol', x, ty + 0.03, z, 0.012, 0.0028, PI * 2, { rs: 4, ts: 14, rx: PI / 2 - 0.4 }); const gm = new THREE.OctahedronGeometry(0.008); k.add(i % 2 ? 'gem' : 'ruby', gm, M(x, ty + 0.045, z + 0.004)); }
    k.cyl('gilt', 0.92, ty + 0.022, 0.14, 0.03, 0.01, 16); k.cyl('sevres', 0.92, ty + 0.032, 0.14, 0.022, 0.004, 16);
  }
  // 拉开的领带抽屉（+z 面，第 1 列最上排）：丝绒格 4 × 6，领带卷
  { const x = -W / 2 + 0.06 + cw * 0.5, y = 0.1 + 2 * 0.25, pull = 0.34, zf = D / 2 - 0.02 + pull;
    k.box('walnut', x, y, zf, cw - 0.02, 0.23, 0.02, { r: 0.004 }); k.box('walnutPanel', x, y + 0.035, zf + 0.014, cw - 0.1, 0.16, 0.01, { r: 0.004 }); k.cyl('brassPol', x, y + 0.115, zf + 0.02, 0.02, 0.006, 16, null, { rx: PI / 2 }); k.sph('brassPol', x, y + 0.115, zf + 0.034, 0.012, 0.012, 0.012, 12, 8); 
    const bx = cw - 0.06, bz = 0.46; k.box('walnut', x, y + 0.02, zf - bz / 2 - 0.01, bx, 0.012, bz); for (const s of [-1, 1]) k.box('walnut', x + s * bx / 2, y + 0.02, zf - bz / 2 - 0.01, 0.012, 0.13, bz);
    k.box('velvetBurg', x, y + 0.032, zf - bz / 2 - 0.01, bx - 0.02, 0.006, bz - 0.02);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) {
      const tx = x - bx / 2 + 0.06 + i * (bx - 0.1) / 3, tz = zf - 0.05 - j * 0.07;
      const g = new THREE.CylinderGeometry(0.028, 0.028, 0.05, 16, 1); const uv = g.attributes.uv; const slot = ((i * 6 + j) % 8);
      for (let q = 0; q < uv.count; q++) uv.setX(q, (slot + uv.getX(q) * 0.95) / 8);
      k.add('silkTies', g, M(tx, y + 0.064, tz, 0, 0, 0));
    }
    for (let i = 1; i < 4; i++) k.box('brass', x - bx / 2 + i * bx / 4, y + 0.035, zf - bz / 2 - 0.01, 0.004, 0.06, bz - 0.02);
  }
  // 台面陈设：皮革首饰盒、银托盘上的袖扣、叠好的口袋巾
  k.box('leatherRed', -0.8, Hh, -0.1, 0.34, 0.1, 0.24, { r: 0.012 }); k.box('brassPol', -0.8, Hh + 0.06, 0.021, 0.04, 0.02, 0.006); k.plane('crest', -0.8, Hh + 0.1005, -0.1, 0.12, 0.12, { rx: -PI / 2, keepUV: true });
  k.cyl('steel', -0.35, Hh, 0.15, 0.1, 0.012, 24); for (const d of [-0.025, 0.025]) k.cyl('gilt', -0.35 + d, Hh + 0.012, 0.15, 0.012, 0.008, 12);
  k.box('shirtW', -0.3, Hh, -0.25, 0.14, 0.012, 0.14, { r: 0.004 }); k.box('satinBurg', -0.3, Hh + 0.012, -0.25, 0.1, 0.006, 0.1, { r: 0.003, ry: 0.4 });
  k.pop();
}

/* ---------------- 梳妆位（左墙）：梳妆台 + 壁灯 + 丝绒圆凳 ---------------- */
function vanity(k) {
  const x = ROOM.x0 + 0.3, z = 0;
  k.push(x, 0, z, PI / 2);
  // 桌：胡桃木，弯腿，鎏金饰件，大理石面
  for (const [lx, lz] of [[-0.6, -0.2], [0.6, -0.2], [-0.6, 0.2], [0.6, 0.2]]) { k.cyl('walnut', lx, 0, lz, 0.022, 0.72, 10, 0.03); k.cyl('gilt', lx, 0, lz, 0.026, 0.05, 10); }
  k.box('walnut', 0, 0.62, 0, 1.3, 0.12, 0.5, { r: 0.01 });
  for (const s of [-1, 1]) { k.box('walnut', s * 0.36, 0.63, 0.25, 0.44, 0.1, 0.01, { r: 0.003 }); k.cyl('gilt', s * 0.36, 0.68, 0.26, 0.012, 0.02, 10, null, { rx: PI / 2 }); }
  k.box('calacatta', 0, 0.74, 0, 1.36, 0.03, 0.54);
  // 台面：银背梳、香水瓶、首饰托盘
  k.box('steel', -0.4, 0.77, 0.05, 0.22, 0.012, 0.07, { r: 0.004 });
  for (let i = 0; i < 3; i++) { k.cyl('glassTint', 0.3 + i * 0.09, 0.77, -0.05, 0.03, 0.1 - i * 0.02, 12); k.sph('gem', 0.3 + i * 0.09, 0.8 + 0.1 - i * 0.02, -0.05, 0.015, 0.02, 0.015, 8, 6); }
  k.cyl('gilt', -0.05, 0.77, 0.05, 0.12, 0.012, 24);
  k.pop();
  // 壁灯（两侧）：竖向椭圆鎏金背板、S 形烛台臂、褶皱灯罩
  for (const sd of [-1, 1]) { const zz = z + sd * 0.72, wx = ROOM.x0 + 0.02;
    k.sph('gilt', wx, 1.6, zz, 0.018, 0.13, 0.07, 16, 10);
    k.rod('gilt', [wx + 0.01, 1.56, zz], [wx + 0.1, 1.54, zz], 0.007); k.rod('gilt', [wx + 0.1, 1.54, zz], [wx + 0.16, 1.62, zz], 0.007);
    k.cyl('gilt', wx + 0.16, 1.62, zz, 0.028, 0.02, 12); k.cyl('porcelain', wx + 0.16, 1.64, zz, 0.012, 0.07, 10);
    const sh = new THREE.CylinderGeometry(0.055, 0.1, 0.15, 32, 1, true); const pp = sh.attributes.position; for (let i = 0; i < pp.count; i++) { const a2 = Math.atan2(pp.getZ(i), pp.getX(i)), f = 1 + 0.06 * Math.abs(Math.sin(a2 * 8)); pp.setX(i, pp.getX(i) * f); pp.setZ(i, pp.getZ(i) * f); } sh.computeVertexNormals();
    k.add('shade', sh, M(wx + 0.16, 1.77, zz)); k.sph('bulb', wx + 0.16, 1.73, zz, 0.018, 0.028, 0.018, 8, 6); }
  // 丝绒圆凳 + 金色流苏
  k.cyl('velvetBlue', x + 0.55, 0.42, z, 0.24, 0.1, 28, null, { keepUV: false }); k.sph('velvetBlue', x + 0.55, 0.52, z, 0.24, 0.05, 0.24, 24, 6);
  k.cyl('gilt', x + 0.55, 0.4, z, 0.245, 0.02, 28);
  for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4; k.cyl('walnut', x + 0.55 + Math.cos(a) * 0.18, 0, z + Math.sin(a) * 0.18, 0.02, 0.4, 8, 0.025); }
}

/* ---------------- 全身镜（左墙，靠前）：镜面由 main.js 放 Reflector，这里做框 ---------------- */
export const MIRROR = { x: ROOM.x0 + 0.06, y: 1.2, z: 1.4, w: 0.8, h: 2.0 };
function fullMirror(k) {
  const { x, y, z, w, h } = MIRROR;
  k.push(x, 0, z, PI / 2);
  k.box('walnut', 0, y - h / 2 - 0.08, -0.03, w + 0.16, h + 0.16, 0.04);
  for (const [yy, ww, hh] of [[y - h / 2 - 0.08, w + 0.16, 0.08], [y + h / 2, w + 0.16, 0.08]]) k.box('gilt', 0, yy, 0.0, ww, hh, 0.035, { r: 0.012 });
  for (const s of [-1, 1]) k.box('gilt', s * (w / 2 + 0.04), y - h / 2, 0, 0.08, h, 0.035, { r: 0.012 });
  // 顶饰：小家徽（刺绣 / 贴金）
  k.plane('crest', 0, y + h / 2 + 0.2, 0.02, 0.28, 0.28, { keepUV: true });
  k.pop();
}

/* ---------------- 包袋玻璃展柜（右侧剖切墙内） ---------------- */
function bagVitrine(k) {
  const x = ROOM.x1 - 0.23, zs = [-2.1, -1.2, -0.3, 0.6, 1.5], d = 0.4, H = 0.98;
  k.box('ebony', x, 0, (zs[0] + zs[4]) / 2, d, 0.08, 4.4);
  k.box('walnut', x, 0.08, (zs[0] + zs[4]) / 2, d, 0.02, 4.4);
  k.box('calacatta', x - 0.01, H, (zs[0] + zs[4]) / 2, d + 0.04, 0.03, 4.44);
  k.box('walnut', x + 0.18, 0.08, (zs[0] + zs[4]) / 2, 0.02, H - 0.08, 4.4);
  const bags = [['leatherTan', 0.32, 0.26, 0.16], ['leatherCrm', 0.36, 0.3, 0.16], ['leatherRed', 0.28, 0.22, 0.12], ['leatherBlk', 0.34, 0.28, 0.17], ['velvetBurg', 0.26, 0.18, 0.08]];
  zs.forEach((z, i) => {
    for (const s of [-1, 1]) k.box('walnut', x, 0.08, z + s * 0.44, d, H - 0.08, 0.025);
    k.box('brassPol', x - d / 2 - 0.005, 0.1, z + 0.44, 0.012, H - 0.12, 0.01);
    k.box('glass', x - d / 2 + 0.01, 0.1, z, 0.01, H - 0.12, 0.86);
    led(k, x, H - 0.03, z, 0.8, 'z');
    const [m, w, h, dd] = bags[i]; k.push(x, 0, z, -PI / 2); bag(k, m, 0, 0.1, 0, w, h, dd); k.pop();
  });
  // 台面上：礼帽与手套
  k.cyl('leatherBlk', x - 0.02, H + 0.03, -1.5, 0.17, 0.012, 24); k.cyl('leatherBlk', x - 0.02, H + 0.042, -1.5, 0.1, 0.14, 24, 0.095); k.cyl('satinBurg', x - 0.02, H + 0.05, -1.5, 0.102, 0.03, 24);
  k.box('leatherTan', x - 0.02, H + 0.03, 0.2, 0.1, 0.012, 0.22, { r: 0.004, ry: 0.3 });
}

/* ---------------- 换鞋凳（丝绒，刺绣家徽） ---------------- */
function bench(k) {
  const x = 2.45, z = -1.35, L = 1.3, D = 0.46;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.cyl('walnut', x + sx * (L / 2 - 0.06), 0, z + sz * (D / 2 - 0.06), 0.022, 0.38, 10, 0.03); k.cyl('gilt', x + sx * (L / 2 - 0.06), 0, z + sz * (D / 2 - 0.06), 0.026, 0.04, 10); }
  k.box('walnut', x, 0.34, z, L, 0.06, D, { r: 0.01 });
  k.box('velvetGreen', x, 0.39, z, L - 0.02, 0.1, D - 0.02, { r: 0.045 });
  // 簇绒扣
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) k.sph('gilt', x - 0.48 + i * 0.24, 0.49, z - 0.1 + j * 0.2, 0.008, 0.005, 0.008, 6, 4);
  k.plane('crest', x, 0.492, z, 0.24, 0.24, { rx: -PI / 2, keepUV: true });
  // 流苏边
  for (let i = 0; i < 26; i++) for (const s of [-1, 1]) k.cyl('gilt', x - L / 2 + 0.03 + i * 0.049, 0.33, z + s * (D / 2), 0.005, 0.06, 4, 0.003);
}

/* ---------------- 地毯 ---------------- */
function rug(k) { k.plane('rug', 0, 0.004, 0.25, 4.4, 3.3, { rx: -PI / 2, keepUV: true }); }

/* ---------------- A 版程序替身（B 版换成真实模型） ---------------- */
export const SLOTS = {
  clock:   { pos: [ROOM.x0 + 0.3, 0, -1.72], ry: PI / 2, h: 2.2 },
  mirror:  { pos: [ROOM.x0 + 0.035, 1.62, 0], ry: PI / 2, h: 1.05 },
  chand:   { pos: [0, ROOM.h, 0.25], ry: 0, h: 1.05 },
  chest:   { pos: [ROOM.x0 + 0.33, 0, 2.42], ry: PI / 2, h: 0.62 },
  frame:   { pos: [ROOM.x0 + 0.035, 1.72, 2.42], ry: PI / 2, h: 0.7 },
  watch:   { pos: [0.4, 0.812, 0.43], ry: 0, h: 0.07 },
  vase:    { pos: [ROOM.x0 + 0.3, 0.77, -0.45], ry: 0, h: 0.34 },
};
export function procStandins() {
  const out = {};
  const mk = (name, f) => { const k = new Kit(); f(k); out[name] = k.build('A:' + name); };
  mk('clock', k => { const [x, y, z] = SLOTS.clock.pos; k.push(x, y, z, SLOTS.clock.ry);
    k.box('walnut', 0, 0, 0, 0.56, 0.3, 0.34); k.box('walnut', 0, 0.3, 0, 0.44, 1.2, 0.28); k.box('glassTint', 0, 0.55, 0.141, 0.22, 0.7, 0.005);
    k.cyl('brassPol', 0, 0.62, 0.12, 0.07, 0.01, 20, null, { rx: PI / 2 }); k.rod('brassPol', [0, 0.65, 0.12], [0, 1.2, 0.12], 0.005);
    k.box('walnut', 0, 1.5, 0, 0.54, 0.52, 0.34); k.cyl('dial', 0, 1.76, 0.172, 0.17, 0.004, 32, null, { rx: PI / 2, keepUV: true }); k.cyl('gilt', 0, 1.76, 0.17, 0.185, 0.006, 32, null, { rx: PI / 2 });
    k.box('walnut', 0, 2.02, 0, 0.6, 0.06, 0.38); for (const s of [-1, 0, 1]) k.sph('gilt', s * 0.24, 2.14, 0, 0.035, 0.06, 0.035, 10, 8);
    for (const s of [-1, 1]) k.cyl('gilt', s * 0.25, 1.5, 0.15, 0.018, 0.5, 10); k.pop(); });
  mk('mirror', k => { const [x, y, z] = SLOTS.mirror.pos; k.push(x, y, z, SLOTS.mirror.ry);
    const sh = new THREE.Shape(); sh.moveTo(-0.36, -0.5); sh.lineTo(0.36, -0.5); sh.lineTo(0.36, 0.25); sh.absarc(0, 0.25, 0.36, 0, PI, false); sh.lineTo(-0.36, -0.5);
    const hole = new THREE.Path(); hole.moveTo(-0.3, -0.44); hole.lineTo(0.3, -0.44); hole.lineTo(0.3, 0.25); hole.absarc(0, 0.25, 0.3, 0, PI, false); hole.lineTo(-0.3, -0.44); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 24 }); metricUV(g); k.add('gilt', g);
    const inner = new THREE.Shape(hole.getPoints(24)); const gi = new THREE.ShapeGeometry(inner, 24); metricUV(gi); k.add('mirror', gi, M(0, 0, 0.02));
    k.sph('gilt', 0, 0.66, 0.03, 0.06, 0.05, 0.02, 12, 8); k.pop(); });
  mk('chand', k => { const [x, y, z] = SLOTS.chand.pos; k.push(x, y, z);
    k.rod('brassPol', [0, 0, 0], [0, -0.45, 0], 0.01); k.cyl('brassPol', 0, -0.03, 0, 0.08, 0.03, 16); k.sph('brassPol', 0, -0.55, 0, 0.07, 0.1, 0.07, 14, 10);
    for (const [r, yy, n] of [[0.36, -0.68, 8], [0.22, -0.52, 6]]) { k.tor('brassPol', 0, yy, 0, r, 0.01, PI * 2, { rs: 6, ts: 40, rx: PI / 2 });
      for (let i = 0; i < n; i++) { const a = i / n * PI * 2, cx = Math.cos(a) * r, cz = Math.sin(a) * r; k.cyl('brassPol', cx, yy, cz, 0.025, 0.02, 10); k.cyl('porcelain', cx, yy + 0.02, cz, 0.01, 0.08, 8); k.sph('bulb', cx, yy + 0.115, cz, 0.012, 0.022, 0.012, 8, 6);
        k.sph('gem', cx, yy - 0.06, cz, 0.012, 0.022, 0.012, 6, 4); } }
    for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; k.sph('gem', Math.cos(a) * 0.3, -0.62 - (i % 2) * 0.04, Math.sin(a) * 0.3, 0.008, 0.016, 0.008, 6, 4); }
    k.pop(); });
  mk('chest', k => { const [x, y, z] = SLOTS.chest.pos; k.push(x, y, z, SLOTS.chest.ry);
    k.box('leatherOld', 0, 0.04, 0, 0.94, 0.42, 0.5, { r: 0.015 }); k.cyl('leatherOld', 0, 0.44, 0, 0.25, 0.94, 24, null, { rz: PI / 2, ry: 0 });
    for (const s of [-0.3, 0.3]) { k.box('brass', s, 0.04, 0, 0.05, 0.43, 0.515); k.tor('brass', s, 0.44, 0, 0.255, 0.012, PI, { rs: 4, ts: 16, ry: PI / 2 }); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('brassPol', sx * 0.44, 0.04, sz * 0.23, 0.07, 0.07, 0.07, { r: 0.01 });
    for (const sx of [-1, 1]) k.box('ebony', sx * 0.42, 0, 0, 0.06, 0.04, 0.44);
    k.box('brassPol', 0, 0.38, 0.252, 0.08, 0.1, 0.01, { r: 0.006 }); k.plane('crest', 0, 0.26, 0.256, 0.16, 0.16, { keepUV: true });
    k.pop(); });
  mk('frame', k => { const [x, y, z] = SLOTS.frame.pos; k.push(x, y, z, SLOTS.frame.ry);
    k.plane('painting', 0, 0, 0.015, 0.82, 0.6, { keepUV: true });
    for (const [yy, w, h] of [[0.32, 0.98, 0.08], [-0.38, 0.98, 0.08]]) k.box('gilt', 0, yy, 0.02, w, h, 0.05, { r: 0.015 });
    for (const s of [-1, 1]) k.box('gilt', s * 0.45, -0.3, 0.02, 0.08, 0.6, 0.05, { r: 0.015 }); k.pop(); });
  mk('watch', k => { const [x, y, z] = SLOTS.watch.pos; k.cyl('brassPol', x, y, z, 0.025, 0.012, 24); k.cyl('dial', x, y + 0.012, z, 0.022, 0.001, 24, null, { keepUV: true }); k.tor('brassPol', x, y + 0.006, z - 0.03, 0.006, 0.0018, PI * 2, { rs: 4, ts: 10 });
    for (let i = 0; i < 18; i++) k.sph('brassPol', x + 0.02 + i * 0.012, y + 0.003, z - 0.035 - Math.sin(i * 0.4) * 0.03, 0.004, 0.003, 0.004, 5, 4); });
  mk('vase', k => { const [x, y, z] = SLOTS.vase.pos; k.lathe('sevres', x, y, z, [[0, 0], [0.06, 0], [0.07, 0.03], [0.1, 0.12], [0.08, 0.22], [0.04, 0.28], [0.05, 0.33], [0, 0.33]], 24);
    k.tor('gilt', x, y + 0.12, z, 0.1, 0.004, PI * 2, { rs: 4, ts: 24, rx: PI / 2 }); });
  return out;
}

/* ---------------- 总装 ---------------- */
/* ---------------- §313 补齐：躺椅、三折穿衣镜、衣帽架 ---------------- */
function chaise(k) {
  const x = -1.1, z = 2.45, L = 1.7, D = 0.62; k.push(x, 0, z, PI);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.cyl('walnut', sx * (L / 2 - 0.08), 0, sz * (D / 2 - 0.08), 0.02, 0.3, 10, 0.028); k.cyl('gilt', sx * (L / 2 - 0.08), 0, sz * (D / 2 - 0.08), 0.024, 0.035, 10); }
  k.box('walnut', 0, 0.26, 0, L, 0.08, D, { r: 0.02 });
  k.box('velvetGreen', 0, 0.33, 0, L - 0.04, 0.12, D - 0.04, { r: 0.05 });
  // 卷形高靠（一端）+ 半靠背
  k.cyl('velvetGreen', -L / 2 + 0.1, 0.38, 0, 0.13, D - 0.04, 24, null, { rx: PI / 2 }); k.box('velvetGreen', -L / 2 + 0.1, 0.38, 0, 0.2, 0.3, D - 0.04, { r: 0.06 });
  k.box('velvetGreen', -0.2, 0.42, -D / 2 + 0.08, L - 0.5, 0.36, 0.12, { r: 0.05, rx: -0.12 });
  k.tor('gilt', -L / 2 + 0.1, 0.51, D / 2 - 0.015, 0.12, 0.006, PI * 2, { rs: 4, ts: 24 });
  k.box('damask', 0.2, 0.46, 0.02, 0.36, 0.16, 0.3, { r: 0.06, ry: 0.3, rz: 0.2 }); // 靠枕
  k.box('shirtW', 0.55, 0.45, 0.05, 0.5, 0.02, 0.5, { r: 0.008, ry: -0.25 });   // 搭着的开司米披肩
  k.pop(); blob(k, x, 0.006, z, L + 0.3, D + 0.3);
}
function trifold(k) {
  const x = 3.35, z = 2.45; k.push(x, 0, z, -PI * 0.78);
  const pw = 0.4, ph = 1.5;
  [[-1, 0.5], [0, 0], [1, -0.5]].forEach(([i, a]) => { k.push(i * pw * 0.97, 0, 0, a);
    k.box('walnut', 0, 0.05, 0, pw, ph + 0.1, 0.035);
    k.box('mirror', 0, 0.1, 0.019, pw - 0.07, ph - 0.02, 0.004);
    k.box('gilt', 0, ph + 0.15, 0, pw + 0.02, 0.035, 0.045, { r: 0.012 });
    for (const sx of [-1, 1]) k.cyl('walnut', sx * (pw / 2 - 0.05), 0, 0.02, 0.018, 0.05, 8);
    k.pop(); });
  k.plane('crest', 0, ph + 0.28, 0.02, 0.2, 0.2, { keepUV: true });
  k.pop(); blob(k, x, 0.006, z, 1.3, 0.5, -PI * 0.78);
}
function coatStand(k) {
  const x = 0.95, z = 2.7; k.push(x, 0, z);
  k.lathe('walnut', 0, 0, 0, [[0, 0], [0.2, 0], [0.2, 0.03], [0.05, 0.08], [0.028, 0.2], [0.022, 1.7], [0.035, 1.76], [0.02, 1.84], [0, 1.86]], 16);
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; k.rod('brassPol', [0, 1.62, 0], [Math.cos(a) * 0.14, 1.72, Math.sin(a) * 0.14], 0.007); k.sph('brassPol', Math.cos(a) * 0.14, 1.72, Math.sin(a) * 0.14, 0.014, 0.014, 0.014, 8, 6); }
  // 挂着一顶软呢帽与一条围巾
  k.cyl('woolGrey', 0.13, 1.66, 0, 0.14, 0.012, 20, null, { rz: 0.3 }); k.cyl('woolGrey', 0.13, 1.67, 0, 0.08, 0.1, 20, 0.07, { rz: 0.3 });
  const sc = garment(0.9, [[0, 0.06, 0.012], [1, 0.08, 0.014]], { seed: 91, amp: 0.006, folds: 3, segA: 12, segY: 10 }); k.add('satinBurg', sc, M(-0.12, 1.7, 0.02, 0.4));
  k.pop(); blob(k, x, 0.006, z, 0.6, 0.6);
}
function blobs(k) {
  blob(k, 0, 0.007, 0.25, 2.9, 1.6);                                 // 中岛
  blob(k, ROOM.x0 + 0.55, 0.006, 0, 0.9, 1.7);                       // 梳妆台
  blob(k, ROOM.x0 + 0.85, 0.008, 0, 0.7, 0.7);                       // 圆凳
  blob(k, ROOM.x0 + 0.35, 0.006, -1.72, 0.7, 0.8);                   // 座钟
  blob(k, ROOM.x0 + 0.38, 0.006, 2.42, 0.8, 1.25);                   // 衣箱
  blob(k, 2.45, 0.006, -1.35, 1.6, 0.75);                            // 换鞋凳
  blob(k, 0, 0.006, ROOM.z0 + 0.3, 2.2, 1.0);                         // 窗座
  blob(k, ROOM.x1 - 0.25, 0.006, -0.3, 0.7, 4.8);                     // 包袋展柜
  blob(k, -2.45, 0.006, ROOM.z0 + 0.35, 3.2, 0.8); blob(k, 2.45, 0.006, ROOM.z0 + 0.35, 3.2, 0.8); // 柜墙根部
}

export function buildRoom() {
  const k = new Kit();
  shell(k); leftWall(k); hangingRun(k); shoeWall(k); windowBay(k); island(k); vanity(k); fullMirror(k); bagVitrine(k); bench(k); rug(k); chaise(k); trifold(k); coatStand(k); blobs(k);
  return k.build('room');
}

// 可点选 / 双击的区域（名称 + 包围盒中心），供视角预设与双击拉近
export const VIEWS = {
  overview: { zh: '总览', en: 'Overview', pos: [8.6, 7.6, 9.6], tgt: [0, 0.9, -0.1] },
  island:   { zh: '中岛', en: 'Island', pos: [2.5, 2.05, 2.75], tgt: [0.1, 0.8, 0.2] },
  hanging:  { zh: '挂衣区', en: 'Hanging', pos: [-1.75, 1.7, 0.95], tgt: [-2.35, 1.45, -2.6] },
  shoes:    { zh: '鞋墙', en: 'Shoes', pos: [2.1, 1.6, 0.9], tgt: [2.45, 1.45, -2.6] },
  mirror:   { zh: '镜前', en: 'Mirror', pos: [-0.7, 1.6, 1.9], tgt: [-3.9, 1.3, 0.35] },
};
