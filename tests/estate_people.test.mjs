// S7-3 T8 (docs/ui-refactor.md U-27, U-28): the pure function that builds `estate:people` from the people rows, the building's rooms and the node resolution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEstatePeople, sameList, avatarOk, MAX_CHIPS } from '../map/core/estate-people.mjs';

const rooms = [{ node: 'r_hall', floor: 'F1' }, { node: 'r_loft', floor: 'F2' }, { node: 'r_hall', floor: 'F3' }];
const nodeOf = t => ({ 'Hall': 'r_hall', 'the loft': 'r_loft', 'Yard': 'yard', 'Gone': 'r_gone' }[t] ?? null);
const row = (name, place, o = {}) => ({ name, place, color: '#336699', shown: true, ...o });

test('located people: the node of the place must be a room of this building; the room is the node id, the floor is the first room\'s floor', () => {
  const l = buildEstatePeople({ rows: [row('A', 'Hall'), row('B', 'the loft'), row('C', 'Yard'), row('D', 'nowhere'), row('E', 'Gone')], rooms, nodeOf });
  assert.deepEqual(l, [{ name: 'A', room: 'r_hall', floor: 'F1', color: '#336699' }, { name: 'B', room: 'r_loft', floor: 'F2', color: '#336699' }]);
});
test('hidden people: a switched-off person, and all people when 「在地图上显示人物」 is off (nobody is `shown`), are not in the list', () => {
  assert.deepEqual(buildEstatePeople({ rows: [row('A', 'Hall', { shown: false }), row('B', 'Hall', { shown: false })], rooms, nodeOf }), []);
  assert.deepEqual(buildEstatePeople({ rows: [row('A', 'Hall', { shown: false }), row('B', 'Hall')], rooms, nodeOf }).map(p => p.name), ['B']);
});
test('avatar filter: https or an inline image up to 64 KB; anything else is left out (the chip shows initials)', () => {
  assert.ok(avatarOk('https://x.test/a.png')); assert.ok(avatarOk('data:image/png;base64,AAAA')); assert.ok(!avatarOk('http://x.test/a.png')); assert.ok(!avatarOk('javascript:alert(1)')); assert.ok(!avatarOk('data:text/html,x'));
  assert.ok(!avatarOk('data:image/png;base64,' + 'A'.repeat(65 * 1024))); assert.ok(!avatarOk('')); assert.ok(!avatarOk(null));
  const l = buildEstatePeople({ rows: [row('A', 'Hall', { avatar: 'https://x.test/a.png' }), row('B', 'Hall', { avatar: 'ftp://x' }), row('C', 'Hall', { avatar: 'data:image/png;base64,AAAA' })], rooms, nodeOf });
  assert.deepEqual(l.map(p => p.avatar), ['https://x.test/a.png', undefined, 'data:image/png;base64,AAAA']);
});
test('a person appears once; the list is capped at 30 chips; a row without a name or place is skipped', () => {
  assert.equal(buildEstatePeople({ rows: [row('A', 'Hall'), row('A', 'the loft')], rooms, nodeOf }).length, 1);
  const many = Array.from({ length: 45 }, (_, i) => row('P' + i, 'Hall')); assert.equal(buildEstatePeople({ rows: many, rooms, nodeOf }).length, MAX_CHIPS); assert.equal(MAX_CHIPS, 30);
  assert.deepEqual(buildEstatePeople({ rows: [row('', 'Hall'), row('A', ''), row('B', undefined), null], rooms, nodeOf }), []);
  assert.deepEqual(buildEstatePeople({}), []);
});
test('an unchanged list sends nothing: sameList compares by content', () => {
  const a = buildEstatePeople({ rows: [row('A', 'Hall')], rooms, nodeOf }), b = buildEstatePeople({ rows: [row('A', 'Hall')], rooms, nodeOf }), c = buildEstatePeople({ rows: [row('A', 'the loft')], rooms, nodeOf });
  assert.ok(sameList(a, b)); assert.ok(!sameList(a, c)); assert.ok(sameList([], []));
});
test('the match is by node id: a room named like the place but with another node does not match, and a resolver that throws is the caller\'s business (null = not placed)', () => {
  assert.deepEqual(buildEstatePeople({ rows: [row('A', 'Hall')], rooms: [{ node: 'other', floor: 'F1' }], nodeOf }), []);
  assert.deepEqual(buildEstatePeople({ rows: [row('A', 'Hall')], rooms, nodeOf: () => null }), []);
});
