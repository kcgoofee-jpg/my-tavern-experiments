"""监狱（下层，高围墙内的国家机构建筑群）——只做远景、中立的外观。
卡面只一笔带过（某角色的弟弟被送进去），无位置描述；地图把它放在垂直天空城下层一处围墙院落（仓库推断）。
只画粗野主义混凝土公共建筑：素面高围墙（顶上一道普通钢丝）、四角瞭望亭（只有灯的小岗亭，无武器）、
主入口楼 + 访客前庭（长椅、候车亭式雨棚）、行政楼、几栋长条的封闭混凝土体量（竖向窄窗缝）、
后勤场院（厢式货车）、投光灯杆、温室 / 工坊大厅、一块朴素运动场、围墙外一圈亮着的整洁环路。
中立：无内部、无牢房、无铁栏特写、无铁丝网堆叠、无锁链 / 笼子、无人物、无文字 / 标志 / 徽章、无武器。

布局（米）：院落中心 (0, 0)；围墙 x -80..80、y -60..60，高 7 m；入口楼骑在南墙中段 x -16..16、y -70..-50；
  访客前庭 y -70..-86（墙外）；行政楼 x -62..-30、y -46..-26；长条楼 ×4 x -20..70、y -18..52；
  后勤场院 x 34..76、y -56..-28；温室 / 工坊 x -74..-40、y -14..8；运动场 x -72..-32、y 18..54；
  环路 16 m 宽围一圈；再往外是铁皮屋 / 支撑柱 / 中层底面（bg_*，只渲染不导出）。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/prison/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/pr.jpg [--blend /tmp/pr.blend] [--log /tmp/pr.log] [--exposure 0.6]
cam: c1 俯瞰全貌 / c2 入口访客前庭 / c3 沿墙环路与瞭望亭
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='night', res='900', samples='24', out='/tmp/pr.jpg', blend='', log='', exposure=''))

WX, WY, WH = 80.0, 60.0, 7.0
RING = 16.0
UZ = 160.0


def main():
    import bpy
    from mathutils import Matrix, Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(23)

    # ------------------------------------------------------------ 材质
    CONC = C.pbr('pr_conc', 'concrete_wall_008', 4.0, tint=(0.66, 0.67, 0.68), sat=0.0, value=1.0, weather=0.9)
    CONC_D = C.pbr('pr_conc_dark', 'concrete_wall_008', 5.0, tint=(0.4, 0.41, 0.43), sat=0.0, weather=0.8)
    CONC_B = C.pbr('pr_conc_block', 'concrete_wall_008', 3.0, tint=(0.56, 0.55, 0.53), sat=0.1, value=0.95, weather=1.0)
    PANEL = C.pbr('pr_panel', 'smooth_concrete_floor', 3.0, tint=(0.7, 0.7, 0.7), sat=0.2)
    YARD = C.pbr('pr_yard', 'hangar_concrete_floor', 6.0, tint=(0.55, 0.55, 0.55), sat=0.3, value=0.85, weather=0.4)
    ASPH = C.pbr('pr_asphalt', 'asphalt_02', 4.0, tint=(0.42, 0.42, 0.44), sat=0.3, value=0.75)
    DIRT = C.pbr('pr_dirt', 'concrete_floor_worn_001', 5.0, tint=(0.3, 0.28, 0.25), sat=0.3, value=0.5, weather=1.0)
    STEEL = C.pbr('pr_steel', 'Metal009', 2.0, tint=(0.4, 0.41, 0.43), sat=0.3, metal=0.85, rough_mul=1.1)
    PAINT = C.pbr('pr_paint', 'Metal009', 2.0, tint=(0.3, 0.32, 0.34), sat=0.1, metal=0.3, rough_mul=1.3)
    SHEET = C.pbr('pr_sheet', 'box_profile_metal_sheet', 2.5, tint=(0.6, 0.63, 0.66), sat=0.0, metal=0.6, weather=0.5)
    SHEET_R = C.pbr('pr_sheet_rust', 'box_profile_metal_sheet', 2.5, tint=(0.52, 0.34, 0.22), sat=0.6, metal=0.3, weather=1.0)
    RUST = C.flat('pr_rust', (0.24, 0.12, 0.06), 0.8, metal=0.3, noise=0.5)
    RUBBER = C.pbr('pr_rubber', 'Rubber004', 1.0, tint=(0.25, 0.25, 0.25), sat=0.2)
    WHITEP = C.flat('pr_line_w', (0.7, 0.7, 0.68), 0.6, noise=0.3)
    LANE = C.flat('pr_line_y', (0.7, 0.55, 0.12), 0.6, noise=0.3)
    VAN = C.flat('pr_van', (0.62, 0.64, 0.66), 0.35, metal=0.4, noise=0.12, coat=0.4)
    GLASS = C.glass('pr_glass', (0.05, 0.065, 0.08), 0.05)
    GLASSL = C.glass('pr_glass_lit', (0.06, 0.07, 0.08), 0.1, emit=(1.0, 0.85, 0.62), estr=1.8)
    GREENG = C.glass('pr_green_glass', (0.08, 0.1, 0.08), 0.25, emit=(0.85, 1.0, 0.8), estr=0.6)
    SLOT = C.flat('pr_slot', (0.02, 0.022, 0.025), 0.3, metal=0.2)
    SLOTL = C.flat('pr_slot_lit', (1, 0.82, 0.55), 0.3, emit=(1.0, 0.78, 0.5), estr=4.0)
    DARK = C.flat('pr_dark', (0.015, 0.015, 0.016), 0.8)
    CABLE = C.flat('pr_cable', (0.03, 0.03, 0.032), 0.5, metal=0.5)
    COLDL = C.flat('pr_coldlight', (0.85, 0.92, 1), 0.3, emit=(0.85, 0.93, 1.0), estr=40.0)
    SODL = C.flat('pr_sodium', (1, 0.6, 0.2), 0.3, emit=(1.0, 0.55, 0.18), estr=30.0)
    WARML = C.flat('pr_warm', (1, 0.8, 0.5), 0.3, emit=(1.0, 0.72, 0.42), estr=6.0)
    RED = C.flat('pr_sig_red', (1, 0.1, 0.05), 0.3, emit=(1.0, 0.06, 0.03), estr=25.0)
    GRIME = C.flat('pr_grime', (0.07, 0.07, 0.068), 0.8, noise=0.7)
    DAMP = C.flat('pr_damp', (0.1, 0.1, 0.1), 0.35, noise=0.5, coat=0.3)
    OIL = C.flat('pr_oil', (0.09, 0.085, 0.08), 0.45, noise=0.6, coat=0.25)
    PATCH = C.pbr('pr_patch', 'asphalt_02', 3.0, tint=(0.28, 0.28, 0.3), sat=0.2, value=0.6)
    RIM = C.flat('pr_rim', (0.5, 0.52, 0.55), 0.3, metal=0.9)
    TURF = C.flat('pr_turf', (0.12, 0.16, 0.1), 0.9, noise=0.5)
    TRACK = C.flat('pr_track', (0.28, 0.14, 0.1), 0.85, noise=0.35)
    WOOD = C.flat('pr_bench_wood', (0.3, 0.2, 0.12), 0.7, noise=0.4)
    SOIL = C.flat('pr_soil', (0.12, 0.09, 0.06), 0.95, noise=0.6)
    WIN = C.window_grid('pr_admin_win', wall=(0.07, 0.075, 0.08), lit=(0.9, 0.95, 1.0), estr=1.6, cell=(2.4, 3.6), seed=2.1)
    SHACKW = C.glass('pr_shackwin', (0.05, 0.04, 0.03), 0.2, emit=(1.0, 0.62, 0.3), estr=2.0)
    CBOX = [C.pbr('pr_cont_%d' % i, 'box_profile_metal_sheet', 2.4, tint=t, sat=0.8, metal=0.4, weather=0.5)
            for i, t in enumerate(((0.36, 0.42, 0.44), (0.5, 0.3, 0.16), (0.3, 0.36, 0.28)))]

    def rbox(B, x, y, z, sx, sy, sz, m, rz=0.0, rx=0.0, ry=0.0):
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y')
        B.box(-sx / 2, sx / 2, -sy / 2, sy / 2, -sz / 2, sz / 2, m, M)

    def disc(B, x, y, z, r, m, axis='x', n=14, t=0.3):
        R = Matrix.Rotation(math.pi / 2, 4, 'X') if axis == 'y' else Matrix.Rotation(math.pi / 2, 4, 'Y')
        B.cyl(0, 0, -t / 2, r, t, m, n, smooth=False, mat=Matrix.Translation((x, y, z)) @ R)

    spots, points = [], []
    OX, OY = WX + RING, WY + RING

    # ============================================================ 地面
    G = Batch('site_ground')
    G.box(-WX, WX, -WY, WY, -0.2, 0.0, YARD)
    for (x0, x1, y0, y1) in ((-OX, OX, -OY, -WY), (-OX, OX, WY, OY), (-OX, -WX, -WY, WY), (WX, OX, -WY, WY)):
        G.box(x0, x1, y0, y1, -0.25, -0.05, ASPH)
    for (x0, x1, y0, y1) in ((-OX, OX, -OY - 4.5, -OY), (-OX, OX, OY, OY + 4.5), (-OX - 4.5, -OX, -OY - 4.5, OY + 4.5), (OX, OX + 4.5, -OY - 4.5, OY + 4.5)):
        G.box(x0, x1, y0, y1, -0.25, 0.1, PANEL)
    for (x0, x1, y0, y1) in ((-OX, OX, -OY - 0.25, -OY), (-OX, OX, OY, OY + 0.25), (-OX - 0.25, -OX, -OY, OY), (OX, OX + 0.25, -OY, OY)):
        G.box(x0, x1, y0, y1, -0.25, 0.18, CONC)
    # 墙根 3 m 宽的素土 / 碎石隔离带（外侧）
    for (x0, x1, y0, y1) in ((-WX - 3, WX + 3, -WY - 3, -WY), (-WX - 3, WX + 3, WY, WY + 3), (-WX - 3, -WX, -WY, WY), (WX, WX + 3, -WY, WY)):
        G.box(x0, x1, y0, y1, -0.05, -0.02, DIRT)
    for x in range(int(-OX) + 2, int(OX) - 2, 6):
        for yy in (-WY - RING / 2 - 1.5, WY + RING / 2 + 1.5):
            G.box(x, x + 3, yy - 0.08, yy + 0.08, -0.05, -0.04, WHITEP)
    for y in range(int(-OY) + 2, int(OY) - 2, 6):
        for xs in (-1, 1):
            xx = xs * (WX + RING / 2 + 1.5)
            G.box(xx - 0.08, xx + 0.08, y, y + 3, -0.05, -0.04, WHITEP)
    for i in range(28):
        side = rnd.choice(((-OX, OX, -OY, -WY - 4), (-OX, OX, WY + 4, OY), (-OX, -WX - 4, -WY, WY), (WX + 4, OX, -WY, WY)))
        x, y = rnd.uniform(side[0], side[1] - 3), rnd.uniform(side[2], side[3] - 2)
        G.box(x, x + rnd.uniform(1.5, 4), y, y + rnd.uniform(1, 2.5), -0.05, -0.045, PATCH)
    # 院内道路（环院车道 + 场院）
    for (x0, x1, y0, y1) in ((-76, 76, -24, -20), (-24, -20, -50, 56), (74 - 4, 74, -50, 56), (28, 78, -58, -26)):
        G.box(x0, x1, y0, y1, 0.0, 0.015, ASPH)
    for i in range(20):
        x, y = rnd.uniform(32, 74), rnd.uniform(-54, -30)
        G.box(x, x + rnd.uniform(0.6, 2.0), y, y + rnd.uniform(0.5, 1.4), 0.015, 0.02, OIL)

    # ============================================================ 围墙（props_wall）：素面预制板 + 顶部一道普通钢丝
    Wl = Batch('props_wall')
    def wall_run(x0, y0, x1, y1, gaps=()):
        ax = abs(x1 - x0) > abs(y1 - y0)
        L0, L1 = (x0, x1) if ax else (y0, y1)
        t = L0
        so = (-1 if y0 < 0 else 1) if ax else (-1 if x0 < 0 else 1)
        while t < L1 - 0.01:
            t2 = min(t + 5.0, L1)
            if any(g0 < (t + t2) / 2 < g1 for g0, g1 in gaps):
                t = t2; continue
            def bx(a0, a1, n0, n1, z0, z1, m):
                c = y0 if ax else x0
                if ax: Wl.box(a0, a1, c + n0, c + n1, z0, z1, m)
                else: Wl.box(c + n0, c + n1, a0, a1, z0, z1, m)
            bx(t, t2, -0.3, 0.3, 0, WH, CONC)
            bx(t - 0.06, t + 0.06, -0.31, 0.31, 0.2, WH, DARK)                           # 板缝
            bx(t, t2, -0.45, 0.45, WH, WH + 0.25, PANEL)                                  # 压顶
            bx(t, t2, -0.4, 0.4, 0, 0.6, CONC_D)                                          # 勒脚
            bx(t, t2, so * 0.301 - 0.005, so * 0.31, 0.6, 0.6 + rnd.uniform(0.3, 1.2), DAMP)
            for k in range(2):
                a = rnd.uniform(t, t2 - 0.2)
                bx(a, a + rnd.uniform(0.1, 0.3), so * 0.301 - 0.005, so * 0.31, rnd.uniform(3, 5.5), WH, GRIME)
            # 钢丝支架（每 5 m 一根向外斜的短杆）+ 一道钢丝
            c = y0 if ax else x0
            p0 = (t, c, WH + 0.25) if ax else (c, t, WH + 0.25)
            p1 = (t, c + so * 0.45, WH + 1.1) if ax else (c + so * 0.45, t, WH + 1.1)
            Wl.tube([p0, p1], 0.04, PAINT, n=5)
            if (int(t) // 5) % 3 == 0:                                                        # 外侧墙灯
                m_ = (t + t2) / 2
                bx(m_ - 0.35, m_ + 0.35, so * 0.3, so * 0.6, WH - 1.0, WH - 0.7, PAINT)
                bx(m_ - 0.3, m_ + 0.3, so * 0.35, so * 0.61, WH - 1.05, WH - 0.98, COLDL)
                points.append((((m_, c + so * 1.2, WH - 1.4) if ax else (c + so * 1.2, m_, WH - 1.4)), 140, (0.85, 0.92, 1.0)))
            t = t2
        # 连续钢丝
        a0, a1 = (x0, x1) if ax else (y0, y1)
        segs, cur = [], a0
        for g0, g1 in sorted(gaps):
            segs.append((cur, g0)); cur = g1
        segs.append((cur, a1))
        for s0, s1 in segs:
            c = (y0 if ax else x0) + so * 0.45
            Wl.tube([((s0, c, WH + 1.08) if ax else (c, s0, WH + 1.08)), ((s1, c, WH + 1.08) if ax else (c, s1, WH + 1.08))], 0.02, CABLE, n=4)
    EG0, EG1 = -16.0, 16.0          # 入口楼占南墙
    SG0, SG1 = 50.0, 62.0           # 南墙东段车辆门（后勤）
    wall_run(-WX, -WY, WX, -WY, gaps=((EG0, EG1), (SG0, SG1)))
    wall_run(-WX, WY, WX, WY)
    wall_run(-WX, -WY, -WX, WY)
    wall_run(WX, -WY, WX, WY)
    # 车辆门：两根门柱 + 关着的实心钢门扇
    for x in (SG0, SG1):
        Wl.boxc(x, -WY, 0, 1.4, 1.4, WH + 1.2, CONC_D)
    Wl.box(SG0 + 0.7, SG1 - 0.7, -WY - 0.12, -WY + 0.12, 0.1, WH - 0.8, SHEET)
    Wl.box(SG0 + 0.7, SG1 - 0.7, -WY - 0.2, -WY - 0.12, WH - 1.0, WH - 0.8, PAINT)
    Wl.box((SG0 + SG1) / 2 - 0.04, (SG0 + SG1) / 2 + 0.04, -WY - 0.16, -WY - 0.12, 0.1, WH - 0.8, DARK)
    spots.append((((SG0 + SG1) / 2, -WY - 5, WH + 1.0), ((SG0 + SG1) / 2, -WY - 8, 0), 3000, (0.85, 0.92, 1.0), 90))
    for x in range(int(SG0), int(SG1) + 1, 2):                                            # 减速带
        Wl.box(x + 0.05, x + 0.95, -WY - 6, -WY - 5.5, 0, 0.07, LANE if (x // 2) % 2 else RUBBER)

    # ============================================================ 瞭望亭（props_towers）：混凝土筒身 + 封闭小岗亭 + 灯
    To = Batch('props_towers')
    def tower(x, y, h=15.0):
        To.boxc(x, y, 0, 3.4, 3.4, 0.6, CONC_D)
        To.boxc(x, y, 0.6, 2.6, 2.6, h - 0.6, CONC)
        for z in range(3, int(h), 3):
            To.boxc(x, y, z, 2.64, 2.64, 0.06, DARK)                                       # 施工缝
        To.boxc(x, y, h, 4.4, 4.4, 0.35, PANEL)                                           # 托板
        To.boxc(x, y, h + 0.35, 3.8, 3.8, 1.0, CONC)                                      # 下槛墙
        To.boxc(x, y, h + 1.35, 3.84, 3.84, 1.3, GLASSL)                                  # 连续窗带（亮着）
        for (dx, dy) in ((-1.9, -1.9), (1.9, -1.9), (-1.9, 1.9), (1.9, 1.9)):
            To.boxc(x + dx * 0.98, y + dy * 0.98, h + 1.35, 0.18, 0.18, 1.3, PAINT)
        To.boxc(x, y, h + 2.65, 5.0, 5.0, 0.4, PAINT)                                     # 挑檐屋顶
        To.boxc(x, y, h + 3.05, 1.2, 1.2, 0.5, SHEET)
        To.boxc(x, y, h + 2.6, 4.9, 4.9, 0.05, COLDL)                                     # 檐下灯带
        To.cyl(x, y, h + 3.55, 0.05, 2.5, STEEL, 6)
        To.boxc(x, y, h + 6.05, 0.14, 0.14, 0.14, RED)
        for s in (-1, 1):                                                                 # 外侧爬梯笼（无）→ 简单检修门
            To.boxc(x + s * 1.31, y, 0.6, 0.02, 1.0, 2.2, PAINT) if s < 0 else None
        points.append(((x, y, h + 2.0), 120, (1.0, 0.85, 0.62)))
        c = Vector((0, 0, 0)); d = (Vector((x, y, 0)) - c).normalized()
        spots.append(((x, y, h + 2.4), (x + d.x * 18, y + d.y * 18, 0), 12000, (0.86, 0.93, 1.0), 75))
        spots.append(((x, y, h + 2.4), (x - d.x * 20, y - d.y * 20, 0), 6000, (0.86, 0.93, 1.0), 70))
    for (x, y) in ((-WX, -WY), (WX, -WY), (-WX, WY), (WX, WY), (0, WY)):
        tower(x, y)

    # ============================================================ 投光灯杆 + 环路路灯（props_lights）
    Li = Batch('props_lights')
    def mast(x, y, h, tgts):
        Li.cyl(x, y, 0, 0.35, h, PAINT, 12, r2=0.18)
        Li.boxc(x, y, 0, 1.1, 1.1, 0.4, CONC)
        Li.box(x - 1.6, x + 1.6, y - 0.1, y + 0.1, h - 0.1, h + 0.1, STEEL)
        for dx in (-1.3, -0.45, 0.45, 1.3):
            rbox(Li, x + dx, y, h + 0.4, 0.7, 0.5, 0.7, DARK, rx=0.5)
            rbox(Li, x + dx, y - 0.2, h + 0.25, 0.6, 0.05, 0.55, COLDL, rx=0.5)
        Li.boxc(x, y, h + 0.9, 0.14, 0.14, 0.14, RED)
        for t in tgts:
            spots.append(((x, y, h + 0.2), t, 70000, (0.86, 0.93, 1.0), 70))
    mast(-4, -30, 24, [(20, -20, 0), (-20, -10, 0)])
    mast(30, 56, 24, [(30, 30, 0), (0, 40, 0)])
    mast(56, -40, 22, [(56, -40, 0)])
    mast(-52, 14, 22, [(-52, 36, 0), (-56, -4, 0)])
    def street_lamp(x, y, ax, ay):
        Li.cyl(x, y, 0.1, 0.1, 7.5, PAINT, 8)
        Li.box(min(x, x + ax * 1.6) - 0.05, max(x, x + ax * 1.6) + 0.05, min(y, y + ay * 1.6) - 0.05, max(y, y + ay * 1.6) + 0.05, 7.4, 7.5, PAINT)
        Li.boxc(x + ax * 1.6, y + ay * 1.6, 7.25, 0.7 if ax else 0.3, 0.7 if ay else 0.3, 0.2, DARK)
        Li.boxc(x + ax * 1.6, y + ay * 1.6, 7.2, 0.6 if ax else 0.25, 0.6 if ay else 0.25, 0.05, SODL)
        points.append(((x + ax * 1.6, y + ay * 1.6, 6.9), 700, (1.0, 0.7, 0.42)))
    for x in range(int(-OX) + 4, int(OX), 16):
        if not (-24 < x < 24):
            street_lamp(x, -OY - 1.5, 0, 1)
        street_lamp(x + 8, OY + 1.5, 0, -1)
    for y in range(int(-OY) + 6, int(OY) - 4, 16):
        street_lamp(-OX - 1.5, y, 1, 0); street_lamp(OX + 1.5, y, -1, 0)

    # ============================================================ 入口楼 + 行政楼（walls_ext）
    Wx = Batch('walls_ext')
    EY0, EY1 = -70.0, -50.0
    Wx.box(EG0, EG1, EY0, EY1, 0, 10.5, CONC)                                              # 主体（两层，厚重实墙）
    Wx.box(EG0 - 0.5, EG1 + 0.5, EY0 - 0.5, EY1 + 0.5, 10.5, 11.6, CONC_D)                   # 厚檐
    for x in range(int(EG0) + 2, int(EG1) - 1, 3):                                          # 竖向窄窗缝
        Wx.box(x, x + 0.5, EY0 - 0.08, EY0, 5.4, 9.6, SLOTL if (x // 3) % 3 == 0 else SLOT)
        Wx.box(x - 0.15, x + 0.65, EY0 - 0.3, EY0, 5.2, 5.4, CONC_D)
    Wx.box(-9, 9, EY0 - 7, EY0, 4.6, 5.4, CONC_D)                                          # 悬挑雨棚
    Wx.box(-8.6, 8.6, EY0 - 6.6, EY0, 4.56, 4.6, WHITEP)
    for x in (-6, -2, 2, 6):
        Wx.box(x - 0.12, x + 0.12, EY0 - 6, EY0 - 0.6, 4.52, 4.56, COLDL)
    for x in (-8.4, 8.4):
        Wx.boxc(x, EY0 - 6.4, 0, 0.6, 0.6, 4.6, CONC_D)
    Wx.box(-6, 6, EY0 - 0.06, EY0 + 0.02, 0.15, 3.4, GLASSL)                                # 玻璃门厅（亮）
    for x in (-6, -3, 0, 3, 6):
        Wx.box(x - 0.08, x + 0.08, EY0 - 0.1, EY0, 0.15, 3.4, PAINT)
    Wx.box(-6, 6, EY0 - 0.1, EY0, 3.3, 3.45, PAINT)
    Wx.box(-9, 9, EY0 - 6, EY0, 0, 0.15, PANEL)
    for k in range(3):
        Wx.box(-9, 9, EY0 - 6 - (k + 1) * 0.4, EY0 - 6 - k * 0.4, 0, 0.15 - k * 0.05, PANEL)
    spots.append(((0, EY0 - 3, 4.4), (0, EY0 - 4, 0), 3500, (0.95, 0.9, 0.8), 120))
    points.append(((0, EY0 + 2, 2.5), 400, (1.0, 0.85, 0.62)))
    for x in range(int(EG0), int(EG1), 2):
        Wx.box(x, x + 2, EY0 - 0.01, EY0 - 0.005, 0.2, 0.2 + rnd.uniform(0.5, 1.4), DAMP)
        Wx.box(x + 0.5, x + 0.7, EY0 - 0.012, EY0 - 0.006, 7, 10.5, GRIME) if rnd.random() < 0.4 else None
    # 行政楼：规整窗格，4 层 + 实墙楼梯塔
    AX0, AX1, AY0, AY1 = -62.0, -30.0, -46.0, -30.0
    FL, NF = 3.6, 4
    TOP = FL * NF
    Wx.box(AX0, AX1, AY0, AY1, 0, TOP, WIN)
    for f in range(NF + 1):
        Wx.box(AX0 - 0.35, AX1 + 0.35, AY0 - 0.35, AY1 + 0.35, f * FL - 0.4, f * FL + 0.3, CONC)
    x = AX0
    while x <= AX1 + 0.01:
        Wx.box(x - 0.2, x + 0.2, AY0 - 0.6, AY0, 0.3, TOP, CONC)
        Wx.box(x - 0.2, x + 0.2, AY1, AY1 + 0.6, 0.3, TOP, CONC)
        x += 2.4
    Wx.box(AX1 - 1, AX1 + 5, AY0 + 3, AY0 + 10, 0, TOP + 3.0, CONC_D)
    Wx.box(AX0 - 0.4, AX1 + 0.4, AY0 - 0.4, AY1 + 0.4, TOP, TOP + 1.0, CONC_D)
    for (x, y) in ((-54, -38), (-44, -38)):
        Wx.boxc(x, y, TOP + 1.0, 4.0, 3.0, 1.8, SHEET)
    # 入口楼 → 行政楼的连廊（封闭）
    Wx.box(-30, -16, -52, -48, 3.6, 7.2, CONC)
    Wx.box(-30, -16, -52.05, -51.95, 5.0, 6.0, SLOT)

    # ============================================================ 长条封闭楼体（props_blocks）
    Bl = Batch('props_blocks')
    def block(x0, x1, y0, y1, h, seed):
        r = random.Random(seed)
        Bl.box(x0, x1, y0, y1, 0, h, CONC_B)
        Bl.box(x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3, 0, 1.0, CONC_D)                      # 勒脚
        Bl.box(x0 - 0.4, x1 + 0.4, y0 - 0.4, y1 + 0.4, h, h + 0.9, CONC_D)                  # 厚压顶
        for z in range(4, int(h), 4):                                                     # 层线
            Bl.box(x0 - 0.05, x1 + 0.05, y0 - 0.05, y1 + 0.05, z - 0.08, z + 0.08, CONC_D)
        # 竖向窄窗缝：长边每 2.4 m 一条，宽 0.25，每层一段
        x = x0 + 2.0
        while x < x1 - 1.5:
            for z in range(0, int(h) - 1, 4):
                for (yy, s) in ((y0, -1), (y1, 1)):
                    lit = r.random() < 0.18
                    Bl.box(x, x + 0.25, yy + s * 0.001, yy + s * 0.07, z + 1.3, z + 3.3, SLOTL if lit else SLOT)
                    Bl.box(x - 0.2, x + 0.45, yy, yy + s * 0.35, z + 1.2, z + 1.3, CONC_D)
            x += 2.4
        # 端墙竖向凹槽 + 楼梯塔
        Bl.box(x1, x1 + 4.5, (y0 + y1) / 2 - 2.5, (y0 + y1) / 2 + 2.5, 0, h + 2.5, CONC)
        Bl.box(x1 + 4.49, x1 + 4.52, (y0 + y1) / 2 - 0.3, (y0 + y1) / 2 + 0.3, 1.5, h + 1.5, SLOT)
        Bl.box(x1 + 4.5, x1 + 4.56, (y0 + y1) / 2 - 1.0, (y0 + y1) / 2 + 1.0, 0, 2.4, PAINT)  # 检修门
        Bl.box(x1 + 4.5, x1 + 5.8, (y0 + y1) / 2 - 1.4, (y0 + y1) / 2 + 1.4, 2.6, 2.8, CONC_D)
        Bl.box(x1 + 4.6, x1 + 5.7, (y0 + y1) / 2 - 1.2, (y0 + y1) / 2 + 1.2, 2.58, 2.6, COLDL)
        # 屋面设备
        for k in range(3):
            cx = x0 + 8 + k * (x1 - x0 - 16) / 2
            Bl.boxc(cx, (y0 + y1) / 2, h + 0.9, 3.0, 2.4, 1.6, SHEET)
            Bl.cyl(cx, (y0 + y1) / 2, h + 2.5, 0.7, 0.4, PAINT, 12)
        # 雨痕 / 墙根潮痕
        for k in range(int((x1 - x0) / 3)):
            xx = r.uniform(x0, x1 - 0.3)
            for (yy, s) in ((y0, -1), (y1, 1)):
                Bl.box(xx, xx + r.uniform(0.15, 0.5), yy + s * 0.075, yy + s * 0.08, r.uniform(h - 7, h - 2), h, GRIME)
        for (yy, s) in ((y0, -1), (y1, 1)):
            Bl.box(x0, x1, yy + s * 0.075, yy + s * 0.08, 1.0, 1.0 + r.uniform(0.6, 1.2), DAMP)
    for i, y in enumerate((-12.0, 8.0, 28.0, 46.0)):
        x0 = -14.0 if i < 3 else 6.0
        block(x0, 62.0, y, y + (12.0 if i < 3 else 9.0), 16.0 if i % 2 == 0 else 12.0, 40 + i)
    # 楼间低矮的封闭连接体
    Bl.box(-18, -14, -12, 55, 0, 4.0, CONC_D)

    # ============================================================ 场院 + 温室 / 工坊 + 运动场 + 前庭（props_yard）
    Yd = Batch('props_yard')
    # 温室 / 工坊大厅：混凝土勒墙 + 钢框 + 磨砂玻璃坡屋面；东侧一段实墙工坊
    TX0, TX1, TY0, TY1 = -74.0, -44.0, -14.0, 6.0
    Yd.box(TX0, TX1, TY0, TY1, 0, 1.2, CONC)
    Yd.box(TX0 + 0.2, TX1 - 0.2, TY0 + 0.2, TY1 - 0.2, 1.2, 4.6, GREENG)
    Yd.gable(TX0, TX1, TY0, TY1, 4.6, 2.6, GREENG, along='x')
    for x in range(int(TX0), int(TX1) + 1, 3):
        for y in (TY0 - 0.05, TY1 + 0.05):
            Yd.boxc(x, y, 1.2, 0.14, 0.14, 3.4, PAINT)
        Yd.tube([(x, TY0, 4.6), (x, (TY0 + TY1) / 2, 7.2), (x, TY1, 4.6)], 0.07, PAINT, n=4)
    for y in (TY0 - 0.05, TY1 + 0.05):
        Yd.box(TX0, TX1, y - 0.07, y + 0.07, 2.9, 3.0, PAINT)
        Yd.box(TX0, TX1, y - 0.1, y + 0.1, 4.5, 4.7, PAINT)
    Yd.box(TX0, TX1, (TY0 + TY1) / 2 - 0.15, (TY0 + TY1) / 2 + 0.15, 7.1, 7.35, PAINT)
    points.append((((TX0 + TX1) / 2, (TY0 + TY1) / 2, 3.0), 900, (0.9, 1.0, 0.85)))
    WX0 = TX1
    Yd.box(WX0, WX0 + 14, TY0, TY1, 0, 8.0, CONC)
    Yd.gable(WX0 - 0.3, WX0 + 14.3, TY0 - 0.3, TY1 + 0.3, 8.0, 1.6, SHEET, along='y')
    for y in (TY0 + 4, TY1 - 4):
        Yd.box(WX0 + 14, WX0 + 14.08, y - 2, y + 2, 0, 4.2, SHEET)                          # 卷帘门（关）
        for z in range(1, 8):
            Yd.box(WX0 + 14.08, WX0 + 14.1, y - 2, y + 2, z * 0.5, z * 0.5 + 0.04, PAINT)
        Yd.box(WX0 + 14, WX0 + 14.5, y - 2.2, y + 2.2, 4.2, 4.4, CONC_D)
    for x in range(int(WX0) + 2, int(WX0) + 13, 3):
        Yd.box(x, x + 1.4, TY0 - 0.06, TY0, 5.6, 6.6, GLASSL)
    # 运动场：跑道 + 草地 + 白线 + 两个简单球门框 + 看台台阶
    FX0, FX1, FY0, FY1 = -72.0, -32.0, 18.0, 54.0
    Yd.box(FX0, FX1, FY0, FY1, 0.0, 0.04, TRACK)
    Yd.box(FX0 + 3, FX1 - 3, FY0 + 3, FY1 - 3, 0.0, 0.06, TURF)
    for (x0, x1, y0, y1) in ((FX0 + 3, FX1 - 3, FY0 + 3, FY0 + 3.12), (FX0 + 3, FX1 - 3, FY1 - 3.12, FY1 - 3),
                             (FX0 + 3, FX0 + 3.12, FY0 + 3, FY1 - 3), (FX1 - 3.12, FX1 - 3, FY0 + 3, FY1 - 3),
                             ((FX0 + FX1) / 2 - 0.06, (FX0 + FX1) / 2 + 0.06, FY0 + 3, FY1 - 3)):
        Yd.box(x0, x1, y0, y1, 0.06, 0.07, WHITEP)
    ym = (FY0 + FY1) / 2
    for x, s in ((FX0 + 3.2, 1), (FX1 - 3.2, -1)):
        for dy in (-3.6, 3.6):
            Yd.cyl(x, ym + dy, 0.06, 0.06, 2.4, WHITEP, 8)
        Yd.box(x - 0.06, x + 0.06, ym - 3.6, ym + 3.6, 2.4, 2.52, WHITEP)
        Yd.tube([(x, ym - 3.6, 2.46), (x - s * 1.5, ym - 3.6, 0.06)], 0.03, WHITEP, n=4)
        Yd.tube([(x, ym + 3.6, 2.46), (x - s * 1.5, ym + 3.6, 0.06)], 0.03, WHITEP, n=4)
    for k in range(3):
        Yd.box(FX0 + 6, FX1 - 6, FY0 - 1.2 - (3 - k) * 0.8, FY0 - 1.2 - (2 - k) * 0.8, 0, 0.45 * (k + 1), CONC)
    # 访客前庭（墙外南侧）：铺装广场、长椅、候车亭式雨棚、花池（空）、系缆柱
    Yd.box(-24, 24, -86, EY0 - 7.6, -0.05, 0.1, PANEL)
    for x in range(-24, 25, 4):
        Yd.box(x - 0.03, x + 0.03, -86, EY0 - 7.6, 0.1, 0.105, CONC_D)
    for (x, y) in ((-16, -80), (16, -80)):                                                  # 花池（低矮植被丛）
        Yd.boxc(x, y, 0.1, 8, 3, 0.6, CONC)
        Yd.boxc(x, y, 0.7, 7.4, 2.4, 0.02, SOIL)
        for k in range(10):
            Yd.sphere(x + rnd.uniform(-3.2, 3.2), y + rnd.uniform(-0.9, 0.9), 0.75, rnd.uniform(0.35, 0.6), TURF, sz=0.7, seg=8, rings=5)
    def bench(x, y, rz=0.0):
        M = Matrix.Translation((x, y, 0.1)) @ Matrix.Rotation(rz, 4, 'Z')
        for s in (-0.8, 0.8):
            Yd.box(s - 0.05, s + 0.05, -0.25, 0.25, 0, 0.42, PAINT, M)
            Yd.box(s - 0.05, s + 0.05, 0.2, 0.26, 0.42, 0.85, PAINT, M)
        for k in range(3):
            Yd.box(-1.0, 1.0, -0.25 + k * 0.17, -0.25 + k * 0.17 + 0.13, 0.42, 0.46, WOOD, M)
        for k in range(2):
            Yd.box(-1.0, 1.0, 0.26, 0.3, 0.55 + k * 0.17, 0.67 + k * 0.17, WOOD, M)
    for x in (-20, -11, 11, 20):
        bench(x, -74.5, math.pi)
    for x in (-5, 5):
        bench(x, -84, 0.0)
    # 候车亭（前庭西侧路边）：钢框 + 顶板 + 后挡板玻璃 + 长凳 + 顶灯
    SX, SY = -30.0, -84.0
    for (dx, dy) in ((-3, 0), (3, 0)):
        Yd.boxc(SX + dx, SY + 0.8, 0, 0.14, 0.14, 2.6, PAINT)
    Yd.boxc(SX, SY, 2.6, 7, 2.2, 0.14, PAINT)
    Yd.boxc(SX, SY, 2.56, 6.8, 2.0, 0.04, COLDL)
    Yd.box(SX - 3, SX + 3, SY + 0.8, SY + 0.86, 0.3, 2.4, GLASS)
    Yd.box(SX - 3.1, SX - 3.04, SY - 0.6, SY + 0.8, 0.3, 2.4, GLASS)
    bench(SX, SY + 0.35, 0.0)
    points.append(((SX, SY, 2.3), 150, (0.9, 0.95, 1.0)))
    Yd.box(SX - 6, SX + 6, -OY - 4.5, -OY - 4.5 + 0.2, 0.1, 0.12, LANE)
    for x in range(-22, 23, 3):                                                              # 系缆柱（防撞）
        Yd.cyl(x, -86.4, 0.1, 0.18, 0.9, CONC, 10)
    # 场院：集装箱、托盘货堆、车棚
    for i, (x, y) in enumerate(((70, -52), (70, -49.4), (64, -52))):
        Yd.boxc(x, y, 0, 6.0, 2.44, 2.6, CBOX[i % 3])
        for k in range(8):
            Yd.box(x - 2.9 + k * 0.75, x - 2.85 + k * 0.75, y - 1.24, y - 1.22, 0.1, 2.5, DARK)
    Yd.boxc(70, -50.7, 2.6, 6.0, 2.44, 2.6, CBOX[2])
    for (x, y) in ((40, -54), (41.3, -54), (40.6, -52.6)):
        Yd.boxc(x, y, 0, 1.2, 1.0, 0.15, WOOD)
        Yd.boxc(x, y, 0.15, 1.1, 0.95, 0.9, SHEET)
    for x in (36, 48, 60):
        for y in (-44, -34):
            Yd.boxc(x, y, 0, 0.3, 0.3, 4.8, STEEL)
    Yd.box(34, 62, -46, -32, 4.8, 5.1, PAINT)
    for x in (40, 48, 56):
        Yd.box(x - 0.1, x + 0.1, -44, -34, 4.76, 4.8, COLDL)
        spots.append(((x, -39, 4.6), (x, -39, 0), 1400, (0.85, 0.92, 1.0), 120))
    for x in (36.0, 42.0, 48.0, 54.0, 60.0):
        Yd.box(x - 0.06, x + 0.06, -45.5, -32.5, 0.015, 0.02, WHITEP)

    # ============================================================ 厢式货车（props_vehicles）
    Ve = Batch('props_vehicles')
    def van(x, y, rz):
        """城市厢式货车：斜前脸（挤出侧剖面）、风挡、侧窗、后双开门、4 轮。本地 y = 车长，车头在 -y。"""
        M = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rz, 4, 'Z')
        def P(px, py, pz): return tuple(M @ Vector((px, py, pz)))
        ax_ = 'x' if abs(math.sin(rz)) < 0.5 else 'y'
        prof = [(-2.75, 0.42), (2.75, 0.42), (2.75, 2.55), (-1.25, 2.55), (-2.25, 1.55), (-2.8, 1.25), (-2.8, 0.55)]
        n = len(prof)
        vs = [P(sx * 1.0, py, pz) for sx in (-1, 1) for (py, pz) in prof]
        fs = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        Ve.poly(vs, fs, VAN)
        nn = Vector((0, -1.0, 1.0)).normalized() * 0.02
        g = [P(sx * 0.9, py + nn.y, pz + nn.z) for (py, pz) in ((-1.3, 2.5), (-2.2, 1.6)) for sx in (-1, 1)]
        Ve.poly([g[0], g[1], g[3], g[2]], [(0, 1, 2, 3), (3, 2, 1, 0)], GLASS)
        for sx in (-1, 1):
            rbox(Ve, *P(sx * 1.005, -1.15, 1.95), 0.02, 1.2, 0.7, GLASS, rz=rz)
            rbox(Ve, *P(sx * 1.01, -0.45, 1.4), 0.02, 0.04, 2.0, DARK, rz=rz)
            rbox(Ve, *P(sx * 1.01, 1.0, 1.45), 0.02, 0.04, 1.9, DARK, rz=rz)            # 侧滑门缝
            rbox(Ve, *P(sx * 1.2, -1.95, 1.9), 0.06, 0.1, 0.3, DARK, rz=rz)               # 后视镜
            rbox(Ve, *P(sx * 0.72, -2.81, 1.05), 0.36, 0.04, 0.16, COLDL, rz=rz)
            rbox(Ve, *P(sx * 0.85, 2.76, 1.2), 0.18, 0.04, 0.35, RED, rz=rz)
            rbox(Ve, *P(sx * 1.0, 0.0, 0.52), 0.04, 5.4, 0.22, PAINT, rz=rz)             # 侧裙
        rbox(Ve, *P(0, 2.765, 1.5), 0.03, 0.03, 2.0, DARK, rz=rz)                         # 后门缝
        rbox(Ve, *P(0, -2.84, 0.62), 2.0, 0.14, 0.3, PAINT, rz=rz)
        rbox(Ve, *P(0, 2.8, 0.55), 2.0, 0.12, 0.2, PAINT, rz=rz)
        rbox(Ve, *P(0, -2.82, 0.9), 1.2, 0.03, 0.22, DARK, rz=rz)                         # 进气格栅
        for py in (-1.85, 1.75):
            for s in (-1, 1):
                wx, wy, _ = P(s * 0.9, py, 0)
                disc(Ve, wx, wy, 0.36, 0.36, RUBBER, axis=ax_, t=0.24, n=18)
                ox, oy, _ = P(s * 1.02, py, 0)
                disc(Ve, ox, oy, 0.36, 0.2, RIM, axis=ax_, t=0.02, n=12)
                rbox(Ve, *P(s * 0.98, py, 0.72), 0.08, 0.95, 0.08, DARK, rz=rz)            # 轮拱
    van(42, -39, 0.0)
    van(48 + 2, -39, 0.0)
    van(56, -40, 0.1)
    van(66, -38, math.pi / 2 + 0.05)
    van(56, -WY - 7.5, math.pi / 2)                     # 门外待入
    van(-34, -OY - 3.0 + 1.5, math.pi / 2)              # 前庭路边停靠

    # ============================================================ 背景（bg_*，不导出）
    Bs = Batch('bg_slum')
    rb = random.Random(5)
    Bs.box(-500, 500, -500, 500, -0.6, -0.3, DIRT)
    IX, IY = OX + 5, OY + 5
    for gx in range(-44, 45):
        for gy in range(-40, 45):
            x, y = gx * 5.0 + rb.uniform(-0.6, 0.6), gy * 5.0 + rb.uniform(-0.6, 0.6)
            d = max(abs(x) - IX, abs(y) - IY)
            if d < 18 or d > 130: continue                                           # 留出一圈空地
            if gx % 6 == 0 or gy % 7 == 0: continue
            if rb.random() < 0.2 + d / 300: continue
            sx_, sy_ = rb.uniform(3.6, 5.2), rb.uniform(3.6, 5.2)
            z = 0.0
            for lev in range(rb.randint(1, 2)):
                h = rb.uniform(2.4, 3.2)
                Bs.boxc(x, y, z, sx_, sy_, h, rb.choice([SHEET_R, SHEET_R, RUST, CBOX[1], SHEET]))
                if rb.random() < 0.4:
                    Bs.boxc(x, y + sy_ / 2 + 0.02, z + 1.0, rb.uniform(0.5, 1.0), 0.05, 0.6, SHACKW if rb.random() < 0.6 else DARK)
                z += h
            rbox(Bs, x, y, z + 0.05, sx_ + 0.8, sy_ + 0.8, 0.08, rb.choice([SHEET_R, RUST]), rx=rb.uniform(-0.1, 0.1))
    for (x, y) in ((-150, 95), (130, 110), (-175, -55), (190, -150), (0, 175), (-40, -240), (200, 10)):
        Bs.boxc(x, y, 0, 16, 16, UZ, CONC_D)
        Bs.boxc(x, y, 0, 19, 19, 4, CONC_D)
        Bs.boxc(x, y, UZ - 12, 24, 24, 12, CONC_D)
        for z in (25, 60, 95, 130):
            Bs.box(x - 8.05, x + 8.05, y - 8.05, y + 8.05, z, z + 0.3, PAINT)
        for k in range(3):
            Bs.tube([(x + 8.3, y - 4 + k * 3, 0), (x + 8.3, y - 4 + k * 3, UZ)], 0.4, rb.choice([RUST, STEEL]), n=8)
        points.append(((x, y - 9, 30), 900, (0.7, 0.8, 1.0)))
    Bu = Batch('bg_underside')
    Bu.box(-600, 600, -600, 600, UZ, UZ + 4, CONC_D)
    for k in range(-12, 13):
        Bu.box(k * 45 - 1.5, k * 45 + 1.5, -600, 600, UZ - 5, UZ, PAINT)
        Bu.box(-600, 600, k * 45 - 1.5, k * 45 + 1.5, UZ - 5, UZ, PAINT)
    for k in range(14):
        y = rb.uniform(-300, 300)
        Bu.tube([(-600, y, UZ - 7), (600, y, UZ - 7)], rb.uniform(0.6, 1.6), rb.choice([RUST, STEEL]), n=10)
    for i in range(160):
        Bu.boxc(rb.uniform(-450, 450), rb.uniform(-450, 450), UZ - 5.4, 1.2, 1.2, 0.3, rb.choice([SODL, COLDL, SODL, WARML]))

    Batch.build_all()

    # ------------------------------------------------------------ 世界 + 雾 + 灯光
    w = bpy.data.worlds.new('w'); sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs[0].default_value = (0.03, 0.033, 0.045, 1); bg.inputs[1].default_value = 0.3
    nt.links.new(bg.outputs[0], out.inputs[0])
    vs = nt.nodes.new('ShaderNodeVolumePrincipled')
    vs.inputs['Color'].default_value = (0.6, 0.62, 0.66, 1)
    vs.inputs['Density'].default_value = 0.0012
    nt.links.new(vs.outputs[0], out.inputs['Volume'])
    sc.cycles.volume_bounces = 0
    sc.cycles.volume_step_rate = 4.0
    for (loc, e, sz, c) in (((0, 0, 70), 45000, 140, (0.8, 0.86, 1.0)), ((0, 0, UZ - 14), 7000, 500, (0.6, 0.65, 0.8))):
        ld = bpy.data.lights.new('area_%d' % e, 'AREA'); ld.energy = e; ld.size = sz; ld.color = c
        o = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(o); o.location = loc
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.1)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.4)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 1.0

    CAMS = {
        'c1': ((-120.0, -175.0, 85.0), (4.0, 4.0, 6.0), 24, 0.1, 1.5),
        'c2': ((-14.0, -95.0, 2.2), (2.0, -66.0, 5.5), 22, 0.1, 1.5),
        'c3': ((WX + RING - 3.0, -10.0, 2.4), (WX - 2.0, -WY, 9.0), 24, 0.08, 1.5),
    }
    cv = CAMS[A['cam']]
    C.camera(sc, cv[0], cv[1], cv[2], cv[3])
    C.render(sc, A['out'], A['res'], cv[4], A['blend'])


try:
    main()
except Exception:
    msg = traceback.format_exc()
    if A['log']:
        with open(A['log'], 'w') as f:
            f.write(msg)
    print(msg)
    raise
