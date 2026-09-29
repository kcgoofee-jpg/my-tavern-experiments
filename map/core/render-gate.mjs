// RenderGate（Part 7-4 视口可见性渲染节流，2026-09-30）：页面切到后台 / 视口不可见时，三维页的按需渲染循环
// 也要整个停下来——rAF 在隐藏标签页本来就被浏览器钳制，但 macOS WKWebView 的嵌入式 WebView 不保证钳制，
// 实测后台 CPU 仍有占用（docs/reviews/architecture_and_stream_perf.md §1.4 G2 同源问题）。纯核心状态机：
// 不碰 DOM / 全局——调用方把宿主 document（或测试桩）递给 wireVisibility，把「恢复」要做的排帧动作放 onResume。
// 消费方：map/estate/main.js、map/props/viewer3d.html（渲染循环）、map/app/fps.mjs（读数循环）。
// node 单测直接喂桩（tests/render_gate.test.mjs）。

/**
 * createRenderGate({ now?, onResume?, onPause? }):
 *   setHidden(v)  → 幂等切换；true 时记起点并调 onPause，恢复时累计隐藏时长并调 onResume（排帧动作由调用方做）
 *   hidden / pausedMs / pauses：只读状态；pausedMs 含正在进行的这段隐藏时长
 *   state() → { hidden, pausedMs, pauses }（测试与自检快照用）
 */
export function createRenderGate({ now = () => performance.now(), onResume, onPause } = {}) {
  let hidden = false, since = 0, totalMs = 0, pauses = 0;
  const gate = {
    get hidden() { return hidden; },
    get pausedMs() { return totalMs + (hidden ? Math.max(0, now() - since) : 0); },
    get pauses() { return pauses; },
    setHidden(v) {
      v = !!v;
      if (v !== hidden) {
        hidden = v;
        if (hidden) { since = now(); pauses++; try { onPause?.(); } catch (e) {} }
        else { totalMs += Math.max(0, now() - since); try { onResume?.(); } catch (e) {} }
      }
      return gate.state();
    },
    state() { return { hidden, pausedMs: gate.pausedMs, pauses }; },
  };
  return gate;
}

/** 把可见性来源（document，或测试桩：{ hidden, addEventListener, removeEventListener }）接到 gate。
 *  挂上即同步一次（页面以隐藏态启动时不漏暂停）；返回撤销函数。目标不是事件源（无 addEventListener）时返回空撤销。 */
export function wireVisibility(gate, target) {
  if (!gate || typeof gate.setHidden !== 'function') return () => {};
  if (!target || typeof target.addEventListener !== 'function') return () => {};
  const on = () => gate.setHidden(target.hidden === true);
  target.addEventListener('visibilitychange', on);
  on();
  return () => { try { target.removeEventListener('visibilitychange', on); } catch (e) {} };
}
