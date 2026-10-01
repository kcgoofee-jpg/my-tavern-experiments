// S6-1: the entity adapters and the people sections (core/entities.mjs; K-R71, K-R73; design docs/entity-protocol.md §2, §4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, personOf, eventOf, presentAt, levelMode, peopleSections } from '../map/core/entities.mjs';
import { buildTree } from '../map/core/nodes.mjs';

// root -> a, b, c ; a -> a1
const tree = buildTree([{ id: 'root', name: 'R' }, { id: 'a', parent: 'root', name: 'A' }, { id: 'b', parent: 'root', name: 'B' }, { id: 'a1', parent: 'a', name: 'A1' }, { id: 'c', parent: 'root', name: 'C' }]);
const place = { 'hall': 'a1', 'yard': 'a', 'dock': 'b', 'lobby': 'root', 'abroad': 'zzz' };
const nodeOf = Object.assign(t => place[t] ?? null, { has: id => tree.has(id) });

test('KINDS is frozen: person, item, event', () => { assert.deepEqual([...KINDS], ['person', 'item', 'event']); assert.ok(Object.isFrozen(KINDS)); });

test('personOf: id, source mapping, message index and the node by reference or from the place', () => {
  const row = { name: '  Mara   Vale ', place: 'hall', floor: 12, src: 'tag', present: 1 };
  const p = personOf(row, nodeOf);
  assert.deepEqual({ ...p, data: undefined }, { kind: 'person', id: 'Mara Vale', name: '  Mara   Vale ', node: 'a1', place: 'hall', source: 'chat', msgIndex: 12, present: true, data: undefined });
  assert.equal(p.data, row, 'the original row, untouched');
  assert.equal(personOf({ name: 'N', place: 'hall' }, nodeOf).source, 'infer', 'a missing src is "infer"');
  for (const s of ['mvu', 'table-db', 'fallback', 'imagegen', 'routine']) assert.equal(personOf({ name: 'N', src: s }, nodeOf).source, s);
  assert.equal(personOf({ name: 'N', floor: '3' }, nodeOf).msgIndex, null, 'only an integer floor counts');
  assert.equal(personOf({ name: 'N', floor: 0 }, nodeOf).msgIndex, 0);
  assert.equal(personOf({ name: 'N', present: false }, nodeOf).present, false);
  // node: the row's own node when the tree has it, else located from the place; null with no place
  assert.equal(personOf({ name: 'N', node: 'b', place: 'hall' }, nodeOf).node, 'b');
  assert.equal(personOf({ name: 'N', node: 'gone', place: 'hall' }, nodeOf).node, 'a1', 'an id the tree does not know is ignored');
  assert.equal(personOf({ name: 'N', node: '', place: 'dock' }, nodeOf).node, 'b');
  assert.equal(personOf({ name: 'N', node: 'b' }, t => place[t] ?? null).node, null, 'no nodeOf.has: the reference is not accepted, and there is no place');
  assert.equal(personOf({ name: 'N' }, nodeOf).node, null);
  assert.equal(personOf({ name: 'N', place: 'unlisted' }, nodeOf).node, null, 'a place the locator does not know');
});

test('eventOf: the category is the name; the source is op, feed or chat; the message is the last update', () => {
  const row = { id: 'e1', cat: 'fire', place: 'dock', last: 40 };
  const e = eventOf(row, nodeOf);
  assert.deepEqual({ ...e, data: undefined }, { kind: 'event', id: 'e1', name: 'fire', node: 'b', place: 'dock', source: 'chat', msgIndex: 40, data: undefined });
  assert.equal(e.data, row);
  assert.equal(eventOf({ id: 'e2', src: 'op' }, nodeOf).source, 'op');
  assert.equal(eventOf({ id: 'e3', feed: true, src: 'x' }, nodeOf).source, 'feed');
  assert.equal(eventOf({ id: 'e4', src: 'Some publisher' }, nodeOf).source, 'chat', 'src is the publisher text here, not a channel');
  assert.equal(eventOf({ id: 'e5', last: 'x' }, nodeOf).msgIndex, null);
  assert.equal(eventOf({ id: 'e6', node: 'a', place: 'dock' }, nodeOf).node, 'a');
  assert.equal(eventOf({ id: 'e7' }, nodeOf).name, '');
});

test('presentAt: present people and whoever stands at the node; an unknown place is never "here"', () => {
  const es = [{ id: 1, node: 'a', present: false }, { id: 2, node: 'b', present: true }, { id: 3, node: null, present: false }, { id: 4, node: 'a1' }, { id: 5, node: null, present: true }];
  assert.deepEqual(presentAt(es, 'a').map(e => e.id), [1, 2, 5]);
  assert.deepEqual(presentAt(es, null).map(e => e.id), [2, 5]);
  assert.deepEqual(presentAt(es, 'nowhere').map(e => e.id), [2, 5]);
  assert.deepEqual(presentAt(undefined, 'a'), []);
});

test('levelMode: the view field wins, else macro with child maps, else micro; null without a map or children()', () => {
  const kids = { w: ['x', 'y'], x: [] };
  const rt = { children: id => kids[id] || [], viewField: () => undefined };
  assert.equal(levelMode(rt, 'w'), 'macro');
  assert.equal(levelMode(rt, 'x'), 'micro');
  assert.equal(levelMode(rt, 'unknown'), 'micro');
  assert.equal(levelMode({ ...rt, viewField: (id, k) => (k === 'x-people' && id === 'w' ? 'micro' : undefined) }, 'w'), 'micro');
  assert.equal(levelMode({ ...rt, viewField: (id, k) => (k === 'x-people' && id === 'x' ? 'macro' : undefined) }, 'x'), 'macro');
  assert.equal(levelMode({ ...rt, viewField: () => 'bogus' }, 'x'), 'micro', 'only macro / micro count');
  assert.equal(levelMode(rt, ''), null);
  assert.equal(levelMode(rt, undefined), null);
  assert.equal(levelMode({ viewField: () => 'macro' }, 'w'), null);
  assert.equal(levelMode(undefined, 'w'), null);
  assert.equal(levelMode({ children: () => ['k'] }, 'w'), 'macro', 'viewField is optional');
});

const P = (name, node, present = false) => ({ name, node, present, row: { name } });
const names = secs => secs.map(s => [s.key, s.rows.map(r => r.name)]);
const people = [P('here1', 'a', true), P('atnode', 'b'), P('inA1', 'a1'), P('inA', 'a'), P('inB', 'b'), P('onRoot', 'root'), P('inC', 'c'), P('far', 'zzz'), P('nowhere', null), P('present-nowhere', null, true)];

test('peopleSections, macro on the root: here first, one section per child node, the map itself, else, unknown; each person once', () => {
  const s = peopleSections({ people, tree, owner: 'root', here: 'b', mode: 'macro' });
  assert.deepEqual(names(s), [
    ['here', ['here1', 'atnode', 'inB', 'present-nowhere']],   // present, or at the player's node (b)
    ['n:a', ['inA1', 'inA']],
    ['n:c', ['inC']],
    ['map', ['onRoot']],
    ['else', ['far']],
    ['unknown', ['nowhere']],
  ]);
  assert.equal(s[1].node, 'a'); assert.equal(s[2].node, 'c'); assert.equal(s[0].node, undefined);
  assert.equal(s.reduce((n, x) => n + x.rows.length, 0), people.length, 'nobody is dropped or listed twice');
  assert.equal(s[1].rows[0], people[2], 'the rows are the entries that were passed in');
});

test('peopleSections, macro: the children keep declaration order and empty ones are dropped', () => {
  const s = peopleSections({ people: [P('x', 'c'), P('y', 'a1'), P('z', 'b')], tree, owner: 'root', here: null, mode: 'macro' });
  assert.deepEqual(names(s), [['n:a', ['y']], ['n:b', ['z']], ['n:c', ['x']]]);
});

test('peopleSections, micro: the same people go to here, map (the owner and below), else, unknown; no child sections', () => {
  const s = peopleSections({ people, tree, owner: 'a', here: 'a1', mode: 'micro' });
  assert.deepEqual(names(s), [
    ['here', ['here1', 'inA1', 'present-nowhere']],
    ['map', ['inA']],
    ['else', ['atnode', 'inB', 'onRoot', 'inC', 'far']],
    ['unknown', ['nowhere']],
  ]);
  assert.ok(s.every(x => x.node === undefined));
  const m = peopleSections({ people, tree, owner: 'root', here: 'a1', mode: 'micro' });
  assert.deepEqual(names(m).map(x => x[0]), ['here', 'map', 'else', 'unknown'], 'micro on the root: everything inside the tree is "this map"');
  assert.deepEqual(names(m)[2], ['else', ['far']]);
});

test('peopleSections: a single non-empty section, no level, no owner or an owner outside the tree give [] (the caller draws the flat list)', () => {
  assert.deepEqual(peopleSections({ people: [P('x', 'a'), P('y', 'a1')], tree, owner: 'a', here: null, mode: 'micro' }), []);
  assert.deepEqual(peopleSections({ people: [P('x', 'a', true), P('y', 'b', true)], tree, owner: 'root', here: null, mode: 'macro' }), []);
  assert.deepEqual(peopleSections({ people, tree, owner: 'root', here: null, mode: null }), []);
  assert.deepEqual(peopleSections({ people, tree, owner: null, here: null, mode: 'macro' }), []);
  assert.deepEqual(peopleSections({ people, tree, owner: 'gone', here: null, mode: 'macro' }), []);
  assert.deepEqual(peopleSections({ people: [], tree, owner: 'root', here: null, mode: 'macro' }), []);
  assert.deepEqual(peopleSections({}), []);
  assert.deepEqual(peopleSections(), []);
});

test('peopleSections: a node the tree does not have is "else"; here null does not pull unknown people in', () => {
  const s = peopleSections({ people: [P('far', 'zzz'), P('u', null), P('m', 'root')], tree, owner: 'root', here: null, mode: 'micro' });
  assert.deepEqual(names(s), [['map', ['m']], ['else', ['far']], ['unknown', ['u']]]);
});
