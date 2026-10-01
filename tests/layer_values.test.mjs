// S8-3 (K-R86): host-fed layer values. The profile's layer paths (core/profile.mjs layerPathsOf), the capped read of a snapshot (core/layer-values.mjs, and MVUBridge.layerValues
// on a fake snapshot, read only), the `applies.mvu` evaluator table (core/layer-spec.mjs appliesTo), and the `mvu:` source on the viewer (names of a list / keys of an object / one string).
import test from 'node:test';
import assert from 'node:assert/strict';
import { layerPathsOf, profileOf, profileFromV1, KERNEL } from '../map/core/profile.mjs';
import { capValue, pickValues, VALUE_LIMITS, TRUNCATED } from '../map/core/layer-values.mjs';
import { appliesTo, normLayer, mergeLayers } from '../map/core/layer-spec.mjs';
import { KERNEL_LAYERS } from '../map/core/layer-defaults.mjs';
import { createLife } from '../map/tavern/host-lifecycle.mjs';
import { MVUBridge } from '../map/tavern/mvu-bridge.mjs';

const S = (() => { const f = function () {}; const p = new Proxy(f, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : p, apply: () => p, construct: () => p, set: () => true, has: () => true }); return p; })();
const keep = {};
for (const k of ['window', 'document', 'navigator', 'location', 'matchMedia', 'addEventListener', 'removeEventListener', 'OpenSeadragon', 'LocalStore', 'self', 'getComputedStyle', 'MutationObserver', 'ResizeObserver', 'localStorage', 'sessionStorage', 'IntersectionObserver']) keep[k] = Object.getOwnPropertyDescriptor(globalThis, k);
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
for (const k of Object.keys(keep)) set(k, S);
set('window', new Proxy({}, { get: (t, k) => (k in t ? t[k] : S), set: (t, k, v) => { t[k] = v; return true; } }));
const state = await import('../map/app/state.mjs');
const DS = await import('../map/app/declared-sources.mjs');
for (const [k, d] of Object.entries(keep)) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k];

const L = (o = {}) => ({ id: 'x', type: 'point', slot: 'markers', ...o });
const bytes = v => new TextEncoder().encode(JSON.stringify(v)).length;

test('profile layerPaths: the distinct mvu: sources and applies.mvu paths of the pack\'s layers, matching the vars path pattern, at most 8', () => {
  const rows = [L({ source: 'mvu:世界.在场' }), L({ id: 'b', source: 'mvu:世界.在场' }), L({ id: 'c', applies: { mvu: { path: '状态.警戒', min: 2 } } }), L({ id: 'd', source: 'inline' }), L({ id: 'e', source: 'mvu:.bad' }), L({ id: 'f', source: 'mvu:a\nb' }), null, 'x'];
  assert.deepEqual(layerPathsOf(rows), ['世界.在场', '状态.警戒']);
  assert.deepEqual(layerPathsOf(undefined), []); assert.deepEqual(layerPathsOf({}), []);
  const many = Array.from({ length: 12 }, (_, i) => L({ id: 'l' + i, source: 'mvu:p' + i }));
  assert.equal(layerPathsOf(many).length, 8); assert.equal(layerPathsOf(many)[7], 'p7');
  assert.deepEqual(layerPathsOf([L({ source: 'mvu:' + 'x'.repeat(80) }), L({ id: 'y', source: 'mvu:' + 'x'.repeat(81) })]).length, 1);
});

test('profileOf and profileFromV1 carry layerPaths; a pack without layers has none; the kernel profile has none', () => {
  assert.deepEqual(KERNEL.layerPaths, []);
  assert.deepEqual(profileOf({ layers: [L({ source: 'mvu:a.b' })] }).layerPaths, ['a.b']);
  assert.deepEqual(profileOf({}).layerPaths, []);
  assert.deepEqual(profileFromV1({ manifest: {}, overlay: { schema: 2, layers: [L({ applies: { mvu: { path: 'c.d', truthy: true } } })] } }).layerPaths, ['c.d']);
  assert.deepEqual(profileFromV1({ manifest: {}, overlay: null }).layerPaths, []);
});

test('capValue: small values pass unchanged; a list over 200 items or a value over 4 KB is cut and marked …truncated', () => {
  for (const v of [0, 5, true, false, null, 'abc', ['a', 'b'], { a: 1 }]) assert.deepEqual(capValue(v), v);
  assert.equal(capValue(undefined), undefined); assert.equal(capValue(() => 1), undefined);
  const long = Array.from({ length: 300 }, (_, i) => 'n' + i), a = capValue(long);
  assert.equal(a.length, 201); assert.equal(a.at(-1), TRUNCATED); assert.equal(a[199], 'n199');
  const wide = Array.from({ length: 150 }, (_, i) => 'x'.repeat(80) + i), w = capValue(wide);
  assert.ok(bytes(w) <= VALUE_LIMITS.bytes + 32, 'cut to the byte limit'); assert.equal(w.at(-1), TRUNCATED);
  const s = capValue('y'.repeat(9000)); assert.ok(bytes(s) <= VALUE_LIMITS.bytes + 32); assert.ok(s.endsWith(TRUNCATED));
  const o = capValue(Object.fromEntries(Array.from({ length: 400 }, (_, i) => ['k' + i, 'v'.repeat(30)]))); assert.equal(o[TRUNCATED], true); assert.ok(bytes(o) <= VALUE_LIMITS.bytes + 32);
  assert.deepEqual(capValue({ a: undefined, b: 1 }), { b: 1 });
});

test('pickValues: reads each path through the host\'s reader, a missing path is absent, at most 8, never throws', () => {
  const stat = { a: { b: ['p', 'q'] }, n: 3 };
  const get = (s, p) => p.split('.').reduce((v, k) => v?.[k], s);
  assert.deepEqual(pickValues(stat, ['a.b', 'n', 'nope.x'], get), { 'a.b': ['p', 'q'], n: 3 });
  assert.deepEqual(pickValues(stat, ['a.b'], () => { throw new Error('x'); }), {});
  assert.deepEqual(pickValues(null, ['a'], get), {}); assert.deepEqual(pickValues(stat, 'a', get), {});
  assert.equal(Object.keys(pickValues({ ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['k' + i, i])) }, Array.from({ length: 12 }, (_, i) => 'k' + i), get)).length, 8);
});

test('MVUBridge.layerValues: reads the round\'s snapshot, unwraps [value, note] pairs, caps, and writes nothing', () => {
  const hadWin = 'window' in globalThis; globalThis.window = globalThis;
  const stat = { 世界: { 在场: ['Old Keep', 'Market Square', 'Tower'], 警戒: [3, 'level'], 清单: { 数据: Array.from({ length: 300 }, (_, i) => 'n' + i) } } };
  const snap = JSON.stringify(stat);
  globalThis.Mvu = { getMvuData: () => ({ stat_data: JSON.parse(snap) }), events: {} };
  globalThis.SillyTavern = { getContext: () => ({ chatId: 'c', characters: [], characterId: 0 }), chat: [] };
  try {
    const B = new MVUBridge({ life: createLife(), storage: () => ({ getItem: () => null, setItem() {}, removeItem() {} }), wins: () => [globalThis] });
    const v = B.layerValues(['世界.在场', '世界.警戒', '世界.清单.数据', '世界.没有']);
    assert.deepEqual(v['世界.在场'], ['Old Keep', 'Market Square', 'Tower']);
    assert.equal(v['世界.警戒'], 3);
    assert.equal(v['世界.清单.数据'].length, 201); assert.equal(v['世界.清单.数据'].at(-1), TRUNCATED);
    assert.equal('世界.没有' in v, false, 'a missing path is absent');
    assert.deepEqual(B.layerValues([]), {});
    assert.equal(JSON.stringify(B.mvuStat()), snap, 'the snapshot is untouched');
  } finally { delete globalThis.Mvu; delete globalThis.SillyTavern; if (!hadWin) delete globalThis.window; }
});

test('applies.mvu: equals / min / max / truthy, all given keys must hold; a missing value or no values never applies', () => {
  const ctx = mvu => ({ view: 'v', mvu });
  const T = (m, mvu, want) => assert.equal(appliesTo({ mvu: { path: 'p', ...m } }, ctx(mvu), 'point'), want, JSON.stringify([m, mvu]));
  T({ equals: 'on' }, { p: 'on' }, true); T({ equals: 'on' }, { p: 'off' }, false); T({ equals: 2 }, { p: 2 }, true); T({ equals: 2 }, { p: '2' }, false); T({ equals: false }, { p: false }, true);
  T({ min: 3 }, { p: 3 }, true); T({ min: 3 }, { p: 2 }, false); T({ min: 3 }, { p: '5' }, true, 'a numeric string counts');
  T({ max: 3 }, { p: 3 }, true); T({ max: 3 }, { p: 4 }, false); T({ min: 1, max: 3 }, { p: 2 }, true); T({ min: 1, max: 3 }, { p: 5 }, false);
  T({ truthy: true }, { p: 'x' }, true); T({ truthy: true }, { p: 0 }, false); T({ truthy: true }, { p: [] }, true); T({ truthy: false }, { p: 0 }, true); T({ truthy: false }, { p: 1 }, false);
  T({}, { p: 'anything' }, true, 'a path alone: the value must exist');
  T({ truthy: false }, {}, false); T({ equals: 'x' }, { p: null }, false); T({}, undefined, false);
  assert.equal(appliesTo({ views: ['v'], mvu: { path: 'p', min: 1 } }, ctx({ p: 2 }), 'point'), true);
  assert.equal(appliesTo({ views: ['w'], mvu: { path: 'p', min: 1 } }, ctx({ p: 2 }), 'point'), false, 'every key given must match');
});

test('normLayer keeps a mvu: source and an applies.mvu of a pack layer; a local layer may not use mvu:, file: or ops', () => {
  const ok = normLayer(L({ source: 'mvu:世界.在场', applies: { mvu: { path: '警戒', min: 2 } } }));
  assert.equal(ok.layer.source, 'mvu:世界.在场'); assert.deepEqual(ok.layer.applies, { mvu: { path: '警戒', min: 2 } });
  for (const source of ['mvu:a', 'file:x.json', 'ops', 'kernel']) assert.equal(normLayer(L({ id: 'local-a', source }), { trust: 'local' }).layer, null, source);
  assert.equal(normLayer(L({ id: 'local-a', source: 'events' }), { trust: 'local' }).layer?.source, 'events');
  assert.equal(mergeLayers(KERNEL_LAYERS, [L({ source: 'mvu:a' })]).layers.at(-1).source, 'mvu:a');
});

test('the mvu: source on the viewer: a list gives its entries, an object its keys, a string itself; an old-format [list, note] pair is unwrapped; nothing is invented', () => {
  assert.deepEqual(DS.valueNames(['a', ' b ', '', 3, null, { x: 1 }]), ['a', 'b', '3']);
  assert.deepEqual(DS.valueNames({ k1: 1, k2: [] }), ['k1', 'k2']);
  assert.deepEqual(DS.valueNames('Old Keep'), ['Old Keep']);
  assert.deepEqual(DS.valueNames([['a', 'b'], 'a note']), ['a', 'b']);
  assert.deepEqual(DS.valueNames(undefined), []); assert.deepEqual(DS.valueNames(null), []); assert.deepEqual(DS.valueNames(7), ['7']);
  assert.deepEqual(DS.valueNames(['a', TRUNCATED]), ['a'], 'the truncation mark is not a place');
  assert.equal(DS.valueNames(Array.from({ length: 300 }, (_, i) => 'n' + i)).length, 200);
  state.setCurrentMapId('v'); state.setCurrentMapData({ markers: [] });
  DS.setValues({ 'w.p': ['Nowhere', 'Else'] });
  assert.deepEqual(DS.sourceFeatures({ id: 'x', type: 'point', slot: 'markers', source: 'mvu:w.p' }), [], 'names that are not drawn on the open map place nothing');
  assert.deepEqual(DS.hostValues(), { 'w.p': ['Nowhere', 'Else'] });
  DS.setValues('junk'); assert.deepEqual(DS.hostValues(), {});
});
