// S7-2 T8 (docs/ui-refactor.md 2.6): label tiers and caps. The DOM half of declutter() is measured by tools/browser/s7_hit.mjs --labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { labelCaps, tierOf } from '../map/core/label-tiers.mjs';

test('caps: 12 L1 / 30 L2 on desktop, 6 / 15 on a phone', () => {
  assert.deepEqual(labelCaps(false), { cap1: 12, cap2: 30 }); assert.deepEqual(labelCaps(true), { cap1: 6, cap2: 15 }); assert.deepEqual(labelCaps(), { cap1: 12, cap2: 30 });
});
test('the n-th label that finds room is L1 up to cap1, L2 up to cap1 + cap2, then hidden (null)', () => {
  const c = labelCaps(true);
  assert.deepEqual([1, 6, 7, 21, 22, 40].map(n => tierOf(n, c)), ['l1', 'l1', 'l2', 'l2', null, null]);
  const d = labelCaps(false); assert.deepEqual([1, 12, 13, 42, 43].map(n => tierOf(n, d)), ['l1', 'l1', 'l2', 'l2', null]);
});
test('declutter(): the player marker is never hidden, the level strip / foot / header are obstacles, the pass reports its duration', () => {
  const s = readFileSync(new URL('../map/app/sharpness-tiers.mjs', import.meta.url), 'utf8');
  assert.match(s, /rank\(e\) === 0\) e\.classList\.remove\('lhide'\)/); assert.match(s, /'#foot', '#hereGo', 'header'/); assert.match(s, /declutterMs = performance\.now\(\) - t0/); assert.match(s, /tierOf\(\+\+placed, caps\)/);
});
