// S6-2：统一背包能从聊天重算（K-R75，agent brief §2.4）：同一串消息，实时折叠（一轮一个 step）与整串重算（recompute + 记录的动作）逐条一致；
// 丢掉存储重算得到同一份；重放（swipe）清掉那一楼的行与槽位事实；reconcile 能报出人为造的偏差；
// 注入行（摘要 + 槽位）对拍冻结的 v1 一轮（tests/helpers/loot_round_v1_frozen.mjs），只有 docs/plans/steps/S6-2.md §9 列出的差异。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../map/tavern/stash-store.mjs';
import * as R from '../map/tavern/stash-recompute.mjs';
import * as P from '../map/core/pickup.mjs';
import * as W from '../map/core/stash.mjs';
import { slotProbe, slotLine } from '../map/core/ledger.mjs';
import { newState, v1Round, v1Take, v1Lines } from './helpers/loot_round_v1_frozen.mjs';
import * as V1 from './helpers/stash_store_v1_frozen.mjs';

const STREAM = JSON.parse(readFileSync(new URL('./fixtures/sessions/stash_stream.json', import.meta.url), 'utf8'));
const WORLD = W.normStash({ items: STREAM.world }).items;
const WORLD_NAMES = WORLD.map(r => r.name);
const probe = slotProbe({});   // 卡里没有背包栏：虚拟槽位

/** stash-flow 一轮做的事（同样的调用）：折叠本轮窗口 + 地图拾取的槽位事实晚一轮入账；动作经同样的 put / remove */
function liveFlow() {
  let stash = S.empty(0);
  const win = new Map(), lootFacts = [];
  return {
    get stash() { return stash; },
    round(m) {
      win.set(m.msgIndex, m);
      stash = R.step(stash, [...win.values()], { worldNames: WORLD_NAMES, probe }).stash;
      const late = R.mapFactRows(stash, lootFacts);
      if (late.length) stash = { ...stash, slot: R.captureSlot(stash, late, probe, m.msgIndex) };
    },
    act(a) {
      if (a.kind === 'take') {
        const row = WORLD.find(r => r.id === a.id);
        stash = S.put(stash, { ...W.lootPut(row), node: row.node || row.marker || '', src: 'map', carried: true, msgIndex: a.at }).stash;
        lootFacts.push({ kind: 'loot', id: row.id, name: row.name, place: row.place, map: row.map, hidden: !!row.hidden, qty: row.qty || 1, floor: a.at, authority: 'verified' });
      } else if (a.kind === 'setInv') stash = S.put(stash, { name: a.name, ...a.patch, src: 'api', msgIndex: a.at }).stash;
      else if (a.kind === 'removeInv') stash = S.remove(stash, a.key, a.at).stash;
    },
    messages() { return [...win.values()].sort((x, y) => x.msgIndex - y.msgIndex); },
  };
}
/** 整条流：返回每轮之后的状态快照 */
function runStream() {
  const live = liveFlow(), trace = [];
  STREAM.messages.forEach((m, round) => {
    live.round(m);
    for (const a of STREAM.actions.filter(x => x.at === round)) live.act(a);
    trace.push({ round, stash: live.stash, msgs: live.messages().map(x => ({ ...x })) });
  });
  return { live, trace };
}
const rowsOf = st => Object.fromEntries(Object.entries(st.items).map(([id, r]) => [id, { ...r }]));

test('每轮的扫描结果与今天的拾取探测一致（夹具自检）', () => {
  const names = STREAM.messages.map(m => P.names(m.text, { known: WORLD_NAMES }));
  assert.deepEqual(names, [[], ['黄铜钥匙'], ['银怀表'], [], [], ['旧地图'], ['锈迹斑斑的黄铜钥匙'], [], [], ['银怀表'], ['sword'], []]);
});

test('(a) 实时折叠 = 整串重算（逐条一致，地点也比），reconcile ok', () => {
  const { live } = runStream();
  const st = live.stash, msgs = live.messages();
  const rc = R.recompute(msgs, { since: 0, actions: R.actionsOf(st), worldNames: WORLD_NAMES, probe });
  assert.deepEqual(rowsOf(rc), rowsOf(st), '同样的 id、同样的字段');
  assert.deepEqual(rc.slot, st.slot, '槽位声明与事实一致');
  const r = R.reconcile(st, rc, { comparePlace: true });
  assert.deepEqual(r, { ok: true, missing: [], extra: [], changed: [] });
  // 流里确实走到了每一条通道：正文行、地图行、接口行
  assert.deepEqual(Object.values(st.items).map(x => x.src).sort(), ['api', 'map', 'text', 'text', 'text', 'text']);
});

test('(a) 每一轮之后都一致（地图拾取的槽位事实晚一轮入账，其余同轮）', () => {
  const { trace } = runStream();
  for (const t of trace) {
    const rc = R.recompute(t.msgs, { since: 0, actions: R.actionsOf(t.stash), worldNames: WORLD_NAMES, probe });
    const rr = R.reconcile(t.stash, rc, { comparePlace: true });
    const lag = rr.changed.length === 0 && rr.extra.length === 0 && rr.missing.every(x => x.startsWith('slot:'));   // 只差一条晚入账的地图槽位事实
    assert.ok(rr.ok || lag, `第 ${t.round} 轮：${JSON.stringify(rr)}`);
    assert.deepEqual(rowsOf(rc), rowsOf(t.stash), `第 ${t.round} 轮的行`);
  }
});

test('(b) 丢掉存储重算 = 同一份（只靠消息与记录的动作）', () => {
  const { live } = runStream();
  const once = R.recompute(live.messages(), { since: 0, actions: R.actionsOf(live.stash), worldNames: WORLD_NAMES, probe });
  const twice = R.recompute(live.messages(), { since: 0, actions: R.actionsOf(once), worldNames: WORLD_NAMES, probe });
  assert.deepEqual(rowsOf(twice), rowsOf(live.stash));
  assert.deepEqual(twice.slot, live.stash.slot);
  assert.equal(S.digestLine(twice), S.digestLine(live.stash));
});

test('(c) 第 11 轮 swipe：第 10 楼换了正文，sword 行与它的槽位事实都没了；其余不动', () => {
  const { trace } = runStream();
  const before = trace[10].stash, after = trace[11].stash;
  const sword = Object.entries(before.items).find(([, r]) => r.name === 'sword');
  assert.ok(sword, '换之前有 sword');
  assert.ok(before.slot.facts[sword[0]], '换之前槽位有它');
  assert.equal(Object.values(after.items).some(r => r.name === 'sword'), false);
  assert.equal(after.slot.facts[sword[0]], undefined);
  assert.deepEqual(Object.keys(after.items), Object.keys(before.items).filter(id => id !== sword[0]), '别的行一条没动');
});

test('(d) 第 0–10 轮的注入行（摘要 + 槽位）与冻结的 v1 一轮逐字相同，只有第 9 轮起「银怀表回来了」一处差异（§9 (b)）', () => {
  const v1 = newState(), live = liveFlow(), win = new Map();
  const diffs = [];
  STREAM.messages.slice(0, 11).forEach((m, round) => {
    live.round(m);
    v1Round(v1, { text: m.text, msgIndex: m.msgIndex, place: m.place, worldRows: WORLD, probe });
    for (const a of STREAM.actions.filter(x => x.at === round)) {
      live.act(a);
      if (a.kind === 'take') v1Take(v1, WORLD.find(r => r.id === a.id), a.at);
      else if (a.kind === 'setInv') v1.inv = V1.put(v1.inv, { name: a.name, ...a.patch }).inv;
      else if (a.kind === 'removeInv') v1.inv = V1.remove(v1.inv, a.key).inv;
    }
    const want = v1Lines(v1);
    const got = { digest: S.digestLine(live.stash, 150), slot: slotLine(live.stash.slot) };
    if (round < 9) assert.deepEqual(got, want, `第 ${round} 轮`);
    else {
      assert.equal(got.slot, want.slot, `第 ${round} 轮槽位行`);
      // 去掉回来的那一条再比
      const wo = S.digestLine({ ...live.stash, items: Object.fromEntries(Object.entries(live.stash.items).filter(([, r]) => !(r.name === '银怀表' && r.msgIndex === 9))) }, 150);
      assert.equal(wo, want.digest, `第 ${round} 轮摘要（不含回来的银怀表）`);
      diffs.push(got.digest !== want.digest);
    }
    win.set(m.msgIndex, m);
  });
  assert.deepEqual(diffs, [true, true], '第 9、10 轮摘要里多了回来的「银怀表」（v1 在会话里把它挡住了）');
});

test('(e) reconcile 报出人为造的偏差：extra / missing / changed', () => {
  const { live } = runStream();
  const st = live.stash, rc = R.recompute(live.messages(), { since: 0, actions: R.actionsOf(st), worldNames: WORLD_NAMES, probe });
  const ids = Object.keys(st.items);
  const gone = { ...st, items: Object.fromEntries(Object.entries(st.items).filter(([id]) => id !== ids[0])) };
  assert.deepEqual(R.reconcile(gone, rc).missing, [ids[0]]);
  const extra = { ...st, items: { ...st.items, i99: { ...st.items[ids[0]], name: '幽灵' } } };
  assert.deepEqual(R.reconcile(extra, rc).extra, ['i99']);
  const changed = { ...st, items: { ...st.items, [ids[1]]: { ...st.items[ids[1]], qty: 7, place: '别处' } } };
  assert.deepEqual(R.reconcile(changed, rc).changed, [{ id: ids[1], fields: ['qty'] }]);
  assert.deepEqual(R.reconcile(changed, rc, { comparePlace: true }).changed, [{ id: ids[1], fields: ['qty', 'place'] }]);
  const slotOff = { ...st, slot: { ...st.slot, facts: Object.fromEntries(Object.entries(st.slot.facts).slice(1)) } };
  assert.equal(R.reconcile(slotOff, rc).ok, false);
  assert.ok(R.reconcile(slotOff, rc).missing.every(x => x.startsWith('slot:')));
});

test('折叠的细节：首次扫描对齐最新一楼；起点之前的楼不扫；最新一楼每轮重扫（swipe 后换了内容）；窗口里同一楼不重复入账', () => {
  const msgs = [{ msgIndex: 3, text: '他拿到钥匙。', place: 'A' }, { msgIndex: 4, text: '她捡到一枚银怀表。', place: 'B' }];
  const a = R.step(null, msgs, { probe });   // 没有起点：对齐最新一楼（4），3 不扫
  assert.deepEqual(Object.values(a.stash.items).map(r => r.name), ['银怀表']);
  assert.equal(a.stash.since, 4);
  const again = R.step(a.stash, msgs, { probe });
  assert.equal(again.changed, false, '同样的窗口再来一轮：没有变化');
  const swiped = R.step(again.stash, [msgs[0], { msgIndex: 4, text: '她捡到一把铜钥匙。', place: 'B' }], { probe });   // 最新一楼换成别的内容（该楼的行重放）
  assert.deepEqual(Object.values(swiped.stash.items).map(r => r.name), ['铜钥匙']);
  // 起点为 0：窗口里没扫过的楼都扫（宿主一轮漏了几楼）
  const skipped = R.step(S.empty(0), [{ msgIndex: 1, text: '他拿到钥匙。', place: 'A' }, { msgIndex: 2, text: '她捡到一枚银怀表。', place: 'B' }], { probe });
  assert.deepEqual(Object.values(skipped.stash.items).map(r => r.msgIndex), [1, 2]);
});
