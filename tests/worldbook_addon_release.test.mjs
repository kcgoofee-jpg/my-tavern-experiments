// build_worldbook_addon.py：已发布版本（有 map-v<版本> 标签）的附加世界书不许覆盖，除非 --force；VERSION 已发布时默认按 <版本>-dev 输出
import test from 'node:test';
import { fileURLToPath } from 'node:url';   // .pathname 会把中文路径百分号编码（主 checkout 在「性能/」下）
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tags = execFileSync('git', ['tag', '-l', 'map-v*'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const run = (...a) => spawnSync('python3', ['tools/build_worldbook_addon.py', ...a], { cwd: ROOT, encoding: 'utf8' });

test('released version refused without --force; allowed with it', { skip: !tags.length && 'no map-v tags in this clone', timeout: 120000 }, () => {
  const v = tags[tags.length - 1].slice(5), d = mkdtempSync(join(tmpdir(), 'wb-'));
  try {
    const r = run('--version', v, '--out', join(d, 'a.json'));
    assert.equal(r.status, 1); assert.match(r.stderr, /已发布/); assert.ok(!existsSync(join(d, 'a.json')));
    assert.equal(run('--version', v, '--force', '--out', join(d, 'b.json')).status, 0);
    assert.equal(run('--version', v + '-dev', '--out', join(d, 'c.json')).status, 0);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('default version is VERSION, or VERSION-dev once released', { timeout: 120000 }, () => {
  const V = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim(), d = mkdtempSync(join(tmpdir(), 'wb-'));
  try {
    const r = run('--out', join(d, 'x.json')); assert.equal(r.status, 0, r.stderr);
    if (tags.includes('map-v' + V)) assert.match(r.stdout, new RegExp(`输出按 ${V.replace(/\./g, '\\.')}-dev`));
    else assert.doesNotMatch(r.stdout, /-dev/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
