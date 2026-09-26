# 天城三层共用：参数、材质、城市生成（街道 + 楼群）、相机与导出。
# 三层用同一个随机种子、同一套平面坐标：城市生成必须在其他任何随机调用之前，保证三层的街道和楼的平面位置完全一致。
# 各层只在生成之后按 kind 重新配色、加高或压低，不再消耗城市的随机序列。
# 用法：在层脚本里 sys.path.insert(0, 脚本目录); import tc_common as tc
import bpy, bmesh, json, math, os, sys, random, time
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 30.0, 18.75                              # 3 km × 1.875 km 的天城核心片区，1 单位 = 100 m
SEED = 2088
T0 = time.time()
def tick(msg): print(f'[{time.time() - T0:6.1f}s] {msg}', flush=True)

# 城市里每个盒子的类别（mid / low 按类别重新配色）
K_GROUND, K_PARK, K_BUILDING, K_EQUIP = 0, 1, 2, 3

def parse_args(defaults):
    """Blender -b -P x.py -- --res 1600 ...，或 python3 x.py -- ...（pip 装的 bpy）。"""
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    opt = dict(defaults)
    for i in range(0, len(args) - 1, 2): opt[args[i]] = args[i + 1]
    return opt

def setup():
    """清空场景并设定随机种子；返回 (rng, 场景, 主集合)。"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = np.random.default_rng(SEED); random.seed(SEED)
    sc = bpy.context.scene
    return rng, sc, sc.collection

# ---------------- 材质（Blender 3.x / 4.x 输入名兼容） ----------------
def set_in(node, names, value):
    for n in (names if isinstance(names, (tuple, list)) else (names,)):
        if n in node.inputs: node.inputs[n].default_value = value; return True
    return False
def bsdf_of(m): return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
def mat(name, color, rough=.8, metal=0, spec=.5):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = bsdf_of(m)
    set_in(b, 'Base Color', (*color, 1)); set_in(b, 'Roughness', rough)
    set_in(b, 'Metallic', metal); set_in(b, ('Specular IOR Level', 'Specular'), spec)
    return m
def noise_mat(name, c1, c2, scale=40, rough=.9, bump=.2):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = bsdf_of(m)
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 8
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (*c1, 1); ramp.color_ramp.elements[1].color = (*c2, 1)
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    set_in(b, 'Roughness', rough)
    return m
def vcol_mat(name, rough=.7, metal=0, layer='col'):
    """底色取网格颜色属性（每栋楼自己的屋顶色）。"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = bsdf_of(m)
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = layer
    nt.links.new(vc.outputs['Color'], b.inputs['Base Color']); set_in(b, 'Roughness', rough); set_in(b, 'Metallic', metal)
    return m
def emit_mat(name, color=None, strength=1.0, layer='col', stripes=0, alpha=1.0):
    """自发光：颜色取常量或颜色属性；stripes>0 时叠一层扫描线（全息广告）；alpha<1 时与透明混合。"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = strength
    if color is None:
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = layer; src = vc.outputs['Color']
    else:
        em.inputs['Color'].default_value = (*color, 1); src = None
    if stripes:
        tc = nt.nodes.new('ShaderNodeTexCoord'); wv = nt.nodes.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = stripes
        wv.inputs['Distortion'].default_value = 2; wv.inputs['Detail'].default_value = 3
        nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = .45; mr.inputs['To Max'].default_value = 1
        nt.links.new(wv.outputs['Fac'], mr.inputs['Value'])
        mul = nt.nodes.new('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs['Fac'].default_value = 1
        if src is not None: nt.links.new(src, mul.inputs['Color1'])
        else: mul.inputs['Color1'].default_value = (*color, 1)
        nt.links.new(mr.outputs['Result'], mul.inputs['Color2']); src = mul.outputs['Color']
    if src is not None: nt.links.new(src, em.inputs['Color'])
    shader = em.outputs['Emission']
    if alpha < 1:
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = alpha
        nt.links.new(tr.outputs['BSDF'], mx.inputs[1]); nt.links.new(shader, mx.inputs[2]); shader = mx.outputs['Shader']
        if hasattr(m, 'blend_method'): m.blend_method = 'BLEND'
    nt.links.new(shader, out.inputs['Surface'])
    return m
def shade_mat(name, color, alpha):
    """半透明暗色（上层岛屿投影）：透明与漫反射混合。"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    nt.nodes.remove(bsdf_of(m))
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); df = nt.nodes.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (*color, 1)
    mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = alpha
    nt.links.new(tr.outputs['BSDF'], mx.inputs[1]); nt.links.new(df.outputs['BSDF'], mx.inputs[2]); nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
    return m

# ---------------- 批量网格 ----------------
def box_mesh(name, boxes, colors=None, m=None, rot=None):
    """boxes: (n, 6) = x, y, w, d, z0, z1；colors: (n, 3) 写入颜色属性 col；rot: (n,) 绕 z 旋转。顶面 + 四个侧面（底面看不到）。"""
    B = np.asarray(boxes, np.float32).reshape(-1, 6); n = len(B)
    if n == 0: return None
    sx = np.array([-.5, .5, .5, -.5] * 2, np.float32); sy = np.array([-.5, -.5, .5, .5] * 2, np.float32); top = np.array([0] * 4 + [1] * 4, np.float32)
    lx, ly = sx * B[:, 2:3], sy * B[:, 3:4]
    if rot is not None:
        c, s = np.cos(rot)[:, None].astype(np.float32), np.sin(rot)[:, None].astype(np.float32); lx, ly = lx * c - ly * s, lx * s + ly * c
    V = np.empty((n, 8, 3), np.float32)
    V[:, :, 0] = B[:, :1] + lx; V[:, :, 1] = B[:, 1:2] + ly; V[:, :, 2] = B[:, 4:5] + top * (B[:, 5:6] - B[:, 4:5])
    F = np.array([[4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], np.int32)
    F = (F[None] + (np.arange(n, dtype=np.int32) * 8)[:, None, None]).reshape(-1, 4)
    me = bpy.data.meshes.new(name); me.vertices.add(n * 8); me.vertices.foreach_set('co', V.ravel())
    me.loops.add(F.size); me.loops.foreach_set('vertex_index', F.ravel())
    me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', np.arange(0, F.size, 4, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(len(F), 4, np.int32))
    me.update(calc_edges=True)
    if colors is not None:
        ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER')
        C = np.concatenate([np.asarray(colors, np.float32).reshape(-1, 3), np.ones((n, 1), np.float32)], 1)
        ca.data.foreach_set('color', np.repeat(C, 20, axis=0).ravel())
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if m: o.data.materials.append(m)
    return o

class Batch:
    """把大量小图元（树、储罐、柱子、灯头）写进一张 bmesh，最后生成一个物体。"""
    def __init__(self, name, m, smooth=False): self.name, self.m, self.smooth, self.bm = name, m, smooth, bmesh.new()
    def ico(self, x, y, z, r, sz=1.0, sub=1):
        bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=Matrix.Translation((x, y, z)) @ Matrix.Diagonal((1, 1, sz, 1)))
    def cyl(self, x, y, z0, r, h, seg=16, r2=None):
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h,
                              matrix=Matrix.Translation((x, y, z0 + h / 2)))
    def box(self, x, y, z0, w, d, h, rot=0):
        bmesh.ops.create_cube(self.bm, size=1, matrix=Matrix.Translation((x, y, z0 + h / 2)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((w, d, h, 1)))
    def ring(self, x, y, z, r, w, h, seg=48, sx=1.0, sy=1.0, rot=0):
        """扁圆环（围墙、井口）：用 seg 段短盒子围成。"""
        for k in range(seg):
            a0, a1 = k / seg * 2 * math.pi, (k + 1) / seg * 2 * math.pi
            p0 = (math.cos(a0) * r * sx, math.sin(a0) * r * sy); p1 = (math.cos(a1) * r * sx, math.sin(a1) * r * sy)
            mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2; L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 1.05
            c, s = math.cos(rot), math.sin(rot)
            self.box(x + mx * c - my * s, y + mx * s + my * c, z, L, w, h, math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + rot)
    def done(self):
        if self.smooth:
            for f in self.bm.faces: f.smooth = True
        me = bpy.data.meshes.new(self.name); self.bm.to_mesh(me); self.bm.free()
        o = bpy.data.objects.new(self.name, me); bpy.context.scene.collection.objects.link(o)
        if self.m: o.data.materials.append(self.m)
        return o

# ---------------- 城市（三层共用的平面布局） ----------------
def district(x, y):                                           # 0…1 的低频「城区强度」：几个高楼核心 + 起伏
    v = .5 + .25 * math.sin(x * .23 + 1.3) * math.cos(y * .31 - .4) + .2 * math.sin(x * .07 - y * .11)
    for hx, hy, r in ((-4, 2, 5), (9, 4, 4), (-11, -3, 3.5), (5, -6, 3)):   # 高楼核心（推断）
        v += .55 * math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * r * r))
    return min(1, max(0, v))
ROOF = [(.30, .29, .27), (.42, .41, .38), (.15, .155, .17), (.28, .17, .12), (.21, .24, .28), (.52, .52, .50), (.24, .22, .18), (.16, .21, .12)]
ROOF_W = [.22, .18, .16, .1, .12, .08, .1, .04]
Z_GROUND = -3.6                                               # 中层地面（上层视角下，中层楼顶约在 z=-2.2…0）
CELL = .24                                                    # 街区格（24 m）
def diag_road(x, y): return abs(x - y * 1.3 - 2) < .16 or abs(x + y * .8 + 6) < .16   # 两条斜向大道（推断）
def city_blocks(rng):
    """生成城市。只用传入的 rng（numpy），不碰 random；公园里的树只记坐标，由调用方按顺序种下。
    返回 dict：boxes (n,6)、colors (n,3)、kind (n,)、parent (n,)（设备所在楼的下标）、cell (n,2)、district (n,)、
    trees [(x, y, z, r)]、xs、ys、AX、AY（主干道所在的格序号）。"""
    S = CELL; boxes, cols, kinds, parents, cells, dist, trees = [], [], [], [], [], [], []
    def box(x, y, w, d, z0, z1, c, k, cell, n, par=-1):
        boxes.append((x, y, w, d, z0, z1)); cols.append(c); kinds.append(k); parents.append(par); cells.append(cell); dist.append(n)
        return len(boxes) - 1
    def avenues(n):                                              # 主干道间隔不等（4–9 格），避免棋盘感
        out, k = set(), 0
        while k < n: out.add(k); k += int(rng.integers(4, 10))
        return out
    xs, ys = np.arange(-W * .56, W * .56, S), np.arange(-H * .58, H * .58, S)
    AX, AY = avenues(len(xs)), avenues(len(ys))
    for ix, x0 in enumerate(xs):
        for iy, y0 in enumerate(ys):
            if ix in AX or iy in AY: continue                     # 主干道
            if diag_road(x0, y0): continue
            n = district(x0, y0)
            park = math.sin(x0 * .9 + 2) * math.sin(y0 * 1.1 - 1) + .4 * math.sin(x0 * .3 + y0 * .5)
            if park > 1.05 and n < .75:                           # 城市公园：地面 + 树
                box(x0, y0, S, S, Z_GROUND, Z_GROUND + .02, (.10, .16, .07), K_PARK, (ix, iy), n)
                for _ in range(rng.integers(3, 8)): trees.append((x0 + rng.uniform(-.1, .1), y0 + rng.uniform(-.1, .1), Z_GROUND + .02, rng.uniform(.02, .04)))
                continue
            box(x0, y0, S * .9, S * .9, Z_GROUND, Z_GROUND + .005, (.20, .20, .19), K_GROUND, (ix, iy), n)   # 街区地面（人行道、内院），比马路亮
            if rng.random() < .04 + .08 * (1 - n): continue       # 空地、小广场
            if rng.random() < .04:                                # 大体量建筑（商场、车站、厂房）占满一格
                parts = [(x0, y0, S * .92, S * .92, -2.2 + n * 1.2 + rng.random() * .3)]
            else:
                parts = [(x0 + rng.uniform(-.04, .04), y0 + rng.uniform(-.04, .04), rng.uniform(.08, .19), rng.uniform(.08, .19),
                          -2.2 + n ** 2 * 1.4 + rng.random() ** 4 * (.4 + 1.5 * n)) for _ in range(rng.integers(1, 4))]
            for x, y, w, d, top in parts:
                top = min(top, .1); c = ROOF[rng.choice(len(ROOF), p=ROOF_W)]
                c = tuple(min(1, ch * rng.uniform(.85, 1.15)) for ch in c)
                bi = box(x, y, w, d, Z_GROUND, top, c, K_BUILDING, (ix, iy), n)
                if w * d > .005:                                  # 楼顶设备 / 水箱 / 天窗
                    for _ in range(rng.integers(1, 4)):
                        k = rng.uniform(.012, .03); cc = tuple(min(1, ch * rng.uniform(.7, 1.4)) for ch in c)
                        box(x + rng.uniform(-w, w) * .35, y + rng.uniform(-d, d) * .35, k, k * rng.uniform(.6, 1.6), top, top + rng.uniform(.004, .015), cc, K_EQUIP, (ix, iy), n, bi)
    city = dict(boxes=np.array(boxes, np.float32), colors=np.array(cols, np.float32), kind=np.array(kinds, np.int8),
                parent=np.array(parents, np.int32), cell=np.array(cells, np.int32), district=np.array(dist, np.float32),
                trees=trees, xs=xs, ys=ys, AX=sorted(AX), AY=sorted(AY))
    tick(f'city boxes {len(boxes)}')
    return city
def keep_mask(city, zones):
    """zones: [(x, y, rx, ry)] 椭圆（或 ('rect', x0, y0, x1, y1)）——落在其中的盒子去掉，给地标腾地方。只做过滤，不消耗随机数。"""
    B = city['boxes']; keep = np.ones(len(B), bool)
    for z in zones:
        if z[0] == 'rect':
            _, x0, y0, x1, y1 = z; keep &= ~((B[:, 0] > x0) & (B[:, 0] < x1) & (B[:, 1] > y0) & (B[:, 1] < y1))
        else:
            x, y, rx, ry = z; keep &= ((B[:, 0] - x) / rx) ** 2 + ((B[:, 1] - y) / ry) ** 2 > 1
    par = city['parent']; keep &= np.where(par >= 0, keep[np.maximum(par, 0)], True)   # 楼去掉了，楼顶设备也去掉
    return keep
def road_plane(color, z=Z_GROUND, m=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, z)); road = bpy.context.active_object; road.scale = (W * 1.2, H * 1.25, 1)
    road.data.materials.append(m or mat('road', color, .8)); return road
def road_lines(city, width=.07):
    """主干道与斜向大道的中心线（盒子），用于路灯光带、铁轨等。返回 [(x, y, w, d, rot)]。"""
    xs, ys, out = city['xs'], city['ys'], []
    for ix in city['AX']: out.append((xs[ix], 0, width, H * 1.16, 0))
    for iy in city['AY']: out.append((0, ys[iy], W * 1.12, width, 0))
    for a, b in ((1.3, 2), (-.8, -6)):                           # x = a*y + b
        L = H * 1.3 * math.hypot(1, a); out.append((b, 0, width, L, -math.atan(a)))
    return out

def upper_islands():
    """上层岛屿（map/data/tc_upper.json）换回平面坐标：[(id, x, y, rx, ry, rot, alt_m)]。"""
    d = json.load(open(os.path.join(HERE, '..', 'map', 'data', 'tc_upper.json')))
    return [(i['id'], (i['nx'] - .5) * W, (.5 - i['ny']) * H, i['rx'] * W, i['ry'] * H, i['rot'], i.get('alt_m', 1000)) for i in d['islands']]

# ---------------- 相机、渲染、导出 ----------------
def camera_and_render(sc, RES, SAMPLES, OUT, opt, view='Standard', exposure=0.0):
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = W; cam.clip_end = 200
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co; co.location = (0, 0, 60)
    sc.render.resolution_x = RES; sc.render.resolution_y = int(round(RES * H / W))
    sc.render.engine = 'CYCLES'
    gpu = False
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('METAL', 'OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
            try: prefs.compute_device_type = kind
            except TypeError: continue
            prefs.get_devices()
            devs = [d for d in prefs.devices if d.type != 'CPU']
            if devs:
                for d in prefs.devices: d.use = True
                gpu = True; break
    except Exception as e: print('GPU probe failed', e)
    sc.cycles.device = 'GPU' if gpu else 'CPU'; print('device', sc.cycles.device)
    sc.cycles.samples = SAMPLES
    import _cycles
    sc.cycles.use_denoising = bool(getattr(_cycles, 'with_openimagedenoise', True)) or gpu
    if not sc.cycles.use_denoising: print('no OpenImageDenoise in this build: denoising off')
    sc.view_settings.view_transform = view; sc.view_settings.look = 'None'; sc.view_settings.exposure = exposure
    if '--crop' in opt:                                     # 只渲染一块区域（归一化 x0,y0,x1,y1，左上原点），用于在最终分辨率下检查细节
        x0, y0, x1, y1 = map(float, opt['--crop'].split(','))
        sc.render.use_border = True; sc.render.use_crop_to_border = True
        sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = x0, x1, 1 - y1, 1 - y0
    sc.render.image_settings.file_format = 'PNG'; os.makedirs(os.path.dirname(OUT), exist_ok=True); sc.render.filepath = OUT
    bpy.context.view_layer.update()
    return co
def norm(sc, co, p):
    """平面坐标 → 归一化图像坐标（左上原点）。"""
    v = world_to_camera_view(sc, co, Vector(p)); return round(v.x, 4), round(1 - v.y, 4)
def write_data(name, sc, co, markers, extra=None):
    data = {'extent_m': [W * 100, H * 100],
            'markers': [dict(id=m['id'], **dict(zip(('nx', 'ny'), norm(sc, co, m['pos'])))) for m in markers]}
    if extra: data.update(extra)
    json.dump(data, open(os.path.join(HERE, '..', 'map', 'data', f'{name}.json'), 'w'), ensure_ascii=False, indent=1)
def render(sc, OUT, label=''):
    tick('render start'); bpy.ops.render.render(write_still=True); tick('render done')
    print('WROTE', OUT, sc.render.resolution_x, sc.render.resolution_y, label)
def glare(sc, threshold=1.0, size=7, mix=-.6):
    """合成器光晕（Fog Glow）：发光体周围一圈柔光，夜景的真实感主要靠它。mix<0 偏向原图。"""
    sc.use_nodes = True; nt = sc.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    rl = nt.nodes.new('CompositorNodeRLayers'); gl = nt.nodes.new('CompositorNodeGlare'); out = nt.nodes.new('CompositorNodeComposite')
    gl.glare_type = 'FOG_GLOW'; gl.quality = 'HIGH'; gl.threshold = threshold; gl.size = size; gl.mix = mix
    nt.links.new(rl.outputs['Image'], gl.inputs['Image']); nt.links.new(gl.outputs['Image'], out.inputs['Image'])
    sc.render.use_compositing = True
def point_lights(name, pts, power, radius=.02):
    """一批点光源：pts = [(x, y, z, (r, g, b))]。共用同一个灯光数据块会让颜色一样，所以按颜色分组。"""
    datas = {}
    for x, y, z, c in pts:
        key = tuple(round(v, 3) for v in c)
        if key not in datas:
            L = bpy.data.lights.new(f'{name}{len(datas)}', 'POINT'); L.energy = power; L.color = key; L.shadow_soft_size = radius; datas[key] = L
        o = bpy.data.objects.new(name, datas[key]); o.location = (x, y, z); bpy.context.scene.collection.objects.link(o)
