# 上层其他岛屿：参考板 + 草稿（upper_islands r1）

2026-09-28。对应 ROADMAP「上层其他岛屿按设定要改的」。格式同 `landmark-references.md`：只放公开百科链接，图片不进仓库。
每座岛同时有一张**建模草稿**（Blender 体块，3/4 鸟瞰，1200 px 32 spp）：脚本 `blender/upper_islands/<id>.py`，
图 `docs/drafts/upper_isle_<id>_draft.jpg`。一次全部重出：
`blender -b --python-expr "import runpy;runpy.run_path('blender/upper_islands/render_all.py')" -- docs/drafts`。
**这些只是草稿**：不动上层瓦片、不出 8K；glm 看图代理自检通过后即并进 `tiancheng_upper.py` 的下一次整图重渲（2026-09-29 起全自动）。

标注：【卡】= 卡里写的（`docs/card-digest.md`），【推断】= 仓库推断，【用户】= 用户决定。只用卡原名；建筑一律中性（无文字、无徽记、无人物）。
全层通用【卡】：每岛一座私人庄园、各带结界；岛间只有私人悬浮载具 → 每岛只画一处「停靠平台」+ 通用密封式悬浮载具（无旋翼、无机翼，不画飞艇）。
结界在草稿里不画（32 spp 下只会变成一团雾），整图时按现有做法处理。

## isle30 罗斯柴尔德庄园 · 悬浮岛 R-02
【卡】伊莎贝拉家族的庄园，冬季宴会的举办地（视觉样例·请柬）。位置、风格【推断】。
草稿：保留 v7 的玻璃塔楼别墅（塔楼降到 18 m + 铅皮顶），新增冬季宴会用的**宴会厅 / 舞厅【推断】**（双立方大厅 + 高窗 + 铅皮四坡顶 + 门廊车道），玻璃连廊接主楼，冬园台地花坛；岸边停靠平台（原「飞艇港」已改）。

| # | 参考 | 借鉴点 | 链接 |
|---|------|--------|------|
| R1 | 沃德斯登庄园 | 同名家族的真实乡间宅邸：法式文艺复兴体量、台地花坛 | https://en.wikipedia.org/wiki/Waddesdon_Manor |
| R2 | 白厅国宴厅 | 双立方宴会大厅的比例与高窗节奏 | https://en.wikipedia.org/wiki/Banqueting_House,_Whitehall |
| R3 | 门特莫尔塔楼 | 大宅配室内大厅的组合方式 | https://en.wikipedia.org/wiki/Mentmore_Towers |
| R4 | 范斯沃斯住宅 | 玻璃别墅部分的克制做法（保留 v7 风格时参考） | https://en.wikipedia.org/wiki/Farnsworth_House |

## isle29 将军官邸
【推断，canon:false】卡里没有具名统帅；紧邻银冠堡【推断】。草稿：乔治时代红砖官邸（中楼 + 两翼 + 门廊），碎石检阅前庭；现有「魔导装甲」三件摆设保持为三个中性基座体块。

| # | 参考 | 借鉴点 | 链接 |
|---|------|--------|------|
| G1 | 切尔西皇家医院 | 红砖 + 石材门廊的军方建筑语汇、前庭 | https://en.wikipedia.org/wiki/Royal_Hospital_Chelsea |
| G2 | 海军部大楼（白厅） | 官邸式院落与前院围合 | https://en.wikipedia.org/wiki/Admiralty_House,_London |
| G3 | 阿普斯利邸 | 军方统帅宅邸的规模参考（只取体量） | https://en.wikipedia.org/wiki/Apsley_House |

## isle25 以太研究院
【推断，canon:false】卡里没有 → 地图继续标「仓库自设」，建筑不加戏。以太气候调节塔卡里有、位置未写 → **不放在这里**。
草稿：低矮四合院校园 + 实验玻璃厅 + 一个小圆顶 + 一根普通设备桅杆。

| # | 参考 | 借鉴点 | 链接 |
|---|------|--------|------|
| E1 | 卡文迪许实验室 | 学院式实验楼的低调体量 | https://en.wikipedia.org/wiki/Cavendish_Laboratory |
| E2 | 洛桑研究所 | 乡间研究园区（楼 + 温室 + 场地） | https://en.wikipedia.org/wiki/Rothamsted_Research |
| E3 | 皇家格林尼治天文台 | 小型观测圆顶 | https://en.wikipedia.org/wiki/Royal_Observatory,_Greenwich |

## isle9 庄园主联盟会所
【卡】庄园主联盟是顶级贵族的非官方组织，办拍卖会和品鉴会；制度纪念日的大型拍卖会在上层（出处 `card-omissions.md` L91 B5）。**固定会所本身与位置【推断】**。品鉴宴由庄园主轮流做东【卡】→ 会所不画专属宴会厅。
草稿：蓓尔美尔街俱乐部式意大利宫殿楼（中庭玻璃顶）+ 顶光拍卖厅。

| # | 参考 | 借鉴点 | 链接 |
|---|------|--------|------|
| A1 | 改革俱乐部 | 宫殿式立面 + 玻璃顶中庭 | https://en.wikipedia.org/wiki/Reform_Club |
| A2 | 旅行者俱乐部 | 同街区较小的宫殿式会所比例 | https://en.wikipedia.org/wiki/Travellers_Club |
| A3 | 佳士得（国王街） | 顶光拍卖厅 | https://en.wikipedia.org/wiki/Christie%27s |

## isle10 凯莉的宅邸
【卡】开局三的计划地点；层与位置卡未写 → 上层【用户】，落 isle10【推断】。维克多庄园是另一处，不落点【卡】。
草稿：要一栋和通用英式庄园区分得开的主楼 → 摄政风白灰泥别墅（风格【推断】），侧立面整高弓形凸窗 + 爱奥尼门廊，旁接围墙菜园。

| # | 参考 | 借鉴点 | 链接 |
|---|------|--------|------|
| K1 | 塞津科特庄园 | 摄政期乡间别墅：侧立面弓形体量 | https://en.wikipedia.org/wiki/Sezincote_House |
| K2 | 摄政公园周边别墅（The Holme） | 白灰泥 + 弓形凸窗的城郊别墅 | https://en.wikipedia.org/wiki/The_Holme |
| K3 | 围墙菜园 | 英式围墙菜园布局 | https://en.wikipedia.org/wiki/Walled_garden |

## isle6 首相府
【卡】首相去首相府开会（开局五）；位置未写 → 上层【推断】。形制【用户 2026-09-28 方案 A】，与 `blender/landmarks/pm_residence/` 一致：深色砖三层 + 阁楼联排、街口铁门 + 岗亭、花园侧白色灰泥柱廊；「公务停靠平台」保留（卡里叫「访客停靠平台」，「公务」为【推断】），只放悬浮载具。
参考沿用 `landmark-references.md` ② 的 P 组，另加：

| # | 参考 | 借鉴点 | 链接 |
|---|------|--------|------|
| P1 | 唐宁街 10 号 | 深色砖联排、黑门、街口铁门 | https://en.wikipedia.org/wiki/10_Downing_Street |
| P2 | 唐宁街 | 死胡同街面与联排整体 | https://en.wikipedia.org/wiki/Downing_Street |

## isle2（原「大主教府邸」）
【卡】上层没有教区；大主教府邸并入辉光大教堂别名 → 礼拜堂已去掉；现在是普通英式庄园、无标记【推断】。
草稿：詹姆斯一世式 H 形红砖庄园，**无礼拜堂、无尖塔、无钟楼**。

| # | 参考 | 借鉴点 | 链接 |
|---|------|--------|------|
| H1 | 布利克林庄园 | 红砖詹姆斯一世式、荷兰山墙 | https://en.wikipedia.org/wiki/Blickling_Estate |
| H2 | 哈特菲尔德府 | H/E 形平面 | https://en.wikipedia.org/wiki/Hatfield_House |

## 标注（地图文字，不在草稿里）
- 银冠堡副标题 / 地点卡写「上层与中层交界」（A26）【卡】；罗斯柴尔德条目别名「R-02」；以太研究院、将军官邸保持「仓库自设」；凯莉宅邸、首相府位置写「（位置为地图推断）」。
- 上层精英学院【卡：有，位置未写】→ 需用户同意再选岛，草稿未做。
