"""第五席封地（平原）——只做外观（五席封地共用 blender/landmarks/fief_scene.py，本文件只选预设）。
设定见 docs/landmarks/fief5.md，检查清单见 docs/landmarks/fief5.checklist.md。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final fief5）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/fief5/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/fief5.jpg [--blend /tmp/fief5.blend] [--log /tmp/fief5.log]
cam: c1 俯瞰全域 / c2 从城镇看城堡 / under 看骑士团驻地
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa
import fief_scene as F  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/fief5.jpg', blend='', log='', exposure='-0.2'))
# 相机：(位置, 目标, 焦距)。c1 俯瞰全域 / c2 看城堡 / under 看骑士团驻地；landmark.py final 按这里的 cN 行找定稿镜头
CAMS = {
    'c1': ((330, -330, 190), (0, 10, 6), 30),
    'c2': ((0, 20, 18), (0, 95, 16), 30),
    'under': ((-110, -130, 32), (-185, -30, 8), 30),
}
F.run('fief5', A, CAMS)
