// S7-3 T1: the fixture pack pack3d-min (tests/fixtures/pack3d-min): one tiny GLB written by a node script, a 3D manifest with two floors and no building words, three rooms.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate2 } from '../map/core/pack-v2.mjs';
import { buildTree } from '../map/core/nodes.mjs';

const DIR = fileURLToPath(new URL('./fixtures/pack3d-min/', import.meta.url)), rd = p => JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8'));

test('the committed GLB is what the generator writes (two slabs, three room boxes, valid header and chunks)', () => {
  const glb = fs.readFileSync(path.join(DIR, 'scene/scene.glb'));
  assert.equal(glb.readUInt32LE(0), 0x46546c67); assert.equal(glb.readUInt32LE(4), 2); assert.equal(glb.readUInt32LE(8), glb.length); assert.ok(glb.length < 16 * 1024);
  const jl = glb.readUInt32LE(12), json = JSON.parse(glb.subarray(20, 20 + jl).toString());
  assert.deepEqual(json.nodes.map(n => n.name), ['slab_L1', 'slab_L2', 'room_atrium', 'room_workshop', 'room_loft']);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p3d-')), out = path.join(tmp, 'scene.glb'), r = spawnSync('node', [path.join(DIR, 'build_glb.mjs'), out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.deepEqual(fs.readFileSync(out), glb, 'the generator writes exactly the committed file'); fs.rmSync(tmp, { recursive: true });
});
test('the pack validates as schema 2, has a 3D view over three room nodes, and the plan links every room to a node', () => {
  const v = validate2(rd('manifest.json'), { trusted: true }); assert.deepEqual(v.problems, []);
  const tree = buildTree(v.pack.nodes), plan = rd('scene/rooms.json');
  assert.equal(v.pack.views.hall3d.kind, 'model3d'); assert.deepEqual(tree.children('hall'), ['atrium', 'workshop', 'loft']);
  assert.equal(plan.rooms.length, 3); for (const r of plan.rooms) { assert.ok(tree.has(r.node), r.node); assert.equal(tree.get(r.node).name, r.name); assert.equal(tree.parent(r.node), 'hall'); }
  assert.deepEqual(rd('scene/manifest.json').floors, plan.floors.map(f => f.id));
});
test('no word of the first pack is in the fixture', () => {
  const text = ['manifest.json', 'scene/manifest.json', 'scene/rooms.json'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
  for (const w of ['伊甸', '庄园', 'eden', 'Eden', 'estate', '天城', 'tiancheng']) assert.ok(!text.includes(w), w);
});
