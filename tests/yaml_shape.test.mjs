// K-R94: the shape parser reads JSON and a small YAML subset, and nothing else (tests for map/core/yaml-shape.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShape } from '../map/core/yaml-shape.mjs';

test('JSON text is parsed as JSON; a broken one is null', () => {
  assert.deepEqual(parseShape('{"a": {"b": 1}, "c": [1, 2]}'), { a: { b: 1 }, c: [1, 2] });
  assert.equal(parseShape('{"a": '), null);
  assert.deepEqual(parseShape('[1, 2]'), [1, 2]);
});

test('YAML subset: mappings, sequences, scalars, comments, quoted keys', () => {
  const t = ['# a comment', 'World:', '  Location: the inn   # trailing', '  Time: "08:30"', '  Day: 3', '  Open: true', '  Ratio: 0.5', '  Nothing: ~',
    'Present:', '  Mara:', '    Place: inn', '    Tags:', '      - a', '      - b: 1', '        c: 2', '"Odd: key": x', 'Empty: []', ''].join('\n');
  assert.deepEqual(parseShape(t), { World: { Location: 'the inn', Time: '08:30', Day: 3, Open: true, Ratio: 0.5, Nothing: null }, Present: { Mara: { Place: 'inn', Tags: ['a', { b: 1, c: 2 }] } }, 'Odd: key': 'x', Empty: [] });
  assert.deepEqual(parseShape('- 1\n- two\n- false'), [1, 'two', false]);
  assert.deepEqual(parseShape('a: C#sharp\nb: x #gone'), { a: 'C#sharp', b: 'x' });
});

test('anchors, tags, flow collections, block scalars, merge keys, tabs and wrong indentation are null; empty and non-text are null', () => {
  for (const bad of ['a: &x 1', 'a: *x', 'a: !!str 1', 'a: {b: 1}', 'a: [1, 2]', 'a: |\n  text', 'a: >\n  text', '<<: *base', 'a:\n\tb: 1', 'a: 1\n  b: 2', 'a: "open', '']) assert.equal(parseShape(bad), null, JSON.stringify(bad));
  assert.equal(parseShape(null), null); assert.equal(parseShape(42), null);
  assert.equal(parseShape('a: 1\n'.repeat(5000)), null, 'too many lines');
});
