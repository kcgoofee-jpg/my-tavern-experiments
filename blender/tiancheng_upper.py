# 天城 · 上层（悬浮庄园区，离地 800–1500 m）· Blender 正俯视写实渲染（第二版：可读性优先）
# 用法：Blender -b -P tiancheng_upper.py -- [--res 1600] [--samples 64] [--out path.png] [--below clouds|city] [--crop x0,y0,x1,y1] [--preview] [--data-only] [--tod day|dawn|dusk|night]
#       --below clouds（默认）：岛屿下方是一片云海，看不到中层城市；图小、加载快。
#       --below city：下方是中层城市（OSM 真实路网与建筑轮廓，© OpenStreetMap contributors），压在一层霾下作远景。
#       或 python3 tiancheng_upper.py -- ...（pip 装的 bpy）。参数与导出格式三层一致，见 docs/tiancheng-maps.md
#       导出前自检（h_architect.md §4）：任何一条不过就 raise；迭代草稿可加 --selfcheck warn 只打印。结果写 docs/drafts/upper_v5_selfcheck.json
# 1 单位 = 100 m。z=0 为中层楼顶（约 700 m），岛屿 z = (海拔 - 700) / 100。
# 思路（见 ROADMAP P1）：正俯视、白天；岛屿投影落在下方的云海（或城市）上；
# 结界穹顶、航线、巡逻线不烘进底图，只导出坐标给查看器做可开关的叠加层。
import bpy, bmesh, json, math, os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tc_common as tc
from tc_common import W, H, mat, noise_mat, tick
from mathutils import Vector, Matrix

layer = tc.Layer('tc_upper', city='upper')                        # 解析参数、清空场景、生成城市（第一个随机调用）；岛屿沿用同一种子的 random 序列
sc, col_main, city = layer.sc, layer.col, layer.city
BELOW = str(layer.opt.get('--below', 'clouds'))
import tc_clouds
CLOUD_STYLE = str(layer.opt.get('--clouds', tc_clouds.CLOUD_STYLE))
if CLOUD_STYLE == 'veil': BELOW = 'city'                  # 薄纱云原型：云是半透明的，下面必须是城市
import depth as DP                                          # 纵深系统（docs/design/depth-system.md）：海拔、远近缩放、霾都从这里取
DCFG = DP.load()
HAZE = .15 if CLOUD_STYLE == 'veil' else DP.channel('haze', 1.0, DCFG)   # 下方城市在最远处（d = 1）；原 --haze 旗标已退役，改 map/data/upper_depth.json

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
BELOW_OBJS = set(bpy.data.objects) if BELOW == 'city' else None   # 此前建的都是下方城市（重新打光，去掉岛影；薄纱原型与 upper_city 共用）

# ---------------- 悬浮岛与庄园（blender/tc_estates.py；伊甸府邸 blender/eden_manor.py）----------------
import tc_estates as te
markers, islands = layer.markers, []
ISLES = json.load(open(os.environ.get('TC_ISLANDS') or os.path.join(tc.HERE, 'data', 'tc_islands.json')))['islands']   # 布局是数据，可以直接手改（见 docs/upper-estates.md）
for _d in ISLES:                                           # 纵深：z 由海拔派生，rx / ry = 岛表真实尺寸 × scale；岛表里没有 z
    _c = DP.island(_d['id'], DCFG); _d['z'] = round((DCFG['islands'][_d['id']]['alt'] - 700) / 100, 3)
    _d['rx'], _d['ry'] = _d['rx'] * _c['scale'], _d['ry'] * _c['scale']; _d['depth'] = _c
te.assign_families(ISLES)                                   # 同风格普通岛按 id 轮流分配布局族 / 主楼平面（数据里写了就用数据）
te.HUB = next(((d['x'], d['y']) for d in ISLES if d['id'] == 'eden'), None)
for d in ISLES:
    e = te.Isle(d)
    if d['id'] == 'eden' and os.environ.get('TC_EDEN_CUT'): e.main = (0.0, 0.0)   # v9 预览：伊甸整座用 estate2 抠图，底图里不画旧伊甸（免得补洞留灰框）
    else: e.build_body(col_main)
    if d['id'] == 'eden':
        if not os.environ.get('TC_EDEN_CUT'): te.build_eden(e, layer)
    elif d['id'] == 'silver_crown': te.build_silver_crown(e)
    elif d.get('cutout'): e.main = (0.0, 0.0)             # v8：卡里有的岛只建岛体，建筑由三维模型的俯视抠图贴上（tools/isles_into_upper.py）
    else: e.build_estate()
    islands.append({'id': d['id'], 'x': e.x, 'y': e.y, 'z': e.z, 'rx': e.rx, 'ry': e.ry, 'rot': e.rot, 'estate_style': e.style, 'isle': e})
    if d['id'] in ('eden', 'silver_crown'): markers.append({'id': d['id'], 'pos': (e.x, e.y, e.z), 'r': max(e.rx, e.ry), 'anchor': e.world(*e.anchor())})
    if d.get('role'): markers.append({'id': d['role'], 'pos': (e.x, e.y, e.z), 'r': max(e.rx, e.ry), 'anchor': e.world(*e.anchor())})   # 地标府邸（首相府、将军官邸……），名称在 maps.json
# 以太气候调节塔：从中层伸到约 950 m。深色塔身（直径 40 m）、两圈外伸环台、塔顶以太晶冠；塔下云面一圈淡青光晕
TOWER = tuple((lambda a: (a['x'], a['y']))(json.load(open(os.environ.get('TC_ISLANDS') or os.path.join(tc.HERE, 'data', 'tc_islands.json'))).get('anchors', {}).get('climate_tower', {'x': 8.5, 'y': -5.0})))   # 位置在岛表 anchors
TR = .09 if os.environ.get('TC_OBLIQUE') else .2   # v15：斜视里塔身变细（用户：太抢）
_pre_tower = set(bpy.data.objects)
cyl(*TOWER, -7, TR, 9.4, M['darkstone'], 40)
if os.environ.get('TC_OBLIQUE'):                              # 塔身细节：竖向肋 + 每 40 m 一道金属箍 + 窄窗带
    for _j in range(8): _t = _j / 8 * 2 * math.pi; cyl(TOWER[0] + math.cos(_t) * TR, TOWER[1] + math.sin(_t) * TR, -7, .012, 9.4, M['pad'], 6)
    for _z in [i * .4 for i in range(-15, 6)]: cyl(*TOWER, _z, TR + .012, .012, M['pad'], 32)
for k, zz in enumerate((.9, 1.7)):
    cyl(*TOWER, zz, (.34 - k * .05) * TR / .2, .025, M['pad'], 48); cyl(*TOWER, zz + .025, (.31 - k * .05) * TR / .2, .012, M['darkstone'], 48)
    for j in range(12): t = j / 12 * 2 * math.pi; cyl(TOWER[0] + math.cos(t) * (.33 - k * .05) * TR / .2, TOWER[1] + math.sin(t) * (.33 - k * .05) * TR / .2, zz + .02, .008, .012, te.mats()['aether'], 6)
cyl(*TOWER, 2.4, .22 * TR / .2, .05, M['gold'], 40)
aet = te.mats()['aether']
for j in range(9):
    t = j / 9 * 2 * math.pi; rr = .06 + .07 * (j % 3) / 2
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.05 + .02 * (j % 2), location=(TOWER[0] + math.cos(t) * rr, TOWER[1] + math.sin(t) * rr, 2.5 + .08 * (j % 3)))
    o = bpy.context.active_object; o.scale = (1, 1, 2.6); o.data.materials.append(aet)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.09, location=(*TOWER, 2.7)); o = bpy.context.active_object; o.scale = (1, 1, 2.2); o.data.materials.append(aet)
if os.environ.get('TC_MAGITECH'):                          # v2：塔冠约 1500 m（z 8），略高于伊甸（1450 m）——塔竖向拉长，晶冠不变形
    _k = 15.0 / 9.4
    for _o in set(bpy.data.objects) - _pre_tower:
        _o.location.z = -7 + (_o.location.z + 7) * _k
        if _o.dimensions.z > 5: _o.scale.z *= _k
def halo_mat():
    m = bpy.data.materials.new('tower_halo'); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL'); N.remove(tc.bsdf_of(m))
    tco = N.new('ShaderNodeTexCoord'); gr = N.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'; L.new(tco.outputs['Object'], gr.inputs['Vector'])
    pw_ = N.new('ShaderNodeMath'); pw_.operation = 'POWER'; pw_.inputs[1].default_value = 2.0; L.new(gr.outputs['Fac'], pw_.inputs[0])
    sc_ = N.new('ShaderNodeMath'); sc_.operation = 'MULTIPLY'; sc_.inputs[1].default_value = .55; L.new(pw_.outputs['Value'], sc_.inputs[0])
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (.55, .9, 1.0, 1); em.inputs['Strength'].default_value = 1.2
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    L.new(sc_.outputs['Value'], mx.inputs['Fac']); L.new(tr.outputs['BSDF'], mx.inputs[1]); L.new(em.outputs['Emission'], mx.inputs[2]); L.new(mx.outputs['Shader'], out.inputs['Surface'])
    if hasattr(m, 'blend_method'): m.blend_method = 'BLEND'
    return m
bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1.1, fill_type='NGON', location=(*TOWER, 1.05)); halo = bpy.context.active_object; halo.name = 'tower_halo'
halo.data.materials.append(halo_mat()); halo.visible_shadow = False
markers.append({'id': 'climate_tower', 'pos': (*TOWER, 2.2), 'r': .2, 'anchor': (TOWER[0], TOWER[1] - .26)})   # B2 第 3 轮：锚点落在上层环台（半径 .21–.29）上，不再落在云面

# ---------------- v12 魔导科技层 + 纵深（TC_MAGITECH=1；部件在 blender/landmarks/common.py，单位 100 m；docs/upper-setting.md v2）----------------
# 每岛：岛缘符文环、结界六角格边（强度 = derived.ward_alpha，随距离衰减；伊甸 0；「Y」保留一道冷光细边）、崖边能量晶簇。
# 以太导能管：只从调节塔出，最多 3 条，暗管 + 节点微光，走在岛底下，不连伊甸、不连停靠平台（v2 Q1）。调节塔：以太场环。
if os.environ.get('TC_MAGITECH'):
    import importlib.util as _ilu
    _sp = _ilu.spec_from_file_location('lm_common', os.path.join(tc.HERE, 'landmarks', 'common.py')); LC = _ilu.module_from_spec(_sp); _sp.loader.exec_module(LC)
    MG = LC.Batch('mt_islands'); WD = LC.Batch('mt_wards'); RL = LC.Batch('mt_conduits')
    m_rune, m_cry = LC.glow('mt_rune', estr=4.0), LC.flat('mt_crystal', (0.5, 0.85, 1.0), 0.1, emit=LC.AETHER_C, estr=3.0)
    SELF = {'isle30', 'isle9', 'isle25'}                     # 这三座的符文环 / 晶簇在模型抠图里（结界格边仍在这里画，好按深度统一衰减）
    by_id = {i['id']: i for i in islands}
    rnd_m = random.Random(2088)
    for i in islands:
        e = i['isle']; dv = e.d.get('depth', {})
        if i['id'] == 'eden': continue                      # 伊甸不画任何结界边（v2；避开已否决的「伊甸光环」）
        wa = float(dv.get('ward', .3))
        if dv.get('ward_edge') == 'cold':                        # 「Y」：远景里唯一可见的结界——一道冷光细边
            LC.rune_ring(WD, e.outline_world(1.05, 160), e.z + .004, .008, LC.glow('mt_ward_cold', c=(0.62, 0.72, 1.0), estr=3.0), dash=999)
        elif wa > .02:
            LC.hex_ward(WD, e.outline_world(1.05, 120), e.z - .005, .09, LC.hex_ward_mat('mt_ward_' + i['id'], scale=7.0, alpha=min(.6, wa * 1.1), estr=2.2))
        if i['id'] not in SELF:
            LC.rune_ring(MG, e.outline_world(1.015, 120), e.z + .004, .006, m_rune)
            O = e.outline_world(1.02, 60)
            for k in range(6 if i['id'] != 'silver_crown' else 9):
                x, y = O[rnd_m.randrange(len(O))]
                LC.crystal_cluster(MG, x, y, e.z - .02, rnd_m.uniform(.04, .07), m_cry, seed=k + len(i['id']))
    m_pipe, m_node = LC.flat('mt_pipe', (0.06, 0.065, 0.075), 0.5, metal=0.6), LC.glow('mt_node', estr=0.8)
    def _seg_d(p, a, b):
        ax, ay = b[0] - a[0], b[1] - a[1]; t = max(0, min(1, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / (ax * ax + ay * ay)))
        return math.hypot(a[0] + ax * t - p[0], a[1] + ay * t - p[1])
    _ed = by_id.get('eden')
    _cands = sorted((i for i in islands if i['id'] not in ('eden',)), key=lambda i: math.hypot(i['x'] - TOWER[0], i['y'] - TOWER[1]))
    CONDUITS = [i['id'] for i in _cands if not _ed or _seg_d((_ed['x'], _ed['y']), TOWER, (i['x'], i['y'])) > max(_ed['rx'], _ed['ry']) * 1.15][:3]
    print('CONDUITS', CONDUITS)                             # 规则（设定 v3）：最近的 3 座、连线不从伊甸上方 / 下方经过
    for tid in CONDUITS:
        if tid in by_id:
            t = by_id[tid]; P_ = t['isle'].outline_world(1.0, 180); th = math.atan2(TOWER[1] - t['y'], TOWER[0] - t['x'])
            ex_, ey_ = max(P_, key=lambda q: (q[0] - t['x']) * math.cos(th) + (q[1] - t['y']) * math.sin(th))   # 接到岛朝塔一侧的崖底，不从岛面上过
            LC.conduit(RL, TOWER, (ex_, ey_), 1.4, t['z'] - .35, .006, m_pipe, m_node)   # v15：更细更暗，只输能，不读成交通线
    LC.field_rings(RL, *TOWER, 7.6, (.3, .55, .85), .012, LC.glow('mt_field', estr=1.6, alpha=.45))
    for o in LC.Batch.build_all(): o.visible_shadow = False
    if os.environ.get('TC_DUMP_OUTLINES'):                   # 给 tools/upper_depth_post.py：每岛世界坐标轮廓（逐岛蒙版）
        json.dump({i['id']: i['isle'].outline_world(1.06, 96) for i in islands}, open(os.environ['TC_DUMP_OUTLINES'], 'w'))
flush_trees(); tick(f'islands + estates ({te.flush()} trees)')
FACES = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
FACES_R4 = 352151                                           # r4（B2 第 1 轮）同口径的面数

# ---------------- 导出前自检（docs/reviews/upper_b2/h_architect.md §4）：任何一条不过就 raise ----------------
def _near2(I):
    """按边缘间距取每座岛最近的 2 个邻岛。"""
    OL = {i['id']: np.array(i['isle'].outline_world(1.0, 96)) for i in I}; out = {}
    for a in I:
        ds = []
        for b in I:
            if a is b: continue
            if math.hypot(a['x'] - b['x'], a['y'] - b['y']) > max(a['rx'], a['ry']) * 1.5 + max(b['rx'], b['ry']) * 1.5 + 6: ds.append((99, b['id'])); continue
            A, Bm = OL[a['id']], OL[b['id']]; ds.append((float(np.sqrt(((A[:, None, :] - Bm[None, :, :]) ** 2).sum(-1)).min()), b['id']))
        out[a['id']] = sorted(ds)[:2]
    return out
def _pip_np(P, X, Y): return te.pip_np(np.asarray(X), np.asarray(Y), P)
def selfcheck(routes_out, mk):
    R, bad = {}, []
    I = islands; by = {i['id']: i for i in I}; isl = [i['isle'] for i in I]
    cnt = {}
    for i in I: cnt[i['estate_style']] = cnt.get(i['estate_style'], 0) + 1
    R['style_counts'] = cnt
    if set(cnt) - {'english', 'neoclassical', 'fortress'}: bad.append(f'v8 普通岛只用英式填充：{cnt}')   # 2026-09-28：卡里没有的岛不再分四种风格
    tup = {}
    for e in isl:
        if e.d.get('role') or e.d.get('cutout') or e.style in ('neoclassical', 'fortress'): continue
        k = (e.style, e.shape, e.rim, e.terrain, e.layout, e.plan)
        if k in tup: bad.append(f'五元组重复：{e.id} 与 {tup[k]} {k}')
        tup[k] = e.id
    R['tuples'] = len(tup)
    viol = {}
    for e in isl:
        v = [(k, P) for k, P in e.fp if not all(e.inside(x, y, .92) for x, y in P + [(sum(p[0] for p in P) / len(P), sum(p[1] for p in P) / len(P))])]
        if v: viol[e.id] = sorted({k for k, _ in v})
    R['inside92_violations'] = viol
    if viol: print('SELFCHECK inside92 detail', {e.id: [(k, [tuple(round(c, 3) for c in e.world(*q)) for q in P[:2]]) for k, P in e.fp if not all(e.inside(x, y, .92) for x, y in P)] for e in isl if e.id in viol})
    if viol: bad.append(f'inside(.92) 不过：{viol}')
    cov = {e.id: round(e.coverage(), 3) for e in isl}; R['coverage'] = cov
    low = {k: v for k, v in cov.items() if v < .45 and k not in ('eden', 'silver_crown') and not by[k]['isle'].d.get('cutout')}
    if low: bad.append(f'园林覆盖 < 45 %：{low}')   # v8：小岛英式填充（原苏州式 isle21）约 48 %
    spans = [s for e in isl for s in e.terrace_spans]; R['terrace_spans_deg'] = [round(s) for s in spans]
    if any(s > 220 for s in spans): bad.append('台地墙弧跨 > 220°')
    cr = [(c[0], c[1], e.id) for e in isl for c in e.crowns if c is not None and c[1] not in te.TOPIARY]; R['crown_min'] = round(min(r for r, _, _ in cr), 4); R['trees'] = len(cr)
    if R['crown_min'] < te.CROWN_MIN - 1e-6: bad.append(f"树冠半径最小 {R['crown_min']} < .04：{[c for c in cr if c[0] < .04][:5]}")
    R['faces'] = FACES; R['faces_ratio_r4'] = round(FACES / FACES_R4, 3)
    if FACES > FACES_R4 * 1.2 and BELOW != 'city': bad.append(f'面数 {FACES} > r4 × 1.2')   # 预算只管岛与庄园：--below city 时面数含下方城市，只报告不断言
    ed = by['eden']['isle']
    if os.environ.get('TC_EDEN_CUT'): ed.anchors, ed.belvederes, ed.dock = [0] * 4, [1], (0, 0, 1)   # 伊甸由 estate2 抠图提供，旧伊甸的检查不适用
    R['eden_anchors'] = len(ed.anchors); R['eden_belvedere_rear'] = bool(ed.belvederes); R['eden_dock_diam_m'] = round(ed.dock[2] * 200)
    if len(ed.anchors) != 4 or not ed.belvederes or ed.dock[2] * 200 < 45: bad.append('伊甸锚碑 / 观景台 / 停靠平台不合格')
    OLf = [(e, e.outline_world(1.0, 128)) for e in isl]
    rep = []
    for rt in routes_out:
        P = rt['world']; ends = [P[0], P[-1]] if rt['kind'] == 'lane' else []
        S = [(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) for a, b in zip(P, P[1:]) for t in np.linspace(0, 1, 25, endpoint=False)] + [P[-1]]
        S = [q for q in S if all(math.hypot(q[0] - x, q[1] - y) > .3 for x, y in ends)]
        X, Y = np.array([q[0] for q in S]), np.array([q[1] for q in S]); hit = {}
        for e, O in OLf:
            n = int(_pip_np(O, X, Y).sum())
            if n: hit[e.id] = n
        rep.append((rt['kind'], rt['from'], rt['to'], len(P), hit))
        if hit: bad.append(f"航线 {rt['kind']} {rt['from']}→{rt['to']} 进岛 {hit}")
    R['routes'] = rep
    allb = [(e, [e.world(x, y) for x, y in P]) for e in isl for P in e.bldg]
    for m in mk:
        ax, ay = m['anchor']
        if any(te.pip(ax, ay, P) for _, P in allb): bad.append(f"标记 {m['id']} 的锚点落在建筑外包里")
    R['markers_with_anchor'] = sum('anchor' in m for m in mk)
    off = {i['id']: round((i['z'] - .7) * math.tan(math.radians(tc_clouds.CLOUD_ZENITH)), 2) for i in I if i['z'] > 6}; R['shadow_offset_z_gt6'] = off
    if tc_clouds.ISLAND_SHADOWS and any(v > 1.0 for v in off.values()): bad.append(f'z > 6 的岛影子偏移 > 1.0：{off}')
    R['suzhou_pool_ratio'] = {e.id: round(e.pool_ratio, 3) for e in isl if hasattr(e, 'pool_ratio')}
    R['lingnan_pond_ratio'] = {e.id: round(e.pond_ratio, 3) for e in isl if hasattr(e, 'pond_ratio')}
    if not layer.opt.get('--no-data'): json.dump(R, open(os.path.join(tc.HERE, '..', 'docs', 'drafts', 'upper_v5_selfcheck.json'), 'w'), ensure_ascii=False, indent=1, default=str)
    print('SELFCHECK', json.dumps({k: v for k, v in R.items() if k not in ('coverage', 'routes')}, ensure_ascii=False, default=str))
    print('SELFCHECK coverage min', min(cov.items(), key=lambda kv: kv[1]), 'routes', [(r[0], r[1], r[2], r[3], r[4]) for r in rep])
    if bad:
        msg = '上层导出前自检不过：\n  ' + '\n  '.join(bad)
        if str(layer.opt.get('--selfcheck', 'strict')) == 'warn': print('SELFCHECK WARN', msg)   # 只在迭代草稿时用；正式导出默认 strict
        else: raise AssertionError(msg)

# ---------------- 光照与相机 ----------------
# 时段（--tod，准备中，默认 day 与此前完全一致）：只改太阳高度 / 颜色 / 强度、天光与云的自发光亮度；太阳方位角不变（三层共用）。
TOD = {   # 天顶角（度）、太阳颜色、太阳强度、天光颜色、天光强度、云自发光倍数、云色调（None = 不染）
    'day':   (40, (1, .96, .9), 3.2, (.55, .65, .8), .35, 1.0, None),
    'dawn':  (72, (1, .78, .6), 2.2, (.62, .6, .72), .28, .9, (1, .9, .86)),
    'dusk':  (76, (1, .62, .42), 2.0, (.5, .45, .6), .24, .85, (1, .8, .7)),
    'night': (40, (.55, .65, 1), .25, (.08, .1, .18), .12, .3, (.6, .68, .9)),
}
TOD_NAME = str(layer.opt.get('--tod', 'day')); _tz, _tc, _te, _wc, _ws, _ce, _ct = TOD[TOD_NAME]
tc_clouds.VEIL_EMIT = _ce; tc_clouds.VEIL_TINT = _ct
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = _te; sun.angle = math.radians(1.2); sun.color = _tc
so = bpy.data.objects.new('sun', sun); col_main.objects.link(so); so.rotation_euler = (math.radians(_tz), 0, tc.SUN_ROT[2])   # 三层共用的太阳方位
if CLOUD_STYLE == 'veil': tc_clouds.build_veil(layer, islands, so, BELOW_OBJS)   # 《部落冲突》式薄纱云原型（未批准，发布版不走这里）
elif BELOW == 'city' and not layer.data_only:   # upper_city：城市只被城市自己挡光 → 没有岛影（用户硬规定）
    _cc = bpy.data.collections.new('city_light'); layer.sc.collection.children.link(_cc); tc_clouds.relight_city(so, BELOW_OBJS, _cc)
elif BELOW == 'clouds' and CLOUD_STYLE == 'white': tc_clouds.build_white_floor(layer, islands, so)   # 方案 B（发布版）：纯白云底 + 岛缘云边，无岛影
elif BELOW == 'clouds': tc_clouds.build_cloud_sea(layer, islands, so)   # 云海与岛影（blender/tc_clouds.py，--clouds toon|soft）
# 标记与岛屿轮廓（归一化图像坐标，左上原点）：查看器用来放标记、画结界圈和航线。标记另带 ax / ay 锚点（针脚落点：伊甸 = 停靠平台，其余 = 主楼外、离岸 0.8 r 的南侧空地）
def export(co):
    norm = lambda p: tc.norm(sc, co, p)
    rts = te.routes([i['isle'] for i in islands], norm)
    selfcheck(rts, markers)
    for r in rts: r.pop('world', None)
    mk = []
    for m in markers:
        nx, ny = norm(m['pos']); ax, ay = norm((*m['anchor'], m['pos'][2]))
        mk.append(dict(id=m['id'], nx=nx, ny=ny, r=round(m['r'] / W, 4), ax=ax, ay=ay))
    return {'markers': mk,
            'islands': [dict(id=i['id'], nx=norm((i['x'], i['y'], i['z']))[0], ny=norm((i['x'], i['y'], i['z']))[1],
                             rx=round(i['rx'] / W, 4), ry=round(i['ry'] / H, 4), rot=round(i['rot'], 3), alt_m=round(700 + i['z'] * 100),
                             estate_style=i['estate_style'], shape=i['isle'].shape, rim=i['isle'].rim, terrain=i['isle'].terrain,
                             **({'layout': i['isle'].layout, 'plan': i['isle'].plan} if i['isle'].layout else {}),
                             outline=i['isle'].export(norm), **({'role': i['isle'].d['role']} if i['isle'].d.get('role') else {})) for i in islands],
            'routes': rts}
if layer.opt.get('--city-only') and BELOW == 'city':   # 只渲下方城市（岛全部隐藏）：给 tools/eden_into_upper.py 补旧伊甸岛下面的城市用，配合 --crop
    for o in layer.sc.objects:
        if o.type == 'MESH' and o not in BELOW_OBJS: o.hide_render = True
if os.environ.get('TC_OBLIQUE'):                             # 斜视主地图（view: oblique）：blender/oblique.py 接管相机、岛底、模型、水、云片与 meta
    import oblique
    oblique.finish(layer, islands, so, (_wc, _ws), TOWER, DCFG)
    sys.exit(0)
layer.finish(world=(_wc, _ws), extra=export, label=f'islands {len(islands)}')
if not layer.data_only:                                     # 成图 meta：记录输入哈希（改了纵深 / 岛表就知道要重渲；arch review §3）
    import hashlib
    _h = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()[:16]
    json.dump({'script': 'blender/tiancheng_upper.py', 'upper_depth': _h(os.path.join(tc.HERE, '..', 'map', 'data', 'upper_depth.json')),
               'tc_islands': _h(os.environ.get('TC_ISLANDS') or os.path.join(tc.HERE, 'data', 'tc_islands.json')),
               'res': layer.res, 'samples': layer.samples, 'below': BELOW, 'blender': bpy.app.version_string},
              open(layer.out + '.meta.json', 'w'), indent=1)
