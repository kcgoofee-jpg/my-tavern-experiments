"""首相府（方案 A：唐宁街式街面）：乔治时代深色伦敦砖联排（三栋各自独立：分户墙砖垛、檐口高差、各自一樘门），
三层 + 阁楼（女儿墙后藏屋顶，每栋 1–2 个退进老虎窗）；黑色镶板门 + 扇形气窗 + 多立克门套 + 冷光灯笼；
6/6 推拉窗（主层最高、往上递减）、砖平拱、石窗台、0.1 m 窗洞进深；采光井石基座 + 1.1 m 铸铁栏杆；
分户墙上的高烟囱（每组 4–8 个烟囱帽）；私家短引道 + 铁门（石门墩）+ 岗亭；花园一侧白色灰泥柱廊。
场地：天空城上层的一座浮空岛——岛缘有石砌护沿，岛下是岩石底座，远处是云海和另一座浮岛；岛缘外挑一座官方停靠平台（悬浮车）。
全部自建；中立建筑，无门牌号、无文字、无徽记。坐标：x 沿街，街道在 +y，花园在 -y，首相府正门立面 y = 0。
bg_* 对象（云海、岩石底座、远处浮岛、岛缘屏障微光）只为渲染，export_glb.py 不导出。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/pm_residence/build.py', run_name='__main__')" \
      -- --cam c1 --res 1000 --samples 32 --out /tmp/pm.jpg [--blend /tmp/pm.blend] [--log /tmp/pm.log]
cam: c1 引道斜俯（主图，含停靠平台与岛缘）/ c2 正门近景 / c3 花园柱廊（岛缘外看回）
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='day', res='1000', samples='32', out='/tmp/pm.jpg', blend='', log='', exposure=''))

# 布局（米）
# x0, x1, 开间数, 檐口高差, 门所在开间；中间一栋是首相府
HOUSES = [(-19.5, -7.5, 4, 0.0, 0), (-7.5, 7.5, 5, 0.55, 1), (7.5, 19.5, 4, 0.25, 3)]
DEPTH = 14.0
PLINTH = 0.6                        # 首层地坪高出人行道
# 各层 (窗台高, 窗宽, 窗高)：首层 / 主层（piano nobile，约 1:2）/ 二层（约 1:1.6）/ 三层（近方）
FLOORS = [(PLINTH + 0.75, 1.15, 2.15), (5.0, 1.2, 2.45), (9.05, 1.15, 1.85), (12.0, 1.1, 1.15)]
CORNICE = 13.9
PARA_H = 1.05                       # 檐口上的女儿墙
SKIN = 0.22                         # 立面砖皮厚（窗洞进深 = 窗退进）
AREA = 1.8                          # 采光井宽（地下室前）
PAVE_Y = (AREA, 4.6)
ROAD_Y = (4.6, 10.6)                # 私家引道，6 m
FAR_PAVE = (10.6, 12.6)
GATE_X = -30.0
# 浮岛：超椭圆轮廓
ISL_C = (-4.0, -17.0); ISL_R = (37.0, 36.0); ISL_P = 4.0
DOCK = (-60.0, -40.0, -2.0, 17.0)   # 停靠平台 x0 x1 y0 y1


def island_ring(n=96, grow=0.0, jitter=0.0, seed=1):
    rnd = random.Random(seed)
    pts = []
    for i in range(n):
        a = i * math.tau / n
        c, s = math.cos(a), math.sin(a)
        rx = (ISL_R[0] + grow) * (abs(c) ** (2 / ISL_P)) * (1 if c >= 0 else -1)
        ry = (ISL_R[1] + grow) * (abs(s) ** (2 / ISL_P)) * (1 if s >= 0 else -1)
        j = 1 + rnd.uniform(-jitter, jitter)
        pts.append((ISL_C[0] + rx * j, ISL_C[1] + ry * j))
    return pts


def main():
    import bpy
    from mathutils import Vector, Matrix
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch

    # 伦敦黄砖经百年煤烟熏黑：约 #3A302A
    BRICK = C.pbr('brick', 'dark_brick_wall', 1.6, tint=(0.62, 0.52, 0.45), value=0.95, sat=0.35, weather=0.4)
    STUCCO = C.pbr('stucco', 'white_stucco', 2.5, tint=(0.97, 0.96, 0.93), value=1.0, sat=0.3)
    PORT = C.flat('portland', (0.78, 0.76, 0.71), 0.65, noise=0.2)          # 波特兰石窗台 / 线脚 / 门墩
    WHITE = C.flat('white_paint', (0.86, 0.86, 0.84), 0.35)
    BLACK = C.flat('black_gloss', (0.012, 0.012, 0.014), 0.12, coat=0.8)     # 黑漆门
    IRON = C.flat('iron', (0.02, 0.02, 0.022), 0.45, metal=0.5)
    BRASS = C.flat('brass', (0.85, 0.65, 0.3), 0.25, metal=1.0)
    GLASS = C.glass('glass', tint=(0.05, 0.06, 0.07))
    AETHER = (0.62, 0.86, 1.0)                                              # 以太冷光
    LAMPG = C.flat('lamp_glass', (0.85, 0.93, 1.0), 0.15, emit=AETHER, estr=6.0)
    SLATE = C.pbr('slate', 'roof_slates_02', 2.5, tint=(0.62, 0.66, 0.7), sat=0.5)
    LEADF = C.flat('lead_flash', (0.3, 0.32, 0.34), 0.5, metal=0.3)
    POT = C.flat('chimney_pot', (0.42, 0.27, 0.2), 0.8, noise=0.25)
    GAUGED = C.flat('gauged_brick', (0.2, 0.125, 0.085), 0.8, noise=0.15)   # 磨砖平拱（暗橙，不偏粉）
    RENDER = C.flat('area_render', (0.66, 0.64, 0.6), 0.8, noise=0.2)
    ASPH = C.pbr('asphalt', 'asphalt_02', 4.0, tint=(0.62, 0.62, 0.64), sat=0.3)
    FLAG = C.pbr('flags', 'patterned_paving', 2.5, tint=(0.82, 0.8, 0.77), sat=0.4)
    KERB = C.flat('kerb', (0.55, 0.55, 0.53), 0.8, noise=0.2)
    GRASS = C.pbr('grass', 'grass_ground', 4.0, tint=(0.85, 0.95, 0.8))
    GRAVEL = C.pbr('gravel_path', 'precast_stone_paving', 2.0, tint=(0.9, 0.86, 0.78), sat=0.5)
    BARK = C.flat('bark', (0.18, 0.14, 0.11), 0.9, noise=0.4)
    LEAF = C.flat('leaf', (0.12, 0.2, 0.08), 0.8, noise=0.45)
    ROCK = C.pbr('rock', 'concrete_wall_008', 5.0, tint=(0.45, 0.37, 0.3), value=0.7, sat=0.4, nstr=2.0)
    ROCK_D = C.flat('rock_dark', (0.2, 0.17, 0.15), 0.95, noise=0.5)
    DECK = C.pbr('dock_deck', 'hangar_concrete_floor', 5.0, tint=(0.8, 0.8, 0.82), sat=0.3)
    STEEL = C.flat('dock_steel', (0.23, 0.25, 0.27), 0.4, metal=0.8)
    PADM = C.flat('pad_mark', (0.72, 0.74, 0.74), 0.7, noise=0.1)
    CAR = C.flat('car_body', (0.16, 0.18, 0.2), 0.25, metal=0.6, coat=0.6)
    CARG = C.glass('car_glass', tint=(0.03, 0.04, 0.05))
    FAR = C.flat('far_island', (0.36, 0.4, 0.47), 0.95, noise=0.2)          # 远景浮岛：大气透视后的灰蓝

    def cloud_mat():
        m, nt, b = C.new_mat('cloud_sea')
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.012, 0.012, 0.012)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.0; nz.inputs['Detail'].default_value = 10
        nz.inputs['Roughness'].default_value = 0.62
        nt.links.new(mp.outputs[0], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 0.35; mr.inputs['From Max'].default_value = 0.7
        mr.inputs['To Min'].default_value = 0.5; mr.inputs['To Max'].default_value = 0.85
        nt.links.new(nz.outputs[0], mr.inputs['Value'])
        cm = nt.nodes.new('ShaderNodeCombineColor')
        for i in range(3):
            nt.links.new(mr.outputs[0], cm.inputs[i])
        nt.links.new(cm.outputs[0], b.inputs['Base Color'])
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.9; bp.inputs['Distance'].default_value = 6.0
        nt.links.new(nz.outputs[0], bp.inputs['Height']); nt.links.new(bp.outputs[0], b.inputs['Normal'])
        b.inputs['Roughness'].default_value = 1.0
        b.inputs['Subsurface Weight'].default_value = 0.3
        return m

    def barrier_mat():
        """岛缘屏障：几乎透明，底部一丝冷光，往上淡出"""
        m = bpy.data.materials.new('bg_barrier'); m.use_nodes = True
        nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*AETHER, 1); em.inputs['Strength'].default_value = 1.2
        mix = nt.nodes.new('ShaderNodeMixShader')
        tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Object'], sep.inputs[0])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 9.0
        mr.inputs['To Min'].default_value = 0.09; mr.inputs['To Max'].default_value = 0.0
        nt.links.new(sep.outputs[2], mr.inputs['Value'])
        nz = nt.nodes.new('ShaderNodeTexWave'); nz.inputs['Scale'].default_value = 0.08; nz.inputs['Distortion'].default_value = 3
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
        nt.links.new(mr.outputs[0], mul.inputs[0]); nt.links.new(nz.outputs[1], mul.inputs[1])
        nt.links.new(mul.outputs[0], mix.inputs[0])
        nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs[0])
        return m

    CLOUD = cloud_mat(); BARRIER = barrier_mat()

    def T(u, v=0.0, n=0.0):
        return Matrix.Translation((u, v, n))

    def rect(u0, u1, v0, v1):
        return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]

    W = Batch('walls_ext'); R = Batch('roof'); DR = Batch('props_door'); RL = Batch('props_railings')
    CH = Batch('props_chimneys'); GT = Batch('props_gate'); CO = Batch('props_colonnade')
    site = Batch('site_ground'); GD = Batch('site_garden'); DK = Batch('site_dock'); HC = Batch('props_hovercar')

    def sash(B, M, w, h, glaze=True):
        """6/6 推拉窗；M 原点 = 窗洞底边中点、在立面外皮上，n 朝外。窗扇退进 0.1 m。"""
        C.slab2d(B, M, rect(-w / 2, w / 2, 0, h), -0.21, -0.17, GLASS)
        C.frame2d(B, M, rect(-w / 2, w / 2, 0, h), 0.09, -0.2, -0.1, WHITE)
        C.slab2d(B, M, rect(-w / 2, w / 2, h / 2 - 0.035, h / 2 + 0.035), -0.19, -0.11, WHITE)
        C.slab2d(B, M, rect(-w / 2, w / 2, h / 2 - 0.01, h / 2 + 0.01), -0.21, -0.1, WHITE)
        for f in (1 / 3, 2 / 3):
            C.slab2d(B, M, rect(-w / 2 + f * w - 0.018, -w / 2 + f * w + 0.018, 0, h), -0.18, -0.13, WHITE)
        for f in (0.25, 0.75):
            C.slab2d(B, M, rect(-w / 2, w / 2, f * h - 0.018, f * h + 0.018), -0.18, -0.13, WHITE)
        C.slab2d(B, M, rect(-w / 2 - 0.1, w / 2 + 0.1, -0.1, 0.0), -0.2, 0.06, PORT)            # 石窗台
        C.slab2d(B, M, [(-w / 2 - 0.17, h), (w / 2 + 0.17, h), (w / 2 + 0.1, h + 0.33), (-w / 2 - 0.1, h + 0.33)], -0.01, 0.012, GAUGED)

    def facade(x0, x1, yf, s, rows, zb, zt):
        """砖皮：rows = [[(xa, xb, za, zb), ...], ...]（窗洞），在洞之间补砖，yf 为外皮，s 朝外方向"""
        y0, y1 = yf - s * SKIN, yf
        rows = sorted([sorted(r) for r in rows if r], key=lambda r: min(o[2] for o in r))
        z = zb
        for r in rows:
            Z0 = min(o[2] for o in r); Z1 = max(o[3] for o in r)
            W.box(x0, x1, y0, y1, z, Z0, BRICK)
            xx = x0
            for (xa, xb, za, zb_) in r:
                W.box(xx, xa, y0, y1, Z0, Z1, BRICK)
                if za > Z0: W.box(xa, xb, y0, y1, Z0, za, BRICK)
                if zb_ < Z1: W.box(xa, xb, y0, y1, zb_, Z1, BRICK)
                xx = xb
            W.box(xx, x1, y0, y1, Z0, Z1, BRICK)
            z = Z1
        W.box(x0, x1, y0, y1, z, zt, BRICK)

    def railing(B, x0, x1, y, zb=0.0, h=1.1, gap=None, axis='x'):
        def bx(a0, a1, b0, b1, z0, z1):
            if axis == 'x': B.box(a0, a1, b0, b1, z0, z1, IRON)
            else: B.box(b0, b1, a0, a1, z0, z1, IRON)
        bx(x0, x1, y - 0.04, y + 0.04, zb + h - 0.06, zb + h)
        bx(x0, x1, y - 0.03, y + 0.03, zb + 0.1, zb + 0.15)
        n = max(1, int((x1 - x0) / 0.13))
        for i in range(n + 1):
            x = x0 + i * (x1 - x0) / n
            if gap and gap[0] < x < gap[1]:
                continue
            px, py = (x, y) if axis == 'x' else (y, x)
            B.boxc(px, py, zb, 0.025, 0.025, h + 0.06, IRON)
            B.cyl(px, py, zb + h + 0.06, 0.03, 0.14, IRON, 4, r2=0.0, smooth=False)   # 矛头
        for x in (x0, x1):
            px, py = (x, y) if axis == 'x' else (y, x)
            B.boxc(px, py, zb, 0.1, 0.1, h + 0.1, IRON)
            B.sphere(px, py, zb + h + 0.18, 0.07, IRON, seg=8, rings=5)

    # ------------------------------------------------------------ 浮岛：岛面、护沿、岩石底座
    ring = island_ring()
    site.poly([(x, y, -0.1) for (x, y) in ring], [tuple(range(len(ring)))], GRASS)
    site.poly([(x, y, -0.6) for (x, y) in ring] + [(x, y, -0.1) for (x, y) in ring],
              [(i, (i + 1) % len(ring), len(ring) + (i + 1) % len(ring), len(ring) + i) for i in range(len(ring))], ROCK_D)
    for i in range(len(ring)):   # 岛缘石护沿（引道口留开）
        (xa, ya), (xb, yb) = ring[i], ring[(i + 1) % len(ring)]
        if xa < -34 and ROAD_Y[0] - 0.5 < (ya + yb) / 2 < ROAD_Y[1] + 0.5:
            continue
        L = math.hypot(xb - xa, yb - ya); nx, ny = (yb - ya) / L, -(xb - xa) / L
        site.poly([(xa - nx * 0.4, ya - ny * 0.4, -0.1), (xb - nx * 0.4, yb - ny * 0.4, -0.1), (xb, yb, -0.1), (xa, ya, -0.1),
                   (xa - nx * 0.4, ya - ny * 0.4, 0.35), (xb - nx * 0.4, yb - ny * 0.4, 0.35), (xb, yb, 0.35), (xa, ya, 0.35)],
                  [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)], PORT)
    # 岩石底座（倒锥，逐层收小 + 随机起伏）
    rk = Batch('bg_island_rock')
    levels = [(-0.6, 0.0, 0.0), (-4.0, -1.5, 0.05), (-11.0, -7.0, 0.1), (-20.0, -15.0, 0.13), (-30.0, -24.0, 0.16), (-40.0, -31.0, 0.2)]
    rings = [[(x, y, z) for (x, y) in island_ring(grow=g, jitter=j, seed=11 + k)] for k, (z, g, j) in enumerate(levels)]
    rnd = random.Random(5)
    for k in range(1, len(rings)):
        rings[k] = [(ISL_C[0] + (x - ISL_C[0]) * (1 - 0.1 * k), ISL_C[1] + (y - ISL_C[1]) * (1 - 0.1 * k), z + rnd.uniform(-2, 2)) for (x, y, z) in rings[k]]
    vs = [v for r in rings for v in r]; n = len(ring)
    fs = [(k * n + i, (k + 1) * n + i, (k + 1) * n + (i + 1) % n, k * n + (i + 1) % n) for k in range(len(rings) - 1) for i in range(n)]
    tip = len(vs); vs.append((ISL_C[0] + 3, ISL_C[1] - 2, -62.0))
    k = len(rings) - 1
    fs += [(k * n + i, tip, k * n + (i + 1) % n) for i in range(n)]
    rk.poly(vs, fs, ROCK)
    # 岛缘屏障微光
    br = Batch('bg_barrier')
    rb = island_ring(grow=0.3)
    nb_ = len(rb)
    br.poly([(x, y, 0.0) for (x, y) in rb] + [(x, y, 9.0) for (x, y) in rb],
            [(i, (i + 1) % nb_, nb_ + (i + 1) % nb_, nb_ + i) for i in range(nb_)], BARRIER)

    # ------------------------------------------------------------ 引道 / 人行道（私家短引道：停靠平台 → 铁门 → 门前）
    RX0, RX1 = DOCK[1] - 0.5, 22.0
    site.box(-21.5, 21.5, -1.0, AREA, -0.1, -0.02, FLAG)
    site.box(-21.5, 21.5, PAVE_Y[0], PAVE_Y[1], -0.02, 0.12, FLAG)
    site.box(-21.5, 21.5, PAVE_Y[1] - 0.3, PAVE_Y[1], -0.12, 0.13, KERB)
    site.box(RX0, RX1, ROAD_Y[0], ROAD_Y[1], -0.12, -0.02, ASPH)
    site.box(GATE_X, RX1, FAR_PAVE[0], FAR_PAVE[1], -0.02, 0.12, FLAG)
    site.box(GATE_X, RX1, FAR_PAVE[0], FAR_PAVE[0] + 0.3, -0.12, 0.13, KERB)
    site.box(RX1, RX1 + 0.3, ROAD_Y[0], FAR_PAVE[1], -0.12, 0.13, KERB)
    site.box(RX0, GATE_X, ROAD_Y[0] - 0.3, ROAD_Y[0], -0.12, 0.13, KERB)
    site.box(RX0, GATE_X, ROAD_Y[1], ROAD_Y[1] + 0.3, -0.12, 0.13, KERB)
    site.box(-19.5, 19.5, -0.22, AREA, -2.6, -2.4, FLAG)                          # 采光井底

    # ------------------------------------------------------------ 联排（三栋）
    Z_TOPS = []
    for hi, (x0, x1, nb, dz, di) in enumerate(HOUSES):
        pm = hi == 1
        cor = CORNICE + dz; ptop = cor + 0.35 + PARA_H
        Z_TOPS.append(ptop)
        W.box(x0, x1, -DEPTH + SKIN, -SKIN, -2.6, cor, BRICK)
        bw = (x1 - x0) / nb
        dx = x0 + (di + 0.5) * bw
        dw, dh = 1.2, 2.6
        # 前立面洞口
        rows_f, rows_b = [], []
        for f, (wz, ww, wh) in enumerate(FLOORS):
            rf, rb2 = [], []
            for i in range(nb):
                xc = x0 + (i + 0.5) * bw
                if f == 0 and i == di:
                    rf.append((dx - dw / 2, dx + dw / 2, PLINTH, PLINTH + dh + dw / 2))
                else:
                    rf.append((xc - ww / 2, xc + ww / 2, wz, wz + wh))
                if f > 0:
                    rb2.append((xc - ww / 2, xc + ww / 2, wz, wz + wh))
            rows_f.append(rf); rows_b.append(rb2)
        facade(x0, x1, 0.0, 1, rows_f, 0.0, cor)
        W.box(x0, x1, -SKIN, 0.0, -2.6, 0.0, RENDER)                                # 地下室前墙抹灰
        facade(x0, x1, -DEPTH, -1, rows_b, 4.8, cor)
        W.box(x0, x1, -DEPTH, -DEPTH + SKIN, -2.6, 4.8, BRICK)
        for i in range(nb):
            xc = x0 + (i + 0.5) * bw
            for (y, s) in ((0.0, 1), (-DEPTH, -1)):
                for f, (wz, ww, wh) in enumerate(FLOORS):
                    if (s > 0 and f == 0 and i == di) or (s < 0 and f == 0):
                        continue
                    sash(W, C.wall_frame((xc, y, wz), (0, s, 0)), ww, wh)
            sash(W, C.wall_frame((xc, 0.2, -2.1), (0, 1, 0)), 1.0, 1.3)          # 采光井里的地下室窗
        # 首层线脚、檐口（白色）、女儿墙 + 石压顶
        W.box(x0, x1, -DEPTH - 0.04, 0.04, PLINTH + 0.3, PLINTH + 0.45, PORT)
        W.box(x0 - 0.02, x1 + 0.02, -DEPTH - 0.08, 0.08, 4.55, 4.7, PORT)          # 主层楼板线
        W.box(x0, x1, -DEPTH - 0.12, 0.12, cor - 0.15, cor, WHITE)
        W.box(x0, x1, -DEPTH - 0.32, 0.32, cor, cor + 0.2, WHITE)
        W.box(x0, x1, -DEPTH - 0.42, 0.42, cor + 0.2, cor + 0.35, WHITE)
        W.box(x0, x1, -DEPTH, 0, cor + 0.35, ptop, BRICK)
        W.box(x0, x1, -DEPTH + 0.35, -0.35, cor + 0.35, ptop - 0.01, LEADF)         # 女儿墙内侧天沟（掩住）
        W.box(x0, x1, -DEPTH - 0.06, 0.06, ptop, ptop + 0.12, PORT)
        # 女儿墙后的低坡板岩屋顶（M 形双坡，街面看不见）
        gz = cor + 0.45; rise = 1.35
        for (ya, yb) in ((-0.5, -DEPTH / 2), (-DEPTH / 2, -DEPTH + 0.5)):
            ym = (ya + yb) / 2
            R.poly([(x0, ya, gz), (x1, ya, gz), (x1, ym, gz + rise), (x0, ym, gz + rise)], [(0, 1, 2, 3), (3, 2, 1, 0)], SLATE)
            R.poly([(x0, ym, gz + rise), (x1, ym, gz + rise), (x1, yb, gz), (x0, yb, gz)], [(0, 1, 2, 3), (3, 2, 1, 0)], SLATE)
            R.box(x0, x1, ym - 0.1, ym + 0.1, gz + rise, gz + rise + 0.1, LEADF)
        # 退进的老虎窗：旁栋 1 个，首相府 2 个
        for xc in ((x0 + 1.5 * bw, x0 + 3.5 * bw) if pm else (x0 + (nb / 2) * bw,)):
            dy = -1.9
            R.box(xc - 0.75, xc + 0.75, dy - 1.2, dy, gz, ptop + 1.0, LEADF)
            R.gable(xc - 0.9, xc + 0.9, dy - 1.3, dy + 0.12, ptop + 1.0, 0.45, LEADF, 'y')
            sash(W, C.wall_frame((xc, dy + 0.21, ptop + 0.02), (0, 1, 0)), 0.85, 0.85)
        # 正门：黑色六镶板门 + 扇形气窗 + 多立克门套（壁柱 + 柱头 + 三陇板檐部）
        M = C.wall_frame((dx, 0.0, PLINTH), (0, 1, 0))
        C.slab2d(DR, M, rect(-dw / 2, dw / 2, 0, dh), -0.2, -0.13, BLACK)
        for (u0, u1, v0, v1) in ((-0.48, -0.06, 0.15, 0.85), (0.06, 0.48, 0.15, 0.85), (-0.48, -0.06, 1.0, 1.55), (0.06, 0.48, 1.0, 1.55), (-0.48, -0.06, 1.7, 2.45), (0.06, 0.48, 1.7, 2.45)):
            C.frame2d(DR, M, rect(u0, u1, v0, v1), 0.05, -0.13, -0.1, BLACK)
        C.frame2d(DR, M, rect(-dw / 2, dw / 2, 0, dh), 0.08, -0.21, -0.05, WHITE)
        fan = [(-dw / 2, dh), (dw / 2, dh)] + [(dw / 2 * math.cos(k * math.pi / 12), dh + dw / 2 * math.sin(k * math.pi / 12)) for k in range(1, 12)]
        C.slab2d(DR, M, fan, -0.21, -0.17, GLASS)
        for k in range(1, 6):   # 扇形气窗的放射窗棂
            a = k * math.pi / 6
            C.slab2d(DR, M @ T(0, dh) @ Matrix.Rotation(a - math.pi / 2, 4, 'Z'), rect(-0.015, 0.015, 0.0, dw / 2), -0.18, -0.13, WHITE)
        C.frame2d(DR, M, fan, 0.07, -0.19, -0.05, WHITE)
        C.slab2d(DR, M, rect(-dw / 2, dw / 2, dh - 0.05, dh + 0.03), -0.2, -0.08, WHITE)   # 气窗下横档
        pu = dw / 2 + 0.26
        top = dh + dw / 2 + 0.15
        for s in (-1, 1):   # 多立克壁柱：柱础 + 柱身 + 柱头
            C.slab2d(DR, M, rect(s * pu - 0.17, s * pu + 0.17, 0, 0.25), 0.0, 0.2, WHITE)
            C.slab2d(DR, M, rect(s * pu - 0.13, s * pu + 0.13, 0.25, top - 0.2), 0.0, 0.15, WHITE)
            C.slab2d(DR, M, rect(s * pu - 0.18, s * pu + 0.18, top - 0.2, top), 0.0, 0.2, WHITE)
        C.slab2d(DR, M, rect(-pu - 0.2, pu + 0.2, top, top + 0.18), 0.0, 0.2, WHITE)          # 额枋
        C.slab2d(DR, M, rect(-pu - 0.2, pu + 0.2, top + 0.18, top + 0.5), 0.0, 0.18, WHITE)   # 檐壁
        for k in range(5):   # 三陇板
            u = -pu + k * (2 * pu) / 4
            C.slab2d(DR, M, rect(u - 0.08, u + 0.08, top + 0.2, top + 0.48), 0.18, 0.22, WHITE)
        C.slab2d(DR, M, rect(-pu - 0.35, pu + 0.35, top + 0.5, top + 0.64), 0.0, 0.4, WHITE)  # 檐口
        p = M @ Vector((0, 1.45, -0.12))
        DR.tube([(p.x, p.y - 0.001, p.z + 0.09), (p.x, p.y + 0.06, p.z), (p.x, p.y - 0.001, p.z - 0.09)], 0.012, BRASS, n=6)  # 门环
        # 门前台阶（跨过采光井的石桥）
        site.box(dx - 1.0, dx + 1.0, 0, AREA, PLINTH - 0.2, PLINTH, PORT)
        for k in range(3):
            site.box(dx - 1.1, dx + 1.1, AREA + 0.3 * k, AREA + 0.3 * (k + 1), 0.12, PLINTH - 0.16 * (k + 1), PORT)
        # 采光井：石基座 + 1.1 m 铸铁栏杆
        site.box(x0 + 0.3, x1 - 0.3, AREA - 0.18, AREA + 0.18, 0.1, 0.4, PORT)
        railing(RL, x0 + 0.35, dx - 1.05, AREA, zb=0.4)
        railing(RL, dx + 1.05, x1 - 0.35, AREA, zb=0.4)
        for s in (-1, 1):
            railing(RL, 0.1, AREA - 0.1, dx + s * 1.0, zb=PLINTH, h=0.95, axis='y')
        # 灯笼（首相府：弯臂铸铁灯笼；旁栋：门侧壁灯架）
        if pm:
            lp = M @ Vector((0, top + 1.0, 0.95))
            wp = M @ Vector((0, top + 0.9, 0.0))
            DR.tube([(wp.x, wp.y, wp.z), (wp.x, wp.y + 0.4, wp.z + 0.3), (lp.x, lp.y, lp.z + 0.55)], 0.03, IRON, n=6)
            DR.boxc(lp.x, lp.y, lp.z - 0.4, 0.4, 0.4, 0.68, LAMPG)
            for (ex, ey) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                DR.boxc(lp.x + ex * 0.2, lp.y + ey * 0.2, lp.z - 0.42, 0.04, 0.04, 0.74, IRON)
            DR.pyramid(lp.x, lp.y, lp.z + 0.3, 0.55, 0.55, 0.3, IRON)
            DR.boxc(lp.x, lp.y, lp.z - 0.48, 0.5, 0.5, 0.08, IRON)
            DR.sphere(lp.x, lp.y, lp.z + 0.65, 0.06, IRON, seg=8, rings=5)
            C.point_light('pm_lantern', (lp.x, lp.y, lp.z - 0.1), 25, AETHER, 0.15)
        else:
            for s in (-1, 1):
                q = M @ Vector((s * (pu + 0.6), 2.3, 0.0))
                DR.tube([(q.x, q.y, q.z), (q.x, q.y + 0.35, q.z + 0.1)], 0.025, IRON, n=6)
                DR.cyl(q.x, q.y + 0.38, q.z - 0.1, 0.1, 0.3, LAMPG, 6, r2=0.13, smooth=False)
                DR.cyl(q.x, q.y + 0.38, q.z + 0.2, 0.16, 0.12, IRON, 6, r2=0.02, smooth=False)
    # 分户墙砖垛（凸出 0.3 m，一直升到较高一栋的压顶）
    for k, xw in enumerate((-19.5, -7.5, 7.5, 19.5)):
        zt = max(Z_TOPS[max(0, k - 1)], Z_TOPS[min(2, k)]) + 0.12
        W.box(xw - 0.3, xw + 0.3, 0.0, 0.3, 0.0, zt, BRICK)
        W.box(xw - 0.36, xw + 0.36, -0.06, 0.36, zt, zt + 0.12, PORT)
        W.box(xw - 0.3, xw + 0.3, -DEPTH - 0.3, -DEPTH, 0.0, zt, BRICK)
        W.cyl(xw + 0.45 * (1 if k < 3 else -1), 0.1, -2.4, 0.06, CORNICE + 2.4, IRON, 8)   # 落水管
    # 分户墙上的烟囱（高出屋面 ~2 m，每组 4–8 个烟囱帽）
    for k, xw in enumerate((-19.5, -7.5, 7.5, 19.5)):
        zt = max(Z_TOPS) + 2.0
        inner = 0 < k < 3
        for yy in (-3.4, -10.6):
            CH.boxc(xw, yy, CORNICE - 1, 1.15 if inner else 0.9, 3.4 if inner else 2.4, zt - CORNICE + 1, BRICK)
            CH.boxc(xw, yy, zt - 0.4, (1.15 if inner else 0.9) + 0.18, (3.4 if inner else 2.4) + 0.18, 0.12, PORT)
            CH.boxc(xw, yy, zt, (1.15 if inner else 0.9) + 0.14, (3.4 if inner else 2.4) + 0.14, 0.18, PORT)
            cols = (-0.28, 0.28) if inner else (0.0,)
            nrow = 4 if inner else 4
            for cx in cols:
                for j in range(nrow):
                    py = yy + (j - (nrow - 1) / 2) * (0.75 if inner else 0.55)
                    h = 0.6 + 0.15 * ((j + k) % 3)
                    CH.cyl(xw + cx, py, zt + 0.18, 0.15, h, POT, 10, r2=0.12)
                    CH.cyl(xw + cx, py, zt + 0.18 + h, 0.14, 0.06, POT, 10)

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
    gy0, gy1 = -46.0, cy0 - 4.2
    GD.box(-24, 24, gy0, gy1, -0.1, 0.04, GRASS)
    GD.box(-3.0, 3.0, gy0, gy1 - 1.2, 0.0, 0.07, GRAVEL)
    GD.box(-20, 20, gy1 - 3.0, gy1 - 1.2, 0.0, 0.07, GRAVEL)
    for (x0, x1, y0, y1) in ((-24.3, -24.0, gy0, gy1), (24.0, 24.3, gy0, gy1), (-24.3, 24.3, gy0 - 0.3, gy0)):
        GD.box(x0, x1, y0, y1, 0, 2.2, BRICK)
        GD.box(x0 - 0.08, x1 + 0.08, y0 - (0.08 if y1 - y0 < 1 else 0), y1 + (0.08 if y1 - y0 < 1 else 0), 2.2, 2.35, PORT)
    rnd = random.Random(3)
    for (x, y, h, r) in ((-15, -36, 9, 3.8), (-9, -42, 7, 3.0), (14, -40, 10, 4.2), (18, -26, 6, 2.6)):
        GD.cyl(x, y, 0, 0.32, h * 0.6, BARK, 10, r2=0.2)
        for k in range(7):
            a = rnd.uniform(0, math.tau); d = rnd.uniform(0, r * 0.55)
            GD.sphere(x + d * math.cos(a), y + d * math.sin(a), h * 0.62 + rnd.uniform(0, h * 0.35), r * rnd.uniform(0.5, 0.75), LEAF, seg=12, rings=8)
    for x in (-10, -6, 6, 10):   # 修剪的矮树篱
        GD.box(x - 1.5, x + 1.5, gy1 - 8, gy1 - 7.2, 0, 0.9, LEAF)

    # ------------------------------------------------------------ 铁门（石门墩）+ 岗亭 + 街灯
    gx = GATE_X
    y0g, y1g = -1.0, FAR_PAVE[1] + 0.2
    piers = (y0g, ROAD_Y[0] - 0.15, ROAD_Y[1] + 0.15, y1g)
    for (ya, yb) in zip(piers[:-1], piers[1:]):
        ya += 0.4; yb -= 0.4
        n = int((yb - ya) / 0.14)
        for i in range(n + 1):
            y = ya + i * (yb - ya) / n
            GT.boxc(gx, y, 0, 0.035, 0.035, 2.6, IRON)
            GT.cyl(gx, y, 2.6, 0.045, 0.18, IRON, 4, r2=0.0, smooth=False)
        for z in (0.2, 1.3, 2.45):
            GT.box(gx - 0.05, gx + 0.05, ya, yb, z, z + 0.07, IRON)
    for y in piers:   # 石门墩 ~3 m + 压顶 + 球饰
        GT.boxc(gx, y, 0, 0.8, 0.8, 3.0, PORT)
        GT.boxc(gx, y, 2.55, 0.9, 0.9, 0.12, PORT)
        GT.boxc(gx, y, 3.0, 1.0, 1.0, 0.18, PORT)
        GT.boxc(gx, y, 3.18, 0.6, 0.6, 0.12, PORT)
        GT.sphere(gx, y, 3.6, 0.28, PORT, seg=12, rings=8)
    for y in (ROAD_Y[0] + 1.5, ROAD_Y[0] + 3, ROAD_Y[1] - 1.5):   # 路障桩（门外）
        GT.cyl(gx - 2.5, y, 0, 0.14, 0.9, IRON, 10)
    # 岗亭：黑漆镶板木岗亭 + 双坡屋顶，门朝引道
    sbx, sby = gx + 2.2, PAVE_Y[0] + 0.9
    GT.box(sbx - 0.7, sbx + 0.7, sby - 0.7, sby + 0.7, 0.12, 2.45, BLACK)
    GT.box(sbx - 0.78, sbx + 0.78, sby - 0.78, sby + 0.78, 0.12, 0.3, BLACK)
    GT.box(sbx - 0.78, sbx + 0.78, sby - 0.78, sby + 0.78, 2.35, 2.5, BLACK)
    Mb = C.wall_frame((sbx, sby + 0.7, 0.3), (0, 1, 0))
    C.slab2d(GT, Mb, rect(-0.42, 0.42, 0, 1.95), -0.04, 0.0, C.flat('booth_inside', (0.03, 0.03, 0.03), 0.9))
    for (u0, u1, v0, v1) in ((-0.36, -0.03, 0.12, 0.8), (0.03, 0.36, 0.12, 0.8), (-0.36, -0.03, 0.95, 1.85), (0.03, 0.36, 0.95, 1.85)):
        C.frame2d(GT, Mb, rect(u0, u1, v0, v1), 0.04, -0.04, 0.02, BLACK)
    C.frame2d(GT, Mb, rect(-0.42, 0.42, 0, 1.95), 0.06, -0.04, 0.04, BLACK)
    GT.gable(sbx - 0.95, sbx + 0.95, sby - 0.95, sby + 0.95, 2.5, 0.75, SLATE, 'x')
    GT.box(sbx - 0.08, sbx + 0.08, sby - 0.98, sby + 0.98, 3.22, 3.3, LEADF)
    for x in (-25, -3, 18):   # 铸铁街灯（冷光）
        GT.cyl(x, PAVE_Y[1] - 0.6, 0.12, 0.16, 0.5, IRON, 10)
        GT.cyl(x, PAVE_Y[1] - 0.6, 0.6, 0.07, 3.4, IRON, 8, r2=0.05)
        GT.cyl(x, PAVE_Y[1] - 0.6, 4.0, 0.22, 0.6, LAMPG, 6, r2=0.3, smooth=False)
        GT.cyl(x, PAVE_Y[1] - 0.6, 4.6, 0.36, 0.25, IRON, 6, r2=0.02, smooth=False)

    # ------------------------------------------------------------ 官方停靠平台（岛缘外挑）+ 一辆悬浮车
    dx0, dx1, dy0, dy1 = DOCK
    DK.box(dx0, dx1 + 3.0, dy0, dy1, -0.55, -0.02, DECK)
    DK.box(dx0 - 0.15, dx1, dy0 - 0.15, dy1 + 0.15, -0.9, -0.5, STEEL)               # 边梁
    DK.cyl(-51.0, 7.6, -0.02, 6.0, 0.02, PADM, 48, smooth=False)                    # 着陆圈（纯几何环，无字）
    DK.cyl(-51.0, 7.6, -0.02, 5.6, 0.03, DECK, 48, smooth=False)
    DK.cyl(-51.0, 7.6, -0.02, 1.2, 0.035, PADM, 24, smooth=False)
    for (x, y) in ((dx0 + 1.5, dy0 + 1.5), (dx0 + 1.5, dy1 - 1.5), (-50, dy0 + 1.5), (-50, dy1 - 1.5)):
        DK.cyl(x, y, -0.9, 0.35, -18.0, STEEL, 12) if False else None
    for (x, y) in ((dx0 + 3, dy0 + 2), (dx0 + 3, dy1 - 2), (-47, dy0 + 2), (-47, dy1 - 2)):   # 斜撑回岩体
        DK.tube([(x, y, -0.9), (dx1 + 2.0, y, -14.0)], 0.28, STEEL, n=10)
    DK.box(dx1 - 1.0, dx1 + 3.0, dy0, dy1, -10.0, -0.55, STEEL)                    # 岩壁锚座
    railing(DK, dx0 + 0.1, dx1 - 0.2, dy0 + 0.1, zb=0.0, h=1.1)
    railing(DK, dx0 + 0.1, dx1 - 0.2, dy1 - 0.1, zb=0.0, h=1.1)
    railing(DK, dy0 + 0.1, 2.5, dx0 + 0.1, zb=0.0, h=1.1, axis='y')
    railing(DK, 12.7, dy1 - 0.1, dx0 + 0.1, zb=0.0, h=1.1, axis='y')
    for (x, y) in ((dx0 + 0.5, 2.5), (dx0 + 0.5, 12.7), (dx0 + 5, dy0 + 0.5), (-45, dy0 + 0.5), (dx0 + 5, dy1 - 0.5), (-45, dy1 - 0.5)):
        DK.cyl(x, y, 0.0, 0.14, 1.0, STEEL, 10)                                      # 边缘导航灯柱
        DK.cyl(x, y, 1.0, 0.12, 0.2, LAMPG, 10)
    # 悬浮车：流线车身 + 座舱 + 四个涵道风扇，悬停 0.6 m
    cx, cy, cz = -51.0, 7.6, 1.35
    HC.sphere(cx, cy, cz, 1.0, CAR, sz=0.5, seg=24, rings=12, sx=2.3)
    HC.sphere(cx + 0.3, cy, cz + 0.3, 0.8, CARG, sz=0.55, seg=20, rings=10, sx=1.5, zmin=0.0)
    for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        px, py = cx + ex * 1.7, cy + ey * 1.2
        HC.cyl(px, py, cz - 0.3, 0.55, 0.3, CAR, 20)
        HC.cyl(px, py, cz - 0.33, 0.42, 0.02, LAMPG, 16)
        HC.box(min(cx + ex * 0.9, px), max(cx + ex * 0.9, px), py - 0.08 * ey - 0.08, py - 0.08 * ey + 0.08, cz - 0.2, cz - 0.05, CAR)

    # ------------------------------------------------------------ 背景：云海、远处浮岛
    cl = Batch('bg_clouds')
    MIDC = C.flat('bg_midcity', (0.16, 0.2, 0.28), 1.0, noise=0.15)
    MIDL = C.flat('bg_midlight', (0.1, 0.1, 0.1), 0.5, emit=(0.6, 0.85, 1.0), estr=1.5)
    mc = Batch('bg_midcity')   # 云隙下远远的中层（按电路板式的街区块）
    mc.box(-6000, 6000, -6000, 6000, -760, -750, MIDC)
    rq = random.Random(3)
    rnd = random.Random(8)
    for k in range(10):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(500, 1400)
        x, y = ISL_C[0] + d * math.cos(a), ISL_C[1] + d * math.sin(a)
        for j in range(4):
            cl.sphere(x + rnd.uniform(-40, 40), y + rnd.uniform(-40, 40), -420, rnd.uniform(60, 110), CLOUD, sz=0.3, seg=16, rings=8, zmin=-0.1)
    for (fx, fy, fz, fr, seed) in ((-1400, 1900, -60, 90, 22),):
        fi = Batch('bg_far_island_%d' % seed)
        rnd2 = random.Random(seed)
        n = 40
        top = [(fx + fr * math.cos(i * math.tau / n) * rnd2.uniform(0.9, 1.05), fy + fr * 0.8 * math.sin(i * math.tau / n) * rnd2.uniform(0.9, 1.05), fz) for i in range(n)]
        vs = top + [(fx, fy, fz - fr * 0.7)]
        fi.poly(vs, [tuple(range(n - 1, -1, -1))[::-1]] + [(i, n, (i + 1) % n) for i in range(n)], FAR)
        for k in range(9):   # 岛上的建筑轮廓（中立体块）
            bx, by = fx + rnd2.uniform(-0.55, 0.55) * fr, fy + rnd2.uniform(-0.45, 0.45) * fr
            fi.boxc(bx, by, fz, rnd2.uniform(8, 18), rnd2.uniform(8, 18), rnd2.uniform(10, 45), FAR)

    Batch.build_all()
    C.sky_sun(sc, 'day', sun_az=65.0, sun_el=38.0)
    sc.view_settings.exposure = -0.2
    if A['exposure']:
        sc.view_settings.exposure = float(A['exposure'])
    CAMS = {
        'c1': ((-74, 52, 30), (-4, -8, 2), 26),
        'c2': ((-7.0, 10.0, 1.7), (-3.0, 0, 3.4), 32),
        'c3': ((-30, -76, 19), (0, -20, 5), 30),
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
