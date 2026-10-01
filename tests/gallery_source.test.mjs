// K-R106: the pack-declared media source. Synthetic table: fake names, fake host path shapes (no card content).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gallerySpec, parseTags, readTable, resolveUrl, galleryUrlOk, matchRoster, sameWho } from '../map/core/gallery-spec.mjs';
import { collectScenes, scenesAt, timelineOf, categoryRows, mediaSig } from '../map/core/gallery-scenes.mjs';

const HOST = 'img.example.test/pics/';
const u = (who, cat, n) => `https://${HOST}${who}/${cat}/${n}.png`;
const DECL = { id: 'cg', from: 'card-script', path: 'scripts.*.data.characters', name: 'name', cover: 'image', sets: 'sets',
  tag: { fields: ['name', 'category', 'number'], open: '[', close: ']', categories: ['calm', 'busy', 'night'], digits: 4 },
  require: { 'img.example.test/pics/': ['/calm/', '/busy/', '/night/'] } };
const AVATAR = { from: ['card-script'], hosts: ['img.example.test/pics/'], require: { 'img.example.test/pics/': ['/calm/'] }, deny: ['night'] };
const EXT = { scripts: [{ data: {} }, { data: { characters: [
  { name: 'Aria·Vale', image: u('aria', 'calm', 'cover'), sets: { calm: [u('aria', 'calm', 1), u('aria', 'calm', 2), u('aria', 'calm', 3)], busy: [u('aria', 'busy', 1)], other: [u('aria', 'other', 1)] } },
  { name: 'Bram', image: 'http://img.example.test/pics/bram/cover.png', sets: { calm: [u('bram', 'calm', 1), 'https://elsewhere.test/x.png', u('bram', 'calm', 3)], night: [u('bram', 'night', 1)] } },
  { name: 'Aria·Vale', sets: { calm: ['https://dup.test/x.png'] } },
  { name: 'Cole', sets: {} },
] } }] };
const spec = gallerySpec(DECL);
const ok = url => galleryUrlOk(AVATAR, spec, url);
const table = readTable(spec, EXT, ok);

test('spec: a good declaration compiles, the slots are the kernel\'s', () => {
  assert.ok(spec); assert.deepEqual(spec.path, ['scripts', '*', 'data', 'characters']); assert.equal(spec.tag.digits, 4); assert.deepEqual(spec.tag.fields, ['name', 'category', 'number']);
  assert.equal(gallerySpec({ ...DECL, tag: { categories: ['a'] } }).tag.open, '[');   // defaults: brackets, field order, 4 digits
});
test('spec: bad declarations are no source', () => {
  const t = o => ({ ...DECL, tag: { ...DECL.tag, ...o } });
  for (const bad of [null, [], { ...DECL, from: 'imagegen' }, { ...DECL, path: '' }, { ...DECL, path: 'a..b' }, { ...DECL, name: 'a.b' }, { ...DECL, sets: undefined }, { ...DECL, tag: undefined },
    t({ categories: [] }), t({ categories: ['a', 'a'] }), t({ categories: ['a[b'] }), t({ digits: 0 }), t({ digits: 7 }), t({ open: 'ab' }), t({ open: 'x' }), t({ fields: ['name', 'name', 'number'] }), t({ fields: ['name', 'category'] }),
    t({ categories: Array.from({ length: 13 }, (_, i) => 'c' + i) })]) assert.equal(gallerySpec(bad), null, JSON.stringify(bad)?.slice(0, 80));
});
test('tags: positive', () => {
  const r = parseTags('x [Aria·Vale][calm][2] y [Bram][night][0012]\n[Cole][busy][9999]', spec);
  assert.deepEqual(r.map(t => [t.name, t.category, t.number]), [['Aria·Vale', 'calm', 2], ['Bram', 'night', 12], ['Cole', 'busy', 9999]]);
  assert.equal('x [Aria·Vale][calm][2] y'.slice(r[0].start, r[0].end), '[Aria·Vale][calm][2]');
  assert.deepEqual(parseTags('[ Bram ][calm][1]', spec).map(t => t.name), ['Bram']);   // the name is trimmed
});
test('tags: negative', () => {
  for (const s of ['[Bram][weird][1]', '[Bram][calm][12345]', '[Bram][calm][]', '[Bram][calm][1x]', '[Bram][calm][-1]', '[Bram][calm]', '[Bram][calm][1', 'Bram][calm][1]', '[Bram]\n[calm][1]', '[Bram][Calm][1]', '[][calm][1]', '[Bram] [calm][1]', '', '[[[[', '[calm][calm][1]'])
    assert.deepEqual(parseTags(s, spec), [], JSON.stringify(s));
  assert.deepEqual(parseTags(null, spec), []); assert.deepEqual(parseTags(5, spec), []);
});
test('tags: a name that is a category word is skipped; a stray bracket before a tag does not hide it; tags in code blocks are text and count', () => {
  assert.deepEqual(parseTags('[busy][calm][1] [Bram][calm][2]', spec).map(t => t.name), ['Bram']);
  assert.deepEqual(parseTags('[ [Bram][calm][3]', spec).map(t => [t.name, t.number]), [['[Bram', 3]]);   // like the card's own scan: the name runs to the first close, so this one names nobody and resolves to nothing
  assert.equal(parseTags('see [Bram][calm][1] here', spec).length, 1);
  assert.equal(parseTags('```\n[Bram][calm][1]\n```', spec).length, 1);
  assert.equal(parseTags('`[Bram][calm][1]`', spec).length, 1);
});
test('tags: other grammar slots (order, brackets, digits)', () => {
  const s2 = gallerySpec({ ...DECL, tag: { fields: ['category', 'name', 'number'], open: '<', close: '>', categories: ['calm'], digits: 2 } });
  assert.deepEqual(parseTags('<calm><Bram><07> <calm><Bram><123> [Bram][calm][1]', s2).map(t => [t.name, t.category, t.number]), [['Bram', 'calm', 7]]);
});
test('table: read at run time, hosts from the avatar rules, positions kept, duplicates and bad rows dropped', () => {
  assert.deepEqual(table.chars.map(c => c.name), ['Aria·Vale', 'Bram', 'Cole']);
  const a = table.chars[0], b = table.chars[1];
  assert.deepEqual(Object.keys(a.sets), ['calm', 'busy']);   // `other` is not a declared category
  assert.equal(a.cover, u('aria', 'calm', 'cover'));
  assert.equal(b.cover, '');                                  // http: refused
  assert.deepEqual(b.sets.calm, [u('bram', 'calm', 1), '', u('bram', 'calm', 3)]);   // another host: '' in place
  assert.deepEqual(b.sets.night, [u('bram', 'night', 1)]);   // the source's own folder rule allows it though the portrait rule (avatar.require, deny) would not
  assert.deepEqual(readTable(spec, { scripts: 5 }, ok).chars, []); assert.deepEqual(readTable(spec, null, ok).chars, []); assert.deepEqual(readTable(null, EXT).chars, []);
  assert.deepEqual(readTable(spec, { scripts: [{ data: { characters: [{ name: 'X', sets: { calm: [u('x', 'calm', 1)] } }] } }] }, () => false).chars[0].sets.calm, ['']);
  assert.deepEqual(readTable(spec, JSON.parse('{"scripts":[{"data":{"characters":[{"name":"__proto__","sets":{}}]}}]}'), ok).chars.map(c => c.name), ['__proto__']);
});
test('urls: host checks (K-R43) and the number wraps round the list', () => {
  assert.equal(ok('https://img.example.test/pics/a/night/1.png'), true);
  for (const bad of ['http://img.example.test/pics/a/calm/1.png', 'https://img.example.test/pics/a/calm/1.png?x=1', 'https://img.example.test/pics/a/other/1.png' /* not in the source's folders */, 'https://evil.test/pics/a/calm/1.png', 'https://img.example.test/pics/a/calm/1.svg', 'javascript:alert(1)', 5, null])
    assert.equal(galleryUrlOk(AVATAR, spec, bad), false, String(bad));
  assert.equal(galleryUrlOk({ hosts: [] }, spec, u('a', 'calm', 1)), false);   // a pack without avatar hosts loads nothing
  const t = n => resolveUrl(table, { name: 'Aria·Vale', category: 'calm', number: n });
  assert.equal(t(1), u('aria', 'calm', 1)); assert.equal(t(3), u('aria', 'calm', 3)); assert.equal(t(4), u('aria', 'calm', 1)); assert.equal(t(8), u('aria', 'calm', 2)); assert.equal(t(0), u('aria', 'calm', 3));
  assert.equal(resolveUrl(table, { name: 'Bram', category: 'calm', number: 2 }), '');   // not allowed
  assert.equal(resolveUrl(table, { name: 'Nobody', category: 'calm', number: 1 }), null); assert.equal(resolveUrl(table, { name: 'Cole', category: 'calm', number: 1 }), null);
});
test('roster match: name, alias, short name; ambiguity is no match', () => {
  const rows = [{ name: 'Aria', displayName: 'A.' }, { name: 'Bram·Old', alias: ['Bram'] }, { name: 'Cole·One' }, { name: 'Cole·Two' }];
  assert.equal(matchRoster('Aria·Vale', rows), 'Aria'); assert.equal(matchRoster('A.', rows), 'Aria'); assert.equal(matchRoster('Bram', rows), 'Bram·Old');
  assert.equal(matchRoster('Cole', rows), ''); assert.equal(matchRoster('Cole·One', rows), 'Cole·One'); assert.equal(matchRoster('Zed', rows), ''); assert.equal(matchRoster('', rows), ''); assert.equal(matchRoster('Aria', null), '');
});

const FLOORS = [
  { floor: 9, text: 'late [Bram][calm][3] and [Aria·Vale][busy][1]', raw: 'RAW9' },
  { floor: 3, text: '[Aria·Vale][calm][2] [Nobody][calm][1] [Cole][calm][1] [Aria·Vale][calm][4]', raw: 'RAW3' },
  { floor: 5, text: 'nothing here', raw: 'RAW5' },
  { floor: 7, text: '[Bram][calm][2]', raw: 'RAW7' },
];
const PLACES = { 3: 'Hall', 7: 'Hall', 9: 'Cellar' };
const calls = [];
const scenes = collectScenes({ spec, table, floors: FLOORS, placeOf: (f, raw) => { calls.push([f, raw]); return PLACES[f]; }, nodeOf: p => ({ Hall: 'hall', Cellar: 'cellar' }[p] || ''),
  rosterRows: [{ name: 'Aria', displayName: 'Aria·Vale' }, { name: 'Bram' }] });
test('scenes: place per floor (asked once, only for floors with tags, with the raw text), character, url, order', () => {
  assert.deepEqual(calls, [[3, 'RAW3'], [7, 'RAW7'], [9, 'RAW9']]);
  assert.deepEqual(scenes.map(s => [s.floor, s.i, s.place, s.node, s.name, s.who, s.cat, s.n]), [
    [3, 0, 'Hall', 'hall', 'Aria·Vale', 'Aria', 'calm', 2], [3, 3, 'Hall', 'hall', 'Aria·Vale', 'Aria', 'calm', 4],
    [7, 0, 'Hall', 'hall', 'Bram', 'Bram', 'calm', 2], [9, 0, 'Cellar', 'cellar', 'Bram', 'Bram', 'calm', 3], [9, 1, 'Cellar', 'cellar', 'Aria·Vale', 'Aria', 'busy', 1]]);
  assert.equal(scenes[0].url, u('aria', 'calm', 2)); assert.equal(scenes[1].url, u('aria', 'calm', 1)); assert.equal(scenes[2].url, '');   // Bram #2 is a blocked host: the scene stays, without a picture
  assert.ok(!scenes.some(s => s.name === 'Nobody' || s.name === 'Cole'));
});
test('scenes at a place: by node, by text when no node is known; "scenes here"', () => {
  assert.deepEqual(scenesAt(scenes, { node: 'hall' }).map(s => s.floor), [3, 3, 7]);
  assert.deepEqual(scenesAt(scenes, { node: 'cellar', place: 'Cellar' }).map(s => s.floor), [9, 9]);
  assert.deepEqual(scenesAt(scenes, { node: 'attic', place: 'Hall' }), []);
  const bare = scenes.map(s => ({ ...s, node: '' }));
  assert.deepEqual(scenesAt(bare, { node: 'hall' }, p => (p === 'Hall' ? 'hall' : '')).map(s => s.floor), [3, 3, 7]);   // the viewer's own resolver places rows without a node
  assert.deepEqual(scenesAt(bare, { place: 'Hall' }).map(s => s.floor), [3, 3, 7]); assert.deepEqual(scenesAt(bare, {}), []); assert.deepEqual(scenesAt(null, { node: 'x' }), []);
});
test('timeline per character: floor order, roster match wins, short-name fallback', () => {
  assert.deepEqual(timelineOf(scenes, 'Aria').map(s => [s.floor, s.cat]), [[3, 'calm'], [3, 'calm'], [9, 'busy']]);
  assert.deepEqual(timelineOf([...scenes].reverse(), 'Bram').map(s => s.floor), [7, 9]);
  assert.deepEqual(timelineOf(scenes, 'Nobody'), []);
  assert.equal(sameWho({ name: 'Aria·Vale', who: '' }, 'Aria'), true); assert.equal(sameWho({ name: 'Aria·Vale', who: 'Zed' }, 'Aria'), false); assert.equal(sameWho({ name: 'Aria·Vale', who: '' }, ''), false);
});
test('person card sections: declared category order, blocked addresses left out, numbers kept', () => {
  const r = categoryRows(table, spec, 'Bram');
  assert.deepEqual(r.map(x => [x.cat, x.items.map(i => i.n)]), [['calm', [1, 3]], ['night', [1]]]);
  assert.deepEqual(categoryRows(table, spec, 'Aria').map(x => x.cat), ['calm', 'busy']);   // short name
  assert.deepEqual(categoryRows(table, spec, 'Nobody'), []); assert.deepEqual(categoryRows(table, spec, 'Cole'), []);
});
test('no switch-state or address is stored by the pure modules: recompute is identical', () => {
  const again = collectScenes({ spec, table: readTable(spec, EXT, ok), floors: FLOORS, placeOf: f => PLACES[f], nodeOf: p => ({ Hall: 'hall', Cellar: 'cellar' }[p] || ''), rosterRows: [{ name: 'Aria', displayName: 'Aria·Vale' }, { name: 'Bram' }] });
  assert.equal(mediaSig(again), mediaSig(scenes)); assert.deepEqual(again, scenes);
  assert.deepEqual(collectScenes({ spec: null, table, floors: FLOORS }), []); assert.deepEqual(collectScenes({ spec, table: { chars: [] }, floors: FLOORS }), []);
});
