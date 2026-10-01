// 世界书附加条目写入 / 自动同步（map/tavern/worldbook-sync.mjs）：假的酒馆助手世界书接口，记下每一次写调用，断言只写我们自己那一本。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as W from '../map/tavern/worldbook-sync.mjs';
import { worldbookPrefix } from '../map/core/pack.mjs';
// 书名前缀取自包清单（S4-3）：这些测试跑的是第一个包，宿主读到它的清单后就是这样配的
W.setPrefix(worldbookPrefix(JSON.parse(readFileSync(new URL('../map/packs/eden/manifest.json', import.meta.url), 'utf8')), 'eden'));

import * as F from './helpers/s43_frozen.mjs';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const clone = o => JSON.parse(JSON.stringify(o));
const ship = (ver, ents) => ({ book: W.BOOK, version: ver, ver, entries: ents.map(([id, content, name]) => ({ id, name: name || id, enabled: true, content, strategy: { type: 'constant', keys: [] }, position: { type: 'after_character_definition', order: 900 } })) });

function fakeTH(books = {}, bind = {}) {
  const B = clone(books), writes = [], G = { global: [...(bind.global || [])], char: { primary: bind.charPrimary ?? null, additional: [...(bind.char || [])] }, chat: bind.chat ?? null };
  let uid = 100; const withUid = l => l.map(e => ({ uid: e.uid ?? uid++, ...e }));
  const w = (n, name, f) => (...a) => { writes.push([n, name(a)]); return f(...a); };
  const api = {
    getWorldbookNames: () => Object.keys(B),
    getWorldbook: n => { if (!B[n]) throw new Error('no book'); return clone(B[n]); },
    createWorldbook: w('createWorldbook', a => a[0], (n, l) => { if (B[n]) return false; B[n] = withUid(clone(l)); return true; }),
    updateWorldbookWith: w('updateWorldbookWith', a => a[0], async (n, f) => { B[n] = withUid(clone(await f(clone(B[n])))); return B[n]; }),
    replaceWorldbook: w('replaceWorldbook', a => a[0], (n, l) => { B[n] = withUid(clone(l)); }),
    deleteWorldbook: w('deleteWorldbook', a => a[0], n => { delete B[n]; return true; }),
    getGlobalWorldbookNames: () => [...G.global], rebindGlobalWorldbooks: w('rebindGlobalWorldbooks', () => '*global', l => { G.global = [...l]; }),
    getCharWorldbookNames: () => clone(G.char), rebindCharWorldbooks: w('rebindCharWorldbooks', () => '*char', (c, v) => { G.char = clone(v); }),
    getChatWorldbookName: () => G.chat, rebindChatWorldbook: w('rebindChatWorldbook', () => '*chat', (c, n) => { G.chat = n; }),
  };
  return { fn: n => (typeof api[n] === 'function' ? api[n] : null), B, G, writes, api };
}
const written = t => [...new Set(t.writes.map(x => x[1]))];
const OTHER = { '卡自带世界书': [{ uid: 1, name: '设定', content: '原作', enabled: true }] };

test('第一次写入：没同意不写；同意后新建我们的书并按用户的选择绑定；其它书不动', async () => {
  const t = fakeTH(OTHER), S = ship('1.0+a', [['地图联动规范', 'A1'], ['地图当前地点', 'B1']]);
  let r = await W.sync(t.fn, S, {});
  assert.equal(r.ok, false); assert.equal(r.reason, 'consent'); assert.equal(t.writes.length, 0);
  assert.ok(r.plan.first); assert.deepEqual(r.plan.add, ['地图联动规范', '地图当前地点']);
  r = await W.sync(t.fn, S, { consent: true, where: 'global' });
  assert.ok(r.ok); assert.equal(r.bound, 'global');
  assert.deepEqual(t.G.global, [W.BOOK]);
  assert.deepEqual(t.B['卡自带世界书'], OTHER['卡自带世界书']);
  assert.deepEqual(written(t), [W.BOOK, '*global']);
  assert.equal(W.installedVer(t.B[W.BOOK]), '1.0+a');
  // 自动同步不替用户新建书
  const t2 = fakeTH(); assert.equal((await W.sync(t2.fn, S, { consent: true, auto: true })).reason, 'missing'); assert.equal(t2.writes.length, 0);
});

test('更新：按稳定编号对应；用户改过的条目、用户自己的条目、用户关掉的开关都保留；不再发的降优先级不删；差异如实', async () => {
  const t = fakeTH(OTHER, { global: ['别的书', W.BOOK] });
  await W.sync(t.fn, ship('1.0+a', [['地图联动规范', 'A1', '地图联动规范 v2'], ['地图当前地点', 'B1'], ['旧条目', 'X1'], ['地图事件类型', 'E1']]), { consent: true });
  const bk = t.B[W.BOOK];
  bk.find(e => e.extra.eden_id === '地图当前地点').content = 'B1 + 用户补充';      // 用户改了内容
  bk.find(e => e.extra.eden_id === '地图事件类型').enabled = false;                   // 用户关了一条
  bk.push({ uid: 999, name: '我自己的笔记', content: '私人', enabled: true });          // 用户自己加的
  const uidA = bk.find(e => e.extra.eden_id === '地图联动规范').uid;
  const S2 = ship('1.1+b', [['地图联动规范', 'A2', '地图联动规范 v3'], ['地图当前地点', 'B2'], ['地图事件类型', 'E2'], ['地图人物位置', 'P1']]);
  const st = await W.inspect(t.fn, S2);
  assert.deepEqual({ from: st.plan.from, to: st.plan.to, add: st.plan.add, update: st.plan.update, keep: st.plan.keep, conflict: st.plan.conflict, retire: st.plan.retire, user: st.plan.user },
    { from: '1.0+a', to: '1.1+b', add: ['地图人物位置'], update: ['地图联动规范 v3', '地图事件类型'], keep: [], conflict: ['地图当前地点'], retire: ['旧条目'], user: 1 });   // 用户改过 + 上游也改了 = 冲突
  t.writes.length = 0;
  const r = await W.sync(t.fn, S2, { consent: true, auto: true });
  assert.ok(r.ok); assert.deepEqual(written(t), [W.BOOK]);   // 已绑定全局：绑定不动
  const by = id => t.B[W.BOOK].find(e => e.extra?.eden_id === id);
  assert.equal(by('地图联动规范').content, 'A2'); assert.equal(by('地图联动规范').name, '地图联动规范 v3'); assert.equal(by('地图联动规范').uid, uidA);
  assert.equal(by('地图当前地点').content, 'B1 + 用户补充');
  assert.equal(by('地图事件类型').content, 'E2'); assert.equal(by('地图事件类型').enabled, false);
  assert.equal(by('旧条目').enabled, true); assert.equal(by('旧条目').position.order, W.RETIRED_ORDER); assert.equal(by('旧条目').extra.eden_order, 900);   // 退役：降优先级，不停用不删
  assert.equal(by('地图当前地点').extra.eden_conflict.content, 'B2');
  assert.ok(by('地图人物位置'));
  assert.ok(t.B[W.BOOK].some(e => e.name === '我自己的笔记' && e.content === '私人'));
  assert.deepEqual(t.G.global, ['别的书', W.BOOK]);
  assert.deepEqual(t.B['卡自带世界书'], OTHER['卡自带世界书']);
  // 再同步一次：没有变化，不写
  t.writes.length = 0; const r2 = await W.sync(t.fn, S2, { consent: true, auto: true });
  assert.ok(r2.ok); assert.equal(r2.plan.changed, false); assert.equal(t.writes.length, 0);
});

test('绑定保持：已绑在角色 / 聊天上就不再问、不再改', async () => {
  for (const [bind, where] of [[{ char: [W.BOOK] }, 'char'], [{ chat: W.BOOK }, 'chat']]) {
    const t = fakeTH({ [W.BOOK]: [] }, bind);
    const st = await W.inspect(t.fn, ship('1+a', [['x', '1']])); assert.equal(st.where, where);
    t.writes.length = 0; const r = await W.sync(t.fn, ship('1+a', [['x', '1']]), { consent: true, where: 'global' });
    assert.equal(r.bound, where); assert.deepEqual(written(t), [W.BOOK]);
  }
});

test('旧的带版本号的书：迁移时把它的绑定换成稳定名（位置不变），旧书留着；删旧书只认带版本号的名字', async () => {
  const old = '伊甸地图·世界书附加条目 v0.9.5';
  const t = fakeTH({ [old]: [{ uid: 1, name: '地图联动规范 v2', content: '旧', enabled: true }], ...OTHER }, { global: ['A', old, 'B'], char: [old] });
  assert.deepEqual(await W.findLegacy(t.fn), [old]);
  const r = await W.sync(t.fn, ship('1+a', [['地图联动规范', 'N']]), { consent: true, migrate: old });
  assert.ok(r.ok); assert.deepEqual(t.G.global, ['A', W.BOOK, 'B']); assert.deepEqual(t.G.char.additional, [W.BOOK]);
  assert.ok(t.B[old], '旧书默认保留');
  assert.equal(await W.deleteLegacy(t.fn, '卡自带世界书'), false); assert.ok(t.B['卡自带世界书']);
  assert.equal(await W.deleteLegacy(t.fn, W.BOOK), false); assert.ok(t.B[W.BOOK]);
  assert.equal(await W.deleteLegacy(t.fn, old), true); assert.ok(!t.B[old]);
});

test('撤销：removeBook 只删我们自己的书；没有删接口时不动', async () => {
  const t = fakeTH({ [W.BOOK]: [{ uid: 1, name: 'x', content: 'y', enabled: true }], ...OTHER });
  assert.equal(await W.removeBook(t.fn), true); assert.ok(!t.B[W.BOOK]); assert.ok(t.B['卡自带世界书']);
  const t2 = fakeTH({ [W.BOOK]: [] });
  const noDel = n => (n === 'deleteWorldbook' ? undefined : t2.fn(n));
  assert.equal(await W.removeBook(noDel), false);
});

test('离线 / 失败 / 没接口：不抛，给出原因（界面回退到手动导入）', async () => {
  const t = fakeTH();
  assert.equal((await W.sync(t.fn, null, { consent: true })).reason, 'offline');
  assert.equal((await W.sync(() => null, ship('1+a', [['x', '1']]), { consent: true })).reason, 'noapi');
  t.api.createWorldbook = () => { throw new Error('disk full'); };
  const r = await W.sync(t.fn, ship('1+a', [['x', '1']]), { consent: true, where: 'global' });
  assert.equal(r.ok, false); assert.equal(r.reason, 'error'); assert.deepEqual(t.G.global, []);
});

test('发布物 map/data/worldbook_addon.json 与生成器同步（改了地点忘了 --ship 会在这里挡住）', { timeout: 120000 }, () => {
  const cur = JSON.parse(readFileSync(join(ROOT, 'map/data/worldbook_addon.json'), 'utf8'));
  assert.equal(cur.book, W.BOOK); assert.ok(cur.entries.length >= 4);
  const ids = cur.entries.map(e => e.id); assert.equal(new Set(ids).size, ids.length, '稳定编号不重复');
  assert.ok(ids.every(i => !/\sv\d+$/.test(i)), '编号不带版本后缀');
  const d = mkdtempSync(join(tmpdir(), 'ship-'));
  try {
    const r = spawnSync('python3', ['tools/build_worldbook_addon.py', '--ship', '--out', join(d, 'x.json')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, EDEN_SHIP_OUT: join(d, 's.json') } });
    assert.equal(r.status, 0, r.stderr);
    const fresh = JSON.parse(readFileSync(join(d, 's.json'), 'utf8'));
    assert.deepEqual(fresh.entries, cur.entries, '重新跑 python3 tools/build_worldbook_addon.py --ship');
    assert.deepEqual(fresh.aliases, cur.aliases, '别名表改了要重新 --ship');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('S4-3：书名前缀来自清单——第一个包的 PREFIX / BOOK / LEGACY_RE 与以前的常量逐字相同；别的包用自己的名字；没配前缀是中性默认', async () => {
  const man = JSON.parse(readFileSync(new URL('../map/packs/eden/manifest.json', import.meta.url), 'utf8'));
  assert.equal(man.worldbook.prefix, '伊甸地图');
  W.setPrefix(worldbookPrefix(man, 'eden'));
  assert.equal(W.PREFIX, F.PREFIX); assert.equal(W.BOOK, F.BOOK); assert.equal(W.LEGACY_RE.source, F.LEGACY_RE.source); assert.equal(W.LEGACY_RE.flags, F.LEGACY_RE.flags);
  assert.ok(W.LEGACY_RE.test('伊甸地图·世界书附加条目 v0.9.5') && !W.LEGACY_RE.test(W.BOOK) && !W.LEGACY_RE.test('雾港镇·世界书附加条目 v1.0'));
  const town = JSON.parse(readFileSync(new URL('../map/packs/town/manifest.json', import.meta.url), 'utf8'));
  try {
    W.setPrefix(worldbookPrefix(town, 'town'));   // 没有 worldbook.prefix：包标题
    assert.equal(W.BOOK, town.title + '·世界书附加条目'); assert.ok(W.LEGACY_RE.test(town.title + '·世界书附加条目 v2')); assert.ok(!W.LEGACY_RE.test('伊甸地图·世界书附加条目 v0.9.5'));
    W.setPrefix('a.b(c)');   // 前缀里的正则字符只当字面
    assert.ok(W.LEGACY_RE.test('a.b(c)·世界书附加条目 v1')); assert.ok(!W.LEGACY_RE.test('aXb(c)·世界书附加条目 v1'));
    assert.equal(W.setPrefix('  '), W.BOOK);   // 空前缀不改
  } finally { W.setPrefix('伊甸地图'); }
  assert.equal(worldbookPrefix(null, 'p'), 'p'); assert.equal(worldbookPrefix({ title: 'T' }, 'p'), 'T'); assert.equal(worldbookPrefix({ title: 'T', worldbook: { prefix: 'X' } }, 'p'), 'X');
});
