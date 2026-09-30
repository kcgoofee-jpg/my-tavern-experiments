状态：进行中（2026-09-30）——已完成 new, board, final, ship；下一步 draft。tools/landmark.py 自动维护本行与「流程」勾选

# 荣光冠冕（`glory_crown`，site_kavalierki）检查清单

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
- props_main｜圆桌骑士议事殿：环形列柱 18 根 + 鼓座 + 穹顶 + 冠环（12 尖齿 + 顶光球）｜卡原文（议事殿），形制仓库推断
- props_arena｜太阳骑士大竞技场：椭圆外墙 + 三层看台 + 沙场 + 四向半环拱门 + 场角四灯塔｜卡原文（竞技场），形制仓库推断
- props_tower｜商业联合会大厦：三段退台塔身 + 玻璃幕带 + 塔冠桁架与尖顶｜卡原文（大厦），形制仓库推断
- props_club｜会所：门廊列柱 + 山花 + 玻璃前厅 + 露台水池｜卡原文（会所），形制仓库推断
- site_ground｜台地铺装（r≈148）+ 环路 + 四条放射大道 + 八向台阶 + 四角草坪｜仓库推断
- props_lights｜广场 12 灯柱 + 场外 4 泛光塔｜仓库推断
