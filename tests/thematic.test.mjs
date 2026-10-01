// core/thematic.mjs and the function words of core/vocab.mjs (K-R107, docs/transit-schema.md §4.2, §8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, LINE_PALETTE, DANGER, functionOf, hull, thematicModel, centroid, circlePts } from '../map/core/thematic.mjs';
import { FUNCTION, functionWord } from '../map/core/vocab.mjs';
import { FUNCTIONS } from '../map/core/transit-spec.mjs';
import { buildTree } from '../map/core/nodes.mjs';
import { layoutSchematic } from '../map/core/schematic.mjs';

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
const minPair = list => Math.min(...list.flatMap((a, i) => list.slice(i + 1).map(b => dist(a, b))));

test('palette: one colour per function, pairwise distinct; line colours are far apart and away from "other"', () => {
  assert.deepEqual(Object.keys(PALETTE), [...FUNCTIONS]);
  for (const c of [...Object.values(PALETTE), ...LINE_PALETTE]) assert.match(c, /^#[0-9a-f]{6}$/);
  assert.ok(minPair(Object.values(PALETTE)) >= 20, 'a fixed pairwise distance in RGB (the tint is light; the label names the function too)');
  assert.equal(LINE_PALETTE.length, 8); assert.equal(new Set(LINE_PALETTE).size, 8);
  assert.ok(minPair([...LINE_PALETTE, PALETTE.other]) >= 50);
  assert.ok(Object.isFrozen(PALETTE) && Object.isFrozen(LINE_PALETTE) && Object.isFrozen(DANGER));
});
test('danger outlines: four levels, heavier and warmer as the level rises', () => {
  assert.equal(DANGER.length, 4);
  assert.deepEqual(DANGER.map(d => d.color), [null, '--gold', '--alert', '--alert']);
  assert.deepEqual(DANGER.map(d => d.width), [0.8, 1.2, 1.6, 2.4]);
  assert.deepEqual(DANGER.map(d => d.dash), [null, [6, 4], [6, 3], null]);
});

test('function words: generic lists, at most 12 words a language, no word shared between functions', () => {
  assert.deepEqual(Object.keys(FUNCTION), FUNCTIONS.filter(f => f !== 'other'));
  const seen = new Map();
  for (const [fn, l] of Object.entries(FUNCTION)) for (const lang of ['zh', 'en']) {
    assert.ok(l[lang].length >= 1 && l[lang].length <= 12, `${fn}.${lang}`);
    for (const w of l[lang]) { assert.ok(!seen.has(lang + w), `${w} is in ${fn} and ${seen.get(lang + w)}`); seen.set(lang + w, fn); }
  }
});
test('functionWord: Chinese substrings, English whole words with a plural s', () => {
  assert.equal(functionWord('中央医院', 'zh'), 'medical'); assert.equal(functionWord('东门兵营', 'zh-CN'), 'military'); assert.equal(functionWord('无名小路', 'zh'), '');
  assert.equal(functionWord('Old Market Square', 'en'), 'commerce'); assert.equal(functionWord('the hospitals', 'en'), 'medical'); assert.equal(functionWord('Marketing Office', 'en'), '', 'a whole word only');
  assert.equal(functionWord('City Library', 'en'), 'education'); assert.equal(functionWord('', 'en'), ''); assert.equal(functionWord(null, 'zh'), '');
  assert.equal(functionWord('医院', 'en'), '', 'the language picks the list');
});
test('functionOf: the majority wins, ties go to the function list order, none is other', () => {
  assert.equal(functionOf(['Central Hospital', 'West Clinic', 'Grain Market'], 'en'), 'medical');
  assert.equal(functionOf(['Grain Market', 'Central Hospital'], 'en'), 'commerce', 'a tie: commerce comes before medical in FUNCTIONS');
  assert.equal(functionOf(['医院', '诊所', '商店'], 'zh'), 'medical');
  assert.equal(functionOf(['Alpha', 'Beta'], 'en'), 'other'); assert.equal(functionOf([], 'en'), 'other'); assert.equal(functionOf(null, 'en'), 'other');
});

test('hull: the padded convex hull; one or two points give a circle', () => {
  const sq = hull([[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.5, 0.5]], 0.04);
  assert.equal(sq.length, 4, 'the inner point is not on the hull');
  const [cx, cy] = centroid(sq); assert.ok(Math.abs(cx - 0.5) < 1e-3 && Math.abs(cy - 0.5) < 1e-3);
  for (const [x, y] of sq) assert.ok(Math.hypot(x - 0.5, y - 0.5) > Math.hypot(0.3, 0.3), 'every corner is pushed outward');
  assert.equal(hull([[0.5, 0.5]], 0.05).length, 24); assert.equal(hull([[0.2, 0.5], [0.4, 0.5]], 0.05).length, 24);
  assert.deepEqual(hull([[0.5, 0.5]], 0.05), circlePts([0.5, 0.5], 0.05));
  assert.equal(hull([[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]], 0.02).length, 24, 'collinear points: a circle');
  assert.deepEqual(hull([], 0.04), []); assert.equal(hull([[0.1, 0.1], [0.1, 0.1], [0.1, 0.1]], 0.04).length, 24, 'repeated points count once');
});

const TREE = [{ id: 'root', name: 'World' },
  { id: 'a', parent: 'root', name: 'North Quarter' }, { id: 'a1', parent: 'a', name: 'Central Hospital' }, { id: 'a2', parent: 'a', name: 'West Clinic' },
  { id: 'b', parent: 'root', name: 'Docks' }, { id: 'b1', parent: 'b', name: 'Grain Market' }, { id: 'b2', parent: 'b', name: 'Fish Market' },
  { id: 'c', parent: 'root', name: 'East' }, { id: 'c1', parent: 'c', name: 'Lone Tree' }, { id: 'c2', parent: 'c', name: 'Old Barracks' },
  { id: 'd', parent: 'root', name: 'Camp' }, { id: 'e', parent: 'root', name: 'Pier' }];
test('thematicModel: off below the threshold, on with three branches; ranks 1, 2, 3', () => {
  const small = buildTree(TREE.slice(0, 6), { title: 'x' }), big = buildTree(TREE, { title: 'x' });
  const lay = (t, depth = 2) => layoutSchematic(t, 'root', { layout: 'tree', depth });
  assert.deepEqual(thematicModel(small, 'root', lay(small), { lang: 'en' }), { on: false, branches: [], hubs: [], ranks: {} });
  const flat = buildTree([{ id: 'r', name: 'R' }, ...Array.from({ length: 9 }, (_, i) => ({ id: 'n' + i, parent: 'r', name: 'N' + i }))], { title: 'x' });
  assert.equal(thematicModel(flat, 'r', lay(flat), { lang: 'en' }).on, false, 'ten nodes but no branch');
  const one = buildTree([{ id: 'r', name: 'R' }, { id: 'a', parent: 'r', name: 'A' }, ...Array.from({ length: 9 }, (_, i) => ({ id: 'a' + i, parent: 'a', name: 'N' + i }))], { title: 'x' });
  assert.equal(thematicModel(one, 'r', lay(one), { lang: 'en' }).on, false, 'ten nodes but one branch');
  assert.equal(thematicModel(null, 'r', {}).on, false); assert.equal(thematicModel(big, 'ghost', lay(big)).on, false);
  const m = thematicModel(big, 'root', lay(big), { lang: 'en' });
  assert.equal(m.on, true);
  assert.deepEqual(m.branches.map(b => [b.id, b.fn]), [['a', 'medical'], ['b', 'commerce'], ['c', 'military']]);
  assert.deepEqual(m.branches.map(b => b.color), [PALETTE.medical, PALETTE.commerce, PALETTE.military]);
  assert.deepEqual(m.branches.map(b => b.line), LINE_PALETTE.slice(0, 3));
  assert.deepEqual(m.branches[0].edges, [['a', 'a1'], ['a', 'a2']]); assert.deepEqual(m.branches[0].nodes, ['a', 'a1', 'a2']);
  assert.ok(m.branches.every(b => b.hull.length >= 3));
  assert.deepEqual(m.hubs, ['root', 'a', 'b', 'c']);
  assert.deepEqual([m.ranks.root, m.ranks.a, m.ranks.b, m.ranks.a1, m.ranks.d, m.ranks.e], [1, 1, 1, 3, 3, 3], 'the owner and the branches 1, leaves 3');
  const deep = buildTree([...TREE, { id: 'a11', parent: 'a1', name: 'Ward' }], { title: 'x' });
  assert.equal(thematicModel(deep, 'root', lay(deep, 3), { lang: 'en' }).ranks.a1, 2, 'a hub below a branch is rank 2');
  assert.equal(thematicModel(big, 'root', lay(big), { lang: 'en', min: 13 }).on, false, 'the threshold is a parameter');
  assert.deepEqual(thematicModel(big, 'root', lay(big), { lang: 'en' }), thematicModel(big, 'root', lay(big), { lang: 'en' }), 'deterministic');
});
