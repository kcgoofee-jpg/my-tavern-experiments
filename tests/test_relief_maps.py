#!/usr/bin/env python3
"""tools/make_relief_maps.py 的单元测试（Part 9-3 浮雕微资产）。

跑法：python3 tests/test_relief_maps.py（tools/smoke.sh 已接入同一命令）。
重点：① 生成器确定性（同参数逐字节一致）；② 入库的 512² 资产 = 生成器的当前输出（防「改脚本没重跑」）；
      ③ 法线 / 粗糙度是真的有内容（不是一张纯色图）。
"""
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True   # 不在 tools/ 下留 __pycache__
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MOD_PATH = os.path.join(ROOT, 'tools', 'make_relief_maps.py')
SHIPPED = os.path.join(ROOT, 'map', 'art', 'relief')

_spec = importlib.util.spec_from_file_location('make_relief_maps', MOD_PATH)
rm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rm)


def read_bytes(path):
    with open(path, 'rb') as f:
        return f.read()


def read_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


class ReliefMaps(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='relief_')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_build_writes_three_maps_and_manifest(self):
        man = rm.build(self.tmp, 64, 'manor')
        self.assertEqual(man['schema'], 1)
        self.assertEqual(man['pattern'], 'manor')
        self.assertEqual(man['size'], [64, 64])
        self.assertTrue(man['tileable'])
        a = man['assets']['manor_facade']
        self.assertEqual(sorted([a['height'], a['normal'], a['rough']]),
                         ['manor_facade_height.png', 'manor_facade_normal.png', 'manor_facade_rough.png'])
        self.assertGreater(a['parallax'], 0)
        for name in (a['height'], a['normal'], a['rough']):
            p = os.path.join(self.tmp, name)
            self.assertTrue(os.path.isfile(p), f'{name} 没写出来')
            self.assertGreater(os.path.getsize(p), 200, f'{name} 太小，像是空图')
        on_disk = read_json(os.path.join(self.tmp, 'relief.json'))
        self.assertEqual(on_disk, man, '清单写进磁盘的内容与返回值一致')

    def test_normal_map_has_relief_and_rough_map_has_contrast(self):
        rm.build(self.tmp, 64, 'manor')
        size, normal_g = rm.read_png_gray(os.path.join(self.tmp, 'manor_facade_normal.png'))
        _, rough = rm.read_png_gray(os.path.join(self.tmp, 'manor_facade_rough.png'))
        _, height = rm.read_png_gray(os.path.join(self.tmp, 'manor_facade_height.png'))
        self.assertEqual(size, 64)
        self.assertGreater(max(normal_g) - min(normal_g), 40, '法线的绿通道要有起伏（平面法线的绿通道是常数）')
        self.assertGreater(max(height) - min(height), 80, '高度场要有窗洞 / 灰缝的落差')
        self.assertGreater(max(rough) - min(rough), 60, '粗糙度要能分出玻璃与灰缝')

    def test_generation_is_deterministic(self):
        a = tempfile.mkdtemp(prefix='relief_a_', dir=self.tmp)
        b = tempfile.mkdtemp(prefix='relief_b_', dir=self.tmp)
        rm.build(a, 64, 'manor')
        rm.build(b, 64, 'manor')
        for name in ('manor_facade_height.png', 'manor_facade_normal.png', 'manor_facade_rough.png', 'relief.json'):
            self.assertEqual(read_bytes(os.path.join(a, name)), read_bytes(os.path.join(b, name)),
                             f'{name} 两次生成不一致——有隐藏的随机源')

    def test_shipped_assets_match_the_generator(self):
        """入库的资产必须等于生成器当前输出：改了脚本就得重跑一遍（否则渲染层拿到的图与参数对不上）。"""
        if not os.path.isdir(SHIPPED):
            self.skipTest('map/art/relief 还没生成')
        man = read_json(os.path.join(SHIPPED, 'relief.json'))
        size = man['size'][0]
        out = os.path.join(self.tmp, 'regen')
        rm.build(out, size, man['pattern'])
        for name in ('relief.json',) + tuple(man['assets'][f"{man['pattern']}_facade"][k] for k in ('height', 'normal', 'rough')):
            self.assertEqual(read_bytes(os.path.join(out, name)), read_bytes(os.path.join(SHIPPED, name)),
                             f'{name} 与生成器输出不一致：跑 python3 tools/make_relief_maps.py 重生成')

    def test_unknown_pattern_is_refused(self):
        with self.assertRaises(SystemExit):
            rm.build(self.tmp, 64, 'nosuch')


if __name__ == '__main__':
    unittest.main(verbosity=2)
