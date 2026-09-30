// S4-4 T5: the people page draws one section per entity group of the pack, in the pack's order (core/people.mjs), not the fixed present / members / targets.
//   - a pack with four groups: four sections with their labels and rows, present group first; the roster reader (mvu.mjs rosters) gives one entry per group
//   - the first pack: the same three sections, in the same order, with the same labels and rows as the page drew before (tests/helpers/people_v1_frozen.mjs), over the roster corpus
//   - an older host that sends the rosters only (no `groups`) gives the same sections
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupList, groupLabel, paneModel, everyone, tableRows } from '../map/core/people.mjs';
import * as AD from '../map/tavern/adapter.mjs';
import { profileOf } from '../map/core/profile.mjs';
import { setProfile } from '../map/tavern/pack-profile.mjs';
import * as MV from '../map/tavern/mvu.mjs';
import * as RS from '../map/core/roster.mjs';
import { MVUBridge } from '../map/tavern/mvu-bridge.mjs';
import { edenProfile } from './helpers/eden-profile.mjs';
import { edenInputs } from './helpers/eden-inputs.mjs';
import { edenDict } from './helpers/eden-strings.mjs';
import { CORPUS, FALLBACK } from './helpers/roster-corpus.mjs';
import { paneV1, countV1 } from './helpers/people_v1_frozen.mjs';

const fmt = (s, v) => { for (const [a, b] of Object.entries(v || {})) s = String(s).split('{' + a + '}').join(b); return s; };
// the viewer's t(): pack strings over the dictionary (here the dictionary as the pack sees it); T(key, fallback, vars) = the shared service's tx
const svc = dict => ({ t: k => dict[k] ?? k, T: (k, zh, v) => fmt(dict[k] ?? zh ?? k, v) });

const FOUR = { entities: { groups: [
  { id: 'crowd', label: 'crowd', i18n: { zh: { label: '人群' }, en: { label: 'Crowd' } }, source: { mvu: '人群表', present: true } },
  { id: 'crew', label: 'crew', i18n: { zh: { label: '船员' } }, source: { mvu: '船员表' } },
  { id: 'guests', label: 'guests', source: { mvu: '访客表' } },
  { id: 'ghosts', label: 'ghosts', i18n: { en: { label: 'Ghosts' } }, source: { mvu: '幽灵表' } }] } };
const STAT4 = { 世界: { 当前地点: '甲地' }, 人群表: { 甲: { 身份: '路人', 位置: '甲地' } }, 船员表: { 乙: { 身份: '水手' }, 丙: { 身份: '厨师' } }, 访客表: { 丁: { 身份: '商人' } }, 幽灵表: { 戊: { 身份: '旧人' } } };

test('a pack with four groups: the roster reader gives one entry per group, and the page gets four sections with their own labels, the present group first', () => {
  setProfile(profileOf(FOUR));
  try {
    const r = MV.rosters(STAT4, {}, []);
    assert.deepEqual(Object.keys(r), ['crowd', 'crew', 'guests', 'ghosts']);
    assert.deepEqual(r.crew.items.map(i => i.name), ['乙', '丙']); assert.deepEqual(r.guests.items.map(i => i.name), ['丁']); assert.deepEqual(r.ghosts.items.map(i => i.name), ['戊']);
    const view = MVUBridge.prototype.groupsView.call({}, r);
    assert.deepEqual(view.map(g => [g.id, g.label, g.rows.length, !!g.present]), [['crowd', 'crowd', 1, true], ['crew', 'crew', 2, false], ['guests', 'guests', 1, false], ['ghosts', 'ghosts', 1, false]]);
    const declared = FOUR.entities.groups;
    for (const [lang, want] of [['zh', ['人群', '船员', 'guests', 'ghosts']], ['en', ['Crowd', 'crew', 'guests', 'Ghosts']]]) {
      const { t } = svc(edenDictLess(lang)), list = groupList({ groups: view, declared });
      assert.equal(list.length, 4); assert.deepEqual(list.map(g => g.id), ['crowd', 'crew', 'guests', 'ghosts']);
      const M = paneModel(list, [], g => groupLabel(g, lang, t));
      assert.deepEqual([M.present.label, ...M.others.map(g => g.label)], want, lang);   // the group's own label in the language, then its label, then its id
      assert.equal(M.others.length, 3); assert.deepEqual(M.others.map(g => g.rest.length), [2, 1, 1]);
    }
    // the present group's roster rows that are on the map are not listed twice; the others lose the people already above them
    const M2 = paneModel(groupList({ groups: view, declared }), [{ name: '甲' }, { name: '乙' }], g => g.id);
    assert.deepEqual(M2.present.extra, []); assert.deepEqual(M2.others.map(g => [g.id, g.rest.map(i => i.name), g.also]), [['crew', ['丙'], 1], ['guests', ['丁'], 0], ['ghosts', ['戊'], 0]]);
    assert.equal(everyone(groupList({ groups: view, declared }), [{ name: '己' }]).size, 6);
    assert.deepEqual(RS.mvuRows(r, 'crowd').filter(x => x.present).map(x => x.name), ['甲'], 'the roster system knows which group is the present one');
    assert.deepEqual(RS.mvuRows(r).filter(x => x.present), [], 'and treats none as present when the id does not match');
  } finally { setProfile(null); }
});
const edenDictLess = lang => ({});   // a dictionary with none of the ch.g_* keys: the labels come from the pack's own group labels

test('a group with a dictionary key (ch.g_<id>) takes the dictionary / pack-string label first; an empty group gets no section; the stage group is the second after the present one', () => {
  const g = { id: 'members', label: 'members', i18n: { zh: { label: '成员' } } };
  assert.equal(groupLabel(g, 'zh', k => (k === 'ch.g_members' ? '庄园成员' : k)), '庄园成员');
  assert.equal(groupLabel(g, 'zh', k => k), '成员'); assert.equal(groupLabel({ id: 'x' }, 'en', k => k), 'x');
  const M = paneModel([{ id: 'p', present: true, items: [] }, { id: 'a', items: [] }, { id: 'b', items: [{ name: 'B' }] }], [], g2 => g2.id);
  assert.deepEqual(M.others.map(x => x.id), ['b']);
  assert.equal(profileOf(FOUR).stageGroup, 'guests'); assert.equal(profileOf({}).stageGroup, 'targets'); assert.equal(profileOf({ entities: { groups: [{ id: 'only', source: { present: true } }] } }).stageGroup, '');
});

test('an older host that sends the rosters only: the pack\'s declared groups (else the rosters\' own keys) give the same sections as the groups payload', () => {
  setProfile(profileOf(FOUR));
  try {
    const r = MV.rosters(STAT4, {}, []), declared = FOUR.entities.groups, view = MVUBridge.prototype.groupsView.call({}, r);
    const a = groupList({ groups: view, declared }), b = groupList({ rosters: r, declared });
    assert.deepEqual(b.map(g => [g.id, g.present, g.items.map(i => i.name)]), a.map(g => [g.id, g.present, g.items.map(i => i.name)]));
    const c = groupList({ rosters: { present: { items: [{ name: 'p' }] }, members: null, targets: { items: [{ name: 't' }] } } });
    assert.deepEqual(c.map(g => [g.id, g.present, g.items.length]), [['present', true, 1], ['members', false, 0], ['targets', false, 1]]);
    assert.deepEqual(groupList({}).map(g => g.id), ['present']);
  } finally { setProfile(null); }
});

test('the first pack: the same three sections, same order, same labels, same rows and counts as the fixed page drew, over the roster corpus (zh and en)', () => {
  const prof = edenProfile(); setProfile(prof);
  try {
    const declared = edenInputs().overlay.entities.groups;
    let n = 0, sec = 0;
    for (const lang of ['zh', 'en']) {
      const { t, T } = svc(edenDict(lang));
      for (const [name, stat] of Object.entries(CORPUS)) {
        const rosters = MV.rosters(stat, {}, FALLBACK);
        for (const mapped of [[], [{ name: Object.values(rosters).flatMap(x => x?.items || [])[0]?.name || '无' }], [{ name: '地图上的人' }]]) {
          const items = mapped.map(c => ({ ...c, place: '' }));
          const old = paneV1(items, rosters, T), now = paneModel(groupList({ groups: MVUBridge.prototype.groupsView.call({}, rosters), declared }), items, g => groupLabel(g, lang, t));
          const also = k => (k ? ' · ' + T('ch.also_here', '另 {n} 人在场', { n: k }) : '');
          const flat = [{ id: now.present.id, label: now.present.label, n: String(items.length + now.present.extra.length), rows: [...items.map(c => c.name), ...now.present.extra.map(i => i.name)] },
            ...now.others.map(g => ({ id: g.id, label: g.label, n: g.rest.length + also(g.also), rows: g.rest.map(i => i.name) }))];
          assert.deepEqual(flat, old, `${lang} ${name}`); n++; sec += old.length;
          // an older host (rosters only) draws the same
          const viaRosters = paneModel(groupList({ rosters, declared }), items, g => groupLabel(g, lang, t));
          assert.deepEqual([viaRosters.present.id, ...viaRosters.others.map(g => g.id)], flat.map(s => s.id), `${lang} ${name} (rosters only)`);
          assert.equal(everyone(groupList({ groups: MVUBridge.prototype.groupsView.call({}, rosters), declared }), items).size, countV1(items, rosters), `${lang} ${name} count`);
        }
      }
    }
    console.log(`people sections: ${n} pages, ${sec} sections, identical to the fixed three`);
    assert.ok(n > 100 && sec > n);
    assert.deepEqual(prof.groups.map(g => g.id), ['present', 'members', 'targets']); assert.deepEqual(svc(edenDict('zh')).t('ch.g_members'), '庄园成员'); assert.equal(svc(edenDict('en')).t('ch.g_members'), 'Estate members');
  } finally { setProfile(null); }
});

test('the variable-mapping rows follow the groups: one table row per group (the three default ids keep their old labels), the adapter maps each group id', () => {
  assert.deepEqual(tableRows(), [['present', '在场人物表', 'Present table'], ['members', '成员表', 'Members table'], ['targets', '目标表', 'Targets table']], 'no groups in the payload: the three fixed rows as before');
  const p4 = profileOf(FOUR);
  assert.deepEqual(tableRows(p4.groups), [['crowd', '人群表', 'Crowd table'], ['crew', '船员表', 'crew table'], ['guests', 'guests表', 'guests table'], ['ghosts', 'ghosts表', 'Ghosts table']]);
  assert.deepEqual(tableRows(edenProfile().groups).map(r => r[0]), ['present', 'members', 'targets']);
  const f4 = AD.fieldsOf(p4); assert.deepEqual(f4.filter(f => ['crowd', 'crew', 'guests', 'ghosts', 'present', 'members', 'targets'].includes(f)), ['crowd', 'crew', 'guests', 'ghosts']);
  assert.deepEqual(AD.fieldsOf(edenProfile()), AD.FIELDS, 'the first pack: the same field list as the fixed one');
  setProfile(p4);
  try {
    const d = AD.detect(STAT4); assert.equal(d.crowd, '人群表'); assert.equal(d.crew, '船员表'); assert.equal(d.guests, '访客表'); assert.equal(d.ghosts, '幽灵表');
    assert.equal(AD.effective({ guests: '船员表' }, STAT4).guests, '船员表', 'a user mapping for a group id is taken');
    const r = MV.rosters(STAT4, { guests: '船员表' }, []);
    assert.deepEqual(r.guests.items.map(i => i.name), ['乙', '丙'], 'the mapping reaches the roster reader');
  } finally { setProfile(null); }
});
