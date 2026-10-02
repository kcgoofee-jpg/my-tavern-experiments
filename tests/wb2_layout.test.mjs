// WB-2 item 0: the readme entry that explains the installed book, human-readable versions,
// and a sync that moves the entries of an existing install (unless the player moved them). The layout itself (items 1-5) is not changed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as W from '../map/tavern/worldbook-sync.mjs';
import * as R from '../map/tavern/worldbook-readme.mjs';
import * as CB from '../map/core/custom-book.mjs';
import { worldbookPrefix } from '../map/core/pack.mjs';

W.setPrefix(worldbookPrefix(JSON.parse(readFileSync(new URL('../map/packs/eden/manifest.json', import.meta.url), 'utf8')), 'eden'));
const SHIP = JSON.parse(readFileSync(new URL('../map/data/worldbook_addon.json', import.meta.url), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));
const tick = () => new Promise(r => setImmediate(r));
const by = id => SHIP.entries.find(e => e.id === id);
const MAP = { version: '0.9.8-dev', build: 303 }, NOW = Date.UTC(2026, 9, 2, 12, 0, 0);

function fakeTH(books = {}) {
  const B = clone(books), writes = []; let uid = 100;
  const withUid = l => l.map(e => ({ uid: e.uid ?? uid++, ...e }));
  const api = {
    getWorldbookNames: async () => { await tick(); return Object.keys(B); },
    getWorldbook: async n => { await tick(); return clone(B[n]); },
    createWorldbook: async (n, l) => { await tick(); writes.push('create'); if (B[n]) return false; B[n] = withUid(clone(l)); return true; },
    updateWorldbookWith: async (n, f) => { const cur = clone(B[n]); await tick(); writes.push('update'); B[n] = withUid(clone(await f(cur))); return B[n]; },
    getGlobalWorldbookNames: () => [W.BOOK], rebindGlobalWorldbooks: async () => {}, getCharWorldbookNames: () => ({ primary: null, additional: [W.BOOK] }), rebindCharWorldbooks: async () => {},
    getChatWorldbookName: () => null, rebindChatWorldbook: async () => {},
  };
  return { fn: n => (typeof api[n] === 'function' ? api[n] : null), B, writes };
}
const o0 = { map: MAP, now: NOW, lang: 'zh' };

test('the readme entry: first, disabled, no keys, never injected', () => {
  assert.equal(SHIP.entries[0].id, R.README_ID);
  assert.equal(SHIP.entries[0].enabled, false);
  assert.deepEqual(SHIP.entries[0].strategy.keys, []);
  assert.equal(SHIP.entries.filter(e => e.enabled === false).length, 1);
  assert.equal(SHIP.category[R.README_ID], 'readme');
  assert.match(SHIP.built, /^\d{4}-\d\d-\d\d$/); assert.match(SHIP.version, /-dev$|^\d/);
});

test('verLabel: release + date + the content id last; an installed version only knows its release', () => {
  const S = { ver: '0.9.8+98435f09', version: '0.9.8-dev', built: '2026-10-02' };
  assert.equal(R.verLabel('0.9.8+98435f09', S), '0.9.8-dev · 2026-10-02 (id 98435f09)');
  assert.equal(R.verLabel('0.9.7+e3ce0083', S), '0.9.7 (id e3ce0083)');
  assert.equal(R.verLabel('', S), '');
  assert.equal(W.plan(null, SHIP, o0).toLabel, R.verLabel(SHIP.ver, { ...SHIP }));
});

test('fresh book: the readme goes first, is disabled and explains version, writer, counts and JIT; names no card', async () => {
  const t = fakeTH();
  const r = await W.sync(t.fn, SHIP, { consent: true, auto: true, create: true, where: null, ...o0 });
  assert.ok(r.ok);
  const book = t.B[W.BOOK], rd = book[0];
  assert.equal(rd.extra.eden_id, R.README_ID); assert.equal(rd.enabled, false); assert.equal(book.length, SHIP.entries.length);
  assert.match(rd.name, /^说明 · .+ · 0\.9\.8-dev · head #303$/);
  const c = rd.content;
  assert.match(c, /0\.9\.8-dev · 2026-10-02/); assert.match(c, /head #303/); assert.match(c, /2026-10-02 \d\d:\d\d/);
  assert.match(c, /不用。.*原地更新/); assert.match(c, /不会发给模型，不占 token/);
  assert.match(c, new RegExp(`共 ${SHIP.entries.length - 1} 条：常驻 3 条，关键词触发 129 条；写入时开着 ${SHIP.entries.length - 1} 条，关着 0 条`));
  assert.match(c, /「世界书按需挂载」关着/); assert.match(c, /报 bug 时请附上/);
  assert.ok(book.slice(1).every(e => e.enabled !== false));
});

test('JIT on: the readme counts what the JIT switched off and says why; the English text exists', async () => {
  const t = fakeTH({ [W.BOOK]: W.merge([], SHIP, o0).map((e, i) => ({ ...e, uid: i + 1 })) });
  const off = t.B[W.BOOK].filter(e => e.strategy.type === 'selective' && e.extra.eden_id !== R.README_ID).slice(0, 5);
  for (const e of off) { e.enabled = false; e.extra.eden_jit = 1; }
  const r = await W.sync(t.fn, SHIP, { consent: true, jit: true, ...o0, lang: 'en' });
  assert.ok(r.ok && r.wrote);
  const rd = t.B[W.BOOK][0];
  assert.match(rd.content, /5 off when last written/); assert.match(rd.content, /"Worldbook JIT" is on/); assert.match(rd.name, /^Readme · /);
  assert.equal(rd.enabled, false);
  assert.equal(t.B[W.BOOK].filter(e => e.enabled === false).length, 6);   // the five the JIT keeps off + the readme
});

test('sync is a no-op once written (the readme never causes a write by itself); a JIT switch or a new version rewrites it', async () => {
  const t = fakeTH();
  await W.sync(t.fn, SHIP, { consent: true, auto: true, create: true, ...o0 });
  const w0 = t.writes.length, snap = clone(t.B[W.BOOK]);
  const p = W.plan(t.B[W.BOOK], SHIP, { ...o0, now: NOW + 86400000, map: { ...MAP, build: 400 } });
  assert.equal(p.changed, false); assert.equal(p.readme, false);
  const r = await W.sync(t.fn, SHIP, { consent: true, auto: true, ...o0, now: NOW + 86400000 });
  assert.ok(r.ok && !r.wrote); assert.equal(t.writes.length, w0); assert.deepEqual(t.B[W.BOOK], snap);
  assert.equal(W.plan(t.B[W.BOOK], SHIP, { ...o0, jit: true }).readme, true);   // the JIT switch changes what the readme says
  assert.equal(W.plan(t.B[W.BOOK], SHIP, { ...o0, lang: 'en' }).readme, true);
});

test('sync moves the entries of an existing install to the shipped layout, unless the player moved them; content edits keep their text and still follow the layout', async () => {
  const old = W.merge([], SHIP, o0).map((e, i) => ({ ...e, uid: i + 1, position: e.extra.eden_id === 'map.link-rules' ? { type: 'at_depth', role: 'system', depth: 2, order: 900 } : e.extra.eden_id.startsWith('map.room.') ? { type: 'before_character_definition', role: 'system', depth: 4, order: 500 } : e.position }));
  for (const e of old) if (e.extra.eden_pos && e.extra.eden_id !== R.README_ID) { delete e.extra.eden_pos; }   // an install written before WB-2 carries no position stamp
  const rooms = old.filter(e => e.extra.eden_id.startsWith('map.room.'));
  const moved = rooms[0]; moved.extra.eden_pos = 'stamp-of-an-earlier-layout'; moved.position = { type: 'at_depth', role: 'user', depth: 3, order: 7 };   // the player moved this one
  const edited = rooms[1]; edited.content += '\n（我改过）';
  const t = fakeTH({ [W.BOOK]: old });
  const p = W.plan(t.fn && old, SHIP, o0);
  assert.ok(p.changed); assert.ok(p.update.length > 60); assert.ok(p.move.includes(edited.name));
  const r = await W.sync(t.fn, SHIP, { consent: true, auto: true, ...o0 });
  assert.ok(r.ok && r.wrote);
  const after = t.B[W.BOOK], at = id => after.find(e => e.extra.eden_id === id);
  assert.deepEqual(at('map.link-rules').position, by('map.link-rules').position);
  assert.deepEqual(at(rooms[2].extra.eden_id).position, by(rooms[2].extra.eden_id).position);
  assert.deepEqual(at(moved.extra.eden_id).position, { type: 'at_depth', role: 'user', depth: 3, order: 7 });   // left where the player put it
  assert.deepEqual(at(edited.extra.eden_id).position, by(edited.extra.eden_id).position);                       // edited text, shipped position
  assert.match(at(edited.extra.eden_id).content, /我改过/);
  const again = W.plan(after, SHIP, o0); assert.equal(again.changed, false); assert.deepEqual(again.move, []);
});

test('the chat\'s custom book: a disabled readme first', () => {
  const c = { items: { 书房: { 名: '星图室', 说明: '一间旧书房', 事实: [] } } };
  const rd = R.customReadme({ map: MAP, now: NOW, lang: 'zh', on: true, count: 1 });
  const es = CB.bookEntries(c, { on: true, entryName: 'X', readme: rd });
  assert.equal(es[0].name, rd.name); assert.equal(es[0].enabled, false); assert.deepEqual(es[0].strategy.keys, []);
  assert.match(rd.name, /^说明 · 本聊天的自定义地点书 · head #303$/); assert.match(rd.content, /不发给模型，不占 token/); assert.match(rd.content, /最近一次写入/);
  assert.equal(es[1].name, 'X'); assert.equal(es[1].position.type, 'after_character_definition'); assert.equal(es[1].position.order, 903);
  assert.equal(es[2].position.type, 'at_depth'); assert.equal(es[2].position.depth, 1); assert.equal(es[2].position.role, 'system'); assert.equal(es[2].position.order, 1200);   // WB-2 (D45): keyword entries at depth 1
  assert.equal(CB.bookEntries(c, { on: true, entryName: 'X' }).length, es.length - 1);   // without a readme nothing changes
});

test('the shipped layout (D45): rules depth 0 user order 900, constants after the character, every keyword entry at depth 1 in the 910+ bands', () => {
  const rules = by('map.link-rules');
  assert.deepEqual(rules.position, { type: 'at_depth', role: 'user', depth: 0, order: 900 });
  for (const id of ['map.event-types', 'map.current-location']) { const e = by(id); assert.equal(e.position.type, 'after_character_definition'); assert.ok(e.position.order >= 901 && e.position.order <= 909, id); }
  const kw = SHIP.entries.filter(e => e.id !== R.README_ID && e.strategy.type === 'selective');
  assert.ok(kw.length > 100);
  for (const e of kw) {   // no keyword entry before the character definition, none in the card's 100-500 band
    assert.equal(e.position.type, 'at_depth', e.id);
    assert.equal(e.position.depth, 1, e.id);
    assert.equal(e.position.role, 'system', e.id);
    assert.ok(e.position.order >= 910, e.id);
  }
  const band = (pre, lo, hi) => { const es = kw.filter(e => e.id.startsWith(pre)); assert.ok(es.length > 0, pre); for (const e of es) assert.ok(e.position.order >= lo && e.position.order <= hi, `${e.id}: ${e.position.order}`); return es.length; };
  band('map.bearing.', 910, 929);
  band('tiancheng.lore.', 930, 949);
  band('estate.lore.', 930, 949);
  band('map.place.', 950, 999);
  band('map.room.', 1000, 1099);
  const orders = kw.map(e => e.position.order); assert.equal(new Set(orders).size, orders.length, 'no duplicate order');   // a stable sort order
});
