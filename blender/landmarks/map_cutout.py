"""地标三维 → 上层底图用的正交俯视「抠图」（透明底，+y 朝上，与 tiancheng_upper.py 同一太阳：高 50°、方位 125°，Standard 视图变换）。
不改 build.py：替换 common 的 camera / sky_sun / render 后原样跑它；bg_*（云海、岩石底座、远处浮岛、结界微光）不出现在抠图里。

用法（仓库根目录）：
  blender -b --factory-startup --python blender/landmarks/map_cutout.py -- --site kelly_residence --width 160 --res 640 --samples 16 --out /tmp/kelly_map.png
  --width：画幅宽（米，正方形）；--cx / --cy：画幅中心（模型坐标，米）；--rot：模型绕 z 转的角度（度，逆时针，让正面朝向岛上开阔的一侧）
然后 python3 tools/isles_into_upper.py 按岛心贴进上层整图。
"""
import math, os, runpy, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C  # noqa
import bpy  # noqa

A = C.args(dict(site='', width='160', res='640', samples='16', out='/tmp/map_cut.png', cx='0', cy='0', rot='0', exposure='0'))
SUN_AZ, SUN_EL = 125.0, 50.0                       # tc_common.SUN_ROT（天顶角 40°，z 215°）换算成太阳所在方向


def _camera(sc, pos, tgt, lens, shift_y=0.0):
    cd = bpy.data.cameras.new('cam_map'); cd.type = 'ORTHO'; cd.ortho_scale = float(A['width']); cd.clip_start = 1; cd.clip_end = 5000
    cam = bpy.data.objects.new('cam_map', cd); sc.collection.objects.link(cam)
    cam.location = (float(A['cx']), float(A['cy']), 1500); cam.rotation_euler = (0, 0, 0); sc.camera = cam
    return cam


_sky = C.sky_sun
def _sky_sun(sc, tod='day', **k):
    k.update(sun_az=SUN_AZ - float(A['rot']), sun_el=SUN_EL)   # 模型转 rot 放进世界 → 模型坐标里的太阳方位 = 世界方位 - rot
    return _sky(sc, 'day', **k)


def _render(sc, out, res, aspect=1.5, blend=''):
    rot = math.radians(float(A['rot']))
    for ob in list(bpy.data.objects):
        if ob.name.startswith('bg_') or ob.name.startswith('site_island') or ob.name.startswith('props_underside'):
            ob.hide_render = True
    if rot:                                         # 转相机而不是转模型：相机绕 z 转 -rot，太阳方位 +rot，等价于模型转 rot 放进世界
        c = sc.camera; x, y = c.location.x, c.location.y
        c.rotation_euler = (0, 0, -rot)
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    sc.view_settings.exposure = float(A['exposure'])
    r = int(A['res']); sc.render.resolution_x = sc.render.resolution_y = r
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    sc.cycles.samples = int(A['samples'])
    # 渲染守卫：本脚本替换了 C.render（那一路自带 pick_gpu），原生设备设置不再执行——这里显式走唯一入口
    C.tc_common.pick_gpu(sc)
    sc.render.filepath = os.path.abspath(A['out'])
    bpy.ops.render.render(write_still=True)
    print('WROTE', A['out'])


C.camera, C.sky_sun, C.render = _camera, _sky_sun, _render
runpy.run_path(os.path.join(HERE, A['site'], 'build.py'), run_name='__main__')
