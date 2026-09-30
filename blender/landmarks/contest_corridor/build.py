"""大骑士领·圣都 中环「竞赛与狂欢回廊」（site_kavalierki）——只做外观。
卡原文（docs/landmarks/contest_corridor.md，卡 L89）：圣都分三环，中环是「竞赛与狂欢回廊」。
本模型给的是中环的一段：沿环带排开的两层拱廊（回廊本体）、廊外的比试场与看台、
中央的帐篷集市与一座巨轮；外环「铁锈与落败领」另有标记，不在这套里。
中立性：无人物、无文字 / 标志（docs/rejected.md）——旗帜与篷布只用几何纹样。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/contest_corridor/manifest.json 的 budgets 里给三角形预算）：
  props_gallery  回廊本体：两层拱券柱廊（沿 r=200 m 的环带，跨 ±34°）+ 檐部 + 女儿墙
  props_lists    比试场：沙地围栏 + 看台 + 旗门（无字的几何旗）
  props_fair     狂欢区：四顶方帐 + 中央圆亭 + 一座巨轮
  site_ground    铺装环道 + 中央大道 + 草坪
  props_lights   灯柱 + 灯串
bg_*：既有城建（远景楼群与地面，只为成图挡地平线，不导出）。

布局（米，地面 z=0；环心在原点，回廊沿半径 200 m 的弧）：
  回廊弧 ±34°、进深 16 m、高 20 m；比试场在弧内 60×36；集市与巨轮在弧外侧广场；
  巨轮 r=24、轮心高 26 m。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final contest_corridor）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/contest_corridor/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/cc.jpg [--blend /tmp/cc.blend] [--log /tmp/cc.log] [--exposure 0.0]
cam: c1 环带俯瞰（看整段回廊与集市）/ c2 回廊正立面 / c3 比试场与巨轮
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/cc.jpg', blend='', log='', exposure='-0.6'))

R_RING = 200.0       # 环带半径（回廊中心线）
ARC = math.radians(34.0)   # 回廊半张角
DEPTH = 16.0         # 回廊进深
H1, H2 = 10.5, 20.0  # 一层 / 二层高度（相对台基顶）
PL = 1.6             # 台基高
WHEEL_R = 30.0       # 巨轮半径
WHEEL_C = (26.0, -152.0)   # 巨轮位置（集市外侧空地上，避开比试场）

DECK_Z = 380.0


def ring_pt(ang, rad=R_RING):
    return rad * math.cos(ang), rad * math.sin(ang)


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(64)

    ASHLAR = C.pbr('cc_ashlar', 'white_sandstone_blocks_02', 3.2, tint=(0.93, 0.90, 0.84), sat=0.2, weather=0.28)
    MARBLE = C.pbr('cc_marble', 'Marble021', 2.4, tint=(0.95, 0.94, 0.90), sat=0.12)
    PAVE = C.pbr('cc_pave', 'patterned_paving', 4.5, tint=(0.78, 0.68, 0.52), value=0.95, sat=0.55)
    RING = C.pbr('cc_ring', 'patterned_paving', 4.5, tint=(0.90, 0.80, 0.62), value=1.0, sat=0.5)   # 环道：暖色，与铺装场分开
    GRASS = C.pbr('cc_grass', 'grass_ground', 4.0, tint=(0.36, 0.52, 0.22), sat=0.7)
    KERB = C.pbr('cc_kerb', 'white_sandstone_blocks_02', 3.2, tint=(0.55, 0.50, 0.44), value=0.8, sat=0.3)
    FRAME = C.flat('cc_frame', (0.36, 0.13, 0.10), 0.5, metal=0.4)                 # 巨轮骨架：深红褐，压住浅色天空
    OCHRE = C.flat('cc_ochre', (0.86, 0.62, 0.24), 0.7, noise=0.25)
    SAND = C.pbr('cc_sand', 'dirt_floor', 6.0, tint=(0.88, 0.76, 0.52), sat=0.5)
    ROOF = C.pbr('cc_roof', 'roof_slates_02', 2.6, tint=(0.26, 0.27, 0.31), sat=0.3)
    WOOD = C.pbr('cc_wood', 'dark_wood', 2.0, tint=(0.52, 0.42, 0.32), sat=0.3)
    CANVAS = C.flat('cc_canvas', (0.78, 0.70, 0.54), 0.75, noise=0.25)          # 篷布（无字）
    CANVAS_R = C.flat('cc_canvas_r', (0.66, 0.16, 0.14), 0.7, noise=0.3)        # 暖红篷（方帐用）
    CANVAS_B = C.flat('cc_canvas_b', (0.15, 0.26, 0.46), 0.7, noise=0.3)
    BRONZE = C.pbr('cc_bronze', 'Metal009', 2.0, tint=(0.56, 0.44, 0.22), sat=0.35, metal=0.7)
    GOLD = C.flat('cc_gold', (0.78, 0.62, 0.22), 0.28, metal=0.85, coat=0.5)
    GLASS = C.glass('cc_glass', (0.10, 0.12, 0.14))
    LAMP = C.flat('cc_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.88, 0.66), estr=13.0)
    BULB = C.flat('cc_bulb', (1, 1, 1), 0.4, emit=(1.0, 0.86, 0.6), estr=9.0)
    LEAF = C.flat('cc_leaf', (0.15, 0.30, 0.14), 0.8, noise=0.5)

    points = []

    # ------------------------------------------------------------ 回廊本体（两层拱券柱廊，沿环带）
    gal = Batch('props_gallery')
    N_COL = 27                                   # 一层柱数（拱跨 28 段）
    z0 = PL
    for i in range(N_COL + 1):                   # 一层柱
        a = -ARC + 2 * ARC * i / N_COL
        px, py = ring_pt(a)
        gal.cyl(px, py, z0, 1.25, H1 - 0.9, ASHLAR, 12)
        gal.cyl(px, py, z0 + H1 - 0.9, 1.5, 0.5, MARBLE, 12)
    for i in range(N_COL):                       # 一层拱券暗间：墙面上逐间的深色洞口，柱廊读成拱廊而不是墙前立杆
        b0 = -ARC + 2 * ARC * i / N_COL; b1 = -ARC + 2 * ARC * (i + 1) / N_COL
        gal.lathe(0, 0, z0, [(R_RING + DEPTH / 2 - 0.55, 0), (R_RING + DEPTH / 2 - 0.55, H1 - 3.2)], GLASS, 6, a0=b0 + 0.006, a1=b1 - 0.006)
        gal.lathe(0, 0, z0 + H1 - 3.2, [(R_RING + DEPTH / 2 - 0.55, 0), (R_RING + DEPTH / 2 - 0.55, 1.0)], GLASS, 6, a0=b0 + 0.011, a1=b1 - 0.011)
        gal.lathe(0, 0, z0 + H1 - 2.2, [(R_RING + DEPTH / 2 - 0.55, 0), (R_RING + DEPTH / 2 - 0.55, 0.7)], GLASS, 6, a0=b0 + 0.016, a1=b1 - 0.016)
    # 一层券墙：柱后一道连续外墙，柱列读成拱廊（逐间做拱券在环形排布上容易算错，
    # 而且远看与连续券墙几乎无差；要做真拱券留给后续精修）
    gal.lathe(0, 0, z0, [(R_RING + DEPTH / 2 - 0.4, 0), (R_RING + DEPTH / 2 - 0.4, H1 + 2.4)], ASHLAR, 64, a0=-ARC, a1=ARC)
    gal.lathe(0, 0, z0 + H1, [(R_RING + DEPTH / 2, 0), (R_RING + DEPTH / 2, 1.6), (R_RING - DEPTH / 2, 1.6), (R_RING - DEPTH / 2, 0)],
              MARBLE, 64, a0=-ARC, a1=ARC)                                   # 一层檐部
    for i in range(N_COL // 2 + 1):               # 二层贴墙柱
        a = -ARC + 2 * ARC * i / (N_COL // 2)
        px, py = ring_pt(a)
        gal.cyl(px, py, z0 + H1 + 1.6, 0.95, H2 - H1 - 3.0, ASHLAR, 10)
    for i in range(N_COL // 2):                   # 二层窗（发光带）
        a0 = -ARC + 2 * ARC * i / (N_COL // 2); a1 = -ARC + 2 * ARC * (i + 1) / (N_COL // 2)
        gal.lathe(0, 0, z0 + H1 + 3.4, [(R_RING + DEPTH / 2 - 0.4, 0), (R_RING + DEPTH / 2 - 0.4, 4.4)],
                  GLASS, 8, a0=a0 + 0.012, a1=a1 - 0.012)
    gal.lathe(0, 0, z0 + H2 - 1.4, [(R_RING + DEPTH / 2 + 0.6, 0), (R_RING + DEPTH / 2 + 0.6, 1.4),
                                    (R_RING - DEPTH / 2 - 0.6, 1.4), (R_RING - DEPTH / 2 - 0.6, 0)], MARBLE, 64, a0=-ARC, a1=ARC)
    gal.lathe(0, 0, z0 + H2, [(R_RING + DEPTH / 2 + 0.4, 0), (R_RING + DEPTH / 2 + 0.4, 1.2),
                              (R_RING - DEPTH / 2 - 0.4, 1.2), (R_RING - DEPTH / 2 - 0.4, 0)], GOLD, 64, a0=-ARC, a1=ARC)   # 女儿墙金线
    gal.lathe(0, 0, z0 + H2 + 1.2, [(R_RING + DEPTH / 2 + 1.0, 0), (R_RING, 3.0), (R_RING - DEPTH / 2 - 1.0, 0)],
              ROOF, 48, a0=-ARC, a1=ARC)                                            # 坡屋面（沿弧的脊）
    gal.lathe(0, 0, z0, [(R_RING + DEPTH / 2 + 2.0, 0), (R_RING + DEPTH / 2 + 2.0, PL)], MARBLE, 64, a0=-ARC, a1=ARC)   # 台基外侧
    points.append((tuple(ring_pt(0, R_RING - 40)) + (z0 + 14,), 1.2e4, (1.0, 0.88, 0.68)))

    # ------------------------------------------------------------ 比试场（廊内一侧）
    lists = Batch('props_lists')
    lx, ly = ring_pt(0.0, R_RING - 62.0)
    lists.boxc(lx, ly, 0.0, 74.0, 44.0, 0.35, SAND)                       # 沙地
    for (dx, dy, sx, sy) in ((0, 22, 76, 1.6), (0, -22, 76, 1.6), (-37, 0, 1.6, 46), (37, 0, 1.6, 46)):
        lists.boxc(lx + dx, ly + dy, 0.0, sx, sy, 1.5, WOOD)              # 木栏
    lists.boxc(lx, ly + 40.0, 0.0, 56.0, 14.0, 1.0, ASHLAR)               # 看台基
    for t in range(4):                                                     # 四级看台
        lists.boxc(lx, ly + 40.0 + t * 0.0, 1.0 + t * 1.6, 56.0 - t * 2.0, 12.0 - t * 2.4, 1.6, MARBLE)
    lists.boxc(lx, ly + 46.0, 7.4, 58.0, 3.2, 2.0, MARBLE)                 # 看台顶
    for sx in (-1, 1):                                                     # 旗门（无字，几何旗）
        px = lx + sx * 38.0
        lists.cyl(px, ly, 0.0, 0.55, 16.0, ASHLAR, 10)
        lists.boxc(px + sx * 2.4, ly, 14.0, 4.6, 0.3, 3.0, CANVAS_R if sx > 0 else CANVAS_B)
        points.append(((px, ly, 16.6), 3.4e3, (1.0, 0.86, 0.62)))

    # ------------------------------------------------------------ 狂欢区（帐篷集市 + 中央圆亭 + 巨轮）
    fair = Batch('props_fair')
    fx, fy = ring_pt(math.radians(-58.0), R_RING - 30.0)
    for k in range(4):                                                     # 四顶方帐
        a = k * math.tau / 4 + 0.6
        tx, ty = fx + math.cos(a) * 26.0, fy + math.sin(a) * 26.0
        cvs = (CANVAS_R, CANVAS_B, OCHRE, CANVAS_R)[k]                           # 四顶方帐：红 / 蓝 / 赭 / 红，轮换
        fair.boxc(tx, ty, 0.0, 18.0, 18.0, 7.0, cvs)                            # 篷体
        fair.lathe(tx, ty, 7.0, [(12.8, 0), (12.8, 0.7)], cvs, 4)               # 篷檐
        fair.pyramid(tx, ty, 7.7, 18.6, 18.6, 6.4, cvs)                         # 攒尖篷顶
        for sx in (-1, 1):
            fair.boxc(tx + sx * 7.0, ty, 0.0, 0.5, 15.4, 7.0, WOOD)
        fair.boxc(tx, ty - 9.05, 0.0, 4.4, 0.2, 5.2, GLASS)                     # 帐门
        fair.boxc(tx, ty, 14.0, 0.9, 19.0, 0.5, GOLD)                            # 脊饰
    for k, ang in enumerate((math.radians(16.0), math.radians(-24.0))):    # 沿弧带补两处连排摊位
        sx, sy = ring_pt(ang, R_RING - 26.0)
        for j in range(3):
            kx = sx + (j - 1) * 9.0
            fair.boxc(kx, sy, 0.0, 7.0, 7.0, 4.4, (CANVAS_R, CANVAS_B, OCHRE)[(k + j) % 3])
            fair.pyramid(kx, sy, 4.4, 8.0, 8.0, 2.6, OCHRE)
    fair.cyl(fx, fy, 0.0, 13.0, 2.0, MARBLE, 24, r2=12.4)                  # 中央圆亭台基
    for k in range(12):
        a = k * math.tau / 12
        fair.cyl(fx + math.cos(a) * 11.4, fy + math.sin(a) * 11.4, 2.0, 0.6, 8.0, MARBLE, 10)
    fair.lathe(fx, fy, 10.0, [(12.6, 0), (12.6, 1.0), (3.0, 6.0), (0.5, 7.2)], CANVAS, 24)
    points.append(((fx, fy, 14.0), 8e3, (1.0, 0.88, 0.68)))
    # 巨轮（纹样化，无字）
    wx, wy = WHEEL_C
    for sx in (-1, 1):                                                     # A 形支架
        fair.boxc(wx + sx * 7.0, wy - 5.0, 0.0, 1.6, 1.6, 46.0, FRAME)
        fair.boxc(wx + sx * 7.0, wy + 5.0, 0.0, 1.6, 1.6, 46.0, FRAME)
        fair.boxc(wx + sx * 7.0, wy, 46.0, 2.2, 12.0, 2.4, FRAME)
    circ = [(wx + math.cos(i * math.tau / 48) * WHEEL_R, wy, 26.0 + math.sin(i * math.tau / 48) * WHEEL_R) for i in range(48)]
    fair.tube(circ, 0.75, FRAME, 6, closed=True)                          # 轮圈
    circ2 = [(wx + math.cos(i * math.tau / 48) * (WHEEL_R * 0.86), wy, 26.0 + math.sin(i * math.tau / 48) * (WHEEL_R * 0.86)) for i in range(48)]
    fair.tube(circ2, 0.35, FRAME, 5, closed=True)
    for k in range(12):                                                    # 辐条 + 吊舱
        a = k * math.tau / 12
        ex, ez = wx + math.cos(a) * WHEEL_R, 26.0 + math.sin(a) * WHEEL_R
        fair.tube([(wx, wy, 26.0), (ex, wy, ez)], 0.35, FRAME, 5)
        fair.boxc(ex, wy, ez - 4.4, 5.2, 5.2, 4.4, (CANVAS_R, CANVAS_B, OCHRE)[k % 3])
    fair.cyl(wx, wy, 24.8, 1.4, 2.4, FRAME, 12, r2=1.4)                   # 轮心
    points.append(((wx, wy, 52.0), 6e3, (1.0, 0.9, 0.7)))

    # ------------------------------------------------------------ 场地
    ground = Batch('site_ground')
    ground.cyl(148.0, -42.0, -0.14, 245.0, 0.08, GRASS, 88, r2=245.0)          # 外圈草坪，给铺装场一个边
    ground.cyl(148.0, -42.0, -0.06, 215.0, 0.06, PAVE, 88, r2=215.0)      # 铺装场（只铺内容所在的那一区，别铺满画面）
    ground.lathe(0, 0, 0.0, [(R_RING - 22, 0), (R_RING - 22, PL), (R_RING + 22, PL), (R_RING + 22, 0)],
                 KERB, 72, a0=-ARC - 0.14, a1=ARC + 0.14)                    # 回廊下的窄台基带
    ground.lathe(0, 0, 0.0, [(R_RING - 96, 0), (R_RING - 96, 0.12), (R_RING - 44, 0.12)], RING, 72)     # 环道
    ground.lathe(148.0, -42.0, -0.06, [(213.0, 0), (213.0, 0.5), (217.0, 0.5), (217.0, 0)], KERB, 88)   # 铺装场路缘
    ground.boxc(lx, ly - 26.0, 0.06, 96.0, 18.0, 0.1, PAVE)                # 中央大道
    for k in (-1, 1):                                                      # 两侧草坪 + 行道树
        a = k * math.radians(62.0)
        gx, gy = ring_pt(a, R_RING - 44.0)
        ground.boxc(gx, gy, 0.02, 60.0, 40.0, 0.1, GRASS)
        for i in range(6):
            tx = gx - 26.0 + i * 10.4
            ground.cyl(tx, gy - 16.0, 0.02, 0.4, 5.0, WOOD, 8)
            ground.sphere(tx, gy - 16.0, 6.0, 3.2, LEAF, seg=10, rings=6)
    for i in range(9):                                                     # 中央大道两侧行道树
        for side in (-1, 1):
            tx = lx - 44.0 + i * 11.0; ty2 = ly - 26.0 + side * 12.0
            ground.cyl(tx, ty2, 0.02, 0.4, 5.0, WOOD, 8)
            ground.sphere(tx, ty2, 6.0, 3.2, LEAF, seg=10, rings=6)

    # ------------------------------------------------------------ 灯
    lights = Batch('props_lights')
    lamp_pts = []
    for i in range(9):                                                     # 廊前灯柱
        a = -ARC + 2 * ARC * i / 8
        px, py = ring_pt(a, R_RING - 12.0)
        lights.cyl(px, py, PL, 0.3, 5.4, BRONZE, 10)
        lights.cyl(px, py, PL + 5.4, 0.62, 1.2, LAMP, 10, r2=0.42)
        lamp_pts.append((px, py, PL + 5.6))
        points.append(((px, py, PL + 6.2), 3.0e3, (1.0, 0.88, 0.66)))
    for a, b in zip(lamp_pts, lamp_pts[1:]):                               # 灯串（发光细管）
        mx, my, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2] - 3.4
        light_tube = [(a[0], a[1], a[2] - 0.7), (mx, my, mz), (b[0], b[1], b[2] - 0.7)]
        lights.tube(light_tube, 0.12, BULB, 5)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：既有城建 + 上方甲板
    BG = C.flat('bg_conc', (0.36, 0.33, 0.29), 0.85, noise=0.3)
    BG2 = C.flat('bg_dark', (0.17, 0.17, 0.19), 0.85, noise=0.35)
    WGB = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.2, 3.6), seed=i * 4.1) for i, c in
           enumerate(((1.0, 0.85, 0.6), (0.7, 0.85, 1.0)))]
    far = Batch('bg_deck')
    far.box(-5200, 5200, -5200, 5200, -6, -4, BG)
    bt = Batch('bg_towers')
    rb = random.Random(37)
    cam1 = Vector((-160.0, -300.0))
    camb = math.degrees(math.atan2(cam1.y, cam1.x)) % 360
    placed = []
    for k in range(72):
        for _ in range(60):
            a = rb.uniform(0, math.tau); d = rb.uniform(330, 2000)
            x, y = math.cos(a) * d, math.sin(a) * d
            if abs(math.hypot(x, y) - R_RING) < 70: continue               # 让开环带
            w, dd = rb.uniform(26, 58), rb.uniform(26, 58)
            clear = all(abs(x - px) > (w + pw) / 2 + 10 or abs(y - py) > (dd + pd) / 2 + 10 for px, py, pw, pd in placed)
            bearing = math.degrees(a) % 360
            lane = (d < 620) and (abs((bearing - camb + 180) % 360 - 180) < 26)
            if clear and not lane: break
        else:
            continue
        placed.append((x, y, w, dd))
        h = rb.uniform(22, 108)
        bt.box(x - w / 2, x + w / 2, y - dd / 2, y + dd / 2, 0, h, rb.choice(WGB) if k % 3 else BG2)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光：日间偏暖（节庆感）
    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=36.0, sun_e=4.6, sky_s=0.5)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.25)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0

    CAMS = {
        'c1': ((-150.0, -350.0, 150.0), (150.0, -42.0, 20.0), 26, 0.0),
        'c2': ((120.0, -430.0, 78.0), (170.0, -60.0, 24.0), 30, 0.0),
        'c3': ((-60.0, -150.0, 58.0), (120.0, -110.0, 16.0), 28, 0.0),
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
