"""首相府（方案 A：唐宁街式街面）：乔治时代深色砖联排（三层 + 阁楼）、黑色镶板门 + 扇形气窗、门上铸铁灯笼、
白框推拉窗、采光井铸铁栏杆、烟囱排、街口铁门 + 岗亭；花园一侧是白色灰泥柱廊（卡尔顿府联排式）。
全部自建；中立建筑，无门牌号、无文字、无徽记。坐标：x 沿街，街道在 +y，花园在 -y，首相府正门立面 y = 0。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/pm_residence/build.py', run_name='__main__')" \
      -- --cam c1 --res 1000 --samples 32 --out /tmp/pm.jpg [--blend /tmp/pm.blend] [--log /tmp/pm.log]
cam: c1 街面斜俯（主图）/ c2 正门近景 / c3 花园柱廊
"""
import math, os, sys, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='day', res='1000', samples='32', out='/tmp/pm.jpg', blend='', log='', exposure=''))

# 布局（米）
HOUSES = [(-19.5, -7.5, 4), (-7.5, 7.5, 5), (7.5, 19.5, 4)]   # x0, x1, 开间数；中间一栋是首相府
DEPTH = 14.0
PLINTH = 0.6                        # 首层地坪高出人行道
FLOORS = [(PLINTH, 4.2, 2.5), (4.8, 4.2, 2.9), (9.0, 3.4, 2.1)]   # 各层 (底, 层高, 窗高)
CORNICE = 12.4
PARAPET = 13.3
AREA = 1.8                          # 采光井宽（地下室前）
PAVE_Y = (AREA, 5.0)
ROAD_Y = (5.0, 13.0)
PM_DOOR_BAY = 1                     # 首相府正门在第 2 开间（偏心，唐宁街式）
GATE_X = -30.0


def main():
    import bpy
    from mathutils import Vector, Matrix
    sc = C.setup(A['samples'])
    Batch = C.Batch

    BRICK = C.pbr('brick', 'dark_brick_wall', 2.0, tint=(0.55, 0.5, 0.48), value=0.75, sat=0.5, weather=0.35)
    STUCCO = C.pbr('stucco', 'white_stucco', 2.5, tint=(0.97, 0.96, 0.93), value=1.0, sat=0.3)
    PORT = C.flat('portland', (0.82, 0.8, 0.75), 0.6, noise=0.15)          # 波特兰石窗台 / 线脚
    WHITE = C.flat('white_paint', (0.88, 0.88, 0.86), 0.35)
    BLACK = C.flat('black_gloss', (0.012, 0.012, 0.014), 0.12, coat=0.8)     # 黑漆门
    IRON = C.flat('iron', (0.02, 0.02, 0.022), 0.45, metal=0.5)
    BRASS = C.flat('brass', (0.85, 0.65, 0.3), 0.25, metal=1.0)
    GLASS = C.glass('glass', tint=(0.05, 0.06, 0.07))
    LAMPG = C.flat('lamp_glass', (0.9, 0.85, 0.7), 0.15)
    SLATE = C.pbr('slate', 'roof_slates_02', 2.5, tint=(0.75, 0.78, 0.82), sat=0.5)
    LEADF = C.flat('lead_flash', (0.3, 0.32, 0.34), 0.5, metal=0.3)
    POT = C.flat('chimney_pot', (0.5, 0.28, 0.2), 0.8, noise=0.2)
    ASPH = C.pbr('asphalt', 'asphalt_02', 4.0, tint=(0.75, 0.75, 0.77), sat=0.3)
    FLAG = C.pbr('flags', 'patterned_paving', 2.5, tint=(0.9, 0.88, 0.85), sat=0.4)
    KERB = C.flat('kerb', (0.55, 0.55, 0.53), 0.8, noise=0.2)
    GRASS = C.pbr('grass', 'grass_ground', 4.0, tint=(0.85, 0.95, 0.8))
    GRAVEL = C.pbr('gravel_path', 'precast_stone_paving', 2.0, tint=(0.9, 0.86, 0.78), sat=0.5)
    BARK = C.flat('bark', (0.18, 0.14, 0.11), 0.9, noise=0.4)
    LEAF = C.flat('leaf', (0.12, 0.2, 0.08), 0.8, noise=0.45)

    def T(u, v=0.0, n=0.0):
        return Matrix.Translation((u, v, n))

    def rect(u0, u1, v0, v1):
        return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]

    W = Batch('walls_ext'); R = Batch('roof'); DR = Batch('props_door'); RL = Batch('props_railings')
    CH = Batch('props_chimneys'); GT = Batch('props_gate'); CO = Batch('props_colonnade')
    site = Batch('site_ground'); GD = Batch('site_garden')

    def sash(B, M, w, h):
        """白框推拉窗：外框 + 上下两扇（中横档）+ 六格窗棂 ×2，石窗台，砖平拱"""
        M = M @ T(0, 0, 0.13)   # 墙是实心体块：整樘窗往外放 13 cm，玻璃面贴在墙皮外
        C.slab2d(B, M, rect(-w / 2, w / 2, 0, h), -0.12, -0.08, GLASS)
        C.frame2d(B, M, rect(-w / 2, w / 2, 0, h), 0.1, -0.12, 0.0, WHITE)
        C.slab2d(B, M, rect(-w / 2, w / 2, h / 2 - 0.04, h / 2 + 0.04), -0.1, -0.02, WHITE)
        for f in (1 / 3, 2 / 3):
            C.slab2d(B, M, rect(-w / 2 + f * w - 0.02, -w / 2 + f * w + 0.02, 0, h), -0.1, -0.06, WHITE)
        for f in (0.25, 0.75):
            C.slab2d(B, M, rect(-w / 2, w / 2, f * h - 0.02, f * h + 0.02), -0.1, -0.06, WHITE)
        C.slab2d(B, M, rect(-w / 2 - 0.12, w / 2 + 0.12, -0.12, 0.0), -0.1, 0.12, PORT)          # 窗台
        C.slab2d(B, M, [(-w / 2 - 0.25, h), (w / 2 + 0.25, h), (w / 2 + 0.15, h + 0.38), (-w / 2 - 0.15, h + 0.38)], -0.02, 0.03,
                 C.flat('gauged_brick', (0.2, 0.12, 0.09), 0.8, noise=0.2) if 'gauged_brick' not in bpy.data.materials else bpy.data.materials['gauged_brick'])

    def railing(B, x0, x1, y, h=1.05, gap=None):
        B.box(x0, x1, y - 0.04, y + 0.04, h - 0.06, h, IRON)
        B.box(x0, x1, y - 0.04, y + 0.04, 0.12, 0.18, IRON)
        n = int((x1 - x0) / 0.13)
        for i in range(n + 1):
            x = x0 + i * (x1 - x0) / n
            if gap and gap[0] < x < gap[1]:
                continue
            B.boxc(x, y, 0, 0.025, 0.025, h + 0.06, IRON)
            B.cyl(x, y, h + 0.06, 0.03, 0.14, IRON, 4, r2=0.0, smooth=False)   # 矛头
        for x in (x0, x1):
            B.boxc(x, y, 0, 0.1, 0.1, h + 0.1, IRON)
            B.sphere(x, y, h + 0.18, 0.07, IRON, seg=8, rings=5)

    # ------------------------------------------------------------ 街道 / 场地
    site.box(-60, 45, -60, 40, -3.2, -0.02, ASPH)
    site.box(-60, 45, ROAD_Y[0], ROAD_Y[1], -0.12, -0.02, ASPH)
    site.box(-60, 45, PAVE_Y[0], PAVE_Y[1], -0.02, 0.12, FLAG)
    site.box(-60, 45, PAVE_Y[1] - 0.3, PAVE_Y[1], -0.12, 0.13, KERB)
    site.box(-60, 45, ROAD_Y[1], ROAD_Y[1] + 3.5, -0.02, 0.12, FLAG)
    site.box(-60, 45, ROAD_Y[1], ROAD_Y[1] + 0.3, -0.12, 0.13, KERB)
    site.box(-19.5, 19.5, 0, AREA, -2.6, -2.4, FLAG)                          # 采光井底
    Batch('bg_far').box(-1500, 1500, -1500, 1500, -3.6, -3.25, ASPH)   # 远处地面（挡住地平线下的天空）

    # ------------------------------------------------------------ 联排（三栋）
    for hi, (x0, x1, nb) in enumerate(HOUSES):
        pm = hi == 1
        W.box(x0, x1, -DEPTH, 0, -2.6, CORNICE, BRICK)
        W.box(x0, x1, -0.3, 0.02, -2.6, 0.0, C.flat('area_render', (0.72, 0.7, 0.66), 0.8, noise=0.2) if 'area_render' not in bpy.data.materials else bpy.data.materials['area_render'])
        W.box(x0 - 0.02, x1 + 0.02, -DEPTH - 0.05, 0.05, PLINTH - 0.05, PLINTH + 0.15, PORT)   # 首层线脚
        W.box(x0 - 0.05, x1 + 0.05, -DEPTH - 0.3, 0.3, CORNICE - 0.1, CORNICE + 0.35, WHITE)   # 白色檐口
        W.box(x0, x1, -DEPTH, 0, CORNICE + 0.35, PARAPET, BRICK)
        W.box(x0 - 0.02, x1 + 0.02, -DEPTH - 0.05, 0.05, PARAPET, PARAPET + 0.12, PORT)
        # 阁楼：女儿墙后的复斜板岩顶 + 老虎窗
        R.poly([(x0, -0.9, PARAPET - 0.3), (x1, -0.9, PARAPET - 0.3), (x1, -2.6, PARAPET + 2.7), (x0, -2.6, PARAPET + 2.7)], [(3, 2, 1, 0)], SLATE)
        R.poly([(x0, -DEPTH + 0.9, PARAPET - 0.3), (x1, -DEPTH + 0.9, PARAPET - 0.3), (x1, -DEPTH + 2.6, PARAPET + 2.7), (x0, -DEPTH + 2.6, PARAPET + 2.7)], [(0, 1, 2, 3)], SLATE)
        R.box(x0, x1, -DEPTH + 2.6, -2.6, PARAPET + 2.6, PARAPET + 2.75, LEADF)
        bw = (x1 - x0) / nb
        for i in range(nb):
            xc = x0 + (i + 0.5) * bw
            for (y, s) in ((0.0, 1), (-DEPTH, -1)):
                for f, (z0, fh, wh) in enumerate(FLOORS):
                    if s > 0 and f == 0 and i == (PM_DOOR_BAY if pm else (0 if hi == 0 else nb - 1)):
                        continue
                    if s < 0 and f == 0:
                        continue   # 背面首层：灰泥柱廊
                    wz = z0 + (0.25 if f else 0.55)
                    sash(W, C.wall_frame((xc, y, wz), (0, s, 0)), 1.25 if f < 2 else 1.15, wh)
                # 地下室窗（采光井里）
                if s > 0:
                    sash(W, C.wall_frame((xc, -0.3 + 0.001, -2.0), (0, 1, 0)), 1.1, 1.3)
            # 老虎窗
            dy = -1.9
            R.box(xc - 0.8, xc + 0.8, dy - 0.9, dy + 0.1, PARAPET + 0.2, PARAPET + 1.9, LEADF)
            R.gable(xc - 0.95, xc + 0.95, dy - 1.0, dy + 0.25, PARAPET + 1.9, 0.5, LEADF, 'y')
            sash(W, C.wall_frame((xc, dy + 0.1, PARAPET + 0.45), (0, 1, 0)), 0.9, 1.2)
        # 正门：黑色六镶板门 + 白色门套（壁柱 + 檐部）+ 半圆扇形气窗 + 门环 + 铸铁灯笼
        di = PM_DOOR_BAY if pm else (0 if hi == 0 else nb - 1)
        dx = x0 + (di + 0.5) * bw
        M = C.wall_frame((dx, 0.0, PLINTH), (0, 1, 0)) @ T(0, 0, 0.21)
        dw, dh = 1.2, 2.6
        C.slab2d(DR, M, rect(-dw / 2, dw / 2, 0, dh), -0.2, -0.12, BLACK)
        for (u0, u1, v0, v1) in ((-0.48, -0.06, 0.15, 0.85), (0.06, 0.48, 0.15, 0.85), (-0.48, -0.06, 1.0, 1.55), (0.06, 0.48, 1.0, 1.55), (-0.48, -0.06, 1.7, 2.45), (0.06, 0.48, 1.7, 2.45)):
            C.frame2d(DR, M, rect(u0, u1, v0, v1), 0.05, -0.12, -0.09, BLACK)
        C.frame2d(DR, M, rect(-dw / 2, dw / 2, 0, dh), 0.08, -0.2, -0.05, WHITE)
        fan = [(-dw / 2, dh), (dw / 2, dh)] + [(dw / 2 * math.cos(k * math.pi / 12), dh + dw / 2 * math.sin(k * math.pi / 12)) for k in range(1, 12)]
        C.slab2d(DR, M, fan, -0.2, -0.16, GLASS)
        for k in range(1, 6):   # 扇形气窗的放射窗棂
            a = k * math.pi / 6
            C.slab2d(DR, M @ T(0, dh) @ Matrix.Rotation(a - math.pi / 2, 4, 'Z'), rect(-0.015, 0.015, 0.0, dw / 2), -0.17, -0.12, WHITE)
        C.frame2d(DR, M, fan, 0.07, -0.18, -0.05, WHITE)
        for s in (-1, 1):   # 壁柱 + 檐部
            C.slab2d(DR, M, rect(s * (dw / 2 + 0.28) - 0.14, s * (dw / 2 + 0.28) + 0.14, 0, dh + 0.7), 0.0, 0.15, WHITE)
        C.slab2d(DR, M, rect(-dw / 2 - 0.55, dw / 2 + 0.55, dh + 0.7, dh + 1.0), 0.0, 0.3, WHITE)
        C.slab2d(DR, M, rect(-dw / 2 - 0.65, dw / 2 + 0.65, dh + 1.0, dh + 1.12), 0.0, 0.38, WHITE)
        p = M @ Vector((0, 1.45, -0.05))
        DR.tube([(p.x, p.y - 0.001, p.z + 0.09), (p.x, p.y + 0.06, p.z), (p.x, p.y - 0.001, p.z - 0.09)], 0.012, BRASS, n=6)  # 门环（只做环，不做兽首）
        DR.cyl(p.x + 0.35, p.y - 0.08, p.z - 0.4, 0.03, 0.05, BRASS, 8) if False else None
        # 门前台阶（跨过采光井的小桥）
        site.box(dx - 1.0, dx + 1.0, 0, AREA, PLINTH - 0.2, PLINTH, PORT)
        for k in range(3):
            site.box(dx - 1.1, dx + 1.1, AREA + 0.3 * k, AREA + 0.3 * (k + 1), 0.12, PLINTH - 0.16 * (k + 1), PORT)
        railing(RL, x0 + 0.05, x1 - 0.05, AREA, gap=(dx - 1.05, dx + 1.05))
        for s in (-1, 1):
            RL.box(dx + s * 1.0 - 0.02, dx + s * 1.0 + 0.02, 0.05, AREA, PLINTH + 0.95, PLINTH + 1.0, IRON)
            for k in range(8):
                RL.boxc(dx + s * 1.0, 0.1 + k * (AREA - 0.1) / 7, PLINTH - 0.2, 0.025, 0.025, 1.15, IRON)
        if pm:
            # 门上方的铸铁灯笼（弯臂架）
            lp = M @ Vector((0, dh + 1.35, 0.9))
            wp = M @ Vector((0, dh + 1.45, 0.0))
            DR.tube([(wp.x, wp.y, wp.z), (wp.x, wp.y + 0.4, wp.z + 0.25), (lp.x, lp.y, lp.z + 0.55)], 0.03, IRON, n=6)
            DR.boxc(lp.x, lp.y, lp.z - 0.4, 0.42, 0.42, 0.7, LAMPG)
            for (ex, ey) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                DR.boxc(lp.x + ex * 0.21, lp.y + ey * 0.21, lp.z - 0.42, 0.04, 0.04, 0.74, IRON)
            DR.pyramid(lp.x, lp.y, lp.z + 0.3, 0.55, 0.55, 0.3, IRON)
            DR.boxc(lp.x, lp.y, lp.z - 0.48, 0.5, 0.5, 0.08, IRON)
            DR.sphere(lp.x, lp.y, lp.z + 0.65, 0.06, IRON, seg=8, rings=5)
    # 烟囱排（分户墙上）
    for xw in (-19.5, -7.5, 7.5, 19.5):
        for yy in (-4.0, -10.0):
            CH.boxc(xw, yy, PARAPET - 1, 1.3, 3.2, 5.2, BRICK)
            CH.boxc(xw, yy, PARAPET + 4.2, 1.5, 3.4, 0.25, PORT)
            for k in (-1, 0, 1):
                CH.cyl(xw, yy + k * 1.0, PARAPET + 4.45, 0.2, 0.75, POT, 10, r2=0.15)
    # 分户墙处的落水管
    for xw in (-19.5, -7.5, 7.5, 19.5):
        W.cyl(xw + 0.35, 0.12, -2.4, 0.06, CORNICE + 2.4, IRON, 8)

    # ------------------------------------------------------------ 花园一侧：白色灰泥柱廊 + 阳台栏杆
    cy0 = -DEPTH
    CO.box(-19.5, 19.5, cy0 - 4.2, cy0, -0.02, PLINTH + 0.4, STUCCO)                     # 台基
    for k in range(3):
        CO.box(-4.0, 4.0, cy0 - 4.2 - 0.35 * (k + 1), cy0 - 4.2 - 0.35 * k, -0.02, PLINTH + 0.4 - 0.33 * (k + 1), STUCCO)
    W.box(-19.5, 19.5, cy0 - 0.02, cy0 + 0.1, PLINTH, 4.8, STUCCO)                          # 背面首层抹灰
    ncol = 14
    for k in range(ncol):
        x = -18.2 + k * 36.4 / (ncol - 1)
        y = cy0 - 3.6
        CO.boxc(x, y, PLINTH + 0.4, 0.95, 0.95, 0.3, STUCCO)
        CO.cyl(x, y, PLINTH + 0.7, 0.38, 3.35, STUCCO, 16, r2=0.32)
        CO.cyl(x, y, PLINTH + 4.05, 0.33, 0.14, STUCCO, 16, r2=0.5)
        CO.boxc(x, y, PLINTH + 4.19, 0.95, 0.95, 0.16, STUCCO)
    ez = PLINTH + 4.35
    CO.box(-19.3, 19.3, cy0 - 4.1, cy0, ez, ez + 0.55, STUCCO)                            # 檐部
    CO.box(-19.5, 19.5, cy0 - 4.3, cy0, ez + 0.55, ez + 0.75, STUCCO)
    for k in range(int(38 / 0.4)):                                                        # 阳台栏杆（宝瓶柱）
        x = -19.0 + k * 0.4
        CO.lathe(x, cy0 - 4.05, ez + 0.85, [(0.07, 0), (0.12, 0.15), (0.06, 0.45), (0.08, 0.6)], STUCCO, n=8)
    CO.box(-19.5, 19.5, cy0 - 4.25, cy0 - 3.85, ez + 0.75, ez + 0.85, STUCCO)
    CO.box(-19.5, 19.5, cy0 - 4.25, cy0 - 3.85, ez + 1.45, ez + 1.6, STUCCO)
    for i in range(12):   # 柱廊后的落地窗
        x = -17.5 + i * 35.0 / 11
        M = C.wall_frame((x, cy0, PLINTH + 0.4), (0, -1, 0))
        C.slab2d(CO, M, rect(-0.7, 0.7, 0, 2.9), -0.02, 0.02, GLASS)
        C.frame2d(CO, M, rect(-0.7, 0.7, 0, 2.9), 0.09, -0.02, 0.08, WHITE)
        C.slab2d(CO, M, rect(-0.03, 0.03, 0, 2.9), -0.02, 0.06, WHITE)

    # ------------------------------------------------------------ 花园：草坪、砾石路、树、砖围墙
    gy0, gy1 = -52.0, cy0 - 4.2
    GD.box(-24, 24, gy0, gy1, -0.02, 0.04, GRASS)
    GD.box(-3.0, 3.0, gy0, gy1 - 1.2, 0.0, 0.07, GRAVEL)
    GD.box(-20, 20, gy1 - 3.0, gy1 - 1.2, 0.0, 0.07, GRAVEL)
    for (x0, x1, y0, y1) in ((-24.3, -24.0, gy0, gy1), (24.0, 24.3, gy0, gy1), (-24.3, 24.3, gy0 - 0.3, gy0)):
        GD.box(x0, x1, y0, y1, 0, 2.8, BRICK)
        GD.box(x0 - 0.08, x1 + 0.08, y0 - (0.08 if y1 - y0 < 1 else 0), y1 + (0.08 if y1 - y0 < 1 else 0), 2.8, 2.95, PORT)
    import random
    rnd = random.Random(3)
    for (x, y, h, r) in ((-15, -36, 9, 3.8), (-9, -46, 7, 3.0), (14, -40, 10, 4.2), (18, -26, 6, 2.6)):
        GD.cyl(x, y, 0, 0.32, h * 0.6, BARK, 10, r2=0.2)
        for k in range(7):
            a = rnd.uniform(0, math.tau); d = rnd.uniform(0, r * 0.55)
            GD.sphere(x + d * math.cos(a), y + d * math.sin(a), h * 0.62 + rnd.uniform(0, h * 0.35), r * rnd.uniform(0.5, 0.75), LEAF, seg=12, rings=8)
    for x in (-10, -6, 6, 10):   # 修剪的矮树篱
        GD.box(x - 1.5, x + 1.5, gy1 - 8, gy1 - 7.2, 0, 0.9, LEAF)

    # ------------------------------------------------------------ 街口铁门 + 岗亭 + 街灯
    gx = GATE_X
    for (y0, y1) in ((PAVE_Y[0] - 1.8, ROAD_Y[1] + 3.5),):
        n = int((y1 - y0) / 0.16)
        for i in range(n + 1):
            y = y0 + i * (y1 - y0) / n
            GT.boxc(gx, y, 0, 0.035, 0.035, 3.0, IRON)
            GT.cyl(gx, y, 3.0, 0.045, 0.2, IRON, 4, r2=0.0, smooth=False)
        for z in (0.3, 1.5, 2.7):
            GT.box(gx - 0.05, gx + 0.05, y0, y1, z, z + 0.08, IRON)
        for y in (y0, PAVE_Y[1] - 0.1, ROAD_Y[1] + 0.2, y1):
            GT.boxc(gx, y, 0, 0.45, 0.45, 3.4, IRON)
            GT.pyramid(gx, y, 3.4, 0.55, 0.55, 0.35, IRON)
    for y in (ROAD_Y[0] + 1.5, ROAD_Y[0] + 4, ROAD_Y[1] - 1.5):   # 路障桩
        GT.cyl(gx + 2.0, y, 0, 0.14, 0.9, IRON, 10)
    sbx, sby = gx - 3.0, PAVE_Y[0] + 1.0   # 岗亭（黑漆木岗亭 + 板岩四坡顶）
    GT.box(sbx - 0.75, sbx + 0.75, sby - 0.75, sby + 0.75, 0.12, 2.5, BLACK)
    GT.box(sbx - 0.6, sbx + 0.6, sby - 0.78, sby - 0.7, 0.3, 2.2, C.flat('booth_inside', (0.05, 0.05, 0.05), 0.9))
    GT.pyramid(sbx, sby, 2.5, 1.8, 1.8, 0.7, SLATE)
    GT.box(sbx - 0.85, sbx + 0.85, sby - 0.85, sby + 0.85, 2.45, 2.55, WHITE)
    for x in (-25, 0, 25):   # 铸铁街灯
        GT.cyl(x, PAVE_Y[1] - 0.6, 0.12, 0.16, 0.5, IRON, 10)
        GT.cyl(x, PAVE_Y[1] - 0.6, 0.6, 0.07, 3.4, IRON, 8, r2=0.05)
        GT.cyl(x, PAVE_Y[1] - 0.6, 4.0, 0.22, 0.6, LAMPG, 6, r2=0.3, smooth=False)
        GT.cyl(x, PAVE_Y[1] - 0.6, 4.6, 0.36, 0.25, IRON, 6, r2=0.02, smooth=False)

    Batch.build_all()
    C.sky_sun(sc, 'day', sun_az=65.0, sun_el=38.0)
    sc.view_settings.exposure = -0.2
    if A['exposure']:
        sc.view_settings.exposure = float(A['exposure'])
    CAMS = {
        'c1': ((-44, 38, 17), (-2, -2, 6), 30),
        'c2': ((-7.0, 10.5, 1.7), (-3.0, 0, 3.2), 32),
        'c3': ((-26, -46, 12), (0, -16, 4), 28),
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
