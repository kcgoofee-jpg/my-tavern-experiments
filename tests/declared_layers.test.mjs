// S8-2: the pure parts of the declared-layer host: features per source (declared-sources.mjs, on stub state), the kind filter, the first visibility rule,
// the legend rows of a fixture pack, and that the first pack yields no declared layer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initialVisible, legendRowsOf, cssToRgb } from '../map/core/layer-geometry.mjs';
import { mergeLayers } from '../map/core/layer-spec.mjs';
import { KERNEL_LAYERS } from '../map/core/layer-defaults.mjs';
import { makeRuntime } from '../map/app/nodes-runtime.mjs';

const S = (() => { const f = function () {}; const p = new Proxy(f, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : p, apply: () => p, construct: () => p, set: () => true, has: () => true }); return p; })();
const keep = {};
for (const k of ['window', 'document', 'navigator', 'location', 'matchMedia', 'addEventListener', 'removeEventListener', 'OpenSeadragon', 'LocalStore', 'self', 'getComputedStyle', 'MutationObserver', 'ResizeObserver', 'localStorage', 'sessionStorage', 'IntersectionObserver']) keep[k] = Object.getOwnPropertyDescriptor(globalThis, k);
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
for (const k of Object.keys(keep)) set(k, S);
set('window', new Proxy({}, { get: (t, k) => (k in t ? t[k] : S), set: (t, k, v) => { t[k] = v; return true; } }));
const state = await import('../map/app/state.mjs');
const { viewFeatures, sourceFeatures } = await import('../map/app/declared-sources.mjs');
for (const [k, d] of Object.entries(keep)) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k];

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const open = (id, data) => { state.setCurrentMapId(id); state.setCurrentMapData(data); };
const L = (o = {}) => ({ id: 'x', type: 'point', slot: 'markers', source: 'inline', ...o });

test('inline source: only the features of the open view, with the kind filter', () => {
  const layer = L({ data: { features: [{ view: 'a', at: [0.1, 0.2], kind: 'k1' }, { view: 'b', at: [0.3, 0.4], kind: 'k1' }, { view: 'a', at: [0.5, 0.6], kind: 'k2' }] } });
  open('a', null);
  assert.equal(viewFeatures(layer).length, 2);
  assert.deepEqual(viewFeatures({ ...layer, filter: { kinds: ['k2'] } }).map(f => f.at), [[0.5, 0.6]]);
  open('b', null); assert.equal(viewFeatures(layer).length, 1);
  open(null, null); assert.deepEqual(viewFeatures(layer), []);
});

test('view sources read the open view data: routes become lines (closed rule), markers become points (anchor first)', () => {
  open('v', { routes: [{ kind: 'patrol', from: 'a', to: 'a', pts: [[0, 0], [1, 1], [0, 0]] }, { kind: 'lane', pts: [[0, 0], [1, 0]] }, { pts: [[0.1, 0.1]] }], markers: [{ id: 'm1', nx: 0.1, ny: 0.2, ax: 0.3, ay: 0.4 }, { id: 'm2', nx: 0.5, ny: 0.6 }] });
  const lines = viewFeatures(L({ type: 'line', source: 'view:routes', data: undefined }));
  assert.deepEqual(lines.map(f => [f.kind, f.closed, f.view]), [['patrol', true, 'v'], ['lane', false, 'v']]);
  assert.deepEqual(viewFeatures(L({ type: 'line', source: 'view:routes', filter: { kinds: ['lane'] } })).length, 1);
  assert.deepEqual(viewFeatures(L({ source: 'view:markers' })).map(f => f.at), [[0.3, 0.4], [0.5, 0.6]]);
  open('v', {}); assert.deepEqual(viewFeatures(L({ source: 'view:routes' })), []);
});

test('node features need a position; host-fed and entity sources with nothing held give no features; unknown kinds are skipped quietly', () => {
  open('a', { markers: [] });
  assert.deepEqual(viewFeatures(L({ data: { features: [{ node: 'nowhere' }] } })), [], 'a node that is not drawn here is dropped');
  for (const source of ['mvu:eden.x', 'ops', 'events', 'people', 'items', 'routine', 'file:nothing.json']) assert.deepEqual(sourceFeatures(L({ source })), [], source);
  assert.deepEqual(sourceFeatures(L({ source: 'nonsense' })), []);
});

test('the first visibility of a declared layer (L-07, L-08)', () => {
  assert.equal(initialVisible({ type: 'point' }, undefined), true, 'on by default');
  assert.equal(initialVisible({ type: 'point', menu: { default: false } }, undefined), false);
  assert.equal(initialVisible({ type: 'point', menu: { default: false } }, '1'), true, 'the stored choice wins');
  assert.equal(initialVisible({ type: 'flow' }, '0'), false);
  assert.equal(initialVisible({ type: 'sound' }, undefined), false, 'sound is off until switched on');
  assert.equal(initialVisible({ type: 'sound', menu: { default: true } }, undefined), false);
  assert.equal(initialVisible({ type: 'sound' }, '1'), true);
});

test('legend rows for a fixture pack: heading = the menu label in the UI language, one swatch per row from the style', () => {
  const recs = [
    { id: 'patrol', type: 'flow', style: { color: '#9ad0f5', path: { dash: [10, 4] } }, menu: { label: '巡逻', i18n: { en: { label: 'Patrol' } } }, legend: [{ label: '线', desc: 'd', i18n: { en: { label: 'Line', desc: 'dd' } } }] },
    { id: 'nolegend', type: 'point', menu: { label: 'n' } },
    { id: 'zone', type: 'area', style: { color: '--alert', fill: '#112233', by: { hot: { color: '#ff0000' } } }, menu: { label: '区' }, legend: [{ label: 'a' }, { label: 'b', kind: 'hot' }] },
  ];
  const zh = legendRowsOf(recs, 'zh'), en = legendRowsOf(recs, 'en');
  assert.deepEqual(zh.map(g => [g.id, g.heading, g.rows.length]), [['patrol', '巡逻', 1], ['zone', '区', 2]]);
  assert.equal(en[0].heading, 'Patrol'); assert.equal(en[0].rows[0].label, 'Line'); assert.equal(en[0].rows[0].desc, 'dd');
  assert.equal(zh[1].heading, '区', 'no translation: the plain label');
  assert.deepEqual(zh[0].rows[0].swatch, { shape: 'stroke', color: '#9ad0f5', dash: null });
  assert.deepEqual(zh[1].rows.map(r => [r.swatch.shape, r.swatch.color]), [['fill', '#112233'], ['fill', '#112233']]);
  assert.deepEqual(legendRowsOf([], 'zh'), []); assert.deepEqual(legendRowsOf(null), []);
});

test('cssToRgb reads a resolved token value', () => {
  assert.equal(cssToRgb('#ff5a5a'), '255,90,90'); assert.equal(cssToRgb(' rgb(1, 2, 3) '), '1,2,3'); assert.equal(cssToRgb('rgba(9 8 7 / .5)'), '9,8,7');
  assert.equal(cssToRgb('rgb(300, 1, 1)'), null); assert.equal(cssToRgb('red'), null); assert.equal(cssToRgb(null), null);
});

test('the kernel list alone yields no declared layer; the first pack declares exactly one (the estate ward); the town yields two', () => {
  const EDEN = { manifest: J('map/packs/eden/manifest.json'), maps: J('map/data/maps.json'), world: J('map/data/world_markers.json'), names: J('map/packs/eden/names.en.json'), plan: J('map/data/eden_estate_rooms.json') };
  const none = mergeLayers(KERNEL_LAYERS, makeRuntime(EDEN).layers);
  assert.deepEqual(none.layers.filter(l => l.origin !== 'kernel'), []);
  assert.equal(none.layers.length, 19);   // the 17 of S8-1 and nav-ops, local-props (S8-3)
  const first = mergeLayers(KERNEL_LAYERS, makeRuntime({ ...EDEN, overlay: J('map/packs/eden/overlay.v2.json') }).layers);
  assert.deepEqual(first.layers.filter(l => l.origin === 'pack').map(l => l.id), ['estate_ward']);
  const TOWN = { manifest: J('map/packs/town/manifest.json'), maps: J('map/packs/town/maps.json'), events: J('map/packs/town/events.json'), overlay: J('map/packs/town/overlay.v2.json') };
  const town = mergeLayers(KERNEL_LAYERS, makeRuntime(TOWN).layers);
  assert.deepEqual(town.layers.filter(l => l.origin === 'pack').map(l => l.id), ['patrol', 'danger']);
  const flat = JSON.stringify(fs.readdirSync(ROOT + 'map/app').filter(f => /^(block-|declared-)/.test(f)).map(f => fs.readFileSync(ROOT + 'map/app/' + f, 'utf8')));
  assert.ok(!/patrol|danger|estate_ward/.test(flat), 'no engine file names any pack layer');
});
