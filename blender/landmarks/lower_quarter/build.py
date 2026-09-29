"""下层：铁皮屋区 + 旧货市场（开局六；位置为仓库推断）。
下层 = 中层之下的地面与地基：几乎没有自然光，头顶很高处是灰色的「天花板」（中层底面），检修管道滴水；
旧空气过滤设备、工厂、烧垃圾的气味。玩家曾住在铁皮屋；从铁皮屋能抬头望见高悬的中层；
旧货市场卖二手货（玩家在这里花半枚硬币买过一张折叠的中层纸地图——只做空白折纸，无字）。
布局（米）：铁皮屋区 x -34..-2、y -16..16：一条主巷沿 x（y -0.75..0.75）+ 一条横巷（x -19.65..-18.35），
其余是 1 m 左右的背巷；屋子共墙成排、向上叠、上层向巷子悬挑、披屋伸进巷子。
旧货市场 x 2..28、y -14..14：西半露天摊（防水布 + 竹竿式棚），东半 x 16..27 回收钢材市场棚。
北侧 y≈17 有一段检修管廊（z≈9）滴水到下面的积水里（props_pipes）。
中层底面 z = 140（桁架、检修管道、灯）；东边 x = 90 是中层边缘（亮着的边缘面），之外是雾。
bg_*：巨型支撑柱（带竖管）、中层底面、远处过滤塔 / 工厂烟囱、周边铁皮屋海（只渲染，不导出）。
中立建筑：无文字、无标志、无人物、无武器，无任何锁链 / 笼子 / 束缚物。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/lower_quarter/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/lq.jpg [--blend /tmp/lq.blend] [--log /tmp/lq.log] [--exposure 0.9]
cam: c1 俯瞰铁皮屋区 + 市场 / c2 主巷里抬头看中层 / c3 市场摊位高度
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='night', res='900', samples='24', out='/tmp/lq.jpg', blend='', log='', exposure=''))

CEIL = 140.0
EDGE_X = 90.0                                     # 中层东缘
SX0, SX1, SY0, SY1 = -34.0, -2.0, -16.0, 16.0     # 铁皮屋区
MX0, MX1, MY0, MY1 = 2.0, 28.0, -14.0, 14.0       # 旧货市场
ALLEY_Y = (-0.75, 0.75)                           # 主巷
CROSS_X = (-19.65, -18.35)                        # 横巷
SHED = (16.0, 27.0, -10.0, 10.0)                  # 市场棚
PIPE_Y, PIPE_Z = 17.2, 9.0                        # 近处检修管廊


def main():
    import bpy
    from mathutils import Matrix, Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(6)

    # ------------------------------------------------------------ 材质
    def tin(name, base, rust=0.5, paint=False, seed=0.0):
        """镀锌 / 漆面铁皮：冷灰金属底，锈只以噪声遮罩的竖向流痕和斑块出现；每 1.1 m 一道搭接缝 + 一排钉头。"""
        m, nt, b = C.new_mat(name)
        tc = nt.nodes.new('ShaderNodeTexCoord')
        def M(op, a, bb=0.0):
            n = nt.nodes.new('ShaderNodeMath'); n.operation = op
            for i, v in enumerate((a, bb)):
                if isinstance(v, float): n.inputs[i].default_value = v
                else: nt.links.new(v, n.inputs[i])
            return n.outputs[0]
        def noise(scale, sx=1.0, sy=1.0, sz=1.0, det=6.0):
            mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (sx, sy, sz)
            mp.inputs['Location'].default_value = (seed, seed * 1.7, seed * 0.3)
            nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
            nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = det
            nt.links.new(mp.outputs[0], nz.inputs['Vector'])
            return nz.outputs[0]
        def rng(v, a, bb, c=0.0, d=1.0):
            mr = nt.nodes.new('ShaderNodeMapRange')
            mr.inputs['From Min'].default_value = a; mr.inputs['From Max'].default_value = bb
            mr.inputs['To Min'].default_value = c; mr.inputs['To Max'].default_value = d
            nt.links.new(v, mr.inputs['Value'])
            return mr.outputs[0]
        streak = rng(noise(2.0, 5.0, 5.0, 0.35), 0.66 - 0.1 * rust, 0.74 - 0.08 * rust)
        patch = rng(noise(0.9), 0.7 - 0.08 * rust, 0.77 - 0.06 * rust)
        rm = M('MINIMUM', M('MAXIMUM', streak, patch), 1.0)
        sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs[0])
        fz = M('FRACT', M('MULTIPLY', sep.outputs[2], 0.91))
        seam = M('LESS_THAN', fz, 0.012)
        bolt = M('MULTIPLY', M('LESS_THAN', M('ABSOLUTE', M('SUBTRACT', fz, 0.03)), 0.006),
                 M('LESS_THAN', M('FRACT', M('MULTIPLY', M('ADD', sep.outputs[0], sep.outputs[1]), 5.0)), 0.12))
        var = rng(noise(0.5, det=3.0), 0.3, 0.7, 0.85, 1.1)
        cm = nt.nodes.new('ShaderNodeCombineColor')
        for i in range(3): nt.links.new(var, cm.inputs[i])
        col = C._mix(nt, cm.outputs[0], tuple(base), 1.0, 'MULTIPLY')
        rc = C._mix(nt, (0.34, 0.14, 0.05), (0.18, 0.08, 0.035), noise(6.0), 'MIX')
        col = C._mix(nt, col, rc, rm, 'MIX')
        col = C._mix(nt, col, (0.02, 0.02, 0.02), M('MULTIPLY', seam, 0.8), 'MIX')
        col = C._mix(nt, col, (0.55, 0.56, 0.58), bolt, 'MIX')
        nt.links.new(col, b.inputs['Base Color'])
        r0 = 0.5 if paint else 0.36
        nt.links.new(rng(rm, 0.0, 1.0, r0, 0.9), b.inputs['Roughness'])
        nt.links.new(rng(rm, 0.0, 1.0, 0.25 if paint else 0.8, 0.1), b.inputs['Metallic'])
        bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.25
        nt.links.new(M('ADD', M('MULTIPLY', rm, 0.6), noise(12.0)), bm.inputs['Height'])
        nt.links.new(bm.outputs[0], b.inputs['Normal'])
        return m
    TINS = [tin('tin_galv_a', (0.56, 0.58, 0.6), 0.35, seed=1.0), tin('tin_galv_b', (0.46, 0.48, 0.5), 0.55, seed=2.0),
            tin('tin_galv_c', (0.62, 0.63, 0.63), 0.75, seed=3.0), tin('tin_galv_d', (0.4, 0.42, 0.44), 0.9, seed=4.0),
            tin('tin_galv_e', (0.52, 0.54, 0.55), 0.5, seed=5.0),
            tin('tin_teal', (0.22, 0.36, 0.38), 0.6, True, 6.0), tin('tin_red', (0.42, 0.16, 0.12), 0.6, True, 7.0)]
    ROOFS = [tin('roof_galv_a', (0.5, 0.52, 0.53), 0.8, seed=8.0), tin('roof_galv_b', (0.44, 0.45, 0.46), 1.0, seed=9.0),
             tin('roof_galv_c', (0.58, 0.59, 0.6), 0.6, seed=10.0)]
    PLY = C.pbr('plywood', 'rough_wood', 1.2, tint=(0.62, 0.5, 0.38), sat=0.5, value=0.65, weather=1.0)
    DWOOD = C.pbr('dark_wood', 'rough_wood', 1.0, tint=(0.4, 0.33, 0.27), sat=0.5, value=0.55)
    CONC = C.pbr('concrete', 'concrete_floor_worn_001', 4.0, tint=(0.5, 0.49, 0.47), sat=0.2, weather=1.0)
    DIRT = C.pbr('ground_dirt', 'dirt_floor', 3.0, tint=(0.45, 0.42, 0.4), sat=0.4, value=0.6, rough_mul=0.8)
    MFLOOR = C.pbr('market_floor', 'concrete_floor_worn_001', 3.0, tint=(0.4, 0.39, 0.37), sat=0.2, value=0.6,
                   rough_mul=1.0, weather=1.0)
    PILLARM = C.pbr('pillar', 'concrete_wall_008', 8.0, tint=(0.5, 0.5, 0.5), sat=0.2, weather=1.0)
    WET = C.flat('puddle', (0.03, 0.035, 0.04), 0.03, coat=1.0)
    WETWALL = C.flat('wet_stain', (0.05, 0.045, 0.04), 0.12, coat=0.6, noise=0.4)
    STAIN = C.flat('oil_stain', (0.07, 0.065, 0.06), 0.55, noise=0.5)
    CRACK = C.flat('crack', (0.02, 0.02, 0.02), 0.9)
    DROP = C.flat('drop', (0.8, 0.88, 0.95), 0.05, emit=(0.8, 0.9, 1.0), estr=1.0)
    SPLASH = C.flat('splash', (0.35, 0.38, 0.4), 0.05, coat=1.0)
    STEEL = C.flat('steel', (0.2, 0.2, 0.21), 0.55, metal=0.8, noise=0.4)
    RUST = C.flat('rust_steel', (0.26, 0.13, 0.07), 0.8, metal=0.3, noise=0.5)
    DARK = C.flat('dark_opening', (0.015, 0.014, 0.013), 0.9)
    CABLE = C.flat('cable', (0.02, 0.02, 0.02), 0.6)
    TARPS = [C.flat('tarp_%d' % i, c, 0.8, noise=0.55) for i, c in enumerate(
        ((0.07, 0.13, 0.2), (0.12, 0.18, 0.12), (0.3, 0.19, 0.08), (0.24, 0.23, 0.21), (0.26, 0.1, 0.07)))]
    DRUMS = [C.flat('drum_%d' % i, c, 0.5, metal=0.2, noise=0.3) for i, c in enumerate(
        ((0.1, 0.22, 0.4), (0.35, 0.1, 0.06), (0.18, 0.2, 0.12)))]
    WINW = C.glass('win_warm', (0.05, 0.04, 0.03), 0.3, emit=(1.0, 0.62, 0.3), estr=2.5)
    WIND = C.glass('win_dark', (0.03, 0.035, 0.04), 0.1)
    BULB = C.flat('bulb', (1, 0.85, 0.6), 0.3, emit=(1.0, 0.8, 0.58), estr=40.0)
    SODIUM = C.flat('sodium', (1, 0.6, 0.2), 0.3, emit=(1.0, 0.5, 0.15), estr=40.0)
    COLDL = C.flat('coldlight', (0.8, 0.9, 1), 0.3, emit=(0.75, 0.88, 1.0), estr=25.0)
    PAPER = C.flat('paper', (0.78, 0.74, 0.64), 0.85, noise=0.15)
    CARD = C.flat('cardboard', (0.3, 0.22, 0.13), 0.9, noise=0.35)
    PLAST = [C.flat('plastic_%d' % i, c, 0.45, noise=0.2) for i, c in enumerate(
        ((0.12, 0.12, 0.12), (0.5, 0.48, 0.42), (0.1, 0.18, 0.3), (0.35, 0.3, 0.2)))]
    ENAMEL = C.flat('enamel_dingy', (0.38, 0.37, 0.33), 0.4, noise=0.45)
    SCREEN = C.flat('screen', (0.02, 0.025, 0.03), 0.15)
    CLOTH = [C.flat('cloth_%d' % i, c, 0.95, noise=0.3) for i, c in enumerate(
        ((0.3, 0.12, 0.1), (0.12, 0.16, 0.3), (0.3, 0.3, 0.28), (0.2, 0.25, 0.14), (0.4, 0.33, 0.18)))]
    TYRE = C.flat('tyre', (0.03, 0.03, 0.03), 0.8)
    COPPER = C.flat('copper', (0.5, 0.28, 0.15), 0.4, metal=1.0, noise=0.3)
    ALU = C.flat('alu', (0.6, 0.6, 0.62), 0.35, metal=1.0, noise=0.2)
    SCRAPM = [STEEL, RUST, ALU, COPPER, PLAST[1], ENAMEL, DWOOD]

    # ------------------------------------------------------------ 几何工具
    def corr(B, P, U, V, m, pitch=0.2, depth=0.03):
        """瓦楞板：从 P 起，沿 U 排波（梯形波），沿 V 方向是波脊；法线 = U×V（向外凸）。"""
        P, U, V = Vector(P), Vector(U), Vector(V)
        n = U.cross(V).normalized()
        L = U.length
        k = max(4, int(L / pitch * 4))
        pat = (0.0, 1.0, 1.0, 0.0)
        vs = []
        for i in range(k + 1):
            o = P + U * (i / k) + n * (depth * pat[i % 4])
            vs.append(tuple(o)); vs.append(tuple(o + V))
        fs = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(k)]
        B.poly(vs, fs, m)

    def corr_box(B, x0, x1, y0, y1, z0, z1, m, faces='nsew'):
        h = z1 - z0
        B.box(x0 + 0.02, x1 - 0.02, y0 + 0.02, y1 - 0.02, z0, z1 - 0.01, DARK)
        if 's' in faces: corr(B, (x0, y0, z0), (x1 - x0, 0, 0), (0, 0, h), m)
        if 'n' in faces: corr(B, (x1, y1, z0), (x0 - x1, 0, 0), (0, 0, h), m)
        if 'e' in faces: corr(B, (x1, y0, z0), (0, y1 - y0, 0), (0, 0, h), m)
        if 'w' in faces: corr(B, (x0, y1, z0), (0, y0 - y1, 0), (0, 0, h), m)

    def roof(B, x0, x1, y0, y1, zlo, zhi, m, sl):
        """单坡瓦楞屋面：波脊顺坡；下面一层薄板。"""
        Lx, Ly, dz = x1 - x0, y1 - y0, zhi - zlo
        slab(B, x0, x1, y0, y1, zlo - 0.05, zhi - 0.05, DARK, sl, 0.04)
        if sl == 'y':
            corr(B, (x0, y0, zlo), (Lx, 0, 0), (0, Ly, dz), m, 0.2, 0.035)
        elif sl == '-y':
            corr(B, (x1, y1, zlo), (-Lx, 0, 0), (0, -Ly, dz), m, 0.2, 0.035)
        elif sl == 'x':
            corr(B, (x0, y1, zlo), (0, -Ly, 0), (Lx, 0, dz), m, 0.2, 0.035)
        else:
            corr(B, (x1, y0, zlo), (0, Ly, 0), (-Lx, 0, dz), m, 0.2, 0.035)

    def slab(B, x0, x1, y0, y1, zlo, zhi, m, slope='y', t=0.06):
        zs = {'y': [zlo, zlo, zhi, zhi], '-y': [zhi, zhi, zlo, zlo], 'x': [zlo, zhi, zhi, zlo], '-x': [zhi, zlo, zlo, zhi]}[slope]
        xy = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        vs = [(x, y, z) for (x, y), z in zip(xy, zs)] + [(x, y, z + t) for (x, y), z in zip(xy, zs)]
        fs = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        B.poly(vs, fs, m)

    def quad2(B, pts, m):
        B.poly(pts, [(0, 1, 2, 3), (3, 2, 1, 0)], m)

    def sag(p0, p1, s, n=6):
        return [(p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n,
                 p0[2] + (p1[2] - p0[2]) * i / n - s * 4 * (i / n) * (1 - i / n)) for i in range(n + 1)]

    def tarp(B, x0, x1, y0, y1, z0, z1, m, s=0.12, nx=5, ny=4):
        """下垂的防水布：y0 边高 z0，y1 边高 z1，中间下垂 s。"""
        vs = []
        for j in range(ny + 1):
            for i in range(nx + 1):
                u, v = i / nx, j / ny
                z = z0 + (z1 - z0) * v - s * 16 * u * (1 - u) * v * (1 - v) - s * 0.3 * 4 * u * (1 - u)
                vs.append((x0 + (x1 - x0) * u, y0 + (y1 - y0) * v, z))
        fs = []
        for j in range(ny):
            for i in range(nx):
                a = j * (nx + 1) + i
                f = (a, a + 1, a + nx + 2, a + nx + 1)
                fs.append(f); fs.append(f[::-1])
        B.poly(vs, fs, m)

    def rbox(B, x, y, z, sx, sy, sz, m, rz=0.0, rx=0.0, ry=0.0):
        """绕中心旋转的盒子（杂物堆）。"""
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y')
        B.box(-sx / 2, sx / 2, -sy / 2, sy / 2, -sz / 2, sz / 2, m, M)

    def disc(B, x, y, z, r, m, axis='y', n=12, t=0.02):
        M = Matrix.Translation((x, y, z)) @ (Matrix.Rotation(math.pi / 2, 4, 'X') if axis == 'y' else Matrix.Rotation(math.pi / 2, 4, 'Y'))
        B.cyl(0, 0, -t / 2, r, t, m, n, smooth=False, mat=M)

    bulbs = []      # 暖光裸灯泡
    sodiums = []    # 钠灯
    drips = []      # (x, y, z_top) 滴水点

    # ------------------------------------------------------------ 地面
    G = Batch('site_ground')
    G.box(SX0 - 6, MX1 + 6, SY0 - 6, SY1 + 6, -0.3, 0.0, CONC)
    G.box(SX0, SX1, SY0, SY1, 0.0, 0.02, DIRT)
    G.box(MX0, MX1, MY0, MY1, 0.0, 0.015, MFLOOR)

    # ------------------------------------------------------------ 铁皮屋
    Sa, Sb = Batch('props_shacks_a'), Batch('props_shacks_b')
    Al = Batch('props_alleys')
    Li = Batch('props_lights')

    def outer_lean(B, r, x0, x1, yy, sg):
        """块外缘的披屋 / 加建：朝外伸出 0.8–1.6 m，坡度不一，下面堆杂物和水桶。"""
        d = r.uniform(0.8, 1.6)
        ya, yb = sorted((yy, yy + sg * d))
        zh = r.uniform(1.9, 2.4)
        roof(B, x0, x1, ya, yb, zh - r.uniform(0.25, 0.6), zh, r.choice(ROOFS + TINS[:3]), '-y' if sg < 0 else 'y')
        for xx in (x0 + 0.05, x1 - 0.1):
            B.box(xx, xx + 0.06, yy + sg * (d - 0.06), yy + sg * d, 0, zh - 0.5, r.choice((DWOOD, RUST)))
        if r.random() < 0.5:
            corr(B, (x0, yy, 0) if sg < 0 else (x1, yy, 0), (0, sg * d, 0) if sg < 0 else (0, sg * d, 0), (0, 0, zh - 0.6), r.choice(TINS))
        for _ in range(r.randint(1, 3)):
            if r.random() < 0.5:
                Al.cyl(r.uniform(x0 + 0.3, x1 - 0.3), yy + sg * r.uniform(0.3, d - 0.3), 0, 0.28, 0.85, r.choice(DRUMS), 12)
            else:
                rbox(Al, r.uniform(x0 + 0.3, x1 - 0.3), yy + sg * r.uniform(0.3, d - 0.3), 0.2, r.uniform(0.3, 0.7), 0.4, 0.4,
                     r.choice(SCRAPM), r.uniform(0, 3))

    def shack(x0, x1, y0, y1, front, seed, over, edge_w, edge_e, back_out=False):
        """一间共墙铁皮屋；front='y-'/'y+' 门朝的巷子；over = 上层向巷子悬挑量。"""
        r = random.Random(seed)
        B = Sa if (x0 + x1) / 2 < -18 else Sb
        sg = -1 if front == 'y-' else 1
        z = 0.0
        levels = r.choices((1, 2, 3), (0.25, 0.5, 0.25))[0]
        bx0, bx1, by0, by1 = x0, x1, y0, y1
        for lv in range(levels):
            h = r.uniform(2.2, 2.6)
            wm = r.choice(TINS)
            fcs = 'ns' + ('w' if (edge_w or lv) else '') + ('e' if (edge_e or lv) else '')
            corr_box(B, bx0, bx1, by0, by1, z, z + h, wm, fcs)
            # 补丁：不同颜色的铁皮 / 夹板 / 防水布
            for _ in range(r.randint(1, 3)):
                pw, ph = r.uniform(0.5, 1.3), r.uniform(0.4, 1.1)
                pz = z + r.uniform(0.2, max(0.25, h - ph - 0.1))
                pm = r.choice(TINS + [PLY] + TARPS[:2])
                yy = by0 if r.random() < 0.5 else by1
                s2 = -1 if yy == by0 else 1
                px = r.uniform(bx0, max(bx0 + 0.01, bx1 - pw))
                if pm in TINS:   # 搭接的另一张瓦楞板，上沿略向外翘
                    if s2 < 0:
                        corr(B, (px, yy - 0.05, pz), (pw, 0, 0), (0, -r.uniform(0.0, 0.08), ph), pm, 0.2, 0.03)
                    else:
                        corr(B, (px + pw, yy + 0.05, pz), (-pw, 0, 0), (0, r.uniform(0.0, 0.08), ph), pm, 0.2, 0.03)
                else:
                    B.box(px, px + pw, yy + s2 * 0.035, yy + s2 * 0.06, pz, pz + ph, pm)
            yy = by0 if front == 'y-' else by1
            yo = yy + sg * 0.035
            dx = r.uniform(bx0 + 0.3, max(bx0 + 0.31, bx1 - 1.3))
            if lv == 0:
                B.box(dx, dx + 0.8, yo, yo + sg * 0.04, z, z + 1.9, r.choice((PLY, DWOOD, DARK, TINS[2])))
                if r.random() < 0.55:
                    bulbs.append((dx + 0.4, yy + sg * 0.3, z + 2.0))
            wx = dx + 1.0 if dx + 1.8 < bx1 else bx0 + 0.25
            B.box(wx, wx + 0.6, yo, yo + sg * 0.03, z + 1.1, z + 1.6, WINW if r.random() < 0.55 else WIND)
            B.box(wx - 0.05, wx + 0.65, yo, yo + sg * 0.1, z + 1.04, z + 1.1, DWOOD)
            # 墙根湿痕
            if lv == 0:
                B.box(bx0, bx1, yo + sg * 0.005, yo + sg * 0.01, 0.02, r.uniform(0.3, 0.8), WETWALL)
            # 空调外机（上层朝巷）
            if lv > 0 and r.random() < 0.45:
                ax = r.uniform(bx0 + 0.3, bx1 - 1.0)
                B.box(ax, ax + 0.7, yo, yo + sg * 0.42, z + 0.3, z + 0.8, ENAMEL)
                disc(B, ax + 0.35, yo + sg * 0.43, z + 0.55, 0.18, DARK)
                B.tube([(ax + 0.6, yo + sg * 0.3, z + 0.3), (ax + 0.6, yo + sg * 0.3, 0.1)], 0.012, CABLE, 4)
                drips.append((ax + 0.2, yo + sg * 0.4, z + 0.3))
            z += h
            last = lv == levels - 1
            if last:
                ov = 0.08 if over < 0.3 else 0.15
                if r.random() < 0.3:   # 平顶 + 水箱 / 杂物
                    B.box(bx0 - ov, bx1 + ov, by0 - ov, by1 + ov, z, z + 0.08, r.choice(ROOFS))
                    tx, ty = r.uniform(bx0 + 0.6, bx1 - 0.6), r.uniform(by0 + 0.6, by1 - 0.6)
                    if r.random() < 0.6:
                        B.cyl(tx, ty, z + 0.08, 0.5, r.uniform(0.9, 1.3), r.choice(DRUMS + [TINS[0]]), 14)
                        B.box(tx - 0.55, tx + 0.55, ty - 0.55, ty + 0.55, z + 0.08, z + 0.15, RUST)
                    for _ in range(r.randint(2, 5)):
                        rbox(B, r.uniform(bx0 + 0.3, bx1 - 0.3), r.uniform(by0 + 0.3, by1 - 0.3), z + 0.2, r.uniform(0.2, 0.8),
                             r.uniform(0.2, 0.6), r.uniform(0.1, 0.4), r.choice(SCRAPM + TARPS), r.uniform(0, 3), r.uniform(-0.2, 0.2))
                    break
                sl = r.choice(('y', '-y')) if r.random() < 0.7 else r.choice(('x', '-x'))
                roof(B, bx0 - ov, bx1 + ov, by0 - ov, by1 + ov, z + 0.05, z + r.uniform(0.15, 0.9), r.choice(ROOFS), sl)
                k = r.random()
                cx, cy = r.uniform(bx0 + 0.6, bx1 - 0.6), r.uniform(by0 + 0.6, by1 - 0.6)
                if k < 0.25:
                    B.cyl(cx, cy, z + 0.3, 0.03, 0.9, STEEL, 6)
                    B.cyl(cx, cy, z + 1.0, 0.45, 0.22, ALU, 12, r2=0.05)
                elif k < 0.55:
                    B.cyl(cx, cy, z + 0.3, 0.34, 0.9, r.choice(DRUMS), 12)
                elif k < 0.8:
                    tarp(B, bx0, bx1, by0, (by0 + by1) / 2, z + 0.5, z + 0.9, r.choice(TARPS), 0.08, 3, 2)
                if r.random() < 0.5:
                    B.cyl(r.uniform(bx0 + 0.5, bx1 - 0.5), r.uniform(by0 + 0.5, by1 - 0.5), z + 0.3, 0.3, 0.18, TYRE, 10)
                break
            # 上层：向巷子悬挑 + 左右错位；下面斜撑
            B.box(bx0 - 0.05, bx1 + 0.05, by0 - 0.05, by1 + 0.05, z, z + 0.1, RUST)
            nx0 = bx0 + r.uniform(-0.4, 0.5); nx1 = bx1 - r.uniform(-0.4, 0.5)
            o = over * r.uniform(0.6, 1.0)
            if front == 'y-':
                ny0, ny1 = by0 - o, by1 - r.uniform(0.0, 0.8)
            else:
                ny0, ny1 = by0 + r.uniform(0.0, 0.8), by1 + o
            if o > 0.15:
                ye = ny0 if front == 'y-' else ny1
                for xs_ in (nx0 + 0.15, nx1 - 0.15):
                    Al.tube([(xs_, yy, z - 0.9), (xs_, ye + 0.05 * -sg, z + 0.02)], 0.03, RUST, 5)
                B.box(nx0, nx1, min(yy, ye), max(yy, ye), z, z + 0.1, RUST)
            # 外挂梯
            if r.random() < 0.4:
                lx = r.uniform(bx0 + 0.2, bx1 - 0.7); ly = yy + sg * 0.12
                for s in (lx, lx + 0.45):
                    Al.box(s, s + 0.04, ly, ly + sg * 0.04, z - h, z + 0.9, RUST)
                for k2 in range(int(h / 0.3) + 3):
                    Al.box(lx, lx + 0.49, ly, ly + sg * 0.04, z - h + 0.3 * k2, z - h + 0.3 * k2 + 0.035, RUST)
            bx0, bx1, by0, by1 = nx0, nx1, ny0, ny1
        # 披屋伸进巷子（窄披檐 + 杂物）
        if r.random() < 0.45:
            yy = y0 if front == 'y-' else y1
            d = 0.45 if over < 0.3 else 0.6
            xa = r.uniform(x0, max(x0 + 0.01, x1 - 1.6)); xb = min(x1, xa + r.uniform(1.2, 2.2))
            ya, yb = sorted((yy, yy + sg * d))
            slab(B, xa, xb, ya, yb, 1.75, 2.05, r.choice(TARPS + ROOFS), 'y' if front == 'y-' else '-y', 0.03)
            ym = yy + sg * (d - 0.05)
            for xx in (xa + 0.05, xb - 0.1):
                B.box(xx, xx + 0.05, ym, ym + 0.05, 0, 1.8, DWOOD)
            for _ in range(r.randint(1, 3)):
                rbox(Al, r.uniform(xa + 0.2, xb - 0.2), yy + sg * 0.22, 0.18, 0.4, 0.3, 0.36,
                     r.choice((CARD, DWOOD, PLAST[0], RUST)), r.uniform(-0.3, 0.3))
            drips.append(((xa + xb) / 2, yy + sg * d, 1.75))
        if back_out and r.random() < 0.75:
            outer_lean(B, r, x0 + r.uniform(0, 0.4), x1 - r.uniform(0, 0.4), y1 if front == 'y-' else y0, -sg)
        if edge_w and r.random() < 0.7:
            xa = x0 - r.uniform(0.8, 1.4)
            slab(B, xa, x0, y0 + 0.2, y1 - 0.2, r.uniform(1.6, 1.9), r.uniform(2.1, 2.5), r.choice(ROOFS), 'x', 0.04)
            Al.cyl(xa + 0.4, (y0 + y1) / 2, 0, 0.28, 0.85, r.choice(DRUMS), 12)
        if edge_e and r.random() < 0.7:
            xb = x1 + r.uniform(0.8, 1.4)
            slab(B, x1, xb, y0 + 0.2, y1 - 0.2, r.uniform(2.1, 2.5), r.uniform(1.6, 1.9), r.choice(ROOFS), 'x', 0.04)
            Al.cyl(xb - 0.4, (y0 + y1) / 2, 0, 0.28, 0.85, r.choice(DRUMS), 12)
        if r.random() < 0.5:
            dx = r.uniform(x0 + 0.3, x1 - 0.3)
            Al.cyl(dx, (y0 if front == 'y-' else y1) + sg * 0.3, 0.0, 0.28, 0.85, r.choice(DRUMS), 12)
            Al.cyl(dx, (y0 if front == 'y-' else y1) + sg * 0.3, 0.85, 0.28, 0.02, WET, 12)
        return z

    # 块：主巷南北各两块（横巷分开）；块内一排排共墙屋，排间 1–1.2 m 背巷
    lanes = []   # 背巷 (x0, x1, y0, y1)
    sid = 0
    for (bx0, bx1) in ((SX0, CROSS_X[0]), (CROSS_X[1], SX1)):
        for (by0, by1, fr) in ((SY0, ALLEY_Y[0], 'y+'), (ALLEY_Y[1], SY1, 'y-')):
            sgn = -1 if fr == 'y+' else 1
            y = by1 if fr == 'y+' else by0
            edge = by0 if fr == 'y+' else by1
            ri = 0
            while abs(y - edge) > 2.5:
                d = rnd.uniform(3.2, 4.4)
                if abs(y - edge) - d < 2.5:
                    d = abs(y - edge)
                ya, yb = sorted((y, y + sgn * d))
                lane_w = rnd.uniform(1.0, 1.25)
                # 这一排的门朝向：第一排朝主巷，其余朝各自靠主巷一侧的背巷
                front = fr
                over = 0.35 if ri == 0 else 0.12
                last_row = abs((y + sgn * (d + 1.1)) - edge) <= 2.5 or abs(abs(y - edge) - d) < 0.01
                x = bx0 + 0.05
                while x < bx1 - 1.5:
                    w = rnd.uniform(2.6, 4.2)
                    if bx1 - (x + w) < 2.0:
                        w = bx1 - x - 0.05
                    jy0 = rnd.uniform(0, 0.35) if fr == 'y-' or ri > 0 else 0.0
                    jy1 = rnd.uniform(0, 0.35) if fr == 'y+' or ri > 0 else 0.0
                    if fr == 'y+':
                        s0, s1 = ya + jy0 * 0.5, yb - rnd.uniform(0, 0.25)
                    else:
                        s0, s1 = ya + rnd.uniform(0, 0.25), yb - jy1 * 0.5
                    shack(x, x + w, s0, s1, front, 100 + sid, over, x < bx0 + 0.1, x + w > bx1 - 0.1, last_row)
                    sid += 1
                    x += w
                    if rnd.random() < 0.2 and x < bx1 - 4:   # 屋间夹缝：水桶 / 杂物
                        g = rnd.uniform(0.6, 0.9)
                        Al.cyl(x + g / 2, (s0 + s1) / 2 + rnd.uniform(-0.8, 0.8), 0, 0.26, 0.85, rnd.choice(DRUMS), 12)
                        rbox(Al, x + g / 2, (s0 + s1) / 2 + rnd.uniform(-1.2, 1.2), 0.2, 0.4, 0.5, 0.4, rnd.choice(SCRAPM), rnd.uniform(0, 3))
                        x += g
                y = y + sgn * (d + lane_w)
                if abs(y - edge) > 2.5:
                    la, lb = sorted((y - sgn * lane_w, y))
                    lanes.append((bx0, bx1, la, lb))
                ri += 1

    # 主巷 / 横巷：排水沟（格栅 + 沟里积水）、积水、电线、晾挂的布
    ax0, ax1 = SX0, SX1 + 4.0
    Al.box(ax0, ax1, -0.15, 0.15, 0.0, 0.025, DARK)
    for x in range(int(ax0), int(ax1)):
        if rnd.random() < 0.75:
            Al.box(x + 0.05, x + 0.95, -0.15, 0.15, 0.03, 0.04, RUST)
        else:
            Al.box(x + 0.05, x + 0.95, -0.14, 0.14, 0.026, 0.028, WET)
    xm = sum(CROSS_X) / 2
    Al.box(xm - 0.12, xm + 0.12, SY0, SY1, 0.0, 0.025, DARK)
    Al.box(xm - 0.1, xm + 0.1, SY0, SY1, 0.026, 0.028, WET)
    for (la0, la1, lb0, lb1) in lanes:
        ym = (lb0 + lb1) / 2
        Al.box(la0, la1, ym - 0.1, ym + 0.1, 0.02, 0.028, WET)
    for _ in range(30):
        if rnd.random() < 0.55:
            px, py = rnd.uniform(ax0, ax1), rnd.uniform(-0.6, 0.6)
        elif lanes and rnd.random() < 0.6:
            la = rnd.choice(lanes); px, py = rnd.uniform(la[0], la[1]), rnd.uniform(la[2] + 0.2, la[3] - 0.2)
        else:
            px, py = rnd.uniform(*CROSS_X), rnd.uniform(SY0, SY1)
        n = 10; rr = rnd.uniform(0.3, 0.9)
        Al.poly([(px + rr * math.cos(i * math.tau / n) * rnd.uniform(0.7, 1.2),
                  py + rr * 0.5 * math.sin(i * math.tau / n) * rnd.uniform(0.7, 1.2), 0.045) for i in range(n)],
                [tuple(range(n))], WET)
    # 电线乱麻：跨主巷、沿墙、跨背巷
    for i in range(55):
        x = rnd.uniform(SX0 + 0.5, SX1 - 0.5)
        za, zb = rnd.uniform(2.4, 6.0), rnd.uniform(2.4, 6.0)
        Al.tube(sag((x, -1.3, za), (x + rnd.uniform(-2.5, 2.5), 1.3, zb), rnd.uniform(0.1, 0.5)), 0.012, CABLE, 4)
    for i in range(16):
        y = rnd.choice((-0.9, 0.9)) + rnd.uniform(-0.1, 0.1)
        x = rnd.uniform(SX0, SX1 - 6)
        Al.tube(sag((x, y, rnd.uniform(2.5, 3.2)), (x + rnd.uniform(4, 9), y, rnd.uniform(2.5, 3.2)), 0.15, 8), 0.018, CABLE, 4)
    for (la0, la1, lb0, lb1) in lanes:
        for _ in range(5):
            x = rnd.uniform(la0, la1)
            Al.tube(sag((x, lb0 - 0.2, rnd.uniform(2.3, 4.5)), (x + rnd.uniform(-1.5, 1.5), lb1 + 0.2, rnd.uniform(2.3, 4.5)), 0.2),
                    0.012, CABLE, 4)
    for _ in range(12):
        y = rnd.uniform(SY0 + 1, SY1 - 1)
        Al.tube(sag((CROSS_X[0] - 0.2, y, rnd.uniform(2.4, 5)), (CROSS_X[1] + 0.2, y + rnd.uniform(-1.5, 1.5), rnd.uniform(2.4, 5)), 0.25),
                0.012, CABLE, 4)
    # 晾衣绳 + 挂着的布（素色，无图案）
    def laundry(p0, p1):
        pts = sag(p0, p1, 0.15, 8)
        Al.tube(pts, 0.008, CABLE, 4)
        for i in range(1, len(pts) - 1):
            if rnd.random() < 0.7:
                p = pts[i]; w = rnd.uniform(0.3, 0.6); hh = rnd.uniform(0.35, 0.8)
                dxv = (p1[0] - p0[0]); dyv = (p1[1] - p0[1]); L = math.hypot(dxv, dyv)
                ux, uy = dxv / L * w / 2, dyv / L * w / 2
                quad2(Al, [(p[0] - ux, p[1] - uy, p[2]), (p[0] + ux, p[1] + uy, p[2]),
                           (p[0] + ux, p[1] + uy, p[2] - hh), (p[0] - ux, p[1] - uy, p[2] - hh)], rnd.choice(CLOTH))
    for x in (-27.0, -22.5, -15.5, -9.0, -5.0):
        laundry((x, -1.0, 2.9), (x + rnd.uniform(-1.5, 1.5), 1.0, 2.9))
    for (la0, la1, lb0, lb1) in lanes[::2]:
        x = rnd.uniform(la0 + 1, la1 - 4)
        laundry((x, (lb0 + lb1) / 2, 2.7), (x + 3.5, (lb0 + lb1) / 2 + rnd.uniform(-0.2, 0.2), 2.7))
    # 沿主巷的一串灯泡
    for k in range(3):
        x0 = SX0 + 2 + k * 10
        pts = sag((x0, -0.5 + k * 0.4, 3.4), (x0 + 9, 0.5 - k * 0.3, 3.3), 0.4, 8)
        Al.tube(pts, 0.012, CABLE, 4)
        for p in pts[1:-1:2]:
            bulbs.append((p[0], p[1], p[2] - 0.12))
    # 钠灯（挂在墙上的灯臂）
    for (x, y, s) in ((-30.0, -0.8, 1), (-21.0, 0.8, -1), (-12.0, -0.8, 1), (-6.0, 0.8, -1), (-19.0, 8.0, 0), (0.5, -1.2, 1)):
        yy = y + s * 0.6
        Li.box(x - 0.04, x + 0.04, min(y, yy), max(y, yy), 5.4, 5.48, STEEL)
        Li.boxc(x, yy, 5.22, 0.3, 0.45, 0.18, STEEL)
        Li.boxc(x, yy, 5.18, 0.22, 0.36, 0.05, SODIUM)
        sodiums.append((x, yy, 5.1))

    # ------------------------------------------------------------ 北侧检修管廊（滴水）
    Pp = Batch('props_pipes')
    for x in range(-40, 34, 8):
        Pp.box(x - 0.15, x + 0.15, PIPE_Y - 0.15, PIPE_Y + 0.15, 0, PIPE_Z - 0.4, RUST)
        Pp.box(x - 0.15, x + 0.15, PIPE_Y - 1.2, PIPE_Y + 1.2, PIPE_Z - 0.55, PIPE_Z - 0.4, RUST)
    for (dy, dz, rr, m) in ((-0.7, 0.0, 0.35, RUST), (0.0, 0.1, 0.45, STEEL), (0.75, 0.0, 0.25, RUST), (0.35, 0.75, 0.18, STEEL)):
        Pp.tube([(-44, PIPE_Y + dy, PIPE_Z + dz), (34, PIPE_Y + dy, PIPE_Z + dz)], rr, m, 12)
    # 管道从柱子方向弯下来接地
    Pp.tube([(-44, PIPE_Y, PIPE_Z + 0.1), (-47, PIPE_Y, PIPE_Z + 0.1), (-47, PIPE_Y, 40)], 0.45, STEEL, 12)
    # 分支管伸到铁皮屋区上方（漏水的接头）
    for (x, y1) in ((-28.0, 6.0), (-10.0, 3.0), (8.0, 4.0)):
        Pp.tube([(x, PIPE_Y - 0.7, PIPE_Z - 0.2), (x, y1, PIPE_Z - 1.4)], 0.16, RUST, 8)
        Pp.cyl(x, y1, PIPE_Z - 1.7, 0.24, 0.5, STEEL, 10)
        drips.append((x, y1, PIPE_Z - 1.7))
    for x in (-36.0, -24.0, -15.0, -3.0, 5.0, 14.0, 22.0, 30.0):
        drips.append((x + rnd.uniform(-1, 1), PIPE_Y - 0.7, PIPE_Z - 0.35))
        # 管底水痕
        Pp.box(x - 0.6, x + 0.6, PIPE_Y - 0.72, PIPE_Y - 0.68, PIPE_Z - 0.36, PIPE_Z - 0.2, WETWALL)

    # ------------------------------------------------------------ 旧货市场：回收钢材搭的市场棚
    Mk = Batch('props_market')
    fx0, fx1, fy0, fy1 = SHED
    for x in (fx0, fx0 + 3.7, fx0 + 7.3, fx1):
        for y in (fy0, -3.3, 3.3, fy1):
            Mk.box(x - 0.15, x + 0.15, y - 0.1, y + 0.1, 0, 6.4, RUST)
            Mk.box(x - 0.1, x + 0.1, y - 0.15, y + 0.15, 0, 6.4, RUST)
    for y in (fy0, -3.3, 3.3, fy1):
        Mk.box(fx0 - 0.2, fx1 + 0.2, y - 0.12, y + 0.12, 6.0, 6.4, STEEL)
    for x in (fx0, fx0 + 3.7, fx0 + 7.3, fx1):
        Mk.box(x - 0.12, x + 0.12, fy0, fy1, 6.4, 6.7, RUST)
    for (ya, yb) in ((fy0 - 0.6, 0.0), (0.0, fy1 + 0.6)):
        for i, x in enumerate(range(int(fx0) - 1, int(fx1) + 1, 2)):
            if (i * 7 + int(ya)) % 9 == 4:
                continue
            roof(Mk, x, x + 2.02, ya, yb, 6.75, 7.85, ROOFS[i % 3], 'y' if ya < 0 else '-y')
    for y in (-6.6, 0.0, 6.6):
        for x0_ in (fx0 + 1.0, fx0 + 6.0):
            Mk.box(x0_, x0_ + 4.2, y - 0.7, y + 0.7, 0.85, 0.9, PLY)
            for (ex, ey) in ((0.1, -0.6), (4.1, -0.6), (0.1, 0.6), (4.1, 0.6)):
                Mk.box(x0_ + ex - 0.03, x0_ + ex + 0.03, y + ey - 0.03, y + ey + 0.03, 0, 0.85, STEEL)
            Mk.box(x0_, x0_ + 4.2, y - 0.7, y + 0.7, 0.2, 0.23, PLY)
    corr(Mk, (fx1 + 0.05, fy0, 0), (0, fy1 - fy0, 0), (0, 0, 3.2), TINS[2])
    corr(Mk, (fx1, fy1 + 0.05, 0), (fx0 - fx1, 0, 0), (0, 0, 2.6), TINS[0])
    for _ in range(8):
        drips.append((rnd.uniform(fx0, fx1), rnd.choice((fy0 - 0.6, fy1 + 0.6)), 6.75))

    # ------------------------------------------------------------ 露天摊位（防水布 + 杆）
    St = Batch('props_stalls')
    Gd = Batch('props_goods')
    stalls = []
    for i, y in enumerate((-10.5, -5.5, 5.5, 10.5)):
        for j, x in enumerate((4.0, 8.4, 12.4)):
            stalls.append((x + rnd.uniform(-0.4, 0.4), y + rnd.uniform(-0.4, 0.4), (i * 3 + j)))
    kinds = ['elec', 'radio', 'tools', 'pots', 'clothes', 'heap', 'appl', 'paper', 'heap', 'pots', 'tools', 'clothes']

    def table(B, x, y, w, d, h=0.8):
        B.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, h - 0.04, h, PLY)
        for (ex, ey) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            B.boxc(x + ex * (w / 2 - 0.08), y + ey * (d / 2 - 0.08), 0, 0.05, 0.05, h - 0.04, STEEL)

    def heap(B, x, y, rad, n, r, z=0.0):
        """杂乱的废料堆：随机旋转的箱、板、管、轮胎。"""
        for i in range(n):
            a = r.uniform(0, math.tau); d = rad * math.sqrt(r.random())
            hz = z + (1 - d / rad) * rad * 0.6 * r.random()
            m = r.choice(SCRAPM)
            k = r.random()
            if k < 0.55:
                rbox(B, x + d * math.cos(a), y + d * math.sin(a), hz + 0.1, r.uniform(0.1, 0.6), r.uniform(0.05, 0.4),
                     r.uniform(0.03, 0.3), m, r.uniform(0, 3), r.uniform(-0.5, 0.5), r.uniform(-0.5, 0.5))
            elif k < 0.8:
                p = Vector((x + d * math.cos(a), y + d * math.sin(a), hz + 0.08))
                q = p + Vector((r.uniform(-0.6, 0.6), r.uniform(-0.6, 0.6), r.uniform(-0.1, 0.3)))
                B.tube([tuple(p), tuple(q)], r.uniform(0.02, 0.06), r.choice((RUST, STEEL, COPPER)), 6)
            else:
                disc(B, x + d * math.cos(a), y + d * math.sin(a), hz + 0.2, 0.3, TYRE, 'x', 12, 0.18)

    def fridge(B, x, y, z=0.0, r=None):
        B.boxc(x, y, z, 0.6, 0.6, 1.5, ENAMEL)
        B.boxc(x, y - 0.305, z + 0.95, 0.56, 0.01, 0.015, DARK)
        B.boxc(x + 0.22, y - 0.32, z + 1.05, 0.03, 0.03, 0.25, ALU)

    def washer(B, x, y, z=0.0):
        B.boxc(x, y, z, 0.6, 0.58, 0.85, ENAMEL)
        disc(B, x, y - 0.3, z + 0.48, 0.2, DARK, 'y', 14, 0.02)
        disc(B, x, y - 0.31, z + 0.48, 0.15, SCREEN, 'y', 14, 0.02)

    def folded_map(B, x, y, z, rz):
        """折成手风琴状的一张纸（空白）。"""
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z')
        n = 6; w = 0.06; L = 0.22
        vs = []
        for i in range(n + 1):
            zz = 0.012 if i % 2 else 0.0
            vs += [(i * w, 0, zz), (i * w, L, zz)]
        fs = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(n)]
        B.poly(vs, fs + [f[::-1] for f in fs], PAPER, M)

    def goods(kind, x, y, w, d, h, r):
        B = Gd
        if kind in ('elec', 'radio'):
            for _ in range(8):
                gx, gy = x + r.uniform(-w / 2 + 0.2, w / 2 - 0.2), y + r.uniform(-d / 2 + 0.15, d / 2 - 0.15)
                sx, sy, sz = r.uniform(0.18, 0.4), r.uniform(0.12, 0.28), r.uniform(0.1, 0.3)
                rz = r.uniform(-0.4, 0.4)
                rbox(B, gx, gy, h + sz / 2, sx, sy, sz, r.choice(PLAST + [ENAMEL]), rz)
                if kind == 'radio':
                    B.cyl(gx + sx * 0.3, gy, h + sz, 0.005, 0.3, ALU, 4)
            for _ in range(4):
                B.tube(sag((x + r.uniform(-w / 2, w / 2), y - d / 2 - 0.1, h + 0.01), (x + r.uniform(-w / 2, w / 2), y + d / 2, h + 0.01), -0.05, 4),
                       0.01, CABLE, 4)
            heap(B, x - w / 2 - 0.4, y, 0.4, 10, r)
        elif kind == 'tools':
            for _ in range(14):
                gx, gy = x + r.uniform(-w / 2 + 0.1, w / 2 - 0.1), y + r.uniform(-d / 2 + 0.1, d / 2 - 0.1)
                rbox(B, gx, gy, h + 0.015, r.uniform(0.2, 0.4), 0.04, 0.03, r.choice((STEEL, RUST, ALU)), r.uniform(0, 3))
            B.boxc(x, y + d / 2 + 0.25, 0, 0.6, 0.35, 0.35, RUST)
            heap(B, x, y + d / 2 + 0.25, 0.3, 6, r, 0.35)
        elif kind == 'pots':
            for _ in range(9):
                gx, gy = x + r.uniform(-w / 2 + 0.2, w / 2 - 0.2), y + r.uniform(-d / 2 + 0.2, d / 2 - 0.2)
                rr = r.uniform(0.08, 0.15)
                B.cyl(gx, gy, h, rr, rr * r.uniform(0.6, 1.1), r.choice((ALU, COPPER, STEEL)), 12, smooth=False)
                B.cyl(gx, gy, h + 0.01, rr * 0.85, rr * 0.6, DARK, 12, smooth=False)
            for k in range(4):
                B.cyl(x + w / 2 + 0.3, y, k * 0.14, 0.18, 0.12, ALU, 12, smooth=False)
        elif kind == 'clothes':
            B.tube([(x - w / 2, y, 1.7), (x + w / 2, y, 1.7)], 0.015, STEEL, 6)
            for sx_ in (x - w / 2, x + w / 2):
                B.tube([(sx_, y, 0), (sx_, y, 1.7)], 0.015, STEEL, 6)
            n = int(w / 0.18)
            for k in range(n):
                cx = x - w / 2 + 0.1 + k * (w - 0.2) / n
                B.box(cx - 0.02, cx + 0.02, y - 0.25, y + 0.25, r.uniform(0.9, 1.1), 1.66, r.choice(CLOTH))
            heap(B, x, y + 0.7, 0.4, 6, r)
        elif kind == 'heap':
            heap(B, x, y, 1.0, 45, r)
            for k in range(3):
                B.cyl(x + w / 2 + 0.2, y - 0.3, k * 0.2, 0.33, 0.19, TYRE, 14)
        elif kind == 'appl':
            fridge(B, x - 0.8, y + 0.2); washer(B, x, y + 0.2); washer(B, x + 0.7, y + 0.1)
            rbox(B, x + 0.6, y - 0.6, 0.3, 0.6, 0.55, 0.6, ENAMEL, 0.3, 0.0, 0.25)
            heap(B, x + 1.4, y, 0.5, 12, r)
        elif kind == 'paper':
            for _ in range(10):
                gx, gy = x + r.uniform(-w / 2 + 0.2, w / 2 - 0.2), y + r.uniform(-d / 2 + 0.15, d / 2 - 0.15)
                zz = h
                for k in range(r.randint(1, 4)):
                    rbox(B, gx, gy, zz + 0.025, 0.3, 0.22, 0.05, PAPER, r.uniform(-0.2, 0.2))
                    zz += 0.05
            folded_map(B, x - 0.2, y - d / 2 + 0.12, h, 0.1)
            B.boxc(x + w / 2 + 0.3, y, 0, 0.5, 0.5, 0.45, CARD)
            B.boxc(x + w / 2 + 0.3, y, 0.45, 0.4, 0.35, 0.2, PAPER)

    for (x, y, k) in stalls:
        r = random.Random(500 + k)
        kind = kinds[k % len(kinds)]
        w, d = r.uniform(2.2, 2.8), 1.1
        if kind in ('elec', 'radio', 'tools', 'pots', 'paper'):
            table(St, x, y, w, d)
            h = 0.8
        else:
            h = 0.0
        goods(kind, x, y, w, d, h, r)
        # 防水布 + 杆：前低后高、中间下垂；后面一根横杆
        tm = r.choice(TARPS)
        px0, px1 = x - w / 2 - 0.4, x + w / 2 + 0.4
        s = -1 if y < 0 else 1   # 布前沿朝市场中间通道
        py0, py1 = y - s * (d / 2 + 0.9), y + s * (d / 2 + 0.5)
        zf, zb = r.uniform(1.95, 2.15), r.uniform(2.4, 2.7)
        for (ex, ey, hh) in ((px0, py0, zf), (px1, py0, zf), (px0, py1, zb), (px1, py1, zb), ((px0 + px1) / 2, py1, zb)):
            St.cyl(ex + r.uniform(-0.05, 0.05), ey, 0, 0.03, hh + 0.05, r.choice((STEEL, DWOOD)), 6)
        St.tube([(px0, py1, zb), (px1, py1, zb)], 0.025, STEEL, 5)
        tarp(St, px0, px1, py0, py1, zf, zb, tm, r.uniform(0.1, 0.22))
        if r.random() < 0.5:   # 侧面垂下的一片布
            quad2(St, [(px0, py0, zf), (px0, py1, zb), (px0, py1, zb - 1.2), (px0, py0, zf - 0.7)], r.choice(TARPS))
        bulbs.append((x, y, min(zf, zb) - 0.2))
        drips.append((x, py0, zf - 0.1))
        St.boxc(x + r.uniform(-0.5, 0.5), y + s * (d / 2 + 0.3), 0, 0.3, 0.3, 0.42, r.choice((PLAST[0], PLAST[2], DWOOD)))
    # 主角：纸品小摊上一张折好的纸地图（空白），自带一盏灯
    hx, hy = 5.9, -7.2
    table(St, hx, hy, 1.1, 0.65, 0.78)
    St.box(hx - 0.55, hx + 0.55, hy - 0.33, hy + 0.33, 0.78, 0.785, CLOTH[1])
    M0 = Matrix.Translation((hx - 0.12, hy - 0.15, 0.786)) @ Matrix.Rotation(0.35, 4, 'Z')
    vs_ = []
    for i in range(7):
        zz = 0.02 if i % 2 else 0.0
        vs_ += [(i * 0.085, 0, zz * 1.3), (i * 0.085, 0.36, zz * 1.3)]
    fs_ = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(6)]
    Gd.poly(vs_, fs_ + [f[::-1] for f in fs_], PAPER, M0)
    for k in range(3):
        rbox(Gd, hx + 0.3, hy + 0.05, 0.8 + k * 0.02, 0.24, 0.17, 0.02, PAPER, 0.1 * k)
    for k in range(2):
        rbox(Gd, hx - 0.35, hy + 0.12, 0.8 + k * 0.03, 0.2, 0.28, 0.03, PAPER, -0.2 + 0.1 * k)
    St.cyl(hx + 0.5, hy + 0.3, 0, 0.02, 1.6, STEEL, 6)
    St.box(hx + 0.1, hx + 0.52, hy + 0.28, hy + 0.32, 1.58, 1.6, STEEL)
    bulbs.append((hx + 0.05, hy + 0.05, 1.35))
    for i, y in enumerate((-6.6, 0.0, 6.6)):
        for j, x0_ in enumerate((fx0 + 1.0, fx0 + 6.0)):
            goods(['elec', 'pots', 'tools', 'radio', 'tools', 'paper'][i * 2 + j], x0_ + 2.1, y, 4.0, 1.3, 0.9, random.Random(900 + i * 2 + j))
    for (x, y) in ((15.0, -12.8), (15.0, 12.4), (27.5, -12.5), (6.0, -13.3), (10.5, 13.3), (1.8, 6.0)):
        heap(Gd, x, y, 1.1, 40, random.Random(int(x * 10 + y)))
    fridge(Gd, 14.6, -3.0); washer(Gd, 14.6, -2.2); fridge(Gd, 14.8, 2.8)
    def twisted(B, x, y, r):   # 扭曲的废钢：随机折线的扁条 / 管
        p = Vector((x, y, r.uniform(0.05, 0.4)))
        pts = [tuple(p)]
        for _ in range(r.randint(3, 6)):
            p = p + Vector((r.uniform(-0.4, 0.4), r.uniform(-0.4, 0.4), r.uniform(-0.1, 0.25)))
            p.z = max(0.03, p.z); pts.append(tuple(p))
        B.tube(pts, r.uniform(0.015, 0.05), r.choice((RUST, STEEL, COPPER)), 5)
    for (x, y) in ((6.2, -2.4), (10.5, 2.4), (13.8, -8.0), (3.4, 8.2), (11.8, 8.0), (7.0, -13.0)):
        rh = random.Random(int(x * 31 + y * 7))
        heap(Gd, x, y, 0.9, 30, rh)
        for _ in range(8):
            twisted(Gd, x + rh.uniform(-0.8, 0.8), y + rh.uniform(-0.8, 0.8), rh)
        if rh.random() < 0.6:
            for k in range(rh.randint(3, 6)):
                Gd.cyl(x + 1.0 + rh.uniform(-0.03, 0.03), y + 0.3, k * 0.2, 0.34, 0.19, TYRE, 14, smooth=False)
        if rh.random() < 0.6:   # 家电空壳：侧倒 / 缺门
            rbox(Gd, x - 1.0, y - 0.2, 0.3, 0.6, 0.85, 0.6, ENAMEL, rh.uniform(0, 3), math.pi / 2, 0.0)
    # 市场地面：裂缝、油污、积水
    for _ in range(26):
        x, y = rnd.uniform(MX0, MX1), rnd.uniform(MY0, MY1)
        a = rnd.uniform(0, math.tau)
        for _ in range(rnd.randint(4, 9)):
            a += rnd.uniform(-0.7, 0.7); L = rnd.uniform(0.2, 0.6)
            x2, y2 = x + L * math.cos(a), y + L * math.sin(a)
            nx_, ny_ = -math.sin(a) * 0.012, math.cos(a) * 0.012
            Al.poly([(x - nx_, y - ny_, 0.018), (x2 - nx_, y2 - ny_, 0.018), (x2 + nx_, y2 + ny_, 0.018), (x + nx_, y + ny_, 0.018)],
                    [(0, 1, 2, 3)], CRACK)
            x, y = x2, y2
    for _ in range(45):
        px, py = rnd.uniform(MX0, MX1), rnd.uniform(MY0, MY1)
        n = 12; rr = rnd.uniform(0.4, 2.2)
        Al.poly([(px + rr * math.cos(i * math.tau / n) * rnd.uniform(0.6, 1.3), py + rr * math.sin(i * math.tau / n) * rnd.uniform(0.6, 1.3), 0.02)
                 for i in range(n)], [tuple(range(n))], STAIN)
    for _ in range(22):
        px, py = rnd.uniform(MX0 + 1, MX1 - 1), rnd.uniform(-1.5, 1.5) if rnd.random() < 0.5 else rnd.uniform(MY0, MY1)
        n = 10; rr = rnd.uniform(0.4, 1.1)
        Al.poly([(px + rr * math.cos(i * math.tau / n) * rnd.uniform(0.7, 1.2), py + rr * 0.7 * math.sin(i * math.tau / n) * rnd.uniform(0.7, 1.2), 0.03)
                 for i in range(n)], [tuple(range(n))], WET)

    for x in (-31.5, -29.0, -26.5, -24.0, -21.5, -30.2, -27.8):   # 主巷上空电线 / 檐口滴水（c2 画面里）
        drips.append((x, rnd.uniform(-0.45, 0.45), rnd.uniform(3.5, 5.0)))
    # ------------------------------------------------------------ 滴水：下落的水滴 + 积水 + 水花环
    for (x, y, zt) in drips:
        n = 10; rr = rnd.uniform(0.25, 0.6)
        Pp.poly([(x + rr * math.cos(i * math.tau / n) * rnd.uniform(0.7, 1.2), y + rr * math.sin(i * math.tau / n) * rnd.uniform(0.7, 1.2), 0.05)
                 for i in range(n)], [tuple(range(n))], WET)
        for k in range(2):
            rr2 = rnd.uniform(0.05, 0.16)
            Pp.tube([(x + rr2 * math.cos(a * math.tau / 8), y + rr2 * math.sin(a * math.tau / 8), 0.056) for a in range(9)], 0.005, SPLASH, 4)
        for _ in range(4 if zt > 3 else 2):
            L = rnd.uniform(0.4, 1.2)
            z = rnd.uniform(0.2, max(0.25, zt - L))
            Pp.cyl(x + rnd.uniform(-0.02, 0.02), y, z, 0.005, L, DROP, 4)

    # ------------------------------------------------------------ 灯具
    for (x, y, z) in bulbs:
        Li.cyl(x, y, z + 0.08, 0.004, 0.25, CABLE, 4)
        Li.sphere(x, y, z, 0.05, BULB, seg=8, rings=5)
    for x in (fx0 + 1.8, fx0 + 5.5, fx0 + 9.1):
        for y in (-6.6, 0.0, 6.6):
            Li.boxc(x, y, 6.2, 1.3, 0.25, 0.08, STEEL)
            Li.boxc(x, y, 6.18, 1.2, 0.18, 0.02, COLDL)
    for y in (-8.0, -3.0, 3.0, 8.0):
        pts = sag((MX0, y, 3.4), (fx0, y + 0.5, 4.2), 0.6, 10)
        Al.tube(pts, 0.012, CABLE, 4)
        for p in pts[1:-1:2]:
            Li.sphere(p[0], p[1], p[2] - 0.1, 0.045, BULB, seg=8, rings=5)
    for (x, y) in ((MX0 + 1.0, -13.5), (MX0 + 1.0, 13.5), (15.0, 0.0)):
        Li.cyl(x, y, 0, 0.08, 6.5, STEEL, 8)
        Li.boxc(x, y + (0.6 if y <= 0 else -0.6), 6.2, 0.3, 0.45, 0.18, STEEL)
        Li.boxc(x, y + (0.6 if y <= 0 else -0.6), 6.16, 0.22, 0.36, 0.05, SODIUM)
        sodiums.append((x, y + (0.6 if y <= 0 else -0.6), 6.05))

    # ------------------------------------------------------------ 背景：中层底面（桁架、管道、灯、东缘）、巨柱、过滤塔 / 工厂
    Bg = Batch('bg_structure')
    UND = C.flat('mid_underside', (0.2, 0.2, 0.21), 0.75, metal=0.3, noise=0.4)
    TRUSS = C.flat('truss', (0.16, 0.15, 0.15), 0.7, metal=0.6, noise=0.4)
    Bg.box(-700, EDGE_X, -700, 700, CEIL, CEIL + 14, UND)
    Bg.box(-600, 600, -600, 600, -0.5, -0.31, CONC)
    # 底面主梁 + 桁架（下弦、竖杆、斜杆）
    for y in range(-300, 320, 30):
        Bg.box(-300, EDGE_X, y - 1.5, y + 1.5, CEIL - 5, CEIL, UND)
    for x in range(-300, int(EDGE_X), 24):
        zb = CEIL - 12
        Bg.box(x - 0.6, x + 0.6, -300, 300, zb, zb + 1.0, TRUSS)
        for y in range(-300, 300, 8):
            Bg.box(x - 0.3, x + 0.3, y - 0.3, y + 0.3, zb, CEIL, TRUSS)
            Bg.tube([(x, y, zb + 0.5), (x, y + 8, CEIL - 0.5)], 0.25, TRUSS, 4)
        if rnd.random() < 0.2:
            for y in range(-200, 200, 32):
                Bg.boxc(x, y, zb - 0.3, 0.5, 3.0, 0.25, COLDL if rnd.random() < 0.75 else SODIUM)
    rb = random.Random(3)
    for i in range(18):   # 检修管道
        y = rb.uniform(-150, 180); z = CEIL - rb.uniform(13, 18)
        Bg.tube([(-300, y, z), (EDGE_X - 2, y + rb.uniform(-15, 15), z)], rb.uniform(0.6, 1.8), RUST if i % 2 else STEEL, 10)
        for _ in range(4):
            x = rb.uniform(-80, 80)
            Bg.cyl(x, y, z - rb.uniform(8, 60), 0.05, rb.uniform(2, 6), DROP, 4)
    for i in range(30):
        x, y = rb.uniform(-250, EDGE_X - 5), rb.uniform(-200, 250)
        Bg.boxc(x, y, CEIL - 13, 3.0, 0.6, 0.3, COLDL if rb.random() < 0.7 else SODIUM)
    # 中层东缘：亮着的边缘面、檐下灯带、挂下来的管
    Bg.box(EDGE_X - 1, EDGE_X, -400, 400, CEIL - 6, CEIL + 16, UND)
    for z in (CEIL - 4.5, CEIL + 2.0, CEIL + 8.0):
        Bg.box(EDGE_X, EDGE_X + 0.3, -400, 400, z, z + 0.5, COLDL if z < CEIL else SODIUM)
    for y in range(-300, 300, 14):
        Bg.boxc(EDGE_X + 1.5, y, CEIL + 16, 2.0, rb.uniform(5, 12), rb.uniform(3, 18), UND)
        if rb.random() < 0.6:
            Bg.boxc(EDGE_X + 0.4, y, CEIL + 10, 0.2, 3, 1.2, WINW)
    for y in range(-120, 140, 22):
        Bg.tube([(EDGE_X - 3, y, CEIL - 6), (EDGE_X - 3, y, CEIL - 30 - rb.uniform(0, 20))], 0.5, RUST, 8)
    # 中层边缘下挂的基础裙墙（z 100–140），底部一道很亮的边缘灯带
    RIM = C.flat('rim_light', (1, 0.95, 0.85), 0.3, emit=(1.0, 0.9, 0.75), estr=60.0)
    Bg.box(EDGE_X - 3, EDGE_X, -400, 400, 100, CEIL, UND)
    Bg.box(EDGE_X - 3.3, EDGE_X + 0.3, -400, 400, 99.2, 100.0, RIM)
    for z in (108.0, 118.0, 128.0):
        for y in range(-300, 300, 9):
            if rb.random() < 0.45:
                Bg.box(EDGE_X - 3.05, EDGE_X - 3.0, y, y + 4, z, z + 2.2, WINW)
    # 巨柱（带竖管、检修梯井、滴水痕）
    for (x, y, r_) in ((-52, 26, 9), (46, -30, 8), (-10, 48, 10), (60, 60, 12), (-90, -40, 11), (-60, 110, 12), (110, 20, 10),
                       (20, -80, 10), (-47, 22, 3.0)):
        if r_ < 5:
            continue
        Bg.cyl(x, y, 0, r_, CEIL, PILLARM, 32)
        Bg.cyl(x, y, CEIL - 20, r_, 20, PILLARM, 32, r2=r_ * 2.0)
        for z in range(8, int(CEIL) - 20, 14):
            Bg.cyl(x, y, z, r_ + 0.4, 0.8, RUST, 32)
        Bg.box(x - 0.8, x + 0.8, y - r_ - 0.3, y - r_, 0, CEIL - 20, RUST)
        for k in range(3):
            a = 0.6 + k * 0.5
            px, py = x + (r_ + 0.8) * math.cos(a), y + (r_ + 0.8) * math.sin(a)
            Bg.cyl(px, py, 0, 0.5 - k * 0.1, CEIL - 20, STEEL if k else RUST, 10)
            px2, py2 = x + (r_ + 0.05) * math.cos(a + 0.12), y + (r_ + 0.05) * math.sin(a + 0.12)
            Bg.cyl(px2, py2, rb.uniform(0, 20), 0.35, rb.uniform(20, 60), WETWALL, 6)
    # 远处：过滤塔、工厂厂房、烟囱
    Fa = Batch('bg_factory')
    FAC = C.flat('factory', (0.14, 0.13, 0.12), 0.8, noise=0.4)
    for (x, y, sx, sy, h) in ((40, 70, 34, 22, 48), (-30, 95, 40, 26, 36), (72, 2, 22, 34, 46)):   # 空气过滤塔：大箱体 + 圆形风口
        Fa.boxc(x, y, 0, sx, sy, h, FAC)
        for i in range(3):
            for j in range(2):
                disc(Fa, x - sx / 3 + i * sx / 3, y - sy / 2 - 0.3, 14 + j * 16, 5.5, DARK, 'y', 24, 0.5)
                disc(Fa, x - sx / 3 + i * sx / 3, y - sy / 2 - 0.2, 14 + j * 16, 6.2, RUST, 'y', 24, 0.3)
        for k in range(4):
            Fa.boxc(x - sx / 2 + 4 + k * 8, y - sy / 2 - 0.4, h - 3, 1.5, 0.3, 0.6, SODIUM)
        Fa.cyl(x + sx / 2 - 4, y, h, 2.5, 30, FAC, 16, r2=1.8)
        if x > 60:   # 朝西的风口（c3 画面边缘）
            for i in range(3):
                for j in range(2):
                    disc(Fa, x - sx / 2 - 0.3, y - sy / 3 + i * sy / 3, 14 + j * 16, 5.0, DARK, 'x', 24, 0.5)
                    disc(Fa, x - sx / 2 - 0.2, y - sy / 3 + i * sy / 3, 14 + j * 16, 5.7, RUST, 'x', 24, 0.3)
    for i in range(14):
        x, y = rb.uniform(-160, 200), rb.uniform(90, 180)
        Fa.boxc(x, y, 0, rb.uniform(20, 50), rb.uniform(15, 35), rb.uniform(8, 25), FAC)
        if i % 2 == 0:
            Fa.cyl(x + rb.uniform(-8, 8), y + rb.uniform(-5, 5), 0, rb.uniform(2, 3.5), rb.uniform(35, 70), FAC, 16, r2=1.5)
        for _ in range(4):
            Fa.boxc(x + rb.uniform(-10, 10), y - 18, rb.uniform(2, 12), 1.5, 0.3, 0.8, SODIUM)
    for gx in range(-96, 90, 12):   # 周边一圈远处铁皮屋
        for gy in range(-84, 84, 12):
            if SX0 - 8 < gx < MX1 + 8 and -60 < gy < PIPE_Y + 6: continue
            if rb.random() < 0.25: continue
            for _ in range(3):
                x, y = gx + rb.uniform(-4, 4), gy + rb.uniform(-4, 4)
                h = rb.uniform(2.4, 7.5)
                Fa.boxc(x, y, 0, rb.uniform(3, 6), rb.uniform(3, 6), h, rb.choice(TINS))
                Fa.boxc(x, y, h, rb.uniform(3.5, 6.5), rb.uniform(3.5, 6.5), 0.1, rb.choice(ROOFS))
                if rb.random() < 0.35:
                    Fa.boxc(x + rb.uniform(-1, 1), y - 1.6, 1.2, 0.6, 0.05, 0.5, WINW)

    Batch.build_all()

    # ------------------------------------------------------------ 世界 + 雾 + 灯光
    w = bpy.data.worlds.new('w'); sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs[0].default_value = (0.05, 0.055, 0.06, 1); bg.inputs[1].default_value = 0.4
    nt.links.new(bg.outputs[0], out.inputs[0])
    vs = nt.nodes.new('ShaderNodeVolumePrincipled')
    vs.inputs['Color'].default_value = (0.6, 0.6, 0.62, 1)
    vs.inputs['Density'].default_value = 0.0045
    nt.links.new(vs.outputs[0], out.inputs['Volume'])
    sc.cycles.volume_bounces = 0
    sc.cycles.volume_step_rate = 4.0
    for (x, y, e) in ((-15, 0, 14000), (20, 0, 10000), (-40, 40, 10000), (70, -20, 12000)):
        ld = bpy.data.lights.new('under_%d' % x, 'AREA'); ld.energy = e; ld.size = 60; ld.color = (0.65, 0.78, 1.0)
        o = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(o); o.location = (x, y, CEIL - 16)
    ld = bpy.data.lights.new('edge_glow', 'AREA'); ld.energy = 80000; ld.size = 200; ld.size_y = 8; ld.shape = 'RECTANGLE'
    ld.color = (1.0, 0.75, 0.5)
    o = bpy.data.objects.new('edge_glow', ld); sc.collection.objects.link(o); o.location = (EDGE_X - 8, 0, 98.0)
    o.rotation_euler = (0, 0, 0)
    for i, (x, y, z) in enumerate(bulbs):
        C.point_light('bulb_%d' % i, (x, y, z - 0.08), 22, (1.0, 0.8, 0.6), 0.05)
    for i, (x, y, z) in enumerate(sodiums):
        C.spot_light('sod_%d' % i, (x, y, z), (x, y, 0), 800, (1.0, 0.55, 0.2), 110, 0.2)
    for x in (fx0 + 1.8, fx0 + 5.5, fx0 + 9.1):
        for y in (-6.6, 0.0, 6.6):
            C.spot_light('work_%d_%d' % (x, y), (x, y, 6.1), (x, y, 0), 700, (0.78, 0.88, 1.0), 120, 0.5)
    C.spot_light('hero_map', (hx + 0.05, hy + 0.05, 1.3), (hx - 0.05, hy - 0.05, 0.78), 12, (1.0, 0.85, 0.65), 70, 0.05)
    for x in (-30.0, -10.0, 10.0):
        C.spot_light('pipe_%d' % x, (x, PIPE_Y - 1.2, PIPE_Z - 0.6), (x, PIPE_Y - 4, 0), 1500, (0.75, 0.88, 1.0), 100, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.9

    CAMS = {
        'c1': ((-46.0, -32.0, 26.0), (-4.0, 0.0, 6.0), 24, 0.16),
        'c2': ((-33.0, 0.0, 1.5), (-19.0, 0.2, 14.0), 16),
        'c3': ((2.6, -8.2, 1.55), (14.0, -2.0, 2.0), 21),
    }
    cv = CAMS[A['cam']]
    C.camera(sc, cv[0], cv[1], cv[2], cv[3] if len(cv) > 3 else 0.0)
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
