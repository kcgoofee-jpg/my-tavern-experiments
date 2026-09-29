"""tools/landmark.py board 用的包装：跑一遍 blender/landmarks/<id>/build.py（照常渲染），然后把场景里每个
导出组（非 bg_* 网格对象）的包围盒中心投到渲染相机上，写成 tools/annotate_board.py 的锚点 JSON。
build.py 不用改：它的参数解析会忽略这里多出来的 --build / --anchors。

用法（仓库根目录，通常经 tools/blender_run.sh）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/lm_anchors.py', run_name='__main__')" \
      -- --build blender/landmarks/<id>/build.py --anchors /tmp/a.json --cam c1 --res 800 --samples 16 --out /tmp/a.jpg
"""
import json, os, runpy, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as _common  # noqa: E402  build.py 里 C.setup() 会调 tc_common.pick_gpu 配 GPU；
                          # 这里 import 让渲染守卫的静态扫描（render_preflight 只看 import 链）能看到。

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
A = dict(zip([k.lstrip('-') for k in argv[::2]], argv[1::2]))
runpy.run_path(A['build'], run_name='__main__')

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402

sc = bpy.context.scene
W = sc.render.resolution_x; H = sc.render.resolution_y
pts = {}
for o in sc.objects:
    if o.type != 'MESH' or o.name.startswith('bg_'):
        continue
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    ctr = sum(cs, Vector()) / 8.0
    v = world_to_camera_view(sc, sc.camera, ctr)
    if v.z <= 0 or not (0 <= v.x <= 1 and 0 <= v.y <= 1):
        continue
    pts.setdefault(o.name, []).append([round(v.x * W, 1), round((1 - v.y) * H, 1)])
with open(A['anchors'], 'w') as f:
    json.dump({'res': [W, H], 'points': pts}, f, ensure_ascii=False, indent=1)
print('ANCHORS', A['anchors'], len(pts))
