"""资产管理委员会下层设施（下层地基区，行政中心 + 中央工坊 + 执法小队驻点，合画为一处围墙院落）——只做外观。
卡面：委员会在下层直营的公共设施，周边驻有执法小队，是下层唯一相对安全的区域。
这里只画一个干净、灯火通明的政府院落和周围贫民窟的对比：高围墙 + 墙灯、车辆门岗（岗亭 + 道闸）、
执法小队驻点（小营房 + 停着的巡逻悬浮车，深色涂装、无标识）、多层行政楼（规整窗格）、无窗长条工坊厂房
（屋顶通风器 + 装卸月台 + 卡车 / 货箱）、后勤场院、投光灯塔、摄像杆，以及围墙外一圈亮着的整洁缓冲街道。
中立：无内部、无人物、无文字 / 标志 / 徽章、无武器、无任何囚禁意味的东西；建筑外观封闭、空白。

布局（米）：院落中心 (0, 0)；围墙 x -60..60、y -45..45，高 6.5 m；南墙 x 8..22 是车辆门（门岗在门内东侧）。
  行政楼（walls_ext）x -52..-16、y 2..30，6 层 z 0..22.5；工坊厂房（props_works）x 2..52、y 10..38，高 13，
  南面 y 10 是装卸月台（y 4..10，高 1.2）；执法驻点（props_post）x -54..-30、y -40..-18；
  后勤场院（props_works 内）x 28..56、y -40..-8；缓冲街道 y -45..-62 / 四周 16 m 宽；再往外是铁皮屋（bg_*）。
bg_*：铁皮屋、巨型支撑柱、上方中层底面（管线 + 零星灯）、雾（只渲染，不导出）。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/amc_facility/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/amc.jpg [--blend /tmp/amc.blend] [--log /tmp/amc.log] [--exposure 0.9]
cam: c1 贫民窟中的院落俯瞰 / c2 门岗街面视高 / c3 装卸月台与工坊
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='night', res='900', samples='24', out='/tmp/amc.jpg', blend='', log='', exposure=''))

WX, WY, WH = 60.0, 45.0, 6.5     # 围墙半宽 / 半深 / 高
GX0, GX1 = 8.0, 22.0             # 南墙车辆门
RING = 16.0                      # 缓冲街道宽
UZ = 150.0                       # 中层底面


def main():
    import bpy
    from mathutils import Matrix, Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(11)

    # ------------------------------------------------------------ 材质
    CONC = C.pbr('amc_conc', 'concrete_wall_008', 4.0, tint=(0.8, 0.83, 0.87), sat=0.0, value=1.1, weather=0.7)
    CONC_D = C.pbr('amc_conc_dark', 'concrete_wall_008', 5.0, tint=(0.45, 0.47, 0.5), sat=0.0, weather=0.6)
    PANEL = C.pbr('amc_panel', 'smooth_concrete_floor', 3.0, tint=(0.72, 0.73, 0.74), sat=0.2, value=1.0)
    YARD = C.pbr('amc_yard', 'hangar_concrete_floor', 6.0, tint=(0.6, 0.6, 0.6), sat=0.3, value=0.9, weather=0.3)
    ASPH = C.pbr('amc_asphalt', 'asphalt_02', 4.0, tint=(0.42, 0.42, 0.44), sat=0.3, value=0.75)
    DIRT = C.pbr('amc_dirt', 'concrete_floor_worn_001', 5.0, tint=(0.3, 0.28, 0.25), sat=0.3, value=0.5, weather=1.0)
    STEEL = C.pbr('amc_steel', 'Metal009', 2.0, tint=(0.4, 0.41, 0.43), sat=0.3, metal=0.85, rough_mul=1.1)
    PAINT = C.pbr('amc_paint_grey', 'Metal009', 2.0, tint=(0.3, 0.32, 0.34), sat=0.1, metal=0.3, rough_mul=1.3)
    SHEET = C.pbr('amc_sheet', 'box_profile_metal_sheet', 2.5, tint=(0.72, 0.76, 0.8), sat=0.0, value=1.2, metal=0.7, rough_mul=0.8)
    SHEET_B = C.pbr('amc_sheet_blue', 'box_profile_metal_sheet', 2.5, tint=(0.3, 0.38, 0.46), sat=0.0, metal=0.6)
    SHEET_R = C.pbr('amc_sheet_rust', 'box_profile_metal_sheet', 2.5, tint=(0.52, 0.34, 0.22), sat=0.6, metal=0.3, weather=1.0)
    RUST = C.flat('amc_rust', (0.24, 0.12, 0.06), 0.8, metal=0.3, noise=0.5)
    RUBBER = C.pbr('amc_rubber', 'Rubber004', 1.0, tint=(0.25, 0.25, 0.25), sat=0.2)
    HAZ = C.hazard('amc_hazard')
    HAZ_RW = C.hazard('amc_hazard_rw', (0.7, 0.06, 0.04), (0.82, 0.8, 0.76), 0.35)
    LANE = C.flat('amc_lane_y', (0.75, 0.58, 0.1), 0.6, noise=0.3)
    WHITEP = C.flat('amc_lane_w', (0.7, 0.7, 0.68), 0.6, noise=0.3)
    NAVY = C.flat('amc_livery', (0.035, 0.045, 0.06), 0.3, metal=0.5, noise=0.15, coat=0.6)
    GLASS = C.glass('amc_glass', (0.05, 0.065, 0.08), 0.05)
    GLASSL = C.glass('amc_glass_lit', (0.06, 0.07, 0.08), 0.1, emit=(0.85, 0.92, 1.0), estr=1.6)
    DARK = C.flat('amc_dark', (0.015, 0.015, 0.016), 0.8)
    CABLE = C.flat('amc_cable', (0.02, 0.02, 0.022), 0.5)
    COLDL = C.flat('amc_coldlight', (0.85, 0.92, 1), 0.3, emit=(0.85, 0.93, 1.0), estr=40.0)
    SODL = C.flat('amc_sodium', (1, 0.6, 0.2), 0.3, emit=(1.0, 0.55, 0.18), estr=30.0)
    WARML = C.flat('amc_warm', (1, 0.8, 0.5), 0.3, emit=(1.0, 0.72, 0.42), estr=6.0)
    RED = C.flat('amc_sig_red', (1, 0.1, 0.05), 0.3, emit=(1.0, 0.06, 0.03), estr=25.0)
    GREEN = C.flat('amc_sig_green', (0.1, 1, 0.3), 0.3, emit=(0.1, 1.0, 0.35), estr=25.0)
    BLUE = C.flat('amc_sig_blue', (0.2, 0.4, 1), 0.3, emit=(0.2, 0.45, 1.0), estr=20.0)
    CBOX = [C.pbr('amc_cont_%d' % i, 'box_profile_metal_sheet', 2.4, tint=t, sat=0.8, metal=0.4, weather=0.5)
            for i, t in enumerate(((0.36, 0.42, 0.44), (0.5, 0.3, 0.16), (0.3, 0.36, 0.28)))]
    CRATE = C.pbr('amc_crate', 'Metal009', 1.5, tint=(0.5, 0.52, 0.54), sat=0.0, metal=0.6)
    GRIME = C.flat('amc_grime', (0.07, 0.07, 0.068), 0.8, noise=0.7)
    DAMP = C.flat('amc_damp', (0.1, 0.1, 0.1), 0.35, noise=0.5, coat=0.3)
    FIN = C.flat('amc_fin', (0.72, 0.74, 0.76), 0.5, noise=0.15)
    OIL = C.flat('amc_oil', (0.09, 0.085, 0.08), 0.45, noise=0.6, coat=0.25)
    PATCH = C.pbr('amc_patch', 'asphalt_02', 3.0, tint=(0.28, 0.28, 0.3), sat=0.2, value=0.6)
    RIM = C.flat('amc_rim', (0.5, 0.52, 0.55), 0.3, metal=0.9)
    WHITEL = C.flat('amc_bar_white', (1, 1, 1), 0.3, emit=(0.9, 0.95, 1.0), estr=12.0)
    TRL = C.pbr('amc_trailer', 'box_profile_metal_sheet', 1.2, tint=(0.8, 0.82, 0.84), sat=0.0, value=1.2, metal=0.5, rot=1.5708)
    PALLET = C.flat('amc_pallet', (0.32, 0.31, 0.29), 0.7, noise=0.4)
    TANKM = C.flat('amc_tank', (0.62, 0.63, 0.62), 0.35, metal=0.4, noise=0.15)
    WIN = C.window_grid('amc_admin_win', wall=(0.07, 0.075, 0.08), lit=(0.9, 0.95, 1.0), estr=2.2, cell=(1.8, 3.75), seed=1.3)
    SHACKW = C.glass('amc_shackwin', (0.05, 0.04, 0.03), 0.2, emit=(1.0, 0.62, 0.3), estr=2.0)
    TWIN = C.window_grid('amc_bg_win', wall=(0.05, 0.05, 0.055), lit=(1.0, 0.75, 0.45), estr=1.2, cell=(3.0, 3.4), seed=4.0)

    # ------------------------------------------------------------ 几何工具
    def rbox(B, x, y, z, sx, sy, sz, m, rz=0.0, rx=0.0, ry=0.0):
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y')
        B.box(-sx / 2, sx / 2, -sy / 2, sy / 2, -sz / 2, sz / 2, m, M)

    def beam(B, p0, p1, w, m):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        M = Matrix.Translation((p0 + p1) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        B.box(-w / 2, w / 2, -w / 2, w / 2, -d.length / 2, d.length / 2, m, M)

    def disc(B, x, y, z, r, m, axis='x', n=14, t=0.3):
        R = Matrix.Rotation(math.pi / 2, 4, 'X') if axis == 'y' else Matrix.Rotation(math.pi / 2, 4, 'Y')
        B.cyl(0, 0, -t / 2, r, t, m, n, smooth=False, mat=Matrix.Translation((x, y, z)) @ R)

    def corr(B, P, U, V, m, pitch=0.25, depth=0.05):
        """波纹板：U 方向起伏，V 方向拉直。"""
        P, U, V = Vector(P), Vector(U), Vector(V)
        n = U.cross(V).normalized()
        k = max(4, int(U.length / pitch * 4))
        pat = (0.0, 1.0, 1.0, 0.0)
        vs = []
        for i in range(k + 1):
            o = P + U * (i / k) + n * (depth * pat[i % 4])
            vs.append(tuple(o)); vs.append(tuple(o + V))
        B.poly(vs, [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(k)], m)

    spots, points = [], []

    # ============================================================ 地面：院内混凝土 + 缓冲街道 + 路缘
    G = Batch('site_ground')
    G.box(-WX, WX, -WY, WY, -0.2, 0.0, YARD)
    OX, OY = WX + RING, WY + RING
    for (x0, x1, y0, y1) in ((-OX, OX, -OY, -WY), (-OX, OX, WY, OY), (-OX, -WX, -WY, WY), (WX, OX, -WY, WY)):
        G.box(x0, x1, y0, y1, -0.25, -0.05, ASPH)
    for (x0, x1, y0, y1) in ((-OX, OX, -OY - 4.5, -OY), (-OX, OX, OY, OY + 4.5), (-OX - 4.5, -OX, -OY - 4.5, OY + 4.5), (OX, OX + 4.5, -OY - 4.5, OY + 4.5)):
        G.box(x0, x1, y0, y1, -0.25, 0.1, PANEL)      # 人行道
    for (x0, x1, y0, y1) in ((-OX, OX, -OY - 0.25, -OY), (-OX, OX, OY, OY + 0.25), (-OX - 0.25, -OX, -OY, OY), (OX, OX + 0.25, -OY, OY)):
        G.box(x0, x1, y0, y1, -0.25, 0.18, CONC)      # 路缘
    # 墙根 1.5 m 碎石带 / 车道线（中心虚线）
    for x in range(int(-OX) + 2, int(OX) - 2, 6):
        G.box(x, x + 3, -WY - RING / 2 - 0.08, -WY - RING / 2 + 0.08, -0.05, -0.04, WHITEP)
        G.box(x, x + 3, WY + RING / 2 - 0.08, WY + RING / 2 + 0.08, -0.05, -0.04, WHITEP)
    for y in range(int(-OY) + 2, int(OY) - 2, 6):
        for xs in (-1, 1):
            G.box(xs * (WX + RING / 2) - 0.08, xs * (WX + RING / 2) + 0.08, y, y + 3, -0.05, -0.04, WHITEP)
    for i in range(18):                                                                # 油渍 / 补过的沥青
        x, y = rnd.uniform(12, 50), rnd.uniform(-8, 3)
        G.box(x, x + rnd.uniform(0.6, 2.2), y, y + rnd.uniform(0.5, 1.6), 0.015, 0.02, OIL)
    for i in range(24):
        side = rnd.choice(((-OX, OX, -OY, -WY - 1), (-OX, OX, WY + 1, OY), (-OX, -WX - 1, -WY, WY), (WX + 1, OX, -WY, WY)))
        x, y = rnd.uniform(side[0], side[1] - 3), rnd.uniform(side[2], side[3] - 2)
        G.box(x, x + rnd.uniform(1.5, 4), y, y + rnd.uniform(1, 2.5), -0.05, -0.045, PATCH)
    # 门前斑马线
    for i in range(7):
        x = GX0 + 1 + i * 1.9
        G.box(x, x + 0.9, -WY - 12, -WY - 4, -0.05, -0.035, WHITEP)
    # 院内车道 + 停车线
    G.box(GX0, GX1, -WY, 4, 0.0, 0.015, ASPH)
    G.box(-30, GX0, -14, -6, 0.0, 0.015, ASPH)
    G.box(GX1, 56, -2, 4, 0.0, 0.015, ASPH)
    for y in (-14.0, -6.0):
        G.box(-30, GX0, y - 0.08, y + 0.08, 0.015, 0.02, LANE)
    for y in range(-40, 3, 4):
        G.box(GX0 - 0.1, GX0 + 0.1, y, y + 2, 0.015, 0.02, LANE)
        G.box(GX1 - 0.1, GX1 + 0.1, y, y + 2, 0.015, 0.02, LANE)
    G.box(GX0, GX1, -WY + 3, -WY + 3.4, 0.015, 0.02, WHITEP)   # 停止线

    # ============================================================ 围墙（props_wall）
    Wl = Batch('props_wall')
    def wall_run(x0, y0, x1, y1, gaps=()):
        along_x = abs(x1 - x0) > abs(y1 - y0)
        L0, L1 = (x0, x1) if along_x else (y0, y1)
        t = L0
        while t < L1 - 0.01:
            t2 = min(t + 6.0, L1)
            if any(g0 < (t + t2) / 2 < g1 for g0, g1 in gaps):
                t = t2; continue
            if along_x:
                Wl.box(t, t2, y0 - 0.25, y0 + 0.25, 0, WH, CONC)
                Wl.box(t - 0.35, t + 0.35, y0 - 0.45, y0 + 0.45, 0, WH + 0.35, CONC_D)           # 壁柱
                Wl.box(t, t2, y0 - 0.4, y0 + 0.4, WH, WH + 0.2, PANEL)                             # 压顶
                Wl.box(t, t2, y0 - 0.3, y0 + 0.3, 0, 0.5, CONC_D)                                   # 勒脚
                so = -1 if y0 < 0 else 1
                if (int(t) // 6) % 2 == 0:                                                           # 外侧墙灯
                    xm = (t + t2) / 2
                    Wl.box(xm - 0.35, xm + 0.35, y0 + so * 0.45, y0 + so * 0.75, WH - 0.9, WH - 0.6, PAINT)
                    Wl.box(xm - 0.3, xm + 0.3, y0 + so * 0.5, y0 + so * 0.76, WH - 0.95, WH - 0.88, COLDL)
                    points.append(((xm, y0 + so * 1.2, WH - 1.3), 160, (0.85, 0.92, 1.0)))
                    for k in range(3):
                        xx = xm + rnd.uniform(-0.3, 0.3)
                        Wl.box(xx - 0.08, xx + 0.08, y0 + so * 0.251, y0 + so * 0.26, rnd.uniform(1.5, 4.0), WH - 1.0, GRIME)
                Wl.box(t, t2, y0 + so * 0.301, y0 + so * 0.31, 0.0, 0.5, DAMP)
                Wl.box(t, t2, y0 + so * 0.251, y0 + so * 0.26, 0.5, 0.6 + rnd.uniform(0.0, 0.15), DAMP)
            else:
                Wl.box(x0 - 0.25, x0 + 0.25, t, t2, 0, WH, CONC)
                Wl.box(x0 - 0.45, x0 + 0.45, t - 0.35, t + 0.35, 0, WH + 0.35, CONC_D)
                Wl.box(x0 - 0.4, x0 + 0.4, t, t2, WH, WH + 0.2, PANEL)
                Wl.box(x0 - 0.3, x0 + 0.3, t, t2, 0, 0.5, CONC_D)
                so = -1 if x0 < 0 else 1
                if (int(t) // 6) % 2 == 0:
                    ym = (t + t2) / 2
                    Wl.box(x0 + so * 0.45, x0 + so * 0.75, ym - 0.35, ym + 0.35, WH - 0.9, WH - 0.6, PAINT)
                    Wl.box(x0 + so * 0.5, x0 + so * 0.76, ym - 0.3, ym + 0.3, WH - 0.95, WH - 0.88, COLDL)
                    points.append(((x0 + so * 1.2, ym, WH - 1.3), 160, (0.85, 0.92, 1.0)))
                    for k in range(3):
                        yy = ym + rnd.uniform(-0.3, 0.3)
                        Wl.box(x0 + so * 0.251, x0 + so * 0.26, yy - 0.05, yy + 0.05, rnd.uniform(1.5, 4.0), WH - 1.0, GRIME)
                Wl.box(x0 + so * 0.301, x0 + so * 0.31, t, t2, 0.0, 0.5, DAMP)
                Wl.box(x0 + so * 0.251, x0 + so * 0.26, t, t2, 0.5, 0.6 + rnd.uniform(0.0, 0.15), DAMP)
            t = t2
    wall_run(-WX, -WY, WX, -WY, gaps=((GX0, GX1),))
    wall_run(-WX, WY, WX, WY)
    wall_run(-WX, -WY, -WX, WY)
    wall_run(WX, -WY, WX, WY)
    for (x, y) in ((-WX, -WY), (WX, -WY), (-WX, WY), (WX, WY)):                         # 角部加厚
        Wl.boxc(x, y, 0, 2.0, 2.0, WH + 1.0, CONC_D)
        Wl.boxc(x, y, WH + 1.0, 2.3, 2.3, 0.25, PANEL)
    # 摄像杆（墙角 + 墙中段，朝外）
    def cam_pole(x, y, ax, ay):
        Wl.cyl(x, y, 0, 0.12, 8.5, PAINT, 10)
        Wl.box(x - 0.05, x + 0.05 + ax * 0.9, y - 0.05, y + 0.05 + ay * 0.9, 8.3, 8.4, PAINT) if ax >= 0 and ay >= 0 else \
            Wl.box(x + ax * 0.9 - 0.05, x + 0.05, y + ay * 0.9 - 0.05, y + 0.05, 8.3, 8.4, PAINT)
        cx, cy = x + ax * 0.9, y + ay * 0.9
        rbox(Wl, cx + ax * 0.15, cy + ay * 0.15, 8.1, 0.5 if ax else 0.22, 0.5 if ay else 0.22, 0.22, WHITEP,
             rx=(-0.35 * ay), ry=(0.35 * ax))
        Wl.boxc(cx, cy, 8.22, 0.62 if ax else 0.3, 0.62 if ay else 0.3, 0.04, PAINT)            # 遮阳罩
        Wl.boxc(cx + ax * 0.43, cy + ay * 0.43, 8.02, 0.06, 0.06, 0.06, RED)
    for (x, y, ax, ay) in ((-WX + 2, -WY + 1.5, 0, -1), (WX - 2, -WY + 1.5, 0, -1), (-WX + 2, WY - 1.5, 0, 1), (WX - 2, WY - 1.5, 0, 1),
                           (-20, -WY + 1.5, 0, -1), (40, -WY + 1.5, 0, -1), (-WX + 1.5, 0, -1, 0), (WX - 1.5, 0, 1, 0),
                           (0, WY - 1.5, 0, 1), (GX0 - 1.5, -WY + 1.5, 0, -1)):
        cam_pole(x, y, ax, ay)

    # ============================================================ 投光灯塔（props_lights）
    Li = Batch('props_lights')
    def mast(x, y, h, tgts):
        Li.cyl(x, y, 0, 0.35, h, PAINT, 12, r2=0.18)
        Li.boxc(x, y, 0, 1.1, 1.1, 0.4, CONC)
        Li.box(x - 1.6, x + 1.6, y - 0.1, y + 0.1, h - 0.1, h + 0.1, STEEL)
        Li.box(x - 0.1, x + 0.1, y - 1.6, y + 1.6, h - 0.1, h + 0.1, STEEL)
        for (dx, dy) in ((-1.3, 0), (1.3, 0), (0, -1.3), (0, 1.3)):
            rbox(Li, x + dx, y + dy, h + 0.4, 0.8, 0.8, 0.45, DARK, rx=0.4 * (1 if dy > 0 else -1 if dy < 0 else 0),
                 ry=-0.4 * (1 if dx > 0 else -1 if dx < 0 else 0))
            rbox(Li, x + dx * 1.05, y + dy * 1.05, h + 0.2, 0.66, 0.66, 0.05, COLDL, rx=0.4 * (1 if dy > 0 else -1 if dy < 0 else 0),
                 ry=-0.4 * (1 if dx > 0 else -1 if dx < 0 else 0))
        Li.boxc(x, y, h + 0.7, 0.14, 0.14, 0.14, RED)
        for t in tgts:
            spots.append(((x, y, h + 0.2), t, 90000, (0.86, 0.93, 1.0), 70))
    mast(-WX + 4, -WY + 4, 22, [(-35, -25, 0), (-50, -50, 0)])
    mast(WX - 4, -WY + 4, 22, [(40, -25, 0), (50, -52, 0)])
    mast(-WX + 4, WY - 4, 22, [(-35, 36, 0), (-50, 52, 0)])
    mast(WX - 4, WY - 4, 22, [(40, 42, 0), (52, 52, 0)])
    mast(0, -20, 24, [(15, -30, 0), (-10, -10, 0), (15, -5, 0)])
    # 缓冲街道路灯（外圈人行道上，钠灯）
    def street_lamp(x, y, ax, ay):
        Li.cyl(x, y, 0.1, 0.1, 7.5, PAINT, 8)
        Li.box(min(x, x + ax * 1.6) - 0.05, max(x, x + ax * 1.6) + 0.05, min(y, y + ay * 1.6) - 0.05, max(y, y + ay * 1.6) + 0.05, 7.4, 7.5, PAINT)
        Li.boxc(x + ax * 1.6, y + ay * 1.6, 7.25, 0.7 if ax else 0.3, 0.7 if ay else 0.3, 0.2, DARK)
        Li.boxc(x + ax * 1.6, y + ay * 1.6, 7.2, 0.6 if ax else 0.25, 0.6 if ay else 0.25, 0.05, COLDL)
        points.append(((x + ax * 1.6, y + ay * 1.6, 6.9), 900, (0.9, 0.93, 1.0)))
    for x in range(int(-OX) + 4, int(OX), 14):
        street_lamp(x, -OY - 1.5, 0, 1); street_lamp(x + 7, OY + 1.5, 0, -1)
    for x in range(int(-OX) + 11, int(OX), 14):                                   # 贫民窟边缘第二排路灯
        street_lamp(x, -OY - 4.0, 0, 1); street_lamp(x - 7, OY + 4.0, 0, -1)
    for y in range(int(-OY) + 3, int(OY) - 4, 14):
        street_lamp(-OX - 4.0, y, 1, 0); street_lamp(OX + 4.0, y, -1, 0)
    for y in range(int(-OY) + 10, int(OY) - 4, 14):
        street_lamp(-OX - 1.5, y, 1, 0); street_lamp(OX + 1.5, y, -1, 0)

    # ============================================================ 门岗（props_gate）：岗亭 + 道闸 + 推拉门 + 防撞柱 + 减速带
    Ga = Batch('props_gate')
    gz = -WY
    Ga.box(GX0 - 1.2, GX0, gz - 0.6, gz + 0.6, 0, WH + 1.5, CONC_D)                        # 门柱
    Ga.box(GX1, GX1 + 1.2, gz - 0.6, gz + 0.6, 0, WH + 1.5, CONC_D)
    Ga.box(GX0 - 1.2, GX1 + 1.2, gz - 0.5, gz + 0.5, WH + 0.6, WH + 1.5, PANEL)            # 门楣（空白）
    Ga.box(GX0, GX1, gz - 0.52, gz - 0.5, WH + 0.75, WH + 0.85, COLDL)
    # 推拉钢门（收在门内西侧墙后）
    Ga.box(GX0 - 13.5, GX0 + 0.5, gz + 0.5, gz + 0.62, 0.15, 4.2, SHEET_B)
    for x in range(0, 14, 2):
        Ga.box(GX0 - 13.4 + x, GX0 - 13.2 + x, gz + 0.62, gz + 0.72, 0.15, 4.2, PAINT)
    Ga.box(GX0 - 13.5, GX0 + 0.5, gz + 0.62, gz + 0.72, 4.05, 4.2, PAINT)
    Ga.box(GX0 - 14, GX0 + 1, gz + 0.3, gz + 0.9, 0, 0.12, STEEL)                           # 导轨
    # 岗亭（门内东侧，中岛上）：实墙 + 窄条窗 + 挑檐
    ix = (GX0 + GX1) / 2
    Ga.box(ix - 0.8, ix + 0.8, gz + 1, gz + 12, 0, 0.18, CONC)                              # 中岛
    Ga.box(ix - 0.7, ix + 0.7, gz + 1.2, gz + 1.9, 0.18, 0.9, HAZ)
    Ga.box(ix - 0.6, ix + 0.6, gz + 4, gz + 8, 0.18, 2.9, PANEL)
    Ga.box(ix - 0.62, ix + 0.62, gz + 4.4, gz + 7.6, 1.3, 2.2, GLASSL)
    Ga.box(ix - 0.61, ix + 0.61, gz + 3.98, gz + 4.02, 1.3, 2.2, GLASSL)
    Ga.box(ix - 1.4, ix + 1.4, gz + 3.4, gz + 8.6, 2.9, 3.15, PAINT)
    Ga.box(ix - 1.3, ix + 1.3, gz + 3.5, gz + 8.5, 2.88, 2.9, COLDL)
    points.append(((ix, gz + 6, 2.6), 300, (0.85, 0.92, 1.0)))
    # 大雨棚跨两条车道
    for (x, y) in ((GX0 + 0.3, gz + 3), (GX1 - 0.3, gz + 3), (GX0 + 0.3, gz + 11), (GX1 - 0.3, gz + 11)):
        Ga.boxc(x, y, 0, 0.35, 0.35, 5.5, STEEL)
    Ga.box(GX0, GX1, gz + 2.5, gz + 11.5, 5.5, 6.0, PAINT)
    Ga.box(GX0 + 0.3, GX1 - 0.3, gz + 2.8, gz + 11.2, 5.48, 5.5, WHITEP)
    for x in (GX0 + 2.5, GX0 + 5.0, GX1 - 5.0, GX1 - 2.5):
        Ga.box(x - 0.15, x + 0.15, gz + 3.5, gz + 10.5, 5.44, 5.48, COLDL)
    spots.append(((ix, gz + 7, 5.3), (ix, gz + 7, 0), 4000, (0.85, 0.92, 1.0), 120))
    points.append(((ix, gz + 6, 1.9), 120, (1.0, 0.85, 0.6)))                          # 岗亭室内暖光
    Ga.box(ix + 0.8, GX1, gz + 4.5, gz + 9.5, 0.0, 0.03, STEEL)                        # 车底查验板
    for x in (ix + 0.95, GX1 - 0.15):
        Ga.box(x - 0.05, x + 0.05, gz + 4.5, gz + 9.5, 0.03, 0.05, HAZ)
    for y in (gz + 5, gz + 9):                                                        # 查验灯柱
        Ga.boxc(GX1 - 0.6, y, 0, 0.3, 0.3, 1.6, PAINT)
        Ga.boxc(GX1 - 0.76, y, 1.2, 0.04, 0.22, 0.3, COLDL)
    Ga.box(ix - 0.62, ix + 0.62, gz + 4.4, gz + 7.6, 0.9, 1.0, DARK)                   # 窗台
    # 道闸（两条车道各一，一抬一落）
    for side, up in ((-1, False), (1, True)):
        bx = ix + side * 0.9
        Ga.boxc(bx, gz + 2.2, 0.18, 0.7, 0.5, 1.1, SHEET_B)
        Ga.boxc(bx, gz + 2.2, 0.18, 0.9, 0.7, 0.1, CONC)
        Ga.boxc(bx, gz + 2.2, 1.28, 0.52, 0.42, 0.06, PAINT)
        Ga.boxc(bx, gz + 2.2, 1.15, 0.12, 0.12, 0.12, GREEN if up else RED)
        L = 5.6
        if up:
            rbox(Ga, bx + side * 0.25, gz + 2.2, 1.0 + L / 2, 0.1, 0.1, L, HAZ_RW)
        else:
            Ga.box(min(bx, bx + side * L) , max(bx, bx + side * L), gz + 2.15, gz + 2.25, 0.95, 1.05, HAZ_RW)
            Ga.boxc(bx + side * (L - 0.2), gz + 2.2, 0.18, 0.08, 0.08, 0.8, PAINT)             # 落杆支架
    # 门外防撞柱 + 可升降路障 + 减速带
    for x in [GX0 - 1.2 - i * 1.6 for i in range(4)] + [GX1 + 1.2 + i * 1.6 for i in range(4)]:
        Ga.cyl(x, gz - 1.4, 0, 0.16, 1.0, STEEL, 12)
        Ga.cyl(x, gz - 1.4, 0.75, 0.165, 0.1, HAZ, 12)
    for x in range(int(GX0) + 1, int(GX1), 2):
        Ga.boxc(x + 0.5, gz - 0.9, 0, 1.4, 0.8, 0.08, STEEL)
    for yy in (gz - 5.5, gz + 13.5):
        for x in range(int(GX0), int(GX1), 1):
            Ga.box(x + 0.05, x + 0.95, yy, yy + 0.5, 0, 0.07, HAZ if (x % 2) else RUBBER)
    # 门外排队区：隔离水马
    for i in range(6):
        Ga.boxc(GX0 - 3 - i * 1.3, gz - 5.0, 0, 1.2, 0.45, 0.8, HAZ_RW if i % 2 else WHITEP)

    # ============================================================ 行政楼（walls_ext）
    Wx = Batch('walls_ext')
    AX0, AX1, AY0, AY1 = -52.0, -16.0, 2.0, 30.0
    FL, NF = 3.75, 6
    TOP = FL * NF
    Wx.box(AX0, AX1, AY0, AY1, 0, TOP, WIN)                                             # 核心立面（窗格贴图）
    for f in range(NF + 1):                                                              # 层间横带
        z = f * FL
        Wx.box(AX0 - 0.3, AX1 + 0.3, AY0 - 0.3, AY1 + 0.3, z - 0.35, z + 0.25, PANEL)
    x = AX0
    while x <= AX1 + 0.01:                                                               # 竖向遮阳翼
        Wx.box(x - 0.16, x + 0.16, AY0 - 1.1, AY0, 0.25, TOP, FIN)
        Wx.box(x - 0.16, x + 0.16, AY1, AY1 + 1.1, 0.25, TOP, FIN)
        x += 1.8
    y = AY0
    while y <= AY1 + 0.01:
        Wx.box(AX0 - 1.1, AX0, y - 0.16, y + 0.16, 0.25, TOP, FIN)
        Wx.box(AX1, AX1 + 1.1, y - 0.16, y + 0.16, 0.25, TOP, FIN)
        y += 1.8
    for f in range(NF):                                                                # 窗台线（每层两道横档）
        z = f * FL + 1.0
        Wx.box(AX0 - 0.15, AX1 + 0.15, AY0 - 0.15, AY1 + 0.15, z, z + 0.1, PAINT)
    # 实墙楼梯间（两端）+ 屋顶机房
    for (x0, x1) in ((AX0 - 1.0, AX0 + 5.0), (AX1 - 5.0, AX1 + 1.0)):
        Wx.box(x0, x1, AY0 - 1.0, AY0 + 5.5, 0, TOP + 3.5, CONC)
        Wx.box(x0 - 0.1, x1 + 0.1, AY0 - 1.1, AY0 + 5.6, TOP + 3.3, TOP + 3.6, PANEL)
    Wx.box(AX0 - 0.4, AX1 + 0.4, AY0 - 0.4, AY1 + 0.4, TOP, TOP + 1.1, PANEL)             # 女儿墙
    Wx.box(AX0 + 0.2, AX1 - 0.2, AY0 + 0.2, AY1 - 0.2, TOP + 0.3, TOP + 0.4, CONC_D)
    # 入口门廊（朝南，封闭的金属门扇）
    Wx.box(-42, -26, AY0 - 7, AY0, 4.2, 4.8, FIN)
    for x in (-41.5, -26.5):
        Wx.boxc(x, AY0 - 6.6, 0, 0.5, 0.5, 4.2, PAINT)
    Wx.box(-36, -32, AY0 - 0.1, AY0 + 0.05, 0.15, 3.0, SHEET_B)
    Wx.box(-34.03, -33.97, AY0 - 0.14, AY0 - 0.1, 0.15, 3.0, DARK)
    Wx.box(-42, -26, AY0 - 7.2, AY0 - 6.8, 4.2, 5.4, PAINT)                            # 雨棚钢框（同门岗）
    Wx.box(-42, -26, AY0 - 7.22, AY0 - 7.2, 4.9, 5.05, COLDL)
    for x in (-38, -35, -32, -30):
        Wx.box(x - 0.1, x + 0.1, AY0 - 4.5, AY0 - 0.5, 4.16, 4.2, COLDL)
    Wx.box(-41, -27, AY0 - 6, AY0, 0.0, 0.15, PANEL)
    spots.append(((-34, AY0 - 2.5, 4.1), (-34, AY0 - 3, 0), 3000, (0.9, 0.95, 1.0), 120))
    # 屋顶设备
    Rf = Batch('props_roof')
    for i, (x, y) in enumerate(((-44, 12), (-38, 12), (-32, 12), (-26, 20))):
        Rf.boxc(x, y, TOP + 0.4, 4.0, 3.0, 2.0, SHEET)
        Rf.cyl(x - 0.9, y, TOP + 2.4, 0.8, 0.5, PAINT, 16)
        Rf.cyl(x + 0.9, y, TOP + 2.4, 0.8, 0.5, PAINT, 16)
        Rf.cyl(x - 0.9, y, TOP + 2.85, 0.7, 0.05, DARK, 16)
        Rf.cyl(x + 0.9, y, TOP + 2.85, 0.7, 0.05, DARK, 16)
    for (x0, x1, y0, y1) in ((-47, -23, 9.8, 10.0), (-47, -23, 23.0, 23.2), (-47.2, -47, 9.8, 23.2), (-23.2, -23, 9.8, 23.2)):
        Rf.box(x0, x1, y0, y1, TOP + 1.1, TOP + 3.4, PAINT)                           # 设备围挡
    for x in range(-47, -22, 2):
        Rf.box(x - 0.04, x + 0.04, 9.7, 10.1, TOP + 1.1, TOP + 3.5, STEEL)
        Rf.box(x - 0.04, x + 0.04, 22.9, 23.3, TOP + 1.1, TOP + 3.5, STEEL)
    Rf.tube([(-46, 22, TOP + 0.8), (-30, 22, TOP + 0.8), (-30, 26, TOP + 0.8)], 0.3, STEEL, n=10)
    Rf.cyl(-48, 25, TOP + 0.4, 0.08, 7.0, STEEL, 8)                                      # 天线杆
    Rf.boxc(-48, 25, TOP + 7.4, 0.12, 0.12, 0.12, RED)
    Rf.boxc(-20, 8, TOP + 0.4, 3.0, 5.0, 1.5, SHEET)

    # ============================================================ 工坊厂房（props_works）+ 装卸月台 + 后勤场院
    Wk = Batch('props_works')
    HX0, HX1, HY0, HY1, HH = 2.0, 52.0, 10.0, 38.0, 13.0
    Wk.box(HX0, HX1, HY0, HY1, 0, 1.2, CONC)                                             # 混凝土勒脚
    for (P, U, V) in (((HX0, HY0, 1.2), (HX1 - HX0, 0, 0), (0, 0, HH - 1.2)),
                      ((HX1, HY1, 1.2), (HX0 - HX1, 0, 0), (0, 0, HH - 1.2)),
                      ((HX0, HY1, 1.2), (0, HY0 - HY1, 0), (0, 0, HH - 1.2)),
                      ((HX1, HY0, 1.2), (0, HY1 - HY0, 0), (0, 0, HH - 1.2))):
        corr(Wk, P, U, V, SHEET, 0.3, 0.06)
    Wk.box(HX0 + 0.05, HX1 - 0.05, HY0 + 0.05, HY1 - 0.05, 1.2, HH, DARK)                # 内衬（闭合体）
    for x in range(int(HX0), int(HX1) + 1, 6):                                            # 钢柱
        for y in (HY0 - 0.15, HY1 + 0.15):
            Wk.boxc(x, y, 0, 0.35, 0.3, HH + 0.3, PAINT)
    for y in range(int(HY0), int(HY1) + 1, 7):
        for x in (HX0 - 0.15, HX1 + 0.15):
            Wk.boxc(x, y, 0, 0.3, 0.35, HH + 0.3, PAINT)
    Wk.box(HX0 - 0.4, HX1 + 0.4, HY0 - 0.4, HY1 + 0.4, HH, HH + 0.5, PAINT)               # 檐口封边
    ym = (HY0 + HY1) / 2
    # 浅双坡屋面
    Wk.gable(HX0 - 0.3, HX1 + 0.3, HY0 - 0.3, HY1 + 0.3, HH + 0.5, 1.8, SHEET_B, along='x')
    # 屋脊通风器（连续的百叶罩 + 圆形风帽）
    Wk.box(HX0 + 3, HX1 - 3, ym - 1.2, ym + 1.2, HH + 2.2, HH + 3.2, SHEET)
    Wk.box(HX0 + 2.8, HX1 - 2.8, ym - 1.6, ym + 1.6, HH + 3.2, HH + 3.4, PAINT)
    for x in range(int(HX0) + 4, int(HX1) - 3, 2):
        for s in (-1, 1):
            Wk.box(x, x + 1.2, ym + s * 1.2 - 0.03, ym + s * 1.2 + 0.03, HH + 2.35, HH + 3.05, DARK)
    for x in (HX0 + 8, HX0 + 20, HX0 + 32, HX0 + 44):
        for yy in (HY0 + 5, HY1 - 5):
            Wk.cyl(x, yy, HH + 1.0, 0.7, 1.2, STEEL, 14)
            Wk.cyl(x, yy, HH + 2.2, 1.0, 0.5, STEEL, 14, r2=0.3)
    # 两根工艺排气筒
    for (x, y) in ((HX1 - 4, HY1 + 2.5), (HX1 - 8, HY1 + 2.5)):
        Wk.cyl(x, y, 0, 0.6, HH + 8, STEEL, 16)
        for z in (4, 9, 14, HH + 6):
            Wk.cyl(x, y, z, 0.68, 0.2, PAINT, 16)
        Wk.box(x - 0.1, x + 0.1, HY1, y, HH - 1, HH - 0.8, STEEL)
    for x in range(int(HX0), int(HX1), 2):
        Wk.box(x, x + 2, HY1 + 0.07, HY1 + 0.09, 1.2, 1.2 + rnd.uniform(0.4, 1.6), GRIME)
    # 装卸月台（南面）
    DY0 = HY0 - 6.0
    Wk.box(HX0 + 6, HX1 - 4, DY0, HY0, 0, 1.2, CONC)
    Wk.box(HX0 + 6, HX1 - 4, DY0 - 0.08, DY0 + 0.02, 0.9, 1.2, HAZ)
    Wk.box(HX0 + 6, HX1 - 4, DY0 + 0.4, HY0 + 0.2, 5.6, 5.9, PAINT)                        # 雨棚
    Wk.box(HX0 + 6.2, HX1 - 4.2, DY0 + 0.6, HY0, 5.58, 5.6, WHITEP)
    for x in range(int(HX0) + 8, int(HX1) - 4, 6):
        beam(Wk, (x, HY0, 8.5), (x, DY0 + 0.6, 5.9), 0.14, STEEL)                          # 斜拉杆
        Wk.box(x - 0.1, x + 0.1, DY0 + 1.0, HY0 - 0.5, 5.53, 5.58, COLDL)
    DOORS = [HX0 + 10 + i * 8 for i in range(5)]
    for dx in DOORS:
        spots.append(((dx, HY0 - 3, 5.4), (dx, DY0 - 3, 0), 2500, (0.88, 0.94, 1.0), 110))
    for i, dx in enumerate(DOORS):
        Wk.box(dx - 2.0, dx + 2.0, HY0 - 0.08, HY0 + 0.05, 1.2, 5.2, SHEET)                 # 卷帘门（关着）
        for z in (1.4 + k * 0.25 for k in range(15)):
            Wk.box(dx - 2.0, dx + 2.0, HY0 - 0.1, HY0 - 0.07, z, z + 0.03, PAINT)
        Wk.box(dx - 2.25, dx + 2.25, HY0 - 0.3, HY0 - 0.05, 5.2, 5.5, PAINT)
        # 门封（黑色软罩）
        Wk.box(dx - 2.4, dx - 2.1, HY0 - 1.0, HY0 - 0.05, 1.2, 5.4, RUBBER)
        Wk.box(dx + 2.1, dx + 2.4, HY0 - 1.0, HY0 - 0.05, 1.2, 5.4, RUBBER)
        Wk.box(dx - 2.4, dx + 2.4, HY0 - 1.0, HY0 - 0.05, 5.1, 5.5, RUBBER)
        for s in (-1, 1):                                                                  # 防撞胶块
            Wk.boxc(dx + s * 1.5, DY0 - 0.12, 0.3, 0.4, 0.25, 0.6, RUBBER)
        Wk.boxc(dx + 2.8, HY0 - 0.12, 2.4, 0.12, 0.1, 0.12, GREEN if i % 2 else RED)       # 泊位信号灯
        Wk.box(dx - 2, dx + 2, DY0 - 0.02, DY0 + 1.6, 1.2, 1.22, STEEL)                    # 升降过桥板
    # 月台台阶 + 栏杆
    for k in range(5):
        Wk.box(HX1 - 4, HX1 - 1.5, DY0 + k * 0.4, HY0, 0, 1.2 - k * 0.24, CONC)
    Wk.tube([(HX1 - 4, DY0, 2.2), (HX1 - 4, HY0 - 0.2, 2.2)], 0.04, HAZ, n=6)
    # 月台上的货箱 / 托盘
    def crate_stack(B, x, y, z, n):
        for k in range(n):
            B.boxc(x, y, z, 1.2, 1.0, 0.15, PALLET)
            B.boxc(x, y, z + 0.15, 1.1, 0.95, 0.9, CRATE)
            B.boxc(x, y, z + 0.15, 1.13, 0.98, 0.07, DARK)
            B.boxc(x, y, z + 0.98, 1.13, 0.98, 0.07, DARK)
            for o in (-0.3, 0.3):
                B.boxc(x + o, y, z + 0.22, 0.06, 1.0, 0.76, DARK)
                B.boxc(x, y + o, z + 0.22, 1.15, 0.06, 0.76, DARK)
            z += 1.05
    for (x, y, n) in ((HX0 + 14.5, DY0 + 2.5, 2), (HX0 + 15.8, DY0 + 2.5, 1), (HX0 + 22.5, DY0 + 3.5, 2), (HX0 + 30.6, DY0 + 2.2, 1),
                      (HX0 + 31.8, DY0 + 2.2, 2), (HX0 + 38.4, DY0 + 3.8, 1)):
        crate_stack(Wk, x, y, 1.2, n)
    # 后勤场院：储罐、变压器、发电机组、集装箱、管廊
    for (x, y, r, h) in ((48, -34, 2.6, 9.0), (48, -26, 2.6, 9.0), (40, -34, 2.0, 7.0)):
        Wk.cyl(x, y, 0, r + 0.3, 0.6, CONC, 20)
        Wk.cyl(x, y, 0.6, r, h, TANKM, 24)
        Wk.cyl(x, y, 0.6 + h, r, 0.8, TANKM, 24, r2=r * 0.3)
        for z in (2.5, 5.0, h - 1):
            Wk.cyl(x, y, z, r + 0.04, 0.12, PAINT, 24)
        Wk.box(x - r - 0.3, x - r - 0.2, y - 0.3, y + 0.3, 0.6, h + 0.6, STEEL)            # 爬梯
    Wk.box(30, 44, -42, -39.5, 0, 0.3, CONC)
    for i in range(3):                                                                     # 变压器
        x = 32 + i * 4.2
        Wk.boxc(x, -40.7, 0.3, 3.0, 1.8, 2.4, PAINT)
        for k in range(6):
            Wk.boxc(x - 1.2 + k * 0.48, -39.75, 0.6, 0.08, 0.3, 1.8, PAINT)
        for s in (-0.8, 0, 0.8):
            Wk.cyl(x + s, -40.7, 2.7, 0.1, 0.8, WHITEP, 10)
    for (x, y) in ((34, -24), (34, -18)):                                                  # 发电机组（集装箱式）
        Wk.boxc(x, y, 0, 10.0, 2.6, 2.8, CBOX[0])
        Wk.boxc(x + 3.8, y, 2.8, 1.2, 1.2, 1.2, STEEL)
        Wk.cyl(x + 3.8, y, 4.0, 0.25, 1.5, DARK, 10)
        for k in range(8):
            Wk.box(x - 4.5 + k * 1.1, x - 4.2 + k * 1.1, y - 1.32, y - 1.3, 0.4, 2.4, DARK)
    for i, (x, y) in enumerate(((47, -14), (47, -11.3), (40, -12.6))):
        Wk.boxc(x, y, 0, 6.0, 2.44, 2.6, CBOX[(i + 1) % 3])
    Wk.boxc(47, -12.6, 2.6, 6.0, 2.44, 2.6, CBOX[2])
    for y in (-30.0,):                                                                    # 管廊
        for x in range(26, 42, 5):
            Wk.boxc(x, y, 0, 0.3, 0.3, 4.2, STEEL)
            Wk.boxc(x, y, 4.2, 0.3, 2.0, 0.2, STEEL)
        for k, (r, m) in enumerate(((0.3, TANKM), (0.2, PAINT), (0.15, RUST))):
            Wk.tube([(26, y - 0.6 + k * 0.6, 4.4 + r), (45, y - 0.6 + k * 0.6, 4.4 + r)], r, m, n=10)
    # 院内绿化替代物：混凝土花池（空白，只做形体）
    for (x, y) in ((-44, -3), (-24, -3)):
        Wk.boxc(x, y, 0, 6, 1.6, 0.6, CONC)

    # ============================================================ 执法小队驻点（props_post）
    Po = Batch('props_post')
    PX0, PX1, PY0, PY1 = -56.0, -34.0, -41.0, -32.0
    Po.box(PX0, PX1, PY0, PY1, 0, 7.2, CONC)                                              # 两层营房
    for z in (0.0, 3.6):
        Po.box(PX0 - 0.2, PX1 + 0.2, PY0 - 0.2, PY1 + 0.2, z + 3.3, z + 3.6, PANEL)
    for x in [PX0 + 1.5 + k * 2.4 for k in range(9)]:                                      # 高窗带（窄条、磨砂亮）
        for z in (2.2, 5.8):
            Po.box(x, x + 1.4, PY1 - 0.02, PY1 + 0.06, z, z + 0.7, GLASSL)
            Po.box(x - 0.08, x + 1.48, PY1 + 0.06, PY1 + 0.22, z - 0.06, z, PANEL)
    Po.box(PX0 - 0.3, PX1 + 0.3, PY0 - 0.3, PY1 + 0.3, 7.2, 7.8, PANEL)
    Po.box(-47, -44, PY1 - 0.05, PY1 + 0.08, 0, 2.6, SHEET_B)                              # 门
    Po.box(-48, -43, PY1, PY1 + 2.0, 2.8, 3.0, PAINT)
    Po.box(-47.8, -43.2, PY1 + 0.2, PY1 + 1.8, 2.78, 2.8, COLDL)
    for (x, y) in ((-52, -36.5), (-40, -36.5)):
        Po.boxc(x, y, 7.8, 3.0, 2.2, 1.5, SHEET)
    Po.cyl(-37, -34, 7.8, 0.07, 5.0, STEEL, 8)
    Po.boxc(-37, -34, 12.8, 0.1, 0.1, 0.1, RED)
    # 车棚
    CX0, CX1, CY0, CY1 = -56.0, -30.0, -29.0, -19.0
    for x in range(int(CX0), int(CX1) + 1, 6 if False else 13):
        for y in (CY0, CY1):
            Po.boxc(x, y, 0, 0.3, 0.3, 4.6, STEEL)
    Po.box(CX0 - 0.5, CX1 + 0.5, CY0 - 0.5, CY1 + 0.5, 4.6, 4.9, PAINT)
    Po.box(CX0, CX1, CY0, CY1, 4.58, 4.6, WHITEP)
    for x in (-51, -43, -35):
        Po.box(x - 0.1, x + 0.1, CY0 + 1, CY1 - 1, 4.54, 4.58, COLDL)
        spots.append(((x, (CY0 + CY1) / 2, 4.4), (x, (CY0 + CY1) / 2, 0), 1500, (0.85, 0.92, 1.0), 120))
    for x in (-52.0, -47.0, -43.0, -39.0, -35.0):
        Po.box(x - 0.06, x + 0.06, CY0 + 0.5, CY1 - 0.5, 0.0, 0.015, WHITEP)
    Po.box(CX0, CX1, CY0 - 0.2, CY0, 0, 0.015, WHITEP)
    # 充电桩
    for x in (-49.5, -41.0, -37.0):
        Po.boxc(x, CY1 - 0.4, 0, 0.5, 0.35, 1.5, PAINT)
        Po.boxc(x, CY1 - 0.59, 1.0, 0.3, 0.02, 0.25, BLUE)
    # 巡逻悬浮车：深色流线机身、座舱罩、四个推进舱，停在着陆垫上（无标识、无武器）
    Ve = Batch('props_vehicles')
    def hover(x, y, rz=0.0):
        M = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rz, 4, 'Z')
        def P(px, py, pz): return tuple(M @ Vector((px, py, pz)))
        # 机身：拉长的扁椭球
        seg, rings = 24, 12
        verts = []
        for j in range(rings + 1):
            ph = math.pi * (1 - j / rings)
            for i in range(seg):
                a = i * math.tau / seg
                lx = 2.5 * math.sin(ph) * math.cos(a); ly = 1.05 * math.sin(ph) * math.sin(a)
                lz = 0.55 * math.cos(ph) * (1.0 if math.cos(ph) < 0 else 0.8)
                verts.append(P(lx, ly, 1.0 + lz))
        fs = [(j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i)
              for j in range(rings) for i in range(seg)]
        Ve.poly(verts, fs, NAVY, smooth=True)
        # 座舱罩
        verts = []
        for j in range(7):
            ph = math.pi / 2 * (1 - j / 6)
            for i in range(seg):
                a = i * math.tau / seg
                verts.append(P(0.3 + 1.1 * math.sin(ph) * math.cos(a), 0.72 * math.sin(ph) * math.sin(a), 1.3 + 0.45 * math.cos(ph)))
        fs = [(j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i)
              for j in range(6) for i in range(seg)]
        Ve.poly(verts, fs, GLASS, smooth=True)
        # 推进舱 ×4（短圆筒，轴竖直），支臂
        for (px, py) in ((-1.9, -1.35), (-1.9, 1.35), (1.7, -1.3), (1.7, 1.3)):
            wx, wy, _ = P(px, py, 0)
            Ve.cyl(wx, wy, 0.55, 0.55, 0.55, PAINT, 18)
            Ve.cyl(wx, wy, 0.54, 0.45, 0.02, BLUE, 18)
            Ve.cyl(wx, wy, 1.08, 0.5, 0.02, DARK, 18)
            beam(Ve, P(px * 0.6, py * 0.5, 0.95), P(px, py, 0.85), 0.16, PAINT)
        # 着陆撑脚
        for (px, py) in ((-1.2, -0.7), (-1.2, 0.7), (1.2, -0.7), (1.2, 0.7)):
            beam(Ve, P(px, py, 0.7), P(px * 1.05, py * 1.2, 0.05), 0.08, STEEL)
            wx, wy, _ = P(px * 1.05, py * 1.2, 0)
            Ve.cyl(wx, wy, 0.0, 0.18, 0.06, RUBBER, 10)
        # 灯：前白、后红、顶部蓝色信号条（熄灭态偏暗）
        for s in (-1, 1):
            rbox(Ve, *P(2.38, s * 0.5, 1.03), 0.1, 0.3, 0.08, COLDL, rz=rz)
        rbox(Ve, *P(-2.3, 0, 1.05), 0.12, 1.0, 0.1, RED, rz=rz)
        rbox(Ve, *P(-0.8, 0, 1.52), 0.3, 0.9, 0.1, WHITEL, rz=rz)
        rbox(Ve, *P(-0.8, 0, 1.47), 0.4, 1.0, 0.06, DARK, rz=rz)
    for x in (-49.5, -41.0, -37.0):
        hover(x, (CY0 + CY1) / 2, math.pi / 2)
    hover(-24.0, -10.0, 0.15)
    def van(x, y):
        Ve.box(x - 1.0, x + 1.0, y - 2.6, y + 2.6, 0.45, 2.4, NAVY)
        Ve.box(x - 0.95, x + 0.95, y + 1.4, y + 2.62, 1.4, 2.2, GLASS)
        Ve.box(x - 1.02, x + 1.02, y - 1.2, y + 1.3, 1.5, 2.1, GLASS)
        Ve.box(x - 0.4, x + 0.4, y + 0.2, y + 0.8, 2.4, 2.52, WHITEL)
        Ve.box(x - 1.05, x + 1.05, y + 2.6, y + 2.75, 0.4, 0.7, PAINT)
        for s in (-1, 1):
            Ve.box(x + s * 0.7 - 0.2, x + s * 0.7 + 0.2, y + 2.6, y + 2.64, 0.9, 1.05, COLDL)
            for py in (-1.7, 1.7):
                disc(Ve, x + s * 0.95, y + py, 0.4, 0.4, RUBBER, axis='x', t=0.25, n=16)
                disc(Ve, x + s * 1.08, y + py, 0.4, 0.22, RIM, axis='x', t=0.02, n=12)
    for i, x in enumerate((-4.0, -1.0, 2.0, 5.0)):                                   # 门外执法停车位（墙边港湾）
        G.box(x - 1.5 - 0.06, x - 1.5 + 0.06, -52.0, -45.5, -0.045, -0.04, WHITEP)
        if i < 3: van(x, -48.8)
    G.box(-5.5, 3.5, -52.06, -51.94, -0.045, -0.04, WHITEP)                                                             # 一辆停在院内车道边
    # 卡车（装卸月台前，一辆倒车靠台、一辆等候）
    def truck(x, y, rz, box_m):
        """箱式货车：独立驾驶室（斜前脸）+ 间隙 + 箱体（角柱、后卷帘门）+ 可见大梁 + 6 轮。车长沿本地 y，车头在 -y。"""
        M = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rz, 4, 'Z')
        def P(px, py, pz): return tuple(M @ Vector((px, py, pz)))
        ax_ = 'x' if abs(math.sin(rz)) < 0.5 else 'y'
        # 大梁 + 横梁 + 油箱 + 侧防护
        for sx in (-1, 1):
            rbox(Ve, *P(sx * 0.45, -1.3, 0.78), 0.14, 11.6, 0.28, DARK, rz=rz)
        for py in range(-6, 5, 2):
            rbox(Ve, *P(0, py, 0.78), 1.0, 0.1, 0.2, DARK, rz=rz)
        wx, wy, _ = P(1.0, -3.6, 0)
        Ve.cyl(wx, wy, 0.5, 0.3, 0.6, RIM, 14) if ax_ == 'y' else disc(Ve, wx, wy, 0.8, 0.3, RIM, axis='y', t=0.9, n=14)
        for sx in (-1, 1):
            rbox(Ve, *P(sx * 1.15, 0.2, 0.55), 0.05, 1.6, 0.12, HAZ, rz=rz)
        # 箱体（与驾驶室留 0.35 m 间隙）
        BY0, BY1, BZ0, BZ1 = -4.25, 4.6, 1.05, 3.85
        rbox(Ve, *P(0, (BY0 + BY1) / 2, (BZ0 + BZ1) / 2), 2.46, BY1 - BY0, BZ1 - BZ0, box_m, rz=rz)
        rbox(Ve, *P(0, (BY0 + BY1) / 2, BZ0 - 0.06), 2.5, BY1 - BY0, 0.12, PAINT, rz=rz)          # 底边梁
        for sx in (-1, 1):
            for py in (BY0, BY1):
                rbox(Ve, *P(sx * 1.24, py, (BZ0 + BZ1) / 2), 0.1, 0.1, BZ1 - BZ0 + 0.05, RIM, rz=rz)   # 角柱
            rbox(Ve, *P(sx * 1.24, (BY0 + BY1) / 2, BZ1), 0.08, BY1 - BY0, 0.1, RIM, rz=rz)            # 顶边
            for k in range(1, 7):
                rbox(Ve, *P(sx * 1.245, BY0 + k * (BY1 - BY0) / 7, (BZ0 + BZ1) / 2), 0.04, 0.06, BZ1 - BZ0, PAINT, rz=rz)
        for k in range(12):                                                                   # 后卷帘门
            rbox(Ve, *P(0, BY1 + 0.03, BZ0 + 0.15 + k * 0.22), 2.2, 0.04, 0.03, PAINT, rz=rz)
        rbox(Ve, *P(0, BY1 + 0.04, BZ0 + 0.1), 0.5, 0.04, 0.08, RIM, rz=rz)                       # 门把手
        rbox(Ve, *P(0, BY1 - 0.1, 0.4), 2.3, 0.14, 0.14, HAZ_RW, rz=rz)                          # 后防钻撞梁
        for sx in (-1, 1):
            rbox(Ve, *P(sx * 0.95, BY1 + 0.02, 0.85), 0.3, 0.05, 0.15, RED, rz=rz)
        # 驾驶室：y-z 截面（斜风挡）沿 x 挤出
        prof = [(-7.0, 0.85), (-4.6, 0.85), (-4.6, 3.35), (-6.15, 3.35), (-6.95, 2.25)]
        n = len(prof)
        vs = [P(sx * 1.2, py, pz) for sx in (-1, 1) for (py, pz) in prof]
        fs = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        Ve.poly(vs, fs, WHITEP)
        # 风挡（贴斜面外 2 cm）
        d = Vector((0, -0.8, -1.1)).normalized(); nn = Vector((0, -1.1, 0.8)).normalized() * 0.02
        q = [(-6.2, 3.28), (-6.88, 2.35)]
        g = [P(sx * 1.08, py + nn.y, pz + nn.z) for (py, pz) in q for sx in (-1, 1)]
        Ve.poly([g[0], g[1], g[3], g[2]], [(0, 1, 2, 3), (3, 2, 1, 0)], GLASS)
        for sx in (-1, 1):
            rbox(Ve, *P(sx * 1.21, -5.7, 2.75), 0.03, 1.0, 0.8, GLASS, rz=rz)                   # 侧窗
            rbox(Ve, *P(sx * 1.215, -4.85, 1.9), 0.02, 0.04, 2.0, DARK, rz=rz)                  # 门缝
            rbox(Ve, *P(sx * 1.215, -6.35, 1.75), 0.02, 0.04, 1.8, DARK, rz=rz)
            rbox(Ve, *P(sx * 1.23, -5.1, 1.9), 0.03, 0.2, 0.05, RIM, rz=rz)                     # 门把手
            rbox(Ve, *P(sx * 1.2, -5.0, 0.7), 0.3, 0.5, 0.06, RIM, rz=rz)                       # 踏板
            rbox(Ve, *P(sx * 1.5, -6.6, 2.7), 0.08, 0.12, 0.55, DARK, rz=rz)                    # 后视镜
            beam(Ve, P(sx * 1.2, -6.4, 2.9), P(sx * 1.5, -6.6, 2.9), 0.04, DARK)
            rbox(Ve, *P(sx * 0.8, -7.03, 1.25), 0.4, 0.05, 0.18, COLDL, rz=rz)                  # 大灯
        rbox(Ve, *P(0, -7.02, 1.6), 2.2, 0.04, 0.4, DARK, rz=rz)                                # 格栅带
        rbox(Ve, *P(0, -7.1, 0.75), 2.46, 0.24, 0.36, PAINT, rz=rz)                             # 保险杠
        # 6 轮（前单轴 + 后双轴），轮胎 + 轮辋 + 轮毂
        for py in (-6.0, 1.9, 3.2):
            for s in (-1, 1):
                wx, wy, _ = P(s * 1.02, py, 0)
                disc(Ve, wx, wy, 0.5, 0.5, RUBBER, axis=ax_, t=0.32, n=20)
                ox, oy, _ = P(s * 1.19, py, 0)
                disc(Ve, ox, oy, 0.5, 0.3, RIM, axis=ax_, t=0.02, n=16)
                disc(Ve, ox, oy, 0.5, 0.1, DARK, axis=ax_, t=0.03, n=10)
            rbox(Ve, *P(0, py, 0.5), 1.9, 0.1, 0.1, DARK, rz=rz)                                # 车桥
    truck(HX0 + 18, DY0 - 5.0, 0.0, TRL)
    truck(HX0 + 36, DY0 - 12.0, math.pi / 2, TRL)
    # 地面货物：几只周转箱 + 叉车托盘堆
    for (x, y, n) in ((HX0 + 6, DY0 - 3, 2), (HX0 + 7.3, DY0 - 3, 1), (HX0 + 44, DY0 - 2.5, 2)):
        crate_stack(Wk, x, y, 0.0, n)

    # ============================================================ 背景：铁皮屋、支撑柱、中层底面
    Bs = Batch('bg_slum')
    rb = random.Random(5)
    Bs.box(-400, 400, -400, 400, -0.6, -0.3, DIRT)
    IX, IY = OX + 4.5, OY + 4.5
    cells = []
    for gx in range(-40, 41):
        for gy in range(-36, 41):
            x, y = gx * 5.0 + rb.uniform(-0.6, 0.6), gy * 5.0 + rb.uniform(-0.6, 0.6)
            d = max(abs(x) - IX, abs(y) - IY)
            if d < 2.5 or d > 130: continue
            if gx % 6 == 0 or gy % 7 == 0: continue                                     # 巷道
            if rb.random() < 0.12 + d / 400: continue
            cells.append((x, y, d))
    for (x, y, d) in cells:
        sx_, sy_ = rb.uniform(3.6, 5.2), rb.uniform(3.6, 5.2)
        z = 0.0
        for lev in range(rb.randint(1, 2 if d < 12 else 3)):
            h = rb.uniform(2.4, 3.2)
            Bs.boxc(x, y, z, sx_, sy_, h, rb.choice([SHEET_R, SHEET_R, RUST, CBOX[1], SHEET]))
            if rb.random() < 0.5:
                side = rb.choice((-1, 1))
                Bs.boxc(x + rb.uniform(-sx_ / 4, sx_ / 4), y + side * (sy_ / 2 + 0.02), z + 1.0, rb.uniform(0.5, 1.0), 0.05, 0.6,
                        SHACKW if rb.random() < 0.7 else DARK)
            z += h
            sx_ *= rb.uniform(0.75, 1.0); sy_ *= rb.uniform(0.75, 1.0)
        rbox(Bs, x, y, z + 0.05, sx_ + 0.9, sy_ + 0.9, 0.08, rb.choice([SHEET_R, RUST]), rx=rb.uniform(-0.12, 0.12), ry=rb.uniform(-0.12, 0.12))
        if rb.random() < 0.3:
            Bs.tube([(x - sx_ / 2, y + sy_ / 2 + 0.3, z - 0.3), (x + sx_ / 2, y + sy_ / 2 + 0.3, z - 0.3)], 0.04, CABLE, n=4)
        if rb.random() < 0.025 and d < 60:
            points.append(((x, y + sy_ / 2 + 1, 2.4), 60, (1.0, 0.6, 0.3)))
    # 乱拉的电线
    for i in range(40):
        x, y = rb.uniform(-160, 160), rb.uniform(-150, 160)
        if abs(x) < IX + 2 and abs(y) < IY + 2: continue
        x2, y2 = x + rb.uniform(-12, 12), y + rb.uniform(-12, 12)
        Bs.tube([(x, y, 6), ((x + x2) / 2, (y + y2) / 2, 5.2), (x2, y2, 6)], 0.03, CABLE, n=4)
    # 巨型支撑柱
    for (x, y) in ((-110, 70), (105, 85), (-150, -40), (95, -95), (-75, 95), (0, 140), (-170, 0)):
        Bs.boxc(x, y, 0, 14, 14, UZ, CONC_D)
        Bs.boxc(x, y, 0, 17, 17, 4, CONC_D)
        Bs.boxc(x, y, UZ - 10, 20, 20, 10, CONC_D)
        for k in range(3):
            Bs.tube([(x + 7.3, y - 4 + k * 3, 0), (x + 7.3, y - 4 + k * 3, UZ)], 0.4, rb.choice([RUST, STEEL]), n=8)
        for z in (20, 50, 80, 110):
            Bs.box(x - 7.05, x + 7.05, y - 7.05, y + 7.05, z, z + 0.3, PAINT)
        points.append(((x, y - 8, 30), 800, (0.7, 0.8, 1.0)))
    # 中层底面：大板 + 主梁格 + 管线 + 零星灯
    Bu = Batch('bg_underside')
    Bu.box(-500, 500, -500, 500, UZ, UZ + 4, CONC_D)
    for k in range(-10, 11):
        Bu.box(k * 40 - 1.5, k * 40 + 1.5, -500, 500, UZ - 5, UZ, PAINT)
        Bu.box(-500, 500, k * 40 - 1.5, k * 40 + 1.5, UZ - 5, UZ, PAINT)
    for k in range(14):
        y = rb.uniform(-300, 300)
        Bu.tube([(-500, y, UZ - 6 - rb.uniform(0, 3)), (500, y, UZ - 6 - rb.uniform(0, 3))], rb.uniform(0.6, 1.6), rb.choice([RUST, STEEL]), n=10)
    for i in range(160):
        x, y = rb.uniform(-400, 400), rb.uniform(-400, 400)
        Bu.boxc(x, y, UZ - 5.4, 1.2, 1.2, 0.3, rb.choice([SODL, COLDL, SODL, WARML]))
    for (x, y) in ((-60, -40), (70, 30), (0, -120), (-140, 80), (150, -30)):
        points.append(((x, y, UZ - 8), 6000, (1.0, 0.7, 0.4)))

    Batch.build_all()

    # ------------------------------------------------------------ 世界 + 雾 + 灯光
    w = bpy.data.worlds.new('w'); sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs[0].default_value = (0.03, 0.033, 0.045, 1); bg.inputs[1].default_value = 0.3
    nt.links.new(bg.outputs[0], out.inputs[0])
    vs = nt.nodes.new('ShaderNodeVolumePrincipled')
    vs.inputs['Color'].default_value = (0.6, 0.62, 0.66, 1)
    vs.inputs['Density'].default_value = 0.0025
    nt.links.new(vs.outputs[0], out.inputs['Volume'])
    sc.cycles.volume_bounces = 0
    sc.cycles.volume_step_rate = 4.0
    # 院落整体的冷色补光（高处大面光，模拟一片投光）+ 远处暖色贫民窟泛光
    for (loc, e, sz, c) in (((0, 0, 60), 30000, 90, (0.8, 0.88, 1.0)), ((0, 0, UZ - 12), 6000, 400, (0.6, 0.65, 0.8))):
        ld = bpy.data.lights.new('area_%d' % e, 'AREA'); ld.energy = e; ld.size = sz; ld.color = c
        o = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(o); o.location = loc
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.1)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.4)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.6

    CAMS = {
        'c1': ((-95.0, -135.0, 70.0), (4.0, 10.0, 10.0), 24, 0.12, 1.5),
        'c2': ((24.5, -WY - 13.0, 2.3), (15.5, -WY + 4.0, 1.7), 24, 0.08, 1.5),
        'c3': ((HX0 + 4.0, DY0 - 17.0, 2.6), (HX0 + 26.0, HY0 - 1.0, 4.5), 20, 0.0, 1.5),
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
