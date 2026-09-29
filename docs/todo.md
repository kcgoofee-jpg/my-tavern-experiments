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
| UI refactor backlog (U1–U18) | `docs/ui-refactor-backlog.md` |
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

## 1. Code line

- [ ] **Real SillyTavern + TavernHelper browser test.** The biggest open item: `tools/browser/`
  currently only has `host_stub.mjs`, a fake host. Everything else in the suite runs against the stub.
  (`docs/handoff.md`, "新顺序" code item 1.)
- [ ] `eden-map.js` 继续拆分 — "按 `spec.md` 走完整重构"（`ROADMAP.md:52`），U1–U12 实测问题同批（`ROADMAP.md:51`）。
- [ ] MVU 迷雾 / 结构小任务 — "「不要漏测」"（`ROADMAP.md:47`）。
- [ ] `card-omissions` 遗留：A18/A20 泛称做图层、C2 治安梯度、C3 层间视线、C4 天气、C8/C9 卡片与编号解析
  （`docs/card-omissions.md:74,76,106-108,112-113`）；B19 新事件类型「转化仪式 / 临时管控 / 登记年检 / 评级复核」
  （`:282`，前半已做，转化仪式未收）。
- [ ] 事件系统后续：城市节律（`docs/event-taxonomy.md:29`）、虚线因果连线（`:43`）、
  「转化仪式直播」（`:89`）；`docs/map-events.md:155-165` 分阶段 2–5（时间轴 / 热区 / 反哺 / 城市自运转）、
  `:179` 下一批（雷达动画 / 连环 / 热力）。
- [ ] `registerOverlay` / `unregisterOverlay` 暂缓未做（`docs/content-compat.md:53`）。
- [ ] `here.mjs` 只能解析 54/55、SYS-01 未接（`docs/eden-lore-space.md:7`）。
- [ ] 创意工坊（`docs/design/workshop.md` 整篇「设计稿，未实施」= `docs/project-design.md` C6）；
  `docs/design/custom-v2.md:174-197` C1–C12 全未做。
- [ ] 纵深 P2（`docs/design/depth-system.md:81`）、meta 接 `make_dzi`（`:84`）。
- [ ] `tiancheng_*.py` / `landmarks` 未接 `--cache-blend`，接入后补 bench（`docs/cloud-render.md:135,138`）。
- [ ] 上层真 3D（`docs/project-design.md` C5）。
- [ ] 自动旋转开关进设置页；滚轮＝平移是否改缩放（`docs/handoff.md:9`）。
- [ ] 三维查看器两个观感项：塔楼顶部纯白方块 / 裙楼粉长条（疑材质缺失）、信息按钮 (i) 高亮却不弹面板
  （`docs/handoff.md:69,70`）——**需要看图判定**，本轮未动。
- [ ] CI：`browser-smoke` 仍是 `if: false` 占位（`.github/workflows/ci.yml`）。**已修**：浅克隆不带标签，
  文档语言门控在 CI 里取不到基线会**静默空转**（本地红、CI 绿就是这么来的）——已加「取基线标签 + 取不到就失败」
  一步。`main` 推送仍不触发 CI（`:5`）是**故意**的：main 只是跟随线的快进副本，加进去等于每次推送跑两遍。
- [ ] `tools/reviews/takeover_095/toolchain.md:22` 世界图输入不可复现（⏳未修）、`:24` `ship.sh --dry-run` 三个洞。
- [ ] 通用化 v1 五条已知限制（`docs/generalize/README.md:123-128`）：世界图 / 庄园剖面 / 天城尺度环 /
  人物名册 / 安保层仍 eden 专用；预算 LRU 只认 `edenMap*`；包的 `strings` 字段未接入；
  `props/viewer3d.html` 语言键退回中文；`viewer.html` 三条 eden 预取。

## 2. Render line

- [ ] 上层 v18 逐岛建模 → 定稿（`docs/handoff.md:8,14,87`）。**WIP 已存档**：
  tag `archive/upper-v18`（`08597bed`，7 个岛脚本 ~1400 行改动 + academy/kelly 审图板），
  主线与之分叉 575 个提交 → 需决定「按新主线重做」还是「摘取其中仍有效的部分」。
- [ ] 原域悬浮圣山精修两点：大教堂背面白色凸出方块、雕像圈个别雕像悬出平台（`docs/handoff.md:100`）——
  模型已收口（`map/props/holy_mountain/`），这两点是外观精修。
- [ ] 大骑士领·圣都 3–4 景（`docs/handoff.md:15`）。**第一个在建**：`glory_crown`（荣光冠冕，核心区）
  —— `docs/landmarks/glory_crown.checklist.md` 进行中，草稿已看图改过一轮。
- [ ] 地下室 B1/B2 精修 + 道具包接口（`docs/handoff.md:18`）。
- [ ] 下层 4 处（`docs/handoff.md:20`、`:89` 待批）；上层 16K / 512spp、昼夜四版（`:20`）。
- [ ] 中/下层 8K 定稿复核、七岛并入重渲、精英学院草稿、多时段底图挑档（`ROADMAP.md:55-58`）。
- [ ] P2 机构三维化未打勾（`ROADMAP.md:61`）：最高法院 / 大学 / 执政厅…
- [ ] P4 各地点全景 + 深度图 → three.js 视差背景层（`ROADMAP.md:45`）。
- [ ] 伊甸剖切等轴瓦片多边形导出；中层影子模糊等真实感细节（`ROADMAP.md:63,64`）。
- [ ] `card-buildings` P3 里模型列为「—」的行（圣都与五席的大批点位）。
- [ ] `league_club` / `rothschild_estate` / `elite_academy`：glb 已导出但**未走两人设评审**
  （`docs/card-buildings.md:95,98,99`）。
- [ ] A28–A31 落点或登记（`docs/card-omissions.md:269-271`）。

## 3. Repo / document line (found by this sweep)

- [ ] **Fix the outdated statements** (they contradict the 2026-09-29 baseline):
  `ROADMAP.md:12,18,23,25,80`（写 0.9.5 / 「未发版」）, `docs/onboarding.md:10,11,43`（`main` 旧、勿用）,
  `docs/project-design.md:3,11,22,67,104`（未开始实施 / 一键管线待建 / 标签只到 0.9.5 / 编码 0280）,
  `docs/content-compat.md:57`, `docs/tt-test-checklist.md:1`, `docs/tooling.md:62`（输出目录仍写 `~/Downloads/酒馆/预览`）,
  `docs/map-events.md:35,67`（9 类 82 种 → 实为 10 类 85 种）, `docs/map-events.md:49` vs `:57`（人物标签上限 8 vs 5）,
  `docs/event-taxonomy.md:71-80`（上层地标含已下线为 DLC 的 `general_residence`/`aether_institute`）,
  `docs/ui-refactor-backlog.md:51`（U1–U12 仍列 [ ]）、`docs/design/depth-system.md:82`（P3 列为待做）,
  `docs/design/ui-v2/spec.md:1`（「草案，待用户确认」但 `impl/` 已实现）,
  `docs/landmarks/starabyss_univ.checklist.md:1`（写「下一步 draft」但 glb 已导出、r1 已评审）,
  `docs/drafts/upper_v16_checklist.md:1`（等用户点头，已被顶层 `docs/upper-islands-checklist.md` 取代）,
  `map/data/worldbook_addon.json:3-4`（`0.9.5-dev`）。
- [ ] **Fix the conflicting-content constraints**（撤销留下的旧话）：
  `docs/eden-lore-space.md:4,5`、`docs/eden-estate.md:105`（仍写「只写名字、不描述、不画家具」）、
  `docs/card-omissions.md:51,337-338`、`docs/history/CLOUD_TASK{,2,3,5,7}.md`（5 份**未加**作废批注，
  只有 `CLOUD_TASK8.md:3` 加了）。`docs/eden-estate.md:320,500` 的自编中性名「私人房间 A」「附属用房」
  与 `docs/card-digest.md:6`「照抄卡原名」冲突。
- [ ] **Fix the internal self-contradiction**：`docs/card-omissions.md:336` 的 ◐ 清单仍含
  E1/E16/B11/C1/C6/C10/C15，而同文 `:332,334,340` 已标 ✅。
- [ ] **Reconcile the island generator path**：`docs/upper-islands-checklist.md:3`（`blender/islands/`）
  vs `docs/upper-islands-references.md:4`（`blender/upper_islands/`）——两个目录都存在，需确认现行者。
- [ ] **Fix dead references**（verified missing):
  `map/estate3d/`（`README.md` 0.10 段、`ROADMAP.md:28`）, `docs/asset-deps.md` → `docs/render-deps.md`
  （`docs/render-retro.md:172`）, `tools/gpu_lock.sh`（`:175`）, `tools/check_glb.py`（`:177`, 提案项）,
  `tools/add_script_to_card.py` → `tools/legacy/`（`docs/ui-audit.md:14`）, `map/custom.js` → `map/custom.mjs`
  （`docs/design/custom-v2.md:4,13`）, `map/core/fog.mjs` → 已并入 `map/core/depth.mjs`（历史标注）,
  `tools/fetch_textures.sh`（`.gitignore:19-20` 注释引用，脚本不存在）,
  `docs/tech-compat-no-moderation`（`skills/card-map/guides/nsfw.md:3` 引用，不存在）,
  `card-only-scope-dlc.md`（`docs/rejected.md:12`、`docs/reports/token-usage.md:64`）,
  `model-and-budget-policy.md`（`docs/reports/token-usage.md:59`）。
- [ ] **Fix `docs/reports/token-usage.md:63,64`**：仍写渲染队列与地标流程「规划中」，两者都已上线。
- [ ] `.gitignore` 清理：`.pi/`（`:7` 与 `:43`）、`map/art/tc_upper_8k.png`（`:11` 与 `:14`）各重复一次；
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
- [ ] **本机可清 ≈1.6 GB 未入库产物**：`blender/data/real3d/raw`（1.13 GB，可 `fetch` 重下）、
  `blender/data/osm/raw`（288 MB，可重下）、`blender/world/out`（143 MB，成品已进
  `map/props/holy_mountain/`）、`map/art/*_full.png`（≈470 MB 渲染源图，瓦片已入库）、
  `.cache/`（≈290 MB 中间物，含 `hm_*` 12 个档位 ≈191 MB）。**须留**：`blender/data/{estate2,props,landmarks}`。
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

## 5. Done, kept as evidence (2026-09-29)

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
