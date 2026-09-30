"""猎季营地（world）——只做外观。
卡原文（docs/landmarks/hunting_camp.md，卡 L378 + A30）：猎季是秋季野外活动，庄园主带随行同去；营地在天城外的野外，位置未写（放在天城东北荒野为仓库自设）。
本模型：秋季林缘空地上的贵族狩猎营地——宴会大帐、六顶私人圆帐、野外厨房、营火圈、拴马桩、犬舍与悬浮车停泊区，四周秋色阔叶林。
中立性：无人物、无动物、无文字 / 标志、无武器类细节、无猎物与血腥（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/hunting_camp/manifest.json 的 budgets 里给三角形预算）：
  props_marquee  宴会大帐（双坡帆布 + 扇形檐饰 + 帐杆 + 旗杆）
  props_tents    六顶私人圆帐 + 野外厨房帐（烟囱 / 木箱 / 酒桶）
  props_camp     营火圈 + 长凳 / 折叠桌 + 灯笼杆与灯串 + 拴马桩 + 犬舍 + 三辆悬浮车
  props_trees    林缘秋色阔叶林（橙红 / 赭黄 / 金黄）+ 几株常绿
  site_ground    落叶泥地 + 踏出的小径
bg_*：远处林冠与大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  空地 x -60..60、y -46..46；宴会大帐 x -15..15、y 14..26；圆帐沿椭圆弧 (±34, ...)；营火圈 (0, -2)；悬浮车 y≈-30；林缘在空地外。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final hunting_camp）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/hunting_camp/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/hunting_camp.jpg [--blend /tmp/hunting_camp.blend] [--log /tmp/hunting_camp.log]
cam: c1 主视角（东南俯瞰全营）/ c2 自南看宴会大帐与营火 / under 西侧看圆帐弧线与林缘
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/hunting_camp.jpg', blend='', log='', exposure='-0.5'))

CAMPOS = ((84.0, -90.0), (0.0, -74.0), (-90.0, 6.0))


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(97)

    CANVAS = C.flat('hc_canvas', (0.86, 0.8, 0.66), 0.85, noise=0.35)
    CANVAS_R = C.flat('hc_canvas_r', (0.6, 0.18, 0.14), 0.8, noise=0.35)
    CANVAS_B = C.flat('hc_canvas_b', (0.16, 0.26, 0.44), 0.8, noise=0.35)
    CANVAS_G = C.flat('hc_canvas_g', (0.2, 0.36, 0.24), 0.8, noise=0.35)
    TARP = C.flat('hc_tarp', (0.3, 0.32, 0.26), 0.85, noise=0.5)
    WOOD = C.pbr('hc_wood', 'rough_wood', 2.2, tint=(0.46, 0.36, 0.26), sat=0.4, value=0.8)
    WOODD = C.pbr('hc_woodd', 'dark_wood', 2.0, tint=(0.34, 0.26, 0.18), sat=0.3, value=0.85)
    STEEL = C.pbr('hc_steel', 'Metal009', 2.0, tint=(0.28, 0.29, 0.31), sat=0.15, metal=0.85, weather=0.8)
    GOLD = C.flat('hc_gold', (0.82, 0.62, 0.22), 0.3, metal=0.9)
    STONE = C.pbr('hc_stone', 'concrete_wall_008', 4.0, tint=(0.42, 0.4, 0.37), sat=0.2, value=0.8, weather=0.8)
    CHAR = C.flat('hc_char', (0.03, 0.03, 0.03), 0.9, noise=0.4)
    GLOW = C.flat('hc_glow', (1, 1, 1), 0.4, emit=(1.0, 0.45, 0.12), estr=14.0)
    LANT = C.flat('hc_lantern', (1, 1, 1), 0.4, emit=(1.0, 0.82, 0.5), estr=14.0)
    WIN = C.flat('hc_win', (0.05, 0.05, 0.06), 0.4)
    CAR = C.flat('hc_car', (0.85, 0.86, 0.88), 0.25, metal=0.6, coat=0.6)
    CARG = C.glass('hc_carg', tint=(0.03, 0.04, 0.05))
    LEAF_O = C.flat('hc_leaf_o', (0.5, 0.16, 0.04), 0.8, noise=0.6)
    LEAF_Y = C.flat('hc_leaf_y', (0.55, 0.38, 0.06), 0.8, noise=0.6)
    LEAF_R = C.flat('hc_leaf_r', (0.38, 0.07, 0.04), 0.8, noise=0.6)
    LEAF_G = C.flat('hc_leaf_g', (0.09, 0.22, 0.1), 0.85, noise=0.5)
    BARK = C.flat('hc_bark', (0.2, 0.15, 0.11), 0.85, noise=0.3)
    GROUND = C.pbr('hc_ground', 'dirt_floor', 6.0, tint=(0.3, 0.2, 0.09), sat=0.6, value=0.55)
    PATH = C.pbr('hc_path', 'dirt_floor', 4.0, tint=(0.5, 0.38, 0.22), sat=0.4, value=0.8)
    LEAVES = C.flat('hc_leaves', (0.42, 0.18, 0.05), 0.9, noise=0.7)
    BGG = C.flat('hc_bg_ground', (0.2, 0.13, 0.06), 0.95, noise=0.6)

    # ------------------------------------------------------------ 宴会大帐
    mq = Batch('props_marquee')
    x0, x1, y0, y1 = -15.0, 15.0, 14.0, 26.0
    mq.box(x0, x1, y0, y1, 0, 2.6, CANVAS)
    mq.gable(x0, x1, y0, y1, 2.6, 3.4, CANVAS, along='x', over=0.5)
    n = 30
    for i in range(n):                                                                      # 扇形檐饰（红 / 米交替）
        xa = x0 + (x1 - x0) * i / n; xb = x0 + (x1 - x0) * (i + 1) / n
        mq.poly([(xa, y0 - 0.5, 2.5), (xb, y0 - 0.5, 2.5), ((xa + xb) / 2 + 0.0, y0 - 0.55, 1.7)], [(0, 1, 2), (2, 1, 0)], CANVAS_R if i % 2 else CANVAS)
        mq.poly([(xa, y1 + 0.5, 2.5), (xb, y1 + 0.5, 2.5), ((xa + xb) / 2 + 0.0, y1 + 0.55, 1.7)], [(0, 1, 2), (2, 1, 0)], CANVAS_R if i % 2 else CANVAS)
    mq.boxc(0, y0 - 0.06, 0, 5.0, 0.16, 2.4, WIN)                                           # 帐门（暗）
    for xx in (-2.6, 2.6): mq.cyl(xx, y0 - 0.5, 0, 0.09, 2.6, WOODD, 8)
    for xx in (x0, x1):                                                                     # 帐杆 + 旗杆
        mq.cyl(xx, (y0 + y1) / 2, 0, 0.14, 7.4, WOODD, 8)
        mq.sphere(xx, (y0 + y1) / 2, 7.6, 0.25, GOLD, seg=8, rings=6)
        mq.poly([(xx, (y0 + y1) / 2, 7.0), (xx, (y0 + y1) / 2, 6.0), (xx + (2.2 if xx > 0 else -2.2), (y0 + y1) / 2, 6.5)], [(0, 1, 2), (2, 1, 0)], CANVAS_B if xx > 0 else CANVAS_R)
    for k in range(5):                                                                      # 帐侧撑杆
        mq.cyl(x0 + 3 + k * 6.0, y0 - 1.6, 0, 0.06, 2.6, WOODD, 6); mq.cyl(x0 + 3 + k * 6.0, y1 + 1.6, 0, 0.06, 2.6, WOODD, 6)

    # ------------------------------------------------------------ 圆帐 + 厨帐
    tn = Batch('props_tents')
    cols = (CANVAS, CANVAS_R, CANVAS_B, CANVAS_G, CANVAS, CANVAS_R)
    spots = [(-40, 14), (-46, 2), (-44, -12), (40, 14), (46, 2), (44, -12)]
    for k, (tx, ty) in enumerate(spots):
        c = cols[k]
        tn.cyl(tx, ty, 0, 4.2, 2.6, CANVAS, 20)
        tn.lathe(tx, ty, 2.6, [(4.6, 0), (3.6, 1.3), (1.8, 3.0), (0.3, 4.4)], c, n=20)
        tn.sphere(tx, ty, 7.2, 0.3, GOLD, seg=8, rings=6)
        tn.cyl(tx, ty, 7.0, 0.05, 0.9, WOODD, 4)
        tn.poly([(tx, ty, 8.0), (tx, ty, 7.2), (tx + 1.4, ty, 7.6)], [(0, 1, 2), (2, 1, 0)], c)
        sgn = 1 if tx < 0 else -1                                                            # 帐门朝营火
        tn.boxc(tx + sgn * 4.15, ty, 0, 0.14, 1.6, 2.2, WIN)
        tn.cyl(tx + sgn * 5.0, ty - 2.0, 0, 0.08, 2.4, WOODD, 6); tn.sphere(tx + sgn * 5.0, ty - 2.0, 2.6, 0.26, LANT, seg=8, rings=6)
    kx, ky = 0.0, 36.0                                                                      # 野外厨房
    tn.box(kx - 6, kx + 6, ky - 4, ky + 4, 0, 2.2, TARP)
    tn.gable(kx - 6, kx + 6, ky - 4, ky + 4, 2.2, 1.5, TARP, along='x', over=0.4)
    tn.cyl(kx + 3.0, ky + 1.0, 3.0, 0.3, 3.4, STEEL, 10)
    for k in range(6): tn.boxc(kx - 5 + k * 1.6, ky - 5.0, 0, 1.2, 1.0, 0.9 + (k % 2) * 0.4, WOOD)
    for k in range(4): tn.cyl(kx - 8 - k * 0.9, ky + 2.0, 0, 0.4, 0.85, WOODD, 10)

    # ------------------------------------------------------------ 营火 + 长凳 + 灯笼 + 马桩 + 犬舍 + 悬浮车
    cp = Batch('props_camp')
    fx, fy = 0.0, -2.0
    for k in range(14):
        a = k * math.tau / 14
        cp.cyl(fx + 2.1 * math.cos(a), fy + 2.1 * math.sin(a), 0, 0.4, 0.5, STONE, 8)
    cp.cyl(fx, fy, 0, 1.8, 0.16, CHAR, 16)
    for k in range(5):
        a = k * math.tau / 5
        cp.tube([(fx + 0.9 * math.cos(a), fy + 0.9 * math.sin(a), 0.2), (fx, fy, 1.6)], 0.09, WOODD, 5)
    cp.sphere(fx, fy, 1.3, 0.5, GLOW, seg=10, rings=6)
    for k in range(8):                                                                       # 环放长凳（原木）
        a = k * math.tau / 8 + 0.2
        px, py = fx + 5.2 * math.cos(a), fy + 5.2 * math.sin(a)
        cp.boxc(px, py, 0, 2.4, 0.5, 0.45, WOOD)
    for k in range(3):                                                                       # 折叠桌
        cp.boxc(-10.0 + k * 10.0, -14.0, 0.8, 3.0, 1.2, 0.08, WOODD)
        for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)): cp.cyl(-10.0 + k * 10.0 + ex * 1.3, -14.0 + ey * 0.5, 0, 0.04, 0.8, STEEL, 4)
    poles = [(-24, -6), (-24, 12), (24, -6), (24, 12), (-8, 8), (8, 8)]
    for (px, py) in poles:                                                                    # 灯笼杆
        cp.cyl(px, py, 0, 0.09, 3.6, WOODD, 6); cp.sphere(px, py, 3.9, 0.3, LANT, seg=8, rings=6)
    for i in range(len(poles) - 1):
        a, b = poles[i], poles[i + 1]
        if math.hypot(a[0] - b[0], a[1] - b[1]) > 20: continue
        cp.tube([(a[0], a[1], 3.6), ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 3.0), (b[0], b[1], 3.6)], 0.025, STEEL, 4)
    for k in range(8): cp.cyl(-28 + k * 4.0, -24, 0, 0.12, 1.5, WOODD, 6)                    # 拴马桩 + 横杆（不画马）
    cp.tube([(-28, -24, 1.2), (0, -24, 1.2)], 0.05, WOODD, 5)
    cp.tube([(-28, -24, 0.6), (0, -24, 0.6)], 0.05, WOODD, 5)
    for k in range(4):                                                                        # 空犬舍
        kx2 = 22 + k * 3.4
        cp.boxc(kx2, -22.0, 0, 2.4, 1.8, 1.2, WOOD)
        cp.gable(kx2 - 1.4, kx2 + 1.4, -23.0, -21.0, 1.2, 0.7, WOODD, along='y')
        cp.boxc(kx2, -23.02, 0, 0.9, 0.06, 0.9, WIN)
    for k in range(3):                                                                        # 悬浮车
        cx, cy = 16.0 + k * 9.0, -34.0 - (k % 2) * 3.0
        cp.cyl(cx, cy, 0, 3.4, 0.06, STONE, 20)
        cp.sphere(cx, cy, 1.05, 1.0, CAR, sz=0.5, seg=24, rings=12, sx=2.3)
        cp.sphere(cx + 0.3, cy, 1.35, 0.8, CARG, sz=0.55, seg=20, rings=10, sx=1.5, zmin=0.0)
        for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)): cp.cyl(cx + ex * 1.7, cy + ey * 1.2, 0.7, 0.5, 0.25, CAR, 16)
    for k in range(10): cp.boxc(rnd.uniform(-6, 6), 30 + rnd.uniform(-1, 1) + (k % 3) * 0.0, 0, 1.2, 1.0, 0.8, TARP)   # 帐后备品堆

    # ------------------------------------------------------------ 林缘：秋色阔叶林
    tr = Batch('props_trees')
    LEAVES_SET = (LEAF_O, LEAF_Y, LEAF_R, LEAF_O, LEAF_Y)
    for i in range(70):
        a = rnd.uniform(0, math.tau)
        rx, ry = 68.0 + rnd.uniform(0, 22), 54.0 + rnd.uniform(0, 20)
        x, y = math.cos(a) * rx, math.sin(a) * ry
        if any(math.hypot(x - cx3, y - cy3) < 22 for (cx3, cy3) in CAMPOS): continue
        h = rnd.uniform(9, 15)
        tr.cyl(x, y, 0, 0.6, h * 0.6, BARK, 8, r2=0.35)
        tr.tube([(x, y, h * 0.4), (x + rnd.uniform(-1.6, 1.6), y + rnd.uniform(-1.6, 1.6), h * 0.7)], 0.22, BARK, 5)
        if i % 7 == 0:                                                                       # 常绿
            tr.lathe(x, y, h * 0.25, [(3.2, 0), (2.4, h * 0.3), (1.2, h * 0.6), (0.05, h * 0.85)], LEAF_G, n=10)
        else:
            for j in range(5):
                tr.sphere(x + rnd.uniform(-2.4, 2.4), y + rnd.uniform(-2.4, 2.4), h * 0.72 + rnd.uniform(-1.2, 1.8), rnd.uniform(1.8, 3.0), LEAVES_SET[(i + j) % 5], seg=8, rings=6, sz=0.8)

    gr = Batch('site_ground')
    gr.box(-96, 96, -80, 80, -0.3, 0, GROUND)
    gr.box(-60, 60, -46, 46, 0, 0.04, LEAVES)
    for (a, b, w) in (((-4, -46), (0, 12), 4.0), ((-46, 2), (-6, -2), 3.0), ((46, 2), (6, -2), 3.0), ((0, -2), (0, 12), 3.0)):
        gr.strip([(a[0], a[1], 0.06), (b[0], b[1], 0.06)], w, 0.03, PATH)

    bg = Batch('bg_ground'); bg.box(-900, 900, -900, 900, -1.5, -0.5, BGG)
    bt = Batch('bg_canopy')
    for i in range(90):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(120, 420)
        x, y = math.cos(a) * d * 1.2, math.sin(a) * d
        if any(math.hypot(x - cx3, y - cy3) < 40 for (cx3, cy3) in CAMPOS): continue
        bt.sphere(x, y, 9.0, rnd.uniform(7, 12), LEAVES_SET[i % 5], seg=8, rings=5)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=34.0, sun_e=4.0, sky_s=0.55)
    C.point_light('pt_fire', (0.0, -2.0, 1.6), 3.5e3, (1.0, 0.55, 0.2), 0.6)
    for k, (px, py) in enumerate(poles): C.point_light('pt_l%d' % k, (px, py, 3.9), 8e2, (1.0, 0.82, 0.5), 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0
    CAMS = {
        'c1': ((84.0, -90.0, 56.0), (0.0, 6.0, 4.0), 32, 0.0),
        'c2': ((0.0, -74.0, 9.0), (0.0, 10.0, 5.0), 34, 0.0),
        'under': ((-90.0, 6.0, 18.0), (-10.0, 4.0, 4.0), 32, 0.0),
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
