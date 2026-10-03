// 局部高清插图（maps.json 各图的 insets）：底图为了兼顾全局大小只能到某个分辨率，放大到插图覆盖的小范围时
// 叠一张单独渲染的高分辨率瓦片图；缩出去或还没放大到那儿就把它摘掉，省流量。
// 通用实现：任何图只要加一条 insets 就自动生效（新月湾、别的地方以后同样加法）。
// 俯视 insets（views.top / 顶层简写）：bounds [x0,y0,x1,y1]（归一化）；斜视 insets（views.oblique，附录 OBLIQUE-CODE A）：
// periods 按时段给图、cam 给自己的相机文件，摆放由公式 F 算（与主图同朝向、像素级对齐），没有 bounds。
import { mapRegistry, aspect, currentMapId, osdViewer } from './state.mjs';
import { periodNow } from './period-now.mjs';
import { pickPeriod } from '../core/period-pick.mjs';
import { viewOf, rectFor, loadCamPath } from './oblique.mjs';
// 插图启用阈值：底图「屏幕像素 / 源像素」到 ≈1 就换成插图（早于 locate.mjs 里 1.5 的硬顶，衔接自然，不会先糊一下再变清楚）
export const ACTIVATE_PX = 1;
const items = new Map();   // inset.id -> { it?: OpenSeadragon.TiledImage, loading?: bool }
const insetsOf = m => viewOf(m)?.insets || m?.insets || [];
// 底图当前的「屏幕像素 / 源像素」比：与 locate.mjs 的 pw 同一个公式（1 / pw = 该比例的倒数关系，这里直接算比例本身）
export function basePxRatio() {
  const it = osdViewer?.world.getItemAt(0); if (!it) return 0;
  const z = osdViewer.viewport.getZoom(true), cs = osdViewer.viewport.getContainerSize();
  return cs.x * z / it.getContentSize().x;
}
const centerIn = b => { const c = osdViewer.viewport.getCenter(true); return c.x >= b[0] && c.x <= b[2] && c.y / aspect >= b[1] && c.y / aspect <= b[3]; };
// A1（FOG-1）：俯视插图目前只有白天一版 —— 时段不是白天就先不叠，免得放大进去夜里跳回白天。
// 斜视插图书自己的 periods 四档（批 1），随时段走，不受这条限制。
const isObliqueInset = ins => !!ins?.cam;
export const insetAllowed = ins => { const p = periodNow(); return !p || p === 'day' || isObliqueInset(ins); };
// 当前视野命中的插图（供 locate.mjs 的清晰度上限、到顶提示复用）
export function activeInset() {
  const m = mapRegistry.maps[currentMapId]; if (!m || m.kind === 'estate') return null;
  for (const ins of insetsOf(m)) { if (!insetAllowed(ins)) continue;
    const b = insBounds(ins); if (b && centerIn(b)) return ins; }
  return null;
}
// 插图在底图上的范围：俯视用数据里的 bounds；斜视由相机摆放矩形算出（cam 没到时返回 null，下一轮再判）
const obRects = new Map();   // inset.id -> { x, y, width, height } | null（加载失败不再重试）
function insBounds(ins) {
  if (!isObliqueInset(ins)) return ins.bounds;
  const r = obRects.get(ins.id);
  return r ? [r.x, r.y, r.x + r.width, r.y + r.height] : null;
}
function loadObRect(ins) {
  if (obRects.has(ins.id)) return;
  obRects.set(ins.id, null);
  loadCamPath(ins.cam).then(cb => { if (!cb) return; const r = rectFor(cb); obRects.set(ins.id, r ? { ...r, px: cb.frame.px[0] } : null); if (r) updateInsets(); });
}
// 插图的清晰度（locate.mjs 的放大上限用）：[源像素宽, 覆盖的底图宽度分数]；斜视插图由相机画框给，俯视 inset 自带
export function insetPx(ins) {
  if (!ins) return null;
  if (isObliqueInset(ins)) { const r = obRects.get(ins.id); return r ? [r.px, r.width] : null; }
  return [ins.res_px[0], ins.bounds[2] - ins.bounds[0]];
}
function ensure(ins) {
  if (items.has(ins.id)) return;
  const rec = {}; items.set(ins.id, rec);
  const src = isObliqueInset(ins) ? pickPeriod(ins.periods, periodNow()).src || ins.periods.day || Object.values(ins.periods || {})[0] : ins.base;   // 没时钟时段 = day 档
  if (!src) { items.delete(ins.id); return; }
  if (isObliqueInset(ins)) { const r = obRects.get(ins.id); if (!r) { items.delete(ins.id); return; }
    osdViewer.addTiledImage({ tileSource: src, x: r.x, y: r.y, width: r.width,   // 高度由图自己的纵横比给出（OSD 不收 width+height）
      success: e => { rec.it = e.item; }, error: () => { items.delete(ins.id); } });
    return; }
  const [x0, y0, x1, y1] = ins.bounds;
  osdViewer.addTiledImage({ tileSource: src, x: x0, y: y0 * aspect, width: x1 - x0, height: (y1 - y0) * aspect,
    success: e => { rec.it = e.item; }, error: () => { items.delete(ins.id); } });
}
function drop(id) { const rec = items.get(id); items.delete(id); if (rec?.it) try { osdViewer.world.removeItem(rec.it); } catch (e) {} }
// 打开 / 切换到新地图时调用：旧世界已经整个被 viewer.open() 换掉了，插图记录直接清空（不再 removeItem，物件已经不在了）
export function resetInsets() { items.clear(); obRects.clear(); }
// 每次视野变化（放大、缩小、平移）调用：命中范围且够放大 → 补上；不满足 → 摘掉
export function updateInsets() {
  if (!osdViewer?.world.getItemCount()) return;
  const m = mapRegistry.maps[currentMapId], want = new Set();
  if (m && m.kind !== 'estate') { const ratio = basePxRatio();
    for (const ins of insetsOf(m)) {
      if (isObliqueInset(ins) && !obRects.has(ins.id)) loadObRect(ins);   // 相机文件先到，矩形才有
      if (!insetAllowed(ins)) continue;
      const b = insBounds(ins);
      if (b && ratio >= ACTIVATE_PX && centerIn(b)) { want.add(ins.id); ensure(ins); } } }
  for (const id of [...items.keys()]) if (!want.has(id)) drop(id);
}
