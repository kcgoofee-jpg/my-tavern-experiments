"""岛体（顶面台地 + 崖岸 + 倒锥岩基）、湖面、云海。"""
import math
import numpy as np
import bpy
from . import layout as L
from .common import NT, mat_new, link_obj, coll

SUN_DIR = (0.0, 0.0, 1.0)   # style_frame 设置


# ---------------------------------------------------------------- 材质
def mat_terrain():
    m, t = mat_new('e2_terrain')
    if t is None:
        return m
    v, tc = t.coords('Object', 1.0, (-2200, 0))
    # 草坪：两种绿 + 大小噪声（修剪草坪的斑驳感）
    n1 = t.new('ShaderNodeTexNoise', (-1600, 600), **{'Scale': 0.02, 'Detail': 6.0, 'Roughness': 0.6})
    t.link(v, n1.inputs['Vector'])
    n2 = t.new('ShaderNodeTexNoise', (-1600, 400), **{'Scale': 0.35, 'Detail': 3.0})
    t.link(v, n2.inputs['Vector'])
    lawn = t.mix(n1.outputs['Fac'], (0.045, 0.13, 0.022), (0.085, 0.19, 0.035), loc=(-1300, 600))
    lawn = t.mix(t.math('MULTIPLY', n2.outputs['Fac'], 0.35), lawn, (0.07, 0.16, 0.04), loc=(-1100, 600))
    # 林地 / 坡地草石
    vs = t.new('ShaderNodeMapping', (-1700, 100))
    vs.inputs['Scale'].default_value = (1 / 18, 1 / 18, 1 / 18)
    t.link(tc.outputs['Object'], vs.inputs['Vector'])
    gc, gr, gn = t.pbr_tex('aerial_grass_rock', vs.outputs['Vector'], (-1400, 200), 0.6)
    wild = t.mix(0.55, gc, (0.05, 0.1, 0.03), 'MULTIPLY', (-1000, 200))
    wild = t.mix(0.35, wild, (0.07, 0.12, 0.04), loc=(-900, 200))
    # 砾石
    vg = t.new('ShaderNodeMapping', (-1700, -300))
    vg.inputs['Scale'].default_value = (1 / 2.5, 1 / 2.5, 1 / 2.5)
    t.link(tc.outputs['Object'], vg.inputs['Vector'])
    grc, grr, grn = t.pbr_tex('gravel_floor', vg.outputs['Vector'], (-1400, -300), 0.5)
    gravel = t.mix(0.5, grc, (0.78, 0.72, 0.62), 'MIX', (-1000, -300))
    # 崖石
    vr = t.new('ShaderNodeMapping', (-1700, -800))
    vr.inputs['Scale'].default_value = (1 / 9, 1 / 9, 1 / 9)
    t.link(tc.outputs['Object'], vr.inputs['Vector'])
    rc, rr, rn = t.pbr_tex('rock_face_03', vr.outputs['Vector'], (-1400, -800), 1.0)
    rock = t.mix(0.35, rc, (0.36, 0.33, 0.29), loc=(-1000, -800))
    # 白石挡土墙
    vw = t.new('ShaderNodeMapping', (-1700, -1300))
    vw.inputs['Scale'].default_value = (1 / 3, 1 / 3, 1 / 3)
    t.link(tc.outputs['Object'], vw.inputs['Vector'])
    wc, wr, wn = t.pbr_tex('castle_brick_02_white', vw.outputs['Vector'], (-1400, -1300), 0.8)
    wall = t.mix(0.45, wc, (0.86, 0.84, 0.8), loc=(-1000, -1300))
    # 坡度
    geo = t.new('ShaderNodeNewGeometry', (-1700, -1800))
    sep = t.new('ShaderNodeSeparateXYZ', (-1500, -1800))
    t.link(geo.outputs['Normal'], sep.inputs[0])
    steep = t.new('ShaderNodeMapRange', (-1300, -1800), **{'From Min': 0.82, 'From Max': 0.55})
    t.link(sep.outputs['Z'], steep.inputs['Value'])
    a_lawn = t.attr('lawn', loc=(-900, 900)).outputs['Fac']
    a_grav = t.attr('gravel', loc=(-900, 1100)).outputs['Fac']
    a_built = t.attr('built', loc=(-900, 1300)).outputs['Fac']
    a_under = t.attr('under', loc=(-900, 1500)).outputs['Fac']
    col = t.mix(a_lawn, wild, lawn, loc=(-600, 400))
    col = t.mix(a_grav, col, gravel, loc=(-450, 400))
    rockish = t.math('MAXIMUM', steep.outputs[0], a_under, (-600, -1600))
    col = t.mix(rockish, col, rock, loc=(-300, 400))
    wall_f = t.math('MULTIPLY', steep.outputs[0], a_built, (-600, -1400), clamp=True)
    col = t.mix(wall_f, col, wall, loc=(-150, 400))
    # 粗糙度 / 法线
    b = t.bsdf((300, 0), Roughness=0.85)
    t.link(col, b.inputs['Base Color'])
    nrm = t.new('ShaderNodeMix', (0, -600), data_type='VECTOR')
    t.link(rockish, nrm.inputs[0])
    t.link(gn, nrm.inputs[4])
    t.link(rn, nrm.inputs[5])
    nrm2 = t.new('ShaderNodeMix', (150, -600), data_type='VECTOR')
    t.link(wall_f, nrm2.inputs[0])
    t.link(nrm.outputs[1], nrm2.inputs[4])
    t.link(wn, nrm2.inputs[5])
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
    ramp.color_ramp.elements[0].color = (0.42, 0.5, 0.64, 1)
    ramp.color_ramp.elements[1].color = (1.0, 0.975, 0.94, 1)
    t.link(lam.outputs[0], ramp.inputs[0])
    col = t.mix(t.math('MULTIPLY', n.outputs['Fac'], 0.25), ramp.outputs[0], (0.72, 0.76, 0.84), loc=(-350, 0))
    lp = t.new('ShaderNodeLightPath', (-900, 400))
    haze = t.new('ShaderNodeMapRange', (-600, 400), **{'From Min': 900, 'From Max': 9000})
    t.link(lp.outputs['Ray Length'], haze.inputs['Value'])
    col = t.mix(haze.outputs[0], col, (0.78, 0.84, 0.93), loc=(-150, 0))
    em = t.new('ShaderNodeEmission', (300, 0), Strength=1.6)
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
    attrs = dict(lawn=pad(at['lawn']), gravel=pad(at['gravel']), built=pad(at['built']), under=under)
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


def build_cloudsea(z=-430.0, size=16000.0, n=360):
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
    tex.noise_scale = 260
    tex.noise_depth = 4
    tex.noise_basis = 'ORIGINAL_PERLIN'
    d = ob.modifiers.new('disp', 'DISPLACE')
    d.texture = tex
    d.texture_coords = 'GLOBAL'
    d.strength = 120
    d.mid_level = 0.5
    tex2 = bpy.data.textures.new('e2_cloud_tex2', 'CLOUDS')
    tex2.noise_scale = 70
    tex2.noise_depth = 3
    d2 = ob.modifiers.new('disp2', 'DISPLACE')
    d2.texture = tex2
    d2.texture_coords = 'GLOBAL'
    d2.strength = 28
    ob.visible_shadow = False
    return ob
