"""佣兵公会（中层机构区；卡：雇佣兵接单的地方，军事与治安类）——只做外观。
设定见 docs/landmarks/merc_guild.md。

导出组：
  walls_ext      两层钢筋混凝土主厅（大面积钢卷帘门）+ 侧附矮瞭望塔
  props_board    委托板墙：背光灯格阵列（纯几何，无文字）
  props_pad      起降坪 + 无标识装甲悬浮车
  props_yard     训练场：木桩、沙包架、绳网（无武器道具）
  props_depot    补给库：钢卷帘仓库门 + 露天箱垛
  props_fence_gate 围墙 + 滑动大门 + 哨岗
  site_ground    院落铺装
  props_lights   灯柱、檐下灯带
bg_*：周边中层楼群、甲板边、磁浮高架（不导出）。

布局（米）：院落地面 z=0；主厅 x -22..22、y 10..40；院落东西 ±65、南北 ±50；大门在南墙 (0,-50)。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/merc_guild/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/mg.jpg [--blend /tmp/mg.blend] [--log /tmp/mg.log] [--exposure 0.0]
cam: c1 院落俯瞰 / c2 委托板墙与起降坪 / c3 大门与围墙视高
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/mg.jpg', blend='', log='', exposure=''))

HX0, HX1, HY0, HY1, HH = -22.0, 22.0, 10.0, 40.0, 16.0
YX0, YX1, YY0, YY1 = -65.0, -30.0, -48.0, 8.0
DX0, DX1, DY0, DY1 = 30.0, 65.0, -20.0, 40.0
PX0, PX1, PY0, PY1 = -55.0, -10.0, 12.0, 48.0
CRX, CRY = 65.0, 50.0
UZ = 380.0


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(41)

    # ------------------------------------------------------------ 材质
    CONC = C.pbr('mg_conc', 'concrete_wall_008', 3.5, tint=(0.48, 0.47, 0.46), sat=0.1, weather=0.6)
    CONC2 = C.pbr('mg_conc2', 'concrete_wall_008', 2.5, tint=(0.4, 0.39, 0.38), sat=0.1, weather=0.7)
    STEEL = C.pbr('mg_steel', 'Metal009', 2.0, tint=(0.36, 0.36, 0.38), sat=0.2, metal=0.85)
    RUST = C.flat('mg_rust', (0.28, 0.16, 0.1), 0.7, noise=0.5)
    DARKM = C.flat('mg_darkmetal', (0.05, 0.05, 0.055), 0.35, metal=0.8, noise=0.2)
    SHUTTER = C.hazard('mg_shutter', c1=(0.55, 0.4, 0.05), c2=(0.03, 0.03, 0.03), period=0.5, rough=0.6, wear=0.5)
    PAVE = C.pbr('mg_pave', 'precast_stone_paving', 3.0, tint=(0.4, 0.4, 0.41), sat=0.2)
    ASPH = C.pbr('mg_asphalt', 'asphalt_02', 5.0, tint=(0.26, 0.26, 0.28), sat=0.2, value=0.65)
    SOIL = C.flat('mg_soil', (0.07, 0.055, 0.04), 0.95, noise=0.4)
    WOOD = C.flat('mg_wood', (0.24, 0.16, 0.1), 0.75, noise=0.35)
    ROPE = C.flat('mg_rope', (0.42, 0.36, 0.26), 0.7, noise=0.3)
    SACK = C.flat('mg_sack', (0.4, 0.32, 0.22), 0.8, noise=0.4)
    CRATE = C.flat('mg_crate', (0.28, 0.24, 0.16), 0.65, noise=0.3)
    CRATE2 = C.flat('mg_crate2', (0.2, 0.22, 0.2), 0.6, noise=0.3)
    GLASS = C.glass('mg_glass', (0.05, 0.06, 0.07))
    BOARD = C.holo('mg_board', (1.0, 0.55, 0.1), (0.7, 0.15, 0.05), 5.0, 0.7)
    BOARD2 = C.holo('mg_board2', (0.2, 0.85, 0.9), (0.1, 0.4, 0.7), 4.0, 0.6)
    LAMP = C.flat('mg_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.8, 0.55), estr=15.0)
    LAMPR = C.flat('mg_lamp_r', (1, 1, 1), 0.4, emit=(1.0, 0.3, 0.15), estr=10.0)
    CARP = C.flat('mg_carpaint', (0.1, 0.1, 0.11), 0.3, metal=0.55, coat=0.6, noise=0.15)
    THR = C.flat('mg_thruster', (1, 1, 1), 0.4, emit=(0.9, 0.55, 0.2), estr=8.0)
    LINE = C.flat('mg_line', (0.6, 0.6, 0.58), 0.6, noise=0.3)

    points, spots = [], []

    # ------------------------------------------------------------ 主厅 + 瞭望塔
    hall = Batch('walls_ext')
    hall.box(HX0, HX1, HY0, HY1, 0, HH, CONC)
    hall.box(HX0, HX1, HY0, HY1, HH, HH + 1.0, CONC2)                       # 女儿墙
    for fx0, fx1 in ((-16, -2), (2, 16)):                                    # 正立面（南面）钢卷帘门
        hall.box(fx0, fx1, HY0 - 0.1, HY0 + 0.4, 0.2, 9.0, SHUTTER)
        hall.box(fx0 - 0.3, fx1 + 0.3, HY0 - 0.3, HY0, 0, 9.6, STEEL)
    for k in range(6):                                                      # 二层窄窗带
        x = HX0 + 3 + k * 6.2
        hall.box(x, x + 3.2, HY0 - 0.05, HY0 + 0.05, 10.5, 13.0, GLASS)
    # 瞭望塔（西南角）
    tx, ty = HX0 - 6, HY0 - 2
    hall.box(tx - 3.2, tx + 3.2, ty - 3.2, ty + 3.2, 0, 22.0, CONC2)
    hall.box(tx - 3.6, tx + 3.6, ty - 3.6, ty + 3.6, 22.0, 24.6, DARKM)
    for a in range(4):
        aa = a * math.tau / 4
        hall.box(tx + math.cos(aa) * 3.4 - 1.0, tx + math.cos(aa) * 3.4 + 1.0,
                 ty + math.sin(aa) * 3.4 - 1.0, ty + math.sin(aa) * 3.4 + 1.0, 22.3, 24.0, GLASS)
    points.append(((tx, ty, 24.3), 1.2e4, (1.0, 0.85, 0.6)))

    # ------------------------------------------------------------ 委托板墙
    board = Batch('props_board')
    bx0, bx1, by, bh = -20.0, 20.0, HY1 + 1.5, 9.0
    board.box(bx0, bx1, by, by + 0.6, 0, bh, CONC2)
    cols, rows = 12, 6
    for r in range(rows):
        for c in range(cols):
            x0 = bx0 + 1.0 + c * ((bx1 - bx0 - 2.0) / cols)
            x1 = x0 + (bx1 - bx0 - 2.0) / cols * 0.82
            z0 = 1.0 + r * (bh - 2.0) / rows
            z1 = z0 + (bh - 2.0) / rows * 0.78
            board.box(x0, x1, by + 0.62, by + 0.7, z0, z1, BOARD if (r + c) % 3 else BOARD2)
    board.box(bx0 - 0.4, bx1 + 0.4, by - 0.1, by + 0.05, 0, 0.6, CONC)       # 基座

    # ------------------------------------------------------------ 起降坪 + 悬浮车
    pad = Batch('props_pad')
    pad.box(PX0, PX1, PY0, PY1, -0.05, 0, PAVE)
    for i, (vy) in enumerate((20.0, 30.0, 40.0)):
        vx = -40.0 + i * 11
        pad.box(vx - 3.0, vx + 3.0, vy - 1.6, vy + 1.6, 0.5, 2.0, CARP)
        pad.box(vx - 2.6, vx + 2.6, vy - 1.3, vy + 1.3, 2.0, 2.5, GLASS)
        for sx in (-1, 1):
            pad.cyl(vx + sx * 2.6, vy, 0.3, 0.7, 0.2, THR, 12, r2=0.5)
        points.append(((vx, vy, 1.0), 2.5e3, (0.9, 0.55, 0.2)))

    # ------------------------------------------------------------ 训练场（无武器道具）
    yard = Batch('props_yard')
    yard.box(YX0, YX1, YY0, YY1, -0.05, 0, SOIL)
    for i in range(5):                                                      # 木桩
        x = YX0 + 6 + i * 6.5
        yard.cyl(x, YY0 + 8, 0, 0.35, 2.2, WOOD, 8)
    for i in range(3):                                                      # 沙包（悬挂架）
        x = YX0 + 8 + i * 10
        yard.box(x - 0.2, x + 0.2, YY1 - 12, YY1 - 12.3, 0, 3.4, WOOD)
        yard.box(x - 1.4, x + 1.4, YY1 - 12.15, YY1 - 12.05, 3.2, 3.4, WOOD)
        yard.cyl(x, YY1 - 12, 0.8, 0.45, 2.0, SACK, 10)
    for i in range(6):                                                      # 绳网障碍
        x = YX0 + 5 + i * 5
        yard.tube([(x, YY1 - 2, 0.1), (x, YY1 - 2, 1.4), (x + 4, YY1 - 2, 1.4), (x + 4, YY1 - 2, 0.1)], 0.06, ROPE, n=6)

    # ------------------------------------------------------------ 补给库
    depot = Batch('props_depot')
    depot.box(DX0, DX1, DY0, DY0 + 14, 0, 6.0, CONC2)
    for k in range(4):
        x0 = DX0 + 3 + k * 8
        depot.box(x0, x0 + 6, DY0 - 0.1, DY0 + 0.3, 0.3, 5.2, SHUTTER)
    for i in range(10):                                                     # 露天箱垛
        x = DX0 + rnd.uniform(2, 30); y = DY0 + rnd.uniform(16, 24)
        s = rnd.uniform(1.4, 2.2)
        depot.boxc(x, y, 0, s, s, s * rnd.uniform(0.8, 1.3), rnd.choice([CRATE, CRATE2]))
        if rnd.random() < 0.4:
            depot.boxc(x + rnd.uniform(-0.3, 0.3), y + rnd.uniform(-0.3, 0.3), s * 0.9, s * 0.8, s * 0.8, s * 0.7, CRATE2)

    # ------------------------------------------------------------ 围墙 + 大门 + 哨岗
    wall = Batch('props_fence_gate')
    WH = 4.2
    for (x0, x1, y0, y1) in ((-CRX, CRX, CRY - 1.2, CRY), (-CRX, CRX, -CRY, -CRY + 1.2),
                               (-CRX, -CRX + 1.2, -CRY, CRY), (CRX - 1.2, CRX, -CRY, CRY)):
        wall.box(x0, x1, y0, y1, 0, WH, CONC2)
    wall.box(-6, 6, -CRY, -CRY + 1.2, 0, WH * 1.1, RUST)                    # 大门预留（缺口再挖）
    gate = Batch('props_fence_gate')
    for side in (-1, 1):
        wall.boxc(side * 6.5, -CRY + 0.6, WH * 0.55, 1.4, 1.4, WH * 1.1, CONC2)
    wall.box(-6, 6, -CRY - 0.3, -CRY + 0.3, 0.5, 3.6, DARKM)                # 滑动闸门（半开留缝，视觉上做实心板）
    wall.boxc(0, -CRY - 3.0, 1.5, 2.0, 2.0, 3.0, CONC)                      # 哨岗
    wall.box(-1.2, 1.2, -CRY - 4.0, -CRY - 2.0, 3.0, 3.6, CONC2)
    for sx in (-1, 1):
        wall.box(sx * 1.0 - 0.6, sx * 1.0 + 0.6, -CRY - 3.8, -CRY - 2.2, 1.2, 2.6, GLASS)

    # ------------------------------------------------------------ 铺装、灯
    ground = Batch('site_ground')
    ground.box(-CRX + 1.2, CRX - 1.2, -CRY + 1.2, CRY - 1.2, -0.1, -0.02, ASPH)
    ground.box(HX0 - 2, HX1 + 2, HY0 - 2, HY1 + 8, -0.02, 0, PAVE)
    for t in range(-60, 61, 8):
        ground.box(t - 0.15, t + 0.15, -44, 6, -0.01, 0.01, LINE)

    lights = Batch('props_lights')
    for i in range(10):
        a = i * math.tau / 10
        x, y = math.cos(a) * 58, math.sin(a) * 42
        lights.cyl(x, y, 0, 0.16, 3.0, DARKM, 8)
        lights.sphere(x, y, 3.2, 0.28, LAMP, seg=10, rings=6)
        points.append(((x, y, 3.2), 2.5e3, (1.0, 0.82, 0.58)))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：中层楼群 + 甲板边 + 磁浮高架
    GLASSD = C.flat('bg_tower', (0.07, 0.08, 0.1), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.3, 0.3, 0.32), 0.8, noise=0.3)
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.0, 3.6), seed=i * 6.3) for i, c in
          enumerate(((1.0, 0.82, 0.58), (0.7, 0.85, 1.0)))]
    LAMPC = C.flat('bg_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=12.0)
    LEDB = C.flat('bg_led_b', (1, 1, 1), 0.4, emit=(1.0, 0.5, 0.15), estr=8.0)
    UNDER = C.flat('bg_under', (0.14, 0.13, 0.13), 0.9, noise=0.4)

    far = Batch('bg_deck')
    far.box(-2200, 2200, -2200, 2200, -6, -4, BCONC)

    tw = Batch('bg_towers')
    rb = random.Random(51)
    placed = []
    cam1 = Vector((-150.0, -190.0))
    cam_bearing = math.degrees(math.atan2(cam1.y, cam1.x)) % 360
    for k in range(46):
        for _ in range(50):
            a = rb.uniform(0, math.tau); d = rb.uniform(CRX + 45, 600)
            x, y = math.cos(a) * d, math.sin(a) * d
            w, dd = rb.uniform(26, 55), rb.uniform(26, 55)
            clear = all(abs(x - px) > (w + pw) / 2 + 9 or abs(y - py) > (dd + pd) / 2 + 9 for px, py, pw, pd in placed)
            bearing = math.degrees(a) % 360
            in_cam_lane = (d < 260) and (abs((bearing - cam_bearing + 180) % 360 - 180) < 22)
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
            ov.boxc(x, y, UZ - 7.6, 4, 4, 0.6, rb.choice([LAMPC, LEDB]))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光：傍晚，暖色工业灯
    C.sky_sun(sc, 'day', sun_az=200.0, sun_el=30.0, sun_e=3.0, sky_s=0.28)
    for (x, y) in ((-200, 0), (200, 0), (0, 200)):
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 1.1e5; ld.size = 220; ld.color = (0.85, 0.75, 0.6)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, 120)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0

    CAMS = {
        'c1': ((-140.0, -175.0, 115.0), (0.0, -5.0, 8.0), 26, 0.0),
        'c2': ((28.0, 60.0, 7.0), (0.0, 42.0, 4.5), 26, 0.0),
        'c3': ((0.0, -62.0, 3.4), (0.0, -50.0, 2.4), 30, 0.0),
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
