"""星渊大学（中层；卡：天城第一学府，校长顾衍容，设有医学院）——只做外观。
设定见 docs/landmarks/starabyss_univ.md（仓库推断标注）。

导出组：
  props_main     教学主楼：六层石材 + 玻璃学院楼，中央素面钟楼入口，两翼对称
  props_medical  医学院楼：弧形玄关 + 大面积玻璃幕墙，连廊接主楼
  props_library  图书馆：阶梯退台造型 + 高窗
  props_link     连廊
  props_plaza    中央草坪 + 几何花坛
  site_ground    校园铺装
  props_lights   灯柱
bg_*：周边中层楼群、甲板边、磁浮高架（不导出）。

布局（米）：地面 z=0；主楼居北 x -50..50、y 60..90；医学院居东 x 55..95、y 0..50；
图书馆居南 x -35..35、y -55..-25；中央草坪 x -45..45、y -20..50。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/starabyss_univ/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/su.jpg [--blend /tmp/su.blend] [--log /tmp/su.log] [--exposure 0.0]
cam: c1 校园俯瞰 / c2 主楼钟楼入口 / c3 医学院玻璃幕墙
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/su.jpg', blend='', log='', exposure=''))

BX0, BX1, BY0, BY1, BH = -50.0, 50.0, 60.0, 90.0, 21.0
MX0, MX1, MY0, MY1, MH = 55.0, 95.0, 0.0, 50.0, 16.0
LX0, LX1, LY0, LY1, LH = -35.0, 35.0, -55.0, -25.0, 14.0
UZ = 380.0


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(101)

    # ------------------------------------------------------------ 材质
    STONE = C.pbr('su_stone', 'white_sandstone_blocks_02', 2.6, tint=(0.82, 0.8, 0.75), value=0.95, sat=0.2)
    STONE_D = C.ashlar('su_stone_d', (0.7, 0.68, 0.62), course=0.7, block=1.5, joint=0.012, jc=(0.35, 0.34, 0.3), var=0.06, rough=0.5)
    GLASS = C.glass('su_glass', (0.1, 0.14, 0.16))
    GLASS_L = C.glass('su_glass_l', (0.14, 0.16, 0.14), emit=(0.9, 0.95, 1.0), estr=2.2)
    GLASS_M = C.clear_glass('su_glass_medical')
    METAL = C.pbr('su_metal', 'Metal009', 2.0, tint=(0.55, 0.56, 0.58), sat=0.15, metal=0.8)
    PAVE = C.pbr('su_pave', 'precast_stone_paving', 3.0, tint=(0.7, 0.68, 0.63), sat=0.22)
    GRASS = C.flat('su_grass', (0.16, 0.34, 0.13), 0.8, noise=0.4)
    HEDGE = C.flat('su_hedge', (0.1, 0.26, 0.1), 0.75, noise=0.4)
    WOOD = C.flat('su_wood', (0.3, 0.2, 0.12), 0.7, noise=0.3)
    LEAF = C.flat('su_leaf', (0.15, 0.32, 0.14), 0.8, noise=0.5)
    LAMP = C.flat('su_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.85, 0.65), estr=13.0)
    LAMPC = C.flat('su_lamp_c', (1, 1, 1), 0.4, emit=(0.6, 0.85, 1.0), estr=11.0)
    CLOCK = C.flat('su_clock', (0.9, 0.9, 0.88), 0.35)

    points, spots = [], []

    # ------------------------------------------------------------ 教学主楼
    main_b = Batch('props_main')
    main_b.box(BX0, BX1, BY0, BY1, 0, BH * 0.6, STONE)
    for f in range(6):
        z = 1.5 + f * (BH * 0.6 - 1.5) / 6
        for k in range(11):
            x = BX0 + 4 + k * 8.7
            if -6 < x < 6:
                continue
            main_b.box(x, x + 3.5, BY0 - 0.05, BY0 + 0.05, z, z + (BH * 0.6 - 1.5) / 6 - 0.8, GLASS_L if (f + k) % 3 else GLASS)
    # 中央钟楼
    cx, cz0 = 0.0, BH * 0.6
    main_b.box(-7, 7, BY0 - 1, BY0 + 7, 0, cz0, STONE_D)
    main_b.box(-6.4, 6.4, BY0 - 0.4, BY0 + 6.4, cz0, BH, STONE_D)
    main_b.cyl(0, BY0 + 3, BH, 5.5, 6.0, STONE_D, 16)
    main_b.boxc(0, BY0 - 0.35, BH * 0.75 - 2.8, 5.6, 0.15, 5.6, CLOCK)       # 素面钟面（无指针/数字），朝南

    main_b.box(-4, 4, BY0 - 0.6, BY0 + 0.05, 0.1, 5.5, GLASS_L)             # 入口玻璃门厅
    points.append(((0, BY0 + 3, BH + 6), 5e3, (1.0, 0.9, 0.75)))

    # ------------------------------------------------------------ 医学院楼
    med = Batch('props_medical')
    med.box(MX0 + 8, MX1, MY0, MY1, 0, MH, STONE)
    med.cyl(MX0 + 8, (MY0 + MY1) / 2, 0, 12, MH, GLASS_M, 24, r2=12, cap=False)  # 弧形玄关（半圆玻璃幕）
    for f in range(4):
        z = 1.5 + f * (MH - 2) / 4
        for k in range(6):
            y = MY0 + 4 + k * 7.5
            med.box(MX1 - 0.05, MX1 + 0.05, y, y + 3.0, z, z + (MH - 2) / 4 - 0.6, GLASS_L if (f + k) % 2 else GLASS)
    points.append(((MX0 + 8, (MY0 + MY1) / 2, MH * 0.5), 6e3, (0.7, 0.9, 1.0)))

    # ------------------------------------------------------------ 图书馆（阶梯退台）
    lib = Batch('props_library')
    steps = 4
    for s in range(steps):
        z0 = s * (LH / steps)
        z1 = (s + 1) * (LH / steps)
        inset = s * 3.0
        lib.box(LX0 + inset, LX1 - inset, LY0 + inset * 0.6, LY1, z0, z1, STONE)
        lib.box(LX0 + inset - 0.05, LX1 - inset + 0.05, LY1 - 0.1, LY1 + 0.1, z0 + 0.3, z1 - 0.4, GLASS_L)

    # ------------------------------------------------------------ 连廊
    link = Batch('props_link')
    link.box(BX1 - 2, MX0 + 8, BY0 - 6, BY0 - 2, 0, 5.0, STONE_D)
    link.box(BX1 - 1.8, MX0 + 7.8, BY0 - 5.8, BY0 - 2.2, 0.2, 4.6, GLASS)

    # ------------------------------------------------------------ 中央草坪 + 花坛
    plaza = Batch('props_plaza')
    plaza.box(-45, 45, -20, 55, -0.03, 0, GRASS)
    plaza.box(-40, 40, -22, 58, -0.05, -0.02, PAVE)
    ring_r = [10, 18, 26]
    for r in ring_r:
        n = 32
        for i in range(n):
            if i % 4 == 0:
                continue
            a0 = i * math.tau / n; a1 = (i + 1) * math.tau / n
            x0, y0 = math.cos(a0) * r, 16 + math.sin(a0) * r
            x1, y1 = math.cos(a1) * r, 16 + math.sin(a1) * r
            plaza.strip([(x0, y0, 0), (x1, y1, 0)], 0.5, 0.6, HEDGE)
    for i in range(8):
        a = i * math.tau / 8
        x, y = math.cos(a) * 34, 16 + math.sin(a) * 20
        plaza.cyl(x, y, 0, 0.3, 3.2, WOOD, 8)
        plaza.sphere(x, y, 3.6, 1.7, LEAF, seg=10, rings=6)

    ground = Batch('site_ground')
    ground.box(-100, 100, -65, 100, -0.06, -0.03, PAVE)

    lights = Batch('props_lights')
    for (x, y) in ((-40, -18), (40, -18), (-40, 40), (40, 40), (0, -40)):
        lights.cyl(x, y, 0, 0.16, 3.4, STONE_D, 10)
        lights.sphere(x, y, 3.6, 0.3, LAMP if x else LAMPC, seg=10, rings=6)
        points.append(((x, y, 3.6), 3e3, (1.0, 0.85, 0.65)))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：中层楼群 + 甲板边 + 磁浮高架
    GLASSD = C.flat('bg_tower', (0.07, 0.08, 0.1), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.3, 0.3, 0.32), 0.8, noise=0.3)
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.0, 3.6), seed=i * 8.1) for i, c in
          enumerate(((1.0, 0.85, 0.6), (0.7, 0.85, 1.0)))]
    LAMPC2 = C.flat('bg_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=12.0)
    UNDER = C.flat('bg_under', (0.14, 0.13, 0.13), 0.9, noise=0.4)

    far = Batch('bg_deck')
    far.box(-2200, 2200, -2200, 2200, -6, -4, BCONC)

    tw = Batch('bg_towers')
    rb = random.Random(111)
    placed = []
    cam1 = Vector((-160.0, -210.0))
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
    for (x0, x1, y0, y1) in ((-900, 900, 160, 900), (-900, 900, -900, -160)):
        ov.box(x0, x1, y0, y1, UZ, UZ + 8, UNDER)
    for kk in range(-18, 19):
        g = kk * 45.0
        if abs(g) > 160:
            ov.box(-900, 900, g - 1.5, g + 1.5, UZ - 7, UZ, BCONC)
    for i in range(120):
        x, y = rb.uniform(-800, 800), rb.uniform(-800, 800)
        if abs(y) > 160:
            ov.boxc(x, y, UZ - 7.6, 4, 4, 0.6, LAMPC2)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光：日间，学院气质
    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=44.0, sun_e=3.6, sky_s=0.32)
    for (x, y) in ((-30, 20), (30, 20), (0, 60), (70, 20)):
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 1.0e5; ld.size = 220; ld.color = (0.92, 0.93, 0.95)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, 110)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0

    CAMS = {
        'c1': ((-165.0, -210.0, 140.0), (10.0, 15.0, 15.0), 24, 0.0),
        'c2': ((0.0, 24.0, 8.0), (0.0, 62.0, 12.0), 26, 0.0),
        'c3': ((35.0, 24.0, 6.0), (63.0, 24.0, 9.0), 28, 0.0),
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
