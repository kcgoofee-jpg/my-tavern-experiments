// node tests/here.test.mjs —— 当前地点 → 落点（map/here.mjs）六级单测，用仓库里真实的 maps.json / world_markers.json / en.json
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveHere, customKey, readCustom, setRoomAlias, removeRoomAlias } from '../map/here.mjs';

const J = p => JSON.parse(readFileSync(new URL('../map/' + p, import.meta.url), 'utf8'));
const idx = buildIndex(J('data/maps.json'), J('data/world_markers.json'), J('i18n/en.json').names);
const R = v => resolveHere(v, idx);
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const is = (v, level, map, extra = {}) => { const r = R(v); assert.ok(r, `${v} 应能解析`); assert.equal(r.level, level, `${v} 级别`); assert.equal(r.map, map, `${v} 地图`);
  for (const [k, x] of Object.entries(extra)) assert.equal(r[k], x, `${v}.${k}`); return r; };

t('1 庄园房间 → eden_estate（中英、带前缀、{{user}}）', () => {
  is('主卧', 1, 'eden_estate', { word: '主卧' });
  is('伊甸庄园·主卧', 1, 'eden_estate', { room: '伊甸庄园·主卧' });
  is('{{user}}的书房', 1, 'eden_estate', { word: '书房' });
  is('天城上层 伊甸庄园 3F 主卧室', 1, 'eden_estate', { word: '主卧室' });
  is('女仆长办公室', 1, 'eden_estate');
  is('Eden Manor · Master Bedroom', 1, 'eden_estate', { word: 'Master Bedroom' });
  is('the library', 1, 'eden_estate');
});
t('2 庄园室外区域或只写庄园 → eden_estate 外观', () => {
  is('玫瑰园', 2, 'eden_estate', { word: '玫瑰园' });
  is('伊甸庄园 后庭人工湖边', 2, 'eden_estate', { word: '人工湖' });
  is('停靠平台', 2, 'eden_estate');
  is('伊甸庄园', 2, 'eden_estate', { word: '伊甸庄园' });
  is('庄园', 2, 'eden_estate');
  is('Eden Manor', 2, 'eden_estate');
  is('Rose Garden', 2, 'eden_estate');
  is('厨房花园', 2, 'eden_estate', { word: '厨房花园' });   // 区域名里含房间名（厨房）：取更长的区域
  is('伊甸庄园后庭浴室', 1, 'eden_estate');                  // 房间与区域都有：偏向房间
});
t('3 天城地标 → 所在层 + 标记（中英）', () => {
  is('天城执法局总局', 3, 'tc_mid', { marker: 'enforcement_hq' });
  is('地基区 7 号井', 3, 'tc_low', { marker: 'well7' });
  is('中层 C区检查点', 3, 'tc_mid', { marker: 'checkpoint_c' });
  is('天城议会', 3, 'tc_mid', { marker: 'council' });
  is('银冠堡', 3, 'tc_upper', { marker: 'silver_crown' });
  is('Well 7 Black Market', 3, 'tc_low', { marker: 'well7' });
  is('血肉磨坊 后巷', 3, 'tc_low', { marker: 'blood_mill' });
});
t('4 只有层名或大区 → 该层默认视野', () => {
  is('天城上层', 4, 'tc_upper', { marker: undefined });
  is('中层', 4, 'tc_mid');
  is('地基区', 4, 'tc_low');
  is('商业区的一家咖啡馆', 4, 'tc_mid', { word: '商业区' });
  is('Middle Tier', 4, 'tc_mid');
  is('中层 霓虹街 公寓客厅', 4, 'tc_mid');   // 写了别的层：「客厅」不算庄园
});
t('5 只有「天城」→ 上层；世界地名 → 世界图', () => {
  is('天城', 5, 'tc_upper', { place: undefined });
  is('Tiancheng', 5, 'tc_upper');
  is('旷野高地', 5, 'world', { place: '旷野高地' });
  is('大骑士领·圣都', 5, 'world', { place: '大骑士领·圣都' });
  is('圆桌第三席封地', 5, 'world');
  is('奥伦帝国边境', 5, 'world', { place: '奥伦帝国' });
});
t('6 匹配不到 → null', () => {
  assert.equal(R('某个房间'), null); assert.equal(R(''), null); assert.equal(R(null), null); assert.equal(R('{{user}}'), null);
  assert.equal(resolveHere('主卧', null), null);
});
t('优先级：更长的别处地标压过「庄园」二字', () => {
  const r = R('财团家族庄园的书房');
  assert.equal(r.level, 3); assert.equal(r.marker, 'zaibatsu_estate');
  is('首相府', 3, 'tc_upper', { marker: 'pm_residence' });
});
t('自定义房间叫法（本机）：落到对应的标准房间', () => {
  const ci = buildIndex(J('data/maps.json'), J('data/world_markers.json'), J('i18n/en.json').names, { rooms: { '我的秘密书斋': '书房', '坏名': '不存在的房间' } });
  const r = resolveHere('我的秘密书斋', ci);
  assert.equal(r.level, 1); assert.equal(r.room, '书房'); assert.equal(r.custom, true);
  assert.equal(resolveHere('坏名', ci), null);   // 指向不存在房间的自定义名不生效
  assert.equal(R('我的秘密书斋'), null);          // 不传自定义表时照旧
});
t('自定义叫法的本机存储：按聊天分开，没有聊天 id 用全局（E6）', () => {
  const mem = new Map(), store = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  assert.equal(customKey('c1'), 'edenMap:chat:c1:custom'); assert.equal(customKey(''), 'edenMap:custom'); assert.equal(customKey(null), 'edenMap:custom');
  const std = idx.estate.std;
  assert.ok(std.includes('书房') && !std.includes('我的秘密书斋'));
  assert.equal(setRoomAlias(store, 'c1', '  我的秘密书斋 ', '书房', std), true);
  assert.equal(setRoomAlias(store, 'c1', '坏名', '不存在的房间', std), false);   // 只能指向标准房间
  assert.equal(setRoomAlias(store, 'c1', '书房', '主卧', std), false);            // 标准房间名不能改指别处
  assert.equal(setRoomAlias(store, 'c1', '', '书房', std), false);
  assert.equal(setRoomAlias(store, '', '小窝', '主卧', std), true);               // 没有聊天 id：全局
  assert.deepEqual(readCustom(store, 'c1'), { rooms: { 我的秘密书斋: '书房' } });
  assert.deepEqual(readCustom(store, ''), { rooms: { 小窝: '主卧' } });
  assert.deepEqual(readCustom(store, 'c2'), { rooms: {} });                          // 别的聊天看不到
  assert.ok(![...mem.keys()].some(k => k.includes('?') || k.includes('http')));
  // 存储 → 词表 → 落点
  const ci = buildIndex(J('data/maps.json'), J('data/world_markers.json'), J('i18n/en.json').names, readCustom(store, 'c1'));
  const r = resolveHere('我的秘密书斋', ci); assert.equal(r.level, 1); assert.equal(r.room, '书房'); assert.equal(r.custom, true);
  assert.equal(resolveHere('小窝', ci), null);
  // 删除；删到空就把键也删掉
  assert.equal(removeRoomAlias(store, 'c1', '我的秘密书斋'), true); assert.equal(removeRoomAlias(store, 'c1', '我的秘密书斋'), false);
  assert.equal(mem.has('edenMap:chat:c1:custom'), false);
  // 坏数据不抛错
  mem.set('edenMap:chat:c3:custom', '{坏'); assert.deepEqual(readCustom(store, 'c3'), { rooms: {} });
  mem.set('edenMap:chat:c4:custom', JSON.stringify({ rooms: { a: 1, b: '主卧' } })); assert.deepEqual(readCustom(store, 'c4'), { rooms: { b: '主卧' } });
  // 不知道标准房间列表（地图还没开）：先存，落点时无效的照样被忽略
  assert.equal(setRoomAlias(store, 'c5', '某处', '不存在的房间', null), true);
  assert.equal(resolveHere('某处', buildIndex(J('data/maps.json'), null, null, readCustom(store, 'c5'))), null);
});
t('开局地点（v0.9.2）：卡里开场白写的当前地点都能落点', () => {
  is('{{user}}书房', 1, 'eden_estate', { word: '书房' });                                   // 开局二～五
  is('中层-钢铁霓虹区-旧公寓楼-房间', 3, 'tc_mid', { marker: 'old_apartment' });           // 开局六
  is('天城-中层高区-辉光大教堂', 3, 'tc_mid', { marker: 'radiance_cathedral' });           // 开局八
  is('旷野高地', 5, 'world', { place: '旷野高地' });                                        // 开局七
  is('天城边缘的废弃教堂区', 3, 'tc_low', { marker: 'ruined_churches' });                  // 开局四（目的地；不被「教堂」带去辉光大教堂）
  is('首相府', 3, 'tc_upper', { marker: 'pm_residence' });                                 // 开局五（目的地）
});
t('v0.9.3：地标的自定义显示名也能落点', () => {
  const ix = buildIndex(J('data/maps.json'), null, null, { rooms: {}, marks: { 蓝塔: '天城执法局总局' } });
  const r = resolveHere('天城·中层·蓝塔', ix); assert.equal(r.map, 'tc_mid'); assert.equal(r.marker, 'enforcement_hq');
});
t('设定对齐（card-digest §10）：开局与标记', () => {
  const reg = J('data/maps.json'), up = reg.maps.tc_upper.markers, mid = reg.maps.tc_mid.markers;
  assert.deepEqual(up.pm_residence.openings, [5]); assert.equal(up.pm_residence.opening_dest, true);   // 首相府属于开局五
  assert.equal(mid.starabyss_univ.openings, undefined); assert.equal(mid.starabyss_univ.opening_dest, undefined);   // 开局二没有目的地
  assert.equal(up.archbishop_palace, undefined);                                                   // 上层没有教区
  assert.equal(reg.maps.tc_mid.layer.alt, '50–800 m'); assert.equal(reg.maps.tc_low.layer.alt, '地面至 −200 m');
});
t('设定对齐：大主教 → 辉光大教堂（中层）', () => {
  is('大主教府邸', 3, 'tc_mid', { marker: 'radiance_cathedral' }); is('天城主教座堂', 3, 'tc_mid', { marker: 'radiance_cathedral' }); is('主教座堂', 3, 'tc_mid', { marker: 'radiance_cathedral' }); is('大主教的书房', 3, 'tc_mid', { marker: 'radiance_cathedral' });
});
t('设定对齐：泛称不自动落地标', () => {
  assert.equal(R('天城大学'), null); assert.equal(R('天城大学法学院'), null); assert.equal(R('大学'), null);   // 天城大学 ≠ 星渊大学
  is('星渊大学', 3, 'tc_mid', { marker: 'starabyss_univ' }); is('天城第一学府', 3, 'tc_mid', { marker: 'starabyss_univ' });
  is('中层 第三分局', 4, 'tc_mid'); assert.equal(R('执法局分局'), null);                                   // 中层有 18 个分局
  is('下层分局', 3, 'tc_low', { marker: 'enforcement_low' }); is('执法局下层分局', 3, 'tc_low', { marker: 'enforcement_low' });
  is('中层 某修道院', 4, 'tc_mid'); assert.equal(R('修道院'), null); is('战斗修女院', 3, 'tc_mid', { marker: 'iron_cradle' });
  assert.equal(R('资产管理委员会'), null); is('公共收容设施', 3, 'tc_low', { marker: 'amc_facility' });
  assert.equal(R('骑士团巡逻据点'), null); assert.equal(R('议会骑士团'), null); is('银冠堡', 3, 'tc_upper', { marker: 'silver_crown' });
  assert.equal(R('凯莉的宅邸'), null);                                                                  // 开局三目的地，卡未写位置
});
t('设定对齐：罗斯柴尔德庄园 · 悬浮岛 R-02；MVU 默认值「User主卧」', () => {
  for (const v of ['罗斯柴尔德庄园', '悬浮岛 R-02', '悬浮岛R-02']) is(v, 3, 'tc_upper', { marker: 'zaibatsu_estate' });
  is('User主卧', 1, 'eden_estate', { word: '主卧' });
  is('伊甸庄园·悬浮车库', 2, 'eden_estate', { word: '悬浮车库' }); is('伊甸庄园·载具停靠坪', 2, 'eden_estate', { word: '载具停靠坪' });
});

console.log(`\n${n} passed`);
