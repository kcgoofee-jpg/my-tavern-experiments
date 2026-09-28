# 本地清理计划（Mac，2026-09-28）

> 状态：只测量，没删任何东西；条目按用户 2026-09-28 的格式，一行一条，做完的在原句上用 ~~删除线~~ ✅ 划掉（不删、不另起文件），文首这行更新状态；后续实施的代理负责回去划。排进 `docs/project-design.md` 的整理顺序，见文末。

## 清单（每条：是什么 / 大小 / 能不能删 / 命令 / 是否要全体代理空闲）

- scratchpad worktree（`git worktree list`，33 个，`/private/tmp/claude-501/.../scratchpad/wt*`）：本次会话各代理各自开的隔离工作区，共约 **12.4 GB**（单个 250M–950M 不等，最大的是 `wt-bld` 950M、`wt17` 606M、`wt18` 544M）；大部分已经合并进 `cloud/tc-mid-low` 或已经废弃（分支名能看出来，比如 `mirror-fix`、`gallery-fix` 这些像是已经收尾的）——安全删除前必须逐个确认对应分支已经 merge 或者确认丢弃不可惜，不能批量删；命令：`git worktree list` 核对每个的分支和 `git log --oneline origin/cloud/tc-mid-low..<分支>` 看有没有没推的提交，确认没有再 `git worktree remove <路径>`（还留着的分支再 `git branch -D <分支>`）；**需要对应那个 worktree 的代理已经结束/空闲**，不需要全局停机（`docs/project-design.md` 的 C3 才需要全局停机，这条不是）。
- `/private/tmp/bl_tmp`（`tools/blender_run.sh` 用的 ASCII TMPDIR，绕开中文路径的 Metal 内核缓存崩溃）：只 **196 KB**，小到不值得管；命令：`rm -rf /private/tmp/bl_tmp`（下次渲染会自动重建）；随时可删，不需要空闲。
- Blender 内核缓存（`~/Library/Caches/blender`）：**472 KB**，也很小；命令：`rm -rf ~/Library/Caches/blender`（Blender 下次启动会重新编译内核，第一次渲染会慢一点）；建议等 **本机没有 Blender 在跑**（`tools/blender_run.sh` 的锁空闲）再删，不需要全局停机。
- `~/Library/Caches/Homebrew`：**1.6 GB**，纯下载缓存，删了不影响已装的包；命令：`brew cleanup --prune=all`（顺带清过期版本，比手动 rm 更干净）；随时可删，不需要空闲。
- `tools/browser/node_modules`（浏览器测试用的依赖，仓库根 `node_modules` 现在不存在，只有这一个）：**18 MB**，`npm install` 能重建；命令：`rm -rf tools/browser/node_modules`（下次跑浏览器测试前 `cd tools/browser && npm install`）；建议等 **没有浏览器测试在跑** 再删，不需要全局停机。
- `docs/drafts` 里的图片（草图/参考图，`estate_v*_desk_*_<房间中文>.jpg` 这批也在这，同时是 §5.2 命名违规清单里要改名的对象）：**158 MB**；能不能删要看每张图是不是还在被文档引用——不是无脑能删的一批，建议先 `grep -rl "docs/drafts/" docs/ map/` 找出还被引用的文件名单，没在名单里的草稿图才删；命令：`du -sh docs/drafts/*` 逐个核对后 `rm`；不需要全局停机，但建议跟 C3 改名一起处理（改名清单里已经点名了这批文件）。
- `.git` 仓库本体：**606 MB**（历史里应该攒了不少大文件，瓦片 / 渲染图之类）；这个**不是「删文件」能处理的**，是 `git gc` / 历史重写（BFG 或 `git filter-repo` 把大 blob 挪出主仓库历史）才能真正瘦身，风险高（改写历史，所有人要重新 clone）；命令先只测量：`git count-objects -vH`、`git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | sort -k3 -n -r | head -20`（找最大的历史 blob）；**这条就是 `docs/project-design.md` 里的 C4（git 瘦身 + 瓦片出主仓），必须全局停机，且排在 C3 改名之后**，不要在这个清理计划里单独动。
- `map/art` 下的旧渲染输出（DZI 瓦片 + 源 PNG，含 `_bench_*` 这类基准产物）：**280 MB**；小样本抽查显示大部分是当前在用的地图瓦片（不能删），`_bench_tc_mid.png` 这类是 `tools/cloud/bench.sh` 的临时基准产物，可以删；命令：`command find map/art -maxdepth 1 -name '_bench_*'` 先看有哪些再 `rm`；正式瓦片要不要清旧版本，等 `docs/render-deps.md` 的「上游落后」告警清完、确认没有脚本还引用旧文件名再动，不要现在批量删；不需要全局停机，但建议等 **没有渲染任务在跑**（`tools/render_queue.sh status` 两边都空闲）。
- `logs/queue/done`（`tools/render_queue.sh` 跑完的任务记录）：会随用量增长，目前是空的；命令：`command find logs/queue/done -mtime +30 -delete`（保留 30 天内的方便查历史）；随时可删，不需要空闲。
- 过期工具：`brew outdated` 报 4 个（iterm2、raycast、stats、temurin，都是桌面工具/JDK，跟本项目渲染管线无关，不影响 Blender/Node/Python）；Node 是 v24.21.0、Python 3.9.6、Blender 5.2.2 LTS——都不是「过期到有问题」的版本，Python 3.9 略老但仓库脚本没用到 3.10+ 特性（`tools/smoke.sh` 全绿）；命令：`brew upgrade iterm2 raycast stats temurin`（可选，非阻塞）；随时可做，不需要空闲，但升级 temurin 前确认没有依赖旧版 JDK 的工具在用。

## 排进整理顺序（`docs/project-design.md` §4.2）

新增 **C2.5 本地清理**，放在 C2（架构整理）之后、C3（改名，全局停机）之前：
- 理由：C3 改名要动 `docs/drafts/*.jpg` 的中文文件名、且是唯一的全局停机点，清理一次性做掉低风险的部分（worktree、缓存、`node_modules`、`bl_tmp`）可以减少 C3 停机窗口里要处理的杂项；`docs/drafts` 图片改名 + 是否删除可以合并到 C3 一起做（本清单已经标注）；`.git` 瘦身继续留在 C4，不提前。
- 顺序变化：原来是 `C2 → C3 → C4`，现在是 `C2 → C2.5 → C3 → C4`；C2.5 内部各条互相独立，不需要串行，但每条各自标注了「要不要等对应代理/任务空闲」，照着做即可，不需要像 C3/C4 那样整体停机。
