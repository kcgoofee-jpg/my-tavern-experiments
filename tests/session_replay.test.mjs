// 会话录制回放（Session Replay Fixtures）：SessionSnapshot 导出 / 校验 / 回放的 node 单测。
// 覆盖：夹具契约（validate + text === parseText(raw)）、fromSnapshot 一键恢复（事件 / 人物栏 / 行程两次独立回放
// 逐项一致 = 确定性）、customTags 标签状态恢复后的零重复应用、畸形快照降级（不抛、能救多少救多少）、
// mvu-bridge dumpState 只读导出 + exportSessionSnapshot 组装 → 回放的端到端往返、纯度（全程零宿主全局）。
// 全程无浏览器、无酒馆：除 dumpState 一节桩出全局（与 tests/mvu_bridge.test.mjs 同手法）外，其余测试在裸 node 环境跑。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ContextPipeline, exportSessionSnapshot, validateSessionSnapshot, perFloorStatOf, SNAPSHOT_VERSION } from '../map/tavern/context.mjs';
import { parseText } from '../map/tavern/msgtext.mjs';
import * as EVM from '../map/tavern/events-parse.mjs';
import * as CHM from '../map/tavern/characters-parse.mjs';
import * as TRm from '../map/tavern/trips-parse.mjs';
import { normCustom, rosters as mvuRosters } from '../map/tavern/mvu-readers.mjs';
import { MVUBridge } from '../map/tavern/mvu-bridge.mjs';
import { createLife } from '../map/tavern/host-lifecycle.mjs';

const loadFixture = name => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/sessions/${name}`, import.meta.url)), 'utf8'));
const A = () => loadFixture('session_a.json');   // 每次深拷贝：回放测试不许互相污染
const B = () => loadFixture('session_b.json');

test('夹具契约：validate 通过、text 恰为 parseText(raw)、字段齐备', () => {
  for (const [snap, hasTagState] of [[A(), false], [B(), true]]) {
    const v = validateSessionSnapshot(snap);
    assert.deepEqual(v, { ok: true, errors: [] }, '夹具必须自己先过体检');
    assert.equal(snap.version, SNAPSHOT_VERSION);
    assert.ok(snap.meta.characterId && snap.meta.cardName, 'meta 带角色卡标识');
    assert.ok(snap.mvu && typeof snap.mvu.stat === 'object' && typeof snap.mvu.vars === 'object');
    for (const m of snap.messages) {
      assert.ok(Number.isFinite(m.floor) && ['user', 'assistant', 'system'].includes(m.role));
      assert.equal(m.text, parseText(m.raw ?? m.text), 'text 必须恰为 parseText(raw)（导出口径的诚实性）');
    }
    if (hasTagState) assert.equal(typeof snap.state.tag.floor, 'number');
  }
  assert.ok(A().mvu.floors && '0' in A().mvu.floors, '夹具 A 带每楼变量表（行程回放用）');
});

test('fromSnapshot：一键恢复流水线；事件 / 人物提取两次独立回放逐项一致（确定性）', () => {
  const replay = () => {
    const { pipeline, msgs, degraded } = ContextPipeline.fromSnapshot(A());
    assert.deepEqual(degraded, [], '完好快照零降级');
    const r = pipeline.round({ floorNow: 5, msgs, stSig: '{}', dbSig: '', varSig: 'v', custVer: 0, customChat: 'c', chatId: 'fixture-a',
      seen: -1, wbState: '', hasReg: false, hasCHM: true, hasMV: true, hasTRm: true, hasHereMod: false, hereNow: '中层·霓虹街', collect: EVM.collect,
      charsDeps: { mvuChars: [], known: ['沈青', '白薇'], dbCharacters: [], collectChars: CHM.collectChars,
        rosters: mvuRosters(A().mvu.stat), reputation: null, presentKey: '' } });
    return { msgs, r };
  };
  const a = replay(), b = replay();
  assert.deepEqual(b.r, a.r, '两次独立回放的 round 输出必须逐项一致');
  assert.deepEqual(b.msgs, a.msgs, '规范化楼层也一致');
  // 内容断言：CoT 草稿标签不生效（G1），正文火灾事件开于 2 楼、闭于 5 楼
  assert.ok(!a.msgs[2].text.includes('不应生效'), '思考链里的草稿标签不进解析文本');
  assert.ok(!a.msgs[2].text.includes('UpdateVariable'), '变量更新块剥掉');
  assert.equal(a.r.events.length, 1);
  assert.equal(a.r.events[0].closed, true, '0 级标签把事件解除');
  assert.equal(a.r.events[0].lvl, 0);
  assert.equal(a.r.events[0].text, '明火扑灭，三辆消防车撤离', '合并后以最新楼的描述为准');
  assert.equal(a.r.fresh, 1, 'seen=-1 → 一条未读');
  const byName = Object.fromEntries(a.r.chars.map(c => [c.name, c]));
  assert.equal(byName.沈青?.place, '上层·银冠堡');
  assert.equal(byName.白薇?.place, '中层·霓虹街');
});

test('computeTrips 回放：每楼变量表驱动，签名去重后重复计算不变', () => {
  const { pipeline, msgs } = ContextPipeline.fromSnapshot(A());
  const d = { TRm, CHM, perFloorStat: perFloorStatOf(A()), mvuGet: (s, p) => s?.世界?.当前地点,
    varMap: { location: '世界.当前地点', time: '世界.当前时刻' }, keywords: TRm.DEFAULT_KEYWORDS, fantasy: false, parseTransit: () => null };
  const r1 = pipeline.computeTrips(msgs, d);
  assert.equal(r1.changed, true);
  assert.ok(r1.trips.some(t => !t.who && t.from === '伊甸庄园·书房' && t.to === '中层·霓虹街'), '玩家行程：书房 → 霓虹街（每楼变量表）');
  assert.deepEqual(pipeline.computeTrips(msgs, d).trips, r1.trips, '同输入 → 签名去重，行程不变');
  const { pipeline: P2, msgs: m2 } = ContextPipeline.fromSnapshot(A());
  assert.deepEqual(P2.computeTrips(m2, d).trips, r1.trips, '独立回放的行程逐项一致');
  // 每楼变量表建了但没有那一楼 → null（走原文 JSONPatch 兜底）；没建表 → 整局 stat
  const snap = A(); delete snap.mvu.floors;
  assert.equal(perFloorStatOf(snap)(3)?.世界?.当前地点, '中层·霓虹街', '没建表 → 整局 stat');
  const snap2 = { ...snap, mvu: { ...snap.mvu, floors: { 0: { 世界: { 当前地点: '书房' } } } } };
  assert.equal(perFloorStatOf(snap2)(0)?.世界?.当前地点, '书房');
  assert.equal(perFloorStatOf(snap2)(1), null, '建了表缺那一楼 → null');
});

test('customTags 回放（夹具 B）：标签状态恢复后零重复应用；两次独立回放结果一致', () => {
  const run = () => {
    const { pipeline, msgs, degraded } = ContextPipeline.fromSnapshot(B());
    assert.deepEqual(degraded, []);
    const r = pipeline.customTags(normCustom(null), msgs, 5, () => 'room');
    return { applied: r?.applied ?? [], custom: r?.custom ?? null, tag: r?.tag ?? null };
  };
  const a = run(), b = run();
  assert.deepEqual(b, a, '两次独立回放逐项一致');
  assert.equal(a.applied.length, 2);
  assert.equal(a.custom.items.旧仓库.名, '藏书阁', '⌖改名 应用');
  assert.equal(a.custom.items.旧仓库.用途, '夜里看星图', '⌖用途 应用');
  assert.equal(a.tag.floor, 5);
  // 把跑完的标签状态整块塞回快照 → 恢复后水位已到 5 楼、指纹全对上 → 零重复应用
  const snap = B(); snap.state = { tag: a.tag };
  const { pipeline: P2, msgs: m2 } = ContextPipeline.fromSnapshot(snap);
  assert.equal(P2.customTags(a.custom, m2, 5, () => 'room'), null, '恢复状态后幂等：没有新楼、原文没变');
});

test('畸形 / 损坏快照：降级不抛，能救多少救多少', () => {
  assert.deepEqual(validateSessionSnapshot(null), { ok: false, errors: ['snapshot is not an object'] });
  let out = ContextPipeline.fromSnapshot(null);
  assert.equal(out.msgs.length, 0); assert.ok(out.pipeline); assert.ok(out.degraded.length >= 1);
  out = ContextPipeline.fromSnapshot({ version: 1, messages: 'nope' });
  assert.equal(out.msgs.length, 0); assert.ok(out.degraded.some(e => e.includes('messages')));
  // 坏楼混在好楼里：坏的跳过并记账，好的照常回放
  const snap = A();
  const broken = { ...snap, messages: [{ floor: 'x', text: '坏' }, snap.messages[0], null, { floor: 9 }, { floor: -1, text: '负楼层' }, snap.messages[2]] };
  out = ContextPipeline.fromSnapshot(broken);
  assert.equal(out.msgs.length, 2, '两条好楼照常回放');
  assert.equal(out.msgs[0].floor, 0); assert.equal(out.msgs[1].floor, 2);
  assert.equal(out.degraded.length, 4, '四条坏楼各有记账');
  // 未知版本：体检报错，回放降级放行（向前兼容的宽容口径）
  const oldv = { ...snap, version: 99 };
  assert.ok(validateSessionSnapshot(oldv).errors.some(e => e.includes('version')));
  out = ContextPipeline.fromSnapshot(oldv);
  assert.equal(out.msgs.length, snap.messages.length);
  assert.ok(out.degraded.some(e => e.includes('version')));
  // mvu 段坏了不影响消息回放
  out = ContextPipeline.fromSnapshot({ ...snap, mvu: 'garbage' });
  assert.equal(out.msgs.length, snap.messages.length);
});

// ---- dumpState（桥）+ 端到端往返：桩环境与 tests/mvu_bridge.test.mjs 同手法，跑完彻底还原 ----
function stubEnv({ chat = [], vars = {} } = {}) {
  const hadWin = 'window' in globalThis;
  globalThis.window = globalThis;
  globalThis.__stub = { ls: new Map() };
  globalThis.Mvu = { getMvuData: o => {
    if (o.message_id === 'latest') { const c = chat.at(-1); const v = c?.variables?.[c.swipe_id ?? 0]; return v ? { stat_data: v.stat_data } : null; }
    const c = chat[o.message_id], v = c?.variables?.[c.swipe_id ?? 0]; return v ? { stat_data: v.stat_data } : null; }, events: { VARIABLE_UPDATE_ENDED: 'v' } };
  globalThis.SillyTavern = { getContext: () => ({ name1: 'Tester', chatId: 'chat1', characterId: 0, characters: [{ avatar: 'card.png' }] }), chat };
  globalThis.getVariables = () => JSON.parse(JSON.stringify(vars));
  globalThis.updateVariablesWith = f => f(JSON.parse(JSON.stringify(vars)));
  return () => {
    for (const k of ['Mvu', 'SillyTavern', 'getVariables', 'updateVariablesWith']) { try { delete globalThis[k]; } catch (e) {} }
    delete globalThis.__stub; if (!hadWin) delete globalThis.window;
  };
}
const LS = () => { const m = globalThis.__stub.ls; return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const st = loc => ({ stat_data: { 世界: { 当前地点: loc } } });
const msg = (loc, o = {}) => ({ is_user: false, swipe_id: 0, variables: loc == null ? [] : [st(loc)], ...o });

test('dumpState（桥）：只读导出 stat / vars / 每楼变量表，与 exportSessionSnapshot 组成完整快照并可回放', () => {
  const done = stubEnv({ chat: [msg('伊甸庄园·书房'), msg('伊甸庄园·书房', { is_user: true }), msg('中层·霓虹街')],
    vars: { eden_map: { 标签楼: 2 } } });
  try {
    const Br = new MVUBridge({ life: createLife(), storage: LS, wins: () => [globalThis] });
    const d = Br.dumpState({ floors: [0, 1, 2] });
    assert.equal(d.stat?.世界?.当前地点, '中层·霓虹街', 'stat = 最新楼快照');
    assert.deepEqual(d.vars, { 标签楼: 2 }, 'vars = 聊天变量（A-11）');
    assert.equal(d.floors[0]?.世界?.当前地点, '伊甸庄园·书房'); assert.equal(d.floors[2]?.世界?.当前地点, '中层·霓虹街');
    assert.equal(globalThis.__stub.ls.size, 0, '只读：本机存储零写入');
    // 宿主原始楼层 → exportSessionSnapshot 组装 → fromSnapshot 回放：端到端往返
    const hostMsgs = [
      { message_id: 0, message: '夜色里的伊甸庄园。<UpdateVariable>[{"op":"replace","path":"/世界/当前地点","value":"伊甸庄园·书房"}]</UpdateVariable>', is_user: false },
      { message_id: 1, message: '我走向书架。', is_user: true, is_system: false },
    ];
    const snap = exportSessionSnapshot({ msgs: hostMsgs, ...d, meta: { characterId: 'card.png', cardName: '桩卡' }, tagState: { floor: 1, log: [], seen: {} } });
    assert.equal(snap.version, SNAPSHOT_VERSION);
    assert.equal(snap.messages[0].role, 'assistant'); assert.equal(snap.messages[1].role, 'user');
    assert.ok(!snap.messages[0].text.includes('UpdateVariable'), '导出文本同样剥变量块');
    assert.equal(snap.state.tag.floor, 1);
    const { pipeline, msgs, degraded } = ContextPipeline.fromSnapshot(snap);
    assert.deepEqual(degraded, []);
    assert.equal(msgs.length, 2); assert.equal(msgs[0].floor, 0);
    assert.deepEqual(pipeline.tag, { floor: 1, log: [], seen: {} }, '标签状态机整块恢复');
    assert.deepEqual(Object.fromEntries(Object.entries(perFloorStatOf(snap)(2) ?? {})), { 世界: { 当前地点: '中层·霓虹街' } }, '每楼变量表随快照走');
  } finally { done(); }
});

test('纯度：回放全程零宿主全局依赖——裸 node 里 window / Mvu / SillyTavern 不存在也能完整跑通', () => {
  for (const k of ['window', 'document', 'Mvu', 'SillyTavern']) assert.equal(typeof globalThis[k], 'undefined', `${k} 不应存在（前序桩必须还原干净）`);
  const { pipeline, msgs } = ContextPipeline.fromSnapshot(A());
  const r = pipeline.round({ floorNow: 5, msgs, stSig: '{}', dbSig: '', varSig: 'v', custVer: 0, customChat: 'c', chatId: 'fixture-a',
    seen: -1, wbState: '', hasReg: false, hasCHM: true, hasMV: true, hasTRm: true, hasHereMod: false, hereNow: '中层·霓虹街', collect: EVM.collect,
    charsDeps: { mvuChars: [], known: ['沈青', '白薇'], dbCharacters: [], collectChars: CHM.collectChars, rosters: mvuRosters(A().mvu.stat), reputation: null, presentKey: '' } });
  assert.equal(r.changed, true);
  assert.equal(pipeline.computeTrips(msgs, { TRm, CHM, perFloorStat: perFloorStatOf(A()), mvuGet: (s, p) => s?.世界?.当前地点,
    varMap: { location: '世界.当前地点', time: '世界.当前时刻' }, keywords: TRm.DEFAULT_KEYWORDS, fantasy: false, parseTransit: () => null }).changed, true);
});
