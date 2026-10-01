// K-R103: a foreign pack's `llm` block reaches the host only while the stored hash equals the block's (tavern/pack-runtime-v2.mjs gateLlm; tavern/pack-gate.mjs setLlm).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gateLlm, llmHash, profileFromV2, geoFromV2 } from '../map/tavern/pack-runtime-v2.mjs';
import { createGate } from '../map/tavern/pack-gate.mjs';
import { validate2 } from '../map/core/pack-v2.mjs';

const LLM = { templates: { en: { tag: 'MAP', here: 'You are at {place}' } }, worldbook: { book: 'B', entries: [{ name: 'e', content: 'text', keys: ['k'] }] } };
const PACK = { id: 'foreign1', schema: 2, title: 'F', lang: 'en', nodes: [{ id: 'inn', name: 'The Inn' }], llm: LLM, vars: { location: 'world.place' } };

test('K-R103: unused while off; used with the same hash; unused again once the text changes', () => {
  assert.equal(gateLlm(PACK, {}).pack.llm, undefined, 'default off');
  const h = llmHash(LLM);
  const on = gateLlm(PACK, { foreign1: h }); assert.equal(on.pack.llm, LLM); assert.equal(on.on, true); assert.equal(on.changed, false);
  const edited = { ...PACK, llm: { ...LLM, templates: { en: { tag: 'MAP', here: 'Changed' } } } };
  const after = gateLlm(edited, { foreign1: h }); assert.equal(after.pack.llm, undefined); assert.equal(after.on, false); assert.equal(after.changed, true, 'a passive note, not a dialog');
  assert.notEqual(after.hash, h);
});

test('K-R103: the hash is of the canonical JSON (key order does not matter); shipped packs and packs without llm are not touched', () => {
  assert.equal(llmHash({ a: 1, b: { c: [1, 2], d: 'x' } }), llmHash({ b: { d: 'x', c: [1, 2] }, a: 1 }));
  assert.notEqual(llmHash({ a: [1, 2] }), llmHash({ a: [2, 1] }));
  assert.equal(gateLlm(PACK, {}, 'shipped').pack, PACK);
  const bare = { id: 'p', schema: 2, title: 'x' }; assert.equal(gateLlm(bare, {}).pack, bare); assert.equal(gateLlm(bare, {}).has, false);
});

const LLMV = validate2(PACK).pack.llm;   // what the gate holds: the block after validation as a foreign pack
test('K-R103: the gate hands the host a pack without the model text until the user turns the switch on', async () => {
  const win = { parent: {} }, ls = new Map(), emb = JSON.stringify(PACK), reimport = [];
  const gate = createGate({ win, base: 'http://stub.invalid/map/', entry: 'http://stub.invalid/map/tavern/pack-gate.mjs', fetch: async () => ({ ok: false, status: 404 }),
    access: { th: () => async () => ({ data: { name: 'Plain', extensions: { spatial_os: emb } }, avatar: 'p.png' }) }, store: { get: async () => null, put: async () => true, remove: async () => true },
    get: k => ls.get(k) ?? null, set: (k, v) => ls.set(k, v), chatKeys: async () => [], reimport: u => { reimport.push(u); return Promise.resolve(); }, lang: () => 'en', budget: 300 });
  await gate.start();
  assert.equal(win.__tcPack.id, 'foreign1'); assert.equal(win.__tcPack.manifest.llm, undefined); assert.deepEqual([win.__tcPack.llm.has, win.__tcPack.llm.on], [true, false]);
  assert.equal(await gate.setLlm(true), true);
  assert.deepEqual(win.__tcPack.manifest.llm, LLMV); assert.equal(win.__tcPack.llm.on, true); assert.equal(JSON.parse(ls.get('edenMapPackLlm')).foreign1, llmHash(LLMV)); assert.equal(reimport.length, 1);
  assert.equal(await gate.setLlm(false), true); assert.equal(win.__tcPack.manifest.llm, undefined); assert.equal(JSON.parse(ls.get('edenMapPackLlm')).foreign1, undefined);
});

test('S9-2 T4: a schema-2 pack gives the tavern script its profile and event geography without any file fetch', () => {
  const P = profileFromV2({ ...PACK, vars: { location: 'world.place', time: 'world.t' } });
  assert.equal(P.paths.location, 'world.place'); assert.equal(P.paths.time, 'world.t');
  const geo = geoFromV2(PACK, { lang: 'en' });
  assert.equal(geo.place('heading to the inn').node, 'inn');
  assert.equal(geoFromV2(gateLlm(PACK, {}).pack, { lang: 'en' }).taxonomy().tag, undefined, 'without the model text there is no pack tag');
  assert.equal(geo.taxonomy().tag, 'MAP', 'with it the pack tag is used');
});
