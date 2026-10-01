// S8-3 (K-R86, I-04): the navigator overlays. Host side (tavern/nav-ops.mjs): stamping with the floor and the map, ageing after 20 messages, the cap of 12, clearing.
// Viewer side (app/nav-ops-view.mjs opFeatures): a clue is placed by its name when that place is drawn on the open map, else by its own coordinates on its stamped map; a marker by
// its coordinates on its map. The llm-flow module posts `eden-map:ops` through the host bag and clears it on a chat change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, OPS_LIMITS, add, age, sig } from '../map/tavern/nav-ops.mjs';
import { createLlmFlow, DEPS } from '../map/tavern/llm-flow.mjs';
import { SCHEMA, check } from '../map/core/protocol.mjs';

const S = (() => { const f = function () {}; const p = new Proxy(f, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : p, apply: () => p, construct: () => p, set: () => true, has: () => true }); return p; })();
const keep = {};
for (const k of ['window', 'document', 'navigator', 'location', 'matchMedia', 'addEventListener', 'removeEventListener', 'OpenSeadragon', 'LocalStore', 'self', 'getComputedStyle', 'MutationObserver', 'ResizeObserver', 'localStorage', 'sessionStorage', 'IntersectionObserver']) keep[k] = Object.getOwnPropertyDescriptor(globalThis, k);
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
for (const k of Object.keys(keep)) set(k, S);
set('window', new Proxy({}, { get: (t, k) => (k in t ? t[k] : S), set: (t, k, v) => { t[k] = v; return true; } }));
const { opFeatures } = await import('../map/app/nav-ops-view.mjs');
for (const [k, d] of Object.entries(keep)) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k];

const D = { clues: [{ name: 'Old Keep', nx: 0.4, ny: 0.5, urgency: 2, src: 'op' }], markers: [{ id: 'm1', nx: 0.1, ny: 0.2, label: 'Camp', src: 'op' }] };

test('stamping: every row of a run carries the floor and the map of the player\'s place', () => {
  const s = add(EMPTY, D, { floor: 12, map: 'town_hill' });
  assert.deepEqual(s.clues[0], { name: 'Old Keep', nx: 0.4, ny: 0.5, urgency: 2, src: 'op', floor: 12, map: 'town_hill' });
  assert.deepEqual(s.markers[0], { id: 'm1', nx: 0.1, ny: 0.2, label: 'Camp', src: 'op', floor: 12, map: 'town_hill' });
  assert.equal(add(EMPTY, D, { floor: 3 }).clues[0].map, null, 'no map known: null, never a guess');
  assert.equal(EMPTY.clues.length, 0, 'the empty state is never mutated');
});

test('ageing: rows older than 20 messages are dropped, 20 exactly is kept', () => {
  const s = add(EMPTY, D, { floor: 10, map: 'a' });
  assert.equal(age(s, 30).clues.length, 1);
  assert.equal(age(s, 31).clues.length, 0);
  assert.equal(age(s, 31).markers.length, 0);
  const t = add(s, { clues: [{ name: 'New', nx: 0, ny: 0, urgency: 1 }], markers: [] }, { floor: 40, map: 'a' });
  assert.deepEqual(t.clues.map(c => c.name), ['New'], 'adding ages the older rows out');
  assert.equal(OPS_LIMITS.age, 20);
});

test('cap: at most 12 per list, the newest kept', () => {
  let s = EMPTY;
  for (let i = 0; i < 15; i++) s = add(s, { clues: [{ name: 'c' + i, nx: 0, ny: 0, urgency: 1 }], markers: [{ id: 'm' + i, nx: 0, ny: 0, label: 'l' }] }, { floor: 100 + i, map: 'a' });
  assert.equal(s.clues.length, 12); assert.equal(s.markers.length, 12);
  assert.deepEqual([s.clues[0].name, s.clues.at(-1).name], ['c3', 'c14']);
});

test('signature: changes on add and on ageing, equal for equal state; clear = the empty state', () => {
  const s = add(EMPTY, D, { floor: 1, map: 'a' });
  assert.notEqual(sig(s), sig(EMPTY));
  assert.equal(sig(s), sig(add(EMPTY, D, { floor: 1, map: 'a' })));
  assert.notEqual(sig(age(s, 99)), sig(s));
  assert.equal(sig(age(s, 99)), sig(EMPTY));
});

test('viewer placement order: the clue\'s name through the drawn places first, else its coordinates on the stamped map; markers by coordinates on their map', () => {
  const s = add(EMPTY, D, { floor: 5, map: 'town_hill' });
  const byName = opFeatures(s, { map: 'town_hill', at: n => (n === 'Old Keep' ? [0.7, 0.6] : null) });
  assert.deepEqual(byName.map(f => [f.kind, f.at]), [['clue', [0.7, 0.6]], ['marker', [0.1, 0.2]]], 'the name wins over the clue\'s own coordinates');
  const byXY = opFeatures(s, { map: 'town_hill', at: () => null });
  assert.deepEqual(byXY.map(f => [f.kind, f.at]), [['clue', [0.4, 0.5]], ['marker', [0.1, 0.2]]], 'not drawn here: the stamped map\'s coordinates');
  assert.deepEqual(opFeatures(s, { map: 'town_harbour', at: () => null }), [], 'another map: nothing');
  assert.equal(opFeatures(s, { map: 'town_harbour', at: () => [0.3, 0.3] }).length, 1, 'a place drawn on this map shows the clue even when the stamp is another map');
});

test('viewer placement: urgency 1..3, bad coordinates and rows are ignored, text stays text', () => {
  const f = opFeatures({ clues: [{ name: 'x', map: 'a', nx: 0.1, ny: 0.1, urgency: 9 }, { name: 'y', map: 'a', nx: 2, ny: 0.1 }, null, { name: 'z', map: 'a', nx: 0.2, ny: 0.2 }], markers: [{ map: 'a', nx: 'x', ny: 0 }, { map: 'a', nx: 0.5, ny: 0.5, label: '<b>t</b>' }] }, { map: 'a', at: () => null });
  assert.deepEqual(f.filter(x => x.kind === 'clue').map(x => [x.label, x.urgency]), [['x', 3], ['z', 1]]);
  assert.equal(f.filter(x => x.kind === 'marker').length, 1);
  assert.equal(f.find(x => x.kind === 'marker').label, '<b>t</b>', 'the label is data; the view puts it in with textContent');
});

test('the llm flow posts eden-map:ops on a fresh viewer only when it holds rows, and clears nothing it never sent', () => {
  const posts = [];
  const host = Object.fromEntries(DEPS.map(k => [k, S])); host.alive = true; host.floorNow = 5; host.post = m => posts.push(m); host.scriptBase = 'file:///nonexistent/map/';
  const L = createLlmFlow(host);
  L.sendOps(true); L.resetOps(); L.sendOps();
  assert.equal(posts.length, 0, 'nothing held, nothing posted');
});

test('protocol: eden-map:ops is a host→viewer message with two arrays; eden-map:layer-data one object', () => {
  assert.equal(SCHEMA['eden-map:ops'][0], 'host→viewer'); assert.equal(SCHEMA['eden-map:layer-data'][0], 'host→viewer');
  assert.ok(check({ type: 'eden-map:ops', v: 2, clues: [], markers: [] }).ok);
  assert.ok(!check({ type: 'eden-map:ops', v: 2, clues: [] }).ok, 'markers are required');
  assert.ok(check({ type: 'eden-map:layer-data', v: 2, values: { 'a.b': ['x'] } }).ok);
  assert.ok(!check({ type: 'eden-map:layer-data', v: 2, values: 'x' }).ok);
});

test('S8-4b (K-R113): the llm flow sends the suggested routes in eden-map:ops, resets them with the rest, and an older viewer\'s message shape still validates', () => {
  const posts = [], host = Object.fromEntries(DEPS.map(k => [k, S])); host.alive = true; host.floorNow = 5; host.post = m => posts.push(m); host.scriptBase = 'file:///nonexistent/map/';
  const L = createLlmFlow(host);
  L.addRoutes([{ from: 'A', to: 'B', fromNode: 'a', toNode: 'b', why: 'w' }], { floor: 5, map: 'town_hill' });
  assert.equal(posts.length, 1); assert.deepEqual(posts[0].routes, [{ from: 'A', to: 'B', fromNode: 'a', toNode: 'b', why: 'w', floor: 5, map: 'town_hill' }]); assert.deepEqual(posts[0].clues, []);
  posts.length = 0; L.sendOps(true); assert.equal(posts.length, 1, 'a fresh viewer gets the held route');
  posts.length = 0; L.resetOps(); assert.equal(posts.length, 1); assert.deepEqual(posts[0].routes, []);
  assert.ok(check({ type: 'eden-map:ops', v: 2, clues: [], markers: [], routes: [] }).ok); assert.ok(!check({ type: 'eden-map:ops', v: 2, clues: [], markers: [], routes: 'x' }).ok);
});
