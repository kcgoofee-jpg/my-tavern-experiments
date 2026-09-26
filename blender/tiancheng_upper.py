# 天城 · 上层（悬浮庄园区，离地 800–1500 m）· Blender 正俯视写实渲染（第二版：可读性优先）
# 用法：Blender -b -P tiancheng_upper.py -- [--res 1600] [--samples 64] [--out path.png] [--below clouds|city] [--haze .25] [--crop x0,y0,x1,y1] [--preview] [--data-only]
#       --below clouds（默认）：岛屿下方是一片云海，看不到中层城市；图小、加载快。
#       --below city：下方是中层城市（OSM 真实路网与建筑轮廓，© OpenStreetMap contributors），压在一层霾下作远景。
#       或 python3 tiancheng_upper.py -- ...（pip 装的 bpy）。参数与导出格式三层一致，见 docs/tiancheng-maps.md
# 1 单位 = 100 m。z=0 为中层楼顶（约 700 m），岛屿 z = (海拔 - 700) / 100。
# 思路（见 ROADMAP P1）：正俯视、白天；岛屿投影落在下方的云海（或城市）上；
# 结界穹顶、航线、巡逻线不烘进底图，只导出坐标给查看器做可开关的叠加层。
import bpy, bmesh, json, math, os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tc_common as tc
from tc_common import W, H, mat, noise_mat, tick
from mathutils import Vector, Matrix

layer = tc.Layer('tc_upper', city='upper')                        # 解析参数、清空场景、生成城市（第一个随机调用）；岛屿沿用同一种子的 random 序列
sc, col_main, city, HAZE = layer.sc, layer.col, layer.city, layer.f('--haze', .25)
BELOW = str(layer.opt.get('--below', 'clouds'))

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
    # 庄园风格用的材料
    'stone_warm': noise_mat('stone_warm', (.5, .45, .37), (.6, .55, .46), 60, .8, .15),   # 英式庄园的蜂蜜色石头
    'gravel': noise_mat('gravel', (.55, .52, .46), (.66, .63, .57), 300, .9, .1),          # 砾石车道、法式花园的园路
    'hedge': noise_mat('hedge', (.04, .1, .03), (.07, .15, .05), 200, .9, .4),            # 修剪的黄杨绿篱
    'whitewall': mat('whitewall', (.78, .77, .74), .7),                                     # 苏州园林的粉墙
    'greybrick': noise_mat('greybrick', (.3, .3, .3), (.38, .37, .36), 150, .85, .1),     # 岭南青砖
    'rockery': noise_mat('rockery', (.42, .42, .4), (.62, .61, .58), 40, .9, .8),         # 太湖石假山
}

def link(ob, m=None):
    if m: ob.data.materials.append(m)
    return ob
def cube(x, y, z, sx, sy, sz, m, rot=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2)); o = bpy.context.active_object
    o.scale = (sx, sy, sz); o.rotation_euler[2] = rot; return link(o, m)
def cyl(x, y, z, r, h, m, verts=24, r2=None):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(x, y, z + h / 2))
    else: bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=h, location=(x, y, z + h / 2))   # 尖顶（角楼）
    return link(bpy.context.active_object, m)
def sphere(x, y, z, r, m, seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=(x, y, z)); o = bpy.context.active_object
    bpy.ops.object.shade_smooth(); return link(o, m)

# 树：先收集坐标，最后各用 numpy 一次建网格（random 的调用次数与顺序不变，岛屿布局不受影响）
TREES = {'tree1': [], 'tree2': []}
def tree(x, y, z, r, kind=None):
    TREES[kind or ('tree1' if random.random() < .5 else 'tree2')].append((x, y, z + r * .55, r))
ROOFS, ROOFC = [], []                                   # 坡屋顶（三棱柱）：先收集，最后一次建网格
def roof(x, y, z, w, d, h, rot, c): ROOFS.append((x, y, w, d, z, h, rot)); ROOFC.append(c)
def flush_trees():
    for k, pts in TREES.items(): tc.ico_mesh(k, pts, M[k])
    if ROOFS:
        import tc_detail as td_
        td_.prism_mesh('estate_roofs', ROOFS, ROOFC, tc.vcol_mat('roofs_v', .7))

# ---------------- 岛屿下方：云海（默认）或中层城市 ----------------
import numpy as np, tc_detail as td, tc_city
D = np.random.default_rng(5501)                           # 细节层自己的随机（不碰岛屿用的 random），岛屿布局不变
ZG = tc.Z_GROUND
def below_city():
    """中层楼顶远景（白天无霓虹）：OSM 轮廓挤出、楼顶部件、路面标线与车流，压在一层霾下。"""
    tc.road_plane((.2, .2, .19), m=td.city_mat('ground', .85, .02, 1.2))    # 人行道、地块内的硬地（比路亮）
    city.flat_polys('water', city.water, ZG + .002, (.03, .07, .09), mat('water_low', (.03, .07, .09), .05, spec=.8))
    city.flat_polys('parks', city.parks, ZG + .002, (.09, .15, .06), td.city_mat('parkmat', .9, .01, 1.3))
    city.roads_mesh('roads', ZG + .004, td.asphalt_mat('road', (.09, .09, .10)))
    tops = tc_city.tops_mid(city, cap=.3); idx = np.arange(len(city.b))
    cmat = td.city_mat('citymat', .7)
    city.buildings_mesh('city', idx, ZG, tops, city.roof, cmat)
    kit = tc_city.roof_kit(city, idx, tops, city.roof, D, 'day', cap=.3)
    tc_city.build_roof_kit('city', kit, cmat, td.city_mat('roofmat', .6, grime=.8))
    mb, mr, mc = city.road_marks(ZG + .0045); tc.box_mesh('road_marks', mb, mc, td.city_mat('markmat', .6, ao=0, grime=1.5), rot=mr)
    cars, crot, cdir, ccol = city.traffic(D, ZG + .004, 2.2, weight=lambda x, y: tc.district(x, y))
    tc.box_mesh('cars', cars, ccol, tc.vcol_mat('carmat', .25, .6), rot=crot)
    tc.ico_mesh('park_trees', [(x, y, ZG + .004 + r * .55, r) for x, y, r in city.trees], M['tree2'])
    tick(f'city below: {len(city.b)} buildings, marks {len(mb)}, cars {len(cars)}')
    # 霾层：上层与中层之间的一张半透明平面（比体积雾好控，不投影）
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, .4)); haze = bpy.context.active_object; haze.scale = (W * 1.3, H * 1.3, 1)
    haze.data.materials.append(tc.shade_mat('haze', (.46, .52, .62), HAZE)); haze.visible_shadow = False
def below_clouds():
    """云海：两层噪声遮罩的白色平面——下层厚、几乎不透明，起伏靠凹凸；上层是零散的薄云。岛屿的影子落在云上。
    不用体积云：8000px 下体积的噪点和渲染时间都不划算，平面 + 凹凸在正俯视下足够像。"""
    for z, scale, lo, hi, bump, name in ((-.6, .9, .4, .52, 1.4, 'cloud_floor'), (.25, 2.3, .52, .7, .5, 'cloud_wisps')):
        bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, z)); o = bpy.context.active_object; o.name = name; o.scale = (W * 1.3, H * 1.3, 1)
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        nt.nodes.remove(tc.bsdf_of(m))
        tco = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale
        nz.inputs['Detail'].default_value = 12; nz.inputs['Roughness'].default_value = .62; nt.links.new(tco.outputs['Object'], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = lo; mr.inputs['From Max'].default_value = hi
        nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
        df = nt.nodes.new('ShaderNodeBsdfDiffuse')
        n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = scale * 6; n2.inputs['Detail'].default_value = 8
        nt.links.new(tco.outputs['Object'], n2.inputs['Vector'])
        hsum = nt.nodes.new('ShaderNodeMath'); hsum.operation = 'MULTIPLY_ADD'; hsum.inputs[1].default_value = .35
        nt.links.new(n2.outputs['Fac'], hsum.inputs[0]); nt.links.new(nz.outputs['Fac'], hsum.inputs[2])     # 大起伏 + 小团块
        cr = nt.nodes.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].position = .55; cr.color_ramp.elements[1].position = 1.0
        cr.color_ramp.elements[0].color = (.42, .46, .53, 1); cr.color_ramp.elements[1].color = (.8, .81, .84, 1)   # 云谷偏灰蓝、云顶偏白
        nt.links.new(hsum.outputs['Value'], cr.inputs['Fac']); nt.links.new(cr.outputs['Color'], df.inputs['Color'])
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = .8
        nt.links.new(hsum.outputs['Value'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], df.inputs['Normal'])
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
        if name == 'cloud_floor':                          # 下层：云缝里透出一点灰蓝（下方是看不见的城市），不透明
            gap = nt.nodes.new('ShaderNodeBsdfDiffuse'); gap.inputs['Color'].default_value = (.32, .36, .42, 1)
            nt.links.new(mr.outputs['Result'], mx.inputs['Fac']); nt.links.new(gap.outputs['BSDF'], mx.inputs[1]); nt.links.new(df.outputs['BSDF'], mx.inputs[2])
        else:
            nt.links.new(mr.outputs['Result'], mx.inputs['Fac']); nt.links.new(tr.outputs['BSDF'], mx.inputs[1]); nt.links.new(df.outputs['BSDF'], mx.inputs[2])
        nt.links.new(mx.outputs['Shader'], out.inputs['Surface']); o.data.materials.append(m)
        if name == 'cloud_wisps': o.visible_shadow = False
    tick('clouds below')
below_city() if BELOW == 'city' else below_clouds()

# ---------------- 悬浮岛与庄园（blender/tc_estates.py；伊甸府邸 blender/eden_manor.py）----------------
import tc_estates as te
markers, islands = layer.markers, []
ISLES = json.load(open(os.path.join(tc.HERE, 'data', 'tc_islands.json')))['islands']   # 布局是数据，可以直接手改（见 docs/upper-estates.md）
for d in ISLES:
    e = te.Isle(d); e.build_body(col_main)
    if d['id'] == 'eden': te.build_eden(e, layer)
    elif d['id'] == 'silver_crown': te.build_silver_crown(e)
    else: e.build_estate()
    islands.append({'id': d['id'], 'x': e.x, 'y': e.y, 'z': e.z, 'rx': e.rx, 'ry': e.ry, 'rot': e.rot, 'estate_style': e.style, 'isle': e})
    if d['id'] in ('eden', 'silver_crown'): markers.append({'id': d['id'], 'pos': (e.x, e.y, e.z), 'r': max(e.rx, e.ry)})
    if d.get('role'): markers.append({'id': d['role'], 'pos': (e.x, e.y, e.z), 'r': max(e.rx, e.ry)})   # 地标府邸（首相府、将军官邸……），名称在 maps.json
TOWER = (8.5, -5.0)                                         # 以太气候调节塔：从中层伸到约 900 m
cyl(*TOWER, -7, .12, 9.2, M['stone'], 32)
for k in range(5): cyl(*TOWER, .3 + k * .42, .17, .03, M['pad'], 32)
markers.append({'id': 'climate_tower', 'pos': (*TOWER, 2.2), 'r': .2})
flush_trees(); tick(f'islands + estates ({te.flush()} trees)')

# ---------------- 光照与相机 ----------------
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = math.radians(1.2); sun.color = (1, .96, .9)
so = bpy.data.objects.new('sun', sun); col_main.objects.link(so); so.rotation_euler = tc.SUN_ROT   # 三层共用的太阳方向
if BELOW == 'clouds': __import__('tc_clouds').build_cloud_sea(layer, islands, so)   # 云海与岛影（blender/tc_clouds.py，--clouds toon|soft）
# 标记与岛屿轮廓（归一化图像坐标，左上原点）：查看器用来放标记、画结界圈和航线
def export(co):
    norm = lambda p: tc.norm(sc, co, p)
    return {'islands': [dict(id=i['id'], nx=norm((i['x'], i['y'], i['z']))[0], ny=norm((i['x'], i['y'], i['z']))[1],
                             rx=round(i['rx'] / W, 4), ry=round(i['ry'] / H, 4), rot=round(i['rot'], 3), alt_m=round(700 + i['z'] * 100),
                             estate_style=i['estate_style'], shape=i['isle'].shape, rim=i['isle'].rim, terrain=i['isle'].terrain,
                             outline=i['isle'].export(norm), **({'role': i['isle'].d['role']} if i['isle'].d.get('role') else {})) for i in islands],
            'routes': te.routes([i['isle'] for i in islands], norm)}
layer.finish(world=((.55, .65, .8), .35), extra=export, label=f'islands {len(islands)}')
