状态：全部完成（2026-09-30）——已完成 new, draft, board, gapcheck, final, ship。tools/landmark.py 自动维护本行与「流程」勾选

# 清算转运站（`clearing_depot`，site_kavalierki）检查清单

## 流程

- ~~new：脚手架（build.py / 设定 / 清单 / manifest）~~ ✅
- ~~draft：草图（16 spp，本机或渲染队列）~~ ✅
- ~~board：审查看板（主视角 + 侧 / 底视，带编号标注）~~ ✅
- ~~gapcheck：设定 ↔ 看板缺口核对（评审代理，见 docs/landmark-pipeline.md）~~ ✅
- ~~final：定稿（64 spp）+ 标准 / 低档 glb（按预算）+ 清单热点~~ ✅
- ~~ship：地图标记「查看三维模型」+ 世界书附加条目 + card-buildings + 测试~~ ✅

## 看板条目

<!-- 每行一条：- 组名｜说明。组名 = build.py 里的 Batch 名（props_* / site_*），
     board 按它找锚点，final 按它写热点。gapcheck 把这里与设定稿并排给评审代理。核对过的条目可 ~~划掉~~ ✅。 -->
- props_depot｜货运货棚（砖墙铁皮坡顶 + 推拉门 + 高窗）+ 两层办公楼 + 外挂钢梯
- props_rail｜两条到发线（木枕 + 钢轨）+ 两节棚车一节敞车 + 门式起重机（装卸吊臂）
- props_yard｜围栏 + 正门门架 + 托盘 / 条箱垛 + 油桶 + 两只货柜
- site_ground｜碴石场院 + 货棚前混凝土硬化面
