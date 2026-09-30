# 架构 — 引擎、设定包与数据流

> 本文件是 `docs/ARCHITECTURE.md` 的中文版，英文版为准（标题结构一致，由 `tools/check_zh_mirror.py` 把关）。规则在 `docs/agent-brief.md`；依据是 `docs/plans/spatial-os.md`。本文写**现在已有**的东西，尚未做的一律标明「计划」和步骤编号（S1、S6……）。这里的内容不超出计划本身。

## 1. 目的与术语

这个仓库提供给 SillyTavern / TavernHelper 聊天用的地图层。它正在从单卡工具重构为与卡无关的**引擎**加数据**包**。

- **引擎**：对任何卡一无所知的代码——`map/core`、`map/app`、`map/tavern`、`map/ui`、`map/three`、`map/*.mjs`、`map/viewer.html`、`map/props/viewer3d.html` 以及核心 i18n 词典。里面不许出现卡专有的名字、地点、状态或等级（铁律 §2.1；机检见 §9）。
- **包**：描述一张卡的世界的数据——清单加它指向的文件（`map/packs/<id>/`，第一个包还有 `map/data/`）。引擎读包，从不执行包。目前的包：`eden`（第一个包，卡的原名原样）和 `town`（虚构的示例包）。
- **宿主**：跑在酒馆页面里的 TavernHelper 脚本 `map/tavern/eden-map.js`。
- **查看器**：`map/viewer.html`，跑在宿主里的 iframe 中，也可以单独打开。

下面四个术语是计划要建成的实体模型（计划 §2 和 S6）。每一个都标明了现在做到哪一步。

| 术语 | 含义 | 现状 |
|---|---|---|
| **SpatialNode** | 节点树里的一个地点：`{ id, name, alias[], hints[], parent, type, at?, view?, canon }`。这棵树是唯一的地理；匹配取最长别名、优先更深的节点。 | **计划（S1 定契约，S2–S3 迁移）。** 现在的地理散在 `map/here.mjs`（固定六级）、各图数据文件里的标记表、`map/events.mjs` 的事态落点表里。 |
| **PresentEntities** | 站在当前节点上的实体（先是人物，之后是任意实体类型），微观层级的人物页用它。 | **部分有。** `map/chars.mjs` 与 `tavern/characters.mjs` 从聊天标签和 MVU 变量算出「在场」人物；基于节点的版本**计划在 S6**。 |
| **WorldRoster** | 所有来源里已知的全部实体，合并成一张标准行列表。 | **已有。** `core/roster.mjs`（`RosterRow`、五个来源、优先级仲裁）。属性字段仍是固定槽位；作者自定义的 `entities` 字段表**计划在 S4**。 |
| **Stash** | 有真实空间归属（哪张图、哪个标记、哪个暗格）的物品，并与玩家已携带的对账。 | **现在有两个存储：** `core/stash.mjs`（包数据里的世界藏物）和聊天变量里的背包（`tavern/inventory.mjs`）。统一的 `eden_map.stash` **计划在 S6（决定 D4）**。 |

## 2. 目录分层与依赖方向

```
map/core      leaf layer: pure logic, imports nothing outside map/core
map/three     three.js helpers          → core (THREE is passed in by the caller, never imported)
map/ui        shared widgets            → core; the two gallery panels import the optional tavern/baibai.mjs bridge
map/app       viewer modules            → core, ui; app/pack.mjs loads tavern/events.mjs on demand
map/*.mjs     viewer plugins (root)     → app, core, ui; load the shared pure tavern modules on demand
map/tavern    host + pure pipelines     → core (spatial.mjs also reuses map/here.mjs)
map/packs, map/data    data only        (JSON; no code)
map/estate, map/props  3D pages + assets → core, three, ui
tools, tests, blender  builders, checks, tests (never shipped to the viewer)
```

由此得出的规则：

- **`map/core` 不指向任何别处。** 不许有离开 `map/core/` 的相对 import（看门狗检查 2），除登记的单一属主（`storage.mjs`、`logbuf.mjs`、`room-gallery-db.mjs`）外不许碰宿主全局。
- **`map/tavern` 是宿主侧。** 只有 `mvu-bridge.mjs` 可以碰 `Mvu` / `SillyTavern` 全局；纯流水线（`context`、`msgtext`、`sanitize`、`preset`）完全不碰宿主全局。
- **查看器外挂之间只经 `P` 互相找到。** app 模块显式 import `app/state.mjs` 与 `app/util.mjs` 里的共享状态；根目录外挂 import 同一份核心状态，彼此（以及不保证已加载的 app 模块）经 `app/plugins.mjs` 的 `P` 注册表相见；没加载的外挂是 `undefined`，调用方自己带守卫。查看器要用的纯 `tavern/` 模块（`events`、`characters`、`mvu`、`picker`、`compose`）和宿主用的是同一批文件，用按 `document.baseURI` 解析的动态 `import()` 加载，所以在 `srcdoc` 里也能用。
- **包只是数据。** 卡的原名只原样出现在 `map/packs/**`、`map/data/**` 和 `tools/**` 下的构建工具里。
- **`map/estate/**`、`map/props/*/**`、`map/vendor/**`、`map/packs/**`、`map/data/**` 不算引擎源码**，只减不增账本（§9）从不扫描它们；`map/estate/` 是第一个包的三维页。

## 3. 模块地图

每个引擎文件（看门狗的 `ENGINE_GLOBS`）在下面恰好出现一次。共 146 个：`map/core` 29、`map/app` 42、`map/tavern` 43、`map/ui` 9、`map/three` 9、`map/*.mjs` 12，另加 `map/viewer.html` 与 `map/props/viewer3d.html`。各行职责取自文件头注释与代码。

### 3.1 map/core

纯叶子模块。不碰 DOM、不碰全局（三个登记属主除外）、不 import `core` 之外的东西。

| 模块 | 职责 |
|---|---|
| `budget.mjs` | 图形内存预算策略：按设备档位定字节预算，并判断上报的用量算不算吃紧。 |
| `clock.mjs` | 零 Token 的确定性世界时钟：世界时间由推进的轮数算出，不靠模型也不读系统时间。 |
| `depth.mjs` | 纵深系统数学（`blender/depth.py` 的 JS 孪生，对拍 golden 文件）：由海拔得纵深、通道插值、某海拔之上的云。 |
| `estate3d.mjs` | Estate3D 清单契约：校验并解析庄园页与道具页的模型地址、数据路径与档位兜底。 |
| `haze.mjs` | 空气透视滤镜：把当前纵深平面的霾浓度换成一条滤镜链。 |
| `layers.mjs` | LayerRegistry 核心：10 个视口槽位、图层注册与排序、可见性、滤镜链、`describe()` 摘要。 |
| `ledger.mjs` | 四域结算账本：按域（资产、NPC、事件、纵深）校验原子指令，未验证的一概丢弃。 |
| `listeners.mjs` | ListenerBus：全局监听器的唯一登记处，按键幂等，提供 `offAll()` 与 `describe()`。 |
| `lod.mjs` | 图形 LOD 策略：一个模型该处在哪一档、滞回、哪些异步加载仍然有效。 |
| `logbuf.mjs` | 反馈报告用的控制台环形缓冲，按会话分开；模块首次求值时自装钩子。 |
| `pack.mjs` | 设定包接口：清单校验与解析、包 id、存储前缀与聊天变量键的推导、注册表改基址。 |
| `pickup.mjs` | 客观拾取探测：正文里写明的物理获取动作变成一条单项账目事实。 |
| `project.mjs` | 斜视投影（`blender/project.py` 的 JS 孪生，对拍 golden 文件）：世界点到画幅坐标、标签规则、锚点。 |
| `protocol.mjs` | 消息协议：所有宿主 / 查看器 / 子页消息的 `SCHEMA`、信封、`check` / `accept`、`createBus`。 |
| `quests.mjs` | 动态线索节点：把事态按地点聚合、按楼层差衰减，得到确定性的「哪里在出事」节点。 |
| `render-gate.mjs` | RenderGate：页面隐藏或视口不可见时，暂停按需渲染循环。 |
| `rng.mjs` | 确定性伪随机（mulberry32），粒子、车流、线索节点共用。 |
| `room-gallery-db.mjs` | 房间图集图片的 IndexedDB 薄封装（只在浏览器里跑）。 |
| `room-gallery-logic.mjs` | 图集纯逻辑：缩放尺寸、配额检查、导出包结构。 |
| `roster.mjs` | CharacterRosterSystem：五源名册合并成标准 `RosterRow`，含优先级仲裁、别名互认、立绘挂载。 |
| `routine.mjs` | 宿主与查看器共用的 NPC 日程表数学（宿主侧 `tavern/routine.mjs` 原样转发到这里）。 |
| `scrapbook.mjs` | 钉在地标上的图与手记的索引逻辑（图的字节在图集数据库里）。 |
| `stash.mjs` | 世界藏物表：包定义的物品藏在哪（图、标记、暗格），以及与已携带物品的对账。 |
| `stash3d.mjs` | 藏物条目到三维场景坐标的纯映射，落点表由调用方喂入。 |
| `storage.mjs` | 本机存储服务：`KEYS` 登记表、带包命名空间且从不抛错的 get / set / json / remove。 |
| `traffic.mjs` | 车流 / 流光数学：归一化路线点变成一帧的光点位置，确定性。 |
| `vision.mjs` | 视线锥几何：守卫视野被墙段截断、巡逻环、点是否被看见的判定。 |
| `walk.mjs` | 确定性时钟 tick 与任意维插值行走器（禁止瞬移，减少动态效果时一步到位）。 |
| `weather.mjs` | 天气核心：预设表、由剧情与时钟推天气、粒子场与闪电时序。 |

### 3.2 map/app

查看器模块，从 `viewer.html` 原来的内联脚本里拆出。状态用活绑定从 `state.mjs` 取；可变状态只由声明它的模块经 `set*()` 写。

| 模块 | 职责 |
|---|---|
| `boot.mjs` | 启动：并行取注册表、标记、派生数据、字典与设定包，建 OpenSeadragon，发 `ready`，处理启动失败。 |
| `bridge.mjs` | 兼容面：给浏览器探针用的旧全局名，挂在 `window` 上的只读 getter。 |
| `bus.mjs` | 查看器侧监听器总线：所有 `window` / `document` 监听都登记在这，卸载时摘干净。 |
| `cardlinks.mjs` | 地点卡底部的链接（跨层通道、三维链接、图集入口）。 |
| `clouds.mjs` | 漂移云与切层转场盖布。 |
| `cvd.mjs` | 色觉模式：安全色板、类 / 属性开关、广播给子页。 |
| `depthhaze.mjs` | 为当前纵深平面闭合「纵深 → 霾 → `depth-haze` 槽位 / 迷雾画布」这一环。 |
| `dzi-worker-src.mjs` | 瓦片解码线程的源码串（以文本导出，这样 `srcdoc` 里也能起 blob worker）。 |
| `dzi-worker.mjs` | 瓦片解码线程的查看器侧客户端，失败时退回原生图片路径。 |
| `estate.mjs` | 庄园 / 三维子页宿主：带 `<base>` 的 blob iframe、失败钩子、子页消息、通用三维查看器入口。 |
| `extapi.mjs` | 本机扩展接口 `window.EdenMap` 与聊天 id。 |
| `feedback-report.mjs` | 反馈报告文本的纯函数组装，字段白名单。 |
| `feedback.mjs` | 反馈按钮：装日志环形缓冲、预览并复制 / 下载报告。 |
| `fog.mjs` | 迷雾探索叠加层：没到过的地点变暗，到访按聊天记录。 |
| `fps.mjs` | 调试用帧率读数与子页开关。 |
| `host.mjs` | 宿主消息接口：来源 / 令牌检查、协议校验、按类型分派。 |
| `i18n.mjs` | 语言与主题：词典、`t` / `tr` / `nm`、`setLang`、`setTheme`。 |
| `insets.mjs` | 放大到插图覆盖范围时叠加的高分辨率插图瓦片。 |
| `layerhost.mjs` | 查看器侧的 LayerRegistry 装配：注册表单例、`.vpslot` 槽位容器、`window.TCLayers` 摘要。 |
| `layers.mjs` | 层导航：层切换条、上一级、Esc 处理、单字符快捷键。 |
| `loadprog.mjs` | 整屏加载层的进度，共用 `ui/progress.mjs`。 |
| `locate.mjs` | 初始视角与当前地点：`focusStart`、`markHere`、`here.mjs` 解析、`jumpHere`。 |
| `loot.mjs` | 地图上由世界藏物表画出的发光拾取物；点击把拾取意图发给宿主。 |
| `markers.mjs` | 标记与地点卡：落点、跟踪、打开 / 关闭卡片、世界图与点位图叠加。 |
| `nav.mjs` | 地图切换：可注册包装的 `go`、快照、地图外壳、另一版底图。 |
| `nodes-runtime.mjs` | 查看器的节点树：已加载的注册表经 `core/compat-v1.mjs` 转一次；面包屑、上一级、预热邻居、庄园替身和三维页判断都从它读（不再走 `parent`）。 |
| `pack.mjs` | 当前设定包，启动时解析一次（活绑定 `PACK`、`packData(键)`）。 |
| `plugins.mjs` | 外挂注册表 `P`：app 模块与根目录外挂之间唯一的通道。 |
| `quests.mjs` | 动态线索节点在查看器里的渲染：会呼吸的圈。 |
| `scale.mjs` | 世界图与城市层之间的尺度交接，以及周边过渡环。 |
| `settings.mjs` | 设置弹层：分页、分区注册、搜索、关于 / 检查更新、自检。 |
| `shell.mjs` | 外壳：控制列、唯一抽屉 / 右栏胶水、通知层、状态点、单手模式、双击缩放。 |
| `state.mjs` | 查看器核心状态：当前地图、注册表、OSD 实例、焦点请求。 |
| `storage-ui.mjs` | 设置「数据与映射」页：本机存储占用与当前数据来源（只读）。 |
| `th-ui.mjs` | 设置里的酒馆助手功能：世界书附加条目同步、状态注入、类宏、注入深度。 |
| `tiers.mjs` | 清晰度档位、省流判断、加载进度、叠加层与标注避让。 |
| `topbar.mjs` | 顶栏布局、后台预热、版本编码。 |
| `traffic.mjs` | 流光在 `fx` 槽位画布上的查看器渲染。 |
| `util.mjs` | 常量与工具：坐标换算、`$`、`esc`、`ico`、`post`（协议版本戳）、`getJSON`。 |
| `visibility.mjs` | 视口可见性渲染节流：按原因引用计数的暂停开关。 |
| `vision.mjs` | 视野锥与潜行的查看器侧：画视野，移动时报告最难的一次被目击。 |
| `wander.mjs` | 由确定性时钟与日程表驱动的 NPC 漫游；走动的人禁止瞬移。 |
| `weather.mjs` | 天气粒子、色调与闪电在 `fx` 槽位的查看器渲染。 |

### 3.3 map/tavern

宿主侧：入口脚本、宿主胶水，以及宿主与 node 测试共用的纯流水线。

| 模块 | 职责 |
|---|---|
| `action.mjs` | 地图驱动的动作：点一个兴趣点变成一句话（关 / 填输入框 / 静默系统注入）。 |
| `adapter.mjs` | 变量映射：地点、时间、日期、在场各在 `stat_data` 的哪条路径；按字段名自动发现。 |
| `baibai.mjs` | 到可选外部生图扩展的桥；扩展不在时每个函数都安静降级。 |
| `budget.mjs` | 本机存储预算：按聊天 LRU、头像上限、撞额度后的恢复；只碰地图自己的键。 |
| `characters.mjs` | 人物栏：从聊天标签和 MVU 变量找出人物及其最新位置。 |
| `compose.mjs` | 聊天输入模板（「去这里」「追问这件事」）：填进输入框，从不发送。 |
| `context.mjs` | ContextPipeline：消息窗口规范化、轮次计算、自定义标签重放、行程；纯数据进出。 |
| `eden-map.js` | 宿主入口：悬浮按钮与面板、查看器状态机、消息分派、重算调度、清理组装。 |
| `edenapi.mjs` | 暴露给宿主页的公共 `EdenMap` API 的机读契约。 |
| `events.mjs` | 事态解析：从聊天正文读事件标签、合并并老化（纯函数）。 |
| `failrep.mjs` | 检定失败报告环：结构化报告在下一轮注入，让剧情顺着客观事实走。 |
| `follow.mjs` | 跟随分支解析：跨 CDN 镜像从 `head.json` 取分支的最新构建。 |
| `host-about.mjs` | 版本信息与检查更新的编排，所有副作用由外部注入。 |
| `host-lifecycle.mjs` | 宿主实例生命周期：接管旧实例、挂面板 DOM、登记监听器、清理钩子。 |
| `host-routes.mjs` | CDN 线路表、版本推断与测速 race；纯计算。 |
| `host-th.mjs` | 酒馆助手适配层：请求包装、接口探测、包命名空间、脚本变量偏好、世界书全自动。 |
| `inventory.mjs` | 聊天变量里的空间化背包，压成一行注入（纯函数）。 |
| `keyframes.mjs` | 长程关键帧压缩：逐楼状态压成变更点关键帧，是可丢弃的缓存。 |
| `llm.mjs` | 私有 API Key 网关：只算「该怎么发」，自己不碰网络也不碰存储。 |
| `modes.mjs` | 脚本 ↔ 卡的交互方式：紧凑状态注入、标签对账、最小检查点。 |
| `msgtext.mjs` | 消息正文解析预处理：解析前剥掉思考块与变量更新块。 |
| `mvu-bridge.mjs` | MVUBridge：唯一允许碰 `Mvu` / `SillyTavern` 的模块；快照、`getHere` 回退、聊天变量、名册读取。 |
| `mvu.mjs` | MVU 数据与地图自有自定义数据的纯读取器（名称、着装、名册、立绘、时间）。 |
| `navigator.mjs` | 后台领航员网关：调度、输入装配、响应门控（私有 key 驱动）。 |
| `ops.mjs` | 受限操作 DSL 沙盒：提取、校验并规范化原子操作块。 |
| `picker.mjs` | 自定义面板的纯函数：可定制对象的分组清单、搜索、飞行目标。 |
| `preset.mjs` | 把社区预设写的半结构化状态字段读成地点 / 时间 / 在场的兜底。 |
| `routine.mjs` | 宿主侧入口，原样转发到 `core/routine.mjs`。 |
| `sanitize.mjs` | 社区预设文本净化：按标签表剥思考块 / 状态块（纯函数）。 |
| `selfcheck.mjs` | 由宿主收集的事实得出启动自检结论（纯函数）。 |
| `shujuku.mjs` | 与可选的表格数据库扩展的只读兼容。 |
| `snapshot.mjs` | MVU 快照选取与生成状态规则。 |
| `sources.mjs` | 数据来源注册表：宿主从哪些地方读聊天状态，供设置与 `EdenMap.sources()` 枚举。 |
| `spatial.mjs` | 空间坐标契约编译器：当前地点加周边几何，编成有 token 预算的 JSON。 |
| `splash.mjs` | 首次运行的自检卡，进度条缓慢前进并绑定真实预加载。 |
| `th.mjs` | 酒馆助手的薄封装：功能探测、统一外部请求、只删显示的泄露清理。 |
| `tick.mjs` | 后台静默推演调度器：只读的增量扫描，面板开着或正在生成时让路。 |
| `timeline.mjs` | 时间轴回放核心：第 N 楼当时地图该显示什么（地点、时间、谁在哪）。 |
| `trips.mjs` | 行程推导：从每楼地点与人物标签得出「A → B」，按交通方式分样式。 |
| `varsync.mjs` | 变量结算时序守卫：账本对账的写入排队到主更新窗口结束之后。 |
| `wb_crystallize.mjs` | 剧情事实结晶：把坐实的事实沉淀成附加书里按关键词触发的条目。 |
| `wb_jit.mjs` | 世界书即时水合：只启用与当前地点相关的条目。 |
| `wbsync.mjs` | 世界书附加条目的写入与自动同步：只动我们自己的书和带我们标记的条目。 |

### 3.4 map/ui

查看器、宿主与三维页共用的部件。多数是挂在 `window` 上的普通脚本。

| 模块 | 职责 |
|---|---|
| `camera-controls.js` | 三维相机共用小件：视角预设、指北针、首次提示卡、空闲计时器。 |
| `chrome3d.js` | 庄园页与道具查看器共用的三维外壳（`window.UI3D`）。 |
| `gallery.js` | 通用房间图集查看器：懒加载、滑动 / 按键切换。 |
| `icons.js` | 唯一的图标集（`window.UIIcon`）：网格、描线与颜色规则。 |
| `illust-panel.js` | 房间配图面板，驱动可选的生图扩展。 |
| `notice.mjs` | 唯一的通知层（P0 阻断、P1 横幅、P2 小提示）。 |
| `progress.mjs` | 统一加载进度组件：确定百分比或已用时间、重试。 |
| `room-gallery-panel.js` | 房间图集界面：自定义名、上传、缩放、排序、导出包。 |
| `sheet.js` | 唯一的底部抽屉 / 桌面右栏（`window.UISheet`）。 |

### 3.5 map/three

三维页的运行时小件。纯叶子：THREE 由调用方传入，所以能在 node 测试里用假 THREE 直接跑。

| 模块 | 职责 |
|---|---|
| `ctx.mjs` | 共享的三维渲染上下文工厂：像素比封顶、上下文丢失与恢复、真正的 dispose。 |
| `culling.mjs` | 静态矩阵与实例化网格的视锥裁剪和包围体。 |
| `daynight.mjs` | 动态昼夜：世界时钟换成四时段光照、雾、自发光参数并平滑过渡。 |
| `instancing.mjs` | 静态网格的 GPU 实例化，带实例到原网格的索引表。 |
| `lod.mjs` | 把 `core/lod.mjs` 的决策接到 three 场景上的动态 LOD 控制器。 |
| `particles.mjs` | `fx` 槽位的粒子渲染器（天气、极光）：一种效果一次 draw call，描述符由调用方注册。 |
| `relief.mjs` | 2.5D 浮雕材质（法线、视差、粗糙度），吃昼夜状态的光。 |
| `shaders.mjs` | 粒子、极光与浮雕法线的 GLSL 片段库。 |
| `texres.mjs` | 贴图资源：压缩贴图能力探测、KTX2 挂载、预算取数。 |

### 3.6 map/*.mjs (root)

查看器外挂，由 `viewer.html` 以独立模块脚本加载，所以某个外挂失败不会挡住查看器。它们 import `app/*` 的核心状态，彼此只经 `app/plugins.mjs` 相见。

| 模块 | 职责 |
|---|---|
| `chars.mjs` | 人物页与地图头像：落点、同处叠组、逐人开关、飞过去。 |
| `compose.mjs` | 地点 / 事件 / 人物卡上把模板句发给宿主输入框的按钮（仅嵌入时）。 |
| `custom.mjs` | MVU 联动的查看器部分：自定义名称与用途、世界时间夜色、着装行、改名提示。 |
| `events.mjs` | 事态层：落点、图标、事态列表、飞过去、屏幕特效、世界图角标。 |
| `here.mjs` | 当前地点解析器（纯函数）：聊天里的地点经固定六级落到地图目标。 |
| `inv.mjs` | 地点卡上的空间化背包（背包的查看器侧）。 |
| `scrapbook.mjs` | 地标见闻录的查看器侧：地点卡上的钉图与手记。 |
| `security.mjs` | 可选的安保叠加层：地点上的盾牌签与卡片里的规则行。 |
| `trips.mjs` | 行程层：按交通方式画最近的行程与途中弧线。 |
| `unmapped.mjs` | 未上图的地点：小选择器，把认不出的地名指派给节点、标记，或忽略。 |
| `varmap.mjs` | 设置「变量映射」页（仅嵌入时）。 |
| `wbpeek.mjs` | 地点卡上的世界书档案胶囊（只读）。 |

### 3.7 Pages

| 文件 | 职责 |
|---|---|
| `map/viewer.html` | 查看器页面：结构、内联令牌与 `--zu-*` / `--zv-*` 阶梯、预加载、启动脚本、外挂脚本标签。 |
| `map/props/viewer3d.html` | 通用三维查看器（`?model=<id>`）：经 `core/estate3d.mjs` 读 `<id>/manifest.json`，烘焙光照，运行时无灯光。 |

## 4. 宿主 → 查看器的数据流

从头到尾单向（铁律 §2.3）：

```
Mvu / SillyTavern globals
        │  (only tavern/mvu-bridge.mjs touches them)
        ▼
MVUBridge ─────────► ContextPipeline (tavern/context.mjs; msgtext / sanitize / preset feed it)
                        │  pure data in / out: message window, round, roster, tags, trips
                        ▼
        ledger (core/ledger.mjs) + varsync (tavern/varsync.mjs)
                        │  settlement checks; writes queued until after the main update window
                        ▼
host recompute (tavern/eden-map.js) ──► protocol SCHEMA (core/protocol.mjs) ──► postMessage
                        ▼
viewer modules (app/*, root plugins) ──► LayerRegistry slots (core/layers.mjs + app/layerhost.mjs)
```

- **宿主读，查看器画。** 变量或楼层变化时 `eden-map.js` 调度一次重算，调用各流水线，用带类型的消息把结果推出去。查看器只向上发意图（拾取、填入、探索、设置），从不写宿主状态。
- **聊天记录是唯一真相**（铁律 §2.4）：每个派生值（事态、人物、行程、关键帧）都能从聊天楼层重算；缓存随时可丢。地图自己的状态存在包的聊天变量里（伊甸是 `eden_map`），绝不写卡的 `stat_data`。
- **协议**（`core/protocol.mjs`）：每条消息是信封 `{ type, v, … }`，由 `check` / `accept` 按 `SCHEMA` 检查。每个条目带方向标签：`H2V` 宿主 → 查看器、`V2H` 查看器 → 宿主、`V2S` 查看器 → 子页（庄园 / 三维）、`S2V` 子页 → 查看器，另有 `both` 给少数中继消息。更新版本协议发来的未知类型静默丢弃；同版本或更旧的未知类型丢弃并告警一次。过滤只查形状，从不看文字内容。
- **传输**：宿主把查看器挂成 `<base>` 指向 CDN 的 `srcdoc` iframe，子页挂成 blob iframe。`createBus` 包装一对一的窗口通道，带来源 / 令牌检查。
- **宿主模块**（`host-routes`、`host-lifecycle`、`host-th`、`host-about`）放着原来在 `eden-map.js` 里的胶水；入口只保留调度、副作用与清理组装。

## 5. 实体协议 — 目标与现状

**现状（已有）。**

- **名册**：`core/roster.mjs` 把五个来源——MVU 变量、聊天标签、表格数据库、保底名册、图像库——合并成标准 `RosterRow`（`name, role, location, status, tags, source, present`），逐字段高优先级来源胜出，别名互认，挂立绘。`describe()` 给探针返回计数。
- **当前地点**：`map/here.mjs` 把聊天里的地点经固定六级（庄园房间、庄园区域、城市地标、层、天城、世界）解析。它是伊甸形状的；通用匹配属于计划。
- **事态 / 人物 / 行程**：由 `tavern/events.mjs`、`characters.mjs`、`trips.mjs` 从聊天标签与 MVU 解析；事态类别仍内置在代码里。
- **物品**：`core/stash.mjs`（包定义的世界藏物）与 `tavern/inventory.mjs`（聊天变量背包），按物品 id 对账；能写什么由账本纪律（`core/ledger.mjs`）管。

**目标（计划，按步骤）。**

- **节点树** `SpatialNode` 作为唯一地理：契约在 **S1**（`core/nodes.mjs`、`core/compat-v1.mjs`、`docs/kernel-schema.md`），使用方在 **S2** 迁移，地点 / 事态 / 人物 / 物品的解析在 **S3** 统一，并带新旧路径对拍测试。
- **作者自定义实体**：**S4** 里 `vars` 与 `entities`（分组加属性字段表）取代固定槽位。
- **实体协议与抽屉**：标签页注册表、按节点判在场、统一的 `eden_map.stash`（旧的 `仓库` / `槽位` 键自动迁移）、物品页、按包扩展的拾取词表——**S6**。

在这些步骤落地之前，代码不许假定节点树存在。

## 6. 包边界

**清单 v1（已冻结，schema `1`）**——`map/packs/<id>/manifest.json`，说明见 `docs/pack-schema-v1.md`，运行时由 `core/pack.mjs validate()` 校验，完整校验在 `tools/check_pack.py`：

- 必填：`id`、`schema`（= 1）、`title`、`data.maps`；
- 可选：`title_en`、`chat.var`、`data.*`（world、derived、rooms、events、worldbook、security、roster、stash、routine——只收相对路径，events 可写 `builtin`）、`preload`、`vars`、`cdn.repo` / `cdn.npm`、`theme.accent`、`features`、`strings`、`worldbook.addon`；
- 以 `_` 开头的键是注释，一概忽略。路径相对清单所在目录（伊甸是唯一例外：相对 `map/`）。不收 `scheme:`、开头的 `/`、`..` 与反斜杠。

**包现在能声明什么**：有哪些数据文件、聊天变量键、CDN 仓库、强调色、功能开关与文案覆盖。其余一切——地理、事态类别、名册字段、图层——仍是代码或固定的数据形状。

**清单 v2（计划，S1）**：`id` / `schema: 2` / `title` 必填；可选 `lang`、`match`；`nodes`、`views`、`vars`、`entities`、`items`、`events`、`layers`、`ui`、`llm` 各段，缺了就自动降级（计划 §2）。`core/compat-v1.mjs` 在内存里把 v1 包转成 v2，所以伊甸与 town 不改文件照跑；一个最小包（`map/packs/minimal/`，5 个节点、无底图）钉死零配置路径。Schema v1 保持冻结。

**信任边界**：清单是纯数据。引擎从不执行包里的脚本，也从不过滤用户聊天。

## 7. 存储与命名空间

- **本机存储**只有一个服务，`core/storage.mjs`。`KEYS` 是全部键的唯一登记处（所有者、作用域、默认值、`prefix` / `perChat` 标记）；仓库里用到却没登记的键会让 `tests/storage.test.mjs` 失败。`get` / `set` / `json` / `remove` 从不抛错（隐私模式、额度满、被禁用）。
- **包命名空间**：登记的键统一写成 `edenMap*`，`core/pack.mjs nsKey` 把它映射到当前包：伊甸保持 `edenMap*`（老用户的键照旧可读），其它包用 `tcp.<id>.*`。
- **每个包一个聊天变量**：地图自己的状态存在一个顶层聊天变量里——伊甸是 `eden_map`，其它包是 `tc_<id>`（或清单的 `chat.var`）。里面放自定义名称、行程、关键帧、背包、探索。卡自己的 `stat_data` 绝不写（它的 schema 会拒绝未知键）；能写的只有我们的附加世界书，以及带 `extra.eden_id` 标记的条目。
- **脚本变量**：`SCRIPT_KEYS` 里列出的用户偏好会镜像进酒馆助手脚本变量 `eden_prefs`，浏览器存储被清空时也不丢。
- **按聊天的数据与预算**：按聊天的键由 `tavern/budget.mjs` 做 LRU 排序与封顶，它只碰以地图前缀开头的键。图片存在 IndexedDB（`core/room-gallery-db.mjs`），绝不进聊天。
- **命名保持到 S10**：`edenMap*` / `eden_map` / `EdenMap` / `window.TC*` 都是外部契约，只在 S10 带迁移并再次确认后才改名（决定 D5、D12）。

## 8. 渲染栈

- **底图**：OpenSeadragon（`map/vendor/openseadragon`）加载 `map/art/` 里的 DZI 瓦片金字塔。瓦片解码可以放进 blob worker（`app/dzi-worker*.mjs`），失败时退回原生路径。
- **LayerRegistry**（`core/layers.mjs`，由 `app/layerhost.mjs` 装配）：十个槽位，由底至顶——`base`、`depth-haze`、`fog`、`routes`、`trips`、`events`、`markers`、`labels`、`fx`、`interaction`。槽位的 z 值是 `(序号 + 1) × 10`。图层注册 `{ id, slot, kind, order, mount, unmount, … }`；滤镜链（`css` / `canvas`）逐层叠加。`window.TCLayers` 暴露标准摘要。
- **`viewer.html` 里的两条 z-index 阶梯**：`--zv-*` 自定义属性镜像槽位值（在 OSD 叠加层叠上下文里，由测试与 `SLOTS` 对拍）；`--zu-*` 是外层固定 UI 阶梯（顶栏、弹层、设置、控制列、庄园 iframe、盖布），永远在槽位之上。令牌之外禁止裸数字 z-index（看门狗检查 3）。
- **`map/three` 运行时**：纯叶子小件（上下文工厂、裁剪、实例化、LOD、昼夜、粒子、浮雕、着色器、贴图资源），THREE 由调用方注入。
- **庄园页**：`map/estate/`（`index.html`、`main.js`）是第一个包的三维页，由 `app/estate.mjs` 加载进 blob iframe。它的模型经 `core/estate3d.mjs` 取自 `map/estate/model/manifest.json`；通用查看器 `map/props/viewer3d.html?model=<id>` 服务每个地标的 `manifest.json`。两者都用烘焙光照和 `map/ui` 里的共享外壳。
- **特效与昼夜**：天气与极光渲染到 `fx` 槽位；世界时钟（`core/clock.mjs`）驱动 `three/daynight.mjs` 与查看器的夜色。没有任何东西读系统时间。

## 9. 守卫

`bash tools/smoke.sh` 是关卡；CI 会和 `node --test tests/*.test.mjs` 一起跑它。谁守什么：

| 守卫 | 守什么 |
|---|---|
| `check_maps.py`、`check_pack.py` | 地图注册表 / 标记 / 瓦片一致性；设定包清单对 schema。 |
| `check_architecture.py` | 下面六道看门狗防线加只减不增账本。 |
| `test_architecture_gate.py` | 证明看门狗咬得住（违规被拦、允许的写法放行、扫描面不为空）。 |
| `check_tree_hygiene.py`、空文件守卫 | 不留大的未跟踪文件，不留 0 字节的已跟踪源文件。 |
| `test_depth.py`、`test_project.py` | 纵深与投影的 Python ↔ golden 对拍（JS 侧在 `node --test`）。 |
| `check_version.py`、`sync_tokens.py --check`、`check_ascii.py` | 版本一致、令牌内联一致、机器标识 ASCII。 |
| `check_doc_language.py`、`check_zh_mirror.py` | 新文档是英文；每份英文文档与它的 `*.zh.md` 标题结构一致。 |
| `check_readme.py`、渲染守卫 lint / 单测 | README 导入链接与路径；渲染脚本正确配置 GPU。 |
| `node --test tests/*.test.mjs` | 单测与契约测试，含源码扫描类测试（`mvu_bridge`、`storage`、`layer_registry`）。 |
| `node --check`、JSON 解析 | 所有发布的脚本与数据 / i18n 文件都能解析。 |

**六道看门狗防线**（`tools/check_architecture.py`）：

1. **行数**——每个引擎文件 ≤ 400 物理行。
2. **分层**——`map/core` 没有指向父目录的 import；core 与纯流水线除登记属主外不碰宿主全局。
3. **z-index**——没有裸数字 z-index，含 `zIndex: <n>` 对象字面量写法。
4. **卡专有名词**——引擎代码与 i18n 词典的值里没有卡专有词（名册人名、地名与设定词、内部标识）。
5. **引用**——`map/**` 与 `tests/**` 源码里没有论文名、期刊、arXiv、DOI。
6. **内联外观样式**——外观不许用 `.style.<属性> =`、`cssText`、`style="…"`；几何属性与 `style.setProperty('--…')` 是许可通道。

**只减不增账本（ratchet）**：检查 1、3、4、6 按文件对 `tools/arch_baseline.json` 计数。现有违规由工具一次性记下，计数只许变小——新增违规或已登记文件变多都会失败。`map/core` 永远不能进账本（硬零）。`--update-baseline` 只下调条目，拒绝抬高任何数字或新增文件；`--init-baseline` 只在文件不存在时能跑。永远不要手改账本。扫描范围是 `ENGINE_GLOBS`；`map/vendor`、`map/estate`、`map/props/*/**`、`map/packs`、`map/data`、原型、`tests` 和 `tools` 从不扫描。

## 10. 改什么去哪儿

- **加一个图层**——在 `map/app/` 下的模块里向注册表登记 `{ id, slot, kind, … }` 描述符（参考 `app/fog.mjs`、`app/weather.mjs`）；只用 `SLOTS` 里的槽位；z 值取 `--zv-*` 令牌，绝不写裸数字；菜单与可见性接线走注册表。声明式的作者自定义图层属于计划（S8）。
- **加一条协议消息**——在 `core/protocol.mjs` 的 `SCHEMA` 里加带方向标签的条目；发送用 `envelope` / `post`，接收走 `accept`；在 `tests/protocol.test.mjs` 加用例；子页要消费它就在 `app/estate.mjs` 和对应页面里处理。
- **加一个存储键**——在 `core/storage.mjs` 的 `KEYS` 里登记（所有者、作用域、默认值）；只经该模块读写；新开关默认关；按聊天的键要带按聊天标记，预算清理才看得见。
- **加一个设置开关**——存储键如上；宿主需要知道就在 `SCHEMA` 加协议字段；界面写在 `app/settings.mjs`（或经 `TCSettings.registerSection` 注册的分区）；中英文案都进 `map/i18n/zh.json` 与 `en.json`，措辞中性。
- **加一个包字段**——v1 已冻结：只许加**可选**字段，在 `docs/pack-schema-v1.md` 记一行、在 `map/data/schema/pack.schema.json` 补定义、在 `tests/pack_schema_v1.test.mjs` 覆盖。任何改变既有字段含义的事都等 schema 2（S1）。
- **加一个查看器模块**——放在 `map/app/` 下的文件（或经 `app/plugins.mjs` 注册的根目录外挂）；状态走 `app/state.mjs`；监听器走总线；保持 ≤ 400 行且不含卡专有词，否则看门狗失败。
- **下调账本**——先修掉违规，跑 `python3 tools/check_architecture.py --update-baseline`，把新账本和修复一起提交。
