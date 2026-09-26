// node tests/here.test.mjs —— 当前地点 → 落点（map/here.mjs）六级单测，用仓库里真实的 maps.json / world_markers.json / en.json
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveHere } from '../map/here.mjs';

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
  const reg = J('data/maps.json');
  reg.maps.tc_upper.markers.zaibatsu = { name: '财团家族庄园', tag: 'inf', src: '测试', alias: ['财团家族庄园'] };
  const r = resolveHere('财团家族庄园的书房', buildIndex(reg));
  assert.equal(r.level, 3); assert.equal(r.marker, 'zaibatsu');
});
console.log(`\n${n} passed`);
