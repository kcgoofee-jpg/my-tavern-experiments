"""estate2 风格帧入口。

blender -b -P blender/estate2/style_frame.py -- --view aerial|crop|top --res 2000 --samples 48 --out /path/out.png [--density 1.0] [--save x.blend]
只用 GPU（Cycles Metal）；开跑前先确认没有别的 Blender 在渲染（pgrep -fl "[M]acOS/Blender -b"）并 bash tools/quiet_wait.sh。
"""
import argparse, math, os, sys, time
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from estate2 import terrain, buildings, vegetation, sketchfab, layout as L   # noqa: E402
from estate2.common import DATA   # noqa: E402

VIEWS = {
    # 相机位置, 看向, 焦距 mm
    'aerial': ((-150, -335, 185), (5, -35, 14), 30),
    'crop': ((-150, -300, 120), (0, -45, 26), 42),     # 主楼群 + 前庭近景
    'wide': ((-350, -590, 320), (10, 0, -40), 30),
    'stairs': ((-45, -135, 42), (0, -72, 24), 35),     # 调试：双跑台阶 + 喷泉
    'terrace': ((18.5, -27.6, 31.8), (52, -20.5, 33.6), 24),  # r3：主楼东翼柱廊前的露台角，人眼高度     # r3：整岛（停靠平台 + 湖 / 俱乐部 / 缆车 + 林中别墅）
    'top': ((0, 0, 1500), (0, 0, 0), 0),
    'map': ((0, 0, 1500), (0, 0, 0), 0),          # r4：与上层地图同一正交俯视（tc_common：0.375 m/px，+y 朝上），2000×1500 = 750 × 562.5 m
    'cottage': ((-132, -106, 19), (-160, -80, 1.5), 42),
    'gym': ((170, -134, 16), (188, -110, 0.5), 30),
    'greystone': ((-160, -200, 55), (-222, -108, 6), 32),   # r4d Greystone 客舍，相对地面高度
    'close': ((-120, -120, 125), (0, 0, 30), 38),  # r4：主楼黄昏斜俯近景
    'whole': ((-185, -585, 415), (5, -12, -12), 30),  # r5：整岛斜俯（约 36°，参考图 11 的暖黄昏风格）
    'arrival': ((75, -420, 150), (0, -160, 12), 30),  # eden:r5：停靠平台 → 大道 → 前庭喷泉 → 主楼（南向到达）
    'lake': ((-95, 345, 120), (-5, 110, 12), 30),     # eden:r5：后湖（湖心亭 / 水榭 / 俱乐部）回望主楼
}
MAP_MPP = 0.375   # 上层地图：3000 m / 8000 px
SUN_ELEV, SUN_AZ = 24.0, 132.0   # 度；方位从 +x 逆时针，太阳在东南偏南，逆光给建筑侧光


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--view', default='aerial')
    p.add_argument('--res', type=int, default=2000)
    p.add_argument('--samples', type=int, default=48)
    p.add_argument('--density', type=float, default=1.0)
    p.add_argument('--out', default='/tmp/eden2_style_frame.png')
    p.add_argument('--save', default='')
    p.add_argument('--light', default='sunset', help='day | sunset（r3：kiara_8_sunset HDRI + 低暖太阳）')
    p.add_argument('--region', default='', help='局部重渲：世界坐标包围盒 x0,y0,z0,x1,y1,z1；只渲这块（render border + crop），旁写 <out>.region.json，再用 tools/region_patch.py 合回整图')
    p.add_argument('--region-pad', type=int, default=24, help='局部重渲外扩像素（合成时做羽化）')
    return p.parse_args(a)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def gpu(scene, samples):
    """唯一设备入口（渲染守卫）：eden_guard.setup_render_device —— OPTIX → CUDA → METAL，没有 GPU 直接中止。
    2026-09-29 迁移：以前这里直接把设备类型钉成 Metal、没有 Metal 就 SystemExit，
    **只认 Mac —— 云端 Linux + RTX 跑不了**（庄园 / 地标的 glb 导出因此在云端被卡住）。"""
    scene.render.engine = 'CYCLES'
    import eden_guard
    eden_guard.setup_render_device(scene)
    c = scene.cycles
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.02
    c.use_denoising = True
    c.denoiser = 'OPENIMAGEDENOISE'
    c.max_bounces = 6
    c.diffuse_bounces = 3
    c.glossy_bounces = 2
    c.transparent_max_bounces = 12
    c.transmission_bounces = 2
    c.caustics_reflective = c.caustics_refractive = False
    c.use_camera_cull = True
    c.camera_cull_margin = 0.15
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -0.1


LIGHTS = {
    # hdri, 太阳高度°, 方位°(从 +x 逆时针，太阳所在方向), 太阳能量, 颜色, HDRI 强度
    'day': ('kloofendal_48d_partly_cloudy_puresky_2k.hdr', 24.0, 132.0, 5.5, (1.0, 0.87, 0.72), 0.4),
    'sunset': ('kiara_8_sunset_2k.hdr', 11.0, -52.0, 5.0, (1.0, 0.66, 0.4), 0.55),
    # r4：上层地图的太阳（tc_common.SUN_ROT = (40°, 0, 215°) → 高度 50°、方位 125°，能量 3.2，色 (1, .96, .9)）
    'map': ('kloofendal_48d_partly_cloudy_puresky_2k.hdr', 50.0, 125.0, 3.2, (1.0, 0.96, 0.9), 0.35),
}


def _hdri_sun_az(im):
    """找 HDRI 最亮像素，返回它的方位角（弧度，Blender 等距柱投影约定）。"""
    import numpy as np
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    lum = px.reshape(h, w, 4)[..., :3].sum(-1)
    lum[: h // 2] = 0          # 只看上半球
    r, c = np.unravel_index(np.argmax(lum), lum.shape)
    u = (c + 0.5) / w
    return (0.5 - u) * 2 * math.pi


def world(scene, light='sunset'):
    global SUN_ELEV, SUN_AZ
    hdr, SUN_ELEV, SUN_AZ, energy, scol, hstr = LIGHTS[light]
    w = bpy.data.worlds.new('e2_world')
    scene.world = w
    w.use_nodes = True
    N, Lk = w.node_tree.nodes, w.node_tree.links
    for n in list(N):
        N.remove(n)
    out = N.new('ShaderNodeOutputWorld')
    bg = N.new('ShaderNodeBackground')
    env = N.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(DATA, 'hdri', hdr))
    tc = N.new('ShaderNodeTexCoord')
    mp = N.new('ShaderNodeMapping')
    rz = math.radians(SUN_AZ - 90) if light in ('day', 'map') else _hdri_sun_az(env.image) - math.radians(SUN_AZ)
    mp.inputs['Rotation'].default_value = (0, 0, rz)
    Lk.new(tc.outputs['Generated'], mp.inputs['Vector'])
    Lk.new(mp.outputs['Vector'], env.inputs['Vector'])
    Lk.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = hstr
    Lk.new(bg.outputs[0], out.inputs['Surface'])
    # 太阳
    sd = bpy.data.lights.new('sun', 'SUN')
    sd.energy = energy
    sd.angle = math.radians(0.8)
    sd.color = scol
    terrain.WARM = light == 'sunset'
    so = bpy.data.objects.new('sun', sd)
    scene.collection.objects.link(so)
    el, az = math.radians(SUN_ELEV), math.radians(SUN_AZ)
    d = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    so.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    terrain.SUN_DIR = tuple(d)
    return d


def camera(scene, view, res):
    pos, tgt, lens = VIEWS[view]
    cd = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    if view in ('cottage', 'greystone', 'gym'):
        g = L.ground_z(*tgt[:2])
        pos = (pos[0], pos[1], pos[2] + g); tgt = (tgt[0], tgt[1], tgt[2] + g)
    cam.location = pos
    cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    cd.clip_start, cd.clip_end = (0.1 if view in ('terrace', 'cottage', 'greystone', 'gym') else 5), 30000
    if view == 'map':
        cd.type = 'ORTHO'
        cam.rotation_euler = (0, 0, 0)
        w = res
        cd.ortho_scale = MAP_MPP * 2000 * (1.0)   # 画幅固定 750 m 宽；--res 只改像素数
        scene.render.resolution_x, scene.render.resolution_y = w, int(w * 0.75)
    elif view == 'top':
        cd.type = 'ORTHO'
        cd.ortho_scale = 720
        scene.render.resolution_x, scene.render.resolution_y = res, int(res * 0.78)
    else:
        cd.lens = lens
        cd.sensor_width = 36
        scene.render.resolution_x, scene.render.resolution_y = res, int(res * (0.667 if view in ('terrace', 'cottage', 'greystone', 'gym') else 0.625))
    scene.render.resolution_percentage = 100


def region_border(scene, bb, pad, out):
    """把世界坐标包围盒投到当前相机，设 render border（裁到边框），并记下像素框供 tools/region_patch.py 合成。"""
    import json, itertools
    from bpy_extras.object_utils import world_to_camera_view
    cam = scene.camera
    bpy.context.view_layer.update()
    uv = [world_to_camera_view(scene, cam, Vector(c)) for c in itertools.product((bb[0], bb[3]), (bb[1], bb[4]), (bb[2], bb[5]))]
    W, H = scene.render.resolution_x, scene.render.resolution_y
    x0 = max(0, int(min(p.x for p in uv) * W) - pad); x1 = min(W, int(math.ceil(max(p.x for p in uv) * W)) + pad)
    y0 = max(0, int(min(p.y for p in uv) * H) - pad); y1 = min(H, int(math.ceil(max(p.y for p in uv) * H)) + pad)
    r = scene.render
    r.use_border, r.use_crop_to_border = True, True
    r.border_min_x, r.border_max_x, r.border_min_y, r.border_max_y = x0 / W, x1 / W, y0 / H, y1 / H
    box = dict(W=W, H=H, left=x0, top=H - y1, right=x1, bottom=H - y0, pad=pad, bbox=bb)   # 左上原点像素
    with open(out + '.region.json', 'w') as f:
        json.dump(box, f)
    print('[region]', box)


def _plight(name, loc, power, col=(1.0, 0.72, 0.45), radius=0.6):
    ld = bpy.data.lights.new(name, 'POINT'); ld.energy = power; ld.color = col; ld.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(ob); ob.location = loc
    return ob


def night(scene):
    """r4c 夜景：月光（同一方向，冷色弱光）+ 暖窗光 + 园路 / 大道灯 + 泳池水下灯 + 喷泉灯。克制，不用霓虹。"""
    import numpy as np
    for o in scene.objects:
        if o.type == 'LIGHT' and o.data.type == 'SUN':
            o.data.energy = 0.09; o.data.color = (0.62, 0.72, 1.0)
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.012
    fl = bpy.data.materials.get('e2_white_floor')
    if fl:
        next(n for n in fl.node_tree.nodes if n.type == 'EMISSION').inputs['Color'].default_value = (0.022, 0.028, 0.045, 1)
    M = buildings.mats()
    for k, c, st in (('shutter', (1.0, 0.66, 0.36), 7.0), ('glass', (1.0, 0.66, 0.36), 5.0), ('greenglass', (1.0, 0.75, 0.45), 2.0)):
        b = next(n for n in M[k].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Emission Color'].default_value = (*c, 1); b.inputs['Emission Strength'].default_value = st
    b = next(n for n in M['pool'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Emission Color'].default_value = (0.15, 0.75, 0.85, 1); b.inputs['Emission Strength'].default_value = 0.8
    n = 0
    main_ids = {b[0] for b in L.MAIN}
    for spec in L.all_buildings():   # 窗光溢到露台：每栋四角外 2.5 m、离地 3 m 的暖点光
        bid, cx, cy, w, d, fl_, rd, *_ = spec
        z = L.ground_z(cx, cy)
        pw = 500 if w * d > 300 else 260
        if bid in main_ids:   # r5（遗留：夜景主楼光晕偏宽）：主楼群 13 个体量挤在一起，灯减弱、贴墙收近
            pw *= 0.55
        for sx in (-1, 1):
            for sy in (-1, 1):
                off = 1.2 if bid in main_ids else 2.5
                x, y = buildings.rot2(sx * (w / 2 + off), sy * (d / 2 + off), math.radians(rd))
                _plight(f'win{n}', (cx + x, cy + y, z + 3.0), pw); n += 1
    lamps = []
    for pts, w in L.DRIVES[:4]:
        for sgn in (-1, 1):
            lamps += [(x + 0, y, sgn) for x, y in buildings._resample(pts, 14.0)]
    lamps = [(x + (w / 2 + 1.2) * 0, y) for x, y, _ in lamps]
    for pts in L.FOOTPATHS:
        lamps += [tuple(p) for p in buildings._resample(pts, 16.0)]
    for y in np.arange(-246, -150, 12):   # 大道灯
        lamps += [(-36.5, y), (36.5, y), (-4.5, y), (4.5, y)]
    for x, y in lamps:
        _plight(f'lamp{n}', (x, y, L.ground_z(x, y) + 3.2), 60, (1.0, 0.78, 0.52), 0.15); n += 1
    # r5（遗留：夜景东林全黑）：树屋灯笼、观景台灯柱、东林林窗边的庭院灯
    for x, y, _ in L.TREEHOUSES:
        _plight(f'th{n}', (x, y, L.ground_z(x, y) + 7.5), 180, (1.0, 0.7, 0.42), 0.4); n += 1
    for pid in L.LOOKOUTS:
        p = next(q for q in L.PADS if q['id'] == pid)
        for a in (0.8, 2.4, 4.0, 5.6):
            x, y = p['c'][0] + (p['r'][0] - 1.2) * math.cos(a), p['c'][1] + (p['r'][1] - 1.2) * math.sin(a)
            _plight(f'look{n}', (x, y, L.ground_z(x, y) + 2.6), 90, (1.0, 0.78, 0.52), 0.15); n += 1
    gx, gy = np.meshgrid(np.arange(115, 320, 9.0), np.arange(-90, 200, 9.0))
    gx, gy = gx.ravel(), gy.ravel()
    g = L.glades(gx, gy)
    edge = (g > 0.35) & (g < 0.65) & (L.edge_dist(gx, gy) > 15) & (((gx * 0.37 + gy * 0.59) % 1.0) < 0.35)
    for x, y in zip(gx[edge], gy[edge]):
        _plight(f'glade{n}', (x, y, L.ground_z(x, y) + 3.0), 70, (1.0, 0.76, 0.5), 0.2); n += 1
    fx, fy = L.FOUNTAIN
    for a in range(6):
        _plight(f'fount{a}', (fx + 6 * math.cos(a), fy + 6 * math.sin(a), L.TERRACE_Z + 1.2), 250, (1.0, 0.9, 0.75)); n += 1
    print(f'[night] {n} 盏灯')


def mist(scene):
    """空气透视：体积雾太贵，用合成里的 Mist pass 叠一层淡蓝。"""
    scene.view_layers[0].use_pass_mist = True
    scene.world.mist_settings.start = 500
    scene.world.mist_settings.depth = 3500
    scene.world.mist_settings.falloff = 'QUADRATIC'


def main():
    a = args()
    t0 = time.time()
    reset()
    scene = bpy.context.scene
    gpu(scene, a.samples)
    world(scene, 'map' if a.view == 'map' else (a.light if a.light != 'night' else 'sunset'))
    if a.view == 'map':   # 与地图管线一致：Standard 视图变换
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'None'
        scene.view_settings.exposure = 0.0
    terrain.build_island(res_m=0.6 if a.view in ('cottage', 'greystone', 'gym') else 1.0 if a.view in ('crop', 'close') else (0.6 if a.view == 'map' and a.res > 1500 else 1.0 if a.view == 'map' else 1.2))
    terrain.build_lake()
    if a.view == 'map':
        terrain.build_white_floor()
    else:
        terrain.build_cloudsea()
    buildings.build_all()
    M = buildings.mats()
    tropic = sketchfab.build(M['plain'], M['wallstone'])
    print(f'[style_frame] 建筑完成 {time.time() - t0:.0f}s')
    vegetation.build(a.density, tropic_protos=tropic)
    print(f'[style_frame] 植被完成 {time.time() - t0:.0f}s')
    if a.light == 'night':
        night(scene)
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = 'AgX - Medium High Contrast'
        scene.view_settings.exposure = 1.3
    camera(scene, a.view, a.res)
    if a.region:
        region_border(scene, [float(v) for v in a.region.split(',')], a.region_pad, a.out)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = a.out
    if a.save:
        bpy.ops.wm.save_as_mainfile(filepath=a.save)
    bpy.ops.render.render(write_still=True)
    print(f'[style_frame] 完成 {a.out} {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
