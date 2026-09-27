// 上层伊甸标记锚点 / 岛轮廓与 estate2 r4（v7 底图）一致；手摆点位（manual）不被工具改动
import test from 'node:test';
import { fileURLToPath } from 'node:url';   // .pathname 会把中文路径百分号编码（主 checkout 在「性能/」下）
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const hasNp = spawnSync('python3', ['-c', 'import numpy'], { cwd: ROOT }).status === 0;

test('eden anchor matches estate2 dock', { skip: !hasNp && 'no numpy' }, () => {
  const r = spawnSync('python3', ['tools/eden_anchor_upper.py', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
});

test('manual markers keep their flag', () => {
  const d = JSON.parse(readFileSync(new URL('../map/data/tc_upper.json', import.meta.url), 'utf8'));
  assert.ok(d.markers.some(m => m.manual === true), 'manual marker still present');
  const e = d.markers.find(m => m.id === 'eden'), isl = d.islands.find(i => i.id === 'eden');
  assert.ok(e.ay > e.ny && e.ay < Math.max(...isl.outline.map(p => p[1])), 'anchor on the front (south) edge, inside the outline');
});
