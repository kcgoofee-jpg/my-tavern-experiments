"""开局地标（辉光大教堂、首相府）共用：场景 / 材质 / 批量几何 / 天空与太阳 / 相机。

几何全部在世界坐标里直接写进 bmesh（对象原点 = 世界原点），所以 Object 坐标 = 世界坐标，
box 投影贴图的尺度就是米。每个 Batch = 一个对象 = export_glb.py 里的一个组（名字即组名）。
中立建筑：不放任何文字、标志、宗教或机构符号。
"""
import math, os, sys
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, '..', 'data', 'props'))


def args(defaults):
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    a = dict(defaults)
    for k, v in zip(argv[::2], argv[1::2]):
        a[k.lstrip('-')] = v
    return a


def setup(samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type != 'CPU'
        sc.cycles.device = 'GPU'
    except Exception as e:  # noqa
        print('cpu fallback', e)
    sc.cycles.samples = int(samples)
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 8
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    return sc


# ---------------------------------------------------------------- 材质
def tex_path(aid, kind):
    if aid[0].isupper():   # ambientCG
        m = {'diff': 'Color', 'rough': 'Roughness', 'nor_gl': 'NormalGL'}[kind]
        return os.path.join(DATA, 'tex', aid, f'{aid}_2K-JPG_{m}.jpg')
    return os.path.join(DATA, 'tex', aid, f'{aid}_{kind}_2k.jpg')


def new_mat(name):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs[0])
    return m, nt, b


def _img(nt, path, vec, noncolor=False):
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        n.image.colorspace_settings.name = 'Non-Color'
    n.projection = 'BOX'
    n.projection_blend = 0.3
    nt.links.new(vec, n.inputs['Vector'])
    return n


def _mix(nt, a, b, fac, mode='MIX'):
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = mode
    if isinstance(fac, float):
        mx.inputs['Factor'].default_value = fac
    else:
        nt.links.new(fac, mx.inputs['Factor'])
    for i, v in ((6, a), (7, b)):
        if isinstance(v, tuple):
            mx.inputs[i].default_value = (*v, 1)
        else:
            nt.links.new(v, mx.inputs[i])
    return mx.outputs[2]


def pbr(name, aid, tile, tint=(1, 1, 1), value=1.0, sat=1.0, rough_mul=1.0, nstr=1.0, metal=0.0,
        weather=0.0, rot=0.0):
    """box 投影 PBR（tile = 贴图覆盖的米数）。weather>0：按世界高度 + 噪声压暗墙根、檐下雨痕。"""
    m, nt, b = new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / tile,) * 3
    mp.inputs['Rotation'].default_value = (0, 0, rot)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    v = mp.outputs[0]
    d = _img(nt, tex_path(aid, 'diff'), v)
    r = _img(nt, tex_path(aid, 'rough'), v, True)
    n = _img(nt, tex_path(aid, 'nor_gl'), v, True)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = nstr
    nt.links.new(n.outputs[0], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    hs = nt.nodes.new('ShaderNodeHueSaturation')
    hs.inputs['Saturation'].default_value = sat; hs.inputs['Value'].default_value = value
    nt.links.new(d.outputs[0], hs.inputs['Color'])
    col = _mix(nt, hs.outputs[0], tint, 1.0, 'MULTIPLY')
    if weather > 0:
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 0.35; nz.inputs['Detail'].default_value = 8
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        # 竖向拉长的雨痕：x/y 方向高频、z 方向低频
        st = nt.nodes.new('ShaderNodeMapping'); st.inputs['Scale'].default_value = (3.0, 3.0, 0.15)
        nt.links.new(tc.outputs['Object'], st.inputs['Vector'])
        nz2 = nt.nodes.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 1.2; nz2.inputs['Detail'].default_value = 4
        nt.links.new(st.outputs[0], nz2.inputs['Vector'])
        mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
        nt.links.new(nz.outputs[0], mul.inputs[0]); nt.links.new(nz2.outputs[0], mul.inputs[1])
        ramp = nt.nodes.new('ShaderNodeMapRange')
        ramp.inputs['From Min'].default_value = 0.22; ramp.inputs['From Max'].default_value = 0.42
        ramp.inputs['To Min'].default_value = 0.0; ramp.inputs['To Max'].default_value = weather
        nt.links.new(mul.outputs[0], ramp.inputs['Value'])
        col = _mix(nt, col, (0.42, 0.4, 0.37), ramp.outputs[0], 'MULTIPLY')
    nt.links.new(col, b.inputs['Base Color'])
    rm = nt.nodes.new('ShaderNodeMath'); rm.operation = 'MULTIPLY'; rm.inputs[1].default_value = rough_mul
    nt.links.new(r.outputs[0], rm.inputs[0]); nt.links.new(rm.outputs[0], b.inputs['Roughness'])
    b.inputs['Metallic'].default_value = metal
    return m


def flat(name, c, rough=0.5, metal=0.0, emit=None, estr=0.0, noise=0.0, coat=0.0):
    """单色材质；noise>0 时加一点明暗起伏（避免塑料感）。emit 用于灯、夜间透光的窗。"""
    m, nt, b = new_mat(name)
    col = None
    if noise > 0:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.5; nz.inputs['Detail'].default_value = 6
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['To Min'].default_value = 1 - noise; mr.inputs['To Max'].default_value = 1 + noise * 0.5
        nt.links.new(nz.outputs[0], mr.inputs['Value'])
        cm = nt.nodes.new('ShaderNodeCombineColor')
        for i in range(3):
            nt.links.new(mr.outputs[0], cm.inputs[i])
        col = _mix(nt, cm.outputs[0], tuple(c), 1.0, 'MULTIPLY')
        nt.links.new(col, b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = (*c, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if coat:
        b.inputs['Coat Weight'].default_value = coat
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = estr
    return m


def glass(name, tint=(0.08, 0.1, 0.12), rough=0.05, emit=None, estr=0.0):
    """窗玻璃：深色、高反射的电介质（背后是暗室，不做透射）；夜景时 emit 给室内暖光。"""
    m, nt, b = new_mat(name)
    b.inputs['Base Color'].default_value = (*tint, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = 0.7
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = estr
    return m


# ---------------------------------------------------------------- 批量几何
class Batch:
    """一个对象、多材质；所有坐标是世界坐标（米）。"""
    ALL = {}

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []
        Batch.ALL[name] = self

    @classmethod
    def get(cls, name):
        return cls.ALL.get(name) or cls(name)

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def poly(self, verts, faces, m, mat=None, smooth=False):
        idx = self.mi(m)
        vs = [self.bm.verts.new((mat @ Vector(v)) if mat else v) for v in verts]
        out = []
        for f in faces:
            try:
                fa = self.bm.faces.new([vs[i] for i in f])
            except ValueError:
                continue
            fa.material_index = idx
            fa.smooth = smooth
            out.append(fa)
        return out

    def box(self, x0, x1, y0, y1, z0, z1, m, mat=None):
        if x0 > x1: x0, x1 = x1, x0
        if y0 > y1: y0, y1 = y1, y0
        vs = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
              (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        fs = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        return self.poly(vs, fs, m, mat)

    def boxc(self, x, y, z, sx, sy, sz, m, mat=None):
        """中心 x, y；底 z；尺寸 sx sy sz"""
        return self.box(x - sx / 2, x + sx / 2, y - sy / 2, y + sy / 2, z, z + sz, m, mat)

    def cyl(self, x, y, z, r, h, m, n=16, r2=None, cap=True, smooth=True, mat=None, rx=None):
        """竖直圆柱 / 圆台（r2 = 顶半径）；rx 给椭圆（x 向半径）"""
        r2 = r if r2 is None else r2
        rxs = (rx / r) if rx else 1.0
        vs = []
        for zz, rr in ((z, r), (z + h, r2)):
            for i in range(n):
                a = i * math.tau / n
                vs.append((x + rr * rxs * math.cos(a), y + rr * math.sin(a), zz))
        fs = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        if cap:
            fs.append(tuple(range(n - 1, -1, -1)))
            if r2 > 1e-4:
                fs.append(tuple(range(n, 2 * n)))
        if r2 <= 1e-4:
            vs = vs[:n] + [(x, y, z + h)]
            fs = [(i, (i + 1) % n, n) for i in range(n)] + ([tuple(range(n - 1, -1, -1))] if cap else [])
        return self.poly(vs, fs, m, mat, smooth and n > 8)

    def tube(self, pts, r, m, n=8, closed=False):
        """沿折线的圆管（飞扶壁拱、栏杆扶手、拱肋）"""
        P = [Vector(p) for p in pts]
        vs, fs = [], []
        for i, p in enumerate(P):
            t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
            up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            u = t.cross(up).normalized(); w = t.cross(u).normalized()
            for k in range(n):
                a = k * math.tau / n
                vs.append(p + r * (math.cos(a) * u + math.sin(a) * w))
        for i in range(len(P) - 1):
            for k in range(n):
                a, b = i * n + k, i * n + (k + 1) % n
                fs.append((a, b, b + n, a + n))
        if not closed:
            fs.append(tuple(range(n - 1, -1, -1)))
            L = (len(P) - 1) * n
            fs.append(tuple(range(L, L + n)))
        return self.poly([tuple(v) for v in vs], fs, m, smooth=True)

    def strip(self, pts, w, h, m):
        """沿折线的方截面条（窗棂、拱肋、檐口线）：w 宽（水平法向），h 高（向外）"""
        P = [Vector(p) for p in pts]
        vs = []
        for i, p in enumerate(P):
            t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
            n1 = Vector((-t.y, t.x, 0)) if abs(t.z) < 0.999 else Vector((1, 0, 0))
            if n1.length < 1e-6:
                n1 = Vector((1, 0, 0))
            n1.normalize(); n2 = t.cross(n1).normalized()
            for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                vs.append(p + n1 * (a * w / 2) + n2 * (b * h / 2))
        fs = []
        for i in range(len(P) - 1):
            for k in range(4):
                a, b = i * 4 + k, i * 4 + (k + 1) % 4
                fs.append((a, b, b + 4, a + 4))
        fs.append((3, 2, 1, 0)); L = (len(P) - 1) * 4; fs.append((L, L + 1, L + 2, L + 3))
        return self.poly([tuple(v) for v in vs], fs, m)

    def sphere(self, x, y, z, r, m, sz=1.0, seg=32, rings=16, zmin=-1.0, sx=1.0):
        """球 / 穹顶：zmin=0 只要上半球（含赤道）"""
        vs, fs = [], []
        r0 = int(rings * (1 - (math.acos(max(-1, min(1, zmin))) / math.pi))) if zmin > -1 else 0
        rows = []
        for j in range(r0, rings + 1):
            ph = math.pi * (1 - j / rings)   # 从下往上
            row = []
            for i in range(seg):
                a = i * math.tau / seg
                row.append(len(vs))
                vs.append((x + r * sx * math.sin(ph) * math.cos(a), y + r * math.sin(ph) * math.sin(a), z + r * sz * math.cos(ph)))
            rows.append(row)
        for j in range(len(rows) - 1):
            for i in range(seg):
                a, b = rows[j][i], rows[j][(i + 1) % seg]
                c, d = rows[j + 1][(i + 1) % seg], rows[j + 1][i]
                fs.append((a, b, c, d))
        if zmin > -1:
            fs.append(tuple(reversed(rows[0])))
        return self.poly(vs, fs, m, smooth=True)

    def gable(self, x0, x1, y0, y1, z, h, m, along='x', over=0.0):
        """双坡屋顶（屋脊沿 along）；over = 檐口外挑"""
        if along == 'x':
            ym = (y0 + y1) / 2; y0 -= over; y1 += over
            vs = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), (x0, ym, z + h), (x1, ym, z + h)]
            fs = [(3, 2, 1, 0), (0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)]
        else:
            xm = (x0 + x1) / 2; x0 -= over; x1 += over
            vs = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), (xm, y0, z + h), (xm, y1, z + h)]
            fs = [(3, 2, 1, 0), (0, 1, 4), (2, 3, 5), (1, 2, 5, 4), (3, 0, 4, 5)]
        return self.poly(vs, fs, m)

    def pyramid(self, x, y, z, sx, sy, h, m):
        vs = [(x - sx / 2, y - sy / 2, z), (x + sx / 2, y - sy / 2, z), (x + sx / 2, y + sy / 2, z), (x - sx / 2, y + sy / 2, z), (x, y, z + h)]
        return self.poly(vs, [(3, 2, 1, 0), (0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], m)

    def lathe(self, x, y, z, prof, m, n=32, a0=0.0, a1=math.tau, smooth=True, close=True):
        """旋转体：prof = [(r, dz)…] 从下到上"""
        full = abs(a1 - a0 - math.tau) < 1e-6
        cols = n if full else n + 1
        vs = []
        for (r, dz) in prof:
            for i in range(cols):
                a = a0 + (a1 - a0) * i / n
                vs.append((x + r * math.cos(a), y + r * math.sin(a), z + dz))
        fs = []
        for j in range(len(prof) - 1):
            for i in range(n):
                a, b = j * cols + i, j * cols + (i + 1) % cols
                fs.append((a, b, b + cols, a + cols))
        return self.poly(vs, fs, m, smooth=smooth)

    def build(self, coll=None):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)   # 不做 recalc_face_normals：各基元按外法向绕序写入，开口曲面（扇形拱顶）重算会翻面; self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        o = bpy.data.objects.new(self.name, me)
        (coll or bpy.context.scene.collection).objects.link(o)
        return o

    @classmethod
    def build_all(cls):
        out = [b.build() for b in cls.ALL.values()]
        cls.ALL.clear()
        return out


# 尖拱轮廓（二心尖拱，equilateral）：返回窗框多边形，局部 (u 水平, v 竖直)
def pointed(w, h_spring, n=8, sharp=1.0):
    """宽 w、起拱高 h_spring 的尖拱窗轮廓（u, v），底边在 v=0。sharp=1 为等边尖拱。"""
    R = w * sharp
    pts = [(-w / 2, 0), (w / 2, 0), (w / 2, h_spring)]
    # 右半拱：圆心在 (w/2 - R, h_spring)
    cx = w / 2 - R
    top_a = math.acos(max(-1, min(1, (0 - cx) / R)))
    for i in range(1, n + 1):
        a = top_a * i / n
        pts.append((cx + R * math.cos(a), h_spring + R * math.sin(a)))
    apex_v = pts[-1][1]
    for i in range(n - 1, -1, -1):
        a = top_a * i / n
        pts.append((-(cx + R * math.cos(a)), h_spring + R * math.sin(a)))
    return pts, apex_v


def wall_frame(p0, normal):
    """墙面局部坐标：u 沿墙水平，v 竖直，n 朝外法向。返回矩阵 (u, v, n) → 世界"""
    n = Vector(normal).normalized()
    u = Vector((0, 0, 1)).cross(n).normalized()
    v = Vector((0, 0, 1))
    M = Matrix((u, v, n)).transposed().to_4x4()
    M.translation = Vector(p0)
    return M


def slab2d(B, M, pts2d, d0, d1, m):
    """把 2D 轮廓（u, v）沿法向从 d0 挤到 d1，按 M 放到墙上"""
    k = len(pts2d)
    vs = [M @ Vector((u, v, d0)) for (u, v) in pts2d] + [M @ Vector((u, v, d1)) for (u, v) in pts2d]
    fs = [tuple(range(k - 1, -1, -1)), tuple(range(k, 2 * k))]
    fs += [(i, (i + 1) % k, k + (i + 1) % k, k + i) for i in range(k)]
    return B.poly([tuple(v) for v in vs], fs, m)


def frame2d(B, M, pts2d, width, d0, d1, m):
    """沿 2D 闭合轮廓做一圈框（窗套 / 拱券线脚），宽 width，向内收"""
    k = len(pts2d)
    P = [Vector((u, v)) for u, v in pts2d]
    cx = sum(p.x for p in P) / k; cy = sum(p.y for p in P) / k
    inner = []
    for i, p in enumerate(P):
        a, b = P[i - 1], P[(i + 1) % k]
        t1 = (p - a).normalized() if (p - a).length > 1e-6 else Vector((1, 0))
        t2 = (b - p).normalized() if (b - p).length > 1e-6 else t1
        n1 = Vector((-t1.y, t1.x)); n2 = Vector((-t2.y, t2.x))
        nn = (n1 + n2); nn = nn.normalized() if nn.length > 1e-6 else n1
        # 朝内：指向质心
        if (Vector((cx, cy)) - p).dot(nn) < 0:
            nn = -nn
        c = max(0.3, n1.dot(nn))
        inner.append(p + nn * (width / c))
    vs = []
    for (ring, d) in ((P, d0), (inner, d0), (P, d1), (inner, d1)):
        for p in ring:
            vs.append(M @ Vector((p.x, p.y, d)))
    fs = []
    for i in range(k):
        j = (i + 1) % k
        fs.append((2 * k + i, 2 * k + j, 3 * k + j, 3 * k + i))   # 前
        fs.append((i, k + i, k + j, j))                           # 后
        fs.append((i, j, 2 * k + j, 2 * k + i))                   # 外侧
        fs.append((k + j, k + i, 3 * k + i, 3 * k + j))           # 内侧
    return B.poly([tuple(v) for v in vs], fs, m)


# ---------------------------------------------------------------- 天空 / 太阳
def sky_sun(sc, tod='day', sun_az=210.0, sun_el=38.0, sun_e=None, sky_s=None):
    """物理天空（多次散射，不画太阳盘）+ 同方向的太阳灯。az 从 +x 逆时针的度数（太阳所在方向）。"""
    w = bpy.data.worlds.new('w'); sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(bg.outputs[0], out.inputs[0])
    sk = nt.nodes.new('ShaderNodeTexSky')
    sk.sky_type = 'MULTIPLE_SCATTERING'
    sk.sun_disc = False
    if tod == 'dusk':
        sun_el = 4.0
    sk.sun_elevation = math.radians(sun_el)
    # 天空节点的 sun_rotation：0 = +y 方向，顺时针；换算成「从 +x 逆时针」
    sk.sun_rotation = math.radians((90 - sun_az) % 360)
    sk.altitude = 300
    nt.links.new(sk.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = sky_s if sky_s is not None else (0.22 if tod == 'day' else 0.6)
    ld = bpy.data.lights.new('sun', 'SUN')
    ld.angle = math.radians(0.8)
    if tod == 'day':
        ld.energy = sun_e if sun_e is not None else 4.2
        ld.color = (1.0, 0.95, 0.88)
    else:
        ld.energy = sun_e if sun_e is not None else 2.2
        ld.color = (1.0, 0.55, 0.3)
    so = bpy.data.objects.new('sun', ld); sc.collection.objects.link(so)
    d = Vector((math.cos(math.radians(sun_az)) * math.cos(math.radians(sun_el)),
                math.sin(math.radians(sun_az)) * math.cos(math.radians(sun_el)),
                math.sin(math.radians(sun_el))))
    so.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    return so


def camera(sc, pos, tgt, lens, shift_y=0.0):
    cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.sensor_width = 36; cd.clip_end = 5000
    cd.shift_y = shift_y
    cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam)
    cam.location = pos
    cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    return cam


def render(sc, out, res, aspect=1.5, blend=''):
    res = int(res)
    sc.render.resolution_x = res; sc.render.resolution_y = int(res / aspect)
    ext = os.path.splitext(out)[1].lower()
    sc.render.image_settings.file_format = 'JPEG' if ext in ('.jpg', '.jpeg') else 'PNG'
    if ext in ('.jpg', '.jpeg'):
        sc.render.image_settings.quality = 90
    sc.render.filepath = out
    if blend:
        bpy.ops.wm.save_as_mainfile(filepath=blend)
    bpy.ops.render.render(write_still=True)
    print('WROTE', out)


def point_light(name, loc, energy, color, radius=0.1):
    ld = bpy.data.lights.new(name, 'POINT'); ld.energy = energy; ld.color = color; ld.shadow_soft_size = radius
    o = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(o); o.location = loc
    return o


def spot_light(name, loc, tgt, energy, color, angle=60, radius=0.2):
    ld = bpy.data.lights.new(name, 'SPOT'); ld.energy = energy; ld.color = color
    ld.spot_size = math.radians(angle); ld.spot_blend = 0.6; ld.shadow_soft_size = radius
    o = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o
