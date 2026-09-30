#!/usr/bin/env python3
"""CDN 预热清单的单测：tools/warm_plan.py（清单算法）+ tools/warm_cdn.sh（参数接线）。全程不联网。

跑法：python3 tests/test_warm_cdn.py（tools/smoke.sh 已接入同一命令）。

覆盖（2026-09-30 增量改造的验收点）：
  * 只改一行 .mjs → 清单只有那个文件 + 头指针（map/data/head.json、map/tavern/eden-map.js）；
  * --full 展开成全量运行时清单，且不含 C-11 排除的非运行时文件；
  * 重度资产（map/art/、map/props/、*.dzi、*.glb）变动 → 自动升级为全量；--no-escalate 可关；
  * 只改文档 → 只剩头指针（不浪费一次全量）；
  * --detach：立刻返回 0 并把结果写进日志（用 --list 免联网）。
"""
import os
import subprocess
import sys
import tempfile
import time
import unittest

sys.dont_write_bytecode = True   # 不在 tools/ 下留 __pycache__
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import warm_plan  # noqa: E402  tools/warm_plan.py

# 提交身份写进环境，避免依赖本机 git config（CI 干净检出上可能没有）
ENV = {**os.environ,
       'GIT_AUTHOR_NAME': 'warm-test', 'GIT_AUTHOR_EMAIL': 'warm-test@example.com',
       'GIT_COMMITTER_NAME': 'warm-test', 'GIT_COMMITTER_EMAIL': 'warm-test@example.com'}

TREE = {
    'map/viewer.html': '<html>\n',
    'map/tavern/eden-map.js': 'export const v = 1;\n',
    'map/tavern/foo.mjs': 'export const foo = 1;\n',
    'map/data/head.json': '{"build": 1}\n',
    'map/data/maps.json': '{"maps": []}\n',
    'map/art/world.dzi': '<Image>\n',
    'map/art/tiles/0/0.jpg': 'jpg\n',
    'map/props/chair.glb': 'glb\n',
    'map/shots/s.png': 'png\n',            # C-11：截图不预热
    'map/data/schema/x.json': '{}\n',      # C-11：schema 样例不预热
    'map/section.js': 'var s = 1;\n',      # C-11：死原型页专用
    'docs/note.md': 'note\n',              # 不在 map/ 下
}
NON_RUNTIME = ('map/shots/s.png', 'map/data/schema/x.json', 'map/section.js')
PINS = ('map/data/head.json', 'map/tavern/eden-map.js')


def git(repo, *args):
    r = subprocess.run(['git', '-C', repo, *args], capture_output=True, text=True, env=ENV)
    if r.returncode:
        raise AssertionError(f"git {' '.join(args)} 失败：{r.stderr.strip()}")
    return r.stdout.strip()


def make_repo(d):
    for path, body in TREE.items():
        full = os.path.join(d, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, 'w', encoding='utf-8') as f:
            f.write(body)
    git(d, 'init', '-q')
    git(d, 'add', '-A')
    git(d, 'commit', '-q', '-m', 'base')
    return git(d, 'rev-parse', 'HEAD')


def edit_commit(repo, path, body):
    full = os.path.join(repo, path)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(body)
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', f'change {path}')


class PlanCase(unittest.TestCase):
    """增量 / 全量清单的判定（合成仓库，不动真仓库）。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = self.tmp.name
        self.base = make_repo(self.repo)

    def tearDown(self):
        self.tmp.cleanup()

    def test_full_is_runtime_only(self):
        files, note = warm_plan.plan(self.repo, 'HEAD', full=True)
        self.assertEqual(note, '全量')
        for f in ('map/viewer.html', 'map/tavern/foo.mjs', 'map/art/world.dzi', 'map/props/chair.glb'):
            self.assertIn(f, files)
        for f in NON_RUNTIME:
            self.assertNotIn(f, files)
        self.assertNotIn('docs/note.md', files)

    def test_single_mjs_change_warms_only_that_file_plus_pins(self):
        edit_commit(self.repo, 'map/tavern/foo.mjs', 'export const foo = 2;\n')
        files, _ = warm_plan.plan(self.repo, 'HEAD', diff=True)
        self.assertEqual(set(files), {'map/tavern/foo.mjs', *PINS})
        for f in ('map/art/world.dzi', 'map/props/chair.glb', 'map/viewer.html'):
            self.assertNotIn(f, files)

    def test_docs_only_change_warms_pins_only(self):
        edit_commit(self.repo, 'docs/note.md', 'note 2\n')
        files, note = warm_plan.plan(self.repo, 'HEAD', diff=True)
        self.assertEqual(set(files), set(PINS))
        self.assertIn('变动 0 个', note)

    def test_heavy_asset_change_escalates_to_full(self):
        edit_commit(self.repo, 'map/art/tiles/0/0.jpg', 'jpg2\n')
        full = warm_plan.plan(self.repo, 'HEAD', full=True)[0]
        for heavy in ('map/art/tiles/0/0.jpg', 'map/art/world.dzi', 'map/props/chair.glb'):
            edit_commit(self.repo, heavy, 'x\n')
            files, note = warm_plan.plan(self.repo, 'HEAD', diff=True)
            self.assertEqual(files, full, heavy)
            self.assertIn('→ 全量', note)

    def test_no_escalate_keeps_the_diff_small(self):
        edit_commit(self.repo, 'map/props/chair.glb', 'glb2\n')
        files, _ = warm_plan.plan(self.repo, 'HEAD', diff=True, no_escalate=True)
        self.assertEqual(set(files), {'map/props/chair.glb', *PINS})

    def test_explicit_base_and_missing_base(self):
        edit_commit(self.repo, 'map/tavern/foo.mjs', 'export const foo = 3;\n')
        files, _ = warm_plan.plan(self.repo, 'HEAD', base=self.base, diff=True)
        self.assertIn('map/tavern/foo.mjs', files)
        span, note = warm_plan.plan(self.repo, 'HEAD', base='deadbeef', diff=True)
        self.assertEqual(span, warm_plan.plan(self.repo, 'HEAD', full=True)[0])
        self.assertIn('全量', note)

    def test_cli_count_matches_list(self):
        edit_commit(self.repo, 'map/tavern/foo.mjs', 'export const foo = 4;\n')
        run = lambda *a: subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'warm_plan.py'),
                                         '--repo', self.repo, *a], capture_output=True, text=True)
        full = run('--full').stdout.split()
        diff = run('--diff').stdout.split()
        self.assertEqual(run('--full', '--count').stdout.strip(), str(len(full)))
        self.assertEqual(run('--diff', '--count').stdout.strip(), str(len(diff)))
        self.assertLess(len(diff), len(full))
        self.assertTrue(all(p in full for p in diff))


class ShellCase(unittest.TestCase):
    """tools/warm_cdn.sh 的参数接线（真仓库，--list / --count 不发请求）。"""

    def run_sh(self, *args):
        return subprocess.run(['bash', 'tools/warm_cdn.sh', *args], cwd=ROOT,
                              capture_output=True, text=True)

    def test_full_list_matches_plan(self):
        full = self.run_sh('HEAD', '--full', '--list').stdout.split()
        direct = warm_plan.plan(ROOT, 'HEAD', full=True)[0]
        self.assertEqual(full, direct)
        self.assertEqual(self.run_sh('HEAD', '--count').stdout.strip(), str(len(full)))

    def test_diff_list_is_a_subset(self):
        full = set(self.run_sh('HEAD', '--full', '--list').stdout.split())
        diff = self.run_sh('HEAD', '--diff', '--list').stdout.split()
        self.assertTrue(diff)
        self.assertTrue(set(diff) <= full)
        self.assertLess(len(diff), len(full))

    def test_diff_with_explicit_base_matches_plan(self):
        base = subprocess.run(['git', '-C', ROOT, 'rev-parse', 'HEAD^'],
                              capture_output=True, text=True).stdout.strip()
        shell = self.run_sh('HEAD', '--diff', base, '--list')
        self.assertEqual(shell.returncode, 0, shell.stderr)   # 回归：基线曾以 --base 传下去，warm_plan 不认、静默退出 2
        self.assertEqual(shell.stdout.split(), warm_plan.plan(ROOT, 'HEAD', base=base, diff=True)[0])

    def test_detach_returns_immediately_and_writes_a_log(self):
        log = os.path.join(tempfile.mkdtemp(), 'warm.log')
        t = time.time()
        r = self.run_sh('HEAD', '--full', '--list', '--detach', '--log', log)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('后台', r.stdout)
        self.assertLess(time.time() - t, 3)          # 父进程不等 CDN
        for _ in range(100):                          # 子进程最多 10 s 内落盘
            if os.path.exists(log) and os.path.getsize(log) > 0:
                break
            time.sleep(0.1)
        with open(log, encoding='utf-8') as f:
            body = f.read()
        self.assertIn('map/viewer.html', body)
        self.assertNotIn('后台', body)                # 后台那条提示只在父进程打印一次


if __name__ == '__main__':
    unittest.main(verbosity=2)
