// The node runtime of a schema-2 pack in the viewer (docs/kernel-schema.md K-R96): same reads as the schema-1 runtime, from the pack's own tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveBlocks, validate2, withDefaults } from '../map/core/pack-v2.mjs';
import { projectV2 } from '../map/core/pack-v2-view.mjs';
import { makeRuntimeV2 } from '../map/app/nodes-runtime-v2.mjs';

const dir = fileURLToPath(new URL('../map/packs/minimal/', import.meta.url));
const get = async p => JSON.parse(readFileSync(dir + p, 'utf8'));
async function pack(noViews) {
  const { manifest } = await resolveBlocks(await get('manifest.json'), get);
  if (noViews) delete manifest.views;
  return withDefaults(validate2(manifest, { trusted: true }).pack);
}
const open = async noViews => { const P = await pack(noViews); return makeRuntimeV2(P, projectV2(P, { base: 'packs/minimal/' }).registry); };

test('the minimal pack: one map, its own host, no parent, no level switcher', async () => {
  const R = await open(false);
  assert.deepEqual(R.crumbs('harrow'), ['harrow']); assert.equal(R.parent('harrow'), null); assert.deepEqual(R.children('harrow'), []);
  assert.deepEqual(R.levels('harrow'), []); assert.equal(R.host('harrow'), 'harrow'); assert.equal(R.kind('harrow'), 'schematic'); assert.equal(R.isScene('harrow'), false);
  assert.equal(R.has('harrow'), true); assert.equal(R.has('inn'), false); assert.deepEqual(R.strip('harrow'), []);
  assert.equal(R.standIn('harrow'), null); assert.deepEqual(R.zoneChildren('harrow'), {}); assert.equal(R.anchorIn('harrow'), null);
});
test('implicit views: crumbs, parent, children and the level switcher follow the tree of maps', async () => {
  const R = await open(true);
  assert.deepEqual(R.crumbs('docks'), ['harrow', 'brindle', 'docks']); assert.equal(R.parent('docks'), 'brindle'); assert.deepEqual(R.ancestors('docks'), ['brindle', 'harrow']);
  assert.deepEqual(R.children('harrow'), ['brindle']); assert.deepEqual(R.children('brindle'), ['docks']);
  assert.deepEqual(R.levels('docks'), []);   // docks is the only sibling with a map: fewer than two levels
});
test('geo() places "heading to the inn" on the inn', async () => {
  const R = await open(false), g = R.geo();
  assert.equal(g.place('heading to the inn')?.node, 'inn');
  assert.equal(g.tree, R.tree);
});
