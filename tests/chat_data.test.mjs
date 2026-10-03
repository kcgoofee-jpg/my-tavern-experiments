// CHAT-ISO (I-33): one card, several chats. The pure orphan rules, the reset flow and the orphan sweep with fake host functions,
// and the worldbook JIT watermark reset on a chat switch. The browser side (two chats in one stub host, gallery images) is tools/browser/chat_iso.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { orphanBooks, orphanLocal, orphanScopes, createChatData } from '../map/tavern/chat-data.mjs';
import * as MV from '../map/tavern/mvu-readers.mjs';
import { createLlmFlow, DEPS as LLM_DEPS } from '../map/tavern/llm-flow.mjs';
import * as BG from '../map/tavern/storage-budget.mjs';

MV.setWbName('Pack');
const WB = MV.wbName, ENTRY = MV.WB_ENTRY;
function mem() {
  const m = new Map();
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null), removeItem: k => { m.delete(k); }, setItem: (k, v) => { m.set(k, String(v)); } };
}

test('orphan rules: only chats that no longer exist; current chat, local pseudo chat, global scope and foreign books are never orphans', () => {
  const live = new Set(['a', 'b']);
  assert.deepEqual(orphanLocal(['a', 'x', 'local', 'cur', 'y'], live, 'cur'), ['x', 'y']);
  assert.deepEqual(orphanScopes(['global', 'chat:a', 'chat:x', 'chat:cur', 'chat:local'], live, 'cur'), ['chat:x']);
  const names = [WB('a'), WB('x'), 'My own book', 'Pack·自定义·zzzzzz', 'Other·自定义·' + WB('x').slice(-6)];
  assert.deepEqual(orphanBooks(names, WB, live), [WB('x')]);
  assert.deepEqual(orphanBooks(names, () => '', live), [], 'no pack prefix configured = no such books');
});

function fixture({ chats = ['A', 'B'], cur = 'A', listOk = true } = {}) {
  const ls = mem(), posts = [], saved = {};
  const vars = { stat_data: { 世界: { 当前地点: 'p' } }, eden_map: { 自定义: { items: { k: { 类: 'room', 名: 'n' } } } }, other: 1 };
  const books = {};
  const g = globalThis; for (const k of ['window', 'getVariables', 'updateVariablesWith', 'getWorldbook', 'getWorldbookNames', 'deleteWorldbook', 'getChatWorldbookName', 'rebindChatWorldbook', 'getCharWorldbookNames', 'getGlobalWorldbookNames']) saved[k] = g[k];
  g.window = g; let chatWb = WB('A');
  g.getVariables = () => JSON.parse(JSON.stringify(vars));
  g.updateVariablesWith = async f => { const n = f(JSON.parse(JSON.stringify(vars))); for (const k of Object.keys(vars)) delete vars[k]; Object.assign(vars, n); };
  g.getWorldbook = async n => books[n] || [];
  g.getWorldbookNames = () => Object.keys(books);
  g.deleteWorldbook = async n => delete books[n];
  g.getChatWorldbookName = () => chatWb;
  g.rebindChatWorldbook = async (c, n) => { chatWb = n || null; };
  const mine = id => { books[WB(id)] = [{ name: ENTRY, content: 'x' }]; };
  const host = { chatId: () => cur, life: { dead: false }, mvuReaders: { VAR_ROOT: 'eden_map', WB_ENTRY: ENTRY, wbName: WB }, post: m => posts.push(m), custom: 'live', onChatSwitch: () => posts.push({ type: 'switch' }),
    mvuBridge: { listChatIds: async () => (listOk ? new Set(chats) : null) } };
  const io = { store: () => ls, ls: () => ls, varsOk: () => true, clearWb: () => posts.push({ type: 'wb-clear' }) };
  return { ls, posts, vars, books, mine, host, io, cd: createChatData(host, io), chatWb: () => chatWb, restore: () => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete g[k]; else g[k] = v; } } };
}

test('reset: only this chat\'s record, rows and own book go; other chats, stat_data, other variables and the user\'s books stay', async () => {
  const F = fixture();
  try {
    for (const id of ['A', 'B']) { F.ls.setItem(`edenMap:chat:${id}:custom2`, '{}'); F.ls.setItem(`edenMap:chat:${id}:fog`, '{}'); F.ls.setItem('edenMapSeen:' + id, '1'); F.mine(id); }
    F.ls.setItem('edenMapLang', 'zh'); F.books['User book'] = [{ name: 'n' }];
    const r = await F.cd.reset();
    assert.equal(r.ok, true); assert.equal(r.book, true);
    assert.equal(F.vars.eden_map, undefined, 'the record is gone'); assert.deepEqual(F.vars.stat_data, { 世界: { 当前地点: 'p' } }, 'the card\'s stat_data is untouched'); assert.equal(F.vars.other, 1);
    for (const k of ['edenMap:chat:A:custom2', 'edenMap:chat:A:fog', 'edenMapSeen:A']) assert.equal(F.ls.getItem(k), null, k);
    for (const k of ['edenMap:chat:B:custom2', 'edenMap:chat:B:fog', 'edenMapSeen:B', 'edenMapLang']) assert.ok(F.ls.getItem(k) !== null, k + ' survives');
    assert.equal(F.books[WB('A')], undefined); assert.ok(F.books[WB('B')] && F.books['User book']);
    assert.equal(F.chatWb(), null, 'the chat slot no longer points at the deleted book');
    assert.equal(F.host.custom, null);
    assert.ok(F.posts.some(p => p.type === 'switch'), 'recompute from the floors goes through the chat-switch path');
    assert.deepEqual(F.posts.find(p => p.type === 'eden-map:chat-reset-result'), { type: 'eden-map:chat-reset-result', ok: true, images: 0, book: true });
  } finally { F.restore(); }
});

test('reset: a book without our entry name is not ours and is left alone', async () => {
  const F = fixture();
  try { F.books[WB('A')] = [{ name: 'someone else\'s entry' }]; const r = await F.cd.reset(); assert.equal(r.book, false); assert.ok(F.books[WB('A')]); } finally { F.restore(); }
});

test('orphan sweep: rows, books of deleted chats go; a book the host cannot confirm is never touched; unreadable chat list = nothing happens', async () => {
  const F = fixture({ chats: ['A', 'B'] });
  try {
    for (const id of ['A', 'B', 'GONE']) { F.ls.setItem(`edenMap:chat:${id}:custom2`, '{}'); F.ls.setItem('edenMapSeen:' + id, '1'); F.mine(id); }
    F.books[WB('FOREIGN')] = [{ name: 'not our entry' }]; F.books['User book'] = [{ name: ENTRY }];
    const r = await F.cd.orphanSweep();
    assert.deepEqual(r.local, ['GONE']); assert.deepEqual(r.books, [WB('GONE')]);
    assert.equal(F.ls.getItem('edenMap:chat:GONE:custom2'), null); assert.ok(F.ls.getItem('edenMap:chat:B:custom2'));
    assert.ok(F.books[WB('A')] && F.books[WB('B')] && F.books[WB('FOREIGN')] && F.books['User book'] && !F.books[WB('GONE')]);
  } finally { F.restore(); }
  const N = fixture({ listOk: false });
  try { N.ls.setItem('edenMap:chat:GONE:custom2', '{}'); N.mine('GONE'); assert.equal(await N.cd.orphanSweep(), null); assert.ok(N.ls.getItem('edenMap:chat:GONE:custom2') && N.books[WB('GONE')]); } finally { N.restore(); }
});

test('storage-budget.dropChat clears the record row, the seen row and the fog row of one chat only', () => {
  const st = mem(); for (const id of ['a', 'b']) for (const s of ['custom2', 'fog', 'scrap']) st.setItem(`edenMap:chat:${id}:${s}`, '1');
  st.setItem('edenMapSeen:a', '1'); BG.dropChat(st, 'a');
  assert.deepEqual([...Array(st.length).keys()].map(i => st.key(i)).sort(), ['edenMap:chat:b:custom2', 'edenMap:chat:b:fog', 'edenMap:chat:b:scrap']);
});

// ---- worldbook JIT: the watermark of chat A must not decide chat B's first round ----
test('JIT: a chat switch voids the watermark, and a round that was in flight across the switch does not set it', async () => {
  const saved = { window: globalThis.window, getWorldbook: globalThis.getWorldbook, updateWorldbookWith: globalThis.updateWorldbookWith };
  const scriptBase = new URL('../map/', import.meta.url).href;
  let book = [{ name: 'e1', enabled: true, strategy: { type: 'selective', keys: ['A'] }, extra: { eden_id: 'e1' } }], writes = 0, gate = null;
  globalThis.window = globalThis;
  globalThis.getWorldbook = async () => { if (gate) await gate; return JSON.parse(JSON.stringify(book)); };
  globalThis.updateWorldbookWith = async (n, f) => { writes++; book = f(JSON.parse(JSON.stringify(book))); };
  try {
    const host = Object.fromEntries(LLM_DEPS.map(k => [k, null]));
    Object.assign(host, { scriptBase, life: { dead: false }, panel: { hidden: true }, uiLang: 'zh', lsGet: k => (k === 'edenMapWbJit' ? '1' : null), lsSet: () => {}, here: 'x', floorNow: 3, regNow: {}, facts: { jit: {} },
      SpatialM: { locate: () => ({ mapId: 'm' }), activationSet: () => ({ names: new Set(['B']), pinned: true, where: 'B' }) }, pointsFor: async () => [], hostToast: () => {}, sendEvents: () => {}, post: () => {}, alive: false });
    const L = createLlmFlow(host);
    await new Promise(r => setTimeout(r, 150));   // the dynamic imports
    await L.jitRound(); assert.equal(writes, 1, 'first round disables e1 (active set is B)');
    book[0].enabled = true; delete book[0].extra.eden_jit;   // the book is changed under us (another chat's round)
    await L.jitRound(); assert.equal(writes, 1, 'same active set: the watermark holds the write back');
    L.jitReset(); await L.jitRound(); assert.equal(writes, 2, 'after the chat switch the round plans again');
    book[0].enabled = true; delete book[0].extra.eden_jit;
    let open; gate = new Promise(r => { open = r; });
    const inflight = L.jitRound(); L.jitReset(); open(); gate = null; await inflight;
    assert.equal(writes, 2, 'the round that straddled the switch writes nothing');
    await L.jitRound(); assert.equal(writes, 3, 'and left no watermark behind');
  } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } }
});
