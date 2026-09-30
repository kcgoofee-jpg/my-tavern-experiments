状态：进行中（2026-09-30）——已完成 new, board, final, ship；下一步 draft。tools/landmark.py 自动维护本行与「流程」勾选

# 以太穹顶（`ether_dome`，site_kavalierki）检查清单

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
- props_dome｜穹顶本体：20 道石肋 + 肋间玻璃幕扇 + 顶部以太核心球
- props_field｜两圈悬浮发光场环 + 四支以太晶簇
- site_ground｜台基（r=70）+ 环道 + 四向台阶 + 边缘栏杆
- props_lights｜12 支灯柱
