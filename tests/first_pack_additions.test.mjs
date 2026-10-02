// S8-2 scope additions for the first pack (user, 2026-10-01): (a) the routes layer is on by default again; (b) the estate's barrier was a pack-declared
// area layer until LOOK-1 A8 (D42) removed it — Eden draws no ward edge (docs/upper-setting.md §1). These are the only visible differences of the first pack in this step.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyOverlayLayers } from '../map/core/overlay-v2.mjs';
import { mergeLayers } from '../map/core/layer-spec.mjs';
import { KERNEL_LAYERS } from '../map/core/layer-defaults.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const OV = J('map/packs/eden/overlay.v2.json'), UPPER = J('map/data/tc_upper.json');

test('(a) the routes layer starts on unless the user switched it off (edenMapRoutes "0")', () => {
  const src = fs.readFileSync(ROOT + 'map/app/layer-host.mjs', 'utf8');
  assert.match(src, /const routesOn = storage\.get\('edenMapRoutes'\) !== '0';/);
  assert.doesNotMatch(src, /edenMapRoutes'\) === '1'/);
  const routes = KERNEL_LAYERS.find(l => l.id === 'routes');
  assert.equal(routes.menu.id, 'tgRoutes'); assert.equal(routes.type, 'line');
  assert.ok(UPPER.routes.length > 0 && UPPER.routes.every(r => ['lane', 'patrol', 'patrol_city'].includes(r.kind)), 'the upper tier has routes of the known kinds');
});

test('(b) the first pack declares no layers of its own: the estate ward was removed (LOOK-1 A8 / D42; docs/upper-setting.md §1 — Eden draws no ward edge)', () => {
  const r = applyOverlayLayers(undefined, OV);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.layers, []);
  const merged = mergeLayers(KERNEL_LAYERS, r.layers);
  assert.deepEqual(merged.problems, []); assert.deepEqual(merged.layers.filter(x => x.origin === 'pack'), []);
  assert.equal(merged.layers.length, 21);   // the 19 kernel layers and transit, route-plan (S8-4b); no pack layer any more
  assert.ok(!('layers' in OV), 'the overlay carries no layers block at all');
});

test('the first pack manifest still declares no layers itself; the overlay carries the one row', () => {
  const man = fs.readFileSync(ROOT + 'map/packs/eden/manifest.json', 'utf8');
  assert.equal(man.includes('"layers"'), false); assert.match(man, /"overlay": "packs\/eden\/overlay\.v2\.json"/);
});
