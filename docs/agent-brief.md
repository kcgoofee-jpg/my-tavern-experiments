# 代理速查（每个任务先读这一页，别的文档按需 grep）

## Current status (2026-09-29, streaming/decoupling P0–P3-C sealed — read this first)

- HEAD `1bdf113` on `preview`; working tree clean. `main` is a fast-forward behind (`tools/sync_main.sh`, run it when a batch pushes — the two branches carry the same content). **The streaming/decoupling refactor is fully sealed (report: `docs/reviews/architecture_and_stream_perf.md`)**: P0 G1+G6 (`040baf9`+`04f170f`), P1 (`643e087`), P2 MVUBridge + ContextPipeline (`785c421`+`28d646e`), P3-A DepthSystem + Estate3D (`709c1c9`+`43c053a`), P3-B CharacterRosterSystem (`a4de0f2`+`5ce27d3`), P3-C LayerRegistry (`aed4f49`+`92a9bda`+`910bd6e`).
- Just landed: `f6ef639` de-speculation leftovers closed (`docs/card-digest.md:387,389`, `docs/upper-setting.md:278` hedged wording aligned to the established 口径) + worldbook ship-JSON standard extension interface reserved (top-level `schema: 1` + `category` map; `wbsync.mjs` consumer unchanged). Earlier on this line: `34e5fd0` upper-layer 9-island integral re-render + settings License page + worldbook builder v16 drops the 「推断」 wording.
- Version bumped to `0.9.7` (2026-09-29 release window: CHANGELOG section closed, tag `map-v0.9.7` not cut yet — `check_version` warning about the missing tag is expected until the release flow tags it; the release line stays pinned to `map-v0.9.6`). The shipped worldbook JSON still carries `0.9.6-dev` until the next builder run. CHANGELOG's in-progress section is `0.9.8`.
- Open work lives in `docs/todo.md` (strike-through = done, with SHA). GLM-agent local-dev pitfalls: `docs/handoff.md` §GLM-Agent guide.

- 分支只推 `preview`；不打标签、不发正式版；不生成角色卡；不写用户酒馆数据。
- 在 scratchpad 里自建 worktree：`git fetch && git worktree add -b <名> <路径> origin/preview`；不动主工作区；永不 reset 到旧的 origin。
- shell 的 `cat`/`ls` 是坏别名：用 `command cat` / Write 工具；提交信息写文件用 `-F`；非 ASCII 路径用 fileURLToPath。
- **Branch lines (2026-09-29)**: `preview` is the integration + follow/preview line and `main` is the release line; **they carry the same content, so sync is a fast-forward, never a force-push**: `bash tools/sync_main.sh` (dry run: `DRY_RUN=1`). The freeze point is the tag, not the branch. Rationale and the "when to split" rule: `docs/branching.md`.
- **Language (2026-09-29 user decision)**: new documents in `docs/` are written in **English** (a Chinese edition goes to `*.zh.md`); new prose added to an existing document is English too; documents that predate this policy are **grandfathered, never bulk-translated**. Code comments and tool output follow the file's existing language. Enforced by `tools/check_doc_language.py` in `tools/smoke.sh` (self-test: `tools/test_doc_language.py`); rationale in `docs/language-policy.md`.
- 名字照抄原卡；自补内容标「地图自设」；卡里没有的地点不建模（DLC）。
- **内容边界（2026-09-29 用户决定）**：原来「不建模、不描写任何性相关 / 束缚类道具与场所细节」「私密房间一律中性」的硬约束**全部撤销**（理由：不按原卡补全会被原作者投诉）。设施、道具与用途照原卡写、可以建模；房间名照抄卡原名（仍旧不许自编中性名）。历史任务书里的同类句子已作废，见 `docs/archive/README.md`。
- Blender 一律 `tools/blender_run.sh`（等显卡锁、ASCII TMPDIR、崩溃重试一次、只杀自己 PID）；草图 16 spp ~2000 px，定稿 64 spp；改动 <25% 用 `tools/region_patch.py`。
- 渲染任务交给队列 `tools/render_queue.sh submit <draft|final|any> -- <参数>`，不要直接调 `tools/blender_run.sh` 或 `tools/cloud/render.sh`（队列负责派给 Mac 还是云端、避免两台撞车）；云端细节见 `docs/cloud-render.md`。
- **渲染守卫**：新渲染脚本必须经 `tc_common.setup_render_device()`（旧名 `pick_gpu`）配 GPU，不许自己写 `compute_device_type`；没 GPU 默认中止，确需 CPU 才给 `blender_run.sh --allow-cpu`。smoke 与提交端会查；看门狗 / 失败状态见 `docs/cloud-render.md`「渲染守卫」。
- 新地标一律走 `python3 tools/landmark.py new/draft/board/gapcheck/final/ship <id>`（`docs/landmark-pipeline.md`）。
- 全自动推进（2026-09-29 用户指示）：所有层级不再等用户确认或点头；代理产出后自检（对照 `docs/rejected.md` 的否决项/canon 规则），需要看图判断的用 glm-5.3-flash 多模态代理完成；需用户过目的图自动拷贝到 `~/eden-map-review/` 留档，只存档不阻塞流程。
- 不做 iPhone 专项；桌面优先，375 px 只过一遍。
- 测试：改哪测哪——`node --test` + `tools/smoke.sh` 必跑；浏览器测试只跑相关的，批次末再跑全量。
- CI runs node --test + smoke on push; agents only need to run tests relevant to their change locally, then check the CI result with `gh run list --branch preview -L 1`.
- **推送要攒批**：每次推送 = 新提交号。连做多项时每 2–3 项推一次：`bash tools/push_preview.sh --head`（= `git fetch`+rebase → `bump_head.py --push` → 推 preview），**推送后自动增量预热并后台脱离**（只请求本次改动的文件 + 头指针，几秒；日志 `logs/warm_cdn.log`，agent 不用等）。改了 `map/art/` / `map/props/` / `*.dzi` / `*.glb` 时它会自动升级成全量（约 2900 个文件），想显式全量就 `bash tools/push_preview.sh --head --full`，不想预热就 `WARM=0`。手动推的旧流程（`bump_head.py --push` + `bash tools/warm_cdn.sh "$(git rev-parse HEAD^)" 16 --purge-branch preview`）仍可用，但那是全量、会阻塞。
- CHANGELOG 与 logs/*.csv 已设 union 合并，rebase 冲突少；只在末尾追加。
- **Push (2026-09-29)**: the work branch is `preview`; the old name `cloud/tc-mid-low` is kept as a
  compatibility mirror for script URLs that are already out in the wild. Push both with
  `bash tools/push_preview.sh [--head]` — never push only one of them, or old cards freeze.
- 提交：`git -c user.email=kcgoofee-jpg@users.noreply.github.com commit -F msg`，**英文**（用户 2026-09-29：
  提交信息也走英文口径），**不写 `Co-Authored-By` 尾巴**（用户同日的意见）。推送被拦就停下报告。
- 报告：英文、简短（≤10 行），只写结果、测试、需要决定的事；截图路径给出即可。
- 深入资料：`docs/onboarding.md`（全貌）、`docs/render-retro.md`（渲染规则）、`docs/design/depth-system.md`（上层纵深/斜视）。
- **报告格式（用户 2026-09-28）**：写建议 / 清单类文档时每条独立成行；做完的在原文上用 ~~删除线~~ ✅ 划掉（不删、不另起文件），文首一行写状态说明；后续实施的代理负责回去划掉。
- **收尾清理**：交回前停掉自己起的预览服务、后台进程和 Blender（只动自己的 PID）；不往 .claude/launch.json 加长期条目，要加就在收尾时删掉；报告里写一句「已清理」。

## 模块地图（C2 整理后，2026-09-28；P2–P3-C 解耦更新 2026-09-30；先看这里再 grep）

- 宿主脚本（酒馆页里跑，`map/tavern/`）：
  - `eden-map.js` 入口：面板 / 查看器状态机（预加载、休眠、进度）、postMessage 收发（onMsg / post）、当前地点 push、事态 recompute 的调度与副作用（取数与纯计算已下放，见下两条）、自定义与聊天变量的写入、自检、检查更新、悬浮按钮拖动 / 惯用手、启动事件与 cleanup 组装。
  - `mvu-bridge.mjs` 数据流读取（P2 第一步 `785c421`）：mvuStat 快照、getHere 三级回退、refreshVarMap / setVarUser、readVars（A-11）、每楼 stat_data、名册 / 立绘 / 阶段序；**全仓唯一允许直接触碰 Mvu / SillyTavern 全局的模块**（机检：`tests/mvu_bridge.test.mjs` 源码扫描），宿主经 onMvuLoad / onTableUpdate / onRoster 回调接线。
  - `context.mjs` 聊天上下文流水线（P2 第二步 `28d646e`，纯数据进出）：readMsgs 窗口规范化 + (楼层, 原文) 缓存、round（轮次签名 / 事件 / 人物栏 / 名册 / 新事态数）、customTags（⌖ 标签撤销-重放）、computeTrips（行程序列）；宿主只留调度与副作用。
  - `host-routes.mjs` 线路：CDN 线路表、版本推断（VER / tagOf）、baseFor、测速 race；纯计算。
  - `host-lifecycle.mjs` 生命周期：createLife（listen / unlisten / dead / kill）、takeOver 接管旧实例、mount 面板 DOM + 内联样式、install 清理钩子。
  - `host-th.mjs` 酒馆助手适配：cdnFetch / thFn / fnOk / hostFn、设定包命名空间 packNs（LS / lsGet / lsSet）、脚本变量偏好 createPrefs、世界书全自动 createWbAuto（eden-map:th 设置消息也在这）。
  - 纯逻辑（node 单测）：`mvu` 变量读取、`events` 事态、`characters` 人物栏、`trips` 行程、`modes` 注入 / 检查点、`snapshot` 楼层快照、`selfcheck` 自检判定、`wbsync` 世界书合并、`th` 助手接口探测、`adapter` 变量映射、`shujuku` 数据库插件只读、`budget` 本机存储、`follow` 跟随分支、`splash` 开场卡、`compose` 填输入框、`sources` 数据来源、`context` 上下文流水线。
- 核心（查看器与宿主共用，`map/core/`）：`depth.mjs` 纵深数学 + 迷雾探索数据（雾 / 霾唯一实现）；`pack.mjs` 设定包加载（伊甸只在 `map/packs/eden/manifest.json`，schema v1 冻结见 `docs/pack-schema-v1.md`）；`protocol.mjs` 消息表；`storage.mjs` 键登记；`layers.mjs` LayerRegistry 渲染槽位注册表（P3-C `aed4f49`：槽位契约 / 注册注销 / 可见性调度 / 可叠加滤镜链 / `describe()` 摘要，纯核心不碰 DOM / 全局 / 存储）；`roster.mjs` CharacterRosterSystem 五源名册归一（P3-B `a4de0f2`：`RosterRow` 标准行、Provider `rows()` 契约、五来源优先级仲裁合并、别名互认、立绘挂载、`describe()` 摘要）；`clock.mjs` 零 Token 确定性世界时钟（Part 6-5，只由轮数推进）；`routine.mjs` NPC 日程表数学（Part 8-2 从 `map/tavern/routine.mjs` 下沉，宿主侧原样转发）；`walk.mjs` 时钟 tick + 任意维插值行走引擎（`tickClock` 确定性推进、`createWalker` 禁瞬移，减少动态效果一步到位）；`haze.mjs` 空气透视滤镜（`currentHaze` → `LayerRegistry` 滤镜链，Part 8-3）；`stash.mjs` 世界藏物表（Part 5-1）；`stash3d.mjs` 藏物 → 三维落点的纯映射（Part 8-1）。
- 查看器（`map/viewer.html` + `map/app/*`）：`boot` 启动、`pack` 当前包、`fog` 迷雾 DOM 层（也接空气透视滤镜）、`clouds` 云与切层转场、`nav` 切图、`markers` 标记、`depthhaze` 纵深霾 → 图层滤镜链、`settings` 设置页。
- 渲染层补充（Part 9，`map/three/` 仍是纯叶子：THREE 由调用方传进来）：`daynight.mjs`（世界时钟 → 四时段光照 + 烘焙场景调色 + 减弱动效降级）、`particles.mjs` + `shaders.mjs`（`fx` 槽位的雨雪沙 / 以太极光，一种效果 1 次 draw call，关掉即零开销）、`relief.mjs`（法线 / 视差 / 粗糙度浮雕材质，吃 daynight 的光）。微资产 `map/art/relief/`（`tools/make_relief_maps.py` 生成，纯 stdlib、可逐字节复现），烘焙导出 `blender/export_optimized.py`（合并材质 → LOD0/LOD1 → gltf-transform Draco/KTX2 + 体积预算，bpy 惰性 import）。庄园页接线在 `map/estate/main.js`（时钟走既有 `estate:routine`，粒子用 `window.TCthreeFX` / `__estate.fx` 驱动）。
- 渲染依赖：`tools/check_render_deps.py`（`NOT_UPSTREAM` 放窄例外，只写确切路径）。
## Shell 写法（worktree 代理）
- git 命令一条一行单独跑：不用 `&&` 串联、不用 `$(git ...)` 嵌套、不接管道。需要的值先单独跑一条拿到，再写进下一条。否则隔离检查会拒绝，白白多一个来回。
- 等渲染 / 长任务：用 Bash 的 run_in_background 跑 tools/cloud/render.sh 等命令，完成时会自动通知；不要写 sleep / seq 轮询循环（会被中断，反复重开浪费来回）。等待时做别的事。
