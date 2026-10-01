// S7-1 T3: feature health (map/tavern/feature-health.mjs): each card's states and reasons from hand-built facts, the caps, the tokens, idle versus not effective, healthSum.
import test from 'node:test';
import assert from 'node:assert/strict';
import { healthOf, healthSum, createFacts, CARD_IDS, MAX_TEXT } from '../map/tavern/feature-health.mjs';
import { tokens } from '../map/tavern/interaction-modes.mjs';

const on = (...keys) => Object.fromEntries(keys.map(k => [k, true]));
const H = (facts = {}) => healthOf({ prefs: {}, api: {}, ...facts });
test('every card id has a row; off cards say off', () => {
  const h = H(); assert.deepEqual(Object.keys(h), [...CARD_IDS]);
  for (const id of ['macros', 'dice', 'ledger', 'spatial', 'wbJit', 'wbXtal', 'nav']) assert.deepEqual([h[id].on, h[id].state, h[id].reason], [false, 'off', 'off'], id);
  assert.equal(h.inject.state, 'off');
});
test('the digest has no switch: idle before a round, working with text and tokens, idle (empty) with none, not effective without the host interface', () => {
  assert.equal(H().digest.state, 'idle');
  const w = H({ digest: { text: '[事态] 火灾', floor: 5 } }).digest; assert.deepEqual([w.state, w.floor, w.tokens], ['working', 5, tokens('[事态] 火灾')]);
  assert.deepEqual([H({ digest: { text: '', floor: 5 } }).digest.state, H({ digest: { text: '', floor: 5 } }).digest.reason], ['idle', 'empty']);
  assert.deepEqual([H({ api: { inject: false } }).digest.state, H({ api: { inject: false } }).digest.reason], ['not-effective', 'no-host-api']);
});
test('status line: working with fields; skipped is not effective; empty after a round is idle; the switch off is off', () => {
  const f = { here: 'sent', present: 'card', time: 'omitted', trips: 'sent' };
  const w = H({ prefs: { inj: true }, state: { text: '[地图状态] 地点：书房', floor: 3, reason: '', fields: f } }).state; assert.deepEqual([w.state, w.fields], ['working', f]);
  assert.deepEqual([H({ prefs: { inj: true }, state: { text: '', reason: 'skipped', floor: 3 } }).state.reason], ['skipped']);
  assert.equal(H({ prefs: { inj: true }, state: { text: '', reason: 'skipped', floor: 3 } }).state.state, 'not-effective');
  assert.deepEqual([H({ prefs: { inj: true }, state: { text: '', reason: 'empty', floor: 3 } }).state.state], ['idle']);
  assert.equal(H({ prefs: { inj: false } }).state.state, 'off');
});
test('macros, dice, ledger, spatial: idle until their first round, then working; spatial without a place is not effective', () => {
  assert.equal(H({ prefs: on('macros'), macros: { here: 'A', route: 'B' } }).macros.state, 'working');
  assert.equal(H({ prefs: on('macros'), api: { macros: false } }).macros.reason, 'no-host-api');
  assert.deepEqual([H({ prefs: on('dice') }).dice.state, H({ prefs: on('dice') }).dice.reason], ['idle', 'no-checks']);
  assert.equal(H({ prefs: on('dice'), dice: { last: '搜刮失败：书房', floor: 9 } }).dice.floor, 9);
  assert.equal(H({ prefs: on('ledgerWrite') }).ledger.state, 'idle');
  assert.equal(H({ prefs: on('ledgerWrite'), ledger: { rows: 2, floor: 4 } }).ledger.stats.rows, 2);
  assert.equal(H({ prefs: on('spatial'), spatial: { text: '', floor: 4, placed: false } }).spatial.reason, 'no-place');
  assert.equal(H({ prefs: on('spatial'), spatial: { text: '{"p":["a"]}', floor: 4, placed: true } }).spatial.state, 'working');
});
test('worldbook JIT and crystallisation: no api, no book, no tags, working', () => {
  assert.equal(H({ prefs: on('wbJit'), api: { worldbook: false } }).wbJit.reason, 'no-host-api');
  assert.equal(H({ prefs: on('wbJit'), jit: { book: false } }).wbJit.reason, 'no-book');
  const j = H({ prefs: on('wbJit'), jit: { book: true, enabled: 3, disabled: 1, floor: 128 } }).wbJit; assert.deepEqual([j.state, j.stats], ['working', { enabled: 3, disabled: 1 }]);
  assert.deepEqual([H({ prefs: on('wbXtal'), xtal: { seenTags: false, written: 0 } }).wbXtal.state, H({ prefs: on('wbXtal'), xtal: { seenTags: false, written: 0 } }).wbXtal.reason], ['idle', 'no-tags']);
  assert.equal(H({ prefs: on('wbXtal'), xtal: { book: false } }).wbXtal.reason, 'no-book');
  assert.equal(H({ prefs: on('wbXtal'), xtal: { written: 2, last: '事实', floor: 7 } }).wbXtal.state, 'working');
});
test('AI advisor: no consent, no config, endpoint error, waiting, idle, working', () => {
  const N = n => H({ prefs: on('nav'), nav: { consent: true, cfgOk: true, ...n } }).nav;
  assert.equal(H({ prefs: on('nav'), nav: { consent: false } }).nav.reason, 'no-consent');
  assert.equal(N({ cfgOk: false }).reason, 'no-config');
  const e = N({ lastStatus: 401, runs: 1 }); assert.deepEqual([e.state, e.reason, e.stats.status], ['not-effective', 'endpoint', 401]);
  assert.equal(N({ lastStatus: 0, runs: 1 }).reason, 'endpoint');
  assert.deepEqual([N({ generating: true }).state, N({ generating: true }).reason], ['idle', 'waiting']);
  assert.equal(N({}).state, 'idle');
  const w = N({ lastStatus: 200, runs: 2, lastN: 2, lastDropped: 1, lastAt: 100, nextAt: 200, lastTokens: 77 }); assert.deepEqual([w.state, w.stats.kept, w.stats.dropped, w.stats.tokens], ['working', 2, 1, 77]);
});
test('map actions into chat: off by mode; idle, working, or no input found', () => {
  assert.equal(H({ inject: { mode: 'off' } }).inject.state, 'off');
  assert.equal(H({ inject: { mode: 'compose', lastOk: null } }).inject.state, 'idle');
  assert.equal(H({ inject: { mode: 'compose', lastOk: true, floor: 3 } }).inject.state, 'working');
  assert.equal(H({ inject: { mode: 'sys', lastOk: false } }).inject.reason, 'no-input');
});
test('texts are capped at 600 characters; healthSum counts on and not effective (idle is not counted)', () => {
  const long = 'x'.repeat(2000), t = H({ digest: { text: long, floor: 1 } }).digest.text;
  assert.equal([...t].length, MAX_TEXT + 1); assert.ok(t.endsWith('…'));
  const h = H({ prefs: { ...on('macros', 'nav'), inj: true }, api: { macros: false }, nav: { consent: false }, state: { text: 'a', floor: 1 } });
  assert.deepEqual(healthSum(h), { n: 4, m: 2 });   // digest + status line + macros + nav are on; macros and nav are not effective
  assert.deepEqual(createFacts().nav.consent, null);
});
