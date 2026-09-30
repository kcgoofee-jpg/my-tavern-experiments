"""天城政务区（中层核心区「钢铁与霓虹」，甲板上的政府街区）——只做外观。
五座相邻机构各自一个导出组：
  议会 props_council：广场北侧的纪念性议会大厅——高台基 + 宽阔礼仪台阶 + 科林斯式柱廊门廊 + 山花 + 鼓座穹顶（玻璃采光顶）。
  执政厅 props_executive：大道南侧东段，退台式行政塔楼，底部是朝街的玻璃许可大厅 + 排队雨棚。
  政务院 props_admin：广场东侧，中高层合院式部委楼，一条跨大道的天桥连到执政厅塔楼。
  中央储备署 props_reserve：大道南侧西段，堡垒式金库银行：粗面石基座、少窗、青铜大门、装甲车装卸口（无标识厢式车）。
  文化署 props_culture：广场西侧，玻璃阅览大厅 + 实墙档案翼。
另有 site_plaza（礼仪广场、喷泉、花池与树）、site_ground（街道 / 甲板）、props_lights（路灯与街道家具）、
props_signs（纯色全息屏与纯色垂幅，无文字 / 标志）。bg_*：周边巨构楼群、甲板边、磁悬浮高架、上层浮岛底面。
中立：无人物、无文字 / 标志 / 徽章 / 旗帜符号、无武器。

布局（米）：甲板 z=0，广场中心 (0, 0)，广场 x -45..45、y -40..30；北侧台阶 y 30..45 升到台基 z 6。
  议会 x -48..48、y 45..112；储备署 x -78..-30、y -112..-64；执政厅 x 28..80、y -112..-64（大厅在北，塔在南）；
  政务院 x 58..108、y -30..20；文化署 x -105..-58、y -25..25；东西向大道 y -60..-42。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/civic_core/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/cc.jpg [--blend /tmp/cc.blend] [--log /tmp/cc.log] [--exposure 0.3]
cam: c1 政务区俯瞰 / c2 隔广场看议会正面 / c3 街面视高看储备署与执政厅许可大厅
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/cc.jpg', blend='', log='', exposure=''))

DECK_Z = 0.0
POD = 6.0          # 议会台基高
LOW_Z = -300.0     # 下方远处的低层（只在高架柱脚用）
UZ = 420.0         # 上层浮岛底面


def main():
    import bpy
    from mathutils import Matrix, Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(21)

    # ------------------------------------------------------------ 材质
    STONE = C.ashlar('cc_ashlar', (0.6, 0.6, 0.57), course=0.8, block=1.8, joint=0.01, jc=(0.36, 0.36, 0.35))
    STONE_S = C.pbr('cc_stone_smooth', 'Marble021', 4.0, tint=(0.78, 0.78, 0.76), sat=0.2, value=0.9, rough_mul=1.6, weather=0.35)
    STONE_D = C.ashlar('cc_rustic', (0.4, 0.4, 0.39), course=0.9, block=2.0, joint=0.02, jc=(0.12, 0.12, 0.12), rustic=1.0)
    STEP = C.flat('cc_honed', (0.5, 0.5, 0.48), 0.85, noise=0.25)
    AETH = C.flat('cc_aether', (1, 1, 1), 0.4, emit=(0.45, 0.8, 1.0), estr=6.0)
    DOMEM = C.pbr('cc_domemetal', 'Metal009', 2.0, tint=(0.2, 0.22, 0.25), sat=0.2, metal=0.9, rough_mul=0.9)
    GRANITE = C.pbr('cc_granite', 'marble_01', 3.0, tint=(0.35, 0.36, 0.38), sat=0.2, value=0.9)
    CONC = C.pbr('cc_conc', 'concrete_wall_008', 4.0, tint=(0.72, 0.74, 0.77), sat=0.0, value=1.0, weather=0.5)
    PANEL = C.pbr('cc_panel', 'smooth_concrete_floor', 3.0, tint=(0.62, 0.64, 0.67), sat=0.2)
    PAVE = C.pbr('cc_pave', 'precast_stone_paving', 3.0, tint=(0.62, 0.61, 0.6), sat=0.4, value=0.95)
    PAVE2 = C.pbr('cc_pave2', 'patterned_paving', 4.0, tint=(0.55, 0.54, 0.53), sat=0.4)
    ASPH = C.pbr('cc_asphalt', 'asphalt_02', 5.0, tint=(0.35, 0.35, 0.37), sat=0.3, value=0.7)
    STEEL = C.pbr('cc_steel', 'Metal009', 2.0, tint=(0.45, 0.46, 0.48), sat=0.3, metal=0.85)
    DARKM = C.flat('cc_darkmetal', (0.05, 0.055, 0.06), 0.4, metal=0.8)
    BRONZE = C.flat('cc_bronze', (0.42, 0.26, 0.12), 0.35, metal=1.0, noise=0.3)
    COPPER = C.flat('cc_verdigris', (0.22, 0.36, 0.32), 0.55, metal=0.3, noise=0.4)
    GLASS = C.glass('glass_dark', (0.05, 0.07, 0.09))
    GLASS_B = C.glass('glass_blue', (0.07, 0.11, 0.15), rough=0.08)
    GLASS_L = C.glass('glass_lit', (0.1, 0.09, 0.07), emit=(1.0, 0.8, 0.55), estr=1.4)
    JET = C.flat('cc_jet', (0.7, 0.85, 0.9), 0.1, emit=(0.6, 0.85, 1.0), estr=0.8)
    GLASS_C = C.glass('glass_cool', (0.08, 0.1, 0.12), emit=(0.75, 0.88, 1.0), estr=1.8)
    GLASS_H = C.glass('glass_hall', (0.12, 0.11, 0.09), emit=(1.0, 0.86, 0.66), estr=3.5)
    WATER = C.glass('glass_water', (0.05, 0.12, 0.14), rough=0.02, emit=(0.4, 0.75, 1.0), estr=0.6)
    SOIL = C.flat('cc_soil', (0.07, 0.055, 0.04), 0.95, noise=0.4)
    HEDGE = C.flat('cc_hedge', (0.05, 0.11, 0.05), 0.8, noise=0.5)
    RUBBER = C.pbr('cc_rubber', 'Rubber004', 1.0, tint=(0.2, 0.2, 0.2), sat=0.2)
    VAN = C.flat('cc_van', (0.55, 0.56, 0.57), 0.35, metal=0.4, coat=0.5)
    LAMP = C.flat('cc_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.8, 0.55), estr=18.0)
    LAMPC = C.flat('cc_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=14.0)
    LEDB = C.flat('cc_led_b', (1, 1, 1), 0.4, emit=(0.2, 0.7, 1.0), estr=10.0)
    LINE = C.flat('cc_lane', (0.7, 0.7, 0.68), 0.6, noise=0.3)
    HOLO = [C.holo('holo_cyan', (0.1, 0.7, 1.0), (0.05, 0.3, 0.9), 5.0, 0.6),
            C.holo('holo_amber', (1.0, 0.55, 0.12), (0.9, 0.3, 0.05), 5.0, 0.6),
            C.holo('holo_white', (0.8, 0.88, 1.0), (0.4, 0.55, 0.9), 4.0, 0.5)]
    BANNER = [C.flat('banner_red', (0.42, 0.04, 0.04), 0.8, noise=0.2), C.flat('banner_blue', (0.05, 0.1, 0.3), 0.8, noise=0.2)]

    points, spots = [], []

    # ------------------------------------------------------------ 小工具
    def rbox(B, x, y, z, sx, sy, sz, m, rz=0.0):
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z')
        B.box(-sx / 2, sx / 2, -sy / 2, sy / 2, -sz / 2, sz / 2, m, M)

    def beam(B, p0, p1, w, m):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        M = Matrix.Translation((p0 + p1) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        B.box(-w / 2, w / 2, -w / 2, w / 2, -d.length / 2, d.length / 2, m, M)

    def face(side, c, u, v, n=0.0):
        """墙面坐标 → 世界：side ∈ N/S/E/W（外法向），c = 墙面坐标，u 沿墙，v = z，n 向外"""
        if side == 'S': return (u, c - n, v)
        if side == 'N': return (u, c + n, v)
        if side == 'E': return (c + n, u, v)
        return (c - n, u, v)

    def fbox(B, side, c, u0, u1, v0, v1, n0, n1, m):
        a, b = face(side, c, u0, v0, n0), face(side, c, u1, v1, n1)
        B.box(a[0], b[0], a[1], b[1], a[2], b[2], m)

    def windows(B, side, c, u0, u1, z0, z1, du, dz, w, h, frame=STONE_S, lit=0.45, cool=False, sill=True, deep=0.25):
        """石墙上的窗：凹进的玻璃 + 窗套（两侧壁柱条 + 窗台 + 楣）"""
        nu = max(1, int((u1 - u0) / du)); nz = max(1, int((z1 - z0) / dz))
        ou = (u1 - u0 - nu * du) / 2
        for i in range(nu):
            u = u0 + ou + du * (i + 0.5)
            for k in range(nz):
                z = z0 + dz * k + (dz - h) / 2
                g = (GLASS_C if cool else GLASS_L) if rnd.random() < lit else GLASS
                fbox(B, side, c, u - w / 2, u + w / 2, z, z + h, -0.02, 0.02, g)
                d = max(0.15, deep)
                if frame:   # 窗套外凸 = 窗洞深度（墙是实心盒，用外凸的门套做出深窗洞）
                    fbox(B, side, c, u - w / 2 - 0.3, u - w / 2, z - 0.1, z + h + 0.1, 0, d, frame)
                    fbox(B, side, c, u + w / 2, u + w / 2 + 0.3, z - 0.1, z + h + 0.1, 0, d, frame)
                    fbox(B, side, c, u - w / 2 - 0.4, u + w / 2 + 0.4, z + h + 0.1, z + h + 0.5, 0, d + 0.1, frame)
                    if sill:
                        fbox(B, side, c, u - w / 2 - 0.3, u + w / 2 + 0.3, z - 0.25, z - 0.05, 0, d + 0.05, frame)

    def curtain(B, side, c, u0, u1, z0, z1, mu=1.5, mz=4.0, gm=GLASS_B, fin=0.35, mm=DARKM):
        """玻璃幕墙：玻璃面 + 竖梃 + 横梁"""
        fbox(B, side, c, u0, u1, z0, z1, -0.1, 0.0, gm)
        n = int(round((u1 - u0) / mu))
        for i in range(n + 1):
            u = u0 + (u1 - u0) * i / n
            fbox(B, side, c, u - 0.06, u + 0.06, z0, z1, 0, fin, mm)
        z = z0
        while z <= z1 + 0.01:
            fbox(B, side, c, u0, u1, z - 0.08, z + 0.08, 0, 0.12, mm)
            z += mz

    def cornice(B, x0, x1, y0, y1, z, m=STONE_S, steps=((0.0, 0.35, 0.3), (0.3, 0.7, 0.35), (0.65, 1.1, 0.45))):
        """分层挑檐（檐底 dentil 用一圈小凸块）"""
        for (dz, o, h) in steps:
            B.box(x0 - o, x1 + o, y0 - o, y1 + o, z + dz, z + dz + h, m)

    def dentils(B, x0, x1, y0, y1, z, o=0.4, s=0.25, gap=0.55, m=STONE_S):
        for side, c, u0, u1 in (('S', y0, x0, x1), ('N', y1, x0, x1), ('W', x0, y0, y1), ('E', x1, y0, y1)):
            u = u0
            while u < u1:
                fbox(B, side, c, u, u + s, z, z + 0.25, 0, o, m)
                u += gap

    def column(B, x, y, z, h, r, m=STONE_S, flutes=20, order='corinth'):
        """柱：阶式柱础 + 收分带凹槽的柱身 + 柱头（科林斯：钟形 + 方顶板）"""
        B.box(x - r * 1.45, x + r * 1.45, y - r * 1.45, y + r * 1.45, z, z + r * 0.45, m)                    # 柱础方座
        B.lathe(x, y, z + r * 0.45, [(r * 1.3, 0), (r * 1.3, r * 0.18), (r * 1.15, r * 0.3), (r * 1.08, r * 0.5)], m, n=20)
        z0 = z + r * 0.95; hs = h - r * 0.95 - r * 1.6
        n = flutes * 2
        vs, fs = [], []
        rings = 5
        for j in range(rings + 1):
            t = j / rings
            rr = r * (1.0 - 0.14 * t * t)
            for i in range(n):
                a = i * math.tau / n
                k = 0.93 if i % 2 else 1.0
                vs.append((x + rr * k * math.cos(a), y + rr * k * math.sin(a), z0 + hs * t))
        for j in range(rings):
            for i in range(n):
                a, b = j * n + i, j * n + (i + 1) % n
                fs.append((a, b, b + n, a + n))
        B.poly(vs, fs, m, smooth=True)
        zc = z0 + hs
        rt = r * 0.86
        if order == 'corinth':
            B.lathe(x, y, zc, [(rt * 1.05, 0), (rt * 1.1, 0.15), (rt, 0.25), (rt * 1.15, r * 0.7), (rt * 1.45, r * 1.25)], m, n=16)
            for i in range(8):   # 叶饰：一圈外翻的小块
                a = i * math.tau / 8
                rbox(B, x + rt * 1.15 * math.cos(a), y + rt * 1.15 * math.sin(a), zc + r * 0.55, r * 0.35, r * 0.35, r * 0.7, m, rz=a)
            B.box(x - r * 1.35, x + r * 1.35, y - r * 1.35, y + r * 1.35, zc + r * 1.25, zc + r * 1.6, m)
        else:  # 多立克
            B.lathe(x, y, zc, [(rt, 0), (rt * 1.3, r * 0.5)], m, n=16)
            B.box(x - r * 1.3, x + r * 1.3, y - r * 1.3, y + r * 1.3, zc + r * 0.5, zc + r * 1.6, m)

    def tree_planter(B, x, y, z, h, r, seed, kind='oak'):
        B.box(x - 2.0, x + 2.0, y - 2.0, y + 2.0, z, z + 0.6, GRANITE)
        B.box(x - 1.75, x + 1.75, y - 1.75, y + 1.75, z + 0.6, z + 0.62, SOIL)
        C.tree(B, x, y, h, r, kind, seed, z=z + 0.6)

    # ============================================================ site_ground：甲板、道路、人行道
    G = Batch('site_ground')
    G.box(-160, 160, -150, 150, -1.2, -0.02, CONC)
    G.box(-160, 160, -60, -42, -0.02, 0.0, ASPH)                     # 东西大道
    for (x0, x1) in ((-56, -46), (46, 56)):                           # 广场两侧南北街
        G.box(x0, x1, -42, 130, -0.02, 0.0, ASPH)
    G.box(-160, 160, 118, 130, -0.02, 0.0, ASPH)                      # 议会北侧街
    for (x0, x1, y0, y1) in ((-160, 160, -66, -60), (-160, 160, -42, -40), (-46, -45, -40, 118), (45, 46, -40, 118),
                             (-160, -56, -40, 118), (56, 160, -40, 118), (-160, 160, -150, -66), (-56, 56, 112, 118),
                             (-160, 160, 130, 150)):
        G.box(x0, x1, y0, y1, 0.0, 0.15, PAVE2)                       # 人行道（路缘高 15 cm）
    for x in range(-156, 160, 8):                                     # 车道虚线
        G.box(x, x + 4, -51.1, -50.9, 0.0, 0.012, LINE)
    for (x, w) in ((-51, 10), (51, 10)):                              # 人行横道
        for k in range(8):
            G.box(x - w / 2 + 0.3, x + w / 2 - 0.3, -58 + k * 2, -57 + k * 2, 0.0, 0.012, LINE)
    for k in range(9):
        G.box(-8 + k * 2, -7 + k * 2, -58, -44, 0.0, 0.012, LINE)     # 广场正南横道
    # 甲板边缘（外沿护栏 + 下挂结构）
    for (x0, x1, y0, y1) in ((-160, 160, -151, -150), (-160, 160, 150, 151), (-161, -160, -150, 150), (160, 161, -150, 150)):
        G.box(x0, x1, y0, y1, -6.0, 1.2, CONC)
    G.box(-160, 160, -150, 150, -7.0, -1.2, PANEL)

    # ============================================================ site_plaza：礼仪广场
    P = Batch('site_plaza')
    P.box(-45, 45, -40, 30, 0.0, 0.2, PAVE)
    P.box(-3, 3, -40, 30, 0.2, 0.22, GRANITE)                         # 中轴深色石带
    P.box(-45, 45, -1.5, 1.5, 0.2, 0.22, GRANITE)
    # 中央大喷泉（圆形水池 + 两层托盘 + 水柱）
    P.cyl(0, -8, 0.2, 11.0, 0.7, GRANITE, n=48, smooth=False)
    P.cyl(0, -8, 0.9, 11.4, 0.18, STONE_S, n=48, smooth=False)
    P.cyl(0, -8, 0.2, 10.4, 0.55, WATER, n=48)
    P.cyl(0, -8, 0.75, 1.4, 2.8, STONE_S, n=20, r2=0.9)
    P.lathe(0, -8, 3.4, [(0.8, 0), (3.8, 0.5), (4.1, 0.9), (3.6, 0.95)], STONE_S, n=32)
    P.cyl(0, -8, 3.6, 3.7, 0.2, WATER, n=32)
    P.cyl(0, -8, 4.3, 0.5, 2.0, STONE_S, n=16, r2=0.35)
    P.lathe(0, -8, 6.2, [(0.3, 0), (1.6, 0.35), (1.7, 0.6), (1.4, 0.62)], STONE_S, n=24)
    for i in range(16):                                                # 水柱：池沿喷向托盘的抛物线细水流
        a = i * math.tau / 16
        pts = []
        for j in range(9):
            t = j / 8
            rr = 9.8 - 5.6 * t
            pts.append((rr * math.cos(a), -8 + rr * math.sin(a), 0.75 + 4.2 * t * (1 - t) * 1.6 + 0.2 * t))
        P.tube(pts, 0.05, JET, n=5)
    P.cyl(0, -8, 8.0, 0.12, 2.2, JET, n=6, r2=0.03)
    # 两侧长条水池（反射池）
    for s in (-1, 1):
        x0, x1 = s * 18 - 5, s * 18 + 5
        P.box(x0 - 0.5, x1 + 0.5, 4, 26, 0.2, 0.75, GRANITE)
        P.box(x0, x1, 4.5, 25.5, 0.2, 0.62, WATER)
        for k in range(5):
            P.cyl(s * 18, 7 + k * 4.5, 0.62, 0.25, 0.6, STONE_S, n=8)
    # 花池：绿篱带 + 树
    seed = 1
    for s in (-1, 1):
        for (y0, y1) in ((-36, -24), (-22, -2)):
            x0, x1 = s * 30 - 5, s * 30 + 5
            P.box(x0, x1, y0, y1, 0.2, 0.8, GRANITE)
            P.box(x0 + 0.3, x1 - 0.3, y0 + 0.3, y1 - 0.3, 0.8, 1.35, HEDGE)
        for y in (-30, -12):
            C.tree(P, s * 30, y, 9.0, 3.6, 'oak', seed, z=1.35); seed += 1
        for y in (8, 22):
            tree_planter(P, s * 38, y, 0.2, 8.0, 3.2, seed); seed += 1
    # 石凳
    for s in (-1, 1):
        for y in (-34, -18, -4):
            P.box(s * 23 - 0.4, s * 23 + 0.4, y - 2.5, y + 2.5, 0.2, 0.65, STONE_S)

    # ============================================================ props_council：议会
    K = Batch('props_council')
    CX0, CX1, CY0, CY1 = -48.0, 48.0, 45.0, 112.0
    K.box(CX0, CX1, CY0, CY1, 0.0, POD, STONE_D)                      # 台基
    K.box(CX0 - 0.4, CX1 + 0.4, CY0 - 0.4, CY1 + 0.4, POD - 0.5, POD, STONE_S)
    for k in range(40):                                               # 礼仪台阶：踏步高 0.15 / 深 0.35（y 31..45）
        y = CY0 - (k + 1) * 0.35
        K.box(-32, 32, y, y + 0.35 + 0.02, 0.0, POD - k * 0.15, STEP)
        K.box(-32, 32, y - 0.03, y + 0.02, POD - k * 0.15 - 0.04, POD - k * 0.15, STONE_S)      # 踏步前缘
    for s in (-1, 1):                                                 # 台阶两侧颊墙 + 灯座
        K.box(s * 32, s * 36, 31, CY0, 0.0, POD + 1.2, STONE_D)
        K.box(s * 32 - 0.3, s * 36 + 0.3, 31, 32.5, POD + 1.2, POD + 2.0, STONE_S)
        K.lathe(s * 34, 32, POD + 2.0, [(0.9, 0), (1.2, 0.5), (0.6, 1.2), (0.2, 1.4)], BRONZE, n=16)
        points.append(((s * 34, 32, POD + 3.8), 300, (1.0, 0.78, 0.5)))
    # 大厅主体（门廊后）
    HX0, HX1, HY0, HY1, HZ = -40.0, 40.0, 58.0, 110.0, POD + 24.0
    K.box(HX0, HX1, HY0, HY1, POD, HZ, STONE)
    K.box(HX0 - 0.5, HX1 + 0.5, HY0 - 0.5, HY1 + 0.5, POD, POD + 1.2, STONE_S)       # 勒脚
    cornice(K, HX0, HX1, HY0, HY1, HZ - 1.6)
    dentils(K, HX0, HX1, HY0, HY1, HZ - 1.9)
    K.box(HX0 + 0.5, HX1 - 0.5, HY0 + 0.5, HY1 - 0.5, HZ, HZ + 2.2, STONE)             # 女儿墙 / 阁楼层
    for side, c, u0, u1 in (('E', HX1, HY0, HY1), ('W', HX0, HY0, HY1)):
        u = u0 + 3.0
        while u < u1 - 2:                                              # 壁柱
            fbox(K, side, c, u - 0.7, u + 0.7, POD + 1.2, HZ - 1.6, 0, 0.45, STONE_S)
            fbox(K, side, c, u - 0.06, u + 0.06, POD + 1.6, HZ - 2.0, 0.45, 0.5, AETH)     # 壁柱中线光带
            u += 6.5
        windows(K, side, c, u0 + 3, u1 - 3, POD + 3, HZ - 3, 6.5, 9.0, 2.4, 6.0, lit=0.7)
    windows(K, 'N', HY1, HX0 + 3, HX1 - 3, POD + 3, HZ - 3, 6.5, 9.0, 2.4, 6.0, lit=0.5)
    # 钢翅：大厅正面两端的深色钢竖鳍（带光缝）
    for s in (-1, 1):
        for k in range(4):
            x = s * (35.0 + k * 1.4)
            K.box(x - 0.18, x + 0.18, HY0 - 1.6, HY0, POD + 0.6, HZ + 1.5, DARKM)
            K.box(x - 0.04, x + 0.04, HY0 - 1.65, HY0 - 1.6, POD + 1.0, HZ + 1.0, AETH)
    # 侧翼（稍低）
    for s in (-1, 1):
        wx0, wx1 = (HX1, CX1) if s > 0 else (CX0, HX0)
        K.box(wx0, wx1, 60, 100, POD, POD + 16, STONE)
        cornice(K, wx0, wx1, 60, 100, POD + 14.6, steps=((0.0, 0.3, 0.3), (0.3, 0.7, 0.4)))
        windows(K, 'S', 60, wx0 + 1, wx1 - 1, POD + 2, POD + 14, 4.0, 6.0, 1.6, 3.8, lit=0.4, deep=0.8)
        windows(K, 'E' if s > 0 else 'W', wx1 if s > 0 else wx0, 62, 98, POD + 2, POD + 14, 4.5, 6.0, 1.6, 3.8, lit=0.6)
    # 门廊：11 根科林斯柱（y 49），柱高 17
    PY, PH, PR = 50.0, 17.0, 0.95
    xs = [-30 + i * 6 for i in range(11)]
    K.box(-33.5, 33.5, 46.5, HY0, POD, POD + 0.6, STONE_S)             # 门廊地坪
    for x in xs:
        column(K, x, PY, POD + 0.6, PH, PR)
        if abs(x) >= 24:
            column(K, x, PY + 5.5, POD + 0.6, PH, PR)                  # 端部第二排
    ez = POD + 0.6 + PH
    K.box(-33.5, 33.5, 47.5, HY0, ez, ez + 1.4, STONE_S)                # 额枋
    K.box(-33.5, 33.5, 47.7, HY0, ez + 1.4, ez + 3.0, STONE)             # 檐壁
    K.box(-34.3, 34.3, 46.9, HY0, ez + 3.0, ez + 3.4, STONE_S)           # 檐口（三层出挑）
    K.box(-35.0, 35.0, 46.2, HY0, ez + 3.4, ez + 3.9, STONE_S)
    K.box(-35.6, 35.6, 45.6, HY0, ez + 3.9, ez + 4.6, STONE_S)
    for x in range(-33, 34, 1):
        K.box(x + 0.2, x + 0.55, 46.7, 47.0, ez + 2.8, ez + 3.05, STONE_S)
    # 山花（三角形，内凹鼓面，不做雕像）
    pz0, pz1 = ez + 4.6, ez + 11.8
    K.poly([(-34.3, 46.9, pz0), (34.3, 46.9, pz0), (0, 46.9, pz1), (-34.3, HY0, pz0), (34.3, HY0, pz0), (0, HY0, pz1)],
           [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], STONE_S)
    K.poly([(-30, 46.6, pz0 + 0.8), (30, 46.6, pz0 + 0.8), (0, 46.6, pz1 - 1.3), (-30, 47.2, pz0 + 0.8), (30, 47.2, pz0 + 0.8), (0, 47.2, pz1 - 1.3)],
           [(0, 1, 2), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], STONE)
    for s in (-1, 1):                                                  # 山花斜檐
        K.strip([(s * 35.6, 46.4, pz0 + 0.3), (0, 46.4, pz1 + 0.6)], 1.2, 1.4, STONE_S)
        K.strip([(s * 35.9, 45.8, pz0 + 0.9), (0, 45.8, pz1 + 1.3)], 0.6, 1.6, STONE_S)
    # 门廊后墙：三道青铜大门 + 上方高窗
    for x in (-12, 0, 12):
        for (o, d) in ((0.0, 0.0), (0.45, -0.6), (0.9, -1.2)):             # 三层退进的门套（深门洞）
            fbox(K, 'S', HY0 - 2.0, x - 3.6 + o, x - 3.2 + o, POD + 0.6, POD + 10.6 - o, d - 0.6, d + 0.3, STONE_S)
            fbox(K, 'S', HY0 - 2.0, x + 3.2 - o, x + 3.6 - o, POD + 0.6, POD + 10.6 - o, d - 0.6, d + 0.3, STONE_S)
            fbox(K, 'S', HY0 - 2.0, x - 3.6 + o, x + 3.6 - o, POD + 10.2 - o, POD + 10.6 - o, d - 0.6, d + 0.3, STONE_S)
        fbox(K, 'S', HY0 - 2.0, x - 2.3, x + 2.3, POD + 0.6, POD + 9.2, -2.0, -1.8, BRONZE)
        for zz in (2.5, 5.0, 7.5):
            fbox(K, 'S', HY0 - 2.0, x - 2.2, x + 2.2, POD + zz, POD + zz + 0.18, -1.8, -1.7, BRONZE)
        for u in (-1.2, 1.2):
            fbox(K, 'S', HY0 - 2.0, x + u - 0.9, x + u + 0.9, POD + 1.2, POD + 8.6, -1.8, -1.72, BRONZE)
        fbox(K, 'S', HY0 - 2.0, x - 0.04, x + 0.04, POD + 0.6, POD + 9.2, -1.8, -1.7, GLASS_H)   # 门缝漏光
        fbox(K, 'S', HY0, x - 2.0, x + 2.0, POD + 12, POD + 17, 0.25, 0.3, GLASS)
        for u in (-1.0, 0.0, 1.0):
            fbox(K, 'S', HY0, x + u - 0.06, x + u + 0.06, POD + 12, POD + 17, 0.3, 0.42, BRONZE)
        fbox(K, 'S', HY0, x - 2.0, x + 2.0, POD + 14.4, POD + 14.55, 0.3, 0.42, BRONZE)
        for s_ in (-1, 1):                                             # 门洞外框（实体门套，贴墙到最外层）
            fbox(K, 'S', HY0, x + s_ * 4.0 - 0.45, x + s_ * 4.0 + 0.45, POD + 0.6, POD + 11.2, 0.0, 2.3, STONE_S)
        fbox(K, 'S', HY0, x - 4.45, x + 4.45, POD + 10.6, POD + 11.2, 0.0, 2.4, STONE_S)
        fbox(K, 'S', HY0, x - 2.5, x + 2.5, POD + 11.6, POD + 17.4, 0.0, 0.25, STONE_S)
    for x in (-24, 24):
        fbox(K, 'S', HY0, x - 1.6, x + 1.6, POD + 4, POD + 12, 0.2, 0.3, BRONZE)
        fbox(K, 'S', HY0, x - 2.0, x + 2.0, POD + 3.6, POD + 12.4, 0.0, 0.2, STONE_S)
    # 鼓座 + 穹顶（圆心在大厅中后部）
    DX, DY, DR = 0.0, 84.0, 22.0
    dz0 = HZ + 2.2
    K.cyl(DX, DY, HZ, DR + 3.5, 2.2, STONE_S, n=48, smooth=False)       # 鼓座底台
    K.cyl(DX, DY, dz0, DR, 15.0, STONE, n=48, smooth=False)
    npil = 24
    for i in range(npil):                                              # 鼓座柱列 + 高窗
        a = i * math.tau / npil
        cx, cy = DX + (DR + 0.9) * math.cos(a), DY + (DR + 0.9) * math.sin(a)
        column(K, cx, cy, dz0, 14.0, 0.6, order='doric', flutes=10)
        a2 = a + math.pi / npil
        wx, wy = DX + (DR + 0.05) * math.cos(a2), DY + (DR + 0.05) * math.sin(a2)
        rbox(K, wx, wy, dz0 + 7.0, 0.2, 2.2, 9.0, GLASS_H, rz=a2)
    K.cyl(DX, DY, dz0 + 14.0, DR + 2.0, 1.6, STONE_S, n=48, smooth=False)   # 鼓座檐
    K.cyl(DX, DY, dz0 + 15.6, DR + 0.6, 2.4, STONE, n=48, smooth=False)     # 阁楼环
    K.cyl(DX, DY, dz0 + 15.4, DR + 2.05, 0.15, AETH, n=48, smooth=False)     # 檐口光带
    domez = dz0 + 18.0
    K.sphere(DX, DY, domez, DR + 0.4, DOMEM, sz=0.8, seg=48, rings=24, zmin=0.0)
    for j in range(1, 5):                                              # 穹面水平光缝
        ph = (math.pi / 2) * j / 6
        K.cyl(DX, DY, domez + (DR + 0.45) * 0.8 * math.sin(ph) - 0.08, (DR + 0.45) * math.cos(ph), 0.16, AETH, n=48, smooth=False, cap=False)
    for i in range(24):                                                # 穹顶钢肋 + 肋间光缝
        a = i * math.tau / 24
        pts = []
        for j in range(0, 11):
            ph = (math.pi / 2) * j / 10
            r_ = (DR + 0.6) * math.cos(ph)
            pts.append((DX + r_ * math.cos(a), DY + r_ * math.sin(a), domez + (DR + 0.6) * 0.8 * math.sin(ph)))
        K.strip(pts[:9], 0.5, 0.45, STEEL)
    # 玻璃采光环（穹顶上部的环形天窗）+ 采光亭
    lz = domez + (DR + 0.4) * 0.8 - 0.6
    K.cyl(DX, DY, lz, 4.6, 1.0, STONE_S, n=24, smooth=False)
    for i in range(8):
        a = i * math.tau / 8
        K.box(DX + 3.9 * math.cos(a) - 0.3, DX + 3.9 * math.cos(a) + 0.3, DY + 3.9 * math.sin(a) - 0.3, DY + 3.9 * math.sin(a) + 0.3, lz + 1.0, lz + 6.5, DARKM)
    K.cyl(DX, DY, lz + 1.0, 3.3, 5.5, AETH, n=16)
    K.cyl(DX, DY, lz + 6.5, 4.6, 0.9, STONE_S, n=24, smooth=False)
    K.sphere(DX, DY, lz + 7.4, 3.8, DOMEM, sz=0.9, seg=20, rings=10, zmin=0.0)
    K.cyl(DX, DY, lz + 10.8, 0.3, 4.0, STEEL, n=8, r2=0.05)
    points.append(((DX, DY, lz + 3.0), 1500, (1.0, 0.8, 0.55)))

    # ============================================================ props_reserve：中央储备署（金库银行）
    R = Batch('props_reserve')
    RX0, RX1, RY0, RY1 = -78.0, -30.0, -112.0, -66.0
    R.box(RX0, RX1, RY0, RY1, 0.0, 0.8, GRANITE)                        # 台座
    # 粗面石基座：逐层错缝的石块带（每层凸出一点，缝深 12 cm）
    z = 0.8; lvl = 0
    while z < 10.8:
        h = 1.25
        R.box(RX0 + 0.12, RX1 - 0.12, RY0 + 0.12, RY1 - 0.12, z, z + h, STONE_D)
        for side, c, u0, u1 in (('N', RY1, RX0, RX1), ('E', RX1, RY0, RY1), ('W', RX0, RY0, RY1)):
            u = u0 + (1.1 if lvl % 2 else 0.0)
            while u < u1:
                ue = min(u + 2.2, u1)
                if not (side == 'N' and (-58.5 < (u + ue) / 2 < -49.5 or -76 < (u + ue) / 2 < -66)):
                    fbox(R, side, c, u + 0.06, ue - 0.06, z + 0.06, z + h - 0.06, -0.12, 0.08, STONE_D)
                u = ue
        z += h; lvl += 1
    R.box(RX0 - 0.3, RX1 + 0.3, RY0 - 0.3, RY1 + 0.3, 10.8, 11.6, STONE_S)
    # 上部：光面石 + 竖向细长窗 + 厚檐
    R.box(RX0 + 0.8, RX1 - 0.8, RY0 + 0.8, RY1 - 0.8, 11.6, 26.0, STONE)
    for side, c, u0, u1 in (('N', RY1 - 0.8, RX0 + 3, RX1 - 3), ('E', RX1 - 0.8, RY0 + 3, RY1 - 3), ('W', RX0 + 0.8, RY0 + 3, RY1 - 3)):
        windows(R, side, c, u0, u1, 13.0, 24.5, 10.0, 11.5, 1.0, 8.0, lit=0.12, sill=False, deep=1.4)
        u = u0 - 1.5
        while u < u1 + 2:
            fbox(R, side, c, u - 0.6, u + 0.6, 11.6, 24.6, 0, 0.35, STONE_S)   # 扁壁柱
            u += 5.0
    cornice(R, RX0 + 0.8, RX1 - 0.8, RY0 + 0.8, RY1 - 0.8, 24.6, steps=((0.0, 0.3, 0.4), (0.4, 0.9, 0.5), (0.9, 1.3, 0.6)))
    R.box(RX0 + 1.5, RX1 - 1.5, RY0 + 1.5, RY1 - 1.5, 26.1, 27.5, STONE)
    R.box(RX0 + 12, RX1 - 12, RY0 + 12, RY1 - 12, 27.5, 30.5, PANEL)      # 屋顶设备间
    for k in range(4):
        R.cyl(RX0 + 14 + k * 5, RY0 + 8, 27.5, 1.2, 1.8, STEEL, n=12)
    # 青铜大门（深凹门洞 + 两扇厚门 + 门框）
    dx = -54.0
    fbox(R, 'N', RY1, dx - 4.5, dx + 4.5, 0.8, 9.5, -1.8, 0.0, STONE_D)
    fbox(R, 'N', RY1, dx - 5.4, dx + 5.4, 9.5, 10.6, 0.0, 0.5, STONE_S)
    for s in (-1, 1):
        fbox(R, 'N', RY1, dx + s * 4.5 - (0.9 if s > 0 else 0), dx + s * 4.5 + (0.0 if s > 0 else 0.9), 0.8, 9.5, 0, 0.5, STONE_S)
        fbox(R, 'N', RY1 - 1.7, dx + (0.05 if s > 0 else -3.6), dx + (3.6 if s > 0 else -0.05), 0.8, 8.2, 0, 0.25, BRONZE)
        for zz in (2.0, 4.0, 6.0):
            fbox(R, 'N', RY1 - 1.45, dx + (0.3 if s > 0 else -3.3), dx + (3.3 if s > 0 else -0.3), zz, zz + 0.25, 0, 0.1, BRONZE)
    fbox(R, 'N', RY1 - 1.7, dx - 3.6, dx + 3.6, 8.2, 9.3, 0, 0.1, GLASS_L)
    R.box(dx - 7, dx + 7, RY1, RY1 + 3.0, 0.0, 0.8, GRANITE)              # 门前台阶
    for k in range(3):
        R.box(dx - 7, dx + 7, RY1 + 3.0 + k * 0.4, RY1 + 3.4 + k * 0.4, 0.0, 0.8 - (k + 1) * 0.2, GRANITE)
    # 装卸口（西段，下沉车道 + 卷帘门 + 钢雨棚 + 防撞柱）
    lx = -71.0
    fbox(R, 'N', RY1, lx - 5, lx + 5, 0.0, 5.2, -1.0, 0.0, DARKM)
    for k in range(18):
        fbox(R, 'N', RY1 - 0.95, lx - 4.8, lx + 4.8, 0.2 + k * 0.28, 0.2 + k * 0.28 + 0.2, 0, 0.05, STEEL)
    fbox(R, 'N', RY1, lx - 6, lx + 6, 5.6, 6.0, 0.0, 5.0, STEEL)
    for s in (-1, 1):
        R.cyl(lx + s * 6.5, RY1 + 1.2, 0.0, 0.35, 1.1, C.hazard('cc_hazard'), n=10)
        beam(R, (lx + s * 5.8, RY1 + 4.8, 6.0), (lx + s * 5.8, RY1 + 0.1, 8.5), 0.2, STEEL)
    R.box(lx - 6, lx + 6, RY1, RY1 + 10, 0.0, 0.02, STONE_D)
    spots.append(((lx, RY1 + 4, 5.5), (lx, RY1 + 4, 0), 1200, (0.85, 0.92, 1.0), 90))
    # 无标识厢式运钞车 ×2
    def van(B, x, y, rz):
        M = lambda px, py, pz: (x + px * math.cos(rz) - py * math.sin(rz), y + px * math.sin(rz) + py * math.cos(rz), pz)
        rbox(B, *M(0, 0, 1.55), 2.3, 6.2, 2.3, VAN, rz=rz)
        rbox(B, *M(0, 3.15, 1.2), 2.2, 0.3, 1.4, VAN, rz=rz)
        rbox(B, *M(0, 3.05, 2.05), 2.0, 0.12, 0.8, GLASS, rz=rz)
        rbox(B, *M(0, 3.3, 0.7), 2.3, 0.2, 0.35, DARKM, rz=rz)
        for s in (-1, 1):
            rbox(B, *M(s * 1.16, 2.1, 2.0), 0.05, 1.2, 0.7, GLASS, rz=rz)
            rbox(B, *M(s * 0.8, 3.32, 1.05), 0.4, 0.05, 0.16, LAMPC, rz=rz)
            for py in (-2.0, 2.0):
                px, pyy, _ = M(s * 1.0, py, 0)
                R_ = Matrix.Translation((px, pyy, 0.45)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y')
                B.cyl(0, 0, -0.15, 0.45, 0.3, RUBBER, n=14, smooth=False, mat=R_)
        rbox(B, *M(0, -3.12, 1.5), 1.9, 0.05, 1.9, DARKM, rz=rz)
    van(R, lx - 1.6, RY1 + 5.5, 0.0)
    van(R, lx + 9.0, RY1 + 11.0, math.pi / 2 - 0.25)
    for k in range(3):
        spots.append(((dx - 6 + k * 6, RY1 + 3, 11.4), (dx - 6 + k * 6, RY1 + 1, 0), 900, (1.0, 0.82, 0.6), 70))

    # ============================================================ props_executive：执政厅（退台塔楼 + 许可大厅）
    E = Batch('props_executive')
    EX0, EX1 = 28.0, 80.0
    HY0e, HY1e = -80.0, -66.0      # 许可大厅
    TY0, TY1 = -112.0, -80.0       # 塔楼
    E.box(EX0, EX1, HY0e, HY1e, 0.0, 0.3, GRANITE)
    # 许可大厅：厚重石框（端墙 + 3 m 高石楣 + 石墩）、深钢竖鳍、内退玻璃；门前安检门一线、闸机通道、防撞桩
    for s_ in (-1, 1):
        x0 = EX0 if s_ < 0 else EX1 - 3.5
        E.box(x0, x0 + 3.5, HY0e, HY1e + 0.8, 0.0, 12.6, STONE)
    E.box(EX0, EX1, HY1e - 0.6, HY1e + 0.8, 8.8, 12.6, STONE)                 # 石楣
    E.box(EX0 - 0.4, EX1 + 0.4, HY1e - 0.6, HY1e + 1.3, 12.6, 13.4, STONE_S)  # 檐
    E.box(EX0 + 3.5, EX1 - 3.5, HY1e - 1.6, HY1e - 1.5, 0.3, 8.8, GLASS_H)    # 内退玻璃
    PIERS = (EX0 + 15.0, EX0 + 26.0, EX0 + 37.0)
    for x in PIERS:
        E.box(x - 1.0, x + 1.0, HY1e - 1.5, HY1e + 0.8, 0.0, 8.8, STONE)      # 石墩
    x = EX0 + 4.5
    while x < EX1 - 4:
        if all(abs(x - p) > 1.4 for p in PIERS):
            E.box(x - 0.12, x + 0.12, HY1e - 1.5, HY1e - 0.2, 0.3, 8.8, DARKM)  # 深钢竖鳍
            E.box(x - 0.03, x + 0.03, HY1e - 0.22, HY1e - 0.18, 0.6, 8.5, AETH)
        x += 1.6
    E.box(EX0 + 3.5, EX1 - 3.5, HY1e - 1.5, HY1e - 0.9, 4.3, 4.6, DARKM)      # 横梁
    E.box(EX0, EX1, HY0e, HY1e - 1.6, 12.0, 12.6, PANEL)
    E.box(EX0 + 2.5, EX1 - 2.5, HY1e - 12.5, HY1e - 12.3, 0.3, 11.5, GLASS_H)          # 大厅后墙（内光）
    for k in range(6):
        E.box(EX0 + 6 + k * 7.5, EX0 + 10 + k * 7.5, HY0e + 3, HY0e + 4.2, 0.3, 1.4, PANEL)
    # 雨棚：厚钢檐板（y -65..-58）
    E.box(EX0 + 4, EX1 - 4, HY1e + 0.8, HY1e + 8.0, 5.2, 5.8, DARKM)
    E.box(EX0 + 4, EX1 - 4, HY1e + 7.9, HY1e + 8.0, 5.25, 5.3, AETH)
    for x in range(int(EX0 + 6), int(EX1 - 4), 8):
        E.box(x - 0.25, x + 0.25, HY1e + 7.3, HY1e + 7.8, 0.15, 5.2, DARKM)
    # 安检门一线（门框式探测门）
    for k in range(8):
        x = EX0 + 9 + k * 4.9
        E.box(x - 0.7, x - 0.55, HY1e + 1.5, HY1e + 2.3, 0.3, 2.6, PANEL)
        E.box(x + 0.55, x + 0.7, HY1e + 1.5, HY1e + 2.3, 0.3, 2.6, PANEL)
        E.box(x - 0.7, x + 0.7, HY1e + 1.5, HY1e + 2.3, 2.6, 2.85, PANEL)
        E.box(x - 0.55, x + 0.55, HY1e + 1.85, HY1e + 1.95, 2.65, 2.7, LEDB)
    # 闸机通道：成排的矮机柜 + 玻璃拍门
    for k in range(9):
        x = EX0 + 6.5 + k * 4.9
        E.box(x - 0.2, x + 0.2, HY1e + 3.5, HY1e + 5.2, 0.15, 1.1, STEEL)
        E.box(x - 0.2, x + 0.2, HY1e + 5.15, HY1e + 5.2, 0.9, 1.05, LEDB)
        if k < 8:
            E.box(x + 0.2, x + 1.0, HY1e + 4.3, HY1e + 4.34, 0.4, 1.3, GLASS_C)
            E.box(x + 3.9, x + 4.7, HY1e + 4.3, HY1e + 4.34, 0.4, 1.3, GLASS_C)
    # 防撞桩（路缘一线）
    for k in range(27):
        x = EX0 + 1.0 + k * 1.9
        E.cyl(x, HY1e + 9.0, 0.15, 0.3, 1.0, STEEL, n=10)
        E.cyl(x, HY1e + 9.0, 1.15, 0.31, 0.06, LEDB, n=10)
    # 塔楼：三段退台 + 竖向石肋 + 带形窗
    tiers = ((0.0, 58.0, 0.0), (58.0, 92.0, 4.0), (92.0, 124.0, 9.0))
    for (z0, z1, ins) in tiers:
        x0, x1, y0, y1 = EX0 + 4 + ins, EX1 - 4 - ins, TY0 + ins, TY1 - ins
        E.box(x0 + 0.6, x1 - 0.6, y0 + 0.6, y1 - 0.6, z0, z1, GLASS_B)
        for side, c, u0, u1 in (('N', y1, x0, x1), ('S', y0, x0, x1), ('E', x1, y0, y1), ('W', x0, y0, y1)):
            fbox(E, side, c, u0, u0 + 1.4, z0, z1, -0.6, 0.0, STONE_S)
            fbox(E, side, c, u1 - 1.4, u1, z0, z1, -0.6, 0.0, STONE_S)
            u = u0 + 1.4 + 2.2
            while u < u1 - 2.0:
                fbox(E, side, c, u - 0.3, u + 0.3, z0, z1, -0.6, 0.35, STONE_S)
                u += 2.2
            for zz in range(int(z0) + 4, int(z1), 4):
                fbox(E, side, c, u0 + 1.4, u1 - 1.4, zz - 0.45, zz + 0.1, -0.6, 0.05, STONE_S)
                if rnd.random() < 0.4:
                    fbox(E, side, c, u0 + 1.4 + rnd.uniform(0, 6), u1 - 1.4 - rnd.uniform(0, 6), zz + 0.1, zz + 3.4, -0.56, -0.5, GLASS_L)
        cornice(E, x0, x1, y0, y1, z1 - 0.8, m=STONE_S, steps=((0.0, 0.3, 0.8),))
        E.box(x0, x1, y0, y1, z1 - 0.01, z1 + 0.4, PANEL)
    tz = 124.4
    tx0, tx1, ty0, ty1 = EX0 + 13, EX1 - 13, TY0 + 9, TY1 - 9
    E.box(tx0 + 3, tx1 - 3, ty0 + 3, ty1 - 3, tz, tz + 8, PANEL)          # 冠部设备层
    for s in (-1, 1):
        E.box(tx0 + 1, tx1 - 1, (ty0 + 1) if s < 0 else (ty1 - 1.4), (ty0 + 1.4) if s < 0 else (ty1 - 1), tz, tz + 10, STONE_S)
    E.box((tx0 + tx1) / 2 - 0.4, (tx0 + tx1) / 2 + 0.4, (ty0 + ty1) / 2 - 0.4, (ty0 + ty1) / 2 + 0.4, tz + 8, tz + 30, STEEL)
    E.box((tx0 + tx1) / 2 - 0.6, (tx0 + tx1) / 2 + 0.6, (ty0 + ty1) / 2 - 0.6, (ty0 + ty1) / 2 + 0.6, tz + 30, tz + 31, LEDB)
    points.append((((EX0 + EX1) / 2, HY1e + 3, 4.0), 2500, (1.0, 0.85, 0.65)))

    # ============================================================ props_admin：政务院（合院部委楼 + 天桥）
    D = Batch('props_admin')
    AX0, AX1, AY0, AY1, AZ = 58.0, 108.0, -30.0, 20.0, 29.0
    IX0, IX1, IY0, IY1 = 70.0, 96.0, -18.0, 8.0
    for (x0, x1, y0, y1) in ((AX0, AX1, AY0, IY0), (AX0, AX1, IY1, AY1), (AX0, IX0, IY0, IY1), (IX1, AX1, IY0, IY1)):
        D.box(x0, x1, y0, y1, 0.0, AZ, CONC)
    D.box(AX0 - 0.3, AX1 + 0.3, AY0 - 0.3, AY1 + 0.3, 0.0, 5.0, STONE_D)             # 石材底层
    fbox(D, 'W', AX0, IY0 + 4, IY1 - 4, 0.0, 5.0, -2.5, 0.35, GLASS_H)                 # 西侧入口（朝街）
    for side, c, u0, u1 in (('W', AX0, AY0, AY1), ('S', AY0, AX0, AX1), ('N', AY1, AX0, AX1), ('E', AX1, AY0, AY1)):
        u = u0 + 1.2
        while u < u1 - 0.5:                                            # 预制混凝土竖肋 + 深窗
            fbox(D, side, c, u - 0.25, u + 0.25, 5.0, AZ, 0, 0.6, PANEL)
            u += 2.4
        for k in range(6):
            zz = 5.0 + k * 4.0
            fbox(D, side, c, u0, u1, zz, zz + 0.9, 0, 0.3, PANEL)
            u = u0 + 1.2
            while u < u1 - 2.5:
                g = GLASS_C if rnd.random() < 0.5 else GLASS
                fbox(D, side, c, u + 0.25, u + 2.15, zz + 0.9, zz + 4.0, -0.25, -0.2, g)
                u += 2.4
    cornice(D, AX0, AX1, AY0, AY1, AZ - 0.2, m=PANEL, steps=((0.0, 0.4, 0.9),))
    D.box(AX0 + 8, AX0 + 20, AY0 + 4, AY0 + 14, AZ + 0.7, AZ + 4.5, PANEL)
    # 庭院：花池 + 树
    D.box(IX0, IX1, IY0, IY1, 0.0, 0.2, PAVE2)
    for (x, y) in ((76, -12), (90, -12), (76, 2), (90, 2)):
        tree_planter(D, x, y, 0.2, 7.0, 2.6, 60 + int(x + y), kind='oak')
    for (x0, x1, y0, y1, side, c) in ((IX0, IX1, IY0, IY0, 'N', IY0), (IX0, IX1, IY1, IY1, 'S', IY1)):
        windows(D, side, c, IX0 + 1, IX1 - 1, 5.0, AZ - 1, 2.4, 4.0, 1.6, 2.8, frame=None, cool=True, lit=0.5)
    # 天桥：从执政厅塔楼北面（y -80）跨大道到政务院南面（y -30），z 24..29
    bx = 64.0
    D.box(bx - 3, bx + 3, -80.6, AY0 + 0.3, 24.0, 24.8, PANEL)
    D.box(bx - 3, bx + 3, -80.6, AY0 + 0.3, 28.4, 29.0, PANEL)
    for s in (-1, 1):
        D.box(bx + s * 3 - 0.05, bx + s * 3 + 0.05, -80.6, AY0, 24.8, 28.4, GLASS_C)
        D.strip([(bx + s * 3.1, -80.6, 24.2), (bx + s * 3.1, AY0, 24.2)], 0.25, 0.5, STEEL)
    for y in range(-80, int(AY0), 3):
        for s in (-1, 1):
            D.box(bx + s * 3 - 0.12, bx + s * 3 + 0.12, y - 0.1, y + 0.1, 24.8, 28.4, DARKM)
    D.box(bx - 2.5, bx + 2.5, -80.6, AY0, 23.2, 24.0, STEEL)
    for y in range(-78, int(AY0) - 1, 4):
        beam(D, (bx - 2.5, y, 23.2), (bx - 2.5, y + 2, 24.0), 0.15, STEEL)
        beam(D, (bx + 2.5, y, 23.2), (bx + 2.5, y + 2, 24.0), 0.15, STEEL)
    D.box(bx - 2.5, bx + 2.5, -80.6, AY0, 24.8, 24.85, LEDB)

    # ============================================================ props_culture：文化署（阅览厅 + 档案翼）
    U = Batch('props_culture')
    UX0, UX1, UY0, UY1 = -112.0, -58.0, -32.0, 32.0
    AW = -86.0                       # 档案翼 / 阅览厅分界
    # 档案翼（西）：石材实墙 + 角形退台 + 横向深窗带 + 钢竖鳍
    U.box(UX0, AW, UY0, UY1, 0.0, 22.0, STONE)
    U.box(UX0 - 0.3, AW + 0.3, UY0 - 0.3, UY1 + 0.3, 0.0, 1.2, STONE_S)
    U.box(UX0 + 4, AW, UY0 + 4, UY1 - 4, 22.0, 30.0, STONE)
    cornice(U, UX0, AW, UY0, UY1, 21.4, steps=((0.0, 0.3, 0.6),))
    cornice(U, UX0 + 4, AW, UY0 + 4, UY1 - 4, 29.4, steps=((0.0, 0.3, 0.6),))
    for zz in (6.0, 14.0):
        for side, c, u0, u1 in (('S', UY0, UX0 + 2, AW - 2), ('N', UY1, UX0 + 2, AW - 2), ('W', UX0, UY0 + 2, UY1 - 2)):
            fbox(U, side, c, u0, u1, zz, zz + 1.0, -0.02, 0.02, GLASS_L)
            fbox(U, side, c, u0 - 0.3, u1 + 0.3, zz - 0.3, zz, 0, 0.6, STONE_S)
            fbox(U, side, c, u0 - 0.3, u1 + 0.3, zz + 1.0, zz + 1.3, 0, 0.6, STONE_S)
    for y in range(int(UY0) + 3, int(UY1) - 2, 4):
        U.box(UX0 - 0.6, UX0, y - 0.15, y + 0.15, 1.2, 21.4, DARKM)
    # 阅览厅（东，朝街）：高玻璃盒 + 石端墙 + 钢竖鳍 + 大挑檐 + 锯齿天窗
    HZc = 17.0
    U.box(AW, UX1, UY0, UY1, 0.0, 0.5, GRANITE)
    for y0_, y1_ in ((UY0, UY0 + 2.5), (UY1 - 2.5, UY1)):
        U.box(AW, UX1, y0_, y1_, 0.0, HZc, STONE)
    curtain(U, 'E', UX1 - 1.5, UY0 + 2.5, UY1 - 2.5, 0.5, HZc - 0.5, mu=2.0, mz=4.2, gm=GLASS_H, fin=1.0, mm=DARKM)
    U.box(AW, UX1 + 3.0, UY0 - 1, UY1 + 1, HZc, HZc + 1.2, STONE_S)
    U.box(AW, UX1 + 3.0, UY0 - 1, UY1 + 1, HZc - 0.15, HZc, AETH)
    SHELF = C.flat('cc_shelf', (0.12, 0.08, 0.05), 0.7, noise=0.3)
    for k in range(6):                                                  # 厅内书架
        U.box(AW + 2 + k * 3.8, AW + 3.4 + k * 3.8, UY0 + 5, UY1 - 5, 0.5, 3.8, SHELF)
    U.box(AW, AW + 4, UY0 + 2.5, UY1 - 2.5, 8.0, 8.3, PANEL)            # 夹层
    for k in range(9):                                                  # 锯齿天窗（竖面是亮玻璃）
        y0 = UY0 + 3 + k * 6.4
        z0, z1 = HZc + 1.2, HZc + 4.2
        U.poly([(AW + 1, y0, z0), (UX1 - 1, y0, z0), (UX1 - 1, y0, z1), (AW + 1, y0, z1)], [(3, 2, 1, 0)], GLASS_H)
        U.poly([(AW + 1, y0, z1), (UX1 - 1, y0, z1), (UX1 - 1, y0 + 5.6, z0), (AW + 1, y0 + 5.6, z0)], [(0, 1, 2, 3)], PANEL)
        U.poly([(AW + 1, y0, z0), (AW + 1, y0, z1), (AW + 1, y0 + 5.6, z0)], [(0, 1, 2)], PANEL)
        U.poly([(UX1 - 1, y0, z0), (UX1 - 1, y0 + 5.6, z0), (UX1 - 1, y0, z1)], [(0, 1, 2)], PANEL)
    U.box(UX1 - 0.5, UX1 + 2.0, -5, 5, 0.0, 0.3, GRANITE)                # 入口台阶
    points.append(((-72, 0, 9.0), 3000, (1.0, 0.85, 0.65)))

    # ============================================================ props_lights：路灯、护柱、长椅、树池
    L = Batch('props_lights')
    lamps = []
    for x in range(-150, 151, 20):
        for y in (-62.5, -41):
            lamps.append((x, y, 8.0, 1 if y < -50 else -1))
    for y in range(-30, 116, 20):
        for x in (-57.5, 57.5):
            lamps.append((x, y, 8.0, 0))
    for (x, y, h, d) in lamps:
        L.cyl(x, y, 0.15, 0.25, 0.5, DARKM, n=10)
        L.cyl(x, y, 0.65, 0.1, h - 0.65, DARKM, n=8, r2=0.07)
        dy = 1.4 * (d if d else 0); dxl = 0 if d else (1.4 if x < 0 else -1.4)
        L.strip([(x, y, h), (x + dxl, y + dy, h + 0.1)], 0.12, 0.12, DARKM)
        L.box(x + dxl - 0.35, x + dxl + 0.35, y + dy - 0.2, y + dy + 0.2, h - 0.1, h + 0.1, DARKM)
        L.box(x + dxl - 0.3, x + dxl + 0.3, y + dy - 0.15, y + dy + 0.15, h - 0.14, h - 0.1, LAMP)
        points.append(((x + dxl, y + dy, h - 0.4), 220, (1.0, 0.78, 0.52)))
    # 广场里的矮柱灯
    for s in (-1, 1):
        for y in range(-36, 30, 8):
            L.cyl(s * 43, y, 0.2, 0.18, 1.1, DARKM, n=8)
            L.cyl(s * 43, y, 1.3, 0.16, 0.35, LAMP, n=8)
            points.append(((s * 43, y, 1.5), 25, (1.0, 0.78, 0.5)))
    # 防撞护柱：广场南沿
    for x in range(-44, 45, 3):
        if -9 <= x <= 9: continue
        L.cyl(x, -40.8, 0.15, 0.22, 0.9, STEEL, n=10)
        L.cyl(x, -40.8, 1.05, 0.23, 0.05, LEDB, n=10)
    # 长椅（沿大道北侧）
    for x in range(-140, 141, 30):
        L.box(x - 1.0, x + 1.0, -41.2, -40.7, 0.15, 0.6, DARKM)
        L.box(x - 1.1, x + 1.1, -41.25, -40.65, 0.6, 0.66, STEEL)
    # 公交 / 磁浮站小亭（大道西段）
    L.box(-118, -106, -64.5, -61.5, 3.1, 3.3, GLASS_B)
    for x in (-117.6, -106.4):
        L.box(x - 0.1, x + 0.1, -64.2, -64.0, 0.15, 3.1, DARKM)
    L.box(-118, -106, -64.3, -64.2, 0.15, 3.0, GLASS_B)

    # ============================================================ props_signs：纯色全息屏 + 纯色垂幅
    S = Batch('props_signs')
    for (x0, x1, y0, y1, z0, z1, m) in (
            (EX1 - 0.2, EX1 + 0.1, -110, -84, 30, 56, HOLO[0]),        # 执政厅塔东面
            (EX0 + 12, EX1 - 12, -65.3, -65.1, 13.6, 16.4, HOLO[2]),     # 许可大厅檐上的条屏
            (107.9, 108.2, -24, 14, 10, 24, HOLO[0]),                   # 政务院东面
            (-60.8, -60.6, -18, 18, 15.5, 18.0, HOLO[2])):              # 文化署檐上
        S.box(x0, x1, y0, y1, z0, z1, m)
    for i, (x, y) in enumerate(((-30, -35), (30, -35), (-44, 28), (44, 28))):   # 广场四角的立式导视全息柱（无字）
        S.cyl(x, y, 0.2, 0.35, 0.4, DARKM, n=10)
        S.box(x - 0.9, x + 0.9, y - 0.03, y + 0.03, 0.8, 3.6, HOLO[i % 2 * 2])

    # ============================================================ bg：周边巨构楼群 / 甲板 / 高架 / 上层底面
    GLASSD = C.flat('bg_tower', (0.07, 0.08, 0.1), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.3, 0.3, 0.32), 0.8, noise=0.3)
    PANES = [C.flat(f'bg_pane{i}', (0.02, 0.02, 0.03), 0.4, emit=c, estr=e) for i, (c, e) in enumerate(
        [((0.1, 0.8, 1.0), 6.0), ((1.0, 0.15, 0.6), 5.0), ((1.0, 0.6, 0.15), 5.0), ((0.5, 0.3, 1.0), 6.0)])]
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=2.5, cell=(3.0, 3.6), seed=i * 7.3) for i, c in
          enumerate(((1.0, 0.8, 0.55), (0.75, 0.88, 1.0), (1.0, 0.9, 0.7)))]
    WIN = C.flat('bg_winband', (0.05, 0.05, 0.06), 0.4, emit=(1.0, 0.85, 0.6), estr=0.8)
    DSIDE = C.flat('bg_deckside', (0.18, 0.18, 0.19), 0.8, noise=0.3)
    far = Batch('bg_deck')
    far.box(-2500, 2500, -2500, 2500, LOW_Z - 1, LOW_Z, BCONC)
    for (x0, x1, y0, y1, z) in ((-700, -170, -700, 700, -18), (170, 700, -700, 700, -10), (-170, 170, 165, 700, -26), (-170, 170, -700, -165, -14)):
        far.box(x0, x1, y0, y1, z - 4, z, BCONC)                        # 相邻甲板（高低错落）
        far.box(x0, x1, y0, y1, z - 40, z - 4, DSIDE)
    tw = Batch('bg_towers')
    rb = random.Random(7)
    placed = []
    for k in range(80):
        for _ in range(60):
            a = rb.uniform(0, math.tau); d = rb.uniform(200, 700)
            x, y = math.cos(a) * d, math.sin(a) * d
            w, dd = rb.uniform(30, 70), rb.uniform(30, 70)
            if all(abs(x - px) > (w + pw) / 2 + 10 or abs(y - py) > (dd + pd) / 2 + 10 for px, py, pw, pd in placed):
                break
        placed.append((x, y, w, dd))
        h = rb.uniform(140, 520)
        base = -40.0
        m = WG[k % 3] if k % 4 else GLASSD
        z = base; ww, ddd = w, dd
        for seg in range(rb.randint(1, 3)):                              # 分段退台的巨构
            zt = z + h / (seg + 1.6)
            tw.box(x - ww / 2, x + ww / 2, y - ddd / 2, y + ddd / 2, z, zt, m)
            tw.box(x - ww / 2 - 1, x + ww / 2 + 1, y - ddd / 2 - 1, y + ddd / 2 + 1, zt - 1.5, zt, WIN)
            z = zt; ww *= 0.75; ddd *= 0.75
        if k % 3 == 0:                                                    # 楼间平台
            zz = rb.uniform(20, 160)
            tw.box(x - w / 2 - 18, x + w / 2 + 18, y - dd / 2 - 18, y + dd / 2 + 18, zz, zz + 4, BCONC)
        if rb.random() < 0.7:
            pz_ = rb.uniform(30, min(z, 200)); ph = rb.uniform(14, 34)
            fy_ = y - dd / 2 - 0.8 if y > 0 else y + dd / 2 + 0.5
            tw.box(x - w * 0.35, x + w * 0.35, fy_, fy_ + 0.3, pz_, pz_ + ph, PANES[k % 4])
    # 甲板空处的中高层街区（bg，只渲染）
    blk = Batch('bg_blocks')
    for (x0, x1, y0, y1) in ((-150, -122, -35, 30), (-150, -122, 45, 140),
                             (88, 150, -140, -118), (115, 150, -110, -40), (115, 150, 30, 140), (60, 108, 35, 110), (-108, -62, 40, 110)):
        h = rb.uniform(18, 45)
        blk.box(x0, x1, y0, y1, 0.0, h, WG[rb.randrange(3)])
        blk.box(x0 - 0.5, x1 + 0.5, y0 - 0.5, y1 + 0.5, h, h + 1.0, BCONC)
    ub = Batch('bg_upper')
    UNDER = C.flat('bg_under', (0.14, 0.13, 0.13), 0.9, noise=0.4)
    for (x, y, r) in ((120, 380, 200), (-420, 160, 170), (380, -80, 150), (-150, -480, 160)):
        ub.cyl(x, y, UZ, r, 90, UNDER, n=32, r2=r * 0.4)
        for i in range(10):
            a = i * math.tau / 10
            ub.boxc(x + r * 0.8 * math.cos(a), y + r * 0.8 * math.sin(a), UZ - 1, 3, 3, 1, LAMPC)
    via = Batch('bg_viaduct')
    VZ = 34.0
    for t in range(-700, 701, 8):
        x0, y0 = t, 175 + t * 0.08
        via.box(x0 - 4.1, x0 + 4.1, y0 - 3.5, y0 + 3.5, VZ, VZ + 1.8, BCONC)
        via.box(x0 - 4.1, x0 + 4.1, y0 - 0.6, y0 + 0.6, VZ + 1.8, VZ + 2.4, STEEL)
        via.box(x0 - 4.1, x0 + 4.1, y0 - 3.5, y0 - 3.3, VZ + 1.8, VZ + 2.8, LEDB)
        if t % 48 == 0:
            via.box(x0 - 1.5, x0 + 1.5, y0 - 2, y0 + 2, -30, VZ, BCONC)
    # 广场南沿横穿的磁浮高架（大道上空）
    VZ2 = 30.0
    for t in range(-700, 701, 8):
        via.box(t - 4.1, t + 4.1, -54.5, -47.5, VZ2, VZ2 + 1.8, BCONC)
        via.box(t - 4.1, t + 4.1, -51.6, -50.4, VZ2 + 1.8, VZ2 + 2.4, STEEL)
        via.box(t - 4.1, t + 4.1, -54.5, -54.3, VZ2 + 0.2, VZ2 + 0.5, LEDB)
        if t % 64 == 0 and abs(t) > 100:
            via.box(t - 1.5, t + 1.5, -53, -49, -30, VZ2, BCONC)
    for t in (-100, 100):
        for yy in (-58.5, -43.5):
            via.box(t - 1.2, t + 1.2, yy - 1.2, yy + 1.2, 0, VZ2, BCONC)
        via.box(t - 1.5, t + 1.5, -59.5, -42.5, VZ2 - 2.5, VZ2, BCONC)
    # 头顶巨构：上层甲板（中间留开口）+ 格梁 + 两道桁架巨梁 + 底面灯
    ov = Batch('bg_overhead')
    OZ = 175.0
    for (x0, x1, y0, y1) in ((-900, -95, -900, 900), (125, 900, -900, 900), (-95, 125, 140, 900), (-95, 125, -900, -190)):
        ov.box(x0, x1, y0, y1, OZ, OZ + 8, UNDER)
    for k in range(-20, 21):
        g = k * 45.0
        if not (-95 < g < 125):
            ov.box(g - 1.5, g + 1.5, -900, 900, OZ - 7, OZ, BCONC)
        if not (-190 < g < 140):
            ov.box(-900, 900, g - 1.5, g + 1.5, OZ - 7, OZ, BCONC)
    for (y, z) in ((-270, 120), (110, 135)):
        ov.box(-500, 500, y - 3, y + 3, z, z + 1.2, STEEL)
        ov.box(-500, 500, y - 3, y + 3, z + 12, z + 13.2, STEEL)
        for t in range(-500, 500, 12):
            for yy in (y - 3, y + 3):
                beam(ov, (t, yy, z + 0.6), (t + 6, yy, z + 12.6), 0.7, STEEL)
                beam(ov, (t + 6, yy, z + 12.6), (t + 12, yy, z + 0.6), 0.7, STEEL)
        ov.box(-500, 500, y - 3.1, y - 3.0, z - 0.2, z, LEDB)
    for i in range(220):
        x, y = rb.uniform(-700, 700), rb.uniform(-700, 700)
        if -95 < x < 125 and -190 < y < 140:
            continue
        ov.boxc(x, y, OZ - 7.6, 4, 4, 0.6, rb.choice([LAMP, LAMPC, LAMPC]))
    TRAIN = C.flat('bg_train', (0.85, 0.86, 0.88), 0.3, metal=0.4)
    for t in range(-250, -150, 25):
        via.box(t, t + 23.5, -52.8, -49.2, VZ2 + 2.6, VZ2 + 6.4, TRAIN)
        via.box(t + 1, t + 22.5, -52.85, -49.15, VZ2 + 4.3, VZ2 + 5.3, GLASS_C)
    for t in range(-160, -40, 25):
        via.box(t, t + 23.5, 175 + t * 0.08 - 1.8, 175 + t * 0.08 + 1.8, VZ + 2.6, VZ + 6.4, TRAIN)
        via.box(t + 1, t + 22.5, 175 + t * 0.08 - 1.85, 175 + t * 0.08 + 1.85, VZ + 4.3, VZ + 5.3, GLASS_C)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光
    w = bpy.data.worlds.new('w'); sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    wo = nt.nodes.new('ShaderNodeOutputWorld'); wo.name = 'World Output'
    bgn = nt.nodes.new('ShaderNodeBackground')
    bgn.inputs[0].default_value = (0.06, 0.05, 0.07, 1); bgn.inputs[1].default_value = 1.0   # 城市光污染的雾色天，没有星空
    nt.links.new(bgn.outputs[0], wo.inputs[0])
    vs = nt.nodes.new('ShaderNodeVolumePrincipled')
    vs.inputs['Color'].default_value = (0.55, 0.6, 0.7, 1); vs.inputs['Density'].default_value = 0.0012
    nt.links.new(vs.outputs[0], nt.nodes['World Output'].inputs['Volume'])
    sc.cycles.volume_bounces = 0; sc.cycles.volume_step_rate = 4.0
    ld = bpy.data.lights.new('fill', 'AREA'); ld.energy = 60000; ld.size = 200; ld.color = (0.7, 0.8, 1.0)
    o = bpy.data.objects.new('fill', ld); sc.collection.objects.link(o); o.location = (0, -20, 150)
    for (x, y) in ((-300, 0), (300, 0), (0, 300), (0, -350)):             # 头顶甲板底面的冷色泛光
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 2.5e5; ld.size = 250; ld.color = (0.75, 0.82, 1.0)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, 160)
    warm = (1.0, 0.8, 0.55)
    for (p, t, e, ang) in (((-36, 20, 0.5), (-14, 52, 22), 2.2e4, 40), ((36, 20, 0.5), (14, 52, 22), 2.2e4, 40),
                           ((0, 40, 1.0), (0, 84, 58), 8e4, 25),
                           ((-54, -48, 0.5), (-54, -66, 14), 4e4, 60), ((54, -48, 0.5), (54, -90, 60), 1.2e5, 30),
                           ((-45, 0, 0.5), (-60, 0, 8), 2e4, 60), ((46, -5, 0.5), (60, -5, 18), 3e4, 60)):
        C.spot_light('flood', p, t, e, warm, ang, 0.4)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.55

    CAMS = {
        'c1': ((-85.0, -235.0, 150.0), (0.0, -15.0, 12.0), 30, 0.0),
        'c2': ((15.0, -2.0, 1.7), (0.0, 60.0, 23.0), 24, 0.0),
        'c3': ((0.0, -22.0, 1.7), (0.0, -75.0, 9.0), 15, 0.0),
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
