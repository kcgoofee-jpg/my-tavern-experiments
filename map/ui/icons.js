// UI v2 · 唯一的图标集（docs/design/ui-v2/icons.md）。24 格网格、1.75 描线、圆头圆角，currentColor；不用 emoji、不用单字按钮。
// 普通脚本（sheet.js / chrome3d.js 也是普通脚本），挂 window.UIIcon；ES 模块经 app/dom-helpers.mjs 的 ico() 取用。
//   UIIcon.svg(name, { size, cls }) → '<svg …>'（aria-hidden，名字由按钮的 aria-label / title 给）· UIIcon.names
(function () {
  if (window.UIIcon) return;
  const P = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    // 复位视野：取景框四角 + 中心准星（不是「房子」）
    fit: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/><circle cx="12" cy="12" r="2.5"/>',
    // 标注：「Aa」字形；关 = 同一字形加斜杠
    labels: '<path d="M3 18l4.5-12L12 18M4.7 14h5.6"/><path d="M20.5 18v-5.2a2.6 2.6 0 0 0-5 0M20.5 15.2c-3.4-.4-5.5.4-5.5 1.6 0 .9.8 1.4 1.9 1.4 1.8 0 3.6-1.2 3.6-3"/>',
    labelsOff: '<path d="M3 18l4.5-12L12 18M4.7 14h5.6"/><path d="M20.5 18v-5.2a2.6 2.6 0 0 0-5 0M20.5 15.2c-3.4-.4-5.5.4-5.5 1.6 0 .9.8 1.4 1.9 1.4 1.8 0 3.6-1.2 3.6-3"/><path d="M3 3l18 18"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><path d="M15.5 5.2a3.2 3.2 0 0 1 0 6M17.5 14.7c1.9.6 3.1 2.2 3.5 4.8"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    chevL: '<path d="M14.5 6l-6 6 6 6"/>', chevR: '<path d="M9.5 6l6 6-6 6"/>',
    chevU: '<path d="M6 14.5l6-6 6 6"/>', chevD: '<path d="M6 9.5l6 6 6-6"/>',
    back: '<path d="M14.5 6l-6 6 6 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    set: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    more: '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="3"/>',
    layers: '<path d="M12 3.5L3 8.5l9 5 9-5z"/><path d="M3 12.5l9 5 9-5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>',
    tour: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    rotate: '<path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4"/><path d="M4 3.5V8h4.5"/>',
    auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    dark: '<path d="M19.5 14.8A8.2 8.2 0 0 1 9.2 4.5a8.2 8.2 0 1 0 10.3 10.3z"/>',
    room: '<path d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5V20M4 12h7M11 4v5M11 15v5M2.5 20h19"/>',
    legend: '<path d="M4 6.5h.01M4 12h.01M4 17.5h.01" stroke-width="3"/><path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/>',
    cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    parts: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    flows: '<path d="M3 8h13M13 4.5L16.5 8 13 11.5M21 16H8M11 12.5L7.5 16l3.5 3.5"/>',
  };
  const svg = (k, o = {}) => `<svg class="${o.cls || 'ico'}" viewBox="0 0 24 24" width="${o.size || 20}" height="${o.size || 20}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[k] || ''}</svg>`;
  window.UIIcon = { svg, names: Object.keys(P), P };
})();
