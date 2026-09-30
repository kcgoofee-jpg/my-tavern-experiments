状态：进行中（2026-09-30）——已完成 new；下一步 draft。tools/landmark.py 自动维护本行与「流程」勾选

# 第三席封地（`fief3`，site_fief3）检查清单

## 流程

- ~~new：脚手架（build.py / 设定 / 清单 / manifest）~~ ✅
- draft：草图（16 spp，本机或渲染队列）
- board：审查看板（主视角 + 侧 / 底视，带编号标注）
- gapcheck：设定 ↔ 看板缺口核对（评审代理，见 docs/landmark-pipeline.md）
- final：定稿（64 spp）+ 标准 / 低档 glb（按预算）+ 清单热点
- ship：地图标记「查看三维模型」+ 世界书附加条目 + card-buildings + 测试

## 看板条目

<!-- 每行一条：- 组名｜说明｜卡原文 或 仓库推断。组名 = build.py 里的 Batch 名（props_* / site_*），
     board 按它找锚点，final 按它写热点。gapcheck 把这里与设定稿并排给评审代理。核对过的条目可 ~~划掉~~ ✅。 -->
- site_terrain｜地形（草地 / 滩沙 / 崖石三种材质的高度场）｜仓库推断
- props_water｜水面（湖 / 海 / 河；无水的封地为空组）｜仓库推断
- props_castle｜城堡：石墙 + 角塔 + 门楼 + 主塔楼 + 内院大厅｜卡原文
- props_order｜骑士团驻地：院墙 + 营房 + 马厩 + 校场 + 瞭望塔｜卡原文
- props_village｜领地城镇：民居 + 钟塔大厅 + 井 + 集市摊棚｜仓库推断
- props_fields｜领地农田：条垄作物 + 草垛｜仓库推断
- props_roads｜土路｜仓库推断
- props_trees｜树木与篱林｜仓库推断
- props_extra｜专属：河上石桥｜仓库推断
