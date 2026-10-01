// K-R99: importing a pack by URL or file (tavern/pack-runtime-v2.mjs importPack, tavern/pack-gate.mjs pick) and the browser store (core/pack-store-db.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { importPack, readCapped, MAX_URL_BYTES } from '../map/tavern/pack-runtime-v2.mjs';
import { createGate, PICK_KEY } from '../map/tavern/pack-gate.mjs';
import { createStore } from '../map/core/pack-store-db.mjs';
import { cardKey } from '../map/tavern/card-source.mjs';

const PACK = { id: 'url_pack', schema: 2, title: 'From a URL', nodes: [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta', parent: 'alpha' }] };
const res = (text, o = {}) => ({ ok: o.ok !== false, status: o.status || 200, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text), ...(o.body ? { body: o.body } : {}) });
const code = r => r.problems.map(p => p.code);

test('K-R99: an http address, a bad address and a failing fetch are refused', async () => {
  const seen = []; const fetch = async u => { seen.push(u); return res(JSON.stringify(PACK)); };
  assert.deepEqual(code(await importPack({ kind: 'url', url: 'http://example.test/p.json' }, { fetch })), ['not-https']);
  assert.deepEqual(seen, [], 'nothing was requested');
  assert.equal((await importPack({ kind: 'url', url: 'nonsense' }, { fetch })).pack, null);
  assert.deepEqual(code(await importPack({ kind: 'url', url: 'https://example.test/p.json' }, { fetch: async () => res('', { ok: false, status: 404 }) })), ['fetch']);
  assert.deepEqual(code(await importPack({ kind: 'nope' }, { fetch })), ['kind']);
});

test('K-R99: more than 8 MB is refused while streaming (the rest is never read)', async () => {
  let reads = 0, cancelled = false; const chunk = new Uint8Array(1 << 20);
  const body = { getReader: () => ({ read: async () => { reads++; return reads > 20 ? { done: true } : { done: false, value: chunk }; }, cancel: async () => { cancelled = true; } }) };
  await assert.rejects(readCapped({ headers: { get: () => null }, body }), /limit-size/);
  assert.equal(cancelled, true); assert.ok(reads <= 9, 'stopped after the cap, read ' + reads);
  assert.equal(MAX_URL_BYTES, 8 << 20);
  const r = await importPack({ kind: 'url', url: 'https://example.test/p.json' }, { fetch: async () => ({ ok: true, headers: { get: () => String(9 << 20) }, body: { cancel: async () => {} } }) });
  assert.deepEqual(code(r), ['limit-size'], 'a declared length over the cap is refused before reading');
  assert.deepEqual(code(await importPack({ kind: 'file', text: 'x'.repeat((8 << 20) + 1) }, {})), ['limit-size']);
});

test('K-R99: schema 1, not JSON, not an object are refused; a shipped id is refused as foreign', async () => {
  const f = t => importPack({ kind: 'file', text: t }, { shipped: ['town'] });
  assert.deepEqual(code(await f(JSON.stringify({ ...PACK, schema: 1 }))), ['schema']);
  assert.deepEqual(code(await f('{oops')), ['json']); assert.deepEqual(code(await f('[1]')), ['type']);
  assert.equal((await f(JSON.stringify({ ...PACK, id: 'town' }))).pack, null);
  const ok = await f(JSON.stringify(PACK)); assert.equal(ok.pack.id, 'url_pack'); assert.equal(ok.pack.nodes.length, 2);
});

test('K-R99: blocks given as paths come from the URL folder only; outside it they are dropped; a file cannot have any', async () => {
  const asked = []; const fetch = async u => { asked.push(u); return u.endsWith('/nodes.json') ? res(JSON.stringify(PACK.nodes)) : res('', { ok: false, status: 404 }); };
  const m = { id: 'url_pack', schema: 2, title: 'T', nodes: 'nodes.json', views: '../other/views.json', ui: 'sub/../../ui.json', vars: 'https://evil.test/v.json' };
  const r = await importPack({ kind: 'url', url: 'https://example.test/packs/one/pack.json' }, { fetch: async u => (u.endsWith('pack.json') ? res(JSON.stringify(m)) : fetch(u)) });
  assert.ok(r.pack, 'the pack itself is kept'); assert.equal(r.pack.nodes.length, 2, 'the block inside the folder is inlined');
  assert.deepEqual(asked, ['https://example.test/packs/one/nodes.json'], 'nothing outside the folder was requested');
  assert.deepEqual(r.problems.filter(p => p.code === 'path').map(p => p.path).sort(), ['ui', 'vars', 'views']);
  assert.doesNotMatch(r.text, /nodes\.json/, 'the kept copy holds the block inline');
  const f = await importPack({ kind: 'file', text: JSON.stringify(m) }, {});
  assert.equal(f.pack.nodes, undefined, 'a file pack has no folder: the blocks are refused'); assert.ok(f.problems.length >= 1);
});

test('K-R99: a valid pack is stored and read back from the store when the fetch fails (pick -> restart start)', async () => {
  const S = { ls: new Map(), saved: new Map(), reimport: [] }, win = { parent: {} }, card = { data: { name: 'Plain' }, avatar: 'p.png' };
  const mk = fetch => createGate({ win, base: 'http://stub.invalid/map/', entry: 'http://stub.invalid/map/tavern/pack-gate.mjs', fetch, access: { th: () => async () => card },
    store: { get: async k => S.saved.get(k) || null, put: async (k, r) => { S.saved.set(k, r); return true; }, remove: async k => S.saved.delete(k) },
    get: k => S.ls.get(k) ?? null, set: (k, v) => S.ls.set(k, v), chatKeys: async () => [], reimport: u => { S.reimport.push(u); return Promise.resolve(); }, lang: () => 'en', budget: 300 });
  const idx = JSON.stringify({ schema: 1, default: 'x', packs: [{ id: 'town', schema: 1, title: 'T' }] });
  const online = async u => (u.endsWith('/index.json') ? res(idx) : res(JSON.stringify(PACK)));
  const g = mk(online);
  const bad = await g.pick({ kind: 'url', url: 'http://example.test/pack.json' }); assert.equal(bad.ok, false); assert.deepEqual(bad.problems.map(p => p.code), ['not-https']);
  assert.equal(S.ls.get(PICK_KEY), undefined, 'a refused import changes nothing');
  const ok = await g.pick({ kind: 'url', url: 'https://example.test/pack.json' });
  assert.deepEqual([ok.ok, ok.id, ok.source], [true, 'url_pack', 'choice']); assert.equal(S.reimport.length, 1);
  const key = cardKey({ name: 'Plain', avatar: 'p.png' }); assert.equal(JSON.parse(S.ls.get(PICK_KEY))[key], 'url:https://example.test/pack.json');
  assert.equal(S.saved.get(key).kind, 'url');
  const offline = mk(async u => (u.endsWith('/index.json') ? res(idx) : res('', { ok: false, status: 503 })));   // a later start with the address down
  const r = await offline.resolve(); assert.deepEqual([r.id, r.source, r.trust], ['url_pack', 'choice', 'foreign']);
  assert.ok(r.problems.some(p => p.code === 'import-refused'), 'the failed fetch leaves one problem entry');
  const f = await mk(online).pick({ kind: 'file', text: JSON.stringify({ ...PACK, id: 'file_pack' }) }); assert.deepEqual([f.ok, f.id], [true, 'file_pack']);
  assert.equal(S.saved.get(key).kind, 'file'); assert.equal(JSON.parse(S.ls.get(PICK_KEY))[key], 'file');
  const back = await mk(online).pick({ kind: 'automatic' }); assert.equal(back.ok, true);
  assert.equal(JSON.parse(S.ls.get(PICK_KEY))[key], undefined); assert.equal(S.saved.has(key), false, '"reset to automatic" drops the stored copy');
});

test('pack-store-db: no IndexedDB reads as nothing and never throws; a fake one round-trips', async () => {
  const none = createStore(() => null);
  assert.equal(await none.get('k1'), null); assert.equal(await none.put('k1', { kind: 'file', text: '{}' }), false); assert.equal(await none.remove('k1'), false);
  const rows = new Map();
  const rq = v => { const r = { result: v }; setTimeout(() => r.onsuccess && r.onsuccess(), 0); return r; };
  const idb = { open: () => { const r = { result: { objectStoreNames: { contains: () => true }, transaction: () => ({ objectStore: () => ({ get: k => rq(rows.get(k)), put: (v, k) => (rows.set(k, v), rq(k)), delete: k => (rows.delete(k), rq(undefined)) }) }) } }; setTimeout(() => r.onsuccess(), 0); return r; } };
  const s = createStore(() => idb);
  assert.equal(await s.put('k1', { kind: 'url', url: 'https://e.test/p.json', text: '{"a":1}' }), true);
  const g = await s.get('k1'); assert.deepEqual([g.kind, g.url, g.text, typeof g.savedAt], ['url', 'https://e.test/p.json', '{"a":1}', 'number']);
  assert.equal(await s.put('', { text: 'x' }), false); assert.equal(await s.put('k2', { kind: 'file' }), false);
  assert.equal(await s.remove('k1'), true); assert.equal(await s.get('k1'), null);
});
