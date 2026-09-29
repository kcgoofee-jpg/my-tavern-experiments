# 地图命名与建模对角色卡的技术兼容核对报告

- 日期：2026-09-29　分支：cloud/tc-mid-low　性质：只读核对，未改动任何产品代码
- 对照物：`docs/card-digest.md`（角色卡设定包，下称「卡」/digest）× `map/data/{maps,world_markers,worldbook_addon,addon_places,eden_estate_rooms}.json`、`map/here.mjs`、`map/varmap.mjs`、`map/events.mjs`、`map/tavern/{adapter,mvu,events}.mjs`、`blender/landmarks/*`
- 约定：只做技术兼容核对（命名锚点、几何/名称、MVU 键名），不做内容审查；一切 NSFW 相关条目（含卡内 NSFW 主题的房间名、场所泛称及其别名、`tc_mid` districts 中的相关词）按任务约定跳过、未核查。

## 结论总览

| 级别 | 数量 | 说明 |
|---|---|---|
| P0 实锤 | 0 | MVU 主绑定键、层归属、别名绑定均与卡一致（证据矩阵见下） |
| P0 疑似（待对卡确认） | 2 | 名册字段键名差：`knownField`（有兜底）、`socialField`（**兜底不覆盖**） |
| P1 缺命名锚点 | 3 | 星辉体验馆、骑士团分队巡逻据点（事件侧）、socialField 兜底缺口 |
| P2 可选 | 5 | 见 P2 节 |

- 推断项核查（任务第 2 项）：地图与附加条目里所有「卡内没有的命名」均已带 `tag:"inf"`＋src「推断/仓库自设/用户」标注或收入 `ambiguous`，**未发现漏标**（NSFW 词表除外，未核查）。
- 建模几何/名称（任务第 3 项）：教堂（拉丁十字平面）、环城军营带（弧段）、7 号井（方井筒＋井口开洞）与卡及命名一致，无不符。

---

## P0 技术不兼容（键名对不上 / 绑定点错）

### 实锤：0 项

已验证一致的绑定（证据矩阵）：

1. **地点主键**：`map/tavern/adapter.mjs:15` `DEFAULT_MAP.location='世界.当前地点'`；`map/tavern/eden-map.js:303`（默认 varMap 起步）→ 与卡 §8 世界键「当前地点」一致（`docs/card-digest.md:277`）。默认值「User主卧」可被 `eden` 别名「主卧」命中（`map/data/maps.json:396` 起 eden 块别名）。
2. **时间三键**：`map/tavern/mvu.mjs:52` 默认 `世界.当前日期 / 当前时刻 / 当日时段` → 与卡 §8 一致（`docs/card-digest.md:277`）。
3. **着装**：`map/tavern/adapter.mjs:15` `outfit='主角.着装'`；`map/tavern/mvu.mjs:92` `OUTFIT_KEYS=['衣服','裤子','鞋子']` → 与卡（`docs/card-digest.md:278`）一致。
4. **声望**：`map/tavern/mvu.mjs:290` 按 `/声望|reputation|名望/` 在第 2 顶层键自动发现 → 卡「庄园声望」（`docs/card-digest.md:278`）可命中。
5. **名册组/狩猎清单（按位置发现）**：`map/tavern/mvu.mjs:282-286`（`keys.slice(2)`，剔除在场表后 `others[0]`=members、`others[1]`=targets）→ 与卡顶层键序「世界→主角→已收服母畜→在场人物→狩猎清单」一致（`docs/card-digest.md:279-281`，键名 2026-09-27 已按卡内 zod 核对）；在场表键由 `PRESENT_KEYS`（`map/tavern/mvu.mjs:22`，含「在场人物」）先认并剔除。
6. **狩猎阶段**：`map/tavern/mvu.mjs:235` `STAGE=/进度|阶段|stage/` → 命中卡字段「狩猎阶段」（`docs/card-digest.md:281`）。
7. **在场人物无位置字段**：卡内 zod 的在场人物对象没有「位置」（`map/tavern/mvu.mjs:20` 注释同样记录）→ 地图侧以聊天标签（characters.mjs）为位置主来源，绑定点未踩空。
8. **层归属正则**：`map/tavern/events.mjs:83-86`（RE_UP/RE_LOW/RE_MID/RE_OUT）与 `map/data/maps.json` 各 marker 的层一致，含卡未写层、按仓库推断层的地点（星渊大学 `maps.json:761-779` src 自述推断；骑士团营区 `maps.json:862` 用户决定；执政厅 `maps.json:1035` 等）；「奥伦帝国」不算天城外（`events.mjs:81` 注释，修正了旧 #13）。查看器侧同构：`map/events.mjs:53` `MAP_OF`、`map/events.mjs:55` `ZONES`、`map/events.mjs:67` `RE_RING`。
9. **变量域隔离**：`map/tavern/mvu.mjs:110` `VAR_ROOT='eden_map'`（聊天变量顶层键，不写入 stat_data），与卡 MVU 无键冲突；状态栏 localStorage 前缀 `eden_` 与地图 `edenMap:` 不冲突（`docs/card-digest.md:298`）。

### 疑似待对卡确认（若证实即为 P0 级）

| # | 问题 | 证据 | 兜底与风险 |
|---|---|---|---|
| P0?① | `knownField` 默认「外界知情」（`map/tavern/adapter.mjs:15`）与 digest 对名册字段的描述「**外界是否知情**（布尔）」（`docs/card-digest.md:279`）疑似不一致 | digest:279 为 2026-09-27 按卡内 zod 核对后的字段罗列 | 兜底 `map/tavern/adapter.mjs:11` `MORE_RX.knownField=/外界知情|知情|public/` 可命中「外界是否知情」，功能不中断，风险低 |
| P0?② | `socialField` 默认「社会身份」（`map/tavern/adapter.mjs:15`）：digest:281 狩猎清单字段写「**身份**」，digest:289 状态栏读「社会身份 / 身份」两种写法 | `docs/card-digest.md:281,289` | 若卡内键确为「身份」，默认取不到，且兜底 `MORE_RX.socialField=/社会身份|公开身份|occupation/`（`adapter.mjs:11`）**不匹配「身份」** → 人物栏中性身份列为空。此项无兜底，建议优先对卡确认 |

其余名册默认键（`母畜等级 / 母畜值 / 母畜代号 / 项圈 / 身高 / 体重`，`map/tavern/adapter.mjs:15`）digest 只给中性描述（`docs/card-digest.md:279`「等级枚举 / 阶段数值 / 代号 / 饰物描述」），无法仅凭 digest 验证卡内原名；其中若卡内饰物字段为「饰物描述」，`MORE_RX.accessoryField=/饰物|配饰|项圈/`（`adapter.mjs:11`）可兜底。建议换卡通用化时一并实测。

---

## P1 缺命名锚点

| # | 名称 | 卡内出处 | 现状（文件:行号） | 建议挂载点 |
|---|---|---|---|---|
| 1 | **星辉体验馆** | `docs/card-digest.md:81`（霓虹街 C 区，视觉样例·全息广告） | `map/data/maps.json` 全文无此名、无别名；`map/data/worldbook_addon.json:73` 联动规范地点表亦未列。`checkpoint_c`（`maps.json:816-842`）别名只收「C区/中层C区」等泛称 | `tc_mid` 霓虹街 C 区：新增 marker（挂在 checkpoint_c 附近的商业街一侧），或并入 `checkpoint_c` 的 src/别名并在联动规范中层地点表补一行 |
| 2 | **骑士团分队巡逻据点** | `docs/card-digest.md:56,367`（层已写明：中层高区，最多 12 处） | here 侧已由 `ambiguous`「骑士团巡逻据点」（`maps.json:92` 起）处理 ✓；但事件侧 `map/tavern/events.mjs:85` RE_MID 未收「巡逻据点」，`worldbook_addon.json:73` 地点表未列 → 正文事件标签地点写「骑士团巡逻据点」（不带层名）时定不出层、不上图 | 按 digest §10 #14「层写明了的加进正则」原则：`RE_MID` 增补「巡逻据点」，或在联动规范【地点】补「骑士团巡逻据点（中层）」 |
| 3 | **socialField 兜底缺口**（承接 P0?②） | `docs/card-digest.md:281,289` | `map/tavern/adapter.mjs:11,15` | 对卡确认后：默认键按卡校正，或 `MORE_RX.socialField` 增补 `^身份$` 一类精确匹配 |

---

## P2 可选

1. **「教区」泛称无锚**：卡 `docs/card-digest.md:36,157,366`（中层 12 教区、下层 3 教区，每教区一座主教堂＋礼拜堂）。`maps.json` 两层 districts 均无「教区」，`ambiguous`（`maps.json:92` 起）也未收；当前地点写「中层X教区」时只能靠层前缀落层（`map/here.mjs:151-161`）。建议 districts/ambiguous 增补「教区」，或在 src 说明里明确不收的理由。下层侧施粥站别名「下层教区」（`maps.json:1263` 块）已部分覆盖。
2. **交通关键词含卡外词**：`map/varmap.mjs:16` `DEF_KW.air` 含「飞行器、飞艇」。卡内无飞艇（`docs/card-digest.md:12,117`），「飞行器」卡里只按未具名空运理解。误识别只影响线路样式（空中虚线弧），不影响落点。建议删「飞艇」或标注仓库自设。其余模式词（悬浮载具/运输管道/步行连廊/地铁）与卡一致 ✓。
3. **`RE_OUT`「大陆」无词边界**：`map/tavern/events.mjs:86`，任何含「大陆」子串的地点会被判天城外（如虚构「新大陆公寓」）。低风险，建议加边界或收敛写法。
4. **状态栏删除按钮走 `Mvu.replaceMvuData`、可能不发 `VARIABLE_UPDATE_ENDED`**（`docs/card-digest.md:387`）：地图对名册/狩猎清单的自动刷新可能滞后一拍。技术提示留档，与命名无关。
5. **媒体机构无需地图锚点**：天城通讯社/全息新闻网络/天城一台（`docs/card-digest.md:159`）为无位置机构；联动规范已将其列为事件「来源」（`map/data/worldbook_addon.json:73`）✓，不需处理，留档说明。

---

## 核对明细

### 1. 卡内地点 → 地图锚点（任务第 1 项）

上层（tc_upper，`maps.json:360` 起）：

| 卡内地点 | 卡出处 | marker（maps.json:行） | 建模/条目 | 结论 |
|---|---|---|---|---|
| 伊甸庄园（含主卧/书房/大厅等房间与 凝水塔 alias） | digest §6/§7 | `eden` `maps.json:396`；庄园剖面 `maps.json:121`；凝水塔别名 `maps.json:235-236` | blender/estate2；房间多边形 eden_estate_rooms.json；worldbook_addon.json:157 | ✓ |
| 银冠堡 | digest:48 | `silver_crown` `maps.json:439` | lm_ 链接 ✓ | ✓ |
| 以太气候调节塔 | digest:49 | `climate_tower` `maps.json:457`（tag inf，位置推断已标） | ✓ | ✓ |
| 首相府 | digest:178（开局五） | `pm_residence` `maps.json:472`（推断已标） | ✓ | ✓ |
| 罗斯柴尔德庄园·悬浮岛 R-02 | digest 视觉样例·请柬 | `zaibatsu_estate` `maps.json:494`（别名含 R-02；副标题已改「私人悬浮载具停靠平台」，旧「飞艇港」问题已修，见 digest:318） | ✓ | ✓ |
| 凯莉的宅邸 | digest:367（用户决定上层） | `kelly_residence` `maps.json:534`（推断已标；别名含露易丝宅邸） | ✓ | ✓ |
| 维克多庄园 / 「Y」的庄园 | digest:404 | `victor_estate` `maps.json:557` / `y_estate` `maps.json:569`（推断已标） | ✓ | ✓ |
| 精英学院 | digest:371 | `elite_academy` `maps.json:583`（学院岛推断已标） | ✓ | ✓ |
| 大主教府邸 | digest:66 | 并入 `radiance_cathedral` 别名（`maps.json:694` 块），旧问题已修（digest:314） | — | ✓ |

中层（tc_mid，`maps.json:632` 起）：执法局总局 675、辉光大教堂 694（别名含 天城主教座堂/大主教府邸/枢机院，digest:51-52 一致）、圣铁摇篮 723（别名 战斗修女院，digest:53）、环城军营带 742（digest:57）、星渊大学 761（src 自述「卡未写位置，放中层为推断」，digest §2 一致）、旧公寓楼 780（开局六）、天城议会 801、层间检查点 816（digest:80，sub「C 区 → 下层 7 号井」，link→tc_low well7 ✓）、天城大学 843（digest:371 法学院，与星渊区分 ✓）、骑士团营区 862（digest:367 用户决定）、最高法院 880（digest §10 #14 推断已标）、维多利亚的公寓 895（digest:36）、佣兵公会 912、中层修道院 926（digest:36 五座之一，仅代表其一，已注明）、中层公立医院 942、中层养老院 957、法师塔 972（digest:404 推断已标）、施奈德精密改造诊所 990（推断已标）、新生工坊 1004、天城贵族管家学院 1016、天城执政厅 1035（digest:68）、天城政务院 1053（digest:64）、天城中央储备署 1071（digest:71）、天城文化署 1090（digest:160）、军事学院 1108（digest:371 推断已标）、风暴殿 1126（digest:161）——**全部一一对应**，别名与联动规范地点表（worldbook_addon.json:73,222）同步。

下层（tc_low，`maps.json:1167` 起）：7 号井黑市 1201（别名 7号井/七号井/黑市/灰票/老K杂货/井下-07，digest:79 全覆盖）、血肉磨坊 1233（digest:77）、执法局下层分局 1246（digest:38）、圣光教会施粥站 1263（别名 下层教区/孤儿收容所/免费诊所，digest:366）、防卫军前沿哨所 1283（digest:38）、资产管理委员会下层设施 1298（别名 委员会下层设施/公共收容设施，digest §10 #18 处理方向一致）、废弃教堂区 1317（digest 开局四，层推断已标）、货运站 1339（digest:104，推断已标）、铁皮屋区 1353 / 旧货市场 1368（开局六，推断已标）、下层区酒吧 1383（digest:78，推断已标）、贫民窟 1396（digest:369，推断已标）、监狱 1409（digest §10，仓库自设已标）——**全部一一对应**。下层场所泛称（廉价酒馆/地下格斗/非法赌场/二手衣物市场/工厂，digest:369）已收进 tc_low districts ✓（人口市场等 NSFW 相关条目按约定未核查）。

天城外：大骑士领·圣都三环与全部地标（`maps.json:1891-2050`：荣光冠冕/联合大厦/大竞技场/议事殿/顶级贵族与财阀会所/以太穹顶/竞赛与狂欢回廊/铁锈与落败领/清算转运站/独立骑士黑市营地/临光家族外城驻所）与卡原文逐一对应；魔导军工研发中心 2050（推断已标）。原域·诸神殿/悬浮圣山（2079-2130，卡原文）；神龛环/朝圣步道/朝圣广场/尖塔区/穹顶区/原域东门（推断已标）。旷野高地/崖壁（2230-2277，开局七）。圆桌骑士五席封地（2303 起，world_markers.json fiefs `tag:inf` 位置设定未给已标）。

庄园房间（eden_estate_rooms.json，src=card-digest §6）：F1 大厅/会客厅/餐厅/厨房与后勤区、F2 主人主卧/主人书房/女仆长寝室/客房×2/东侧长廊（kind=inferred，楼层推断已标，digest:214,241）、B1 体能训练室/恒温酒窖、B2 档案室/储藏室、室外前庭花园（停靠平台）/后庭园/以太凝水塔——**非 NSFW 房间全部在册且别名可命中**（`map/here.mjs:40` buildIndex 同源建词表）。F3 及 B1/B2 其余房间按约定跳过未核查。

### 2. 地图有、卡没有 → 推断项标注核查（任务第 2 项）

逐项确认以下卡外命名均带标注（此前已标的不再重复列）：

- `league_club` 庄园主联盟会所：`sub_src:"repo-design"`，src 说明卡无固定会所（`maps.json:517`）✓
- 位置未写机构（法师塔/诊所/新生工坊/管家学院/执政厅/政务院/储备署/文化署/军事学院，digest:404 原 unplaced 项）：2026-09-28 按用户「每处建筑都上图」要求改为 marker，src 均写「位置为地图推断」（`maps.json:972-1126` 各块）✓
- 下层 prison/slums/lower_bar/freight_yard/tin_shacks/junk_market、上层 victor_estate/y_estate：`tag:"inf"`＋src 仓库推断/仓库自设（`maps.json:1353-1409,557,569` 各块）✓
- 原域城区四点、神龛环、朝圣步道、下山小径、fief1-5 全部子地标：src「推断」（`maps.json:2120-2277,2303` 起）；`world_markers.json:48-55` hunting_camp `layer_src:"repo-inferred"`，fiefs `tag:inf` ✓
- 世界图 realms/minors（`world_markers.json:38-96`）：奥伦帝国（国都即天城，不落天城外点 ✓ `events.mjs:81`）、光辉联邦、虚灵古派（别名 灵枢秘派，digest 第三帝国双名兼容 ✓）
- 泛称歧义：`maps.json:92` ambiguous（大学/分局/修道院/委员会/骑士团/区议会/庄园主联盟等）与 digest §10 #6/#17/#18 的处理决定一致 ✓；here 侧拦截逻辑在 `map/here.mjs:160-161`

**结论：未发现漏标的推断项**（NSFW 相关 districts 词未核查）。

### 3. 建模与设定（几何/名称层面，任务第 3 项）

| 地标 | 建模事实（文件:行号） | 卡/命名 | 结论 |
|---|---|---|---|
| 辉光大教堂 | `blender/landmarks/cathedral/layout.py:3` 拉丁十字平面（中殿东西向、西立面双塔），与中层底图 CATH 段一致；`build.py:742` 回廊庭院 garth（十字小径＋八角井台） | 「大教堂」名实相符（digest:51 教会总部） | ✓ 一致 |
| 环城军营带 | `blender/landmarks/barracks/build.py:1-2` 自述卡只说「中层外围一圈军营」，建模取甲板边一段弧（`build.py:117` 环形扇区实体）＋军事学院同文件 | digest:57 中层外围防卫军驻地；军事学院为独立 marker（`maps.json:1108`）同名同区 | ✓ 一致（弧段为已注明的简化） |
| 7 号井 | `blender/landmarks/well7/build.py:6-8` 井筒中心 (0,0)、内净 10.8×10.8 方形、四角柱 ±6（`build.py:32`）、中层甲板 z=64 井口开洞 ±6.6（`build.py:174,208-209`）、旅客北进南出＋检查点雨棚 | digest:79-80 7 号井黑市/老K杂货/「井下-07」、检查点「C 区 → 7 号井」；marker link 已互联（`maps.json:816,1201`） | ✓ 一致（卡未写井形，方井不构成不符） |
| 其余 33 张 lm_* 三维图 | 与 `maps.json` 各 marker 的 `link/link3d` 一一对应（blender/landmarks/ 目录 ↔ lm_* 清单） | — | ✓ 无名称错挂 |

### 4. MVU 变量绑定（任务第 4 项）

见 P0 节证据矩阵 1-9 与疑似①②。摘要：顶层五键的路径、着装、声望、狩猎阶段、名册/狩猎清单的按位置发现、在场人物表处理均与卡内 zod 结构（digest §8，`docs/card-digest.md:277-281`）技术兼容；仅名册行内字段（knownField/socialField 及若干无法从 digest 验证的默认键）存在待对卡确认的疑似差。

---

## 建议处理顺序

1. 对卡内 zod 实测确认 `socialField`（优先，无兜底）与 `knownField` 及名册字段原名；必要时修 `map/tavern/adapter.mjs:11,15`。
2. 补「星辉体验馆」「骑士团分队巡逻据点」两个命名锚点（`map/data/maps.json`、`map/tavern/events.mjs:85`、`map/data/worldbook_addon.json:73`）。
3. P2 各项酌情（教区泛称、飞艇关键词、RE_OUT 词边界）。
