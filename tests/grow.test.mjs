// K-R26: growing nodes from chat (map/core/grow.mjs). Pure and deterministic; live growth equals the recompute.
import test from 'node:test';
import assert from 'node:assert/strict';
import { grow, recomputeGrowth, segmentsOf, MAX_GROWN } from '../map/core/grow.mjs';
import { buildTree, vocabulary, locate } from '../map/core/nodes.mjs';
import { lexicon } from '../map/core/lexicon.mjs';

const BASE = [{ id: 'root', name: 'T' }, { id: 'w_a', name: 'Saltmere', alias: ['Saltmere'], parent: 'root' }];
const names = r => r.nodes.map(n => n.name + '<' + ([...BASE, ...r.nodes].find(x => x.id === n.parent)?.name ?? n.parent));   // BASE names win: 'T' is the root
const g = (texts, lang = 'en', base = BASE) => recomputeGrowth(texts, base, { lang, title: 'T' });

test('A · B grows A under the root and B under A; a known first segment is reused', () => {
  assert.deepEqual(names(g(['Lantern Docks · Harbour Office'])), ['Lantern Docks<T', 'Harbour Office<Lantern Docks']);
  assert.deepEqual(names(g(['Saltmere · Cellar'])), ['Cellar<Saltmere']);
  assert.deepEqual(g(['Lantern Docks · Harbour Office']).nodes.map(n => n.alias), [['Lantern Docks'], ['Harbour Office']]);
  assert.match(g(['Lantern Docks']).nodes[0].id, /^g_[0-9a-z]+$/);
});

test('comma lists: inner to outer for en, outer to inner for zh; a list that ends in a known place is read inner to outer', () => {
  assert.deepEqual(names(g(['Cellar, Guild Hall, Saltmere'])), ['Guild Hall<Saltmere', 'Cellar<Guild Hall']);
  const zh = recomputeGrowth(['Cellar, Guild Hall, Saltmere'], [{ id: 'root', name: 'T' }], { lang: 'zh', title: 'T' });
  assert.deepEqual(zh.nodes.map(n => n.name), ['Cellar', 'Guild Hall', 'Saltmere'], 'outer to inner: the first written is the outermost');
  assert.deepEqual(names(g(['Cellar, Saltmere'], 'zh')), ['Cellar<Saltmere'], 'the last locates and the first does not: inner to outer even for zh');
});

test('journeys keep the origin; articles are stripped; "Half-Moon Inn" stays whole; the first part of "A / B" is used', () => {
  assert.deepEqual(names(g(['from the Docks to Saltmere'])), ['Docks<T']);
  assert.deepEqual(names(g(['Docks -> Saltmere'])), ['Docks<T']);
  assert.deepEqual(names(g(['从酒馆到港口'], 'zh')), ['酒馆<T']);
  assert.deepEqual(names(g(['The Salty Dog'])), ['Salty Dog<T']);
  assert.deepEqual(names(g(['Half-Moon Inn'])), ['Half-Moon Inn<T']);
  assert.deepEqual(names(g(['The Salty Dog - Cellar'])), ['Salty Dog<T', 'Cellar<Salty Dog']);
  assert.deepEqual(names(g(['Yard / Lane'])), ['Yard<T']);
});

test('same texts, same ids and order; a repeated text is consumed once', () => {
  const t = ['Lantern Docks · Harbour Office', 'Old Mill', 'Lantern Docks · Harbour Office', 'old mill'];
  const a = g(t), b = g(t);
  assert.deepEqual(a, b); assert.equal(a.nodes.length, 3); assert.deepEqual(a.consumed, ['lantern docks · harbour office', 'old mill']);
  assert.deepEqual(g(['X', 'Y'], 'en').nodes.map(n => n.id), g(['X', 'Y'], 'en').nodes.map(n => n.id));
});

test('caps: 200 grown nodes, depth 6, 40 code points per segment', () => {
  const many = g(Array.from({ length: 300 }, (_, i) => 'Place ' + i)); assert.equal(many.nodes.length, MAX_GROWN);
  const deep = g(['A1 · B2 · C3 · D4 · E5 · F6 · G7 · H8']); assert.equal(deep.nodes.length, 6, 'depth 6 below the root: A1 .. F6');
  const t = buildTree([...BASE, ...deep.nodes], { title: 'T' }); assert.ok(t.maxDepth() <= 6);
  assert.deepEqual(g(['x'.repeat(41)]).nodes, [], 'a segment over 40 code points is not placed');
  assert.deepEqual(names(g(['Short · ' + 'y'.repeat(41) + ' · After'])), ['Short<T'], 'nothing after a bad segment is placed');
});

test('texts that locate to nothing new create nothing; a text outside the subtree of the current node grows under it', () => {
  assert.deepEqual(g(['Saltmere']).nodes, []);
  assert.deepEqual(names(g(['Lantern Docks · Saltmere'])), ['Lantern Docks<T', 'Saltmere<Lantern Docks'], 'Saltmere exists elsewhere: the walk does not leave the subtree of the node it is in');
});

test('segmentsOf: separators and the order of comma lists', () => {
  const lx = lexicon('en'), none = () => false;
  assert.deepEqual(segmentsOf('A · B › C > D', none, lx), ['A', 'B', 'C', 'D']);
  assert.deepEqual(segmentsOf('Cellar, Hall, Town', none, lx), ['Town', 'Hall', 'Cellar']);
  assert.deepEqual(segmentsOf('', none, lx), []);
});

test('live growth over a 12-message stream equals the recompute from nothing, item for item', () => {
  const stream = [['Lantern Docks'], [], ['Lantern Docks · Harbour Office'], ['Cellar, Guild Hall, Saltmere'], ['The Salty Dog'], ['Salty Dog - Back Room'], [], ['from the Docks to Saltmere'], ['Old Mill · Wheel House'], ['Harbour Office'], ['Quay 4, Lantern Docks'], ['Old Mill']];
  let nodes = BASE.slice(), seen = [];
  for (const texts of stream) {   // what the host does each round: the tree of everything so far, then the new texts
    const tree = buildTree(nodes, { title: 'T' }), r = grow(tree, vocabulary(tree, { lang: 'en' }), texts, { lang: 'en', seen });
    nodes = [...nodes, ...r.nodes]; seen = [...seen, ...r.consumed];
  }
  const re = g(stream);
  assert.deepEqual(nodes.slice(BASE.length), re.nodes); assert.deepEqual(seen, re.consumed); assert.ok(re.nodes.length >= 8);
  const tree = buildTree(nodes, { title: 'T' }), v = vocabulary(tree, { lang: 'en' });
  assert.equal(locate('Harbour Office', tree, v, { lang: 'en' }).node, re.nodes.find(n => n.name === 'Harbour Office').id, 'a grown node is found by the ordinary locate');
});
