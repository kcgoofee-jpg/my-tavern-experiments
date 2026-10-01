// S8-4b (K-R111, K-R113): the host's route flow (tavern/route-flow.mjs). The plan the viewer sends is re-checked (checkPlan), held and echoed; arrival, a chat change and 20 messages clear it; the class
// macro `{{eden_route}}` is the last player trip plus the planned route, and with no plan it is byte-identical to the old callback (a frozen copy is below); suggestions: at most 3, 20 messages, via the llm flow state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouteFlow, DEPS, PLAN_AGE } from '../map/tavern/route-flow.mjs';
import { setGeo } from '../map/tavern/events-parse.mjs';
import { planRoute } from '../map/core/router.mjs';
import { EMPTY, OPS_LIMITS, add, age } from '../map/tavern/nav-ops.mjs';
import { tree, graph, env, TOWN, NODES } from './transit_fixture.mjs';

const nodeOf = text => NODES.find(n => n.name === text)?.id ?? null;
const geoFor = lang => ({ tree, transit: TOWN, graph: () => graph, lang, place: t => (nodeOf(t) ? { node: nodeOf(t) } : null), taxonomy: () => ({}) });
const PLAN = (a = 'keep', b = 'light') => planRoute(graph, { node: a }, { node: b }, { env });

function mk({ lang = 'zh', trips = [], alive = true, floor = 10 } = {}) {
  const posts = [], reg = []; setGeo(geoFor(lang));
  const host = { here: 'Old Keep', floorNow: floor, alive, life: { dead: false }, contextPipeline: { trips }, userName: s => `U(${s})`, post: m => posts.push(m), addRoutes: (rows, ctx) => posts.push({ routes: rows, ctx }),
    flyMark: p => '<span style="display:none" data-eden-fly="' + p.replace(/"/g, '') + '"></span>',
    tavernhelperApiModule: { registerMacros: (fn, get) => { reg.push(get); return () => reg.push('off'); } } };
  const rf = createRouteFlow(host); return { rf, host, posts, reg };
}
const last = p => p.at(-1);

test('the factory needs every dep and exports its list', () => {
  assert.ok(DEPS.includes('flyMark') && DEPS.includes('addRoutes'));
  assert.throws(() => createRouteFlow({}), /route-flow: missing dep/);
});

test('onPlan: an accepted plan is held and echoed with the host\'s rebuilt copy; a refused one leaves the held plan; null clears', () => {
  const { rf, posts } = mk(), p = PLAN();
  rf.onPlan({ plan: { ...p, from: { ...p.from, name: 'Spoofed' }, min: 1 } });
  assert.equal(rf.held.plan.min, p.min, 'minutes are the network\'s'); assert.equal(rf.held.plan.from.name, 'Old Keep', 'names are rebuilt from the tree'); assert.equal(rf.held.at, 10);
  assert.deepEqual(last(posts), { type: 'eden-map:route', plan: rf.held.plan });
  const before = rf.held;
  rf.onPlan({ plan: { ...p, legs: [{ ...p.legs[0], stops: ['keep', 'nowhere'] }] } });
  assert.equal(rf.held, before, 'a refused plan changes nothing'); assert.equal(last(posts).plan, before.plan, 'and the held plan is echoed');
  rf.onPlan({ plan: { v: 2 } }); assert.equal(rf.held, before);
  rf.onPlan({ plan: null }); assert.equal(rf.held, null); assert.deepEqual(last(posts), { type: 'eden-map:route', plan: null });
  rf.onPlan({}); assert.equal(rf.held, null, 'a missing plan is a clear');
});

test('nothing is posted while the viewer is closed (alive false), but the plan is still held', () => {
  const { rf, posts } = mk({ alive: false }); rf.onPlan({ plan: PLAN() });
  assert.ok(rf.held); assert.equal(posts.length, 0);
});

test('arrival: the destination, or a place inside it, clears the plan; elsewhere does not', () => {
  const { rf, posts } = mk(); rf.onPlan({ plan: PLAN('keep', 'market') }); posts.length = 0;
  rf.onHere('Clock Tower'); assert.ok(rf.held, 'another place on the way: kept');
  rf.onHere('Stall Row'); assert.equal(rf.held, null, 'inside the destination (a room of the market): arrived'); assert.deepEqual(last(posts), { type: 'eden-map:route', plan: null });
  rf.onPlan({ plan: PLAN('keep', 'light') }); rf.onHere('Lighthouse'); assert.equal(rf.held, null, 'the destination itself');
  rf.onPlan({ plan: PLAN('keep', 'light') }); rf.onHere('{{user}}nowhere'); assert.ok(rf.held, 'an unknown place changes nothing');
});

test('ageing: a plan older than 20 messages is cleared (20 exactly is kept); a chat change clears; ready sends the held plan again', () => {
  const { rf, posts } = mk({ floor: 5 }); rf.onPlan({ plan: PLAN() });
  rf.onRound(5 + PLAN_AGE); assert.ok(rf.held); rf.onRound(5 + PLAN_AGE + 1); assert.equal(rf.held, null); assert.equal(last(posts).plan, null);
  rf.onPlan({ plan: PLAN() }); posts.length = 0; rf.onReady(); assert.equal(posts.length, 1); assert.equal(last(posts).plan.min, 15);
  rf.onChat(); assert.equal(rf.held, null); assert.equal(last(posts).plan, null); posts.length = 0; rf.onReady(); assert.equal(posts.length, 0, 'nothing held: nothing sent');
  rf.onRound(NaN); rf.onChat(); assert.equal(posts.length, 0);
});

// today's callback of macroSet for eden_route, frozen (S8-4b is allowed to add the plan, never to change this text)
const OLD = trips => { const t = (trips || []).filter(x => !x.who).at(-1); return t ? `${t.from} → ${t.to}` : ''; };
const LISTS = [[], undefined, [{ from: 'A', to: 'B' }], [{ from: 'A', to: 'B' }, { from: 'B', to: 'C', who: 'Mira' }], [{ from: 'A', to: 'B' }, { from: '旧堡', to: '灯塔' }, { from: 'x', to: 'y', who: 'W' }]];

test('{{eden_route}} with no plan is byte-identical to the old callback for five trip lists; eden_here and eden_fly are unchanged', () => {
  for (const trips of LISTS) { const { rf } = mk({ trips }); assert.equal(rf.macroValue('eden_route'), OLD(trips)); assert.equal(rf.macroValue('eden_route', null), OLD(trips)); }
  const { rf } = mk();
  assert.equal(rf.macroValue('eden_here'), 'U(Old Keep)');
  assert.equal(rf.macroValue('eden_fly', [null, ' Market ']), '<span style="display:none" data-eden-fly="Market"></span>U(Market)');
  assert.equal(rf.macroValue('eden_fly', []), '<span style="display:none" data-eden-fly="Old Keep"></span>U(Old Keep)');
  assert.equal(rf.macroValue('eden_fly', [null, 'A"B']), '<span style="display:none" data-eden-fly="AB"></span>U(A"B)');
});

test('{{eden_route}} with the town plan keep -> light: the last trip, a separator, the plan sentence (zh and en, exact)', () => {
  const zh = mk({ trips: [{ from: 'A', to: 'B' }] }); zh.rf.onPlan({ plan: PLAN() });
  const body = '计划路线：Old Keep → Market（山道电车线，约 3 分钟）；Market → Fish Hall（缆车线，约 4 分钟）；Fish Hall → Lighthouse（步行，约 5 分钟）。全程约 15 分钟，换乘 1 次。';
  assert.equal(zh.rf.macroValue('eden_route'), 'A → B · ' + body);
  const noTrip = mk(); noTrip.rf.onPlan({ plan: PLAN() }); assert.equal(noTrip.rf.macroValue('eden_route'), body, 'no trip: just the plan');
  const en = mk({ lang: 'en', trips: [{ from: 'A', to: 'B' }] }); en.rf.onPlan({ plan: PLAN() });
  assert.equal(en.rf.macroValue('eden_route'), 'A → B · Planned route: Old Keep → Market (Hill tram, about 3 min); Market → Fish Hall (Funicular, about 4 min); Fish Hall → Lighthouse (Walk, about 5 min). About 15 min in all, 1 change(s).');
  en.rf.onPlan({ plan: null }); assert.equal(en.rf.macroValue('eden_route'), 'A → B', 'cleared: the old text again');
});

test('macroSet registers the macro callback while on and removes it when off or dead', () => {
  const { rf, reg, host } = mk(); rf.macroSet(true); assert.equal(typeof reg[0], 'function'); assert.equal(reg[0]('eden_here'), 'U(Old Keep)');
  rf.macroSet(false); assert.equal(reg.at(-1), 'off');
  host.life.dead = true; rf.macroSet(true); assert.equal(reg.length, 2, 'a dead script registers nothing');
});

test('suggestions: route-flow forwards to the llm flow state; at most 3 rows, stamped, 20 messages', () => {
  const { rf, posts } = mk(); rf.addSuggestions([{ to: 'x' }], { floor: 4, map: 'town_hill' }); assert.deepEqual(last(posts), { routes: [{ to: 'x' }], ctx: { floor: 4, map: 'town_hill' } });
  assert.equal(OPS_LIMITS.routes, 3);
  let s = EMPTY; for (let i = 0; i < 5; i++) s = add(s, { routes: [{ to: 'r' + i, toNode: 'light' }] }, { floor: 10, map: 'town_hill' });
  assert.deepEqual(s.routes.map(r => r.to), ['r2', 'r3', 'r4']); assert.deepEqual(s.routes[0], { to: 'r2', toNode: 'light', floor: 10, map: 'town_hill' });
  assert.equal(age(s, 30).routes.length, 3, '20 exactly is kept'); assert.equal(age(s, 31).routes.length, 0);
  assert.equal(EMPTY.routes.length, 0);
});
