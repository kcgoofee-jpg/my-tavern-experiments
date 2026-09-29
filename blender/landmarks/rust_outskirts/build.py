"""大骑士领·圣都 外环「铁锈与落败领」（site_kavalierki）——只做外观。
卡原文（docs/landmarks/rust_outskirts.md，卡 L89）：圣都分三环，外环是「铁锈与落败领」。
本模型做外环棚屋城区的一段代表性街区：低矮铁皮棚屋群 + 巷道杂物 + 一座锈蚀水塔；
清算转运站 / 独立骑士营地 / 临光家族外城驻所三处卡里写明的设施另有独立标记、单独建模
（clearing_depot / free_knight_camp / linguang_post），不在这套里（口径同 contest_corridor）。
中立性：无人物、无文字 / 标志、无武器类细节（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/rust_outskirts/manifest.json 的 budgets 里给三角形预算）：
  props_shanties  棚屋群（铁皮墙板 / 坡顶 / 门窗 / 烟囱管 / 阁楼层）
  props_clutter   巷道杂物（条箱、油桶、板材堆、防水布棚檐、灯杆）
  props_tank      锈蚀水塔（四腿钢架 + 罐体 + 锥顶）
  site_ground     泥土地面 + 主巷铺装
bg_*：北侧阔叶林带与河、周边棚屋剪影、大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  街区约 150 × 110：东西主巷 y ∈ [-10, 2]，南北巷 x ∈ [-34, -26] / [18, 26]；
  南北两侧各三排棚屋带；水塔在 (5, 14)；北缘 y > 56 是林带，河在 y ∈ [80, 112]。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final rust_outskirts）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/rust_outskirts/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/rust_outskirts.jpg [--blend /tmp/rust_outskirts.blend] [--log /tmp/rust_outskirts.log]
cam: c1 主视角（东南俯瞰全街区）/ c2 主巷透视 / under 北侧看水塔与林带河
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/rust_outskirts.jpg', blend='', log='', exposure=''))

LANE_Y = (-10.0, 2.0)      # 东西主巷
NS_LANES = [(-34.0, -26.0), (18.0, 26.0)]   # 南北巷
STRIPS_S = [(-55.0, -42.0), (-38.0, -26.0), (-22.0, -12.0)]
STRIPS_N = [(8.0, 22.0), (28.0, 42.0), (46.0, 55.0)]
X_SPAN = (-72.0, 72.0)
TOWER = (5.0, 14.0)        # 水塔位置（北排一、二带之间留空地）


def in_lane(x, y):
    for a, b in NS_LANES:
        if a - 1.0 < x < b + 1.0:
            return True
    return LANE_Y[0] - 1.0 < y < LANE_Y[1] + 1.0


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(47)

    SHEET = C.pbr('ro_sheet', 'box_profile_metal_sheet', 2.6, tint=(0.58, 0.32, 0.17), sat=0.8, value=1.12, metal=0.3, weather=1.0)
    GALV = C.pbr('ro_galv', 'box_profile_metal_sheet', 2.6, tint=(0.55, 0.57, 0.58), sat=0.22, value=1.1, metal=0.5, weather=0.85)
    BLUE = C.pbr('ro_blue', 'box_profile_metal_sheet', 2.6, tint=(0.3, 0.42, 0.54), sat=0.45, value=1.15, metal=0.35, weather=0.95)
    GREEN = C.pbr('ro_green', 'box_profile_metal_sheet', 2.6, tint=(0.34, 0.46, 0.32), sat=0.4, value=1.12, metal=0.35, weather=0.95)
    WOOD = C.pbr('ro_wood', 'rough_wood', 2.2, tint=(0.52, 0.41, 0.29), sat=0.45, value=0.8)
    WOOD_D = C.pbr('ro_wood_d', 'dark_wood', 2.0, tint=(0.46, 0.37, 0.28), sat=0.35, value=1.1)
    BRICK = C.pbr('ro_brick', 'dark_brick_wall', 2.4, tint=(0.55, 0.47, 0.42), sat=0.4, value=1.15, weather=0.6)
    DIRT = C.pbr('ro_dirt', 'dirt_floor', 7.0, tint=(0.4, 0.34, 0.25), sat=0.45, value=0.7)
    LANE = C.pbr('ro_lane', 'asphalt_02', 5.0, tint=(0.42, 0.41, 0.4), sat=0.2, value=0.75)
    METAL = C.pbr('ro_metal', 'Metal009', 2.2, tint=(0.42, 0.36, 0.3), sat=0.4, metal=0.75, weather=0.9)
    RUST_T = C.pbr('ro_rust_t', 'box_profile_metal_sheet', 2.4, tint=(0.5, 0.26, 0.12), sat=0.8, value=1.15, metal=0.3, weather=1.0)
    CANVAS_T = C.flat('ro_canvas_t', (0.5, 0.47, 0.4), 0.8, noise=0.4)
    CANVAS_B = C.flat('ro_canvas_b', (0.3, 0.34, 0.38), 0.8, noise=0.4)
    WIN = C.flat('ro_win', (0.045, 0.05, 0.055), 0.35)
    LAMP = C.flat('ro_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.85, 0.6), estr=6.0)
    WATER = C.flat('ro_water', (0.1, 0.16, 0.18), 0.25)
    GROUND = C.flat('ro_bg_ground', (0.19, 0.21, 0.15), 0.95, noise=0.5)
    BG_SHACK = C.flat('ro_bg_shack', (0.3, 0.28, 0.25), 0.9)

    WALLS = [SHEET, GALV, BLUE, GREEN, WOOD, BRICK]
    ROOFS = [SHEET, GALV, BLUE, GREEN, WOOD_D, RUST_T]

    # ------------------------------------------------------------ 棚屋群
    sh = Batch('props_shanties')

    def shack(x, y, w, d, h, rot=False):
        """rot=True：长边沿 y（南北巷口朝向），否则沿 x。"""
        if not rot:
            x0, x1, y0, y1 = x - w / 2, x + w / 2, y - d / 2, y + d / 2
        else:
            x0, x1, y0, y1 = x - d / 2, x + d / 2, y - w / 2, y + w / 2
        wall = WALLS[rnd.randrange(len(WALLS))]
        sh.box(x0, x1, y0, y1, 0.0, h, wall)
        rh = rnd.uniform(1.0, 1.9)
        sh.gable(x0, x1, y0, y1, h, rh, ROOFS[rnd.randrange(len(ROOFS))],
                 along='x' if not rot else 'y', over=rnd.uniform(0.3, 0.7))
        # 门（朝主巷 / 巷口一侧的墙面）
        if rnd.random() < 0.85:
            dw, dh = 1.1, 2.1
            if not rot:
                dy = y0 + 0.02 if y > 0 else y1 - 0.12
                sh.boxc(x + rnd.uniform(-w / 4, w / 4), dy + 0.05, 0.0, dw, 0.1, dh, WOOD_D)
            else:
                dx = x0 + 0.02 if x > 0 else x1 - 0.12
                sh.boxc(dx + 0.05, y + rnd.uniform(-w / 4, w / 4), 0.0, 0.1, dw, dh, WOOD_D)
        # 小窗（暗块）
        for _ in range(rnd.randrange(1, 3)):
            if not rot:
                wx = x + rnd.uniform(-w / 3, w / 3); wy = (y0 if rnd.random() < 0.5 else y1)
                sh.boxc(wx, wy + (-0.06 if wy == y0 else 0.06), rnd.uniform(1.1, 1.6), 0.9, 0.12, 0.8, WIN)
            else:
                wy2 = y + rnd.uniform(-w / 3, w / 3); wx2 = (x0 if rnd.random() < 0.5 else x1)
                sh.boxc(wx2 + (-0.06 if wx2 == x0 else 0.06), wy2, rnd.uniform(1.1, 1.6), 0.12, 0.9, 0.8, WIN)
        # 烟囱管
        if rnd.random() < 0.6:
            px = x + rnd.uniform(-w / 3, w / 3); py = y + rnd.uniform(-d / 3, d / 3)
            sh.cyl(px, py, h + rh, 0.09, rnd.uniform(0.8, 1.5), METAL, 8)
        # 阁楼层（约三成）
        if rnd.random() < 0.32:
            w2, d2, h2 = w * rnd.uniform(0.45, 0.65), d * rnd.uniform(0.6, 0.8), rnd.uniform(1.9, 2.4)
            cx2 = x + rnd.uniform(-0.6, 0.6); cy2 = y + rnd.uniform(-0.4, 0.4)
            if not rot:
                sh.boxc(cx2, cy2, h + rh, w2, d2, h2, WALLS[rnd.randrange(len(WALLS))])
                sh.gable(cx2 - w2 / 2, cx2 + w2 / 2, cy2 - d2 / 2, cy2 + d2 / 2, h + rh + h2, 0.8,
                         ROOFS[rnd.randrange(len(ROOFS))], over=0.15)
            else:
                sh.boxc(cx2, cy2, h + rh, d2, w2, h2, WALLS[rnd.randrange(len(WALLS))])
                sh.gable(cx2 - d2 / 2, cx2 + d2 / 2, cy2 - w2 / 2, cy2 + w2 / 2, h + rh + h2, 0.8,
                         ROOFS[rnd.randrange(len(ROOFS))], along='y', over=0.15)
        # 斜搭防水布棚檐（门口上方）
        if rnd.random() < 0.4:
            cw = min(2.4, w * 0.4)
            ax = x + rnd.uniform(-w / 4, w / 4)
            ay = (y1 + 1.1) if y < 0 else (y0 - 1.1)
            az = rnd.uniform(2.2, 2.6)
            sh.poly([(ax - cw / 2, ay - 0.9 if y < 0 else ay + 0.9, az),
                     (ax + cw / 2, ay - 0.9 if y < 0 else ay + 0.9, az),
                     (ax + cw / 2, ay, az + 0.7),
                     (ax - cw / 2, ay, az + 0.7)],
                    [(3, 2, 1, 0)], CANVAS_T if rnd.random() < 0.6 else CANVAS_B)

    def fill_strip(y0, y1):
        d = y1 - y0
        x = X_SPAN[0] + rnd.uniform(0.0, 3.0)
        while x < X_SPAN[1] - 6.0:
            w = rnd.uniform(6.0, 11.0)
            gap = rnd.uniform(1.2, 4.5)
            cx = x + w / 2
            cy = (y0 + y1) / 2 + rnd.uniform(-0.6, 0.6)
            if in_lane(cx - w / 2, cy) or in_lane(cx + w / 2, cy):
                x += w + gap
                continue
            if math.hypot(cx - TOWER[0], cy - TOWER[1]) < 11.0:
                x += w + gap
                continue
            if rnd.random() < 0.07:      # 空地：这间不盖
                x += w + gap
                continue
            rot = rnd.random() < 0.18
            shack(cx, cy, w, d * rnd.uniform(0.82, 0.98), rnd.uniform(2.7, 3.7), rot)
            x += w + gap

    for s in STRIPS_S:
        fill_strip(*s)
    for s in STRIPS_N:
        fill_strip(*s)

    # ------------------------------------------------------------ 巷道杂物
    cl = Batch('props_clutter')

    def crate(x, y, s, h):
        cl.boxc(x, y, 0, s, s, h, WOOD)

    def barrel(x, y, r=0.34, h=0.92):
        cl.cyl(x, y, 0, r, h, METAL, 10)
        cl.cyl(x, y, h * 0.25, r + 0.02, 0.06, METAL, 10)
        cl.cyl(x, y, h * 0.7, r + 0.02, 0.06, METAL, 10)

    def planks(x, y, n=4):
        for i in range(n):
            yy = y + rnd.uniform(-1.0, 1.0)
            cl.boxc(x + rnd.uniform(-0.4, 0.4), yy, i * 0.09,
                    rnd.uniform(2.2, 3.4), 0.24, 0.07, WOOD)

    def lamp(x, y):
        cl.cyl(x, y, 0, 0.07, 4.2, METAL, 8)
        cl.cyl(x, y, 4.2, 0.12, 0.5, METAL, 8)
        cl.boxc(x, y, 4.62, 0.42, 0.28, 0.16, LAMP)

    spots = [(-14, -6), (-2, 12), (34, -6), (-46, 6), (52, 14), (-58, -30),
             (12, -32), (-8, 34), (40, 34), (60, -44), (-64, 18), (24, 48)]
    for (sx, sy) in spots:
        pick = rnd.random()
        if pick < 0.35:
            for _ in range(rnd.randrange(2, 5)):
                crate(sx + rnd.uniform(-1.6, 1.6), sy + rnd.uniform(-1.6, 1.6),
                      rnd.uniform(0.8, 1.3), rnd.uniform(0.7, 1.1))
        elif pick < 0.6:
            for _ in range(rnd.randrange(2, 5)):
                barrel(sx + rnd.uniform(-1.4, 1.4), sy + rnd.uniform(-1.4, 1.4))
        elif pick < 0.8:
            planks(sx, sy)
        elif pick < 0.92:
            crate(sx, sy, 1.1, 0.9); barrel(sx + 1.3, sy + 0.5); planks(sx - 1.4, sy - 0.8, 3)
        else:
            pass
    for (lx, ly) in [(-30, -4), (22, -4), (-4, 4), (-56, 4), (50, 4), (2, 24), (-30, 30)]:
        lamp(lx, ly)

    # ------------------------------------------------------------ 锈蚀水塔
    tk = Batch('props_tank')
    tx, ty = TOWER
    TZ = 9.0
    for i in range(4):
        a = math.tau * i / 4 + math.pi / 4
        lx, ly = tx + 2.6 * math.cos(a), ty + 2.6 * math.sin(a)
        tk.cyl(lx, ly, 0, 0.18, TZ, METAL, 8)
    for zz in (2.8, 5.8):        # 水平撑
        for i in range(4):
            a0 = math.tau * i / 4 + math.pi / 4
            a1 = math.tau * (i + 1) / 4 + math.pi / 4
            p0 = (tx + 2.6 * math.cos(a0), ty + 2.6 * math.sin(a0), zz)
            p1 = (tx + 2.6 * math.cos(a1), ty + 2.6 * math.sin(a1), zz)
            tk.strip([p0, p1], 0.12, 0.12, METAL)
    tk.cyl(tx, ty, TZ, 2.3, 3.4, RUST_T, 20, r2=2.1)
    tk.cyl(tx, ty, TZ + 3.4, 2.1, 1.6, RUST_T, 20, r2=0.0)   # 锥顶
    tk.cyl(tx, ty, TZ + 3.4, 0.1, 1.0, METAL, 6)             # 顶杆

    # ------------------------------------------------------------ 地面
    gr = Batch('site_ground')
    gr.box(-90, 90, -70, 62, -0.3, 0.0, DIRT)
    gr.box(LANE_Y[0], LANE_Y[1], -76, 76, 0.0, 0.04, LANE) if False else None
    gr.box(-76, 76, LANE_Y[0], LANE_Y[1], 0.0, 0.04, LANE)
    for a, b in NS_LANES:
        gr.box(a, b, -58, 58, 0.0, 0.04, LANE)

    # ------------------------------------------------------------ bg：林带 + 河 + 剪影 + 大地
    bg = Batch('bg_ground')
    bg.box(-700, 700, -700, 700, -1.6, -0.5, GROUND)
    bg.box(-500, 500, 80, 112, -0.4, -0.1, WATER)
    sil = Batch('bg_shacks')
    for _ in range(26):
        sx = rnd.uniform(-260, 260)
        sy = rnd.choice([rnd.uniform(-200, -90), rnd.uniform(90, 200), rnd.uniform(-260, -110)])
        sil.boxc(sx, sy, -0.5, rnd.uniform(6, 14), rnd.uniform(5, 10), rnd.uniform(2.4, 4.2), BG_SHACK)
    forest = Batch('bg_trees')
    TM = C.tree_mats()
    for i in range(14):          # 北缘林带（河之前）
        fx = -90 + i * 14.0 + rnd.uniform(-4, 4)
        fy = rnd.uniform(60, 74)
        C.tree(forest, fx, fy, rnd.uniform(9, 14), rnd.uniform(3.2, 5.0), 'oak', seed=100 + i)
    for i in range(5):           # 河对岸远树
        fx = -80 + i * 40.0 + rnd.uniform(-8, 8)
        C.tree(forest, fx, 128 + rnd.uniform(-6, 6), rnd.uniform(10, 15), rnd.uniform(3.5, 5.2), 'oak', seed=200 + i)
    for i in range(3):           # 南缘零星
        C.tree(forest, rnd.uniform(-70, 70), -72 - rnd.uniform(0, 10), rnd.uniform(8, 12), rnd.uniform(3, 4.5), 'oak', seed=300 + i)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=44.0)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.1
    CAMS = {
        'c1': ((-120.0, -150.0, 95.0), (0.0, 6.0, 4.0), 30, 0.0),
        'c2': ((-58.0, -4.0, 4.5), (30.0, 0.0, 5.5), 35, 0.0),
        'under': ((46.0, 98.0, 22.0), (-4.0, 10.0, 7.0), 35, 0.0),
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
