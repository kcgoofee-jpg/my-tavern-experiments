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
    dense = {'english': 30, 'chateau': 18, 'suzhou': 70, 'lingnan': 85}.get(style, 0) if trees else 0
    core = {'english': .5, 'chateau': .68, 'suzhou': .62, 'lingnan': .6}.get(style, .55)   # 核心区留给建筑与园子，树种在外圈
    for _ in range(int(rx * ry * dense)):
        a = random.random() * 2 * math.pi; r = math.sqrt(random.random()) * .9
        px, py = math.cos(a) * r * rx, math.sin(a) * r * ry
        px, py = px * math.cos(rot) - py * math.sin(rot), px * math.sin(rot) + py * math.cos(rot)
        if math.hypot(px / rx, py / ry) < core: continue
        tree(x + px, y + py, z + .01, (.02 + random.random() * .03) * (1.4 if style == 'lingnan' else 1))
    if style in ('english', 'chateau'):                            # 修剪过的草坪（比外圈草地亮）
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1, depth=.002, location=(x, y, z + .012))
        lawn = bpy.context.active_object; lawn.scale = (rx * core, ry * core, 1); lawn.rotation_euler[2] = rot; link(lawn, M['lawn'])
    if style not in ('none', 'neoclassical', 'fortress'): estate(x, y, z, rx, ry, rot, style)
    islands.append({'id': name or f'isle{len(islands)}', 'x': x, 'y': y, 'z': z, 'rx': rx, 'ry': ry, 'rot': rot, 'estate_style': style if style != 'none' else {'eden': 'neoclassical', 'silver_crown': 'fortress'}.get(name, 'none')})
    if name: markers.append({'id': name, 'pos': (x, y, z), 'r': max(rx, ry)})
def estate(x, y, z, rx, ry, rot, style):
    """岛上庄园：英国乡村庄园 / 法国城堡与规整花园 / 苏州园林 / 岭南园林。尺寸按真实庄园折算（1 单位 = 100 m），岛越大园子越大。"""
    s = min(rx, ry) * 1.5; c, si = math.cos(rot), math.sin(rot); z += .012
    at = lambda dx, dy: (x + dx * c - dy * si, y + dx * si + dy * c)
    rnd = random.random
    if style == 'english':                                        # 英国乡村庄园：蜂蜜色石头主楼（L 形）+ 石板瓦坡顶；自然式草坡、蛇形湖、成团的树、弯曲的砾石车道
        ox = (rnd() - .5) * s * .2
        cube(*at(ox, s * .05), z, s * .34, s * .14, .05, M['stone_warm'], rot); roof(*at(ox, s * .05), z + .05, s * .34, s * .14, s * .05, rot, (.2, .21, .23))
        cube(*at(ox + s * .2, s * .14), z, s * .12, s * .2, .045, M['stone_warm'], rot); roof(*at(ox + s * .2, s * .14), z + .045, s * .2, s * .12, s * .045, rot + math.pi / 2, (.2, .21, .23))
        for k in range(3):                                         # 蛇形湖：几个错开的椭圆
            bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=1, depth=.003, location=(*at(-s * (.25 + .12 * k), -s * (.3 - .08 * k)), z + .001))
            o = bpy.context.active_object; o.scale = (s * (.16 - .03 * k), s * .07, 1); o.rotation_euler[2] = rot + .4 * k; link(o, M['water'])
        for t in range(14):                                        # 弯曲车道：从岛缘绕到主楼前
            a = -1.2 + t * .1; cube(*at(ox + math.cos(a) * s * .45, math.sin(a) * s * .38), z, s * .07, s * .018, .002, M['gravel'], rot + a + math.pi / 2)
        for _ in range(int(3 + s * 8)):                            # 成团的树（英式风景园）
            a, r = rnd() * 2 * math.pi, s * (.2 + rnd() * .3); cx_, cy_ = at(math.cos(a) * r, math.sin(a) * r * .8)
            for _ in range(int(5 + rnd() * 9)): tree(cx_ + (rnd() - .5) * s * .12, cy_ + (rnd() - .5) * s * .12, z, .018 + rnd() * .02, 'tree1')
    elif style == 'chateau':                                      # 法国城堡：U 形主楼 + 角楼（深灰蓝孟莎顶）；正前方中轴规整花园（绿篱方格、砾石路、长条水渠、林荫道）
        cube(*at(0, s * .18), z, s * .42, s * .1, .06, M['marble'], rot); roof(*at(0, s * .18), z + .06, s * .42, s * .1, s * .04, rot, (.15, .17, .22))
        for sx in (-1, 1):
            cube(*at(sx * s * .21, s * .06), z, s * .09, s * .22, .055, M['marble'], rot); roof(*at(sx * s * .21, s * .06), z + .055, s * .22, s * .09, s * .035, rot + math.pi / 2, (.15, .17, .22))
            cyl(*at(sx * s * .21, s * .22), z, s * .035, .075, M['marble'], 16); cyl(*at(sx * s * .21, s * .22), z + .075, s * .038, s * .05, M['darkstone'], 16, r2=.002)
        cube(*at(0, -s * .25), z, s * .5, s * .36, .002, M['gravel'], rot)       # 花坛区的砾石底
        for i in range(-2, 3):                                       # 绿篱方格（parterre）
            for j in range(3):
                if i == 0: continue
                cube(*at(i * s * .095, -s * (.12 + j * .11)), z + .002, s * .075, s * .085, .006, M['hedge'], rot)
        cube(*at(0, -s * .25), z + .002, s * .025, s * .36, .002, M['water'], rot)   # 中轴水渠
        for sx in (-1, 1):                                           # 林荫道
            for j in range(9): tree(*at(sx * s * .3, -s * (.05 + j * .06)), z, s * .022, 'tree2')
        cube(*at(0, s * .3), z, s * .08, s * .18, .002, M['gravel'], rot)          # 前庭入口
    elif style == 'suzhou':                                       # 苏州园林：粉墙黛瓦围合，中间不规则水池、太湖石假山、曲桥、亭子与厅堂
        w_, d_ = s * .9, s * .7
        for sy in (-1, 1): cube(*at(0, sy * d_ / 2), z, w_, .004, .03, M['whitewall'], rot); roof(*at(0, sy * d_ / 2), z + .03, w_, .01, .004, rot, (.12, .12, .13))
        for sx in (-1, 1): cube(*at(sx * w_ / 2, 0), z, .004, d_, .03, M['whitewall'], rot); roof(*at(sx * w_ / 2, 0), z + .03, d_, .01, .004, rot + math.pi / 2, (.12, .12, .13))
        for k, (ox, oy, sx_, sy_) in enumerate(((-.05, 0, .26, .16), (.14, .07, .14, .1), (-.2, -.06, .12, .08))):   # 不规则水池
            bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=1, depth=.003, location=(*at(ox * s, oy * s), z + .001))
            o = bpy.context.active_object; o.scale = (s * sx_, s * sy_, 1); o.rotation_euler[2] = rot + k; link(o, M['water'])
        for _ in range(int(10 + s * 20)):                            # 假山石
            a = rnd() * 2 * math.pi; sphere(*at(-.05 * s + math.cos(a) * s * .3, math.sin(a) * s * .21), z, .006 + rnd() * .012, M['rockery'], 8)
        for k in range(6): cube(*at((-.12 + k * .045) * s, (.02 if k % 2 else -.02) * s), z + .003, s * .05, s * .012, .002, M['path'], rot + (.5 if k % 2 else -.5))   # 九曲桥
        for ox, oy, ww, dd in ((0, .25, .3, .08), (-.3, -.22, .14, .07), (.3, -.2, .1, .1)):   # 厅堂、轩、亭
            cube(*at(ox * s, oy * s), z, ww * s, dd * s, .025, M['whitewall'], rot); roof(*at(ox * s, oy * s), z + .025, ww * s * 1.1, dd * s * 1.25, dd * s * .45, rot, (.12, .12, .13))
        for _ in range(int(12 + s * 25)):                            # 园内的树
            a = rnd() * 2 * math.pi; r = .35 + rnd() * .1; tree(*at(math.cos(a) * r * w_, math.sin(a) * r * d_), z, .012 + rnd() * .014, 'tree2')
    elif style == 'lingnan':                                      # 岭南园林：青砖灰瓦的院落群（三进两院），方正鱼池 + 水榭，浓密的榕树
        for i in range(3):
            for j in range(2):
                ox, oy = (i - 1) * s * .19, (j - .5) * s * .26
                cube(*at(ox, oy + s * .06), z, s * .16, s * .05, .03, M['greybrick'], rot); roof(*at(ox, oy + s * .06), z + .03, s * .16, s * .05, s * .02, rot, (.16, .16, .17))
                cube(*at(ox, oy - s * .06), z, s * .16, s * .05, .03, M['greybrick'], rot); roof(*at(ox, oy - s * .06), z + .03, s * .16, s * .05, s * .02, rot, (.16, .16, .17))
                cube(*at(ox, oy), z, s * .15, s * .07, .002, M['path'], rot)                 # 天井
        cube(*at(0, -s * .38), z, s * .34, s * .12, .003, M['water'], rot)                   # 鱼池
        cube(*at(s * .12, -s * .38), z, s * .07, s * .07, .02, M['greybrick'], rot); roof(*at(s * .12, -s * .38), z + .02, s * .08, s * .08, s * .03, rot, (.16, .16, .17))
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
    else: island(i['x'], i['y'], i['z'], i['rx'], i['ry'], i['rot'], i.get('estate_style', 'english'))
TOWER = (8.5, -5.0)                                         # 以太气候调节塔：从中层伸到约 900 m
cyl(*TOWER, -7, .12, 9.2, M['stone'], 32)
for k in range(5): cyl(*TOWER, .3 + k * .42, .17, .03, M['pad'], 32)
markers.append({'id': 'climate_tower', 'pos': (*TOWER, 2.2), 'r': .2})
flush_trees(); tick('islands + trees')

# ---------------- 光照与相机 ----------------
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = math.radians(1.2); sun.color = (1, .96, .9)
so = bpy.data.objects.new('sun', sun); col_main.objects.link(so); so.rotation_euler = tc.SUN_ROT   # 三层共用的太阳方向
if BELOW == 'clouds': __import__('tc_clouds').build_cloud_sea(layer, islands, so)   # 云海与岛影（blender/tc_clouds.py，--clouds toon|soft）
# 标记与岛屿轮廓（归一化图像坐标，左上原点）：查看器用来放标记、画结界圈和航线
def export(co):
    norm = lambda p: tc.norm(sc, co, p)
    return {'islands': [dict(id=i['id'], nx=norm((i['x'], i['y'], i['z']))[0], ny=norm((i['x'], i['y'], i['z']))[1],
                             rx=round(i['rx'] / W, 4), ry=round(i['ry'] / H, 4), rot=round(i['rot'], 3), alt_m=round(700 + i['z'] * 100),
                             estate_style=i['estate_style']) for i in islands]}
layer.finish(world=((.55, .65, .8), .35), extra=export, label=f'islands {len(islands)}')
