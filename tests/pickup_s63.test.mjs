// S6-3 (K-R77, I-08): the pickup sentence patterns, the strict verbs, the never-forms and the pack vocabulary.
// Each row: text, known names, result before S6-3 (measured at the base), result after.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { names, compile, scan } from '../map/core/pickup.mjs';

const TABLE = [
  ['他获得了一枚徽章。', [], [], ['徽章']],
  ['她得到一个木盒。', [], [], ['木盒']],
  ['我拿取了一把钥匙。', [], [], ['钥匙']],
  ['获得了「星辉碎片」。', [], [], ['星辉碎片']],
  ['他把账本拿取在手。', [], [], ['账本']],
  ['他得到黄铜钥匙。', ['黄铜钥匙'], [], ['黄铜钥匙']],
  ['他得到钥匙。', [], [], []],
  ['她获得了勇气。', [], [], []],
  ['他得到消息后立刻出发。', [], [], []],
  ['他获得了一个机会。', [], [], []],
  ['我看得到一个木盒。', [], [], []],
  ['他找得到那本书。', [], [], []],
  ['获得者是她。', [], [], []],
  ['她没有拿到钥匙。', [], ['钥匙'], []],
  ['他没能拿到那枚徽章。', [], ['徽章'], []],
  ['他拿到钥匙了吗？', [], ['钥匙'], []],
  ['你能拿到钥匙吗', [], ['钥匙吗'], []],
  ['“我拿到钥匙了。”她说。', [], ['钥匙'], []],
  ['「拿到钥匙了」', [], ['钥匙'], []],
  ['他想拿到那把钥匙。', [], ['钥匙'], []],
  ['如果拿到钥匙就好了。', [], ['钥匙'], []],
  ['他要拿到钥匙。', [], ['钥匙'], []],
  ['她不由得拿起了那把刀。', [], ['刀'], ['刀']],
  ['他不得不拿起那把刀。', [], ['刀'], ['刀']],
  ['Mara picked up the Brass Key.', [], ['the', 'Brass Key'], ['Brass Key']],
  ['I grabbed an apple and left', [], ['an', 'n apple'], ['apple']],
  ['He got the Brass Key.', ['Brass Key'], [], ['Brass Key']],
  ['He got the Brass Key.', [], [], []],
  ['He took a breath.', [], [], []],
  ['She got the news.', [], [], []],
  ['He took the "Moon Lantern".', [], [], ['Moon Lantern']],
  ['"I picked up the key," she said.', [], ['the', 'key'], []],
  ['He grabbed the chance.', [], ['the', 'chance'], []],
  ['He never grabbed the coin.', [], ['the', 'coin'], []],
];
for (const [text, known, , after] of TABLE) {
  test(`pickup: ${text} ${known.length ? '(known)' : ''}`, () => assert.deepEqual(names(text, { known }), after));
}

test('a true pickup later in the text still counts after a negated one; a known name too', () => {
  assert.deepEqual(names('他没拿到钥匙。后来他拿起了那把刀。'), ['刀']);
  assert.deepEqual(names('他没拿到黄铜钥匙。后来他拿到了黄铜钥匙。', { known: ['黄铜钥匙'] }), ['黄铜钥匙']);
  assert.deepEqual(names('She was not sure. She picked up the lamp.'), ['lamp']);
});

const MIN = JSON.parse(readFileSync(fileURLToPath(new URL('../map/packs/minimal/manifest.json', import.meta.url)), 'utf8'));
test('vocabulary: the minimal pack adds a verb and a not-item; verbs_off and verbs_strict work', () => {
  const vocab = { verbs: ['snatches'], verbs_strict: [], verbs_off: [], not_items: ['the tide'] };
  assert.deepEqual(names('Mara snatches the Brass Key.', { vocab }), ['Brass Key']);
  assert.deepEqual(names('The gull snatches the tide.', { vocab }), []);
  assert.deepEqual(names('Mara snatches the Brass Key.'), [], 'without the pack word nothing');
  assert.deepEqual(names('他拿起钥匙。', { vocab: { verbs_off: ['拿起'] } }), []);
  assert.deepEqual(names('他拿起钥匙。'), ['钥匙']);
  const strict = { verbs_strict: ['领到'] };
  assert.deepEqual(names('他领到一份口粮。', { vocab: strict }), ['口粮']);
  assert.deepEqual(names('他领到口粮。', { vocab: strict }), []);
  assert.ok(MIN.items.pickup.en.verbs.includes('snatches'));
});
test('vocabulary: words are literal and equal vocabularies share one compiled set', () => {
  const a = compile({ verbs: ['a.b'], not_items: [] }), b = compile({ verbs: ['a.b'], not_items: [] });
  assert.equal(a, b);
  assert.notEqual(a, compile({ verbs: ['a.c'] }));
  assert.deepEqual(names('Mara a.b the lamp.', { vocab: { verbs: ['a.b'] } }), ['lamp']);
  assert.deepEqual(names('Mara axb the lamp.', { vocab: { verbs: ['a.b'] } }), []);
  assert.deepEqual(names('Mara snatches the lamp.', { vocab: { verbs: ['(snatches'] } }), []);
  assert.ok(scan('他拿起钥匙。', { vocab: null }).length === 1);
});
