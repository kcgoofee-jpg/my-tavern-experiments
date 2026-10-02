// The S4-3 one-off generator is retired (the pack data is hand-maintained): --write is refused and touches nothing; check mode only reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GEN = fileURLToPath(new URL('../tools/gen_eden_s43_data.mjs', import.meta.url));
const FILES = ['map/packs/eden/overlay.v2.json', 'map/packs/eden/manifest.json', 'map/data/maps.json', 'map/data/world_markers.json'].map(p => fileURLToPath(new URL('../' + p, import.meta.url)));
const snap = () => FILES.map(f => fs.readFileSync(f, 'utf8'));

test('generator: --write is refused and no pack file changes', () => {
  const before = snap(), r = spawnSync(process.execPath, [GEN, '--write'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /retired/); assert.deepEqual(snap(), before);
});
test('generator: check mode only reads (writes nothing, reports each file)', () => {
  const before = snap(), r = spawnSync(process.execPath, [GEN], { encoding: 'utf8' });
  assert.equal(r.status, 0); assert.equal((r.stdout.match(/^(same|differs) /gm) || []).length, 4); assert.deepEqual(snap(), before);
});
