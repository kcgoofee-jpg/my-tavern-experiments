// 后台静默推演调度器（Part 6-2）：tests/background-scan-scheduler.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BACKGROUND_SCAN_STORAGE_KEY, DEFAULT_MS, MIN_MS, MAX_MS, MAX_FLOORS, intervalOf, plan, pick, ledger, describe } from '../map/tavern/background-scan-scheduler.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('间隔：合法值夹在 15 s–5 min 之间，0 / 负数 / 乱值 = 关', () => {
  const g = v => (k => (k === BACKGROUND_SCAN_STORAGE_KEY ? v : null));
  assert.equal(intervalOf(g('60000')), 60000);
  assert.equal(intervalOf(g('1000')), MIN_MS, '太急会被抬到 15 s');
  assert.equal(intervalOf(g('99999999')), MAX_MS, '再慢也不超过 5 min');
  assert.equal(intervalOf(g('0')), 0, "'0' = 关");
  assert.equal(intervalOf(g('-5')), 0);
  assert.equal(intervalOf(g('abc')), 0);
  assert.equal(intervalOf(g(null)), DEFAULT_MS, '没设过 / 空 = 默认 60 s');
  assert.equal(intervalOf(g('')), DEFAULT_MS);
  assert.equal(intervalOf(g('1')), DEFAULT_MS, "设置开关的「开」= 默认间隔");
  assert.equal(intervalOf(null), DEFAULT_MS, '没有读取函数也按默认走');
  assert.equal(intervalOf(() => { throw new Error('存储炸了'); }), 0);
  assert.equal(DEFAULT_MS, 60000);
});

test('该不该跑：间隔到了才跑，面板活着 / 生成中 / 已死一律让路', () => {
  assert.deepEqual(plan(1000, { lastAt: 0, intervalMs: 60000 }).reason, 'wait');
  assert.deepEqual(plan(61000, { lastAt: 0, intervalMs: 60000 }), { run: true, reason: 'due', waited: 61000 });
  assert.deepEqual(plan(61000, { lastAt: 0, intervalMs: 60000, alive: true }), { run: false, reason: 'alive' });
  assert.deepEqual(plan(61000, { lastAt: 0, intervalMs: 60000, generating: true }), { run: false, reason: 'generating' });
  assert.deepEqual(plan(61000, { lastAt: 0, intervalMs: 60000, dead: true }), { run: false, reason: 'dead' });
  assert.deepEqual(plan(61000, { lastAt: 0, intervalMs: 0 }), { run: false, reason: 'off' }, '关了就不跑');
  assert.equal(plan(30000, { lastAt: 0, intervalMs: 60000 }).wait, 30000);
  assert.equal(plan(null, {}).reason, 'wait', '没给间隔时按默认 60 s 走');
});

test('取楼层：只取增量，超上限取最近的那批并报丢弃数', () => {
  assert.deepEqual(pick(100, 90), { from: 91, to: 100, n: 10, dropped: 0 });
  assert.deepEqual(pick(100, 100), { from: 101, to: 100, n: 0, dropped: 0 }, '没有新楼层');
  assert.deepEqual(pick(100, -1, { scan: 80, maxFloors: 200 }), { from: 20, to: 100, n: 81, dropped: 0 }, '第一次：按窗口扫');
  assert.equal(pick(100, -1, { scan: 80 }).n, MAX_FLOORS, '窗口比上限大：也只扫上限那么多');
  const r = pick(1000, 0, { maxFloors: 60 });
  assert.equal(r.n, 60); assert.equal(r.to, 1000); assert.equal(r.from, 941); assert.equal(r.dropped, 940);
  assert.deepEqual(pick(-1, 0), { from: 0, to: 0, n: 0, dropped: 0 }, '楼层未知：不扫');
  assert.ok(pick(1000, 0).n <= MAX_FLOORS);
});

test('记账：跑了几轮、最后一次耗时与楼层数', () => {
  const a = ledger(null, { now: 1000, floorNow: 42, ms: 12.6, n: 7 });
  assert.deepEqual(a, { lastAt: 1000, lastFloor: 42, runs: 1, lastMs: 13, lastN: 7 });
  const b = ledger(a, { now: 2000, floorNow: 55, ms: 3, n: 2 });
  assert.equal(b.runs, 2); assert.equal(b.lastFloor, 55); assert.equal(b.lastAt, 2000);
  const c = ledger(a, { now: 3000 });   // 没给楼层：沿用上一次的
  assert.equal(c.lastFloor, 42); assert.equal(c.lastN, 0);
});

test('摘要与纯度：不碰酒馆全局 / DOM / 定时器', () => {
  const d = describe(k => (k === BACKGROUND_SCAN_STORAGE_KEY ? '30000' : null), { runs: 2, lastN: 3 });
  assert.equal(d.intervalMs, 30000); assert.equal(d.key, BACKGROUND_SCAN_STORAGE_KEY);
  const src = readFileSync(join(ROOT, 'map/tavern/background-scan-scheduler.mjs'), 'utf8').replace(/\/\/[^\n]*/g, '');
  for (const g of ['window', 'document', 'localStorage', 'Mvu', 'SillyTavern', 'setInterval', 'setTimeout']) {
    assert.ok(!new RegExp(`\\b${g}\\b`).test(src), `不该出现 ${g}`);
  }
});
