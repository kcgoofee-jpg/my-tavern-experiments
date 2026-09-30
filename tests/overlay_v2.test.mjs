// The v2 overlay of a schema-1 pack (docs/kernel-schema.md K-R67): the merge rule, the first pack's overlay, and what it does to the current location.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { applyOverlay, applyOverlayEvents, applyOverlayLlm } from '../map/core/overlay-v2.mjs';
import { buildTree, describe } from '../map/core/nodes.mjs';
import { makeHere } from '../map/app/here-v2.mjs';
import { edenInputs } from './helpers/eden-inputs.mjs';

const N = [{ id: 'a', name: 'A', alias: ['A', 'Aa'], hints: ['x'], at: { x: .1, y: .2 } }, { id: 'b', name: 'B', parent: 'a' }, { id: 'c', name: 'C', parent: 'a', alias: ['C'] }];
const ov = nodes => ({ schema: 2, nodes });

test('K-R67 merge: a new id is added at the end and needs a name; an existing id unions alias and hints and overrides the rest', () => {
  const r = applyOverlay(N, ov([{ id: 'a', alias: ['Aa', 'A2'], hints: ['y'], at: { x: .5, y: .5 }, 'x-layer': 'L' }, { id: 'd', name: 'D', parent: 'a', hints: ['dd'] }, { id: 'e', parent: 'a' }]));
  assert.deepEqual(r.nodes.map(n => n.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(r.nodes[0].alias, ['A', 'Aa', 'A2']); assert.deepEqual(r.nodes[0].hints, ['x', 'y']);
  assert.deepEqual(r.nodes[0].at, { x: .5, y: .5 }); assert.equal(r.nodes[0]['x-layer'], 'L');
  assert.deepEqual(r.nodes[3], { id: 'd', name: 'D', parent: 'a', hints: ['dd'] });
  assert.deepEqual(r.problems, [{ code: 'overlay-name-missing', id: 'e' }]);
});
test('K-R67 merge: a node with no explicit alias keeps its name as a strong name when the overlay adds aliases', () => {
  const r = applyOverlay(N, ov([{ id: 'b', alias: ['Bee'] }]));
  assert.deepEqual(r.nodes[1].alias, ['B', 'Bee']);
});
test('K-R67 merge: pure and lenient; a bad overlay or entry changes nothing else', () => {
  const frozen = JSON.parse(JSON.stringify(N)), same = applyOverlay(N, ov([{ id: 'a', hints: ['q'] }]));
  assert.deepEqual(N, frozen); assert.notEqual(same.nodes[0], N[0]);
  assert.deepEqual(applyOverlay(N, null).nodes, N); assert.deepEqual(applyOverlay(N, null).problems, []);
  assert.deepEqual(applyOverlay(N, { schema: 1, nodes: [] }).problems, [{ code: 'overlay-invalid' }]);
  assert.deepEqual(applyOverlay(N, { schema: 2, nodes: 'x' }).nodes, N);
  const r = applyOverlay(N, ov([null, 7, { id: '' }, { id: 'b', hints: ['ok'] }]));
  assert.deepEqual(r.problems.map(p => p.code), ['overlay-node-invalid', 'overlay-node-invalid', 'overlay-node-invalid']);
  assert.deepEqual(r.nodes[1].hints, ['ok']);
});

const IN = edenInputs({ overlay: undefined }), OV = edenInputs().overlay, plain = fromV1({ ...IN, overlay: null }), full = fromV1(edenInputs());
const fresh = OV.nodes.filter(n => !plain.pack.nodes.some(p => p.id === n.id));
test('the first pack: the overlay adds exactly its new ids, everything else stays', () => {
  assert.equal(OV.schema, 2); assert.deepEqual(full.problems, []);
  assert.equal(full.pack.nodes.length, plain.pack.nodes.length + fresh.length);
  assert.deepEqual(full.pack.nodes.slice(0, plain.pack.nodes.length).map(n => n.id), plain.pack.nodes.map(n => n.id));   // declaration order of the old nodes is kept
  const tree = buildTree(full.pack.nodes, { title: full.pack.title });
  assert.deepEqual(tree.problems, []); assert.equal(tree.root, 'world');
  // A.8 with the plan: 177 nodes, depth 4; the overlay's new nodes are the districts, the outskirts and the far outside
  const d0 = describe(buildTree(plain.pack.nodes), plain.pack.views), d1 = describe(tree, full.pack.views);
  assert.equal(d0.nodes, 177); assert.equal(d1.nodes, 177 + fresh.length); assert.equal(d1.depth, d0.depth);
  assert.deepEqual(fresh.map(n => n.id).filter(i => !i.startsWith('zone_')), ['beyond', 'outskirts']);
  assert.equal(fresh.filter(n => n.id.startsWith('zone_')).length, fresh.length - 2);
  assert.ok(fresh.every(n => typeof n.name === 'string' && n.name && tree.has(n.parent)));
});
test('the first pack: districts sit inside their tier on the render plane; the outskirts carry the ring; the outside has a label', () => {
  const tree = buildTree(full.pack.nodes), by = id => tree.get(id);
  for (const n of fresh.filter(n => n.at)) { assert.ok(n.at.x >= 0 && n.at.x <= 1 && n.at.y >= 0 && n.at.y <= 1, n.id); assert.ok(['tc_mid', 'tc_low'].includes(n.parent)); }
  assert.equal(by('outskirts')['x-ring'], true); assert.equal(by('outskirts').parent, 'beyond'); assert.equal(by('beyond').parent, 'world');
  assert.equal(by('world')['x-layer'], '天城外'); assert.ok(by('world').alias.includes('天城外'));
  assert.deepEqual(by('world').hints, plain.pack.nodes.find(n => n.id === 'world').hints);   // the ambiguous words of the root are untouched
});
test('the current location: the overlay changes no text that placed before, except four words that now mean the outside or a lower district', () => {
  const a = makeHere({ ...IN, overlay: null }), b = makeHere(edenInputs()), key = r => r && JSON.stringify([r.level, r.map, r.marker, r.place, r.room, r.std]);
  const tree = buildTree(full.pack.nodes), words = new Set();   // every name, alias and hint, the overlay's included
  for (const id of tree.ids()) { const n = tree.get(id); if (id !== tree.synth) for (const w of [...(n.alias || [n.name]), ...(n.hints || [])]) words.add(w); }
  for (const t of ['伊甸庄园·主卧', '地基区 7 号井', '中层·霓虹街', '某个房间', '首相府', '光辉联邦', '大骑士领·圣都', '海外', '商业区', '下层·贫民区', '从天城下层·7号井到天城中层·天城执法局总局']) words.add(t);
  const moved = [...words].filter(t => a.here(t) && key(a.here(t)) !== key(b.here(t))).sort();
  assert.deepEqual(moved, ['天城周边', '天城外', '天城外围', '旧教堂']);   // "天城外" held the city's name (group map); the old church is a lower-tier district now, not the cathedral
  assert.ok(words.size > 600);
  for (const t of ['银冠', '施奈德', '哨所', '井']) assert.ok(b.here(t), `${t} now places (v1: nothing)`);
});

test('the first pack declares its overlay in the manifest (data.overlay, relative to map/); a pack that declares none is fetched for none', async () => {
  const man = edenInputs().manifest, town = JSON.parse((await import('node:fs')).readFileSync(new URL('../map/packs/town/manifest.json', import.meta.url), 'utf8'));
  assert.equal(man.data.overlay, 'packs/eden/overlay.v2.json');
  assert.equal(town.data.overlay, undefined);
});

// ---- K-R68: the overlay may carry an events block and llm.templates ----
const EV = { groups: [{ id: 'g1', label: 'One', color: '#112233' }], types: { t1: { label: 'Alpha', group: 'g1', alias: ['a1'], icon: 'A' } }, fx_presets: { p: { block: 'pulse' } }, closed: ['over'], life: { live: 5 }, 'x-feeds': [] };
test('K-R68 events merge: groups and types by id (overlay wins field by field), new ones appended, lists replaced, life merged, input untouched', () => {
  const frozen = JSON.parse(JSON.stringify(EV));
  const r = applyOverlayEvents(EV, { schema: 2, events: {
    groups: [{ id: 'g1', color: '#445566' }, { id: 'g2', label: 'Two', color: '#778899', shape: 'ring' }],
    types: { t1: { icon: 'B' }, t2: { label: 'Beta', group: 'g2', fx: 'glitch', 'x-default-off': true } },
    fx_presets: { q: { block: 'glitch' } }, closed: ['done'], examples: ['e'], life: { merge: 9 }, 'x-more': 1 } });
  assert.deepEqual(EV, frozen); assert.deepEqual(r.problems, []);
  assert.deepEqual(r.events.groups.map(g => [g.id, g.label, g.color]), [['g1', 'One', '#445566'], ['g2', 'Two', '#778899']]);
  assert.equal(r.events.types.t1.icon, 'B'); assert.equal(r.events.types.t1.label, 'Alpha'); assert.deepEqual(r.events.types.t1.alias, ['a1']);
  assert.deepEqual(Object.keys(r.events.types), ['t1', 't2']); assert.equal(r.events.types.t2['x-default-off'], true);
  assert.deepEqual(Object.keys(r.events.fx_presets), ['p', 'q']); assert.deepEqual(r.events.closed, ['done']); assert.deepEqual(r.events.examples, ['e']);
  assert.deepEqual(r.events.life, { live: 5, merge: 9 }); assert.equal(r.events['x-more'], 1); assert.deepEqual(r.events['x-feeds'], []);
});
test('K-R68 events merge: lenient (bad rows skipped and listed), no base events block, no events key = unchanged', () => {
  const r = applyOverlayEvents(undefined, { schema: 2, events: { groups: [null, { id: 'g', label: 'G', color: '#000000' }, { id: 'h' }], types: { a: { label: 'A' }, b: 'x', c: { label: 'C', group: 'g' } }, levels: 'no' } });
  assert.deepEqual(r.events.groups.map(g => g.id), ['g']); assert.deepEqual(Object.keys(r.events.types), ['c']);
  assert.deepEqual(r.problems.map(p => p.code).sort(), ['overlay-group-incomplete', 'overlay-group-invalid', 'overlay-levels-invalid', 'overlay-type-incomplete', 'overlay-type-invalid']);
  assert.equal(applyOverlayEvents(undefined, { schema: 2, nodes: [] }).events, undefined); assert.deepEqual(applyOverlayEvents(EV, null).events, EV);
  assert.deepEqual(applyOverlayEvents(EV, { events: 3 }).problems, [{ code: 'overlay-events-invalid' }]);
});
test('K-R68 llm.templates merge, and fromV1 carries both into the pack (an events-only overlay needs no nodes)', () => {
  assert.deepEqual(applyOverlayLlm({ templates: { zh: { tag: 'a', events: 'e' } }, worldbook: { entries: [] } }, { llm: { templates: { zh: { tag: 'b' }, en: { tag: 'c' } }, worldbook: 1 } }),
    { templates: { zh: { tag: 'b', events: 'e' }, en: { tag: 'c' } }, worldbook: { entries: [] } });
  assert.equal(applyOverlayLlm(undefined, { schema: 2, nodes: [] }), undefined);
  const r = fromV1({ ...IN, overlay: { schema: 2, events: EV, llm: { templates: { zh: { tag: 'T' } } } } });
  assert.deepEqual(r.problems, []); assert.equal(r.pack.events.groups[0].id, 'g1'); assert.equal(r.pack.llm.templates.zh.tag, 'T');
  assert.equal(applyOverlay([], { schema: 2, events: EV }).problems.length, 0);
});
