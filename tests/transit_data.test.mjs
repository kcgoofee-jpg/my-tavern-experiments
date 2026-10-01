// S8-4b (docs/transit-schema.md §9, §10): the networks the shipped packs declare. The first pack's demo network sits on tc_mid only (stations are the markers, minutes follow the map by the design's formulas,
// four districts that do not overlap); the town network gives the plans of the acceptance section. Both go through the kernel's strict path (compat-v1 + normTransit): no problems.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { buildTree } from '../map/core/nodes.mjs';
import { buildGraph, planRoute, checkPlan } from '../map/core/router.mjs';
import { applyOverlayTransit } from '../map/core/overlay-v2.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url)), J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
function pack(id) {
  const dir = `map/packs/${id}/`, manifest = J(dir + 'manifest.json'), base = id === 'eden' ? 'map/' : dir, d = manifest.data || {};
  const r = fromV1({ manifest, maps: J(base + d.maps), world: d.world ? J(base + d.world) : null, plan: d.rooms ? J(base + d.rooms) : null, names: id === 'eden' ? J('map/packs/eden/names.en.json') : null,
    events: d.events && d.events !== 'builtin' ? J(base + d.events) : null, overlay: d.overlay ? J(base + d.overlay) : null });
  return { r, tree: buildTree(r.pack.nodes, { title: r.pack.title }), overlay: d.overlay ? J(base + d.overlay) : null };
}
const EDEN = pack('eden'), TOWN = pack('town'), TC = J('map/data/tc_mid.json');

const LINES = {   // design section 9
  l1: ['barracks_ring', 'military_academy', 'storm_hall', 'enforcement_hq', 'reserve_office', 'admin_council', 'schneider_clinic', 'victoria_apartment', 'mid_care_home'],
  l2: ['starabyss_univ', 'mage_tower', 'enforcement_hq', 'executive_office', 'council', 'old_apartment', 'merc_guild', 'checkpoint_c'],
  l3: ['butler_academy', 'mid_hospital', 'tiancheng_univ', 'admin_council', 'culture_office', 'merc_guild', 'rebirth_workshop'],
  l4: ['iron_cradle', 'butler_academy', 'radiance_cathedral', 'supreme_court', 'victoria_apartment', 'mid_care_home', 'mid_monastery', 'schneider_clinic', 'tiancheng_univ', 'mid_hospital'],
  m: ['knights_camp', 'rebirth_workshop', 'old_apartment', 'council', 'culture_office', 'mid_monastery'],
};
const LINKS = [['reserve_office', 'executive_office', 'walkway'], ['executive_office', 'council', 'walkway'], ['tiancheng_univ', 'supreme_court', 'walkway'], ['mid_monastery', 'mid_care_home', 'walkway'], ['enforcement_hq', 'victoria_apartment', 'air'], ['checkpoint_c', 'enforcement_hq', 'air']];
const FORMULA = { maglev: d => 1 + d / 400, metro: d => 1 + d / 350, walkway: d => d / 70, air: d => 2 + d / 600 }, half = v => Math.max(1, Math.round(v * 2) / 2);
const at = Object.fromEntries(TC.markers.map(m => [m.id, [m.nx, m.ny]])), metres = (a, b) => Math.hypot((at[a][0] - at[b][0]) * TC.extent_m[0], (at[a][1] - at[b][1]) * TC.extent_m[1]);

test('the overlays of the first pack and the town carry a transit block that the kernel accepts without a single problem', () => {
  for (const [name, p] of [['eden', EDEN], ['town', TOWN]]) {
    assert.ok(p.r.pack.transit, name); assert.deepEqual(p.r.problems.filter(x => /transit/.test(x.code)), [], name);
    const strict = applyOverlayTransit(p.overlay, { nodes: id => p.tree.has(id), views: id => Object.hasOwn(p.r.pack.views || {}, id) });
    assert.deepEqual(strict.problems, [], name + ' strict'); assert.deepEqual(strict.transit, p.r.pack.transit);
  }
});

test('first pack: every station is a tc_mid marker and a node of the tree (26 of 26, id = node id), no point stations', () => {
  const T = EDEN.r.pack.transit;
  assert.equal(T.stations.length, 26); assert.deepEqual(T.stations.map(s => s.id).sort(), TC.markers.map(m => m.id).sort());
  for (const s of T.stations) { assert.equal(s.node, s.id); assert.ok(EDEN.tree.has(s.node), s.id); assert.equal(s.view, undefined); }
});

test('first pack: five lines with the stops of the design, one loop, modes as written', () => {
  const T = EDEN.r.pack.transit;
  assert.deepEqual(T.lines.map(l => l.id), ['l1', 'l2', 'l3', 'l4', 'm']);
  for (const l of T.lines) assert.deepEqual(l.stops, LINES[l.id], l.id);
  assert.deepEqual(T.lines.map(l => [l.number, l.mode, l.color, !!l.loop]), [['1', 'maglev', '#e8b33a', false], ['2', 'maglev', '#3fa7d6', false], ['3', 'maglev', '#59b36b', false], ['4', 'maglev', '#b07cd8', true], ['M', 'metro', '#e0736a', false]]);
  assert.deepEqual(T.lines.map(l => l.name), ['悬浮轨道 1 号线', '悬浮轨道 2 号线', '悬浮轨道 3 号线', '悬浮轨道 4 号线（环线）', '地铁 M 线']);
  assert.deepEqual(T.lines.map(l => l.i18n.en.name), ['Maglev Line 1', 'Maglev Line 2', 'Maglev Line 3', 'Maglev Line 4 (loop)', 'Metro Line M']);
  assert.equal(T.modes.walkway.trip, 'road'); assert.deepEqual(T.modes.walkway.dash, [1, 4]); assert.equal(T.modes.maglev.trip, 'rail'); assert.equal(T.modes.air.trip, 'air');
  assert.deepEqual([T.modes.maglev, T.modes.metro, T.modes.air, T.modes.walkway].map(m => m.label), ['悬浮轨道', '地铁', '出租悬浮车', '步行连廊']);
});

test('first pack: the minutes follow the map by the design formulas (recomputed from tc_mid.json, rounded to 0.5, at least 1)', () => {
  const T = EDEN.r.pack.transit;
  for (const l of T.lines) {
    const k = l.mode, n = l.stops.length, segs = l.loop ? n : n - 1;
    assert.equal(l.min.length, segs, l.id);
    for (let i = 0; i < segs; i++) assert.equal(l.min[i], half(FORMULA[k](metres(l.stops[i], l.stops[(i + 1) % n]))), `${l.id} segment ${i}`);
  }
  assert.deepEqual(T.links.map(k => [k.from, k.to, k.mode]), LINKS);
  for (const k of T.links) assert.equal(k.min, half(FORMULA[k.mode](metres(k.from, k.to))), `${k.from}-${k.to}`);
});

const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < (poly[j][0] - poly[i][0]) * (p[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
const cross = (a, b, c, d) => { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
const overlap = (A, B) => A.some(p => inside(p, B)) || B.some(p => inside(p, A)) || A.some((p, i) => B.some((q, j) => cross(p, A[(i + 1) % A.length], q, B[(j + 1) % B.length])));

test('first pack: four districts on tc_mid, valid polygons holding their markers, none overlapping another', () => {
  const T = EDEN.r.pack.transit, WANT = { core: ['civic', 0], high: ['residential', 0], rim: ['military', 1], low: ['industry', 2] };
  assert.deepEqual(T.districts.map(d => d.id), Object.keys(WANT));
  for (const d of T.districts) {
    assert.equal(d.view, 'tc_mid'); assert.deepEqual([d.function, d.danger], WANT[d.id]); assert.ok(d.pts.length >= 3 && d.pts.length <= 200);
    assert.ok(d.pts.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1), d.id + ' inside the map');
    const mine = T.stations.filter(s => s.district === d.id).map(s => s.id); assert.ok(mine.length >= 3, d.id);
    for (const m of mine) assert.ok(inside(at[m], d.pts), `${m} in ${d.id}`);
  }
  assert.equal(T.stations.filter(s => s.district).length, 24);
  for (let i = 0; i < T.districts.length; i++) for (let j = i + 1; j < T.districts.length; j++) assert.equal(overlap(T.districts[i].pts, T.districts[j].pts), false, `${T.districts[i].id} / ${T.districts[j].id}`);
  assert.deepEqual(T.districts.map(d => d.i18n.en.name), ['Core district', 'Upper mid tier', 'Outer rim', 'Lower mid tier']);
});

test('first pack: the router finds a plan between the cathedral and the enforcement headquarters, and the host re-check accepts it', () => {
  const g = buildGraph(EDEN.r.pack.transit), env = { tree: EDEN.tree }, p = planRoute(g, { node: 'radiance_cathedral' }, { node: 'enforcement_hq' }, { env });
  assert.ok(p && p.min >= 1 && p.legs.length >= 1, JSON.stringify(p));
  assert.deepEqual(checkPlan(g, p, { tree: EDEN.tree }), p);
  assert.equal(planRoute(g, { node: 'starabyss_univ' }, { node: 'checkpoint_c' }, { env }).modes[0], 'maglev');
  const low = planRoute(g, { node: 'enforcement_hq' }, { node: 'rebirth_workshop' }, { env }); assert.equal(low.danger, 2, 'the lower tier is the dangerous district');
});

test('the town network: the plans of the acceptance section (keep -> light 15 min, 1 change, danger 1; clock -> fish 9 min, 1 change; both ways)', () => {
  const T = TOWN.r.pack.transit, g = buildGraph(T), env = { tree: TOWN.tree };
  assert.deepEqual(T.stations.map(s => s.id), ['keep', 'market', 'clock', 'fish', 'light', 'pier']); assert.deepEqual(T.lines.map(l => [l.id, l.mode, l.stops, l.min]), [['cable', 'cable', ['market', 'fish'], [4]], ['tram', 'tram', ['keep', 'market', 'clock'], [3, 2]]]);
  for (const id of ['keep', 'market', 'clock', 'fish', 'light']) assert.ok(TOWN.tree.has(id), id);
  const a = planRoute(g, { node: 'keep' }, { node: 'light' }, { env });
  assert.deepEqual([a.min, a.changes, a.danger], [15, 1, 1]); assert.deepEqual(a.legs.map(l => [l.kind, l.mode, l.line, l.stops, l.min]), [['ride', 'tram', 'tram', ['keep', 'market'], 3], ['ride', 'cable', 'cable', ['market', 'fish'], 4], ['link', 'walk', null, ['fish', 'pier', 'light'], 5]]);
  const b = planRoute(g, { node: 'clock' }, { node: 'fish' }, { env }); assert.deepEqual([b.min, b.changes], [9, 1]);
  const c = planRoute(g, { node: 'light' }, { node: 'keep' }, { env }); assert.deepEqual([c.min, c.changes], [15, 1]);
  assert.equal(planRoute(g, { node: 'keep' }, { node: 'clock' }, { env, modes: ['tram'] }).min, 5, 'rail only: by tram');
  assert.deepEqual(checkPlan(g, a, { tree: TOWN.tree }), a);
});
