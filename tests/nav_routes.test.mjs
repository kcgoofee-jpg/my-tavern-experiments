// S7-1 T6 (K-R130): the AI advisor's OP_ROUTE rows go through routeOp into the suggestion store (llm-flow planRoutes): an accepted row reaches eden-map:ops.routes stamped with floor and map,
// a row the router cannot place is counted as dropped, and without a transit network nothing is drawn while the `why` text joins the toast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmFlow, DEPS } from '../map/tavern/llm-flow.mjs';
import { createFacts } from '../map/tavern/feature-health.mjs';
import { setGeo } from '../map/tavern/events-parse.mjs';

function flow({ graph }) {
  const posts = [], nodes = { 广场: 'sq', 北门: 'gate', 市场: 'mk' };
  setGeo({ graph: () => graph, place: t => (nodes[t] ? { node: nodes[t] } : null), tree: null, layers: () => [] });
  const host = Object.fromEntries(DEPS.map(k => [k, () => null]));
  Object.assign(host, { facts: createFacts(), floorNow: 7, here: '广场', alive: true, post: m => posts.push(m), scriptBase: 'file:///nonexistent/map/', life: { dead: true }, panel: { hidden: true }, GEN: {}, lsGet: () => null, lsSet() {}, hostToast() {}, HS: k => k });
  return { L: createLlmFlow(host), posts };
}
test('an accepted row reaches the ops state with the floor and the map; the player is the default start', () => {
  const { L, posts } = flow({ graph: {} });
  const r = L.planRoutes([{ to: '北门', why: '大路', src: 'op' }], 'tc_mid');
  assert.deepEqual([r.kept, r.dropped, r.whys], [1, 0, []]);
  const m = posts.at(-1); assert.equal(m.type, 'eden-map:ops'); assert.equal(m.routes.length, 1);
  assert.deepEqual([m.routes[0].fromNode, m.routes[0].toNode, m.routes[0].why, m.routes[0].floor, m.routes[0].map], ['sq', 'gate', '大路', 7, 'tc_mid']);
});
test('a row the router cannot place (unknown name, same place) is counted as dropped and sends nothing', () => {
  const { L, posts } = flow({ graph: {} });
  const r = L.planRoutes([{ to: '不存在' }, { to: '广场' }], null);
  assert.deepEqual([r.kept, r.dropped], [0, 2]); assert.equal(posts.length, 0);
});
test('without a transit network nothing is stored; the why text goes to the toast list', () => {
  const { L, posts } = flow({ graph: null });
  const r = L.planRoutes([{ to: '北门', why: '走大路更快' }], null);
  assert.deepEqual([r.kept, r.dropped, r.whys], [0, 1, ['走大路更快']]); assert.equal(posts.length, 0);
});
test('at most three suggestions are kept (the newest)', () => {
  const { L, posts } = flow({ graph: {} });
  for (const to of ['北门', '市场', '北门', '市场']) L.planRoutes([{ to }], 'm');
  assert.equal(posts.at(-1).routes.length, 3);
});
