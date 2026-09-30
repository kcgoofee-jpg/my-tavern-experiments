// 世界书全自动（用户 2026-09-28）：map/tavern/wbsync.mjs autoRun / autoDecision / merge 的旧对话兼容。假的酒馆助手接口，每个 await 都让出一次，模拟多标签页交错。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as W from '../map/tavern/wbsync.mjs';
import { worldbookPrefix } from '../map/core/pack.mjs';
// 书名前缀取自包清单（S4-3）：这些测试跑的是第一个包，宿主读到它的清单后就是这样配的
W.setPrefix(worldbookPrefix(JSON.parse(readFileSync(new URL('../map/packs/eden/manifest.json', import.meta.url), 'utf8')), 'eden'));

const clone = o => JSON.parse(JSON.stringify(o));
const tick = () => new Promise(r => setImmediate(r));
const ship = (ver, ents, ids = {}) => ({ book: W.BOOK, version: ver, ver, aliases: { ids }, entries: ents.map(([id, content, name]) => ({ id, name: name || id, enabled: true, content, strategy: { type: 'constant', keys: [] }, position: { type: 'after_character_definition', order: 900 } })) });

function fakeTH(books = {}, bind = {}, o = {}) {
  const B = clone(books), writes = [], G = { global: [...(bind.global || [])], char: o.noChar ? null : { primary: bind.charPrimary ?? null, additional: [...(bind.char || [])] }, chat: bind.chat ?? null };
  let uid = 100; const withUid = l => l.map(e => ({ uid: e.uid ?? uid++, ...e }));
  const w = (n, f) => async (...a) => { await tick(); writes.push([n, a[0]]); return f(...a); };
  const api = {
    getWorldbookNames: async () => { await tick(); return Object.keys(B); },
    getWorldbook: async n => { await tick(); if (!B[n]) throw new Error('no book'); return clone(B[n]); },
    createWorldbook: w('createWorldbook', (n, l) => { if (B[n]) return false; B[n] = withUid(clone(l)); return true; }),
    updateWorldbookWith: w('updateWorldbookWith', async (n, f) => { const cur = clone(B[n]); await tick(); B[n] = withUid(clone(await f(cur))); return B[n]; }),
    replaceWorldbook: w('replaceWorldbook', (n, l) => { B[n] = withUid(clone(l)); }),
    createOrReplaceWorldbook: w('createOrReplaceWorldbook', (n, l) => { B[n] = withUid(clone(l)); }),
    getGlobalWorldbookNames: () => [...G.global], rebindGlobalWorldbooks: w('rebindGlobalWorldbooks', l => { G.global = [...l]; }),
    getCharWorldbookNames: () => (G.char ? clone(G.char) : null),
    rebindCharWorldbooks: w('rebindCharWorldbooks', (c, v) => { if (o.bindThrows) throw new Error('boom'); G.char = clone(v); }),
    getChatWorldbookName: () => G.chat, rebindChatWorldbook: w('rebindChatWorldbook', (c, n) => { G.chat = n; }),
  };
  if (o.noCreate) delete api.createWorldbook;
  return { fn: n => (typeof api[n] === 'function' ? api[n] : null), B, G, writes };
}
const S1 = ship('1.0+a', [['地图联动规范', 'A1'], ['地图当前地点', 'B1']]);

test('autoDecision：总开关 / 没接口 / 离线 / 墓碑 / 旧书 / 已有', () => {
  const base = { on: true, api: true, ship: true, exists: false, tombstone: false, legacy: [] };
  assert.equal(W.autoDecision({ ...base, on: false }), 'off');
  assert.equal(W.autoDecision({ ...base, api: false }), 'noapi');
  assert.equal(W.autoDecision({ ...base, ship: false }), 'offline');
  assert.equal(W.autoDecision({ ...base, tombstone: true }), 'tomb');
  assert.equal(W.autoDecision({ ...base, legacy: ['伊甸地图·世界书附加条目 v0.9.5'] }), 'migrate');
  assert.equal(W.autoDecision(base), 'create');
  assert.equal(W.autoDecision({ ...base, exists: true, tombstone: true }), 'sync');
});

test('打开地图：书没有 → 自动建好并挂到当前角色附加世界书，不用点；别的绑定不动', async () => {
  const t = fakeTH({ 卡书: [] }, { char: ['别的附加书'], global: ['全局书'] });
  const r = await W.autoRun(t.fn, S1, { charKey: 'a.png' });
  assert.ok(r.ok); assert.equal(r.action, 'create'); assert.equal(r.bound, 'char'); assert.equal(r.boundChar, 'a.png');
  assert.equal(t.B[W.BOOK].length, 2);
  assert.deepEqual(t.G.char.additional, ['别的附加书', W.BOOK]); assert.deepEqual(t.G.global, ['全局书']);
  // 再跑：不写
  t.writes.length = 0; const r2 = await W.autoRun(t.fn, S1, { charKey: 'a.png', boundChars: ['a.png'] });
  assert.ok(r2.ok); assert.equal(r2.wrote, false); assert.equal(t.writes.length, 0);
});

test('总开关关 / 墓碑：什么都不写', async () => {
  for (const o of [{ on: false }, { tombstone: true }]) {
    const t = fakeTH(); const r = await W.autoRun(t.fn, S1, { charKey: 'a.png', ...o });
    assert.equal(r.ok, false); assert.equal(t.writes.length, 0); assert.equal(t.B[W.BOOK], undefined);
  }
});

test('没有当前角色（群聊等）：绑到当前聊天；没有 createWorldbook：自动模式不用 createOrReplace', async () => {
  const t = fakeTH({}, {}, { noChar: true }); const r = await W.autoRun(t.fn, S1, {});
  assert.ok(r.ok); assert.equal(t.G.chat, W.BOOK);
  const t2 = fakeTH({}, {}, { noCreate: true }); const r2 = await W.autoRun(t2.fn, S1, { charKey: 'a' });
  assert.equal(r2.ok, false); assert.equal(t2.B[W.BOOK], undefined); assert.ok(!t2.writes.some(x => x[0] === 'createOrReplaceWorldbook'));
});

test('多标签页：两轮在每个 await 处交错跑，只有一本书、条目不重复、附加列表不重复', async () => {
  const t = fakeTH();
  const rs = await Promise.all([W.autoRun(t.fn, S1, { charKey: 'a' }), W.autoRun(t.fn, S1, { charKey: 'a' }), W.autoRun(t.fn, S1, { charKey: 'a' })]);
  assert.ok(rs.every(r => r.ok), JSON.stringify(rs));
  assert.equal(Object.keys(t.B).filter(n => n === W.BOOK).length, 1);
  const ids = t.B[W.BOOK].map(e => e.extra.eden_id); assert.deepEqual([...new Set(ids)].sort(), ['地图当前地点', '地图联动规范']); assert.equal(ids.length, 2);
  assert.deepEqual(t.G.char.additional, [W.BOOK]);
});

test('已有重复条目（旧版多标签页留下的）：没改过的重复合并掉，改过的副本留着降优先级；再合并幂等', () => {
  const S = W.shipped(S1), a = S.entries[0];
  const cur = [{ uid: 1, ...a }, { uid: 2, ...a }, { uid: 3, ...a, content: '用户改的' }, { uid: 4, ...S.entries[1] }];
  const m = W.merge(cur, S1);
  assert.equal(m.filter(e => e.extra.eden_id === '地图联动规范' && e.content === 'A1').length, 1);
  const kept = m.find(e => e.content === '用户改的'); assert.ok(kept); assert.equal(kept.position.order, W.RETIRED_ORDER);
  assert.deepEqual(W.merge(m, S1), m);
  assert.equal(W.plan(m, S1).changed, false);
});

test('旧书带版本号：自动迁移——建新书、旧书的绑定换成新书（不两本同时注入），旧书留着', async () => {
  const old = '伊甸地图·世界书附加条目 v0.9.5';
  const t = fakeTH({ [old]: [{ uid: 1, name: 'x', content: 'y' }] }, { global: [old] });
  const r = await W.autoRun(t.fn, S1, { charKey: 'a' });
  assert.ok(r.ok); assert.equal(r.action, 'migrate');
  assert.deepEqual(t.G.global, [W.BOOK]); assert.ok(t.B[old]);
  assert.ok(!t.G.char.additional.includes(W.BOOK), '已全局生效，不再重复挂到角色');
});

test('每个角色只自动挂一次：用户解绑后不再挂回去；新角色会挂', async () => {
  const t = fakeTH(); await W.autoRun(t.fn, S1, { charKey: 'a' });
  t.G.char.additional = [];   // 用户解绑
  let r = await W.autoRun(t.fn, S1, { charKey: 'a', boundChars: ['a'] });
  assert.ok(r.ok); assert.deepEqual(t.G.char.additional, []);
  r = await W.autoRun(t.fn, S1, { charKey: 'b', boundChars: ['a'] });   // 换了角色（假接口里是同一个附加列表）
  assert.equal(r.boundChar, 'b'); assert.deepEqual(t.G.char.additional, [W.BOOK]);
});

test('绑定接口抛错：不抛出，书照样建好', async () => {
  const t = fakeTH({}, {}, { bindThrows: true }); const r = await W.autoRun(t.fn, S1, { charKey: 'a' });
  assert.ok(r.ok); assert.ok(t.B[W.BOOK]);
});

test('版本变了静默同步；退役条目降优先级不删不停用；再发回来恢复原顺序', async () => {
  const t = fakeTH(); await W.autoRun(t.fn, S1, { charKey: 'a' });
  const S2 = ship('1.1+b', [['地图联动规范', 'A2']]);
  let r = await W.autoRun(t.fn, S2, { charKey: 'a', boundChars: ['a'] });
  assert.ok(r.ok && r.wrote); assert.deepEqual(r.plan.retire, ['地图当前地点']);
  const ret = t.B[W.BOOK].find(e => e.extra.eden_id === '地图当前地点');
  assert.equal(ret.enabled, true); assert.equal(ret.position.order, W.RETIRED_ORDER); assert.ok(ret.extra.eden_retired);
  assert.equal(W.plan(t.B[W.BOOK], S2).changed, false);
  r = await W.autoRun(t.fn, ship('1.2+c', [['地图联动规范', 'A2'], ['地图当前地点', 'B1']]), { charKey: 'a', boundChars: ['a'] });
  const back = t.B[W.BOOK].find(e => e.extra.eden_id === '地图当前地点');
  assert.equal(back.position.order, 900); assert.equal(back.extra.eden_retired, undefined);
});

test('「你改过，上游也改了」：保留用户内容、记下上游、标冲突；上游没改只算保留；用户改成和上游一样就收编', async () => {
  const t = fakeTH(); await W.autoRun(t.fn, S1, { charKey: 'a' });
  const e = t.B[W.BOOK].find(x => x.extra.eden_id === '地图当前地点'); e.content = '我的版本（含任意内容，不过滤）';
  const same = ship('1.1+b', [['地图联动规范', 'A1'], ['地图当前地点', 'B1']]);
  assert.deepEqual(W.plan(t.B[W.BOOK], same).keep, ['地图当前地点']); assert.deepEqual(W.plan(t.B[W.BOOK], same).conflict, []);
  const S2 = ship('1.2+c', [['地图联动规范', 'A1'], ['地图当前地点', 'B2']]);
  const r = await W.autoRun(t.fn, S2, { charKey: 'a', boundChars: ['a'] });
  assert.deepEqual(r.plan.conflict, ['地图当前地点']);
  const c = t.B[W.BOOK].find(x => x.extra.eden_id === '地图当前地点');
  assert.equal(c.content, '我的版本（含任意内容，不过滤）'); assert.equal(c.extra.eden_conflict.content, 'B2');
  assert.deepEqual(W.conflicts(t.B[W.BOOK]).map(x => x.name), ['地图当前地点']);
  assert.equal(W.plan(t.B[W.BOOK], S2).changed, false, '冲突标过一次后不重复写');
  c.content = 'B2';   // 用户改成跟上游一样
  await W.autoRun(t.fn, S2, { charKey: 'a', boundChars: ['a'] });
  assert.equal(t.B[W.BOOK].find(x => x.extra.eden_id === '地图当前地点').extra.eden_conflict, undefined);
});

test('别名表：旧编号的条目按新编号合并，不重复建；用户改过的旧条目也保留', () => {
  const old = W.merge([], ship('1.0+a', [['旧编号', 'O1'], ['地图联动规范', 'A1']]));
  const S2 = ship('1.1+b', [['新编号', 'N1'], ['地图联动规范', 'A1']], { 旧编号: '新编号' });
  const p = W.plan(old, S2); assert.deepEqual(p.add, []); assert.deepEqual(p.retire, []); assert.equal(p.alias, 1);
  const m = W.merge(old, S2);
  assert.deepEqual(m.map(e => e.extra.eden_id).sort(), ['地图联动规范', '新编号']); assert.equal(m.find(e => e.extra.eden_id === '新编号').content, 'N1');
  old[0].content = '用户改的';
  const m2 = W.merge(old, S2); assert.equal(m2.find(e => e.extra.eden_id === '新编号').content, '用户改的');
});

test('别名表单一来源：发布物里的 aliases 与 map/data/worldbook_aliases.json 一致；目标都在发布物里，旧编号不再发', async () => {
  const { readFileSync } = await import('node:fs');
  const root = new URL('../map/data/', import.meta.url);
  const src = JSON.parse(readFileSync(new URL('worldbook_aliases.json', root), 'utf8')), shipd = JSON.parse(readFileSync(new URL('worldbook_addon.json', root), 'utf8'));
  assert.deepEqual(shipd.aliases, { ids: src.ids });
  const ids = new Set(shipd.entries.map(e => e.id));
  // 目标是英文点号编号；「天城常识-其他机构」只在 maps.json 有未定位机构时才发，所以不要求目标都在发布物里
  for (const [a, b] of Object.entries(src.ids)) { assert.ok(!ids.has(a), `${a} 还在发`); assert.match(b, /^[a-z0-9][a-z0-9.-]*$/, b); }
  for (const id of ids) assert.match(id, /^[a-z0-9][a-z0-9.-]*$/, `发布编号 ${id} 不是英文点号编号`);
  assert.equal(new Set(Object.values(src.ids)).size, Object.keys(src.ids).length, '两个旧编号指到同一个新编号');
});

test('英文编号迁移（2026-09-28）：旧中文编号的书（含用户改过的一条）→ 新编号，不重复、保留改动与冲突标记，二次同步无操作', async () => {
  const { readFileSync } = await import('node:fs');
  const real = JSON.parse(readFileSync(new URL('../map/data/worldbook_addon.json', import.meta.url), 'utf8'));
  const back = Object.fromEntries(Object.entries(real.aliases.ids).map(([a, b]) => [b, a]));
  // 旧书：同样的条目，但编号是旧的中文编号、旧版本标记
  const oldShip = { ...real, ver: '0.9.5+old', aliases: { ids: {} }, entries: real.entries.map(e => ({ ...e, id: back[e.id] })) };
  assert.ok(oldShip.entries.every(e => typeof e.id === 'string' && /[^\x00-\x7f]/.test(e.id)));
  const t = fakeTH({ [W.BOOK]: W.merge([], oldShip).map((e, i) => ({ ...e, uid: i + 1 })) }, { global: [W.BOOK] });
  const bk = t.B[W.BOOK], n0 = bk.length;
  const ed = bk.find(e => e.extra.eden_id === '地图当前地点'); ed.content = '用户改过的当前地点';
  const cf = bk.find(e => e.extra.eden_id === '地图联动规范'); cf.content = '用户改过的联动规范';
  // 上游也改了联动规范 → 应当带冲突标记
  const S = { ...real, entries: real.entries.map(e => (e.id === 'map.link-rules' ? { ...e, content: e.content + '\n（上游新增）' } : e)) };
  const p = W.plan(t.B[W.BOOK], S);
  assert.deepEqual(p.add, []); assert.deepEqual(p.retire, []); assert.equal(p.alias, n0); assert.equal(p.dup, 0);
  const r = await W.autoRun(t.fn, S, { charKey: 'a', boundChars: ['a'] });
  assert.ok(r.ok && r.wrote);
  const after = t.B[W.BOOK], ids = after.map(e => e.extra.eden_id);
  assert.equal(after.length, n0); assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), real.entries.map(e => e.id).sort());
  const cur = after.find(e => e.extra.eden_id === 'map.current-location');
  assert.equal(cur.content, '用户改过的当前地点'); assert.equal(cur.uid, ed.uid); assert.equal(cur.name, ed.name);
  const link = after.find(e => e.extra.eden_id === 'map.link-rules');
  assert.equal(link.content, '用户改过的联动规范'); assert.ok(link.extra.eden_conflict); assert.equal(link.uid, cf.uid);
  assert.deepEqual(W.conflicts(after).map(x => x.name), [cf.name]);
  // 条目名（用户 / 模型看得到的）不变
  for (const e of real.entries) assert.equal(after.find(x => x.extra.eden_id === e.id).name, e.name);
  // 二次同步：无操作
  const snap = clone(after), w0 = t.writes.length;
  const p2 = W.plan(after, S); assert.equal(p2.changed, false); assert.equal(p2.alias, 0);
  const r2 = await W.autoRun(t.fn, S, { charKey: 'a', boundChars: ['a'] });
  assert.ok(r2.ok); assert.ok(!r2.wrote); assert.equal(t.writes.length, w0); assert.deepEqual(t.B[W.BOOK], snap);
});

test('每聊天版本提醒：新聊天不提醒，版本变了提醒', () => {
  assert.equal(W.chatReminder(undefined, '1.0'), false);
  assert.equal(W.chatReminder('1.0', '1.0'), false);
  assert.equal(W.chatReminder('0.9', '1.0'), true);
});

test('withLock：拿不到锁就跳过这一轮；没有锁接口直接跑', async () => {
  assert.equal(await W.withLock('x', () => 1, {}), 1);
  const nav = { locks: { request: (n, o, f) => f(null) } };
  assert.deepEqual(await W.withLock('x', () => 1, nav), { ok: false, reason: 'busy' });
});
