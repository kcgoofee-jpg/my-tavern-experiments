// S6-3 (K-R76): the Items tab's grouping and the item adapter (core/entities.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { itemOf, itemGroups } from '../map/core/entities.mjs';

const NODES = { hall: 'hall', 'The Hall': 'hall', Kitchen: 'kitchen', Cellar: 'cellar' };
const nodeOf = Object.assign(t => NODES[t] ?? null, { has: id => ['hall', 'kitchen', 'cellar', 'mk_a'].includes(id) });
const own = (id, name, o = {}) => ({ id, name, place: '', map: '', hidden: false, src: 'text', carried: true, msgIndex: null, ...o });
const names = rows => rows.map(e => e.name);

test('itemOf: node by reference when the tree has it, else located from the place; world rows fall back to the marker; the row is kept untouched', () => {
  const r = own('i1', 'Lamp', { place: 'Kitchen', node: 'hall', msgIndex: 4 });
  const e = itemOf(r, nodeOf);
  assert.deepEqual([e.kind, e.id, e.name, e.node, e.place, e.source, e.msgIndex], ['item', 'i1', 'Lamp', 'hall', 'Kitchen', 'text', 4]);
  assert.equal(e.data, r);
  assert.equal(itemOf(own('i2', 'X', { place: 'Kitchen', node: 'nowhere' }), nodeOf).node, 'kitchen');
  assert.equal(itemOf(own('i3', 'X', { place: 'Unknown' }), nodeOf).node, null);
  const w = itemOf({ id: 's1', name: 'Key', place: 'mk_a', marker: 'mk_a', map: 'm' }, nodeOf, 'world');
  assert.deepEqual([w.source, w.node], ['world', 'mk_a']);
  assert.equal(itemOf({ name: 'Bandage', qty: 3 }, nodeOf, 'mvu').source, 'mvu');
  assert.equal(itemOf({ id: 'a', name: 'n' }, nodeOf).source, 'legacy');
});

test('itemGroups: carried, here (own + world), other by place in code-point order with no place last, card', () => {
  const store = [
    own('i1', 'Lamp', { place: 'Cellar' }),
    own('i2', 'Rope', { carried: true }),
    own('i3', 'Coin', { carried: false, src: 'api', place: 'The Hall' }),
    own('i4', 'Pot', { carried: false, src: 'api', place: 'Kitchen' }),
    own('i5', 'Jar', { carried: false, src: 'api', place: 'Cellar' }),
    own('i6', 'Sack', { carried: false, src: 'api' }),
    own('i7', 'Box', { carried: false, src: 'api', place: 'Kitchen', node: 'hall' }),
  ];
  const world = [{ id: 's1', name: 'Key', place: 'The Hall', marker: 'mk_a', map: 'm' }, { id: 's2', name: 'Far', place: 'Kitchen', marker: 'mk_b', map: 'm' }];
  const card = [{ name: 'Bandage', qty: 3 }, { name: 'Old photo', text: 'faded' }, { name: '' }];
  const g = itemGroups({ store, world, card, here: 'hall', hereMarker: '', nodeOf });
  assert.deepEqual(names(g.carried), ['Lamp', 'Rope']);
  assert.deepEqual(names(g.here), ['Coin', 'Box', 'Key']);
  assert.deepEqual(g.other.map(o => [o.place, names(o.rows)]), [['Cellar', ['Jar']], ['Kitchen', ['Pot']], ['', ['Sack']]]);
  assert.deepEqual(names(g.card), ['Bandage', 'Old photo']);
  assert.ok(g.card.every(e => e.source === 'mvu' && e.node === null));
});

test('itemGroups: a taken world row is not listed; a hidden one only on its own spot; no here = nothing is here', () => {
  const world = [{ id: 's1', name: 'Key', place: 'The Hall', marker: 'mk_a' }, { id: 's2', name: 'Gem', place: 'The Hall', marker: 'mk_a', hidden: 'drawer' }, { id: 's3', name: 'Cup', place: 'The Hall', marker: 'mk_a' }];
  const store = [own('s3', 'Cup', { carried: true, src: 'map' })];
  assert.deepEqual(names(itemGroups({ store, world, here: 'hall', hereMarker: '', nodeOf }).here), ['Key']);
  assert.deepEqual(names(itemGroups({ store, world, here: 'hall', hereMarker: 'mk_a', nodeOf }).here), ['Key', 'Gem']);
  assert.deepEqual(names(itemGroups({ store, world, here: null, nodeOf }).here), []);
  assert.deepEqual(names(itemGroups({ store: [], world, here: 'hall', taken: new Set(['s1']), nodeOf }).here), ['Cup'], 'ids passed as taken count too');
});

test('itemGroups: an old host sends no stash: the legacy rows are listed as not carried, under here / other places', () => {
  const legacy = [{ id: 'a', 名: 'Coin', 地点: 'The Hall', 层: '', 暗格: '', 数量: 2 }, { id: 'b', 名: 'Pot', 地点: 'Kitchen', 层: '', 暗格: '暗格', 说明: 'old' }];
  const g = itemGroups({ store: null, legacy, here: 'hall', nodeOf });
  assert.deepEqual(g.carried, []);
  assert.deepEqual(names(g.here), ['Coin']);
  assert.equal(g.here[0].data.qty, 2);
  assert.deepEqual(g.other.map(o => [o.place, names(o.rows)]), [['Kitchen', ['Pot']]]);
  assert.equal(g.other[0].rows[0].data.hidden, true);
  assert.deepEqual(itemGroups({}), { carried: [], here: [], other: [], card: [] });
  assert.deepEqual(itemGroups({ store: [], legacy: [], card: null, nodeOf }).card, []);
});
