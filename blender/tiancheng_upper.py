# 天城 · 上层（悬浮庄园区，离地 800–1500 m）· Blender 正俯视写实渲染（第二版：可读性优先）
# 用法：Blender -b -P tiancheng_upper.py -- [--res 1600] [--samples 64] [--out path.png] [--haze .55]
# 1 单位 = 100 m。z=0 为中层楼顶（约 700 m），岛屿 z = (海拔 - 700) / 100。
# 思路（见 ROADMAP P1）：正俯视、白天；中层城市压在半透明霾层之下作远景，岛屿投影落在城市上；
# 结界穹顶、航线、巡逻线不烘进底图，只导出坐标给查看器做可开关的叠加层。
import bpy, bmesh, json, math, os, sys, random
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {'--res': '1600', '--samples': '64', '--out': os.path.join(HERE, '..', 'map', 'art', 'tc_upper_preview.png'), '--haze': '.3'}
for i in range(0, len(args) - 1, 2): opt[args[i]] = args[i + 1]
RES, SAMPLES, OUT, HAZE = int(opt['--res']), int(opt['--samples']), os.path.abspath(opt['--out']), float(opt['--haze'])
W, H = 30.0, 18.75                              # 3 km × 1.875 km 的上层核心片区（三层共用这套平面坐标）
rng = np.random.default_rng(2088); random.seed(2088)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
col_main = sc.collection

# ---------------- 材质 ----------------
def mat(name, color, rough=.8, metal=0, spec=.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal; b.inputs['Specular IOR Level'].default_value = spec
    return m
def noise_mat(name, c1, c2, scale=40, rough=.9, bump=.2):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 8
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (*c1, 1); ramp.color_ramp.elements[1].color = (*c2, 1)
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    return m

M = {
    'grass': noise_mat('grass', (.07, .13, .04), (.15, .24, .07), 22, .9, .35),
    'lawn': noise_mat('lawn', (.20, .33, .11), (.27, .40, .15), 120, .85, .05),
    'rock': noise_mat('rock', (.22, .19, .16), (.40, .35, .30), 18, .95, .6),
    'rim': mat('rim', (.55, .53, .50), .7),
    'marble': mat('marble', (.80, .78, .74), .35, spec=.6),
    'roof': mat('roof', (.40, .42, .46), .5),
    'roof_red': mat('roof_red', (.36, .16, .12), .6),
    'glass': mat('glass', (.20, .32, .40), .08, metal=.6, spec=.9),
    'gold': mat('gold', (.70, .54, .22), .3, metal=1),
    'stone': noise_mat('stone', (.42, .41, .40), (.56, .55, .52), 30, .8, .2),
    'darkstone': mat('darkstone', (.20, .19, .22), .6),
    'water': mat('water', (.04, .15, .20), .03, spec=.9),
    'path': mat('path', (.66, .62, .54), .7),
    'tree1': mat('tree1', (.05, .13, .04), .9), 'tree2': mat('tree2', (.09, .18, .05), .9),
    'pad': mat('pad', (.46, .48, .52), .4, metal=.3),
    'car': mat('car', (.10, .11, .14), .2, metal=.8),
}

def link(ob, m=None):
    if m: ob.data.materials.append(m)
    return ob
def cube(x, y, z, sx, sy, sz, m, rot=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2)); o = bpy.context.active_object
    o.scale = (sx, sy, sz); o.rotation_euler[2] = rot; return link(o, m)
def cyl(x, y, z, r, h, m, verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(x, y, z + h / 2)); return link(bpy.context.active_object, m)
def sphere(x, y, z, r, m, seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=(x, y, z)); o = bpy.context.active_object
    bpy.ops.object.shade_smooth(); return link(o, m)

# ---------------- 中层楼顶（远景，白天无霓虹；楼顶约在 z=-2.2…0）----------------
def district(x, y):                                           # 0…1 的低频「城区强度」：几个高楼核心 + 起伏
    v = .5 + .25 * math.sin(x * .23 + 1.3) * math.cos(y * .31 - .4) + .2 * math.sin(x * .07 - y * .11)
    for hx, hy, r in ((-4, 2, 5), (9, 4, 4), (-11, -3, 3.5), (5, -6, 3)):   # 高楼核心（推断）
        v += .55 * math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * r * r))
    return min(1, max(0, v))
def city_blocks():
    bm = bmesh.new(); S = .24
    for ix, x0 in enumerate(np.arange(-W * .56, W * .56, S)):
        for iy, y0 in enumerate(np.arange(-H * .58, H * .58, S)):
            if ix % 7 == 0 or iy % 5 == 0: continue               # 主干道
            n = district(x0, y0)
            if rng.random() < .06 + .12 * (1 - n): continue       # 空地、小广场
            if rng.random() < .04:                                # 大体量建筑（商场、车站、厂房）占满一格
                parts = [(x0, y0, S * .92, S * .92, -2.2 + n * 1.2 + rng.random() * .3)]
            else:
                parts = [(x0 + rng.uniform(-.05, .05), y0 + rng.uniform(-.05, .05), rng.uniform(.05, .14), rng.uniform(.05, .14),
                          -2.2 + n ** 2 * 1.4 + rng.random() ** 4 * (.4 + 1.5 * n)) for _ in range(rng.integers(1, 4))]
            for x, y, w, d, top in parts:
                top = min(top, .1)
                r = bmesh.ops.create_cube(bm, size=1)['verts']
                for v in r: v.co.x = x + v.co.x * w; v.co.y = y + v.co.y * d; v.co.z = -3.6 + (v.co.z + .5) * (top + 3.6)
    me = bpy.data.meshes.new('city'); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('city', me); col_main.objects.link(o); return o
# 路面：主干道与空地露出的地面（比楼顶暗）
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -3.6)); road = bpy.context.active_object; road.scale = (W * 1.2, H * 1.25, 1)
road.data.materials.append(mat('road', (.05, .05, .06), .8))
cm = bpy.data.materials.new('citymat'); cm.use_nodes = True; nt = cm.node_tree; b = nt.nodes['Principled BSDF']
vor = nt.nodes.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 9     # 每栋楼不同色调
ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (.12, .125, .14, 1); ramp.color_ramp.elements[1].color = (.36, .35, .33, 1)
nt.links.new(vor.outputs['Distance'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
b.inputs['Roughness'].default_value = .7
city_blocks().data.materials.append(cm)
# 霾层：上层与中层之间的一张半透明平面（比体积雾好控，不投影）
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, .4)); haze = bpy.context.active_object; haze.scale = (W * 1.3, H * 1.3, 1)
hm = bpy.data.materials.new('haze'); hm.use_nodes = True; nt = hm.node_tree; out = nt.nodes['Material Output']; nt.nodes.remove(nt.nodes['Principled BSDF'])
tr = nt.nodes.new('ShaderNodeBsdfTransparent'); df = nt.nodes.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (.46, .52, .62, 1)
mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = HAZE
nt.links.new(tr.outputs['BSDF'], mx.inputs[1]); nt.links.new(df.outputs['BSDF'], mx.inputs[2]); nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
haze.data.materials.append(hm); haze.visible_shadow = False

# ---------------- 悬浮岛 ----------------
markers, islands = [], []
def island(x, y, z, rx, ry, rot=0, style='neo', name=None, trees=True):
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=1)
    me = bpy.data.meshes.new('top'); bm.to_mesh(me); bm.free()
    top = bpy.data.objects.new('top', me); col_main.objects.link(top)
    top.location = (x, y, z); top.scale = (rx, ry, 1); top.rotation_euler[2] = rot; top.data.materials.append(M['grass'])
    sub = top.modifiers.new('s', 'SUBSURF'); sub.subdivision_type = 'SIMPLE'; sub.levels = 4
    tt = bpy.data.textures.new('hill', 'CLOUDS'); tt.noise_scale = .4; dd = top.modifiers.new('h', 'DISPLACE'); dd.texture = tt; dd.strength = .02; dd.mid_level = .5
    # 石砌边缘：俯视时给岛一圈清楚的轮廓
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1, depth=.03, location=(x, y, z - .026))   # 顶面略低于草地，只露出外圈
    rim = bpy.context.active_object; rim.scale = (rx * 1.025, ry * 1.025, 1); rim.rotation_euler[2] = rot; link(rim, M['rim'])
    # 岩体：倒锥 + 噪声位移（俯视看不见，但投影形状要对）
    depth = (rx + ry) * .95
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=1, radius2=.05, depth=1, location=(x, y, z - depth / 2 - .03))
    cone = bpy.context.active_object; cone.scale = (rx, ry, depth); cone.rotation_euler = (math.pi, 0, rot)
    tex = bpy.data.textures.new('rockn', 'CLOUDS'); tex.noise_scale = .35
    d = cone.modifiers.new('d', 'DISPLACE'); d.texture = tex; d.strength = .2 * min(rx, ry); d.mid_level = .5
    cone.data.materials.append(M['rock'])
    if trees:
        for _ in range(int(rx * ry * 60)):
            a = random.random() * 2 * math.pi; r = math.sqrt(random.random()) * .9
            px, py = math.cos(a) * r * rx, math.sin(a) * r * ry
            px, py = px * math.cos(rot) - py * math.sin(rot), px * math.sin(rot) + py * math.cos(rot)
            if style != 'none' and math.hypot(px / rx, py / ry) < .5: continue
            sphere(x + px, y + py, z + .02, .02 + random.random() * .03, M['tree1' if random.random() < .5 else 'tree2'], seg=8)
    if style != 'none': building(x, y, z, rx, ry, rot, style)
    islands.append({'id': name or f'isle{len(islands)}', 'x': x, 'y': y, 'z': z, 'rx': rx, 'ry': ry, 'rot': rot})
    if name: markers.append({'id': name, 'pos': (x, y, z)})
def building(x, y, z, rx, ry, rot, style):
    s = min(rx, ry); c, si = math.cos(rot), math.sin(rot)
    at = lambda dx, dy: (x + dx * c - dy * si, y + dx * si + dy * c)
    if style == 'neo':
        cube(x, y, z, s * .7, s * .35, .08, M['marble'], rot); cube(x, y, z + .08, s * .72, s * .37, .01, M['roof'], rot)
        cube(*at(0, -s * .45), z, s * .06, s * .5, .002, M['path'], rot)
    elif style == 'glass':
        cube(x, y, z, s * .3, s * .3, s * .6, M['glass'], rot); cube(*at(s * .3, 0), z, s * .22, s * .3, s * .3, M['glass'], rot)
    elif style == 'gothic':
        for dx, h in [(-.15, .3), (0, .45), (.15, .3)]:
            cube(*at(dx * s, 0), z, s * .12, s * .14, h * s, M['darkstone'], rot)
    elif style == 'dome':
        cube(x, y, z, s * .5, s * .5, s * .15, M['marble'], rot); sphere(x, y, z + s * .15, s * .2, M['gold'])
    elif style == 'villa':
        cube(*at(-s * .1, 0), z, s * .55, s * .25, .05, M['roof_red'], rot); cube(*at(s * .15, s * .05), z + .05, s * .3, s * .2, .04, M['glass'], rot)
        cube(*at(s * .1, -s * .3), z, s * .22, s * .1, .004, M['water'], rot)

# 伊甸庄园：按「庄园布局」（主体约 40×18 m 三层，新古典白石；前庭喷泉朝南、后庭人工湖在北；访客停靠平台）
def eden(x, y, z):
    rx, ry = .72, .54
    island(x, y, z, rx, ry, 0, 'none', trees=False)
    for _ in range(90):                                  # 树只种在外圈，留出庭园
        a = random.random() * 2 * math.pi; r = .8 + random.random() * .13
        sphere(x + math.cos(a) * r * rx, y + math.sin(a) * r * ry, z + .02, .02 + random.random() * .025, M['tree1' if random.random() < .5 else 'tree2'], seg=8)
    cube(x, y - .02, z - .001, 1.1, .8, .002, M['lawn'])
    cube(x, y + .02, z, .40, .18, .15, M['marble']); cube(x, y + .02, z + .15, .41, .19, .006, M['roof'])
    for dx in (-.26, .26): cube(x + dx, y + .03, z, .12, .14, .10, M['marble']); cube(x + dx, y + .03, z + .10, .125, .145, .005, M['roof'])
    for k in range(8): cyl(x - .07 + k * .02, y - .075, z, .004, .12, M['marble'], 8)      # 正面柱廊
    cube(x, y - .2, z, .03, .22, .003, M['path'])                                          # 中轴步道
    cyl(x, y - .2, z, .035, .012, M['marble'], 32); cyl(x, y - .2, z + .004, .028, .009, M['water'], 32)   # 前庭喷泉
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1, depth=.004, location=(x - .28, y + .3, z + .002))
    lake = bpy.context.active_object; lake.scale = (.13, .07, 1); link(lake, M['water'])     # 后庭人工湖
    cyl(x + .25, y + .3, z, .025, .03, M['marble'], 8)                                      # 凉亭
    cube(x + .05, y + .33, z, .14, .08, .002, M['path'])                                    # 露天训练场
    cyl(x + .12, y + .22, z, .02, .09, M['marble'], 16)                                     # 以太凝水塔（供喷泉）
    cyl(x + rx + .1, y - .05, z - .01, .1, .012, M['pad'], 48)                              # 访客载具停靠平台
    car(x + rx + .1, y - .05, z + .012, 0)
    markers.append({'id': 'eden', 'pos': (x, y, z)})
def car(x, y, z, rot):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=.02, location=(x, y, z)); o = bpy.context.active_object
    o.scale = (1.8, .8, .5); o.rotation_euler[2] = rot; return link(o, M['car'])

# 银冠堡：议会骑士团总部，上层与中层交界（800 m → z=1）的悬浮要塞
def silver_crown(x, y, z):
    island(x, y, z, 1.5, 1.0, .2, 'none', name='silver_crown', trees=False)
    for k in range(20):
        a = k / 20 * 2 * math.pi; cube(x + math.cos(a) * 1.05, y + math.sin(a) * .68, z, .34, .06, .09, M['stone'], a + math.pi / 2)
    for k in range(6):
        a = k / 6 * 2 * math.pi; cyl(x + math.cos(a) * 1.07, y + math.sin(a) * .7, z, .07, .2, M['stone'], 16)
    cube(x, y, z, .5, .35, .25, M['stone']); cyl(x, y, z + .25, .12, .2, M['stone']); cube(x + .5, y - .2, z, .35, .2, .006, M['pad'])

EDEN = (1.5, .8, 4.5)                                      # 伊甸庄园约 1150 m，放在片区中央偏右
eden(*EDEN)
SILVER = (-9.5, -5.5, 1.0)
silver_crown(*SILVER)
placed = [(EDEN[0], EDEN[1], 1.1), (SILVER[0], SILVER[1], 1.6)]
TOWER = (8.5, -5.0)                                         # 以太气候调节塔：从中层伸到约 900 m
placed.append((*TOWER, .5))
styles = ['neo', 'glass', 'gothic', 'dome', 'villa']
tries = 0
while len(placed) < 34 and tries < 8000:                   # 数十座：约 30 座其他庄园
    tries += 1
    rx = .3 + random.random() ** 2 * .8; ry = rx * (.6 + random.random() * .35)
    x, y = random.uniform(-W / 2 + 1, W / 2 - 1), random.uniform(-H / 2 + 1, H / 2 - 1)
    if any(math.hypot(x - px, y - py) < rx + pr + .9 for px, py, pr in placed): continue
    island(x, y, 1.3 + random.random() * 6.5, rx, ry, random.random() * math.pi, random.choice(styles))
    placed.append((x, y, rx))
cyl(*TOWER, -7, .12, 9.2, M['stone'], 32)
for k in range(5): cyl(*TOWER, .3 + k * .42, .17, .03, M['pad'], 32)
markers.append({'id': 'climate_tower', 'pos': (*TOWER, 2.2)})

# ---------------- 光照与相机 ----------------
world = bpy.data.worlds.new('sky'); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (.55, .65, .8, 1); bg.inputs['Strength'].default_value = .35
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = math.radians(1.2); sun.color = (1, .96, .9)
so = bpy.data.objects.new('sun', sun); col_main.objects.link(so); so.rotation_euler = (math.radians(40), 0, math.radians(215))
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = W; cam.clip_end = 200
co = bpy.data.objects.new('cam', cam); col_main.objects.link(co); sc.camera = co; co.location = (0, 0, 60)
sc.render.resolution_x = RES; sc.render.resolution_y = int(round(RES * H / W))
sc.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = 'GPU'
except Exception as e: print('GPU fallback', e)
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0
sc.render.image_settings.file_format = 'PNG'; os.makedirs(os.path.dirname(OUT), exist_ok=True); sc.render.filepath = OUT
bpy.context.view_layer.update()
# 标记与岛屿轮廓（归一化图像坐标，左上原点）：查看器用来放标记、画结界圈和航线
def norm(p): v = world_to_camera_view(sc, co, Vector(p)); return round(v.x, 4), round(1 - v.y, 4)
data = {'extent_m': [W * 100, H * 100],
        'markers': [dict(id=m['id'], **dict(zip(('nx', 'ny'), norm(m['pos'])))) for m in markers],
        'islands': [dict(id=i['id'], nx=norm((i['x'], i['y'], i['z']))[0], ny=norm((i['x'], i['y'], i['z']))[1],
                         rx=round(i['rx'] / W, 4), ry=round(i['ry'] / H, 4), rot=round(i['rot'], 3), alt_m=round(700 + i['z'] * 100)) for i in islands]}
json.dump(data, open(os.path.join(HERE, '..', 'map', 'data', 'tc_upper.json'), 'w'), ensure_ascii=False, indent=1)
bpy.ops.render.render(write_still=True)
print('WROTE', OUT, sc.render.resolution_x, sc.render.resolution_y, 'islands', len(islands))
