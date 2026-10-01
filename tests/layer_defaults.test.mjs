// S8-1: the kernel layer list (core/layer-defaults.mjs) equals the 17 descriptors the modules registered before it existed, plus `type` / `source`; S8-3 added the two kernel layers nav-ops and local-props (19).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KERNEL_LAYERS, KERNEL_IDS, kernelDecl } from '../map/core/layer-defaults.mjs';
import { SLOTS, KINDS } from '../map/core/layer-registry.mjs';
import { LAYERS_V1 } from './helpers/layers_v1_frozen.mjs';

const TYPES = { routes: 'line', traffic: 'flow', weather: 'particles' };
const MENU_ORDER = { 'base-overlay': 10, 'alt-base': 20, routes: 30, security: 40, weather: 45, traffic: 46, quests: 47, loot: 48, vision: 49, wander: 50, trips: 50, labels: 60, markers: 70, events: 80, 'nav-ops': 85, 'local-props': 86 };
const S83 = ['nav-ops', 'local-props'];   // added by S8-3 (K-R86, K-R88); everything else is the frozen list of S8-1

test('the kernel list has the 17 layers and the two of S8-3, ids unique, slots and kinds valid', () => {
  assert.equal(LAYERS_V1.length, 17);
  assert.equal(KERNEL_LAYERS.length, 19);
  assert.equal(new Set(KERNEL_IDS).size, 19);
  assert.deepEqual(KERNEL_IDS.filter(id => !S83.includes(id)).sort(), LAYERS_V1.map(l => l.id).sort());
  for (const l of KERNEL_LAYERS) { assert.ok(SLOTS.includes(l.slot), l.id); assert.ok(KINDS.includes(l.kind), l.id); assert.equal(l.source, 'kernel'); }
});

test('every kernel declaration equals the frozen descriptor plus type / source (frozen descriptors 17/17)', () => {
  for (const old of LAYERS_V1) {
    const d = kernelDecl(old.id), { type, source, ...rest } = d;
    const want = JSON.parse(JSON.stringify(old));
    if (old.id === 'routes') want.menu.title = rest.menu.title;   // the one text changed on purpose (T9): neutral in the engine, the first pack's strings keep the old words
    assert.deepEqual(rest, want, old.id);
    assert.equal(type, TYPES[old.id] ?? null, `${old.id} type`);
  }
  assert.doesNotMatch(kernelDecl('routes').menu.title, /银冠堡/, 'the engine text names no place');
});

test('nav-ops and local-props: markers slot, point block, order 3 and 4, a row that shows while it holds something', () => {
  const n = kernelDecl('nav-ops'), p = kernelDecl('local-props');
  for (const [d, order, labelKey] of [[n, 3, 'nav.layer'], [p, 4, 'props.layer']]) { assert.equal(d.slot, 'markers'); assert.equal(d.kind, 'osd'); assert.equal(d.type, 'point'); assert.equal(d.order, order); assert.deepEqual(d.applies, { data: true }); assert.equal(d.menu.labelKey, labelKey); assert.equal(d.menu.hidden, undefined); }
  assert.equal(n.menu.id, 'lyr-nav-ops'); assert.equal(p.menu.id, 'lyr-local-props');
});

test('menu orders are the table of the design (ties keep registration order)', () => {
  for (const l of KERNEL_LAYERS) assert.equal(l.menu?.order, MENU_ORDER[l.id], l.id);
  assert.equal(KERNEL_LAYERS.filter(l => !l.menu).map(l => l.id).join(), 'fog,clouds,depth-haze');
});

test('kernelDecl returns a fresh copy, null for an unknown id; the list is frozen', () => {
  const a = kernelDecl('labels'); a.menu.label = 'x';
  assert.equal(kernelDecl('labels').menu.label, '地名');
  assert.equal(kernelDecl('nope'), null);
  assert.ok(Object.isFrozen(KERNEL_LAYERS));
});

test('every module registers through its declaration and no module keeps a literal descriptor', () => {
  for (const f of ['app/layer-host.mjs', 'events-view.mjs', 'security.mjs', 'trips-view.mjs', 'app/depth-haze.mjs', 'app/wander.mjs', 'app/stash-markers.mjs', 'app/traffic-view.mjs', 'app/quests-view.mjs', 'app/clouds.mjs', 'app/fog.mjs', 'app/weather-view.mjs', 'app/vision-view.mjs']) {
    const s = readFileSync(new URL('../map/' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(s, /registry\.register\(\{/, f);
    assert.match(s, /registry\.register\(declared\(/, f);
  }
});
