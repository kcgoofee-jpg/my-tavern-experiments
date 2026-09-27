// node tests/card097.test.mjs —— v0.9.7 卡原名的运行时绑定（map/card-bind.mjs）：稳定编号 + 结构定位 → 用户卡里的原名。
// 样例全是合成的中性文本，只模仿卡的结构（楼层段 → 房间标题 → 面积；层 → 结构 / 特征列表；区 → 主要设施列表），不含卡的原文。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as B from '../map/card-bind.mjs';
import { buildIndex, resolveHere } from '../map/here.mjs';
import { buildGroups } from '../map/tavern/picker.mjs';

const J = p => JSON.parse(readFileSync(new URL('../map/' + p, import.meta.url), 'utf8'));
const REG = J('data/maps.json'), W = J('data/world_markers.json'), PLAN = J('data/eden_estate_rooms.json'), SPEC = J('data/card_bind.json');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

const LAYOUT = `<设定>
庄园_空间布局:
  总体结构:
    层数: 地上三层+地下两层
  地上一层_公共区:
    大厅:
      面积: 约200平方米
      功能: 接待
    餐厅:
      面积: 约80平方米
  地上三层_住宿区:
    寝区_总述:
      位置: 三楼整层
    样例单人间:
      面积: 约15至20平方米
    样例新人间:
      面积: 约40平方米
  地下一层_练习区:
    样例大练习室:
      面积: 约80平方米
      设施:
        固定设备:
          - 甲
    样例小练习室:
      面积: 约30平方米
    体能训练室:
      面积: 约60平方米
    样例专项室:
      面积: 约25平方米
  地下二层_特别区:
    样例静室:
      面积: 约40平方米
    医疗与改造室:
      面积: 约50平方米
  室外区域:
    前庭花园:
      面积: 约200平方米
</设定>`;
const CITY = `城市:
  层级结构:
    中层_钢铁霓虹区:
      结构: 立体建筑群
      特征:
        - 一
        - 二
        - 三
        - 四
        - 五
        - 样例书店、样例茶铺、样例花坊散布于商业区
    下层_地基区:
      结构: 工厂、资源处理设施、样例泵站、样例滤水厂
      特征:
        - 无
`;
const HOLY = `城市空间结构:
  中环区_竞赛与狂欢回廊:
    结构: 商业街区
    主要设施:
      - 竞赛事务局与博彩中心：播报
      - 企业赞助基地与俱乐部：训练馆
      - 样例酒馆与样例剧场：演出
      - 工匠工坊街：装备
`;
const RULE = `变量规则:
  名册:
    样例值:
      type: number
      range: 0~100
      category:
        0-20: 一档名
        21-40: 二档名
        41-60: 三档名
        61-80: 四档名
        81-100: 五档名
`;
const TEXTS = ['无关的条目，没有结构。', CITY, LAYOUT, HOLY, RULE];

t('parseLayout：楼层段 → 带面积的房间，按卡内顺序；段标题（总述）不算房间', () => {
  const p = B.parseLayout(LAYOUT);
  assert.deepEqual(Object.keys(p), ['F1', 'F3', 'B1', 'B2']);
  assert.deepEqual(p.B1.map(r => [r.order, r.name, r.area]), [[1, '样例大练习室', 80], [2, '样例小练习室', 30], [3, '体能训练室', 60], [4, '样例专项室', 25]]);
  assert.equal(p.F3[0].name, '样例单人间'); assert.equal(p.F3[0].area, 15);
  assert.equal(B.parseLayout('没有楼层段'), null);
});

t('每间卡房间都有稳定编号；占位房间都有结构定位；旧编号 / 旧名都有去处', () => {
  const cids = PLAN.card_rooms.map(c => c.cid);
  assert.equal(new Set(cids).size, cids.length);
  for (const c of PLAN.card_rooms) { assert.match(c.cid, /^(F[1-3]|B[12]|EX)-C\d{2}$/); if (c.name === B.PLACEHOLDER) assert.ok(c.bind?.floor, c.cid); }
  for (const r of PLAN.rooms.filter(r => r.kind === 'card' || r.kind === 'restricted')) assert.ok(cids.includes(r.card_id), r.id);
  for (const v of Object.values({ ...PLAN.card_id_alias, ...PLAN.retired_names })) assert.ok(cids.includes(v), v);
  assert.equal(PLAN.card_id_alias['B1-受限A'], 'B1-C01'); assert.equal(PLAN.card_id_alias['F2-主卧'], 'F2-C01');
});

const RB = B.bindCardRooms(PLAN.card_rooms, TEXTS);
t('bindCardRooms：按「楼层 + 第 n 个 + 面积」绑定，N/N', () => {
  assert.equal(RB.want, PLAN.card_rooms.filter(c => c.bind).length); assert.equal(RB.bound, RB.want); assert.deepEqual(RB.misses, []);
  assert.deepEqual(RB.names, { 'F3-C01': '样例单人间', 'B1-C01': '样例大练习室', 'B1-C02': '样例小练习室', 'B1-C04': '样例专项室', 'B2-C01': '样例静室' });
});
t('bindCardRooms：面积对不上就不绑（宁缺毋错）；没有文本全部落空', () => {
  const r = B.bindCardRooms(PLAN.card_rooms, [LAYOUT.replace('约80平方米\n      设施', '约300平方米\n      设施')]);
  assert.ok(r.misses.includes('B1-C01')); assert.ok(!('B1-C01' in r.names)); assert.equal(r.names['B1-C02'], '样例小练习室');
  assert.equal(B.bindCardRooms(PLAN.card_rooms, []).bound, 0);
});

const BOUND = B.applyBinding(PLAN, RB.names);
t('applyBinding：房间换成原名，原来的仓库名留作识别词；原数据不变', () => {
  const r = BOUND.rooms.find(r => r.card_id === 'B1-C01'); assert.equal(r.name, '样例大练习室'); assert.equal(r.kind, 'restricted');
  const bed = BOUND.rooms.find(r => r.card_id === 'F3-C01'); assert.equal(bed.name, '样例单人间'); assert.ok(bed.words.includes('个人寝室'));
  assert.equal(PLAN.rooms.find(r => r.card_id === 'B1-C01').name, B.PLACEHOLDER);
  assert.equal(B.applyBinding(PLAN, {}), PLAN);
});
t('识别（here.mjs 第 1 级）：绑定前认不出占位房间，绑定后认得原名、带 restricted 与楼层', () => {
  const a = buildIndex(REG, W, null, null, PLAN), b = buildIndex(REG, W, null, null, BOUND);
  assert.equal(resolveHere('样例大练习室', a), null);
  const x = resolveHere('伊甸庄园·样例大练习室', b); assert.equal(x.level, 1); assert.equal(x.std, '样例大练习室'); assert.equal(x.floor, 'B1'); assert.equal(x.restricted, true);
  assert.equal(resolveHere('个人寝室', b).std, '样例单人间');
  assert.equal(resolveHere('（按原卡）', a), null);
  for (const w of ['受限房间 A', '附属室A', '受限房间', '附属室D']) assert.equal(resolveHere(w, b), null, w);   // 仓库以前自编的名字不再识别
});
t('卡的写法与通用叫法都落到卡房间（std = 卡名）', () => {
  const b = buildIndex(REG, W, null, null, PLAN);
  for (const [w, std] of [['主卧', '主人主卧'], ['User主卧', '主人主卧'], ['书房', '主人书房'], ['厨房', '厨房与后勤区'], ['新进寝区', '新进公共寝区'], ['卧室', '主人主卧'], ['浴室', '三楼公共浴室'], ['集体间', '杂鱼女仆集体间']])
    assert.equal(resolveHere(w, b)?.std, std, w);
});
t('聊天里存过的旧叫法（指向旧名 / 旧编号）：绑定后落到新房间；没绑定时不生效', () => {
  const custom = { rooms: { 老地方: '受限房间 A', 书斋: 'F2-书房' } };
  const b = buildIndex(REG, W, null, custom, BOUND);
  assert.equal(resolveHere('老地方', b).room, '样例大练习室'); assert.equal(resolveHere('书斋', b).room, '主人书房');
  assert.equal(resolveHere('老地方', buildIndex(REG, W, null, custom, PLAN)), null);
  assert.equal(B.resolveOld(BOUND, '附属室B'), '样例小练习室'); assert.equal(B.resolveOld(PLAN, '附属室B'), null);
});
t('选择器：没有「其他叫法」组；占位房间显示「（按原卡）+ 编号」、按编号落点；绑定后显示原名', () => {
  const g0 = buildGroups({ reg: REG, plan: { CARD: PLAN } }), g1 = buildGroups({ reg: REG, plan: { CARD: BOUND } });
  assert.ok(!g0.some(g => g.id === 'room:other'));
  const b1 = g0.find(g => g.id === 'room:B1').items;
  const ph = b1.find(i => i.key === '（按原卡） B1-C01'); assert.ok(ph); assert.equal(ph.target.room, 'B1-C01');
  assert.ok(g1.find(g => g.id === 'room:B1').items.some(i => i.key === '样例大练习室'));
  assert.ok(g0.flatMap(g => g.items).every(i => !/受限房间|附属室/.test(i.key)));
});

const RS = B.bindSpecs(SPEC, TEXTS);
t('bindSpecs：地标 / 分区别名、剖面标签按键路径取，N/N', () => {
  assert.equal(RS.bound, RS.want); assert.deepEqual(RS.misses, []);
  assert.deepEqual(RS.names['tc_low.amc_facility#3'], ['样例泵站']); assert.deepEqual(RS.names['tc_low.amc_facility#4'], ['样例滤水厂']);
  assert.deepEqual(RS.names['tc_mid.districts#shops'], ['样例书店', '样例茶铺', '样例花坊']);
  assert.deepEqual(RS.names['site_kavalierki.contest_corridor#3'], ['样例酒馆与样例剧场', '样例剧场']);
  assert.deepEqual(RS.names['section.B1'], ['练习区']); assert.deepEqual(RS.names['section.B2'], ['特别区']);
});
t('applyToRegistry：绑定名进地标别名 / 分区，识别落到对的地方；原数据不变', () => {
  const reg = B.applyToRegistry(REG, SPEC, RS.names), i = buildIndex(reg, W, null, null, BOUND);
  const a = resolveHere('天城下层·样例泵站', i); assert.equal(a.map, 'tc_low'); assert.equal(a.marker, 'amc_facility');
  assert.equal(resolveHere('样例花坊', i).map, 'tc_mid');
  const c = resolveHere('样例酒馆与样例剧场', i); assert.equal(c.map, 'site_kavalierki'); assert.equal(c.marker, 'contest_corridor');
  assert.ok(!(REG.maps.tc_low.markers.amc_facility.alias || []).includes('样例泵站'));
});
t('findPath：同名键出现多处时取走得通的那一处；前缀键', () => {
  const txt = '样例值: 旧说明\n别处:\n  样例值:\n    category:\n      0-50: 甲档\n      51-100: 乙档\n';
  assert.deepEqual(B.findCoreCategories([txt], '样例值'), [{ max: 50, name: '甲档' }, { max: 100, name: '乙档' }]);
  assert.equal(B.findPath(LAYOUT, ['地下二层_*']).key, '地下二层_特别区');
  assert.equal(B.findCoreCategories(TEXTS, '样例值').length, 5);
});
t('层名全称优先于庄园（canon_audit B8）', () => {
  const i = buildIndex(REG, W, null, null, PLAN);
  const r = resolveHere('上层悬浮庄园区', i); assert.equal(r.level, 4); assert.equal(r.map, 'tc_upper');
  assert.equal(resolveHere('上层悬浮庄园区·伊甸庄园·主卧', i).std, '主人主卧');
});
console.log(`${n} passed`);
