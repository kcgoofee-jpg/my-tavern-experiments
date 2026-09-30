状态：进行中（2026-10-01）——已完成 new, draft, board, final；下一步 gapcheck。tools/landmark.py 自动维护本行与「流程」勾选

# 原域城区（`yuanyu_city`，yuanyu_city）检查清单

## 流程

- ~~new：脚手架（build.py / 设定 / 清单 / manifest）~~ ✅
- ~~draft：草图（16 spp，本机或渲染队列）~~ ✅
- ~~board：审查看板（主视角 + 侧 / 底视，带编号标注）~~ ✅
- gapcheck：设定 ↔ 看板缺口核对（评审代理，见 docs/landmark-pipeline.md）
- ~~final：定稿（64 spp）+ 标准 / 低档 glb（按预算）+ 清单热点~~ ✅
- ship：地图标记「查看三维模型」+ 世界书附加条目 + card-buildings + 测试

## 看板条目

<!-- 每行一条：- 组名｜说明｜卡原文 或 仓库推断。组名 = build.py 里的 Batch 名（props_* / site_*），
     board 按它找锚点，final 按它写热点。gapcheck 把这里与设定稿并排给评审代理。核对过的条目可 ~~划掉~~ ✅。 -->
- site_ground｜青石街巷 + 朝圣广场地面与同心铺石环｜卡原文
- props_gate｜东侧城墙 + 双塔东门 + 东门大道｜仓库推断
- props_plaza｜朝圣广场：24 尊黑白交替无面容长袍立像 + 中心石盘｜卡原文
- props_spires｜尖塔区：哥特式白石高屋 + 深蓝坡顶 + 细长尖塔｜卡原文
- props_domes｜穹顶区：巴洛克鼓座穹顶屋（铜绿 / 白石）+ 金色灯亭｜卡原文
- props_lamps｜煤气灯式魔导路灯（暖金）｜卡原文
