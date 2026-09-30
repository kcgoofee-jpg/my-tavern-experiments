// Part 3 §1：显存预算纯核心（map/core/budget.mjs）——设备档位、字节估算、水位迟滞、淘汰顺序与瓦片缓存容量。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as B from '../map/core/budget.mjs';

const MB = B.MB;

test('deviceClass：手机 / ≤4 GB 走 low，集显 / 少核走 mid，其余 high（可由 grade 强制）', () => {
  assert.equal(B.deviceClass({ coarse: true, deviceMemory: 4 }), 'low');
  assert.equal(B.deviceClass({ deviceMemory: 2 }), 'low');
  assert.equal(B.deviceClass({ coarse: true, deviceMemory: 8 }), 'mid');
  assert.equal(B.deviceClass({ hardwareConcurrency: 4 }), 'mid');
  assert.equal(B.deviceClass({ maxTextureSize: 4096 }), 'mid');
  assert.equal(B.deviceClass({ hardwareConcurrency: 12, deviceMemory: 16 }), 'high');
  assert.equal(B.deviceClass({ force: 'low', hardwareConcurrency: 32 }), 'low');
  assert.equal(B.deviceClass({}), 'high', '拿不到信息按桌面档，不保守到 low');
});

test('limitFor：按档位给上限，显式覆盖优先', () => {
  assert.equal(B.limitFor('low'), 256 * MB);
  assert.equal(B.limitFor('high'), 1024 * MB);
  assert.equal(B.limitFor('high', 384), 384 * MB);
  assert.equal(B.limitFor('nope', 0), 512 * MB);
});

test('estimateTexture：宽×高×每像素字节×mip 链（4/3）×面数；压缩贴图按传进来的每像素字节', () => {
  assert.equal(B.estimateTexture({ width: 1024, height: 1024 }), Math.round(1024 * 1024 * 4 * 4 / 3));
  assert.equal(B.estimateTexture({ width: 1024, height: 1024, mipmaps: false }), 1024 * 1024 * 4, '关掉 mip 不乘 4/3');
  assert.equal(B.estimateTexture({ width: 1024, height: 1024, mipmaps: false, depth: 1 }), 1024 * 1024, 'KTX2 / Basis 块压缩：每像素 1 字节');
  assert.equal(B.estimateTexture({ width: 512, height: 512, mipmaps: false, faces: 6 }), 512 * 512 * 4 * 6);
  assert.equal(B.estimateTexture({}), 0); assert.equal(B.estimateTexture({ width: 8 }), 0);
});

test('estimateGeometry：属性数组 + 索引（32 位索引按 4 字节）', () => {
  assert.equal(B.estimateGeometry({ attributes: [{ count: 3, itemSize: 3 }, { count: 3, itemSize: 2 }] }), 3 * 3 * 4 + 3 * 2 * 4);
  assert.equal(B.estimateGeometry({ attributes: [{ bytes: 96 }], index: { count: 6 } }), 96 + 6 * 2);
  assert.equal(B.estimateGeometry({ index: { count: 6, bits: 32 } }), 24);
  assert.equal(B.estimateGeometry({}), 0);
});

test('estimateAll：贴图 + 几何 + 额外（渲染器自报）', () => {
  const v = B.estimateAll({ textures: [{ width: 256, height: 256, mipmaps: false }], geometries: [{ attributes: [{ bytes: 40 }] }], extraBytes: 8 });
  assert.equal(v, 256 * 256 * 4 + 40 + 8);
});

test('pressure：超 85% 才判定吃紧，且有迟滞——回到 70% 以下才解除', () => {
  const limit = 1000;
  assert.equal(B.pressure(800, limit).evicting, false, '80% 不动');
  assert.equal(B.pressure(860, limit).evicting, true);
  assert.equal(B.pressure(800, limit, { evicting: true }).evicting, true, '已在淘汰：80% 继续');
  assert.equal(B.pressure(690, limit, { evicting: true }).evicting, false, '低于 70% 才解除');
  assert.equal(B.pressure(990, limit).overBytes, 290, '目标 = 低水位');
});

test('evictOrder：转场贴图 → 瓦片贴图 → 未激活 → 远 → 中档；激活与近档永不淘汰', () => {
  const rs = [
    { id: 'near', state: 'near', bytes: 10 }, { id: 'active', active: true, bytes: 10 },
    { id: 'high_far', state: 'far', bytes: 10 }, { id: 'low_mid', state: 'mid', bytes: 10 },
    { id: 'tile', kind: 'tileTexture', bytes: 10 }, { id: 'trans', kind: 'transitionTexture', bytes: 10 },
    { id: 'idle', state: 'inactive', bytes: 10 },
  ];
  assert.deepEqual(B.evictOrder(rs).map(r => r.id), ['trans', 'tile', 'idle', 'high_far', 'low_mid']);
  assert.equal(B.evictOrder(rs).some(r => r.id === 'near' || r.id === 'active'), false);
});

test('evictOrder：同一优先级里最久没用的先走；再平手时先淘汰大的（顺序可预测）', () => {
  const rs = [
    { id: 'big', state: 'far', bytes: 900, lastUsed: 5 },
    { id: 'old', state: 'far', bytes: 10, lastUsed: 1 },
    { id: 'mid', state: 'far', bytes: 500, lastUsed: 5 },
  ];
  assert.deepEqual(B.evictOrder(rs).map(r => r.id), ['old', 'big', 'mid']);
});

test('plan：按需要腾出的字节挑，挑到够就停；不够给出 exhausted', () => {
  const rs = [{ id: 'a', kind: 'tileTexture', bytes: 100 }, { id: 'b', state: 'far', bytes: 60 }, { id: 'c', state: 'near', bytes: 999 }];
  const p = B.plan(900, 1000, rs);
  assert.equal(p.evicting, true);
  assert.deepEqual(p.picked.map(r => r.id), ['a', 'b']);
  assert.equal(p.freed, 160); assert.equal(p.remainingBytes, 740);
  assert.equal(p.exhausted, true, '目标 = 低水位 700，160 字节还不够');
  const ok = B.plan(900, 1000, rs, { needBytes: 150 });
  assert.equal(ok.exhausted, false, '只要腾 150 就够');
  const q = B.plan(900, 1000, rs, { needBytes: 500 });
  assert.equal(q.exhausted, true, '近档那 999 字节是受保护的，腾不出 500');
  const r = B.plan(100, 1000, rs);
  assert.deepEqual(r.picked, []); assert.equal(r.evicting, false);
});

test('tileCacheCount：吃紧时砍半、轻度吃紧 0.75、正常复原，始终夹在 [min, max]', () => {
  assert.equal(B.tileCacheCount(60, { pressure: 0.9 }), 30);
  assert.equal(B.tileCacheCount(60, { pressure: 0.75 }), 45);
  assert.equal(B.tileCacheCount(60, { pressure: 0.2 }), 60);
  assert.equal(B.tileCacheCount(60, { pressure: 0.99, minCount: 40 }), 40);
  assert.equal(B.tileCacheCount(60, { pressure: 0.2, maxCount: 30 }), 30);
});

test('describe：固定键 + 纯度机检（core 叶子层：无 DOM / 宿主全局 / 反向 import）', () => {
  const d = B.describe({ deviceClass: 'mid', usedBytes: 300 * MB, limitBytes: 512 * MB, textures: 12, geometries: 30, evicted: 3, compressedTextures: 2, tileCacheCount: 30 });
  assert.deepEqual(Object.keys(d).sort(), ['compressedTextures', 'deviceClass', 'evicted', 'evicting', 'geometries', 'highWater', 'limitBytes', 'lowWater', 'ratio', 'textures', 'tileCacheCount', 'usedBytes']);
  assert.equal(d.evicting, false); assert.equal(d.ratio > 0.58 && d.ratio < 0.59, true);
  const src = readFileSync(new URL('../map/core/budget.mjs', import.meta.url), 'utf8');
  for (const g of ['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'Mvu', 'SillyTavern'])
    assert.equal(src.includes(g), false, `不该出现 ${g}`);
  assert.equal(/from\s+['"]\.\./.test(src), false, '不许反向 import');
});
