"""防卫军前沿哨所（下层边缘；天城防卫军在下层的几个前沿哨所之一，地图上画一个，位置推断）——只做外观。
一座紧凑的前沿哨所：Hesco 防爆筐 + 混凝土 T 形墙围成的院子，两层集装箱模块指挥所，钢架观察塔（探照灯朝外），
车棚里两台中性涂装的装甲通用车（不装任何武器、无标识），南侧大门（道闸 + 岗亭 + 水泥墩迷宫），北侧封闭钢门，
天线桅杆、发电机组、油囊（带土围堰）、投光灯；北面是城市外墙的巨大缺口，缺口前是反兽障碍带：
钢拒马（三角锥刺猬）、带钢刺的混凝土块、焊在拒马上的钢板——钢板上有一组组抽象的平行刮痕（兽爪留下的）。
缺口外是漆黑的荒野。中立：无武器、无人物、无文字 / 标志 / 徽章、无羁押物品。

布局（米，+y = 城外方向）：院子 x -20..20、y -14..18；指挥所 x -17..-4.9、y -10..-2.7（两层）；
  车棚 x 3..17、y -10..0；观察塔 (15, 13)；南门 x -3..3 @ y -14；北门 x -3..3 @ y 18；
  障碍带 y 24..42；外墙 y 46..52（缺口 x -30..30）；荒野 y > 52。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/outpost/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/op.jpg [--blend /tmp/op.blend] [--log /tmp/op.log] [--exposure 0.9]
cam: c1 俯瞰 / c2 南门 + 指挥所 / c3 塔上向外看障碍带与荒野
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/op.jpg', blend='', log='', exposure=''))

KX0, KX1, KY0, KY1 = -20.0, 20.0, -14.0, 18.0      # 院子
GX0, GX1 = -3.0, 3.0                                # 南 / 北门洞
WY0, WY1, WH = 46.0, 52.0, 38.0                     # 城外墙
BR = 30.0                                           # 缺口半宽
UZ = 120.0
TX, TY, TH = 15.0, 13.0, 11.0                       # 观察塔


def main():
    import bpy
    from mathutils import Matrix, Vector
    sc = C.setup(A['samples'])
    Batch = C.Batch
    rnd = random.Random(41)

    # ------------------------------------------------------------ 材质（中性灰绿 / 沙色，旧化从一开始就做）
    CONC = C.pbr('op_conc', 'concrete_wall_008', 4.0, tint=(0.5, 0.5, 0.48), sat=0.0, value=0.9, weather=1.0)
    CONC_D = C.pbr('op_conc_dark', 'concrete_wall_008', 5.0, tint=(0.32, 0.32, 0.32), sat=0.0, weather=0.9)
    CONC_P = C.pbr('op_conc_pad', 'smooth_concrete_floor', 3.0, tint=(0.45, 0.44, 0.42), sat=0.1, weather=0.6)
    ASPH = C.pbr('op_asphalt', 'asphalt_02', 2.0, tint=(0.28, 0.28, 0.29), sat=0.3, value=0.6)
    GRAV = C.pbr('op_gravel', 'dirt_floor', 3.0, tint=(0.34, 0.32, 0.28), sat=0.4, value=0.7)
    DIRT = C.pbr('op_dirt', 'concrete_floor_worn_001', 5.0, tint=(0.24, 0.22, 0.19), sat=0.3, value=0.5, weather=1.0)
    WILD = C.pbr('op_wild', 'dirt_floor', 6.0, tint=(0.16, 0.15, 0.13), sat=0.4, value=0.5)
    STEEL = C.pbr('op_steel', 'Metal009', 2.0, tint=(0.34, 0.35, 0.35), sat=0.3, metal=0.8, rough_mul=1.2)
    PAINT = C.pbr('op_paint', 'Metal009', 2.0, tint=(0.2, 0.22, 0.19), sat=0.2, metal=0.3, rough_mul=1.4)
    CONT_G = C.pbr('op_cont_g', 'box_profile_metal_sheet', 1.4, tint=(0.3, 0.33, 0.26), sat=0.3, metal=0.4, weather=0.9, rot=1.5708)
    CONT_S = C.pbr('op_cont_s', 'box_profile_metal_sheet', 1.4, tint=(0.42, 0.39, 0.31), sat=0.3, metal=0.4, weather=0.9, rot=1.5708)
    SHEET_R = C.pbr('op_sheet_rust', 'box_profile_metal_sheet', 2.5, tint=(0.45, 0.31, 0.21), sat=0.6, metal=0.3, weather=1.0)
    ROOFS = C.pbr('op_roof', 'box_profile_metal_sheet', 2.0, tint=(0.3, 0.31, 0.28), sat=0.2, metal=0.5, weather=0.7)
    ARMOR = C.pbr('op_armor', 'Metal009', 3.0, tint=(0.27, 0.28, 0.23), sat=0.2, metal=0.2, rough_mul=1.6, weather=0.6)
    PLATE = C.pbr('op_plate', 'Metal009', 1.5, tint=(0.3, 0.29, 0.27), sat=0.3, metal=0.7, rough_mul=1.3, weather=0.8)
    RUST = C.flat('op_rust', (0.16, 0.085, 0.045), 0.8, metal=0.3, noise=0.6)
    REBAR = C.flat('op_rebar', (0.2, 0.1, 0.05), 0.7, metal=0.2, noise=0.4)
    GOUGE = C.flat('op_gouge', (0.012, 0.011, 0.01), 0.7, metal=0.4)
    BRIGHT = C.flat('op_bright', (0.75, 0.75, 0.72), 0.25, metal=1.0, noise=0.3)
    RUBBER = C.pbr('op_rubber', 'Rubber004', 1.0, tint=(0.2, 0.2, 0.2), sat=0.2)
    RIM = C.flat('op_rim', (0.18, 0.19, 0.16), 0.5, metal=0.6, noise=0.3)
    HAZ = C.hazard('op_hazard', wear=0.6)
    HAZ_RW = C.hazard('op_hazard_rw', (0.6, 0.06, 0.04), (0.7, 0.68, 0.64), 0.35, wear=0.5)
    SAND = C.flat('op_hesco', (0.26, 0.23, 0.16), 0.95, noise=0.7)
    BAG = C.flat('op_bag', (0.3, 0.27, 0.19), 0.95, noise=0.8)
    BAG2 = C.flat('op_bag2', (0.22, 0.22, 0.16), 0.95, noise=0.8)
    BLADDER = C.flat('op_bladder', (0.05, 0.055, 0.045), 0.45, noise=0.3, coat=0.2)
    GLASS = C.glass('op_glass', (0.04, 0.05, 0.05), 0.06)
    WINL = C.glass('op_win_lit', (0.05, 0.05, 0.05), 0.2, emit=(1.0, 0.8, 0.55), estr=2.5)
    WIND = C.glass('op_win_dim', (0.04, 0.04, 0.04), 0.2, emit=(0.6, 0.75, 0.7), estr=0.4)
    DARK = C.flat('op_dark', (0.012, 0.012, 0.013), 0.8)
    CABLE = C.flat('op_cable', (0.02, 0.02, 0.02), 0.5)
    GRIME = C.flat('op_grime', (0.05, 0.05, 0.045), 0.8, noise=0.7)
    MUD = C.flat('op_mud', (0.09, 0.075, 0.055), 0.9, noise=0.7)
    OIL = C.flat('op_oil', (0.012, 0.011, 0.01), 0.15, noise=0.3, coat=0.8)
    PUDDLE = C.flat('op_puddle', (0.06, 0.065, 0.07), 0.04, noise=0.1, coat=1.0)
    WHITEP = C.flat('op_line_w', (0.5, 0.5, 0.47), 0.6, noise=0.5)
    MESH = C.flat('op_mesh', (0.28, 0.27, 0.24), 0.6, metal=0.6, noise=0.5)
    COLDL = C.flat('op_cold', (0.85, 0.92, 1), 0.3, emit=(0.85, 0.93, 1.0), estr=40.0)
    SODL = C.flat('op_sodium', (1, 0.6, 0.2), 0.3, emit=(1.0, 0.55, 0.18), estr=30.0)
    WARML = C.flat('op_warm', (1, 0.8, 0.5), 0.3, emit=(1.0, 0.72, 0.42), estr=6.0)
    RED = C.flat('op_red', (1, 0.1, 0.05), 0.3, emit=(1.0, 0.06, 0.03), estr=25.0)
    GREEN = C.flat('op_green', (0.1, 1, 0.3), 0.3, emit=(0.1, 1.0, 0.35), estr=20.0)
    BARK = C.flat('op_deadwood', (0.06, 0.055, 0.05), 0.9, noise=0.6)

    # ------------------------------------------------------------ 几何工具
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

    def wheel(B, M, x, y, z, r, w, m_t=None, m_r=None, n=16):
        """轮胎（绕本地 x 轴）+ 轮毂 + 胎面花纹块"""
        R = M @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
        B.cyl(0, 0, -w / 2, r, w, m_t or RUBBER, n, mat=R)
        s = 1 if x > 0 else -1
        B.cyl(0, 0, (w / 2 - 0.01) * s - (0.02 if s < 0 else 0), r * 0.55, 0.03, m_r or RIM, 10, smooth=False, mat=R)
        B.cyl(0, 0, (w / 2 + 0.01) * s - (0.02 if s < 0 else 0), r * 0.18, 0.04, STEEL, 8, smooth=False, mat=R)
        for k in range(12):                                                         # 胎面块
            a = k * math.tau / 12
            B.box(r - 0.01, r + 0.03, -0.05, 0.05, -w / 2 + 0.03, w / 2 - 0.03, RUBBER, R @ Matrix.Rotation(a, 4, 'Z'))

    def ellip(B, M, rx, ry, rz, m, seg=7, rings=4, flat_bottom=True):
        vs = []
        for j in range(rings + 1):
            ph = math.pi * (1 - j / rings)
            for i in range(seg):
                a = i * math.tau / seg
                z = rz * math.cos(ph)
                if flat_bottom:
                    z = max(z, -rz * 0.7)
                vs.append((rx * math.sin(ph) * math.cos(a), ry * math.sin(ph) * math.sin(a), z))
        fs = [(j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i) for j in range(rings) for i in range(seg)]
        B.poly(vs, fs, m, mat=M, smooth=True)

    def blob(B, x, y, z, r, m, k=12, sq=0.7):
        ph = rnd.uniform(0, 6.28)
        B.poly([(x + r * (1 + 0.3 * math.sin(3 * a + ph) + rnd.uniform(-0.1, 0.1)) * math.cos(a),
                 y + r * sq * (1 + 0.3 * math.sin(2 * a + ph) + rnd.uniform(-0.1, 0.1)) * math.sin(a), z)
                for a in (q * math.tau / k for q in range(k))], [tuple(range(k))], m)

    def gouges(B, M, u0, v0, n=4, L=1.4, ang=-0.9, face=1.0, depth=0.0):
        """一组平行的弧形刮痕：暗色凹槽 + 两侧翻起的亮金属边；M = 板面局部（u 水平, v 竖直, n 法向）"""
        du, dv = math.cos(ang), math.sin(ang)
        pu, pv = -dv, du
        for k in range(n):
            o = (k - (n - 1) / 2) * 0.13
            Lk = L * rnd.uniform(0.75, 1.1)
            pts, pe = [], []
            for s in range(7):
                t = s / 6
                bow = 0.12 * math.sin(t * math.pi)
                u = u0 + pu * (o + bow) + du * (t - 0.5) * Lk
                v = v0 + pv * (o + bow) + dv * (t - 0.5) * Lk
                pts.append(tuple(M @ Vector((u, v, face * (depth + 0.012)))))
                pe.append((u, v))
            B.strip(pts, 0.012, 0.045 * (1 - abs(k - (n - 1) / 2) * 0.15), GOUGE)
            for side in (-1, 1):
                B.strip([tuple(M @ Vector((u + pu * side * 0.03, v + pv * side * 0.03, face * (depth + 0.016)))) for (u, v) in pe[1:-1]],
                        0.01, 0.012, BRIGHT)

    spots, points = [], []

    # ============================================================ 地面（site_ground）
    G = Batch('site_ground')
    G.box(-60, 60, -45, 24, -0.3, -0.05, DIRT)                                             # 周边硬土
    G.box(KX0, KX1, KY0, KY1, -0.05, 0.0, GRAV)                                            # 院内碎石
    G.box(-18, -3.5, -11.5, -1.5, 0.0, 0.12, CONC_P)                                        # 指挥所地坪
    G.box(2.5, 17.5, -10.5, 0.5, 0.0, 0.1, CONC_P)                                          # 车棚地坪
    G.box(GX0 - 0.5, GX1 + 0.5, -45, KY0, -0.06, -0.02, ASPH)                              # 进场路
    G.box(GX0 - 0.5, GX1 + 0.5, KY0, KY1, 0.0, 0.02, ASPH)                                  # 院内车道
    G.box(-2.0, 2.0, KY1, 24, -0.06, -0.02, CONC_P)                                         # 北门外坡道
    for y in range(-44, -14, 6):
        G.box(-0.08, 0.08, y, y + 3, -0.02, -0.015, WHITEP)
    for i in range(22):                                                                     # 车辙、积水、油渍
        x, y = rnd.uniform(-18, 18), rnd.uniform(-12, 16)
        blob(G, x, y, 0.004, rnd.uniform(0.6, 1.8), rnd.choice([OIL, PUDDLE, MUD]))
    for i in range(18):
        x, y = rnd.uniform(-40, 40), rnd.uniform(-40, 22)
        if KX0 - 2 < x < KX1 + 2 and KY0 - 2 < y < KY1 + 2:
            continue
        blob(G, x, y, -0.045, rnd.uniform(1.0, 3.0), rnd.choice([PUDDLE, MUD, MUD]), 14, 0.5)
    for x in (-1.2, 1.2):                                                                   # 车辙
        for y0 in range(-12, 16, 4):
            G.box(x - 0.25, x + 0.25, y0, y0 + 3.6, 0.021, 0.025, MUD)

    # ============================================================ 围墙（props_perimeter）：北 / 南 Hesco，东 / 西 T 形墙，沙袋
    Pe = Batch('props_perimeter')

    def hesco(x, y, n, ax='x', h=1.6):
        for k in range(n):
            cx_, cy_ = (x + k * 1.05, y) if ax == 'x' else (x, y + k * 1.05)
            Pe.boxc(cx_, cy_, 0, 0.98, 0.98, h - 0.08, SAND)
            m = 5; top = []
            for a in range(m):
                for b in range(m):
                    u, v = a / (m - 1) - 0.5, b / (m - 1) - 0.5
                    sag = 0.12 * (1 - (2 * u) ** 2) * (1 - (2 * v) ** 2)
                    top.append((cx_ + u * 0.98, cy_ + v * 0.98, h - 0.08 - sag + rnd.uniform(-0.01, 0.01)))
            Pe.poly(top, [(a * m + b, (a + 1) * m + b, (a + 1) * m + b + 1, a * m + b + 1) for a in range(m - 1) for b in range(m - 1)], DIRT)
            for u in (-0.5, 0.0, 0.5):
                for sgn in (-1, 1):
                    Pe.boxc(cx_ + u, cy_ + sgn * 0.5, 0, 0.022, 0.022, h, STEEL)
                    Pe.boxc(cx_ + sgn * 0.5, cy_ + u, 0, 0.022, 0.022, h, STEEL)
            for zz in (0.0, 0.55, 1.1, h - 0.02):
                for sgn in (-1, 1):
                    Pe.boxc(cx_, cy_ + sgn * 0.5, zz, 1.02, 0.022, 0.022, STEEL)
                    Pe.boxc(cx_ + sgn * 0.5, cy_, zz, 0.022, 1.02, 0.022, STEEL)
            if rnd.random() < 0.3:                                                          # 土工布破口，漏沙
                Pe.boxc(cx_ + rnd.uniform(-0.3, 0.3), cy_ + (0.5 if ax == 'x' else 0) * rnd.choice((-1, 1)), 0.0, 0.5, 0.5, 0.12, DIRT)

    def twall(x0, x1, y, face=1):
        """混凝土 T 形墙（Bremer）：沿 x 排，底板朝 face 反方向"""
        prof = [(-0.6, 0.0), (0.6, 0.0), (0.6, 0.35), (0.17, 0.45), (0.14, 3.6), (-0.14, 3.6), (-0.17, 0.45), (-0.6, 0.35)]
        n = len(prof)
        x = x0
        while x < x1 - 0.5:
            L = min(1.5, x1 - x) - 0.04
            M = Matrix.Translation((x + L / 2 + 0.02, y, 0))
            vs = [(e * L / 2, py * face, pz) for e in (-1, 1) for (py, pz) in prof]
            if face > 0:
                fs = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [((i + 1) % n, i, n + i, n + (i + 1) % n) for i in range(n)]
            else:
                fs = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
            Pe.poly(vs, fs, CONC if rnd.random() < 0.7 else CONC_D, mat=M)
            Pe.box(-0.05, 0.05, -0.15, 0.15, 3.6, 3.75, STEEL, Matrix.Translation((x + L / 2, y, 0)))   # 吊环
            if rnd.random() < 0.5:
                Pe.box(-L / 2 + 0.1, L / 2 - 0.1, -0.15, -0.14, 0.4, rnd.uniform(1.2, 3.0), GRIME, M)
            x += 1.5

    def twall_y(x, y0, y1, face=1):
        """沿 y 排的 T 形墙（先按 x 排再绕 z 转 90°）"""
        prof = [(-0.6, 0.0), (0.6, 0.0), (0.6, 0.35), (0.17, 0.45), (0.14, 3.6), (-0.14, 3.6), (-0.17, 0.45), (-0.6, 0.35)]
        n = len(prof)
        y = y0
        while y < y1 - 0.5:
            L = min(1.5, y1 - y) - 0.04
            M = Matrix.Translation((x, y + L / 2 + 0.02, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
            vs = [(e * L / 2, py * face, pz) for e in (-1, 1) for (py, pz) in prof]
            if face > 0:
                fs = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [((i + 1) % n, i, n + i, n + (i + 1) % n) for i in range(n)]
            else:
                fs = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
            Pe.poly(vs, fs, CONC if rnd.random() < 0.7 else CONC_D, mat=M)
            if rnd.random() < 0.5:
                Pe.box(-L / 2 + 0.1, L / 2 - 0.1, 0.14 * face, 0.15 * face, 0.4, rnd.uniform(1.2, 3.0), GRIME, M)
            y += 1.5

    def bags(x0, y0, x1, y1, rows, z0=0.0):
        """沙袋墙：交错砌，每层略收"""
        L = math.hypot(x1 - x0, y1 - y0); dx, dy = (x1 - x0) / L, (y1 - y0) / L
        rz = math.atan2(dy, dx)
        for r in range(rows):
            n = int(L / 0.62)
            for k in range(n):
                s = (k + 0.5 + (0.5 if r % 2 else 0)) * (L / (n + 0.5))
                if s > L - 0.2:
                    continue
                M = T(x0 + dx * s, y0 + dy * s, z0 + 0.1 + r * 0.19, rz + rnd.uniform(-0.08, 0.08))
                ellip(Pe, M, 0.33, 0.2, 0.12, BAG if rnd.random() < 0.7 else BAG2)

    hesco(KX0 + 0.5, KY1, 17)                           # 北：x -19.5..-2.7
    hesco(GX1 + 1.0, KY1, 16)                           # 北：x 4..19.8
    hesco(KX0 + 0.5, KY1 + 1.05, 16)                    # 北墙双排（朝外那面）
    hesco(GX1 + 1.0, KY1 + 1.05, 16)
    hesco(KX0 + 0.5, KY0, 16)                           # 南
    hesco(GX1 + 1.5, KY0, 16)
    twall_y(KX0 - 0.2, KY0 + 0.6, KY1 - 0.4, face=1)    # 西（底板朝外 -x）
    twall_y(KX1 + 0.4, KY0 + 0.6, KY1 - 0.4, face=-1)   # 东
    # 北墙顶沙袋 + 拐角沙袋掩体
    bags(KX0 + 1, KY1 + 0.5, GX0 - 0.8, KY1 + 0.5, 2, 1.6)
    bags(GX1 + 1.5, KY1 + 0.5, TX - 2.0, KY1 + 0.5, 2, 1.6)
    for (x, y) in ((KX0 + 1.5, KY1 - 1.5), (KX1 - 1.5, KY0 + 1.5)):
        bags(x - 1.5, y - 1.5, x + 1.5, y - 1.5, 5)
        bags(x - 1.5, y - 1.5, x - 1.5, y + 1.2, 5)

    # ============================================================ 指挥所（walls_ext）：两层集装箱模块
    Wx = Batch('walls_ext')
    CL, CW, CH = 6.06, 2.44, 2.59
    CX0, CY0 = -17.0, -10.0

    def container(x0, y0, z0, m, win_front=True, win_back=False, door=False, lit=0.5):
        x1, y1, z1 = x0 + CL, y0 + CW, z0 + CH
        Wx.box(x0 + 0.08, x1 - 0.08, y0 + 0.03, y1 - 0.03, z0 + 0.12, z1 - 0.1, m)            # 波纹墙板
        for (xa, xb) in ((x0, x0 + 0.16), (x1 - 0.16, x1)):                                   # 角柱
            for (ya, yb) in ((y0, y0 + 0.16), (y1 - 0.16, y1)):
                Wx.box(xa, xb, ya, yb, z0, z1, PAINT)
                for zz in (z0, z1 - 0.12):                                                     # 角件
                    Wx.box(xa - 0.01, xb + 0.01, ya - 0.01, yb + 0.01, zz, zz + 0.12, STEEL)
        for zz in (z0, z1 - 0.12):                                                            # 上下纵梁
            Wx.box(x0 + 0.16, x1 - 0.16, y0, y0 + 0.1, zz, zz + 0.12, PAINT)
            Wx.box(x0 + 0.16, x1 - 0.16, y1 - 0.1, y1, zz, zz + 0.12, PAINT)
            Wx.box(x0, x0 + 0.1, y0 + 0.16, y1 - 0.16, zz, zz + 0.12, PAINT)
            Wx.box(x1 - 0.1, x1, y0 + 0.16, y1 - 0.16, zz, zz + 0.12, PAINT)
        Wx.box(x0 + 0.1, x1 - 0.1, y0 + 0.1, y1 - 0.1, z1 - 0.1, z1 - 0.04, ROOFS)
        # 锈流 + 底部泥污
        for k in range(3):
            xx = rnd.uniform(x0 + 0.4, x1 - 0.6)
            Wx.box(xx, xx + rnd.uniform(0.05, 0.15), y0 + 0.01, y0 + 0.02, z1 - rnd.uniform(0.6, 1.8), z1 - 0.12, RUST)
        Wx.box(x0 + 0.16, x1 - 0.16, y0 + 0.015, y0 + 0.025, z0 + 0.12, z0 + rnd.uniform(0.3, 0.6), MUD)
        def window(u, face_y, sgn):
            Wx.box(u - 0.62, u + 0.62, face_y - sgn * 0.02, face_y + sgn * 0.08, z0 + 0.95, z0 + 1.95, PAINT)   # 窗框
            Wx.box(u - 0.52, u + 0.52, face_y + sgn * 0.08, face_y + sgn * 0.085, z0 + 1.05, z0 + 1.85,
                   (WINL if rnd.random() < lit else WIND))
            Wx.box(u - 0.03, u + 0.03, face_y + sgn * 0.085, face_y + sgn * 0.1, z0 + 1.05, z0 + 1.85, STEEL)
            # 外挂钢护窗（上翻支起 / 放下），带防护网格
            if rnd.random() < 0.5:
                rbox(Wx, u, face_y + sgn * 0.45, z0 + 2.05, 1.3, 0.04, 0.8, PLATE, rx=sgn * 1.05)
                beam(Wx, (u - 0.6, face_y + sgn * 0.09, z0 + 1.7), (u - 0.6, face_y + sgn * 0.7, z0 + 2.2), 0.03, STEEL)
                beam(Wx, (u + 0.6, face_y + sgn * 0.09, z0 + 1.7), (u + 0.6, face_y + sgn * 0.7, z0 + 2.2), 0.03, STEEL)
            else:
                Wx.box(u - 0.65, u + 0.65, face_y + sgn * 0.1, face_y + sgn * 0.14, z0 + 1.0, z0 + 1.9, PLATE)
                for q in range(3):
                    Wx.box(u - 0.55 + q * 0.5, u - 0.5 + q * 0.5, face_y + sgn * 0.14, face_y + sgn * 0.16, z0 + 1.05, z0 + 1.85, DARK)
            for q in range(4):
                Wx.box(u - 0.55, u + 0.55, face_y + sgn * 0.1, face_y + sgn * 0.11, z0 + 1.1 + q * 0.23, z0 + 1.12 + q * 0.23, STEEL) if False else None
        if win_front:
            for u in (x0 + 1.5, x0 + 4.4):
                window(u, y0, -1)
        if win_back:
            window(x0 + 3.0, y1, 1)
        if door:
            u = x0 + 3.0 if not win_front else x0 + 2.95
            Wx.box(u - 0.5, u + 0.5, y0 - 0.06, y0 + 0.02, z0 + 0.12, z0 + 2.2, PLATE)
            Wx.box(u - 0.58, u + 0.58, y0 - 0.08, y0 + 0.02, z0 + 2.2, z0 + 2.3, PAINT)
            Wx.box(u + 0.3, u + 0.4, y0 - 0.1, y0 - 0.06, z0 + 1.0, z0 + 1.08, STEEL)
            Wx.boxc(u, y0 - 0.25, z0 + 2.45, 0.3, 0.2, 0.14, DARK)
            Wx.boxc(u, y0 - 0.35, z0 + 2.42, 0.2, 0.02, 0.06, WARML)
            points.append(((u, y0 - 0.8, z0 + 2.3), 40, (1.0, 0.75, 0.45)))

    # 首层：前排 2 个（门 + 窗），中排 2 个，后排 2 个；二层：后两排 4 个（前排屋顶作挑台）
    mats = [CONT_G, CONT_S]
    container(CX0, CY0, 0.12, CONT_G, win_front=False, door=True)
    container(CX0 + CL, CY0, 0.12, CONT_S, win_front=True, door=False)
    for r in (1, 2):
        for c in range(2):
            container(CX0 + c * CL, CY0 + r * CW, 0.12, mats[(r + c) % 2], win_front=False, win_back=(r == 2))
    for r in (1, 2):
        for c in range(2):
            container(CX0 + c * CL, CY0 + r * CW, 0.12 + CH, mats[(r + c + 1) % 2], win_front=(r == 1), win_back=(r == 2),
                      door=(r == 1 and c == 1), lit=0.6)
    # 前排屋顶挑台：防滑钢板 + 栏杆（圆管）+ 沙袋
    zt = 0.12 + CH
    Wx.box(CX0, CX0 + 2 * CL, CY0, CY0 + CW, zt, zt + 0.05, PLATE)
    for (a, b) in (((CX0 + 0.1, CY0 + 0.1), (CX0 + 2 * CL - 0.1, CY0 + 0.1)), ((CX0 + 0.1, CY0 + 0.1), (CX0 + 0.1, CY0 + CW))):
        for zz in (zt + 0.55, zt + 1.05):
            Wx.tube([(a[0], a[1], zz), (b[0], b[1], zz)], 0.025, PAINT, n=6)
    for k in range(9):
        x = CX0 + 0.1 + k * (2 * CL - 0.2) / 8
        Wx.tube([(x, CY0 + 0.1, zt), (x, CY0 + 0.1, zt + 1.05)], 0.025, PAINT, n=6)
    # 外挂钢楼梯（东端，两跑 + 平台）
    sx0 = CX0 + 2 * CL + 0.1
    for k in range(14):
        z = 0.12 + k * (zt - 0.12) / 14
        Wx.box(sx0, sx0 + 1.0, CY0 + 6.8 - k * 0.27, CY0 + 7.1 - k * 0.27, z + 0.15, z + 0.19, PLATE)
    for xx in (sx0, sx0 + 1.0):
        beam(Wx, (xx, CY0 + 7.1, 0.12), (xx, CY0 + 3.3, zt), 0.1, PAINT)
        beam(Wx, (xx, CY0 + 7.1, 1.0), (xx, CY0 + 3.3, zt + 1.0), 0.04, PAINT)
    Wx.box(sx0, sx0 + 1.0, CY0 + 0.0, CY0 + 3.3, zt - 0.05, zt + 0.05, PLATE)
    for (x, y) in ((sx0 + 0.9, CY0 + 0.1), (sx0 + 0.9, CY0 + 3.2)):
        Wx.box(x, x + 0.1, y, y + 0.1, 0, zt, PAINT)
    # 空调外机 + 线槽
    for (x, z) in ((CX0 + 1.2, 0.3), (CX0 + 7.6, 0.3 + CH), (CX0 + 10.4, 0.3)):
        Wx.boxc(x, CY0 + 3 * CW + 0.35, z, 0.9, 0.6, 0.65, WHITEP)
        Wx.cyl(x, CY0 + 3 * CW + 0.66, z + 0.33, 0.24, 0.02, DARK, 14, mat=None)
        Wx.tube([(x + 0.3, CY0 + 3 * CW + 0.05, z + 0.6), (x + 0.3, CY0 + 3 * CW + 0.05, z + 1.9)], 0.03, CABLE, n=5)
    Wx.box(CX0, CX0 + 2 * CL, CY0 + 3 * CW + 0.02, CY0 + 3 * CW + 0.12, 2.45, 2.55, STEEL)
    # 屋顶：沙袋压顶、卫星锅（圆盘，无标识）、通风帽
    zr = 0.12 + 2 * CH
    Wx.box(CX0, CX0 + 2 * CL, CY0 + CW, CY0 + 3 * CW, zr, zr + 0.06, ROOFS)
    for k in range(10):
        ellip(Wx, T(CX0 + 0.6 + k * 1.2, CY0 + CW + 0.3, zr + 0.14, rnd.uniform(-0.1, 0.1)), 0.33, 0.2, 0.12, BAG)
    Wx.boxc(CX0 + 3.0, CY0 + 5.5, zr, 0.8, 0.8, 0.5, WHITEP)
    Wx.lathe(CX0 + 3.0, CY0 + 5.5, zr + 1.0, [(0.02, 0.0), (0.45, 0.12), (0.62, 0.28)], WHITEP, n=18)
    Wx.cyl(CX0 + 3.0, CY0 + 5.5, zr + 0.5, 0.05, 0.5, STEEL, 6)
    for x in (CX0 + 7.0, CX0 + 9.5):
        Wx.cyl(x, CY0 + 6.0, zr, 0.18, 0.7, STEEL, 10)
        Wx.cyl(x, CY0 + 6.0, zr + 0.7, 0.3, 0.12, STEEL, 10, r2=0.05)
    # 墙根沙袋（前面一道矮沙袋墙）
    bags(CX0 - 0.4, CY0 - 1.2, CX0 + 4.8, CY0 - 1.2, 4)
    bags(CX0 + 7.0, CY0 - 1.2, CX0 + 12.0, CY0 - 1.2, 4)

    # ============================================================ 观察塔（props_tower）
    To = Batch('props_tower')
    L0, L1 = 2.2, 1.5                                             # 腿距：底 / 顶（半宽）
    legs = [(sx, sy) for sx in (-1, 1) for sy in (-1, 1)]
    for (sx, sy) in legs:
        To.boxc(TX + sx * L0, TY + sy * L0, 0, 0.9, 0.9, 0.4, CONC_D)                    # 基础
        beam(To, (TX + sx * L0, TY + sy * L0, 0.4), (TX + sx * L1, TY + sy * L1, TH), 0.2, PAINT)
    lv = [0.4, 3.2, 6.0, 8.6, TH]
    for i, z in enumerate(lv):
        f = (z - 0.4) / (TH - 0.4); h = L0 + (L1 - L0) * f
        for (a, b) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            beam(To, (TX + a[0] * h, TY + a[1] * h, z), (TX + b[0] * h, TY + b[1] * h, z), 0.1, PAINT)
            if i < len(lv) - 1:
                z2 = lv[i + 1]; f2 = (z2 - 0.4) / (TH - 0.4); h2 = L0 + (L1 - L0) * f2
                beam(To, (TX + a[0] * h, TY + a[1] * h, z), (TX + b[0] * h2, TY + b[1] * h2, z2), 0.06, STEEL)
                beam(To, (TX + b[0] * h, TY + b[1] * h, z), (TX + a[0] * h2, TY + a[1] * h2, z2), 0.06, STEEL)
    # 爬梯 + 护笼（南面）
    for sx in (-0.25, 0.25):
        To.box(TX + sx - 0.03, TX + sx + 0.03, TY - L0 - 0.5, TY - L0 - 0.44, 0.0, TH + 1.0, STEEL)
    for k in range(int(TH / 0.3)):
        To.box(TX - 0.25, TX + 0.25, TY - L0 - 0.5, TY - L0 - 0.46, 0.3 + k * 0.3, 0.33 + k * 0.3, STEEL)
    for k in range(9):
        z = 2.4 + k * 1.0
        To.tube([(TX - 0.4, TY - L0 - 0.46, z), (TX - 0.4, TY - L0 - 1.1, z), (TX + 0.4, TY - L0 - 1.1, z), (TX + 0.4, TY - L0 - 0.46, z)], 0.02, STEEL, n=4)
    for x in (TX - 0.4, TX + 0.4, TX):
        yy = TY - L0 - 1.1 if x == TX else TY - L0 - 0.8
        To.box(x - 0.02, x + 0.02, yy - 0.02, yy + 0.02, 2.4, TH + 0.5, STEEL)
    # 平台 + 瞭望室（钢板墙 + 四周窄长窗 + 外挑遮阳檐）
    To.box(TX - 2.2, TX + 2.2, TY - 2.2, TY + 2.2, TH, TH + 0.2, PLATE)
    for (a, b) in (((-2.2, -2.2), (2.2, -2.2)), ((2.2, -2.2), (2.2, 2.2)), ((2.2, 2.2), (-2.2, 2.2)), ((-2.2, 2.2), (-2.2, -2.2))):
        To.tube([(TX + a[0], TY + a[1], TH + 1.05), (TX + b[0], TY + b[1], TH + 1.05)], 0.03, PAINT, n=6)
        To.tube([(TX + a[0], TY + a[1], TH + 0.2), (TX + a[0], TY + a[1], TH + 1.05)], 0.03, PAINT, n=6)
    cz0, cz1 = TH + 0.2, TH + 2.8
    c = 1.6
    To.box(TX - c, TX + c, TY - c, TY + c, cz0, cz0 + 1.0, CONT_G)
    for (x0, x1, y0, y1) in ((-c, -c + 0.25, -c, c), (c - 0.25, c, -c, c), (-c, c, -c, -c + 0.25), (-c, c, c - 0.25, c)):
        for (xa, xb, ya, yb) in (((x0, x0 + 0.12, y0, y0 + 0.12)), ((x1 - 0.12, x1, y1 - 0.12, y1))):
            To.box(TX + xa, TX + xb, TY + ya, TY + yb, cz0 + 1.0, cz1, PAINT)
    for (sx, sy, ax) in ((0, 1, 'x'), (0, -1, 'x'), (1, 0, 'y'), (-1, 0, 'y')):
        if ax == 'x':
            To.box(TX - c + 0.12, TX + c - 0.12, TY + sy * c - 0.03, TY + sy * c + 0.03, cz0 + 1.0, cz1 - 0.35, GLASS if sy > 0 else WIND)
            for u in (-0.55, 0.55):
                To.box(TX + u - 0.04, TX + u + 0.04, TY + sy * c - 0.05, TY + sy * c + 0.05, cz0 + 1.0, cz1, PAINT)
        else:
            To.box(TX + sx * c - 0.03, TX + sx * c + 0.03, TY - c + 0.12, TY + c - 0.12, cz0 + 1.0, cz1 - 0.35, GLASS)
        To.box(TX - c - 0.02, TX + c + 0.02, TY - c - 0.02, TY + c + 0.02, cz1 - 0.35, cz1, CONT_G) if (sx, sy) == (0, 1) else None
    To.box(TX - 2.0, TX + 2.0, TY - 2.0, TY + 2.0, cz1, cz1 + 0.12, ROOFS)
    To.box(TX - 2.0, TX + 2.0, TY + 1.95, TY + 2.05, cz1 - 0.35, cz1 + 0.12, PAINT)
    # 舱外沙袋压墙（外向两面，窗下）
    for (a, b) in (((TX - c - 0.25, TY + c + 0.25), (TX + c + 0.25, TY + c + 0.25)), ((TX + c + 0.25, TY - c), (TX + c + 0.25, TY + c))):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); rz = math.atan2(b[1] - a[1], b[0] - a[0])
        for r in range(3):
            for k in range(int(L / 0.62)):
                s = (k + 0.5 + 0.5 * (r % 2)) * 0.6
                if s < L:
                    ellip(To, T(a[0] + math.cos(rz) * s, a[1] + math.sin(rz) * s, cz0 + 0.12 + r * 0.19, rz), 0.33, 0.2, 0.12, BAG)
    # 探照灯（屋顶支架，朝城外 +y）
    sl = (TX + 0.3, TY + 1.2, cz1 + 0.9)
    To.box(sl[0] - 0.5, sl[0] + 0.5, sl[1] - 0.4, sl[1] + 0.4, cz1 + 0.12, cz1 + 0.25, STEEL)
    for sx in (-0.45, 0.45):
        To.box(sl[0] + sx - 0.04, sl[0] + sx + 0.04, sl[1] - 0.05, sl[1] + 0.05, cz1 + 0.25, sl[2] + 0.1, STEEL)
    Rsl = Matrix.Translation(sl) @ Matrix.Rotation(-math.pi / 2 + 0.12, 4, 'X')
    To.cyl(0, 0, -0.45, 0.38, 0.8, DARK, 18, mat=Rsl)
    To.cyl(0, 0, -0.55, 0.3, 0.1, STEEL, 14, mat=Rsl)
    To.cyl(0, 0, 0.35, 0.42, 0.08, STEEL, 18, mat=Rsl)
    To.cyl(0, 0, 0.36, 0.34, 0.03, COLDL, 18, mat=Rsl)
    for k in range(5):
        To.box(-0.4, 0.4, -0.01 + (k - 2) * 0.15, 0.01 + (k - 2) * 0.15, 0.44, 0.47, STEEL, Rsl)
    spots.append(((sl[0], sl[1] + 0.6, sl[2]), (4, 62, 0.5), 90000, (0.88, 0.94, 1.0), 9))
    To.cyl(TX - 1.2, TY - 1.2, cz1 + 0.12, 0.03, 3.5, STEEL, 6)                              # 鞭状天线
    To.boxc(TX - 1.2, TY - 1.2, cz1 + 3.6, 0.08, 0.08, 0.08, RED)
    points.append(((TX, TY, cz0 + 1.6), 60, (1.0, 0.7, 0.4)))

    # ============================================================ 大门（props_gate）
    Ga = Batch('props_gate')
    # 南门：门柱（Hesco 端头包钢板），道闸，岗亭（小集装箱），水泥墩迷宫
    for x in (GX0 - 0.6, GX1 + 0.9):
        Ga.boxc(x, KY0, 0, 1.1, 1.1, 2.6, CONC_D)
        Ga.boxc(x, KY0, 2.6, 1.2, 1.2, 0.12, STEEL)
    Ga.boxc(GX0 - 0.6, KY0 - 3.0, 0, 0.5, 0.45, 1.1, PAINT)                                   # 道闸机箱
    Ga.box(GX0 - 0.45, GX1 + 0.2, KY0 - 3.05, KY0 - 2.95, 0.95, 1.07, HAZ_RW)
    Ga.boxc(GX1 + 0.3, KY0 - 3.0, 0, 0.1, 0.1, 0.95, PAINT)
    Ga.boxc(GX0 - 0.6, KY0 - 3.0, 1.1, 0.12, 0.12, 0.12, RED)
    bx, by = GX1 + 2.4, KY0 - 4.6                                                             # 岗亭
    Ga.box(bx, bx + 2.4, by, by + 2.4, 0.1, 2.7, CONT_S)
    Ga.box(bx - 0.1, bx + 2.5, by - 0.1, by + 2.5, 2.7, 2.85, PAINT)
    Ga.box(bx - 0.02, bx - 0.01, by + 0.5, by + 1.9, 1.1, 2.0, WINL)
    Ga.box(bx + 0.4, bx + 2.0, by - 0.02, by - 0.01, 1.1, 2.0, GLASS)
    for k in range(3):
        Ga.box(bx - 0.06, bx - 0.02, by + 0.5 + k * 0.7, by + 0.55 + k * 0.7, 1.1, 2.0, STEEL)
    points.append(((bx + 1.2, by + 1.2, 2.2), 50, (1.0, 0.75, 0.45)))
    for k in range(9):                                                                         # 岗亭沙袋
        ellip(Ga, T(bx - 0.4, by + 0.1 + k * 0.28, 0.1 + (k % 3) * 0.19, math.pi / 2), 0.33, 0.2, 0.12, BAG)

    def jersey(x, y, L, rz, B=Ga):
        M = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rz, 4, 'Z')
        prof = [(-0.3, 0.0), (0.3, 0.0), (0.3, 0.08), (0.18, 0.3), (0.1, 0.81), (-0.1, 0.81), (-0.18, 0.3), (-0.3, 0.08)]
        n = len(prof)
        vs = [(e * L / 2, py, pz) for e in (-1, 1) for (py, pz) in prof]
        fs = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [((i + 1) % n, i, n + i, n + (i + 1) % n) for i in range(n)]
        B.poly(vs, fs, CONC_D if rnd.random() < 0.6 else CONC, mat=M)
        B.box(-L / 2 + 0.1, L / 2 - 0.1, -0.31, -0.3, 0.05, 0.3, MUD, M)
    for (x, y) in ((-2.2, -20.0), (2.2, -24.0), (-2.2, -28.0), (2.2, -32.0)):
        jersey(x, y, 3.0, 0.0)
    for (x, y) in ((-5.5, -18), (5.5, -18)):
        jersey(x, y, 3.0, 0.3 if x > 0 else -0.3)
    # 北门：双扇钢门（关），门框，门上沙袋
    for x in (GX0 - 0.6, GX1 + 0.6):
        Ga.boxc(x, KY1 + 0.5, 0, 0.5, 2.2, 3.6, CONC_D)
    Ga.box(GX0 - 0.85, GX1 + 0.85, KY1 - 0.6, KY1 + 1.6, 3.6, 4.0, PAINT)
    for s in (-1, 1):
        x0, x1 = (GX0 - 0.35, -0.02) if s < 0 else (0.02, GX1 + 0.35)
        Ga.box(x0, x1, KY1 + 0.45, KY1 + 0.55, 0.05, 3.5, PLATE)
        for zz in (0.1, 1.75, 3.35):
            Ga.box(x0, x1, KY1 + 0.35, KY1 + 0.45, zz, zz + 0.15, PAINT)
        beam(Ga, (x0 + 0.1, KY1 + 0.4, 0.2), (x1 - 0.1, KY1 + 0.4, 3.4), 0.08, PAINT)
        for zz in (0.6, 2.8):
            Ga.boxc(x0 + 0.05 if s < 0 else x1 - 0.05, KY1 + 0.3, zz, 0.15, 0.15, 0.3, STEEL)
    Ga.box(-0.5, 0.5, KY1 + 0.25, KY1 + 0.35, 1.6, 1.7, STEEL)                                   # 门闩
    Ga.box(GX0 - 0.35, GX1 + 0.35, KY1 + 0.55, KY1 + 0.6, 0.05, 0.6, MUD)
    # 北门外表面也有刮痕
    Mg = Matrix(((1, 0, 0, 0), (0, 0, 1, KY1 + 0.55), (0, 1, 0, 0), (0, 0, 0, 1)))
    gouges(Ga, Matrix.Translation((0, KY1 + 0.55, 0)) @ Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1))), -1.3, 1.6, 4, 1.5, -1.0)
    gouges(Ga, Matrix.Translation((0, KY1 + 0.45, 0)) @ Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))), 1.4, 2.2, 3, 1.2, 0.8, 1.0)

    # ============================================================ 车辆（props_vehicles）：四轮装甲通用车（无武器、无标识）
    Ve = Batch('props_vehicles')

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
        Ve.poly([(-1.16, 1.55, 2.0), (1.16, 1.55, 2.0), (1.16, 1.0, 2.72), (-1.16, 1.0, 2.72)], [(0, 1, 2, 3)], PAINT, mat=Matrix.Translation((0, 0.02, 0.02)) @ Matrix()) if False else None
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
            Ve.box(sx_ * 1.16, sx_ * 1.4, -1.1, -0.85, 1.0, 1.4, PAINT, M) if False else None
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

    # 车棚：钢架 + 波纹钢顶 + 背墙沙袋；车停在里面（一台），另一台停在北门内侧待出
    for x in (3.0, 10.0, 17.0):
        for y in (-10.0, 0.0):
            Ve.boxc(x, y, 0.1, 0.25, 0.25, 4.8, PAINT) if False else None
    auv(10.0, -5.5, math.pi, 0.8)
    auv(0.0, 9.5, 0.0, 0.3)
    for k in range(3):                                                                        # 车下油渍
        blob(G, 10.0 + rnd.uniform(-0.8, 0.8), -5.5 + rnd.uniform(-2, 2), 0.105, rnd.uniform(0.4, 0.9), OIL)

    # ============================================================ 车棚 + 公用设施（props_utility）：发电机、油囊、天线桅杆、车棚结构
    Ut = Batch('props_utility')
    for x in (3.0, 10.0, 17.0):
        for y in (-10.0, 0.0):
            Ut.boxc(x, y, 0.1, 0.25, 0.25, 4.8, PAINT)
            Ut.boxc(x, y, 0.1, 0.5, 0.5, 0.25, STEEL)
        beam(Ut, (x, -10.0, 4.9), (x, 0.0, 4.9), 0.3, PAINT)
    for y in (-10.0, 0.0):
        beam(Ut, (3.0, y, 4.75), (17.0, y, 4.75), 0.22, PAINT)
        beam(Ut, (3.0, y, 1.0), (10.0, y, 4.6), 0.08, STEEL) if y < -5 else None
    Ut.poly([(2.6, -10.5, 5.05), (17.4, -10.5, 5.05), (17.4, 0.5, 5.35), (2.6, 0.5, 5.35)], [(0, 1, 2, 3), (3, 2, 1, 0)], ROOFS)
    for x in (6.5, 13.5):
        Ut.box(x - 0.08, x + 0.08, -8.0, -2.0, 4.85, 4.9, COLDL)
        spots.append(((x, -5, 4.7), (x, -5.5, 0), 2200, (0.85, 0.92, 1.0), 110))
    # 车棚后墙（沿车棚北侧：钢板 + 工具架）
    Ut.box(3.0, 17.0, 0.2, 0.3, 0.1, 2.4, SHEET_R)
    for x in (4.5, 6.8):
        Ut.boxc(x, 0.8, 0.1, 1.6, 0.5, 1.9, PAINT)
        for zz in (0.6, 1.2, 1.8):
            Ut.box(x - 0.8, x + 0.8, 0.55, 1.05, zz, zz + 0.04, STEEL)
    for (x, y) in ((8.8, 1.0), (9.4, 1.1), (9.1, 1.6)):                                     # 油桶
        Ut.cyl(x, y, 0.1, 0.3, 0.9, rnd.choice([PAINT, CONT_G, RUST]), 12)
        Ut.cyl(x, y, 0.1 + 0.88, 0.3, 0.02, STEEL, 12)
    for k in range(4):                                                                         # 轮胎堆
        Ut.cyl(15.6, 1.4, 0.1 + k * 0.42, 0.6, 0.4, RUBBER, 16)
    # 发电机组（集装箱式：百叶、排气管 + 防雨帽、电缆）
    gx, gy = -16.5, 5.5
    Ut.box(gx, gx + 4.5, gy, gy + 2.0, 0.25, 2.5, CONT_G)
    Ut.box(gx - 0.1, gx + 4.6, gy - 0.1, gy + 2.1, 0.0, 0.25, CONC_D)
    for k in range(10):
        Ut.box(gx + 0.4, gx + 2.0, gy - 0.02, gy - 0.0, 0.8 + k * 0.13, 0.86 + k * 0.13, DARK)
        Ut.box(gx + 4.5, gx + 4.52, gy + 0.3, gy + 1.7, 0.6 + k * 0.15, 0.66 + k * 0.15, DARK)
    Ut.box(gx + 2.6, gx + 3.6, gy - 0.05, gy, 0.35, 2.2, PLATE)
    Ut.box(gx + 2.7, gx + 3.1, gy - 0.07, gy - 0.05, 1.6, 1.9, GREEN)
    Ut.cyl(gx + 1.0, gy + 1.0, 2.5, 0.14, 1.4, RUST, 10)
    Ut.cyl(gx + 1.0, gy + 1.0, 3.9, 0.22, 0.06, STEEL, 10)
    Ut.box(gx + 0.2, gx + 1.8, gy + 0.2, gy + 1.8, 2.5, 2.52, GRIME)
    Ut.tube([(gx + 4.5, gy + 1.0, 0.5), (gx + 6.0, gy + 0.5, 0.05), (-9.0, -1.0, 0.05), (-9.0, -2.4, 0.3)], 0.05, CABLE, n=6)
    # 油囊（软体油罐，泄漏防护土堤）+ 油泵
    fx, fy = -13.0, 12.5
    ellip(Ut, T(fx, fy, 0.05), 3.2, 1.9, 0.75, BLADDER, seg=20, rings=8)
    for (a, b) in (((fx - 4.4, fy - 2.8), (fx + 4.4, fy - 2.8)), ((fx + 4.4, fy - 2.8), (fx + 4.4, fy + 2.8)),
                   ((fx + 4.4, fy + 2.8), (fx - 4.4, fy + 2.8)), ((fx - 4.4, fy + 2.8), (fx - 4.4, fy - 2.8))):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); rz = math.atan2(b[1] - a[1], b[0] - a[0])
        M = T((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0, rz)
        Ut.poly([(-L / 2 - 0.4, -0.7, 0), (L / 2 + 0.4, -0.7, 0), (L / 2 + 0.2, -0.15, 0.7), (-L / 2 - 0.2, -0.15, 0.7),
                 (-L / 2 - 0.2, 0.15, 0.7), (L / 2 + 0.2, 0.15, 0.7), (L / 2 + 0.4, 0.7, 0), (-L / 2 - 0.4, 0.7, 0)],
                [(0, 1, 2, 3), (3, 2, 5, 4), (4, 5, 6, 7), (1, 6, 5, 2), (0, 3, 4, 7)], DIRT, mat=M)
    Ut.tube([(fx + 3.1, fy, 0.3), (fx + 5.0, fy - 1.5, 0.3), (fx + 5.5, fy - 3.5, 0.1)], 0.06, CABLE, n=6)
    Ut.boxc(fx + 5.6, fy - 4.0, 0, 0.9, 0.7, 0.8, PAINT)
    Ut.boxc(fx + 5.6, fy - 4.0, 0.8, 0.5, 0.4, 0.3, STEEL)
    for k in range(3):
        blob(G, fx + rnd.uniform(-3, 3), fy + rnd.uniform(-2.2, 2.2), 0.004, rnd.uniform(0.3, 0.8), OIL)
    # 天线桅杆（三角桁架 + 拉线 + 杆顶鞭天线与红色障碍灯）
    mx, my, mh = -7.0, 2.5, 20.0
    mr = 0.35
    for k in range(3):
        a = k * math.tau / 3
        beam(Ut, (mx + mr * math.cos(a), my + mr * math.sin(a), 0.3), (mx + mr * math.cos(a), my + mr * math.sin(a), mh), 0.05, STEEL)
    for z in [0.3 + i * 0.8 for i in range(int(mh / 0.8))]:
        for k in range(3):
            a0, a1 = k * math.tau / 3, (k + 1) * math.tau / 3
            beam(Ut, (mx + mr * math.cos(a0), my + mr * math.sin(a0), z), (mx + mr * math.cos(a1), my + mr * math.sin(a1), z + 0.8), 0.025, STEEL)
    Ut.boxc(mx, my, 0, 1.2, 1.2, 0.3, CONC_D)
    for k in range(3):
        a = k * math.tau / 3 + 0.5
        ax_, ay_ = mx + 9 * math.cos(a), my + 9 * math.sin(a)
        Ut.boxc(ax_, ay_, 0, 0.6, 0.6, 0.3, CONC_D)
        for z in (8.0, 15.0, mh - 0.5):
            Ut.tube([(mx, my, z), (ax_, ay_, 0.3)], 0.012, CABLE, n=4)
    for k in range(3):
        Ut.cyl(mx + 0.2 * (k - 1), my, mh, 0.025, 4.0 - k, STEEL, 6)
    Ut.boxc(mx, my, mh + 4.0, 0.14, 0.14, 0.14, RED)
    Ut.boxc(mx + 0.4, my, mh - 3.0, 0.3, 0.15, 1.6, WHITEP)                                     # 板状天线
    Ut.boxc(mx - 0.4, my, mh - 5.0, 0.3, 0.15, 1.6, WHITEP)
    points.append(((mx, my, mh + 4.2), 30, (1.0, 0.1, 0.05)))
    # 院内杂物：水罐、器材箱、伪装网（真几何的网格绳）
    for (x, y) in ((-2.0, -11.5), (-5.5, 14.5)):
        Ut.cyl(x, y, 0, 0.8, 1.6, CONT_S, 16)
        Ut.cyl(x, y, 1.6, 0.8, 0.2, CONT_S, 16, r2=0.3)
    for k in range(5):
        Ut.boxc(5.0 + k * 1.0, 12.5 + (k % 2) * 0.2, 0, 0.9, 0.6, 0.55, CONT_G if k % 2 else PAINT)
    for k in range(2):
        Ut.boxc(5.5 + k * 1.2, 12.6, 0.55, 0.9, 0.6, 0.55, CONT_G)
    # 伪装网（发电机上方）：波浪形网格绳 + 布片
    nx0, nx1, ny0, ny1, nz = -18.5, -10.0, 3.5, 9.5, 3.6
    for (x, y) in ((nx0, ny0), (nx1, ny0), (nx0, ny1), (nx1, ny1)):
        Ut.cyl(x, y, 0, 0.05, nz, STEEL, 6)
    for i in range(12):
        t = i / 11; x = nx0 + (nx1 - nx0) * t
        Ut.tube([(x, ny0 + (ny1 - ny0) * s / 6, nz - 0.35 * math.sin(math.pi * s / 6) * math.sin(math.pi * t) + 0.1) for s in range(7)], 0.012, CABLE, n=3)
    for j in range(9):
        t = j / 8; y = ny0 + (ny1 - ny0) * t
        Ut.tube([(nx0 + (nx1 - nx0) * s / 8, y, nz - 0.35 * math.sin(math.pi * s / 8) * math.sin(math.pi * t) + 0.1) for s in range(9)], 0.012, CABLE, n=3)
    for k in range(40):
        u, v = rnd.random(), rnd.random()
        x, y = nx0 + (nx1 - nx0) * u, ny0 + (ny1 - ny0) * v
        z = nz - 0.35 * math.sin(math.pi * u) * math.sin(math.pi * v) + 0.1
        rbox(Ut, x, y, z, rnd.uniform(0.4, 0.8), rnd.uniform(0.3, 0.6), 0.01, rnd.choice([BAG, BAG2, MUD]), rz=rnd.uniform(0, 3), rx=rnd.uniform(-0.3, 0.3))

    # ============================================================ 反兽障碍带（props_barricade）：钢拒马、刺混凝土块、焊钢板 + 爪痕
    Ba = Batch('props_barricade')

    def hedgehog(x, y, s=1.0, rz=0.0):
        """捷克拒马：三根角钢在中点交叉焊接（体对角线朝上），三个端点着地"""
        Rz = Matrix.Rotation(rz, 4, 'Z')
        Rt = Vector((1, 1, 1)).normalized().rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
        L = 1.9 * s
        ends = []
        for ax in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
            a = Rz @ Rt @ Vector(ax)
            ends.append(a)
        zmin = min(min(e.z, -e.z) for e in ends) * L
        c = Vector((x, y, -zmin - 0.05))
        for e in ends:
            p0, p1 = c - e * L, c + e * L
            beam(Ba, p0, p1, 0.2 * s, RUST if rnd.random() < 0.15 else PLATE)
            d = (p1 - p0).normalized()
            q = d.cross(Vector((0, 0, 1)))
            q = q.normalized() if q.length > 1e-3 else Vector((1, 0, 0))
            beam(Ba, p0 + q * 0.1 * s, p1 + q * 0.1 * s, 0.06 * s, PLATE)                           # 角钢翼缘
        Ba.boxc(c.x, c.y, c.z - 0.15, 0.36 * s, 0.36 * s, 0.3 * s, STEEL)                           # 焊接节点板
        return c, ends, L

    def spiked_block(x, y, rz=0.0):
        """带钢刺的混凝土块：1.2 m 方墩 + 倒角顶 + 外向 / 向上的钢刺（圆锥）"""
        M = T(x, y, 0, rz)
        Ba.box(-0.65, 0.65, -0.65, 0.65, 0, 0.9, CONC if rnd.random() < 0.6 else CONC_D, M)
        Ba.poly([(-0.65, -0.65, 0.9), (0.65, -0.65, 0.9), (0.65, 0.65, 0.9), (-0.65, 0.65, 0.9),
                 (-0.4, -0.4, 1.15), (0.4, -0.4, 1.15), (0.4, 0.4, 1.15), (-0.4, 0.4, 1.15)],
                [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)], CONC_D, mat=M)
        Ba.box(-0.66, 0.66, -0.66, -0.65, 0.05, rnd.uniform(0.3, 0.6), MUD, M)
        for (px, py, pz, dx, dy, dz) in ((0.0, 0.0, 1.15, 0, 0, 1), (-0.25, 0.65, 0.6, 0, 1, 0.35), (0.25, 0.65, 0.6, 0, 1, 0.35),
                                          (0.0, 0.65, 0.3, 0, 1, 0.1), (-0.25, 0.25, 1.1, -0.3, 0.5, 1), (0.25, 0.25, 1.1, 0.3, 0.5, 1)):
            d = Vector((dx, dy, dz)).normalized()
            Rm = M @ Matrix.Translation((px, py, pz)) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
            Ba.cyl(0, 0, -0.1, 0.06, 0.1, STEEL, 8, mat=Rm)
            Ba.cyl(0, 0, 0.0, 0.05, 0.55, RUST if rnd.random() < 0.4 else STEEL, 8, r2=0.0, mat=Rm)
        for k in range(3):                                                                            # 露出的钢筋头
            Ba.box(-0.5 + k * 0.45, -0.46 + k * 0.45, -0.67, -0.6, 0.85, 0.95, REBAR, M)

    def plate_panel(x, y, w, h, rz=0.0, z0=0.0, tilt=0.0, n_g=2):
        """厚钢板（带补焊条、螺栓）；两面都有爪痕组"""
        M = T(x, y, z0, rz) @ Matrix.Rotation(tilt, 4, 'X')
        Ba.box(-w / 2, w / 2, -0.03, 0.03, 0, h, PLATE, M)
        for zz in (0.08, h - 0.12):
            Ba.box(-w / 2, w / 2, -0.05, 0.05, zz, zz + 0.05, RUST, M)
        for k in range(int(w / 0.4)):
            for zz in (0.25, h - 0.25):
                Ba.box(-w / 2 + 0.2 + k * 0.4 - 0.025, -w / 2 + 0.2 + k * 0.4 + 0.025, -0.045, 0.045, zz - 0.025, zz + 0.025, STEEL, M)
        for i in range(rnd.randint(1, 3)):                                                            # 锈流
            u = rnd.uniform(-w / 2 + 0.2, w / 2 - 0.2)
            Ba.box(u, u + rnd.uniform(0.04, 0.12), -0.035, 0.035, rnd.uniform(0.1, h * 0.5), h - 0.15, RUST, M)
        Mf = M @ Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))     # u=x, v=z, n=+y
        Mb = M @ Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))    # n=-y
        for k in range(n_g):
            for (Mm, f) in ((Mf, 1.0), (Mb, 1.0)):
                gouges(Ba, Mm, rnd.uniform(-w / 2 + 0.7, w / 2 - 0.7), rnd.uniform(0.6, h - 0.5), rnd.randint(3, 4),
                       rnd.uniform(0.9, 1.5), rnd.uniform(-1.3, -0.5) * rnd.choice((1, -1)), 1.0, 0.03)

    # 三道：第一道（近城墙缺口）拒马密集，第二道刺块 + 钢板墙，第三道（靠哨所）拒马 + 刺块稀
    for i in range(22):
        x = -26 + i * 2.5 + rnd.uniform(-0.5, 0.5)
        hedgehog(x, 39.0 + rnd.uniform(-1.2, 1.2), rnd.uniform(0.9, 1.1), rnd.uniform(0, 3))
        if i % 2 == 0:
            hedgehog(x + 1.2, 42.0 + rnd.uniform(-1, 1), rnd.uniform(0.8, 1.0), rnd.uniform(0, 3))
    for i in range(16):
        x = -24 + i * 3.1
        if -3.5 < x < 3.5:
            continue
        spiked_block(x, 32.0 + rnd.uniform(-0.4, 0.4), rnd.uniform(-0.15, 0.15))
    for (x, rz) in ((-17, 0.05), (-10, -0.04), (9, 0.03), (16, -0.05)):                           # 焊在拒马上的钢板墙
        plate_panel(x, 34.0, 4.2, 2.6, rz, 0.0, -0.12, 2)
        for s in (-1.6, 1.6):
            beam(Ba, (x + s, 34.3, 0.0), (x + s, 35.6, 0.0), 0.15, RUST)
            beam(Ba, (x + s, 34.1, 2.4), (x + s, 35.6, 0.05), 0.12, PLATE)
    # 正中通道：两块可移动刺块 + 一段挂在钢丝绳上的钢板
    spiked_block(-1.2, 28.5, 0.2)
    spiked_block(1.6, 30.0, -0.25)
    plate_panel(0.2, 36.5, 3.4, 2.2, 0.0, 0.0, 0.0, 2)
    for i in range(10):
        x = -18 + i * 4.2 + rnd.uniform(-0.6, 0.6)
        if -3 < x < 3:
            continue
        hedgehog(x, 26.0 + rnd.uniform(-0.8, 0.8), 0.85, rnd.uniform(0, 3))
    # 连贯的刺网带（真几何：螺旋铁丝 = 细管）
    for (y, x0, x1) in ((30.0, -24.0, -3.5), (30.0, 3.5, 24.0), (24.0, -20.0, -3.0), (24.0, 3.0, 20.0)):
        L = x1 - x0; n = int(L / 0.35)
        Ba.tube([(x0 + L * k / n + 0.16 * math.sin(k * 1.9), y + 0.4 * math.cos(k * 1.3), 0.45 + 0.4 * math.sin(k * 1.3)) for k in range(n + 1)], 0.012, STEEL, n=3)
        for k in range(0, n, 12):
            Ba.cyl(x0 + L * k / n, y, 0, 0.03, 1.0, RUST, 5)
    # 散落：被掀翻的刺块、弯折的钢板、深爪沟（地面上）
    rbox(Ba, -6.5, 41.0, 0.5, 1.3, 1.3, 0.9, CONC_D, rz=0.6, rx=0.7)
    rbox(Ba, 12.0, 40.5, 0.3, 3.0, 0.06, 1.6, PLATE, rz=0.4, rx=1.3)
    Mfl = Matrix.Translation((12.0, 40.5, 0.3)) @ Matrix.Rotation(0.4, 4, 'Z') @ Matrix.Rotation(1.3, 4, 'X') @ Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    gouges(Ba, Mfl, 0.0, 0.0, 4, 1.6, -0.7, 1.0, 0.03)
    for (x, y, a) in ((-12, 44.5, 1.2), (5, 43.5, 1.4), (18, 45.0, 1.7), (-2, 40.0, 1.5)):          # 地面爪沟
        for k in range(4):
            o = (k - 1.5) * 0.28
            pts = [(x + math.cos(a) * t + math.sin(a) * o, y + math.sin(a) * t - math.cos(a) * o, 0.0) for t in (-1.6, -0.8, 0.0, 0.8, 1.6)]
            Ba.strip([(p[0], p[1], 0.02) for p in pts], 0.14, 0.03, GOUGE)
    # 碎块散布
    for i in range(70):
        x, y = rnd.uniform(-28, 28), rnd.uniform(24, 45)
        C.rock(Ba, x, y, 0.0, rnd.uniform(0.15, 0.5), rnd.choice([CONC_D, CONC, DIRT]), seed=300 + i, seg=6, rings=4, facet=0.5)

    # ============================================================ 城墙缺口（props_breach）：参差断口 + 外露钢筋 + 堆积碎块 + 补焊钢板
    Br = Batch('props_breach')
    rb = random.Random(9)
    for side in (-1, 1):
        x = side * BR
        while abs(x) > 6:
            w = rb.uniform(1.2, 2.6)
            t = (abs(x) - 6) / (BR - 6)
            h = WH * (t ** 1.6) * rb.uniform(0.75, 1.1) + rb.uniform(0, 2.5)
            xa, xb = sorted((x, x - side * w))
            Br.box(xa, xb, WY0 + rb.uniform(0, 1.2), WY1 - rb.uniform(0, 1.2), 0, h, CONC_D if rb.random() < 0.6 else CONC)
            if h > 1.5:                                                                               # 断口钢筋
                for k in range(rb.randint(3, 6)):
                    xx = rb.uniform(xa, xb); yy = rb.uniform(WY0 + 0.5, WY1 - 0.5)
                    Br.tube([(xx, yy, h - 0.2), (xx + rb.uniform(-0.6, 0.6), yy + rb.uniform(-0.5, 0.5), h + rb.uniform(0.6, 2.2))], 0.03, REBAR, n=4)
            x -= side * w
    # 缺口两侧高墙（全高）上的焊接钢板补丁 + 爪痕
    for side in (-1, 1):
        for k in range(5):
            x = side * (BR + 0.5 + k * 3.2); z = rb.uniform(1, 12)
            Br.box(x - 1.4, x + 1.4, WY0 - 0.08, WY0 - 0.02, z, z + 2.8, PLATE)
            gouges(Br, Matrix.Translation((x, WY0 - 0.08, z + 1.4)) @ Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))),
                   0.0, 0.0, 4, 1.4, rb.uniform(-1.2, -0.6), 1.0, 0.0)
    # 缺口底部碎块坡
    for i in range(160):
        x = rb.uniform(-BR + 2, BR - 2); y = rb.uniform(WY0 - 3, WY1 + 4)
        r = rb.uniform(0.3, 1.4) * (1.4 - abs(x) / BR)
        C.rock(Br, x, y, rb.uniform(0, 0.4), r, rb.choice([CONC_D, CONC, CONC_D]), seed=900 + i, seg=6, rings=4, facet=0.6, sz=0.6)
    for i in range(18):                                                                               # 折断的钢筋网
        x = rb.uniform(-20, 20); y = rb.uniform(WY0 - 2, WY1 + 2)
        Br.tube([(x, y, 0.2), (x + rb.uniform(-1.5, 1.5), y + rb.uniform(-1, 1), rb.uniform(0.6, 1.8)), (x + rb.uniform(-2, 2), y + rb.uniform(-1.5, 1.5), rb.uniform(0.1, 0.8))], 0.03, REBAR, n=4)

    # ============================================================ 灯（props_lights）：投光灯杆（朝外 / 朝院内）
    Li = Batch('props_lights')

    def flood(x, y, z, tx, ty, e=6000, ang=75, warm=False):
        Li.boxc(x, y, z - 0.1, 0.6, 0.6, 0.35, DARK)
        d = Vector((tx - x, ty - y, -z)).normalized()
        Li.boxc(x + d.x * 0.32, y + d.y * 0.32, z - 0.1, 0.45, 0.45, 0.04, SODL if warm else COLDL)
        for k in range(4):
            o = -0.24 + k * 0.16
            Li.boxc(x + d.x * 0.42 - d.y * o, y + d.y * 0.42 + d.x * o, z - 0.15, 0.04 + abs(d.y) * 0.02, 0.04 + abs(d.x) * 0.02, 0.45, STEEL)
        spots.append(((x + d.x * 0.5, y + d.y * 0.5, z - 0.2), (tx, ty, 0), e, (1.0, 0.7, 0.4) if warm else (0.85, 0.92, 1.0), ang))

    for (x, y, tgts) in ((KX0 + 1.0, KY1 - 1.0, [(-12, 34), (0, 6)]), (KX1 - 1.0, KY0 + 1.0, [(10, -5), (14, -24)]),
                         (-6.0, KY1 - 1.0, [(-2, 36)]), (6.0, KY1 - 1.0, [(8, 36)]), (KX0 + 1.0, KY0 + 1.0, [(-10, -6), (-4, -24)])):
        Li.cyl(x, y, 0, 0.18, 9.0, PAINT, 10, r2=0.1)
        Li.boxc(x, y, 0, 0.7, 0.7, 0.3, CONC_D)
        Li.box(x - 0.9, x + 0.9, y - 0.06, y + 0.06, 8.9, 9.02, STEEL)
        for (tx, ty) in tgts:
            d = Vector((tx - x, ty - y, 0)).normalized()
            flood(x + d.x * 0.6, y + d.y * 0.6, 9.0, tx, ty, 16000 if ty > 20 else 9000, 60 if ty > 20 else 80)
    for x in (CX0 + 3.0, CX0 + 9.0):                                                               # 指挥所墙灯
        flood(x, CY0 - 0.3, 5.0, x, CY0 - 8, 2500, 90, warm=True)
    flood(GX0 - 0.6, KY0 - 0.2, 3.2, 0, KY0 - 6, 3000, 90)
    # 南路路灯（两盏，钠灯）
    for y in (-36.0, -48.0):
        Li.cyl(5.0, y, 0, 0.1, 7.0, RUST, 8)
        Li.box(3.4, 5.0, y - 0.05, y + 0.05, 6.9, 7.0, RUST)
        Li.boxc(3.4, y, 6.75, 0.7, 0.3, 0.2, DARK)
        Li.boxc(3.4, y, 6.7, 0.6, 0.25, 0.05, SODL)
        points.append(((3.4, y, 6.4), 500, (1.0, 0.6, 0.28)))

    # ============================================================ 背景：城外墙（全高）、支撑柱、中层底面、荒野
    Bw = Batch('bg_wall')
    for side in (-1, 1):
        Bw.box(side * BR, side * 260, WY0, WY1, 0, WH, CONC_D)
        Bw.box(side * BR, side * 260, WY0 - 1.5, WY0, WH - 3, WH, CONC)                               # 顶部挑檐
        for k in range(14):
            x = side * (BR + 6 + k * 16)
            Bw.box(x - 1.5, x + 1.5, WY0 - 2.5, WY0, 0, WH - 3, CONC)                                 # 扶壁
    Bw.box(-BR, BR, WY0, WY1, WH + 4, WH + 7, CONC_D) if False else None
    Bg = Batch('bg_ground')
    Bg.box(-400, 400, -400, WY0, -0.6, -0.3, DIRT)
    # 荒野：起伏暗土 + 岩块 + 枯树剪影
    rows = []
    for j in range(40):
        y = WY1 - 2 + j * 8
        row = []
        for i in range(61):
            x = -240 + i * 8
            z = -0.5 + 0.6 * math.sin(x * 0.05 + j * 0.4) + 1.2 * math.sin(x * 0.013 + j * 0.2) * min(1, j / 6) + (j * 0.8 if j > 18 else 0)
            row.append((x, y, z))
        rows.append(row)
    C.grid(Bg, rows, WILD)
    rw = random.Random(5)
    for i in range(90):
        x, y = rw.uniform(-120, 120), rw.uniform(WY1 + 6, 220)
        C.rock(Bg, x, y, -0.3, rw.uniform(0.6, 3.5), DIRT, seed=i, seg=7, rings=5, facet=0.3)
    for i in range(26):
        x, y = rw.uniform(-100, 100), rw.uniform(WY1 + 12, 180)
        h = rw.uniform(4, 9)
        pts = [(x, y, -0.3), (x + rw.uniform(-0.4, 0.4), y, h * 0.5), (x + rw.uniform(-1, 1), y + rw.uniform(-1, 1), h)]
        Bg.tube(pts, 0.18, BARK, n=5)
        for k in range(3):
            p = pts[1 + k % 2]
            Bg.tube([p, (p[0] + rw.uniform(-2.5, 2.5), p[1] + rw.uniform(-1, 1), p[2] + rw.uniform(0.8, 2.5))], 0.07, BARK, n=4)
    Bk = Batch('bg_sky')
    SKYG = C.flat('op_skyglow', (0.05, 0.06, 0.08), 0.9, emit=(0.16, 0.2, 0.28), estr=0.22)
    Bk.poly([(-900, 420, -20), (900, 420, -20), (900, 420, 38), (-900, 420, 38)], [(3, 2, 1, 0), (0, 1, 2, 3)], SKYG)
    Bp = Batch('bg_pillars')
    for (x, y) in ((-70, -20), (65, -10), (-45, -80), (50, -75), (0, -120), (-110, 20), (110, 25)):
        Bp.boxc(x, y, 0, 12, 12, UZ, CONC_D)
        Bp.boxc(x, y, 0, 15, 15, 4, CONC_D)
        Bp.boxc(x, y, UZ - 10, 18, 18, 10, CONC_D)
        for z in (20, 50, 80):
            Bp.box(x - 6.05, x + 6.05, y - 6.05, y + 6.05, z, z + 0.3, PAINT)
        points.append(((x, y + 7, 25), 600, (0.7, 0.8, 1.0)))
    # 远处下层建筑群（背后）
    for i in range(160):
        x, y = rw.uniform(-160, 160), rw.uniform(-200, -30)
        if -30 < x < 30 and y > -50:
            continue
        sx_, sy_, h = rw.uniform(4, 9), rw.uniform(4, 9), rw.uniform(3, 14)
        Bp.boxc(x, y, 0, sx_, sy_, h, rw.choice([SHEET_R, CONC_D, CONT_G]))
        if rw.random() < 0.3:
            Bp.boxc(x, y - sy_ / 2 - 0.02, rw.uniform(1, h - 1), 0.8, 0.05, 0.6, WINL)
    Bu = Batch('bg_underside')
    Bu.box(-500, 500, -500, WY0 - 6, UZ, UZ + 4, CONC_D)                                              # 中层底面只到城墙内侧
    for k in range(-12, 2):
        Bu.box(-500, 500, k * 40 - 1.5, k * 40 + 1.5, UZ - 5, UZ, PAINT)
    for k in range(-12, 13):
        Bu.box(k * 40 - 1.5, k * 40 + 1.5, -500, WY0 - 6, UZ - 5, UZ, PAINT)
    Bu.box(-500, 500, WY0 - 8, WY0 - 6, UZ - 12, UZ + 4, CONC_D)                                     # 底面边梁
    for i in range(120):
        x, y = rw.uniform(-400, 400), rw.uniform(-400, WY0 - 10)
        Bu.boxc(x, y, UZ - 5.4, 1.2, 1.2, 0.3, rw.choice([SODL, COLDL, SODL, WARML]))
    for (x, y) in ((-60, -40), (70, -30), (0, -120)):
        points.append(((x, y, UZ - 8), 4000, (1.0, 0.7, 0.4)))

    Batch.build_all()

    # ------------------------------------------------------------ 世界 + 雾 + 灯光
    w = bpy.data.worlds.new('w'); sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs[0].default_value = (0.025, 0.03, 0.045, 1); bg.inputs[1].default_value = 0.6
    nt.links.new(bg.outputs[0], out.inputs[0])
    vs = nt.nodes.new('ShaderNodeVolumePrincipled')
    vs.inputs['Color'].default_value = (0.6, 0.62, 0.66, 1)
    vs.inputs['Density'].default_value = 0.0028
    nt.links.new(vs.outputs[0], out.inputs['Volume'])
    sc.cycles.volume_bounces = 0
    sc.cycles.volume_step_rate = 4.0
    # 冷色月光（从城外斜照进来）+ 院子上方补光 + 中层底面反光
    ld = bpy.data.lights.new('moon', 'SUN'); ld.energy = 0.35; ld.color = (0.6, 0.7, 0.95); ld.angle = math.radians(2)
    o = bpy.data.objects.new('moon', ld); sc.collection.objects.link(o)
    o.rotation_euler = Vector((0.3, -1.0, -0.6)).to_track_quat('-Z', 'Y').to_euler()
    for (loc, e, sz, c) in (((0, 2, 40), 7000, 50, (0.75, 0.82, 0.95)), ((0, 30, 30), 5000, 50, (0.7, 0.78, 0.95)),
                            ((0, -60, UZ - 12), 5000, 300, (0.6, 0.62, 0.75))):
        ld = bpy.data.lights.new('area_%d' % e, 'AREA'); ld.energy = e; ld.size = sz; ld.color = c
        o = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(o); o.location = loc
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.1)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.2 if e > 100000 else 0.4)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.9

    CAMS = {
        'c1': ((-40.0, -44.0, 34.0), (2.0, 12.0, 2.0), 25, 0.0, 1.5),
        'c2': ((4.0, -31.0, 3.0), (-5.0, -8.0, 2.6), 22, 0.05, 1.5),
        'c3': ((TX - 0.6, TY + 2.05, TH + 1.75), (4.0, 50.0, 3.0), 22, 0.0, 1.5),
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
