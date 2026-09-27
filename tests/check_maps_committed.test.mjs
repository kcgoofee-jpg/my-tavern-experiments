// C-1：check_maps --committed 看提交树而不是工作区——工作区里有、提交里没有的文件要报错
import test from 'node:test';
import { fileURLToPath } from 'node:url';   // .pathname 会把中文路径百分号编码（主 checkout 在「性能/」下）
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const git = (args, env = {}) => execFileSync('git', args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' }).trim();
const check = (...a) => spawnSync('python3', ['tools/check_maps.py', ...a], { cwd: ROOT, encoding: 'utf8' });

test('HEAD passes in committed mode', () => {
  const r = check('--committed'); assert.equal(r.status, 0, r.stdout); assert.match(r.stdout, /提交 HEAD/);
});

test('file missing from the commit (but present in worktree) fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cm-')), env = { GIT_INDEX_FILE: join(dir, 'index') };
  try {
    git(['read-tree', 'HEAD'], env);
    git(['rm', '--cached', '-q', 'map/data/tc_mid.json', 'map/art/tc_upper.dzi'], env);
    const tree = git(['write-tree'], env);
    const id = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
    const rev = git(['commit-tree', tree, '-p', 'HEAD', '-m', 'check_maps test'], id);   // 悬空提交，不动分支与工作区
    const r = check('--committed', rev);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /缺数据 data\/tc_mid\.json/);
    assert.match(r.stdout, /缺底图 art\/tc_upper\.dzi/);
    assert.equal(check().status, 0, 'worktree mode still passes');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
