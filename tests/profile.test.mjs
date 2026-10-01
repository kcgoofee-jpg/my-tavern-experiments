// The kernel side of a pack's variables and roster (docs/kernel-schema.md K-R37..K-R44, K-R69): period bands (K-R39), the discovery vocabulary (K-R38, K-R42), the profile of a pack and of a
// pack that names nothing, the portrait rules (K-R43), and the roster readers on a pack that declares its own paths and fields (nothing here is the first pack's).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bandOf, DEFAULT_PERIODS } from '../map/core/periods.mjs';
import * as VOC from '../map/core/vocab.mjs';
import { profileOf, profileFromV1, portraitOk, slotDef, KERNEL, SLOTS } from '../map/core/profile.mjs';
import { setProfile } from '../map/tavern/pack-profile.mjs';
import * as AD from '../map/tavern/stat-path-mapping.mjs';
import * as MV from '../map/tavern/mvu-readers.mjs';
import * as CH from '../map/tavern/characters-parse.mjs';

test('K-R39 periods: the longest period word wins, then the earliest band; else the hour, wrapping past midnight; else no band', () => {
  const P = [{ id: 'a', start: '06:00', words: ['early'] }, { id: 'b', start: '12:00', words: ['mid', 'midday'] }, { id: 'c', start: '22:00', dark: true, words: ['late'] }];
  assert.equal(bandOf(P, { period: 'the midday sun', time: '' }).id, 'b', 'midday (6) beats mid (3)');
  assert.equal(bandOf(P, { period: 'early and late', time: '' }).id, 'a', 'same length: the earlier band');
  assert.equal(bandOf(P, { period: 'nothing we know', time: '13:05' }).id, 'b');
  assert.equal(bandOf(P, { period: '', time: '05:59' }).id, 'c', 'before the first start the last band wraps round');
  assert.equal(bandOf(P, { period: '', time: '22:00' }).id, 'c'); assert.equal(bandOf(P, { period: '', time: '8时30' }).id, 'a');
  assert.equal(bandOf(P, { period: '', time: '' }), null); assert.equal(bandOf(P, null), null);
  assert.deepEqual(DEFAULT_PERIODS.map(b => [b.id, b.start, !!b.dark]), [['dawn', '05:00', false], ['day', '07:00', false], ['dusk', '17:00', false], ['night', '20:00', true]]);
  assert.equal(bandOf(undefined, { time: '21:00' }).dark, true, 'a pack without bands gets the defaults'); assert.equal(bandOf([], { time: '12:00' }).id, 'day');
});

test('vocabulary: substring words, exact names in priority order, slot words with their endings', () => {
  assert.ok(VOC.hasWord('location', '当前所在地')); assert.ok(VOC.hasWord('location', 'Current_Location')); assert.ok(!VOC.hasWord('location', '时间'));
  assert.equal(VOC.exactRank('place', '位置') >= 0, true); assert.ok(VOC.exactRank('place', '当前位置') < VOC.exactRank('place', '地点'), 'priority order');
  assert.equal(VOC.exactKey('place', { 地点: 'x', 位置: 'y' }), '位置', 'the list decides, not the row order'); assert.equal(VOC.exactKey('place', { 备注: 'x' }), undefined);
  assert.equal(VOC.exactKey('place', { 位置: '', 地点: 'z' }, undefined, v => !!v), '地点');
  assert.ok(VOC.slotHit('grade', '园丁等级') && !VOC.slotHit('grade', '等级') && VOC.slotHit('grade', 'GRADE') && VOC.slotHit('grade', 'rank'), 'an ending needs one character before it; an exact word is the whole name');
  assert.ok(VOC.slotHit('core', 'XX值') && !VOC.slotHit('core', '值') && !VOC.slotHit('core', 'X值') && VOC.slotHit('core', 'core_value'));
  assert.ok(VOC.slotHit('social', '身份') && VOC.slotHit('social', '社会身份') && VOC.slotHit('known', '外界知情'));
  assert.equal(VOC.slotFind('height', ['体重', '身高', 'height']), '身高'); assert.equal(VOC.slotFind('height', ['体重']), '');
  assert.ok(VOC.isEmptyValue('') && VOC.isEmptyValue(' None ') && VOC.isEmptyValue('待初始化') && !VOC.isEmptyValue('白衬衫'));
  assert.deepEqual(VOC.exactWords('outfitOrder', 'zh'), ['衣服', '裤子', '鞋子']);
});

test('profileOf: paths, bands, the tables of every group by group id, the present group and the stage group, the place field, slots by x-slot, the avatar block; nothing named = the kernel profile', () => {
  const p = profileOf({ vars: { location: 'a.b', outfit: 'a.c', periods: [{ id: 'x', start: '01:00' }] },
    entities: { groups: [{ id: 'g1', source: { mvu: 'T1' } }, { id: 'here', source: { mvu: 'T2', present: true, place: 'spot' } }, { id: 'g2', source: { mvu: 'T3' } }, { id: 'g3', source: { mvu: 'T4' } }],
      fields: [{ field: 'F1', kind: 'tag', 'x-slot': 'grade' }, { field: 'F2', kind: 'text', 'x-slot': 'nonsense' }, { field: 'F3', kind: 'text' }, { field: 'F4', kind: 'gauge', 'x-slot': 'core', ladder: [{ up_to: 50, label: 'half' }] }], avatar: { hosts: ['a.b'] } } });
  assert.equal(p.paths.location, 'a.b'); assert.equal(p.paths.time, ''); assert.deepEqual(p.periods, [{ id: 'x', start: '01:00' }]);
  assert.deepEqual(p.tables, { here: 'T2', g1: 'T1', g2: 'T3', g3: 'T4' }); assert.equal(p.place, 'spot');
  assert.deepEqual(p.groups.map(g => g.id), ['here', 'g1', 'g2', 'g3'], 'the present group first, the others in the pack\'s order'); assert.equal(p.presentId, 'here'); assert.equal(p.stageGroup, 'g2', 'the second group after the present one');
  assert.deepEqual(profileOf({ entities: { groups: [{ id: 'a', label: 'A', source: { mvu: 'TA' } }] } }).groups, [{ id: 'present', mvu: '' }, { id: 'a', label: 'A', mvu: 'TA' }], 'a pack without a present group still has one (found by the kernel words)');
  assert.deepEqual(Object.keys(p.slots).sort(), ['core', 'grade']); assert.equal(p.slots.grade.field, 'F1'); assert.deepEqual(p.avatar, { hosts: ['a.b'] });
  assert.deepEqual(slotDef(p, 'core').ladder, [{ up_to: 50, label: 'half' }]); assert.equal(slotDef(p, 'height').kind, 'text'); assert.equal(slotDef(null, 'tier').scan, true);
  assert.deepEqual(KERNEL.tables, { present: '', members: '', targets: '' }); assert.deepEqual(KERNEL.groups.map(g => g.id), ['present', 'members', 'targets']); assert.equal(KERNEL.presentId, 'present'); assert.deepEqual(KERNEL.periods.map(b => b.id), ['dawn', 'day', 'dusk', 'night']); assert.deepEqual(KERNEL.slots, {});
  assert.deepEqual(profileOf(null).paths, KERNEL.paths); assert.equal(SLOTS.length, 10);
  assert.notEqual(p.paths, profileOf({ vars: { location: 'a.b' } }).paths, 'each profile is a copy');
});

test('profileFromV1: the manifest vars first, the overlay over them (K-R69); unknown keys and non-strings ignored', () => {
  const p = profileFromV1({ manifest: { vars: { location: 'm.loc', time: 'm.t', nope: 'x', date: 3 } }, overlay: { schema: 2, vars: { time: 'o.t', periods: [{ id: 'n', start: '20:00', dark: true }] }, entities: { groups: [{ id: 'p', label: 'P', source: { mvu: 'T', present: true } }] } } });
  assert.equal(p.paths.location, 'm.loc'); assert.equal(p.paths.time, 'o.t'); assert.equal(p.paths.date, ''); assert.deepEqual(p.periods.map(b => b.id), ['n']); assert.equal(p.tables.p, 'T'); assert.equal(p.presentId, 'p');
  assert.deepEqual(profileFromV1({}).paths, KERNEL.paths); assert.equal(profileFromV1({ manifest: { vars: { location: 'x.y' } } }).paths.location, 'x.y');
});

test('K-R43 portraits: https, an image file, no query; the host equals an entry; a prefixed entry scopes the path and needs one of `require`; `deny` anywhere in the path; no hosts, no portraits', () => {
  const av = { hosts: ['img.example.org/u/Author/', 'plain.example.net'], require: ['/pub/'], deny: ['secret'] };
  const ok = u => portraitOk(av, u);
  assert.ok(ok('https://img.example.org/u/author/repo/pub/a.png')); assert.ok(ok('https://IMG.example.org/U/AUTHOR/pub/a.JPG'), 'host and prefix ignore case');
  assert.ok(!ok('https://img.example.org/u/author/repo/a.png'), 'no required fragment'); assert.ok(!ok('https://img.example.org/u/other/pub/a.png'), 'outside the prefix');
  assert.ok(ok('https://plain.example.net/any/thing.webp'), 'an entry without a prefix needs no fragment'); assert.ok(!ok('https://sub.plain.example.net/a.png'), 'the host must be equal');
  assert.ok(!ok('https://plain.example.net/a.png?x=1') && !ok('https://plain.example.net/a.png#x') && !ok('http://plain.example.net/a.png') && !ok('https://plain.example.net/a.gif') && !ok('https://plain.example.net/secret/a.png') && !ok('https://plain.example.net/%73ecret/a.png'));
  assert.ok(!ok('nonsense') && !ok('') && !portraitOk({}, 'https://plain.example.net/a.png') && !portraitOk(null, 'https://plain.example.net/a.png'));
});

// A pack that declares its own paths and fields (none of them the first pack's): everything reads through its profile; the kernel words find what it does not name.
const PACK = profileOf({ vars: { location: 'state.where', time: 'state.clock', date: 'state.day', outfit: 'hero.wear', periods: [{ id: 'm', start: '06:00', words: ['morn'] }, { id: 'n', start: '21:00', dark: true, words: ['dusk'] }] },
  entities: { groups: [{ id: 'here', source: { mvu: 'who_is_here', present: true, place: 'spot' } }, { id: 'crew', label: 'crew', source: { mvu: 'crew' } }],
    fields: [{ field: 'rank', kind: 'tag', 'x-slot': 'grade' }, { field: 'xp', kind: 'gauge', min: 0, max: 100, ladder: [{ up_to: 50, label: 'green' }, { up_to: 100, label: 'veteran' }], 'x-slot': 'core' },
      { field: 'level', kind: 'ladder', scan: true, ladder: [{ label: 'rookie', match: ['novice'] }, { label: 'ace' }], 'x-slot': 'tier' }, { field: 'nick', kind: 'text', 'x-slot': 'code' }] } });
const STAT = { state: { where: 'Dock', clock: '21:30', day: 'Day 2' }, hero: { wear: { top: 'coat', bottom: 'denim', shoes: 'boots' }, fame: 7 },
  crew: { Kim: { role: 'pilot', rank: 'B', xp: 70, nick: 'K', note: 'a novice' }, Lee: { role: 'cook', xp: 10, level: 'ace' } }, who_is_here: { Kim: { spot: 'Dock · pier 3' }, Ann: { role: 'guest' } }, junk: { a: 1 } };
test('a pack with its own paths and fields: the variable map, the clock, the outfit, the roster rows and the people all read through it', () => {
  setProfile(PACK);
  try {
    const m = AD.detect(STAT);
    assert.equal(m.location, 'state.where'); assert.equal(m.time, 'state.clock'); assert.equal(m.date, 'state.day'); assert.equal(m.outfit, 'hero.wear'); assert.equal(m.here, 'who_is_here'); assert.equal(m.crew, 'crew');
    assert.equal(m.gradeField, 'rank'); assert.equal(m.coreField, 'xp'); assert.equal(m.codeField, 'nick'); assert.equal(m.tierField, '', 'a scanning ladder has no field name');
    assert.equal(AD.getByPath(STAT, m.location), 'Dock');
    const w = MV.worldTime(STAT, m);
    assert.deepEqual(w, { date: 'Day 2', time: '21:30', period: '' }); assert.equal(MV.todPhase(w), 'n'); assert.equal(MV.isNight(w), true); assert.equal(MV.todPhase({ period: 'Morning', time: '23:00' }), 'm');
    assert.deepEqual(MV.outfit(STAT, m.outfit), { top: 'coat', bottom: 'denim', shoes: 'boots' }); assert.equal(MV.outfitText(MV.outfit(STAT, m.outfit)), 'coat / denim / boots');
    const r = MV.rosters(STAT, m);
    assert.deepEqual(r.crew.items.map(i => [i.name, i.identity, i.grade, i.core, i.coreStage, i.more, i.tier]),
      [['Kim', 'pilot', 'B', 70, 'veteran', { code: 'K' }, 'rookie'], ['Lee', 'cook', undefined, 10, 'green', undefined, 'ace']], 'the pack\'s bands name its own gauge; the ladder finds novice by its match word');
    assert.deepEqual(r.here.items.map(i => i.name), ['Kim', 'Ann']); assert.deepEqual(Object.keys(r), ['here', 'crew'], 'one entry per group the pack declares');
    assert.deepEqual(MV.presentList(STAT, m.here), [{ name: 'Kim', place: 'Dock · pier 3' }, { name: 'Ann', place: '' }], 'the place field is the pack\'s');
    assert.deepEqual(CH.mvuChars(STAT, 'Dock', m.here).map(c => [c.name, c.place, !!c.present]), [['Kim', 'Dock · pier 3', false], ['Ann', 'Dock', true]], 'the tables that hold the pack\'s variables are no people tables');
    assert.equal(MV.rosters(STAT, { ...m, coreField: 'xp' }).crew.items[1].coreStage, 'green');
    assert.equal(MV.rosters({ ...STAT, crew: { Kim: { role: 'x', power: 70 } } }, { coreField: 'power' }).crew.items[0].coreStage, '档 2', 'another field: the pack\'s cuts, the kernel\'s labels');
  } finally { setProfile(null); }
});

test('a pack that names nothing (kernel profile): paths, tables and fields are all found by the kernel words; zero-config groups need a place- or person-like field (K-06)', () => {
  setProfile(null);
  const other = { world: { location: 'Town', time: '09:30', date: 'd1' }, hero: { outfit: { top: 'coat' }, reputation: 40, wallet: { cash: 3 } }, present: { Ann: { role: 'guide' } },
    staff: { Bo: { occupation: 'cook', height: '170' } }, stock: { apple: { price: 3 } }, junk: { a: { b: 1 } } };
  const m = AD.detect(other);
  assert.deepEqual([m.location, m.time, m.date, m.present, m.reputation], ['world.location', 'world.time', 'world.date', 'present', 'hero.reputation']);
  assert.equal(m.outfit, 'hero.outfit'); assert.equal(m.members, '', 'tables are not named by the detector, the roster reader finds them');
  const r = MV.rosters(other, m);
  assert.deepEqual(Object.entries(r).map(([g, t]) => [g, t && t.key]), [['present', 'present'], ['members', 'staff'], ['targets', null]], 'the stock table has no person-like field, the wallet holds a variable path');
  assert.deepEqual(r.members.items[0].more, { social: 'cook', height: '170' });
  assert.equal(MV.todPhase({ time: '18:00' }), 'dusk'); assert.equal(MV.isNight({ time: '20:30' }), true); assert.equal(MV.isNight({ time: '12:00' }), false);
  assert.deepEqual(MV.findPortraits(['defaultPortraits = { "A": "https://i.postimg.cc/x/a.png" }']), {}, 'no avatar block, no card-script portraits');
  assert.equal(MV.portraitOk('https://i.postimg.cc/x/a.png'), false);
  assert.equal(MV.rosters({ a: {}, b: {} }).members, null); assert.equal(MV.rosters(null).present, null);
});
