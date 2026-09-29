# UI 0.9.2 R1 — 现编审阅者
**身份**：用 iOS VoiceOver + 中英切换跑团的视障玩家，iPhone，常开 EN。
**为什么选他**：本轮 diff 把大量信息从可见文字挪进 `title`/`aria-label`（地点全文、层「当前地点」、图例提示），并改了 `showTitle`；这些只有读屏/无悬停用户能验出来。
**只看**：aria 与可见文字是否一致且不重复；语言切换后的标签；触屏可达。**不看**：配色、排版、云。
分数：5.5/10
## 问题
- P1 `eden-map.js:166` 行内注释吞掉关闭按钮 aria-label 设置（语言切换失效）。修：拆行。验收：切 EN 后 `.em-close[aria-label=Close]`。
- P1 `viewer.html:900` 清空 title 覆盖 planned「制作中」；且 903 行 aria-label 已含「当前地点」，title 再写一遍 = 读屏重复播报。修：删 900 行 title 逻辑，planned 保留原 title。验收：每按钮只读一次「当前地点在这一层」。
- P1 `.mk.evon{visibility:hidden}` 让被占位地标退出无障碍树，事态点 aria 若不含地名则地点丢失。修：事态点 aria-label 追加地名。验收：聚焦事态点读出「标题，地名」。
- P2 full 为空时仍 setAttribute('aria-label','')，应 removeAttribute。
- P2 图例提示只在 title，读屏不播。修：aria-describedby。
结论：视觉去重好，但无障碍一处 bug + 两处信息丢失。
