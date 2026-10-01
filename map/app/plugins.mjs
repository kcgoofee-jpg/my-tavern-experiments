// 功能外挂注册表（arch-v2 §6 第 7 步）：events / chars / custom / trips / unmapped / varmap / compose / security 各自是独立的
// <script type="module">，加载失败或按需不加载（varmap / compose 只在嵌入时、security 常驻）都不影响查看器本体。
// 方向：外挂 → 核心用显式 import；核心 → 外挂、外挂 ↔ 外挂一律经 P.<名字>（没注册 = undefined，调用方照旧带守卫）。
// 同名也挂到 window，保持本机扩展与浏览器测试看到的全局名不变。
export const plugins = Object.create(null);
export function register(name, api) { plugins[name] = api; try { window[name] = api; } catch (e) {} return api; }
