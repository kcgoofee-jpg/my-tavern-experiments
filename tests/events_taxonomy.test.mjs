// The event taxonomy is pack data (S4-1, docs/kernel-schema.md K-R49–K-R55, K-R68): the kernel's neutral set for a pack with no events block, a pack's own block,
// effects and default-off by declaration, merge key = type + node, per-type life and inject.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as EV from '../map/tavern/events.mjs';
import { DEFAULT_EVENTS, DEFAULT_CLOSED } from '../map/core/events-default.mjs';
import { makeGeo } from '../map/core/event-geo.mjs';
import { buildTree } from '../map/core/nodes.mjs';
import { validate2, withDefaults } from '../map/core/pack-v2.mjs';
import { edenGeo, townGeo } from './helpers/eden-geo.mjs';

const EN = JSON.parse(fs.readFileSync(new URL('../map/i18n/en.json', import.meta.url), 'utf8')).names;
const tree = buildTree([{ id: 'r', name: 'Realm' }, { id: 'a', name: 'Alpha', parent: 'r' }, { id: 'b', name: 'Beta', parent: 'r' }], { title: 'T' });
const bare = () => makeGeo({ tree, views: {} });   // a pack with no events block
const restore = () => EV.setGeo(edenGeo());

test('K-R53: a pack with no events block shows the neutral set — the eight groups, a few types each, zh base labels with en names, no card words', () => {
  try {
    EV.setGeo(bare());
    assert.deepEqual(EV.taxonomy().groups.map(g => g.id), ['safety', 'weather', 'politics', 'society', 'conflict', 'disaster', 'people', 'other']);
    assert.deepEqual(EV.legend().map(g => g.id), ['safety', 'weather', 'politics', 'society', 'conflict', 'disaster', 'people']);
    const types = Object.values(EV.taxonomy().types);
    for (const g of EV.taxonomy().groups) assert.ok(types.filter(t => t.group === g.id).length >= (g.id === 'other' ? 1 : 3), g.id);
    for (const x of [...EV.taxonomy().groups, ...types]) { assert.ok(x.label && x.i18n.en.label, x.label); assert.equal(EN[x.label] !== undefined, true, `${x.label} has an English name in i18n/en.json`); }
    for (const w of ['火灾', '起火', '停电', '骚乱', '选举', '风暴']) assert.notEqual(EV.classify(w).type, 'other', w);
    assert.equal(EV.classify('流星雨').type, 'other'); assert.equal(EV.classify('流星雨').cat, '其他');
    const [e] = EV.parseMarks('⌖火灾｜Nowhere｜2｜smoke'), [f] = EV.parseMarks('⌖火灾｜Alpha｜2｜smoke');
    assert.deepEqual([e.cat, e.grp, e.type, e.node, f.node], ['火灾', '灾害', 'fire', null, 'a']);   // an unknown place is listed, not placed (K-01 B); a known one is placed by the pack's own tree
    assert.match(EV.summarize([{ layer: 'L', tier: 'live', closed: false, cat: '火灾', lvl: 2, text: 'x', src: '', place: '' }], 'L'), /^\[地图事态·/);
    assert.equal(EV.parseMarks('<span data-tcmap="类型=火灾;地点=x;标题=y;状态=resolved"></span>')[0].lvl, 0); assert.ok(DEFAULT_CLOSED.includes('已控制'));
  } finally { restore(); }
});

test('the neutral block passes the kernel schema untouched (K-R06), and every shipped pack without its own type words falls back to it', () => {
  const v = validate2({ id: 'neutral', schema: 2, title: 'N', events: JSON.parse(JSON.stringify(DEFAULT_EVENTS)) });
  assert.deepEqual(v.problems, []); assert.equal(Object.keys(v.pack.events.types).length, Object.keys(DEFAULT_EVENTS.types).length);
  assert.equal(withDefaults({ id: 'x', schema: 2, title: 'X' }).events.types.other.group, 'other');
});

test("town: its events.json is its taxonomy (through compat-v1), not the first pack's", () => {
  try {
    EV.setGeo(townGeo());
    assert.deepEqual(EV.legend().map(g => g.label), ['市政', '灾害', '天气']); assert.equal(EV.classify('巡空令').cat, '其他');
  } finally { restore(); }
  assert.ok(EV.legend().length > 8 && EV.classify('巡空令').cat === '巡空令');
});

test('fx by declaration: any type that names the glitch block triggers it; the first pack declares exactly one', () => {
  const block = { groups: [{ id: 'g', label: 'G', color: '#112233' }], types: { zap: { label: 'Zap', group: 'g', icon: 'Z', fx: 'glitch', alias: ['bolt'] }, calm: { label: 'Calm', group: 'g' }, pulse: { label: 'Pulse', group: 'g', fx: 'pulse' } },
    fx_presets: { glitch: { block: 'glitch', intensity: 0.5 } } };
  try {
    EV.configure(block);
    const [a] = EV.parseMarks('⌖bolt｜p｜2｜s'), [b] = EV.parseMarks('⌖Calm｜p｜2｜s'), [c] = EV.parseMarks('⌖Pulse｜p｜2｜s');
    assert.deepEqual(a.fx, { block: 'glitch', intensity: 0.5 }); assert.equal(b.fx, undefined); assert.deepEqual(c.fx, { block: 'pulse' });
    assert.deepEqual([a.cat, a.ch, a.color, a.grp], ['Zap', 'Z', '#112233', 'G']);
  } finally { restore(); }
  assert.deepEqual(Object.values(EV.taxonomy().types).filter(t => t.fx).map(t => t.label), ['网络攻击']);
});

test('default-off by declaration (x-default-off) and inject: false', () => {
  const block = { groups: [{ id: 'g', label: 'G', color: '#112233' }], types: { rain: { label: 'Rain', group: 'g', 'x-default-off': true }, hush: { label: 'Hush', group: 'g', inject: false }, loud: { label: 'Loud', group: 'g' } } };
  try {
    EV.configure(block);
    assert.deepEqual(EV.defaultOff(), ['Rain']);
    const items = EV.collect([{ floor: 1, text: '⌖Hush｜p｜2｜quiet ⌖Loud｜q｜2｜noisy' }], 2);
    assert.equal(items.find(e => e.cat === 'Hush').inject, false); assert.equal(items.find(e => e.cat === 'Loud').inject, undefined);
    assert.match(EV.summarize(items.map(e => ({ ...e, layer: 'L' })), 'L'), /noisy/); assert.doesNotMatch(EV.summarize(items.map(e => ({ ...e, layer: 'L' })), 'L'), /quiet/);
  } finally { restore(); }
  assert.deepEqual(EV.defaultOff(), ['降雨']);
});

test('K-R54 merge key: same type + same node within the window is one event, whatever the place text; an unplaced event merges by type + place text', () => {
  const at = (floor, text) => ({ floor, text });
  assert.equal(EV.collect([at(1, '⌖火灾｜中层·霓虹街｜2｜a'), at(3, '⌖火灾｜霓虹街｜1｜b')], 4).length, 1);
  const one = EV.collect([at(1, '⌖火灾｜中层·霓虹街｜2｜a'), at(3, '⌖火灾｜霓虹街｜1｜b')], 4)[0]; assert.deepEqual([one.count, one.text, one.lvl], [2, 'b', 1]);
  assert.equal(EV.collect([at(1, '⌖火灾｜中层·霓虹街｜2｜a'), at(3, '⌖爆炸｜中层·霓虹街｜1｜b')], 4).length, 2, 'other type: other event');
  assert.equal(EV.collect([at(1, '⌖火灾｜某处｜2｜a'), at(3, '⌖火灾｜某 处｜1｜b')], 4).length, 1, 'unplaced: same normalised text');
  assert.equal(EV.collect([at(1, '⌖火灾｜某处｜2｜a'), at(3, '⌖火灾｜别处｜1｜b')], 4).length, 2, 'unplaced: other text');
  assert.equal(EV.collect([at(1, '⌖火灾｜中层·霓虹街｜2｜a'), at(30, '⌖火灾｜中层·霓虹街｜2｜b')], 31).length, 2, 'outside the merge window (15)');
  const closed = EV.collect([at(1, '⌖火灾｜中层·霓虹街｜2｜a'), at(3, '⌖火灾｜霓虹街｜0｜out')], 4); assert.deepEqual([closed.length, closed[0].closed], [1, true]);
});

test('per-type life overrides the defaults (K-R54): tier and merge window', () => {
  const block = { groups: [{ id: 'g', label: 'G', color: '#112233' }], types: { brief: { label: 'Brief', group: 'g', life: { live: 1, after: 3 } }, plain: { label: 'Plain', group: 'g' } } };
  try {
    EV.configure(block);
    const tiers = EV.collect([{ floor: 1, text: '⌖Brief｜p｜2｜a ⌖Plain｜q｜2｜b' }], 4).map(e => [e.cat, e.tier]).sort();
    assert.deepEqual(tiers, [['Brief', 'after'], ['Plain', 'live']]);
    assert.equal(EV.tierOf(2, false), 'live'); assert.equal(EV.tierOf(2, false, { live: 1 }), 'after');
  } finally { restore(); }
});
