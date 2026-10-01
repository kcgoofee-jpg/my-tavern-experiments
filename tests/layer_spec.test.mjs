// S8-1: core/layer-spec.mjs (K-R79, K-R81, K-R82): sources, features, layers, merge with the kernel list, applies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSource, normFeature, normLayer, normStyle, mergeLayers, appliesTo, BLOCKS, LIMITS, SLOTS, layersBlock } from '../map/core/layer-spec.mjs';
import { KERNEL_LAYERS } from '../map/core/layer-defaults.mjs';

const codes = ps => ps.map(p => p.code);

test('constants: 8 blocks, the ten slots, the limits of the design', () => {
  assert.deepEqual([...BLOCKS], ['point', 'area', 'line', 'label', 'tint', 'particles', 'flow', 'sound']);
  assert.equal(SLOTS.length, 10);
  assert.deepEqual({ ...LIMITS }, { layers: 32, features: 1000, points: 2000, legend: 8, by: 16, mvu: 8, fileBytes: 262144, local: 16 });
});

test('parseSource table', () => {
  const t = [['inline', { kind: 'inline' }], ['events', { kind: 'events' }], ['people', { kind: 'people' }], ['items', { kind: 'items' }], ['routine', { kind: 'routine' }], ['ops', { kind: 'ops' }], ['kernel', { kind: 'kernel' }],
    ['view:routes', { kind: 'view', arg: 'routes' }], ['view:markers', { kind: 'view', arg: 'markers' }], ['file:data/a.json', { kind: 'file', arg: 'data/a.json' }], ['mvu:stat.x', { kind: 'mvu', arg: 'stat.x' }],
    ['view:other', null], ['file:../a.json', null], ['file:a.txt', null], ['mvu:', null], ['nope', null], ['', null], [7, null], [undefined, null]];
  for (const [s, want] of t) assert.deepEqual(parseSource(s), want, String(s));
});

test('normFeature: geometry per block, 0..1 bounds, ids, labels', () => {
  const p = [];
  assert.deepEqual(normFeature({ view: 'v', at: [0.5, 0.25], kind: 'a-b', label: 'x' }, 'point', { problems: p }), { view: 'v', at: [0.5, 0.25], kind: 'a-b', label: 'x' });
  assert.equal(normFeature({ view: 'v', at: [1.2, 0.5] }, 'point', { problems: p }), null);
  assert.equal(normFeature({ view: 'v', at: [0.5] }, 'point', { problems: p }), null);
  assert.equal(normFeature({ at: [0.5, 0.5] }, 'point', { problems: p }), null);
  assert.ok(codes(p).includes('feature-at') && codes(p).includes('feature-no-view') && codes(p).includes('feature-geometry'));
  assert.deepEqual(normFeature({ node: 'inn' }, 'label'), { node: 'inn' }, 'a node needs no view');
  assert.equal(normFeature({ at: [0.1, 0.1] }, 'point', { view: 'v' }).view, 'v', 'the layer view is the default');
  assert.ok(normFeature({ view: 'v', pts: [[0, 0], [1, 1]] }, 'line'));
  assert.equal(normFeature({ view: 'v', pts: [[0, 0]] }, 'line'), null, 'a line needs two points');
  assert.equal(normFeature({ view: 'v', pts: [[0, 0], [1, 1]] }, 'area'), null, 'an area needs three points or a circle');
  assert.ok(normFeature({ view: 'v', at: [0.5, 0.5], r: 0.1 }, 'area'));
  assert.equal(normFeature({ view: 'v', pts: Array.from({ length: 2001 }, () => [0, 0]) }, 'line').pts.length, 2000, 'points are capped');
  assert.equal(normFeature({ view: 'Bad id', at: [0, 0] }, 'point'), null);
  assert.equal(normFeature({ view: 'v', at: [0, 0], label: 'x'.repeat(61) }, 'point').label, undefined, 'a long label is dropped');
  assert.deepEqual(normFeature({ view: 'v', at: [0, 0], i18n: { en: { label: 'A' }, 'bad lang': { label: 'B' } } }, 'point').i18n, { en: { label: 'A' } });
  assert.equal(normFeature('x', 'point'), null);
});

test('normStyle: colours, clamps, unknown keys, local-only icons', () => {
  const p = [];
  assert.deepEqual(normStyle({ color: '#9ad0f5', width: 99, opacity: -1, speed: 0.07, density: 200.4, dash: [10, 4, 50], halo: true, size: 2, path: { color: '--accent', width: 1.4, speed: 3 } }, 'flow', {}, p),
    { color: '#9ad0f5', width: 8, opacity: 0, speed: 0.07, density: 64, dash: [10, 4, 40], halo: true, size: 2, path: { color: '--accent', width: 1.4 } });
  assert.ok(codes(p).includes('style-unknown'));
  assert.deepEqual(normStyle({ color: '#12345678' }, 'point'), { color: '#12345678' });
  assert.deepEqual(normStyle({ color: 'red' }, 'point'), {}, 'a named css colour is not a token');
  assert.deepEqual(normStyle({ color: 'url(x)' }, 'point'), {});
  assert.deepEqual(normStyle({ size: 100 }, 'point'), { size: 32 });
  assert.deepEqual(normStyle({ size: 'small' }, 'label'), { size: 'small' });
  assert.deepEqual(normStyle({ size: 'huge' }, 'label'), {});
  assert.deepEqual(normStyle({ icon: 'prop:abc' }, 'point', {}), {}, 'prop icons are for local layers only');
  assert.deepEqual(normStyle({ icon: 'prop:abc' }, 'point', { local: true }), { icon: 'prop:abc' });
  assert.deepEqual(normStyle({ icon: 'pin' }, 'point'), { icon: 'pin' });
  assert.deepEqual(normStyle({ by: { a: { color: '#aaaaaa', by: {} }, 'B!': { color: '#bbbbbb' } } }, 'point'), { by: { a: { color: '#aaaaaa' } } });
  assert.deepEqual(normStyle({ preset: 'hail' }, 'particles'), {});
});

const GOOD = { id: 'patrol', type: 'flow', slot: 'routes', source: 'inline', applies: { views: ['v1'] }, style: { color: '#9ad0f5' },
  data: { features: [{ closed: true, pts: [[0.1, 0.1], [0.5, 0.5], [0.1, 0.1]] }, { view: 'v1', at: [2, 2] }] }, menu: { label: 'Patrol', order: 3 }, legend: [{ label: 'Patrol' }] };

test('normLayer: a new layer is kept, healed and stamped', () => {
  const { layer, problems } = normLayer(GOOD);
  assert.equal(layer.origin, 'pack');
  assert.equal(layer.data.features.length, 1, 'the layer\'s single view is the default; the bad feature is dropped');
  assert.equal(layer.data.features[0].view, 'v1');
  assert.deepEqual(layer.menu, { label: 'Patrol', order: 3 });
  assert.ok(codes(problems).includes('feature-geometry') || codes(problems).includes('feature-at'));
});

test('normLayer: incomplete, bad id, bad source, kernel source refused', () => {
  assert.equal(normLayer({ id: 'x', type: 'point' }).layer, null);
  assert.deepEqual(codes(normLayer({ id: 'x', type: 'point' }).problems), ['layer-incomplete']);
  assert.deepEqual(codes(normLayer({ id: 'X!' }).problems), ['layer-id']);
  assert.deepEqual(codes(normLayer({ id: 'x', type: 'point', slot: 'markers', source: 'kernel' }).problems), ['layer-source']);
  assert.deepEqual(codes(normLayer({ id: 'x', type: 'point', slot: 'markers', source: 'view:nope' }).problems), ['layer-source']);
  assert.deepEqual(codes(normLayer({ id: 'x', type: 'bogus', slot: 'markers', source: 'events' }).problems), ['layer-incomplete']);
  assert.deepEqual(codes(normLayer({ id: 'x', type: 'point', slot: 'bogus', source: 'events' }).problems), ['layer-incomplete']);
  assert.deepEqual(codes(normLayer(7).problems), ['layer-type']);
  assert.ok(normLayer({ id: 'x', type: 'point', slot: 'markers', source: 'events', zzz: 1, 'x-y': 1 }).problems.some(p => p.code === 'unknown-key' && p.key === 'zzz'));
});

test('normLayer: a kernel row keeps only menu / applies / legend / off', () => {
  const { layer, problems } = normLayer({ id: 'routes', type: 'point', slot: 'fx', style: { color: '#ffffff' }, menu: { order: 5 }, applies: { views: ['a'] }, legend: [{ label: 'L' }], off: true });
  assert.deepEqual(Object.keys(layer).sort(), ['applies', 'id', 'legend', 'menu', 'off', 'origin']);
  assert.equal(layer.origin, 'kernel');
  assert.deepEqual(layer.menu, { order: 5 }, 'a kernel row may adjust the menu without a label');
  assert.deepEqual(codes(problems), ['layer-kernel-fixed']);
  assert.equal(normLayer({ id: 'x', type: 'point', slot: 'markers', source: 'events', menu: { order: 5 } }).layer.menu, undefined, 'a new layer\'s menu needs a label');
});

test('normLayer: local trust (prefix, sources)', () => {
  const base = { type: 'point', slot: 'markers', data: { features: [{ view: 'v', at: [0.1, 0.1] }] } };
  assert.ok(normLayer({ id: 'local-a', ...base }, { trust: 'local' }).layer);
  assert.equal(normLayer({ id: 'local-a', ...base }, { trust: 'local' }).layer.origin, 'local');
  assert.deepEqual(codes(normLayer({ id: 'a', ...base }, { trust: 'local' }).problems), ['local-id']);
  for (const source of ['file:a.json', 'mvu:x', 'ops']) assert.deepEqual(codes(normLayer({ id: 'local-a', type: 'point', slot: 'markers', source }, { trust: 'local' }).problems), ['local-source'], source);
  for (const source of ['events', 'people', 'items', 'routine', 'view:routes', 'view:markers', 'inline']) assert.ok(normLayer({ id: 'local-a', type: 'point', slot: 'markers', source }, { trust: 'local' }).layer, source);
  assert.ok(normLayer({ id: 'a', type: 'point', slot: 'markers', source: 'file:a.json' }).layer, 'a pack may use file sources');
});

test('mergeLayers: kernel list order kept, adjustments, new layers after in array order, duplicates, caps', () => {
  const none = mergeLayers(KERNEL_LAYERS, []);
  assert.deepEqual(none.layers.map(l => l.id), KERNEL_LAYERS.map(l => l.id));
  assert.ok(none.layers.every(l => l.origin === 'kernel' && !l.adjust), 'a pack with no rows changes nothing');
  assert.deepEqual(none.layers[2].menu, KERNEL_LAYERS[2].menu);
  const r = mergeLayers(KERNEL_LAYERS, [
    { id: 'routes', menu: { label: 'Lanes', order: 5 }, off: true },
    { id: 'new1', type: 'tint', slot: 'fx', source: 'inline', menu: { label: 'N1' } },
    { id: 'new2', type: 'tint', slot: 'fx', source: 'inline', menu: { label: 'N2', order: 7 } },
    { id: 'new1', type: 'tint', slot: 'fx', source: 'inline' },
    { id: 'bad' }, 5]);
  const routes = r.layers.find(l => l.id === 'routes');
  assert.equal(routes.menu.label, 'Lanes'); assert.equal(routes.menu.order, 5); assert.equal(routes.menu.titleKey, 'routes_title', 'kernel menu keys stay');
  assert.deepEqual(routes.adjust, { menu: { label: 'Lanes', order: 5 }, off: true });
  assert.equal(routes.slot, 'routes'); assert.equal(routes.type, 'line');
  const news = r.layers.filter(l => l.origin === 'pack');
  assert.deepEqual(news.map(l => l.id), ['new1', 'new2']);
  assert.equal(news[0].menu.order, 1001, '1000 + its index in the array');
  assert.equal(news[1].menu.order, 7);
  assert.ok(codes(r.problems).includes('layer-duplicate') && codes(r.problems).includes('layer-incomplete') && codes(r.problems).includes('layer-type'));
  const many = mergeLayers([], Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, type: 'tint', slot: 'fx', source: 'inline' })));
  assert.equal(many.layers.length, 32); assert.equal(codes(many.problems).filter(c => c === 'layer-limit').length, 8);
  assert.equal(KERNEL_LAYERS[2].menu.label, '航线', 'the kernel list is not touched');
});

test('appliesTo: truth table', () => {
  const ctx = { view: 'v1', kind: 'tiles', owner: 'hill', ancestors: ['town', 'world'], nodeType: 'layer', period: 'night', dark: true, count: 2, mvu: { 'a.b': 5, flag: true, s: 'x' } };
  const t = (a, c = ctx, type) => appliesTo(a, c, type);
  assert.equal(t(undefined), true); assert.equal(t({}), true); assert.equal(t(null), true);
  assert.equal(t({ views: ['v1', 'v2'] }), true); assert.equal(t({ views: ['v2'] }), false); assert.equal(t({ views: [] }), true, 'an empty list constrains nothing');
  assert.equal(t({ kinds: ['tiles'] }), true); assert.equal(t({ kinds: ['image'] }), false);
  assert.equal(t({ nodes: ['hill'] }), true); assert.equal(t({ nodes: ['world'] }), true, 'inside one of them'); assert.equal(t({ nodes: ['x'] }), false);
  assert.equal(t({ node_types: ['layer'] }), true); assert.equal(t({ node_types: ['site'] }), false);
  assert.equal(t({ periods: ['night', 'dawn'] }), true); assert.equal(t({ periods: ['day'] }), false);
  assert.equal(t({ dark: true }), true); assert.equal(t({ dark: false }), false); assert.equal(t({ dark: false }, { ...ctx, dark: false }), true);
  assert.equal(t({ views: ['v1'], dark: false }), false, 'every key must match (AND)');
  assert.equal(t({ views: ['v1'], periods: ['night'], kinds: ['tiles', 'image'] }), true);
  assert.equal(t({ views: ['v1'] }, { ...ctx, count: 0 }, 'point'), false, 'data defaults to required for a point block');
  assert.equal(t({ views: ['v1'] }, { ...ctx, count: 0 }, 'tint'), true, 'and to not required for a tint');
  assert.equal(t({ views: ['v1'] }, { ...ctx, count: 0 }, null), true, 'kernel layers: not required');
  assert.equal(t({ views: ['v1'], data: false }, { ...ctx, count: 0 }, 'point'), true);
  assert.equal(t({ data: true }, { ...ctx, count: 0 }, 'tint'), false);
  assert.equal(t({ mvu: { path: 'a.b', min: 3, max: 6 } }), true); assert.equal(t({ mvu: { path: 'a.b', min: 6 } }), false); assert.equal(t({ mvu: { path: 'a.b', equals: 5 } }), true);
  assert.equal(t({ mvu: { path: 'flag', truthy: true } }), true); assert.equal(t({ mvu: { path: 'flag', truthy: false } }), false);
  assert.equal(t({ mvu: { path: 'missing', truthy: false } }), false, 'a value that is not there never applies');
  assert.equal(t({ mvu: { path: 's', equals: 'x' } }), true);
  assert.equal(t({ unknown: 1 }), true, 'unknown keys are ignored');
  assert.equal(t({ views: ['v1'] }, null), false);
});

test('layersBlock (validate2): valid row kept with extension keys, bad rows listed, path form, limits', () => {
  const x = () => ({ problems: [], ref: v => v });
  const c = x();
  const out = layersBlock([{ ...GOOD, _note: 'n', 'x-a': 1 }, { id: 'routes', menu: { label: 'L' }, type: 'point' }, { id: 'p2', type: 'point' }, { id: 'patrol', type: 'tint', slot: 'fx', source: 'inline' }, 'junk'], 'layers', c);
  assert.deepEqual(out.map(r => r.id), ['patrol', 'routes']);
  assert.equal(out[0]._note, 'n'); assert.equal(out[0]['x-a'], 1); assert.equal(out[0].origin, undefined);
  const cs = codes(c.problems);
  for (const k of ['layer-kernel-fixed', 'layer-incomplete', 'layer-duplicate', 'layer-type']) assert.ok(cs.includes(k), k);
  assert.equal(layersBlock('layers.json', 'layers', x()), 'layers.json');
  assert.notEqual(typeof layersBlock('../x.json', 'layers', x()), 'string');
  assert.equal(layersBlock({}, 'layers', x()) !== undefined, true);
});

test('the module is pure (no DOM, storage, host globals)', () => {
  const src = readFileSync(new URL('../map/core/layer-spec.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|localStorage|sessionStorage|fetch|LocalStore|HTMLElement|navigator)\b/);
  assert.ok(src.split('\n').length <= 350);
});

// ---- S8-3 (K-R87, K-R88): local layers (trust "local") ----
test('local layers: the id must start with local-; sources are inline / view / events / people / items / routine only; a prop: icon is allowed for a local layer and for nobody else', () => {
  const D = (o = {}) => ({ id: 'local-a', type: 'point', slot: 'markers', data: { features: [{ view: 'v', at: [0.1, 0.2] }] }, ...o });
  const L = (o, trust = 'local') => normLayer(D(o), { trust });
  assert.ok(L({}).layer); assert.equal(L({}).layer.origin, 'local');
  assert.deepEqual(L({ id: 'a' }).problems, [{ code: 'local-id' }]); assert.equal(L({ id: 'a' }).layer, null);
  for (const source of ['inline', 'view:routes', 'view:markers', 'events', 'people', 'items', 'routine']) assert.ok(L({ source, data: undefined }).layer, source);
  for (const source of ['mvu:a.b', 'file:x.json', 'ops', 'kernel', 'nonsense']) assert.equal(L({ source }).layer, null, source);
  assert.equal(L({ style: { icon: 'prop:lantern-2' } }).layer.style.icon, 'prop:lantern-2');
  assert.equal(L({ style: { icon: 'prop:lantern-2' } }, 'pack').layer.id === 'local-a' && L({ style: { icon: 'prop:lantern-2' } }, 'pack').layer.style.icon, undefined, 'a pack cannot name a user\'s file');
  assert.ok(L({ style: { icon: 'prop:lantern-2' } }, 'pack').problems.some(p => p.code === 'style-value' && p.key === 'icon'));
  assert.equal(L({ style: { icon: 'prop:a b' } }).layer.style.icon, undefined, 'the prop id is checked');
  assert.equal(normLayer(D({ id: 'local-a', type: 'point', data: undefined, source: undefined }), { trust: 'local' }).layer, null, 'a layer needs a source or data');
  assert.equal(LIMITS.local, 16);
});

test('local layers: the kernel ids cannot be declared or adjusted by a local layer; validation heals one part at a time', () => {
  const r = normLayer({ id: 'local-b', type: 'area', slot: 'routes', data: { features: [{ view: 'v', pts: [[0, 0], [1, 0], [1, 1]] }, { view: 'v', pts: [[0, 0]] }, 'x'] }, style: { color: 'red', width: 3, bogus: 1 }, applies: { views: ['v'] } }, { trust: 'local' });
  assert.equal(r.layer.data.features.length, 1, 'the bad features are dropped');
  assert.equal(r.layer.style.width, 3); assert.equal(r.layer.style.color, undefined);
  assert.deepEqual(r.problems.map(p => p.code).sort(), ['feature-geometry', 'feature-pts', 'feature-type', 'style-unknown', 'style-value']);
  const k = normLayer({ id: 'routes', type: 'line', slot: 'routes', data: { features: [] } }, { trust: 'local' });
  assert.equal(k.layer, null); assert.deepEqual(k.problems, [{ code: 'local-id' }]);   // the kernel's ids are not for local layers
});

test('S8-4b (K-R80): the label style key `badge` is a boolean; anything else is dropped', () => {
  const p = [];
  assert.deepEqual(normStyle({ color: '#e8b33a', size: 'small', tone: 'chip', badge: true }, 'label', {}, p), { color: '#e8b33a', size: 'small', tone: 'chip', badge: true });
  assert.deepEqual(p, []);
  const q = [];
  assert.deepEqual(normStyle({ badge: 'yes' }, 'label', {}, q), {}); assert.deepEqual(codes(q), ['style-value']);
  const r = normLayer({ id: 'chips', type: 'label', slot: 'labels', style: { by: { n: { badge: true, color: '#59b36b' } } }, data: { features: [{ view: 'v', at: [0.5, 0.5], label: '2', kind: 'n' }] } }, { trust: 'pack' });
  assert.equal(r.layer.style.by.n.badge, true);
});
