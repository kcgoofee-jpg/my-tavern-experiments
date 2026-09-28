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

export function labelRule(ratio, occ = {}) {
  if (ratio <= 0 && (occ.dot_when_hidden ?? true)) return 'dot';
  if (ratio < (occ.hide_ratio ?? 0.4) && (occ.lift_label ?? true)) return 'lift';
  return 'normal';
}

export const anchorOf = (isl, alt, dz = 20) => [isl.x * 100, isl.y * 100, alt + dz];
