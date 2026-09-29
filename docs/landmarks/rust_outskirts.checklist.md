状态：全部完成（2026-09-30）——已完成 new, draft, board, gapcheck, final, ship。tools/landmark.py 自动维护本行与「流程」勾选

# 铁锈与落败领（`rust_outskirts`，site_kavalierki）检查清单

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
- props_shanties｜低矮铁皮棚屋群（坡顶 / 门窗 / 烟囱管 / 阁楼层，形体为仓库推断）｜卡原文
- props_clutter｜巷道杂物（条箱、油桶、板材堆、防水布棚檐、灯杆）｜仓库推断
- props_tank｜锈蚀水塔（四腿钢架 + 罐体 + 锥顶，街区唯一高点）｜仓库推断
- site_ground｜泥土地面 + 主巷与南北巷铺装｜仓库推断
