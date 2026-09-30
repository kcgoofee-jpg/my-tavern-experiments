// S4-4 T2: app/util.mjs `tx(key, fallback, vars)` substitutes {vars} in the fallback too, as I18N.tx does: a dictionary that has not arrived (or lacks the key) must not show "{v}".
// util.mjs touches matchMedia / self when it loads: a bare stub of each is enough.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis; globalThis.self = { origin: 'http://localhost' }; globalThis.location = { origin: 'http://localhost' }; globalThis.matchMedia = () => ({ matches: false });
const { tx } = await import('../map/app/util.mjs');

test('tx: the dictionary value when the service has the key; else the fallback with the variables filled in', () => {
  delete window.I18N;
  assert.equal(tx('k', '脚本「{script} v{v}」', { v: '1.2', script: 'S' }), '脚本「S v1.2」', 'no service yet');
  assert.equal(tx('k', 'plain'), 'plain'); assert.equal(tx('k', 'a {x} b {x}', { x: 1 }), 'a 1 b 1'); assert.equal(tx('k', 'keep {y}', { x: 1 }), 'keep {y}');
  window.I18N = { t: (k, v) => (k === 'has' ? `value ${v?.v}` : k) };
  assert.equal(tx('has', 'fallback', { v: 3 }), 'value 3', 'the service answered');
  assert.equal(tx('missing', 'fallback {v}', { v: 4 }), 'fallback 4', 'the service returned the key itself = not found');
  delete window.I18N;
});
