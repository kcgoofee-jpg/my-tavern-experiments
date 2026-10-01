// S6-2：宿主流 stash-flow（原 loot-flow）在假宿主上的行为：一轮 = scanPickups 记窗口 → ledgerSync 折叠入统一背包 → 推 eden-map:inv（旧形状 + stash + card）；
// 地图拾取（takeLoot）进同一份背包、槽位事实晚一轮入账；卡自己的物品表变了只重发；换聊天清空；背包没加载（null）时什么都不写。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStashFlow } from '../map/tavern/stash-flow.mjs';

const BASE = new URL('../map/', import.meta.url).href;
const WORLD = { items: [{ id: 'swm01', map: 'estate', marker: 'study', name: '旧地图', place: '书房' }] };
const tick = () => new Promise(r => setTimeout(r, 5));

async function setup({ stat = {}, floor = 2 } = {}) {
  const hadF = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  globalThis.fetch = async () => ({ ok: true, json: async () => WORLD });
  const posts = [], saves = [], st = { stat, floor, here: '书房' };
  const bridge = { mvuStat: () => st.stat, perFloorStat: () => null, mvuGet: () => undefined, varMap: { location: '世界.当前地点' }, mvuPresent: () => false, varUpdateSeq: () => 0, swipeAt: () => 0, rosters: () => null, presentId: 'present' };
  const MR = await import('../map/tavern/mvu-readers.mjs');
  const LS = { getItem: () => null, setItem() {}, removeItem() {} };
  const host = { LS, PACK_ID: 'eden', PACK_IN: { manifest: { data: { stash: 'stash.json' } } }, scriptBase: BASE, chatId: () => 'c1', composeIn: () => {}, life: { dead: false }, lsGet: () => null, chars: [], events: [], roster: null,
    mvuStat: () => st.stat, post: m => posts.push(m), saveRoot: () => { saves.push(1); return Promise.resolve(true); }, BASE: 'https://example.invalid/', mvuBridge: bridge, mvuReaders: MR, uiLang: 'zh', alive: true,
    get floorNow() { return st.floor; } };
  const LF = createStashFlow(host);
  await Promise.all(['core/ledger.mjs', 'core/pickup.mjs', 'core/stash.mjs', 'core/rng.mjs', 'tavern/settlement-guard.mjs', 'tavern/stash-store.mjs', 'tavern/stash-recompute.mjs'].map(f => import(BASE + f)));
  await tick(); await tick();
  return { LF, posts, saves, st, done: () => { hadF ? Object.defineProperty(globalThis, 'fetch', hadF) : delete globalThis.fetch; } };
}
const lastInv = posts => posts.filter(p => p.type === 'eden-map:inv').at(-1);

test('一轮：窗口记下 → 折叠入账 → 推 eden-map:inv（items 旧形状、stash 行与槽位摘要、card）；首次扫描只认最新一楼', async () => {
  const t = await setup({ floor: 2 });
  try {
    const { LF, posts, saves } = t;
    assert.equal(LF.ledgerSync(), null, '背包还没加载（null）：什么都不写');
    LF.stash = LF.stashStoreModule.empty(null);
    const msgs = [{ floor: 1, text: '他把黄铜钥匙拿到手。' }, { floor: 2, text: '她捡到一枚银怀表。' }];
    LF.scanPickups(msgs, '书房');
    const r = LF.ledgerSync();
    assert.equal(r.fixed, 1); assert.equal(r.slot.count, 1); assert.equal(r.slot.virtual, true);
    assert.deepEqual(Object.values(LF.stash.items).map(x => x.name), ['银怀表'], '起点对齐最新一楼：第 1 楼不扫');
    assert.equal(saves.length, 1, '有变化才写变量');
    const inv = lastInv(posts);
    assert.deepEqual(inv.items.map(x => x.名), ['银怀表']); assert.equal(inv.items[0].地点, '书房');
    assert.equal(inv.stash.v, 1); assert.equal(inv.stash.rows[0].src, 'text'); assert.equal(inv.stash.rows[0].carried, true); assert.deepEqual(inv.stash.slot, { name: '物品栏', virtual: true, count: 1 });
    assert.equal(inv.card, null, '卡里没有背包栏、包也没写 vars.inventory：没有 card');
    // 同样的窗口再来一轮：没有变化，不写、不重发
    const before = posts.filter(p => p.type === 'eden-map:inv').length; LF.scanPickups(msgs, '书房'); LF.ledgerSync();
    assert.equal(saves.length, 1); assert.equal(posts.filter(p => p.type === 'eden-map:inv').length, before, '不重发');
    // 新一楼
    t.st.floor = 3; LF.scanPickups([...msgs, { floor: 3, text: '拿到「锈迹斑斑的黄铜钥匙」。' }], '客厅'); const r2 = LF.ledgerSync();
    assert.equal(r2.fixed, 1); assert.deepEqual(Object.values(LF.stash.items).map(x => x.name), ['银怀表', '锈迹斑斑的黄铜钥匙']);
    assert.equal(saves.length, 2);
  } finally { t.done(); }
});

test('地图拾取进同一份背包（src map、carried）；它的槽位事实晚一轮入账；摘要与槽位行照旧', async () => {
  const t = await setup({ floor: 4 });
  try {
    const { LF, posts } = t;
    LF.stash = LF.stashStoreModule.empty(null);
    LF.scanPickups([{ floor: 4, text: '你走向书架。' }], '书房'); LF.ledgerSync();
    LF.takeLoot({ id: 'swm01' });   // 藏物表可能还没到：到了才认
    const row0 = Object.values(LF.stash.items);
    if (!row0.length) { await tick(); await tick(); LF.takeLoot({ id: 'swm01' }); }
    const rows = Object.entries(LF.stash.items);
    assert.equal(rows.length, 1); assert.equal(rows[0][0], 'swm01'); assert.equal(rows[0][1].src, 'map'); assert.equal(rows[0][1].carried, true); assert.equal(rows[0][1].msgIndex, 4); assert.equal(rows[0][1].node, 'study');
    assert.equal(LF.stash.slot, null, '槽位事实还没入账');
    assert.equal(lastInv(posts).items[0].名, '旧地图');
    t.st.floor = 5; LF.scanPickups([{ floor: 4, text: '你走向书架。' }, { floor: 5, text: '你合上抽屉。' }], '书房');
    const r = LF.ledgerSync();
    assert.deepEqual(LF.stash.slot.facts, { swm01: { name: '旧地图', msgIndex: 4, place: '书房' } }, '下一轮结算才进槽位');
    assert.equal(r.slot.count, 1);
    assert.match(LF.stashStoreModule.digestLine(LF.stash), /^随身仓与藏物：书房 旧地图$/);
    assert.equal(LF.takeLoot({ id: 'nope' }), undefined); assert.equal(Object.keys(LF.stash.items).length, 1, '认不出的 id 不动背包');
  } finally { t.done(); }
});

test('卡自己的物品表（card）：探路找到真字段就读；它变了只重发 eden-map:inv，不写变量', async () => {
  const t = await setup({ stat: { 资产: { 背包: { 钥匙: 1 } } }, floor: 2 });
  try {
    const { LF, posts, saves } = t;
    LF.stash = LF.stashStoreModule.empty(null);
    LF.scanPickups([{ floor: 2, text: '你推开门。' }], '书房'); LF.ledgerSync();
    assert.deepEqual(lastInv(posts).card, { path: '资产.背包', rows: [{ name: '钥匙', qty: 1 }] });
    const n = posts.filter(p => p.type === 'eden-map:inv').length, w = saves.length;
    LF.ledgerSync(); assert.equal(posts.filter(p => p.type === 'eden-map:inv').length, n, '没变不重发');
    t.st.stat = { 资产: { 背包: { 钥匙: 2, 药: 1 } } }; LF.ledgerSync();
    assert.equal(posts.filter(p => p.type === 'eden-map:inv').length, n + 1, '变了重发一次');
    assert.deepEqual(lastInv(posts).card.rows, [{ name: '钥匙', qty: 2 }, { name: '药', qty: 1 }]);
    assert.equal(saves.length, w, '只是重发，不写变量');
    assert.deepEqual(t.st.stat, { 资产: { 背包: { 钥匙: 2, 药: 1 } } }, 'stat_data 一个字节不动');
  } finally { t.done(); }
});

test('resetChat：会话事实与窗口清零、背包置空（由 loadCustom 重新读）；之后的结算什么都不写', async () => {
  const t = await setup({ floor: 2 });
  try {
    const { LF, saves } = t;
    LF.stash = LF.stashStoreModule.empty(null);
    LF.scanPickups([{ floor: 2, text: '她捡到一枚银怀表。' }], '书房'); LF.ledgerSync();
    assert.ok(LF.lootFacts.length >= 1 && Object.keys(LF.stash.items).length === 1);
    LF.resetChat();
    assert.equal(LF.lootFacts.length, 0); assert.equal(LF.stash, null); assert.deepEqual(LF.settleCarry.domains, []);
    const w = saves.length; assert.equal(LF.ledgerSync(), null); assert.equal(saves.length, w);
  } finally { t.done(); }
});

test('扩展接口 EdenMap.setInv / removeInv / getInv（host-api）：写进统一背包（src api、起点楼），getInv 仍是旧形状的行', async () => {
  const anyStub = (() => { const f = function () {}; const p = new Proxy(f, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : p), apply: () => p, construct: () => p, set: () => true, has: () => true }); return p; })();
  const hadWin = Object.getOwnPropertyDescriptor(globalThis, 'window'), hadDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.window = anyStub; globalThis.document = anyStub;
  try {
    const { createHostApi, DEPS } = await import('../map/tavern/host-api.mjs');
    const S = await import('../map/tavern/stash-store.mjs');
    const changed = [];
    const host = Object.fromEntries(DEPS.map(k => [k, anyStub]));
    Object.assign(host, { MAN: Promise.resolve(null), scriptBase: 'file:///nonexistent/map/', stashStoreModule: S, stash: S.empty(null), floorNow: 7, changedInv: () => changed.push(1) });
    const { api } = createHostApi(host);
    assert.equal(await api.setInv('机密账本', { place: '书房', map: 'estate', hidden: true, note: '塞在书架' }), true);
    assert.equal(host.stash.items.i1.src, 'api'); assert.equal(host.stash.items.i1.carried, false); assert.equal(host.stash.items.i1.msgIndex, 7);
    assert.deepEqual(await api.getInv(), [{ id: 'i1', 名: '机密账本', 地点: '书房', 层: 'estate', 暗格: true, 说明: '塞在书架' }]);
    assert.equal(await api.removeInv('机密账本'), true); assert.deepEqual(await api.getInv(), []);
    assert.equal(await api.removeInv('没有'), false);
    host.stash = S.put(host.stash, { id: 'xa', name: '银怀表', src: 'text', msgIndex: 2 }).stash;
    await api.removeInv('银怀表'); assert.deepEqual(host.stash.removed, { xa: 7 }, '删掉正文行留墓碑');
    assert.equal(changed.length, 3);
    host.stash = null; assert.equal(await api.setInv('x'), false, '背包没加载：不写');
  } finally { hadWin ? Object.defineProperty(globalThis, 'window', hadWin) : delete globalThis.window; hadDoc ? Object.defineProperty(globalThis, 'document', hadDoc) : delete globalThis.document; }
});
