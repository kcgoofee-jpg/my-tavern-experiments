# 审阅简报：upper 第 3 轮

仓库 `/Users/davidzhao/dev1/cctest1/性能/threejs`，分支 `cloud/tc-mid-low`，HEAD `0613f64`，对比基准 `647f12d`。
只读：不改仓库文件、不做 git 操作。图片用 Read 打开。

## 门控阈值（docs/GOAL_v0.9.1.md）
- 严格（不达标不过）：与设定一致 ≥ 7；省流档 2000 px 与 375 px 手机上一眼认出是哪一层、哪片城区；标记可读（对比度 ≥ 4.5，1080p 推流后仍可读）
- 严格：TT 内性能——省流首屏 ≤ 3 s、单层标准档 ≤ 1.5 MB、开关面板 20 次 JS 堆不增长；标准档下无明显瑕疵（只判有 / 无）
- 参考（不阻断）：写实度（≥ 6 为宜）、园林与建筑史、拼缝与重复；8K 局部只抽查明显瑕疵，不打分
- 每条问题标注在哪一档可见（省流 2000 / 标准 4000 / 清晰 8000）；只在清晰档可见的自动降为 P2
- 轮次：每个资产每个版本最多 2 轮；一轮提升 < 0.5 分就提前停；到上限按最高分版本发；遗留进 backlog，不开新轨道
- `art/rp_glance`（RP 玩家扫一眼）可以否决「再开一轮」
- 伊甸在默认视野里一眼最显眼；英式 / 法式 800 m、苏州 / 岭南约 400 m 视野能认出（严格）
- 不做岛影（用户未批准）；航线不计门控
- 每轮除固定人设外，还有一位根据本轮改动现编的审阅者（`tools/review/fresh_persona.md`），分数同等计入。

## 图片 / 材料
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/crops/upper_eden.png`（2400×1800，5561 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/crops/upper_ne.png`（2640×1101，3487 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/crops/upper_north.png`（2080×1200，2883 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/crops/upper_se.png`（2400×1600，4446 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/crops/upper_west.png`（2400×1300，3637 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle10.png`（2133×2132，5461 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle11.png`（2133×2132，5329 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle12.png`（1067×1067，1331 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle13.png`（2132×2133，5239 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle14.png`（1068×1067，1255 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle15.png`（1067×1066，1296 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle16.png`（2132×2133，5506 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle17.png`（2133×2134，5420 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle18.png`（2133×2134，5192 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle19.png`（1067×1067，1334 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle21.png`（1068×1067，1347 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle22.png`（1068×1067，1365 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle23.png`（2134×2134，5522 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle24.png`（1067×1067，1393 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle26.png`（2133×2134，5515 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle27.png`（1067×1067，1366 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle28.png`（1068×1067，1398 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle3.png`（1067×1068，1270 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle31.png`（2132×2133，5293 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle32.png`（1067×1067，1322 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle4.png`（2133×2134，5500 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle5.png`（2133×2133，5289 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle7.png`（2133×2134，5358 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/lu/isle8.png`（1067×1067，1313 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle12.png`（666×667，583 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle14.png`（666×666，506 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle15.png`（666×666，531 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle19.png`（666×667，502 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle21.png`（666×666，523 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle22.png`（666×666，628 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle24.png`（666×667，502 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle27.png`（666×666，571 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle28.png`（666×666，523 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle3.png`（666×666，513 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle32.png`（666×666，517 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/cu/isle8.png`（666×666，515 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_cu_lingnan.jpg`（1800×1200，189 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_cu_suzhou.jpg`（1800×1200，201 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_diff_ghost.jpg`（2000×1250，247 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_diff_switch.jpg`（2000×1250，448 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_eden_8k_half.jpg`（1200×900，145 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_lu_chateau.jpg`（1800×1200，294 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_lu_chateau_blind.jpg`（1800×1200，265 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_lu_english.jpg`（1800×1200，268 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_lu_english_blind.jpg`（1800×1200，241 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_lu_lingnan.jpg`（1800×1200，212 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_lu_lingnan_blind.jpg`（1800×1200，173 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_lu_suzhou.jpg`（1800×1200，207 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_lu_suzhou_blind.jpg`（1800×1200，174 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_phone375.jpg`（375×414，34 KB）
- `/Users/davidzhao/dev1/cctest1/性能/threejs/docs/drafts/upper_v6_r3.jpg`（2000×1250，326 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/phone_375.png`（375×414，214 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/phone_1125.png`（1125×1242，1524 KB）
- `/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/57c58990-cbdd-43c0-a3fd-80a39f5f4561/scratchpad/r3/final/full/norm.png`（2000×1250，3611 KB）

## 本轮改动（编排者说明）
本机接手 B2 第 3 轮：岛影改自发光云彻底去除 + 岛缘白云压边；岭南按 6 座名园 / 村口构图重写；伊甸椭圆草坪去旋转纹；苏州去模板；小法式、林带、丛林块去点阵；普通岛小码头；锚点修正

## 提交记录
```
0613f64 upper B2 round 3: small-French avenue ring, Eden oval rings, selfcheck clean; tc_upper.json re-export (anchors); v6 drafts, lineups, shadow ghost/switch diffs
dbc928b E5 round 3 fixes: host panel overflow P0, estate iframe via blob URL (TT WKWebView), review r2 fixes
b2466d5 README: technical roadmap (architecture, stack, milestones, gates, dev conventions, attribution)
ead789f review: relax render gates to good-enough bar (strict: setting, glance-readability, marker legibility, TT perf; realism/garden/seams advisory; max 2 rounds; rp_glance persona with veto)
7471519 GOAL E6: iOS lean affects preload only, tier cap unchanged
bb26158 GOAL: E6 v0.9.1 tweaks from RP study, E7 one-handed + colour-blind, E8 privacy last (user)
ccdaf1f GOAL E6: scope per adult-player study (per-chat local data, privacy mode, hide-all, inject toggle)
8f8e9fc reviews: RP value study (6 personas + architect): render good-enough bar, top-5 investments, v0.9.1 tweaks
e7d142b reviews: adult RP value study (3 adult personas + architect; clinical, privacy/who-is-where/per-chat local state)
bb3e2e6 upper B2 round 3 (local): emission clouds (no island shadow / sky occlusion), cloud lips, Lingnan rewrite (6 garden families), Eden oval mirror-symmetric, Suzhou de-template, small docks, anchors, de-grid bosquets, rim gaps
0cf1ead roadmap: generalisation waits for user approval
7a81842 roadmap: project background & direction (generic map-centric event dashboard, skills + tutorials for all card authors); refresh todo
08068a0 GOAL: E6 local EdenMap extension API (after E5)
6dd392e events: remove keyword filter (tech compat, no moderation); here: local custom room aliases; docs: EdenMap local extension API
3603504 roadmap: map-to-chat actions next version; docs: content-compat architecture (neutral placeholders, no content)
9b15d4e GOAL F1: ship as external script + worldbook add-on, no card changes (user)
3f9ba38 E5 round 2 prep: map overlays below fixed UI, build code no-wrap, phone glitch note clears zoom group
d0251ab GOAL: replan all-local (cloud quota out), fan bench, three parallel tracks
dc0ab89 Merge branch 'cloud/tc-mid-low' of https://github.com/kcgoofee-jpg/my-tavern-experiments into cloud/tc-mid-low
17fac73 E5 round 1: panel UI unified on map/ui/tokens.css (single gold #e6c36a, single red)
ed109d7 Merge branch 'cloud/tc-mid-low' of https://github.com/kcgoofee-jpg/my-tavern-experiments into cloud/tc-mid-low
fdaf6f6 CLOUD_TASK8 phase 0: blender/estate package scaffold, contract and plan data
7485b59 roadmap: keep landmark glow (too dark without), polish later
75ab3d3 viewer: place markers at exported anchors ax/ay (not on island main buildings)
eabaab1 CLOUD_TASK8: start from zero, no reuse of three.js code/aesthetic
7cf1259 reviews: B2 round 2 gate — stage 2 FAIL, stage 3 conditional pass (remove island shadows)
897f2d6 Merge branch 'cloud/tc-mid-low' of https://github.com/kcgoofee-jpg/my-tavern-experiments into cloud/tc-mid-low
c6ca63a tiancheng mid/low: --no-landmark-glow switch (default off = unchanged) + before/after drafts
bbe0d92 notes + draft: no island shadows / no Eden ring; estate round 4 cancelled — 可以重跑：upper
5b8c290 CLOUD_TASK8: Eden estate Blender rebuild (cutaway tiles preview 6, glTF 3D mode preview 7)
1ee06d0 Merge branch 'cloud/tc-mid-low' of https://github.com/kcgoofee-jpg/my-tavern-experiments into cloud/tc-mid-low
9604a95 viewer: cap max zoom at ~1.25 screen px per image px (no blurry over-zoom); recompute on resize
```

## 改动文件（git diff --stat，不含 map/art 瓦片）
```
 docs/reviews/ui_e5/r2/ui_weak_net.md             |   47 +
 docs/reviews/ui_e5/r2/verdict.md                 |   95 +
 docs/reviews/upper_b2_r2/a_realistic_aerial.md   |   73 +
 docs/reviews/upper_b2_r2/b_setting.md            |   54 +
 docs/reviews/upper_b2_r2/brief.md                |  168 ++
 docs/reviews/upper_b2_r2/c_readability.md        |  107 +
 docs/reviews/upper_b2_r2/d_seams_repetition.md   |  110 +
 docs/reviews/upper_b2_r2/e_garden_history.md     |   81 +
 docs/reviews/upper_b2_r2/f_clouds_phase3.md      |   64 +
 docs/reviews/upper_b2_r2/fresh_r2.md             |   48 +
 docs/reviews/upper_b2_r2/g_routes_check.md       |   22 +
 docs/reviews/upper_b2_r2/h_architect.md          |  164 ++
 docs/tiancheng-maps.md                           |    1 +
 map/data/eden_estate_tiles.json                  | 6951 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 map/data/tc_upper.json                           |   70 +-
 map/estate/assets/CREDITS.md                     |   55 +
 map/events.js                                    |  126 +-
 map/here.mjs                                     |    9 +-
 map/i18n/en.json                                 |   41 +-
 map/i18n/zh.json                                 |   33 +-
 map/tavern/eden-map.js                           |  149 +-
 map/tavern/events.mjs                            |    3 +-
 map/ui/tokens.css                                |   57 +
 map/viewer.html                                  |  791 ++++---
 tests/events.test.mjs                            |    7 +-
 tests/here.test.mjs                              |    7 +
 tools/browser/accept.mjs                         |    6 +-
 tools/browser/lib.mjs                            |    2 +-
 tools/pack_npm.sh                                |    5 +-
 tools/review/README.md                           |   35 +-
 tools/review/pack.py                             |   41 +-
 tools/review/personas/art/garden_history.md      |    2 +-
 tools/review/personas/art/readability.md         |    2 +-
 tools/review/personas/art/realistic_aerial.md    |    2 +-
 tools/review/personas/art/rp_glance.md           |   15 +
 tools/review/personas/art/seams.md               |    2 +-
 tools/review/personas/art/setting.md             |    2 +-
 tools/smoke.sh                                   |    3 +-
 tools/sync_tokens.py                             |   12 +
 105 files changed, 17795 insertions(+), 1190 deletions(-)
```

## 设定事实 / 额外说明
## B2 第 3 轮（最后一轮）· 本机接手说明

**用户决定（优先于 GOAL 原文）**：岛影、航线、伊甸亮云环**不计分**；苏州 / 岭南按「放大到约 400 m 视野宽认得出」判，英式 / 法式按 800 m。门控：每位 ≥ 7 且无 P0。这是最后一轮：分数 < 7 但无 P0 时记遗留、取最佳版本继续；但下面 3 条 P0 **必须清零**：

1. **岛影全部去除**（用户原话「先全部不做阴影，就白色云层遮挡，后续要做的话等我 approve」）。
   本轮做法：`ISLAND_SHADOWS = False` 时云改用「自发光烘焙明暗」材质（`tc_clouds._cloud_mat_emit`），不接收任何灯光与天光 → 岛既不投影、也不遮天光（上一轮还有一圈很淡的天光遮挡暗晕）。云自身的团缝暗部用只看云自身几何的 AO（only_local）。开关打开时恢复旧材质与投影。
   证据：`full/diff_ghost.jpg`（正常版 vs「岛只对相机可见、不参与任何光线」版的差分，×6 放大，绿色 = 岛及外扩掩膜）、`full/diff_switch.jpg`（ISLAND_SHADOWS 开 vs 关），数值见下。
2. **岭南重写**：不再是「灰水泥满铺 + 成排长屋 + 直角方池」。6 座 6 个布局族：isle8 村口（两进小祠堂 + 禾坪 + 半月塘 + 大榕树 + 一列两栋梳式屋）、isle12 大祠堂三进 + 禾坪 + 半月塘 + 西侧曲池园林（水榭、曲桥、三层阁）+ 两栋梳式屋、isle14 可园式（L 形连房 + 四层可楼 + 园外曲岸湖）、isle19 清晖园式（长池 + 船厅 + 廊桥 + 另一头三栋镬耳屋围天井）、isle24 梁园式（池中湖石峰 + 草堂 + 石山六角亭）、isle32 余荫山房式（方池 + 八角池 + 八角水榭 + 廊桥 + 深柳堂）。镬耳山墙：深色墙头宽 1.3 m、高出屋脊 2.6 m；灰绿瓦（苏州是黛黑瓦）；地面是苔绿园地 + 小块麻石天井 / 禾坪。
   请审阅者明确回答：400 m 视野下还会不会读成营房 / 兵营 / 圈舍 / 泳池 / 厂区。
3. **伊甸东侧椭圆下沉草坪**：原来 4 条同向弯折的砾石臂（只有旋转对称、像旋转卐形）→ 改为同心砾石环 + 直十字 + 内圈花环 + 四块镜像花床（东西、南北都镜像对称）。并排查了全部程序化花纹：刺绣花坛卷草（成对镜像）、圆点环、X、十字、玫瑰园 8 辐、迷园（同心环缺口）、狩猎星形林路（直线放射）、以太研究院放射楼（每栋径向对称）——没有只旋转对称的 4 臂图形。请审阅者在 8K 伊甸局部里再找一遍。

**P1（本轮也做了）**：苏州去模板（5 个布局族 bay / islet / twin / court / hill，池 .25–.40 且偏心，court、hill 两座为偏置园、园外竹林，地面改苔地与暖色花街各半，廊宽 .03，轩舫 5–8 座，厅朝向随岛变，twin 加水廊，court 加无池分院，hill 加大假山 + 山顶亭）；去影后岛缘补白云压边（每岛 1–3 瓣、覆盖 15–30 % 周长、优先背光侧、避开码头，伊甸 6 瓣含东南岩楔）；小法式 isle17 / isle31（去外圈树环、岛缘改石墙 / 崖、isle31 去台地墙与斜线）；岛缘林带按角度分段约 60 % 有树、带宽 0.3–1.5 倍；方块丛林去点阵（块 0.7–1.0 倍、树位抖动、抽稀 10–30 %）；草地低频斑块 ±14 %；伊甸岛缘栏杆压暗并每 40–60 m 断开；普通岛都有小码头（苏州白石埠、岭南麻石埠头、英 / 法台阶码头 + 系缆桩）和一条通到主楼 / 园门的小路；标记锚点：伊甸 = 停靠平台，其余 = 主楼旁 6–30 m 的实地（不在树冠、水面、建筑上），气候塔 = 上层环台。

**不改 / 不计**：航线（默认关）、伊甸府邸模型本身（另一代理在 `blender/estate/` 重建）、材质写实化（预计写实分仍 < 7）。

**比例**：8K 局部 8000 px 全宽 = 0.375 m/px；400 m 视野 ≈ 8K 下 1067 px；800 m ≈ 2133 px。并排图 `lu_*` 就是按 400 m（苏 / 岭）/ 800 m（英 / 法）视野宽裁的等像素格；`*_blind` 去标签（A–F）。

## GOAL 未完成项
- ◐ B1 云端：浮岛每岛不同、伊甸放大、园林占多数、航线导出（已到第 4 轮返修）。等 NOTES「可以审阅：upper」。
- ◐ B2 本机：阶段 2 门控（四审阅 + 园林与建筑史 + 架构师）与阶段 3 云海门控（新旧并排）。不过就把意见写回 NOTES 由云端改；最多再 2 轮。 第 1 轮（2026-09-27）：阶段 2 不通过（写实 5 / 设定 6.5 / 可读 6.5 / 重复 5.5 / 园林史 5，有 P0：法式同模板、苏州岭南认不出、树冠太小、默认视野裁掉伊甸），阶段 3 有条件不通过（高岛影子离岛、亮云环读不出），航线仍穿岛；修复清单见 NOTES 与 `docs/reviews/upper_b2/`，还剩 2…
- ☐ B3 本机：上层光晕参数核对（Fog Glow size 无效区间），渲 upper、upper_city 8K（upper_city 用新的中层楼高）→ 局部检查 → 提交瓦片（预览点 ③）。
- ◐ C2 本机：顶奢素材调研完成（`docs/luxury-assets.md`：品牌官方文件只能本机离线出图，网页只能用 CC0 / CC-BY）；衣帽间样板间 `map/estate/closet/` 第 2 轮已提交（室内设计师 A 6.5 / B 7.5，其余复评待回；下一轮：压深柜体色相、地板蜂蜜橡木、清入口动线、手机总览放大）。
- ☐ D3 世界书「地图联动规范」按 v2 更新类型清单（发给用户，不进仓库），与云端的事件视觉样例合并进最终世界书。
- ☐ E2 浏览器验收：省流首屏 ≤ 3 秒（本地服务器）、切层、云雾开关、事态飞行、庄园进出与缩放；桌面与 375px；中 / EN × 深 / 浅。
- ☐ E3 可复用预览脚本在 TT 实测清单整理（给用户）。
- ☐ E5 面板 UI 风格统一重构（放到最后，F 之前）：按 `docs/ui-audit.md` 的规范统一查看器、层切换器、事态横条、地点卡、庄园页 UI（庄园页由云端配合），再跑一遍 E4 的人设测试对比前后分数。
- ☐ E6 v0.9.1 小调整（RP 价值研究 architect.md，约半天）：文档与代码对齐（扫描楼数、已去掉关键词过滤、ui-audit R01 / R02 状态）；省流设备不自动进 3D 庄园；事件窗口最小修（未解除的事件不因楼层旧而丢，`SCAN` 40 → 80）；本机扩展接口收窄为自定义叫法 + `EdenMap.on()`。iOS 拿不到网络 / 内存信息时按省流处理，只影响后台预热与自动进 3D 庄园，清晰度自动档上限仍是「清晰」（用户定）。
- ☐ E7 单手与无障碍（用户 2026-09-27：「难做的话放最后」）：左右手设置（缩放组、层条、抽屉把手、悬浮按钮镜像到拇指侧）、单指缩放（双击后按住上下拖）、控件集中在屏幕下半部拇指区；色盲友好配色开关（事件分类色换成色盲安全色板，形状区分已有）；已有：键盘可达、读屏播报、减少动效、焦点环、触控 ≥ 44 px、axe 0 违规。
- ☐ E8 隐私（用户：「放最后，酒馆本身就隐私」）：按聊天分键的本机数据、`setPrivacy` / `hideAll()` / `setInject`，范围见 `docs/reviews/rp_value_study/adult_architect.md`；已完成：去掉关键词过滤、`here.mjs` 自定义叫法（6dd392e）。
- ☐ F1 VERSION 0.9.1、CHANGELOG（合并两版内容）、version_code、标签、CDN 预热全 200。**用户 2026-09-27：先不改角色卡**（要和作者沟通、兼容作者后续更新，相当于分支）→ 本版交付「外挂脚本（钉在 map-v0.9.1 标签）+ 世界书附加条目」两件，不跑 `build_card.sh`、不出新卡；原「卡文件存在、旧卡删除」门控改为「脚本 JSON 与世界书附加文件存在」。
- ☐ F2 `tools/build_worldbook.py` 合并版世界书（含事件视觉样例、v2 类型清单）。
- ☐ F3 隔离测试酒馆（`st-test`）导入验证：悬浮按钮、地图、庄园、事态落点。
- ☐ F4 用户门控：npm 正式发布（截止约 2026-09-29 16:40，过了跳过）；最终交付清单。

## 用户原话（GOAL 里带日期的要求）
- **每轮审阅还要加一位「现编」审阅者**（用户 2026-09-27：固定提示词会漏掉新问题）：由编排代理根据本轮 git diff、NOTES 最后几节、GOAL 里用户最新的话现编，每轮不同，写明为什么选他，检查点必须落在本轮改动上，分数同等计入门控。模板与流程见 `tools/review/`（`fresh_persona.md`、`pack.py`）。
- 用户要求（2026-09-27）：伊甸看起来约是其他庄园的 10 倍大，以后还要在上面加建。按面积 ≈ 最大普通庄园（isle6）的 10 倍，约线性 2 倍（rx≈3.35、ry≈2.5 单位，约 670 × 500 m）；周围的岛往外推开，不重叠。
- **岛不能长一个样**（用户 2026-09-27：「每个岛都长一个样，这很致命」）。现在全是正椭圆、同一片绿草、同一圈描边、中间一栋楼。要改：
### 合并发版：原 v0.9.1 + v0.9.2 一起发（用户 2026-09-27：不急，细分任务，中途用预览抽检）
- ☒ C3（冻结）云端：按新 `docs/eden-estate.md` 精装重做 + CC0 真实素材（马桶、毛巾级质感），审阅团 ≥ 8（预览点 ⑤）。 **用户 2026-09-27：three.js 版不再改，本版按现状发（含本机手机画质修复 eb85a65）；以后用 Blender 从头建模重做。**
- ☐ E7 单手与无障碍（用户 2026-09-27：「难做的话放最后」）：左右手设置（缩放组、层条、抽屉把手、悬浮按钮镜像到拇指侧）、单指缩放（双击后按住上下拖）、控件集中在屏幕下半部拇指区；色盲友好配色开关（事件分类色换成色盲安全色板，形状区分已有）；已有：键盘可达、读屏播报、减少动效、焦点环、触控 ≥ 44 px、axe 0 违规。
- ☑ 流程改进 1–7（用户 2026-09-27 批准）：① `tools/crops.sh` + 层脚本 `--crops` / `--crops-json`，一次 Blender 会话渲多块局部并核对尺寸；② `tools/review/` 人设模板（美术 5 / UI 5 / 庄园 4）+ 每轮现编人设 + 架构师汇总 + `pack.py` 简报；③ `tools/smoke.sh`；④ `tools/browser/`（Playwright 公共库 + `accept.mjs` E2 验收）；⑤ `t…
- ☐ F1 VERSION 0.9.1、CHANGELOG（合并两版内容）、version_code、标签、CDN 预热全 200。**用户 2026-09-27：先不改角色卡**（要和作者沟通、兼容作者后续更新，相当于分支）→ 本版交付「外挂脚本（钉在 map-v0.9.1 标签）+ 世界书附加条目」两件，不跑 `build_card.sh`、不出新卡；原「卡文件存在、旧卡删除」门控改为「脚本 JSON 与世界书附加文件存在」。
- 清晰度自动调节（用户 2026-09-27 同意）：档位按缩放自动提升（放大到屏幕像素不够时从省流升到标准、清晰），手动选的档位作为上限或关闭自动；弱网 / 手机低内存时不自动升到清晰。
- 8K 渲染在后台跑，不要轮询：等完成通知。**所有代理（审阅、实现、架构师）一律用 Opus，本项目不用 Sonnet**（用户 2026-09-27）。
- 额度（用户 2026-09-27）：不因周额度停下（有重置券）；上面的 90% / 96% 停止线作废，仍保持高效。
## 渲染门控放宽（用户 2026-09-27 同意）

## NOTES_FROM_LOCAL.md 最后两节
## 2026-09-27 本机：B2 第 2 轮门控结果
**结论：阶段 2 不通过；阶段 3（云海）有条件通过，去影即过。还剩 1 轮（第 3 轮）。** 门槛已按用户决定调整：岛影、航线、伊甸亮云环都不计分；苏州 / 岭南按约 400 m 视野宽认得出算过。审阅图用本机按 b94441b 代码重渲的 8K 局部（16 采样，5 块）加 `upper_v5_*` 草稿。全文在 `docs/reviews/upper_b2_r2/`：a–f 审阅、`fresh_r2` 现编审阅、g 航线检查、h 架构师。

| 审阅 | 第 1 轮 | 第 2 轮 | P0（岛影另算，每人都记了 1 条） |
|---|---|---|---|
| A 写实航拍 | 5.0 | 5.5 | 0 |
| B 设定一致 | 6.5 | 6.5 | 0（岭南读成营房，架构师升为 P0） |
| C 俯视可读 | 6.5 | 7.0 | 0 |
| D 拼缝与重复 | 5.5 | 6.5 | 1（岭南同模板） |
| E 园林与建筑史 | 5.0 | 6.5 | 1（苏州 / 岭南同模板） |
| F 云海（阶段 3） | 6.5 | 7.0 | 0 |
| 现编：用 iPad 给跑团写场景的 TRPG 主持人 | — | 6.0 | 0 |

- **硬条件**：
  - 通过：伊甸在默认 1700 m 视野里最显眼（占视野宽 40 %，面积是 isle6 的 11 倍）；英式 / 法式 800 m 认得出（小法式 isle17、isle31 偏弱）；苏州 400 m 认得出；英式 / 法式同风格 6 座说得出区别。
  - 不过：**岭南 400 m 认不出**，读成营房 / 泳池；岭南同风格 6 座里有 3 对分不开；苏州只能靠轮廓勉强分开。
- **航线**：已改为开关、默认关，不计入门控。重跑 `g_routes_check`：8 条航线 0 个采样点进岛，lane 端点都在岸外停靠平台（离岸 1–9 m），离非端点岛最近 36–44 m。遗留 P2：patrol_city 在 isle24 旁只有 19 m。
- 第 1 轮已修好：树冠尺度、法式同模板、水渠出岛、地标岛补园、正圆台地、默认视野、伊甸中轴 / 锚碑 / 观景台、气候塔晶冠、航线穿岛。

#### 云端必须改（第 3 轮，只做下面几条，不加新功能）
1. **P0 去掉全部岛影**（用户指示）。
   - 根因：`tc_clouds.py` `build_cloud_sea` 里的 `cloud_sun` 没设 `light_linking.blocker_collection`，岛体会把影子投到云顶上。
   - 改法：加 `ISLAND_SHADOWS = False`（默认值）。关的时候照 `cloud_sun_base` 的做法，只让云团挡光。`tiancheng_upper.py:244` 的 `shadow_offset_z_gt6` 自检也受这个开关控制。
   - 验收：开、关两版做差分，岛外的云面没有任何差异。本机 8K 局部里看到的暗团，全部坐标见 `f_clouds_phase3.md`（isle22、24、30、21、26、17、15、12，伊甸东缘和东南缘，南码头下方）。
2. **P0 岭南重写**（`est_lingnan`）。
   - 去掉「灰水泥地 + 成排长屋 + 直角方池」这个模板：放在本项目的题材下，读成营房 / 圈舍是不可接受的联想。
   - 改成：半月塘；镬耳山墙在俯视下要有剪影；青砖暗色铺地加巷道；村头加榕树和宗祠。
   - layout 和 plan 分开分配，保证 6 座 6 种组合；院子长宽比在 1.0–1.8 之间，加 L 形院；池占比 .15–.35，位置也要变；至少 2 座的 terrain 不用 meadow。
   - 验收：去标签拼图 6 选 6 都能分开；400 m 下没有审阅者再说营房、泳池或圈舍。
3. **P0 伊甸东侧椭圆草坪的曲路**（`tc_estates.py` `build_eden`，约 1317–1320 行）。
   - 现状：4 条同向弯折的砾石臂绕中心雕像，呈 90° 旋转对称，就是旋转卐形。
   - 改成有镜像对称的图案：同心环加直十字，或成对卷草。
   - 顺带排查刺绣花坛、玫瑰轮等所有程序化花纹。
4. P1 苏州去模板（`est_suzhou`）。
   - 布局族要真正改变构图：池心偏置，池占比 .25–.40；池外铺地减半，多加廊和亭。
   - 至少 2 座不贴岸，厅和桥的朝向随岛变化。
5. P1 去影后给岛缘补白云压边（`_puffs`）。
   - 每座 z > 4 的岛撒 2–4 团小云，盖住岛缘 10–30 % 的周长，不带暗面。
   - 补上伊甸东南云缝里露出的深灰岩楔。
6. P1 小法式岛 isle17、isle31 保证有中轴，isle31 的砾石斜路不要穿过花坛。
   - `build_rim` 的 hedge 段现在是一整圈等宽的「甜甜圈」树环，要分段并留断口。
7. P1 伊甸和 isle30、isle4 的丛林块去点阵：块尺寸在 0.7–1.4 倍之间变，树位用泊松盘并加抖动。
   - 草地、屋顶加低频明度起伏（`top_mat`、`up_roofs_v`）。
   - 伊甸外圈白栏杆压暗，每 40–60 m 断开一次。
8. P1 普通岛也加小码头（`make_dock`）。
…（截断）

## 2026-09-27 本机：任务 8 补充（请务必看）
- 任务 8 **从 0 开始**：不移植、不参考 three.js 版的代码、造型和布局。用户原话「threejs 代码版本问题太多，重复审美太严重」。以 `docs/eden-estate.md` 与公有领域历史府邸为依据，已写进 `CLOUD_TASK8.md` 开头。

## 订正（编排者，优先于上面「本机接手说明」里的门槛句）
门槛按**放宽后的新规则**（本简报顶部「门控阈值」、`tools/review/README.md`）：严格项 = 设定一致 ≥ 7、省流 2000 px / 375 px 一眼可读（伊甸最显眼；英 / 法 800 m、苏 / 岭约 400 m 认得出）、标记可读、标准档无明显瑕疵 + 三条 P0（无岛影、岭南不像营房、无旋转卐形图案）。写实、园林与建筑史、拼缝与重复只作参考。每条问题标注可见档（省流 2000 / 标准 4000 / 清晰 8000），只在清晰档可见的记 P2。本轮是最后一轮，发最佳版本。
关键图：全图 `full/norm.png`（2000 px，32 采样）= `docs/drafts/upper_v6_r3.jpg`；手机 `phone_375.png` / `phone_1125.png`（查看器默认 1700 m 视野、以伊甸为中心）；8K 局部 `crops/upper_*.png`（24 采样）；并排 `docs/drafts/upper_v6_lu_*.jpg`（岭 / 苏 400 m、英 / 法 800 m 视野宽，`_blind` 去标签）、`upper_v6_cu_*.jpg`（200 m 近看）；岛影证据 `upper_v6_diff_ghost.jpg`、`upper_v6_diff_switch.jpg`。
岛影数值（2000 px，岛轮廓外扩 5 px 以外的云区，亮度 0–255）：正常版 vs 岛只对相机可见版：平均 |差| 0.145、p99 1.0、>8 的像素 0.035 %（全部在气候塔本体与伊甸停靠平台上——它们在岛轮廓外但本身是物体）；上一轮代码同一测试：平均 0.93、p99 3.8（有一圈天光遮挡暗晕）。开关打开（--island-shadows 1）后云区 8.6 % 的像素比默认版暗 > 6，证明开关仍可恢复投影。
