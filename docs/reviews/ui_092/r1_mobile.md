# UI 0.9.2 R1 — 手机 RP 玩家（单手，375 宽，TavernHelper）
分数：6.5/10。顶栏变短后不再挤，地点只一段、右省略，好读；fab 提示打开后消失，不再压在面板后。
## 问题
- P1 切 EN 后关闭按钮 aria-label 不更新：`map/tavern/eden-map.js:166` 注释 `// v0.9.2…` 写在行中，把后面的 `root.querySelector('.em-close').setAttribute('aria-label', U('close'))` 一起注释掉了。修：注释另起一行。验收：EN 模式 aria-label="Close"。
- P1 多地点只显示第一处，全文只在 `title`：手机无悬停，看不到第二处。修：显示「A +1」，点胶囊弹全文。验收：375 下 MVU「A / B」显示「A +1」，点击可见全文。
- P1 图例提示改成 title 后手机上没人知道图例可点（同设计师 P2，此处升 P1）。
- P2 地点首段为空（MVU 以「/」开头）时胶囊空白：`first` 为 ''。修：`split(...).find(Boolean)`。验收：「/ B」显示 B。
- P2 层按钮「当前地点」改为 title，手机不可见；面包屑已表明，可接受。
结论：一处真 bug + 触屏信息丢失，需再一轮。
