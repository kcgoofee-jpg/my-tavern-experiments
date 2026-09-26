# 地名英文对照（待用户审）

原则：
- 意译为主，让英文读者一眼知道这是什么地方：Eden Manor、Well 7 Black Market、Ring Barracks。
- 设定里的专有名词保留音译，或写成「音译 + 意译」：Tiancheng、Yuanyu, the Primal Realm、Xingyuan (Star Abyss) University、Kavalierki。
- 机构名按英语习惯排序，不逐字对应：「天城执法局总局」译作 Enforcement Bureau HQ，不写 Tiancheng Law Enforcement Bureau General Bureau。
- 副标题尽量短，地图标签放得下。

改法：
- 天城各层的名字在 `map/data/maps.json` 的 `title_en` / `name_en` / `sub_en` / `label_en` / `credit_en`。
- 世界图的名字在 `map/i18n/en.json` 的 `names`（中文原文 → 英文）。
- 地点卡正文（设定原文）不翻译。英文界面会在正文前加一行「Original lore text (Chinese):」。
- `python3 tools/check_maps.py` 会提示缺英文名的地标。

## 天城

| 中文 | English | 位置 |
|---|---|---|
| 世界 | World | world 标题 |
| 国界 | Borders | world 开关 |
| 天城 · 上层 | Tiancheng · Upper Tier | tc_upper 标题 |
| 上层 / 悬浮庄园区 | Upper / Floating Estates | tc_upper 层按钮 |
| 结界 | Wards | tc_upper 开关 |
| 显示下方城市 | Show city below | tc_upper 开关 |
| 伊甸庄园 | Eden Manor | tc_upper.eden |
| 　{{user}} 的庄园 | 　Your estate | 副标题 |
| 银冠堡 | Silvercrown Keep | tc_upper.silver_crown |
| 　议会骑士团总部 | 　Council Knights HQ | 副标题 |
| 以太气候调节塔 | Aether Climate Tower | tc_upper.climate_tower |
| 天城 · 中层 | Tiancheng · Middle Tier | tc_mid 标题 |
| 中层 / 钢铁霓虹区 | Middle / Steel & Neon | tc_mid 层按钮 |
| 上层投影 | Upper-tier footprint | tc_mid 开关 |
| 天城执法局总局 | Enforcement Bureau HQ | tc_mid.enforcement_hq |
| 　中层核心区 | 　Middle Tier core | 副标题 |
| 辉光大教堂 | Radiance Cathedral | tc_mid.radiance_cathedral |
| 　圣光教会总部 | 　Church of Holy Light HQ | 副标题 |
| 圣铁摇篮 | Holy Iron Cradle | tc_mid.iron_cradle |
| 　战斗修女修道院 | 　Battle-sisters' convent | 副标题 |
| 环城军营带 | Ring Barracks | tc_mid.barracks_ring |
| 　天城防卫军驻地 | 　Defense Force garrison | 副标题 |
| 星渊大学 | Xingyuan (Star Abyss) University | tc_mid.starabyss_univ |
| 　天城第一学府 | 　Tiancheng's first university | 副标题 |
| 天城议会 | Tiancheng Council | tc_mid.council |
| 层间检查点 | Inter-tier Checkpoint | tc_mid.checkpoint_c |
| 　C 区 → 下层 7 号井 | 　Zone C → Well 7 (Lower) | 副标题 |
| 　下到下层 · 7 号井 | 　Down to Well 7 · Lower | 跨层链接 |
| 天城 · 下层 | Tiancheng · Lower Tier | tc_low 标题 |
| 下层 / 地基区 | Lower / Foundations | tc_low 层按钮 |
| 7 号井黑市 | Well 7 Black Market | tc_low.well7 |
| 　只收灰票 | 　Grey scrip only | 副标题 |
| 　上到中层 · C 区检查点 | 　Up to Zone C Checkpoint · Middle | 跨层链接 |
| 血肉磨坊 | The Bloodmill | tc_low.blood_mill |
| 　黑拳场 | 　Underground fight pit | 副标题 |
| 执法局下层分局 | Enforcement Bureau, Lower Branch | tc_low.enforcement_low |
| 　名义六个，实际运转三个 | 　Six on paper, three running | 副标题 |
| 圣光教会施粥站 | Holy Light Soup Kitchen | tc_low.soup_kitchen |
| 　下层教区 | 　Lower parish | 副标题 |
| 防卫军前沿哨所 | Defense Force Forward Outpost | tc_low.outpost |
| 资产管理委员会下层设施 | Asset Management Committee, Lower Facility | tc_low.amc_facility |
| 货运站 | Freight Yard | tc_low.freight_yard |
| 　旧地面轨道枢纽 | 　Old surface rail hub | 副标题 |

## 世界图

| 中文 | English | 位置 |
|---|---|---|
| 世界 | World | 世界图 |
| 奥伦帝国 | Oren Empire | 世界图 |
| 三大帝国之首 · 激进秩序 | First of Three Empires · Radical Order | 世界图 |
| 光辉联邦 | Radiant Federation | 世界图 |
| 骑士圣地 · 保守秩序 | Land of knighthood · Conservative Order | 世界图 |
| 虚灵古派 | Old Ethereal Faith | 世界图 |
| 神权至上 · 泛神信仰 | Theocracy · Pantheism | 世界图 |
| 天城 | Tiancheng | 世界图 |
| 奥伦国都 · 约3200万 | Capital of Oren · ~32M | 世界图 |
| 大骑士领·圣都 | Grand Knights' Demesne · Holy City | 世界图 |
| Kavalierki · 联邦首都 · 约2800万 | Kavalierki · Federal capital · ~28M | 世界图 |
| 原域 | Yuanyu, the Primal Realm | 世界图 |
| 虚灵古派国都 · 诸神殿（悬浮圣山） | Old Faith capital · floating Pantheon | 世界图 |
| 旷野高地 | Wildland Highlands | 世界图 |
| 开局地点 | Starting point | 世界图 |
| 圆桌第一席封地 | Fief of the First Seat | 世界图 |
| 圆桌第二席封地 | Fief of the Second Seat | 世界图 |
| 圆桌第三席封地 | Fief of the Third Seat | 世界图 |
| 圆桌第四席封地 | Fief of the Fourth Seat | 世界图 |
| 圆桌第五席封地 | Fief of the Fifth Seat | 世界图 |
| 海外诸地 | Overseas Lands | 世界图 |
| 稀有矿物 · 异域人员输出地 | Rare minerals · overseas trade | 世界图 |

## 拿不准、请用户定的几处

| 中文 | 现在的译法 | 备选 |
|---|---|---|
| 天城 | Tiancheng | Sky City（意译）；Celestia（意象化） |
| 星渊大学 | Xingyuan (Star Abyss) University | Stellar Abyss University；Starabyss University（数据里的 id） |
| 血肉磨坊 | The Bloodmill | The Meat Grinder |
| 圣铁摇篮 | Holy Iron Cradle | Cradle of Holy Iron |
| 虚灵古派 | Old Ethereal Faith | Ancient Ethereal Sect；Xuling Old Faith |
| 灰票 | Grey scrip | Grey tickets；Ash notes |
| 结界（上层叠加层） | Wards | Barriers |
