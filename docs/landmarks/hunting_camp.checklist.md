状态：进行中（2026-09-30）——已完成 new, draft, board, gapcheck, final；ship 待引擎支持世界图地点的三维入口（模型 / glb / 清单已入库）。tools/landmark.py 自动维护本行与「流程」勾选

# 猎季营地（`hunting_camp`，world）检查清单

## 流程

- ~~new：脚手架（build.py / 设定 / 清单 / manifest）~~ ✅
- ~~draft：草图（16 spp，本机或渲染队列）~~ ✅
- ~~board：审查看板（主视角 + 侧 / 底视，带编号标注）~~ ✅
- ~~gapcheck：设定 ↔ 看板缺口核对（评审代理，见 docs/landmark-pipeline.md）~~ ✅
- ~~final：定稿（64 spp）+ 标准 / 低档 glb（按预算）+ 清单热点~~ ✅
- ship：地图标记「查看三维模型」+ 世界书附加条目 + card-buildings + 测试（待办：世界图地点卡不支持模型链接，节点树也要求三维页有一个承载它的标记；需引擎侧先支持，再加 lm_hunting_camp 条目）

## 看板条目

<!-- 每行一条：- 组名｜说明。组名 = build.py 里的 Batch 名（props_* / site_*），
     board 按它找锚点，final 按它写热点。gapcheck 把这里与设定稿并排给评审代理。核对过的条目可 ~~划掉~~ ✅。 -->
- props_marquee｜宴会大帐（双坡帆布 + 扇形檐饰 + 帐杆与几何纹样旗杆）
- props_tents｜六顶私人圆帐 + 野外厨房帐（烟囱 / 木箱 / 酒桶）
- props_camp｜营火圈 + 长凳 / 折叠桌 + 灯笼杆与灯串 + 拴马桩 + 空犬舍 + 三辆悬浮车
- props_trees｜林缘秋色阔叶林（橙红 / 赭黄 / 金黄）+ 几株常绿
- site_ground｜落叶泥地 + 踏出的小径
