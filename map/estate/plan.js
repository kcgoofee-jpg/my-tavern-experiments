// 伊甸庄园 · 平面数据（以 docs/eden-estate.md 为准；换算规则见 REFIT_PLAN.md §1.1）
// 坐标：x 东西（+x = 东），z 南北（+z = 正面 = 南，朝停靠平台），y 向上；1 单位 = 1 m；中央主楼中心在原点。
// 府邸坐标 x0…x1 × y0…y1 → r = D2M(x0, x1, y0, y1) = [x0, x1, −y1, −y0]；岛坐标 (X, Y) → I2M(X, Y) = [X, 25 − Y]。
// 标高：模型 y = 设定标高 + 1.2（1.2 m 基座）；F5 取 18.7（挡檐墙顶面）。
// src：世界书 = maps.json 的 eden src / alias；ROADMAP = 路线图规划；推断 = 设定自行假定
//
// 「接口变更」（WP-A → WP-C）
// - building.js 新导出 buildCut(b, fi)；buildHouse(full, site) 不再生成剖切几何。
//   为兼容旧调用，buildHouse(full, cut, site) 仍可用：第三个参数存在时会顺带对每层调用 buildCut。
// - buildWings(site) 保留为空函数。
// - SHAFTS 新增 id / floors / stops / b1（向下延伸到的 y）。buildShafts(floorGroups) 签名不变，只画 floors 里的层段。
// - 第 2 轮：栏杆瓶柱分两个子批次标签：'far' = balPanel 贴图面片（远景用，近景应隐藏），'fine' = 车削瓶柱实例（近景 / 楼层细节）。
//   main.js updateSubs 请按 m/px 切换：far.visible = !fine.visible（m/px > 0.08 时只显示 far）。
// - 第 2 轮：卫浴与早餐室地面改 'marbleC'（素面带纹大理石）；套间里的浴室 / 马桶间 parts 由 buildCut 叠一层 'marbleC'。
// - 第 2 轮：服务区（仆役楼、悬浮车库〔原马车房〕、工坊、悬浮载具库〔原机库〕、载具停靠坪〔原机坪〕）整体北移 22 m（SERVICE_DZ），AREAS 已同步。
// - 第 2 轮：七个主角区域标签 pri 9–10（主楼、门廊、图书馆塔楼、音乐厅亭、中轴大道、停靠平台、人工湖），其余 ≤ 8。
// - ROOMS 新增 id / wall / rank / tall / parts / alias_en / heritage / era / en；AREAS 新增 alias_en；新增 ROOM_BY_ID、HERITAGE、BLOCKS、ISLE、D2M、I2M。

export const CUT = 1.2;            // 剖切高度
export const ISLE = { cx: 0, cz: 25, rx: 335, rz: 250 };
export const ISLAND = ISLE;        // 旧名
export const D2M = (x0, x1, y0, y1) => [x0, x1, -y1, -y0];
export const I2M = (X, Y) => [X, 25 - Y];

// 体块（外墙中线）。floors = 该体块占用的楼层；hs = 各层外墙高（缺省取 FLOORS[i].h）
// 服务区整体北移（相对设定 −22 m），避免屋顶探进首屏
export const SERVICE_DZ = -22;
export const HOUSE = { x0: -20, x1: 20, z0: -22, z1: 22, t: 0.9 };
export const BLOCKS = [
  { id: 'A', name: '中央主楼', x0: -20, x1: 20, z0: -22, z1: 22, t: 0.9, floors: [0, 1, 2, 3] },
  { id: 'BW', name: '西翼', x0: -54, x1: -20, z0: -16, z1: 16, t: 0.9, floors: [0, 1, 2] },
  { id: 'BE', name: '东翼', x0: 20, x1: 54, z0: -16, z1: 16, t: 0.9, floors: [0, 1, 2] },
  { id: 'C', name: '图书馆塔亭', x0: -102, x1: -78, z0: -12, z1: 12, t: 0.9, floors: [0, 1], hs: [4.5, 5.5] },
  { id: 'D', name: '音乐厅亭', x0: 78, x1: 102, z0: -16, z1: 16, t: 0.9, floors: [0], hs: [11] },
];

export const FLOORS = [
  { id: 'F1', label: '1F', name: '礼仪层', y: 1.2, h: 4.5 },
  { id: 'F2', label: '2F', name: '日常层', y: 5.7, h: 4.5 },
  { id: 'F3', label: '3F', name: '私人层', y: 10.2, h: 4.5 },
  { id: 'F4', label: '顶', name: '屋顶服务间', y: 14.7, h: 4.0 },     // 檐部与挡檐墙之后的顶楼，只有主楼
  { id: 'F5', label: '屋顶', name: '屋顶眺望亭', y: 18.7, h: 5.0 },     // 屋顶平台 + 眺望亭
];
// 卡设定：地上 F1–F3 + 地下 B1–B2（docs/card-digest.md §6）。F4 / F5 都是屋顶构筑物（仓库自设，不算楼层，不再标成「顶楼」）；卡设定的分层房间见 map/data/eden_estate_rooms.json。id 不变（estate:floor 接口）
export const FLOOR_EN = ['State', 'Daily', 'Private', 'Roof service rooms', 'Roof lookout'];
export const ENTAB = [14.7, 17.6];   // 额枋 14.7–15.6 · 檐壁 15.6–16.5 · 檐口 16.5–17.6；挡檐墙 17.6–18.7
export const SRC_EN = { '世界书': 'Worldbook', 'ROADMAP': 'Roadmap', '推断': 'Inferred' };

/* ================================================================
 * 房间表（REFIT_PLAN §3；坐标为模型轴）
 * R(id, 名称, 层, r, 地面, 墙面, rank, 其余字段)
 * en = [英文名, 英文用途, 英文传承]，汇总进 EN
 * ================================================================ */
const R = (id, name, floor, r, mat, wall, rank, o = {}) => ({ id, name, floor, r, mat, wall, rank, alias: [], alias_en: [], use: '', heritage: '', era: '', src: '推断', ...o });
const SUITE = '卧室（四柱床、床头柜与台灯、写字台、安乐椅、梳妆台、小壁炉）+ 更衣室（双门衣柜、抽屉柜、穿衣镜）+ 浴室（铸铁爪足浴缸、洗手台、马桶、黄铜电热毛巾架）';
const SUITE_EN = 'Bedroom (four-poster, nightstands, writing desk, easy chair, dressing table, small fireplace), dressing room and bathroom (claw-foot tub, basin, WC, brass towel warmer)';

export const ROOMS = [
  /* ---------------- F1 礼仪层 ---------------- */
  R('101', '大厅', 0, [-12, 12, 2, 22], 'checker', 'plasterStone', 1, { tall: ['-z'], alias: ['大厅', '门厅', '玄关'], alias_en: ['Grand Hall', 'Entrance Hall', 'Hall'],
    use: '入口大厅，通高 8.7 m：斜置棋盘格大理石地面，中心嵌家徽圆盘；x = ±8 两列仿斑岩科林斯柱；镀金边桌与壁镜、红丝绒长凳、落地长箱钟、铜框告示板、青花大瓶', src: '世界书', note: 'alias「大厅」「门厅」；告示样例提到大厅墙上',
    heritage: '初代奠基人订制的胡桃木长箱钟，高 2.6 m，表盘上是天城初建时的星图，每到整点报出庄园的建成日。', era: '初代',
    en: ['Grand Hall', 'Double-height entrance hall: diagonal chequered marble, inlaid family crest, two rows of scagliola Corinthian columns, gilt consoles, velvet benches, longcase clock, notice board', 'The founder\'s walnut longcase clock, 2.6 m tall; its dial shows the stars over Tiancheng at its founding and it chimes the estate\'s founding date every hour.'] }),
  R('102', '衣帽间', 0, [-20, -12, 12, 22], 'herring', 'panelMahog', 3, { alias: ['衣帽间'], alias_en: ['Cloakroom'],
    use: '桃花心木衣柜到顶，40 个编号黄铜衣钩，伞架、靴凳、鎏金全身镜、手套与帽盒柜',
    heritage: '每个挂钩下有珐琅编号牌，二代时为舞会订制，至今没有换过。', era: '二代',
    en: ['Cloakroom', 'Mahogany presses to the ceiling, 40 numbered brass hooks, umbrella stand, boot bench, gilt cheval mirror', 'Enamel number plates under every hook, ordered for a ball in the second generation and never replaced.'] }),
  R('103', '访客盥洗室', 0, [-20, -12, 2, 12], 'marbleC', 'silkGreen', 2, { parts: { wc: [[-20, -16, 2, 8], [-16, -12, 2, 8]] }, alias: ['访客盥洗室', '洗手间'], alias_en: ['Guest Cloakroom', 'Powder Room'],
    use: '前室（缎木化妆台、软凳、小沙发）+ 两间独立化妆间：高位桃花心木水箱马桶、大理石洗手台、椭圆镜、蜂窝纹擦手巾与叠放小方巾',
    heritage: '水箱侧面有铸铜铭牌，写着制造厂和「第三代翻新」的年份。', era: '三代',
    en: ['Guest Cloakroom', 'Anteroom with satinwood dressing table and two WC cubicles: high mahogany cisterns, marble basins, oval mirrors, stacked hand towels', 'Each cistern carries a cast-bronze maker\'s plate with the year of the third-generation refit.'] }),
  R('104', '门房', 0, [12, 20, 12, 22], 'oak', 'paintIvory', 3, { alias: ['门房'], alias_en: ['Porter\'s Lodge'],
    use: '柜台式写字台、访客登记簿台、钥匙柜、温莎椅、访客艇停泊信号面板',
    heritage: '历代访客签名簿全部存在这里，最早一册的皮面已经褪成浅棕。', era: '初代',
    en: ['Porter\'s Lodge', 'Counter desk, visitors\' book stand, key cabinet, Windsor chairs, landing signal panel', 'Every visitors\' book is kept here; the oldest leather cover has faded to pale brown.'] }),
  R('105', '候见室', 0, [12, 20, 2, 12], 'versailles', 'damaskRed', 2, { tall: ['-z'], alias: ['候见室'], alias_en: ['Anteroom', 'Waiting Room'],
    use: '勒万托红大理石壁炉、一对扶手椅、三人沙发、茶几、报刊架、赫里兹地毯、两幅天城下层风景画',
    heritage: '壁炉上挂的风景画是天城建城初期的「下层港口」，画里的港口今天已经不存在。', era: '初代',
    en: ['Anteroom', 'Levanto marble fireplace, armchairs, sofa, tea table, newspaper rack, Heriz rug', 'The landscape above the fireplace shows the Lower Harbour of early Tiancheng, a harbour that no longer exists.'] }),
  R('106', '一层过厅', 0, [-20, 20, -6, 2], 'marble', 'plasterStone', 2, { tall: ['-z'], alias: ['过厅', '一层过厅'], alias_en: ['Cross Hall'],
    use: '东西贯通的横厅，两端门对两翼，形成 204 m 景深；大理石边桌、历代家主胸像台座 ×6、铜框玻璃灯笼',
    heritage: '六尊胸像按年代排开，最新一座台座留空，给现任家主。', era: '历代',
    en: ['Cross Hall', 'Transverse hall with an enfilade through both wings; marble consoles, six busts of past heads of the family, brass lanterns', 'Six busts stand in order of generation; the newest pedestal is empty, kept for the present head.'] }),
  R('107', '花园厅', 0, [-8, 8, -22, -6], 'versailles', 'silkDuck', 1, { alias: ['花园厅'], alias_en: ['Garden Hall', 'Garden Room'],
    use: '面湖的厅：两组香槟丝绒沙发、圆形镶嵌桌、三角钢琴、四面落地镜对三扇落地窗，出窗即后庭台阶',
    heritage: '钢琴盖板内侧写着三代家主婚礼那天的日期，此后每一场婚礼都在这里弹奏同一首曲子。', era: '三代',
    en: ['Garden Hall', 'Lake-facing salon: champagne-velvet sofas, marquetry table, grand piano, mirrors facing three French windows', 'Inside the piano lid is the date of the third head\'s wedding; the same piece has been played here at every wedding since.'] }),
  R('108', '主楼梯厅', 0, [8, 20, -22, -6], 'marble', 'plasterStone', 2, { alias: ['楼梯厅', '主楼梯厅', '楼梯'], alias_en: ['Stair Hall', 'Grand Staircase'],
    use: '石材悬挑双跑回转梯（F1 → F3，梯段宽 2.2 m，锻铁鎏金栏杆），梯井中央是黄铜笼式电梯，顶部天光井',
    heritage: '（仓库自设，非卡设定）黄铜笼式电梯是第三代装的第一部以太电梯。楼层指针还是原装的机械表盘，指针停在「3」的时候会轻响一声。', era: '三代',
    en: ['Stair Hall', 'Cantilevered stone return stair to 3F with gilt wrought-iron balustrade; brass cage lift in the well; skylight above', 'The brass cage lift was the first ether lift, installed by the third generation; its original dial chimes softly when the needle stops at 3.'] }),
  R('109', '仆役楼梯', 0, [-20, -14, -14, -6], 'stoneFlag', 'paintIvory', 3, { minor: true, alias: ['仆役楼梯'], alias_en: ['Service Stair'],
    use: '石踏步、铁栏杆，贯通 B1–F5；内有 1.2 × 1.2 m 食梯', en: ['Service Stair', 'Stone stair B1–5F with a 1.2 m dumbwaiter', ''] }),
  R('110', '值班室', 0, [-20, -14, -22, -14], 'lino', 'paintIvory', 3, { alias: ['值班室', '仆从值班室'], alias_en: ['Staff Duty Room', 'Duty Room'],
    use: '铃板（36 个房间铃，以太指示灯）、值班桌、排班表板、制服衣柜、茶水台', src: '世界书',
    heritage: '铃板上最旧的那块铜牌写着「育婴室」，这个房间早已改作他用，但铜牌一直留着。', era: '历代',
    en: ['Staff Duty Room', 'Bell board for 36 rooms, duty desk, rota board, uniform cupboard, tea counter', 'The oldest brass plate on the bell board still reads "Nursery", though that room was repurposed long ago.'] }),
  R('111', '银器室', 0, [-14, -8, -14, -6], 'stoneFlag', 'paintIvory', 3, { alias: ['银器室'], alias_en: ['Silver Room'],
    use: '保险柜门、擦银台、垫呢银器抽屉、瓷器登记簿',
    heritage: '二代订制的 120 件银餐具，每件底部刻有家徽和序号，至今一件不缺。', era: '二代',
    en: ['Silver Room', 'Safe door, polishing bench, baize-lined drawers, china register', 'All 120 pieces of the second generation\'s silver, each engraved with crest and number, are still complete.'] }),
  R('112', '主人通道底站', 0, [-14, -8, -22, -14], 'stoneFlag', 'panelWalnut', 3, { alias: ['主人通道底站'], alias_en: ['Master Passage (Ground)'], src: 'ROADMAP',
    use: '石材螺旋梯加单人电梯（胡桃木轿厢）；后墙有一道与石缝对齐的暗门，出门是通往悬浮载具库的紫藤廊',
    en: ['Master Passage (Ground)', 'Spiral stair and a one-person lift; a concealed door in the rear wall opens to the wisteria walk towards the hangar', ''] }),
  R('113', '餐厅', 0, [-44, -20, 2, 16], 'versailles', 'silkBlue', 1, { tall: ['-z'], alias: ['餐厅', '饭厅'], alias_en: ['Dining Room'], src: '世界书',
    use: '可伸缩桃花心木长餐桌（最长 18 m，24 座）、两台餐具柜、两座卡拉拉白壁炉、历代宴会图、塞夫尔蓝金边餐具、三盏 36 臂水晶吊灯',
    heritage: '主位椅背上雕着家徽，是唯一不配套的一把椅子，初代从旧宅带来。', era: '初代',
    en: ['Dining Room', 'Extending mahogany table for 24, sideboards, two Carrara fireplaces, banquet paintings, Sèvres-blue service, three 36-arm chandeliers', 'The master\'s chair carries the carved crest; the only odd chair in the set, brought by the founder from the old house.'] }),
  R('114', '早餐室', 0, [-54, -44, 2, 16], 'marbleC', 'plasterYellow', 2, { alias: ['早餐室'], alias_en: ['Breakfast Room'],
    use: '胡桃木圆桌加 8 把椅子、边柜、黄铜罩早餐保温柜、盆栽柑橘；手绘藤蔓墙画',
    heritage: '墙画里的藤蔓间藏着历代孩子的名字缩写，是每一代装修时画师偷偷加的。', era: '历代',
    en: ['Breakfast Room', 'Round walnut table for 8, sideboard, brass warming cabinet, potted citrus, painted vine murals', 'The painted vines hide the initials of every generation\'s children, slipped in by the painters at each redecoration.'] }),
  R('115', '西翼廊', 0, [-54, -20, -2, 2], 'marble', 'plasterStone', 2, { minor: true, alias: ['西翼廊'], alias_en: ['West Corridor'], use: '大理石地面，拱顶，一排肖像', en: ['West Corridor', 'Marble floor, vaulted ceiling, a row of portraits', ''] }),
  R('116', '备餐间', 0, [-34, -20, -16, -2], 'stoneFlag', 'tileWhite', 3, { alias: ['备餐间', '厨房'], alias_en: ['Servery', 'Kitchen'],
    use: '保温柜、大理石备餐台、铜洗杯槽、食梯出口；连餐厅',
    heritage: '墙上的旧式摇铃拉杆没有拆，改接了以太铃线。', era: '五代',
    en: ['Servery', 'Hot cupboards, marble plating counter, copper glass sink, dumbwaiter hatch', 'The old bell-pull levers were never removed; they were rewired to the ether bells.'] }),
  R('117', '瓷器与花艺室', 0, [-46, -34, -16, -2], 'stoneFlag', 'paintIvory', 3, { alias: ['瓷器室', '花艺室'], alias_en: ['China and Flower Room'],
    use: '到顶玻璃门瓷器柜、大理石水槽、插花工作台、花器架',
    heritage: '柜里有一套只在新家主继任宴上用的金边蓝瓷。', era: '历代',
    en: ['China and Flower Room', 'Glazed china presses, marble sink, flower-arranging bench, vase shelves', 'The presses hold a gold-rimmed blue service used only at the banquet for a new head of the family.'] }),
  R('118', '家族门厅', 0, [-54, -46, -16, -2], 'stoneFlag', 'panelWalnut', 2, { alias: ['家族门厅'], alias_en: ['Family Entrance'],
    use: '家人日常出入的门厅，西门通柱廊连廊与图书馆塔亭：靴凳、伞架、手杖架、温莎椅、地图柜',
    heritage: '门框上有历代孩子量身高的刻线，漆过几遍都没有盖掉。', era: '历代',
    en: ['Family Entrance', 'Everyday family entrance towards the colonnade and library: boot bench, umbrella and stick stands, map chest', 'The door frame bears every generation\'s height marks; repainting has never covered them.'] }),
  R('119', '会客厅', 0, [20, 44, 2, 16], 'versailles', 'damaskRed', 1, { tall: ['-z'], alias: ['会客厅', '客厅', '沙龙'], alias_en: ['Drawing Room', 'Salon'], src: '世界书',
    use: '两组镀金红丝缎沙发、安乐椅、镶嵌边桌、Statuario 壁炉与 3 m 壁镜、家主全身肖像 ×2、瓷器陈列柜',
    heritage: '壁炉上方原本是第二代家主的全身肖像，每一代新家主继位就把前任的肖像移到过厅，自己的挂上去；现在挂的是上一代。', era: '历代',
    en: ['Drawing Room', 'Gilt sofas in red silk, easy chairs, marquetry tables, Statuario fireplace with a 3 m pier glass, two full-length portraits', 'Each new head moves the predecessor\'s portrait from above the fireplace to the cross hall and hangs their own; the previous head hangs there now.'] }),
  R('120', '绿厅', 0, [44, 54, 2, 16], 'oak', 'silkGreen', 2, { alias: ['绿厅', '小客厅', '小会客室'], alias_en: ['Green Room', 'Small Parlour'],
    use: '双人沙发、两把扶手椅、写字桌、书柜、阿尔卑斯绿大理石壁炉',
    heritage: '写字桌抽屉里有一沓空白的家徽信笺，信头的烫金用的是和山花同一批金箔。', era: '初代',
    en: ['Green Room', 'Small parlour: loveseat, armchairs, writing desk, bookcase, Verde Alpi fireplace', 'The desk drawer holds crested notepaper gilded from the same batch of gold leaf as the pediment.'] }),
  R('121', '东翼廊', 0, [20, 54, -2, 2], 'marble', 'plasterStone', 2, { minor: true, alias: ['东翼廊'], alias_en: ['East Corridor'], use: '大理石地面，拱顶，一排肖像', en: ['East Corridor', 'Marble floor, vaulted ceiling, a row of portraits', ''] }),
  R('122', '台球室', 0, [20, 34, -16, -2], 'oak', 'panelWalnut', 2, { alias: ['台球室'], alias_en: ['Billiard Room'],
    use: '桃花心木台球桌、球杆架、记分板、高背皮椅 ×4、雪茄柜、小吧台',
    heritage: '记分板上还用粉笔写着上一局的比分，按家规不擦。', era: '现任',
    en: ['Billiard Room', 'Mahogany billiard table, cue rack, score board, leather chairs, cigar cabinet, small bar', 'The last game\'s score is still chalked on the board; family rule says it is not wiped.'] }),
  R('123', '珍藏室', 0, [34, 46, -16, -2], 'oak', 'panelWalnut', 2, { alias: ['珍藏室'], alias_en: ['Cabinet of Curiosities', 'Collection Room'],
    use: '乌木框玻璃展柜：古地图、钱币、早期以太仪器、天城初建测绘图；中间一张放大镜阅读桌',
    heritage: '天城初建的测绘图原件，边上有初代亲笔标注的「此岛可筑园」。', era: '初代',
    en: ['Cabinet of Curiosities', 'Ebony-framed vitrines of maps, coins, early ether instruments and the founding survey; reading table', 'The original founding survey of Tiancheng, annotated in the founder\'s hand: "A garden may be built on this island."'] }),
  R('124', '东门厅', 0, [46, 54, -16, -2], 'stoneFlag', 'plasterStone', 3, { alias: ['东门厅'], alias_en: ['East Entrance'],
    use: '通向柱廊连廊和音乐厅的门厅：靴凳、伞架、衣帽架', en: ['East Entrance', 'Lobby towards the colonnade and the music room', ''] }),
  R('C1', '图书馆塔亭', 0, [-102, -78, -12, 12], 'herring', 'panelWalnut', 1, { alias: ['图书馆', '图书馆塔亭', '塔亭'], alias_en: ['Library Pavilion', 'Pavilion Library'],
    use: '两层通高书库（约 4 万册）：胡桃木书架与回廊、阅览长桌、天城早期以太学手稿柜；八角塔身到 28 m，顶上金色浑天仪',
    heritage: '塔顶的金色浑天仪每年转一格，一圈正好是一百年。', era: '四代',
    en: ['Library Pavilion', 'Two-storey library of some 40,000 volumes with walnut presses, reading tables and early ether manuscripts; octagonal tower above', 'The gilt armillary sphere on the tower turns one notch a year; a full turn takes exactly a century.'] }),
  R('D1', '音乐厅', 0, [78, 102, -16, 16], 'versailles', 'plasterStone', 1, { alias: ['音乐厅', '音乐厅亭'], alias_en: ['Music Room', 'Music Pavilion'],
    use: '单层通高 11 m，筒拱藻井；北端半圆后殿安贴金管风琴（32 尺音管），厅内可排 120 座',
    heritage: '管风琴最低的那根音管上刻着四代家主和建造匠人的名字。', era: '四代',
    en: ['Music Room', 'Single 11 m volume under a coffered barrel vault; gilded organ with 32-foot pipes in the north apse', 'The organ\'s lowest pipe is engraved with the names of the fourth head and the organ builders.'] }),

  /* ---------------- F2 日常层 ---------------- */
  R('201', '大厅上空', 1, [-12, 12, 2, 22], 'void', 'plasterStone', 3, { minor: true, void: true, parts: { gallery: [-12, 12, 2, 4] }, alias: ['楼座', '乐师廊'], alias_en: ['Hall Gallery'],
    use: '大厅通高空间；后侧挑出 1.8 m 深的楼座作乐师廊，锻铁鎏金栏杆', en: ['Hall Gallery', 'Upper void of the Grand Hall with a 1.8 m musicians\' gallery', ''] }),
  R('202', '茶室', 1, [-20, -12, 2, 22], 'herring', 'chinoiserie', 1, { alias: ['茶室'], alias_en: ['Tea Room'], src: '世界书',
    use: '手绘中国风壁纸；三扇朝前庭的窗下各一组茶座，长沙发、漆器茶柜、银茶炊',
    heritage: '中国风壁纸是二代的原物，一块褪色处保留原样，旁边玻璃框里存着当年的订货单。', era: '二代',
    en: ['Tea Room', 'Hand-painted chinoiserie paper; three tea tables under the forecourt windows, sofa, lacquer tea cabinet, silver samovar', 'The chinoiserie paper is the second generation\'s original; one faded patch is kept as is, beside the framed order slip.'] }),
  R('203', '客用侍从间', 1, [12, 20, 12, 22], 'oak', 'paintIvory', 3, { alias: ['客用侍从间'], alias_en: ['Guest Valets\' Room'], use: '侍从桌椅、熨衣台、客人行李架、铃板分机', en: ['Guest Valets\' Room', 'Valet desk, ironing board, luggage racks, bell extension', ''] }),
  R('204', '客用布草间', 1, [12, 20, 2, 12], 'oak', 'paintIvory', 3, { alias: ['客用布草间'], alias_en: ['Guest Linen Room'], use: '布草柜，毛巾按房间分格、每格标铜牌', en: ['Guest Linen Room', 'Linen presses with brass-labelled compartments per guest room', ''] }),
  R('205', '二层过厅', 1, [-20, 20, -6, 2], 'oak', 'plasterStone', 2, { minor: true, alias: ['二层过厅'], alias_en: ['First-floor Hall'], use: '橡木地面；两幅天城建城史巨幅挂毯', en: ['First-floor Hall', 'Oak floor; two large tapestries of the founding of Tiancheng', ''] }),
  R('206', '起居室', 1, [-8, 8, -22, -6], 'versailles', 'silkDuck', 1, { alias: ['起居室', '起居'], alias_en: ['Morning Room', 'Sitting Room', 'Living Room'], src: '世界书',
    use: 'L 形象牙沙发、安乐椅、棋桌、书柜、胡桃木立式钢琴、缎木写字台、卡拉卡塔金壁炉、三代同框的家庭群像',
    heritage: '棋桌上的残局是四代家主去世前那一盘，至今没有人动过。', era: '四代',
    en: ['Morning Room', 'Ivory sofa, easy chairs, chess table, bookcases, upright piano, satinwood desk, Calacatta fireplace, family group portrait', 'The unfinished game on the chess table is the fourth head\'s last; no one has moved a piece since.'] }),
  R('207', '主楼梯平台', 1, [8, 20, -22, -6], 'marble', 'plasterStone', 2, { minor: true, alias: ['主楼梯平台'], alias_en: ['Stair Landing'], use: '主楼梯二层平台与回廊', en: ['Stair Landing', 'First-floor landing of the main stair', ''] }),
  R('209', '楼层配餐间', 1, [-20, -14, -22, -14], 'tileWhite', 'tileWhite', 3, { alias: ['配餐间'], alias_en: ['Floor Pantry'], use: '食梯出口、保温柜、茶水台、茶具柜', en: ['Floor Pantry', 'Dumbwaiter hatch, hot cupboard, tea counter', ''] }),
  R('211', '小储藏', 1, [-14, -8, -14, -6], 'oak', 'paintIvory', 3, { alias: ['小储藏'], alias_en: ['Store Cupboard'], use: '文具、蜡烛、备用灯芯', en: ['Store Cupboard', 'Stationery, candles, spare wicks', ''] }),
  R('212', '书房', 1, [-40, -20, 2, 16], 'herring', 'panelWalnut', 1, { tall: ['-z', '-x'], alias: ['书房', '图书室'], alias_en: ['Study', 'Library'], src: '世界书',
    use: '胡桃木书架到顶（黄铜滑轨书梯）、初代桃花心木大写字台、切斯特菲尔德沙发、落地地球仪、以太悬浮天城仪、地图抽屉柜、黑金花壁炉与初代肖像、以太终端',
    heritage: '书桌是初代从旧宅搬来的，桌面的皮子换过四次，右手边那道墨水渍一直留着。', era: '初代',
    en: ['Study', 'Walnut bookcases with brass library ladder, the founder\'s partners desk, Chesterfields, floor globe, floating island orrery, Nero fireplace, ether terminal', 'The desk came from the founder\'s old house; the leather has been replaced four times, but the ink stain on the right has always stayed.'] }),
  R('213', '秘书室', 1, [-54, -40, 2, 16], 'oak', 'paintIvory', 2, { alias: ['秘书室'], alias_en: ['Secretary\'s Office'],
    use: '两张写字台、以太录写台、文件柜墙、访客长凳、挂钟',
    heritage: '墙上的挂钟比长箱钟快两分钟，按家规，秘书室的时间要永远早于主人。', era: '历代',
    en: ['Secretary\'s Office', 'Two desks, ether scribe, filing wall, visitors\' bench, wall clock', 'The wall clock runs two minutes ahead of the longcase clock; by family rule the secretary\'s time must always precede the master\'s.'] }),
  R('214', '西二层廊', 1, [-54, -20, -2, 2], 'marble', 'plasterStone', 2, { minor: true, alias: ['西二层廊'], alias_en: ['West Upper Corridor'], use: '同西翼廊', en: ['West Upper Corridor', 'Wing corridor', ''] }),
  R('215', '档案与地图室', 1, [-34, -20, -16, -2], 'oak', 'panelWalnut', 3, { alias: ['档案室', '地图室'], alias_en: ['Archive and Map Room'], use: '恒温防火档案柜、平放式地图柜、阅读长桌；存历代地契、改建图纸、宴会名单', en: ['Archive and Map Room', 'Fire-proof archive presses, plan chests, reading table: deeds, alteration drawings, banquet lists', ''] }),
  R('216', '保险库', 1, [-40, -34, -16, -9], 'oak', 'panelWalnut', 3, { alias: ['保险库'], alias_en: ['Strong Room'], use: '钢门外包胡桃木板，内有家族文书与珠宝抽屉', en: ['Strong Room', 'Walnut-faced steel door; family papers and jewel drawers', ''] }),
  R('217', '书房盥洗室', 1, [-40, -34, -9, -2], 'marbleC', 'marbleGold', 2, { alias: ['书房盥洗室'], alias_en: ['Study Washroom'],
    use: '连体低水箱马桶（乌木座圈、黄铜杠杆）、单盆洗手台、镀镍电热毛巾架挂深绿手巾、黄铜框方镜',
    heritage: '墙上挂一面初代用过的剃须镜，镜面已经雾化。', era: '初代',
    en: ['Study Washroom', 'Close-coupled WC with ebony seat, single basin, heated rail with green towels, brass mirror', 'The founder\'s shaving mirror hangs on the wall, its glass long since clouded.'] }),
  R('218', '晨读室', 1, [-54, -40, -16, -2], 'oak', 'silkIvory', 2, { alias: ['晨读室', '阅览室'], alias_en: ['Reading Room'],
    use: '朝北光线柔和：扶手椅 ×2、脚凳、阅读灯、报刊桌、窗前躺椅、书柜',
    heritage: '窗台上的黄铜望远镜对准人工湖的湖心圆亭。', era: '三代',
    en: ['Reading Room', 'North light: armchairs, footstool, reading lamps, periodicals table, chaise by the window', 'The brass telescope on the sill is trained on the round temple in the lake.'] }),
  R('219', '客房 A', 1, [20, 37, 2, 16], 'oak', 'silkBlue', 1, { tall: ['-z'], parts: { bath: [20, 26, 8, 16], dress: [20, 26, 2, 8], bed: [26, 37, 2, 16] }, alias: ['客房', '客房A', '客房 A'], alias_en: ['Guest Room', 'Guest Room A'], src: '世界书',
    use: '天城蓝客房套间：' + SUITE,
    heritage: '窗外正对大道，住过历代到访的最尊贵客人，床头柜抽屉里有一本历任住客的留言簿。', era: '历代',
    en: ['Guest Room A', 'Tiancheng-blue guest suite. ' + SUITE_EN, 'Facing the avenue, it has lodged the most honoured guests of every generation; a guestbook of past occupants waits in the nightstand drawer.'] }),
  R('220', '客房 B', 1, [37, 54, 2, 16], 'oak', 'silkRose', 2, { tall: ['-z'], parts: { bath: [48, 54, 8, 16], dress: [48, 54, 2, 8], bed: [37, 48, 2, 16] }, alias: ['客房B', '客房 B'], alias_en: ['Guest Room B'], src: '世界书',
    use: '玫瑰粉客房套间：' + SUITE, heritage: '梳妆台是一位曾祖母的嫁妆。', era: '历代',
    en: ['Guest Room B', 'Rose guest suite. ' + SUITE_EN, 'The dressing table was part of a great-grandmother\'s trousseau.'] }),
  R('221', '东二层廊', 1, [20, 54, -2, 2], 'marble', 'plasterStone', 2, { minor: true, alias: ['东二层廊'], alias_en: ['East Upper Corridor'], use: '同东翼廊', en: ['East Upper Corridor', 'Wing corridor', ''] }),
  R('222', '客房 C', 1, [20, 37, -16, -2], 'oak', 'silkGreen', 2, { parts: { bath: [20, 26, -16, -8], dress: [20, 26, -8, -2], bed: [26, 37, -16, -2] }, alias: ['客房C', '客房 C'], alias_en: ['Guest Room C'], src: '世界书',
    use: '帝政绿客房套间：' + SUITE, heritage: '壁炉上方挂着湖景的第一幅写生，画的时候湖还没挖完。', era: '三代',
    en: ['Guest Room C', 'Empire-green guest suite. ' + SUITE_EN, 'Above the fireplace hangs the first sketch of the lake, painted before the digging was finished.'] }),
  R('223', '客用起居室', 1, [37, 54, -16, -2], 'oak', 'silkIvory', 2, { alias: ['客用起居室'], alias_en: ['Guests\' Sitting Room'], use: '两组沙发、写字台、书柜、牌桌、小吧台、湖景大窗、壁炉', en: ['Guests\' Sitting Room', 'Sofas, writing desk, bookcase, card table, small bar, lake window, fireplace', ''] }),
  R('C2', '塔亭阅览廊', 1, [-102, -78, -12, 12], 'oak', 'panelWalnut', 2, { alias: ['阅览廊', '塔亭阅览廊'], alias_en: ['Library Gallery'],
    use: '图书馆上层回廊与阅览龛，手稿柜，通八角塔身楼梯', heritage: '图书馆塔亭藏书约 4 万册，其中有天城早期的以太学手稿。', era: '四代',
    en: ['Library Gallery', 'Upper gallery and reading alcoves of the library, manuscript cases, stair to the tower', 'The library holds some 40,000 volumes, including early manuscripts on ether science.'] }),

  /* ---------------- F3 私人层 ---------------- */
  R('301', '肖像廊', 2, [-12, 12, 2, 22], 'herring', 'damaskRed', 1, { tall: ['-z', '-x'], alias: ['廊厅', '肖像廊'], alias_en: ['Gallery Hall', 'Portrait Gallery'],
    use: '绛红丝缎锦墙布挂历代家族肖像 ×12，x = ±8 各 4 根爱奥尼亚柱承托鼓座；丝绒长凳 ×4、大理石边桌与纹章盾',
    heritage: '最末一个画框是空的（金框里衬着深红丝），留给现任家主。', era: '现任',
    en: ['Portrait Gallery', 'Crimson damask hung with twelve family portraits; Ionic columns carry the drum above; velvet benches, heraldic shields', 'The last frame is empty, lined with crimson silk, reserved for the present head.'] }),
  R('302', '主人侍从间', 2, [-20, -12, 2, 22], 'oak', 'paintIvory', 3, { alias: ['主人侍从间'], alias_en: ['Valet\'s Room'], use: '熨烫台、以太衣物蒸汽机、擦鞋台、布草柜、侍从桌、铃板分机', en: ['Valet\'s Room', 'Pressing table, ether steamer, boot bench, linen press, bell extension', ''] }),
  R('303', '布草间', 2, [12, 20, 12, 22], 'oak', 'paintIvory', 3, { alias: ['布草间'], alias_en: ['Linen Room'], use: '布草柜与熨台', en: ['Linen Room', 'Linen presses and ironing table', ''] }),
  R('304', '家庭盥洗室', 2, [12, 20, 2, 12], 'marbleC', 'marbleGold', 2, { alias: ['家庭盥洗室'], alias_en: ['Family Washroom'], use: '连体马桶（乌木座圈）、单盆洗手台、电热毛巾架挂象牙白毛巾、黄铜框镜', en: ['Family Washroom', 'Close-coupled WC, basin, heated rail with ivory towels, brass mirror', ''] }),
  R('305', '三层过厅', 2, [-20, 20, -6, 2], 'oak', 'plasterStone', 2, { minor: true, alias: ['三层过厅'], alias_en: ['Second-floor Hall'], use: '西端门禁门通主人私区，东端通家人区', en: ['Second-floor Hall', 'Secured door west to the private wing, east to the family wing', ''] }),
  R('306', '家庭餐室', 2, [-8, 8, -22, -6], 'oak', 'silkDuck', 2, { alias: ['家庭餐室'], alias_en: ['Family Dining Room'],
    use: '胡桃木椭圆桌（8 人）、边柜、茶具柜、窗边早餐桌、西耶纳黄壁炉；窗外正对人工湖',
    heritage: '餐桌下地板上有一块补过的木片，是某一代孩子在桌下藏了一只小猫，挠坏的。', era: '历代',
    en: ['Family Dining Room', 'Oval walnut table for eight, sideboard, breakfast table by the window, Siena fireplace; lake view', 'A patched board under the table marks where a child once hid a kitten, which scratched the floor.'] }),
  R('307', '主楼梯顶层平台', 2, [8, 20, -22, -6], 'marble', 'plasterStone', 2, { minor: true, alias: ['主楼梯顶层平台'], alias_en: ['Top Stair Landing'], use: '主楼梯到此为止，上方是天光井', en: ['Top Stair Landing', 'The main stair ends here under the skylight', ''] }),
  R('309', '侍从待命室', 2, [-20, -14, -22, -14], 'oak', 'paintIvory', 3, { alias: ['侍从待命室'], alias_en: ['Footmen\'s Waiting Room'], use: '铃板、两把椅子、茶水台', en: ['Footmen\'s Waiting Room', 'Bell board, two chairs, tea counter', ''] }),
  R('310', '主人通道三层站', 2, [-14, -8, -22, -14], 'stoneFlag', 'panelWalnut', 3, { alias: ['主人通道三层站'], alias_en: ['Master Passage (2F)'], src: 'ROADMAP', use: '螺旋梯与单人电梯在本层开门', en: ['Master Passage (2F)', 'Spiral stair and one-person lift stop here', ''] }),
  R('311', '主人前厅', 2, [-14, -8, -14, -6], 'oak', 'panelWalnut', 3, { alias: ['主人前厅'], alias_en: ['Master\'s Lobby'], use: '胡桃木护墙、衣帽架、镜子，门通过厅和西翼', en: ['Master\'s Lobby', 'Walnut panelling, coat stand, mirror', ''] }),
  R('312', '主人起居室', 2, [-40, -20, 2, 16], 'versailles', 'silkBlue', 2, { tall: ['-z'], alias: ['主人起居室'], alias_en: ['Master\'s Sitting Room'],
    use: '大沙发、一对扶手椅、缎木镶嵌写字台、书柜 ×2、以太留声机、Statuario 壁炉与鎏金铜座钟',
    heritage: '座钟由第三代家主亲手修过，底座里压着他写的一张纸条：「慢一点也无妨」。', era: '三代',
    en: ['Master\'s Sitting Room', 'Sofa, armchairs, marquetry desk, bookcases, ether gramophone, Statuario fireplace with ormolu clock', 'The third head repaired the mantel clock himself and left a note in its base: "A little slower does no harm."'] }),
  R('313', '更衣室', 2, [-54, -40, 2, 16], 'oak', 'panelMahog', 2, { alias: ['更衣室'], alias_en: ['Dressing Room'],
    use: '桃花心木衣柜墙、大理石面中岛抽屉柜、三折穿衣镜、梳妆台、鞋柜、配饰抽屉、躺椅',
    heritage: '一只衣柜的门内侧贴着历代家主的制服尺码表，墨色从褐色一路变到黑色。', era: '历代',
    en: ['Dressing Room', 'Mahogany wardrobe wall, marble-topped island, triple mirror, dressing table, shoe cabinet, chaise', 'Inside one wardrobe door is every head\'s uniform measurements, the ink shading from brown to black.'] }),
  R('314', '西三层廊', 2, [-54, -20, -2, 2], 'oak', 'plasterStone', 2, { minor: true, alias: ['西三层廊'], alias_en: ['Private Corridor'], use: '主人私区，入口有门禁，墙上挂小幅风景画', en: ['Private Corridor', 'Secured corridor of the private wing', ''] }),
  R('315', '主卧', 2, [-40, -20, -16, -2], 'versailles', 'silkIvory', 1, { alias: ['主卧', '主卧室', '卧室', '寝室'], alias_en: ['Master Bedroom', 'Bedroom'], src: '世界书',
    use: '帝政式床（2.4 × 2.2 m，皇冠华盖、丝缎帷幔）、大理石面床头柜与台灯、躺椅、扶手椅、写字桌、三折镜梳妆台、Statuario 壁炉；窗外湖景',
    heritage: '床头板里的家徽，是初代订制的第一件以家徽为饰的家具，历代只换过软包。', era: '初代',
    en: ['Master Bedroom', 'Empire bed under a crown canopy, marble-topped nightstands, chaise, armchairs, writing table, dressing table, Statuario fireplace; lake view', 'The crest in the headboard was the founder\'s first piece of crested furniture; only the upholstery has ever been renewed.'] }),
  R('316', '主浴室', 2, [-54, -40, -16, -2], 'marble', 'marbleGold', 1, { parts: { wc: [-54, -51, -16, -13] }, alias: ['主浴室', '浴室', '浴池', '盥洗室'], alias_en: ['Master Bathroom', 'Bathroom'], src: '世界书',
    use: '整块 Statuario 独立浴缸立在圆台上、玻璃黄铜淋浴间、双盆洗手台、独立马桶间、两组电热毛巾架与叠放毛巾、浴袍、三折化妆镜；顶上圆形天光',
    heritage: '浴缸是三代家主用一整块大理石雕的，石料来自已经封矿的旧采石场。', era: '三代',
    en: ['Master Bathroom', 'Monolithic Statuario tub on a round dais, glass-and-brass shower, double vanity, separate WC, heated towel rails, robes; round skylight', 'The tub was carved for the third head from a single block, quarried from a pit that has since closed.'] }),
  R('317', '寝', 2, [20, 40, 2, 16], 'oak', 'silkIvory', 2, { parts: { bath: [20, 26, 9, 16], dress: [20, 26, 2, 9], bed: [26, 40, 2, 16] }, alias: ['寝', '次卧'], alias_en: ['Second Bedroom'], src: '世界书',
    use: '珍珠灰与淡金的次卧套间：' + SUITE + '；浴室为镀镍五金', heritage: '床头挂一幅小小的祖母刺绣，内容是家徽上的苹果树。', era: '历代',
    en: ['Second Bedroom', 'Pearl-grey and pale-gold suite. ' + SUITE_EN, 'A small embroidery by a grandmother hangs over the bed: the apple tree from the crest.'] }),
  R('318', '家庭客厅', 2, [40, 54, 2, 16], 'oak', 'silkIvory', 2, { alias: ['家庭客厅'], alias_en: ['Family Sitting Room'], use: '沙发、扶手椅、书柜、牌桌、壁炉、留声机，墙上挂家人照片', en: ['Family Sitting Room', 'Sofa, armchairs, bookcase, card table, fireplace, gramophone, family photographs', ''] }),
  R('319', '东三层廊', 2, [20, 54, -2, 2], 'oak', 'plasterStone', 2, { minor: true, alias: ['东三层廊'], alias_en: ['Family Corridor'], use: '家人区走廊，有门禁', en: ['Family Corridor', 'Secured corridor of the family wing', ''] }),
  R('320', '私人房间 A', 2, [20, 36, -16, -2], 'oak', 'paintIvory', 3, { alias: ['私人房间', '私人房间A', '私人房间 A'], alias_en: ['Private Room', 'Private Room A'],
    use: '用途未设定，只放普通家具：沙发、扶手椅、书桌加椅子、书柜、衣柜、单人床、茶几、台灯', note: '中性化',
    en: ['Private Room A', 'Unassigned room with ordinary furniture: sofa, armchair, desk and chair, bookcase, wardrobe, single bed, side table, lamp', ''] }),
  R('321', '备用卧室', 2, [36, 54, -16, -2], 'oak', 'paintIvory', 2, { parts: { bath: [49, 54, -16, -11] }, alias: ['备用卧室'], alias_en: ['Spare Bedroom'], use: '床、床头柜、衣柜、写字桌、扶手椅、壁炉，小浴室（马桶、洗手台、毛巾架）', en: ['Spare Bedroom', 'Bed, nightstand, wardrobe, desk, armchair, fireplace, small bathroom', ''] }),

  /* ---------------- F4 服务层（只有主楼） ---------------- */
  R('401', '女仆长办公室', 3, [-20, -8, 12, 22], 'oak', 'paintIvory', 3, { alias: ['女仆长办公室', '办公室'], alias_en: ['Head Maid\'s Office'], src: '世界书',
    use: '桃花心木写字台加扶手椅、排班板、钥匙柜、账簿柜、访客椅 ×2、小壁炉、员工名册框',
    heritage: '女仆长办公室墙上挂着历任女仆长的名册，每个名字后面有一枚小铜钥匙，象征交接。', era: '历代',
    en: ['Head Maid\'s Office', 'Mahogany desk, rota board, key cabinet, ledger press, visitor chairs, small fireplace', 'The roll of past head maids hangs on the wall, a small brass key after every name to mark each handover.'] }),
  R('402', '女仆长卧室', 3, [-20, -8, 2, 12], 'oak', 'silkDuck', 3, { parts: { bath: [-11.5, -8, 2, 5.5] }, alias: ['女仆长卧室'], alias_en: ['Head Maid\'s Bedroom'], use: '单人床、床头柜、衣柜、写字桌、扶手椅；带小浴室', en: ['Head Maid\'s Bedroom', 'Single bed, nightstand, wardrobe, desk, armchair; small bathroom', ''] }),
  R('403', '附属用房', 3, [-8, 8, 10, 22], 'lino', 'paintIvory', 3, { alias: ['附属用房'], alias_en: ['Ancillary Room'], use: '长桌、椅子、储物柜、书架、吸顶灯（用途未设定，只放普通家具）', note: '中性化',
    en: ['Ancillary Room', 'Long table, chairs, storage cupboards, bookshelf (unassigned; ordinary furniture only)', ''] }),
  R('404', '员工起居室', 3, [-8, 8, 2, 10], 'oak', 'paintIvory', 3, { alias: ['员工起居室', '仆役厅', '员工餐厅'], alias_en: ['Servants\' Hall', 'Staff Sitting Room'], use: '长餐桌与 12 把椅子、沙发、书架、茶水台', en: ['Servants\' Hall', 'Long table for twelve, sofa, bookshelf, tea counter', ''] }),
  R('405', '洗衣房', 3, [8, 20, 12, 22], 'tile', 'tileWhite', 3, { alias: ['洗衣房', '洗衣'], alias_en: ['Laundry'], src: '世界书', use: '熨烫台 ×3、以太熨烫机、折叠台、晾衣架、布草推车（大件在仆役楼洗）', en: ['Laundry', 'Ironing tables, ether press, folding table, airers, linen trolleys', ''] }),
  R('406', '储藏室', 3, [8, 20, 2, 12], 'lino', 'paintIvory', 3, { alias: ['储藏室', '储藏'], alias_en: ['Store'], src: '世界书', use: '分格货架（灯芯、蜡、瓷器、银器备品）、梯子、登记台', en: ['Store', 'Pigeonhole shelving for wicks, wax, spare china and silver; ladder; register desk', ''] }),
  R('407', '四层廊', 3, [-20, 20, -6, 2], 'oak', 'paintIvory', 3, { minor: true, alias: ['四层廊'], alias_en: ['Attic Corridor'], use: '布草推车停放位、公告板', en: ['Attic Corridor', 'Trolley bay and notice board', ''] }),
  R('408', '监控室', 3, [-8, 8, -14, -6], 'lino', 'paintIvory', 3, { alias: ['监控室', '监控', '安保室'], alias_en: ['Security Room'], src: '世界书',
    use: '黄铜框以太监视墙、操作台、两把转椅、档案柜', en: ['Security Room', 'Brass-framed ether monitor wall, console, two swivel chairs, files', ''] }),
  R('409', '结界值守室', 3, [-8, 8, -22, -14], 'stoneFlag', 'plasterStone', 3, { alias: ['结界值守室'], alias_en: ['Ward Room'], src: '世界书', use: '黄铜加以太晶的结界主控台、四座锚碑的状态表盘、值守桌', en: ['Ward Room', 'Brass-and-crystal ward console, dials for the four anchor stones, duty desk', ''] }),
  R('410', '员工卧室', 3, [8, 20, -22, -6], 'oak', 'paintIvory', 3, { parts: { void: [8, 12, -20, -8] }, alias: ['员工卧室'], alias_en: ['Staff Bedrooms'], use: '员工卧室 ×3：单人床、床头柜、衣柜、小书桌；电梯在本层凭钥匙开门，楼梯厅的天光井穿过这里', en: ['Staff Bedrooms', 'Three bedrooms with single bed, nightstand, wardrobe, desk; key-only lift stop; the stair skylight shaft passes through', ''] }),
  R('412', '员工盥洗室', 3, [-20, -14, -22, -14], 'marbleC', 'tileWhite', 3, { alias: ['员工盥洗室'], alias_en: ['Staff Washroom'], use: '淋浴 ×2、马桶 ×2（镀镍手柄、白色座圈）、洗手台 ×2、每人一格的毛巾架', en: ['Staff Washroom', 'Two showers, two WCs, two basins, towel pigeonholes', ''] }),
  R('413', '布草储藏', 3, [-14, -8, -14, -6], 'oak', 'paintIvory', 3, { alias: ['布草储藏'], alias_en: ['Linen Store'], use: '布草柜到顶，按房间编号分格', en: ['Linen Store', 'Linen presses to the ceiling, one compartment per room', ''] }),

  /* ---------------- F5 眺望层 ---------------- */
  R('501', '屋顶露台', 4, [-20, 20, -22, 22], 'pavers', 'plasterStone', 2, { skipFloor: true, container: true, lp: [14, 16], alias: ['露台', '观景露台', '屋顶', '屋顶露台'], alias_en: ['Roof Terrace', 'Terrace'], src: '世界书',
    use: '波特兰石板铺地，栏杆从立面退进 1.5 m；柚木躺椅 ×6、柑橘与月桂花钵 ×4；紫藤廊连主人通道出口亭与眺望亭', en: ['Roof Terrace', 'Portland stone terrace behind a set-back balustrade: teak loungers, citrus and bay planters, wisteria walk', ''] }),
  R('502', '眺望亭', 4, [-7, 7, -5, 9], 'compass', 'plasterStone', 1, { round: { cx: 0, cz: 2, r: 6.4 }, alias: ['眺望亭', '电梯厅', '私人电梯厅', '穹顶'], alias_en: ['Belvedere', 'Private Lift Hall', 'Dome'],
    use: '穹顶下的圆厅：罗盘星形拼花地面、16 根壁柱与 8 扇拱窗、环形蓝丝绒软座、黄铜天文望远镜、刻天城全图的地图桌、以太气象仪；穹顶内画金色星座',
    heritage: '星座图是按第三代建亭那一夜的星空画的，那颗「家族之星」贴的是真金箔。', era: '三代',
    en: ['Belvedere', 'Round hall under the dome: compass-star marble floor, ring banquette, brass telescope, map table of Tiancheng, ether barometer; gilded constellations overhead', 'The constellations are painted as the sky stood on the night the third generation completed it; the "family star" is real gold leaf.'] }),
  R('503', '主人通道出口亭', 4, [-14, -8, -22, -14], 'stoneFlag', 'plasterStone', 3, { alias: ['主人通道出口亭'], alias_en: ['Master Passage Kiosk'], src: 'ROADMAP', use: '铅皮屋顶小石亭，经 20 m 紫藤廊通眺望亭', en: ['Master Passage Kiosk', 'Small lead-roofed kiosk; a wisteria walk leads to the belvedere', ''] }),
  R('504', '电梯出口亭', 4, [12, 16, -17, -12], 'marble', 'plasterStone', 3, { alias: ['电梯出口亭'], alias_en: ['Lift Kiosk'], use: '小石亭，黄铜门', en: ['Lift Kiosk', 'Small stone kiosk with brass doors', ''] }),
  R('505', '仆役楼梯出口亭', 4, [-20, -14, -14, -6], 'stoneFlag', 'plasterStone', 3, { alias: ['仆役楼梯出口亭'], alias_en: ['Service Stair Kiosk'], use: '检修用，门上锁', en: ['Service Stair Kiosk', 'Maintenance access, kept locked', ''] }),
];
export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

/* ================================================================
 * 竖井：floors = 画出竖井段的层；stops = 开门的层；b1 = 向下延伸到的 y
 * ================================================================ */
export const SHAFTS = [
  { id: 'stair', name: '主楼梯', r: [8, 20, -22, -6], color: '#4C8C99', floors: [0, 1, 2], stops: [0, 1, 2], src: '推断', use: '访客与主人：石材悬挑双跑回转梯，F1–F3，顶部天光' },
  { id: 'lift', name: '电梯', r: [12.5, 15.5, -16.5, -12.5], color: '#4C8C99', floors: [0, 1, 2, 3, 4], stops: [0, 1, 2, 4], key: [3], src: '推断', use: '黄铜笼式以太电梯（三代加装；仓库自设，非卡设定）：停 F1–F3 与 F5，F4 需钥匙' },
  { id: 'service', name: '仆役楼梯', r: [-20, -14, -14, -6], color: '#C98A40', floors: [0, 1, 2, 3, 4], stops: [0, 1, 2, 3, 4], b1: -3.3, src: '推断', use: '仆役：石踏步、铁栏杆，B1–F5；内有 1.2 × 1.2 m 食梯（手摇与以太两用）' },
  { id: 'master', name: '主人通道', r: [-14, -8, -22, -14], color: '#7A5FA0', floors: [0, 1, 2, 3, 4], stops: [0, 2, 4], src: 'ROADMAP', use: '仅主人：螺旋梯加单人电梯，只在 F1 / F3 / F5 开门；F1 后墙暗门通紫藤廊', note: '走线推断' },
];

/* ================================================================
 * 室外区域（外观模式；模型轴）
 * ================================================================ */
const A = (name, o) => ({ name, alias: [], alias_en: [], y: 3, pri: 5, src: '推断', ...o });
export const AREAS = [
  A('伊甸庄园 · 主楼', { alias: ['伊甸庄园', '伊甸', '庄园', '主楼', '中央主楼', '府邸'], alias_en: ['Eden Manor', 'Main House', 'Manor'], x: 0, z: 0, w: 40, d: 44, y: 34, pri: 10, src: '世界书', note: 'src「新古典主义白色石材建筑」',
    use: '帕拉第奥式五段构图的中央主楼：六柱科林斯门廊与山花家徽、粗面石基座、檐部与挡檐墙、屋顶平台与眺望亭穹顶' }),
  A('门廊', { alias: ['门廊', '柱廊'], alias_en: ['Portico'], x: 0, z: 26, w: 31, d: 8, y: 22, pri: 9, use: '六柱科林斯巨柱式门廊，柱高 13.5 m（10D），山花坡度 1:4.5，山花内贴金家徽', heritage: '纹章出现的位置：门廊山花（贴金）、大厅地面镶嵌、床头板、银器、毛巾刺绣、信笺、结界锚碑的碑座。' }),
  A('西翼', { alias: ['西翼'], alias_en: ['West Wing'], x: -37, z: 0, w: 34, d: 32, y: 17, pri: 6, use: '三层七开间，平屋顶栏杆女儿墙：F1 餐厅，F2 书房，F3 主人套间' }),
  A('东翼', { alias: ['东翼'], alias_en: ['East Wing'], x: 37, z: 0, w: 34, d: 32, y: 17, pri: 6, use: '三层七开间，平屋顶栏杆女儿墙：F1 会客厅，F2 客房，F3 家人区' }),
  A('西柱廊', { alias: ['西柱廊', '柱廊连廊', '连廊'], alias_en: ['West Colonnade', 'Colonnade'], x: -66, z: 0, w: 24, d: 6, y: 9, pri: 5, use: '爱奥尼亚单排柱廊，高 5.5 m，玻璃冬季封闭' }),
  A('东柱廊', { alias: ['东柱廊'], alias_en: ['East Colonnade'], x: 66, z: 0, w: 24, d: 6, y: 9, pri: 5, use: '爱奥尼亚单排柱廊，高 5.5 m，玻璃冬季封闭' }),
  A('图书馆塔楼', { alias: ['图书馆塔楼', '塔楼', '浑天仪'], alias_en: ['Library Tower', 'Armillary'], x: -90, z: 0, w: 24, d: 24, y: 31, pri: 9, use: '西端塔亭：两层 10 m，八角塔身到 28 m，铅皮小穹顶与金色浑天仪', heritage: '塔顶的金色浑天仪每年转一格，一圈正好是一百年。' }),
  A('音乐厅亭', { alias: ['音乐厅亭'], alias_en: ['Music Pavilion'], x: 90, z: -3, w: 24, d: 38, y: 16, pri: 9, use: '东端音乐厅：单层 11 m，筒拱屋面，北端半圆后殿安管风琴', heritage: '管风琴最低的那根音管上刻着四代家主和建造匠人的名字。' }),
  A('前庭', { alias: ['前庭', '喷泉', '前院', '荣誉庭院'], alias_en: ['Forecourt', 'Fountain'], x: 0, z: 53, w: 110, d: 34, y: 9, pri: 8, src: '世界书', note: 'src「前庭喷泉」',
    use: '砾石广场，中央大喷泉：外池半径 7 m、三层水盘，顶上铜像「持苹果的少女」；两侧椴树林荫' }),
  A('西花坛', { alias: ['花坛', '花园', '庭园', '刺绣花坛'], alias_en: ['Gardens', 'Garden', 'Parterre'], x: -36, z: 53, w: 40, d: 30, y: 2, pri: 7, src: '世界书', note: 'src「花园」；布局推断', use: '法式刺绣花坛 3 × 2 格，黄杨卷草纹填彩色碎砖和季节花' }),
  A('东花坛', { alias: ['东花坛'], alias_en: ['East Parterre'], x: 36, z: 53, w: 40, d: 30, y: 2, pri: 6, use: '法式刺绣花坛 3 × 2 格' }),
  A('中轴大道', { alias: ['大道', '中轴大道', '林荫道', '条纹草坪'], alias_en: ['Avenue', 'Grand Avenue'], x: 0, z: 170, w: 50, d: 200, y: 2, pri: 9, use: '大道 x ±3，两侧各一行椴树，前 56 m 有 16 座雕像台座；割草深浅条纹的长草坪' }),
  A('停靠平台', { alias: ['停靠平台', '访客停靠平台', '平台'], alias_en: ['Landing Platform', 'Landing Stage'], x: 0, z: 277, r: 16, y: 5, pri: 9, src: '世界书', note: 'src「访客停靠平台」',
    use: '悬浮载具的降落点：伸出岛缘的圆形平台，铜绿栏杆，地面嵌金色引导环', heritage: '铜栏的扶手被历代访客摸出了一圈金色的亮边。' }),
  A('玫瑰园', { alias: ['玫瑰园'], alias_en: ['Rose Garden'], x: 95, z: 70, r: 25, y: 3, pri: 5, use: '直径 50 m 的圆形下沉园，4 条放射小径，中心铁艺凉亭，外圈攀缘蔷薇拱廊' }),
  A('迷园', { alias: ['迷园', '树篱迷宫', '迷宫'], alias_en: ['Hedge Maze', 'Maze'], x: -95, z: 70, w: 50, d: 50, y: 3, pri: 5, use: '紫杉迷园，中心是日晷' }),
  A('后庭', { alias: ['后庭', '后院', '台地'], alias_en: ['Rear Court', 'Terrace Garden'], x: 0, z: -36.5, w: 60, d: 29, y: 3, pri: 7, src: '世界书', note: 'src「后庭」', use: '府邸后的石铺台地、两块草坪、栏杆与下到湖岸的台阶' }),
  A('人工湖', { alias: ['人工湖', '湖'], alias_en: ['Lake'], x: 7.5, z: -102.5, w: 135, d: 65, ell: true, y: 2, pri: 9, src: '世界书', note: 'src「后庭人工湖」', use: '风景式湖岸的人工湖：湖心圆亭、水榭、白石小桥' }),
  A('湖心圆亭', { alias: ['湖心圆亭', '湖心亭', '圆亭'], alias_en: ['Lake Temple', 'Temple of the Lake'], x: 15, z: -102, r: 5, y: 10, pri: 6, use: '湖心小岛上的 8 柱圆形神殿，柱圈直径 5.6 m，高 7 m，铅皮穹顶加金球', heritage: '三代挖人工湖，建湖心圆亭，把后半部改成英式风景园。' }),
  A('水榭', { alias: ['水榭', '凉亭', '船屋'], alias_en: ['Water Pavilion', 'Boathouse'], x: 62, z: -93, w: 16, d: 10, y: 8, pri: 6, use: '架在湖上的石台和敞亭，下层是船屋', heritage: '船屋里停着一条初代的木船，每年只在庄园纪念日下水一次。' }),
  A('围墙花园', { alias: ['围墙花园', '菜园', '厨房花园'], alias_en: ['Kitchen Garden', 'Walled Garden'], x: 145, z: -110, w: 70, d: 50, y: 5, pri: 5, use: '3.5 m 高砖墙，墙面种树形果树，24 块菜畦和花畦' }),
  A('橘园', { alias: ['橘园', '温室'], alias_en: ['Orangery'], x: 145, z: -132, w: 48, d: 10, y: 9, pri: 5, use: '石柱加大玻璃窗的橘园，靠围墙花园北墙朝南', heritage: '里面最老的一株橘树比府邸还老，是初代从旧宅盆栽带来的。' }),
  A('果园', { alias: ['果园'], alias_en: ['Orchard'], x: 215, z: -80, w: 50, d: 50, y: 3, pri: 4, use: '苹果、梨、榅桲按梅花形种植，草下种野花（「伊甸」之名的由来之一）' }),
  A('西预留草坪', { alias: ['预留草坪', '设计草坪'], alias_en: ['Reserve Lawn'], x: -175, z: 10, w: 105, d: 95, y: 1, pri: 3, use: '绿篱框、十字步道、中心水盘、四角雕像、条纹割草，留给以后加建' }),
  A('东预留草坪', { alias: ['东预留草坪'], alias_en: ['East Reserve Lawn'], x: 175, z: 10, w: 105, d: 95, y: 1, pri: 3, use: '绿篱框、十字步道、中心水盘、四角雕像、条纹割草，留给以后加建' }),
  A('仆役楼', { alias: ['仆役楼', '仆人楼', '主厨房'], alias_en: ['Staff Wing', 'Servants\' Block'], x: -150, z: -115.0, w: 44, d: 14, y: 12, pri: 4, use: '服务区：主厨房、仆役厅、员工宿舍、大洗衣房（2 层 + 阁楼）' }),
  A('悬浮车库', { alias: ['悬浮车库', '车库'], alias_en: ['Hover Garage', 'Garage'], x: -150, z: -139.0, w: 40, d: 10, y: 9, pri: 4, src: 'user', note: '用户要求加的设施（卡中没有）', use: '悬浮车停放与保养' }),
  A('工坊', { alias: ['工坊'], alias_en: ['Workshop'], x: -178, z: -127.0, w: 8, d: 30, y: 7, pri: 3, use: '悬浮载具与以太引擎维修、以太储罐', note: '设定坐标与仆役楼重叠，西移 8 m；服务区整体北移 22 m' }),
  A('悬浮载具库', { alias: ['悬浮载具库', '载具库'], alias_en: ['Hover-vehicle Bay'], x: -107, z: -152.0, w: 30, d: 20, y: 12, pri: 4, note: '仓库自设（卡中没有）', use: '主人私人悬浮载具停放，高 9 m' }),
  A('载具停靠坪', { alias: ['载具停靠坪', '停机坪'], alias_en: ['Vehicle Pad'], x: -105, z: -127.0, w: 30, d: 26, y: 2, pri: 3, src: 'user', note: '用户要求加的设施（卡中没有）', use: '悬浮载具库前的起降坪' }),
  A('后轴观景台', { alias: ['观景台', '后轴观景台'], alias_en: ['Lookout', 'North Lookout'], x: 0, z: -215, r: 10, y: 3, pri: 4, use: '岛缘半圆观景台，俯瞰下方天城' }),
  A('西观景亭', { alias: ['西观景亭'], alias_en: ['West Lookout'], x: -315, z: 25, r: 4, y: 6, pri: 3, use: '小圆亭，看日落' }),
  A('东观景亭', { alias: ['东观景亭'], alias_en: ['East Lookout'], x: 315, z: 25, r: 4, y: 6, pri: 3, use: '小圆亭，看日出' }),
  A('结界锚碑 · 西北', { alias: ['结界锚碑', '锚碑'], alias_en: ['Ward Anchor', 'Anchor Stone'], x: -235, z: -140, r: 3, y: 11, pri: 3, src: '世界书', note: 'src「全域结界」；形式、位置推断', use: '2 × 2 × 9 m 方尖碑，碑顶嵌以太晶，由 F4 结界值守室控制' }),
  A('结界锚碑 · 东北', { alias: ['东北锚碑'], alias_en: ['NE Anchor'], x: 235, z: -140, r: 3, y: 11, pri: 3, src: '世界书', use: '2 × 2 × 9 m 方尖碑，碑顶嵌以太晶' }),
  A('结界锚碑 · 西南', { alias: ['西南锚碑'], alias_en: ['SW Anchor'], x: -235, z: 190, r: 3, y: 11, pri: 3, src: '世界书', use: '2 × 2 × 9 m 方尖碑，碑顶嵌以太晶' }),
  A('结界锚碑 · 东南', { alias: ['东南锚碑'], alias_en: ['SE Anchor'], x: 235, z: 190, r: 3, y: 11, pri: 3, src: '世界书', use: '2 × 2 × 9 m 方尖碑，碑顶嵌以太晶' }),
];

/* ================================================================
 * 传承件（REFIT_PLAN §4）：室内件由 furniture.js 放，室外件由 building / site 建模
 * ================================================================ */
const H = (o) => ({ ry: 0, tour: 0, ...o });
export const HERITAGE = [
  H({ id: 'landingRing', name: '停靠平台引导环', en: 'Landing ring', floor: null, room: null, x: 0, y: 1.0, z: 277, kind: 'landingRing', era: '历代', tour: 1, view: { w: 60, theta: 0.3, phi: 0.9 },
    caption: '停靠平台：铜栏的扶手被历代访客摸出了一圈金色的亮边。', caption_en: 'Landing platform: generations of visitors have polished a ring of gold onto the brass handrail.' }),
  H({ id: 'pedimentCrest', name: '山花家徽', en: 'Pediment crest', floor: null, room: null, x: 0, y: 18.9, z: 29.0, kind: 'crest', era: '初代', tour: 2, view: { w: 40, theta: 0.15, phi: 1.2 },
    caption: '盾面是天城蓝，中间一株金色苹果树立在白色云纹上，树上方是一对展开的金色翅膀（代表浮空）。格言带上写「HORTUS SUPRA NUBES」（园在云上）。', caption_en: 'A Tiancheng-blue shield with a golden apple tree on white clouds beneath a pair of spread golden wings; motto HORTUS SUPRA NUBES, a garden above the clouds.' }),
  H({ id: 'longcaseClock', name: '长箱钟', en: 'Longcase clock', floor: 0, room: '101', x: -11.3, y: 1.2 + 2.9, z: 16, ry: Math.PI / 2, kind: 'longcaseClock', era: '初代', tour: 3, view: { w: 18, theta: 0.9, phi: 1.1 },
    caption: '初代奠基人订制的胡桃木长箱钟，高 2.6 m，表盘上是天城初建时的星图，每到整点报出庄园的建成日。', caption_en: 'The founder\'s walnut longcase clock, 2.6 m tall; its dial shows the stars over Tiancheng at its founding and it chimes the founding date every hour.' }),
  H({ id: 'floorCrest', name: '大厅地面家徽', en: 'Hall floor crest', floor: 0, room: '101', x: 0, y: 1.2 + 0.4, z: 12, kind: 'crest', era: '初代',
    caption: '中心嵌直径 4 m 的家徽圆盘，用黄铜和西耶纳黄大理石镶嵌。', caption_en: 'A 4 m crest roundel of brass and Siena marble inlaid at the centre of the hall.' }),
  H({ id: 'busts', name: '历代家主胸像', en: 'Busts of the heads', floor: 0, room: '106', x: 18, y: 1.2 + 2.4, z: -5.3, kind: 'bust', era: '历代',
    caption: '六尊胸像按年代排开，最新一座台座留空，给现任家主。', caption_en: 'Six busts stand in order of generation; the newest pedestal is empty, kept for the present head.' }),
  H({ id: 'portraits', name: '肖像廊空框', en: 'The empty frame', floor: 2, room: '301', x: 10, y: 10.2 + 3.0, z: 2.35, kind: 'portraitFrame', era: '现任', tour: 4, view: { w: 18, theta: 0.2, phi: 1.1 },
    caption: '最末一个画框是空的（金框里衬着深红丝），留给现任家主。', caption_en: 'The last frame is empty, lined with crimson silk, reserved for the present head.' }),
  H({ id: 'liftCage', name: '黄铜笼式电梯', en: 'Brass cage lift', floor: 0, room: '108', x: 14, y: 1.2 + 3.2, z: -14.5, kind: 'liftCage', era: '三代',
    caption: '（仓库自设，非卡设定）黄铜笼式电梯是第三代装的第一部以太电梯。楼层指针还是原装的机械表盘，指针停在「3」的时候会轻响一声。', caption_en: 'The first ether lift, installed by the third generation; its original dial chimes softly when the needle stops at 3.' }),
  H({ id: 'foundersDesk', name: '初代书桌', en: 'The founder\'s desk', floor: 1, room: '212', x: -30, y: 5.7 + 1.6, z: 9, kind: 'foundersDesk', era: '初代', tour: 5, view: { w: 18, theta: 0.5, phi: 1.0 },
    caption: '书桌是初代从旧宅搬来的，桌面的皮子换过四次，右手边那道墨水渍一直留着。', caption_en: 'The desk came from the founder\'s old house; its leather has been replaced four times, but the ink stain on the right has always stayed.' }),
  H({ id: 'crestChair', name: '主位家徽椅', en: 'The crested chair', floor: 0, room: '113', x: -39.8, y: 1.2 + 1.8, z: 9, ry: Math.PI / 2, kind: 'crestChair', era: '初代',
    caption: '主位椅背上雕着家徽，是唯一不配套的一把椅子，初代从旧宅带来。', caption_en: 'The master\'s chair with the carved crest, the only odd chair in the set, brought by the founder from the old house.' }),
  H({ id: 'tub', name: '整石浴缸', en: 'The monolithic tub', floor: 2, room: '316', x: -47, y: 10.2 + 1.6, z: -9, kind: 'tub', era: '三代', tour: 6, view: { w: 18, theta: 0.6, phi: 1.0 },
    caption: '浴缸是三代家主用一整块大理石雕的，石料来自已经封矿的旧采石场。', caption_en: 'The tub was carved for the third head from a single block of marble, quarried from a pit that has since closed.' }),
  H({ id: 'organ', name: '管风琴', en: 'The organ', floor: 0, room: 'D1', x: 90, y: 1.2 + 5, z: -19, kind: 'organ', era: '四代', tour: 7, view: { w: 18, theta: 0.1, phi: 1.2 },
    caption: '管风琴最低的那根音管上刻着四代家主和建造匠人的名字。', caption_en: 'The organ\'s lowest pipe is engraved with the names of the fourth head and the organ builders.' }),
  H({ id: 'armillary', name: '塔顶浑天仪', en: 'Armillary sphere', floor: null, room: null, x: -90, y: 29.2, z: 0, kind: 'armillary', era: '四代', view: { w: 40, theta: 0.4, phi: 1.2 },
    caption: '图书馆塔亭：塔顶的金色浑天仪每年转一格，一圈正好是一百年。', caption_en: 'Library pavilion: the gilt armillary on the tower turns one notch a year; a full turn takes exactly a century.' }),
  H({ id: 'lakeTemple', name: '湖心圆亭', en: 'Lake temple', floor: null, room: null, x: 15, y: 8, z: -102, kind: 'temple', era: '三代', tour: 8, view: { w: 60, theta: 0.6, phi: 1.0 },
    caption: '三代挖人工湖，建湖心圆亭，把后半部改成英式风景园。', caption_en: 'The third generation dug the lake, built the round temple on its island and turned the rear grounds into an English landscape park.' }),
  H({ id: 'boat', name: '初代木船', en: 'The founder\'s boat', floor: null, room: null, x: 62, y: 0.3, z: -93, kind: 'boat', era: '初代', view: { w: 40, theta: 0.5, phi: 1.0 },
    caption: '水榭：船屋里停着一条初代的木船，每年只在庄园纪念日下水一次。', caption_en: 'Water pavilion: the founder\'s wooden boat lies in the boathouse and is launched only once a year, on the estate\'s anniversary.' }),
];

/* ================================================================
 * 英文：EN[name] = [英文名, 英文用途, 英文传承]
 * ================================================================ */
export const EN = {};
for (const r of ROOMS) if (r.en) EN[r.name] = r.en;
Object.assign(EN, {
  '主楼梯': ['Main Stair', 'Guests and family: cantilevered stone return stair, 1F–3F, skylit'],
  '电梯': ['Lift', 'Brass cage ether lift (third generation): stops 1F–3F and 5F; 4F by key'],
  '主人通道': ['Master Passage', 'Master only: spiral stair and one-person lift, doors on 1F / 3F / 5F only'],
  '伊甸庄园 · 主楼': ['Eden Manor · Main House', 'Centre block of a five-part Palladian composition: hexastyle Corinthian portico with gilded crest, rusticated base, full entablature and blocking course, roof terrace and domed belvedere'],
  '门廊': ['Portico', 'Six giant Corinthian columns, 13.5 m (10 diameters); pediment at 1:4.5 with the gilded family crest', 'The crest appears on the pediment, the hall floor, the headboard, the silver, towel embroidery, notepaper and the ward stones.'],
  '西翼': ['West Wing', 'Three storeys, seven bays, flat roof with balustrade: dining room, study, master suite'],
  '东翼': ['East Wing', 'Three storeys, seven bays, flat roof with balustrade: drawing room, guest suites, family rooms'],
  '西柱廊': ['West Colonnade', 'Single Ionic colonnade, 5.5 m high, glazed in winter'],
  '东柱廊': ['East Colonnade', 'Single Ionic colonnade, 5.5 m high, glazed in winter'],
  '图书馆塔楼': ['Library Tower', 'Two-storey pavilion with an octagonal tower to 28 m, lead cupola and gilt armillary', 'The armillary turns one notch a year; a full turn takes exactly a century.'],
  '音乐厅亭': ['Music Pavilion', 'Single 11 m hall with a barrel roof and a north apse for the organ', 'The organ\'s lowest pipe is engraved with the names of the fourth head and the organ builders.'],
  '前庭': ['Forecourt', 'Gravel court with a three-tier fountain (7 m basin) crowned by a bronze girl holding an apple; lime walks on both sides'],
  '西花坛': ['Parterres', 'Broderie parterres, 3 × 2 compartments of box scrolls, coloured gravel and seasonal flowers'],
  '东花坛': ['East Parterre', 'Broderie parterres, 3 × 2 compartments'],
  '中轴大道': ['Grand Avenue', 'Avenue with lime rows, 16 statue pedestals and a striped lawn'],
  '停靠平台': ['Landing Platform', 'Round platform beyond the island rim: verdigris bronze rail, gilded guide ring, 6 m waiting pavilion', 'Generations of visitors have polished a ring of gold onto the pavilion\'s brass door handles.'],
  '玫瑰园': ['Rose Garden', 'Sunken round garden 50 m across: four radiating paths, iron gazebo, climbing-rose arcade'],
  '迷园': ['Hedge Maze', 'Yew maze with a sundial at the centre'],
  '后庭': ['Rear Court', 'Paved terrace, two lawns, balustrade and steps down to the lake'],
  '人工湖': ['Lake', 'Landscape lake with the round temple, the water pavilion and a white stone bridge'],
  '湖心圆亭': ['Lake Temple', 'Eight-column round temple on an islet, lead dome and gilt ball', 'The third generation dug the lake and built the temple.'],
  '水榭': ['Water Pavilion', 'Stone deck and open pavilion over the water with a boathouse below', 'The founder\'s wooden boat is launched only once a year, on the estate\'s anniversary.'],
  '围墙花园': ['Kitchen Garden', '3.5 m brick walls with espaliered fruit; 24 vegetable and flower beds'],
  '橘园': ['Orangery', 'Stone piers and tall glazing against the north wall of the kitchen garden', 'The oldest orange tree is older than the house, brought in a pot by the founder.'],
  '果园': ['Orchard', 'Apple, pear and quince in quincunx over wildflower grass'],
  '西预留草坪': ['Reserve Lawn', 'Hedged lawn with cross paths, basin and corner statues, kept for future building'],
  '东预留草坪': ['East Reserve Lawn', 'Hedged lawn with cross paths, basin and corner statues'],
  '仆役楼': ['Staff Wing', 'Service yard: main kitchen, servants\' hall, staff quarters, laundry'],
  '悬浮车库': ['Hover Garage', 'Hover-car parking and servicing (user-requested)'],
  '工坊': ['Workshop', 'Hover-vehicle and ether-engine repairs, ether tanks'],
  '悬浮载具库': ['Hover-vehicle Bay', 'The master\'s private hover vehicles'],
  '载具停靠坪': ['Vehicle Pad', 'Landing pad in front of the vehicle bay (user-requested)'],
  '后轴观景台': ['North Lookout', 'Semicircular lookout over the city below'],
  '西观景亭': ['West Lookout', 'Small round pavilion for sunsets'],
  '东观景亭': ['East Lookout', 'Small round pavilion for sunrises'],
  '结界锚碑 · 西北': ['Ward Anchor · NW', '2 × 2 × 9 m obelisk crowned with ether crystal, controlled from the ward room'],
  '结界锚碑 · 东北': ['Ward Anchor · NE', 'Obelisk crowned with ether crystal'],
  '结界锚碑 · 西南': ['Ward Anchor · SW', 'Obelisk crowned with ether crystal'],
  '结界锚碑 · 东南': ['Ward Anchor · SE', 'Obelisk crowned with ether crystal'],
});
