"""顶级贵族与财阀会所（site_kavalierki）——只做外观。
卡原文（docs/landmarks/elite_club.md，卡 L89 + A31）：圣都核心区有一座会所（顶级贵族与财阀会所）；圣都的城市语汇是黑白石材与巴洛克穹顶。
本模型：黑白大理石横条纹的三层主楼 + 六柱门廊与山花 + 两座铜绿穹顶侧馆 + 后露台水池与无面容立像 + 前庭水轴、鎏金球饰门柱与悬浮车回车圆。
中立性：无人物、无文字 / 标志、无宗教符号、无武器类细节（docs/rejected.md）；立像无面容、无持物，门柱用球饰而非矛尖。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/elite_club/manifest.json 的 budgets 里给三角形预算）：
  props_club     主楼（黑白条纹立面 + 窗 + 檐口）+ 六柱门廊与山花 + 屋顶
  props_domes    两座侧馆 + 铜绿圆穹 + 顶灯亭
  props_terrace  后露台：石栏 + 长方水池 + 黑白交替无面容立像
  props_court    前庭：水轴与喷泉 + 黄杨方格 + 球饰门柱与铁栅栏 + 金色灯笼 + 悬浮车
  site_ground    铺装 + 草坪 + 车道
bg_*：核心区建筑剪影与大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  主楼 x -30..30、y 6..28（檐高 14）；门廊 x -9..9、y -4..6；侧馆 x ±(30..44)、y 8..24（高 9.5）；
  后露台 y 28..46；水轴 x -4..4、y -32..-4；栅栏与门在 y=-36。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final elite_club）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/elite_club/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/elite_club.jpg [--blend /tmp/elite_club.blend] [--log /tmp/elite_club.log]
cam: c1 主视角（东南俯瞰全场）/ c2 自南沿水轴看门廊与正立面 / under 西侧看侧馆穹顶与后露台
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/elite_club.jpg', blend='', log='', exposure='-0.2'))

MX0, MX1, MY0, MY1, MH = -30.0, 30.0, 6.0, 28.0, 14.0
CAMPOS = ((90.0, -100.0), (0.0, -84.0), (-92.0, 40.0))


def hip(B, x0, x1, y0, y1, z, h, m, over=0.6):
    x0 -= over; x1 += over; y0 -= over; y1 += over
    d = min(x1 - x0, y1 - y0) / 2
    ym = (y0 + y1) / 2
    r0, r1 = (x0 + d, ym, z + h), (x1 - d, ym, z + h)
    vs = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), r0, r1]
    fs = [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4), (3, 2, 1, 0)]
    B.poly(vs, fs, m)


def statue(B, x, y, z, s, m):
    """无面容长袍立像（高约 6·s m）：方基座 + 垂褶长袍 + 兜帽，无头部、无持物"""
    B.boxc(x, y, z, 2.0 * s, 2.0 * s, 1.0 * s, m)
    z += 1.0 * s
    B.lathe(x, y, z, [(1.0 * s, 0), (.9 * s, .5 * s), (.74 * s, 2.3 * s), (.6 * s, 3.6 * s), (.68 * s, 4.5 * s), (.76 * s, 5.1 * s), (.4 * s, 5.5 * s), (0, 5.55 * s)], m, n=12)
    B.lathe(x, y, z + 5.4 * s, [(.46 * s, 0), (.48 * s, .4 * s), (.33 * s, .95 * s), (.1 * s, 1.2 * s), (0, 1.22 * s)], m, n=10)


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(83)

    MARBLE = C.pbr('ec_marble', 'Marble021', 2.4, tint=(0.95, 0.94, 0.92), sat=0.08)
    BASALT = C.pbr('ec_basalt', 'Marble021', 2.4, tint=(0.1, 0.1, 0.11), sat=0.05, value=0.6)
    STONE = C.pbr('ec_stone', 'white_sandstone_blocks_02', 3.0, tint=(0.85, 0.83, 0.8), sat=0.15, value=1.0)
    GOLD = C.flat('ec_gold', (0.85, 0.65, 0.22), 0.28, metal=0.9, coat=0.4)
    COPPER = C.flat('ec_copper', (0.3, 0.52, 0.45), 0.5, noise=0.25)
    SLATE = C.pbr('ec_slate', 'roof_slates_02', 2.4, tint=(0.24, 0.26, 0.3), sat=0.3)
    IRON = C.flat('ec_iron', (0.03, 0.03, 0.035), 0.45, metal=0.6)
    GLASSD = C.glass('ec_glass', tint=(0.06, 0.07, 0.09))
    WARM = C.flat('ec_warm', (1, 1, 1), 0.4, emit=(1.0, 0.78, 0.5), estr=7.0)
    LANT = C.flat('ec_lantern', (1, 1, 1), 0.4, emit=(1.0, 0.8, 0.45), estr=16.0)
    PAVE = C.pbr('ec_pave', 'white_sandstone_blocks_02', 2.0, tint=(0.82, 0.8, 0.74), sat=0.3)
    GRAVEL = C.pbr('ec_gravel', 'precast_stone_paving', 2.0, tint=(0.95, 0.9, 0.8), sat=0.35, value=0.9)
    ASPH = C.pbr('ec_asph', 'asphalt_02', 5.0, tint=(0.3, 0.3, 0.32), sat=0.1, value=0.7)
    LAWN = C.pbr('ec_lawn', 'grass_ground', 4.0, tint=(0.36, 0.52, 0.24), sat=0.6)
    HEDGE = C.flat('ec_hedge', (0.07, 0.18, 0.07), 0.85, noise=0.4)
    WATER = C.glass('ec_water', tint=(0.04, 0.14, 0.18), rough=0.03)
    CAR = C.flat('ec_car', (0.9, 0.9, 0.92), 0.25, metal=0.6, coat=0.6)
    CARG = C.glass('ec_carg', tint=(0.03, 0.04, 0.05))
    GROUND = C.flat('ec_bg_ground', (0.42, 0.42, 0.42), 0.95, noise=0.3)
    BG = C.flat('ec_bg', (0.72, 0.72, 0.74), 0.85, noise=0.2)
    BGD = C.flat('ec_bg_d', (0.26, 0.26, 0.3), 0.85, noise=0.2)

    # ------------------------------------------------------------ 主楼
    cl = Batch('props_club')
    cl.box(MX0, MX1, MY0, MY1, 0, MH, MARBLE)
    for k in range(9):                                                                           # 黑大理石横条纹（南 / 北面）
        z = 1.2 + k * 1.5
        cl.boxc(0, MY0 - 0.05, z, 60.0, 0.12, 0.5, BASALT)
        cl.boxc(0, MY1 + 0.05, z, 60.0, 0.12, 0.5, BASALT)
    cl.box(MX0 - 0.6, MX1 + 0.6, MY0 - 0.8, MY1 + 0.6, MH, MH + 0.6, GOLD)                       # 鎏金檐口
    cl.box(MX0 - 0.3, MX1 + 0.3, MY0 - 0.5, MY1 + 0.3, 0, 0.9, BASALT)                           # 勒脚
    for k in range(-9, 10):                                                                      # 一层大窗 + 二三层窗带
        if -3 <= k <= 3: continue
        wx = k * 3.0
        cl.boxc(wx, MY0 - 0.1, 1.2, 1.6, 0.16, 3.6, WARM if k % 4 == 0 else GLASSD)
        cl.boxc(wx, MY0 - 0.14, 1.0, 2.0, 0.18, 0.2, GOLD)
        for fl in (1, 2):
            cl.boxc(wx, MY0 - 0.1, 4.8 + (fl - 1) * 4.2, 1.4, 0.16, 2.8, GLASSD if (k + fl) % 3 else WARM)
            cl.boxc(wx, MY0 - 0.14, 4.6 + (fl - 1) * 4.2, 1.8, 0.18, 0.15, GOLD)
    for k in range(-9, 10):
        for fl in range(3): cl.boxc(k * 3.0, MY1 + 0.08, 1.2 + fl * 4.2, 1.4, 0.16, 2.6, GLASSD if (k + fl) % 3 else WARM)
    # 六柱门廊 + 山花 + 车道
    cl.boxc(0, 1.0, 0, 20.0, 10.0, 0.7, MARBLE)
    for k in range(4): cl.boxc(0, -5.4 + k * 0.5, 0, 16.0 - k * 1.2, 0.5, 0.18 * (4 - k), MARBLE)          # 台阶
    for k in range(6): cl.cyl(-7.5 + k * 3.0, -2.4, 0.7, 0.62, 10.6, MARBLE, 18)
    cl.boxc(0, 1.6, 11.3, 19.0, 9.0, 1.0, MARBLE)
    cl.boxc(0, 1.6, 12.3, 19.5, 9.4, 0.4, GOLD)
    cl.gable(-9.8, 9.8, -3.0, 6.2, 12.7, 2.6, MARBLE, along='x')
    for k in range(-3, 4): cl.boxc(k * 2.4, MY0 - 0.12, 0.7, 1.6, 0.14, 4.4, WARM if k == 0 else GLASSD)        # 门廊后大门
    hip(cl, MX0, MX1, MY0, MY1, MH + 0.6, 2.6, COPPER, over=0.4)                                 # 低坡铜绿屋面

    # ------------------------------------------------------------ 侧馆 + 铜绿圆穹
    dm = Batch('props_domes')
    for sx in (-1, 1):
        x0, x1 = (30.0, 44.0) if sx > 0 else (-44.0, -30.0)
        dm.box(x0, x1, 8.0, 24.0, 0, 9.5, MARBLE)
        for k in range(6): dm.boxc((x0 + x1) / 2, 7.95, 1.2 + k * 1.5, x1 - x0, 0.1, 0.45, BASALT)
        dm.box(x0 - 0.4, x1 + 0.4, 7.6, 24.4, 9.5, 10.0, GOLD)
        for k in range(3):
            dm.boxc(x0 + 3.0 + k * 4.0, 7.9, 1.4, 1.5, 0.14, 3.2, WARM if k == 1 else GLASSD)
            dm.boxc(x0 + 3.0 + k * 4.0, 7.9, 5.4, 1.4, 0.14, 2.6, GLASSD)
        cx, cy = (x0 + x1) / 2, 16.0
        dm.cyl(cx, cy, 10.0, 6.6, 1.2, MARBLE, 32)
        for k in range(12):
            a = k * math.tau / 12
            dm.cyl(cx + 6.6 * math.cos(a), cy + 6.6 * math.sin(a), 10.0, 0.2, 1.2, GOLD, 6)
        dm.lathe(cx, cy, 11.2, [(6.6, 0), (6.3, 1.6), (5.4, 3.4), (4.0, 5.2), (2.2, 6.6), (0.9, 7.3), (0.05, 7.6)], COPPER, n=36)
        dm.cyl(cx, cy, 18.6, 0.9, 1.6, GOLD, 10, r2=0.6)
        dm.sphere(cx, cy, 20.5, 0.7, GOLD, seg=10, rings=6)

    # ------------------------------------------------------------ 后露台
    tr = Batch('props_terrace')
    tr.box(-30.0, 30.0, 28.0, 46.0, 0, 0.9, STONE)
    tr.box(-16.5, 16.5, 32.5, 41.5, 0.9, 1.2, MARBLE)                                            # 水池压顶
    tr.box(-15.5, 15.5, 33.5, 40.5, 1.0, 1.25, WATER)
    for k in range(0, 61, 4):                                                                    # 石栏
        tr.cyl(-30.0 + k, 46.0, 0.9, 0.25, 1.1, MARBLE, 8)
    tr.tube([(-30.0, 46.0, 2.0), (30.0, 46.0, 2.0)], 0.12, MARBLE, 6)
    for sx in (-30.0, 30.0):
        for k in range(0, 19, 3): tr.cyl(sx, 28.0 + k, 0.9, 0.25, 1.1, MARBLE, 8)
        tr.tube([(sx, 28.0, 2.0), (sx, 46.0, 2.0)], 0.12, MARBLE, 6)
    pts = [(-14.0 + i * 4.0, 31.0) for i in range(8)] + [(-14.0 + i * 4.0, 43.0) for i in range(8)]
    for q, (px, py) in enumerate(pts): statue(tr, px, py, 0.9, 0.9, BASALT if q % 2 else MARBLE)

    # ------------------------------------------------------------ 前庭
    ct = Batch('props_court')
    ct.box(-5.0, 5.0, -32.0, -4.0, 0, 0.7, MARBLE)                                               # 水轴
    ct.box(-4.0, 4.0, -31.0, -5.0, 0.6, 0.72, WATER)
    for k, yy in enumerate((-10.0, -18.0, -26.0)):
        ct.cyl(0, yy, 0.7, 1.2, 0.5, MARBLE, 16)
        ct.cyl(0, yy, 1.2, 0.18, 2.8 + (k % 2), WATER, 8, r2=0.05)
        ct.sphere(0, yy, 4.2 + (k % 2), 0.4, WATER, seg=10, rings=6)
    for sx in (-1, 1):                                                                           # 黄杨方格
        for i in range(3):
            for j in range(3):
                bx, by = sx * (12.0 + i * 5.0), -8.0 - j * 7.0
                ct.box(bx - 2.0, bx + 2.0, by - 2.0, by + 2.0, 0.1, 0.9, HEDGE)
    for sx in (-1, 1):                                                                           # 金色灯笼
        for k in range(5):
            ly = -8.0 - k * 5.6
            ct.cyl(sx * 7.0, ly, 0, 0.14, 4.2, IRON, 8)
            ct.sphere(sx * 7.0, ly, 4.6, 0.42, LANT, seg=10, rings=6)
    fy = -36.0                                                                                   # 门柱（鎏金球饰）+ 铁栅栏
    for xs in (-12.0, 12.0, -40.0, 40.0):
        ct.boxc(xs, fy, 0, 1.4, 1.4, 3.4, MARBLE)
        ct.sphere(xs, fy, 4.0, 0.62, GOLD, seg=12, rings=8)
    for (a, b) in ((-40.0, -12.0), (12.0, 40.0)):
        n = int((b - a) / 0.7)
        for i in range(n + 1): ct.cyl(a + i * 0.7, fy, 0, 0.035, 2.2, IRON, 4)
        for zz in (0.3, 2.1): ct.tube([(a, fy, zz), (b, fy, zz)], 0.06, IRON, 4)
    for sx in (-1, 1):                                                                           # 双开铁门
        for i in range(12): ct.cyl(sx * (0.5 + i * 0.9), fy, 0, 0.035, 2.4, IRON, 4)
    for k in range(2):                                                                           # 回车圆上的悬浮车
        cx, cy = 26.0 + k * 0.0, -14.0 - k * 9.0
        ct.cyl(cx, cy, 0, 4.6, 0.08, PAVE, 28)
        ct.sphere(cx, cy, 1.05, 1.0, CAR, sz=0.5, seg=24, rings=12, sx=2.3)
        ct.sphere(cx + 0.3, cy, 1.35, 0.8, CARG, sz=0.55, seg=20, rings=10, sx=1.5, zmin=0.0)
        for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)): ct.cyl(cx + ex * 1.7, cy + ey * 1.2, 0.7, 0.5, 0.25, CAR, 16)

    # ------------------------------------------------------------ 场地
    gr = Batch('site_ground')
    gr.box(-64, 64, -56, 60, -0.3, 0, ASPH)
    gr.box(-50, 50, -38, -3, 0, 0.1, GRAVEL)                                                      # 前庭砾石
    for sx in (-1, 1): gr.box(sx * 21.0 - 10.0, sx * 21.0 + 10.0, -30.0, -5.0, 0.1, 0.16, LAWN)
    gr.box(-9.0, 9.0, -6.0, 6.0, 0.05, 0.1, PAVE)
    gr.box(-50, 50, 28, 50, 0, 0.1, PAVE)
    gr.box(-12.0, 12.0, -56.0, -36.0, 0, 0.08, PAVE)                                              # 大门外铺装

    bg = Batch('bg_ground'); bg.box(-900, 900, -900, 900, -1.5, -0.5, GROUND)
    bt = Batch('bg_towers')
    for i in range(70):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(90, 360)
        px, py = math.cos(a) * d * 1.3, math.sin(a) * d
        if abs(px) < 70 and abs(py) < 66: continue
        if any(math.hypot(px - cx3, py - cy3) < 60 for (cx3, cy3) in CAMPOS): continue
        w, dd = rnd.uniform(14, 34), rnd.uniform(14, 30)
        bt.box(px - w / 2, px + w / 2, py - dd / 2, py + dd / 2, 0, rnd.uniform(16, 70), BG if i % 3 else BGD)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=40.0, sun_e=4.0, sky_s=0.55)
    for sx in (-1, 1): C.point_light('pt_c%d' % sx, (sx * 7.0, -18.0, 4.6), 2.0e3, (1.0, 0.8, 0.5), 0.4)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0
    CAMS = {
        'c1': ((90.0, -100.0, 60.0), (0.0, 8.0, 8.0), 32, 0.0),
        'c2': ((0.0, -84.0, 10.0), (0.0, 10.0, 9.0), 34, 0.0),
        'under': ((-92.0, 40.0, 22.0), (0.0, 14.0, 8.0), 32, 0.0),
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
