# pi-lens 审计处置（2026-09-28）

对 lens 全量扫描（map/ 50 文件：🔴71 blocking / 149W / 130 hints）逐条人工核验后的处置结论。

## 结论：无真实安全缺陷，blocking 全部为既有安全模式的误报

仓库 UI 层统一采用「`esc()` 转义 + innerHTML 模板字符串」模式（`esc` 来自 map/app/util.mjs）。
逐行核验全部 71 条 `no-inner-html-js` blocking：

- **custom.mjs / settings.mjs / th-ui.mjs / chars.mjs / events.mjs / markers.mjs / layers.mjs /
  unmapped.mjs / feedback.mjs / scale.mjs / varmap.mjs / topbar.mjs / trips.mjs**：
  所有动态插值均经 `esc()`（${esc(...)}），其余插值为数字、仓库常量或 SVG 几何值。
  `<dd>${v}</dd>`（events.mjs:185）等"看似未转义"处，v 在构造时已逐项 `esc()`。
- **tiers.mjs:229**：innerHTML = 纯数字坐标的 `<rect>`（避让遮罩），无用户数据。
- **section.js:40**：静态渐变常量 + 数字裁剪框。
- **viewer3d.html / estate/**：同样 esc 模式（estate/main.js 4 处已核）。

**逐条处置**：已在 lens_diagnostic_mark 标记 false-positive（blender/world/yuanyu_holy_mount.py 188 条
+ map/app/scale.mjs:71 等）。yuanyu 的误报属系统性：bpy/mathutils 仅在 Blender Python 下可解析，
渲染脚本不包 try 是有意的失败设计。

## 真实问题（本次修复 2 处）

1. **map/trips.mjs:64** — `t.time`（解析自聊天文本，非受控）未经 esc 直接进 extra → innerHTML。已加 `esc(t.time)`。
2. **map/app/scale.mjs:101** — 全局 `isFinite(e.zoom)` → `Number.isFinite()`。

## 确认的误报（不改代码）

- viewer.html:327/329 `evn` = 事件数徽章 CSS 类名（layers.mjs:55 使用），非 "even" 拼写错误。
- maps.json:975 `Rin` = 人名「神宫寺凛 Jinguji Rin」。
- perf.md/interior.md 的 `LOD` = 3D 术语 Level of Detail。
- section.js:214-215 双 `.reverse()` 是有意的往返使用（就地反转后翻回）。

## 接受的样式债（149W/130 hints，不处理）

nested-ternary / prefer-query-selector / dom-node-append / prefer-at 等为风格偏好，仓库存量代码
风格统一且经过设计评审（注释含设计编号），批量改写 churn 大于收益。world_draft1/2.html 的
jscpd 重复为历史草稿文件与 world.html 的共享骨架，属预期。
