状态：全部完成（2026-09-30）——已完成 new, draft, board, gapcheck, final, ship。tools/landmark.py 自动维护本行与「流程」勾选

# 货运站（`freight_yard`，tc_low）检查清单

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
- props_shed｜砖砌货棚（铁皮顶 + 推拉门 + 高窗）+ 货运站台 + 钢柱披檐｜仓库推断
- props_rail｜三条主线 + 岔线（枕木 / 钢轨 / 碴石）+ 车挡｜卡原文
- props_signal｜桁架信号门架 + 两层扳道房 + 外挂钢梯｜仓库推断
- props_stock｜停着的旧货车（棚车 / 油罐车 / 敞车）｜仓库推断
- props_yard｜集装箱堆场 + 托盘 / 油桶 / 废料堆 + 灯杆 + 围栏｜仓库推断
- site_ground｜碴石道床 + 站台前硬化面｜仓库推断
