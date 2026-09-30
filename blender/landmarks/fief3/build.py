"""第三席封地（河谷）——只做外观（五席封地共用 blender/landmarks/fief_scene.py，本文件只选预设）。
设定见 docs/landmarks/fief3.md，检查清单见 docs/landmarks/fief3.checklist.md。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final fief3）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/fief3/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/fief3.jpg [--blend /tmp/fief3.blend] [--log /tmp/fief3.log]
cam: c1 俯瞰全域 / c2 从城镇看城堡 / under 看骑士团驻地
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa
import fief_scene as F  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/fief3.jpg', blend='', log='', exposure='-0.2'))
# 相机：(位置, 目标, 焦距)。c1 俯瞰全域 / c2 看城堡 / under 看骑士团驻地；landmark.py final 按这里的 cN 行找定稿镜头
CAMS = {
    'c1': ((330, -330, 220), (-10, 0, 10), 30),
    'c2': ((28, -34, 26), (-120, 62, 36), 30),
    'under': ((-110, -160, 40), (-175, -80, 12), 30),
}
F.run('fief3', A, CAMS)
