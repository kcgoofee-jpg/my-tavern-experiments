// P3-C 任务（docs/reviews/architecture_and_stream_perf.md §6）：LayerRegistry 纯核心契约——
// 槽位数据契约与层级排序、order 微调序、重复注册拦截、可见性调度、滤镜链存储、标准摘要与纯度机检。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLOTS, Z_STEP, slotZ, cssFilter, canvasFilter, LayerRegistry } from '../map/core/layers.mjs';

test('槽位数据契约：由底至顶与诊断报告 §6 逐字一致；外层固定 UI 不进槽位', () => {
  assert.deepEqual(SLOTS, ['base', 'depth-haze', 'fog', 'routes', 'trips', 'events', 'markers', 'labels', 'fx', 'interaction']);
  for (const ui of ['header', 'pop', 'setpop', 'dock', 'foot', 'loading']) assert.ok(!SLOTS.includes(ui), `外层 UI「${ui}」不得纳入视口槽位`);
});

test('槽位 z 阶梯：(序号 + 1) × 间距，单调由底至顶', () => {
  assert.equal(Z_STEP, 10);
  assert.deepEqual(SLOTS.map(slotZ), SLOTS.map((_, i) => (i + 1) * Z_STEP));
  for (let i = 1; i < SLOTS.length; i++) assert.ok(slotZ(SLOTS[i]) > slotZ(SLOTS[i - 1]));
  assert.throws(() => slotZ('nope'));
});

const D = (id, over = {}) => ({ id, slot: 'fog', kind: 'dom', ...over });

test('register：缺 id / 重复注册 / 未知槽位 / 未知 kind 全部拦截', () => {
  const r = new LayerRegistry();
  assert.throws(() => r.register({ slot: 'fog', kind: 'dom' }), TypeError);
  assert.throws(() => r.register(D('')), TypeError);
  assert.throws(() => r.register(D('x', { slot: 'header' })), /槽位/);
  assert.throws(() => r.register(D('x', { kind: 'svg' })), /kind/);
  assert.throws(() => r.register(D('x', { order: 'top' })), /order/);
  r.register(D('x'));
  assert.throws(() => r.register(D('x')), /重复注册/);
  assert.throws(() => r.register({}), TypeError);
  assert.ok(r.has('x')); assert.equal(r.get('x').id, 'x'); assert.equal(r.get('nope'), null);
});

test('排序：槽位序优先，同槽 order 微调，再同按注册先后；乱序注册不影响结果', () => {
  const r = new LayerRegistry();
  r.register(D('m-late', { slot: 'markers', order: 0 }));
  r.register(D('fog-a', { slot: 'fog', order: 5 }));
  r.register(D('fog-b', { slot: 'fog', order: 1 }));
  r.register(D('base', { slot: 'base' }));
  r.register(D('fog-c', { slot: 'fog' }));                       // 无 order = 0，排最前
  assert.deepEqual(r.ordered().map(x => x.id), ['base', 'fog-c', 'fog-b', 'fog-a', 'm-late']);
  assert.deepEqual(r.layersInSlot('fog').map(x => x.id), ['fog-c', 'fog-b', 'fog-a']);
  assert.throws(() => r.layersInSlot('nope'));
});

test('unregister：先卸载再注销，允许重新注册；onRegister 通知', () => {
  const r = new LayerRegistry(); const calls = [];
  r.onRegister(id => calls.push(id));
  r.register(D('a', { unmount: () => calls.push('unmount:a') }));
  assert.deepEqual(calls, ['a']);
  assert.equal(r.unregister('a'), true);
  assert.deepEqual(calls, ['a', 'unmount:a']);
  assert.equal(r.unregister('a'), false);
  r.register(D('a', { order: 9 }));
  assert.equal(r.get('a').order, 9);
  assert.throws(() => r.unregister(42), TypeError);
});

test('mountAll：按注册顺序挂载，单层 mount 抛错只废自己；unmountAll 成对', () => {
  const r = new LayerRegistry(); const log = [];
  r.register(D('a', { mount: () => log.push('a') }));
  r.register(D('bad', { mount: () => { throw new Error('boom'); } }));
  r.register(D('b', { mount: () => log.push('b'), unmount: () => log.push('~b') }));
  assert.equal(r.mountAll({}), 2);
  assert.deepEqual(log, ['a', 'b']);
  r.unmountAll();
  assert.deepEqual(log, ['a', 'b', '~b']);
});

test('setVisible：状态记录 + 转发 setVisible；未注册抛错', () => {
  const r = new LayerRegistry(); const seen = [];
  r.register(D('a', { setVisible: v => seen.push(v), initialVisible: false }));
  assert.equal(r.isVisible('a'), false);
  r.setVisible('a', true);
  assert.deepEqual(seen, [true]);
  assert.equal(r.isVisible('a'), true);
  r.setVisible('a', 'yes');                                       // 真值归一为布尔
  assert.equal(r.isVisible('a'), true);
  assert.throws(() => r.setVisible('nope', true), /未注册/);
  assert.throws(() => r.isVisible('nope'), /未注册/);
});

test('滤镜链：css / canvas 分型存储与取值；坏结构拦截；filters 返回副本', () => {
  const r = new LayerRegistry(); r.register(D('a'));
  const chain = [{ type: 'css', value: 'blur(2px)' }, { type: 'canvas', value: 'saturate(1.2)' }];
  assert.deepEqual(r.setFilters('a', chain), chain);
  assert.deepEqual(r.filters('a'), chain);
  assert.equal(cssFilter(chain), 'blur(2px)');
  assert.equal(canvasFilter(chain), 'saturate(1.2)');
  assert.equal(cssFilter([]), '');
  assert.throws(() => r.setFilters('a', 'blur(2px)'), TypeError);
  assert.throws(() => r.setFilters('a', [{ type: 'svg', value: 'x' }]), TypeError);
  assert.throws(() => r.setFilters('a', [{ type: 'css' }]), TypeError);
  assert.throws(() => r.setFilters('nope', []), /未注册/);
  const got = r.filters('a'); got.pop();
  assert.equal(r.filters('a').length, 2, 'filters() 返回副本，外部改不到存储');
});

test('menuRows：只收带 menu 的层，按 menu.order → 注册先后排（#layList 数据驱动）', () => {
  const r = new LayerRegistry();
  r.register(D('plain'));
  r.register(D('b', { slot: 'routes', menu: { order: 2, label: '乙' } }));
  r.register(D('a', { menu: { order: 1, label: '甲' } }));
  r.register(D('c', { menu: { label: '丙' } }));                  // 无 order = 0，排最前
  assert.deepEqual(r.menuRows().map(x => x.id), ['c', 'a', 'b']);
});

test('describe：{ slots, activeLayers, filterSummary } 标准摘要', () => {
  const r = new LayerRegistry();
  r.register(D('fog', { slot: 'fog', kind: 'canvas', initialVisible: true }));
  r.register(D('mk', { slot: 'markers', initialVisible: false }));
  r.register(D('fx', { slot: 'fx', filters: [{ type: 'css', value: 'blur(1px)' }] }));
  const s = r.describe();
  assert.deepEqual(Object.keys(s).sort(), ['activeLayers', 'filterSummary', 'slots']);
  assert.deepEqual(s.slots.map(x => x.id), SLOTS);
  assert.deepEqual(s.slots.find(x => x.id === 'fog').layers, ['fog']);
  assert.deepEqual(s.slots.find(x => x.id === 'markers').layers, ['mk']);
  assert.ok(s.slots.find(x => x.id === 'base').layers.length === 0, '空槽位也列出');
  assert.deepEqual(s.activeLayers, ['fog', 'fx'], '隐藏图层不进 activeLayers，槽位序不变');
  assert.deepEqual(s.filterSummary, [{ id: 'fx', slot: 'fx', filters: [{ type: 'css', value: 'blur(1px)' }] }]);
  const s2 = new LayerRegistry().describe();
  assert.deepEqual(s2.filterSummary, []); assert.deepEqual(s2.activeLayers, []);
});

test('纯度机检：核心模块不碰 DOM / 全局 / 存储 / 网络', () => {
  const src = readFileSync(new URL('../map/core/layers.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|localStorage|sessionStorage|fetch|TCStore|HTMLElement|navigator)\b/);
});
