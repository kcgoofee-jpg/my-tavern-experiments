"""风暴殿（中层核心区；卡：奥伦帝国「镇国之柱」，由全部天灾级强者组成的帝国最高战力，听命于议会）——只做外观。
设定见 docs/landmarks/storm_hall.md。

导出组：
  walls_ext      八棱深色花岗岩 + 钢构主柱（约 130 m），四面嵌发光封印纹样
  props_podium   基座大厅：方形石构裙房 + 前庭石阶 + 钢闸门
  props_yard     后方训练场：压实地面 + 发光结界桩（无武器道具）
  props_pad      柱顶环形起降坪 + 桅杆
  props_lights   灯柱、檐下灯带
  site_ground    甲板铺装
bg_*：周边中层楼群、甲板边、磁浮高架（不导出）。

布局（米）：甲板 z=0；主柱中心 (0,0)，底径 26，顶 z=130；基座 x -35..35、y -35..35；
前庭 y -55..-35；训练场 x -30..30、y 40..90。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/storm_hall/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/sh.jpg [--blend /tmp/sh.blend] [--log /tmp/sh.log] [--exposure 0.0]
cam: c1 全景俯瞰 / c2 基座前庭仰视 / c3 训练场结界桩视高
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/sh.jpg', blend='', log='', exposure=''))

R_BASE, R_TOP, TOWER_H = 13.0, 8.0, 130.0
PX0, PX1, PY0, PY1, PH = -35.0, 35.0, -35.0, 35.0, 12.0
YX0, YX1, YY0, YY1 = -30.0, 30.0, 40.0, 90.0
UZ = 400.0


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(141)

    # ------------------------------------------------------------ 材质
    DSTONE = C.ashlar('sh_granite', (0.06, 0.06, 0.065), course=1.6, block=3.2, joint=0.008, jc=(0.03, 0.03, 0.03), var=0.07, rough=0.45)
    DSTONE2 = C.ashlar('sh_granite2', (0.09, 0.09, 0.1), course=2.2, block=3.4, joint=0.007, jc=(0.02, 0.02, 0.02), var=0.09, rough=0.4)
    STEEL = C.pbr('sh_steel', 'Metal009', 2.0, tint=(0.32, 0.32, 0.34), sat=0.2, metal=0.85)
    DARKM = C.flat('sh_darkmetal', (0.04, 0.04, 0.045), 0.35, metal=0.85, noise=0.2)
    GLASS_H = C.clear_glass('sh_glass_hall')
    SEAL = C.glow('sh_seal', (0.5, 0.7, 1.0), estr=8.0)
    SEAL2 = C.glow('sh_seal2', (0.9, 0.6, 0.2), estr=6.0)
    WARD = C.hex_ward_mat('sh_ward', c=(0.55, 0.75, 1.0), estr=2.4, alpha=0.5, scale=22.0)
    CORE = C.glow('sh_core', (0.6, 0.8, 1.0), estr=18.0)
    PAVE = C.pbr('sh_pave', 'precast_stone_paving', 3.0, tint=(0.32, 0.32, 0.34), sat=0.2)
    ASPH = C.pbr('sh_asphalt', 'asphalt_02', 5.0, tint=(0.24, 0.24, 0.26), sat=0.2, value=0.65)
    SOIL = C.flat('sh_soil', (0.06, 0.055, 0.05), 0.9, noise=0.4)
    LAMP = C.flat('sh_lamp', (1, 1, 1), 0.4, emit=(0.75, 0.85, 1.0), estr=14.0)
    RED = C.flat('sh_red', (1, 0.1, 0.05), 0.4, emit=(1.0, 0.1, 0.05), estr=10.0)

    points, spots = [], []

    # ------------------------------------------------------------ 主柱（八棱，逐层微收分）
    tower = Batch('walls_ext')
    prof = [(R_BASE, 0.0), (R_BASE, 20.0), (R_BASE - 1.5, 20.5), (R_BASE - 1.5, 55.0),
            (10.5, 55.5), (10.5, 90.0), (9.0, 90.5), (9.0, TOWER_H)]
    tower.lathe(0, 0, 0, prof, DSTONE, n=8, smooth=False)
    for z, r in ((20.3, R_BASE - 1.5), (55.3, 10.5), (90.3, 9.0)):
        tower.lathe(0, 0, z, [(r + 1.2, -0.3), (r + 1.2, 0.0), (r + 0.15, 0.0)], DSTONE2, n=8, smooth=False)
    for k in range(8):                                                       # 四面发光封印纹样（8 面轮流两种符文）
        a = k * math.tau / 8
        pts = [(math.cos(a) * (r + 0.1), math.sin(a) * (r + 0.1), dz) for (r, dz) in prof]
        tower.strip(pts, 0.6, 0.1, SEAL if k % 2 == 0 else SEAL2)
    for rr, zc in ((R_BASE - 0.5, 38.0), (10.0, 72.0)):                      # 环形结界纹（六角封印环）
        pts_ring = C.ring_pts(0, 0, lambda a: rr + 0.3, n=32)
        C.rune_ring(tower, pts_ring, zc, 0.25, SEAL)
    points.append(((0, 0, TOWER_H * 0.45), 8e4, (0.55, 0.7, 1.0)))

    # ------------------------------------------------------------ 基座大厅
    pod = Batch('props_podium')
    pod.box(PX0, PX1, PY0, PY1, 0, PH, DSTONE)
    pod.box(PX0 - 0.5, PX1 + 0.5, PY0 - 0.5, PY1 + 0.5, PH, PH + 1.2, DSTONE2)
    for k in range(6):                                                       # 前庭石阶
        z0 = -0.4 - k * 0.4
        pod.box(PX0 + 6 + k * 0.6, PX1 - 6 - k * 0.6, PY0 - 20 + k * 3.2, PY0, z0, 0, DSTONE2)
    pod.box(-6, 6, PY0 - 0.3, PY0 + 0.3, 0.2, 8.0, DARKM)                    # 钢闸门
    pod.box(-6.3, 6.3, PY0 - 0.5, PY0 - 0.2, 0.1, 8.4, STEEL)
    for f in range(3):                                                       # 侧墙窄高窗（无标识）
        z = 2.0 + f * 3.4
        for side in (-1, 1):
            pod.box(side * (PX1 - 1), side * (PX1 - 0.3), -12, 12, z, z + 2.4, GLASS_H)
    points.append(((0, PY0 - 10, 6), 2.5e4, (0.6, 0.75, 1.0)))

    # ------------------------------------------------------------ 训练场（无武器道具）
    yard = Batch('props_yard')
    yard.box(YX0, YX1, YY0, YY1, -0.05, 0, SOIL)
    for i in range(8):
        a = i * math.tau / 8
        x, y = math.cos(a) * 20, (YY0 + YY1) / 2 + math.sin(a) * 18
        yard.cyl(x, y, 0, 0.4, 2.6, DARKM, 10)
        yard.cyl(x, y, 2.6, 0.55, 0.15, WARD, 24, r2=0.55, cap=False)
        yard.sphere(x, y, 2.9, 0.3, SEAL, seg=10, rings=6)
        points.append(((x, y, 2.9), 1.5e3, (0.55, 0.75, 1.0)))
    ring_pts_yard = C.ring_pts(0, (YY0 + YY1) / 2, lambda a: 24.0, n=48)
    C.rune_ring(yard, ring_pts_yard, 0.1, 0.3, SEAL2)

    # ------------------------------------------------------------ 柱顶起降坪 + 桅杆
    pad = Batch('props_pad')
    pad.cyl(0, 0, TOWER_H, 16, 1.0, DSTONE2, 32, r2=16)
    C.beacon_ring(pad, 0, 0, TOWER_H + 1.0, 15, LAMP, n=10)
    pad.cyl(0, 0, TOWER_H + 1.0, 0.8, 14.0, STEEL, 12)
    pad.sphere(0, 0, TOWER_H + 15.0, 1.2, RED, seg=12, rings=8)

    ground = Batch('site_ground')
    ground.box(-70, 70, -70, 100, -0.06, -0.03, PAVE)
    ground.box(PX0 - 3, PX1 + 3, PY0 - 3, PY1 + 3, -0.04, -0.02, ASPH)

    lights = Batch('props_lights')
    for (x, y) in ((-40, -45), (40, -45), (-40, 45), (40, 45)):
        lights.cyl(x, y, 0, 0.16, 3.4, DARKM, 10)
        lights.sphere(x, y, 3.6, 0.3, LAMP, seg=10, rings=6)
        points.append(((x, y, 3.6), 3e3, (0.7, 0.82, 1.0)))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：中层楼群 + 甲板边 + 磁浮高架
    GLASSD = C.flat('bg_tower', (0.07, 0.08, 0.1), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.3, 0.3, 0.32), 0.8, noise=0.3)
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.0, 3.6), seed=i * 7.7) for i, c in
          enumerate(((1.0, 0.85, 0.6), (0.7, 0.85, 1.0)))]
    LAMPC = C.flat('bg_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=12.0)
    UNDER = C.flat('bg_under', (0.14, 0.13, 0.13), 0.9, noise=0.4)

    far = Batch('bg_deck')
    far.box(-2200, 2200, -2200, 2200, -6, -4, BCONC)

    tw = Batch('bg_towers')
    rb = random.Random(151)
    placed = []
    cam1 = Vector((-170.0, -220.0))
    cam_bearing = math.degrees(math.atan2(cam1.y, cam1.x)) % 360
    for k in range(46):
        for _ in range(50):
            a = rb.uniform(0, math.tau); d = rb.uniform(100, 620)
            x, y = math.cos(a) * d, math.sin(a) * d
            w, dd = rb.uniform(26, 55), rb.uniform(26, 55)
            clear = all(abs(x - px) > (w + pw) / 2 + 9 or abs(y - py) > (dd + pd) / 2 + 9 for px, py, pw, pd in placed)
            bearing = math.degrees(a) % 360
            in_cam_lane = (d < 300) and (abs((bearing - cam_bearing + 180) % 360 - 180) < 20)
            if clear and not in_cam_lane:
                break
        else:
            continue
        placed.append((x, y, w, dd))
        h = rb.uniform(80, 300)
        tw.box(x - w / 2, x + w / 2, y - dd / 2, y + dd / 2, 0, h, rb.choice(WG) if k % 3 else GLASSD)

    ov = Batch('bg_overhead')
    for (x0, x1, y0, y1) in ((-900, 900, 130, 900), (-900, 900, -900, -130)):
        ov.box(x0, x1, y0, y1, UZ, UZ + 8, UNDER)
    for kk in range(-18, 19):
        g = kk * 45.0
        if abs(g) > 130:
            ov.box(-900, 900, g - 1.5, g + 1.5, UZ - 7, UZ, BCONC)
    for i in range(120):
        x, y = rb.uniform(-800, 800), rb.uniform(-800, 800)
        if abs(y) > 130:
            ov.boxc(x, y, UZ - 7.6, 4, 4, 0.6, LAMPC)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光：夜间，冷蓝封印光
    w = bpy.data.worlds.new('w'); sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    wo = nt.nodes.new('ShaderNodeOutputWorld'); wo.name = 'World Output'
    bgn = nt.nodes.new('ShaderNodeBackground')
    bgn.inputs[0].default_value = (0.04, 0.045, 0.06, 1); bgn.inputs[1].default_value = 1.0
    nt.links.new(bgn.outputs[0], wo.inputs[0])
    ld = bpy.data.lights.new('fill', 'AREA'); ld.energy = 9e4; ld.size = 200; ld.color = (0.6, 0.72, 1.0)
    o = bpy.data.objects.new('fill', ld); sc.collection.objects.link(o); o.location = (0, -40, 200)
    for (x, y) in ((-300, 0), (300, 0), (0, 300)):
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 3e5; ld.size = 250; ld.color = (0.65, 0.78, 1.0)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, UZ - 15)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.4

    CAMS = {
        'c1': ((-190.0, -230.0, 175.0), (0.0, 10.0, 80.0), 24, 0.0),
        'c2': ((0.0, -60.0, 4.0), (0.0, -10.0, 40.0), 24, 0.0),
        'c3': ((0.0, 55.0, 2.4), (14.0, 65.0, 3.0), 26, 0.0),
    }
    cv = CAMS[A['cam']]
    C.camera(sc, cv[0], cv[1], cv[2], cv[3])
    C.render(sc, A['out'], A['res'], 1.5, A['blend'])


try:
    main()
except Exception:
    msg = traceback.format_exc()
    if A['log']:
        with open(A['log'], 'w') as f:
            f.write(msg)
    print(msg)
    raise
