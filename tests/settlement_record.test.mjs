// S6-3 (K-R78, I-04): the settlement record of the npc and events domains: the pure module, the audit's hole rule, the host switch, the saved key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordNorm, recordPut, recordLanded, describeRecord, CAP } from '../map/core/settlement-record.mjs';
import { audit, stripWhy } from '../map/core/ledger.mjs';
import { createStashFlow } from '../map/tavern/stash-flow.mjs';
import * as S from '../map/tavern/stash-store.mjs';
import * as MR from '../map/tavern/mvu-readers.mjs';
import { createRootStore, DEPS } from '../map/tavern/root-store.mjs';
import { HOST_SRC } from './_host_src.mjs';

test('recordNorm: bad entries dropped, fields cut, level 0-3, the oldest by msgIndex go over the cap', () => {
  assert.deepEqual(recordNorm(null), { npc: {}, events: {} });
  assert.deepEqual(recordNorm('x'), { npc: {}, events: {} });
  const r = recordNorm({ npc: { 甲: { place: '书房', node: 'study', msgIndex: 3, src: 'whatever' }, 乙: { place: '' }, 丙: 'x', 丁: { place: 'a'.repeat(80), node: 'Bad Node' } },
    events: { e1: { type: 'alert', level: 9, node: 'hall', msgIndex: 2 }, e2: { type: '' }, e3: { type: 'fire', level: -2 } } });
  assert.deepEqual(Object.keys(r.npc).sort(), ['丁', '甲']);
  assert.deepEqual(r.npc.甲, { place: '书房', node: 'study', msgIndex: 3, src: 'routine' });
  assert.equal([...r.npc.丁.place].length, 60); assert.equal(r.npc.丁.node, ''); assert.equal(r.npc.丁.msgIndex, null);
  assert.deepEqual(Object.keys(r.events).sort(), ['e1', 'e3']);
  assert.equal(r.events.e1.level, 3); assert.equal(r.events.e3.level, 0);
  const many = { npc: Object.fromEntries(Array.from({ length: CAP + 30 }, (_, i) => ['n' + i, { place: 'p', msgIndex: i }])) };
  const n = recordNorm(many).npc;
  assert.equal(Object.keys(n).length, CAP);
  assert.ok(!('n0' in n) && 'n' + (CAP + 29) in n, 'the oldest by msgIndex went');
});

test('recordPut: fills holes only, never overwrites; returns the added count; the input is not touched', () => {
  const rec = { npc: { 甲: { place: '书房', node: '', msgIndex: 1, src: 'routine' } }, events: {} };
  const copy = JSON.stringify(rec);
  const r = recordPut(rec, [
    { domain: 'npc', op: 'OP_ROUTINE', npc: '甲', room: '花园' }, { domain: 'npc', op: 'OP_ROUTINE', npc: '乙', room: '大厅' },
    { domain: 'events', id: 'e1', type: 'alert', level: 2, node: 'hall' }, { domain: 'events', id: 'e1', type: 'fire', level: 1 },
    { domain: 'assets', id: 'x' }, null, { domain: 'npc', npc: '', room: 'a' },
  ], 9);
  assert.equal(r.added, 2);
  assert.equal(r.rec.npc.甲.place, '书房'); assert.deepEqual(r.rec.npc.乙, { place: '大厅', node: '', msgIndex: 9, src: 'routine' });
  assert.deepEqual(r.rec.events.e1, { type: 'alert', level: 2, node: 'hall', msgIndex: 9 });
  assert.equal(JSON.stringify(rec), copy);
  assert.equal(recordPut(null, null).added, 0);
});

test('recordLanded / describeRecord: the views the audit reads, the counts', () => {
  const rec = { npc: { 甲: { place: '书房', msgIndex: 1 } }, events: { e1: { type: 'alert', level: 1 } } };
  assert.deepEqual(recordLanded(rec), { npc: { 甲: '书房' }, events: { e1: true } });
  assert.deepEqual(describeRecord(rec), { npc: 1, events: 1 });
  assert.deepEqual(describeRecord(undefined), { npc: 0, events: 0 });
});

test('audit: a landed empty place is a hole (patch); a different value is still stale; events land under their id; a pack type needs anyEventType', () => {
  const f = { kind: 'routine', npc: '甲', room: '书房', floor: 7 };
  const hole = audit([f], { npc: { 甲: '' } });
  assert.deepEqual(hole.patches.map(stripWhy), [{ domain: 'npc', op: 'OP_ROUTINE', npc: '甲', room: '书房', key: 'routine|甲|书房||7' }]);
  assert.equal(audit([f], { npc: { 甲: '花园' } }).pending[0].why, 'stale-value');
  assert.equal(audit([f], { npc: { 甲: '书房' } }).ok, 1);
  const ev = { kind: 'event', id: 'e1', type: 'market_fire', level: 2, node: 'hall', floor: 5, authority: 'committed' };
  assert.equal(audit([ev], { events: {} }).pending[0].why, 'unresolved', 'a type outside the kernel list without the option');
  const p = audit([ev], { events: {} }, { anyEventType: true }).patches[0];
  assert.deepEqual(stripWhy(p), { domain: 'events', op: 'OP_EVENT', type: 'market_fire', level: 2, at: null, id: 'e1', node: 'hall', key: 'event|e1|||5' });
  assert.equal(audit([ev], { events: { e1: true } }, { anyEventType: true }).ok, 1, 'landed under the id');
  assert.equal(audit([{ ...ev, type: '' }], { events: {} }, { anyEventType: true }).pending[0].why, 'unresolved');
  const old = audit([{ kind: 'event', type: 'alert', level: 2, at: [0.1, 0.2], floor: 5 }], { events: {} }).patches[0];
  assert.ok(!('id' in old) && !('node' in old), 'a fact without an id keeps the old patch shape');
});

// ---- the host: the switch, the facts, the write ----
const BASE = new URL('../map/', import.meta.url).href;
async function flow({ on }) {
  const reads = [], saves = [], posts = [];
  const track = (name, v) => Object.defineProperty({}, name, { get() { reads.push(name); return v; }, enumerable: true });
  const chars = [{ name: '甲', place: '书房', src: 'routine' }, { name: '路人', place: '街', src: 'routine' }, { name: '乙', place: '花园', src: 'mvu' }];
  const events = [{ id: 'e1', type: 'fire', lvl: 2, node: 'hall', last: 5 }];
  const roster = { present: { items: [{ name: '甲', place: '' }, { name: '乙', place: '花园' }] } };
  const bridge = { mvuStat: () => ({}), perFloorStat: () => null, mvuGet: () => undefined, varMap: { location: '世界.当前地点' }, mvuPresent: () => false, varUpdateSeq: () => 0, swipeAt: () => 0, rosters: () => null, presentId: 'present' };
  const host = { LS: { getItem: () => null }, PACK_ID: 'eden', PACK_IN: null, scriptBase: BASE, chatId: () => 'c1', composeIn() {}, life: { dead: false }, lsGet: k => (on && k === 'edenMapLedgerWrite' ? '1' : null),
    mvuStat: () => ({}), post: m => posts.push(m), saveRoot: () => { saves.push(1); return Promise.resolve(true); }, BASE: 'https://example.invalid/', mvuBridge: bridge, mvuReaders: MR, uiLang: 'zh', alive: true, floorNow: 6,
  };
  for (const [k, v] of [['chars', chars], ['events', events], ['roster', roster]]) Object.defineProperty(host, k, { get() { reads.push(k); return v; }, enumerable: true });
  const hadF = Object.getOwnPropertyDescriptor(globalThis, 'fetch'); globalThis.fetch = async () => ({ ok: false });
  const LF = createStashFlow(host);
  await Promise.all(['core/ledger.mjs', 'core/pickup.mjs', 'core/stash.mjs', 'core/rng.mjs', 'core/settlement-record.mjs', 'tavern/settlement-guard.mjs', 'tavern/stash-store.mjs', 'tavern/stash-recompute.mjs'].map(f => import(BASE + f)));
  await new Promise(r => setTimeout(r, 10));
  LF.stash = LF.stashStoreModule.empty(null);
  LF.scanPickups([{ floor: 6, text: '你走向书架。' }], '书房');
  return { LF, reads, saves, done: () => { hadF ? Object.defineProperty(globalThis, 'fetch', hadF) : delete globalThis.fetch; } };
}

test('switch off: no npc / event facts, nothing is read, nothing is written, the key never appears', async () => {
  const t = await flow({ on: false });
  try {
    t.LF.ledgerSync();
    assert.deepEqual(t.reads, [], 'chars / events / roster are not even read');
    assert.equal(t.LF.ledgerRecord, null);
    assert.equal(t.saves.length, 0);
  } finally { t.done(); }
});

test('switch on: a roster person with a routine place and no card place, and the parsed events, land in the record; only holes; one save; stable on repeat', async () => {
  const t = await flow({ on: true });
  try {
    t.LF.ledgerSync();
    const rec = t.LF.ledgerRecord;
    assert.deepEqual(Object.keys(rec.npc), ['甲'], '路人 is in no roster group; 乙 has a card place and no routine row');
    assert.equal(rec.npc.甲.place, '书房'); assert.equal(rec.npc.甲.src, 'routine');
    assert.deepEqual(rec.events.e1, { type: 'fire', level: 2, node: 'hall', msgIndex: 6 });
    assert.equal(t.saves.length, 1);
    t.LF.ledgerSync();
    assert.equal(t.saves.length, 1, 'the second round adds nothing: no write');
  } finally { t.done(); }
});

test('the settlement path is guarded by the switch first and never touches stat_data', () => {
  const src = HOST_SRC.slice(HOST_SRC.indexOf('function settleRecord'));
  assert.match(src.slice(0, 200), /lsGet\('edenMapLedgerWrite'\) !== '1' \|\|/);
  const body = src.slice(0, src.indexOf('/** 分支身份'));
  assert.ok(!/stat_data|mvuSet|updateVariablesWith|replaceVariables/.test(body));
});

// ---- saveRoot: the key only when there is an entry ----
async function withChat(rootVars, fn) {
  const vars = { eden_map: rootVars }, writes = [];
  const had = Object.fromEntries(['window', 'getVariables', 'updateVariablesWith'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  globalThis.window = globalThis; globalThis.getVariables = () => vars;
  globalThis.updateVariablesWith = async f => { const next = f(JSON.parse(JSON.stringify(vars))); writes.push(JSON.parse(JSON.stringify(next.eden_map))); vars.eden_map = next.eden_map; };
  const host = Object.fromEntries(DEPS.map(k => [k, () => {}]));
  Object.assign(host, { contextPipeline: { tag: { floor: -1, log: [], seen: {} }, trips: [] }, LS: { getItem: () => null, setItem() {}, removeItem() {} }, MAN: Promise.resolve(null), PACK_ID: 'eden', PACK_IN: null,
    scriptBase: new URL('../map/', import.meta.url).href, life: { dead: false }, post: () => {}, emit: () => {}, recomputeSoon: () => {}, readVars: () => vars.eden_map || {}, chatId: () => 'chat-1', checkpointResume: () => {}, kfReset: () => {},
    wrapLS: f => f, BASE: 'https://example.invalid/', explored: {}, cp: null, kfView: null, floorNow: 12, alive: true, custVer: 0, ghost: false, uiLang: 'zh', chars: [], mvuReaders: MR, stashStoreModule: S, stash: null,
    keyframesModule: null, explorationLedgerModule: null, tlWalk: null, worldbookJitModule: null, WBSm: null, ledgerRecord: null });
  try { return await fn({ vars, writes, host, store: createRootStore(host) }); }
  finally { for (const [k, d] of Object.entries(had)) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k]; }
}
test('root store: no ledger key without an entry; an entry is loaded through recordNorm and saved back', async () => {
  await withChat({ 自定义: { items: {} } }, async ({ vars, host, store }) => {
    await store.loadCustom();
    assert.equal(host.ledgerRecord, null);
    await store.saveRoot(); assert.ok(!('ledger' in vars.eden_map), 'a chat with the switch off never gets the key');
    host.ledgerRecord = { npc: {}, events: {} }; await store.saveRoot(); assert.ok(!('ledger' in vars.eden_map), 'an empty record is not written');
    host.ledgerRecord = { npc: { 甲: { place: '书房', node: '', msgIndex: 3, src: 'routine' } }, events: {} };
    await store.saveRoot(); assert.deepEqual(vars.eden_map.ledger.npc.甲.place, '书房');
    host.ledgerRecord = null; await store.loadCustom();
    assert.equal(host.ledgerRecord.npc.甲.msgIndex, 3, 'loaded back through recordNorm');
  });
});
