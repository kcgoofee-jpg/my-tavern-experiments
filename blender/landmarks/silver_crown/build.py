"""银冠堡（议会骑士团总部）——上层与中层交界（约 800 m）的浮空要塞岛，只做外观。
与上层地图 tc_estates.build_silver_crown / tc_upper.json 'silver_crown' 一致：岩峰（crag）浮岛、峭壁岛缘，
沿岛缘的环形城墙 + 每 45° 一座圆塔，中央主堡（长方形大厅 + 大圆主塔 + 深色锥顶），砾石校场，
巡逻悬浮艇停机坪（停着几艘），岸外停靠平台。银灰石材 + 亮钢；塔顶锥帽与主塔冠环为拉丝银色金属，无徽记。
无人物、无武器（无炮 / 炮塔）、无文字 / 旗帜 / 徽记。

导出组：
  walls_ext        主堡：大厅 + 主塔（冠环、尖柱与天线桅杆）
  props_curtain    环形城墙（雉堞、墙顶步道）+ 8 座圆塔（银锥帽、信标灯）
  props_gate       门楼（双塔夹门道）+ 通往停靠平台的桥
  props_ranges     沿内墙的营房 / 马厩长楼
  props_hangars    悬浮坐骑与巡逻艇机库（素面）
  props_yard       砾石校场
  props_pad        巡逻艇停机坪
  props_dock       岸外停靠平台
  props_craft      停放的巡逻悬浮艇与悬浮坐骑
  site_island      岛面 + 岛缘岩石
  props_underside  岛下岩体 + 以太悬浮发射器
bg_*：云海、云层里露顶的中层塔楼、远处浮岛、空中巡逻艇（不导出）。

布局（米）：岛面 z=0，岛中心原点；门楼 / 停靠平台在 +y（朝伊甸），停机坪在 +x，校场在 -x。
用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/silver_crown/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/sc.jpg [--blend /tmp/sc.blend] [--log /tmp/sc.log]
cam: c1 斜上俯瞰全岛（云海在下）/ c2 校场望主堡 / c3 空中看停靠平台与门楼
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/sc.jpg', blend='', log='', exposure=''))

RX, RY = 128.0, 136.0          # 岛面半径
WALL_IN = 9.0                  # 城墙中线距岛缘
WALL_H, WALL_T = 11.0, 4.2
GATE_A = math.pi / 2           # 门楼方位（+y）


def rim(a, grow=0.0, seed=0, jit=0.0):
    """岛缘轮廓（略不规则的椭圆，岬角朝 +y 稍凸）"""
    r = 1.0 + 0.045 * math.sin(3 * a + 0.7) + 0.03 * math.sin(5 * a + 2.1) + 0.05 * max(0.0, math.sin(a)) ** 4
    if jit:
        r *= 1 + random.Random(seed * 1000 + int(a * 1000)).uniform(-jit, jit)
    return ((RX * r + grow) * math.cos(a), (RY * r + grow) * math.sin(a))


def ring(n=96, grow=0.0, seed=0, jit=0.0):
    return [rim(i * math.tau / n, grow, seed, jit) for i in range(n)]


def main():
    import bpy
    from mathutils import Vector, Matrix
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(7)

    ASH = C.ashlar('sc_ashlar', (0.46, 0.475, 0.5), course=0.7, block=1.5, joint=0.012, jc=(0.33, 0.34, 0.36))
    ASH2 = C.ashlar('sc_ashlar_fine', (0.55, 0.56, 0.58), course=0.45, block=1.0, joint=0.012, jc=(0.38, 0.39, 0.41))
    SILVER = C.flat('sc_silver', (0.82, 0.84, 0.87), 0.28, metal=1.0)
    STEEL = C.pbr('sc_steel', 'Metal009', 2.0, tint=(0.55, 0.57, 0.6), sat=0.3, metal=0.85)
    DARK = C.flat('sc_cap_dark', (0.09, 0.1, 0.12), 0.4, metal=0.6)           # 主塔深色锥顶
    SLATE = C.pbr('sc_slate', 'roof_slates_02', 3.0, tint=(0.5, 0.53, 0.58), sat=0.35)
    GLASS = C.glass('sc_glass', tint=(0.05, 0.06, 0.08))
    VOID = C.flat('sc_void', (0.015, 0.015, 0.017), 0.9)
    GRAVEL = C.pbr('sc_gravel', 'precast_stone_paving', 1.2, tint=(0.8, 0.78, 0.74), sat=0.3) if False else \
        C.flat('sc_gravel', (0.52, 0.5, 0.47), 0.95, noise=0.6)
    PAVE = C.pbr('sc_pave', 'precast_stone_paving', 3.0, tint=(0.85, 0.85, 0.86), sat=0.3)
    DECK = C.pbr('sc_deck', 'hangar_concrete_floor', 5.0, tint=(0.78, 0.79, 0.82), sat=0.3)
    PADM = C.flat('sc_padmark', (0.8, 0.82, 0.84), 0.6)
    GRASS = C.pbr('sc_grass', 'grass_ground', 5.0, tint=(0.7, 0.9, 0.72), sat=0.8)
    ROCK = C.pbr('sc_rock', 'concrete_wall_008', 6.0, tint=(0.46, 0.45, 0.46), value=0.7, sat=0.25, nstr=2.2)
    ROCK_D = C.flat('sc_rock_dark', (0.22, 0.22, 0.23), 0.95, noise=0.5)
    AETHER = (0.55, 0.85, 1.0)
    EMIT = C.flat('sc_emitter', (0.6, 0.95, 1.0), 0.2, emit=(0.35, 0.9, 1.0), estr=28.0)
    CRAG = C.pbr('sc_crag', 'concrete_wall_008', 3.0, tint=(0.6, 0.58, 0.55), value=0.85, sat=0.3, nstr=2.5)
    SCREE = C.flat('sc_scree', (0.36, 0.36, 0.37), 0.9, noise=0.5)
    LIT = C.flat('sc_winlit', (0.9, 0.75, 0.5), 0.3, emit=(1.0, 0.78, 0.5), estr=4.0)

    def cone_mat():
        m = bpy.data.materials.new('bg_emit_cone'); nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.22; mr.inputs['To Max'].default_value = 0.0
        nt.links.new(lw.outputs['Facing'], mr.inputs['Value'])
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (0.35, 0.9, 1.0, 1); em.inputs['Strength'].default_value = 3.0
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(mr.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
        return m
    CONEM = cone_mat()
    BEACON = C.flat('sc_beacon', (1.0, 0.95, 0.85), 0.2, emit=(1.0, 0.92, 0.75), estr=12.0)
    HULL = C.flat('sc_hull', (0.62, 0.65, 0.69), 0.25, metal=0.8, coat=0.5)
    HULL_D = C.flat('sc_hull_dark', (0.12, 0.13, 0.15), 0.35, metal=0.6)
    CANOPY = C.glass('sc_canopy', tint=(0.03, 0.04, 0.05))
    DOOR = C.flat('sc_door_steel', (0.3, 0.32, 0.35), 0.45, metal=0.7)

    def cloud_mat():
        m, nt, b = C.new_mat('bg_cloud')
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.02; nz.inputs['Detail'].default_value = 8
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 0.35; mr.inputs['From Max'].default_value = 0.7
        mr.inputs['To Min'].default_value = 0.62; mr.inputs['To Max'].default_value = 0.92
        nt.links.new(nz.outputs[0], mr.inputs['Value'])
        cm = nt.nodes.new('ShaderNodeCombineColor')
        for i in range(3):
            nt.links.new(mr.outputs[0], cm.inputs[i])
        nt.links.new(cm.outputs[0], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = 1.0
        b.inputs['Subsurface Weight'].default_value = 0.3
        return m
    CLOUD = cloud_mat()
    FAR = C.flat('bg_far', (0.42, 0.47, 0.55), 0.95, noise=0.2)
    MIDT = C.flat('bg_midtower', (0.3, 0.34, 0.4), 0.5, metal=0.3, noise=0.15)
    MIDW = C.window_grid('bg_midwin', wall=(0.18, 0.21, 0.26), lit=(0.7, 0.85, 1.0), estr=0.6, cell=(3.0, 3.6))

    WX = Batch('walls_ext'); CU = Batch('props_curtain'); GT = Batch('props_gate'); RG = Batch('props_ranges')
    HG = Batch('props_hangars'); YD = Batch('props_yard'); PD = Batch('props_pad'); DK = Batch('props_dock')
    CR = Batch('props_craft'); SI = Batch('site_island'); UN = Batch('props_underside'); CONE = Batch('bg_emit_cones')

    def obox(B, p, q, w, z0, z1, m, off=0.0):
        """p→q 的线段为中线、宽 w 的竖直方盒（off = 沿法向偏移）"""
        dx, dy = q[0] - p[0], q[1] - p[1]; L = math.hypot(dx, dy)
        nx, ny = -dy / L, dx / L
        a0, a1 = off - w / 2, off + w / 2
        P = [(p[0] + nx * a0, p[1] + ny * a0), (q[0] + nx * a0, q[1] + ny * a0), (q[0] + nx * a1, q[1] + ny * a1), (p[0] + nx * a1, p[1] + ny * a1)]
        vs = [(x, y, z0) for x, y in P] + [(x, y, z1) for x, y in P]
        fs = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        B.poly(vs, fs, m)

    def lerp(p, q, t):
        return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)

    def merlons(B, p, q, off, z, m, step=2.4, mw=1.3, mh=1.5, th=0.7):
        L = math.hypot(q[0] - p[0], q[1] - p[1]); n = max(1, int(L / step))
        for k in range(n):
            t0 = (k + 0.5) / n - mw / 2 / L; t1 = (k + 0.5) / n + mw / 2 / L
            obox(B, lerp(p, q, t0), lerp(p, q, t1), th, z, z + mh, m, off)

    def round_tower(B, x, y, r, h, cap_m, cap_h, beacon=True, n=24):
        B.cyl(x, y, -1.0, r * 1.12, 3.0, ASH, n, r2=r)                    # 斜脚
        B.cyl(x, y, 2.0, r, h - 2.0, ASH, n)
        B.cyl(x, y, h, r + 0.8, 1.0, ASH2, n)                               # 挑檐
        for k in range(n // 2):                                              # 雉堞
            a = (k + 0.25) * math.tau / (n // 2)
            B.boxc(x + (r + 0.45) * math.cos(a), y + (r + 0.45) * math.sin(a), h + 1.0, 1.4, 1.4, 1.4, ASH2)
        B.cyl(x, y, h + 1.0, r - 0.6, 2.2, ASH, n)                          # 帽座
        B.cyl(x, y, h + 3.2, r + 0.3, cap_h, cap_m, n, r2=0.0)
        top = h + 3.2 + cap_h
        B.cyl(x, y, top - 0.2, 0.12, 3.0, STEEL, 6)
        if beacon:
            B.sphere(x, y, top + 3.0, 0.45, BEACON, seg=10, rings=6)
        for k in range(4):                                                   # 窄长窗（箭窗式细缝，纯采光）
            a = k * math.tau / 4 + 0.4
            for zz in (h * 0.35, h * 0.7):
                M = C.wall_frame((x + r * math.cos(a), y + r * math.sin(a), zz), (math.cos(a), math.sin(a), 0))
                C.slab2d(B, M, [(-0.3, 0), (0.3, 0), (0.3, 2.6), (-0.3, 2.6)], -0.3, 0.05, VOID)
        return top

    # ------------------------------------------------------------ 岛面（岩峰：碎石地 + 岩脊 + 碎石坡 + 矮草斑）+ 岛缘岩石
    from mathutils import noise as _nz
    R0 = ring(96)
    nR = len(R0)
    SI.poly([(x, y, 0.0) for x, y in R0], [tuple(range(nR))], CRAG)
    edge = ring(96, grow=1.5, seed=3, jit=0.03)
    vs = [(x, y, 0.0) for x, y in R0] + [(x, y, -0.3 + rnd.uniform(-0.8, 0.8)) for x, y in edge] + \
         [(x, y, -7.0 + rnd.uniform(-2, 2)) for x, y in ring(96, grow=2.5, seed=4, jit=0.04)]
    fs = [(i, nR + i, nR + (i + 1) % nR, (i + 1) % nR) for i in range(nR)] + \
         [(nR + i, 2 * nR + i, 2 * nR + (i + 1) % nR, nR + (i + 1) % nR) for i in range(nR)]
    SI.poly(vs, fs, ROCK)
    BUSY = [(-52, 30, -26, 26), (-98, -46, 6, 58), (44, 94, -48, 20), (-50, -10, -86, -60), (-8, 8, 18, 130), (-48, -30, -6, 6)]

    def free(x, y, pad=0.0):
        if any(x0 - pad < x < x1 + pad and y0 - pad < y < y1 + pad for (x0, x1, y0, y1) in BUSY):
            return False
        a = math.atan2(y, x); rx_, ry_ = rim(a)
        return math.hypot(x, y) < math.hypot(rx_, ry_) - WALL_IN - 14 - pad
    for k in range(40):                                                       # 岛缘外侧露头岩块
        a = rnd.uniform(0, math.tau); f = rnd.uniform(0.95, 1.0)
        x, y = rim(a); x *= f; y *= f
        if abs(a - GATE_A) < 0.2:
            continue
        C.rock(SI, x, y, 0.0, rnd.uniform(1.5, 4.0), ROCK, seed=k, seg=7, rings=4, sz=0.8, facet=0.3)
    nridge = 0
    for k in range(400):                                                      # 岩脊：成串的长条岩块
        if nridge >= 11:
            break
        x, y = rnd.uniform(-110, 110), rnd.uniform(-120, 120)
        if not free(x, y, 6):
            continue
        nridge += 1
        ang = rnd.uniform(0, math.pi)
        for j in range(rnd.randint(4, 7)):
            t = j * 3.2 - 8
            px, py = x + t * math.cos(ang), y + t * math.sin(ang)
            if free(px, py):
                C.rock(SI, px, py, -0.3, rnd.uniform(2.0, 3.6), ROCK_D if j % 3 == 0 else ROCK, seed=300 + k * 10 + j,
                       seg=8, rings=5, sz=rnd.uniform(0.7, 1.1), facet=0.45, rz=ang)
                for s_ in range(5):                                           # 岩脊脚下的碎石
                    qx, qy = px + rnd.uniform(-5, 5), py + rnd.uniform(-5, 5)
                    if free(qx, qy):
                        C.rock(SI, qx, qy, 0.0, rnd.uniform(0.3, 0.8), SCREE, seed=900 + k * 50 + j * 5 + s_, seg=5, rings=3, sz=0.6, facet=0.5)
    ng = 0
    for k in range(600):                                                      # 短硬草斑
        if ng >= 60:
            break
        x, y = rnd.uniform(-115, 115), rnd.uniform(-125, 125)
        if not free(x, y, 1):
            continue
        ng += 1
        r0 = rnd.uniform(2.5, 7.0); n = 10
        pts = [(x + r0 * rnd.uniform(0.6, 1.1) * math.cos(i * math.tau / n), y + r0 * rnd.uniform(0.6, 1.1) * math.sin(i * math.tau / n)) for i in range(n)]
        SI.poly([(px, py, 0.04) for px, py in pts] + [(x, y, 0.12)], [(i, (i + 1) % n, n) for i in range(n)], GRASS)

    # ------------------------------------------------------------ 岛下岩体（细分 + 噪声置换）+ 以太发射器
    NU = 160
    levels = [(-7.0, 2.5, 1.0), (-15, 1, 0.95), (-24, 0, 0.88), (-34, -2, 0.8), (-45, -4, 0.71), (-57, -6, 0.61),
              (-70, -8, 0.5), (-83, -9, 0.39), (-96, -10, 0.28), (-108, -10, 0.18), (-120, -10, 0.1)]
    rings_ = []
    for k, (z, g, s) in enumerate(levels):
        row = []
        for i in range(NU):
            a = i * math.tau / NU
            x, y = rim(a, grow=g)
            nn = _nz.fractal(Vector((math.cos(a) * 3, math.sin(a) * 3, z * 0.05)), 0.55, 2.0, 5)
            ff = s * (1 + 0.12 * nn * (k > 0))
            row.append((x * ff + 3 * k, y * ff - 2 * k, z + (4 * _nz.noise(Vector((a * 4, z * 0.1, 1.0))) if k else 0)))
        rings_.append(row)
    vs = [v for r_ in rings_ for v in r_]
    fs = [(k * NU + i, k * NU + (i + 1) % NU, (k + 1) * NU + (i + 1) % NU, (k + 1) * NU + i) for k in range(len(rings_) - 1) for i in range(NU)]
    tip = len(vs); vs.append((32, -22, -142.0)); k = len(rings_) - 1
    fs += [(k * NU + i, k * NU + (i + 1) % NU, tip) for i in range(NU)]
    UN.poly(vs, fs, ROCK)
    for k in range(40):                                                       # 岩体表面凸块
        lv = rnd.randint(1, 8); i = rnd.randrange(NU)
        x, y, z = rings_[lv][i]
        C.rock(UN, x * 0.97, y * 0.97, z, rnd.uniform(4, 9), ROCK_D if k % 3 == 0 else ROCK, seed=200 + k, seg=9, rings=6, sz=1.3, facet=0.35)
    for k in range(8):                                                        # 以太悬浮发射器：大钢环 + 青色光环 + 向下光锥
        a = k * math.tau / 8 + 0.2
        i = int(a / math.tau * NU) % NU
        x, y, z = rings_[5][i]
        x, y, z = x * 1.0, y * 1.0, z - 4.0
        UN.cyl(x, y, z + 1.0, 4.0, 6.0, STEEL, 20, r2=5.5)                      # 锚座
        UN.cyl(x, y, z - 0.6, 8.5, 1.6, STEEL, 32)
        UN.cyl(x, y, z - 1.0, 7.2, 0.5, EMIT, 32, r2=7.2)
        UN.cyl(x, y, z - 1.1, 5.2, 0.4, EMIT, 32)
        UN.cyl(x, y, z - 1.6, 2.4, 1.0, EMIT, 16, r2=1.2)
        CONE.cyl(x, y, z - 46.0, 16.0, 45.0, CONEM, 32, r2=7.0, cap=False)
    UN.cyl(20, -14, -114, 7.0, 4.0, STEEL, 24, r2=5.8)                       # 底尖主发射器
    UN.cyl(20, -14, -115.5, 6.0, 1.5, EMIT, 24, r2=4.0)
    CONE.cyl(20, -14, -175, 22.0, 60.0, CONEM, 32, r2=6.0, cap=False)

    # ------------------------------------------------------------ 环形城墙 + 塔
    NW = 64
    WP = [(x, y) for x, y in (rim(i * math.tau / NW, grow=-WALL_IN) for i in range(NW))]
    tower_idx = list(range(0, NW, 8))
    gate_i = 16                                                               # a = π/2
    for i in range(NW):
        p, q = WP[i], WP[(i + 1) % NW]
        if i in (gate_i - 1, gate_i):                                         # 门楼处断开
            continue
        obox(CU, p, q, WALL_T, -1.0, WALL_H, ASH)
        obox(CU, p, q, WALL_T + 1.6, -1.0, 1.5, ASH)                          # 墙脚
        obox(CU, p, q, 0.6, WALL_H, WALL_H + 1.1, ASH2, off=-(WALL_T / 2 - 0.3))   # 外侧胸墙
        merlons(CU, p, q, -(WALL_T / 2 - 0.35), WALL_H + 1.1, ASH2)
        obox(CU, p, q, 0.4, WALL_H, WALL_H + 0.9, ASH2, off=WALL_T / 2 - 0.2)     # 内侧矮护墙
        obox(CU, p, q, WALL_T - 1.0, WALL_H, WALL_H + 0.08, PAVE)               # 墙顶步道
        obox(CU, p, q, WALL_T + 0.5, WALL_H - 0.6, WALL_H, ASH2)                # 束带
    for i in tower_idx:
        if i == gate_i:
            continue
        x, y = WP[i]
        round_tower(CU, x, y, 7.0, 19.0, SILVER, 9.0)
        C.point_light('beacon_%d' % i, (x, y, 19.0 + 3.2 + 9.0 + 3.6), 400, (1.0, 0.92, 0.75), 0.4)
    # 墙顶步道上的小楼梯（内侧踏步，每两塔之间一段）
    for i in range(4, NW, 8):
        p, q = WP[i], WP[i + 1]
        dx, dy = q[0] - p[0], q[1] - p[1]; L = math.hypot(dx, dy); nx, ny = -dy / L, dx / L
        for s in range(12):
            t0 = s / 12
            c = lerp(p, q, t0 * 0.9)
            obox(CU, c, lerp(p, q, t0 * 0.9 + 0.08), 2.2, 0, WALL_H * (s + 1) / 12, ASH, off=WALL_T / 2 + 1.1)

    # ------------------------------------------------------------ 门楼 + 桥
    gx, gy = WP[gate_i]
    GT.box(gx - 9, gx + 9, gy - 6, gy + 6, -1.0, 15.0, ASH)
    GT.box(gx - 9.4, gx + 9.4, gy - 6.4, gy + 6.4, 14.4, 15.2, ASH2)
    for xx in range(-4, 5):
        GT.boxc(gx + xx * 2.0, gy + 6.0, 15.2, 1.2, 0.7, 1.4, ASH2)
        GT.boxc(gx + xx * 2.0, gy - 6.0, 15.2, 1.2, 0.7, 1.4, ASH2)
    for s in (-1, 1):
        round_tower(GT, gx + s * 11.5, gy + 1.0, 6.0, 21.0, SILVER, 8.0)
        C.point_light('beacon_g%d' % s, (gx + s * 11.5, gy + 1.0, 21 + 3.2 + 8 + 3.6), 400, (1.0, 0.92, 0.75), 0.4)
    arch, _ = C.pointed(5.0, 5.2, 8, 0.7)
    for yy, nrm in ((gy + 6.0, 1), (gy - 6.0, -1)):
        M = C.wall_frame((gx, yy, 0.0), (0, nrm, 0))
        C.slab2d(GT, M, arch, -1.2, 0.05, VOID)
        C.frame2d(GT, M, arch, 0.6, -0.1, 0.35, ASH2)
    M = C.wall_frame((gx, gy + 6.0, 0.0), (0, 1, 0))                         # 钢闸门（升起一半）
    for u in (-2.0, -1.0, 0.0, 1.0, 2.0):
        C.slab2d(GT, M, [(u - 0.08, 4.0), (u + 0.08, 4.0), (u + 0.08, 7.5), (u - 0.08, 7.5)], -0.6, -0.4, STEEL)
    for k in range(3):                                                        # 门楼窄长窗
        C.slab2d(GT, M, [(-5.5 + k * 5.5 - 0.35, 9.5), (-5.5 + k * 5.5 + 0.35, 9.5), (-5.5 + k * 5.5 + 0.35, 13.0), (-5.5 + k * 5.5 - 0.35, 13.0)], -0.3, 0.02, GLASS)
    ytip = rim(GATE_A)[1]
    BR_Y0, BR_Y1 = gy + 6.0, ytip + 34.0                                      # 桥
    BZ = 1.2                                                                  # 桥面高出岛缘岩石
    GT.box(gx - 5.0, gx + 5.0, BR_Y0, BR_Y1, BZ - 0.3, BZ, PAVE)
    GT.box(gx - 5.3, gx + 5.3, BR_Y0, BR_Y1, BZ - 2.2, BZ - 0.3, ASH)
    GT.box(gx - 4.6, gx + 4.6, BR_Y0 - 3, BR_Y0 + 0.5, 0.0, BZ, PAVE)          # 门道坡
    for s in (-1, 1):
        GT.box(gx + s * 5.0 - 0.35, gx + s * 5.0 + 0.35, BR_Y0, BR_Y1, BZ, BZ + 1.15, ASH2)   # 石栏墙
        GT.box(gx + s * 5.0 - 0.45, gx + s * 5.0 + 0.45, BR_Y0, BR_Y1, BZ + 1.15, BZ + 1.35, ASH2)
        yy = BR_Y0 + 4
        while yy < BR_Y1 - 1:                                                 # 灯柱
            GT.cyl(gx + s * 5.0, yy, BZ + 1.35, 0.14, 3.6, SILVER, 8)
            GT.cyl(gx + s * 5.0, yy, BZ + 4.95, 0.32, 0.7, BEACON, 8, r2=0.22)
            GT.cyl(gx + s * 5.0, yy, BZ + 5.65, 0.42, 0.2, SILVER, 8, r2=0.05)
            yy += 8
    GT.tube([(gx, ytip - 2, -14), (gx, (ytip + BR_Y1) / 2, -2.2)], 0.6, STEEL, n=10)   # 斜撑

    # ------------------------------------------------------------ 岸外停靠平台
    DX, DY = gx, BR_Y1 + 20
    DK.cyl(DX, DY, -1.0, 21.0, 1.0 + BZ, DECK, 40, smooth=False)
    DK.cyl(DX, DY, -3.2, 21.3, 2.2, STEEL, 40, r2=16.0, smooth=False)
    DK.cyl(DX, DY, -7.0, 16.0, 3.8, STEEL, 40, r2=5.0, smooth=False)
    DK.cyl(DX, DY, -9.0, 3.0, 2.0, EMIT, 20, r2=1.5)
    DK.cyl(DX, DY, BZ, 14.5, 0.03, PADM, 48, smooth=False)
    DK.cyl(DX, DY, BZ, 14.0, 0.04, DECK, 48, smooth=False)
    for k in range(20):
        a = k * math.tau / 20
        if abs(math.sin(a) + 1) < 0.1:
            continue
        x, y = DX + 20.5 * math.cos(a), DY + 20.5 * math.sin(a)
        DK.cyl(x, y, BZ, 0.14, 1.1, STEEL, 8)
        if k % 5 == 0:
            DK.cyl(x, y, BZ + 1.1, 0.2, 0.3, BEACON, 8)
    DK.tube([(DX + 20.5 * math.cos(a), DY + 20.5 * math.sin(a), BZ + 1.1) for a in [(-math.pi / 2 + 0.18) + k * (math.tau - 0.36) / 40 for k in range(41)]], 0.07, STEEL, n=6)
    DK.box(DX + 10, DX + 15, DY - 4, DY + 4, BZ, BZ + 3.2, ASH2)                     # 小值守亭
    DK.box(DX + 9.7, DX + 15.3, DY - 4.3, DY + 4.3, BZ + 3.2, BZ + 3.6, STEEL)
    M = C.wall_frame((DX + 10, DY, BZ + 1.0), (-1, 0, 0))
    C.slab2d(DK, M, [(-3, 0), (3, 0), (3, 1.6), (-3, 1.6)], -0.1, 0.02, GLASS)

    # ------------------------------------------------------------ 主堡：大厅 + 主塔
    HX0, HX1, HY0, HY1, HH = -30.0, 24.0, -18.0, 18.0, 20.0
    WX.box(HX0 - 1, HX1 + 1, HY0 - 1, HY1 + 1, -0.5, 2.5, ASH)                      # 台基
    for k in range(4):
        WX.box(-6 - k * 0.0, 6, HY1 + 1 + k * 0.8, HY1 + 1 + (k + 1) * 0.8, -0.5, 2.5 - 0.6 * (k + 1), ASH2)
    WX.box(HX0, HX1, HY0 + 0.9, HY1 - 0.9, 2.5, HH, ASH)
    WSTEP = (HX1 - HX0 - 7) / 7
    WXS = [HX0 + 3.5 + k * WSTEP + WSTEP / 2 for k in range(7)]
    for yv in (HY0, HY1):                                                          # 外皮：窗带上下 + 窗间墙（窗洞深 0.9 m）
        for zz0, zz1 in ((2.5, 5.5), (5.5 + 11.6, HH)):
            WX.box(HX0, HX1, yv - 0.9, yv + 0.9, zz0, zz1, ASH)
        edges = [HX0] + [v for xm in WXS for v in (xm - 0.9, xm + 0.9)] + [HX1]
        for a_, b_ in zip(edges[::2], edges[1::2]):
            WX.box(a_, b_, yv - 0.9, yv + 0.9, 5.5, 5.5 + 11.6, ASH)
    WX.box(HX0 - 0.4, HX1 + 0.4, HY0 - 0.4, HY1 + 0.4, HH - 0.8, HH, ASH2)
    for y in (HY0 - 0.4, HY1 + 0.4):                                               # 胸墙 + 雉堞
        WX.box(HX0 - 0.4, HX1 + 0.4, y - 0.3, y + 0.3, HH, HH + 1.0, ASH2)
        merlons(WX, (HX0, y), (HX1, y), 0.0, HH + 1.0, ASH2)
    WX.gable(HX0 + 1, HX1 - 1, HY0 + 1, HY1 - 1, HH, 10.0, SLATE, 'x')
    for s in (-1, 1):                                                              # 扶壁 + 窄高窗
        yf = HY1 if s > 0 else HY0
        for k in range(8):
            x = HX0 + 3.5 + k * (HX1 - HX0 - 7) / 7
            WX.box(x - 0.7, x + 0.7, yf, yf + s * 1.3, 2.5, HH - 3, ASH2)
            WX.box(x - 0.7, x + 0.7, yf, yf + s * 0.8, HH - 3, HH - 1.2, ASH2)
            if k < 7:
                xm = x + (HX1 - HX0 - 7) / 14
                M = C.wall_frame((xm, yf, 5.5), (0, s, 0))
                pts, _ = C.pointed(1.8, 10.5, 6, 0.8)
                C.slab2d(WX, M, pts, -0.95, -0.85, LIT)
                C.frame2d(WX, M, pts, 0.5, -0.9, 0.15, ASH2)
                C.slab2d(WX, M, [(-0.04, 0), (0.04, 0), (0.04, 11.3), (-0.04, 11.3)], -0.9, -0.7, STEEL)
                C.slab2d(WX, M, [(-0.9, 5.2), (0.9, 5.2), (0.9, 5.3), (-0.9, 5.3)], -0.9, -0.7, STEEL)
    M = C.wall_frame((0.0, HY1, 2.5), (0, 1, 0))                                  # 大门
    pts, _ = C.pointed(4.2, 5.0, 8, 0.7)
    C.slab2d(WX, M, pts, -0.5, -0.3, DOOR)
    C.frame2d(WX, M, pts, 0.7, -0.4, 0.6, ASH2)
    C.slab2d(WX, M, [(-0.05, 0), (0.05, 0), (0.05, 7.0), (-0.05, 7.0)], -0.3, -0.2, STEEL)
    # 东端山墙上的小方塔
    WX.box(HX1 - 7, HX1 + 1, -5, 5, HH, HH + 12, ASH)
    WX.pyramid(HX1 - 3, 0, HH + 12, 9.5, 11.5, 6.0, SILVER)
    # 主塔（西端）：大圆塔 + 冠环 + 尖柱 + 天线桅杆 + 深色锥顶
    TX, TY, TR, TH = HX0 - 2.0, 0.0, 15.0, 52.0
    WX.cyl(TX, TY, -1.0, TR * 1.15, 5.0, ASH, 40, r2=TR)
    WX.cyl(TX, TY, 4.0, TR, TH - 4.0, ASH, 40)
    for z in (16.0, 32.0):
        WX.cyl(TX, TY, z, TR + 0.35, 0.7, ASH2, 40)
    for k in range(10):                                                            # 窄长窗
        a = k * math.tau / 10 + 0.3
        if abs(math.cos(a) - 1) < 0.3:
            continue
        for z0, hh in ((8.0, 6.0), (20.0, 9.0), (35.0, 9.0)):
            M = C.wall_frame((TX + TR * math.cos(a), TY + TR * math.sin(a), z0), (math.cos(a), math.sin(a), 0))
            pts, _ = C.pointed(1.0, hh, 5, 0.8)
            C.slab2d(WX, M, pts, -0.45, -0.3, GLASS)
            C.frame2d(WX, M, pts, 0.2, -0.4, 0.12, ASH2)
    for k in range(20):                                                            # 挑出的托臂
        a = k * math.tau / 20
        WX.boxc(TX + (TR + 0.6) * math.cos(a), TY + (TR + 0.6) * math.sin(a), TH - 2.5, 1.0, 1.0, 2.5, ASH2)
    WX.cyl(TX, TY, TH, TR + 1.6, 1.2, ASH2, 40)
    WX.cyl(TX, TY, TH + 1.2, TR + 1.6, 1.6, SILVER, 40)                           # 银冠环
    WX.cyl(TX, TY, TH + 2.8, TR + 1.9, 0.5, SILVER, 40)
    for k in range(16):                                                            # 冠尖柱
        a = k * math.tau / 16
        x, y = TX + (TR + 1.2) * math.cos(a), TY + (TR + 1.2) * math.sin(a)
        h = 11.0 if k % 2 == 0 else 7.0
        WX.cyl(x, y, TH + 3.3, 1.0, 1.2, SILVER, 8)
        WX.cyl(x, y, TH + 4.5, 0.9, h, SILVER, 8, r2=0.05)
        if k % 4 == 0:                                                             # 天线桅杆
            WX.cyl(x, y, TH + 3.3, 0.32, 20.0, SILVER, 8)
            for zz in (TH + 8, TH + 12, TH + 16):
                WX.box(x - 1.6, x + 1.6, y - 0.1, y + 0.1, zz, zz + 0.18, SILVER)
            WX.sphere(x, y, TH + 23.6, 0.5, BEACON, seg=8, rings=5)
    WX.cyl(TX, TY, TH + 1.2, TR - 1.0, 6.0, ASH, 40)                              # 帽座
    WX.cyl(TX, TY, TH + 7.2, TR + 0.2, 22.0, DARK, 40, r2=0.0)                    # 深色锥顶
    WX.cyl(TX, TY, TH + 7.2, TR + 0.5, 0.6, SILVER, 40)
    WX.cyl(TX, TY, TH + 28.5, 0.25, 9.0, SILVER, 8)
    WX.sphere(TX, TY, TH + 37.8, 0.6, BEACON, seg=10, rings=6)
    C.point_light('beacon_keep', (TX, TY, TH + 39), 1200, (1.0, 0.92, 0.75), 0.5)

    # ------------------------------------------------------------ 校场（-x）与停机坪（+x）
    YX, YY = -70.0, 30.0
    YD.box(YX - 26, YX + 22, YY - 22, YY + 26, -0.05, 0.06, GRAVEL)
    for (x0, x1, y0, y1) in ((YX - 26.6, YX + 22.6, YY - 22.6, YY - 22), (YX - 26.6, YX + 22.6, YY + 26, YY + 26.6),
                             (YX - 26.6, YX - 26, YY - 22, YY + 26), (YX + 22, YX + 22.6, YY - 22, YY + 26)):
        YD.box(x0, x1, y0, y1, -0.05, 0.3, PAVE)                                     # 石镶边
    YD.box(YX + 22.6, HX0 - 10, -4, 4, -0.05, 0.08, PAVE)                           # 通往主堡的石路
    YD.box(-6, 6, HY1 + 4.2, WP[gate_i][1] - 6, -0.05, 0.08, PAVE)                 # 门楼 → 主堡大道
    for k in range(6):                                                              # 校场边的拴马桩 / 灯柱
        x = YX - 22 + k * 8.5
        YD.cyl(x, YY + 27.5, 0.0, 0.18, 4.0, STEEL, 8)
        YD.cyl(x, YY + 27.5, 4.0, 0.35, 0.6, BEACON, 8)
    PX, PY = 72.0, -26.0
    PD.box(PX - 26, PX + 20, PY - 20, PY + 20, -0.05, 0.25, DECK)
    for (cx, cy) in ((PX - 12, PY - 8), (PX + 6, PY - 8), (PX - 3, PY + 10)):
        PD.cyl(cx, cy, 0.25, 7.0, 0.03, PADM, 40, smooth=False)
        PD.cyl(cx, cy, 0.25, 6.5, 0.04, DECK, 40, smooth=False)
        PD.cyl(cx, cy, 0.25, 1.2, 0.05, PADM, 20, smooth=False)
    for k in range(10):
        x = PX - 25 + k * 5
        PD.cyl(x, PY - 19.5, 0.25, 0.18, 0.2, BEACON, 8)

    # ------------------------------------------------------------ 机库（停机坪北侧 + 西南）
    def hangar(B, x, y, w, d, h, face):
        """筒拱机库：沿 x 宽 w、y 深 d；face = +1/-1 开口朝 ±y"""
        n = 12
        prof = [(w / 2 * math.cos(math.pi * k / n), h * 0.45 + h * 0.55 * math.sin(math.pi * k / n)) for k in range(n + 1)]
        y0, y1 = y - d / 2, y + d / 2
        vs = [(x + u, y0, z) for u, z in prof] + [(x + u, y1, z) for u, z in prof]
        fs = [(k + 1, k, n + 1 + k, n + 2 + k) for k in range(n)]
        B.poly(vs, fs, STEEL)
        B.box(x - w / 2, x - w / 2 + 0.6, y0, y1, 0, h * 0.45, ASH)
        B.box(x + w / 2 - 0.6, x + w / 2, y0, y1, 0, h * 0.45, ASH)
        yb = y1 if face < 0 else y0
        yf = y0 if face < 0 else y1
        B.poly([(x + u, yb, z) for u, z in prof] + [(x, yb, 0)], [tuple(range(n + 1)) + (n + 1,), tuple(range(n, -1, -1)) + (n + 1,)][:1] + [tuple(reversed(tuple(range(n + 1)) + (n + 1,)))], ASH)
        B.box(x - w / 2, x + w / 2, yb - face * 0.6, yb, 0, h * 0.45, ASH)
        # 开口：内部深色 + 半开的钢折叠门
        B.box(x - w / 2 + 0.6, x + w / 2 - 0.6, y0 + 0.5, y1 - 0.5, 0.01, h * 0.8, VOID)
        for s in (-1, 1):
            B.box(x + s * (w / 2 - 0.6) - s * w * 0.18, x + s * (w / 2 - 0.6), yf - 0.2, yf + 0.2, 0, h * 0.45, DOOR)
        B.box(x - w / 2, x + w / 2, yf - 0.5, yf + 0.5, h * 0.45, h * 0.62, ASH2)
        for k in range(1, 6):
            yy = y0 + k * d / 6
            B.tube([(x + u, yy, z + 0.12) for u, z in prof], 0.12, STEEL, n=4)

    hangar(HG, PX - 14, PY + 32, 18, 22, 10, -1)
    hangar(HG, PX + 7, PY + 32, 18, 22, 10, -1)
    hangar(HG, -40, -72, 16, 18, 8, 1)                                           # 悬浮坐骑机库（西南）
    hangar(HG, -20, -76, 16, 18, 8, 1)

    # ------------------------------------------------------------ 营房 / 马厩长楼（沿内墙）
    def range_block(B, a, length, depth, h):
        c = rim(a, grow=-WALL_IN - WALL_T / 2 - depth / 2 - 0.5)
        tx, ty = -math.sin(a), math.cos(a)
        rx_, ry_ = math.cos(a), math.sin(a)
        p = (c[0] - tx * length / 2, c[1] - ty * length / 2); q = (c[0] + tx * length / 2, c[1] + ty * length / 2)
        obox(B, p, q, depth, -0.5, h, ASH)
        # 单坡屋顶（靠墙高）
        hi = [(p[0] + rx_ * depth / 2, p[1] + ry_ * depth / 2), (q[0] + rx_ * depth / 2, q[1] + ry_ * depth / 2)]
        lo = [(q[0] - rx_ * (depth / 2 + 1.0), q[1] - ry_ * (depth / 2 + 1.0)), (p[0] - rx_ * (depth / 2 + 1.0), p[1] - ry_ * (depth / 2 + 1.0))]
        vs = [(hi[0][0], hi[0][1], h + 3.0), (hi[1][0], hi[1][1], h + 3.0), (lo[0][0], lo[0][1], h - 0.4), (lo[1][0], lo[1][1], h - 0.4)]
        B.poly(vs + [(x, y, z - 0.3) for x, y, z in vs], [(0, 3, 2, 1), (4, 5, 6, 7), (2, 3, 7, 6), (0, 1, 5, 4), (1, 2, 6, 5), (3, 0, 4, 7)], SLATE)
        n = int(length / 4.0)
        for k in range(n):                                                         # 院侧窗 / 马厩门
            t = (k + 0.5) / n
            m = lerp(p, q, t)
            base = (m[0] - rx_ * depth / 2, m[1] - ry_ * depth / 2)
            M = C.wall_frame((base[0], base[1], 0.0), (-rx_, -ry_, 0))
            if k % 3 == 1:
                C.slab2d(B, M, [(-1.2, 0), (1.2, 0), (1.2, 3.2), (-1.2, 3.2)], -0.3, 0.02, DOOR)
            else:
                C.slab2d(B, M, [(-0.45, 1.2), (0.45, 1.2), (0.45, 3.4), (-0.45, 3.4)], -0.25, 0.02, GLASS)
            if h > 8:
                C.slab2d(B, M, [(-0.45, 5.4), (0.45, 5.4), (0.45, 7.6), (-0.45, 7.6)], -0.25, 0.02, GLASS)

    for (a, L, d, h) in ((math.radians(118), 36, 9, 10), (math.radians(145), 40, 9, 10), (math.radians(172), 34, 9, 7),
                         (math.radians(200), 38, 9, 7), (math.radians(60), 34, 9, 10), (math.radians(32), 30, 9, 7),
                         (math.radians(290), 36, 9, 10)):
        range_block(RG, a, L, d, h)

    # ------------------------------------------------------------ 巡逻悬浮艇 + 悬浮坐骑
    def patrol_craft(B, x, y, z, yaw=0.0, s=1.0):
        c, sn = math.cos(yaw), math.sin(yaw)
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Scale(s, 4)

        def P(px, py, pz):
            v = M @ Vector((px, py, pz)); return (v.x, v.y, v.z)
        # 机身：楔形细长体
        prof = [(-5.5, 1.1, 0.6), (-2.0, 1.6, 1.0), (2.5, 1.4, 0.9), (5.5, 0.35, 0.35)]
        vs = []
        for (px, hw, hh) in prof:
            vs += [P(px, -hw, -hh * 0.6), P(px, hw, -hh * 0.6), P(px, hw * 0.8, hh), P(px, -hw * 0.8, hh)]
        fs = []
        for k in range(len(prof) - 1):
            for j in range(4):
                a, b = k * 4 + j, k * 4 + (j + 1) % 4
                fs.append((a, b, b + 4, a + 4))
        fs.append((3, 2, 1, 0)); L = (len(prof) - 1) * 4; fs.append((L, L + 1, L + 2, L + 3))
        B.poly(vs, fs, HULL)
        cm = M @ Vector((1.0, 0, 0.8))
        B.sphere(cm.x, cm.y, cm.z, 1.2, CANOPY, sz=0.45, seg=14, rings=7, zmin=0.0, sx=1.8) if abs(sn) < 0.01 else \
            B.sphere(cm.x, cm.y, cm.z, 1.0, CANOPY, sz=0.55, seg=14, rings=7, zmin=0.0)
        for (px, py) in ((-3.0, -2.8), (-3.0, 2.8), (2.2, -2.4), (2.2, 2.4)):   # 涵道风扇
            q = M @ Vector((px, py, -0.1))
            B.cyl(q.x, q.y, q.z - 0.35 * s, 1.1 * s, 0.7 * s, HULL_D, 16)
            B.cyl(q.x, q.y, q.z - 0.37 * s, 0.85 * s, 0.03, EMIT, 12)
            B.poly([P(px * 0.5, py * 0.4, 0), P(px, py, 0), P(px, py, 0.2), P(px * 0.5, py * 0.4, 0.2)], [(0, 1, 2, 3), (3, 2, 1, 0)], HULL_D)

    def mount(B, x, y, z, yaw):
        """单座悬浮坐骑（悬浮摩托式），素面"""
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, 'Z')
        q = M @ Vector((0, 0, 0))
        B.sphere(q.x, q.y, q.z, 0.6, HULL, sz=0.6, seg=12, rings=6, sx=1.0)
        for px in (-1.1, 1.1):
            p2 = M @ Vector((px, 0, -0.1))
            B.cyl(p2.x, p2.y, p2.z - 0.2, 0.55, 0.35, HULL_D, 12)
            B.cyl(p2.x, p2.y, p2.z - 0.21, 0.42, 0.02, EMIT, 10)
        a, b = M @ Vector((-1.1, 0, 0)), M @ Vector((1.3, 0, 0.3))
        B.tube([tuple(a), tuple(b)], 0.25, HULL, n=6)

    for (cx, cy), yaw in (((PX - 12, PY - 8), 0.3), ((PX + 6, PY - 8), -0.2)):
        patrol_craft(CR, cx, cy, 1.6, yaw)
    patrol_craft(CR, PX + 7, PY + 26, 1.4, math.pi / 2)                          # 机库门口一艘
    for k in range(6):
        mount(CR, -46 + k * 2.4, -61.5, 0.9, math.pi / 2)
        mount(CR, -26 + k * 2.4, -65.5, 0.9, math.pi / 2)
    patrol_craft(CR, DX - 6, DY - 3, BZ + 1.5, 0.8)                                   # 停靠平台上一艘

    # ------------------------------------------------------------ 背景：云海、中层塔顶、远处浮岛、空中巡逻艇
    cl = Batch('bg_clouds')
    cl.box(-8000, 8000, -8000, 8000, -420, -400, CLOUD)
    def sheet_mat(name, alpha, bright, scale, seed):
        m = bpy.data.materials.new(name); nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale, scale); mp.inputs['Location'].default_value = (seed * 3.1, seed * 1.7, 0)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.0; nz.inputs['Detail'].default_value = 8; nz.inputs['Roughness'].default_value = 0.6
        nt.links.new(mp.outputs[0], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.38; mr.inputs['From Max'].default_value = 0.68
        mr.inputs['To Min'].default_value = 0.0; mr.inputs['To Max'].default_value = alpha
        nt.links.new(nz.outputs[0], mr.inputs['Value'])
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        b.inputs['Base Color'].default_value = (bright, bright, bright * 1.02, 1); b.inputs['Roughness'].default_value = 1.0
        b.inputs['Subsurface Weight'].default_value = 0.4
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.6; bp.inputs['Distance'].default_value = 6.0
        nt.links.new(nz.outputs[0], bp.inputs['Height']); nt.links.new(bp.outputs[0], b.inputs['Normal'])
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(mr.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(b.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
        return m
    CZ = -340.0
    for li, (dz, amp, sc_, al, br) in enumerate(((-45, 18, 0.004, 1.0, 0.8), (-28, 14, 0.006, 0.85, 0.88), (-14, 10, 0.009, 0.6, 0.95), (-3, 7, 0.013, 0.35, 1.0))):
        sm = sheet_mat('bg_cloud_sheet_%d' % li, al, br, sc_ * 1.3, li)
        sb = Batch('bg_cloud_sheet_%d' % li)
        N = 70; E = 3200.0; off = Vector((li * 37.0, li * 11.0, 0))
        rows = []
        for j in range(N + 1):
            row = []
            for i in range(N + 1):
                x = -E + 2 * E * i / N; y = -E + 2 * E * j / N
                h = _nz.fractal(Vector((x * sc_, y * sc_, li)) + off, 0.6, 2.0, 4) * amp
                row.append((x, y, CZ + dz + h))
            rows.append(row)
        C.grid(sb, rows, sm)
    mt = Batch('bg_midtowers')
    for k in range(12):
        a = math.radians(rnd.uniform(-160, -20) if k % 2 else rnd.uniform(150, 260)); d = rnd.uniform(420, 1100)
        x, y = d * math.cos(a), d * math.sin(a)
        w = rnd.uniform(26, 50); top = rnd.uniform(-300, -215)
        mt.boxc(x, y, -600, w, w * 0.95, top + 600, MIDW)
        d2 = w * 0.95
        for zz in range(int(top - 170), int(top), 12):                         # 楼层挑檐
            mt.boxc(x, y, zz, w + 1.6, d2 + 1.6, 0.8, MIDT)
        for f in range(-3, 4):                                                   # 竖向肋片
            for sy in (-1, 1):
                mt.boxc(x + f * w / 7, y + sy * (d2 / 2 + 0.6), top - 170, 0.6, 1.2, 170, MIDT)
            for sx in (-1, 1):
                mt.boxc(x + sx * (w / 2 + 0.6), y + f * d2 / 7, top - 170, 1.2, 0.6, 170, MIDT)
        mt.boxc(x, y, top, w * 0.7, w * 0.7, rnd.uniform(10, 30), MIDT)
        mt.cyl(x, y, top + 20, 0.8, rnd.uniform(20, 50), MIDT, 6)
    for (fx, fy, fz, fr, seed) in ((-900, 1300, 180, 140, 5), (1400, 900, 260, 180, 6), (600, 1800, 120, 100, 7)):
        fi = Batch('bg_far_island_%d' % seed)
        r2 = random.Random(seed); n = 36
        top = [(fx + fr * math.cos(i * math.tau / n) * r2.uniform(0.9, 1.05), fy + fr * 0.8 * math.sin(i * math.tau / n) * r2.uniform(0.9, 1.05), fz) for i in range(n)]
        fi.poly(top + [(fx, fy, fz - fr * 0.9)], [tuple(range(n))] + [(i, n, (i + 1) % n)[::-1] for i in range(n)], FAR)
        for k in range(8):
            fi.boxc(fx + r2.uniform(-0.5, 0.5) * fr, fy + r2.uniform(-0.4, 0.4) * fr, fz, r2.uniform(10, 25), r2.uniform(10, 25), r2.uniform(10, 40), FAR)
    fl = Batch('bg_flying')
    patrol_craft(fl, -150, 60, 70, 0.5, 1.0)
    patrol_craft(fl, 180, 140, 40, 2.2, 1.0)
    patrol_craft(fl, -120, 330, 55, -1.2, 1.0)

    Batch.build_all()
    C.sky_sun(sc, 'day', sun_az=215.0, sun_el=40.0)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else -0.7
    CAMS = {
        'c1': ((-330, -300, 150), (0, 10, -30), 30),
        'c2': ((-96, 50, 4.0), (-24, 0, 36), 20),
        'c3': ((48, 232, 26), (-4, 158, 3), 28),
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
