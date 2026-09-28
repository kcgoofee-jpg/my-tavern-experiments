// 三维查看器相机控制的共用小件（estate/main.js 与 props/viewer3d.html 都用）：视角预设 + 指北针、首次打开的操作提示卡、
// 空闲计时器（给「自动旋转，默认关」用）。两边的相机数学（正交 theta/phi vs. 透视 OrbitControls）不一样，留在各自文件里；
// 这里只收共用的 DOM / 样式 / 交互小逻辑，别再各写一份。
// 用法：import { makePresetCluster, makeCompass, makeHintCard, makeIdleTimer, prefersReducedMotion } from '../ui/camera-controls.js'

const CSS_ID = 'cam-ctrl-css';
function ensureCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement('style'); s.id = CSS_ID;
  s.textContent = `
.cc-presets{position:fixed;display:flex;flex-direction:column;gap:4px;align-items:flex-end;pointer-events:none;z-index:6}
.cc-presets .cc-row{display:flex;gap:4px;pointer-events:auto}
.cc-presets button{min-width:40px;min-height:32px;padding:0 8px;border:1px solid var(--line,rgba(255,255,255,.14));border-radius:8px;background:var(--surface-glass,rgba(21,27,32,.85));color:var(--ink,#d5dde4);font:500 12px/1 var(--font-ui,system-ui);cursor:pointer;white-space:nowrap}
.cc-presets button:hover{border-color:var(--line-strong,rgba(255,255,255,.3))}
.cc-presets button[aria-pressed="true"]{background:var(--accent,#e6c36a);color:var(--on-accent,#1a1406);font-weight:700}
.cc-compass{width:34px;height:34px;border-radius:50%;background:var(--surface-glass,rgba(21,27,32,.85));border:1px solid var(--line,rgba(255,255,255,.14));cursor:pointer;display:grid;place-items:center;pointer-events:auto}
.cc-compass svg{width:22px;height:22px;display:block}
.cc-hint{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);transform:translateX(-50%);max-width:min(420px,92vw);
  background:var(--surface-glass,rgba(21,27,32,.92));border:1px solid var(--line,rgba(255,255,255,.14));border-radius:12px;box-shadow:var(--sh-2,0 6px 20px rgba(0,0,0,.35));
  padding:10px 14px;font:13px/1.5 var(--font-ui,system-ui);color:var(--ink,#d5dde4);z-index:20;display:flex;gap:10px;align-items:flex-start}
.cc-hint ul{margin:0;padding:0 0 0 1.1em}
.cc-hint li{margin:1px 0}
.cc-hint button.cc-x{flex:none;margin-left:auto;border:0;background:transparent;color:var(--muted,#8591a0);cursor:pointer;font-size:16px;line-height:1;padding:2px}
.cc-hint button.cc-x:hover{color:var(--ink,#d5dde4)}
@media (max-width:480px){.cc-presets{right:8px !important}.cc-hint{padding:8px 12px;font-size:12.5px}}
`;
  document.head.appendChild(s);
}

export function prefersReducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

// 视角预设按钮：俯视 / 斜视 45° / 正面 / 自由。自由态由调用方在用户手动拖动后置为 active。
export function makePresetCluster({ root = document.body, presets, style = {} } = {}) {
  ensureCSS();
  const box = document.createElement('div'); box.className = 'cc-presets';
  Object.assign(box.style, { right: '12px', bottom: '92px' }, style);
  const row = document.createElement('div'); row.className = 'cc-row'; box.append(row);
  const btns = {};
  for (const p of presets) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = p.label; b.setAttribute('aria-pressed', 'false');
    b.onclick = () => p.onClick?.(p.id);
    row.appendChild(b); btns[p.id] = b;
  }
  root.appendChild(box);
  return {
    el: box,
    setActive(id) { for (const [k, b] of Object.entries(btns)) b.setAttribute('aria-pressed', String(k === id)); },
    dispose() { box.remove(); },
  };
}

// 指北针：小圆盘，针尖指向世界 +Z（或调用方定义的「北」）。heading 是弧度（相机朝向的地平方位角）。点击复位朝向。
export function makeCompass({ root = document.body, onReset, style = {} } = {}) {
  ensureCSS();
  const b = document.createElement('button'); b.type = 'button'; b.className = 'cc-compass';
  b.setAttribute('aria-label', '指北 · 点击复位朝向');
  b.innerHTML = `<svg viewBox="0 0 24 24"><g class="cc-needle"><path d="M12 2 L15 12 L12 22 L9 12 Z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12 2 L14.2 11 L12 12.5 L9.8 11 Z" fill="#c0392b" stroke="none"/><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1"/></g></svg>`;
  Object.assign(b.style, { position: 'fixed', right: '12px', bottom: '52px' }, style);
  b.style.color = 'var(--ink, #d5dde4)';
  b.onclick = () => onReset?.();
  root.appendChild(b);
  const needle = b.querySelector('.cc-needle');
  return {
    el: b,
    setHeading(rad) { needle.setAttribute('transform', `rotate(${(-rad * 180 / Math.PI).toFixed(1)} 12 12)`); },
    dispose() { b.remove(); },
  };
}

// 首次打开的「操作提示」卡：可关闭，记住关闭状态（localStorage storageKey）。
export function makeHintCard({ root = document.body, storageKey, lines, dismissLabel = '知道了' } = {}) {
  ensureCSS();
  let seen = false;
  try { seen = localStorage.getItem(storageKey) === '1'; } catch (e) {}
  const card = document.createElement('div'); card.className = 'cc-hint'; card.hidden = seen;
  card.innerHTML = `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul><button type="button" class="cc-x" aria-label="${dismissLabel}">✕</button>`;
  root.appendChild(card);
  function dismiss() { card.hidden = true; try { localStorage.setItem(storageKey, '1'); } catch (e) {} }
  card.querySelector('.cc-x').onclick = dismiss;
  return { el: card, dismiss, shown: !seen, dispose() { card.remove(); } };
}

// 空闲计时器：idleMs 毫秒无交互后调 onIdle()；任何一次 markActive() 取消并重新计时，同时调 onActive()（如果之前已经 idle 过）。
export function makeIdleTimer(idleMs, onIdle, onActive) {
  let t = 0, idle = false;
  function arm() { clearTimeout(t); t = setTimeout(() => { idle = true; onIdle?.(); }, idleMs); }
  function markActive() { if (idle) { idle = false; onActive?.(); } arm(); }
  return { markActive, get isIdle() { return idle; }, dispose() { clearTimeout(t); } };
}
