// RenderGate（Part 7-4）node 单测：幂等切换、时长累计（含进行中的那段）、onPause / onResume 回调时序、
// wireVisibility 挂桩同步 + 事件跟随 + 撤销。纯核心不碰宿主全局（tools/check_architecture.py 同一道防线）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderGate, wireVisibility } from '../map/core/render-gate.mjs';

function fakeClock() { let t = 1000; return [() => t, ms => { t += ms; }]; }

test('setHidden：幂等、回调只在真实切换时发、时长累计（含进行中）', () => {
  const [now, adv] = fakeClock();
  const calls = [];
  const g = createRenderGate({ now, onResume: () => calls.push('resume'), onPause: () => calls.push('pause') });
  assert.equal(g.hidden, false);
  g.setHidden(true); g.setHidden(true);            // 重复置隐：只算一次
  adv(100);
  assert.equal(g.hidden, true); assert.equal(g.pausedMs, 100); assert.equal(g.pauses, 1);
  g.setHidden(false); g.setHidden(false);
  assert.equal(g.pausedMs, 100, '恢复后时长冻结在累计值'); assert.equal(g.pauses, 1);
  adv(50); g.setHidden(true); adv(70);
  assert.equal(g.pausedMs, 170, '累计 100 + 进行中 70');   // 100 + 30=130？见下：150-50=100 累计，进行中 70 → 170
  assert.equal(calls.join(','), 'pause,resume,pause');
});

test('state()：快照形状稳定（自检 / 测试消费）', () => {
  const [now] = fakeClock();
  const g = createRenderGate({ now });
  assert.deepEqual(g.state(), { hidden: false, pausedMs: 0, pauses: 0 });
  g.setHidden(true);
  assert.deepEqual(g.state(), { hidden: true, pausedMs: 0, pauses: 1 });
});

test('wireVisibility：挂上即同步、visibilitychange 跟随、撤销后不再跟随、缺事件源安全', () => {
  const [now] = fakeClock();
  const g = createRenderGate({ now });
  const subs = new Map();
  const stub = {
    hidden: true,   // 以隐藏态启动：挂上就暂停
    addEventListener: (k, fn) => subs.set(k, fn),
    removeEventListener: k => subs.delete(k),
  };
  const un = wireVisibility(g, stub);
  assert.equal(g.hidden, true);
  stub.hidden = false; subs.get('visibilitychange')();
  assert.equal(g.hidden, false);
  un();
  stub.hidden = true; subs.get('visibilitychange')?.();
  assert.equal(g.hidden, false, '撤销后不再跟随');
  assert.equal(typeof wireVisibility(g, null), 'function');
  assert.equal(typeof wireVisibility(null, stub), 'function');
});
