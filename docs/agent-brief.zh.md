# 代理速查 — 伊甸地图 → Spatial OS（每个任务先读这一页，别的按需 grep）

> S10 拆仓之前以本中文版为准（D18）；`docs/agent-brief.md` 是英文镜像，可能滞后。
>
> 只放规则，不放状态：当前状态看 `docs/todo.md` §0 和执行日志 `docs/plans/spatial-os-log.md`；上一次会话的交接看 `docs/handoff.md`。

## 1. 这个仓库是什么，读什么

- 这是给 SillyTavern / TavernHelper 聊天用的地图层，2026-09-30 起正从单卡工具重构为通用的 **Spatial OS**：与卡无关的引擎 + 数据**包**。第一个包是 `eden`；`town` 是虚构的示例包。
- 依据：`docs/plans/spatial-os.md`（中文版 `.zh.md`）。工作按提示词一份一份推进，按步骤编号（S0、S1……）。
- 阅读顺序：本文件 → `docs/ARCHITECTURE.md`（模块地图、数据流、实体协议）→ `docs/naming.md`（术语表，S0.4 之后）→ `docs/todo.md` → 之后才 grep。
- **仓库事实只以 `git fetch` 之后的 `origin/preview` 为准。** 主工作区会落后（它是渲染派工的家）；状态、计数、文件内容都不要从它读。

## 2. 引擎铁律（Spatial OS）

1. **引擎零业务词。** `map/core`、`map/app`、`map/tavern`、`map/ui`、`map/three`、`map/*.mjs`、`map/viewer.html`、`map/props/viewer3d.html` 以及核心 i18n 词典里，不许出现卡专有的名字、地点、状态或等级。卡的原名只原样出现在包数据（`map/packs/**`、`map/data/**`）和构建侧工具（`tools/**`）里。界面文案对所有包一律中性，伊甸也不例外；包可以通过清单的 `strings` 覆盖文案。
2. **只减不增账本。** 单文件 ≤ 400 行、不许裸 z-index（只用令牌）、不许内联外观样式、不许卡专有名词。现有违规记在 `tools/arch_baseline.json`，只许减少；新增违规会让 `tools/check_architecture.py` 失败（smoke 里会跑）。
3. **单向数据流。** MVUBridge（`map/tavern/mvu-bridge.mjs`）→ ContextPipeline（`map/tavern/context.mjs`）→ 账本（`map/core/ledger.mjs`）→ 协议（`map/core/protocol.mjs`）→ 查看器。查看器只向上发意图，不写宿主状态。F0 起全仓唯一允许碰宿主全局（`Mvu`、`SillyTavern`、酒馆助手的接口函数）的是适配层 `map/tavern/host-adapter.mjs`；桥和其余模块都向它要（看门狗检查 10 与 `tests/mvu_bridge.test.mjs` 的隔离契约）。
4. **聊天记录是唯一真相。** 地图显示的一切都必须能从聊天楼层重算；缓存（关键帧、藏物）随时可丢，重算结果必须逐项一致。文本里没有明确的实物动作，就不许凭空造状态。
5. **绝不写卡的 `stat_data`**（它的 MVU schema 会拒绝未知键），也不碰用户自己的世界书——只动我们的附加书，以及带我们 `extra.eden_id` 标记的条目。地图自己的状态存在包的聊天变量里（伊甸是 `eden_map`）。
6. **对用户安静，对日志不沉默。** 缺依赖就悄悄降级，不弹阻塞对话框（不许出现「去后台设置 X」这类拦路提示）；但每个被捕获的失败都要经 `core/logbuf.mjs`（或被它截获的 `console.warn`）记下，带一个点名模块的短标签，这样它才会进反馈报告。空 catch 只留给「预期且无害」的失败（存储配额、隐私模式、有明确默认值的 JSON 解析），并且要写注释说明原因；`tools/check_architecture.py` 按文件统计空 catch，只许减少。新开关默认关，并且要登记：存储键进 `map/core/storage.mjs`，协议字段进 `map/core/protocol.mjs` 的 SCHEMA，中英文案齐备。
7. **源码不放学术引用。** `map/**` 和 `tests/**` 只写机制（不留论文名、期刊、arXiv / DOI）；参考文献存在 `docs/plans/llm-campaign.md` §10。由看门狗的 `check_citations` 机检。
8. **绝不审查聊天内容。** 用户内容原样解析、原样落点；未知类型回落到中性的「其他」。

## 3. 工作流

- **一份提示词 = 一段工作。** 只做提示词 IN 清单里的事，OUT 清单里的一概不碰，做完就停。不许自己接着做计划里的下一步。
- **只「增加」落点或信息、不丢任何东西的对拍差异**（没有事件、人物、物品或注入行消失或改变）可以继续：每条用测试钉住，在 `docs/todo.md` §3 立一条带建议的 Q 项，然后继续。只有丢了东西、或注入文本变了才停。
- **旧决定只作背景**（用户，2026-10-01）：空间 OS 重构之前（2026-09-30 以前）的决定不再有约束力。旧文档、`rejected.md` 条目、
  归档的 todo 与交接笔记都只是背景；更好的设计需要时可以推翻，并在 RESULT 里用一行说明。
- **用 worktree，别动主工作区：** `git fetch`，然后 `git worktree add -b <名> <scratchpad>/<目录> origin/preview`。主工作区可能放着另一条线没提交的东西，不要碰。永不 reset 到旧的 origin 引用。
- **git 卫生：** 每次 Bash 调用只跑一条 git 命令（不用 `&&` 串联、不嵌套 `$(git …)`、不接管道）；先跑一条拿到值，再用它。提交信息写进文件，用 `-F` 传入。
- **提交：** `git -c user.email=kcgoofee-jpg@users.noreply.github.com commit -F <消息文件>`；提交信息用英文；**不写 `Co-Authored-By` 尾巴**。
- **攒批推送**（每 2–3 项，通常每份提示词一次）：`bash tools/push_preview.sh --head --no-escalate`——fetch + rebase、给 `map/data/head.json` 涨 "head #N"、推 `preview`，然后后台脱离做增量 CDN 预热（`logs/warm_cdn.log`，不用等）。`--full` 强制全量预热；`WARM=0` 跳过。旧镜像 `cloud/tc-mid-low` 已弃用、默认不推（只有在明确要求时才用 `LEGACY=1`；见 `docs/branching.md`）。推送被拒：停下报告，永不强推。
- **CI：** 推送会跑 node --test + smoke；用 `gh run list --branch preview -L 1` 查看。
- **分支：** `preview` 是集成 / 跟随线；`main` 是发布线，内容相同，靠快进同步（`bash tools/sync_main.sh`，`DRY_RUN=1` 先演练）。Spatial OS 重构期间不打标签、不发版、不改版本号（只涨 head #N）。见 `docs/branching.md` 和 `docs/versioning.md`。
  每个计划阶段结束时同步 main（`tools/sync_main.sh`），让 GitHub 的默认分支显示最新内容。
- **只追加的文件：** `CHANGELOG.md`、`logs/*.csv`、`docs/plans/spatial-os-log.md` 走 union 合并——只在末尾追加。
- **交付物：** 只有外置的 TavernHelper 脚本和世界书附加书。绝不生成或修改角色卡；绝不写用户的酒馆数据目录。
- **交回前收尾：** 停掉你自己起的预览服务、后台进程和 Blender（只动自己的 PID）；`.claude/launch.json` 里不留长期条目。

## 4. 测试

- 必跑：`node --test tests/*.test.mjs` 和 `bash tools/smoke.sh`（含 check_maps、check_pack、架构看门狗、文档语言门控、无来源标签门控）。
- 浏览器探针（`tools/browser/*.mjs`）：只跑与改动相关的；全量只在阶段末跑。
- 测试数量不许下降，除非在报告里说明原因。
- 桌面优先；375 px 只过一遍；不做 iPhone 专项（有反馈再修）。

## 5. 汇报与文档

- **每份提示词结尾：** 打印下面的 RESULT 块，并把同一个块追加到 `docs/plans/spatial-os-log.md`（随你的最后一个提交一起提交）：

  ```
  === RESULT S<id> ===
  status: DONE | PARTIAL | BLOCKED
  items: <each prompt item id> ✓/✗
  commits: <sha> <subject>   (one per line)
  pushed: yes | not pushed   (chat report: add the head #N the push printed; the log copy is committed before the push)
  tests: node <pass>/<total> | smoke PASS/FAIL | arch PASS/FAIL | probes: <name>=PASS/FAIL …
  deviations: none | <what differs from the prompt and why>
  open: none | <questions that need a decision; when BLOCKED: verbatim error (first 20 lines), what you tried, options A / B>
  cleanup: done
  === END ===
  ```

  被卡住就停下，写 `status: BLOCKED`——不许猜着往下做。
- **语言（D18，S10 拆仓之前）：** 给用户看的决策文档（计划、简报、todo 状态行、报告）以中文为正本；英文版可选、可滞后；提示词仍用英文加中文说明。政策之前的旧文档不批量翻译。代码注释和工具输出跟随文件已有的语言。警告类门控：`tools/check_doc_language.py`、`tools/check_zh_mirror.py`；政策：`docs/language-policy.md`。
- **清单类文档：** 每条独立成行；做完的原地划删除线（`~~…~~ ✅ <日期> <sha>`），不删除；文首一行写状态说明。`docs/todo.md` 顶部的状态每个步骤结束时重写（不是追加），保持在 5 行以内。
- 给用户看的图拷贝到 `~/eden-map-review/`（只存档，不阻塞流程）。

## 6. 渲染线

- 所有渲染都走队列：`tools/render_queue.sh submit <draft|final|any> -- <参数>`。不许直接调 `tools/blender_run.sh` 或 `tools/cloud/render.sh`——队列负责在 Mac 与云端之间派活并管 GPU 锁。细节见 `docs/cloud-render.md`。
- **队列全仓共享：** 在任何 worktree 里 `tools/render_queue.sh submit`，任务都落进主工作树的 `logs/queue/`，并且每个任务在提交它的 worktree 里跑（产物落在那边）。主工作树只是派工常驻的家：谁也不在里面改代码或提交。`tools/render_queue.sh` 有改动合入后，把主工作树快进（`git -C <main> merge --ff-only origin/preview`，仅在它干净时）并重启派工（`bash tools/install_renderqueue_agent.sh`）。
- **Mac-only 模式：** 主工作树里 `logs/queue/MAC_ONLY` 存在时，一律不派云端（渲染战役 R 当前的设置）。
- **Mac 优先：** 设定 → 草图（16 spp、约 2000 px）→ 自检 → Mac 上 64 spp 定稿预览；外观在这里锁定。不在云端反复试错。
- **云端攒批：** 只接已锁定的高规格任务（8K / 16K、128–512 spp、分条渲染、昼夜变体），作为一批放行；实例由用户开机；`tools/cloud/idle_guard.sh --idle-shutdown 30` 在空闲时关机。
- **渲染守卫：** 新渲染脚本通过 `tc_common.setup_render_device()`（旧名 `pick_gpu`）配 GPU，自己绝不设 `compute_device_type`；没 GPU 就中止，除非给 `blender_run.sh` 传 `--allow-cpu`。改动小于图像 25 % 用 `tools/region_patch.py`。
- 新地标走 `python3 tools/landmark.py new|draft|board|gapcheck|final|ship <id>`（`docs/landmark-pipeline.md`）。
- 当改 `maps.json` 或包清单的代码步骤（S2、S3、S4-3）进行中时，渲染线会话不发布 `maps.json` 的改动；出图本身可以继续。

## 7. 伊甸包内容规则（S10 拆仓库时整体搬到伊甸仓库）

- 卡的原名原样写进包数据（地点、房间、人物、MVU 键、世界书触发词），成人措辞照旧；不自编占位名。
- **不加任何来源标签**（用户决定，2026-09-30 重申）：整个项目都是二创，用户和模型能看到的任何地方——界面、数据文本、世界书、渲染说明、评审交接——都不写「地图自设」「仓库推断」「自设」「推断」这类「卡里有 / 自己编」的区分。在卡的设定内自由发挥，不违背卡的事实；卡的事实可以引用 `docs/card-digest.md` 行号，其余内容不打任何标签。
- 内容边界（用户 2026-09-29 决定）：设施、道具与用途照原卡写，可以建模；房间名用卡的原名。旧的「私密房间保持中性 / 不建模」约束作废（见 `docs/archive/README.md`）。
- 只有卡里有的地点才建标记和模型；自编的地点放进 DLC 待办。用户指定的例外记录在 `docs/eden-lore-space.md`。
- 地图上改了地点，世界书附加书要在同一次改动里同步更新（`tools/build_worldbook_addon.py`）。
- 原作者（Yehehua）的署名要通过包的 credits 一直可见；第一次公开发帖必须链到作者的原帖。

## 8. 环境坑

- 这个 shell 里 `cat` / `ls` 是坏别名：用 `command cat`、`/bin/ls`，或 Read / Write 工具；用 `cat` 配 heredoc 会写出空文件。
- Node：仓库路径用 `fileURLToPath(new URL(…, import.meta.url))` 构造，不要用 `.pathname`（非 ASCII 路径会被百分号编码）。
- 等渲染或长任务：用 Bash 的 `run_in_background` 和它的完成通知；不许写 `sleep` / 轮询循环。

## 9. 状态在哪（不在这里）

- 计划与步骤清单：`docs/plans/spatial-os.md`；执行日志：`docs/plans/spatial-os-log.md`。
- 待办：`docs/todo.md`（唯一索引）；上一次会话：`docs/handoff.md`。
- 版本与发布：`docs/versioning.md`；分支：`docs/branching.md`；云端：`docs/cloud-render.md`。
