// Shadow parity of the first pack's variables and roster (S4-2, docs/kernel-schema.md K-R37..K-R44, K-R69, Appendix A.7): every variable tree of the tavern tests and the two recorded
// sessions is read by the old code (tests/helpers/{adapter,mvu,characters}_v1_frozen.mjs, frozen copies of the modules at head #172, the card's paths and field names in code) and by the
// engine now (profile = the first pack's manifest + overlay blocks, kernel vocabulary for everything the pack does not name). Compared: the variable map, roster rows (name, identity, stage,
// grade, core value and band, every "more" field, tier), the present list, the characters' places, the clock, the outfit, the reputation, the injected people line (byte for byte),
// the portrait table. The known, decided divergences are pinned by value at the end.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as OAD from './helpers/adapter_v1_frozen.mjs';
import * as OV from './helpers/mvu_v1_frozen.mjs';
import * as OC from './helpers/characters_v1_frozen.mjs';
import * as NAD from '../map/tavern/stat-path-mapping.mjs';
import * as NV from '../map/tavern/mvu-readers.mjs';
import * as NC from '../map/tavern/characters-parse.mjs';
import { useEden } from './helpers/eden-profile.mjs';
import { CORPUS, FALLBACK } from './helpers/roster-corpus.mjs';

useEden();
const entries = Object.entries(CORPUS);
const USER = [{}, { gradeField: '-', coreField: '-' }, { coreField: '数值', gradeField: '级别' }, { members: '表二', targets: '表一', stageField: '进度' }, { tierField: '-' }, { location: 'world.location', present: '在场人物' }];
const J = JSON.stringify;
// decided divergences, normalised on the old side: the tier chip names the ladder step (天灾 -> 天灾级, the step's label is also a match word); the gauge clamps to 0..100 (K-R42)
const oldRow = r => { const o = { ...r }; if (o.tier === '天灾') o.tier = '天灾级'; if (typeof o.core === 'number') o.core = Math.min(100, Math.max(0, o.core)); return o; };
const oldRosters = r => Object.fromEntries(Object.entries(r).map(([g, t]) => [g, t && { ...t, items: t.items.map(oldRow) }]));

test('variable map: detect and effective are identical for every tree, with and without a user mapping; the three tables the pack names are now found by name', () => {
  let n = 0;
  const rest = m => { const { members, targets, present, ...o } = m; return o; };
  for (const [name, st] of entries) {
    const o = OAD.detect(st), d = NAD.detect(st);
    assert.deepEqual(rest(d), rest(o), name);
    // the pack names its member and target tables (v1 left them to the order of the tables): found when they are in the tree, else '' as before
    assert.equal(d.present, st && st.在场人物 ? '在场人物' : o.present, name);   // v1 found it only as an object / table, the pack names it (an array of names too)
    assert.equal(d.members, st && st.已收服母畜 ? '已收服母畜' : o.members, name); assert.equal(d.targets, st && st.狩猎清单 ? '狩猎清单' : o.targets, name);
    for (const u of USER) { assert.deepEqual(rest(NAD.effective(u, st)), rest(OAD.effective(u, st)), name + J(u)); n++; }
    assert.deepEqual(NAD.mode(true, st, d), OAD.mode(true, st, o), name);
  }
  console.log(`variable maps: ${entries.length} trees, ${n} user mappings, identical (the three table names excepted)`);
});

// Two trees do not start with the world and protagonist tables: v1 skipped the first two keys of any tree by position, the kernel skips the tables that hold the pack's variable paths and takes
// every name-keyed table with a place- or person-like field (K-06, decided C) - these two trees' tables now show as groups.
const POSITIONAL = { items: ['物品', '势力'], tracked: ['追踪'] };
test('roster rows: same tables, names, identity, stage, grade, core value and band, more fields, tier (with the fallback roster and without)', () => {
  let rows = 0, tables = 0, pinned = 0;
  for (const [name, st] of entries) for (const u of USER) for (const fb of [[], FALLBACK]) {
    const om = OAD.effective(u, st), nm = NAD.effective(u, st);
    const o = oldRosters(OV.rosters(st, om, fb)), n = NV.rosters(st, nm, fb);
    if (POSITIONAL[name] && !u.members) {
      const keys = Object.values(n).filter(Boolean).map(t => t.key).filter(k => k !== '设定名册');
      assert.deepEqual(keys, POSITIONAL[name], name);
      assert.deepEqual(Object.values(o).filter(Boolean).map(t => t.key).filter(k => k !== '设定名册'), [], name + ' (v1 skipped the first two keys)'); pinned++;
      continue;
    }
    assert.equal(J(n), J(o), `${name} ${J(u)} fallback=${fb.length}`);
    for (const g of Object.values(n)) if (g) { tables++; rows += g.items.length; }
    // the map-less call (tests, other callers) reads the same tables
    if (!POSITIONAL[name]) assert.equal(J(NV.rosters(st, {}, fb)), J(oldRosters(OV.rosters(st, {}, fb))), name + ' (no map)');
  }
  console.log(`roster rows: ${tables} tables, ${rows} rows compared, identical; ${pinned} states of the 2 positional trees pinned`);
  assert.ok(rows > 500 && pinned > 0);
});

test('present list, world time, clock text, outfit, reputation: identical', () => {
  for (const [name, st] of entries) {
    const om = OAD.detect(st), nm = NAD.detect(st);
    assert.deepEqual(NV.presentList(st, nm.present), OV.presentList(st, om.present), name);
    assert.deepEqual(NV.presentList(st), OV.presentList(st), name + ' (no path)');
    const w = NV.worldTime(st, nm), ow = OV.worldTime(st, om);
    assert.deepEqual(w, ow, name);
    for (const lang of ['zh', 'en']) assert.deepEqual(NV.clockLabel(w, lang), OV.clockLabel(ow, lang), name);
    assert.deepEqual(NV.todPhase(w), OV.todPhase(ow), name + ' tod');
    const o = NV.outfit(st, nm.outfit);
    assert.deepEqual(o, OV.outfit(st, om.outfit), name); assert.equal(NV.outfitText(o), OV.outfitText(OV.outfit(st, om.outfit)), name);
    assert.equal(NV.reputation(st, nm.reputation), OV.reputation(st, om.reputation), name);
    assert.equal(NV.reputation(st), OV.reputation(st), name + ' (no path)');
    assert.equal(NAD.mode(true, st, nm), OAD.mode(true, st, om)); if (nm.location) assert.equal(NAD.get(st, nm.location), OAD.get(st, om.location), name + ' location');
    assert.equal(NAD.get(st, ''), undefined, 'an empty path reads nothing (v1 returned the whole tree)');
  }
});

test('characters: MVU places and the injected people line are byte-identical', () => {
  let lines = 0, chars = 0;
  for (const [name, st] of entries) for (const here of ['', '书房', '中层·霓虹街 / 下层·7号井']) for (const pp of ['', 'present', OAD.detect(st).present]) {
    const o = OC.mvuChars(st, here, pp), n = NC.mvuChars(st, here, pp);
    assert.deepEqual(n, o, `${name} ${here} ${pp}`); chars += n.length;
    for (const floor of [3, 9]) {
      const mk = C => C.collectChars([{ floor: 5, text: '⌖人物 乙 @ 下层·7号井' }], floor, o);
      const a = NC.summarizeChars(NC.collectChars([{ floor: 5, text: '⌖人物 乙 @ 下层·7号井' }], floor, n), 8, 160, floor), b = OC.summarizeChars(mk(OC), 8, 160, floor);
      assert.equal(a, b); if (a) lines++;
    }
  }
  console.log(`characters: ${chars} MVU characters, ${lines} non-empty injected lines, identical`);
  assert.ok(chars > 50 && lines > 20);
});

test('portraits: the card-script table and the URL rules (https, image file, no query, hosts, the author folder, the restricted words)', () => {
  const urls = ['https://cdn.jsdelivr.net/gh/Yehehua1311/repo@main/A/sfw/A_1.png', 'https://cdn.jsdelivr.net/gh/yehehua1311/repo@main/A/SFW/A_1.png', 'https://cdn.jsdelivr.net/gh/Yehehua1311/repo@main/B/other/B_1.png',
    'https://cdn.jsdelivr.net/gh/OtherUser/repo@main/A/sfw/A_1.png', 'https://cdn.jsdelivr.net/gh/Yehehua1311/repo@main/A/性交/A_1.png', 'https://cdn.jsdelivr.net/gh/Yehehua1311/repo@main/A/sfw/%E6%80%A7%E4%BA%A4.png',
    'https://i.postimg.cc/1tJb0jSZ/seraphina.png', 'https://i.postimg.cc/1tJb0jSZ/口交.png', 'https://i.postimg.cc/1tJb0jSZ/x.png?v=2', 'https://i.postimg.cc/1tJb0jSZ/x.png#a', 'https://i.postimg.cc/1tJb0jSZ/x.txt',
    'http://i.postimg.cc/1tJb0jSZ/x.png', 'https://picgocloud.com/i/2024/09/29/abcd.webp', 'https://PICGOCLOUD.com/i/2024/x.jpg', 'https://evil.com/gh/Yehehua1311/repo@main/A/sfw/A_1.png',
    'https://example.com/sfw/c.png', 'not a url', '', 'https://picgocloud.com/%ZZ/x.png'];
  const diff = urls.filter(u => NV.portraitOk(u) !== OV.portraitOk(u));
  assert.deepEqual(diff, []);
  const src = `var defaultPortraits = { "甲": "${urls[0]}", "乙": "${urls[2]}", "丁": "${urls[6]}", "戊": "${urls[12]}", "坏": "https://evil.example/x.png" };`;
  assert.deepEqual(NV.findPortraits([src]), OV.findPortraits([src])); assert.equal(Object.keys(NV.findPortraits([src])).length, 3); assert.deepEqual(NV.findPortraits(['无']), {});
});

test('recorded sessions: location, clock, outfit, roster and the people line for every floor state', () => {
  let states = 0;
  for (const f of ['session_a', 'session_b']) for (const [name, st] of entries.filter(([k]) => k === f || k.startsWith(f + '_f'))) {
    const nm = NAD.detect(st), om = OAD.detect(st);
    assert.equal(NAD.get(st, nm.location), OAD.get(st, om.location), name); assert.equal(nm.location, om.location);
    assert.deepEqual(NV.worldTime(st, nm), OV.worldTime(st, om)); assert.equal(NV.todPhase(NV.worldTime(st, nm)), OV.todPhase(OV.worldTime(st, om)));
    assert.equal(J(NV.rosters(st, nm, FALLBACK)), J(oldRosters(OV.rosters(st, om, FALLBACK)))); states++;
  }
  console.log(`recorded sessions: ${states} floor states identical`);
  assert.ok(states >= 2);
});

// ---- the decided divergences, pinned ----
const PERIODS = ['', '晨起', '晨间报到', '日间', '午后', '侍寝时段', '就寝', '深夜', '夜晚', '凌晨', '清晨', '傍晚', '黄昏', '暮色', 'night', 'Morning', 'evening', 'noon', '侍寝之夜', '傍晚夜色', '寝', '未知时段'];
const TIMES = ['', '03:00', '04:50', '05:00', '06:59', '07:00', '12:00', '16:59', '17:00', '19:59', '20:00', '21:59', '22:00', '23:30', '8时', '8:5'];
test('period bands (K-R39): the same phase for the period words and the hours; the night test now follows the night band (O-2) and the longest period word wins', () => {
  const phase = [], night = {};
  for (const period of PERIODS) for (const time of TIMES) {
    const w = { period, time };
    if (NV.todPhase(w) !== OV.todPhase(w)) phase.push([period, time, OV.todPhase(w), NV.todPhase(w)]);
    if (NV.isNight(w) !== OV.isNight(w)) (night[period || '(none)'] ||= []).push([time, OV.isNight(w), NV.isNight(w)]);
  }
  console.log(`period x time: ${PERIODS.length * TIMES.length} states; phase differs in ${phase.length}, night test differs in ${Object.values(night).flat().length}`);
  // the phase differs only for a text that holds words of two bands: the old code tried the night words first, the kernel takes the longest word (傍晚 over 夜)
  assert.ok(phase.length > 0 && phase.every(([p, , o, n]) => p === '傍晚夜色' && o === 'night' && n === 'dusk'));
  // the night test: no period text or none that names a band - 20:00-21:59 is night now (the band starts at 20:00, v1 at 22:00);
  // a text that names the evening (侍寝 / 傍晚 / 黄昏 / 暮 / evening) or noon is no longer night by its hour or by the bare character 寝 / 夜 inside a longer word
  assert.deepEqual(Object.keys(night).sort(), ['(none)', 'evening', 'noon', '傍晚', '傍晚夜色', '侍寝之夜', '侍寝时段', '寝', '未知时段', '暮色', '黄昏'].sort());
  for (const p of ['(none)', '未知时段']) assert.deepEqual(night[p], [['20:00', false, true], ['21:59', false, true]], p);
  for (const p of ['侍寝时段', '侍寝之夜', '傍晚夜色']) assert.ok(night[p].every(([, o, n]) => o && !n) && night[p].length === TIMES.length, p);
  for (const p of ['傍晚', '黄昏', '暮色', 'evening', 'noon']) assert.deepEqual(night[p].map(x => x[0]), ['03:00', '04:50', '22:00', '23:30'], p);
  assert.ok(night['寝'].every(([, o, n]) => o && !n));
});

test('core gauge and tier ladder: the decided differences (clamp to 0..100; the tier chip is the ladder step 天灾级)', () => {
  const core = f => (st, m) => NV.rosters(st, m).members.items[0];
  const row = (field, v) => ({ 世界: {}, 主角: {}, 表: { 甲: { 身份: 'x', [field]: v } } });
  for (const v of [-5, 0, 20, 20.01, 100, 150, '50', 'abc', '']) {
    const st = row('母畜值', v), m = { coreField: '母畜值' }, o = OV.rosters(st, m).members.items[0], n = NV.rosters(st, m).members.items[0];
    assert.equal(n.coreStage, o.coreStage, String(v));
    if (o.core === undefined) assert.equal(n.core, undefined); else assert.equal(n.core, Math.min(100, Math.max(0, o.core)), String(v));
  }
  const t = s => ({ 世界: {}, 主角: {}, 表: { 甲: { 身份: s } } });
  for (const s of ['天灾级', '天灾级战力', '超凡三阶', '超凡 4 阶', '超凡5阶', '代号「天灾」', '普通人', '教授']) {
    const o = OV.rosters(t(s), {}).members.items[0].tier, n = NV.rosters(t(s), {}).members.items[0].tier;
    assert.equal(n, o === '天灾' ? '天灾级' : o, s);
  }
  assert.ok(core);
});

test('portrait hosts: a subdomain of the image host is no longer taken (K-R43: the host must equal the entry); the card names none', () => {
  assert.equal(OV.portraitOk('https://cdn.picgocloud.com/i/x.png'), true); assert.equal(NV.portraitOk('https://cdn.picgocloud.com/i/x.png'), false);
});
