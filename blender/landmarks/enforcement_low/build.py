"""执法局下层分局（下层地基区；纸面六个下层分局、实际只有三个在运转，地图上画其中一个）——只做外观。
一座加固但破旧的派出所式分局：3–4 层钢筋混凝土矮楼，窄条窗 + 防爆卷闸，东侧车辆闸口（双道门 sally port），
围栏车场（深色无标识巡逻厢式车 + 悬浮摩托），防撞柱，投光灯，摄像头，正面钢雨棚下的对外窗口；
被围困与失修的痕迹：抽象色块涂鸦（无字母）、补过的墙、一翼封木板、锈蚀铁丝网、积水。
四周是下层铁皮屋、巨型支撑柱和中层底面（bg_*）。
中立：无内部、无人物、无囚室 / 束缚、无武器、无文字 / 标志 / 徽章。

布局（米）：主楼 x -20..10、y 0..18，4 层 z 0..14.4（正面朝 -y）；西翼（封板）x -34..-20、y 2..15，2 层；
  对外窗口在主楼正面 x -12..-4；车场（围栏）x 12..42、y -8..22；闸口在车场南面 x 22..30（外门 y -8，内门 y -1）；
  前街 y -8..-24；再往外铁皮屋。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/enforcement_low/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/el.jpg [--blend /tmp/el.blend] [--log /tmp/el.log] [--exposure 0.9]
cam: c1 俯瞰 / c2 正面对外窗口 + 闸口 / c3 车场
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='night', res='900', samples='24', out='/tmp/el.jpg', blend='', log='', exposure=''))

BX0, BX1, BY0, BY1 = -20.0, 10.0, 0.0, 18.0
FL, NF = 3.6, 4
TOP = FL * NF
WX0, WX1, WY0, WY1, WH = -34.0, -20.0, 2.0, 15.0, 7.2
YX0, YX1, YY0, YY1 = 12.0, 42.0, -8.0, 22.0
GX0, GX1 = 22.0, 30.0
UZ = 120.0


def main():
    import bpy
    from mathutils import Matrix, Vector
    sc = C.setup(A['samples'])
    Batch = C.Batch
    rnd = random.Random(23)

    # ------------------------------------------------------------ 材质
    CONC = C.pbr('el_conc', 'concrete_wall_008', 4.0, tint=(0.55, 0.56, 0.56), sat=0.0, value=0.9, weather=1.0)
    CONC_D = C.pbr('el_conc_dark', 'concrete_wall_008', 5.0, tint=(0.34, 0.34, 0.35), sat=0.0, weather=0.9)
    CONC_P = C.pbr('el_conc_patch', 'smooth_concrete_floor', 2.0, tint=(0.66, 0.64, 0.6), sat=0.1, value=1.0, weather=0.4)
    ASPH = C.pbr('el_asphalt', 'asphalt_02', 2.0, tint=(0.3, 0.3, 0.31), sat=0.3, value=0.6)
    YARD = C.pbr('el_yard', 'hangar_concrete_floor', 3.0, tint=(0.4, 0.4, 0.4), sat=0.3, value=0.8, weather=0.3)
    DIRT = C.pbr('el_dirt', 'concrete_floor_worn_001', 5.0, tint=(0.28, 0.26, 0.23), sat=0.3, value=0.5, weather=1.0)
    STEEL = C.pbr('el_steel', 'Metal009', 2.0, tint=(0.36, 0.37, 0.38), sat=0.3, metal=0.8, rough_mul=1.2)
    PAINT = C.pbr('el_paint', 'Metal009', 2.0, tint=(0.24, 0.26, 0.27), sat=0.1, metal=0.3, rough_mul=1.3)
    SHUT = C.pbr('el_shutter', 'box_profile_metal_sheet', 1.2, tint=(0.4, 0.42, 0.42), sat=0.2, metal=0.5, weather=0.8, rot=1.5708)
    SHEET_R = C.pbr('el_sheet_rust', 'box_profile_metal_sheet', 2.5, tint=(0.5, 0.33, 0.22), sat=0.6, metal=0.3, weather=1.0)
    SHEET = C.pbr('el_sheet', 'box_profile_metal_sheet', 2.5, tint=(0.5, 0.52, 0.54), sat=0.0, metal=0.5, weather=0.6)
    RUST = C.flat('el_rust', (0.22, 0.11, 0.05), 0.8, metal=0.3, noise=0.6)
    PLY = C.flat('el_plywood', (0.2, 0.19, 0.17), 0.85, noise=0.5)
    PLATE = C.flat('el_plate_rust', (0.16, 0.09, 0.05), 0.8, metal=0.3, noise=0.6)
    REBAR = C.flat('el_rebar', (0.5, 0.2, 0.05), 0.7, metal=0.2, noise=0.4)
    RUBBER = C.pbr('el_rubber', 'Rubber004', 1.0, tint=(0.22, 0.22, 0.22), sat=0.2)
    HAZ = C.hazard('el_hazard', wear=0.6)
    HAZ_RW = C.hazard('el_hazard_rw', (0.6, 0.06, 0.04), (0.7, 0.68, 0.64), 0.35, wear=0.6)
    WHITEP = C.flat('el_line_w', (0.55, 0.55, 0.52), 0.6, noise=0.5)
    LANE = C.flat('el_line_y', (0.6, 0.46, 0.08), 0.6, noise=0.5)
    NAVY = C.flat('el_livery', (0.03, 0.035, 0.045), 0.35, metal=0.5, noise=0.2, coat=0.5)
    GLASS = C.glass('el_glass', (0.04, 0.05, 0.06), 0.06)
    SLIT = C.glass('el_slit_lit', (0.05, 0.05, 0.05), 0.2, emit=(1.0, 0.8, 0.55), estr=3.0)
    SLITD = C.glass('el_slit_dim', (0.04, 0.04, 0.04), 0.2, emit=(0.7, 0.75, 0.8), estr=0.35)
    HATCHG = C.glass('el_hatch', (0.05, 0.06, 0.06), 0.05, emit=(0.75, 0.85, 0.9), estr=0.6)
    CONC_P2 = C.pbr('el_conc_patch2', 'concrete_wall_008', 2.0, tint=(0.85, 0.8, 0.68), sat=0.2, value=1.3, weather=0.2)
    CONC_P3 = C.flat('el_conc_patch3', (0.07, 0.07, 0.075), 0.9, noise=0.4)
    RUBBLE = C.pbr('el_rubble', 'concrete_wall_008', 1.0, tint=(0.4, 0.4, 0.4), sat=0.0, weather=0.5)
    SAND = C.flat('el_hesco', (0.2, 0.18, 0.11), 0.95, noise=0.7)
    COUNTERL = C.glass('el_counter_lit', (0.06, 0.07, 0.07), 0.08, emit=(0.8, 0.9, 1.0), estr=6.0)
    DARK = C.flat('el_dark', (0.012, 0.012, 0.013), 0.8)
    CABLE = C.flat('el_cable', (0.02, 0.02, 0.02), 0.5)
    COLDL = C.flat('el_cold', (0.85, 0.92, 1), 0.3, emit=(0.85, 0.93, 1.0), estr=40.0)
    SODL = C.flat('el_sodium', (1, 0.6, 0.2), 0.3, emit=(1.0, 0.55, 0.18), estr=30.0)
    WARML = C.flat('el_warm', (1, 0.8, 0.5), 0.3, emit=(1.0, 0.72, 0.42), estr=6.0)
    RED = C.flat('el_red', (1, 0.1, 0.05), 0.3, emit=(1.0, 0.06, 0.03), estr=25.0)
    BLUE = C.flat('el_blue', (0.2, 0.4, 1), 0.3, emit=(0.2, 0.45, 1.0), estr=20.0)
    GREEN = C.flat('el_green', (0.1, 1, 0.3), 0.3, emit=(0.1, 1.0, 0.35), estr=20.0)
    GRIME = C.flat('el_grime', (0.05, 0.05, 0.048), 0.8, noise=0.7)
    DAMP = C.flat('el_damp', (0.07, 0.07, 0.07), 0.3, noise=0.5, coat=0.3)
    OIL = C.flat('el_oil', (0.012, 0.011, 0.01), 0.15, noise=0.3, coat=0.8)
    PUDDLE = C.flat('el_puddle', (0.06, 0.065, 0.07), 0.04, noise=0.1, coat=1.0)
    RIM = C.flat('el_rim', (0.45, 0.46, 0.48), 0.35, metal=0.9)
    MESH = C.flat('el_mesh', (0.3, 0.2, 0.13), 0.6, metal=0.6, noise=0.5)
    SMEAR = [C.flat('el_smear_%d' % i, c, 0.7, noise=0.8) for i, c in enumerate(
        ((0.55, 0.08, 0.1), (0.08, 0.35, 0.5), (0.6, 0.45, 0.05), (0.35, 0.1, 0.45), (0.1, 0.45, 0.2), (0.7, 0.3, 0.08)))]
    CBOX = [C.pbr('el_cont_%d' % i, 'box_profile_metal_sheet', 2.4, tint=t, sat=0.8, metal=0.4, weather=0.8)
            for i, t in enumerate(((0.36, 0.42, 0.44), (0.5, 0.3, 0.16), (0.3, 0.36, 0.28)))]
    SHACKW = C.glass('el_shackwin', (0.05, 0.04, 0.03), 0.2, emit=(1.0, 0.62, 0.3), estr=2.0)

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

    def wall_face(B, x0, x1, y, z0, z1, side, m, off=0.0):
        """贴在 y 平面墙外的薄片（side=-1 朝 -y）"""
        yy = y + side * (0.01 + off)
        B.box(x0, x1, yy, yy + side * 0.01, z0, z1, m)

    def wall_face_x(B, x, y0, y1, z0, z1, side, m, off=0.0):
        xx = x + side * (0.01 + off)
        B.box(xx, xx + side * 0.01, y0, y1, z0, z1, m)

    def smears(B, x0, x1, y, side, n, zmax=2.6, ax='y', wmul=1.0, zmin=0.3):
        """抽象喷漆涂鸦：宽幅不规则色块（有机轮廓）多色叠压 + 流挂，无字母、无图形"""
        def W(u, v, off):
            return (u, y + side * off, v) if ax == 'y' else (y + side * off, u, v)
        for i in range(n):
            c = rnd.uniform(x0 + 1.0, x1 - 1.0)
            w = rnd.uniform(1.8, 3.8) * wmul; h = rnd.uniform(0.7, min(1.6, zmax - 0.4)); zc = rnd.uniform(zmin + h / 2, zmax - h / 2)
            cols = rnd.sample(SMEAR, 3)
            for L in range(3):
                off = 0.012 + i * 0.004 + L * 0.0015
                cu, cv = c + rnd.uniform(-w / 4, w / 4), zc + rnd.uniform(-h / 5, h / 5)
                rw, rh = w / 2 * (1 - L * 0.22), h / 2 * (1 - L * 0.2)
                k = 16; ph = rnd.uniform(0, 6.28); tilt = rnd.uniform(-0.3, 0.3)
                pts = []
                for q in range(k):
                    a = q * math.tau / k
                    r = 1 + 0.22 * math.sin(3 * a + ph) + 0.12 * math.sin(5 * a + 2 * ph) + rnd.uniform(-0.08, 0.08)
                    du, dv = rw * r * math.cos(a), rh * r * math.sin(a)
                    pts.append(W(cu + du, max(0.05, cv + dv + du * tilt), off))
                B.poly(pts, [tuple(range(k))], cols[L])
                for d in range(rnd.randint(2, 4)):                                             # 流挂
                    u = cu + rnd.uniform(-rw * 0.7, rw * 0.7); v0 = cv - rh * 0.6; dl = rnd.uniform(0.25, 0.8)
                    a0, a1 = W(u - 0.025, max(0.05, v0 - dl), off + 0.0005), W(u + 0.025, v0, off + 0.0005)
                    B.box(min(a0[0], a1[0]), max(a0[0], a1[0]), min(a0[1], a1[1]), max(a0[1], a1[1]), a0[2], a1[2], cols[L])

    spots, points = [], []

    # ============================================================ 地面（site_ground）：前街、车场、积水、油渍
    G = Batch('site_ground')
    G.box(-44, 52, -24, 30, -0.25, -0.05, ASPH)
    G.box(YX0, YX1, YY0, YY1, -0.05, 0.0, YARD)
    G.box(-44, 52, -26.5, -24, -0.25, 0.12, CONC_D)                                            # 对面人行道
    G.box(-40, 10, -3.5, 0, -0.05, 0.15, CONC_D)                                               # 楼前台基
    for x in range(-40, 50, 7):
        G.box(x, x + 3, -16.1, -15.9, -0.05, -0.04, WHITEP)
    for i in range(26):
        x, y = rnd.uniform(-38, 48), rnd.uniform(-22, -4)
        G.box(x, x + rnd.uniform(1.5, 4), y, y + rnd.uniform(1, 2.5), -0.05, -0.045, CONC_P if i % 3 else DIRT)
    for i in range(14):                                                                      # 积水（镜面薄片，不规则多边形）
        x, y = rnd.uniform(-36, 46), rnd.uniform(-22, 20)
        if YX0 < x < YX1 or y < -4:
            n = 9; r = rnd.uniform(0.8, 2.6)
            vs = [(x + r * rnd.uniform(0.6, 1.2) * math.cos(k * math.tau / n), y + r * 0.6 * rnd.uniform(0.6, 1.2) * math.sin(k * math.tau / n),
                   0.012 if YX0 < x < YX1 and y > YY0 else -0.043) for k in range(n)]
            G.poly(vs, [tuple(range(n))], PUDDLE)
    def blob(x, y, z, r, m, k=12, sq=0.7):
        ph = rnd.uniform(0, 6.28)
        G.poly([(x + r * (1 + 0.3 * math.sin(3 * a + ph) + rnd.uniform(-0.1, 0.1)) * math.cos(a),
                 y + r * sq * (1 + 0.3 * math.sin(2 * a + ph) + rnd.uniform(-0.1, 0.1)) * math.sin(a), z)
                for a in (q * math.tau / k for q in range(k))], [tuple(range(k))], m)
    for i in range(30):                                                                      # 油渍（车位下、闸口、街面）
        x, y = rnd.choice(((rnd.uniform(YX0 + 2, YX1 - 2), rnd.uniform(14, 20)), (rnd.uniform(GX0, GX1), rnd.uniform(YY0 - 10, YY0 + 6)),
                           (rnd.uniform(-36, 46), rnd.uniform(-22, -6)), (rnd.uniform(YX0 + 1, YX1 - 2), rnd.uniform(YY0 + 1, 11))))
        blob(x, y, 0.006 if (YX0 < x < YX1 and y > YY0) else -0.04, rnd.uniform(0.5, 1.4), OIL)
    for i in range(16):                                                                      # 积水（大片，路边低洼）
        x, y = rnd.uniform(-38, 48), rnd.choice((rnd.uniform(-23, -18), rnd.uniform(-7, -4.6), rnd.uniform(-16, -10)))
        blob(x, y, -0.041, rnd.uniform(0.8, 2.2), PUDDLE, 14, 0.5)
    for i in range(6):
        blob(rnd.uniform(YX0 + 2, YX1 - 2), rnd.uniform(YY0 + 1, 11), 0.008, rnd.uniform(1.0, 2.2), PUDDLE, 14, 0.6)
    for x in range(int(YX0) + 2, int(YX1) - 1, 4):                                           # 车位线
        G.box(x - 0.06, x + 0.06, 12, 21, 0.0, 0.012, WHITEP)
    G.box(YX0 + 2, YX1 - 2, 11.9, 12.1, 0.0, 0.012, WHITEP)
    G.box(GX0, GX1, YY0 - 16, YY0, -0.05, -0.035, CONC_P)                                   # 车道补丁

    # ============================================================ 主楼 + 西翼（walls_ext）
    Wx = Batch('walls_ext')
    Wx.box(BX0, BX1, BY0, BY1, 0, TOP, CONC)
    Wx.box(BX0 - 0.4, BX1 + 0.4, BY0 - 0.4, BY1 + 0.4, 0, 1.4, CONC_D)                        # 加厚勒脚（斜面防撞）
    Wx.box(BX0 - 0.3, BX1 + 0.3, BY0 - 0.3, BY1 + 0.3, TOP, TOP + 1.0, CONC_D)                # 女儿墙
    for f in range(1, NF):
        z = f * FL
        Wx.box(BX0 - 0.15, BX1 + 0.15, BY0 - 0.15, BY1 + 0.15, z - 0.2, z + 0.1, CONC_D)
    for x in (BX0, BX0 + 10, BX0 + 20, BX1):                                                   # 扶壁
        Wx.box(x - 0.5, x + 0.5, BY0 - 0.8, BY0, 0, TOP + 0.6, CONC_D)
        Wx.box(x - 0.5, x + 0.5, BY1, BY1 + 0.8, 0, TOP + 0.6, CONC_D)
    # 窄条窗 + 防爆卷闸（部分放下）：正面 / 背面 / 东西面
    def slits(face, lo, hi, fixed, floors):
        """窄条射击孔式窗（0.4 m 宽，两两一组），约一半挂钢防爆板：全落 / 半落 / 开；卷闸导轨 + 锈痕"""
        s = -1 if face in ('S', 'W') else 1
        def B_(u0, u1, d0, d1, z0, z1, m):
            if face in ('S', 'N'):
                Wx.box(u0, u1, fixed + s * d0, fixed + s * d1, z0, z1, m)
            else:
                Wx.box(fixed + s * d0, fixed + s * d1, u0, u1, z0, z1, m)
        for f in floors:
            z = f * FL + 1.1
            t = lo + 1.6
            while t < hi - 1.6:
                if face == 'S' and f == 0 and -4.5 < t < 8.0:
                    t += 3.3; continue
                for u in (t, t + 0.8):
                    r = rnd.random()
                    state = 'full' if r < 0.3 else ('half' if r < 0.55 else 'open')
                    lit = state != 'full' and rnd.random() < 0.5
                    B_(u - 0.06, u + 0.46, -0.02, 0.12, z - 0.12, z + 1.52, CONC_D)                 # 深窗套
                    B_(u, u + 0.4, 0.0, 0.01, z, z + 1.4, (SLIT if rnd.random() < 0.5 else SLITD) if lit else DARK)
                    B_(u - 0.1, u - 0.04, 0.12, 0.2, z - 0.1, z + 1.75, STEEL)                    # 导轨
                    B_(u + 0.44, u + 0.5, 0.12, 0.2, z - 0.1, z + 1.75, STEEL)
                    B_(u - 0.12, u + 0.52, 0.1, 0.3, z + 1.5, z + 1.8, STEEL)                     # 卷闸箱
                    if state != 'open':
                        zb = z - 0.05 if state == 'full' else z + rnd.uniform(0.55, 0.95)
                        B_(u - 0.05, u + 0.45, 0.14, 0.18, zb, z + 1.5, SHUT)
                        B_(u - 0.05, u + 0.45, 0.14, 0.2, zb, zb + 0.06, STEEL)
                    rl = rnd.uniform(0.6, 2.2)                                                    # 锈痕
                    B_(u + 0.1, u + 0.18, 0.011, 0.016, max(0.2, z - 0.12 - rl), z - 0.12, RUST)
                    if rnd.random() < 0.5:
                        B_(u + 0.25, u + 0.29, 0.011, 0.016, max(0.2, z - 0.12 - rl * 0.6), z - 0.12, RUST)
                t += 3.3
    slits('S', BX0, BX1, BY0, range(NF))
    slits('N', BX0, BX1, BY1, range(NF))
    slits('E', BY0, BY1, BX1, range(NF))
    # 剥落的墙角：凹陷 + 外露锈钢筋
    for (x, y, z, sx, sy) in ((BX1, BY0, 2.2, 1, -1), (BX0, BY0, 6.0, -1, -1), (BX1, BY1, 9.5, 1, 1), (BX0 + 10, BY0 - 0.8, 1.5, 1, -1)):
        Wx.box(x - 0.55 * (sx < 0) - 0.02, x + 0.55 * (sx > 0) + 0.02, y - 0.5 * (sy < 0) - 0.02, y + 0.5 * (sy > 0) + 0.02, z, z + 1.3, CONC_D)
        for k in range(4):
            zz = z + 0.2 + k * 0.3
            Wx.tube([(x + sx * 0.1, y + sy * 0.05, zz), (x + sx * 0.35, y + sy * 0.12, zz + rnd.uniform(-0.1, 0.25))], 0.022, REBAR, n=5)
        Wx.tube([(x + sx * 0.08, y + sy * 0.08, z + 0.05), (x + sx * 0.08, y + sy * 0.08, z + 1.25)], 0.022, REBAR, n=5)
    # 雨痕 + 潮湿墙根带（四面）
    for (x0, x1, y, s) in ((BX0, BX1, BY0, -1), (BX0, BX1, BY1, 1)):
        wall_face(Wx, x0, x1, y, 1.4, 2.0 + rnd.uniform(0, 0.3), s, DAMP, 0.4)
        x = x0
        while x < x1:
            w = rnd.uniform(0.3, 1.2)
            wall_face(Wx, x, x + w, y, rnd.uniform(3, 10), TOP - 0.1, s, GRIME, 0.0)
            x += rnd.uniform(1.5, 3.5)
    for (x, s) in ((BX1, 1),):
        wall_face_x(Wx, x, BY0, BY1, 1.4, 2.1, s, DAMP, 0.4)
        y = BY0
        while y < BY1:
            w = rnd.uniform(0.3, 1.2)
            wall_face_x(Wx, x, y, y + w, rnd.uniform(3, 10), TOP - 0.1, s, GRIME)
            y += rnd.uniform(1.5, 3.5)
    # 补墙块（颜色不一的新混凝土）
    for i in range(14):
        x = rnd.uniform(BX0 + 1, BX1 - 3); z = rnd.uniform(1.5, TOP - 3)
        wall_face(Wx, x, x + rnd.uniform(1.0, 3.2), BY0, z, z + rnd.uniform(0.8, 2.4), -1, rnd.choice([CONC_P, CONC_P2, CONC_P3]), 0.005)
    for i in range(5):
        y = rnd.uniform(BY0 + 1, BY1 - 3); z = rnd.uniform(1.5, TOP - 3)
        wall_face_x(Wx, BX1, y, y + rnd.uniform(1.0, 3.2), z, z + rnd.uniform(0.8, 2.4), 1, rnd.choice([CONC_P, CONC_P2, CONC_P3]), 0.005)
    # 西翼：两层，窗口全用木板 / 钢板封死，屋顶塌了一角
    Wx.box(WX0, WX1, WY0, WY1, 0, WH, CONC_D)
    Wx.box(WX0 - 0.3, WX1, WY0 - 0.3, WY1 + 0.3, WH, WH + 0.6, CONC_D)
    for f in range(2):
        z = f * 3.6 + 1.0
        for x in [WX0 + 1.2 + k * 2.6 for k in range(5)]:
            Wx.box(x, x + 1.8, WY0 - 0.02, WY0 - 0.01, z, z + 1.6, DARK)
            for p in range(3):
                rbox(Wx, x + 0.9, WY0 - 0.05 - p * 0.02, z + 0.3 + p * 0.5, 2.1, 0.03, 0.45,
                     PLY if rnd.random() < 0.5 else PLATE, ry=rnd.uniform(-0.08, 0.08))
            for q in range(4):
                Wx.boxc(x + rnd.uniform(0.1, 1.7), WY0 - 0.12, z + rnd.uniform(0.1, 1.4), 0.04, 0.03, 0.04, RUST)
        for y in (WY0 + 2.5, WY0 + 7.0):
            Wx.box(WX0 - 0.02, WX0 - 0.01, y, y + 1.8, z, z + 1.6, DARK)
            rbox(Wx, WX0 - 0.06, y + 0.9, z + 0.8, 0.03, 2.1, 1.8, PLATE, rx=rnd.uniform(-0.05, 0.05))
    wall_face(Wx, WX0, WX1, WY0, 0.3, 1.3, -1, DAMP, 0.0)
    smears(Wx, WX0 + 3, WX0 + 7, WY0, -1, 1, 1.2)
    smears(Wx, WY0, WY1, WX0, -1, 1, 1.2, ax='x')
    # 楼前正面涂鸦（窗口两侧，底部）
    smears(Wx, BX0 + 0.5, -5.0, BY0 - 0.41, -1, 3, 1.4, wmul=1.6)
    smears(Wx, BX0 + 1, -6, BY0 - 0.31, -1, 2, 3.4, wmul=1.8, zmin=1.5)
    smears(Wx, 7.5, BX1 + 0.4, BY0 - 0.41, -1, 1, 1.4, wmul=1.0)
    smears(Wx, BY0 + 1, BY1 - 1, BX1 + 0.31, 1, 2, 3.4, ax='x', wmul=1.6, zmin=1.5)
    # 墙角附近的高反差补丁（c4 近景）
    for (x0, x1, z0, z1, m) in ((4.5, 7.2, 1.6, 3.1, CONC_P2), (6.8, 8.6, 3.4, 5.6, CONC_P3), (2.0, 4.0, 4.2, 5.4, CONC_P3), (7.0, 9.4, 0.3, 1.2, CONC_P2)):
        wall_face(Wx, x0, x1, BY0, z0, z1, -1, m, 0.18)
    for (y0, y1, z0, z1, m) in ((1.5, 4.0, 1.6, 3.2, CONC_P3), (4.5, 6.5, 3.8, 5.5, CONC_P2)):
        wall_face_x(Wx, BX1, y0, y1, z0, z1, 1, m, 0.18)
    smears(Wx, 7.5, BX1 + 0.5, BY0 - 0.4, -1, 1, 1.35)
    smears(Wx, BY0, BY1, BX1 + 0.4, 1, 3, 1.35, ax='x')
    smears(Wx, WY0, WY1, BX0 - 0.0, -1, 0, 1.35, ax='x')
    # 屋顶：机房、水箱、天线、沙袋墙式的矮护墙（混凝土块）
    Wx.box(-16, -9, 8, 15, TOP, TOP + 3.0, CONC)
    Wx.box(-16.2, -8.8, 7.8, 15.2, TOP + 3.0, TOP + 3.3, CONC_D)
    for (x, y) in ((0, 6), (4, 6)):
        Wx.boxc(x, y, TOP, 2.6, 1.8, 1.4, SHEET)
        Wx.cyl(x, y, TOP + 1.4, 0.7, 0.3, PAINT, 12)
    Wx.cyl(6, 14, TOP, 1.4, 2.6, RUST, 14)
    Wx.cyl(-4, 14, TOP, 0.07, 8.0, STEEL, 6)
    Wx.boxc(-4, 14, TOP + 8.0, 0.14, 0.14, 0.14, RED)

    # ============================================================ 对外窗口（props_counter）：钢板包覆墙段 + 厚玻璃递物窗 + 托盘槽 + 钢雨棚
    Co = Batch('props_counter')
    cx0, cx1 = -4.0, 7.0
    for k in range(6):                                                                         # 钢板墙段（错缝钢板 + 压条 + 铆钉带）
        x0 = cx0 + k * (cx1 - cx0) / 6
        Co.box(x0 + 0.02, x0 + (cx1 - cx0) / 6 - 0.02, BY0 - 0.12, BY0, 0.0, 4.0, SHUT if k % 2 else STEEL)
        Co.box(x0 - 0.04, x0 + 0.04, BY0 - 0.16, BY0, 0.0, 4.0, PAINT)
        for zz in (0.6, 2.0, 3.4):
            Co.box(x0 + 0.1, x0 + (cx1 - cx0) / 6 - 0.1, BY0 - 0.15, BY0 - 0.12, zz, zz + 0.05, RUST if rnd.random() < 0.4 else PAINT)
    Co.box(cx0 - 0.1, cx1 + 0.1, BY0 - 0.2, BY0, 0.0, 0.5, CONC_D)
    hx = cx0 + 3.0
    Co.box(hx - 0.9, hx + 0.9, BY0 - 0.45, BY0 - 0.12, 0.9, 2.2, STEEL)                        # 递物窗厚框
    Co.box(hx - 0.6, hx + 0.6, BY0 - 0.2, BY0 - 0.16, 1.2, 2.0, DARK)
    Co.box(hx - 0.58, hx + 0.58, BY0 - 0.47, BY0 - 0.43, 1.22, 1.98, HATCHG)                   # 厚玻璃（微亮，内侧暗）
    Co.box(hx - 0.02, hx + 0.02, BY0 - 0.5, BY0 - 0.46, 1.22, 1.98, STEEL)
    Co.box(hx - 0.75, hx + 0.75, BY0 - 1.0, BY0 - 0.45, 0.95, 1.05, STEEL)                     # 托盘台
    Co.box(hx - 0.45, hx + 0.45, BY0 - 0.9, BY0 - 0.45, 1.05, 1.1, RIM)                        # 托盘
    Co.box(hx - 0.45, hx + 0.45, BY0 - 0.5, BY0 - 0.45, 1.05, 1.18, DARK)                      # 槽口
    for s_ in (-1, 1):
        beam(Co, (hx + s_ * 0.7, BY0 - 0.45, 0.7), (hx + s_ * 0.7, BY0 - 0.95, 0.97), 0.05, STEEL)
    Co.box(hx - 0.95, hx + 0.95, BY0 - 0.55, BY0 - 0.12, 2.2, 2.35, STEEL)                      # 窗顶挡板
    # 钢门（关）
    dx0 = cx0 + 6.5
    Co.box(dx0, dx0 + 1.4, BY0 - 0.22, BY0 - 0.12, 0.0, 2.4, SHUT)
    Co.box(dx0 - 0.15, dx0 + 1.55, BY0 - 0.3, BY0 - 0.12, 2.4, 2.6, STEEL)
    Co.box(dx0 + 1.2, dx0 + 1.3, BY0 - 0.28, BY0 - 0.22, 1.0, 1.1, RIM)
    # 钢雨棚：厚钢板 + 两道工字钢边梁 + 两根钢柱 + 拉杆
    Co.box(cx0 - 0.5, cx1 + 0.5, BY0 - 3.6, BY0, 3.6, 3.75, STEEL)
    for yy in (BY0 - 3.6, BY0 - 1.8):
        Co.box(cx0 - 0.5, cx1 + 0.5, yy - 0.08, yy + 0.08, 3.35, 3.6, PAINT)
        Co.box(cx0 - 0.5, cx1 + 0.5, yy - 0.15, yy + 0.15, 3.3, 3.35, PAINT)
    Co.box(cx0 - 0.5, cx1 + 0.5, BY0 - 3.7, BY0 - 3.55, 3.3, 4.1, SHUT)                       # 前挡板
    for x in (cx0 - 0.2, cx1 + 0.2):
        Co.box(x - 0.12, x + 0.12, BY0 - 3.5, BY0 - 3.26, 0.0, 3.3, PAINT)
        Co.box(x - 0.25, x + 0.25, BY0 - 3.63, BY0 - 3.13, 0.0, 0.1, STEEL)
        beam(Co, (x, BY0, 6.2), (x, BY0 - 3.4, 3.75), 0.07, STEEL)
    # 雨棚下两盏笼罩壁灯（无灯带）
    for x in (hx, dx0 + 0.7):
        Co.boxc(x, BY0 - 0.3, 2.8, 0.36, 0.3, 0.3, DARK)
        Co.boxc(x, BY0 - 0.46, 2.84, 0.24, 0.02, 0.2, WARML)
        for k in range(4):
            Co.box(x - 0.2 + k * 0.13, x - 0.18 + k * 0.13, BY0 - 0.5, BY0 - 0.47, 2.78, 3.12, STEEL)
        points.append(((x, BY0 - 0.9, 2.7), 90, (1.0, 0.78, 0.5)))
    spots.append(((hx, BY0 - 2.0, 3.25), (hx, BY0 - 1.5, 0), 900, (0.9, 0.93, 1.0), 100))
    points.append(((hx, BY0 + 0.6, 1.6), 25, (0.8, 0.9, 1.0)))
    for k in range(3):
        Co.box(cx0, cx1, BY0 - 3.4 - k * 0.35, BY0 - 3.05 - k * 0.35, 0, 0.15 - k * 0.05, CONC_D)

    # ============================================================ 闸口（props_gate）：两道推拉钢门 + 中间待检区 + 道闸 + 岗亭
    Ga = Batch('props_gate')
    def slide_gate(x0, yy, open_by=0.0, solid=True):
        x0 += open_by; x1 = x0 + (GX1 - GX0) + 0.6
        Ga.box(x0, x1, yy - 0.08, yy + 0.08, 0.35, 0.5, STEEL)                                   # 下框
        Ga.box(x0, x1, yy - 0.08, yy + 0.08, 3.9, 4.05, STEEL)                                   # 上框
        for x in (x0, x1 - 0.15, (x0 + x1) / 2):
            Ga.box(x, x + 0.15, yy - 0.08, yy + 0.08, 0.35, 4.05, STEEL)
        Ga.box(x0 + 0.1, x1 - 0.1, yy - 0.04, yy + 0.04, 0.5, 2.3 if not solid else 3.9, SHUT)  # 钢板
        if not solid:
            x = x0 + 0.25
            while x < x1 - 0.2:
                Ga.box(x, x + 0.05, yy - 0.03, yy + 0.03, 2.3, 3.9, STEEL); x += 0.22
        beam(Ga, (x0 + 0.1, yy, 0.5), (x1 - 0.2, yy, 3.9), 0.1, STEEL)                            # 斜撑
        for x in (x0 + 0.6, x1 - 0.6):                                                               # 滚轮
            disc(Ga, x, yy, 0.2, 0.18, RUBBER, axis='y', t=0.12, n=12)
        Ga.box(x0 + 0.5, x0 + 1.5, yy - 0.12, yy - 0.08, 0.6, 1.2, HAZ)
    for (yy, ob, solid) in ((YY0, 5.6, False), (YY0 + 7.0, 0.0, True)):
        Ga.box(GX0 - 1.2, GX0, yy - 0.5, yy + 0.5, 0, 5.4, CONC_D)                                # 门柱
        Ga.box(GX1, GX1 + 1.2, yy - 0.5, yy + 0.5, 0, 5.4, CONC_D)
        Ga.box(GX0 - 1.2, GX1 + 1.2, yy - 0.5, yy + 0.5, 4.6, 5.4, CONC_D)                        # 门楣
        wall_face(Ga, GX0 - 1.2, GX1 + 1.2, yy - 0.5, 4.6, 5.4, -1, GRIME, 0.0)
        Ga.box(GX0 - 0.3, GX1 + 6.5, yy - 0.3, yy + 0.3, 0.0, 0.1, STEEL)                          # 地轨
        slide_gate(GX0 - 0.3, yy - 0.75 if ob else yy + 0.0, ob, solid)
        Ga.boxc(GX1 + 0.6, yy - 0.55, 4.0, 0.12, 0.1, 0.12, GREEN if ob else RED)
        for x in (GX0 - 0.7, GX1 + 0.7):
            Ga.box(x - 0.2, x + 0.2, yy - 0.52, yy - 0.5, 0.0, 1.2, HAZ)
    # 外门打开一段时收进的挡墙（门外东侧）
    Ga.box(GX1 + 1.2, GX1 + 7.0, YY0 - 0.4, YY0 + 0.2, 0, 4.4, CONC)
    wall_face(Ga, GX1 + 1.2, GX1 + 7.0, YY0 - 0.4, 0.0, 0.8, -1, DAMP)
    # 待检区：两侧高墙 + 地面黄框 + 顶部照明
    for x in (GX0 - 0.6, GX1 + 0.6):
        Ga.box(x - 0.3, x + 0.3, YY0 + 0.5, YY0 + 6.5, 0, 4.6, CONC)
        wall_face_x(Ga, x + 0.3, YY0 + 0.5, YY0 + 6.5, 0, 0.9, 1, DAMP)
    Ga.box(GX0 + 0.3, GX1 - 0.3, YY0 + 0.8, YY0 + 0.95, 0.0, 0.015, LANE)
    Ga.box(GX0 + 0.3, GX1 - 0.3, YY0 + 6.05, YY0 + 6.2, 0.0, 0.015, LANE)
    Ga.box(GX0 + 0.3, GX0 + 0.45, YY0 + 0.8, YY0 + 6.2, 0.0, 0.015, LANE)
    Ga.box(GX1 - 0.45, GX1 - 0.3, YY0 + 0.8, YY0 + 6.2, 0.0, 0.015, LANE)
    for k in range(6):
        Ga.box(GX0 + 1 + k * 1.1, GX0 + 1.5 + k * 1.1, YY0 + 0.8, YY0 + 6.2, 0.0, 0.012, HAZ) if False else None
    for x in (GX0 - 0.3, GX1 + 0.3):
        Ga.boxc(x, YY0 + 3.5, 4.2, 0.3, 0.8, 0.3, DARK)
        Ga.boxc(x + (0.16 if x < GX0 else -0.16), YY0 + 3.5, 4.1, 0.02, 0.6, 0.2, COLDL)
        spots.append(((x + (0.5 if x < GX0 else -0.5), YY0 + 3.5, 4.2), ((GX0 + GX1) / 2, YY0 + 3.5, 0), 1500, (0.85, 0.92, 1.0), 100))
    # 岗亭（外门西侧，防弹窄窗）
    Ga.box(GX0 - 4.7, GX0 - 1.4, YY0 - 3.2, YY0 - 0.6, 0, 3.0, CONC)
    Ga.box(GX0 - 4.3, GX0 - 3.9, YY0 - 3.22, YY0 - 3.2, 1.4, 2.2, SLIT)
    Ga.box(GX0 - 1.42, GX0 - 1.4, YY0 - 2.2, YY0 - 1.8, 1.4, 2.2, SLIT)
    Ga.box(GX0 - 4.9, GX0 - 1.2, YY0 - 3.4, YY0 - 0.4, 3.0, 3.3, PAINT)
    smears(Ga, GX0 - 4.7, GX0 - 1.4, YY0 - 3.2, -1, 1, 1.6)
    points.append(((GX0 - 2.8, YY0 - 1.9, 2.2), 40, (1.0, 0.8, 0.5)))
    # 道闸（落下，外门前）
    Ga.boxc(GX0 - 0.8, YY0 - 3.0, 0, 0.5, 0.4, 1.1, PAINT)
    Ga.box(GX0 - 0.8, GX1 - 0.3, YY0 - 3.05, YY0 - 2.95, 0.95, 1.05, HAZ_RW)
    Ga.boxc(GX1 - 0.4, YY0 - 3.0, 0, 0.1, 0.1, 0.95, PAINT)
    Ga.boxc(GX0 - 0.8, YY0 - 3.0, 1.1, 0.12, 0.12, 0.12, RED)

    # ============================================================ 车场围栏（props_motorpool）：锈铁丝网 + 刺网 + 车棚 + 充电桩
    Mp = Batch('props_motorpool')
    def fence(x0, y0, x1, y1, h=3.4, pitch=0.32):
        L = math.hypot(x1 - x0, y1 - y0); n = max(1, int(L / 3.0))
        dx, dy = (x1 - x0) / L, (y1 - y0) / L
        def Q(s_, z): return (x0 + dx * s_, y0 + dy * s_, z)
        for i in range(n + 1):
            px, py = x0 + dx * L * i / n, y0 + dy * L * i / n
            Mp.cyl(px, py, 0, 0.05, h + 0.6, RUST if i % 3 else STEEL, 6)
            beam(Mp, (px, py, h), (px - dy * 0.4, py + dx * 0.4, h + 0.5), 0.04, STEEL)       # 外倾臂
        # 菱形铁丝网：两组 45° 细钢丝（真几何，可导出）
        c = -h
        while c < L:
            for sg in (1, -1):
                # sg=1: s = z + c ; sg=-1: s = c + h - z
                za, zb = max(0.05, -c if sg == 1 else c + h - L), min(h, L - c if sg == 1 else c + h)
                if zb - za > 0.05:
                    sa = za + c if sg == 1 else c + h - za
                    sb = zb + c if sg == 1 else c + h - zb
                    beam(Mp, Q(sa, za), Q(sb, zb), 0.022, MESH)
            c += pitch
        for z in (0.05, h * 0.5, h):
            Mp.tube([(x0, y0, z), (x1, y1, z)], 0.025, RUST, n=5)
        for k in range(3):                                                                    # 刺网卷
            Mp.tube([(x0 - dy * (0.15 + k * 0.12), y0 + dx * (0.15 + k * 0.12), h + 0.15 + k * 0.15),
                     (x1 - dy * (0.15 + k * 0.12), y1 + dx * (0.15 + k * 0.12), h + 0.15 + k * 0.15)], 0.012, STEEL, n=4)
    fence(YX0, YY0 + 7.0, YX0, YY1)
    fence(YX0, YY1, YX1, YY1)
    fence(YX1, YY1, YX1, YY0)
    fence(YX1, YY0, GX1 + 1.0, YY0)
    fence(GX0 - 1.0, YY0, YX0 + 3, YY0)
    # 车场一段网被补上铁皮
    Mp.box(YX1 - 0.06, YX1 - 0.02, 2.0, 7.0, 0.05, 2.6, SHEET_R)
    Mp.box(YX1 - 0.08, YX1 - 0.04, 5.0, 9.0, 0.3, 2.2, SHEET_R)
    # 车棚（北侧）
    for x in range(int(YX0) + 2, int(YX1), 7):
        for y in (13.0, 21.2):
            Mp.boxc(x, y, 0, 0.3, 0.3, 4.2, STEEL)
    Mp.box(YX0 + 1.5, YX1 - 1.5, 12.6, 21.6, 4.2, 4.4, PAINT)
    Mp.poly([(YX0 + 1.5, 12.4, 4.4), (YX1 - 1.5, 12.4, 4.4), (YX1 - 1.5, 21.8, 4.9), (YX0 + 1.5, 21.8, 4.9)], [(0, 1, 2, 3)], SHEET_R)
    for x in (YX0 + 6, YX0 + 15, YX0 + 24):
        Mp.box(x - 0.1, x + 0.1, 14, 20, 4.16, 4.2, COLDL)
        spots.append(((x, 17, 4.0), (x, 16, 0), 2500, (0.85, 0.92, 1.0), 120))
    # 充电桩
    for x in (YX0 + 4, YX0 + 12, YX0 + 20, YX0 + 28):
        Mp.boxc(x, 21.0, 0, 0.5, 0.35, 1.5, PAINT)
        Mp.boxc(x, 20.81, 1.0, 0.3, 0.02, 0.25, GREEN if x % 8 else RED)
        Mp.tube([(x, 20.8, 0.9), (x + 0.3, 20.4, 0.3), (x + 0.6, 20.3, 0.05)], 0.025, CABLE, n=5)
    # 油桶 / 轮胎堆 / 工具箱
    for (x, y) in ((YX1 - 2.0, 1.0), (YX1 - 2.8, 1.2), (YX1 - 2.3, 1.9)):
        Mp.cyl(x, y, 0, 0.3, 0.9, rnd.choice([RUST, CBOX[0], CBOX[2]]), 12)
    for k in range(4):
        Mp.cyl(YX1 - 2.0, 4.0, k * 0.25, 0.45, 0.24, RUBBER, 14)
    Mp.boxc(YX0 + 2.5, 2.0, 0, 1.2, 0.6, 1.0, CBOX[1])

    # ============================================================ 车辆（props_vehicles）：厢式巡逻车 + 悬浮摩托
    Ve = Batch('props_vehicles')
    def van(x, y, rz, dirty=0):
        """厢式车：侧截面（斜前脸 + 风挡）沿车宽挤出；车头在本地 -y。"""
        M = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rz, 4, 'Z')
        def P(px, py, pz): return tuple(M @ Vector((px, py, pz)))
        ax_ = 'x' if abs(math.sin(rz)) < 0.5 else 'y'
        prof = [(-2.65, 0.4), (2.6, 0.4), (2.6, 2.35), (-1.35, 2.35), (-2.35, 1.35), (-2.7, 1.1)]
        n = len(prof)
        vs = [P(sx * 0.98, py, pz) for sx in (-1, 1) for (py, pz) in prof]
        fs = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        Ve.poly(vs, fs, NAVY)
        # 风挡
        g = [P(sx * 0.88, py - 0.02, pz) for (py, pz) in ((-1.4, 2.28), (-2.28, 1.42)) for sx in (-1, 1)]
        Ve.poly([g[0], g[1], g[3], g[2]], [(0, 1, 2, 3), (3, 2, 1, 0)], GLASS)
        for sx in (-1, 1):
            rbox(Ve, *P(sx * 0.99, -1.1, 1.85), 0.02, 1.0, 0.6, GLASS, rz=rz)                     # 侧窗
            rbox(Ve, *P(sx * 0.995, -0.45, 1.3), 0.02, 0.04, 1.8, DARK, rz=rz)                    # 门缝
            rbox(Ve, *P(sx * 0.995, 0.9, 1.3), 0.02, 0.04, 1.8, DARK, rz=rz)                      # 侧滑门缝
            rbox(Ve, *P(sx * 1.12, -1.55, 1.9), 0.06, 0.1, 0.3, DARK, rz=rz)                      # 后视镜
            rbox(Ve, *P(sx * 0.65, -2.72, 1.0), 0.35, 0.04, 0.15, COLDL, rz=rz)                   # 大灯
            rbox(Ve, *P(sx * 0.8, 2.62, 1.4), 0.12, 0.03, 0.4, RED, rz=rz)                        # 尾灯
            rbox(Ve, *P(sx * 0.99, 1.0, 1.9), 0.02, 2.4, 0.3, DARK, rz=rz)                        # 厢体侧窗（钢网封）
            for py in (-1.7, 1.8):
                wx, wy, _ = P(sx * 0.9, py, 0)
                disc(Ve, wx, wy, 0.38, 0.38, RUBBER, axis=ax_, t=0.24, n=16)
                ox, oy, _ = P(sx * 1.03, py, 0)
                disc(Ve, ox, oy, 0.38, 0.2, RIM, axis=ax_, t=0.02, n=10)
                rbox(Ve, *P(sx * 0.98, py, 0.8), 0.04, 1.0, 0.1, DARK, rz=rz)                     # 轮拱
        rbox(Ve, *P(0, -2.72, 0.6), 2.0, 0.2, 0.3, PAINT, rz=rz)                                  # 前保险杠 + 推杆
        rbox(Ve, *P(0, -2.9, 0.9), 1.6, 0.08, 0.6, STEEL, rz=rz)
        rbox(Ve, *P(0, -2.71, 0.85), 1.1, 0.03, 0.18, DARK, rz=rz)                                # 格栅
        rbox(Ve, *P(0, 2.66, 0.55), 2.0, 0.15, 0.25, PAINT, rz=rz)
        rbox(Ve, *P(0, -0.8, 2.42), 1.1, 0.35, 0.12, DARK, rz=rz)                                 # 顶部警灯条（熄）
        rbox(Ve, *P(-0.3, -0.8, 2.49), 0.35, 0.3, 0.05, BLUE if dirty == 0 else DARK, rz=rz)
        for sx in (-1, 1):
            rbox(Ve, *P(sx * 0.6, 0.8, 2.4), 0.06, 3.2, 0.06, STEEL, rz=rz)                       # 行李架
        if dirty:                                                                                    # 泥点 / 锈痕
            for sx in (-1, 1):
                rbox(Ve, *P(sx * 0.99, 0.0, 0.6), 0.015, 5.0, 0.3, GRIME, rz=rz)
    def bike(x, y, rz):
        """悬浮摩托：长椭球车身 + 前后推进环 + 座垫 + 把手 + 支撑脚。"""
        M = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rz, 4, 'Z')
        def P(px, py, pz): return tuple(M @ Vector((px, py, pz)))
        seg, rings = 12, 8
        verts = []
        for j in range(rings + 1):
            ph = math.pi * (1 - j / rings)
            for i in range(seg):
                a = i * math.tau / seg
                verts.append(P(0.32 * math.sin(ph) * math.sin(a), 1.05 * math.cos(ph), 0.85 + 0.28 * math.sin(ph) * math.cos(a)))
        fs = [(j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i) for j in range(rings) for i in range(seg)]
        Ve.poly(verts, fs, NAVY, smooth=True)
        for py in (-0.95, 0.95):                                                                     # 推进环（水平）
            wx, wy, _ = P(0, py, 0)
            Ve.cyl(wx, wy, 0.45, 0.42, 0.22, PAINT, 16)
            Ve.cyl(wx, wy, 0.44, 0.34, 0.02, BLUE, 16)
            Ve.cyl(wx, wy, 0.67, 0.34, 0.02, DARK, 16)
        rbox(Ve, *P(0, 0.2, 1.17), 0.32, 0.7, 0.1, RUBBER, rz=rz)                                     # 座垫
        rbox(Ve, *P(0, -0.7, 1.25), 0.8, 0.05, 0.05, STEEL, rz=rz)                                    # 把手
        beam(Ve, P(0, -0.55, 1.05), P(0, -0.7, 1.25), 0.05, STEEL)
        rbox(Ve, *P(0, -0.9, 1.15), 0.3, 0.2, 0.25, GLASS, rz=rz, rx=0.5)                             # 小风挡
        rbox(Ve, *P(0, -1.05, 0.9), 0.2, 0.04, 0.08, COLDL, rz=rz)
        rbox(Ve, *P(0, 1.05, 0.9), 0.2, 0.04, 0.08, RED, rz=rz)
        for sx in (-1, 1):
            beam(Ve, P(sx * 0.15, 0.3, 0.7), P(sx * 0.35, 0.3, 0.02), 0.04, STEEL)
    # 车场：三辆厢式车停在车棚下（一辆熄灯、脏），一辆在两道门之间，悬浮摩托一排
    van(YX0 + 6, 16.5, math.pi, 0)
    van(YX0 + 10, 16.5, math.pi, 1)
    van(YX0 + 18, 16.5, math.pi, 1)
    van((GX0 + GX1) / 2, YY0 + 3.5, 0.0, 0)
    for k in range(4):
        bike(YX0 + 23.2 + k * 1.3, 17.0, math.pi + rnd.uniform(-0.08, 0.08))
    bike(YX0 + 8.0, 6.0, 0.6)
    # 车场中一辆打开引擎盖的车换成半拆的：只剩底盘 + 轮子 + 顶起架
    for sx in (-1, 1):
        for py in (-1.7, 1.8):
            Mp.boxc(YX1 - 6 + sx * 0.8, 4 + py, 0, 0.3, 0.3, 0.5, HAZ)
    Mp.box(YX1 - 7.0, YX1 - 5.0, 1.4, 6.6, 0.5, 0.75, DARK)
    for py in (-1.7, 1.8):
        disc(Mp, YX1 - 6.95, 4 + py, 0.9, 0.38, RUBBER, axis='x', t=0.24, n=14)

    # ============================================================ 安防（props_security）：防撞柱、摄像头、水马、混凝土墩
    Se = Batch('props_security')
    for x in [ -38 + i * 1.8 for i in range(28)]:                                                    # 楼前防撞柱
        if cx0 - 0.5 < x < cx1 + 0.5:
            continue
        if x > 11:
            break
        Se.cyl(x, -4.2, 0, 0.17, 1.0, STEEL if rnd.random() < 0.7 else RUST, 10)
        Se.cyl(x, -4.2, 0.7, 0.175, 0.12, HAZ, 10)
    for x in (cx0 - 0.3, cx0 + 1.5, cx0 + 3.3, cx1 - 3.0, cx1 - 1.2, cx1 + 0.3):
        Se.cyl(x, -6.0, 0, 0.2, 0.9, STEEL, 10)
    for (x, y) in ((GX0 - 2.0, YY0 - 5.5), (GX1 + 2.0, YY0 - 5.5), (GX0 + 1.5, YY0 - 10), (GX1 - 1.5, YY0 - 10)):   # 闸口前混凝土墩（错开）
        Se.boxc(x, y, 0, 2.0, 1.0, 1.0, CONC_D)
        Se.boxc(x, y, 1.0, 1.6, 0.8, 0.12, CONC_D)
        wall_face(Se, x - 1, x + 1, y - 0.5, 0.1, 0.9, -1, rnd.choice(SMEAR), 0.0)
    for i in range(5):                                                                                # 水马（褪色、倒了一个）
        x = -36 + i * 1.3
        rbox(Se, x, -7.0, 0.4 if i != 3 else 0.25, 1.2, 0.45, 0.8 if i != 3 else 0.5, HAZ_RW if i % 2 else WHITEP,
             rx=(1.4 if i == 3 else 0.0))
    # 西翼墙根碎石（塌落的混凝土块 + 板材）
    for i in range(110):
        x = rnd.uniform(WX0 - 0.5, WX1 - 0.5); y = WY0 - rnd.uniform(0.2, 2.8) * rnd.random() ** 0.5
        r = rnd.uniform(0.15, 0.55)
        rbox(Se, x, y, r * 0.35, r * 1.4, r, r * 0.7, rnd.choice([RUBBLE, RUBBLE, CONC_D, CONC_P2]), rz=rnd.uniform(0, 3), rx=rnd.uniform(-0.3, 0.3))
    for i in range(4):
        rbox(Se, rnd.uniform(WX0, WX1), WY0 - rnd.uniform(0.8, 2.0), 0.15, 2.0, 0.03, 1.1, rnd.choice([PLY, PLATE]), rz=rnd.uniform(-0.4, 0.4), rx=1.35)
    for i in range(3):
        Se.tube([(x0_ := rnd.uniform(WX0, WX1), WY0 - 0.5, 0.1), (x0_ + rnd.uniform(-1, 1), WY0 - 1.8, 0.35)], 0.015, RUST, n=4)
    # 新泽西防撞墩迷宫（闸口 + 对外窗口前）与 Hesco 防爆墙
    def jersey(x, y, L, rz):
        M = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rz, 4, 'Z')
        prof = [(-0.3, 0.0), (0.3, 0.0), (0.3, 0.08), (0.18, 0.3), (0.1, 0.81), (-0.1, 0.81), (-0.18, 0.3), (-0.3, 0.08)]
        n = len(prof)
        vs = [(e * L / 2, py, pz) for e in (-1, 1) for (py, pz) in prof]
        fs = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [((i + 1) % n, i, n + i, n + (i + 1) % n) for i in range(n)]
        Se.poly(vs, fs, CONC_D if rnd.random() < 0.7 else CONC_P2, mat=M)
        if rnd.random() < 0.5:
            Se.box(-L / 2 + 0.2, L / 2 - 0.2, -0.31, -0.3, 0.1, 0.6, rnd.choice(SMEAR), mat=M)
    for (x, y, rz) in ((GX0 - 1.0, YY0 - 6.0, 0.0), (GX0 + 2.0, YY0 - 6.0, 0.0), (GX1 + 1.5, YY0 - 9.0, 0.0), (GX1 - 1.5, YY0 - 9.0, 0.0),
                       (GX0 - 1.0, YY0 - 12.0, 0.0), (GX0 + 2.0, YY0 - 12.0, 0.0), (GX1 + 3.5, YY0 - 7.5, 1.5708)):
        jersey(x, y, 3.0, rz)
    for (x, y, rz) in ((-5.5, -7.2, 0.0), (-2.5, -9.5, 0.0), (3.0, -7.2, 0.0), (6.0, -9.5, 0.0), (8.8, -6.5, 1.5708)):
        jersey(x, y, 3.0, rz)
    def hesco(x, y, n, ax='x', h=1.4):
        """Hesco 防爆墙：钢丝网立方框 + 卡其土工布内袋（略鼓）+ 顶面下凹的填土"""
        for k in range(n):
            cx_, cy_ = (x + k * 1.05, y) if ax == 'x' else (x, y + k * 1.05)
            Se.boxc(cx_, cy_, 0, 0.98, 0.98, h - 0.08, SAND)
            m = 7; top = []
            for a in range(m):
                for b in range(m):
                    u, v = a / (m - 1) - 0.5, b / (m - 1) - 0.5
                    sag = 0.14 * (1 - (2 * u) ** 2) * (1 - (2 * v) ** 2)
                    top.append((cx_ + u * 0.98, cy_ + v * 0.98, h - 0.08 - sag + rnd.uniform(-0.01, 0.01)))
            Se.poly(top, [(a * m + b, (a + 1) * m + b, (a + 1) * m + b + 1, a * m + b + 1) for a in range(m - 1) for b in range(m - 1)], DIRT)
            for u in (-0.5, -0.25, 0.0, 0.25, 0.5):                                             # 网格竖丝
                for sgn in (-1, 1):
                    Se.boxc(cx_ + u, cy_ + sgn * 0.5, 0, 0.025, 0.025, h, STEEL)
                    Se.boxc(cx_ + sgn * 0.5, cy_ + u, 0, 0.025, 0.025, h, STEEL)
            for zz in (0.0, 0.35, 0.7, 1.05, h - 0.02):                                         # 网格横丝
                for sgn in (-1, 1):
                    Se.boxc(cx_, cy_ + sgn * 0.5, zz, 1.02, 0.025, 0.025, STEEL)
                    Se.boxc(cx_ + sgn * 0.5, cy_, zz, 0.025, 1.02, 0.025, STEEL)
    hesco(-19.5, -2.0, 12)
    hesco(9.0, -2.0, 2)
    hesco(GX0 - 7.0, YY0 - 1.5, 2, 'y')

    def camera_mount(x, y, z, ax, ay, B=Se):
        B.box(min(x, x + ax * 0.7) - 0.04, max(x, x + ax * 0.7) + 0.04, min(y, y + ay * 0.7) - 0.04, max(y, y + ay * 0.7) + 0.04, z, z + 0.08, PAINT)
        cx, cy = x + ax * 0.7, y + ay * 0.7
        rbox(B, cx + ax * 0.15, cy + ay * 0.15, z - 0.15, 0.45 if ax else 0.2, 0.45 if ay else 0.2, 0.2, WHITEP,
             rx=(-0.4 * ay), ry=(0.4 * ax))
        B.boxc(cx, cy, z - 0.02, 0.55 if ax else 0.28, 0.55 if ay else 0.28, 0.04, PAINT)
        B.boxc(cx + ax * 0.4, cy + ay * 0.4, z - 0.25, 0.05, 0.05, 0.05, RED)
    for (x, y, ax, ay) in ((BX0 - 0.1, BY0 - 0.1, 0, -1), (BX1 + 0.1, BY0 - 0.1, 0, -1), (BX1 + 0.1, BY1 + 0.1, 1, 0),
                           (cx0 - 0.5, BY0 - 0.1, 0, -1), (WX0 - 0.1, WY0 - 0.1, -1, 0)):
        camera_mount(x, y, TOP - 0.6 if abs(x) < 25 else WH - 0.4, ax, ay)
    for (x, y) in ((YX0 + 0.5, YY1 - 0.5), (YX1 - 0.5, YY1 - 0.5), (YX1 - 0.5, YY0 + 0.5)):      # 车场摄像杆
        Se.cyl(x, y, 0, 0.1, 6.0, PAINT, 8)
        camera_mount(x, y, 6.0, 0, -1)
    camera_mount(GX1 + 0.5, YY0 - 0.5, 5.4, 0, -1)
    # 一台摄像头被砸坏垂下
    rbox(Se, BX0 + 0.3, BY0 - 0.6, TOP - 1.3, 0.2, 0.2, 0.45, WHITEP, rx=1.2)
    Se.tube([(BX0 - 0.1, BY0 - 0.2, TOP - 0.6), (BX0 + 0.2, BY0 - 0.5, TOP - 1.1)], 0.02, CABLE, n=4)

    # ============================================================ 灯（props_lights）：投光灯（墙上 + 灯杆）
    Li = Batch('props_lights')
    def flood(x, y, z, tx, ty, e=6000, ang=75, warm=False):
        Li.boxc(x, y, z - 0.1, 0.6, 0.6, 0.35, DARK)
        d = Vector((tx - x, ty - y, -z)).normalized()
        Li.boxc(x + d.x * 0.32, y + d.y * 0.32, z - 0.1, 0.45, 0.45, 0.04, SODL if warm else COLDL)
        for k in range(4):                                                                       # 钢笼
            o = -0.24 + k * 0.16
            Li.boxc(x + d.x * 0.42 - d.y * o, y + d.y * 0.42 + d.x * o, z - 0.15, 0.04 + abs(d.y) * 0.02, 0.04 + abs(d.x) * 0.02, 0.45, STEEL)
        Li.boxc(x + d.x * 0.42, y + d.y * 0.42, z + 0.25, 0.5 if abs(d.y) > 0.5 else 0.05, 0.5 if abs(d.x) > 0.5 else 0.05, 0.04, STEEL)
        spots.append(((x + d.x * 0.5, y + d.y * 0.5, z - 0.2), (tx, ty, 0), e, (1.0, 0.7, 0.4) if warm else (0.85, 0.92, 1.0), ang))
    for x in (BX0 + 2, -8.0, 0.0, BX1 - 2):
        Li.box(x - 0.05, x + 0.05, BY0 - 0.6, BY0, TOP - 0.3, TOP - 0.2, STEEL)
        flood(x, BY0 - 0.6, TOP - 0.2, x, -12, 9000, 80)
    flood(BX1 + 0.6, 9, TOP - 0.2, 20, 9, 8000, 80)
    for x in (BX0 + 5, BX1 - 5):                                                                # 一层墙面笼罩投光灯
        flood(x, BY0 - 0.5, 4.8, x, -8, 3000, 90)
    for (x, y, tx, ty) in ((YX0 + 0.3, YY1 - 0.3, YX0 + 8, YY1 - 8), (YX1 - 0.3, YY1 - 0.3, YX1 - 8, YY1 - 8),
                           (YX1 - 0.3, YY0 + 0.3, YX1 - 8, YY0 + 8), (YX0 + 0.3, YY0 + 7.3, YX0 + 8, YY0 + 12)):  # 围栏转角
        Li.cyl(x, y, 0, 0.08, 4.6, STEEL, 8)
        flood(x, y, 4.8, tx, ty, 2500, 85)
    for (x, y, tgts) in ((YX0 + 1.5, YY0 + 1.5, [(22, 8), (30, -12)]), (YX1 - 1.5, YY1 - 1.5, [(28, 12), (36, 4)]),
                         (-40, -9, [(-27, 1), (-20, -6)])):
        Li.cyl(x, y, 0, 0.22, 11, PAINT, 10, r2=0.12)
        Li.boxc(x, y, 0, 0.8, 0.8, 0.35, CONC_D)
        Li.box(x - 1.0, x + 1.0, y - 0.08, y + 0.08, 10.9, 11.05, STEEL)
        for (tx, ty) in tgts:
            d = Vector((tx - x, ty - y, 0)).normalized()
            flood(x + d.x * 0.7, y + d.y * 0.7, 11.0, tx, ty, 14000, 70)
    # 一盏坏的（黑）+ 一盏钠灯（门口岗亭上，暖色）
    Li.boxc(BX0 + 0.5, BY1 + 0.5, TOP - 0.4, 0.6, 0.6, 0.35, DARK)
    flood(GX0 - 2.8, YY0 - 3.3, 3.4, GX0 - 1, YY0 - 9, 2500, 90, warm=True)
    # 街灯（前街，对面人行道）
    for x in range(-38, 50, 16):
        Li.cyl(x, -25.2, 0.1, 0.1, 7.0, RUST, 8)
        Li.box(x - 0.05, x + 0.05, -25.2, -23.6, 6.9, 7.0, RUST)
        Li.boxc(x, -23.6, 6.75, 0.3, 0.7, 0.2, DARK)
        if x not in (-6,):
            Li.boxc(x, -23.6, 6.7, 0.25, 0.6, 0.05, SODL)
            points.append(((x, -23.6, 6.4), 500, (1.0, 0.6, 0.28)))

    # ============================================================ 背景：铁皮屋、支撑柱、中层底面
    Bs = Batch('bg_slum')
    rb = random.Random(7)
    Bs.box(-400, 400, -400, 400, -0.6, -0.3, DIRT)
    for gx in range(-40, 41):
        for gy in range(-40, 41):
            x, y = gx * 5.0 + rb.uniform(-0.6, 0.6), gy * 5.0 + rb.uniform(-0.6, 0.6)
            if -48 < x < 56 and -30 < y < 34:
                continue
            d = max(abs(x - 4), abs(y - 2))
            if d > 150 or gx % 6 == 0 or gy % 7 == 0 or rb.random() < 0.12 + d / 400:
                continue
            sx_, sy_ = rb.uniform(3.6, 5.2), rb.uniform(3.6, 5.2)
            z = 0.0
            for lev in range(rb.randint(1, 3)):
                h = rb.uniform(2.4, 3.2)
                Bs.boxc(x, y, z, sx_, sy_, h, rb.choice([SHEET_R, SHEET_R, RUST, CBOX[1], SHEET]))
                if rb.random() < 0.5:
                    side = rb.choice((-1, 1))
                    Bs.boxc(x + rb.uniform(-sx_ / 4, sx_ / 4), y + side * (sy_ / 2 + 0.02), z + 1.0, rb.uniform(0.5, 1.0), 0.05, 0.6,
                            SHACKW if rb.random() < 0.6 else DARK)
                if rb.random() < 0.15 and d < 70:
                    Bs.boxc(x, y - sy_ / 2 - 0.02, z + 0.3, rb.uniform(1, 2.5), 0.02, rb.uniform(0.5, 1.2), rb.choice(SMEAR))
                z += h
                sx_ *= rb.uniform(0.75, 1.0); sy_ *= rb.uniform(0.75, 1.0)
            rbox(Bs, x, y, z + 0.05, sx_ + 0.9, sy_ + 0.9, 0.08, rb.choice([SHEET_R, RUST]), rx=rb.uniform(-0.12, 0.12), ry=rb.uniform(-0.12, 0.12))
            if rb.random() < 0.03 and d < 70:
                points.append(((x, y + sy_ / 2 + 1, 2.4), 60, (1.0, 0.6, 0.3)))
    for i in range(40):
        x, y = rb.uniform(-160, 160), rb.uniform(-150, 160)
        if -50 < x < 58 and -32 < y < 36: continue
        x2, y2 = x + rb.uniform(-12, 12), y + rb.uniform(-12, 12)
        Bs.tube([(x, y, 6), ((x + x2) / 2, (y + y2) / 2, 5.2), (x2, y2, 6)], 0.03, CABLE, n=4)
    for (x, y) in ((-75, 55), (85, 60), (-95, -45), (70, -70), (5, 110), (-20, -95)):
        Bs.boxc(x, y, 0, 12, 12, UZ, CONC_D)
        Bs.boxc(x, y, 0, 15, 15, 4, CONC_D)
        Bs.boxc(x, y, UZ - 10, 18, 18, 10, CONC_D)
        for k in range(3):
            Bs.tube([(x + 6.3, y - 4 + k * 3, 0), (x + 6.3, y - 4 + k * 3, UZ)], 0.4, rb.choice([RUST, STEEL]), n=8)
        for z in (20, 50, 80):
            Bs.box(x - 6.05, x + 6.05, y - 6.05, y + 6.05, z, z + 0.3, PAINT)
        points.append(((x, y - 7, 25), 600, (0.7, 0.8, 1.0)))
    Bu = Batch('bg_underside')
    Bu.box(-500, 500, -500, 500, UZ, UZ + 4, CONC_D)
    for k in range(-10, 11):
        Bu.box(k * 40 - 1.5, k * 40 + 1.5, -500, 500, UZ - 5, UZ, PAINT)
        Bu.box(-500, 500, k * 40 - 1.5, k * 40 + 1.5, UZ - 5, UZ, PAINT)
    for k in range(14):
        y = rb.uniform(-300, 300)
        Bu.tube([(-500, y, UZ - 6 - rb.uniform(0, 3)), (500, y, UZ - 6 - rb.uniform(0, 3))], rb.uniform(0.6, 1.6), rb.choice([RUST, STEEL]), n=10)
    for i in range(140):
        x, y = rb.uniform(-400, 400), rb.uniform(-400, 400)
        Bu.boxc(x, y, UZ - 5.4, 1.2, 1.2, 0.3, rb.choice([SODL, COLDL, SODL, WARML]))
    for (x, y) in ((-60, -40), (70, 30), (0, -120), (-140, 80)):
        points.append(((x, y, UZ - 8), 4000, (1.0, 0.7, 0.4)))

    Batch.build_all()

    # ------------------------------------------------------------ 世界 + 雾 + 灯光
    w = bpy.data.worlds.new('w'); sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs[0].default_value = (0.03, 0.033, 0.045, 1); bg.inputs[1].default_value = 0.3
    nt.links.new(bg.outputs[0], out.inputs[0])
    vs = nt.nodes.new('ShaderNodeVolumePrincipled')
    vs.inputs['Color'].default_value = (0.6, 0.6, 0.62, 1)
    vs.inputs['Density'].default_value = 0.004
    nt.links.new(vs.outputs[0], out.inputs['Volume'])
    sc.cycles.volume_bounces = 0
    sc.cycles.volume_step_rate = 4.0
    for (loc, e, sz, c) in (((0, -10, 45), 9000, 70, (0.75, 0.82, 0.95)), ((27, 8, 30), 5000, 30, (0.8, 0.86, 1.0)), ((0, 0, UZ - 12), 5000, 400, (0.6, 0.62, 0.75))):
        ld = bpy.data.lights.new('area_%d' % e, 'AREA'); ld.energy = e; ld.size = sz; ld.color = c
        o = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(o); o.location = loc
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.1)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.4)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.95

    CAMS = {
        'c1': ((-28.0, -66.0, 44.0), (8.0, 4.0, 0.0), 26, 0.05, 1.5),
        'c2': ((16.0, -24.0, 4.5), (14.0, -3.0, 2.0), 18, 0.1, 1.5),
        'c3': ((45.0, -11.0, 11.0), (26.0, 12.0, 0.5), 22, 0.0, 1.5),
        'c4': ((13.8, -6.2, 3.2), (9.6, 0.2, 2.9), 26, 0.0, 1.5),
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
