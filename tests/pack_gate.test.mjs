// K-R90 / K-R91: the pack gate (tavern/pack-gate.mjs createGate) and the card reader (tavern/card-source.mjs) with stubbed host interfaces; the shipped files are served from disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGate, PICK_KEY } from '../map/tavern/pack-gate.mjs';
import { readCardBasics, readCardBooks, cardKey, embeddedText, EMBED_TITLE } from '../map/tavern/card-source.mjs';

const BASE = 'http://stub.invalid/map/';
const disk = u => { try { const t = readFileSync(new URL('../map/' + u.slice(BASE.length), import.meta.url), 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }; } catch (e) { return { ok: false, status: 404 }; } };
const EMB = { id: 'emb_pack', schema: 2, title: 'Embedded', nodes: [{ id: 'alpha', name: 'Alpha' }] };
const card = (name, extra = {}, avatar = 'a.png') => ({ data: { name, creator: '', ...extra }, avatar });

/** one stubbed tavern: `S.card`, `S.names`, `S.books` can be changed between resolutions (a card switch) */
function stub(o = {}) {
  const S = { card: o.card === undefined ? card('Zzz') : o.card, names: o.names || null, books: o.books || {}, ls: new Map(Object.entries(o.ls || {})), keys: o.chatKeys || [], reimport: [], cleaned: 0, bookCalls: [], saved: new Map() };
  const win = { __tcPack: o.baked, parent: { __edenMapCleanup: () => { S.cleaned++; } } };
  const env = { win, base: BASE, entry: BASE + 'tavern/pack-gate.mjs', fetch: async u => (o.offline ? { ok: false, status: 500 } : disk(u)),
    access: { th: () => async () => S.card, bookNames: () => S.names, getBook: n => { S.bookCalls.push(n); return S.books[n]; } },
    store: { get: async k => S.saved.get(k) || null, put: async (k, r) => { S.saved.set(k, r); return true; }, remove: async k => S.saved.delete(k) },
    get: k => S.ls.get(k) ?? null, set: (k, v) => S.ls.set(k, v), chatKeys: async () => S.keys, reimport: u => { S.reimport.push(u); return Promise.resolve(); }, lang: () => 'en', budget: 300 };
  return { S, win, gate: createGate(env), key: () => cardKey({ name: S.card.data.name, avatar: S.card.avatar }) };
}
const EDEN_BOOK = { names: { primary: 'P', additional: [] }, books: { P: [{ name: '世界观', content: 'x', enabled: true, strategy: { keys: ['k'] } }] } };   // I-26: a name word needs a worldbook title next to it
const pickKey = (T, v) => T.S.ls.set(PICK_KEY, JSON.stringify({ [T.key()]: v }));

test('K-R90: choice beats embedded beats index beats automatic', async () => {
  const T = stub({ card: card('Brindle', { extensions: { spatial_os: EMB } }) });
  pickKey(T, 'index:town');
  let r = await T.gate.resolve(); assert.deepEqual([r.id, r.source, r.trust], ['town', 'choice', 'shipped']);
  T.S.ls.clear();
  r = await T.gate.resolve(); assert.deepEqual([r.id, r.source, r.trust], ['emb_pack', 'card', 'foreign']);
  T.S.card = card('Brindle', {}, 'plain.png'); r = await T.gate.resolve(); assert.deepEqual([r.id, r.source, r.trust, r.tc.schema], ['minimal', 'index', 'shipped', 2]);
  assert.equal(r.tc.manifest.nodes.length, 5, 'a shipped schema-2 pack is handed over with its blocks inline');
  T.S.card = card('Nothing Alike'); r = await T.gate.resolve(); assert.equal(r.source, 'auto'); assert.match(r.id, /^c_[0-9a-z]{1,7}$/); assert.equal(r.trust, 'foreign'); assert.equal(r.tc.schema, 2);
  assert.equal(r.tc.manifest.title, 'Nothing Alike');
});

test('K-R90: a pack baked into the script is tier 0 (kept as is); the user choice for the card still beats it', async () => {
  const baked = { id: 'town', chatVar: 'tc_town', manifest: { id: 'town' }, events: null };
  const T = stub({ card: card('Brindle', { extensions: { spatial_os: EMB } }), baked });
  let r = await T.gate.resolve(); assert.deepEqual([r.id, r.source], ['town', 'baked']);
  await T.gate.start(); assert.equal(T.win.__tcPack, baked, 'left as is');
  pickKey(T, 'index:minimal'); r = await T.gate.resolve(); assert.deepEqual([r.id, r.source], ['minimal', 'choice']);
});

test('K-R91: a refused embedded pack falls through with one problem (bad JSON, schema 1, a shipped id, over 1 MB, a block given as a path)', async () => {
  const bad = { json: '{not json', schema1: JSON.stringify({ ...EMB, schema: 1 }), shipped: JSON.stringify({ ...EMB, id: 'town' }), big: JSON.stringify({ ...EMB, pad: 'x'.repeat((1 << 20) + 10) }), path: JSON.stringify({ ...EMB, nodes: 'nodes.json' }) };
  for (const [name, text] of Object.entries(bad)) {
    const T = stub({ card: card('Brindle', { extensions: { spatial_os: text } }) });
    const r = await T.gate.resolve();
    assert.equal(r.source, 'index', name + ': the next tier answers');
    assert.equal(r.problems.filter(p => p.code === 'embedded-refused').length, 1, name);
  }
});

test('K-R90: the legacy-default pack leaves window.__tcPack undefined (name word, chat variable, no card, index unreachable)', async () => {
  for (const o of [{ card: card('Some Yehehua Edition V1.5'), ...EDEN_BOOK }, { card: card('Anything'), chatKeys: ['eden_map'] }, { card: null }, { card: card('Anything'), offline: true }]) {
    const T = stub(o); T.win.__tcPack = { id: 'stale', manifest: {} };
    const cur = await T.gate.start();
    assert.equal(T.win.__tcPack, undefined, JSON.stringify(o)); assert.equal(cur.id, 'eden');
  }
  const T = stub({ card: card('Anything'), offline: true }); await T.gate.start();
  assert.ok(T.win.__packProblems.some(p => p.code === 'index-unavailable'), 'a missing index is a problem entry, not a blocker');
});

test('K-R91: the embedded worldbook entry is read from the character\'s own books only, enabled or not; our add-on entries are left out', async () => {
  const entry = (name, content, o = {}) => ({ name, content, enabled: true, strategy: { keys: ['k'] }, ...o });
  const books = { Primary: [entry('plain', 'x'), entry(` ${EMBED_TITLE} `, JSON.stringify(EMB), { enabled: false })], Extra: [entry('ours', 'x', { extra: { eden_id: 'e1' } }), entry('legacy', 'y', { name: undefined, comment: 'legacy title' })], Global: [entry(EMBED_TITLE, '{"id":"nope"}')] };
  const T = stub({ card: card('Plain Card'), names: { primary: 'Primary', additional: ['Extra', 'Primary'] }, books });
  const r = await T.gate.resolve();
  assert.deepEqual([r.id, r.source], ['emb_pack', 'card']);
  assert.deepEqual(T.S.bookCalls, ['Primary', 'Extra'], 'only the character\'s books, each once; never a global or chat book');
  const bs = await readCardBooks({ bookNames: () => ({ primary: 'Primary', additional: ['Extra'] }), getBook: n => books[n] });
  assert.deepEqual(bs[1].entries.map(e => e.title), ['legacy title'], 'our add-on entries are left out; older hosts use `comment`');
  assert.equal(bs[0].entries[1].enabled, false); assert.equal(bs[0].entries[0].content, undefined, 'content only for the embedded entry');
  assert.deepEqual(await readCardBooks({ bookNames: () => { throw new Error('x'); } }), []);
});

test('card-source: the card reader keeps the three-level fallback and the card key', async () => {
  const a = { th: () => async () => card('From TH', { extensions: { spatial_os: '{"id":"x"}' } }, 'th.png') };
  let r = await readCardBasics(a); assert.equal(r.card.name, 'From TH'); assert.deepEqual(r.tried, ['bridge']); assert.equal(r.card.src, 'getCharData'); assert.equal(r.card.spatialOs, '{"id":"x"}');
  r = await readCardBasics({ th: () => async () => null, ctx: () => ({ characters: [{ data: { name: 'Ctx' }, avatar: 'c.png' }], characterId: 0 }) });
  assert.equal(r.card.name, 'Ctx'); assert.deepEqual(r.tried, ['bridge', 'context']);
  r = await readCardBasics({ parentCtx: () => ({ characters: [{ name: 'Par' }], characterId: 0 }) }); assert.deepEqual([r.card.name, r.card.src, r.tried], ['Par', 'parent-st', ['context']]);
  r = await readCardBasics({}); assert.deepEqual([r.card, r.tried], [null, []]);
  assert.equal(cardKey(null), 'k0'); assert.match(cardKey({ name: 'A', avatar: 'b' }), /^k[0-9a-z]+$/); assert.notEqual(cardKey({ name: 'A', avatar: 'b' }), cardKey({ name: 'A', avatar: 'c' }));
  assert.equal(embeddedText({ spatialOs: { id: 'x' } }, []).from, 'card'); assert.equal(embeddedText({}, [{ entries: [{ title: EMBED_TITLE, content: '{}' }] }]).from, 'worldbook'); assert.equal(embeddedText({}, []), null);
});

test('K-R90 / Z-19: a card switch resolves again and restarts only when the pack id or source changes (A -> B -> A)', async () => {
  const nameOnly = await stub({ card: card('Some Yehehua Edition V1.5') }).gate.resolve();
  assert.equal(nameOnly.source, 'auto', 'I-26: the author word alone does not open the first pack');
  const T = stub({ card: card('Brindle') });
  await T.gate.start(); assert.equal(T.win.__tcPack.id, 'minimal'); assert.equal(T.win.__tcPack.source, 'index');
  await T.gate.onChat(); assert.equal(T.S.reimport.length, 0, 'same card: nothing restarts');
  T.S.card = card('Unknown Card', {}, 'b.png'); await T.gate.onChat();
  const idB = T.win.__tcPack.id; assert.match(idB, /^c_/); assert.equal(T.win.__tcPack.source, 'auto'); assert.equal(T.S.reimport.length, 1); assert.equal(T.S.cleaned, 1, 'the running instance is stopped through its cleanup hook');
  T.S.card = card('Brindle'); await T.gate.onChat();
  assert.equal(T.win.__tcPack.id, 'minimal'); assert.equal(T.S.reimport.length, 2);
  assert.equal(new Set(T.S.reimport).size, 2, 'a fresh query each time, so the entry is evaluated again');
  assert.match(T.S.reimport[0], /\/tavern\/eden-map\.js\?k=k[0-9a-z]+&r=1$/);
  T.S.names = EDEN_BOOK.names; T.S.books = EDEN_BOOK.books; T.S.card = card('Yehehua'); await T.gate.onChat(); assert.equal(T.win.__tcPack, undefined, 'to the legacy default: no pack object at all');
});

test('K-R90: pack-gate over budget starts with the legacy default and corrects by a restart', async () => {
  const T = stub({ card: card('Brindle') });
  const slow = createGate({ ...Object.getPrototypeOf({}), win: T.win, base: BASE, entry: BASE + 'tavern/pack-gate.mjs', fetch: async u => { await new Promise(r => setTimeout(r, 60)); return disk(u); }, access: { th: () => async () => T.S.card },
    store: { get: async () => null, put: async () => true, remove: async () => true }, get: () => null, set() {}, chatKeys: async () => [], reimport: u => { T.S.reimport.push(u); return Promise.resolve(); }, lang: () => 'en', budget: 5 });
  await slow.start(); assert.equal(T.win.__tcPack, undefined, 'started with what it had');
  await new Promise(r => setTimeout(r, 400)); assert.equal(T.win.__tcPack.id, 'minimal'); assert.equal(T.S.reimport.length, 1);
});
