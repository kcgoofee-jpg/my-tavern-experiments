"""开局地标（辉光大教堂、首相府）共用：场景 / 材质 / 批量几何 / 天空与太阳 / 相机。

几何全部在世界坐标里直接写进 bmesh（对象原点 = 世界原点），所以 Object 坐标 = 世界坐标，
box 投影贴图的尺度就是米。每个 Batch = 一个对象 = export_glb.py 里的一个组（名字即组名）。
中立建筑：不放任何文字、标志、宗教或机构符号。
"""
import math, os, sys
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
import tc_common
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


CACHED = False   # --cache-blend 命中：setup() 打开了缓存场景，build.py 的搭建段要整体跳过（见各 build.py 的 if C.CACHED）


def setup(samples):
    global CACHED
    CACHED = tc_common.blend_cache_open()
    if CACHED:
        sc = bpy.context.scene
        tc_common.pick_gpu(sc)   # 命中也要配设备：新 Blender 进程的计算设备偏好为空，blend 里存的
        return sc                # device='GPU' 落不到实处，渲染会回落 CPU 被 CPU 闸拦下（2026-09-29 实测）
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    tc_common.pick_gpu(sc)
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


def render_cached(sc, out, blend=''):
    """--cache-blend 命中路径（setup 里 CACHED=True 时由各 build.py 调）：只补输出路径与图片格式再渲染。
    分辨率 / 相机 / 采样都是建那一次的场景状态（blender_run.sh 的哈希含全部参数，命中即同参），不重算。"""
    ext = os.path.splitext(out)[1].lower()
    sc.render.image_settings.file_format = 'JPEG' if ext in ('.jpg', '.jpeg') else 'PNG'
    if ext in ('.jpg', '.jpeg'): sc.render.image_settings.quality = 90
    sc.render.filepath = out
    if blend: bpy.ops.wm.save_as_mainfile(filepath=blend)
    bpy.ops.render.render(write_still=True)
    print('WROTE', out, '(cache hit)')


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


# ---------------------------------------------------------------- 程序化树（叶片卡簇，不用外部资产）
_TREE_MATS = {}


def tree_mats():
    """树皮 + 三种叶色（深 / 中 / 带黄），叶片卡正反两面都渲染，略带透光。"""
    if not _TREE_MATS:
        _TREE_MATS['bark'] = flat('tree_bark', (0.16, 0.13, 0.1), 0.9, noise=0.45)
        for k, c in (('leaf_a', (0.07, 0.14, 0.05)), ('leaf_b', (0.11, 0.19, 0.06)), ('leaf_c', (0.17, 0.22, 0.08)),
                     ('conifer', (0.05, 0.1, 0.07)), ('yew', (0.04, 0.09, 0.04))):
            m = flat('tree_' + k, c, 0.75, noise=0.35)
            b = [n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]
            b.inputs['Subsurface Weight'].default_value = 0.0
            b.inputs['Transmission Weight'].default_value = 0.0
            _TREE_MATS[k] = m
    return _TREE_MATS


def _cards(B, rnd, ctr, rad, n, size, mats, flatz=0.0, squash=1.0, shell=0.6):
    """在椭球 ctr / rad（(rx, ry, rz)）内撒 n 片叶卡；shell 越大越贴外表面；flatz>0 让叶卡趋向水平（雪松层）。"""
    for _ in range(n):
        while True:
            v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            if v.length <= 1.0: break
        if v.length > 1e-3:
            v = v.normalized() * (v.length ** (1 - shell))
        p = Vector((ctr[0] + v.x * rad[0], ctr[1] + v.y * rad[1], ctr[2] + v.z * rad[2] * squash))
        nrm = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)) ) + v * 0.8 + Vector((0, 0, flatz))
        nrm = nrm.normalized() if nrm.length > 1e-4 else Vector((0, 0, 1))
        t = nrm.cross(Vector((0.3, 0.7, 0.1)).normalized()); t = t.normalized() if t.length > 1e-4 else Vector((1, 0, 0))
        w = nrm.cross(t)
        s = size * rnd.uniform(0.6, 1.3)
        a, b = t * s, w * s * rnd.uniform(0.5, 0.9)
        B.poly([tuple(p - a - b), tuple(p + a - b), tuple(p + a + b), tuple(p - a + b)], [(0, 1, 2, 3)], mats[rnd.randrange(len(mats))])


def tree(B, x, y, h, r, kind='oak', seed=0, z=0.0):
    """kind: 'oak'（不规则分叶簇的阔叶冠）/ 'cedar'（黎巴嫩雪松：水平分层）/ 'yew'（修剪紫杉圆锥）/ 'yew_col'（紫杉柱）"""
    import random as _r
    rnd = _r.Random(seed)
    M = tree_mats()
    bark = M['bark']
    if kind == 'oak':
        leaves = [M['leaf_a'], M['leaf_b'], M['leaf_c']]
        tz = h * rnd.uniform(0.3, 0.38)
        lean = (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4))
        B.tube([(x, y, z - 0.2), (x + lean[0] * 0.3, y + lean[1] * 0.3, z + tz * 0.5), (x + lean[0], y + lean[1], z + tz)], 0.28 * h / 10 + 0.12, bark, n=10)
        nl = rnd.randint(4, 6)
        for i in range(nl):   # 主枝 → 各自一个大叶簇，再分若干小簇
            a = i * math.tau / nl + rnd.uniform(-0.4, 0.4)
            d = r * rnd.uniform(0.45, 0.8)
            ez = z + h * rnd.uniform(0.55, 0.85)
            e = (x + d * math.cos(a), y + d * math.sin(a), ez)
            mid = (x + lean[0] + d * 0.45 * math.cos(a), y + lean[1] + d * 0.45 * math.sin(a), z + tz + (ez - z - tz) * 0.55)
            B.tube([(x + lean[0], y + lean[1], z + tz - 0.2), mid, e], 0.14 * h / 10 + 0.05, bark, n=6)
            for j in range(rnd.randint(3, 5)):
                cr = r * rnd.uniform(0.28, 0.42)
                c = (e[0] + rnd.uniform(-0.5, 0.5) * r * 0.5, e[1] + rnd.uniform(-0.5, 0.5) * r * 0.5, e[2] + rnd.uniform(-0.2, 0.5) * h * 0.2)
                _cards(B, rnd, c, (cr, cr, cr * 0.75), int(70 * (cr / 1.3) ** 2) + 25, 0.32 * max(1.0, r / 4), leaves, shell=0.7)
        _cards(B, rnd, (x, y, z + h * 0.88), (r * 0.45, r * 0.45, h * 0.12), 90, 0.32, leaves, shell=0.7)   # 冠顶
    elif kind == 'cedar':
        leaves = [M['conifer'], M['leaf_a']]
        B.tube([(x, y, z - 0.2), (x + 0.2, y, z + h * 0.5), (x - 0.1, y + 0.2, z + h * 0.95)], 0.35 * h / 12 + 0.1, bark, n=10)
        tiers = rnd.randint(4, 6)
        for k in range(tiers):
            f = k / (tiers - 1)
            tzk = z + h * (0.3 + 0.62 * f)
            for j in range(rnd.randint(2, 3) if k < tiers - 1 else 1):
                a = rnd.uniform(0, math.tau); d = r * (1 - 0.6 * f) * rnd.uniform(0.2, 0.5)
                cx_, cy_ = x + d * math.cos(a), y + d * math.sin(a)
                pr = r * (1 - 0.65 * f) * rnd.uniform(0.55, 0.8)
                B.tube([(x, y, tzk - 0.3), (cx_, cy_, tzk - 0.1)], 0.08, bark, n=5)
                _cards(B, rnd, (cx_, cy_, tzk), (pr, pr * rnd.uniform(0.7, 1.0), 0.35), int(55 * (pr / 1.5) ** 2) + 20, 0.4,
                       leaves, flatz=2.5, shell=0.3)
    else:   # 修剪紫杉：实心核 + 表面短叶卡
        col = kind == 'yew_col'
        prof = [(r, 0.0), (r * 1.02, h * 0.35), (r * 0.9, h * 0.75), (r * 0.55, h * 0.95), (0.05, h)] if col else \
               [(r, 0.0), (r * 0.78, h * 0.3), (r * 0.45, h * 0.7), (0.04, h)]
        B.lathe(x, y, z, [(pr_ * 0.97, dz) for (pr_, dz) in prof], M['yew'], n=14)
        for _ in range(int(420 * h * r) + 300):
            t = rnd.random() ** 0.8
            k = min(int(t * (len(prof) - 1)), len(prof) - 2)
            ft = t * (len(prof) - 1) - k
            rr = prof[k][0] + (prof[k + 1][0] - prof[k][0]) * ft
            zz = prof[k][1] + (prof[k + 1][1] - prof[k][1]) * ft
            a = rnd.uniform(0, math.tau)
            p = Vector((x + rr * math.cos(a), y + rr * math.sin(a), z + zz))
            nrm = Vector((math.cos(a), math.sin(a), 0.4)).normalized()
            tt = nrm.cross(Vector((0, 0, 1))).normalized(); w = nrm.cross(tt)
            s = 0.045
            B.poly([tuple(p - tt * s - w * s), tuple(p + tt * s - w * s), tuple(p + tt * s + w * s), tuple(p - tt * s + w * s)],
                   [(0, 1, 2, 3)], M['yew'])


# ---------------------------------------------------------------- 全息 / 灯箱（无文字：只有色块、渐变、扫描线）
def holo(name, c1, c2, estr=6.0, alpha=0.55, scan=2.5, scale=0.6):
    """半透明自发光面板：两色噪声渐变 + 世界 z 方向扫描线；alpha = 不透明度。
    2026-09-28：扫描线默认 6.0 → 2.5（band 太密，烘进 512/1024 贴图再过 JPEG + AgX 就被压成纯色，
    查看器里像没贴图的白块 / 粉条）；对 0.55 → 0.18、噪声 Detail 2 → 4，让图案在烘焙后仍可见。"""
    m = bpy.data.materials.new(name)
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 4
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    col = _mix(nt, tuple(c1), tuple(c2), nz.outputs[0])
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'Z'
    wv.inputs['Scale'].default_value = scan
    nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.18; mr.inputs['To Max'].default_value = 1.0
    nt.links.new(wv.outputs[0], mr.inputs['Value'])
    em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(col, em.inputs['Color'])
    ms = nt.nodes.new('ShaderNodeMath'); ms.operation = 'MULTIPLY'; ms.inputs[1].default_value = estr
    nt.links.new(mr.outputs[0], ms.inputs[0]); nt.links.new(ms.outputs[0], em.inputs['Strength'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = alpha
    nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs[0])
    return m


# ---------------------------------------------------------------- 警示条纹 / 线条屏 / 楼窗格（well7 起加；无文字）
def hazard(name, c1=(0.75, 0.52, 0.04), c2=(0.02, 0.02, 0.02), period=0.5, rough=0.55, wear=0.35):
    """斜向警示条纹漆（世界 x+y+z 方向交替两色），带噪声磨损露出底色。"""
    m, nt, b = new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs[0])
    def M(op, a, bb):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, bb)):
            if isinstance(v, float): n.inputs[i].default_value = v
            else: nt.links.new(v, n.inputs[i])
        return n.outputs[0]
    s = M('ADD', M('ADD', sep.outputs[0], sep.outputs[1]), sep.outputs[2])
    band = M('LESS_THAN', M('FRACT', M('MULTIPLY', s, 1.0 / period), 0.0), 0.5)
    col = _mix(nt, tuple(c2), tuple(c1), band)
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0; nz.inputs['Detail'].default_value = 8
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.62; mr.inputs['From Max'].default_value = 0.7
    mr.inputs['To Max'].default_value = wear
    nt.links.new(nz.outputs[0], mr.inputs['Value'])
    col = _mix(nt, col, (0.12, 0.11, 0.1), mr.outputs[0])
    nt.links.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    return m


def line_screen(name, c=(0.2, 1.0, 0.45), estr=4.0, scale=38.0):
    """终端屏：暗底上的抽象水平亮线（波纹带 + 噪声断续），没有任何字符。"""
    m, nt, b = new_mat(name)
    b.inputs['Base Color'].default_value = (0.01, 0.02, 0.012, 1); b.inputs['Roughness'].default_value = 0.12
    tc = nt.nodes.new('ShaderNodeTexCoord')
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'Z'
    wv.inputs['Scale'].default_value = scale; wv.inputs['Distortion'].default_value = 0.0
    nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    th = nt.nodes.new('ShaderNodeMath'); th.operation = 'GREATER_THAN'; th.inputs[1].default_value = 0.8
    nt.links.new(wv.outputs[1], th.inputs[0])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 9.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.42
    nt.links.new(nz.outputs[0], gt.inputs[0])
    mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'
    nt.links.new(th.outputs[0], mu.inputs[0]); nt.links.new(gt.outputs[0], mu.inputs[1])
    ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'MULTIPLY_ADD'; ad.inputs[1].default_value = estr; ad.inputs[2].default_value = 0.25
    nt.links.new(mu.outputs[0], ad.inputs[0])
    b.inputs['Emission Color'].default_value = (*c, 1)
    nt.links.new(ad.outputs[0], b.inputs['Emission Strength'])
    return m


def window_grid(name, wall=(0.06, 0.065, 0.07), lit=(1.0, 0.78, 0.5), estr=3.0, cell=(3.0, 3.2), seed=0.0):
    """远景楼体立面：世界坐标砖块纹理当窗格，随机一部分亮着（无字、无招牌）。"""
    m, nt, b = new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / cell[0], 1 / cell[0], 1 / cell[1])
    mp.inputs['Location'].default_value = (seed, seed, 0)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    br = nt.nodes.new('ShaderNodeTexBrick'); br.offset = 0.0
    br.inputs['Scale'].default_value = 1.0; br.inputs['Mortar Size'].default_value = 0.3
    br.inputs['Brick Width'].default_value = 1.0; br.inputs['Row Height'].default_value = 1.0
    br.inputs['Color1'].default_value = (1, 1, 1, 1); br.inputs['Color2'].default_value = (0, 0, 0, 1)
    br.inputs['Mortar'].default_value = (0, 0, 0, 1)
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(mp.outputs[0], sep.inputs[0])
    cm = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(sep.outputs[0], cm.inputs[0]); nt.links.new(sep.outputs[2], cm.inputs[1])
    ad = nt.nodes.new('ShaderNodeVectorMath'); ad.operation = 'ADD'
    nt.links.new(cm.outputs[0], ad.inputs[0])
    sep2 = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(mp.outputs[0], sep2.inputs[0])
    cm2 = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(sep2.outputs[1], cm2.inputs[0])
    nt.links.new(cm2.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], br.inputs['Vector'])
    wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'
    fl = nt.nodes.new('ShaderNodeVectorMath'); fl.operation = 'FLOOR'
    nt.links.new(ad.outputs[0], fl.inputs[0]); nt.links.new(fl.outputs[0], wn.inputs['Vector'])
    on = nt.nodes.new('ShaderNodeMath'); on.operation = 'GREATER_THAN'; on.inputs[1].default_value = 0.62
    nt.links.new(wn.outputs['Value'], on.inputs[0])
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
    nt.links.new(br.outputs['Fac'], inv.inputs[1])   # Fac = 窗框（灰缝）；取反 = 窗洞
    mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'
    nt.links.new(inv.outputs[0], mu.inputs[0]); nt.links.new(on.outputs[0], mu.inputs[1])
    b.inputs['Base Color'].default_value = (*wall, 1); b.inputs['Roughness'].default_value = 0.6
    b.inputs['Emission Color'].default_value = (*lit, 1)
    es = nt.nodes.new('ShaderNodeMath'); es.operation = 'MULTIPLY'; es.inputs[1].default_value = estr
    nt.links.new(mu.outputs[0], es.inputs[0]); nt.links.new(es.outputs[0], b.inputs['Emission Strength'])
    return m


# ---------------------------------------------------------------- 地形网格 / 程序化岩石（highland 等自然地形用）
def grid(B, rows, m, flip=False, keep=None, smooth=True):
    """rows[j][i] = (x, y, z) 的结构化网格，共享顶点；默认绕序 (i,j)→(i+1,j)→(i+1,j+1)→(i,j+1)。
    keep(i, j, verts) → False 时跳过该四边形；flip 反转法向。"""
    idx = B.mi(m)
    bm = B.bm
    V = [[bm.verts.new(p) for p in r] for r in rows]
    for j in range(len(rows) - 1):
        for i in range(len(rows[j]) - 1):
            q = [V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]]
            if keep is not None and not keep(i, j, q):
                continue
            if flip:
                q.reverse()
            try:
                f = bm.faces.new(q)
            except ValueError:
                continue
            f.material_index = idx; f.smooth = smooth


def rock(B, x, y, z, r, m, seed=0, seg=9, rings=6, sz=0.7, rough=0.35, facet=0.0, rz=0.0):
    """噪声扰动的低面数石块（底部略埋入地面）。facet>0 → 棱角更硬（碎石、破裂岩块）。"""
    import random as _r
    from mathutils import noise as _n
    rnd = _r.Random(seed)
    off = Vector((rnd.uniform(0, 100), rnd.uniform(0, 100), rnd.uniform(0, 100)))
    sx, sy = rnd.uniform(0.75, 1.25), rnd.uniform(0.75, 1.25)
    rot = Matrix.Rotation(rz or rnd.uniform(0, math.tau), 3, 'Z')
    vs = []
    for k in range(rings + 1):
        th = math.pi * k / rings
        for i in range(seg):
            ph = math.tau * i / seg + (0.5 * math.tau / seg if k % 2 else 0)
            d = Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
            n = _n.noise(d * 1.3 + off) * rough + _n.noise(d * 3.1 + off) * rough * 0.4
            if facet:
                n += (rnd.random() - 0.5) * facet
            rr = r * (1 + n)
            p = rot @ Vector((d.x * rr * sx, d.y * rr * sy, d.z * rr * sz))
            if p.z < -r * 0.25 * sz:
                p.z = -r * 0.25 * sz
            vs.append((x + p.x, y + p.y, z + p.z))
    fs = []
    for k in range(rings):
        for i in range(seg):
            a, b = k * seg + i, k * seg + (i + 1) % seg
            fs.append((a, a + seg, b + seg, b))
    return B.poly(vs, fs, m, smooth=facet == 0)


# ---------------------------------------------------------------- 程序化方整石（civic_core 起加）
def ashlar(name, c=(0.62, 0.62, 0.6), course=0.75, block=1.6, joint=0.012, jc=(0.3, 0.3, 0.3), var=0.06,
           rough=0.75, rustic=0.0):
    """世界坐标方整石砌：错缝砖纹（u = x+y，v = z），灰缝细、石块间微色差；rustic>0 → 灰缝加深并加凹凸（粗面石）。"""
    m, nt, b = new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs[0])
    ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'ADD'
    nt.links.new(sep.outputs[0], ad.inputs[0]); nt.links.new(sep.outputs[1], ad.inputs[1])
    cm = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(ad.outputs[0], cm.inputs[0]); nt.links.new(sep.outputs[2], cm.inputs[1])
    br = nt.nodes.new('ShaderNodeTexBrick'); br.offset = 0.5; br.offset_frequency = 2
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Brick Width'].default_value = block; br.inputs['Row Height'].default_value = course
    br.inputs['Mortar Size'].default_value = joint + rustic * 0.03
    br.inputs['Mortar Smooth'].default_value = 0.3
    br.inputs['Color1'].default_value = (*[x * (1 + var) for x in c], 1)
    br.inputs['Color2'].default_value = (*[x * (1 - var) for x in c], 1)
    br.inputs['Mortar'].default_value = (*jc, 1)
    nt.links.new(cm.outputs[0], br.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.5; nz.inputs['Detail'].default_value = 8
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.85; mr.inputs['To Max'].default_value = 1.08
    nt.links.new(nz.outputs[0], mr.inputs['Value'])
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    nt.links.new(br.outputs['Color'], mul.inputs[6])
    cc = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3):
        nt.links.new(mr.outputs[0], cc.inputs[i])
    nt.links.new(cc.outputs[0], mul.inputs[7])
    nt.links.new(mul.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35 + rustic * 0.5
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
    nt.links.new(br.outputs['Fac'], inv.inputs[1])
    h = inv.outputs[0]
    if rustic:
        hm = nt.nodes.new('ShaderNodeMath'); hm.operation = 'MULTIPLY_ADD'; hm.inputs[2].default_value = 0.0
        nt.links.new(inv.outputs[0], hm.inputs[0]); nt.links.new(nz.outputs[0], hm.inputs[1])
        h = hm.outputs[0]
    nt.links.new(h, bump.inputs['Height']); nt.links.new(bump.outputs[0], b.inputs['Normal'])
    return m


def clear_glass(name, tint=(0.85, 0.9, 0.92), rough=0.02):
    """透明大厅玻璃（真透射，可看到厅内）；只用于能看进去的门厅幕墙。"""
    m, nt, b = new_mat(name)
    b.inputs['Base Color'].default_value = (*tint, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Transmission Weight'].default_value = 1.0
    b.inputs['IOR'].default_value = 1.45
    return m


def tree_fine(B, x, y, h, r, seed=0, z=0.0, n=520, size=0.16):
    """细叶行道树：主干 + 3–4 根主枝 + 若干小叶卡簇（叶卡比 tree() 小、数量适中，适合近景且三角面省）"""
    import random as _r
    rnd = _r.Random(seed)
    M = tree_mats()
    leaves = [M['leaf_a'], M['leaf_b'], M['leaf_c']]
    tz = h * 0.4
    B.tube([(x, y, z - 0.2), (x, y, z + tz)], 0.1 + h * 0.015, M['bark'], n=7)
    k = rnd.randint(3, 4)
    per = n // (k + 1)
    for i in range(k):
        a = i * math.tau / k + rnd.uniform(-0.3, 0.3)
        e = (x + r * 0.5 * math.cos(a), y + r * 0.5 * math.sin(a), z + h * rnd.uniform(0.6, 0.72))
        B.tube([(x, y, z + tz - 0.2), e], 0.06 + h * 0.006, M['bark'], n=5)
        _cards(B, rnd, e, (r * 0.55, r * 0.55, r * 0.45), per, size, leaves, shell=0.75)
    _cards(B, rnd, (x, y, z + h * 0.8), (r * 0.6, r * 0.6, h * 0.2), per, size, leaves, shell=0.75)


# ================================================================ 魔导科技（2088：以太魔法与科技并行，card-digest L28 / L32）
# 上层浮岛共用：以太悬浮核心、符文环、导能脉、能量晶簇、结界六角格边、停靠信标、悬浮轨道、气候场环。
# 坐标单位由调用方决定（地标模型用米，上层底图用 100 m）：尺寸参数一律按调用方单位给。中立：无文字、无徽记。
AETHER_C = (0.55, 0.88, 1.0)


def glow(name, c=AETHER_C, estr=6.0, alpha=1.0):
    """自发光材质；alpha < 1 时半透明（结界、场环），不投影由调用方对物体设 visible_shadow = False。"""
    m, nt, b = new_mat(name)
    b.inputs['Base Color'].default_value = (*c, 1)
    b.inputs['Emission Color'].default_value = (*c, 1); b.inputs['Emission Strength'].default_value = estr
    b.inputs['Alpha'].default_value = alpha
    if alpha < 1 and hasattr(m, 'blend_method'): m.blend_method = 'BLEND'
    return m


def hex_ward_mat(name='ward_hex', c=AETHER_C, estr=2.5, alpha=0.5, scale=40.0):
    """结界：六角格线（Voronoi 距离边 → 细线）+ 其余全透明；对象坐标缩放 scale。"""
    m, nt, b = new_mat(name)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.feature = 'DISTANCE_TO_EDGE'; vo.inputs['Scale'].default_value = scale
    vo.inputs['Randomness'].default_value = 0.0
    nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 0.06
    mr.inputs['To Min'].default_value = alpha; mr.inputs['To Max'].default_value = 0.0
    nt.links.new(vo.outputs['Distance'], mr.inputs['Value'])
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*c, 1); em.inputs['Strength'].default_value = estr
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(mr.outputs['Result'], mx.inputs['Fac']); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    if hasattr(m, 'blend_method'): m.blend_method = 'BLEND'
    return m


def ring_pts(cx, cy, rfun, n=96, s=1.0):
    """rfun(角度) → 半径；返回闭合轮廓点"""
    return [(cx + math.cos(a) * rfun(a) * s, cy + math.sin(a) * rfun(a) * s) for a in (i * math.tau / n for i in range(n))]


def rune_ring(B, pts, z, w, m, dash=3):
    """符文环：沿轮廓的发光虚线（每 dash 段亮 2 段），比岛缘略外一圈，俯视可读"""
    n = len(pts)
    for i in range(n):
        if i % dash == dash - 1: continue
        (xa, ya), (xb, yb) = pts[i], pts[(i + 1) % n]
        B.strip([(xa, ya, z), (xb, yb, z)], w, w * 0.5, m)


def hex_ward(B, pts, z0, h, m):
    """结界边：沿岛缘立起的一圈六角格光墙（上沿向内收 12 %，成低矮穹边）"""
    n = len(pts); cx = sum(p[0] for p in pts) / n; cy = sum(p[1] for p in pts) / n
    top = [(cx + (x - cx) * 0.88, cy + (y - cy) * 0.88) for x, y in pts]
    vs = [(x, y, z0) for x, y in pts] + [(x, y, z0 + h) for x, y in top]
    B.poly(vs, [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)], m)


def aether_core(B, x, y, z, r, m_rock, m_glow, m_ring, seed=0):
    """岛底以太悬浮核心：倒悬岩锥里嵌一颗发光核 + 两圈符文环 + 向上的导能脉"""
    import random as _r
    rnd = _r.Random(seed)
    B.cyl(x, y, z - r * 2.2, r * 0.9, r * 2.2, m_rock, 10, r2=r * 0.25, smooth=False)
    B.sphere(x, y, z - r * 2.4, r * 0.55, m_glow, seg=16, rings=8)
    for k, rr in enumerate((r * 0.95, r * 1.25)):
        B.cyl(x, y, z - r * (2.3 + 0.35 * k), rr, r * 0.06, m_ring, 32, r2=rr, cap=False)
    for k in range(5):
        a = rnd.uniform(0, math.tau)
        B.tube([(x + math.cos(a) * r * 0.4, y + math.sin(a) * r * 0.4, z - r * 2.0), (x + math.cos(a) * r * 1.4, y + math.sin(a) * r * 1.4, z - r * 0.2)], r * 0.035, m_glow, n=6)


def crystal_cluster(B, x, y, z, s, m, seed=0, down=False):
    """能量晶簇：5–9 根六棱锥，朝外斜伸（down=True 时从岩底向下）"""
    import random as _r
    rnd = _r.Random(seed); sg = -1 if down else 1
    for k in range(rnd.randint(5, 9)):
        a = rnd.uniform(0, math.tau); t = rnd.uniform(0.2, 0.6); L = s * rnd.uniform(0.6, 1.4); rr = s * rnd.uniform(0.1, 0.18)
        bx, by = x + math.cos(a) * s * 0.25, y + math.sin(a) * s * 0.25
        tip = (bx + math.cos(a) * L * t, by + math.sin(a) * L * t, z + sg * L)
        base = [(bx + rr * math.cos(i * math.tau / 6), by + rr * math.sin(i * math.tau / 6), z) for i in range(6)]
        B.poly(base + [tip], [(i, (i + 1) % 6, 6) if not down else ((i + 1) % 6, i, 6) for i in range(6)], m)


def beacon_ring(B, x, y, z, r, m, n=8, s=None):
    """停靠平台引导信标：一圈发光短柱 + 一条外侧光环"""
    s = s or r * 0.06
    for k in range(n):
        a = k * math.tau / n
        B.cyl(x + math.cos(a) * r, y + math.sin(a) * r, z, s, s * 3, m, 8)
    B.cyl(x, y, z, r * 1.08, s * 0.4, m, 48, r2=r * 1.08, cap=False)


def light_rail(B, p0, p1, z0, z1, w, m_rail, m_node, sag=0.0, n=24, gap=None):
    """悬浮轨道 / 导能管（card-digest L12 有悬浮轨道）：两条平行发光轨 + 每隔一段一个悬浮环节点"""
    gap = gap or w * 3
    (x0, y0), (x1, y1) = p0, p1; L = math.hypot(x1 - x0, y1 - y0) or 1; nx, ny = -(y1 - y0) / L, (x1 - x0) / L
    for o in (-gap / 2, gap / 2):
        pts = []
        for i in range(n + 1):
            t = i / n; z = z0 + (z1 - z0) * t - sag * 4 * t * (1 - t)
            pts.append((x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o, z))
        B.strip(pts, w, w * 0.5, m_rail)
    for i in range(1, n, 4):
        t = i / n; z = z0 + (z1 - z0) * t - sag * 4 * t * (1 - t)
        B.cyl(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z - w, gap * 0.9, w * 0.8, m_node, 24, r2=gap * 0.9, cap=False)


def field_rings(B, x, y, z, radii, w, m):
    """以太场：同心发光细环（气候调节塔向外放场）"""
    for r in radii:
        B.cyl(x, y, z, r, w * 0.3, m, 96, r2=r, cap=False)
        B.cyl(x, y, z, r - w / 2, w * 0.1, m, 96, r2=r + w / 2, cap=False)


def conduit(B, p0, p1, z0, z1, r, m_pipe, m_node, n=20, sag=0.0):
    """以太导能管（只输能，不载人）：暗色细管 + 每隔几段一个点状微光节点"""
    (x0, y0), (x1, y1) = p0, p1
    pts = [(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t - sag * 4 * t * (1 - t)) for t in (i / n for i in range(n + 1))]
    B.tube(pts, r, m_pipe, n=8)
    for p in pts[2:-2:3]: B.sphere(p[0], p[1], p[2], r * 1.8, m_node, seg=10, rings=6)
