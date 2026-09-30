// 视口可见性渲染节流（P7-4）：tests/visibility.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPauseSwitch, installVisibilityGuard, REASONS, visibilityGuard, initVisibilityGuard } from '../map/app/visibility.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('挂起按原因引用计数：任一原因在就暂停，全清才恢复', () => {
  const seen = [];
  const g = createPauseSwitch({ onChange: (p, r) => seen.push([p, r]) });
  assert.equal(g.isPaused(), false);
  g.set('page', true); g.set('viewport', true);
  assert.deepEqual(g.reasons().sort(), ['page', 'viewport']);
  g.set('page', false);
  assert.equal(g.isPaused(), true, '还有一个原因挂着就继续暂停');
  g.set('viewport', false);
  assert.equal(g.isPaused(), false);
  assert.deepEqual(seen, [[true, 'page'], [false, 'viewport']], '只在翻转时通知，且带上触发原因');
});

test('重复置同一个位不重复通知（幂等）', () => {
  const seen = [];
  const g = createPauseSwitch({ onChange: p => seen.push(p) });
  g.set('manual', true); g.set('manual', true); g.set('manual', false); g.set('manual', false);
  assert.deepEqual(seen, [true, false]);
});

test('未知原因直接抛（拼错的原因不许悄悄变成永久暂停）', () => {
  const g = createPauseSwitch();
  assert.throws(() => g.set('typo', true), /未知挂起原因/);
  assert.ok(REASONS.includes('page') && REASONS.includes('viewport') && REASONS.includes('manual'));
});

test('subscribe 立刻对齐当前状态，退订后不再收通知', () => {
  const g = createPauseSwitch();
  g.set('page', true);
  const got = [];
  const off = g.subscribe(p => got.push(p));
  assert.deepEqual(got, [true], '订阅时补一次当前状态');
  g.set('page', false);
  off(); g.set('page', true);
  assert.deepEqual(got, [true, false]);
});

test('DOM 接线：visibilitychange / pagehide / 视口观察各自驱动自己的原因', () => {
  const l = {};
  const doc = {
    visibilityState: 'visible', hidden: false,
    addEventListener: (t, f) => (l['d:' + t] = f), removeEventListener: t => delete l['d:' + t],
  };
  const win = { addEventListener: (t, f) => (l['w:' + t] = f), removeEventListener: t => delete l['w:' + t] };
  const g = createPauseSwitch();
  const off = installVisibilityGuard(g, { doc, win });
  assert.equal(g.isPaused(), false, '初始可见 → 不暂停');
  doc.visibilityState = 'hidden'; l['d:visibilitychange']();
  assert.equal(g.isPaused(), true);
  l['w:pageshow'](); assert.equal(g.isPaused(), false, 'pageshow 清掉 page 位');
  l['w:pagehide'](); assert.equal(g.isPaused(), true, 'iOS WebKit 只发 pagehide');
  off();
  assert.deepEqual(l, {}, 'uninstall 必须摘干净所有监听');
});

test('没有 document 的环境（node / 裸模块求值）安静跳过，不抛', () => {
  const g = createPauseSwitch();
  assert.equal(typeof installVisibilityGuard(g, {}), 'function');
  assert.equal(g.isPaused(), false);
});

test('单例 initVisibilityGuard 只装一次，暂停 / 恢复转给 effects', () => {
  const calls = [];
  const u1 = initVisibilityGuard({ effects: { onPause: r => calls.push('p:' + r), onResume: r => calls.push('r:' + r) } });
  const u2 = initVisibilityGuard({ effects: { onPause: () => calls.push('dup') } });
  assert.equal(u1, u2, '重复调用只返回同一个卸载函数，不叠第二套监听');
  visibilityGuard.set('manual', true);
  visibilityGuard.set('manual', false);
  assert.ok(calls.includes('p:manual') && calls.includes('r:manual'));
  assert.ok(!calls.includes('dup'));
  assert.equal(visibilityGuard.isPaused(), false);
});

test('可见性守卫已在启动里接线，并顺带按下 FPS 读数与三维循环', () => {
  const boot = readFileSync(join(ROOT, 'map/app/boot.mjs'), 'utf8');
  assert.ok(boot.includes('initVisibilityGuard'), 'boot 必须装配可见性守卫');
  assert.ok(boot.includes('suspendFpsMeter'), '暂停位要落到 FPS 读数循环');
  assert.ok(boot.includes('estate:pause'), '暂停位要落到三维子页的渲染循环');
  const f = readFileSync(join(ROOT, 'map/app/fps.mjs'), 'utf8');
  assert.ok(f.includes('suspendFpsMeter'), 'fps.mjs 必须导出挂起位');
});
