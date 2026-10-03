// 斜视投影（JS 版）。与 blender/project.py 同一规格；tests/fixtures/project_golden.json 对拍。纯函数，不碰 DOM。
// 相机 dict 来自成图 meta.json 的 camera（渲染时由 project.py fit_camera 求出，唯一来源）。世界坐标米：(x·100, y·100, alt)。
//   project(p, cam)            → [u, v, depth]（画幅归一化，左上原点）
//   labelRule(ratio, occ)      → 'normal' | 'lift' | 'dot'（view.occlusion）
//   anchorOf(isl, alt, dz)     → 岛锚点（米）：岛表 x / y（100 m）+ 纵深 alt + anchor_dz_m
const r4 = x => Math.floor(x * 1e4 + 0.5) / 1e4;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function project(p, cam) {
  const d = [0, 1, 2].map(i => p[i] - cam.pos[i]);
  const z = dot(d, cam.fwd), k = cam.lens_mm / cam.sensor_mm / Math.max(z, 1e-6);
  return [r4(0.5 + dot(d, cam.right) * k), r4(0.5 - dot(d, cam.up) * k * cam.aspect), r4(z)];
}

// ---------------- 正交（ortho）相机：地图米 → 画幅归一化（附录 OBLIQUE-CODE B）----------------
// 相机文件（map/data/cam/<名>.json，渲染 meta 生成）：{ right, up, fwd, frame: { centre_m, w_m, h_m, px } }。
//   p 为地图米（原点中心柱中心，x 东、y 北、z 海拔）：u = 0.5 + dot(p − c, right) / w_m，v = 0.5 − dot(p − c, up) / h_m。
export function projectOrtho(p, cam) {
  const c = cam.frame.centre_m, d = [0, 1, 2].map(i => p[i] - c[i]);
  return [r4(0.5 + dot(d, cam.right) / cam.frame.w_m), r4(0.5 - dot(d, cam.up) / cam.frame.h_m)];
}
// 反算（点击、编辑放置、视野换算）：画幅点 (u, v) 与平面 z = z0 求交；正交下视线方向恒为 fwd，闭式解。
export function unprojectOrtho(u, v, cam, z0) {
  const c = cam.frame.centre_m;
  const q = [0, 1, 2].map(i => c[i] + (u - 0.5) * cam.frame.w_m * cam.right[i] - (v - 0.5) * cam.frame.h_m * cam.up[i]);
  const t = (z0 - q[2]) / cam.fwd[2];
  return [r4(q[0] + t * cam.fwd[0]), r4(q[1] + t * cam.fwd[1])];
}
// 等价的 2×4 仿射矩阵 A：[u, v]ᵀ = A · [X, Y, Z, 1]ᵀ（加载时算一次缓存，逐点投影一致由单测钉住）。
export function affineOf(cam) {
  const c = cam.frame.centre_m, kw = 1 / cam.frame.w_m, kh = -1 / cam.frame.h_m;
  return [
    [cam.right[0] * kw, cam.right[1] * kw, cam.right[2] * kw, 0.5 - dot(c, cam.right) * kw],
    [cam.up[0] * kh, cam.up[1] * kh, cam.up[2] * kh, 0.5 - dot(c, cam.up) * kh],
  ];
}
// 公式 F（附录 OBLIQUE-CODE F）：同一朝向、同米/像素的两张斜视图只差平移——B 的画框在 A 的
// 「A 宽 = 1、A 左上角为原点」世界坐标里的摆放矩形（OpenSeadragon addTiledImage 的 x / y / width / height）。
export function placeRect(camB, camA) {
  const cA = camA.frame.centre_m, cB = camB.frame.centre_m, d = [0, 1, 2].map(i => cB[i] - cA[i]);
  const wA = camA.frame.w_m, hA = camA.frame.h_m;
  const x = 0.5 + dot(d, camA.right) / wA - camB.frame.w_m / (2 * wA);
  const y = hA / (2 * wA) - dot(d, camA.up) / wA - camB.frame.h_m / (2 * wA);
  return { x: r4(x), y: r4(y), width: r4(camB.frame.w_m / wA), height: r4(camB.frame.h_m / wA) };
}

export function labelRule(ratio, occ = {}) {
  if (ratio <= 0 && (occ.dot_when_hidden ?? true)) return 'dot';
  if (ratio < (occ.hide_ratio ?? 0.4) && (occ.lift_label ?? true)) return 'lift';
  return 'normal';
}

export const anchorOf = (isl, alt, dz = 20) => [isl.x * 100, isl.y * 100, alt + dz];
