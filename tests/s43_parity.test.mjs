// S4-3 shadow tests: the first pack's viewer special cases (theme, legend, clouds, tint, cvd, glitch scope, world-map words, ring label, picker tiers, overseas card)
// now live in pack data; each one is compared with the constant or predicate the engine carried before (tests/helpers/s43_frozen.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as F from './helpers/s43_frozen.mjs';
import { edenInputs, townInputs } from './helpers/eden-inputs.mjs';
import { edenGeo } from './helpers/eden-geo.mjs';
import { recordEventsTest, fixtureFloors } from './helpers/events-corpus.mjs';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { makeRuntime, buildRuntime, inScope, eventLevel, worldGroup, groupPlaces, viewField } from '../map/app/nodes-runtime.mjs';
import { makeHere } from '../map/app/here-v2.mjs';
import { buildGroups } from '../map/tavern/picker.mjs';
import * as EV from '../map/tavern/events.mjs';

const J = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const I = edenInputs(), MAPS = I.maps, WORLD = I.world, ZH = J('map/i18n/zh.json'), EN = J('map/i18n/en.json');
const pack = fromV1(I).pack, rt = buildRuntime(I);

test('legend: the overlay ui.legend carries the old LEGEND entries, zh and en words verbatim, in order', () => {
  assert.equal(pack.ui.legend.length, F.LEGEND.length);
  F.LEGEND.forEach(([kt, , kd], i) => {
    const e = pack.ui.legend[i];
    assert.equal(e.type, kt.replace(/^lg\./, '')); assert.equal(e.label, ZH[kt]); assert.equal(e.desc, ZH[kd]); assert.equal(e.i18n.en.label, EN[kt]); assert.equal(e.i18n.en.desc, EN[kd]);
  });
  assert.equal(fromV1(townInputs()).pack.ui?.legend, undefined);   // a pack that declares none has none: the section stays hidden
});

test('clouds / tint: maps.json flags become view fields; only the tiers that had the behaviour carry them', () => {
  const clouds = Object.keys(pack.views).filter(k => pack.views[k]['x-clouds']), tint = Object.keys(pack.views).filter(k => pack.views[k]['x-tint'] === 'period');
  assert.deepEqual(clouds, ['tc_upper']); assert.deepEqual(tint.sort(), ['tc_mid', 'tc_upper']);
  assert.ok(Object.values(pack.views).every(v => v['x-clouds'] === undefined || v['x-clouds'] === true));
  assert.equal(viewField('tc_upper', 'x-clouds'), true); assert.equal(viewField('tc_mid', 'x-clouds'), undefined); assert.equal(viewField('nope', 'x-tint'), undefined);
  const town = fromV1(townInputs()).pack; assert.ok(Object.values(town.views).every(v => v['x-clouds'] === undefined && v['x-tint'] === undefined));
});

test('world map words: here_words is the old ALIAS table verbatim (same order) and on that place only; the old extra set is reproduced for every word', () => {
  const withWords = WORLD.places.filter(p => p.here_words); assert.deepEqual(withWords.map(p => p.id), ['tiancheng']);
  assert.deepEqual(withWords[0].here_words, F.ALIAS['天城']); assert.equal(withWords[0].name, '天城');
  const here = makeHere(I), places = [...WORLD.places, ...WORLD.fiefs];
  const old = r => (r && MAPS.groups.tiancheng.layers.includes(r.map) ? ['天城'] : []);
  for (const w of [...F.ALIAS['天城'], '天城中层·霓虹街', '伊甸庄园·书房', '上层·伊甸', '不存在的地方']) {
    const r = here.here(w), now = r ? groupPlaces(MAPS, places, r.map) : [];
    assert.deepEqual(now.filter(n => n === '天城'), old(r), w);   // the old answer is in the new one
    assert.ok(now.every(n => n === '天城' || places.some(p => p.name === n)), w);   // anything more is another group's own place (the map belongs to that group)
  }
  assert.deepEqual(groupPlaces(MAPS, places, 'tc_mid'), ['天城']); assert.deepEqual(groupPlaces(MAPS, places, 'world'), []); assert.deepEqual(groupPlaces(MAPS, places, 'eden_estate'), ['天城']);
  assert.deepEqual(groupPlaces(MAPS, places, 'site_kavalierki'), places.filter(p => p.id === MAPS.groups.kavalierki.place).map(p => p.name));
});

test('world map: realm label offsets, the overseas card and the group that the world map starts on are data', () => {
  assert.deepEqual(Object.fromEntries(WORLD.realms.map(r => [r.id, r.label_dy])), { oren: -95, fed: -150, xl: -110 });   // the old table
  assert.deepEqual(WORLD.overseas, { at: [1446.1074891035946, 749.2831242438806], name: '海外诸地', sub: '稀有矿物 · 异域人员输出地', src: '货币与贸易：天城输入稀有矿物、异域特殊体质人员（部分来自海外）' });
  assert.equal(worldGroup(MAPS), 'tiancheng'); assert.equal(MAPS.maps.world.view.focus, 'tiancheng'); assert.equal(MAPS.groups.tiancheng.place, 'tiancheng');
  assert.equal(worldGroup({ maps: { w: { kind: 'world' } }, groups: { a: { place: 'x' }, b: { place: 'y' } } }), 'a'); assert.equal(worldGroup({}), null);
});

test('event level: the overlay says which level the event list falls back to; without it, the first flat layer of the world group', () => {
  assert.equal(pack.ui['x-event-level'], 'tc_mid'); assert.equal(eventLevel(MAPS), 'tc_mid');
  const plain = makeRuntime({ ...I, overlay: { schema: 2, nodes: [] } }); assert.equal(plain.ui['x-event-level'], undefined);
  buildRuntime({ ...I, overlay: { schema: 2, nodes: [] } }); assert.equal(eventLevel(MAPS), 'tc_upper');   // eden_estate is a 3D page, the first flat layer is the upper tier
  assert.equal(eventLevel({ maps: { a: { kind: 'points' } }, groups: { g: { layers: ['a'] } } }), 'a'); assert.equal(eventLevel({}), '');
  buildRuntime(I);
});

test('ring label: every group gets the same zh and en crumb as before (the first group no longer has its own key)', () => {
  const dicts = { zh: ZH, en: EN }, fmt = (s, v) => { for (const [a, b] of Object.entries(v || {})) s = String(s).split('{' + a + '}').join(b); return s; };
  for (const lang of ['zh', 'en']) {
    const tx = (k, zh, v) => fmt(dicts[lang][k] ?? zh, v), nm = (o, k) => (lang === 'en' ? (o[k + '_en'] || o[k]) : o[k]);
    for (const [gid, g] of Object.entries(MAPS.groups)) {
      const now = tx('ring_of', g.title + '周边', { name: nm(g, 'title') });
      assert.equal(now, F.ringLabelV1(gid, g, tx, nm), `${lang} ${gid}`);
    }
  }
});

test('picker: tier labels (zh and en) and order are the old TIER table; the other points maps keep the registry order', () => {
  for (const lang of ['zh', 'en']) {
    const G = buildGroups({ reg: MAPS, lang }), ids = G.map(g => g.id);
    Object.entries(F.TIER).forEach(([id, t], i) => { const g = G.find(x => x.id === 'lm:' + id); assert.equal(g.short, t[lang === 'en' ? 1 : 0], `${lang} ${id}`); assert.equal(ids.indexOf('lm:' + id), i); });
    assert.equal(G[0].label, lang === 'en' ? 'Upper tier · landmarks' : '天城上层 · 地标');
    const rest = Object.entries(MAPS.maps).filter(([id, m]) => m.kind === 'points' && m.status !== 'planned' && !F.TIER[id]).map(([id]) => 'lm:' + id);
    assert.deepEqual(ids.filter(x => rest.includes(x)), rest.filter(x => ids.includes(x)));
  }
  const noLabels = JSON.parse(JSON.stringify(MAPS)); for (const id of Object.keys(F.TIER)) { delete noLabels.maps[id].tier_label; delete noLabels.maps[id].tier_label_en; }
  assert.equal(buildGroups({ reg: noLabels }).find(g => g.id === 'lm:tc_upper').short, '天城 · 上层');   // no tier_label: the map title
  assert.equal(buildGroups({ reg: MAPS, plan: null }).find(g => g.id.startsWith('room:')).label.split(' · ')[0], '伊甸庄园');
  const bare = JSON.parse(JSON.stringify(MAPS)); delete bare.maps.eden_estate.title; delete bare.maps.eden_estate.title_en;
  assert.match(buildGroups({ reg: bare }).find(g => g.id.startsWith('room:')).label, /^eden_estate · /);   // no title: the map id, not a name from the engine
});

// ---- the glitch scope ----
const EVT = EV; EVT.setGeo(edenGeo());
const geo = edenGeo(), maps = Object.keys(MAPS.maps), flat = maps.filter(k => MAPS.maps[k].kind !== 'estate');
const corpus = await recordEventsTest(), evs = [];
corpus.raws.forEach((t, i) => EVT.parseMarks(t).forEach(e => evs.push({ ...e, last: i })));
fixtureFloors().flat().forEach(({ floor, text }) => EVT.parseMarks(text).forEach(e => evs.push({ ...e, last: floor })));
const glitchEvs = evs.filter(e => EVT.classify(e.cat).fx?.block === 'glitch');
const placeOf = e => (e.node && geo.placeNode(e.node)) || geo.place([e.layer, e.place].filter(Boolean).join('·'));
const mapOf = e => { const p = placeOf(e); return !p ? '' : p.ring ? 'tc_mid' : p.map || ''; };
const levels = (list, cur, floor, scopeOld) => Math.max(0, ...list.filter(e => { const f = EVT.classify(e.cat).fx; return !e.closed && floor - e.last <= (e.dur || f['x-messages'] || 3) && (scopeOld ? F.glitchScopeV1(e, cur, mapOf, t => geo.place(t)?.map) : ((e.scope && inScope(e.scope, cur)) || mapOf(e) === cur || (e.scope && geo.place(e.scope)?.map === cur))); })
  .map(e => { const f = EVT.classify(e.cat).fx; return typeof f.intensity === 'number' ? Math.round(f.intensity * 3) : Math.max(1, e.lvl); }));
const floorsOf = list => [...new Set(list.flatMap(e => [e.last, e.last + 1, e.last + 3, e.last + 4]))].sort((a, b) => a - b);

test('glitch scope: for the event texts of the events tests, the glitch level per floor on every flat map equals the old predicate (and never drops on a 3D page)', () => {
  assert.ok(glitchEvs.length >= 6 && glitchEvs.some(e => e.scope), 'the corpus has scoped glitch events');
  for (const cur of maps) for (const fl of floorsOf(glitchEvs)) {
    const a = levels(glitchEvs, cur, fl, true), b = levels(glitchEvs, cur, fl, false);
    if (flat.includes(cur)) assert.equal(b, a, `${cur} floor ${fl}`); else assert.ok(b >= a, `${cur} floor ${fl}: a 3D page may only gain`);
  }
});
test('glitch scope: a city-wide scope (全城 / 天城, the old words) lights the same flat maps of the city and the world map; the named place is what counts now', () => {
  const tc = new Set([...MAPS.groups.tiancheng.layers, 'world']);
  for (const scope of ['全城', '天城', '天城全境', '全城戒严']) for (const cur of flat) {
    const e = { ...glitchEvs[0], scope, layer: '', place: 'nowhere', node: null, last: 0, lvl: 2 }, list = [e];
    const nw = levels(list, cur, 1, false), old = levels(list, cur, 1, true);
    if (tc.has(cur)) assert.equal(nw, old, `${scope} on ${cur}`); else assert.ok(nw <= old, `${scope} on ${cur}`);   // another city's map: the old word matched any map, now it is this city's scope
  }
  assert.equal(geo.place('全城').node, 'tiancheng'); assert.equal(geo.place('天城').node, 'tiancheng');
  assert.ok(rt.tree.get('tiancheng').hints.includes('全城'));
  assert.equal(inScope('全城', 'tc_low'), true); assert.equal(inScope('全城', 'eden_estate'), true); assert.equal(inScope('全城', 'site_kavalierki'), false); assert.equal(inScope('', 'tc_mid'), false); assert.equal(inScope('中层', 'tc_upper'), false);
});

test('credits and data paths: the first pack\'s manifest carries the author credit, the repo row, the card creator and the paths the host and viewer used to hard-code', async () => {
  const man = J('map/packs/eden/manifest.json'), PK = await import('../map/core/pack.mjs'), R = PK.resolve(man);
  assert.equal(man.credits.card.creator, 'Yehehua');   // the original author's credit stays visible (agent-brief §7)
  assert.equal(man.credits.pack[0].name, 'kcgoofee-jpg'); assert.equal(man.credits.pack[0].url.replace(/^https:\/\//, ''), 'github.com/' + man.cdn.repo);
  assert.deepEqual(man.credits.assets.map(a => [a.name, a.license]), [['Poly Haven', 'CC0'], ['ambientCG', 'CC0']]);
  assert.deepEqual(R.credits, man.credits); assert.deepEqual(R.worldbook, man.worldbook); assert.equal(R.worldbook.prefix, '伊甸地图');
  assert.equal(PK.resolve(J('map/packs/town/manifest.json')).credits, null);   // a pack without credits shows no credit rows
  for (const k of ['galleries', 'worldbook_addon', 'gallery', 'roster', 'maps', 'routine']) assert.ok(man.data[k], k);
  // the dictionary sentences take the creator / the book name by placeholder; the values that came out are the old words
  assert.equal(ZH['s.lic_orig_v'].replace('{creator}', man.credits.card.creator), 'Yehehua（类脑社区）原创；地图是经授权的二次创作（2026-09-27 起）');
  assert.equal(EN['s.lic_orig_v'].replace('{creator}', man.credits.card.creator), 'Created by Yehehua (类脑 community); the map is an authorized derivative work (since 2026-09-27)');
  assert.equal(ZH['selfcheck.wb_manual'].replace('{book}', F.BOOK), '也可以照旧手动导入「伊甸地图·世界书附加条目」并在世界书里设为全局');
});
