"""天城贵族管家学院（中层高区；卡：绫濑遥毕业并任顾问的学院）——只做外观。
设定见 docs/landmarks/butler_academy.md。

导出组：
  walls_ext     三层红砖 + 白石线脚学院主楼，中央山花门廊 + 对称翼楼 + 屋顶老虎窗
  props_wing    实训翼：落地窗模拟餐厅 + 银器/布艺陈列橱窗（纯几何展示柜，无文字）
  props_forecourt 前庭：环形车道 + 中央喷泉（纯装饰，无雕像）
  props_garden  后花园：几何绿篱迷宫 + 凉亭
  site_ground   铺装草坪
  props_lights  灯柱
bg_*：周边中层楼群、甲板边、磁浮高架（不导出）。

布局（米）：地面 z=0；主楼 x -35..35、y 0..24，高约 16 m；前庭 y -50..0；后花园 y 24..84。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/butler_academy/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/ba.jpg [--blend /tmp/ba.blend] [--log /tmp/ba.log] [--exposure 0.0]
cam: c1 前庭俯瞰 / c2 主楼正立面 / c3 后花园绿篱迷宫
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/ba.jpg', blend='', log='', exposure=''))

MX0, MX1, MY0, MY1, MH = -35.0, 35.0, 0.0, 24.0, 13.0
WX0, WX1, WY0, WY1 = 35.0, 62.0, 2.0, 20.0
FX0, FX1, FY0, FY1 = -48.0, 48.0, -50.0, -1.0
GX0, GX1, GY0, GY1 = -40.0, 40.0, 25.0, 85.0
UZ = 380.0


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(81)

    # ------------------------------------------------------------ 材质
    BRICK = C.pbr('ba_brick', 'concrete_wall_008', 3.0, tint=(0.55, 0.26, 0.2), sat=0.55, weather=0.3)
    STONE = C.pbr('ba_stone', 'white_sandstone_blocks_02', 2.4, tint=(0.92, 0.9, 0.85), value=1.0, sat=0.15)
    ROOF = C.pbr('ba_roof', 'roof_slates_02', 2.6, tint=(0.28, 0.28, 0.3), sat=0.3)
    GLASS = C.glass('ba_glass', (0.1, 0.13, 0.15))
    GLASS_L = C.glass('ba_glass_l', (0.15, 0.14, 0.1), emit=(1.0, 0.9, 0.7), estr=2.0)
    SASH = C.flat('ba_sash', (0.94, 0.93, 0.9), 0.4)
    DOOR = C.flat('ba_door', (0.1, 0.08, 0.06), 0.35, coat=0.4)
    RAIL = C.pbr('ba_rail', 'Metal009', 1.5, tint=(0.08, 0.08, 0.08), sat=0.1, metal=0.6)
    GOLD = C.flat('ba_gold', (0.75, 0.6, 0.2), 0.3, metal=0.75, coat=0.5)
    PAVE = C.pbr('ba_pave', 'precast_stone_paving', 3.0, tint=(0.78, 0.76, 0.7), sat=0.25)
    ASPH = C.pbr('ba_asphalt', 'asphalt_02', 5.0, tint=(0.3, 0.3, 0.32), sat=0.2, value=0.7)
    GRASS = C.flat('ba_grass', (0.14, 0.32, 0.12), 0.8, noise=0.4)
    HEDGE = C.flat('ba_hedge', (0.09, 0.24, 0.09), 0.75, noise=0.4)
    WATER = C.glass('ba_water', (0.05, 0.1, 0.12), rough=0.03)
    WOOD = C.flat('ba_wood', (0.3, 0.2, 0.12), 0.7, noise=0.3)
    LAMP = C.flat('ba_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.85, 0.65), estr=13.0)
    LEAF = C.flat('ba_leaf', (0.14, 0.3, 0.13), 0.8, noise=0.5)

    points, spots = [], []

    # ------------------------------------------------------------ 主楼
    main_b = Batch('walls_ext')
    main_b.box(MX0, MX1, MY0, MY1, 0, MH, BRICK)
    main_b.box(MX0, MX1, MY0 - 0.15, MY0, 0, 1.4, STONE)                    # 基座石带
    main_b.box(MX0, MX1, MY0 - 0.12, MY0, MH - 0.6, MH + 0.6, STONE)        # 檐口石带
    main_b.box(MX0, MX1, MY1, MY1 + 0.15, 0, 1.4, STONE)
    main_b.box(MX0, MX1, MY1, MY1 + 0.12, MH - 0.6, MH + 0.6, STONE)
    main_b.gable(MX0, MX1, MY0, MY1, MH, 5.0, ROOF, along='x', over=0.8)
    for f in range(3):
        z = 2.0 + f * 3.6
        for k in range(9):
            x = MX0 + 4 + k * 7.6
            if -6 < x < 6 and f == 0:
                continue
            main_b.box(x, x + 3.0, MY0 - 0.05, MY0 + 0.05, z, z + 2.4, GLASS_L if (f + k) % 3 else GLASS)
            main_b.box(x - 0.15, x + 3.15, MY0 - 0.1, MY0 + 0.1, z - 0.2, z + 2.6, SASH)
    for i in range(3):                                                      # 屋顶老虎窗
        x = MX0 + 10 + i * 16
        main_b.box(x, x + 3.2, MY0 + 2, MY0 + 5, MH + 0.4, MH + 3.2, BRICK)
        main_b.gable(x, x + 3.2, MY0 + 2, MY0 + 5, MH + 3.2, 1.4, ROOF, along='x', over=0.3)
        main_b.box(x + 0.3, x + 2.9, MY0 + 1.9, MY0 + 2.1, MH + 0.9, MH + 2.6, GLASS)
    # 中央山花门廊
    px0, px1 = -8.0, 8.0
    main_b.box(px0, px1, MY0 - 6.0, MY0 - 0.1, 0, MH * 0.65, STONE)
    for k in range(4):
        x = px0 + 1.5 + k * (px1 - px0 - 3) / 3
        main_b.cyl(x, MY0 - 5.6, 0, 0.5, MH * 0.6, STONE, 12)
    main_b.gable(px0 - 1, px1 + 1, MY0 - 6.2, MY0 - 0.05, MH * 0.65, 3.0, STONE, along='x', over=0.4)
    main_b.box(px0 + 1.5, px1 - 1.5, MY0 - 0.3, MY0, 0.1, 3.4, DOOR)
    main_b.box(px0 + 1.3, px1 - 1.3, MY0 - 0.35, MY0 - 0.05, 3.3, 3.7, GOLD)
    points.append(((0, MY0 - 3, 3.5), 6e3, (1.0, 0.85, 0.6)))

    # ------------------------------------------------------------ 实训翼
    wing = Batch('props_wing')
    wing.box(WX0, WX1, WY0, WY1, 0, 8.0, BRICK)
    wing.gable(WX0, WX1, WY0, WY1, 8.0, 2.6, ROOF, along='x', over=0.5)
    for k in range(4):                                                       # 落地窗
        y = WY0 + 2 + k * 4.2
        wing.box(WX0 - 0.05, WX0 + 0.05, y, y + 3.0, 0.2, 6.4, GLASS_L)
        wing.box(WX0 - 0.15, WX0 + 0.15, y - 0.15, y + 3.15, 0.1, 6.5, SASH)
    for k in range(3):                                                       # 展示柜（纯几何，无文字）
        y = WY0 + 3 + k * 5
        wing.box(WX0 + 2, WX0 + 5, y, y + 2.2, 0.3, 2.0, GLASS)
        wing.box(WX0 + 1.9, WX0 + 5.1, y - 0.1, y + 2.3, 0.28, 0.35, STONE)

    # ------------------------------------------------------------ 前庭
    fore = Batch('props_forecourt')
    fore.box(FX0, FX1, FY0, FY1, -0.02, 0, GRASS)
    ring_r = 22.0
    ring_pts = [(math.cos(i * math.tau / 48) * ring_r, FY0 + 26 + math.sin(i * math.tau / 48) * 14) for i in range(48)]
    for i in range(len(ring_pts)):
        (xa, ya), (xb, yb) = ring_pts[i], ring_pts[(i + 1) % len(ring_pts)]
        fore.strip([(xa, ya, 0), (xb, yb, 0)], 5.0, 0.02, ASPH)
    fore.cyl(0, FY0 + 12, 0, 6.5, 0.6, STONE, 32, r2=6.5)                    # 喷泉基座
    fore.cyl(0, FY0 + 12, 0.6, 4.6, 0.3, WATER, 32, r2=4.6)
    fore.cyl(0, FY0 + 12, 0.9, 0.7, 3.2, STONE, 16)
    fore.cyl(0, FY0 + 12, 4.1, 1.6, 0.25, WATER, 20, r2=1.6, cap=False)
    points.append(((0, FY0 + 12, 4.5), 4e3, (0.7, 0.85, 1.0)))
    for i in range(6):                                                       # 草坪两侧行道树
        for sx in (-1, 1):
            x = sx * 30; y = FY0 + 8 + i * 6
            fore.cyl(x, y, 0, 0.3, 3.0, WOOD, 8)
            fore.sphere(x, y, 3.4, 1.6, LEAF, seg=10, rings=6)

    # ------------------------------------------------------------ 后花园：绿篱迷宫 + 凉亭
    garden = Batch('props_garden')
    garden.box(GX0, GX1, GY0, GY1, -0.02, 0, GRASS)
    hedge_h, hedge_w = 1.6, 0.6
    def hedge_seg(x0, x1, y0, y1):
        garden.box(x0, x1, y0, y1, 0, hedge_h, HEDGE)
    rings = [8, 14, 20, 26]
    cx, cy = 0.0, (GY0 + GY1) / 2
    for r in rings:
        n = 24
        for i in range(n):
            if i % 6 == 0:
                continue
            a0 = i * math.tau / n; a1 = (i + 1) * math.tau / n
            x0, y0 = cx + math.cos(a0) * r, cy + math.sin(a0) * r * 0.6
            x1, y1 = cx + math.cos(a1) * r, cy + math.sin(a1) * r * 0.6
            garden.strip([(x0, y0, 0), (x1, y1, 0)], hedge_w, hedge_h, HEDGE)
    for dx, dy in ((-1.4, -1.4), (1.4, -1.4), (-1.4, 1.4), (1.4, 1.4)):
        garden.cyl(cx + dx, cy + dy, 0, 0.12, 2.6, WOOD, 8)
    garden.boxc(cx, cy, 2.6, 4.2, 4.2, 0.2, ROOF)
    garden.cyl(cx, cy, 0, 0.5, 0.9, STONE, 16)                              # 凉亭中央小桌

    ground = Batch('site_ground')
    ground.box(-70, 70, -55, 90, -0.05, -0.02, PAVE)

    lights = Batch('props_lights')
    for (x, y) in ((-44, -30), (44, -30), (-44, 60), (44, 60)):
        lights.cyl(x, y, 0, 0.16, 3.2, STONE, 10)
        lights.sphere(x, y, 3.4, 0.3, LAMP, seg=10, rings=6)
        points.append(((x, y, 3.4), 3e3, (1.0, 0.85, 0.65)))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：中层楼群 + 甲板边 + 磁浮高架
    GLASSD = C.flat('bg_tower', (0.07, 0.08, 0.1), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.3, 0.3, 0.32), 0.8, noise=0.3)
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.0, 3.6), seed=i * 3.9) for i, c in
          enumerate(((1.0, 0.85, 0.6), (0.7, 0.85, 1.0)))]
    LAMPC = C.flat('bg_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=12.0)
    UNDER = C.flat('bg_under', (0.14, 0.13, 0.13), 0.9, noise=0.4)

    far = Batch('bg_deck')
    far.box(-2200, 2200, -2200, 2200, -6, -4, BCONC)

    tw = Batch('bg_towers')
    rb = random.Random(91)
    placed = []
    cam1 = Vector((-150.0, -190.0))
    cam_bearing = math.degrees(math.atan2(cam1.y, cam1.x)) % 360
    for k in range(46):
        for _ in range(50):
            a = rb.uniform(0, math.tau); d = rb.uniform(120, 620)
            x, y = math.cos(a) * d, math.sin(a) * d
            w, dd = rb.uniform(26, 55), rb.uniform(26, 55)
            clear = all(abs(x - px) > (w + pw) / 2 + 9 or abs(y - py) > (dd + pd) / 2 + 9 for px, py, pw, pd in placed)
            bearing = math.degrees(a) % 360
            in_cam_lane = (d < 260) and (abs((bearing - cam_bearing + 180) % 360 - 180) < 20)
            if clear and not in_cam_lane:
                break
        else:
            continue
        placed.append((x, y, w, dd))
        h = rb.uniform(80, 300)
        tw.box(x - w / 2, x + w / 2, y - dd / 2, y + dd / 2, 0, h, rb.choice(WG) if k % 3 else GLASSD)

    ov = Batch('bg_overhead')
    for (x0, x1, y0, y1) in ((-900, 900, 140, 900), (-900, 900, -900, -140)):
        ov.box(x0, x1, y0, y1, UZ, UZ + 8, UNDER)
    for kk in range(-18, 19):
        g = kk * 45.0
        if abs(g) > 140:
            ov.box(-900, 900, g - 1.5, g + 1.5, UZ - 7, UZ, BCONC)
    for i in range(120):
        x, y = rb.uniform(-800, 800), rb.uniform(-800, 800)
        if abs(y) > 140:
            ov.boxc(x, y, UZ - 7.6, 4, 4, 0.6, LAMPC)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光：日间，温暖庄重
    C.sky_sun(sc, 'day', sun_az=200.0, sun_el=42.0, sun_e=3.5, sky_s=0.3)
    for (x, y) in ((-40, -10), (40, -10), (0, 45)):
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 1.0e5; ld.size = 220; ld.color = (0.92, 0.85, 0.72)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, 110)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0

    CAMS = {
        'c1': ((-140.0, -175.0, 115.0), (0.0, -15.0, 10.0), 26, 0.0),
        'c2': ((0.0, -46.0, 9.0), (0.0, 12.0, 8.0), 28, 0.0),
        'c3': ((0.0, 95.0, 20.0), (0.0, 50.0, 3.0), 26, 0.0),
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
