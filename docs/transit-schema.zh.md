# 交通网与路线规划：transit 块、路线器与主题交通图（S8-4 设计）

> 中文版；英文版 `docs/transit-schema.md` 是准（两份标题结构一致，由 `tools/check_zh_mirror.py` 把关）。本文是计划步骤
> **S8-4-design** 的产出（`docs/todo.md` N6、N8；N7 里 S7「建议路线」操作要调用的路线器接口也在这里定）。状态：**设计，
> 工作决定已按默认生效**（2026-10-01 用户不在：下面审阅表里的每条建议就是工作决定，用户可以推翻任何一条）。本文不改代码。
> 它给内核契约新增的规则预留为 **K-R107 … K-R114**（`docs/kernel-schema.md` §13「S8-4 计划」）；全文随附录里的步骤说明
> （S8-4a、S8-4b）落地。关于现有代码的每句话都在 origin/preview `df3b5f6d`（head #239）上核对过。

## 0. 审阅表（T-01 … T-16）

一行一个真正的决定。「工作决定」= 建议，2026-10-01 按默认生效（自动驾驶）。同一份清单在 `docs/todo.md` §3，一项一行。

| 编号 | 问题 | 选项 | 后果 | 建议（工作决定） |
|---|---|---|---|---|
| T-01 | 包在哪里声明交通网？ | A：新的可选顶层 v2 块 `transit`（和别的块一样可内联或写文件路径）；schema-1 包写在 `overlay.v2.json` 里。B：`layers` 里的一种特殊图层。C：写成节点字段。 | A：站点、线路、连接、城区一处写清；路线器、宿主和绘制读同一份数据；没有这块的包不受影响。B：图层是表现层，而路线器和宿主不开查看器也要用这份数据。C：线路和城区不是节点，树里会塞满非地点。 | **A** |
| T-02 | 站点是什么？ | A：有自己的 id；要么引用节点（`node`，画在该节点画的位置），要么是自由点（`view` + `at` + `name`）。B：只能是节点。C：只能是点。 | A：第一个包把站放在已有标记上，一个坐标都不用抄；包仍可以加一个不是地点的栈桥或站台。B：没有地点就没有站。C：每个坐标都要重抄，标记一挪就错。 | **A** |
| T-03 | 交通方式。 | A：包声明的方式表，按 id 并到内核的四个默认方式 `walk`、`metro`、`maglev`、`air` 上（中性名称）；每种方式写明它属于哪类行程画法（`road`、`rail`、`underground`、`air`、`teleport`）；最多 8 种。B：固定四种。C：自由字符串。 | A：用户要的四种处处都有，奇幻包用数据加渡船或缆车，行程也知道哪些网络方式对应自己的方式。B：别的世界只能用磁悬浮。C：没有名称，也对不上行程。 | **A** |
| T-04 | 边怎么写？ | A：`lines`（有序停靠站、每段分钟数、编号、名称、颜色）生成乘车边；自由的 `links`（步行换乘、单段直达）补其余；除非 `oneway`，都是双向。B：只写显式的边。 | A：一条线写一次，绘制白得到带编号的线路。B：10 站的线要写 18 条边，而且没有可画、可命名的身份。 | **A** |
| T-05 | 路线器的代价。 | A：分钟数；乘过车后换乘另一条线时加 `options.transfer_min`（默认 3），每条线可另加 `wait`；平手时换乘少的优先，再比停靠站少，再按声明顺序；换乘次数 = 乘车段 − 1。B：只看分钟。C：换乘最少优先。 | A：贴近真实、确定、能用一行字讲清。B：为省半分钟乱换线。C：绕得离谱。 | **A** |
| T-06 | 一个地点（当前位置、点开的标记）怎么接上交通网？ | A：依次：同一节点上的站；节点包含这个地点的站（站楼里的房间）；地点里面的站（一个城区：它里面的任意站，0 分钟）；然后仅在查看器里，用视图的米制范围，走到同一视图上 `options.access_max_min` 以内的站（步行接驳段）；同时比较直接步行；都接不上 = 没有路线，静默。B：只认节点相等。C：总是找最近的站。 | A：有交通网的视图上每个标记都不用额外数据就能规划，也不跨视图乱猜。B：大多数地点没有自己的站。C：从一个房间出发，走到别的楼的站。 | **A** |
| T-07 | 跨视图的边。 | A：允许（从山上到码头的缆车）；和别的边一样参与规划；在两边视图上都画成站旁的一小段指引，写另一端的名字和视图；路线卡列出其他视图上的路段。B：一个交通网只能在一个视图里。 | A：真实的多层小镇能用，示例包就验证这一点。B：两张图之间第一条连接就要第二张网。 | **A** |
| T-08 | 谁来规划，谁持有路线？ | A：查看器规划（它有坐标）并把路线发上去；宿主用自己那份交通网复核（`checkPlan`：重算乘车与连接段分钟，限住步行段，核对 id 与衔接，名字重建），只在本次会话保留，回传一份，查看器重开时再发，到站、换聊天或设定后 20 条消息时清掉。B：宿主只凭名字规划。C：路线存进聊天变量。 | A：单向数据流不破（查看器只发意图，状态归宿主），什么都不落盘，聊天记录仍是唯一真相。B：宿主没有标记坐标，没法算步行接驳。C：把界面上的意愿写进聊天数据。 | **A** |
| T-09 | `{{eden_route}}` 的输出。 | A：今天的输出原样作为前半（玩家最近一段行程 `A → B`），持有路线时接 ` · ` 和按包模板 `llm.templates.<lang>.route_plan` 生成的一行（内核有 zh / en 默认）；没有路线 = 与今天逐字节相同。B：有路线时替换旧输出。C：换个新宏名。 | A：外部宏契约意思不变，多了路线；今天在用它的卡在用户规划路线之前看不到任何变化。B：悄悄改变现有预设收到的内容。C：用户要的是扩展，不是改名。 | **A** |
| T-10 | 图层行与默认值。 | A：两个内核图层：`transit`（菜单行「交通网」，按 brief §2.6 **默认关**，存在 `edenMapLayers`，只在有交通网数据的视图上出现）和 `route-plan`（没有菜单行；有路线或建议时可见）；地点卡上的「去这里的路线」不管这一行开没开都能用。B：包声明了交通网时 `transit` 默认开。C：每个包自己声明图层。 | A：新开关默认关的长期规则不破，规划路线仍然一点即得。B：违反 brief §2.6，改变第一个包的默认样子。C：每个包要写四行图层才得到同样的东西。 | **A** |
| T-11 | 交通网的视觉样式。 | A：用现有积木画主题交通图：城区按功能着色（内核色板，包可覆盖），危险等级体现为描边粗细与虚线，标签里再写一个词；线路走八方向折线，共用路段平行错开，两端有编号徽章；站点为圆点，换乘站为白圈；标签分级：城区 > 换乘站 > 站点 > 徽章；标记已经写了名字的地方不再写站名。B：直线，不画城区。 | A：用户要的视觉目标，用每个包都有的积木搭出来。B：是示意图，不是地图。 | **A** |
| T-12 | 行程沿交通网画。 | A：一段行程的两端都接得上时，沿交通网路径画，不再画弧线；行程自带方式类别时只用该类别的网络方式（`air`、`teleport` 行程从不走网）；保留行程自己的颜色、随时间变淡和点击卡，卡上加「沿交通网（估计）」；接不上的照今天的样子画。B：只在 `transit` 行开着时。C：从不。 | A：行程显示玩家最可能怎么走；什么都没丢（卡上仍写楼层和方式）。B：一个隐藏开关改变行程层。C：没满足用户的要求。 | **A** |
| T-13 | 带功能与危险等级的城区。 | A：放在 transit 块里（`districts`：名称、固定内核清单里的功能、危险 0–3、多边形或「节点 + 半径」、可选节点关联）。B：新的节点字段 `function` / `danger`。C：只做成包图层。 | A：主题交通图是一个块；路线器能说出路线经过的城区有多危险。B：多边形仍要有地方放，自动包的节点也没有多边形。C：路线器和文本都用不上这层意思。 | **A** |
| T-14 | 第一个包的演示交通网。 | A：只做 `tc_mid`：四条悬浮轨道线（卡里中层的公共交通，`docs/card-digest.md` L33、L101；卡里没有线名和站名，所以包只给编号），一条地铁线（地铁口，L103），步行连廊（L102），两条出租悬浮车空中连接（L100）；站只放在已有标记上；城区用这张图自己的城区词，危险等级按「治安随高度递减」（L33）；由工具脚本生成。B：`tc_mid` + `tc_low` 加跨层连接。C：不给第一个包数据。 | A：在用户玩得最多的地方完整演示；地图上不新增任何东西。B：卡里层与层之间没有电梯或井道交通（L117）。C：用户自己的卡里看不到这个功能。 | **A** |
| T-15 | S7「建议路线」操作要用的路线器接口（N7）。 | A：宿主上的纯函数 `routeOp(op, ctx)` 用节点树校验 `{ to, from?, why? }`（名字能定位、两个节点不同、包有交通网），盖上楼层与地图章，每个会话最多留 3 条（20 条消息后过期），放在 `eden-map:ops` 新的可选字段 `routes` 里发出；查看器逐条规划，在 `route-plan` 图层里画成建议（虚线）；建议永远不进宏；「采用这条路线」把它变成用户的路线。S8-4 做接口、字段和绘制，S7 做操作本身。B：宿主完整规划建议。 | A：形状与会话规则同 `OP_CLUE` / `OP_MARKER`；模型永远不会把用户没选的路线写进提示词。B：没有坐标做不到（T-08）。 | **A** |
| T-16 | N8：自动示意图用同一种样式。 | A：隐式示意图视图里排出的子树至少 8 个节点、至少 2 个带子节点的分支时画成主题样式：分支外包络按名字里内核通用词读出的功能着色，分支画成彩色线路，枢纽画成圈，标记标签分级；更小的子树保持今天的素图；显式视图用 `x-style` 选择；不凭空生成交通网（自动包没有路线规划）。B：总是主题样式。C：再合成一张写着名义分钟数的交通网。 | A：地点够多的卡就像目标样式，最小包逐字节不变。B：五个节点的树配上着色色块只是噪声。C：编出来的分钟数会经宏传给模型。 | **A** |

## 1. 范围

S8-4 给 Spatial OS 加上交通网：数据写明有哪些站点、线路、连接和城区；内核在上面规划路线，画成主题交通图，画出规划好
的路线，让行程沿交通网走，并通过现有的 `{{eden_route}}` 宏把路线交给模型。两个实现提示（Sonnet · High）：

- **S8-4a** —— 契约 K-R107、K-R108、K-R109；v2 schema `transit.schema.json`；纯核心：`core/transit-spec.mjs`（校验、修复、
  内核方式、上限）、`core/router.mjs`（图、接入、规划、复核、路线文字、操作接口）、`core/transit-geometry.mjs`（八方向
  路径、错开、交通网与路线的合成积木图层）、`core/thematic.mjs`（功能、色板、危险样式、功能词、包络、主题示意图模型）；
  schema-1 包的叠加层合并；node 单测。不碰 DOM、宿主和包数据。
- **S8-4b** —— 契约 K-R110 … K-R114；内核图层 `transit` 与 `route-plan`；查看器模块（交通网绘制、「去这里的路线」、
  路线卡、重新规划、建议）；行程沿交通网；宿主路线流程（`checkPlan`、会话状态、宏）；消息；第一个包的演示交通网
  （`tc_mid`）；示例包的交通网；主题自动示意图（N8）；探针 `pack_routes`。

S8-4 不做：`OP_ROUTE` 操作本身、它的提示词和 AI 参谋功能卡（S7，N7）；把不适用的图层行置灰（S7）；把自由点站点当目的地
（它不是树里的地点）；时刻表、票价、车辆实时位置；编辑模式里编辑交通网（以后 S9b 的后续：草稿只整块并入 `transit`）；
自动包上的路线规划（T-16）。

## 2. transit 块（K-R107）

### 2.1 形状

```
transit = {
  modes?:     { <modeId>: Mode },     // 按 id 并到内核默认上；合计 ≤ 8
  stations:   Station[],              // 1 … 300
  lines?:     Line[],                 // ≤ 24
  links?:     Link[],                 // ≤ 600
  districts?: District[],             // ≤ 64
  options?:   { transfer_min?, walk_m_per_min?, access_max_min?, detour? },
  style?:     { functions?: { <fn>: { color } }, width?, labels? },
  _…, x-…                             // 注释与作者扩展（K-R04）
}
```

这个块是可选的。没有它的包处处与以前完全相同（没有图层行、没有链接、宏不变）。

### 2.2 交通方式

```
Mode = { label: 字符串 ≤ 24, i18n?: { <lang>: { label } }, trip: 'road' | 'rail' | 'underground' | 'air' | 'teleport',
         color?: 颜色, dash?: 数字[] ≤ 6 }
```

方式 id 符合 `^[a-z][a-z0-9_]{0,15}$`。内核默认（冻结，中性词；名称在核心词典里）：

| id | 名称（zh / en） | 行程类别 | 这种方式的连接默认画法 |
|---|---|---|---|
| `walk` | 步行 / Walk | `road` | 点线，`--muted`，1.2 px |
| `metro` | 地铁 / Metro | `underground` | 实线，线路颜色 |
| `maglev` | 磁悬浮 / Maglev | `rail` | 实线，线路颜色 |
| `air` | 空中 / Air | `air` | 虚线 `[6, 4]`，1.4 px |

包里用内核 id 的一行可以覆盖 `label`、`i18n`、`color`、`dash`（`trip` 保持内核的）；新 id 需要 `label` 和 `trip`。接驳段
（§3.2）一律用 `walk`。

### 2.3 站点

```
Station = { id, node?: 节点 id, view?: 视图 id, at?: [x, y], name?: 字符串 ≤ 40, i18n?: { <lang>: { name } },
            district?: 城区 id, hidden?: 布尔 }
```

- `id` 符合节点 id 的格式 `^[a-z][a-z0-9_]{0,63}$`；节点站建议直接用节点自己的 id。
- **节点站**带 `node`（包里树上的节点）：名字就是节点名，位置是查看器画这个节点的地方（标记锚点，与行程层和节点要素同
  一条路径，K-R81）。
- **点站**带 `view`、`at`（视图宽高的 0..1，K-R31）和 `name`。
- 两者都有：`at` 是在 `view` 上画的位置，`node` 用于接入（§3.2）。
- `hidden: true`：站仍参与规划，但不画点（换乘通道）。
- 修复：节点不在树里、视图不存在、点站没有名字：丢掉这个站（`transit-station-node`、`transit-station-view`、
  `transit-station-invalid`），用到它的停靠和连接一并丢掉。

### 2.4 线路与连接

```
Line = { id, number?: 字符串, name: 字符串 ≤ 40, i18n?: { <lang>: { name } }, mode: 方式 id, color: 颜色,
         stops: 站点 id[]（2 … 80）, min: 数字 | 数字[], loop?: 布尔, oneway?: 布尔, wait?: 数字 }
Link = { from: 站点 id, to: 站点 id, mode: 方式 id, min: 数字, oneway?: 布尔 }
```

- `id` `^[a-z][a-z0-9_-]{0,31}$`；`number` `^[A-Za-z0-9]{1,3}$`（印在徽章上）；`name` 是完整显示名（包自己的说法）；
  `color` 是 `#rrggbb`（线路颜色必须是十六进制，不能是令牌：线路靠颜色区分，照样做 K-R64 复核）。
- `min` 是每一段的分钟数：一个数用于所有段，或 `stops.length − 1` 个数的数组（`loop` 时 `stops.length` 个）。每个值
  0.1 … 600。数组长度不对，整条线丢掉（`transit-line-min`）。
- `loop: true` 补上从最后一站回第一站的一段。
- 写了不存在的站的停靠被删掉（`transit-line-stop`）；剩下不到 2 站的线丢掉。同一条线里一个站只出现一次（环线不重复）。
- `wait`（0 … 30，默认 0）每上一次这条线加一次。
- 连接用一种方式把两个站连起来：步行换乘、单段直达、通道都这样写。除非 `oneway`，连接和线段都是双向。
- **换乘站**（推出来的，从不手写）：有两条以上线路经过的站，或有一条线路经过、并有连接通到另一条线路的站的站。

### 2.5 城区

```
District = { id, name: 字符串 ≤ 40, i18n?: { <lang>: { name } }, view: 视图 id, pts?: [[x, y], …]（3 … 200）,
             node?: 节点 id, r?: 数字, function: 功能, danger?: 0 | 1 | 2 | 3 }
```

- 功能取固定的内核清单：`civic`、`commerce`、`residential`、`industry`、`military`、`religious`、`education`、`medical`、
  `leisure`、`transport`、`nature`、`restricted`、`other`。不认识的值变成 `other`（brief 规则 8）。名称是内核词（zh / en，
  可以经清单 `strings` 覆盖）。
- 形状：`pts`（视图坐标系里的多边形），或 `node` + `r`（绕节点画的位置画圆，`r` 是宽度的比例，默认 0.06）。只有
  `node` 没有 `pts` 时，这个节点必须画在 `view` 上。
- `node` 同时告诉路线器哪些站在这个城区里（节点在它里面的站）；`Station.district` 直接写明时以它为准。
- `danger` 0（默认）… 3：绘制会标出来（§4.2），路线会报告它经过的最高危险等级（§3.4）。

### 2.6 选项、上限与信任

| 选项 | 范围 | 默认 | 含义 |
|---|---|---|---|
| `transfer_min` | 0 … 30 | 3 | 乘过车后换另一条线时加的分钟数 |
| `walk_m_per_min` | 20 … 200 | 80 | 接驳段与直接步行的步速 |
| `access_max_min` | 0 … 60 | 12 | 最长的步行接驳段；0 = 只按节点接入 |
| `detour` | 1 … 2 | 1.25 | 直线距离 × 绕行系数 = 步行距离 |

`style`：`functions.<fn>.color` 覆盖某功能在内核色板里的颜色（十六进制或内核令牌，K-R58）；`width` 2 … 8 px（线宽，默认
4）；`labels`（默认 true）画城区和站点标签。

所有包同样的上限，运行时宽松、工具严格（K-R06）：§2.1 的数量，每条线 80 站，每个城区 200 个点，这个块 ≤ 256 KB 的 JSON
（文件形式的块按文件算）。外来包（K-R63）可以用同样的上限声明交通网。每个字符串都以纯文本进页面；每个颜色、数字和 id
都在运行时复核（K-R64）。问题码以 `transit-` 开头，列在 `fromV1(…).problems` 或 `validate2(…).problems` 里。

### 2.7 这块放在哪里（K-R108）

- schema-2 包：顶层块 `transit`（内联，或像别的块一样由 `resolveBlocks` 解析的相对路径）；`validate2` 用包的信任级别和
  它的节点、视图 id 跑 `normTransit`。
- schema-1 包：`overlay.v2.json` 可以带 `transit`；`compat-v1` 的 `fromV1` 在视图建好后跑 `applyOverlayTransit(overlay,
  { nodes, views })` 并设 `pack.transit`（schema-1 包没有转换出的交通网；叠加层的块整块采用，修复后用，从不合并）。
  `tools/check_overlay.mjs` 严格检查它。
- 查看器读 `RT.transit`（`app/nodes-runtime.mjs`），宿主读 `geo.transit`（`core/event-geo.mjs` 的 `makeGeo` 带着它，
  `geoFromV1` 和宿主的 v2 运行时都一样）。每个包只建一次图（`buildGraph`）。
- `llm.templates.<lang>` 新增三个可选键用于路线文字：`route_plan`、`route_leg`、`route_danger`（§5.3）。

## 3. 路线器（K-R109）

### 3.1 图

`buildGraph(transit)` → `{ stations, lines, modes, options, adj, linesAt, interchanges, order }`。每个线段变成乘车边
`{ to, kind: 'ride', mode, line, min }`（除非 `oneway`，双向），每个连接变成连接边 `{ to, kind: 'link', mode, line: null,
min }`。邻接表保持声明顺序（先按线路顺序的线段，再按连接顺序的连接）；这个顺序是最后的平手规则。

### 3.2 接入一个地点

`attach(graph, end, env)` 对 `end = { node?, pos? }` 返回 `[{ station, min, how }]`：

1. `at` —— `node` 就是这个端点节点的站（0 分钟）；
2. `inside` —— 否则，节点是端点节点祖先的站（地点在某个站的地点里面；最近的祖先胜；0 分钟）；
3. `within` —— 否则，节点是端点节点后代的站（地点是里面有站的城区或建筑；全部算上，0 分钟）；
4. `walk` —— 否则，给了 `env.pos` 和 `env.extent`、且端点在一个有米制范围（`view.extent_m`）的视图上有位置时：同一视图
   上步行分钟 `距离_m × detour / walk_m_per_min` 不超过 `access_max_min` 的站，近的在前，最多 4 个；
5. 都没有 → `[]`：这个地点不在交通网上。

宿主不传坐标，所以只按节点接入（第 1–3 步）。两端解析到同一节点、或一端在另一端里面时没有路线（`planRoute` 返回
`null`；查看器不显示链接）。

### 3.3 代价、平手与确定性

在状态 `(站点, 当前线路或无, 是否已乘过车)` 上跑 Dijkstra；一个虚拟起点连到所有起点候选（代价 = 它们的接驳分钟），一个
虚拟终点连到所有终点候选。

- 乘 L 线的边：+ 该段分钟；L 不是当前线路时：+ `wait(L)`，路径之前乘过车时再 + `transfer_min`；
- 连接边：+ 它的分钟；当前线路变为无；
- 方式过滤（`opts.modes`）去掉其他方式的乘车边与连接边；接驳段总是步行；
- 两端都在同一视图上有坐标时，**直接步行**也是候选：`距离 × detour / walk_m_per_min`，不超过 `2 × access_max_min` 才算；
  不比最好的交通网路径慢时它胜出。

优先级：总分钟，再换乘次数，再停靠站数，再插入序号（声明顺序）。同样的输入总给同样的路线。300 站 × 25 个线路状态远低
于任何时间预算，不需要缓存。

### 3.4 路线

```
Plan = {
  v: 1, src: 'user' | 'op',
  from: { node: id | null, station: id | null, name },      // name：用户看到的地点
  to:   { node: id | null, station: id | null, name },
  legs: [ { kind: 'walk' | 'ride' | 'link', mode, line: id | null, stops: 站点 id[], min } ],
  min, changes, modes: 方式 id[], danger: 0..3 | null
}
```

- 同一条线上连续的乘车边合成一个 `ride` 段（`stops` = 乘坐顺序里的每一站）；同一方式连续的连接边合成一个 `link` 段；接驳段是
  `walk`，`stops` = `[站点]`（它到达或离开的站）；直接步行是一个 `stops: []` 的 `walk` 段。
- 换乘与候车分钟不是段；它们算在 `min` 里。
- `min` = 各段 + 换乘 + 候车，取整到分钟，至少 1；每段的 `min` 保留一位小数。
- `changes` = 乘车段数 − 1（没乘车时为 0）。
- `modes` = 各段方式去重后按顺序。
- `danger` = 路径上每个站所在城区的最高危险等级（按 `Station.district`，否则按 `node` 是该站节点或其祖先的城区），一个都不
  知道时为 `null`（小镇路线 旧堡 → 灯塔 的危险等级为 1：灯塔岬）。

### 3.5 接口

`core/router.mjs` 里的纯函数（不碰 DOM、宿主全局和存储）：

| 函数 | 返回 | 谁用 |
|---|---|---|
| `buildGraph(transit)` | Graph \| null | 查看器、宿主 |
| `attach(graph, end, env)` | Attach[] | `planRoute`、查看器的链接 |
| `planRoute(graph, from, to, { env, modes, src })` | Plan \| null | 查看器（用户路线、建议、行程） |
| `checkPlan(graph, plan, { tree })` | Plan \| null | 宿主（T-08） |
| `planText(plan, { lang, templates, nameOf, modeLabel, lineName })` | 字符串 | 宿主的宏、查看器的卡 |
| `routeOp(op, { graph, locate, here, floor, map })` | `{ from, to, fromNode, toNode, why, floor, map }` \| null | S7 宿主操作（T-15） |

`checkPlan` 只在以下全部成立时接受一条路线：`v === 1`；每段的站都存在；乘车段的停靠在它的线路上相邻，且方向被 `oneway` /
`loop` 允许；连接段的站之间有该方式的连接；各段首尾相接（一段的最后一站是下一个乘车或连接段的第一站；接驳步行段接触下一段
或上一段的站）；`from` / `to` 里给的 `node` 在树里存在。它按交通网重算乘车与连接段分钟，把每个步行段限在 `access_max_min`
以内（直接步行为两倍），重算 `min`、`changes`、`modes`、`danger`，并丢掉查看器发来的所有名字（名字按树和站点重建）。其余
→ `null`。

`routeOp` 校验一行操作 `{ to: 字符串 1…40, from?: 字符串 1…40, why?: 字符串 ≤ 60 }`：`to`（以及 `from`，默认当前位置
`here`）必须能经 `locate` 定位到节点，两个节点不同且互不包含，图存在；结果带两段原文、两个节点、原样的 `why`、`floor`、
`map`。

## 4. 绘制：主题交通图（K-R110）

### 4.1 内核图层

`KERNEL_LAYERS`（`core/layer-defaults.mjs`）新增两条内核声明：

| id | 槽 | kind | type | order | 菜单 | applies | 默认 |
|---|---|---|---|---|---|---|---|
| `transit` | `routes` | `osd` | `line` | 2 | order 32，`transit.layer`「交通网」/ "Transit network"，提示 `transit.layer_title` | `{ data: true }`（打开的视图上有站、城区或指引） | **关**（`edenMapLayers`，T-10） |
| `route-plan` | `trips` | `osd` | `line` | 1 | 无（`hidden`） | `{ data: true }`（路线或建议在打开的视图上有路段） | 有数据时开 |

两者都只经 S8-2 的积木画（用 `core/transit-geometry.mjs` 生成的合成图层声明调 `drawOverlay`）；都没有自己画像素的代码。
包可以像调整任何内核图层一样调整这两行（K-R79：名称、`applies`、图例、`off`）。图例页经 K-R84 拿到 `transit` 图层的行
（打开的视图上出现的每种功能一行、每个危险等级一行、每条线路一行）。

### 4.2 城区

- 每个城区一个 `area` 要素，kind `d-<功能>-<危险>`；填色 = 功能颜色（包覆盖的优先，否则内核色板），`fill_opacity` 0.16；
  描边按危险：0 = 填色同色 0.8 px 实线；1 = `--gold` 1.2 px `[6, 4]`；2 = `--alert` 1.6 px `[6, 3]`；3 = `--alert` 2.4 px 实线。
- 在多边形重心（圆：圆心）放一个 `label` 要素：`<名称> · <功能名>`，危险 1–3 再加 ` · <危险词>`（`注意 / Caution`、
  `危险 / Danger`、`极危 / Extreme`）；字号 `body`，`plain`：标签层级的最上层。

内核色板（十六进制；S8-4a 的测试检查色觉可分辨，有 `core/cvd.mjs` 就用它，否则用固定的两两距离）：`civic #6c8ebf`、
`commerce #e0a64b`、`residential #8fb86a`、`industry #9a8f86`、`military #b5654f`、`religious #c9b25e`、`education #5aa9a1`、
`medical #d97a9a`、`leisure #a685d1`、`transport #7f9fb3`、`nature #5f9f63`、`restricted #c05050`、`other #8a919b`。

### 4.3 线路、站点、换乘站

- **线路**：打开的视图上每一段画一个 `line` 要素，kind `l-<线路 id>`，颜色 = 线路颜色，宽 `style.width`，`halo: true`。两站
  之间走**八方向**折线：水平、竖直或 45°，一处折点放在靠近上一站的一端（在方形坐标系里算：`y × aspect`）。k 条线共用的一段
  按线路声明顺序，各自垂直于线段错开 `(i − (k − 1) / 2) × 0.004` 个宽度（错开量是地图单位，放大时会变宽：接受）。
- **连接**：每个连接一个 `line` 要素，kind `k-<方式 id>`，用该方式的画法（§2.2）。
- **指引**：另一端在别的视图上的乘车边或连接边，在本站画一个 `label` 要素：`→ <另一站名> · <另一视图标题>`，字号 `micro`，
  `chip`。
- **站点**：每个可见站一个 `point` 要素，kind `s`（大小 7，填 `--map-label-ink`，积木自带描边），换乘站 kind `x`（大小 11，
  白色，积木描边成圈）。站点不可点；下面的标记仍是点按目标。
- **徽章**：每条线在本视图的首站和末站各放一个写线路 `number` 的 `label` 要素（环线：只在首站放一次），kind `n-<线路 id>`，
  字号 `small`，`chip`，新样式键 `badge: true`（S8-4b 修订 K-R80）：胶囊底色是要素颜色（`--lc`），字色按对比度选（浅色上用深字）。

### 4.4 标签层级

| 级 | 内容 | 积木样式 |
|---|---|---|
| 1 | 城区名 | `label`，字号 `body`，`plain` |
| 2 | 换乘站名（点站，或本视图上没有标记的节点站） | `label`，字号 `small`，`chip` |
| 3 | 其他站名（同一规则） | `label`，字号 `micro`，`plain` |
| 4 | 线路徽章与指引 | `label`，字号 `small` / `micro`，`chip` |

节点在打开的视图上已经有标记标签的节点站不再写站名（一个地方只留一个名字）。每次画完都跑现有的标签避让（`declutter`）。
`style.labels: false` 去掉第 1–3 级。

### 4.5 规划好的路线

`route-plan` 画路线里落在打开视图上的路段：乘车段沿线路同样的八方向路径（线路颜色，宽 `style.width + 3`，带光晕），连接段用
方式画法加宽 1，步行段 `--accent` 2 px 点线；点：起点（kind `p-start`，`--ok`，大小 12），终点（`p-end`，`--alert`，大小 12，
`pulse`），每个换乘站（`p-change`，白圈，大小 12）。建议（`src: 'op'`）的线画成 `[8, 6]` 虚线、不透明度 0.8、不脉动。离开
打开视图的路段结尾画一个指引 `→ <视图标题>`。

## 5. 规划路线（K-R111）

### 5.1 在查看器里

- **链接。** 地点卡打开时（`showCard`，卡片插件的 `decorate` 模式），路线视图把当前位置（`#here`、`hereRes`）和卡上的地点
  解析成两端（`{ node, pos }`），跑 `planRoute`，有路线时在卡上加一个链接：`路线 · 约 {min} 分钟` / `Route · about {min}
  min`（`rt.link`）。没有路线 → 没有链接、没有提示（brief 规则 6）。
- **选定。** 点击（或回车）设定路线（`src: 'user'`），画出来，打开路线卡，发 `eden-map:route-plan { plan }`。路线卡：标题
  `<起点> → <终点>`；副标题 `约 {min} 分钟 · 换乘 {changes} 次`（`rt.sub`）；路段列表（线路颜色的徽章、线路名或方式名、
  `起 → 止`、站数、分钟；换乘单独一行）；`danger ≥ 2` 时一行危险提示（`rt.danger`）；一个「清除路线 / Clear route」链接
  （`rt.clear`），清掉并发 `eden-map:route-plan { plan: null }`。
- **坐标。** 站点或地点在非当前视图上的坐标，经 JSON 缓存（`getJSON`）读那个视图的点位文件，所以规划是异步的；路线算好时
  链接才出现。
- **重新规划。** 有用户路线时 `eden-map:here` 变了：新位置是路线终点（它的节点或在它里面）→ 清掉路线（到站）；否则从新位置
  到同一终点重新规划、替换并发出；从那里没有路线 → 路线保持原样。
- **回传。** 宿主发来的 `eden-map:route { plan }` 替换本地路线（宿主那份是真相）；`null` 清掉。没有宿主（独立查看器）时本地
  路线保留。

### 5.2 消息与宿主

| 消息 | 方向 | 字段 | 含义 |
|---|---|---|---|
| `eden-map:route-plan` | 查看器 → 宿主 | `plan: object?` | 用户选定（或清除，`null`）了一条路线 |
| `eden-map:route` | 宿主 → 查看器 | `plan: object?` | 宿主持有的路线（`checkPlan` 之后），或 `null` |
| `eden-map:ops` | 宿主 → 查看器 | + `routes: array?` | 建议（§7） |

宿主（`tavern/route-flow.mjs`，只在会话里，什么都不落盘）：

- 收到 `eden-map:route-plan`：用 `geo.transit` 的交通网跑 `checkPlan(graph, plan, { tree })`；通过 → 以 `at = floorNow`、
  `src: 'user'` 持有并回传；被拒 → 持有的路线不变并回传；`null` → 清掉并回传；
- 每次位置变化（入口已经发出 `here` 的地方）：位置节点就是路线终点或在它里面 → 清掉（查看器开着时回传 `null`）；
- 每一轮消息：`floorNow − at > 20` → 清掉；
- 换聊天：清掉；收到 `eden-map:ready`：再发一次持有的路线。

### 5.3 `{{eden_route}}`

宿主给 `eden_route` 的宏值变成 `last + (last && plan ? ' · ' : '') + (plan ? planText(plan) : '')`，其中 `last` 与今天完全
相同（玩家最近一段行程 `起 → 止`，或 `''`）。没有持有路线时输出与今天逐字节相同。`planText` 用包的模板（包的语言；内核默认见
下表）填写，各段用 `；`（zh）或 `; `（en）连接，`danger ≥ 2` 时再接 `route_danger`：

| 键 | zh 默认 | en 默认 |
|---|---|---|
| `route_plan` | `计划路线：{legs}。全程约 {min} 分钟，换乘 {changes} 次。` | `Planned route: {legs}. About {min} min in all, {changes} change(s).` |
| `route_leg` | `{from} → {to}（{how}，约 {min} 分钟）` | `{from} → {to} ({how}, about {min} min)` |
| `route_danger` | `途经危险区域（等级 {danger}）。` | `Passes a dangerous district (level {danger}).` |

`{how}` = 乘车段写线路名，连接段与步行段写方式名；名字是包里的名字（不套用用户自定义的叫法：宏带包里的名字，和今天行程前半
一样）。宏仍在原来的开关后面（设置，`edenMapMacros`，默认关）。

## 6. 行程沿交通网（K-R112）

行程层画的每段行程（玩家与人物，`eden-map:trips`），在包有交通网且两端都接得上时（§3.2，带坐标）：用 `modes` = `trip` 类别
等于这段行程 `mode` 的网络方式规划（行程没有方式时用全部方式）；`air`、`teleport` 类的行程从不走网。有路线 → 行程的折线就是
路线在打开视图上的路径（同样的八方向几何），画在原来的 `svg.trip` 元素里，保留行程自己的类名（`hist`、`m-<mode>`、`ch`）、
颜色、不透明度和点击目标（路径中点）；它的卡上加一行 `沿交通网（估计）` / `Along the transit network (estimated)`
（`tr.along`）。没有路线或有一端接不上 → 照今天的弧线，不变。途中弧线（`renderTransit`）不走网。

## 7. AI 参谋的建议路线（K-R113）

S7 的操作（N7）将在宿主上经 `routeOp`（§3.5）产出行；S8-4b 已经把它们送达并画出来：

- 宿主每个会话最多留 3 条建议，每条盖 `{ floor, map }` 章，20 条消息后过期，换聊天清掉，放在 `eden-map:ops` 的 `routes` 里
  与 `clues`、`markers` 并列发出（可选字段：旧查看器忽略它）；
- 查看器逐条规划（`planRoute(from: fromNode, to: toNode, src: 'op')`，坐标同用户路线），在 `route-plan` 里画成建议（§4.5）；
  点它的终点打开一张卡：`建议路线 / Suggested route`，原样的 `why`、路线摘要，和「采用这条路线 / Use this route」（`rt.adopt`），
  采用后它成为用户的路线（§5.1）；
- 建议永远不进 `{{eden_route}}`、聊天或任何存储。

## 8. 自动包的主题示意图（K-R114，N8）

`core/schematic.mjs` 与 `core/pack-v2-view.mjs`（S9-1，K-R97）新增主题变体：

- **何时。** 隐式示意图视图（K-R96）排出的子树至少 8 个节点、至少 2 个分支（分支 = 主人节点的一个在布局里至少有一个子节点的
  子节点）→ 主题样式。否则保持今天的素图，逐字节相同。显式示意图视图用 `x-style: "thematic" | "plain"` 选（默认 plain）。
- **功能。** 每个分支取它的节点名字里多数指向的功能，靠内核通用功能词（`core/vocab.mjs` 的 `FUNCTION`，zh 与 en，只用通用词——
  市场、医院、军营、神殿……；平手按功能清单顺序；都没有：`other`）。
- **图**（仍是不含任何文字的 SVG 数据 URL，K-R97）：每个分支一个由它的节点位置构成的凸包，外扩 0.04，用功能颜色 0.16 填充；
  分支内的父子边画成一条彩色线路（8 色线路色板按分支顺序，宽 6）；分支外的边像今天一样画灰；枢纽（有子节点的节点）画白圈（r 9，
  深色描边），叶子画圆点（r 6）。
- **标签。** 投影出的标记带 `rank`：分支节点 1，其他枢纽 2，叶子 3；`app/markers.mjs` 把它写成标记元素的 `data-rank`；三条
  CSS 规则（由交通视图的样式注入）定标签大小：1 级 `--fs-body` 粗 700，2 级 `--fs-small`，3 级 `--fs-micro`、不透明度 0.85。
- 不给自动包编交通网（T-16）；交通网图层在那里不适用。带 `transit` 块的 schema-2 包在它的示意图视图上照样画交通网（节点站：
  投影出的标记）。

## 9. 第一个包的演示交通网（tc_mid）

数据写进 `map/packs/eden/overlay.v2.json` 的 `transit`，由 `tools/gen_eden_transit_s84.mjs` 从 `map/data/tc_mid.json`（坐标）
生成，分钟数跟着地图走。卡的依据（`docs/card-digest.md`）：中层由悬浮轨道串联，是主要的公共交通，「四通八达」，单程 2–5 Æ，
没有线名和站名（L33、L101）；地铁口出现过一次（L103）；步行连廊（L102）；出租悬浮车（L100）；治安随高度递减（L33）。站只放在
已有的 `tc_mid` 标记上（节点站，id = 节点 id）。

方式（包里覆盖；名称在包数据里）：`maglev` → 悬浮轨道 / en "Maglev rail"；`metro` → 地铁 / "Metro"；`air` → 出租悬浮车 /
"Hover taxi"；新增 `walkway`（行程类别 `road`，虚线 `[1, 4]`）→ 步行连廊 / "Skywalk"。

| 线路 | 编号 | 方式 | 颜色 | 停靠站（标记 id） |
|---|---|---|---|---|
| `l1` | 1 | maglev | `#e8b33a` | barracks_ring, military_academy, storm_hall, enforcement_hq, reserve_office, admin_council, schneider_clinic, victoria_apartment, mid_care_home |
| `l2` | 2 | maglev | `#3fa7d6` | starabyss_univ, mage_tower, enforcement_hq, executive_office, council, old_apartment, merc_guild, checkpoint_c |
| `l3` | 3 | maglev | `#59b36b` | butler_academy, mid_hospital, tiancheng_univ, admin_council, culture_office, merc_guild, rebirth_workshop |
| `l4` | 4 | maglev，`loop` | `#b07cd8` | iron_cradle, butler_academy, radiance_cathedral, supreme_court, victoria_apartment, mid_care_home, mid_monastery, schneider_clinic, tiancheng_univ, mid_hospital |
| `m` | M | metro | `#e0736a` | knights_camp, rebirth_workshop, old_apartment, council, culture_office, mid_monastery |

线路名（包数据）：`悬浮轨道 1 号线` … `悬浮轨道 4 号线（环线）`、`地铁 M 线`；en "Maglev Line 1" … "Maglev Line 4 (loop)"、
"Metro Line M"。连接：`walkway` reserve_office–executive_office、executive_office–council、tiancheng_univ–supreme_court、
mid_monastery–mid_care_home；`air` enforcement_hq–victoria_apartment、checkpoint_c–enforcement_hq。分钟数（取到 0.5，至少 1；
`d` = 按地图范围 3000 × 1875 算出的米数）：maglev `1 + d / 400`，metro `1 + d / 350`，walkway `d / 70`，air `2 + d / 600`。

城区（这张图自己的城区词；多边形由执行者按所列标记的外扩凸包画，再在屏幕上调到互不重叠）：

| id | 名称 | 功能 | 危险 | 标记 |
|---|---|---|---|---|
| `core` | 核心区 | civic | 0 | enforcement_hq, reserve_office, executive_office, admin_council, council, culture_office, storm_hall |
| `high` | 中层高区 | residential | 0 | radiance_cathedral, iron_cradle, supreme_court, victoria_apartment, mid_hospital, butler_academy, schneider_clinic, tiancheng_univ, mid_monastery, mid_care_home |
| `rim` | 外围 | military | 1 | barracks_ring, military_academy, knights_camp |
| `low` | 中层低区 | industry | 2 | rebirth_workshop, old_apartment, merc_guild, checkpoint_c |

英文城区名写进 `i18n.en.name`（Core district、Upper mid tier、Outer rim、Lower mid tier）。第一个包别的数据都不变；不新增标记、
模型或世界书条目（没有地点变化，所以不重建世界书附加条目）。

## 10. 验收：小镇交通网与探针 pack_routes

`map/packs/town/overlay.v2.json` 新增（确切数据见 S8-4b 说明）：方式 `tram`（山道电车 / Hill tram，类别 `rail`）与 `cable`
（缆车 / Funicular，类别 `rail`）；五个标记上的站加一个 `town_harbour` 上的点站 `pier`（栈桥 / Pier）；1 号线 `cable` 集市 → 鱼市
（跨视图，4 分钟），2 号线 `tram` 旧堡 → 集市 → 钟楼（3、2 分钟）；步行连接 鱼市–栈桥 2、栈桥–灯塔 3、钟楼–旧堡 4；城区 旧城
（civic，0，`town_hill` 上的多边形）、鱼市仓库（commerce，2，`town_harbour` 上危险区域那块多边形）、灯塔岬（nature，1，绕灯塔节点
的圆）。

预期路线：旧堡 → 灯塔 = 电车 3 + 换乘 3 + 缆车 4 + 步行 2 + 3 = **15 分钟，换乘 1 次**；钟楼 → 鱼市 = 电车 2 + 换乘 3 + 缆车 4 =
**9 分钟，换乘 1 次**；灯塔 → 旧堡 = 15 分钟（双向一致）。

探针 `tools/browser/pack_routes.mjs`（S8-4b）在小镇上检查：`transit` 行存在且未勾；勾上后山上视图有城区、两条线的路径、集市的
圈（换乘站）、徽章「2」、集市通往码头的指引；码头视图有栈桥标签、没有电车；当前位置在旧堡时灯塔卡上有写着 15 分钟的路线链接；
点它画出路线（起点、终点、一个换乘点），宿主桩收到 `eden-map:route-plan`；回传 `eden-map:route` 为 `null` 时清掉；桩发来的
一段 钟楼 → 旧堡、方式 `rail` 的行程沿电车画（是路径，不是弧线）；桩发来的带一行 `routes` 的 `eden-map:ops` 画出一条虚线建议，
「采用这条路线」把它变成路线；第一个包只在 `tc_mid` 上显示 `transit` 行，未勾；路线卡在 375 px 下截一张图。

## 11. 一致性

- 第一个包，没有路线，`transit` 行关着（默认）：地图样子不变，除了（a）`tc_mid` 上图层菜单里新的 `transit` 行（未勾）和隐藏的
  `route-plan` 登记，（b）当前位置接得上时 `tc_mid` 地点卡上的路线链接，（c）`tc_mid` 站点之间的行程沿交通网画。三者都只增加
  信息；每项都在测试或探针里钉住，并合成一个 Q 项（brief §3）。
- 注入文字都不变：没有路线时 `{{eden_route}}` 逐字节相同（node 单测），状态行、空间契约和世界书附加条目不碰。
- 最小包的示意图逐字节相同（5 个节点，低于门槛）。自动包的图只在门槛以上变化（钉住，归入上面同一类 Q 项）。

## 12. 内核契约的新增（计划）

在 `docs/kernel-schema.md` §13（「S8-4 计划」）预留；全文随实现它的步骤落地：

| 编号 | 规则 | 小节 | 步骤 |
|---|---|---|---|
| K-R107 | transit 块：方式、站点、线路、连接、城区、选项、样式、上限、修复 | §9（图层规则之后） | S8-4a |
| K-R108 | schema-1 包的叠加层可以带 `transit`；查看器与宿主从哪里读；路线文字模板 | §13 | S8-4a |
| K-R109 | 路线器：图、接入、代价与平手、路线、`checkPlan`、`planText`、`routeOp` | §9 | S8-4a |
| K-R110 | 内核图层 `transit` 与 `route-plan`；主题绘制与标签层级；`badge` 样式键 | §9 | S8-4b |
| K-R111 | 规划路线：链接、路线卡、重新规划、两条消息、宿主的会话状态、`{{eden_route}}` | §10.2 | S8-4b |
| K-R112 | 行程沿交通网 | §9 | S8-4b |
| K-R113 | 建议路线：`eden-map:ops.routes`、绘制、采用；与 S7 的分工 | §9 | S8-4b |
| K-R114 | 隐式视图的主题示意图；功能词；标记分级 | §4.6 | S8-4b |

## 13. 步骤计划

| 步骤 | 大小 | 提示 | 内容 |
|---|---|---|---|
| S8-4a | L（一个提示，约 5 小时） | 附录 S8-4a | 契约 K-R107–K-R109、schema、`transit-spec`、`router`、`transit-geometry`、`thematic`、叠加层合并、`validate2` 与检查工具里的校验、node 单测 |
| S8-4b | L+（一个提示，约 7 小时） | 附录 S8-4b | 契约 K-R110–K-R114、内核图层、查看器与宿主模块、消息、宏、行程、第一个包与小镇的数据、主题示意图、探针 `pack_routes` |

顺序：严格 S8-4a → S8-4b。S7（并行设计）在 S8-4b 之后实现 `OP_ROUTE` 操作；它只调 `routeOp` 并填 `eden-map:ops.routes`。

## 14. 风险

- **坐标是异步的。** 别的视图上的地点要读那个视图的点位文件；链接在卡片出来后稍等一下才出现。JSON 缓存让第二张卡立刻出现。
- **第一个包上的视觉噪声。** 交通网叠在渲染出来的城市上；`transit` 行默认关，城区填色很淡（0.16）。执行者在 100 % 和适配缩放
  下看一眼 `tc_mid`，可以在包的 `style` 里调低填色或调细线（只改数据）。
- **行程换形状。** 数 `svg.trip` 元素的探针照常工作（一段行程一个元素）；读路径数据的探针要接受走网行程的折线（`trips095` 用的是
  `air` 行程，从不走网）。
- **文件上限。** `trips-view.mjs`（105 行，账本里 2 处内联样式）和 `markers.mjs`（2 处内联样式）的账本计数不能涨；`eden-map.js`
  （675，账本）不能变长：宏搬进 `tavern/route-flow.mjs`。
- **并行的设计者。** S7 不占 K-R 编号；S8-4 占 K-R107–K-R114。`docs/kernel-schema.md` §13 与 `docs/todo.md` 上 rebase 冲突时两边
  都保留。
- **功能词里的卡片词。** 内核功能词必须是通用词；S8-4a 的测试拿看门狗的卡片词表过一遍，命中的词去掉。

## 附录：可执行的步骤说明

下面两个提示以英文版为准（执行者是 Sonnet · High，只看仓库就够）；这里是摘要。行号以 origin/preview `df3b5f6d`（head #239）为准。

### S8-4a — 交通契约、schema 与纯核心（路线器、几何、主题）

Sonnet · High · L（约 5 小时）。写 K-R107–K-R109；新 schema `map/data/schema/v2/transit.schema.json` 并接进清单 schema、
`pack-v2-spec.mjs` 的 `BLOCKS`（加 `transit`）与 `llm` 模板（加 `route_plan`、`route_leg`、`route_danger`）、`validate2` 与
`crossCheck`、`overlay-v2.mjs` 的 `applyOverlayTransit`、`compat-v1.mjs`、`check_overlay.mjs`、`check_pack.py`；新纯模块
`core/transit-spec.mjs`（≤ 250 行）、`core/router.mjs`（≤ 300 行）、`core/transit-geometry.mjs`（≤ 250 行）、`core/thematic.mjs`
（≤ 150 行），`core/vocab.mjs` 加通用功能词 `FUNCTION`（过看门狗）；单测 `transit_spec`、`router`（小镇数字 15 / 9 / 15 分钟、
接入四步、方式过滤、直接步行、确定性、`checkPlan` 拒收与重算、`planText`、`routeOp`）、`transit_geometry`、`thematic`、
`overlay_transit`；ARCHITECTURE 与 naming 文档（+ zh）登记新模块与术语；不碰查看器、宿主和包数据；无浏览器探针。两个提交，
推送一次；RESULT 加 `router:`、`files:`、`K-R:` 三行。

### S8-4b — 交通图层、路线规划、行程、宏、演示交通网、主题示意图

Sonnet · High · L+（约 7 小时）。写 K-R110–K-R114 并修订 K-R80（`badge`）；内核图层 `transit`（默认关）与 `route-plan`；
新模块 `app/transit-env.mjs`、`app/transit-view.mjs`、`app/route-plan-view.mjs`、`tavern/route-flow.mjs`（宏从 `eden-map.js`
搬过来，`eden-map.js` 不能变长）；`core/event-geo.mjs` 带 `transit`；协议新增 `eden-map:route-plan`、`eden-map:route` 与
`eden-map:ops.routes`；行程沿交通网（`trips-view.mjs` 账本不涨）；建议路线的查看器一侧；主题示意图（最小包逐字节不变）；
生成器 `tools/gen_eden_transit_s84.mjs` 写第一个包 `tc_mid` 的交通网；小镇交通网（数据全文在英文版）；新探针 `pack_routes`；
`FREEZE_MAPS` 只包住改地图数据的那个提交；一致性：`layer_dump` 只多两条内核行，`trips095`、`pack_minimal` 不变，`autopack`
只可能多出主题图（钉住，归一个 Q 项）；todo 里 N6、N8 划掉，N7 记上「接口与送达已就绪，操作归 S7」。四个提交，推送两次。
