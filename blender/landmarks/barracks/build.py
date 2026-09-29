"""天城防卫军「环城军营带」一段 + 军事学院（中层西郊，「钢铁与霓虹」中层的外缘，朝外防线）——只做外观。
  环城军营带：卡里只说中层外围一圈军营。这里做沿甲板边的一段弧：
    props_barracks  一排弯弧上重复的 7 层兵营楼（统一立面节奏、朴素栏杆阳台、屋顶设备）
    props_parade    阅兵场（铺面、画线、检阅台）
    props_motorpool 车场铺面、画线、车辆维修大厅、加油 / 充电桩
    props_vehicles  无武器、无标识的装甲勤务车 + 悬浮运输艇
    props_edge      甲板边护墙、外周围栏与大门、岗亭、甲板边瞭望塔
  军事学院（卡里没给位置，放在军营北侧相邻）：
    props_academy_main   主楼（中央塔楼，无钟、无文字 / 徽章）
    props_academy_blocks 围合方院的教学楼 + 宿舍塔楼
    props_academy_sports 体育馆、室内训练馆、田径场
  另有 site_ground、props_lights、props_trees；bg_*：内侧中层巨构楼群、磁浮高架、甲板边下落 + 下层 + 城外墙 + 荒野、上层浮岛底面。
  中立：无人物、无武器（无枪、炮塔、靶子）、无文字 / 徽章 / 旗帜符号。

布局：城市中心在 (CX, 0)，极坐标 r（到中心的距离）、a（弧度，向北为正）；甲板边 r = 1000（世界 x≈0 处）。
  局部坐标系 F(r, a)：局部 +x 朝城内（向中心），+y 沿弧向北。
  外周路 r 978..988、护墙 r 999.5、围栏 r 991；兵营 r 959..973；车道 r 946..955；阅兵场 a -0.135..-0.04、车场 a -0.025..0.065（r 900..946）；
  维修大厅 r 870..900；内侧围栏 r 858；学院局部原点 F(905, 0.17)。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/barracks/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/bk.jpg [--blend /tmp/bk.blend] [--log /tmp/bk.log] [--exposure 0.3]
cam: c1 俯瞰两处 / c2 阅兵场 + 车场 / c3 学院方院
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/bk.jpg', blend='', log='', exposure=''))

CX = 1000.0
EDGE = 1000.0
LOW_Z = -320.0
UZ = 360.0


def main():
    import bpy
    from mathutils import Matrix, Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(53)

    # ------------------------------------------------------------ 材质
    CONC = C.pbr('bk_conc', 'concrete_wall_008', 4.0, tint=(0.66, 0.66, 0.63), sat=0.0, value=1.0, weather=0.8)
    CONC_D = C.pbr('bk_conc_dark', 'concrete_wall_008', 5.0, tint=(0.36, 0.36, 0.36), sat=0.0, weather=0.9)
    CONC_P = C.pbr('bk_conc_pad', 'smooth_concrete_floor', 3.0, tint=(0.5, 0.5, 0.48), sat=0.1, weather=0.5)
    DECK = C.pbr('bk_deck', 'hangar_concrete_floor', 6.0, tint=(0.46, 0.46, 0.45), sat=0.2)
    ASPH = C.pbr('bk_asphalt', 'asphalt_02', 4.0, tint=(0.3, 0.3, 0.31), sat=0.3, value=0.65)
    PAVE = C.pbr('bk_pave', 'precast_stone_paving', 3.0, tint=(0.58, 0.57, 0.55), sat=0.3)
    PAVE2 = C.pbr('bk_pave2', 'patterned_paving', 4.0, tint=(0.55, 0.53, 0.5), sat=0.4)
    GRASS = C.pbr('bk_grass', 'grass_ground', 4.0, tint=(0.55, 0.62, 0.45), sat=0.8, value=0.8)
    # 学院：中层的金属幕墙板 + 深色花岗岩基座 + 钢窗框 + 直立锁边金属屋面（不做旧世界砖石 / 石板瓦）
    STONE = C.pbr('bk_granite', 'marble_01', 3.0, tint=(0.24, 0.25, 0.27), sat=0.2, value=0.85)
    STONE_S = C.pbr('bk_panel', 'smooth_concrete_floor', 2.0, tint=(0.66, 0.69, 0.72), sat=0.1, weather=0.15)
    BRICK = C.pbr('bk_clad', 'Metal009', 2.5, tint=(0.34, 0.37, 0.41), sat=0.2, metal=0.6, rough_mul=1.1)
    SLATE = C.pbr('bk_seam', 'box_profile_metal_sheet', 1.2, tint=(0.19, 0.2, 0.22), sat=0.2, metal=0.6, rot=1.5708)
    LEDW = C.flat('bk_led_w', (1, 1, 1), 0.3, emit=(0.8, 0.9, 1.0), estr=9.0)
    LEDC = C.flat('bk_led_c', (1, 1, 1), 0.3, emit=(0.15, 0.75, 1.0), estr=10.0)
    NEON = C.flat('bk_neon_m', (1, 1, 1), 0.3, emit=(1.0, 0.15, 0.6), estr=10.0)
    SODL = C.flat('bk_sodium', (1, 0.6, 0.2), 0.3, emit=(1.0, 0.55, 0.18), estr=25.0)
    STEEL = C.pbr('bk_steel', 'Metal009', 2.0, tint=(0.38, 0.39, 0.4), sat=0.3, metal=0.8, rough_mul=1.2)
    PAINT = C.pbr('bk_paint', 'Metal009', 2.0, tint=(0.24, 0.26, 0.23), sat=0.2, metal=0.3, rough_mul=1.4)
    SHEET = C.pbr('bk_sheet', 'box_profile_metal_sheet', 1.6, tint=(0.44, 0.46, 0.44), sat=0.2, metal=0.4, weather=0.7, rot=1.5708)
    ROOFS = C.pbr('bk_roof', 'box_profile_metal_sheet', 2.0, tint=(0.33, 0.34, 0.33), sat=0.2, metal=0.5, weather=0.6)
    ARMOR = C.pbr('bk_armor', 'Metal009', 3.0, tint=(0.3, 0.32, 0.27), sat=0.2, metal=0.2, rough_mul=1.6, weather=0.5)
    HULL = C.pbr('bk_hull', 'Metal009', 3.0, tint=(0.42, 0.44, 0.44), sat=0.2, metal=0.35, rough_mul=1.3, weather=0.4)
    RUBBER = C.pbr('bk_rubber', 'Rubber004', 1.0, tint=(0.2, 0.2, 0.2), sat=0.2)
    TRACKM = C.pbr('bk_track', 'rubber_tiles', 2.0, tint=(0.6, 0.25, 0.18), sat=0.8, value=0.8)
    RIM = C.flat('bk_rim', (0.18, 0.19, 0.16), 0.5, metal=0.6, noise=0.3)
    RUST = C.flat('bk_rust', (0.16, 0.085, 0.045), 0.8, metal=0.3, noise=0.6)
    BRIGHT = C.flat('bk_bright', (0.75, 0.75, 0.72), 0.25, metal=1.0, noise=0.3)
    MUD = C.flat('bk_mud', (0.12, 0.1, 0.075), 0.9, noise=0.7)
    OIL = C.flat('bk_oil', (0.02, 0.02, 0.018), 0.2, noise=0.3, coat=0.8)
    GRIME = C.flat('bk_grime', (0.08, 0.08, 0.075), 0.85, noise=0.7)
    DARK = C.flat('bk_dark', (0.015, 0.015, 0.016), 0.8)
    CABLE = C.flat('bk_cable', (0.02, 0.02, 0.02), 0.5)
    MESH = C.flat('bk_mesh', (0.22, 0.23, 0.22), 0.6, metal=0.6, noise=0.5)
    LINEW = C.flat('bk_line_w', (0.62, 0.62, 0.58), 0.6, noise=0.5)
    LINEY = C.flat('bk_line_y', (0.62, 0.48, 0.1), 0.6, noise=0.5)
    HAZ = C.hazard('bk_hazard', wear=0.5)
    GLASS = C.glass('bk_glass', (0.05, 0.06, 0.07), 0.06)
    GLASSB = C.glass('bk_glass_b', (0.07, 0.1, 0.13), 0.05)
    WINL = C.glass('bk_win_lit', (0.08, 0.07, 0.06), 0.2, emit=(1.0, 0.8, 0.55), estr=1.6)
    COLDL = C.flat('bk_cold', (0.85, 0.92, 1), 0.3, emit=(0.85, 0.93, 1.0), estr=25.0)
    WARML = C.flat('bk_warm', (1, 0.8, 0.5), 0.3, emit=(1.0, 0.75, 0.45), estr=12.0)
    RED = C.flat('bk_red', (1, 0.1, 0.05), 0.3, emit=(1.0, 0.06, 0.03), estr=25.0)
    CYAN = C.flat('bk_cyan', (0.2, 0.8, 1), 0.3, emit=(0.2, 0.75, 1.0), estr=12.0)
    HOLO = C.holo('bk_holo', (0.1, 0.7, 1.0), (0.05, 0.3, 0.9), 4.0, 0.55)

    points, spots = [], []

    # ------------------------------------------------------------ 坐标
    def P(r, a, z=0.0):
        return (CX - r * math.cos(a), r * math.sin(a), z)

    def F(r, a, z=0.0):
        p = P(r, a, z)
        return Matrix.Translation(p) @ Matrix.Rotation(-a, 4, 'Z')

    def T(x, y, z=0.0, rz=0.0):
        return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z')

    def rbox(B, x, y, z, sx, sy, sz, m, rz=0.0, rx=0.0, ry=0.0):
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y')
        B.box(-sx / 2, sx / 2, -sy / 2, sy / 2, -sz / 2, sz / 2, m, M)

    def beam(B, p0, p1, w, m):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        M = Matrix.Translation((p0 + p1) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        B.box(-w / 2, w / 2, -w / 2, w / 2, -d.length / 2, d.length / 2, m, M)

    def sector(B, r0, r1, a0, a1, z0, z1, m, seg=6.0):
        """环形扇区实体（世界坐标）"""
        n = max(2, int(abs(a1 - a0) * r1 / seg))
        vs = []
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            for (r, z) in ((r0, z0), (r1, z0), (r1, z1), (r0, z1)):
                vs.append(P(r, a, z))
        fs = []
        for i in range(n):
            b0, b1 = i * 4, (i + 1) * 4
            for k in range(4):
                fs.append((b0 + k, b0 + (k + 1) % 4, b1 + (k + 1) % 4, b1 + k))
        fs.append((0, 1, 2, 3)); fs.append((n * 4 + 3, n * 4 + 2, n * 4 + 1, n * 4))
        B.poly(vs, fs, m)

    def radial(B, r0, r1, a, w, z0, z1, m):
        M = F((r0 + r1) / 2, a)
        B.box(-(r1 - r0) / 2, (r1 - r0) / 2, -w / 2, w / 2, z0, z1, m, M)

    def lpt(M, x, y, z):
        return tuple(M @ Vector((x, y, z)))

    def lgable(B, M, x0, x1, y0, y1, z, h, m, along='y', over=0.0):
        if along == 'x':
            ym = (y0 + y1) / 2; y0 -= over; y1 += over
            vs = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), (x0, ym, z + h), (x1, ym, z + h)]
            fs = [(3, 2, 1, 0), (0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)]
        else:
            xm = (x0 + x1) / 2; x0 -= over; x1 += over
            vs = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), (xm, y0, z + h), (xm, y1, z + h)]
            fs = [(3, 2, 1, 0), (0, 1, 4), (2, 3, 5), (1, 2, 5, 4), (3, 0, 4, 5)]
        B.poly(vs, fs, m, mat=M)

    def lpyr(B, M, x, y, z, sx, sy, h, m):
        vs = [(x - sx / 2, y - sy / 2, z), (x + sx / 2, y - sy / 2, z), (x + sx / 2, y + sy / 2, z), (x - sx / 2, y + sy / 2, z), (x, y, z + h)]
        B.poly(vs, [(3, 2, 1, 0), (0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], m, mat=M)

    def lvault(B, M, x0, x1, y0, y1, z, rise, m, n=10):
        """沿 y 的筒拱屋面（截面在 x 方向是弧）"""
        vs = []
        for i in range(n + 1):
            t = i / n
            x = x0 + (x1 - x0) * t
            zz = z + rise * math.sin(math.pi * t)
            vs += [(x, y0, zz), (x, y1, zz)]
        fs = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(n)]
        fs.append(tuple(2 * i for i in range(n + 1))[::-1])
        fs.append(tuple(2 * i + 1 for i in range(n + 1)))
        B.poly(vs, fs, m, mat=M)

    def ledring(B, M, x0, x1, y0, y1, z, m=None, t=0.14):
        m = m or LEDW
        B.box(x0, x1, y0 - 0.04, y0, z, z + t, m, M); B.box(x0, x1, y1, y1 + 0.04, z, z + t, m, M)
        B.box(x0 - 0.04, x0, y0, y1, z, z + t, m, M); B.box(x1, x1 + 0.04, y0, y1, z, z + t, m, M)

    def fpt(side, c, u, v, n):
        if side == 'X+': return (c + n, u, v)
        if side == 'X-': return (c - n, u, v)
        if side == 'Y+': return (u, c + n, v)
        return (u, c - n, v)

    def fbox(B, M, side, c, u0, u1, v0, v1, n0, n1, m):
        a, b = fpt(side, c, u0, v0, n0), fpt(side, c, u1, v1, n1)
        B.box(min(a[0], b[0]), max(a[0], b[0]), min(a[1], b[1]), max(a[1], b[1]), a[2], b[2], m, M)

    def windows(B, M, side, c, u0, u1, z0, nf, fh, bay, w, h, frame, lit=0.25, deep=0.22, sill=True, gm=None):
        nb = max(1, int(round((u1 - u0) / bay)))
        bw = (u1 - u0) / nb
        for i in range(nb):
            u = u0 + bw * (i + 0.5)
            for k in range(nf):
                z = z0 + fh * k + (fh - h) * 0.55
                g = gm or (WINL if rnd.random() < lit else GLASS)
                fbox(B, M, side, c, u - w / 2, u + w / 2, z, z + h, -0.03, 0.02, g)
                if frame:
                    fbox(B, M, side, c, u - w / 2 - 0.18, u - w / 2, z, z + h, 0, deep, frame)
                    fbox(B, M, side, c, u + w / 2, u + w / 2 + 0.18, z, z + h, 0, deep, frame)
                    fbox(B, M, side, c, u - w / 2 - 0.18, u + w / 2 + 0.18, z + h, z + h + 0.22, 0, deep, frame)
                    if sill:
                        fbox(B, M, side, c, u - w / 2 - 0.25, u + w / 2 + 0.25, z - 0.18, z, 0, deep + 0.08, frame)

    def wheel(B, M, x, y, z, r, w, m_t=None, m_r=None, n=16):
        R = M @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
        B.cyl(0, 0, -w / 2, r, w, m_t or RUBBER, n, mat=R)
        s = 1 if x > 0 else -1
        B.cyl(0, 0, (w / 2 - 0.01) * s - (0.02 if s < 0 else 0), r * 0.55, 0.03, m_r or RIM, 10, smooth=False, mat=R)
        B.cyl(0, 0, (w / 2 + 0.01) * s - (0.02 if s < 0 else 0), r * 0.18, 0.04, STEEL, 8, smooth=False, mat=R)
        for k in range(12):
            a = k * math.tau / 12
            B.box(r - 0.01, r + 0.03, -0.05, 0.05, -w / 2 + 0.03, w / 2 - 0.03, RUBBER, R @ Matrix.Rotation(a, 4, 'Z'))

    def blob(B, x, y, z, r, m, k=12, sq=0.7):
        ph = rnd.uniform(0, 6.28)
        B.poly([(x + r * (1 + 0.3 * math.sin(3 * a + ph) + rnd.uniform(-0.1, 0.1)) * math.cos(a),
                 y + r * sq * (1 + 0.3 * math.sin(2 * a + ph) + rnd.uniform(-0.1, 0.1)) * math.sin(a), z)
                for a in (q * math.tau / k for q in range(k))], [tuple(range(k))], m)

    # ============================================================ site_ground：甲板、道路、草地
    G = Batch('site_ground')
    A0, A1 = -0.2, 0.42
    sector(G, 830, EDGE, A0, A1, -3.0, -0.02, DECK, seg=8)
    sector(G, 978, 988, A0, A1, -0.02, 0.0, ASPH)                        # 外周路
    sector(G, 946, 955, -0.16, 0.09, -0.02, 0.0, ASPH)                   # 营内车道
    sector(G, 862, 869, -0.16, 0.09, -0.02, 0.0, ASPH)                   # 内侧勤务路
    sector(G, 840, 855, A0, A1, -0.02, 0.0, ASPH)                        # 城内街
    for r in (855.3, 839.7):
        sector(G, r - 0.3, r + 0.3, A0, A1, 0.0, 0.15, CONC)               # 路缘
    for aa in (-0.06, 0.025):
        radial(G, 869, 946, aa, 7, -0.02, 0.0, ASPH)                       # 营内径向路
    for r in (983,):                                                      # 外周路中线（虚线）
        a = A0
        while a < A1:
            sector(G, r - 0.08, r + 0.08, a, a + 3 / r, 0.0, 0.01, LINEW, seg=10)
            a += 9 / r

    # ============================================================ props_barracks：弧形一排兵营楼
    Bb = Batch('props_barracks')
    FH, NF = 3.2, 7
    H = NF * FH + 0.6
    BLK_A = [-0.14 + i * 0.05 for i in range(6)]
    for bi, a in enumerate(BLK_A):
        M = F(966, a)
        L = 21.0
        Bb.box(-7, 7, -L, L, 0, H, CONC, M)
        Bb.box(-7.1, 7.1, -L - 0.1, L + 0.1, 0, 1.1, CONC_D, M)               # 勒脚
        Bb.box(-7.3, 7.3, -L - 0.3, L + 0.3, H, H + 0.25, CONC_D, M)           # 屋面压顶
        Bb.box(-7.3, 7.3, -L - 0.3, -L, H + 0.25, H + 1.2, CONC, M)            # 女儿墙
        Bb.box(-7.3, 7.3, L, L + 0.3, H + 0.25, H + 1.2, CONC, M)
        Bb.box(-7.3, -7.0, -L, L, H + 0.25, H + 1.2, CONC, M)
        Bb.box(7.0, 7.3, -L, L, H + 0.25, H + 1.2, CONC, M)
        # 内侧（朝阅兵场，+x）：阳台 + 竖向隔墙鳍，11 开间
        nb = 11; bw = 2 * L / nb
        for i in range(nb + 1):
            u = -L + bw * i
            fbox(Bb, M, 'X+', 7, u - 0.12, u + 0.12, 1.1, H - 0.1, 0, 1.45, CONC)
        for i in range(nb):
            u = -L + bw * (i + 0.5)
            mid = i in (2, nb // 2, nb - 3)
            for k in range(NF):
                z = 0.6 + k * FH
                if k == 0:
                    if mid:   # 门厅：雨棚 + 双扇门
                        fbox(Bb, M, 'X+', 7, u - 1.6, u + 1.6, 0, 2.7, -0.03, 0.02, GLASSB)
                        fbox(Bb, M, 'X+', 7, u - 0.03, u + 0.03, 0, 2.7, 0, 0.06, PAINT)
                        fbox(Bb, M, 'X+', 7, u - 2.8, u + 2.8, 3.0, 3.25, 0, 3.2, CONC_D)
                        fbox(Bb, M, 'X+', 7, u - 2.2, u + 2.2, 0, 0.3, 0, 2.6, CONC_P)
                        for s in (-1, 1):
                            fbox(Bb, M, 'X+', 7, u + s * 2.6 - 0.1, u + s * 2.6 + 0.1, 0, 3.0, 2.9, 3.1, STEEL)
                        fbox(Bb, M, 'X+', 7, u - 0.4, u + 0.4, 2.9, 2.98, 1.0, 1.4, WARML)
                    else:
                        fbox(Bb, M, 'X+', 7, u - 1.1, u + 1.1, 1.3, 2.9, -0.03, 0.02, GLASS)
                        fbox(Bb, M, 'X+', 7, u - 1.2, u + 1.2, 1.1, 1.3, 0, 0.25, CONC_D)
                    continue
                g = WINL if rnd.random() < 0.18 else GLASS
                fbox(Bb, M, 'X+', 7, u - 1.3, u + 1.3, z + 0.15, z + 2.55, -0.03, 0.02, g)      # 阳台门窗
                fbox(Bb, M, 'X+', 7, u - 0.03, u + 0.03, z + 0.15, z + 2.55, 0, 0.05, PAINT)
                fbox(Bb, M, 'X+', 7, u - bw / 2 + 0.12, u + bw / 2 - 0.12, z - 0.05, z + 0.12, 0, 1.4, CONC_D)  # 阳台板
                fbox(Bb, M, 'X+', 7, u - bw / 2 + 0.12, u + bw / 2 - 0.12, z + 1.02, z + 1.08, 1.3, 1.38, STEEL)  # 扶手
                fbox(Bb, M, 'X+', 7, u - bw / 2 + 0.12, u + bw / 2 - 0.12, z + 0.5, z + 0.54, 1.32, 1.36, STEEL)
                for du in (-0.6, 0.6):
                    fbox(Bb, M, 'X+', 7, u + du - 0.03, u + du + 0.03, z + 0.12, z + 1.02, 1.31, 1.37, STEEL)
                if rnd.random() < 0.12:   # 阳台下的水渍
                    fbox(Bb, M, 'X+', 7, u - 0.5, u + 0.5, z - 1.2, z - 0.05, 0.0, 0.01, GRIME)
                if rnd.random() < 0.15:   # 阳台上晾着的储物箱 / 空调外机
                    fbox(Bb, M, 'X+', 7, u + 0.5, u + 1.1, z + 0.12, z + 0.7, 0.3, 0.9, SHEET)
        # 外侧（朝甲板边，-x）：规整窗 + 雨水管
        windows(Bb, M, 'X-', -7, -L + 0.5, L - 0.5, 0.6 + FH, NF - 1, FH, bw, 1.4, 1.6, CONC_D, lit=0.12, deep=0.18)
        windows(Bb, M, 'X-', -7, -L + 0.5, L - 0.5, 0.6, 1, FH, bw * 2, 1.4, 1.2, CONC_D, lit=0.0, deep=0.18)
        for u in (-L + 0.6, -0.3, L - 0.6):
            fbox(Bb, M, 'X-', -7, u - 0.08, u + 0.08, 0, H, 0, 0.16, PAINT)
        for u in (-12.0, 12.0):                                                   # 外凸楼梯间 + 底层出入口雨棚
            Bb.box(-9.6, -7, u - 2.6, u + 2.6, 0, H + 2.4, CONC, M)
            Bb.box(-9.8, -7, u - 2.8, u + 2.8, 0, 1.1, CONC_D, M)
            Bb.box(-9.8, -7, u - 2.8, u + 2.8, H + 2.4, H + 2.7, CONC_D, M)
            fbox(Bb, M, 'X-', -9.6, u - 0.8, u + 0.8, 3.6, H + 1.6, -0.03, 0.02, GLASSB)
            for k in range(1, NF):
                fbox(Bb, M, 'X-', -9.6, u - 0.9, u + 0.9, 0.6 + k * FH + 1.4, 0.6 + k * FH + 1.6, 0, 0.12, CONC_D)
            fbox(Bb, M, 'X-', -9.6, u - 1.1, u + 1.1, 0.3, 2.7, -0.03, 0.02, PAINT)
            fbox(Bb, M, 'X-', -9.6, u - 2.0, u + 2.0, 2.9, 3.1, 0, 2.2, CONC_D)
            fbox(Bb, M, 'X-', -9.6, u - 0.4, u + 0.4, 2.85, 2.9, 0.8, 1.2, WARML)
        # 山墙：楼梯间竖窗带 + 侧门
        for side, c in (('Y+', L), ('Y-', -L)):
            fbox(Bb, M, side, c, -1.0, 1.0, 1.5, H - 1.5, -0.03, 0.02, GLASSB)
            for k in range(NF):
                fbox(Bb, M, side, c, -1.1, 1.1, 0.6 + k * FH - 0.1, 0.6 + k * FH + 0.1, 0, 0.12, CONC_D)
            fbox(Bb, M, side, c, 3.0, 4.6, 0, 2.3, -0.03, 0.02, PAINT)
            fbox(Bb, M, side, c, 2.8, 4.8, 2.5, 2.65, 0, 1.2, CONC_D)
        # 屋顶：电梯机房、水箱、通风机、太阳能板排
        Bb.box(-3, 3, -2.5, 2.5, H, H + 3.4, CONC, M)
        Bb.box(-3.2, 3.2, -2.7, 2.7, H + 3.4, H + 3.6, CONC_D, M)
        Bb.cyl(0, 12, H, 1.8, 3.2, STEEL, 16, mat=M)
        Bb.cyl(0, 12, H + 3.2, 1.8, 0.4, STEEL, 16, r2=0.3, mat=M)
        for (x, y) in ((3.5, -12), (-3.5, -12), (-3.5, 8)):
            Bb.box(x - 1, x + 1, y - 1.5, y + 1.5, H, H + 1.3, SHEET, M)
            Bb.cyl(x, y, H + 1.3, 0.55, 0.15, DARK, 12, mat=M)
        for k in range(4):
            y = -18 + k * 3.2
            Bb.box(-5, 1, y - 1.2, y + 1.2, H + 0.6, H + 0.65, GLASSB, M) if k % 2 else None
        Bb.box(5.5, 5.7, -1, -0.8, H, H + 7, STEEL, M)                          # 短天线桅

    # ============================================================ props_parade：阅兵场 + 检阅台
    Pa = Batch('props_parade')
    PA0, PA1 = -0.135, -0.04
    sector(Pa, 900, 946, PA0, PA1, 0.0, 0.06, PAVE, seg=5)
    sector(Pa, 899.5, 900, PA0, PA1, 0.0, 0.2, CONC)
    sector(Pa, 946, 946.5, PA0, PA1, 0.0, 0.2, CONC)
    for r in (906, 940):                                                   # 画线：外框 + 编队格点
        sector(Pa, r - 0.12, r + 0.12, PA0 + 0.006, PA1 - 0.006, 0.06, 0.07, LINEW, seg=5)
    for aa in (PA0 + 0.006, PA1 - 0.006):
        radial(Pa, 906, 940, aa, 0.24, 0.06, 0.07, LINEW)
    for r in range(911, 938, 5):
        a = PA0 + 0.02
        while a < PA1 - 0.015:
            radial(Pa, r - 0.5, r + 0.5, a, 0.16, 0.06, 0.07, LINEW)
            a += 4.5 / r
    radial(Pa, 906, 940, (PA0 + PA1) / 2, 0.3, 0.06, 0.07, LINEY)
    # 检阅台（内侧，面朝外）
    M = F(893, (PA0 + PA1) / 2)
    for k in range(4):
        Pa.box(-3.5 + k * 1.1, 5, -14, 14, 0, 0.4 * (k + 1), CONC, M)
    Pa.box(4, 6.2, -15, 15, 0, 6.5, CONC_D, M)                                 # 背墙
    Pa.box(-4.5, 6.4, -16, 16, 6.5, 6.9, CONC, M)                              # 平雨棚
    Pa.box(-4.5, 6.4, -16, 16, 6.9, 7.0, ROOFS, M)
    for y in (-15, -7.5, 0, 7.5, 15):
        Pa.cyl(-4, y, 1.6, 0.18, 4.9, STEEL, 10, mat=M)
    for s in (-1, 1):
        Pa.box(-4, 5, s * 14 - 0.5 * s - 0.25, s * 14 - 0.5 * s + 0.25, 1.6, 2.6, CONC, M)
    for y in range(-12, 13, 2):                                                # 台前栏杆柱
        Pa.box(-3.5, -3.4, y - 0.05, y + 0.05, 1.6, 2.6, STEEL, M)
    Pa.box(-3.52, -3.38, -13, 13, 2.55, 2.62, STEEL, M)
    # 检阅台前的礼仪平台（两级台阶）+ 平台边灯带
    Pa.box(-9.5, -3.5, -7, 7, 0, 0.5, CONC, M)
    Pa.box(-8.5, -3.5, -6, 6, 0.5, 1.0, CONC, M)
    Pa.box(-9.55, -9.45, -7, 7, 0.1, 0.2, LEDW, M)
    Pa.box(-8.55, -8.45, -6, 6, 0.6, 0.7, LEDW, M)
    # 路缘（花岗岩压边）+ 排水：中线与两长边的缝隙式排水沟、四角雨水箅
    for (r0, r1) in ((899.2, 900.2), (945.8, 946.8)):
        sector(Pa, r0, r1, PA0, PA1, 0.0, 0.22, CONC_D)
    for aa in (PA0, PA1):
        radial(Pa, 899.2, 946.8, aa, 1.0, 0.0, 0.22, CONC_D)
    for r in (902.5, 923.0, 943.5):
        sector(Pa, r - 0.18, r + 0.18, PA0 + 0.004, PA1 - 0.004, 0.06, 0.075, DARK, seg=5)
        a = PA0 + 0.006
        while a < PA1 - 0.004:
            radial(Pa, r - 0.3, r + 0.3, a, 0.6, 0.06, 0.08, STEEL)
            a += 12 / r

    # ============================================================ props_motorpool：车场 + 维修大厅 + 加油 / 充电桩
    Mp = Batch('props_motorpool')
    MA0, MA1 = -0.025, 0.07
    sector(Mp, 900, 946, MA0, MA1, 0.0, 0.05, CONC_P, seg=5)
    a = MA0 + 0.004
    while a < MA1:                                                          # 车位线
        radial(Mp, 928, 945, a, 0.15, 0.05, 0.06, LINEY)
        radial(Mp, 902, 917, a, 0.15, 0.05, 0.06, LINEY)
        a += 5.0 / 930
    for k in range(10):
        r = rnd.uniform(904, 944); aa = rnd.uniform(MA0, MA1)
        p = P(r, aa)
        blob(Mp, p[0], p[1], 0.06, rnd.uniform(0.5, 1.4), OIL)
    # 悬浮艇起降垫（两个，外沿，带黄黑边框与地灯）
    HOVER_PADS = [(936.5, 0.058), (912, 0.058)]
    for (r, aa) in HOVER_PADS:
        M = F(r, aa)
        Mp.box(-8, 8, -8, 8, 0.05, 0.1, CONC_D, M)
        for s in (-1, 1):
            Mp.box(-8, 8, s * 7.6 - 0.4, s * 7.6 + 0.4, 0.1, 0.11, HAZ, M)
            Mp.box(s * 7.6 - 0.4, s * 7.6 + 0.4, -7.2, 7.2, 0.1, 0.11, HAZ, M)
        for (x, y) in ((-7.9, -7.9), (7.9, -7.9), (-7.9, 7.9), (7.9, 7.9)):
            Mp.cyl(x, y, 0.1, 0.2, 0.08, CYAN, 8, mat=M)
    # 维修大厅（钢门架 + 压型钢板墙 + 双坡顶，三道大门朝车场）
    MH = F(885, 0.022)
    HW, HL, HH = 15.0, 24.0, 12.0
    Mp.box(-HW, HW, -HL, HL, 0, 1.2, CONC_D, MH)
    Mp.box(-HW + 0.05, HW - 0.05, -HL + 0.05, HL - 0.05, 1.2, HH, SHEET, MH)
    lgable(Mp, MH, -HW - 0.6, HW + 0.6, -HL - 0.6, HL + 0.6, HH, 3.2, ROOFS, along='y')
    for y in range(-24, 25, 6):                                             # 外露门架柱
        for s in (-1, 1):
            Mp.box(s * HW - 0.25, s * HW + 0.25, y - 0.2, y + 0.2, 0, HH, PAINT, MH)
    for i, y in enumerate((-14, 0, 14)):                                    # 三道卷帘门（朝 -x 车场）
        fbox(Mp, MH, 'X-', -HW, y - 5, y + 5, 0, 8.5, -0.3 if i == 1 else 0.0, 0.05, DARK if i == 1 else SHEET)
        fbox(Mp, MH, 'X-', -HW, y - 5.4, y + 5.4, 8.5, 9.3, 0, 0.6, PAINT)
        for s in (-1, 1):
            fbox(Mp, MH, 'X-', -HW, y + s * 5.2 - 0.2, y + s * 5.2 + 0.2, 0, 8.5, 0, 0.4, HAZ)
        if i != 1:
            for k in range(14):
                fbox(Mp, MH, 'X-', -HW, y - 5, y + 5, 0.6 * k + 0.3, 0.6 * k + 0.33, 0.05, 0.08, STEEL)
        fbox(Mp, MH, 'X-', -HW, y - 0.3, y + 0.3, 9.4, 9.8, 0, 0.5, COLDL)
    # 开着的门里：地坑、举升架、吊车梁、工作灯
    Mp.box(-HW + 0.3, -HW + 14, -4.9, 4.9, 1.15, 1.2, CONC_P, MH)
    Mp.box(-HW + 3, -HW + 11, -1.2, 1.2, 1.19, 1.21, DARK, MH)
    for s in (-1, 1):
        Mp.box(-HW + 2, -HW + 12, s * 3.8 - 0.15, s * 3.8 + 0.15, 9.8, 10.4, HAZ, MH)
        for x in (-HW + 4, -HW + 10):
            Mp.box(x - 0.2, x + 0.2, s * 2.3 - 0.2, s * 2.3 + 0.2, 1.2, 3.2, HAZ, MH)
    Mp.box(-HW + 1, -HW + 1.5, -3.5, 3.5, 8.0, 8.2, COLDL, MH)
    points.append((lpt(MH, -HW + 6, 0, 7), 2500, (0.9, 0.95, 1.0)))
    # 高侧窗带、山墙门、外挂楼梯、屋顶排风
    for side, c in (('X+', HW),):
        fbox(Mp, MH, side, c, -HL + 1, HL - 1, 8.5, 10.5, -0.03, 0.03, GLASSB)
        fbox(Mp, MH, side, c, -3, 3, 1.2, 5.2, -0.03, 0.04, SHEET)
    for side, c in (('Y+', HL), ('Y-', -HL)):
        fbox(Mp, MH, side, c, -12, 12, 9.0, 10.5, -0.03, 0.03, GLASSB)
        fbox(Mp, MH, side, c, 6, 8, 1.2, 3.5, -0.03, 0.04, PAINT)
        fbox(Mp, MH, side, c, 5.5, 8.5, 3.7, 3.85, 0, 1.0, STEEL)
    for y in (-16, -4, 8, 18):
        Mp.cyl(3, y, HH + 1.8, 0.7, 1.4, STEEL, 12, mat=MH)
        Mp.cyl(3, y, HH + 3.2, 0.9, 0.2, STEEL, 12, r2=0.2, mat=MH)
    for k in range(6):                                                    # 墙根污迹
        y = rnd.uniform(-HL + 1, HL - 1)
        fbox(Mp, MH, 'X-', -HW, y, y + rnd.uniform(1, 3), 1.2, rnd.uniform(2, 4), 0.0, 0.02, GRIME)
    # 充电 / 加油岛（车场北端）
    M = F(925, 0.066)
    Mp.box(-6, 6, -1.2, 1.2, 0.05, 0.3, CONC, M)
    for x in (-4, 0, 4):
        Mp.box(x - 0.4, x + 0.4, -0.35, 0.35, 0.3, 2.1, STEEL, M)
        Mp.box(x - 0.3, x + 0.3, -0.36, -0.34, 1.3, 1.8, DARK, M)
        Mp.box(x - 0.1, x + 0.1, -0.37, -0.35, 1.9, 2.0, CYAN, M)
        Mp.tube([lpt(M, x + 0.4, 0, 1.4), lpt(M, x + 0.8, -0.3, 0.8), lpt(M, x + 0.5, -0.4, 0.5)], 0.04, CABLE, n=5)
    Mp.box(-7, 7, -3.5, 3.5, 5.2, 5.6, SHEET, M)
    for x in (-6, 6):
        Mp.box(x - 0.15, x + 0.15, -0.15, 0.15, 0.3, 5.2, PAINT, M)
    Mp.box(-7, 7, -3.5, -3.45, 5.0, 5.2, COLDL, M)

    # ============================================================ props_vehicles：装甲勤务车（无武器、无标识）+ 悬浮运输艇
    Ve = Batch('props_vehicles')
    GLASS_V = GLASS
    def auv(x, y, rz, dirt=1.0, doors_open=False):
        """本地：车头 +y，车宽 x。V 形底盘 + 装甲车厢 + 斜风挡 + 大轮；车顶舱盖关闭，无任何武器。"""
        M = T(x, y, 0, rz)
        # 下车体（V 形截面，沿 y 挤出）
        sec = [(-0.45, 0.55), (0.45, 0.55), (1.15, 1.0), (1.18, 1.5), (-1.18, 1.5), (-1.15, 1.0)]
        n = len(sec)
        vs = [(sx_, yy, sz_) for yy in (-2.85, 1.7) for (sx_, sz_) in sec]
        fs = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        Ve.poly(vs, fs, ARMOR, mat=M)
        # 上车厢（侧截面：后 → 顶 → 风挡 → 发动机盖 → 前脸，沿 x 挤出）
        prof = [(-2.9, 1.45), (1.55, 1.45), (1.55, 2.0), (1.0, 2.72), (-2.75, 2.72), (-2.9, 2.6)]
        n = len(prof)
        vs = [(sx_ * 1.16, py, pz) for sx_ in (-1, 1) for (py, pz) in prof]
        fs = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [((i + 1) % n, i, n + i, n + (i + 1) % n) for i in range(n)]
        Ve.poly(vs, fs, ARMOR, mat=M)
        # 发动机舱（前伸，前脸略斜）
        prof = [(1.5, 0.75), (3.05, 0.75), (3.1, 1.45), (2.95, 1.9), (1.5, 2.0)]
        n = len(prof)
        vs = [(sx_ * 1.02, py, pz) for sx_ in (-1, 1) for (py, pz) in prof]
        fs = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [((i + 1) % n, i, n + i, n + (i + 1) % n) for i in range(n)]
        Ve.poly(vs, fs, ARMOR, mat=M)
        # 格栅 + 大灯（钢笼）+ 推杆 + 拖钩
        Ve.box(-0.7, 0.7, 3.08, 3.11, 1.0, 1.4, DARK, M)
        for k in range(6):
            Ve.box(-0.65 + k * 0.26, -0.6 + k * 0.26, 3.1, 3.13, 1.0, 1.4, STEEL, M)
        for sx_ in (-1, 1):
            Ve.box(sx_ * 0.78 - 0.14, sx_ * 0.78 + 0.14, 3.02, 3.14, 1.48, 1.64, DARK, M)
            Ve.box(sx_ * 0.78 - 0.11, sx_ * 0.78 + 0.11, 3.14, 3.15, 1.5, 1.62, COLDL if dirt < 0.5 else GLASS, M)
            for k in range(3):
                Ve.box(sx_ * 0.78 - 0.13 + k * 0.12, sx_ * 0.78 - 0.11 + k * 0.12, 3.15, 3.19, 1.46, 1.66, STEEL, M)
            Ve.box(sx_ * 0.9 - 0.08, sx_ * 0.9 + 0.08, 3.15, 3.3, 0.7, 0.85, STEEL, M)
        Ve.box(-1.05, 1.05, 3.12, 3.35, 0.55, 0.75, PAINT, M)                                     # 保险杠
        for sx_ in (-0.5, 0.5):
            Ve.box(sx_ - 0.05, sx_ + 0.05, 3.28, 3.38, 0.6, 1.35, PAINT, M)                        # 推杆立柱
        Ve.box(-0.6, 0.6, 3.28, 3.38, 1.25, 1.35, PAINT, M)
        # 风挡（两块厚防弹玻璃，内凹）+ 侧窗（小方窗）
        wsx = [(sx_ * a, py, pz) for sx_, a in ((-1, 1.0), (-1, 0.05), (1, 0.05), (1, 1.0)) for (py, pz) in ((1.53, 2.05), (1.02, 2.66))]
        for s in (-1, 1):
            x0_, x1_ = (-1.02, -0.06) if s < 0 else (0.06, 1.02)
            q = [(x0_, 1.56, 2.07), (x1_, 1.56, 2.07), (x1_, 1.06, 2.66), (x0_, 1.06, 2.66)]
            Ve.poly(q, [(0, 1, 2, 3)], GLASS, mat=M)
            Ve.poly([(p[0], p[1] + 0.01, p[2] - 0.01) for p in q], [(3, 2, 1, 0)], DARK, mat=M)
        Ve.box(-0.05, 0.05, 1.0, 1.6, 2.0, 2.72, ARMOR, M)                                         # 中柱
        for sx_ in (-1, 1):
            for py in (-0.2, -1.9):
                Ve.box(sx_ * 1.16 - 0.01, sx_ * 1.18, py - 0.35, py + 0.35, 1.95, 2.45, GLASS, M)
                Ve.box(sx_ * 1.17, sx_ * 1.2, py - 0.42, py + 0.42, 1.88, 1.95, ARMOR, M)
                Ve.box(sx_ * 1.17, sx_ * 1.2, py - 0.42, py + 0.42, 2.45, 2.52, ARMOR, M)
            # 车门：门缝 + 铰链 + 把手
            for (py0, py1) in ((-0.75, 0.55), (-2.4, -1.25)):
                Ve.box(sx_ * 1.16, sx_ * 1.175, py0 - 0.02, py0 + 0.02, 1.2, 2.6, DARK, M)
                Ve.box(sx_ * 1.16, sx_ * 1.175, py1 - 0.02, py1 + 0.02, 1.2, 2.6, DARK, M)
                for hz in (1.5, 2.3):
                    Ve.box(sx_ * 1.17, sx_ * 1.24, py1 - 0.1, py1 + 0.02, hz, hz + 0.12, STEEL, M)
                Ve.box(sx_ * 1.17, sx_ * 1.23, py0 + 0.1, py0 + 0.3, 1.75, 1.8, STEEL, M)
            # 后视镜
            Ve.box(sx_ * 1.2, sx_ * 1.55, 1.3, 1.34, 2.05, 2.09, STEEL, M)
            Ve.box(sx_ * 1.45, sx_ * 1.6, 1.28, 1.36, 1.85, 2.2, DARK, M)
            # 踏板
            Ve.box(sx_ * 1.0, sx_ * 1.3, -2.3, 0.4, 0.8, 0.86, STEEL, M)
            # 轮拱挡泥（前后）
            for (py, w_) in ((2.1, 1.45), (-1.75, 1.45)):
                Ve.box(sx_ * 1.02, sx_ * 1.34, py - w_ / 2, py + w_ / 2, 1.42, 1.52, ARMOR, M)
                Ve.box(sx_ * 1.3, sx_ * 1.34, py - w_ / 2, py - w_ / 2 + 0.08, 0.9, 1.45, ARMOR, M)
                Ve.box(sx_ * 1.3, sx_ * 1.34, py + w_ / 2 - 0.08, py + w_ / 2, 0.9, 1.45, ARMOR, M)
            # 泥污（下半截 + 轮后泥点）
            Ve.box(sx_ * 1.18, sx_ * 1.185, -2.85, 1.7, 1.0, 1.0 + 0.5 * dirt, MUD, M)
            Ve.box(sx_ * 1.16, sx_ * 1.165, -2.9, 1.5, 1.45, 1.45 + 0.35 * dirt, MUD, M)
            # 侧面储物箱
            for py in (2.1, -1.75):
                wheel(Ve, M, sx_ * 1.12, py, 0.6, 0.6, 0.45)
        # 后门 + 备胎 + 尾灯 + 梯子
        Ve.box(-0.55, 0.55, -2.92, -2.9, 1.1, 2.5, DARK, M)
        Ve.box(-0.52, 0.52, -2.95, -2.92, 1.12, 2.48, ARMOR, M)
        Ve.box(-0.1, 0.1, -3.0, -2.95, 2.1, 2.3, GLASS, M)
        R = M @ Matrix.Translation((0.72, -3.1, 1.95)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
        Ve.cyl(0, 0, -0.18, 0.5, 0.36, RUBBER, 16, mat=R)
        Ve.cyl(0, 0, -0.2, 0.28, 0.04, RIM, 10, smooth=False, mat=R)
        for sx_ in (-1, 1):
            Ve.box(sx_ * 1.0 - 0.1, sx_ * 1.0 + 0.1, -2.97, -2.9, 1.6, 1.9, RED, M)
        for k in range(5):
            Ve.box(-0.9, -0.65, -3.05, -3.0, 0.7 + k * 0.35, 0.74 + k * 0.35, STEEL, M)
        for sx_ in (-0.9, -0.65):
            Ve.box(sx_ - 0.02, sx_ + 0.02, -3.05, -3.0, 0.7, 2.5, STEEL, M)
        # 车顶：关闭的圆舱盖、行李框、储物箱、短天线座（无武器）
        R = M @ Matrix.Translation((0, -0.8, 2.72))
        Ve.cyl(0, 0, 0, 0.45, 0.12, ARMOR, 16, mat=R)
        Ve.cyl(0, 0, 0.12, 0.38, 0.06, ARMOR, 16, mat=R)
        Ve.box(-0.1, 0.1, -1.3, -1.2, 2.84, 2.9, STEEL, M)
        for sx_ in (-1, 1):
            Ve.tube([tuple(M @ Vector((sx_ * 0.95, py, 2.72 + h_))) for (py, h_) in ((-2.6, 0.0), (-2.6, 0.25), (0.6, 0.25), (0.6, 0.0))], 0.025, STEEL, n=5)
        Ve.box(-0.8, 0.8, -2.5, -1.7, 2.72, 3.05, PAINT, M)
        Ve.box(-0.8, 0.8, -2.5, -1.7, 3.05, 3.08, ARMOR, M)
        Ve.cyl(0.8, 0.9, 2.72, 0.06, 0.1, STEEL, 8, mat=M)
        Ve.poly([(0.8, 0.9, 2.82), (0.8, 0.95, 2.82), (0.8, 0.95, 4.4)], [(0, 1, 2), (2, 1, 0)], CABLE, mat=M)
        # 底盘阴影块、排气
        Ve.box(-0.9, 0.9, -2.3, 2.6, 0.45, 0.55, DARK, M)
        Ve.cyl(1.2, 1.4, 1.5, 0.06, 1.3, STEEL, 8, mat=M)
        # 车身锈蚀擦痕
        for k in range(6):
            sx_ = rnd.choice((-1, 1)); py = rnd.uniform(-2.6, 1.3); pz = rnd.uniform(1.2, 2.5)
            Ve.box(sx_ * 1.161, sx_ * 1.165, py, py + rnd.uniform(0.1, 0.5), pz, pz + rnd.uniform(0.02, 0.06), BRIGHT if k % 2 else RUST, M)

    def hover(M, lights=True):
        """悬浮运输艇：本地机头 +y。机身放样 + 四个涵道风扇 + 起落滑橇 + 后部货舱门缝。无武器、无标识。"""
        st = [(-7.0, 1.0, 1.6, 3.3), (-6.2, 1.55, 1.2, 3.9), (-2.0, 1.8, 0.9, 4.1), (2.5, 1.8, 0.9, 4.0),
              (4.6, 1.5, 1.1, 3.6), (6.2, 0.9, 1.5, 2.8), (6.9, 0.35, 1.9, 2.3)]
        ring = lambda w, zb, zt: [(-w * 0.55, zb), (w * 0.55, zb), (w, zb + (zt - zb) * 0.3), (w, zb + (zt - zb) * 0.7),
                                   (w * 0.6, zt), (-w * 0.6, zt), (-w, zb + (zt - zb) * 0.7), (-w, zb + (zt - zb) * 0.3)]
        vs, fs = [], []
        for (y, w, zb, zt) in st:
            vs += [(x, y, z) for (x, z) in ring(w, zb, zt)]
        n = 8
        for j in range(len(st) - 1):
            for i in range(n):
                fs.append((j * n + i, (j + 1) * n + i, (j + 1) * n + (i + 1) % n, j * n + (i + 1) % n))
        fs.append(tuple(range(n)))
        last = (len(st) - 1) * n
        fs.append(tuple(range(last + n - 1, last - 1, -1)))
        Ve.poly(vs, fs, HULL, mat=M, smooth=False)
        # 驾驶舱玻璃（机头上斜面）
        q = [(-1.2, 4.7, 3.55), (1.2, 4.7, 3.55), (0.75, 6.1, 2.75), (-0.75, 6.1, 2.75)]
        Ve.poly([(x, y, z + 0.04) for (x, y, z) in q], [(0, 1, 2, 3)], GLASSB, mat=M)
        for s in (-1, 1):
            Ve.poly([(s * 1.53, 4.9, 2.4), (s * 1.53, 5.9, 2.2), (s * 1.3, 5.9, 2.8), (s * 1.4, 4.9, 3.2)], [(0, 1, 2, 3) if s > 0 else (3, 2, 1, 0)], GLASSB, mat=M)
        # 侧舱门缝 + 小舷窗
        for s in (-1, 1):
            Ve.box(s * 1.81 - 0.01, s * 1.81 + 0.01, -0.5, -0.46, 1.3, 3.5, DARK, M)
            Ve.box(s * 1.81 - 0.01, s * 1.81 + 0.01, 1.6, 1.64, 1.3, 3.5, DARK, M)
            for y in (-3.5, -2.0):
                Ve.box(s * 1.8 - 0.02, s * 1.8 + 0.02, y - 0.3, y + 0.3, 2.6, 3.1, GLASSB, M)
        Ve.box(-1.0, 1.0, -7.05, -6.98, 1.8, 3.1, DARK, M)                         # 后货舱门缝
        Ve.box(-0.95, 0.95, -7.1, -7.02, 1.85, 3.05, HULL, M)
        # 涵道风扇 ×4（机身两侧支臂）
        for (fy, fs_) in ((4.0, 1), (-4.6, 1)):
            for s in (-1, 1):
                fx = s * 3.9
                beam(Ve, lpt(M, s * 1.7, fy, 2.4), lpt(M, fx - s * 1.45, fy, 2.4), 0.45, HULL)
                Ve.cyl(fx, fy, 2.0, 1.55, 0.9, HULL, 20, cap=False, mat=M)
                Ve.cyl(fx, fy, 2.0, 1.4, 0.9, DARK, 20, cap=False, mat=M)
                Ve.cyl(fx, fy, 2.35, 0.3, 0.3, STEEL, 10, mat=M)
                for k in range(6):
                    Ve.box(0.25, 1.38, -0.1, 0.1, -0.02, 0.02, STEEL, M @ Matrix.Translation((fx, fy, 2.5)) @ Matrix.Rotation(k * math.tau / 6 + 0.2, 4, 'Z'))
                Ve.box(fx - 1.4, fx + 1.4, fy - 0.06, fy + 0.06, 2.05, 2.1, STEEL, M)
                Ve.box(fx - s * 1.5 - 0.06, fx - s * 1.5 + 0.06, fy - 0.1, fy + 0.1, 2.3, 2.5, RED if s < 0 else CYAN, M) if lights else None
        # 起落滑橇
        for s in (-1, 1):
            Ve.box(s * 1.3 - 0.1, s * 1.3 + 0.1, -5.5, 4.2, 0.0, 0.18, STEEL, M)
            for y in (-4, 2.8):
                beam(Ve, lpt(M, s * 1.3, y, 0.15), lpt(M, s * 0.9, y, 1.05), 0.14, STEEL)
        Ve.box(-0.12, 0.12, -1, -0.8, 3.3, 3.5, RED, M)                             # 顶部防撞灯
        for k in range(4):                                                        # 蒙皮擦痕 / 污迹
            s = rnd.choice((-1, 1)); y = rnd.uniform(-6, 3)
            Ve.box(s * 1.8 - 0.012, s * 1.8 + 0.012, y, y + rnd.uniform(0.6, 1.8), 1.0, rnd.uniform(1.3, 1.8), GRIME, M)

    # 车场：两列勤务车（车头朝车道，外侧一列朝外、内侧一列朝内），一台在维修大厅开着的门里
    for i, aa in enumerate((-0.017, -0.0063, 0.0045, 0.0152, 0.026, 0.0367)):
        if i != 3:
            p = P(937, aa); auv(p[0], p[1], -aa - math.pi / 2, dirt=rnd.uniform(0.2, 0.9))
        if i not in (1, 4):
            p = P(909.5, aa); auv(p[0], p[1], -aa + math.pi / 2, dirt=rnd.uniform(0.2, 0.9))
    p = lpt(MH, -HW + 5.5, 0, 1.2)
    Mt = Matrix.Translation(p) @ Matrix.Rotation(-0.022 - math.pi / 2, 4, 'Z')
    p = lpt(MH, -HW - 4.0, 0, 0)
    auv(p[0], p[1], -0.022 + math.pi / 2 + 0.25, dirt=1.0)                   # 刚开出维修门
    for (r, aa) in HOVER_PADS:
        hover(F(r, aa, 0.1) @ Matrix.Rotation(math.pi / 2 if r > 920 else -math.pi / 2, 4, 'Z'))

    # ============================================================ props_edge：护墙、外周围栏 + 大门、岗亭、瞭望塔
    Ed = Batch('props_edge')
    # 甲板边加固胸墙（朝外）：厚混凝土墙 + 外挑压顶 + 内侧步道；每 60 m 一座外凸棱堡，顶上是朝外的探照灯
    sector(Ed, 996.4, 1000, A0, A1, 0.0, 3.0, CONC_D, seg=5)
    sector(Ed, 996.1, 1000.5, A0, A1, 3.0, 3.4, CONC, seg=5)
    sector(Ed, 994.2, 996.4, A0, A1, 0.0, 0.9, CONC, seg=5)                    # 内侧踏步 / 巡逻台
    a = A0 + 0.005
    while a < A1:                                                           # 墙面扶壁 + 内侧灯
        radial(Ed, 999.9, 1000.8, a, 1.2, -2.0, 3.4, CONC)
        radial(Ed, 996.3, 996.4, a + 0.006, 0.6, 1.8, 2.0, SODL)
        a += 12 / 1000
    BAST = []
    a = A0 + 0.03
    while a < A1 - 0.01:
        if abs(a - (-0.018)) > 0.02:
            BAST.append(a)
        a += 60 / 1000
    pent = [(4.0, -7.5), (-3.0, -7.5), (-6.5, -4.0), (-6.5, 4.0), (-3.0, 7.5), (4.0, 7.5)]
    for a in BAST:
        M = F(1000, a)
        n = len(pent)
        for (z0, z1, m, g) in ((-2.5, 4.2, CONC_D, 0.0), (4.2, 4.6, CONC, 0.35)):
            pp = [(x - (g if x < 0 else 0), y * (1 + g / 7.5), 0) for (x, y) in pent]
            vs = [(x, y, z0) for (x, y, _) in pp] + [(x, y, z1) for (x, y, _) in pp]
            fs = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
            Ed.poly(vs, fs, m, mat=M)
        for y in (-5.0, 0.0, 5.0):                                            # 斜撑托架（甲板边下）
            beam(Ed, lpt(M, 1.0, y, -12.0), lpt(M, -5.5, y, -2.5), 1.0, CONC)
        Ed.box(-2.0, 2.0, -8.0, -7.5, 4.6, 5.6, CONC, M) if a < 0 else None
        # 探照灯：底座 + 回转台 + 灯筒（朝外 -x，略向下）
        Ed.cyl(-2.5, 0, 4.6, 1.0, 0.6, STEEL, 12, mat=M)
        Ed.cyl(-2.5, 0, 5.2, 0.7, 0.9, PAINT, 12, mat=M)
        Ms = M @ Matrix.Translation((-2.5, 0, 6.6)) @ Matrix.Rotation(-0.12, 4, 'Y') @ Matrix.Rotation(-math.pi / 2, 4, 'Y')
        Ed.cyl(0, 0, -0.6, 0.85, 1.6, PAINT, 16, mat=Ms)
        Ed.cyl(0, 0, 1.0, 0.8, 0.05, COLDL, 16, mat=Ms)
        for s in (-1, 1):
            Ed.box(-2.9, -2.1, s * 0.95 - 0.08, s * 0.95 + 0.08, 5.9, 7.0, STEEL, M)
        spots.append((lpt(M, -3.6, 0, 6.5), lpt(M, -420, 0, -330), 4.0e6, (0.85, 0.92, 1.0), 7))

    def fence(r0, r1, a0, a1, h=3.2, gap=None, rgaps=()):
        """钢立柱 + 焊接网片 + 顶部斜撑三股钢丝（沿弧或径向；径向可留路口 rgaps）"""
        if a0 == a1:   # 径向
            cuts = [r0]
            for (g0, g1) in sorted(rgaps):
                cuts += [g0, g1]
            cuts.append(r1)
            for (s0, s1) in zip(cuts[::2], cuts[1::2]):
                n = max(1, int(abs(s1 - s0) / 3))
                for i in range(n + 1):
                    r = s0 + (s1 - s0) * i / n
                    radial(Ed, r - 0.06, r + 0.06, a0, 0.12, 0, h, PAINT)
                radial(Ed, s0, s1, a0, 0.03, 0.1, h - 0.1, MESH)
                radial(Ed, s0, s1, a0, 0.08, h - 0.08, h, STEEL)
                for k in range(3):
                    radial(Ed, s0, s1, a0 + (0.1 + k * 0.12) / r0, 0.02, h + 0.1 + k * 0.1, h + 0.12 + k * 0.1, CABLE)
            return
        r = r0
        n = max(1, int(abs(a1 - a0) * r / 3))
        for i in range(n + 1):
            aa = a0 + (a1 - a0) * i / n
            if gap and gap[0] < aa < gap[1]:
                continue
            radial(Ed, r - 0.06, r + 0.06, aa, 0.12, 0, h, PAINT)
            M = F(r, aa)
            Ed.box(0.0, 0.45, -0.03, 0.03, h, h + 0.08, STEEL, M @ Matrix.Translation((0, 0, h)) @ Matrix.Rotation(0.6, 4, 'Y') @ Matrix.Translation((0, 0, -h)))
        segs = [(a0, a1)] if not gap else [(a0, gap[0]), (gap[1], a1)]
        for (s0, s1) in segs:
            sector(Ed, r - 0.015, r + 0.015, s0, s1, 0.1, h - 0.1, MESH, seg=6)
            sector(Ed, r - 0.04, r + 0.04, s0, s1, h - 0.08, h, STEEL, seg=6)
            for k in range(3):
                sector(Ed, r - 0.1 - k * 0.12, r - 0.08 - k * 0.12, s0, s1, h + 0.1 + k * 0.1, h + 0.12 + k * 0.1, CABLE, seg=6)

    FA0, FA1 = -0.155, 0.085
    fence(991, 991, FA0, FA1)
    GATE = (-0.095, -0.08)
    fence(858, 858, FA0, FA1, gap=GATE)
    RG = ((944.0, 957.0), (976.0, 990.0))
    fence(858, 991, FA0, FA0, rgaps=RG)
    fence(858, 991, FA1, FA1, rgaps=RG)

    def side_gate(r0, r1, a, booth_side=-1):
        """径向围栏上的路口大门：两根门柱（顶灯 + 霓虹条）、收起的滑门、升降杆、岗亭、减速带"""
        rc = (r0 + r1) / 2; half = (r1 - r0) / 2
        M = F(rc, a)
        for s in (-1, 1):
            Ed.box(s * (half + 0.7) - 0.6, s * (half + 0.7) + 0.6, -0.6, 0.6, 0, 4.2, CONC, M)
            Ed.box(s * (half + 0.7) - 0.7, s * (half + 0.7) + 0.7, -0.7, 0.7, 4.2, 4.5, CONC_D, M)
            Ed.box(s * (half + 0.7) - 0.2, s * (half + 0.7) + 0.2, -0.2, 0.2, 4.5, 4.8, COLDL, M)
            Ed.box(s * (half + 0.7) - 0.05, s * (half + 0.7) + 0.05, -0.62, -0.6, 0.6, 3.8, NEON, M)
        Ed.box(-half, half, -0.3, 0.3, 0, 0.08, HAZ, M)
        Ed.box(-half + 0.3, -0.3, 1.0, 1.25, 0.95, 1.1, HAZ, M)
        Ed.box(half - 0.9, half - 0.4, 0.8, 1.3, 0, 1.1, PAINT, M)
        for x in (-half, half):
            Ed.box(x - 0.05, x + 0.05, -0.1, 0.1, 0.1, 2.8, STEEL, M)
        Mb = M @ Matrix.Translation((0, booth_side * 6.0, 0))
        Ed.box(-2, 2, -1.8, 1.8, 0, 0.3, CONC, Mb)
        Ed.box(-1.8, 1.8, -1.6, 1.6, 0.3, 1.2, CONC, Mb)
        Ed.box(-1.8, 1.8, -1.6, 1.6, 1.2, 2.6, GLASSB, Mb)
        for (x, y) in ((-1.8, -1.6), (1.8, -1.6), (-1.8, 1.6), (1.8, 1.6)):
            Ed.box(x - 0.08, x + 0.08, y - 0.08, y + 0.08, 1.2, 2.6, PAINT, Mb)
        Ed.box(-2.3, 2.3, -2.1, 2.1, 2.6, 2.9, CONC_D, Mb)
        Ed.box(-2.3, 2.3, -2.12, -2.1, 2.62, 2.78, LEDC, Mb)
        points.append((lpt(Mb, 0, 0, 2.2), 150, (1.0, 0.85, 0.65)))
        spots.append((lpt(M, 0, 0, 8.0), lpt(M, 0, -2, 0), 1.5e4, (0.85, 0.92, 1.0), 70))

    side_gate(976.0, 990.0, FA1, booth_side=-1)
    side_gate(944.0, 957.0, FA1, booth_side=-1)
    side_gate(976.0, 990.0, FA0, booth_side=1)
    # 主门（内侧围栏）：滑动钢门（半开）、门柱、岗亭、升降杆、减速带、门顶灯
    ga = (GATE[0] + GATE[1]) / 2
    M = F(858, ga)
    for s in (-1, 1):
        Ed.box(-0.6, 0.6, s * 7.2 - 0.6, s * 7.2 + 0.6, 0, 4.2, CONC, M)
        Ed.box(-0.7, 0.7, s * 7.2 - 0.7, s * 7.2 + 0.7, 4.2, 4.5, CONC_D, M)
        Ed.box(-0.2, 0.2, s * 7.2 - 0.2, s * 7.2 + 0.2, 4.5, 4.8, COLDL, M)
    for k in range(9):                                                       # 滑门（缩在一侧）
        y = 3.0 + k * 1.1
        Ed.box(-0.35, -0.3, y - 0.05, y + 0.05, 0.25, 2.9, STEEL, M)
    Ed.box(-0.36, -0.29, 2.9, 12.0, 2.8, 2.95, STEEL, M)
    Ed.box(-0.36, -0.29, 2.9, 12.0, 0.2, 0.35, STEEL, M)
    Ed.box(-0.4, -0.25, 2.9, 12.0, 0.0, 0.2, PAINT, M)
    for s in (-1, 1):                                                        # 升降杆（两道：进 / 出）
        Ed.box(4.0, 4.5, s * 6.3 - 0.25, s * 6.3 + 0.25, 0, 1.1, PAINT, M)
        Ed.box(4.1, 4.4, s * 6.3 - s * 5.6, s * 6.3, 0.95, 1.08, HAZ, M)
    for x in (-3.0, 7.0):                                                    # 减速带
        Ed.box(x - 0.3, x + 0.3, -6.5, 6.5, 0, 0.08, HAZ, M)
    # 岗亭（门内侧）
    Mb = F(866, ga + 0.012)
    Ed.box(-2, 2, -1.8, 1.8, 0, 0.3, CONC, Mb)
    Ed.box(-1.8, 1.8, -1.6, 1.6, 0.3, 1.2, CONC, Mb)
    Ed.box(-1.8, 1.8, -1.6, 1.6, 1.2, 2.6, GLASSB, Mb)
    for (x, y) in ((-1.8, -1.6), (1.8, -1.6), (-1.8, 1.6), (1.8, 1.6)):
        Ed.box(x - 0.08, x + 0.08, y - 0.08, y + 0.08, 1.2, 2.6, PAINT, Mb)
    Ed.box(-2.3, 2.3, -2.1, 2.1, 2.6, 2.9, CONC_D, Mb)
    Ed.box(-0.5, 0.5, -0.4, 0.4, 2.9, 3.4, SHEET, Mb)
    # 外周路上的第二道门（外周围栏）只做门柱 + 固定网门
    # 瞭望塔（甲板边）：混凝土筒身、外挂钢梯、观察室（环窗、挑出平台）、泛光灯、天线（无武器）
    TA = -0.018
    TM = F(994.5, TA)
    TH = 30.0
    Ed.box(-3.5, 3.5, -3.5, 3.5, 0, 1.0, CONC_D, TM)
    Ed.box(-2.4, 2.4, -2.4, 2.4, 1.0, TH, CONC, TM)
    for k in range(6):
        z = 3 + k * 4.6
        Ed.box(-0.5, 0.5, -2.45, -2.4, z, z + 1.2, GLASS, TM)
    for k in range(int(TH / 3)):                                             # 外挂之字梯（内侧 +x）
        z = 1 + k * 3.0
        s = 1 if k % 2 else -1
        beam(Ed, lpt(TM, 3.2, -s * 2.0, z), lpt(TM, 3.2, s * 2.0, z + 3.0), 0.5, STEEL)
        Ed.box(2.4, 4.0, s * 2.0 - 0.8, s * 2.0 + 0.8, z + 2.9, z + 3.02, STEEL, TM)
        Ed.box(3.95, 4.0, -2.8, 2.8, z + 3.9, z + 3.95, STEEL, TM)
    for y in (-2.8, 2.8):
        Ed.box(3.95, 4.0, y - 0.03, y + 0.03, 1.0, TH, STEEL, TM)
    Ed.box(-4.2, 4.2, -4.2, 4.2, TH, TH + 0.4, CONC_D, TM)                   # 平台
    for k in range(24):                                                      # 平台栏杆
        a = k * math.tau / 24
        x, y = 4.0 * max(-1, min(1, 1.5 * math.cos(a))), 4.0 * max(-1, min(1, 1.5 * math.sin(a)))
        Ed.box(x - 0.04, x + 0.04, y - 0.04, y + 0.04, TH + 0.4, TH + 1.5, STEEL, TM)
    for s in (-1, 1):
        Ed.box(-4.05, 4.05, s * 4.0 - 0.04, s * 4.0 + 0.04, TH + 1.45, TH + 1.55, STEEL, TM)
        Ed.box(s * 4.0 - 0.04, s * 4.0 + 0.04, -4.05, 4.05, TH + 1.45, TH + 1.55, STEEL, TM)
    Ed.box(-3.0, 3.0, -3.0, 3.0, TH + 0.4, TH + 1.1, CONC, TM)               # 观察室
    Ed.box(-3.0, 3.0, -3.0, 3.0, TH + 1.1, TH + 3.4, GLASSB, TM)
    for (x, y) in ((-3, -3), (3, -3), (-3, 3), (3, 3), (0, -3), (0, 3), (-3, 0), (3, 0)):
        Ed.box(x - 0.1, x + 0.1, y - 0.1, y + 0.1, TH + 1.1, TH + 3.4, PAINT, TM)
    Ed.box(-3.7, 3.7, -3.7, 3.7, TH + 3.4, TH + 3.8, CONC_D, TM)
    Ed.box(-1.2, 1.2, -1.2, 1.2, TH + 3.8, TH + 4.8, SHEET, TM)
    Ed.box(0.8, 0.95, 0.8, 0.95, TH + 3.8, TH + 11, STEEL, TM)               # 天线桅
    Ed.box(0.78, 0.97, 0.78, 0.97, TH + 11, TH + 11.3, RED, TM)
    Ed.cyl(-0.8, -0.8, TH + 4.8, 0.7, 0.9, STEEL, 16, r2=0.1, mat=TM)       # 雷达罩（气象 / 探测，非武器）
    Ed.sphere(-0.8, -0.8, TH + 6.2, 0.9, LINEW, seg=16, rings=8) if hasattr(Ed, 'sphere') else None
    for s in (-1, 1):                                                        # 泛光灯（朝城外 -x）
        Mf = TM @ Matrix.Translation((-3.3, s * 2.0, TH + 3.6)) @ Matrix.Rotation(-0.35, 4, 'Y')
        Ed.box(-0.5, 0.2, -0.45, 0.45, -0.35, 0.35, DARK, Mf)
        Ed.box(-0.52, -0.5, -0.4, 0.4, -0.3, 0.3, COLDL, Mf)
    for k in range(6):
        z = rnd.uniform(3, TH - 2)
        Ed.box(-2.41, -2.4, rnd.uniform(-2, 1), rnd.uniform(1.2, 2.2), z - 2, z, GRIME, TM)

    # ============================================================ props_academy_*：军事学院
    AM = F(905, 0.17)                     # 局部：+x 朝城内，+y 向北
    Am = Batch('props_academy_main')
    Ab = Batch('props_academy_blocks')
    As = Batch('props_academy_sports')
    Q0, Q1 = -38.0, 38.0                  # 方院 x 范围；y 范围 -40..40
    sub = lambda *m: AM @ Matrix.Translation(m)
    # 方院地面：十字铺装 + 四块草坪 + 中心圆形水池（无雕像）
    G.box(Q0, Q1, -40, 40, -0.02, 0.03, PAVE2, AM)
    for (x0, x1, y0, y1) in ((-34, -3, -36, -3), (3, 34, -36, -3), (-34, -3, 3, 36), (3, 34, 3, 36)):
        G.box(x0, x1, y0, y1, 0.03, 0.2, GRASS, AM)
    for (sx_, sy_) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):                    # 草坪对角小径 + 地灯
        x0_, y0_, x1_, y1_ = sx_ * 34, sy_ * 36, sx_ * 5.5, sy_ * 5.5
        ang = math.atan2(y1_ - y0_, x1_ - x0_); ln = math.hypot(x1_ - x0_, y1_ - y0_)
        Mq = AM @ Matrix.Translation(((x0_ + x1_) / 2, (y0_ + y1_) / 2, 0)) @ Matrix.Rotation(ang, 4, 'Z')
        G.box(-ln / 2, ln / 2, -1.2, 1.2, 0.03, 0.23, PAVE2, Mq)
        for k in range(5):
            G.box(-ln / 2 + 4 + k * (ln - 8) / 4 - 0.12, -ln / 2 + 4 + k * (ln - 8) / 4 + 0.12, 1.3, 1.54, 0.2, 0.75, LEDW, Mq)
    for (x0_, x1_) in ((-34, -6), (6, 34)):                                 # 十字铺装两侧的线形地灯
        for y in (-3.1, 2.95):
            G.box(x0_, x1_, y, y + 0.15, 0.03, 0.08, LEDW, AM)
    G.cyl(0, 0, 0.03, 5.5, 0.55, STONE_S, 32, mat=AM)
    G.cyl(0, 0, 0.5, 5.56, 0.06, LEDC, 32, mat=AM)
    G.cyl(0, 0, 0.58, 5.0, 0.02, GLASSB, 32, mat=AM)
    # --- 主楼（外侧 x -60..-38，正面朝方院 +x）
    X0, X1, Y0, Y1 = -60.0, -38.0, -46.0, 46.0
    MHt = 18.0
    Am.box(X0, X1, Y0, Y1, 0, 1.6, STONE, AM)                                   # 台基
    Am.box(X0 + 0.3, X1 - 0.3, Y0 + 0.3, Y1 - 0.3, 1.6, MHt, STONE_S, AM)
    Am.box(X0 - 0.1, X1 + 0.1, Y0 - 0.1, Y1 + 0.1, 1.6, 5.8, STONE, AM)         # 粗面石底层
    Am.box(X0 - 0.5, X1 + 0.5, Y0 - 0.5, Y1 + 0.5, MHt, MHt + 0.5, STONE, AM)   # 檐口
    Am.box(X0 - 0.8, X1 + 0.8, Y0 - 0.8, Y1 + 0.8, MHt + 0.5, MHt + 0.9, STONE, AM)
    ledring(Am, AM, X0 - 0.84, X1 + 0.84, Y0 - 0.84, Y1 + 0.84, MHt + 0.62)
    ledring(Am, AM, X0 - 0.14, X1 + 0.14, Y0 - 0.14, Y1 + 0.14, 5.7, m=LEDC, t=0.1)
    lgable(Am, AM, X0, X1, Y0, Y1, MHt + 0.9, 5.0, SLATE, along='y', over=0.5)
    for side, c in (('X+', X1 - 0.3), ('X-', X0 + 0.3)):
        for u0, u1 in ((Y0 + 1, -9), (9, Y1 - 1)):
            windows(Am, AM, side, c, u0, u1, 5.8, 3, 4.0, 3.6, 1.6, 2.8, STEEL, lit=0.15, deep=0.35)
            windows(Am, AM, side, c, u0, u1, 1.6, 1, 4.2, 3.6, 1.4, 2.0, STEEL, lit=0.1, deep=0.25)
        nb = int((Y1 - Y0) / 3.6)
        for i in range(nb + 1):                                                 # 壁柱
            u = Y0 + 1 + (Y1 - Y0 - 2) * i / nb
            if -9 < u < 9:
                continue
            fbox(Am, AM, side, c, u - 0.35, u + 0.35, 5.8, MHt, 0, 0.45, STONE)
    for side, c in (('Y+', Y1 - 0.3), ('Y-', Y0 + 0.3)):
        windows(Am, AM, side, c, X0 + 2, X1 - 2, 5.8, 3, 4.0, 3.6, 1.6, 2.8, STEEL, lit=0.1, deep=0.35)
    # 门廊：六根柱 + 山花 + 台阶
    PX = X1 + 6
    Am.box(X1, PX, -10, 10, 0, 1.6, STONE, AM)
    for k in range(5):
        Am.box(PX + k * 0.9, PX + (k + 1) * 0.9, -9 + k * 0.3, 9 - k * 0.3, 0, 1.6 - 0.32 * (k + 1) + 0.32, STONE, AM)
    for y in (-8.5, -5.1, -1.7, 1.7, 5.1, 8.5):
        Am.box(PX - 1.5, PX - 0.1, y - 0.7, y + 0.7, 1.6, 2.1, STONE, AM)
        Am.cyl(PX - 0.8, y, 2.1, 0.55, 12.4, STONE_S, 16, r2=0.48, mat=AM)
        Am.box(PX - 1.5, PX - 0.1, y - 0.7, y + 0.7, 14.5, 15.0, STONE, AM)
    Am.box(X1, PX + 0.3, -10.2, 10.2, 15.0, 16.4, STONE, AM)                   # 额枋
    lgable(Am, AM, X1, PX + 0.4, -10.4, 10.4, 16.4, 3.4, STONE, along='x')     # 山花（实心、无浮雕）
    for y in (-3.4, 0, 3.4):                                                   # 门廊内三道大门
        fbox(Am, AM, 'X+', X1 - 0.3, y - 1.2, y + 1.2, 1.6, 6.6, -0.05, 0.05, DARK)
        fbox(Am, AM, 'X+', X1 - 0.3, y - 1.1, y + 1.1, 1.6, 6.4, 0.05, 0.1, PAINT)
        fbox(Am, AM, 'X+', X1 - 0.3, y - 1.1, y + 1.1, 4.8, 6.3, 0.1, 0.12, WINL)
    # 中央塔楼（无钟面、无文字）：方身 → 开敞的拱廊层 → 八角灯亭 → 尖顶
    TX = X0 + 11
    Am.box(TX - 7, TX + 7, -7, 7, MHt, 34, STONE_S, AM)
    Am.box(TX - 7.3, TX + 7.3, -7.3, 7.3, 26, 26.6, STONE, AM)
    for side, c in (('X+', TX + 7), ('X-', TX - 7), ('Y+', 7), ('Y-', -7)):
        u0 = -5 if side[0] == 'X' else TX - 5
        for k in range(3):
            u = u0 + 1.7 + k * 3.3
            fbox(Am, AM, side, c, u - 0.9, u + 0.9, 28, 32.5, -0.03, 0.02, GLASS)    # 竖窗
            fbox(Am, AM, side, c, u - 1.1, u + 1.1, 27.7, 28.0, 0, 0.3, STONE)
        fbox(Am, AM, side, c, u0 + 3.8, u0 + 6.2, 20, 24.5, -0.03, 0.02, GLASS)
    Am.box(TX - 7.5, TX + 7.5, -7.5, 7.5, 34, 35, STONE, AM)
    ledring(Am, AM, TX - 7.54, TX + 7.54, -7.54, 7.54, 34.4)
    for (dx, dy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):                       # 塔身四角竖向灯带
        Am.box(TX + dx * 7.0 - 0.08, TX + dx * 7.0 + 0.08, dy * 7.0 - 0.08, dy * 7.0 + 0.08, MHt + 1, 34, LEDC, AM)
    Am.box(TX - 6, TX + 6, -6, 6, 35, 36, STONE, AM)
    # 拱廊层：四角墩 + 每面三开间的敞口（露出暗内部）
    Am.box(TX - 4.5, TX + 4.5, -4.5, 4.5, 36, 44, DARK, AM)
    for (dx, dy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        Am.box(TX + dx * 5.6 - 0.9, TX + dx * 5.6 + 0.9, dy * 5.6 - 0.9, dy * 5.6 + 0.9, 36, 44, STONE_S, AM)
    for side, c in (('X+', TX + 5.5), ('X-', TX - 5.5), ('Y+', 5.5), ('Y-', -5.5)):
        u0 = -4.7 if side[0] == 'X' else TX - 4.7
        for k in range(4):
            u = u0 + k * 3.13
            fbox(Am, AM, side, c, u - 0.3, u + 0.3, 36, 44, -0.4, 0.4, STONE_S)
        fbox(Am, AM, side, c, u0 - 1, u0 + 10.4, 42.2, 44, -0.4, 0.4, STONE_S)
        fbox(Am, AM, side, c, u0 - 1, u0 + 10.4, 36, 37.2, -0.4, 0.5, STONE)  # 栏板
    Am.box(TX - 6.8, TX + 6.8, -6.8, 6.8, 44, 45, STONE, AM)
    ledring(Am, AM, TX - 6.84, TX + 6.84, -6.84, 6.84, 44.4)
    Am.cyl(TX, 0, 45, 4.6, 1.2, STONE, 8, smooth=False, mat=AM)
    Am.cyl(TX, 0, 46.2, 3.8, 5.0, STONE_S, 8, smooth=False, mat=AM)
    for k in range(8):
        a = k * math.tau / 8 + math.pi / 8
        Am.box(-0.6, 0.6, -0.04, 0.04, 47, 50.4, GLASS, sub(TX + 3.82 * math.cos(a), 3.82 * math.sin(a), 0) @ Matrix.Rotation(a + math.pi / 2, 4, 'Z'))
    Am.cyl(TX, 0, 51.2, 4.1, 0.5, STONE, 8, smooth=False, mat=AM)
    Am.cyl(TX, 0, 51.7, 3.8, 9.5, SLATE, 8, r2=0.0, smooth=False, mat=AM)
    Am.cyl(TX, 0, 61.2, 0.12, 3.0, BRIGHT, 8, mat=AM)
    Am.box(TX - 0.2, TX + 0.2, -0.2, 0.2, 64.0, 64.3, RED, AM)
    # 主楼屋顶两个小老虎窗 + 烟囱
    for y in (-30, -20, 20, 30):
        Am.box(X1 - 4, X1 - 1.5, y - 1.2, y + 1.2, MHt + 0.9, MHt + 3.2, STONE_S, AM)
        lgable(Am, AM, X1 - 4, X1 - 1.2, y - 1.4, y + 1.4, MHt + 3.2, 1.1, SLATE, along='x')
        fbox(Am, AM, 'X+', X1 - 1.5, y - 0.7, y + 0.7, MHt + 1.2, MHt + 2.9, -0.03, 0.02, GLASS)

    # --- 教学楼（南北两翼 + 内侧门楼）：砖墙、石窗套、4 层
    LH = 4 * 3.8 + 1.0
    for (y0, y1, side) in ((-56.0, -42.0, 'Y+'), (42.0, 56.0, 'Y-')):
        Ab.box(-36, 36, y0, y1, 0, LH, BRICK, AM)
        Ab.box(-36.2, 36.2, y0 - 0.2, y1 + 0.2, 0, 1.0, STONE, AM)
        Ab.box(-36.5, 36.5, y0 - 0.5, y1 + 0.5, LH, LH + 0.6, STONE, AM)
        ledring(Ab, AM, -36.54, 36.54, y0 - 0.54, y1 + 0.54, LH + 0.2)
        lgable(Ab, AM, -36, 36, y0, y1, LH + 0.6, 4.0, SLATE, along='x', over=0.4)
        c_in = y1 if side == 'Y+' else y0
        c_out = y0 if side == 'Y+' else y1
        oside = 'Y-' if side == 'Y+' else 'Y+'
        windows(Ab, AM, side, c_in, -35, 35, 1.0, 4, 3.8, 3.5, 1.7, 2.4, STEEL, lit=0.2)
        windows(Ab, AM, oside, c_out, -35, 35, 1.0, 4, 3.8, 3.5, 1.7, 2.4, STEEL, lit=0.15)
        # 方院一侧的连续拱廊（底层，敞口）
        for k in range(15):
            x = -35 + k * 5
            fbox(Ab, AM, side, c_in, x - 0.45, x + 0.45, 0, 4.2, 0, 3.5, STONE_S)
        fbox(Ab, AM, side, c_in, -35.5, 35.5, 4.2, 4.9, 0, 3.6, STONE_S)
        fbox(Ab, AM, side, c_in, -35.5, 35.5, 4.9, 5.1, 0, 3.8, STONE)
        for s in (-1, 1):                                                     # 楼梯间凸出体
            fbox(Ab, AM, oside, c_out, s * 18 - 3, s * 18 + 3, 0, LH + 2.0, 0, 3.0, BRICK)
            fbox(Ab, AM, oside, c_out, s * 18 - 1, s * 18 + 1, 2, LH - 1, 3.0, 3.03, GLASSB)
            fbox(Ab, AM, oside, c_out, s * 18 - 3.2, s * 18 + 3.2, LH + 2.0, LH + 2.4, -0.1, 3.2, STONE)
        for x in (-24, -8, 8, 24):
            Ab.box(x - 0.6, x + 0.6, (y0 + y1) / 2 - 0.6, (y0 + y1) / 2 + 0.6, LH + 2, LH + 5, BRICK, AM)
    # 内侧门楼（x 42..56）：中间一道拱门穿过
    Ab.box(42, 56, -38, -5, 0, LH, BRICK, AM)
    Ab.box(42, 56, 5, 38, 0, LH, BRICK, AM)
    Ab.box(42, 56, -5, 5, 7.0, LH, BRICK, AM)
    for s in (-1, 1):
        Ab.box(41.6, 56.4, s * 5.4 - 0.6, s * 5.4 + 0.6, 0, LH + 3, STONE_S, AM)
    Ab.box(41.6, 56.4, -6, 6, LH, LH + 3, STONE_S, AM)
    Ab.box(41.4, 56.6, -6.2, 6.2, LH + 3, LH + 3.6, STONE, AM)
    Ab.box(42, 56, -38.3, 38.3, LH, LH + 0.6, STONE, AM)
    lgable(Ab, AM, 42, 56, -38, 38, LH + 0.6, 3.6, SLATE, along='y', over=0.4)
    for (u0, u1) in ((-37, -7), (7, 37)):
        windows(Ab, AM, 'X-', 42, u0, u1, 1.0, 4, 3.8, 3.5, 1.7, 2.4, STEEL, lit=0.2)
        windows(Ab, AM, 'X+', 56, u0, u1, 1.0, 4, 3.8, 3.5, 1.7, 2.4, STEEL, lit=0.15)
    # --- 宿舍塔楼（内侧 x 66..84）：12 层，横向窗带 + 石材边框
    for (ty, th) in ((-44, 42.0), (-8, 46.0), (28, 42.0)):
        tx = 75
        Ab.box(tx - 8, tx + 8, ty - 8, ty + 8, 0, th, CONC, AM)
        Ab.box(tx - 8.2, tx + 8.2, ty - 8.2, ty + 8.2, 0, 4, STONE_S, AM)
        for k in range(1, 12):
            z = 4 + (k - 1) * 3.2
            for (side, c) in (('X+', tx + 8), ('X-', tx - 8)):
                fbox(Ab, AM, side, c, ty - 7, ty + 7, z + 0.9, z + 2.5, -0.03, 0.02, WINL if rnd.random() < 0.2 else GLASS)
                fbox(Ab, AM, side, c, ty - 8.1, ty + 8.1, z - 0.05, z + 0.25, 0, 0.35, CONC_D)
            for (side, c) in (('Y+', ty + 8), ('Y-', ty - 8)):
                fbox(Ab, AM, side, c, tx - 7, tx + 7, z + 0.9, z + 2.5, -0.03, 0.02, WINL if rnd.random() < 0.2 else GLASS)
                fbox(Ab, AM, side, c, tx - 8.1, tx + 8.1, z - 0.05, z + 0.25, 0, 0.35, CONC_D)
        Ab.box(tx - 8.4, tx + 8.4, ty - 8.4, ty + 8.4, th, th + 0.8, STONE_S, AM)
        ledring(Ab, AM, tx - 8.44, tx + 8.44, ty - 8.44, ty + 8.44, th + 0.3)
        for (dx, dy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            Ab.box(tx + dx * 8 - 0.1, tx + dx * 8 + 0.1, ty + dy * 8 - 0.1, ty + dy * 8 + 0.1, 4, th, LEDC if (dx + dy) else NEON, AM)
        Ab.box(tx - 3, tx + 3, ty - 3, ty + 3, th + 0.8, th + 4, CONC, AM)
        Ab.box(tx - 2, tx + 2, ty - 8.02, ty - 7.98, 0, 3.2, GLASSB, AM)
    # --- 体育场区（北侧 y 62..200）
    # 田径场：跑道椭圆环（直道 50、弯道半径 30 内沿）+ 草场 + 看台
    SX, SY = -30.0, 131.0
    def oval(r0, r1, z0, z1, m, n=24):
        vs, fs = [], []
        pts = []
        for half in (0, 1):
            cy = SY + (25 if half == 0 else -25)
            for i in range(n + 1):
                a = (i / n) * math.pi + (0 if half == 0 else math.pi)
                pts.append((math.cos(a), math.sin(a), cy))
        k = len(pts)
        for (c_, s_, cy) in pts:
            vs.append((SX + r0 * c_, cy + r0 * s_, z1))
        for (c_, s_, cy) in pts:
            vs.append((SX + r1 * c_, cy + r1 * s_, z1))
        for i in range(k):
            j = (i + 1) % k
            fs.append((i, j, k + j, k + i))
        As.poly(vs, fs, m, mat=AM)
    oval(30, 38, 0, 0.06, TRACKM)
    As.box(SX - 30, SX + 30, SY - 25, SY + 25, 0.0, 0.05, GRASS, AM)
    for half in (1, -1):
        As.cyl(SX, SY + half * 25, 0.0, 30, 0.05, GRASS, 24, smooth=False, mat=AM)
    for k in range(1, 6):                                                   # 分道线
        r = 30 + k * 1.33
        for half in (1, -1):
            As.box(SX + r - 0.04, SX + r + 0.04, SY - 25, SY + 25, 0.06, 0.07, LINEW, AM) if half > 0 else None
            As.box(SX - r - 0.04, SX - r + 0.04, SY - 25, SY + 25, 0.06, 0.07, LINEW, AM) if half > 0 else None
    As.box(SX - 24, SX + 24, SY - 0.08, SY + 0.08, 0.05, 0.06, LINEW, AM)
    for (x0, x1, y0, y1) in ((SX - 24, SX + 24, SY - 38, SY - 37.84), (SX - 24, SX + 24, SY + 37.84, SY + 38),
                             (SX - 24, SX - 23.84, SY - 38, SY + 38), (SX + 23.84, SX + 24, SY - 38, SY + 38)):
        As.box(x0, x1, y0, y1, 0.05, 0.06, LINEW, AM)
    # 看台（内侧，朝外）
    for k in range(8):
        As.box(SX + 40 + k * 0.9, SX + 40 + (k + 1) * 0.9, SY - 28, SY + 28, 0, 0.45 * (k + 1), CONC, AM)
    As.box(SX + 47.2, SX + 48, SY - 29, SY + 29, 0, 7.5, CONC_D, AM)
    As.box(SX + 38, SX + 48.5, SY - 29, SY + 29, 7.5, 7.8, ROOFS, AM)
    for y in range(-28, 29, 7):
        As.box(SX + 47.3, SX + 47.8, SY + y - 0.2, SY + y + 0.2, 3.6, 7.5, STEEL, AM)
    # 体育馆（x 25..55, y 70..110）：砖墙 + 筒拱钢屋面 + 高侧窗
    GX0, GX1, GY0, GY1 = 26.0, 56.0, 68.0, 106.0
    As.box(GX0, GX1, GY0, GY1, 0, 12, BRICK, AM)
    As.box(GX0 - 0.2, GX1 + 0.2, GY0 - 0.2, GY1 + 0.2, 0, 1.2, STONE, AM)
    lvault(As, AM, GX0 - 0.4, GX1 + 0.4, GY0 - 0.4, GY1 + 0.4, 12, 5.0, ROOFS)
    ledring(As, AM, GX0 - 0.04, GX1 + 0.04, GY0 - 0.04, GY1 + 0.04, 11.8)
    for side, c in (('Y+', GY1), ('Y-', GY0)):
        fbox(As, AM, side, c, GX0 + 3, GX1 - 3, 8.5, 11.2, -0.03, 0.02, GLASSB)
        fbox(As, AM, side, c, 38, 44, 1.2, 5, -0.03, 0.03, PAINT)
        fbox(As, AM, side, c, 37, 45, 5.3, 5.6, 0, 1.6, STONE)
    for side, c in (('X+', GX1), ('X-', GX0)):
        windows(As, AM, side, c, GY0 + 1, GY1 - 1, 7.0, 1, 5, 4.4, 2.6, 3.8, STEEL, lit=0.3)
        for k in range(10):
            y = GY0 + 1.6 + k * 3.9
            fbox(As, AM, side, c, y - 0.3, y + 0.3, 0, 12, 0, 0.5, BRICK)
    # 室内训练馆（x 20..62, y 118..184）：钢桁拱大跨棚 + 玻璃端墙 + 侧面天窗
    RX0, RX1, RY0, RY1 = 26.0, 62.0, 116.0, 186.0
    As.box(RX0, RX1, RY0, RY1, 0, 9, CONC, AM)
    As.box(RX0 - 0.2, RX1 + 0.2, RY0 - 0.2, RY1 + 0.2, 0, 1.0, CONC_D, AM)
    lvault(As, AM, RX0 - 0.6, RX1 + 0.6, RY0 - 0.6, RY1 + 0.6, 9, 9.0, SHEET, n=14)
    ledring(As, AM, RX0 - 0.04, RX1 + 0.04, RY0 - 0.04, RY1 + 0.04, 8.8, m=LEDC)
    for k in range(9):                                                     # 外露拱肋
        y = RY0 + 2 + k * (RY1 - RY0 - 4) / 8
        pts = []
        for i in range(13):
            t = i / 12
            pts.append(lpt(AM, RX0 - 0.8 + (RX1 - RX0 + 1.6) * t, y, 9 + 9.3 * math.sin(math.pi * t)))
        As.tube(pts, 0.35, PAINT, n=6)
    for side, c in (('Y+', RY1), ('Y-', RY0)):
        fbox(As, AM, side, c, RX0 + 2, RX1 - 2, 1, 9, -0.03, 0.02, GLASSB)
        for k in range(9):
            x = RX0 + 2 + k * (RX1 - RX0 - 4) / 8
            fbox(As, AM, side, c, x - 0.15, x + 0.15, 1, 9, 0, 0.3, PAINT)
        fbox(As, AM, side, c, RX0 + 14, RX1 - 14, 0, 5, 0.02, 0.05, SHEET)
    for side, c in (('X+', RX1), ('X-', RX0)):
        fbox(As, AM, side, c, RY0 + 2, RY1 - 2, 6.2, 8.4, -0.03, 0.02, GLASSB)
    # 学院外沿：矮石墙 + 铁栏（南侧与军营之间）
    for (x0, x1, y0, y1) in ((-80, 88, -66, -64.8),):
        Ab.box(x0, x1, y0, y1, 0, 0.9, STONE, AM)
        for x in range(int(x0), int(x1), 3):
            if -4 < x < 4:
                continue
            Ab.box(x - 0.04, x + 0.04, (y0 + y1) / 2 - 0.04, (y0 + y1) / 2 + 0.04, 0.9, 2.4, PAINT, AM)
        Ab.box(x0, x1, (y0 + y1) / 2 - 0.05, (y0 + y1) / 2 + 0.05, 2.3, 2.4, PAINT, AM)
    # 园区道路
    G.box(-70, 64, -64, -58, -0.02, 0.02, ASPH, AM)
    G.box(58, 64, -64, 200, -0.02, 0.02, ASPH, AM)
    G.box(-76, -68, -64, 200, -0.02, 0.02, PAVE2, AM)
    G.box(Q0, Q1, 56, 64, -0.02, 0.03, PAVE2, AM)
    G.box(64, 90, -60, 45, -0.02, 0.02, PAVE2, AM)

    # ============================================================ props_trees
    Tr = Batch('props_trees')
    for (x, y) in ((-24, -14), (-14, -26), (24, -14), (14, -26), (-24, 14), (-14, 26), (24, 14), (14, 26)):   # 方院草坪
        p = lpt(AM, x, y, 0.2)
        C.tree_fine(Tr, p[0], p[1], 7.5, 2.8, int(abs(x) * 3 + abs(y) + (x > 0) + 2 * (y > 0)), z=0.2, n=620)
    for k in range(8):                                                         # 学院外沿行道树
        p = lpt(AM, -72, -56 + k * 30, 0)
        C.tree_fine(Tr, p[0], p[1], 8.5, 3.0, 100 + k, n=520)
    for k in range(10):                                                        # 城内街行道树
        a = -0.17 + k * 0.058
        p = P(847.5, a)
        C.tree_fine(Tr, p[0], p[1], 8, 2.8, 200 + k, n=480)

    # ============================================================ props_lights
    Li = Batch('props_lights')

    def lamp(x, y, rz, h=8.0, m=WARML):
        M = T(x, y, 0, rz)
        Li.cyl(0, 0, 0, 0.14, h, PAINT, 8, mat=M)
        Li.cyl(0, 0, 0, 0.3, 0.6, CONC_D, 8, mat=M)
        Li.box(-0.05, 0.05, 0, 1.6, h - 0.1, h, PAINT, M)
        Li.box(-0.25, 0.25, 1.1, 1.9, h - 0.3, h - 0.05, STEEL, M)
        Li.box(-0.22, 0.22, 1.15, 1.85, h - 0.32, h - 0.3, m, M)

    a = FA0 + 0.01
    while a < FA1:
        p = P(956, a); lamp(p[0], p[1], -a - math.pi / 2, 9, COLDL)             # 营内车道
        p = P(989, a); lamp(p[0], p[1], -a + math.pi / 2, 9, COLDL)             # 外周路
        a += 30 / 960
    a = A0 + 0.02
    while a < A1:
        p = P(856, a); lamp(p[0], p[1], -a - math.pi / 2, 9, WARML)
        a += 36 / 856
    for (x, y) in ((-34, -38), (34, -38), (-34, 38), (34, 38)):
        p = lpt(AM, x, y, 0)
        lamp(p[0], p[1], 0, 4.5, WARML)
    # 阅兵场四角高杆泛光灯
    for (r, aa) in ((903, PA0 + 0.004), (903, PA1 - 0.004), (943, PA0 + 0.004), (943, PA1 - 0.004), (903, MA1 - 0.004), (943, MA1 - 0.004)):
        M = F(r, aa)
        Li.cyl(0, 0, 0, 0.35, 18, PAINT, 10, mat=M)
        Li.box(-0.8, 0.8, -1.4, 1.4, 18, 18.3, STEEL, M)
        for s in (-1, 1):
            Li.box(-0.5, 0.3, s * 0.7 - 0.5, s * 0.7 + 0.5, 18.3, 19.1, DARK, M)
            Li.box(-0.52, -0.5, s * 0.7 - 0.45, s * 0.7 + 0.45, 18.35, 19.05, COLDL, M)

    # ============================================================ bg
    BCONC = C.flat('bg_conc', (0.32, 0.32, 0.33), 0.8, noise=0.3)
    LCONC = C.flat('bg_lowconc', (0.1, 0.1, 0.1), 0.9, noise=0.5)
    LSHEET = C.flat('bg_lowsheet', (0.14, 0.1, 0.08), 0.8, noise=0.6)
    DSIDE = C.flat('bg_deckside', (0.2, 0.2, 0.21), 0.8, noise=0.3)
    UNDER = C.flat('bg_under', (0.16, 0.15, 0.15), 0.9, noise=0.4)
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=1.2, cell=(3.0, 3.6), seed=i * 7.3) for i, c in
          enumerate(((1.0, 0.8, 0.55), (0.75, 0.88, 1.0), (1.0, 0.9, 0.7)))]
    GLASSD = C.flat('bg_tower', (0.1, 0.12, 0.15), 0.2, metal=0.4)
    PANES = [C.flat(f'bg_pane{i}', (0.02, 0.02, 0.03), 0.4, emit=c, estr=e) for i, (c, e) in enumerate(
        [((0.1, 0.8, 1.0), 4.0), ((1.0, 0.15, 0.6), 3.0), ((1.0, 0.6, 0.15), 3.0)])]
    WILD = C.pbr('bg_wild', 'dirt_floor', 30.0, tint=(0.3, 0.3, 0.22), sat=0.6, value=0.7)
    WILDG = C.flat('bg_wildgreen', (0.1, 0.13, 0.07), 0.9, noise=0.6)
    TRAIN = C.flat('bg_train', (0.85, 0.86, 0.88), 0.3, metal=0.4)
    # 甲板边侧面 + 底部桁架
    bd = Batch('bg_deck')
    sector(bd, 999.9, 1000.3, A0 - 0.3, A1 + 0.3, -42, -3, DSIDE, seg=12)
    sector(bd, 700, 999.9, A0 - 0.3, A1 + 0.3, -42, -40, UNDER, seg=12)
    sector(bd, 600, 830, A0 - 0.3, A1 + 0.3, -3, -0.02, DECK, seg=12)
    sector(bd, 830, 1000, A0 - 0.3, A0, -3, -0.02, DECK, seg=12)
    sector(bd, 830, 1000, A1, A1 + 0.3, -3, -0.02, DECK, seg=12)
    a = A0 - 0.3
    while a < A1 + 0.3:
        radial(bd, 990, 1000.5, a, 1.2, -40, -3, BCONC)
        beam(bd, P(1000.4, a, -40), P(1000.4, a + 12 / 1000, -3), 0.8, BCONC)
        a += 24 / 1000
    for a in (-0.1, 0.1, 0.3):                                               # 支撑巨柱（落到下层）
        p = P(940, a)
        bd.box(p[0] - 8, p[0] + 8, p[1] - 8, p[1] + 8, LOW_Z, -40, BCONC)
    # 下层地面 + 城外墙 + 荒野
    lo = Batch('bg_lower')
    sector(lo, 500, 1320, -0.7, 0.9, LOW_Z - 2, LOW_Z, LCONC, seg=20)
    rl = random.Random(9)
    for i in range(420):
        r = rl.uniform(1005, 1300); a = rl.uniform(-0.6, 0.8)
        p = P(r, a)
        sx, sy, h = rl.uniform(8, 22), rl.uniform(8, 22), rl.uniform(4, 30)
        lo.box(p[0] - sx / 2, p[0] + sx / 2, p[1] - sy / 2, p[1] + sy / 2, LOW_Z, LOW_Z + h, rl.choice([LCONC, LSHEET, WG[0], LCONC, DSIDE]))
    sector(lo, 1320, 1340, -0.75, 0.95, LOW_Z, LOW_Z + 70, DSIDE, seg=15)   # 城外墙
    sector(lo, 1318, 1342, -0.75, 0.95, LOW_Z + 70, LOW_Z + 74, BCONC, seg=15)
    a = -0.75
    while a < 0.95:
        radial(lo, 1340, 1352, a, 8, LOW_Z, LOW_Z + 60, BCONC)
        radial(lo, 1316, 1342, a, 10, LOW_Z + 70, LOW_Z + 80, BCONC)
        a += 60 / 1330
    rows = []
    for j in range(36):
        r = 1345 + j * j * 4.5
        row = []
        for i in range(61):
            a = -0.9 + 2.0 * i / 60
            z = LOW_Z - 1 + 6 * math.sin(a * 23 + j * 0.7) + 10 * math.sin(a * 7 + j * 0.3) * min(1, j / 5) + (j ** 1.6 if j > 18 else 0)
            p = P(r, a, z)
            row.append(p)
        rows.append(row)
    C.grid(lo, rows, WILD)
    for i in range(160):
        r = rl.uniform(1400, 4500); a = rl.uniform(-0.8, 0.9)
        p = P(r, a)
        C.rock(lo, p[0], p[1], LOW_Z - 1, rl.uniform(10, 40), WILDG, seed=i, seg=7, rings=5, sz=0.5)
    # 内侧中层巨构楼群
    tw = Batch('bg_towers')
    placed = []
    for k in range(70):
        for _ in range(60):
            r = rl.uniform(430, 790); a = rl.uniform(-0.5, 0.6)
            p = P(r, a)
            w, d = rl.uniform(25, 60), rl.uniform(25, 60)
            if all(abs(p[0] - qx) > (w + qw) / 2 + 8 or abs(p[1] - qy) > (d + qd) / 2 + 8 for qx, qy, qw, qd in placed):
                break
        placed.append((p[0], p[1], w, d))
        h = rl.uniform(60, 300) * (1.0 if r < 700 else 0.5)
        h = min(h, 285.0 + 40.0) if r < 880 else h
        z = -40.0; ww, dd = w, d
        m = WG[k % 3] if k % 4 else GLASSD
        for seg_ in range(rl.randint(1, 3)):
            zt = z + h / (seg_ + 1.4)
            tw.box(p[0] - ww / 2, p[0] + ww / 2, p[1] - dd / 2, p[1] + dd / 2, z, zt, m)
            tw.box(p[0] - ww / 2 - 1, p[0] + ww / 2 + 1, p[1] - dd / 2 - 1, p[1] + dd / 2 + 1, zt - 1.5, zt, BCONC)
            z = zt; ww *= 0.75; dd *= 0.75
        if rl.random() < 0.5:
            pz = rl.uniform(20, min(z, 120)); ph = rl.uniform(10, 24)
            tw.box(p[0] - w / 2 - 0.4, p[0] - w / 2 - 0.1, p[1] - d * 0.3, p[1] + d * 0.3, pz, pz + ph, PANES[k % 3])
    # 磁浮高架（r 805，沿弧）
    via = Batch('bg_viaduct')
    VZ = 24.0
    a = A0 - 0.3
    while a < A1 + 0.3:
        M = F(805, a)
        s = 8.5 / 805
        via.box(-3.5, 3.5, -4.3, 4.3, VZ, VZ + 1.8, BCONC, M)
        via.box(-0.6, 0.6, -4.3, 4.3, VZ + 1.8, VZ + 2.4, BCONC, M)
        via.box(-3.5, -3.3, -4.3, 4.3, VZ + 1.8, VZ + 2.8, CYAN, M)
        if int(round((a - A0) / s)) % 6 == 0:
            via.box(-1.5, 1.5, -1.5, 1.5, -3, VZ, BCONC, M)
            via.box(-3.5, 3.5, -2, 2, VZ - 2, VZ, BCONC, M)
        a += s
    for k in range(6):
        a = 0.02 + k * 24.5 / 805
        M = F(805, a)
        via.box(-1.8, 1.8, -12, 12, VZ + 2.6, VZ + 6.4, TRAIN, M)
        via.box(-1.85, 1.85, -11, 11, VZ + 4.3, VZ + 5.3, GLASSB, M)
    # 军营带继续沿弧延伸（出画两端）+ 第二排营房（bg，只渲染：窗格材质 + 阳台板 + 屋面机房）
    bx = Batch('bg_barracks')
    WGB = C.window_grid('bg_wg_bk', wall=(0.3, 0.3, 0.29), lit=(1.0, 0.8, 0.55), estr=1.6, cell=(3.8, 3.2), seed=3.1)
    def bg_block(r, a, L=21.0, nf=7):
        M = F(r, a)
        Hh = nf * 3.2 + 0.6
        bx.box(-7, 7, -L, L, 0, Hh, WGB, M)
        bx.box(-7.3, 7.3, -L - 0.3, L + 0.3, Hh, Hh + 1.2, BCONC, M)
        for k in range(1, nf):
            bx.box(7, 8.4, -L + 0.2, L - 0.2, 0.6 + k * 3.2 - 0.05, 0.6 + k * 3.2 + 0.12, BCONC, M)
            bx.box(8.3, 8.4, -L + 0.2, L - 0.2, 0.6 + k * 3.2 + 1.0, 0.6 + k * 3.2 + 1.08, STEEL, M)
        bx.box(-3, 3, -2.5, 2.5, Hh, Hh + 3.4, BCONC, M)
        bx.box(-9.6, -7, -14.6, -9.4, 0, Hh + 2.4, BCONC, M)
        bx.box(-9.6, -7, 9.4, 14.6, 0, Hh + 2.4, BCONC, M)
    a = -0.19
    while a > -0.62:
        bg_block(966, a); bg_block(925, a - 0.025); bg_block(884, a)
        a -= 0.05
    a = 0.46
    while a < 0.78:
        bg_block(966, a); bg_block(925, a + 0.025)
        a += 0.05
    sector(bx, 978, 988, A0 - 0.45, A0, -0.02, 0.0, ASPH)
    sector(bx, 978, 988, A1, A1 + 0.36, -0.02, 0.0, ASPH)
    sector(bx, 996.4, 1000, A0 - 0.45, A0, 0.0, 3.0, CONC_D, seg=10)
    sector(bx, 996.4, 1000, A1, A1 + 0.36, 0.0, 3.0, CONC_D, seg=10)
    for aa in (-0.25, -0.37, -0.49, 0.5, 0.62):
        p = P(1003, aa)
        bx.box(p[0] - 4, p[0] + 3, p[1] - 7, p[1] + 7, -2.5, 4.4, CONC_D)
        bx.box(p[0] - 3.8, p[0] - 3.6, p[1] - 0.8, p[1] + 0.8, 5.2, 6.8, COLDL)
    # 头顶：上层甲板底面（城内一侧），外缘留出一道通天的缺口；缺口上方有横跨的桁梁
    ov = Batch('bg_overhead')
    OZ = 285.0
    sector(ov, 350, 890, A0 - 0.6, A1 + 0.6, OZ, OZ + 12, UNDER, seg=15)
    sector(ov, 889, 891, A0 - 0.6, A1 + 0.6, OZ - 10, OZ + 12, BCONC, seg=15)
    a = A0 - 0.6
    while a < A1 + 0.6:
        radial(ov, 350, 1060, a, 4.0, OZ - 8, OZ, BCONC)                      # 主梁（伸过缺口）
        radial(ov, 1040, 1060, a, 6.0, OZ - 30, OZ + 4, BCONC)
        a += 0.07
    for r in range(420, 890, 45):
        sector(ov, r - 1.5, r + 1.5, A0 - 0.6, A1 + 0.6, OZ - 6, OZ, BCONC, seg=15)
    for i in range(260):
        r = rl.uniform(380, 885); a = rl.uniform(A0 - 0.5, A1 + 0.5)
        p = P(r, a)
        ov.boxc(p[0], p[1], OZ - 6.6, 4, 4, 0.6, rl.choice([COLDL, SODL, COLDL]))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 天光 / 雾 / 灯
    # 天色压暗（城市光污染的蓝灰夜空，无雾体积），主要靠人工光：头顶甲板底面的冷色泛光 + 钠灯 + 冷白泛光 + 少量霓虹
    w = bpy.data.worlds.new('w'); sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    wo = nt.nodes.new('ShaderNodeOutputWorld'); bgn = nt.nodes.new('ShaderNodeBackground')
    bgn.inputs[0].default_value = (0.05, 0.06, 0.09, 1); bgn.inputs[1].default_value = 1.0
    nt.links.new(bgn.outputs[0], wo.inputs[0])
    for (r, a) in ((930, -0.09), (930, 0.02), (905, 0.17), (905, 0.3)):       # 甲板底面反光（大面积冷光）
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 2.6e5; ld.size = 180; ld.color = (0.72, 0.8, 1.0)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = P(r, a, 200)
    sod = (1.0, 0.62, 0.3); cool = (0.85, 0.92, 1.0)
    for (r, aa) in ((903, PA0 + 0.004), (903, PA1 - 0.004), (943, PA0 + 0.004), (943, PA1 - 0.004)):
        spots.append((P(r, aa, 19.5), P(923, (PA0 + PA1) / 2, 0), 9e4, sod, 70))
    for (r, aa) in ((903, MA1 - 0.004), (943, MA1 - 0.004)):
        spots.append((P(r, aa, 19.5), P(925, 0.02, 0), 9e4, cool, 75))
    for a in BLK_A:                                                            # 营房立面冷白泛光（车道边）
        spots.append((P(946, a, 1.0), P(966, a, 14), 3.5e4, cool, 80))
        spots.append((P(988, a, 1.0), P(966, a, 16), 2.0e4, sod, 80))
    spots.append((lpt(MH, -HW - 12, 0, 10), lpt(MH, -HW, 0, 5), 3e4, cool, 80))
    for s in (-1, 1):                                                          # 学院主楼 / 塔楼投光
        spots.append((lpt(AM, -24, s * 24, 0.5), lpt(AM, -38, s * 24, 12), 1.4e4, (1.0, 0.82, 0.6), 60))
    spots.append((lpt(AM, 12, 0, 22), lpt(AM, TX, 0, 42), 1.0e5, cool, 16))
    for (x, y) in ((-20, -20), (20, -20), (-20, 20), (20, 20)):
        points.append((lpt(AM, x, y, 4.5), 500, (1.0, 0.8, 0.55)))
    for (x, y) in ((SX + 38, SY - 30), (SX + 38, SY + 30)):                    # 田径场高杆灯
        spots.append((lpt(AM, x, y, 22), lpt(AM, SX, SY, 0), 1.2e5, cool, 70))
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.2 if ang < 20 else 0.4)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else {'c1': 1.25}.get(A['cam'], 0.85)

    AMc = lambda x, y, z: lpt(AM, x, y, z)
    CAMS = {
        'c1': (P(1250, 0.36, 215), P(925, 0.03, -8), 30),
        'c2': (P(884, -0.06, 27), P(936, -0.015, 0), 24),
        'c3': (AMc(34, -34, 9), AMc(-49, 6, 16), 22),
    }
    cv = CAMS[A['cam']]
    C.camera(sc, cv[0], cv[1], cv[2])
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
