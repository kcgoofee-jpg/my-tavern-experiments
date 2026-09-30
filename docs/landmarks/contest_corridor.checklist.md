状态：进行中（2026-09-30）——已完成 new, board, final, ship；下一步 draft。tools/landmark.py 自动维护本行与「流程」勾选

# 竞赛与狂欢回廊（`contest_corridor`，site_kavalierki）检查清单

## 流程

- ~~new：脚手架（build.py / 设定 / 清单 / manifest）~~ ✅
- draft：草图（16 spp，本机或渲染队列）
- ~~board：审查看板（主视角 + 侧 / 底视，带编号标注）~~ ✅
- gapcheck：设定 ↔ 看板缺口核对（评审代理，见 docs/landmark-pipeline.md）
- ~~final：定稿（64 spp）+ 标准 / 低档 glb（按预算）+ 清单热点~~ ✅
- ~~ship：地图标记「查看三维模型」+ 世界书附加条目 + card-buildings + 测试~~ ✅

## 看板条目

<!-- 每行一条：- 组名｜说明｜卡原文 或 仓库推断。组名 = build.py 里的 Batch 名（props_* / site_*），
     board 按它找锚点，final 按它写热点。gapcheck 把这里与设定稿并排给评审代理。核对过的条目可 ~~划掉~~ ✅。 -->
- props_gallery｜回廊本体：沿 r=200 m 环带的两层拱廊（27 根柱 + 券墙 + 上层窗带 + 檐部金线 + 坡屋面）｜卡原文（回廊名），形制仓库推断
- props_lists｜比试场：74×44 m 沙地 + 木栏 + 四级看台 + 无字几何旗门｜仓库推断
- props_fair｜狂欢区：四顶方帐 + 中央圆亭 + 半径 24 m 巨轮（纹样化，无字）｜仓库推断
- site_ground｜环带台基（80 m 宽）+ 外侧环道 + 中央大道 + 两侧草坪与行道树｜仓库推断
- props_lights｜廊前 9 根灯柱 + 灯串｜仓库推断
