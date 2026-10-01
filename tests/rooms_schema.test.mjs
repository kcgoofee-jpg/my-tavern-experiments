// S7-3 T1 (docs/kernel-schema.md K-R131 / K-R132): map/data/schema/v2/rooms.schema.json validates the first pack's room plan and the fixture pack's; a plan without node ids,
// a room with a short outline and a `building.floors` key in a 3D manifest are rejected. Validation runs through tools/jsonschema_lite.py (the repo's schema checker).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const run = (schema, inst) => {
  const r = spawnSync('python3', ['-W', 'ignore', '-c', `import json,sys; sys.path.insert(0,'tools'); from jsonschema_lite import validate
S=json.load(open('map/data/schema/v2/${schema}.schema.json',encoding='utf-8')); I=json.load(open(sys.argv[1],encoding='utf-8')) if sys.argv[1] != '-' else json.loads(sys.stdin.read())
print(json.dumps(validate(I,S)))`, inst.file || '-'], { cwd: ROOT, input: inst.json ? JSON.stringify(inst.json) : undefined, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
};
const good = { floors: [{ id: 'A', z: 0 }], rooms: [{ name: 'Hall', node: 'hall', floor: 'A', kind: 'k', poly: [[0, 0], [1, 0], [1, 1]] }] };

test('the first pack\'s room plan and the fixture pack\'s validate', () => {
  assert.deepEqual(run('rooms', { file: 'map/data/eden_estate_rooms.json' }), []);
  assert.deepEqual(run('rooms', { file: 'tests/fixtures/pack3d-min/scene/rooms.json' }), []);
  assert.deepEqual(run('rooms', { json: good }), []);
});
test('a room needs name, node, floor, kind and an outline of at least three points; node ids are plain ids', () => {
  for (const f of ['name', 'node', 'floor', 'kind', 'poly']) { const r = { ...good.rooms[0] }; delete r[f]; assert.match(run('rooms', { json: { ...good, rooms: [r] } }).join(), new RegExp(f), f); }
  assert.match(run('rooms', { json: { ...good, rooms: [{ ...good.rooms[0], poly: [[0, 0], [1, 1]] }] } }).join(), /poly/);
  assert.match(run('rooms', { json: { ...good, rooms: [{ ...good.rooms[0], node: 'Not An Id' }] } }).join(), /node/);
  assert.match(run('rooms', { json: { ...good, rooms: [] } }).join(), /rooms/);
});
test('a 3D manifest with a `building.floors` key is rejected by the schema (floor labels live on floors[])', () => {
  assert.match(run('scene3d', { json: { id: 'x', glb: 'a.glb', building: { title: 'T', floors: ['A'] } } }).join(), /building/);
  assert.deepEqual(run('scene3d', { json: { id: 'x', glb: 'a.glb', building: { title: 'T' }, floors: [{ id: 'A', label: 'Ground' }] } }), []);
  assert.deepEqual(run('scene3d', { file: 'tests/fixtures/pack3d-min/scene/manifest.json' }), []);
});
