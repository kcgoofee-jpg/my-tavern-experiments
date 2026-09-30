状态：进行中（2026-09-30）——已完成 new, board, final, ship；下一步 draft。tools/landmark.py 自动维护本行与「流程」勾选

# 旷野高地（`highland`，site_highland）检查清单

## 流程

- ~~new：脚手架（build.py / 设定 / 清单 / manifest）~~ ✅
- draft：草图（16 spp，本机或渲染队列）
- ~~board：审查看板（主视角 + 侧 / 底视，带编号标注）~~ ✅
- gapcheck：设定 ↔ 看板缺口核对（评审代理，见 docs/landmark-pipeline.md）
- ~~final：定稿（64 spp）+ 标准 / 低档 glb（按预算）+ 清单热点~~ ✅
- ~~ship：地图标记「查看三维模型」+ 世界书附加条目 + card-buildings + 测试~~ ✅

## 看板条目

<!-- 每行一条：- 组名｜说明。组名 = build.py 里的 Batch 名（props_* / site_*），
     board 按它找锚点，final 按它写热点。gapcheck 把这里与设定稿并排给评审代理。核对过的条目可 ~~划掉~~ ✅。 -->
- site_plateau｜旷野高地台地
- site_cliff｜崖壁（层理陡崖 + 崖脚倒石堆 + 崖线岩台）
- site_trail｜下山小径（东侧肩坡 Z 字折返土路）
- props_scorch｜焦黑的地面
- props_rocks｜巨石与露头
- site_vegetation｜枯草与矮树
