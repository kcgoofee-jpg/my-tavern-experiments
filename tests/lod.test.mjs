// Part 3 §1：LOD 决策纯核心（map/core/lod.mjs）——状态机与迟滞、异步加载令牌、剔除 / 实例化分组策略。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../map/core/lod.mjs';

test('observe：按「距离 / 模型尺寸」归一化，屏幕占比与可见性一起带出（不碰 DOM）', () => {
  const o = L.observe({ distance: 90, size: 30, visible: true });
  assert.equal(o.ratio, 3);
  assert.equal(o.visible, true);
  assert.equal(L.observe({}).size, 1, '缺尺寸按 1，不除零');
  assert.equal(L.observe({ size: 0 }).size, 1);
  assert.equal(L.observe({ distance: 5, size: 10 }).cover, 1, '近到整个屏幕也封顶 1');
});

test('band：远 / 中 / 近三档按模型尺寸的倍数分（与绝对尺度无关）', () => {
  assert.equal(L.band({ distance: 40, size: 20 }), 'near');   // 2 倍
  assert.equal(L.band({ distance: 100, size: 20 }), 'mid');   // 5 倍
  assert.equal(L.band({ distance: 200, size: 20 }), 'far');   // 10 倍
  assert.equal(L.band({ distance: 200, size: 20 }, { near: 2, mid: 12 }), 'mid', '档位带宽可覆盖');
});

test('stepState：迟滞——在带边界上抖动不换档，越过边界 12% 才换', () => {
  const nearEdge = { distance: 1.8, size: 1 };
  assert.equal(L.band(nearEdge), 'near');
  assert.equal(L.stepState('near', { distance: 1.8 * 1.05, size: 1 }).state, 'near', '刚过边界 5%：不动');
  assert.equal(L.stepState('near', { distance: 1.8 * 1.5, size: 1 }).state, 'mid');
  assert.equal(L.stepState('mid', { distance: 1.8 * 1.5, size: 1 }).state, 'mid', '升档要跨得更狠（/ k）');
  assert.equal(L.stepState('mid', { distance: 1.5, size: 1 }).state, 'near');
  assert.equal(L.stepState('far', { distance: 100, size: 1 }).state, 'far');
  assert.equal(L.stepState('far', { distance: 4, size: 1 }).state, 'mid');
  assert.equal(L.stepState('bogus', { distance: 99, size: 1 }).state, 'far', '脏状态回落 far');
});

test('plan：只升档加载、降档卸载；资源缺失按 placeholder → low → high 兜底', () => {
  const up = L.plan('mid', 'near', { low: 'a_low.glb', high: 'a.glb' });
  assert.deepEqual([up.from, up.to, up.detail, up.load], ['mid', 'near', 'high', 'high']);
  assert.deepEqual(up.unload, []);
  const down = L.plan('near', 'far', { low: 'a_low.glb', high: 'a.glb' });
  assert.deepEqual(down.detail, 'placeholder');
  assert.deepEqual(down.unload.sort(), ['high', 'low']);
  assert.equal(down.load, null, '降档不再发起加载');
  const noHigh = L.plan('mid', 'near', { low: 'a_low.glb' });
  assert.equal(noHigh.detail, 'low'); assert.equal(noHigh.fallbackUsed, true); assert.equal(noHigh.load, 'low');
  const noLow = L.plan('far', 'near', { high: 'a.glb' });
  assert.equal(noLow.detail, 'high', '没有 low 也可以直接上 high，但 far 档占位仍在');
  const only = L.plan('far', 'far', {});
  assert.equal(only.detail, 'placeholder'); assert.equal(only.async, false);
});

test('createTokens：异步加载回来时令牌过期就丢弃（镜头飞走的旧加载）', () => {
  const t = L.createTokens();
  const a = t.next(); const b = t.next();
  assert.equal(t.accept(b), true);
  assert.equal(t.accept(a), false, '旧一代的加载结果作废');
  assert.equal(t.reset(), 0); assert.equal(t.accept(a), false);
  assert.equal(t.accept('x'), false);
});

test('schedule：每帧最多重算 perFrame 个，最近的先算，已在加载的跳过', () => {
  const items = [{ id: 'far1', ratio: 40 }, { id: 'near1', ratio: 2 }, { id: 'busy', ratio: 1, pending: true }, { id: 'near2', ratio: 3 }];
  assert.deepEqual(L.schedule(items, { perFrame: 2 }), ['near1', 'near2']);
  assert.deepEqual(L.schedule(items, { perFrame: 9 }), ['near1', 'near2', 'far1'], 'pending 的永远排在后面（过滤掉）');
});

test('cullPolicy：frustumCulled 恒为 true；视口外 / 过远 / 不足 2px 的不参与渲染', () => {
  assert.equal(L.cullPolicy({ visible: true, distance: 10, size: 10 }).frustumCulled, true);
  assert.equal(L.cullPolicy({ visible: false }).render, false);
  assert.equal(L.cullPolicy({ visible: true, distance: 100, size: 1 }, { maxRatio: 20 }).render, false);
  assert.equal(L.cullPolicy({ visible: true, distance: 10, size: 10, screenPx: 1 }).render, false);
  assert.equal(L.cullPolicy({ visible: true, distance: 10, size: 10, screenPx: 40 }).render, true);
});

test('instanceGroups：同几何 + 同材质的静态件合成一组；可拾取件（热点）不合并', () => {
  const meshes = [
    { id: 'a', geometryId: 'g1', materialId: 'm1' }, { id: 'b', geometryId: 'g1', materialId: 'm1' },
    { id: 'c', geometryId: 'g2', materialId: 'm1' }, { id: 'hot', geometryId: 'g1', materialId: 'm1', pickable: true },
    { id: 'd', geometryId: 'g1', materialId: 'm2' },
  ];
  const g = L.instanceGroups(meshes);
  assert.deepEqual(g.map(x => x.key), ['g1|m1']);
  assert.equal(g[0].count, 2);
  assert.deepEqual(g[0].ids, ['a', 'b']);
  assert.deepEqual(L.instanceGroups(meshes, { groupOf: m => m.materialId })[0].ids.sort(), ['a', 'b', 'c', 'hot'],
    'groupOf 由调用方给时，可拾取件也能并组（徽章批量就是这么来的）');
});

test('describe：固定键 + 纯度机检（core 叶子层：无 DOM / 宿主全局 / 反向 import）', () => {
  const d = L.describe({ counts: { near: 2, mid: 3, far: 9 }, generation: 4, instanceGroups: 2, drawCalls: 7, rejectedLoads: 1 });
  assert.deepEqual(Object.keys(d).sort(), ['bands', 'counts', 'drawCalls', 'generation', 'hysteresis', 'instanceGroups', 'rejectedLoads', 'states']);
  assert.deepEqual(d.states, ['far', 'mid', 'near']);
  assert.equal(d.counts.far, 9);
  const src = readFileSync(new URL('../map/core/lod.mjs', import.meta.url), 'utf8');
  for (const g of ['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'Mvu', 'SillyTavern', 'requestAnimationFrame'])
    assert.equal(src.includes(g), false, `不该出现 ${g}`);
  assert.equal(/from\s+['"]\.\./.test(src), false, '不许反向 import');
});
