# Todo — the single index

Written 2026-09-29 after a full sweep of every non-code file in the repo (293 `.md`, 128 `.json`,
the CI config, the CSVs, the skills). Before that sweep there was **no single todo list**: items were
scattered across roughly 25 documents, and several of them contradicted each other.

**This file is now the index of record.** Detail still lives in the per-area documents; this file says
*what is left*, *where the detail is*, and *who is authoritative* when two documents disagree.

| Area | Document of record |
|---|---|
| Product direction, versions, user decisions | `ROADMAP.md` |
| Session handoff (what the last agent did / left) | `docs/handoff.md` |
| UI refactor backlog (U1–U23) | `docs/ui-refactor-backlog.md` |
| Buildings and 3D models, per marker | `docs/card-buildings.md` |
| Card omissions (what the card has that the map lacks) | `docs/card-omissions.md` |
| Events | `docs/event-taxonomy.md` (counts) + `docs/map-events.md` (implementation) |
| Cloud render | `docs/cloud-render.md` |
| Landmark pipeline (one id → model → glb → ship) | `docs/landmark-pipeline.md` + `docs/landmarks/<id>.checklist.md` |

## How to maintain it

1. Every item below carries its source (`file:line`) and the original wording in quotes, so it stays
   traceable. Do not restate the item in new words — link it.
2. When an item is finished: strike it here (`~~…~~ ✅ <date> <commit>`) and strike it in its source
   document too. A finished item that only disappears here is how the last round of drift started.
3. When a source document contradicts `docs/handoff.md` / `ROADMAP.md` on **status**, the documents
   listed in the table above win; fix the other one instead of keeping both.
4. Do not open a second list. If a sub-area grows, extend this file's section — a second file is how
   the 25-document scatter happened.

Status: `[ ]` not started · `[~]` in progress · `[?]` needs a user decision · `[x]` done (see log)

---

## 1. Code line · 代码开发线（每个待办附预估工时；完成后 ~~删除线~~ ✅ + SHA，明细挪 §5）

- [x] **Full-campaign register (2026-09-30).** The seven-part campaign (real-host browser tests, `eden-map.js`
  decoupling, WebGL perf, living-world FX, TTRPG sandbox, LLM navigator, preset sandbox) is tracked here item by
  item. Landed so far: Part 7-1/7-2 sanitize + preset fields (`2520ac5`), Part 7-4 visibility guard (`2520ac5`),
  Part 2-1 host-about + Part 2-3 listener bus (`7a8ab80`), Part 4-1 weather FX + Part 1-5 offline probe (`dbc992a`),
  Part 6-5 deterministic clock + Part 6-1 API-key gateway base, Part 6-2 background tick, Part 6-3 clue nodes,
  Part 6-4 action injection,
  Part 4-1 weather + Part 4-3 traffic; probes: p4_fx (10/10), p4_traffic (7/7), p1_leak (5/5), p6_action (7/7),
  p6_quests (8/8), p6_tick (8/8). Still open: Part 1-1/1-2 (live SillyTavern automation contract, CDN fallback assertions),
  Part 2-2/2-4 (U1–U12 sweep, dynamic `import()` of the 3D viewer / parts panel), Part 3 (single WebGL context,
  LOD + frustum culling, InstancedMesh, KTX2/Basis budget, OffscreenCanvas workers), Part 4-2/4-4 (X-Ray
  cutaway, Web Audio), Part 7-3 (Shadow DOM isolation).
- [ ] **Real SillyTavern + TavernHelper browser test.** The biggest open item: `tools/browser/`（预估 ~16h）
  currently only has `host_stub.mjs`, a fake host. Everything else in the suite runs against the stub.
  (`docs/handoff.md`, "新顺序" code item 1.)
- [ ] `eden-map.js` 继续拆分 — "按 `spec.md` 走完整重构"（`ROADMAP.md:52`），U1–U12 实测问题同批（`ROADMAP.md:51`）。（预估 ~24h）
- [ ] 移动端窄屏自适应与交互死区抛光（U19–U23，预估 ~6h）：庄园房间 Hover 浮层交互死区（桥接防抖或 Click-to-Pin）、
  设置弹窗顶栏穿模 + Status 文案缺空格、世界图 Marker/Label 碰撞避让、顶栏标题过早截断、升级 Banner 过高。
  （`docs/ui-refactor-backlog.md`「用户手机实测 2026-09-30」节，Log-and-Park 入账）
- [ ] MVU 迷雾 / 结构小任务 — "「不要漏测」"（`ROADMAP.md:47`）。（预估 ~4h）
- [ ] `card-omissions` 遗留：A18/A20 泛称做图层、C2 治安梯度、~~C3 层间视线~~ ✅（2026-09-29 图例说明，`59ecc0f`）、~~C4 天气~~ ✅（2026-09-29 降雨事件·默认关，`59ecc0f`）、C8/C9 卡片与编号解析（预估 ~8h）
  （`docs/card-omissions.md:74,76,106-108,112-113`）；B19 新事件类型「~~转化仪式~~ ✅（`31df154`）/ 临时管控 / 登记年检 / 评级复核」
  （`:282`）。
- [ ] 事件系统后续：城市节律（`docs/event-taxonomy.md:29`）、虚线因果连线（`:43`）、（预估 ~20h）
  「转化仪式直播」（`:89`）；`docs/map-events.md:155-165` 分阶段 2–5（时间轴 / 热区 / 反哺 / 城市自运转）、
  `:179` 下一批（雷达动画 / 连环 / 热力）。
- [ ] `registerOverlay` / `unregisterOverlay` 暂缓未做（`docs/content-compat.md:53`）。（预估 ~3h）
- [ ] `here.mjs` 只能解析 54/55、SYS-01 未接（`docs/eden-lore-space.md:7`）。（预估 ~4h）
- [ ] 创意工坊（`docs/design/workshop.md` 整篇「设计稿，未实施」= `docs/project-design.md` C6）；（预估 ~40h）
  `docs/design/custom-v2.md:174-197` C1–C12 全未做。
- [ ] 纵深 P2（`docs/design/depth-system.md:81`）、meta 接 `make_dzi`（`:84`）。（预估 ~8h）
- [x] ~~`tiancheng_*.py` / `landmarks` 未接 `--cache-blend`，接入后补 bench（`docs/cloud-render.md:135,138`）。~~ ✅ 2026-09-29 全部接入（tiancheng×3 在 `tc.Layer()` 前命中早退；landmarks 31 个 build.py 走 `common.setup()` 的 `C.CACHED`；命中路径补 `pick_gpu` 治 CPU 回落）；本机 draft miss→hit 已验；8K/16K 的 bench 待下次定稿顺带记。
- [ ] 上层真 3D（`docs/project-design.md` C5）。（预估 ~30h）
- [ ] 自动旋转开关进设置页；滚轮＝平移是否改缩放（`docs/handoff.md:9`）。（预估 ~2h）
- [ ] 三维查看器两个观感项：塔楼顶部纯白方块 / 裙楼粉长条（疑材质缺失）、信息按钮 (i) 高亮却不弹面板（预估 ~4h）
  （`docs/handoff.md:69,70`）——**需要看图判定**，本轮未动。
- [ ] CI：`browser-smoke` 仍是 `if: false` 占位（`.github/workflows/ci.yml`）。**已修**：浅克隆不带标签，（预估 ~6h）
  文档语言门控在 CI 里取不到基线会**静默空转**（本地红、CI 绿就是这么来的）——已加「取基线标签 + 取不到就失败」
  一步。`main` 推送仍不触发 CI（`:5`）是**故意**的：main 只是跟随线的快进副本，加进去等于每次推送跑两遍。
- [ ] `tools/reviews/takeover_095/toolchain.md:22` 世界图输入不可复现（⏳未修）、`:24` `ship.sh --dry-run` 三个洞。（预估 ~6h）
- [x] ~~通用化 v1 五条已知限制（`docs/generalize/README.md:123-128`）：世界图 / 庄园剖面 / 天城尺度环 /（预估 ~12h）
  人物名册 / 安保层仍 eden 专用；预算 LRU 只认 `edenMap*`；包的 `strings` 字段未接入；
  `props/viewer3d.html` 语言键退回中文；`viewer.html` 三条 eden 预取。~~ ✅ 2026-09-30 `4833e37` + `0f55514`（明细见 §5；
  世界图 / 庄园剖面 / 天城尺度环三类**地图种类**的通用化仍开放，留待通用化 v2）
- [ ] 气候塔材质细化：塔楼白块、粉长条（看图后定改法）+ 可选「信息按钮」（本会话 2026-09-29 用户反馈；塔在 `blender/tc_estates.py` climate_tower，锚点 `blender/data/tc_islands.json` anchors.climate_tower）。（预估 ~4h）
- [ ] 设置「版权申明」页与人物页声望在真实酒馆浏览器过一眼（现在只有 stub；挂在上面的 Real ST 测试项下）。（预估 ~2h）
- ~~**Streaming / decoupling P0** (`docs/reviews/architecture_and_stream_perf.md` §1.4): G1 strip `<think>` CoT blocks before tag parsing + G6 `fnGuard` & arity tests at cross-window exposure points. (~8h)~~ ✅ 2026-09-30 `040baf9`（G1）+ `04f170f`（G6）
- [ ] **Streaming / decoupling P2–P3** (same report Part 2): ~~P1（G3 wake broadcast + G2 hidden-poll gating，~4h）~~ ✅ 2026-09-30 `643e087`；~~extract MVUBridge → ContextInteractionSystem (P2 ~28h)~~ ✅ 2026-09-30 `785c421`（MVUBridge，Mvu / SillyTavern 全局唯一属主）+ `28d646e`（ContextPipeline 纯流水线）；~~P3-A 轻量契约：DepthSystem summary + Estate3D manifest（~12h）~~ ✅ 2026-09-30 `709c1c9`（DepthSystem describe + 迷雾存储键收口）+ `43c053a`（Estate3D Manifest 契约与查看器解耦）；~~CharacterRosterSystem 多源名册统一抽象（~12h）~~ ✅ 2026-09-30 `a4de0f2`（core/roster.mjs 统一 rows() 契约）+ `5ce27d3`（桥与宿主接线）；~~LayerRegistry 渲染槽位与滤镜系统（P3 剩余 ~20h）~~ ✅ 2026-09-30 `aed4f49`（core/layers.mjs 槽位契约纯核心）+ `92a9bda`（viewer z 阶梯收拢 + 槽位挂载骨架）+ `910bd6e`（fog / clouds / routes / trips / events / security 全量迁移 + #layList 数据驱动）。
- [x] ~~**De-speculation leftovers**: hedged wording at `docs/card-digest.md:387,389`, `docs/upper-setting.md:278`; worldbook ship-JSON standard-interface reservation (top-level schema + category map) in `tools/build_worldbook_addon.py`.~~ ✅ 2026-09-29 `f6ef639`（明细见 §5）
- [x] ~~架构看门狗（Lint Rules for Architecture）：map/core/ 单文件 >400 行预警、禁止反向 import 宿主层、裸 z-index 字面量持续机检拦截（接入 tools/smoke.sh）。~~（预估 ~2h）✅ 2026-09-30 `6fc66a7`（明细见 §5）
- [x] ~~会话录制回放（Session Replay Fixtures）：mvu-bridge.mjs 与 context 纯流水线支持导出聊天快照为 JSON，脱离浏览器实现毫秒级端到端回放测试。（预估 ~4h）~~ ✅ 2026-09-29 `5958f75` + `788be44`（明细见 §5）


## 2. Render line · 渲染生产线（每个待办附预估工时）

- [x] 上层整图重渲（2026-09-29，`34e5fd0`）：9 岛全入画 8000×5000 双版（plain / city 底）+ 五座庄园抠图贴合 + 气候塔锚点入画（`map/art/tc_upper*_full.png`、`blender/data/tc_islands.json`、`tools/isles_into_upper.py`），DZI/瓦片重建。逐岛精修与 v18 取舍仍开放（见下条与 §4）。
- [ ] 上层 v18 逐岛建模 → 定稿（`docs/handoff.md:8,14,87`）。**WIP 已存档**：（预估 ~60h）
  tag `archive/upper-v18`（`08597bed`，7 个岛脚本 ~1400 行改动 + academy/kelly 审图板），
  主线与之分叉 575 个提交 → 需决定「按新主线重做」还是「摘取其中仍有效的部分」。
- [ ] 原域悬浮圣山精修两点：大教堂背面白色凸出方块、雕像圈个别雕像悬出平台（`docs/handoff.md:100`）——（预估 ~6h）
  模型已收口（`map/props/holy_mountain/`），这两点是外观精修。
- [x] 大骑士领·圣都（`docs/handoff.md:15`）**已 ship 三处**：`glory_crown`（荣光冠冕，核心区，
  glb 0.68/0.28 MB，挂核心区 5 个标记）、`ether_dome`（以太穹顶，仓库自设并标 `repo-inferred`、
  写进世界书附加条目，0.43/0.16 MB）、`contest_corridor`（竞赛与狂欢回廊，卡里中环，0.44/0.16 MB）。
  **剩 5 个标记**：`rust_outskirts`（外环铁锈与落败领）、`clearing_depot`、`free_knight_camp`、
  `linguang_post`、`arms_rnd`；圣都之外还有五席封地与旷野高地的点位。
- [ ] 地下室 B1/B2 精修 + 道具包接口（`docs/handoff.md:18`）。（预估 ~16h）
- [ ] 下层 4 处（`docs/handoff.md:20`、`:89` 待批）；上层 16K / 512spp、昼夜四版（`:20`）。（预估 ~40h）
- [ ] 中/下层 8K 定稿复核、七岛并入重渲、精英学院草稿、多时段底图挑档（`ROADMAP.md:55-58`）。（预估 ~16h）
- [ ] P2 机构三维化未打勾（`ROADMAP.md:61`）：最高法院 / 大学 / 执政厅…（预估 ~20h）
- [ ] P4 各地点全景 + 深度图 → three.js 视差背景层（`ROADMAP.md:45`）。（预估 ~24h）
- [ ] 伊甸剖切等轴瓦片多边形导出；中层影子模糊等真实感细节（`ROADMAP.md:63,64`）。（预估 ~8h）
- [ ] `card-buildings` P3 里模型列为「—」的行（圣都与五席的大批点位）。（预估 ~20h）
- [ ] `league_club` / `rothschild_estate` / `elite_academy`：glb 已导出但**未走两人设评审**（预估 ~4h）
  （`docs/card-buildings.md:95,98,99`）。
- [ ] A28–A31 落点或登记（`docs/card-omissions.md:269-271`）。（预估 ~3h）
- [x] ~~**Mid-layer day/night DZI**: `map/art/tc_mid_{day,night}_full.png` rendered (2026-09-29/30, queue idle); `maps.json` still references only `art/tc_mid.dzi` — run `tools/make_dzi.py` and register when the multi-period base-map choice lands (`ROADMAP.md:55-58`). (~3h)~~ ✅ 2026-09-29 `9ad6dfc`（明细见 §5）


## 3. Repo / document line (found by this sweep)

- [x] ~~**Fix the outdated statements** (they contradict the 2026-09-29 baseline):~~ ✅ 2026-09-29 `cf35c28`（ROADMAP / onboarding / project-design / tt-test-checklist 本批改齐；其余各处核实在此前批次已修好——`docs/map-events.md` 与 `docs/event-taxonomy.md` 的 10 类 85 种与 DLC 划线、`docs/tooling.md` 输出目录、`docs/content-compat.md:57`、`docs/ui-refactor-backlog.md` U1–U12 复核注、`docs/design/depth-system.md` P3 划线、`docs/design/ui-v2/spec.md` 与 `docs/landmarks/starabyss_univ.checklist.md` 状态行、`docs/drafts/upper_v16_checklist.md` 作废头，本批逐一核验无误）：

  `ROADMAP.md:12,18,23,25,80`（写 0.9.5 / 「未发版」）, `docs/onboarding.md:10,11,43`（`main` 旧、勿用）,
  `docs/project-design.md:3,11,22,67,104`（未开始实施 / 一键管线待建 / 标签只到 0.9.5 / 编码 0280）,
  `docs/content-compat.md:57`, `docs/tt-test-checklist.md:1`, `docs/tooling.md:62`（输出目录仍写 `~/Downloads/酒馆/预览`）,
  `docs/map-events.md:35,67`（9 类 82 种 → 实为 10 类 85 种）, `docs/map-events.md:49` vs `:57`（人物标签上限 8 vs 5）,
  `docs/event-taxonomy.md:71-80`（上层地标含已下线为 DLC 的 `general_residence`/`aether_institute`）,
  `docs/ui-refactor-backlog.md:51`（U1–U12 仍列 [ ]）、`docs/design/depth-system.md:82`（P3 列为待做）,
  `docs/design/ui-v2/spec.md:1`（「草案，待用户确认」但 `impl/` 已实现）,
  `docs/landmarks/starabyss_univ.checklist.md:1`（写「下一步 draft」但 glb 已导出、r1 已评审）,
  `docs/drafts/upper_v16_checklist.md:1`（等用户点头，已被顶层 `docs/upper-islands-checklist.md` 取代）,
  ~~`map/data/worldbook_addon.json:3-4`（`0.9.5-dev`）~~ ✅ 2026-09-29 现为 `0.9.6-dev`（builder v16 重出，`34e5fd0`）。
- [x] ~~**Fix the conflicting-content constraints**（撤销留下的旧话）：~~ ✅ 2026-09-29 核实（此前批次已修好，本批逐处验证）：`docs/eden-lore-space.md:4,5`、`docs/eden-estate.md:20,105` 均已划线改「按原卡补全 / 照抄卡原名」，:320,500 的自编中性名按 v0.9.7 更正退役（`附属室*` 仅存为 `eden_estate_rooms.json` 的兼容别名）；`docs/card-omissions.md:51,337-338` 已带 2026-09-29 校订注；`docs/history/CLOUD_TASK{,2,3,5,7}.md` 五份头部均已有作废批注（与 CLOUD_TASK8 一致）：
  `docs/eden-lore-space.md:4,5`、`docs/eden-estate.md:105`（仍写「只写名字、不描述、不画家具」）、
  `docs/card-omissions.md:51,337-338`、`docs/history/CLOUD_TASK{,2,3,5,7}.md`（5 份**未加**作废批注，
  只有 `CLOUD_TASK8.md:3` 加了）。`docs/eden-estate.md:320,500` 的自编中性名「私人房间 A」「附属用房」
  与 `docs/card-digest.md:6`「照抄卡原名」冲突。
- [x] ~~**Fix the internal self-contradiction**：~~ ✅ 2026-09-29 核实：`docs/card-omissions.md` ◐ 清单已带「2026-09-29 校订」注，与 ：332,334,340 的 ✅ 对齐：`docs/card-omissions.md:336` 的 ◐ 清单仍含
  E1/E16/B11/C1/C6/C10/C15，而同文 `:332,334,340` 已标 ✅。
- [x] ~~**Reconcile the island generator path**：~~ ✅ 2026-09-29 核实：现行生成器是 `blender/islands/<id>.py`（v17 起，`docs/upper-islands-checklist.md:5`）；`docs/upper-islands-references.md:4` 已注明 `blender/upper_islands/` 是 v16 草稿体块集、保留作过程记录；`tools/check_render_deps.py:12-13` 两者都列（都进 tc_upper 依赖集）：`docs/upper-islands-checklist.md:3`（`blender/islands/`）
  vs `docs/upper-islands-references.md:4`（`blender/upper_islands/`）——两个目录都存在，需确认现行者。
- [x] ~~**Fix dead references**（verified missing）：~~ ✅ 2026-09-29 核实（此前批次已在原位加注，本批验证）：`docs/render-retro.md:172`（asset-deps→render-deps）、`:175`（gpu_lock.sh 提案名并入 blender_run.sh）、`:177`（check_glb.py 提案名未建）、`docs/ui-audit.md:14`（tools/legacy/）、`docs/design/custom-v2.md`（custom.js→custom.mjs 校订注）、`docs/rejected.md:12` 与 `docs/reports/token-usage.md:59,64`（历史提案名批注）、`.gitignore` 的 fetch_textures.sh 注释（`cf35c28` 本批补注）：
  ~~`map/estate3d/`（`README.md` 0.10 段、`ROADMAP.md:28`）~~ ✅ 2026-09-29：`README.md:59` 已改为真实路径 `map/estate/`（该目录从来不存在；`ROADMAP.md:28` 原本就写的对）, `docs/asset-deps.md` → `docs/render-deps.md`
  （`docs/render-retro.md:172`）, `tools/gpu_lock.sh`（`:175`）, `tools/check_glb.py`（`:177`, 提案项）,
  `tools/add_script_to_card.py` → `tools/legacy/`（`docs/ui-audit.md:14`）, `map/custom.js` → `map/custom.mjs`
  （`docs/design/custom-v2.md:4,13`）, `map/core/fog.mjs` → 已并入 `map/core/depth.mjs`（历史标注）,
  `tools/fetch_textures.sh`（`.gitignore:19-20` 注释引用，脚本不存在）,
  ~~`docs/tech-compat-no-moderation`（`skills/card-map/guides/nsfw.md:3` 引用，不存在）~~ ✅ 2026-09-29 文内已加「在本仓库不存在」批注,
  `card-only-scope-dlc.md`（`docs/rejected.md:12`、`docs/reports/token-usage.md:64`）,
  `model-and-budget-policy.md`（`docs/reports/token-usage.md:59`）。
- [x] ~~**Fix `docs/reports/token-usage.md:63,64`**：~~ ✅ 2026-09-29 核实：两行已划线并注「已落地 / 已上线」修正：仍写渲染队列与地标流程「规划中」，两者都已上线。
- [x] ~~`.gitignore` 清理：~~ ✅ 2026-09-29 `cf35c28` 核实：`.pi/` 与 `map/art/tc_upper_8k.png` 的重复规则已被此前批次清掉（`uniq -d` 零重复），`.ruff_cache/` 已在；本批给 `tools/fetch_textures.sh` 悬空注释补了说明。`logs/render_times.csv` 保持跟踪不动：`.pi/`（`:7` 与 `:43`）、`map/art/tc_upper_8k.png`（`:11` 与 `:14`）各重复一次；
  新增 `.ruff_cache/`。（`logs/render_times.csv` 被跟踪且在 `logs/` 忽略之下是**故意的**——
  union 合并驱动要用它，不要 `git rm --cached`。）
- [ ] **重资产账**（已入库，占比大）：
  `docs/drafts/` **169 MB / 474 个已跟踪文件**（迭代中间草图，`docs/reviews/takeover_095/toolchain.md:11` 已点名）、
  `docs/reviews/` **61 MB**（一次性门控记录 + 过程截图；代理初估 10.7 MB 是按目录清单算的，`du` 实测 61 MB）、
  `map/shots/*.png` ≈5.6 MB。
  迁出主仓要重写历史 → **待决定**（见 §4）。
- [ ] **历史里的垃圾 blob ≈63 MB**：`map/art/.tc_low_day_full.png.iCUfRJ`（40 MB）与
  `.tc_mid_night_full.png.1V2n4g`（22.8 MB）——`git add -A` 误提交的 rsync 传输临时文件。
  回收要重写历史（C4 做过一次）。**注意**：`.gitignore` 的 `map/art/.*` 只挡以后的，历史里那两份要重写才掉。
- [ ] **本机可清 ≈1.9 GB 未入库产物**（重下 / 重渲有成本，留待决定）：`blender/data/real3d/raw`（1.1 GB，可 `fetch` 重下）、
  `blender/data/osm/raw`（286 MB，可重下）、`blender/world/out`（143 MB，成品已进
  `map/props/holy_mountain/`）、`map/art/*_full.png`（348 MB 渲染源图，瓦片已入库）。
  ~~`.cache/`（≈290 MB 中间物，含 `hm_*` 12 个档位 ≈191 MB）~~ ✅ 2026-09-30 死缓存已清 **753 MB**（.cache 854→101 MB）：
  `.cache/attic`（529 MB 重写前血线 bundle——§5 分支收拢时预留的「确认后可删」成立，独有内容在远端标签 `archive/upper-v18`）、
  `.cache/glb`（191 MB 圣山 glb 构建中间物，零引用）、`.cache/lm_cath`（32 MB）、`.cache/audit_v15`、
  `.cache/blend/cache_probe_*`、`__pycache__`×3、`.ruff_cache`；`.cache/blend`（97 MB 键控条目）是渲染队列活缓存
  （`--cache-blend`）**保留**，`.cache/card*`（4 MB）用户卡数据**保留**。同批新增 `tools/check_tree_hygiene.py`
  树卫生看门狗接入 smoke（未跟踪且未忽略的文件 >10 MB 拦截，防 `git add -A` 再把临时物扫进仓库）。**须留**：`blender/data/{estate2,props,landmarks}`。
- [ ] 重复资产：`kiara_8_sunset_2k.hdr` 在 `blender/data/estate2/hdri/` 与 `landmarks/hdri/` 各一份（≈6 MB）；
  `props/tex/marble_01/` 与 `landmarks/tex/marble_01/` 疑似同源。
- [ ] `.cache/card/` 与 `.cache/card_orig/` 的 `ccv3.json`+`chara.json` 各两份（用户角色卡，非仓库内容）。
- [ ] 未跟踪但应处理的产物：`docs/drafts/props_u12_/`（浏览器测试截图，判断入库还是删）、
  `docs/drafts/landmark_glory_crown_draft_c1.jpg`（在建模型的草稿，随流水线走）。

- [x] **Render-queue bookkeeping (fixed 2026-09-29)**: `run_job_mac` / `run_job_cloud` moved every job to
  `done` regardless of exit code, so a job blocked by the per-instance lock (`render.sh` exit 3) was filed
  as success while its log stayed behind in `running/` — that is where "job is done but has no log" came
  from, and why some 8K renders only appeared after a re-queue. Now: only `rc=0` goes to `done`; `rc=3`
  returns to `pending` and retries without counting as failure (cap `RETRY_BUSY_MAX`, default 90);
  other failures retry `MAX_RETRY` times then land in `done` with a `.failed` marker; `.log`/`.rc` move with
  the job. Plus an artifact check: **`rc=0` with a missing `--out` file counts as failure** — the safety net
  for "cloud said ok but wrote nothing". 34 orphan logs were swept out of `running/` into `logs/queue/attic/`.
- [x] **Absolute / unsynced `--out` (2026-09-29 accident, now gated)**: `tools/landmark.py draft` rendered to
  an absolute `docs/drafts/…` path, but `tools/cloud/sync.sh` has `--exclude docs/` and a cloud worker has no
  `/Users/…`. A draft job dispatched to the cloud therefore wrote nothing, the result rsync failed with
  `link_stat … failed`, and the watchdog still recorded `status=ok`. Fixed: drafts render to a repo-relative
  path inside a synced dir (`map/art/_lm_<id>_<cam>.jpg`) and are collected into `docs/drafts/` afterwards;
  `tools/render_preflight.py` now rejects both an absolute `--out` and an `--out` under `docs/`.
- [x] **Work branch renamed to `preview`** (was `cloud/tc-mid-low`), with the old name kept as a
  compatibility mirror because already-imported follow scripts carry it in their URL; both refs go out
  together via `tools/push_preview.sh [--head]`.
- [x] **Commit style**: messages are English and no longer carry a `Co-Authored-By` trailer (user decision
  2026-09-29), recorded in `docs/agent-brief.md` and `docs/language-policy.md`.
- [x] **`need_sync` was blind to new files (2026-09-29)**: it listed files with `git ls-files` only, so an
  uncommitted new script (`blender/landmarks/<id>/build.py`, a fresh manifest) never triggered a cloud sync
  and the cloud rendered the *previous* version. Fixed by adding `--others --exclude-standard`.
- [x] **Direct cloud renders never synced (2026-09-29)**: the queue's `run_job_cloud` did `need_sync`, but
  `landmark.py final --cloud` calls `tools/cloud/render.sh` directly — so the cloud kept rendering from the
  copy it had (the whole first Ether Dome final, three cams, was spent on the old script). `render.sh` now
  runs the same check-and-sync before dispatching.
- [x] **Instance lock could wedge forever (2026-09-29)**: the lock stored a PID and treated a live PID as a
  live job, but macOS recycles PIDs — a stale lock whose number was reused blocked every cloud dispatch and,
  with the old bookkeeping, the jobs quietly became `done`. Now the holder must still be a cloud script
  (`ps -o command=`) and the lock has a TTL (`CLOUD_LOCK_TTL`, default 3 h).
- [x] **Dispatcher is now a launchd agent** (`tools/install_renderqueue_agent.sh`, `ai.edenmap.renderqueue`,
  KeepAlive): a `nohup … &` dispatcher dies with the session that started it, which is why the cloud kept
  going idle. The singleton lock keeps KeepAlive from ever producing two dispatchers.

## 4. Needs a user decision

- [?] 正式发布 / npm 发布（`ROADMAP.md:23,80`，等与卡作者谈妥）。
- [?] 用户在 TT 完整实测 v0.9.1–v0.9.6；七岛草稿定稿（`ROADMAP.md:67,68`）。
- [?] Q7 医疗室是否读卡名 / Q8 成人向字样 / Q9 圆桌席位 / Q10 附加条目两条（`ROADMAP.md:69-72`）。
- [?] 与卡作者统一 MVU 结构；肖像廊与 CG 联动（`ROADMAP.md:78,79`）。
- [?] 0.11 历史时间线、角色位置板、房间状态；1.0 通用化 skill / 教程（`ROADMAP.md:59,60`）。
- [?] 下层 4 处是否开工（`docs/handoff.md:88,89`）；DLC 预备（将军官邸、以太研究院，`docs/card-buildings.md:140-141`）。
- [?] 发版前 5 分钟实测清单待写（`docs/handoff.md:79`）。
- [?] 上层设定稿待批：海拔表（`docs/upper-setting.md:73-74`）、§7 Q1–Q8（`:531-545`）、§10 v3 新问题（`:654-659`）。
- [?] 测试件（私人公务机、汽水罐小屋）用户已暂停（`ROADMAP.md:62`）。
- [?] `docs/drafts/` 158 MB 是否迁出主仓 + 是否重写历史回收 63 MB 垃圾 blob（见 §3）。
- [?] `archive/upper-v18` 的 v18 岛脚本：重做还是摘取（见 §2）。
- [?] 上层景深（`map/data/upper_depth.json`，原 --haze）要动多大：先看塔入画后的两张 8K（tc_upper_full / tc_upper_city_full）再定改法与重渲范围（本会话 2026-09-29 用户提出，量级未定；✅ 2026-09-29 两张 8K 已出库、塔锚点已入画，见 §2 整图重渲条）。
- [?] 私有 API Key 驱动任务 / LLM 领航员：利用 ContextPipeline 纯计算管道接入用户独立大模型 API，根据上下文动态生成事态、标记与冒险任务。
- [?] 通用卡包标准（Pack Engine）：将 Eden 特有资产彻底降级为 map/packs/eden/（Pack 0），内核转为通用渲染与协议宿主。

## 5. Done, kept as evidence (2026-09-29)

- [x] Pack 0 抽离与通用化 v1 五条已知限制收口 ✅ 2026-09-30 `4833e37`（存储键）+ `0f55514`（数据驱动化 / Pack 0 规范）：**存储键解耦**——包命名空间（非 eden 包 `tcp.<id>.*`、eden 原样 `edenMap*`）空键降级回读 `edenMap*` 历史档（只读不写回，一写即以本包为准），`core/storage.mjs` get、viewer 首帧 TCStore 镜像、宿主 `packNs()` lsGet 三处同一规则（`tests/pack.test.mjs` 别名回退 + 多包隔离 + 预算 LRU 不越界机检）；**启动预取数据驱动**——新清单字段 `preload`，`viewer.html` 不再写死 eden 的清单 + 三份数据预取（宿主注入 `__tcPack` 时首帧同步注入、单独打开经 `__manifestP` 清单一到即注入，`app/pack.mjs` 复用同一次请求；世界底图预取按「包有没有世界图」gating）；**安保层**挂 `data.security`（`security.mjs` 走 `packData('security')`）；**保底名册**从 `tavern/mvu.mjs` 抽到 `map/data/fallback_roster.json` 挂 `data.roster`（宿主载入后 `MVUBridge.setFallbackMembers` 注入、`mvu.rosters()` 改参数收，引擎不再认识任何卡内人名）；**strings** 接入查看器 i18n 与三维子页（{ i18n 键: 文案 }、英文变体「键@en」），`props/viewer3d.html` 本机读写全部走包前缀（`nsKey` + 注入 `window.__packId` / `__packStrings`），非 eden 包不再退回中文；**看门狗第 4 道防线**——`check_architecture.py` 拦截 `map/core/` 出现卡片专有名词，`check_pack.py` 校验 preload 路径。schema v1 只加可选字段（`preload` / `data.security` / `data.roster`）。世界图 / 庄园剖面 / 天城尺度环三类地图种类的通用化留待 v2。测试：node --test 286 项全绿、smoke 全过、浏览器探针 accept（首屏 462ms）与 props_u12 全过。同批 U19–U23 手机实测缺陷按 Log-and-Park 入册 `docs/ui-refactor-backlog.md`（`84b61f1`，只登记未修）。
- [x] 中层昼夜底图 DZI 上线 + 多时段自动换图 ✅ 2026-09-29 `9ad6dfc`：`tools/make_dzi.py` 把 `map/art/tc_mid_day_full.png` / `tc_mid_night_full.png`（各 8000×5000）切成 `map/art/tc_mid_day` / `tc_mid_night` 两座金字塔（各 14 层 226 张 jpg，`--verify` + `--extent-m 3000 1875` 通过）。`maps.json` 的 tc_mid 注册 `periods: { day, night }`（schema `maps.schema.json` 新增 `periods` 定义，键限 dawn/day/dusk/night，值限 .dzi；`tools/check_maps.py` 对各档底图与瓦片目录做存在性检查）。查看器接线：`app/nav.mjs` `baseOf()` 按有效时段档位（`map/custom.mjs` 新暴露的 `todNow()`，关掉「时段色调」开关即恒用 base）取 `periods` 档位图，新增 `applyPeriod()`——`app/host.mjs` 收到 `eden-map:clock` 后调用，正在看的地图档位变了就 `swapBase()` 原地换第 0 层瓦片源（视角 / 标记 / 叠加层不动，与 alt 开关同一机制）；已配昼 / 夜档的层不再叠 nighttint 色调（免双重变暗，dawn / dusk 仍叠色）。设置项文案改「按时段给上层、中层加色调与昼夜底图」（zh/en）。`docs/tiancheng-maps.md` 与 maps.json `_note` 补 periods 字段说明。独立打开地图 / 读不到世界时间时行为与旧版完全一致（用 base）。测试：node --test 285 项全绿；`check_maps.py` 50 图 0 错 0 警。
- [x] todo §3 文档仓库线平账 ✅ 2026-09-29 `cf35c28` + 本条：过时陈述（ROADMAP / onboarding / project-design / tt-test-checklist 改齐 0.9.7，一键管线改「已上线」）；其余 §3 条目（冲突措辞撤销 / CLOUD_TASK 作废头 / card-omissions 自相矛盾 / 岛生成器路径 / 死链注解 / token-usage 规划中 / .gitignore 重复规则）经逐处核实均已在此前批次修好，本次只划账并留验证结论；`.gitignore` 的 `tools/fetch_textures.sh` 悬空注释本批补注。§3 剩余未勾项只有需要重写历史或用户决定的重资产 / 垃圾 blob / 本机清理类（维持原状）。

- [x] 会话录制回放框架（Session Replay Fixtures）✅ 2026-09-29 `5958f75` + `788be44`：`map/tavern/context.mjs` 立纯数据快照契约——`SNAPSHOT_VERSION = 1` + `exportSessionSnapshot()`（收宿主原始楼层或已规范化楼层 + MVU 状态 → 标准 SessionSnapshot JSON：`{ version, meta, mvu: { stat, vars, floors? }, messages: [{ floor, role, text, raw?, original? }], state?: { tag? } }`，text 恰为 parseText(raw)、raw 保留 JSONPatch 用完整原文、original 留「正文优化」改写前原文）、`validateSessionSnapshot()` 体检（只报告不抛）、`perFloorStatOf()`（每楼变量表 → computeTrips 回放回调）、`ContextPipeline.fromSnapshot()` 静态回放（messages 走与实况同一条 readMsgs 规范化路径：补丢标签 → 剥 EJS → 指纹缓存；⌖ 标签状态机可整块恢复；畸形快照降级不抛——坏楼跳过并记账 degraded，未知版本 / mvu 段损坏放行消息回放）；`map/tavern/mvu-bridge.mjs` 新增只读 `dumpState({ floors? })`（最新楼 stat + 聊天变量 + 可选每楼 stat_data，不写状态、不作废快照缓存，录制零改变正常游戏模式逻辑）。夹具 `tests/fixtures/sessions/session_a.json`（多人物对话 + ⌖火灾/⌖人物/⌖地点标签 + CoT 包裹楼 + 每楼变量表）与 `session_b.json`（⌖改名/⌖用途 + 标签状态机快照），全脱敏合成数据。新增 `tests/session_replay.test.mjs` 7 项（夹具契约 text === parseText(raw)、两次独立回放事件/人物/行程逐项一致 = 确定性、标签状态恢复后 customTags 零重复应用、畸形快照容错降级、dumpState + export → fromSnapshot 端到端往返、纯度机检：裸 node 无 window / Mvu / SillyTavern 全程跑通）。

- [x] 去推测化收尾与世界书发布接口预留 ✅ 2026-09-29 `f6ef639`：`docs/card-digest.md:387,389`（状态栏删除按钮直写 MVU / 开局菜单 setChatMessage 切 swipe）与 `docs/upper-setting.md:278`（维克多庄园遗产去向）的推测性措辞收敛为已确立口径——卡内脚本只记事实，地图侧落到既定处理（聊天记录唯一真相 + 4 秒指纹轮询，不依赖卡片侧伴随事件）；庄园去向标「地图自设」。`tools/build_worldbook_addon.py` --ship 发布件预留标准扩展接口：顶层 `schema: 1` 格式版本标记 + `category` 条目类别映射字典（rules / events / places / characters / lore，未登记编号回退 other），消费端 wbsync.mjs 只读 ver / aliases / entries 不受影响；`map/data/worldbook_addon.json` 重出对齐（entries 零变化，ver 指纹不变）。
- [x] 版本分支切换 + 镜像解绑 ✅ 2026-09-30 `a16a1b8`：设置「更新与版本」新增 main / preview 下拉（会话内切换重载脚本）；`push_preview.sh` 默认只推 `preview`，`cloud/tc-mid-low` 仅 LEGACY=1 宽限期移动，退役计划 `docs/branching.md`。
- [x] 通用角色卡清洗工具 ✅ 2026-09-30 `0e8f1d8`：`tools/clean_card.py`（chara_card_v3 容错解析 / 载荷不透明 / `verify_preserved` 零丢失对账 / PNG 只换 ccv3+chara 块）+ `tests/test_clean_card.py` 15 项（全中性占位符）接入 smoke。
- [x] 测试语义化更名 ✅ 2026-09-30 `58d1281`：adapter / budget / card_spec / custom_names / character_details / roster / trips 七件去版本号；`docs/design/custom-v2.md` 活引用同步；CHANGELOG 历史条目按当时名字保留；`tools/` 与 `blender/` 下 `__pycache__` 清场。
- [x] 流式性能与六大子系统解耦报告 ✅ 2026-09-30 `1eb1694`：`docs/reviews/architecture_and_stream_perf.md`（后台假死根因 = 隐藏标签页定时器钳制 + rAF 挂起；G1–G6 修补清单；LayerRegistry 等解耦 RFC；P0–P3 已登记 §1）。
- [x] 中层昼夜 8000px 底图 ✅ 2026-09-29–30（渲染产物：`map/art/tc_mid_day_full.png` / `tc_mid_night_full.png` 本机留档，Finder 已交付；瓦片未入库，待多时段底图挑档后 make_dzi，见 §2）。
- [x] 流式修补第一批 P0 ✅ 2026-09-30 `040baf9` + `04f170f`：G1 `<think>` 剥离进纯函数 `map/tavern/msgtext.mjs`（raw 不动；events 测试加 CoT fixture）；G6 `fnGuard` + `EDEN_API` 机读契约 + 暴露面守卫（跨窗口调用点全覆盖），新增 `tests/edenapi.test.mjs`。
- [x] 流式修补第一批 P1 ✅ 2026-09-30 `643e087`：G2 后台标签页轮询静默（`pdoc.hidden` 早退，`wake()` 无损补算）；G3 切回前台广播 `eden-map:wake`，查看器醒着也响应（`markHere` 重画当前地点标记）。
- [x] 解耦 P2 第一步 MVUBridge ✅ 2026-09-30 `785c421`：数据流读取收进 `map/tavern/mvu-bridge.mjs`（mvuStat 微任务快照、getHere 三级回退、refreshVarMap / setVarUser、readVars A-11 本机回退、每楼变量、名册 / 立绘 / 阶段序）——全仓唯一允许直接碰 Mvu / SillyTavern 全局的模块，宿主经 onMvuLoad / onTableUpdate / onRoster 回调接线；`tests/mvu_bridge.test.mjs`（stub 全局全覆盖 + 源码扫描机检隔离契约）。
- [x] 解耦 P2 第二步 ContextPipeline ✅ 2026-09-30 `28d646e`：readMsgs 窗口规范化 + (楼层, 原文) 缓存、recompute 的纯计算半（轮次签名去重 / 事件收集 / 人物栏 / 名册 / 新事态数）、customTags 撤销-重放状态机、computeTrips 行程序列收进 `map/tavern/context.mjs`（纯数据进出：不碰全局 / DOM / 消息，宿主只留调度与副作用），新增 `tests/context.test.mjs` 无浏览器全覆盖。
- [x] 解耦 P3-A 第一批（轻量契约与接口收口）✅ 2026-09-30 `709c1c9` + `43c053a`：**DepthSystem**（`709c1c9`）`map/core/depth.mjs` 新增标准化摘要 `describe()`（`{ maxDepth, currentHaze, exploredRatio, fogEnabled }`，纯函数不碰 DOM / 存储机检），迷雾存储键收口 `core/storage.mjs` 单一定义点（`FOG_KEY` / `FOG_LOCAL_KEY`），`app/fog.mjs` 直连存储适配器（未动过开关时「默认开」按登记 def '1' 生效，修复镜像不套默认值的旧账）；**Estate3D**（`43c053a`）新纯模块 `map/core/estate3d.mjs` 立三维资产清单标准契约（`{ id, glb, floors, hotspots, budget, license }` + `describe()` 六键摘要 + low 档回落 std 兜底），庄园 `model/manifest.json` 升级契约格式（分部件 glb / data 路径 / budget / license），`estate/main.js` 与 `props/viewer3d.html` 不再写死或拼装模型地址（`estate:resume` 暂停恢复链路不动）；新增 `tests/depth_system.test.mjs`、`tests/estate3d_manifest.test.mjs`（庄园 + 36 地标清单账实对拍）。
- [x] 解耦 P3-B 第二批（CharacterRosterSystem 多源名册统一抽象）✅ 2026-09-30 `a4de0f2` + `5ce27d3`：新纯模块 `map/core/roster.mjs` 立统一名册契约——标准数据行 `RosterRow { name, displayName?, role?, location?, status?, tags?, source, present?, raw? }`、统一 Provider 接口 `provider.rows(ctx)`、五来源纳管与优先级仲裁（`'mvu'` MVU 变量名册 > `'chat'` 聊天 ⌖人物 标签 > `'table-db'` 表格数据库插件 > `'fallback'` 卡片保底名册 > `'baibai'` 柏宝绘外貌库）：同名（含别名 displayName 互认）合一行，字段级高优先级非空值胜出、空值让位、tags 并集、raw 浅合并（高者胜）；`attachPortraits(map)` 立绘 / CG 按标准姓名（含别名）挂载（挂不上的安静跳过），`describe(): { total, activeCount, sourceCounts, unmappedPortraits }` 标准摘要（纯模块不碰 DOM / 全局 / 存储，机检）。接线（`5ce27d3`）：桥 `mvu-bridge.mjs` 构造即注册 mvu / table-db / fallback 三来源并暴露 `rosterRows / rosterNames / rosterSummary`，`portraitsFor()` 同步 `attachPortraits`；宿主 `eden-map.js` 注册 chat（流水线消息窗口的 ⌖人物 标签）与 baibai（按需加载）两来源，人物栏 known 短名对齐名单改由装配系统统一输出（原 flatMap 临时拼装移除）；发给查看器的 `eden-map:chars` 载荷形状不变（rosters 三表仍出自桥 `rosters()`，完全向后兼容），无数据场景 16 人保底展示照旧。新增 `tests/character_roster.test.mjs` 11 项（五来源适配 / 优先级合并 / 别名互认 / 立绘容错 / 畸形数据降级 / 桥接线 stub 全覆盖）。
- [x] 解耦 P3-C 终局（LayerRegistry 渲染槽位与滤镜系统，报告 §6）✅ 2026-09-30 `aed4f49` + `92a9bda` + `910bd6e`：**阶段 1**（`aed4f49`）新纯模块 `map/core/layers.mjs` 立槽位数据契约——SLOTS 由底至顶 `base → depth-haze → fog → routes → trips → events → markers → labels → fx → interaction`（外层固定 UI 严禁入槽），`LayerRegistry` 提供注册 / 注销（重复 id、未知槽位、未知 kind 全拦截）、槽位序 → order 微调 → 注册先后的稳定排序、可见性调度 `setVisible`、可叠加滤镜链 `setFilters`（`{type: css|canvas, value}`，`cssFilter` / `canvasFilter` 取值）与标准摘要 `describe(): { slots, activeLayers, filterSummary }`（不碰 DOM / 全局 / 存储，机检）；**阶段 2**（`92a9bda`）`viewer.html` 的 17 处内联 z-index 全部收拢为名义常量——外层 UI 阶梯 `--zu-*`（顶栏 12 / 弹层 13 / 设置 14 / 控制列 9 等，不进 Registry）与视口槽位阶梯 `--zv-*`（z = (槽位序 + 1) × 10，与 core 常量测试对拍），页面不再允许裸 z-index 字面量（机检）；新 `app/layerhost.mjs` 在 OSD 画布叠加上下文按 SLOTS 挂 `.vpslot` 槽位容器（默认 `pointer-events: none`、交互子元素 `[data-hit]` 才收回事件、`isolation: isolate` 合成隔离）；**阶段 3**（`910bd6e`）现有图层全量接入 Registry——fog（fog 槽 canvas，去 `prepend` 改 `#fogCv` 槽位常量）、clouds（depth-haze 槽 dom）、routes（含结界 / 城外环归 base 槽）、trips、events（事态点）、markers、labels（地名 = realm / minor）、security（markers 槽 order 微调），`#layList` 六个静态行清零改由 `renderLayerMenu()` 按 `menuRows()` 渲染（含事件 / 安保的动态行，元素 id、存储键 `edenMapBarriers` / `edenMapRoutes` / `edenMapTrips` / `edenMapSecurity` 与默认勾选完全兼容；键盘 L 与设置页开关统一汇入 `setVisible`）；`window.TCLayers.describe()` 供调试 / 探针。新增 `tests/layer_registry.test.mjs` 18 项（契约 / 排序 / 拦截 / 滤镜链 / 摘要 / 纯度 + CSS 镜像对拍 + 裸字面量清零 + 存储键兼容）；浏览器探针回归 accept（首屏 0.44s / 切层 / 云雾 / 纵深）、v2a、trips095、clouds、fix3、v096 全绿，死区 0/828 被挡、滚轮零漂移。
- [x] 上层 9 岛整图重渲（8000×5000，plain + city 双版）+ 五座庄园抠图贴合 + DZI/瓦片重建，气候塔锚点入画（`map/art/tc_upper*_full.png`、`blender/data/tc_islands.json`、`tools/isles_into_upper.py`）。

- [x] 版权申明设置页（卡信息 / 开源仓库 / 原作署名 / 免责，`map/app/settings.mjs` license 页，探针 4 项过）。
- [x] 兜底名册空数据收口：名册发送不再被面板隐藏门控（`map/tavern/eden-map.js` sendChars 无条件发），开局前人物页也显示「庄园成员 16」+「开局前 · 卡初始值」横幅（探针 2 项过，有数据场景回归正常）。
- [x] 世界书面板不再向模型写「推断」口径（`tools/build_worldbook_addon.py` v16，`INFERRED = ''`）。

- [x] 云端/本地对齐：`main` == `preview`，`tools/sync_main.sh` 只允许 fast-forward（`docs/branching.md`）。
- [x] 语言政策落地：`docs/language-policy.md` + 门控 `tools/check_doc_language.py`（含自测）。
- [x] 渲染队列派工单例锁 + 自愈（`tools/render_queue.sh`）。
- [x] 上层纵深 U15–U18，`accept.mjs` 有断言（`docs/ui-refactor-backlog.md` U15–U18 划线）。
- [x] 原域悬浮圣山三维收口（`map/props/holy_mountain/`，`lm_holy_mountain` 挂 4 标记）。
- [x] 浏览器测试恢复并全绿：`th_adopt.mjs` 21 项、`accept.mjs`、`props_u12.mjs`。
- [x] 历史遗留约束（不建模不描写）撤销落到 7 份现行文档；语言政策例外（工具模板）写清。
- [x] 散落分支收拢（2026-09-29，提交未含此项，纯 ref 操作）：本机 git 复核后——
  `holy-city-shotlist`、`backup/local-main-e5047815`、`backup/local-wbauto-d62a512a` **都是主线祖先**
  （内容全在主线）；`feat/worldbook-auto` 停在重写前血线但功能已并入（有 `th_adopt.mjs` 实跑证据）；
  只有 `upper-v18` 有真未合并内容（7 个岛脚本 ~1400 行 + academy/kelly 审图板）。
  处置：打 `archive/upper-v18` 标签（推送）、删本地 5 个分支、删远端 `feat/worldbook-auto` /
  `holy-city-shotlist` / `upper-v18`。**现在只剩 `main` 与 `preview`（同一提交，快进同步）**。
- [x] 仓库体积：删掉冗余的 `archive/feat-worldbook-auto`（内容已在主线）后 `git gc --prune=now`，
  pack **585.75 → 489.91 MiB（回收 176 MB）**。本机归档 bundle 在 `.cache/attic/archive-branches.bundle`
  （528 MB，gitignore，含重写前血线；内容已在主线，确认不再需要后可删）。
- [x] 气候塔拉回入画 + 8K 重渲 ✅ 2026-09-29：`blender/data/tc_islands.json` anchors.climate_tower (-8.0, 7.33)（v16 细塔）；`blender/tc_estates.py:1852` routes 导出夹取 [.002,.998]；`tools/eden_anchor_upper.py` 修 eden outline 36→48 点；重渲 `map/art/tc_upper_full.png` 与 `tc_upper_city_full.png`（`--out map/art/tc_upper[_city]`，city 加 `--below city`；render_all.sh --data-only 会覆盖 anchor 修正，渲后必须重跑 anchor）。
- [x] 全库「推断」口径统一为「自设 / 同处 / 识别」 ✅ 2026-09-29：数据 JSON（maps / eden_estate_rooms / world_markers / schema/events，`仓库推断`→`地图自设`）+ 页面（markers.mjs:73、world*.html、tiancheng.html:37、estate/plan.js+main.js、section.js、chars.mjs、tavern/*、events.mjs、data/world.js）+ i18n ch.src_* + 工具链（build_worldbook_addon.py、landmark.py、annotate_board.py 上板映射）+ worldbook 重建；工具链内部词「仓库推断」仅存于 tools/ 内部对账与 docs/*.checklist.md。
- [x] 设置新增「版权申明」页 ✅ 2026-09-29：`map/viewer.html`（sgroups 按钮 + `data-page="license"` 区）+ `map/app/settings.mjs`（PAGES、setPage、renderLicense：卡信息自动读 `SillyTavern.getContext().characters[characterId].data`，无线索→转卖风险提示；开源仓库 github.com/kcgoofee-jpg/my-tavern-experiments；原作 Yehehua（类脑社区）授权二创 2026-09-27；免责 + Poly Haven/ambientCG CC0）+ zh/en i18n s.license*/s.lic_*（搜索选择器已含 #licBox）。
- [x] worldbook 发布物带原作署名 ✅ 2026-09-29：`tools/build_worldbook_addon.py` to_ship 返回加 `'_credit': CREDIT`（repo 的 map/data/worldbook_addon.json 与酒馆导入件一致；消费端只读 entries，多键无害）。
- [x] 庄园声望修复 ✅ 2026-09-29：`map/custom.mjs:56` key 取 `title || el?.dataset?.name` 并清理旧 .cu-rep 行（此前 title 与 data.name 不一致时声望行不显示）。
- [x] 架构看门狗接入 smoke ✅ 2026-09-30 `6fc66a7`：新机检 `tools/check_architecture.py` 三道防线接入 `tools/smoke.sh`（违规非零退出阻断）——① map/core/*.mjs 单文件物理行数 ≤400（当前最大 core/roster.mjs 187 行）；② 分层单向纯净：core 零父级相对 import（反向 `import … from '../tavern/…'` 即拦），core 与纯流水线（`tavern/context.mjs`、`tavern/msgtext.mjs`）剥离注释与字面量后禁触 window / document / localStorage / sessionStorage / navigator / Mvu / SillyTavern，豁免按「文件 × 对象」最窄登记三个全局单一属主（storage.mjs 本机存储、logbuf.mjs window 错误钩子与自装守卫、room-gallery-db.mjs OffscreenCanvas 回退）；Mvu / SillyTavern 全仓唯一属主 mvu-bridge.mjs 仍由 `tests/mvu_bridge.test.mjs` 机检，互补不重复；③ 裸 z-index 封锁：viewer.html + map/app/ 的 z-index 取值只认 var(--zu-*) / var(--zv-*) 名义常量、含 var() 的 calc 与运行期表达式（如 `String(slotZ(slot))`），裸数字字面量（含 `setProperty('zIndex', '9')` 无连字符写法）拦截。三道防线各用临时违规样本验证过真的拦得住（注释 / 字符串字面量 / var() 写法放行）。顺带 `docs/agent-brief.md:15`「仓库推断」旧词改「地图自设」对齐 2026-09-29 全库口径。

## 6. Where finished and historical todos live

- A finished item stays **in its source document**, struck: `~~…~~ ✅ <date> <commit>`. That document is the
  record of what was decided there — no rewriting it after the fact.
- The **index** only keeps §1–§4 readable: a finished item moves to §5 with its date and commit, and the
  superseded wording stays visible in the struck source line.
- **Historical task briefs and handoffs** live in `docs/history/` and `docs/archive/`; where a constraint in
  them was later revoked they carry a 作废 banner (see `docs/archive/README.md`), so a reader cannot execute
  an old rule by accident.
- **Per-release verdicts** live in `docs/reviews/**`; the pre-rewrite iteration material lives in
  `docs/drafts/**` (169 MB, tracked — see the cleanup item in §3).
- **Nothing is deleted.** A cancelled item becomes `[x] cancelled — <reason>` in place; only the branch
  cleanup removed refs, and those were verified ancestors or tagged first (`archive/upper-v18`).
- New items are added to §1–§4 with their `file:line` source. If an area grows past a screen, extend its
  section here instead of opening a new file.
