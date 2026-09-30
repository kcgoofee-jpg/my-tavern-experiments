import test from 'node:test';
import assert from 'node:assert/strict';
import { knownFor, tracker, loadKnown, probeName } from '../tools/browser/known.mjs';

const LIST = [{ probe: 'p', check: 'key X', since: 's', reason: 'r', owner_step: 'S5' }];

test('a failing check listed for the same probe is KNOWN; other probes and other checks are not', () => {
  assert.ok(knownFor('p', 'desktop: key X absent', LIST));
  assert.equal(knownFor('q', 'desktop: key X absent', LIST), null);
  assert.equal(knownFor('p', 'something else', LIST), null);
});

test('tracker reports a listed check that passes again as fixed', () => {
  const t = tracker('p', LIST);
  assert.equal(t.judge('phone: key X absent', false)?.owner_step, 'S5');
  assert.equal(t.fixed().length, 0);
  t.judge('phone: key X absent', true);
  assert.equal(t.fixed().length, 1);
});

test('the committed baseline is well formed', () => {
  const list = loadKnown();
  assert.ok(Array.isArray(list));   // empty once every listed failure is fixed (S4-2 fixed the last one)
  for (const k of list) for (const f of ['probe', 'check', 'since', 'reason', 'owner_step']) assert.ok(k[f], `${k.probe}: ${f}`);
  assert.equal(probeName('/x/tools/browser/pack_town.mjs'), 'pack_town');
});
