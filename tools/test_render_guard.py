#!/usr/bin/env python3
"""渲染守卫单测：看门狗状态机（假时钟）、估时（历史 CSV 各种列布局）、预检（参数 / helper）、
看门狗驱动（假 nvidia-smi + 假 Blender 进程）。含 2026-09-28 原域圣山事故的回归用例。
用法：python3 tools/test_render_guard.py（smoke.sh 会跑）"""
import os, subprocess, sys, tempfile, textwrap, time, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render_watchdog as W  # noqa: E402
import render_preflight as P  # noqa: E402

M = 60.0


def run(wd, script):
    """script: [(t秒, 'line' 文本 | ('gpu', util, mem) | 'tick')]；返回 [(t, kind, code)]。"""
    out = []
    for t, x in script:
        if isinstance(x, tuple):
            ev = wd.gpu_sample([(x[1], x[2])], t)
        elif x == 'tick':
            ev = wd.tick(t)
        else:
            ev = wd.feed(x, t)
        out += [(t, k, c) for k, c, _ in ev]
    return out


def gpu_every(t0, t1, util, mem, step=10):
    return [(t, ('gpu', util, mem)) for t in range(int(t0), int(t1) + 1, step)]


def kills(ev):
    return [(t, c) for t, k, c in ev if k == 'kill']


def warns(ev):
    return [c for _, k, c in ev if k == 'warn']


GPU_START = ['EDEN_PHASE=build', 'EDEN_DEVICE=OPTIX gpus=RTX_4080 allow_cpu=0 src=setup']


class StateMachine(unittest.TestCase):
    def test_healthy_gpu_render(self):
        wd = W.Watchdog(est_min=5)
        s = [(0, GPU_START[0]), (1, GPU_START[1])] + gpu_every(0, 120, 0, 1)            # 搭建 2 分钟，显卡空闲正常
        s += [(120, 'EDEN_PHASE=render'), (121, 'EDEN_DEVICE=OPTIX gpus=RTX allow_cpu=0 src=render_pre'),
              (125, 'EDEN_PROGRESS stage=kernels sample=- tile=- note=x')]
        s += [(130 + i * 10, f'EDEN_PROGRESS stage=sample sample={i}/30 tile=- note=-') for i in range(1, 31)]
        s += gpu_every(130, 430, 98, 5000)
        s += [(440, 'EDEN_PHASE=post'), (450, 'EDEN_PHASE=write'), (455, 'EDEN_PHASE=done')]
        ev = run(wd, sorted(s, key=lambda x: x[0]))
        self.assertEqual(kills(ev), [])
        self.assertEqual(warns(ev), [])
        self.assertEqual(wd.phase, 'build')

    def test_long_cpu_build_is_fine_then_warn_then_kill(self):
        wd = W.Watchdog(est_min=10)                                                      # 3E=30 分钟警告，上限 max(60,30)=60
        ev = run(wd, [(0, GPU_START[0])] + gpu_every(0, 25 * M, 0, 1, step=60))
        self.assertEqual(kills(ev), []); self.assertEqual(warns(ev), [])               # 25 分钟纯 CPU 搭建：不警告不杀
        ev = run(wd, gpu_every(26 * M, 35 * M, 0, 1, step=60))
        self.assertIn('build_over', warns(ev)); self.assertEqual(kills(ev), [])
        ev = run(wd, gpu_every(36 * M, 61 * M, 0, 1, step=60))
        self.assertEqual([c for _, c in kills(ev)], ['build_timeout'])
        self.assertEqual(wd.killed[0], 'build_timeout')

    def test_build_cap_floor_and_override(self):
        self.assertEqual(W.Watchdog(est_min=3).build_cap, 30.0)
        self.assertEqual(W.Watchdog(est_min=20).build_cap, 120.0)
        self.assertEqual(W.Watchdog(est_min=3, build_cap_min=5).build_cap, 5.0)

    def test_cpu_device_at_render_start_is_killed(self):
        wd = W.Watchdog(est_min=5)
        ev = run(wd, [(0, 'EDEN_PHASE=build'), (1, 'EDEN_DEVICE=CPU gpus= allow_cpu=0 src=setup_forced'), (30, 'tick')])
        self.assertEqual(kills(ev), [])                                                 # 搭建阶段不杀
        ev = run(wd, [(40, 'EDEN_PHASE=render')])
        self.assertEqual(kills(ev), [(40, 'cpu_fallback')])

    def test_cpu_allowed(self):
        for wd in (W.Watchdog(est_min=5, allow_cpu=True), W.Watchdog(est_min=5)):
            ev = run(wd, [(0, 'EDEN_DEVICE=CPU gpus= allow_cpu=1 src=setup'), (5, 'EDEN_PHASE=render'),
                          (6, 'EDEN_PROGRESS stage=sample sample=1/8 tile=- note=-')] + gpu_every(10, 200, 0, 1))
            self.assertEqual(kills(ev), [])

    def test_gpu_idle_60s_after_sampling_starts(self):
        wd = W.Watchdog(est_min=5)
        s = [(0, GPU_START[1]), (10, 'EDEN_PHASE=render'), (12, 'EDEN_PROGRESS stage=sample sample=1/64 tile=- note=-')]
        ev = run(wd, s + gpu_every(20, 70, 0, 1))                                      # 20..70：50 s
        self.assertEqual(kills(ev), [])
        ev = run(wd, gpu_every(80, 80, 0, 1))                                           # 60 s 连续
        self.assertEqual(kills(ev), [(80, 'gpu_idle')])

    def test_gpu_idle_reset_by_busy_sample(self):
        wd = W.Watchdog(est_min=5)
        s = [(0, GPU_START[1]), (10, 'EDEN_PHASE=render'), (12, 'EDEN_PROGRESS stage=sample sample=1/64 tile=- note=-')]
        s += gpu_every(20, 70, 0, 1) + [(75, ('gpu', 40, 3000))] + gpu_every(80, 130, 0, 1)
        self.assertEqual(kills(run(wd, s)), [])

    def test_gpu_idle_needs_low_memory_too(self):
        wd = W.Watchdog(est_min=5)                                                      # 利用率 0 但显存 3 GB：是 GPU 在同步 / 降噪间隙，不杀
        s = [(0, GPU_START[1]), (10, 'EDEN_PHASE=render'), (12, 'EDEN_PROGRESS stage=sample sample=1/64 tile=- note=-')]
        self.assertEqual(kills(run(wd, s + gpu_every(20, 300, 0, 3000))), [])

    def test_gpu_idle_not_armed_during_kernel_compile(self):
        wd = W.Watchdog(est_min=5)                                                      # 第一次 OptiX 编内核：显卡空、显存低，4 分钟内不杀
        s = [(0, GPU_START[1]), (10, 'EDEN_PHASE=render'), (15, 'EDEN_PROGRESS stage=kernels sample=- tile=- note=Loading')]
        self.assertEqual(kills(run(wd, s + gpu_every(20, 250, 0, 1))), [])
        ev = run(wd, gpu_every(260, 380, 0, 1))                                         # 过了 5 分钟宽限期再空 60 s → 杀
        self.assertEqual([c for _, c in kills(ev)], ['gpu_idle'])

    def test_stall(self):
        wd = W.Watchdog(est_min=5)
        s = [(0, GPU_START[1]), (10, 'EDEN_PHASE=render'), (20, 'EDEN_PROGRESS stage=sample sample=5/64 tile=- note=-')]
        s += gpu_every(30, 20 + 10 * M, 90, 4000, step=60)
        self.assertEqual(kills(run(wd, s)), [])
        ev = run(wd, [(20 + 10 * M + 30, 'tick')])
        self.assertEqual([c for _, c in kills(ev)], ['stall'])

    def test_kernel_stage_gets_longer_stall_budget(self):
        wd = W.Watchdog(est_min=5, arm_grace_sec=1e9)
        s = [(0, GPU_START[1]), (10, 'EDEN_PHASE=render'), (20, 'EDEN_PROGRESS stage=kernels sample=- tile=- note=Loading')]
        self.assertEqual(kills(run(wd, s + [(20 + 15 * M, 'tick')])), [])
        self.assertEqual([c for _, c in kills(run(wd, [(20 + 21 * M, 'tick')]))], ['stall'])

    def test_post_write_idle_gpu_ok_until_post_budget(self):
        wd = W.Watchdog(est_min=5)
        s = [(0, GPU_START[1]), (10, 'EDEN_PHASE=render'), (20, 'EDEN_PROGRESS stage=sample sample=64/64 tile=- note=-'),
             (30, 'EDEN_PHASE=post'), (40, 'EDEN_PHASE=write')] + gpu_every(50, 40 + 14 * M, 0, 1, step=60)
        self.assertEqual(kills(run(wd, s)), [])
        self.assertEqual([c for _, c in kills(run(wd, [(40 + 16 * M, 'tick')]))], ['stall'])

    def test_multiple_renders_return_to_build(self):
        wd = W.Watchdog(est_min=5)
        s = [(0, GPU_START[1])]
        for k in range(3):                                                              # 原域：主图 / 顶台 / 城区仰视三张
            b = 200 * k
            s += [(b + 10, 'EDEN_PHASE=render'), (b + 20, 'EDEN_PROGRESS stage=sample sample=16/16 tile=- note=-'),
                  (b + 30, ('gpu', 95, 6000)), (b + 40, 'EDEN_PHASE=post'), (b + 50, 'EDEN_PHASE=write'), (b + 60, 'EDEN_PHASE=done')]
            s += gpu_every(b + 70, b + 190, 0, 1)                                       # 两张之间的 CPU 活：显卡空闲正常
        self.assertEqual(kills(run(wd, s)), [])
        self.assertEqual(wd.renders, 3)

    def test_total_over_warns_only(self):
        wd = W.Watchdog(est_min=3, stall_min=1e9)
        s = [(0, GPU_START[1]), (10, 'EDEN_PHASE=render'), (20, 'EDEN_PROGRESS stage=sample sample=1/64 tile=- note=-')]
        s += [(20 + i * 30, f'EDEN_PROGRESS stage=sample sample={i}/400 tile=- note=-') for i in range(2, 30)]
        s += gpu_every(30, 20 + 29 * 30, 99, 8000)
        ev = run(wd, sorted(s, key=lambda x: x[0]))
        self.assertIn('total_over', warns(ev)); self.assertEqual(kills(ev), [])

    def test_regression_yuanyu_incident(self):
        """2026-09-28：原域圣山脚本没配 GPU，云端 CPU 渲 20 分钟，4080 利用率 0%、显存 1 MiB。
        现在：脚本没调用 helper → 没有 setup 的 EDEN_DEVICE 行；blender_run.sh 注入的守卫在 render_pre 报真实设备 CPU。
        (a) 进程内守卫关掉（EDEN_GUARD_NO_INPROC）时，看门狗在进入渲染的同一时刻判 cpu_fallback；
        (b) 即使设备行骗人（说 OPTIX）或缺失，采样开始后 60 s 内按 gpu_idle 杀；
        两种情况下之前 10 分钟的 CPU 搭建都不能误杀。"""
        build = [(0, 'EDEN_PHASE=build')] + gpu_every(0, 10 * M, 0, 1)
        # (a)
        wd = W.Watchdog(est_min=W.DEFAULT_EST_MIN)
        ev = run(wd, build + [(10 * M + 1, 'EDEN_PHASE=render'),
                              (10 * M + 1, 'EDEN_DEVICE=CPU gpus= allow_cpu=0 src=render_pre'),
                              (10 * M + 1, 'EDEN_ABORT=cpu_fallback 渲染开始时 Cycles 设备是 CPU')])
        self.assertEqual(kills(ev), [(10 * M + 1, 'cpu_fallback')])
        self.assertEqual(wd.aborted, None)                                             # 已经先杀了，后面的行不再处理
        # (b)
        for dev_line in ('EDEN_DEVICE=OPTIX gpus=RTX_4080 allow_cpu=0 src=render_pre', None):
            wd = W.Watchdog(est_min=W.DEFAULT_EST_MIN)
            s = build + [(10 * M + 1, 'EDEN_PHASE=render')]
            if dev_line:
                s.append((10 * M + 1, dev_line))
            s += [(10 * M + 5 + i * 20, f'EDEN_PROGRESS stage=sample sample={i}/64 tile=- note=-') for i in range(1, 60)]
            s += gpu_every(10 * M + 10, 30 * M, 0, 1)
            ev = run(wd, sorted(s, key=lambda x: x[0]))
            k = kills(ev)
            self.assertEqual([c for _, c in k], ['gpu_idle'], dev_line)
            self.assertLessEqual(k[0][0] - (10 * M + 25), 70)                            # 第一条采样行之后 ≤70 s
            if dev_line is None:
                self.assertIn('no_device_line', warns(ev))


class Estimate(unittest.TestCase):
    CSV = textwrap.dedent("""\
        date,asset,kind,res,spp,minutes,exit,host,status,wasted_min,wasted_cny
        2026-09-28 11:55,eden_aerial,64,2400,1.35,ok
        2026-09-28 11:57,eden_aerial,64,2400,9,fail
        2026-09-28,tc_mid,final,8000,128,30,0
        2026-09-28,tc_mid,final,8000,128,NA,0,autodl-RTX
        2026-09-28,tc_mid,final,8000,128,6,0,autodl-RTX,ok,0,0
        2026-09-28,tc_mid,final,8000,128,20,70,autodl-RTX,cpu_fallback,20,0.53
        2026-09-28,lm_x,draft,2000,16,4,0
        2026-09-28,lm_y,draft,2000,16,8,0
        """)

    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix='.csv'); os.write(fd, self.CSV.encode()); os.close(fd)
        self.rows = W.read_history(self.path)

    def tearDown(self):
        os.remove(self.path)

    def test_layouts(self):
        self.assertEqual(len(self.rows), 5)                                              # 丢掉 fail / NA / cpu_fallback
        a = [r for r in self.rows if r['asset'] == 'eden_aerial'][0]
        self.assertEqual((a['spp'], a['res'], a['minutes']), (64, 2400, 1.35))

    def test_same_asset_scaled_and_host(self):
        self.assertEqual(W.estimate_minutes(self.rows, 'tc_mid', 'final', 8000, 128), (18.0, '同资产'))
        self.assertEqual(W.estimate_minutes(self.rows, 'tc_mid', 'final', 8000, 128, host='autodl-RTX'), (6.0, '同资产·同机型'))
        est, _ = W.estimate_minutes(self.rows, 'tc_mid', 'final', 1024, 8, host='autodl-RTX')
        self.assertEqual(est, W.EST_FLOOR_MIN)                                           # 缩放夹 0.2 → 1.2 → 下限 3

    def test_same_kind_then_default(self):
        self.assertEqual(W.estimate_minutes(self.rows, 'lm_new', 'draft', 2000, 16), (6.0, '同类型'))
        self.assertEqual(W.estimate_minutes(self.rows, 'nothing', 'weird'), (W.DEFAULT_EST_MIN, '默认'))
        self.assertEqual(W.estimate_minutes([], None, None), (W.DEFAULT_EST_MIN, '默认'))


class Preflight(unittest.TestCase):
    EXPR = "import runpy; runpy.run_path('blender/{}', run_name='__main__')"

    def args(self, script, sargv, pre=()):
        return ['--log', 'logs/x.log', '--asset', 'a', '--kind', 'draft', '--res', '1024', '--spp', '8', *pre, '--',
                '-b', '--factory-startup', '--python-expr', self.EXPR.format(script), '--', *sargv]

    def code(self, args, root=P.ROOT):
        try:
            P.check(args, root)
            return 'ok'
        except P.Fail as e:
            return e.code

    def test_good_tc_mid_and_landmark_and_world(self):
        self.assertEqual(self.code(self.args('tiancheng_mid.py', ['--res', '1024', '--samples', '8', '--out', 'map/art/_x.png'])), 'ok')
        self.assertEqual(self.code(self.args('landmarks/cathedral/build.py', ['--res', '2000', '--out', 'x.jpg'])), 'ok')
        self.assertEqual(self.code(self.args('world/yuanyu_holy_mount.py', ['--res', '1024', '--samples', '8', '--out', 'x.jpg'])), 'ok')

    def test_regression_unknown_out_before_separator(self):
        """「未知参数 --out」：--out 放在了 blender_run.sh 的参数里。"""
        a = ['--log', 'logs/y.log', '--asset', 'world_yuanyu', '--out', 'docs/drafts/x.jpg', '--',
             '-b', '--python', 'blender/world/yuanyu_holy_mount.py', '--', '--res', '2000']
        with self.assertRaises(P.Fail) as cm:
            P.check(a)
        self.assertEqual(cm.exception.code, 'arg_error'); self.assertIn('--out', cm.exception.msg)

    def test_unknown_script_arg_with_hint(self):
        with self.assertRaises(P.Fail) as cm:
            P.check(self.args('tiancheng_mid.py', ['--res', '1024', '--sample', '8']))
        self.assertIn('--samples', cm.exception.msg)

    def test_non_numeric_res(self):
        a = self.args('tiancheng_mid.py', [])
        a[a.index('--res') + 1] = '1k'
        self.assertEqual(self.code(a), 'arg_error')

    def test_missing_helper_and_missing_script(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, 'blender'))
            open(os.path.join(d, 'blender', 'bad.py'), 'w').write(
                "import bpy\nsc = bpy.context.scene\nsc.cycles.device = 'GPU'\nbpy.ops.render.render(write_still=True)\n")
            self.assertEqual(self.code(self.args('bad.py', []), d), 'no_device_helper')
            self.assertEqual(self.code(self.args('nope.py', []), d), 'arg_error')
            no_script = ['--log', 'l', '--', '-b', '--python-expr', 'print(1)']
            self.assertEqual(self.code(no_script, d), 'no_device_helper')

    def test_allow_cpu_flag_is_a_blender_run_option(self):
        self.assertEqual(self.code(self.args('tiancheng_mid.py', ['--res', '1024'], pre=('--allow-cpu',))), 'ok')

    def test_lint_clean(self):
        errs, _ = P.lint()
        self.assertEqual(errs, [])


class Driver(unittest.TestCase):
    """真进程：假 nvidia-smi（0%、1 MiB）+ 假 Blender（写日志后空转），看门狗只杀这个 PID 并写 .wdkill。"""

    def test_kills_only_its_pid_on_gpu_idle(self):
        with tempfile.TemporaryDirectory() as d:
            smi = os.path.join(d, 'nvidia-smi')
            open(smi, 'w').write('#!/bin/sh\ncase "$1" in --query-compute-apps*) exit 0;; esac\necho "0, 1"\n')
            os.chmod(smi, 0o755)
            log = os.path.join(d, 'job.log')
            fake = os.path.join(d, 'fake_blender.py')
            open(fake, 'w').write(textwrap.dedent(f"""\
                import time, sys
                f = open({log!r}, 'a')
                for l in ['EDEN_PHASE=build', 'EDEN_DEVICE=OPTIX gpus=X allow_cpu=0 src=setup', 'EDEN_PHASE=render',
                          'EDEN_PROGRESS stage=sample sample=1/8 tile=- note=-']:
                    f.write(l + '\\n'); f.flush()
                time.sleep(60)
                """))
            bystander = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
            victim = subprocess.Popen([sys.executable, fake])
            try:
                env = dict(os.environ, EDEN_NVIDIA_SMI=smi)
                t0 = time.time()
                rc = subprocess.run([sys.executable, os.path.join(HERE, 'render_watchdog.py'), 'watch', '--log', log,
                                     '--pid', str(victim.pid), '--csv', os.path.join(d, 'none.csv'), '--sample-sec', '0.1',
                                     '--poll', '0.1', '--idle-sec', '0.5', '--grace', '1', '--expect-comm', ''],
                                    env=env, capture_output=True, text=True, timeout=30).returncode
                self.assertEqual(rc, 3)
                self.assertLess(time.time() - t0, 15)
                self.assertEqual(open(log + '.wdkill', encoding='utf-8').read().split('\n')[0], 'gpu_idle')
                self.assertIsNotNone(victim.wait(timeout=5))
                self.assertIsNone(bystander.poll())                                      # 别的进程不受影响
                self.assertIn('gpu_idle', open(log + '.watchdog', encoding='utf-8').read())
                self.assertTrue(open(log + '.wdstate', encoding='utf-8').read().startswith('hb='))
            finally:
                for p in (victim, bystander):
                    if p.poll() is None:
                        p.kill()

    def test_exits_quietly_when_job_finishes(self):
        with tempfile.TemporaryDirectory() as d:
            log = os.path.join(d, 'job.log'); open(log, 'w').write('EDEN_PHASE=build\n')
            p = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(0.5)'])
            env = dict(os.environ, EDEN_NVIDIA_SMI=os.path.join(d, 'missing'))
            rc = subprocess.run([sys.executable, os.path.join(HERE, 'render_watchdog.py'), 'watch', '--log', log, '--pid', str(p.pid),
                                 '--csv', os.path.join(d, 'none.csv'), '--poll', '0.1'], env=env, capture_output=True, timeout=30).returncode
            p.wait()
            self.assertEqual(rc, 0)
            self.assertFalse(os.path.exists(log + '.wdkill'))


if __name__ == '__main__':
    unittest.main(verbosity=1)
