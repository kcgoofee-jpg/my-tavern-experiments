# 天城 · 上层（悬浮庄园区，800–1500 m）· Blender 写实渲染
# 用法：Blender -b -P tiancheng_upper.py -- [--res 1600] [--samples 64] [--out path.png]
# 1 单位 = 100 m。z=0 为中层楼顶（约 700 m），岛屿 z = (海拔 - 700) / 100。
import bpy, bmesh, json, math, os, sys, random
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {'--res': '1600', '--samples': '64', '--out': os.path.join(HERE, '..', 'map', 'art', 'tc_upper_preview.png'), '--tilt': '25'}
for i in range(0, len(args) - 1, 2): opt[args[i]] = args[i + 1]
RES, SAMPLES, OUT, TILT = int(opt['--res']), int(opt['--samples']), os.path.abspath(opt['--out']), float(opt['--tilt'])
W, H = 12.0, 7.5                                # 1.2 km × 0.75 km 的上层片区
rng = np.random.default_rng(2088); random.seed(2088)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
col_main = sc.collection

# ---------------- 材质工具 ----------------
def mat(name, color, rough=.8, metal=0, emit=None, emit_str=0, alpha=1.0, spec=.5, transmission=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal; b.inputs['Specular IOR Level'].default_value = spec
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = emit_str
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    if transmission: b.inputs['Transmission Weight'].default_value = transmission
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
def dome_mat():
    m = bpy.data.materials.new('barrier'); m.use_nodes = True; nt = m.node_tree
    out = nt.nodes['Material Output']; nt.nodes.remove(nt.nodes['Principled BSDF'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (.55, .9, 1, 1); em.inputs['Strength'].default_value = .9
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = .05
    mx = nt.nodes.new('ShaderNodeMixShader')
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 6.0
    nt.links.new(lw.outputs['Facing'], pw.inputs[0]); nt.links.new(pw.outputs['Value'], mx.inputs['Fac'])
    nt.links.new(tr.outputs['BSDF'], mx.inputs[1]); nt.links.new(em.outputs['Emission'], mx.inputs[2])
    nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
    return m

M = {
    'grass': noise_mat('grass', (.06, .12, .035), (.14, .22, .06), 22, .9, .35),
    'lawn': noise_mat('lawn', (.22, .36, .12), (.30, .44, .16), 120, .85, .05),
    'rock': noise_mat('rock', (.22, .19, .16), (.40, .35, .30), 18, .95, .6),
    'marble': mat('marble', (.86, .84, .79), .35, spec=.6),
    'roof': mat('roof', (.42, .44, .48), .5),
    'glass': mat('glass', (.35, .55, .68), .05, metal=.6, spec=.9),
    'gold': mat('gold', (.83, .64, .24), .25, metal=1),
    'stone': noise_mat('stone', (.48, .47, .45), (.62, .61, .58), 30, .8, .2),
    'darkstone': mat('darkstone', (.18, .17, .2), .6),
    'water': mat('water', (.05, .22, .30), .03, spec=.9),
    'path': mat('path', (.72, .68, .58), .7),
    'tree1': mat('tree1', (.07, .16, .05), .9), 'tree2': mat('tree2', (.10, .21, .06), .9),
    'pad': mat('pad', (.55, .57, .6), .4, metal=.3),
    'engine': mat('engine', (.6, .95, 1), .2, emit=(.55, .95, 1), emit_str=25),
    'neon_c': mat('neon_c', (.2, .9, 1), .3, emit=(.25, .9, 1), emit_str=12),
    'trail': mat('trail', (.8, .95, 1), .3, emit=(.7, .95, 1), emit_str=2.5),
    'neon_y': mat('neon_y', (1, .8, .3), .3, emit=(1, .8, .3), emit_str=10),
    'car': mat('car', (.12, .13, .16), .2, metal=.8),
    'barrier': dome_mat(),
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

# ---------------- 中层楼群（真实 3D 楼体，楼顶约在 z=-1…0，即 600–700 m）----------------
def box(a, r):
    k = 2 * r + 1; p = np.pad(a, ((r, r), (r, r)) + ((0, 0),) * (a.ndim - 2), mode='edge')
    c = np.cumsum(np.cumsum(p, 0), 1); c = np.pad(c, ((1, 0), (1, 0)) + ((0, 0),) * (a.ndim - 2))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)
def city_blocks():
    bm = bmesh.new(); neon = bmesh.new()
    gx, gy = np.arange(-W * .9, W * .9, .22), np.arange(-H * 1.3, H * 1.1, .22)
    for x0 in gx:
        for y0 in gy:
            if rng.random() < .08: continue                       # 空地 / 街道缺口
            for _ in range(rng.integers(1, 4)):
                w, d = rng.uniform(.05, .13), rng.uniform(.05, .13)
                x, y = x0 + rng.uniform(-.05, .05), y0 + rng.uniform(-.05, .05)
                top = -2.2 + rng.random() ** 3.5 * 2.4                 # 大多是低矮街区，少数巨塔接近 700 m
                bot = -3.6
                r = bmesh.ops.create_cube(bm, size=1)['verts']
                for v in r: v.co.x = x + v.co.x * w; v.co.y = y + v.co.y * d; v.co.z = bot + (v.co.z + .5) * (top - bot)
                if rng.random() < .35:                                 # 楼顶 / 外墙霓虹
                    q = bmesh.ops.create_cube(neon, size=1)['verts']
                    ww, hh = w * rng.uniform(.4, 1.02), rng.uniform(.01, .03)
                    for v in q: v.co.x = x + v.co.x * ww; v.co.y = y - d / 2 - .002 + v.co.y * .004; v.co.z = top - .05 - rng.random() * .3 + v.co.z * hh
    for name, b_, m in (('city', bm, 'citymat'), ('cityneon', neon, 'neonmat')):
        me = bpy.data.meshes.new(name); b_.to_mesh(me); b_.free(); o = bpy.data.objects.new(name, me); col_main.objects.link(o); yield o
cm = bpy.data.materials.new('citymat'); cm.use_nodes = True; nt = cm.node_tree; b = nt.nodes['Principled BSDF']
# 楼体：按物体坐标的格子噪声给每栋楼不同色调；立面加细窗格发光
vor = nt.nodes.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 9
ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (.07, .075, .085, 1); ramp.color_ramp.elements[1].color = (.24, .22, .2, 1)
nt.links.new(vor.outputs['Distance'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
wave = nt.nodes.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'Z'; wave.inputs['Scale'].default_value = 60
win = nt.nodes.new('ShaderNodeValToRGB'); win.color_ramp.elements[0].position = .85; win.color_ramp.elements[0].color = (0, 0, 0, 1); win.color_ramp.elements[1].color = (1, .78, .45, 1)
nt.links.new(wave.outputs['Fac'], win.inputs['Fac']); nt.links.new(win.outputs['Color'], b.inputs['Emission Color'])
b.inputs['Emission Strength'].default_value = .15; b.inputs['Roughness'].default_value = .6
nm = mat('neonmat', (1, .3, .7), .3, emit=(1, .35, .75), emit_str=18)
for o, m in zip(city_blocks(), (cm, nm)): o.data.materials.append(m)
# 大气雾霾：上层与中层之间
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -2.5)); haze = bpy.context.active_object; haze.scale = (W * 2, H * 3, 6)
hm = bpy.data.materials.new('haze'); hm.use_nodes = True; nt = hm.node_tree; nt.nodes.remove(nt.nodes['Principled BSDF'])
vs = nt.nodes.new('ShaderNodeVolumePrincipled'); vs.inputs['Density'].default_value = .06; vs.inputs['Color'].default_value = (.55, .65, .85, 1)
nt.links.new(vs.outputs['Volume'], nt.nodes['Material Output'].inputs['Volume']); haze.data.materials.append(hm)

# ---------------- 悬浮岛 ----------------
markers = []
def island(x, y, z, rx, ry, rot=0, style='neo', name=None, gold=False):
    # 顶面
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=1)
    me = bpy.data.meshes.new('top'); bm.to_mesh(me); bm.free()
    top = bpy.data.objects.new('top', me); col_main.objects.link(top)
    top.location = (x, y, z); top.scale = (rx, ry, 1); top.rotation_euler[2] = rot; top.data.materials.append(M['grass'])
    sub = top.modifiers.new('s', 'SUBSURF'); sub.subdivision_type = 'SIMPLE'; sub.levels = 4
    tt = bpy.data.textures.new('hill', 'CLOUDS'); tt.noise_scale = .4; dd = top.modifiers.new('h', 'DISPLACE'); dd.texture = tt; dd.strength = .025; dd.mid_level = .5
    # 岩体：倒锥 + 噪声位移
    depth = (rx + ry) * .95
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=1, radius2=.05, depth=1, location=(x, y, z - depth / 2 - .002))
    cone = bpy.context.active_object; cone.scale = (rx, ry, depth); cone.rotation_euler = (math.pi, 0, rot)
    bpy.ops.object.modifier_add(type='SUBSURF'); cone.modifiers[-1].levels = 2
    tex = bpy.data.textures.new('rockn', 'CLOUDS'); tex.noise_scale = .35
    d = cone.modifiers.new('d', 'DISPLACE'); d.texture = tex; d.strength = .25 * min(rx, ry); d.mid_level = .5
    cone.data.materials.append(M['rock'])
    # 以太驱动引擎：底部发光核心 + 光
    tip = sphere(x, y, z - depth * .96, max(.025, rx * .06), M['engine'], seg=12)
    L = bpy.data.lights.new('eng', 'POINT'); L.energy = 40 * rx; L.color = (.5, .95, 1); lo = bpy.data.objects.new('eng', L)
    col_main.objects.link(lo); lo.location = (x, y, z - depth - .1)
    # 树
    n = int(rx * ry * 40)
    for _ in range(n):
        a = random.random() * 2 * math.pi; r = math.sqrt(random.random()) * .92
        px, py = math.cos(a) * r * rx, math.sin(a) * r * ry
        px, py = px * math.cos(rot) - py * math.sin(rot), px * math.sin(rot) + py * math.cos(rot)
        if style != 'none' and abs(px) < rx * .45 and abs(py) < ry * .45: continue
        sphere(x + px, y + py, z + .02, .02 + random.random() * .035, M['tree1' if random.random() < .5 else 'tree2'], seg=8)
    if style != 'none': building(x, y, z, rx, ry, rot, style)
    # 结界穹顶
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1, location=(x, y, z))
    dm = bpy.context.active_object; bm = bmesh.new(); bm.from_mesh(dm.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -.01], context='VERTS'); bm.to_mesh(dm.data); bm.free()
    dm.scale = (rx * 1.04, ry * 1.04, (rx + ry) * .45); dm.rotation_euler[2] = rot; bpy.ops.object.shade_smooth(); dm.data.materials.append(M['barrier'])
    if name: markers.append({'id': name, 'pos': (x, y, z)})
def building(x, y, z, rx, ry, rot, style):
    s = min(rx, ry)
    if style == 'neo':
        cube(x, y, z, s * .7, s * .35, .08, M['marble'], rot); cube(x, y, z + .08, s * .72, s * .37, .01, M['roof'], rot)
    elif style == 'glass':
        cube(x, y, z, s * .25, s * .25, s * .9, M['glass'], rot); cube(x + s * .25, y, z, s * .2, s * .3, s * .35, M['glass'], rot)
    elif style == 'gothic':
        for dx, h in [(-.15, .3), (0, .45), (.15, .3)]:
            cube(x + dx * s, y, z, s * .1, s * .12, h * s, M['darkstone'], rot)
            bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=s * .08, depth=s * .2, location=(x + dx * s, y, z + h * s + s * .1)); link(bpy.context.active_object, M['darkstone'])
    elif style == 'dome':
        cube(x, y, z, s * .5, s * .5, s * .15, M['marble'], rot); sphere(x, y, z + s * .15, s * .2, M['gold'])
    elif style == 'villa':
        cube(x - s * .1, y, z, s * .55, s * .25, .05, M['marble'], rot); cube(x + s * .15, y + s * .05, z + .05, s * .3, s * .2, .04, M['glass'], rot)
        cube(x + s * .1, y - s * .3, z, s * .22, s * .1, .004, M['water'], rot)

# 伊甸庄园：按「庄园布局」（1 单位 = 100 m；主体约 40×18 m，三层；前庭朝南、后庭在北）
def eden(x, y, z):
    rx, ry = .72, .54                                   # 约 1.2 万 ㎡
    island(x, y, z, rx, ry, 0, 'none', gold=True)
    cube(x, y + .02, z, .40, .18, .15, M['marble'])     # 主体 40×18 m，三层约 15 m
    cube(x, y + .02, z + .15, .41, .19, .006, M['roof'])
    for dx in (-.26, .26): cube(x + dx, y + .03, z, .12, .14, .10, M['marble'])      # 两翼
    for k in range(8): cyl(x - .07 + k * .02, y - .075, z, .004, .12, M['marble'], 8)  # 正面柱廊
    cube(x, y - .12, z, .03, .22, .003, M['path'])                                     # 中轴步道
    cyl(x, y - .2, z, .035, .012, M['marble'], 24); cyl(x, y - .2, z + .004, .028, .009, M['water'], 24)   # 喷泉（地标）
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1, depth=.004, location=(x - .28, y + .3, z + .002))
    lake = bpy.context.active_object; lake.scale = (.13, .07, 1); link(lake, M['water'])                    # 后庭园人工湖
    cyl(x + .25, y + .3, z, .025, .03, M['marble'], 8); bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=.035, depth=.025, location=(x + .25, y + .3, z + .045)); link(bpy.context.active_object, M['roof'])   # 凉亭
    cube(x + .05, y + .33, z, .14, .08, .002, M['path'])                                 # 露天训练场
    cyl(x + rx + .08, y - .05, z - .01, .1, .012, M['pad'], 32)                          # 访客载具降落平台
    cube(x + rx - .05, y - .05, z, .04, .04, .035, M['marble'])                          # 警卫岗（推断）
    car(x + rx + .08, y - .05, z + .02, 0)
    markers.append({'id': 'eden', 'pos': (x, y, z)})
def car(x, y, z, rot):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=.02, location=(x, y, z)); o = bpy.context.active_object
    o.scale = (1.8, .8, .5); o.rotation_euler[2] = rot; link(o, M['car'])
    return o

# 银冠堡：上层与中层交界（800 m → z=1）的悬浮要塞
def silver_crown(x, y, z):
    island(x, y, z, 1.5, 1.0, .2, 'none')
    for k in range(20):
        a = k / 20 * 2 * math.pi; cube(x + math.cos(a) * 1.05, y + math.sin(a) * .68, z, .34, .06, .09, M['stone'], a + math.pi / 2)
    for k in range(6):
        a = k / 6 * 2 * math.pi; cyl(x + math.cos(a) * 1.07, y + math.sin(a) * .7, z, .07, .2, M['stone'], 16)
    cube(x, y, z, .5, .35, .25, M['stone']); cyl(x, y, z + .25, .12, .2, M['stone']); cube(x + .5, y - .2, z, .35, .2, .06, M['pad'])
    markers.append({'id': 'silver_crown', 'pos': (x, y, z)})

EDEN = (.4, .3, 4.5)                                      # 伊甸庄园约 1150 m
eden(*EDEN)
silver_crown(-3.9, -2.6, 1.0)
# 其他庄园：数十座，互不重叠
placed = [(EDEN[0], EDEN[1], 1.3), (-3.9, -2.6, 1.9)]
styles = ['neo', 'glass', 'gothic', 'dome', 'villa']
tries = 0
while len(placed) < 16 and tries < 4000:
    tries += 1
    rx = .3 + random.random() ** 2 * .7; ry = rx * (.6 + random.random() * .35)
    x, y = random.uniform(-W / 2 + 1, W / 2 - 1), random.uniform(-H / 2 + 1, H / 2 - 1)
    if any(math.hypot(x - px, y - py) < rx + pr + .45 for px, py, pr in placed): continue
    z = 1.3 + random.random() * 6.5
    island(x, y, z, rx, ry, random.random() * math.pi, random.choice(styles))
    placed.append((x, y, rx))
# 以太气候调节塔：从中层楼顶伸到约 900 m
TOWER = (3.9, -2.4)
cyl(*TOWER, -7, .09, 9.2, M['stone'], 24)
for k in range(5): cyl(*TOWER, .3 + k * .42, .13, .03, M['neon_c'], 24)
sphere(*TOWER, 2.3, .12, M['engine']); markers.append({'id': 'climate_tower', 'pos': (*TOWER, 2.2)})

# 私人悬浮载具航线 + 骑士团巡逻（发光细线）
def trail(p0, p1, m, lift=.8, thick=.006):
    cu = bpy.data.curves.new('tr', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = thick
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(1)
    for bp, p in zip(sp.bezier_points, (p0, p1)): bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    mid = Vector(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, max(p0[2], p1[2]) + lift))
    sp.bezier_points[0].handle_right = mid; sp.bezier_points[1].handle_left = mid
    o = bpy.data.objects.new('trail', cu); col_main.objects.link(o); cu.materials.append(m); return o
isl = [(p[0], p[1]) for p in placed]
pairs = sorted({tuple(sorted((a, min((j for j in range(len(placed)) if j != a), key=lambda j: math.dist(isl[a], isl[j]))))) for a in range(len(placed))})
for a, b_ in pairs[:12]:
    z0 = EDEN[2] if a == 0 else 4; trail((*isl[a], z0 + .05), (*isl[b_], 4.2), M['trail'], .6, .0022)
patrol = [(-5, 2.6, 8.5), (0, 3.2, 8.8), (5, 2.2, 8.5), (5.2, -2.8, 8.2), (0, -3.3, 8.6), (-5.2, -2.4, 8.4)]
for p0, p1 in zip(patrol, patrol[1:] + patrol[:1]):
    tail = (p0[0] + (p0[0] - p1[0]) * .08, p0[1] + (p0[1] - p1[1]) * .08, p0[2])
    trail(tail, p0, M['neon_y'], .0, .004); c = car(*p0, math.atan2(p1[1] - p0[1], p1[0] - p0[0])); c.scale = (2.4, 1.3, .6)

# ---------------- 光照与相机 ----------------
world = bpy.data.worlds.new('sky'); sc.world = world; world.use_nodes = True
sky = world.node_tree.nodes.new('ShaderNodeTexSky')
try: sky.sun_elevation = math.radians(52); sky.sun_rotation = math.radians(200); sky.sun_intensity = .5
except Exception: pass
world.node_tree.links.new(sky.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .3
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.6; sun.angle = math.radians(1.2); sun.color = (1, .96, .9)
so = bpy.data.objects.new('sun', sun); col_main.objects.link(so); so.rotation_euler = (math.radians(38), 0, math.radians(200))
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = W
co = bpy.data.objects.new('cam', cam); col_main.objects.link(co); sc.camera = co
t = math.radians(TILT); aim = Vector((0, .2, 2.0)); co.rotation_euler = (t, 0, 0); co.location = aim + Vector((0, -40 * math.sin(t), 40 * math.cos(t)))
sc.render.resolution_x = RES; sc.render.resolution_y = int(RES * H / W)
sc.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = 'GPU'
except Exception as e: print('GPU fallback', e)
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = -1.2
sc.render.image_settings.file_format = 'PNG'; os.makedirs(os.path.dirname(OUT), exist_ok=True); sc.render.filepath = OUT
bpy.context.view_layer.update()
# 标记坐标（归一化图像坐标，左上原点）供查看器使用
mk = [{'id': m['id'], 'nx': round(v.x, 4), 'ny': round(1 - v.y, 4)} for m in markers for v in [world_to_camera_view(sc, co, Vector(m['pos']))]]
json.dump(mk, open(os.path.join(HERE, '..', 'map', 'data', 'tc_upper_markers.json'), 'w'), ensure_ascii=False, indent=1)
bpy.ops.render.render(write_still=True)
print('WROTE', OUT, sc.render.resolution_x, sc.render.resolution_y, 'islands', len(placed))
