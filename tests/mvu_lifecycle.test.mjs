// W11 VARIABLE_UPDATE_ENDED 结算时序守卫（map/tavern/settlement-guard.mjs + mvu-bridge.markVarUpdate）：
// 地图侧的写入（账本补发 / 空间状态对账）只在同一轮末尾放行——读取期间不写变量、不落在主 MVU 的更新窗口里；
// MVU 不在场立刻执行（不死等事件）；同键去重；换聊天丢弃；嵌套请求有上限；单个回调抛错不连坐。
// 见 docs/plans/llm-campaign.md §W11；夹具全中性合成数据。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as V from '../map/tavern/settlement-guard.mjs';
import * as L from '../map/core/ledger.mjs';
import * as INV from '../map/tavern/stash-store.mjs';
import { createLife } from '../map/tavern/host-lifecycle.mjs';

const src = () => readFileSync(fileURLToPath(new URL('../map/tavern/settlement-guard.mjs', import.meta.url)), 'utf8');

test('MVU 不在场：请求立刻执行（没有争抢对象，不死等一个永远不来的事件）', () => {
  const gate = V.createGate({ hasMvu: () => false });
  const log = [];
  assert.deepEqual(gate.request('sync', () => log.push('write')), { ran: 1, staged: 0, why: 'no-mvu' });
  assert.deepEqual(log, ['write']);
  assert.equal(gate.pending(), 0);
  assert.deepEqual(gate.request('sync', null), { ran: 0, staged: 0, why: 'noop' });
});

test('MVU 在场：请求先入队，只有 flush 才执行——读取期间绝不写变量', () => {
  const gate = V.createGate({ hasMvu: () => true });
  const log = [];
  assert.deepEqual(gate.request('sync', () => log.push('write')), { ran: 0, staged: 1, why: 'deferred' });
  assert.deepEqual(log, []);
  assert.equal(gate.state(), 'staged');
  assert.deepEqual(gate.flush('round'), { ran: 1, passes: 1, reason: 'round', epoch: 0, pending: 0 });
  assert.deepEqual(log, ['write']);
  assert.equal(gate.state(), 'idle');
  assert.deepEqual(gate.flush('round'), { ran: 0, passes: 0, reason: 'round', epoch: 0, pending: 0 });   // 空队列再放行 = 空转
  assert.equal(gate.flush('乱值').reason, 'manual');                   // 未知原因归到 manual，不改行为
});

test('同键去重：同一个补发请求只留一条，后来者替换（幂等的单项 patch 不重复排队）', () => {
  const gate = V.createGate({ hasMvu: () => true });
  const log = [];
  gate.request('assets:i1', () => log.push('old'));
  gate.request('assets:i1', () => log.push('new'));
  gate.request('assets:i2', () => log.push('i2'));
  assert.deepEqual(gate.keys(), ['assets:i1', 'assets:i2']);
  gate.flush('ended');
  assert.deepEqual(log, ['new', 'i2']);                                 // 保序 + 替换
  assert.equal(gate.describe().ran, 2);
});

test('放行期间新入队的请求也在同一轮里跑完（嵌套），但有上限 maxPasses', () => {
  const gate = V.createGate({ hasMvu: () => true, maxPasses: 3 });
  const log = [];
  gate.request('a', () => { log.push('a'); gate.request('a2', () => log.push('a2')); });
  const r = gate.flush('ended');
  assert.deepEqual(log, ['a', 'a2']);
  assert.equal(r.passes, 2);
  const runaway = V.createGate({ hasMvu: () => true, maxPasses: 2 });
  let n = 0;
  const again = () => { n++; runaway.request('loop', again); };
  runaway.request('loop', again);
  const rr = runaway.flush('ended');
  assert.equal(n, 2);                                                   // 自我续命也被 maxPasses 截断
  assert.equal(rr.pending, 1);
  runaway.drop('manual');
  assert.equal(runaway.pending(), 0);
});

test('换聊天 / 接管：drop 丢弃未放行的请求，绝不把上一场的补发写进新聊天', () => {
  const gate = V.createGate({ hasMvu: () => true });
  const log = [];
  gate.request('a', () => log.push('a'));
  gate.request('b', () => log.push('b'));
  assert.equal(gate.drop('chat'), 2);
  assert.deepEqual(log, []);
  assert.equal(gate.state(), 'idle');
  assert.equal(gate.describe().dropped, 2);
  gate.request('c', () => log.push('c'));
  gate.flush('ended');
  assert.deepEqual(log, ['c']);
});

test('单条回调抛错不连坐：其余照跑，错误计数进摘要', () => {
  const gate = V.createGate({ hasMvu: () => true });
  const log = [];
  gate.request('bad', () => { throw new Error('boom'); });
  gate.request('good', () => log.push('good'));
  gate.flush('ended');
  assert.deepEqual(log, ['good']);
  const d = gate.describe();
  assert.deepEqual([d.errors, d.ran, d.pending, d.state], [1, 1, 0, 'idle']);
});

test('时序契约：VARIABLE_UPDATE_ENDED 处理器按 invalidate → push → recompute → flush 排序，写入排在事件收尾之后', () => {
  assert.deepEqual(V.ROUND_ORDER, ['invalidate', 'push', 'recompute', 'flush']);
  const bridge = { epoch: 0, markVarUpdate() { this.epoch += 1; return this.epoch; } };   // 桥的代数水位桩
  const gate = V.createGate({ hasMvu: () => true, epoch: () => bridge.epoch });
  const log = [];
  // 宿主事件处理器的实际形状（eden-map.js）：作废快照 + 落代数 → 推送 → 重算（读取）→ 本轮末尾放行
  function onVarUpdateEnded() {
    bridge.markVarUpdate(); log.push('invalidate');
    log.push('push');
    log.push('recompute-read');
    gate.request('sync', () => log.push('write'));
    gate.flush('ended');
  }
  onVarUpdateEnded();
  assert.deepEqual(log, ['invalidate', 'push', 'recompute-read', 'write']);   // 写一定在事件收尾与整轮读取之后
  assert.equal(gate.describe().last.epoch, 1);                               // 放行时记到的代数 = 已经过了一次 ENDED
  log.length = 0;
  gate.request('sync2', () => log.push('w2'));
  assert.deepEqual(log, []);                                                 // 事件之外发起：仍然要等放行点
  gate.flush('ended');
  assert.deepEqual(log, ['w2']);
});

test('端到端：漏项审计 → 入队 → 放行后按单项 patch 补进仓库（同键不再重发）', () => {
  const gate = V.createGate({ hasMvu: () => true });
  const state = { claimed: [], floor: null };
  let inv = { items: {}, seq: 0 };
  const facts = [{ kind: 'loot', id: 'i1', name: '账本', place: '书房', floor: 42 }];
  const landed = () => ({ assets: Object.fromEntries(Object.entries(inv.items).map(([id, e]) => [id, e.名])) });
  const sync = () => {
    const cl = L.claim(state, L.audit(facts, landed()).patches, { floor: 42 });
    for (const p of cl.fresh) { const r = INV.put(inv, { id: p.id, name: p.name, place: p.place }); inv = r.inv; }
    return cl.fresh.length;
  };
  assert.deepEqual(gate.request('sync', sync), { ran: 0, staged: 1, why: 'deferred' });
  assert.deepEqual(Object.keys(inv.items), []);                 // 放行前一个字节都没写
  gate.flush('ended');
  assert.deepEqual(Object.keys(inv.items), ['i1']);              // 补齐的正是缺的那一件（整表结构不变）
  assert.equal(inv.items.i1.名, '账本');
  gate.request('sync', sync);
  gate.flush('ended');
  assert.deepEqual(Object.keys(inv.items), ['i1']);              // 已落盘 + 水位：不重复写
  assert.equal(state.claimed.length, 1);
});

test('时序注册：结算处理器排在所有同事件处理器之后（eventMakeLast 优先，没有就退回 eventOn）', () => {
  const on = [], last = [], off = [];
  const hadWin = 'window' in globalThis; if (!hadWin) globalThis.window = globalThis;   // fnOk/thFn 读 window[n]
  globalThis.eventOn = (ev) => { on.push(ev); return ev + '#h'; };
  globalThis.eventMakeLast = ev => { last.push(ev); return { stop: () => off.push('last:' + ev) }; };
  globalThis.eventRemoveListener = (ev, fn, h) => off.push(h);
  try {
    const life = createLife();
    life.listen('A', () => {});
    life.listen('VARIABLE_UPDATE_ENDED', () => {}, true);
    assert.deepEqual(on, ['A']);                              // 普通事件仍走 eventOn
    assert.deepEqual(last, ['VARIABLE_UPDATE_ENDED']);        // 结算走 eventMakeLast：晚于别人的写
    life.unlisten();
    assert.deepEqual(off, ['A#h', 'last:VARIABLE_UPDATE_ENDED']);
    delete globalThis.eventMakeLast;                          // 宿主没有这个接口：退回 eventOn，语义不变
    const life2 = createLife(); life2.listen('B', () => {}, true);
    assert.deepEqual(on, ['A', 'B']);
  } finally { delete globalThis.eventOn; delete globalThis.eventMakeLast; delete globalThis.eventRemoveListener; if (!hadWin) delete globalThis.window; }
});

test('模块纯度：纯状态机——不碰酒馆全局 / DOM / 存储 / 定时器；单文件 ≤400 行', () => {
  const raw = src();
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /\b(window|document|localStorage|sessionStorage|fetch|Mvu|SillyTavern|setTimeout|setInterval)\b/);
  assert.ok(raw.split('\n').length <= 400);
});
