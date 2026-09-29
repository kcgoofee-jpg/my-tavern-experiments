"""天城执法局总局（中层核心区「钢铁与霓虹」，甲板上的巨构街区）——只做外观。
  walls_ext      主塔：深色花岗岩 + 钢的方形塔楼（约 150 m），竖向石鳍、横向石带、顶部发光冠环。
  props_podium   宽大台座（x -60..60、y 0..70、高 14）+ 朝南外凸的玻璃大厅 + 厅内壁挂的 18 格区域状态屏（纯色灯格，无字）。
  props_security 前庭：安检门（入口）、防撞护柱、摄像头簇（塔角 + 立杆）。
  props_garage   东侧下沉车道（y -45..0 由 z 0 降到 z -6）+ 地下车库闸门 + 挡墙。
  props_dock     东翼多层悬浮车库 / 停机坞（x 62..100，四层开敞）+ 南侧起降挑台。
  props_vehicles 无标识深色悬浮巡逻车与厢式车（停放 + 两台悬停）。
  props_roof     塔顶挑出的圆形起降坪、通信天线桅杆、屋顶设备。
  props_lights   灯杆、地灯、檐下灯带。
  props_signs    纯色全息面板（无字）。
  site_ground    甲板、街道、人行道、前庭铺装与花池屏障。
bg_*：周边巨构楼群、头顶甲板与桁架、磁悬浮高架、上层浮岛底面。
中立：无人物、无文字 / 标志 / 徽章、无武器、无囚室 / 束具。

布局（米）：甲板 z=0；塔 x -20..20、y 16..56，顶 z 150；前庭 y -45..0；南侧大街 y -62..-45。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/enforcement_hq/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/eh.jpg [--blend x.blend] [--log x.txt] [--exposure 0.5]
cam: c1 街区俯瞰 / c2 前庭入口视高 / c3 悬浮车库与车道
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/eh.jpg', blend='', log='', exposure=''))

TX0, TX1, TY0, TY1, TH = -20.0, 20.0, 16.0, 56.0, 150.0
PX0, PX1, PY0, PY1, PH = -60.0, 60.0, 0.0, 70.0, 14.0
DX0, DX1, DY0, DY1 = 62.0, 100.0, -5.0, 56.0
RX0, RX1 = 44.0, 54.0           # 下沉车道
GZ = -6.0                        # 车库地面
OZ = 235.0                       # 头顶甲板
UZ = 470.0


def main():
    import bpy
    from mathutils import Matrix, Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(5)

    # ------------------------------------------------------------ 材质
    DSTONE = C.ashlar('eh_granite', (0.07, 0.07, 0.075), course=1.6, block=3.2, joint=0.008, jc=(0.05, 0.05, 0.05), var=0.08, rough=0.45)
    DSTONE2 = C.ashlar('eh_granite_r', (0.1, 0.1, 0.11), course=2.4, block=3.6, joint=0.006, jc=(0.02, 0.02, 0.02), var=0.1, rough=0.4)
    CONC = C.pbr('eh_conc', 'concrete_wall_008', 4.0, tint=(0.55, 0.56, 0.58), sat=0.0, weather=0.6)
    PANEL = C.pbr('eh_panel', 'smooth_concrete_floor', 3.0, tint=(0.45, 0.46, 0.48), sat=0.2, weather=0.4)
    PAVE = C.pbr('eh_pave', 'precast_stone_paving', 3.0, tint=(0.42, 0.42, 0.43), sat=0.3)
    ASPH = C.pbr('eh_asphalt', 'asphalt_02', 5.0, tint=(0.3, 0.3, 0.32), sat=0.3, value=0.7)
    STEEL = C.pbr('eh_steel', 'Metal009', 2.0, tint=(0.4, 0.41, 0.43), sat=0.3, metal=0.85)
    DARKM = C.flat('eh_darkmetal', (0.04, 0.045, 0.05), 0.35, metal=0.85, noise=0.2)
    GUN = C.flat('eh_gunmetal', (0.1, 0.105, 0.11), 0.3, metal=0.9, noise=0.25)
    GLASS = C.glass('eh_glass_dark', (0.04, 0.05, 0.06))
    GLASS_C = C.glass('eh_glass_cool', (0.08, 0.1, 0.12), emit=(0.75, 0.88, 1.0), estr=1.2)
    GLASS_H = C.clear_glass('eh_glass_hall')
    TWIN = C.window_grid('eh_twin', wall=(0.03, 0.035, 0.04), lit=(0.7, 0.85, 1.0), estr=2.2, cell=(2.4, 4.0), seed=3.1)
    CROWN = C.flat('eh_crown', (1, 1, 1), 0.3, emit=(0.55, 0.8, 1.0), estr=30.0)
    RED = C.flat('eh_red', (1, 0.1, 0.05), 0.4, emit=(1.0, 0.08, 0.04), estr=12.0)
    LAMP = C.flat('eh_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.85, 0.65), estr=16.0)
    LAMPC = C.flat('eh_lamp_c', (1, 1, 1), 0.4, emit=(0.75, 0.88, 1.0), estr=14.0)
    LEDB = C.flat('eh_led_b', (1, 1, 1), 0.4, emit=(0.2, 0.6, 1.0), estr=10.0)
    WHITE = C.flat('eh_white', (0.7, 0.72, 0.74), 0.4)
    HAZ = C.hazard('eh_hazard', period=0.6, wear=0.4)
    SOIL = C.flat('eh_soil', (0.06, 0.05, 0.04), 0.95, noise=0.4)
    HEDGE = C.flat('eh_hedge', (0.04, 0.09, 0.05), 0.8, noise=0.5)
    RUBBER = C.pbr('eh_rubber', 'Rubber004', 1.0, tint=(0.2, 0.2, 0.2), sat=0.2)
    LINE = C.flat('eh_lane', (0.65, 0.65, 0.63), 0.6, noise=0.4)
    GRIME = C.flat('eh_grime', (0.03, 0.028, 0.025), 0.9, noise=0.6)
    CARP = C.flat('eh_carpaint', (0.04, 0.045, 0.055), 0.22, metal=0.6, coat=0.8, noise=0.1)
    CARP2 = C.flat('eh_carpaint2', (0.09, 0.1, 0.115), 0.3, metal=0.5, coat=0.6, noise=0.15)
    THRD = C.flat('eh_thruster_dim', (0.02, 0.02, 0.03), 0.4, emit=(0.2, 0.4, 0.8), estr=1.2)
    THR = C.flat('eh_thruster', (1, 1, 1), 0.4, emit=(0.35, 0.65, 1.0), estr=9.0)
    CELLS = [C.flat('eh_cell%d' % i, (0, 0, 0), 0.3, emit=c, estr=1.2) for i, c in enumerate(
        ((0.1, 0.9, 0.35), (1.0, 0.55, 0.05), (1.0, 0.1, 0.05), (0.1, 0.8, 1.0)))]
    HOLO = [C.holo('eh_holo_cyan', (0.1, 0.7, 1.0), (0.05, 0.3, 0.9), 5.0, 0.6),
            C.holo('eh_holo_red', (1.0, 0.18, 0.12), (0.7, 0.05, 0.08), 5.0, 0.55),
            C.holo('eh_holo_white', (0.8, 0.88, 1.0), (0.4, 0.55, 0.9), 4.0, 0.5)]

    points, spots = [], []

    def rbox(B, x, y, z, sx, sy, sz, m, rz=0.0, rx=0.0):
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X')
        B.box(-sx / 2, sx / 2, -sy / 2, sy / 2, -sz / 2, sz / 2, m, M)

    def beam(B, p0, p1, w, m):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        M = Matrix.Translation((p0 + p1) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        B.box(-w / 2, w / 2, -w / 2, w / 2, -d.length / 2, d.length / 2, m, M)

    # ============================================================ 悬浮车
    def loft(B, M, secs, m):
        """secs = [(y, 半宽, 底 z, 顶 z)…]，每截面 6 点的倒角六边形，沿 y 放样"""
        vs, fs = [], []
        for (y, w, zb, zt) in secs:
            for (px, pz) in ((-w, zb + 0.18), (-w * 0.82, zb), (w * 0.82, zb), (w, zb + 0.18), (w * 0.72, zt), (-w * 0.72, zt)):
                vs.append(tuple(M @ Vector((px, y, pz))))
        n = 6
        for j in range(len(secs) - 1):
            for i in range(n):
                a, b = j * n + i, j * n + (i + 1) % n
                fs.append((a, a + n, b + n, b))
        fs.append(tuple(range(n))); L = (len(secs) - 1) * n; fs.append(tuple(range(L + n - 1, L - 1, -1)))
        B.poly(vs, fs, m, smooth=False)

    def hovercar(B, x, y, z, rz, van=False, paint=None, lit=True):
        """无标识悬浮巡逻车：车头在本地 -y；四个推进舱（底部冷光）；van=True 为厢式车。"""
        paint = paint or CARP
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z')
        def P(px, py, pz): return tuple(M @ Vector((px, py, pz)))
        if van:
            L, W = 3.2, 1.15
            loft(B, M, [(-L, W * 0.8, 0.45, 0.9), (-L + 0.5, W, 0.35, 1.3), (-L + 1.4, W, 0.3, 2.1), (L - 0.3, W, 0.3, 2.2), (L, W * 0.95, 0.4, 2.05)], paint)
            loft(B, M, [(-L + 0.55, W * 0.97, 1.3, 1.34), (-L + 1.35, W * 0.97, 1.9, 2.08)], GLASS)
            for sx in (-1, 1):
                rbox(B, *P(sx * W * 0.99, -L + 1.0, 1.6), 0.03, 0.9, 0.5, GLASS, rz=rz)
                rbox(B, *P(sx * W * 0.99, 0.6, 1.2), 0.03, 0.04, 1.6, DARKM, rz=rz)       # 侧滑门缝
                rbox(B, *P(sx * W * 0.99, 0.9, 0.65), 0.03, 4.0, 0.08, GRIME, rz=rz)     # 下沿污迹
        else:
            L, W = 2.5, 0.98
            loft(B, M, [(-L, W * 0.7, 0.45, 0.7), (-L + 0.6, W, 0.35, 0.95), (-0.6, W, 0.3, 1.05), (0.9, W, 0.3, 1.02), (L - 0.3, W * 0.95, 0.35, 0.98), (L, W * 0.8, 0.45, 0.85)], paint)
            loft(B, M, [(-0.9, W * 0.85, 0.9, 0.95), (-0.2, W * 0.78, 1.0, 1.5), (0.9, W * 0.75, 1.0, 1.45), (1.6, W * 0.8, 0.95, 1.0)], GLASS)
        for sx in (-1, 1):
            for py in (-L + 0.7, L - 0.7):          # 推进舱
                px, pyy, pz = P(sx * (W + 0.18), py, 0.35)
                B.cyl(px, pyy, pz - 0.18, 0.42, 0.42, GUN, n=10)
                B.cyl(px, pyy, pz - 0.2, 0.3, 0.02, THR if lit else THRD, n=8, smooth=False)
            rbox(B, *P(sx * W * 0.55, -L - 0.01, 0.62), 0.55, 0.04, 0.07, LAMPC, rz=rz)      # 前灯条
            rbox(B, *P(sx * W * 0.55, L + 0.01, 0.75), 0.5, 0.04, 0.06, RED, rz=rz)          # 尾灯条
        top = 2.25 if van else 1.52
        rbox(B, *P(0, -0.2 if not van else -1.2, top + 0.04), 0.9, 0.22, 0.08, DARKM, rz=rz)  # 顶灯条（熄，深色）
        rbox(B, *P(0, 0, 0.3), W * 1.6, 2 * L - 1.2, 0.05, DARKM, rz=rz)                        # 底盘
        return P(0, 0, 0)

    # ============================================================ site_ground
    G = Batch('site_ground')
    # 甲板（东侧车道挖空）
    for (x0, x1, y0, y1) in ((-170, RX0, -160, 150), (RX1, 170, -160, 150), (RX0, RX1, -160, -45), (RX0, RX1, 0, 150)):
        G.box(x0, x1, y0, y1, -1.2, -0.02, CONC)
    G.box(-170, 170, -160, 150, -9.0, -8.0, PANEL)
    G.box(-170, 170, -62, -45, -0.02, 0.0, ASPH)                       # 南侧大街
    G.box(-170, 170, -70, -62, 0.0, 0.15, PAVE)
    for x in range(-166, 170, 8):
        G.box(x, x + 4, -53.6, -53.4, 0.0, 0.012, LINE)
    for k in range(8):                                                 # 入口前横道（纯色条）
        G.box(-10 + k * 2.6, -9 + k * 2.6, -60, -47, 0.0, 0.012, LINE)
    # 前庭铺装（深色石材，带网格石缝）
    G.box(-60, RX0 - 0.5, -45, 0, 0.0, 0.3, PAVE)
    G.box(RX1 + 0.5, 62, -45, 0, 0.0, 0.3, PAVE)
    G.box(-3, 3, -45, -8, 0.3, 0.32, DSTONE)
    rg = random.Random(3)
    for _ in range(70):                                                # 不规则污渍斑
        x, y, a = rg.uniform(-58, 42), rg.uniform(-44, -1), rg.uniform(0, 3.1)
        rbox(G, x, y, 0.305, rg.uniform(0.6, 4), rg.uniform(0.3, 2), 0.01, GRIME, rz=a)
    # 塔两侧、背后人行道
    G.box(-170, -60, -45, 150, 0.0, 0.15, PAVE); G.box(100, 170, -45, 150, 0.0, 0.15, PAVE)
    G.box(-60, 100, 70, 150, 0.0, 0.12, ASPH)
    # 甲板外沿
    for (x0, x1, y0, y1) in ((-170, 170, -161, -160), (-170, 170, 150, 151), (-171, -170, -160, 150), (170, 171, -160, 150)):
        G.box(x0, x1, y0, y1, -8.0, 1.2, CONC)

    # ============================================================ walls_ext：主塔
    T = Batch('walls_ext')
    T.box(TX0 + 0.8, TX1 - 0.8, TY0 + 0.8, TY1 - 0.8, PH, TH, TWIN)            # 玻璃内胆（窗格）
    # 四角实心石墩（贯通到顶，略收分感：分三段内收）
    for (cx, cy) in ((TX0, TY0), (TX1, TY0), (TX1, TY1), (TX0, TY1)):
        sx = 1 if cx > 0 else -1; sy = 1 if cy > (TY0 + TY1) / 2 else -1
        for (z0, z1, o) in ((PH, 60, 0.0), (60, 110, 0.4), (110, TH + 4, 0.8)):
            T.box(cx - sx * 6, cx + sx * (1.6 - o), cy - sy * 6, cy + sy * (1.6 - o), z0, z1, DSTONE)
    # 竖向石鳍（每面），石带每 5 层
    FIN = 2.4
    for side in ('S', 'N', 'E', 'W'):
        if side in ('S', 'N'):
            y = TY0 if side == 'S' else TY1; d = -1 if side == 'S' else 1
            u = TX0 + 6 + FIN
            while u < TX1 - 6:
                T.box(u - 0.3, u + 0.3, y, y + d * 1.4, PH, TH, DSTONE)
                if round((u - TX0) / FIN) % 3 == 0:
                    T.box(u - 0.06, u + 0.06, y + d * 1.4, y + d * 1.45, PH + 5, TH, LEDB)
                u += FIN
            for z in range(int(PH) + 20, int(TH), 20):
                T.box(TX0 + 6, TX1 - 6, y, y + d * 1.0, z - 0.6, z + 0.6, DSTONE)
        else:
            x = TX0 if side == 'W' else TX1; d = -1 if side == 'W' else 1
            u = TY0 + 6 + FIN
            while u < TY1 - 6:
                T.box(x, x + d * 1.4, u - 0.3, u + 0.3, PH, TH, DSTONE)
                if round((u - TY0) / FIN) % 3 == 0:
                    T.box(x + d * 1.4, x + d * 1.45, u - 0.06, u + 0.06, PH + 5, TH, LEDB)
                u += FIN
            for z in range(int(PH) + 20, int(TH), 20):
                T.box(x, x + d * 1.0, TY0 + 6, TY1 - 6, z - 0.6, z + 0.6, DSTONE)
    for z in range(int(PH) + 4, int(TH), 4):                              # 楼板带 + 窗下墙
        T.box(TX0 + 0.6, TX1 - 0.6, TY0 + 0.6, TY1 - 0.6, z - 0.25, z + 0.25, GUN)
        T.box(TX0 + 0.7, TX1 - 0.7, TY0 + 0.7, TY1 - 0.7, z + 0.25, z + 0.95, DARKM)
    # 塔底石基（入台座前的深色粗面段）
    T.box(TX0 - 0.6, TX1 + 0.6, TY0 - 0.6, TY1 + 0.6, PH, PH + 5, DSTONE2)
    # 冠：内收的顶层 + 发光冠环 + 钢帽檐
    T.box(TX0 - 0.4, TX1 + 0.4, TY0 - 0.4, TY1 + 0.4, TH - 1.0, TH, GUN)
    T.box(TX0 + 1.5, TX1 - 1.5, TY0 + 1.5, TY1 - 1.5, TH, TH + 8, GLASS_C)
    for (z0, z1, o, m) in ((TH + 1.2, TH + 2.0, 1.2, CROWN), (TH + 5.2, TH + 5.8, 1.2, CROWN), (TH + 8, TH + 9.2, 0.0, GUN)):
        T.box(TX0 - o, TX1 + o, TY0 - o, TY1 + o, z0, z1, m)
    for k in range(20):                                                   # 冠部格栅竖条
        u = TX0 + 1 + k * 2.0
        for y in (TY0 - 0.2, TY1 + 0.2):
            T.box(u - 0.12, u + 0.12, y - 0.3, y + 0.3, TH, TH + 8, GUN)
        v = TY0 + 1 + k * 2.0
        for x in (TX0 - 0.2, TX1 + 0.2):
            T.box(x - 0.3, x + 0.3, v - 0.12, v + 0.12, TH, TH + 8, GUN)
    # 垂直雨痕（外墙风化）
    for i in range(40):
        side = rnd.choice('SNEW'); u = rnd.uniform(-14, 14); z1 = rnd.uniform(40, TH - 5); z0 = z1 - rnd.uniform(8, 30)
        if side in 'SN':
            y = (TY0 - 1.42) if side == 'S' else (TY1 + 1.42)
            T.box(u - 0.08, u + 0.08, y - 0.01, y + 0.01, z0, z1, GRIME)

    # ============================================================ props_podium
    Pd = Batch('props_podium')
    Pd.box(PX0, PX1, PY0 + 2, PY1, 0.0, PH, DSTONE2)
    Pd.box(PX0 - 0.5, PX1 + 0.5, PY0 + 1.5, PY1 + 0.5, PH - 1.2, PH, DSTONE)          # 檐口
    Pd.box(PX0, PX1, PY0 + 2, PY1, PH, PH + 0.1, PANEL)
    for x in range(-56, 57, 8):                                                        # 台座立面竖向窄窗
        if -30 < x < 30: continue
        Pd.box(x - 0.4, x + 0.4, PY0 + 1.95, PY0 + 2.0, 3, PH - 3, GLASS_C if rnd.random() < 0.5 else GLASS)
        Pd.box(x - 0.8, x + 0.8, PY0 + 1.6, PY0 + 2.0, PH - 3, PH - 2.6, DSTONE)
    # 玻璃大厅（外凸）：x -30..30、y -9..2、高 11
    LX0, LX1, LY0, LZ = -30.0, 30.0, -9.0, 11.0
    Pd.box(LX0 - 1, LX1 + 1, LY0 - 2.5, PY0 + 2, LZ, LZ + 1.6, GUN)                 # 大挑檐
    Pd.box(LX0 - 1, LX1 + 1, LY0 - 2.55, LY0 - 2.45, LZ + 0.2, LZ + 0.5, LAMPC)
    for x in range(int(LX0) + 2, int(LX1) - 1, 6):                                     # 檐下嵌灯
        points.append(((x, LY0 - 1.2, LZ - 0.3), 300, (0.8, 0.9, 1.0)))
    Pd.box(LX0, LX1, LY0, LY0 + 0.05, 0.3, LZ, GLASS_H)
    for (x0, x1) in ((LX0, LX0 + 0.05), (LX1 - 0.05, LX1)):
        Pd.box(x0, x1, LY0, PY0 + 2, 0.3, LZ, GLASS_H)
    for x in range(int(LX0), int(LX1) + 1, 3):
        Pd.box(x - 0.08, x + 0.08, LY0 - 0.3, LY0, 0.3, LZ, DARKM)
    for z in (4.0, 8.0):
        Pd.box(LX0, LX1, LY0 - 0.2, LY0, z - 0.06, z + 0.06, DARKM)
    Pd.box(LX0, LX1, LY0, PY0 + 2, 0.3, 0.35, DSTONE)                                  # 大厅地面
    Pd.box(LX0, LX1, LY0, PY0 + 2, LZ - 0.4, LZ, PANEL)                                # 顶棚
    for x in range(int(LX0) + 3, int(LX1), 6):
        Pd.box(x - 1.5, x + 1.5, LY0 + 1, PY0 + 1, LZ - 0.45, LZ - 0.4, LAMPC)
    points.append(((0, -3, 8), 2500, (0.8, 0.88, 1.0)))
    points.append(((-18, -3, 8), 1500, (0.8, 0.88, 1.0)))
    points.append(((18, -3, 8), 1500, (0.8, 0.88, 1.0)))
    # 18 格区域状态屏（3 行 × 6 列，纯色灯格，贴大厅后墙 y=2）
    SW0, SZ0, CW, CH = -9.0, 3.4, 3.0, 2.1
    Pd.box(SW0 - 0.6, -SW0 + 0.6, PY0 + 1.7, PY0 + 1.95, SZ0 - 0.6, SZ0 + 3 * CH + 0.6, DARKM)
    states = [3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 3, 2, 3, 1, 3, 3, 3, 3]
    for r_ in range(3):
        for c_ in range(6):
            x = SW0 + c_ * CW
            z = SZ0 + (2 - r_) * CH
            Pd.box(x + 0.22, x + CW - 0.22, PY0 + 1.6, PY0 + 1.7, z + 0.22, z + CH - 0.22, CELLS[states[r_ * 6 + c_]])
    points.append(((0, -1, 6.5), 120, (0.6, 0.8, 1.0)))
    # 后墙两侧：深色石墙 + 接待台（简单体块）
    for sx in (-1, 1):                                                  # 接待台：底座 + 挑出台面 + 高挡板 + 灯缝
        x0, x1 = sorted((sx * 14, sx * 24))
        Pd.box(x0, x1, -4.3, -3.2, 0.35, 1.0, DSTONE)
        Pd.box(x0 - 0.1, x1 + 0.1, -4.5, -3.0, 1.0, 1.08, STEEL)
        Pd.box(x0, x1, -4.55, -4.35, 1.0, 1.3, DSTONE)
        Pd.box(x0 - 0.15, x1 + 0.15, -4.65, -4.3, 1.3, 1.36, STEEL)
        Pd.box(x0, x1, -4.36, -4.34, 0.4, 0.46, LEDB)
    # 大厅内的第二道安检闸（低矮闸机）
    for x in range(-12, 13, 3):
        Pd.box(x - 0.15, x + 0.15, -6.5, -5.0, 0.35, 1.2, STEEL)
        Pd.box(x - 0.16, x + 0.16, -6.52, -6.48, 1.0, 1.1, LEDB)
    # 台座屋顶：塔周边机电、围栏
    for (x, y) in ((-45, 20), (-45, 45), (35, 62), (45, 20)):
        Pd.box(x - 5, x + 5, y - 3, y + 3, PH, PH + 3, PANEL)
        for k in range(3):
            Pd.cyl(x - 3 + k * 3, y, PH + 3, 1.1, 0.5, GUN, n=12)
    for (x0, x1, y0, y1) in ((PX0, PX1, PY0 + 2, PY0 + 2.1), (PX0, PX0 + 0.1, PY0 + 2, PY1)):
        Pd.box(x0, x1, y0, y1, PH, PH + 1.1, GLASS_H)

    # ============================================================ props_security：安检门、护柱、屏障花池、摄像头
    Se = Batch('props_security')
    WSTEEL = C.flat('eh_wedge_steel', (0.22, 0.23, 0.24), 0.55, metal=0.8, noise=0.35)
    # 入口安检门：6 座门框，前方收窄通道
    for i in range(6):
        x = -10 + i * 4.0
        Se.box(x - 1.3, x - 1.0, -14, -12.8, 0.3, 3.0, GUN)
        Se.box(x + 1.0, x + 1.3, -14, -12.8, 0.3, 3.0, GUN)
        Se.box(x - 1.3, x + 1.3, -14, -12.8, 3.0, 3.4, GUN)
        Se.box(x - 1.0, x - 0.95, -13.8, -13.0, 0.4, 2.9, LEDB)
        Se.box(x + 0.95, x + 1.0, -13.8, -13.0, 0.4, 2.9, LEDB)
        Se.box(x - 0.3, x + 0.3, -13.5, -13.3, 3.4, 3.55, CELLS[0])
    Se.box(-13, 13, -15.2, -11.6, 3.55, 3.85, GUN)                                   # 安检雨棚
    Se.box(-13, 13, -15.2, -11.6, 3.5, 3.55, LAMPC)
    for x in (-13, 13):
        for y in (-15, -11.8):
            Se.cyl(x, y, 0.3, 0.15, 3.3, GUN, n=8)
    for (x0, x1) in ((-22, -13.3), (13.3, 22)):                                        # 两翼玻璃挡板
        Se.box(x0, x1, -13.45, -13.35, 0.3, 2.2, GLASS_H)
        Se.box(x0, x1, -13.5, -13.3, 2.2, 2.3, STEEL)
    # 防撞护柱：街沿 + 前庭外缘
    for x in range(-58, 43, 2):
        if -12 < x < 12: continue
        Se.cyl(x, -44.0, 0.3, 0.2, 1.0, STEEL, n=10)
        Se.cyl(x, -44.0, 1.25, 0.21, 0.06, LEDB, n=10)
    for x in range(-11, 12, 2):                                                        # 入口前的升降柱（半升）
        Se.cyl(x, -44.0, 0.3, 0.24, 0.6 if x % 4 else 1.0, DARKM, n=12)
        Se.cyl(x, -44.0, 0.3 + (0.6 if x % 4 else 1.0), 0.245, 0.05, RED if x % 4 else LEDB, n=12)
    # 巨型花池屏障（混凝土块 + 绿篱）
    for (x, y, w) in ((-45, -34, 10), (-30, -34, 8), (30, -34, 8), (-45, -20, 10), (-26, -22, 6), (26, -22, 6), (35, -10, 6), (-40, -6, 8)):
        Se.box(x - w / 2, x + w / 2, y - 1.6, y + 1.6, 0.3, 1.3, CONC)
        Se.box(x - w / 2 + 0.2, x + w / 2 - 0.2, y - 1.4, y + 1.4, 1.3, 1.34, SOIL)
        Se.box(x - w / 2 + 0.3, x + w / 2 - 0.3, y - 1.3, y + 1.3, 1.34, 2.0, HEDGE)
        Se.box(x - w / 2, x + w / 2, y - 1.62, y - 1.6, 0.3, 0.7, GRIME)
    # 摄像头簇
    def cam_cluster(x, y, z, n=3, B=Se):
        B.cyl(x, y, z - 0.4, 0.12, 0.4, GUN, n=8)
        B.sphere(x, y, z - 0.45, 0.28, WHITE, zmin=-1.0, seg=12, rings=6)
        for k in range(n):
            a = k * math.tau / n + 0.4
            px, py = x + 0.55 * math.cos(a), y + 0.55 * math.sin(a)
            beam(B, (x, y, z - 0.2), (px, py, z - 0.2), 0.08, GUN)
            rbox(B, px, py, z - 0.35, 0.5, 0.22, 0.22, WHITE, rz=a + math.pi / 2, rx=0.35)
            B.box(px - 0.04, px + 0.04, py - 0.04, py + 0.04, z - 0.5, z - 0.46, RED)
    for (x, y) in ((-50, -40), (-20, -40), (20, -40), (50, -30), (-50, -12), (-36, -40)):
        Se.cyl(x, y, 0.3, 0.14, 7.0, GUN, n=10)
        cam_cluster(x, y, 7.4)
    for (x, y, z) in ((PX0 - 0.6, PY0 + 1.4, PH - 1.4), (PX1 + 0.6, PY0 + 1.4, PH - 1.4), (LX0 - 1, LY0 - 2.6, LZ - 0.1), (LX1 + 1, LY0 - 2.6, LZ - 0.1),
                      (TX0 - 1.5, TY0 - 1.5, 40), (TX1 + 1.5, TY0 - 1.5, 40), (TX0 - 1.5, TY0 - 1.5, 100), (TX1 + 1.5, TY0 - 1.5, 100)):
        cam_cluster(x, y, z, 4)

    # ============================================================ props_garage：下沉车道 + 地下车库闸门
    Ga = Batch('props_garage')
    ry0, ry1, rz1 = -45.0, -10.0, GZ + 0.5
    Ga.poly([(RX0, ry0, 0), (RX1, ry0, 0), (RX1, ry1, rz1), (RX0, ry1, rz1)], [(0, 1, 2, 3)], ASPH)
    Ga.box(RX0, RX1, ry1, PY0 + 6, GZ, rz1, ASPH)
    for k in range(9):                                                                 # 防滑横纹
        t = (k + 0.5) / 9; y = ry0 + (ry1 - ry0) * t; z = rz1 * t
        Ga.box(RX0 + 0.5, RX1 - 0.5, y - 0.1, y + 0.1, z, z + 0.03, LINE)
    for x in (RX0 - 0.6, RX1):                                                         # 挡墙（顶部护栏）
        Ga.box(x, x + 0.6, ry0, PY0 + 2, GZ, 1.1, DSTONE2)
        Ga.box(x + 0.25, x + 0.35, ry0, PY0 + 2, 1.1, 2.1, STEEL)
        for y in range(int(ry0), int(PY0) + 2, 3):
            Ga.box(x + 0.22, x + 0.38, y - 0.05, y + 0.05, 1.1, 2.1, STEEL)
        Ga.box(x + (0.61 if x < RX0 else -0.01), x + (0.62 if x < RX0 else 0.0), ry0 + 5, PY0, GZ + 0.5, GZ + 0.8, LEDB)
    Ga.box(RX0, RX1, ry0 + 2, ry0 + 2.3, 0.0, 0.02, HAZ)
    # 门洞：台座下的深色门楣 + 卷帘式装甲闸门（半开）+ 警示边框
    Ga.box(RX0 - 1, RX1 + 1, PY0 + 1.5, PY0 + 2.0, -0.3, 1.2, DSTONE2)
    Ga.box(RX0 - 0.6, RX1 + 0.6, PY0 + 1.5, PY0 + 2.0, GZ, -0.3, HAZ)
    Ga.box(RX0 + 0.3, RX1 - 0.3, PY0 + 1.9, PY0 + 2.2, GZ + 0.6, -0.4, GUN)
    for k in range(10):
        z = GZ + 1.0 + k * 0.45
        Ga.box(RX0 + 0.3, RX1 - 0.3, PY0 + 1.85, PY0 + 1.9, z, z + 0.05, DARKM)
    Ga.box(RX0 + 0.3, RX1 - 0.3, PY0 + 1.8, PY0 + 1.9, GZ + 0.5, GZ + 0.6, RED)
    # 车道栏杆闸 + 岗亭
    Ga.box(RX1 - 1.2, RX1 - 0.4, -30, -29.2, 0.0 + rz1 * (15 / 35), 1.1 + rz1 * (15 / 35), GUN)
    Ga.box(RX0 + 0.5, RX1 - 1.0, -29.65, -29.55, 0.9 + rz1 * (15 / 35), 1.0 + rz1 * (15 / 35), HAZ)
    Ga.box(RX1 + 1.5, RX1 + 5.5, -46, -41, 0.3, 3.2, DSTONE2)
    Ga.box(RX1 + 1.45, RX1 + 5.55, -46.05, -45.95, 1.2, 2.6, GLASS_C)
    Ga.box(RX1 + 1.2, RX1 + 5.8, -46.3, -40.7, 3.2, 3.5, GUN)
    spots.append(((RX0 + 5, PY0 - 1, 0.5), (RX0 + 5, PY0 + 2, GZ + 2), 4000, (1.0, 0.3, 0.2), 70))
    for y in (-38, -26, -14):
        points.append(((RX0 + 5, y, 2.0 + rz1 * ((y - ry0) / 35)), 200, (0.8, 0.9, 1.0)))

    # 车行边缘的防撞楔形拦阻器（入口前与车道口）
    def wedge(x, y, w):
        # 凹坑机箱：深色坑底 + 钢框沿；楔形钢板后高 0.6 m，只在后沿有细警示边
        Se.box(x - w / 2 - 0.2, x + w / 2 + 0.2, y - 1.4, y + 0.6, 0.301, 0.305, DARKM)
        for (x0, x1, y0, y1) in ((x - w / 2 - 0.3, x - w / 2 - 0.2, y - 1.4, y + 0.6), (x + w / 2 + 0.2, x + w / 2 + 0.3, y - 1.4, y + 0.6),
                                 (x - w / 2 - 0.3, x + w / 2 + 0.3, y - 1.5, y - 1.4), (x - w / 2 - 0.3, x + w / 2 + 0.3, y + 0.6, y + 0.7)):
            Se.box(x0, x1, y0, y1, 0.3, 0.34, STEEL)
        z0, z1 = 0.3, 0.9
        Se.poly([(x - w / 2, y - 1.2, z0), (x + w / 2, y - 1.2, z0), (x + w / 2, y + 0.4, z0), (x - w / 2, y + 0.4, z0),
                 (x - w / 2, y + 0.4, z1), (x + w / 2, y + 0.4, z1)],
                [(3, 2, 1, 0), (0, 1, 5, 4), (1, 2, 5), (0, 4, 3), (2, 3, 4, 5)], WSTEEL)
        Se.box(x - w / 2, x + w / 2, y + 0.3, y + 0.42, z1 - 0.08, z1 + 0.01, HAZ)
        for k in range(5):                                                 # 板面加强筋
            xx = x - w / 2 + 0.3 + k * (w - 0.6) / 4
            beam(Se, (xx, y - 1.1, z0 + 0.05), (xx, y + 0.35, z1 - 0.02), 0.06, GUN)
    for x in (-8, 0, 8):
        wedge(x, -42.2, 3.6)
    for (x, y, w) in ((-58, -41, 6), (-24, -41, 10), (24, -41, 10), (36, -41, 8)):     # 连续重型花池拦阻线
        Se.box(x - w / 2, x + w / 2, y - 0.8, y + 0.8, 0.3, 1.2, DSTONE2)
        Se.box(x - w / 2 + 0.2, x + w / 2 - 0.2, y - 0.6, y + 0.6, 1.2, 1.6, HEDGE)
    # 车库门前：岗亭 + 读卡立柱
    Se.box(RX0 - 4.5, RX0 - 1.0, PY0 - 7, PY0 - 3, 0.3, 3.2, DSTONE2)
    Se.box(RX0 - 4.55, RX0 - 0.95, PY0 - 5.8, PY0 - 4.2, 1.2, 2.6, GLASS_C)
    Se.box(RX0 - 4.8, RX0 - 0.7, PY0 - 7.3, PY0 - 2.7, 3.2, 3.5, GUN)
    for y in (-12.0, -4.0):
        zz = GZ + 0.5
        Se.box(RX0 + 1.0, RX0 + 1.4, y - 0.2, y + 0.2, zz, zz + 1.4, GUN)
        Se.box(RX0 + 1.38, RX0 + 1.42, y - 0.12, y + 0.12, zz + 1.0, zz + 1.25, LEDB)
    # ============================================================ props_dock：东翼多层悬浮车库
    Dk = Batch('props_dock')
    LV = [0.0, 7.0, 14.0, 21.0, 28.0]
    for i, z in enumerate(LV):
        Dk.box(DX0, DX1, DY0, DY1, z - (0.9 if i else 0.0), z + 0.3, CONC)
        if i:
            Dk.box(DX0, DX1, DY0 - 0.05, DY0 + 0.05, z - 0.9, z - 0.6, LEDB)             # 层板灯带
            Dk.box(DX1 - 0.05, DX1 + 0.05, DY0, DY1, z - 0.9, z - 0.6, LEDB)
            Dk.box(DX0, DX1, DY0 + 0.3, DY0 + 0.45, z - 0.9, z - 0.2, HAZ)
        if i < 4:
            for xx in range(int(DX0) + 8, int(DX1), 10):                                # 顶灯
                for yy in (DY0 + 8, DY0 + 28, DY0 + 48):
                    Dk.box(xx - 0.25, xx + 0.25, yy - 6, yy + 6, LV[i + 1] - 1.0, LV[i + 1] - 0.9, LAMPC)
                    points.append(((xx, yy, LV[i + 1] - 1.4), 700, (0.85, 0.92, 1.0)))
            for yy in range(int(DY0) + 6, int(DY1), 8):
                Dk.box(DX0 + 2, DX1 - 2, yy - 0.05, yy + 0.05, z + 0.3, z + 0.32, LINE)
    for x in (DX0 + 0.8, DX0 + 13, DX0 + 25.5, DX1 - 0.8):                             # 柱网
        for y in (DY0 + 0.8, DY0 + 20, DY0 + 40, DY1 - 0.8):
            Dk.box(x - 0.6, x + 0.6, y - 0.6, y + 0.6, 0.0, LV[-1], CONC)
    Dk.box(DX0, DX0 + 0.5, DY0, DY1, 0.0, LV[-1] + 1.2, DSTONE)                       # 与台座相接的实墙
    Dk.box(DX0, DX1, DY1 - 0.5, DY1, 0.0, LV[-1] + 1.2, DSTONE)
    for i in range(1, 5):                                                              # 东侧护栏
        z = LV[i]
        Dk.box(DX1 - 0.1, DX1, DY0, DY1, z + 0.3, z + 1.3, GLASS_H)
        Dk.box(DX1 - 0.15, DX1 + 0.05, DY0, DY1, z + 1.3, z + 1.4, STEEL)
    # 南侧起降挑台（第 2、3 层外挑）
    for z in (LV[2], LV[3]):
        Dk.box(DX0 + 4, DX1 - 4, DY0 - 12, DY0, z - 0.6, z + 0.3, PANEL)
        Dk.box(DX0 + 4, DX1 - 4, DY0 - 12.05, DY0 - 11.95, z - 0.6, z - 0.2, LAMPC)
        for x in (DX0 + 4, DX1 - 4):
            beam(Dk, (x, DY0 - 11.5, z - 0.6), (x, DY0, z - 5.5), 0.5, STEEL)
        for k in range(4):                                                             # 起降圈（纯色灯环）
            cx = DX0 + 10 + k * 6.5
            Dk.lathe(cx, DY0 - 6, z + 0.31, [(2.4, 0), (2.6, 0)], LEDB if k % 2 else LAMPC, n=24, smooth=False)
            Dk.poly([(cx + 2.6 * math.cos(a * math.tau / 24), DY0 - 6 + 2.6 * math.sin(a * math.tau / 24), z + 0.315) for a in range(24)],
                    [tuple(range(24))], DARKM)
    for z in (LV[2], LV[3]):                                                # 挑台护栏 + 进近灯带
        for x in (DX0 + 4, DX1 - 4):
            Dk.box(x - 0.05, x + 0.05, DY0 - 12, DY0, z + 0.3, z + 1.3, GLASS_H)
            Dk.box(x - 0.08, x + 0.08, DY0 - 12, DY0, z + 1.3, z + 1.4, STEEL)
        for k in range(12):
            Dk.boxc(DX0 + 19, DY0 - 13 - k * 2.5, z - 0.4, 0.5, 0.5, 0.2, LEDB if k % 2 else LAMPC)
    Dk.box(DX0, DX1 + 0.5, DY0 - 0.5, DY1 + 0.5, LV[-1] + 0.3, LV[-1] + 1.2, GUN)
    for i in range(3):                                                                 # 屋顶排风
        Dk.cyl(DX0 + 10 + i * 10, DY1 - 10, LV[-1] + 1.2, 1.8, 2.0, GUN, n=16)
    spots.append(((DX0 + 19, DY0 - 25, 36), (DX0 + 19, DY0 - 6, 14), 3e4, (0.8, 0.9, 1.0), 45))

    # ============================================================ props_vehicles
    Ve = Batch('props_vehicles')
    for i, z in enumerate(LV[:4]):
        for k, yy in enumerate(range(int(DY0) + 6, int(DY1) - 6, 8)):
            if rnd.random() < (0.05 if i == 0 else 0.3): continue
            for xx in (DX0 + 7, DX1 - 8):
                if rnd.random() < (0.1 if i == 0 else 0.35): continue
                hovercar(Ve, xx + rnd.uniform(-0.2, 0.2), yy + 4, z + 0.6, math.pi / 2 + (math.pi if xx > 80 else 0),
                         van=rnd.random() < 0.3, paint=CARP if rnd.random() < 0.6 else CARP2, lit=False)
    hovercar(Ve, DX0 + 16.5, DY0 - 6, LV[2] + 0.5, 0.0, lit=True)                       # 挑台上待命
    hovercar(Ve, DX0 + 23, DY0 - 6, LV[3] + 0.5, 0.0, van=True, lit=True)
    hovercar(Ve, 40, -30, 24.0, -0.4, lit=True)
    hovercar(Ve, DX0 + 19, DY0 - 24, 12.0, 0.0, lit=True)
    points.append(((DX0 + 19, DY0 - 24, 11.2), 300, (0.4, 0.65, 1.0)))                                        # 悬停进场
    hovercar(Ve, 110, 10, 38.0, 1.2, van=True, lit=True)
    hovercar(Ve, RX0 + 5, -20, -3.6 + 0.35, 0.0, van=True, lit=True, paint=CARP2)       # 车道上驶入车库
    hovercar(Ve, -30, -52, 0.6, math.pi / 2, lit=True)                                  # 街上
    points.append(((40, -30, 23.2), 400, (0.4, 0.65, 1.0)))
    points.append(((110, 10, 37.2), 400, (0.4, 0.65, 1.0)))

    # ============================================================ props_roof：起降坪、天线桅杆
    Rf = Batch('props_roof')
    RZ = TH + 9.2
    for (x, y) in ((-10, 26), (10, 26), (-10, 46), (10, 46)):
        Rf.cyl(x, y, RZ, 0.6, 5.0, GUN, n=10)
    PZ = RZ + 5.0
    Rf.cyl(0, 30, PZ, 15.0, 0.8, GUN, n=48, smooth=False)                              # 起降坪（向南挑出）
    Rf.cyl(0, 30, PZ + 0.8, 14.6, 0.02, PANEL, n=48, smooth=False)
    Rf.lathe(0, 30, PZ + 0.83, [(11.0, 0), (11.6, 0)], WHITE, n=48, smooth=False)
    Rf.lathe(0, 30, PZ + 0.84, [(14.3, 0), (14.6, 0)], HAZ, n=48, smooth=False)
    for i in range(24):
        a = i * math.tau / 24
        Rf.boxc(15.1 * math.cos(a), 30 + 15.1 * math.sin(a), PZ + 0.1, 0.35, 0.35, 0.35, LEDB if i % 2 else LAMP)
    Rf.lathe(0, 30, PZ + 0.2, [(15.02, 0), (15.02, 0.45)], CROWN, n=48, smooth=False)   # 坪沿灯环
    for i in range(16):                                                                # 安全网支架
        a = i * math.tau / 16
        beam(Rf, (15 * math.cos(a), 30 + 15 * math.sin(a), PZ), (16.8 * math.cos(a), 30 + 16.8 * math.sin(a), PZ + 0.4), 0.12, STEEL)
    Rf.lathe(0, 30, PZ + 0.35, [(16.8, 0), (16.9, 0.1)], STEEL, n=32, smooth=False)
    for (x, y) in ((-12, 22), (12, 22), (0, 15.5)):
        beam(Rf, (x, y, RZ), (x * 1.1, y - 3, PZ - 0.1), 0.4, STEEL)
    hovercar(Rf, 3, 28, PZ + 1.2, 0.5, lit=True)
    # 桅杆（北侧塔角，格构）
    MX, MY, MH = 12.0, 48.0, 42.0
    for (dx, dy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        beam(Rf, (MX + dx * 1.4, MY + dy * 1.4, RZ), (MX + dx * 0.3, MY + dy * 0.3, RZ + MH), 0.18, STEEL)
    for k in range(12):
        z = RZ + k * MH / 12; s = 1.4 - 1.1 * k / 12
        for (a, b) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            beam(Rf, (MX + a[0] * s, MY + a[1] * s, z), (MX + b[0] * s, MY + b[1] * s, z + MH / 12), 0.08, STEEL)
    Rf.cyl(MX, MY, RZ + MH, 0.12, 10, STEEL, n=6, r2=0.05)
    for z in (RZ + 20, RZ + 32):
        for a in (0.3, 2.4, 4.4):                                                      # 微波碟 / 面板
            px, py = MX + 1.6 * math.cos(a), MY + 1.6 * math.sin(a)
            Rf.sphere(px, py, z, 0.9, WHITE, sx=0.35, seg=12, rings=8)
    for z in (RZ + MH + 10, RZ + MH, RZ + 25):
        Rf.sphere(MX, MY, z, 0.3, RED, seg=8, rings=4)
        points.append(((MX, MY, z + 0.6), 150, (1.0, 0.1, 0.05)))
    for (x, y) in ((-12, 50), (-6, 50)):                                              # 冷却机组
        Rf.box(x - 2.5, x + 2.5, y - 2, y + 2, RZ, RZ + 2.4, PANEL)
        Rf.cyl(x, y, RZ + 2.4, 1.3, 0.4, GUN, n=14)

    # ============================================================ props_lights
    L = Batch('props_lights')
    for x in range(-150, 170, 20):
        for (y, d) in ((-64, 1), (-44.8, -1)):
            if y > -45 and -12 < x < 12: continue
            L.cyl(x, y, 0.15, 0.2, 0.5, DARKM, n=10)
            L.cyl(x, y, 0.65, 0.09, 8.4, DARKM, n=8, r2=0.06)
            L.box(x - 0.2, x + 0.2, y, y + d * 1.6, 8.8, 9.0, DARKM)
            L.box(x - 0.15, x + 0.15, y + d * 0.4, y + d * 1.5, 8.76, 8.8, LAMPC)
            points.append(((x, y + d * 1.0, 8.4), 250, (0.8, 0.9, 1.0)))
    for x in range(-56, 43, 8):                                                        # 前庭地灯（向上打台座）
        L.box(x - 0.3, x + 0.3, -1.2, -0.6, 0.3, 0.36, LAMP)
    for (x, y) in ((-50, 69), (50, 69)):
        L.box(x - 0.3, x + 0.3, y, y + 0.3, 0.3, 0.36, LAMP)
    # 台座檐口下的冷色灯带
    L.box(PX0, PX1, PY0 + 1.5, PY0 + 1.55, PH - 1.35, PH - 1.25, LAMPC)

    # ============================================================ props_signs：纯色全息面板
    S = Batch('props_signs')
    FROST = C.flat('eh_frost', (0.25, 0.28, 0.3), 0.6, emit=(0.6, 0.75, 0.9), estr=0.35)
    for (x0, x1, y0, y1, z0, z1, m) in (
            (-14, 14, TY0 - 1.6, TY0 - 1.5, PH + 9, PH + 11, HOLO[0]),           # 塔底南面横屏
            (TX1 + 1.5, TX1 + 1.6, 22, 50, 60, 78, HOLO[2]),                   # 塔东面
            (PX0 - 0.7, PX0 - 0.6, 10, 50, 5, 11, HOLO[0]),                    # 台座西端
            (DX0 + 6, DX1 - 6, DY0 - 0.4, DY0 - 0.3, LV[4] + 1.4, LV[4] + 4.4, HOLO[1]),   # 车库顶檐
            (RX0 - 0.1, RX1 + 0.1, PY0 + 1.4, PY0 + 1.45, 0.2, 1.1, HOLO[1])):  # 车库口上方红条
        S.box(x0, x1, y0, y1, z0, z1, m)
    for (x, y) in ():                                             # 前庭立式导视全息柱（无字）
        S.cyl(x, y, 0.3, 0.35, 0.4, DARKM, n=10)
        S.box(x - 0.9, x + 0.9, y - 0.03, y + 0.03, 0.8, 3.8, FROST)

    # ============================================================ bg：周边巨构 / 头顶甲板 / 高架 / 上层底面
    GLASSD = C.flat('bg_tower', (0.06, 0.07, 0.09), 0.25, metal=0.3)
    BCONC = C.flat('bg_conc', (0.28, 0.28, 0.3), 0.8, noise=0.3)
    UNDER = C.flat('bg_under', (0.13, 0.12, 0.12), 0.9, noise=0.4)
    PANES = [C.flat(f'bg_pane{i}', (0.02, 0.02, 0.03), 0.4, emit=c, estr=e) for i, (c, e) in enumerate(
        [((0.1, 0.8, 1.0), 6.0), ((1.0, 0.15, 0.6), 5.0), ((1.0, 0.6, 0.15), 5.0), ((0.5, 0.3, 1.0), 6.0)])]
    WG = [C.window_grid('bg_wg%d' % i, wall=(0.035, 0.04, 0.05), lit=c, estr=0.9, cell=(1.5, 4.0), seed=i * 7.3) for i, c in
          enumerate(((1.0, 0.8, 0.55), (0.75, 0.88, 1.0), (1.0, 0.9, 0.7)))]
    WIN = C.flat('bg_winband', (0.05, 0.05, 0.06), 0.4, emit=(1.0, 0.85, 0.6), estr=0.8)
    far = Batch('bg_deck')
    far.box(-2500, 2500, -2500, 2500, -301, -300, BCONC)
    for (x0, x1, y0, y1, z) in ((-700, -175, -700, 700, -14), (175, 700, -700, 700, -8), (-175, 175, 155, 700, -20), (-175, 175, -700, -165, -12)):
        far.box(x0, x1, y0, y1, z - 4, z, BCONC)
        far.box(x0, x1, y0, y1, z - 40, z - 4, UNDER)
    tw = Batch('bg_towers')
    rb = random.Random(11)
    placed = []; segs0 = []
    for k in range(80):
        for _ in range(60):
            a = rb.uniform(0, math.tau); d = rb.uniform(190, 700)
            x, y = math.cos(a) * d, math.sin(a) * d
            w, dd = rb.uniform(30, 70), rb.uniform(30, 70)
            if all(abs(x - px) > (w + pw) / 2 + 10 or abs(y - py) > (dd + pd) / 2 + 10 for px, py, pw, pd in placed):
                break
        placed.append((x, y, w, dd))
        if abs(math.atan2(y, x) - math.atan2(-215, -190)) < 0.35 and d < 420:
            continue                                                    # c1 视线走廊
        h = rb.uniform(120, 420)
        m = WG[k % 3] if k % 4 else GLASSD
        z = -30.0; ww, ddd = w, dd
        for seg in range(rb.randint(1, 3)):
            zt = min(z + h / (seg + 1.6), OZ)
            tw.box(x - ww / 2, x + ww / 2, y - ddd / 2, y + ddd / 2, z, zt, m)
            if seg == 0: segs0.append((x, y, ww, ddd, max(z, 0.0), zt))
            tw.box(x - ww / 2 - 1, x + ww / 2 + 1, y - ddd / 2 - 1, y + ddd / 2 + 1, zt - 1.5, zt, WIN)
            z = zt; ww *= 0.75; ddd *= 0.75
        if k % 3 == 0:
            zz = rb.uniform(20, 160)
            tw.box(x - w / 2 - 18, x + w / 2 + 18, y - dd / 2 - 18, y + dd / 2 + 18, zz, zz + 4, BCONC)
        if rb.random() < 0.6:
            pz_ = rb.uniform(30, 180); ph = rb.uniform(14, 34)
            fy_ = y - dd / 2 - 0.8 if y > 0 else y + dd / 2 + 0.5
            tw.box(x - w * 0.35, x + w * 0.35, fy_, fy_ + 0.3, pz_, pz_ + ph, PANES[k % 4])
    blk = Batch('bg_blocks')
    for (x0, x1, y0, y1) in ((-160, -75, -30, 60), (-160, -75, 80, 140), (110, 160, -30, 60), (110, 160, 80, 140),
                             (80, 160, -150, -75), (-40, 90, 85, 140)):
        h = rb.uniform(18, 40)
        blk.box(x0, x1, y0, y1, 0.0, h, WG[rb.randrange(3)])
        blk.box(x0 - 0.5, x1 + 0.5, y0 - 0.5, y1 + 0.5, h, h + 1.2, BCONC)
    ub = Batch('bg_upper')
    for (x, y, r) in ((150, 420, 200), (-420, 200, 170), (420, -80, 150), (-150, -520, 160)):
        ub.cyl(x, y, UZ, r, 90, UNDER, n=32, r2=r * 0.4)
        for i in range(10):
            a = i * math.tau / 10
            ub.boxc(x + r * 0.8 * math.cos(a), y + r * 0.8 * math.sin(a), UZ - 1, 3, 3, 1, LAMPC)
    via = Batch('bg_viaduct')
    STEELB = C.flat('bg_steel', (0.3, 0.31, 0.33), 0.4, metal=0.8)
    TRAIN = C.flat('bg_train', (0.75, 0.76, 0.78), 0.3, metal=0.4)
    for (VZ, yf) in ((32.0, lambda t: -72.0), (58.0, lambda t: 150 + t * 0.12)):
        for t in range(-700, 701, 8):
            y0 = yf(t)
            via.box(t - 4.1, t + 4.1, y0 - 3.5, y0 + 3.5, VZ, VZ + 1.8, BCONC)
            via.box(t - 4.1, t + 4.1, y0 - 0.6, y0 + 0.6, VZ + 1.8, VZ + 2.4, STEELB)
            via.box(t - 4.1, t + 4.1, y0 - 3.5, y0 - 3.3, VZ + 0.2, VZ + 0.5, LEDB)
            if t % 64 == 0:
                via.box(t - 1.5, t + 1.5, y0 - 2, y0 + 2, -30, VZ, BCONC)
    for t in range(-260, -140, 25):
        via.box(t, t + 23.5, -73.8, -70.2, 34.6, 38.4, TRAIN)
        via.box(t + 1, t + 22.5, -73.85, -70.15, 36.3, 37.3, GLASS_C)
    for t in range(-60, 120, 25):
        y0 = 150 + t * 0.12
        via.box(t, t + 23.5, y0 - 1.8, y0 + 1.8, 60.6, 64.4, TRAIN)
        via.box(t + 1, t + 22.5, y0 - 1.85, y0 + 1.85, 62.3, 63.3, GLASS_C)
    for t in range(-200, -60, 6):                                         # 列车尾迹光条（运动感）
        y0 = 150 + t * 0.12
        via.box(t, t + 4.5, y0 - 1.9, y0 - 1.8, 61.5 + (t % 3) * 0.2, 61.7 + (t % 3) * 0.2, LEDB)
    MUL = C.flat('bg_mullion', (0.02, 0.022, 0.025), 0.4, metal=0.6)
    cam1 = Vector((-190.0, -215.0))
    for (x, y, ww, dd, z0, z1) in sorted(segs0, key=lambda t: (Vector((t[0], t[1])) - cam1).length)[:4]:
        for (fy, fx) in ((y - dd / 2, None), (None, x - ww / 2), (None, x + ww / 2), (y + dd / 2, None)):
            if fy is not None and abs(fy - cam1.y) > abs(y - cam1.y): continue
            if fx is not None and abs(fx - cam1.x) > abs(x - cam1.x): continue
            if fy is not None:
                o = -0.35 if fy < y else 0.35
                u = x - ww / 2
                while u <= x + ww / 2:
                    tw.box(u - 0.1, u + 0.1, fy, fy + o, z0, z1, MUL); u += 1.5
                zz = z0
                while zz <= z1:
                    tw.box(x - ww / 2, x + ww / 2, fy, fy + o * 1.2, zz - 0.3, zz + 0.3, MUL); zz += 4.0
            else:
                o = -0.35 if fx < x else 0.35
                u = y - dd / 2
                while u <= y + dd / 2:
                    tw.box(fx, fx + o, u - 0.1, u + 0.1, z0, z1, MUL); u += 1.5
                zz = z0
                while zz <= z1:
                    tw.box(fx, fx + o * 1.2, y - dd / 2, y + dd / 2, zz - 0.3, zz + 0.3, MUL); zz += 4.0
    HA = [C.holo('bg_ad%d' % i, c1, c2, 4.0, 0.7) for i, (c1, c2) in enumerate(
        (((1.0, 0.2, 0.6), (0.5, 0.1, 0.9)), ((0.1, 0.9, 0.8), (0.1, 0.4, 1.0)), ((1.0, 0.6, 0.1), (1.0, 0.25, 0.1))))]
    for k, (x, y, w, dd) in enumerate(placed[:40:3]):
        fy_ = y - dd / 2 - 1.5 if y > 0 else y + dd / 2 + 1.2
        z0 = rb.uniform(40, 150)
        tw.box(x - w * 0.3, x + w * 0.3, fy_, fy_ + 0.1, z0, z0 + rb.uniform(18, 40), HA[k % 3])
    ov = Batch('bg_overhead')
    for (x0, x1, y0, y1) in ((-900, -110, -900, 900), (140, 900, -900, 900), (-110, 140, 150, 900), (-110, 140, -900, -200)):
        ov.box(x0, x1, y0, y1, OZ, OZ + 8, UNDER)
    for k in range(-20, 21):
        g = k * 45.0
        if not (-110 < g < 140):
            ov.box(g - 1.5, g + 1.5, -900, 900, OZ - 7, OZ, BCONC)
        if not (-200 < g < 150):
            ov.box(-900, 900, g - 1.5, g + 1.5, OZ - 7, OZ, BCONC)
    for (y, z) in ((-260, 185), (190, 200)):
        ov.box(-500, 500, y - 3, y + 3, z, z + 1.2, STEELB)
        ov.box(-500, 500, y - 3, y + 3, z + 12, z + 13.2, STEELB)
        for t in range(-500, 500, 12):
            for yy in (y - 3, y + 3):
                beam(ov, (t, yy, z + 0.6), (t + 6, yy, z + 12.6), 0.7, STEELB)
                beam(ov, (t + 6, yy, z + 12.6), (t + 12, yy, z + 0.6), 0.7, STEELB)
        ov.box(-500, 500, y - 3.1, y - 3.0, z - 0.2, z, LEDB)
    for i in range(220):
        x, y = rb.uniform(-700, 700), rb.uniform(-700, 700)
        if -110 < x < 140 and -200 < y < 150:
            continue
        ov.boxc(x, y, OZ - 7.6, 4, 4, 0.6, rb.choice([LAMP, LAMPC, LAMPC]))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光
    w = bpy.data.worlds.new('w'); sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    wo = nt.nodes.new('ShaderNodeOutputWorld'); wo.name = 'World Output'
    bgn = nt.nodes.new('ShaderNodeBackground')
    bgn.inputs[0].default_value = (0.05, 0.05, 0.07, 1); bgn.inputs[1].default_value = 1.0
    nt.links.new(bgn.outputs[0], wo.inputs[0])
    vs = nt.nodes.new('ShaderNodeVolumePrincipled')
    vs.inputs['Color'].default_value = (0.55, 0.6, 0.7, 1); vs.inputs['Density'].default_value = 0.0012
    nt.links.new(vs.outputs[0], wo.inputs['Volume'])
    sc.cycles.volume_bounces = 0; sc.cycles.volume_step_rate = 4.0
    ld = bpy.data.lights.new('fill', 'AREA'); ld.energy = 8e4; ld.size = 200; ld.color = (0.7, 0.8, 1.0)
    o = bpy.data.objects.new('fill', ld); sc.collection.objects.link(o); o.location = (0, -40, 200)
    for (x, y) in ((-300, 0), (300, 0), (0, 300), (0, -350)):
        ld = bpy.data.lights.new('under', 'AREA'); ld.energy = 3e5; ld.size = 250; ld.color = (0.75, 0.82, 1.0)
        o = bpy.data.objects.new('under', ld); sc.collection.objects.link(o); o.location = (x, y, OZ - 15)
    cool = (0.75, 0.85, 1.0)
    for (p, t, e, ang) in (((-30, -44, 0.5), (-14, TY0 - 2, 90), 1.2e5, 14), ((30, -44, 0.5), (14, TY0 - 2, 90), 1.2e5, 14),
                           ((-50, -8, 0.5), (-50, 2, 12), 1.5e4, 40), ((50, -8, 0.5), (50, 2, 12), 1.5e4, 40),
                           ((0, -30, 12), (0, -14, 0), 2e4, 60)):
        C.spot_light('flood', p, t, e, cool, ang, 0.4)
    for (p, t) in (((-60, -60, 2), (-20, 16, 120)), ((80, -40, 2), (20, 16, 120))):
        C.spot_light('wash', p, t, 1.5e5, (0.8, 0.88, 1.0), 12, 0.5)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.15)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.5

    CAMS = {
        'c1': ((-190.0, -215.0, 175.0), (15.0, 15.0, 80.0), 24, 0.0),
        'c2': ((6.0, -50.0, 1.7), (0.0, 0.0, 7.0), 24, 0.0),
        'c4': ((58.0, -58.0, 8.0), (72.0, -10.0, 11.0), 20, 0.0),
        'c3': ((56.0, -40.0, 4.0), (70.0, 10.0, 6.0), 20, 0.0),
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
