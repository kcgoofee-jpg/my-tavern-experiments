// 常量与工具：坐标换算、$、tx/esc/ico、post（协议 v 戳）、SUB_ORIGIN、读屏播报、getJSON。
// 世界图：代码地图坐标（1600×1000）→ 底图归一化坐标（相机裁切：宽 98.5%、高 97%）
export const toImg = (x, y) => [(x / 1600 - .0075) / .985, (y / 1000 - .015) / .97];
export const $ = s => document.querySelector(s);
// 界面文字：有 window.I18N（英文 / 浅色界面分支）时走 I18N.t(键)，否则用这里的中文
export const tx = (key, zh, vars) => { const r = window.I18N?.t?.(key, vars); return r && r !== key ? r : zh; };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// SVG 描线图标（16 px、1.5 px 描线，规范 3.2；替换 ☾ ☀ ◐ ⚙ × 等 Unicode 字符，大小、基线一致）
const ICON = {
  auto: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/>',
  light: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
  dark: '<path d="M13.3 10.1A5.7 5.7 0 0 1 5.9 2.7a5.7 5.7 0 1 0 7.4 7.4z"/>',
  set: '<path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7"/><circle cx="11" cy="4.5" r="1.5"/><circle cx="5" cy="11.5" r="1.5"/>',
  more: '<path d="M3.5 8h.01M8 8h.01M12.5 8h.01" stroke-width="2.4"/>',
};
export const ico = k => `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true">${ICON[k]}</svg>`;
export let narrow = false;
// 触屏或低内存设备：瓦片缓存减半（约 30 MB），避免手机 WebView 因内存被回收
export const coarse = matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory || 8) <= 4;   // 手机 / 窄面板：隐藏小地图（信息卡的底部抽屉由 CSS 媒体查询处理）
// 协议 v2（core/protocol.mjs，arch-v2 §3）：发出的消息都盖 v；收到的消息经 PR.accept 校验（模块未到时照旧处理，宿主在 ready 之后才推数据）
export const PROTO = 2; export let PR = null;
export const post = msg => { if (window.top !== window) parent.postMessage({ ...msg, v: PROTO }, '*'); };
// 庄园 / 3D 子页与查看器同源：往下发消息用具体 origin（A-6）；file:// 等 opaque origin 只能退回 '*'
export const SUB_ORIGIN = (() => { const o = self.origin || location.origin; return o && o !== 'null' ? o : '*'; })();   // srcdoc 里 location.origin 是 'null'，self.origin 才是继承来的真实 origin
// 读屏播报（aria-live）：新事态、花屏开始
// 同一时刻的几条（新事态 + 花屏）合并成一句播报，后一条不再覆盖前一条（E4b R09）
export let srQ = [], srT = 0;
export function announce(msg) { if (!msg) return; srQ.push(msg); clearTimeout(srT);
  srT = setTimeout(() => { const el = $('#sr'); if (!el) return; const s = srQ.join('；'); srQ = []; el.textContent = ''; setTimeout(() => { el.textContent = s; }, 60); }, 120); }
// 数据文件只取一次：切换地图、面板休眠后唤醒都不再重复请求
export const jsonCache = new Map();
// 失败不缓存（2026-09-27 接手 review P0/P1）：以前失败会存一个 resolved null —— maps.json 抖一次，
// 整页就永远停在「加载中…」、所有按钮没有监听；单张地图的点位数据失败也会整个会话都取不回来。
export const getJSON = url => {
  if (!jsonCache.has(url)) jsonCache.set(url, fetch(url).then(r => r.ok ? r.json() : null).catch(() => null)
    .then(v => { if (v == null) jsonCache.delete(url); return v; }));
  return jsonCache.get(url);
};
export function setSrQ(v) { return (srQ = v); }
export function setPR(v) { return (PR = v); }
export function setNarrow(v) { return (narrow = v); }
// 页面 load 之后的空闲时刻再做（首屏之外的预取：第一次点开时不再等一个 CDN 往返）
export function afterLoadIdle(f) { const go = () => (window.requestIdleCallback ? requestIdleCallback(() => f(), { timeout: 4000 }) : setTimeout(f, 1500));
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true }); }
