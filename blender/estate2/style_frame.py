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
}
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
    return p.parse_args(a)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def gpu(scene, samples):
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.refresh_devices()
    n = 0
    for d in prefs.devices:
        d.use = d.type == 'METAL'
        n += d.use
    if not n:
        raise SystemExit('没有 Metal GPU，按规则不回退 CPU')
    c = scene.cycles
    c.device = 'GPU'
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
    rz = math.radians(SUN_AZ - 90) if light == 'day' else _hdri_sun_az(env.image) - math.radians(SUN_AZ)
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
    cam.location = pos
    cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    cd.clip_start, cd.clip_end = (0.1 if view == 'terrace' else 5), 30000
    if view == 'top':
        cd.type = 'ORTHO'
        cd.ortho_scale = 720
        scene.render.resolution_x, scene.render.resolution_y = res, int(res * 0.78)
    else:
        cd.lens = lens
        cd.sensor_width = 36
        scene.render.resolution_x, scene.render.resolution_y = res, int(res * (0.667 if view == 'terrace' else 0.625))
    scene.render.resolution_percentage = 100


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
    world(scene, a.light)
    terrain.build_island(res_m=1.0 if a.view == 'crop' else 1.2)
    terrain.build_lake()
    terrain.build_cloudsea()
    buildings.build_all()
    M = buildings.mats()
    tropic = sketchfab.build(M['plain'], M['wallstone'])
    print(f'[style_frame] 建筑完成 {time.time() - t0:.0f}s')
    vegetation.build(a.density, tropic_protos=tropic)
    print(f'[style_frame] 植被完成 {time.time() - t0:.0f}s')
    camera(scene, a.view, a.res)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = a.out
    if a.save:
        bpy.ops.wm.save_as_mainfile(filepath=a.save)
    bpy.ops.render.render(write_still=True)
    print(f'[style_frame] 完成 {a.out} {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
