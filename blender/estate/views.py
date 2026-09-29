# 伊甸庄园 · 视图：固定等轴相机、光照、剖切（隐藏上层 + 夹紧墙到楼面 + 1.2 m）、「全部」错层、近景。
# 所有权：SHELL 建造者。
# 接口：
#   setup(view, ctx) → 相机物体        view ∈ VIEWS（ext / all / B1 / F1…F5 / island）
#   closeup(room_id, shot, ctx) → 相机  shot = rooms.closeups(room) 的一项
#   render(path, ctx, crops=())         按 --crops 逐块渲（语义同 tc_common.Layer.finish）
# 同一相机、同一光照：ext 与 F1–F5 的相机完全相同，楼层切换时画面对齐；all 用同一朝向、单独取景；island 看整岛。
import math, os
import bpy
from mathutils import Vector
from . import core, plan

VIEWS = ['ext', 'all', 'F1', 'F2', 'F3', 'F4', 'F5', 'B1', 'island']
ASPECT = 0.75                                   # 高 / 宽（2000 × 1500）
CAM = dict(azimuth=-30.0,                       # 相机从正面偏西看（度；0 = 正对正面 −y，负值 = 往西转）
           elevation=40.0,                      # 俯角（度）
           target=(0.0, -12.0, 4.0),            # 取景中心（府邸坐标）
           ortho=250.0,                         # 画面宽（米）：五段式全宽 204 m + 前庭一部分
           dist=800.0)
FRAMES = {'all': dict(target=(0.0, 95.0, 30.0), ortho=330.0), 'island': dict(target=(0.0, -25.0, 0.0), ortho=760.0)}
ALL_STEP = (0.0, 48.0, 14.0)                    # 「全部」：第 k 层（F1 = 0）整体平移 k × ALL_STEP（米），逐层往后、往上错开
SUN = dict(azimuth=-35.0, elevation=45.0, energy=3.2, color=(1.0, 0.96, 0.90), angle=1.5)    # 太阳在南偏西（与 CAM 同一套方位角），照亮正立面与西侧；
                                                # 注意：天城上层底图的太阳（tc_common.SUN_ROT）从西北来，庄园图不跟它，保证正面受光
SKY = dict(color=(0.60, 0.68, 0.80), strength=0.55)


def _cam(target, ortho, ctx):
    sc = ctx.scene
    cam = bpy.data.objects.get('est_cam')
    if cam is None:
        cd = bpy.data.cameras.new('est_cam'); cam = bpy.data.objects.new('est_cam', cd); sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho; cam.data.clip_start = 1.0; cam.data.clip_end = 3000.0
    az, el = math.radians(CAM['azimuth']), math.radians(CAM['elevation'])
    d = Vector((math.sin(az), -math.cos(az), math.tan(el) * 1.0)).normalized()           # 目标 → 相机
    cam.location = Vector(target) + d * CAM['dist']
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    return cam


def lights(ctx):
    sc = ctx.scene
    if bpy.data.objects.get('est_sun') is None:
        sd = bpy.data.lights.new('est_sun', 'SUN'); sd.energy = SUN['energy']; sd.color = SUN['color']; sd.angle = math.radians(SUN['angle'])
        so = bpy.data.objects.new('est_sun', sd); sc.collection.objects.link(so)
        az, el = math.radians(SUN['azimuth']), math.radians(SUN['elevation'])
        to_sun = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
        so.rotation_euler = (-to_sun).to_track_quat('-Z', 'Y').to_euler()
    if sc.world is None: sc.world = bpy.data.worlds.new('est_sky')
    w = sc.world; w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (*SKY['color'], 1); bg.inputs['Strength'].default_value = SKY['strength']


def _floor_objects(fl):
    c = bpy.data.collections.get(fl)
    return list(c.all_objects) if c else []


def _reset():
    for fl in plan.FLOOR_ORDER:
        c = bpy.data.collections.get(fl)
        if c: c.hide_render = False; c.hide_viewport = False
        r = bpy.data.objects.get(f'{fl}.root')
        if r: r.location = (0, 0, 0)
        for o in _floor_objects(fl):
            o.hide_render = False; o.hide_viewport = False; core.set_cut(o, None)
    s = bpy.data.collections.get(core.SITE)
    if s: s.hide_render = False; s.hide_viewport = False


def _cut_floor(fl, dz=0.0):
    """剖切 fl：该层 upper 物体隐藏，cut 物体夹紧到楼面 + CUT。"""
    zc = plan.fz(fl) + plan.CUT + dz
    for o in _floor_objects(fl):
        if o.get(core.PROP_UPPER): o.hide_render = True; o.hide_viewport = True
        elif o.get(core.PROP_CUT): core.set_cut(o, zc)


def setup(view, ctx):
    if view not in VIEWS: raise SystemExit(f'unknown view {view!r}; use one of {VIEWS}')
    _reset(); lights(ctx)
    if view in plan.FLOORS:
        k = plan.FLOOR_ORDER.index(view)
        for fl in plan.FLOOR_ORDER[k + 1:]:
            c = bpy.data.collections.get(fl)
            if c: c.hide_render = True; c.hide_viewport = True
        bpy.context.view_layer.update()
        _cut_floor(view)
        return _cam(CAM['target'], CAM['ortho'], ctx)
    if view == 'all':
        s = bpy.data.collections.get(core.SITE)
        if s: s.hide_render = True; s.hide_viewport = True
        b1 = bpy.data.collections.get('B1')
        if b1: b1.hide_render = True; b1.hide_viewport = True
        for k, fl in enumerate(plan.FLOOR_ORDER[1:]):
            r = core.floor_root(fl); r.location = tuple(k * v for v in ALL_STEP)
        bpy.context.view_layer.update()
        for k, fl in enumerate(plan.FLOOR_ORDER[1:]):
            _cut_floor(fl, dz=k * ALL_STEP[2])
        f = FRAMES['all']; return _cam(f['target'], f['ortho'], ctx)
    bpy.context.view_layer.update()
    if view == 'island':
        f = FRAMES['island']; return _cam(f['target'], f['ortho'], ctx)
    return _cam(CAM['target'], CAM['ortho'], ctx)


def closeup(room_id, shot, ctx):
    """近景：透视相机；该层剖切（楼上隐藏），不夹紧本层墙，改为隐藏 shot['hide'] 列的物体。"""
    room = plan.ROOM_BY_ID[room_id]
    _reset(); lights(ctx)
    k = plan.FLOOR_ORDER.index(room['floor'])
    for fl in plan.FLOOR_ORDER[k + 1:]:
        c = bpy.data.collections.get(fl)
        if c: c.hide_render = True
    for o in _floor_objects(room['floor']):
        if any(o.name.startswith(p) for p in shot.get('hide', [])): o.hide_render = True
    sc = ctx.scene
    cam = bpy.data.objects.get('est_cam_cu')
    if cam is None:
        cd = bpy.data.cameras.new('est_cam_cu'); cam = bpy.data.objects.new('est_cam_cu', cd); sc.collection.objects.link(cam)
    cam.data.type = 'PERSP'; cam.data.lens = shot.get('lens', 24); cam.data.clip_start = 0.05
    cam.location = shot['eye']
    cam.rotation_euler = (Vector(shot['target']) - Vector(shot['eye'])).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    return cam


def configure(ctx, res, samples):
    sc = ctx.scene
    sc.render.engine = 'CYCLES'
    import tc_common as _tc                     # 渲染守卫：以前这里写死 sc.cycles.device = 'CPU'，云端白等
    _tc.setup_render_device(sc)
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    try:
        import _cycles
        sc.cycles.use_denoising = bool(getattr(_cycles, 'with_openimagedenoise', True))
    except ImportError: pass
    sc.render.resolution_x = res; sc.render.resolution_y = int(round(res * ASPECT)); sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in type(sc.view_settings).bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.film_transparent = False


def render(path, ctx, crops=()):
    """渲到 path；crops = [(名字, (x0, y0, x1, y1))]（归一化，左上原点）时逐块渲到 path 同目录的 <名字>.png。"""
    sc = ctx.scene
    import tc_common as tc
    if crops:
        outs = []
        for name, box in crops:
            tc.set_crop(sc, box); p = os.path.join(os.path.dirname(path), name + '.png'); sc.render.filepath = p
            bpy.ops.render.render(write_still=True); outs.append(p); print('WROTE', p)
        sc.render.use_border = False
        return outs
    sc.render.use_border = False
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sc.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True); print('WROTE', path, sc.render.resolution_x, sc.render.resolution_y)
    return [path]
