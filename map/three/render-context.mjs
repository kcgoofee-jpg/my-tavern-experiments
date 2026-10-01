// Part 3 §3：三维渲染上下文的共享工厂（主场景与通用三维页共用；全仓只有这里 new THREE.WebGLRenderer）。
// 收口三件事：像素比（手机 / 省流封顶）、上下文丢失与恢复（今天丢了就整个页面黑掉）、真正的拆（dispose + forceContextLoss）。
// 这里刻意不 import three：THREE 由调用方传进来（子页的 importmap 各自解析；本模块因此可以在 node 里直接测）。

export const TIERS = { low: { dpr: 1.25, antialias: false }, mid: { dpr: 2, antialias: true }, high: { dpr: 0, antialias: true } };   // dpr 0 = 不封顶，用满物理像素比

/** 像素比上限：档位封顶 × 画质设置（1 省电 = 1 倍，2 清晰 = 2 倍，其余按档位） */
export function pickDpr(tier = 'mid', quality = '', deviceDpr = 1) {
  const t = TIERS[tier] || TIERS.mid;
  let cap = t.dpr || deviceDpr || 2;
  if (quality === '1') cap = 1;                 // 设置「三维画质 · 省电」
  else if (quality === '2') cap = Math.min(2, cap || 2);
  return Math.max(1, Math.min(deviceDpr || 1, cap || 1));
}

/**
 * createRenderer({ THREE, canvas, tier, quality, alpha, powerPreference })
 * 返回 ctx：{ renderer, canvas, dpr, setSize(w,h), setDpr(dpr), isLost(), dispose(), stats() }
 * webglcontextlost：阻止默认行为（不阻止的话浏览器不会再给 restored），记状态并回调 onLost（调用方接现有的重试 UI）；
 * webglcontextrestored：回调 onRestored（调用方重排一帧）。
 */
export function createRenderer({ THREE, canvas, tier = 'mid', quality = '', alpha = false, powerPreference, onLost, onRestored } = {}) {
  if (!THREE || typeof THREE.WebGLRenderer !== 'function') throw new TypeError('three: 缺少 THREE.WebGLRenderer');
  const dpr0 = pickDpr(tier, quality, globalThis.devicePixelRatio || 1);
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: (TIERS[tier] || TIERS.mid).antialias,
    alpha, stencil: false,
    powerPreference: powerPreference || (tier === 'low' ? 'low-power' : 'high-performance'),
  });
  renderer.setPixelRatio(dpr0);
  const st = { lost: false, lostCount: 0, restoredCount: 0, dpr: dpr0 };
  const onL = e => { e.preventDefault?.(); st.lost = true; st.lostCount++; try { onLost?.(); } catch (x) {} };
  const onR = () => { st.lost = false; st.restoredCount++; try { onRestored?.(); } catch (x) {} };
  canvas?.addEventListener?.('webglcontextlost', onL, false);
  canvas?.addEventListener?.('webglcontextrestored', onR, false);
  const ctx = {
    renderer, canvas, tier,
    get dpr() { return st.dpr; },
    get lost() { return st.lost; },
    setSize(w, h) { if (w > 0 && h > 0) renderer.setSize(w, h, false); return ctx; },
    /** 改像素比（自适应 / 设置切换）：只动 pixelRatio，不重分配画布 */
    setDpr(dpr) {
      const v = Math.max(1, Math.min(dpr || 1, dpr0));
      if (Math.abs(v - st.dpr) < 0.01) return st.dpr;
      st.dpr = v; renderer.setPixelRatio(v);
      return v;
    },
    isLost() { return st.lost || renderer.getContext?.()?.isContextLost?.() === true; },
    /** 真拆：渲染器 + 上下文（页面卸载 / 面板休眠时一定要调，上下文是稀缺资源） */
    dispose() {
      try { canvas?.removeEventListener?.('webglcontextlost', onL); } catch (e) {}
      try { canvas?.removeEventListener?.('webglcontextrestored', onR); } catch (e) {}
      try { renderer.dispose(); } catch (e) {}
      try { renderer.forceContextLoss?.(); } catch (e) {}
      return true;
    },
    stats() { return { ...st, dpr0, tier }; },
  };
  return ctx;
}

/**
 * 自适应像素比：连续烂帧（>55 ms）就把像素比降一档（×0.7，下限 1），缓过来不自动回升
 * ——回升要用户在「三维画质」里改，避免来回震荡。只有在真渲染的帧采样才准（待机帧不算）。
 */
export function governor({ minDpr = 1, window: win = 14, badMs = 55, holdMs = 2500 } = {}) {
  let samples = [], hold = 0;
  return {
    /** 每帧真渲染后调用；返回新的像素比（没变返回 null），由调用方 renderer.setPixelRatio + setSize */
    sample(dt, now, curDpr) {
      if (now < hold) return null;
      samples.push(dt); if (samples.length > win) samples.shift();
      if (samples.length < win || !samples.every(x => x > badMs)) return null;
      samples = []; hold = now + holdMs;
      const next = Math.max(minDpr, Math.round(curDpr * 7) / 10);
      return next < curDpr - 0.01 ? next : null;
    },
    reset() { samples = []; hold = 0; },
  };
}
