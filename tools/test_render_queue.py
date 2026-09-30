#!/usr/bin/env python3
"""渲染队列（tools/render_queue.sh）单测：worktree 共享队列 / 每任务根目录 / Mac-only 模式。
全程 DRY_RUN=1 + 临时队列目录（RQ_QROOT / RQ_QDIR / RQ_CLOUD / RQ_MAC_BUSY 覆盖项，仅测试用）+ 假云脚本，
不起 Blender、不连任何云实例。
用法：python3 tools/test_render_queue.py（smoke.sh 会跑）"""
import os, shutil, subprocess, sys, tempfile, time, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, 'render_queue.sh')


class QueueCase(unittest.TestCase):
    def setUp(self):
        self.tmp = os.path.realpath(tempfile.mkdtemp(prefix='rq_test_'))
        self.main = os.path.join(self.tmp, 'main')
        self.wt = os.path.join(self.tmp, 'wt1')
        self.qdir = os.path.join(self.tmp, 'queue')
        self.cloud = os.path.join(self.tmp, 'cloud')
        self.marker = os.path.join(self.tmp, 'cloud_calls.txt')
        for d in (self.main, self.wt, self.cloud):
            os.makedirs(d)
        # 假云脚本：每被调用一次就往 marker 追加一行，状态恒 IDLE
        open(os.path.join(self.cloud, 'remote.env'), 'w').close()
        for name, out in (('status.sh', 'echo IDLE'), ('sync.sh', 'true'), ('render.sh', 'true')):
            with open(os.path.join(self.cloud, name), 'w') as f:
                f.write(f'#!/usr/bin/env bash\necho "{name} $*" >> "{self.marker}"\n{out}\n')
        os.makedirs(os.path.join(self.qdir, 'pending'))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # -- helpers --
    def job(self, name, tag, root=None, args="--asset x -- -b --out map/art/_x.png"):
        fields = [tag, args] + ([root] if root else [])
        with open(os.path.join(self.qdir, 'pending', name + '.job'), 'w') as f:
            f.write('\t'.join(fields) + '\n')

    def rq(self, *argv, mac_busy='0', extra=None):
        env = dict(os.environ, DRY_RUN='1', RQ_QROOT=self.main, RQ_QDIR=self.qdir, RQ_CLOUD=self.cloud,
                   RQ_MAC_BUSY=mac_busy, EDEN_BASH_UPGRADED='1')
        env.update(extra or {})
        return subprocess.run(['bash', SCRIPT, *argv], env=env, capture_output=True, text=True, timeout=60)

    def cloud_calls(self):
        if not os.path.exists(self.marker):
            return []
        with open(self.marker) as f:
            return f.read().splitlines()

    def mac_only(self, on=True):
        p = os.path.join(self.qdir, 'MAC_ONLY')
        if on:
            open(p, 'w').close()
        elif os.path.exists(p):
            os.remove(p)

    def touch(self, sub, name, text=''):
        with open(os.path.join(self.qdir, sub, name), 'w') as f:
            f.write(text)

    def in_dir(self, sub, name):
        return os.path.exists(os.path.join(self.qdir, sub, name + '.job'))

    # -- tests --
    def test_mac_only_sends_final_to_mac_without_probing_cloud(self):
        self.mac_only()
        self.job('j1', 'final', self.main)
        r = self.rq('dispatch', '--once')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('→ mac', r.stdout)
        self.assertNotIn('cloud/', r.stdout)
        self.assertEqual(self.cloud_calls(), [], '不应有任何云脚本（ssh 入口）被调用')

    def test_mac_only_draft_and_any_also_go_to_mac(self):
        self.mac_only()
        self.job('a1', 'draft', self.main)
        r = self.rq('dispatch', '--once')
        self.assertIn('→ mac', r.stdout)
        self.job('a2', 'any', self.main)
        r = self.rq('dispatch', '--once')
        self.assertIn('→ mac', r.stdout)
        self.assertEqual(self.cloud_calls(), [])

    def test_mac_only_waits_when_mac_busy_instead_of_borrowing_cloud(self):
        self.mac_only()
        self.job('j1', 'final', self.main)
        r = self.rq('dispatch', '--once', mac_busy='1')
        self.assertNotIn('派工', r.stdout)
        self.assertTrue(self.in_dir('pending', 'j1'))
        self.assertEqual(self.cloud_calls(), [])

    def test_three_field_job_runs_inside_its_jobroot(self):
        self.mac_only()
        self.job('j1', 'final', self.wt)
        r = self.rq('dispatch', '--once')
        self.assertIn(f'演练：cd {self.wt} && bash {self.wt}/tools/blender_run.sh', r.stdout)
        self.assertIn(f'--cache-blend {self.main}/.cache/blend', r.stdout, '缓存共用主工作树')
        self.assertTrue(self.in_dir('done', 'j1'), '演练收尾后进 done')

    def test_legacy_two_field_job_still_dispatches_in_main(self):
        self.mac_only()
        self.job('old', 'draft')                       # 没有第三段
        r = self.rq('dispatch', '--once')
        self.assertIn('→ mac', r.stdout)
        self.assertIn(f'演练：cd {self.main} && bash {self.main}/tools/blender_run.sh', r.stdout)

    def test_main_tree_job_still_uses_cloud_without_mac_only(self):
        """对照组：没开 MAC_ONLY、主工作树的 final 任务照旧派云端（证明假云脚本确实会被调用）。"""
        self.job('j1', 'final', self.main)
        r = self.rq('dispatch', '--once')
        self.assertIn('→ cloud/default', r.stdout)
        self.assertTrue(any(c.startswith('render.sh') for c in self.cloud_calls()))

    def test_non_main_job_never_goes_to_cloud(self):
        self.job('j1', 'final', self.wt)
        r = self.rq('dispatch', '--once', mac_busy='1')   # Mac 忙：留在 pending，不许借云
        self.assertNotIn('cloud/', r.stdout)
        self.assertTrue(self.in_dir('pending', 'j1'))
        self.assertFalse(any(c.startswith('render.sh') for c in self.cloud_calls()))
        self.assertIn('只同步主工作树', r.stderr)
        r2 = self.rq('dispatch', '--once', mac_busy='1')   # 告警只出一次
        self.assertNotIn('只同步主工作树', r2.stderr)
        r3 = self.rq('dispatch', '--once', mac_busy='0')   # Mac 空闲：派 Mac，仍不走云
        self.assertIn('→ mac', r3.stdout)
        self.assertIn(f'演练：cd {self.wt} ', r3.stdout)
        self.assertFalse(any(c.startswith('render.sh') for c in self.cloud_calls()))

    def test_non_main_draft_never_borrows_cloud_when_mac_busy(self):
        self.job('j1', 'draft', self.wt)
        r = self.rq('dispatch', '--once', mac_busy='1')
        self.assertNotIn('cloud/', r.stdout)
        self.assertTrue(self.in_dir('pending', 'j1'))

    def test_status_reports_mode_and_orphans_and_skips_probe(self):
        self.mac_only()
        self.touch('pending', 'ghost.retry', '2\n')
        self.job('j1', 'final', self.main)
        self.touch('pending', 'j1.retry', '1\n')   # 有对应 .job，不算孤儿
        r = self.rq('status')
        self.assertIn('mode: Mac-only (logs/queue/MAC_ONLY)', r.stdout)
        self.assertRegex(r.stdout, r'孤儿文件[^\n]*：1\n')
        self.assertEqual(self.cloud_calls(), [])
        self.assertIn('dispatcher: not running', r.stdout)

    def test_orphans_are_ignored_by_dispatch(self):
        self.mac_only()
        self.touch('pending', 'ghost.retry', '2\n')
        r = self.rq('dispatch', '--once')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn('派工', r.stdout)

    def test_submit_records_the_submitting_tree_and_queue_is_shared(self):
        """真跑 submit（含渲染守卫预检）：任务落进共享队列，第三段是提交它的树（本仓库根）。"""
        repo = os.path.dirname(HERE)
        args = ['--log', os.path.join(self.tmp, 'x.log'), '--asset', 'eden_manor', '--kind', 'draft', '--res', '800',
                '--spp', '8', '--', '-b', '--factory-startup',
                '--python-expr', "import runpy; runpy.run_path('blender/eden_manor.py', run_name='__main__')",
                '--', '--res', '800', '--samples', '8', '--out', 'map/art/_x.png']
        r = self.rq('submit', 'draft', '--', *args, extra={'DRY_RUN': '0'})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        files = [f for f in os.listdir(os.path.join(self.qdir, 'pending')) if f.endswith('.job')]
        self.assertEqual(len(files), 1)
        with open(os.path.join(self.qdir, 'pending', files[0])) as f:
            fields = f.read().rstrip('\n').split('\t')
        self.assertEqual(len(fields), 3)
        self.assertEqual(fields[0], 'draft')
        self.assertEqual(fields[2], os.path.realpath(repo))

    # -- 真跑（非演练）：假的 blender_run.sh 放在 jobroot 里，验证真的 cd 过去、产物按 jobroot 验收 --
    def fake_runner(self, root, make_artifact):
        os.makedirs(os.path.join(root, 'tools'), exist_ok=True)
        with open(os.path.join(root, 'tools', 'blender_run.sh'), 'w') as f:
            f.write('#!/usr/bin/env bash\npwd > "$PWD/ran_here.txt"\n')
            if make_artifact:
                f.write('mkdir -p map/art && : > map/art/_x.png\n')

    def wait_for(self, pred, secs=15):
        end = time.time() + secs
        while time.time() < end:
            if pred():
                return True
            time.sleep(0.1)
        return False

    def test_real_run_executes_inside_jobroot_and_checks_artifact_there(self):
        self.mac_only()
        self.fake_runner(self.wt, make_artifact=True)
        self.job('j1', 'final', self.wt)
        r = self.rq('dispatch', '--once', extra={'DRY_RUN': '0'})
        self.assertIn('→ mac', r.stdout, r.stderr)
        self.assertTrue(self.wait_for(lambda: self.in_dir('done', 'j1')), '任务应在 jobroot 里跑完并进 done')
        with open(os.path.join(self.wt, 'ran_here.txt')) as f:
            self.assertEqual(os.path.realpath(f.read().strip()), self.wt)
        self.assertFalse(os.path.exists(os.path.join(self.main, 'ran_here.txt')))

    def test_real_run_missing_artifact_in_jobroot_goes_back_to_pending(self):
        self.mac_only()
        self.fake_runner(self.wt, make_artifact=False)
        os.makedirs(os.path.join(self.main, 'map', 'art'))
        self.touch_at(os.path.join(self.main, 'map', 'art', '_x.png'))        # 主树里有同名文件也不算数
        self.job('j1', 'final', self.wt)
        self.rq('dispatch', '--once', extra={'DRY_RUN': '0'})
        self.assertTrue(self.wait_for(lambda: os.path.exists(os.path.join(self.qdir, 'pending', 'j1.retry'))))
        self.assertTrue(self.in_dir('pending', 'j1'))

    def test_real_run_with_deleted_worktree_fails_cleanly(self):
        self.mac_only()
        self.job('j1', 'final', os.path.join(self.tmp, 'gone'))
        self.rq('dispatch', '--once', extra={'DRY_RUN': '0'})
        self.assertTrue(self.wait_for(lambda: os.path.exists(os.path.join(self.qdir, 'pending', 'j1.retry'))))

    def touch_at(self, path):
        with open(path, 'w'):
            pass


if __name__ == '__main__':
    unittest.main(verbosity=2)
