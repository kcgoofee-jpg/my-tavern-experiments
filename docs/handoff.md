# 交接（新对话从这里接上）

> 状态（2026-09-28）：~~删除线~~ ✅ = 已完成；没划掉的 = 待办。新对话先读本页 + docs/agent-brief.md + docs/project-design.md + logs/pipeline_tasks.md。

## 当前在跑（旧对话里，完成后结果会推到 cloud/tc-mid-low）
- 上层 v18：8 座岛逐座建模 + 设定漏项检查 + 标注审图（一次一座，简单岛用 Sonnet）。交付 docs/drafts/upper_v18_<id>_board.jpg + 岛底对比条，然后停下等用户确认。
- ~~3D 查看器镜头操作（head #53）~~ ✅ 待补：自动旋转开关进设置页；鼠标滚轮=平移是否要改为缩放（看用户反馈）。

## 顺序（额度紧，2–3 个代理以内）
0. ~~世界书真正全自动（用户 2026-09-28 明确要求：打开地图时没有这本书就自动建好并挂到当前角色的附加世界书，版本变了静默同步，只一次提示，数据与映射里一个总开关可关）+ 旧对话兼容（别名表单一来源、退役条目降优先级、每聊天版本提醒、「你改过，上游也改了」）。head #52 只做了按钮和附加绑定，写入仍需点击——代理出于谨慎没做全自动，需要新任务按用户决定实现并先给架构评审。~~ ✅ 分支 feat/worldbook-auto（待合进 cloud/tc-mid-low；浏览器验收 tools/browser/th_adopt.mjs 未在本机跑）。
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

## 待查：人物栏「推断 · 和你在一起」（用户 2026-09-28 截图，开局前状态）
- 原理（map/tavern/characters.mjs collectChars）：位置来源优先级 MVU 位置字段 → 聊天隐藏标签 ⌖人物 → 推断。人物在 MVU「在场人物/在场角色」表里但没写位置字段、且 20 楼内没有位置标签时，标为 infer，显示「推断 · 和你在一起」（地点取 世界.当前地点 的第一处）。
- 可能的 bug，逐条验证：
  1. 开局前（卡初始值）玩家还没有位置，在场表却有人 → 全员显示「和你在一起」，误导。开局前应显示「开局前 · 卡初始」而不是「和你在一起」，或不做同处推断。
  2. 模型不维护在场表时，在场表长期不变 → 早已离开的人一直被推断和你同处。需要「在场表多少楼没变就降级为未知」的衰减。
  3. 在场表项可能是卡模板占位或非人物条目（如「临时-NN」这类槽位）→ 确认 presentList 只收人物项；不按内容过滤，只按结构（有无人物字段）判断。
  4. 推断地点取「世界.当前地点」第一处：当前地点是多处 / 层级写法不一致时可能落错点。
  5. canonName 名字归并：别名 / 同名不同人可能合并错。
  6. 同一人既有旧标签（>20 楼）又在在场表 → 旧标签被推断覆盖是预期，但在 UI 上看不出曾有明确位置；考虑显示「上次明确位置 N 楼前」。
- 做法：先写复现用例（tests/characters.test.mjs 加开局前、在场表不变、占位项三种），再改；UI 上「推断」加悬停说明来源和楼层。

## 用户已决定（2026-09-28）
- 第 8 步整理提前做：分支收尾 → 代码整理（等世界书代理做完再拆 eden-map.js）→ 本机清理 → 改名（全代理空闲时一个提交）→ git 瘦身。
- 同意强推 git 历史；房间编号 / 世界书条目编号改英文（界面名不变，别名表兼容）；上层 v18 暂停（WIP 已提交 upper-v18 4a79a10f）。
- 云端不关机，空了就排已确认内容。

## 用户待决定
- 上层 v18 审图确认（交付后）。
- 罗斯柴尔德主视角：东南 45°（看得见新月湾）还是正南；全景要统一。
- 房间编号 / 世界书条目编号是否也改英文（建议改，界面名不变）。
- 下层 4 处开工批准。

## 提醒
- 云端按量计费 ¥1.58/时；不用时关机前先确认没有代理在用；余额约 ¥20，上层 16K 前够用。
- 用户在 Clash Verge 加了 DOMAIN-SUFFIX,seetacloud.com,DIRECT；需要 Homebrew rsync；.claude/settings.local.json 放行了 `bash tools/cloud/*`。
