// S8-2 scope additions for the first pack (user, 2026-10-01): (a) the routes layer is on by default again; (b) the estate's barrier is a pack-declared
// area layer, off by default, styled from the depth `ward` channel. These are the only visible differences of the first pack in this step.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyOverlayLayers } from '../map/core/overlay-v2.mjs';
import { mergeLayers } from '../map/core/layer-spec.mjs';
import { KERNEL_LAYERS } from '../map/core/layer-defaults.mjs';
import { initialVisible, swatchOf } from '../map/core/layer-geometry.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const OV = J('map/packs/eden/overlay.v2.json'), DEPTH = J('map/data/upper_depth.json'), UPPER = J('map/data/tc_upper.json');

test('(a) the routes layer starts on unless the user switched it off (edenMapRoutes "0")', () => {
  const src = fs.readFileSync(ROOT + 'map/app/layer-host.mjs', 'utf8');
  assert.match(src, /const routesOn = storage\.get\('edenMapRoutes'\) !== '0';/);
  assert.doesNotMatch(src, /edenMapRoutes'\) === '1'/);
  const routes = KERNEL_LAYERS.find(l => l.id === 'routes');
  assert.equal(routes.menu.id, 'tgRoutes'); assert.equal(routes.type, 'line');
  assert.ok(UPPER.routes.length > 0 && UPPER.routes.every(r => ['lane', 'patrol', 'patrol_city'].includes(r.kind)), 'the upper tier has routes of the known kinds');
});

test('(b) the first pack declares exactly the estate ward: an area on tc_upper, default off, no problems', () => {
  const r = applyOverlayLayers(undefined, OV);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.layers.map(l => [l.id, l.type, l.slot, l.applies.views]), [['estate_ward', 'area', 'routes', ['tc_upper']]]);
  const l = r.layers[0];
  assert.equal(l.menu.default, false); assert.equal(initialVisible(l, undefined), false); assert.equal(initialVisible(l, '1'), true);
  assert.equal(l.menu.label, '全域结界'); assert.equal(l.menu.i18n.en.label, 'Estate ward');
  assert.equal(l.legend.length, 1);
  const merged = mergeLayers(KERNEL_LAYERS, r.layers);
  assert.deepEqual(merged.problems, []); assert.deepEqual(merged.layers.filter(x => x.origin === 'pack').map(x => x.id), ['estate_ward']);
  assert.equal(merged.layers.length, 22);   // the 19 kernel layers and transit, route-plan (S8-4b) plus the estate ward
});

test('(b) the ward is the island rim grown 5 % and its edge look is the depth ward channel (strength near, cold-light edge)', () => {
  const l = applyOverlayLayers(undefined, OV).layers[0], isl = UPPER.islands.find(i => i.id === 'eden');
  const want = isl.outline.map(([x, y]) => [+(isl.nx + (x - isl.nx) * 1.05).toFixed(4), +(isl.ny + (y - isl.ny) * 1.05).toFixed(4)]);
  assert.deepEqual(l.data.features[0].pts, want);
  assert.equal(l.data.features[0].view, 'tc_upper');
  assert.equal(l.style.opacity, DEPTH.channels.ward.near, 'the ward channel strength at the near plane');
  assert.equal(l.style.color, '#8ce6ff', 'the cold-light edge colour of the existing barriers ring');
  assert.deepEqual(swatchOf(l), { shape: 'fill', color: '#8ce6ff', dash: null });
});

test('the first pack manifest still declares no layers itself; the overlay carries the one row', () => {
  const man = fs.readFileSync(ROOT + 'map/packs/eden/manifest.json', 'utf8');
  assert.equal(man.includes('"layers"'), false); assert.match(man, /"overlay": "packs\/eden\/overlay\.v2\.json"/);
});
