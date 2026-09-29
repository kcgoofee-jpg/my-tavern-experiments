# UI v2 · 图标语言

用户 2026-09-28 反馈：单字按钮（「事 / 人 / 地」「标」「◂」）太抽象，复位用「房子」、标注用「标签」对不上意思。

## 规则

- 唯一来源：`map/ui/icons.js`（普通脚本，挂 `window.UIIcon`；ES 模块经 `map/app/util.mjs` 的 `ico(name)` 取）。静态 HTML 里的内联 SVG 由同一份路径生成。
- 24 × 24 网格，描线 1.75 px，圆头圆角，`fill:none`，`currentColor`；显示 18–22 px。
- 不用 emoji、不用单字 / 符号字形当按钮。图标 `aria-hidden`，名字由按钮的 `aria-label` + `title` 给（zh / en）。
- 开关状态不能只靠颜色：开 = 强调底色 + 原图标；关 = 灰色 + 加斜杠的图标。
- 角标：已看过 = 中性色计数（右下）；有新 = 右上角红色实心圆 + 新条数（色觉模式下靠位置 / 形状 / 数字区分）。「看过」按聊天记在 `edenMap:chat:<id>:tabseen`。

## 图标表

| 名字 | 含义 | 用在 |
|---|---|---|
| `plus` / `minus` | 放大 / 缩小 | 平面图控制列、三维控制列 |
| `fit` | 复位视野（取景框 + 准星） | 平面图 `#zHome`、三维 `zreset` |
| `labels` / `labelsOff` | 显示标注 开 / 关（Aa） | `#lblTog`、庄园 `lblBtn`、道具 `pinBtn` |
| `bell` | 事态 | 抽屉 / 右栏标签 |
| `users` | 人物 | 抽屉 / 右栏标签 |
| `pin` | 地点 | 抽屉 / 右栏标签 |
| `room` / `legend` / `info` | 房间 / 图例 / 关于·说明 | 三维抽屉标签；`info` 也是署名按钮 |
| `parts` / `flows` | 部件 / 流向 | 道具查看器抽屉标签 |
| `clock` | 世界时间 | 宿主标题栏（`tavern/eden-map.js` 内联同一路径） |
| `chevL` / `chevR` / `chevU` / `chevD` | 展开 / 收起方向 | 抽屉切换钮（右栏 40 px 命中区）、导览上一站 / 下一站、下拉 |
| `back` | 上一级 / 返回 | 顶栏、设置 |
| `close` | 关闭 | 卡片、设置、未上图对话框、道具说明卡、导览 |
| `set` / `more` | 设置 / 更多 | 顶栏 |
| `layers` | 图层 | 顶栏「图层」 |
| `tour` | 导览 | 庄园「传承导览」 |
| `rotate` | 旋转（备用） | — |
| `auto` / `light` / `dark` | 主题 | 设置「显示」 |

## 仍未换的

- `map/ui/gallery.js` 的 ✕（房间图集，另一条线在改，避免冲突）。
- 层切换胶囊里的 `▾`（CSS 装饰，非按钮）。
