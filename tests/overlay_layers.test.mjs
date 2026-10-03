// S8-1: declared layers in the runtime (K-R85): the overlay of a schema-1 pack may carry `layers`; the runtime exposes them raw (merging with the
// kernel list happens at boot, app/layer-host.mjs applyPackLayers); the first pack declares none.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyOverlayLayers, applyOverlay } from '../map/core/overlay-v2.mjs';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { mergeLayers } from '../map/core/layer-spec.mjs';
import { KERNEL_LAYERS } from '../map/core/layer-defaults.mjs';
import { makeRuntime } from '../map/app/nodes-runtime.mjs';
import { makeRuntimeV2 } from '../map/app/nodes-runtime-v2.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const TOWN = { manifest: J('map/packs/town/manifest.json'), maps: J('map/packs/town/maps.json'), events: J('map/packs/town/events.json') };
const EDEN = { manifest: J('map/packs/eden/manifest.json'), maps: J('map/data/maps.json'), world: J('map/data/world_markers.json'), names: J('map/packs/eden/names.en.json'), plan: J('map/data/eden_estate_rooms.json') };
const ROW = { id: 'patrol', type: 'flow', slot: 'routes', source: 'inline', applies: { views: ['town_hill'] }, data: { features: [{ view: 'town_hill', pts: [[0.1, 0.1], [0.5, 0.5]] }] }, menu: { label: 'Patrol' } };
const codes = ps => ps.map(p => p.reason || p.code);

test('a valid row is kept (healed, no origin stamp); no overlay or no layers -> none', () => {
  const r = applyOverlayLayers(undefined, { schema: 2, layers: [ROW] });
  assert.deepEqual(r.problems, []);
  assert.equal(r.layers.length, 1); assert.equal(r.layers[0].id, 'patrol'); assert.equal(r.layers[0].origin, undefined);
  assert.deepEqual(applyOverlayLayers(undefined, null), { layers: [], problems: [] });
  assert.deepEqual(applyOverlayLayers(undefined, { schema: 2, nodes: [] }), { layers: [], problems: [] });
});

test('a kernel row keeps only menu / applies / legend / off; bad rows are listed, the rest applies', () => {
  const r = applyOverlayLayers(undefined, { schema: 2, layers: [{ id: 'routes', type: 'point', slot: 'fx', style: { color: '#ffffff' }, menu: { label: 'Lanes' } }, { id: 'broken', type: 'point' }, 'junk', ROW, { ...ROW, menu: { label: 'dup' } }] });
  assert.deepEqual(r.layers.map(l => l.id), ['routes', 'patrol'], 'a repeated id: the overlay\'s last row wins by id');
  assert.deepEqual(Object.keys(r.layers[0]).sort(), ['id', 'menu']);
  assert.deepEqual(codes(r.problems), ['layer-kernel-fixed', 'layer-incomplete', 'layer-type']);
  assert.ok(r.problems.every(p => p.code === 'overlay-layer-invalid'));
  assert.deepEqual(codes(applyOverlayLayers(undefined, { layers: 'x' }).problems), ['type']);
});

test('converted rows are replaced by id, new ids appended', () => {
  const r = applyOverlayLayers([{ id: 'a', type: 'tint', slot: 'fx', source: 'inline' }, { id: 'patrol', type: 'tint', slot: 'fx', source: 'inline' }], { layers: [ROW] });
  assert.deepEqual(r.layers.map(l => [l.id, l.type]), [['a', 'tint'], ['patrol', 'flow']]);
});

test('the overlay may hold layers alone (applyOverlay accepts it) and compat-v1 sets pack.layers', () => {
  assert.deepEqual(applyOverlay([], { schema: 2, layers: [ROW] }).problems, []);
  const withOv = fromV1({ ...TOWN, overlay: { schema: 2, layers: [ROW] } });
  assert.equal(withOv.pack.layers.length, 1); assert.equal(withOv.pack.layers[0].id, 'patrol');
  assert.equal(fromV1(TOWN).pack.layers, undefined, 'no overlay rows -> no layers key');
  assert.deepEqual(withOv.problems, []);
});

test('runtime: the first pack and the town (no overlay layers) expose []; a schema-1 pack with overlay layers exposes them raw', () => {
  assert.deepEqual(makeRuntime(EDEN).layers, []);
  assert.deepEqual(makeRuntime(TOWN).layers, []);
  const rt = makeRuntime({ ...TOWN, overlay: { schema: 2, layers: [ROW] } });
  assert.equal(rt.layers.length, 1);
  const merged = mergeLayers(KERNEL_LAYERS, rt.layers);
  assert.equal(merged.layers.length, 23); assert.equal(merged.layers.at(-1).menu.order, 1000, 'a new layer follows the kernel rows');   // 22 kernel rows (incl. top-view, OBLIQUE-CODE) + 1 pack row
});

test('runtime of a schema-2 pack exposes the pack layers (S9-1 runtime)', () => {
  const pack = { id: 'p', schema: 2, title: 'P', nodes: [{ id: 'a', name: 'A' }], layers: [ROW] };
  assert.equal(makeRuntimeV2(pack, { maps: {} }).layers.length, 1);
  assert.deepEqual(makeRuntimeV2({ id: 'p', schema: 2, title: 'P', nodes: [{ id: 'a', name: 'A' }] }, { maps: {} }).layers, []);
});

test('the shipped overlays and manifests declare no layer problems (first pack and town)', () => {
  assert.equal(readFileSync(ROOT + 'map/packs/eden/manifest.json', 'utf8').includes('"layers"'), false, 'the first pack declares none');
});

test('S8-2 / S8-3: the town overlay declares three layers (patrol, danger, and the harbour sound layer of S8-3), no problems; the runtime and the merged list carry them', () => {
  const ov = J('map/packs/town/overlay.v2.json');
  assert.equal(J('map/packs/town/manifest.json').data.overlay, 'overlay.v2.json');
  const r = applyOverlayLayers(undefined, ov);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.layers.map(l => [l.id, l.type, l.slot]), [['patrol', 'flow', 'routes'], ['danger', 'area', 'routes'], ['harbour-sound', 'sound', 'fx']]);
  const rt = makeRuntime({ ...TOWN, overlay: ov });
  const merged = mergeLayers(KERNEL_LAYERS, rt.layers);
  assert.deepEqual(merged.problems, []);
  assert.deepEqual(merged.layers.filter(l => l.origin === 'pack').map(l => l.id), ['patrol', 'danger', 'harbour-sound']);
  const shipped = JSON.stringify(ov);
  assert.ok(!/"mvu:|"ops"/.test(shipped), 'no host-fed source in the shipped example');   // S8-3: the `sound` block is used once (harbour-sound)
  assert.equal((shipped.match(/"type":"sound"/g) || []).length, 1);
});
