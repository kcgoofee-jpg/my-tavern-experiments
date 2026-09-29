"""中层「关怀带」：中层公立医院 + 中层养老院 + 中层修道院（同一场景）——只做外观。
设定见 docs/landmarks/care_cluster.md（仓库推断标注）。

导出组：
  props_hospital   中层公立医院：8 层板式主楼（白面砖 + 蓝绿遮阳板）+ 一层门诊裙房（弧形雨篷）+ 屋顶悬浮救护停机坪
  props_care_home  中层养老院：4 层暖黄面砖住宅式建筑，外挑阳台 + 无障碍坡道 + 花园（步道、凉亭、菜圃）
  props_monastery  中层修道院：小礼拜堂 + 回廊 + 素面钟塔（5 座普通修道院的代表，比圣铁摇篮矮小朴素）
  props_street     共用步行街：接驳站台、悬浮救护车停靠点、行道树
  site_ground      片区铺装
  props_lights     灯柱、檐下灯带
bg_*：周边中层楼群、甲板边、磁浮高架（不导出）。

布局（米）：片区地面 z=0；医院居中偏北 x -20..20、y 30..75；养老院居西 x -95..-35、y -20..30；
修道院居东 x 40..95、y -20..30；步行街沿 x=0 南北贯穿。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/care_cluster/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/cc.jpg [--blend /tmp/cc.blend] [--log /tmp/cc.log] [--exposure 0.0]
cam: c1 片区俯瞰 / c2 医院正面 / c3 养老院花园 / c4 修道院回廊
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/cc.jpg', blend='', log='', exposure=''))

HX0, HX1, HY0, HY1 = -20.0, 20.0, 30.0, 75.0    # 医院
CX0, CX1, CY0, CY1 = -95.0, -35.0, -20.0, 30.0  # 养老院
MX0, MX1, MY0, MY1 = 40.0, 95.0, -20.0, 30.0    # 修道院
UZ = 380.0


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(61)

    # ------------------------------------------------------------ 材质
    HTILE = C.pbr('cc_htile', 'white_sandstone_blocks_02', 2.5, tint=(0.9, 0.9, 0.88), value=1.0, sat=0.15)
    HBAND = C.flat('cc_hband', (0.18, 0.42, 0.4), 0.4, coat=0.3)
    GLASS = C.glass('cc_glass', (0.1, 0.14, 0.16))
    GLASS_L = C.glass('cc_glass_l', (0.14, 0.15, 0.12), emit=(1.0, 0.92, 0.75), estr=2.2)
    CTILE = C.pbr('cc_ctile', 'concrete_wall_008', 3.0, tint=(0.82, 0.68, 0.45), sat=0.35)
    CBAND = C.flat('cc_cband', (0.55, 0.4, 0.2), 0.5)
    RAIL = C.pbr('cc_rail', 'Metal009', 1.5, tint=(0.6, 0.6, 0.6), sat=0.15, metal=0.6)
    MSTONE = C.ashlar('cc_mstone', (0.68, 0.65, 0.58), course=0.6, block=1.2, joint=0.012, jc=(0.32, 0.3, 0.26), var=0.06, rough=0.5)
    MROOF = C.pbr('cc_mroof', 'roof_slates_02', 2.6, tint=(0.4, 0.4, 0.44), sat=0.3)
    PAVE = C.pbr('cc_pave', 'precast_stone_paving', 3.0, tint=(0.68, 0.65, 0.6), sat=0.25)
    GRASS = C.flat('cc_grass', (0.16, 0.32, 0.14), 0.85, noise=0.4)
    SOIL = C.flat('cc_soil', (0.22, 0.16, 0.1), 0.9, noise=0.4)
    WOOD = C.flat('cc_wood', (0.35, 0.25, 0.16), 0.7, noise=0.3)
    RED = C.flat('cc_red', (1, 1, 1), 0.4, emit=(1.0, 0.15, 0.1), estr=8.0)
    WHITE_E = C.flat('cc_white_e', (1, 1, 1), 0.4, emit=(0.95, 0.97, 1.0), estr=6.0)
    LAMP = C.flat('cc_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.85, 0.65), estr=13.0)
    LAMPG = C.flat('cc_lamp_g', (1, 1, 1), 0.4, emit=(0.6, 0.95, 0.7), estr=10.0)
    AMB = C.flat('cc_amb', (0.9, 0.91, 0.92), 0.55, metal=0.05)
    LEAF = C.flat('cc_leaf', (0.14, 0.3, 0.13), 0.8, noise=0.5)

    points, spots = [], []

    # ------------------------------------------------------------ 中层公立医院
    hosp = Batch('props_hospital')
    hosp.box(HX0, HX1, HY0 + 6, HY1, 6.0, 34.0, HTILE)                      # 8 层主楼（南侧留门诊裙房）
    for f in range(8):
        z = 6.0 + f * 3.5
        hosp.box(HX0 - 0.1, HX1 + 0.1, HY0 + 5.9, HY0 + 6.1, z + 0.2, z + 2.9, GLASS_L if f % 2 else GLASS)
        hosp.box(HX0 - 0.15, HX1 + 0.15, HY1 - 0.1, HY1 + 0.1, z + 0.2, z + 2.9, GLASS_L if f % 3 else GLASS)
        hosp.box(HX0 - 0.2, HX0, HY0 + 6, HY1, z, z + 0.3, HBAND)
        hosp.box(HX1, HX1 + 0.2, HY0 + 6, HY1, z, z + 0.3, HBAND)
    hosp.box(HX0, HX1, HY0, HY0 + 8, 0, 5.6, HTILE)                          # 一层门诊裙房
    hosp.cyl((HX0 + HX1) / 2, HY0 - 1, 5.4, 9.5, 0.5, AMB, 24, r2=9.5, cap=False)   # 弧形雨篷（半圆盘挑出）
    hosp.box(HX0 + 2, HX0 + 8, HY0 - 0.1, HY0 + 0.1, 0.1, 3.0, GLASS)         # 救护车下客位玻璃门
    hosp.box(HX0 + 2, HX0 + 8, HY0 - 3.0, HY0 - 0.1, -0.02, 0, RED)           # 十字急诊标志改为纯色地标块（无文字）
    hosp.boxc((HX0 + HX1) / 2, HY1 - 3, 34.3, 14, 10, 0.4, AMB)               # 屋顶悬浮救护停机坪
    for dx in (-4, 4):
        hosp.cyl((HX0 + HX1) / 2 + dx, HY1 - 3, 34.7, 0.5, 3, RAIL, 8)
    points.append((((HX0 + HX1) / 2, HY0 + 4, 6.5), 1.2e4, (1.0, 0.85, 0.65)))

    # ------------------------------------------------------------ 中层养老院
    care = Batch('props_care_home')
    care.box(CX0, CX1, CY0, CY1, 0, 13.0, CTILE)
    for f in range(4):
        z = f * 3.2
        care.box(CX0 - 1.6, CX1 + 1.6, CY1 - 0.1, CY1 + 1.6, z + 0.1, z + 2.6, AMB)   # 外挑阳台板
        for k in range(6):
            x = CX0 + 6 + k * 8.5
            care.box(x, x + 4, CY1 - 0.1, CY1 + 0.1, z + 0.3, z + 2.4, GLASS_L)
            care.box(x - 0.3, x + 4.3, CY1 + 1.5, CY1 + 1.65, z + 0.1, z + 1.2, RAIL) # 阳台栏杆
        for k in range(6):                                                     # 南面窗带（无阳台，素窗）
            x = CX0 + 6 + k * 8.5
            care.box(x, x + 4, CY0 - 0.1, CY0 + 0.1, z + 0.3, z + 2.4, GLASS_L if f % 2 else GLASS)
        for k in range(3):                                                     # 东西两端窗
            y = CY0 + 6 + k * 12
            care.box(CX0 - 0.1, CX0 + 0.1, y, y + 3.2, z + 0.3, z + 2.4, GLASS)
            care.box(CX1 - 0.1, CX1 + 0.1, y, y + 3.2, z + 0.3, z + 2.4, GLASS)
        care.box(CX0 - 0.2, CX0, CY0, CY1, z, z + 0.25, CBAND)
    ramp_y = CY0 - 0.5
    care.box(CX0 + 4, CX0 + 16, ramp_y - 6, ramp_y, 0, 0.9, PAVE)             # 无障碍坡道
    care.box(CX0 + 4, CX0 + 16, ramp_y - 6.2, ramp_y - 6.0, 0, 1.2, RAIL)
    gx0, gx1, gy0, gy1 = CX0 - 18, CX0 - 2, CY0 - 2, CY1 + 2                  # 花园
    care.box(gx0, gx1, gy0, gy1, -0.05, 0, GRASS)
    for i in range(5):
        x = gx0 + 3 + i * 3
        care.cyl(x, gy0 + 4 + (i % 2) * 6, 0, 0.25, 3.0, WOOD, 8)
        care.sphere(x, gy0 + 4 + (i % 2) * 6, 3.2, 1.4, LEAF, seg=10, rings=6)
    care.cyl(gx0 + 8, gy1 - 6, 0, 0.15, 2.4, WOOD, 8)                        # 凉亭立柱 x4 + 顶
    for dx, dy in ((-1.6, -1.6), (1.6, -1.6), (-1.6, 1.6), (1.6, 1.6)):
        care.cyl(gx0 + 8 + dx, gy1 - 6 + dy, 0, 0.12, 2.6, WOOD, 8)
    care.boxc(gx0 + 8, gy1 - 6, 2.6, 4.0, 4.0, 0.2, MROOF)
    care.box(gx0 + 2, gx0 + 12, gy0 + 8, gy0 + 12, -0.03, 0, SOIL)            # 菜圃
    points.append(((CX0 + 4, CY1 - 2, 3.0), 8e3, (1.0, 0.9, 0.7)))

    # ------------------------------------------------------------ 中层修道院
    mon = Batch('props_monastery')
    mon.box(MX0 + 10, MX1 - 20, MY0 + 8, MY1 - 4, 0, 8.5, MSTONE)             # 小礼拜堂
    mon.gable(MX0 + 10, MX1 - 20, MY0 + 8, MY1 - 4, 8.5, 4.0, MROOF, along='x', over=0.6)
    for k in range(4):
        x = MX0 + 14 + k * 5.5
        mon.box(x, x + 2.2, MY0 + 7.9, MY0 + 8.1, 1.5, 6.0, GLASS)            # 侧窗
    cx, cy = MX1 - 8, MY0 + 4                                                  # 素面钟塔
    mon.box(cx - 2.6, cx + 2.6, cy - 2.6, cy + 2.6, 0, 14.0, MSTONE)
    mon.box(cx - 2.8, cx + 2.8, cy - 2.8, cy + 2.8, 14.0, 15.2, MROOF)
    for a in range(4):
        aa = a * math.tau / 4
        mon.box(cx + math.cos(aa) * 2.4 - 0.8, cx + math.cos(aa) * 2.4 + 0.8,
                cy + math.sin(aa) * 2.4 - 0.8, cy + math.sin(aa) * 2.4 + 0.8, 11.0, 13.0, GLASS)
    cloR = 16.0                                                               # 回廊（方形柱廊环绕小院）
    ccx, ccy = MX0 + 6, MY0 + 4
    for i in range(16):
        t = i / 16
        if t < 0.25: x, y = ccx + t / 0.25 * cloR, ccy
        elif t < 0.5: x, y = ccx + cloR, ccy + (t - 0.25) / 0.25 * cloR
        elif t < 0.75: x, y = ccx + cloR - (t - 0.5) / 0.25 * cloR, ccy + cloR
        else: x, y = ccx, ccy + cloR - (t - 0.75) / 0.25 * cloR
        mon.cyl(x, y, 0, 0.3, 3.0, MSTONE, 10)
    mon.box(ccx + 1, ccx + cloR - 1, ccy + 1, ccy + cloR - 1, -0.03, 0, GRASS)
    points.append(((cx, cy, 15.5), 6e3, (1.0, 0.95, 0.85)))

    # ------------------------------------------------------------ 共用步行街
    street = Batch('props_street')
    street.box(-6, 6, -20, 75, -0.02, 0, PAVE)
    for i in range(6):
        y = -12 + i * 15
        street.box(-1.4, 1.4, y - 1.4, y + 1.4, -0.03, -0.01, AMB)           # 接驳站台
        street.box(-1.4, 1.4, y - 1.5, y - 1.4, 0, 2.4, AMB)
    for i in range(8):
        y = -16 + i * 12
        for sx in (-8, 8):
            street.cyl(sx, y, 0, 0.35, 3.2, WOOD, 8)
            street.sphere(sx, y, 4.0, 1.6, LEAF, seg=10, rings=6)

    ground = Batch('site_ground')
    ground.box(-100, 100, -25, 80, -0.05, -0.02, PAVE)

    lights = Batch('props_lights')
    for (x, y) in ((-90, 25), (90, 25), (-90, -15), (90, -15), (-25, 70), (25, 70)):
        lights.cyl(x, y, 0, 0.16, 3.4, AMB, 8)
        lights.sphere(x, y, 3.6, 0.3, LAMP if (x + y) % 5 else LAMPG, seg=10, rings=6)
        points.append(((x, y, 3.6), 3e3, (1.0, 0.85, 0.65)))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：中层楼群 + 甲板边 + 磁浮高架
    GLASSD = C.flat('bg_tower', (0.07, 0.08, 0.1), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.3, 0.3, 0.32), 0.8, noise=0.3)
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.0, 3.6), seed=i * 4.7) for i, c in
          enumerate(((1.0, 0.85, 0.6), (0.7, 0.85, 1.0)))]
    LAMPC = C.flat('bg_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=12.0)
    UNDER = C.flat('bg_under', (0.14, 0.13, 0.13), 0.9, noise=0.4)

    far = Batch('bg_deck')
    far.box(-2200, 2200, -2200, 2200, -6, -4, BCONC)

    tw = Batch('bg_towers')
    rb = random.Random(71)
    placed = []
    cam1 = Vector((-160.0, -200.0))
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
    for (x0, x1, y0, y1) in ((-900, 900, 180, 900), (-900, 900, -900, -180)):
        ov.box(x0, x1, y0, y1, UZ, UZ + 8, UNDER)
    for kk in range(-18, 19):
        g = kk * 45.0
        if abs(g) > 180:
            ov.box(-900, 900, g - 1.5, g + 1.5, UZ - 7, UZ, BCONC)
    for i in range(120):
        x, y = rb.uniform(-800, 800), rb.uniform(-800, 800)
        if abs(y) > 180:
            ov.boxc(x, y, UZ - 7.6, 4, 4, 0.6, LAMPC)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光：日间，温暖民生感
    C.sky_sun(sc, 'day', sun_az=195.0, sun_el=45.0, sun_e=3.6, sky_s=0.35)
    for (x, y) in ((-60, 20), (60, 20), (0, 60)):
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 1.0e5; ld.size = 220; ld.color = (0.9, 0.85, 0.75)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, 110)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0

    CAMS = {
        'c1': ((-160.0, -200.0, 140.0), (0.0, 25.0, 15.0), 24, 0.0),
        'c2': ((0.0, -22.0, 8.0), (0.0, 32.0, 16.0), 26, 0.0),
        'c3': ((-104.0, -24.0, 4.5), (-104.0, 20.0, 4.0), 28, 0.0),
        'c4': ((58.0, -34.0, 6.0), (60.0, 2.0, 6.0), 24, 0.0),
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
