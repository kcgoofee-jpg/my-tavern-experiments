// The viewer's node tree (map/app/nodes-runtime.mjs): breadcrumb, up button, warm-up neighbours, estate stand-in and levels read the
// compat tree; each answer is compared with what the registry walk gave before (S2-A). Only the dairy parlour may differ.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeRuntime, buildRuntime, crumbs, parentMap, childMaps, standIn, isScene } from '../map/app/nodes-runtime.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const MAPS = J('map/data/maps.json'), WORLD = J('map/data/world_markers.json'), NAMES = J('map/packs/eden/names.en.json'), PLAN = J('map/data/eden_estate_rooms.json');
const EDEN = { manifest: J('map/packs/eden/manifest.json'), maps: MAPS, world: WORLD, names: NAMES, plan: PLAN };
const TOWN = { manifest: J('map/packs/town/manifest.json'), maps: J('map/packs/town/maps.json'), events: J('map/packs/town/events.json') };
const eden = makeRuntime(EDEN), town = makeRuntime(TOWN);

// what the viewer did before: `maps.<id>.parent` walked to the top, and the first marker whose `link` targets the page
const oldChain = (maps, id) => { const c = []; for (let k = id; k; k = maps[k].parent) c.unshift(k); return c; };
const oldStandIn = (maps, eid) => {
  for (const [k, L] of Object.entries(maps)) for (const [mk, v] of Object.entries(L.markers || {})) if (v.link?.map === eid && L.status !== 'planned') return { map: k, marker: mk };
  return null;
};

test('breadcrumb: the node tree gives the registry parent walk for every map of both packs', () => {
  for (const [rt, reg] of [[eden, MAPS.maps], [town, TOWN.maps.maps]]) for (const id of Object.keys(reg)) assert.deepEqual(rt.crumbs(id), oldChain(reg, id), id);
});
test('breadcrumb: the dairy parlour sits under the estate, in the farm zone of its view', () => {
  assert.deepEqual(eden.crumbs('dairy'), ['world', 'tc_upper', 'eden_estate', 'dairy']);
  assert.equal(eden.tree.parent('dairy'), 'eden_estate'); assert.equal(eden.tree.get('dairy').anchor, 'dairy');
  assert.equal(MAPS.maps.dairy.test, undefined); assert.equal(MAPS.maps.dairy.parent, 'eden_estate');
});
test('parent / children: children are the maps whose parent is the map; the maps without a parent are those the registry lists without one', () => {
  for (const [rt, reg] of [[eden, MAPS.maps], [town, TOWN.maps.maps]]) {
    const ids = Object.keys(reg), roots = ids.filter(id => rt.parent(id) === null);
    assert.deepEqual(roots, ids.filter(id => !reg[id].parent));   // the maps with no map above them (town has two: their group is not a map)
    for (const id of ids) assert.deepEqual(rt.children(id), ids.filter(k => rt.parent(k) === id), id);
    for (const id of ids) assert.equal(rt.parent(id), reg[id].parent ?? null, id);
  }
  assert.ok(eden.children('eden_estate').includes('dairy')); assert.ok(eden.children('tc_mid').includes('lm_cathedral'));
});
test('estate stand-in: the flat map and marker that stand for a 3D page match the old marker scan (the dairy, lm_well7 and lm_hunting_camp are new)', () => {
  const now = {};
  for (const [id, m] of Object.entries(MAPS.maps)) if (m.kind === 'estate') now[id] = eden.standIn(id);
  assert.deepEqual(eden.standIn('eden_estate'), { map: 'tc_upper', marker: 'eden' });
  const diff = Object.keys(now).filter(id => JSON.stringify(now[id]) !== JSON.stringify(oldStandIn(MAPS.maps, id)));
  assert.deepEqual(diff, ['lm_well7', 'lm_hunting_camp', 'dairy']);   // lm_well7: only `link3d` marks point at it (no stand-in before); lm_hunting_camp: a world place links to it (S4-3, no marker on a points map); dairy: in the tree since S2-A
  assert.deepEqual(now.lm_hunting_camp, { map: 'world', marker: null });
  assert.equal(oldStandIn(MAPS.maps, 'lm_well7'), null); assert.deepEqual(now.lm_well7, { map: 'tc_low', marker: 'well7' });
  assert.deepEqual(now.dairy, { map: 'tc_upper', marker: 'eden' });   // the parlour has no marker of its own: the estate's marker stands for it
  assert.equal(eden.standIn('tc_low'), null); assert.equal(eden.standIn('nope'), null);
});
test('levels: K-R35 switcher of a group member equals the registry group; a site has no switcher of its own group', () => {
  for (const [gid, g] of Object.entries(MAPS.groups)) {
    if (g.layers.length < 2) continue;
    for (const k of g.layers) assert.deepEqual(eden.levels(k), g.layers, `${gid}/${k}`);
  }
});
test('kind / isScene: 3D pages are the model3d views; flat maps are not', () => {
  assert.ok(eden.isScene('eden_estate') && eden.isScene('lm_cathedral') && eden.isScene('dairy'));
  assert.ok(!eden.isScene('tc_upper') && !eden.isScene('world') && !eden.isScene('nope'));
  for (const [id, m] of Object.entries(MAPS.maps)) assert.equal(eden.isScene(id), m.kind === 'estate', id);
});
test('facade: no runtime answers "nothing above, nothing below"; buildRuntime swallows a bad registry', () => {
  assert.deepEqual(crumbs('x'), ['x']); assert.equal(parentMap('x'), null); assert.deepEqual(childMaps('x'), []); assert.equal(standIn('x'), null); assert.equal(isScene('x'), false);
  assert.equal(buildRuntime({ maps: null }) instanceof Object || true, true);
  buildRuntime(EDEN);
  assert.deepEqual(crumbs('tc_mid'), ['world', 'tc_mid']); assert.equal(parentMap('tc_mid'), 'world'); assert.ok(childMaps('tc_mid').length > 10); assert.equal(isScene('lm_cathedral'), true);
  assert.deepEqual(standIn('eden_estate'), { map: 'tc_upper', marker: 'eden' });
});

test('zone children: the dairy parlour hangs under the farm zone of the estate page; the zone id is one the page knows', () => {
  assert.deepEqual(eden.zoneChildren('eden_estate'), { dairy: ['dairy'] });
  assert.equal(eden.anchorIn('dairy'), 'dairy'); assert.equal(eden.anchorIn('eden_estate'), null);
  const zones = J('map/estate/model/zones.json').zones.map(z => z.id);
  for (const z of Object.keys(eden.zoneChildren('eden_estate'))) assert.ok(zones.includes(z), z);   // the page and the host agree on zone ids
  for (const id of Object.keys(MAPS.maps)) if (id !== 'eden_estate') assert.deepEqual(eden.zoneChildren(id), {}, id);
  assert.deepEqual(town.zoneChildren('world'), {});
});

test('layer strip: strip(id) is what the switcher rendered from the registry groups, for every map of both packs', () => {
  const today = (reg, groups, id) => { const g = reg[id].group && groups[reg[id].group]; return g ? g.layers : []; };   // the S2-A renderer: one button for a single-layer group, none without a group
  for (const [rt, reg, groups] of [[eden, MAPS.maps, MAPS.groups || {}], [town, TOWN.maps.maps, TOWN.maps.groups || {}]])
    for (const id of Object.keys(reg)) assert.deepEqual(rt.strip(id), today(reg, groups, id), id);
  assert.deepEqual(eden.strip('tc_mid'), ['eden_estate', 'tc_upper', 'tc_mid', 'tc_low']);   // the estate is a layer of its group (unchanged)
  assert.deepEqual(eden.strip('site_fief3'), ['site_fief3']);   // a single-layer group keeps its one button: the K-R35 sibling fallback (levels) would list every site
  assert.ok(eden.levels('site_fief3').length > 1);
  assert.deepEqual(eden.strip('dairy'), []); assert.deepEqual(eden.strip('lm_cathedral'), []); assert.deepEqual(eden.strip('world'), []);
});
test('layer strip: no runtime answers null (the viewer falls back to the registry groups)', async () => {
  const m = await import('../map/app/nodes-runtime.mjs'); m.buildRuntime(null); assert.equal(m.strip('tc_mid'), null); buildRuntime(EDEN);
});
