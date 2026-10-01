# 实体协议、抽屉页签、统一藏物库与「物品」页签（S6 设计）

> 中文版；英文版 `docs/entity-protocol.md` 为准（标题结构相同，`tools/check_zh_mirror.py` 口径）。计划步骤 **S6-design** 的产出
> （计划 `docs/plans/spatial-os.md` §5 阶段 C、决策 D4；todo I-04、I-08）。状态：**设计稿，工作决定已按默认采用**（2026-10-01
> 用户不在：下面审阅表里每一条的推荐项就是工作决定，用户可以推翻任何一条）。本文件不带任何代码改动。它给内核契约新增的规则
> 预留为 **K-R71 … K-R78**（`docs/kernel-schema.md` §13「Planned in S6」）；全文随步骤规格 `docs/plans/steps/S6-1.md`、`S6-2.md`、
> `S6-3.md` 落地。文中对现有代码的描述都在 origin/preview `11a98c35` 上核对过。

## 0. 审阅表（P-01 … P-14）

一个真决定一行。「工作决定」= 推荐项，2026-10-01 按默认采用（autopilot）。同一份清单逐条写进 `docs/todo.md` §3。

| 编号 | 问题 | 选项 | 后果 | 推荐（工作决定） |
|---|---|---|---|---|
| P-01 | 人物页签怎么区分宏观层与微观层？ | A：当前打开的地图在运行时树里至少有一张子图（任何类型）= 宏观，否则微观；视图可以用 `x-people: "macro" \| "micro"` 强制（v1：`maps.json` 的 `people`）。B：按节点深度（深度 ≤ 1 为宏观）。C：一律按树分组。 | A：首个包——世界图、每一层、每个带三维页的地点都是宏观；示例包的两张图是微观；任何地方都不出现首个包的 id。B：深度在不同包里意思不同。C：根本没有「这里的人」视图。 | **A** |
| P-02 | 微观层上，不在玩家所在节点的人怎么办？ | A：留在列表里，放进折叠的分节（「本图其他位置」「其他地图」「位置未知」）；只有「和你在一起」默认展开。B：隐藏。 | A 什么都不丢，所有探针的行数不变；B 会藏起用户可能在找的人。 | **A** |
| P-03 | 页签顺序，「物品」放哪里。 | A：默认 `events, characters, items, places`，图例永远最后；`ui.tabs`（K-R57）可以改顺序或去掉页签，但 `places` 永远保留（地点卡住在里面）。B：物品放在地点之后。 | A 保持现有三个常用页签的顺序，物品紧挨人物；包想要别的顺序就自己写。 | **A** |
| P-04 | 藏物库的一行是什么意思：随身，还是存放在某处？ | A：加 `carried` 标记：拾取（正文与地图）= 随身；经扩展接口加的、或迁移时认不出来源的 = 存放在它的地点；地点卡的「存放」行与注入摘要行照旧（按地点）。B：拾取会清掉地点（东西跟着玩家走）。 | A 不改任何可见文字，只有新的物品页签读 `carried`。B 会改注入摘要行和地点卡。 | **A** |
| P-05 | W12 虚拟槽位（`槽位`）在统一库里怎么放。 | A：保留为 `stash.slot`，带自己的事实记录（ASCII 键），注入的槽位行逐字节不变。B：槽位只留声明，件数数藏物库的行。 | A：天然对拍，多存一点重复数据（≤ 200 条事实）。B：经扩展接口删过行时件数会变。 | **A** |
| P-06 | 迁移从哪里知道 v1 键名 `仓库` / `槽位`。 | A：`tavern/stash-store.mjs` 里的常量（`V1_KEYS`），只读，S10 随迁移一起删除。B：在 `legacy` 块新增 `stash_keys`（K-R09），compat-v1 给每个 v1 包填上。 | A：这两个键是引擎给每个包写的，以后不再写，中文字面量也离开 `map/core`（现在在 `core/ledger.mjs`）。B：每个包的 schema 都背一份死清单；决定 (a) 说的是包还在继续写的名字。 | **A** |
| P-07 | 迁移什么时候跑？ | A：只跑一次：聊天变量里没有 `stash`、但至少有一个 v1 键时；库里记下 `from`；v1 键永不改写、永不删除（直到 S10，每次保存都原样带回）。B：每次加载都按 id 合并（删除要靠墓碑）。 | A 简单且不丢数据（旧值留在聊天里）。降级到旧脚本再升回来，会丢掉旧脚本在这期间加的行（只在 preview 线上会发生）。 | **A** |
| P-08 | `eden-map:inv` 的线上格式（宿主与查看器版本可能不同）。 | A：`items` 保持旧行形状；新增可选字段 `stash`（新行、槽位摘要）与 `card`（卡内物品栏）。B：`items` 换成新行。 | A：旧查看器配新宿主、新查看器配旧宿主都照常；载荷大约翻倍（几十行）。B 在混合版本下地点卡会坏。 | **A** |
| P-09 | 对账与回填。 | A：宿主从库的 `since` 起每条消息扫一次；文字变了的消息（滑动重生成、编辑）重放（它的正文行按新文字重建）；`since` 之前的历史不回填；重算发现的偏差在自检里报告，绝不悄悄修。B：A 再加一个默认关的「整段聊天重扫」开关。C：不重放（被换掉的回复留下的行继续留着，同今天）。 | A 让库能逐项重算（简报规则 4），只对宿主跳过的消息补行；来自被用户滑掉的回复的行会消失（它们从来不在当前聊天里）。C 留着这些幻影行。 | **A** |
| P-10 | 物品页签在「随身」之外列什么。 | A：「这里」= 存放在玩家所在节点的自有行 + 躺在那里的世界藏物（暗格只在玩家站在那个点上时出现，同地图光点的规则）；「其他地点」= 存放在别处的自有行，按地点分组；「卡内」= 卡自己的物品栏，只读。B：A 再加其他地点所有看得见的世界藏物。 | A 与地图已经显示的一致，不剧透；B 会列出最多 200 行没人要的东西。 | **A** |
| P-11 | `tavern/loot-flow.mjs` 的最终名字（naming.md 留给 S6 定）。 | A：`tavern/stash-flow.mjs`（词汇表：Stash），在反正要重写它的 S6-2 里改名。B：保持 `loot-flow`。 | A：一个概念一个名字；要动入口的 import 行、`tests/host_split.test.mjs` 和两份文档。 | **A** |
| P-12 | 新的「永不算」句式（否定、疑问、对白、意图、条件）对哪些动词生效。 | A：所有拾取动词。B：只对新动词。 | A 去掉今天的误收（被否定或被问的拾取）；现有测试里每一句正例仍然算（钉住）。B 保留这些误收。 | **A** |
| P-13 | 新动词 `获得` / `得到` / `拿取`（以及英文 obtain / get / take / receive / acquire）有多严格。 | A：严格类：宾语必须带量词、或带引号、或是已知物品名；光秃秃的名词永远不算。包的 `verbs` 进普通类；新的包字段 `verbs_strict` 进严格类。B：普通类（2–8 字的裸名词也算）。 | A：「获得了勇气」「得到消息」「took a breath」永远不会变成物品；裸的「得到钥匙」只有钥匙是已知物品时才算。B 让所有抽象宾语都进来。 | **A** |
| P-14 | I-04：npc 与事件两个结算域的「写入路径」是什么。 | A：地图自有的键 `<聊天变量>.ledger = { npc, events }`；只写空洞（名册里有这个人但地点为空；地图结算过的事件），经结算闸门，默认关的开关之后。B：放进 `stash`。C：没有持久写入路径；把 I-04 当「设计如此」关掉。 | A：这两个域能结算，不再一直挂在待结算；不碰 `stat_data`；关着 = 今天的行为。B 把人和物混在一起。C 让计划项永远开着。 | **A** |

## 1. 范围

S6 把抽屉变成页签注册表，各页签读同一套实体模型；统一物品存储；新增物品页签。三个实施提示（Sonnet · High），各一个单元：

- **S6-1** —— 实体协议核心（`map/core/entities.mjs`）、页签规则（`map/core/drawer-tabs.mjs`）、页签注册表（`map/app/tabs.mjs`），
  现有四个页签搬上去且行为不变，人物页签按层级分节。
- **S6-2** —— 统一藏物库、从 v1 键迁移、重算与对账、宿主流改名为 `stash-flow`、卡内物品栏读取器、`eden-map:inv` 的新字段。
- **S6-3** —— 物品页签、拾取句式（新动词、永不算句式、按包扩展、I-08）、npc / 事件的结算写入路径（I-04）、新探针 `drawer_stash`。

S6 不做：声明式图层与绘制已结算的事件（S8）；编辑、导出、查看器加载 schema 2（S9、S9b）；聊天变量键、存储键、协议名、`EdenMap`
改名（S10）；三维庄园页自己的抽屉。

## 2. 实体协议（K-R71）

### 2.1 一种形状

人、物、事件都是**挂在节点上的实体**。实体由宿主已经在发的行推导出来，本身从不存储。

```
Entity = {
  kind:     'person' | 'item' | 'event',
  id:       string,          // 人：规范化名字（K-R40）；物：库或世界藏物的行 id；事件：事件 id
  name:     string,          // 显示文字，照原样
  node:     string | null,   // 节点 id（K-R28）；null = 位置未知
  place:    string,          // 原样的地点文字（'' = 没有）
  source:   string,          // 这一行来自哪个通道（2.2）；不带任何出处说法（简报 §7）
  msgIndex: number | null,   // 事实所在的聊天消息位置；不对应某条消息时为 null
  present?: boolean,         // 只有人：和玩家在一起（K-R40）
  data:     object,          // 原始行，不动：各页签要画的种类专属字段
}
```

规则：
1. **纯适配器。** `map/core/entities.mjs` 从行构造实体；不导入 `map/core` 之外的任何东西，由调用方传入 `nodeOf(text) -> id | null`
   （查看器：`hereRes(text)?.node`；宿主：它的事件地理）。
2. **按引用给节点。** 行可以带 `node`；接收方的树里有这个 id 就用，否则对 `place` 做定位（K-R24：先别名，后提示词，最后未知）。
   v1 字段 `map` / `marker` 继续接受（K-R28）。
3. **同一种类同一 id 只有一个实体。** 重复时按发送方顺序留第一行。
4. **聊天记录是唯一真相。** 每个实体都能从聊天楼层和设定包重算（简报规则 4）；只有物品库是持久化的，而它本身也能重算（§5.6）。
5. **不过滤内容。** 名字与地点照写的样子带着；不认识的类型就是「其他」（简报规则 8）。

### 2.2 来源

| 种类 | 行（消息） | `source` 取值 | `node` |
|---|---|---|---|
| 人 | `eden-map:chars` 的 `items[]`（`{ name, place, floor, src, present?, prelude?, stale? }`）、名册分组的行 | `mvu`、`chat`（v1 叫 `tag`）、`table-db`、`fallback`、`imagegen`、`routine`、`infer`（在场表里但没写地点） | 由 `place` 定位 |
| 物 | `eden-map:inv` 的 `stash.rows[]`（§5.7）、`eden-map:stash` 的 `items[]`（世界藏物）、`eden-map:inv` 的 `card.rows[]` | `text`、`map`、`api`、`legacy`（库里的行）；`world`（世界藏物）；`mvu`（卡内） | 库里的行在宿主知道时带 `node`；世界藏物：由 `place` / `marker` 定位；卡内行：`null` |
| 事件 | `eden-map:events` 的 `items[]` | `chat`、`op`（领航员叠加）、`feed` | 由 `place` 定位（事件本来就带地理） |

`msgIndex` 就是消息位置（v1 行里叫 `floor`；命名决定 (d)）。

### 2.3 消息改动

消息名在 S10 之前不变。新增项（每一项都登记进 `map/core/protocol.mjs` 的 `SCHEMA`，并在 `tests/protocol.test.mjs` 里钉住）：

| 消息 | 改动 | 步骤 |
|---|---|---|
| `eden-map:inv`（宿主 → 查看器） | 新增可选顶层字段 `stash: 'object?'` 与 `card: 'object?'`；`items` 不变（P-08） | S6-2 |
| `eden-map:th`（查看器 → 宿主） | 登记已有的 `prefs: 'object?'` 字段（设置开关就装在它里面，包括 §8 的新开关） | S6-3 |
| `eden-map:chars`、`eden-map:events`、`eden-map:stash` | 行里可以带 `node`（数组内容不做形状检查；`SCHEMA` 注释写明） | S6-1（只写文档） |

没有新的查看器 → 宿主意图。物品页签什么都不写：拾起世界藏物复用 `eden-map:loot`（地图上发光标记发的同一个意图），飞过去只在查看器
本地发生。

### 2.4 各页签怎么用实体

| 页签 | 实体 | 视图 |
|---|---|---|
| 事态 | 事件实体 | 列表与图例不变（`events-view.mjs`） |
| 人物 | 人的实体 + 名册分组 | 在场组里按 §4 分节；其他名册组不变 |
| 物品 | 四个来源的物品实体 | §6 的分组 |
| 地点 | 地点卡（不基于实体） | 不变 |
| 图例 | 包的 `ui.legend` | 不变 |

`PresentEntities`（词汇表）= `presentAt(entities, here)`：节点等于玩家所在节点、或带 `present` 标记的实体。

## 3. 抽屉页签注册表（K-R72）

### 3.1 内核页签集合与顺序

页签集合由内核固定（K-R02 的 UI 行）。抽屉 id 保持探针在用的两字母 id。

| K-R57 名字 | 抽屉 id | 归属模块 | 图标 | 算不算撑起抽屉（`keepsDrawer`） | 回退顺序 |
|---|---|---|---|---|---|
| `events` | `ev` | `events-view.mjs` | `bell` | 算 | 1 |
| `characters` | `ch` | `characters-view.mjs` | `users` | 算 | 2 |
| `items` | `it` | `stash-view.mjs`（S6-3） | `parts`（已有的 `UIIcon` 名；S6 不加新图标） | 算 | 3 |
| `places` | `pl` | `app/drawer-glue.mjs` | `pin` | 不算 | — |
| `legend` | `lg` | `app/drawer-glue.mjs` | `info` | 不算 | — |

顺序：`ui.tabs`（K-R57：名字、子集与顺序；schema-1 包可以写在 overlay 的 `ui` 块里，`applyOverlayUi` 已经把它当「其他键」带过来）。
不认识的名字忽略。`places` 永远在：`ui.tabs` 里漏了它，就放在图例前的最后一位。图例不在 K-R57 的清单里：永远最后，由自己的规则决定显隐。
默认（没有 `ui.tabs`）：`events, characters, items, places, legend`（P-03）。

### 3.2 `map/app/tabs.mjs` 的契约

```
provideTab(id, def)       // 归属模块为某个内核页签提供内容；每个 id 一个提供者（再调一次即替换）
  def = {
    hasData():  boolean,                    // 页签现在有东西可显示
    applies?(ctx): boolean,                 // 这个视图里页签能不能存在；默认 true（三维场景里整个抽屉本来就隐藏）
    label?():   { html, short } | null,     // 页签按钮内容（html 用 esc() 拼；short = { n, fresh } 角标）
    mount?(panel):  void,                   // 懒加载：第一次打开这个页签时调用一次
    render?(panel): void,                   // 页签打开且抽屉没收起时，在 refreshTabs 之后调用
  }
refreshTabs(reason)       // 重算显隐、标签、抽屉隐藏与回退页签；渲染打开着的页签
tabContext()              // { map, owner, kind, scene, narrow, mode }   mode = 'macro' | 'micro' | null（§4.1）
tabSeen()                 // 按聊天的「看过」集合 { ev:Set, ch:Set|null }（从 events-view.mjs 原样搬来）
saveTabSeen()
describeTabs()            // [{ id, name, provided, applies, hasData, visible, mounted, selected }]，给探针（ViewerDebug.tabs）
```

纯规则放在 `map/core/drawer-tabs.mjs`（无 DOM，node 可测）：`KERNEL_TABS`、`tabOrder(uiTabs)` 与 `decide(state)`（§3.3）。
`map/app/tabs.mjs` 只读 DOM 与抽屉（`window.ViewerDrawer`）并调用它们。`ViewerDebug` 增加一个只读 getter `tabs`（不加新的 `window` 全局）。

### 3.3 显隐规则（今天的规则，原样保留）

今天这些规则散在 `drawer-glue.mjs`（`sheetVis`、`cardSheet`）、`events-view.mjs`（`renderBar`）与 `unmapped-place-picker.mjs`。
`decide()` 原样复现：

- `ev` 显示 ⇔ 事态列表非空且事态图层开着。
- `ch` 显示 ⇔ `CharactersView.count() > 0`。
- `it` 显示 ⇔ 物品页签有行（S6-3）。
- `pl` 显示 ⇔ 任一 `keepsDrawer` 页签显示，或地点卡开着，或有未上图的地名。
- `lg` 显示 ⇔ 不是三维场景、当前图有纵深数据、且包里有图例条目。
- 抽屉隐藏 ⇔ 开着三维场景，或（没有 `keepsDrawer` 页签显示、没有卡、窄屏没有层名胶囊、没有未上图的地名）。
- 选中的页签被隐藏（或没有选中）时：按回退顺序（`ev`、`ch`、`it`）取第一个显示的；都没有就用抽屉自己的规则（第一个显示的页签）。
- 选中 `pl` 时关掉地点卡：切到第一个显示的回退页签，并收起到 peek。

今天逻辑的冻结副本（`tests/helpers/drawer_tabs_v1_frozen.mjs`）与 `decide()` 在所有输入组合上逐一对比（S6-1）。

### 3.4 搬迁现有页签

| 今天 | S6-1 之后 |
|---|---|
| `initShell` 用固定列表 `ev, ch, pl, lg` 建抽屉 | `initShell` 用 `tabOrder(RT?.ui?.tabs)` 建（首个包的列表不变） |
| `sheetVis()`（drawer-glue） | 一层薄包装，调用 `refreshTabs('sheet')`（调用方不变） |
| `renderBar()` 决定 `ev` / `ch` 的显隐、标签、回退，并渲染人物页 | `renderBar()` 只保留事态面板内容与事态标签；显隐、回退和人物页走注册表 |
| `events-view.mjs` 里的「看过」存储 | `app/tabs.mjs` 的 `tabSeen()` / `saveTabSeen()`，存储键与 JSON 形状不变 |
| `renderBar()` 里的 `ch` 标签与新人数 | `characters-view.mjs` 提供 `label()`，文字与角标相同 |

## 4. 人物页签按层级（K-R73）

### 4.1 打开着的视图属于哪一级

用运行时树（`app/nodes-runtime.mjs` 的 `RT`）：`owner = RT.host(currentMapId)`；`RT.children(currentMapId).length > 0` 时
`mode = 'macro'`，否则 `'micro'`；视图字段 `x-people`（`"macro"` | `"micro"`）优先（v1：`maps.json` 的 `people`，compat-v1 像
`clouds` → `x-clouds` 那样带过来）。没有运行时树或没有 owner → `mode = null`，人物页完全照今天画。这个函数是纯的
（`core/entities.mjs` 的 `levelMode({ children, viewField }, mapId)`）。

### 4.2 分节

只有在场组变；其他名册组照今天画。在场组里，图上的人（以及在场组里不在图上的名册行，即今天的 `extra`）分成若干节；每个人只列一次，
列在第一个接收他的节里：

| 顺序 | 键 | 宏观 | 微观 | 标题 |
|---|---|---|---|---|
| 1 | `here` | `present` 或节点 = 玩家所在节点 | 同左 | `ch.with_you`（已有） |
| 2 | `n:<子节点 id>` | `owner` 的每个子节点一节（声明顺序），其子树里至少有一个人 | — | 子节点的名字（`i18n.<lang>.name`，否则 `translateName`） |
| 3 | `map` | 节点 = `owner` | 节点在 `owner` 的子树里 | `ch.sec_map`（新增） |
| 4 | `else` | 节点在 `owner` 子树之外 | 同左 | `ch.sec_else`（新增） |
| 5 | `unknown` | 节点为 `null` | 同左 | `ch.sec_unknown`（新增） |

- 空节不画。只有一节非空时，行照今天平铺（不加标题）。
- 微观（P-02）：默认只展开 `here`；其余是折叠的 `<details>`（展开状态记在已有的 `edenMapChGroups` 列表里，键 `sec:<key>`）。
  宏观：每节都展开。
- 行、开关、头像与飞过去都是今天的（`row()`、`rosterRow()`）；节标题是带 `<summary>` 的 `<details class="chsec">`；节标题都不是
  `li`，所以 `#evbar .chpane li` 仍然只数人。

### 4.3 不变的部分

页签的人数与新人角标、地图上的头像、逐人开关、名册分组及其顺序、人物卡。宿主载荷 `eden-map:chars` 在 S6 不变。

## 5. 统一藏物库（K-R74、K-R75）

### 5.1 放在哪里

`<聊天变量>.stash`：首个包是 `eden_map.stash`（它清单里的 `chat.var`），其他 v1 包在 S10 改根键之前是 `tc_<id>.stash`（K-R05：
schema-2 包是 `spatial_<id>`）。键名 `stash` 对每个包都一样（ASCII，命名规则 8）。永不进 `stat_data`（简报规则 5）。

### 5.2 库的形状

```
stash = {
  v: 1,
  items:   { <id>: Row },          // 插入顺序 = 显示时的次序依据
  seq:     number,                 // 最后一个自动编号（id 'i<n>'）
  slot:    Slot | null,            // W12 虚拟槽位（P-05）
  removed: { <id>: msgIndex },     // 经扩展接口删掉的正文行的墓碑（≤ 200，最旧的先丢）
  since:   number | null,          // 本库扫描的第一条消息（§5.6）
  upTo:    number | null,          // 已扫描到的最后一条消息
  from?:   { keys: string[], msgIndex: number | null }   // 库由 v1 键迁移而来时才有（§5.4）
}
Row = {
  name: string（1–60）, place: string（≤ 60，'' = 没有）, map: string（≤ 40）, node: string（'' = 未解析）,
  hidden: boolean, note?: string（≤ 200）, qty?: number（2–999）,
  src: 'text' | 'map' | 'api' | 'legacy', carried: boolean, msgIndex: number | null, mark?: string
}
Slot = { name, path, virtual: boolean, msgIndex: number | null, facts: { <id>: { name, place?, msgIndex } } }
```

- id 沿用 v1（`i<n>`、世界藏物的 `s…` 或包自己给的 id、正文的 `x…` = `pickup.itemId(name)`）：三维页的「已拿到」清单
  （`estate:taken`）与世界藏物的发光照常工作。
- `mark`（只有正文行有）= 该行来源消息正文的 `hashText`（FNV-1a 36 进制，`tavern/context.mjs`）；mark 不同 = 那条消息变了（§5.6）。
- `node` 在写入时、宿主的地理能定位 `place` 时解析；为 `''` 时读取方自己对 `place` 定位。

### 5.3 行的含义：随身与存放（P-04）

| src | 由谁写入 | carried |
|---|---|---|
| `text` | 消息的拾取扫描（§5.6） | true |
| `map` | `eden-map:loot` / `estate:loot`（玩家拿走的一条世界藏物） | true |
| `api` | `EdenMap.setInv(name, patch)` | false（存放在 `place`） |
| `legacy` | 迁移时认不出来源 | false |

地点卡的「存放」行（`stash-view.mjs`）和注入摘要行照今天按地点列出每一行；只有物品页签读 `carried`。

### 5.4 从 v1 键迁移

在 `root-store.mjs loadCustom` 里只跑一次：没有 `stash`、且有 `仓库` 或 `槽位` 时（P-06、P-07）：

| v1（`仓库.items.<id>`） | Row |
|---|---|
| `名` | `name` |
| `地点` | `place` |
| `层` | `map` |
| `暗格` | `hidden` |
| `说明` | `note` |
| `数量` | `qty` |
| — | `node: ''`、`msgIndex: null` |
| id 规则 | `id === itemId(name)` 时 `src: 'text'`、`carried: true`；id 符合 `^s[0-9a-z]{1,8}$` 或是世界藏物的行 id 时 `src: 'map'`、`carried: true`（世界藏物可能晚于迁移才加载：届时一次性的 `retag` 把这些 `legacy` 行升级）；其余 `src: 'legacy'`、`carried: false` |

`仓库.seq` → `seq`。`槽位 = { 名, 路径, 虚拟, 楼, 物: { <id>: { 名, 楼, 地点? } } }` → `slot = { name, path, virtual, msgIndex,
facts: { <id>: { name, msgIndex, place? } } }`。`since = 最新消息`、`upTo = since - 1`（最新那条由新宿主扫一次；扫描按 id 幂等），
`from = { keys, msgIndex }`。

**v1 键在 S10 之前只读。** 根对象是整块写的（`saveRoot` 整个替换），所以库要保留加载时的 `仓库` / `槽位` 值，每次保存原样写回；
没有任何代码改写或删除它们。幂等：第二次加载已经有 `stash`，不会再迁移。

### 5.5 宿主流

`tavern/loot-flow.mjs` 改名为 `tavern/stash-flow.mjs`（P-11）；`createStashFlow(host)` 保留 W2 掷骰、失败环、动作注入和结算闸门；
它的库是 `stash`（不再有 `inv`，也不再有单独的 `slot`）。一轮：

1. `scanPickups(msgs, hereNow)` → 对窗口里的新消息跑 `step()`（§5.6）；最新那条的地点是 `hereNow`（今天的规则），更早被跳过的消息用
   它自己那条消息变量里的地点，没有就是 `''`。
2. 写入经结算闸门请求（`gate().request('sync', stashSync)`），在本轮末尾放行（W11 时序不变）；W11 审计与携带行照常跑在同一批事实上。
3. `takeLoot`（地图拾取）写入世界藏物行：`src: 'map'`、`carried: true`、`msgIndex = 最新`，把它的事实记进槽位，走同一条写入路径。
4. `sendInv()` 发 `eden-map:inv`（§5.7）；在 ready、有改动、以及卡内行变化时发。
5. 注入行：同样的行，`digestLine(stash)` 与 `slotLine(stash.slot)` 产出的文字与今天逐字节相同（对 v1 函数的冻结副本钉住）。

### 5.6 重算与对账（K-R75）

`map/tavern/stash-recompute.mjs`（纯；导入 `core/pickup.mjs`、`core/ledger.mjs`、`tavern/stash-store.mjs`）：

```
scanMessage(stash, msg, ctx) -> { stash, added }
  msg = { msgIndex, text, place }; ctx = { worldNames, vocab, probe }   （probe = ledger.slotProbe(stat) 或 null）
  known = worldNames ∪ 库里各行的名字
  facts = pickup.scan(text, { known, floor: msgIndex, place, vocab })
  按顺序处理每条事实：removed[id] >= msgIndex 或 items[id] 已存在 → 跳过；
    否则 put { id, name, place, note: TEXT_NOTE(msgIndex), qty 1, src 'text', carried true, msgIndex, mark: hashText(text) }，
    若 removed[id] 早于 msgIndex 则删除这条墓碑
  有 probe 且事实非空：slot = slotDeclare(slot, probe, msgIndex)；slot = slotPut(slot, facts, msgIndex)
  upTo = max(upTo, msgIndex)
replayMessage(stash, msg, ctx)   删掉该 msgIndex 的正文行与槽位事实，再 scanMessage
step(stash, msgs, ctx)           正文行 mark 不同的消息逐条重放；msgIndex > upTo 的消息按升序扫描；`since` 之前的消息永不扫描
recompute(msgs, { since, actions, removed, ...ctx })
                                 从同一个 `since` 的空库开始折叠：每条消息（升序）先 scanMessage，再应用 msgIndex 等于它的动作；
                                 msgIndex 为 null 的动作最先应用（它们早于 `since`）
actionsOf(stash)                 src 为 map | api | legacy 的行，以及墓碑
reconcile(stored, recomputed, { comparePlace }) -> { ok, missing, extra, changed }
```

`TEXT_NOTE(n)` 是今天的说明文字（`正文拾取 · 第 n 楼`，因为它会进摘要行，所以原样保留）。

**什么算对上：** `reconcile(stored, recompute(msgs, { since: stored.since, actions: actionsOf(stored), … }))` 为 `ok`，当且仅当两边的
物品 id 相同，每个 id 的 `name, src, carried, msgIndex, qty, hidden, note, mark` 相同（调用方提供了它用的地点时，`place` 也要相同），
槽位事实也相同。`missing` / `extra` / `changed` 列出差异。node 测试把一段合成聊天按每轮一条消息喂给实时折叠（与 `stash-flow`
同样的调用），再与批量重算比较：逐项相等；然后丢掉库再重算：还是相等。

**实时偏差：** 宿主可以按需跑 `reconcile`（设置里的自检）；偏差只报告件数，绝不悄悄修（P-09）。

### 5.7 线上格式（P-08）

```
eden-map:inv = {
  items: [{ id, 名, 地点, 层, 暗格, 说明?, 数量? }],         // 今天的旧行（wireRows），顺序相同
  stash?: { v: 1, rows: [{ id, ...Row }], slot: { name, virtual, count } | null },
  card?:  { path, rows: [{ name, qty?, text? }] } | null       // §6.3
}
```

`EdenMap.getInv()` 继续返回旧行（S10 之前是对外契约）。

## 6. 物品页签（K-R76）

### 6.1 分组

| 组 | 行 | 动作 |
|---|---|---|
| 随身 | `carried: true` 的库行 | 飞到拾到它的地方（能定位时） |
| 这里 | 存放在玩家所在节点的 `carried: false` 库行；玩家所在节点上还没被拿走的世界藏物（暗格只在玩家站在那个点上时出现，即 `app/stash-markers.mjs` 的规则） | 世界藏物：「拾取」（发 `eden-map:loot`，与发光标记同一个意图）；自有行：无 |
| 其他地点 | 存放在别处的 `carried: false` 库行，每个地点一个小标题 | 飞到那里 |
| 卡内 | 卡自己的物品栏（§6.3） | 无（只读） |

空组不画；任一组有行时页签显示（它算撑起抽屉，P-03）。角标 `n` = 随身行数。没有新增角标。

### 6.2 行的字段

名字（照原样，`textContent`）、数量大于 1 时 `×n`、暗格行带暗格词（`inv.hidden`）、地点作为第二行、说明作为行的 `title`。包里的文字只以
文本进入页面（K-R64）。飞过去用 `hereRes(place)` 定位并复用现有的飞行：房间用 `CustomNamesView.flyTo({ room })`，地标用
`{ map, marker }`，否则 `go(map)`；定位不到的地点没有按钮。

### 6.3 卡内物品栏（只读）

`mvu-readers.mjs cardInventory(stat, path)`（纯）：卡 `stat_data` 里 `path` 处的表，拆开 MVU 的 `[值, 注释]` 对；以物品名为键的对象
（值：数字 = 数量，字符串 = 文字，对象 = 它的第一个数字和第一个字符串）或数组（字符串 = 名字；对象：按内核的名字词找名字字段，第一个数字）。
最多 100 行，名字 ≤ 60 码点。`path` = 包的 `vars.inventory`（新的可选变量，K-R76），否则是 `ledger.slotProbe` 找到的、且不是虚拟的那个字段，
否则没有（这一组不画）。物品栏词表从 `core/ledger.mjs` 的 `SLOT_KEYS` 搬到 `core/vocab.mjs`（`EXACT.inventory`，词与顺序不变）。
`stat_data` 永远不写。

## 7. 拾取词表（K-R77）

### 7.1 动词分类

| 类 | 宾语必须 | 内核动词 |
|---|---|---|
| 普通 | 带引号、或带量词、或是已知物品名、或是 2–8 字且不是泛指词的裸名词 | 今天的 `VERBS`（中文）与 `picks up`、`picked up`、`grabs`、`grabbed`、`pockets`、`pocketed` |
| 严格 | 带引号、或带量词、或是已知物品名；裸名词永远不算 | `获得`、`得到`、`拿取`；英文 `obtains`、`obtained`、`gets`、`got`、`takes`、`took`、`receives`、`received`、`acquires`、`acquired`（英文严格类：只认引号或已知名） |

已知物品名 = 世界藏物的名字 + 库里已有的名字（今天的规则）。

### 7.2 算数的句式

- 动词（+ 体标记）+ 量词短语 + 名词：`获得了一枚徽章`、`得到一个木盒`。
- 动词 + 引号里的名字：`获得了「星辉碎片」`。
- 动词靠近已知物品名（24 个字符以内，今天的规则）。
- `把` / `将` + 名词 + `拿取`（处置式；另外两个严格动词不接这个句式）。
- 英文：动词 + 可选限定词 + 引号名或已知名：`got the "Brass Key"`、`took the Brass Key`（已知）。

### 7.3 永不算的句式（所有动词，P-12）

| 句式 | 规则 |
|---|---|
| 抽象宾语 | 宾语在 `NOT_ITEMS`（内核清单，S6-3 扩充）或包的 `not_items` 里 |
| 否定 | 同一分句里、动词前 4 个字符以内有否定词（`没`、`没有`、`未`、`不`、`别`、`无法`、`不能`、`没能`）；英文动词前 3 个词内有 `not`、`n't`、`never`、`no longer` |
| 疑问 | 动词所在分句以 `？` / `?` 结尾，或以疑问语气词（`吗`、`呢`、`么`）结尾，或以 `是否` / `能否` / `有没有` / `要不要` 开头 |
| 对白 | 动词落在引号段里（`“…”`、`「…」`、`『…』`、`"…"`）；紧跟在动词后面开始的引号是「引号名」句式，不是对白 |
| 意图或条件 | 同一分句、动词之前有：`想`、`要`、`打算`、`准备`、`试图`、`企图`、`希望`、`如果`、`要是`、`假如`、`若`；英文 `want to`、`try to`、`if`、`would`、`will` |
| 可能补语 | `得到` 紧跟在构成「能做到」的动词字之后（`看`、`听`、`想`、`做`、`找`、`买`、`办`、`猜`、`闻`、`感`、`觉`、`等`、`赶`、`追`、`吃`、`用`、`见`） |
| 复合词 | `获得` 后面紧跟 `者` 或 `感` |

分句在 `。！？；…` 及其半角形式和换行处结束。

### 7.4 英文与 I-08 修复

I-08：今天「Mara picked up the Brass Key.」得到 `['the', 'Brass Key']`，因为中文的裸名词句式也在英文动词上跑，并在第一个空格处停下。
修法：中文句式只用中文动词；英文句式接一个可选限定词（`a`、`an`、`the`、`some`、`his`、`her`、`their`、`my`、`your`、`its`），
后面至少一个空格；`tidyEn` 去掉开头的限定词。修好之后：`['Brass Key']`；「I grabbed an apple and left」→ `['apple']`
（今天是 `['an', 'n apple']`）。

### 7.5 按包扩展

`items.pickup.<lang>`（schema 2，K-R46）：`verbs`（普通类）、`verbs_strict`（新增，严格类）、`verbs_off`、`not_items`。schema-1 包：
overlay 可以带 `items.pickup`（K-R67 的扩展；`fromV1` 合并：各清单取并集，`verbs_off` 也取并集）。宿主经 profile 读到它
（`profile.pickup`，由 `profileOf` / `profileFromV1` 构造），传给 `scan(text, { vocab })`。追加项扩充内核清单，`verbs_off` 去掉内核动词，
词都是字面字符串（没有正则，K-R01）。最小包已经声明了 `en.verbs: ["snatches"]` 与 `not_items: ["the tide"]`：S6-3 的测试就用它。

## 8. npc 与事件的结算写入路径（K-R78、I-04）

「写入路径」的意思：W11 审计通过校验的单项补丁，落到地图自己拥有的地方。地图从不写 `stat_data`，所以落点是地图自己的聊天变量：

```
<聊天变量>.ledger = {
  npc:    { <名字>: { place, node, msgIndex, src: 'routine' } },          // ≤ 200 条
  events: { <键>:   { type, level, node, msgIndex } }                      // 键 = 事件 id；≤ 200 条
}
```

| 域 | 事实（产出方） | 落盘视图 | 何时补丁 | 由谁写入 |
|---|---|---|---|---|
| npc | 本轮的日程落点（`host.chars` 里 `src: 'routine'` 的行），权威 `verified` | MVU 在场名册的地点 ∪ `ledger.npc`；名册里有这个人但地点为空 = **空洞** | 这个人是空洞且事实带地点（纪律 ⑤「只补空洞」：已经有地点的人——来自 MVU 或来自 ledger——永不覆盖） | `stash-flow` 经结算闸门 |
| 事件 | 本轮解析出的事件（`r.events`，即聊天记录），权威 `committed`，类型 = 包的类型 id（K-R50） | `ledger.events` | 事件 id 不在 ledger 里 | 同上 |

- 开关 `edenMapLedgerWrite`（默认关，简报规则 6）：存储键登记在 `core/storage.mjs` 的 `KEYS`（owner `host`，默认 `'0'`）；
  `eden-map:th` 的 `prefs` 字段登记进 `SCHEMA`；设置 → 酒馆助手（`app/tavernhelper-settings.mjs`）里一个复选框；文案
  `th.ledger_write` 中英各一份。关着 = 不产出 npc / 事件事实，与今天完全一致。
- 审计学会认空洞：落盘值 `''` 是空洞（补丁），不是 `stale-value`（`core/ledger.mjs audit` 的一处规则改动，钉住）。
- 事件域按包的类型 id 加 `EVENT_TYPES` 检查类型（`audit` 的 `eventTypes` 选项）。
- S6 里的消费方：落盘视图（这两个域因此能结算，不再挂在携带行上）和 `describe()`；绘制已结算的事件与 npc 地点是 S8 的事。
- ledger 是可丢弃的缓存：每一条都能从聊天和日程重算。

## 9. 内核契约新增（计划）

| 编号 | 规则（一行；全文在实施它的步骤里） | 步骤 |
|---|---|---|
| K-R71 | 实体协议：人、物、事件是由纯适配器推导的实体 `{ kind, id, name, node, place, source, msgIndex, present?, data }`；`node` 按引用（K-R28），否则定位（K-R24）。 | S6-1 |
| K-R72 | 抽屉页签：内核页签集合与默认顺序；`ui.tabs`（K-R57）也可来自 overlay 的 `ui`；`places` 永远在；图例最后；显隐规则。 | S6-1 |
| K-R73 | 按层级显示人物：打开的视图有子视图 = 宏观，否则微观；视图字段 `x-people`；在场组的分节。 | S6-1 |
| K-R74 | 一个藏物库 `<聊天变量>.stash`：形状、行字段、`carried`、`slot`、墓碑；从 v1 键单向迁移，v1 键在 S10 之前只读（细化 K-R47）。 | S6-2 |
| K-R75 | 对账：库等于从 `since` 起的消息扫描折叠加上记录下的动作，逐项相等；文字变了的消息重放。 | S6-2 |
| K-R76 | 卡内物品栏：可选的 `vars.inventory`，按内核物品栏词发现，只读；物品页签的四个分组。 | S6-2（读取器）、S6-3（页签） |
| K-R77 | 拾取句式：普通与严格两类动词、永不算句式、英文限定词规则、包的 `verbs_strict`、overlay 的 `items.pickup`。 | S6-3 |
| K-R78 | 结算写入路径：npc 与事件两个域把空洞写进 `<聊天变量>.ledger`，经结算闸门，默认关的开关之后。 | S6-3 |

## 10. 步骤计划

| 步骤 | 范围 | 对拍 / 停止 | 探针 |
|---|---|---|---|
| S6-1 | `core/entities.mjs`、`core/drawer-tabs.mjs`、`app/tabs.mjs`；四个页签搬上注册表；人物按层级；`x-people`；K-R71–K-R73 | 页签显隐对所有输入与冻结逻辑相同；首个包截图除人物页签的分节标题外完全相同 | `accept`、`chars092`、`roster095`、`fix3`、`text_dump`、`e7`、`v2a`、`contrast_v2`、`pack_town`、`s43_parity` |
| S6-2 | 重写 `stash-store.mjs`、`stash-recompute.mjs`、`stash-flow.mjs`（改名）、迁移、线上格式、`cardInventory`、`vars.inventory`；K-R74–K-R76 | 迁移数据与会话夹具的注入摘要行和槽位行逐字节相同；迁移不丢数据；对账相等 | `accept`、`e7_host`、`th_adopt`、`p8_pick_clock_depth`、`pack_town` |
| S6-3 | 物品页签；拾取分类与永不算句式；I-08；包的 `verbs_strict`、overlay 的 `items.pickup`；npc / 事件写入路径；探针 `drawer_stash`；K-R76–K-R78 | 现有拾取测试的每一句正例仍然算；开关关着 = 注入文字完全相同 | `drawer_stash`（新）、`accept`、`e7_host`、`th_adopt`、`pack_town`、`text_dump`、375 px 一次 |

每一步遵守代理简报 §3 的对拍规则：只增加落点或信息的差异，钉进测试、作为 Q 项登记到 `docs/todo.md` §3 并附推荐，然后继续；丢了事件、
人物、物品或注入行，或者注入文字在步骤写明的范围之外变了，就停下。

## 11. 风险

- **混合版本。** 宿主脚本（用户安装的）和查看器（CDN）版本不同：P-08 让 `items` 保持原样；载荷里没有 `stash` 时，新查看器退回旧行
  （每行都当「存放」，没有「随身」组）。
- **整块写根对象。** `saveRoot` 整个替换聊天变量对象：忘了带上 `仓库` / `槽位` 就会删掉它们。S6-2 用测试钉住。
- **台账文件。** `map/tavern/eden-map.js`（675）和 `map/viewer.html`（707）在行数台账里，不许变长：物品页签放在已经加载的
  `stash-view.mjs` 里，入口里要改的行原地改。
- **行数上限。** `events-view.mjs` 已有 398 行；S6-1 只从它往外搬逻辑，绝不往里加。
- **拾取召回。** 永不算句式用召回换精度（K-R46：「宁可漏不可误」）；现有正例语料钉住，叙述里的拾取召回不下降。
