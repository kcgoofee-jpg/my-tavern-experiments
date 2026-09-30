// K-R70 the overlay's ui block: applyOverlayUi merge rules and the first pack's block through fromV1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOverlayUi } from '../map/core/overlay-v2.mjs';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { edenInputs } from './helpers/eden-inputs.mjs';

const base = { start: 'w', theme: { accent: '#e6c36a', views: { a: { tokens: { '--bg': '#111111', '--ink': '#eeeeee' } } } }, legend: [{ type: 'x', label: 'X' }] };

test('K-R70 merge: views by id, tokens / light key by key, legend replaced whole, x-… overridden', () => {
  const p = [], r = applyOverlayUi(base, { theme: { views: { a: { tokens: { '--bg': '#222222' }, light: { '--bg': '#ffffff' } }, b: { tokens: { '--accent': '#ff0000' } } } }, legend: [{ type: 'y', label: 'Y' }], 'x-event-level': 'a' }, p);
  assert.deepEqual(p, []);
  assert.deepEqual(r.theme.views.a, { tokens: { '--bg': '#222222', '--ink': '#eeeeee' }, light: { '--bg': '#ffffff' } });
  assert.deepEqual(r.theme.views.b, { tokens: { '--accent': '#ff0000' } });
  assert.equal(r.theme.accent, '#e6c36a'); assert.equal(r.start, 'w');
  assert.deepEqual(r.legend, [{ type: 'y', label: 'Y' }]); assert.equal(r['x-event-level'], 'a');
});
test('K-R70 merge: pure; no ui leaves the converted block alone', () => {
  const frozen = JSON.parse(JSON.stringify(base)), r = applyOverlayUi(base, { legend: [] });
  assert.deepEqual(base, frozen); assert.notEqual(r, base);
  assert.deepEqual(applyOverlayUi(base, undefined), base); assert.equal(applyOverlayUi(undefined, undefined), undefined);
  assert.deepEqual(applyOverlayUi(undefined, { 'x-event-level': 'a' }), { 'x-event-level': 'a' });
});
test('K-R70 lenient: a bad id or token is dropped and listed, the rest applies', () => {
  const p = [], r = applyOverlayUi(undefined, { theme: { views: { 'Bad Id': { tokens: { '--bg': '#000000' } }, ok: { tokens: { '--bg': 'red;background:url(x)', '--ink': '#abcdef', '--evil': 'red', '--glow': '1px 0 #fff, 2px 0 #fff, 3px 0 #fff, 4px 0 #fff' }, light: 'nope' }, n: 5 } }, legend: 'x' }, p);
  assert.deepEqual(r.theme.views, { ok: { tokens: { '--ink': '#abcdef' } } });
  assert.deepEqual(p.map(e => e.code).sort(), ['overlay-legend-invalid', 'overlay-token-invalid', 'overlay-token-invalid', 'overlay-token-invalid', 'overlay-token-invalid', 'overlay-view-invalid', 'overlay-view-invalid'].sort());
  const q = []; applyOverlayUi(undefined, 7, q); assert.deepEqual(q, [{ code: 'overlay-ui-invalid' }]);
  const t = []; applyOverlayUi(undefined, { theme: 3 }, t); assert.deepEqual(t, [{ code: 'overlay-theme-invalid' }]);
});
test('K-R70: fromV1 merges the overlay ui over the derived ui and lists the problems', () => {
  const r = fromV1({ ...edenInputs(), overlay: { schema: 2, ui: { theme: { views: { tc_mid: { tokens: { '--bg': '#010203', '--x': 'red' } } } }, 'x-event-level': 'tc_mid' } } });
  assert.equal(r.pack.ui.theme.accent, edenInputs().manifest.theme.accent); assert.equal(r.pack.ui['x-event-level'], 'tc_mid');
  assert.deepEqual(r.pack.ui.theme.views.tc_mid.tokens, { '--bg': '#010203' });
  assert.ok(r.problems.some(p => p.code === 'overlay-token-invalid' && p.name === '--x'));
  assert.ok(fromV1({ ...edenInputs(), overlay: { schema: 2, nodes: [] } }).pack.ui.theme.views === undefined);
});
