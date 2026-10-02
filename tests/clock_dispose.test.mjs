// I-34: the clock popup hangs two listeners on the host document, which outlives the panel. An in-place restart tears the panel down; the listeners must go with it
// (before this, each restart left one old panel DOM alive: about 6 MB and 1600 nodes per restart in the probe).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountClockPop } from '../map/tavern/clock-view.mjs';

function mount() {
  const added = [], removed = [], doc = { createElement: () => ({ setAttribute() {}, addEventListener() {}, contains: () => false, hidden: true }), addEventListener: (t, f) => added.push([t, f]), removeEventListener: (t, f) => removed.push([t, f]) };
  const clk = { ownerDocument: doc, after() {}, setAttribute() {}, addEventListener() {}, classList: { toggle() {} }, isConnected: true, focus() {} };
  return { clk, added, removed, api: mountClockPop(clk, {}) };
}

test('clock popup: the document listeners are removed by the teardown hook', () => {
  const { clk, added, removed } = mount();
  assert.equal(added.length, 2); assert.equal(typeof clk.emDispose, 'function');
  clk.emDispose();
  assert.equal(removed.length, 2); assert.deepEqual(removed.map(r => r[0]).sort(), ['click', 'keydown']); assert.equal(clk.emDispose, null);
  for (const [t, f] of added) assert.ok(removed.some(r => r[0] === t && r[1] === f), 'the same function objects are removed');
});

test('clock popup: if the teardown hook was missed, the first event after the panel left the page removes them', () => {
  const { clk, added, removed } = mount();
  clk.isConnected = false;
  added.find(a => a[0] === 'click')[1]({ target: {} });
  assert.equal(removed.length, 2);
});
