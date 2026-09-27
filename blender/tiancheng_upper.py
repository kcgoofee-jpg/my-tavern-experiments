# 天城 · 上层（悬浮庄园区，离地 800–1500 m）· Blender 正俯视写实渲染（第二版：可读性优先）
# 用法：Blender -b -P tiancheng_upper.py -- [--res 1600] [--samples 64] [--out path.png] [--below clouds|city] [--haze .25] [--crop x0,y0,x1,y1] [--preview] [--data-only]
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
te.assign_families(ISLES)                                   # 同风格普通岛按 id 轮流分配布局族 / 主楼平面（数据里写了就用数据）
te.HUB = next(((d['x'], d['y']) for d in ISLES if d['id'] == 'eden'), None)
for d in ISLES:
    e = te.Isle(d); e.build_body(col_main)
    if d['id'] == 'eden': te.build_eden(e, layer)
    elif d['id'] == 'silver_crown': te.build_silver_crown(e)
    else: e.build_estate()
    islands.append({'id': d['id'], 'x': e.x, 'y': e.y, 'z': e.z, 'rx': e.rx, 'ry': e.ry, 'rot': e.rot, 'estate_style': e.style, 'isle': e})
    if d['id'] in ('eden', 'silver_crown'): markers.append({'id': d['id'], 'pos': (e.x, e.y, e.z), 'r': max(e.rx, e.ry), 'anchor': e.world(*e.anchor())})
    if d.get('role'): markers.append({'id': d['role'], 'pos': (e.x, e.y, e.z), 'r': max(e.rx, e.ry), 'anchor': e.world(*e.anchor())})   # 地标府邸（首相府、将军官邸……），名称在 maps.json
# 以太气候调节塔：从中层伸到约 950 m。深色塔身（直径 40 m）、两圈外伸环台、塔顶以太晶冠；塔下云面一圈淡青光晕
TOWER = (8.5, -5.0)
cyl(*TOWER, -7, .2, 9.4, M['darkstone'], 40)
for k, zz in enumerate((.9, 1.7)):
    cyl(*TOWER, zz, .34 - k * .05, .025, M['pad'], 48); cyl(*TOWER, zz + .025, .31 - k * .05, .012, M['darkstone'], 48)
    for j in range(12): t = j / 12 * 2 * math.pi; cyl(TOWER[0] + math.cos(t) * (.33 - k * .05), TOWER[1] + math.sin(t) * (.33 - k * .05), zz + .02, .008, .012, te.mats()['aether'], 6)
cyl(*TOWER, 2.4, .22, .05, M['gold'], 40)
aet = te.mats()['aether']
for j in range(9):
    t = j / 9 * 2 * math.pi; rr = .06 + .07 * (j % 3) / 2
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.05 + .02 * (j % 2), location=(TOWER[0] + math.cos(t) * rr, TOWER[1] + math.sin(t) * rr, 2.5 + .08 * (j % 3)))
    o = bpy.context.active_object; o.scale = (1, 1, 2.6); o.data.materials.append(aet)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.09, location=(*TOWER, 2.7)); o = bpy.context.active_object; o.scale = (1, 1, 2.2); o.data.materials.append(aet)
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
    if [cnt.get(k, 0) for k in ('english', 'chateau', 'suzhou', 'lingnan')] != [11, 8, 6, 6]: bad.append(f'风格计数 {cnt} ≠ 11/8/6/6')
    nn = _near2(I); same = [(a, b) for a, v in nn.items() for _, b in v if by[a]['estate_style'] == by[b]['estate_style']]
    R['near2_same_style'] = same
    if same: bad.append(f'最近 2 邻同风格：{same}')
    tup = {}
    for e in isl:
        if e.d.get('role') or e.style in ('neoclassical', 'fortress'): continue
        k = (e.style, e.shape, e.rim, e.terrain, e.layout, e.plan)
        if k in tup: bad.append(f'五元组重复：{e.id} 与 {tup[k]} {k}')
        tup[k] = e.id
    R['tuples'] = len(tup)
    for st in ('suzhou', 'lingnan'):
        if not any(e.style == st and e.rx >= .7 for e in isl): bad.append(f'{st} 没有 rx ≥ .7 的样板岛')
    viol = {}
    for e in isl:
        v = [(k, P) for k, P in e.fp if not all(e.inside(x, y, .92) for x, y in P + [(sum(p[0] for p in P) / len(P), sum(p[1] for p in P) / len(P))])]
        if v: viol[e.id] = sorted({k for k, _ in v})
    R['inside92_violations'] = viol
    if viol: print('SELFCHECK inside92 detail', {e.id: [(k, [tuple(round(c, 3) for c in e.world(*q)) for q in P[:2]]) for k, P in e.fp if not all(e.inside(x, y, .92) for x, y in P)] for e in isl if e.id in viol})
    if viol: bad.append(f'inside(.92) 不过：{viol}')
    cov = {e.id: round(e.coverage(), 3) for e in isl}; R['coverage'] = cov
    low = {k: v for k, v in cov.items() if v < .5 and k not in ('eden', 'silver_crown')}
    if low: bad.append(f'园林覆盖 < 50 %：{low}')
    spans = [s for e in isl for s in e.terrace_spans]; R['terrace_spans_deg'] = [round(s) for s in spans]
    if any(s > 220 for s in spans): bad.append('台地墙弧跨 > 220°')
    cr = [(c[0], c[1], e.id) for e in isl for c in e.crowns if c is not None and c[1] not in te.TOPIARY]; R['crown_min'] = round(min(r for r, _, _ in cr), 4); R['trees'] = len(cr)
    if R['crown_min'] < te.CROWN_MIN - 1e-6: bad.append(f"树冠半径最小 {R['crown_min']} < .04：{[c for c in cr if c[0] < .04][:5]}")
    R['faces'] = FACES; R['faces_ratio_r4'] = round(FACES / FACES_R4, 3)
    if FACES > FACES_R4 * 1.2: bad.append(f'面数 {FACES} > r4 × 1.2')
    ed = by['eden']['isle']; R['eden_anchors'] = len(ed.anchors); R['eden_belvedere_rear'] = bool(ed.belvederes); R['eden_dock_diam_m'] = round(ed.dock[2] * 200)
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
    import tc_clouds
    off = {i['id']: round((i['z'] - .7) * math.tan(math.radians(tc_clouds.CLOUD_ZENITH)), 2) for i in I if i['z'] > 6}; R['shadow_offset_z_gt6'] = off
    if tc_clouds.ISLAND_SHADOWS and any(v > 1.0 for v in off.values()): bad.append(f'z > 6 的岛影子偏移 > 1.0：{off}')
    R['suzhou_pool_ratio'] = {e.id: round(e.pool_ratio, 3) for e in isl if hasattr(e, 'pool_ratio')}
    R['lingnan_pond_ratio'] = {e.id: round(e.pond_ratio, 3) for e in isl if hasattr(e, 'pond_ratio')}
    json.dump(R, open(os.path.join(tc.HERE, '..', 'docs', 'drafts', 'upper_v5_selfcheck.json'), 'w'), ensure_ascii=False, indent=1, default=str)
    print('SELFCHECK', json.dumps({k: v for k, v in R.items() if k not in ('coverage', 'routes')}, ensure_ascii=False, default=str))
    print('SELFCHECK coverage min', min(cov.items(), key=lambda kv: kv[1]), 'routes', [(r[0], r[1], r[2], r[3], r[4]) for r in rep])
    if bad:
        msg = '上层导出前自检不过：\n  ' + '\n  '.join(bad)
        if str(layer.opt.get('--selfcheck', 'strict')) == 'warn': print('SELFCHECK WARN', msg)   # 只在迭代草稿时用；正式导出默认 strict
        else: raise AssertionError(msg)

# ---------------- 光照与相机 ----------------
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = math.radians(1.2); sun.color = (1, .96, .9)
so = bpy.data.objects.new('sun', sun); col_main.objects.link(so); so.rotation_euler = tc.SUN_ROT   # 三层共用的太阳方向
if BELOW == 'clouds': __import__('tc_clouds').build_cloud_sea(layer, islands, so)   # 云海与岛影（blender/tc_clouds.py，--clouds toon|soft）
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
layer.finish(world=((.55, .65, .8), .35), extra=export, label=f'islands {len(islands)}')
