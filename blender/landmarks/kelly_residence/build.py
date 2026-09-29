"""凯莉的宅邸（开局三的目的地，上层 isle10）：摄政风白灰泥别墅（参考塞津科特庄园、摄政公园 The Holme、纳什式别墅）。
主楼两层：首层灰泥横向分缝（rustication）+ 落地高窗，二层主层窗 + 铸铁小阳台栏杆；檐口 + 女儿墙，后面藏低坡板岩四坡屋顶和烟囱；
东侧立面整高弓形凸窗（七折面，顶上铅皮半锥顶）；正门爱奥尼四柱门廊（顶上栏杆阳台）；背面铸铁游廊（帐篷式铜皮顶）；
西侧两层服务翼；东南（背面东侧）红砖围墙菜园 + 靠墙温室；门前砾石前庭 + 圆形喷泉池；环岛树圈；岛西缘外挑私家悬浮车停机坪。
场地：天空城上层浮空岛（岛缘屏障微光、岩石底座、云海、远处浮岛）。中立建筑，无文字、无标志、无徽记。
坐标：主楼正门立面 y = 0（前庭在 +y），弓窗在 +x，服务翼在 -x，菜园在 -y 偏 +x。bg_* 对象只为渲染，不导出。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/kelly_residence/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/kelly.jpg [--blend /tmp/kelly.blend] [--log /tmp/kelly.log]
cam: c1 前庭斜俯（主图）/ c2 门廊近景 / c3 菜园一侧（含弓窗）
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='day', res='1000', samples='32', out='/tmp/kelly.jpg', blend='', log='', exposure=''))

X0, X1, Y0, Y1 = -9.0, 9.0, -13.0, 0.0       # 主楼
PL = 0.6                                      # 首层地坪
GF = (PL + 0.15, 1.25, 2.9)                   # 首层窗：窗台、宽、高（落地高窗）
FF = (5.15, 1.2, 2.55)                        # 二层窗
BAND = 4.75                                   # 首层 / 二层之间的石线脚
COR = 8.6                                     # 檐口底
SKIN = 0.25
BOW_C = (X1, -6.5); BOW_R = 3.6; BOW_N = 7
WX0, WX1, WY0, WY1 = -17.0, X0, -10.0, -2.0   # 服务翼
WCOR = 6.4
GX0, GX1, GY0, GY1 = -2.0, 24.0, -42.0, -18.0  # 围墙菜园
FC = (0.0, 15.0)                              # 前庭 / 喷泉中心
ISL_C = (0.0, -8.0); ISL_R = (45.0, 44.0); ISL_P = 4.0
PAD = (-56.0, 15.0, 8.5)                      # 停机坪 x y r


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

    STUCCO = C.pbr('stucco', 'white_stucco', 2.5, tint=(0.96, 0.94, 0.88), value=1.0, sat=0.3)
    STUCCO_R = C.pbr('stucco_rusticated', 'white_stucco', 2.5, tint=(0.95, 0.93, 0.87), value=1.0, sat=0.3)
    # 首层分缝：按世界 z 每 0.42 m 一道暗缝
    nt = STUCCO_R.node_tree
    bsdf = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    src = bsdf.inputs['Base Color'].links[0].from_socket
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    m1 = nt.nodes.new('ShaderNodeMath'); m1.operation = 'MULTIPLY'; m1.inputs[1].default_value = 1 / 0.42
    nt.links.new(sep.outputs[2], m1.inputs[0])
    fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; nt.links.new(m1.outputs[0], fr.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.9; mr.inputs['From Max'].default_value = 0.95
    mr.inputs['To Min'].default_value = 1.0; mr.inputs['To Max'].default_value = 0.62
    nt.links.new(fr.outputs[0], mr.inputs['Value'])
    def _m(op, a, b):
        n_ = nt.nodes.new('ShaderNodeMath'); n_.operation = op
        for i_, v_ in enumerate((a, b)):
            if isinstance(v_, float): n_.inputs[i_].default_value = v_
            else: nt.links.new(v_, n_.inputs[i_])
        return n_.outputs[0]
    course = _m('FLOOR', m1.outputs[0], 0.0)
    vx = _m('ADD', _m('MULTIPLY', _m('ADD', sep.outputs[0], sep.outputs[1]), 1 / 1.3), _m('MULTIPLY', course, 0.5))
    mr2 = nt.nodes.new('ShaderNodeMapRange'); mr2.inputs['From Min'].default_value = 0.955; mr2.inputs['From Max'].default_value = 0.98
    mr2.inputs['To Min'].default_value = 1.0; mr2.inputs['To Max'].default_value = 0.72
    nt.links.new(_m('FRACT', vx, 0.0), mr2.inputs['Value'])
    joint = _m('MINIMUM', mr.outputs[0], mr2.outputs[0])
    cm = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3):
        nt.links.new(joint, cm.inputs[i])
    nt.links.new(C._mix(nt, src, cm.outputs[0], 1.0, 'MULTIPLY'), bsdf.inputs['Base Color'])
    bp_ = nt.nodes.new('ShaderNodeBump'); bp_.inputs['Strength'].default_value = 0.6; bp_.inputs['Distance'].default_value = 0.02
    nt.links.new(joint, bp_.inputs['Height'])
    nl_ = bsdf.inputs['Normal'].links[0].from_socket
    nt.links.new(nl_, bp_.inputs['Normal']); nt.links.new(bp_.outputs[0], bsdf.inputs['Normal'])

    STONE = C.flat('stone_trim', (0.84, 0.82, 0.76), 0.6, noise=0.15)
    WHITE = C.flat('white_paint', (0.88, 0.88, 0.86), 0.35)
    DOORC = C.flat('door_paint', (0.05, 0.09, 0.07), 0.2, coat=0.7)          # 深绿漆门
    IRON = C.flat('iron', (0.02, 0.02, 0.022), 0.45, metal=0.5)
    BRASS = C.flat('brass', (0.85, 0.65, 0.3), 0.25, metal=1.0)
    GLASS = C.glass('glass', tint=(0.05, 0.06, 0.07))
    GHG = C.glass('glasshouse', tint=(0.25, 0.3, 0.3), rough=0.08)
    AETHER = (0.62, 0.86, 1.0)
    LAMPG = C.flat('lamp_glass', (0.85, 0.93, 1.0), 0.15, emit=AETHER, estr=6.0)
    SLATE = C.pbr('slate', 'roof_slates_02', 2.5, tint=(0.6, 0.64, 0.7), sat=0.5)
    LEAD = C.flat('lead', (0.36, 0.38, 0.4), 0.5, metal=0.3)
    COPPER = C.flat('verdigris', (0.3, 0.45, 0.4), 0.55, noise=0.2)
    POT = C.flat('chimney_pot', (0.36, 0.22, 0.15), 0.85, noise=0.45)
    SOOT = C.flat('cap_weathered', (0.42, 0.4, 0.37), 0.8, noise=0.5)
    PLINTH_M = C.flat('plinth_dark', (0.42, 0.41, 0.38), 0.75, noise=0.3)
    BRICK = C.pbr('brick_red', 'dark_brick_wall', 1.6, tint=(0.95, 0.55, 0.42), value=1.1, sat=0.9, weather=0.25)
    GRASS = C.pbr('grass', 'grass_ground', 4.0, tint=(0.72, 1.0, 0.62), sat=1.1)
    GRAVEL = C.pbr('gravel', 'precast_stone_paving', 2.0, tint=(0.92, 0.88, 0.8), sat=0.5)
    PAVE = C.pbr('paving', 'white_sandstone_blocks_02', 2.0, tint=(0.9, 0.88, 0.83), sat=0.5)
    SOIL = C.flat('soil', (0.12, 0.08, 0.05), 0.95, noise=0.4)
    VEG = C.flat('veg', (0.16, 0.3, 0.1), 0.8, noise=0.4)
    BARK = C.flat('bark', (0.18, 0.14, 0.11), 0.9, noise=0.4)
    LEAF = C.flat('leaf', (0.12, 0.2, 0.08), 0.8, noise=0.45)
    LEAF2 = C.flat('leaf2', (0.1, 0.17, 0.09), 0.8, noise=0.45)
    WATER = C.glass('water', tint=(0.04, 0.1, 0.12), rough=0.03)
    ROCK = C.pbr('rock', 'concrete_wall_008', 5.0, tint=(0.62, 0.52, 0.42), value=1.0, sat=0.4, nstr=2.0)
    ROCK_D = C.flat('rock_dark', (0.2, 0.17, 0.15), 0.95, noise=0.5)
    DECK = C.pbr('pad_deck', 'hangar_concrete_floor', 5.0, tint=(0.8, 0.8, 0.82), sat=0.3)
    STEEL = C.flat('pad_steel', (0.23, 0.25, 0.27), 0.4, metal=0.8)
    PADM = C.flat('pad_mark', (0.72, 0.74, 0.74), 0.7, noise=0.1)
    CAR = C.flat('car_body', (0.78, 0.8, 0.82), 0.25, metal=0.6, coat=0.6)
    CARG = C.glass('car_glass', tint=(0.03, 0.04, 0.05))
    FAR = C.flat('far_island', (0.5, 0.58, 0.7), 1.0, noise=0.1)

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
        mr.inputs['To Min'].default_value = 0.16; mr.inputs['To Max'].default_value = 0.0
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

    Wl = Batch('walls_ext'); R = Batch('roof'); F0 = Batch('floor_0')
    PO = Batch('props_portico'); BW = Batch('props_bow'); WG = Batch('props_wing'); CH = Batch('props_chimneys')
    VR = Batch('props_verandah'); FT = Batch('props_fountain')
    site = Batch('site_ground'); GD = Batch('site_garden'); TR = Batch('site_trees'); DK = Batch('site_dock'); HC = Batch('props_hovercar')

    def wall(B, a, b, z0, z1, holes, m, d0=-SKIN, d1=0.0):
        """a→b 逆时针走向（外法向在右手边）；holes = [(u0, u1, v0, v1)]，u 从 a 量起，v = 世界 z。返回墙面矩阵。"""
        dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy)
        M = C.wall_frame((a[0], a[1], 0.0), (dy / L, -dx / L, 0.0))
        hs = [(u0, u1, max(v0, z0), min(v1, z1)) for (u0, u1, v0, v1) in holes if v1 > z0 and v0 < z1]
        vs = sorted({z0, z1} | {h[2] for h in hs} | {h[3] for h in hs})
        for va, vb in zip(vs[:-1], vs[1:]):
            cov = sorted((h[0], h[1]) for h in hs if h[2] <= va and h[3] >= vb)
            u = 0.0
            for (u0, u1) in cov:
                if u0 > u: C.slab2d(B, M, rect(u, u0, va, vb), d0, d1, m)
                u = max(u, u1)
            if u < L: C.slab2d(B, M, rect(u, L, va, vb), d0, d1, m)
        return M

    def sash(B, M, w, h, rp=2, hood=False, surround=True):
        """推拉窗（细窗棂），M 原点 = 窗洞底边中点、在外皮上。"""
        C.slab2d(B, M, rect(-w / 2, w / 2, 0, h), -0.2, -0.16, GLASS)
        C.frame2d(B, M, rect(-w / 2, w / 2, 0, h), 0.07, -0.19, -0.1, WHITE)
        C.slab2d(B, M, rect(-w / 2, w / 2, h / 2 - 0.03, h / 2 + 0.03), -0.18, -0.11, WHITE)
        for f in (1 / 3, 2 / 3):
            C.slab2d(B, M, rect(-w / 2 + f * w - 0.012, -w / 2 + f * w + 0.012, 0, h), -0.17, -0.13, WHITE)
        for k in range(1, 2 * rp):
            if k == rp: continue
            f = k / (2 * rp)
            C.slab2d(B, M, rect(-w / 2, w / 2, f * h - 0.012, f * h + 0.012), -0.17, -0.13, WHITE)
        C.slab2d(B, M, rect(-w / 2 - 0.12, w / 2 + 0.12, -0.1, 0.0), -0.2, 0.07, STONE)       # 窗台
        if surround:
            C.frame2d(B, M, rect(-w / 2 - 0.14, w / 2 + 0.14, -0.0, h + 0.14), 0.14, 0.0, 0.05, STUCCO)
        if hood:   # 主层窗楣：檐壁 + 小檐口
            C.slab2d(B, M, rect(-w / 2 - 0.16, w / 2 + 0.16, h + 0.14, h + 0.36), 0.0, 0.06, STUCCO)
            C.slab2d(B, M, rect(-w / 2 - 0.26, w / 2 + 0.26, h + 0.36, h + 0.46), 0.0, 0.16, STONE)

    def balconette(B, M, w):
        u0, u1 = -w / 2 - 0.1, w / 2 + 0.1
        C.slab2d(B, M, rect(u0 - 0.05, u1 + 0.05, -0.16, -0.02), 0.0, 0.34, STONE)
        for (va, vb) in ((0.0, 0.05), (0.9, 0.95)):
            C.slab2d(B, M, rect(u0, u1, va, vb), 0.26, 0.3, IRON)
        n = int((u1 - u0) / 0.11)
        for i in range(n + 1):
            u = u0 + i * (u1 - u0) / n
            C.slab2d(B, M, rect(u - 0.01, u + 0.01, 0, 0.92), 0.27, 0.29, IRON)
        for u in (u0, u1):
            C.slab2d(B, M, rect(u - 0.012, u + 0.012, 0, 0.95), 0.02, 0.3, IRON)
        # 下半部一排圆环（铸铁花饰的简化）
        for i in range(n):
            u = u0 + (i + 0.5) * (u1 - u0) / n
            p = M @ Vector((u, 0.25, 0.28)); q = M @ Vector((u, 0.25, 0.28)) - (M.to_3x3() @ Vector((0, 0, 1))) * 0.0
            B.tube([tuple(M @ Vector((u + 0.045 * math.cos(t * math.tau / 8), 0.3 + 0.07 * math.sin(t * math.tau / 8), 0.28))) for t in range(9)], 0.008, IRON, n=4)

    def hip(B, x0, x1, y0, y1, z, h, m):
        d = min(x1 - x0, y1 - y0) / 2
        if x1 - x0 >= y1 - y0:
            ym = (y0 + y1) / 2
            r0, r1 = (x0 + d, ym, z + h), (x1 - d, ym, z + h)
            vs = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), r0, r1]
            fs = [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4), (3, 2, 1, 0)]
        else:
            xm = (x0 + x1) / 2
            r0, r1 = (xm, y0 + d, z + h), (xm, y1 - d, z + h)
            vs = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), r0, r1]
            fs = [(0, 1, 4), (2, 3, 5), (1, 2, 5, 4), (3, 0, 4, 5), (3, 2, 1, 0)]
        B.poly(vs, fs, m)
        for (p, q) in ((vs[0], r0), (vs[3], r0), (vs[1], r1), (vs[2], r1), (r0, r1)) if x1 - x0 >= y1 - y0 else \
                ((vs[0], r0), (vs[1], r0), (vs[2], r1), (vs[3], r1), (r0, r1)):
            if math.dist(p, q) > 0.05:
                B.tube([(p[0], p[1], p[2] + 0.04), (q[0], q[1], q[2] + 0.04)], 0.07, LEAD, n=6)   # 铅皮包脊

    def railing(B, x0, x1, y, zb=0.0, h=1.1, axis='x'):
        def bx(a0, a1, b0, b1, z0, z1):
            if axis == 'x': B.box(a0, a1, b0, b1, z0, z1, IRON)
            else: B.box(b0, b1, a0, a1, z0, z1, IRON)
        bx(x0, x1, y - 0.04, y + 0.04, zb + h - 0.06, zb + h)
        bx(x0, x1, y - 0.03, y + 0.03, zb + 0.1, zb + 0.15)
        n = max(1, int((x1 - x0) / 0.14))
        for i in range(n + 1):
            x = x0 + i * (x1 - x0) / n
            px, py = (x, y) if axis == 'x' else (y, x)
            B.boxc(px, py, zb, 0.025, 0.025, h, IRON)

    def balustrade(B, pts, zb, m, h=0.85):
        """沿折线的石栏杆：宝瓶柱 + 扶手 + 底座"""
        for (p, q) in zip(pts[:-1], pts[1:]):
            L = math.dist(p, q); n = max(1, int(L / 0.32))
            B.strip([(p[0], p[1], zb + 0.06), (q[0], q[1], zb + 0.06)], 0.36, 0.12, m)
            B.strip([(p[0], p[1], zb + h - 0.06), (q[0], q[1], zb + h - 0.06)], 0.4, 0.12, m)
            for i in range(1, n):
                t = i / n
                B.lathe(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, zb + 0.12,
                        [(0.07, 0), (0.11, 0.12), (0.055, 0.42), (0.075, h - 0.24), (0.08, h - 0.18)], m, n=8)
        for p in pts:
            B.boxc(p[0], p[1], zb, 0.4, 0.4, h + 0.04, m)

    # ------------------------------------------------------------ 浮岛：岛面、护沿、岩石底座、屏障
    ring = island_ring()
    site.poly([(x, y, -0.1) for (x, y) in ring], [tuple(range(len(ring)))], GRASS)
    site.poly([(x, y, -0.6) for (x, y) in ring] + [(x, y, -0.1) for (x, y) in ring],
              [(i, (i + 1) % len(ring), len(ring) + (i + 1) % len(ring), len(ring) + i) for i in range(len(ring))], ROCK_D)
    for i in range(len(ring)):   # 石护沿（停机坪口留开）
        (xa, ya), (xb, yb) = ring[i], ring[(i + 1) % len(ring)]
        if xa < -38 and PAD[1] - 3.5 < (ya + yb) / 2 < PAD[1] + 3.5:
            continue
        L = math.hypot(xb - xa, yb - ya); nx, ny = (yb - ya) / L, -(xb - xa) / L
        site.poly([(xa - nx * 0.4, ya - ny * 0.4, -0.1), (xb - nx * 0.4, yb - ny * 0.4, -0.1), (xb, yb, -0.1), (xa, ya, -0.1),
                   (xa - nx * 0.4, ya - ny * 0.4, 0.4), (xb - nx * 0.4, yb - ny * 0.4, 0.4), (xb, yb, 0.4), (xa, ya, 0.4)],
                  [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)], STONE)
    rk = Batch('bg_island_rock')
    levels = [(-0.6, 0.0, 0.0), (-3.5, -0.5, 0.05), (-9.0, -3.0, 0.08), (-16.0, -7.0, 0.1), (-24.0, -12.0, 0.12), (-32.0, -18.0, 0.14)]
    rings = [[(x, y, z) for (x, y) in island_ring(grow=g, jitter=j, seed=11 + k)] for k, (z, g, j) in enumerate(levels)]
    rnd = random.Random(5)
    for k in range(1, len(rings)):
        rings[k] = [(ISL_C[0] + (x - ISL_C[0]) * (1 - 0.06 * k), ISL_C[1] + (y - ISL_C[1]) * (1 - 0.06 * k), z + rnd.uniform(-2, 2)) for (x, y, z) in rings[k]]
    vs = [v for r in rings for v in r]; n = len(ring)
    fs = [(k * n + i, (k + 1) * n + i, (k + 1) * n + (i + 1) % n, k * n + (i + 1) % n) for k in range(len(rings) - 1) for i in range(n)]
    tip = len(vs); vs.append((ISL_C[0] - 3, ISL_C[1] + 2, -52.0))
    k = len(rings) - 1
    fs += [(k * n + i, tip, k * n + (i + 1) % n) for i in range(n)]
    rk.poly(vs, fs, ROCK)
    br = Batch('bg_barrier')
    rb = island_ring(grow=0.3); nb_ = len(rb)
    br.poly([(x, y, 0.0) for (x, y) in rb] + [(x, y, 9.0) for (x, y) in rb],
            [(i, (i + 1) % nb_, nb_ + (i + 1) % nb_, nb_ + i) for i in range(nb_)], BARRIER)

    # ------------------------------------------------------------ 地坪（首层）
    F0.box(X0, X1, Y0, Y1, -0.1, PL, STONE)
    F0.box(WX0, WX1, WY0, WY1, -0.1, 0.3, STONE)
    F0.box(X0 - 0.1, X1 + 0.1, Y0 - 0.1, Y1 + 0.1, -0.1, 0.45, PLINTH_M)         # 勒脚
    F0.lathe(BOW_C[0], BOW_C[1], -0.1, [(BOW_R + 0.1, 0), (BOW_R + 0.1, 0.55)], PLINTH_M, n=BOW_N, a0=-math.pi / 2, a1=math.pi / 2, smooth=False)
    F0.poly([(BOW_C[0] + BOW_R * math.cos(-math.pi / 2 + i * math.pi / BOW_N), BOW_C[1] + BOW_R * math.sin(-math.pi / 2 + i * math.pi / BOW_N), PL)
             for i in range(BOW_N + 1)], [tuple(range(BOW_N + 1))], STONE)

    # ------------------------------------------------------------ 主楼墙体 + 窗
    bays = [-7.2, -3.6, 0.0, 3.6, 7.2]
    faces = {   # 名称: (a, b, 该墙开间的世界坐标 → u)
        'front': ((X1, Y1), (X0, Y1), [X1 - x for x in bays]),
        'rear': ((X0, Y0), (X1, Y0), [x - X0 for x in bays]),
        'west': ((X0, Y1), (X0, Y0), [1.6 + (-Y1) - 0, ]),
    }
    for name, (a, b, us) in faces.items():
        holes_g, holes_f = [], []
        for i, u in enumerate(us):
            if name == 'front' and i == 2:
                holes_g.append((u - 0.95, u + 0.95, PL, PL + 4.0))            # 正门洞（含扇形气窗）
            elif name == 'rear' and i == 2:
                holes_g.append((u - 0.8, u + 0.8, PL, PL + 3.1))
            elif name != 'west':
                holes_g.append((u - GF[1] / 2, u + GF[1] / 2, GF[0], GF[0] + GF[2]))
            if name == 'front' and i == 2:
                holes_f.append((u - 0.8, u + 0.8, 5.95, 8.2))                    # 门廊顶阳台门
            elif name != 'west':
                holes_f.append((u - FF[1] / 2, u + FF[1] / 2, FF[0], FF[0] + FF[2]))
        if name == 'west':   # 西墙北段（服务翼以北）一樘二层窗
            holes_f = [(1.0 - 0.6, 1.0 + 0.6, FF[0], FF[0] + FF[2])]
        M = wall(Wl, a, b, 0.0, BAND, holes_g, STUCCO_R)
        wall(Wl, a, b, BAND, COR, holes_f, STUCCO)
        for (u0, u1, v0, v1) in holes_g:
            if v1 - v0 < 3.5 and u1 - u0 < 1.5:
                sash(Wl, M @ T((u0 + u1) / 2, v0), u1 - u0, v1 - v0, rp=3)
        for (u0, u1, v0, v1) in holes_f:
            uc = (u0 + u1) / 2
            sash(Wl, M @ T(uc, v0), u1 - u0, v1 - v0, rp=2, hood=True)
            if not (name == 'front' and abs(uc - (X1 - 0.0)) < 0.1):
                balconette(Wl, M @ T(uc, v0), u1 - u0)
    # 东墙（弓窗后面）实墙
    wall(Wl, (X1, Y0), (X1, Y1), 0.0, BAND, [], STUCCO_R)
    wall(Wl, (X1, Y0), (X1, Y1), BAND, COR, [], STUCCO)
    # 石线脚、檐口、女儿墙
    Wl.box(X0 - 0.08, X1 + 0.08, Y0 - 0.08, Y1 + 0.08, BAND, BAND + 0.2, STONE)
    Wl.box(X0 - 0.1, X1 + 0.1, Y0 - 0.1, Y1 + 0.1, COR - 0.3, COR, STUCCO)
    Wl.box(X0 - 0.3, X1 + 0.3, Y0 - 0.3, Y1 + 0.3, COR, COR + 0.15, STONE)
    Wl.box(X0 - 0.5, X1 + 0.5, Y0 - 0.5, Y1 + 0.5, COR + 0.15, COR + 0.32, STONE)
    PT = COR + 1.0
    for (xa, xb, ya, yb) in ((X0 - 0.1, X1 + 0.1, Y1 - 0.2, Y1 + 0.1), (X0 - 0.1, X1 + 0.1, Y0 - 0.1, Y0 + 0.2),
                             (X0 - 0.1, X0 + 0.2, Y0, Y1), (X1 - 0.2, X1 + 0.1, Y0, Y1)):
        Wl.box(xa, xb, ya, yb, COR + 0.32, PT, STUCCO)
        Wl.box(xa - 0.06, xb + 0.06, ya - 0.06, yb + 0.06, PT, PT + 0.1, STONE)
    Wl.box(X0, X1, Y0, Y1, COR + 0.32, COR + 0.42, LEAD)
    # 四坡屋顶（低坡，藏在女儿墙后）
    hip(R, X0 + 0.3, X1 - 0.3, Y0 + 0.3, Y1 - 0.3, COR + 0.42, 2.3, SLATE)

    # 烟囱：两组，落在屋面东西两段
    for (cx, cy) in ((-4.8, -2.4), (4.8, -2.4), (-4.8, -10.6), (4.8, -10.6)):
        CH.boxc(cx, cy, COR, 2.0, 0.85, 4.1, STUCCO)
        CH.boxc(cx, cy, COR + 3.55, 2.2, 1.05, 0.14, SOOT)
        CH.boxc(cx, cy, COR + 4.1, 2.18, 1.03, 0.16, SOOT)
        for j in range(3):
            CH.cyl(cx - 0.6 + 0.6 * j, cy, COR + 4.26, 0.15, 0.55 + 0.1 * (j % 2), POT, 10, r2=0.12)
            CH.cyl(cx - 0.6 + 0.6 * j, cy, COR + 4.81 + 0.1 * (j % 2), 0.14, 0.05, POT, 10)

    # ------------------------------------------------------------ 东侧整高弓形凸窗（七折面）
    bx, by = BOW_C
    angs = [-math.pi / 2 + i * math.pi / BOW_N for i in range(BOW_N + 1)]
    bpts = [(bx + BOW_R * math.cos(a), by + BOW_R * math.sin(a)) for a in angs]
    flen = math.dist(bpts[0], bpts[1])
    for i in range(BOW_N):
        a, b = bpts[i], bpts[i + 1]
        win = i % 2 == 1
        hg = [(flen / 2 - 0.55, flen / 2 + 0.55, GF[0], GF[0] + GF[2])] if win else []
        hf = [(flen / 2 - 0.52, flen / 2 + 0.52, FF[0], FF[0] + FF[2])] if win else []
        M = wall(BW, a, b, 0.0, BAND, hg, STUCCO_R)
        wall(BW, a, b, BAND, COR, hf, STUCCO)
        if win:
            sash(BW, M @ T(flen / 2, GF[0]), 1.1, GF[2], rp=3, surround=False)
            sash(BW, M @ T(flen / 2, FF[0]), 1.04, FF[2], rp=2, surround=False)
            balconette(BW, M @ T(flen / 2, FF[0]), 1.04)
    kw = dict(n=BOW_N, a0=-math.pi / 2, a1=math.pi / 2, smooth=False)
    BW.lathe(bx, by, BAND, [(BOW_R + 0.08, 0), (BOW_R + 0.08, 0.2)], STONE, **kw)
    BW.lathe(bx, by, COR - 0.3, [(BOW_R + 0.1, 0), (BOW_R + 0.1, 0.3), (BOW_R + 0.3, 0.3), (BOW_R + 0.3, 0.45),
                                 (BOW_R + 0.5, 0.45), (BOW_R + 0.5, 0.62), (BOW_R + 0.1, 0.62)], STONE, **kw)
    BW.lathe(bx, by, COR + 0.32, [(BOW_R + 0.45, 0), (BOW_R + 0.2, 0.25), (1.6, 1.9), (0.08, 2.75)], SLATE, n=21, a0=-math.pi / 2, a1=math.pi / 2)   # 板岩半锥顶（略呈钟形）
    BW.lathe(bx, by, COR + 0.32, [(BOW_R + 0.47, 0.0), (BOW_R + 0.47, 0.08)], LEAD, n=21, a0=-math.pi / 2, a1=math.pi / 2)
    for k in range(8):   # 铅皮包脊
        a = -math.pi / 2 + (k + 0.5) * math.pi / 8
        BW.tube([(bx + (BOW_R + 0.25) * math.cos(a), by + (BOW_R + 0.25) * math.sin(a), COR + 0.58), (bx + 0.1 * math.cos(a), by + 0.1 * math.sin(a), COR + 3.1)], 0.045, LEAD, n=5)
    BW.sphere(bx + 0.05, by, COR + 3.12, 0.13, LEAD, seg=10, rings=6)
    BW.poly([(bx + (BOW_R + 0.5) * math.cos(a), by + (BOW_R + 0.5) * math.sin(a), COR + 0.32) for a in angs], [tuple(range(BOW_N + 1))], LEAD)

    # ------------------------------------------------------------ 爱奥尼门廊（四柱）+ 正门
    py0, py1 = Y1, Y1 + 3.4
    PO.box(-4.3, 4.3, py0, py1, -0.1, PL, STONE)
    for k in range(3):
        PO.box(-3.4, 3.4, py1 + 0.35 * k, py1 + 0.35 * (k + 1), -0.1, PL - 0.2 * (k + 1), STONE)
    CZ = 4.85   # 柱顶
    for x in (-3.3, -1.1, 1.1, 3.3):
        y = py1 - 0.5
        PO.boxc(x, y, PL, 0.78, 0.78, 0.14, STONE)
        PO.lathe(x, y, PL + 0.14, [(0.36, 0), (0.37, 0.06), (0.33, 0.14), (0.3, 0.2)], STUCCO, n=20)
        PO.cyl(x, y, PL + 0.34, 0.3, CZ - PL - 0.6, STUCCO, 20, r2=0.255)
        PO.lathe(x, y, CZ - 0.34, [(0.26, 0), (0.29, 0.03), (0.26, 0.06), (0.3, 0.12), (0.34, 0.2), (0.3, 0.24)], STUCCO, n=24)   # 颈线 + 卵箭饰钟形
        for s in (-1, 1):   # 卷涡：侧面枕垫（中间收腰）+ 前后两面各一个螺旋
            PO.tube([(x + s * 0.3, y - 0.34, CZ - 0.2), (x + s * 0.3, y - 0.12, CZ - 0.17), (x + s * 0.3, y + 0.12, CZ - 0.17), (x + s * 0.3, y + 0.34, CZ - 0.2)], 0.1, STUCCO, n=12)
            for e in (-1, 1):
                cx_, cy_, cz_ = x + s * 0.3, y + e * 0.35, CZ - 0.2
                disc = [(cx_ + 0.15 * math.cos(t * math.tau / 20), cy_, cz_ + 0.15 * math.sin(t * math.tau / 20)) for t in range(20)]
                PO.poly(disc, [tuple(range(20)) if e < 0 else tuple(range(19, -1, -1))], STUCCO)
                sp = []
                for t in range(46):
                    ang = math.pi / 2 + s * t / 45 * 2.4 * math.tau
                    rad = 0.15 * (1 - t / 52)
                    sp.append((cx_ + rad * math.cos(ang), cy_ + e * 0.015, cz_ + rad * math.sin(ang)))
                PO.tube(sp, 0.018, STUCCO, n=5)
                PO.sphere(cx_, cy_ + e * 0.02, cz_, 0.035, STUCCO, seg=8, rings=5)
            PO.box(min(x, x + s * 0.3), max(x, x + s * 0.3), y - 0.33, y + 0.33, CZ - 0.08, CZ - 0.05, STUCCO)   # 卷涡之间的带
        PO.boxc(x, y, CZ - 0.07, 0.76, 0.76, 0.04, STUCCO)   # 薄顶板（带线脚）
        PO.boxc(x, y, CZ - 0.03, 0.8, 0.8, 0.03, STUCCO)
    ez = CZ
    ay = py1 - 0.5 + 0.3   # 额枋外皮对齐柱颈
    for k, (z0_, z1_, o) in enumerate(((0.0, 0.09, 0.0), (0.09, 0.19, 0.025), (0.19, 0.3, 0.05), (0.3, 0.34, 0.08))):   # 三道横带的额枋 + 顶线
        PO.box(-3.62 - o, 3.62 + o, py0, ay + o, ez + z0_, ez + z1_, STUCCO)
    PO.box(-3.6, 3.6, py0, ay - 0.02, ez + 0.34, ez + 0.62, STUCCO)                    # 素面檐壁（退进）
    PO.box(-3.7, 3.7, py0, ay + 0.1, ez + 0.62, ez + 0.67, STONE)                      # 檐下线脚
    for i in range(34):   # 齿饰
        x = -3.6 + i * 7.2 / 33
        PO.boxc(x, ay + 0.14, ez + 0.67, 0.09, 0.1, 0.09, STUCCO)
    PO.box(-3.75, 3.75, py0, ay + 0.1, ez + 0.67, ez + 0.76, STUCCO)
    PO.box(-4.05, 4.05, py0, ay + 0.48, ez + 0.76, ez + 0.9, STONE)                    # 檐口挑板（下方有退进阴影）
    PO.box(-4.1, 4.1, py0, ay + 0.52, ez + 0.9, ez + 0.98, STONE)
    balustrade(PO, [(-4.0, py0 + 0.2), (-4.0, py1 + 0.15), (4.0, py1 + 0.15), (4.0, py0 + 0.2)], ez + 0.98, STUCCO)
    # 正门：双扇六镶板 + 扇形气窗
    M = C.wall_frame((0, Y1, PL), (0, 1, 0))
    dw, dh = 1.9, 3.0
    C.slab2d(PO, M, rect(-dw / 2, dw / 2, 0, dh), -0.24, -0.16, DOORC)
    for s in (-1, 1):
        for (v0, v1) in ((0.18, 0.95), (1.1, 1.9), (2.05, 2.8)):
            C.frame2d(PO, M, rect(s * 0.07 if s > 0 else -0.87, 0.87 if s > 0 else -0.07, v0, v1), 0.05, -0.16, -0.13, DOORC)
    C.slab2d(PO, M, rect(-0.015, 0.015, 0, dh), -0.17, -0.12, DOORC)
    C.frame2d(PO, M, rect(-dw / 2, dw / 2, 0, dh), 0.08, -0.25, -0.05, WHITE)
    fan = [(-dw / 2, dh), (dw / 2, dh)] + [(dw / 2 * math.cos(k * math.pi / 12), dh + dw / 2 * math.sin(k * math.pi / 12) * 0.95) for k in range(1, 12)]
    C.slab2d(PO, M, fan, -0.24, -0.2, GLASS)
    for k in range(1, 8):
        a = k * math.pi / 8
        C.slab2d(PO, M @ T(0, dh) @ Matrix.Rotation(a - math.pi / 2, 4, 'Z'), rect(-0.012, 0.012, 0.0, dw / 2 * 0.95), -0.21, -0.16, WHITE)
    C.frame2d(PO, M, fan, 0.07, -0.22, -0.05, WHITE)
    C.slab2d(PO, M, rect(-dw / 2, dw / 2, dh - 0.05, dh + 0.04), -0.23, -0.1, WHITE)
    for s in (-1, 1):   # 黄铜门把
        p = M @ Vector((s * 0.2, 1.1, -0.12))
        PO.sphere(p.x, p.y, p.z, 0.04, BRASS, seg=8, rings=5)
    lp = (0.0, py1 - 1.6, ez - 0.05)   # 门廊顶下挂灯
    PO.cyl(lp[0], lp[1], lp[2] - 0.55, 0.012, 0.55, IRON, 6)
    PO.cyl(lp[0], lp[1], lp[2] - 1.05, 0.15, 0.5, LAMPG, 8, r2=0.2)
    PO.cyl(lp[0], lp[1], lp[2] - 0.58, 0.22, 0.06, IRON, 8, r2=0.05)
    # 门廊顶上的二层阳台门（落地窗）已在正立面中开间；门廊两侧小灯柱
    for s in (-1, 1):
        PO.cyl(s * 5.0, py1 + 1.6, 0.0, 0.12, 0.35, IRON, 10)
        PO.cyl(s * 5.0, py1 + 1.6, 0.35, 0.05, 2.3, IRON, 8)
        PO.cyl(s * 5.0, py1 + 1.6, 2.65, 0.14, 0.4, LAMPG, 6, r2=0.2, smooth=False)
        PO.cyl(s * 5.0, py1 + 1.6, 3.05, 0.25, 0.14, IRON, 6, r2=0.02, smooth=False)

    # ------------------------------------------------------------ 背面铸铁游廊（帐篷式铜皮顶）
    vy0, vy1 = Y0 - 2.8, Y0
    VR.box(-7.8, 7.8, vy0, vy1, -0.1, PL - 0.05, STONE)
    for k in range(2):
        VR.box(-1.6, 1.6, vy0 - 0.35 * (k + 1), vy0 - 0.35 * k, -0.1, PL - 0.05 - 0.2 * (k + 1), STONE)
    vz = 3.9
    xs = [-7.5 + i * 15.0 / 6 for i in range(7)]
    for x in xs:
        VR.cyl(x, vy0 + 0.2, PL, 0.06, vz - PL, IRON, 8)
        # 柱头处的弧形托架
        VR.tube([(x - 0.55, vy0 + 0.2, vz - 0.02), (x - 0.25, vy0 + 0.2, vz - 0.25), (x, vy0 + 0.2, vz - 0.55),
                 (x + 0.25, vy0 + 0.2, vz - 0.25), (x + 0.55, vy0 + 0.2, vz - 0.02)], 0.02, IRON, n=5)
    VR.box(-7.6, 7.6, vy0 + 0.15, vy0 + 0.25, vz - 0.05, vz + 0.05, IRON)
    VR.box(-7.6, 7.6, vy0 + 0.17, vy0 + 0.23, vz - 0.35, vz - 0.3, IRON)
    for i in range(60):   # 檐下格栅
        x = -7.5 + i * 15 / 59
        VR.box(x - 0.012, x + 0.012, vy0 + 0.17, vy0 + 0.23, vz - 0.3, vz - 0.05, IRON)
    # 铜皮顶：钟形曲面（外沿翘起）
    prof = [(vy0 - 0.25, vz - 0.05), (vy0 + 0.3, vz + 0.12), (vy0 + 1.0, vz + 0.55), (vy1 - 0.05, vz + 0.95)]
    vv = [(x, y, z) for (y, z) in prof for x in (-7.8, 7.8)]
    VR.poly(vv, [(2 * i + 1, 2 * i, 2 * i + 2, 2 * i + 3) for i in range(len(prof) - 1)], COPPER)
    VR.poly(vv, [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(prof) - 1)], COPPER)
    for s in (-1, 1):
        VR.poly([(s * 7.8, y, z) for (y, z) in prof] + [(s * 7.8, vy1, vz - 0.05)], [tuple(range(len(prof) + 1))], COPPER)
        VR.poly([(s * 7.8, y, z) for (y, z) in prof] + [(s * 7.8, vy1, vz - 0.05)], [tuple(range(len(prof), -1, -1))], COPPER)
    for i in range(int(15.6 / 0.55)):   # 铜皮直立缝
        x = -7.8 + (i + 0.5) * 0.55
        VR.strip([(x, y, z + 0.02) for (y, z) in prof], 0.03, 0.03, COPPER)
    railing(VR, -7.5, -1.7, vy0 + 0.2, zb=PL, h=0.9)
    railing(VR, 1.7, 7.5, vy0 + 0.2, zb=PL, h=0.9)
    # 背面中门（落地双扇玻璃门）
    M = C.wall_frame((0, Y0, PL), (0, -1, 0))
    C.slab2d(VR, M, rect(-0.8, 0.8, 0, 3.1), -0.22, -0.18, GLASS)
    C.frame2d(VR, M, rect(-0.8, 0.8, 0, 3.1), 0.08, -0.22, -0.1, WHITE)
    C.slab2d(VR, M, rect(-0.03, 0.03, 0, 3.1), -0.21, -0.12, WHITE)
    for v in (0.5, 1.2, 1.9, 2.6):
        C.slab2d(VR, M, rect(-0.8, 0.8, v - 0.012, v + 0.012), -0.2, -0.15, WHITE)

    # ------------------------------------------------------------ 服务翼（西侧，两层，较低）
    wg_bays = [-15.3, -13.0, -10.7]
    wfaces = [((WX1, WY1), (WX0, WY1), [WX1 - x for x in wg_bays]),
              ((WX0, WY0), (WX1, WY0), [x - WX0 for x in wg_bays]),
              ((WX0, WY1), (WX0, WY0), [2.2, 5.8])]
    for fi, (a, b, us) in enumerate(wfaces):
        hg, hf = [], []
        for i, u in enumerate(us):
            if fi == 0 and i == 1:
                hg.append((u - 0.55, u + 0.55, 0.3, 2.65))    # 服务门
            else:
                hg.append((u - 0.5, u + 0.5, 1.1, 2.75))
            hf.append((u - 0.5, u + 0.5, 3.9, 5.5))
        M = wall(WG, a, b, 0.0, 3.35, hg, STUCCO_R)
        wall(WG, a, b, 3.35, WCOR, hf, STUCCO)
        for (u0, u1, v0, v1) in hg + hf:
            if v0 < 0.5:
                Md = M @ T((u0 + u1) / 2, v0)
                C.slab2d(WG, Md, rect(-0.55, 0.55, 0, 2.35), -0.2, -0.14, DOORC)
                C.frame2d(WG, Md, rect(-0.55, 0.55, 0, 2.35), 0.07, -0.2, 0.04, WHITE)
                C.slab2d(WG, Md, rect(-0.75, 0.75, 2.45, 2.6), 0.0, 0.3, STONE)
            else:
                sash(WG, M @ T((u0 + u1) / 2, v0), u1 - u0, v1 - v0, rp=2)
    WG.box(WX0 - 0.06, WX1, WY0 - 0.06, WY1 + 0.06, 3.35, 3.5, STONE)
    WG.box(WX0 - 0.3, WX1, WY0 - 0.3, WY1 + 0.3, WCOR, WCOR + 0.2, STONE)
    WG.box(WX0 - 0.1, WX1, WY0 - 0.1, WY1 + 0.1, WCOR - 0.25, WCOR, STUCCO)
    hip(WG, WX0 - 0.35, WX1, WY0 - 0.35, WY1 + 0.35, WCOR + 0.2, 1.9, SLATE)
    WG.boxc(-13.0, -6.0, WCOR, 1.6, 0.8, 3.4, STUCCO)
    WG.boxc(-13.0, -6.0, WCOR + 3.4, 1.8, 1.0, 0.15, STONE)
    for j in range(2):
        WG.cyl(-13.35 + 0.7 * j, -6.0, WCOR + 3.55, 0.14, 0.5, POT, 10, r2=0.11)
    # 服务院：翼楼前的小砖墙院 + 铺地
    site.box(-19.5, WX1, WY1, WY1 + 4.5, -0.1, 0.02, PAVE)

    # ------------------------------------------------------------ 前庭：砾石圆庭 + 喷泉
    fx, fy = FC
    site.cyl(fx, fy, -0.1, 12.5, 0.13, GRAVEL, 64, smooth=False)
    site.box(-5.0, 5.0, Y1 + 3.0, fy - 10, -0.1, 0.03, GRAVEL)
    site.box(-44.0, fx - 10.0, fy - 2.3, fy + 2.3, -0.1, 0.03, GRAVEL)          # 通往停机坪的车道
    site.box(fx + 10.0, 14.2, fy - 1.2, fy + 1.2, -0.1, 0.03, GRAVEL)
    site.box(12.0, 14.2, GY1 + 0.5, fy + 1.2, -0.1, 0.03, GRAVEL)                 # 去菜园的小径
    site.box(9.0, 12.0, GY1 + 0.5, GY1 + 2.5, -0.1, 0.03, GRAVEL)
    site.cyl(fx, fy, 0.0, 12.5, 0.12, STONE, 64, cap=False, smooth=False) if False else None
    FT.lathe(fx, fy, 0.0, [(3.6, 0), (3.6, 0.45), (3.75, 0.5), (3.75, 0.62), (3.3, 0.62), (3.3, 0.1), (0.1, 0.1)], STONE, n=48)
    FT.cyl(fx, fy, 0.1, 3.32, 0.3, WATER, 48)
    FT.lathe(fx, fy, 0.1, [(0.55, 0), (0.45, 0.25), (0.28, 0.4), (0.25, 1.2), (0.38, 1.35), (1.3, 1.5), (1.45, 1.75),
                           (1.3, 1.8), (0.2, 1.7)], STONE, n=32)
    FT.cyl(fx, fy, 1.72, 1.28, 0.02, WATER, 32)
    FT.lathe(fx, fy, 1.75, [(0.18, 0), (0.14, 0.6), (0.5, 0.75), (0.55, 0.9), (0.45, 0.93), (0.1, 0.9), (0.06, 1.2), (0.1, 1.3), (0.0, 1.38)], STONE, n=24)
    for k in range(4):   # 前庭四角的修剪球形灌木（盆栽）
        a = math.pi / 4 + k * math.pi / 2
        x, y = fx + 8.5 * math.cos(a), fy + 8.5 * math.sin(a)
        FT.cyl(x, y, 0.0, 0.5, 0.7, STONE, 16, r2=0.6)
        C.tree(FT, x, y, 1.9, 0.5, 'yew_col', seed=40 + k, z=0.7)

    # ------------------------------------------------------------ 围墙菜园（红砖）+ 靠墙温室
    gt = 0.35; wh = 2.9
    for (x0, x1, y0, y1) in ((GX0, 9.0, GY1 - gt, GY1), (11.0, GX1, GY1 - gt, GY1), (GX0, GX1, GY0, GY0 + gt),
                             (GX0, GX0 + gt, GY0, GY1), (GX1 - gt, GX1, GY0, GY1)):
        GD.box(x0, x1, y0, y1, -0.1, wh, BRICK)
        GD.box(x0 - 0.06, x1 + 0.06, y0 - 0.06, y1 + 0.06, wh, wh + 0.12, STONE)
        L = max(x1 - x0, y1 - y0)
        for i in range(int(L / 4.5) + 1):   # 砖扶壁
            if x1 - x0 > y1 - y0:
                GD.boxc(x0 + i * (x1 - x0) / max(1, int(L / 4.5)), (y0 + y1) / 2, -0.1, 0.5, gt + 0.3, wh - 0.3, BRICK)
            else:
                GD.boxc((x0 + x1) / 2, y0 + i * (y1 - y0) / max(1, int(L / 4.5)), -0.1, gt + 0.3, 0.5, wh - 0.3, BRICK)
    for x in (8.75, 11.25):   # 门墩 + 铁门
        GD.boxc(x, GY1 - gt / 2, -0.1, 0.6, 0.6, wh + 0.5, BRICK)
        GD.boxc(x, GY1 - gt / 2, wh + 0.4, 0.7, 0.7, 0.14, STONE)
        GD.sphere(x, GY1 - gt / 2, wh + 0.75, 0.22, STONE, seg=12, rings=8)
    railing(GD, 9.05, 10.95, GY1 - gt / 2, zb=0.0, h=2.1)
    gcx, gcy = 10.0, (GY0 + GY1) / 2
    GD.box(GX0 + gt, GX1 - gt, GY0 + gt, GY1 - gt, -0.1, 0.0, GRAVEL)
    beds = []
    for (xa, xb) in ((GX0 + 1.5, gcx - 1.0), (gcx + 1.0, GX1 - 1.5)):
        for (ya, yb) in ((GY0 + 5.0, gcy - 1.0), (gcy + 1.0, GY1 - 1.5)):
            beds.append((xa, xb, ya, yb))
    rv = random.Random(9)
    for (xa, xb, ya, yb) in beds:
        GD.box(xa, xb, ya, yb, -0.05, 0.28, BRICK)
        GD.box(xa + 0.12, xb - 0.12, ya + 0.12, yb - 0.12, 0.2, 0.32, SOIL)
        nrow = int((yb - ya - 0.4) / 0.9)
        for r in range(nrow):
            y = ya + 0.5 + r * 0.9
            kind = rv.randint(0, 2)
            n = int((xb - xa - 0.5) / 0.45)
            for i in range(n):
                x = xa + 0.35 + i * 0.45
                if kind == 0:
                    GD.sphere(x, y, 0.42, 0.2, VEG, sz=0.7, seg=8, rings=5)
                elif kind == 1:
                    GD.cyl(x, y, 0.32, 0.12, 0.45, VEG, 6, r2=0.02, smooth=False)
                else:
                    GD.sphere(x, y, 0.36, 0.17, LEAF, sz=0.5, seg=8, rings=5)
    GD.cyl(gcx, gcy, 0.0, 0.9, 0.5, STONE, 24)   # 中心浸水池
    GD.cyl(gcx, gcy, 0.45, 0.78, 0.03, WATER, 24)
    for x in [GX0 + 1.2 + i * 2.6 for i in range(9)]:   # 靠墙的果树（修剪成扇形的矮树）
        if GX0 + 0.5 < x < GX1 - 0.5:
            GD.cyl(x, GY1 - 0.7, 0.0, 0.07, 1.2, BARK, 6)
            GD.sphere(x, GY1 - 0.65, 1.7, 0.95, LEAF, sz=0.9, seg=10, rings=6, sx=1.0) if False else \
                GD.box(x - 1.0, x + 1.0, GY1 - 0.75, GY1 - 0.5, 0.6, 2.4, LEAF)
    # 靠南墙（-y）内侧的单坡温室：白框 + 玻璃
    hx0, hx1, hy0, hy1 = GX0 + 2.0, GX1 - 2.0, GY0 + gt, GY0 + gt + 3.2
    GD.box(hx0, hx1, hy0, hy1, -0.05, 0.6, BRICK)
    GD.poly([(hx0, hy1, 0.6), (hx1, hy1, 0.6), (hx1, hy1, 2.1), (hx0, hy1, 2.1)], [(0, 1, 2, 3)], GHG)
    GD.poly([(hx0, hy1, 2.1), (hx1, hy1, 2.1), (hx1, hy0, 3.6), (hx0, hy0, 3.6)], [(0, 1, 2, 3)], GHG)
    for s in (hx0, hx1):
        GD.poly([(s, hy0, 0.6), (s, hy1, 0.6), (s, hy1, 2.1), (s, hy0, 3.6)], [(0, 1, 2, 3), (3, 2, 1, 0)], GHG)
    nm = int((hx1 - hx0) / 0.9)
    for i in range(nm + 1):
        x = hx0 + i * (hx1 - hx0) / nm
        GD.strip([(x, hy1 + 0.02, 0.6), (x, hy1 + 0.02, 2.1), (x, hy0, 3.62)], 0.05, 0.06, WHITE)
    GD.strip([(hx0, hy1 + 0.02, 2.1), (hx1, hy1 + 0.02, 2.1)], 0.08, 0.08, WHITE)
    GD.strip([(hx0, hy0 + 0.05, 3.62), (hx1, hy0 + 0.05, 3.62)], 0.1, 0.1, WHITE)
    GD.strip([(hx0, hy1 + 0.02, 0.62), (hx1, hy1 + 0.02, 0.62)], 0.08, 0.06, WHITE)

    # ------------------------------------------------------------ 树圈 + 草坪上的零散灌丛
    rt = random.Random(3)

    _tk = [0]

    def tree(x, y, h, r, m=None, kind=None):
        _tk[0] += 1
        kind = kind or ('cedar' if _tk[0] % 5 == 0 else 'oak')
        C.tree(TR, x, y, h * (1.25 if kind == 'cedar' else 1.0), r * (1.4 if kind == 'cedar' else 1.0), kind, seed=100 + _tk[0])

    for i in range(34):
        a = i * math.tau / 34 + 0.05
        rr = 35.5 + rt.uniform(-1.5, 1.5)
        c, s = math.cos(a), math.sin(a)
        x = ISL_C[0] + rr * (abs(c) ** 0.5) * (1 if c >= 0 else -1) * 0.98
        y = ISL_C[1] + rr * (abs(s) ** 0.5) * (1 if s >= 0 else -1) * 0.96
        if GX0 - 3 < x < GX1 + 3 and GY0 - 3 < y < GY1 + 3: continue
        if x < -24 and -6 < y < 36: continue                               # 车道口与停机坪留空
        if y > 18 or x > 14: continue                                      # 两个主视角（东、南前方）留出视野
        tree(x, y, rt.uniform(7, 10), rt.uniform(2.8, 4.0), LEAF if i % 2 else LEAF2)
    for (x, y) in ((-24, -24), (-26, -32), (-14, -30), (31, -1), (30, 24)):
        tree(x, y, rt.uniform(7, 10), rt.uniform(3, 4.2))
    # 东南草坪：孤植大树 + 修剪黄杨球 + 环岛碎石步道 + 长椅，免得草坪空着
    HEDGE = C.flat('hedge', (0.09, 0.17, 0.06), 0.85, noise=0.4)
    for (x, y, h, r, kd) in ((38, -6, 11, 5.0, 'cedar'), (36, -22, 9, 3.8, 'oak'), (26, 30, 8, 3.4, 'oak'), (6, 36, 7, 3.2, 'oak'), (34, 12, 8, 3.6, 'oak')):
        tree(x, y, h, r, kind=kd)
    for k in range(18):
        a = -1.1 + k * 0.13
        x, y = 12 + 22 * math.cos(a), -2 + 22 * math.sin(a)
        C.tree(GD, x, y, 1.6 if k % 2 else 1.1, 0.5 if k % 2 else 0.45, 'yew' if k % 2 else 'yew_col', seed=60 + k)
    for i in range(72):
        a0, a1 = i * math.tau / 72, (i + 1) * math.tau / 72
        pts = [(ISL_C[0] + 38.5 * math.cos(a) * 0.98, ISL_C[1] + 38.5 * math.sin(a) * 0.96) for a in (a0, a1)]
        (xa, ya), (xb, yb) = pts
        if GX0 - 2 < (xa + xb) / 2 < GX1 + 2 and GY0 - 2 < (ya + yb) / 2 < GY1 + 2: continue
        L = math.hypot(xb - xa, yb - ya); nx, ny = (yb - ya) / L * 0.9, -(xb - xa) / L * 0.9
        GD.poly([(xa - nx, ya - ny, -0.06), (xb - nx, yb - ny, -0.06), (xb + nx, yb + ny, -0.06), (xa + nx, ya + ny, -0.06)], [(0, 1, 2, 3)], GRAVEL)

    # ------------------------------------------------------------ 私家悬浮车停机坪（岛西缘外挑）+ 一辆悬浮车
    px, py, pr = PAD
    DK.cyl(px, py, -0.5, pr + 0.3, 0.48, STEEL, 48, smooth=False)
    DK.cyl(px, py, -0.02, pr, 0.02, DECK, 48, smooth=False)
    DK.lathe(px, py, 0.0, [(pr - 0.5, 0.005), (pr - 0.3, 0.005)], PADM, n=48) if False else None
    DK.cyl(px, py, 0.0, pr - 0.35, 0.012, PADM, 48, smooth=False)
    DK.cyl(px, py, 0.0, pr - 0.65, 0.02, DECK, 48, smooth=False)
    DK.box(px + 2.0, -43.5, py - 2.3, py + 2.3, -0.5, -0.02, DECK)                  # 连桥
    DK.box(px + 2.0, -43.5, py - 2.45, py + 2.45, -0.8, -0.5, STEEL)
    for i in range(24):   # 圆周栏杆（车道一侧留口）
        a0 = i * math.tau / 24; a1 = (i + 1) * math.tau / 24
        am = (a0 + a1) / 2
        if abs(math.atan2(math.sin(am), math.cos(am))) < 0.45: continue
        p0 = (px + (pr - 0.1) * math.cos(a0), py + (pr - 0.1) * math.sin(a0)); p1 = (px + (pr - 0.1) * math.cos(a1), py + (pr - 0.1) * math.sin(a1))
        DK.strip([(p0[0], p0[1], 1.05), (p1[0], p1[1], 1.05)], 0.06, 0.06, IRON)
        DK.strip([(p0[0], p0[1], 0.15), (p1[0], p1[1], 0.15)], 0.04, 0.04, IRON)
        DK.cyl(p0[0], p0[1], 0.0, 0.03, 1.08, IRON, 6)
        for t in (0.25, 0.5, 0.75):
            DK.cyl(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, 0.0, 0.015, 1.05, IRON, 4)
    for k in range(6):   # 边缘导航灯
        a = math.pi / 6 + k * math.pi / 3
        if abs(math.atan2(math.sin(a), math.cos(a))) < 0.5: continue
        DK.cyl(px + (pr + 0.05) * math.cos(a), py + (pr + 0.05) * math.sin(a), -0.1, 0.12, 0.2, LAMPG, 10)
    for k in range(4):   # 斜撑回岩体
        a = math.pi / 2 + k * math.pi / 3
        DK.tube([(px + (pr - 1) * math.cos(a), py + (pr - 1) * math.sin(a), -0.5), (-41.0, py + 5 * math.sin(a), -12.0)], 0.25, STEEL, n=10)
    kx, ky = -45.5, py + 4.2   # 候机小亭：四根铸铁柱 + 铜皮四坡顶 + 长椅
    DK.box(kx - 2.0, kx + 2.0, ky - 1.3, ky + 1.3, -0.1, 0.1, PAVE)
    for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        DK.cyl(kx + ex * 1.7, ky + ey * 1.0, 0.1, 0.06, 2.5, IRON, 8)
    DK.box(kx - 1.85, kx + 1.85, ky - 1.15, ky + 1.15, 2.6, 2.72, IRON)
    hip(DK, kx - 2.1, kx + 2.1, ky - 1.4, ky + 1.4, 2.72, 0.8, COPPER)
    DK.box(kx - 1.2, kx + 1.2, ky + 0.55, ky + 0.95, 0.45, 0.52, DOORC)
    DK.box(kx - 1.2, kx + 1.2, ky + 0.9, ky + 0.97, 0.52, 1.0, DOORC)
    for ex in (-1, 1):
        DK.box(kx + ex * 1.1 - 0.04, kx + ex * 1.1 + 0.04, ky + 0.55, ky + 0.95, 0.1, 0.45, IRON)
    cx, cy, cz = px - 0.5, py, 1.35
    HC.sphere(cx, cy, cz, 1.0, CAR, sz=0.5, seg=24, rings=12, sx=2.3)
    HC.sphere(cx + 0.3, cy, cz + 0.3, 0.8, CARG, sz=0.55, seg=20, rings=10, sx=1.5, zmin=0.0)
    for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        qx, qy = cx + ex * 1.7, cy + ey * 1.2
        HC.cyl(qx, qy, cz - 0.3, 0.55, 0.3, CAR, 20)
        HC.cyl(qx, qy, cz - 0.33, 0.42, 0.02, LAMPG, 16)
        HC.box(min(cx + ex * 0.9, qx), max(cx + ex * 0.9, qx), qy - 0.08 * ey - 0.08, qy - 0.08 * ey + 0.08, cz - 0.2, cz - 0.05, CAR)

    # ------------------------------------------------------------ 背景：云海、远处中层、远处浮岛
    cl = Batch('bg_clouds')
    MIDC = C.flat('bg_midcity', (0.16, 0.2, 0.28), 1.0, noise=0.15)
    mc = Batch('bg_midcity')
    mc.box(-6000, 6000, -6000, 6000, -760, -750, MIDC)
    rnd = random.Random(8)
    for k in range(10):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(1100, 2200)
        x, y = ISL_C[0] + d * math.cos(a), ISL_C[1] + d * math.sin(a)
        for j in range(4):
            cl.sphere(x + rnd.uniform(-40, 40), y + rnd.uniform(-40, 40), -520, rnd.uniform(60, 110), CLOUD, sz=0.3, seg=16, rings=8, zmin=-0.1)
    for k in range(9):   # 岛下方的低云（从斜俯视角看得到一点）
        a = k * math.tau / 9 + 0.3; d = rnd.uniform(70, 120)
        cl.sphere(ISL_C[0] + d * math.cos(a), ISL_C[1] + d * math.sin(a), rnd.uniform(-190, -150), rnd.uniform(14, 22), CLOUD, sz=0.25, seg=20, rings=10, sx=1.8)
    for (fx2, fy2, fz, fr, seed) in ((-2100, -2600, -420, 55, 22), (2600, -1500, -380, 40, 23)):
        fi = Batch('bg_far_island_%d' % seed)
        rnd2 = random.Random(seed)
        n = 40
        top = [(fx2 + fr * math.cos(i * math.tau / n) * rnd2.uniform(0.9, 1.05), fy2 + fr * 0.8 * math.sin(i * math.tau / n) * rnd2.uniform(0.9, 1.05), fz) for i in range(n)]
        vs = top + [(fx2, fy2, fz - fr * 0.7)]
        fi.poly(vs, [tuple(range(n))] + [(i, n, (i + 1) % n)[::-1] for i in range(n)], FAR)
        for k in range(9):
            bx2, by2 = fx2 + rnd2.uniform(-0.55, 0.55) * fr, fy2 + rnd2.uniform(-0.45, 0.45) * fr
            fi.boxc(bx2, by2, fz, rnd2.uniform(5, 11), rnd2.uniform(5, 11), rnd2.uniform(6, 26), FAR)

    Batch.build_all()
    for ob in bpy.data.objects:
        if ob.name.startswith('bg_clouds') or ob.name.startswith('bg_barrier'):
            ob.visible_shadow = False
    C.sky_sun(sc, 'day', sun_az=55.0, sun_el=36.0)
    sc.view_settings.exposure = -0.3
    if A['exposure']:
        sc.view_settings.exposure = float(A['exposure'])
    CAMS = {
        'c1': ((96, 58, 27), (-6, -6, -5), 30),
        'c2': ((6.5, 14.5, 1.8), (0.0, 1.5, 4.0), 28),
        'c3': ((82, -80, 22), (2, -14, -5), 30),
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
