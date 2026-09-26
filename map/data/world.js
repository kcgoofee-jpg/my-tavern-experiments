// 世界图数据。每条带 src（世界书条目 + 原文摘录）和 tag：'set' = 设定原文，'inf' = 推断，'warn' = 设定矛盾
// 坐标为 1600×1000 的示意坐标，无真实比例。

export const SEED = 2088;
export const W = 1600, H = 1000;

// 陆块（椭圆）：叠加噪声后形成海岸线
export const LAND_BLOBS = [
  { x: 700, y: 480, rx: 560, ry: 330, w: 1.0 },   // 主大陆
  { x: 300, y: 520, rx: 230, ry: 250, w: 0.8 },   // 主大陆西部
  { x: 1120, y: 460, rx: 230, ry: 280, w: 0.8 },  // 主大陆东部
  { x: 1450, y: 760, rx: 150, ry: 170, w: 0.9 },  // 海外诸地
  { x: 1500, y: 300, rx: 70, ry: 90, w: 0.7 },    // 远海岛
];

// 势力种子：陆地格子按「扰动后的加权最近种子」归属，得到有机边界
// kind：oren-core / oren-prov / fed-core / fed-knight / xl / minor / overseas
export const SEEDS = [
  { id: 'oren', kind: 'oren-core', x: 720, y: 470, w: 1.35 },
  { id: 'oren-p1', kind: 'oren-prov', x: 560, y: 300, w: 1.0 },
  { id: 'oren-p2', kind: 'oren-prov', x: 870, y: 300, w: 1.0 },
  { id: 'oren-p3', kind: 'oren-prov', x: 600, y: 660, w: 1.0 },
  { id: 'oren-p4', kind: 'oren-prov', x: 860, y: 650, w: 1.0 },
  { id: 'fed', kind: 'fed-core', x: 330, y: 470, w: 1.15 },
  { id: 'fed-k1', kind: 'fed-knight', x: 220, y: 300, w: 0.95 },
  { id: 'fed-k2', kind: 'fed-knight', x: 170, y: 600, w: 0.95 },
  { id: 'fed-k3', kind: 'fed-knight', x: 380, y: 700, w: 0.9 },
  { id: 'xl', kind: 'xl', x: 1100, y: 440, w: 1.2 },
  { id: 'xl-2', kind: 'xl', x: 1030, y: 250, w: 1.0 },
  { id: 'xl-3', kind: 'xl', x: 1120, y: 640, w: 1.0 },
  // 中小国 ×12
  { id: 'm1', kind: 'minor', x: 440, y: 190, w: 0.7 },
  { id: 'm2', kind: 'minor', x: 700, y: 170, w: 0.7 },
  { id: 'm3', kind: 'minor', x: 1250, y: 250, w: 0.7 },
  { id: 'm4', kind: 'minor', x: 110, y: 420, w: 0.7 },
  { id: 'm5', kind: 'minor', x: 480, y: 810, w: 0.7 },
  { id: 'm6', kind: 'minor', x: 740, y: 810, w: 0.7 },
  { id: 'm7', kind: 'minor', x: 990, y: 800, w: 0.7 },
  { id: 'm8', kind: 'minor', x: 1270, y: 520, w: 0.7 },
  { id: 'm9', kind: 'minor', x: 1500, y: 300, w: 0.7 },
  { id: 'm10', kind: 'minor', x: 320, y: 860, w: 0.6 },
  { id: 'm11', kind: 'minor', x: 470, y: 560, w: 0.55 },
  { id: 'm12', kind: 'minor', x: 960, y: 520, w: 0.55 },
  { id: 'ov1', kind: 'overseas', x: 1420, y: 700, w: 0.9 },
  { id: 'ov2', kind: 'overseas', x: 1480, y: 840, w: 0.9 },
];

export const KIND_STYLE = {
  'oren-core': { fill: '#c89a5c', name: '奥伦帝国·本土' },
  'oren-prov': { fill: '#e0c496', name: '奥伦·外围行省与附属邦国' },
  'fed-core': { fill: '#6f98c4', name: '光辉联邦·商业联合会核心区' },
  'fed-knight': { fill: '#a9c3de', name: '光辉联邦·骑士贵族领地' },
  'xl': { fill: '#a58bc6', name: '虚灵古派' },
  'minor': { fill: '#d5d3c3', name: '中小国' },
  'overseas': { fill: '#b8cba5', name: '海外诸地' },
};

// 帝国（用于大字标注和图例）
export const REALMS = [
  { id: 'oren', kinds: ['oren-core', 'oren-prov'], name: '奥伦帝国', sub: '三大帝国之首 · 激进秩序', tag: 'set',
    src: '奥伦帝国：主导世界格局的三大帝国之首，当世最强霸主政权；国都天城；所有外围行省与附属邦国均直接对天城中枢负责' },
  { id: 'fed', kinds: ['fed-core', 'fed-knight'], name: '光辉联邦', sub: '骑士圣地 · 保守秩序', tag: 'set',
    src: '光辉联邦：原本是古老骑士文化的起源圣地；商业联合会掌控经济命脉与行政中枢；传统骑士阶层只能退守领地' },
  { id: 'xl', kinds: ['xl'], name: '虚灵古派', sub: '神权至上 · 泛神信仰', tag: 'set',
    src: '虚灵古派：主导世界格局的三大帝国之一；国都原域；神权至上、泛神信仰（世界观条目中的「灵枢秘派」按用户决定统一为虚灵古派）' },
];

// 据点与标注
export const PLACES = [
  { id: 'tiancheng', type: 'capital', x: 720, y: 470, name: '天城', sub: '奥伦国都 · 约3200万', tag: 'set',
    src: '天城：奥伦帝国国都，母畜制度发源地，全球政治与经济中枢之一；人口约3200万；以太气候调节塔人工维持气候' },
  { id: 'kavalierki', type: 'capital', x: 330, y: 470, name: '大骑士领·圣都', sub: 'Kavalierki · 联邦首都 · 约2800万', tag: 'set',
    src: '大骑士领·圣都：光辉联邦首都，全球骑士竞赛与商业体育博彩中枢；温带阔叶林气候，巨型以太穹顶调节赛场及核心商业区天气' },
  { id: 'yuanyu', type: 'capital', x: 1100, y: 440, name: '原域', sub: '虚灵古派国都 · 诸神殿（悬浮圣山）', tag: 'set',
    src: '诸神殿：坐落于国都原域核心的悬浮圣山之上；全城哥特式尖塔、巴洛克穹顶，常年笼罩以太薄雾' },
  { id: 'highland', type: 'start', name: '旷野高地', sub: '开局地点', tag: 'inf', autoHighest: 'oren',
    src: '开场白 JSONPatch：当前地点 = 旷野高地（位置设定未给，取奥伦境内最高处）' },
];

// 圆桌骑士五封地：放在联邦境内（位置推断）
export const FIEFS = [
  { x: 290, y: 330 }, { x: 150, y: 520 }, { x: 260, y: 610 }, { x: 400, y: 720 }, { x: 420, y: 330 },
].map((p, i) => ({ ...p, name: `圆桌第${'一二三四五'[i]}席封地`, tag: 'inf',
  src: '光辉联邦：圆桌骑士现存五席……享有独立封地与专属骑士团调动权（封地位置设定未给）' }));

// 跨城高速运输管道：三首都之间
export const TUBES = [
  { a: 'tiancheng', b: 'kavalierki', tag: 'inf', src: '魔法与科技·交通：跨城高速运输管道（走向设定未给）' },
  { a: 'tiancheng', b: 'yuanyu', tag: 'inf', src: '同上' },
];

// 海外输入航线（终点为奥伦南部海岸 → 管道至天城）
export const SEA_ROUTES = [
  { pts: [[1420, 700], [1260, 760], [1050, 820], [900, 780], [800, 715]], tag: 'inf',
    src: '货币与贸易：天城输入稀有矿物（魔导芯片原料）、异域人员（部分来自海外）' },
];

// 赤潮：全球分据点，联邦境内更密；总部未知
export const RED_TIDE = { count: 70, fedBoost: 2.6, tag: 'set',
  src: '赤潮：在全球拥有多如牛毛的分据点，真正的总部位置是世界最高级别的机密；在联邦境内灰色地带拥有极高活动自由度' };

// 虚灵古派：教会林立
export const CHURCHES = { count: 9, tag: 'set',
  src: '虚灵古派：国内教会林立，各自信奉不同的古老神明，所有教会必须在诸神殿注册' };

// 天城纵剖面（高度单位 m）
export const SECTION = {
  range: [-200, 1500],
  bands: [
    { from: 800, to: 1500, name: '上层 · 悬浮庄园区', fill: '#dbe9f6', tag: 'set',
      src: '天城·上层：地面以上800米至1500米，数十座独立悬浮岛屿；总人口不超过两千，占有城市70%以上资源' },
    { from: 50, to: 800, name: '中层 · 钢铁霓虹区', fill: '#3b3552', tag: 'set',
      src: '天城·中层：地面以上50米至800米，层层叠叠的立体建筑群，由悬浮轨道系统串联；日照被遮挡，依赖人造光源' },
    { from: -200, to: 50, name: '下层 · 地基区', fill: '#2a2622', tag: 'set',
      src: '天城·下层：地面及地下（最深约200米）；工厂、资源处理设施、资产管理委员会设施；几乎无自然光' },
  ],
  lines: [
    { at: 800, name: '上/中层管控：身份验证 + 通行许可', tag: 'set', src: '天城·交通：上层与中层之间有严格的通行管控' },
    { at: 50, name: '中/下层检查点', tag: 'set', src: '天城·交通：中层与下层之间管控较松，但有治安检查点' },
  ],
  items: [
    { at: 1180, x: 0.62, name: '伊甸庄园', kind: 'eden', tag: 'set', src: '庄园布局：天城上层悬浮区，独占一座悬浮岛屿' },
    { at: 800, x: 0.30, name: '银冠堡（议会骑士团总部）', kind: 'fort', tag: 'set', src: '军事与治安：总部位于上层与中层交界的悬浮要塞「银冠堡」' },
    { at: 700, x: 0.55, name: '议会 / 执政厅 / 储备署', kind: 'gov', tag: 'inf', src: '设定未给位置，推断放在中层核心最高处' },
    { at: 620, x: 0.20, name: '辉光大教堂', kind: 'poi', tag: 'set', src: '圣光教会：总部位于中层高区「辉光大教堂」' },
    { at: 560, x: 0.80, name: '圣铁摇篮（战斗修女修道院）', kind: 'poi', tag: 'set', src: '圣光教会/军事与治安：修道院位于中层高区独立院落，代号「圣铁摇篮」' },
    { at: 420, x: 0.45, name: '执法局总局', kind: 'poi', tag: 'set', src: '军事与治安：总局位于中层核心区；分局按中层纵向高度划分为十八个辖区' },
    { at: 260, x: 0.90, name: '防卫军环城军营带', kind: 'poi', tag: 'set', src: '军事与治安：驻地为中层外围环城军营带' },
    { at: 110, x: 0.30, name: '旧公寓楼（开局地点）', kind: 'start', tag: 'inf', src: '开场白：当前地点 = 中层-钢铁霓虹区-旧公寓楼-房间（具体高度推断为中层低区）' },
    { at: -40, x: 0.25, name: '工厂 / 资源处理', kind: 'poi', tag: 'set', src: '天城·下层：工厂、资源处理设施' },
    { at: -90, x: 0.62, name: '资产管理委员会设施', kind: 'poi', tag: 'set', src: '天城·下层：由资产管理委员会运营的设施' },
    { at: -150, x: 0.40, name: '黑市 / 帮派区', kind: 'poi', tag: 'set', src: '军事与治安：下层活跃着数十个大小帮派，控制黑市' },
    { at: -20, x: 0.88, name: '防卫军前沿哨所', kind: 'poi', tag: 'set', src: '军事与治安：下层设有数个前沿哨所' },
  ],
  towers: { tag: 'inf', src: '天城：由以太气候调节塔人工维持气候（数量与位置未给）' },
  districts: { count: 18, tag: 'set', src: '执法局分局按中层纵向高度划分为十八个辖区' },
};
