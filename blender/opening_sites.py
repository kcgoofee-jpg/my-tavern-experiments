# 开局地点的简易地图（v0.9.6）：大骑士领·圣都、原域（城区 / 诸神殿两层）、旷野高地、圆桌第二 / 三 / 四席封地。
# 程序生成的体块草模（地形 + 几座地标体块 + 道路 + 树），正俯视正交相机，与天城各层同一种取景方式；低采样，快出图。
# 用法：blender -b -P blender/opening_sites.py -- --site kavalierki [--res 4000] [--samples 24] [--out map/art/site_kavalierki_full.png] [--data-only]
# 坐标：每张图用归一化平面坐标 (u, v)，u 向右、v 向下，0…1；场景里 1 单位 = 图宽 / 40。
# 地标位置、形制绝大多数是仓库推断（卡只给了名字与少量描述），标记数据写到 map/data/site_<id>.json（nx / ny = u / v）。
import bpy, bmesh, math, os, sys, json, random

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {}; i = 0
while i < len(argv):
    if i + 1 < len(argv) and not argv[i + 1].startswith('--'): opt[argv[i]] = argv[i + 1]; i += 2
    else: opt[argv[i]] = True; i += 1
SITE = opt.get('--site', 'kavalierki'); RES = int(opt.get('--res', 4000)); SAMPLES = int(opt.get('--samples', 24))
OUT = os.path.abspath(opt.get('--out', os.path.join(ROOT, 'map', 'art', f'site_{SITE}_full.png')))
ASP = .625; W = 40.0; H = W * ASP
R = random.Random(hash(SITE) & 0xffff)

def P(u, v, z=0.0): return ((u - .5) * W, (.5 - v) * H, z)
def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)

# ---------------- 场景 ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
MATS = {}
def mat(name, col, rough=.8, metal=0.0, alpha=1.0, emit=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb(col), 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try: m.blend_method = 'BLEND'
        except Exception: pass
    if emit:
        b.inputs['Emission Color'].default_value = (*srgb(col), 1); b.inputs['Emission Strength'].default_value = emit
    MATS[name] = m; return m

class Batch:
    """同一材质的体块合成一个网格（几千个小体块也快）。"""
    def __init__(s): s.bm = {}
    def get(s, m):
        if m not in s.bm: s.bm[m] = bmesh.new()
        return s.bm[m]
    def box(s, m, u, v, w, d, h, z=0.0, rot=0.0):
        bm = s.get(m); r = bmesh.ops.create_cube(bm, size=1)['verts']
        for q in r:
            x, y, zz = q.co.x * w * W, q.co.y * d * W, (q.co.z + .5) * h
            c, sn = math.cos(rot), math.sin(rot); cx, cy, _ = P(u, v)
            q.co = (cx + x * c - y * sn, cy + x * sn + y * c, z + zz)
    def cyl(s, m, u, v, r, h, z=0.0, seg=24, r2=None):
        bm = s.get(m); cx, cy, _ = P(u, v)
        g = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r * W, radius2=(r if r2 is None else r2) * W, depth=h)['verts']
        for q in g: q.co = (q.co.x + cx, q.co.y + cy, q.co.z + z + h / 2)
    def dome(s, m, u, v, r, z=0.0, squash=1.0):
        bm = s.get(m); cx, cy, _ = P(u, v)
        g = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=r * W)['verts']
        for q in g: q.co = (q.co.x + cx, q.co.y + cy, max(0, q.co.z) * squash + z)
    def blob(s, m, u, v, r, z=0.0, h=None):
        bm = s.get(m); cx, cy, _ = P(u, v)
        g = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r * W)['verts']
        for q in g: q.co = (q.co.x + cx, q.co.y + cy, q.co.z * ((h or r * W) / (r * W)) + z + (h or r * W) * .6)
    def ring(s, m, u, v, r, t, h, z=0.0, seg=96, ry=None):
        bm = s.get(m); cx, cy, _ = P(u, v); ry = r if ry is None else ry; vs = []
        for k in range(seg):
            a = 2 * math.pi * k / seg; row = []
            for rr in (1 - t / r, 1.0):
                for zz in (z, z + h): row.append(bm.verts.new((cx + math.cos(a) * r * W * rr, cy + math.sin(a) * ry * W * rr, zz)))
            vs.append(row)
        for k in range(seg):
            a, b = vs[k], vs[(k + 1) % seg]
            for i0, i1 in ((0, 1), (2, 3), (1, 3), (0, 2)): bm.faces.new((a[i0], b[i0], b[i1], a[i1]))
    def road(s, m, pts, w, z=.03):
        fine = []
        for (u0, v0), (u1, v1) in zip(pts, pts[1:]):
            n = max(1, int(math.hypot(u1 - u0, v1 - v0) / .006))
            fine += [(u0 + (u1 - u0) * k / n, v0 + (v1 - v0) * k / n) for k in range(n)]
        fine.append(pts[-1]); pts = fine
        for (u0, v0), (u1, v1) in zip(pts, pts[1:]):
            x0, y0, _ = P(u0, v0); x1, y1, _ = P(u1, v1); L = math.hypot(x1 - x0, y1 - y0)
            if L < 1e-6: continue
            s.box(m, (u0 + u1) / 2, (v0 + v1) / 2, (L / W) + w * .6, w, .01, z=zg((u0 + u1) / 2, (v0 + v1) / 2) + z, rot=math.atan2(y1 - y0, x1 - x0))
    def flush(s):
        for m, bm in s.bm.items():
            me = bpy.data.meshes.new(m.name); bm.to_mesh(me); bm.free(); me.materials.append(m)
            o = bpy.data.objects.new(m.name, me); sc.collection.objects.link(o)
        s.bm = {}

B = Batch()
TERRAIN = {'h': lambda u, v: 0.0, 'c': lambda u, v, z: '#6f8a4a'}
def zg(u, v): return TERRAIN['h'](u, v)
def terrain(nx=240):
    ny = int(nx * ASP); me = bpy.data.meshes.new('terrain'); bm = bmesh.new(); vs = []
    col = bm.loops.layers.color.new('Col')
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u, v = -.05 + 1.1 * i / nx, -.05 + 1.1 * j / ny; row.append(bm.verts.new(P(u, v, zg(u, v))))
        vs.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
            for l in f.loops:
                x, y, z = l.vert.co; u, v = x / W + .5, .5 - y / H
                l[col] = (*srgb(TERRAIN['c'](u, v, z)), 1)
    bm.to_mesh(me); bm.free()
    m = bpy.data.materials.new('ground'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'; nt.links.new(a.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = .95
    me.materials.append(m); o = bpy.data.objects.new('terrain', me); sc.collection.objects.link(o)
    for p in me.polygons: p.use_smooth = True

def _h(x, y, sd):
    h = (x * 374761393 + y * 668265263 + sd * 1442695041) & 0xffffffff; h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffff) / 65535.0
def _vn(x, y, sd):
    xi, yi = math.floor(x), math.floor(y); fx, fy = x - xi, y - yi; sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = _h(xi, yi, sd), _h(xi + 1, yi, sd), _h(xi, yi + 1, sd), _h(xi + 1, yi + 1, sd)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
def noise(u, v, s=1.0, seed=0):
    """值噪声 fbm，约 -1…1（没有正弦条纹）"""
    sd = int(seed * 97) + 7; t = 0.0; amp = 1.0; f = 4.0 * s; tot = 0.0
    for o in range(4): t += amp * _vn(u * f, v * f * ASP, sd + o); tot += amp; amp *= .5; f *= 2.1
    return (t / tot - .5) * 2.6
def mix(a, b, t):
    t = min(1, max(0, t)); A, Bc = [int(a[i:i + 2], 16) for i in (1, 3, 5)], [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(round(x + (y - x) * t) for x, y in zip(A, Bc))
def trees(n, ok, r=(.004, .007), cols=('#3d5a2a', '#4a6b30', '#35502a')):
    for _ in range(n):
        u, v = R.random(), R.random()
        if not ok(u, v): continue
        rr = R.uniform(*r); B.blob(mat('tree' + str(_ % 3), cols[_ % len(cols)], .9), u, v, rr, z=zg(u, v))
def houses(n, ok, size=(.004, .009), cols=('#b9a58a', '#a8876a', '#8f7f70'), roof=None, hmax=.4, box=(0, 0, 1, 1)):
    for k in range(n):
        u, v = R.uniform(box[0], box[2]), R.uniform(box[1], box[3])
        if not ok(u, v): continue
        w, d = R.uniform(*size), R.uniform(*size); B.box(mat('house' + str(k % len(cols)), cols[k % len(cols)], .85), u, v, w, d, R.uniform(.12, hmax), z=zg(u, v), rot=R.uniform(0, math.pi))
MK = []   # 标记 [(id, u, v, r)]
def mk(i, u, v, r=.03): MK.append((i, round(u, 4), round(v, 4), r))

# ---------------- 各地点 ----------------
def site_kavalierki():
    """大骑士领·圣都：三环（荣光冠冕 / 竞赛与狂欢回廊 / 铁锈与落败领）+ 以太穹顶。环的半径、地标位置均为推断。"""
    C = (.5, .5); d = lambda u, v: math.hypot((u - C[0]), (v - C[1]) * ASP)
    TERRAIN['h'] = lambda u, v: .15 * noise(u, v, .6) + (-.6 if abs(v - .18 - .06 * math.sin(u * 7)) < .012 else 0)
    def gcol(u, v, z):
        r = d(u, v); n = noise(u, v, 2)
        if abs(v - .18 - .06 * math.sin(u * 7)) < .014: return '#3b5566'
        if r < .12: return mix('#b8b2a6', '#cfc8ba', n)
        if r < .25: return mix('#9c9384', '#b0a592', n)
        if r < .37: return mix('#7d6a55', '#6e604f', n)
        return mix('#5f7a3c', '#4d6a33', n + .3)
    TERRAIN['c'] = gcol; terrain()
    B.ring(mat('wall', '#8b8174', .8), .5, .5, .37, .006, .6, ry=.37)
    B.ring(mat('wall2', '#a79c8a', .8), .5, .5, .25, .004, .4)
    B.ring(mat('wall3', '#d2c9b8', .7), .5, .5, .12, .003, .35)
    road = mat('road', '#5e5850', .9)
    for k in range(8):
        a = k * math.pi / 4 + .2; B.road(road, [(.5 + math.cos(a) * .02, .5 + math.sin(a) * .02 / ASP), (.5 + math.cos(a) * .48, .5 + math.sin(a) * .48 / ASP)], .004)
    for r in (.18, .31):
        B.road(road, [(.5 + math.cos(t / 60 * 2 * math.pi) * r, .5 + math.sin(t / 60 * 2 * math.pi) * r / ASP) for t in range(61)], .003)
    B.road(mat('bridge', '#6d665c'), [(.36, .1), (.36, .26)], .005)
    # 核心区：商业联合会联合大厦（高塔）、太阳骑士大竞技场（容 30 万人：巨型椭圆）、圆桌骑士议事殿（圆殿）、顶级会所
    B.ring(mat('arena', '#d9d2c2', .6), .45, .53, .05, .02, 1.6, ry=.036 / ASP); B.box(mat('field', '#6a9a48', .9), .45, .53, .045, .03, .02)
    B.cyl(mat('tower', '#9fb3c4', .25, .6), .56, .45, .01, 4.0, seg=8); B.cyl(mat('tower', '#9fb3c4'), .56, .45, .006, 1.2, z=4.0, seg=8, r2=.002)
    B.cyl(mat('hall', '#e0d6bf', .6), .54, .58, .018, .8); B.dome(mat('roofg', '#b89a52', .35, .7), .54, .58, .018, z=.8, squash=.5)
    for k in range(5): B.cyl(mat('seat', '#8a2f2f', .6), .54 + math.cos(k * 1.2566) * .01, .58 + math.sin(k * 1.2566) * .01 / ASP, .002, .2, z=.8)
    for k, (u, v) in enumerate([(.6, .52), (.61, .56), (.62, .5)]): B.box(mat('club', '#c9b58f', .5), u, v, .012, .01, .7 + k * .1)
    houses(900, lambda u, v: .03 < d(u, v) < .115 and not (abs(u - .45) < .06 and abs(v - .53) < .07) and not (abs(u - .56) < .025 and abs(v - .45) < .04) and not (abs(u - .54) < .03 and abs(v - .58) < .05) and not (u > .59 and abs(v - .53) < .05), (.004, .008), ('#e3dccd', '#cfc3ab', '#d8cfc0'), hmax=1.2)
    # 以太穹顶（半透明，俯视只看得到一圈反光）
    B.dome(mat('ether', '#bfe8ff', .05, 0, alpha=.12), .5, .5, .12, z=0, squash=.35)
    # 中环：竞赛与狂欢回廊——许多小竞技场、赛道
    for k in range(10):
        a = k * 2 * math.pi / 10 + .3; u, v = .5 + math.cos(a) * .185, .5 + math.sin(a) * .185 / ASP
        B.ring(mat('arena2', '#c8b99a', .7), u, v, .014, .005, .5, ry=.01 / ASP); B.box(mat('field2', '#7da352', .9), u, v, .02, .014, .02)
    houses(1500, lambda u, v: .125 < d(u, v) < .245, (.004, .009), ('#b7a68b', '#a99378', '#c2b193', '#9a3b3b'), hmax=.8)
    # 外环：铁锈与落败领——铁皮棚屋、清算转运站（编组场）、独立骑士营地（帐篷）、临光家族外城驻所
    houses(1600, lambda u, v: .255 < d(u, v) < .36, (.003, .007), ('#7c5a3f', '#6b5646', '#8a6a4a', '#5d5750'), hmax=.3)
    for k in range(9): B.road(mat('rail', '#3a3430', .6, .5), [(.2, .69 + k * .006), (.33, .72 + k * .006)], .0015)
    for k in range(14): B.box(mat('crate', '#8f4a2a', .7), .23 + (k % 7) * .014, .7 + (k // 7) * .03, .01, .004, .15)
    for k in range(30): B.cyl(mat('tent', '#d8cfae', .9), .72 + (k % 6) * .012, .74 + (k // 6) * .012, .004, .12, seg=6, r2=.0005)
    B.box(mat('linguang', '#e0d8c4', .6), .3, .3, .03, .022, .5); B.box(mat('linguangr', '#3f5b7a', .5), .3, .3, .018, .012, .9)
    trees(5000, lambda u, v: d(u, v) > .38 and abs(v - .18 - .06 * math.sin(u * 7)) > .02)
    mk('glory_crown', .52, .52, .12); mk('union_tower', .56, .45, .02); mk('sun_arena', .45, .53, .05); mk('round_table_hall', .54, .58, .02)
    mk('elite_club', .61, .52, .02); mk('contest_corridor', .5 + .185, .5 - .02, .06); mk('rust_outskirts', .8, .5, .06)
    mk('clearing_depot', .27, .72, .04); mk('free_knight_camp', .75, .77, .04); mk('linguang_post', .3, .3, .03); mk('ether_dome', .5, .5 - .1 / ASP, .02)

def yuanyu_common(tier):
    C = (.5, .5); d = lambda u, v: math.hypot((u - C[0]), (v - C[1]) * ASP)
    if tier == 'city':
        TERRAIN['h'] = lambda u, v: .3 * noise(u, v, .5, 3)
        TERRAIN['c'] = lambda u, v, z: mix('#8c8578', '#a19887', noise(u, v, 3)) if d(u, v) < .36 else mix('#6a7050', '#58603f', noise(u, v, 2, 5) + .4)
        terrain()
        road = mat('road', '#4f4a44', .9)
        for k in range(12):
            a = k * math.pi / 6; B.road(road, [(.5 + math.cos(a) * .1, .5 + math.sin(a) * .1 / ASP), (.5 + math.cos(a) * .47, .5 + math.sin(a) * .47 / ASP)], .003)
        for r in (.1, .2, .3): B.road(road, [(.5 + math.cos(t / 72 * 2 * math.pi) * r, .5 + math.sin(t / 72 * 2 * math.pi) * r / ASP) for t in range(73)], .003)
        B.cyl(mat('plaza', '#c9c1b0', .7), .5, .5, .09, .4, z=zg(.5, .5) - .3, seg=64)                  # 圣山正下方的朝圣广场（推断）
        # 哥特式尖塔、巴洛克穹顶
        for k in range(260):
            u, v = R.random(), R.random()
            if not (.1 < d(u, v) < .35): continue
            B.box(mat('stone', '#8d8274', .8), u, v, .006, .004, .6); B.cyl(mat('spire', '#4b4a55', .5), u, v, .002, 1.2, z=.6, seg=6, r2=0)
        for k in range(40):
            u, v = R.random(), R.random()
            if not (.1 < d(u, v) < .33): continue
            B.cyl(mat('drum', '#c7bca6', .6), u, v, .008, .4); B.dome(mat('dome', '#6e8c86', .4, .5), u, v, .008, z=.4)
        houses(2600, lambda u, v: .1 < d(u, v) < .35, (.003, .007), ('#a89a86', '#998c7a', '#b6a996', '#6d5f55'), hmax=.5)
        trees(3000, lambda u, v: d(u, v) > .37)
        B.ring(mat('wall', '#7d7468', .8), .5, .5, .355, .004, .5)
        mk('pilgrim_plaza', .5, .5, .09); mk('spire_quarter', .38, .4, .08); mk('dome_quarter', .63, .62, .08); mk('city_gate', .5 + .355, .5, .02)
    else:
        # 诸神殿：悬浮圣山在云雾之上；下方城区隐在以太薄雾里
        TERRAIN['h'] = lambda u, v: -2.0
        TERRAIN['c'] = lambda u, v, z: mix('#d6dde4', '#e8ecf0', noise(u, v, 2, 9) * .5 + .5)
        terrain(120)
        mtn = lambda u, v: max(0, 1 - (d(u, v) / .2) ** 2)
        me = bpy.data.meshes.new('mtn'); bm = bmesh.new(); N = 140; vs = []
        for j in range(N + 1):
            row = []
            for i in range(N + 1):
                u, v = .25 + .5 * i / N, .5 - .25 / ASP + .5 / ASP * j / N; h = mtn(u, v)
                ed = d(u, v) / .2; rim = 1 + .12 * noise(u, v, 4, 2)
                z = (1.2 + 3.5 * h ** .7 + .35 * noise(u, v, 3, 5)) if ed < rim else -3.0
                row.append(bm.verts.new(P(u, v, z)))
            vs.append(row)
        for j in range(N):
            for i in range(N): bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
        bm.to_mesh(me); bm.free(); me.materials.append(mat('rock', '#7a7466', .9)); o = bpy.data.objects.new('mtn', me); sc.collection.objects.link(o)
        for p in me.polygons: p.use_smooth = True
        B.cyl(mat('temple', '#ece6d6', .5), .5, .5, .03, .9, z=4.4, seg=32); B.dome(mat('gold', '#c8a24a', .3, .8), .5, .5, .026, z=5.3, squash=.7)
        for k in range(8):
            a = k * math.pi / 4; u, v = .5 + math.cos(a) * .075, .5 + math.sin(a) * .075 / ASP
            B.box(mat('shrine', '#ddd4c0', .6), u, v, .012, .012, .5, z=4.0 - .6 * (d(u, v) / .2), rot=a); B.cyl(mat('spire2', '#5a5866', .5), u, v, .002, .6, z=4.5 - .6 * (d(u, v) / .2), seg=6, r2=0)
        B.road(mat('path', '#cbbf9f', .9), [(.5 + math.cos(t / 30 * 2 * math.pi) * .075, .5 + math.sin(t / 30 * 2 * math.pi) * .075 / ASP) for t in range(31)], .002, z=6.35)
        for k in range(0): B.blob(mat('mist', '#f4f6fa', 1.0, alpha=.55), R.uniform(.05, .95), R.uniform(.05, .95), R.uniform(.03, .07), z=-1.5, h=.4)
        mk('pantheon', .5, .5, .03); mk('holy_mountain', .5, .5 + .13 / ASP, .2); mk('shrine_ring', .5 + .075, .5, .02); mk('pilgrim_stair', .5, .5 + .17 / ASP, .02)

def site_highland():
    """旷野高地：卡里只有「荒野，有崖壁」。整张图为推断。"""
    cliff = lambda u: .55 + .08 * math.sin(u * 9) + .03 * math.sin(u * 23)
    def h(u, v):
        base = 1.2 * noise(u, v, .8, 4) + (2.2 if v < cliff(u) else -.4 - (v - cliff(u)) * 2)
        return base
    TERRAIN['h'] = h
    def c(u, v, z):
        if abs(v - cliff(u)) < .012: return '#6b6259'
        if v < cliff(u): return mix('#8a8a55', '#6f7a44', noise(u, v, 3, 2) + .4)
        return mix('#5d7040', '#4a5e34', noise(u, v, 2, 7) + .3)
    TERRAIN['c'] = c; terrain(260)
    for k in range(260):
        u = R.random(); v = cliff(u) + R.uniform(-.01, .02); B.blob(mat('rock', '#7d756a', .9), u, v, R.uniform(.002, .006), z=zg(u, v) - .2)
    for k in range(200):
        u, v = R.random(), R.random(); B.blob(mat('rock2', '#8e877a', .9), u, v, R.uniform(.001, .003), z=zg(u, v))
    trees(1400, lambda u, v: v > cliff(u) + .04, (.004, .008))
    trees(300, lambda u, v: v < cliff(u) - .05 and noise(u, v, 2) > .4, (.002, .004), ('#56663a',))
    pts = [(.05, .25), (.2, .3), (.35, .28), (.48, .38), (.52, cliff(.52) - .01)]
    B.road(mat('trail', '#a39373', .95), pts, .003)
    B.road(mat('trail', '#a39373'), [(.53, cliff(.53) + .02), (.6, .75), (.75, .85), (.95, .95)], .003)
    mk('highland_plateau', .3, .3, .15); mk('cliff_edge', .5, cliff(.5), .03); mk('trail_down', .75, .85, .02)

def site_fief(n):
    """圆桌骑士封地：卡里只说有独立封地与专属骑士团调动权；城堡、营地、村镇、地形都是推断，三块封地按世界图位置给不同地形。"""
    kind = {2: 'coast', 3: 'river', 4: 'forest'}[n]
    river = lambda u: .45 + .12 * math.sin(u * 6 + n)
    def h(u, v):
        z = .4 + .45 * noise(u, v, .7, n) + 1.2 * math.exp(-((u - .42) ** 2 + (v - .42) ** 2) / .01)
        if kind == 'coast' and u < .22 + .05 * math.sin(v * 8): z = -.5
        if kind == 'river' and abs(v - river(u)) < .02: z = -.3
        return z
    TERRAIN['h'] = h
    def c(u, v, z):
        if z <= -.29: return '#3a5a70'
        if kind == 'coast' and u < .25 + .05 * math.sin(v * 8): return '#cbbd92'
        f = noise(u, v, 2, n)
        if .55 < u < .95 and .55 < v < .95:
            cu, cv = u + .01 * noise(u, v, 3, 1), v + .01 * noise(u, v, 3, 2)
            return ('#a8a456', '#7e9448', '#b89e5a', '#8a7a4a', '#9aa860')[int(_h(int(cu * 22), int(cv * 16), n) * 5)]
        return mix('#6d8a45', '#557038', f + .4)
    TERRAIN['c'] = c; terrain(220)
    if kind == 'coast':
        B.box(mat('sea', '#2f5570', .15), .05, .5, .3, .8, .01, z=-.45)
    ck = (.42, .42); z0 = zg(*ck)
    B.box(mat('keep', '#a39c90', .7), ck[0], ck[1], .02, .02, 1.4, z=z0); B.ring(mat('cwall', '#8f887b', .8), ck[0], ck[1], .04, .004, .6, z=z0 - .3, seg=8)
    for a in range(8): B.cyl(mat('towerc', '#958d80', .7), ck[0] + math.cos(a * math.pi / 4 + math.pi / 8) * .04, ck[1] + math.sin(a * math.pi / 4 + math.pi / 8) * .04 / ASP, .005, 1.0, z=z0 - .3, seg=10)
    B.box(mat('banner', '#7a2b2b', .6), ck[0], ck[1], .006, .006, .3, z=z0 + 1.4)
    bx, by = .62, .3
    for k in range(6): B.box(mat('barr', '#b5a488', .8), bx + (k % 3) * .02, by + (k // 3) * .03, .016, .008, .3, z=zg(bx, by))
    B.box(mat('yard', '#b9a77f', .95), bx + .02, by + .08, .06, .03, .015, z=zg(bx, by + .08))
    B.ring(mat('pal', '#6b5a44', .9), bx + .02, by + .03, .06, .002, .25, z=zg(bx, by) - .1, seg=4)
    vx, vy = .3, .72
    houses(200, lambda u, v: math.hypot(u - vx, (v - vy) * ASP) < .06 and h(u, v) > -.2, (.003, .006), ('#c8b18a', '#b08f6a', '#9a4a36'), hmax=.3, box=(vx - .07, vy - .11, vx + .07, vy + .11))
    B.cyl(mat('church', '#d8cfbf', .7), vx, vy, .006, .3, z=zg(vx, vy)); B.cyl(mat('spire', '#555555', .5), vx, vy, .003, .7, z=zg(vx, vy) + .3, seg=6, r2=0)
    road = mat('road', '#9d8e70', .95)
    B.road(road, [(ck[0], ck[1] + .04 / ASP), (.35, .6), (vx, vy), (.3, 1.02)], .004)
    B.road(road, [(ck[0] + .04, ck[1]), (bx, by + .03), (1.02, .25)], .004)
    B.road(road, [(vx, vy), (.7, .75), (1.02, .8)], .003)
    trees(4200 if kind == 'forest' else 1800, lambda u, v: h(u, v) > -.2 and math.hypot(u - ck[0], (v - ck[1]) * ASP) > .07 and math.hypot(u - vx, (v - vy) * ASP) > .08
          and not (.55 < u < .95 and .55 < v < .95) and not (.58 < u < .72 and .25 < v < .45) and not (kind == 'coast' and u < .28))
    mk(f'fief{n}_castle', ck[0], ck[1], .04); mk(f'fief{n}_order', bx + .02, by + .04, .05); mk(f'fief{n}_village', vx, vy, .06); mk(f'fief{n}_fields', .75, .75, .12)

SITES = {'kavalierki': (site_kavalierki, 20000), 'yuanyu_city': (lambda: yuanyu_common('city'), 16000), 'yuanyu_sanctum': (lambda: yuanyu_common('sanctum'), 16000),
         'highland': (site_highland, 8000), 'fief2': (lambda: site_fief(2), 6000), 'fief3': (lambda: site_fief(3), 6000), 'fief4': (lambda: site_fief(4), 6000)}
fn, EXT = SITES[SITE]; fn(); B.flush()
data = {'extent_m': [float(EXT), EXT * ASP], 'markers': [{'id': i, 'nx': u, 'ny': v, 'r': r} for i, u, v, r in MK]}
json.dump(data, open(os.path.join(ROOT, 'map', 'data', f'site_{SITE}.json'), 'w'), indent=1)
print('data', SITE, len(MK))
if '--data-only' in opt: sys.exit(0)

# 光：斜射的太阳 + 天光（城区地图一样的中性白天）
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = .05
so = bpy.data.objects.new('sun', sun); so.rotation_euler = (math.radians(38), 0, math.radians(-40)); sc.collection.objects.link(so)
wd = bpy.data.worlds.new('w'); sc.world = wd; wd.use_nodes = True; wd.node_tree.nodes['Background'].inputs[0].default_value = (.55, .62, .72, 1); wd.node_tree.nodes['Background'].inputs[1].default_value = .6
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = W; cam.clip_end = 200
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co; co.location = (0, 0, 60)
sc.render.resolution_x = RES; sc.render.resolution_y = int(round(RES * ASP)); sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for dv in pr.devices: dv.use = dv.type != 'CPU'
    sc.cycles.device = 'GPU'
except Exception as e: print('gpu', e)
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 4
sc.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = OUT
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.render.render(write_still=True); print('wrote', OUT)
