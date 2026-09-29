"""维多利亚的公寓（中层高区；卡：维多利亚是最高法院首席大法官，住在中层高区公寓）——只做外观。
设定见 docs/landmarks/victoria_apartment.md（仓库推断标注）。

导出组：
  walls_tower   公寓主塔：石材 + 玻璃幕墙高层住宅
  props_podium  裙房：石构大堂入口 + 门廊
  props_terrace 屋顶露台：女儿墙 + 遮阳格栅
  site_ground   前庭铺装 + 台阶
  props_lights  庭院灯柱
bg_*：周边中层楼群、甲板边、磁浮高架（不导出）。

布局（米）：主塔 x -14..14、y -14..14，地面 z=0 起，18 层（约 55 m）；
裙房南侧 x -18..18、y -22..-14；前庭南侧到 y -40。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/victoria_apartment/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/va.jpg [--blend /tmp/va.blend] [--log /tmp/va.log] [--exposure 0.0]
cam: c1 主视角（临前庭仰视） / c2 侧视 / under 底视（裙房底面）
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/va.jpg', blend='', log='', exposure=''))

TW, TD = 14.0, 14.0
FLOORS = 18
FH = 3.1


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(261)

    # ------------------------------------------------------------ 材质
    STONE = C.ashlar('va_stone', (0.58, 0.56, 0.52), course=0.7, block=1.4, joint=0.012, jc=(0.32, 0.3, 0.27), var=0.05, rough=0.45)
    STONE_D = C.ashlar('va_stone_d', (0.46, 0.44, 0.4), course=0.55, block=1.1, joint=0.014, jc=(0.26, 0.25, 0.22), var=0.05, rough=0.42)
    GLASS = C.glass('va_glass', (0.11, 0.13, 0.16))
    GLASS_L = C.glass('va_glass_l', (0.15, 0.14, 0.11), emit=(1.0, 0.86, 0.64), estr=1.6)
    METAL = C.pbr('va_metal', 'Metal009', 2.0, tint=(0.42, 0.42, 0.45), sat=0.15, metal=0.85, rough_mul=0.6)
    DARKM = C.flat('va_darkmetal', (0.07, 0.07, 0.075), 0.3, metal=0.8)
    PAVE = C.pbr('va_pave', 'precast_stone_paving', 3.0, tint=(0.55, 0.53, 0.49), sat=0.22)
    LAMP = C.flat('va_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.87, 0.62), estr=11.0)

    points = []

    # ------------------------------------------------------------ 主塔（18 层，石材+玻璃幕墙）
    tower = Batch('walls_tower')
    tz = FLOORS * FH
    tower.box(-TW, TW, -TD, TD, 0, tz, STONE)
    for f in range(FLOORS):
        z = 1.1 + f * FH
        lit = (f * 7 + 3) % FLOORS < FLOORS * 0.35
        for k in range(5):
            x = -10 + k * 5
            m = GLASS_L if (lit and (k + f) % 3 == 0) else GLASS
            tower.box(x, x + 3.2, -TD - 0.05, -TD + 0.05, z, z + 2.0, m)
            tower.box(x, x + 3.2, TD - 0.05, TD + 0.05, z, z + 2.0, m)
        for k in range(5):
            y = -10 + k * 5
            m = GLASS_L if (lit and (k + f) % 4 == 0) else GLASS
            tower.box(-TW - 0.05, -TW + 0.05, y, y + 3.2, z, z + 2.0, m)
            tower.box(TW - 0.05, TW + 0.05, y, y + 3.2, z, z + 2.0, m)
    tower.box(-TW + 0.5, TW - 0.5, -TD + 0.5, TD - 0.5, tz, tz + 1.2, STONE_D)  # 顶部收边

    # ------------------------------------------------------------ 屋顶露台
    terr = Batch('props_terrace')
    terr.box(-TW + 1.0, TW - 1.0, -TD + 1.0, TD - 1.0, tz + 1.2, tz + 1.35, PAVE)
    for i in range(9):
        x = -TW + 2 + i * (2 * TW - 4) / 8
        terr.box(x - 0.08, x + 0.08, -TD + 1.0, TD - 1.0, tz + 1.35, tz + 2.6, METAL)
    terr.box(-TW + 1.0, TW - 1.0, -TD + 1.0, -TD + 1.15, tz + 1.35, tz + 2.6, METAL)
    terr.box(-TW + 1.0, TW - 1.0, TD - 1.15, TD - 1.0, tz + 1.35, tz + 2.6, METAL)

    # ------------------------------------------------------------ 裙房（大堂入口 + 门廊）
    pod = Batch('props_podium')
    pod.box(-18, 18, -22, -14, 0, 6.5, STONE_D)
    pod.box(-6.0, 6.0, -22.2, -21.9, 0.1, 4.4, GLASS_L)             # 大堂玻璃门面
    for k in range(4):
        x = -12 + k * 8
        pod.box(x - 0.5, x + 0.5, -23.6, -22.2, 0.0, 5.4, STONE_D)  # 门廊立柱
    pod.box(-13.0, 13.0, -23.9, -23.5, 5.4, 6.0, STONE_D)           # 门廊檐口
    pod.box(-4.0, 4.0, -22.4, -21.8, -0.05, 0.05, STONE)            # 门前台阶

    # ------------------------------------------------------------ 前庭铺装 + 台阶
    ground = Batch('site_ground')
    ground.box(-30, 30, -40, -14, -0.1, 0, PAVE)
    for i in range(3):
        y = -25.5 - i * 1.2
        ground.box(-14, 14, y - 0.55, y - 0.05, -0.1 + i * 0.18, i * 0.18, STONE)

    # ------------------------------------------------------------ 庭院灯柱
    lights = Batch('props_lights')
    for i in range(6):
        x = -20 + i * 8
        y = -36
        lights.cyl(x, y, 0, 0.15, 3.0, DARKM, 8)
        lights.sphere(x, y, 3.2, 0.28, LAMP, seg=10, rings=6)
        points.append(((x, y, 3.2), 2.2e3, (1.0, 0.87, 0.62)))
    points.append(((0, -18, 6.0), 5e3, (1.0, 0.85, 0.6)))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：中层楼群 + 甲板边 + 磁浮高架
    GLASSD = C.flat('bg_tower', (0.07, 0.08, 0.1), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.3, 0.3, 0.32), 0.8, noise=0.3)
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.0, 3.6), seed=i * 6.5) for i, c in
          enumerate(((1.0, 0.85, 0.6), (0.7, 0.85, 1.0)))]
    LAMPC = C.flat('bg_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=12.0)
    UNDER = C.flat('bg_under', (0.14, 0.13, 0.13), 0.9, noise=0.4)
    UZ = 320.0

    far = Batch('bg_deck')
    far.box(-2200, 2200, -2200, 2200, -6, -4, BCONC)

    tw = Batch('bg_towers')
    rb = random.Random(281)
    placed = []
    cam1 = Vector((-140.0, -170.0))
    cam_bearing = math.degrees(math.atan2(cam1.y, cam1.x)) % 360
    for k in range(46):
        for _ in range(50):
            a = rb.uniform(0, math.tau); d = rb.uniform(80, 620)
            x, y = math.cos(a) * d, math.sin(a) * d
            w, dd = rb.uniform(24, 50), rb.uniform(24, 50)
            clear = all(abs(x - px) > (w + pw) / 2 + 9 or abs(y - py) > (dd + pd) / 2 + 9 for px, py, pw, pd in placed)
            bearing = math.degrees(a) % 360
            in_cam_lane = (d < 260) and (abs((bearing - cam_bearing + 180) % 360 - 180) < 22)
            if clear and not in_cam_lane:
                break
        else:
            continue
        placed.append((x, y, w, dd))
        h = rb.uniform(70, 280)
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

    # ------------------------------------------------------------ 世界 / 光：日间，端正静谧气质
    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=42.0, sun_e=3.4, sky_s=0.3)
    for (x, y) in ((-30, -20), (30, -20), (0, 20)):
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 1.0e5; ld.size = 200; ld.color = (0.9, 0.85, 0.75)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, 100)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0

    CAMS = {
        'c1': ((-130.0, -170.0, 70.0), (0.0, 0.0, 24.0), 26, 0.0),
        'c2': ((100.0, -30.0, 30.0), (0.0, 0.0, 26.0), 28, 0.0),
        'under': ((-20.0, -34.0, 3.0), (0.0, -18.0, 2.0), 28, 0.0),
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
