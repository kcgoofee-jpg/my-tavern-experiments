# 总体架构评审（2026-09-28，分支 cloud/tc-mid-low）

角色：资深软件 / 产品架构师。只看整体设计，不逐行审代码。依据：onboarding、arch-v2、generalize/README、versioning、tooling、render-retro、render-deps、upper-setting v2（含纵深系统）、ui-v2/spec、ui-refactor-backlog、card-buildings、skills/card-map，以及 map/、tools/、blender/ 的目录结构和少量 grep。

## 0. 结论

大方向是对的：外挂脚本加世界书、核心与包分离、协议有版本号、smoke 有门控、渲染有依赖表。主要问题有三个。
1. **同一个概念存在多个真相源**：岛的数据有 4 份 JSON，霾有 4 套实现，Eden 包有 manifest 和 `core/pack.mjs` 两份定义。
2. **渲染产物和数据之间没有可复现的绑定**：只靠 git 时间戳做告警。
3. **文档和工具按「版本」累积**：v9、v10、v11 并存，没有退役机制。

纵深系统正好会碰上第 1 条。所以动手之前，要先定好它的唯一数据源和唯一数学模块。

## 1. 评分卡

| 领域 | 分 | 一句话 |
|---|---|---|
| 模块边界（core / pack / app / ui / 三维 / Blender） | 6.5 | core 已经抽出来了。但 Eden 仍是「内置特例」，app 和 core 各有一个 fog |
| 协议（地图 ↔ iframe） | 7 | `core/protocol.mjs` 有 PROTO=2、宽容解析、token。`estate:*` 子页消息还没全部登记进表 |
| 数据模型 | 5 | maps.json 和 addon_places 有 check_maps 把关。岛 / 纵深 / 房间 / 图集各自一份，缺少跨文件的键约束 |
| 纵深系统准备度 | 4 | 设计稿很好，但数据散在 `tc_islands*.json`、`upper_haze.py`、`tiancheng_upper.py --haze` 和前端 fog 里 |
| 渲染管线 | 5.5 | region_patch、blender_run、依赖表都有了。产物不记录输入哈希，不可复现，DZI 直接进 git |
| 交付与版本 | 7.5 | 加载器、head.json、镜像、强制更新都想清楚了，规则只写在两处。正式版暂停后，跟随版成了事实上的正式版 |
| 可扩展性（工坊 / card-map） | 6 | pack schema 已经有了。工坊需要的「用户岛」数据与信任边界还没定义 |
| 可维护性 | 5 | 93 个 docs 文件，其中 reviews 46 个；v9、v10 工具和数据都还在；map/art 42 MB 在 git 里；测试 46 个，smoke 不错 |

## 2. 分项发现

### 2.1 模块边界
- **Eden 包是双份定义**。`map/packs/eden/manifest.json` 自己写着「与 core/pack.mjs 的 EDEN 一致」，靠测试同步。应改成运行时只读 manifest；`core/pack.mjs` 只保留加载逻辑。
- **霾 / 雾有 4 处实现**：`map/core/fog.mjs`、`map/app/fog.mjs`、`tools/upper_haze.py`（HAZE={'low':.42,'mid':.14}）、`blender/tiancheng_upper.py --haze`。纵深系统会再加一处。这是最典型的重复。
- **三维外壳已经统一到 `ui/chrome3d.js`**（U7 / U11），方向正确。`map/props/*` 和 `map/estate` 仍是两套加载与消息通道，应共用一个「三维子页适配器」。
- **ui 与 app 的分界**：`ui/` 是组件（sheet / notice / chrome3d / gallery），`app/` 是业务。但 `app/settings.mjs` 和 `app/storage-ui.mjs` 实际上是 UI。建议约定 `ui/` 不 import `app/`，然后用 grep 做门控。
- **Blender 侧**：`tc_common.py` 和各层脚本之间没有和前端共享的配置。常量（W_U=30、H_U=18.75、z=(海拔−700)/100）在 Python 里硬编码，前端又各写一份。

### 2.2 协议
- 优点：信封是 `{type, v, t}`；对缺 v、比本端新的消息都宽容接收；有 `newer-unknown` 分支。
- 缺口：`estate:*` 大约 14 种消息只有部分登记在 protocol 表里；props 查看器的消息没有进表。建议 schema 表覆盖所有 iframe，并加一个测试：grep 出所有 `type:'…'` 字面量，必须都在表里。
- 画廊上传（IndexedDB）和公开导出不要走 postMessage 传大 blob。要传的话走 `transfer`，并单独给一个消息族 `gallery:*`。

### 2.3 数据模型：真相源与漂移点
| 概念 | 现在的来源 | 漂移风险 |
|---|---|---|
| 地点（地图 ↔ 世界书） | maps.json + addon_places.json → build_worldbook_addon | 低（check_maps 会拦） |
| 上层岛位置 / 海拔 | `blender/data/tc_islands.json`、`_v9A`、`_v9B`、`_v10`，外加 `map/data/tc_upper_markers.json` | **高**：Blender 读 blender/data，前端读 map/data，两边没有一致性检查 |
| 纵深参数 | 设计稿表格，将来写在代码里 | **高**（见 §3） |
| 房间 | eden_estate_rooms.json + estate/plan.js + blender/estate2 | 中：plan.js 是上游，rooms.json 是否由它派生不明确 |
| 名字 / 别名 | 卡原名 + 用户自定义别名 + 世界书触发词 | 中：别名只应存在于一个表，其他地方引用 id |
| 图集 | gallery.json、room_galleries.json、IndexedDB 本地上传 | 中：公开图集和本地图集的 id 空间必须分开 |

原则：**一个概念 = 一个 JSON + 一个 schema + 一个 check**。其他文件只能引用 id，或者由脚本派生出来，并在文件头写明「生成物，勿手改」。

### 2.4 渲染管线
- 链路：资产（blender/**）→ 整图 PNG → upper_haze 之类的后处理 → region_patch → make_dzi → git → jsDelivr（warm_cdn）。
- **不可复现**：产物不记录输入。建议 make_dzi 同时写一份 `*.dzi.meta.json`，内容包括源脚本的 git 哈希、数据文件哈希（tc_islands、depth）、Blender 版本、参数，以及 region_patch 的区域列表。check_render_deps 改为比较哈希，不再比较时间戳。
- region_patch 的补丁应当记账（区域、原因、输入哈希），否则多次局部修补之后无法重建整张图。
- DZI 进 git 会让仓库线性膨胀（art 已有 42 MB，每次重渲都会叠加历史）。短期可以接受，因为 jsDelivr 依赖它。中期应把瓦片放进单独的资产仓库或 npm 包（已经有 pack_npm.sh），主仓只保留指针。

### 2.5 交付与版本
- 加载器、head.json 和标签列表的回退链设计得扎实。版本逻辑只写在两处，也有测试。
- 风险：长期只有跟随版，用户群实际上都在「主干最新」上。一次坏提交就会直接打到所有人。恢复发版之前至少要有 **canary**：先把 head.json 指到一个经过 smoke 和浏览器测试的提交，而不是每次推送都指过去。bump_head 应当只在门控通过后才执行。
- 恢复发版后分三个通道：stable（标签）、follow（head.json）、dev（分支 HEAD）。强制更新只在 stable 上用。

### 2.6 工坊与 card-map 的可扩展性
现在就需要定住的东西：
1. **pack schema v1 冻结**：字段只增不改，加 `schema` 版本号，并准备迁移函数。
2. **岛（island）是一等实体**：id、名字、别名、x / y、海拔、半径、style、glb、depth 覆盖值。工坊的「用户自建岛」就是往这张表里加一行，再加一个本地资产引用。
3. **信任边界**：用户内容（工坊岛、图集上传）只存本地；导出为纯数据（JSON + 图片），不能带脚本；导入时走 schema 校验。
4. **插件扩展点**：`app/plugins.mjs` 和 `extapi.mjs` 的 API 要写版本号。

### 2.7 可维护性
- 文档：reviews 和 drafts 是过程产物，应按月归档到 `docs/history/`。onboarding 只链接「现行」文档，其余文档在文件头标注状态（现行 / 已取代）。
- 死代码：`tools/upper_layout_v9.py`、`upper_layout_v10.py`、`tc_islands_v9A/B/v10.json`、`tools/legacy`、`map/_proto`。确认不再用之后移到 history 或删除。
- 门控：smoke 已经相当完整。建议补三项：协议字面量覆盖、岛数据 Blender ↔ 前端一致、depth schema。
- Agent 规则（检查点、blender_run、安静期锁、cat 别名）散落在 onboarding、memory 和 SKILL 里。应以 onboarding 的「硬规则」为唯一来源，其他地方只引用。

## 3. 纵深系统放在哪里：接口规格（交实现者）

**单一数据源**：`map/data/upper_depth.json`（schema 为 `map/data/schema/depth.schema.json`）。
```json
{
  "schema": 1,
  "layer": "tc_upper",
  "units": { "xy": "100m", "alt": "m" },
  "camera": { "alt_near": 1450, "alt_far": 820 },
  "channels": {
    "scale":   { "near": 1.0,  "far": 0.58 },
    "haze":    { "near": 0.0,  "far": 0.45, "color": [236,239,245] },
    "tint":    { "near": [1.04,1.0,0.92], "far": [0.9,0.95,1.05], "sat_far": -0.4, "gamma_far": 0.8 },
    "label":   { "opacity_near": 1.0, "opacity_far": 0.65 },
    "parallax":{ "near": 1.0, "far": 0.2, "enabled": false }
  },
  "cloud_sheets": [ { "id": "c1", "alt": 1150 }, { "id": "c2", "alt": 1020 }, { "id": "c3", "alt": 930 } ],
  "islands": { "eden": { "alt": 1450, "d": null, "overrides": { "haze": 0 } } }
}
```
- 岛的 x / y / 半径仍放在唯一的岛表（把 `blender/data/tc_islands.json` 并入 `map/data/`，或者由它生成）。`upper_depth.json` 只放纵深相关字段，并用岛 id 引用岛表，不再重复写坐标。
- `d` 默认由海拔算出：`d = clamp((alt_near − alt)/(alt_near − alt_far), 0, 1)`。`d` 可以显式覆盖，用于「退路方案」（保持 v11 海拔，只调 d）。

**唯一的纵深数学模块**，两种语言实现同一规格：
- `map/core/depth.mjs`：`depthOf(island, cfg)`、`channel(name, d, cfg)`（线性插值，外加 overrides）、`cloudsAbove(alt, cfg)`。纯函数，不碰 DOM。
- `blender/depth.py`（Blender 合成与 `upper_haze.py` 都调用它），函数一一对应。
- **一致性测试**：`tests/fixtures/depth_golden.json` 列出（岛, 通道）→ 期望值。node 和 python 各跑一遍，结果都必须等于它。这条接进 smoke。
- 退役：`upper_haze.py` 里的 HAZE 常量和 `tiancheng_upper.py --haze` 改为从 depth 模块取值；`app/fog.mjs` 与 `core/fog.mjs` 合并，并调用 depth。

**按层配置**：每一层可以有自己的 `<layer>_depth.json`，同一个 schema，默认不存在。maps.json 里对应层加 `"depth": "data/upper_depth.json"`。viewer 看到这个字段才启用视差 / 悬停聚焦。

**渲染绑定**：成图的 meta 里记录 `upper_depth.json` 的哈希。改了纵深参数，check_render_deps 就报「需重渲」，也提示可以只在后处理层重跑。所以烘焙进底图的只能是「重」的通道（云片、雾）；标签、视差、悬停这类「轻」的通道留给前端实时计算。

**门控**：schema 校验；岛 id 必须存在于岛表；golden 测试；新增岛时同一次提交必须加上它的 depth 条目（check_maps 会拦）。

## 4. 风险排序
1. 岛与纵深数据分叉（Blender ↔ 前端），导致底图和交互对不上，需要重渲。**高 / 近**
2. 跟随版没有 canary，一次坏推送直接影响全部用户。**高**
3. 渲染不可复现，region_patch 累积之后无法重建整图。**中高**
4. 工坊或图集导入的用户内容没有 schema 或信任边界。**中高（上线后）**
5. 仓库随 DZI 历史膨胀，影响 clone、agent 速度和 jsDelivr 单包限制。**中**
6. 文档和版本化工具堆积，agent 读到过时规则。**中**
7. Eden 双份定义，通用化时出现只对 Eden 生效的分支。**中低**

## 5. 前 10 条建议（按 影响 ÷ 工作量 排序）
| # | 建议 | 负责 | 工作量 |
|---|---|---|---|
| 1 | 建立 `upper_depth.json`、schema、`core/depth.mjs` + `blender/depth.py` 和 golden 测试（§3） | 纵深实现者 | 1 天 |
| 2 | 岛表合并为唯一一份（v9、v10 变体移到 history），前端 markers 由它生成，加一致性检查 | 渲染 / 数据 | 0.5 天 |
| 3 | bump_head 只在 smoke 和浏览器测试通过后执行（canary） | 发布 | 2 小时 |
| 4 | 协议覆盖测试：所有 `type:` 字面量必须在 protocol 表里，estate 和 props 的消息都要登记 | 前端 | 2 小时 |
| 5 | make_dzi 写 `.meta.json`（输入哈希、参数、patch 记账），check_render_deps 改为比较哈希 | 渲染 | 1 天 |
| 6 | 合并 4 套 fog / haze 实现，都走 depth 模块 | 前端 + 渲染 | 0.5 天 |
| 7 | Eden 包以 manifest 为唯一定义，删掉 core/pack.mjs 里的 EDEN 常量 | 前端 | 0.5 天 |
| 8 | 冻结 pack schema v1，定义 island 实体和工坊导入格式（纯数据），先写文档不写代码 | 架构 | 0.5 天 |
| 9 | 文档归档：reviews 和 drafts 按月移到 history，onboarding 只链接现行文档，文档头写状态 | 任一 agent | 2 小时 |
| 10 | 规划瓦片资产和主仓分离（npm 或单独仓库），先出方案 | 发布 | 方案 0.5 天 |

## 6. 继续开发前必须先定下来的事
1. **纵深的数据源和模块位置按 §3 执行吗？** 定下之前不要再改 upper_haze 或前端 fog。
2. **海拔表是用「合并提议」（伊甸 1450 m）还是「退路方案」（保持 v11）？** 这决定 depth 数据里写 alt 还是只写 d。
3. **岛表放在 `map/data/` 还是 `blender/data/`？** 只能二选一，另一边由生成得到。
4. **跟随版要不要 canary？** 以后是否每次推送都自动移动 head.json？
5. **图集和工坊用户内容的边界**：只存本地、导出为纯数据、不执行脚本、id 与公开内容分开。
6. **瓦片是否继续进主仓？** 在下一次整层重渲之前决定。
