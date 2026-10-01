// 界面文字查找（S5-2 自 util.mjs 拆出）：有 window.I18N（英文 / 浅色界面分支）时走 I18N.t(键)，否则用这里的中文
export const tx = (key, zh, vars) => { const r = window.I18N?.t?.(key, vars); if (r && r !== key) return r; let s = String(zh ?? key); for (const [a, b] of Object.entries(vars || {})) s = s.split('{' + a + '}').join(b); return s; };   // 字典没到 / 键缺：用兜底，并代入变量（不让 {v} 原样露出来）
