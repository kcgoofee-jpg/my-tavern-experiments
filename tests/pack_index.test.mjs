// K-R92: the shipped index and the match score (core/pack-index.mjs) and the shipped map/packs/index.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scorePack, bestMatch, rowsOf, THRESHOLD } from '../map/core/pack-index.mjs';

const IDX = { schema: 1, default: 'a', packs: [
  { id: 'a', schema: 1, title: 'A', match: { card: { name: ['Harbor'], creator: ['Quill'], tags: ['Sea'] }, worldbook: ['Tides', 'Piers', 'Lamps'] } },
  { id: 'b', schema: 2, title: 'B', match: { card: { name: ['Harbor'] } } },
  { id: 'c', schema: 1, title: 'C' }] };
const ev = (o = {}) => ({ card: { name: '', creator: '', tags: [] }, titles: [], chatKeys: [], chatVarOf: id => 'var_' + id, ...o });

test('K-R92: the chat variable alone is 100 and wins over a name match', () => {
  assert.equal(scorePack(IDX.packs[2], ev({ chatKeys: ['var_c'] })), 100);
  const m = bestMatch(IDX, ev({ card: { name: 'Harbor Lights', creator: '', tags: [] }, chatKeys: ['var_c'] }));
  assert.equal(m.id, 'c'); assert.equal(m.score, 100);
});

test('K-R92: one card-name word = 10 is a candidate; ties go to the pack listed first', () => {
  assert.equal(THRESHOLD, 10);
  const m = bestMatch(IDX, ev({ card: { name: 'The Harbor', creator: '', tags: [] } }));
  assert.equal(m.id, 'b'); assert.equal(m.score, 10);   // I-26: a lists worldbook titles, so its name word alone is 0; b has no titles
  assert.equal(scorePack(IDX.packs[1], ev({ card: { name: 'The Harbor' } })), 10);
  assert.equal(bestMatch({ packs: [{ id: 'x', match: { card: { name: ['Harbor'] } } }, { id: 'y', match: { card: { name: ['Harbor'] } } }] }, ev({ card: { name: 'Harbor' } })).id, 'x', 'equal scores: index order');
});

test('K-R92: each field counts once: name, creator and tags are 10 each', () => {
  assert.equal(scorePack(IDX.packs[0], ev({ titles: ['Tides'], card: { name: 'Harbor Harbor Harbor', creator: 'Quill & Co', tags: ['Sea', 'Salt'] } })), 35);
  assert.equal(scorePack(IDX.packs[0], ev({ titles: ['Tides'], card: { name: 'x', creator: 'quill', tags: ['sea'] } })), 25, 'creator and tags compare in the normal form');
});

test('K-R92: one worldbook title = 5 is not a candidate; two titles = 10 are', () => {
  assert.equal(scorePack(IDX.packs[0], ev({ titles: ['Tides'] })), 5);
  assert.equal(bestMatch(IDX, ev({ titles: ['Tides'] })), null);
  assert.equal(scorePack(IDX.packs[0], ev({ titles: ['Tides', 'Lamps', 'Other'] })), 10);
  assert.equal(bestMatch(IDX, ev({ titles: ['Tides', 'Lamps'] })).id, 'a');
});

test('K-R92: words and titles are compared normalised (case, full-width, quotes, spaces)', () => {
  assert.equal(scorePack(IDX.packs[1], ev({ card: { name: 'ＨＡＲＢＯＲ' } })), 10);
  assert.equal(scorePack(IDX.packs[0], ev({ titles: ['  tides ', 'PIERS'] })), 10);
  const q = { id: 'q', match: { worldbook: ["Captain's Log", 'Salt & Pepper'] } };
  assert.equal(scorePack(q, ev({ titles: ['Captain\u2019s Log', 'salt and pepper'] })), 10);
});

test('I-26: card words alone never reach the threshold for a pack that lists worldbook titles; a title hit or the chat variable lets them count', () => {
  const card = { name: 'Harbor Lights', creator: 'Quill', tags: ['Sea'] };
  assert.equal(scorePack(IDX.packs[0], ev({ card })), 0);
  assert.equal(bestMatch({ packs: [IDX.packs[0]] }, ev({ card })), null);
  assert.equal(scorePack(IDX.packs[0], ev({ card, titles: ['Piers'] })), 35, 'one title (5) lets the three words count (30)');
  assert.equal(scorePack(IDX.packs[0], ev({ card, chatKeys: ['var_a'] })), 130);
});

test('I-26: a second card of the same author (name carries the author word, no matching entry title) does not open the first pack; the first pack\'s card shape still does', () => {
  const idx = JSON.parse(readFileSync(new URL('../map/packs/index.json', import.meta.url), 'utf8')), author = idx.packs[0].match.card.name[0];
  const first = ev({ card: { name: 'Some Estate ' + author + ' V1', creator: '', tags: [] }, titles: ['世界观', '角色速览', 'CG生成指导', '人物-甲', '天城'] });
  assert.equal(bestMatch(idx, first).id, 'eden'); assert.equal(bestMatch(idx, first).score, 25);
  const titles = ['🌍世界观概况', '👥角色速览表', '====👥角色介绍=====', '🏫某学院', '🛣️某路', ...Array.from({ length: 100 }, (_, i) => `人物${i}|名${i}`)];
  const second = ev({ card: { name: 'Some City ' + author + ' V2', creator: 'Someone Else', tags: [] }, titles });
  assert.equal(scorePack(idx.packs[0], second), 0); assert.equal(bestMatch(idx, second), null);
});

test('K-R92: a pack without match scores only by its chat variable; bad rows are skipped', () => {
  assert.equal(scorePack({ id: 'c' }, ev({ card: { name: 'Harbor' }, titles: ['Tides'] })), 0);
  assert.equal(scorePack(null, ev()), 0); assert.equal(bestMatch(null, ev()), null); assert.equal(bestMatch({}, ev()), null);
  assert.deepEqual(rowsOf({ packs: [null, 3, { id: 'x' }, { title: 'no id' }] }).map(r => r.id), ['x']);
});

test('the shipped index lists the packs; the first pack has a name word and five worldbook titles; schema-2 rows carry their manifest match', () => {
  const read = f => JSON.parse(readFileSync(new URL('../map/packs/' + f, import.meta.url), 'utf8'));
  const idx = read('index.json');
  assert.equal(idx.schema, 1); assert.equal(idx.default, 'eden');
  assert.deepEqual(idx.packs.map(r => r.id), ['eden', 'town', 'minimal']);
  assert.equal(idx.packs[0].match.card.name.length, 1); assert.equal(idx.packs[0].match.worldbook.length, 5);
  assert.equal(idx.packs[1].match, undefined, 'the example pack is an explicit choice only');
  assert.deepEqual(idx.packs[2].match, read('minimal/manifest.json').match);
  for (const r of idx.packs) assert.equal(r.schema, read(r.id + '/manifest.json').schema);
});
