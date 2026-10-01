// Schematic layout and picture (docs/kernel-schema.md K-R97): deterministic positions, wrapping, shapes, a picture without text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTree } from '../map/core/nodes.mjs';
import { layoutSchematic, schematicSvg, schematicUrl } from '../map/core/schematic.mjs';

const T = buildTree([{ id: 'root' }, { id: 'a', parent: 'root' }, { id: 'b', parent: 'root' }, { id: 'a1', parent: 'a' }, { id: 'a2', parent: 'a' }]);
const inBox = p => p.x >= 0.06 - 1e-9 && p.x <= 0.94 + 1e-9 && p.y >= 0.06 - 1e-9 && p.y <= 0.94 + 1e-9;

test('tree: owner at the top centre, a left of b, a1 and a2 under a, everything inside the margins', () => {
  const L = layoutSchematic(T, 'root');
  assert.deepEqual(L.root, { x: 0.5, y: 0.08 });
  assert.ok(L.a.x < L.b.x && L.a.y === L.b.y && L.a.y > L.root.y);
  assert.ok(L.a1.y > L.a.y && L.a1.x < L.a2.x && L.a1.x < L.a.x && L.a2.x > L.a.x && Math.abs((L.a1.x + L.a2.x) / 2 - L.a.x) < 1e-3);
  assert.deepEqual(Object.keys(L).sort(), ['a', 'a1', 'a2', 'b', 'root']);
  for (const p of Object.values(L)) assert.ok(inBox(p), JSON.stringify(p));
  assert.equal(L.a1.y, 0.92);
});
test('the depth limit cuts the levels; an empty subtree is only the owner; unknown owner is empty', () => {
  assert.deepEqual(Object.keys(layoutSchematic(T, 'root', { depth: 1 })).sort(), ['a', 'b', 'root']);
  assert.deepEqual(layoutSchematic(T, 'a2'), { a2: { x: 0.5, y: 0.08 } });
  assert.deepEqual(layoutSchematic(T, 'nope'), {});
});
test('the same input gives the same output', () => {
  assert.deepEqual(layoutSchematic(T, 'root'), layoutSchematic(T, 'root'));
  assert.equal(JSON.stringify(layoutSchematic(T, 'root', { layout: 'radial' })), JSON.stringify(layoutSchematic(T, 'root', { layout: 'radial' })));
});
test('a level of 30 nodes wraps into 3 rows inside the margins', () => {
  const kids = Array.from({ length: 30 }, (_, i) => ({ id: `k${i}`, parent: 'root' }));
  const L = layoutSchematic(buildTree([{ id: 'root' }, ...kids]), 'root');
  assert.deepEqual([...new Set(kids.map(k => L[k.id].y))].length, 3);
  for (const p of Object.values(L)) assert.ok(inBox(p));
});
test('list is one column in declaration order; grid is rows of ceil(sqrt n); radial puts the owner in the middle', () => {
  const l = layoutSchematic(T, 'root', { layout: 'list' }), order = Object.keys(l);
  assert.ok(order.every(id => l[id].x === 0.5)); assert.deepEqual(order, ['root', 'a', 'b', 'a1', 'a2']);
  assert.ok(order.every((id, i) => i === 0 || l[id].y > l[order[i - 1]].y));
  const g = layoutSchematic(T, 'root', { layout: 'grid' });   // 5 nodes -> 3 columns, 2 rows
  assert.equal(new Set(Object.values(g).map(p => p.y)).size, 2); assert.equal(new Set(Object.values(g).map(p => p.x)).size, 3);
  const r = layoutSchematic(T, 'root', { layout: 'radial' });
  assert.deepEqual(r.root, { x: 0.5, y: 0.5 });
  const d = id => Math.hypot((r[id].x - 0.5) / 0.44, (r[id].y - 0.5) / 0.4);
  assert.ok(d('a') < d('a1') && Math.abs(d('a') - d('b')) < 1e-3);
  for (const p of [...Object.values(l), ...Object.values(g), ...Object.values(r)]) assert.ok(inBox(p), JSON.stringify(p));
});
test('the picture has one line per edge, one dot per node and no text', () => {
  const L = layoutSchematic(T, 'root'), svg = schematicSvg(L, T);
  assert.doesNotMatch(svg, /<text/i); assert.match(svg, /viewBox="0 0 1600 1000"/);
  assert.equal((svg.match(/<line /g) || []).length, 4); assert.equal((svg.match(/<circle r="6"|<circle [^>]*r="6"/g) || []).length, 5);
  assert.doesNotMatch(svg, /root|a1|a2/);   // no id, no pack value
  assert.equal((schematicSvg({ root: L.root, a1: L.a1 }, T).match(/<line /g) || []).length, 0, 'an edge needs both ends in the layout');
  assert.match(schematicUrl(svg), /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
});
