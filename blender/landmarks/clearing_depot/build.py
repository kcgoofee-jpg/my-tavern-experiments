"""大骑士领·圣都 外环「清算转运站」（site_kavalierki）——只做外观。
卡原文（docs/landmarks/clearing_depot.md，卡 L89 + A31）：外环有「败者资产清算转运站」；
附加设定写它是铁路编组场。本模型：货运货棚 + 两条到发线与货车皮 + 门式起重机 + 围栏货场。
中立性：无人物、无文字 / 标志、无武器类细节（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/clearing_depot/manifest.json 的 budgets 里给三角形预算）：
  props_depot   货棚（砖墙铁皮顶 + 推拉门 + 高窗）+ 两层办公楼 + 外挂钢梯
  props_rail    两条到发线（木枕 + 钢轨）+ 两节棚车一节敞车 + 门式起重机
  props_yard    围栏 + 门架 + 托盘 / 条箱垛 + 油桶 + 两只货柜
  site_ground   碴石场院 + 货棚前混凝土硬化面
bg_*：西侧棚屋剪影、北缘树、大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  场站 130 × 90（围栏内 120 × 80）：货棚 (0, 24) 42 × 16 檐高 7；办公楼贴棚东端南侧；
  轨道 y = 4 / -6 沿 x 贯穿；门吊跨轨前广场 (±7, -14)；货堆散在南半场；正门在南栏 (0, -40)。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final clearing_depot）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/clearing_depot/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/clearing_depot.jpg [--blend /tmp/clearing_depot.blend] [--log /tmp/clearing_depot.log]
cam: c1 主视角（东南俯瞰全场）/ c2 货场看货棚立面与门吊 / under 西侧沿轨透视进棚
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/clearing_depot.jpg', blend='', log='', exposure=''))

WH = dict(x0=-21, x1=21, y0=16, y1=32)   # 货棚
TRACKS = (4.0, -6.0)                      # 两条到发线
FENCE = dict(x0=-60, x1=60, y0=-40, y1=40)


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(19)

    BRICK = C.pbr('cd_brick', 'dark_brick_wall', 2.6, tint=(0.52, 0.44, 0.4), sat=0.4, value=1.05, weather=0.7)
    SHEET = C.pbr('cd_sheet', 'box_profile_metal_sheet', 2.6, tint=(0.5, 0.45, 0.38), sat=0.35, value=1.05, metal=0.4, weather=0.95)
    RUST = C.pbr('cd_rust', 'box_profile_metal_sheet', 2.4, tint=(0.52, 0.27, 0.13), sat=0.75, value=1.1, metal=0.3, weather=1.0)
    RUST_B = C.pbr('cd_rust_b', 'box_profile_metal_sheet', 2.4, tint=(0.3, 0.38, 0.44), sat=0.4, value=1.05, metal=0.35, weather=0.95)
    METAL = C.pbr('cd_metal', 'Metal009', 2.2, tint=(0.45, 0.42, 0.4), sat=0.25, metal=0.8, weather=0.8)
    RAILM = C.pbr('cd_rail', 'Metal009', 1.6, tint=(0.62, 0.6, 0.58), sat=0.15, metal=0.9, rough_mul=0.7)
    WOOD = C.pbr('cd_wood', 'rough_wood', 2.2, tint=(0.5, 0.4, 0.29), sat=0.45, value=0.7)
    WOOD_D = C.pbr('cd_wood_d', 'dark_wood', 2.0, tint=(0.4, 0.33, 0.26), sat=0.3, value=0.9)
    CONC = C.pbr('cd_conc', 'concrete_wall_008', 4.0, tint=(0.5, 0.49, 0.47), sat=0.15, value=0.85, weather=0.6)
    GRAVEL = C.pbr('cd_gravel', 'dirt_floor', 6.0, tint=(0.36, 0.32, 0.26), sat=0.35, value=0.6)
    CANVAS = C.flat('cd_canvas', (0.32, 0.28, 0.22), 0.85, noise=0.4)
    WIN = C.flat('cd_win', (0.05, 0.05, 0.055), 0.35)
    GROUND = C.flat('cd_bg_ground', (0.19, 0.21, 0.15), 0.95, noise=0.5)
    BG_SHACK = C.flat('cd_bg_shack', (0.3, 0.28, 0.25), 0.9)

    # ------------------------------------------------------------ 货棚 + 办公楼
    dp = Batch('props_depot')
    x0, x1, y0, y1 = WH['x0'], WH['x1'], WH['y0'], WH['y1']
    HE = 7.0                                     # 檐高
    dp.box(x0, x1, y0, y1, 0, HE, BRICK)
    dp.gable(x0, x1, y0, y1, HE, 2.6, SHEET, over=0.6)
    # 南侧单坡披屋（进深 6，檐 4.5）
    dp.box(x0 + 2, x1 - 2, y0 - 6, y0, 0, 4.5, SHEET)
    dp.poly([(x0 + 2, y0 - 6 - 0.4, 4.5), (x1 - 2, y0 - 6 - 0.4, 4.5),
             (x1 - 2, y0, 5.4), (x0 + 2, y0, 5.4)], [(3, 2, 1, 0)], SHEET)   # 单坡顶
    for wx in (x0, x1):                          # 山墙推拉门（东西两端）
        for dx in (-2.2, 2.2):
            wall_y = y1 + 0.08 if wx == x1 else y0 - 0.08
            dp.boxc(wx + dx, wall_y, 0, 3.6, 0.14, 5.6, RUST_B)
    for i in range(6):                           # 侧墙高窗
        wx = x0 + 4 + i * 6.8
        dp.boxc(wx, y0 - 0.09, 4.6, 2.2, 0.12, 1.4, WIN)
    # 办公楼（贴东端南侧，两层）
    ox, oy = x1 + 6.5, y0 + 2
    dp.box(ox - 5, ox + 5, oy - 4, oy + 4, 0, 7.2, BRICK)
    dp.gable(ox - 5, ox + 5, oy - 4, oy + 4, 7.2, 1.6, RUST, over=0.35)
    for fz in (2.0, 5.0):                        # 窗带
        for wx in (-3, 0, 3):
            dp.boxc(ox + wx, oy - 4.09, fz, 1.6, 0.12, 1.2, WIN)
    dp.boxc(ox, oy + 4.09, 0, 1.2, 0.14, 2.6, WOOD_D)   # 门（朝北对货棚）
    # 外挂钢梯（西立面）
    for i in range(10):
        sz = 0.35 + i * 0.68
        dp.boxc(ox - 5.4, oy + 2.0 - i * 0.42, sz, 1.0, 0.35, 0.08, METAL)
    dp.strip([(ox - 5.4, oy - 2.0, 0.2), (ox - 5.4, oy + 2.0, 7.0)], 0.08, 0.08, METAL)   # 扶手斜梁
    dp.boxc(ox - 5.4, oy + 2.0, 7.0, 1.2, 1.2, 0.08, METAL)                                # 顶层平台

    # ------------------------------------------------------------ 铁路编组 + 门吊
    rl = Batch('props_rail')
    for ty in TRACKS:
        for sx in range(-66, 67, 2):             # 木枕
            rl.boxc(sx + rnd.uniform(-0.06, 0.06), ty, 0.06, 2.4, 0.26, 0.12, WOOD_D)
        for off in (-0.72, 0.72):                # 钢轨
            rl.strip([(-66, ty + off, 0.16), (66, ty + off, 0.16)], 0.11, 0.13, RAILM)

    def covered_wagon(cx, cy, m):
        rl.boxc(cx, cy, 1.1, 12.0, 2.9, 2.4, m)                       # 车体
        rl.gable(cx - 6, cx + 6, cy - 1.45, cy + 1.45, 3.5, 0.8, m, over=0.15)
        rl.boxc(cx, cy, 0.35, 11.6, 2.6, 0.75, WOOD_D)                # 底架 / 轮组遮蔽
        for wx in (-4.2, 4.2):
            rl.cyl(cx + wx, cy - 1.2, 0.15, 0.5, 0.2, METAL, 10)
            rl.cyl(cx + wx, cy + 1.2, 0.15, 0.5, 0.2, METAL, 10)

    def open_wagon(cx, cy):
        for sy0, sy1 in ((-1.4, -1.25), (1.25, 1.4)):
            rl.boxc(cx, (sy0 + sy1) / 2, 0.6, 11.0, sy1 - sy0, 1.5, RUST_B)
        for sx0, sx1 in ((-5.5, -5.35), (5.35, 5.5)):
            rl.boxc((sx0 + sx1) / 2, cy, 0.6, sx1 - sx0, 2.8, 1.5, RUST_B)
        rl.boxc(cx, cy, 0.3, 10.6, 2.4, 0.5, WOOD_D)
        for wx in (-3.8, 3.8):
            rl.cyl(cx + wx, cy - 1.0, 0.15, 0.45, 0.18, METAL, 10)
            rl.cyl(cx + wx, cy + 1.0, 0.15, 0.45, 0.18, METAL, 10)

    covered_wagon(-16, TRACKS[0], RUST)
    covered_wagon(-1, TRACKS[0], RUST_B)
    open_wagon(14, TRACKS[1])
    # 门式起重机（跨前广场，轨 y=-14，梁沿 x）
    GX, GY, GH = -2.0, -14.0, 9.0
    for lx in (GX - 7, GX + 7):
        for dy in (-1.1, 1.1):
            rl.strip([(lx, GY + dy, 0), (lx, GY + dy, GH)], 0.3, 0.3, METAL)
        rl.strip([(lx - 0.8, GY - 1.1, GH - 1.2), (lx, GY, GH), (lx + 0.8, GY + 1.1, GH - 1.2)], 0.22, 0.22, METAL)  # A 字斜撑
        rl.cyl(lx, GY - 1.1, 0, 0.35, 0.5, METAL, 10); rl.cyl(lx, GY + 1.1, 0, 0.35, 0.5, METAL, 10)
    rl.strip([(GX - 7.4, GY - 1.1, GH), (GX + 7.4, GY + 1.1, GH)], 0.55, 0.9, METAL)   # 主梁
    rl.boxc(GX + 2, GY, GH - 1.6, 1.4, 1.2, 1.1, RUST)                                  # 电动葫芦
    rl.strip([(GX + 2, GY, GH - 2.1), (GX + 2, GY, GH - 4.6)], 0.05, 0.05, METAL)       # 吊索
    rl.boxc(GX + 2, GY, GH - 5.0, 0.7, 0.4, 0.5, METAL)                                 # 吊钩座

    # ------------------------------------------------------------ 围栏 + 货场
    yd = Batch('props_yard')
    fx0, fx1, fy0, fy1 = FENCE['x0'], FENCE['x1'], FENCE['y0'], FENCE['y1']

    def fence_run(px0, py0, px1, py1):
        n = max(2, int(math.hypot(px1 - px0, py1 - py0) / 4))
        for i in range(n + 1):
            t = i / n
            yd.boxc(px0 + (px1 - px0) * t, py0 + (py1 - py0) * t, 0, 0.12, 0.12, 2.1, WOOD_D)
        yd.strip([(px0, py0, 1.5), (px1, py1, 1.5)], 0.04, 0.04, WOOD_D)
        yd.strip([(px0, py0, 0.8), (px1, py1, 0.8)], 0.04, 0.04, WOOD_D)

    fence_run(fx0, fy0, fx1, fy0)
    fence_run(fx0, fy1, fx1, fy1)
    # 东西栏在轨道穿越处留 14 m 缺口（y ∈ [-8, 6]），避免钢轨插穿围栏
    for fx in (fx0, fx1):
        fence_run(fx, fy1, fx, 6.0)
        fence_run(fx, -8.0, fx, fy0)
    # 正门门架（南栏中央）
    for gx in (-3.2, 3.2):
        yd.boxc(gx, fy0, 0, 0.16, 0.16, 3.2, METAL)
    yd.strip([(-3.2, fy0, 3.2), (3.2, fy0, 3.2)], 0.14, 0.2, METAL)
    # 货柜两只 + 东侧一层叠一只
    yd.boxc(-30, -22, 0, 6.2, 2.5, 2.6, RUST)
    yd.boxc(-22.5, -22, 0, 6.2, 2.5, 2.6, RUST_B)
    yd.boxc(46, 14, 0, 6.2, 2.5, 2.6, RUST)
    yd.boxc(46, 14, 2.6, 6.2, 2.5, 2.6, RUST_B)
    # 托盘 / 条箱垛 / 油桶
    spots = [(-44, -12), (-38, -20), (10, -24), (22, -30), (34, -12), (44, -22), (-48, -28), (28, 8), (-12, -30),
             (-14, 14), (36, 26), (-30, 2), (14, 12), (52, -6), (-52, 10), (20, -14), (-6, -26), (40, 2)]
    for (sx, sy) in spots:
        pick = rnd.random()
        if pick < 0.4:                            # 托盘垛
            for i in range(rnd.randrange(3, 6)):
                yd.boxc(sx + rnd.uniform(-0.3, 0.3), sy + rnd.uniform(-0.3, 0.3), i * 0.5,
                        rnd.uniform(1.6, 2.2), rnd.uniform(1.2, 1.6), 0.14, WOOD)
        elif pick < 0.75:                         # 条箱垛
            for i in range(rnd.randrange(2, 5)):
                s = rnd.uniform(0.9, 1.4)
                yd.boxc(sx + rnd.uniform(-0.8, 0.8), sy + rnd.uniform(-0.8, 0.8), i * 1.0, s, s, s, WOOD_D)
        else:                                     # 油桶排
            for i in range(rnd.randrange(3, 6)):
                yd.cyl(sx + i * 0.8, sy + rnd.uniform(-0.3, 0.3), 0, 0.34, 0.92, METAL, 10)
    # 防雨篷布盖条箱堆（布下有货，不再悬空）
    yd.boxc(-5.5, -16.5, 0, 4.6, 3.4, 1.4, WOOD_D)
    yd.boxc(-5.8, -16.2, 1.4, 3.6, 2.6, 0.9, WOOD)
    yd.poly([(-8.2, -18.4, 1.55), (-2.8, -18.6, 1.55), (-2.6, -14.2, 2.45), (-8.4, -14.0, 2.45)],
            [(3, 2, 1, 0)], CANVAS)

    # ------------------------------------------------------------ 场院
    gr = Batch('site_ground')
    gr.box(-70, 70, -48, 48, -0.3, 0, GRAVEL)
    gr.box(WH['x0'] - 8, WH['x1'] + 14, WH['y0'] - 10, WH['y1'] + 2, 0, 0.06, CONC)   # 棚周硬化面
    gr.box(-66, 66, TRACKS[0] - 2.4, TRACKS[0] + 2.4, 0, 0.03, GRAVEL)                # 轨道道砟带
    gr.box(-66, 66, TRACKS[1] - 2.4, TRACKS[1] + 2.4, 0, 0.03, GRAVEL)

    # ------------------------------------------------------------ bg
    bg = Batch('bg_ground')
    bg.box(-700, 700, -700, 700, -1.6, -0.5, GROUND)
    sil = Batch('bg_shacks')
    for _ in range(22):
        sx = rnd.uniform(-280, 280)
        sy = rnd.uniform(120, 260) if rnd.random() < 0.5 else rnd.uniform(-260, -120)
        sil.boxc(sx, sy, -0.5, rnd.uniform(6, 14), rnd.uniform(5, 10), rnd.uniform(2.4, 4.2), BG_SHACK)
    forest = Batch('bg_trees')
    for i in range(8):
        C.tree(forest, -70 + i * 20 + rnd.uniform(-5, 5), 52 + rnd.uniform(-4, 6),
               rnd.uniform(9, 13), rnd.uniform(3.2, 4.8), 'oak', seed=400 + i)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=44.0)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.1
    CAMS = {
        'c1': ((-95.0, -110.0, 75.0), (0.0, 5.0, 5.0), 30, 0.0),
        'c2': ((-38.0, -40.0, 6.0), (8.0, 16.0, 7.0), 32, 0.0),
        'under': ((-78.0, -1.0, 4.0), (30.0, 2.0, 5.0), 35, 0.0),
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
