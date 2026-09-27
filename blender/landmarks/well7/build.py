"""层间检查点（中层 C 区「钢铁与霓虹」）+ 7 号井（下层地基的黑市）——同一个竖向场景（位置为仓库推断）。
卡面：跨层需行政署签发的通行许可；检查点查身份芯片与随身标签；下层货物进入中层交 5% 入境税；告示称「临时管制」。
7 号井：一口通到地面的巨型竖向检修井，井底四周长出黑市：摊位、老 K 的杂货店（只收灰色代币、匿名芯片卡；
这里只做空白招牌的普通店面）、黑市终端角（旧终端，屏上只有抽象绿线）。

布局（米）：井筒中心 (0, 0)，内净 10.8 × 10.8（四角混凝土柱中心 ±6），z 0 → 64。
  中层甲板顶面 z = 64（site_deck，y -8..40，井口开洞 ±6.6）；南沿 y = -8 是中层边缘剖面（桁架梁 + 灯），相机在南侧。
  检查点（props_checkpoint / props_gates）：旅客从北（y 40）向南走到井口；雨棚 y 10..26、x -13..13；
  四条通道（x 分界 -6 -3 0 3 6）：y 23.5 道闸杆 → y 19 三辊闸 → y 15 安检门；x -12..-7.5 玻璃岗亭；
  x 7..13 货物查验台 + 传送带 + 透视查验通道；北侧一排防撞柱；临时水马 / 围挡；四根投光灯杆。
  井内（props_shaft / props_lift）：东半边折返楼梯（每跑升 4 m），西半边货客两用升降梯（导轨 + 轿厢 + 对重 + 井口天轮架）。
  井底 z = 0（site_ground）：市场（props_market 摊棚 / props_goods 货物箱）、老 K 杂货店（props_shop，x 9..16、y -21..-14，
  门面朝西）、终端角（props_terminal，x -11..-7、y -11..-8，朝南）。
bg_*：两侧延伸的中层甲板、中层霓虹楼群、中层底面、下层支撑柱与铁皮屋（只渲染，不导出）。
中立建筑：无文字、无标志、无徽章、无人物、无武器，无锁链 / 束缚物；信号灯只用颜色。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/well7/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/w7.jpg [--blend /tmp/w7.blend] [--log /tmp/w7.log] [--exposure 0.9]
cam: c1 竖向剖面斜俯视（上检查点 + 井 + 下市场） / c2 检查点通道视高 / c3 井底市场
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='night', res='900', samples='24', out='/tmp/w7.jpg', blend='', log='', exposure=''))

DZ = 64.0          # 中层甲板顶面
DT = 1.2           # 甲板板厚（下面还有 3 m 桁架梁）
SH = 6.0           # 井筒角柱中心 ±SH
HOLE = 6.6         # 甲板开洞半宽
DECK_Y0, DECK_Y1, DECK_X = -8.0, 40.0, 34.0


def main():
    import bpy
    from mathutils import Matrix, Vector
    sc = C.setup(A['samples'])
    Batch = C.Batch
    rnd = random.Random(7)

    # ------------------------------------------------------------ 材质
    CONC = C.pbr('w7_conc', 'concrete_wall_008', 6.0, tint=(0.5, 0.5, 0.5), sat=0.2, weather=1.0)
    DECKF = C.pbr('w7_deckfloor', 'smooth_concrete_floor', 4.0, tint=(0.4, 0.41, 0.43), sat=0.3, value=0.8, weather=0.6)
    GROUNDF = C.pbr('w7_ground', 'concrete_floor_worn_001', 5.0, tint=(0.34, 0.33, 0.31), sat=0.2, value=0.55, weather=1.0, nstr=0.25, rough_mul=0.7)
    ASPH = C.pbr('w7_asphalt', 'asphalt_02', 4.0, tint=(0.4, 0.4, 0.42), sat=0.3, value=0.7)
    STEEL = C.pbr('w7_steel', 'Metal009', 2.0, tint=(0.34, 0.35, 0.37), sat=0.3, metal=0.85, rough_mul=1.1)
    PAINT = C.pbr('w7_paint_grey', 'Metal009', 2.0, tint=(0.22, 0.24, 0.26), sat=0.1, metal=0.3, rough_mul=1.3)
    NAVY = C.flat('w7_paint_navy', (0.06, 0.08, 0.11), 0.45, metal=0.3, noise=0.25)
    SHEET = C.pbr('w7_sheet', 'box_profile_metal_sheet', 2.5, tint=(0.5, 0.52, 0.54), sat=0.3, metal=0.6)
    SHEET_R = C.pbr('w7_sheet_rust', 'box_profile_metal_sheet', 2.5, tint=(0.52, 0.34, 0.22), sat=0.6, metal=0.3, weather=1.0)
    RUST = C.flat('w7_rust', (0.24, 0.12, 0.06), 0.8, metal=0.3, noise=0.5)
    RUBBER = C.pbr('w7_rubber', 'Rubber004', 1.0, tint=(0.3, 0.3, 0.3), sat=0.2)
    HAZ = C.hazard('w7_hazard')
    HAZ_RW = C.hazard('w7_hazard_rw', (0.7, 0.06, 0.04), (0.8, 0.78, 0.74), 0.4)
    LANE = C.flat('w7_lanepaint', (0.7, 0.55, 0.1), 0.6, noise=0.4)
    WHITEP = C.flat('w7_whitepaint', (0.6, 0.6, 0.58), 0.6, noise=0.4)
    GLASS = C.glass('glass_booth', (0.05, 0.07, 0.08), 0.04)
    GLASSW = C.glass('glass_shop', (0.05, 0.04, 0.03), 0.2, emit=(1.0, 0.68, 0.36), estr=2.2)
    DARK = C.flat('w7_dark', (0.012, 0.012, 0.012), 0.9)
    CABLE = C.flat('w7_cable', (0.02, 0.02, 0.022), 0.5)
    WET = C.flat('w7_puddle', (0.02, 0.025, 0.03), 0.03, coat=1.0)
    COLDL = C.flat('w7_coldlight', (0.8, 0.9, 1), 0.3, emit=(0.78, 0.9, 1.0), estr=30.0)
    WARML = C.flat('w7_bulb', (1, 0.85, 0.6), 0.3, emit=(1.0, 0.78, 0.5), estr=40.0)
    SODL = C.flat('w7_sodium', (1, 0.6, 0.2), 0.3, emit=(1.0, 0.5, 0.15), estr=30.0)
    RED = C.flat('w7_sig_red', (1, 0.1, 0.05), 0.3, emit=(1.0, 0.06, 0.03), estr=25.0)
    GREEN = C.flat('w7_sig_green', (0.1, 1, 0.3), 0.3, emit=(0.1, 1.0, 0.35), estr=25.0)
    AMBER = C.flat('w7_sig_amber', (1, 0.6, 0.1), 0.3, emit=(1.0, 0.55, 0.08), estr=25.0)
    SCANL = C.flat('w7_scanstrip', (0.3, 0.8, 1), 0.3, emit=(0.25, 0.75, 1.0), estr=12.0)
    SIGNW = C.flat('w7_blanksign', (0.9, 0.85, 0.7), 0.4, emit=(1.0, 0.86, 0.62), estr=3.0)
    SCREEN = C.line_screen('w7_termscreen', estr=7.0)
    CBOX = C.pbr('w7_container', 'box_profile_metal_sheet', 2.4, tint=(0.36, 0.42, 0.44), sat=0.8, metal=0.4, weather=0.8)
    PAPER = C.flat('w7_paper', (0.75, 0.73, 0.66), 0.85, noise=0.15)
    WETW = C.flat('w7_wetstreak', (0.035, 0.033, 0.03), 0.08, coat=0.8, noise=0.5)
    DRIP = C.flat('w7_drip', (0.8, 0.88, 0.95), 0.05, emit=(0.8, 0.9, 1.0), estr=0.8)
    def mesh_mat(name, c=(0.2, 0.21, 0.22), cell=0.12):
        """钢丝网：世界坐标砖块纹理的灰缝 = 钢丝，其余透明。"""
        m, nt, b = C.new_mat(name)
        b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Metallic'].default_value = 0.7; b.inputs['Roughness'].default_value = 0.5
        out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / cell,) * 3
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(mp.outputs[0], sp.inputs[0])
        ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'ADD'
        nt.links.new(sp.outputs[0], ad.inputs[0]); nt.links.new(sp.outputs[1], ad.inputs[1])
        cb = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(ad.outputs[0], cb.inputs[0]); nt.links.new(sp.outputs[2], cb.inputs[1])
        br = nt.nodes.new('ShaderNodeTexBrick'); br.offset = 0.0
        br.inputs['Scale'].default_value = 1.0; br.inputs['Mortar Size'].default_value = 0.1
        br.inputs['Brick Width'].default_value = 1.0; br.inputs['Row Height'].default_value = 1.0
        nt.links.new(cb.outputs[0], br.inputs['Vector'])
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(br.outputs['Fac'], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(b.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
        return m
    MESH = mesh_mat('w7_mesh')
    MONI = C.line_screen('w7_boothscreen', (0.3, 0.7, 1.0), 2.5, 20.0)
    TARPS = [C.flat('w7_tarp_%d' % i, c, 0.85, noise=0.55) for i, c in enumerate(
        ((0.07, 0.13, 0.2), (0.12, 0.17, 0.11), (0.3, 0.18, 0.07), (0.22, 0.21, 0.19), (0.26, 0.09, 0.06)))]
    CRATES = [C.pbr('w7_crate_a', 'rough_wood', 1.0, tint=(0.55, 0.45, 0.33), sat=0.5, value=0.6),
              C.flat('w7_crate_b', (0.1, 0.2, 0.3), 0.6, noise=0.3), C.flat('w7_crate_c', (0.25, 0.27, 0.2), 0.7, noise=0.3),
              C.flat('w7_card', (0.3, 0.22, 0.13), 0.9, noise=0.35)]
    PLAST = [C.flat('w7_plast_%d' % i, c, 0.45, noise=0.2) for i, c in enumerate(
        ((0.12, 0.12, 0.12), (0.45, 0.42, 0.36), (0.1, 0.18, 0.3), (0.4, 0.12, 0.08), (0.2, 0.3, 0.15)))]
    NEON = [C.holo('w7_neon_%d' % i, c1, c2, 10.0, 0.9, 3.0) for i, (c1, c2) in enumerate(
        (((1.0, 0.1, 0.5), (0.4, 0.1, 1.0)), ((0.1, 0.8, 1.0), (0.1, 0.3, 1.0)), ((1.0, 0.5, 0.1), (1.0, 0.2, 0.1))))]
    TWIN = [C.window_grid('w7_tower_%d' % i, lit=l, estr=1.6, cell=(2.4, 3.4), seed=i * 3.1) for i, l in enumerate(
        ((1.0, 0.78, 0.5), (0.6, 0.85, 1.0), (1.0, 0.5, 0.8)))]

    # ------------------------------------------------------------ 几何工具
    def rbox(B, x, y, z, sx, sy, sz, m, rz=0.0, rx=0.0, ry=0.0):
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y')
        B.box(-sx / 2, sx / 2, -sy / 2, sy / 2, -sz / 2, sz / 2, m, M)

    def beam(B, p0, p1, w, m):
        """两点之间的方截面杆件（斜撑、扶手）。"""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        M = Matrix.Translation((p0 + p1) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        B.box(-w / 2, w / 2, -w / 2, w / 2, -d.length / 2, d.length / 2, m, M)

    def sag(p0, p1, s, n=6):
        return [(p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n,
                 p0[2] + (p1[2] - p0[2]) * i / n - s * 4 * (i / n) * (1 - i / n)) for i in range(n + 1)]

    def corr(B, P, U, V, m, pitch=0.2, depth=0.03):
        P, U, V = Vector(P), Vector(U), Vector(V)
        n = U.cross(V).normalized()
        k = max(4, int(U.length / pitch * 4))
        pat = (0.0, 1.0, 1.0, 0.0)
        vs = []
        for i in range(k + 1):
            o = P + U * (i / k) + n * (depth * pat[i % 4])
            vs.append(tuple(o)); vs.append(tuple(o + V))
        B.poly(vs, [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(k)], m)

    def tarp(B, x0, x1, y0, y1, z0, z1, m, s=0.12, nx=5, ny=4):
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

    def disc(B, x, y, z, r, m, axis='y', n=12, t=0.04):
        R = Matrix.Rotation(math.pi / 2, 4, 'X') if axis == 'y' else Matrix.Rotation(math.pi / 2, 4, 'Y')
        B.cyl(0, 0, -t / 2, r, t, m, n, smooth=False, mat=Matrix.Translation((x, y, z)) @ R)

    def crate(B, x, y, z, sx, sy, sz, m):
        """货箱：箱体 + 上下两道略外凸的包边（木箱 / 周转箱都不是光方块）。"""
        B.boxc(x, y, z, sx, sy, sz, m)
        e = min(sx, sy, sz) * 0.08
        band = STEEL if m in CRATES[:1] else DARK
        for zz in (z, z + sz - e):
            B.boxc(x, y, zz, sx + 0.02, sy + 0.02, e, band)
        if m is CRATES[0]:
            B.boxc(x, y, z + sz * 0.45, sx + 0.015, sy + 0.015, e, band)

    spots = []       # (loc, tgt, energy, color, angle)
    points = []      # (loc, energy, color)

    # ============================================================ 中层甲板
    D = Batch('site_deck')
    # 甲板四块（中间开井口）
    for (x0, x1, y0, y1) in ((-DECK_X, -HOLE, DECK_Y0, DECK_Y1), (HOLE, DECK_X, DECK_Y0, DECK_Y1),
                             (-HOLE, HOLE, HOLE, DECK_Y1), (-HOLE, HOLE, DECK_Y0, -HOLE)):
        D.box(x0, x1, y0, y1, DZ - DT, DZ, DECKF)
    # 南沿剖面：主桁梁（上下弦 + 斜腹杆）+ 横梁
    for yb in (DECK_Y0 + 0.5, 6.0 + 1.2, 20.0, 32.0):
        for zc in (DZ - DT - 0.35, DZ - DT - 3.4):
            D.box(-DECK_X, DECK_X, yb - 0.35, yb + 0.35, zc, zc + 0.35, STEEL)
        n = 20
        for i in range(n):
            xa = -DECK_X + 2 * DECK_X * i / n; xb = -DECK_X + 2 * DECK_X * (i + 1) / n
            if abs((xa + xb) / 2) < HOLE + 0.5 and yb < 8:
                continue
            za, zb = (DZ - DT - 3.05, DZ - DT - 0.35) if i % 2 == 0 else (DZ - DT - 0.35, DZ - DT - 3.05)
            beam(D, (xa, yb, za), (xb, yb, zb), 0.22, STEEL)
    for xb in (-30, -20, -10, 10, 20, 30):
        D.box(xb - 0.3, xb + 0.3, DECK_Y0, DECK_Y1, DZ - DT - 1.6, DZ - DT, STEEL)
    # 甲板边缘护栏（南沿）+ 警示条
    D.box(-DECK_X, DECK_X, DECK_Y0, DECK_Y0 + 0.25, DZ, DZ + 0.12, HAZ)
    for i in range(35):
        x = -DECK_X + 1 + i * 2
        if abs(x) < HOLE + 0.3: continue
        D.box(x - 0.04, x + 0.04, DECK_Y0 + 0.08, DECK_Y0 + 0.16, DZ, DZ + 1.1, STEEL)
    D.box(-DECK_X, -HOLE - 0.2, DECK_Y0 + 0.06, DECK_Y0 + 0.18, DZ + 1.05, DZ + 1.12, STEEL)
    D.box(HOLE + 0.2, DECK_X, DECK_Y0 + 0.06, DECK_Y0 + 0.18, DZ + 1.05, DZ + 1.12, STEEL)
    # 地面标线：通道分隔线、停止线、井口警戒斜纹带
    for xl in (-6.0, -3.0, 0.0, 3.0, 6.0):
        D.box(xl - 0.06, xl + 0.06, 10.5, 26.0, DZ, DZ + 0.006, LANE)
    for yl in (13.8, 25.6):
        D.box(-6, 6, yl - 0.1, yl + 0.1, DZ, DZ + 0.006, WHITEP)
    for (x0, x1, y0, y1) in ((-HOLE - 1.2, HOLE + 1.2, HOLE, HOLE + 1.2), (-HOLE - 1.2, -HOLE, -HOLE, HOLE),
                             (HOLE, HOLE + 1.2, -HOLE, HOLE)):
        D.box(x0, x1, y0, y1, DZ, DZ + 0.008, HAZ)

    # ============================================================ 井筒
    S = Batch('props_shaft')
    TOP = DZ + 0.0
    for sx in (-1, 1):
        for sy in (-1, 1):
            S.boxc(sx * SH, sy * SH, 0, 1.2, 1.2, TOP - DT, CONC)
            S.boxc(sx * SH, sy * SH, 0, 2.0, 2.0, 0.6, CONC)   # 柱脚
    rings = list(range(8, 57, 8))
    for z in rings:
        for s in (-1, 1):
            S.box(-SH, SH, s * SH - 0.4, s * SH + 0.4, z - 0.7, z, CONC)
            S.box(s * SH - 0.4, s * SH + 0.4, -SH, SH, z - 0.7, z, CONC)
    # 东 / 北面 X 形钢斜撑；西面半截瓦楞围板（有缺口）；南面敞开（只有环梁）
    zs = [0.6] + rings + [TOP - DT]
    for za, zb in zip(zs[:-1], zs[1:]):
        for (a, b_) in (((SH, -SH + 0.6), (SH, SH - 0.6)), ((-SH + 0.6, SH), (SH - 0.6, SH))):
            beam(S, (a[0], a[1], za + 0.1), (b_[0], b_[1], zb - 0.8), 0.18, STEEL)
            beam(S, (b_[0], b_[1], za + 0.1), (a[0], a[1], zb - 0.8), 0.18, STEEL)
        for k in range(5):
            if rnd.random() < 0.3: continue
            y0 = -SH + 0.6 + k * 2.16
            corr(S, (-SH - 0.35, y0 + 2.16, za), (0, -2.16, 0), (0, 0, zb - za - 0.7), SHEET_R if rnd.random() < 0.5 else SHEET, 0.25, 0.04)
    # 竖向管道（沿西北角）+ 管卡
    for (px, py, r, m) in ((-SH + 1.1, SH - 0.9, 0.3, RUST), (-SH + 1.9, SH - 0.8, 0.18, STEEL), (-SH + 0.9, SH - 1.9, 0.14, PAINT)):
        S.cyl(px, py, 0, r, TOP - DT, m, 10)
        for z in range(3, int(TOP) - 2, 4):
            S.cyl(px, py, z, r + 0.05, 0.12, STEEL, 10)
    # 折返楼梯（东半边）：跑 A x 1.4..3.3 朝 +y，跑 B x 3.5..5.4 朝 -y，每跑 4 m 高、20 步
    FL = 4.0; NS = 20; Y0, Y1 = -3.6, 3.6
    run = (Y1 - Y0) / NS
    for k in range(int((TOP - DT) // FL)):
        z0 = k * FL
        up = k % 2 == 0
        xa, xb = (1.4, 3.3) if up else (3.5, 5.4)
        for i in range(NS):
            y = Y0 + i * run if up else Y1 - (i + 1) * run
            zt = z0 + (i + 1) * FL / NS
            S.box(xa, xb, y, y + run, zt - 0.06, zt, STEEL)
        # 斜梁 + 扶手
        ya, yb = (Y0, Y1) if up else (Y1, Y0)
        for xs in (xa, xb):
            beam(S, (xs, ya, z0 - 0.15), (xs, yb, z0 + FL - 0.15), 0.12, PAINT)
        xo = xb if up else xa
        S.tube([(xo, ya, z0 + 1.0), (xo, yb, z0 + FL + 1.0)], 0.03, HAZ, n=6)
        for t in (0.25, 0.5, 0.75):
            yy = ya + (yb - ya) * t
            S.box(xo - 0.025, xo + 0.025, yy - 0.025, yy + 0.025, z0 + FL * t, z0 + FL * t + 1.0, STEEL)
        # 平台
        yl = (Y1, Y1 + 1.6) if up else (Y0 - 1.6, Y0)
        S.box(1.4, 5.4, yl[0], yl[1], z0 + FL - 0.1, z0 + FL, STEEL)
        S.box(1.4, 5.4, yl[0], yl[1], z0 + FL - 0.25, z0 + FL - 0.1, PAINT)
        # 每层平台一盏冷光壁灯
        if k % 2 == 1:
            S.boxc(5.35, 0.0, z0 + 2.6, 0.12, 0.5, 0.15, COLDL)
            points.append(((5.0, 0.0, z0 + 2.5), 60, (0.75, 0.88, 1.0)))
    # 井底基座 + 集水坑边
    S.box(-SH - 1, SH + 1, -SH - 1, SH + 1, 0, 0.25, CONC)
    S.box(-SH + 0.5, 0.5, -SH + 0.5, SH - 0.5, 0.25, 0.3, HAZ)
    # 井口临时吊架（矮门式钢架 + 天轮 + 小机箱；不做永久井塔）
    HT = DZ + 5.0
    for (lx, ly) in ((-5.2, -2.8), (-5.2, 2.8), (-0.2, -2.8), (-0.2, 2.8)):
        S.boxc(lx, ly, DZ, 0.3, 0.3, HT - DZ, NAVY)
        S.boxc(lx, ly, DZ, 0.7, 0.7, 0.12, STEEL)
    for (a, b_) in (((-5.2, -2.8), (-0.2, -2.8)), ((-5.2, 2.8), (-0.2, 2.8)), ((-5.2, -2.8), (-5.2, 2.8)), ((-0.2, -2.8), (-0.2, 2.8))):
        beam(S, (a[0], a[1], HT), (b_[0], b_[1], HT), 0.32, HAZ)
    for sx in (-3.2, -2.2):
        disc(S, sx, 0.0, HT + 0.45, 0.45, STEEL, n=16, t=0.1)
    S.box(-3.6, -1.8, -0.6, 0.6, HT + 0.15, HT + 0.2, STEEL)
    S.box(0.1, 1.3, -1.0, 1.0, DZ, DZ + 1.6, SHEET)      # 绞车机箱（落地）
    S.boxc(0.7, -1.02, DZ + 1.3, 0.2, 0.04, 0.12, GREEN)
    # 井口护栏（东、西、南三边），北边是进出闸
    for (x0, x1, y0, y1) in ((-HOLE, HOLE, -HOLE - 0.1, -HOLE), (-HOLE - 0.1, -HOLE, -HOLE, HOLE), (HOLE, HOLE + 0.1, -HOLE, HOLE)):
        S.box(x0, x1, y0, y1, DZ, DZ + 1.15, STEEL) if False else None
        L = max(x1 - x0, y1 - y0)
        for i in range(int(L / 1.2) + 1):
            t = i / int(L / 1.2)
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            S.box(px - 0.04, px + 0.04, py - 0.04, py + 0.04, DZ, DZ + 1.1, STEEL)
        S.box(x0, x1, y0, y1, DZ + 1.05, DZ + 1.15, HAZ)
        S.box(x0, x1, y0, y1, DZ + 0.5, DZ + 0.56, STEEL)
    # 甲板下沿的井口圈梁
    S.box(-HOLE - 0.4, HOLE + 0.4, -HOLE - 0.4, -HOLE, DZ - DT - 2.0, DZ - DT, CONC)

    # ============================================================ 升降梯
    Lf = Batch('props_lift')
    LX0, LX1, LY0, LY1 = -4.8, -0.6, -2.2, 2.2
    CZ = 30.0
    for y in (LY0 - 0.25, LY1 + 0.25):
        Lf.box(-2.8, -2.6, y - 0.08, y + 0.08, 0, HT, STEEL)       # 导轨
        for z in range(4, int(DZ), 4):
            Lf.box(-2.8, -2.6, y - 0.08 if y < 0 else y, (y + 0.08 if y > 0 else y) + (0.0 if y > 0 else 0.0), z, z + 0.1, STEEL)
    Lf.box(-5.4, -5.2, -0.9, -0.7, 0, HT, STEEL); Lf.box(-5.4, -5.2, 0.7, 0.9, 0, HT, STEEL)
    Lf.box(-5.45, -5.05, -0.6, 0.6, 38.0, 42.0, PAINT)               # 对重
    # 轿厢：底板、顶盖、角柱、下半实心板、上半玻璃、南北两侧对开门
    Lf.box(LX0, LX1, LY0, LY1, CZ - 0.25, CZ, STEEL)
    Lf.box(LX0, LX1, LY0, LY1, CZ + 3.0, CZ + 3.25, PAINT)
    Lf.box(LX0 - 0.05, LX1 + 0.05, LY0 - 0.05, LY1 + 0.05, CZ - 0.4, CZ - 0.25, HAZ)
    for x in (LX0, LX1):
        for y in (LY0, LY1):
            Lf.boxc(x, y, CZ, 0.16, 0.16, 3.0, NAVY)
    for x in (LX0, LX1):
        Lf.box(x - 0.04, x + 0.04, LY0, LY1, CZ, CZ + 1.1, PAINT)
        Lf.box(x - 0.02, x + 0.02, LY0, LY1, CZ + 1.1, CZ + 3.0, GLASS)
        Lf.box(x - 0.05, x + 0.05, LY0, LY1, CZ + 1.1, CZ + 1.18, STEEL)
    for y in (LY0, LY1):
        Lf.box(LX0, (LX0 + LX1) / 2 - 0.03, y - 0.04, y + 0.04, CZ, CZ + 2.6, SHEET)
        Lf.box((LX0 + LX1) / 2 + 0.03, LX1, y - 0.04, y + 0.04, CZ, CZ + 2.6, SHEET)
        Lf.box(LX0, LX1, y - 0.05, y + 0.05, CZ + 2.6, CZ + 3.0, NAVY)
        Lf.boxc((LX0 + LX1) / 2, y + (0.06 if y > 0 else -0.06), CZ + 2.75, 0.8, 0.02, 0.1, GREEN)
    Lf.box(LX0 + 0.2, LX1 - 0.2, -0.3, 0.3, CZ + 2.96, CZ + 3.0, COLDL)
    points.append(((-2.7, 0, CZ + 2.7), 120, (0.8, 0.9, 1.0)))
    beam(Lf, (-4.9, 0, CZ + 3.4), (-0.5, 0, CZ + 3.4), 0.3, NAVY)          # 上横梁
    for dx in (-0.25, 0.0, 0.25):
        Lf.tube([(-2.7 + dx, 0, CZ + 3.5), (-2.7 + dx, -0.6, HT + 0.4)], 0.025, CABLE, n=5)
    Lf.tube([(-5.25, 0, 42.0), (-5.25, -0.6, HT + 0.4)], 0.025, CABLE, n=5)
    # 井底 / 井口的层门框
    for (zz, y) in ((0.3, -SH), (DZ, SH)):
        Lf.box(-5.0, -4.6, y - 0.3, y + 0.3, zz, zz + 3.2, HAZ)
        Lf.box(-0.8, -0.4, y - 0.3, y + 0.3, zz, zz + 3.2, HAZ)
        Lf.box(-5.0, -0.4, y - 0.3, y + 0.3, zz + 3.2, zz + 3.6, NAVY)
        Lf.boxc(-2.7, y + (0.32 if y > 0 else -0.32), zz + 3.35, 0.5, 0.04, 0.18, AMBER)

    # ============================================================ 检查点（甲板上）
    K = Batch('props_checkpoint')
    Gt = Batch('props_gates')
    # 雨棚：6 根柱 + 桁梁 + 单坡瓦楞顶（北高南低），棚底灯带
    CY0, CY1, CX = 10.0, 26.0, 13.0
    for x in (-CX, 0.0, CX):
        for y in (CY0 + 0.5, CY1 - 0.5):
            K.boxc(x, y, DZ, 0.5, 0.5, 6.6 if y > 15 else 5.8, NAVY)
            K.boxc(x, y, DZ, 0.9, 0.9, 0.35, CONC)
    for x in (-CX, -6.5, 0.0, 6.5, CX):
        beam(K, (x, CY0 - 0.5, DZ + 5.8), (x, CY1 + 0.5, DZ + 6.6), 0.35, NAVY)
    for y in (CY0 + 0.5, CY1 - 0.5):
        zz = DZ + 5.8 + 0.8 * (y - CY0 + 0.5) / (CY1 - CY0 + 1.0)
        K.box(-CX - 0.8, CX + 0.8, y - 0.2, y + 0.2, zz - 0.5, zz, NAVY)
    corr(K, (-CX - 1.0, CY0 - 1.0, DZ + 6.0), (0, CY1 - CY0 + 2.0, 0.85), (2 * CX + 2.0, 0, 0), SHEET, 0.3, 0.06)
    corr(K, (CX + 1.0, CY0 - 1.0, DZ + 5.95), (0, CY1 - CY0 + 2.0, 0.85), (-2 * CX - 2.0, 0, 0), SHEET, 0.3, 0.06)
    K.box(-CX - 1.0, CX + 1.0, CY0 - 1.15, CY0 - 0.95, DZ + 5.6, DZ + 6.1, HAZ)   # 棚檐警示条
    for (y, m) in ((CY0 - 1.2, NEON[0]), (CY1 + 1.2, NEON[1])):
        K.box(-CX - 1.0, CX + 1.0, y - 0.05, y + 0.05, DZ + 5.35 + (0.9 if y > 20 else 0), DZ + 5.5 + (0.9 if y > 20 else 0), m)
    for x in (-CX - 1.1, CX + 1.1):
        K.box(x - 0.05, x + 0.05, CY0 - 1, CY1 + 1, DZ + 5.4, DZ + 5.55, NEON[2] if x < 0 else NEON[0])
    for x in (-4.5, -1.5, 1.5, 4.5):
        K.box(x - 0.08, x + 0.08, CY0 + 1, CY1 - 1, DZ + 5.72, DZ + 5.8, COLDL)
    for x in (-10.0, 10.0):
        K.box(x - 0.08, x + 0.08, CY0 + 1, CY1 - 1, DZ + 5.72, DZ + 5.8, COLDL)
    # 通道分隔：钢栏杆（底板 + 立柱 + 两道横杆）
    for xl in (-6.0, -3.0, 0.0, 3.0, 6.0):
        for y in (11.0, 13.0, 16.5, 18.2, 21.0, 23.0):
            Gt.boxc(xl, y, DZ, 0.08, 0.08, 1.05, STEEL)
        for zz in (0.5, 1.0):
            Gt.box(xl - 0.035, xl + 0.035, 11.0, 23.0, DZ + zz, DZ + zz + 0.07, STEEL)
        Gt.box(xl - 0.15, xl + 0.15, 11.0, 23.0, DZ, DZ + 0.05, PAINT)
    lanes = (-4.5, -1.5, 1.5, 4.5)
    for li, lx in enumerate(lanes):
        # 道闸（y 23.5）：机箱 + 横杆（红白条），第二条抬起
        Gt.boxc(lx - 1.25, 23.6, DZ, 0.4, 0.35, 1.05, NAVY)
        Gt.boxc(lx - 1.25, 23.6, DZ + 1.05, 0.28, 0.28, 0.06, AMBER if li != 1 else GREEN)
        if li == 1:
            beam(Gt, (lx - 1.25, 23.6, DZ + 1.0), (lx - 0.85, 23.6, DZ + 3.3), 0.08, HAZ_RW)
        else:
            Gt.box(lx - 1.1, lx + 1.35, 23.55, 23.65, DZ + 0.9, DZ + 1.0, HAZ_RW)
        # 三辊闸（y 19）：机柜 + 三根臂
        Gt.box(lx + 0.85, lx + 1.3, 18.6, 19.6, DZ, DZ + 1.0, STEEL)
        Gt.box(lx + 0.83, lx + 1.32, 18.58, 19.62, DZ + 1.0, DZ + 1.04, RUBBER)
        hub = Vector((lx + 0.8, 19.1, DZ + 0.85))
        for a in range(3):
            ang = a * math.tau / 3
            d = Vector((-math.cos(math.radians(35)), 0, 0)) * 0.6
            d = Matrix.Rotation(ang, 3, Vector((math.cos(math.radians(35)), 0, math.sin(math.radians(35))))) @ Vector((-0.55, 0, 0.35))
            Gt.tube([tuple(hub), tuple(hub + d)], 0.025, STEEL, n=6)
        Gt.boxc(lx + 1.07, 18.55, DZ + 0.8, 0.2, 0.04, 0.12, RED if li in (0, 3) else GREEN)
        # 安检门（y 15）：门框 + 内侧扫描光条 + 顶上信号灯
        for s in (-1, 1):
            Gt.boxc(lx + s * 0.85, 15.0, DZ, 0.26, 0.6, 2.4, PAINT)
            Gt.boxc(lx + s * 0.72, 15.0, DZ + 0.2, 0.02, 0.1, 2.0, SCANL)
        Gt.box(lx - 0.98, lx + 0.98, 14.7, 15.3, DZ + 2.4, DZ + 2.7, PAINT)
        Gt.boxc(lx - 0.3, 15.3, DZ + 2.45, 0.14, 0.05, 0.14, GREEN if li in (1, 2) else RED)
        Gt.boxc(lx + 0.3, 15.3, DZ + 2.45, 0.14, 0.05, 0.14, AMBER)
        # 安检门旁的芯片 / 标签读卡座（发光读头，无字）
        Gt.boxc(lx + 0.55, 15.7, DZ, 0.18, 0.18, 1.0, NAVY)
        rbox(Gt, lx + 0.55, 15.7, DZ + 1.05, 0.28, 0.24, 0.07, STEEL, rx=0.35)
        rbox(Gt, lx + 0.55, 15.66, DZ + 1.09, 0.18, 0.14, 0.02, SCANL, rx=0.35)
        Gt.boxc(lx + 0.55, 15.6, DZ + 0.85, 0.12, 0.02, 0.04, GREEN if li in (1, 2) else RED)
        # 身份芯片读卡立柱
        Gt.boxc(lx - 1.2, 16.2, DZ, 0.22, 0.22, 1.15, NAVY)
        rbox(Gt, lx - 1.2, 16.2, DZ + 1.2, 0.3, 0.26, 0.08, STEEL, rx=0.4)
        Gt.boxc(lx - 1.2, 16.08, DZ + 1.16, 0.18, 0.02, 0.05, SCANL)
    # 集装箱岗亭（20 尺箱改装，x -12.6..-10.2 × y 12..18.1，朝东开窗）：瓦楞箱壳、角件、切口窗、门
    BX0, BX1, BY0, BY1 = -12.6, -10.16, 12.0, 18.06
    BH = 2.6
    K.box(BX0, BX1, BY0, BY1, DZ + 0.15, DZ + 0.25, STEEL)
    for (x, y) in ((BX0, BY0), (BX1, BY0), (BX0, BY1), (BX1, BY1)):
        K.boxc(x + (0.08 if x == BX0 else -0.08), y + (0.08 if y == BY0 else -0.08), DZ, 0.3, 0.3, 0.3, CONC)   # 垫块
        K.boxc(x + (0.1 if x == BX0 else -0.1), y + (0.1 if y == BY0 else -0.1), DZ + 0.25, 0.2, 0.2, BH, CBOX)
    corr(K, (BX0, BY1, DZ + 0.25), (0, BY0 - BY1, 0), (0, 0, BH), CBOX, 0.28, 0.05)                  # 西墙
    corr(K, (BX0, BY0, DZ + 0.25), (BX1 - BX0, 0, 0), (0, 0, BH), CBOX, 0.28, 0.05)                  # 南墙
    corr(K, (BX1, BY1, DZ + 0.25), (BX0 - BX1, 0, 0), (0, 0, BH), CBOX, 0.28, 0.05)                  # 北墙
    # 东墙：切口窗 y 12.8..16.6、z +1.1..+2.2；门 y 16.9..17.8
    for (y0, y1, z0, z1) in ((BY0, 12.8, 0, BH), (12.8, 16.6, 0, 1.1), (12.8, 16.6, 2.2, BH), (16.6, 16.9, 0, BH), (17.8, BY1, 0, BH), (16.9, 17.8, 2.1, BH)):
        corr(K, (BX1, y0, DZ + 0.25 + z0), (0, y1 - y0, 0), (0, 0, z1 - z0), CBOX, 0.28, 0.05)
    K.box(BX1 - 0.02, BX1 + 0.1, 12.8, 16.6, DZ + 1.3, DZ + 1.36, STEEL)                            # 窗台（递物）
    K.box(BX1 - 0.02, BX1 + 0.02, 12.8, 16.6, DZ + 1.36, DZ + 2.45, GLASS)
    for y in (12.8, 14.7, 16.6):
        K.box(BX1 - 0.03, BX1 + 0.06, y - 0.05, y + 0.05, DZ + 1.35, DZ + 2.45, NAVY)
    K.box(BX1 + 0.03, BX1 + 0.08, 16.95, 17.75, DZ + 0.25, DZ + 2.3, SHEET)                         # 门
    K.box(BX0, BX1, BY0, BY1, DZ + 0.25 + BH, DZ + 0.35 + BH, CBOX)
    K.box(BX1, BX1 + 1.0, 12.5, 17.0, DZ + 2.9, DZ + 2.97, SHEET)                                   # 窗上挑板
    K.box(BX1 - 0.9, BX1 - 0.1, 12.9, 16.5, DZ + 0.25, DZ + 1.3, PAINT)                             # 内桌
    for y in (13.6, 15.6):
        rbox(K, BX1 - 0.55, y, DZ + 1.62, 0.05, 0.8, 0.5, MONI, ry=0.2)
    K.box(BX0 + 0.4, BX1 - 0.4, BY0 + 0.6, BY1 - 0.6, DZ + 2.8, DZ + 2.84, COLDL)
    points.append(((BX0 + 1.2, 15.0, DZ + 2.5), 120, (0.8, 0.9, 1.0)))
    K.boxc((BX0 + BX1) / 2, BY0 + 0.3, DZ + 2.95, 0.35, 0.35, 0.25, RED)                            # 顶上旋转警示灯（纯色）
    K.boxc((BX0 + BX1) / 2, BY1 - 0.3, DZ + 2.95, 0.35, 0.35, 0.25, AMBER)
    K.box(BX0 - 0.3, BX0, 13.0, 13.8, DZ + 0.3, DZ + 1.3, NAVY)                                     # 外挂空调 / 发电
    K.tube(sag((BX0 - 0.1, 13.4, DZ + 0.6), (-16.0, 20.0, DZ + 0.05), 0.0, 4), 0.03, CABLE, n=5)
    # 货物征税查验点（岗亭北侧 x -17..-10.5 × y 19..24）：开箱查验长凳、台秤、单据桌 + 空白屏
    X = Batch('props_taxpoint')
    X.box(-15.8, -12.0, 19.6, 20.6, DZ + 0.86, DZ + 0.92, STEEL)
    for (x, y) in ((-15.7, 19.7), (-12.1, 19.7), (-15.7, 20.5), (-12.1, 20.5)):
        X.boxc(x, y, DZ, 0.07, 0.07, 0.86, STEEL)
    for i, x in enumerate((-15.1, -13.9, -12.7)):
        m = CRATES[i % 3]
        X.box(x - 0.45, x + 0.45, 19.75, 20.45, DZ + 0.92, DZ + 0.97, m)                           # 开箱：底 + 四壁
        for (x0, x1, y0, y1) in ((x - 0.45, x + 0.45, 19.75, 19.8), (x - 0.45, x + 0.45, 20.4, 20.45),
                                 (x - 0.45, x - 0.4, 19.75, 20.45), (x + 0.4, x + 0.45, 19.75, 20.45)):
            X.box(x0, x1, y0, y1, DZ + 0.92, DZ + 1.32, m)
        rbox(X, x, 20.62, DZ + 1.25, 0.9, 0.04, 0.5, m, rx=-1.1)                                   # 翻开的箱盖
        for _ in range(4):
            s = rnd.uniform(0.1, 0.2)
            X.boxc(x + rnd.uniform(-0.25, 0.25), 20.1 + rnd.uniform(-0.15, 0.15), DZ + 0.97, s, s * 0.8, s * 1.2, rnd.choice(PLAST))
    X.box(-15.6, -14.4, 21.6, 22.8, DZ, DZ + 0.12, STEEL)                                            # 地磅台秤
    X.box(-15.55, -14.45, 21.65, 22.75, DZ + 0.12, DZ + 0.13, RUBBER)
    X.box(-15.7, -15.6, 21.6, 21.7, DZ, DZ + 1.1, NAVY)
    X.box(-15.8, -15.5, 21.55, 21.75, DZ + 1.1, DZ + 1.35, NAVY)
    X.box(-15.81, -15.79, 21.58, 21.72, DZ + 1.15, DZ + 1.3, AMBER)
    crate(X, -15.0, 22.2, DZ + 0.13, 0.7, 0.6, 0.5, CRATES[0])
    X.box(-13.8, -12.0, 21.6, 22.6, DZ + 0.74, DZ + 0.78, PAINT)                                     # 单据桌
    for (x, y) in ((-13.75, 21.65), (-12.05, 21.65), (-13.75, 22.55), (-12.05, 22.55)):
        X.boxc(x, y, DZ, 0.05, 0.05, 0.74, STEEL)
    rbox(X, -12.9, 22.45, DZ + 1.05, 0.7, 0.04, 0.45, DARK, rx=0.2)
    rbox(X, -12.9, 22.42, DZ + 1.05, 0.62, 0.02, 0.38, MONI, rx=0.2)
    for j in range(3):
        rbox(X, -13.4 + j * 0.18, 21.9, DZ + 0.79 + j * 0.005, 0.21, 0.3, 0.004, PAPER, rz=0.1 * j)
    X.cyl(-12.9, 21.1, DZ, 0.2, 0.45, STEEL, 8); X.cyl(-12.9, 21.1, DZ + 0.45, 0.22, 0.05, RUBBER, 10)
    X.boxc(-14.0, 21.1, DZ + 2.4, 0.1, 3.4, 0.06, COLDL)
    X.box(-14.1, -13.9, 19.2, 19.4, DZ, DZ + 2.45, NAVY); X.box(-14.1, -13.9, 23.0, 23.2, DZ, DZ + 2.45, NAVY)
    X.box(-14.1, -13.9, 19.2, 23.2, DZ + 2.45, DZ + 2.55, NAVY)
    spots.append(((-14.0, 21.1, DZ + 2.3), (-14.0, 21.1, DZ), 400, (0.85, 0.92, 1.0), 110))
    # 标签扫描台（通道南端 y 8..9.2，x -5..-0.8）：短传送带 + 扫描拱 + 读头
    X.box(-5.0, -0.8, 8.2, 9.0, DZ + 0.78, DZ + 0.84, RUBBER)
    for x in (-4.9, -3.0, -0.9):
        for y in (8.25, 8.95):
            X.boxc(x, y, DZ, 0.08, 0.08, 0.78, STEEL)
    X.box(-5.0, -0.8, 8.15, 8.2, DZ + 0.7, DZ + 0.9, STEEL); X.box(-5.0, -0.8, 9.0, 9.05, DZ + 0.7, DZ + 0.9, STEEL)
    X.box(-3.2, -3.05, 8.1, 9.1, DZ + 0.84, DZ + 1.5, PAINT); X.box(-2.55, -2.4, 8.1, 9.1, DZ + 0.84, DZ + 1.5, PAINT)
    X.box(-3.2, -2.4, 8.1, 9.1, DZ + 1.5, DZ + 1.62, PAINT)
    X.box(-3.0, -2.6, 8.15, 9.05, DZ + 1.48, DZ + 1.5, SCANL)
    for x in (-4.4, -1.6):
        crate(X, x, 8.6, DZ + 0.84, 0.4, 0.35, 0.25, CRATES[1 + (x > -3)])
    # 货物查验台（x 7..13）：长传送带（辊子 + 带面）、透视查验通道（带软帘）、查验桌、托盘
    GX0, GX1 = 7.6, 9.2
    K.box(GX0, GX1, 11.0, 24.0, DZ + 0.75, DZ + 0.85, RUBBER)
    for y in (11.0, 24.0):
        pass
    K.box(GX0 - 0.08, GX0, 11.0, 24.0, DZ + 0.6, DZ + 0.95, STEEL)
    K.box(GX1, GX1 + 0.08, 11.0, 24.0, DZ + 0.6, DZ + 0.95, STEEL)
    for y in (11.3, 14.0, 17.0, 20.5, 23.7):
        for x in (GX0, GX1):
            K.boxc(x, y, DZ, 0.1, 0.1, 0.62, STEEL)
    K.box(GX0 - 0.4, GX1 + 0.4, 16.0, 19.0, DZ, DZ + 2.2, PAINT)                     # 透视通道外壳
    K.box(GX0 - 0.1, GX1 + 0.1, 15.95, 19.05, DZ + 0.85, DZ + 1.7, DARK)
    for i in range(8):
        x = GX0 + (i + 0.5) * (GX1 - GX0) / 8
        for y in (15.9, 19.1):
            K.box(x - 0.09, x + 0.09, y - 0.01, y + 0.01, DZ + 0.88, DZ + 1.68, RUBBER)
    K.boxc((GX0 + GX1) / 2, 17.5, DZ + 2.2, 0.5, 0.5, 0.18, AMBER)
    K.box(GX1 + 0.4, GX1 + 1.4, 17.2, 18.6, DZ + 0.9, DZ + 1.35, NAVY)                # 操作台
    rbox(K, GX1 + 1.0, 17.9, DZ + 1.65, 0.05, 0.8, 0.5, MONI, ry=-0.25)
    K.box(10.2, 12.8, 11.0, 15.0, DZ + 0.88, DZ + 0.95, STEEL)                        # 开箱查验桌
    for (x, y) in ((10.3, 11.1), (12.7, 11.1), (10.3, 14.9), (12.7, 14.9)):
        K.boxc(x, y, DZ, 0.08, 0.08, 0.88, STEEL)
    for i, (y, s) in enumerate(((12.0, 0.6), (13.4, 0.5), (21.0, 0.7), (22.6, 0.55))):
        K.boxc((GX0 + GX1) / 2, y, DZ + 0.85, s * 1.3, s, s * 0.8, CRATES[i % 4])
    K.boxc(11.2, 12.4, DZ + 0.95, 0.7, 0.5, 0.35, CRATES[1]); K.boxc(12.1, 13.8, DZ + 0.95, 0.5, 0.5, 0.4, CRATES[3])
    for (x, y) in ((11.8, 20.0), (12.0, 22.0), (11.6, 23.6)):                         # 待查托盘货
        K.boxc(x, y, DZ, 1.1, 1.1, 0.14, CRATES[0])
        for j in range(rnd.randint(2, 3)):
            crate(K, x + rnd.uniform(-0.1, 0.1), y + rnd.uniform(-0.1, 0.1), DZ + 0.14 + j * 0.45, 0.9, 0.9, 0.44, CRATES[rnd.randrange(4)])
    # 井口北侧进出闸：两根门柱 + 推拉栅门（横向条板）
    for x in (-HOLE, HOLE):
        K.boxc(x, HOLE + 0.4, DZ, 0.4, 0.4, 2.6, NAVY)
    for i in range(7):
        z = DZ + 0.15 + i * 0.32
        K.box(-HOLE + 0.2, -0.1, HOLE + 0.36, HOLE + 0.44, z, z + 0.08, STEEL)
    K.box(-HOLE, HOLE, HOLE + 0.2, HOLE + 0.6, DZ + 2.6, DZ + 2.9, NAVY)
    K.boxc(-2.0, HOLE + 0.62, DZ + 2.65, 0.4, 0.04, 0.2, AMBER)
    K.boxc(2.0, HOLE + 0.62, DZ + 2.65, 0.4, 0.04, 0.2, RED)
    # 防撞柱（北沿一排）
    for i in range(15):
        x = -14 + i * 2.0
        if abs(x) < 7:
            if i % 2: continue
        Gt.cyl(x, 28.0, DZ, 0.16, 1.0, STEEL, 12)
        Gt.cyl(x, 28.0, DZ + 0.7, 0.165, 0.12, HAZ, 12, smooth=False)
    # 临时管制：水马（梯形截面、红白）+ 可移动围挡（带脚座的框 + 细网格条）
    def jersey(x, y, rz, m):
        prof = [(-0.3, 0), (0.3, 0), (0.12, 0.35), (0.1, 0.8), (-0.1, 0.8), (-0.12, 0.35)]
        L = 1.8
        R = Matrix.Translation((x, y, DZ)) @ Matrix.Rotation(rz, 4, 'Z')
        vs = [(u, -L / 2, v) for (u, v) in prof] + [(u, L / 2, v) for (u, v) in prof]
        k = len(prof)
        fs = [tuple(range(k)), tuple(range(2 * k - 1, k - 1, -1))] + [(i, k + i, k + (i + 1) % k, (i + 1) % k) for i in range(k)]
        Gt.poly(vs, fs, m, R)
    for i in range(7):
        jersey(-8.5 + i * 1.85, 27.2, math.pi / 2, HAZ_RW if i % 2 else PLAST[3]) if abs(-8.5 + i * 1.85) > 5.5 else None
    for i in range(10):
        jersey(-19.0 + (i % 2) * 0.05, 9.0 + i * 1.85, 0.02 * (i % 3 - 1), HAZ_RW if i % 2 else PLAST[3])
    for i in range(6):
        jersey(16.0, 12.0 + i * 1.9, -0.03 * (i - 2), PLAST[3] if i % 2 else HAZ_RW)
    for i in range(5):
        y = 30.0; x0 = -12 + i * 2.6
        if 2 < i < 4: continue
        Gt.box(x0, x0 + 2.4, y - 0.02, y + 0.02, DZ + 0.15, DZ + 0.2, STEEL)
        Gt.box(x0, x0 + 2.4, y - 0.02, y + 0.02, DZ + 1.9, DZ + 1.95, STEEL)
        for j in range(9):
            xx = x0 + j * 0.3
            Gt.box(xx - 0.01, xx + 0.01, y - 0.01, y + 0.01, DZ + 0.15, DZ + 1.95, STEEL)
        for xx in (x0 + 0.1, x0 + 2.3):
            Gt.boxc(xx, y, DZ, 0.2, 0.7, 0.12, PLAST[0])
    # 移动照明灯塔（拖车式：底盘 + 两轮 + 牵引杆 + 四支腿 + 伸缩桅杆 + 灯排）
    Li = Batch('props_lights')
    for (x, y, rz) in ((-17.5, 8.0, 0.3), (17.5, 8.0, -0.3), (-18.0, 28.5, -0.2), (17.5, 29.0, 0.4)):
        R = Matrix.Translation((x, y, DZ)) @ Matrix.Rotation(rz, 4, 'Z')
        Li.box(-1.0, 1.0, -0.6, 0.6, 0.45, 1.3, PAINT, R)
        Li.box(-1.02, 1.02, -0.62, 0.62, 1.1, 1.14, HAZ, R)
        for s in (-1, 1):
            q = R @ Vector((0, s * 0.72, 0.32))
            Li.cyl(0, 0, -0.1, 0.32, 0.2, RUBBER, 12, smooth=False, mat=Matrix.Translation(q) @ R.to_3x3().to_4x4() @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        Li.box(1.0, 2.2, -0.05, 0.05, 0.4, 0.5, STEEL, R)
        for (u, v) in ((-0.9, -1.1), (-0.9, 1.1), (0.9, -1.1), (0.9, 1.1)):
            beam(Li, tuple(R @ Vector((u * 0.9, v * 0.5, 0.6))), tuple(R @ Vector((u, v, 0.05))), 0.08, STEEL)
            Li.boxc(*(R @ Vector((u, v, 0.0))).xy, DZ, 0.25, 0.25, 0.05, STEEL)
        Li.cyl(x, y, DZ + 1.3, 0.12, 4.0, STEEL, 8); Li.cyl(x, y, DZ + 5.3, 0.09, 3.5, STEEL, 8)
        tgt = Vector((x * 0.3, (y + 17) / 2, DZ))
        Li.box(x - 1.0, x + 1.0, y - 0.06, y + 0.06, DZ + 8.7, DZ + 8.82, NAVY)
        for dx in (-0.7, 0.0, 0.7):
            p = Vector((x + dx, y, DZ + 8.9))
            d = (tgt - p).normalized()
            Rr = Matrix.Translation(p) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
            Li.box(-0.25, 0.25, -0.18, 0.18, -0.22, 0.0, NAVY, Rr)
            Li.box(-0.21, 0.21, -0.14, 0.14, 0.0, 0.02, COLDL, Rr)
        spots.append(((x, y, DZ + 8.6), tuple(tgt), 7000, (0.9, 0.93, 1.0), 75))
    # 井口向下的投光（光从井口落下去）
    spots.append(((-0.5, -1.0, DZ + 4.6), (0.5, 0.0, 0.0), 60000, (0.85, 0.92, 1.0), 26))

    # ============================================================ 井底：地面 + 市场
    G = Batch('site_ground')
    G.box(-34, 34, -34, 30, -0.3, 0.0, GROUNDF)
    for (x, y, rx, ry) in ((-3.5, -10.0, 2.2, 1.2), (6.0, -13.0, 1.4, 0.9), (-12.0, 2.0, 1.8, 1.0), (3.0, -22.0, 2.5, 1.2),
                           (-1.5, 8.5, 1.5, 0.8)):
        G.cyl(x, y, 0.0, ry, 0.012, WET, 16, rx=rx, smooth=False)
    # 排水沟（沿市场主道）
    G.box(-0.4, 0.4, -34, -SH - 1, 0.0, 0.01, DARK)
    for i in range(30):
        y = -33.5 + i * 0.85
        if y > -SH - 1.2: break
        G.box(-0.38, 0.38, y, y + 0.06, 0.01, 0.02, RUST)
    Mk = Batch('props_market')
    Gd = Batch('props_goods')
    bulbs = []

    def stall(x, y, w, d, face, seed):
        """摊位：四根杆 + 下垂防水布棚 + 摊桌 + 货；face = 朝向（'n','s','e','w'）。"""
        r = random.Random(seed)
        x0, x1, y0, y1 = x - w / 2, x + w / 2, y - d / 2, y + d / 2
        hf, hb = 2.5, 2.9
        for (px, py) in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
            Mk.cyl(px, py, 0, 0.04, hb, STEEL, 6, smooth=False)
        m = TARPS[r.randrange(len(TARPS))]
        if face in 'ns':
            z0, z1 = (hf, hb) if face == 's' else (hb, hf)
            tarp(Mk, x0 - 0.2, x1 + 0.2, y0 - 0.4, y1 + 0.4, z0, z1, m, 0.1, 4, 3)
        else:
            z0, z1 = (hb, hf) if face == 'e' else (hf, hb)
            vs = [(x0 - 0.4, y0 - 0.2, z1 if face == 'w' else z0), (x1 + 0.4, y0 - 0.2, z1 if face == 'e' else z0),
                  (x1 + 0.4, y1 + 0.2, z1 if face == 'e' else z0), (x0 - 0.4, y1 + 0.2, z1 if face == 'w' else z0)]
            vs = [(vx, vy, (hf if ((face == 'e' and vx > x) or (face == 'w' and vx < x)) else hb)) for (vx, vy, _) in vs]
            Mk.poly(vs, [(0, 1, 2, 3), (3, 2, 1, 0)], m)
        # 桌
        if face in 'ns':
            ty0, ty1 = (y0, y0 + 0.8) if face == 's' else (y1 - 0.8, y1)
            Mk.box(x0 + 0.1, x1 - 0.1, ty0, ty1, 0.78, 0.84, CRATES[0])
            Mk.box(x0 + 0.1, x1 - 0.1, ty0 + 0.02, ty1 - 0.02, 0.0, 0.78, SHEET_R if r.random() < 0.5 else CRATES[3])
            gx0, gx1, gy0, gy1 = x0 + 0.2, x1 - 0.2, ty0 + 0.1, ty1 - 0.1
        else:
            tx0, tx1 = (x1 - 0.8, x1) if face == 'e' else (x0, x0 + 0.8)
            Mk.box(tx0, tx1, y0 + 0.1, y1 - 0.1, 0.78, 0.84, CRATES[0])
            Mk.box(tx0 + 0.02, tx1 - 0.02, y0 + 0.1, y1 - 0.1, 0.0, 0.78, SHEET_R if r.random() < 0.5 else CRATES[3])
            gx0, gx1, gy0, gy1 = tx0 + 0.1, tx1 - 0.1, y0 + 0.2, y1 - 0.2
        for _ in range(r.randint(6, 10)):
            s = r.uniform(0.12, 0.35)
            Gd.boxc(r.uniform(gx0, gx1), r.uniform(gy0, gy1), 0.84, s, s * r.uniform(0.6, 1.2), s * r.uniform(0.4, 1.0),
                    r.choice(PLAST + CRATES))
        # 桌后一叠箱
        for j in range(r.randint(2, 4)):
            s = r.uniform(0.45, 0.65)
            bx = r.uniform(x0 + 0.4, x1 - 0.4); by = r.uniform(y0 + 0.4, y1 - 0.4)
            crate(Gd, bx, by, 0, s, s, s * 0.8, r.choice(CRATES))
            if r.random() < 0.5:
                crate(Gd, bx + 0.05, by - 0.03, s * 0.8, s * 0.8, s * 0.8, s * 0.6, r.choice(CRATES))
        bulbs.append((x + r.uniform(-0.3, 0.3), y + r.uniform(-0.3, 0.3), hf - 0.25))

    # 南侧主道两旁：西排朝东、东排朝西；井筒西北两侧沿墙一排
    for i, y in enumerate((-9.5, -12.8, -16.1, -19.4, -22.7)):
        stall(-3.9, y, 2.6, 3.0, 'e', 10 + i)
        if y > -13.5 or y < -22.0:
            stall(3.9, y, 2.6, 3.0, 'w', 30 + i)
    for i, x in enumerate((-19.0, -15.6, -12.2)):
        stall(x, -3.0, 3.0, 2.6, 's', 50 + i)
        stall(x, 3.2, 3.0, 2.6, 'n', 60 + i)
    for i, y in enumerate((-2.0, 2.0)):
        stall(11.0, y, 2.6, 3.4, 'w', 70 + i)
    for (x, y, z) in bulbs:
        Li.tube([(x, y, z + 0.25), (x, y, z + 0.05)], 0.008, CABLE, n=4)
        Li.sphere(x, y, z, 0.06, WARML, seg=8, rings=5)
        points.append(((x, y, z - 0.1), 45, (1.0, 0.75, 0.48)))
    # 串灯 + 乱拉的电缆（从井筒柱到摊位杆）
    for (p0, p1, s) in (((-SH, -SH, 5.0), (-5.2, -24.0, 2.9), 0.8), ((SH, -SH, 4.6), (5.2, -18.0, 2.9), 0.7),
                        ((-SH, -SH, 3.4), (-20.5, -4.3, 2.9), 0.6), ((-SH, SH, 4.2), (-20.5, 4.5, 2.9), 0.6),
                        ((SH, -SH, 3.8), (12.3, -3.7, 2.9), 0.4), ((-SH, -SH, 6.0), (5.2, -12.0, 2.9), 1.2)):
        pts = sag(p0, p1, s, 10)
        Li.tube(pts, 0.018, CABLE, n=4)
        for q in pts[2:-1:2]:
            Li.sphere(q[0], q[1], q[2] - 0.08, 0.05, WARML if rnd.random() < 0.7 else SODL, seg=6, rings=4)
    for i in range(10):
        a, b_ = rnd.uniform(-SH, SH), rnd.uniform(-10, 10)
        Li.tube(sag((-SH - 0.6, a, rnd.uniform(3, 7)), (-SH - 0.6 - rnd.uniform(4, 12), b_, rnd.uniform(3, 6)), rnd.uniform(0.3, 1.2), 8),
                0.02, CABLE, n=4)
    # 地上走管 + 墙根管
    for (y, r, m) in ((9.2, 0.35, RUST), (9.9, 0.22, STEEL), (10.4, 0.18, PAINT)):
        Mk.tube([(-30, y, r + 0.25), (30, y, r + 0.25)], r, m, n=10)
        for x in range(-28, 30, 4):
            Mk.box(x - 0.1, x + 0.1, y - r, y + r, 0, 0.25, CONC)
    Mk.tube([(-SH + 1.1, SH - 0.9, 0.3), (-SH + 1.1, 9.2, 0.3)], 0.3, RUST, n=10)
    # 散落的货箱 / 油桶
    for _ in range(26):
        x, y = rnd.uniform(-24, 16), rnd.uniform(-26, 8)
        if -SH - 1.5 < x < SH + 1.5 and -SH - 1.5 < y < SH + 1.5: continue
        if -2.3 < x < 2.3: continue
        s = rnd.uniform(0.5, 1.0)
        if rnd.random() < 0.35:
            Gd.cyl(x, y, 0, 0.3, 0.9, rnd.choice([RUST, CRATES[1], PLAST[3]]), 12)
        else:
            crate(Gd, x, y, 0, s, s * 0.8, s * 0.8, rnd.choice(CRATES))
            if rnd.random() < 0.4:
                crate(Gd, x + 0.05, y, s * 0.8, s * 0.7, s * 0.6, s * 0.6, rnd.choice(CRATES))
    # 钠灯杆（市场主道）
    for (x, y) in ((-2.2, -14.5), (2.2, -24.0), (-8.0, 0.0)):
        Li.cyl(x, y, 0, 0.08, 5.5, NAVY, 8)
        Li.box(x - 0.05, x + 0.05 + (0.9 if x < 0 else -0.9) * 0 + 0.0, y - 0.05, y + 0.05, 5.4, 5.5, STEEL)
        Li.boxc(x, y, 5.25, 0.5, 0.25, 0.15, SODL)
        spots.append(((x, y, 5.1), (x, y, 0), 900, (1.0, 0.55, 0.2), 110))

    # ============================================================ 老 K 杂货店（x 9..16、y -21..-14，门面朝西 x = 9）
    Sp = Batch('props_shop')
    SX0, SX1, SY0, SY1, SHH = 9.0, 16.0, -21.0, -14.0, 3.6
    Sp.box(SX0 + 0.1, SX1, SY0, SY1, 0, SHH, SHEET_R)          # 实体（后面 / 侧面）
    corr(Sp, (SX1, SY0 - 0.04, 0), (SX0 - SX1 + 0.1, 0, 0), (0, 0, SHH), SHEET, 0.22, 0.04)
    corr(Sp, (SX0 + 0.1, SY1 + 0.04, 0), (SX1 - SX0 - 0.1, 0, 0), (0, 0, SHH), SHEET_R, 0.22, 0.04)
    Sp.box(SX0 - 0.1, SX1 + 0.3, SY0 - 0.3, SY1 + 0.3, SHH, SHH + 0.3, PAINT)
    # 门面：窗台墙 + 大玻璃窗 + 门洞 + 半卷的卷帘门 + 空白灯箱招牌 + 雨篷
    Sp.box(SX0, SX0 + 0.2, SY0, SY1, 0, 0.9, PAINT)
    Sp.box(SX0 - 0.02, SX0 + 0.01, SY0 + 0.2, -16.2, 0.9, 2.6, GLASS)
    Sp.box(SX0 - 0.05, SX0 + 0.05, -15.9, SY1 - 0.2, 0.0, 2.6, DARK)

    for y in (SY0 + 0.2, -18.5, -16.2, -15.9, SY1 - 0.2):
        Sp.box(SX0 - 0.08, SX0 + 0.08, y - 0.05, y + 0.05, 0.0, 2.7, NAVY)
    Sp.box(SX0 - 0.08, SX0 + 0.08, SY0, SY1, 2.6, 2.75, NAVY)
    corr(Sp, (SX0 - 0.15, SY0 + 0.2, 2.1), (0, -16.2 - SY0 - 0.2, 0), (0, 0, 0.55), SHEET, 0.08, 0.02)   # 卷帘半落
    Sp.box(SX0 - 0.35, SX0 - 0.15, SY0 + 0.2, -16.2, 2.65, 2.9, PAINT)   # 卷帘箱
    Sp.box(SX0 - 0.35, SX0 - 0.15, -15.9, SY1 - 0.2, 2.65, 2.9, PAINT)
    Sp.box(SX0 - 0.35, SX0 - 0.15, SY0 + 0.3, SY1 - 0.3, 2.95, 3.55, NAVY)   # 招牌框
    Sp.box(SX0 - 0.4, SX0 - 0.34, SY0 + 0.45, SY1 - 0.45, 3.05, 3.45, SIGNW)   # 空白灯箱面
    # 雨篷（瓦楞，斜挑）
    corr(Sp, (SX0 - 0.3, SY1 + 0.3, 2.85), (0, SY0 - SY1 - 0.6, 0), (-1.4, 0, -0.35), SHEET_R, 0.22, 0.04)
    for y in (SY0 - 0.2, SY1 + 0.2):
        beam(Sp, (SX0 - 0.3, y, 2.85), (SX0 - 1.65, y, 2.5), 0.06, STEEL)
    # 店内：货架（从玻璃里透出剪影）+ 收银台
    for x in (11.0, 13.0):
        Sp.box(x, x + 0.4, SY0 + 0.6, SY1 - 0.6, 0.0, 2.1, STEEL)
    for x in (11.0, 13.0):
        for zz in (0.45, 1.0, 1.55, 2.05):
            Sp.box(x - 0.05, x + 0.45, SY0 + 0.6, SY1 - 0.6, zz, zz + 0.03, STEEL)
            yy = SY0 + 0.7
            while yy < SY1 - 0.8:
                w_ = rnd.uniform(0.12, 0.3); h_ = rnd.uniform(0.15, 0.4)
                Sp.box(x + 0.02, x + 0.38, yy, yy + w_, zz + 0.03, zz + 0.03 + min(h_, 0.5), rnd.choice(PLAST + CRATES[1:]))
                yy += w_ + rnd.uniform(0.02, 0.1)
    for zz in (0.5, 1.1, 1.7):                                            # 门边墙上货架（从门口能看到）
        Sp.box(9.3, 9.75, -20.6, -18.6, zz, zz + 0.03, STEEL)
        for k in range(6):
            Sp.boxc(9.5, -20.4 + k * 0.33, zz + 0.03, 0.3, 0.25, rnd.uniform(0.15, 0.35), rnd.choice(PLAST))
    # 收银柜台 + 读卡槽（只有一小条绿光）
    Sp.box(9.4, 10.4, -15.8, -14.3, 0.0, 1.0, NAVY)
    Sp.box(9.35, 10.45, -15.85, -14.25, 1.0, 1.05, CRATES[0])
    Sp.box(9.6, 9.9, -15.2, -14.9, 1.05, 1.2, DARK)
    Sp.box(9.58, 9.6, -15.15, -14.95, 1.12, 1.14, GREEN)
    # 门外柜台延伸：卖货窗口小台 + 纸箱
    Sp.box(SX0 - 0.6, SX0, -18.4, -16.4, 0.95, 1.0, STEEL)
    for k in range(5):
        Sp.boxc(SX0 - 0.3, -18.2 + k * 0.4, 1.0, 0.28, 0.3, rnd.uniform(0.12, 0.3), rnd.choice(PLAST))
    points.append(((12.0, -17.5, 3.0), 260, (1.0, 0.75, 0.48)))
    points.append(((10.2, -18.0, 2.9), 90, (1.0, 0.8, 0.55)))
    # 门口：一台小冰柜、几只周转箱
    Sp.box(SX0 - 1.0, SX0 - 0.2, -20.8, -19.9, 0, 1.0, PLAST[1])
    Sp.box(SX0 - 0.98, SX0 - 0.22, -20.78, -19.92, 1.0, 1.03, GLASS)
    for j in range(3):
        Sp.boxc(SX0 - 0.6, -18.8 + j * 0.05, j * 0.3, 0.55, 0.4, 0.3, PLAST[2 + j % 3])
    spots.append(((SX0 - 0.8, -17.5, 2.7), (SX0 - 1.8, -17.5, 0), 250, (1.0, 0.8, 0.55), 120))

    # ============================================================ 终端角（x -11..-7、y -11..-8，朝南）
    T = Batch('props_terminal')
    NX0, NX1, NY0, NY1 = -11.2, -7.4, -10.6, -8.0
    T.box(NX0, NX1, NY1 - 0.1, NY1, 0, 3.0, SHEET_R)                 # 背板
    for x in (NX0, NX1 - 0.1):
        corr(T, (x, NY1, 0), (0, NY0 - NY1, 0), (0, 0, 3.0), SHEET if x < -9 else SHEET_R, 0.22, 0.03) if x < -9 else \
            corr(T, (x + 0.1, NY0, 0), (0, NY1 - NY0, 0), (0, 0, 3.0), SHEET_R, 0.22, 0.03)
    corr(T, (NX0 - 0.2, NY1 + 0.1, 3.1), (NX1 - NX0 + 0.4, 0, 0), (0, NY0 - NY1 - 0.6, -0.35), SHEET, 0.22, 0.04)
    # 终端机：落地柜 + 斜屏 + 键盘块 + 侧边读卡槽
    tx, ty = -9.3, -8.55
    T.box(tx - 0.45, tx + 0.45, ty - 0.35, ty + 0.35, 0, 1.05, NAVY)
    T.box(tx - 0.47, tx + 0.47, ty - 0.37, ty + 0.37, 0.95, 1.0, RUST)
    Rs = Matrix.Translation((tx, ty - 0.05, 1.6)) @ Matrix.Rotation(-0.25, 4, 'X')
    T.box(-0.7, 0.7, -0.1, 0.1, -0.5, 0.5, PAINT, Rs)
    T.box(-0.62, 0.62, -0.12, -0.1, -0.42, 0.42, SCREEN, Rs)
    Rk = Matrix.Translation((tx, ty - 0.45, 1.05)) @ Matrix.Rotation(0.3, 4, 'X')
    T.box(-0.35, 0.35, -0.14, 0.14, -0.03, 0.03, RUBBER, Rk)
    T.box(tx + 0.46, tx + 0.52, ty - 0.2, ty - 0.05, 0.7, 0.85, AMBER)
    T.box(tx - 0.2, tx + 0.2, ty - 0.37, ty - 0.35, 0.3, 0.6, STEEL)          # 检修盖板
    for dx in (-0.1, 0.05, 0.2):                                              # 从柜子后面垂下的线
        T.tube([(tx + dx, ty + 0.35, 0.8), (tx + dx + 0.1, NY1 - 0.2, 0.3), (tx + dx + 0.3, NY1 - 0.15, 2.6)], 0.02, CABLE, n=4)
    T.cyl(-10.4, -9.4, 0, 0.18, 0.55, STEEL, 8)                               # 凳
    T.cyl(-10.4, -9.4, 0.55, 0.22, 0.06, RUBBER, 12)
    T.boxc(-8.0, -9.2, 0, 0.6, 0.5, 0.5, CRATES[1]); T.boxc(-8.0, -9.2, 0.5, 0.5, 0.4, 0.35, CRATES[3])
    T.box(NX0 + 0.3, NX1 - 0.3, NY1 - 0.4, NY1 - 0.12, 2.75, 2.8, COLDL)
    points.append(((tx, ty - 0.9, 1.6), 30, (0.2, 1.0, 0.45)))
    spots.append(((tx, ty - 0.4, 2.85), (tx, ty - 0.8, 0), 220, (0.6, 0.85, 1.0), 90))
    for k in range(7):                                                        # 从头顶管线垂下的一束线缆
        o_ = k * 0.06
        T.tube([(tx - 0.3 + o_, ty + 0.3, 1.9), (tx - 0.2 + o_, NY1 - 0.3, 2.4), (tx - 1.0 + o_, NY1 - 0.2, 3.3), (-6.2, NY1 + 0.5 + o_, 4.2)], 0.025, CABLE, n=4)
    T.boxc(-10.4, -9.4, 0.61, 0.5, 0.02, 0.02, HAZ)
    points.append(((-9.3, -9.3, 2.6), 25, (0.75, 0.88, 1.0)))

    # ============================================================ 背景（只渲染）
    Bg = Batch('bg_mid')
    # 两侧延伸的中层甲板 + 北侧
    Bg.box(-220, -DECK_X, DECK_Y0, 200, DZ - DT, DZ, DECKF); Bg.box(DECK_X, 220, DECK_Y0, 200, DZ - DT, DZ, DECKF)
    Bg.box(-DECK_X, DECK_X, DECK_Y1, 200, DZ - DT, DZ, DECKF)
    Bg.box(-220, 220, DECK_Y0, 200, DZ - DT - 3.5, DZ - DT - 3.2, STEEL)     # 中层底面吊顶板
    for x in range(-200, 201, 10):
        if abs(x) < 36: continue
        Bg.box(x - 0.3, x + 0.3, DECK_Y0, 200, DZ - DT - 3.2, DZ - DT, STEEL)
    for x in range(-200, 201, 25):
        Bg.box(x - 0.25, x + 0.25, DECK_Y0 - 0.1, DECK_Y0 + 0.1, DZ - DT - 3.0, DZ - DT - 2.8, COLDL)
    # 中层楼群（钢与霓虹）
    rb = random.Random(3)
    for i in range(46):
        x = rb.uniform(-160, 160); y = rb.uniform(46, 160)
        if abs(x) < 20 and y < 60: y += 20
        w, d, h = rb.uniform(10, 24), rb.uniform(10, 24), rb.uniform(20, 110)
        Bg.boxc(x, y, DZ, w, d, h, rb.choice(TWIN))
        if rb.random() < 0.6:
            Bg.box(x - w / 2 - 0.1, x + w / 2 + 0.1, y - d / 2 - 0.2, y - d / 2 - 0.1, DZ + rb.uniform(8, h - 4), DZ + h, rb.choice(NEON)) \
                if False else Bg.boxc(x + rb.uniform(-w / 3, w / 3), y - d / 2 - 0.15, DZ + rb.uniform(6, max(7, h - 20)),
                                      rb.uniform(1.0, 2.2), 0.2, rb.uniform(6, 16), rb.choice(NEON))
        if rb.random() < 0.5:
            Bg.box(x - w / 2, x + w / 2, y - d / 2 - 0.12, y - d / 2 - 0.02, DZ + h - 1.0, DZ + h - 0.6, rb.choice(NEON))
    for i in range(18):   # 两侧甲板上较近的楼（半截）
        s = -1 if i % 2 else 1
        x = s * rb.uniform(42, 120); y = rb.uniform(0, 40)
        w, d, h = rb.uniform(10, 20), rb.uniform(10, 18), rb.uniform(15, 60)
        Bg.boxc(x, y, DZ, w, d, h, rb.choice(TWIN))
        Bg.boxc(x, y - d / 2 - 0.15, DZ + rb.uniform(4, 8), w * 0.6, 0.2, 0.6, rb.choice(NEON))
    Bl = Batch('bg_lower')
    Bl.box(-300, 300, -300, 300, -0.5, -0.3, GROUNDF)
    for (x, y) in ((-44, 12), (44, 12), (-40, 30), (40, 30), (-80, 10), (80, 10), (0, 40)):
        Bl.boxc(x, y, 0, 6, 6, DZ - DT - 3.2, CONC)
        Bl.cyl(x + 3.4, y, 0, 0.45, DZ - 5, RUST, 10)
    rb2 = random.Random(9)
    for i in range(140):
        x, y = rb2.uniform(-120, 120), rb2.uniform(-90, 60)
        if (abs(x) < 30 and -30 < y < 30) or (y < -25 and abs(x) < 70): continue
        h = rb2.uniform(2.5, 8)
        sx_, sy_ = rb2.uniform(3, 7), rb2.uniform(3, 7)
        Bl.boxc(x, y, 0, sx_, sy_, h, rb2.choice([SHEET_R, RUST, DARK]))
        Bl.boxc(x, y, h, sx_ + 0.8, sy_ + 0.8, 0.12, SHEET_R)
        if rb2.random() < 0.3:
            Bl.boxc(x, y - 2.0, 1.2, 0.7, 0.2, 0.6, GLASSW)
    if A['cam'] != 'c1':   # 井底视角头顶的中层底面（c1 剖面视角里切掉）
        Bl.box(-220, 220, -200, DECK_Y0, DZ - DT - 3.5, DZ - DT - 3.2, STEEL)

    # ============================================================ r2：甲板结构带 / 井道围网 / 潮湿与管线 / 逼仄的井底
    # A1 甲板南沿深结构带：封边板、底面检修管三根、吊架、检修灯
    D.box(-DECK_X, DECK_X, DECK_Y0 - 0.15, DECK_Y0, DZ - DT - 0.9, DZ, PAINT)
    for (zz, r, m) in ((DZ - DT - 4.1, 0.35, RUST), (DZ - DT - 4.0, 0.22, PAINT), (DZ - DT - 3.9, 0.16, STEEL)):
        yy = DECK_Y0 + 1.4 + r * 3
        D.tube([(-DECK_X, yy, zz), (-HOLE - 1.0, yy, zz)], r, m, n=10)
        D.tube([(HOLE + 1.0, yy, zz), (DECK_X, yy, zz)], r, m, n=10)
    for x in range(-32, 33, 4):
        if abs(x) < HOLE + 1.5: continue
        D.box(x - 0.04, x + 0.04, DECK_Y0 + 1.2, DECK_Y0 + 1.3, DZ - DT - 4.5, DZ - DT - 3.4, STEEL)
        D.box(x - 0.05, x + 0.05, DECK_Y0 + 1.2, DECK_Y0 + 3.4, DZ - DT - 4.5, DZ - DT - 4.42, STEEL)
    for x in (-28, -18, 18, 28):
        D.box(x - 0.6, x + 0.6, DECK_Y0 + 0.3, DECK_Y0 + 0.5, DZ - DT - 3.6, DZ - DT - 3.5, COLDL)
        points.append(((x, DECK_Y0 + 0.4, DZ - DT - 3.8), 150, (0.78, 0.9, 1.0)))
    # A2 井道围网（升降梯所在的西半边，南 / 西两面）+ 井底层门栅
    WX0, WX1 = -5.4, -0.2
    for za, zb in zip(zs[:-1], zs[1:]):
        S.box(WX0, WX1, -SH + 0.36, -SH + 0.4, za + (3.8 if za < 1 else 0.0), zb - 0.7, MESH)
        S.box(-SH + 0.36, -SH + 0.4, -SH + 0.6, SH - 0.6, za + (3.8 if za < 1 else 0.0), zb - 0.7, MESH)
        for x in (WX0, (WX0 + WX1) / 2, WX1):
            S.box(x - 0.04, x + 0.04, -SH + 0.34, -SH + 0.42, za, zb - 0.7, STEEL)
    for i in range(14):                                                    # 井底层门：竖条推拉栅
        x = -4.55 + i * 0.28
        if x > -0.8: break
        S.box(x - 0.025, x + 0.025, -SH - 0.5, -SH - 0.45, 0.3, 3.3, STEEL)
    for zz in (0.35, 1.8, 3.25):
        S.box(-4.6, -0.8, -SH - 0.52, -SH - 0.43, zz, zz + 0.07, HAZ)
    # A3 井柱 / 支撑柱：湿痕、线槽、托架管、滴水
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * SH, sy * SH
            for k in range(3):
                off = (k - 1) * 0.3
                h0 = rnd.uniform(8, 50)
                S.box(cx - 0.61 if sx < 0 else cx + 0.6, cx - 0.6 if sx < 0 else cx + 0.61, cy + off - 0.08, cy + off + 0.08,
                      rnd.uniform(0.3, 4), h0, WETW)
                S.box(cx + off - 0.07, cx + off + 0.07, cy - 0.61 if sy < 0 else cy + 0.6, cy - 0.6 if sy < 0 else cy + 0.61,
                      rnd.uniform(0.3, 4), rnd.uniform(8, 50), WETW)
            xo = cx + (0.72 if sx > 0 else -0.72)
            S.box(xo - 0.05, xo + 0.05, cy - 0.15, cy - 0.05, 0.4, TOP - DT - 1, STEEL)            # 线槽
            S.cyl(xo + 0.05 * sx, cy + 0.3, 0.4, 0.09, TOP - DT - 1.4, PAINT, 8)                  # 托架管
            for z in range(3, int(TOP) - 4, 3):
                S.box(cx + 0.6 * sx - 0.02, xo + 0.15 * sx + 0.02, cy + 0.25, cy + 0.35, z, z + 0.08, STEEL) if sx > 0 else \
                    S.box(xo - 0.17, cx - 0.58, cy + 0.25, cy + 0.35, z, z + 0.08, STEEL)
    for i in range(40):                                                      # 滴水（细亮线）
        x, y = rnd.choice(((-SH, -SH - 0.7), (SH, -SH - 0.7), (-SH - 0.7, 0), (rnd.uniform(-20, 20), DECK_Y0 + 2.0)))
        x += rnd.uniform(-0.4, 0.4)
        z = rnd.uniform(1.0, 12.0) if abs(y) < 10 else rnd.uniform(5, 50)
        S.box(x - 0.006, x + 0.006, y - 0.006, y + 0.006, z, z + rnd.uniform(0.1, 0.3), DRIP)
    for (px, py) in ((-44, 12), (44, 12), (-40, 30), (40, 30)):
        for k in range(4):
            Bl.box(px - 3.02, px - 3.0, py - 2 + k, py - 1.8 + k, rnd.uniform(0, 5), rnd.uniform(20, 55), WETW)
        Bl.tube([(px + 3.0, py - 3.1, 0.0), (px + 3.0, py - 3.1, 55.0)], 0.2, STEEL, n=8)
    # B5 逼仄：市场三面是两三层叠起来的铁皮棚屋墙（出口只剩南面主道），头顶走满管子
    Wl = Batch('props_walls')
    def shackwall(x0, x1, y0, y1, face, seed):
        r = random.Random(seed)
        along_x = (x1 - x0) > (y1 - y0)
        L0, L1 = (x0, x1) if along_x else (y0, y1)
        t = L0
        while t < L1 - 0.5:
            w_ = min(r.uniform(2.2, 4.0), L1 - t)
            z = 0.0
            for lev in range(r.randint(2, 3)):
                h = r.uniform(2.3, 3.0)
                m = r.choice([SHEET_R, SHEET, SHEET_R, CBOX])
                if along_x:
                    Wl.box(t, t + w_, y0, y1, z, z + h, m)
                    if r.random() < 0.5:
                        yy = y1 + 0.02 if face == 'n' else y0 - 0.02
                        Wl.box(t + w_ * 0.3, t + w_ * 0.6, yy - 0.02, yy + 0.02, z + 1.0, z + 1.8, GLASSW if r.random() < 0.6 else DARK)
                else:
                    Wl.box(x0, x1, t, t + w_, z, z + h, m)
                    if r.random() < 0.5:
                        xx = x1 + 0.02 if face == 'e' else x0 - 0.02
                        Wl.box(xx - 0.02, xx + 0.02, t + w_ * 0.3, t + w_ * 0.6, z + 1.0, z + 1.8, GLASSW if r.random() < 0.6 else DARK)
                z += h
            t += w_ + r.uniform(0.0, 0.3)
    shackwall(-24.0, -21.0, -27.0, 12.0, 'e', 1)
    shackwall(17.5, 21.0, -27.0, 12.0, 'w', 2)
    shackwall(-21.0, 17.5, 11.2, 14.0, 's', 3)
    shackwall(-21.0, -6.0, -30.0, -27.0, 'n', 4)
    shackwall(6.0, 17.5, -30.0, -27.0, 'n', 5)
    for k in range(6):                                                        # 头顶走管（带吊架）
        y = -26 + k * 6.0 + rnd.uniform(-0.5, 0.5)
        z = rnd.uniform(4.2, 7.5); r = rnd.uniform(0.08, 0.3)
        xa, xb = -21.0, 17.5
        if -SH - 1 < y < SH + 1:
            Wl.tube([(xa, y, z), (-SH - 1, y, z)], r, rnd.choice([RUST, STEEL, PAINT]), n=8)
            Wl.tube([(SH + 1, y, z), (xb, y, z)], r, rnd.choice([RUST, STEEL, PAINT]), n=8)
        else:
            Wl.tube([(xa, y, z), (xb, y, z)], r, rnd.choice([RUST, STEEL, PAINT]), n=8)
        for x in range(-19, 17, 5):
            if -SH - 1 < y < SH + 1 and abs(x) < SH + 1: continue
            Wl.box(x - 0.03, x + 0.03, y - 0.03, y + 0.03, z + r, z + r + 1.5, STEEL)
            Wl.box(x - 0.03, x + 0.03, y - r - 0.05, y + r + 0.05, z - r - 0.05, z - r, STEEL)
    for k in range(3):
        x = -17 + k * 16 + rnd.uniform(-1, 1)
        Wl.tube([(x, -27, rnd.uniform(3.5, 5)), (x + rnd.uniform(-2, 2), 11.2, rnd.uniform(3.5, 5))], rnd.uniform(0.1, 0.2), RUST, n=8)
    # A4 c2 远墙：井口南面的中层楼墙（c1 剖面视角不建）
    if A['cam'] != 'c1':
        Bg.box(-60, 60, -30, -22, DZ, DZ + 40, TWIN[1])
        Bg.box(-60, 60, -22.1, -21.98, DZ + 6.0, DZ + 6.3, NEON[0])
        Bg.box(-60, 60, -22.1, -21.98, DZ + 14.0, DZ + 14.2, NEON[1])
        for x in range(-56, 57, 8):
            Bg.box(x - 0.4, x + 0.4, -22.4, -22.0, DZ, DZ + 40, STEEL)
        Bg.box(-60, 60, -22.5, -8.0, DZ - DT, DZ, DECKF)
        for x in (-7.0, 7.0):
            Bg.box(x - 0.2, x + 0.2, -8.0, -7.6, DZ, DZ + 1.1, STEEL)

    Batch.build_all()

    # ------------------------------------------------------------ 世界 + 雾 + 灯光
    w = bpy.data.worlds.new('w'); sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs[0].default_value = (0.03, 0.035, 0.055, 1); bg.inputs[1].default_value = 0.5
    nt.links.new(bg.outputs[0], out.inputs[0])
    vs = nt.nodes.new('ShaderNodeVolumePrincipled')
    vs.inputs['Color'].default_value = (0.6, 0.62, 0.66, 1)
    vs.inputs['Density'].default_value = 0.006
    nt.links.new(vs.outputs[0], out.inputs['Volume'])
    sc.cycles.volume_bounces = 0
    sc.cycles.volume_step_rate = 4.0
    # 中层夜空的城市反光（上方冷紫面光）+ 下层中层底面的检修灯（冷蓝面光）
    for (loc, e, sz, c) in (((0, 60, DZ + 60), 20000, 150, (0.55, 0.5, 0.8)),
                            ((-15, 5, DZ - DT - 6), 9000, 40, (0.6, 0.72, 1.0)), ((-2, -12, 9.0), 2500, 22, (1.0, 0.72, 0.45)), ((20, 10, DZ - DT - 6), 7000, 40, (0.6, 0.72, 1.0))):
        ld = bpy.data.lights.new('area_%d' % e, 'AREA'); ld.energy = e; ld.size = sz; ld.color = c
        o = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(o); o.location = loc
    for x in (-10.0, -4.5, -1.5, 1.5, 4.5, 10.0):
        ld = bpy.data.lights.new('canopy_%d' % x, 'AREA'); ld.energy = 45; ld.shape = 'RECTANGLE'; ld.size = 0.3; ld.size_y = 14
        ld.color = (0.8, 0.9, 1.0)
        o = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(o); o.location = (x, 18.0, DZ + 5.6)
    for (loc, e, sz, c) in (((-24, 18, DZ + 9), 3000, 14, (1.0, 0.15, 0.55)), ((24, 22, DZ + 9), 3000, 14, (0.15, 0.6, 1.0)),
                            ((0, 36, DZ + 12), 2500, 18, (0.7, 0.2, 1.0))):
        ld = bpy.data.lights.new('neon_%d' % loc[0], 'AREA'); ld.energy = e; ld.size = sz; ld.color = c
        o = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, 17, DZ)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.08)
    for i, (loc, tgt, e, c, ang) in enumerate(spots):
        C.spot_light('sp_%d' % i, loc, tgt, e, c, ang, 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.9

    CAMS = {
        'c1': ((-40.0, -56.0, 86.0), (0.0, 4.0, 32.0), 26, 0.0, 0.78),
        'c2': ((-2.9, 31.6, DZ + 1.65), (-0.6, 8.0, DZ + 2.4), 22, 0.0, 1.5),
        'c3': ((0.0, -26.0, 1.7), (3.0, -4.0, 3.5), 18, 0.0, 1.5),
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
