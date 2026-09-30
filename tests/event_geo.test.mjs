// Event placement through the node tree (core/event-geo.mjs, docs/kernel-schema.md K-R24, K-R51) and its use by tavern/events.mjs: the layer label, the
// map, the place text, the spot; a place no node holds is listed without a pin (K-01 B). The parity against v1 is tests/events_geo_shadow.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGeo, spotOf, hash01 } from '../map/core/event-geo.mjs';
import { buildTree } from '../map/core/nodes.mjs';
import * as EVM from '../map/tavern/events.mjs';
import { edenGeo, townGeo } from './helpers/eden-geo.mjs';

const eden = edenGeo(), town = townGeo();
const P = t => eden.place(t);

test('place: the layer label is that of the map that owns the place; a point on a map belongs to the map that frames it', () => {
  assert.deepEqual([P('中层·霓虹街C区'), P('7号井'), P('伊甸庄园·主卧'), P('中层')].map(p => [p.layer, p.map]), [['中层', 'tc_mid'], ['下层', 'tc_low'], ['上层', 'tc_upper'], ['中层', 'tc_mid']]);
  assert.deepEqual([P('光辉联邦'), P('海外'), P('天城外·某处')].map(p => [p.layer, p.map, p.owner]), [['天城外', 'world', 'world'], ['天城外', 'world', 'world'], ['天城外', 'world', 'world']]);
  assert.equal(P('大骑士领·圣都').map, 'world');   // a site that has its own map is a point on the world map
  assert.equal(P('荣光冠冕').map, 'site_kavalierki');   // a place inside that site is drawn on the site's map
});
test('place: no node -> null (K-01 B lets the event stay in the list); a root hint never decides', () => {
  for (const t of ['', '   ', '某处', '区议会', '骑士团巡逻据点']) assert.equal(P(t), null, t);
  assert.equal(town.place('天城·下层·7号井'), null);
});
test('place: the outskirts node is the ring; the outside layer word yields to a named place', () => {
  for (const t of ['天城外围防线', '野兽潮前线', '城外营地', '天城外·北面边境']) assert.equal(P(t).ring, true, t);
  assert.equal(P('天城外·原域').node, 'yuanyu'); assert.equal(P('天城外·天城').node, 'tiancheng'); assert.equal(P('第三帝国').ring, false);
});
test('strip: the map label and the names above it are taken off the front, as v1 did', () => {
  const s = (t, tt = t) => eden.strip(tt.replace(/\s+/g, ''), P(t).owner);
  assert.equal(s('中层·霓虹街C区'), '霓虹街C区'); assert.equal(s('天城·下层·7号井'), '7号井'); assert.equal(s('下层·天城下层血肉磨坊'), '血肉磨坊');
  assert.equal(s('伊甸庄园·主卧'), '伊甸庄园·主卧'); assert.equal(s('天城外·某处'), '某处');
  assert.equal(town.strip('雾港镇·码头·灯塔', town.place('雾港镇·码头·灯塔').owner), '灯塔');
});
test('layerOf / layers: labels of the maps; the current location and the event use the same word', () => {
  assert.equal(eden.layerOf('地基区 7 号井'), '下层'); assert.equal(eden.layerOf('某个房间'), '');
  assert.deepEqual(town.layers().sort(), ['山上', '码头']);
  assert.ok(['上层', '中层', '下层', '天城外'].every(l => eden.layers().includes(l)));
});

const MK = new Map([['well7', { nx: .65, ny: .87, name: 'W' }], ['eden', { nx: .43, ny: .84, name: 'E' }]]);
test('spotOf: ring, world, xy, marker (own or above), district with a fixed jitter, else a fixed spot inside the map', () => {
  const key = 'ev1', ring = spotOf(eden, P('城外营地'), { key });
  assert.equal(ring.ring, true); assert.ok(Math.hypot(ring.nx - .5, (ring.ny - .5) / .8) >= .62 && Math.hypot(ring.nx - .5, (ring.ny - .5) / .8) <= 1.12);
  assert.deepEqual(spotOf(eden, P('光辉联邦'), { key, world: true }), { nx: eden.spot('fed').x, ny: eden.spot('fed').y, marker: true });
  assert.equal(spotOf(eden, P('天城外·某处'), { key, world: true }).none, true);
  assert.deepEqual(spotOf(eden, P('7号井'), { key, xy: '0.1,0.2', markers: MK }), { nx: .1, ny: .2 });
  assert.deepEqual(spotOf(eden, P('7号井'), { key, markers: MK }), { nx: .65, ny: .87, marker: true, name: 'W' });
  assert.deepEqual(spotOf(eden, P('伊甸庄园·主卧'), { key, markers: MK }), { nx: .43, ny: .84, marker: true, name: 'E' });   // a room: its house's marker
  const d = spotOf(eden, P('中层·商业区'), { key, markers: new Map() }), z = eden.spot('zone_mid_2');
  assert.ok(Math.abs(d.nx - z.x) <= .02 && Math.abs(d.ny - z.y) <= .03); assert.deepEqual(d, spotOf(eden, P('中层·商业区'), { key, markers: new Map() }));
  const a = spotOf(eden, P('中层'), { key, markers: new Map() }); assert.equal(a.approx, true); assert.ok(a.nx >= .2 && a.nx <= .8);
  assert.equal(spotOf(eden, null).none, true); assert.notEqual(hash01('a'), hash01('b'));
});
test('makeGeo without views or overlay: every place is unmapped, none throws', () => {
  const g = makeGeo({ tree: buildTree([{ id: 'r', name: 'Root' }, { id: 'p', name: 'Pier', parent: 'r' }]), lang: 'en' });
  assert.deepEqual([g.place('the pier').node, g.place('the pier').map, g.place('the pier').layer], ['p', null, 'Root']);
  assert.equal(g.place('nowhere'), null); assert.deepEqual(g.layers(), []);
});

test('events.mjs: a place no node holds keeps the event, unplaced (K-01 B); without a geo every event is unplaced', () => {
  const tag = '⌖火灾｜某处｜1｜冒烟 ⌖火灾｜中层·霓虹街｜2｜起火';
  assert.deepEqual(EVM.parseMarks(tag).map(e => [e.layer, e.node]), [['', null], ['', null]]);
  EVM.setGeo(eden);
  try {
    const [a, b] = EVM.parseMarks(tag);
    assert.deepEqual([a.layer, a.place, a.node], ['', '某处', null]);
    assert.deepEqual([b.layer, b.place, b.node], ['中层', '霓虹街', 'zone_mid_2']);
    assert.equal(EVM.layerOf('中层·霓虹街'), '中层'); assert.equal(EVM.summarize(EVM.collect([{ floor: 1, text: tag }], 2), ''), '');
    const items = EVM.collect([{ floor: 1, text: tag }, { floor: 2, text: '⌖火灾｜某处｜0｜灭了' }], 2);
    assert.equal(items.find(e => e.node === null).closed, true);   // unplaced events merge by type + place text (K-R54)
  } finally { EVM.setGeo(null); }
});
