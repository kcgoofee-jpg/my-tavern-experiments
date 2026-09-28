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


FLAGS = ('--data-only', '--preview', '--no-landmark-glow')   # 不带值的开关
def parse_args(defaults):
    """Blender -b -P x.py -- --res 1600 ...，或 python3 x.py -- ...（pip 装的 bpy）。
    --键 值 成对出现；FLAGS 里的开关不带值。未知的键照样收下，由层脚本用 opt.get 读取。"""
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    opt, i = dict(defaults), 0
    while i < len(args):
        k = args[i]
        if k in FLAGS or i + 1 >= len(args) or args[i + 1].startswith('--') and not _num(args[i + 1]): opt[k] = True; i += 1
        else: opt[k] = args[i + 1]; i += 2
    return opt
def _num(s):
    try: float(s); return True
    except ValueError: return False

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
    me.polygons.foreach_set('use_smooth', np.zeros(len(me.polygons), bool))   # Blender 4.1+ 新建网格默认平滑着色：楼顶四周发暗、侧面斜向渐变，改回平直
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

# ---------------- 城市（骨架来自 OSM，见 tc_city.py；这里只放三层共用的常量）----------------
def district(x, y):                                           # 0…1 的低频「城区强度」：几个高楼核心 + 起伏
    v = .5 + .25 * math.sin(x * .23 + 1.3) * math.cos(y * .31 - .4) + .2 * math.sin(x * .07 - y * .11)
    for hx, hy, r in ((-4, 2, 5), (9, 4, 4), (-11, -3, 3.5), (5, -6, 3)):   # 高楼核心（推断）
        v += .55 * math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * r * r))
    return min(1, max(0, v))
# 屋顶材料：水泥、浅色水泥、沥青卷材、白色防水膜、砾石、深灰金属、旧砖红、灰绿（低饱和，真实航拍里屋顶几乎都是灰）
ROOF = [(.30, .29, .27), (.42, .41, .38), (.14, .14, .15), (.56, .56, .54), (.27, .25, .21), (.2, .21, .22), (.3, .24, .2), (.2, .22, .19)]
ROOF_W = [.22, .16, .18, .08, .12, .12, .07, .05]
Z_GROUND = -3.6                                               # 中层地面（上层视角下，中层楼顶约在 z=-2.2…0）
def road_plane(color, z=Z_GROUND, m=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, z)); road = bpy.context.active_object; road.scale = (W * 1.2, H * 1.25, 1)
    road.data.materials.append(m or mat('road', color, .8)); return road
def upper_islands():
    """上层岛屿（map/data/tc_upper.json）换回平面坐标：[(id, x, y, rx, ry, rot, alt_m)]。"""
    d = json.load(open(os.path.join(HERE, '..', 'map', 'data', 'tc_upper.json')))
    return [(i['id'], (i['nx'] - .5) * W, (.5 - i['ny']) * H, i['rx'] * W, i['ry'] * H, i['rot'], i.get('alt_m', 1000)) for i in d['islands']]

# ---------------- 相机、渲染、导出 ----------------
def pick_gpu(sc, hybrid=False):
    """选 Cycles GPU 后端并设 sc.cycles.device；返回是否用上 GPU。其他脚本也调用它（sys.path 加 blender/ 后 import tc_common）。
    EDEN_CYCLES_DEVICE：本地 Mac 默认 METAL；云端（AutoDL 等）设 OPTIX 或 CUDA 优先探测该类型，找不到再按 METAL→OPTIX→CUDA→HIP→ONEAPI→CPU 退回。
    hybrid=True 时 CPU 也参与渲染。"""
    gpu = False
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        want = os.environ.get('EDEN_CYCLES_DEVICE', '').strip().upper()
        order = ('METAL', 'OPTIX', 'CUDA', 'HIP', 'ONEAPI')
        if want in order:
            order = (want,) + tuple(k for k in order if k != want)
        for kind in order:
            try: prefs.compute_device_type = kind
            except TypeError: continue
            prefs.get_devices()
            if any(d.type != 'CPU' for d in prefs.devices):
                for d in prefs.devices: d.use = hybrid or d.type != 'CPU'
                gpu = True; print('cycles compute', kind, flush=True); break
    except Exception as e: print('GPU probe failed', e)
    if not gpu: print('cycles compute CPU', flush=True)
    sc.cycles.device = 'GPU' if gpu else 'CPU'
    return gpu

def camera_and_render(sc, RES, SAMPLES, OUT, opt, view='Standard', exposure=0.0, bounces=None):
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = W; cam.clip_end = 200
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co; co.location = (0, 0, 60)
    sc.render.resolution_x = RES; sc.render.resolution_y = int(round(RES * H / W))
    sc.render.engine = 'CYCLES'
    # 设备：默认只用 GPU。CPU + GPU 混合在 M 系列上 CPU 占满 5–6 核，实测未必更快（见 docs/render-performance.md，用 tools/bench_render.sh 验证）
    gpu = pick_gpu(sc, str(opt.get('--devices', os.environ.get('TC_DEVICES', 'gpu'))) == 'hybrid')
    sc.cycles.device = 'GPU' if gpu else 'CPU'; print('device', sc.cycles.device)
    sc.cycles.samples = SAMPLES
    # 自适应采样：干净的区域提前停；阈值可调（--noise 0.02 更快，0.01 默认更干净）
    sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = float(opt.get('--noise', os.environ.get('TC_NOISE', .015)))
    try: sc.cycles.denoising_use_gpu = gpu                   # Blender 4.1+：降噪也放到 GPU 上（8K 时 CPU 降噪要好几分钟）
    except AttributeError: pass
    try: sc.cycles.use_light_tree = True                    # 夜景几千盏小灯：光源树按重要性采样，噪点少、收敛快
    except AttributeError: pass
    if bounces:                                             # 夜景：光主要来自近处的灯，少几次反弹几乎看不出，渲染快很多
        c = sc.cycles; c.max_bounces = bounces; c.diffuse_bounces = min(bounces, 2); c.glossy_bounces = min(bounces, 2)
        c.transmission_bounces = min(bounces, 2); c.volume_bounces = 0; c.transparent_max_bounces = 8
        c.caustics_reflective = c.caustics_refractive = False
    sc.cycles.use_auto_tile = True; sc.cycles.tile_size = 2048   # 8000px 时分块渲染，内存不随分辨率平方涨
    import _cycles
    sc.cycles.use_denoising = bool(getattr(_cycles, 'with_openimagedenoise', True)) or gpu
    if not sc.cycles.use_denoising: print('no OpenImageDenoise in this build: denoising off')
    sc.view_settings.view_transform = view; sc.view_settings.look = 'None'; sc.view_settings.exposure = exposure
    if '--crop' in opt:                                     # 只渲染一块区域（归一化 x0,y0,x1,y1，左上原点），用于在最终分辨率下检查细节
        set_crop(sc, parse_box(opt['--crop']))
    sc.render.image_settings.file_format = 'PNG'; os.makedirs(os.path.dirname(OUT), exist_ok=True); sc.render.filepath = OUT
    bpy.context.view_layer.update()
    return co
def parse_box(s):
    """'x0,y0,x1,y1'（归一化，左上原点）→ 元组；越界或反向时报错退出（别让一个坏参数渲出整张 8K）。"""
    try: b = tuple(float(v) for v in str(s).split(','))
    except ValueError: b = ()
    if len(b) != 4 or not (0 <= b[0] < b[2] <= 1 and 0 <= b[1] < b[3] <= 1):
        sys.exit(f'bad crop box {s!r}: need x0,y0,x1,y1 with 0 <= x0 < x1 <= 1, 0 <= y0 < y1 <= 1')
    return b
def parse_crops(opt):
    """多块局部（一次建场景、逐块渲染）：
        --crops "x0,y0,x1,y1:名字;x0,y0,x1,y1:名字"
        --crops-json 文件：[{"name": "seam", "box": [x0, y0, x1, y1]}, ...] 或 {"seam": [x0, y0, x1, y1], ...}
    返回 [(名字, box)]；没有给时返回 []。名字只能是字母数字 _ - .，不能重复。"""
    import re
    items = []
    if opt.get('--crops') not in (None, True):
        for part in str(opt['--crops']).split(';'):
            part = part.strip()
            if not part: continue
            box, _, name = part.partition(':')
            items.append((name.strip() or f'crop{len(items) + 1}', box))
    if opt.get('--crops-json') not in (None, True):
        d = json.load(open(opt['--crops-json'], encoding='utf-8'))
        items += list(d.items()) if isinstance(d, dict) else [(x.get('name') or f'crop{i + 1}', x['box']) for i, x in enumerate(d)]
    out, seen = [], set()
    for name, box in items:
        if not re.fullmatch(r'[\w.\-]+', name) or name in seen: sys.exit(f'bad or duplicate crop name {name!r}')
        seen.add(name)
        out.append((name, parse_box(','.join(map(str, box)) if isinstance(box, (list, tuple)) else box)))
    return out
def set_crop(sc, box):
    x0, y0, x1, y1 = box
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = x0, x1, 1 - y1, 1 - y0
def norm(sc, co, p):
    """平面坐标 → 归一化图像坐标（左上原点）。"""
    v = world_to_camera_view(sc, co, Vector(p)); return round(v.x, 4), round(1 - v.y, 4)
def write_data(name, sc, co, markers, extra=None):
    data = {'extent_m': [W * 100, H * 100],
            'markers': [dict(id=m['id'], **dict(zip(('nx', 'ny'), norm(sc, co, m['pos']))), **({'r': round(m['r'] / W, 4)} if 'r' in m else {}))
                        for m in markers]}
    if extra: data.update(extra)
    fn = os.path.join(HERE, '..', 'map', 'data', f'{name}.json')
    try:   # 手工落点（manual: true，放在现有底图上的点，脚本里没有）重导出时保留
        have = {m['id'] for m in data['markers']}
        data['markers'] += [m for m in json.load(open(fn, encoding='utf-8')).get('markers', []) if m.get('manual') and m['id'] not in have]
    except (OSError, ValueError): pass
    json.dump(data, open(fn, 'w'), ensure_ascii=False, indent=1)
def render(sc, OUT, label=''):
    tick('render start'); bpy.ops.render.render(write_still=True); tick('render done')
    print('WROTE', OUT, sc.render.resolution_x, sc.render.resolution_y, label)
def glare(sc, threshold=1.0, size=7, mix=-.6, tight=None):
    """合成器光晕（Fog Glow）：发光体周围一圈柔光，夜景的真实感主要靠它。
    size 沿用 Blender 4 的含义（光晕半径约 2^size 像素，按 2000px 宽折算）；mix 为 4 的混合（-1 只要原图，0 各半）。
    tight=(threshold, size, strength)：仅 Blender 5+，在大光晕之前先叠一层贴着发光体的小光晕（Bloom 型；霓虹灯管边缘的溢光），默认不加。
    注意：Blender 5 的 Fog Glow 在 Size 小于约 0.3（即 size < 9.2）时几乎不向外扩散，要看得见光晕需要 size ≥ 9；Bloom 在小 Size 下就有贴边的光晕。
    Blender ≥ 5：合成器是节点组（scene.compositing_node_group），输出用组输出节点，Glare 的参数变成输入口。
    任何一步失败都只跳过光晕，不中断渲染。"""
    try:
        if hasattr(sc, 'compositing_node_group'):              # Blender 5+
            ng = bpy.data.node_groups.new('Compositor', 'CompositorNodeTree')
            ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
            rl = ng.nodes.new('CompositorNodeRLayers'); gl = ng.nodes.new('CompositorNodeGlare'); out = ng.nodes.new('NodeGroupOutput')
            gl.inputs['Type'].default_value = 'Fog Glow'; gl.inputs['Quality'].default_value = 'High'
            gl.inputs['Threshold'].default_value = threshold
            gl.inputs['Size'].default_value = min(1.0, 2 ** size / 2000)   # 5 里是相对图宽的比例，与分辨率无关
            gl.inputs['Strength'].default_value = (mix + 1) / 2 * 2          # 4 的 mix → 5 的叠加强度（按样张目测对齐）
            src = rl.outputs['Image']
            if tight:
                g2 = ng.nodes.new('CompositorNodeGlare'); g2.inputs['Type'].default_value = 'Bloom'; g2.inputs['Quality'].default_value = 'High'
                g2.inputs['Threshold'].default_value = tight[0]; g2.inputs['Size'].default_value = min(1.0, 2 ** tight[1] / 2000)
                g2.inputs['Strength'].default_value = tight[2]
                ng.links.new(src, g2.inputs['Image']); src = g2.outputs['Image']
            ng.links.new(src, gl.inputs['Image']); ng.links.new(gl.outputs['Image'], out.inputs[0])
            sc.compositing_node_group = ng
        else:                                                  # Blender 3.x / 4.x
            sc.use_nodes = True; nt = sc.node_tree
            for n in list(nt.nodes): nt.nodes.remove(n)
            rl = nt.nodes.new('CompositorNodeRLayers'); gl = nt.nodes.new('CompositorNodeGlare'); out = nt.nodes.new('CompositorNodeComposite')
            gl.glare_type = 'FOG_GLOW'; gl.quality = 'HIGH'; gl.threshold = threshold; gl.size = size; gl.mix = mix
            nt.links.new(rl.outputs['Image'], gl.inputs['Image']); nt.links.new(gl.outputs['Image'], out.inputs['Image'])
        sc.render.use_compositing = True
    except Exception as e:
        print('glare skipped (compositor API changed?):', e)
def point_lights(name, pts, power, radius=.02):
    """一批点光源：pts = [(x, y, z, (r, g, b))]。共用同一个灯光数据块会让颜色一样，所以按颜色分组。"""
    datas = {}
    for x, y, z, c in pts:
        key = tuple(round(v, 3) for v in c)
        if key not in datas:
            L = bpy.data.lights.new(f'{name}{len(datas)}', 'POINT'); L.energy = power; L.color = key; L.shadow_soft_size = radius; datas[key] = L
        o = bpy.data.objects.new(name, datas[key]); o.location = (x, y, z); bpy.context.scene.collection.objects.link(o)


# ---------------- 层运行器：三层脚本的统一骨架 ----------------
class Layer:
    """每层脚本的统一结构（接口见 docs/tiancheng-maps.md）：
        layer = tc.Layer('tc_mid', defaults={...}, seed=7001, bounces=4)   # 解析参数、清空场景、生成城市（第一个随机调用）
        ... 用 layer.city / layer.rng / layer.opt 建本层内容；layer.marker(id, (x, y, z), r) 登记地标 ...
        layer.finish(world=(颜色, 强度), glare={...}, extra={...})          # 相机 → 导出 map/data/<name>.json → 渲染
    命令行（所有层一致）：--res N --samples N --out 路径 --crop x0,y0,x1,y1 --preview（800px / 8 采样）--data-only（只导出点位，不渲染）
        多块局部（一次建场景）：--crops "x0,y0,x1,y1:名字;..." 或 --crops-json 文件，输出 <--out-dir 或 --out 所在目录>/<名字>.png；
        推荐用 tools/crops.sh 调用（参数已正确加引号）
    """
    def __init__(self, name, defaults=None, seed=None, bounces=None, city='mid'):
        self.name, self.bounces = name, bounces
        d = {'--res': '1600', '--samples': '64', '--out': os.path.join(HERE, '..', 'map', 'art', f'{name}_preview.png')}
        d.update(defaults or {})
        given = parse_args({})
        if given.get('--preview'): d.update({'--res': '800', '--samples': '8'})   # 快速预览；显式给的 --res / --samples 仍然优先
        self.opt = parse_args(d)
        self.res, self.samples, self.out = int(self.opt['--res']), int(self.opt['--samples']), os.path.abspath(self.opt['--out'])
        self.data_only = bool(self.opt.get('--data-only'))
        self.crops = parse_crops(self.opt)                  # 先校验，出错时还没花时间建场景
        if self.crops and '--crop' in self.opt: sys.exit('use either --crop or --crops/--crops-json, not both')
        self.crop_dir = os.path.abspath(self.opt.get('--out-dir') or os.path.dirname(self.out))
        rng, self.sc, self.col = setup()
        import tc_city
        self.city = tc_city.City(rng, city)           # city：取哪一层的城区拼接（mid / low / upper）                       # OSM 城市骨架；必须是第一个随机调用（缺高度的楼按同一随机序列补），三层才对得上
        self.city_rng = rng                                 # 上层沿用这条随机序列（保持旧版布局不变）
        if seed is None: self.rng = rng                     # 不另起种子：沿用 SEED（上层）
        else: self.rng = np.random.default_rng(seed); random.seed(seed)
        self.markers = []
        # --no-landmark-glow：去掉地标的装饰性光圈 / 描边灯 / 光晕（建筑本体与普通照明不动）；默认关（= 现状）。
        # 各层脚本照常建完、照常消耗随机数，只在最后把这些元素过滤掉，所以随机序列与 map/data/*.json 都不变。
        self.lm_glow = not self.opt.get('--no-landmark-glow')
    def f(self, key, default):                              # 读数值参数：layer.f('--glow', 1)
        return float(self.opt.get(key, default))
    def marker(self, id, pos, r=.3):
        """登记地标：pos 为平面坐标 (x, y, z)，r 为占地半径（平面单位，导出时归一化到图宽）。"""
        self.markers.append({'id': id, 'pos': tuple(pos), 'r': r})
    def finish(self, world=None, glare_opts=None, extra=None, label=''):
        if world:
            w = bpy.data.worlds.new('sky'); self.sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']
            bg.inputs['Color'].default_value = (*world[0], 1); bg.inputs['Strength'].default_value = world[1]
        co = camera_and_render(self.sc, self.res, self.samples, self.out, self.opt, bounces=self.bounces)
        if glare_opts and not self.opt.get('--preview'): glare(self.sc, **glare_opts)
        ex = {'layer': self.name}
        ex.update(extra(co) if callable(extra) else (extra or {}))
        if not self.opt.get('--no-data'):                   # --no-data：草稿 / 原型渲染不覆盖 map/data 下的发布数据
            write_data(self.name, self.sc, co, self.markers, ex)
            tick(f'data map/data/{self.name}.json ({len(self.markers)} markers)')
        if self.data_only: print('DATA-ONLY', self.name); return co
        if self.crops:                                      # 多块局部：场景只建一次，逐块改边框和输出路径
            os.makedirs(self.crop_dir, exist_ok=True)
            for i, (cname, box) in enumerate(self.crops):
                set_crop(self.sc, box); path = os.path.join(self.crop_dir, cname + '.png'); self.sc.render.filepath = path
                tick(f'crop {i + 1}/{len(self.crops)} {cname} {box}')
                render(self.sc, path, f'crop {cname}')
            return co
        render(self.sc, self.out, label or f'markers {len(self.markers)}')
        return co

# ---------------- 太阳：三层共用一个方向（上层的岛影、中层的投影都按它偏移）----------------
SUN_ROT = (math.radians(40), 0, math.radians(215))
def sun_dir():
    """太阳光的传播方向（单位向量，朝下）。"""
    from mathutils import Euler
    v = Vector((0, 0, -1)); v.rotate(Euler(SUN_ROT)); return v
def shadow_offset(height):
    """高 height（平面单位）处的物体，影子落在其下方平面上时的水平偏移 (dx, dy)。"""
    d = sun_dir(); t = height / -d.z; return d.x * t, d.y * t

# ---------------- 批量球体（树冠）：一次建网格，比逐个 bmesh 快两个数量级 ----------------
_ICO = None
def ico_mesh(name, P, m=None, sz=.8, sub=1):
    """P: (n, 4) = x, y, z, r（z 为球心高度）；sz 为竖向压扁系数。平滑着色。"""
    global _ICO
    P = np.asarray(P, np.float32).reshape(-1, 4); n = len(P)
    if n == 0: return None
    if _ICO is None:
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1)
        v = np.array([p.co[:] for p in bm.verts], np.float32); f = np.array([[x.index for x in fc.verts] for fc in bm.faces], np.int32); bm.free()
        _ICO = (v, f)
    v, f = _ICO; nv, nf = len(v), len(f)
    V = v[None] * np.array([1, 1, sz], np.float32) * P[:, 3:4, None] + P[:, None, :3]
    F = (f[None] + (np.arange(n, dtype=np.int32) * nv)[:, None, None]).reshape(-1, 3)
    me = bpy.data.meshes.new(name); me.vertices.add(n * nv); me.vertices.foreach_set('co', V.ravel())
    me.loops.add(F.size); me.loops.foreach_set('vertex_index', F.ravel())
    me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', np.arange(0, F.size, 3, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(len(F), 3, np.int32))
    me.polygons.foreach_set('use_smooth', np.ones(len(F), bool)); me.update(calc_edges=True)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if m: o.data.materials.append(m)
    return o
def cyl_mesh(name, C, m=None, seg=20, colors=None):
    """C: (n, 5) = x, y, z0, r, h。批量圆柱（储罐、柱子），侧面 + 顶面（底面看不到）。colors: (n, 3) 写入颜色属性 col（city_mat 读它）。"""
    C = np.asarray(C, np.float32).reshape(-1, 5); n = len(C)
    if n == 0: return None
    a = np.linspace(0, 2 * np.pi, seg, endpoint=False).astype(np.float32); ca, sa = np.cos(a), np.sin(a)
    V = np.empty((n, 2 * seg, 3), np.float32)
    V[:, :seg, 0] = C[:, :1] + ca * C[:, 3:4]; V[:, :seg, 1] = C[:, 1:2] + sa * C[:, 3:4]; V[:, :seg, 2] = C[:, 2:3]
    V[:, seg:, :2] = V[:, :seg, :2]; V[:, seg:, 2] = C[:, 2:3] + C[:, 4:5]
    k = np.arange(seg, dtype=np.int32); side = np.stack([k, (k + 1) % seg, (k + 1) % seg + seg, k + seg], 1)   # (seg, 4)
    off = (np.arange(n, dtype=np.int32) * 2 * seg)
    S_ = (side[None] + off[:, None, None]).reshape(-1)
    T_ = (np.arange(seg, 2 * seg, dtype=np.int32)[None] + off[:, None]).reshape(-1)
    per = np.concatenate([np.full(seg, 4, np.int32), [seg]]).astype(np.int32)
    loops = np.concatenate([np.concatenate([(side + o).reshape(-1), np.arange(seg, 2 * seg, dtype=np.int32) + o]) for o in off])
    totals = np.tile(per, n); starts = np.concatenate([[0], np.cumsum(totals)[:-1]]).astype(np.int32)
    me = bpy.data.meshes.new(name); me.vertices.add(n * 2 * seg); me.vertices.foreach_set('co', V.ravel())
    me.loops.add(len(loops)); me.loops.foreach_set('vertex_index', loops)
    me.polygons.add(len(totals)); me.polygons.foreach_set('loop_start', starts); me.polygons.foreach_set('loop_total', totals)
    sm = np.tile(np.concatenate([np.ones(seg, bool), [False]]), n); me.polygons.foreach_set('use_smooth', sm)
    me.update(calc_edges=True)
    if colors is not None:                                  # 每个圆柱 seg 个侧面（4 角）+ 顶面（seg 角）= 5·seg 个角
        ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER')
        C4 = np.concatenate([np.broadcast_to(np.asarray(colors, np.float32).reshape(-1, 3), (n, 3)), np.ones((n, 1), np.float32)], 1)
        ca.data.foreach_set('color', np.repeat(C4, 5 * seg, axis=0).ravel())
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if m: o.data.materials.append(m)
    return o
