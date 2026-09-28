"""上层逐岛资产的共用工具（v16；docs/upper-islands-checklist.md）。
只放通用件：轮廓查表、材质、高度场、放样 / 锥 / 核心 / 晶簇 / 垂根等基元、瀑布、停靠平台、结界穹、出图与存档。
每座岛的形状逻辑（岛面怎么雕、岛底长什么样、种什么、建什么）写在 blender/islands/<id>.py 里，各岛各写各的。

每个岛文件提供：ID、NAME、underside(ctx) 和（做完岛面的）top(ctx)。运行（仓库根目录，经 tools/blender_run.sh）：
  blender -b --factory-startup --python blender/islands/<id>.py -- --res 1600 --samples 64 --out docs/drafts/x.png
  → <out>（斜视 35° 近景）、<out 去扩展名>_under.png（岛底仰视）、blender/islands/out/<id>.blend 与 .glb（岛资产，合成场景只链接这些）
"""
import math, os, random, sys
import bpy
from mathutils import Vector, Matrix, noise as MN

HERE = os.path.dirname(os.path.abspath(__file__)); BL = os.path.dirname(HERE)
for p in (BL, os.path.join(BL, 'landmarks'), HERE):
    if p not in sys.path: sys.path.insert(0, p)
import common as C  # noqa
C.Matrix = Matrix
A = C.args(dict(res='1600', samples='64', out='/tmp/isle.png', under='1', save='1', ures=''))
OUT = os.path.join(HERE, 'out')


def table(iid):
    import json
    return next(i for i in json.load(open(os.path.join(BL, 'data', 'tc_islands.json')))['islands'] if i['id'] == iid)


# ============================================================ 轮廓
class Shape:
    """岛轮廓（米，岛心原点，+x 东 +y 北）：取 tc_estates.Isle（与上层底图同一座岛）。norm：把最大半径缩放到 norm（灰模对比条）。"""
    def __init__(self, iid, norm=None, fn=None):
        import tc_estates as TE
        d = dict(table(iid)); d['z'] = 0.0
        e = TE.Isle(d); self.n = 1440
        th = [k * math.tau / self.n for k in range(self.n)]; rr = [float(v) * 100 for v in e.r_np(th)]
        if fn: rr = [fn(t, r) for t, r in zip(th, rr)]                     # 岛文件自己的轮廓修饰（SHAPE_FN）
        self.k = (norm / max(rr)) if norm else 1.0
        self.rt = [r * self.k for r in rr]; self.R = max(self.rt)
        self.rx, self.ry = e.rx * 100 * self.k, e.ry * 100 * self.k

    def rad(self, th):
        f = (th % math.tau) / math.tau * self.n; i = int(f) % self.n; t = f - int(f)
        return self.rt[i] * (1 - t) + self.rt[(i + 1) % self.n] * t

    def frac(self, x, y): return math.hypot(x, y) / max(1e-6, self.rad(math.atan2(y, x)))
    def pts(self, n=144, s=1.0): return [(math.cos(a) * self.rad(a) * s, math.sin(a) * self.rad(a) * s) for a in (k * math.tau / n for k in range(n))]
    def edge(self, ang, s=1.0): r = self.rad(ang) * s; return math.cos(ang) * r, math.sin(ang) * r


class Ctx:
    """一座岛的构建上下文：轮廓、材质表、岛缘顶高函数、灰模开关、横向偏移（对比条）"""
    def __init__(self, iid, norm=None, clay=None, ox=0.0, seed=1, shape_fn=None):
        self.id = iid; self.S = Shape(iid, norm, shape_fn); self.clay = clay; self.ox = ox; self.seed = seed
        self.top_z = lambda x, y: 0.0; self.K = None; self.M = {}; self.tr = None

    def m(self, key, make):
        """材质：灰模时一律 clay"""
        if self.clay is not None: return self.clay
        k = f'{self.id}:{key}'                            # 岛前缀：不和 Kit.M 的通用键（rock 等）撞名
        if k not in self.M: self.M[k] = make()
        return self.M[k]

    def B(self, name): return C.Batch.get(f'{name}_{self.id}')


# ============================================================ 材质
def rock_mat(name, c, c2, strata, veins=None, vein_scale=.05):
    """岩体：Z 向层理（Wave 带，period ≈ 0.63 / strata 米）+ 色斑 + 凹凸；veins={'c','e','density'} 加 Voronoi 裂隙自发光导能脉。"""
    m, nt, b = C.new_mat(name); N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .03; nz.inputs['Detail'].default_value = 6; L.new(tc.outputs['Object'], nz.inputs['Vector'])
    mx = N.new('ShaderNodeMath'); mx.operation = 'MULTIPLY_ADD'; mx.inputs[1].default_value = .6; L.new(nz.outputs['Fac'], mx.inputs[2])
    if strata > 0:
        wv = N.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'Z'; wv.inputs['Scale'].default_value = strata
        wv.inputs['Distortion'].default_value = 3.0; wv.inputs['Detail'].default_value = 4; L.new(tc.outputs['Object'], wv.inputs['Vector']); L.new(wv.outputs['Fac'], mx.inputs[0])
    else: L.new(nz.outputs['Fac'], mx.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (*c2, 1); ramp.color_ramp.elements[1].color = (*c, 1)
    ramp.color_ramp.elements[0].position = .35; ramp.color_ramp.elements[1].position = .75
    L.new(mx.outputs[0], ramp.inputs['Fac']); L.new(ramp.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = .92
    n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = .4; n2.inputs['Detail'].default_value = 8; L.new(tc.outputs['Object'], n2.inputs['Vector'])
    bm = N.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = .5; L.new(n2.outputs['Fac'], bm.inputs['Height']); L.new(bm.outputs['Normal'], b.inputs['Normal'])
    if veins:
        vo = N.new('ShaderNodeTexVoronoi'); vo.feature = 'DISTANCE_TO_EDGE'; vo.inputs['Scale'].default_value = vein_scale; L.new(tc.outputs['Object'], vo.inputs['Vector'])
        th = N.new('ShaderNodeMapRange'); th.inputs['From Max'].default_value = .005; th.inputs['To Min'].default_value = 1.0; th.inputs['To Max'].default_value = 0.0
        L.new(vo.outputs['Distance'], th.inputs['Value'])
        gate = N.new('ShaderNodeMapRange'); gate.inputs['From Min'].default_value = .62 - veins['density'] * .3; gate.inputs['From Max'].default_value = .7 - veins['density'] * .3
        L.new(nz.outputs['Fac'], gate.inputs['Value'])
        mm = N.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; L.new(th.outputs['Result'], mm.inputs[0]); L.new(gate.outputs['Result'], mm.inputs[1])
        ms = N.new('ShaderNodeMath'); ms.operation = 'MULTIPLY'; ms.inputs[1].default_value = veins['e']; L.new(mm.outputs[0], ms.inputs[0])
        b.inputs['Emission Color'].default_value = (*veins['c'], 1); L.new(ms.outputs[0], b.inputs['Emission Strength'])
    return m


def stripe_mat(name, c1, c2, period=6.0, axis='X'):
    """修剪条纹草坪"""
    m, nt, b = C.new_mat(name); N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord'); wv = N.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = axis
    wv.inputs['Scale'].default_value = .628 / period; wv.wave_profile = 'SAW'; L.new(tc.outputs['Object'], wv.inputs['Vector'])
    st = N.new('ShaderNodeMath'); st.operation = 'GREATER_THAN'; st.inputs[1].default_value = .5; L.new(wv.outputs['Fac'], st.inputs[0])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs[6].default_value = (*c1, 1); mix.inputs[7].default_value = (*c2, 1); L.new(st.outputs[0], mix.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .5; L.new(tc.outputs['Object'], nz.inputs['Vector'])
    mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = .25
    L.new(mix.outputs[2], mul.inputs[6]); L.new(nz.outputs['Color'], mul.inputs[7]); L.new(mul.outputs[2], b.inputs['Base Color']); b.inputs['Roughness'].default_value = .85
    return m


def speckle_mat(name, base, dot, dens=.12, scale=.6):
    """草地撒点（落花 / 野花）"""
    m, nt, b = C.new_mat(name); N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord'); vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = scale; L.new(tc.outputs['Object'], vo.inputs['Vector'])
    th = N.new('ShaderNodeMath'); th.operation = 'LESS_THAN'; th.inputs[1].default_value = dens; L.new(vo.outputs['Distance'], th.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .08; L.new(tc.outputs['Object'], nz.inputs['Vector'])
    g = N.new('ShaderNodeMix'); g.data_type = 'RGBA'; g.blend_type = 'MULTIPLY'; g.inputs[0].default_value = .3; g.inputs[6].default_value = (*base, 1); L.new(nz.outputs['Color'], g.inputs[7])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; L.new(th.outputs[0], mix.inputs[0]); L.new(g.outputs[2], mix.inputs[6]); mix.inputs[7].default_value = (*dot, 1)
    L.new(mix.outputs[2], b.inputs['Base Color']); b.inputs['Roughness'].default_value = .85
    return m


def hex_ward(name, cell=7.0, alpha=.4, estr=2.2, c=C.AETHER_C, rim=.06):
    """结界：真六角格（tex/hex.png 俯投平铺，格半径 cell 米），格线亮度随菲涅尔加强——穹面近乎透明，弧边一圈格纹反光（设定 §9.2）"""
    m, nt, b = C.new_mat(name); N, L = nt.nodes, nt.links; out = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / (math.sqrt(3) * cell), 1 / (3 * cell), 1)
    L.new(tc.outputs['Object'], mp.inputs['Vector'])
    im = N.new('ShaderNodeTexImage'); im.image = bpy.data.images.load(os.path.join(HERE, 'tex', 'hex.png'), check_existing=True); im.image.colorspace_settings.name = 'Non-Color'
    im.extension = 'REPEAT'; L.new(mp.outputs['Vector'], im.inputs['Vector'])
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = .35
    fr = N.new('ShaderNodeMapRange'); fr.inputs['To Min'].default_value = rim; L.new(lw.outputs['Facing'], fr.inputs['Value'])
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; L.new(im.outputs['Color'], mu.inputs[0]); L.new(fr.outputs['Result'], mu.inputs[1])
    ma = N.new('ShaderNodeMath'); ma.operation = 'MULTIPLY'; ma.inputs[1].default_value = alpha; L.new(mu.outputs[0], ma.inputs[0])
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*c, 1); em.inputs['Strength'].default_value = estr
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    L.new(ma.outputs[0], mx.inputs['Fac']); L.new(tr.outputs[0], mx.inputs[1]); L.new(em.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], out.inputs['Surface'])
    if hasattr(m, 'blend_method'): m.blend_method = 'BLEND'
    return m


def top_mats(K):
    """岛面常用材质（加进 Kit.M）"""
    M = K.M
    M['alloy'] = C.flat('alloy_v16', (.72, .74, .78), .22, metal=1.0)
    M['holo'] = C.glow('holo_v16', c=(.62, .95, 1.0), estr=6.0)
    M['water_clear'] = C.glass('water_v16', tint=(.35, .6, .66), rough=.02)
    M['ward'] = hex_ward('ward_v16')
    M['rune'] = C.glow('rune_v16', estr=4.0)
    M['stone_sand'] = C.ashlar('stone_sand', c=(.84, .74, .56), course=.5, block=1.1)
    return M


# ============================================================ 高度场（岛面）
class Terrain:
    """h(x, y) = 台地阶梯 + 丘 + 噪声，经 flats（建筑垫层）压平，岛缘下弯（崖眉）；地面材质按 zones 分区。"""
    def __init__(self, S, steps=None, mounds=(), noise=(.4, 40), brow=(6, 1.5), ground='lawn'):
        self.S, self.steps, self.mounds, self.noise, self.brow, self.ground = S, steps, list(mounds), noise, brow, ground
        self.flats, self.zones = [], []

    def base(self, x, y):
        z = 0.0; st = self.steps
        if st:
            a = math.radians(st['axis_deg']); p = x * math.cos(a) + y * math.sin(a); z = st['levels'][sum(p > c for c in st['cuts'])]
            sp = st.get('span')
            if sp:                                               # 园区带内是硬台阶（挡土墙），带外过渡成自然坡
                q = abs(-x * math.sin(a) + y * math.cos(a)); w = min(1.0, max(0.0, (q - sp) / 18.0))
                if w > 0:
                    zs = st['levels'][0]
                    for i, c in enumerate(st['cuts']):
                        t = min(1.0, max(0.0, (p - c + 22) / 44)); t = t * t * (3 - 2 * t); zs += (st['levels'][i + 1] - st['levels'][i]) * t
                    z = z * (1 - w) + zs * w
        for m in self.mounds:
            d2 = ((x - m['at'][0]) ** 2 + (y - m['at'][1]) ** 2) / m['r'] ** 2
            z += m['h'] * math.exp(-2.2 * d2) * (1 + .35 * MN.noise(Vector((x * .06, y * .06, 1.3))))
        return z

    def h(self, x, y):
        z = self.base(x, y)
        if self.noise: z += self.noise[0] * MN.noise(Vector((x / self.noise[1], y / self.noise[1], 3.7)))
        for (x0, x1, y0, y1, lv, pad) in self.flats:
            d = math.hypot(max(x0 - x, 0, x - x1), max(y0 - y, 0, y - y1))
            if d < pad: t = d / pad; t = t * t * (3 - 2 * t); z = lv * (1 - t) + z * t
        if self.brow:
            f = self.S.frac(x, y); w = self.brow[0] / self.S.R
            if f > 1 - w: z -= self.brow[1] * ((f - (1 - w)) / w) ** 2
        return z

    def zone(self, x, y):
        for test, key in reversed(self.zones):
            if test(x, y): return key
        return self.ground

    def build(self, B, M, step=1.5):
        S = self.S; R = S.R + 3; n = int(2 * R / step) + 1; rows, ins = [], []
        for j in range(n):
            row, ir = [], []
            for i in range(n):
                x, y = -R + i * step, -R + j * step; f = S.frac(x, y); ir.append(f <= 1.0)
                if f > 1.0: x, y = x / f, y / f
                row.append((x, y, self.h(x, y)))
            rows.append(row); ins.append(ir)
        V = [[B.bm.verts.new(p) for p in r] for r in rows]
        for j in range(n - 1):
            for i in range(n - 1):
                q = ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))
                if not any(ins[a][b] for a, b in q): continue
                cx = sum(rows[a][b][0] for a, b in q) / 4; cy = sum(rows[a][b][1] for a, b in q) / 4
                try: fa = B.bm.faces.new([V[a][b] for a, b in q])
                except ValueError: continue
                fa.material_index = B.mi(M[self.zone(cx, cy)]); fa.smooth = True

    def rect(self, x0, x1, y0, y1, key): self.zones.append((lambda x, y: x0 <= x <= x1 and y0 <= y <= y1, key))
    def ell(self, cx, cy, a, b, key): self.zones.append((lambda x, y: ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1, key))
    def fn(self, test, key): self.zones.append((test, key))
    def path(self, pts, w, key): self.zones.append((lambda x, y: seg_dist(x, y, pts) <= w / 2, key))

    def walls(self, B, m, h_over=1.0):
        """台地挡土墙：沿每条台阶线、只在岛内"""
        st = self.steps; S = self.S
        if not st: return
        a = math.radians(st['axis_deg']); ux, uy = math.cos(a), math.sin(a); px, py = -uy, ux
        for i, c in enumerate(st['cuts']):
            zt, zb = max(st['levels'][i], st['levels'][i + 1]), min(st['levels'][i], st['levels'][i + 1]); seg = []
            for k in range(-800, 801):
                t = k * .5; x, y = ux * c + px * t, uy * c + py * t
                if S.frac(x, y) < .985 and abs(t) <= st.get('span', 1e9): seg.append((x, y))
                elif seg: _wall(B, seg, zb - 1.5, zt + h_over, m); seg = []
            if seg: _wall(B, seg, zb - 1.5, zt + h_over, m)


def seg_dist(x, y, pts):
    best = 1e9
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy or 1; u = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L2))
        best = min(best, math.hypot(x - ax - u * dx, y - ay - u * dy))
    return best


def _wall(B, seg, z0, z1, m):
    (ax, ay), (bx, by) = seg[0], seg[-1]; L = math.hypot(bx - ax, by - ay)
    if L < 2: return
    n = max(1, int(L / 6))
    for k in range(n):
        t0, t1 = k / n, (k + 1) / n
        B.strip([(ax + (bx - ax) * t0, ay + (by - ay) * t0, (z0 + z1) / 2), (ax + (bx - ax) * t1, ay + (by - ay) * t1, (z0 + z1) / 2)], 1.1, z1 - z0, m)


def placed(fn, x, y, z, ang=0.0, k=1.0):
    """在本地原点建好一组部件（Kit / Batch），再整体转 ang、平移到 (x, y, z)。"""
    mark = {n: len(b.bm.verts) for n, b in C.Batch.ALL.items()}
    r = fn(); c, s = math.cos(ang), math.sin(ang)
    for n, b in C.Batch.ALL.items():
        b.bm.verts.ensure_lookup_table()
        for v in b.bm.verts[mark.get(n, 0):]:
            X, Y = v.co.x * k, v.co.y * k; v.co.x = x + X * c - Y * s; v.co.y = y + X * s + Y * c; v.co.z = v.co.z * k + z
    return r


def drape(tr, pts, w, m, B, dz=.08, step=2.0, h=.06):
    """贴地条带（路、溪）"""
    out = []
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, by - ay); n = max(1, int(L / step))
        for k in range(n): t = k / n; x, y = ax + (bx - ax) * t, ay + (by - ay) * t; out.append((x, y, tr.h(x, y) + dz))
    x, y = pts[-1]; out.append((x, y, tr.h(x, y) + dz)); B.strip(out, w, h, m)


# ============================================================ 岛底基元
def loft(B, rings, m, apex=None, cap=False, smooth=True):
    """rings = [(pts, z), …] 自上而下；apex 收尖或 cap 封底"""
    n = len(rings[0][0]); vs, fs = [], []
    for pts, z in rings: vs += [(x, y, z) for x, y in pts]
    for j in range(len(rings) - 1):
        for i in range(n): a, b = j * n + i, j * n + (i + 1) % n; fs.append((b, a, a + n, b + n))
    L = (len(rings) - 1) * n
    if apex is not None: vs.append(apex); k = len(vs) - 1; fs += [(L + (i + 1) % n, L + i, k) for i in range(n)]
    elif cap: fs.append(tuple(range(L + n - 1, L - 1, -1)))
    B.poly(vs, fs, m, smooth=smooth)


def cliff_band(ctx, B, P, cliff, m, inset=.985):
    """岛缘下的竖直崖壁带（层理更密的一段）"""
    ox = ctx.ox; n = len(P)
    vs = [(x + ox, y, ctx.top_z(x, y)) for x, y in P] + [(x * inset + ox, y * inset, -cliff) for x, y in P]
    B.poly(vs, [((i + 1) % n, i, n + i, n + (i + 1) % n) for i in range(n)], m, smooth=False)


def body_rings(ctx, P, prof, cliff, amp=0.0, tilt=(0, 0), nscale=.025):
    """按 [(缩放, 深度/R)] 放样主岩体环（含崖底第一环）；返回 rings, apex"""
    R = ctx.S.R; ox = ctx.ox; dmax = max(d for s, d in prof) or 1
    rings = [([(x * .985 + ox, y * .985) for x, y in P], -cliff)]; apex = None
    for (s, d) in prof:
        z = -cliff - d * R; tx, ty = tilt[0] * R * d / dmax * .5, tilt[1] * R * d / dmax * .5
        if s <= 1e-3: apex = (tx + ox, ty, z); continue
        pts = []
        for (x, y) in P:
            k = 1 + amp * MN.noise(Vector((x * nscale + ctx.seed, y * nscale, z * .03)))
            pts.append((x * s * k + tx + ox, y * s * k + ty))
        rings.append((pts, z))
    return rings, apex


def ring_at(rings, z):
    for (p0, z0), (p1, z1) in zip(rings, rings[1:]):
        if z1 <= z <= z0:
            t = (z0 - z) / max(1e-6, z0 - z1)
            return [(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) for a, b in zip(p0, p1)]
    return rings[-1][0]


def cone(B, cx, cy, z0, r0, L, m, seed=0, bend=(0, 0), rough=.3, n=24, nr=14, power=.75):
    """噪声倒锥（副锥、獠牙）：bend = 锥尖水平偏移（米），沿 t² 弯出"""
    rs = []; tip = None
    for q in range(nr + 1):
        t = q / nr; rr = r0 * (1 - t) ** power; x0, y0 = cx + bend[0] * t * t, cy + bend[1] * t * t
        if rr < 1e-3: tip = (x0, y0, z0 - L); continue
        rs.append(([(x0 + math.cos(k * math.tau / n) * rr * (1 + rough * MN.noise(Vector((math.cos(k * math.tau / n) * 2 + seed, math.sin(k * math.tau / n) * 2, t * 3)))),
                     y0 + math.sin(k * math.tau / n) * rr * (1 + rough * MN.noise(Vector((math.cos(k * math.tau / n) * 2 + seed, math.sin(k * math.tau / n) * 2, t * 3))))) for k in range(n)], z0 - L * t))
    loft(B, rs, m, apex=tip)


def glow_orb(B, x, y, z, r, m): B.sphere(x, y, z, r, m, seg=18, rings=9)


def band(B, pts, z, w, m, scale=1.0, ox=0.0):
    """沿一圈轮廓的发光带 / 合金带（符文环）"""
    ring = [((x - ox) * scale + ox, y * scale) for x, y in pts]
    B.strip([(x, y, z) for x, y in ring + ring[:1]], w, w * .5, m)


def crystals_down(B, rings, R, n, m, rnd, d0=.02, d1=.3, cliff=0, s=(.05, .1)):
    for k in range(n):
        z = -cliff - rnd.uniform(d0, d1) * R; pts = ring_at(rings, z); x, y = pts[rnd.randrange(len(pts))]
        C.crystal_cluster(B, x, y, z, R * rnd.uniform(*s), m, seed=rnd.randrange(10 ** 6), down=True)


def hanging(ctx, B, P, n, L, m, rnd, r=(.15, .35), flower=None):
    """崖缘垂根 / 藤蔓（flower：挂花点）"""
    ox = ctx.ox
    for k in range(n):
        x, y = P[rnd.randrange(len(P))]; x, y = x * .995, y * .995; Lk = rnd.uniform(*L); z0 = ctx.top_z(x, y) - .5
        p = [(x + ox, y, z0)] + [(x * (1 - .004 * q) + ox + rnd.uniform(-.6, .6), y * (1 - .004 * q) + rnd.uniform(-.6, .6), z0 - Lk * q / 3) for q in (1, 2, 3)]
        B.tube(p, rnd.uniform(*r), m, n=5)
        if flower is not None:
            for q in range(3): B.sphere(p[q + 1][0], p[q + 1][1], p[q + 1][2] + 1, .7, flower, seg=6, rings=4)


# ============================================================ 岛面基元
def ward_dome(S, top_z, H, m, B, s=1.035):
    """结界扁穹：沿轮廓、顶高 H，六角格材质（格线自发光，其余透明）"""
    P = S.pts(144, s); n = len(P); vs, fs = [], []
    for j in range(11):
        ph = j / 10 * math.pi / 2; c = math.cos(ph)
        vs += [(x * c, y * c, (top_z(x / s, y / s) * (1 - j / 10)) + math.sin(ph) * H - 1.0) for x, y in P]
    for j in range(10):
        for i in range(n): a, b = j * n + i, j * n + (i + 1) % n; fs.append((a, b, b + n, a + n))
    B.poly(vs, fs, m)


def waterfall(x, y, z, ang, w, L, strength=1.1, alpha=.8, name='fall'):
    import oblique as OB
    col = bpy.context.scene.collection
    return OB.waterfall(col, x, y, z, ang, w, L, OB.fall_mat(name + '_m', strength, alpha), C.glow(name + '_mist', c=(.95, .97, 1.0), estr=.3, alpha=.12), name)


def cascade(B, x, y0, y1, z0, z1, m, foam=None):
    """园中跌水：台阶处一道竖直水帘（不带水雾团，免得盖住水池）"""
    B.poly([(x, y0, z0), (x, y1, z0), (x + .6, y1, z1), (x + .6, y0, z1)], [(0, 1, 2, 3)], m)
    if foam is not None: B.box(x + .3, x + 2.5, y0, y1, z1 - .05, z1 + .15, foam)


def car(K):
    M = K.M; HC = K.HC
    HC.sphere(0, 0, 0, 1.0, M['car'], sz=.5, seg=24, rings=12, sx=2.3); HC.sphere(.3, 0, .3, .8, M['carg'], sz=.55, seg=20, rings=10, sx=1.5, zmin=0.0)
    for ex, ey in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        HC.cyl(ex * 1.7, ey * 1.2, -.3, .55, .3, M['car'], 20); HC.cyl(ex * 1.7, ey * 1.2, -.33, .42, .02, M['aether'], 16)


def dock(K, S, tr, toward, r, cars=1, approach_m=60, lights=True):
    """停靠平台（Kit.dock：甲板、栏杆、信标环、引导光带、悬浮车）贴到岛缘顶高；再加下滑角约 5° 的进场光点串。"""
    ang = math.atan2(toward[1], toward[0]); ex, ey = S.edge(ang); z = tr.h(ex * .97, ey * .97) - .2
    (px, py), br = placed(lambda: K.dock(S.pts(128), (math.cos(ang), math.sin(ang)), r), 0, 0, z)
    for k in range(1, cars):
        a2 = ang + math.pi / 2 * (1 if k % 2 else -1); placed(lambda: car(K), px + math.cos(a2) * r * .5, py + math.sin(a2) * r * .5, z + 1.35, ang)
    if lights:
        D = C.Batch('dock_approach')
        for k in range(1, int(approach_m / 6)):
            d = r + k * 6; D.sphere(px + math.cos(ang) * d, py + math.sin(ang) * d, z + 1.0 - d * math.tan(math.radians(5)), .5, K.M['aether'], seg=8, rings=4)
    # 斜撑回岩体（设定 §9.2）
    for s_ in (-1, 1):
        a2 = ang + s_ * .5; K.DK.tube([(px + math.cos(a2) * r * .7, py + math.sin(a2) * r * .7, z - .6), (ex * .95 + math.cos(a2) * 2, ey * .95 + math.sin(a2) * 2, z - r * 1.4)], .5, K.M['steel'], n=6)
    return (px, py), br, z, ang


# ============================================================ 出图
def _collect(name):
    col = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(col)
    for o in list(bpy.context.scene.collection.objects):
        if o.type in ('MESH', 'CURVE'): bpy.context.scene.collection.objects.unlink(o); col.objects.link(o)
    return col


def run(mod):
    """岛文件的 __main__：建岛 → 存 .blend / .glb → 斜视 35° 近景 + 岛底仰视"""
    import traceback, upper_estates as UE
    try:
        sc = C.setup(A['samples']); K = UE.Kit(sc); top_mats(K)
        ctx = Ctx(mod.ID, shape_fn=getattr(mod, 'SHAPE_FN', None)); ctx.K, ctx.M = K, K.M
        if hasattr(mod, 'top'): mod.top(ctx)
        mod.underside(ctx)
        objs = C.Batch.build_all()
        for o in objs:
            if o.name.startswith(('ward', 'lamps', 'dock_approach', 'rim_crystals', 'glow')): o.visible_shadow = False
        col = _collect('island_' + mod.ID)
        if A['save'] == '1':
            os.makedirs(OUT, exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, mod.ID + '.blend'))
            try:
                bpy.ops.object.select_all(action='DESELECT')
                for o in col.objects: o.select_set(True)
                bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, mod.ID + '.glb'), export_format='GLB', use_selection=True)
            except Exception as e: print('GLB export failed', e)
        R = ctx.S.R
        import oblique as OB
        C.sky_sun(sc, 'day', sun_az=225.0, sun_el=40.0, sky_s=.16); sc.view_settings.exposure = -.3
        cs = OB.cloud_sheet(bpy.context.scene.collection, -R * 3.2, .6, 'sea_v16', 80, alpha=.95); cs.scale = (R * 45, R * 45, 1)   # 云团约 R·45/23 米
        pitch, az = math.radians(35), math.radians(-90 + 15)                 # 从南偏东 15° 看向北，俯角 35°（设定 §9.1）
        tgt = Vector((0, 0, -R * getattr(mod, 'CAM_DROP', .45))); dist = R * getattr(mod, 'CAM_DIST', 5.4)
        pos = tgt + Vector((math.cos(az) * math.cos(pitch), math.sin(az) * math.cos(pitch), math.sin(pitch))) * dist
        if os.environ.get('ISLE_CAM') == 'top': pos, tgt = Vector((0, -1, R * 6)), Vector((0, 0, 0))     # 调试：正俯视
        C.camera(sc, tuple(pos), tuple(tgt), 50); C.render(sc, A['out'], A['res'], 1.6)
        if A['under'] == '1':                                                 # 岛底仰视（略低于岛缘，看清岩色 / 收分 / 核心）
            pitch = math.radians(-10); tgt = Vector((0, 0, -R * getattr(mod, 'UCAM_DROP', .55))); dist = R * getattr(mod, 'UCAM_DIST', 4.8)
            pos = tgt + Vector((math.cos(az) * math.cos(pitch), math.sin(az) * math.cos(pitch), math.sin(pitch))) * dist
            C.camera(sc, tuple(pos), tuple(tgt), 50)
            b, e = os.path.splitext(A['out']); C.render(sc, b + '_under' + e, A['ures'] or A['res'], 1.6)
    except Exception:
        traceback.print_exc(); raise
