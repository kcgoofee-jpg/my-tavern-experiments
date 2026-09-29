# NSFW 内容与地图命名/建模的技术兼容专项核对报告

- 日期：2026-09-29　分支：`cloud/tc-mid-low`　性质：只读核对，未改动任何产品代码
- 对照物：`docs/card-digest.md`（下称 digest）、`docs/card-omissions.md`（下称遗漏清单）× `map/data/{maps,eden_estate_rooms,worldbook_addon,security}.json`、`map/here.mjs`、`map/estate/main.js`、`map/tavern/{adapter,mvu,events}.mjs`、`blender/{estate2/floorplans.py,estate2/medical_b2.py,tiancheng_low.py}`
- 范围与分工：按用户要求**不跳过 NSFW、目的是技术兼容核对而非内容审查**。本报告只收 NSFW 相关条目（NSFW 场所/房间/事件类型/MVU 字段）；一般命名与建模核对见 `docs/reviews/naming_model_compat.md`（该报告已明确「一切 NSFW 相关条目跳过、未核查」，与本报告互补；唯「星辉体验馆」两边都列出，见 P1-2 注记）。

## 结论总览

| 级别 | 数量 | 说明 |
|---|---|---|
| P0 键名/绑定不兼容 | **0** | NSFW 相关 MVU 键全部默认绑定命中，见 §一证据矩阵 |
| P1 缺锚点 | **2** | 附加条目当前地点词表缺 B1/B2 受限房间名；星辉体验馆（与邻报告重合，已注记） |
| P2 可选补充 | **4** | 人口市场 district 词、调教竞赛事件类型、母畜频道媒体口径、B1/B2 内景建模口径确认 |

---

## 一、P0 键名/绑定兼容性（0 项不兼容）

### 1.1 MVU NSFW 字段：全部为字面默认绑定，不走正则兜底

卡内 zod 真实键序（`docs/card-omissions.md:206-218`：顶层 5 键 世界→主角→已收服母畜→在场人物→狩猎清单）→ 地图 `DEFAULT_MAP`（`map/tavern/adapter.mjs:15-16`）：

| 卡内键（zod） | 地图绑定 | 证据 | 结论 |
|---|---|---|---|
| `已收服母畜[*].母畜等级`（enum S/A/B/C/D） | `gradeField:'母畜等级'` | `map/tavern/adapter.mjs:15` | ✓ |
| `母畜值`（0–100） | `coreField:'母畜值'` | `adapter.mjs:15`；兜底 `MORE_RX /..值$/`（`:11`） | ✓ |
| `母畜代号` | `codeField:'母畜代号'` | `adapter.mjs:16` | ✓ |
| `社会身份`（已收服母畜） | `socialField:'社会身份'` | `adapter.mjs:16`；狩猎清单同名键是 `身份`（`card-omissions.md:216`）时由 `MORE_RX /社会身份|公开身份|身份$/`（`adapter.mjs:11`）与名册身份正则 `IDENT /身份/i`（`map/tavern/mvu.mjs:235`）两边命中 | ✓ |
| `身高` / `体重` | `heightField` / `weightField` | `adapter.mjs:16` | ✓ |
| `外界知情`（bool） | `knownField:'外界知情'` | `adapter.mjs:16` | ✓ |
| `项圈` | `accessoryField:'项圈'` | `adapter.mjs:16`；`MORE_RX` 亦含 项圈（`:11`） | ✓ |
| `狩猎清单[*].狩猎阶段`（6 值：锁定→接触→试探→动摇→收网→已签约） | `STAGE=/进度|阶段|stage|progress/i` | `mvu.mjs:235`；卡出处 `docs/card-digest.md:281` | ✓ |
| 表序识别（第 3+ 顶层键按序） | `rosters()`：剔除在场表后第 1 表=已收服母畜、第 2 表=狩猎清单 | `mvu.mjs:282`（`keys.slice(2)`），在场表键由 `PRESENT_KEYS`（`mvu.mjs:22`，含「在场人物」）先认 | ✓ |
| 母畜值 5 阶段派生（AI 不直接写） | `CORE_CUTS=[20,40,60,80,100]`、`CORE_NAMES=['抗拒期','动摇期','接受期','沉溺期','完全母畜化']` | `mvu.mjs:239-240` 与卡换算 0–20/21–40/41–60/61–80/81–100（`card-omissions.md:220`）一致；`docs/reviews/canon_audit_0928.md:54` C1（曾少写「期」）已修 | ✓ |

### 1.2 刻意不读的 NSFW 键（无绑定 ⇒ 不存在键名冲突，非遗漏）

- `罩杯`（已收服母畜/狩猎清单，`card-omissions.md:214/216`）：不在 `FIELDS`/`MORE_FIELDS`/`MORE_RX`（`adapter.mjs:5,8,11`），地图从未请求，无兼容风险。
- `在场人物[*].身体状态{胸部,小穴,后庭,口腔}`、`内心想法`（`card-omissions.md:215`）：不读；在场人物的位置主来源是聊天标签，卡 zod 本就无「位置」字段（`mvu.mjs:21` 注释）。
- `主角.当前调教玩法`（string，默认「无」；⚠ 不是「当前活动」，`card-omissions.md:157、:202、:213`）：不读，无冲突。
- 只读原则：地图只读 `stat_data`、从不写卡变量，自管数据放聊天变量顶层键 `eden_map`（`mvu.mjs:1-3`；`docs/content-compat.md`）——NSFW 键与一般键同等对待，无按内容过滤的分支。

---

## 二、P1 缺锚点（2 项）

### P1-1 附加条目「地图当前地点 v2」词表缺 B1/B2 受限房间名

- 位置：`map/data/worldbook_addon.json:115`（「地图当前地点 v2」的房间词表）。
- 事实：词表列出 医疗与改造室、档案室、储藏室、体能训练室、健身房、酒窖、新进公共寝区、集体间、道具清洗消毒间 等，**但没有 主调教室、私人调教室、性技巧训练室、惩罚室 四个卡设定房间**。
- 地图实际认得这四个名字：`map/here.mjs:34、:47-51` 把 `map/data/eden_estate_rooms.json` 的 plan 房间（含 `kind:'restricted'`，只认名字、画素框）并入第 1 级庄园房间词表；回归保护 `tests/card097.test.mjs:29-31`（「伊甸庄园·主调教室」落 level 1、「惩罚室」落 floor B2）、`tests/unmapped096.test.mjs:25-28` 均通过。
- 影响：附加条目自称「下面这些叫法地图都认得」，词表缺项会引导模型写泛称「B1」「地下」→ 只落到楼层（第 4 级 `view.focus`），房间级高亮失效。
- 建议挂载点：`worldbook_addon.json:115` 房间清单补 4 个卡原名（`eden_estate_rooms.json:1042/1077/1112/552` 已照抄卡原名，无内容新增）。

### P1-2 星辉体验馆（中层·霓虹街 C 区）缺命名锚点

- 卡：`docs/card-digest.md:81`（视觉样例·全息广告：霓虹街 C 区）；`docs/card-omissions.md:73`（A18 把「体验馆」与 母畜专卖店/低端调教沙龙/母畜租赁店 并列为中层商业区一类店）。
- 地图：`map/` 全仓无「星辉」匹配；`tc_mid` districts（`map/data/maps.json:651-671`）已有 霓虹街（`:660`）与 母畜专卖店/低端调教沙龙/母畜租赁店（`:666-668`），无「星辉体验馆」。
- 影响：当前地点写「天城·中层·星辉体验馆」→ 只命中「中层」（第 4 级），落不到街区。
- 建议挂载点：`maps.json` `tc_mid.districts` 补「星辉体验馆」一行（与 `:666-668` 同法），无需建 marker。
- 分工注记：`docs/reviews/naming_model_compat.md` 的 P1 也列出了「星辉体验馆」。本报告因 A18 将其归入 NSFW 一类店语境仍收录；**两处任一修复即可，勿重复提交**。

---

## 三、P2 可选补充（4 项）

### P2-1 下层「人口市场」district 词

- 卡：`docs/card-digest.md:369`（下层场所：廉价酒馆、地下格斗场、非法赌场、二手衣物市场、人口市场…）。
- 地图：`tc_low.districts`（`maps.json:1180-1198`）已收 廉价酒馆（`:1190`）、地下格斗（`:1191`，子串匹配可命中「地下格斗场」）、非法赌场（`:1192`）、二手衣物市场（`:1194`），独缺「人口市场」。
- 建议：`districts` 补「人口市场」一行（同类先例即 `:1190-1194`）；无需建模（口径同 A20：下层这些场所只做词表）。

### P2-2 「调教竞赛节目」事件类型（遗漏清单 B2 未做）

- 卡：`docs/card-omissions.md:88`（B2：不同庄园的母畜比拼、评委打分，建议加事件类型「调教竞赛」）。
- 地图：`map/tavern/events.mjs:46`（类型表）、`:65`、`:69-70`（别名表）均无「调教竞赛」；语义最接近的现有类型是 `:46` 的 品鉴宴（人物·庄园主联盟）。
- 对照：同组 B1「转化仪式直播」⛔ 按内容规则不做（`card-omissions.md:87`）——本报告**同意保持不补**；B3 品鉴展/母畜展示会、B4 季度拍卖 已做（`events.mjs:65、:69-70`：展示会/品鉴会→品鉴宴、拍卖/拍卖会/私人拍卖/预展/季度拍卖→拍卖季）。
- 建议（可选）：加别名 调教竞赛→品鉴宴，或在 媒体/人物 大类下新增类型；不做也不影响任何现有绑定。

### P2-3 「母畜频道」媒体口径（可选）

- 卡：世界书 F8 媒体口径（天城一台/天城通讯社/全息新闻网络等，另有 NSFW 向频道名）；附加条目「天城常识-媒体」（`map/data/worldbook_addon.json:561-572`）未含频道专名。
- 地图：事件侧 媒体 大类已有 公共直播/直播事故/舆情/名流八卦（`events.mjs:33-34`，别名 直播→公共直播 `:54`）可承接相关事件，无需专设类型。
- 建议：可选在常识条目补一句，或维持现状；纯口径问题，无技术兼容影响。

### P2-4 B1/B2 受限房间内景建模 = 刻意留白（口径确认，不建议突破）

- 数据与几何齐全：`map/data/eden_estate_rooms.json:1042`（主调教室 B1-C01）、`:1077`（私人调教室 B1-C02）、`:1112`（性技巧训练室 B1-C04）`kind:'restricted'`、`note:'不描述'`；`:552`（惩罚室 B2-C01，restricted）、`:587`（医疗与改造室 B2-C02，`kind:'card'`）。生成源 `blender/estate2/floorplans.py:38-40`（房间清单）、`:148-150`（B1 三室 restricted）、`:131`（惩罚室 `note='无窗；不描述'`）、`:132`（医疗与改造室 `note='体检、手术…'`）。
- 查看器口径：`map/estate/main.js:89`（restricted 用灰 `#9d9a94`）、`:328`（与卡房间同 rank=1）、`:552`（详情只显示受限提示、不描述）——「只认名字、素框、不描述」是刻意设计（2026-09-28「房间名照抄卡原名」决定 + `kind:'restricted'`），**内部设施（束缚件等）无几何/材质不是缺失而是内容口径**。如要补属内容决策，非技术兼容问题，本报告不建议。
- 旁证：`blender/estate2/medical_b2.py:1-4` 是「用户设定·地下医疗中心」（中性医疗设备、明确无束缚件），并非卡内 B2-C02「医疗与改造室」的改造向陈设——卡向「改造」设施同样留白，口径一致。
- 配套已对齐：安保层 `map/data/security.json:12`（B1 按当日任务、B2 仅主人/女仆长/受押送）按卡权限表转录、措辞中性（`security.json:2` 口径声明）。

---

## 四、已对齐的 NSFW 命名锚点（抽样证据矩阵，防回归）

| 卡内条目 | 卡出处 | 地图侧证据 | 结论 |
|---|---|---|---|
| 母畜专卖店 / 低端调教沙龙 / 母畜租赁店 | `card-omissions.md:73`（A18） | `maps.json:666-668`（tc_mid districts） | ✓ |
| 公共母畜池管理中心 / 集中调教工厂（与直管收容设施合画一处） | `card-omissions.md:35、:71`（A16） | `maps.json:1297-1311`（amc_facility：name `:1298`、src 写明合画 `:1303`、alias `:1307-1308`） | ✓ |
| 霓虹酒吧与母畜体验馆 / 母畜体验馆（圣都中环·竞赛与狂欢回廊） | `card-digest.md:89` | `maps.json:1997-1998`（contest_corridor alias） | ✓ |
| 血肉磨坊（下层黑拳场，位置推断） | `card-digest.md:369` | `maps.json:1233-1240`（标记）+ `blender/tiancheng_low.py:31、:601`（椭圆地下拳场：锈铁外壳/阶梯看台/沙坑）+ `events.mjs:84`（RE_LOW 层归属正则） | ✓ |
| 廉价酒馆 / 地下格斗场 / 非法赌场 / 二手衣物市场 | `card-digest.md:369` | `maps.json:1190/1191/1192/1194`（tc_low districts；子串匹配机制 `here.mjs:12-20`） | ✓（缺人口市场见 P2-1） |
| 品鉴宴 / 品鉴展 / 母畜展示会 / 季度拍卖 | `card-omissions.md:89-90`（B3/B4） | `events.mjs:46`（品鉴宴、拍卖季类型）、`:65`（展示会/品鉴会/拍卖系别名）、`:69-70`（v0.9.6 补全） | ✓ |
| B1 主调教室/私人调教室/性技巧训练室、B2 惩罚室 | `card-digest.md:219、:222` | `eden_estate_rooms.json:1042/1077/1112/552` + `here.mjs:47-51` + `tests/card097.test.mjs:29-31、:43、:49-50` | ✓ |
| F3 正式母畜个人寝室 ×14（门单向玻璃） | `card-digest.md:215` | `eden_estate_rooms.json` 14 个房间实例（`:3289` 起三例，note「门是单向玻璃」）+ card_rooms F3-C01（`:5116`） | ✓ |
| F1 道具清洗消毒间 | `card-digest.md:209` | `maps.json:151` + `eden_estate_rooms.json:2110`（房间）、`:5277` 段 card_rooms；旧名「器具清洗消毒间」retired→F1-C07（`:5372`） | ✓ |
| 医疗与改造室 / 档案室 / 储藏室（B2，可描述房间） | `card-digest.md:219-222` | `maps.json:189` + `eden_estate_rooms.json:587`、card_rooms `:5274-5277`；附加条目词表 `worldbook_addon.json:115` | ✓ |
| 旧叫法兼容（受限房间 A/B/C、附属室A-D、B1-受限A/B/C、B2-受限 等） | —— | `eden_estate_rooms.json:5329`（card_id_alias）、`:5359`（retired_names）；`here.mjs:55-56`（旧编号/旧名换算） | ✓ |
| 下层唯一相对安全区 = 委员会直管设施周边 | `card-omissions.md:167`（F2） | `maps.json:1303`（amc_facility src 转录） | ✓ |

---

## 五、方法与证据

- 全量词扫：在 `map/`、`blender/`、`docs/` 内 grep 母畜/调教/惩罚/品鉴/拍卖/体验馆/专卖/沙龙/租赁/星辉/格斗/赌场/人口/贫民/罩杯/身体状态/当前调教玩法/直播/展示会/转化 等词，逐命中核行号。
- 手读：`here.mjs`（词表六级与 plan 并入）、`adapter.mjs`（DEFAULT_MAP/MORE_RX）、`mvu.mjs` 头部与 rosters/CORE 段、`security.json`、附加条目「地图当前地点 v2」「地图人物位置 v1」「天城常识-媒体」、`eden_estate_rooms.json` B1/B2/F3/F1 条目与 card_id_alias/retired_names、`blender/estate2/{floorplans,medical_b2}.py`。
- 单测：`node --test tests/card097.test.mjs tests/unmapped096.test.mjs` → 全部通过（B1/B2 受限房间词表与 restricted 行为有回归保护）。
- 本报告只写 `docs/reviews/nsfw_compat_audit.md`；未改动任何产品代码与他人文件。
