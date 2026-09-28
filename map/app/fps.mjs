// 调试：显示帧率（U，2026-09-28）——2D 地图角落的小 FPS 读数；设置项 edenMapFps 存在但此前从未真正显示，见 bug 报告。
// 三维视图（estate iframe / props viewer）各自有自己的 rAF 循环，用 postMessage 'estate:fps' 开关，读数在子页里画（见 map/estate/main.js、map/props/viewer3d.html）。
let el = null, raf = 0, frames = 0, last = 0, acc = 0;

function ensureEl() {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'fpsMeter';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed', top: 'calc(var(--bar-h, 44px) + 6px)', left: '50%', transform: 'translateX(-50%)', zIndex: 99999,   // fix3：以前在左上角压住「上一级」按钮；改到顶栏下方正中（署名 ⓘ 在左上、控制列在右）
    font: '11px/1.4 monospace', color: '#0f0', background: 'rgba(0,0,0,.55)',
    padding: '1px 5px', borderRadius: '3px', pointerEvents: 'none', letterSpacing: '.02em',
  });
  document.body.appendChild(el);
  return el;
}

function tick(ts) {
  if (!last) last = ts;
  frames++; acc += ts - last; last = ts;
  if (acc >= 500) { ensureEl().textContent = `${Math.round(frames * 1000 / acc)} fps`; frames = 0; acc = 0; }
  raf = requestAnimationFrame(tick);
}

export function setFpsMeter(on) {
  if (on) {
    ensureEl().style.display = '';
    if (!raf) { frames = 0; last = 0; acc = 0; raf = requestAnimationFrame(tick); }
  } else {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (el) el.style.display = 'none';
  }
}

export function initFpsMeter() {
  let on = false;
  try { on = window.TCStore?.get('edenMapFps') === '1'; } catch (e) {}
  setFpsMeter(on);
}
