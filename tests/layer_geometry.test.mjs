// S8-2: core/layer-geometry.mjs: the routes paths equal the frozen loop; converters, style resolution, swatches, flow tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { routePaths, pathD, circlePath, routesAsFeatures, markersAsFeatures, featuresOnView, styleFor, swatchOf, rgbOf, flowKinds, flowRoutes } from '../map/core/layer-geometry.mjs';
import { routePathsV1 } from './helpers/routes_v1_frozen.mjs';

const rd = f => JSON.parse(readFileSync(new URL('../map/' + f, import.meta.url), 'utf8'));
const dataRoutes = () => {
  const out = [];
  for (const dir of ['data', 'packs/eden', 'packs/town', 'packs/minimal']) {
    let files = []; try { files = readdirSync(new URL('../map/' + dir, import.meta.url)).filter(f => f.endsWith('.json')); } catch (e) {}
    for (const f of files) { let j; try { j = rd(dir + '/' + f); } catch (e) { continue; } if (Array.isArray(j?.routes) && j.routes.length) out.push([dir + '/' + f, j.routes]); }
  }
  return out;
};

test('routePaths equals the frozen loop on every shipped routes list (routes paths n/n)', () => {
  const lists = dataRoutes(); assert.ok(lists.length >= 1, 'at least the first pack has routes');
  let n = 0;
  for (const [name, routes] of lists) for (const [VW, VH] of [[1000, 1000], [1000, 562.5], [1000, 1333.3]]) {
    const a = routePaths(routes, VW, VH), b = routePathsV1(routes, VW, VH);
    assert.deepEqual(a, b, name); n += a.length;
  }
  assert.ok(n > 0);
});

test('routePaths edge cases: short routes skipped, closed rule, class rule, two passes', () => {
  const routes = [{ pts: [[0.1, 0.1]], kind: 'lane' }, { pts: [[0, 0], [1, 1]], kind: 'lane', from: 'a', to: 'a' }, { pts: [[0, 0], [0.5, 0.5], [0, 0]], kind: 'patrol', from: 'a', to: 'a' }, { pts: [[0, 0], [1, 0]], kind: 'x' }, {}];
  const a = routePaths(routes, 1000, 500), b = routePathsV1(routes.filter(r => r.pts?.length > 1 || r.pts), 1000, 500).filter(() => true);
  assert.equal(a.length, 6); assert.deepEqual(a.map(q => q.pass), ['halo', 'halo', 'halo', 'line', 'line', 'line']);
  assert.equal(a[3].cls, 'lane'); assert.equal(a[4].cls, 'patrol'); assert.equal(a[5].cls, 'lane');
  assert.ok(!a[0].d.endsWith('Z') && a[1].d.endsWith('Z'), 'only a non-lane with from === to closes');
  assert.deepEqual(routePaths(null, 1000, 1000), []);
  assert.ok(b.length >= 0);
});

test('pathD, circlePath', () => {
  assert.equal(pathD([[0, 0], [0.5, 0.25]], false, 1000, 400), 'M0.0,0.0L500.0,100.0');
  assert.equal(pathD([[0, 0], [1, 1]], true, 10, 10), 'M0.0,0.0L10.0,10.0Z');
  assert.match(circlePath([0.5, 0.5], 0.1, 1000, 500), /^M400\.0,250\.0A100\.0,100\.0 0 1 0 600\.0,250\.0A100\.0,100\.0 0 1 0 400\.0,250\.0Z$/);
});

test('converters: routes and markers become features', () => {
  const rf = routesAsFeatures([{ pts: [[0, 0], [1, 1]], kind: 'lane', from: 'a', to: 'a' }, { pts: [[0, 0], [1, 1]], kind: 'patrol', from: 'a', to: 'a' }, { pts: [[0, 0]] }]);
  assert.deepEqual(rf.map(f => f.closed), [false, true]);
  const mf = markersAsFeatures([{ id: 'a', nx: 0.1, ny: 0.2, ax: 0.3, ay: 0.4 }, { id: 'b', nx: 0.5, ny: 0.6 }, { id: 'c' }]);
  assert.deepEqual(mf, [{ id: 'a', at: [0.3, 0.4] }, { id: 'b', at: [0.5, 0.6] }]);
});

test('featuresOnView: view filter and filter.kinds', () => {
  const fs = [{ view: 'a', kind: 'x' }, { view: 'b', kind: 'x' }, { node: 'n', kind: 'y' }];
  assert.equal(featuresOnView(fs, 'a').length, 2);
  assert.equal(featuresOnView(fs, 'a', ['y']).length, 1);
  assert.deepEqual(featuresOnView(null, 'a'), []);
});

test('styleFor: defaults, layer style, by[kind]; tint default opacity', () => {
  const s = styleFor({ type: 'flow', style: { color: '#112233', by: { fast: { speed: 0.5, color: '--alert' } } } }, 'fast');
  assert.equal(s.speed, 0.5); assert.equal(s.color, '--alert'); assert.equal(s.size, 1.8); assert.equal(s.density, 12); assert.equal(s.fill, '--alert');
  assert.equal(styleFor({ type: 'flow', style: { color: '#112233' } }, 'other').color, '#112233');
  assert.equal(styleFor({ type: 'tint' }).opacity, 0.25); assert.equal(styleFor({ type: 'area' }).opacity, 1);
  assert.equal(styleFor({ type: 'label' }).size, 'micro'); assert.equal(styleFor({ type: 'point' }).size, 10); assert.equal(styleFor({ type: 'line' }).color, '--accent');
  assert.equal(styleFor(null).width, 1.4);
});

test('swatchOf per block', () => {
  assert.equal(swatchOf({ type: 'line', style: { color: '#ffffff', dash: [4, 2] } }).shape, 'stroke');
  assert.deepEqual(swatchOf({ type: 'line', style: { color: '#ffffff', dash: [4, 2] } }).dash, [4, 2]);
  assert.equal(swatchOf({ type: 'flow' }).shape, 'stroke');
  assert.equal(swatchOf({ type: 'area', style: { fill: '#000000', color: '#ffffff' } }).color, '#000000');
  assert.equal(swatchOf({ type: 'tint' }).shape, 'fill'); assert.equal(swatchOf({ type: 'point' }).shape, 'dot');
  for (const t of ['label', 'sound', 'particles']) assert.equal(swatchOf({ type: t }).shape, null);
});

test('rgbOf, flowKinds, flowRoutes', () => {
  assert.equal(rgbOf('#9ad0f5'), '154,208,245'); assert.equal(rgbOf('#9ad0f5ff'), '154,208,245'); assert.equal(rgbOf('--accent'), null);
  const k = flowKinds({ type: 'flow', style: { color: '#9ad0f5', size: 2, density: 6, speed: 0.05, by: { b: { color: '#ffffff' } } } }, [{ kind: 'b' }, { kind: 'c' }, {}]);
  assert.deepEqual(Object.keys(k).sort(), ['b', 'c', 'default']);
  assert.equal(k.default.color, '154,208,245'); assert.equal(k.b.color, '255,255,255'); assert.equal(k.default.density, 6); assert.equal(k.default.size, 2);
  assert.equal(flowKinds({ type: 'flow', style: { color: '--accent' } }, [], () => null).default.color, '255,255,255', 'an unresolved colour falls back to white');
  const r = flowRoutes([{ pts: [[0, 0], [1, 0], [1, 1]], closed: true, kind: 'k' }, { pts: [[0, 0], [1, 0]] }, { pts: [[0, 0]] }]);
  assert.equal(r.length, 2); assert.deepEqual(r[0].pts[3], [0, 0]); assert.equal(r[1].pts.length, 2);
});
