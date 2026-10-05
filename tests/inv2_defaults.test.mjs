// INV-2 (D31 / D33): the inventory's "default off" and "pause" rows and the U-13 wheel default.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEYS, known } from '../map/core/storage.mjs';
import { PARKED, PARK_PREFIX, parkedOn } from '../map/core/parked.mjs';
import { initialVisible } from '../map/core/layer-geometry.mjs';
import { wheelAction } from '../map/ui/camera-controls.js';

const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const store = o => ({ localStorage: { getItem: k => (k in o ? o[k] : null) } });

test('default-off table: every switch the inventory marks "default off" has default 0 (or off)', () => {
  for (const k of ['edenMapMacros', 'edenMapDice', 'edenMapLedgerWrite', 'edenMapSpatial', 'edenMapWbJit', 'edenMapWbXtal', 'edenMapNav', 'edenMapNavConsent', 'edenMapTurnIds']) {
    assert.ok(k in KEYS && (KEYS[k].def === '0' || KEYS[k].def === undefined), k);
  }
  for (const k of ['edenMapDice', 'edenMapMacros', 'edenMapSpatial', 'edenMapWbJit', 'edenMapWbXtal', 'edenMapNav', 'edenMapTurnIds']) assert.equal(KEYS[k].def ?? '0', '0', k);
});
test('layers: traffic, vision, nav-ops and local-props start hidden; a stored 1 shows them', () => {
  for (const f of ['traffic-view', 'vision-view', 'nav-ops-view', 'local-props-view']) {
    const s = rd('map/app/' + f + '.mjs');
    assert.match(s, /layerStore\(\)(\.\w+|\[ID\]) === '1'/, f);
    assert.doesNotMatch(s, /initialVisible: true/, f);
  }
  assert.match(rd('map/app/traffic-view.mjs'), /isVisible\('traffic'\)/); assert.match(rd('map/app/vision-view.mjs'), /showCv\(registry\.isVisible\('vision'\)\)/);   // a hidden layer does not run on mount
  assert.match(rd('map/app/traffic-view.mjs'), /saveVisible\('traffic'/); assert.match(rd('map/app/vision-view.mjs'), /saveVisible\('vision'/);
});
test('parked features: registered prefix key, absent unless an explicit stored 1', () => {
  assert.equal(known(PARK_PREFIX + 'scrap'), true);
  assert.deepEqual([...PARKED].sort(), ['imagegen', 'scrap', 'stash3d', 'tabledb', 'xtal']);
  for (const id of PARKED) {
    assert.equal(parkedOn(id, store({})), false, id + ' unset');
    assert.equal(parkedOn(id, store({ [PARK_PREFIX + id]: '0' })), false, id + ' 0');
    assert.equal(parkedOn(id, store({ [PARK_PREFIX + id]: '1' })), true, id + ' 1');
  }
});
test('parked features are gated at their entry points', () => {
  assert.match(rd('map/scrapbook-view.mjs'), /if \(parkedOn\('scrap'\)\) register\('ScrapbookView'/);
  assert.match(rd('map/estate/main.js'), /LS\('edenMapOn:stash3d'\) === '1'/);
  assert.equal(initialVisible({ type: 'sound' }, undefined), false, 'a pack-declared sound layer stays off until ticked');
  assert.match(rd('map/app/ai-cards.mjs'), /parked: 'xtal'/); assert.match(rd('map/app/ai-cards.mjs'), /liveDefs\(\)/);
  assert.match(rd('map/tavern/mvu-bridge.mjs'), /parkedOn\('tabledb'\)/);
  assert.match(rd('map/tavern/imagegen-bridge.mjs'), /parkedOn\('imagegen'\)/);
});
test('the imagegen bridge reports unavailable while parked, available with the stored 1', async () => {
  const prev = globalThis.localStorage; globalThis.STBaiBaiImage = { apiVersion: 1 };
  const B = await import('../map/tavern/imagegen-bridge.mjs');
  try {
    globalThis.localStorage = store({}).localStorage; assert.equal(B.available(), false);
    globalThis.localStorage = store({ [PARK_PREFIX + 'imagegen']: '1' }).localStorage; assert.equal(B.available(), true);
  } finally { globalThis.localStorage = prev; delete globalThis.STBaiBaiImage; }
});
test('U-13: wheel zoom is on by default; unset = zoom, 0 = pan; every reader agrees', () => {
  assert.equal(KEYS.edenMap3dWheelZoom.def, '1');
  const E = o => ({ ctrlKey: false, altKey: false, shiftKey: false, ...o });
  assert.equal(wheelAction(E()), 'zoom'); assert.equal(wheelAction(E(), true), 'zoom'); assert.equal(wheelAction(E(), false), 'pan');
  assert.equal(wheelAction(E({ ctrlKey: true }), false), 'pinch'); assert.equal(wheelAction(E({ altKey: true }), true), 'rotate');
  assert.match(rd('map/estate/main.js'), /CAM\.wheelZoom = LS\('edenMap3dWheelZoom'\) !== '0'/); assert.match(rd('map/estate/main.js'), /wheelZoom: true/);
  assert.match(rd('map/props/viewer3d.html'), /CAM\.wheelZoom = LSg\('edenMap3dWheelZoom'\) !== '0'/);
  assert.match(rd('map/app/subpage3d-host.mjs'), /get\('edenMap3dWheelZoom'\) !== '0'/);
  assert.match(rd('map/app/settings-wire.mjs'), /'#opt3dWheel', 'edenMap3dWheelZoom', true/);
  assert.doesNotMatch(rd('map/estate/main.js') + rd('map/props/viewer3d.html'), /3dWheelZoom'\) === '1'/);
});
