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

test('(b) the first pack declares no pixel layers of its own: the estate ward was removed (LOOK-1 A8 / D42; docs/upper-setting.md §1 — Eden draws no ward edge); since AMBIENT-SOUND it declares only the tier-ambience sound layer', () => {
  const r = applyOverlayLayers(undefined, OV);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.layers.map(l => l.id), ['tier-ambience'], 'the one declared layer is the ambience sound block');
  assert.equal(r.layers[0].type, 'sound', 'no pixels: LOOK-1 A8 still holds for pixel layers');
  const merged = mergeLayers(KERNEL_LAYERS, r.layers);
  assert.deepEqual(merged.problems, []); assert.deepEqual(merged.layers.filter(x => x.origin === 'pack').map(l => l.id), ['tier-ambience']);
  assert.equal(merged.layers.length, 23);   // the 22 kernel layers (S8-1..S8-4b + top-view, OBLIQUE-CODE) plus the pack's tier-ambience
  assert.deepEqual(OV.layers.map(l => l.id), ['tier-ambience'], 'the overlay carries exactly the one ambience row');
});

test('the first pack manifest still declares no layers itself; the overlay carries the one row', () => {
  const man = fs.readFileSync(ROOT + 'map/packs/eden/manifest.json', 'utf8');
  assert.equal(man.includes('"layers"'), false); assert.match(man, /"overlay": "packs\/eden\/overlay\.v2\.json"/);
});
