// PLACE-1a (D44) host side: the record editor's save / undo through root-store (chat variable + the chat's custom book follow), and the world-book
// archive query by record id (map/tavern/host-tavernhelper.mjs createWbAuto, op 'wb-peek'): the body it returns is the entry the sync wrote.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRootStore, DEPS } from '../map/tavern/root-store.mjs';
import { createWbAuto } from '../map/tavern/host-tavernhelper.mjs';
import { createLife } from '../map/tavern/host-lifecycle.mjs';
import { createFacts } from '../map/tavern/feature-health.mjs';
import * as V from '../map/tavern/mvu-readers.mjs';
import * as W from '../map/tavern/worldbook-sync.mjs';
import { unwrap } from '../map/core/place-record.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHIP = JSON.parse(readFileSync(ROOT + 'map/data/worldbook_addon.json', 'utf8'));
const ID = 'room_b2_03', clone = x => JSON.parse(JSON.stringify(x));
const keep = {}, G = k => { keep[k] = Object.getOwnPropertyDescriptor(globalThis, k); }, restore = () => { for (const [k, d] of Object.entries(keep)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } };

test('place-edit / place-undo: the chat variable and the chat\'s custom book follow each save; undo takes it back', async () => {
  const vars = { chat: {} }, books = {}, posts = [];
  for (const k of ['window', 'document', 'getVariables', 'updateVariablesWith', 'createOrReplaceWorldbook', 'getWorldbookNames']) G(k);
  globalThis.window = globalThis; globalThis.document = {};
  globalThis.getVariables = () => vars.chat;
  globalThis.updateVariablesWith = async f => { vars.chat = f(clone(vars.chat)); };
  globalThis.createOrReplaceWorldbook = async (n, l) => { books[n] = clone(l); };
  globalThis.getWorldbookNames = async () => Object.keys(books);
  try {
    V.setWbName('Test');
    const host = Object.fromEntries(DEPS.map(k => [k, () => {}]));
    Object.assign(host, { life: { dead: false }, LS: null, mvuReaders: V, chatId: () => null, floorNow: 7, post: m => posts.push(m), emit() {}, recomputeSoon() {}, hostToast() {}, panel: { hidden: true }, alive: false, uiLang: 'zh',
      contextPipeline: { tag: { floor: -1, log: [], seen: {} }, trips: [] }, explored: {}, chars: [], readVars: () => ({}), MAN: Promise.resolve(null), scriptBase: '', wrapLS: f => f(), PACK_IN: null, custVer: 0, stash: null, cp: null, kfView: null, autoCache: null, ledgerRecord: null });
    const RS = createRootStore(host);
    RS.custom = V.normCustom({});
    assert.equal(RS.placeEdit(ID, { name: '审问室', desc: '只留一盏灯。', use: '审讯', facts: ['门是单向的'] }), true);
    await new Promise(r => setTimeout(r, 30));
    let saved = V.normCustom(vars.chat.eden_map?.自定义);
    assert.equal(saved.items[ID].名, '审问室'); assert.equal(saved.items[ID].说明, '只留一盏灯。'); assert.equal(saved.items[ID].用途, '审讯'); assert.deepEqual(saved.items[ID].事实, ['门是单向的']);
    assert.equal(saved.items[ID].源, '手动'); assert.equal(saved.items[ID].楼, 7); assert.equal(saved.撤销.length, 1);
    const bookName = V.wbName(null) || Object.keys(books)[0], b1 = books[bookName] || books[Object.keys(books)[0]];
    assert.ok(b1, 'the custom book was written'); assert.equal(b1[0].name, V.WB_ENTRY); assert.ok(b1.some(e => e.extra?.eden_place === ID && e.content.includes('只留一盏灯')));
    assert.equal(RS.placeEdit(ID, { desc: '' }), true); await new Promise(r => setTimeout(r, 30));
    saved = V.normCustom(vars.chat.eden_map.自定义); assert.equal(saved.items[ID].说明, undefined); assert.equal(saved.撤销.length, 2);
    assert.equal(RS.placeUndo(ID), true); await new Promise(r => setTimeout(r, 30));
    saved = V.normCustom(vars.chat.eden_map.自定义); assert.equal(saved.items[ID].说明, '只留一盏灯。', 'undo gives the description back'); assert.equal(saved.撤销.length, 1);
    assert.equal(RS.placeUndo(ID), true); await new Promise(r => setTimeout(r, 30));
    assert.equal(V.normCustom(vars.chat.eden_map.自定义).items[ID], undefined, 'and the first change too'); assert.equal(RS.placeUndo(ID), false, 'nothing left');
    assert.ok(Object.values(books).every(l => l.length === 1 && l[0].enabled === false), 'the book is emptied (index entry only, disabled), not deleted');
    assert.equal(RS.placeEdit('', { name: 'x' }), false); assert.equal(RS.placeEdit(ID, null), false); assert.equal(RS.placeEdit(ID, { desc: '字'.repeat(401) }), false, 'too long is refused');
  } finally { restore(); }
});

test('wb-peek by record id: the entry the sync wrote (synced / edited / pending), the player\'s entry of this chat, the sync time; no id -> the old name match', async () => {
  const ls = new Map(), posts = [], book = W.merge(null, SHIP).map((e, i) => ({ ...e, uid: i + 1 })), custom = [{ name: '地点-审问室', content: '本聊天自定义正文', extra: { eden_place: ID } }];
  for (const k of ['window', 'getWorldbook', 'getWorldbookNames', 'fetch']) G(k);
  globalThis.window = globalThis; globalThis.getWorldbook = async n => (n === W.BOOK ? clone(book) : n === 'Chat·自定义' ? clone(custom) : []); globalThis.getWorldbookNames = async () => [W.BOOK];
  globalThis.fetch = async () => ({ ok: true, json: async () => clone(SHIP) });
  try {
    const h = createWbAuto({ scriptBase: 'file://' + ROOT + 'map/', LS: null, lsGet: k => ls.get(k) ?? null, lsSet: (k, v) => ls.set(k, String(v)), life: createLife(), base: () => '', alive: () => true, uiLang: () => 'zh', thBtns: () => null, chatId: () => 'c1', cardKey: () => 'k',
      post: m => posts.push(m), hostToast() {}, stateInject() {}, macroSet() {}, prefSync() {}, facts: createFacts(), navFacts: () => ({}), macroVal: k => k, navSchedule() {}, manifest: Promise.resolve({ id: 'eden', data: { worldbook_addon: 'data/worldbook_addon.json' } }), packId: 'eden', customBookName: () => 'Chat·自定义' });
    ls.set('edenMapWbSyncAt', '1790000000000');
    await h.onTh({ op: 'wb-peek', id: ID, name: '惩罚室' });
    let m = posts.at(-1); assert.equal(m.type, 'eden-map:wb-peek'); assert.equal(m.id, ID); assert.equal(m.syncAt, 1790000000000);
    const e = m.entries.find(x => x.id === 'map.room.room-b2-03'), shipped = SHIP.entries.find(x => x.id === 'map.room.room-b2-03');
    assert.equal(e.state, 'synced'); assert.equal(e.content, shipped.content); assert.equal(e.ver, SHIP.ver); assert.equal(e.name, '地点-惩罚室');
    assert.equal(m.entries.find(x => x.state === 'custom').content, '本聊天自定义正文'); assert.equal(m.items[0].summary, unwrap(shipped.content), 'the old card still gets the same body');
    book.find(x => x.extra.eden_id === 'map.room.room-b2-03').content = '酒馆里改过的正文';
    await h.onTh({ op: 'wb-peek', id: ID, name: '惩罚室' }); const ed = posts.at(-1).entries.find(x => x.id === 'map.room.room-b2-03');
    assert.equal(ed.state, 'edited'); assert.equal(ed.content, '酒馆里改过的正文'); assert.equal(ed.upstream, shipped.content);
    book.splice(book.findIndex(x => x.extra.eden_id === 'map.room.room-b2-03'), 1);
    await h.onTh({ op: 'wb-peek', id: ID, name: '惩罚室' }); const pe = posts.at(-1).entries.find(x => x.id === 'map.room.room-b2-03');
    assert.equal(pe.state, 'pending'); assert.equal(pe.content, shipped.content, 'not yet written: the text that will be written');
    await h.onTh({ op: 'wb-peek', id: 'no_such_record', name: '地点-不存在' }); assert.deepEqual(posts.at(-1).entries.filter(x => x.state !== 'custom'), []);
    await h.onTh({ op: 'wb-peek', name: '惩罚室' }); const old = posts.at(-1); assert.equal(old.id, undefined); assert.deepEqual(old.entries, []); assert.ok(Array.isArray(old.items), 'no id: the name match answers as before');
  } finally { restore(); }
});
