// K-R107 / K-R108: the transit block in the packs. A schema-1 pack carries it in overlay.v2.json (applyOverlayTransit, fromV1); a schema-2 pack
// has it as a top-level block that validate2 heals against its own nodes and views; the schema file and tools/check_pack.py check the same shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { applyOverlay, applyOverlayTransit } from '../map/core/overlay-v2.mjs';
import { validate2, resolveBlocks } from '../map/core/pack-v2.mjs';
import { BLOCKS } from '../map/core/pack-v2-spec.mjs';
import { RAW } from './transit_fixture.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const TOWN = { manifest: J('map/packs/town/manifest.json'), maps: J('map/packs/town/maps.json'), events: J('map/packs/town/events.json') };
const codes = ps => ps.map(p => p.code);

test('BLOCKS ends with transit; the manifest schema and the block schema exist', () => {
  assert.equal(BLOCKS.at(-1), 'transit'); assert.equal(BLOCKS.length, 11);
  assert.ok(J('map/data/schema/v2/manifest.schema.json').properties.transit);
  assert.equal(J('map/data/schema/v2/transit.schema.json').$id, 'v2/transit.schema.json');
});

test('applyOverlayTransit: absent, wrong type, healed block', () => {
  assert.deepEqual(applyOverlayTransit(undefined), { transit: undefined, problems: [] });
  assert.deepEqual(applyOverlayTransit({ schema: 2, nodes: [] }), { transit: undefined, problems: [] });
  assert.deepEqual(applyOverlayTransit({ schema: 2, transit: 'x' }), { transit: undefined, problems: [{ code: 'overlay-transit-invalid' }] });
  assert.deepEqual(applyOverlayTransit({ schema: 2, transit: [] }).problems, [{ code: 'overlay-transit-invalid' }]);
  const ok = applyOverlayTransit({ schema: 2, transit: RAW }, { nodes: id => id !== 'light', views: () => true });
  assert.ok(!ok.transit.stations.some(s => s.id === 'light')); assert.ok(codes(ok.problems).includes('transit-station-node'));
  assert.equal(applyOverlayTransit({ schema: 2, transit: { stations: [] } }).transit, undefined);
});

test('an overlay that carries only `transit` is a valid overlay', () => {
  const r = applyOverlay([{ id: 'a', name: 'A' }], { schema: 2, transit: RAW });
  assert.deepEqual(r.problems, []); assert.equal(r.nodes.length, 1);
  assert.deepEqual(codes(applyOverlay([], { schema: 2, transit: 5 }).problems), ['overlay-invalid']);
});

test('fromV1 with an overlay transit sets pack.transit; a bad block is reported; without it there is none', () => {
  const r = fromV1({ ...TOWN, overlay: { schema: 2, transit: RAW } });
  assert.deepEqual(r.problems, []);
  assert.equal(r.pack.transit.stations.length, 6); assert.equal(r.pack.transit.lines.length, 2); assert.equal(r.pack.transit.districts.length, 3);
  assert.equal(r.pack.transit.modes.tram.trip, 'rail'); assert.equal(r.pack.transit.modes.walk.label, '步行');
  assert.ok(!('transit' in fromV1(TOWN).pack)); assert.ok(!('transit' in fromV1({ ...TOWN, overlay: { schema: 2, nodes: [] } }).pack));
  const bad = fromV1({ ...TOWN, overlay: { schema: 2, transit: { ...RAW, stations: [...RAW.stations, { id: 'x', node: 'nowhere' }, { id: 'y', view: 'nowhere', at: [0.5, 0.5], name: 'Y' }], lines: [...RAW.lines, { ...RAW.lines[0], id: 'c2', stops: ['market', 'x'] }] } } });
  assert.deepEqual(codes(bad.problems).filter(c => c.startsWith('transit-')).sort(), ['transit-line-invalid', 'transit-line-stop', 'transit-station-node', 'transit-station-view']);
  assert.equal(bad.pack.transit.stations.length, 6);
  const none = fromV1({ ...TOWN, overlay: { schema: 2, transit: 'x' } });
  assert.deepEqual(codes(none.problems), ['overlay-invalid', 'overlay-transit-invalid'], 'an overlay whose only content is a bad block is invalid as a whole too'); assert.ok(!('transit' in none.pack));
  assert.ok(!('transit' in fromV1({ ...TOWN, overlay: { schema: 2, transit: { stations: [{ id: 'q', node: 'nowhere' }] } } }).pack), 'no station survives: no block');
});

test('the first pack has no transit block yet (S8-4b adds the demo network); packs are unchanged', () => {
  for (const id of ['eden', 'town', 'minimal']) { const f = `map/packs/${id}/overlay.v2.json`; if (fs.existsSync(ROOT + f)) assert.equal(J(f).transit, undefined, id); }
});

const NODES = [{ id: 'town', name: 'Town' }, { id: 'a', parent: 'town', name: 'A' }, { id: 'b', parent: 'town', name: 'B' }];
const PACK = extra => ({ id: 'tpack', schema: 2, title: 'T', nodes: NODES, views: { v: { kind: 'schematic' } }, ...extra });
const NET = { stations: [{ id: 'a', node: 'a' }, { id: 'b', node: 'b' }], lines: [{ id: 'x', name: 'X', mode: 'maglev', color: '#112233', stops: ['a', 'b'], min: 3 }] };

test('validate2: an inline transit block is healed against the pack\'s nodes and views', () => {
  const ok = validate2(PACK({ transit: NET }));
  assert.deepEqual(ok.problems, []); assert.equal(ok.pack.transit.lines[0].min.length, 1); assert.equal(ok.pack.transit.options.transfer_min, 3);
  const bad = validate2(PACK({ transit: { ...NET, stations: [...NET.stations, { id: 'g', node: 'ghost' }, { id: 'pv', view: 'nope', at: [0.1, 0.1], name: 'P' }, { id: 'ok', view: 'v', at: [0.1, 0.1], name: 'P' }], districts: [{ id: 'd', name: 'D', view: 'zzz', node: 'a', function: 'civic' }] } }));
  assert.deepEqual(bad.problems.map(p => p.code).sort(), ['transit-district-invalid', 'transit-station-node', 'transit-station-view']);
  assert.ok(bad.problems.every(p => p.path.startsWith('transit')));
  assert.deepEqual(bad.pack.transit.stations.map(s => s.id), ['a', 'b', 'ok']); assert.deepEqual(bad.pack.transit.districts, []);
  const wrong = validate2(PACK({ transit: 5 })); assert.ok(!('transit' in wrong.pack)); assert.equal(wrong.problems[0].code, 'type');
  const none = validate2(PACK({ transit: { stations: [{ id: 'g', node: 'ghost' }] } })); assert.ok(!('transit' in none.pack));
  const path = validate2(PACK({ transit: 'transit.json' })); assert.equal(path.pack.transit, 'transit.json', 'a path is left for resolveBlocks');
  assert.equal(validate2(PACK({ transit: '../x.json' })).problems[0].code, 'pattern');
  const implicit = validate2({ id: 'tp', schema: 2, title: 'T', nodes: NODES, transit: { stations: [{ id: 'p', view: 'town', at: [0.2, 0.2], name: 'P' }, { id: 'q', view: 'a', at: [0.2, 0.2], name: 'Q' }] } });
  assert.deepEqual(implicit.pack.transit.stations.map(s => s.id), ['p'], 'with no views block the implicit schematic views (the root and nodes with children) count');
  assert.ok(codes(validate2(PACK({ transit: NET }), { trusted: true }).problems).length === 0);
  assert.ok(validate2({ id: 'tp', schema: 2, title: 'T', transit: { stations: [{ id: 'a', node: 'whatever' }] } }).pack.transit, 'an automatic pack (no nodes block) cannot check node ids');
});
test('validate2: foreign packs get the same limits; llm templates take the route keys', () => {
  const many = { stations: Array.from({ length: 301 }, (_, i) => ({ id: 's' + i, node: 'a' })) };
  const r = validate2(PACK({ transit: many }), { source: 'url' }); assert.equal(r.pack.transit.stations.length, 300); assert.ok(codes(r.problems).includes('transit-limit'));
  const t = validate2(PACK({ llm: { templates: { en: { route_plan: 'Go {legs}', route_leg: '{from} {to}', route_danger: 'Careful {danger}' } } } }));
  assert.deepEqual(t.problems, []); assert.equal(t.pack.llm.templates.en.route_leg, '{from} {to}');
  const e = validate2(PACK({ llm: { templates: { en: { route_plan: 'x {{getvar::k}}' } } } }), { source: 'url' });
  assert.ok(!e.pack.llm.templates.en.route_plan.includes('{{getvar'), 'a foreign template is neutralised like every other (K-R65)');
});
test('resolveBlocks inlines a transit file', async () => {
  const r = await resolveBlocks(PACK({ transit: 'transit.json' }), async p => { assert.equal(p, 'transit.json'); return NET; });
  assert.deepEqual(r.problems, []); assert.deepEqual(r.manifest.transit, NET);
  assert.equal(validate2(r.manifest).pack.transit.stations.length, 2);
});

const py = src => JSON.parse(execFileSync('python3', ['-c', src], { cwd: ROOT, encoding: 'utf8' }));
test('tools/check_pack.py: the transit block is checked with the schema file and the pack\'s references', () => {
  const r = py(`import json, sys, os, copy
sys.path.insert(0, 'tools'); import check_pack as C
d = 'map/packs/minimal'; m = json.load(open(d + '/manifest.json', encoding='utf-8'))
for k in C.BLOCKS2:
    if isinstance(m.get(k), str): m[k] = json.load(open(os.path.join(d, m[k]), encoding='utf-8'))
ids = [n['id'] for n in m['nodes']]; view = list(m['views'])[0]
NET = {'stations': [{'id': 's1', 'node': ids[1]}, {'id': 's2', 'view': view, 'at': [0.5, 0.5], 'name': 'P'}], 'lines': [{'id': 'x', 'name': 'X', 'mode': 'maglev', 'color': '#112233', 'stops': ['s1', 's2'], 'min': [2]}],
  'links': [{'from': 's1', 'to': 's2', 'mode': 'walk', 'min': 1}], 'districts': [{'id': 'd', 'name': 'D', 'view': view, 'node': ids[1], 'r': 0.1, 'function': 'civic', 'danger': 1}], 'options': {'transfer_min': 2}, 'x-note': 1}
def run(f):
    x = copy.deepcopy(m); x['transit'] = copy.deepcopy(NET); f(x); return len(C.check_v2('minimal', d, x))
ok = [lambda x: None, lambda x: x['transit'].update({'modes': {'ferry': {'label': 'Ferry', 'trip': 'road'}}}), lambda x: x['transit']['lines'][0].update({'min': 3, 'loop': True})]
bad = [lambda x: x['transit']['stations'][0].update({'node': 'nowhere'}), lambda x: x['transit']['stations'][1].update({'view': 'nowhere'}), lambda x: x['transit'].update({'stations': []}),
  lambda x: x['transit']['lines'][0].update({'color': 'red'}), lambda x: x['transit']['lines'][0].update({'stops': ['s1']}), lambda x: x['transit']['districts'][0].update({'function': 'swamp'}),
  lambda x: x['transit']['districts'][0].update({'danger': 4}), lambda x: x['transit']['options'].update({'detour': 3}), lambda x: x['transit'].update({'surprise': 1}), lambda x: x['transit']['links'][0].update({'min': 0}),
  lambda x: x['transit']['stations'][1].pop('name'), lambda x: x['transit']['modes'].update({}) if False else x['transit'].update({'modes': {'Bad': {'label': 'x', 'trip': 'road'}}})]
print(json.dumps({'ok': [run(f) for f in ok], 'bad': [run(f) for f in bad]}))`);
  r.ok.forEach((n, i) => assert.equal(n, 0, `valid case ${i} should pass`));
  r.bad.forEach((n, i) => assert.ok(n > 0, `bad case ${i} should be caught`));
});
