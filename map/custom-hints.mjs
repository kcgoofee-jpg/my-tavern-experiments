// 剧情改名的一次性提示（地图顶部居中，5 秒；不压住展开的事态 / 人物列表）（S5-1 自 custom.mjs 原样搬出；行为不变）。
// 提示的样式表（#cuToast）留在 custom.mjs（z-index 账本）。
export function createHints() {
  let toastT = 0;
  function toast(items) {   // UI v2：走唯一通知层（P2，嵌入时由宿主统一显示）；旧的 #cuToast 只在通知层不可用时兜底
    const msg = items.join('；'); if (!msg) return;
    if (typeof window.TCNotify === 'function') { window.TCNotify({ level: 2, key: 'cu-' + Date.now(), title: msg }); return; }
    let el = document.getElementById('cuToast');
    if (!el) { el = document.createElement('div'); el.id = 'cuToast'; el.setAttribute('role', 'status'); document.getElementById('stage').appendChild(el); }
    el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 5000);
  }
  return { toast };
}
