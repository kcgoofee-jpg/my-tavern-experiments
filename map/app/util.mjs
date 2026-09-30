// 常量与工具：坐标换算、$、tx/esc/ico、post（协议 v 戳）、SUB_ORIGIN、读屏播报、getJSON。
// 世界图：代码地图坐标（1600×1000）→ 底图归一化坐标（相机裁切：宽 98.5%、高 97%）
export const toImg = (x, y) => [(x / 1600 - .0075) / .985, (y / 1000 - .015) / .97];
export const $ = s => document.querySelector(s);
// 界面文字：有 window.I18N（英文 / 浅色界面分支）时走 I18N.t(键)，否则用这里的中文
export const tx = (key, zh, vars) => { const r = window.I18N?.t?.(key, vars); if (r && r !== key) return r; let s = String(zh ?? key); for (const [a, b] of Object.entries(vars || {})) s = s.split('{' + a + '}').join(b); return s; };   // 字典没到 / 键缺：用兜底，并代入变量（不让 {v} 原样露出来）
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 图标：唯一图标集 ui/icons.js（window.UIIcon，24 格、1.75 描线；docs/design/ui-v2/icons.md）
export const ico = k => window.UIIcon ? window.UIIcon.svg(k) : '';
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
