// PROFILE-1 (D34): settings profiles. Classification of every storage key, save / apply / export / import, and the guarantees that apply never
// touches per-chat data or the AI advisor's configuration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEYS } from '../map/core/storage.mjs';
import * as P from '../map/core/profiles.mjs';
import { createProfiles } from '../map/app/profiles.mjs';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { m, read: k => m.get(k) ?? null, write: (k, v) => m.set(k, String(v)), remove: k => m.delete(k), load() { return m.get('edenMapProfiles') ?? null; }, save(v) { m.set('edenMapProfiles', v); } }; };
const SECRETS = ['edenMapNav', 'edenMapNavCfg', 'edenMapNavConsent', 'edenMapPackPick', 'edenMapPackLlm', 'edenMapPackRemote', 'edenMapEdit', 'edenMapProfiles'];

test('classification: every KEYS entry decides pref true / false explicitly', () => {
  const miss = Object.entries(KEYS).filter(([, o]) => typeof o.pref !== 'boolean').map(([k]) => k);
  assert.deepEqual(miss, [], 'a new storage key needs `pref: true | false` in map/core/storage.mjs');
  for (const [k, o] of Object.entries(KEYS)) if (o.pref) assert.ok(!o.perChat && o.scope !== 'session' && (!o.prefix || k === 'edenMapOn:'), k + ' cannot be a preference');
  for (const k of SECRETS) assert.equal(KEYS[k].pref, false, k);
  for (const k of ['edenMapTheme', 'edenMapLang', 'edenMapHand', 'edenMapLayers', 'edenMapFog', 'edenMap3dAutoRotate', 'edenMapInject', 'edenMapStateInj', 'edenMapDice']) assert.equal(KEYS[k].pref, true, k);
  const ks = P.prefKeys(); assert.ok(ks.includes('edenMapOn:scrap'), 'parked-feature keys are preferences'); assert.ok(!ks.some(k => k.startsWith('edenMap:chat')));
});
test('every key the live effects and host prefs touch is a preference key', () => {
  const src = readFileSync(new URL('../map/app/profile-live.mjs', import.meta.url), 'utf8');
  const used = [...new Set([...src.matchAll(/\b(edenMap[A-Za-z0-9]+)\b/g)].map(m => m[1]))];
  const ks = new Set(P.prefKeys()); assert.deepEqual(used.filter(k => !ks.has(k)), []);
});
test('built-in profiles: recommended is the defaults, lean only holds preference keys', () => {
  assert.deepEqual(P.BUILTIN[0].values, {}); const ks = new Set(P.prefKeys());
  for (const k of Object.keys(P.LEAN)) assert.ok(ks.has(k), k);
  assert.equal(P.cleanValues(P.LEAN).dropped, 0); assert.ok(P.cleanValues(P.LEAN).values.edenMapLayers);
});
const LIVE = { edenMapTheme: 'dark', edenMapFog: '1', edenMapLayers: '{"weather":"0","mylayer":"1"}', edenMapStateDepth: '5', 'edenMapOn:scrap': '1', edenMapInject: 'sys' };   // fog: '1' is off-default since LOOK-1 A2
const chat = { 'edenMap:chat:c1:fog': '{"seen":[1]}', 'edenMapSeen:c1': '3', edenMapNavCfg: '{"provider":"x","key":"SECRET"}', edenMapNavConsent: '1', edenMapNav: '120000', 'edenMap:varmap:x': '{}', edenMapPackPick: '{"a":"file"}' };
test('save, change, apply restores every preference; per-chat data and the advisor config stay untouched', () => {
  const io = mem({ ...chat }); for (const [k, v] of Object.entries(LIVE)) io.m.set(k, v);
  const seen = []; const pr = createProfiles(io, { applied: ks => seen.push(...ks) });
  assert.deepEqual(pr.saveAs('mine'), { ok: true, id: pr.store().list[0].id });
  const before = P.snapshot(io.read);
  io.m.set('edenMapTheme', 'light'); io.m.delete('edenMapFog'); io.m.set('edenMapLayers', '{"traffic":"1"}'); io.m.delete('edenMapOn:scrap'); io.m.set('edenMapKeys', '1');
  assert.equal(pr.current().modified, true, 'live differs from the active profile');
  const r = pr.apply(pr.store().list[0].id); assert.ok(r.ok && r.changed >= 5);
  assert.deepEqual(P.snapshot(io.read), before); assert.equal(pr.current().modified, false);
  for (const [k, v] of Object.entries(chat)) assert.equal(io.m.get(k), v, k + ' untouched'); assert.ok(seen.includes('edenMapTheme') && !seen.includes('edenMapNavCfg'));
});
test('applying the recommended profile resets preferences to defaults and still leaves chat data and secrets alone', () => {
  const io = mem({ ...chat, edenMapTheme: 'dark', edenMapKeys: '1' }); const pr = createProfiles(io);
  const r = pr.apply(P.REC_ID); assert.ok(r.ok); assert.equal(io.m.has('edenMapTheme'), false); assert.equal(io.m.has('edenMapKeys'), false);
  for (const [k, v] of Object.entries(chat)) assert.equal(io.m.get(k), v);
  assert.equal(pr.current().profile.id, P.REC_ID); assert.equal(pr.current().modified, false);
});
test('lean profile: writes its keys; an older profile without a key resets that key to its default', () => {
  const io = mem({ edenMapTheme: 'dark', edenMapDice: '1' }); const pr = createProfiles(io);
  pr.apply(P.LEAN_ID); assert.equal(io.m.get('edenMapRM'), 'on'); assert.equal(io.m.get('edenMapTierV2'), 'save'); assert.equal(io.m.has('edenMapTheme'), false, 'not in the profile = default'); assert.equal(io.m.has('edenMapDice'), false);
  assert.equal(pr.current().modified, false); io.m.set('edenMapRM', 'off'); assert.equal(pr.current().modified, true);
});
test('modified marker ignores values equal to the default and layer entries equal to a layer default', () => {
  const io = mem(); const pr = createProfiles(io); assert.equal(pr.current().modified, false);
  io.m.set('edenMapFog', '0'); io.m.set('edenMapLayers', '{"weather":"1","vision":"0"}'); io.m.set('edenMapStateOmit', '[]'); assert.equal(pr.current().modified, false);   // fog '0' is the default since LOOK-1 A2
  io.m.set('edenMapLayers', '{"weather":"0"}'); assert.equal(pr.current().modified, true);
});
test('export / import round trip; unknown keys dropped and counted; secrets never imported', () => {
  const io = mem({ edenMapTheme: 'dark', edenMapLayers: '{"weather":"0"}' }); const pr = createProfiles(io);
  const id = pr.saveAs('rt').id, text = pr.exportText(id), doc = JSON.parse(text);
  assert.equal(doc.schema, P.SCHEMA); assert.equal(doc.name, 'rt'); assert.equal(doc.values.edenMapTheme, 'dark');
  const io2 = mem(); const pr2 = createProfiles(io2); const imp = pr2.importText(text); assert.ok(imp.ok); assert.equal(imp.dropped, 0);
  assert.deepEqual(pr2.store().list[0].values, pr.store().list[0].values); assert.equal(pr2.store().active, P.REC_ID, 'import does not apply');
  const dirty = JSON.stringify({ schema: 1, name: 'x', values: { edenMapTheme: 'light', edenMapNavCfg: '{"key":"k"}', edenMapNavConsent: '1', 'edenMap:chat:z:fog': '1', bogus: '1' } });
  const r = pr2.importText(dirty); assert.equal(r.dropped, 4); assert.deepEqual(pr2.store().list.find(p => p.id === r.id).values, { edenMapTheme: 'light' });
  assert.equal(pr2.importText('{bad').ok, false); assert.equal(pr2.importText(JSON.stringify({ schema: 9, name: 'a', values: {} })).ok, false);
  assert.equal(pr2.importText(text).name, 'rt 2', 'a used name gets a number');
});
test('rename / delete / name rules; built-in profiles are read-only', () => {
  const pr = createProfiles(mem()); const id = pr.saveAs('a').id;
  assert.equal(pr.saveAs('  ').reason, 'name'); assert.equal(pr.saveAs('推荐', ['推荐']).reason, 'taken');
  assert.equal(pr.rename(P.REC_ID, 'x').ok, false); assert.equal(pr.remove(P.REC_ID).ok, false);
  const b = pr.saveAs('b').id; assert.equal(pr.rename(b, 'a').reason, 'taken'); assert.ok(pr.rename(b, 'c').ok);
  pr.apply(id); assert.ok(pr.remove(id).ok); assert.equal(pr.current().profile.id, P.REC_ID); assert.deepEqual(pr.store().list.map(p => p.name), ['c']);
  assert.equal(P.normStore('garbage').active, P.REC_ID); assert.equal(P.cleanName('x'.repeat(40)).length, P.NAME_MAX);
});
test('cardKey returns deterministic stable hash or k0', () => {
  assert.equal(P.cardKey(null), 'k0');
  assert.equal(P.cardKey({}), 'k0');
  const k1 = P.cardKey({ name: 'Alice', avatar: 'alice.png' });
  const k2 = P.cardKey({ name: 'Alice', avatar: 'alice.png' });
  assert.ok(k1.startsWith('k') && k1 !== 'k0');
  assert.equal(k1, k2);
  const k3 = P.cardKey({ name: 'Bob', avatar: 'bob.png' });
  assert.notEqual(k1, k3);
});
test('bind and unbind profiles to card / pack key (PROFILE-2)', () => {
  const io = mem(); const pr = createProfiles(io);
  const id = pr.saveAs('hero-custom').id;
  const cardK = 'k_my_hero';
  assert.equal(pr.boundProfile(cardK), null);
  pr.bind(cardK, id);
  assert.equal(pr.boundProfile(cardK), id);
  assert.equal(pr.store().binds[cardK], id);
  // can also bind builtin lean profile
  pr.bind('pack_eden', P.LEAN_ID);
  assert.equal(pr.boundProfile('pack_eden'), P.LEAN_ID);
  // unbinding cardK
  pr.unbind(cardK);
  assert.equal(pr.boundProfile(cardK), null);
  assert.equal(pr.boundProfile('pack_eden'), P.LEAN_ID);
  // removing profile cascades to removing its bindings
  pr.bind(cardK, id);
  assert.equal(pr.boundProfile(cardK), id);
  pr.remove(id);
  assert.equal(pr.boundProfile(cardK), null);
});
test('normStore validates and sanitizes binds', () => {
  const raw = {
    active: P.REC_ID,
    list: [{ id: 'p1', name: 'User 1', values: {} }],
    binds: {
      card1: 'p1',
      card2: P.LEAN_ID,
      card3: 'non_existent',
      '': 'p1',
    },
  };
  const s = P.normStore(JSON.stringify(raw));
  assert.equal(s.binds.card1, 'p1');
  assert.equal(s.binds.card2, P.LEAN_ID);
  assert.equal(s.binds.card3, undefined);
  assert.equal(s.binds[''], undefined);
});

