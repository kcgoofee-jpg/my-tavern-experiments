// 色觉模式（E7 补做，原草稿 docs/drafts/e7_cvd.patch，UI v2 上重做）：关 / rg 红绿（protan / deutan）/ by 蓝黄（tritan）。
// 存储键登记在 core/storage.mjs（edenMapCvd）。开着时：html 加 .cvd .cvd-rg/.cvd-by 类 + data-cvd 属性，
// 事态大类、图例、人物头像色相改用本文件的 CVD 安全色板（Okabe-Ito 为底），并广播 cvd-change 事件让各模块重画。
// 同一个 mode 也经协议 estate:cvd 转给庄园 / 三维子页（map/core/protocol.mjs、map/app/estate.mjs）。
import * as TCStore from '../core/storage.mjs';

export const MODES = ['0', 'rg', 'by'];

// Okabe–Ito 色板：红绿色弱（protan / deutan）安全，用于事态 9 个大类
const OI = { 空防: '#e69f00', 气候: '#56b4e9', 治安: '#0072b2', 政治: '#994455', 媒体: '#cc79a7', 民生: '#f0e442', 军事: '#009e73', 灾害: '#d55e00', 人物: '#f2f2f2', 其他: '#bbbbbb' };
// 蓝黄色弱（tritan）：Okabe-Ito 里蓝 / 黄仍会混，换成红 / 青的对立，其余沿用
const TR = { ...OI, 气候: '#9ad0f5', 民生: '#e2903a', 治安: '#d7263d', 军事: '#029e73', 空防: '#7a5195' };
export const GROUPS_CVD = { rg: OI, by: TR };

// 人物头像色相（沿用哈希取色，只换色相表，避开该模式下容易混的两组）
export const CHAR_HUES_CVD = { rg: [35, 200, 210, 280, 340, 15, 55], by: [15, 340, 200, 45, 280, 5, 165] };

export function mode() { try { const v = TCStore.get('edenMapCvd'); return MODES.includes(v) ? v : '0'; } catch (e) { return '0'; } }
export function on() { return mode() !== '0'; }
export function setMode(v) { try { TCStore.set('edenMapCvd', MODES.includes(v) ? v : '0'); } catch (e) {} if (typeof document !== 'undefined') apply(); }

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** 应用到本页 <html>；供其它模块（events.mjs、chars.mjs）读 mode()/groupColor()/charHues() 后各自重画 */
export function apply() {
  const m = mode(), root = document.documentElement;
  root.classList.toggle('cvd', m !== '0'); root.classList.toggle('cvd-rg', m === 'rg'); root.classList.toggle('cvd-by', m === 'by');
  root.dataset.cvd = m;
  for (const fn of listeners) { try { fn(m); } catch (e) {} }
  try { window.dispatchEvent(new CustomEvent('cvd-change', { detail: { mode: m } })); } catch (e) {}
}

/** 事态大类颜色：关时用原色板，开时用本文件的安全色板 */
export function groupColor(g, fallback) { const m = mode(); if (m === '0') return fallback; const t = GROUPS_CVD[m]; return t[g] || t.其他 || fallback; }
/** 人物头像色相表：关时返回 null（调用方用原表） */
export function charHues() { const m = mode(); return m === '0' ? null : CHAR_HUES_CVD[m]; }

/** WCAG 相对亮度粗算 → 底色上该用深字还是白字（阈值与 tests/cvd.test.mjs 一致） */
export function inkOn(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return '#0b0b0b';
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4));
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2] > .18 ? '#0b0b0b' : '#fff';
}
// 本模块经 <script type="module"> 直接加载到 viewer.html，ES 模块按 URL 缓存单例，settings.mjs / events.mjs / chars.mjs 里的 import 拿到同一份；
// 首帧就把本机存的模式刷到 <html>，不等设置面板打开
if (typeof document !== 'undefined') apply();
