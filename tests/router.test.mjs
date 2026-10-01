// core/router.mjs (K-R109): graph, attachment, cost and tie-breaks, plans, checkPlan, planText, routeOp, on the town network of docs/transit-schema.md §10.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, attach, planRoute, checkPlan, planText, routeOp, KERNEL_TEMPLATES } from '../map/core/router.mjs';
import { normTransit, modeLabel, lineName, stationName } from '../map/core/transit-spec.mjs';
import { tree, graph, TOWN, env, RAW, norm } from './transit_fixture.mjs';

const at = node => ({ node });
const plan = (a, b, o = {}) => planRoute(graph, at(a), at(b), { env, ...o });
const summary = p => p.legs.map(l => `${l.kind} ${l.line || l.mode} [${l.stops.join(', ')}]`);

test('graph: edges in declaration order, interchanges derived', () => {
  assert.equal(buildGraph(null), null);
  assert.equal(buildGraph({ stations: [] }), null);
  assert.deepEqual(graph.adj.get('market').map(e => `${e.kind}:${e.line}:${e.to}`), ['ride:c1:fish', 'ride:t2:keep', 'ride:t2:clock']);
  assert.deepEqual([...graph.interchanges], ['market'], 'two lines meet there; a walk link between stations of one line makes none');
});

test('town: keep -> light is 15 min with one change', () => {
  const p = plan('keep', 'light');
  assert.equal(p.min, 15); assert.equal(p.changes, 1);
  assert.deepEqual(summary(p), ['ride t2 [keep, market]', 'ride c1 [market, fish]', 'link walk [fish, pier, light]']);
  assert.deepEqual(p.modes, ['tram', 'cable', 'walk']);
  assert.equal(p.danger, 1, 'the cape district around the lighthouse');
  assert.deepEqual(p.from, { node: 'keep', station: 'keep', name: 'Old Keep' });
  assert.deepEqual(p.to, { node: 'light', station: 'light', name: 'Lighthouse' });
  assert.equal(p.v, 1); assert.equal(p.src, 'user');
});
test('town: clock -> fish is 9 min, light -> keep is 15 min', () => {
  const a = plan('clock', 'fish'); assert.equal(a.min, 9); assert.equal(a.changes, 1);
  const b = plan('light', 'keep'); assert.equal(b.min, 15); assert.equal(b.changes, 1);
  assert.equal(plan('keep', 'light', { src: 'op' }).src, 'op');
});

test('attach: at, inside, within, walk, nothing', () => {
  assert.deepEqual(attach(graph, at('market'), env), [{ station: 'market', min: 0, how: 'at' }]);
  assert.deepEqual(attach(graph, at('market_room'), env), [{ station: 'market', min: 0, how: 'inside' }]);
  assert.deepEqual(attach(graph, at('town_hill'), env).map(a => `${a.how}:${a.station}`), ['within:keep', 'within:market', 'within:clock']);
  const w = attach(graph, { pos: { view: 'town_harbour', x: 0.25, y: 0.7 } }, env);   // 300 m west of the pier on a 1000 m wide view
  assert.ok(w.every(a => a.how === 'walk') && w.length <= 4);
  assert.equal(w.find(a => a.station === 'pier').min, 4.7, '300 m x 1.25 / 80 m per min');
  assert.deepEqual(w.map(a => a.min), [...w.map(a => a.min)].sort((a, b) => a - b), 'nearest first');
  assert.equal(attach(graph, at('town'), env).length, 5, 'the root holds the five node stations (the pier has no node)');
});
test('attach: nothing attaches without a position or beyond the access limit; access 0 means nodes only', () => {
  assert.deepEqual(attach(graph, {}, env), []);
  assert.deepEqual(attach(graph, { pos: { view: 'town_harbour', x: 0.99, y: 0.99 } }, { ...env, extent: () => [100000, 100000] }), []);
  const g0 = buildGraph(norm({ ...RAW, options: { access_max_min: 0 } }).transit);
  assert.deepEqual(attach(g0, { pos: { view: 'town_harbour', x: 0.55, y: 0.7 } }, env), []);
});

test('mode filter: rail only, clock -> keep goes by tram', () => {
  assert.equal(plan('clock', 'keep').min, 4, 'the walk link');
  const p = plan('clock', 'keep', { modes: ['tram', 'cable'] });
  assert.equal(p.min, 5); assert.deepEqual(summary(p), ['ride t2 [clock, market, keep]']); assert.equal(p.changes, 0);
});

test('direct walk beats the network, and a same-node plan is null', () => {
  const p = planRoute(graph, { pos: { view: 'town_hill', x: 0.2, y: 0.35 } }, { pos: { view: 'town_hill', x: 0.3, y: 0.35 } }, { env });
  assert.deepEqual(p.legs, [{ kind: 'walk', mode: 'walk', line: null, stops: [], min: 1.6 }]);
  assert.equal(p.min, 2);
  assert.equal(plan('keep', 'keep'), null);
  assert.equal(plan('market', 'market_room'), null, 'one inside the other');
  assert.equal(plan('keep', 'nowhere'), null);
});

test('determinism: 100 runs give identical JSON', () => {
  const one = JSON.stringify(plan('keep', 'light'));
  for (let i = 0; i < 100; i++) assert.equal(JSON.stringify(plan('keep', 'light')), one);
});

test('ties: minutes, then changes, then stops, then declaration order', () => {
  const line = (id, stops, min = 1) => ({ id, name: id, mode: 'maglev', color: '#112233', stops, min });
  const g = lines => buildGraph(normTransit({ stations: ['a', 'b', 'c', 'd'].map(id => ({ id, node: id })), lines }).transit);
  const route = (gr, a, b) => planRoute(gr, { node: a }, { node: b }, { env: {} });
  assert.deepEqual(route(g([line('x', ['a', 'b', 'd']), line('y', ['a', 'c', 'd'])]), 'a', 'd').legs.map(l => l.line), ['x'], 'equal in everything: the line declared first');
  assert.deepEqual(route(g([line('y', ['a', 'c', 'd']), line('x', ['a', 'b', 'd'])]), 'a', 'd').legs.map(l => l.line), ['y']);
  assert.deepEqual(route(g([line('x', ['a', 'b', 'd']), line('z', ['a', 'd'], 2)]), 'a', 'd').legs.map(l => l.line), ['z'], 'equal minutes: fewer stops');
  const two = route(g([line('x', ['a', 'b'], 1), line('y', ['b', 'd'], 1), line('z', ['a', 'c', 'd'], 1)]), 'a', 'd');
  assert.deepEqual(two.legs.map(l => l.line), ['z'], 'equal minutes (2 vs 2 + a change): the plan with no change wins');
  assert.equal(route(g([line('x', ['a', 'b'])]), 'a', 'd'), null, 'no path');
});
test('checkPlan: accepts the planner output unchanged', () => {
  for (const [a, b] of [['keep', 'light'], ['clock', 'fish'], ['light', 'keep'], ['clock', 'keep']]) { const p = plan(a, b); assert.deepEqual(checkPlan(graph, p, { tree }), p); }
  const d = planRoute(graph, { pos: { view: 'town_hill', x: 0.2, y: 0.35 } }, { pos: { view: 'town_hill', x: 0.3, y: 0.35 } }, { env });
  assert.deepEqual(checkPlan(graph, d, { tree }), d);
  const w = planRoute(graph, { pos: { view: 'town_harbour', x: 0.25, y: 0.7 } }, at('light'), { env });
  assert.equal(w.legs[0].kind, 'walk'); assert.deepEqual(checkPlan(graph, w, { tree }), w);
});
test('checkPlan: recomputes tampered minutes, caps walks and rebuilds names', () => {
  const p = JSON.parse(JSON.stringify(plan('keep', 'light')));
  p.min = 1; p.changes = 0; p.modes = ['x']; p.danger = 0; p.legs.forEach(l => { l.min = 0.1; }); p.from.name = 'evil'; p.to.name = '<b>x</b>'; p.extra = 1; p.legs[0].name = 'evil';
  assert.deepEqual(checkPlan(graph, p, { tree }), plan('keep', 'light'));
  const w = JSON.parse(JSON.stringify(planRoute(graph, { pos: { view: 'town_harbour', x: 0.25, y: 0.7 } }, at('light'), { env }))); w.legs[0].min = 99;
  assert.equal(checkPlan(graph, w, { tree }).legs[0].min, 12, 'an access walk is capped at access_max_min');
  const d = { v: 1, legs: [{ kind: 'walk', mode: 'walk', stops: [], min: 99 }], from: {}, to: {} };
  assert.equal(checkPlan(graph, d, { tree }).legs[0].min, 24, 'a direct walk at twice that');
});
test('checkPlan: refuses what is not on the network', () => {
  const ok = () => JSON.parse(JSON.stringify(plan('keep', 'light')));
  const no = (f, msg) => { const p = ok(); f(p); assert.equal(checkPlan(graph, p, { tree }), null, msg); };
  no(p => { p.legs[0].stops = ['keep', 'clock']; }, 'non-adjacent ride');
  no(p => { p.legs[1].stops = ['pier', 'market']; }, 'ride between unconnected stations');
  no(p => { p.legs[1].stops = ['keep', 'fish']; }, 'broken chain');
  no(p => { p.legs[2].stops = ['fish', 'ghost']; }, 'unknown station');
  no(p => { p.from.node = 'ghost'; }, 'missing node');
  no(p => { p.v = 2; }, 'version');
  no(p => { p.legs[0].line = 't9'; }, 'unknown line');
  no(p => { p.legs[0].mode = 'cable'; }, 'mode of another line');
  no(p => { p.legs[2].mode = 'air'; }, 'link of another mode');
  no(p => { p.legs = []; }, 'no legs');
  no(p => { p.legs.splice(1, 0, { kind: 'walk', mode: 'walk', line: null, stops: ['market'], min: 1 }); }, 'a walk in the middle');
  no(p => { p.legs[0].kind = 'teleport'; }, 'unknown kind');
  assert.equal(checkPlan(graph, null, { tree }), null);
  assert.equal(checkPlan(null, ok(), { tree }), null);
});
test('checkPlan: oneway segments only run one way', () => {
  const g = buildGraph(norm({ ...RAW, lines: [{ ...RAW.lines[1], oneway: true }, RAW.lines[0]] }).transit);
  assert.equal(planRoute(g, at('clock'), at('keep'), { env, modes: ['tram'] }), null);
  const fwd = planRoute(g, at('keep'), at('clock'), { env, modes: ['tram'] });
  assert.equal(fwd.min, 5);
  const back = JSON.parse(JSON.stringify(fwd)); back.legs[0].stops.reverse();
  assert.equal(checkPlan(g, back, { tree }), null);
});

test('planText: kernel templates (zh, en), pack templates, the danger sentence', () => {
  const p = plan('keep', 'light');
  const o = lang => ({ lang, nameOf: id => stationName(TOWN, id, lang, n => tree.get(n)?.name), modeLabel: m => modeLabel(TOWN, m, lang), lineName: l => lineName(TOWN, l, lang) });
  const zh = planText(p, o('zh'));
  assert.equal(zh, '计划路线：Old Keep → Market（山道电车线，约 3 分钟）；Market → Fish Hall（缆车线，约 4 分钟）；Fish Hall → Lighthouse（步行，约 5 分钟）。全程约 15 分钟，换乘 1 次。');
  const en = planText(p, o('en'));
  assert.equal(en, 'Planned route: Old Keep → Market (Hill tram, about 3 min); Market → Fish Hall (Funicular, about 4 min); Fish Hall → Lighthouse (Walk, about 5 min). About 15 min in all, 1 change(s).');
  const own = planText(p, { ...o('en'), templates: { en: { route_plan: 'Go: {legs} ({min}/{changes})', route_leg: '{from}>{to}' } } });
  assert.equal(own, 'Go: Old Keep>Market; Market>Fish Hall; Fish Hall>Lighthouse (15/1)');
  const hot = { ...p, danger: 2 };
  assert.ok(planText(hot, o('zh')).endsWith('途经危险区域（等级 2）。'));
  assert.ok(planText(hot, o('en')).endsWith(' Passes a dangerous district (level 2).'));
  assert.ok(!planText({ ...p, danger: 1 }, o('en')).includes('dangerous'));
  assert.equal(KERNEL_TEMPLATES.zh.join, '；');
});
test('planText: never throws; a missing name is ?', () => {
  assert.equal(typeof planText(null), 'string');
  assert.equal(typeof planText({}, {}), 'string');
  const p = plan('keep', 'light');
  assert.ok(planText(p, { lang: 'en' }).includes('? → ?'));
  const d = planRoute(graph, { pos: { view: 'town_hill', x: 0.2, y: 0.35 }, name: 'Here' }, { pos: { view: 'town_hill', x: 0.3, y: 0.35 }, name: 'There' }, { env });
  assert.ok(planText(d, { lang: 'en', modeLabel: () => 'Walk' }).includes('Here → There (Walk, about 2 min)'));
});

test('routeOp: a valid row, unknown names, same node, a long why, no graph', () => {
  const locate = t => ({ Lighthouse: 'light', 'Old Keep': 'keep', Stall: 'market_room', Market: 'market' })[t] || null;
  const ctx = { graph, locate, here: { node: 'keep', name: 'Old Keep' }, floor: 12, map: 'town_hill', tree };
  assert.deepEqual(routeOp({ to: 'Lighthouse', why: 'a view' }, ctx), { from: 'Old Keep', to: 'Lighthouse', fromNode: 'keep', toNode: 'light', why: 'a view', floor: 12, map: 'town_hill' });
  assert.deepEqual(routeOp({ to: 'Lighthouse', from: 'Market' }, { ...ctx, here: 'keep' }), { from: 'Market', to: 'Lighthouse', fromNode: 'market', toNode: 'light', why: '', floor: 12, map: 'town_hill' });
  assert.equal(routeOp({ to: 'Nowhere' }, ctx), null);
  assert.equal(routeOp({ to: 'Old Keep' }, ctx), null, 'same node');
  assert.equal(routeOp({ to: 'Stall', from: 'Market' }, ctx), null, 'one inside the other');
  assert.equal(routeOp({ to: 'Lighthouse', why: 'x'.repeat(61) }, ctx), null);
  assert.equal(routeOp({ to: 'x'.repeat(41) }, ctx), null);
  assert.equal(routeOp({ to: 'Lighthouse' }, { ...ctx, graph: null }), null);
  assert.equal(routeOp('Lighthouse', ctx), null);
  assert.equal(routeOp({ to: 'Lighthouse', from: 5 }, ctx), null);
});
