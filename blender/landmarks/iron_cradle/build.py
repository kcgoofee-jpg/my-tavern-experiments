"""圣铁摇篮（圣光教会唯一的战斗修女院，中层高档区甲板台地上的独立围墙院落）——只做外观。
罗马式 / 熙笃会式的朴素：厚墙、小圆拱窗、方形矮塔 + 素面钟架、单殿教堂 + 半圆后殿；钢板 / 钢箍加固。
无人物、无文字 / 徽记 / 宗教图像、无武器、无靶子。

导出组：
  walls_ext        教堂（单殿 + 后殿）+ 方塔
  props_cloister   回廊四面拱廊 + 中庭草地 + 井
  props_ranges     宿舍长楼（西）+ 食堂（南）
  props_hall       带高侧窗的大型室内训练馆（东北）
  props_yard       室外训练场：跑道、障碍架、平衡木
  props_hangar     悬浮坐骑 / 悬浮摩托机库（西南，素面无标识）
  props_wall_gate  高围墙 + 唯一门楼
  props_garden     药草园 + 果园
  site_ground      台地 / 甲板
bg_*：周边玻璃塔楼、甲板边、磁浮高架、上层底面（不导出）。

布局（米）：台地 z=0，院落 x -72..72、y -62..62；门楼在南墙正中 (0, -62)。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/iron_cradle/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/ic.jpg [--blend /tmp/ic.blend] [--log /tmp/ic.log] [--exposure 0.3]
cam: c1 俯瞰 / c2 回廊中庭 / c3 训练场与训练馆
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/ic.jpg', blend='', log='', exposure=''))

UZ = 420.0


def main():
    import bpy
    from mathutils import Matrix, Vector
    sc = C.setup(A['samples'])
    Batch = C.Batch
    rnd = random.Random(33)

    # ------------------------------------------------------------ 材质（与大教堂同一石材家族）
    STONE = C.pbr('ic_stone', 'white_sandstone_blocks_02', 2.2, tint=(0.95, 0.92, 0.85), value=0.92, sat=0.45, weather=0.45)
    STONE_D = C.pbr('ic_stone_dressed', 'white_sandstone_blocks_02', 1.4, tint=(0.97, 0.93, 0.85), value=1.08, sat=0.4, nstr=0.4)
    ASH = C.ashlar('ic_ashlar', (0.66, 0.64, 0.6), course=0.7, block=1.5, joint=0.012, jc=(0.36, 0.35, 0.33))
    ASH2 = C.ashlar('ic_ashlar_fine', (0.68, 0.66, 0.62), course=0.42, block=0.95, joint=0.014, jc=(0.34, 0.33, 0.31))
    SLATE = C.pbr('ic_slate', 'roof_slates_02', 3.0, tint=(0.62, 0.64, 0.68), sat=0.4)
    LEAD = C.pbr('ic_lead', 'Metal009', 2.5, tint=(0.36, 0.38, 0.4), sat=0.2, rough_mul=1.6, nstr=0.3, metal=0.35)
    STEEL = C.pbr('ic_steel', 'Metal009', 2.0, tint=(0.42, 0.44, 0.47), sat=0.3, metal=0.85)
    DARKM = C.flat('ic_darkmetal', (0.05, 0.055, 0.06), 0.4, metal=0.8)
    PAVE = C.pbr('ic_pave', 'precast_stone_paving', 3.0, tint=(0.9, 0.88, 0.84), sat=0.5)
    FLAG = C.pbr('ic_flags', 'patterned_paving', 3.0, tint=(0.9, 0.87, 0.83), sat=0.5)
    GRASS = C.flat('ic_grass', (0.07, 0.13, 0.05), 0.9, noise=0.6)
    CONC = C.pbr('ic_conc', 'concrete_wall_008', 4.0, tint=(0.72, 0.74, 0.77), sat=0.0, weather=0.5)
    PANEL = C.pbr('ic_panel', 'smooth_concrete_floor', 3.0, tint=(0.62, 0.64, 0.67), sat=0.2)
    TRACK = C.flat('ic_track', (0.36, 0.14, 0.1), 0.9, noise=0.3)
    SAND = C.flat('ic_sand', (0.3, 0.22, 0.15), 0.95, noise=0.5)
    LINE = C.flat('ic_line', (0.85, 0.85, 0.82), 0.6)
    WOOD = C.flat('ic_wood', (0.3, 0.2, 0.12), 0.7, noise=0.4)
    SOIL = C.flat('ic_soil', (0.08, 0.06, 0.045), 0.95, noise=0.4)
    HERB = [C.flat('ic_herb_a', (0.09, 0.16, 0.06), 0.8, noise=0.5), C.flat('ic_herb_b', (0.16, 0.18, 0.1), 0.8, noise=0.5),
            C.flat('ic_herb_c', (0.2, 0.14, 0.22), 0.8, noise=0.5)]
    HEDGE = C.flat('ic_hedge', (0.05, 0.11, 0.05), 0.8, noise=0.5)
    WATER = C.glass('ic_water', (0.04, 0.08, 0.09), rough=0.02)
    GLASS = C.glass('ic_glass_dark', (0.05, 0.06, 0.07))
    GLASS_L = C.glass('ic_glass_lit', (0.12, 0.1, 0.07), emit=(1.0, 0.8, 0.52), estr=3.0)
    GLASS_H = C.glass('ic_glass_hall', (0.1, 0.1, 0.09), emit=(1.0, 0.86, 0.66), estr=0.7)
    LAMP = C.flat('ic_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.8, 0.55), estr=16.0)
    LAMPW = C.flat('ic_lamp_w', (1, 1, 1), 0.4, emit=(0.95, 0.92, 0.85), estr=10.0)
    LAMPC = C.flat('ic_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=14.0)
    LEDB = C.flat('ic_led_b', (1, 1, 1), 0.4, emit=(0.2, 0.7, 1.0), estr=10.0)
    BIKE = C.flat('ic_bike', (0.55, 0.57, 0.6), 0.3, metal=0.5, coat=0.6)
    BIKE_D = C.flat('ic_bike_d', (0.12, 0.13, 0.15), 0.4, metal=0.6)
    HOVER = C.flat('ic_hover', (1, 1, 1), 0.4, emit=(0.5, 0.8, 1.0), estr=6.0)
    RUBBER = C.flat('ic_rubber', (0.05, 0.05, 0.05), 0.8)

    points = []

    # ------------------------------------------------------------ 小工具
    def face(side, c, u, v, n=0.0):
        if side == 'S': return (u, c - n, v)
        if side == 'N': return (u, c + n, v)
        if side == 'E': return (c + n, u, v)
        return (c - n, u, v)

    def fbox(B, side, c, u0, u1, v0, v1, n0, n1, m):
        a, b = face(side, c, u0, v0, n0), face(side, c, u1, v1, n1)
        B.box(a[0], b[0], a[1], b[1], a[2], b[2], m)

    def arch_poly(B, side, c, u, z, w, h, n_off, m, seg=7):
        """圆拱窗面：矩形 + 半圆顶，平贴墙面（n_off 向外）"""
        r = w / 2
        pts = [(u - r, z), (u + r, z)]
        for i in range(seg + 1):
            a = math.pi * i / seg
            pts.append((u + r * math.cos(a), z + h - r + r * math.sin(a)))
        vs = [face(side, c, pu, pv, n_off) for (pu, pv) in pts]
        order = list(range(len(vs)))
        if side in ('N', 'W'):
            order = order[::-1]
        B.poly(vs, [tuple(order)], m)

    def rwin(B, side, c, u, z, w, h, lit=True, frame=STONE_D, deep=0.35):
        """深窗洞的小圆拱窗：外凸石窗套（两侧 + 拱石环）+ 内凹玻璃"""
        arch_poly(B, side, c, u, z, w, h, 0.02, GLASS_L if lit else GLASS)
        fbox(B, side, c, u - w / 2 - 0.25, u - w / 2, z - 0.1, z + h - w / 2, 0, deep, frame)
        fbox(B, side, c, u + w / 2, u + w / 2 + 0.25, z - 0.1, z + h - w / 2, 0, deep, frame)
        fbox(B, side, c, u - w / 2 - 0.3, u + w / 2 + 0.3, z - 0.25, z - 0.05, 0, deep + 0.05, frame)
        r0, r1 = w / 2, w / 2 + 0.28
        seg = 8
        for i in range(seg):
            a0, a1 = math.pi * i / seg, math.pi * (i + 1) / seg
            zc = z + h - w / 2
            q = [(u + r0 * math.cos(a0), zc + r0 * math.sin(a0)), (u + r1 * math.cos(a0), zc + r1 * math.sin(a0)),
                 (u + r1 * math.cos(a1), zc + r1 * math.sin(a1)), (u + r0 * math.cos(a1), zc + r0 * math.sin(a1))]
            vs = [face(side, c, pu, pv, 0.0) for pu, pv in q] + [face(side, c, pu, pv, deep) for pu, pv in q]
            B.poly(vs, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], frame)

    def rowin(B, side, c, u0, u1, du, z, w, h, lit=0.6, **kw):
        n = max(1, int((u1 - u0) / du)); o = (u1 - u0 - n * du) / 2
        for i in range(n):
            rwin(B, side, c, u0 + o + du * (i + 0.5), z, w, h, rnd.random() < lit, **kw)

    def roof(B, x0, x1, y0, y1, z, h, m, along='x', over=0.6, t=0.3, end=0.4):
        """双坡屋面板（两块带厚度的斜板，外挑），山墙另用石头做"""
        if along == 'x':
            ym = (y0 + y1) / 2; k = h / (ym - y0)
            for (ya, yb) in ((y0 - over, ym), (y1 + over, ym)):
                za = z - over * k
                vs = [(x0 - end, ya, za), (x1 + end, ya, za), (x1 + end, yb, z + h), (x0 - end, yb, z + h)]
                vs += [(v[0], v[1], v[2] + t) for v in vs]
                fs = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
                B.poly(vs, fs, m)
            B.box(x0 - end, x1 + end, ym - 0.2, ym + 0.2, z + h, z + h + t + 0.15, LEAD)   # 屋脊
        else:
            xm = (x0 + x1) / 2; k = h / (xm - x0)
            for (xa, xb) in ((x0 - over, xm), (x1 + over, xm)):
                za = z - over * k
                vs = [(xa, y0 - end, za), (xa, y1 + end, za), (xb, y1 + end, z + h), (xb, y0 - end, z + h)]
                vs += [(v[0], v[1], v[2] + t) for v in vs]
                fs = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
                B.poly(vs, fs, m)
            B.box(xm - 0.2, xm + 0.2, y0 - end, y1 + end, z + h, z + h + t + 0.15, LEAD)

    def hall(B, x0, x1, y0, y1, h, rh, along, wall=STONE, roofm=SLATE):
        """厚墙长屋：墙体 + 勒脚 + 檐口钢箍 + 石山墙 + 屋面"""
        B.box(x0, x1, y0, y1, 0, h, wall)
        B.box(x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3, 0, 1.0, STONE_D)
        B.box(x0 - 0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2, h - 0.6, h - 0.3, STEEL)       # 檐下钢箍
        B.box(x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3, h - 0.3, h, STONE_D)
        B.gable(x0, x1, y0, y1, h, rh, wall, along=along)
        roof(B, x0, x1, y0, y1, h, rh, roofm, along=along)

    def buttress(B, side, c, u, h, d=1.4, w=1.2):
        """扶壁：石墩 + 钢加固板"""
        fbox(B, side, c, u - w / 2, u + w / 2, 0, h, 0, d, STONE_D)
        fbox(B, side, c, u - w / 2 - 0.05, u + w / 2 + 0.05, h * 0.25, h * 0.3, d, d + 0.08, STEEL)
        fbox(B, side, c, u - w / 2 - 0.05, u + w / 2 + 0.05, h * 0.65, h * 0.7, d, d + 0.08, STEEL)
        fbox(B, side, c, u - 0.15, u + 0.15, 0.4, h, d, d + 0.1, STEEL)                          # 竖向钢带
        a, b = face(side, c, u - w / 2, h, d), face(side, c, u + w / 2, h + 1.0, 0)
        B.box(min(a[0], b[0]), max(a[0], b[0]), min(a[1], b[1]), max(a[1], b[1]), h - 0.2, h + 0.2, STONE_D)

    def beam(B, p0, p1, w, m):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        M = Matrix.Translation((p0 + p1) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        B.box(-w / 2, w / 2, -w / 2, w / 2, -d.length / 2, d.length / 2, m, M)

    def door(B, side, c, u, w, h, m=DARKM):
        """圆拱门：钢门扇 + 两层退进的拱门套"""
        arch_poly(B, side, c, u, 0.0, w, h, 0.03, m)
        rwin(B, side, c, u, 0.0, w, h, False, deep=0.5)   # 复用窗套（玻璃被门扇覆盖）
        for zz in (h * 0.3, h * 0.6):
            fbox(B, side, c, u - w / 2, u + w / 2, zz, zz + 0.12, 0.03, 0.08, STEEL)

    # ============================================================ site_ground
    G = Batch('site_ground')
    G.box(-110, 110, -100, 100, -1.5, 0.0, CONC)                       # 台地
    G.box(-72, 72, -62, 62, 0.0, 0.05, FLAG)                           # 院内铺地
    G.box(-110, 110, -100, -80, 0.0, 0.08, PAVE)                       # 门前广场
    G.box(-4, 4, -80, -62, 0.0, 0.08, PAVE)
    for (x0, x1, y0, y1) in ((-110, 110, -101, -100), (-110, 110, 100, 101), (-111, -110, -100, 100), (110, 111, -100, 100)):
        G.box(x0, x1, y0, y1, -8.0, 1.2, CONC)                         # 台地护栏 / 边
    G.box(-110, 110, -100, 100, -9.0, -1.5, PANEL)
    for (x0, x1, y0, y1) in ((-110, 110, -100.2, -99.9), (-110, 110, 99.9, 100.2), (-110.2, -109.9, -100, 100), (109.9, 110.2, -100, 100)):
        G.box(x0, x1, y0, y1, 1.2, 1.35, LAMPW)                          # 台地亮边
        G.box(x0, x1, y0, y1, -1.6, -1.45, LEDB)
    for x in range(-100, 101, 10):
        G.cyl(x, -90.0, 0.08, 0.12, 5.0, STEEL, n=8)
        G.boxc(x, -90.0, 5.0, 0.6, 0.6, 0.25, LAMP)

    # ============================================================ walls_ext：教堂（中殿 + 侧廊 + 横厅 + 交叉部方塔 + 后殿）
    E = Batch('walls_ext')
    NX0, NX1, NY0, NY1, NH = -40.0, 6.0, 35.5, 44.5, 15.0            # 中殿（东西轴，约 46 m）
    hall(E, NX0, NX1, NY0, NY1, NH, 5.5, 'x', wall=STONE)
    for (ay0, ay1, side, c) in ((32.6, NY0, 'S', 32.6), (NY1, 47.4, 'N', 47.4)):   # 低侧廊 + 单坡顶
        E.box(NX0, NX1, ay0, ay1, 0, 7.5, STONE)
        E.box(NX0 - 0.2, NX1, ay0 - 0.2, ay1 + 0.2, 7.0, 7.3, STEEL)
        yl, yh = (ay0 - 0.6, ay1) if side == 'S' else (ay1 + 0.6, ay0)
        vs = [(NX0 - 0.3, yl, 7.2), (NX1, yl, 7.2), (NX1, yh, 10.2), (NX0 - 0.3, yh, 10.2)]
        vs += [(v[0], v[1], v[2] + 0.28) for v in vs]
        E.poly(vs, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], SLATE)
        if side == 'N':
            for u in range(-37, 6, 6):
                buttress(E, side, c, u, 6.8, d=1.0)
            rowin(E, side, c, NX0 + 2, NX1 - 2, 6.0, 2.6, 1.0, 2.6, lit=0.9)
        rowin(E, side, NY0 if side == 'S' else NY1, NX0 + 2, NX1 - 2, 6.0, 10.8, 1.1, 2.8, lit=0.95)   # 中殿高窗
    door(E, 'W', NX0, 40.0, 3.0, 5.2)
    rwin(E, 'W', NX0, 40.0, 8.5, 1.6, 3.6, True)
    for yy in (32.6, 47.4):
        E.box(NX0 - 1.2, NX0, yy - 0.7, yy + 0.7, 0, 13.0, STONE_D)          # 西立面扶壁
    # 横厅（南北向，x 6..16）+ 交叉部
    TX0, TX1, TY0, TY1 = 6.0, 16.0, 27.0, 53.0
    hall(E, TX0, TX1, TY0, TY1, NH, 5.5, 'y', wall=STONE)
    for side, c in (('S', TY0), ('N', TY1)):
        rwin(E, side, c, 11.0, 7.0, 1.5, 4.0, True)
        for u in (TX0 + 0.7, TX1 - 0.7):
            buttress(E, side, c, u, NH - 1.0, d=1.4, w=1.4)
    for side, c in (('E', TX1), ('W', TX0)):
        for u in ((TY0 + 32.6) / 2 - 1, (47.4 + TY1) / 2 + 1):
            rwin(E, side, c, u, 6.0, 1.0, 3.0, True)
    # 圣坛（短）+ 半圆后殿
    E.box(TX1, 24.0, 36.0, 44.0, 0, 13.0, STONE)
    E.box(TX1, 24.0, 35.8, 44.2, 12.4, 12.7, STEEL)
    E.gable(TX1, 24.0, 36.0, 44.0, 13.0, 4.5, STONE, along='x')
    roof(E, TX1, 24.0, 36.0, 44.0, 13.0, 4.5, SLATE, along='x', end=0.0)
    E.cyl(24.0, 40, 0, 4.0, 11.0, STONE, n=24, smooth=False)
    E.cyl(24.0, 40, 0, 4.3, 1.0, STONE_D, n=24, smooth=False)
    E.cyl(24.0, 40, 10.4, 4.25, 0.35, STEEL, n=24, smooth=False)
    E.lathe(24.0, 40, 11.0, [(4.4, 0), (4.4, 0.3), (0.05, 3.2)], LEAD, n=24, a0=-math.pi / 2, a1=math.pi / 2, smooth=False)
    for a in (-50, 0, 50):
        ar = math.radians(a)
        M = Matrix.Translation((24.0 + 4.0 * math.cos(ar), 40 + 4.0 * math.sin(ar), 0)) @ Matrix.Rotation(ar, 4, 'Z')
        r = 0.5; zc = 7.8
        pts = [(-r, 5.4), (r, 5.4)] + [(r * math.cos(math.pi * i / 7), zc + r * math.sin(math.pi * i / 7)) for i in range(8)]
        E.poly([tuple(M @ Vector((0.03, pu, pv))) for pu, pv in pts], [tuple(range(len(pts)))], GLASS_L)
        E.box(0, 0.35, -r - 0.25, -r, 5.3, zc, STONE_D, M); E.box(0, 0.35, r, r + 0.25, 5.3, zc, STONE_D, M)
        E.box(0, 0.4, -r - 0.3, r + 0.3, zc + r, zc + r + 0.35, STONE_D, M)
    # 交叉部方塔：矮壮、全院最高（顶 ~38 m）
    CX, CY, TW, TH = 11.0, 40.0, 11.0, 31.0
    E.box(CX - TW / 2, CX + TW / 2, CY - TW / 2, CY + TW / 2, NH, TH, STONE)
    for zz in (NH + 5.5, NH + 10.5, TH - 1.0):                                    # 钢箍带
        E.box(CX - TW / 2 - 0.3, CX + TW / 2 + 0.3, CY - TW / 2 - 0.3, CY + TW / 2 + 0.3, zz, zz + 0.55, STEEL)
    for sx in (-1, 1):
        for sy in (-1, 1):                                                         # 转角钢包角
            x, y = CX + sx * TW / 2, CY + sy * TW / 2
            E.box(x - 0.45, x + 0.45, y - 0.45, y + 0.45, NH, TH + 0.4, STEEL)
    for side, c, u in (('S', CY - TW / 2, CX), ('N', CY + TW / 2, CX), ('E', CX + TW / 2, CY), ('W', CX - TW / 2, CY)):
        for du in (-2.0, 0.0, 2.0):
            rwin(E, side, c, u + du, NH + 7.0, 1.0, 3.0, True)
        for du in (-1.6, 1.6):
            rwin(E, side, c, u + du, TH - 7.5, 1.4, 4.6, True)                  # 钟室双窗
    E.box(CX - TW / 2 - 0.6, CX + TW / 2 + 0.6, CY - TW / 2 - 0.6, CY + TW / 2 + 0.6, TH, TH + 0.7, STONE_D)
    E.pyramid(CX, CY, TH + 0.7, TW + 1.0, TW + 1.0, 5.0, LEAD)
    bx, by, bz = CX, CY, TH + 4.2                                                  # 素面钟架
    for sd in (-1, 1):
        E.box(bx + sd * 1.5 - 0.3, bx + sd * 1.5 + 0.3, by - 0.45, by + 0.45, bz - 1.0, bz + 3.2, STONE_D)
    E.box(bx - 2.0, bx + 2.0, by - 0.55, by + 0.55, bz + 3.2, bz + 3.7, STONE_D)
    E.gable(bx - 2.0, bx + 2.0, by - 0.55, by + 0.55, bz + 3.7, 1.0, LEAD, along='x')
    E.lathe(bx, by, bz + 1.0, [(0.7, 0), (0.6, 0.25), (0.45, 1.0), (0.25, 1.35), (0.05, 1.45)], LEAD, n=16)
    points.append(((CX, CY - TW / 2 - 3, TH - 5), 400, (1.0, 0.78, 0.5)))

    # ============================================================ props_cloister：回廊 + 中庭 + 井
    K = Batch('props_cloister')
    CX0, CX1, CY0, CY1 = -40.0, 6.0, 2.0, 32.0                         # 回廊外框（北接教堂南墙）
    GX0, GX1, GY0, GY1 = CX0 + 5, CX1 - 5, CY0 + 5, CY1 - 5            # 中庭
    K.box(GX0, GX1, GY0, GY1, 0.0, 0.12, GRASS)
    for (x0, x1, y0, y1) in ((GX0 - 0.4, GX1 + 0.4, GY0 - 0.4, GY0), (GX0 - 0.4, GX1 + 0.4, GY1, GY1 + 0.4),
                             (GX0 - 0.4, GX0, GY0, GY1), (GX1, GX1 + 0.4, GY0, GY1)):
        K.box(x0, x1, y0, y1, 0.0, 0.35, STONE_D)                    # 中庭石缘
    K.box(GX0, GX1, GY0, GY1, 0.0, 0.14, GRASS)
    cx, cy = (GX0 + GX1) / 2, (GY0 + GY1) / 2
    for (x0, x1, y0, y1) in ((cx - 0.8, cx + 0.8, GY0, GY1), (GX0, GX1, cy - 0.8, cy + 0.8)):
        K.box(x0, x1, y0, y1, 0.0, 0.16, PAVE)                          # 十字石径
    K.cyl(cx, cy, 0.0, 3.0, 0.2, PAVE, n=24, smooth=False)
    K.cyl(cx, cy, 0.2, 1.3, 0.9, STONE_D, n=20, smooth=False)            # 井栏
    K.cyl(cx, cy, 0.2, 1.05, 0.85, WATER, n=20)
    K.cyl(cx, cy, 1.1, 1.38, 0.15, STEEL, n=20, smooth=False)
    for s in (-1, 1):
        K.box(cx + s * 1.1 - 0.12, cx + s * 1.1 + 0.12, cy - 0.12, cy + 0.12, 1.1, 3.6, STEEL)
    K.box(cx - 1.3, cx + 1.3, cy - 0.12, cy + 0.12, 3.6, 3.8, STEEL)
    K.boxc(cx, cy, 3.0, 0.5, 0.4, 0.4, WOOD)
    for (x, y) in ((GX0 + 3, GY0 + 3), (GX1 - 3, GY0 + 3), (GX0 + 3, GY1 - 3), (GX1 - 3, GY1 - 3)):
        C.tree(K, x, y, 3.2, 1.0, 'yew', 11 + int(x), z=0.14)
    # 四面拱廊：外墙（高）+ 内侧低矮拱廊（成对小柱 + 圆拱）+ 单坡屋面
    AH = 5.0
    for side in ('S', 'E', 'W'):
        if side == 'S':
            K.box(CX0, CX1, CY0, CY0 + 0.8, 0, AH + 1.5, STONE)
        elif side == 'E':
            K.box(CX1 - 0.8, CX1, CY0, CY1, 0, AH + 1.5, STONE)
        else:
            K.box(CX0, CX0 + 0.8, CY0, CY1, 0, AH + 1.5, STONE)
    # 廊内地面
    for (x0, x1, y0, y1) in ((CX0, CX1, CY0, GY0), (CX0, CX1, GY1, CY1), (CX0, GX0, GY0, GY1), (GX1, CX1, GY0, GY1)):
        K.box(x0, x1, y0, y1, 0.0, 0.2, PAVE)

    def arcade(side, c, u0, u1, n):
        """面向中庭的拱廊：矮墙座 + 成对小柱 + 连续圆拱（带厚度的拱面板）"""
        du = (u1 - u0) / n
        fbox(K, side, c, u0, u1, 0.35, 0.95, -0.6, 0.0, STONE_D)       # 矮墙座
        for i in range(n + 1):
            u = u0 + du * i
            w = 0.9 if i in (0, n) else 0.35
            for off in ((-0.12, 0.12) if 0 < i < n else (0.0,)):
                if i in (0, n):
                    fbox(K, side, c, u - w / 2, u + w / 2, 0.35, AH - 0.2, -0.6, 0.0, STONE_D)
                else:
                    p = face(side, c, u + off, 0.95, -0.3)
                    K.cyl(p[0], p[1], 0.95, 0.12, 2.2, STONE_D, n=10)
                    K.boxc(p[0], p[1], 3.15, 0.34, 0.34, 0.25, STONE_D)
        # 拱面板：拱顶以上实墙，下方挖出半圆（逐拱做）
        r = du / 2 - 0.2
        spring = 3.4
        for i in range(n):
            uc = u0 + du * (i + 0.5)
            seg = 8
            ring = [(uc + r * math.cos(math.pi * k / seg), spring + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
            top = AH + 0.4
            # 扇形面片：拱边 → 上沿，两块（左右）+ 端
            pts = [(uc + du / 2, spring)] + ring + [(uc - du / 2, spring), (uc - du / 2, top), (uc + du / 2, top)]
            for (n0, n1) in ((-0.6, 0.0),):
                vs = [face(side, c, pu, pv, n1) for pu, pv in pts] + [face(side, c, pu, pv, n0) for pu, pv in pts]
                L = len(pts)
                fs = []
                for k in range(L):
                    j = (k + 1) % L
                    fs.append((k, j, L + j, L + k))
                # 正反面用三角扇（凹多边形：从上角扇出）
                for k in range(0, seg + 2):
                    fs.append((L - 1, k, k + 1)) if k < (seg + 2) // 2 + 1 else fs.append((L - 2, k, k + 1))
                fs.append((L - 1, (seg + 2) // 2 + 1, L - 2))
                for k in range(0, seg + 2):
                    fs.append((2 * L - 1, L + k + 1, L + k)) if k < (seg + 2) // 2 + 1 else fs.append((2 * L - 2, L + k + 1, L + k))
                fs.append((2 * L - 1, 2 * L - 2, L + (seg + 2) // 2 + 1))
                K.poly(vs, fs, STONE)
        fbox(K, side, c, u0, u1, AH + 0.4, AH + 0.7, -0.7, 0.15, STONE_D)
        fbox(K, side, c, u0, u1, AH + 0.1, AH + 0.25, 0.0, 0.08, STEEL)

    arcade('N', GY0, GX0, GX1, 7)
    arcade('S', GY1, GX0, GX1, 7)
    arcade('E', GX0, GY0, GY1, 4)
    arcade('W', GX1, GY0, GY1, 4)

    # 单坡廊顶（外墙高 → 中庭低）
    def lean(x0, x1, y0, y1, zhi, zlo, hi_side):
        if hi_side == 'S':
            vs = [(x0, y0, zhi), (x1, y0, zhi), (x1, y1, zlo), (x0, y1, zlo)]
        elif hi_side == 'N':
            vs = [(x0, y1, zhi), (x0, y0, zlo), (x1, y0, zlo), (x1, y1, zhi)]
        elif hi_side == 'W':
            vs = [(x0, y0, zhi), (x1, y0, zlo), (x1, y1, zlo), (x0, y1, zhi)]
        else:
            vs = [(x1, y0, zhi), (x1, y1, zhi), (x0, y1, zlo), (x0, y0, zlo)]
        vs2 = [(v[0], v[1], v[2] + 0.25) for v in vs]
        K.poly(vs + vs2, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], SLATE)
    lean(CX0, CX1, CY0 - 0.3, GY0 + 0.3, AH + 2.0, AH + 0.7, 'S')
    lean(CX0, CX1, GY1 - 0.3, CY1, AH + 2.0, AH + 0.7, 'N')
    lean(CX0 - 0.3, GX0 + 0.3, GY0 + 0.3, GY1 - 0.3, AH + 2.0, AH + 0.7, 'W')
    lean(GX1 - 0.3, CX1 + 0.3, GY0 + 0.3, GY1 - 0.3, AH + 2.0, AH + 0.7, 'E')
    for (x, y) in ((cx - 12, GY0 - 2.5), (cx + 12, GY0 - 2.5), (cx - 12, GY1 + 2.5), (cx + 12, GY1 + 2.5)):
        K.boxc(x, y, AH - 0.4, 0.4, 0.4, 0.25, LAMP)
        points.append(((x, y, AH - 0.8), 60, (1.0, 0.78, 0.5)))

    # ============================================================ props_ranges：宿舍长楼（西）+ 食堂（南）
    R = Batch('props_ranges')
    DX0, DX1, DY0, DY1, DH = -64.0, -48.0, -14.0, 36.0, 9.4
    hall(R, DX0, DX1, DY0, DY1, DH, 5.0, 'y')
    for side, c in (('E', DX1), ('W', DX0)):
        for z in (1.6, 5.4):
            rowin(R, side, c, DY0 + 2, DY1 - 2, 3.4, z, 0.8, 2.0, lit=0.55)
        for u in (DY0 + 8, DY0 + 25, DY0 + 42):
            fbox(R, side, c, u - 0.5, u + 0.5, 0, DH - 0.6, 0, 0.3, STEEL)         # 钢拉结条
    door(R, 'E', DX1, 20.0, 1.8, 3.4)
    door(R, 'E', DX1, -4.0, 1.8, 3.4)
    for yy in (-4, 12, 28):                                            # 屋顶烟囱
        R.box(DX0 + 3, DX0 + 4.4, yy, yy + 1.4, DH, DH + 6.2, STONE_D)
    # 食堂（回廊南侧）
    FX0, FX1, FY0, FY1, FH = -40.0, 6.0, -14.0, 1.2, 9.0
    hall(R, FX0, FX1, FY0, FY1, FH, 4.5, 'x')
    for side, c in (('S', FY0),):
        for u in range(-37, 6, 6):
            buttress(R, side, c, u, FH - 1.2, d=1.0)
        rowin(R, side, c, FX0 + 3, FX1 - 3, 6.0, 4.0, 1.2, 3.4, lit=0.9)
    door(R, 'S', FY0, -17.0 + 0.0, 2.4, 4.0)
    rwin(R, 'E', FX1, (FY0 + FY1) / 2, 5.0, 1.4, 3.6, True)
    R.box(-49.6, -40, -12, 0, 0, 4.0, STONE)                             # 连接宿舍与食堂的矮廊
    R.gable(-48, -40, -12, 0, 4.0, 1.5, SLATE, along='x')

    # ============================================================ props_hall：室内训练馆（东北）——石墩 + 高侧窗 + 外露钢桁架
    H = Batch('props_hall')
    HX0, HX1, HY0, HY1 = 32.0, 66.0, 8.0, 50.0
    HC = 16.0
    H.box(HX0, HX1, HY0, HY1, 0, HC, ASH)
    H.box(HX0 - 0.4, HX1 + 0.4, HY0 - 0.4, HY1 + 0.4, 0, 1.2, STONE_D)
    bays = 7
    for side, c, u0, u1 in (('W', HX0, HY0, HY1), ('E', HX1, HY0, HY1)):
        for i in range(bays + 1):
            u = u0 + (u1 - u0) * i / bays
            fbox(H, side, c, u - 0.9, u + 0.9, 0, HC + 0.6, 0, 1.2, STONE_D)                  # 石墩
            fbox(H, side, c, u - 0.95, u + 0.95, 5.0, 5.4, 1.2, 1.3, STEEL)                  # 墩上钢箍
            fbox(H, side, c, u - 0.95, u + 0.95, 11.0, 11.4, 1.2, 1.3, STEEL)
        for i in range(bays):
            u = u0 + (u1 - u0) * (i + 0.5) / bays
            for du in (-1.3, 1.3):
                rwin(H, side, c, u + du, 10.0, 1.6, 4.6, True)                               # 高侧窗
            rwin(H, side, c, u, 3.0, 1.0, 2.4, i % 2 == 0)
    for side, c in (('S', HY0), ('N', HY1)):
        for du in (-9, -4.5, 0, 4.5, 9):
            rwin(H, side, c, 49.0 + du, 9.5, 1.6, 5.0, True)
        for u in (HX0 + 0.8, HX1 - 0.8):
            buttress(H, side, c, u, HC - 1.0, d=1.4, w=1.6)
    H.box(HX0 - 0.3, HX1 + 0.3, HY0 - 0.3, HY1 + 0.3, HC - 0.6, HC, STONE_D)
    H.gable(HX0, HX1, HY0, HY1, HC, 5.5, STONE, along='y')
    roof(H, HX0, HX1, HY0, HY1, HC, 5.5, LEAD, along='y', over=0.6, end=0.4)
    # 外露钢桁架肋：每开间一榀，跨过屋面
    for i in range(bays + 1):
        y = HY0 + (HY1 - HY0) * i / bays
        top = []
        for k in range(9):
            t = k / 8; x = HX0 - 1.0 + (HX1 - HX0 + 2.0) * t
            top.append((x, y, HC + 1.2 + (1 - abs(2 * t - 1)) * 6.3))
        bot = [(x, y, HC + 0.3 + (1 - abs(2 * (x - HX0 + 1.0) / (HX1 - HX0 + 2.0) - 1)) * 5.4) for (x, _, _) in top]
        H.tube(top, 0.3, DARKM, n=6)
        for k in range(8):
            beam(H, bot[k], top[k + 1] if k % 2 == 0 else top[k], 0.2, DARKM)
    door(H, 'W', HX0, 29.0, 3.4, 5.4)
    door(H, 'S', HY0, 49.0, 4.0, 6.0)

    # ============================================================ props_yard：室外操练场（压实土 + 石板边）
    Y = Batch('props_yard')
    YX0, YX1, YY0, YY1 = 20.0, 66.0, -54.0, -4.0
    Y.box(YX0, YX1, YY0, YY1, 0.0, 0.08, FLAG)
    Y.box(YX0 + 2.0, YX1 - 2.0, YY0 + 2.0, YY1 - 2.0, 0.0, 0.1, SAND)
    for x in range(int(YX0) + 2, int(YX1) - 1, 6):
        Y.box(x - 0.05, x + 0.05, YY0 + 2.0, YY1 - 2.0, 0.1, 0.11, STONE_D)                # 石条分格

    def frame(x, y, w, h):
        for s_ in (-1, 1):
            Y.cyl(x + s_ * w / 2, y, 0.1, 0.1, h, STEEL, n=8)
        Y.tube([(x - w / 2, y, h), (x + w / 2, y, h)], 0.09, STEEL, n=8)
        for k in range(1, int(h / 0.6)):
            Y.tube([(x - w / 2, y, k * 0.6), (x + w / 2, y, k * 0.6)], 0.04, STEEL, n=6)
    for i, x in enumerate((26, 32, 38, 44, 50, 56)):                                     # 障碍线
        if i % 2 == 0:
            frame(x, -14.0, 3.0, 3.2)
        else:
            Y.box(x - 1.5, x + 1.5, -14.2, -13.8, 0.1, 1.4, WOOD)
            Y.box(x - 1.6, x + 1.6, -14.3, -13.7, 1.4, 1.5, STEEL)
    for x in (28, 36, 44, 52, 60):                                                       # 攀爬架（高）
        frame(x, -24.0, 2.4, 4.5)
    for k, y in enumerate((-32.0, -35.0, -38.0)):                                         # 平衡木
        x0, x1 = 24.0 + k * 4, 44.0 + k * 4
        Y.box(x0, x1, y - 0.08, y + 0.08, 1.0 + 0.25 * k, 1.16 + 0.25 * k, WOOD)
        for x in (x0 + 0.6, (x0 + x1) / 2, x1 - 0.6):
            Y.box(x - 0.1, x + 0.1, y - 0.25, y + 0.25, 0.1, 1.0 + 0.25 * k, STEEL)
    for x in range(24, 64, 3):                                                             # 跨步桩
        Y.cyl(x, -46.0 + (1.2 if (x // 3) % 2 else -1.2), 0.1, 0.25, 0.5 + 0.2 * ((x // 3) % 3), WOOD, n=8)
    for x in range(24, 64, 8):
        Y.box(x - 1.2, x + 1.2, YY0 + 0.4, YY0 + 0.8, 0.0, 0.45, WOOD)
    for (x, y) in ((YX0 - 1, YY1), (YX1 + 1, YY1), (YX0 - 1, YY0), (YX1 + 1, YY0)):
        Y.cyl(x, y, 0, 0.2, 12.0, STEEL, n=8)
        Y.box(x - 1.0, x + 1.0, y - 0.3, y + 0.3, 12.0, 12.4, DARKM)
        Y.box(x - 0.9, x + 0.9, y - 0.25, y + 0.25, 11.95, 12.0, LAMP)
        points.append(((x, y, 11.5), 900, (1.0, 0.85, 0.65)))

    # ============================================================ props_hangar：悬浮坐骑机库（西南）+ 门前起降坪
    Q = Batch('props_hangar')
    QX0, QX1, QY0, QY1, QH = -68.0, -38.0, -40.0, -18.0, 9.0
    Q.box(QX0, QX1, QY1 - 1.2, QY1, 0, QH, STONE)
    Q.box(QX0, QX0 + 1.2, QY0, QY1, 0, QH, STONE)
    Q.box(QX1 - 1.2, QX1, QY0, QY1, 0, QH, STONE)
    for x in (QX0 + 10, QX0 + 20):                                                    # 三个宽开间
        Q.box(x - 0.6, x + 0.6, QY0, QY1, 0, QH, STONE_D)
    for x in (QX0 + 0.6, QX0 + 10, QX0 + 20, QX1 - 0.6):
        Q.box(x - 0.7, x + 0.7, QY0 - 0.6, QY0 + 0.6, 0, QH + 0.4, STEEL)             # 前沿钢门框
    Q.box(QX0, QX1, QY0 - 0.4, QY0 + 1.2, QH - 2.2, QH + 0.4, STONE_D)                # 过梁
    Q.box(QX0, QX1, QY0 - 0.6, QY0 - 0.4, QH - 2.4, QH - 2.2, STEEL)
    for i in range(3):                                                                  # 升起的宽卷帘门（只露底沿）
        x0 = QX0 + 1.3 + i * 10
        Q.box(x0, x0 + 7.8, QY0 + 0.2, QY0 + 0.5, QH - 3.4, QH - 2.2, DARKM)
        Q.box(x0 + 0.2, x0 + 7.6, QY1 - 1.3, QY1 - 1.2, 1.0, QH - 3.0, LAMP)          # 后墙灯带（暖）
        points.append(((x0 + 3.9, QY1 - 6, QH - 2.6), 250, (1.0, 0.82, 0.6)))
    roof(Q, QX0, QX1, QY0, QY1, QH, 3.2, SLATE, along='x', over=0.8)
    Q.gable(QX0, QX1, QY0, QY1, QH, 3.2, STONE, along='x')
    Q.box(QX0, QX1, QY0, QY1, 0.0, 0.1, PANEL)
    # 起降坪：钢甲板 + 边灯 + 素面圆圈
    PX0, PX1, PY0, PY1 = -68.0, -38.0, -58.0, -41.0
    Q.box(PX0, PX1, PY0, PY1, 0.0, 0.25, PANEL)
    Q.box(PX0 - 0.3, PX1 + 0.3, PY0 - 0.3, PY1, 0.0, 0.2, STEEL)
    for x in range(int(PX0), int(PX1) + 1, 3):
        for y in (PY0, PY1):
            Q.boxc(x, y, 0.25, 0.4, 0.4, 0.08, HOVER)
    for y in range(int(PY0) + 3, int(PY1), 3):
        for x in (PX0, PX1):
            Q.boxc(x, y, 0.25, 0.4, 0.4, 0.08, HOVER)
    for cxp in (-60.0, -46.0):
        n = 32; ri, ro = 5.6, 6.0
        vs = [(cxp + ro * math.cos(math.tau * k / n), -49.5 + ro * math.sin(math.tau * k / n), 0.27) for k in range(n)]
        vs += [(cxp + ri * math.cos(math.tau * k / n), -49.5 + ri * math.sin(math.tau * k / n), 0.27) for k in range(n)]
        Q.poly(vs, [(k, (k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)], LINE)

    def hoverbike(x, y, rz, z=0.0):
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z')

        def sph(px, py, pz, r, sx, sy, sz, m):
            vs, fs = [], []
            seg, rings = 12, 6
            for j in range(rings + 1):
                t = math.pi * j / rings
                for i in range(seg):
                    a = math.tau * i / seg
                    vs.append(tuple(M @ Vector((px + r * sx * math.sin(t) * math.cos(a), py + r * sy * math.sin(t) * math.sin(a), pz + r * sz * math.cos(t)))))
            for j in range(rings):
                for i in range(seg):
                    a, b = j * seg + i, j * seg + (i + 1) % seg
                    fs.append((a, a + seg, b + seg, b))
            Q.poly(vs, fs, m, smooth=True)
        sph(0, 0, 1.0, 1.0, 1.4, 0.42, 0.35, BIKE)
        sph(1.0, 0, 1.3, 0.55, 1.2, 0.6, 0.45, BIKE_D)
        sph(-0.6, 0, 1.3, 0.55, 1.2, 0.55, 0.3, BIKE_D)
        for px in (-1.1, 1.1):
            Q.cyl(*(M @ Vector((px, 0, 0.4))), 0.5, 0.2, BIKE_D, n=14)
            Q.cyl(*(M @ Vector((px, 0, 0.38))), 0.4, 0.03, HOVER, n=14)
        Q.box(-1.0, 1.0, -0.09, 0.09, 0.4, 0.85, BIKE_D, M)
    for i in range(3):
        for j in range(2):
            hoverbike(QX0 + 3.5 + i * 10 + j * 3.2, QY1 - 8.5 + j * 2.5, math.pi / 2)
    hoverbike(-60.0, -49.5, 0.3, z=0.9)                                                  # 坪上悬停的两台
    hoverbike(-46.0, -49.5, -0.2, z=0.9)

    # ============================================================ props_wall_gate：围墙 + 门楼
    Wb = Batch('props_wall_gate')
    WX0, WX1, WY0, WY1, WH, WT = -72.0, 72.0, -62.0, 62.0, 11.5, 2.4
    GW = 7.0
    for (x0, x1, y0, y1) in ((WX0, -GW, WY0, WY0 + WT), (GW, WX1, WY0, WY0 + WT), (WX0, WX1, WY1 - WT, WY1),
                             (WX0, WX0 + WT, WY0, WY1), (WX1 - WT, WX1, WY0, WY1)):
        Wb.box(x0, x1, y0, y1, 0, WH, ASH2)
        Wb.box(x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3, 0, 1.2, STONE_D)
        Wb.box(x0 - 0.15, x1 + 0.15, y0 - 0.15, y1 + 0.15, WH - 0.9, WH - 0.6, STEEL)
        Wb.box(x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3, WH, WH + 0.25, STONE_D)       # 巡墙道面
    for (x, y) in ((WX0, WY0), (WX1, WY0), (WX0, WY1), (WX1, WY1)):       # 转角方墩
        Wb.box(x - 2.2, x + 2.2, y - 2.2, y + 2.2, 0, WH + 2.5, STONE)
        Wb.box(x - 2.5, x + 2.5, y - 2.5, y + 2.5, WH + 2.5, WH + 3.0, STONE_D)
    for x in range(-66, 67, 12):                                        # 外侧钢扶垛
        if abs(x) > 12:
            Wb.box(x - 0.6, x + 0.6, WY0 - 0.9, WY0, 0, WH - 0.5, STEEL)
    for y in range(-54, 60, 12):
        for x, s in ((WX0, -1), (WX1, 1)):
            Wb.box(x if s > 0 else x - 0.9, x + 0.9 if s > 0 else x, y - 0.6, y + 0.6, 0, WH - 0.5, STEEL)
    # 巡墙道：外侧胸墙（带垛口）+ 内侧钢栏杆
    for (x0, x1, y0, y1, ax) in ((WX0, -GW, WY0 - 0.3, WY0 + 0.4, 'x'), (GW, WX1, WY0 - 0.3, WY0 + 0.4, 'x'),
                                 (WX0, WX1, WY1 - 0.4, WY1 + 0.3, 'x'), (WX0 - 0.3, WX0 + 0.4, WY0, WY1, 'y'), (WX1 - 0.4, WX1 + 0.3, WY0, WY1, 'y')):
        Wb.box(x0, x1, y0, y1, WH + 0.25, WH + 1.0, ASH2)
        L = (x1 - x0) if ax == 'x' else (y1 - y0)
        n = int(L / 2.4)
        for k in range(n):
            a = (x0 if ax == 'x' else y0) + L * (k + 0.25) / n
            if ax == 'x':
                Wb.box(a, a + L / n * 0.5, y0, y1, WH + 1.0, WH + 1.9, ASH2)
            else:
                Wb.box(x0, x1, a, a + L / n * 0.5, WH + 1.0, WH + 1.9, ASH2)
    for (x0, x1, y0, y1) in ((WX0 + WT, WX1 - WT, WY0 + WT - 0.05, WY0 + WT + 0.05), (WX0 + WT, WX1 - WT, WY1 - WT - 0.05, WY1 - WT + 0.05),
                             (WX0 + WT - 0.05, WX0 + WT + 0.05, WY0 + WT, WY1 - WT), (WX1 - WT - 0.05, WX1 - WT + 0.05, WY0 + WT, WY1 - WT)):
        Wb.box(x0, x1, y0, y1, WH + 1.05, WH + 1.15, STEEL)
    # 门楼：两座方形门塔 + 上部连楼 + 圆拱门洞 + 钢门
    for s in (-1, 1):
        Wb.box(s * GW - (4.5 if s > 0 else -0.0) * 0 + (0 if s > 0 else -4.5), s * GW + (4.5 if s > 0 else 0), WY0 - 3.0, WY0 + 4.0, 0, 19.0, STONE)
        x0 = GW if s > 0 else -GW - 4.5
        Wb.box(x0 - 0.3, x0 + 4.8, WY0 - 3.3, WY0 + 4.3, 0, 1.4, STONE_D)
        Wb.box(x0 - 0.3, x0 + 4.8, WY0 - 3.3, WY0 + 4.3, 19.0, 19.6, STONE_D)
        Wb.pyramid(x0 + 2.25, WY0 + 0.5, 19.6, 5.4, 7.8, 3.2, LEAD)
        for zz in (4.0, 8.0, 12.0, 16.0):
            Wb.box(x0 - 0.15, x0 + 4.65, WY0 - 3.15, WY0 + 4.15, zz, zz + 0.45, STEEL)          # 钢箍带
        Wb.box(x0 - 0.15, x0 + 4.65, WY0 - 3.2, WY0 - 3.0, 0.0, 3.2, STEEL)                  # 门塔脚钢护板
        for xx in (x0, x0 + 4.5):
            Wb.box(xx - 0.35, xx + 0.35, WY0 - 3.35, WY0 - 2.65, 0.0, 19.0, STEEL)
        rwin(Wb, 'S', WY0 - 3.0, x0 + 2.25, 13.0, 0.8, 2.4, True)
    Wb.box(-GW, GW, WY0 - 2.5, WY0 + 3.5, 8.5, 16.0, STONE)            # 门上连楼
    Wb.box(-GW - 0.2, GW + 0.2, WY0 - 2.7, WY0 + 3.7, 16.0, 16.5, STONE_D)
    Wb.gable(-GW, GW, WY0 - 2.5, WY0 + 3.5, 16.5, 2.5, STONE, along='x')
    roof(Wb, -GW, GW, WY0 - 2.5, WY0 + 3.5, 16.5, 2.5, SLATE, along='x', over=0.5, end=0.3)
    Wb.box(-GW, GW, WY0 - 2.75, WY0 - 2.5, 8.5, 9.0, STEEL)
    # 吊闸（钢格栅，半落）
    for k in range(int((2 * GW - 1.2) / 0.9) + 1):
        u = -GW + 0.6 + k * 0.9
        Wb.box(u - 0.08, u + 0.08, WY0 - 2.1, WY0 - 1.9, 3.2, 8.5, DARKM)
        Wb.box(u - 0.04, u + 0.04, WY0 - 2.05, WY0 - 1.95, 2.8, 3.2, DARKM)
    for z in (3.4, 4.6, 5.8, 7.0, 8.2):
        Wb.box(-GW + 0.4, GW - 0.4, WY0 - 2.15, WY0 - 1.85, z, z + 0.14, DARKM)
    for s_ in (-1, 1):
        Wb.box(s_ * GW - 0.25, s_ * GW + 0.25, WY0 - 2.4, WY0 - 1.6, 0, 8.5, STEEL)          # 吊闸槽
    for u in (-3.5, 0.0, 3.5):
        rwin(Wb, 'S', WY0 - 2.5, u, 11.5, 0.9, 2.8, True)
    # 门洞拱（门洞宽 2GW 的拱面）+ 厚钢门扇（半开缝）
    r = GW; seg = 12
    pts = [(GW, 5.0)] + [(r * math.cos(math.pi * k / seg), 5.0 + 3.4 * math.sin(math.pi * k / seg)) for k in range(seg + 1)] + [(-GW, 5.0), (-GW, 8.5), (GW, 8.5)]
    for yy in (WY0 - 2.5, WY0 + 3.5):
        L = len(pts)
        vs = [(pu, yy, pv) for pu, pv in pts]
        fs = [(L - 1, k, k + 1) for k in range(0, L - 3)]
        Wb.poly(vs, fs, STONE_D)
    Wb.box(-GW + 0.2, -0.15, WY0 + 1.0, WY0 + 1.35, 0, 7.6, DARKM)
    Wb.box(0.15, GW - 0.2, WY0 + 1.0, WY0 + 1.35, 0, 7.6, DARKM)
    Wb.box(-0.15, 0.15, WY0 + 1.2, WY0 + 1.3, 0, 7.6, GLASS_H)          # 门缝漏光
    for zz in (1.5, 3.5, 5.5):
        Wb.box(-GW + 0.2, GW - 0.2, WY0 + 0.9, WY0 + 1.0, zz, zz + 0.22, STEEL)
    for s in (-1, 1):
        Wb.boxc(s * (GW + 2.25), WY0 - 3.5, 6.0, 0.5, 0.4, 0.8, LAMP)
        points.append(((s * (GW + 2.25), WY0 - 4.2, 6.0), 250, (1.0, 0.78, 0.5)))

    # ============================================================ props_garden：药草园 + 果园（南，门内两侧）
    Gd = Batch('props_garden')
    Gd.box(-3, 3, WY0 + WT, FY0, 0.0, 0.1, PAVE)                        # 门 → 食堂中轴路
    k = 0
    for bx0 in (-34.0, -27.5, -21.0, -14.5):
        for by0 in (-56.0, -48.0, -40.0, -32.0, -24.0):
            Gd.box(bx0, bx0 + 5.5, by0, by0 + 6.0, 0.0, 0.45, STONE_D)    # 石边药草畦
            Gd.box(bx0 + 0.25, bx0 + 5.25, by0 + 0.25, by0 + 5.75, 0.45, 0.5, SOIL)
            m = HERB[k % 3]; k += 1
            for rr in range(3):
                for cc in range(4):
                    x = bx0 + 1.0 + cc * 1.15; y = by0 + 1.2 + rr * 1.8
                    Gd.lathe(x, y, 0.5, [(0.35, 0), (0.45, 0.25), (0.25, 0.5), (0.02, 0.6)], m, n=7, smooth=True)
    for y in (-58.5, -18.0):
        Gd.box(-35.0, -8.0, y - 0.5, y + 0.5, 0.0, 1.0, HEDGE)
    # 果园（门内东侧，跑道以西）
    seed = 50
    for x in (5.0, 10.5, 16.0):
        for y in (-55.0, -49.0, -43.0, -37.0, -31.0, -25.0, -19.0):
            Gd.box(x - 1.2, x + 1.2, y - 1.2, y + 1.2, 0.0, 0.12, GRASS)
            C.tree(Gd, x, y, 4.6, 2.0, 'oak', seed, z=0.12); seed += 1
    Gd.box(3.0, 18.0, -58.0, -16.0, 0.0, 0.05, GRASS)

    # ============================================================ bg：周边玻璃塔楼、甲板、高架、上层底面
    GLASSD = C.flat('bg_tower', (0.07, 0.08, 0.1), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.3, 0.3, 0.32), 0.8, noise=0.3)
    WG = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.2, cell=(3.0, 3.6), seed=i * 7.3) for i, c in
          enumerate(((1.0, 0.8, 0.55), (0.75, 0.88, 1.0), (1.0, 0.9, 0.7)))]
    WIN = C.flat('bg_winband', (0.05, 0.05, 0.06), 0.4, emit=(1.0, 0.85, 0.6), estr=0.8)
    DSIDE = C.flat('bg_deckside', (0.18, 0.18, 0.19), 0.8, noise=0.3)
    NEON = [C.flat('bg_neon%d' % i, (1, 1, 1), 0.4, emit=c, estr=9.0) for i, c in enumerate(((0.2, 0.8, 1.0), (1.0, 0.3, 0.7), (1.0, 0.75, 0.35)))]
    UNDER = C.flat('bg_under', (0.14, 0.13, 0.13), 0.9, noise=0.4)
    far = Batch('bg_deck')
    far.box(-2500, 2500, -2500, 2500, -301, -300, BCONC)
    for (x0, x1, y0, y1, z) in ((-700, -112, -700, 700, -6), (112, 700, -700, 700, -4), (-112, 112, 102, 700, -8), (-112, 112, -700, -102, -12)):
        far.box(x0, x1, y0, y1, z - 4, z, BCONC)
        far.box(x0, x1, y0, y1, z - 40, z - 4, DSIDE)
    tw = Batch('bg_towers')
    rb = random.Random(9)
    placed = []
    for k in range(70):
        for _ in range(60):
            a = rb.uniform(0, math.tau); d = rb.uniform(180, 650)
            x, y = math.cos(a) * d, math.sin(a) * d
            w, dd = rb.uniform(28, 60), rb.uniform(28, 60)
            clear = all(abs(x - px) > (w + pw) / 2 + 10 or abs(y - py) > (dd + pd) / 2 + 10 for px, py, pw, pd in placed)
            if clear and math.hypot(x + 170, y + 250) > 120 and not (-150 < math.degrees(math.atan2(y, x)) < -95) and not (180 < (math.degrees(a) % 360) < 250):   # 给 c1 机位的视线留出空
                break
        else:
            continue
        placed.append((x, y, w, dd))
        h = rb.uniform(120, 420)
        m = WG[k % 3] if k % 4 else GLASSD
        z = -40.0; ww, ddd = w, dd
        for seg in range(rb.randint(1, 3)):
            zt = z + h / (seg + 1.6)
            tw.box(x - ww / 2, x + ww / 2, y - ddd / 2, y + ddd / 2, z, zt, m)
            tw.box(x - ww / 2 - 1, x + ww / 2 + 1, y - ddd / 2 - 1, y + ddd / 2 + 1, zt - 1.5, zt, WIN)
            if k % 2 == 0:                                             # 霓虹竖向边线
                for (ex, ey) in ((x - ww / 2, y - ddd / 2), (x + ww / 2, y - ddd / 2), (x - ww / 2, y + ddd / 2), (x + ww / 2, y + ddd / 2)):
                    tw.box(ex - 0.5, ex + 0.5, ey - 0.5, ey + 0.5, z, zt, NEON[k % 3])
            z = zt; ww *= 0.75; ddd *= 0.75
    ub = Batch('bg_upper')
    for (x, y, r) in ((160, 420, 200), (-440, 220, 170), (420, -60, 150)):
        ub.cyl(x, y, UZ, r, 90, UNDER, n=32, r2=r * 0.4)
        for i in range(10):
            a = i * math.tau / 10
            ub.boxc(x + r * 0.8 * math.cos(a), y + r * 0.8 * math.sin(a), UZ - 1, 3, 3, 1, LAMPC)
    via = Batch('bg_viaduct')
    VZ = 42.0
    for t in range(-700, 701, 8):
        x0, y0 = t, 140 + t * 0.12
        via.box(x0 - 4.1, x0 + 4.1, y0 - 3.5, y0 + 3.5, VZ, VZ + 1.8, BCONC)
        via.box(x0 - 4.1, x0 + 4.1, y0 - 0.6, y0 + 0.6, VZ + 1.8, VZ + 2.4, STEEL)
        via.box(x0 - 4.1, x0 + 4.1, y0 - 3.5, y0 - 3.3, VZ + 1.8, VZ + 2.8, LEDB)
        if t % 48 == 0:
            via.box(x0 - 1.5, x0 + 1.5, y0 - 2, y0 + 2, -30, VZ, BCONC)
    TRAIN = C.flat('bg_train', (0.85, 0.86, 0.88), 0.3, metal=0.4)
    GTR = C.glass('bg_train_glass', (0.08, 0.1, 0.12), emit=(0.75, 0.88, 1.0), estr=1.8)
    for t in range(-120, 0, 25):
        yy = 140 + t * 0.12
        via.box(t, t + 23.5, yy - 1.8, yy + 1.8, VZ + 2.6, VZ + 6.4, TRAIN)
        via.box(t + 1, t + 22.5, yy - 1.85, yy + 1.85, VZ + 4.3, VZ + 5.3, GTR)
    # 头顶上层甲板（北 / 东；西南留出甲板缺口让低角度日光进来）
    ov = Batch('bg_overhead')
    OZ = 170.0
    for (x0, x1, y0, y1) in ((-900, 900, 120, 900), (140, 900, -900, 120)):
        ov.box(x0, x1, y0, y1, OZ, OZ + 8, UNDER)
    for kk in range(-20, 21):
        g = kk * 45.0
        ov.box(g - 1.5, g + 1.5, 120, 900, OZ - 7, OZ, BCONC)
        if g > 120:
            ov.box(-900, 900, g - 1.5, g + 1.5, OZ - 7, OZ, BCONC)
            ov.box(140, 900, g - 1.5, g + 1.5, OZ - 7, OZ, BCONC)
    for i in range(160):
        x, y = rb.uniform(-700, 700), rb.uniform(-700, 700)
        if y > 120 or x > 140:
            ov.boxc(x, y, OZ - 7.6, 4, 4, 0.6, rb.choice([LAMP, LAMPC, LAMPC]))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 光：傍晚低角度日光（西南甲板缺口）+ 暖色窗光
    C.sky_sun(sc, 'day', sun_az=215.0, sun_el=16.0, sun_e=3.2, sky_s=0.18)
    so = bpy.data.objects['sun']; so.data.color = (1.0, 0.72, 0.45)
    for (x, y) in ((-200, 250), (250, 0)):
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 1.5e5; ld.size = 250; ld.color = (0.75, 0.82, 1.0)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, 155)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else -0.7

    CAMS = {
        'c1': ((-115.0, -160.0, 140.0), (0.0, -4.0, 4.0), 30, 0.0),
        'c2': ((-31.0, 8.5, 1.7), (-2.0, 28.0, 12.0), 18, 0.0),
        'c3': ((25.0, -58.5, 10.0), (46.0, 8.0, 8.0), 22, 0.0),
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
