// The v2 overlay of a schema-1 pack (docs/kernel-schema.md K-R67): the merge rule, the first pack's overlay, and what it does to the current location.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { applyOverlay } from '../map/core/overlay-v2.mjs';
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
