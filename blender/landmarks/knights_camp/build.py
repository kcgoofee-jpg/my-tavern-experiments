"""骑士团营区（中层高区，画在银冠堡正下方；卡：罗莎琳德是议会骑士团第九代团长，住在这里，团长每天巡营）——只做外观。
设定见 docs/landmarks/knights_camp.md（仓库推断标注）。

导出组：
  walls_ext      指挥厅：两层石构，中央营区正对
  props_barracks 营房区：多排两层石构营房
  props_yard     操练场：压实地面 + 队列地面标线（无武器/靶架）
  props_hangar   坐骑机库：悬浮坐骑机库（素面，无标识）
  props_wall_gate 围墙 + 四角哨塔 + 正门门楼
  site_ground    营区铺装
  props_lights   灯柱
bg_*：周边中层楼群、甲板边、磁浮高架（不导出）。

布局（米）：营区地面 z=0；指挥厅居中 x -12..12、y -8..8；营房区两侧 x <-20 / >20；
操练场居南 y -60..-25；机库居北 y 30..60；围墙 x ±75、y -65..65；正门在南墙 (0,-65)。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/knights_camp/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/kc.jpg [--blend /tmp/kc.blend] [--log /tmp/kc.log] [--exposure 0.0]
cam: c1 营区俯瞰 / c2 指挥厅正立面 / c3 操练场与营房排
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/kc.jpg', blend='', log='', exposure=''))

CRX, CRY = 75.0, 65.0
UZ = 380.0


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(161)

    # ------------------------------------------------------------ 材质
    STONE = C.ashlar('kc_stone', (0.5, 0.49, 0.46), course=0.75, block=1.5, joint=0.012, jc=(0.28, 0.27, 0.24), var=0.06, rough=0.5)
    STONE_D = C.ashlar('kc_stone_d', (0.42, 0.41, 0.38), course=0.55, block=1.1, joint=0.014, jc=(0.24, 0.23, 0.2), var=0.06, rough=0.48)
    ROOF = C.pbr('kc_roof', 'roof_slates_02', 2.6, tint=(0.32, 0.32, 0.35), sat=0.3)
    GLASS = C.glass('kc_glass', (0.1, 0.12, 0.14))
    GLASS_L = C.glass('kc_glass_l', (0.14, 0.13, 0.1), emit=(1.0, 0.85, 0.62), estr=1.8)
    STEEL = C.pbr('kc_steel', 'Metal009', 2.0, tint=(0.4, 0.41, 0.44), sat=0.2, metal=0.8)
    DARKM = C.flat('kc_darkmetal', (0.06, 0.06, 0.065), 0.35, metal=0.8)
    PAVE = C.pbr('kc_pave', 'precast_stone_paving', 3.0, tint=(0.52, 0.5, 0.46), sat=0.25)
    SOIL = C.flat('kc_soil', (0.16, 0.13, 0.09), 0.9, noise=0.4)
    LINE = C.flat('kc_line', (0.75, 0.73, 0.68), 0.6, noise=0.2)
    LAMP = C.flat('kc_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.85, 0.6), estr=13.0)

    points, spots = [], []

    # ------------------------------------------------------------ 指挥厅
    hall = Batch('walls_ext')
    hall.box(-12, 12, -8, 8, 0, 9.5, STONE)
    hall.gable(-12, 12, -8, 8, 9.5, 3.6, ROOF, along='x', over=0.6)
    for f in range(2):
        z = 1.6 + f * 4.0
        for k in range(4):
            x = -9 + k * 6
            hall.box(x, x + 2.4, -8.05, -7.95, z, z + 2.2, GLASS_L if k % 2 else GLASS)
    hall.box(-2.2, 2.2, -8.2, -7.9, 0.1, 3.2, DARKM)                        # 大门
    hall.box(-4, 4, -12, -8.1, -0.05, 0.05, STONE_D)                       # 门前台阶
    points.append(((0, -10, 3.4), 6e3, (1.0, 0.85, 0.6)))

    # ------------------------------------------------------------ 营房区（多排两层）
    bks = Batch('props_barracks')
    for side in (-1, 1):
        for row in range(3):
            x0 = side * (22 + row * 11)
            bks.box(x0 - 4.4, x0 + 4.4, -22, 22, 0, 7.2, STONE)
            bks.gable(x0 - 4.4, x0 + 4.4, -22, 22, 7.2, 2.6, ROOF, along='y', over=0.5)
            for f in range(2):
                z = 1.4 + f * 3.4
                for k in range(6):
                    y = -18 + k * 6.4
                    bks.box(x0 - 4.5, x0 - 4.35, y, y + 2.6, z, z + 1.9, GLASS_L if (f + k) % 2 else GLASS)
                    bks.box(x0 + 4.35, x0 + 4.5, y, y + 2.6, z, z + 1.9, GLASS_L if (f + k) % 3 else GLASS)

    # ------------------------------------------------------------ 操练场（无武器/靶架）
    yard = Batch('props_yard')
    yard.box(-45, 45, -60, -25, -0.03, 0, SOIL)
    for i in range(-6, 7):
        x = i * 6.5
        yard.box(x - 0.1, x + 0.1, -58, -27, -0.01, 0.01, LINE)
    for i in range(4):
        y = -55 + i * 8
        yard.box(-45, 45, y - 0.1, y + 0.1, -0.01, 0.01, LINE)

    # ------------------------------------------------------------ 坐骑机库
    hangar = Batch('props_hangar')
    hangar.box(-30, 30, 32, 58, 0, 8.5, STONE_D)
    hangar.gable(-30, 30, 32, 58, 8.5, 2.4, ROOF, along='x', over=0.6)
    for k in range(6):
        x = -25 + k * 10
        hangar.box(x, x + 6.5, 31.9, 32.1, 0.2, 6.4, DARKM)
        hangar.box(x + 0.3, x + 6.2, 32.0, 32.2, 0.4, 6.0, GLASS)
    hangar.box(-30, -22, 34, 56, 0.1, 0.2, PAVE)                            # 起降坪一角

    # ------------------------------------------------------------ 围墙 + 哨塔 + 正门
    wall = Batch('props_wall_gate')
    WH = 4.5
    ring = C.ring_pts(0, 0, lambda a: CRX, n=64)
    gate_a0, gate_a1 = -math.pi / 2 - 0.09, -math.pi / 2 + 0.09
    for i in range(len(ring)):
        a0 = i * math.tau / len(ring)
        aa = ((a0 + math.pi) % math.tau) - math.pi
        if gate_a0 <= aa <= gate_a1:
            continue
        (xa, ya), (xb, yb) = ring[i], ring[(i + 1) % len(ring)]
        wall.strip([(xa, ya, 0), (xb, yb, 0)], 1.0, WH, STONE)
    for (cx, cy) in ((-CRX, -CRY), (CRX, -CRY), (-CRX, CRY), (CRX, CRY)):    # 四角哨塔
        wall.box(cx - 2.6, cx + 2.6, cy - 2.6, cy + 2.6, 0, WH + 5.0, STONE_D)
        wall.box(cx - 3.0, cx + 3.0, cy - 3.0, cy + 3.0, WH + 5.0, WH + 6.0, STONE)
    gx, gy = 0.0, -CRY
    for side in (-1, 1):
        wall.boxc(gx + side * 3.4, gy, WH * 0.5, 1.5, 1.5, WH + 1.0, STONE_D)
    wall.box(gx - 3.4, gx + 3.4, gy - 1.0, gy + 1.0, WH + 0.8, WH + 1.6, STONE_D)  # 门楣
    wall.box(gx - 3.0, gx + 3.0, gy - 0.5, gy + 0.5, 0.2, WH * 0.85, DARKM)  # 闸门板

    ground = Batch('site_ground')
    ground.cyl(0, 0, -0.06, CRX, 0.06, PAVE, 64, r2=CRX)

    lights = Batch('props_lights')
    for i in range(10):
        a = i * math.tau / 10
        x, y = math.cos(a) * (CRX - 8), math.sin(a) * (CRY - 8)
        lights.cyl(x, y, 0, 0.16, 3.2, DARKM, 8)
        lights.sphere(x, y, 3.4, 0.3, LAMP, seg=10, rings=6)
        points.append(((x, y, 3.4), 2.5e3, (1.0, 0.85, 0.6)))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：中层楼群 + 甲板边 + 磁浮高架
    GLASSD = C.flat('bg_tower', (0.07, 0.08, 0.1), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.3, 0.3, 0.32), 0.8, noise=0.3)
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.0, 3.6), seed=i * 6.5) for i, c in
          enumerate(((1.0, 0.85, 0.6), (0.7, 0.85, 1.0)))]
    LAMPC = C.flat('bg_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=12.0)
    UNDER = C.flat('bg_under', (0.14, 0.13, 0.13), 0.9, noise=0.4)

    far = Batch('bg_deck')
    far.box(-2200, 2200, -2200, 2200, -6, -4, BCONC)

    tw = Batch('bg_towers')
    rb = random.Random(171)
    placed = []
    cam1 = Vector((-160.0, -200.0))
    cam_bearing = math.degrees(math.atan2(cam1.y, cam1.x)) % 360
    for k in range(46):
        for _ in range(50):
            a = rb.uniform(0, math.tau); d = rb.uniform(CRX + 40, 620)
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
            ov.boxc(x, y, UZ - 7.6, 4, 4, 0.6, LAMPC)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光：日间，肃穆军营气质
    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=40.0, sun_e=3.4, sky_s=0.3)
    for (x, y) in ((-40, -10), (40, -10), (0, 40)):
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 1.0e5; ld.size = 220; ld.color = (0.9, 0.85, 0.75)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, 110)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0

    CAMS = {
        'c1': ((-150.0, -190.0, 130.0), (0.0, 0.0, 15.0), 26, 0.0),
        'c2': ((0.0, -30.0, 4.5), (0.0, 0.0, 6.0), 26, 0.0),
        'c3': ((-30.0, -48.0, 6.0), (0.0, -30.0, 3.0), 26, 0.0),
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
