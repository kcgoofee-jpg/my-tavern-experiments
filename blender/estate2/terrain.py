"""岛体（顶面台地 + 崖岸 + 倒锥岩基）、湖面、云海。"""
import math
import numpy as np
import bpy
from . import layout as L
from .common import NT, mat_new, link_obj, coll

SUN_DIR = (0.0, 0.0, 1.0)   # style_frame 设置


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
    meadow = t.mix(0.35, gc, (0.2, 0.22, 0.08), 'OVERLAY', (-1500, 1400))
    fl = t.new('ShaderNodeMapRange', (-1600, 1200), **{'From Min': 0.68, 'From Max': 0.72})
    t.link(noise(1.8, 1200, 2.0), fl.inputs['Value'])
    meadow = t.mix(t.math('MULTIPLY', fl.outputs[0], 0.6), meadow, (0.8, 0.75, 0.5), loc=(-1300, 1300))
    # 修剪草坪：真实草贴图，亮绿 + 割草条纹
    lc, lr, ln = tex('leafy_grass', 2.5, 800, 0.4)
    lawn = t.mix(0.25, lc, (0.05, 0.13, 0.03), 'MIX', (-1500, 800))
    sep = t.new('ShaderNodeSeparateXYZ', (-2200, 600))
    t.link(ob, sep.inputs[0])
    stripe = t.math('GREATER_THAN', t.math('SINE', t.math('MULTIPLY', sep.outputs['X'], 0.52)), 0.0, (-1700, 600))
    lawn = t.mix(t.math('MULTIPLY', stripe, 0.08), lawn, (0.3, 0.45, 0.14), loc=(-1300, 800))
    lawn = t.mix(t.math('MULTIPLY', big, 0.5), lawn, (0.09, 0.15, 0.04), loc=(-1200, 800))
    # 砾石
    grc, grr, grn = tex('gravel_floor', 2.5, 200, 0.5)
    gravel = t.mix(0.3, grc, (0.8, 0.73, 0.6), loc=(-1500, 200))
    sand = t.mix(0.6, grc, (0.85, 0.79, 0.64), loc=(-1500, 0))
    # 白石铺装（石灰华板）
    pc, pr, pn = tex('castle_brick_02_white', 2.2, -400, 0.5)
    paved = t.mix(0.4, pc, (0.9, 0.85, 0.76), 'MIX', (-1500, -400))
    # 花境：深土 + 花色斑
    hue = noise(2.5, -800, 2.0)
    ramp = t.new('ShaderNodeValToRGB', (-1600, -800))
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.35, (0.5, 0.1, 0.16, 1)
    els[1].position, els[1].color = 0.65, (0.92, 0.9, 0.86, 1)
    e3 = els.new(0.5); e3.color = (0.45, 0.3, 0.6, 1)
    t.link(hue, ramp.inputs[0])
    beds = t.mix(t.math('GREATER_THAN', noise(6.0, -1000, 2.0), 0.72), (0.03, 0.07, 0.02), ramp.outputs[0], loc=(-1300, -800))
    # 崖石
    rc, rr, rn = tex('rock_face_03', 20.0, -1400, 1.0)
    rock = t.mix(0.5, rc, (0.2, 0.18, 0.16), 'MULTIPLY', (-1500, -1400))
    # 挡土墙
    wc, wr, wn = tex('castle_wall_varriation', 3.0, -1800, 0.8)
    wall = t.mix(0.45, wc, (0.78, 0.72, 0.6), loc=(-1500, -1800))
    geo = t.new('ShaderNodeNewGeometry', (-2200, -2200))
    sn = t.new('ShaderNodeSeparateXYZ', (-2000, -2200))
    t.link(geo.outputs['Normal'], sn.inputs[0])
    steep = t.new('ShaderNodeMapRange', (-1800, -2200), **{'From Min': 0.8, 'From Max': 0.55})
    t.link(sn.outputs['Z'], steep.inputs['Value'])
    A = {k: t.attr(k, loc=(-1000, 2600 - 120 * i)).outputs['Fac'] for i, k in enumerate(
        ('lawn', 'gravel', 'built', 'under', 'paved', 'beds', 'rill', 'sand', 'meadow', 'tropic'))}
    col = t.mix(A['tropic'], forest, tropic, loc=(-700, 600))
    col = t.mix(A['meadow'], col, meadow, loc=(-600, 600))
    col = t.mix(A['lawn'], col, lawn, loc=(-500, 600))
    col = t.mix(A['gravel'], col, gravel, loc=(-400, 600))
    col = t.mix(A['sand'], col, sand, loc=(-350, 600))
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
    b = t.bsdf((300, 0), Roughness=0.04, IOR=1.33, **{'Base Color': (0.012, 0.045, 0.05, 1)})
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
    lam = t.new('ShaderNodeMapRange', (-800, 0), **{'From Min': -0.2, 'From Max': 1.0})
    t.link(dot.outputs['Value'], lam.inputs['Value'])
    tc = t.new('ShaderNodeTexCoord', (-1400, -400))
    n = t.new('ShaderNodeTexNoise', (-1200, -400), **{'Scale': 0.0012, 'Detail': 6.0, 'Roughness': 0.55})
    t.link(tc.outputs['Object'], n.inputs['Vector'])
    ramp = t.new('ShaderNodeValToRGB', (-600, 0))
    ramp.color_ramp.elements[0].color = (0.3, 0.37, 0.5, 1)
    ramp.color_ramp.elements[1].color = (1.0, 0.94, 0.86, 1)
    t.link(lam.outputs[0], ramp.inputs[0])
    col = t.mix(t.math('MULTIPLY', n.outputs['Fac'], 0.25), ramp.outputs[0], (0.72, 0.76, 0.84), loc=(-350, 0))
    lp = t.new('ShaderNodeLightPath', (-900, 400))
    haze = t.new('ShaderNodeMapRange', (-600, 400), **{'From Min': 4000, 'From Max': 30000})
    t.link(lp.outputs['Ray Length'], haze.inputs['Value'])
    col = t.mix(haze.outputs[0], col, (0.78, 0.84, 0.93), loc=(-150, 0))
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
    rho_max = 1.035
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
    rr = rho_max * (1 - S ** 1.25) ** 0.62 * (1 + rn * (0.4 + S)) + 0.004
    rr = rr * (1 + 0.02 * np.sin(40 * thu + 9 * S))                # 竖向岩纹
    zz = rim_z[None, :] * (1 - S) + zb * S - 14 * np.sin(math.pi * S) * (1 + np.sin(4 * thu))
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
    attrs = dict(under=under, **{k: pad(at[k]) for k in ('lawn', 'gravel', 'built', 'paved', 'beds', 'rill', 'sand', 'meadow', 'tropic')})
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


def build_cloudsea(z=-430.0, size=40000.0, n=800):
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=n, y_segments=n, size=size / 2)
    me = bpy.data.meshes.new('cloudsea')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = link_obj('cloudsea', me, None, mat_cloudsea())
    ob.location.z = z
    tex = bpy.data.textures.new('e2_cloud_tex', 'CLOUDS')
    tex.noise_scale = 700
    tex.noise_depth = 5
    tex.noise_basis = 'ORIGINAL_PERLIN'
    d = ob.modifiers.new('disp', 'DISPLACE')
    d.texture = tex
    d.texture_coords = 'GLOBAL'
    d.strength = 320
    d.mid_level = 0.5
    tex2 = bpy.data.textures.new('e2_cloud_tex2', 'CLOUDS')
    tex2.noise_scale = 160
    tex2.noise_depth = 4
    d2 = ob.modifiers.new('disp2', 'DISPLACE')
    d2.texture = tex2
    d2.texture_coords = 'GLOBAL'
    d2.strength = 70
    ob.visible_shadow = False
    return ob
