# 交接（新对话从这里接上）

> 状态（2026-09-28）：~~删除线~~ ✅ = 已完成；没划掉的 = 待办。新对话先读本页 + docs/agent-brief.md + docs/project-design.md + logs/pipeline_tasks.md。

## 当前在跑（旧对话里，完成后结果会推到 cloud/tc-mid-low）
- 上层 v18：8 座岛逐座建模 + 设定漏项检查 + 标注审图（一次一座，简单岛用 Sonnet）。交付 docs/drafts/upper_v18_<id>_board.jpg + 岛底对比条，然后停下等用户确认。
- ~~3D 查看器镜头操作（head #53）~~ ✅ 待补：自动旋转开关进设置页；鼠标滚轮=平移是否要改为缩放（看用户反馈）。

## 顺序（额度紧，2–3 个代理以内）
0. 世界书真正全自动（用户 2026-09-28 明确要求：打开地图时没有这本书就自动建好并挂到当前角色的附加世界书，版本变了静默同步，只一次提示，数据与映射里一个总开关可关）+ 旧对话兼容（别名表单一来源、退役条目降优先级、每聊天版本提醒、「你改过，上游也改了」）。head #52 只做了按钮和附加绑定，写入仍需点击——代理出于谨慎没做全自动，需要新任务按用户决定实现并先给架构评审。
1. 上层 v18 交付 → 用户确认 → 全景合成草图 → 云端 16K 定稿 + 切瓦片。
2. 恢复世界层：原域（worktree scratchpad/wtw，分支 world-yuanyu-2；待修：雾像黑烟、上半山像方盒（已改未复查）、鼓楼/礼拜堂/地面道路）→ 云端定稿 → 用户确认后 glb → 圣都 3–4 景。
3. 中层剩 2 座：骑士团营区（草图在 scratchpad/wt-mid，分支 mid-buildings）、维多利亚的公寓 —— 走 tools/landmark.py。
4. 纵深系统浏览体验 U15–U19（视差/漂浮、悬停放大、按远近显示标签、图例、手机缩小按钮）+ 合并 4 套云雾。
5. 庄园地下室 B1/B2 精修（单独一条，不并行）→ 本地道具包接口（用户自带 glb、本地存储、点选放置、只做技术校验）。
6. 下层 4 处（等用户批准）。
7. 标准提高：上层 16K/512spp、各层斜视版、昼夜四版（白天/黄昏/夜/雨）。
8. 代码整理（云雾合并、单一伊甸定义、冻结 pack schema、拆 eden-map.js）→ 本机清理（docs/local-cleanup-plan.md）→ 文件夹改名 + 英文命名统一（要所有代理空闲）→ git 瘦身 + 瓦片移出仓库（要用户放行强推）→ 上层真 3D → 创意工坊。
9. 最后：报告归档到 docs/reports/、仓库装修、衣帽间、人物。

## 已完成（本轮）
- ~~云渲染：AutoDL RTX 4080 SUPER（connect.weste.seetacloud.com:25307，密钥 ~/.ssh/autodl_ed25519），tools/cloud/*（doctor/setup/sync/render/bench/status/stop/idle_guard/render_split、多机 hosts/*.env），渲染队列 tools/render_queue.sh~~ ✅
- ~~实测：中层 8K/128spp 云端约 4.5 分钟、约 ¥0.13；草图主要卡 CPU 搭场景（59 s 搭 / 7 s 渲）~~ ✅
- ~~中层 8K 底图重渲（含 7 座新建筑，head #51）~~ ✅
- ~~地标一键流水线 tools/landmark.py（new/draft/board/gapcheck/final/ship/status）~~ ✅
- ~~标注审图 tools/annotate_board.py；设定漏项检查写进 agent-brief~~ ✅
- ~~渲染管线看板 tools/pipeline_status.sh（任务表 logs/pipeline_tasks.md）~~ ✅
- ~~token 统计 tools/token_report.py + docs/reports/token-usage.html~~ ✅
- ~~项目设计总览 docs/project-design.md；本机清理计划 docs/local-cleanup-plan.md~~ ✅
- ~~CI + 反馈按钮；4 个过时测试 + 跟随版自动检查更新 bug~~ ✅

## 用户待决定
- 上层 v18 审图确认（交付后）。
- 罗斯柴尔德主视角：东南 45°（看得见新月湾）还是正南；全景要统一。
- 房间编号 / 世界书条目编号是否也改英文（建议改，界面名不变）。
- 下层 4 处开工批准。

## 提醒
- 云端按量计费 ¥1.58/时；不用时关机前先确认没有代理在用；余额约 ¥20，上层 16K 前够用。
- 用户在 Clash Verge 加了 DOMAIN-SUFFIX,seetacloud.com,DIRECT；需要 Homebrew rsync；.claude/settings.local.json 放行了 `bash tools/cloud/*`。
