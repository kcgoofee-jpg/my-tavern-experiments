# 审阅简报：upper 第 2 轮

仓库 `/Users/davidzhao/dev1/cctest1/性能/threejs`，分支 `cloud/tc-mid-low`，HEAD `62b281c`，对比基准 `40090dc`。
只读：不改仓库文件、不做 git 操作。图片用 Read 打开。

## 门控阈值（docs/GOAL_v0.9.1.md）
- 同阶段 1（每人 ≥ 7、架构师通过），另加「园林与建筑史」审阅
- 伊甸在默认视野里一眼最显眼；每种风格在 800 m 视野下能认出
- 随手挑 6 座同风格的岛并排，审阅者说得出各自的区别
- 最多 3 轮
- 每轮除固定人设外，还有一位根据本轮改动现编的审阅者（`tools/review/fresh_persona.md`），分数同等计入。

## 图片 / 材料
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r2/crops/upper_eden.png`（2400×1800，5582 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r2/crops/upper_ne.png`（1760×1100，2300 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r2/crops/upper_north.png`（2080×1200，2741 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r2/crops/upper_se.png`（2400×1100，2911 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r2/crops/upper_west.png`（2240×1300，3247 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_crop800.jpg`（534×533，34 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_eden.jpg`（1480×1180，258 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_landmarks.jpg`（1440×960，197 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_lineup_chateau.jpg`（1440×960，177 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_lineup_chateau_blind.jpg`（1440×960，145 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_lineup_english.jpg`（1440×960，175 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_lineup_english_blind.jpg`（1440×960，144 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_lineup_lingnan.jpg`（1440×960，159 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_lineup_lingnan_blind.jpg`（1440×960，127 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_lineup_suzhou.jpg`（1440×960，170 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_lineup_suzhou_blind.jpg`（1440×960，140 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_lingnan_isle12.jpg`（481×481，24 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_old_vs_new_clouds.jpg`（1210×1250，206 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_r1.jpg`（2000×1250，344 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_shadow_isle5.jpg`（880×880，58 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v5_suzhou_isle22.jpg`（466×466，27 KB）

## 本轮改动（编排者说明）
云端第 2 轮（b94441b / e06af99）：按第 1 轮修复清单 1–11 改风格分配、重写苏州 / 岭南、树冠放大、法式 5 布局族 + 3 平面、地标岛补整园、台地不规则、岛缘分段、云参数、航线改岸外平台、伊甸园林核心与锚碑、标记 ax/ay、气候塔晶冠。本机：默认视野 1700 m；航线开关默认关。

## 提交记录
```
62b281c viewer: auto clarity tier goes up to HD on phones too (std only for low-mem / save-data / 2g-3g)
834bc37 user decisions: freeze three.js estate (Blender rebuild later), routes overlay default off, relax upper gate (no Eden cloud ring, suzhou/lingnan at 400 m)
9a3012e NOTES: user directive — no island shadows on cloud sea until approved
d8b0f81 tooling: process improvements 1-7 (multi-crop, review harness, smoke, browser harness, ship, NOTES union, quiet lock)
248fec8 Merge branch 'cloud/tc-mid-low' of https://github.com/kcgoofee-jpg/my-tavern-experiments into cloud/tc-mid-low
23343e6 tiles: tiancheng mid + low 8K after A7 (64 samples)
e06af99 notes: upper B2 round 2 done — 可以审阅：upper
8f8bacf Merge remote-tracking branch 'origin/cloud/tc-mid-low' into HEAD
b94441b upper B2 round 2: style reassignment, suzhou/lingnan rewrite, real-size trees, chateau families, landmark gardens, irregular terraces, cloud shadow/ring, routes outside islands, marker anchors
```

## 改动文件（git diff --stat，不含 map/art 瓦片）
```
 docs/drafts/upper_v5_lineup_suzhou_blind.jpg     |  Bin 0 -> 143785 bytes
 docs/drafts/upper_v5_lingnan_isle12.jpg          |  Bin 0 -> 25570 bytes
 docs/drafts/upper_v5_old_vs_new_clouds.jpg       |  Bin 0 -> 211677 bytes
 docs/drafts/upper_v5_r1.jpg                      |  Bin 0 -> 352614 bytes
 docs/drafts/upper_v5_selfcheck.json              |  145 ++
 docs/drafts/upper_v5_shadow_isle5.jpg            |  Bin 0 -> 59569 bytes
 docs/drafts/upper_v5_suzhou_isle22.jpg           |  Bin 0 -> 28292 bytes
 docs/tooling.md                                  |   84 ++
 docs/upper-estates.md                            |  168 ++-
 map/data/tc_upper.json                           | 4876 +++++++++++++++++++++++++++++++-------------------------------
 map/viewer.html                                  |   10 +-
 tools/browser/README.md                          |   34 +
 tools/browser/accept.mjs                         |  152 ++
 tools/browser/lib.mjs                            |  228 +++
 tools/browser/package.json                       |    8 +
 tools/crops.sh                                   |   59 +
 tools/quiet.sh                                   |   24 +
 tools/quiet_wait.sh                              |   20 +
 tools/render_all.sh                              |    2 +
 tools/review/README.md                           |   35 +
 tools/review/architect_synthesis.md              |   11 +
 tools/review/fresh_persona.md                    |   33 +
 tools/review/pack.py                             |  153 ++
 tools/review/personas/art/garden_history.md      |   17 +
 tools/review/personas/art/readability.md         |   17 +
 tools/review/personas/art/realistic_aerial.md    |   17 +
 tools/review/personas/art/seams.md               |   17 +
 tools/review/personas/art/setting.md             |   17 +
 tools/review/personas/estate/architect.md        |   14 +
 tools/review/personas/estate/interaction_perf.md |   15 +
 tools/review/personas/estate/interior.md         |   14 +
 tools/review/personas/estate/luxury_marketer.md  |   14 +
 tools/review/personas/ui/a11y.md                 |   17 +
 tools/review/personas/ui/design.md               |   17 +
 tools/review/personas/ui/phone.md                |   17 +
 tools/review/personas/ui/rp.md                   |   17 +
 tools/review/personas/ui/weak_net.md             |   17 +
 tools/ship.sh                                    |   47 +
 tools/smoke.sh                                   |   67 +
 61 files changed, 5479 insertions(+), 3056 deletions(-)
```

## 设定事实 / 额外说明
# B2 第 2 轮 · 本机补充事实（审阅必读）

## 用户新指示（2026-09-27，覆盖旧门控里的「岛影」条目）
用户原话：「这些岛的阴影也全都一样看着水滴很诡异，先全部不做阴影，就白色云层遮挡，后续要做的话等我 approve」。
- **岛影一律不打分、不要求**（不评影子方向、柔边、与岛形是否一致；也不要建议「改进影子」）。
- 改为检查：**白色云层遮挡岛底**是否读得好（岛是否仍读成「浮在云上」、岛底 / 岩根被白云吃掉的边是否自然、有没有硬切线或灰边）。
- 画面里**如仍有任何岛影**（投到云上的暗团、影子贴片、岛下暗斑）→ 记为 **必须去除项**（P0，归云端 `tc_clouds.py` / `tiancheng_upper.py`，加 `ISLAND_SHADOWS=False` 开关）。注：本轮草稿是去影指示之前渲的，所以大概率还带影子——照实记为必须去除，但不因此扣「云层本身」的分。

## 用户决定（NOTES 834bc37「用户决定」，同样覆盖旧门控）
- **航线**：已改成查看器里的选项开关、默认关。航线检查照做、照报，但**不计入门控**，本轮云端不改。审阅者不因航线扣分。
- **伊甸外圈亮云环：删掉**，不要求、不打分（伊甸靠尺寸与结界圈显眼）。
- **苏州、岭南**：门槛改为「放大到约 **400 m** 视野宽能认出」（8K 下约 1070 px 宽）；英式、法式仍按 800 m。
- 岛影：去掉（见上），默认关。

## 第 1 轮
分数：写实 5.0 / 设定 6.5 / 可读 6.5 / 拼缝重复 5.5 / 园林史 5.0 / 云海 6.5。全文与修复清单 1–14：`docs/reviews/upper_b2/`（h_architect.md）与 `NOTES_FROM_LOCAL.md`「## 2026-09-27 本机：B2 上层门控结果」。云端第 2 轮回复：NOTES「## 2026-09-27 云端：B2 上层第 2 轮」与 `docs/upper-estates.md`，自检 `docs/drafts/upper_v5_selfcheck.json`。

## 门控（阶段 2，已按用户决定调整）
每人 ≥ 7、无 P0、架构师通过；伊甸在默认视野（`maps.json` tc_upper `width_m` 现为 1700，extent 3000 × 1875 m）一眼最显眼；英式 / 法式在 800 m 视野宽能认出，苏州 / 岭南在约 400 m 视野宽能认出；邻岛（尤其同风格）有区别。航线、亮云环、岛影不计入。

## 图片
- `docs/drafts/upper_v5_*.jpg`：云端第 2 轮草稿（2000 px 全图 r1、四风格 lineup 与去标签 _blind 拼图、landmarks、eden、crop800、old_vs_new_clouds、shadow_isle5、suzhou_isle22、lingnan_isle12）。
- `<scratch>/crops/upper_*.png`：本机按当前代码重渲的 **8K 局部（8000 px 全宽 = 0.375 m/px，16 采样，有噪点属正常，不扣分）**：eden（x .40–.70, y .28–.64）、west（isle22 苏 / isle14 岭 / isle13 英 / isle11 法）、ne（isle30 法 / isle24 岭 / isle10 英 / isle16 法）、se（isle12 岭 / isle15 苏 / isle31 法 / isle25 英）、north（isle8 岭 / isle21 苏 / isle26 法 / isle17 法）。800 m 宽视野约 = 8K 下 2133 px。
- 线上 `map/art/tc_upper.dzi` 仍是旧版瓦片（未重渲），不要用它评本轮。

## 岛表（id 风格 中心 nx,ny 半径 m 布局族 平面）
见 `map/data/tc_upper.json` islands[]；风格分布英 11 / 法 8 / 苏 6 / 岭 6。

## 航线数值检查（本机重跑，方法同 `docs/reviews/upper_b2/g_routes_check.md`，25× 加密）
全部 8 条 route 0 个采样点落入任何岛 outline；6 条 lane 端点都在岸外（离 outline 1–9 m，即停靠平台中心，平台半径约 20–30 m 半伸出岸线）；非端点岛最小净距 36–44 m；patrol 67 m；patrol_city 最小 19 m（isle24，低于 40 m 目标，放不下时回退到 15 m 的规则内）；isle9→silver_crown 有一个拐点离某岛 4 m。
## 查看器（本机）现状
`map/viewer.html` 航线开关已加（默认关）；针脚尚未用 `ax / ay`（本机第 13 条未做）；默认视野 1700 m 已改。

## GOAL 未完成项
- ◐ B1 云端：浮岛每岛不同、伊甸放大、园林占多数、航线导出（已到第 4 轮返修）。等 NOTES「可以审阅：upper」。
- ◐ B2 本机：阶段 2 门控（四审阅 + 园林与建筑史 + 架构师）与阶段 3 云海门控（新旧并排）。不过就把意见写回 NOTES 由云端改；最多再 2 轮。 第 1 轮（2026-09-27）：阶段 2 不通过（写实 5 / 设定 6.5 / 可读 6.5 / 重复 5.5 / 园林史 5，有 P0：法式同模板、苏州岭南认不出、树冠太小、默认视野裁掉伊甸），阶段 3 有条件不通过（高岛影子离岛、亮云环读不出），航线仍穿岛；修复清单见 NOTES 与 `docs/reviews/upper_b2/`，还剩 2…
- ☐ B3 本机：上层光晕参数核对（Fog Glow size 无效区间），渲 upper、upper_city 8K（upper_city 用新的中层楼高）→ 局部检查 → 提交瓦片（预览点 ③）。
- ◐ C2 本机：顶奢素材调研完成（`docs/luxury-assets.md`：品牌官方文件只能本机离线出图，网页只能用 CC0 / CC-BY）；衣帽间样板间 `map/estate/closet/` 第 2 轮已提交（室内设计师 A 6.5 / B 7.5，其余复评待回；下一轮：压深柜体色相、地板蜂蜜橡木、清入口动线、手机总览放大）。
- ☐ D3 世界书「地图联动规范」按 v2 更新类型清单（发给用户，不进仓库），与云端的事件视觉样例合并进最终世界书。
- ☐ E2 浏览器验收：省流首屏 ≤ 3 秒（本地服务器）、切层、云雾开关、事态飞行、庄园进出与缩放；桌面与 375px；中 / EN × 深 / 浅。
- ☐ E3 可复用预览脚本在 TT 实测清单整理（给用户）。
- ☐ E5 面板 UI 风格统一重构（放到最后，F 之前）：按 `docs/ui-audit.md` 的规范统一查看器、层切换器、事态横条、地点卡、庄园页 UI（庄园页由云端配合），再跑一遍 E4 的人设测试对比前后分数。
- ☐ F1 VERSION 0.9.1、CHANGELOG（合并两版内容）、version_code、标签、`build_card.sh`、CDN 预热全 200。
- ☐ F2 `tools/build_worldbook.py` 合并版世界书（含事件视觉样例、v2 类型清单）。
- ☐ F3 隔离测试酒馆（`st-test`）导入验证：悬浮按钮、地图、庄园、事态落点。
- ☐ F4 用户门控：npm 正式发布（截止约 2026-09-29 16:40，过了跳过）；最终交付清单。

## 用户原话（GOAL 里带日期的要求）
- **每轮审阅还要加一位「现编」审阅者**（用户 2026-09-27：固定提示词会漏掉新问题）：由编排代理根据本轮 git diff、NOTES 最后几节、GOAL 里用户最新的话现编，每轮不同，写明为什么选他，检查点必须落在本轮改动上，分数同等计入门控。模板与流程见 `tools/review/`（`fresh_persona.md`、`pack.py`）。
- 用户要求（2026-09-27）：伊甸看起来约是其他庄园的 10 倍大，以后还要在上面加建。按面积 ≈ 最大普通庄园（isle6）的 10 倍，约线性 2 倍（rx≈3.35、ry≈2.5 单位，约 670 × 500 m）；周围的岛往外推开，不重叠。
- **岛不能长一个样**（用户 2026-09-27：「每个岛都长一个样，这很致命」）。现在全是正椭圆、同一片绿草、同一圈描边、中间一栋楼。要改：
### 合并发版：原 v0.9.1 + v0.9.2 一起发（用户 2026-09-27：不急，细分任务，中途用预览抽检）
- ☒ C3（冻结）云端：按新 `docs/eden-estate.md` 精装重做 + CC0 真实素材（马桶、毛巾级质感），审阅团 ≥ 8（预览点 ⑤）。 **用户 2026-09-27：three.js 版不再改，本版按现状发（含本机手机画质修复 eb85a65）；以后用 Blender 从头建模重做。**
- ☑ 流程改进 1–7（用户 2026-09-27 批准）：① `tools/crops.sh` + 层脚本 `--crops` / `--crops-json`，一次 Blender 会话渲多块局部并核对尺寸；② `tools/review/` 人设模板（美术 5 / UI 5 / 庄园 4）+ 每轮现编人设 + 架构师汇总 + `pack.py` 简报；③ `tools/smoke.sh`；④ `tools/browser/`（Playwright 公共库 + `accept.mjs` E2 验收）；⑤ `t…
- 清晰度自动调节（用户 2026-09-27 同意）：档位按缩放自动提升（放大到屏幕像素不够时从省流升到标准、清晰），手动选的档位作为上限或关闭自动；弱网 / 手机低内存时不自动升到清晰。
- 8K 渲染在后台跑，不要轮询：等完成通知。**所有代理（审阅、实现、架构师）一律用 Opus，本项目不用 Sonnet**（用户 2026-09-27）。
- 额度（用户 2026-09-27）：不因周额度停下（有重置券）；上面的 90% / 96% 停止线作废，仍保持高效。

## NOTES_FROM_LOCAL.md 最后两节
## 2026-09-27 本机：用户新指示——上层云海**去掉所有岛影**（P0，优先于 B2 清单第 5 条）
- 用户原话：「这些岛的阴影也全都一样看着水滴很诡异，先全部不做阴影，就白色云层遮挡，后续要做的话等我 approve」。
- 请在 `tc_clouds.py` / `tiancheng_upper.py` 里关闭全部岛影（投到云上的影子、影子贴片、岛下暗团都不要），只保留白色云层对岛底的遮挡。给一个开关（如 `ISLAND_SHADOWS = False`）留着，默认关，用户批准后再开。
- 去影后请更新草稿，并在 NOTES 写「可以重跑：upper」。本机的 B2 第 2 轮门控会忽略岛影一项。

## 2026-09-27 本机：用户决定（请云端照此调整）
- **庄园 three.js 冻结**：用户原话「three.js 不改了，后续需要重新用 blender 从头建模的」。**任务 7 第 4 轮取消**，`map/estate/` 不要再改（本版按现状发，含本机 eb85a65 的手机画质修复）。庄园以后走 Blender 从头建模，另开任务。
- **航线**：做成和云雾一样的选项开关，默认关（本机查看器已改）。B2 第 2 轮如果航线仍穿岛，**本轮不再改**，发版后再说；不计入门控。
- **上层门控放宽 / 删项**（用户同意）：
  - 伊甸外圈亮云环：**去掉**（伊甸靠尺寸与结界圈已最显眼）。
  - 苏州、岭南「800 m 视野认得出」改为「放大到约 400 m 视野认得出」。
  - 岛影：已去掉（见上一节），默认关。
- **城市（本机自己处理）**：交界暗带、城中村屋顶、九龙直边本版接受现状；地标光圈 / 描边去不去，本机出对比图给用户定。
