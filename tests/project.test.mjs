// 斜视投影对拍（JS 侧）：map/core/project.mjs 对 tests/fixtures/project_golden.json（Python 侧 tools/test_project.py）
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { project, projectOrtho, unprojectOrtho, affineOf, placeRect, labelRule } from '../map/core/project.mjs';
const G = JSON.parse(fs.readFileSync(new URL('./fixtures/project_golden.json', import.meta.url), 'utf8'));
test('project.mjs 与 golden 一致', () => { G.points.forEach((p, i) => assert.deepEqual(project(p, G.cam), G.uv[i])); });
test('遮挡规则', () => { for (const [r, w] of G.rules) assert.equal(labelRule(r, G.view.occlusion), w, String(r)); });
const O = G.ortho;
test('正交投影与 golden 一致', () => { O.points.forEach((p, i) => assert.deepEqual(projectOrtho(p, O.cam), O.uv[i])); });
test('正交反算与 golden 一致，且与投影往返（往返误差 < 0.5 m = u/v 的 4 位小数量化上限）', () => {
  for (const t of O.unproject) assert.deepEqual(unprojectOrtho(t.uv[0], t.uv[1], O.cam, t.z0), t.xy);
  O.points.forEach((p, i) => { const q = unprojectOrtho(O.uv[i][0], O.uv[i][1], O.cam, p[2]);
    assert.ok(Math.abs(q[0] - p[0]) < 0.5 && Math.abs(q[1] - p[1]) < 0.5, String(p)); });   // projectOrtho 把 u/v 取整到 1e-4 → 画框宽 3498.88 m 的量化上限 ≈ 0.35 m
});
test('仿射矩阵与逐点投影一致', () => {
  const A = affineOf(O.cam);
  O.points.forEach((p, i) => { const u = A[0][0] * p[0] + A[0][1] * p[1] + A[0][2] * p[2] + A[0][3], v = A[1][0] * p[0] + A[1][1] * p[1] + A[1][2] * p[2] + A[1][3]; assert.deepEqual([+u.toFixed(4), +v.toFixed(4)], O.uv[i]); });
});
test('画框摆放公式 F 与 golden 一致', () => { assert.deepEqual(placeRect(O.placeB, O.cam), O.placeRect); });
