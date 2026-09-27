"""岛体（顶面台地 + 崖岸 + 倒锥岩基）、湖面、云海。"""
import math
import numpy as np
import bpy
from . import layout as L
from .common import NT, mat_new, link_obj, coll

SUN_DIR = (0.0, 0.0, 1.0)   # style_frame 设置
WARM = False                # r3 黄昏光：云海染暖


# ---------------------------------------------------------------- 材质
def mat_terrain():
    """地表：按 layout.cover 的分类叠层（v2 用户意见），每层都是真实扫描贴图 + 调色，不用纯色。"""
    m, t = mat_new('e2_terrain')
    if t is None:
        return m
    v, tc = t.coords('Object', 1.0, (-2600, 0))
    ob = tc.outputs['Object']

    def tex(aid, size, y, ns=0.6):
        mp = t.new('ShaderNodeMapping', (-2200, y))
        mp.inputs['Scale'].default_value = (1 / size,) * 3
        t.link(ob, mp.inputs['Vector'])
        return t.pbr_tex(aid, mp.outputs['Vector'], (-1900, y), ns)

    def noise(scale, y, detail=4.0):
        n = t.new('ShaderNodeTexNoise', (-1900, y), **{'Scale': scale, 'Detail': detail, 'Roughness': 0.6})
        t.link(ob, n.inputs['Vector'])
        return n.outputs['Fac']
    big = noise(0.012, 2400, 5.0)
    # 林地底（林冠下偶尔露出）：落叶
    fc, fr, fn = tex('forest_leaves_02', 4.0, 2000)
    forest = t.mix(0.45, fc, (0.1, 0.12, 0.05), 'MULTIPLY', (-1500, 2000))
    # 热带林下：更深更绿
    tropic = t.mix(0.6, fc, (0.03, 0.09, 0.03), 'MULTIPLY', (-1500, 1800))
    # 外坡草甸：草石航拍图偏黄绿 + 野花斑点
    gc, gr, gn = tex('aerial_grass_rock', 18.0, 1400)
    # r4：林带外是园地草甸（不是枯黄荒坡）：长草绿底 + 大尺度干湿斑 + 少量野花团
    pc_, _pr, _pn = tex('leafy_grass', 4.0, 1600, 0.4)
    park = t.mix(0.55, pc_, (0.13, 0.19, 0.07), 'MIX', (-1500, 1600))          # 鼠尾草绿
    wild = t.mix(0.6, gc, (0.42, 0.32, 0.12), 'MIX', (-1500, 1400))             # 金黄 / 稻草
    patch = t.new('ShaderNodeMapRange', (-1600, 1500), **{'From Min': 0.5, 'From Max': 0.62})
    t.link(noise(0.018, 1500, 3.0), patch.inputs['Value'])
    meadow = t.mix(patch.outputs[0], park, wild, loc=(-1350, 1450))
    straw = t.new('ShaderNodeMapRange', (-1600, 1350), **{'From Min': 0.55, 'From Max': 0.62})
    t.link(noise(0.05, 1350, 2.0), straw.inputs['Value'])
    meadow = t.mix(t.math('MULTIPLY', straw.outputs[0], 0.7), meadow, (0.55, 0.47, 0.28), loc=(-1320, 1400))
    # 野花带：薰衣草紫 / 虞美人红 / 白，成片（drift）而不是撒点
    for i, (sc_, col_) in enumerate(((0.06, (0.36, 0.25, 0.6)), (0.07, (0.6, 0.08, 0.05)), (0.05, (0.85, 0.83, 0.78)))):
        dm = t.new('ShaderNodeMapRange', (-1600, 1200 - 60 * i), **{'From Min': 0.66, 'From Max': 0.7})
        t.link(noise(sc_ * (1 + i * 0.3), 1200 - 60 * i, 3.0), dm.inputs['Value'])
        speck = t.new('ShaderNodeMapRange', (-1600, 1100 - 60 * i), **{'From Min': 0.45, 'From Max': 0.6})
        t.link(noise(2.0, 1100 - 60 * i, 2.0), speck.inputs['Value'])
        meadow = t.mix(t.math('MULTIPLY', dm.outputs[0], t.math('ADD', 0.35, t.math('MULTIPLY', speck.outputs[0], 0.6))), meadow, col_, loc=(-1300, 1300 - 40 * i))
    # 修剪草坪：真实草贴图，亮绿 + 割草条纹
    lc, lr, ln = tex('leafy_grass', 2.5, 800, 0.4)
    lawn = t.mix(0.4, lc, (0.07, 0.2, 0.035), 'MIX', (-1500, 800))
    sep = t.new('ShaderNodeSeparateXYZ', (-2200, 600))
    t.link(ob, sep.inputs[0])
    stripe = t.math('GREATER_THAN', t.math('SINE', t.math('MULTIPLY', sep.outputs['X'], 0.52)), 0.0, (-1700, 600))
    lawn = t.mix(t.math('MULTIPLY', stripe, 0.16), lawn, (0.22, 0.4, 0.1), loc=(-1300, 800))
    lawn = t.mix(t.math('MULTIPLY', big, 0.2), lawn, (0.09, 0.17, 0.04), loc=(-1200, 800))
    # 砾石
    grc, grr, grn = tex('gravel_floor', 2.5, 200, 0.5)
    gravel = t.mix(0.5, grc, (0.86, 0.78, 0.6), loc=(-1500, 200))
    sand = t.mix(0.6, grc, (0.85, 0.79, 0.64), loc=(-1500, 0))
    # 白石铺装（石灰华板）
    pc, pr, pn = tex('castle_brick_02_white', 2.2, -400, 0.5)
    # r4：石灰华大板（2.4 × 1.2 m，错缝，暗缝 6 cm）+ 每板色差，俯视能读出铺装
    sepp = t.new('ShaderNodeSeparateXYZ', (-2000, -300)); t.link(ob, sepp.inputs[0])
    cvp = t.new('ShaderNodeCombineXYZ', (-1850, -300)); t.link(sepp.outputs['X'], cvp.inputs[0]); t.link(sepp.outputs['Y'], cvp.inputs[1])
    brk = t.new('ShaderNodeTexBrick', (-1700, -300), **{'Scale': 1.0, 'Mortar Size': 0.035, 'Brick Width': 2.4, 'Row Height': 1.2, 'Color1': (0.9, 0.87, 0.8, 1), 'Color2': (0.85, 0.82, 0.74, 1), 'Mortar': (0.66, 0.62, 0.55, 1)})
    t.link(cvp.outputs[0], brk.inputs['Vector'])
    paved = t.mix(0.35, brk.outputs['Color'], pc, 'MULTIPLY', (-1500, -400))
    paved = t.mix(0.5, paved, brk.outputs['Color'], 'MIX', (-1450, -400))
    # 花境：深土 + 花色斑
    vor = t.new('ShaderNodeTexVoronoi', (-1800, -800), **{'Scale': 0.45})
    t.link(ob, vor.inputs['Vector'])
    ramp = t.new('ShaderNodeValToRGB', (-1600, -800))
    ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.75, 0.25, 0.38, 1)     # 玫瑰粉
    els[1].position, els[1].color = 0.66, (0.88, 0.86, 0.82, 1)    # 白
    e3 = els.new(0.33); e3.color = (0.42, 0.33, 0.66, 1)            # 薰衣草
    sepc = t.new('ShaderNodeSeparateColor', (-1750, -900)); t.link(vor.outputs['Color'], sepc.inputs[0])
    t.link(sepc.outputs[0], ramp.inputs[0])
    beds = t.mix(t.math('MULTIPLY', t.math('GREATER_THAN', noise(5.0, -1000, 2.0), 0.5), 0.35), ramp.outputs[0], (0.05, 0.1, 0.03), loc=(-1300, -800))
    # r4b 橄榄园：浅色干土 + 稀草
    grove = t.mix(t.math('MULTIPLY', noise(0.6, -1100, 3.0), 0.8), (0.55, 0.47, 0.34), (0.3, 0.3, 0.16), loc=(-1300, -1100))
    grove = t.mix(0.4, grove, grc, 'MULTIPLY', (-1250, -1100))
    # r4b 岛缘沙石带 + 露头岩
    rim = t.mix(t.math('MULTIPLY', noise(0.3, -1200, 4.0), 0.9), (0.7, 0.64, 0.52), (0.48, 0.46, 0.42), loc=(-1300, -1200))
    # r4b 菜园：土垄条纹（深褐土 / 生菜绿 / 甘蓝蓝绿）
    sepk = t.new('ShaderNodeSeparateXYZ', (-2000, -1300)); t.link(ob, sepk.inputs[0])
    rows = t.math('FRACT', t.math('MULTIPLY', t.math('ADD', t.math('MULTIPLY', sepk.outputs['X'], 0.94), t.math('MULTIPLY', sepk.outputs['Y'], 0.34)), 0.4))
    kr = t.new('ShaderNodeValToRGB', (-1600, -1300)); kr.color_ramp.interpolation = 'CONSTANT'
    ke = kr.color_ramp.elements
    ke[0].position, ke[0].color = 0.0, (0.16, 0.1, 0.05, 1)
    ke[1].position, ke[1].color = 0.6, (0.2, 0.36, 0.08, 1)
    k3 = ke.new(0.3); k3.color = (0.14, 0.26, 0.2, 1)
    t.link(rows, kr.inputs[0])
    kitchen = kr.outputs[0]
    # 崖石
    rc, rr, rn = tex('rock_face_03', 20.0, -1400, 1.0)
    rock = t.mix(0.5, rc, (0.5, 0.48, 0.44), 'MIX', (-1500, -1400))   # r3：浅石灰岩崖，不再是一整块褐土
    # 挡土墙
    wc, wr, wn = tex('castle_wall_varriation', 3.0, -1800, 0.8)
    wall = t.mix(0.45, wc, (0.78, 0.72, 0.6), loc=(-1500, -1800))
    geo = t.new('ShaderNodeNewGeometry', (-2200, -2200))
    sn = t.new('ShaderNodeSeparateXYZ', (-2000, -2200))
    t.link(geo.outputs['Normal'], sn.inputs[0])
    steep = t.new('ShaderNodeMapRange', (-1800, -2200), **{'From Min': 0.8, 'From Max': 0.55})
    t.link(sn.outputs['Z'], steep.inputs['Value'])
    A = {k: t.attr(k, loc=(-1000, 2600 - 120 * i)).outputs['Fac'] for i, k in enumerate(
        ('lawn', 'gravel', 'built', 'under', 'paved', 'beds', 'rill', 'sand', 'meadow', 'tropic', 'grove', 'rimb', 'kitchen'))}
    col = t.mix(A['tropic'], forest, tropic, loc=(-700, 600))
    col = t.mix(A['meadow'], col, meadow, loc=(-600, 600))
    col = t.mix(A['lawn'], col, lawn, loc=(-500, 600))
    col = t.mix(A['gravel'], col, gravel, loc=(-400, 600))
    col = t.mix(A['sand'], col, sand, loc=(-350, 600))
    col = t.mix(A['grove'], col, grove, loc=(-330, 700))
    rocky = t.new('ShaderNodeMapRange', (-600, 900), **{'From Min': 0.62, 'From Max': 0.66})
    t.link(noise(0.035, 900, 4.0), rocky.inputs['Value'])
    col = t.mix(t.math('MULTIPLY', rocky.outputs[0], t.math('MULTIPLY', A['meadow'], 0.9)), col, rock, loc=(-320, 800))
    col = t.mix(A['rimb'], col, rim, loc=(-310, 700))
    col = t.mix(A['kitchen'], col, kitchen, loc=(-305, 700))
    col = t.mix(A['paved'], col, paved, loc=(-300, 600))
    col = t.mix(A['beds'], col, beds, loc=(-250, 600))
    rockish = t.math('MAXIMUM', steep.outputs[0], A['under'], (-600, -1600))
    rockish = t.math('MULTIPLY', rockish, t.math('SUBTRACT', 1.0, A['paved']), (-500, -1600))
    col = t.mix(rockish, col, rock, loc=(-200, 600))
    wall_f = t.math('MULTIPLY', steep.outputs[0], A['built'], (-600, -1400), clamp=True)
    col = t.mix(wall_f, col, wall, loc=(-100, 600))
    col = t.mix(A['rill'], col, (0.02, 0.06, 0.07), loc=(0, 600))
    b = t.bsdf((400, 0))
    t.link(col, b.inputs['Base Color'])
    rough = t.mix(A['rill'], (0.85, 0.85, 0.85), (0.05, 0.05, 0.05), loc=(0, 200))
    t.link(rough, b.inputs['Roughness'])
    nrm = t.new('ShaderNodeMix', (0, -600), data_type='VECTOR')
    t.link(rockish, nrm.inputs[0]); t.link(gn, nrm.inputs[4]); t.link(rn, nrm.inputs[5])
    nrm2 = t.new('ShaderNodeMix', (150, -600), data_type='VECTOR')
    t.link(wall_f, nrm2.inputs[0]); t.link(nrm.outputs[1], nrm2.inputs[4]); t.link(wn, nrm2.inputs[5])
    t.link(nrm2.outputs[1], b.inputs['Normal'])
    return m


def mat_water():
    m, t = mat_new('e2_water')
    if t is None:
        return m
    v, _ = t.coords('Object', 1.0)
    n = t.new('ShaderNodeTexNoise', (-900, -300), **{'Scale': 0.25, 'Detail': 8.0, 'Roughness': 0.55})
    t.link(v, n.inputs['Vector'])
    bump = t.new('ShaderNodeBump', (-500, -300), Strength=0.08, Distance=0.3)
    t.link(n.outputs['Fac'], bump.inputs['Height'])
    b = t.bsdf((300, 0), Roughness=0.03, IOR=1.33, **{'Base Color': (0.03, 0.09, 0.1, 1)})
    t.link(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def mat_cloudsea():
    """云海：手算朝阳面明暗（自发光），不接收岛的投影（用户要求：上层云海不画岛影）。"""
    m, t = mat_new('e2_cloudsea')
    if t is None:
        return m
    geo = t.new('ShaderNodeNewGeometry', (-1200, 0))
    dot = t.new('ShaderNodeVectorMath', (-1000, 0), operation='DOT_PRODUCT')
    t.link(geo.outputs['Normal'], dot.inputs[0])
    dot.inputs[1].default_value = SUN_DIR
    lam = t.new('ShaderNodeMapRange', (-800, 0), **{'From Min': -1.3, 'From Max': 1.0})
    t.link(dot.outputs['Value'], lam.inputs['Value'])
    tc = t.new('ShaderNodeTexCoord', (-1400, -400))
    n = t.new('ShaderNodeTexNoise', (-1200, -400), **{'Scale': 0.0012, 'Detail': 6.0, 'Roughness': 0.55})
    t.link(tc.outputs['Object'], n.inputs['Vector'])
    ramp = t.new('ShaderNodeValToRGB', (-600, 0))
    ramp.color_ramp.elements[0].color = (0.26, 0.32, 0.45, 1) if not WARM else (0.3, 0.3, 0.42, 1)
    ramp.color_ramp.elements[1].color = (1.0, 0.94, 0.86, 1) if not WARM else (1.0, 0.8, 0.6, 1)
    t.link(lam.outputs[0], ramp.inputs[0])
    col = t.mix(t.math('MULTIPLY', n.outputs['Fac'], 0.25), ramp.outputs[0], (0.72, 0.76, 0.84), loc=(-350, 0))
    # r3：谷底暗、团顶亮（假自遮蔽），让云有体积
    ch = t.attr('ch', loc=(-900, -700)).outputs['Fac']
    occ = t.new('ShaderNodeMapRange', (-600, -700), **{'From Min': 0.0, 'From Max': 0.75, 'To Min': 0.72, 'To Max': 1.08})
    t.link(ch, occ.inputs['Value'])
    col = t.mix(1.0, col, occ.outputs[0], 'MULTIPLY', (-250, 0))
    col = t.mix(t.math('MULTIPLY', t.math('SUBTRACT', 1.0, ch), 0.35), col, (0.42, 0.5, 0.66), 'MIX', (-200, 0))
    lp = t.new('ShaderNodeLightPath', (-900, 400))
    haze = t.new('ShaderNodeMapRange', (-600, 400), **{'From Min': 4000, 'From Max': 30000})
    t.link(lp.outputs['Ray Length'], haze.inputs['Value'])
    col = t.mix(haze.outputs[0], col, (0.78, 0.84, 0.93) if not WARM else (0.92, 0.8, 0.74), loc=(-150, 0))
    em = t.new('ShaderNodeEmission', (300, 0), Strength=1.05)
    t.link(col, em.inputs['Color'])
    t.link(em.outputs[0], t.out.inputs['Surface'])
    return m


# ---------------------------------------------------------------- 网格
def _mesh_from_grid(name, co, faces, attrs, mat):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(co))
    me.vertices.foreach_set('co', co.astype(np.float32).ravel())
    nl = faces.shape[1]
    me.loops.add(len(faces) * nl)
    me.loops.foreach_set('vertex_index', faces.astype(np.int32).ravel())
    me.polygons.add(len(faces))
    me.polygons.foreach_set('loop_start', (np.arange(len(faces)) * nl).astype(np.int32))
    me.update(calc_edges=True)
    me.polygons.foreach_set('use_smooth', np.ones(len(faces), dtype=bool))
    for k, v in attrs.items():
        a = me.attributes.new(k, 'FLOAT', 'POINT')
        a.data.foreach_set('value', v.astype(np.float32))
    me.update()
    return link_obj(name, me, None, mat)


def build_island(res_m=1.0, n_theta=1800):
    rho_max = 1.008   # r3：只留几米崖唇，下面立刻是内收岩基
    nr = int(290 * rho_max / res_m)
    rho = np.linspace(0.003, rho_max, nr)
    th = np.linspace(-math.pi, math.pi, n_theta, endpoint=False)
    RH, TH = np.meshgrid(rho, th, indexing='ij')           # (nr, nt)
    R = L.outline_R(TH)
    X, Y = RH * R * np.cos(TH), RH * R * np.sin(TH)
    H, at = L.terrain(X, Y)
    # 岩基：从最外圈往下收成倒锥
    rim_z = H[-1]
    nu = 46
    s = np.linspace(0, 1, nu + 1)[1:]
    thu = th[None, :]
    rn = np.sin(3 * thu + 1.1) * 0.05 + np.sin(7 * thu + 0.4) * 0.03 + np.sin(17 * thu + 2.0) * 0.015
    zb = -215 - 40 * (np.sin(2 * thu + 0.6) * 0.5 + np.sin(5 * thu) * 0.3)
    S = s[:, None]
    rr = rho_max * (1 - S) ** 1.05 * (1 + rn * (0.4 + S)) + 0.004   # r3：岩基从崖口立刻内收（倒锥），俯视看不到一整圈竖崖
    rr = rr * (1 + 0.02 * np.sin(40 * thu + 9 * S))                # 竖向岩纹
    Sz = S ** 0.75   # 崖口先有一段陡唇，再往下收
    zz = rim_z[None, :] * (1 - Sz) + zb * Sz - 6 * np.sin(math.pi * S) * (1 + 0.5 * np.sin(4 * thu))
    Ru = L.outline_R(thu)
    Xu, Yu = rr * Ru * np.cos(thu), rr * Ru * np.sin(thu)
    X = np.concatenate([X, Xu], 0)
    Y = np.concatenate([Y, Yu], 0)
    Z = np.concatenate([H, zz], 0)
    nring = X.shape[0]
    co = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
    # 中心点
    cz = float(L.terrain(np.array([0.0]), np.array([0.0]))[0][0])
    co = np.concatenate([co, [[0, 0, cz]], [[0, 0, float(zb.mean()) - 30]]], 0)
    top_c, bot_c = nring * n_theta, nring * n_theta + 1
    idx = np.arange(nring * n_theta).reshape(nring, n_theta)
    a = idx[:-1, :]
    b = idx[1:, :]
    a2 = np.roll(a, -1, 1)
    b2 = np.roll(b, -1, 1)
    quads = np.stack([a, b, b2, a2], -1).reshape(-1, 4)
    fan_t = np.stack([np.full(n_theta, top_c), idx[0], np.roll(idx[0], -1)], 1)
    fan_b = np.stack([np.full(n_theta, bot_c), np.roll(idx[-1], -1), idx[-1]], 1)
    tris = np.concatenate([fan_t, fan_b], 0)
    under = np.concatenate([np.zeros(nr * n_theta), np.ones(nu * n_theta), [0, 1]])

    def pad(v):
        return np.concatenate([v.ravel(), np.zeros(nu * n_theta), [0, 0]])
    attrs = dict(under=under, **{k: pad(at[k]) for k in ('lawn', 'gravel', 'built', 'paved', 'beds', 'rill', 'sand', 'meadow', 'tropic', 'grove', 'rimb', 'kitchen')})
    m = mat_terrain()
    ob = _mesh_from_grid('island', co, quads, attrs, m)
    ob2 = _mesh_from_grid('island_caps', co, tris, attrs, m)
    return ob, ob2


def build_lake():
    p = [q for q in L.PADS if q['id'] == 'lake'][0]
    cx, cy = p['c']
    rx, ry = p['r']
    n = 180
    th = np.linspace(0, 2 * math.pi, n, endpoint=False)
    rot = p.get('rot', 0)
    pts = [(cx + (rx + 20) * math.cos(a) * math.cos(rot) - (ry + 20) * math.sin(a) * math.sin(rot),
            cy + (rx + 20) * math.cos(a) * math.sin(rot) + (ry + 20) * math.sin(a) * math.cos(rot), L.WATER_Z)
           for a in th]
    me = bpy.data.meshes.new('lake')
    me.from_pydata(pts + [(cx, cy, L.WATER_Z)], [], [(i, (i + 1) % n, n) for i in range(n)])
    return link_obj('lake', me, None, mat_water())


def build_cloudsea(z=-380.0, r_max=26000.0, n_r=620, n_t=1440):
    """r3 云海：极坐标网格（近处约 5 m 一格，远处渐粗），numpy + mathutils.noise 直接算积云高度：
    大团块（1.1 km）+ 中尺度（330 m）+ 翻卷的“菜花”细节（1-|noise|，95 m / 30 m，远处衰减）。
    高度写成属性 ch 给着色器做谷底暗部；仍是自发光手算明暗，不接收岛影（用户规则：上层云海不画岛影）。"""
    from mathutils import noise, Vector
    r = np.concatenate([[0.0], 40 * np.geomspace(1, r_max / 40, n_r - 1)])
    th = np.linspace(0, 2 * math.pi, n_t, endpoint=False)
    R, T = np.meshgrid(r, th, indexing='ij')
    X, Y = R * np.cos(T), R * np.sin(T)
    xs, ys = X.ravel(), Y.ravel()
    A = np.empty((len(xs), 4))
    nf, V = noise.noise, Vector
    for k in range(len(xs)):
        x, y = xs[k], ys[k]
        A[k, 0] = nf(V((x / 1100, y / 1100, 0.3)))
        A[k, 1] = nf(V((x / 330, y / 330, 5.1)))
        A[k, 2] = nf(V((x / 95, y / 95, 9.7)))
        A[k, 3] = nf(V((x / 30, y / 30, 2.3)))
    w = np.clip(1 - R.ravel() / 7000, 0.15, 1)
    big = np.clip(A[:, 0] * 0.9 + 0.5, 0, 1)
    # billow（|noise|）= 圆鼓的团顶 + 谷底折痕 = 积云；1-|noise| 会变成沙丘脊线，不用
    h = 150 * big ** 1.4 + 90 * A[:, 1] ** 2 * (0.4 + big)
    h += (55 * np.abs(A[:, 2]) + 16 * np.abs(A[:, 3])) * w * (0.4 + big)
    # 岛周云领：云在岛缘外堆高，吞掉岩基下半截（不做岛影）
    dist = R.ravel() - L.outline_R(T.ravel())
    h += 170 * np.exp(-(np.maximum(dist, 0) / 420) ** 2) * (0.8 + 0.4 * A[:, 1] ** 2)
    Z = h
    co = np.stack([xs, ys, Z], 1)
    idx = np.arange(len(xs)).reshape(n_r, n_t)
    a = idx[:-1]; b = idx[1:]
    quads = np.stack([a, np.roll(a, -1, 1), np.roll(b, -1, 1), b], -1).reshape(-1, 4)
    hn = (h - h.min()) / (np.ptp(h) + 1e-6)
    ob = _mesh_from_grid('cloudsea', co, quads, dict(ch=hn), mat_cloudsea())
    ob.location.z = z
    ob.visible_shadow = False
    return ob


def build_white_floor(z=-60.0):
    """r4：上层地图的纯白云底（tc_clouds.build_white_floor 的颜色，sRGB ≈ 231/236/242），自发光，不接收岛影。"""
    me = bpy.data.meshes.new('white_floor')
    r = 3000
    me.from_pydata([(-r, -r, z), (r, -r, z), (r, r, z), (-r, r, z)], [], [(0, 1, 2, 3)])
    m, t = mat_new('e2_white_floor')
    if t is not None:
        em = t.new('ShaderNodeEmission', (300, 0), Strength=1.0)
        em.inputs['Color'].default_value = (0.80, 0.84, 0.89, 1)
        t.link(em.outputs[0], t.out.inputs['Surface'])
    ob = link_obj('white_floor', me, None, m)
    ob.visible_shadow = False
    return ob
