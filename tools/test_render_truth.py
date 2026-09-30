#!/usr/bin/env python3
"""R2 T1 regression: a run that exits 0 is only a success when its log is clean and its declared output is fresh.
Unit cases for tools/render_truth.py plus end-to-end runs of tools/blender_run.sh against a fake Blender
(crash-with-rc-0, missing output, stale output, clean run).  Usage: python3 tools/test_render_truth.py"""
import os, shutil, subprocess, sys, tempfile, textwrap, time, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render_truth as T  # noqa: E402

TRACE = 'Traceback (most recent call last):\n  File "x.py", line 3, in <module>\nValueError: boom\n'


class Unit(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.d, True)

    def log(self, text):
        p = os.path.join(self.d, 'run.log')
        open(p, 'w').write(text)
        return p

    def out(self, name='o.png', age=0):
        p = os.path.join(self.d, name)
        open(p, 'w').write('x')
        os.utime(p, (time.time() - age, time.time() - age))
        return name

    def test_clean_run(self):
        o = self.out()
        self.assertEqual(T.verdict(self.log('Blender 5.0\nWROTE o.png\n'), [o], time.time() - 10, self.d), ('ok', ''))

    def test_traceback_with_rc0(self):
        st, why = T.verdict(self.log('building\n' + TRACE), [], None, self.d)
        self.assertEqual(st, 'script_error'); self.assertIn('Traceback', why)

    def test_blender_error_line(self):
        st, _ = T.verdict(self.log('Error: Python: Traceback (most recent call last):\n'), [], None, self.d)
        self.assertEqual(st, 'script_error')

    def test_benign_error_chatter_and_indented_text_pass(self):
        log = self.log('Error: Not freed memory blocks: 3\n  note: Error: handled\nmy Error: fine\n')
        self.assertEqual(T.verdict(log, [], None, self.d)[0], 'ok')

    def test_missing_output(self):
        st, why = T.verdict(self.log('done\n'), ['nope.png'], time.time(), self.d)
        self.assertEqual(st, 'no_output'); self.assertIn('nope.png', why)

    def test_stale_output(self):
        o = self.out(age=600)
        st, why = T.verdict(self.log('done\n'), [o], time.time() - 60, self.d)
        self.assertEqual(st, 'stale_output'); self.assertIn(o, why)

    def test_output_written_during_the_run_is_fresh(self):
        start = time.time() - 30
        o = self.out(age=5)
        self.assertEqual(T.verdict(self.log('ok\n'), [o], start, self.d)[0], 'ok')

    def test_absolute_output_and_directory(self):
        o = os.path.join(self.d, 'abs.png'); open(o, 'w').write('x')
        sub = os.path.join(self.d, 'sub'); os.makedirs(sub)
        os.utime(sub, (1, 1))                      # directory mtime is ignored; existence is enough
        self.assertEqual(T.verdict(self.log('ok\n'), [o, 'sub'], time.time() - 10, self.d)[0], 'ok')

    def test_script_outs_reads_only_the_script_argv(self):
        a = ['--log', 'x.log', '--', '-b', '--python-expr', 'pass', '--', '--cam', 'c1', '--out', 'map/art/a.png']
        self.assertEqual(T.script_outs(a), ['map/art/a.png'])
        self.assertEqual(T.script_outs(['-b', '--out', 'no-separator.png']), [])


FAKE = textwrap.dedent('''\
    #!/bin/bash
    # fake Blender: FAKE_MODE = clean | crash0 | noout | stale ; --out <path> is the last script arg
    out=""; prev=""
    for a in "$@"; do [ "$prev" = "--out" ] && out=$a; prev=$a; done
    echo "Blender fake"
    case "$FAKE_MODE" in
      clean)  mkdir -p "$(dirname "$out")"; echo x > "$out"; echo "WROTE $out" ;;
      crash0) echo "Traceback (most recent call last):"; echo "  File \\"b.py\\", line 9"; echo "KeyError: 'c7'"; exit 0 ;;
      noout)  echo "all good, honest" ;;
      stale)  echo "all good, honest" ;;
    esac
    exit 0
''')


class BlenderRun(unittest.TestCase):
    """blender_run.sh in a throw-away tree so logs/render_times.csv of the real repo stays untouched."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root, True)
        os.makedirs(os.path.join(self.root, 'tools'))
        for f in ('blender_run.sh', 'render_truth.py'):
            shutil.copy(os.path.join(HERE, f), os.path.join(self.root, 'tools', f))
        self.fake = os.path.join(self.root, 'fake_blender')
        open(self.fake, 'w').write(FAKE); os.chmod(self.fake, 0o755)

    def run_job(self, mode):
        env = dict(os.environ, BLENDER=self.fake, FAKE_MODE=mode, EDEN_TEST_NOWAIT='1', EDEN_WATCHDOG='0',
                   EDEN_PREFLIGHT_DONE='1', EDEN_GPU_LOCK=os.path.join(self.root, 'gpu.lock'), EDEN_PY=sys.executable,
                   TMPDIR=self.root)
        env.pop('EDEN_TRUTH', None)
        r = subprocess.run(['bash', os.path.join(self.root, 'tools', 'blender_run.sh'), '--log', 'logs/j.log', '--asset', 't',
                            '--kind', 'draft', '--', '-b', '--', '--out', 'map/art/o.png'],
                           cwd=self.root, env=env, capture_output=True, text=True, timeout=60)
        verdict = dict(l.split('=', 1) for l in open(os.path.join(self.root, 'logs', 'j.log.verdict')).read().splitlines() if '=' in l)
        return r, verdict

    def seed_output(self, age):
        p = os.path.join(self.root, 'map', 'art', 'o.png')
        os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w').write('old')
        os.utime(p, (time.time() - age, time.time() - age))

    def test_clean_run_is_ok(self):
        r, v = self.run_job('clean')
        self.assertEqual((r.returncode, v['status']), (0, 'ok'), r.stderr)

    def test_crash_with_rc0_is_failed(self):
        r, v = self.run_job('crash0')
        self.assertEqual((r.returncode, v['status']), (70, 'script_error'), r.stderr)
        self.assertIn('KeyError', r.stderr)            # the log tail is shown

    def test_missing_output_is_failed(self):
        r, v = self.run_job('noout')
        self.assertEqual((r.returncode, v['status']), (70, 'no_output'), r.stderr)

    def test_stale_output_is_failed(self):
        self.seed_output(age=3600)
        r, v = self.run_job('stale')
        self.assertEqual((r.returncode, v['status']), (70, 'stale_output'), r.stderr)

    def test_failure_is_recorded_in_the_csv(self):
        self.run_job('crash0')
        rows = open(os.path.join(self.root, 'logs', 'render_times.csv')).read().splitlines()
        self.assertIn('script_error', rows[-1])


if __name__ == '__main__':
    unittest.main()
