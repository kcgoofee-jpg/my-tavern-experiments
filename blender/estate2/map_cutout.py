"""伊甸 r4 的地图正交俯视（--view map，0.375 m/px）出一张带透明底的「抠图」，再贴进上层底图的伊甸岛位置。

用法（仓库根目录）：
  blender -b -P blender/estate2/map_cutout.py -- --view map --res 2000 --samples 64 --out /tmp/eden_map.png
  python3 tools/eden_into_upper.py /tmp/eden_map.png map/art/tc_upper_full.png   # 合成 + 重切 DZI
与 style_frame.py 完全同一场景，只是白云底对相机隐藏、胶片透明（岛外 alpha = 0）。
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import bpy
from estate2 import terrain
import style_frame as sf

_orig = terrain.build_white_floor
def _hidden_floor(*a, **k):
    ob = _orig(*a, **k); ob.visible_camera = False
    bpy.context.scene.render.film_transparent = True
    return ob
terrain.build_white_floor = _hidden_floor
sf.terrain.build_white_floor = _hidden_floor
sf.main()
