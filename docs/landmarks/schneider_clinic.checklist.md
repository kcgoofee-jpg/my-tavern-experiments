状态：全部完成（2026-09-30）——已完成 new, draft, board, gapcheck, final, ship。tools/landmark.py 自动维护本行与「流程」勾选

# 施奈德精密改造诊所（`schneider_clinic`，tc_mid）检查清单

## 流程

- ~~new：脚手架（build.py / 设定 / 清单 / manifest）~~ ✅
- ~~draft：草图（16 spp，本机或渲染队列）~~ ✅
- ~~board：审查看板（主视角 + 侧 / 底视，带编号标注）~~ ✅
- ~~gapcheck：设定 ↔ 看板缺口核对（评审代理，见 docs/landmark-pipeline.md）~~ ✅
- ~~final：定稿（64 spp）+ 标准 / 低档 glb（按预算）+ 清单热点~~ ✅
- ~~ship：地图标记「查看三维模型」+ 世界书附加条目 + card-buildings + 测试~~ ✅

## 看板条目

<!-- 每行一条：- 组名｜说明｜卡原文 或 仓库推断。组名 = build.py 里的 Batch 名（props_* / site_*），
     board 按它找锚点，final 按它写热点。gapcheck 把这里与设定稿并排给评审代理。核对过的条目可 ~~划掉~~ ✅。 -->
- props_clinic｜三层石灰石对称立面 + 双柱门廊 + 板石四坡顶带老虎窗（联排宅邸式）｜卡原文
- props_wing｜东侧车库与悬浮车 + 西后玻璃温室｜仓库推断
- props_front｜铁艺栅栏 + 双开门 + 门柱灯 + 黄杨球 / 整形树 + 石水盆｜仓库推断
- site_ground｜砾石与铺装前院 + 人行道 + 街面｜仓库推断
