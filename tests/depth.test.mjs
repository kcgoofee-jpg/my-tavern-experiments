// 纵深数学对拍（JS 侧）：map/core/depth.mjs 对 tests/fixtures/depth_golden.json（Python 侧：tools/test_depth.py）
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { island, depthOf, cloudsAbove, altDepth, parallaxOn } from '../map/core/depth.mjs';
const G = JSON.parse(fs.readFileSync(new URL('./fixtures/depth_golden.json', import.meta.url), 'utf8'));
test('depth.mjs 与 golden 一致（与 blender/depth.py 同一规格）', () => { for (const k of Object.keys(G.expected)) assert.deepEqual(island(k, G.cfg), G.expected[k], k); });
test('d 显式覆盖、钳位；云片只算更高的', () => { assert.equal(depthOf({ alt: 0, d: 0.3 }, G.cfg), 0.3); assert.equal(depthOf({ alt: 99999 }, G.cfg), 0); assert.deepEqual(cloudsAbove(1000, G.cfg), ['c1', 'c2']); });
test('live upper_depth.json 的岛都能算', () => { const cfg = JSON.parse(fs.readFileSync(new URL('../map/data/upper_depth.json', import.meta.url), 'utf8')); for (const k of Object.keys(cfg.islands)) { const o = island(k, cfg); assert.ok(o.d >= 0 && o.d <= 1, k); } });
// U16 视差：云片按海拔走同一公式；总开关读数据（前端另判手机 / 减少动态效果）
test('altDepth（云片等非岛实体）与视差总开关', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../map/data/upper_depth.json', import.meta.url), 'utf8'));
  const alts = cfg.cloud_sheets.map(s => s.alt).sort((a, b) => b - a);
  const ds = alts.map(a => altDepth(a, cfg));
  assert.ok(ds.every(d => d >= 0 && d <= 1));
  assert.ok(ds[0] < ds[ds.length - 1], '云片越高（离相机越近）d 越小');
  assert.equal(altDepth(alts[0], cfg), depthOf({ alt: alts[0] }, cfg), '与 depthOf 同一公式');
  assert.equal(parallaxOn(cfg), true, '上层已开视差（channels.parallax.enabled）');
  assert.equal(parallaxOn(null), false); assert.equal(parallaxOn({ channels: {} }), false);
});
