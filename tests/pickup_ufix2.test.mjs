// U-FIX-2（TT sweep-1 D3-01）：种子句「捡起了一把「黄铜钥匙」」没进背包；列表里有「石头后获」「动静」两条误收。
// 句式：量词 + 引号名、被动（被掏出 / 被带走）、动词修饰后面名词（带走的动静）、只剩量词（一把）。
// 宿主：查看器睡着 / 卸载（alive = false）时这一轮照扫照折叠，打开地图不会漏掉那一楼。
import test from 'node:test';
import assert from 'node:assert/strict';
import { names } from '../map/core/pickup.mjs';
import { createFacts } from '../map/tavern/feature-health.mjs';
import { createStashFlow } from '../map/tavern/stash-flow.mjs';

test('quantifier before a quoted name: the quoted name, never the quantifier', () => {
  assert.deepEqual(names('绫濑遥从地上捡起了一把「黄铜钥匙」，收进口袋。'), ['黄铜钥匙']);
  assert.deepEqual(names('她拿起两枚“银币”。'), ['银币']);
  assert.deepEqual(names('他拿起一把，又放下了。'), []);
});

test('passive and attributive uses are not pickups', () => {
  assert.deepEqual(names('被掏出石头后获得了极致的安抚，处于极度虚弱'), []);
  assert.deepEqual(names('地下暗门被暴力轰破、且有古遗物被带走的动静，早已惊动了守卫。'), []);
  assert.deepEqual(names('钥匙被人拿走了。'), []);
  assert.deepEqual(names('他掏出石头后坐下。'), ['石头']);
  assert.deepEqual(names('她拿起皇后的王冠。'), ['王冠']);
  assert.deepEqual(names('她拿起被子。'), ['被子']);
});

test('host: a round folds pickups while the viewer is asleep (alive = false)', async () => {
  const BASE = new URL('../map/', import.meta.url).href;
  const hadF = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [] }) });
  try {
    const posts = [], saves = [];
    const bridge = { mvuStat: () => ({}), perFloorStat: () => null, mvuGet: () => undefined, varMap: {}, mvuPresent: () => false, varUpdateSeq: () => 0, swipeAt: () => 0, rosters: () => ({}), floorPlace: () => ({ place: '' }) };
    const MR = await import('../map/tavern/mvu-readers.mjs');
    const host = { facts: createFacts(), LS: { getItem: () => null, setItem() {}, removeItem() {} }, PACK_ID: 'p', PACK_IN: { manifest: { data: {} } }, scriptBase: BASE, chatId: () => 'c1',
      composeIn: () => {}, life: { dead: false }, lsGet: () => null, chars: [], events: [], roster: null, mvuStat: () => ({}), post: m => posts.push(m), saveRoot: () => { saves.push(1); return Promise.resolve(true); },
      BASE: 'https://example.invalid/', mvuBridge: bridge, mvuReaders: MR, uiLang: 'zh', alive: false, floorNow: 5, getProfile: () => ({}) };
    const LF = createStashFlow(host);
    await Promise.all(['core/ledger.mjs', 'core/pickup.mjs', 'tavern/settlement-guard.mjs', 'tavern/stash-store.mjs', 'tavern/stash-recompute.mjs'].map(f => import(BASE + f)));
    for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 5));
    LF.stash = LF.stashStoreModule.empty(null);
    LF.scanPickups([{ floor: 5, text: '绫濑遥从地上捡起了一把「黄铜钥匙」，收进口袋。' }], '别墅');
    const r = LF.ledgerSync();
    assert.ok(r, 'the fold ran');
    assert.deepEqual(Object.values(LF.stash.items).map(x => x.name), ['黄铜钥匙']);
    assert.equal(saves.length, 1, 'written to the chat variable');
    assert.equal(posts.filter(p => p.type === 'eden-map:inv').length, 0, 'nothing posted to a sleeping viewer');
  } finally { hadF ? Object.defineProperty(globalThis, 'fetch', hadF) : delete globalThis.fetch; }
});

test('rows read with older scan rules are replayed once: the false positives go, real rows stay', async () => {
  const R = await import('../map/tavern/stash-recompute.mjs');
  const S = await import('../map/tavern/stash-store.mjs');
  const { hashText } = await import('../map/tavern/context.mjs');
  const text = '地下暗门被暴力轰破、且有古遗物被带走的动静。她拿起一枚银怀表。';
  let st = S.empty(10);
  for (const name of ['动静', '银怀表']) st = S.put(st, { name, place: '', note: S.TEXT_NOTE(12), qty: 1, src: 'text', carried: true, msgIndex: 12, mark: hashText(text) }).stash;
  const r = R.step({ ...st, upTo: 12 }, [{ msgIndex: 12, text, place: '' }], {});
  assert.equal(r.replayed, 1);
  assert.deepEqual(Object.values(r.stash.items).map(x => x.name), ['银怀表']);
  const again = R.step(r.stash, [{ msgIndex: 12, text, place: '' }], {});
  assert.equal(again.replayed, 0, 'once only');
});

test('U-FIX-6: a store carried from a longer chat (branch) re-anchors: old text rows past the end go, the new floors are scanned', async () => {
  const R = await import('../map/tavern/stash-recompute.mjs');
  const S = await import('../map/tavern/stash-store.mjs');
  let st = S.empty(126);
  st = S.put(st, { name: '动静', place: '南侧地窖', note: S.TEXT_NOTE(128), qty: 1, src: 'text', carried: true, msgIndex: 128, mark: 'x' }).stash;
  st = S.put(st, { name: '旧地图', place: '书房', note: '', qty: 1, src: 'map', carried: true, msgIndex: 129 }).stash;
  const msgs = [{ msgIndex: 0, text: '开场。' }, { msgIndex: 1, text: '⌖火灾｜某处｜2｜起火｜' }, { msgIndex: 3, text: '绫濑遥从地上捡起了一把「黄铜钥匙」，收进口袋。' }];
  const r = R.step({ ...st, upTo: 130 }, msgs, {});
  const names = Object.values(r.stash.items).map(x => x.name).sort();
  assert.deepEqual(names, ['旧地图', '黄铜钥匙'].sort(), 'text row of a missing message gone, the map pickup kept, the key scanned');
  assert.equal(r.stash.since, 3);
  const again = R.step(r.stash, msgs, {});
  assert.equal(again.changed, false, 'stable on the next round');
});

test('「塞进 / 放进」 name a destination, not the item (TT sweep-2: 「嘴里」 from 塞进她的嘴里)', () => {
  assert.deepEqual(names('拿起那条擦过脏水的白丝巾，走回去强行塞进她的嘴里，命令她含着。'), ['白丝巾']);
  assert.deepEqual(names('他把钥匙塞进口袋。'), ['钥匙']);
  assert.deepEqual(names('她拿起一块木板。'), ['木板']);
});
