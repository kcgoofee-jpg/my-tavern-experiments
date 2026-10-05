# 声明式图层：layers 块、绘制积木、数据来源与扩展（S8 设计）

> 中文版；以英文版 `docs/layers-schema.md` 为准（两边标题结构相同，由 `tools/check_zh_mirror.py` 把关）。本文是计划步骤
> **S8-design** 的产出（计划 `docs/plans/spatial-os.md` §5 阶段 C 的 S8、§16：I-04 叠加事件 → S8，E-03 → S8；
> `docs/todo.md` Q-01）。状态：**设计稿，工作决定已按默认生效**（2026-10-01 你不在：下面审阅表的每条推荐都是工作决定，
> 你可以推翻任何一条）。本文不改代码。它给内核契约新增的规则预留为 **K-R79 … K-R89 与 K-R104**（`docs/kernel-schema.md` §13
> 「S8 计划」），全文随附录里的步骤说明（S8-1 … S8-3）落地。文中关于现有代码的说法都在 origin/preview `7958b5ad`
> （head #207）核对过。

## 0. 审阅表（L-01 … L-15）

每行一个真正的决定。「工作决定」= 推荐项，2026-10-01 按默认生效（自动驾驶）。同一份清单逐行写在 `docs/todo.md` §3。

| 编号 | 问题 | 选项 | 后果 | 推荐（工作决定） |
|---|---|---|---|---|
| L-01 | 第一个包现有的图层怎么搬到声明式机制上？ | A：每层的「事实」（槽位、顺序、菜单行、默认开关、适用范围、图例）变成内核声明，绘制全部留在原模块里当内核提供者。B：每层都改写成通用积木的配置。C：所有层先按 A 做；另外三层的绘制本来就是积木（航线 → `line`、车流 → `flow`、天气 → `particles`），改由从它们自己模块里原样抽出的积木渲染器来画。 | A：没有视觉风险，但积木是没人用过的新代码。B：迷雾、纵深霾、云、视野锥、藏物带着行为（探索、滤镜、潜行判定、拾取），积木表达不了，像素一致也证明不了。C：同一份代码搬家，输出必然相同，用绘制调用录制来证明；包用到的积木就是第一个包每天在跑的那几块。 | **C** |
| L-02 | 包怎么调整内核自带的图层？ | A：在同一个 `layers` 数组里写：id 等于内核图层 id 的行，只能改该层的菜单文字和顺序、`applies`、`legend`，或者 `off` 关掉；槽位、类型、来源、样式仍归内核。B：另开一张 `layers_kernel` 表。C：不许改。 | A：一张表一个顺序；什么都不改的包零成本（第一个包不声明任何图层，保持原样）。B：要看两个地方。C：没有航线的包永远挂着一行没用的「航线」。 | **A** |
| L-03 | 「沿线移动」积木叫什么？ | A：沿用 K-R56 预留、`layers.schema.json` 里已有的 `flow`；词汇表注明「flow = 沿线移动」。B：改名 `path-motion`。 | A：schema 不动。B：白改一个预留枚举值。 | **A** |
| L-04 | `flow` 图层要不要把它走的那条线也画出来？ | A：`flow` 只画移动的光点；可选的 `style.path`（线样式）在同一层里先画底下的折线。B：巡逻路线一律拆成两层（`line` + `flow`）。 | A：用户看到的一件东西只占一行菜单；第一个包的车流层（只有光点）就是不带 `path` 的 `flow`。B：两行要一起开关。 | **A** |
| L-05 | 声明的要素用什么坐标？ | A：打开的视图的画框（宽高各 0..1，内核 K-R31），配要素自己的 `view`；或者写 `node` 引用，画在当前地点引擎画这个节点的位置。B：按视图范围的米数。C：只许引用节点。 | A：和包里的标记、航线用同一套数字；零代码作者可以直接从查看器里抄。B：不是每个视图都有范围。C：画不了线和区域。 | **A** |
| L-06 | `applies` 分工（S7 负责把不适用的图层灰掉、暂停动画） | A：S8 管数据形式、纯求值函数和 `registry.applicable(id, ctx)`；S7 管菜单行变灰和 rAF 暂停。如果 S8-2 运行时 S7 还没落地，不适用的包声明图层行先隐藏——和今天航线行没有航线时隐藏一样。B：S8 把变灰也做了。 | A：不重叠，S7 / S8 谁先谁后都行。B：两个步骤改同一段菜单代码。 | **A** |
| L-07 | 包声明的图层没写 `menu.default` 时默认开还是关？ | A：开（作者声明它就是要人看见的）；`sound` 声音层永远默认关，等用户自己打开。B：关。 | A：小镇的验收图层一打开就看得到；声音永远不会自己响。B：作者每次都得记得写 `default: true`。 | **A** |
| L-08 | 声明图层的开关状态存在哪？ | A：一个键 `edenMapLayers`（JSON 对象：id → `'1'` / `'0'`），和所有键一样由存储服务按包分命名空间；内核图层仍用各自原来的键。B：每层一个键。 | A：只登记一个键，不随图层数增长；内核图层的一致性不受影响。B：键无限增长。 | **A** |
| L-09 | 图层自带的图例行 | A：抽屉的图例页先列包的 `ui.legend` 行，再按菜单顺序列每个已登记、可见、适用的图层的图例行（标题是该层的菜单名），每行带一个按图层样式画的小色样；任一列表有行就显示图例页（3D 页永远不显示）。B：只有 `ui.legend`。 | A：小镇不用多写字段就有图例；第一个包没有图层图例行，图例页和它的显示规则都不变。B：包声明的图层哪里都没有说明。 | **A** |
| L-10 | 图层读卡的变量（MVU） | A：宿主的 MVU 桥只读包图层声明的路径（每包最多 8 条，值有上限），用一条新消息发给查看器；值可以放点（一组地名）或者控制图层是否适用（`applies.mvu`）。B：把整个 `stat_data` 发给查看器。C：不支持 MVU 来源。 | A：单向数据流不破（只有桥碰宿主全局），什么都不写，消息很小。B：把无关数据漏进查看器和自检。C：计划里的「MVU 变量（只读）」来源没了。 | **A** |
| L-11 | I-04：领航员的叠加事件（`OP_CLUE`、`OP_MARKER`） | A：内核图层 `nav-ops`（point 积木；线索按紧急度呼吸，标注带自己的文字）；宿主把校验过的操作用一条新消息发过去，并盖上「玩家当前地点所在地图」的戳；线索先按名字经节点树定位，定不到再按 `nx` / `ny` 画在盖戳的地图上；只在本次会话有效（换聊天清空，和 op 事件一样 20 楼后过期）；有行时才适用。B：并进现有的线索层。C：不画。 | A：领航员的输出画在它该在的地方，会话结束就消失；什么都不持久化，聊天记录仍是唯一真相。B：把领航员的猜测和事态推出的线索混在一起。C：计划项一直挂着。 | **A** |
| L-12 | 本机扩展 `EdenMap.addLayer()` 的形状 | A：只收数据：一条按包图层同样规则校验的声明（信任级「本机」），id 必须以 `local-` 开头，来源限 inline / view / events / people / items / routine，只在本页会话有效；另有 `removeLayer`、`setLayerData`、`layers`。B：也收绘制回调。 | A：用户脚本弄不坏查看器或别的图层，包和脚本走同一个校验器。B：每帧在查看器里跑任意代码。 | **A** |
| L-13 | E-03 本机道具包：这次做多少？ | A：用户文件（glb、png、webp、svg）存在本机 IndexedDB，只做技术校验（文件头、大小、数量），可作本机图层的点图标，在平面地图上点一下放置（内核图层 `local-props`）；在 3D 页里摆 glb 等 S9b 的编辑模式。B：现在就做 3D 摆放。C：搁置。 | A：接口、存储、校验都有并且用上了；什么都不离开这台设备。B：通用 3D 查看器已到行数上限（账本 916 行），而且反正需要 S9b 的编辑器。C：计划项一直挂着。 | **A** |
| L-14 | Q-01：环境音效做成包声明的图层 | A：新增内核积木 `sound`（不画像素；槽位 `fx`），由抢救分支里原样复用的纯引擎 `map/core/ambience.mjs` 驱动，WebAudio 那一半改成今天的命名；它的菜单行永远默认关；S8 不给第一个包写环境音数据（那是它自己内容线的事）；示例包加一条默认关的演示层。B：环境音效单独一个开关，不进图层菜单。 | A：地图加的东西只有一个开关的地方；Q-01 用抢救下来的三个文件收尾。B：多一套开关界面。 | **A** |
| L-15 | K-R64 承诺过：S8 给通用 3D 查看器的清单一份 v2 schema。 | A：S8-1 按 `core/scene3d-manifest.mjs` 写 `map/data/schema/v2/scene3d.schema.json`，`tools/check_pack.py` 检查每份随引擎发布的 3D 清单。B：推到 S9。 | A：在承诺的地方兑现；量小（一个 schema 文件 + 一项检查）。B：S9 正在并行设计，并不知道这件事。 | **A** |

## 1. 范围

S8 把固定的一组视口图层变成声明式图层：数据说明有哪些图层、放在哪个槽位、什么时候适用、菜单里叫什么、图例怎么解释；
包新增的东西由通用绘制积木来画。分三个实现提示（Sonnet · High），每个一件事：

- **S8-1**：契约 K-R79、K-R81–K-R83、K-R85、K-R104；收紧 `layers` schema；纯核心 `core/layer-spec.mjs`（校验、与内核清单合并、
  来源、`applies`）和 `core/layer-defaults.mjs`（内核清单 = 今天 17 个图层的声明）；每个模块都经自己的声明登记，结果完全相同；
  包的图层进运行时 `RT.layers`（schema-1 包从叠加层读）；`registry.patch` / `registry.applicable`；3D 清单 schema；一致性探针
  `layer_dump`。
- **S8-2**：契约 K-R80、K-R84；积木渲染器（`point`、`area`、`line`、`label` 作地图叠加元素；`flow`、`particles`、`tint`
  画在槽位画布上）；航线、车流、天气改由抽出来的渲染器画（录制调用对拍）；包声明图层支持 inline / file / view / events /
  people / items / routine 来源；菜单行和图例行；小镇验收图层「巡逻路线」和「危险区域」（只改数据）；探针 `pack_layers`。
- **S8-3**：契约 K-R86–K-R89；MVU 来源和 `applies.mvu`（宿主送值）；领航员叠加图层 `nav-ops`（I-04）；`EdenMap.addLayer`
  等方法；本机道具包（E-03）和 `local-props` 图层；`sound` 积木和抢救回来的环境音引擎（Q-01）；探针 `layers_ext`。

不在 S8：把不适用的行变灰、暂停动画（S7，L-06）；3D 页自己的图层注册表（`three/particles.mjs` 的 `particles3d`）和在 3D 页
里摆道具（S9b）；在查看器里编辑图层并导出（S9b）；改存储键、消息名和 `EdenMap` 的名字（S10）；第一个包的环境音数据（它的内容线）。

## 2. 模型（K-R79）

### 2.1 一条声明

一个图层就是包 `layers` 数组里的一行（内核 K-R56 的形状，现在补全）：

```
Layer = {
  id, type（point | area | line | label | tint | particles | flow | sound）, slot（十个固定槽位之一）,
  source?（§3.2；有 data 而没写 = inline）, data?（内联要素或声音数据）, filter?（只留列出的 kind）,
  applies?（§5）, style?（§4）, menu?（§6）, legend?（§7）, off?（只对内核 id：保留图层但去掉菜单行并保持不可见）, _…, x-…
}
```

### 2.2 内核图层与包图层（合并）

内核自带一份图层清单（`KERNEL_LAYERS`，§8.1）。生效的清单 = 内核清单与包的行按 id 合并（L-02）：

- id 等于内核 id 的行**调整**该层：`menu`（文字、提示、i18n、顺序、hidden）、`applies`（与该层代码里原有的规则取「且」）、
  `legend`、`off`。写了 `type`、`slot`、`source`、`style`、`data`、`filter` 一律忽略并记问题 `layer-kernel-fixed`；包不能改内核
  图层的默认开关（每个内核图层保留自己存的开关）；
- 其他 id **声明**新图层：必须有 `type`、`slot`，以及 `source` 或 `data`，否则丢弃（`layer-incomplete`）；重复 id 保留第一行
  （`layer-duplicate`）；
- 菜单顺序：内核图层沿用内核菜单序（10 … 80），除非写了 `menu.order`；新图层有 `menu.order` 就用它，否则 `1000 + 在数组里的
  位置`（排在所有内核行之后，按数组顺序）；
- 包不能声明 `source: "kernel"`；内核清单是封闭的。

没有 `layers` 块的包原样使用内核清单（K-R60「内置默认图层」）。第一个包就是这样。

### 2.3 绘制积木

| 积木 | 每个要素的几何 | 画成 | 动画 |
|---|---|---|---|
| `point` | `at` 或 `node` | 地图叠加层里的 HTML 元素（屏幕尺寸不变） | `style.pulse` |
| `label` | `at` 或 `node` + `label` | 地图叠加层里的 HTML 元素 | 无 |
| `line` | `pts`（≥ 2）、`closed` | 每层一个 SVG 叠加，线宽不随缩放 | 无 |
| `area` | `pts`（≥ 3，闭合）或 `at` + `r`（圆） | 同一个 SVG 叠加 | 无 |
| `flow` | `pts`（≥ 2）、`closed` | 该层槽位里的画布；光点沿线移动 | 有 |
| `particles` | 无（整个视图） | 该层槽位里的画布 | 有 |
| `tint` | 无（整个视图） | 该层槽位里的画布 | 无 |
| `sound` | 无 | 不画像素（Web Audio） | — |

怎么画由内核决定，包只给几何和样式值。「减少动态效果」停掉所有动画（不画光点和粒子，呼吸变静止）；省流档把光点和粒子减半，
和今天的车流层、天气层一样。

## 3. 来源与要素（K-R81）

### 3.1 要素的形状

```
Feature = { id?, view?（坐标所在视图；默认 applies.views 里唯一的那个）, at?: [x, y]（视图宽高的 0..1，K-R31）,
  node?（节点 id；画在当前地点引擎画这个节点名字的地方）, pts?: [[x, y], …]（2..2000 点）, closed?, r?（圆半径，宽度的比例）,
  kind?（选 style.by[kind] 与 filter.kinds）, label?（≤ 60 字，只当文字显示，K-R64）, i18n?: { <语言>: { label } } }
```

要素只画在自己的视图上：`view` 不是当前视图的跳过；`node` 要素在该节点画在当前地图上时才画（`drawnAt(hereRes(名字))`，
行程层用的同一条路）。既没有可用视图也没有节点的要素丢弃（`feature-no-view`）。

### 3.2 来源种类

| `source` | 要素从哪来 | 谁能用 |
|---|---|---|
| 不写 + `data`，或 `inline` | `data.features` | 包、本机图层 |
| `file:<路径>` | 包目录下的 JSON 文件 `{ "features": [...] }`（或声音数据），`.json`，≤ 256 KB | 包 |
| `view:routes` | 当前视图数据文件里的 `routes` | 包、本机图层、内核 |
| `view:markers` | 当前视图数据文件里的 `markers`（先用 `ax`/`ay` 锚点，和今天一样） | 包、本机图层、内核 |
| `events` | 进行中的事件（实体协议 K-R71）：画在事件节点上；`kind` = 事件类型 id，`label` = 事件标题 | 包、本机图层 |
| `people` | 人物（K-R71）：`kind` = 名册分组 id，`label` = 名字 | 包、本机图层 |
| `items` | 有地点的藏物行（K-R74），暗格只在玩家站在那里时出现（和藏物标记一样） | 包、本机图层 |
| `routine` | 包的日程按当前世界时刻（`placesAt`），`kind` = 日程行 id | 包、本机图层 |
| `mvu:<路径>` | 宿主送来的值（K-R86）：一组地名 → 点 | 包 |
| `ops` | 领航员叠加（K-R86） | 内核 `nav-ops` 图层；包可按 id 改它的样式 |
| `kernel` | 内核自己的模块 | 只限内核 |

实体来源什么都不编：只显示实体适配器手里已有的东西；不认识的类型归「其他」（简报第 8 条）。

### 3.3 上限与信任

对所有包（随引擎发布的和外来的都一样；运行时宽松、工具严格，K-R06）：每包新图层最多 32 个，每层要素 1000 个，每个要素 2000
个点，每层图例 8 行，`style.by` 16 种，每包不同的 MVU 路径 8 条，`file:` 来源 ≤ 256 KB 且解析后仍在包目录下（K-R64）。外来包
（K-R63）可以用除 `kernel` 以外的所有来源声明图层。本机图层（K-R87）不能用 `file:`、`mvu:`、`ops`。所有字符串只当文字进页面；
颜色、图标、数字、路径运行时再校验一次，不合格就丢（K-R64）。

## 4. 样式（K-R80）

| 键 | 积木 | 取值 | 默认 |
|---|---|---|---|
| `color` | 除 `sound` | `#rrggbb`、`#rrggbbaa`，或内核颜色令牌名（`--accent`、`--alert`、`--gold` 等，K-R58） | `--accent` |
| `opacity` | 除 `sound` | 0..1 | 1（`tint` 0.25） |
| `by` | 除 `sound` | `{ <kind>: 样式 }`，≤ 16；按要素 kind 覆盖 | — |
| `size` | `point`（4..32 px）、`flow`（0.5..6 px）、`label`（`micro` / `small` / `body`） | | 10 / 1.8 / `micro` |
| `icon` | `point` | 内核图标名（`ui/icons.js`），或 `prop:<id>`（只限本机图层，K-R88） | 圆点 |
| `pulse` | `point` | 布尔 | false |
| `tone` | `label` | `plain` / `chip` | `chip` |
| `width` | `line`、`area`、`flow.path` | 0.5..8 px | 1.4 |
| `dash` | `line`、`area`、`flow.path` | ≤ 6 个 0..40 的数 | 实线 |
| `halo` | `line` | 布尔（线下压一道暗边，和航线层一样） | false |
| `fill`、`fill_opacity` | `area` | 颜色同 `color`；0..1 | `color`；0.18 |
| `speed` | `flow` | 0.005..1（每秒走全长的比例） | 0.07 |
| `density` | `flow` | 每条线 1..64 个光点 | 12 |
| `trail` | `flow` | 0..0.05（全长的比例） | 0.006 |
| `path` | `flow` | 线样式（`color`、`width`、`dash`、`halo`）；不写 = 不画线（L-04） | 不写 |
| `preset` | `particles` | `rain`、`storm`、`sand`、`snow`（内核天气预设） | `rain` |

车流层的夜间效果（时段为夜时更亮、尾迹更长）是 `flow` 积木对所有流动层都有的行为：积木读今天车流层读的同一条时钟消息。

## 5. applies（K-R82）

```
Applies = { views?, kinds?（tiles | image | schematic | model3d）, nodes?（当前视图的所属节点是其一或在其下）, node_types?,
  periods?（当前时段 id，K-R39）, dark?, data?（当前视图上至少一个要素；point/label/line/area/flow 默认 true，其余 false）,
  mvu?: { path, equals?, min?, max?, truthy? }（K-R86） }
```

写了的每个键都要满足（且）；列表里任一项满足即可（或）；不写或为空 = 处处适用。查看器每次变化时建一次上下文
（`layerContext()`：当前视图、它的种类、所属节点和祖先及类型、上一条时钟消息给的时段与 `dark`、MVU 值、要素数），再问
`registry.applicable(id, ctx)`。不适用的图层什么都不画并停掉动画帧。菜单行由 S7 变灰；S7 落地前，不适用的包声明行先隐藏
（L-06）。对内核图层，包写的 `applies` 与该层代码里原有的规则取「且」（例如没有航线的视图上航线行照旧隐藏）。

## 6. 图层菜单（K-R83）

```
Menu = { label, title?, i18n?: { <语言>: { label?, title? } }, order?, default?, hidden? }
```

菜单行由今天的数据驱动菜单渲染（`renderLayerMenu`：每个带 `menu` 的已登记图层一行，按 `menu.order` 再按登记先后），包的图层
到了之后再渲染一次。新图层行的元素 id 由图层 id 派生（`lyr-<id>`，勾选框 `lyrBox-<id>`）；文字取包的 `label` / `title`（先看
`i18n.<界面语言>`），用 `textContent` 写入。`menu.default`（默认 true，L-07；`sound` 永远 false）在用户动过开关之前生效；用户的
选择存进 `edenMapLayers`（L-08）。`hidden` 保留登记但不出菜单行（可见时照样画）；`off`（内核 id）保留登记、不可见、无菜单行。

## 7. 图例（K-R84）

```
LegendRow = { label, desc?, i18n?: { <语言>: { label?, desc? } }, kind? }
```

抽屉的图例页（内核 `lg`，K-R70 `ui.legend`）依次列出：包的 `ui.legend` 行（不变），然后按菜单顺序，每个已登记、可见、适用的
图层的图例行，放在以该层菜单名为标题的小节下。每行图层图例带一个按图层样式画的小色样（`kind` 选 `style.by[kind]`）：`line` 和
`flow` 是一笔线，`area` 和 `tint` 是填色方块，`point` 是圆点，`label` 和 `sound` 没有。色样颜色在 K-R64 再校验之后经 CSS 自定义
属性设置。当前视图不是 3D 页、且任一列表有行时显示图例页；今天的条件（有纵深数据且有 `ui.legend` 行）仍是两个条件之一，所以
不带图层图例的包看不到任何变化。

## 8. 第一个包的图层搬到声明上（一致性）

### 8.1 内核默认清单

今天有 17 个图层登记在查看器的 `LayerRegistry` 上（`map/app/layer-host.mjs` 和下表各模块）。S8-1 把它们的事实原样抄进
`core/layer-defaults.mjs` 的 `KERNEL_LAYERS`；各模块改为登记 `declared(id, { mount, unmount, setVisible, initialVisible })`，
注册表最后得到和今天完全相同的记录。

| id | 槽位 | kind | order | 菜单序 | 登记位置 | `type`（S8） |
|---|---|---|---|---|---|---|
| `base-overlay` | base | osd | 0 | 10 | `app/layer-host.mjs` `registerCoreLayers` | — |
| `alt-base` | base | osd | 1 | 20（隐藏） | 同上 | — |
| `routes` | routes | osd | 0 | 30（隐藏） | 同上 | `line` |
| `security` | markers | osd | 2 | 40 | `map/security.mjs` | — |
| `weather` | fx | canvas | 10 | 45 | `app/weather-view.mjs` | `particles` |
| `traffic` | fx | canvas | 20 | 46 | `app/traffic-view.mjs` | `flow` |
| `quests` | fx | canvas | 30 | 47 | `app/quests-view.mjs` | — |
| `loot` | interaction | dom | 10 | 48 | `app/stash-markers.mjs` | — |
| `vision` | fx | canvas | 25 | 49 | `app/vision-view.mjs` | — |
| `wander` | interaction | dom | 20 | 50 | `app/wander.mjs` | — |
| `trips` | trips | osd | 0 | 50 | `map/trips-view.mjs` | — |
| `labels` | labels | osd | 0 | 60 | `app/layer-host.mjs` | — |
| `markers` | markers | osd | 0 | 70 | 同上 | — |
| `events` | events | osd | 0 | 80 | `map/events-view.mjs` | — |
| `fog` | fog | canvas | 0 | — | `app/fog.mjs` | — |
| `clouds` | depth-haze | dom | 0 | — | `app/clouds.mjs` | — |
| `depth-haze` | depth-haze | dom | 0 | — | `app/depth-haze.mjs` | — |

`type: —` 表示「由内核代码绘制」（声明里是 `type: null`）。菜单序相同的（`wander` 与 `trips` 都是 50）照今天按登记先后排；
声明不改变登记顺序。S8-3 新增的内核图层是 `nav-ops`（markers，point）和 `local-props`（markers，point）；`sound` 图层由包声明。

### 8.2 绘制搬到积木上

三个内核图层改由积木渲染器绘制（L-01 C），代码是搬家而不是重写：

- **航线 → `line`**：`app/markers.mjs` L178–188 的航线 SVG（每条航线的路径、按种类的 halo / class、地名断开用的 `rtGap` 遮罩）
  成为 `line` 渲染器；纯计算部分（`routePaths(routes, VW, VH)` → `[{ d, cls, pass }]`）搬进核心，与今天 `dOf` 循环的冻结副本对拍。
- **车流 → `flow`**：`app/traffic-view.mjs` 的 `frame`（L33–58）成为 `drawFlow(cx, input)`；`core/traffic.mjs` 的 `trafficField`
  加一个可选的 `kinds` 表（默认 `LANE_KINDS`，车流层不变）；用记录每次调用的假 2D 上下文，新旧帧对同一输入给出相同的调用日志。
- **天气 → `particles`**：`app/weather-view.mjs` 的 `frame`（L28–43：色调、粒子笔画、闪电）成为 `drawParticles(cx, input)`，
  同样录制调用对拍。

其余的——探索迷雾、纵深霾、云、视野锥和潜行判定、线索呼吸圈、藏物拾取、漫游标记、行程、安保角标、地名、标记、事态——仍是内核
代码：这些图层带着绘制以外的行为。它们通过自己的声明（槽位、顺序、菜单、适用范围、图例）「上了机制」。

## 9. 领航员叠加（K-R86，I-04）

领航员（`tavern/llm-flow.mjs` W5，默认关，受 `edenMapNav` 和首次同意约束）今天已经经操作沙盒（`tavern/operation-dsl.mjs` 的
`apply` → `clues`、`markers`、`src: 'op'`）解析出 `OP_CLUE { name, nx, ny, urgency }` 和 `OP_MARKER { id, nx, ny, label }`，
然后丢掉。S8-3 把它们送达：

- 宿主在本次会话里保留 `opOverlays = { clues, markers }`，每次领航员运行的结果加上 `floor` 和 `map` 戳（`map` =
  `SpatialM.locate(regNow, here)?.mapId ?? null`，即玩家当前地点所在地图，和空间契约用的同一种解析），超过 20 楼的行丢掉（op 事件
  的规则），每张表最多 12 行，有变化时发 `eden-map:ops { clues, markers, map, floor }`；换聊天清空；
- 查看器的内核图层 `nav-ops`（槽位 `markers`，`point` 积木，菜单行「领航员标注」，默认开——领航员本身就是要用户主动开的）：线索的
  `name` 经节点树能定位、且该处画在当前地图上时画在那里，否则画在盖戳地图的 `nx` / `ny`；标注画在盖戳地图的 `nx` / `ny` 并带
  文字；线索按紧急度（1–3）呼吸、变大；`applies.data` = 当前地图上至少一行；
- 什么都不写进聊天、聊天变量或附加世界书；提示文字标明这是领航员的建议。

## 10. 本机扩展 `EdenMap.addLayer`（K-R87）

`window.EdenMap` 是对外契约（S10 才改名）；S8-3 只加方法，不改任何名字。

| 方法 | 返回 | 说明 |
|---|---|---|
| `addLayer(def)` | `{ ok, id, problems }` | `def` 是一条图层声明（§2.1）；信任级「本机」；`id` 必须以 `local-` 开头；来源限 inline / `view:*` / events / people / items / routine；本机图层最多 16 个；同 id 再加会替换 |
| `removeLayer(id)` | 布尔 | 只限本机图层 |
| `setLayerData(id, features)` | `{ ok, problems }` | 替换内联本机图层的要素（校验、截断） |
| `layers()` | `[{ id, type, slot, visible, applicable, source, count }]` | 所有已登记图层，只读 |

本机图层只在本页会话里存在（用户脚本加载时重新添加，和用 `on` 重新订阅一样）；只记住它们的开关（`edenMapLayers`）。宿主页上
同名方法在查看器打开时转发过去，没打开时排队，等 `eden-map:ready` 再发。`EDEN_API`（`tavern/extension-api-contract.mjs`）
新增 `addLayer: 1`、`removeLayer: 1`、`setLayerData: 2`、`layers: 0`（以及 §11 的道具方法）。

## 11. 本机道具包（K-R88，E-03）

用户本机的 3D 道具和图标，永不上传：

- **存储**：IndexedDB 数据库 `spatialProps`，store `props`，键 `<包 id>::<道具 id>`；记录 `{ id, name, type: 'glb' | 'png' |
  'webp' | 'svg', bytes, w?, h?, createdAt, blob }`。纯规则（文件头、上限、id）在 `core/prop-pack.mjs`，IndexedDB 薄封装在
  `app/prop-store.mjs`（照 `core/room-gallery-db.mjs` 的路子）。
- **校验（只做技术校验）**：glb = 第 0–3 字节为 `glTF` 且版本 2，≤ 8 MB；png = 8 字节 PNG 文件头；webp = `RIFF` … `WEBP`；图片
  ≤ 1 MB；svg = 以 `<svg` 为根的 UTF-8 文本，≤ 256 KB，含 `<script`、`<foreignObject` 或 `on…=` 属性的拒收；每包最多 64 个道具、
  共 64 MB。图片只经 `blob:` 对象地址放进 `<img>` 显示（不注入标记）；什么都不发给宿主、模型或任何地址。
- **接口**：`addProp(file, { name? }) → { ok, id, problems }`、`removeProp(id)`、`props() → [{ id, name, type, bytes }]`、
  `placeProp(id, { map, at } | { pick: true }) → Promise<{ ok, map, at }>`（pick = 地图上的下一次点击）、`unplaceProp(id, map)`。
- **摆放**按聊天存在 `edenMap:chat:<聊天 id>:props`（已登记的按聊天前缀；≤ 200 行 `{ prop, map, at }`），由内核图层
  `local-props` 绘制（槽位 `markers`，`point` 积木：图片当图标，glb 用内核 `cube` 图标加名字）。这是用户自己的装饰，和自定义名称、
  头像一样：只在本机，不是聊天事实，从不注入。
- **图标**：本机图层的点样式可以写 `icon: "prop:<id>"`；包图层不行（包不可能知道用户的文件）。
- **3D**：在 3D 页里摆 glb 属于 S9b（编辑模式），L-13。

## 12. 环境音效做成声音图层（K-R89，Q-01）

抢救分支 `rescue/ambience-part4-4` 里有三个新文件（`map/core/ambience.mjs`、`map/app/ambience.mjs`、`tests/ambience.test.mjs`）；
另外九个文件是过时副本，不用（Q-01）。S8-3：

- 原样复制 `map/core/ambience.mjs` 和 `tests/ambience.test.mjs`（只把核心文件头注释里的示例地图 id 和数据路径改成中性说法）；
- 把 `map/app/ambience.mjs` 移植成 `map/app/sound-block.mjs`：用今天的命名（`app/state.mjs` 的 `mapRegistry`、`currentMapId`、
  `osdViewer`，存储服务，`app/plugins.mjs` 的 `register`），夜晚取宿主时钟消息，天气取 `WeatherApi.now()`，不再用旧全局和
  `tc:weather` 事件；
- `sound` 图层的数据（内联 `data` 或 `file:`）就是环境音格式 `{ rules: [{ match, scenes }], recipes?, master? }`；`match.map` 是
  当前视图 id；`applies` 决定这一层在哪里生效；
- 配方也可以是包内的文件循环 `{ kind: 'file', src: '<rel>.ogg', alt?: '<rel>.mp3' }`（路径相对包根解析；由应用层取回、解码并
  循环；文件缺失或损坏时保持静音）；
- 不管 `menu.default` 写什么，这一行都默认关；AudioContext 在第一次打开时才创建，只在用户手势后恢复，页面隐藏或图层不适用时挂起；
- 示例包加一条默认关的 `harbour-sound`（港口视图上的风声和噼啪声）；S8 不给第一个包加。后来（AMBIENT-SOUND）eden 加了一条
  默认关的 `tier-ambience` 文件循环图层——上层风声与鸟鸣、中层街声与轨道、下层厂房与蒸汽，夜里自动变轻；循环素材与逐文件
  授权写在包的 `credits.assets` 里。

## 13. 验收：示例包只改数据就加上两个图层

`map/packs/town/overlay.v2.json`（新文件；清单里用 `data.overlay` 声明，K-R67）写两条图层：`patrol`（`flow`，槽位 `routes`，
只在 `town_hill` 适用，淡蓝点划线 + 移动光点，沿旧堡、集市广场、钟楼绕一圈；菜单「巡逻路线 / Patrol route」，带一行图例）和
`danger`（`area`，槽位 `routes`，只在 `town_harbour` 适用，`--alert` 色、虚线边、0.2 填充，围住鱼市；菜单「危险区域 / Danger
zone」，带一行图例）。完整 JSON 见英文版 §13（坐标由执行者在屏幕上微调）。引擎文件里不出现这两个图层的名字。探针
`pack_layers`（S8-2）检查：菜单里两行用的是包的文字；在 `town_hill` 上画出巡逻线和移动光点、危险区域不适用；在 `town_harbour`
上反过来；图例页两行都带色样；关掉一行后它的绘制消失，并且刷新后仍记得（`tcp.town.Layers`）；第一个包的菜单行、槽位和注册表
摘要与基线完全相同（`layer_dump`）。

## 14. 内核契约的新增（计划）

在 `docs/kernel-schema.md` §13（「S8 计划」）预留；全文随实现它的步骤落地：

| 编号 | 规则 | 小节 | 步骤 |
|---|---|---|---|
| K-R79 | layers 块：一条声明、内核清单、按 id 合并、菜单顺序、`off`、上限 | §9 | S8-1 |
| K-R80 | 绘制积木与样式键；减少动态效果与省流档 | §9 | S8-2 |
| K-R81 | 来源与要素形状；各来源的信任 | §9 | S8-1 |
| K-R82 | `applies` 的键、求值和与 S7 的分工 | §9 | S8-1 |
| K-R83 | 菜单行和开关存储 `edenMapLayers` | §9 | S8-1 |
| K-R84 | 图层的图例行；图例页的显示规则 | §10.1 | S8-2 |
| K-R85 | schema-1 包的叠加层可以带 `layers` | §13 | S8-1 |
| K-R86 | 宿主送值：MVU 路径、`applies.mvu`、领航员叠加和两条新消息 | §9 | S8-3 |
| K-R87 | 本机扩展 `addLayer` / `removeLayer` / `setLayerData` / `layers` | §9 | S8-3 |
| K-R88 | 本机道具包：存储、校验、摆放、`prop:` 图标 | §9 | S8-3 |
| K-R89 | `sound` 积木与环境音数据 | §9 | S8-3 |
| K-R104 | 通用 3D 查看器清单的 v2 schema（兑现 K-R64 的承诺） | §4.5 | S8-1 |

## 15. 步骤计划

| 步骤 | 规模 | 提示 | 内容 |
|---|---|---|---|
| S8-1 | L（一个提示，约 6 小时） | 附录 S8-1 | 契约、schema、核心规格 + 内核清单、各模块改走声明、`RT.layers`、注册表 `patch` / `applicable`、3D 清单 schema、探针 `layer_dump` |
| S8-2 | L（一个提示，约 6 小时） | 附录 S8-2 | 积木渲染器、航线 / 车流 / 天气上积木、包声明图层、菜单行与图例行、小镇验收数据、探针 `pack_layers` |
| S8-3 | L（一个提示，约 6 小时） | 附录 S8-3 | MVU 值、领航员叠加、`addLayer`、道具包、声音积木、探针 `layers_ext` |

顺序：S8-1 → S8-2 → S8-3，严格依次。S7 可以在其中任何一步之前或之后落地（L-06）。

与 S9 并行（`docs/zero-config.md` §13）：S8-1 和 S8-2 都改 `app/boot.mjs` 和 `app/nodes-runtime.mjs`，所以各自与 S9-1 串行
（不同时跑）；S9b 在 S8-1 之后（两边都改 `core/pack-v2-spec.mjs`、v2 schema 和 `tools/check_pack.py`）；S8-3 和 S9-3 都加一个
宿主消息处理：rebase 冲突时两个都保留。

## 16. 风险

- **登记时机**：好几个内核图层在模块求值时就登记了，那时节点运行时还不存在；所以包的调整稍后经 `registry.patch` 和第二次菜单
  渲染才到。运行时建好之前读菜单的探针看到的是内核行（和今天一样）。
- **搬家后渲染的视觉一致**：由录制调用测试（node）加现有截图探针（`p4_traffic`、`p4_fx`、`s43_parity`）覆盖；任何差异都让该步
  停下（各步骤说明的 §9）。
- **核心兜底文字里的卡内用词**：核心词典的 `routes_title` 写了第一个包里的一个地名（简报 §2.1）；S8-1 把原文原样移进第一个包
  清单的 `strings`（S4-4 的机制），核心改成中性文字，第一个包显示的字不变。
- **两位设计者并行**：S9 的设计先落地，占了 K-R90–K-R103，把 K-R79–K-R89 留给 S8；所以 S8 的第十二条规则（3D 清单 schema）
  改用 K-R104。S8 与 S9 各步骤的执行者在 `docs/kernel-schema.md` §13 和 `docs/todo.md` 上遇到 rebase 冲突时两边都保留。
- **声音**：声音图层绝不能自己响：默认关这条规则在代码里强制，不只靠数据。

## 附录：可执行的步骤说明

下面三个提示以英文版为准（执行者是 Sonnet · High，只看仓库就够）；这里是摘要。行号以 origin/preview `7958b5ad` 为准。

### S8-1 — layers 契约、内核声明、包图层进运行时

约 6 小时。先冻结 `maps.json`（会改第一个包清单的 `strings`）。写入 K-R79、K-R81–K-R83、K-R85、K-R104 全文；收紧
`layers.schema.json`；新增纯核心 `core/layer-spec.mjs`（`parseSource`、`normFeature`、`normLayer`、`mergeLayers`、`appliesTo`、
`layersBlock`）和 `core/layer-defaults.mjs`（17 个内核图层的声明，与冻结的旧描述符逐项对拍）；各模块改为
`registry.register(declared(id, {…}))`；注册表加 `patch`、`applicable`、`describe().declared`；`applyOverlayLayers` 让叠加层
带 `layers`，运行时出 `RT.layers`；启动时 `applyPackLayers` 调整内核行并再渲染一次菜单；3D 清单 schema 与检查；`routes_title`
改中性、原文移进第一个包；新探针 `layer_dump`（前后对比必须为空）。停止条件：冻结已被占用、对拍两次仍不一致、文件超 400 行等。

### S8-2 — 积木渲染器、包声明图层、菜单行与图例行、小镇验收

约 6 小时。写入 K-R80、K-R84；新增 `core/layer-geometry.mjs`（`routePaths` 与旧循环对拍、几何与样式解析、色样）、
`app/block-canvas.mjs`（`canvasLayer`、`drawFlow`、`drawParticles`、`drawTint`，录制调用对拍）、`app/block-overlay.mjs`
（SVG 线 / 区域、HTML 点 / 文字、注入的样式）、`app/declared-layers.mjs`（包图层的登记、各来源的要素、`layerContext`、
不适用时不画并隐藏行、`DeclaredLayersApi`）；航线 / 车流 / 天气改走渲染器，`traffic-view.mjs` 和 `weather-view.mjs` 必须变短；
菜单行与 `edenMapLayers`；图例页可重建、加图层图例行；小镇 `overlay.v2.json` 与清单 `data.overlay`；新探针 `pack_layers`。
第一个包的 `layer_dump`、`s43_parity`、`p4_*` 必须与基线相同。

### S8-3 — 宿主送值、领航员叠加、本机图层与道具、声音图层

约 6 小时。写入 K-R86–K-R89；宿主：`profile.layerPaths`、`MVUBridge.layerValues`、`pushMvu` 发 `eden-map:layer-data`，领航员
运行后保留会话级叠加并发 `eden-map:ops`（两条新消息登记进协议表）；查看器：`mvu:` 来源与 `applies.mvu`、内核图层 `nav-ops`、
`EdenMap.addLayer` / `removeLayer` / `setLayerData` / `layers`（宿主转发并排队）、道具包（`core/prop-pack.mjs`、
`app/prop-store.mjs`、`addProp` 等方法、`local-props` 图层）、`sound` 积木（原样复制抢救的核心与测试，移植 app 半边为
`app/sound-block.mjs`）；小镇加默认关的 `harbour-sound`；新探针 `layers_ext`；第一个包多出的两行内核菜单（`nav-ops`、
`local-props`）属于只增不减，在探针里固定并在 `docs/todo.md` §3 记一个 Q 项。todo 收尾：I-04 叠加部分、E-03（接口与平面摆放；另在 §2 记一条
「在 3D 页里摆本机 glb 道具」跟进项，去向 S9b——它的说明里还没有这一项）、Q-01 完成。若 S9-1 已落地，S8-1 也让 v2 运行时
（`map/app/nodes-runtime-v2.mjs`）带出 `layers`。
