// S6-3 (K-R67 extension, K-R77): the overlay's items.pickup words reach the profile; nothing else under `items` is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyOverlayItems } from '../map/core/overlay-v2.mjs';
import { profileOf, profileFromV1, KERNEL } from '../map/core/profile.mjs';
import { names } from '../map/core/pickup.mjs';

test('applyOverlayItems: lists are united per language, the input is not touched', () => {
  const base = { pickup: { en: { verbs: ['snatches'] } } };
  const r = applyOverlayItems(base, { items: { pickup: { en: { verbs: ['snatches', 'nabs'], not_items: ['the tide'] }, zh: { verbs_strict: ['领到'] } } } });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.items.pickup.en.verbs, ['snatches', 'nabs']);
  assert.deepEqual(r.items.pickup.en.not_items, ['the tide']);
  assert.deepEqual(r.items.pickup.zh.verbs_strict, ['领到']);
  assert.deepEqual(base, { pickup: { en: { verbs: ['snatches'] } } });
});
test('applyOverlayItems: no block changes nothing; a bad shape is a problem; other keys are ignored and listed', () => {
  assert.deepEqual(applyOverlayItems(undefined, {}), { items: undefined, problems: [] });
  assert.deepEqual(applyOverlayItems(undefined, { items: 3 }).problems, [{ code: 'overlay-items-invalid' }]);
  assert.deepEqual(applyOverlayItems(undefined, { items: { pickup: 'x' } }).problems, [{ code: 'overlay-items-invalid' }]);
  const bad = applyOverlayItems(undefined, { items: { pickup: { en: { verbs: 'x', not_items: [''] } } } });
  assert.deepEqual(bad.problems.map(p => p.code), ['overlay-items-invalid', 'overlay-items-invalid']);
  const ig = applyOverlayItems(undefined, { items: { stash: [{ name: 'a', node: 'b' }], 'x-note': 1, pickup: { en: { verbs: ['nabs'] } } } });
  assert.deepEqual(ig.problems, [{ code: 'overlay-items-ignored', key: 'stash' }]);
  assert.equal(ig.items.stash, undefined, 'stash is not read from an overlay');
  assert.deepEqual(ig.items.pickup.en.verbs, ['nabs']);
});
test('profileFromV1 carries the overlay pickup words; profileOf unions the languages; the kernel has none', () => {
  const p = profileFromV1({ manifest: {}, overlay: { schema: 2, items: { pickup: { zh: { verbs: ['领取'], verbs_off: ['收了'] }, en: { verbs: ['nabs'], not_items: ['a thing'] } } } } });
  assert.deepEqual(p.pickup, { verbs: ['领取', 'nabs'], verbs_strict: [], verbs_off: ['收了'], not_items: ['a thing'] });
  assert.deepEqual(names('Mara nabs a lamp.', { vocab: p.pickup }), ['lamp']);
  assert.deepEqual(KERNEL.pickup, { verbs: [], verbs_strict: [], verbs_off: [], not_items: [] });
  const MIN = JSON.parse(readFileSync(fileURLToPath(new URL('../map/packs/minimal/manifest.json', import.meta.url)), 'utf8'));
  const m = profileOf(MIN);
  assert.deepEqual(m.pickup, { verbs: ['snatches'], verbs_strict: [], verbs_off: [], not_items: ['the tide'] });
  assert.deepEqual(names('Mara snatches the Brass Key.', { vocab: m.pickup }), ['Brass Key']);
  assert.deepEqual(names('The gull snatches the tide.', { vocab: m.pickup }), []);
});
