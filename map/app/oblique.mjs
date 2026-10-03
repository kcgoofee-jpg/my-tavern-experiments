// 斜视底图（maps.json 的 views 块，附录 OBLIQUE-CODE）：视图模式（斜视主视图 / 俯视开关）、相机文件加载与缓存、
// 地图米 ↔ 画幅归一化的投影、另一张斜视图的摆放矩形（公式 F）。全部数据驱动：时段映射、相机路径、外圈、
// 插图都来自 maps.json 的 views，引擎里没有层名。没有 views 的图行为不变（俯视，顶层 base / periods / insets 照旧）。
import { mapRegistry, currentMapId, currentMapData, depthData } from './state.mjs';
import { getJSON } from './json-cache.mjs';
import { projectOrtho, unprojectOrtho, placeRect as rectOf } from '../core/project.mjs';
import * as storage from '../core/storage.mjs';

export const TOP_KEY = 'edenMapTopView';   // 俯视开关（图层菜单；默认关 = 斜视主视图）
export const topOn = () => storage.flag(TOP_KEY);

// 视图解析：mode 显式给出时用它（俯视开关切换、校验用），否则按存储开关与 views.default。
// 返回 null = 这个模式没有视图（调用方退回俯视 / 顶层简写）。
export function viewOf(m, mode) {
  if (!m) return null;
  if (!m.views) return { base: m.base, periods: m.periods, insets: m.insets };   // 顶层字段 = views.top 的简写
  const want = mode || (topOn() ? 'top' : m.views.default || 'top');
  return m.views[want] || m.views.top || { base: m.base, periods: m.periods, insets: m.insets };
}
export const modeOf = (m, mode) => { const v = viewOf(m, mode); return v?.cam ? 'oblique' : 'top'; };   // 能投影才算斜视图
export const isOblique = (id = currentMapId) => modeOf(mapRegistry?.maps?.[id]) === 'oblique';
// 当前生效视图的时段表 / 底图（map-switch 换档、custom-tint 调色共用同一个来源）。
// 斜视图通常没有 base 字段：没有时段可用时退回该视图的 day 档，再退回俯视图的 base（最后才是旧的顶层 base）
export const periodsOf = m => viewOf(m)?.periods || m?.periods || null;
export const baseOf = m => {
  const v = viewOf(m);
  return v?.base || (v?.periods ? (v.periods.day || Object.values(v.periods)[0]) : undefined) || m?.views?.top?.base || m?.base;
};

// ---------------- 相机文件（data/cam/<名>.json）----------------
const cams = new Map();   // <地图 id, cam | null>；go() 打开斜视图时预取，标记 / 合成 / 外圈同步取用
export async function loadCam(id = currentMapId) {
  const m = mapRegistry?.maps?.[id], path = viewOf(m)?.cam;
  if (!path) return null;
  if (!cams.has(id)) cams.set(id, await getJSON(path));
  return cams.get(id);
}
export const camOf = (id = currentMapId) => cams.get(id) || null;
const insetCams = new Map();   // <相机路径, cam>：外圈 / 斜视插图自己的相机（与主图同朝向，画框不同）
export async function loadCamPath(path) {
  if (!insetCams.has(path)) insetCams.set(path, await getJSON(path));
  return insetCams.get(path);
}

// ---------------- 地图米（原点中心柱中心，x 东、y 北、z 海拔）----------------
export const metres = (nx, ny, m = mapRegistry?.maps?.[currentMapId]) => {
  const e = m?.view?.extent_m || [3000, 1875];
  return [(nx - 0.5) * e[0], (0.5 - ny) * e[1]];
};
export const normOf = (X, Y, m = mapRegistry?.maps?.[currentMapId]) => {
  const e = m?.view?.extent_m || [3000, 1875];
  return [X / e[0] + 0.5, 0.5 - Y / e[1]];
};
// 锚点海拔：标记 z_m 优先；上层按岛的 alt + anchor_dz_m（纵深数据）；否则本层 z_ref_m / 相机画框中心海拔。
// 岛命中按归一化轮廓（或椭圆）判断——人、事态等没有元数据的叠加点也落在正确的岛上。
const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inEllipse = (i, x, y) => { const c = Math.cos(i.rot || 0), s = Math.sin(i.rot || 0), dx = x - i.nx, dy = y - i.ny, ex = dx * c + dy * s, ey = -dx * s + dy * c; return (ex * ex) / (i.rx * i.rx) + (ey * ey) / (i.ry * i.ry) <= 1; };
export function zAt(nx, ny, meta) {
  if (Number.isFinite(meta?.z_m)) return meta.z_m;
  const isl = (currentMapData?.islands || []).find(i => Array.isArray(i.outline) && i.outline.length >= 8 ? inPoly(i.outline, nx, ny) : inEllipse(i, nx, ny));
  const alt = isl && (depthData?.islands?.[isl.id]?.alt ?? isl.alt_m);
  if (Number.isFinite(alt)) return alt + (depthData?.view?.anchor_dz_m || 0);
  const v = viewOf(mapRegistry?.maps?.[currentMapId]);
  return v?.z_ref_m ?? camOf()?.frame?.centre_m?.[2] ?? 0;
}
export const projectPt = (nx, ny, z, cam = camOf()) => { const [X, Y] = metres(nx, ny); return projectOrtho([X, Y, z], cam); };
export const unprojectPt = (u, v, z0, cam = camOf()) => { const [X, Y] = unprojectOrtho(u, v, cam, z0); return normOf(X, Y); };

// 公式 F：另一张斜视图（外圈、插图、上层视图下面的中层图）在本视图「底图宽 = 1、左上角为原点」世界里的摆放矩形。
export const rectFor = (camB, id = currentMapId) => { const camA = camOf(id); return camA && camB ? rectOf(camB, camA) : null; };

// 俯视开关的视野保持（附录 OBLIQUE-CODE E）：当前视野中心反算到地图米（z = z_ref / 所在岛的海拔），
// 在新视图里投影回去；缩放按「每屏幕像素多少米」不变 —— 世界单位宽 = 画框宽（斜视）或 extent 宽（俯视）。
// from / to 显式传（调用方在翻转存储开关之前先取旧值）；返回 fitIn 用的矩形（中心保持，宽按米换算）。
export function keepView(bounds, from, to) {
  const m = mapRegistry?.maps?.[currentMapId], cam = camOf();
  if (!m || !bounds || from === to || (to === 'oblique' && !cam)) return null;
  const asp = m.view?.extent_m ? m.view.extent_m[1] / m.view.extent_m[0] : 1;
  const c = bounds.getCenter(), u = c.x, v = c.y / asp;
  const vFrom = viewOf(m, from);
  const nxny = from === 'oblique' && cam ? unprojectPt(u, v, vFrom?.z_ref_m ?? cam.frame.centre_m[2], cam) : [u, v];
  const z0 = to === 'oblique' ? zAt(nxny[0], nxny[1]) : 0;
  const at = to === 'oblique' ? projectPt(nxny[0], nxny[1], z0, cam) : nxny;
  const mPer = mode => (mode === 'oblique' ? cam.frame.w_m : (m.view?.extent_m?.[0] || 3000));
  const w = bounds.width * (mPer(from) / mPer(to));
  return { x: at[0] - w / 2, y: at[1] * asp - w / 2, width: w, height: w };   // 高度由 fitIn 按容器比例整形，中心不变
}
