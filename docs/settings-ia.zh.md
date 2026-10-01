# 设置的信息架构与 AI 功能卡（S7 设计，N4）

> 中文版；以英文版 `docs/settings-ia.md` 为准（两边标题结构相同，由 `tools/check_zh_mirror.py` 把关）。本文是计划步骤
> **S7-design** 的产出（计划 `docs/plans/spatial-os.md` §5 阶段 C 的 S7；`docs/todo.md` N4、N7）。状态：**设计稿，工作决定
> 已按默认生效**（2026-10-01 你不在；决定就是 `docs/ui-refactor.md` §0 的 U 项，同步写在 `docs/todo.md` §3）。本文不改代码，
> 由步骤 **S7-1** 实现（见 `docs/ui-refactor.md` 附录）。文中关于现有代码的说法都在 origin/preview `df3b5f6d`（head #239）核对过。

## 1. 为什么要改

现在的设置面板（`#setPop`，`map/app/settings.mjs`，标记在 `map/viewer.html` L645–691）有六页——显示 / 人物 / 数据与映射 /
更新与版本 / 版权申明 / 高级——是一点点堆出来的：

- 让地图和模型打交道的八个开关（`map/app/tavernhelper-settings.mjs` `renderInj` L69–103）在「数据与映射」里排成一列，
  它们的深度与上限却在「高级」（L97–102）；动作注入在「显示」（`viewer.html` L665），它的句子模板又在「数据与映射」
  （`map/compose-view.mjs` L43）；
- 昼夜色调开关藏在「自定义」框里（`map/custom-names-view.mjs` L109），头像、图鉴开关也是（L110–111）；
- 好几条说明在一个可能已经打开的开关旁边写着「默认关」（§6）；
- 开了某个功能后，没有任何地方告诉你它在这个聊天里到底生没生效、发给模型的原文是什么、花多少 token；领航员在宿主页用
  `window.confirm` 征求同意（`map/tavern/llm-flow.mjs` L34–38），用 `window.prompt` 收端点配置（`tavernhelper-settings.mjs`
  L93–96），都是阻塞弹窗（违反简报第 6 条）。

目标：八个分组、顺序固定，每个设置只出现在一个地方；每个和 AI 联动的功能都是一张**功能卡**：自己解释自己、给出它现在
在做什么、说明有没有生效。

## 2. 分组

首页顺序（每组一行：标题 + 一句当前状态摘要，沿用现在的 `.sgroups` 行）：

| # | 分组 | 页 id | 用途 |
|---|---|---|---|
| 1 | 常用 | `home`（首页顶部一块，没有子页） | 常改的几项，加上手机首页已有的快捷动作与切层 |
| 2 | 地图与图层 | `map` | 地图的样子和动作：图层、迷雾、小地图、色调、色觉、三维画质与相机 |
| 3 | 人物与物品 | `people` | 人物页、物品页显示什么 |
| 4 | AI 联动 | `ai` | 功能卡 C1–C10（§4）：凡是发文字给模型、写世界书、调端点的都在这里 |
| 5 | 数据与映射 | `data` | 数据从哪来、存在哪：来源、变量映射、自定义名称、附加世界书、存储 |
| 6 | 更新与版本 | `update` | 构建、通道、检查更新、自检、加载线路 |
| 7 | 高级 | `adv` | 地图包、编辑模式、快捷键、调试、后台预扫 |
| 8 | 版权申明 | `license` | 角色卡信息、地图署名、免责声明 |

规则：

- 页 id `people`、`data`、`update`、`adv`、`license` 不变（探针和 `SettingsApi.open(page)` 在用）；`display` 改名 `map`，
  `SettingsApi.open('display')` 保留一个版本的别名。`registerSection(page, el, { order })` 签名不变；未知页仍落到 `adv`。
- 没嵌在酒馆里时隐藏「AI 联动」这一行（没有宿主，它的功能都跑不了），和现在 tavern-helper 框的做法一样
  （`tavernhelper-settings.mjs` L111）。它的摘要写 `<n> 项开启 · <m> 项未生效`（来自健康数据，§5）。
- 「常用」不是一页：它是首页分组列表上方的第一块，最常用的控件零跳转。桌面上三行；手机上接在快捷动作后面。
- 搜索（`#setQ`）照旧搜所有页；功能卡按名称和用途可搜。
- 首页底部写死的原作者一行（`viewer.html` L654，引擎文件里的卡名）移到「版权申明」，按包的 `credits`（K-R70）渲染，和
  那一页其余内容一样。首页只留一行中性的「版权申明」入口。

## 3. 清单：现在每个设置归到哪一组

键以 `map/core/storage.mjs` `KEYS`（L11–66）为准。「现在在哪」用现在的页名。文字改动见 §6、§7；没列出的措辞不变。

### 3.1 查看器的设置

| 设置（控件 id） | 键 | 默认 | 现在在哪 | 新分组 | 备注 |
|---|---|---|---|---|---|
| 主题（`#themeSeg`） | `edenMapTheme` | auto | 显示 | 常用 | |
| 语言（`#langSeg`） | `edenMapLang` | zh | 显示 | 常用 | |
| 清晰度（`#tiers`） | `edenMapTierV2` | auto | 显示 | 常用 | |
| 惯用手（`#handSeg`） | `edenMapHand` | auto | 显示 | 常用 | |
| 减少动态（`#rmSeg`） | `edenMapRM` | auto | 显示 | 地图与图层 | 也驱动 rAF 暂停（`docs/ui-refactor.md` §4） |
| 关闭花屏特效（`#optNoFx`） | `edenMapNoFx` | 随减少动态 | 显示 | 地图与图层 | |
| 迷雾探索（`#optFog`、`#fogReset`） | `edenMapFog` | 1 | 显示 | 地图与图层 | |
| 小地图（`#optMinimap`） | `edenMapMinimap` | 0 | 显示 | 地图与图层 | 去掉说明里的「（默认关）」（§6） |
| 昼夜色调（`#optNight`） | `edenMapNight` | 1 | 数据与映射 › 自定义 | 地图与图层 | 从自定义框里搬出 |
| 色觉模式（`#cvdSeg`） | `edenMapCvd` | 0 | 显示 | 地图与图层 | |
| 三维画质（`#q3Seg`） | `edenMap3dQ` | auto | 显示 | 地图与图层 › 三维 | |
| 三维抽屉自动收起（`#optAuto3d`） | `edenMap3dAuto` | 0 | 高级 | 地图与图层 › 三维 | |
| 三维自动旋转（新行） | `edenMap3dAutoRotate` | 0 | （只在三维页里） | 地图与图层 › 三维 | I-06；键已有，设置里也能改 |
| 三维滚轮缩放（新行） | `edenMap3dWheelZoom`（新） | 0 | — | 地图与图层 › 三维 | I-06；关 = 现在的行为（U-13） |
| 玻璃随世界时间（新行） | `edenMapGlassClock`（新） | 0 | — | 地图与图层 | U-02 |
| 图层行（`.more #layList`，内核层与包图层） | 每层各自（`edenMapLayers`、`edenMapRoutes` 等） | 每层各自 | 首页 › 图层（手机 + 庄园）与 `#layPop` | 地图与图层（以及图层弹层） | 一份列表，两处渲染 |
| 快捷切层（`.qlayers`） | — | — | 首页（手机、庄园） | 常用 | 不变 |
| 快捷动作 上一级 / 当前位置 / 关闭（`.acts`） | — | — | 首页（手机） | 常用 | 不变 |
| 地图上显示人物、逐人开关 | `edenMapChGroups` 与人物偏好 | — | 抽屉人物页 | 人物与物品（位置不变：抽屉） | 为完整列出 |
| 人物栏显示数值（`#optCharStats`） | `edenMapCharStats` | 1 | 人物 | 人物与物品 | |
| 人物卡更多资料（`#optCharMore`） | `edenMapCharMore` | 1 | 人物 | 人物与物品 | |
| 人物来源（`#chSrc`，只读） | — | — | 人物 | 人物与物品 | |
| 卡自带头像（`#optPort`） | `edenMapPortraits` | 非省流时开 | 数据与映射 › 自定义 | 人物与物品 | 说明里的作者名移到包文字（§6） |
| 卡自带图鉴（`#optGal`） | `edenMapGallery` | 1 | 数据与映射 › 自定义 | 人物与物品 | |
| 动作注入模式（`#injSeg`） | `edenMapInject` | off | 显示 | AI 联动 › 卡 C10「地图动作入聊天」 | |
| 填入聊天的模板（`#cmpBox`） | `edenMapCompose` | — | 数据与映射 | AI 联动 › 同一张卡的子选项 | |
| 存储与数据来源（`#storBox`） | — | — | 数据与映射 | 数据与映射 | |
| 变量映射（`#vmBox`） | `edenMap:varmap:` | — | 数据与映射 | 数据与映射 | |
| 自定义名称与用途（`#cuBox` 按钮、`#cuSync`） | `edenMap:custom`、聊天变量 | 同步开 | 数据与映射 | 数据与映射 | 只留名称按钮、同步与存储说明 |
| 附加世界书（`#thWb`） | `edenMapWbOn`、`edenMapWbWhere`、`edenMapWbTomb` 等 | 开 | 数据与映射 | 数据与映射 | 我们这本书的安装 / 同步；JIT 与结晶卡链接到这里 |
| 关于、检查更新、自动检查（`#aboutBox`、`#optAutoCheck`） | `edenMapAutoCheck` | 1 | 更新与版本 | 更新与版本 | |
| 锁定版本（`#optLockVer`） | `edenMapLockTag` | — | 更新与版本 | 更新与版本 | |
| 版本分支（`#branchSel`） | — | — | 更新与版本 | 更新与版本 | |
| 自检（`#selfCheck`）、自动更新（`#optAutoUpd`） | `edenMapAutoUpdate` | 0 | 更新与版本 | 更新与版本 | |
| 版本编码（`#build`） | — | — | 更新与版本 | 高级 › 开发者 | 「更新与版本」改显示 `构建 head #N · <日期>`（N10 第 11 条） |
| 加载线路（`#linePick`、`#lineNow`） | `edenMapLine` | 自动 | 高级 | 更新与版本 | 它讲的是脚本怎么加载 |
| 反馈按钮（挂在 `#aboutBox`） | — | — | 更新与版本 | 更新与版本 | |
| 地图包（`#packBox`），含包的模型文字 | `edenMapPackPick`、`edenMapPackLlm` | 自动 / 关 | 高级 | 高级 | |
| 编辑模式（`#optEdit`） | `edenMapEdit` | 0 | 高级 | 高级 | |
| 加载包里用链接给出的图片（`#optPackRemote`） | `edenMapPackRemote` | 0 | 高级 | 高级 | |
| 单字母快捷键（`#optKeys`）、快捷键表（`#kbdBtn`） | `edenMapKeys` | 0 | 高级 | 高级 | 合成一行（开关 + 查看）；标签去掉「默认关」（§6） |
| 上手提示再看一次（`#hintAgain`） | `edenMapHint`、`edenMapHintN` | — | 高级 | 高级 | |
| 后台静默推演（`#optTick`） | `edenMapTick` | 1 | 高级 | 高级 | 只读，不往模型发任何东西 |
| 调试帧率（`#optFps`） | `edenMapFps` | 0 | 高级 | 高级 › 开发者 | 与单独打开时的「当前地点」输入框放在一起 |
| 卡信息、地图署名、免责（`#licBox`） | — | — | 版权申明 | 版权申明 | 加上搬来的作者一行 |

### 3.2 经功能卡显示的宿主设置

这些键属于卡内脚本（`map/tavern/host-tavernhelper.mjs` `thPrefs` L152–154、prefs 处理 L163–180）；查看器只发
`eden-map:th` `op: 'prefs'`。

| 功能卡 | 现有的键 | 默认 | 新键（都在 `storage.mjs` 登记，默认关） |
|---|---|---|---|
| 事态摘要（C1） | `edenMapInvInj`（背包行，现在没界面） | 1 | — |
| 状态行（C2） | `edenMapStateInj`、`edenMapStateDepth`、`edenMapStateBudget` | 1、2、150 | `edenMapStateOmit`（省略字段的 JSON 列表；空 = 现在） |
| 宏（C3） | `edenMapMacros` | 0 | — |
| 检定掷骰（C4） | `edenMapDice` | 0 | — |
| 结算记录（C5） | `edenMapLedgerWrite` | 0 | — |
| 空间坐标契约（C6） | `edenMapSpatial`、`edenMapSpatialBudget` | 0、120 | `edenMapSpatialDepth`（默认 2 = 现在写死的深度） |
| 世界书 JIT（C7） | `edenMapWbJit` | 0 | — |
| 事实结晶（C8） | `edenMapWbXtal`、`edenMapWbXtalCfg` | 0 | — |
| AI 参谋（C9） | `edenMapNav`、`edenMapNavCfg`、`edenMapNavConsent` | 0 | —（节奏用 `edenMapNav` 现有的毫秒写法） |
| 地图动作入聊天（C10） | `edenMapInject`、`edenMapActionTpl`、`edenMapCompose` | off | — |

不需要界面的宿主键：`edenMapSanitize`、`edenMapSanitizeTags`（预设文本净化，开）、更新 / 开场 / 提示的记账键、
`edenMapLine*`、`edenMapFabPos`。它们在 `storage.mjs` 里登记，不需要设置行。

## 4. AI 功能卡

### 4.1 卡片结构

每张卡自上而下都是同样五部分；收起时只显示 1–2 部分和健康圆点。

1. **标题行**：名称（§4.2 表，卡 C1–C10）+ 一句用途；右侧总开关（44 px 触控区）；开关左边一个健康圆点（绿 = 正常，琥珀 =
   开着但没生效，灰 = 关）。标题行是 `<details>` 的 summary；里面的开关不触发展开。
2. **子选项**（开着时才显示）：见各卡。数字输入框写明单位与上下限。
3. **它现在在做什么**：这个功能发给模型（或即将发）的原文，只读等宽块（只用 `textContent`，最多 600 字，超出加「…」），后面
   跟 `≈ <n> token`（内核估算 `interaction-modes.mjs tokens()`）；写入类功能显示最近一次写入（「开 3 条、关 1 条 · 第 128 楼」）。
   什么都没发时：一行原因。
4. **健康**：一行——`正常 · 上次生效：第 <F> 楼` / `未生效：<原因>` / `已关闭`。原因是 §4.5 的代码，措辞固定。不弹阻塞窗口，
   不写「去后台设置 X」（简报第 6 条）：原因可以说缺了什么，不命令用户。
5. **了解更多**（收起的 `<details>`）：适合哪些卡、怎样影响回复、绝不会做什么、成本。

卡的顺序按对对话的影响排：常开的摘要在前，然后注入类、写入类、花钱的 AI 参谋，最后是聊天输入助手。没嵌在酒馆里时整页换成
一行（`单独打开地图时没有聊天：AI 联动只在酒馆里工作`）。

### 4.2 十张卡

| id | 卡 | 一句用途 | 子选项 | 它现在在做什么 | 健康：何时算生效 | 了解更多（摘要） |
|---|---|---|---|---|---|---|
| C1 | 事态摘要 | 每次回复都带一段附近事态、人物、自定义名称、随身物品与检定结果的摘要 | 背包行（`edenMapInvInj`，已有，开） | 最近一次 `eden-map-events` 原文（事态摘要 + 人物摘要 + 自定义摘要 + 物品摘要 + 槽位行 + 失败报告 + 待结算行，宿主 `eden-map.js` L509）与 token 估算 | 上一楼注入成功且文本非空 | 地图和模型联动的核心；常开（没有总开关，U-06）；适合所有卡；每次回复约 100–300 token |
| C2 | 状态行 | 每次回复前注入一行地点、在场、时间、行程 | 字段：地点 / 在场 / 时间 / 行程（各一个开关，存为省略列表 `edenMapStateOmit`）；深度（0–20，从末尾数的楼层）；上限（40–400 token） | `injectPreview().text`（宿主 `modes-flow.mjs` L32–35）或 `当前不注入：<原因>` | `stateInject` 上一楼写入了非空的一行 | 适合提示词里没写地点的卡；卡的提示词里已有的字段自动跳过；超上限先砍行程、再砍在场 |
| C3 | 宏 | 给卡和预设作者用的 `{{eden_here}}`、`{{eden_route}}`、`{{eden_fly …}}` | — | `{{eden_here}}` 与 `{{eden_route}}` 当前展开的内容 | 宿主有 `registerMacroLike` 且宏已注册 | 给想把地图事实写进自己提示词的作者；没有提示词引用就什么都不做 |
| C4 | 检定掷骰 | 搜刮、潜行真的掷骰；失手真的失败并出报告 | — | 最近一条失败报告（`check-failure-report.mjs render`）或 `还没有检定` | 开着且本聊天至少掷过一次（显示最近楼层） | 适合有探索和风险的卡；失败作为事实告诉模型，剧情跟着走 |
| C5 | 结算记录 | 把日程里的人物位置、聊天里的事件记进地图自己的聊天变量，只补空缺 | — | 上一轮写入的行（「2 人、1 件事 · 第 130 楼」） | 上一楼的结算轮写入了，或确认没有缺项 | 从不写卡的变量；卡自己的变量很稀时有用 |
| C6 | 空间坐标契约 | 用 ≤ 120 token 的 JSON 写当前地点、出口和附近地标，代替方位散文 | 上限（60–240）；深度（0–20） | `spatialNow`（宿主 `modes-flow.mjs` L59–71） | 当前地点能落到某张地图上且契约已注入 | 帮模型保持方位一致；每次回复约 120 token |
| C7 | 世界书 JIT | 附加世界书只启用你所在地点（及邻近）的条目，离开就停用 | — | 最近一次激活集（「启用 4 · 停用 2 · 第 128 楼」） | 附加书已安装并绑定，上一轮计划了变化或确认无需变化 | 大世界省上下文；只动我们附加书里的条目（`extra.eden_id`） |
| C8 | 事实结晶 | 回复里的事实标签（`⌖事实`，包可定义）变成附加书的关键词条目 | 清空已写记录（保留墓碑） | 已写事实数、最新一条名称、上限 40（最近使用） | 附加书存在且至少见过一个事实标签；否则原因 `no-tags` | 适合长篇；你在书里删掉的事实不会再回来 |
| C9 | AI 参谋 | 在后台用你自己的 API 端点给出地图上的线索、标注、事态与路线建议 | 端点（服务商、接口地址、模型、密钥；§4.3）；节奏（2 / 5 / 10 分钟）；测试连接 | 上次运行时间、保留 / 丢弃的操作数、建议原文；下次运行时间 | 已同意、配置有效、上次请求 HTTP 2xx | 花你自己的额度（地图关着时每个节奏周期一次短请求）；从不写进聊天；建议只在本次会话（§4.4） |
| C10 | 地图动作入聊天 | 卡片按钮把一句话放进聊天输入框（或作为系统提示） | 模式 关 / 填输入框 / 系统指令（`edenMapInject`）；句子模板「去这里」「追问这件事」（`#cmpBox` 的内容搬到这里） | 用示例名字填好的模板 | 模式不是关，且上次使用时找到了输入框 | 填输入框只填不发；系统指令走 `/sys` |

附加世界书的安装 / 同步（`#thWb`）留在「数据与映射」，因为它是数据安装、不是行为；卡 C7、C8 在缺书时显示
`未生效：附加世界书未安装`，带一个按钮打开那一栏（`setPage('data')` + `scrollIntoView`，和现在自检的 `#scWbGo` 一样）。

### 4.3 AI 参谋：端点表单与测试连接

- 用行内表单取代 `window.prompt`（`tavernhelper-settings.mjs` L93–96）：服务商 `<select>` 取自 `llm-gateway.mjs PROVIDERS`
  （显示名走 i18n，id 不变），接口地址（`type=url`，按服务商预填），模型（文本，预填），密钥（`type=password`、
  `autocomplete=off`，从不回传：宿主只回 `navCfg: { provider, base, model, hasKey }`）。保存仍发现在的 `prefs.navCfg` JSON
  字符串，宿主那边（`host-tavernhelper.mjs` L177）不变。
- **测试连接**：新的宿主操作 `eden-map:th` `op: 'nav-test'`。宿主用保存的配置发一次请求（`llm-gateway buildRequest`，消息
  `[{ role: 'user', content: 'ping' }]`，`maxTokens: 8`，15 秒超时），在 `eden-map:th-state` 里回
  `result.navTest = { ok, status, ms, error }`（error 是 `llm-gateway redact` 处理过的；绝不含密钥）。按钮写明会花一点额度。
  这是查看器唯一能触发的请求。
- **同意放进卡里**（N7）：`edenMapNavConsent !== '1'` 时开关换成一块同意说明：现在 `window.confirm` 的内容改成中性措辞
  （`AI 参谋会按你的设置在后台调用你自己的 API（<服务商>）给出地图建议；请求只发往你填的端点，会消耗你的额度。`）和一个按钮
  `同意并开启`，它发 `prefs: { navConsent: true, nav: true }`。宿主去掉 `window.confirm`（`llm-flow.mjs` L34–38）：没同意就
  静默跳过这一轮，健康报 `no-consent`。撤回：卡的「了解更多」里有一个小链接 `撤回同意`，发 `navConsent: false, nav: false`。

### 4.4 AI 参谋：建议路线

AI 参谋可以建议一条路线。规格是 `docs/ui-refactor.md` 附录 S7-1 T6 里的操作 `OP_ROUTE`；摘要：`OP_ROUTE { to, from?, why? }`——
即 S8-4 路由器 `routeOp` 的行形状（`docs/transit-schema.md` §3.5）：`to`、`from` 1–40 字（不写 `from` = 当前地点），`why`
≤ 60 字；每次回复最多一条。宿主把它交给 `routeOp`；S8-4b 在本次会话里保留建议（≤ 3 条，20 楼衰减），经 `eden-map:ops.routes`
送达，并在它的 `route-plan` 图层里画成虚线，带「采用这条路线」卡（K-R113）。没有交通网时什么都不画，`why` 并进 AI 参谋提示
（U-12）。从不写到任何地方。

### 4.5 健康检查

一个宿主纯模块从宿主已有的事实算出每张卡的健康（不额外调 API）：
`{ id, on, state: 'working' | 'idle' | 'not-effective' | 'off', reason?, floor?, text?, tokens?, stats? }`。原因：

| 代码 | 措辞 | 适用 |
|---|---|---|
| `off` | 已关闭 | 全部 |
| `no-host-api` | 这个酒馆助手版本没有所需接口（<名称>） | 注入、宏、JIT、结晶 |
| `skipped` | 卡的提示词里已有这些字段，本轮跳过 | 状态行 |
| `empty` | 还没有可注入的状态 | 状态行、摘要、空间契约 |
| `no-place` | 当前地点不在任何地图上 | 空间契约、JIT |
| `no-book` | 附加世界书未安装或未绑定 | JIT、结晶 |
| `no-tags` | 最近的回复里没有事实标签 | 结晶 |
| `no-checks` | 还没有发生检定 | 掷骰 |
| `no-config` | 端点配置不完整 | AI 参谋 |
| `no-consent` | 还没有同意 | AI 参谋 |
| `endpoint` | 上次请求失败（HTTP <状态码>） | AI 参谋 |
| `waiting` | 地图开着或正在生成时不运行 | AI 参谋 |

「上次生效楼层」= 这个功能最后一次产生效果（有文本的注入、一次写入、一次成功运行）的那一轮的楼层号。会话里存在内存，能从聊天
重算的（摘要、状态行、空间契约）重载后下一轮就会有；从不落存储。

## 5. 消息字段

### 5.1 宿主 → 查看器

`eden-map:th-state`（协议 `SCHEMA`，`map/core/protocol.mjs` L80）新增可缺字段 `health: 'object?'` =
`{ <卡 id>: <健康行> }`，卡 id 为 `digest, state, macros, dice, ledger, spatial, wbJit, wbXtal, nav, inject`。每段文本最多 600
字，整条消息不超过 8 KB。`prefs` 新增 `stateOmit`、`spatialDepth`、`spatialBudget`、`navConsent`、`navCadence`；`navCfg` 改成
`{ provider, base, model, hasKey }`（旧的布尔值含义就是 `hasKey`；查看器两种都认）。

### 5.2 查看器 → 宿主

`eden-map:th` 仍是 `{ op, prefs? }`；新操作 `nav-test`；新的 prefs 键 `stateOmit`（`here | present | time | trips` 的数组）、
`spatialDepth`、`spatialBudget`、`navConsent`、`navCadence`（`120000 | 300000 | 600000`）。

## 6. 自相矛盾与放错地方的说明（S7-1 修）

规则：标签只说是什么；状态由开关表达；说明可以讲开和关分别做什么，不讲默认是什么。默认值写在「了解更多」里。

| 键 | 现在 | 问题 | 新文字（中 / 英） |
|---|---|---|---|
| `th.dice` | 检定真掷骰：…（默认关 = 只提示不判定） | 开关可能开着，旁边却写「默认关」 | 标签 `检定掷骰` / `Dice checks`；用途行 `搜刮 / 潜行会真的掷骰，失手会真的失败并出失败报告；关着时只提示不判定` |
| `th.ledger_write` | 结算记录：…；默认关） | 同上 | 标签 `结算记录`；用途行去掉「默认关」 |
| `th.nav` | 地图领航员（…，默认关） | 同上 + N7 改名 | 标签 `AI 参谋` / `AI advisor`；用途行见 C9 |
| `s.keys` | 单字母快捷键（…，默认关） | 同上 | `单字母快捷键（L、M、/、? 与事态操作字母角标）` |
| `s.minimap_hint` | …（默认关） | 同上 | 去掉括号 |
| `s.inject_hint` | …；默认关。… | 同上 | 去掉 `默认关。` |
| `cu.sync_hint2` | 默认开：有了第一项自定义才建… | 同上 | `有了第一项自定义才建…`（其余不变） |
| `th.inj_note` | 约 150 token；…深度和上限在「高级」 | 上限可调却写死数字；指向一个已不再放它们的页 | 删除：卡里显示实时估算，并且自带深度和上限 |
| `th.inj_on` | 每次生成前注入一行当前状态（地点、在场、时间、行程） | 四个字段可能被省略或跳过，标签却全列 | 用途行 `每次生成前注入一行当前状态`；字段变成子选项 |
| `cu.night` | 按时段给上层、中层加色调与昼夜底图（清晨 / 傍晚 / 夜间） | 内核字符串里点了某个包的层名；孤零零放在「数据与映射」（N10 第 11 条） | `按时段给地图加色调与昼夜底图（清晨 / 傍晚 / 夜间）` / `Tint the map and switch day / night base maps by time (dawn / dusk / night)`，在「地图与图层」单独一行 |
| `s.kbd_group` + `s.kbd` | 快捷键（小标题）与 快捷键 › 查看（行） | 「高级」里「快捷键」出现两次（N10 第 11 条） | 合成一行：`单字母快捷键` 开关加 `查看` 按钮 |
| `s.tick_hint` | 面板关着时每 60 秒把新楼层只读扫一遍，缓存补齐… | 内部术语（N10 第 12 条） | `地图关着时也悄悄读一遍新消息，下次打开更快；只读，不改聊天，不发给模型` |
| 上手提示（`notice-layer.mjs firstRunHint`） | 「三步上手」却有四条 | 数目不对、有行话（N10 第 12 条） | 三步大白话：`点地点看详情` · `下方抽屉看事态和人物` · `右上角设置里调整` |
| `#build` 版本编码 | 在「更新与版本」 | 内部编码给所有人看（N10 第 11 条） | 移到 高级 › 开发者；「更新与版本」显示 `构建 head #N · <日期>` |
| `ch.from_card` | 名字后的 `· 设定` | 来源式后缀（N10 第 15 条） | 从界面去掉 |
| `th.nav_cfg` | 配置端点（JSON：provider / key / base / model） | 用阻塞弹窗要原始 JSON | 表单标签 `服务商`、`接口地址`、`模型`、`密钥`，按钮 `保存`、`测试连接` |
| `ch.port_hint` | …（作者 Yehehua，…） | 内核词典里出现卡名（简报第 1 条） | 内核文字中性 `人物没有自己设的头像时，用卡里自带的立绘…`；第一个包原来那句话搬进它清单的 `strings`（对 eden 一字不变） |
| 首页作者一行 | `viewer.html` L654 | 引擎文件里的卡名 | 按 `credits` 在「版权申明」渲染 |

## 7. 文字一致性（第一个包）

S7-1 不改注入与发给模型的文字，唯一例外是 AI 参谋的系统提示词：新增一行说明 `OP_ROUTE`（它只发到用户自己的端点）。同一个
聊天里、不用新选项时（`stateOmit` 为空、`spatialDepth` 为 2），状态行、空间契约和摘要逐字节不变。第一个包的界面文字改动
只有：§2 的分组标题与摘要、§3 搬家的行（字不变）、§6 的条目、§8 的改名，以及新卡片的文字（§4）。每个改动的键都列在 S7-1 的
RESULT 里。

## 8. 改名 「地图领航员」 → 「AI 参谋」（N7）

只改用户看得到的：`th.nav`、`nav.layer`（`领航员标注` → `AI 参谋标注`；英文 `Navigator marks` → `AI advisor marks`）、
`nav.hint`（`领航员建议` → `AI 参谋建议`；英文 `AI advisor suggestion`）、宿主提示的标题（`llm-flow.mjs` L57，`地图领航员` /
`Navigator` → `AI 参谋` / `AI advisor`）、`core/layer-defaults.mjs` L24 菜单兜底文字。内部 id 不变：`nav-ops`、
`edenMapNav*`、`planner-gateway.mjs`、`NavOpsApi`、操作名、词汇表里的 "planner (navigator)"。给模型看的系统提示词保留原措辞
（U-10）。由 S7-1 记进 `docs/naming.md` 的决定一节。

## 9. 不在范围内

设置面板的视觉（玻璃、间距、字号）在 `docs/ui-refactor.md` §3.6。新的 AI 功能、新的注入通道，以及摘要或状态行内容的任何
改动都不在 S7。
