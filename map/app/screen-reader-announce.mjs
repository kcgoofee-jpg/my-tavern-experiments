// 读屏播报（aria-live）：新事态、花屏开始（S5-2 自 util.mjs 拆出）。
// 同一时刻的几条（新事态 + 花屏）合并成一句播报，后一条不再覆盖前一条（E4b R09）
import { $ } from './dom-helpers.mjs';
export let srQ = [], srT = 0;
export function announce(msg) { if (!msg) return; srQ.push(msg); clearTimeout(srT);
  srT = setTimeout(() => { const el = $('#sr'); if (!el) return; const s = srQ.join('；'); srQ = []; el.textContent = ''; setTimeout(() => { el.textContent = s; }, 60); }, 120); }
export function setSrQ(v) { return (srQ = v); }
