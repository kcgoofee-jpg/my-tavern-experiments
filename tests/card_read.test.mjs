// K-R93 / K-R94 / K-R95: runtime card reading (map/core/card-read.mjs) over the made-up fixtures in tests/fixtures/cardread.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { candidates, greetingOf, cardLang, deriveAutoPack, fingerprint, shapeOf, pathsOf, rosterTables } from '../map/core/card-read.mjs';
import { placeWord, PLACE } from '../map/core/vocab.mjs';
import { validate2 } from '../map/core/pack-v2.mjs';

const fx = n => JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/cardread/' + n + '.json', import.meta.url)), 'utf8'));
const byName = pack => new Map(pack.nodes.map(n => [n.name, n]));

for (const name of ['en_harbour', 'zh_city']) {
  test(`${name}: the automatic pack matches its expected block`, () => {
    const { src, expected: x } = fx(name), { pack, problems } = deriveAutoPack(src, { uiLang: 'zh' }), m = byName(pack), idName = new Map(pack.nodes.map(n => [n.id, n.name]));
    assert.equal(pack.schema, 2); assert.match(pack.id, /^c_[0-9a-z]+$/); assert.equal(pack.title, x.title); assert.equal(pack.lang, x.lang);
    assert.deepEqual(pack.nodes.map(n => [n.name, n.parent ? idName.get(n.parent) : null]), x.nodes);
    assert.equal(idName.get(pack.ui.start), x.start, 'the greeting names the opening view');
    assert.deepEqual(pack.vars, x.vars);
    assert.equal(pack.entities.groups[0].source.mvu, x.present);
    assert.deepEqual(pack.entities.fields.map(f => f.field), x.fields);
    for (const n of x.notNodes) assert.ok(!m.has(n), n + ' is not a place');
    assert.deepEqual(problems, []);
    assert.deepEqual(validate2(pack, { trusted: false }).problems, [], 'valid as a foreign pack');
    assert.equal(JSON.stringify(deriveAutoPack(src, { uiLang: 'zh' })), JSON.stringify({ pack, fp: fingerprint(src), problems }), 'deterministic');
  });
}

test('a person entry and a rules entry are not nodes (roster names are skipped, rules carry no place word)', () => {
  const { src } = fx('en_harbour'), ps = pathsOf(shapeOf(src)), people = rosterTables(ps).flatMap(t => t.names);
  assert.deepEqual(people.sort(), ['Mara Venn', 'Old Tomas']);
  const withPeople = candidates(src, { lang: 'en', people }).nodes.map(n => n.name), without = candidates(src, { lang: 'en', people: [] }).nodes.map(n => n.name);
  assert.ok(!withPeople.includes('Mara Venn') && !withPeople.includes('Writing Rules'));
  assert.ok(!without.includes('Writing Rules'), 'a rules entry has no place word, with or without the roster');
});

test('nested titles nest; a key that is a place word makes a place; keys shaped like a pattern are not aliases', () => {
  const src = { books: [{ name: 'b', entries: [
    { title: 'Old Quarter', keys: ['old quarter'] }, { title: 'Old Quarter · Cooper Street', keys: [] }, { title: 'Old Quarter · Cooper Street · Bell Loft', keys: [] },
    { title: 'Gilded Cage', keys: ['inn', '/gild.*/i', 'wild*', 'x?', 'a very long key that is definitely over twenty code points', 'cage'] },
    { title: 'Merchant Guild', keys: ['guild'] }] }] };
  const { nodes } = candidates(src, { lang: 'en' }), n = new Map(nodes.map(x => [x.name, x]));
  assert.equal(n.get('Cooper Street').parent, n.get('Old Quarter').id); assert.equal(n.get('Bell Loft').parent, n.get('Cooper Street').id, 'the outer segment names the parent (Z-04: the entry is a place because its outer is one)');
  assert.deepEqual(n.get('Gilded Cage').alias, ['Gilded Cage', 'inn', 'cage']);
  assert.ok(!n.has('Merchant Guild'), 'no place word, no place');
  assert.equal(n.get('Gilded Cage').parent, 'root');
});

test('151 place entries give 150 nodes and one problem; ids are w_ + fnv36 of the normalised title and unique', () => {
  const entries = Array.from({ length: 151 }, (_, i) => ({ title: `Quarter ${i} Street`, keys: [] })), r = candidates({ books: [{ name: 'b', entries }] }, { lang: 'en' });
  assert.equal(r.nodes.length, 150); assert.deepEqual(r.problems.map(p => p.code), ['candidates-limit']); assert.equal(new Set(r.nodes.map(n => n.id)).size, 150);
  assert.ok(r.nodes.every(n => /^w_[0-9a-z]+$/.test(n.id)));
});

test('skipped entries: the pack entry, the variable-initialisation entry, titles over 40 code points, our own entries', () => {
  const src = { books: [{ name: 'b', entries: [{ title: 'spatial_os:pack' }, { title: '[initvar] Street' }, { title: 'The Extremely Long Street Of Never Ending Names And Words' }, { title: 'Ours Street', ours: true }, { title: 'Real Street' }] }] };
  assert.deepEqual(candidates(src, { lang: 'en' }).nodes.map(n => n.name), ['Real Street']);
});

test('language detection: zh, en, ja, ko, and the UI language for a short sample', () => {
  const l = (t, ui) => cardLang({ name: '', greeting: t, books: [] }, ui);
  assert.equal(l('清晨的钟声从钟楼传来，你站在云岭城的主街上，雾气还没有散去。'), 'zh');
  assert.equal(l('You step off the ferry at the harbour and the lamps are already lit.'), 'en');
  assert.equal(l('朝の鐘が鳴って、あなたは港の町の通りに立っていました。まだ霧が晴れていません。'), 'ja');
  assert.equal(l('아침 종소리가 울리고 당신은 항구 마을의 거리에 서 있습니다 안개가 아직 걷히지 않았습니다'), 'ko');
  assert.equal(l('Hi', 'en'), 'en'); assert.equal(l('Hi', 'zh'), 'zh'); assert.equal(l('', 'zh'), 'zh');
});

test('the greeting only sets the opening view: ui.start is a node id, never a current location or a variable', () => {
  const { pack } = deriveAutoPack(fx('en_harbour').src);
  assert.deepEqual(Object.keys(pack.ui), ['start']); assert.ok(pack.nodes.some(n => n.id === pack.ui.start) && pack.ui.start !== 'root');
  assert.ok(!('here' in pack) && !('here' in pack.ui) && pack.vars.location === 'World.Location');
  const noGreeting = deriveAutoPack({ ...fx('en_harbour').src, greeting: '' }).pack; assert.equal(noGreeting.ui, undefined);
});

test('K-R38 discovery runs over stat when it has keys, else over the initvar shape; stat_data is unwrapped', () => {
  const base = { name: 'X', avatar: 'x.png', books: [] };
  assert.equal(deriveAutoPack({ ...base, stat: { Loc: { 'Current Location': 'a' } }, initvar: 'Other:\n  Place: b' }).pack.vars.location, 'Loc.Current Location');
  assert.equal(deriveAutoPack({ ...base, stat: {}, initvar: 'Other:\n  Place: b' }).pack.vars.location, 'Other.Place');
  assert.equal(deriveAutoPack({ ...base, initvar: '{"stat_data": {"World": {"Place": "c"}}}' }).pack.vars.location, 'World.Place');
  assert.equal(deriveAutoPack({ ...base, initvar: 'a: &x 1' }).pack.vars, undefined, 'a shape that cannot be read gives no variables and no error');
});

test('fingerprint: the same card is stable; a changed entry title, key path or avatar moves it; the entry order does not', () => {
  const { src } = fx('en_harbour'), fp = fingerprint(src);
  assert.equal(fingerprint(JSON.parse(JSON.stringify(src))), fp);
  const rev = JSON.parse(JSON.stringify(src)); rev.books[0].entries.reverse(); assert.equal(fingerprint(rev), fp);
  const t = JSON.parse(JSON.stringify(src)); t.books[0].entries[0].title += ' X'; assert.notEqual(fingerprint(t), fp);
  assert.notEqual(fingerprint({ ...src, avatar: 'other.png' }), fp); assert.notEqual(fingerprint({ ...src, initvar: src.initvar + 'Extra:\n  Place: z\n' }), fp);
});

test('PLACE words: at most 60 per language; Chinese by substring, English by whole word', () => {
  assert.ok(PLACE.zh.length <= 60 && PLACE.en.length <= 60);
  assert.equal(placeWord('Lantern Docks', 'en'), 'dock'); assert.equal(placeWord('Innocent', 'en'), '', 'a word inside a longer word is not a place word'); assert.equal(placeWord('Harbour Office', 'en'), 'harbour');
  assert.equal(placeWord('云岭城', 'zh'), '城'); assert.equal(placeWord('陆小七', 'zh'), '');
});

// ---- I-26: a modern-city card shape (made-up text) ----
const cityBook = { books: [{ name: 'b', entries: [
  { title: '🏫北岸学院', keys: ['北岸'] }, { title: '🏫北岸学院', keys: ['学院区'] }, { title: '🛣️柳条路', keys: ['街道'] }, { title: '🏬灯火商城', keys: ['商城'] },
  { title: '🏠{{user}}的住处', keys: ['{{user}}的房间', '住所'] }, { title: '董事长|周小满', keys: ['董事长'] }, { title: '店长|陈阿福', keys: ['店'] }, { title: '====👤北岸学院====', keys: [] },
  { title: '=====🛣️柳条路===', keys: ['路'] }, { title: '---', keys: [] }, { title: '📑出行规定', keys: ['街道'] }, { title: '🌇社会文化|某某', keys: [] }, { title: '🏩星河剧场', keys: ['剧场'] }] }] };

test('I-26: emoji and {{user}} leave the names; a place listed twice is one node with both key sets', () => {
  const { nodes } = candidates(cityBook, { lang: 'zh' }), names = nodes.map(n => n.name);
  assert.deepEqual(names, ['北岸学院', '柳条路', '灯火商城', '住处', '星河剧场']);
  assert.deepEqual(nodes[0].alias, ['北岸学院', '北岸', '学院区']);
  assert.ok(nodes.every(n => !/[{}]|\p{Extended_Pictographic}/u.test(n.name + n.alias.join('|'))));
  assert.deepEqual(nodes[3].alias, ['住处', '房间', '住所']);
});

test('I-26: `role|name` entries are people, divider entries and document-marked rules are skipped; a person name is not a place elsewhere', () => {
  const names = candidates(cityBook, { lang: 'zh' }).nodes.map(n => n.name);
  for (const bad of ['周小满', '陈阿福', '董事长', '出行规定', '社会文化', '某某']) assert.ok(!names.some(n => n.includes(bad)), bad);
  assert.ok(!names.some(n => /^[=\-]/.test(n)));
  const withNamed = candidates({ books: [{ name: 'b', entries: [{ title: '管理员|北岸路', keys: [] }, { title: '北岸路', keys: [] }] }] }, { lang: 'zh' });
  assert.deepEqual(withNamed.nodes, [], 'the name of a role|name title is a person');
});

test('I-26: the start node comes from the first real alternate greeting when the greeting is only a short marker', () => {
  const nodes = [{ id: 'a', name: '北岸学院' }, { id: 'b', name: '柳条路' }];
  const src = { name: '一座城的故事', greeting: '【开局标记】', alternates: ['【立绘】', '傍晚，你沿着柳条路慢慢走回家，路灯一盏一盏亮了起来，风里有桂花的味道，远处的钟声刚刚敲过六下，街角的店铺陆续拉下了卷帘门。'],
    books: [{ name: 'b', entries: nodes.map(n => ({ title: n.name, keys: ['路', '学院'] })) }] };
  assert.equal(greetingOf(src), src.alternates[1]);
  const { pack } = deriveAutoPack(src, { uiLang: 'zh' }), nm = new Map(pack.nodes.map(n => [n.id, n.name]));
  assert.equal(nm.get(pack.ui.start), '柳条路');
  const real = '清晨的北岸学院还很安静，你推开教室的门，窗边的位置空着，阳光落在桌面上，像一张摊开的纸。';
  assert.equal(greetingOf({ greeting: real, alternates: [src.alternates[1]] }), real, 'a real first_mes wins');
  assert.equal(greetingOf({ greeting: '标记', alternates: [] }), '标记');
});
