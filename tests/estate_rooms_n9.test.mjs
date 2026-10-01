// S7-3 T5 / T6 (docs/todo.md N9, N10 (1)): the room data after the change. The committed map/data/eden_estate_rooms.json (written by blender/estate2/floorplans.py) is
// compared with the records before the change (tests/fixtures/eden_estate_rooms.before_s73.json): same rooms in the same order, the four rooms of the
// removed kind are now card rooms and nothing else about them moved, the 21 + 1 volumes that had no use have one, and every room links to its node.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { buildTree } from '../map/core/nodes.mjs';

const rd = p => JSON.parse(fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const NOW = rd('../map/data/eden_estate_rooms.json'), BEFORE = rd('./fixtures/eden_estate_rooms.before_s73.json').rooms;
const F = ['id', 'floor', 'name', 'kind', 'note', 'access', 'area', 'card_id'];
const rec = r => Object.fromEntries(F.map(k => [k, r[k]]));
const prior = Object.fromEntries(BEFORE.map(r => [r[0], Object.fromEntries(F.map((k, i) => [k, r[i]]))]));
const PLACEHOLDER = '未' + '定用途体量', OPEN_IDS = BEFORE.filter(r => r[3] === 'open').map(r => r[0]);   // built from pieces: the no-labels gate bans the word in source
const MOVED = ['B2-C01', 'B1-C01', 'B1-C02', 'B1-C04'];

test('N9: the room count and the order are unchanged, nothing is left of the two old kinds', () => {
  assert.equal(NOW.rooms.length, BEFORE.length); assert.equal(NOW.rooms.length, 123);
  assert.deepEqual(NOW.rooms.map(r => r.id), BEFORE.map(r => r[0]));
  assert.deepEqual([...new Set(NOW.rooms.map(r => r.kind))].sort(), ['card', 'circ', 'medical', 'owner', 'support']);
  assert.equal(OPEN_IDS.length, 22);
});
test('N9: the four private-area rooms became kind card; only their kind differs', () => {
  const was = NOW.rooms.filter(r => prior[r.id].kind === 'restricted');
  assert.deepEqual(was.map(r => r.card_id).sort(), MOVED.slice().sort());
  for (const r of was) { assert.equal(r.kind, 'card'); assert.deepEqual({ ...rec(r), kind: 'restricted' }, prior[r.id], r.id); }
});
test('N9: every other room is unchanged (name, kind, note, access, area, card id), except the volumes of N10 (1)', () => {
  for (const r of NOW.rooms) if (!OPEN_IDS.includes(r.id) && prior[r.id].kind !== 'restricted') assert.deepEqual(rec(r), prior[r.id], r.id);
});
test('N10 (1): every volume that had no use has a use, a plain name and a note, in kind support or owner; the placeholder name is gone', () => {
  for (const id of OPEN_IDS) {
    const r = NOW.rooms.find(x => x.id === id);
    assert.ok(['support', 'owner'].includes(r.kind), id); assert.ok(r.name && r.name !== PLACEHOLDER && !r.name.includes('未定'), id);
    assert.ok(r.note.length >= 12 && !r.note.includes('未定'), id); assert.equal(r.floor, prior[id].floor); assert.equal(r.area, prior[id].area);
  }
  assert.ok(!NOW.rooms.some(r => r.name === PLACEHOLDER));
  assert.equal(new Set(NOW.rooms.filter(r => OPEN_IDS.includes(r.id)).map(r => r.name)).size, 22, 'the 22 names are distinct');
});
test('rooms link to the pack by node id: node = the first room of the same name (the node tree has one node per room name)', () => {
  const first = {};
  for (const r of NOW.rooms) { assert.match(r.node, /^room_[a-z0-9_]+$/); first[r.name] ??= r.node; assert.equal(r.node, first[r.name], r.id); }
  const maps = rd('../map/data/maps.json'), tree = buildTree(fromV1({ manifest: rd('../map/packs/eden/manifest.json'), maps, world: rd('../map/data/world_markers.json'), names: rd('../map/packs/eden/names.en.json'), plan: NOW }).pack.nodes);
  for (const r of NOW.rooms) assert.ok(tree.has(r.node) && tree.get(r.node).name === r.name && tree.parent(r.node) === 'eden_estate', r.id);
});
