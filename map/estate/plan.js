// 伊甸庄园 · 平面数据（与 docs/eden-estate.md 同步）
// 坐标：x 东西（主立面宽度方向），z 南北（+z = 正面，朝停靠平台），y 向上；1 单位 = 1 m；主楼中心在原点。
// src：世界书 = maps.json 的 eden src / alias；ROADMAP = 路线图规划；推断 = 本示例自行假定

export const CUT = 1.2;            // 剖切高度
export const HOUSE = { x0: -38, x1: 38, z0: -13, z1: 13, t: 0.9 };   // 主楼外墙中线
export const FLOORS = [
  { id: 'F1', label: '1F', name: '门厅层', y: 1.2, h: 6.0 },
  { id: 'F2', label: '2F', name: '日常层', y: 7.2, h: 4.5 },
  { id: 'F3', label: '3F', name: '私人层', y: 11.7, h: 4.5 },
  { id: 'F4', label: '4F', name: '服务层', y: 17.6, h: 4.0 },     // 主檐口 16.2–17.6 之上的阁楼层
  { id: 'F5', label: '5F', name: '眺望层', y: 21.6, h: 5.4 },     // 屋顶露台 + 穹顶灯亭
];
export const ENTAB = [16.2, 17.6];  // 主檐部

// 房间：r = [x0, x1, z0, z1]；floor = 0..4；floorMat 地面；use 用途；src 出处
export const ROOMS = [
  // 1F
  { name: '大厅', floor: 0, r: [-14, 14, -3, 13], mat: 'marble', alias: ['大厅', '门厅', '玄关'], use: '入口门厅，挑高 6 m，内设两列立柱；接待访客，墙上张贴庄园告示', src: '世界书', note: 'alias「大厅」；告示样例提到大厅墙上' },
  { name: '楼梯厅', floor: 0, r: [-14, 14, -13, -3], mat: 'marble', alias: ['楼梯', '楼梯厅'], use: '主楼梯、电梯井与主人通道所在的交通核', src: '推断' },
  { name: '会客厅', floor: 0, r: [-38, -14, -13, 13], mat: 'parquet', alias: ['会客厅', '客厅', '沙龙'], use: '社交与接待：壁炉沙发组、窗边小座、三角钢琴', src: '世界书', note: 'alias「会客厅」' },
  { name: '餐厅', floor: 0, r: [14, 38, -4, 13], mat: 'parquet', alias: ['餐厅', '饭厅'], use: '正式宴会：14 人长餐桌、餐边柜、壁炉', src: '世界书', note: 'alias「餐厅」' },
  { name: '备餐间', floor: 0, r: [14, 26, -13, -4], mat: 'tile', alias: ['备餐间', '厨房'], use: '上菜前的备餐与餐具存放，连接餐厅', src: '推断' },
  { name: '仆从值班室', floor: 0, r: [26, 38, -13, -4], mat: 'parquet', alias: ['值班室', '仆从值班室'], use: '值班、呼叫铃板、储物柜', src: '推断', note: '据女仆长排班样例需要一个值班位置' },
  // 2F
  { name: '起居 / 茶室', floor: 1, r: [-14, 14, -3, 13], mat: 'parquet', alias: ['茶室', '起居室', '起居'], use: '日间起居与下午茶：三组茶桌、沙发、茶具柜', src: '推断' },
  { name: '楼梯厅', floor: 1, r: [-14, 14, -13, -3], mat: 'marble', alias: [], use: '交通核', src: '推断', minor: true },
  { name: '客房 A', floor: 1, r: [-38, -14, 0, 13], mat: 'parquet', rug: 'rugSage', alias: ['客房', '客房A', '客房 A'], use: '访客留宿：双人床、床头柜、衣柜、梳妆台、休息椅', src: '世界书', note: 'alias「客房」' },
  { name: '客房 B', floor: 1, r: [-38, -14, -13, 0], mat: 'parquet', rug: 'rugRose', alias: ['客房B', '客房 B'], use: '访客留宿（布局与客房 A 镜像）', src: '世界书', note: 'alias「客房」' },
  { name: '书房', floor: 1, r: [14, 38, -13, 13], mat: 'parquet', alias: ['书房', '图书室'], use: '书架墙、大书桌、阅读长桌、扶手椅、地球仪、壁炉', src: '世界书', note: 'alias「书房」' },
  // 3F
  { name: '廊厅', floor: 2, r: [-14, 14, -3, 13], mat: 'marble', alias: ['廊厅'], use: '私人层的起居过厅，连接主卧与各房间', src: '推断' },
  { name: '楼梯厅', floor: 2, r: [-14, 14, -13, -3], mat: 'marble', alias: [], use: '交通核；主人通道在此层开门', src: '推断', minor: true },
  { name: '主卧', floor: 2, r: [-38, -14, -4, 13], mat: 'parquet', alias: ['主卧', '寝', '寝室', '卧室', '主卧室'], use: '主人卧室：四柱床、壁炉座椅、梳妆台、窗边小座', src: '世界书', note: 'alias「主卧」「寝」' },
  { name: '更衣室', floor: 2, r: [-38, -26, -13, -4], mat: 'parquet', alias: ['更衣室', '衣帽间'], use: '主卧套间的更衣与衣物收纳', src: '推断' },
  { name: '浴室', floor: 2, r: [-26, -14, -13, -4], mat: 'marbleC', alias: ['浴室', '浴池', '盥洗室'], use: '主卧套间浴室：独立浴缸、双洗手台', src: '世界书', note: 'alias「浴室」' },
  { name: '私人房间 A', floor: 2, r: [14, 38, 0, 13], mat: 'parquet', rug: 'rugNavy', alias: ['私人房间', '私人房间A'], use: '中性化处理的私人房间：床、衣柜、沙发、书桌', src: '推断', note: '用途未设定，中性化' },
  { name: '小客厅', floor: 2, r: [14, 38, -13, 0], mat: 'parquet', alias: ['小客厅'], use: '主人层的小会客与阅读角', src: '推断' },
  // 4F
  { name: '仆役厅', floor: 3, r: [-14, 14, -3, 13], mat: 'parquet', alias: ['仆役厅', '员工餐厅'], use: '仆从用餐与交接班', src: '推断' },
  { name: '楼梯厅', floor: 3, r: [-14, 14, -13, -3], mat: 'parquet', alias: [], use: '交通核', src: '推断', minor: true },
  { name: '女仆长办公室', floor: 3, r: [-38, -14, 0, 13], mat: 'parquet', rug: 'rugBurg', alias: ['女仆长办公室', '办公室'], use: '排班、账目、来访登记：书桌、档案柜、会客椅', src: '推断', note: '据排表样例「女仆长」职务' },
  { name: '附属用房', floor: 3, r: [-38, -14, -13, 0], mat: 'parquet', alias: ['附属用房'], use: '中性化处理：床、衣柜、书桌', src: '推断', note: '用途未设定，中性化' },
  { name: '洗衣 / 储藏', floor: 3, r: [14, 38, 0, 13], mat: 'tile', alias: ['洗衣房', '储藏室', '洗衣', '储藏'], use: '布草架、折叠台、洗衣槽、收纳筐', src: '推断' },
  { name: '监控室', floor: 3, r: [14, 38, -13, 0], mat: 'parquet', alias: ['监控室', '监控', '安保室'], use: '全庄园监控：弧形控制台与屏幕墙、机柜', src: 'ROADMAP', note: '监控叠加层对应的实体房间，位置推断' },
  // 5F
  { name: '观景露台', floor: 4, r: [-38, 38, -13, 13], mat: 'pavers', alias: ['露台', '观景露台', '屋顶'], use: '屋顶露台：遮阳伞、躺椅、橘树箱与盆栽，四面石栏杆', src: '推断', skipFloor: true, lp: [24, 8] },
  { name: '私人电梯厅', floor: 4, r: [-10, 10, -13, 1], mat: 'marbleC', alias: ['电梯厅', '私人电梯厅', '穹顶'], use: '穹顶灯亭内的到达厅：主人通道顶端出口、主楼梯与电梯的终点', src: '推断', note: '主人通道顶端出口（ROADMAP 构想）' },
];

// 竖井：x0,x1,z0,z1
export const SHAFTS = [
  { name: '主楼梯', r: [-5, 5, -12.5, -4], color: '#C98A40', src: '推断', use: '公共楼梯，贯穿 1F–5F' },
  { name: '电梯', r: [6, 9, -12.5, -9.5], color: '#4C8C99', src: '推断', use: '客用电梯，贯穿 1F–5F' },
  { name: '主人通道', r: [-9, -6, -12.5, -9.5], color: '#7A5FA0', src: 'ROADMAP', use: '私密竖井：只在 1F / 3F / 5F 开门，经过 2F / 4F 不停', note: '走线推断' },
];

// 室外区域（外观模式）
export const AREAS = [
  { name: '伊甸庄园 · 主楼', alias: ['伊甸庄园', '伊甸', '庄园', '主楼'], x: 0, z: 0, w: 76, d: 26, y: 24, use: '新古典主义白色石材府邸：六柱门廊与三角山花、主檐口、屋顶栏杆与穹顶灯亭；五层（含阁楼与屋顶层）', src: '世界书', note: 'src「新古典主义白色石材建筑」', pri: 10 },
  { name: '前庭', alias: ['前庭', '喷泉', '前院'], x: 0, z: 88, r: 30, y: 7, use: '荣誉庭院与三层盆喷泉广场，车道环绕', src: '世界书', note: 'src「前庭喷泉」', pri: 9 },
  { name: '后庭', alias: ['后庭', '人工湖', '湖', '后院'], x: 0, z: -120, w: 208, d: 130, ell: true, y: 2, use: '人工湖、环湖步道、湖畔水榭', src: '世界书', note: 'src「后庭人工湖」', pri: 9 },
  { name: '停靠平台', alias: ['停靠平台', '停机坪', '码头', '平台'], x: 0, z: 268, w: 48, d: 50, y: 3, use: '伸出岛缘的访客停靠平台：栏杆、引导灯、金色停靠圈', src: '世界书', note: 'src「访客停靠平台」', pri: 9 },
  { name: '花园', alias: ['花园', '庭园', '花坛'], x: 0, z: 172, w: 150, d: 90, y: 2, use: '法式刺绣花坛（broderie）、中轴林荫道、雕像与灯柱；岛面其余部分为树丛与草坪', src: '世界书', note: '布局细节推断', pri: 8 },
  { name: '水榭', alias: ['水榭', '凉亭'], x: 0, z: -176, r: 7, y: 10, use: '湖北岸的圆形柱亭（monopteros）', src: '推断', pri: 6 },
  { name: '树篱迷宫', alias: ['迷宫', '树篱迷宫'], x: -200, z: 70, w: 96, d: 96, y: 3, use: '2.4 m 高紫杉树篱，中心小喷泉', src: '推断', pri: 5 },
  { name: '玫瑰园', alias: ['玫瑰园'], x: -200, z: -100, r: 42, y: 3, use: '同心圆玫瑰花床、拱架回廊、中心凉亭', src: '推断', pri: 5 },
  { name: '温室', alias: ['温室', '橘园'], x: 200, z: -90, w: 70, d: 16, y: 10, use: '玻璃橘园（orangery），冬季存放盆栽柑橘', src: '推断', pri: 5 },
  { name: '菜园', alias: ['菜园', '厨房花园'], x: 200, z: 70, w: 90, d: 80, y: 2, use: '围墙菜园与切花园，供应厨房', src: '推断', pri: 4 },
  { name: '机库 / 马车房', alias: ['机库', '马车房', '车库'], x: 70, z: 2, w: 24, d: 28, y: 16, use: '东翼：飞行载具与马车停放，三樘拱门朝前庭', src: '推断', pri: 6 },
  { name: '仆役楼', alias: ['仆役楼', '仆人楼'], x: -70, z: 2, w: 24, d: 28, y: 16, use: '西翼：仆从宿舍与后勤', src: '推断', pri: 6 },
];

export const ISLAND = { rx: 335, rz: 250 };

// 英文名与用途（?lang=en / estate:lang）
export const EN = {
  '大厅': ['Grand Hall', 'Entrance hall, 6 m high with two rows of columns; receives visitors, estate notices hang here'],
  '楼梯厅': ['Stair Hall', 'Circulation core: main stair, lift and the master passage'],
  '会客厅': ['Drawing Room', 'Receiving guests: fireside sofas, window seating, grand piano'],
  '餐厅': ['Dining Room', 'Formal dining: 14-seat table, sideboards, fireplace'],
  '备餐间': ['Servery', 'Plating and tableware storage next to the dining room'],
  '仆从值班室': ['Staff Duty Room', 'On-call desk, bell board, lockers'],
  '起居 / 茶室': ['Morning Room / Tea Room', 'Daytime sitting and afternoon tea: tea tables, sofas, china cabinets'],
  '客房 A': ['Guest Room A', 'Guest bedroom: double bed, nightstands, wardrobe, dressing table, armchairs'],
  '客房 B': ['Guest Room B', 'Guest bedroom (mirror of Guest Room A)'],
  '书房': ['Library', 'Book-lined walls, partners desk, reading table, armchairs, globe, fireplace'],
  '廊厅': ['Gallery Hall', 'Sitting hall of the private floor, linking the master suite and other rooms'],
  '主卧': ['Master Bedroom', 'Four-poster bed, fireside chairs, dressing table, window seat'],
  '更衣室': ['Dressing Room', 'Wardrobes and dressing island of the master suite'],
  '浴室': ['Bathroom', 'Master bath: freestanding tub, double vanity'],
  '私人房间 A': ['Private Room A', 'Neutral private room: bed, wardrobe, sofa, desk'],
  '小客厅': ['Small Parlour', 'Small sitting and reading room on the private floor'],
  '仆役厅': ['Servants\' Hall', 'Staff dining and shift handover'],
  '女仆长办公室': ['Head Maid\'s Office', 'Rosters, accounts, visitor log: desk, files, visitor chairs'],
  '附属用房': ['Ancillary Room', 'Neutral room: bed, wardrobe, desk'],
  '洗衣 / 储藏': ['Laundry / Store', 'Linen racks, folding tables, wash tubs, baskets'],
  '监控室': ['Security Room', 'Estate monitoring: curved console, screen wall, server racks'],
  '观景露台': ['Roof Terrace', 'Parasols, loungers, orange-tree boxes, stone balustrade all round'],
  '私人电梯厅': ['Private Lift Hall', 'Arrival hall inside the domed belvedere: top of the master passage, stair and lift'],
  '主楼梯': ['Main Stair', 'Public stair through 1F–5F'],
  '电梯': ['Lift', 'Guest lift through 1F–5F'],
  '主人通道': ['Master Passage', 'Private shaft: doors on 1F / 3F / 5F only'],
  '伊甸庄园 · 主楼': ['Eden Manor · Main House', 'Neoclassical white-stone mansion: hexastyle portico and pediment, main cornice, roof balustrade and domed belvedere; five floors incl. attic and roof'],
  '前庭': ['Forecourt', 'Cour d\'honneur and three-tier fountain plaza with carriage drive'],
  '后庭': ['Rear Court', 'Artificial lake, lakeside walk, water pavilion'],
  '停靠平台': ['Landing Platform', 'Visitor landing deck projecting beyond the island rim: balustrades, guide lights, gilded landing ring'],
  '花园': ['Gardens', 'Broderie parterres, central avenue, statues and lamps; groves and lawns elsewhere'],
  '水榭': ['Water Pavilion', 'Round colonnaded pavilion (monopteros) on the north shore'],
  '树篱迷宫': ['Hedge Maze', '2.4 m yew hedges, small fountain at the centre'],
  '玫瑰园': ['Rose Garden', 'Concentric rose beds, arched pergola ring, central gazebo'],
  '温室': ['Orangery', 'Glass orangery; potted citrus overwinter here'],
  '菜园': ['Kitchen Garden', 'Walled vegetable and cutting garden for the kitchen'],
  '机库 / 马车房': ['Hangar / Carriage House', 'East wing: flying craft and carriages, three arched doors to the forecourt'],
  '仆役楼': ['Staff Wing', 'West wing: staff quarters and back-of-house'],
};
export const FLOOR_EN = ['Entrance', 'Daily', 'Private', 'Service', 'Lookout'];
export const SRC_EN = { '世界书': 'Worldbook', 'ROADMAP': 'Roadmap', '推断': 'Inferred' };
