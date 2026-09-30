// S4-4 T4: the English place-name table moved from the core dictionary (en.json `names`) into the first pack (manifest data.names.en -> packs/eden/names.en.json).
// The pack file equals the frozen dictionary entry for entry, in the same order; every reader gives the same output whichever file it came from; a pack without the table has none.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as PK from '../map/core/pack.mjs';
import { buildGeo } from '../map/core/compat-v1-geo.mjs';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { makeHere } from '../map/app/here-v2.mjs';
import { edenNames } from './helpers/eden-names.mjs';
import { edenInputs, townInputs } from './helpers/eden-inputs.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const FROZEN = J('tests/helpers/i18n_s44_frozen/en.json').names, PACK = edenNames();

test('the pack file equals the frozen dictionary entry for entry, key order kept; the dictionaries no longer carry it', () => {
  assert.equal(Object.keys(FROZEN).length, 153);
  assert.deepEqual(Object.entries(PACK), Object.entries(FROZEN));
  assert.equal('names' in J('map/i18n/en.json'), false); assert.equal('names' in J('map/i18n/zh.json'), false);
});

test('the manifest declares it (data.names.en), the loader resolves it against the pack directory, a pack without it has none', async () => {
  const man = J('map/packs/eden/manifest.json');
  assert.deepEqual(man.data.names, { en: 'packs/eden/names.en.json' }); assert.deepEqual(PK.validate(man), []);
  assert.deepEqual((await PK.load('eden', { injected: { manifest: man } })).data.names, { en: 'packs/eden/names.en.json' });
  const other = { id: 'xx', schema: 1, title: 'X', data: { maps: 'maps.json', names: { en: 'names.en.json' } } };
  assert.deepEqual(PK.resolve(other).data.names, { en: 'packs/xx/names.en.json' }); assert.deepEqual(PK.validate(other), []);
  assert.equal(PK.resolve(J('map/packs/town/manifest.json')).data.names, undefined);
  assert.ok(PK.validate({ ...other, data: { maps: 'maps.json', names: 'names.en.json' } }).length, 'names is a { language: path } table');
  assert.ok(PK.validate({ ...other, data: { maps: 'maps.json', names: { en: '../x.json' } } }).length && PK.validate({ ...other, data: { maps: 'maps.json', names: { 'EN!': 'x.json' } } }).length);
});

test('tr() / nm() as the viewer runs them, and the node chain (buildGeo, fromV1, makeHere), give the same output from the pack file as from the frozen dictionary, for every entry', () => {
  const trOld = z => FROZEN[z] || z, trNew = z => PACK[z] || z;   // app/i18n.mjs tr in English: the table entry or the Chinese text
  const nmOld = (o, k = 'name') => o?.[k + '_en'] || trOld(o?.[k] ?? ''), nmNew = (o, k = 'name') => o?.[k + '_en'] || trNew(o?.[k] ?? '');
  for (const z of [...Object.keys(FROZEN), '没有这个词', '']) { assert.equal(trNew(z), trOld(z), z); assert.equal(nmNew({ name: z }), nmOld({ name: z }), z); }
  const I = edenInputs(), same = names => { const g = buildGeo({ reg: I.maps, world: I.world, names, plan: I.plan }); return JSON.stringify([g.nodes, g.ctx?.levels]); };
  assert.equal(same(PACK), same(FROZEN)); assert.notEqual(same(PACK), same(null), 'the names reach the nodes');
  const pk = names => JSON.stringify(fromV1({ ...I, names }).pack);
  assert.equal(pk(PACK), pk(FROZEN));
  const words = names => { const h = makeHere({ manifest: I.manifest, maps: I.maps, world: I.world, names, plan: I.plan, overlay: I.overlay }); return ['天城·上层', 'Upper Tier', '伊甸庄园·书房', '世界树', '未知的地方'].map(v => JSON.stringify(h.here(v))); };
  assert.deepEqual(words(PACK), words(FROZEN));
  assert.equal(JSON.stringify(fromV1({ ...townInputs(), names: null }).pack), JSON.stringify(fromV1({ ...townInputs() }).pack), 'a pack without the table: English falls back to the Chinese text');
});
