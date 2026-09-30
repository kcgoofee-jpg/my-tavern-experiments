#!/usr/bin/env python3
"""blender/export_optimized.py 的单元测试（Part 9-4 烘焙导出）。

跑法：python3 tests/test_export_optimized.py（tools/smoke.sh 已接入同一命令）。
CI / 本机都没有 Blender，所以这里塞一个假 bpy：规划、命令拼装、体积预算、合并 / 减面 / 导出的编排
全部能测，而真正的 Blender 行为留给跑一次 blender_run.sh 的实地验证。
"""
import importlib.util
import io
import json
import os
import re
import shutil
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MOD_PATH = os.path.join(ROOT, 'blender', 'export_optimized.py')

_spec = importlib.util.spec_from_file_location('export_optimized', MOD_PATH)
eo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eo)


def read_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


# ---------------- 假 bpy ----------------
class FakeModList(list):
    def new(self, name, type):
        mod = types.SimpleNamespace(name=name, type=type, ratio=1.0)
        self.append(mod)
        return mod


class FakeMesh:
    def __init__(self, mats, polys=10):
        self.materials = [types.SimpleNamespace(name=m) for m in mats]
        self.polygons = [types.SimpleNamespace(vertices=[0, 1, 2]) for _ in range(polys)]


class FakeObj:
    def __init__(self, name, mats, polys=10):
        self.name, self.type = name, 'MESH'
        self.data = FakeMesh(mats, polys)
        self.modifiers = FakeModList()
        self.selected = False

    def select_set(self, v):
        self.selected = v


class FakeBpy(types.ModuleType):
    def __init__(self):
        super().__init__('bpy')
        self.joined, self.applied = [], []
        self.write_mb = 0.1
        bpy = self

        class Ops:
            class object:
                @staticmethod
                def select_all(action=None):
                    for ob in bpy.data.objects:
                        ob.selected = (action == 'SELECT')

                @staticmethod
                def join():
                    bpy.joined.append([o.name for o in bpy.data.objects if o.selected])

                @staticmethod
                def modifier_apply(modifier=None):
                    bpy.applied.append(modifier)          # 脚本传的是修改器名

            class export_scene:
                @staticmethod
                def gltf(filepath=None, export_format=None, use_selection=False):
                    os.makedirs(os.path.dirname(filepath) or '.', exist_ok=True)
                    with open(filepath, 'wb') as f:
                        f.write(b'\0' * int(bpy.write_mb * 1024 * 1024))

        self.ops = Ops()
        self.data = types.SimpleNamespace(objects=[])
        self.context = types.SimpleNamespace(view_layer=types.SimpleNamespace(objects=types.SimpleNamespace(active=None)))


def with_fake_bpy(objects):
    fake = FakeBpy()
    fake.data.objects = objects
    sys.modules['bpy'] = fake
    return fake


class ExportOptimized(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='export_opt_')
        self.out = os.path.join(self.tmp, 'out')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)
        sys.modules.pop('bpy', None)

    # ---------------- 纯函数 ----------------
    def test_lod_ratio_is_clamped_and_never_throws(self):
        self.assertEqual(eo.lod_ratio(0.45), 0.45)
        self.assertEqual(eo.lod_ratio(0), 0.05)
        self.assertEqual(eo.lod_ratio(5), 1.0)
        self.assertEqual(eo.lod_ratio('nope'), eo.DEFAULT_LOD1)
        self.assertEqual(eo.lod_ratio(None), eo.DEFAULT_LOD1)
        self.assertEqual(eo.lod_ratio(float('nan')), eo.DEFAULT_LOD1)

    def test_compression_commands(self):
        pre = ['gltf-transform']
        self.assertEqual(eo.draco_command('a.glb', 'b.glb', pre), ['gltf-transform', 'draco', 'a.glb', 'b.glb'])
        self.assertEqual(eo.ktx2_command('a.glb', 'b.glb', 'uastc', pre), ['gltf-transform', 'uastc', 'a.glb', 'b.glb'])
        self.assertEqual(eo.ktx2_command('a.glb', 'b.glb', 'nonsense', pre)[1], 'etc1s', '乱模式退回 etc1s')

    def test_compress_chain_order_and_final(self):
        steps, final = eo.compress_chain('in.glb', self.out, 'manor_lod0', draco=True, ktx2=True, tmp_dir=self.tmp)
        self.assertEqual([s['step'] for s in steps], ['draco', 'ktx2'], '先减网格再压纹理')
        self.assertEqual(steps[0]['src'], 'in.glb')
        self.assertEqual(steps[1]['src'], steps[0]['dst'], '后一步吃前一步的产物')
        self.assertEqual(final, os.path.join(self.out, 'manor_lod0.ktx2.glb'))
        only_draco, final2 = eo.compress_chain('in.glb', self.out, 'x', draco=True, ktx2=False, tmp_dir=self.tmp)
        self.assertEqual(len(only_draco), 1)
        self.assertEqual(final2, only_draco[0]['dst'])
        none, final3 = eo.compress_chain('in.glb', self.out, 'x', draco=False, ktx2=False)
        self.assertEqual((none, final3), ([], 'in.glb'))

    def test_budget_ok(self):
        ok, mb = eo.budget_ok(8 * 1024 * 1024, 8)
        self.assertTrue(ok)
        self.assertAlmostEqual(mb, 8.0, places=3)
        self.assertFalse(eo.budget_ok(9 * 1024 * 1024, 8)[0])
        self.assertTrue(eo.budget_ok(999 * 1024 * 1024, 0)[0], '预算 0 = 不设限')

    def test_plan_shapes(self):
        args = eo.parse_args(['--out', 'map/art/opt', '--name', 'manor', '--lod1', '0.4', '--draco', '--ktx2'])
        p = eo.plan(args, tmp_dir=self.tmp)
        self.assertEqual([l['file'] for l in p['lods']], ['manor_lod0.glb', 'manor_lod1.glb'])
        self.assertEqual([l['ratio'] for l in p['lods']], [1.0, 0.4])
        self.assertEqual(p['steps'], ['draco', 'ktx2', 'draco', 'ktx2'], '两级 LOD 各走一遍压缩')
        self.assertEqual(p['manifest']['manifest'], 'manor.assets.json')
        self.assertEqual(p['manifest']['ktx2'], 'etc1s')
        one = eo.plan(eo.parse_args(['--out', 'o', '--name', 'm', '--lod1', '1']), tmp_dir=self.tmp)
        self.assertEqual(len(one['lods']), 1, 'lod1=1 就是不生成第二级')

    def test_dry_run_needs_no_bpy(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = eo.main(['--out', self.out, '--name', 'manor', '--draco', '--ktx2', '--dry-run'])
        self.assertEqual(rc, 0)
        plan = json.loads(buf.getvalue())
        self.assertEqual(plan['manifest']['name'], 'manor')
        self.assertEqual(plan['compress'], [{'level': 0, 'steps': ['draco', 'ktx2']}, {'level': 1, 'steps': ['draco', 'ktx2']}])
        self.assertFalse(os.path.exists(self.out), 'dry-run 不许落任何文件')
        self.assertNotIn('bpy', sys.modules)

    # ---------------- 编排（假 bpy） ----------------
    def test_build_merges_materials_exports_lods_and_writes_manifest(self):
        fake = with_fake_bpy([FakeObj('wall_a', ['stone']), FakeObj('wall_b', ['stone']),
                              FakeObj('glass', ['glass']), FakeObj('lamp', [])])
        args = eo.parse_args(['--out', self.out, '--name', 'manor', '--lod1', '0.5', '--draco'])
        # 压缩命令换成 echo，别去动真 gltf-transform
        orig_prefix = eo.transformer_prefix
        eo.transformer_prefix = lambda: (['true'] if shutil.which('true') else ['echo'])
        try:
            log = []
            man = eo.build(args, tmp_dir=self.tmp, log=log.append)
        finally:
            eo.transformer_prefix = orig_prefix
        self.assertEqual(fake.joined, [['wall_a', 'wall_b']], '只有同材质的两件被 join')
        self.assertEqual(fake.applied, ['lod_decimate', 'lod_decimate', 'lod_decimate'], 'LOD1 逐件减面（3 个合并结果）')
        self.assertEqual([o['file'] for o in man['outputs']], ['manor_lod0.glb', 'manor_lod1.glb'])
        for o in man['outputs']:
            self.assertTrue(os.path.isfile(os.path.join(self.out, o['file'])))
        on_disk = read_json(os.path.join(self.out, 'manor.assets.json'))
        self.assertEqual(on_disk['schema'], 1)
        self.assertEqual(on_disk['lods'][1]['ratio'], 0.5)
        self.assertEqual(on_disk['warnings'], [])
        self.assertTrue(any('draco' in line for line in log), '压缩步骤有日志')

    def test_build_warns_and_exits_nonzero_when_over_budget(self):
        fake = with_fake_bpy([FakeObj('a', ['m1']), FakeObj('b', ['m2'])])
        fake.write_mb = 2.0
        buf = io.StringIO()
        orig_prefix = eo.transformer_prefix
        eo.transformer_prefix = lambda: ['true']
        try:
            with redirect_stdout(buf):
                rc = eo.main(['--out', self.out, '--name', 'big', '--lod1', '1', '--max-mb', '1'])
        finally:
            eo.transformer_prefix = orig_prefix
        self.assertEqual(rc, 1, '超预算要显式失败（CI 上能拦下来）')
        man = read_json(os.path.join(self.out, 'big.assets.json'))
        self.assertTrue(any('超过预算' in w for w in man['warnings']))

    def test_no_gpu_guard_violations(self):
        with open(MOD_PATH, encoding='utf-8') as f:
            src = f.read()
        self.assertNotIn('bpy.ops.render.render(', src, '这不是渲染脚本，不该出现渲染调用')
        self.assertNotRegex(src, r'compute_device_type\s*=(?!=)', '设备选择只许在 blender/eden_guard.py')
        self.assertRegex(src, r'(?m)^\s+import bpy', 'bpy 必须在函数里惰性 import（CI 上模块要能加载）')
        self.assertEqual(len(re.findall(r'(?m)^\s+import bpy', src)), 1, '缩进的 import bpy 只有 _bpy() 里那一处')

    def test_build_requires_bpy(self):
        sys.modules.pop('bpy', None)
        with self.assertRaises(ImportError):
            eo.build(eo.parse_args(['--out', self.out, '--name', 'x']), tmp_dir=self.tmp, log=lambda *_: None)


if __name__ == '__main__':
    unittest.main(verbosity=2)
