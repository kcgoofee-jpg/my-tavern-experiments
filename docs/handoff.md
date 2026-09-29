# 交接（新对话从这里接上）

> 仓库已迁到 ~/dev1/cctest1/eden-map（2026-09-28；旧路径 性能/threejs 不再存在）。
> 状态（2026-09-28）：~~删除线~~ ✅ = 已完成；没划掉的 = 待办。新对话先读本页 + docs/agent-brief.md + docs/project-design.md + logs/pipeline_tasks.md。

## 当前在跑（旧对话里，完成后结果会推到 cloud/tc-mid-low）

- 上层 v18：8 座岛逐座建模 + 设定漏项检查 + 标注审图（一次一座，简单岛用 Sonnet）。交付 docs/drafts/upper_v18_<id>_board.jpg + 岛底对比条，然后停下等用户确认。
- ~~3D 查看器镜头操作（head #53）~~ ✅ 待补：自动旋转开关进设置页；鼠标滚轮=平移是否要改为缩放（看用户反馈）。

## 顺序（额度紧，2–3 个代理以内）

0. ~~世界书真正全自动（用户 2026-09-28 明确要求：打开地图时没有这本书就自动建好并挂到当前角色的附加世界书，版本变了静默同步，只一次提示，数据与映射里一个总开关可关）+ 旧对话兼容（别名表单一来源、退役条目降优先级、每聊天版本提醒、「你改过，上游也改了」）。head #52 只做了按钮和附加绑定，写入仍需点击——代理出于谨慎没做全自动，需要新任务按用户决定实现并先给架构评审。~~ ✅ 分支 feat/worldbook-auto（待合进 cloud/tc-mid-low；浏览器验收 tools/browser/th_adopt.mjs 未在本机跑）。
1. 上层 v18 交付 → 用户确认 → 全景合成草图 → 云端 16K 定稿 + 切瓦片。
2. 恢复世界层：~~原域修雾 / 上半山方盒 / 鼓楼 / 礼拜堂 / 地面道路 → 云端定稿~~ ✅ 看板 docs/drafts/world_v2_yuanyu_board.jpg → **等用户确认**后 glb → 圣都 3–4 景。遗留（评审）：城区外缘硬圆边 + 灰平面、城区楼型单一、岩石材质偏均匀、悬空步道无支撑。
3. ~~中层剩 2 座：骑士团营区（草图在 scratchpad/wt-mid，分支 mid-buildings）、维多利亚的公寓 —— 走 tools/landmark.py。~~ ✅ head #54：new/draft/board/gapcheck（r1 建筑 7 / 卡 7.5）/final/ship 全过，标准+低档 glb、世界书条目、card-buildings 都接好；顺带把中层 8K/128spp 底图按 head #51 配方重渲 + 切瓦片；修了 tools/render_queue.sh 的一处中文粘连 unbound variable。
~~4. 纵深系统浏览体验 U15–U18（视差 / 漂浮、按远近显示标签、图例、手机「看全区」按钮）~~ ✅ 2026-09-29（细节见 `docs/ui-refactor-backlog.md` U15–U18；纵深数据由 `nav.mjs` 按 `maps.json` 的 depth 字段取，标记 → 岛的对应写在该层标记的 `island` 字段）+ ~~合并 4 套云雾（U19）~~ ✅ C2。
5. 庄园地下室 B1/B2 精修（单独一条，不并行）→ 本地道具包接口（用户自带 glb、本地存储、点选放置、只做技术校验）。
6. 下层 4 处（等用户批准）。
7. 标准提高：上层 16K/512spp、各层斜视版、昼夜四版（白天/黄昏/夜/雨）。
8. ~~代码整理（云雾合并、单一伊甸定义、冻结 pack schema、拆 eden-map.js）~~ ✅ C2 完成（模块地图在 docs/agent-brief.md）→ 本机清理（docs/local-cleanup-plan.md）→ 文件夹改名 + 英文命名统一（要所有代理空闲）→ git 瘦身 + 瓦片移出仓库（要用户放行强推）→ 上层真 3D → 创意工坊。
9. 最后：报告归档到 docs/reports/、仓库装修、衣帽间、人物。

## 已完成（本轮）

- ~~云渲染：AutoDL RTX 4080 SUPER（connect.weste.seetacloud.com:25307，密钥 ~/.ssh/autodl_ed25519），tools/cloud/*（doctor/setup/sync/render/bench/status/stop/idle_guard/render_split、多机 hosts/*.env），渲染队列 tools/render_queue.sh~~ ✅
- ~~实测：中层 8K/128spp 云端约 4.5 分钟、约 ¥0.13；草图主要卡 CPU 搭场景（59 s 搭 / 7 s 渲）~~ ✅
- ~~中层 8K 底图重渲（含 7 座新建筑，head #51）~~ ✅
- ~~地标一键流水线 tools/landmark.py（new/draft/board/gapcheck/final/ship/status）~~ ✅
- ~~标注审图 tools/annotate_board.py；设定漏项检查写进 agent-brief~~ ✅
- ~~渲染管线看板~~（2026-09-28 用户要求删除；查状态用 tools/cloud/status.sh + tools/render_queue.sh status）
- ~~token 统计 tools/token_report.py + docs/reports/token-usage.html~~ ✅
- ~~项目设计总览 docs/project-design.md；本机清理计划 docs/local-cleanup-plan.md~~ ✅
- ~~CI + 反馈按钮；4 个过时测试 + 跟随版自动检查更新 bug~~ ✅

## C2 整理遗留（2026-09-28）

- ~~`tools/check_render_deps.py` 仍把 `blender/landmarks/lm_anchors.py`（只给 landmark.py board 出锚点）算作 tc_mid / tc_low 上游~~ ✅ 已在 NOT_UPSTREAM（tools/check_render_deps.py:29-30），2026-09-29 验证不再误报。
- ~~浏览器 `tools/browser/pack_town.mjs`「宿主：注入句用包的分类与标签」在 00087eea（整理前）就失败（inj 为空）~~ ✅ 2026-09-29 复验全绿（feat/worldbook-auto 合入后自愈）。
- `tools/browser/th_adopt.mjs`「B1 第一次点只是『再点一次确认』」整理前后同样失败（世界书全自动先建好了书，写入按钮不再走二次确认），测试要跟全自动对齐。
- 分支 URL（@cloud/tc-mid-low）加载时新入口可能配到 CDN 旧的 host-*.mjs：warm_cdn 已先清模块再清入口；跟随加载器按提交号加载，不受影响。

## 待查：人物栏「推断 · 和你在一起」（用户 2026-09-28 截图，开局前状态）✅ 已修（2026-09-28，tests/characters.test.mjs 三用例：开局前 / 在场表久未变 / 占位项）

- 修法：`characters.mjs collectChars` 新增 `presentFloor` 参数（在场表最后更新楼）——`now ≤ 0` 时在场表的人不推断同处，标 `prelude`（UI 复用 `ch.pre`「开局前 · 卡初始值」）；`now - presentFloor > PRESENT_STALE(30)` 时降级为未知（`place=''`、`stale=N`，floor 保留上次明确楼）；注入不再输出无位置项。`eden-map.js` 扫窗口内各楼 UpdateVariable 原文（m.raw）提在场表名得 presentFloor，从没提过 = 整个窗口未变。`mvu.mjs presentList` 占位 / 空槽（空串、null、数字）不再算在场人物（只按结构）。UI（map/chars.mjs）：「推断」悬停说明来源；降级态显示「未知 · 在场表 N 楼未变 · 上次明确位置在第 N 楼」。
- 原理（map/tavern/characters.mjs collectChars）：位置来源优先级 MVU 位置字段 → 聊天隐藏标签 ⌖人物 → 推断。人物在 MVU「在场人物/在场角色」表里但没写位置字段、且 20 楼内没有位置标签时，标为 infer，显示「推断 · 和你在一起」（地点取 世界.当前地点 的第一处）。
- 可能的 bug，逐条验证：
  1. 开局前（卡初始值）玩家还没有位置，在场表却有人 → 全员显示「和你在一起」，误导。开局前应显示「开局前 · 卡初始」而不是「和你在一起」，或不做同处推断。
  2. 模型不维护在场表时，在场表长期不变 → 早已离开的人一直被推断和你同处。需要「在场表多少楼没变就降级为未知」的衰减。
  3. 在场表项可能是卡模板占位或非人物条目（如「临时-NN」这类槽位）→ 确认 presentList 只收人物项；不按内容过滤，只按结构（有无人物字段）判断。
  4. 推断地点取「世界.当前地点」第一处：当前地点是多处 / 层级写法不一致时可能落错点。（未动：解析链与 here.mjs 同源，暂无复现）
  5. canonName 名字归并：别名 / 同名不同人可能合并错。（未动：已有「唯一前缀才认」守卫，暂无复现）
  6. 同一人既有旧标签（>20 楼）又在在场表 → 旧标签被推断覆盖是预期，但在 UI 上看不出曾有明确位置；考虑显示「上次明确位置 N 楼前」。
- 1. 同一人既有旧标签（>20 楼）又在在场表 → 旧标签被推断覆盖是预期，但在 UI 上看不出曾有明确位置；考虑显示「上次明确位置 N 楼前」。（已随 stale 降级态部分落地：悬停显示上次明确位置楼号）

## 小修：3D 查看器界面（用户 2026-09-28 截图 docs/reports/bug_3d_viewer_ui_0928.webp，Sonnet 小修，版本号走第 4 段）

- 部件编号圈 1 压在「外观/内透/剖切」切换条上；顶部的 2 被裁掉一半 → 编号圈避开 UI 区，出屏的收到边缘。
- 编号圈 8、9（还有 2）挤在一起重叠 → 近距离的做避让 / 合并成一组。
- 视角预设条（俯视/斜视 45°/正面/自由）和右侧缩放栏挤在一起，「正面」被对准按钮顶住 → 重排，不和缩放栏共用一角。
- 操作提示卡压住模型下半部分和视角按钮；最后一行「0 复位」断成两行 → 卡片放宽或改两列，别和按钮区重叠。
- 模型：塔楼顶部一块纯白方块、左侧裙楼顶一条粉色长条，看起来像招牌 / 发光面没贴图 → 查是哪个建筑的材质缺失（先确认建筑 id）。
- 信息按钮（i）高亮成黄色但没有打开的面板 → 确认状态是否对。
- 地图「提示」里加一条（用户 2026-09-28）：改历史楼层 / 重生成对地图的影响——swipe、删楼、改楼、开分支地图会自动重算；但手改历史楼层里的位置文字，MVU 不回头重算，地图不跟着变，要在最后一楼改或在那一楼开分支重生成。放进代码线小修。

## 用户已决定（2026-09-28）

- 第 8 步整理提前做：分支收尾 → ~~代码整理（等世界书代理做完再拆 eden-map.js）~~ ✅ → 本机清理 → 改名（全代理空闲时一个提交）→ git 瘦身。
- 同意强推 git 历史；房间编号 / 世界书条目编号改英文（界面名不变，别名表兼容）；上层 v18 暂停（WIP 已提交 upper-v18 4a79a10f）。
- 云端不关机，空了就排已确认内容。
- 新顺序（用户 2026-09-28 同意）：改名 + 挪仓库 → 双线：渲染（上层 v18 流水线：Mac 做 N+1 草图时云端出 N 定稿；简单岛 Sonnet、招牌岛 Opus；审图 2–3 座一批；云端空档排昼夜/斜视，先中层夜景霓虹）∥ 代码（先做：浏览器测试改跑真 SillyTavern + 酒馆助手（无界面，本机/CI），模拟版只做兜底 + 真/模拟对照测试；再做人物栏推断 6 bug → U15–U19 各一个 Sonnet 小任务）→ git 瘦身（大批新渲染入库前）→ 额度空档写设定稿（圣都、下层 4 处、地下室参考图板）。
- 发版前用户实测：给一份 5 分钟检查清单（真酒馆测试做完后写）。
- 罗斯柴尔德主视角：用户无所谓，定东南 45°（看得见新月湾），全景统一。
- ~~第 3 步改名~~ ✅（草图、skill 指引、世界书编号、仓库迁到 eden-map 全部完成）（用户 2026-09-28 同意，一起改）：~~docs/drafts 36 张中文名草图（顺带删无引用的）~~ ✅（9 张有引用改英文，27 张无引用删除）、~~skills/card-map/guides 4 个~~ ✅（`nsfw.md`/`architecture.md`/`panel-ui.md`/`style.md`）、世界书条目编号 58 条改英文（界面名不变，别名表兼容旧对话 + 测试）——未做，不动 worldbook；最后把仓库 threejs 挪出来改名为 ~/dev1/cctest1/eden-map（性能/ 本身不动）（本机 worktree、.claude 记忆目录、云端同步路径一起迁）——脚本 `tools/migrate_repo_path.sh` 已写好（未运行，支持 DRY_RUN=1），等原域和小修代理都结束后停机执行。

## 用户待决定

- ~~原域 v2 审图确认~~ ✅ 用户 2026-09-28 确认（评审遗留项以后精修）；挪仓库后出 glb → 圣都。
- 上层 v18 审图确认（交付后）。
- 房间编号 / 世界书条目编号是否也改英文（建议改，界面名不变）。
- 下层 4 处开工批准。

## 提醒

- 云端按量计费 ¥1.58/时；不用时关机前先确认没有代理在用；余额约 ¥20，上层 16K 前够用。云端目前按用户要求保持开机，不要关。
- 用户在 Clash Verge 加了 DOMAIN-SUFFIX,seetacloud.com,DIRECT；需要 Homebrew rsync；.claude/settings.local.json 放行了 `bash tools/cloud/*`。

## 会话收尾状态（2026-09-28 深夜，pi 重启前）

- 本机环境：python3(homebrew) 丢失 Pillow 已装回（`pip install --user --break-system-packages Pillow`，现 12.3.0），smoke 全绿；`.pi/` 已进 .gitignore。
- render-deps 4 条告警（upper/upper_city/mid/low 的 dzi 落后上游）：主因 b6a92c7d 渲染守卫重构碰了脚本但没改视觉，误报性质；中下层白天版渲完后自然消，上层等 v18。无需动作。
- 原域圣山 glb 预览三视角已看图判定（docs/drafts/world_v2_yuanyu_glb_preview{,_ground,_summit}.jpg）：整体成立，可作圣都风格基线；新增 2 精修点（大教堂背面白色凸出方块、雕像圈个别雕像悬出平台）＋既有遗留（楼型单一、城市外缘硬边、步道悬空）。
- 中层夜景草稿 map/art/_mid_night_draft.png（worktree agent-ab82fcbc59b7d3a5b 未提交）已看图：整体成立；3 疑点待查：右上暖黄矩形亮斑（疑似自发光面贴错）、左上环形竞技场全黑无灯、两角死黑。
- 在途代理 4 个（重启后按分支/worktree 收，结果文件在 /var/folders/_9/5rp6wlhn4kvcfqvcp24g5dlw0000gn/T/acp-delegate/）：
  - del_mula96f9_secj viewer3d UI 小修 → fix-viewer3d-ui-0928（/tmp/eden_wt_viewer3d），before/after 截图待看图判定
  - del_mula96fd_ph0r 浏览器测试对齐 → fix-browser-tests-wbauto（/tmp/eden_wt_btests）
  - del_mula96fc_173a 原域预览（已出图）＋圣都镜头清单 docs/drafts/holy_city_shotlist_draft.md → holy-city-shotlist（/tmp/eden_wt_world）
  - del_mulahqeq_j51b 中下层 --day 白天版＋2 张 2000px 草稿 → day-version-mid-low（/tmp/eden_wt_day），出图待用户看
- 下一步（重启后）：收 4 代理结果看图判定 → 用户确认白天版草稿＋圣都清单 → 中下层白天 8K 上云 → viewer3d 小修合入走 0.9.5.x。
- 白天版第一轮草稿已出＋看图判定（/tmp/eden_wt_day/map/art/_mid_day_draft.png、_low_day_draft.png，分支 day-version-mid-low 提交 cad966f6）：结构/材质切换全部正确（霓虹变暗漆、轨道金属、灯圈关）；**共同问题：两张都偏暗、太阳天顶角 40° 太低、投影过长**——中层路面全黑像阴天傍晚，下层浊暖灰接近可用。下一步（重启后第一件事）：tc_common SUN_ROT 天顶角调到 55–65°＋天光/曝光 +0.3~0.5，重出两张 2000px 草稿，用户确认后中下层白天 8K×2 上云（云 ssh 链路正常，队列空、贴图 sync 齐全）。
- ph0r（浏览器测试对齐）30 分钟超时被 watchdog 强杀（exit 143）：分支 fix-browser-tests-wbauto 原零提交，已代提交 WIP `0119734d`（th_adopt 半成品＋根因诊断：`runCheck` 的 `checkP ??=` memo 使自检只跑一次→书自动建好后红线按钮判定失效；`#wbUndo` 需 wb-inspect 后才渲染。修法：撤销检查挪到看差异后＋reload 新实例等首次自检含 6s 复查）。重启后重派时按此诊断直接修，先让现有 3 个失败测试过、场景页后补，别再 30 分钟里全做。
