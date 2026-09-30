"""血肉磨坊（tc_low）——只做外观。
卡原文（docs/landmarks/blood_mill.md，卡 L77 + L188）：血肉磨坊在下层，是一处黑拳场（拳手瑞秋·卡特的据点）。
本模型：旧磨坊改的黑拳场——砖厂房 + 山墙磨盘 + 熏黑烟囱 + 铁笼穹顶的半地下圆场 + 红灯入口与排队链栏 + 杂物后院。
中立性：无人物、无文字 / 标志、无血迹与武器类细节（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/blood_mill/manifest.json 的 budgets 里给三角形预算）：
  props_main   主厂房（砖墙铁皮顶 + 高窗 + 山墙大门与磨盘）+ 熏黑烟囱
  props_cage   拳笼圆场：半地下砖鼓座 + 铁条网格穹笼 + 四支泛光灯
  props_entry  入口：红灯 + 防水布雨棚 + 铁链排队栏杆
  props_yard   后院：铁丝网围栏 + 托盘 / 油桶 / 旧轮胎 / 货箱
  site_ground  碎石沥青场地 + 积水
bg_*：周边棚屋剪影与大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  场地 92 × 72：主厂房 x -8..30、y 4..26（檐高 8，脊沿 x）；烟囱在厂房北侧 (20, 30)；
  拳笼圆场圆心 (-27, 15) 半径 11.5；入口在东山墙 (30, 15)，排队区 x 30..46；
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final blood_mill）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/blood_mill/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/blood_mill.jpg [--blend /tmp/blood_mill.blend] [--log /tmp/blood_mill.log]
cam: c1 主视角（东南俯瞰全场）/ c2 侧视（东山墙、磨盘与入口红灯）/ under 西侧看拳笼穹顶与烟囱
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/blood_mill.jpg', blend='', log='', exposure='-0.3'))

HALL = dict(x0=-8.0, x1=30.0, y0=4.0, y1=26.0)   # 主厂房
HE = 8.0                                          # 檐高
CAGE = (-27.0, 15.0, 11.5)                        # 拳笼圆场：圆心 x, y, 半径
FENCE = dict(x0=-42.0, x1=46.0, y0=-24.0, y1=34.0)


def ring(cx, cy, z, r, n=32):
    return [(cx + r * math.cos(i * math.tau / n), cy + r * math.sin(i * math.tau / n), z) for i in range(n)]


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(31)

    BRICK = C.pbr('bm_brick', 'dark_brick_wall', 2.6, tint=(0.5, 0.36, 0.3), sat=0.45, value=0.95, weather=0.85)
    SOOT = C.pbr('bm_soot', 'dark_brick_wall', 2.4, tint=(0.2, 0.17, 0.16), sat=0.2, value=0.8, weather=1.0)
    SHEET = C.pbr('bm_sheet', 'box_profile_metal_sheet', 2.6, tint=(0.42, 0.34, 0.28), sat=0.4, value=1.0, metal=0.4, weather=1.0)
    RUST = C.pbr('bm_rust', 'box_profile_metal_sheet', 2.4, tint=(0.55, 0.25, 0.12), sat=0.8, value=1.05, metal=0.3, weather=1.0)
    STEEL = C.pbr('bm_steel', 'Metal009', 2.0, tint=(0.28, 0.29, 0.31), sat=0.15, metal=0.85, weather=0.8)
    IRON = C.flat('bm_iron', (0.05, 0.05, 0.055), 0.5, metal=0.7)
    CONC = C.pbr('bm_conc', 'concrete_wall_008', 4.0, tint=(0.45, 0.44, 0.42), sat=0.15, value=0.85, weather=0.7)
    WOOD = C.pbr('bm_wood', 'rough_wood', 2.2, tint=(0.46, 0.36, 0.26), sat=0.4, value=0.7)
    GRAVEL = C.pbr('bm_gravel', 'dirt_floor', 6.0, tint=(0.34, 0.3, 0.25), sat=0.3, value=0.6)
    ASPH = C.pbr('bm_asph', 'asphalt_02', 5.0, tint=(0.3, 0.3, 0.32), sat=0.1, value=0.7)
    RUBBER = C.pbr('bm_rubber', 'Rubber004', 1.2, tint=(0.12, 0.12, 0.12), sat=0.05)
    CANVAS = C.flat('bm_canvas', (0.26, 0.3, 0.26), 0.85, noise=0.45)
    PIT = C.flat('bm_pit', (0.02, 0.02, 0.025), 0.9)
    WIN = C.flat('bm_win', (0.04, 0.04, 0.05), 0.3)
    WINWARM = C.flat('bm_winwarm', (1, 1, 1), 0.4, emit=(1.0, 0.55, 0.22), estr=4.0)
    LAMPRED = C.flat('bm_lamp_red', (1, 1, 1), 0.4, emit=(1.0, 0.1, 0.06), estr=40.0)
    FLOOD = C.flat('bm_flood', (1, 1, 1), 0.4, emit=(1.0, 0.92, 0.75), estr=22.0)
    PUDDLE = C.flat('bm_puddle', (0.03, 0.035, 0.045), 0.06)
    GROUND = C.flat('bm_bg_ground', (0.16, 0.16, 0.15), 0.95, noise=0.5)
    BG_SHACK = C.flat('bm_bg_shack', (0.26, 0.22, 0.19), 0.9)

    x0, x1, y0, y1 = HALL['x0'], HALL['x1'], HALL['y0'], HALL['y1']
    ymid = (y0 + y1) / 2

    # ------------------------------------------------------------ 主厂房（旧磨坊）
    mn = Batch('props_main')
    mn.box(x0, x1, y0, y1, 0, HE, BRICK)
    mn.gable(x0, x1, y0, y1, HE, 3.2, SHEET, over=0.7)
    for k in range(6):                                            # 南墙壁柱 + 高窗
        px = x0 + 3.0 + k * 6.0
        mn.boxc(px, y0 - 0.16, 0, 0.9, 0.34, HE, CONC)
        mn.boxc(px + 3.0, y0 - 0.1, 4.9, 2.0, 0.16, 1.5, WIN if k % 2 else WINWARM)
    for k in range(6):                                            # 北墙高窗
        mn.boxc(x0 + 6.0 + k * 6.0, y1 + 0.1, 4.9, 2.0, 0.16, 1.5, WIN)
    # 东山墙：大铁门 + 高窗 + 磨盘（锈蚀齿轮，纯几何）
    mn.boxc(x1 + 0.1, ymid, 0, 0.3, 6.6, 6.2, CONC)                # 门框
    mn.boxc(x1 + 0.22, ymid, 0, 0.16, 5.6, 5.6, RUST)              # 铁门
    for dy in (-3.6, 3.6): mn.boxc(x1 + 0.12, ymid + dy, 4.6, 0.16, 1.4, 1.6, WIN)
    gx, gy, gz, gr = x1 + 0.4, ymid, 8.2, 2.7
    gear = [(gx, gy + gr * math.cos(i * math.tau / 40), gz + gr * math.sin(i * math.tau / 40)) for i in range(40)]
    mn.tube(gear, 0.28, STEEL, 8, closed=True)
    inner = [(gx, gy + gr * .45 * math.cos(i * math.tau / 24), gz + gr * .45 * math.sin(i * math.tau / 24)) for i in range(24)]
    mn.tube(inner, 0.22, STEEL, 6, closed=True)
    for k in range(10):                                            # 辐条 + 齿
        a = k * math.tau / 10
        mn.tube([(gx, gy, gz), (gx, gy + gr * math.cos(a), gz + gr * math.sin(a))], 0.14, STEEL, 6)
    for k in range(20):
        a = k * math.tau / 20
        mn.boxc(gx, gy + (gr + 0.3) * math.cos(a), gz + (gr + 0.3) * math.sin(a) - 0.22, 0.4, 0.5, 0.44, RUST)
    mn.cyl(gx + 0.02, gy, gz, 0.45, 0.001, STEEL, 12)              # 轮毂占位（无字）
    for k in range(4):                                             # 屋脊通风帽
        mn.boxc(x0 + 5 + k * 8.0, ymid, HE + 3.1, 2.2, 1.8, 1.0, SHEET)
    # 熏黑烟囱（厂房北侧）
    ch = (20.0, y1 + 3.5)
    mn.cyl(ch[0], ch[1], 0, 2.4, 27.0, SOOT, 20, r2=1.5)
    mn.cyl(ch[0], ch[1], 26.6, 1.8, 0.7, CONC, 20, r2=1.7)
    for zz in (8.0, 17.0): mn.cyl(ch[0], ch[1], zz, 2.05 - zz * 0.02, 0.3, STEEL, 20)
    mn.boxc(ch[0] - 1.0, y1 + 0.6, 0, 3.0, 4.0, 6.0, BRICK)        # 烟囱基座 / 锅炉间

    # ------------------------------------------------------------ 拳笼圆场（半地下）
    cg = Batch('props_cage')
    cx, cy, cr = CAGE
    cg.cyl(cx, cy, 0, cr, 4.8, BRICK, 48)
    cg.cyl(cx, cy, 4.8, cr + 0.35, 0.6, CONC, 48)
    for k in range(20):                                            # 鼓座上的气窗
        a = k * math.tau / 20
        cg.cyl(cx + (cr + 0.05) * math.cos(a), cy + (cr + 0.05) * math.sin(a), 2.6, 0.32, 1.3, WINWARM if k % 5 == 0 else WIN, 6)
    nrib = 16
    for k in range(nrib):                                          # 穹笼：经线肋
        a = k * math.tau / nrib
        pts = [(cx + (cr - 0.6) * math.cos(a) * math.cos(t), cy + (cr - 0.6) * math.sin(a) * math.cos(t), 5.4 + 7.6 * math.sin(t))
               for t in [j * (math.pi / 2 * 0.985) / 9 for j in range(10)]]
        cg.tube(pts, 0.17, IRON, 6)
    for t in (0.4, 0.8, 1.15):                                     # 纬线箍
        rr = (cr - 0.6) * math.cos(t)
        cg.tube(ring(cx, cy, 5.4 + 7.6 * math.sin(t), rr, 36), 0.15, IRON, 6, closed=True)
    cg.cyl(cx, cy, 13.0, 0.9, 0.5, STEEL, 12)
    cg.cyl(cx, cy, 4.6, cr - 0.2, 0.3, PIT, 48)                    # 笼内暗底：从铁条间只看到一片黑，不透出天空
    cg.cyl(cx, cy, 4.9, 4.2, 0.12, CONC, 32)                       # 场心圆台（看得见的只有一圈灰边）
    for k in range(4):                                             # 四支泛光灯柱
        a = math.pi / 4 + k * math.pi / 2
        px, py = cx + (cr + 1.8) * math.cos(a), cy + (cr + 1.8) * math.sin(a)
        cg.cyl(px, py, 0, 0.22, 14.0, STEEL, 8)
        cg.boxc(px, py, 14.0, 1.8, 1.8, 0.7, FLOOD)
    cg.boxc(cx + cr + 0.5, cy, 0, 1.4, 4.2, 3.6, RUST)             # 圆场东侧的通道门（与厂房相连处）
    cg.boxc((cx + cr + x0) / 2, cy, 0, (x0 - cx - cr), 5.0, 4.0, BRICK)   # 连廊

    # ------------------------------------------------------------ 入口：红灯 + 雨棚 + 链栏
    en = Batch('props_entry')
    doorx = x1
    en.cyl(doorx + 1.2, ymid - 3.2, 5.8, 0.06, 0.6, IRON, 6)
    en.sphere(doorx + 1.3, ymid - 3.2, 5.9, 0.42, LAMPRED, sz=1.0, seg=14, rings=8)
    ax = doorx + 6.0
    verts = [(doorx, ymid - 5.5, 6.3), (doorx, ymid + 5.5, 6.3), (ax, ymid + 5.5, 4.4), (ax, ymid - 5.5, 4.4)]
    en.poly(verts, [(0, 1, 2, 3), (3, 2, 1, 0)], CANVAS)
    for dy in (-5.5, 5.5): en.cyl(ax, ymid + dy, 0, 0.12, 4.4, STEEL, 6)
    lane_y = (ymid - 5.5, ymid + 5.5)
    for ly in lane_y:                                              # 排队链栏（两侧各一列）
        xs = [doorx + 8.0 + i * 3.0 for i in range(6)]
        for xp in xs: en.cyl(xp, ly, 0, 0.1, 1.0, STEEL, 6); en.sphere(xp, ly, 1.05, 0.14, STEEL, seg=8, rings=5)
        for xa, xb in zip(xs, xs[1:]):
            en.tube([(xa, ly, 0.92), ((xa + xb) / 2, ly, 0.72), (xb, ly, 0.92)], 0.03, STEEL, 4)

    # ------------------------------------------------------------ 后院：围栏 + 杂物
    yd = Batch('props_yard')
    fx0, fx1, fy0, fy1 = FENCE['x0'], FENCE['x1'], FENCE['y0'], FENCE['y1']
    edges = [((fx0, fy0), (fx1, fy0)), ((fx1, fy0), (fx1, fy1)), ((fx1, fy1), (fx0, fy1)), ((fx0, fy1), (fx0, fy0))]
    for (a, b) in edges:
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = int(L // 6)
        for i in range(n + 1):
            t = i / n; px, py = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            if a[1] == fy0 and b[1] == fy0 and 8 < px < 20: continue          # 南栏缺口
            yd.cyl(px, py, 0, 0.11, 2.6, STEEL, 6)
        for zz in (0.5, 1.3, 2.4):
            if a[1] == fy0 and b[1] == fy0:
                yd.tube([(fx0, fy0, zz), (8, fy0, zz)], 0.04, STEEL, 4); yd.tube([(20, fy0, zz), (fx1, fy0, zz)], 0.04, STEEL, 4)
            else:
                yd.tube([(a[0], a[1], zz), (b[0], b[1], zz)], 0.04, STEEL, 4)
    for i in range(9):                                             # 托盘垛
        px, py = rnd.uniform(-38, 8), rnd.uniform(-20, 0)
        for j in range(rnd.randint(2, 4)): yd.boxc(px, py, j * 0.15, 1.2, 1.0, 0.15, WOOD)
    for i in range(18):                                            # 油桶
        px, py = rnd.uniform(-40, 44), rnd.uniform(-22, 2)
        yd.cyl(px, py, 0, 0.46, 0.95, RUST if i % 3 else STEEL, 12)
    for k in range(9):                                             # 旧轮胎垛
        px, py = -14 + (k % 5) * 1.6 + (k // 5) * 14, -16.0 + (k % 2) * 0.8
        for j in range(4): yd.cyl(px, py, j * 0.32, 0.5, 0.3, RUBBER, 14)
    for i in range(9):                                             # 货箱
        yd.boxc(rnd.uniform(-38, 42), rnd.uniform(-20, -2), 0, rnd.uniform(1.2, 2.4), rnd.uniform(1.2, 2.0), rnd.uniform(1.0, 1.6), WOOD)
    for k in range(3):                                             # 场边灯杆
        px = -30 + k * 30.0
        yd.cyl(px, -21, 0, 0.14, 6.0, STEEL, 6); yd.boxc(px, -21, 6.0, 1.0, 0.6, 0.3, FLOOD)

    # ------------------------------------------------------------ 场地
    gr = Batch('site_ground')
    gr.box(fx0 - 2, fx1 + 2, fy0 - 2, fy1 + 2, -0.3, 0, GRAVEL)
    gr.box(x1 + 0.3, fx1, ymid - 8, ymid + 8, 0, 0.04, ASPH)              # 入口前沥青带
    gr.box(fx0 + 6, x1 - 4, fy0 + 3, -2, 0, 0.04, ASPH)                    # 南院沥青（不铺满，边上留碎石）
    for (px, py, rx, ry) in ((36, ymid + 1, 2.0, 1.2), (-6, -12, 2.4, 1.4), (14, -18, 1.8, 1.0), (-30, -8, 1.6, 1.0), (24, -6, 1.4, 0.9)):
        gr.boxc(px, py, 0.05, rx * 2, ry * 2, 0.01, PUDDLE)

    # ------------------------------------------------------------ 背景：下层棚屋剪影 + 大地
    bg = Batch('bg_ground'); bg.box(-900, 900, -900, 900, -1.5, -0.5, GROUND)
    bs = Batch('bg_shacks')
    for i in range(70):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(62, 320)
        px, py = math.cos(a) * d * 1.3, math.sin(a) * d
        if abs(px) < 52 and abs(py) < 42: continue
        w, dd = rnd.uniform(6, 16), rnd.uniform(6, 14)
        h = rnd.uniform(3.0, 6.5)
        bs.box(px - w / 2, px + w / 2, py - dd / 2, py + dd / 2, 0, h, BG_SHACK)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=40.0, sun_e=3.6, sky_s=0.5)
    C.point_light('pt_red', (doorx + 1.4, ymid - 3.2, 5.9), 3.0e3, (1.0, 0.15, 0.08), 0.4)
    for i, (a) in enumerate((math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4)):
        C.point_light('pt_fl%d' % i, (cx + (cr + 1.8) * math.cos(a), cy + (cr + 1.8) * math.sin(a), 13.4), 4.0e3, (1.0, 0.9, 0.7), 0.5)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0
    CAMS = {
        'c1': ((78.0, -82.0, 52.0), (2.0, 12.0, 6.0), 30, 0.0),
        'c2': ((66.0, -6.0, 9.0), (30.0, 14.0, 7.0), 32, 0.0),
        'under': ((-72.0, 58.0, 16.0), (-14.0, 18.0, 8.0), 28, 0.0),
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
