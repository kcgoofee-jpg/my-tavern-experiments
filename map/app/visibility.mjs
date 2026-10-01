// 视口可见性渲染节流（P7-4）：面板关掉 / 标签页切走 / 查看器滚出视口时，把渲染循环按下暂停位，
// 切回来再放开——CPU 归零，而不是让 rAF 在后台空转。
//
// 分两层，测试只需要下面那一层：
//   createPauseSwitch()  纯状态机：按「原因」记挂起（引用计数，多个原因同时存在也算暂停），
//                        暂停 / 恢复的翻转才通知订阅者。node 里直接喂数据（tests/visibility.test.mjs）。
//   installVisibilityGuard()  DOM 接线：Page Visibility（visibilitychange / pagehide / pageshow）
//                        与 IntersectionObserver（查看器滚出容器）→ 各自的挂起原因。
//                        环境里没有对应 API 就安静跳过（旧 WebKit / iframe 里都不是错误）。
// 谁被暂停由调用方决定（effects）——本模块只知道「现在该不该跑」。

/** 挂起原因：page = 标签页 / 窗口不可见；viewport = 元素滚出视口；manual = 面板自己按下的（关闭中）；panel / covered：见下 */
export const REASONS = ['page', 'viewport', 'manual', 'panel', 'covered', 'rm'];   // panel = the host says the tavern panel is closed / docked / scrolled out (eden-map:visible); covered = a 3D view is open over the map

export function createPauseSwitch({ onChange } = {}) {
  const on = new Set(), subs = new Set();
  const paused = () => on.size > 0;
  const notify = reason => { for (const f of [...subs]) { try { f(paused(), reason); } catch (e) {} } };
  return {
    /** set(reason, v)：置位 / 清位。只在暂停状态真的翻转时通知（订阅者不必自己去重） */
    set(reason, v) {
      if (!REASONS.includes(reason)) throw new Error(`visibility: 未知挂起原因 ${reason}`);
      const was = paused();
      if (v) on.add(reason); else on.delete(reason);
      if (paused() !== was) { notify(reason); try { onChange?.(paused(), reason); } catch (e) {} }
      return paused();
    },
    isPaused: paused,
    reasons: () => [...on],
    /** subscribe(fn) → 退订函数；订阅时立刻回调一次当前状态（迟到的一方也能对齐） */
    subscribe(fn) {
      if (typeof fn === 'function') subs.add(fn);
      try { fn(paused(), null); } catch (e) {}
      return () => subs.delete(fn);
    },
  };
}

/** DOM 接线 → 返回 uninstall（测试 / 休眠卸载用）。doc / win 可注入，默认取浏览器全局。 */
export function installVisibilityGuard(guard, { doc, win, target } = {}) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!d || !guard) return () => {};
  const offs = [];
  const sync = () => guard.set('page', d.visibilityState === 'hidden' || d.hidden === true);
  sync();
  d.addEventListener('visibilitychange', sync); offs.push(() => d.removeEventListener('visibilitychange', sync));
  // iOS WebKit 只发 pagehide / pageshow（不发 visibilitychange）：切后台 / 回前台靠这对（TT 实测）
  const hide = () => guard.set('page', true), show = () => guard.set('page', false);
  if (w) {
    w.addEventListener('pagehide', hide); w.addEventListener('pageshow', show);
    offs.push(() => { w.removeEventListener('pagehide', hide); w.removeEventListener('pageshow', show); });
  }
  // 减少动态效果（系统设置或设置「显示 · 减少动态」→ html.rm）：所有动画图层的循环停下（S7-2，docs/ui-refactor.md 6）
  if (w?.matchMedia) {
    const mq = w.matchMedia('(prefers-reduced-motion: reduce)'), rm = () => guard.set('rm', mq.matches || d.documentElement?.classList.contains('rm'));
    rm(); mq.addEventListener?.('change', rm); offs.push(() => mq.removeEventListener?.('change', rm));
    if (typeof MutationObserver === 'function' && d.documentElement) { const mo = new MutationObserver(rm); mo.observe(d.documentElement, { attributes: true, attributeFilter: ['class'] }); offs.push(() => mo.disconnect()); }
  }
  // 元素滚出视口（宿主页里面板被别的卡片盖住 / 查看器 iframe 被滚走）
  if (target && typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(es => { for (const e of es) guard.set('viewport', !e.isIntersecting); }, { threshold: 0 });
    io.observe(target); offs.push(() => io.disconnect());
  }
  return () => { for (const f of offs) { try { f(); } catch (e) {} } };
}

// ---------------- 查看器侧单例装配 ----------------
export const visibilityGuard = createPauseSwitch();

/** 接线：Page Visibility + 视口观察 → effects.onPause / effects.onResume（挂什么由调用方定）。
 *  返回 uninstall。重复调用只装一次（第二次直接返回上一次的卸载函数）。 */
let _uninstall = null;
export function initVisibilityGuard({ target, effects } = {}) {
  if (_uninstall) return _uninstall;
  const { onPause, onResume } = effects || {};
  visibilityGuard.subscribe((paused, reason) => {
    try { paused ? onPause?.(reason) : onResume?.(reason); } catch (e) {}
  });
  _uninstall = installVisibilityGuard(visibilityGuard, { target });
  return _uninstall;
}
