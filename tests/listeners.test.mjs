// ListenerBus（P2-3 全局监听收拢 / P7 泄漏审计）：tests/listeners.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createListenerBus } from '../map/core/listeners.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** 假目标：记录 add / remove，能派发 */
function tgt() {
  const on = [];
  return {
    addEventListener: (t, f) => on.push([t, f]),
    removeEventListener: (t, f) => { const i = on.findIndex(x => x[0] === t && x[1] === f); if (i >= 0) on.splice(i, 1); },
    fire: (t, e) => on.filter(x => x[0] === t).forEach(([, f]) => f(e)),
    count: () => on.length,
  };
}

test('登记 / 派发 / 按键摘除', () => {
  const t = tgt(), bus = createListenerBus(t);
  const got = [];
  assert.equal(bus.on({ key: 'a', type: 'x', fn: e => got.push(e) }), true);
  t.fire('x', 1); assert.deepEqual(got, [1]);
  assert.equal(bus.off('a'), true);
  t.fire('x', 2); assert.deepEqual(got, [1], '摘掉之后不再收到');
  assert.equal(bus.off('a'), false, '重复摘返回 false');
  assert.equal(t.count(), 0, '目标上确实摘干净了');
});

test('同一个键重复登记先摘旧的（幂等，模块重复求值不叠监听）', () => {
  const t = tgt(), bus = createListenerBus(t);
  let n = 0;
  bus.on({ key: 'dup', type: 'x', fn: () => n++ });
  bus.on({ key: 'dup', type: 'x', fn: () => n++ });
  assert.equal(t.count(), 1, '目标上只有一个监听');
  t.fire('x'); assert.equal(n, 1);
});

test('不同键的同类监听各自独立；offAll 一把摘净并报数', () => {
  const t = tgt(), bus = createListenerBus(t);
  bus.on({ key: 'a', type: 'resize', fn: () => {} });
  bus.on({ key: 'b', type: 'resize', fn: () => {} });
  bus.on({ key: 'c', type: 'storage', fn: () => {} });
  assert.equal(bus.size, 3);
  assert.equal(bus.offAll(), 3);
  assert.equal(t.count(), 0);
  assert.equal(bus.size, 0);
  assert.deepEqual(bus.keys(), []);
});

test('目标不存在 / 没有 addEventListener：安静跳过，不抛', () => {
  assert.equal(createListenerBus(null).on({ key: 'a', type: 'x', fn: () => {} }), false);
  assert.equal(createListenerBus({}).on({ key: 'a', type: 'x', fn: () => {} }), false);
  const t = tgt(); t.addEventListener = () => { throw new Error('boom'); };
  assert.equal(createListenerBus(t).on({ key: 'a', type: 'x', fn: () => {} }), false, '挂不上也不抛');
});

test('参数校验：键 / 事件名 / 处理函数不合规直接抛', () => {
  const bus = createListenerBus(tgt());
  assert.throws(() => bus.on({ key: '', type: 'x', fn: () => {} }), /键/);
  assert.throws(() => bus.on({ key: 'a', type: '', fn: () => {} }), /事件名/);
  assert.throws(() => bus.on({ key: 'a', type: 'x', fn: null }), /处理函数/);
});

test('onAll 批量登记，单个失败不挡后面的；可指定别的目标', () => {
  const t = tgt(), t2 = tgt(), bus = createListenerBus(t);
  const n = bus.onAll([{ key: 'a', type: 'x', fn: () => {} }, { key: 'bad', type: 'x', fn: null }, { key: 'b', type: 'y', fn: () => {}, target: t2 }]);
  assert.equal(n, 2);
  assert.equal(t.count(), 1); assert.equal(t2.count(), 1);
  assert.equal(bus.has('b'), true);
});

test('台账 describe：按事件类型计数（泄漏排查看这个）', () => {
  const bus = createListenerBus(tgt());
  bus.on({ key: 'a', type: 'resize', fn: () => {} });
  bus.on({ key: 'b', type: 'resize', fn: () => {} });
  bus.on({ key: 'c', type: 'message', fn: () => {} });
  assert.deepEqual(bus.describe(), { count: 3, byType: { resize: 2, message: 1 }, targets: ['default'] });
});

test('查看器侧已接总线：散落的全局监听登记到 app/bus.mjs', () => {
  const files = ['clouds', 'shell', 'tavernhelper-settings', 'settings', 'host-messages'];
  for (const f of files) {
    const src = readFileSync(join(ROOT, `map/app/${f}.mjs`), 'utf8');
    assert.ok(src.includes("from './bus.mjs'"), `${f}.mjs 必须接总线`);
    assert.ok(/busOn\(\{\s*key: '/.test(src), `${f}.mjs 必须有带键的登记`);
  }
  const v = readFileSync(join(ROOT, 'map/viewer.html'), 'utf8');
  assert.match(v, /<link rel="modulepreload" href="app\/bus\.mjs">/);
});
