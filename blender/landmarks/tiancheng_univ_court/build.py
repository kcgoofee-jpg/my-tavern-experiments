"""天城大学 + 最高法院（中层高区，同一场景；卡：维多利亚 16 岁跳级入学天城大学法学院，是最高法院首席大法官）——只做外观。
设定见 docs/landmarks/tiancheng_univ_court.md（仓库推断标注）。

导出组：
  props_univ      天城大学法学院主楼：石材立面 + 模拟法庭弧形凸窗 + 阶梯教室楼 + 图书馆连廊
  props_court     最高法院：宽台阶 + 柱廊门面 + 中央穹顶采光厅
  props_plaza     共用步行广场
  site_ground     铺装
  props_lights    灯柱
bg_*：周边中层楼群、甲板边、磁浮高架（不导出）。

布局（米）：地面 z=0；天城大学居西 x -95..-15、y -10..55；最高法院居东 x 15..95、y -20..40；广场居中。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/tiancheng_univ_court/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/tc.jpg [--blend /tmp/tc.blend] [--log /tmp/tc.log] [--exposure 0.0]
cam: c1 片区俯瞰 / c2 天城大学法学院楼 / c3 最高法院柱廊正面
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/tc.jpg', blend='', log='', exposure=''))

UX0, UX1, UY0, UY1, UH = -95.0, -15.0, -10.0, 55.0, 18.0
CX0, CX1, CY0, CY1, CH = 15.0, 95.0, -20.0, 40.0, 20.0
UZ = 380.0


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    Batch = C.Batch
    rnd = random.Random(121)

    # ------------------------------------------------------------ 材质
    STONE = C.pbr('tc_stone', 'white_sandstone_blocks_02', 2.5, tint=(0.78, 0.76, 0.72), value=0.92, sat=0.15)
    STONE_D = C.ashlar('tc_stone_d', (0.66, 0.64, 0.6), course=0.75, block=1.6, joint=0.012, jc=(0.32, 0.31, 0.28), var=0.06, rough=0.5)
    GLASS = C.glass('tc_glass', (0.1, 0.13, 0.15))
    GLASS_L = C.glass('tc_glass_l', (0.14, 0.14, 0.11), emit=(0.95, 0.9, 0.75), estr=2.0)
    METAL = C.pbr('tc_metal', 'Metal009', 2.0, tint=(0.5, 0.51, 0.53), sat=0.15, metal=0.8)
    PAVE = C.pbr('tc_pave', 'precast_stone_paving', 3.0, tint=(0.68, 0.66, 0.6), sat=0.22)
    GRASS = C.flat('tc_grass', (0.16, 0.32, 0.13), 0.8, noise=0.4)
    WOOD = C.flat('tc_wood', (0.3, 0.2, 0.12), 0.7, noise=0.3)
    LEAF = C.flat('tc_leaf', (0.15, 0.32, 0.14), 0.8, noise=0.5)
    LAMP = C.flat('tc_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.85, 0.65), estr=13.0)

    points, spots = [], []

    # ------------------------------------------------------------ 天城大学：法学院主楼 + 阶梯教室 + 图书馆连廊
    univ = Batch('props_univ')
    ucx = (UX0 + UX1) / 2
    univ.box(UX0, UX1, UY0 + 20, UY1, 0, UH, STONE)
    univ.cyl(ucx, UY0 + 20, 0, 14, UH, STONE_D, 20, r2=14, cap=False)         # 模拟法庭弧形凸窗体量
    for k in range(10):
        a = -math.pi * 0.85 + k * (math.pi * 0.7) / 10
        x = ucx + math.cos(a) * 14
        y = UY0 + 20 + math.sin(a) * 14
        univ.boxc(x, y, UH * 0.35, 2.4, 0.3, UH * 0.5, GLASS_L if k % 2 else GLASS)
    for f in range(4):
        z = 2 + f * (UH - 3) / 4
        for k in range(8):
            x = UX0 + 5 + k * 9.6
            if abs(x - ucx) < 15:
                continue
            univ.box(x, x + 3.4, UY1 - 0.05, UY1 + 0.05, z, z + (UH - 3) / 4 - 0.7, GLASS_L if (f + k) % 3 else GLASS)
    steps = 3                                                                 # 阶梯教室楼（西翼）
    for s in range(steps):
        z0 = s * (UH * 0.7 / steps); z1 = (s + 1) * (UH * 0.7 / steps)
        inset = s * 2.5
        univ.box(UX0 + inset, ucx - 18, UY0 + inset * 0.5, UY0 + 18, z0, z1, STONE)
    univ.box(ucx - 16, ucx + 16, UY0 - 0.5, UY0 + 0.1, 0, 4.0, STONE_D)        # 连廊到图书馆一侧
    points.append(((ucx, UY0 + 20, UH * 0.6), 6e3, (0.95, 0.9, 0.78)))

    # ------------------------------------------------------------ 最高法院
    court = Batch('props_court')
    ccx = (CX0 + CX1) / 2
    court.box(CX0 + 10, CX1 - 10, CY0 + 14, CY1, 0, CH * 0.55, STONE)
    court.box(CX0 + 4, CX1 - 4, CY0, CY0 + 14, 0, 1.6, STONE_D)               # 宽台阶基座
    for s in range(4):
        court.box(CX0 + 10 - s * 1.2, CX1 - 10 + s * 1.2, CY0 + s * 3.2, CY0 + s * 3.2 + 2.6, s * 0.4, s * 0.4 + 0.4, STONE_D)
    n_col = 10
    for i in range(n_col):
        x = CX0 + 14 + i * (CX1 - CX0 - 28) / (n_col - 1)
        court.cyl(x, CY0 + 15, 0, 1.1, CH * 0.5, STONE, 14)
    court.box(CX0 + 10, CX1 - 10, CY0 + 13.5, CY0 + 14.5, CH * 0.5, CH * 0.5 + 2.0, STONE_D)  # 柱顶檐部
    court.cyl(ccx, CY0 + 26, CH * 0.55, 13, CH * 0.35, STONE_D, 24, r2=9)     # 中央穹顶采光厅（收分圆顶）
    court.sphere(ccx, CY0 + 26, CH * 0.55 + CH * 0.35, 9.0, GLASS_L, seg=20, rings=10, zmin=0.0)
    for i in range(8):
        a = i * math.tau / 8
        x = ccx + math.cos(a) * 8; y = CY0 + 26 + math.sin(a) * 8
        court.boxc(x, y, CH * 0.55 + 1, 0.5, 0.5, CH * 0.35, STONE_D)
    points.append(((ccx, CY0 + 26, CH * 0.55 + CH * 0.35 + 2), 8e3, (0.9, 0.92, 1.0)))

    # ------------------------------------------------------------ 共用广场
    plaza = Batch('props_plaza')
    plaza.box(-30, 30, -35, 20, -0.03, 0, PAVE)
    plaza.box(-30, 30, -35, 20, -0.05, -0.03, GRASS)
    for i in range(6):
        for sx in (-1, 1):
            x = sx * 22; y = -25 + i * 8
            plaza.cyl(x, y, 0, 0.3, 3.0, WOOD, 8)
            plaza.sphere(x, y, 3.4, 1.5, LEAF, seg=10, rings=6)

    ground = Batch('site_ground')
    ground.box(-110, 110, -50, 70, -0.06, -0.03, PAVE)

    lights = Batch('props_lights')
    for (x, y) in ((-70, -5), (-70, 45), (60, -15), (60, 35), (0, -20)):
        lights.cyl(x, y, 0, 0.16, 3.4, STONE_D, 10)
        lights.sphere(x, y, 3.6, 0.3, LAMP, seg=10, rings=6)
        points.append(((x, y, 3.6), 3e3, (1.0, 0.85, 0.65)))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：中层楼群 + 甲板边 + 磁浮高架
    GLASSD = C.flat('bg_tower', (0.07, 0.08, 0.1), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.3, 0.3, 0.32), 0.8, noise=0.3)
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.0, 3.6), seed=i * 9.3) for i, c in
          enumerate(((1.0, 0.85, 0.6), (0.7, 0.85, 1.0)))]
    LAMPC = C.flat('bg_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=12.0)
    UNDER = C.flat('bg_under', (0.14, 0.13, 0.13), 0.9, noise=0.4)

    far = Batch('bg_deck')
    far.box(-2200, 2200, -2200, 2200, -6, -4, BCONC)

    tw = Batch('bg_towers')
    rb = random.Random(131)
    placed = []
    cam1 = Vector((-170.0, -200.0))
    cam_bearing = math.degrees(math.atan2(cam1.y, cam1.x)) % 360
    for k in range(46):
        for _ in range(50):
            a = rb.uniform(0, math.tau); d = rb.uniform(150, 620)
            x, y = math.cos(a) * d, math.sin(a) * d
            w, dd = rb.uniform(26, 55), rb.uniform(26, 55)
            clear = all(abs(x - px) > (w + pw) / 2 + 9 or abs(y - py) > (dd + pd) / 2 + 9 for px, py, pw, pd in placed)
            bearing = math.degrees(a) % 360
            in_cam_lane = (d < 280) and (abs((bearing - cam_bearing + 180) % 360 - 180) < 20)
            if clear and not in_cam_lane:
                break
        else:
            continue
        placed.append((x, y, w, dd))
        h = rb.uniform(80, 300)
        tw.box(x - w / 2, x + w / 2, y - dd / 2, y + dd / 2, 0, h, rb.choice(WG) if k % 3 else GLASSD)

    ov = Batch('bg_overhead')
    for (x0, x1, y0, y1) in ((-900, 900, 150, 900), (-900, 900, -900, -150)):
        ov.box(x0, x1, y0, y1, UZ, UZ + 8, UNDER)
    for kk in range(-18, 19):
        g = kk * 45.0
        if abs(g) > 150:
            ov.box(-900, 900, g - 1.5, g + 1.5, UZ - 7, UZ, BCONC)
    for i in range(120):
        x, y = rb.uniform(-800, 800), rb.uniform(-800, 800)
        if abs(y) > 150:
            ov.boxc(x, y, UZ - 7.6, 4, 4, 0.6, LAMPC)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光：日间，肃穆学院/司法气质
    C.sky_sun(sc, 'day', sun_az=200.0, sun_el=44.0, sun_e=3.6, sky_s=0.3)
    for (x, y) in ((-55, 20), (55, 10), (0, -10)):
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 1.0e5; ld.size = 220; ld.color = (0.92, 0.9, 0.85)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, 110)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0

    CAMS = {
        'c1': ((-175.0, -205.0, 140.0), (0.0, 10.0, 15.0), 24, 0.0),
        'c2': ((-55.0, -28.0, 8.0), (-55.0, 4.0, 10.0), 26, 0.0),
        'c3': ((55.0, -45.0, 6.0), (55.0, 15.0, 9.0), 26, 0.0),
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
