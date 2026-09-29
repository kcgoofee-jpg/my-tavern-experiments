"""大骑士领·圣都 外环「独立骑士黑市营地」（site_kavalierki）——只做外观。
卡原文（docs/landmarks/free_knight_camp.md，卡 L89 + A31）：外环有「独立骑士黑市营地」；附加设定写它是帐篷营地。
本模型：中央大帐 + 帐篷圈 + 黑市货摊 + 瞭望木塔 + 篝火圈 / 拴马桩等生活痕迹。
中立性：无人物、无文字 / 标志、无武器类细节；旗帜只用无字几何纹样（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/free_knight_camp/manifest.json 的 budgets 里给三角形预算）：
  props_tents   中央大帐（双坡帆布 + 门厅柱 + 无字旗杆）+ 四周 A 形 / 圆锥小帐篷
  props_market  黑市货摊（木架斜面帆布棚 + 摊台道具）+ 两层瞭望木塔
  props_camp    篝火圈、拴马桩列、条箱坐凳、水桶架
  site_ground   踩实泥地空地 + 车辙 + 草缘
bg_*：北缘林带、远处棚屋剪影、大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  营地约 110 × 90：大帐 (0, 16) 16 × 10；小帐篷圈半径 ~30 散布；货摊三处（东 / 西 / 南）；
  瞭望塔 (38, 6)；篝火圈 (-14, -8) 与 (18, -16)；拴马桩沿南缘一排。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final free_knight_camp）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/free_knight_camp/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/free_knight_camp.jpg [--blend /tmp/free_knight_camp.blend] [--log /tmp/free_knight_camp.log]
cam: c1 主视角（东南俯瞰全营）/ c2 大帐与旗杆正立面 / under 西侧看帐篷圈与货摊
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/free_knight_camp.jpg', blend='', log='', exposure=''))

BIG = dict(x=-0.0, y=16.0, w=16.0, d=10.0)   # 大帐中心与footprint


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(23)

    CANV = C.pbr('fc_canv', 'cotton_jersey', 2.2, tint=(0.56, 0.52, 0.44), sat=0.3, value=0.85, weather=0.7)
    CANV_B = C.pbr('fc_canv_b', 'cotton_jersey', 2.0, tint=(0.32, 0.29, 0.25), sat=0.3, value=0.95, weather=0.6)
    CANV_R = C.pbr('fc_canv_r', 'cotton_jersey', 2.0, tint=(0.44, 0.22, 0.16), sat=0.5, value=0.95, weather=0.6)
    WOOD = C.pbr('fc_wood', 'rough_wood', 2.2, tint=(0.5, 0.4, 0.29), sat=0.45, value=0.7)
    WOOD_D = C.pbr('fc_wood_d', 'dark_wood', 2.0, tint=(0.4, 0.33, 0.26), sat=0.3)
    METAL = C.pbr('fc_metal', 'Metal009', 2.2, tint=(0.45, 0.42, 0.4), sat=0.25, metal=0.75, weather=0.8)
    DIRT = C.pbr('fc_dirt', 'dirt_floor', 6.5, tint=(0.4, 0.34, 0.25), sat=0.4, value=0.55)
    GRASS = C.pbr('fc_grass', 'grass_ground', 5.0, tint=(0.36, 0.4, 0.26), sat=0.5, value=0.7)
    STONE = C.pbr('fc_stone', 'precast_stone_paving', 2.0, tint=(0.45, 0.43, 0.4), sat=0.2, value=0.8)
    FLAG_A = C.flat('fc_flag_a', (0.55, 0.18, 0.15), 0.75, noise=0.25)
    FLAG_B = C.flat('fc_flag_b', (0.2, 0.3, 0.45), 0.75, noise=0.25)
    DARK = C.flat('fc_dark', (0.06, 0.06, 0.065), 0.9)
    ASH = C.flat('fc_ash', (0.08, 0.08, 0.08), 0.95)
    GROUND = C.flat('fc_bg_ground', (0.19, 0.21, 0.15), 0.95, noise=0.5)
    BG_SHACK = C.flat('fc_bg_shack', (0.3, 0.28, 0.25), 0.9)
    CANVS = [CANV, CANV_B, CANV_R]

    # ------------------------------------------------------------ 大帐 + 小帐篷
    tn = Batch('props_tents')
    bx, by, bw, bd = BIG['x'], BIG['y'], BIG['w'], BIG['d']

    def big_tent():
        """战帐形制：1.6 m 矮墙 + 3.4 m 陡脊帆布顶（大出檐），读作营帐而不是房子。"""
        hw = 1.6
        tn.box(bx - bw / 2, bx + bw / 2, by - bd / 2, by + bd / 2, 0, hw, CANV)
        tn.gable(bx - bw / 2, bx + bw / 2, by - bd / 2, by + bd / 2, hw, 3.4, CANV, over=1.3)
        tn.strip([(bx - bw / 2 - 1.3, by - bd / 2 - 1.3, 1.9), (bx + bw / 2 + 1.3, by - bd / 2 - 1.3, 1.9),
                  (bx + bw / 2 + 1.3, by + bd / 2 + 1.3, 1.9), (bx - bw / 2 - 1.3, by + bd / 2 + 1.3, 1.9),
                  (bx - bw / 2 - 1.3, by - bd / 2 - 1.3, 1.9)], 0.18, 0.3, CANV_B)   # 滚边檐带
        # 门厅（朝南）：两柱 + 出檐斜面 + 暗门洞
        for px in (bx - 2.2, bx + 2.2):
            tn.cyl(px, by - bd / 2 - 2.2, 0, 0.09, 3.0, WOOD_D, 8)
        tn.poly([(bx - 3.4, by - bd / 2 + 0.2, 3.6), (bx + 3.4, by - bd / 2 + 0.2, 3.6),
                 (bx + 3.4, by - bd / 2 - 2.4, 2.7), (bx - 3.4, by - bd / 2 - 2.4, 2.7)],
                [(3, 2, 1, 0)], CANV_R)
        tn.boxc(bx, by - bd / 2 - 0.1, 0, 2.0, 0.12, 2.2, DARK)
        # 帐前两根无字旗杆（几何纹样旗）
        for px, fm in ((bx - 5.5, FLAG_A), (bx + 5.5, FLAG_B)):
            tn.cyl(px, by - bd / 2 - 2.8, 0, 0.07, 6.5, WOOD_D, 8)
            tn.poly([(px, by - bd / 2 - 2.8, 5.6), (px + 1.7, by - bd / 2 - 2.8, 5.2),
                     (px + 1.7, by - bd / 2 - 2.8, 4.5), (px, by - bd / 2 - 2.8, 4.9)],
                    [(3, 2, 1, 0)], fm)

    def a_tent(cx, cy, w, d, h, m):
        """A 形帐：两片斜面 + 背山墙 + 暗门洞，脊沿 x。"""
        tn.poly([(cx - w / 2, cy - d / 2, 0), (cx + w / 2, cy - d / 2, 0),
                 (cx + w / 2, cy, h), (cx - w / 2, cy, h)], [(0, 1, 2, 3)], m)
        tn.poly([(cx - w / 2, cy + d / 2, 0), (cx + w / 2, cy + d / 2, 0),
                 (cx + w / 2, cy, h), (cx - w / 2, cy, h)], [(3, 2, 1, 0)], m)
        tn.poly([(cx - w / 2, cy - d / 2, 0), (cx - w / 2, cy + d / 2, 0), (cx - w / 2, cy, h)],
                [(0, 2, 1)], m)
        tn.poly([(cx + w / 2, cy - d / 2, 0), (cx + w / 2, cy + d / 2, 0), (cx + w / 2, cy, h)],
                [(0, 1, 2)], m)
        tn.boxc(cx + w / 2 + 0.05, cy, 0, 0.12, 0.9, 1.5, DARK)
        tn.cyl(cx - w / 2 - 0.3, cy, h - 0.6, 0.05, 1.4, WOOD_D, 6)   # 露出帐脊的木杆

    def cone_tent(cx, cy, r, h, m):
        tn.cyl(cx, cy, 0, r, h, m, 12, r2=0.08)
        tn.cyl(cx, cy, h - 0.4, 0.05, 1.0, WOOD_D, 6)
        tn.boxc(cx + r + 0.05, cy, 0, 0.12, 0.8, 1.4, DARK)

    big_tent()
    tent_spots = [(-26, 18, 'a'), (-20, 32, 'c'), (2, 38, 'a'), (22, 30, 'c'), (28, 16, 'a'),
                  (24, -2, 'c'), (-24, -2, 'a'), (-14, 34, 'c'), (10, -6, 'a'), (-32, 6, 'c')]
    for i, (tx, tyy, kind) in enumerate(tent_spots):
        if math.hypot(tx - bx, tyy - by) < 13:
            continue
        m = CANVS[i % 3]
        if kind == 'a':
            a_tent(tx, tyy, rnd.uniform(4.5, 6.0), rnd.uniform(3.2, 4.0), rnd.uniform(2.4, 3.0), m)
        else:
            cone_tent(tx, tyy, rnd.uniform(2.4, 3.2), rnd.uniform(3.0, 3.8), m)
        # 帐前器械箱 + 铺盖卷
        tn.boxc(tx + rnd.uniform(-2, 2), tyy - rnd.uniform(2.5, 3.5), 0, 1.1, 0.7, 0.6, WOOD_D)
        tn.cyl(tx + rnd.uniform(-2.5, 2.5), tyy - rnd.uniform(2.8, 3.8), 0.18, 0.28, 0.36, CANV_B, 8, rx=0.5)

    # ------------------------------------------------------------ 货摊 + 瞭望塔
    mk = Batch('props_market')

    def stall(cx, cy, ang):
        ca, sa = math.cos(ang), math.sin(ang)

        def lp(dx, dy):
            return cx + dx * ca - dy * sa, cy + dx * sa + dy * ca
        # 摊台 + 四柱 + 斜面帆布棚
        px0, py0 = lp(-2.4, -1.2); px1, py1 = lp(2.4, -1.2); px2, py2 = lp(2.4, 1.2); px3, py3 = lp(-2.4, 1.2)
        mk.boxc(cx, cy, 0.85, 4.8 if abs(ca) > 0.7 else 2.4, 2.4 if abs(ca) > 0.7 else 4.8, 0.16, WOOD)
        for dx, dy in ((-2.2, -1.0), (2.2, -1.0), (2.2, 1.0), (-2.2, 1.0)):
            qx, qy = lp(dx, dy)
            mk.cyl(qx, qy, 0, 0.07, 2.6, WOOD_D, 6)
        hx0, hy0 = lp(-2.6, 1.2); hx1, hy1 = lp(2.6, 1.2)
        lx0, ly0 = lp(-2.6, -1.6); lx1, ly1 = lp(2.6, -1.6)
        mk.poly([(lx0, ly0, 2.5), (lx1, ly1, 2.5), (hx1, hy1, 1.9), (hx0, hy0, 1.9)], [(3, 2, 1, 0)], CANVS[rnd.randrange(3)])
        for i in range(4):                        # 摊台道具（条箱 / 罐）
            gx, gy = lp(-1.6 + i * 1.05, 0)
            if rnd.random() < 0.5:
                mk.boxc(gx, gy, 0.93, 0.6, 0.6, 0.5, WOOD_D)
            else:
                mk.cyl(gx, gy, 0.93, 0.22, 0.45, STONE, 8)

    stall(20, -14, 0.35)
    stall(-22, -18, -0.5)
    stall(-2, -30, 0.0)
    stall(14, -32, 0.25)
    # 瞭望木塔（两层 + 顶棚）
    TX, TY = 38.0, 6.0
    for dx in (-1.6, 1.6):
        for dy in (-1.6, 1.6):
            mk.strip([(TX + dx, TY + dy, 0), (TX + dx, TY + dy, 6.2)], 0.22, 0.22, WOOD_D)
    mk.boxc(TX, TY, 3.1, 4.4, 4.4, 0.18, WOOD)            # 二层地板
    for dx, dy in ((-2.0, -2.0), (2.0, -2.0), (2.0, 2.0), (-2.0, 2.0)):   # 二层围栏
        mk.strip([(TX + dx, TY + dy, 3.3), (TX + dx, TY + dy, 4.3)], 0.1, 0.1, WOOD_D)
    mk.strip([(TX - 2, TY - 2, 4.3), (TX + 2, TY - 2, 4.3), (TX + 2, TY + 2, 4.3), (TX - 2, TY + 2, 4.3), (TX - 2, TY - 2, 4.3)], 0.1, 0.35, WOOD_D)
    mk.pyramid(TX, TY, 6.2, 5.4, 5.4, 1.6, CANV_B)        # 顶棚
    mk.strip([(TX - 1.6, TY - 1.6, 0.2), (TX - 1.6, TY + 1.6, 2.9)], 0.06, 0.06, WOOD_D)   # 爬梯导轨
    mk.strip([(TX + 1.6, TY - 1.6, 0.2), (TX + 1.6, TY + 1.6, 2.9)], 0.06, 0.06, WOOD_D)
    for i in range(5):
        mk.boxc(TX, TY - 1.6 + i * 0.8, 0.3 + i * 0.55, 1.4, 0.3, 0.07, WOOD)

    # ------------------------------------------------------------ 生活痕迹
    cp = Batch('props_camp')

    def fire_ring(cx, cy):
        for i in range(9):
            a = math.tau * i / 9
            cp.cyl(cx + 1.1 * math.cos(a), cy + 1.1 * math.sin(a), 0, 0.22, rnd.uniform(0.25, 0.4), STONE, 7)
        cp.cyl(cx, cy, 0.02, 0.75, 0.08, ASH, 10)
        cp.strip([(cx - 0.1, cy - 0.1, 0.1), (cx + 0.5, cy + 0.3, 0.8)], 0.07, 0.07, WOOD_D)

    def tether_row(x0, y0, n, ang=0.0):
        for i in range(n):
            px = x0 + i * 3.0 * math.cos(ang); py = y0 + i * 3.0 * math.sin(ang)
            cp.cyl(px, py, 0, 0.09, 1.5, WOOD_D, 7)
            cp.strip([(px, py, 1.15), (px + 0.5, py, 1.15)], 0.05, 0.05, WOOD_D)

    fire_ring(-14, -8)
    fire_ring(18, -16)
    tether_row(-12, -36, 7, 0.0)
    for i in range(3):                                     # 条箱坐凳散放
        cp.boxc(-6 + i * 9 + rnd.uniform(-1, 1), -12 + rnd.uniform(-2, 2), 0, 0.9, 0.9, 0.5, WOOD)
    cp.boxc(6, -22, 0, 1.4, 0.5, 0.9, WOOD_D)              # 水桶架
    for dx in (0.35,):
        cp.cyl(6 + dx, -22, 0.9, 0.24, 0.4, WOOD_D, 8)

    # ------------------------------------------------------------ 场地
    gr = Batch('site_ground')
    gr.box(-60, 60, -50, 50, -0.3, 0, GRASS)
    gr.box(-50, 50, -44, 46, 0, 0.05, DIRT)                # 中央踩实泥地（草缘只留窄一圈）
    for wx in range(-40, 41, 7):                           # 车辙（两道深色细带）
        gr.boxc(wx + rnd.uniform(-1, 1), rnd.uniform(-30, 30), 0.05, 0.5, rnd.uniform(10, 18), 0.02, DIRT)

    # ------------------------------------------------------------ bg
    bg = Batch('bg_ground')
    bg.box(-700, 700, -700, 700, -1.6, -0.5, GROUND)
    sil = Batch('bg_shacks')
    for _ in range(20):
        sx = rnd.uniform(-280, 280)
        sy = rnd.uniform(140, 260) if rnd.random() < 0.5 else rnd.uniform(-280, -140)
        sil.boxc(sx, sy, -0.5, rnd.uniform(6, 14), rnd.uniform(5, 10), rnd.uniform(2.4, 4.2), BG_SHACK)
    forest = Batch('bg_trees')
    for i in range(9):
        C.tree(forest, -85 + i * 21 + rnd.uniform(-5, 5), 58 + rnd.uniform(-5, 8),
               rnd.uniform(9, 14), rnd.uniform(3.2, 5.0), 'oak', seed=500 + i)
    for i in range(3):
        C.tree(forest, rnd.uniform(-60, 60), -62 - rnd.uniform(0, 8), rnd.uniform(8, 12), rnd.uniform(3, 4.5), 'oak', seed=560 + i)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=44.0)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.1
    CAMS = {
        'c1': ((-88.0, -100.0, 68.0), (0.0, 8.0, 4.0), 30, 0.0),
        'c2': ((-16.0, -26.0, 5.0), (0.0, 14.0, 5.0), 32, 0.0),
        'under': ((-70.0, 10.0, 14.0), (10.0, 6.0, 4.0), 35, 0.0),
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
