// The viewer's current location (app/place-resolver.mjs: nodes.locate over the node tree, mapped to the result shape every consumer reads).
// The place tests of the first versions (here, card_spec, canon0928, characters, omissions099, transit095, unmapped096) run their inputs through it;
// this file pins what they do not: the intended divergences of docs/kernel-schema.md A.9 through the adapter, the public shapes (user names,
// journeys, estate rooms, unmapped names, the layer word) and the places of the session fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHere } from '../map/app/place-resolver.mjs';
import { readCustom } from '../map/core/legacy-custom.mjs';
import { edenInputs } from './helpers/eden-inputs.mjs';
import { sessionPlaces } from './helpers/session-places.mjs';

const I = edenInputs(), MAPS = I.maps, WORLD = I.world, NAMES = I.names, MAN = I.manifest, PLAN = I.plan;
const engine = (cfg = {}) => makeHere({ manifest: MAN, maps: MAPS, world: WORLD, names: NAMES, plan: cfg.plan ? PLAN : null, custom: cfg.custom });
const FIELDS = ['level', 'map', 'marker', 'place', 'room', 'std', 'floor', 'restricted', 'custom'];
const pick = r => r && Object.fromEntries(FIELDS.filter(k => r[k] !== undefined).map(k => [k, r[k]]));

test('every place of the session fixtures is placed (the locations of the floors, people, events, trip ends)', t => {
  const e = engine(), places = ['session_a.json', 'session_b.json'].flatMap(f => Object.values(sessionPlaces(f)).flat()), distinct = [...new Set(places)];
  t.diagnostic(`session places: ${distinct.length} distinct`);
  assert.ok(distinct.length >= 3);
  for (const p of distinct) assert.ok(e.here(p), p);
  assert.equal(e.here('伊甸庄园·书房').map, 'eden_estate'); assert.equal(e.here('中层·霓虹街').map, 'tc_mid'); assert.equal(e.here('上层·银冠堡').marker, 'silver_crown');
});

test('A.9 divergences through the adapter: each example, with the result shape the consumers read', () => {
  const e = engine(), ep = engine({ plan: true });
  // 1. a broad place holding the estate + a room word: the estate (v1: the tier), K-02
  assert.deepEqual(pick(e.here('上层 书房')), { level: 1, map: 'eden_estate', room: '上层 书房' });
  // 2. a world name + a room word: the world place (v1: the room), K-02
  assert.deepEqual(pick(e.here('奥伦帝国 书房')), { level: 5, map: 'world', place: '奥伦帝国' });
  // 3. an ambiguous word that does not overlap a landmark name: the landmark (v1: nothing)
  assert.equal(e.here('大学 议会').marker, 'council');
  // 4. no plan, a room word and an area word one code point longer: the same estate, the area word reported (v1: the room word)
  assert.equal(e.here('伊甸庄园 人工湖 浴室').word, '人工湖'); assert.equal(e.here('伊甸庄园 人工湖 浴室').map, 'eden_estate');
  // 5. an ambiguous word + an estate room word: the estate, with the plan the room (v1: nothing), K-R16
  assert.equal(e.here('大学 书房').map, 'eden_estate'); assert.equal(ep.here('大学 书房').std, '主人书房');
  // 6. an estate area word that holds a room word one code point shorter (「客房楼」, room 「客房」): the estate, the longest span wins, K-R20 (Q-10)
  assert.equal(e.here('客房楼').level, 2); assert.equal(e.here('客房楼').map, 'eden_estate'); assert.equal(ep.here('客房楼').level, 2); assert.equal(ep.here('客房楼').std, undefined);
  // a merged single-layer site: the same map, the longest alias as the word (v1 reported the layer word)
  for (const [text, map, word] of [['大骑士领·圣都', 'site_kavalierki', '大骑士领·圣都'], ['圆桌第三席封地', 'site_fief3', '圆桌第三席封地']]) {
    const r = e.here(text); assert.deepEqual([r.map, r.word, r.level], [map, word, 4]);
  }
});

test('the layer word of a level-4 place, as written, and the registry level of a map (what the spatial contract prints)', () => {
  const e = engine();
  assert.equal(e.here('中层·霓虹街').layer, '霓虹街'); assert.equal(e.here('大骑士领·圣都').layer, '圣都'); assert.equal(e.here('圆桌第三席封地').layer, '第三席封地');
  assert.equal(e.here('7号井').layer, undefined);
  assert.equal(e.level('site_kavalierki'), '圣都'); assert.equal(e.level('tc_mid'), '中层'); assert.equal(e.level('nowhere'), '');
});

test('the adapter keeps the public shapes: user names, transit ends, the estate rooms, unmapped', () => {
  const custom = { rooms: { 我的秘密书斋: '书房' }, marks: { 蓝塔: '天城执法局总局' }, ignore: ['忽略我'] };
  const c = engine({ custom });
  assert.deepEqual(pick(c.here('我的秘密书斋')), { level: 1, map: 'eden_estate', room: '书房', custom: true });
  assert.equal(c.here('天城·中层·蓝塔').marker, 'enforcement_hq'); assert.equal(c.here('我的秘密书斋').via, 'user');
  assert.equal(c.unmapped('忽略我'), null); assert.equal(c.unmapped('别的地方'), '别的地方'); assert.equal(c.unmapped('  '), null);
  assert.deepEqual(c.estate.alias, { 我的秘密书斋: '书房' }); assert.ok(c.estate.std.includes('书房') && c.estate.id === 'eden_estate');
  const tr = engine().here('从天城下层·7号井到天城中层·天城执法局总局');
  assert.equal(tr.transit.fromText, '天城下层·7号井'); assert.equal(tr.transit.to.marker, 'enforcement_hq'); assert.equal(tr.transit.from.marker, 'well7');
  const en = engine().here('Eden Manor → Well 7 Black Market');
  assert.deepEqual([en.transit.fromText, en.transit.toText, en.transit.to.marker], ['Eden Manor', 'Well 7 Black Market', 'well7']);   // the ends keep their case
  const store = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; }, removeItem(k) { delete this.m[k]; } };
  store.setItem('edenMap:chat:c1:custom', JSON.stringify({ rooms: { 书斋: '书房', bad: 3 } }));
  assert.deepEqual(readCustom(store, 'c1'), { rooms: { 书斋: '书房' } }); assert.deepEqual(readCustom(store, ''), { rooms: {} });
});

test('N14 b: 「南侧地窖」 lands on the one cellar (恒温酒窖, B1) through its synonym 地窖, with and without the plan', () => {
  for (const t of ['南侧地窖', '地窖', '伊甸庄园 地窖']) {
    assert.equal(engine().here(t).map, 'eden_estate', t);
    const r = engine({ plan: true }).here(t); assert.deepEqual([r.std, r.floor, r.node], ['恒温酒窖', 'B1', 'room_b1_21'], t);
  }
});
