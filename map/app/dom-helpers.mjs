// DOM 小工具（S5-2 自 util.mjs 拆出）：$、esc、ico、页面 load 之后的空闲回调。
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// SEC-1：href 只收 http(s) 与协议相对地址；别的一律当空（远端更新说明的链接也走这里，javascript: / data: 不进页面）
export const safeHref = u => { const s = String(u ?? ''); return /^(?:https?:)?\/\//i.test(s) && !/[\s"'\\()]/.test(s) ? s : ''; };
// 图标：唯一图标集 ui/icons.js（window.UIIcon，24 格、1.75 描线；docs/design/ui-v2/icons.md）
export const iconSvg = k => window.UIIcon ? window.UIIcon.svg(k) : '';
// 页面 load 之后的空闲时刻再做（首屏之外的预取：第一次点开时不再等一个 CDN 往返）
export function afterLoadIdle(f) { const go = () => (window.requestIdleCallback ? requestIdleCallback(() => f(), { timeout: 4000 }) : setTimeout(f, 1500));
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true }); }
