// 斜视投影对拍（JS 侧）：map/core/project.mjs 对 tests/fixtures/project_golden.json（Python 侧 tools/test_project.py）
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { project, labelRule } from '../map/core/project.mjs';
const G = JSON.parse(fs.readFileSync(new URL('./fixtures/project_golden.json', import.meta.url), 'utf8'));
test('project.mjs 与 golden 一致', () => { G.points.forEach((p, i) => assert.deepEqual(project(p, G.cam), G.uv[i])); });
test('遮挡规则', () => { for (const [r, w] of G.rules) assert.equal(labelRule(r, G.view.occlusion), w, String(r)); });
