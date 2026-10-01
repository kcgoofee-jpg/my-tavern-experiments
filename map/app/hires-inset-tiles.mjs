// 局部高清插图（伊甸庄园等，maps.json 里各图的 insets[]）：底图为了兼顾全局大小只能到某个分辨率，
// 放大到插图覆盖的小范围时叠一张单独渲染的高分辨率瓦片图；缩出去或还没放大到那儿就把它摘掉，省流量。
// 通用实现：任何图只要在 maps.json 里加一条 insets，就自动生效（新月湾、罗斯柴尔德以后同样加法）。
import { mapRegistry, aspect, currentMapId, osdViewer } from './state.mjs';
// 插图启用阈值：底图「屏幕像素 / 源像素」到 ≈1 就换成插图（早于 locate.mjs 里 1.5 的硬顶，衔接自然，不会先糊一下再变清楚）
export const ACTIVATE_PX = 1;
const items = new Map();   // inset.id -> { it?: OpenSeadragon.TiledImage, loading?: bool }
const insetsOf = m => (m && m.insets) || [];
// 底图当前的「屏幕像素 / 源像素」比：与 locate.mjs 的 pw 同一个公式（1 / pw = 该比例的倒数关系，这里直接算比例本身）
export function basePxRatio() {
  const it = osdViewer?.world.getItemAt(0); if (!it) return 0;
  const z = osdViewer.viewport.getZoom(true), cs = osdViewer.viewport.getContainerSize();
  return cs.x * z / it.getContentSize().x;
}
const centerIn = b => { const c = osdViewer.viewport.getCenter(true); return c.x >= b[0] && c.x <= b[2] && c.y / aspect >= b[1] && c.y / aspect <= b[3]; };
// 当前视野命中的插图（供 locate.mjs 的清晰度上限、到顶提示复用）
export function activeInset() {
  const m = mapRegistry.maps[currentMapId]; if (!m || m.kind === 'estate') return null;
  for (const ins of insetsOf(m)) if (centerIn(ins.bounds)) return ins;
  return null;
}
function ensure(ins) {
  if (items.has(ins.id)) return;
  const rec = {}; items.set(ins.id, rec);
  const [x0, y0, x1, y1] = ins.bounds;
  osdViewer.addTiledImage({ tileSource: ins.base, x: x0, y: y0 * aspect, width: x1 - x0, height: (y1 - y0) * aspect,
    success: e => { rec.it = e.item; }, error: () => { items.delete(ins.id); } });
}
function drop(id) { const rec = items.get(id); items.delete(id); if (rec?.it) try { osdViewer.world.removeItem(rec.it); } catch (e) {} }
// 打开 / 切换到新地图时调用：旧世界已经整个被 viewer.open() 换掉了，插图记录直接清空（不再 removeItem，物件已经不在了）
export function resetInsets() { items.clear(); }
// 每次视野变化（放大、缩小、平移）调用：命中范围且够放大 → 补上；不满足 → 摘掉
export function updateInsets() {
  if (!osdViewer?.world.getItemCount()) return;
  const m = mapRegistry.maps[currentMapId], want = new Set();
  if (m && m.kind !== 'estate') { const ratio = basePxRatio();
    for (const ins of insetsOf(m)) if (ratio >= ACTIVATE_PX && centerIn(ins.bounds)) { want.add(ins.id); ensure(ins); } }
  for (const id of [...items.keys()]) if (!want.has(id)) drop(id);
}
