# 功能清单（INV-1）

状态：2026-10-02 · 共 78 项 · 在用 60 · 半成品 8 · 没用 6 · 待实测 4 · 建议：保留 61 / 默认关 11 / 暂停 6 / 可删 0 · 用户标记列全部为空，等待你填写（INV-2 按你的标记改默认值，本文件不改任何代码或默认值）。

依据：计划 `docs/plans/spatial-os.zh.md` §3 D19、§18 步骤 3；提示词 INV-1。语言：中文为正本（D18），无英文版。

## 1. 怎么读这张表

- **状态**：「在用」= 接线完整、伊甸包有数据或属于核心路径；「没用」= 没有包数据，也没有任何默认开的路径能到达它；「半成品」= 已接线，但缺写路径、界面入口、探针或伊甸包数据之一（缺什么写在「依据」里）；「待实测」= 不开真酒馆无法判断（见 §4）。
- **测试数**：在 `tests/*.test.mjs` 与 `tools/browser/*.mjs` 里用 grep 数出的**文件数**（按该行的模块文件名、开关键、图层 id 和少量专用关键词匹配；已点名的探针也计入）。它是粗口径，不是覆盖率；探针按界面驱动时模块名 grep 不到，已把点名的探针补进去。
- **首次打开成本**：**从导入图估算，没有用浏览器网络日志实测**。方法：以 `map/viewer.html` 的模块脚本为根、以 `map/tavern/eden-map.js`（宿主脚本）为根，各自沿静态 `import` 求闭包，得到「启动即载」；只经 `import()` 才到的文件算「按需」。数字是该行模块的文件大小（未压缩 KB，不含 gzip），数据列是该行独占的数据文件。公共底座（所有行共享）见 §2。
- **后台网络**只有三处会在没人操作时发请求：更新检查（F-73）、AI 参谋开启后（F-62）、图鉴按需取图（F-43）；其余都是本机计算或本机定时器。
- **用户标记**：请在最后一列写「留」「关」「停」或「删」（留 = 保持现状；关 = 默认关；停 = 默认关并从设置里藏起来；删 = 以后删除，需要你明确同意才会动代码）。空 = 采纳「建议」。

## 2. 公共底座（所有功能共享，不算在单行里）

- 查看器启动即载：161 个模块文件 ≈ 1170 KB，加 `viewer.html` 72 KB、`vendor/openseadragon` 340 KB（未压缩）。
- 宿主启动即载：77 个模块文件 ≈ 743 KB；另有 40 个文件（≈ 376 KB）只在用到时才 `import()`。
- 伊甸包首屏数据：`manifest.json` 5 KB + `data/maps.json` 111 KB + `world_markers.json` 5 KB + `derived.json`（预载三项）；`overlay.v2.json` 38 KB；`worldbook_addon.json` 74 KB（宿主同步世界书时才读）。
- 底图瓦片、三维 glb（`estate/model/site.glb` 3.8 MB，`props/` 整体约 143 MB 按需）的实际首屏流量**没有测**：需要在浏览器里用 `tools/browser/reload_perf.mjs` 类探针跑网络日志，不在 INV-1 范围内（见 §4 open）。

## 3. 先建议暂停的五项

1. **F-61 事实结晶**：默认关，要求回复里出现包定义的事实标签，伊甸包没有定义；会写世界书，只有单测、没有探针。
2. **F-77 可选依赖桥：表格数据库**：只有同时装了另一个扩展才会读；默认路径和伊甸包都用不到。
3. **F-78 可选依赖桥：房间配图**：依赖未必装了的柏宝绘，没装就整块不出现；默认路径到不了。
4. **F-53 环境音**：伊甸包没有声音图层，只有示例包 town 声明了一层；没有默认开的路径。
5. **F-42 见闻录**：有单测、没有浏览器探针，sweep 没进过；没有包数据，纯用户内容，需要 IndexedDB。

下一批候选：F-60 C7 世界书 JIT（默认关、无探针）、F-06 车流与 F-09 视野锥（装饰为主，常驻 rAF 动画）、F-57 C4 检定掷骰、F-50 三维藏物（只有 3 行演示数据）。

## 4. 待实测与未决（不开真酒馆无法判断，没有猜）

- F-18 路线规划（计划 / 建议路线 / 宏 eden_route）：sweep-1 M-R 没点（入口会往聊天框写字）；有 pack_routes 探针但没在真酒馆里看过
- F-43 原作图鉴（卡自带图集，只读）：默认开；sweep-1「G 没进」；cg_gallery 探针用 1×1 图桩，没在真酒馆里测过；图来自卡脚本指向的 CDN
- F-51 三维昼夜 / 2.5D 浮雕材质：渲染层参数，sweep-1 E6 对比截图没做成；浮雕素材 map/art/relief 是否随发布不确定
- F-62 C9 AI 参谋（后台建议）：默认关，需同意并配置自己的端点；sweep-1「未配端点，按规矩没跑连接测试」；FIX-B6 还在改 provider 默认值；无浏览器探针（FIX-B6 会加请求形状探针）
- 首屏真实网络流量与首屏毫秒数：本清单只做了导入图估算，没有实测。

## 5. 清单

| 编号 | 功能 | 在哪 | 模块 | 默认开关 | 状态 | 依据 | 测试数 | 首次打开成本 | 建议 | 用户标记 |
|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | 国界叠层（世界图国界 / 上中层结界轮廓） | 图层菜单「国界」 | `app/layer-host.mjs`<br>`core/layer-registry.mjs` | `edenMapBarriers`=无登记默认<br>`layer:base-overlay` 菜单行，随图 | 在用 | maps.json 里 world / tc_upper / tc_mid 带 overlay；sweep-1 W5 见图层菜单 | node 9 · 探针 0 | 查看器启动即载 2 文件 / 15 KB；宿主启动即载 1 文件 / 7.0 KB；无后台网络 | 保留 |  |
| F-02 | 下方城市底图（alt 底图） | 图层菜单「显示下方城市」（隐藏行，仅上层图） | `app/map-switch.mjs` | `edenMapAlt:`=无登记默认<br>`layer:alt-base` 关（隐藏行） | 在用 | 只有 tc_upper 带 alt 图；高级项，菜单行默认隐藏；换图会多拉一张更大的底图 | node 3 · 探针 1 | 查看器启动即载 1 文件 / 12 KB；开启后才多下载一张底图（大） | 保留 |  |
| F-03 | 航线 / 巡逻环（金色虚线） | 图层菜单「航线」 | `app/layer-host.mjs`<br>`core/layer-geometry.mjs` | `edenMapRoutes`=无登记默认<br>`layer:routes` 开（菜单行隐藏时随图） | 在用 | tc_upper 有 patrol / patrol_city 路线数据；车流、视野锥都依赖它 | node 10 · 探针 2 | 查看器启动即载 2 文件 / 15 KB；数据 tc_upper.json 21 KB；无后台网络 | 保留 |  |
| F-04 | 安保（结界 / 警报 / 监控 / 门禁） | 图层菜单「安保」；地点卡安保块 | `security.mjs` | `edenMapSecurity`=`0`<br>`layer:security` 关 | 在用 | security.json 有 4 类 2 项；sweep-1 E5-01 见安保块（已修串卡）；默认关 | node 3 · 探针 0 | 查看器启动即载 1 文件 / 5.3 KB；数据 security.json 3.4 KB；无后台网络 | 保留 |  |
| F-05 | 天气（雨 / 沙尘 / 雪 / 闪电） | 图层菜单「天气」 | `app/weather-view.mjs`<br>`core/weather.mjs` | `layer:weather` 开 | 在用 | 默认开的 canvas；伊甸包有「气候」事态组可驱动；空闲时不画；sweep-1 未触发雨雪 | node 5 · 探针 6 | 查看器启动即载 2 文件 / 9.7 KB；无网络；画布仅在有天气时跑 rAF | 保留 |  |
| F-06 | 车流（航线上的悬浮光点） | 图层菜单「车流」 | `app/traffic-view.mjs`<br>`core/traffic.mjs` | `layer:traffic` 开 | 在用 | tc_upper 有两条路线可画；纯装饰；开着时常驻 rAF（省流档减半） | node 3 · 探针 3 | 查看器启动即载 2 文件 / 6.7 KB；无网络；常驻 rAF 动画 | 默认关 |  |
| F-07 | 线索圆圈（事态地点的呼吸节点） | 图层菜单「线索」 | `app/quests-view.mjs`<br>`core/quests.mjs` | `layer:quests` 开 | 在用 | 由事态按地点聚合，伊甸事态包有数据；有 p6_quests 探针 | node 2 · 探针 8 | 查看器启动即载 2 文件 / 9.1 KB；无后台网络 | 保留 |  |
| F-08 | 藏物（地图上发光的拾取物） | 图层菜单「藏物」 | `app/stash-markers.mjs`<br>`core/stash.mjs` | `layer:loot` 开 | 半成品 | 伊甸 stash.json 只有 3 行演示数据（文件自述）；没有卡内原物品的完整登记 | node 14 · 探针 1 | 查看器启动即载 2 文件 / 12 KB；宿主启动即载 1 文件 / 5.0 KB；数据 stash.json 1.4 KB；无后台网络 | 保留 |  |
| F-09 | 视野锥（巡逻岗哨视野） | 图层菜单「视野锥」 | `app/vision-view.mjs`<br>`core/vision.mjs` | `layer:vision` 开 | 在用 | 由巡逻环生成岗哨扇形，伊甸上层有 2 条巡逻环；潜行判定只在掷骰（C4）开着才有后果；无墙数据；纯装饰为主 | node 3 · 探针 1 | 查看器启动即载 2 文件 / 14 KB；无网络；常驻 rAF | 默认关 |  |
| F-10 | 漫游（人物按日程滑动） | 图层菜单「漫游」；人物栏 | `app/wander.mjs`<br>`core/routine.mjs`<br>`core/walk.mjs` | `layer:wander` 开 | 在用 | routine.json 有 4 名人物日程；确定性时钟 | node 3 · 探针 1 | 查看器启动即载 3 文件 / 21 KB；数据 routine.json 2.1 KB；无网络；15 秒定时器（面板隐藏时停） | 保留 |  |
| F-11 | 行程（路线卡 / 旅行方式） | 图层菜单「行程」；行程抽屉 | `trips-view.mjs`<br>`tavern/trips-parse.mjs` | `edenMapTrips`=无登记默认<br>`layer:trips` 随开关（edenMapTrips） | 在用 | 核心图层；有 trips095 探针与测试 | node 9 · 探针 2 | 查看器启动即载 1 文件 / 11 KB；按需 1 文件 / 4.3 KB；无后台网络 | 保留 |  |
| F-12 | 地名标签 | 图层菜单「地名」 | `core/label-tiers.mjs`<br>`app/block-overlay.mjs` | `layer:labels` 开 | 在用 | 核心图层，所有图都有标签 | node 6 · 探针 1 | 查看器启动即载 2 文件 / 10 KB；无后台网络 | 保留 |  |
| F-13 | 标记（图钉） | 图层菜单「标记」 | `app/markers.mjs`<br>`app/card-links.mjs` | `layer:markers` 开 | 在用 | 核心图层，伊甸三层图共 49 个标记 | node 12 · 探针 1 | 查看器启动即载 2 文件 / 26 KB；无后台网络 | 保留 |  |
| F-14 | 事态（地图上的事态标记 + 事态栏） | 图层菜单「事态」；事态抽屉 | `events-view.mjs`<br>`tavern/events-parse.mjs`<br>`core/event-geo.mjs` | `edenMapEvOff`=无登记默认<br>`layer:events` 开 | 在用 | 核心；伊甸 overlay 有 40 种事态类型；sweep-1 D1 已走 | node 30 · 探针 4 | 查看器启动即载 2 文件 / 47 KB；宿主启动即载 2 文件 / 21 KB；无后台网络 | 保留 |  |
| F-15 | AI 参谋标注（线索 / 标注叠层） | 图层菜单「AI 参谋标注」（有内容才显示） | `app/nav-ops-view.mjs`<br>`tavern/nav-ops.mjs` | `layer:nav-ops` 开，但只在 AI 参谋开着且有产出时才出现 | 没用 | 没有包数据；唯一入口是 AI 参谋（C9，默认关，需同意并配置端点） | node 3 · 探针 2 | 查看器启动即载 1 文件 / 4.6 KB；宿主启动即载 1 文件 / 2.0 KB；无后台网络 | 默认关 |  |
| F-16 | 本机道具图层（用户放在地图上的道具） | 图层菜单「本机道具」（有内容才显示） | `app/local-props-view.mjs`<br>`app/prop-store.mjs`<br>`core/prop-pack.mjs` | `layer:local-props` 开，但没有道具时不出现 | 没用 | 没有包数据；需要用户自己导入文件；无默认开路径；有 layers_ext 探针 | node 2 · 探针 2 | 查看器启动即载 3 文件 / 16 KB；无后台网络 | 默认关 |  |
| F-17 | 交通网（线路 / 站点 / 城区主题图） | 图层菜单「交通网」 | `app/transit-view.mjs`<br>`core/transit.mjs`<br>`core/transit-geometry.mjs`<br>`core/thematic.mjs` | `layer:transit` 关 | 在用 | 伊甸 overlay 有 26 站 / 5 线 / 4 城区，tc_mid 演示；sweep-1 开关过；pack_routes 探针 | node 7 · 探针 5 | 查看器启动即载 3 文件 / 23 KB；宿主启动即载 1 文件 / 5.4 KB；按需 1 文件 / 1.3 KB；数据 overlay.v2.json 38 KB；无后台网络 | 保留 |  |
| F-18 | 路线规划（计划 / 建议路线 / 宏 eden_route） | 地点卡「去这里」→ 路线卡；图层（无菜单行） | `app/route-plan-view.mjs`<br>`core/router.mjs`<br>`tavern/route-flow.mjs` | `layer:route-plan` 开（无菜单行，有计划时才画） | 待实测 | sweep-1 M-R 没点（入口会往聊天框写字）；有 pack_routes 探针但没在真酒馆里看过 | node 6 · 探针 1 | 查看器启动即载 2 文件 / 28 KB；宿主启动即载 2 文件 / 21 KB；无后台网络 | 保留 |  |
| F-19 | 迷雾探索（去过才点亮） | 设置「显示」→ 迷雾；图层 | `app/fog.mjs`<br>`core/exploration-ledger.mjs` | `edenMapFog`=`1`<br>`layer:fog` 开 | 在用 | 默认开；sweep-1 切换过；有 fog 探针与 4 个测试 | node 10 · 探针 5 | 查看器启动即载 2 文件 / 7.0 KB；无后台网络 | 保留 |  |
| F-20 | 漂移云 / 切层转场 | 切换层级时的云转场；上层图漂移云 | `app/clouds.mjs` | `layer:clouds` 随图（tc_upper 有 clouds 配置） | 在用 | maps.json 里 tc_upper 配了 clouds；有 clouds 探针 | node 4 · 探针 5 | 查看器启动即载 1 文件 / 11 KB；无后台网络 | 保留 |  |
| F-21 | 空气透视（景深雾） | 上层图的景深滤镜 | `app/depth-haze.mjs`<br>`core/haze.mjs`<br>`core/depth.mjs` | `layer:depth-haze` 开 | 在用 | tc_upper 带 upper_depth.json 景深数据；有金标测试 | node 8 · 探针 1 | 查看器启动即载 3 文件 / 12 KB；数据 upper_depth.json 2.4 KB；无后台网络 | 保留 |  |
| F-22 | 主题 / 语言 / 惯用手 / 悬浮钮位置 | 设置「显示」 | `app/theme.mjs`<br>`app/i18n.mjs`<br>`app/one-hand-mode.mjs` | `edenMapTheme`=`auto`<br>`edenMapLang`=`zh`<br>`edenMapHand`=`auto`<br>`edenMapFabPos`=无登记默认 | 在用 | 默认路径，sweep-1 H/S 全部走过；同步到脚本变量 eden_prefs | node 7 · 探针 5 | 查看器启动即载 3 文件 / 15 KB；无后台网络 | 保留 |  |
| F-23 | 昼夜界面 / 夜色调 | 设置「显示」 | `custom-tint.mjs`<br>`app/theme.mjs` | `edenMapGlassClock`=`0`<br>`edenMapNight`=无登记默认 | 在用 | 夜色默认开；sweep-1 切换过；上中层才有多时段底图 | node 14 · 探针 6 | 查看器启动即载 2 文件 / 8.3 KB；无后台网络 | 保留 |  |
| F-24 | 色觉模式 | 设置「显示」 | `app/color-vision-mode.mjs`<br>`core/kind-palette.mjs` | `edenMapCvd`=`0` | 在用 | 默认关；伊甸事态组配了 x-cvd 色；有 e7 探针 | node 4 · 探针 2 | 查看器启动即载 1 文件 / 4.6 KB；按需 1 文件 / 0.9 KB；无后台网络 | 保留 |  |
| F-25 | 减少动态 | 设置「显示」 | `app/settings-wire.mjs` | `edenMapRM`=`auto`<br>`edenMapNoFx`=无登记默认 | 在用 | 无障碍；跟随系统 prefers-reduced-motion | node 1 · 探针 0 | 查看器启动即载 1 文件 / 5.8 KB；无后台网络 | 保留 |  |
| F-26 | 单字母快捷键 | 设置「显示」 | `app/map-level-nav.mjs` | `edenMapKeys`=`0` | 在用 | 默认关（用户 2026-09-28 反馈）；有测试与探针 | node 1 · 探针 1 | 查看器启动即载 1 文件 / 11 KB；无后台网络 | 保留 |  |
| F-27 | 小地图 | 设置「显示」→ 小地图；左下角 | `app/settings-wire.mjs` | `edenMapMinimap`=`0` | 在用 | 默认关；sweep-1 切换过 | node 4 · 探针 1 | 查看器启动即载 1 文件 / 5.8 KB；无后台网络 | 保留 |  |
| F-28 | 清晰度档位 / 三维画质 | 设置「显示」 | `app/sharpness-tiers.mjs`<br>`core/graphics-budget.mjs`<br>`core/lod.mjs` | `edenMapTierV2`=无登记默认<br>`edenMap3dQ`=`auto` | 在用 | 默认自动；显存预算与 LOD 为纯函数有金标测试 | node 3 · 探针 1 | 查看器启动即载 1 文件 / 25 KB；按需 2 文件 / 14 KB；无后台网络 | 保留 |  |
| F-29 | 调试帧率显示 | 设置「高级」 | `app/fps.mjs` | `edenMapDebugFps`=`0` | 在用 | 默认关（U-FIX-5 S-05 已修）；开发者用 | node 2 · 探针 1 | 查看器启动即载 1 文件 / 2.6 KB；无后台网络 | 保留 |  |
| F-30 | 首次引导 / 一次性提示 | 首次打开的三步提示；事态图例提示 | `app/notice-layer.mjs`<br>`custom-hints.mjs`<br>`ui/notice.mjs` | `edenMapHint`=无登记默认<br>`edenMapHintN`=无登记默认<br>`edenMapLegHint`=无登记默认<br>`edenMapEvTip`=无登记默认 | 在用 | 本机只出一次；sweep-1 W1 未出现（地图记住了状态）；有 7 个探针依赖 | node 1 · 探针 7 | 查看器启动即载 2 文件 / 5.3 KB；按需 1 文件 / 14 KB；无后台网络 | 保留 |  |
| F-31 | 启动闪屏 | 首次载入 | `tavern/splash.mjs` | `edenMapSplashSeen`=无登记默认 | 在用 | 有 splash095 探针；首次出现一次 | node 2 · 探针 4 | 按需 1 文件 / 10 KB；无后台网络 | 保留 |  |
| F-32 | 抽屉 / 导轨宽度记忆 | 右侧抽屉拖宽；三维导轨 | `app/drawer-glue.mjs`<br>`ui/chrome3d.js` | `edenMapRailW`=无登记默认<br>`edenMap3dRailW`=无登记默认 | 在用 | 布局偏好，sweep-1 窄屏时走过 | node 0 · 探针 0 | 查看器启动即载 1 文件 / 9.0 KB；按需 1 文件 / 9.9 KB；无后台网络 | 保留 |  |
| F-33 | 人物栏（名册 / 头像 / 数值 / 分组） | 人物抽屉；设置「人物与物品」 | `characters-view.mjs`<br>`tavern/characters-parse.mjs`<br>`core/roster.mjs`<br>`core/people.mjs`<br>等 5 个 | `edenMapCharStats`=无登记默认<br>`edenMapCharMore`=无登记默认<br>`edenMapCharMoreOpen`=无登记默认<br>`edenMapPortraits`=无登记默认<br>`edenMapChGroups`=无登记默认<br>`edenMap:chars`=无登记默认<br>`edenMap:avatars`=无登记默认 | 在用 | 核心抽屉页；sweep-1 G/E5 走过；有 chars092 / roster095 探针 | node 21 · 探针 2 | 查看器启动即载 4 文件 / 59 KB；宿主启动即载 1 文件 / 11 KB；按需 1 文件 / 13 KB；无后台网络 | 保留 |  |
| F-34 | 物品栏 / 背包（拾取、对账） | 物品抽屉；地点卡「存放」 | `stash-view.mjs`<br>`core/pickup.mjs`<br>`tavern/stash-flow.mjs`<br>`tavern/stash-store.mjs`<br>等 5 个 | `edenMapInvInj`=`1` | 在用 | 默认开（背包摘要注入 C1）；D3-01 已修；drawer_stash 探针；但包内登记物品仅 3 行演示 | node 16 · 探针 1 | 查看器启动即载 1 文件 / 8.0 KB；宿主启动即载 1 文件 / 20 KB；按需 3 文件 / 42 KB；无后台网络 | 保留 |  |
| F-35 | 剧情改名 / 名称与用途 | 设置；「名称与用途」对话框 | `custom-names-view.mjs`<br>`custom-dialog-view.mjs`<br>`custom-outfit.mjs`<br>`core/legacy-custom.mjs` | `edenMap:custom`=无登记默认 | 在用 | 用户自定义地点名；custom095 探针 | node 4 · 探针 1 | 查看器启动即载 4 文件 / 46 KB；无后台网络 | 保留 |  |
| F-36 | 变量映射（换卡兼容） | 设置「数据与映射」 | `stat-path-mapping-view.mjs`<br>`tavern/stat-path-mapping.mjs`<br>`app/data-mapping-settings.mjs` | `edenMap:varmap:`=无登记默认 | 在用 | 换卡才用；只在嵌入酒馆时加载；varmap095 探针 | node 10 · 探针 1 | 查看器启动即载 2 文件 / 12 KB；宿主启动即载 1 文件 / 7.1 KB；无后台网络 | 保留 |  |
| F-37 | 未上图地点选择器 | 标题栏「未上图：<名字>」 | `unmapped-place-picker.mjs`<br>`app/place-resolver.mjs` | 无开关（常开） | 在用 | 认不出当前地点时出现；unmapped096 探针 | node 10 · 探针 1 | 查看器启动即载 2 文件 / 20 KB；无后台网络 | 保留 |  |
| F-38 | 地图 → 聊天（去这里 / 追问这件事） | 地点卡 / 事态卡 / 人物卡底部按钮；AI 联动卡 C10 | `compose-view.mjs`<br>`tavern/compose-templates.mjs`<br>`tavern/place-action-injection.mjs` | `edenMapCompose`=无登记默认<br>`edenMapInject`=`off`<br>`edenMapActionTpl`=无登记默认 | 在用 | 默认关（注入）/ 填入不发送；sweep-1 因会写聊天框未点；有 p6_action 探针 | node 5 · 探针 6 | 查看器启动即载 1 文件 / 9.4 KB；按需 2 文件 / 8.1 KB；无后台网络 | 保留 |  |
| F-39 | 时间轴回放 / 关键帧缓存 | 回放条；设置「回放」 | `tavern/timeline-flow.mjs`<br>`tavern/timeline.mjs`<br>`tavern/keyframes.mjs` | 无开关（常开） | 在用 | sweep-1 R / X 回放条走过；replay_i17 探针；关键帧为可丢缓存 | node 6 · 探针 1 | 宿主启动即载 1 文件 / 6.6 KB；按需 2 文件 / 8.8 KB；无后台网络 | 保留 |  |
| F-40 | 后台静默推演（15 秒心跳） | 后台（面板可不开） | `tavern/background-scan-scheduler.mjs` | `edenMapTick`=`1` | 在用 | 默认开；只做本机推演，不联网；p6_tick 探针 | node 1 · 探针 1 | 按需 1 文件 / 3.9 KB；无网络；15 秒定时器，是否执行由 plan() 决定 | 保留 |  |
| F-41 | 事态特效（花屏 / 屏闪） | 事态触发时的全屏效果 | `events-fx.mjs`<br>`core/events-default.mjs` | 无开关（常开） | 在用 | 伊甸 events.fx_presets 配了 glitch；events_fx 探针 | node 2 · 探针 2 | 查看器启动即载 1 文件 / 2.4 KB；宿主启动即载 1 文件 / 3.4 KB；无后台网络 | 保留 |  |
| F-42 | 见闻录（把图与手记钉在地标上） | 地点卡「见闻录」；粘贴图片 | `scrapbook-view.mjs`<br>`core/scrapbook.mjs` | `edenMapScrap`=无登记默认 | 半成品 | 有单元测试，没有浏览器探针，sweep 没进过；无包数据（用户内容）；图字节存本机 IndexedDB | node 1 · 探针 1 | 查看器启动即载 2 文件 / 14 KB；无后台网络 | 暂停 |  |
| F-43 | 原作图鉴（卡自带图集，只读） | 人物卡 → 图鉴分组；设置 | `gallery-view.mjs`<br>`tavern/gallery-flow.mjs`<br>`core/gallery-scenes.mjs`<br>`core/gallery-spec.mjs`<br>等 5 个 | `edenMapGallery`=`1` | 待实测 | 默认开；sweep-1「G 没进」；cg_gallery 探针用 1×1 图桩，没在真酒馆里测过；图来自卡脚本指向的 CDN | node 5 · 探针 1 | 查看器启动即载 4 文件 / 26 KB；宿主启动即载 4 文件 / 21 KB；打开图鉴才取图（来自卡指向的 CDN，常驻无） | 保留 |  |
| F-44 | 世界书档案窥视（地点卡里看世界书条目） | 地点卡「世界书档案」 | `worldbook-peek-view.mjs`<br>`core/wb-peek.mjs` | 无开关（常开） | 在用 | sweep-1 D4-01 走过（已修显示原始脚本文本） | node 1 · 探针 0 | 查看器启动即载 1 文件 / 2.7 KB；宿主启动即载 1 文件 / 3.1 KB；无后台网络 | 保留 |  |
| F-45 | 庄园三维（外观 / 内透 / 楼层剖面） | 地图内「3D 查看」；一个壳内 2D / 3D | `estate/main.js`<br>`estate/plan.js`<br>`app/subpage3d-host.mjs`<br>`app/estate-shell.mjs`<br>等 5 个 | `edenEstateLabels`=无登记默认<br>`edenEstateHintSeen`=无登记默认<br>`edenMapEstateFail`=无登记默认 | 在用 | sweep-1 E1–E8 走过；estate3d / estate_* 探针一批 | node 7 · 探针 5 | 查看器启动即载 3 文件 / 47 KB；按需 2 文件 / 163 KB；数据 site.glb 3849 KB；进入 3D 才载入 estate 页、three 与 site.glb（约 3.8 MB） | 保留 |  |
| F-46 | 三维相机控制（自转 / 滚轮缩放 / 提示卡） | 设置「显示」；三维页 | `ui/camera-controls.js` | `edenMap3dAutoRotate`=`0`<br>`edenMap3dWheelZoom`=`0`<br>`edenMapV3dHintSeen`=无登记默认 | 在用 | 默认关；有测试与探针 | node 1 · 探针 2 | 按需 1 文件 / 6.7 KB；无后台网络 | 保留 |  |
| F-47 | 三维抽屉 | 设置「显示」 | `app/subpage3d-host.mjs` | `edenMap3dAuto`=`0` | 在用 | 默认关；S-01 补了说明；有测试与探针 | node 4 · 探针 2 | 查看器启动即载 1 文件 / 26 KB；无后台网络 | 保留 |  |
| F-48 | 三维地标子页（lm_* 单体建筑） | 地点卡「3D 查看」→ props/viewer3d.html | `props/viewer3d.html` | 无开关（常开） | 在用 | sweep-1 W4「猎季营地 → 3D」走过；每个子页独立加载 glb（数 MB 到 9 MB），整个 props 目录约 143 MB（CDN 按需） | node 8 · 探针 2 | 按需 1 文件 / 74 KB；进入才下载对应 glb | 保留 |  |
| F-49 | 三维人物在场标签 / 日程挪人 | 三维页 | `estate/presence.js`<br>`estate/labels.js` | 无开关（常开） | 在用 | S7-3 做的在场标签，estate_presence 探针；三维页另有 15 秒日程定时器 | node 0 · 探针 1 | 按需 2 文件 / 12 KB；三维页内 15 秒定时器（暂停 / 隐藏时停） | 保留 |  |
| F-50 | 三维藏物（房间里的发光道具） | 三维页 | `core/stash3d.mjs` | 无开关（常开） | 半成品 | 复用 stash.json 的 3 行演示数据；没有三维专属探针 | node 1 · 探针 0 | 按需 1 文件 / 4.2 KB；无后台网络 | 暂停 |  |
| F-51 | 三维昼夜 / 2.5D 浮雕材质 | 三维页（渲染层） | `three/daynight.mjs`<br>`three/relief.mjs` | 无开关（常开） | 待实测 | 渲染层参数，sweep-1 E6 对比截图没做成；浮雕素材 map/art/relief 是否随发布不确定 | node 3 · 探针 2 | 按需 2 文件 / 17 KB；无后台网络 | 保留 |  |
| F-52 | 局部高清插图 / 世界↔分组缩放交接 / 双击缩放 | 缩放时自动 | `app/hires-inset-tiles.mjs`<br>`app/scale-handoff.mjs`<br>`app/quick-zoom.mjs` | 无开关（常开） | 在用 | tc_upper 配了 insets；缩放时自动触发；perf 探针 | node 0 · 探针 1 | 查看器启动即载 3 文件 / 18 KB；无后台网络 | 保留 |  |
| F-53 | 环境音（声音图层，程序合成） | 图层菜单（只有包里声明了 sound 层才有） | `app/sound-block.mjs`<br>`core/ambience.mjs` | 无开关（常开） | 没用 | 伊甸包没有 sound 层；只有 town 示例包声明了 harbour-sound；没有默认开路径；Web Audio | node 6 · 探针 1 | 查看器启动即载 2 文件 / 11 KB；无后台网络 | 暂停 |  |
| F-54 | C1 事态摘要注入 | AI 联动 · C1（常开） | `tavern/context.mjs`<br>`tavern/modes-flow.mjs` | 无开关（常开） | 在用 | 每次回复注入事态 / 人物 / 物品摘要（约 100–300 token）；C1 无总开关（背包行见物品栏行的键） | node 11 · 探针 1 | 宿主启动即载 2 文件 / 26 KB；无网络，只是注入文字 | 保留 |  |
| F-55 | C2 状态行注入 | AI 联动 · C2 | `tavern/interaction-modes.mjs`<br>`tavern/modes-flow.mjs` | `edenMapStateInj`=`1`<br>`edenMapStateDepth`=`2`<br>`edenMapStateBudget`=`150`<br>`edenMapStateOmit`=`[]` | 在用 | 默认开；有测试；injectPreview 预览 | node 12 · 探针 1 | 宿主启动即载 2 文件 / 19 KB；无后台网络 | 保留 |  |
| F-56 | C3 宏（eden_here / eden_route / eden_fly） | AI 联动 · C3 | `tavern/host-api.mjs` | `edenMapMacros`=`0` | 没用 | 默认关；只在作者自己的提示词里写了宏才有作用；无包数据；无探针 | node 6 · 探针 1 | 宿主启动即载 1 文件 / 18 KB；无后台网络 | 默认关 |  |
| F-57 | C4 检定掷骰 | AI 联动 · C4 | `tavern/check-failure-report.mjs`<br>`core/rng.mjs` | `edenMapDice`=`0` | 半成品 | 默认关；有失败报告模块，但没有探针、没在真酒馆里跑过；依赖藏物 DC 与视野锥 | node 5 · 探针 0 | 查看器启动即载 1 文件 / 0.9 KB；按需 1 文件 / 3.7 KB；无后台网络 | 默认关 |  |
| F-58 | C5 结算记录（账本写入 npc / events） | AI 联动 · C5 | `core/settlement-record.mjs`<br>`tavern/settlement-guard.mjs`<br>`core/ledger.mjs` | `edenMapLedgerWrite`=`0` | 半成品 | S6-3 给 npc / events 域加了写路径（默认关），只写地图自己的聊天变量；有单测，无浏览器探针，未在真酒馆见过 | node 11 · 探针 0 | 宿主启动即载 1 文件 / 3.4 KB；按需 2 文件 / 34 KB；无后台网络 | 默认关 |  |
| F-59 | C6 空间坐标契约注入 | AI 联动 · C6 | `tavern/spatial-contract.mjs` | `edenMapSpatial`=`0`<br>`edenMapSpatialBudget`=`120`<br>`edenMapSpatialDepth`=`2` | 在用 | 默认关；有测试；注入文字固定（parity 测试钉住） | node 6 · 探针 0 | 按需 1 文件 / 9.2 KB；无后台网络 | 默认关 |  |
| F-60 | C7 世界书 JIT 水合 | AI 联动 · C7 | `tavern/worldbook-jit.mjs` | `edenMapWbJit`=`0` | 半成品 | 默认关；有专门单测（worldbook-jit.test），缺浏览器探针，没在真酒馆里看过；只动附加书里带 eden_id 的条目；需要附加书已安装 | node 2 · 探针 0 | 按需 1 文件 / 5.7 KB；无后台网络 | 默认关 |  |
| F-61 | C8 事实结晶 | AI 联动 · C8 | `tavern/worldbook-crystallize.mjs` | `edenMapWbXtal`=`0`<br>`edenMapWbXtalCfg`=无登记默认 | 半成品 | 默认关；有专门单测，缺浏览器探针；要求回复里出现包定义的事实标签，伊甸包没有定义（缺包数据）；会写世界书 | node 1 · 探针 0 | 按需 1 文件 / 3.4 KB；无后台网络 | 暂停 |  |
| F-62 | C9 AI 参谋（后台建议） | AI 联动 · C9 | `tavern/planner-gateway.mjs`<br>`tavern/llm-gateway.mjs`<br>`tavern/llm-flow.mjs`<br>`app/ai-nav-form.mjs`<br>等 5 个 | `edenMapNav`=`0`<br>`edenMapNavCfg`=无登记默认<br>`edenMapNavConsent`=`0`<br>`edenMapNavCadence`=`120000` | 待实测 | 默认关，需同意并配置自己的端点；sweep-1「未配端点，按规矩没跑连接测试」；FIX-B6 还在改 provider 默认值；无浏览器探针（FIX-B6 会加请求形状探针） | node 11 · 探针 0 | 宿主启动即载 2 文件 / 15 KB；按需 3 文件 / 16 KB；开启后每 2 / 5 / 10 分钟一次后台请求（用户自己的端点，消耗自己的 token）；默认关时无 | 默认关 |  |
| F-63 | AI 参谋操作沙盒（受限操作 DSL） | C9 的内部环节 | `tavern/operation-dsl.mjs`<br>`tavern/nav-ops.mjs` | 无开关（常开） | 半成品 | 有测试；只有 C9 开了才会跑；产出只进会话级叠层（nav-ops），不写聊天；无探针 | node 3 · 探针 0 | 宿主启动即载 1 文件 / 2.0 KB；按需 1 文件 / 7.3 KB；无后台网络 | 默认关 |  |
| F-64 | 世界书附加书同步（地点条目） | 设置「数据与映射」/ AI 联动 | `tavern/worldbook-sync.mjs`<br>`tavern/host-tavernhelper.mjs` | `edenMapWbAuto`=`0`<br>`edenMapWbOn`=`1`<br>`edenMapWbTomb`=`0`<br>`edenMapWbChars`=无登记默认<br>`edenMapWbNoticeVer`=无登记默认<br>`edenMapWbSync`=无登记默认<br>`edenMapWbWhere`=无登记默认 | 在用 | 默认路径（edenMapWbOn=1）；只动自己的附加书 / eden_id 条目；sweep-1 S-02 走过设置页；附加书的内容由 tools/build_worldbook_addon.py 生成 | node 9 · 探针 1 | 宿主启动即载 1 文件 / 29 KB；按需 1 文件 / 20 KB；数据 worldbook_addon.json 75 KB；无后台网络 | 保留 |  |
| F-65 | 社区预设文本净化 / 半结构化字段 | 后台（读聊天前） | `tavern/sanitize.mjs`<br>`tavern/preset.mjs` | `edenMapSanitize`=`1`<br>`edenMapSanitizeTags`=无登记默认 | 在用 | 默认开；只在读取时识别块，不审查内容 | node 5 · 探针 0 | 宿主启动即载 1 文件 / 12 KB；按需 1 文件 / 3.4 KB；无后台网络 | 保留 |  |
| F-66 | 设定包选择 / 导入（URL / 文件 / 索引） | 设置「高级」→ 地图包 | `tavern/pack-gate.mjs`<br>`app/pack-settings.mjs`<br>`core/pack-index.mjs`<br>`core/pack-store-db.mjs`<br>等 5 个 | `edenMapPackPick`=无登记默认<br>`edenMapPackLlm`=`{}`<br>`edenMapPacks`=无登记默认 | 在用 | S9-2 做的通用脚本入口，index 里 eden / town / minimal；有 pack_switch / pack_minimal / pack_town 探针（探针按界面驱动，grep 不到模块名） | node 8 · 探针 3 | 查看器启动即载 1 文件 / 9.0 KB；宿主启动即载 4 文件 / 26 KB；选 URL 包才取外部；默认无 | 保留 |  |
| F-67 | 自动包（读卡生成 + 随聊天生长） | 无包的卡自动启用 | `tavern/auto-pack.mjs`<br>`core/card-read.mjs`<br>`core/grow.mjs` | 无开关（常开） | 在用 | autopack 探针；伊甸卡有嵌入包不会走这条；对其他卡是兜底 | node 4 · 探针 1 | 按需 3 文件 / 25 KB；无后台网络 | 保留 |  |
| F-68 | 编辑模式 / 导出为包 | 设置「高级」→ 编辑模式 | `app/pack-edit-view.mjs`<br>`app/pack-edit.mjs`<br>`app/pack-live.mjs`<br>`core/pack-draft.mjs`<br>等 5 个 | `edenMapEdit`=`0`<br>`edenMapPackRemote`=`0`<br>`edenMap:edit:`=无登记默认 | 在用 | 默认关；S9b 做的；pack_editor 探针；sweep-1 未进 | node 3 · 探针 1 | 查看器启动即载 5 文件 / 36 KB；无后台网络 | 保留 |  |
| F-69 | 包声明图层（pack 自带图层 / 示例） | 图层菜单（包里有 layers 才有） | `app/declared-layers.mjs`<br>`app/declared-sources.mjs`<br>`core/layer-spec.mjs`<br>`core/layer-values.mjs` | `edenMapLayers`=无登记默认 | 在用 | 伊甸有 1 层（全域结界，默认关，sweep-1 W5 见置灰行）；town 有 3 层；pack_layers 探针 | node 6 · 探针 2 | 查看器启动即载 3 文件 / 39 KB；宿主启动即载 2 文件 / 20 KB；无后台网络 | 保留 |  |
| F-70 | 本机扩展接口 window.EdenMap.* | 后台（开发者 / 作者） | `app/extension-api.mjs`<br>`tavern/extension-api-contract.mjs`<br>`app/plugins.mjs` | 无开关（常开） | 在用 | 机读契约有测试；内置功能不依赖它；本机扩展点 | node 6 · 探针 11 | 查看器启动即载 2 文件 / 6.8 KB；宿主启动即载 1 文件 / 2.0 KB；无后台网络 | 保留 |  |
| F-71 | MVU 读取与上下文流水线 | 后台 | `tavern/mvu-bridge.mjs`<br>`tavern/context.mjs`<br>`tavern/mvu-readers.mjs`<br>`tavern/mvu-snapshot.mjs`<br>等 5 个 | `edenMap:chat:`=无登记默认<br>`edenMapSeen:`=无登记默认 | 在用 | 核心数据流；只读卡变量；按聊天存的键含探索 / 见闻索引 | node 44 · 探针 6 | 宿主启动即载 4 文件 / 76 KB；按需 1 文件 / 27 KB；无后台网络 | 保留 |  |
| F-72 | 存储预算（LRU 清理 / 用量面板） | 设置「更新与版本」/ 存储 | `tavern/storage-budget.mjs` | `edenMap:lru`=无登记默认 | 在用 | 按聊天分的键会占空间；有 storage 测试 | node 2 · 探针 0 | 按需 1 文件 / 5.8 KB；无后台网络 | 保留 |  |
| F-73 | 更新检查 / 线路 / 分支跟随 | 后台每 10 分钟；设置「更新与版本」 | `tavern/host-checks.mjs`<br>`tavern/branch-follow.mjs`<br>`tavern/follow-pin.mjs`<br>`tavern/tile-route.mjs`<br>等 5 个 | `edenMapAutoCheck`=无登记默认<br>`edenMapAutoUpdate`=`0`<br>`edenMapLockTag`=无登记默认<br>`edenMapUpdSkip`=无登记默认<br>`edenMapCheckToast`=无登记默认<br>`edenMapUpdate`=无登记默认<br>`edenMapLine`=无登记默认 | 在用 | 默认开（自动检查）；DIST-1 将改成走包线路；有 autoupd097 / follow_pin 探针 | node 13 · 探针 12 | 宿主启动即载 5 文件 / 40 KB；面板开着时每 10 分钟取一次分支 head.json（CDN 镜像，最多几个请求）；自动更新默认关 | 保留 |  |
| F-74 | 自检卡片 / 状态点 / 加载进度 | 设置首页；顶栏状态点；加载条 | `tavern/selfcheck.mjs`<br>`tavern/feature-health.mjs`<br>`app/status-dot.mjs`<br>`app/load-progress.mjs` | 无开关（常开） | 在用 | feature-health 有测试；sweep-1 S 走过 | node 17 · 探针 4 | 查看器启动即载 2 文件 / 1.2 KB；宿主启动即载 1 文件 / 6.1 KB；按需 1 文件 / 26 KB；无后台网络 | 保留 |  |
| F-75 | 反馈日志（环形缓冲 + 复制报告） | 设置「更新与版本」→ 反馈 | `app/feedback.mjs`<br>`app/feedback-report.mjs`<br>`core/logbuf.mjs` | `edenMapLogCur`=无登记默认<br>`edenMapLogPast`=无登记默认 | 在用 | 0.9.7 加的；报告不含聊天内容 | node 3 · 探针 0 | 查看器启动即载 3 文件 / 16 KB；宿主启动即载 1 文件 / 5.6 KB；无后台网络 | 保留 |  |
| F-76 | 版权申明 / 关于页（作者署名） | 设置「关于」 | `tavern/host-about.mjs`<br>`app/about-build.mjs` | 无开关（常开） | 在用 | 作者署名要求；sweep-1 S-04 走过 | node 4 · 探针 0 | 查看器启动即载 1 文件 / 2.3 KB；宿主启动即载 1 文件 / 5.6 KB；无后台网络 | 保留 |  |
| F-77 | 可选依赖桥：表格数据库（只读） | 后台（装了该扩展才有） | `tavern/tabledb-bridge.mjs` | 无开关（常开） | 没用 | 只在用户同时装了 AutoCardUpdaterAPI 时才读表；伊甸包与默认路径都不用 | node 1 · 探针 0 | 宿主启动即载 1 文件 / 5.1 KB；无后台网络 | 暂停 |  |
| F-78 | 可选依赖桥：房间配图（柏宝绘 / 房间图集） | 三维页房间卡「配图」 | `tavern/imagegen-bridge.mjs`<br>`ui/illustration-panel.js`<br>`ui/room-gallery-panel.js`<br>`core/room-gallery-db.mjs`<br>等 5 个 | 无开关（常开） | 没用 | 柏宝绘没装就整块静默不出现；房间图集需要用户自己加图；room_gallery_ui 探针；默认路径不到 | node 2 · 探针 1 | 按需 5 文件 / 56 KB；无后台网络 | 暂停 |  |

## 6. 覆盖核对

`map/core/storage.mjs` 的每个登记键和 `map/core/layer-defaults.mjs` 的每个内核图层 id，都只出现在上表「默认开关」列的某一行里（图层写作 `layer:<id>`）。核对脚本的输出记在 `docs/plans/spatial-os-log.md` 的 RESULT INV-1 中。
