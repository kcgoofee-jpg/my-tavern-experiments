// 色觉模式（E7 补做，原草稿 docs/drafts/e7_cvd.patch，UI v2 上重做）：关 / rg 红绿（protan / deutan）/ by 蓝黄（tritan）。
// 存储键登记在 core/storage.mjs（edenMapCvd）。开着时：html 加 .cvd .cvd-rg/.cvd-by 类 + data-cvd 属性，
// 事态大类、图例、人物头像色相改用本文件的 CVD 安全色板（Okabe-Ito 为底），并广播 cvd-change 事件让各模块重画。
// 同一个 mode 也经协议 estate:cvd 转给庄园 / 三维子页（map/core/protocol.mjs、map/app/subpage3d-host.mjs）。
import * as storage from '../core/storage.mjs';
import { recheck } from '../core/pack-v2-spec.mjs';

export const MODES = ['0', 'rg', 'by'];
/** 事态 / 图例里没有合法颜色时用的中性色；颜色会进 style（取自包数据或聊天脚本），只收 #rrggbb（K-R64，I-09），别的一律中性色 */
export const NEUTRAL = '#cfd8e0';
export const safeColor = c => recheck.hex(c) ?? NEUTRAL;

// 事态大类的色觉安全色：每个大类自己带（设定包 events.groups[].x-cvd = { rg, by }，K-R68）；没带的按原色相归桶（hueBucket，下面的通用色板，Okabe-Ito 为底）
// 红绿色弱（protan / deutan）：Okabe-Ito；蓝黄色弱（tritan）：蓝 / 黄仍会混，换成红 / 青的对立
export const CVD_PAL = { rg: ['#e69f00', '#56b4e9', '#0072b2', '#009e73', '#cc79a7', '#f0e442', '#994455', '#d55e00'], by: ['#d7263d', '#9ad0f5', '#029e73', '#7a5195', '#e2903a', '#cc79a7', '#0072b2', '#994455'] };
/** 通用重映射：原色（#rrggbb）按色相取色板里的一格；不是 #rrggbb 就返回 '#ffffff'。props/viewer3d.html 带着同一份拷贝（三维页要能独立打开）。 */
export function hueBucket(hex, m) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return '#ffffff';
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = !d ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  const pal = CVD_PAL[m] || CVD_PAL.rg; return pal[Math.floor(h / (360 / pal.length)) % pal.length];
}

// 人物头像色相（沿用哈希取色，只换色相表，避开该模式下容易混的两组）
export const CHAR_HUES_CVD = { rg: [35, 200, 210, 280, 340, 15, 55], by: [15, 340, 200, 45, 280, 5, 165] };

export function mode() { try { const v = storage.get('edenMapCvd'); return MODES.includes(v) ? v : '0'; } catch (e) { return '0'; } }
export function on() { return mode() !== '0'; }
export function setMode(v) { try { storage.set('edenMapCvd', MODES.includes(v) ? v : '0'); } catch (e) {} if (typeof document !== 'undefined') apply(); }

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** 应用到本页 <html>；供其它模块（events.mjs、characters-view.mjs）读 mode()/groupColor()/charHues() 后各自重画 */
export function apply() {
  const m = mode(), root = document.documentElement;
  root.classList.toggle('cvd', m !== '0'); root.classList.toggle('cvd-rg', m === 'rg'); root.classList.toggle('cvd-by', m === 'by');
  root.dataset.cvd = m;
  for (const fn of listeners) { try { fn(m); } catch (e) {} }
  try { window.dispatchEvent(new CustomEvent('cvd-change', { detail: { mode: m } })); } catch (e) {}
}

/** 事态大类颜色：关时用原色（fallback），开时用该大类自带的安全色（xcvd = { rg, by }），没有就按原色相归桶 */
export function groupColor(g, fallback, xcvd) { const m = mode(); if (m === '0') return fallback; const c = xcvd?.[m]; return /^#[0-9a-f]{6}$/i.test(c || '') ? c : hueBucket(fallback, m); }
/** 人物头像色相表：关时返回 null（调用方用原表） */
export function charHues() { const m = mode(); return m === '0' ? null : CHAR_HUES_CVD[m]; }

/** WCAG 相对亮度粗算 → 底色上该用深字还是白字（阈值与 tests/color-vision-mode.test.mjs 一致） */
export function inkOn(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return '#0b0b0b';
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4));
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2] > .18 ? '#0b0b0b' : '#fff';
}
// 本模块经 <script type="module"> 直接加载到 viewer.html，ES 模块按 URL 缓存单例，settings.mjs / events.mjs / characters-view.mjs 里的 import 拿到同一份；
// 首帧就把本机存的模式刷到 <html>，不等设置面板打开
if (typeof document !== 'undefined') apply();
