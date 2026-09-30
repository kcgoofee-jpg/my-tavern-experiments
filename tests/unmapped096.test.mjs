// node tests/unmapped096.test.mjs —— v0.9.6（经 app/here-v2.mjs）：未上图（unmappedName）、地标 / 层 / 世界地名的自定义叫法、卡设定分层房间进第 1 级词表
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveHere, unmappedName, planWords } from './helpers/here-engine.mjs';
import { normCustom, setCustom, removeCustom, aliasMap } from '../map/tavern/mvu.mjs';

const J = p => JSON.parse(readFileSync(new URL('../map/' + p, import.meta.url), 'utf8'));
const REG = J('data/maps.json'), W = J('data/world_markers.json'), EN = J('i18n/en.json').names, PLAN = J('data/eden_estate_rooms.json');
const idxOf = (custom = null) => buildIndex(REG, W, EN, custom, PLAN);
// custom.js index() 的形状
const fromCustom = c => ({ rooms: aliasMap(c, ['room']), areas: aliasMap(c, ['area']), marks: aliasMap(c, ['landmark']), layers: aliasMap(c, ['layer']), world: aliasMap(c, ['world']), ignore: c.忽略 || [] });
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

t('卡设定分层房间：每个房间名都落到第 1 级，带 std；只在一层的带 floor', () => {
  const idx = idxOf();
  for (const r of PLAN.rooms) {
    const x = resolveHere(r.name, idx);
    assert.ok(x && x.level === 1 && x.map === 'eden_estate', `认不出房间 ${r.name}`);
    assert.ok(x.std, `${r.name} 没有 std`);
  }
  const x = resolveHere('女仆长寝室', idx); assert.equal(x.std, '女仆长寝室'); assert.equal(x.floor, 'F2');
  assert.equal(resolveHere('伊甸庄园·女仆长寝室', idx).floor, 'F2');
  assert.equal(resolveHere('仆役核', idx).floor, undefined);   // 各层都有：不定楼层
});
t('只写名字的卡房间（restricted）：名字照抄卡，认得、带 restricted；不在 maps.json 的房间里', () => {
  const idx = idxOf(), rs = PLAN.rooms.filter(r => r.kind === 'restricted');
  assert.ok(rs.length);
  for (const r of rs) { assert.ok(!/按原卡/.test(r.name)); assert.equal(resolveHere(r.name, idx)?.restricted, true, r.name); assert.ok(!REG.maps.eden_estate.rooms.includes(r.name)); }
});
t('maps.json 房间 / 区域与卡房间不冲突（原有落点不变）', () => {
  const a = buildIndex(REG, W, EN), b = idxOf();
  for (const w of [...REG.maps.eden_estate.rooms, ...REG.maps.eden_estate.areas, '伊甸庄园', '厨房花园', '天城下层·7号井', '中层', '天城']) {
    const x = resolveHere(w, a), y = resolveHere(w, b);
    assert.equal(y?.level, x?.level, w); assert.equal(y?.map, x?.map, w);
  }
  const clash = new Set([...REG.maps.eden_estate.areas, ...b.tree.get(b.estate.id).alias]);   // the estate's areas and the names of the whole estate
  for (const r of PLAN.rooms) for (const w of planWords(r.name)) assert.ok(!clash.has(w), `${w} 与区域 / 庄园叫法重名`);
});
t('planWords：括注、×2、「 / 」拆开', () => {
  assert.deepEqual(planWords('主楼梯（塔楼）'), ['主楼梯（塔楼）', '主楼梯']);
  assert.deepEqual(planWords('更衣 / 淋浴'), ['更衣 / 淋浴', '更衣', '淋浴']);
  assert.deepEqual(planWords('客房卫浴 ×2'), ['客房卫浴 ×2', '客房卫浴']);
});
t('未上图：认不出 → 名字；认得出 / 空 / 忽略 → null', () => {
  const idx = idxOf();
  assert.equal(unmappedName('月面基地', idx), '月面基地');
  assert.equal(unmappedName('{{user}}月面基地 / 地球', idx), '月面基地');
  assert.equal(unmappedName('主卧', idx), null);
  assert.equal(unmappedName('', idx), null);
  assert.equal(unmappedName('月面基地', idxOf({ ignore: ['月面基地'] })), null);
});
t('指派：地标 / 层 / 房间 / 区域 / 世界地名，存进 eden_map.自定义 后立刻认得', () => {
  const flat = Object.entries(REG.maps).filter(([, m]) => m.kind === 'points' && m.status !== 'planned');   // the first landmark (not the estate's own), the first layer, the first world place
  const [mkMap, mkM] = flat.find(([, m]) => Object.values(m.markers || {}).some(k => k.link?.map !== 'eden_estate'));
  const mkKey = Object.keys(mkM.markers).find(k => mkM.markers[k].link?.map !== 'eden_estate'), mk = { map: mkMap, marker: mkKey }, mkName = mkM.markers[mkKey].name;
  const lay = { map: flat[0][0], words: [flat[0][1].layer.name] }, layName = lay.words[0];
  const wp = [...(W.places || []), ...(W.fiefs || []), ...(W.realms || [])][0].name;
  let c = normCustom(null);
  c = setCustom(c, mkName, { alias: '老地方', kind: 'landmark' });
  c = setCustom(c, layName, { alias: '铁锈带', kind: 'layer' });
  c = setCustom(c, '女仆长寝室', { alias: '阿姨的屋', kind: 'room' });
  c = setCustom(c, '玫瑰园', { alias: '红花圃', kind: 'area' });
  c = setCustom(c, wp, { alias: '远方', kind: 'world' });
  const idx = idxOf(fromCustom(c));
  const a = resolveHere('老地方', idx); assert.equal(a.level, 3); assert.equal(a.marker, mk.marker);
  const b = resolveHere('铁锈带', idx); assert.equal(b.level, 4); assert.equal(b.map, lay.map);
  const r = resolveHere('阿姨的屋', idx); assert.equal(r.level, 1); assert.equal(r.room, '女仆长寝室'); assert.equal(r.floor, 'F2'); assert.equal(r.custom, true);
  const g = resolveHere('红花圃', idx); assert.equal(g.level, 2); assert.equal(g.room, '玫瑰园');
  const w = resolveHere('远方', idx); assert.equal(w.level, 5); assert.equal(w.place, wp);
  // 显示名不被叫法改动
  assert.equal(c.items['女仆长寝室'].名, undefined); assert.deepEqual(c.items['女仆长寝室'].别名, ['阿姨的屋']);
});
t('一个叫法只指向一处；unalias 去掉；最后一个叫法去掉后该项消失', () => {
  let c = setCustom(normCustom(null), '书房', { alias: '老窝', kind: 'room' });
  c = setCustom(c, '主卧', { alias: '老窝', kind: 'room' });
  assert.equal(aliasMap(c)['老窝'], '主卧'); assert.equal(c.items['书房'], undefined);
  c = setCustom(c, '主卧', { unalias: '老窝' }); assert.equal(c.items['主卧'], undefined);
});
t('忽略：存 忽略 列表，可撤销；指派时自动移出忽略', () => {
  let c = setCustom(normCustom(null), '梦境', { ignore: true });
  assert.deepEqual(c.忽略, ['梦境']); assert.deepEqual(normCustom(JSON.parse(JSON.stringify(c))).忽略, ['梦境']);
  c = setCustom(c, '梦境', { ignore: false }); assert.equal(c.忽略, undefined);
  c = setCustom(c, '梦境', { ignore: true }); c = setCustom(c, '书房', { alias: '梦境', kind: 'room' }); assert.equal(c.忽略, undefined);
  assert.equal(removeCustom(c, '书房').items['书房'], undefined);
});
t('无效叫法：别处的层 / 不存在的房间不生效', () => {
  const idx = idxOf({ layers: { 乱写: '不存在的层' }, rooms: { 某处: '不存在的房间' } });
  assert.equal(resolveHere('乱写', idx), null); assert.equal(resolveHere('某处', idx), null);
});
console.log(`\n${n} passed`);
