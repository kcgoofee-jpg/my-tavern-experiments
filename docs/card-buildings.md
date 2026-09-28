# 卡里的建筑与地点：上图与三维模型进度

用户 2026-09-28：卡里提到的**每一处**建筑 / 地点都要 (a) 在地图上有标记，(b) 有合乎背景的**标准质量**三维模型（标准档 glb + 低档 glb，从标记的「查看三维模型」进 `map/props/viewer3d.html`，清单带中立热点；草稿 → 两人设评审：建筑写实 ≥7、卡忠实度 ≥7 → 定稿）。

来源：`docs/card-digest.md`「全部具名地点」、`docs/card-omissions.md` A 节、`maps.json` 原 `unplaced`，加上 2026-09-28 对本地卡副本的补读（地名后缀检索 + 段落精读；新增项见下文「补读新增」）。地名一律照抄卡原名（2026-09-28 用户决定，不再用运行时绑定）。

列说明：
- **标记**：✅ 已有；🆕 本轮新加（层与位置为**仓库推断**，`layer_src: repo-inferred`，世界书附加条目 `addon_places.json` 同步）。
- **模型**：— 没有；精简 = 只有低档 glb、未评审；标准 = 标准档 + 低档 glb、两轮评审通过。
- **优先级**：P1 开局相关 → P2 机构 → P3 其他（ROADMAP「卡里建筑三维化」按这个顺序做）。
- 上层悬浮岛的参考板与草稿由另一任务做（`blender/upper_islands/`，`docs/upper-islands-references.md`），落地后接过来做定稿，不重复做草稿。伊甸庄园（含室内）另案处理，不在本表。

| 优先级 | 地图 | id | 名称 | 标记 | 层 / 位置来源 | 模型 | 质量 | 备注 |
|---|---|---|---|---|---|---|---|---|
| P1 开局 | site_highland | `cliff_edge` | 崖壁 | ✅ | 卡 | — | — | 开局七 |
| P1 开局 | site_highland | `highland_plateau` | 旷野高地 | ✅ | 卡 | 旷野高地 `map/props/highland/` | 标准（r4 7 / 7） | 开局七 |
| P1 开局 | tc_low | `junk_market` | 旧货市场 | ✅ | 卡 + 推断位置 | 铁皮屋区与旧货市场 `map/props/lower_quarter/` | 标准（r3 7 / 7） | 开局六 |
| P1 开局 | tc_low | `ruined_churches` | 废弃教堂区 | ✅ | 卡 + 推断位置 | 废弃教堂区 `map/props/ruined_churches/` | 标准（r2 7 / 8） | 开局四 |
| P1 开局 | tc_low | `tin_shacks` | 铁皮屋区 | ✅ | 卡 + 推断位置 | 铁皮屋区与旧货市场 `map/props/lower_quarter/` | 标准（r3 7 / 7） | 开局六 |
| P1 开局 | tc_low | `well7` | 7 号井黑市 | ✅ | 卡 | 层间检查点与 7 号井 `map/props/well7/`（link3d） | 标准（r2 8 / 7） | 视觉样例 / 开局 |
| P1 开局 | tc_mid | `checkpoint_c` | 层间检查点 | ✅ | 卡 | 层间检查点与 7 号井 `map/props/well7/`（link3d） | 标准（r2 8 / 7） | 视觉样例 / 开局 |
| P1 开局 | tc_mid | `old_apartment` | 旧公寓楼 | ✅ | 卡 + 推断位置 | 旧公寓楼 `map/props/old_apartment/` | 标准（r3 7.5 / 7） | 开局六 |
| P1 开局 | tc_mid | `radiance_cathedral` | 辉光大教堂 | ✅ | 卡 | 辉光大教堂 `map/props/cathedral/` | 标准（r3 7.5 / 7） | 开局八 |
| P1 开局 | tc_upper | `kelly_residence` | 凯莉的宅邸 | ✅ | 用户决定 | 凯莉的宅邸 `map/props/kelly_residence/` | 标准（r2 7 / 8） | 开局三 |
| P1 开局 | tc_upper | `pm_residence` | 首相府 | ✅ | 卡 + 推断位置 | 首相府 `map/props/pm_residence/` | 标准（r2 7 / 7） | 开局五 |
| P2 机构 | tc_low | `amc_facility` | 资产管理委员会下层设施 | ✅ | 卡 | 委员会下层设施 `map/props/amc_facility/` | 标准（r3 7 / 8） |  |
| P2 机构 | tc_low | `enforcement_low` | 执法局下层分局 | ✅ | 卡 | 执法局下层分局 `map/props/enforcement_low/` | 标准（r3 7.5 / 7） |  |
| P2 机构 | tc_low | `outpost` | 防卫军前沿哨所 | ✅ | 卡 | 防卫军前沿哨所 `map/props/outpost/` | 标准（r1 7 / 7） |  |
| P2 机构 | tc_low | `prison` | 监狱 | 🆕 | 仓库推断 | 监狱（外观）`map/props/prison/` | 标准（r1 7 / 7） |  |
| P2 机构 | tc_low | `soup_kitchen` | 圣光教会施粥站 | ✅ | 卡 | 施粥站 `map/props/soup_kitchen/` | 标准（r1 7 / 7） |  |
| P2 机构 | tc_mid | `admin_council` | 天城政务院 | 🆕 | 仓库推断 | 中层政务区 `map/props/civic_core/` | 标准（r2 7.5 / 7） |  |
| P2 机构 | tc_mid | `barracks_ring` | 环城军营带 | ✅ | 卡 | 军营带与军事学院 `map/props/barracks/` | 标准（r2 7.5 / 7.5） |  |
| P2 机构 | tc_mid | `butler_academy` | 天城贵族管家学院 | 🆕 | 仓库推断 | 天城贵族管家学院 `map/props/butler_academy/` | 标准（r1 7 / 7.5） |  |
| P2 机构 | tc_mid | `council` | 天城议会 | ✅ | 卡 + 推断位置 | 中层政务区 `map/props/civic_core/` | 标准（r2 7.5 / 7） |  |
| P2 机构 | tc_mid | `culture_office` | 天城文化署 | 🆕 | 仓库推断 | 中层政务区 `map/props/civic_core/` | 标准（r2 7.5 / 7） |  |
| P2 机构 | tc_mid | `enforcement_hq` | 天城执法局总局 | ✅ | 卡 | 执法局总局 `map/props/enforcement_hq/` | 标准（r3 7 / 7.5） |  |
| P2 机构 | tc_mid | `executive_office` | 天城执政厅 | 🆕 | 仓库推断 | 中层政务区 `map/props/civic_core/` | 标准（r2 7.5 / 7） |  |
| P2 机构 | tc_mid | `iron_cradle` | 圣铁摇篮 | ✅ | 卡 | 圣铁摇篮 `map/props/iron_cradle/` | 标准（r2 7 / 7） |  |
| P2 机构 | tc_mid | `knights_camp` | 骑士团营区 | ✅ | 用户决定 | 骑士团营区 `map/props/knights_camp/` | 标准（r1 7 / 7.5） |  |
| P2 机构 | tc_mid | `mage_tower` | 法师塔 | 🆕 | 仓库推断 | 法师塔 `map/props/mage_tower/` | 标准（r1 7 / 7.5） |  |
| P2 机构 | tc_mid | `merc_guild` | 佣兵公会 | ✅ | 卡 | 佣兵公会 `map/props/merc_guild/` | 标准（r1 7 / 7） |  |
| P2 机构 | tc_mid | `mid_care_home` | 中层养老院 | ✅ | 卡 | 中层关怀带 `map/props/care_cluster/` | 标准（r1 7 / 7） |  |
| P2 机构 | tc_mid | `mid_hospital` | 中层公立医院 | ✅ | 卡 | 中层关怀带 `map/props/care_cluster/` | 标准（r1 7 / 7） |  |
| P2 机构 | tc_mid | `mid_monastery` | 中层修道院 | ✅ | 卡 | 中层关怀带 `map/props/care_cluster/` | 标准（r1 7 / 7） |  |
| P2 机构 | tc_mid | `military_academy` | 军事学院 | 🆕 | 仓库推断 | 军营带与军事学院 `map/props/barracks/` | 标准（r2 7.5 / 7.5） |  |
| P2 机构 | tc_mid | `reserve_office` | 天城中央储备署 | 🆕 | 仓库推断 | 中层政务区 `map/props/civic_core/` | 标准（r2 7.5 / 7） |  |
| P2 机构 | tc_mid | `starabyss_univ` | 星渊大学 | ✅ | 卡 | 星渊大学 `map/props/starabyss_univ/` | 标准（r1 7 / 7.5） |  |
| P2 机构 | tc_mid | `storm_hall` | 风暴殿 | 🆕 | 仓库推断 | 风暴殿 `map/props/storm_hall/` | 标准（r1 7.5 / 7.5） |  |
| P2 机构 | tc_mid | `supreme_court` | 最高法院 | ✅ | 卡 + 推断位置 | 天城大学与最高法院 `map/props/tiancheng_univ_court/` | 标准（r1 7.5 / 7.5） |  |
| P2 机构 | tc_mid | `tiancheng_univ` | 天城大学 | ✅ | 用户决定 | 天城大学与最高法院 `map/props/tiancheng_univ_court/` | 标准（r1 7.5 / 7.5） |  |
| P2 机构 | tc_upper | `climate_tower` | 以太气候调节塔 | ✅ | 卡 + 推断位置 | 气候调节塔 `map/props/climate_tower/` | 标准（r2 7 / 8） |  |
| P2 机构 | tc_upper | `silver_crown` | 银冠堡 | ✅ | 卡 | 银冠堡 `map/props/silver_crown/` | 标准（r1 7 / 7.5） |  |
| P3 其他 | site_fief1 | `fief1_castle` | 第一席城堡 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief1 | `fief1_fields` | 第一席领地农田 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief1 | `fief1_order` | 第一席骑士团驻地 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief1 | `fief1_village` | 第一席领地城镇 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief2 | `fief2_castle` | 第二席城堡 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief2 | `fief2_fields` | 第二席领地农田 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief2 | `fief2_order` | 第二席骑士团驻地 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief2 | `fief2_village` | 第二席领地城镇 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief3 | `fief3_castle` | 第三席城堡 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief3 | `fief3_fields` | 第三席领地农田 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief3 | `fief3_order` | 第三席骑士团驻地 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief3 | `fief3_village` | 第三席领地城镇 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief4 | `fief4_castle` | 第四席城堡 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief4 | `fief4_fields` | 第四席领地农田 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief4 | `fief4_order` | 第四席骑士团驻地 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief4 | `fief4_village` | 第四席领地城镇 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief5 | `fief5_castle` | 第五席城堡 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief5 | `fief5_fields` | 第五席领地农田 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief5 | `fief5_lists` | 第五席比武场 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief5 | `fief5_order` | 第五席骑士团驻地 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_fief5 | `fief5_village` | 第五席领地城镇 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_highland | `trail_down` | 下山小径 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | site_kavalierki | `arms_rnd` | 魔导军工研发中心 | 🆕 | 仓库推断 | — | — |  |
| P3 其他 | site_kavalierki | `clearing_depot` | 清算转运站 | ✅ | 卡 | — | — |  |
| P3 其他 | site_kavalierki | `contest_corridor` | 竞赛与狂欢回廊 | ✅ | 卡 | — | — |  |
| P3 其他 | site_kavalierki | `elite_club` | 顶级贵族与财阀会所 | ✅ | 卡 | — | — |  |
| P3 其他 | site_kavalierki | `ether_dome` | 以太穹顶 | ✅ | 卡 | — | — |  |
| P3 其他 | site_kavalierki | `free_knight_camp` | 独立骑士黑市营地 | ✅ | 卡 | — | — |  |
| P3 其他 | site_kavalierki | `glory_crown` | 荣光冠冕 | ✅ | 卡 | — | — |  |
| P3 其他 | site_kavalierki | `linguang_post` | 临光家族外城驻所 | ✅ | 卡 | — | — |  |
| P3 其他 | site_kavalierki | `round_table_hall` | 圆桌骑士议事殿 | ✅ | 卡 | — | — |  |
| P3 其他 | site_kavalierki | `rust_outskirts` | 铁锈与落败领 | ✅ | 卡 | — | — |  |
| P3 其他 | site_kavalierki | `sun_arena` | 太阳骑士大竞技场 | ✅ | 卡 | — | — |  |
| P3 其他 | site_kavalierki | `union_tower` | 商业联合会联合大厦 | ✅ | 卡 | — | — |  |
| P3 其他 | tc_low | `blood_mill` | 血肉磨坊 | ✅ | 卡 | — | — |  |
| P3 其他 | tc_low | `freight_yard` | 货运站 | ✅ | 卡 + 推断位置 | — | — |  |
| P3 其他 | tc_low | `lower_bar` | 下层区酒吧 | 🆕 | 仓库推断 | — | — |  |
| P3 其他 | tc_low | `slums` | 贫民窟 | 🆕 | 仓库推断 | — | — |  |
| P3 其他 | tc_mid | `rebirth_workshop` | 新生工坊 | 🆕 | 仓库推断 | — | — |  |
| P3 其他 | tc_mid | `schneider_clinic` | 施奈德精密改造诊所 | 🆕 | 仓库推断 | — | — |  |
| P3 其他 | tc_mid | `victoria_apartment` | 维多利亚的公寓 | ✅ | 卡 | 维多利亚的公寓 `map/props/victoria_apartment/` | 标准（r1 7 / 7.5） |  |
| P3 其他 | tc_upper | `eden` | 伊甸庄园 | ✅ | 卡 | — | — |  |
| P3 其他 | tc_upper | `league_club` | 庄园主联盟会所 | ✅ | 卡 + 推断位置 | 庄园主联盟会所 `map/props/league_club/` | 标准（glb 已导出，r1 自查未开评审） | isle9；宫殿式会所 + 顶光拍卖厅 |
| P3 其他 | tc_upper | `victor_estate` | 维克多庄园 | 🆕 | 仓库推断 | — | — | 只标记；所在岛（isle4）是通用英式填充 |
| P3 其他 | tc_upper | `y_estate` | 「Y」的庄园 | 🆕 | 仓库推断 | — | — | 只标记；所在岛（isle5）是通用英式填充 |
| P3 其他 | tc_upper | `zaibatsu_estate` | 罗斯柴尔德庄园 | ✅ | 卡 + 推断位置 | 罗斯柴尔德庄园 `map/props/rothschild_estate/` | 标准（glb 已导出，r1 自查未开评审） | isle30；府邸 + 冬季宴会厅 |
| P3 其他 | tc_upper | `elite_academy` | 精英学院 | 🆕 | 卡 + 推断位置 | 精英学院 `map/props/elite_academy/` | 标准（glb 已导出，r1 自查未开评审） | isle25（Q11） |
| P3 其他 | world | `hunting_camp` | 猎季营地 | 🆕 | 仓库推断 | — | — |  |
| P3 其他 | yuanyu_city | `city_gate` | 原域东门 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | yuanyu_city | `dome_quarter` | 穹顶区 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | yuanyu_city | `pilgrim_plaza` | 朝圣广场 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | yuanyu_city | `spire_quarter` | 尖塔区 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | yuanyu_sanctum | `holy_mountain` | 悬浮圣山 | ✅ | 卡 | — | — |  |
| P3 其他 | yuanyu_sanctum | `pantheon` | 诸神殿 | ✅ | 卡 | — | — |  |
| P3 其他 | yuanyu_sanctum | `pilgrim_stair` | 朝圣步道 | ✅ | 仓库自设 | — | — |  |
| P3 其他 | yuanyu_sanctum | `shrine_ring` | 圣山神龛环 | ✅ | 仓库自设 | — | — |  |

## 补读新增（2026-09-28，卡副本逐段检索）

| 卡里的名字 | 层（卡原文） | 处理 |
|---|---|---|
| 风暴殿（由全部天灾级强者组成的帝国最高战力，听命于议会） | 未写 | 🆕 `tc_mid.storm_hall`（仓库推断：中层核心区） |
| 枢机院（七位枢机，选举大主教） | 未写 | 是机构不是独立建筑：并入辉光大教堂别名 |
| 魔导军工研发中心（圣都） | 未写 | 🆕 `site_kavalierki.arms_rnd`（仓库推断） |
| 监狱（维多利亚的弟弟被送进去） | 未写 | 🆕 `tc_low.prison`（仓库推断） |
| 贫民窟（瑞秋出生地）、下层区酒吧 | 下层 | 🆕 `tc_low.slums`、`tc_low.lower_bar`（位置推断） |
| 猎季营地 | 天城外，未写 | 🆕 世界图 `hunting_camp`（仓库推断：天城东北荒野） |
| 骑士团修道院 / 封闭修道院（苍穹长大的地方） | 未写 | 几乎肯定就是圣铁摇篮，只记录，不另标 |
| 赤潮的据点（总部位置是世界级机密） | 未写 | 卡明说保密：不落点 |
| 银行、书店、工厂 / 资源处理设施、悬浮轨道 | 泛称 | 店铺类型与交通，不是具名建筑：不单独建模 |
| 奥伦帝国外围行省 / 附属邦国 | 天城外 | 地区，世界图已有疆域 |

## 原 `unplaced` 的去向

12 处全部落点（`maps.json` 的 `unplaced.items` 现为空，世界书「天城常识-位置未写」条目随之不再生成）：法师塔、施奈德精密改造诊所、新生工坊、天城贵族管家学院、天城执政厅、天城政务院、天城中央储备署、天城文化署、军事学院（中层）；维克多庄园、「Y」的庄园（上层悬浮岛）；猎季营地（世界图）。地点卡与附加条目都写明「卡没写层与位置，地图位置为仓库推断」。


## 上层 v8（2026-09-28）

- 卡里有的上层岛：伊甸（estate2）、首相府（isle6）、凯莉的宅邸（isle10）、罗斯柴尔德庄园（isle30）、庄园主联盟会所（isle9）、精英学院（isle25）。上层底图里这几座岛只建岛体，建筑用各自三维模型的正交俯视抠图贴上（`blender/landmarks/map_cutout.py` → `tools/isles_into_upper.py`；伊甸走 `tools/eden_into_upper.py`）。
- 其余岛（含维克多庄园、「Y」的庄园所在的岛）一律通用英式庄园填充（`tc_estates.est_english`，同一套脚本，不单独评审）。
- 三座新模型（`blender/landmarks/upper_estates.py` 共用部件）本轮按用户要求省额度：一稿 + 自查（对照已否决清单：无岛影、无飞艇、无礼拜堂、无自编名字、无文字 / 徽记），没开人设子代理。glb 导出（标准档 + 低档，`blender/landmarks/export_glb.py`）与三维查看器清单、地图「查看三维模型」链接已于后续任务补上（2026-09-28，`upper-glb`），仍未走两人设评审。

## DLC 预备（卡里没有，已从地图撤下，2026-09-28 用户：「卡没有的先不放进去，作为 dlc 预备」）

| id | 名称 | 原位置 | 撤下内容 | 旧存档 |
|---|---|---|---|---|
| `general_residence` | 将军官邸 | 上层 isle29（银冠堡旁） | `maps.json` 标记、`tc_upper.json` 标记、`addon_places.json` 附加条目、`tc_islands.json` 的 role（岛改为通用英式填充） | 当前地点写着这个名字时认不出 → 标题栏「未上图：将军官邸」，可手动指派 |
| `aether_institute` | 以太研究院 | 上层 isle25（气候塔旁） | 同上；isle25 改给精英学院 | 同上（「未上图：以太研究院」） |

`blender/tc_estates.py` 的 `role_general_residence` / `role_aether_institute` 与 `blender/upper_islands/isle25.py`、`isle29.py` 草稿保留不删，DLC 启用时直接接回。
