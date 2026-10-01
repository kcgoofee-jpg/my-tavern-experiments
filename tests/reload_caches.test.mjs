// I-29: the memoised normalise and the compiled-once stripBlocks must behave exactly like the plain versions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalise } from '../map/core/lexicon.mjs';
import { stripBlocks } from '../map/tavern/sanitize.mjs';

const plain = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[‘’‚‛′ʼ]/g, "'").replace(/[“”„‟″]/g, '"').replace(/[‐-―−﹘﹣]/g, '-')
  .replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
test('normalise: cached result equals the plain computation, repeat calls too', () => {
  for (const s of ['  Ｈｅｌｌｏ  “World” ', "Tom & Jerry's", 'a–b', '', null, undefined, 12, 'x'.repeat(300)]) { assert.equal(normalise(s), plain(s)); assert.equal(normalise(s), plain(s)); }
});
test('stripBlocks: no-bracket text unchanged; blocks, unclosed tails and orphan closers stripped as before', () => {
  assert.equal(stripBlocks('plain text', ['thinking']), 'plain text');
  assert.equal(stripBlocks('a<thinking>x</thinking>b', ['thinking']), 'a b');
  assert.equal(stripBlocks('a<THINKING class="c">x y', ['thinking']), 'a ');
  assert.equal(stripBlocks('a</thinking>b', ['thinking']), 'a b');
  assert.equal(stripBlocks('a<state>1</state> b<state>2</state>', ['state', 'bad tag!']), 'a  b ');
  assert.equal(stripBlocks('<x>', []), '<x>');
});
