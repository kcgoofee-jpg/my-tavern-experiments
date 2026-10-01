// K-R95: the automatic pack on the host (map/tavern/auto-pack.mjs): derive, reuse by fingerprint, grow, recompute, `eden-map:pack`; and the first pack never reaches it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveAuto, normCache, keepGrown, assemble, createAutoPack, placesOf, placesPerFloor, growthSig } from '../map/tavern/auto-pack.mjs';
import { createGate } from '../map/tavern/pack-gate.mjs';

const fx = n => JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/cardread/' + n + '.json', import.meta.url)), 'utf8'));
const src = () => fx('en_harbour').src;
const clone = o => JSON.parse(JSON.stringify(o));

test('fp stable: the cache is reused; a different fp derives again; the old node ids are kept when the card name changes', () => {
  const a = resolveAuto(src(), {}), marked = { ...a.base, title: 'FROM CACHE' };
  const hit = resolveAuto(src(), { cache: { v: 1, fp: a.fp, pack: marked, grown: [], seen: [] } });
  assert.equal(hit.pack.title, 'FROM CACHE', 'same fingerprint: the cached pack is used as is');
  const miss = resolveAuto(src(), { cache: { v: 1, fp: 'other', pack: marked, grown: [], seen: [] } });
  assert.equal(miss.pack.title, a.pack.title, 'a different fingerprint: derived again');
  const renamed = resolveAuto({ ...src(), name: 'Another Name' }, {});
  assert.notEqual(renamed.fp, a.fp); assert.notEqual(renamed.pack.id, a.pack.id);
  assert.deepEqual(renamed.pack.nodes.slice(1).map(n => n.id), a.pack.nodes.slice(1).map(n => n.id), 'unchanged places keep their ids');
});

test('grown nodes whose parent still exists are kept; others are dropped; a poisoned cache is never trusted', () => {
  const a = resolveAuto(src(), {}), dock = a.base.nodes[1].id;
  const grown = [{ id: 'g_aaa', name: 'Harbour Office', alias: ['Harbour Office'], parent: dock }, { id: 'g_bbb', name: 'Orphan', alias: ['Orphan'], parent: 'w_gone' }, { id: 'g_ccc', name: 'Under Orphan', alias: ['x'], parent: 'g_bbb' }];
  assert.deepEqual(keepGrown(a.base, grown).map(n => n.id), ['g_aaa']);
  const r = resolveAuto(src(), { cache: { v: 1, fp: a.fp, pack: a.base, grown, seen: [] } });
  assert.ok(r.pack.nodes.some(n => n.id === 'g_aaa') && !r.pack.nodes.some(n => n.id === 'g_bbb'));
  assert.equal(normCache({ v: 2, fp: 'x' }), null); assert.equal(normCache('x'), null);
  const bad = normCache({ v: 1, fp: 'x', grown: [{ id: 'not_g', name: 'x' }, { id: 'g_ok', name: '<b>x</b>' }, { id: 'g_no_name' }, 7], seen: ['a', 3] });
  assert.deepEqual(bad.grown.map(n => n.id), ['g_ok']); assert.deepEqual(bad.seen, ['a']);
});

/** one stubbed host: P = the injected pack (as the gate makes it), a chat variable root, the messages */
function host(o = {}) {
  const r = resolveAuto(src(), { cache: o.cache }), P = { id: r.pack.id, source: 'auto', trust: 'foreign', schema: 2, manifest: r.pack, fp: r.fp, chatVar: 'tc_' + r.pack.id }, out = { posts: [], saves: 0, vars: o.vars || {}, chat: o.chat || 'chat1' };
  const h = { PACK_IN: P, chatId: () => out.chat, readVars: () => out.vars, post: m => out.posts.push(m), life: { dead: false }, custVer: 0, custom: o.custom === undefined ? {} : o.custom, uiLang: 'en', autoCache: null, saveRoot: () => { out.saves++; out.vars = { ...out.vars, auto: h.autoCache }; } };
  return { h, P, out, AP: createAutoPack(h) };
}
const msg = (floor, text) => ({ floor, text, h: String(floor) + text.length });

test('growth adds to auto.grown, posts eden-map:pack with rev + 1 (the injected pack is rev 1) only on a change, and saves the cache through the root store', () => {
  const T = host();
  assert.equal(T.AP.active, true);
  T.AP.round([msg(1, 'You arrive. ⌖地点 Lantern Docks · Harbour Office')], 'the inn');
  assert.equal(T.out.posts.length, 1, 'chat load: the growth is computed from the messages and published');
  const m = T.out.posts[0]; assert.deepEqual([m.type, m.rev, m.source, m.trust], ['eden-map:pack', 2, 'auto', 'foreign']);
  assert.ok(m.manifest.nodes.some(n => n.name === 'Harbour Office'));
  const dock = m.manifest.nodes.find(n => n.name === 'Lantern Docks'), office = m.manifest.nodes.find(n => n.name === 'Harbour Office');
  assert.equal(dock.id, T.P.manifest.nodes.find(n => n.name === 'Lantern Docks').id, 'the grown tree reuses the derived node for "Lantern Docks"');
  assert.equal(office.parent, dock.id); assert.equal(T.AP.cache.grown.length, 1); assert.equal(T.out.vars.auto.grown.length, 1, 'saved in `auto`'); assert.ok(T.h.custVer > 0);
  assert.equal(T.AP.round([msg(1, 'You arrive. ⌖地点 Lantern Docks · Harbour Office')], 'the inn'), false); assert.equal(T.out.posts.length, 1, 'no change, no message');
  assert.equal(T.AP.round([msg(1, 'You arrive. ⌖地点 Lantern Docks · Harbour Office'), msg(2, '⌖地点 Old Mill · Wheel House')], 'the inn'), true);
  assert.deepEqual(T.out.posts.map(p => p.rev), [2, 3]); assert.equal(T.AP.cache.grown.length, 3);
  assert.equal(T.P.manifest, T.out.posts[1].manifest, 'the injected object follows, so a reloaded viewer page starts from the grown tree');
  assert.ok(T.out.vars.auto.pack.nodes.every(n => !String(n.id).startsWith('g_')), 'auto.pack is the derived pack; the growth is separate');
});

test('chat load: a cache with grown is used (drift counted against the recompute); an absent auto.grown is recomputed from the chat; seen texts are not grown twice', () => {
  const a = resolveAuto(src(), {}), dock = a.base.nodes[1].id;
  const cache = { v: 1, fp: a.fp, pack: a.base, grown: [{ id: 'g_zzz', name: 'Ghost Pier', alias: ['Ghost Pier'], parent: dock }], seen: ['ghost pier'] };
  const T = host({ vars: { auto: cache }, cache });
  T.AP.round([msg(1, '⌖地点 Lantern Docks · Harbour Office')], '');
  assert.equal(T.AP.drift, 2, 'one grown node the chat does not produce, one the chat produces that the cache lacks: reported, not repaired');
  assert.ok(T.P.manifest.nodes.some(n => n.id === 'g_zzz'), 'the cached growth stays');
  const U = host({ vars: { auto: { v: 1, fp: a.fp, pack: a.base } } });   // no `grown` key at all
  U.AP.round([msg(1, '⌖地点 Lantern Docks · Harbour Office')], ''); assert.equal(U.AP.cache.grown.length, 1); assert.equal(U.AP.drift, 0);
  U.AP.round([msg(1, '⌖地点 Lantern Docks · Harbour Office')], 'Lantern Docks'); assert.equal(U.out.posts.length, 1);
});

test('a chat switch reloads the cache of the new chat and posts the new growth; a root that is not loaded yet is not saved over', () => {
  const T = host({ custom: null });
  T.AP.round([msg(1, '⌖地点 Old Mill · Wheel House')], ''); assert.equal(T.out.saves, 0, 'no save before the root is loaded (it would write the whole root)'); assert.equal(T.out.posts.length, 1);
  T.h.custom = {}; T.out.chat = 'chat2'; T.AP.round([], ''); assert.equal(T.out.posts.length, 2, 'the new chat has no growth: the viewer is told'); assert.equal(growthSig(T.out.posts[1].manifest.nodes), growthSig(T.P.manifest.nodes.filter(n => !String(n.id).startsWith('g_'))));
});

test('places are read from the place tag, event tags and character tags; the current place goes to the newest floor; per-floor results are cached', () => {
  assert.deepEqual(placesOf('x ⌖地点 Old Mill'), ['Old Mill']);
  assert.deepEqual(placesOf('⌖人物 Mara @ Harbour Office\n'), ['Harbour Office']);
  const memo = new Map(), l = placesPerFloor([msg(2, '⌖地点 B'), msg(1, '⌖地点 A')], 'Here', memo);
  assert.deepEqual(l, [['A'], ['Here', 'B']]); assert.equal(memo.size, 2); assert.deepEqual(placesPerFloor([], 'Only'), [['Only']]);
});

test('the pack is not active for any other source; assemble keeps the base untouched', () => {
  const T = host(); const other = createAutoPack({ ...T.h, PACK_IN: { ...T.P, source: 'index' } }); assert.equal(other.active, false); assert.equal(other.round([msg(1, '⌖地点 X')], ''), false);
  const a = resolveAuto(src(), {}), n = a.base.nodes.length; assemble(a.base, [{ id: 'g_q', name: 'Q', alias: ['Q'], parent: 'root' }]); assert.equal(a.base.nodes.length, n);
});

// ---- the gate: the first pack never reaches auto-pack.mjs; an unfamiliar card does, once ----
const BASE = 'http://stub.invalid/map/';
const disk = u => { try { const t = readFileSync(new URL('../map/' + u.slice(BASE.length), import.meta.url), 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }; } catch (e) { return { ok: false, status: 404 }; } };
function gate(card, extra = {}) {
  const calls = { auto: 0 }, env = { win: { parent: {} }, base: BASE, entry: BASE + 'tavern/pack-gate.mjs', fetch: async u => disk(u),
    access: { th: () => async () => card.data ? card : { data: card }, bookNames: () => ({ primary: 'b1' }), getBook: () => (card.books || []), stat: () => null },
    store: { get: async () => null, put: async () => true, remove: async () => true }, get: () => null, set: () => {}, chatKeys: async () => extra.chatKeys || [], reimport: () => Promise.resolve(), lang: () => 'en', budget: 300,
    loadAuto: async () => { calls.auto++; return import('../map/tavern/auto-pack.mjs'); }, ...(extra.env || {}) };
  return { calls, g: createGate(env), win: env.win };
}

test('first pack: with it resolved, auto-pack.mjs is never loaded; an unfamiliar card loads it once and gets a derived pack with the cached growth', async () => {
  const first = gate({ name: 'Some Yehehua Edition V1.5', avatar: 'a.png', books: [{ name: '世界观', strategy: { keys: ['k'] }, enabled: true, content: 'x' }] });   // I-26: the name word needs a title next to it
  let r = await first.g.start();
  assert.equal(r.id, 'eden'); assert.equal(first.win.__tcPack, undefined); assert.equal(first.calls.auto, 0);
  const chat = gate({ name: 'Anything', avatar: 'a.png' }, { chatKeys: ['eden_map'] }); await chat.g.start(); assert.equal(chat.calls.auto, 0);
  const a = resolveAuto(src(), {}), dock = a.base.nodes[1].id, cache = { v: 1, fp: a.fp, pack: a.base, grown: [{ id: 'g_q', name: 'Quay', alias: ['Quay'], parent: dock }], seen: [] };
  const un = gate({ data: { name: src().name, creator: 'fx', first_mes: src().greeting }, avatar: src().avatar, books: src().books[0].entries.map(e => ({ name: e.title, strategy: { keys: e.keys }, enabled: true, content: e.title.includes('initvar') ? src().initvar : 'text' })) }, { env: { chatAuto: async id => (id === a.pack.id ? cache : null) } });
  r = await un.g.start(); assert.equal(un.calls.auto, 1); assert.equal(r.source, 'auto');
  assert.equal(un.win.__tcPack.id, a.pack.id); assert.equal(un.win.__tcPack.fp, a.fp); assert.equal(un.win.__tcPack.rev, 1); assert.ok(un.win.__tcPack.manifest.nodes.some(n => n.id === 'g_q'), 'the viewer starts from the cached growth');
});
