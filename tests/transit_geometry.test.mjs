// core/transit-geometry.mjs (K-R109): octilinear paths, offsets on shared segments, the synthetic layers of the network and of a plan, the plan's polyline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { octo, sharedOffsets, offsetPath, transitLayers, planLayers, pathOf, centroid, circlePts } from '../map/core/transit-geometry.mjs';
import { planRoute } from '../map/core/router.mjs';
import { buildGraph } from '../map/core/router.mjs';
import { normTransit, stationName } from '../map/core/transit-spec.mjs';
import { graph, TOWN, tree, posOn } from './transit_fixture.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const view = (id, v) => TOWN.stations.find(s => s.id === id).view === v;
const base = { posOf: posOn('town_hill'), viewOf: id => TOWN.stations.find(s => s.id === id).view, viewTitle: v => (v === 'town_harbour' ? 'Harbour' : v), nameOf: id => stationName(TOWN, id, 'en', n => tree.get(n)?.name), hasMarker: id => id === 'clock', aspect: 0.625 };

test('octo: horizontal, vertical, 45 degrees and one bend', () => {
  assert.deepEqual(octo([0.1, 0.1], [0.5, 0.1]), [[0.1, 0.1], [0.5, 0.1]]);
  assert.deepEqual(octo([0.1, 0.1], [0.1, 0.6]), [[0.1, 0.1], [0.1, 0.6]]);
  assert.deepEqual(octo([0.1, 0.1], [0.3, 0.3]), [[0.1, 0.1], [0.3, 0.3]]);
  assert.deepEqual(octo([0.1, 0.1], [0.3, 0.5], 0.5), [[0.1, 0.1], [0.3, 0.5]], '45 degrees in the square frame (y x aspect)');
  const bent = octo([0.1, 0.1], [0.6, 0.3]);   // straight leg first without a previous stop: 0.3 across, then 0.2 on the diagonal
  assert.equal(bent.length, 3); near(bent[1][0], 0.4); near(bent[1][1], 0.1); assert.deepEqual(bent[2], [0.6, 0.3]);
  const diag = octo([0.1, 0.1], [0.6, 0.3], 1, [0.0, 0.0]);   // the line came in on the diagonal: the diagonal leg goes first
  near(diag[1][0], 0.3); near(diag[1][1], 0.3);
  const flat = octo([0.1, 0.1], [0.6, 0.3], 1, [0.0, 0.1]);   // the line came in horizontally: straight first
  near(flat[1][0], 0.4); near(flat[1][1], 0.1);
  const up = octo([0.5, 0.5], [0.4, 0.1], 1);   // negative directions
  assert.equal(up.length, 3); near(up[1][0], 0.5); near(up[1][1], 0.2);
});

test('sharedOffsets lists the lines on each segment; offsetPath moves a path sideways', () => {
  const g = buildGraph(normTransit({ stations: ['a', 'b', 'c'].map(id => ({ id, node: id })), lines: [
    { id: 'x', name: 'X', mode: 'maglev', color: '#112233', stops: ['a', 'b', 'c'], min: 1 }, { id: 'y', name: 'Y', mode: 'maglev', color: '#223344', stops: ['b', 'a'], min: 1 }] }).transit);
  const m = sharedOffsets(g);
  assert.deepEqual(m.get('a|b'), ['x', 'y']); assert.deepEqual(m.get('b|c'), ['x']); assert.equal(m.size, 2);
  const p = [[0.1, 0.5], [0.5, 0.5]];
  const [a, b] = [offsetPath(p, 2, 0), offsetPath(p, 2, 1)];
  near(a[0][1], 0.498); near(b[0][1], 0.502); near(a[1][1], 0.498);   // the normal of a segment going right points down (+y); two lines sit 0.004 apart, centred
  assert.deepEqual(offsetPath(p, 1, 0), p, 'one line: no offset');
  assert.deepEqual(offsetPath(p, 3, 1), p, 'the middle of three stays');
  assert.equal(offsetPath([[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], 2, 0).length, 3, 'a bend keeps its points');
});

test('centroid and circlePts', () => {
  assert.deepEqual(centroid([[0, 0], [1, 0], [1, 1], [0, 1]]), [0.5, 0.5]);
  assert.deepEqual(centroid([[0, 0], [1, 1], [2, 2]]), [1, 1], 'no area: the mean');
  const c = circlePts([0.5, 0.5], 0.1, 8, 0.5); assert.equal(c.length, 8); near(c[0][0], 0.6); near(c[2][1], 0.5 + 0.1 / 0.5);
  assert.equal(circlePts([0.5, 0.5], 0.1).length, 24);
});

test('transitLayers on the hill: districts, links, lines, stations, labels, badges and the stub', () => {
  const ls = transitLayers(graph, 'town_hill', base), by = id => ls.find(l => l.id === id);
  assert.deepEqual(ls.map(l => `${l.id}:${l.type}`), ['transit-districts:area', 'transit-links:line', 'transit-lines:line', 'transit-stations:point', 'transit-labels:label', 'transit-badges:label']);
  assert.ok(ls.every(l => l.slot === 'routes' && l.features.every(f => f.view === 'town_hill')));
  assert.deepEqual(by('transit-districts').features.map(f => f.kind), ['d-civic-0']);
  assert.deepEqual(by('transit-links').features.map(f => f.kind), ['k-walk']);
  assert.deepEqual(by('transit-lines').features.map(f => f.kind), ['l-t2', 'l-t2']);
  assert.deepEqual(by('transit-stations').features.map(f => f.kind), ['s', 'x', 's']);
  assert.deepEqual(by('transit-stations').features.map(f => f.at), [[0.2, 0.3], [0.5, 0.5], [0.8, 0.3]]);
  const lab = by('transit-labels').features;
  assert.deepEqual(lab.map(f => f.kind), ['r1', 'r3', 'r2'], 'district first, then stations; the interchange is rank 2');
  assert.ok(!lab.some(f => f.label === 'Clock Tower'), 'no station label where a marker already names the place');
  assert.equal(lab[0].label, '旧城 · civic', 'the district name and its function word (t() is the caller\'s dictionary)');
  const bad = by('transit-badges').features;
  assert.deepEqual(bad.filter(f => f.kind === 'n-t2').map(f => f.at), [[0.2, 0.3], [0.8, 0.3]], 'a badge at the first and the last stop');
  assert.equal(bad.filter(f => f.kind === 'n-c1').length, 1, 'a line with one stop on this view: one badge');
  assert.deepEqual(bad.find(f => f.kind === 'stub'), { view: 'town_hill', at: [0.5, 0.5], kind: 'stub', label: '→ Fish Hall · Harbour' });
  assert.equal(by('transit-badges').style.by['n-t2'].badge, true); assert.equal(by('transit-badges').style.by['n-t2'].color, '#e8b33a');
  assert.deepEqual(by('transit-lines').style.by['l-t2'], { color: '#e8b33a', width: 2.5, halo: true });   // A10-lite (D42): thin lines
  const d = by('transit-districts').style.by['d-civic-0']; assert.equal(d.fill, '#6c8ebf'); assert.equal(d.fill_opacity, 0, 'A10-lite (D42): zones untinted');
  assert.deepEqual(by('transit-links').style.by['k-walk'], { color: '--muted', width: 1.2, dash: [1, 4] });
  assert.deepEqual(by('transit-labels').style.by.r1, { size: 'body', tone: 'plain' });
  for (const f of ls.flatMap(l => l.features)) assert.match(f.kind, /^[a-z][a-z0-9_-]{0,31}$/);
});
test('transitLayers on the harbour: the pier label, a circle district, danger outlines, no tram', () => {
  const ls = transitLayers(graph, 'town_harbour', { ...base, posOf: posOn('town_harbour'), hasMarker: () => false, nodePos: n => (n === 'light' ? [0.85, 0.4] : null), t: k => ({ 'transit.fn.commerce': 'Commerce', 'transit.fn.nature': 'Nature', 'transit.danger.2': 'Danger', 'transit.danger.1': 'Caution' })[k] });
  const by = id => ls.find(l => l.id === id);
  assert.deepEqual(by('transit-districts').features.map(f => [f.kind, f.r || null]), [['d-commerce-2', null], ['d-nature-1', 0.08]]);
  assert.deepEqual(by('transit-districts').features[1].at, [0.85, 0.4]);
  assert.deepEqual(by('transit-districts').style.by['d-commerce-2'], { fill: '#e0a64b', fill_opacity: 0, color: '--alert', width: 1.6, dash: [6, 3] });
  assert.deepEqual(by('transit-districts').style.by['d-nature-1'].dash, [6, 4]);
  const labels = by('transit-labels').features.map(f => f.label);
  assert.ok(labels.includes('鱼市仓库 · Commerce · Danger') && labels.includes('灯塔岬 · Nature · Caution') && labels.includes('Pier'));
  assert.ok(!ls.some(l => l.id === 'transit-lines' && l.features.some(f => f.kind === 'l-t2')));
  assert.equal(by('transit-links').features.length, 2, 'fish-pier and pier-light');
  assert.ok(by('transit-badges').features.some(f => f.kind === 'stub' && f.label === '→ Market · town_hill'));
});
test('transitLayers: labels off, hidden stations, nothing on a view without data', () => {
  const none = transitLayers(graph, 'elsewhere', { ...base, posOf: () => null }); assert.deepEqual(none, []);
  const quiet = transitLayers(graph, 'town_hill', { ...base, style: { width: 6, labels: false } });
  assert.ok(!quiet.some(l => l.id === 'transit-labels')); assert.equal(quiet.find(l => l.id === 'transit-lines').style.by['l-t2'].width, 6);
  const h = buildGraph(normTransit({ stations: [{ id: 'a', node: 'a' }, { id: 'b', node: 'b', hidden: true }], lines: [{ id: 'x', name: 'X', mode: 'walk', color: '#112233', stops: ['a', 'b'], min: 1 }] }).transit);
  const l = transitLayers(h, 'v', { posOf: id => ({ a: [0.1, 0.1], b: [0.5, 0.5] })[id], nameOf: id => id });
  assert.equal(l.find(x => x.id === 'transit-stations').features.length, 1, 'a hidden station has no dot');
});

test('planLayers: start, end, change points, the lines of the leg on the view, a stub; a suggestion is dashed and does not pulse', () => {
  const plan = planRoute(graph, { node: 'keep' }, { node: 'light' }, { env: { tree } });
  const hill = planLayers(graph, plan, 'town_hill', { ...base, endPos: w => (w === 'from' ? [0.18, 0.28] : null) });
  const by = (ls, id) => ls.find(l => l.id === id);
  assert.deepEqual(by(hill, 'route-plan-lines').features.map(f => f.kind), ['p-t2']);
  assert.deepEqual(by(hill, 'route-plan-points').features.map(f => [f.kind, f.at]), [['p-change', [0.5, 0.5]], ['p-start', [0.18, 0.28]]]);
  assert.deepEqual(by(hill, 'route-plan-labels').features.map(f => f.label), ['→ Harbour']);
  assert.deepEqual(by(hill, 'route-plan-lines').style.by['p-t2'], { color: '#e8b33a', width: 5.5, halo: true, dash: null, opacity: 1 });   // A10-lite: the default width dropped to 2.5, the plan ride stays + 3
  const port = planLayers(graph, plan, 'town_harbour', { ...base, posOf: posOn('town_harbour'), endPos: w => (w === 'to' ? [0.86, 0.41] : null) });
  assert.deepEqual(by(port, 'route-plan-lines').features.map(f => f.kind), ['p-k-walk', 'p-k-walk'], 'the cable leg is a stub here: its other end is on the hill');
  const pts = by(port, 'route-plan-points'); assert.deepEqual(pts.features.map(f => f.kind), ['p-change', 'p-end'], 'the cable leg ends at the fish station, where the walk begins'); assert.equal(pts.style.by['p-end'].pulse, true);
  const sug = planLayers(graph, { ...plan, src: 'op' }, 'town_harbour', { ...base, posOf: posOn('town_harbour'), suggested: true, endPos: w => (w === 'to' ? [0.86, 0.41] : null) });
  assert.equal(by(sug, 'route-plan-points').style.by['p-end'].pulse, false);
  assert.deepEqual(by(sug, 'route-plan-lines').style.by['p-k-walk'].dash, [8, 6]); assert.equal(by(sug, 'route-plan-lines').style.by['p-k-walk'].opacity, 0.8);
  const walk = planRoute(graph, { pos: { view: 'town_harbour', x: 0.25, y: 0.7 } }, { node: 'light' }, { env: { tree, pos: t => (t.view ? { view: t.view, x: t.at[0], y: t.at[1] } : null), extent: () => [1000, 625] } });
  const w = planLayers(graph, walk, 'town_harbour', { ...base, posOf: posOn('town_harbour'), endPos: k => (k === 'from' ? [0.25, 0.7] : [0.85, 0.4]) });
  assert.ok(by(w, 'route-plan-lines').features.some(f => f.kind === 'p-walk'), 'an access walk is drawn from the place to its station');
});

test('pathOf: the plan as one polyline on a view, empty when no leg is there', () => {
  const plan = planRoute(graph, { node: 'keep' }, { node: 'light' }, { env: { tree } });
  assert.deepEqual(pathOf(graph, plan, 'town_hill', posOn('town_hill'), 0.625), [[0.2, 0.3], [0.375, 0.3], [0.5, 0.5]]);
  const port = pathOf(graph, plan, 'town_harbour', posOn('town_harbour'), 0.625);
  assert.equal(port[0].join(), '0.3,0.6'); assert.equal(port.at(-1).join(), '0.85,0.4'); assert.ok(port.length >= 4);
  assert.deepEqual(pathOf(graph, plan, 'elsewhere', () => null), []);
  assert.deepEqual(pathOf(graph, { legs: [{ kind: 'walk', stops: [] }] }, 'town_hill', posOn('town_hill')), []);
});
