"""衣帽间 A（Modenese 意式古典）出图：打开本地 blend，按机位出图。

用法（仓库根目录）：
  blender -b blender/data/props/wardrobe_a/wardrobe_a.blend --python blender/props/wardrobe_a/render.py -- \
      --cam wide --res 3000 --samples 256 --out docs/drafts/wardrobe_A_wide.jpg
cam: wide 全景 / island 中岛 / shoes 鞋墙 / silk 睡袍 / tray 中岛玻璃抽屉里的丝袜（伊甸字母纹）。blend 与 glb 是本地素材（blender/data/ 不进仓库）。
"""
import math, sys
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
A = dict(cam='wide', res='1000', samples='48', out='/tmp/wardrobe.jpg')
for k, v in zip(argv[::2], argv[1::2]):
    A[k.lstrip('-')] = v

# 机位：位置、看向点、焦距（mm）
CAMS = {
    'wide':   ((3.0, 0.22, 1.60), (3.0, 5.0, 1.55), 22),
    'island': ((1.55, 1.05, 1.75), (3.0, 2.75, 0.85), 30),
    'shoes':  ((4.35, 3.35, 1.30), (5.95, 3.75, 1.20), 30),
    'silk':   ((5.05, 1.55, 1.35), (3.5, 3.05, 0.95), 35),
    'tray':   ((3.0, 2.45, 1.45), (3.0, 3.1, 0.9), 40),
}
pos, tgt, lens = CAMS[A['cam']]
import os
MONO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'eden_monogram.png')   # 自创伊甸字母纹（丝袜贴图），不用任何商标
for im in bpy.data.images:
    if im.name.startswith('eden_monogram'):
        im.filepath = MONO; im.reload()
sc = bpy.context.scene
cam = sc.camera
cam.location = pos
cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = lens
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type != 'CPU'
sc.cycles.device = 'GPU'
r = int(A['res'])
sc.render.resolution_x, sc.render.resolution_y = r, round(r * 2 / 3)
sc.render.resolution_percentage = 100
sc.cycles.samples = int(A['samples'])
sc.cycles.use_denoising = True
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = 90
sc.render.filepath = A['out']
bpy.ops.render.render(write_still=True)
