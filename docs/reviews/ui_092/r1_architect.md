# UI 0.9.2 R1 — 架构师汇总
| 审阅者 | 分数 | P0 | P1 |
|---|---|---|---|
| 视觉设计师 | 7.0 | 0 | 2 |
| 手机 RP 玩家 | 6.5 | 0 | 3 |
| 现编：VoiceOver + 中英切换玩家 | 5.5 | 0 | 3 |
## 去重修复清单
1. P1 `map/tavern/eden-map.js:166` 行内 `//` 注释吞掉 `.em-close` aria-label 设置 → 注释另起一行。验收：EN 下 aria-label=Close。（两人独立发现，确认回归）
2. P1 `map/viewer.html:900` 层按钮 title：planned「制作中」被清空，且与 903 aria-label 重复 → 删 900 行 title 逻辑（或跳过 disabled）。验收：未开放层悬停「制作中」；读屏不重复。
3. P1 事态占地标后地名丢失（`.mk.evon` + 副标题去层前缀）→ 卡片副标题 / 事态 aria 保留地名一次（只剥层名）。验收：点事态可见地名。
4. P1 触屏看不到 title 信息：多地点全文、图例可点提示 → 胶囊显示「A +1」可点看全文；图例首次展开小字一次。验收：375 截图可见。
5. P2 `first` 为空 → `find(Boolean)`；full 空时 removeAttribute；删 `mapTitle` 死状态；清理 viewer.html `go(id)` 行重复两遍的注释。
## 不采纳
- 层按钮再加 here 描边：面包屑已表明当前层，再加即重复，违背用户「讨厌重复」。
## 裁决
**再来一轮**：无 P0，但第 1 条是真实回归；1–4 修完后复截 desk/en/phone/iphone 复审。
