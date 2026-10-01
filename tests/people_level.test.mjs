// S6-1: the level of the open view (K-R73). The first pack's maps with child maps are macro, every other map micro; the example pack's maps are micro;
// the view field `x-people` (v1: maps.json `people`) wins over the child rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeRuntime } from '../map/app/nodes-runtime.mjs';
import { levelMode } from '../map/core/entities.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const MAPS = J('map/data/maps.json'), TOWN = J('map/packs/town/maps.json');
const EDEN = { manifest: J('map/packs/eden/manifest.json'), maps: MAPS, world: J('map/data/world_markers.json'), names: J('map/packs/eden/names.en.json'), plan: J('map/data/eden_estate_rooms.json'), overlay: J('map/packs/eden/overlay.v2.json') };
const TOWN_IN = { manifest: J('map/packs/town/manifest.json'), maps: TOWN, events: J('map/packs/town/events.json') };
const modeIn = (rt, id) => levelMode({ children: rt.children, viewField: (v, k) => rt.views?.[v]?.[k] }, id);

test('the first pack: every map with child maps is macro, every other map micro', () => {
  const rt = makeRuntime(EDEN), ids = Object.keys(MAPS.maps), macro = ids.filter(m => rt.children(m).length);
  assert.ok(macro.length >= 3 && macro.length < ids.length, 'a mix of both levels');
  assert.deepEqual(ids.filter(id => modeIn(rt, id) === 'macro'), macro);
  assert.deepEqual(ids.filter(id => modeIn(rt, id) === 'micro'), ids.filter(m => !macro.includes(m)));
  assert.ok(macro.includes('world') && macro.includes('tc_mid') && macro.includes('eden_estate'), 'the world map, a tier and a 3D page with maps below it');
  assert.ok(ids.some(id => modeIn(rt, id) === 'micro'), 'the 3D pages of the sites are micro');
});

test('the example pack: its two maps are micro', () => {
  const rt = makeRuntime(TOWN_IN), ids = Object.keys(TOWN.maps);
  assert.equal(ids.length, 2);
  for (const id of ids) { assert.equal(rt.children(id).length, 0, id); assert.equal(modeIn(rt, id), 'micro', id); }
});

test('x-people: a map may force the level; it becomes the view field and wins over the child rule', () => {
  const leaf = Object.keys(TOWN.maps)[0], base = makeRuntime(TOWN_IN);
  const set = (inp, reg, id, v) => ({ ...inp, maps: { ...reg, maps: { ...reg.maps, [id]: { ...reg.maps[id], people: v } } } });
  const a = makeRuntime(set(EDEN, MAPS, 'tc_mid', 'micro')), b = makeRuntime(set(TOWN_IN, TOWN, leaf, 'macro'));
  assert.equal(a.views.tc_mid['x-people'], 'micro'); assert.ok(a.children('tc_mid').length > 0);
  assert.equal(modeIn(a, 'tc_mid'), 'micro');
  assert.equal(modeIn(a, 'world'), 'macro', 'other maps keep the child rule');
  assert.equal(b.views[leaf]['x-people'], 'macro'); assert.equal(b.children(leaf).length, 0);
  assert.equal(modeIn(b, leaf), 'macro');
  assert.equal(modeIn(base, leaf), 'micro');
  const bad = makeRuntime(set(EDEN, MAPS, 'tc_mid', 'bogus'));
  assert.equal(bad.views.tc_mid['x-people'], undefined, 'only macro / micro are carried');
  assert.equal(modeIn(bad, 'tc_mid'), 'macro');
  assert.equal(makeRuntime(EDEN).views.tc_mid['x-people'], undefined, 'no map of the first pack sets it');
});
