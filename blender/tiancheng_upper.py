# 天城 · 上层（悬浮庄园区，离地 800–1500 m）· Blender 正俯视写实渲染（第二版：可读性优先）
# 用法：Blender -b -P tiancheng_upper.py -- [--res 1600] [--samples 64] [--out path.png] [--haze .25] [--crop x0,y0,x1,y1] [--preview] [--data-only]
#       或 python3 tiancheng_upper.py -- ...（pip 装的 bpy）。参数与导出格式三层一致，见 docs/tiancheng-maps.md
# 1 单位 = 100 m。z=0 为中层楼顶（约 700 m），岛屿 z = (海拔 - 700) / 100。
# 思路（见 ROADMAP P1）：正俯视、白天；中层城市压在半透明霾层之下作远景，岛屿投影落在城市上；
# 结界穹顶、航线、巡逻线不烘进底图，只导出坐标给查看器做可开关的叠加层。
import bpy, bmesh, json, math, os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tc_common as tc
from tc_common import W, H, mat, noise_mat, tick
from mathutils import Vector, Matrix

layer = tc.Layer('tc_upper')                        # 解析参数、清空场景、生成城市（第一个随机调用）；岛屿沿用同一种子的 random 序列
sc, col_main, city, HAZE = layer.sc, layer.col, layer.city, layer.f('--haze', .25)

# ---------------- 材质 ----------------
M = {
    'grass': noise_mat('grass', (.07, .13, .04), (.15, .24, .07), 22, .9, .35),
    'grass2': noise_mat('grass2', (.09, .15, .05), (.18, .27, .09), 26, .9, .3),
    'grass3': noise_mat('grass3', (.12, .14, .05), (.23, .26, .10), 18, .9, .35),     # 偏黄的草坡
    'lawn': noise_mat('lawn', (.20, .33, .11), (.27, .40, .15), 120, .85, .05),
    'rock': noise_mat('rock', (.22, .19, .16), (.40, .35, .30), 18, .95, .6),
    'rim': mat('rim', (.55, .53, .50), .7),
    'marble': mat('marble', (.80, .78, .74), .35, spec=.6),
    'roof': mat('roof', (.40, .42, .46), .5),
    'roofw': mat('roofw', (.60, .60, .60), .6),
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

# 树：先收集坐标，最后各用 numpy 一次建网格（random 的调用次数与顺序不变，岛屿布局不受影响）
TREES = {'tree1': [], 'tree2': []}
def tree(x, y, z, r, kind=None):
    TREES[kind or ('tree1' if random.random() < .5 else 'tree2')].append((x, y, z + r * .55, r))
def flush_trees():
    for k, pts in TREES.items(): tc.ico_mesh(k, pts, M[k])

# ---------------- 中层楼顶（远景，白天无霓虹；楼顶约在 z=-2.2…0）----------------
# 城市生成在 tc_common：必须先于其他随机调用（岛屿、树），三层才对得上
# 细节层用自己的随机序列（不碰城市的 rng，也不碰岛屿用的 random），布局与 v0.7.0 一致
import numpy as np, tc_detail as td
D = np.random.default_rng(5501)
ZG = tc.Z_GROUND
tc.road_plane(None, m=td.asphalt_mat('road', (.09, .09, .10)))    # 路面：沥青颗粒、补丁（比楼顶暗）
cmat = td.city_mat('citymat', .7)
tc.box_mesh('city', city['boxes'], city['colors'], cmat)
bi = city['kind'] == tc.K_BUILDING
kit = td.building_kit(city['boxes'][bi], city['colors'][bi], D, 'day', cap=.3)   # 女儿墙、退台、坡顶、设备、太阳能板、屋顶花园
td.build_kit('city', kit, cmat, td.city_mat('roofmat', .6, grime=.8))
mb, mc = td.road_marks(city, ZG + .0002); tc.box_mesh('road_marks', mb, mc, td.city_mat('markmat', .6, ao=0, grime=1.5))
cars, crot, cdir, ccol = td.traffic(city, D, ZG, 2.2, jam=lambda x, y: tc.district(x, y))
tc.box_mesh('cars', cars, ccol, tc.vcol_mat('carmat', .25, .6), rot=crot); tick(f'details: marks {len(mb)}, cars {len(cars)}')
for t in city['trees']: tree(*t)                            # 公园里的树
tick('city')
# 霾层：上层与中层之间的一张半透明平面（比体积雾好控，不投影）
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, .4)); haze = bpy.context.active_object; haze.scale = (W * 1.3, H * 1.3, 1)
hm = bpy.data.materials.new('haze'); hm.use_nodes = True; nt = hm.node_tree; out = nt.nodes['Material Output']; nt.nodes.remove(nt.nodes['Principled BSDF'])
tr = nt.nodes.new('ShaderNodeBsdfTransparent'); df = nt.nodes.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (.46, .52, .62, 1)
mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = HAZE
nt.links.new(tr.outputs['BSDF'], mx.inputs[1]); nt.links.new(df.outputs['BSDF'], mx.inputs[2]); nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
haze.data.materials.append(hm); haze.visible_shadow = False

# ---------------- 悬浮岛 ----------------
markers, islands = layer.markers, []
def island(x, y, z, rx, ry, rot=0, style='neo', name=None, trees=True):
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=1)
    me = bpy.data.meshes.new('top'); bm.to_mesh(me); bm.free()
    top = bpy.data.objects.new('top', me); col_main.objects.link(top)
    top.location = (x, y, z); top.scale = (rx, ry, 1); top.rotation_euler[2] = rot; top.data.materials.append(M[random.choice(('grass', 'grass2', 'grass3'))])
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
        dense = 110 if style == 'gothic' else 60                  # 哥特式庄园：浓密林地
        for _ in range(int(rx * ry * dense)):
            a = random.random() * 2 * math.pi; r = math.sqrt(random.random()) * .9
            px, py = math.cos(a) * r * rx, math.sin(a) * r * ry
            px, py = px * math.cos(rot) - py * math.sin(rot), px * math.sin(rot) + py * math.cos(rot)
            if style not in ('none', 'gothic') and math.hypot(px / rx, py / ry) < .55: continue
            tree(x + px, y + py, z + .01, .02 + random.random() * .03)
    if style not in ('none', 'gothic'):                           # 修剪过的草坪核心（比外圈草地亮）
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1, depth=.002, location=(x, y, z + .012))
        lawn = bpy.context.active_object; lawn.scale = (rx * .55, ry * .55, 1); lawn.rotation_euler[2] = rot; link(lawn, M['lawn'])
    if style != 'none': building(x, y, z, rx, ry, rot, style)
    islands.append({'id': name or f'isle{len(islands)}', 'x': x, 'y': y, 'z': z, 'rx': rx, 'ry': ry, 'rot': rot})
    if name: markers.append({'id': name, 'pos': (x, y, z), 'r': max(rx, ry)})
def building(x, y, z, rx, ry, rot, style):
    s = min(rx, ry); c, si = math.cos(rot), math.sin(rot); z += .012
    at = lambda dx, dy: (x + dx * c - dy * si, y + dx * si + dy * c)
    if style == 'neo':                                            # 新古典：白石主楼 + 中轴步道 + 长条泳池
        cube(x, y, z, s * .7, s * .35, .08, M['marble'], rot); cube(x, y, z + .08, s * .72, s * .37, .01, M['roof'], rot)
        cube(*at(0, -s * .45), z, s * .06, s * .5, .002, M['path'], rot); cube(*at(0, s * .33), z, s * .18, s * .07, .003, M['water'], rot)
    elif style == 'glass':                                        # 现代玻璃：塔楼 + 岛缘无边泳池
        cube(x, y, z, s * .3, s * .3, s * .6, M['glass'], rot); cube(*at(s * .3, 0), z, s * .22, s * .3, s * .3, M['glass'], rot)
        cube(*at(-s * .45, -s * .2), z, s * .12, s * .35, .003, M['water'], rot)
    elif style == 'gothic':                                       # 哥特：深色石塔群，藏在林中
        for dx, h in [(-.15, .3), (0, .45), (.15, .3)]:
            cube(*at(dx * s, 0), z, s * .12, s * .14, h * s, M['darkstone'], rot)
        cube(x, y, z - .005, s * .5, s * .2, .004, M['path'], rot)
    elif style == 'dome':                                         # 金顶：方形主楼 + 放射状园路
        cube(x, y, z, s * .5, s * .5, s * .15, M['marble'], rot); sphere(x, y, z + s * .15, s * .2, M['gold'])
        for k in range(4): cube(x, y, z - .004, s * 1.05, s * .04, .002, M['path'], rot + k * math.pi / 4)
    elif style == 'villa':                                        # 红顶别墅 + 果园行树 + 泳池
        cube(*at(-s * .1, 0), z, s * .55, s * .25, .05, M['roof_red'], rot); cube(*at(s * .15, s * .05), z + .05, s * .3, s * .2, .04, M['glass'], rot)
        cube(*at(s * .1, -s * .3), z, s * .22, s * .1, .004, M['water'], rot)
        for i in range(-3, 4):
            for j in range(2): tree(*at(i * s * .09, s * (.32 + j * .09)), z, s * .025, 'tree2')

# 伊甸庄园：按「庄园布局」（主体约 40×18 m 三层，新古典白石；前庭喷泉朝南、后庭人工湖在北；访客停靠平台）
def eden(x, y, z, k=2.3):
    # {{user}} 的主阵地：整座岛与庭园按 k 倍放大，让它在视觉上压过其他庄园（设定只写「独占一座悬浮岛」，尺寸为艺术放大）
    rx, ry = .72 * k, .54 * k
    island(x, y, z, rx, ry, 0, 'none', name='eden', trees=False)
    for _ in range(int(90 * k * 1.6)):                   # 树只种在外圈，留出庭园
        a = random.random() * 2 * math.pi; r = .8 + random.random() * .13
        tree(x + math.cos(a) * r * rx, y + math.sin(a) * r * ry, z + .01, .02 + random.random() * .03)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1, depth=.002, location=(x, y, z + .012))   # 椭圆草坪，高过起伏的草地
    lawn = bpy.context.active_object; lawn.scale = (rx * .8, ry * .78, 1); link(lawn, M['lawn']); z += .013
    K = lambda *v: tuple(t * k for t in v)
    # 白石主楼：女儿墙（白）+ 内收屋面（浅灰）+ 中央穹顶；两翼同理
    cube(x, y + .02 * k, z, *K(.40, .18, .15), M['marble']); cube(x, y + .02 * k, z + .15 * k, *K(.37, .15, .004), M['roofw'])
    sphere(x, y + .02 * k, z + .15 * k, .035 * k, M['marble'])
    for dx in (-.26, .26): cube(x + dx * k, y + .03 * k, z, *K(.12, .14, .10), M['marble']); cube(x + dx * k, y + .03 * k, z + .10 * k, *K(.1, .12, .004), M['roofw'])
    for i in range(8): cyl(x + (-.07 + i * .02) * k, y - .075 * k, z, .004 * k, .12 * k, M['marble'], 8)   # 正面柱廊
    cube(x, y - .2 * k, z, *K(.03, .22, .003), M['path'])                                                 # 中轴步道
    for sx in (-1, 1):                                                                                      # 前庭两侧的规整花坛（树篱格）
        for i in range(3):
            for j in range(2): cube(x + sx * (.07 + i * .045) * k, y - (.17 + j * .06) * k, z, *K(.035, .045, .006), M['tree2'])
    cyl(x, y - .2 * k, z, .035 * k, .012 * k, M['marble'], 32); cyl(x, y - .2 * k, z + .004 * k, .028 * k, .009 * k, M['water'], 32)   # 前庭喷泉
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1, depth=.004, location=(x - .28 * k, y + .3 * k, z + .002))
    lake = bpy.context.active_object; lake.scale = (.13 * k, .07 * k, 1); link(lake, M['water'])        # 后庭人工湖
    cyl(x + .25 * k, y + .3 * k, z, .025 * k, .03 * k, M['marble'], 8)                                  # 凉亭
    cube(x + .05 * k, y + .33 * k, z, *K(.14, .08, .002), M['path'])                                    # 露天训练场
    cyl(x + .12 * k, y + .22 * k, z, .02 * k, .09 * k, M['marble'], 16)                                 # 以太凝水塔（供喷泉）
    cyl(x + rx + .12 * k, y - .05 * k, z - .01, .1 * k, .012, M['pad'], 48)                           # 访客载具停靠平台
    car(x + rx + .12 * k, y - .05 * k, z + .012, 0)
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

# 浮岛布局是数据（blender/data/tc_islands.json），不再依赖随机序列：改城市、加细节都不会挪动岛屿，也可以直接手改
ISLES = json.load(open(os.path.join(tc.HERE, 'data', 'tc_islands.json')))['islands']
for i in ISLES:
    if i['id'] == 'eden': eden(i['x'], i['y'], i['z'])                  # 伊甸庄园约 1150 m，片区中央偏右
    elif i['id'] == 'silver_crown': silver_crown(i['x'], i['y'], i['z'])   # 银冠堡：上层与中层交界（800 m）
    else: island(i['x'], i['y'], i['z'], i['rx'], i['ry'], i['rot'], i['style'])
TOWER = (8.5, -5.0)                                         # 以太气候调节塔：从中层伸到约 900 m
cyl(*TOWER, -7, .12, 9.2, M['stone'], 32)
for k in range(5): cyl(*TOWER, .3 + k * .42, .17, .03, M['pad'], 32)
markers.append({'id': 'climate_tower', 'pos': (*TOWER, 2.2), 'r': .2})
flush_trees(); tick('islands + trees')

# ---------------- 光照与相机 ----------------
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = math.radians(1.2); sun.color = (1, .96, .9)
so = bpy.data.objects.new('sun', sun); col_main.objects.link(so); so.rotation_euler = tc.SUN_ROT   # 三层共用的太阳方向
# 标记与岛屿轮廓（归一化图像坐标，左上原点）：查看器用来放标记、画结界圈和航线
def export(co):
    norm = lambda p: tc.norm(sc, co, p)
    return {'islands': [dict(id=i['id'], nx=norm((i['x'], i['y'], i['z']))[0], ny=norm((i['x'], i['y'], i['z']))[1],
                             rx=round(i['rx'] / W, 4), ry=round(i['ry'] / H, 4), rot=round(i['rot'], 3), alt_m=round(700 + i['z'] * 100)) for i in islands]}
layer.finish(world=((.55, .65, .8), .35), extra=export, label=f'islands {len(islands)}')
