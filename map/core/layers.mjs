// LayerRegistry（P3-C，docs/reviews/architecture_and_stream_perf.md §6）：视口内图层槽位的纯核心契约。
// 槽位由底至顶固定为 SLOTS（数据契约，不是代码顺序）；外层固定 UI（顶栏 / 弹层 / 设置 / 控制列）走自己的阶梯，
// 不在本注册中心的管辖内。查看器侧装配（槽位挂载容器、菜单渲染）在 app/layerhost.mjs；本模块不碰 DOM / 存储 / 网络
// （tests/layer_registry.test.mjs 机检），只管：槽位层级、图层注册与排序、可见性、滤镜链与标准摘要。
// 槽位 z 值 = (槽位序号 + 1) × Z_STEP（OSD 画布叠加上下文内使用；viewer.html 的 --zv-* 自定义属性是同一份值的 CSS 镜像，测试对拍）。
export const SLOTS = ['base', 'depth-haze', 'fog', 'routes', 'trips', 'events', 'markers', 'labels', 'fx', 'interaction'];
export const Z_STEP = 10;
export const KINDS = ['dom', 'canvas', 'osd'];
const slotIdx = slot => SLOTS.indexOf(slot);
export function slotZ(slot) { const i = slotIdx(slot); if (i < 0) throw new Error(`layers: 未知槽位 ${slot}`); return (i + 1) * Z_STEP; }
const FILTER_TYPES = ['css', 'canvas'];
const normChain = chain => {
  if (!Array.isArray(chain)) throw new TypeError('layers: 滤镜链必须是数组');
  return chain.map(f => {
    if (!f || typeof f !== 'object' || !FILTER_TYPES.includes(f.type) || typeof f.value !== 'string')
      throw new TypeError('layers: 滤镜项必须是 { type: css | canvas, value: string }');
    return { type: f.type, value: f.value };
  });
};
/** css 型滤镜链 → style.filter 值（空链 = ''，即不设滤镜） */
export const cssFilter = chain => normChain(chain).filter(f => f.type === 'css').map(f => f.value).join(' ');
/** canvas 型滤镜链 → CanvasRenderingContext2D.filter 值 */
export const canvasFilter = chain => normChain(chain).filter(f => f.type === 'canvas').map(f => f.value).join(' ');
const V = id => { if (typeof id !== 'string' || !id) throw new TypeError('layers: 图层 id 必须是非空字符串'); return id; };
export class LayerRegistry {
  constructor() { this._byId = new Map(); this._seq = 0; this._listeners = []; }
  /** register(descriptor)：{ id, slot, kind, order?, menu?, mount?, unmount?, setVisible?, initialVisible? }；重复 id / 未知槽位 / 未知 kind 拦下 */
  register(d) {
    if (!d || typeof d !== 'object') throw new TypeError('layers: 描述符必须是对象');
    const id = V(d.id);
    if (this._byId.has(id)) throw new Error(`layers: 图层 ${id} 重复注册`);
    if (slotIdx(d.slot) < 0) throw new Error(`layers: ${id} 的槽位 ${d.slot} 不在 SLOTS`);
    if (!KINDS.includes(d.kind)) throw new Error(`layers: ${id} 的 kind 必须是 ${KINDS.join(' | ')}`);
    const o = d.order != null ? d.order : 0;
    if (typeof o !== 'number' || !Number.isFinite(o)) throw new TypeError(`layers: ${id} 的 order 必须是有限数值`);
    const rec = { ...d, id, order: o, visible: d.initialVisible == null ? true : !!d.initialVisible, seq: this._seq++ };
    this._byId.set(id, rec);
    for (const fn of [...this._listeners]) try { fn(id); } catch (e) {}
    return rec;
  }
  /** unregister(id)：先卸载再注销；没注册过返回 false */
  unregister(id) {
    const rec = this._byId.get(V(id)); if (!rec) return false;
    this._byId.delete(id);
    try { rec.unmount?.(); } catch (e) {}
    return true;
  }
  has(id) { return this._byId.has(id); }
  get(id) { return this._byId.get(id) || null; }
  /** 注册即排序：槽位序 → order 微调 → 注册先后（稳定，不依赖实现细节） */
  ordered() { return [...this._byId.values()].sort((a, b) => slotIdx(a.slot) - slotIdx(b.slot) || a.order - b.order || a.seq - b.seq); }
  layersInSlot(slot) { if (slotIdx(slot) < 0) throw new Error(`layers: 未知槽位 ${slot}`); return this.ordered().filter(r => r.slot === slot); }
  /** 按注册顺序挂载（返回成功数；单层 mount 抛错只废自己，不挡其他层） */
  mountAll(ctx) {
    let n = 0;
    for (const rec of this.ordered()) { try { rec.mount?.(ctx); n++; } catch (e) {} }
    return n;
  }
  unmountAll() { for (const rec of this.ordered()) try { rec.unmount?.(); } catch (e) {} }
  onRegister(fn) { if (typeof fn === 'function') this._listeners.push(fn); }
  /** 可见性调度总入口：记录状态并转发给层的 setVisible（菜单 / 快捷键 / 设置页都汇到这里） */
  setVisible(id, v) {
    const rec = this._byId.get(V(id)); if (!rec) throw new Error(`layers: 未注册的图层 ${id}`);
    rec.visible = !!v;
    rec.setVisible?.(rec.visible);
    return rec.visible;
  }
  isVisible(id) { const rec = this._byId.get(V(id)); if (!rec) throw new Error(`layers: 未注册的图层 ${id}`); return rec.visible; }
  /** 滤镜链：存 + 校验，消费方按 kind 取 cssFilter / canvasFilter 应用到层根 */
  setFilters(id, chain) { const rec = this._byId.get(V(id)); if (!rec) throw new Error(`layers: 未注册的图层 ${id}`); rec.filters = normChain(chain); return rec.filters; }
  filters(id) { return [...(this._byId.get(V(id))?.filters || [])]; }
  /** 菜单行（#layList 数据驱动）：按 menu.order → 注册先后排；没带 menu 的层不进菜单 */
  menuRows() { return this.ordered().filter(r => r.menu).sort((a, b) => ((a.menu.order ?? 0) - (b.menu.order ?? 0)) || a.seq - b.seq); }
  /** 标准摘要（上下文预算用）：slots = 槽位与各槽图层（由底至顶）、activeLayers = 可见图层 id、filterSummary = 非空滤镜链 */
  describe() {
    const slots = SLOTS.map(s => ({ id: s, layers: this.layersInSlot(s).map(r => r.id) }));
    const activeLayers = this.ordered().filter(r => r.visible).map(r => r.id);
    const filterSummary = this.ordered().filter(r => r.filters?.length).map(r => ({ id: r.id, slot: r.slot, filters: this.filters(r.id) }));
    return { slots, activeLayers, filterSummary };
  }
}
