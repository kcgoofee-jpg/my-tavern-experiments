# 代理速查（每个任务先读这一页，别的文档按需 grep）

- 分支只推 `cloud/tc-mid-low`；不打标签、不发正式版；不生成角色卡；不写用户酒馆数据。
- 在 scratchpad 里自建 worktree：`git fetch && git worktree add -b <名> <路径> origin/cloud/tc-mid-low`；不动主工作区；永不 reset 到旧的 origin。
- shell 的 `cat`/`ls` 是坏别名：用 `command cat` / Write 工具；提交信息写文件用 `-F`；非 ASCII 路径用 fileURLToPath。
- 名字照抄原卡；自补内容标「仓库推断」；卡里没有的地点不建模（DLC）。
- Blender 一律 `tools/blender_run.sh`（等显卡锁、ASCII TMPDIR、崩溃重试一次、只杀自己 PID）；草图 16 spp ~2000 px，定稿 64 spp；改动 <25% 用 `tools/region_patch.py`。
- 渲染任务交给队列 `tools/render_queue.sh submit <draft|final|any> -- <参数>`，不要直接调 `tools/blender_run.sh` 或 `tools/cloud/render.sh`（队列负责派给 Mac 还是云端、避免两台撞车）；云端细节见 `docs/cloud-render.md`。
- 新地标一律走 `python3 tools/landmark.py new/draft/board/gapcheck/final/ship <id>`（`docs/landmark-pipeline.md`）。
- 评审默认一轮、自检对照 `docs/rejected.md`；中层/下层不等用户确认；上层与重点资产先设定稿 → 预览 → 用户点头。
- 不做 iPhone 专项；桌面优先，375 px 只过一遍。
- 测试：改哪测哪——`node --test` + `tools/smoke.sh` 必跑；浏览器测试只跑相关的，批次末再跑全量。
- CI runs node --test + smoke on push; agents only need to run tests relevant to their change locally, then check the CI result with `gh run list --branch cloud/tc-mid-low -L 1`.
- **推送要攒批**：每次推送 = 新提交号 = CDN 全量预热约 2000 个文件。连做多项时每 2–3 项推一次：`git fetch && git rebase origin/cloud/tc-mid-low` → `python3 tools/bump_head.py --push --branch cloud/tc-mid-low` → `bash tools/warm_cdn.sh "$(git rev-parse HEAD^)" 16 --purge-branch cloud/tc-mid-low`。
- CHANGELOG 与 logs/*.csv 已设 union 合并，rebase 冲突少；只在末尾追加。
- 提交：`git -c user.email=kcgoofee-jpg@users.noreply.github.com commit -F msg`，中文，结尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。推送被拦就停下报告。
- 报告：英文、简短（≤10 行），只写结果、测试、需要决定的事；截图路径给出即可。
- 深入资料：`docs/onboarding.md`（全貌）、`docs/render-retro.md`（渲染规则）、`docs/design/depth-system.md`（上层纵深/斜视）。
- **报告格式（用户 2026-09-28）**：写建议 / 清单类文档时每条独立成行；做完的在原文上用 ~~删除线~~ ✅ 划掉（不删、不另起文件），文首一行写状态说明；后续实施的代理负责回去划掉。
- **收尾清理**：交回前停掉自己起的预览服务、后台进程和 Blender（只动自己的 PID）；不往 .claude/launch.json 加长期条目，要加就在收尾时删掉；报告里写一句「已清理」。
