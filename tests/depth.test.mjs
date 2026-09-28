// 纵深数学对拍（JS 侧）：map/core/depth.mjs 对 tests/fixtures/depth_golden.json（Python 侧：tools/test_depth.py）
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { island, depthOf, cloudsAbove } from '../map/core/depth.mjs';
const G = JSON.parse(fs.readFileSync(new URL('./fixtures/depth_golden.json', import.meta.url), 'utf8'));
test('depth.mjs 与 golden 一致（与 blender/depth.py 同一规格）', () => { for (const k of Object.keys(G.expected)) assert.deepEqual(island(k, G.cfg), G.expected[k], k); });
test('d 显式覆盖、钳位；云片只算更高的', () => { assert.equal(depthOf({ alt: 0, d: 0.3 }, G.cfg), 0.3); assert.equal(depthOf({ alt: 99999 }, G.cfg), 0); assert.deepEqual(cloudsAbove(1000, G.cfg), ['c1', 'c2']); });
test('live upper_depth.json 的岛都能算', () => { const cfg = JSON.parse(fs.readFileSync(new URL('../map/data/upper_depth.json', import.meta.url), 'utf8')); for (const k of Object.keys(cfg.islands)) { const o = island(k, cfg); assert.ok(o.d >= 0 && o.d <= 1, k); } });
