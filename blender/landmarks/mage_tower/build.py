"""法师塔（中层机构区，星渊大学以东的一座细高石塔；卡：首席神宫寺凛，精神系施法者）——只做外观。
设定见 docs/landmarks/mage_tower.md（仓库推断标注）。

导出组：
  walls_ext      八边形逐层收分的粗琢石塔（约 92 m）+ 三圈挑出的石栏平台
  props_crown    塔冠：六角结界罩（发光 hex ward）+ 悬浮核心晶体 + 两圈符文环
  props_podium   环形裙房（石砌基座 + 玻璃幕 + 石柱）
  props_wall_gate 庭院围墙（一圈）+ 南侧唯一门楼
  props_security  门楼下的法力校验门（安检门造型，魔法蓝紫配色，无文字）
  props_garden   庭院：石径、松柏、悬浮装饰浮石
  site_ground    庭院铺装 + 中央六角发光法阵（纯几何，无文字）
  props_lights   庭院灯柱、檐下灯带（裙房外柱间的全息面板并入 props_podium）
bg_*：周边中层楼群、甲板边、磁浮高架（不导出）。

布局（米）：庭院地面 z=0；塔身中心 (0,0)，半径 18→9，顶 z≈92；塔冠罩顶 z≈108；
裙房环半径 46；庭院围墙半径 78；南门在 (0, -78)。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/mage_tower/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/mt.jpg [--blend /tmp/mt.blend] [--log /tmp/mt.log] [--exposure 0.0]
cam: c1 全景俯瞰 / c2 庭院法阵仰视 / c3 塔基门楼视高
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/mt.jpg', blend='', log='', exposure=''))

R_BASE, R_TOP, TOWER_H = 18.0, 9.0, 92.0
PR, PH = 46.0, 9.0          # 裙房环半径 / 高
CR, CH = 78.0, 3.6          # 庭院围墙半径 / 高
UZ = 400.0                   # 头顶甲板


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    Batch = C.Batch
    rnd = random.Random(17)

    # ------------------------------------------------------------ 材质
    STONE = C.ashlar('mt_stone', (0.34, 0.33, 0.35), course=1.1, block=2.0, joint=0.01, jc=(0.14, 0.14, 0.16), var=0.07, rough=0.55)
    STONE_D = C.ashlar('mt_stone_d', (0.4, 0.39, 0.41), course=0.6, block=1.1, joint=0.012, jc=(0.16, 0.16, 0.18), var=0.06, rough=0.48)
    PLINTH = C.pbr('mt_plinth', 'concrete_wall_008', 3.0, tint=(0.4, 0.4, 0.42), sat=0.1, weather=0.4)
    PAVE = C.pbr('mt_pave', 'precast_stone_paving', 3.0, tint=(0.5, 0.49, 0.5), sat=0.2)
    GRASS = C.flat('mt_grass', (0.07, 0.12, 0.06), 0.85, noise=0.5)
    SOIL = C.flat('mt_soil', (0.08, 0.065, 0.05), 0.9, noise=0.4)
    WOODT = C.flat('mt_woodtrunk', (0.18, 0.13, 0.09), 0.75, noise=0.3)
    NEEDLE = C.flat('mt_needle', (0.05, 0.14, 0.08), 0.8, noise=0.5)
    STEEL = C.pbr('mt_steel', 'Metal009', 2.0, tint=(0.4, 0.41, 0.44), sat=0.2, metal=0.85)
    DARKM = C.flat('mt_darkmetal', (0.04, 0.045, 0.05), 0.35, metal=0.85, noise=0.2)
    GLASS_C = C.clear_glass('mt_glass_court')
    GLASS_P = C.glass('mt_glass_podium', (0.1, 0.08, 0.14), emit=(0.62, 0.42, 0.95), estr=0.9)
    RUNE = C.glow('mt_rune', (0.55, 0.35, 0.95), estr=9.0)
    RUNE2 = C.glow('mt_rune2', (0.62, 0.85, 0.98), estr=7.0)
    WARD = C.hex_ward_mat('mt_ward', c=(0.6, 0.4, 0.98), estr=3.0, alpha=0.55, scale=26.0)
    CORE = C.glow('mt_core', (0.75, 0.5, 1.0), estr=22.0)
    LAMP = C.flat('mt_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.85, 0.65), estr=15.0)
    LAMPP = C.flat('mt_lamp_p', (1, 1, 1), 0.4, emit=(0.62, 0.42, 0.95), estr=13.0)
    HOLO = C.holo('mt_holo', (0.55, 0.4, 0.95), (0.3, 0.2, 0.7), 4.0, 0.55)
    ROCKM = C.flat('mt_rock', (0.3, 0.29, 0.31), 0.7, noise=0.4)

    points, spots = [], []

    # ------------------------------------------------------------ 塔身（八边形逐层收分 + 三圈平台）
    tower = Batch('walls_ext')
    prof = [
        (R_BASE, 0.0), (R_BASE, 26.0), (R_BASE - 1.2, 26.6),
        (R_BASE - 1.2, 50.0), (13.2, 50.6),
        (13.2, 74.0), (10.2, 74.6),
        (10.2, TOWER_H),
    ]
    tower.lathe(0, 0, 0, prof, STONE, n=8, smooth=False)
    for z, r in ((26.3, R_BASE - 1.2), (50.3, 13.2), (74.3, 10.2)):        # 挑出石栏平台（八边形薄盘）
        tower.lathe(0, 0, z, [(r + 1.6, -0.35), (r + 1.6, 0.0), (r + 0.2, 0.0)], STONE_D, n=8, smooth=False)
        for i in range(8):                                                 # 栏杆立柱
            a = i * math.tau / 8
            tower.boxc(math.cos(a) * (r + 1.3), math.sin(a) * (r + 1.3), z, 0.5, 0.5, 1.3, STONE_D)
    for k in range(8):                                                     # 竖向发光符文石脊
        a = k * math.tau / 8
        pts = []
        for (r, dz) in prof:
            pts.append((math.cos(a) * (r + 0.08), math.sin(a) * (r + 0.08), dz))
        tower.strip(pts, 0.5, 0.12, RUNE if k % 2 == 0 else RUNE2)
    points.append(((0, 0, TOWER_H * 0.55), 6e4, (0.62, 0.42, 0.95)))

    # ------------------------------------------------------------ 塔冠：六角结界罩 + 核心晶体 + 符文环
    crown = Batch('props_crown')
    pts_ward = C.ring_pts(0, 0, lambda a: 11.0, n=32)
    C.hex_ward(crown, pts_ward, TOWER_H, 16.0, WARD)
    crown.cyl(0, 0, TOWER_H - 0.4, 11.3, 0.4, STONE_D, 32, r2=11.3)          # 罩座石环
    crown.sphere(0, 0, TOWER_H + 9.0, 2.6, CORE, seg=20, rings=12)          # 悬浮核心晶体
    C.crystal_cluster(crown, 0, 0, TOWER_H + 9.0, 2.2, RUNE, seed=4)
    for rr in (13.5, 17.0):
        C.rune_ring(crown, C.ring_pts(0, 0, lambda a: rr, n=48), TOWER_H + 4.0 + rr * 0.05, 0.22, RUNE2)
    points.append(((0, 0, TOWER_H + 9.0), 4.5e4, (0.75, 0.5, 1.0)))

    # ------------------------------------------------------------ 裙房环（石基 + 玻璃 + 立柱）
    pod = Batch('props_podium')
    pod.cyl(0, 0, 0, PR, 1.4, PLINTH, 48, r2=PR)                            # 基座
    pod.cyl(0, 0, 1.4, PR - 1.0, PH - 2.4, GLASS_P, 48, r2=PR - 1.0, cap=False)  # 玻璃幕鼓环
    pod.cyl(0, 0, PH - 1.0, PR, 1.0, STONE_D, 48, r2=PR)                    # 挑檐
    N_PIER = 20
    for i in range(N_PIER):
        a = i * math.tau / N_PIER
        x, y = math.cos(a) * (PR - 0.3), math.sin(a) * (PR - 0.3)
        pod.boxc(x, y, 0.0, 1.3, 1.3, PH, STONE)
    for i in range(0, N_PIER, 2):                                          # 每隔一根柱间挂全息面板
        a = (i + 0.5) * math.tau / N_PIER
        x, y = math.cos(a) * (PR - 1.1), math.sin(a) * (PR - 1.1)
        pod.boxc(x, y, PH * 0.55, 2.0, 0.1, 2.6, HOLO)

    # ------------------------------------------------------------ 庭院围墙 + 南门
    wall = Batch('props_wall_gate')
    ring = C.ring_pts(0, 0, lambda a: CR, n=64)
    gate_a0, gate_a1 = math.atan2(-1, 0) - 0.09, math.atan2(-1, 0) + 0.09
    for i in range(len(ring)):
        a0 = i * math.tau / len(ring)
        if gate_a0 % math.tau <= a0 % math.tau <= gate_a1 % math.tau or abs(a0 % math.tau - (gate_a0 % math.tau)) < 0.02:
            continue
        (xa, ya), (xb, yb) = ring[i], ring[(i + 1) % len(ring)]
        wall.strip([(xa, ya, 0), (xb, yb, 0)], 1.0, CH, STONE)
    gx, gy = 0.0, -CR
    for side in (-1, 1):
        wall.boxc(gx + side * 3.6, gy, CH * 0.5, 1.6, 1.6, CH + 1.2, STONE_D)
    wall.box(gx - 3.6, gx + 3.6, gy - 1.0, gy + 1.0, CH + 1.0, CH + 1.8, STONE_D)   # 门楣

    # ------------------------------------------------------------ 法力校验门（安检门造型，无文字）
    sec = Batch('props_security')
    for side in (-1, 1):
        sec.boxc(gx + side * 1.6, gy + 4.0, 1.25, 0.18, 0.7, 2.5, DARKM)
    sec.box(gx - 1.8, gx + 1.8, gy + 3.7, gy + 4.3, 2.4, 2.7, DARKM)
    sec.box(gx - 1.7, gx + 1.7, gy + 3.85, gy + 4.15, 0.1, 2.3, GLASS_P)

    # ------------------------------------------------------------ 庭院：铺装、法阵、松柏、浮石
    ground = Batch('site_ground')
    ground.cyl(0, 0, -0.15, CR, 0.15, PAVE, 64, r2=CR)
    ring_r = 30.0
    ground.cyl(0, 0, 0.02, ring_r, 0.04, C.hex_ward_mat('mt_circle', c=(0.6, 0.42, 0.98), estr=2.2, alpha=0.85, scale=10.0), 64, r2=ring_r)
    for rr in (ring_r + 0.3, ring_r * 0.62):
        C.rune_ring(ground, C.ring_pts(0, 0, lambda a: rr, n=48), 0.1, 0.3, RUNE)

    garden = Batch('props_garden')
    for i in range(10):
        a = i * math.tau / 10
        d = rnd.uniform(PR + 6, CR - 6)
        x, y = math.cos(a) * d, math.sin(a) * d
        h = rnd.uniform(6, 9)
        garden.cyl(x, y, 0, 0.5, h * 0.75, WOODT, 8, r2=0.32)
        for k in range(4):
            garden.cyl(x, y, h * 0.2 * k + 1.0, 2.4 - k * 0.4, 2.6 - k * 0.3, NEEDLE, 10, r2=0.15)
    for i in range(6):                                                     # 悬浮装饰浮石（无发光核心，纯浮石）
        a = rnd.uniform(0, math.tau); d = rnd.uniform(PR + 4, CR - 8)
        x, y = math.cos(a) * d, math.sin(a) * d
        C.rock(garden, x, y, rnd.uniform(2.5, 4.5), rnd.uniform(0.5, 0.9), ROCKM, seed=i)

    # ------------------------------------------------------------ 灯与信号面板
    lights = Batch('props_lights')
    for i in range(14):
        a = i * math.tau / 14
        x, y = math.cos(a) * (PR + 10), math.sin(a) * (PR + 10)
        lights.cyl(x, y, 0, 0.18, 3.2, DARKM, 8)
        lights.sphere(x, y, 3.4, 0.32, LAMPP, seg=12, rings=8)
        points.append(((x, y, 3.4), 3e3, (0.62, 0.42, 0.95)))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：中层楼群 + 甲板边 + 磁浮高架
    GLASSD = C.flat('bg_tower', (0.07, 0.08, 0.1), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.3, 0.3, 0.32), 0.8, noise=0.3)
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.0, 3.6), seed=i * 5.1) for i, c in
          enumerate(((1.0, 0.85, 0.6), (0.7, 0.85, 1.0)))]
    LEDB = C.flat('bg_led_b', (1, 1, 1), 0.4, emit=(0.55, 0.4, 0.95), estr=8.0)
    LAMPC = C.flat('bg_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=12.0)
    UNDER = C.flat('bg_under', (0.14, 0.13, 0.13), 0.9, noise=0.4)

    far = Batch('bg_deck')
    far.box(-2200, 2200, -2200, 2200, -6, -4, BCONC)

    tw = Batch('bg_towers')
    rb = random.Random(21)
    placed = []
    for k in range(46):
        for _ in range(50):
            a = rb.uniform(0, math.tau); d = rb.uniform(CR + 40, 620)
            x, y = math.cos(a) * d, math.sin(a) * d
            w, dd = rb.uniform(26, 55), rb.uniform(26, 55)
            clear = all(abs(x - px) > (w + pw) / 2 + 9 or abs(y - py) > (dd + pd) / 2 + 9 for px, py, pw, pd in placed)
            bearing = math.degrees(a) % 360
            in_cam_lane = (d < 260) and (abs((bearing - 231.7 + 180) % 360 - 180) < 22)   # 给 c1 机位留出视线（相机方位角 -128.3°≈231.7°）
            if clear and not in_cam_lane:
                break
        else:
            continue
        placed.append((x, y, w, dd))
        h = rb.uniform(80, 300)
        tw.box(x - w / 2, x + w / 2, y - dd / 2, y + dd / 2, 0, h, rb.choice(WG) if k % 3 else GLASSD)

    rail = Batch('bg_rail')
    C.light_rail(rail, (R_BASE + 2, 4), (110, 30), TOWER_H * 0.55, 48.0, 0.5, DARKM, DARKM, sag=6.0)

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
            ov.boxc(x, y, UZ - 7.6, 4, 4, 0.6, rb.choice([LAMPC, LEDB]))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光：日间，冷紫补光呼应魔法主题
    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=42.0, sun_e=3.4, sky_s=0.32)
    for (x, y) in ((-260, 0), (260, 0), (0, 260)):
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 1.2e5; ld.size = 220; ld.color = (0.72, 0.66, 0.95)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, 130)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0

    CAMS = {
        'c1': ((-150.0, -190.0, 130.0), (0.0, 0.0, 46.0), 26, 0.0),
        'c2': ((0.0, -60.0, 1.7), (0.0, 0.0, 96.0), 26, 0.0),
        'c3': ((0.0, -102.0, 3.2), (0.0, -78.0, 3.5), 22, 0.0),
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
