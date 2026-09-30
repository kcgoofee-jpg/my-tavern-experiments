// ListenerBus（P2 解耦 / P7 泄漏审计）：全局监听器（window / document / message / storage…）的唯一登记处。
// 以前每个 UI 模块自己 addEventListener、自己记得摘——漏一个就是长会话里慢慢长大的泄漏（Part 1.4 排查项）。
// 现在统一按「键」登记：同一个键重复登记先摘旧的（幂等，模块重复求值不会叠监听），
// offAll() 一把摘干净（查看器卸载 / 单测收尾），describe() 出账给自检与探针看。
//
// 纯核心：目标对象由调用方注入（不碰 window / document / 酒馆全局，机检见 tools/check_architecture.py）；
// 目标没有 addEventListener 就安静跳过（裸 node / 桩环境不是错误）。

/** 登记项：{ key, type, fn, target?, opts? }。target 缺省用总线建时注入的那个。 */
export function createListenerBus(defaultTarget = null) {
  const recs = new Map();
  const usable = t => !!(t && typeof t.addEventListener === 'function');
  const add = (target, type, fn, opts) => { try { target.addEventListener(type, fn, opts); return true; } catch (e) { return false; } };
  const del = (target, type, fn, opts) => { try { target.removeEventListener(type, fn, opts); } catch (e) {} };

  return {
    /** on({ key, type, fn, target?, opts? }) 或 on(key, type, fn, opts?)：同键先摘旧的，返回是否真的挂上 */
    on(a, b, c, d) {
      const o = (a && typeof a === 'object') ? a : { key: a, type: b, fn: c, opts: d };
      if (typeof o.key !== 'string' || !o.key) throw new TypeError('listeners: 键必须是非空字符串');
      if (typeof o.type !== 'string' || !o.type) throw new TypeError('listeners: 事件名必须是非空字符串');
      if (typeof o.fn !== 'function') throw new TypeError('listeners: 处理函数必须是函数');
      const target = o.target || defaultTarget;
      if (!usable(target)) return false;
      if (recs.has(o.key)) this.off(o.key);   // 幂等：重复登记先摘旧的（模块被重复求值时不会叠成两个）
      const rec = { key: o.key, type: o.type, fn: o.fn, target, opts: o.opts };
      if (!add(target, o.type, o.fn, o.opts)) return false;
      recs.set(o.key, rec);
      return true;
    },
    /** 按登记时的键摘掉一个；没挂过返回 false */
    off(key) {
      const r = recs.get(key); if (!r) return false;
      recs.delete(key); del(r.target, r.type, r.fn, r.opts); return true;
    },
    /** 一次挂多个（[{ key, type, fn, ... }]），返回成功数；单个失败不挡后面的 */
    onAll(list) { let n = 0; for (const o of list || []) { try { if (this.on(o)) n++; } catch (e) {} } return n; },
    /** 全部摘掉（卸载 / 收尾）：返回摘掉的个数 */
    offAll() { const keys = [...recs.keys()]; for (const k of keys) this.off(k); return keys.length; },
    has: key => recs.has(key),
    keys: () => [...recs.keys()],
    get size() { return recs.size; },
    /** 自检 / 探针台账：{ count, byType, targets }——泄漏排查先看这里有没有只增不减的键 */
    describe() {
      const byType = {}, targets = new Set();
      for (const r of recs.values()) { byType[r.type] = (byType[r.type] || 0) + 1; targets.add(r.target === defaultTarget ? 'default' : 'custom'); }
      return { count: recs.size, byType, targets: [...targets] };
    },
  };
}
