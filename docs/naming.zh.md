# 命名 — 规则、改名对照表与术语表

> 英文版为正本；中文版：`docs/naming.zh.md`（标题结构相同，由 `tools/check_zh_mirror.py` 把关）。计划步骤 S0.4（决定 D12）
> 的产出。**本文件不改任何代码：没有任何东西被改名。** 内部名字在 S5（随文件拆分）改，外部契约在 S10 改（带迁移，并由用户
> 再次确认，决定 D5 与 D12）。每一行都对照 head #101（2026-09-30）的代码核对过；所依据的模块地图是 `docs/ARCHITECTURE.md`
> §3。界面文案另有术语表 `docs/i18n-glossary.md`；本文只管代码和数据里的名字。

## 命名规则

1. **文件名说清职责。** 英文单词、短横线连接，模块用 `.mjs`（只有挂到 `window` 的经典脚本才用 `.js`）。不用拼音、不用没解释的缩写、不带卡名或设定包名。只看文件名就该说得出它干什么。
2. **一个概念，全仓一个名字。** 以下面的术语表为准。一个概念现在有好几个名字时（stash / pickup / loot / inventory），表里选定一个。代码里用新词之前，先加进术语表。
3. **共享符号至少 3 个字母、要有含义。** 范围包括导出、`window` 名字、协议常量和跨文件使用的模块句柄；循环变量和一行局部变量除外。通行的缩写保持原样：`MVU`、`DZI`、`LOD`、`i18n`、`URL`、`DOM`、`SVG`、`CDN`、`FPS`、`RNG`、`UI`。其余一律拼全（`th`、`wb`、`cvd`、`ctx`、`ops`、`inv`、`nm`、`tx` 不在名单里）。
4. **同名文件用角色后缀区分。** 同一个名字出现在两个目录时：纯的 core 一侧保留裸名（目录本身已经说了是 core）；查看器一侧加 `-view`；宿主一侧、从聊天正文推导数据的加 `-parse`（否则用职责词，如 `-templates`、`-gateway`）。如果两个文件其实是两件事（`budget`、`layers`），就各取自己的概念名。
5. **引擎标识符里不带卡名或设定包名。** 作为引擎用词的 `TC`（天城）、`eden`、`estate` 都要去掉；中性的产品名是「Spatial Map / Spatial OS」（D5），所以标识符用 `spatial` / `Spatial`。设定包数据（`map/packs/**`、`map/data/**`）和构建工具（`tools/**`）不受此限。
6. **`window` 全局变量只在有非模块使用者时才存在**（经典脚本、浏览器探针、宿主）。形状：单例用 `<概念>Api`，查看器外挂用 `<概念>View`，调试与握手钩子用 `__camelCase`。每个全局变量在表 C 里都要有一行；没有对应行的新全局变量不予接受。
7. **持久化的、跨版本的名字是契约。** 聊天变量键、存储键、协议类型、世界书 `extra` 字段、标签语法、入口文件、CDN 路径和包名只在 S10 改，并做一次性迁移：先读新名字、没有再回退读旧名字、写新名字、旧名字至少再保持可读一个版本、绝不删用户数据。存在于已保存聊天里的东西（标签语法、`data-tcmap`）永远接受。别人拥有的名字（角色卡的）永不改名。
8. **聊天变量键用 ASCII 驼峰。** 属于数据的值（地点名、用户自己写的文字）保持为数据。
9. **改名要脚本化且识别 import。** 短名字（`P`、`M`、`T`、`cur`、`est`、`LS`、`NT`、`nm`、`lp`）在别的文件里也有毫不相干的局部变量，所以纯文本查找替换是错的：用基于语法树的改名，或逐个检查命中。一批改名 = 一组提交，结束时完整测试全绿。
10. **没有冲突。** 每个建议的文件路径都是新的且互不重复。每个建议的标识符在 `map/` 和 `tests/` 里都没有作为 token 出现过，只有三个看过的例外：`storage`、`plugins`、`protocol` 只作为属性名或路径字符串出现、从未作为声明的标识符，以及 `uiTextOr` 是特意让 `tx` 和 `T` 共用的（它们会合并）。S5 开始前要重跑这个检查；head 在往前走。

## 改名对照表

按名字的类别，每类一张表。在用户审阅之前这里没有任何东西是定案；「建议新名」这一列是给审阅用的草案。建议新名写 `(keep)` 的条目只是为了让表完整才列出。

### 如何阅读这些表

- **当前名 / 位置** — 代码里现在的名字，以及它的定义所在的文件和行（`:1` = 整个文件）。
- **含义** — 一句话，对照代码（文件头注释和正文）核对过，不是猜的。
- **建议新名** — 草案新名字。`(keep)` = 不改；`(delete)` = 文件会消失。
- **类别** — *内部*：只有我们自己的代码看得到。*外部契约*：被持久化、或在查看器页面之外被看到的（聊天变量、存储键、协议类型、`window.EdenMap`、入口文件、世界书 `extra` 字段、npm 包名、CDN 路径）。
- **批次** — `S5` 内部批次；`S6` 随 stash 统一迁移（D4）；`S10` 外部批次；`—` 不改；`S5-1` S5-1 按最终名字新建的文件（计入「不改」）。
- **备注** — "refs"（引用）是在 `map/`、`tests/`、`tools/` 里提到该项的文件数（导入、script 标签、登记字符串、`window` 读取），在 head #101 用脚本统计。它说明脚本化改名会波及多远；不是调用点个数，可能差几个。注释和属主字符串也算在内。
- **S5-2 进度** — 备注以「S5-2」结尾的行（改名、删除或拆分）已完成；「当前 / 位置」两列特意保留 head #101 时的名字。`util.mjs` 与 `shell.mjs` 在同一步按职责拆分（决定 (c)）：`coordinates`、`dom-helpers`、`viewport-mode`、`protocol-stamp`、`screen-reader-announce`、`json-cache`、`text-lookup`；`control-column`、`drawer-glue`、`notice-layer`、`status-dot`、`one-hand-mode`、`quick-zoom`。
- **S5-3 进度** — 备注以「S5-3」结尾的行（改名、退役或删除）已完成，由 `tools/rename_s5.mjs --globals tools/rename_s5_globals.json` 执行（`tools/rename_s5_globals_extract.py` 从表 C 和表 D 生成）。「当前 / 位置」两列特意保留 head #101 时的名字。表里一行写一个名字、代码里实际要改好几个的（`cur` 及其同族与 setter、11 个 `T` 包装、21 个模块句柄），备注里列出了改了什么；`storage.get` 保持原名。

| 表 | 行数 | 内部 | 外部契约 | 批次 S5 | 批次 S6 | 批次 S10 | 不改 |
|---|---|---|---|---|---|---|---|
| A. 引擎文件 | 66 | 66 | 0 | 52 | 1 | 1 | 12 |
| B. 同名文件对 | 28 | 28 | 0 | 18 | 0 | 2 | 8 |
| C. Window 全局变量 | 68 | 59 | 9 | 50 | 0 | 10 | 8 |
| D. 短名与不透明标识符 | 28 | 28 | 0 | 28 | 0 | 0 | 0 |
| E. 聊天变量键 | 16 | 0 | 16 | 0 | 3 | 13 | 0 |
| F. 存储、协议、API 与分发名 | 24 | 2 | 22 | 2 | 0 | 21 | 1 |
| 合计 | 230 | 183 | 47 | 150 | 4 | 47 | 29 |

### A. 引擎文件

名字是拼音、不清楚的缩写、或没说清职责的引擎文件，外加连写的词。路径相对于 `map/`。没列出的名字是没被标记，那是判断、不是证明。`util.mjs` 和 `shell.mjs` 也含糊，但需要的是拆分设计而不是改名（见 open 第 6 条）。

| 当前名 | 位置 | 含义 | 建议新名 | 类别 | 批次 | 备注 |
|---|---|---|---|---|---|---|
| `tavern/baibai.mjs` | `map/tavern/baibai.mjs:1` | 可选依赖：外部绘图扩展的桥。读它的角色外貌库、经它的并发闸门出图、拼提示词；扩展不存在时每个函数都安静降级。 | `tavern/imagegen-bridge.mjs` | 内部 | S5 | 拼音（扩展自己的名字）。引用：map 3 个文件、测试 1 个。计划草案写的是 `appearance-bridge`；这个模块的主要写路径是出图，所以本表用 `imagegen-bridge`（已确认，决定 e）。`eden-map.js` 里的别名 `BBm` 跟着改；`docs/baibai-bridge.md` 是文档名，本次不动。 **已在 S5-2 改名。** |
| `tavern/shujuku.mjs` | `map/tavern/shujuku.mjs:1` | 只读兼容可选的「表格数据库」扩展：读它导出的表来取当前地点、时间和「姓名 + 位置」人物表；从不写入。 | `tavern/tabledb-bridge.mjs` | 内部 | S5 | 拼音（数据库）。引用：map 2 个文件（`context.mjs`、`mvu-bridge.mjs`）、测试 1 个（`tests/shujuku.test.mjs`，随之改名）。 **已在 S5-2 改名。** |
| `tavern/th.mjs` | `map/tavern/th.mjs:1` | 酒馆助手的薄封装：功能探测（`hostFns`）、`cdnFetch`、类宏、只作用于显示层的泄露栅栏。 | `tavern/tavernhelper-api.mjs` | 内部 | S5 | "th" = TavernHelper（酒馆助手）。引用：map 1 个、测试 4 个。`cdnFetch` 有三份（这里、`host-th.mjs`、`eden-map.js` 内联；有测试对拍）。 **已在 S5-2 改名。** |
| `tavern/host-th.mjs` | `map/tavern/host-th.mjs:1` | 宿主脚本的酒馆助手适配层：请求包装、函数探测（`thFn`、`fnOk`、`hostFn`、`fnGuard`）、设定包命名空间、脚本变量偏好、世界书自动化。 | `tavern/host-tavernhelper.mjs` | 内部 | S5 | 引用：map 5 个、测试 5 个。与 `th.mjs` 重叠：「取酒馆助手函数」这件事有 `hostFns`、`thFn`、`hostFn` 三个版本。S5 抽 `host-api` 时可合并。 **已在 S5-2 改名。** |
| `app/cvd.mjs` | `map/app/cvd.mjs:1` | 色觉模式（关 / 红绿 / 蓝黄）：安全色板、类与属性开关、向子页广播。 | `app/color-vision-mode.mjs` | 内部 | S5 | CVD = 色觉缺陷。引用：map 7 个文件（部分只是字符串里提到）、测试 1 个。3 个文件里的导入别名 `TCCvd` 改为 `colorVision`。色板的键是设定包的事态大类（已计入卡名词棘轮）。存储键 `edenMapCvd` 见表 F。 **已在 S5-2 改名。** |
| `tavern/failrep.mjs` | `map/tavern/failrep.mjs:1` | 会话级的检定失败报告环（潜行被发现、搜刮失手），下一轮作为客观事实注入。 | `tavern/check-failure-report.mjs` | 内部 | S5 | "failrep" = failure report（失败报告）。引用：map 1 个（`eden-map.js`）、测试 1 个（`tests/action_reflection.test.mjs`）。 **已在 S5-2 改名。** |
| `tavern/ops.mjs` | `map/tavern/ops.mjs:1` | 受限操作 DSL 沙盒：从后台领航员的回复里提取、校验并规范化四种原子操作块（`OP_EVENT`、`OP_CLUE`、`OP_MARKER`、`OP_SUGGEST`）。 | `tavern/operation-dsl.mjs` | 内部 | S5 | 引用：map 1 个（`navigator.mjs` 转出口）、测试 1 个。它导出的 `OPS` 与 `core/ledger.mjs` 的 `OPS` 重名（见表 D）。 **已在 S5-2 改名。** |
| `wbpeek.mjs` | `map/wbpeek.mjs:1` | 地点卡上只读的「世界书档案」胶囊：发 `eden-map:th {op:'wb-peek'}`，把宿主的回复画进卡片抽屉。 | `worldbook-peek-view.mjs` | 内部 | S5 | "wb" = worldbook（世界书）。引用：map 1 个（`viewer.html`）。全局 `TCWb` 见表 C。 **已在 S5-2 改名。** |
| `tavern/tick.mjs` | `map/tavern/tick.mjs:1` | 面板关闭时的后台静默扫描调度器：只读、增量，默认 60 秒、下限 15 秒、每次最多扫 60 层。 | `tavern/background-scan-scheduler.mjs` | 内部 | S5 | 引用：map 3 个（含 `storage.mjs` 里的属主字符串）、测试 1 个、工具 1 个。"tick" 还指 `core/walk.mjs` 的时钟步进和 `TCWander.tick`：三个含义。存储键 `edenMapTick` 在这里导出为 `KEY`（见表 D）。 **已在 S5-2 改名。** |
| `custom.mjs` | `map/custom.mjs:1` | 与 MVU 联动的查看器部分：自定义名称与用途、按世界时间的夜色、本人地点卡的着装行、一次性改名提示（四件事）。 | `custom-names-view.mjs` | 内部 | S5 | 456 行（上限 400，已在棘轮账本里）。S5 本来就要拆：夜色、着装行、改名提示拆走，只有自定义名称留在这个文件。引用：map 1 个（`viewer.html`）。全局 `TCCustom` 是所有外挂里调用最多的（`P.TCCustom` 46 处，见表 C）。文件头注释里出现卡名（棘轮账本已计）。 **已在 S5-2 改名。** |
| `app/tiers.mjs` | `map/app/tiers.mjs:1` | 清晰度档位、省流判断（`lean`）、加载进度、叠加层、标注避让（`declutter`）、航线间隙测量。 | `app/sharpness-tiers.mjs` | 内部 | S5 | 引用：map 20 个文件（改名文件里被引用最多的，务必脚本化改名）。新名字只覆盖第一件事；`declutter` 和叠加层以后可拆成 `label-declutter.mjs`（当前未排期）。存储键 `edenMapTierV2` 见表 F。 **已在 S5-2 改名。** |
| `app/insets.mjs` | `map/app/insets.mjs:1` | 视图放大到插图覆盖的范围时叠一张单独的高分辨率瓦片图（`maps.json` 的 `insets[]`），缩出去就摘掉。 | `app/hires-inset-tiles.mjs` | 内部 | S5 | 引用：map 4 个、工具 1 个。数据字段 `insets` 属于设定包数据（schema v2 在 S1 定），本次不动。 **已在 S5-2 改名。** |
| `section.js` | `map/section.js:1` | 第一个设定包的纵剖面原型绘制（SVG；`validateSection`、`normSection`、`drawSection`）；不在引擎扫描范围内，里面有卡的条目名。 | `vertical-section.js` (moves with the first pack) | 内部 | S10 | 引用：1 个页面（`map/tiancheng.html`）、测试 3 个、工具 1 个。不是引擎代码，S10 随第一个设定包搬进它的仓库（计划风险表），到时再改名。 |
| `here-v2.mjs` | `map/app/here-v2.mjs:1` | 当前地点引擎：聊天里的地点字符串经 `nodes.locate` 在节点树上落点，再还原成使用方读的结果形状；查看器、`tavern/spatial.mjs` 与构建工具共用。 | `place-resolver.mjs` | 内部 | S5 | v1 的解析器 `map/here.mjs` 已在 S3-3 删除。`here` 还是一个 DOM 输入框、一个解析结果和一类消息的名字；术语表：「当前地点」。 **已在 S5-2 改名。** |
| `inv.mjs` | `map/inv.mjs:1` | 空间化背包的查看器侧：这个地点存放 / 藏着的东西，显示在地点卡上。 | `stash-view.mjs` | 内部 | S5 | 同一个概念现在有五个名字（`core/stash`、`core/pickup`、`app/loot`、`tavern/inventory` 和本文件）：见术语表「Stash」。引用：map 1 个。全局 `TCInv`（表 C）。内容在 S6 改。 **已在 S5-2 改名。** |
| `unmapped.mjs` | `map/unmapped.mjs:1` | 小选择器：把一个认不出的地点名指派给节点、标记、房间，或选「忽略」。 | `unmapped-place-picker.mjs` | 内部 | S5 | 引用：map 1 个。全局 `TCUnmapped`（`P.` 引用 9 处）和消息 `eden-map:unmapped`（表 F）。 **已在 S5-2 改名。** |
| `tavern/wb_crystallize.mjs` | `map/tavern/wb_crystallize.mjs:1` | 剧情事实结晶：把坐实的长期事实（来自 `⌖事实` 标签）沉淀成我们附加书里按关键词触发的条目。 | `tavern/worldbook-crystallize.mjs` | 内部 | S5 | 引用：map 1 个、测试 1 个。与 `wb_jit.mjs` 是仅有的两个用下划线的引擎文件，其余都是短横线。 **已在 S5-2 改名。** |
| `tavern/wb_jit.mjs` | `map/tavern/wb_jit.mjs:1` | 世界书即时水合：只启用与当前地点相关的附加条目，其余无损关闭。 | `tavern/worldbook-jit.mjs` | 内部 | S5 | 引用：map 2 个、测试 2 个。标记字段 `extra.eden_jit` / `eden_jit_ignore` 见表 F。 **已在 S5-2 改名。** |
| `tavern/wbsync.mjs` | `map/tavern/wbsync.mjs:1` | 世界书附加条目的写入与自动同步；只动我们自己的书和带 `extra.eden_id` 的条目。 | `tavern/worldbook-sync.mjs` | 内部 | S5 | 引用：map 2 个、测试 3 个、工具 1 个。书名前缀和 `eden_*` 标记字段见表 F。 **已在 S5-2 改名。** |
| `tavern/edenapi.mjs` | `map/tavern/edenapi.mjs:1` | 公开 `EdenMap` API 的机读契约（`EDEN_API`：21 个方法及最少形参数）；宿主暴露时逐项按它做守卫。 | `tavern/extension-api-contract.mjs` | 内部 | S5 | 引用：map 1 个、测试 1 个。文件名里带卡名；API 名字本身（`EdenMap`）是外部契约，S10 再改（表 C）。 **已在 S5-2 改名。** |
| `app/extapi.mjs` | `map/app/extapi.mjs:1` | 本机扩展接口的查看器侧：定义冻结的 `window.EdenMap` 和聊天 id。 | `app/extension-api.mjs` | 内部 | S5 | 引用：map 11 个文件（`chatId`、`LS` 都从它导入）、测试 0 个。 **已在 S5-2 改名。** |
| `tavern/adapter.mjs` | `map/tavern/adapter.mjs:1` | 变量映射：地点、时间、日期、在场分别在 `stat_data` 的哪条路径；按字段名自动发现；用户覆盖按卡存储。 | `tavern/stat-path-mapping.mjs` | 内部 | S5 | 引用：map 2 个、测试 4 个、工具 1 个。"adapter" 没说清它干什么。它的设置页是 `varmap.mjs`（下一行）。 **已在 S5-2 改名。** |
| `varmap.mjs` | `map/varmap.mjs:1` | 设置里的「变量映射」页（仅嵌入时显示）：每个映射项一个下拉，选项来自实际的变量树。 | `stat-path-mapping-view.mjs` | 内部 | S5 | 引用：map 1 个。全局 `TCVarMap`（表 C）。与 `adapter.mjs` 一起改名。 **已在 S5-2 改名。** |
| `tavern/varsync.mjs` | `map/tavern/varsync.mjs:1` | 变量结算时序守卫：账本对账写入先排队，等主变量更新窗口结束后才放行。 | `tavern/settlement-guard.mjs` | 内部 | S5 | 引用：map 1 个、测试 3 个。别与 `varmap` / `adapter` 混淆（它们管路径映射；这个管写入顺序）。 **已在 S5-2 改名。** |
| `tavern/action.mjs` | `map/tavern/action.mjs:1` | 地图驱动的动作：点一个兴趣点就变成一句话，按模式（关 / 填入输入框 / 静默注入）送出。 | `tavern/place-action-injection.mjs` | 内部 | S5 | 引用：map 2 个（含 `storage.mjs` 属主字符串）、测试 2 个。存储键 `edenMapInject`、`edenMapActionTpl`（表 F）。 **已在 S5-2 改名。** |
| `tavern/modes.mjs` | `map/tavern/modes.mjs:1` | 脚本与卡的交互方式：(a) 紧凑状态注入、(d) 标签对账、(e) 最小检查点。 | `tavern/interaction-modes.mjs` | 内部 | S5 | 与文档 `docs/interaction-modes.md` 同名。引用：map 2 个、测试 3 个。导出 `STATE_ID`（注入 id，表 F）。 **已在 S5-2 改名。** |
| `tavern/sources.mjs` | `map/tavern/sources.mjs:1` | 数据源登记表：宿主从哪些地方读聊天状态（供设置页和 `EdenMap.sources()` 用）。 | `tavern/data-source-registry.mjs` | 内部 | S5 | 引用：map 1 个、测试 2 个。 **已在 S5-2 改名。** |
| `tavern/spatial.mjs` | `map/tavern/spatial.mjs:1` | 把当前地点加周边几何编译成有 token 预算的 JSON 坐标契约；还提供 `activationOf`，世界书 JIT 在用。 | `tavern/spatial-contract.mjs` | 内部 | S5 | 引用：map 1 个、测试 2 个。注入 id `eden-map-spatial`（表 F）。"spatial" 单独一个词同时是产品名，所以文件名写清它的职责。 **已在 S5-2 改名。** |
| `tavern/mvu.mjs` | `map/tavern/mvu.mjs:1` | MVU 数据与地图自有自定义数据的纯读取函数（名称、着装、名册、头像、时间）；含 `normCustom`；持有聊天变量根键 `VAR_ROOT`。 | `tavern/mvu-readers.mjs` | 内部 | S5 | 引用：map 5 个、测试 11 个、工具 2 个。容易和 `mvu-bridge.mjs`（唯一允许碰 `Mvu` 全局的模块）混淆。里面的 `get` 和 `val` 在 `adapter.mjs` 里又抄了一份（见表 D）。 **已在 S5-2 改名。** |
| `tavern/navigator.mjs` | `map/tavern/navigator.mjs:1` | 后台「领航员」网关：为私有 key 的规划器做调度、输入装配和回复门控（网络请求由宿主发）。 | `tavern/planner-gateway.mjs` | 内部 | S5 | 引用：map 1 个、测试 1 个。和浏览器全局 `navigator` 撞名；术语表：「规划器 planner」。存储键 `edenMapNav`、`edenMapNavCfg`、`edenMapNavConsent`（表 F）。 **已在 S5-2 改名。** |
| `tavern/llm.mjs` | `map/tavern/llm.mjs:1` | 私有 API key 网关：只算「该怎么调用某个提供方」，自己不联网、不存储。 | `tavern/llm-gateway.mjs` | 内部 | S5 | 引用：map 1 个、测试 2 个。与 `navigator.mjs` 一起改名。 **已在 S5-2 改名。** |
| `tavern/follow.mjs` | `map/tavern/follow.mjs:1` | 跟随分支解析：跨 CDN 镜像从 `head.json` 取某分支的最新构建。 | `tavern/branch-follow.mjs` | 内部 | S5 | 引用：map 1 个、测试 1 个。读 `map/data/head.json`（外部 CDN 路径，表 F）。 **已在 S5-2 改名。** |
| `tavern/snapshot.mjs` | `map/tavern/snapshot.mjs:1` | MVU 快照选取与生成状态规则（纯函数）。 | `tavern/mvu-snapshot.mjs` | 内部 | S5 | 引用：map 1 个（`mvu-bridge.mjs`）、测试 2 个。"snapshot" 还是 `nav.mjs` 里 `snapshot`（切图快照）的名字；加前缀后消歧。 **已在 S5-2 改名。** |
| `app/bridge.mjs` | `map/app/bridge.mjs:14` | 兼容面：为旧全局名（`cur`、`REG`、`go` 等）挂的 34 个只读 `window` getter，浏览器探针仍在读。 | `app/legacy-globals.mjs` | 内部 | S5 | 引用：map 2 个、测试 1 个。"bridge" 还是 `MVUBridge` 和绘图桥的名字：三个互不相干的含义。这 34 个名字在表 C 里合成一行。 **已在 S5-2 改名。** |
| `app/host.mjs` | `map/app/host.mjs:1` | 查看器侧处理宿主消息的模块：来源与令牌检查、协议校验、按类型分派。 | `app/host-messages.mjs` | 内部 | S5 | 引用：map 2 个、测试 1 个。它在查看器里，而 `tavern/host-*.mjs` 在宿主侧：「host」一词两个方向都在用。 **已在 S5-2 改名。** |
| `app/nav.mjs` | `map/app/nav.mjs:1` | 地图切换：带可注册包装的 `go`、快照、地图外壳、另一版底图。 | `app/map-switch.mjs` | 内部 | S5 | 引用：map 15 个文件。"nav" 与 `navigator`、`app/layers.mjs` 的层导航都撞名。 **已在 S5-2 改名。** |
| `app/scale.mjs` | `map/app/scale.mjs:1` | 世界图与城市各层之间的尺度衔接，以及外围的过渡环。 | `app/scale-handoff.mjs` | 内部 | S5 | 引用：map 1 个。常量与全局 `TCScale`（表 C）。 **已在 S5-2 改名。** |
| `app/th-ui.mjs` | `map/app/th-ui.mjs:1` | 酒馆助手功能的设置页：世界书附加条目同步、状态注入、类宏、注入深度。 | `app/tavernhelper-settings.mjs` | 内部 | S5 | 引用：map 1 个。 **已在 S5-2 改名。** |
| `app/storage-ui.mjs` | `map/app/storage-ui.mjs:1` | 设置里的「数据与映射」页：本机存储占用与当前数据源（只读）。 | `app/data-mapping-settings.mjs` | 内部 | S5 | 引用：map 1 个、测试 1 个。设置了 `window.renderStorage`（表 C）。 **已在 S5-2 改名。** |
| `tavern/inventory.mjs` | `map/tavern/inventory.mjs:1` | 聊天变量里的空间化背包（键 `仓库`），汇总成一行注入（纯函数）。 | `tavern/stash-store.mjs` | 内部 | S5 | 引用：map 1 个、测试 3 个。S6 会把它与世界 stash 统一到 `eden_map.stash`（决定 D4）；从 S5 起就用这个文件名，避免 S6 再改一次。术语表：「Stash」。 **已在 S5-2 改名。** |
| `app/loot.mjs` | `map/app/loot.mjs:1` | 地图上的发光拾取物，来自世界 stash；点击时向宿主发拾取意图（`eden-map:loot`）。 | `app/stash-markers.mjs` | 内部 | S5 | 引用：map 2 个。全局 `TCLoot`（表 C）；消息 `eden-map:loot`（表 F）。 **已在 S5-2 改名。** |
| `chars.mjs` | `map/chars.mjs:1` | 人物页与地图头像：落点、成组叠放、逐人开关、飞往。 | `characters-view.mjs` | 内部 | S5 | 引用：map 1 个、测试 1 个。与 `tavern/characters.mjs`（下一行）成对：「chars」和「characters」是同一概念的两种拼法，`core/roster.mjs` 又是第三个名字。全局 `TCChars`（`P.` 引用 33 处）。 **已在 S5-2 改名。** |
| `tavern/characters.mjs` | `map/tavern/characters.mjs:1` | 人物栏：从聊天标签和 MVU 变量里找出人物及其最新位置（纯函数）。 | `tavern/characters-parse.mjs` | 内部 | S5 | 引用：map 3 个、测试 6 个。 **已在 S5-2 改名。** |
| `ui/illust-panel.js` | `map/ui/illust-panel.js:1` | 房间插图面板，驱动可选的绘图扩展。 | `ui/illustration-panel.js` | 内部 | S5 | 缩写 "illust"。引用：map 1 个（`room-gallery-panel.js`）。 **已在 S5-2 改名。** |
| `three/ctx.mjs` | `map/three/ctx.mjs:1` | 共享的三维渲染上下文工厂：像素比封顶、上下文丢失与恢复、真正的释放；全仓唯一创建 WebGL 渲染器的地方。 | `three/render-context.mjs` | 内部 | S5 | 通过 import-map 别名 `three/map/ctx.mjs` 加载（下一行）：没有直接的相对导入、测试 2 个。"ctx" 还指流水线上下文（`CTX`，见表 D）。 **已在 S5-2 改名。** |
| import-map alias `three/map/` | `map/props/viewer3d.html:22` | import-map 里的一条：把说明符 `three/map/…` 指向目录 `map/three/`；三维页面通过它导入我们自己的辅助模块。 | `engine3d/` | 内部 | S5 | 读起来像 `three` 库的一部分。`viewer3d.html` 有 5 处导入，测试里也有路径清单。与文件改名同批处理。 |
| `app/layerhost.mjs` | `map/app/layerhost.mjs:1` | 查看器侧的 LayerRegistry 装配：registry 单例、`.vpslot` 槽位容器、`window.TCLayers` 摘要。 | `app/layer-host.mjs` | 内部 | S5 | 引用：map 14 个、测试 1 个。连写词（`layerhost`、`loadprog`、`depthhaze`、`cardlinks`）与别处的短横线不一致：接下来三行是同一种修法。 **已在 S5-2 改名。** |
| `app/loadprog.mjs` | `map/app/loadprog.mjs:1` | 整屏加载层的进度，与 `ui/progress.mjs` 共用。 | `app/load-progress.mjs` | 内部 | S5 | 引用：map 3 个。导出 `lp`（表 D）。 **已在 S5-2 改名。** |
| `app/depthhaze.mjs` | `map/app/depthhaze.mjs:1` | 为当前纵深平面闭合「纵深 → 雾霾 → depth-haze 槽位 / 迷雾画布」这条回路。 | `app/depth-haze.mjs` | 内部 | S5 | 引用：map 2 个。全局 `TCHaze`（表 C）。 **已在 S5-2 改名。** |
| `app/cardlinks.mjs` | `map/app/cardlinks.mjs:1` | 地点卡底部的链接（跨层通道、三维链接、图集入口）。 | `app/card-links.mjs` | 内部 | S5 | 引用：map 1 个、测试 2 个。这里的「card」是地点卡；在 `chars.mjs` 里 card 指角色卡。术语表：「place card」。 **已在 S5-2 改名。** |
| `core/depth.mjs` (fog-visit part) | `map/core/depth.mjs:44` | 除了纵深数学（`blender/depth.py` 的 JS 孪生）外，这个文件还放着探索台账 `norm` / `visit` / `known` / `count`（到访过的地点迷雾）。 | `core/exploration-ledger.mjs` (the depth math keeps `depth.mjs`) | 内部 | S5 | 引用：map 6 个、测试 4 个（`eden-map.js` 只为探索台账加载它，别名 `FOGm`）。是拆分不是改名：纵深数学那一半必须保留原名，因为有黄金文件对拍测试。聊天键 `探索`（表 E）。 **已在 S5-2 拆分**：新文件 `core/exploration-ledger.mjs`（纵深数学留在原文件）。 |
| `app/estate.mjs` | `map/app/estate.mjs:1` | 庄园 / 三维子页的宿主：带 `<base>` 的 blob iframe、失败钩子、子页消息、通用三维查看器入口。 | `app/subpage3d-host.mjs` | 内部 | S5 | 引用：map 15 个、测试 2 个。"estate"（庄园）是第一个设定包的内容，但引擎把它当作任意三维子页的名字：协议前缀 `estate:`（20 种）、地图 kind `estate`（表 F）、body 类 `estate`。术语表：「sub-page 子页」。 **已在 S5-2 改名。** |
| `core/estate3d.mjs` | `map/core/estate3d.mjs:1` | 三维页的清单契约：校验并解析模型 URL、数据路径和档位回退。 | `core/scene3d-manifest.mjs` | 内部 | S5 | 引用：map 2 个（`estate/main.js`、`props/viewer3d.html`）、测试 1 个。与上一行同样的 "estate" 问题。 **已在 S5-2 改名。** |
| `tavern/loot-flow.mjs` | `map/tavern/stash-flow.mjs:1` | 宿主流：地图驱动的动作注入、检定掷骰与失败环（W2）、结算闸门与漏项审计（W11）、拾取扫描折叠进统一藏物库、扩展接口的行、卡内物品表、`eden-map:inv`、世界藏物表。 | `tavern/stash-flow.mjs` | 内部 | S6 | **已在 S6-2 改名**（P-11，2026-10-01 按默认决定）：S5-1 里叫 `loot-flow`；stash 统一（D4）把它重写了一遍，所以改用词汇表的名字 "Stash"。工厂 `createLootFlow` → `createStashFlow`。 |
| `tavern/chars-flow.mjs` | `map/tavern/chars-flow.mjs:1` | 宿主流：ContextPipeline 与 MVUBridge 装配、世界时间与着装、名册 / 立绘 / 行程 / 日程漫游转发给查看器。 | `tavern/chars-flow.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。持有 `BR`、`CTX`、`MV`（表 D）。 |
| `tavern/root-store.mjs` | `map/tavern/root-store.mjs:1` | 宿主流：地图在聊天变量里的根（`eden_map`）：自定义名称与用途的读写与迁移、本机存储预算、世界书同步、标签改名重放。 | `tavern/root-store.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。持有 `saveRoot`（聊天变量根的唯一写入者）与 `BG`。 |
| `tavern/host-api.mjs` | `map/tavern/host-api.mjs:1` | 宿主流：本机扩展接口 `window.EdenMap`（订阅、头像压缩）与酒馆助手侧的暴露（脚本按钮、类宏、脚本说明、世界书全自动）。 | `tavern/host-api.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。暴露面仍由 `tavern/edenapi.mjs` 守卫。 |
| `tavern/host-checks.mjs` | `map/tavern/host-checks.mjs:1` | 宿主流：启动自检、首次运行自检卡、宿主提示、自动检查更新与版本切换。 | `tavern/host-checks.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。带着入口的版本切换握手（`__edenMapSwitch`，表 C）。 |
| `tavern/llm-flow.mjs` | `map/tavern/llm-flow.mjs:1` | 宿主流：后台调用用户端点或写附加世界书的流：领航员（W5）、世界书即时水合（W6）、剧情事实结晶（W7）。 | `tavern/llm-flow.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。 |
| `tavern/modes-flow.mjs` | `map/tavern/modes-flow.mjs:1` | 宿主流：交互方式 (a)(d)(e)：状态行与空间坐标契约注入、检查点、地点冲突自检。 | `tavern/modes-flow.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。 |
| `tavern/timeline-flow.mjs` | `map/tavern/timeline-flow.mjs:1` | 宿主流：时间轴回放（Part 5-4）与关键帧缓存的接线。 | `tavern/timeline-flow.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。 |
| `custom-tint.mjs` | `map/custom-tint.mjs:1` | 查看器：按世界时间的夜色与时段底图开关（自 `custom.mjs` 拆出）。 | `custom-tint.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。样式表留在 `custom.mjs`（z-index 账本）。 |
| `custom-outfit.mjs` | `map/custom-outfit.mjs:1` | 查看器：宿主推来的本人着装文字（自 `custom.mjs` 拆出）。 | `custom-outfit.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。 |
| `custom-hints.mjs` | `map/custom-hints.mjs:1` | 查看器：经通知层的剧情改名一次性提示（自 `custom.mjs` 拆出）。 | `custom-hints.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。样式表（`#cuToast`）留在 `custom.mjs`（z-index 账本）。 |
| `custom-dialog-view.mjs` | `map/custom-dialog-view.mjs:1` | 查看器：「名称与用途」对话框的纯 HTML 构件（列表、选择器、结果、编辑表单），自 `custom.mjs` 拆出。 | `custom-dialog-view.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。超出本表原列的三块：为了让 `custom.mjs` 降到 400 行以内，又不把 z-index 行移出账本。 |
| `events-fx.mjs` | `map/events-fx.mjs:1` | 查看器：按类型声明的屏幕花屏特效，与世界图城市标记上的事态数角标（自 `events.mjs` 拆出）。 | `events-fx.mjs` | 内部 | S5-1 | S5-1 新增，最终名字就是它自己。样式表留在 `events.mjs`（z-index 账本）。 |

### B. 同名文件对

出现在不止一个目录里的 14 个基本名：`events`、`trips`、`compose`、`budget`、`routine`、`quests`、`vision`、`traffic`、`weather`、`layers`、`pack`、`lod`、`scrapbook`、`main.js`。每一侧一行。角色（view / parse / core）是「含义」列的第一个词。其中两对（`budget`、`layers`）是共用一个文件名的两个不同概念，不是 view / core 的拆分。基本名 `index.html` 也有两份（`estate/`、`estate/closet/`），由目录区分，不动它。

| 当前名 | 位置 | 含义 | 建议新名 | 类别 | 批次 | 备注 |
|---|---|---|---|---|---|---|
| `core/budget.mjs` | `map/core/budget.mjs:1` | 不同概念。图形内存预算策略：按设备档位给字节预算，并判断上报用量是否算压力。 | `core/graphics-budget.mjs` | 内部 | S5 | 引用：map 1 个（`viewer3d.html`）、测试 1 个。不是 view/core 成对：两个文件毫无关系。 **已在 S5-2 改名。** |
| `tavern/budget.mjs` | `map/tavern/budget.mjs:1` | 不同概念。本机存储预算：按聊天做 LRU、头像上限、额度超限恢复；只碰地图自己的键。 | `tavern/storage-budget.mjs` | 内部 | S5 | 引用：map 3 个（含 `storage.mjs` 属主字符串）、测试 2 个。`eden-map.js` 里的 `BG` 就是这个模块（表 D）。 **已在 S5-2 改名。** |
| `compose.mjs` | `map/compose.mjs:1` | view（查看器侧）。地点 / 事件 / 人物卡上的按钮，把模板句发给宿主的输入框（仅嵌入时）。 | `compose-view.mjs` | 内部 | S5 | 引用：map 1 个、测试 1 个。全局 `TCCompose`（表 C）。 **已在 S5-2 改名。** |
| `tavern/compose.mjs` | `map/tavern/compose.mjs:1` | 宿主侧。模板句本身以及把它填进聊天输入框的代码（从不发送）。除 `insert` 外是纯函数。 | `tavern/compose-templates.mjs` | 内部 | S5 | 引用：map 3 个、测试 1 个。导出 `KEY` 和 `MAX`（表 D）。 **已在 S5-2 改名。** |
| `events.mjs` | `map/events.mjs:1` | view（查看器侧）。事态层：落点、图标、事件列表、飞往、屏幕效果、世界图角标。 | `events-view.mjs` | 内部 | S5 | 428 行（超出上限；S5 要拆）。引用：map 1 个、测试 1 个。全局 `TCEvents`（`P.` 引用 16 处）。 **已在 S5-2 改名。** |
| `tavern/events.mjs` | `map/tavern/events.mjs:1` | parse（解析）。从聊天正文读事件标签、合并并老化（纯函数）；含内置事态大类。 | `tavern/events-parse.mjs` | 内部 | S5 | 引用：map 5 个、测试 10 个、工具 2 个（本表被测试引用最多）。含标签属性 `data-tcmap`（表 F），并且是棘轮里卡名词数最多的文件（87）。 **已在 S5-2 改名。** |
| `core/layers.mjs` | `map/core/layers.mjs:1` | core（核心）。LayerRegistry：10 个视口槽位、图层注册与排序、可见性、滤镜链。 | `core/layer-registry.mjs` | 内部 | S5 | 引用：map 6 个、测试 4 个。这里的 "layer" = 渲染槽位；在 `app/layers.mjs` 里指城市的一层。术语表：「layer slot」对「map level」。 **已在 S5-2 改名。** |
| `app/layers.mjs` | `map/app/layers.mjs:1` | view（查看器侧）。层导航与键盘：层切换条、上一级、Esc 分层、单键快捷键。 | `app/map-level-nav.mjs` | 内部 | S5 | 引用：map 9 个。与 `core/layers.mjs` 是不同概念（见那一行）。 **已在 S5-2 改名。** |
| `core/lod.mjs` | `map/core/lod.mjs:1` | core（核心）。图形 LOD 策略：模型该处于哪个细节档、迟滞、哪些异步加载仍有效。 | (keep) | 内部 | — | 引用：map 1 个（`three/lod.mjs`）、测试 1 个。纯核心保留裸名。 |
| `three/lod.mjs` | `map/three/lod.mjs:1` | 控制器。把 `core/lod.mjs` 的决策应用到 three 场景上。 | `three/lod-controller.mjs` | 内部 | S5 | 引用：没有相对导入；通过 import-map 别名加载（表 A）、测试 1 个。 **已在 S5-2 改名。** |
| `core/pack.mjs` | `map/core/pack.mjs:1` | core（核心）。设定包接口：清单校验与解析、包 id、存储前缀与聊天变量键的推导。 | (keep) | 内部 | — | 引用：map 6 个、测试 2 个、工具 1 个。里面写死了默认值 `edenMap` 和 `eden_map`（表 F）。 |
| `app/pack.mjs` | `map/app/pack.mjs:1` | view（查看器侧）。当前设定包，启动时解析一次（活绑定 `PACK`、`packData(键)`）。 | `app/current-pack.mjs` | 内部 | S5 | 引用：map 7 个。 **已在 S5-2 改名。** |
| `core/quests.mjs` | `map/core/quests.mjs:1` | core（核心）。动态线索节点：按地点聚合事件并随楼层衰减。 | (keep) | 内部 | — | 引用：map 1 个、测试 1 个、工具 1 个。 |
| `app/quests.mjs` | `map/app/quests.mjs:1` | view（查看器侧）。把线索节点画成会呼吸的圈。 | `app/quests-view.mjs` | 内部 | S5 | 引用：map 2 个。全局 `TCQuests`（表 C）。 **已在 S5-2 改名。** |
| `core/routine.mjs` | `map/core/routine.mjs:1` | core（核心）。宿主与查看器共用的 NPC 日程数学。 | (keep) | 内部 | — | 引用：map 3 个（含 `estate/main.js`）、测试 1 个。 |
| `tavern/routine.mjs` | `map/tavern/routine.mjs:1` | 转发器。四行代码，为宿主重新导出 `core/routine.mjs`。 | (delete) | 内部 | S5 | 引用：map 1 个（`eden-map.js` 的句柄 `RTm`）、测试 1 个（`tests/routine.test.mjs`）；都改为直接引 `core/routine.mjs`。没有调用方需要这个转发器。 **已在 S5-2 删除**（宿主与测试改 import `core/routine.mjs`）。 |
| `core/scrapbook.mjs` | `map/core/scrapbook.mjs:1` | core（核心）。地标上钉图与手记的索引逻辑（字节存在图集数据库里）。 | (keep) | 内部 | — | 引用：map 1 个、测试 1 个。 |
| `scrapbook.mjs` | `map/scrapbook.mjs:1` | view（查看器侧）。地点卡上的钉图与手记。 | `scrapbook-view.mjs` | 内部 | S5 | 引用：map 2 个（含 `storage.mjs` 属主字符串）。全局 `TCScrap`（表 C）。 **已在 S5-2 改名。** |
| `core/traffic.mjs` | `map/core/traffic.mjs:1` | core（核心）。车流与流光数学：路线点 → 一帧里的光点位置，确定性。 | (keep) | 内部 | — | 引用：map 2 个、测试 1 个。 |
| `app/traffic.mjs` | `map/app/traffic.mjs:1` | view（查看器侧）。在 `fx` 槽位的画布上画流光。 | `app/traffic-view.mjs` | 内部 | S5 | 引用：map 2 个。全局 `TCTraffic`（表 C）。 **已在 S5-2 改名。** |
| `trips.mjs` | `map/trips.mjs:1` | view（查看器侧）。行程层：按交通方式画最近行程和在途弧线。 | `trips-view.mjs` | 内部 | S5 | 引用：map 1 个、测试 1 个。全局 `TCTrips`（表 C）。聊天键 `行程`（表 E）。 **已在 S5-2 改名。** |
| `tavern/trips.mjs` | `map/tavern/trips.mjs:1` | parse（解析）。从逐层地点和人物标签推出「A 到 B」的行程，按交通方式分样式（纯函数）。 | `tavern/trips-parse.mjs` | 内部 | S5 | 引用：map 1 个、测试 4 个。`eden-map.js` 里的句柄 `TRm`。 **已在 S5-2 改名。** |
| `core/vision.mjs` | `map/core/vision.mjs:1` | core（核心）。视线锥几何：被墙段截断的视野、巡逻环、点可见性判断。 | (keep) | 内部 | — | 引用：map 2 个、测试 1 个。 |
| `app/vision.mjs` | `map/app/vision.mjs:1` | view（查看器侧）。画视野锥，并在移动时报告最难躲过的一次被发现。 | `app/vision-view.mjs` | 内部 | S5 | 引用：map 2 个。全局 `TCVision`（表 C）。 **已在 S5-2 改名。** |
| `core/weather.mjs` | `map/core/weather.mjs:1` | core（核心）。天气核心：预设表、由剧情与时钟推天气、粒子场与闪电时序。 | (keep) | 内部 | — | 引用：map 1 个、测试 2 个。 |
| `app/weather.mjs` | `map/app/weather.mjs:1` | view（查看器侧）。在 `fx` 槽位画粒子、色调和闪电。 | `app/weather-view.mjs` | 内部 | S5 | 引用：map 2 个、测试 1 个。全局 `TCWeather`（表 C）。 **已在 S5-2 改名。** |
| `estate/main.js` | `map/estate/main.js:1` | 第一个设定包的三维庄园页控制器：模型加载、外观 / 内透 / 剖切、楼层条、房间与室外热点。 | `estate/estate-page.js` | 内部 | S10 | 1203 行。引用：1 个页面（`estate/index.html`）、测试 4 个、工具 1 个。属于设定包页面，不在引擎范围，S10 随第一个设定包搬走。`index.html` 也有两份（`estate/`、`estate/closet/`），由目录区分，不改名。 |
| `estate/closet/main.js` | `map/estate/closet/main.js:1` | 衣帽间样板间页面：场景、灯光、交互、A / B 切换。 | `estate/closet/closet-page.js` | 内部 | S10 | 235 行。引用：1 个页面、测试 1 个。处理方式同上一行。 |

### C. Window 全局变量

所有匹配 `window.TC*`、`window.__*`、`window.UI*`、`window.EdenMap` 的名字，以及引擎放到 `window` 上的其他名字（`I18N`、`estCard`、`renderStorage`、兼容 getter）。`TC*` 共 29 个（18 个直接挂，11 个经 `app/plugins.mjs` 的 `register()` 挂）；计划里说的 11 种偏少。`window.parent.__…` 这类名字在酒馆页面里，不在查看器里。像 `TCCvd` 这样的导入别名不是全局变量，写在所属文件那一行里。

| 当前名 | 位置 | 含义 | 建议新名 | 类别 | 批次 | 备注 |
|---|---|---|---|---|---|---|
| `window.TCStore` | `map/viewer.html:29` | 查看器页面内联的本机存储服务：`key`、`get`、`set`、`remove`、`json`，带设定包命名空间。另有一个 API 形状相同但不是同一个对象的东西：`core/storage.mjs` 的导入别名 `TCStore`（5 个文件）。 | `window.LocalStore` (alias becomes `storage`) | 内部 | S5 | 引用：map 20、测试 4、工具 5。两个东西共用一个名字，这是读代码时最大的坑。`ui/sheet.js` 通过 `window.TCStore` 读它。 两个含义分开了：查看器内联存储是 `window.LocalStore`；`core/storage.mjs` 的 import 别名是 `storage`（5 个文件）。 **已在 S5-3 改名。** |
| `window.TCSheet` | `map/app/shell.mjs:84` | 查看器唯一的抽屉 / 右栏实例，由 `UISheet.create` 创建。 | `window.ViewerDrawer` | 内部 | S5 | 引用：map 5、工具 5。把实例（`TCSheet`）与工厂（`UISheet`）区分开。 **已在 S5-3 改名。** |
| `window.TCFog` | `map/app/fog.mjs:56` | 迷雾探索叠加层的 API：`paint`、`here`、`on`、`count`、`raw`、`setHaze`、`mute`、`set`、`toggle`、`reset`。 | `window.FogApi` | 内部 | S5 | 引用：map 6。直接挂在 `window` 上，从未登记到 `P`，但 `app/host.mjs:52,54` 调用 `P.TCFog?.mute?.(…)`：它永远是 `undefined`，回放期间的静音从不生效（见 open 第 1 条）。 **已在 S5-3 改名。** |
| `window.TCSettings` | `map/app/settings.mjs:30` | 设置浮层的 API（`registerSection`、`showSet` 等）；同名常量也被导出。 | `window.SettingsApi` | 内部 | S5 | 引用：map 9、测试 1、工具 6。也是 34 个兼容 getter 之一。 **已在 S5-3 改名。** |
| `window.TCScale` | `map/app/scale.mjs:120` | 世界图与城市各层之间的尺度衔接。 | `window.ScaleHandoffApi` | 内部 | S5 | 引用：map 4、工具 2。 **已在 S5-3 改名。** |
| `window.TCNotify` | `map/app/shell.mjs:136` | 通知层的 `notify` 函数（P0 阻断、P1 横幅、P2 提示）。 | `window.showNotice` | 内部 | S5 | 引用：map 4、工具 1。它是函数不是对象；新名字如实表达。 **已在 S5-3 改名。** |
| `window.TCLayers` | `map/app/layerhost.mjs:27` | 查看器 LayerRegistry 的标准摘要：`registry`、`describe`、`slotZ`。 | `window.LayerHostApi` | 内部 | S5 | 引用：map 2、工具 5。 **已在 S5-3 改名。** |
| `window.TCCardLinks` | `map/app/cardlinks.mjs:84` | 地点卡底部链接的生成函数。 | `window.CardLinksApi` | 内部 | S5 | 引用：map 2、测试 1。 **已在 S5-3 改名。** |
| `window.TCWander` | `map/app/wander.mjs:160` | NPC 漫游 API：`scan`、`reset`、`schedule`、`clock`、`tick`、`retarget`、`walker` 等。 | `window.WanderApi` | 内部 | S5 | 引用：map 2、工具 2。 **已在 S5-3 改名。** |
| `window.TCMarkers` | `map/app/markers.mjs:137` | 只有 `closeCard` 一个方法。 | `window.MarkersApi` | 内部 | S5 | 引用：map 2、工具 1。 **已在 S5-3 改名。** |
| `window.TCLoot` | `map/app/loot.mjs:98` | 拾取标记的 API：`set`、`rebuild`、`rows`、`now`。 | `window.StashMarkersApi` | 内部 | S5 | 引用：map 2、工具 1。随 `app/loot.mjs` 改名。 **已在 S5-3 改名。** |
| `window.TCWeather` | `map/app/weather.mjs:84` | 天气 API：`set`、`fromStory`、`now`、`describe`。 | `window.WeatherApi` | 内部 | S5 | 引用：map 1、工具 1。 **已在 S5-3 改名。** |
| `window.TCVision` | `map/app/vision.mjs:121` | 视野锥 API：`cones`、`markerOf`、`tryMove`、`setWalls`、`getWalls`、`night`。 | `window.VisionApi` | 内部 | S5 | 引用：map 1、工具 1。 **已在 S5-3 改名。** |
| `window.TCTraffic` | `map/app/traffic.mjs:87` | 流光 API：`running`、`night`、`describe`。 | `window.TrafficApi` | 内部 | S5 | 引用：map 1、工具 1。 **已在 S5-3 改名。** |
| `window.TCTileWorker` | `map/app/dzi-worker.mjs:188` | 瓦片解码 worker 的客户端。 | `window.TileWorkerApi` | 内部 | S5 | 引用：map 1、测试 0、工具 0。 **已在 S5-3 改名。** |
| `window.TCQuests` | `map/app/quests.mjs:89` | 线索节点 API：`now`、`setDay`、`recalc`。 | `window.QuestsApi` | 内部 | S5 | 引用：map 1、工具 1。 **已在 S5-3 改名。** |
| `window.TCHaze` | `map/app/depthhaze.mjs:86` | 空气透视 API：`apply`、`summary`、`depth`、`chain`、`describe`。 | `window.DepthHazeApi` | 内部 | S5 | 引用：map 1、工具 1。 **已在 S5-3 改名。** |
| `window.TC3d` | `map/app/estate.mjs:224` | 三维租约自检：`live`、`release`、`snapping`、`stopSnap`、`SNAP_MS`。 | `window.Lease3dApi` | 内部 | S5 | 引用：map 1、工具 1。 **已在 S5-3 改名。** |
| `window.TCEvents` / `P.TCEvents` | `map/events.mjs:394` | 事态层外挂的 API，经 `register()` 登记。 | `window.EventsView` / `P.EventsView` | 内部 | S5 | 引用：map 10、测试 1、工具 5；`P.TCEvents` 16 处。下面每个外挂名都来自一次 `register()` 调用：`P[name]` 与 `window[name]` 是同一个键，所以 `register(...)` 里的字符串和所有 `P.<name>` 引用要一起改。 **已在 S5-3 改名。** |
| `window.TCChars` / `P.TCChars` | `map/chars.mjs:261` | 人物页外挂的 API。 | `window.CharactersView` / `P.CharactersView` | 内部 | S5 | 引用：map 9、测试 1、工具 4；`P.` 引用 33 处。 **已在 S5-3 改名。** |
| `window.TCCustom` / `P.TCCustom` | `map/custom.mjs:390` | 自定义名称外挂的 API（另含夜色、着装行）。 | `window.CustomNamesView` / `P.CustomNamesView` | 内部 | S5 | 引用：map 13、测试 1、工具 2；`P.` 引用 46 处（外挂里最多）。 **已在 S5-3 改名。** |
| `window.TCTrips` / `P.TCTrips` | `map/trips.mjs:107` | 行程层外挂的 API。 | `window.TripsView` / `P.TripsView` | 内部 | S5 | 引用：map 4、测试 1、工具 1；`P.` 引用 4 处。 **已在 S5-3 改名。** |
| `window.TCUnmapped` / `P.TCUnmapped` | `map/unmapped.mjs:140` | 未上图地点选择器外挂的 API。 | `window.UnmappedPlacePicker` / `P.UnmappedPlacePicker` | 内部 | S5 | 引用：map 5、测试 1、工具 1；`P.` 引用 9 处。 **已在 S5-3 改名。** |
| `window.TCVarMap` / `P.TCVarMap` | `map/varmap.mjs:66` | 变量映射设置页外挂的 API。 | `window.StatPathMappingView` / `P.StatPathMappingView` | 内部 | S5 | 引用：map 3、测试 1；`P.` 引用 4 处。 **已在 S5-3 改名。** |
| `window.TCCompose` / `P.TCCompose` | `map/compose.mjs:91` | 填入聊天按钮外挂的 API。 | `window.ComposeView` / `P.ComposeView` | 内部 | S5 | 引用：map 5、测试 1；`P.` 引用 8 处。 **已在 S5-3 改名。** |
| `window.TCSecurity` / `P.TCSecurity` | `map/security.mjs:61` | 安保叠加层外挂的 API。 | `window.SecurityView` / `P.SecurityView` | 内部 | S5 | 引用：map 3、测试 1、工具 1；`P.` 引用 4 处。 **已在 S5-3 改名。** |
| `window.TCScrap` / `P.TCScrap` | `map/scrapbook.mjs:132` | 见闻录外挂的 API。 | `window.ScrapbookView` / `P.ScrapbookView` | 内部 | S5 | 引用：map 2、工具 1；`P.` 引用 3 处。 **已在 S5-3 改名。** |
| `window.TCInv` / `P.TCInv` | `map/inv.mjs:27` | 空间化背包外挂的 API（地点卡列表）。 | `window.StashView` / `P.StashView` | 内部 | S5 | 引用：map 8；`P.` 引用 10 处。 **已在 S5-3 改名。** |
| `window.TCWb` / `P.TCWb` | `map/wbpeek.mjs:46` | 世界书档案外挂的 API。 | `window.WorldbookPeekView` / `P.WorldbookPeekView` | 内部 | S5 | 引用：map 2；`P.` 引用 3 处。 **已在 S5-3 改名。** |
| `window.UIIcon` | `map/ui/icons.js:37` | 唯一的图标集（`svg`、`names`、`P`）。 | (keep) | 内部 | — | 引用：map 5。`UI` 前缀是中性的、名字也清楚，不改。 |
| `window.UISheet` | `map/ui/sheet.js:198` | 底部抽屉 / 右栏的工厂（`create`、`RAIL_MQ`）。 | (keep) | 内部 | — | 引用：map 3。实例 `TCSheet` 改名 `ViewerDrawer` 后，二者不再混淆。 |
| `window.UI3D` | `map/ui/chrome3d.js:89` | 庄园页和道具查看器共用的三维查看器外壳。 | (keep) | 内部 | — | 引用：map 3。 |
| `window.UIProgress` | `map/ui/progress.mjs:62` | 加载进度组件（`mount`）。 | (keep) | 内部 | — | 引用：map 1。 |
| `window.I18N` | `map/app/i18n.mjs:26` | 给外挂用的共享 i18n 服务：`lang`、`t`、`nm`、`tr`、`fmt`、`tx`。 | (keep) | 内部 | — | 引用：map 15。名字清楚；里面的函数见表 D（`tx` 有两个版本，行为不同）。 |
| `window.EdenMap` | `map/app/extapi.mjs:23` | 公开的本机扩展 API：21 个方法（`setCustom`、`getRooms`、`flyTo`、`on`、`off` 等）；宿主也把它暴露成 `window.parent.EdenMap`（`host-api.mjs:85`）。 | `window.SpatialMap` (product name per D5) | 外部契约 | S10 | 引用：map 14、测试 2、工具 11。别人的脚本可能在调用它，所以 `EdenMap` 至少要作为冻结别名多保留一个版本。契约文件：`tavern/edenapi.mjs`。 |
| `window.estCard` | `map/custom.mjs:247` | 用户刚选中的房间的地点方案（`name`、`floor`、`kind`、`area`、`poly`、`z`）；由自定义名称外挂写，三维子页宿主读。 | `window.__selectedRoomPlan`；字段 `floor` 改为 `storey` | 内部 | S5 | 引用：map 2。用全局变量在外挂和应用模块之间传值：应改为 `P` 条目或状态 setter。这里的 "card" 指卡设定的房间方案，是这个词的第三种含义。 `window.__selectedRoomPlan` 上的 `floor` 字段改为 `storey`；`estate:room` 消息体仍叫 `floor`（三维页的契约）。 **已在 S5-3 改名。** |
| `window.renderStorage` | `map/app/storage-ui.mjs:27` | 渲染存储设置页；挂在 `window` 上供设置页和探针用。 | `window.renderStorageSettings` | 内部 | S5 | 引用：map 3。 **已在 S5-3 改名。** |
| `window.<34 compat getters>` | `map/app/bridge.mjs:14` | 旧内联主脚本全局名的只读 getter：`toImg viewer aspect M REG cur tier sleeping esc post jsonCache LANG nm setTheme main fadeAway go est setEstFail openEstate estFocus closeCard hereRes jumpHere TCSettings showSet showLay chatId LS renderAbout curData lean t showCard`。 | retire; probes import modules or read one `window.ViewerDebug` namespace | 内部 | S5 | 探针通过 `page.evaluate` 读它们：`tools/browser/` 的 51 个文件里有 38 个提到 `REG cur viewer curData go jumpHere showCard est M` 中至少一个词（粗略按词 grep，是上界）。先迁移探针再删除。文件头写着「只加不减」。 已退役：33 个 getter（35 个旧名减去现为 `SettingsApi` 的 `TCSettings`，以及表 D 改名的 `LS` / `M` 等）收进一个只读的 `window.ViewerDebug`（`app/viewer-debug.mjs`，键用新名字）；探针读 `ViewerDebug.<名>`。产品代码没有读它们（grep 可证）。 **已在 S5-3 退役。** |
| `window.__tcPack` | `map/tavern/eden-map.js:188` | 生成的脚本在导入宿主之前写入的设定包注入对象：`{ id, manifest, events }`；宿主再把它拷进查看器的 `srcdoc`。 | `window.__spatialPack` | 外部契约 | S10 | 引用：map 5、测试 1、工具 2（写入方是 `tools/build_preview_script.py`）。已安装的脚本写的是旧名字：宿主必须两个都读。 |
| `window.__edenMapScript` | `map/tavern/eden-map.js:403` | 生成的脚本导入前写入的版本信息：`{ version, code, channel, ref, sha }`。 | `window.__spatialScript` | 外部契约 | S10 | 引用：map 1、测试 2、工具 2。与 `__tcPack` 同样要双读。 |
| `window.parent.__edenMapIds` | `map/tavern/eden-map.js:47` | 已加载脚本的身份 → 地址登记表，用来发现脚本被加载了第二份。 | `window.parent.__spatialScriptIds` | 外部契约 | S10 | 引用：map 1、工具 1。同一页面里不同版本的脚本共用它，改名后要同时读两个名字。 |
| `window.parent.__edenMapCleanup` | `map/tavern/host-lifecycle.mjs:202` | 正在运行的实例的清理钩子；更新的版本靠调用它来接管。 | `window.parent.__spatialCleanup` | 外部契约 | S10 | 引用：map 2。旧实例接管是跨版本的握手（另见 `eden-map-root`，表 F）。 |
| `window.parent.__edenMapSwitch` | `map/tavern/host-checks.mjs:189` | 标记版本切换正在进行（目标的 `SELF`）。 | `window.parent.__spatialSwitch` | 外部契约 | S10 | 引用：map 1（5 处使用）。 |
| `window.parent.__edenMapCheckAt`, `__edenMapForceClosed`, `__edenMapUpdLater` | `map/tavern/host-checks.mjs:147` | 更新提示的页面级记忆：上次检查时间、「强制关闭」等级、「稍后提醒」。 | `__spatialUpdateCheckAt`, `__spatialUpdateForceClosed`, `__spatialUpdateLater` | 外部契约 | S10 | 引用：各 1 个 map 文件。由同一系列脚本读写；风险低，规则同上。 |
| `window.__edenHostToken` | `map/tavern/eden-map.js:220` | 宿主写进查看器窗口的令牌；查看器只接受带这个令牌的宿主消息。 | `window.__hostToken` | 外部契约 | S10 | 引用：map 2。宿主与查看器可能版本不同（CDN 对已安装脚本）：查看器必须两个名字都读。 |
| `window.__edenMapChat` | `map/app/extapi.mjs:22` | 宿主在转发 API 调用前，对查看器窗口调用的、用来同步聊天 id 的 setter（`host-api.mjs:25`）。 | `window.__setChatId` | 外部契约 | S10 | 引用：map 2。宿主到查看器的契约，由 `fnGuard` 守卫。 |
| `window.__packId` | `map/viewer.html:9` | 当前设定包 id，在任何模块运行前算出；也注入三维子页。 | (keep) | 内部 | — | 引用：map 6、测试 1。名字清楚。 |
| `window.__nsKey` | `map/viewer.html:10` | 把登记的 `edenMap*` 键映射成当前设定包命名空间下的键。 | `window.__packStorageKey` | 内部 | S5 | 引用：map 1。"ns" 不易读；注意它按 7 个字符（`edenMap`）截取，S10 改前缀时必须同步。 **已在 S5-3 改名。** |
| `window.__manifestP` | `map/viewer.html:20` | 首帧脚本发起的清单请求的 Promise。 | `window.__manifestPromise` | 内部 | S5 | 引用：map 2。 **已在 S5-3 改名。** |
| `window.__worldFirst` | `map/viewer.html:21` | 没有 `?map=` 参数时为真：先打开世界图。 | `window.__openWorldMapFirst` | 内部 | S5 | 引用：map 1。 **已在 S5-3 改名。** |
| `window.__theme`, `__lang`, `__hand` | `map/viewer.html:42` | 首帧前定好的主题、语言、单手侧。 | (keep) | 内部 | — | 引用：map 各 2 / 2 / 3。名字清楚。 |
| `window.__applyTheme`, `__applyHand` | `map/viewer.html:43` | 主题 / 手侧改变后重新套用对应的类。 | (keep) | 内部 | — | 引用：各 2 个 map 文件。 |
| `window.__i18n` | `map/viewer.html:52` | 字典请求的 Promise，与启动数据并行发起。 | `window.__dictionaryPromise` | 内部 | S5 | 引用：map 2。看起来像 `I18N` 服务，其实只是个 Promise。 **已在 S5-3 改名。** |
| `window.__earlyMsgs`, `__earlyTap` | `map/viewer.html:707` | 在模块图就绪前接住宿主消息的缓冲区与监听器；`host.mjs` 会回放并清空。 | `__bufferedHostMessages`, `__hostMessageTap` | 内部 | S5 | 引用：各 2 个 map 文件。 **已在 S5-3 改名。** |
| `window.__fromHost` | `map/app/host.mjs:28` | 函数 `event -> boolean`：这条消息是否来自宿主（来源或令牌检查）。 | `window.__isFromHost` | 内部 | S5 | 引用：map 12、测试 1。名字像数据字段，实际是谓词。 **已在 S5-3 改名。** |
| `window.__snapFx` | `map/app/scale.mjs:94` | 一次性的缩放快照效果参数（`ox`、`oy`、`scale`），由 `scale.mjs` 交给 `nav.mjs`。 | `window.__zoomSnapEffect` | 内部 | S5 | 引用：map 2。应改成状态 setter 而不是全局变量。 **已在 S5-3 改名。** |
| `window.__worldTC` | `map/app/scale.mjs:98` | 从城市层返回世界图时要居中的地点 id（`false` = 没有）。 | `window.__worldFocusPlace` | 内部 | S5 | 引用：map 2。"TC" 是卡名；`locate.mjs:56` 还在这里写死了默认地点 id（棘轮已计）。 **已在 S5-3 改名。** |
| `window.__rm` | `map/app/settings.mjs:95` | 当前的减少动效状态，给探针和子页用。 | `window.__reducedMotion` | 内部 | S5 | 引用：map 1。 **已在 S5-3 改名。** |
| `window.__edenInject` | `map/app/settings.mjs:148` | 注入模式（`off` / `compose` 等）的实时值，卡片重画时读取。 | `window.__injectMode` | 内部 | S5 | 引用：map 2、工具 1。 **已在 S5-3 改名。** |
| `window.__devDpr`, `__creditShow` | `map/app/boot.mjs:93` | 调试用像素比，以及显示署名框的函数。 | `__deviceDpr`, `__showCredits` | 内部 | S5 | 引用：各 2 个 map 文件。`__creditShow` 还关系到原作者署名规则（brief §7）。 **已在 S5-3 改名。** |
| `window.__clouds` | `map/app/clouds.mjs:120` | 云层的探针接口：`sync`、`state`。 | `window.__cloudsProbe` | 内部 | S5 | 引用：map 1、工具 2。 **已在 S5-3 改名。** |
| `window.__edenBus` | `map/app/bus.mjs:18` | 查看器监听器总线的只读视图，给探针和自检用。 | `window.__listenerBus` | 内部 | S5 | 引用：map 1、工具 2。 **已在 S5-3 改名。** |
| `window.__edenLogErrHook` | `map/core/logbuf.mjs:65` | 控制台钩子已安装的标志（保证幂等）。 | `window.__logHooksInstalled` | 内部 | S5 | 引用：map 1。core 模块写 `window` 标志：三个登记属主之一。 **已在 S5-3 改名。** |
| `window.__v3d` | `map/props/viewer3d.html:888` | 通用三维查看器的探针接口。 | `window.__viewer3dProbe` | 内部 | S5 | 引用：map 1、工具 6。 **已在 S5-3 改名。** |
| `window.__packStrings`, `__V3D_MODEL` | `map/app/estate.mjs:139` | 查看器注入三维子页的值：设定包的文案覆盖，以及要加载的模型 id。 | `__packStrings` (keep), `__modelId` | 内部 | S5 | 引用：各 2 个 map 文件。查看器与子页一起发布，属内部契约。 **已在 S5-3 改名。** |
| `window.__edenMapPerf`, `__edenSplashCap`, `__edenAutoCheckDelay` | `map/tavern/eden-map.js:466` | 宿主从父窗口读取的测试钩子；`map/` 里没有任何代码写它们，只有浏览器探针写。 | `__perfSamples`, `__splashCap`, `__autoCheckDelay` | 内部 | S5 | 各 1 个 map 文件、1 个工具。 **已在 S5-3 改名。** |
| `window.__edenHostVersions`, `__edenHereText`, `__edenMvuSnapshotStatus`, `__composeTest` | `map/app/feedback.mjs:15` | 在整个仓库里都没有写入方的只读钩子（代码注释里也承认 `__edenHostVersions` 「目前没有写入方（历史洞）」）。 | remove, or wire a writer (open item 2) | 内部 | S5 | 各 1 个 map 文件（`feedback.mjs`、`compose.mjs`），测试 0、工具 0。给死名字改名是白费功夫。 已删除，没有改名（连同只为它们存在的报告字段）；没有探针写过它们。 **已在 S5-3 删除。** |
| `window.__estate`, `__estateKick`, `__estateWatchdog`, `__estateFirstFrame`, `__estateFail`, `__closet` | `map/estate/main.js:1136` | 第一个设定包三维页的调试和启动握手全局变量（`index.html` 看门狗与 `main.js`）。 | keep; they move with the pack | 内部 | S10 | 属于设定包页面，不在引擎范围。`map/_proto/clouds.html` 里只在原型页用的名字（`__measure`、`__coc`、`__fade`、`__state`）不上线，忽略。名为 `__edges`、`__upd`、`__nt`、`__refresh`、`__h` 的对象属性和哨兵值 `'__book__'` 不是 `window` 全局变量。 |

### D. 短名与不透明标识符

一到三个字母、或含义不透明的导出 / 跨模块标识符，包括计划里点名的（`M`、`REG`、`cur`、`HX`、`P`、`BR`、`INVm`、`nm`、`tx`、`T`、`V2S`、`S2V`、`H2V`、`PR`、`est`、`lp`），以及同名但含义不同的导出（`KEY`、`OPS`、`get`）。`BR` 及同类在 `eden-map.js` 里，S5 拆文件后就成了跨模块标识符。`$` 和 `esc` 特意没列（见 open 第 6 条）。

| 当前名 | 位置 | 含义 | 建议新名 | 类别 | 批次 | 备注 |
|---|---|---|---|---|---|---|
| `M` | `map/app/state.mjs:3` | 世界地点表 `{ places, fiefs, realms }`，从设定包的 `data.world` 读入（没有世界图的包给空表）。 | `worldData` | 内部 | S5 | 被 10 个文件导入；`compose.mjs`、`custom.mjs`、`tiers.mjs` 里还有同名的局部 `M`（懒加载的模块）。字段名 `fiefs` / `realms` 属于设定包词汇（S3 处理）。 **已在 S5-3 改名。** |
| `REG` | `map/app/state.mjs:3` | 从 `maps.json` 读入的地图注册表（按设定包重设基准）：所有地图、分组、标记列表。 | `mapRegistry` | 内部 | S5 | 被 28 个文件导入；也是 34 个兼容 getter 之一。和 `LayerRegistry`（`layerhost.mjs` 里的 `registry`）不是一回事。 **已在 S5-3 改名。** |
| `cur` | `map/app/state.mjs:3` | 当前地图的 id（字符串）。同类：`curData`、`ovData`、`depthData`。 | `currentMapId` (siblings `currentMapData`, …) | 内部 | S5 | 被 29 个文件导入（`curData`：13 个）。另有 5 个文件把局部变量 `cur` 用作「当前值」（`core/scrapbook`、`walk`、`lod`、`ledger`、`th-ui`）。 同族连同 setter 一起改：`curData` -> `currentMapData`、`ovData` -> `overviewMapData`（`setCur` -> `setCurrentMapId`、`setCurData`、`setOvData`；`M`、`REG`、`viewer` 同理）。 **已在 S5-3 改名。** |
| `viewer` | `map/app/state.mjs:3` | OpenSeadragon 实例。"Viewer" 同时又是页面 `viewer.html` 的名字。 | `osdViewer` | 内部 | S5 | 被 25 个文件导入；34 个兼容 getter 之一。术语表里「Viewer」指页面，这个是瓦片查看器。 **已在 S5-3 改名。** |
| `hereIdx` | `map/app/locate.mjs:111` | 当前地点引擎（`makeHere` 的结果），由注册表和用户的叫法建出；`hereRes` 向它问。`HX`（v1 模块）已不存在。 | `placeIndex` | 内部 | S5 | 被 2 个文件导入；setter `setHereIdx` 跟着改。 **已在 S5-3 改名。** |
| `P` | `map/app/plugins.mjs:5` | 外挂注册表：应用模块与根外挂之间唯一的通道（`register(name, api)`）。 | `plugins` | 内部 | S5 | 被 21 个文件导入。另有 5 个文件把局部 `P` 用作别的东西（`ui/icons.js` 路径表、`host-th.mjs` 偏好、`follow.mjs` 路径、`trips.mjs` 投影、`markers.mjs` 点列）：批量替换必须识别 import。 **已在 S5-3 改名。** |
| `BR` | `map/tavern/chars-flow.mjs:23` | 宿主脚本的 `MVUBridge` 实例。 | `mvuBridge` | 内部 | S5 | `eden-map.js` 里 `BR.` 有 64 处使用；S5 拆文件后变成跨模块标识符。 **已在 S5-3 改名。** |
| `MV`, `CTX`, `BG` | `map/tavern/chars-flow.mjs:19` | `MV` = `tavern/mvu.mjs` 模块；`CTX` = ContextPipeline 实例；`BG` = `tavern/budget.mjs` 模块（存储预算）。 | `mvuReaders`, `contextPipeline`, `storageBudget` | 内部 | S5 | 与 `BR` 同理（S5 拆文件）。`BG` 也是模块句柄，但不符合下一行的 `<名>m` 模式。 **已在 S5-3 改名。** |
| `INVm` and 20 siblings | `map/tavern/stash-flow.mjs:1` | 懒加载的模块句柄，模式为 `<缩写>m`（共 21 个）：`PRm` protocol、`FOGm` core/depth、`SRCm` sources、`CPm` compose、`NAVm` navigator、`WBJm` wb_jit、`XTMm` wb_crystallize、`ACm` action、`RNGm` rng、`LEDm` ledger、`PUm` pickup、`BBm` baibai、`TRm` trips、`INVm` inventory、`STm` stash、`RTm` routine、`TLm` timeline、`KFm` keyframes、`CXm` characters、`SPm` splash、`THm` th。 | `<module>Module`, e.g. `stashStoreModule` | 内部 | S5 | 名字随文件改名（表 A）。`MDm`（= `BR.modes`）是另一种句柄。无冲突：新名字在 `map/` 里现在都不存在。 按各自加载的模块命名（21 个名字，见 `tools/rename_s5_globals_extract.py` 的 `HANDLES`）；`MDm` 不动。 **已在 S5-3 改名。** |
| `SELF`, `OWNER`, `UL` | `map/tavern/eden-map.js:26` | `SELF` = 脚本所在的 `.../map/` 基础地址；`OWNER` = 脚本身份（`s:<id>` 或 `u:<SELF>`）；`UL` = 界面语言 `zh` / `en`。 | `scriptBase`, `scriptOwner`, `uiLang` | 内部 | S5 | `SELF` 还出现在 `edenapi.mjs` 和 `host-routes.mjs`（`createRoutes` 的参数）的注释里。 **已在 S5-3 改名。** |
| `nm` | `map/app/i18n.mjs:23` | 对象的本地化名称：`name`、`name_en`，或查字典。 | `localName` | 内部 | S5 | 被 10 个文件导入；也在 `window.I18N` 里。`core/pickup`、`app/vision`、`host-th`、`spatial`、`inventory` 里的局部 `nm`（处理过的字符串）是另一回事。 **已在 S5-3 改名。** |
| `t` | `map/app/i18n.mjs:21` | 界面文案查询：先看设定包的 `strings` 覆盖，再查字典；支持 `{var}` 代入。 | `uiText` | 内部 | S5 | 被 8 个文件导入。单字母，又是常见的局部变量名。 **已在 S5-3 改名。** |
| `tr` | `map/app/i18n.mjs:22` | 通过 `names` 字典翻译专有名词。 | `translateName` | 内部 | S5 | 被 1 个文件导入；也在 `window.I18N` 里。 **已在 S5-3 改名。** |
| `tx` | `map/app/util.mjs:6` | 经 `window.I18N.t` 查文案，查不到就用内联的中文兜底；不做变量代入。 | `uiTextOr` | 内部 | S5 | 被 12 个文件导入。`window.I18N.tx` 同名，但还会代入变量：一个名字两种行为。`chars.mjs`、`compose.mjs`、`inv.mjs` 里的局部 `T` 包的是第二种。 **已在 S5-3 改名。** |
| `T` | `map/chars.mjs:18` | 外挂里对 `window.I18N.tx` 的局部别名。其他文件里的 `T` 是另一回事（`ui/sheet.js` 文案表、`topbar.mjs` 瓦片尺寸、`keyframes.mjs` 顶层楼号）。 | `uiTextOr` (import it) | 内部 | S5 | 3 个外挂各自定义了一份（`chars`、`compose`、`inv`）。 有 11 个外挂 / 视图文件（不是 3 个）定义过它；现在都 import `uiTextOr`；`createDialogView` 与 `createEventsFx` 的 `{ T }` 依赖是 `{ uiTextOr }`。 **已在 S5-3 改名。** |
| `PR` | `map/app/util.mjs:14` | `core/protocol.mjs` 模块，启动时加载（`setPR`）；旁边的 `PROTO` 是版本常量。 | `protocol` | 内部 | S5 | 被 3 个文件导入。"PR" 容易读成 pull request。 `setPR` -> `setProtocol`。 **已在 S5-3 改名。** |
| `est` | `map/app/estate.mjs:28` | 当前打开的三维子页会话 `{ id, frame, ready }`（或 `null`）。 | `subpageSession` | 内部 | S5 | 被 3 个文件导入；兼容 getter。`tiers.mjs:121` 里局部 `est` 是布尔值（「是不是庄园地图」）：类型不同，名字相同。 **已在 S5-3 改名。** |
| `lp` | `map/app/loadprog.mjs:4` | 整屏加载进度组件的懒加载访问函数。 | `loadingProgress` | 内部 | S5 | 被 2 个文件导入（`tiers.mjs`、`estate.mjs`）。`context.mjs:166` 把局部 `lp` 当「地点路径」用。 **已在 S5-3 改名。** |
| `LS` | `map/app/extapi.mjs:15` | 带设定包命名空间的 `localStorage` 包装（存储被禁用时为 `null`）。 | `packStorage` | 内部 | S5 | 被 3 个文件导入；兼容 getter。`host-th.mjs:33` 为宿主脚本另建了一个同职责的 `LS`。 宿主脚本自己的 `LS`（依赖袋的键）不动。 **已在 S5-3 改名。** |
| `NT`, `ntQ` | `map/app/shell.mjs:115` | 查看器里的通知组件实例及其队列。`eden-map.js:284` 里另有一个 `NT`，是宿主的通知实例。 | `noticeLayer`, `noticeQueue` | 内部 | S5 | 被 1 个文件导入。 宿主脚本自己的 `NT`（宿主通知实例）不动。 **已在 S5-3 改名。** |
| `H2V`, `V2H`, `V2S`, `S2V` | `map/core/protocol.mjs:9` | 协议 `SCHEMA` 的方向标签：宿主 → 查看器、查看器 → 宿主、查看器 → 子页、子页 → 查看器。模块内常量；值是 `host→viewer` 等字符串。 | `HOST_TO_VIEWER`, `VIEWER_TO_HOST`, `VIEWER_TO_SUBPAGE`, `SUBPAGE_TO_VIEWER` | 内部 | S5 | 没有导出，但 `docs/ARCHITECTURE.md` §4 和计划里都引用了。值字符串出现在测试里；要么保持要么同步改测试。 **已在 S5-3 改名。** |
| `KEY` (five copies) | `map/tavern/tick.mjs:6` | 五个模块各导出一个存储键常量：`tick`（`edenMapTick`）、`action`（`edenMapInject`）、`compose`（`edenMapCompose`）、`navigator`（`edenMapNav`）、`wb_jit`（`edenMapWbJit`）。 | `<MODULE>_STORAGE_KEY`, e.g. `TICK_STORAGE_KEY` | 内部 | S5 | 位置：`tick.mjs:6`、`action.mjs:7`、`compose.mjs:5`、`navigator.mjs:10`、`wb_jit.mjs:11`。`core/storage.mjs` 的登记处仍是唯一来源；值保持不变（外部契约，表 F）。 **已在 S5-3 改名。** |
| `MAX` (two copies) | `map/tavern/action.mjs:10` | 模板句的最大字符数（300），`action.mjs` 与 `compose.mjs:7` 各一份。 | `MAX_TEMPLATE_CHARS` | 内部 | S5 | 同一个上限定义了两次。 **已在 S5-3 改名。** |
| `OPS` (two different sets) | `map/core/ledger.mjs:27` | `ledger.OPS` = `['OP_LOOT', 'OP_ROUTINE', 'OP_EVENT']`（结算指令）；`ops.OPS`（`tavern/ops.mjs:16`）= `['OP_EVENT', 'OP_CLUE', 'OP_MARKER', 'OP_SUGGEST']`（规划器操作）。`OP_EVENT` 两边都有。 | `LEDGER_OPS`, `PLANNER_OPS` | 内部 | S5 | 同名导出、含义不同、还有一个共同成员。读代码时的陷阱。 **已在 S5-3 改名。** |
| `get` (three copies) | `map/core/storage.mjs:71` | `storage.get(键, 默认值)`；`mvu.get(对象, 路径)`（`tavern/mvu.mjs:10`）与 `adapter.get(对象, 路径)`（`tavern/adapter.mjs:25`）是两个几乎一样的路径读取函数，各自还抄了一份 `val`。 | `storageGet`; `getByPath` (merge the two copies) | 内部 | S5 | `storage.get` 总是以 `TCStore.get` 形式使用，真正撞名的是那两个路径读取函数。可以合并。 两个路径读取器（`tavern/mvu-readers.mjs`、`tavern/stat-path-mapping.mjs`）改名 `getByPath`（没有合并：行为不变）；`storage.get` 保留原名，它与 `LocalStore.get` 同形（一种接口、两个对象）。 **已在 S5-3 改名。** |
| `on` | `map/app/cvd.mjs:19` | 返回色觉模式是否开启（`mode() !== '0'`）。`fog.mjs` 里另有一个局部 `on()`，对应另一个开关。 | `isEnabled` | 内部 | S5 | 像动词，读起来像「事件监听 on」。 **已在 S5-3 改名。** |
| `ico` | `map/app/util.mjs:9` | 从 `window.UIIcon` 取图标的 SVG。 | `iconSvg` | 内部 | S5 | 被 2 个文件导入。`esc`（`util.mjs:7`，21 个导入方）有 3 个字母、也够清楚；只有在批量改名脚本本来就要跑时才顺带改成 `escapeHtml`（可选）。 **已在 S5-3 改名。** |
| `MB`, `DAY`, `AGE` | `map/core/budget.mjs:24` | `MB` = 1048576 字节；`DAY`（`tavern/selfcheck.mjs:169`）= 一天的毫秒数；`AGE`（`tavern/events.mjs:94`）= 楼层距离阈值 `{ live: 7, after: 20, fade: 40 }`。 | `BYTES_PER_MB`, `MS_PER_DAY`, `EVENT_AGE_MSGS`（`msgIndex` 距离） | 内部 | S5 | 导出的常量，名字里没有单位。 **已在 S5-3 改名。** |

### E. 聊天变量键

地图写进聊天变量的全部内容（第一个设定包的根键是 `eden_map`），以及它旁边的一个顶层变量。键现在是中文；计划（S10）要把它们改成 ASCII 并做迁移。子键也列了行，因为它们同样被持久化在聊天里。卡的 `stat_data` 对象绝不写（brief §2.5）。

| 当前名 | 位置 | 含义 | 建议新名 | 类别 | 批次 | 备注 |
|---|---|---|---|---|---|---|
| `eden_map` (root key) | `map/tavern/mvu.mjs:110` | 保存地图自有状态的唯一一个顶层聊天变量。`VAR_ROOT` 默认取它；第一个设定包的清单也写了它（`chat.var`）；其他设定包默认 `tc_<id>`（`core/pack.mjs:12`、`mvu-bridge.mjs:50`）。 | engine default `spatial_map`, fallback `spatial_<id>`; the first pack keeps `eden_map` in its manifest | 外部契约 | S10 | 第一个设定包已经在清单里声明了 `eden_map`，所以只有引擎默认值要改，聊天数据不用动。旧默认值写死在两处（`mvu.mjs:110`、`pack.mjs:12`）；`tc_` 又是卡名前缀。 |
| `自定义` | `map/tavern/mvu.mjs:116` | 用户设置的自定义名称、用途、别名和忽略名（`normCustom` 的形状：`items` 加下面几个标志）。由 `saveRoot` 写入（`root-store.mjs:53`）。 | `custom` | 外部契约 | S10 | 6 个文件提到它；代码里读它的是 `eden-map.js` 和 `custom.mjs`，其余（`mvu.mjs`、`unmapped.mjs`、`here.mjs`、`extapi.mjs`）只在注释里提到。旧聊天里仍是中文键：迁移 = 先读新键、没有再读旧键、写新键、旧键保留一个版本。 |
| `标签楼` | `map/tavern/root-store.mjs:53` | 已处理过改名 / 用途标签的最高聊天楼层（`CTX.tag.floor`）。 | `tagMsgIndex` | 外部契约 | S10 | `context.mjs:82`（注释）和 `root-store.mjs:71` 也读。 |
| `标签记录` | `map/tavern/root-store.mjs:71` | 最近 30 条标签回放记录 `{ floor, key, … }`：标签「撤销-重放」状态机的状态。 | `tagLog` | 外部契约 | S10 | 加载时只保留最近 30 条。 |
| `楼层指纹` | `map/tavern/root-store.mjs:71` | 每层原文的指纹（FNV-1a、36 进制），用来发现某一层的原文被改过（`context.mjs:12`）。 | `msgFingerprints` | 外部契约 | S10 | 本质上是可丢弃的缓存：从聊天记录重算即可重建。 |
| `行程` | `map/tavern/root-store.mjs:53` | 最近的行程：玩家最近 5 段、每个人物各 5 段（`CTX.trips`）。 | `trips` | 外部契约 | S10 | 派生值：可从聊天楼层重算（brief §2.4）。 |
| `仓库` | `map/tavern/stash-store.mjs:11` | 空间化背包物品（`{ items, seq }`）：地图物品的 v1 存储。 | `stash` (merged, decision D4) | 外部契约 | S6 | **已在 S6-2 迁移（S10 前只读）。** 由 `stash-store.mjs migrate` 读一次（常量 `V1_KEYS.inventory`），每次保存原样带回，之后不再写；S10 随迁移一起删掉这个常量。这个词也是 `core/vocab.mjs` `EXACT.inventory` 里的背包词之一。 |
| `槽位` | `map/tavern/stash-store.mjs:11` | 卡里没有背包字段时，地图声明的虚拟账本槽位：`{ 名, 件, … }`。 | `stash` (merged, decision D4) | 外部契约 | S6 | **已在 S6-2 迁移（S10 前只读）。** 现在是 ASCII 键的 `stash.slot`（`ledger.slotNorm`）；中文字面量 `SLOT_ROOT` 已离开 `map/core`（v1 的名字是 `V1_KEYS.slot`）。子键见下面的行。 |
| `探索` | `map/tavern/eden-map.js:33` | 迷雾探索台账 `{ 地图 id: [地点名] }`（最多 40 张图、每图 300 个地点；`core/depth.mjs` 的 `norm` / `visit`）。 | `explored` | 外部契约 | S10 | 仅在非空时写入（`root-store.mjs:53`）。 |
| `检查点` | `map/tavern/modes.mjs:105` | 最小检查点 `{ 楼, swipe }`：最后确认的楼层与 swipe；启动时对不上就作废并重算。 | `checkpoint` | 外部契约 | S10 | 子键 `楼` 见下。读取在 `root-store.mjs:83`。 |
| `关键帧` | `map/tavern/keyframes.mjs:1` | 关键帧缓存 `{ v, top, frames, truncated }`：把逐层状态压缩成变更点；明确可丢弃。 | `keyframes` | 外部契约 | S10 | 删掉后重算必须逐项一致（战役裁决 7）。读取在 `root-store.mjs:78`。 |
| `自定义.同步世界书`, `.同步手动`, `.忽略` | `map/tavern/mvu.mjs:118` | `自定义` 的子键：世界书同步开关（默认开）、「用户手动设置过」标志、最多 50 个被忽略的地点名。 | `syncWorldbook`, `syncManual`, `ignored` | 外部契约 | S10 | `同步手动` 守着 0.9.3 的一次迁移（`root-store.mjs:86`）；S10 的读取代码里要保留这条迁移路径。 |
| `自定义.items[*].类`, `.名`, `.用途`, `.别名`, `.源` | `map/tavern/mvu.mjs:124` | 一个自定义项的字段：类别（`room` / `area` / `landmark` / `character` / `layer` / `world`）、显示名、用途文字、别名、来源。 | `kind`, `name`, `purpose`, `aliases`, `source` | 外部契约 | S10 | `源` 的取值也是中文：`标签`（来自标签）和 `手动`（手动）改成 `tag` / `manual`。同样的字段也出现在 `eden-map:custom` 的载荷里。 |
| `槽位.名`, `.件` | `map/core/ledger.mjs:364` | 虚拟槽位里的槽位名与件数（`slotSave` 仅在有名字且件数大于 0 时才写）。 | disappear with the merge into `stash` | 外部契约 | S6 | **已在 S6-2 迁移（S10 前只读）：** `stash.slot.name` 与 `stash.slot.facts` 的条数（件数由它算出）；物品 `物` 变成 `facts`，`楼` 变成 `msgIndex`。 |
| `检查点.楼` | `map/tavern/modes.mjs:105` | 检查点里的聊天消息序号。 | `msgIndex` | 外部契约 | S10 | 同级的 `swipe` 已经是 ASCII，保留。 |
| `eden_wb_ver` (top-level chat variable) | `map/tavern/host-th.mjs:141` | 这个聊天上次见到的附加条目版本，用来让「附加条目有新版」的提示每个聊天只出现一次。 | `spatial_wb_ver` | 外部契约 | S10 | 放在根键旁边而不是里面。新聊天只记录、不提示。 |

### F. 存储、协议、API 与分发名

离开查看器页面的名字：`localStorage` 和酒馆助手变量名、世界书 `extra` 标记、存在于已保存聊天里的标签语法、注入 id、协议前缀、入口文件、包名和 CDN 名。`edenMap*` 存储键整个家族占一行（82 个键），不逐键列。迁移规则见规则 7。对第一个设定包，有几行有更便宜的路：让设定包清单声明它的旧名字，只有引擎默认值变（见 open 第 4 条）。

| 当前名 | 位置 | 含义 | 建议新名 | 类别 | 批次 | 备注 |
|---|---|---|---|---|---|---|
| `edenMap*` storage keys (family) | `map/core/storage.mjs:11` | `KEYS` 登记了 82 个键：80 个以 `edenMap` 开头、2 个是历史遗留的 `edenEstate*`；6 个是前缀族、3 个按聊天分、8 个带冒号、12 个镜像到脚本变量 `eden_prefs`（`SCRIPT_KEYS`）。 | `spatialMap*` as the engine registry; the first pack keeps `edenMap*` through `nsKey` | 外部契约 | S10 | 整个家族占一行（不逐键列）。`nsKey`（`core/pack.mjs:10`）和 `window.__nsKey` 按 7 个字符（`edenMap`）截取：两处都要改成按前缀长度。因为第一个设定包本来就映射到旧名字，已存数据不用搬。 |
| `edenEstateLabels`, `edenEstateHintSeen` | `map/core/storage.mjs:52` | 第一个设定包三维页的两个历史遗留键（自定义房间标签、首次提示已看）。 | (keep; move with the pack) | 外部契约 | S10 | 它们是登记里仅有的两个不以 `edenMap` 开头的键。 |
| `tcp.<id>.*` (non-first-pack namespace) | `map/core/pack.mjs:8` | 除第一个设定包外，所有设定包的存储前缀：`tcp.<id>.` 加去掉 `edenMap` 的登记键。 | `pack.<id>.*` | 外部契约 | S10 | "tcp" = "tc pack"（卡名前缀）。目前只有虚构的示例包 `town` 在用，迁移风险低。`TCStore` 在带命名空间的键为空时本来就会去读原始的 `edenMap*` 键（`viewer.html:31`），所以读取回退的通路已经有了；再加一条回退读旧 `tcp.` 形式也是同样的做法。 |
| `eden_prefs` (script variable) | `map/tavern/host-th.mjs:46` | 酒馆助手的脚本变量，镜像 12 个 `SCRIPT_KEYS` 偏好，让它们在浏览器存储被清空后仍在。 | `spatial_prefs` | 外部契约 | S10 | 存在酒馆一侧、跨设备：两个名字都读，只写新的。 |
| `eden_wb_tomb`, `eden_wb_notice`, `eden_wb_chars` (global variables) | `map/tavern/host-th.mjs:97` | 世界书自动化用的酒馆助手全局变量：墓碑标志、上次提示过的版本、已绑定角色列表（本机存储里还有镜像 `edenMapWbTomb`、`edenMapWbNoticeVer`、`edenMapWbChars`）。 | `spatial_wb_tomb`, `spatial_wb_notice`, `spatial_wb_chars` | 外部契约 | S10 | 墓碑的意思是「用户撤销过 / 删过这本书」：丢了它就会把用户删掉的书又建出来，所以这个必须先迁移、再写入。 |
| `extra.eden_id`, `eden_ver`, `eden_hash` | `map/tavern/wbsync.mjs:4` | 附加世界书条目的归属标记：稳定编号、写入时的版本、内容指纹。只有带 `eden_id` 的条目才会被写入或删除（brief §2.5）。 | `extra.spatial_id`, `spatial_ver`, `spatial_hash` | 外部契约 | S10 | 分别 27 / 9 / 14 处使用。最危险的改名：用户的书里已经有旧标记，而安全规则就是靠它定义的。要么永远把两种标记都当作「我们的」，要么让设定包声明标记前缀（第一个设定包继续用 `eden_`），这样什么都不用迁移。已拍板（决定 a）。 |
| `extra.eden_retired`, `eden_order`, `eden_conflict`, `eden_dup` | `map/tavern/wbsync.mjs:60` | 附加条目上的状态标记：在新版里已下线（并保存原顺序）、冲突的编辑被留存、重复。 | `spatial_retired`, `spatial_order`, `spatial_conflict`, `spatial_dup` | 外部契约 | S10 | 与归属三件套同一个决定；作为一组一起动。 |
| `extra.eden_jit`, `eden_jit_ignore` | `map/tavern/wb_jit.mjs:7` | JIT 标记：条目是被 JIT 关掉的 / 用户手动关掉、JIT 永远不许碰的条目。 | `spatial_jit`, `spatial_jit_ignore` | 外部契约 | S10 | `eden_jit_ignore` 是保护用户意愿的标志：丢了它，JIT 就会把用户手动关掉的条目重新打开。 |
| worldbook name prefix `伊甸地图·` | `map/tavern/wbsync.mjs:10` | 我们附加书的名字前缀（`BOOK = PREFIX + …`）；代码从不碰其他书。 | pack manifest `worldbook` name (data) | 外部契约 | S10 | 计划里已经把书名改成设定包数据（「伊甸保留原书名」）；引擎里只留一个中性默认值。已有的书就是靠这个名字找到的。 |
| event span attribute `data-tcmap` | `map/tavern/events.mjs:3` | 编码一个事态的隐藏 span 上的 HTML 属性（`data-tcmap="类型=…;地点=…"`）；由模型和世界书规则写出，从聊天正文里解析。 | `data-spatial-event` for new packs; `data-tcmap` accepted forever | 外部契约 | S10 | 11 处使用。它存在于已保存的聊天和世界书的「地图联动规范」条目里：聊天记录是唯一真相，旧写法必须永远能解析。 |
| tag lines `⌖人物`, `⌖事实`, `⌖改名`, `⌖用途`, `⌖地点` | `map/tavern/characters.mjs:3` | 解析器读取的聊天正文标签：人物位置、剧情事实、改名、用途、地点。`⌖` 标记本身是中性的，关键词是中文。 | keep the grammar; add optional ASCII aliases per pack | 外部契约 | S10 | `⌖人物` 10 处、`⌖改名` 8 处、`⌖事实` 7 处、`⌖用途` 5 处、`⌖地点` 2 处。永远不删：已有聊天里就有它们。 |
| macros `{{eden_here}}`, `{{eden_route}}`, `{{eden_fly …}}` and marker `data-eden-fly` | `map/tavern/th.mjs:101` | 卡和预设作者可以写的宏；展开成当前地点、最近一段行程，或一个让地图飞往某地的隐藏标记。 | `{{spatial_here}}`, `{{spatial_route}}`, `{{spatial_fly …}}`, `data-spatial-fly`; old names stay | 外部契约 | S10 | 别人的卡里可能已经写了它们（默认关，开关 `edenMapMacros`）。旧写法要永远保留为别名。 S10 备注（用户，2026-10-01）：另加中性别名 `{{map_here}}` / `{{map_route}}`，带包前缀的旧名保留。 |
| injection and lock ids `eden-map-events`, `eden-map-state`, `eden-map-spatial`, `eden-map-wb` | `map/tavern/eden-map.js:453` | 宿主添加的提示词注入的 id（事态、状态行、空间契约）和世界书锁的名字。 | `spatial-events`, `spatial-state`, `spatial-contract`, `spatial-wb` | 外部契约 | S10 | 常量 `STATE_ID`（`modes.mjs:5`）、`SPATIAL_ID`（`spatial.mjs:14`）。版本切换时会短暂同时跑两份脚本：两边必须替换同一条注入，而不是各注入一条。 |
| mount element id `eden-map-root` | `map/tavern/eden-map.js:41` | 宿主面板根节点的 DOM id；新版本靠它找到旧实例（`eden-map.js:43` 的 `oldStyle` 判断）。 | `spatial-map-root` | 外部契约 | S10 | 与 `__edenMapCleanup` 一起构成跨版本握手（表 C）。 |
| protocol prefix `eden-map:*` | `map/core/protocol.mjs:11` | 90 种消息类型里的 63 种：宿主与查看器用它们通信（`boot`、`ready`、`state`、`here`、`notice`、`custom`、`loot` 等）。 | `spatial:*` with `PROTO` 3 | 外部契约 | S10 | 宿主脚本（用户安装）和查看器（来自 CDN）版本可能不同，所以信封里带 `v`。只有当对方的 `eden-map:ready` 报告 `proto` 为 3 之后才发新前缀；期间 `accept` 两种都收。声明了旧协议前缀的设定包继续用它（决定 a）。 |
| protocol prefix `estate:*` | `map/core/protocol.mjs:77` | 查看器与三维子页之间的 20 种类型（`room`、`floor`、`loot`、`cvd`、`fps` 等）；`estate:floor` 还以 `both` 方式转发。 | `subpage:*` | 内部 | S5 | 查看器和子页同版本发布，所以这组属于内部契约，随 `app/estate.mjs` → `subpage3d-host.mjs` 一起改。`tests/protocol.test.mjs` 里列了这些名字。 |
| protocol prefix `v3d:*` | `map/core/protocol.mjs:91` | 查看器与通用三维查看器之间往来的 7 种类型（`fly`、`mode`、`flows`、`backdrop`、`viewport`、`budget`、`state`）。 | `viewer3d:*` | 内部 | S5 | 理由同上；"v3d" 也是探针 `__v3d` 的名字。 |
| entry file `map/tavern/eden-map.js` | `map/tavern/eden-map.js:1` | 用户导入的宿主脚本（经生成的预览 / 标签脚本），也是路径里带卡名的唯一文件。脚本 id 是 `uuid5("eden-map-preview:<ref>")`（`tools/build_preview_script.py:70`），所以重新导入是覆盖而不是重复。 | `map/tavern/host-entry.js`, with the old path kept as a one-line forwarder | 外部契约 | S10 | 现在 1535 行，S5 要拆。CDN 上已发布的 tag 不可变，所以旧脚本会永远加载旧路径；不要改脚本 id 的种子。 |
| npm package `tiancheng-map-assets` | `tools/pack_npm.sh:11` | npm 镜像包的名字（国内镜像线路）；`host-routes.mjs:23` 里的默认值，也是第一个设定包清单的 `cdn.npm`。 | `spatial-os-assets`（暂定，S10 定）as the engine default; the first pack keeps its name | 外部契约 | S10 | 包名不能复用或改名；新包意味着新 URL，旧版本原地不动。通过清单已经是数据驱动的了。 |
| CDN repository `kcgoofee-jpg/my-tavern-experiments` | `map/tavern/host-routes.mjs:23` | jsDelivr 及镜像所服务的仓库（`cdn.repo`）；设定包没写时的默认值。 | the new engine repository (name to be chosen at the S10 split) | 外部契约 | S10 | 已安装的脚本里嵌着旧 URL，所以旧仓库必须继续提供服务。名字由用户决定（见 open 第 5 条）。 |
| CDN data paths `map/data/head.json`, `map/data/worldbook_addon.json` | `map/tavern/follow.mjs:10` | 已安装的脚本按 URL 取的文件：分支的构建指针（`{ build, sha, at }`）和附加世界书内容。 | move into `map/packs/eden/` with the pack; leave forwarding files at the old paths | 外部契约 | S10 | 计划在 S10 搬走第一个设定包的数据。`head.json` 由 `tools/bump_head.py` 写、由 `follow.mjs` 读，两边要一起改。 |
| feedback file name `eden-map-feedback-<time>.txt` | `map/app/feedback.mjs:44` | 下载的反馈报告的文件名。 | `spatial-map-feedback-<time>.txt` | 外部契约 | S10 | 只是外观问题；跟随产品名。 |
| map `kind: "estate"` in `maps.json` | `map/data/maps.json:119` | 标记某张地图会打开三维子页的取值：第一个设定包的数据里有 42 张图带它（庄园及其地标三维页），引擎、工具和测试代码里有 38 行在拿它做比较。其他取值：`points`（12 张）、`world`（1 张）。 | `subpage3d` (schema v2 decision) | 外部契约 | S10 | 属于设定包数据，所以归内核 schema（S1）和数据迁移（S2 / S3）；列在这里是为了让 "estate" 这个词在一份计划里一次退役，而不是分三次。 |
| card-owned `eden_custom_portraits`, `eden_portrait_<name>` | `map/chars.mjs:31` | 角色卡自己的状态栏写入的 `localStorage` 条目（头像映射和每人一份的 data URL）；地图只读。 | (never rename; not ours) | 外部契约 | — | 外来契约：可以改我们的读取代码，但这些键本身改不了。列在这里是防止有人顺手把这里的 `eden_` 前缀「清理」掉。 |

## 领域术语表

代码、计划和文档共用的词汇。「plugin」之后的四个实体按 `docs/ARCHITECTURE.md` §1 定义。一个词有多个含义时，最后一列说明这里指的是哪一个。

| 术语 | 含义 | 现在在哪里 | 不要混淆 |
|---|---|---|---|
| **Spatial OS / Spatial Map** | D5 定下的中性产品名：与角色卡无关的引擎加数据设定包。 | 计划与 brief 里；代码里还没有（仍是 `EdenMap`，表 C）。 | `Eden Map`，第一个设定包的产品名。 |
| **engine** | 不知道任何卡的代码（`map/core`、`app`、`tavern`、`ui`、`three`、`map/*.mjs`、两个页面）。 | `tools/check_architecture.py` 里的 `ENGINE_GLOBS`。 | 设定包（数据）。 |
| **pack** | 描述一张卡的世界的数据：一份清单加它指向的文件。引擎只读取、从不执行。 | `map/packs/<id>/manifest.json`；第一个设定包 `eden` 还用 `map/data/`；`town` 是虚构的示例。 | npm 上的「包」（`tiancheng-map-assets`）。 |
| **host** | 在酒馆页面里运行的酒馆助手脚本 `map/tavern/eden-map.js`。通过 `MVUBridge` 独占对 `Mvu` / `SillyTavern` 的访问。 | `map/tavern/*`。 | `app/host.mjs`，它在查看器里、处理宿主消息（将改名 `host-messages`）。 |
| **viewer** | `map/viewer.html`：嵌在宿主里的 iframe，或单独打开：二维地图页。 | `map/app/*`、根外挂、`viewer.html`。 | `viewer`（OpenSeadragon 实例，表 D）和 `viewer3d.html`（三维页）。 |
| **sub-page** | 查看器用 blob iframe 打开的三维页面：第一个设定包的庄园页或通用三维查看器。 | `app/estate.mjs`（将改名 `subpage3d-host`）、协议前缀 `estate:` 和 `v3d:`。 | 作为内容的 "estate"：庄园本身。 |
| **plugin** | 根目录 `map/*.mjs` 里的查看器模块，作为独立 script 标签加载；只通过 `P` 与别的模块交流。 | `app/plugins.mjs`、`register(name, api)`。 | 酒馆助手或酒馆的扩展。 |
| **SpatialNode** | 节点树里的一个地点；节点树是唯一的地理结构（S1–S3）。 | `core/nodes.mjs`；节点树在加载时由 v1 文件建出（S4 起原生 schema 2）。所有地点都经它解析（S3）。 | DOM 节点；地图标记（一个节点可以有标记）。 |
| **PresentEntities** | 站在当前节点的实体，先是人物。 | `core/entities.mjs` 的 `presentAt`（S6-1）；人物页用 `peopleSections` 按层级给在场的人分组。 | WorldRoster（所有已知的人，不限地点）。 |
| **WorldRoster** | 所有来源里已知的全部实体，按来源优先级合并成标准 `RosterRow`。 | `core/roster.mjs`；「chars」「characters」「roster」是同一个概念的三个名字。 | PresentEntities。 |
| **Stash** | 有真实空间归属的物品（地图、标记、暗格），并与玩家已携带的对账。一个概念，目前有五个名字：stash、pickup、loot、inventory、`inv`。 | `core/stash.mjs`、`core/pickup.mjs`、`app/loot.mjs`、`tavern/inventory.mjs`、`inv.mjs`；统一存储 `eden_map.stash`（S6-2，`tavern/stash-store.mjs`；由 `tavern/stash-recompute.mjs` 重算；宿主流是 `tavern/stash-flow.mjs`）。 | JS 栈，或账本的「槽位」（会并入 stash）。 |
| **drawer tab** | 抽屉 / 右栏的内核页签之一（`events`、`characters`、`places`、`legend`；抽屉 id `ev`、`ch`、`pl`、`lg`）；包用 `ui.tabs` 给出子集和顺序（K-R72）。 | `core/drawer-tabs.mjs`（规则）、`app/tabs.mjs`（注册表）。 | 浏览器的标签页。 |
| **place / current place** | 地图上一个有名字的位置；「当前地点」是聊天里说玩家所在的地方。代码里叫 `here`。 | `here-v2.mjs`、`hereRes`、`eden-map:here`。 | 标记（画出来的图钉）或节点。 |
| **place card** | 点击标记时打开的面板。 | `app/markers.mjs` 的 `showCard`、`app/cardlinks.mjs`。 | 角色卡（酒馆里的对象）和「卡设定」数据。 |
| **character card / card** | 故事所用的酒馆角色卡。地图从不生成或修改角色卡。 | brief §3 和 §7；设定包数据里的 `stat_data` 路径。 | 地点卡（上一条）。 |
| **pack picture（包图片）** | 属于设定包的图片：`media` 块里的一项，列在节点的 `media` 里（K-R101）。随导出一起走，计入大小上限。 | `core/pack-media.mjs`、`core/pack-draft.mjs` |
| **private picture（私有图片）** | 用户只在这个浏览器里给某个地点留的图（图集 IndexedDB，`n:<节点 id>`）；永不进入导出（K-R102）。 | `ui/room-gallery-panel.js`、`core/room-gallery-db.mjs` |
| **edit draft（编辑草稿）** | 作者在编辑模式里做的改动：和设定包分开存在这个浏览器里、套在包上显示；导出时并入（K-R100）。 | `core/pack-draft.mjs`、`app/pack-edit.mjs` |
| **automatic pack** | 宿主为没人写过包的卡造出来的 schema-2 包：以卡名命名的根、从世界书标题里找到的地点、从变量形状里找到的变量路径和人物，以及从聊天里长出来的节点（K-R93–K-R95）。外来包、可丢弃的缓存、可导出（K-R98）。 | `core/card-read.mjs`、`core/grow.mjs`、`tavern/auto-pack.mjs`；包来源 `auto`；聊天变量键 `auto`。 | 随地图发布的包（`eden`、`town`、`minimal`）；第一个包。 |
| **card source** | 宿主为包门卫和自动包从当前卡读出的朴素对象：名字、作者、标签、头像、开场白、世界书标题与关键词、变量树和 initvar 文本。条目正文不在其中（K-R94）。 | `tavern/card-source.mjs` 的 `readCardSource`；`core/card-read.mjs` 是它的纯函数。 | 角色卡本身，地图从不编辑它。 |
| **map level** | 多层地图的一层，例如城市的各层；用层切换条和「上一级」到达。 | `app/layers.mjs`（将改名 `map-level-nav`）、`REG.groups`。 | Layer slot。 |
| **layer slot / LayerRegistry** | 视口内 10 个固定渲染槽位之一（`base` … `interaction`），各有 z 值；图层向槽位注册。 | `core/layers.mjs`（将改名 `layer-registry`）、`app/layerhost.mjs`、`window.TCLayers`。 | Map level。 |
| **declared layer（宣告图层）** | 由 `layers` 块或内核清单里的一行给出的图层（K-R79）：id、绘制积木（`type`）、槽位、来源、applies 规则、菜单行与图例行。画在某个图层槽位里。 | `core/layer-spec.mjs`、`core/layer-defaults.mjs`、`app/layer-host.mjs`（`declared`、`applyPackLayers`）。 | 图层槽位（它画在哪里）与 map level。 |
| **kernel layer（内核图层）** | 引擎自带的 17 个视口图层之一（天气、航线、迷雾、标记……），声明在 `KERNEL_LAYERS`；设定包可以调整它的菜单行、`applies`、图例或把它 `off`，但不能改它的槽位、积木或来源（K-R79）。 | `core/layer-defaults.mjs`。 | 设定包声明的图层（origin 为 `pack`）。 |
| **view / parse / core (suffixes)** | 同名文件对的后缀：`-view` 在查看器里绘制，`-parse` 在宿主里从聊天正文推导数据，纯的共享核心保留裸名。 | 规则见本文；表 B 里落地。 | MVC 框架里的 view。 |
| **ledger** | 这个词有两个互不相干的用法。(1) `core/ledger.mjs` 的结算账本：按域校验的原子指令。(2) 棘轮账本 `tools/arch_baseline.json`：只许减少的计数。 | 如上。 | 彼此；探索台账 `探索` 是第三个小的。 |
| **head #N** | 集成分支的构建计数：`map/data/head.json` 的 `{ build, sha, at }`，由 `tools/push_preview.sh --head` 里的 `tools/bump_head.py` 递增。 | 提交标题 "head #101"；由 `tavern/follow.mjs` 读取。 | 发布版本号（`VERSION`）；重构期间不打 tag、不升版本。 |
| **lane** | 设定包数据里：地标之间高空主干线这一类路线（`kind: "lane"`），与 `patrol`、`patrol_city` 巡逻环并列。 | `core/traffic.mjs`、`app/markers.mjs`、`tools/check_maps.py`。 | CI 通道；brief 里的「渲染线」「代码线」工作流（那是 "line"）；CDN 的 "line"（`edenMapLine`），指线路选择。 |
| **floor** | 聊天消息的序号（`楼`、楼层号）。引擎到处在用：`floorNow`、关键帧的 `floor`、标签楼层。 | `tavern/context.mjs`、`keyframes.mjs`、`timeline.mjs`。 | 建筑楼层：房间数据里也有 `floor`（`estCard.floor`、`B2`–`F3`）。已定（d）：消息位置叫 `msgIndex`，建筑楼层叫 `storey`，标识符里不再使用 “floor” 这个词。 |
| **swipe** | 同一聊天楼层的另一个候选回复。 | `检查点` `{ 楼, swipe }`、`tavern/snapshot.mjs`。 | 触摸手势。 |
| **MVU / `stat_data`** | 卡的变量框架和保存其状态的对象。地图只读（规则：绝不写 `stat_data`）。 | `tavern/mvu-bridge.mjs`（唯一接触者）、`mvu.mjs`（读取函数）。 | 地图自己的聊天变量 `eden_map`。 |
| **chat / script / global variable** | 我们用到的酒馆助手三种变量作用域：聊天（`eden_map`、`eden_wb_ver`）、脚本（`eden_prefs`）、全局（`eden_wb_*`）。 | 表 E 和表 F。 | 浏览器 `localStorage` 键（`edenMap*`）。 |
| **worldbook add-on** | 我们自己的世界书（名字前缀 `伊甸地图·`），条目带 `extra.eden_id`；是我们唯一会写的世界书。 | `tavern/wbsync.mjs`、`wb_jit.mjs`、`wb_crystallize.mjs`。 | 卡自带的世界书和用户的世界书（永不触碰）。 |
| **crystallization / JIT hydration** | 结晶：把坐实的剧情事实沉淀成附加条目。JIT 水合：只启用与当前地点相关的条目。 | `wb_crystallize.mjs`、`wb_jit.mjs`。 | 彼此：一个写条目，一个切换 `enabled`。 |
| **planner (navigator)** | 由用户自己的 API key 驱动的可选后台规划器；只返回操作块、不返回自由文本。 | `tavern/navigator.mjs`、`llm.mjs`、`ops.mjs`。 | 浏览器的 `navigator` 对象。 |
| **keyframe / checkpoint** | 关键帧：把逐层状态压缩成变更点，可丢弃的缓存。检查点：最后确认的楼层与 swipe，启动时用来作废过期状态。 | `keyframes.mjs`、`modes.mjs`；键 `关键帧`、`检查点`。 | 故事的存档点。 |
| **tier / lean / inset** | 档位：瓦片加载的清晰度上限。lean：省流判断。插图：高倍放大时叠加的单独高分辨率瓦片图。 | `app/tiers.mjs`、`app/insets.mjs`。 | 价格档位；`insets[]` 是数据侧的字段。 |
| **probe** | `tools/browser/` 下驱动查看器的浏览器脚本，或为它加的 `window.__…` 接口。 | `tools/browser/` 下 51 个文件；探针接口见表 C。 | 网络探测或能力探测（`hostFns` 的功能探测）。 |
| **estate / closet** | 第一个设定包的内容用词：庄园（`eden_estate`）和衣帽间样板间页面。在引擎里 "estate" 还代表「会打开三维子页的地图」（见 sub-page）。 | `map/estate/`、`app/estate.mjs`、`core/estate3d.mjs`、`kind: "estate"`。 | 房地产；退役方案见表 F 的 `kind: "estate"` 行。 |
| **instance / owner / takeover** | 宿主脚本的一个运行中的副本；`OWNER` 是它的身份；新副本通过 `__edenMapCleanup` 接管旧副本。 | `tavern/host-lifecycle.mjs`、`eden-map.js`。 | `storage.mjs` 里 `KEYS` 的 `owner` 字段（只是文档）。 |
| **compose** | 把模板句填进聊天输入框，绝不发送。 | `compose.mjs`、`tavern/compose.mjs`、`edenMapCompose`。 | 注入（`action.mjs`），那是把文字加进提示词。 |
| **ratchet** | 记录的计数只许下降的检查：文件行数、裸 z-index、内联样式、卡名词。 | `tools/check_architecture.py`、`tools/arch_baseline.json`。 | 棘轮扳手。 |

## Open items（待办与待定）

~~1. **审计发现的潜在 bug（本次不修）。** `app/host.mjs:52,54` 调用 `P.TCFog?.mute?.(…)`，但 `fog.mjs` 把 `TCFog` 挂在 `window` 上、从未登记到 `P`，所以 `P.TCFog` 永远是 `undefined`，回放期间的静音（Part 5-4）从不运行。S5 改名时应让两处访问走同一条路；行为修复是另一个小改动。~~ ✅ 2026-09-30 已在 S0-D 修复（`fog.mjs` 把 `TCFog` 登记进 `P`）。

~~2. **死钩子。** `__edenHostVersions`、`__edenHereText`、`__edenMvuSnapshotStatus`、`__composeTest` 在整个仓库里只有读、没有写。删掉或补上写入方；不要给它们改名。~~ ✅ 2026-10-01 e8de25b3 已在 S5-3 删除（读取与只为它们存在的代码路径；没有探针写过它们）。
~~3. **过期的属主字符串。** `core/storage.mjs` `KEYS` 的 `owner` 字段写着 `events.js`、`chars.js`、`custom.js`、`trips.js`、`security.js`（5 个名字、8 个键），而这些文件是 `.mjs`。只是文档；随 S5 文件改名一起修。~~ ✅ 2026-10-01 e8de25b3 已在 S5-3 修正（属主现为 `events-view.mjs`、`characters-view.mjs`、`custom-names-view.mjs`、`trips-view.mjs`、`security.mjs`）。
~~4. **待定：第一个设定包怎样保留旧名字。** 要么由设定包清单声明旧名字（存储前缀 `edenMap`、聊天根键 `eden_map`、世界书标记前缀 `eden_`），只有引擎默认值变中性，这样什么都不用迁移；要么全部改名、旧名字永远读。第一条路更便宜，而且对世界书标记更安全：漏读一个旧标记，我们就会把自己的条目当成用户的。聊天根键和存储前缀现在已经是这种做法。~~ ✅ 2026-09-30 已定，见「Decisions」(a)。

~~5. **待定：只有用户能定的名字。** 标识符里的中性前缀（本文假定用「Spatial Map / Spatial OS」（D5）里的 `spatial` / `Spatial`）、引擎仓库名、新的 npm 包名。~~ ✅ 2026-09-30 已定，见「Decisions」(b)。

~~6. **`util.mjs`、`shell.mjs`、`$`。** `app/util.mjs` 没有单一职责（坐标换算、DOM 辅助、协议版本戳、读屏播报、`getJSON`），需要拆分设计而不是改名。`app/shell.mjs` 把控制列、抽屉胶水、通知层、状态点和单手模式捆在一起。`$`（21 个导入方）作为通行写法违反三字母规则：按例外保留，还是放进同一轮脚本一起改？~~ ✅ 2026-09-30 已定，见「Decisions」(c)。

~~7. **`floor` 有两个含义。** 聊天楼层（消息序号）和建筑楼层（`B2`–`F3`、`estCard.floor`）。建议：新代码里建筑楼层说 `storey`；已有名字只在所在文件本来就要改名时顺带改。~~ ✅ 2026-09-30 已定，见「Decisions」(d)。

~~8. **计划草案对 `baibai.mjs` 写的是 `appearance-bridge`。** 本文建议 `imagegen-bridge`，因为它的主要职责是出图（写路径），外貌库只是读。请选一个。~~ ✅ 2026-09-30 已定，见「Decisions」(e)。

9. **表里已消除的多义词：**「layer」（槽位 vs 地图层级）、「ledger」（结算 vs 棘轮 vs 探索）、「bridge」（MVU vs 绘图 vs 兼容 getter）、「tick」「line」「host」「card」。其中两个需要约定而不是改名：`floor`（第 7 条）和「card」（地点卡 / 角色卡 / 卡设定数据），术语表现在固定了措辞。
10. **没检查的：** 69 个没被标记的引擎文件的名字，以及 `tools/**`、`tests/**`、`docs/**` 里的名字。测试和文档的名字随代码改名在同一批处理。

## Decisions（2026-09-30 的决定）

由用户做出；关闭上面的待办第 1 和 4–8 条。本节不改任何代码：改名按表里写的在 S5（内部）和 S10（外部）进行。

(a) **第一个设定包的旧名字写在该包的清单里。** 存储前缀、聊天变量、世界书标记前缀和协议前缀都在那里声明（`eden` 包：`edenMap`、`eden_map`、`eden_`、`eden-map:`）。引擎读取声明的旧名字、写入新名字；只有声明了旧名字的包才承担这份成本。用户的聊天、存储和世界书都不用手工迁移。关闭待办第 4 条。

(b) **标识符前缀 `spatial` / `Spatial`；引擎仓库 `spatial-os`；npm 包名在 S10 定**（暂定 `spatial-os-assets`）。关闭待办第 5 条。

(c) **`util.mjs` 和 `shell.mjs` 在 S5 拆分**（按职责拆，不是改名）。**`$` 保留**，作为唯一允许的短辅助名（命名规则 3 的例外）。关闭待办第 6 条。

(d) **聊天消息位置叫 `msgIndex`；建筑楼层叫 `storey`；标识符里不再使用 “floor” 这个词。** 相关表格行和词汇表条目已同步；`楼` 之类的中文键随 S10 外部批次处理。关闭待办第 7 条。

(e) **`baibai.mjs` 改为 `imagegen-bridge.mjs`**（不用 `appearance-bridge`）。关闭待办第 8 条。
