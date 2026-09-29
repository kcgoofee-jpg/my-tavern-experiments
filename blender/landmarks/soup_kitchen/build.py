"""圣光教会施粥站（下层 / 地基层）：旧教区礼堂（半修复的石砌小堂，旧时代砌体，但有人维护、暖光）+ 前方开敞钢架帆布大棚。
棚下：长条打饭台、大汤锅与长柄勺、碗摞、面包筐、搁板长桌 + 长凳、排队栏杆（蛇形排队道）、水箱与洗手台。
右侧：义诊小楼（干净的白色预制板房，门口一盏素面浅绿信号灯；无十字、无任何符号或文字）。
左侧：两层收容所小楼（小窗、晾衣绳）+ 小围栏游戏场（素面秋千、沙坑）。
灯：棚下素白灯罩，暖中带冷金的柔光（「圣光」只是灯色，中立）。无人物、无文字 / 标志 / 宗教图像。
背景 bg_*：周围铁皮屋、巨柱、头顶中层底面与管道（只为渲染，不导出）。
坐标：礼堂沿 x，正门朝 -y 开向大棚；排队道在大棚 -y 外侧。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/soup_kitchen/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/sk.jpg [--blend /tmp/sk.blend] [--log /tmp/sk.log]
cam: c1 斜俯总览 / c2 棚下打饭台（人眼高）/ c3 收容所 + 游戏场 + 义诊楼
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='1000', samples='32', out='/tmp/sk.jpg', blend='', log='', exposure=''))

HX0, HX1, HY0, HY1 = -9.0, 9.0, 6.0, 15.0     # 礼堂外廓
WT = 0.7
WH = 7.0
KX0, KX1, KY0, KY1 = -12.0, 12.0, -7.0, 5.5   # 大棚
CEIL = 70.0


def main():
    import bpy
    from mathutils import Vector, Matrix
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(7)

    STONE = C.pbr('stone', 'white_sandstone_blocks_02', 1.4, tint=(0.55, 0.52, 0.47), value=0.8, sat=0.4, weather=0.8)
    STONE2 = C.pbr('stone_dark', 'white_sandstone_blocks_02', 1.4, tint=(0.4, 0.38, 0.35), value=0.7, sat=0.3, weather=1.0)
    TRIM = C.pbr('stone_trim', 'marble_01', 2.0, tint=(0.62, 0.6, 0.55), value=0.8, sat=0.3, weather=0.5)
    SLATE = C.pbr('slate', 'roof_slates_02', 2.0, tint=(0.5, 0.5, 0.53), value=0.8, weather=0.6)
    PAVE = C.pbr('flags', 'precast_stone_paving', 3.0, tint=(0.55, 0.53, 0.5), value=0.8, sat=0.4, weather=0.5)
    CONCF = C.pbr('concrete_floor', 'concrete_floor_worn_001', 4.0, tint=(0.5, 0.49, 0.47), sat=0.2, weather=1.0)
    DIRT = C.pbr('dirt', 'dirt_floor', 3.0, tint=(0.42, 0.4, 0.37), value=0.6, sat=0.4)
    PILLARM = C.pbr('pillar', 'concrete_wall_008', 8.0, tint=(0.5, 0.5, 0.5), sat=0.2, weather=1.0)
    WOOD = C.pbr('wood', 'rough_wood', 1.0, tint=(0.55, 0.42, 0.3), value=0.6, sat=0.5, weather=0.6)
    DWOOD = C.pbr('dark_wood', 'dark_wood', 1.0, tint=(0.5, 0.42, 0.35), value=0.6)
    STUCCO = C.pbr('stucco', 'white_stucco', 3.0, tint=(0.7, 0.66, 0.6), value=0.85, weather=1.0)
    PANEL = C.pbr('prefab_white', 'box_profile_metal_sheet', 1.5, tint=(0.82, 0.83, 0.82), value=0.95, sat=0.2, weather=0.5)
    CANVAS = C.pbr('canvas', 'rough_linen', 1.5, tint=(0.78, 0.72, 0.6), value=0.9, sat=0.5, weather=0.5)
    SAND = C.flat('sand', (0.55, 0.47, 0.34), 0.95, noise=0.4)
    STEEL = C.flat('steel', (0.25, 0.25, 0.26), 0.5, metal=0.8, noise=0.4)
    PAINT = C.flat('painted_steel', (0.18, 0.24, 0.22), 0.55, metal=0.3, noise=0.35)
    INOX = C.flat('stainless', (0.72, 0.72, 0.72), 0.25, metal=1.0, noise=0.2)
    RUST = C.flat('pipe_rust', (0.26, 0.14, 0.08), 0.7, metal=0.4, noise=0.5)
    ENAMEL = C.flat('bowl_enamel', (0.85, 0.83, 0.78), 0.35, noise=0.1)
    PLAST = C.flat('crate_plastic', (0.2, 0.35, 0.5), 0.5, noise=0.2)
    BREAD = C.flat('bread', (0.62, 0.38, 0.16), 0.8, noise=0.4)
    TANK = C.flat('tank_blue', (0.18, 0.3, 0.42), 0.5, noise=0.3)
    ROPE = C.flat('rope', (0.12, 0.1, 0.08), 0.8)
    CLOTH = [C.flat('cloth_%d' % i, c, 0.95, noise=0.3) for i, c in enumerate(
        ((0.7, 0.68, 0.62), (0.35, 0.45, 0.6), (0.6, 0.4, 0.3), (0.5, 0.55, 0.45), (0.75, 0.6, 0.4)))]
    WET = C.flat('puddle', (0.03, 0.035, 0.04), 0.03, coat=1.0)
    DARK = C.flat('dark_opening', (0.02, 0.018, 0.016), 0.9)
    WINW = C.glass('glass_warm', tint=(0.3, 0.2, 0.1), rough=0.2, emit=(1.0, 0.72, 0.42), estr=4.0)
    LAMPW = C.flat('lamp_holy', (1, 0.95, 0.8), 0.3, emit=(1.0, 0.9, 0.68), estr=35.0)
    GREEN = C.flat('lamp_green', (0.5, 1, 0.6), 0.3, emit=(0.45, 1.0, 0.55), estr=15.0)
    SODIUM = C.flat('sodium', (1, 0.6, 0.2), 0.3, emit=(1.0, 0.5, 0.15), estr=40.0)
    COLDL = C.flat('coldlight', (0.8, 0.9, 1), 0.3, emit=(0.75, 0.88, 1.0), estr=25.0)
    STAIN = C.flat('soup_stain', (0.09, 0.07, 0.05), 0.5, noise=0.5)
    SOUP = C.flat('soup', (0.45, 0.28, 0.1), 0.15, coat=0.5)

    Wl = Batch('walls_ext'); Rf = Batch('roof'); site = Batch('site_ground')
    Kc = Batch('props_canopy'); Sv = Batch('props_serving'); Tb = Batch('props_tables'); Q = Batch('props_queue')
    Cl = Batch('props_clinic'); Sh = Batch('props_shelter'); Yd = Batch('props_yard'); Li = Batch('props_lights')
    Ut = Batch('props_utility')

    def rz(a, cx, cy):
        return Matrix.Translation((cx, cy, 0)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((-cx, -cy, 0))

    def arch_pts(w, hs, n=8):
        return [(-w / 2, 0), (w / 2, 0)] + [((w / 2) * math.cos(a * math.pi / n), hs + (w / 2) * math.sin(a * math.pi / n)) for a in range(n + 1)]

    # ------------------------------------------------------------ 礼堂：石墙（窗洞处分段砌），圆拱窗（暖光玻璃），板岩双坡屋顶，钟楼式小山墙塔（无钟、无符号）
    def wall_with_windows(p0, p1, normal, n, sill, ww, hs, top, mat):
        P0, P1 = Vector(p0), Vector(p1)
        L = (P1 - P0).length; d = (P1 - P0).normalized()
        nrm = Vector(normal).normalized()
        M = C.wall_frame(P0, nrm)
        sgn = 1 if M.col[0].xyz.dot(d) > 0 else -1
        U = lambda u: u * sgn
        bay = L / n
        for i in range(n):
            c = bay * (i + 0.5); u0, u1 = bay * i, bay * (i + 1)
            C.slab2d(Wl, M, [(U(u0), 0), (U(c - ww / 2), 0), (U(c - ww / 2), top), (U(u0), top)][::sgn], -WT, 0, mat)
            C.slab2d(Wl, M, [(U(c + ww / 2), 0), (U(u1), 0), (U(u1), top), (U(c + ww / 2), top)][::sgn], -WT, 0, mat)
            C.slab2d(Wl, M, [(U(c - ww / 2), 0), (U(c + ww / 2), 0), (U(c + ww / 2), sill), (U(c - ww / 2), sill)][::sgn], -WT, 0, mat)
            ap = hs + ww / 2
            C.slab2d(Wl, M, [(U(c - ww / 2), ap), (U(c + ww / 2), ap), (U(c + ww / 2), top), (U(c - ww / 2), top)][::sgn], -WT, 0, mat)
            # 拱肩：矩形上角填石
            for s in (-1, 1):
                q = [(c + s * ww / 2, hs)] + [(c + s * (ww / 2) * math.cos(a * math.pi / 12), hs + (ww / 2) * math.sin(a * math.pi / 12)) for a in range(7)] + [(c + s * ww / 2, ap)]
                q = [(U(u), v) for (u, v) in q]
                C.slab2d(Wl, M, q[::sgn] if s < 0 else q[::-sgn], -WT, 0, mat)
            fr = [(U(c + u), sill + v) for (u, v) in arch_pts(ww, hs - sill, 8)]
            C.slab2d(Wl, M, fr, -WT * 0.55, -WT * 0.5, WINW)
            C.frame2d(Wl, M, fr if sgn > 0 else fr[::-1], 0.14, -0.02, 0.1, TRIM)
            C.slab2d(Wl, M, [(U(c - 0.04), sill), (U(c + 0.04), sill), (U(c + 0.04), hs + ww / 2), (U(c - 0.04), hs + ww / 2)][::sgn], -WT * 0.52, -WT * 0.35, DWOOD)
            C.slab2d(Wl, M, [(U(c - ww / 2), hs * 0.7 + sill * 0.3), (U(c + ww / 2), hs * 0.7 + sill * 0.3), (U(c + ww / 2), hs * 0.7 + sill * 0.3 + 0.08), (U(c - ww / 2), hs * 0.7 + sill * 0.3 + 0.08)][::sgn], -WT * 0.52, -WT * 0.35, DWOOD)
    wall_with_windows((HX0, HY1, 0), (HX1, HY1, 0), (0, 1, 0), 4, 1.6, 1.4, 4.4, WH, STONE)
    # 南墙（对着大棚）：两扇窗 + 中间大圆拱门（开着，里面暖光）
    wall_with_windows((HX0, HY0, 0), (-3.0, HY0, 0), (0, -1, 0), 1, 1.6, 1.4, 4.4, WH, STONE)
    wall_with_windows((3.0, HY0, 0), (HX1, HY0, 0), (0, -1, 0), 1, 1.6, 1.4, 4.4, WH, STONE)
    dM = C.wall_frame((0, HY0, 0), (0, -1, 0))
    for s in (-1, 1):
        C.slab2d(Wl, dM, [(s * 1.6, 0), (s * 3.0, 0), (s * 3.0, WH), (s * 1.6, WH)][::(1 if s > 0 else -1)] if s > 0 else [(-3.0, 0), (-1.6, 0), (-1.6, WH), (-3.0, WH)], 0, WT, STONE)
    C.slab2d(Wl, dM, [(-1.6, 4.6), (1.6, 4.6), (1.6, WH), (-1.6, WH)], 0, WT, STONE)
    for s in (-1, 1):
        q = [(s * 1.6, 3.0)] + [(s * 1.6 * math.cos(a * math.pi / 12), 3.0 + 1.6 * math.sin(a * math.pi / 12)) for a in range(7)] + [(s * 1.6, 4.6)]
        C.slab2d(Wl, dM, q if s > 0 else q[::-1], 0, WT, STONE)
    C.frame2d(Wl, dM, arch_pts(3.2, 3.0, 12), 0.3, -0.12, 0.05, TRIM)
    C.slab2d(Wl, dM, arch_pts(3.2, 3.0, 12), WT - 0.05, WT, C.glass('hall_depth', tint=(0.25, 0.15, 0.08), rough=0.6, emit=(1.0, 0.7, 0.4), estr=0.9))   # 门内暖光（室内深处）
    for s in (-1, 1):   # 敞开的木门扇
        Wl.box(s * 1.6, s * 1.62 + s * 0.08, HY0 - 0.9, HY0 - 0.05, 0, 3.0, DWOOD, mat=rz(s * 0.0, 0, 0))
    # 东西山墙
    for x, nx in ((HX0, -1), (HX1, 1)):
        xi = x - nx * WT
        Wl.box(min(x, xi), max(x, xi), HY0, HY1, 0, WH, STONE)
        Wl.poly([(x, HY0, WH), (xi, HY0, WH), (xi, HY1, WH), (x, HY1, WH), (x, (HY0 + HY1) / 2, WH + 3.6), (xi, (HY0 + HY1) / 2, WH + 3.6)],
                [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)] if nx > 0 else [(1, 0, 4, 5), (3, 2, 5, 4), (0, 3, 4), (2, 1, 5)], STONE)
        # 山墙圆窗（素面）
        oM = C.wall_frame((x + nx * 0.01, (HY0 + HY1) / 2, 0), (nx, 0, 0))
        ring = [(0.7 * math.cos(a * math.tau / 16), WH + 1.3 + 0.7 * math.sin(a * math.tau / 16)) for a in range(16)]
        C.slab2d(Wl, oM, ring, -0.3, -0.25, WINW); C.frame2d(Wl, oM, ring, 0.14, -0.05, 0.08, TRIM)
    # 扶壁 + 束腰线 + 隅石
    for x in (HX0 + 0.2, -3.8, 3.8, HX1 - 0.2):
        for (y0, y1) in ((HY0 - 0.8, HY0), (HY1, HY1 + 0.8)):
            if abs(x) < 4 and y0 < HY0:
                continue
            Wl.box(x - 0.35, x + 0.35, y0, y1, 0, 4.5, STONE2)
            Wl.poly([(x - 0.35, y0, 4.5), (x + 0.35, y0, 4.5), (x + 0.35, y1, 4.5), (x - 0.35, y1, 4.5),
                     (x - 0.35, HY0 if y0 < HY0 else HY1, 5.4), (x + 0.35, HY0 if y0 < HY0 else HY1, 5.4)],
                    [(0, 1, 5, 4) if y0 < HY0 else (1, 0, 4, 5), (1, 2, 5) if y0 < HY0 else (2, 3, 4), (3, 0, 4) if y0 < HY0 else (0, 1, 5)], STONE2)
    for y in (HY0 - 0.08, HY1 + 0.08):
        Wl.box(HX0, HX1, y - 0.1, y + 0.1, 1.1, 1.3, TRIM)
        Wl.box(HX0 - 0.1, HX1 + 0.1, y - 0.15, y + 0.15, WH - 0.25, WH, TRIM)
    for (x, y) in ((HX0, HY0), (HX1, HY0), (HX0, HY1), (HX1, HY1)):
        z = 0.0; k = 0
        while z < WH - 0.3:
            l = 0.5 if k % 2 else 0.28
            Wl.box(x - 0.03 * (1 if x < 0 else -1), x + (l if x < 0 else -l), y - 0.03 * (1 if y < 10 else -1), y + (0.28 if y < 10 else -0.28), z, z + 0.3, TRIM)
            z += 0.32; k += 1
    # 墙根潮痕（不透明薄贴片：暗色、噪声）
    DAMP = C.flat('damp_base', (0.2, 0.19, 0.17), 0.9, noise=0.6)
    for (x0, x1, y) in ((HX0, -3.0, HY0 - 0.01), (3.0, HX1, HY0 - 0.01), (HX0, HX1, HY1 + 0.01)):
        Wl.box(x0, x1, y - 0.005, y + 0.005, 0, 0.55, DAMP)
    # 屋顶：修复过的板岩（局部新旧色差），檐下木椽头，屋脊
    SLATE_N = C.pbr('slate_new', 'roof_slates_02', 2.0, tint=(0.36, 0.37, 0.42), value=0.7)
    Rf.gable(HX0 - 0.4, HX1 + 0.4, HY0, HY1, WH, 3.6, SLATE, along='x', over=0.5)
    ym = (HY0 + HY1) / 2; hw = ym - HY0 + 0.5
    zr = lambda y: WH + 3.6 * (1 - abs(y - ym) / hw) + 0.05
    for (x0, x1) in ((-6.0, -2.5), (2.0, 4.0)):   # 补过的新瓦片区
        for s in (-1, 1):
            ya, yb = ym + s * hw * 0.8, ym + s * hw * 0.35
            f = [(x0, ya, zr(ya)), (x1, ya, zr(ya)), (x1, yb, zr(yb)), (x0, yb, zr(yb))]
            Rf.poly(f if s < 0 else f[::-1], [(0, 1, 2, 3)], SLATE_N)
    Rf.strip([(HX0 - 0.4, (HY0 + HY1) / 2, WH + 3.62), (HX1 + 0.4, (HY0 + HY1) / 2, WH + 3.62)], 0.3, 0.2, TRIM)
    # 西端小山墙塔（空钟洞，素面）
    bx = HX0 + 0.6
    Wl.box(bx - 0.6, bx + 0.6, 9.8, 11.2, WH + 3.0, WH + 5.8, STONE)
    for s in (-1, 1):
        Wl.box(bx - 0.62, bx + 0.62, 10.5 + s * 0.3 - 0.15, 10.5 + s * 0.3 + 0.15, WH + 5.8, WH + 5.9, TRIM)
    Wl.box(bx - 0.62, bx + 0.62, 10.05, 10.95, WH + 4.3, WH + 5.3, DARK)
    Wl.gable(bx - 0.8, bx + 0.8, 9.6, 11.4, WH + 5.8, 1.0, SLATE, along='x', over=0.0)
    # 侧加的锅炉房（砖 / 抹灰小屋）+ 烟管
    Wl.box(HX1, HX1 + 3.5, 9.0, 13.5, 0, 3.2, STUCCO)
    Rf.poly([(HX1, 8.7, 3.8), (HX1 + 3.8, 8.7, 3.1), (HX1 + 3.8, 13.8, 3.1), (HX1, 13.8, 3.8)], [(0, 1, 2, 3)], C.pbr('roof_sheet', 'box_profile_metal_sheet', 1.0, tint=(0.4, 0.38, 0.36), value=0.7, weather=1.0))
    Ut.cyl(HX1 + 2.6, 12.6, 3.0, 0.2, 7.0, STEEL, 10)
    Ut.cyl(HX1 + 2.6, 12.6, 10.0, 0.3, 0.3, STEEL, 10)
    Wl.box(HX1 + 3.49, HX1 + 3.51, 10.5, 11.5, 0, 2.2, DWOOD)

    # ------------------------------------------------------------ 大棚：钢柱 + 桁架 + 帆布（折板式，多坡）
    cols_x = [KX0 + i * 4.0 for i in range(7)]
    for x in cols_x:
        for y in (KY0, KY1):
            Kc.cyl(x, y, 0, 0.13, 4.6, PAINT, 10)
            Kc.cyl(x, y, 0, 0.26, 0.12, STEEL, 10)   # 底板
        Kc.strip([(x, KY0, 4.6), (x, (KY0 + KY1) / 2, 5.8), (x, KY1, 4.6)], 0.14, 0.24, PAINT)   # 上弦
        Kc.strip([(x, KY0, 4.2), (x, KY1, 4.2)], 0.08, 0.08, PAINT)                               # 下弦
        for t in (0.25, 0.5, 0.75):
            y = KY0 + (KY1 - KY0) * t; zt = 4.6 + 1.2 * (1 - abs(t - 0.5) * 2)
            Kc.strip([(x, y, 4.2), (x, y, zt)], 0.06, 0.06, PAINT)
        for s in (-1, 1):   # 柱头斜撑
            Kc.strip([(x, KY0 if s < 0 else KY1, 3.6), (x, (KY0 if s < 0 else KY1) - s * 0.9, 4.2)], 0.06, 0.06, PAINT)
    for y in (KY0, KY1, (KY0 + KY1) / 2):
        Kc.strip([(KX0, y, 4.6 if y != (KY0 + KY1) / 2 else 5.8), (KX1, y, 4.6 if y != (KY0 + KY1) / 2 else 5.8)], 0.1, 0.14, PAINT)
    # 帆布：每开间一片，微微下垂（中间低）
    for i in range(6):
        x0, x1 = cols_x[i], cols_x[i + 1]
        for (ya, yb, za, zb) in ((KY0 - 0.6, (KY0 + KY1) / 2, 4.45, 5.95), ((KY0 + KY1) / 2, KY1 + 0.6, 5.95, 4.45)):
            nu, nv = 6, 6; vs = []
            for j in range(nv + 1):
                for k in range(nu + 1):
                    u, v = k / nu, j / nv
                    sag = 0.22 * math.sin(math.pi * u) * math.sin(math.pi * v)
                    vs.append((x0 + (x1 - x0) * u, ya + (yb - ya) * v, za + (zb - za) * v + 0.06 - sag))
            fs = [(j * (nu + 1) + k, j * (nu + 1) + k + 1, (j + 1) * (nu + 1) + k + 1, (j + 1) * (nu + 1) + k) for j in range(nv) for k in range(nu)]
            Kc.poly(vs, fs, CANVAS, smooth=True)
            Kc.poly([(v[0], v[1], v[2] + 0.02) for v in vs], [f[::-1] for f in fs], CANVAS, smooth=True)
        # 帆布前沿垂边（短裙边）
        Kc.box(x0, x1, KY0 - 0.62, KY0 - 0.58, 4.05, 4.45, CANVAS)
    # 棚的侧拉索
    for x in (KX0, KX1):
        for y in (KY0, KY1):
            Kc.tube([(x, y, 4.4), (x + (-1.8 if x < 0 else 1.8), y + (-1.2 if y < 0 else 1.2), 0.1)], 0.015, STEEL, 4)
            Kc.cyl(x + (-1.8 if x < 0 else 1.8), y + (-1.2 if y < 0 else 1.2), 0, 0.15, 0.2, STEEL, 8)
    # 棚下地面：混凝土垫 + 地漏
    site.box(KX0 - 0.5, KX1 + 0.5, KY0 - 0.8, KY1 + 0.5, -0.02, 0.06, CONCF)
    for x in (-6, 0, 6):
        site.box(x - 0.25, x + 0.25, -0.5, -0.4, 0.061, 0.065, STEEL)

    # ------------------------------------------------------------ 打饭台（沿 x，棚后部 y≈2.6）+ 汤锅 + 碗 + 面包
    CY = 2.6
    for x0 in (-10.0, -3.4, 3.2):
        x1 = x0 + 6.2
        Sv.box(x0, x1, CY - 0.45, CY + 0.45, 0.85, 0.9, INOX)          # 台面
        Sv.box(x0 + 0.05, x1 - 0.05, CY - 0.4, CY + 0.4, 0.1, 0.85, PANEL)  # 柜体
        Sv.box(x0 + 0.05, x1 - 0.05, CY - 0.4, CY + 0.4, 0.0, 0.1, STEEL)
        Sv.box(x0, x1, CY - 0.47, CY - 0.45, 0.3, 0.32, INOX)
        Sv.box(x0, x1, CY - 0.62, CY - 0.47, 0.84, 0.87, INOX)          # 托盘滑轨
        for k in range(4):
            Sv.strip([(x0 + 0.3 + k * 1.9, CY - 0.55, 0.05), (x0 + 0.3 + k * 1.9, CY - 0.55, 0.85)], 0.03, 0.03, INOX)
        Sv.box(x0 + 0.3, x1 - 0.3, CY - 0.44, CY - 0.43, 0.5, 0.52, STAIN)
        # 大汤锅（两口）：燃气炉架上
        for (px, big) in ((x0 + 1.4, 1), (x0 + 3.3, 0)):
            r = 0.42 if big else 0.34; h = 0.6 if big else 0.45
            Sv.cyl(px, CY + 0.05, 0.9, 0.3, 0.12, STEEL, 12, cap=True)
            pz = 1.02
            Sv.lathe(px, CY + 0.05, pz, [(0.0, 0.0), (r * 0.97, 0.0), (r, 0.03), (r, h), (r + 0.03, h + 0.01), (r - 0.02, h + 0.03), (r - 0.03, h - 0.01)], INOX, n=24)
            Sv.cyl(px, CY + 0.05, pz + h - 0.1, r - 0.03, 0.01, SOUP, 24)
            for s in (-1, 1):
                Sv.tube([(px + s * r, CY + 0.05, pz + h - 0.12), (px + s * (r + 0.1), CY + 0.05, pz + h - 0.08), (px + s * r, CY + 0.05, pz + h - 0.02)], 0.018, INOX, 5)
            # 长柄勺斜插
            lx = px + 0.1
            Sv.tube([(lx, CY + 0.1, pz + h - 0.25), (lx - 0.25, CY - 0.3, pz + h + 0.55)], 0.012, INOX, 5)
            Sv.sphere(lx, CY + 0.1, pz + h - 0.28, 0.07, INOX, seg=10, rings=5, zmin=-1)
        # 碗摞 + 面包筐 + 小勺筒
        for k in range(3):
            bx_ = x0 + 4.4 + k * 0.4; by_ = CY - 0.2
            n = rnd.randint(5, 9)
            for j in range(n):
                Sv.lathe(bx_, by_, 0.9 + j * 0.035, [(0.05, 0), (0.09, 0.02), (0.1, 0.06)], ENAMEL, n=12, smooth=True)
        bx_ = x0 + 5.6
        Sv.box(bx_ - 0.3, bx_ + 0.3, CY - 0.2, CY + 0.25, 0.9, 1.1, PLAST)
        for j in range(6):
            Sv.sphere(bx_ - 0.18 + (j % 3) * 0.18, CY - 0.05 + (j // 3) * 0.18, 1.12, 0.09, BREAD, sz=0.6, seg=10, rings=6)
    # 后备：台后面的工作台 + 大汤桶 + 面包筐摞
    Sv.box(-8, 8, CY + 1.6, CY + 2.3, 0.85, 0.9, INOX)
    for x in range(-7, 8, 2):
        Sv.strip([(x, CY + 1.65, 0), (x, CY + 1.65, 0.85)], 0.04, 0.04, INOX); Sv.strip([(x, CY + 2.25, 0), (x, CY + 2.25, 0.85)], 0.04, 0.04, INOX)
    Sv.box(-8, 8, CY + 1.6, CY + 2.3, 0.2, 0.23, INOX)
    for x in (-6.5, -4.0, 5.0):
        Sv.lathe(x, CY + 1.95, 0.9, [(0, 0), (0.3, 0), (0.3, 0.5), (0.32, 0.52), (0.3, 0.52)], INOX, n=18)
    for (x, n) in ((9.5, 5), (10.3, 3), (-11.0, 4)):
        for j in range(n):
            Sv.box(x - 0.3, x + 0.3, CY + 1.2, CY + 1.65, j * 0.24, j * 0.24 + 0.22, PLAST)
            if j == n - 1:
                for k in range(4):
                    Sv.sphere(x - 0.15 + (k % 2) * 0.3, CY + 1.3 + (k // 2) * 0.22, j * 0.24 + 0.24, 0.1, BREAD, sz=0.55, seg=10, rings=6)
    # 燃气罐（服务台后）
    for x in (-9.2, 8.6):
        Ut.cyl(x, CY + 0.9, 0, 0.18, 0.9, PAINT, 12); Ut.sphere(x, CY + 0.9, 0.9, 0.18, PAINT, sz=0.5, seg=12, rings=6, zmin=0)

    # ------------------------------------------------------------ 就餐区：搁板长桌 + 长凳（棚前部）
    for row, y in enumerate((-0.6, -3.2)):
        for x0 in (-10.5, -3.3, 3.9):
            L = 6.2; x1 = x0 + L
            m = rz(rnd.uniform(-0.015, 0.015), x0 + L / 2, y)
            Tb.box(x0, x1, y - 0.4, y + 0.4, 0.72, 0.76, WOOD, mat=m)
            for xx in (x0 + 0.5, x1 - 0.5, x0 + L / 2):
                for s in (-1, 1):
                    Tb.strip([(xx, y - 0.32, 0), (xx, y + s * 0.0 + 0.32, 0.72)] if s > 0 else [(xx, y + 0.32, 0), (xx, y - 0.32, 0.72)], 0.05, 0.05, STEEL)
            for s in (-1, 1):
                yb = y + s * 0.75
                Tb.box(x0 + 0.2, x1 - 0.2, yb - 0.15, yb + 0.15, 0.42, 0.46, WOOD, mat=m)
                for xx in (x0 + 0.5, x1 - 0.5):
                    Tb.box(xx - 0.03, xx + 0.03, yb - 0.12, yb + 0.12, 0, 0.42, STEEL)
            for k in range(rnd.randint(1, 4)):   # 留在桌上的空碗
                bx_ = rnd.uniform(x0 + 0.4, x1 - 0.4); by_ = y + rnd.uniform(-0.25, 0.25)
                Tb.lathe(bx_, by_, 0.76, [(0.05, 0), (0.09, 0.02), (0.1, 0.06)], ENAMEL, n=12)

    # ------------------------------------------------------------ 排队道：立柱 + 横杆（蛇形），从 -x 远端绕进大棚右入口
    QY = [-8.6, -10.2, -11.8]
    def post(x, y):
        Q.cyl(x, y, 0, 0.18, 0.04, STEEL, 10)
        Q.cyl(x, y, 0.04, 0.03, 0.95, STEEL, 8)
        Q.sphere(x, y, 0.99, 0.045, STEEL, seg=8, rings=4)
    def rail(a, b):
        Q.tube([(a[0], a[1], 0.92), (b[0], b[1], 0.92)], 0.022, PAINT, 6)
        Q.tube([(a[0], a[1], 0.5), (b[0], b[1], 0.5)], 0.015, PAINT, 6)
    lanes = [(-12.0, 11.0, QY[0]), (-12.0, 11.0, QY[1]), (-12.0, 11.0, QY[2])]
    pts = []
    for (xa, xb, y) in lanes:
        xs = [xa + i * 2.3 for i in range(int((xb - xa) / 2.3) + 1)]
        for i, x in enumerate(xs):
            post(x, y)
            if i:
                # 转弯开口：交替两端
                rail((xs[i - 1], y), (x, y))
    # 外侧收口 + 转弯端
    post(-13.8, QY[0]); post(-13.8, QY[2]); post(-13.8, -13.4); post(11.0, -13.4)
    rail((-13.8, QY[0]), (-13.8, QY[2]))
    xs = [-13.8 + i * 2.48 for i in range(11)]
    for i, x in enumerate(xs):
        post(x, -13.4)
        if i: rail((xs[i - 1], -13.4), (x, -13.4))
    post(12.8, QY[1]); post(12.8, -13.4); rail((12.8, QY[1]), (12.8, -13.4))
    # 入口：从棚右前角进
    post(12.8, KY0 - 0.2); rail((12.8, KY0 - 0.2), (12.8, QY[0] + 0.3))
    # 地面排队漆线（素面条带，无文字）
    for y in (QY[0] - 0.8, QY[1] - 0.8, QY[2] - 0.8):
        for x in range(-12, 11, 2):
            site.box(x, x + 1.0, y - 0.04, y + 0.04, 0.0, 0.012, C.flat('floor_paint', (0.6, 0.55, 0.35), 0.7, noise=0.5))
    site.box(-15, 14, -14.5, -7.6, -0.02, 0.005, CONCF)

    # ------------------------------------------------------------ 水箱 + 洗手台（棚左后）
    tx, ty = -14.5, 3.0
    Ut.box(tx - 1.3, tx + 1.3, ty - 1.3, ty + 1.3, 0, 2.2, STEEL)                # 钢架台
    for (dx, dy) in ((-1.2, -1.2), (1.2, -1.2), (1.2, 1.2), (-1.2, 1.2)):
        pass
    Ut.cyl(tx, ty, 2.2, 1.15, 2.2, TANK, 20)
    Ut.cyl(tx, ty, 4.4, 1.15, 0.25, TANK, 20, r2=0.3)
    for z in (2.7, 3.4, 4.0):
        Ut.cyl(tx, ty, z, 1.18, 0.05, TANK, 20)
    Ut.tube([(tx + 1.0, ty - 0.6, 2.4), (tx + 1.6, ty - 0.6, 2.4), (tx + 1.6, ty - 2.6, 2.4), (tx + 1.6, ty - 2.6, 1.2)], 0.05, STEEL, 6)
    # 洗手槽（长不锈钢槽 + 一排水龙头）
    wx, wy = -14.2, -1.8
    Ut.box(wx - 0.35, wx + 0.35, wy - 1.8, wy + 1.8, 0.85, 1.05, INOX)
    Ut.box(wx - 0.3, wx + 0.3, wy - 1.75, wy + 1.75, 0.87, 1.06, DARK)
    for s in (-1.6, 1.6):
        Ut.box(wx - 0.3, wx + 0.3, wy + s - 0.05, wy + s + 0.05, 0, 0.85, STEEL)
    Ut.tube([(wx + 0.35, wy - 1.8, 1.3), (wx + 0.35, wy + 1.8, 1.3)], 0.03, STEEL, 6)
    for k in range(5):
        y = wy - 1.4 + k * 0.7
        Ut.tube([(wx + 0.35, y, 1.3), (wx + 0.1, y, 1.3), (wx + 0.05, y, 1.2)], 0.018, INOX, 5)
    Ut.cyl(wx, wy + 2.3, 0, 0.3, 0.7, PLAST, 12)   # 垃圾桶
    for (px, py, r) in ((wx + 0.9, wy, 0.9), (-10.5, -6.0, 0.6)):
        site.poly([(px + r * math.cos(i * math.tau / 12) * rnd.uniform(0.7, 1.1), py + r * 0.6 * math.sin(i * math.tau / 12), 0.066) for i in range(12)], [tuple(range(12))], WET)

    # ------------------------------------------------------------ 义诊小楼（右，白色预制板房 + 雨棚 + 坡道 + 浅绿信号灯）
    cx0, cx1, cy0, cy1 = 15.0, 23.0, -4.0, 2.5
    Cl.box(cx0, cx1, cy0, cy1, 0.3, 3.3, PANEL)
    Cl.box(cx0 - 0.2, cx1 + 0.2, cy0 - 0.2, cy1 + 0.2, 0, 0.3, CONCF)
    Cl.box(cx0 - 0.15, cx1 + 0.15, cy0 - 0.15, cy1 + 0.15, 3.3, 3.5, PANEL)
    for x in (cx0, cx1):   # 角立柱
        for y in (cy0, cy1):
            Cl.box(x - 0.06, x + 0.06, y - 0.06, y + 0.06, 0.3, 3.5, STEEL)
    CGLASS = C.glass('glass_cool', tint=(0.2, 0.25, 0.25), rough=0.1, emit=(0.9, 0.95, 1.0), estr=2.5)
    for x in (16.2, 20.8):   # 前窗（-x 面向大棚？朝 -y）
        Cl.box(x - 0.7, x + 0.7, cy0 - 0.03, cy0, 1.2, 2.4, CGLASS)
        Cl.box(x - 0.78, x + 0.78, cy0 - 0.08, cy0, 1.12, 1.2, STEEL)
    Cl.box(18.1, 19.3, cy0 - 0.03, cy0, 0.3, 2.5, CGLASS)          # 玻璃门
    Cl.box(17.9, 19.5, cy0 - 0.06, cy0, 2.5, 2.6, STEEL)
    Cl.box(17.4, 20.0, cy0 - 1.4, cy0, 2.8, 2.9, PANEL)            # 雨棚
    for x in (17.5, 19.9):
        Cl.strip([(x, cy0, 3.2), (x, cy0 - 1.35, 2.9)], 0.04, 0.04, STEEL)
    Cl.poly([(17.9, cy0 - 0.2, 0.3), (19.5, cy0 - 0.2, 0.3), (19.5, cy0 - 3.4, 0.0), (17.9, cy0 - 3.4, 0.0)], [(3, 2, 1, 0)], CONCF)   # 坡道
    for s in (17.85, 19.55):
        Cl.tube([(s, cy0 - 3.4, 0.9), (s, cy0 - 0.2, 1.2)], 0.025, INOX, 6)
        for t in (0.0, 0.5, 1.0):
            Cl.cyl(s, cy0 - 3.4 + 3.2 * t, 0.3 * (1 - t), 0.02, 0.9 - 0.0, INOX, 6)
    # 信号灯：门侧墙上一盏方灯（浅绿，素面）
    Cl.box(20.4, 20.8, cy0 - 0.15, cy0, 2.6, 3.0, STEEL)
    Cl.box(20.45, 20.75, cy0 - 0.17, cy0 - 0.14, 2.65, 2.95, GREEN)
    # 屋顶设备：空调外机、通风帽
    Cl.box(21.0, 22.2, 0.5, 1.8, 3.5, 4.2, PANEL); Cl.cyl(21.6, 0.3, 4.2, 0.3, 0.02, DARK, 16)
    Cl.cyl(16.3, 1.2, 3.5, 0.15, 0.6, STEEL, 10); Cl.cyl(16.3, 1.2, 4.1, 0.25, 0.1, STEEL, 10)
    # 侧面第二节模块（稍矮）+ 连接走廊
    Cl.box(cx0 + 1.0, cx1 - 1.0, cy1 + 1.0, cy1 + 5.0, 0.3, 3.0, PANEL)
    Cl.box(cx0 + 0.85, cx1 - 0.85, cy1 + 0.85, cy1 + 5.15, 3.0, 3.15, PANEL)
    for x in (17.5, 20.5):
        Cl.box(x - 0.5, x + 0.5, cy1 + 5.0, cy1 + 5.03, 1.3, 2.2, CGLASS)
    # 门口候诊长凳
    for x in (15.6, 21.4):
        Cl.box(x - 0.8, x + 0.8, cy0 - 0.8, cy0 - 0.45, 0.42, 0.46, WOOD)
        for dx in (-0.6, 0.6):
            Cl.box(x + dx - 0.03, x + dx + 0.03, cy0 - 0.78, cy0 - 0.47, 0, 0.42, STEEL)

    # ------------------------------------------------------------ 收容所（左，两层抹灰小楼：小窗、外楼梯、晾衣绳）
    sx0, sx1, sy0, sy1 = -27.0, -18.0, 1.0, 9.0
    Sh.box(sx0, sx1, sy0, sy1, 0, 6.4, STUCCO)
    Sh.box(sx0 - 0.1, sx1 + 0.1, sy0 - 0.1, sy1 + 0.1, 3.1, 3.3, TRIM)       # 层间线
    Sh.box(sx0 - 0.1, sx1 + 0.1, sy0 - 0.1, sy1 + 0.1, 0, 0.4, STONE2)       # 勒脚
    Sh.gable(sx0 - 0.3, sx1 + 0.3, sy0, sy1, 6.4, 2.2, SLATE, along='x', over=0.4)
    Sh.cyl(sx0 + 1.5, 6.0, 6.4, 0.3, 2.6, STONE2, 8)   # 烟囱（圆，粗糙）
    for z0 in (1.0, 4.1):
        for x in (-25.8, -24.0, -22.2, -20.4, -18.8):
            if z0 < 2 and abs(x + 22.2) < 0.1:
                continue
            for (y, s) in ((sy0, -1), (sy1, 1)):
                Sh.box(x - 0.35, x + 0.35, y + s * 0.0 - 0.03 * s, y + 0.01 * s, z0, z0 + 1.0, WINW if rnd.random() < 0.7 else DARK)
                Sh.box(x - 0.45, x + 0.45, y, y + s * 0.12, z0 - 0.08, z0, TRIM)
                Sh.box(x - 0.45, x - 0.35, y, y + s * 0.06, z0, z0 + 1.0, DWOOD)   # 窗板（开着的百叶，素面）
                Sh.box(x + 0.35, x + 0.45, y, y + s * 0.06, z0, z0 + 1.0, DWOOD)
    Sh.box(-22.8, -21.6, sy0 - 0.03, sy0, 0, 2.3, DWOOD)                 # 门
    Sh.box(-23.0, -21.4, sy0 - 1.0, sy0, 2.4, 2.5, SLATE)                 # 门檐
    for x in (-22.9, -21.5):
        Sh.strip([(x, sy0, 2.2), (x, sy0 - 0.95, 2.45)], 0.04, 0.04, DWOOD)
    Sh.box(-23.0, -21.4, sy0 - 0.6, sy0, 0, 0.15, STONE2)
    # 外楼梯（钢）到二层侧门
    for k in range(16):
        z = 0.2 * (k + 1); y = sy0 + 0.6 + k * 0.28
        Sh.box(sx1 + 0.1, sx1 + 1.1, y, y + 0.28, z - 0.04, z, STEEL)
    Sh.box(sx1 + 0.1, sx1 + 1.3, sy0 + 5.1, sy1 - 0.2, 3.16, 3.24, STEEL)
    Sh.tube([(sx1 + 1.1, sy0 + 0.6, 1.0), (sx1 + 1.1, sy0 + 5.1, 4.2), (sx1 + 1.3, sy1 - 0.2, 4.2)], 0.025, STEEL, 6)
    Sh.box(sx1 - 0.01, sx1, sy0 + 5.6, sy0 + 6.6, 3.24, 5.4, DWOOD)
    # 晾衣绳：两根杆 + 两根绳 + 挂着的布
    for x in (-26.5, -19.5):
        Sh.cyl(x, -0.3, 0, 0.05, 2.2, STEEL, 8)
        Sh.strip([(x, -0.3, 2.15), (x, -0.3, 2.15)] if False else [(x - 0.01, -0.3, 2.1), (x + 0.01, -0.3, 2.1)], 0.9, 0.05, STEEL)
    for yy in (-0.7, 0.1):
        Sh.tube([(-26.5, yy, 2.1), (-23.0, yy, 1.95), (-19.5, yy, 2.1)], 0.008, ROPE, 4)
        x = -26.1
        while x < -19.9:
            w = rnd.uniform(0.4, 0.9); h = rnd.uniform(0.5, 0.9)
            zt = 2.1 - 0.15 * math.sin(math.pi * (x + 26.5) / 7.0)
            Sh.box(x, x + w, yy - 0.01, yy + 0.01, zt - h, zt, rnd.choice(CLOTH), mat=rz(rnd.uniform(-0.05, 0.05), x, yy))
            x += w + rnd.uniform(0.1, 0.35)
    # 晾衣绳从小楼窗间拉出的第二组（二层）
    Sh.tube([(sx0 + 0.2, sy0 - 0.02, 5.4), (sx0 - 3.0, sy0 - 1.0, 5.1)], 0.008, ROPE, 4)
    Sh.cyl(sx0 - 3.0, sy0 - 1.0, 0, 0.06, 5.2, STEEL, 8)
    for k in range(5):
        t = (k + 0.5) / 5
        px, py, pz = sx0 + 0.2 + (-3.2) * t, sy0 - 0.02 - t, 5.4 - 0.3 * t - 0.1
        Sh.box(px - 0.25, px + 0.25, py - 0.01, py + 0.01, pz - 0.6, pz, CLOTH[k % 5], mat=rz(-0.3, px, py))
    # 花盆（窗台）
    for x in (-25.8, -20.4):
        Sh.box(x - 0.35, x + 0.35, sy0 - 0.25, sy0 - 0.05, 4.02, 4.2, C.flat('pot', (0.45, 0.25, 0.15), 0.8, noise=0.3))

    # ------------------------------------------------------------ 游戏场（收容所前）：矮栅栏、秋千、沙坑、长椅
    yx0, yx1, yy0, yy1 = -27.5, -17.5, -11.0, -2.0
    site.box(yx0, yx1, yy0, yy1, -0.01, 0.03, DIRT)
    def fence(a, b, gap=None):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = int(L / 0.25)
        for i in range(n + 1):
            t = i / n; x = a[0] + (b[0] - a[0]) * t; y = a[1] + (b[1] - a[1]) * t
            if gap and gap[0] < x < gap[1] and abs(y - a[1]) < 0.01 and a[1] == b[1]:
                continue
            Yd.box(x - 0.03, x + 0.03, y - 0.03, y + 0.03, 0, 0.9, WOOD if i % 8 else STEEL)
        segs = [(a, b)] if not gap else [((a[0], a[1]), (gap[0], a[1])), ((gap[1], a[1]), (b[0], b[1]))]
        for (p, q) in segs:
            for z in (0.3, 0.8):
                Yd.strip([(p[0], p[1], z), (q[0], q[1], z)], 0.05, 0.06, WOOD)
    fence((yx0, yy0), (yx1, yy0)); fence((yx0, yy0), (yx0, yy1)); fence((yx1, yy0), (yx1, yy1))
    fence((yx0, yy1), (yx1, yy1), gap=(-23.2, -21.4))
    # 秋千：A 形钢架 + 两座
    swx, swy = -24.0, -8.0
    for x in (swx - 1.8, swx + 1.8):
        for s in (-1, 1):
            Yd.tube([(x, swy + s * 0.9, 0), (x, swy, 2.4)], 0.045, PAINT, 8)
    Yd.tube([(swx - 1.9, swy, 2.4), (swx + 1.9, swy, 2.4)], 0.055, PAINT, 8)
    for x in (swx - 0.8, swx + 0.8):
        for dx in (-0.22, 0.22):
            Yd.tube([(x + dx, swy, 2.38), (x + dx, swy, 0.52)], 0.01, STEEL, 4)
        Yd.box(x - 0.26, x + 0.26, swy - 0.11, swy + 0.11, 0.48, 0.53, WOOD)
    # 沙坑：木框 + 沙 + 小桶小铲（素面塑料）
    bx0, bx1, by0, by1 = -21.8, -18.6, -9.8, -6.8
    Yd.box(bx0, bx1, by0, by1, 0.0, 0.2, SAND)
    for (a0, a1, b0, b1) in ((bx0 - 0.12, bx1 + 0.12, by0 - 0.12, by0), (bx0 - 0.12, bx1 + 0.12, by1, by1 + 0.12), (bx0 - 0.12, bx0, by0, by1), (bx1, bx1 + 0.12, by0, by1)):
        Yd.box(a0, a1, b0, b1, 0, 0.32, WOOD)
    Yd.sphere(-20.6, -8.5, 0.2, 0.5, SAND, sz=0.35, seg=12, rings=6, zmin=0)
    Yd.lathe(-19.5, -7.6, 0.2, [(0.08, 0), (0.1, 0.16)], C.flat('toy_red', (0.7, 0.15, 0.1), 0.4), n=10)
    Yd.box(-19.9, -19.3, -8.9, -8.8, 0.2, 0.23, C.flat('toy_yellow', (0.8, 0.65, 0.1), 0.4))
    # 长椅（给看护的大人）
    Yd.box(-27.0, -25.4, -4.0, -3.6, 0.42, 0.46, WOOD); Yd.box(-27.0, -25.4, -3.62, -3.56, 0.46, 0.9, WOOD)
    for x in (-26.8, -25.6):
        Yd.box(x - 0.03, x + 0.03, -4.0, -3.6, 0, 0.42, STEEL)
    # 游戏场一侧的小花槽（绿植）
    TM = C.tree_mats(); weeds = [TM['leaf_a'], TM['leaf_b']]
    Yd.box(yx0 + 0.2, yx0 + 0.8, -10.6, -5.0, 0, 0.4, STONE2)
    for k in range(6):
        C._cards(Yd, rnd, (yx0 + 0.5, -10.2 + k * 0.9, 0.5), (0.3, 0.4, 0.25), 25, 0.06, weeds, shell=0.5)

    # ------------------------------------------------------------ 灯：棚下素白灯罩（暖中带冷金），礼堂门灯，路灯
    lamp_pts = []
    for x in [KX0 + 2 + i * 4.0 for i in range(6)]:
        for y in (-3.0, 1.8):
            Li.tube([(x, y, 5.3 if abs(y + 0.75) < 3 else 4.6), (x, y, 3.4)], 0.008, STEEL, 4)
            Li.lathe(x, y, 3.1, [(0.06, 0.35), (0.34, 0.05), (0.36, 0.0)], C.flat('shade_white', (0.9, 0.9, 0.88), 0.4), n=16)
            Li.lathe(x, y, 3.1, [(0.36, 0.0), (0.34, 0.05), (0.06, 0.35)], C.flat('shade_in', (1, 0.95, 0.85), 0.3, emit=(1.0, 0.88, 0.62), estr=4.0), n=16)
            Li.sphere(x, y, 3.2, 0.1, LAMPW, seg=10, rings=6)
            lamp_pts.append((x, y, 3.0))
    for (x, y) in ((-2.6, HY0 - 0.15), (2.6, HY0 - 0.15), (-22.2, sy0 - 0.12)):   # 壁灯
        Li.box(x - 0.12, x + 0.12, y - 0.25, y, 2.8 if x > -10 else 2.6, 3.1 if x > -10 else 2.9, STEEL)
        Li.sphere(x, y - 0.25, 2.8 if x > -10 else 2.6, 0.12, LAMPW, seg=10, rings=6)
    for (x, y) in ((-16.0, -6.0), (14.0, -9.0), (-16.0, -13.0), (26.0, -6.0)):   # 路灯
        Li.cyl(x, y, 0, 0.08, 4.5, PAINT, 8)
        Li.strip([(x, y, 4.5), (x + 0.8, y, 4.7)], 0.06, 0.06, PAINT)
        Li.box(x + 0.6, x + 1.0, y - 0.15, y + 0.15, 4.55, 4.75, PAINT)
        Li.box(x + 0.62, x + 0.98, y - 0.13, y + 0.13, 4.53, 4.56, LAMPW)
    # 灯串（棚前沿）：小灯泡
    for i in range(6):
        x0 = cols_x[i]; x1 = cols_x[i + 1]
        for k in range(6):
            t = (k + 0.5) / 6
            Li.sphere(x0 + (x1 - x0) * t, KY0 - 0.62, 4.0 - 0.25 * math.sin(math.pi * t), 0.05, LAMPW, seg=6, rings=4)
        Li.tube([(x0, KY0 - 0.62, 4.05), ((x0 + x1) / 2, KY0 - 0.62, 3.8), (x1, KY0 - 0.62, 4.05)], 0.006, ROPE, 4)

    # ------------------------------------------------------------ 场地：旧石板前院 + 压实土 + 路
    site.box(-60, 60, -60, 60, -0.3, -0.05, DIRT)
    site.box(HX0 - 2, HX1 + 5, HY0 - 1.2, HY1 + 2, -0.1, 0.0, PAVE)
    site.box(-30, 30, -18, -14.5, -0.12, -0.01, CONCF)   # 路
    for k in range(40):   # 碎石 / 路沿
        x = rnd.uniform(-40, 40); y = rnd.uniform(-30, 30)
        if -28 < x < 24 and -15 < y < 17:
            continue
        site.boxc(x, y, -0.05, rnd.uniform(0.2, 0.6), rnd.uniform(0.2, 0.5), rnd.uniform(0.1, 0.3), STONE2, mat=rz(rnd.uniform(0, 3), x, y))
    for (px, py, r) in ((4.0, -16.0, 1.6), (-12.0, -17.0, 1.0), (20.0, -12.0, 1.2)):
        site.poly([(px + r * math.cos(i * math.tau / 14) * rnd.uniform(0.7, 1.1), py + r * 0.6 * math.sin(i * math.tau / 14), 0.0) for i in range(14)], [tuple(range(14))], WET)

    # ------------------------------------------------------------ 背景：铁皮屋、巨柱、中层底面 + 管道 + 灯
    Bg = Batch('bg_structure'); Bs = Batch('bg_shacks')
    TIN = [C.pbr('tin_%d' % i, 'box_profile_metal_sheet', 1.0, tint=t, value=0.6, weather=1.0) for i, t in enumerate(((0.45, 0.35, 0.28), (0.35, 0.38, 0.4), (0.5, 0.45, 0.35)))]
    UND = C.flat('mid_underside', (0.2, 0.2, 0.21), 0.75, metal=0.3, noise=0.4)
    rb = random.Random(3)
    for k in range(90):
        a = rb.uniform(0, math.tau); d = rb.uniform(36, 80)
        x, y = d * math.cos(a), d * math.sin(a) + 5
        w, dd, h = rb.uniform(3, 6), rb.uniform(3, 5), rb.uniform(2.5, 6)
        m = rz(rb.uniform(-0.2, 0.2), x, y)
        Bs.boxc(x, y, 0, w, dd, h, rb.choice(TIN), mat=m)
        Bs.poly([(x - w / 2 - 0.3, y - dd / 2 - 0.3, h), (x + w / 2 + 0.3, y - dd / 2 - 0.3, h + 0.5), (x + w / 2 + 0.3, y + dd / 2 + 0.3, h + 0.5), (x - w / 2 - 0.3, y + dd / 2 + 0.3, h)],
                [(0, 1, 2, 3)], rb.choice(TIN), mat=m)
        if rb.random() < 0.5:
            Bs.boxc(x, y - dd / 2 - 0.02, 1.2, 0.6, 0.04, 0.6, WINW if rb.random() < 0.6 else SODIUM, mat=m)
    for (x, y, r_) in ((-45, 30, 7), (40, 35, 8), (-40, -35, 7), (48, -30, 7), (0, 60, 9)):
        Bg.cyl(x, y, 0, r_, CEIL, PILLARM, 28)
        Bg.cyl(x, y, CEIL - 14, r_, 14, PILLARM, 28, r2=r_ * 1.8)
        for z in range(8, int(CEIL) - 14, 12):
            Bg.cyl(x, y, z, r_ + 0.3, 0.6, RUST, 28)
        Bg.box(x - 0.7, x + 0.7, y - r_ - 0.3, y - r_, 12, 12.6, SODIUM)
    Bg.box(-500, 500, -500, 500, CEIL, CEIL + 10, UND)
    for y in range(-200, 220, 24):
        Bg.box(-300, 300, y - 1.2, y + 1.2, CEIL - 4, CEIL, UND)
    for i in range(14):
        y = rb.uniform(-100, 120); z = CEIL - rb.uniform(6, 12)
        Bg.tube([(-300, y, z), (300, y + rb.uniform(-20, 20), z)], rb.uniform(0.5, 1.4), RUST if i % 2 else STEEL, 10)
    for i in range(40):
        x, y = rb.uniform(-150, 150), rb.uniform(-120, 150)
        Bg.boxc(x, y, CEIL - 4.4, 2.5, 0.5, 0.3, COLDL if rb.random() < 0.6 else SODIUM)

    Batch.build_all()

    # ------------------------------------------------------------ 灯光：几乎无自然光；棚下暖金主光
    w = bpy.data.worlds.new('w'); sc.world = w
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.02, 0.025, 0.035, 1); bg.inputs[1].default_value = 1.0
    C.spot_light('fill_top', (0, 0, CEIL - 5), (0, 0, 0), 9.0e4, (0.55, 0.65, 0.9), angle=110, radius=20)
    for (x, y, z) in lamp_pts:
        C.spot_light('holy_%d_%d' % (int(x), int(y)), (x, y, z), (x, y, 0), 420, (1.0, 0.86, 0.6), angle=120, radius=0.3)
    C.point_light('door_glow', (0, HY0 - 1.0, 2.6), 200, (1.0, 0.7, 0.4), radius=1.0)
    C.point_light('hall_in', (0, 12.5, 4.0), 250, (1.0, 0.72, 0.42), radius=2.0)
    C.point_light('shelter_door', (-22.2, sy0 - 0.6, 2.4), 120, (1.0, 0.8, 0.55), radius=0.2)
    C.point_light('clinic_green', (20.6, cy0 - 0.5, 2.8), 60, (0.45, 1.0, 0.55), radius=0.2)
    C.point_light('clinic_door', (18.7, cy0 - 1.0, 2.7), 150, (0.9, 0.95, 1.0), radius=0.3)
    for (x, y) in ((-16.0, -6.0), (14.0, -9.0), (-16.0, -13.0), (26.0, -6.0)):
        C.spot_light('street_%d_%d' % (int(x), int(y)), (x + 0.8, y, 4.5), (x + 0.8, y, 0), 500, (1.0, 0.88, 0.65), angle=110, radius=0.2)
    C.spot_light('yard_flood', (-15, -4, 7), (-22, -6, 0), 5000, (1.0, 0.85, 0.6), angle=80, radius=0.5)
    C.spot_light('ceil_up', (0, -20, 2), (0, 0, CEIL), 6.0e4, (0.9, 0.75, 0.55), angle=120, radius=5)
    sc.view_settings.exposure = 1.0
    if A['exposure']:
        sc.view_settings.exposure = float(A['exposure'])
    CAMS = {
        'c1': ((30, -36, 17), (-3, 0, 1.0), 24),
        'c2': ((-2.5, -5.2, 1.6), (1.5, 2.6, 1.1), 22),
        'c3': ((-2, -26, 6.0), (-3, -3, 1.5), 16),
    }
    pos, tgt, lens = CAMS[A['cam']]
    C.camera(sc, pos, tgt, lens)
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
