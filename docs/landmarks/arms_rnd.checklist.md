状态：进行中（2026-09-30）——已完成 new, draft, board；下一步 gapcheck。tools/landmark.py 自动维护本行与「流程」勾选

# 魔导军工研发中心（`arms_rnd`，site_kavalierki）检查清单

## 流程

- ~~new：脚手架（build.py / 设定 / 清单 / manifest）~~ ✅
- ~~draft：草图（16 spp，本机或渲染队列）~~ ✅
- ~~board：审查看板（主视角 + 侧 / 底视，带编号标注）~~ ✅
- gapcheck：设定 ↔ 看板缺口核对（评审代理，见 docs/landmark-pipeline.md）
- final：定稿（64 spp）+ 标准 / 低档 glb（按预算）+ 清单热点
- ship：地图标记「查看三维模型」+ 世界书附加条目 + card-buildings + 测试

## 看板条目

<!-- 每行一条：- 组名｜说明｜卡原文 或 仓库推断。组名 = build.py 里的 Batch 名（props_* / site_*），
     board 按它找锚点，final 按它写热点。gapcheck 把这里与设定稿并排给评审代理。核对过的条目可 ~~划掉~~ ✅。 -->
- props_lab｜三层实验主楼（混凝土板 + 金属带窗）+ 入口六边锁纹 + 屋顶以太聚能环｜仓库推断
- props_yard｜圆形约束场 + 立式试架与装甲挂板 + 架空导束管 + 设备柜 / 灯杆｜仓库推断
- site_ground｜混凝土场坪 + 泥地周边 + 约束场圆台｜仓库推断
