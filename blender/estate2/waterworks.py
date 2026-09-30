"""r5 水系（用户 2026-09-30：瀑布加、伊甸加清水倒锥）：湖溢流暗渠出口 → 分级岩沟 → 东崖主瀑布 + 两道细瀑 + 水雾；岩锥中段悬清水倒锥。

- 暗渠出口：东沟谷低处（layout.STREAM[0]）一面粗琢石墙 + 半圆拱洞，水从洞里漫出（湖面 4.5 m，脊高 20–27 m，只能走暗渠）
- 溪：layout.stream_carve 挖出的岩沟里分 STREAM_STEPS 级跌落的水面，每级落差处一条白水
- 瀑布：崖口先是 1–2 m 玻璃状水舌，往下 10 m 内碎成白色水束，40–80 m 散成水雾，落不到云海；两侧各一道细瀑；背后岩面湿暗
- 清水倒锥：朝封面相机一侧、岩锥中段伸出的一颗倒挂水滴（透明水体，折射云海）
"""
import math
import numpy as np
import bpy, bmesh
from mathutils import Matrix
from . import layout as L
from .common import mat_new, bm_to_obj, link_obj
from .buildings import mats, _stone


# ---------------------------------------------------------------- 材质
def _water_clear(name='e2_stream_water'):
    m, t = mat_new(name)
    if t is None:
        return m
    v, _ = t.coords('Object', 1.0)
    n1 = t.new('ShaderNodeTexNoise', (-900, -200), **{'Scale': 1.5, 'Detail': 6.0})
    n2 = t.new('ShaderNodeTexNoise', (-900, -450), **{'Scale': 7.0, 'Detail': 4.0})
    t.link(v, n1.inputs['Vector']); t.link(v, n2.inputs['Vector'])
    hh = t.math('ADD', n1.outputs['Fac'], t.math('MULTIPLY', n2.outputs['Fac'], 0.4))
    bump = t.new('ShaderNodeBump', (-400, -300), Strength=0.2, Distance=0.05)
    t.link(hh, bump.inputs['Height'])
    b = t.bsdf((200, 0), Roughness=0.02, IOR=1.333, **{'Base Color': (0.03, 0.07, 0.06, 1)})
    t.link(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def _white_water(name, fray=True):
    """瀑布 / 跌水白水：UV v = 0 崖口 → 1 末端；u 横向。顶端玻璃水舌 → 白色水束（竖向条纹 + 拉长噪声决定白度与透明），末端淡出。"""
    m, t = mat_new(name)
    if t is None:
        return m
    uv = t.new('ShaderNodeUVMap', (-2000, 0))
    sep = t.new('ShaderNodeSeparateXYZ', (-1800, 0)); t.link(uv.outputs['UV'], sep.inputs[0])
    u, vv = sep.outputs['X'], sep.outputs['Y']
    mp = t.new('ShaderNodeMapping', (-1700, -300)); mp.inputs['Scale'].default_value = (1.0, 0.22, 1.0)
    t.link(uv.outputs['UV'], mp.inputs['Vector'])
    # 水束：两层拉长噪声（竖向），不用规则波纹（审图：像梳子）
    nz = t.new('ShaderNodeTexNoise', (-1450, -600), **{'Scale': 7.0, 'Detail': 8.0, 'Roughness': 0.65, 'Distortion': 1.2})
    t.link(mp.outputs['Vector'], nz.inputs['Vector'])
    nz2 = t.new('ShaderNodeTexNoise', (-1450, -350), **{'Scale': 23.0, 'Detail': 4.0, 'Distortion': 0.6})
    t.link(mp.outputs['Vector'], nz2.inputs['Vector'])
    ob_ = t.new('ShaderNodeTexCoord', (-1700, -800))
    nz3 = t.new('ShaderNodeTexNoise', (-1450, -850), **{'Scale': 0.15, 'Detail': 4.0}); t.link(ob_.outputs['Object'], nz3.inputs['Vector'])
    streak = t.math('ADD', t.math('MULTIPLY', nz.outputs['Fac'], 0.55), t.math('ADD', t.math('MULTIPLY', nz2.outputs['Fac'], 0.25), t.math('MULTIPLY', nz3.outputs['Fac'], 0.2)), (-1200, -400))
    white = t.new('ShaderNodeMapRange', (-1200, 0), **{'From Min': 0.02, 'From Max': 0.3})
    t.link(vv, white.inputs['Value'])
    glass = t.bsdf((-700, 300), Roughness=0.03, IOR=1.333, **{'Base Color': (0.06, 0.1, 0.09, 1), 'Transmission Weight': 1.0})
    foam = t.bsdf((-700, -100), Roughness=0.5, **{'Base Color': (0.88, 0.92, 0.94, 1), 'Subsurface Weight': 0.6})
    foam.inputs['Subsurface Radius'].default_value = (0.15, 0.15, 0.15)
    mixw = t.new('ShaderNodeMixShader', (-400, 100))
    t.link(white.outputs[0], mixw.inputs[0]); t.link(glass.outputs[0], mixw.inputs[1]); t.link(foam.outputs[0], mixw.inputs[2])
    # 透明度：条纹 × 末端淡出 × 两侧毛边
    fade = t.new('ShaderNodeMapRange', (-1000, -800), **{'From Min': 1.0, 'From Max': 0.45})
    t.link(vv, fade.inputs['Value'])
    edge = t.math('SUBTRACT', 0.5, t.math('ABSOLUTE', t.math('SUBTRACT', u, 0.5)), (-1100, -1000))
    edgem = t.new('ShaderNodeMapRange', (-950, -1000), **{'From Min': 0.0, 'From Max': 0.5})
    t.link(t.math('ADD', edge, t.math('MULTIPLY', t.math('SUBTRACT', nz.outputs['Fac'], 0.5), 0.55)), edgem.inputs['Value'])
    st = t.new('ShaderNodeMapRange', (-950, -400), **{'From Min': 0.36, 'From Max': 0.52, 'To Min': 0.25 if fray else 0.6})   # 水束之间留缝，但主体是实的白水
    t.link(streak, st.inputs['Value'])
    top = t.new('ShaderNodeMapRange', (-950, -1200), **{'From Min': 0.0, 'From Max': 0.08, 'To Min': 1.0, 'To Max': 0.0})
    t.link(vv, top.inputs['Value'])
    al = t.math('MULTIPLY', t.math('MAXIMUM', st.outputs[0], top.outputs[0]), fade.outputs[0], (-700, -700))
    al = t.math('MULTIPLY', al, edgem.outputs[0], (-600, -700), clamp=True)
    tr = t.new('ShaderNodeBsdfTransparent', (-400, -300))
    mixa = t.new('ShaderNodeMixShader', (-150, 0))
    t.link(al, mixa.inputs[0]); t.link(tr.outputs[0], mixa.inputs[1]); t.link(mixw.outputs[0], mixa.inputs[2])
    t.link(mixa.outputs[0], t.out.inputs['Surface'])
    return m


def _mist(name='e2_fall_mist', density=0.4):
    """水雾：球体积，中心浓、边缘淡，乘噪声团；前向散射（逆光时发亮）。"""
    m, t = mat_new(name)
    if t is None:
        return m
    v, tc = t.coords('Object', 1.0)
    g = t.new('ShaderNodeTexGradient', (-1000, 0), gradient_type='SPHERICAL')
    t.link(tc.outputs['Object'], g.inputs['Vector'])
    n = t.new('ShaderNodeTexNoise', (-1000, 200), **{'Scale': 0.4, 'Detail': 3.0})
    t.link(v, n.inputs['Vector'])
    mr = t.new('ShaderNodeMapRange', (-800, 200), **{'From Min': 0.35, 'From Max': 0.75})
    t.link(n.outputs['Fac'], mr.inputs['Value'])
    d = t.math('MULTIPLY', g.outputs['Fac'], mr.outputs[0], (-600, 0))
    vol = t.new('ShaderNodeVolumePrincipled', (-200, 0), **{'Color': (0.95, 0.95, 0.97, 1), 'Anisotropy': 0.75})
    t.link(t.math('MULTIPLY', d, density, (-400, 0)), vol.inputs['Density'])
    t.link(vol.outputs[0], t.out.inputs['Volume'])
    return m


def _water_cone_mat():
    m, t = mat_new('e2_water_cone')
    if t is None:
        return m
    b = t.bsdf((200, 0), Roughness=0.02, IOR=1.333, **{'Base Color': (0.7, 0.9, 0.92, 1), 'Transmission Weight': 1.0})
    v, _ = t.coords('Object', 1.0)
    n = t.new('ShaderNodeTexNoise', (-800, -200), **{'Scale': 0.08, 'Detail': 4.0}); t.link(v, n.inputs['Vector'])
    bump = t.new('ShaderNodeBump', (-400, -200), Strength=0.15, Distance=0.5); t.link(n.outputs['Fac'], bump.inputs['Height'])
    t.link(bump.outputs['Normal'], b.inputs['Normal'])
    ab = t.new('ShaderNodeVolumeAbsorption', (200, -300), **{'Color': (0.55, 0.82, 0.85, 1), 'Density': 0.012})
    t.link(ab.outputs[0], t.out.inputs['Volume'])
    return m


# ---------------------------------------------------------------- 几何
def _ribbon(name, cols, mat, col):
    """cols: [(左点, 右点)] 从上到下；带 UV（u 横向 0–1，v 纵向 0–1）。"""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    rows = [[bm.verts.new(p) for p in row] for row in cols]   # 每行 2 个或更多点（横截面可以是弧）
    n = len(rows) - 1; m_ = len(rows[0]) - 1
    for i in range(n):
        for j in range(m_):
            f = bm.faces.new([rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]])
            for lp, (uu, vv) in zip(f.loops, ((j / m_, i / n), ((j + 1) / m_, i / n), ((j + 1) / m_, (i + 1) / n), (j / m_, (i + 1) / n))):
                lp[uvl].uv = (uu, vv)
    return bm_to_obj(bm, name, col, mat)


def _rim_point(pts):
    """沿溪线末段外推到岛缘（edge_dist = 0.3 m）。"""
    (ax, ay), (bx, by) = pts[-2], pts[-1]
    for k in range(400):
        t = k / 399
        x, y = ax + (bx - ax) * t, ay + (by - ay) * t
        if float(L.edge_dist(np.array(x), np.array(y))) < 0.3:
            return x, y
    return bx, by


def outlet(col, M):
    """暗渠出口：粗琢石墙（6 × 4.5 m，朝下游）+ 半圆拱洞（深色）+ 洞口前一块跌水石。"""
    (x0, y0), (x1, y1) = L.STREAM[0], L.STREAM[1]
    a = math.atan2(y1 - y0, x1 - x0)
    z = float(L.stream_bed(0.0))
    bm = bmesh.new()
    Rm = Matrix.Translation((x0 - 1.5 * math.cos(a), y0 - 1.5 * math.sin(a), z - 0.5)) @ Matrix.Rotation(a, 4, 'Z')
    bmesh.ops.create_cube(bm, size=1.0, matrix=Rm @ Matrix.Translation((0, 0, 2.5)) @ Matrix.Diagonal((1.6, 7.0, 5.5, 1)))
    for k in range(9):   # 拱券石
        t = math.pi * k / 8
        bmesh.ops.create_cube(bm, size=1.0, matrix=Rm @ Matrix.Translation((0.85, 1.7 * math.cos(t), 1.6 + 1.7 * math.sin(t))) @ Matrix.Rotation(-t, 4, 'X') @ Matrix.Diagonal((0.3, 0.55, 0.42, 1)))
    bm_to_obj(bm, 'stream_outlet', col, M['wallstone'])
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=1.45, radius2=1.45, depth=0.2,
                          matrix=Rm @ Matrix.Translation((0.82, 0, 1.6)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    bmesh.ops.create_cube(bm, size=1.0, matrix=Rm @ Matrix.Translation((0.82, 0, 0.8)) @ Matrix.Diagonal((0.2, 2.9, 1.6, 1)))
    bm_to_obj(bm, 'stream_outlet_dark', col, M['dark'])


def stream(col, M):
    """分级水面：每级平水面（高出沟底线 0.25 m），级间落差处一条白水。"""
    water, white = _water_clear(), _white_water('e2_cascade_white', fray=False)
    rx, ry = _rim_point(L.STREAM)
    pts = [p for p in L.STREAM[:-1]] + [(rx, ry)]
    seq = []
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.dist(a, b) / 1.2))
        seq += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n)]
    seq.append((rx, ry))
    X, Y = np.array([p[0] for p in seq]), np.array([p[1] for p in seq])
    _, S = L.stream_ds(X, Y)
    N = L.STREAM_STEPS
    lvl = np.floor(S * N) / N
    zs = L.stream_bed(lvl) + 0.25
    bm = bmesh.new()
    prev = None
    for i in range(len(seq)):
        j0, j1 = max(i - 1, 0), min(i + 1, len(seq) - 1)
        tx, ty = X[j1] - X[j0], Y[j1] - Y[j0]; ln = math.hypot(tx, ty) or 1
        nx, ny = -ty / ln, tx / ln
        w = 1.6 + 1.4 * S[i] + 0.4 * math.sin(i * 0.7)
        row = (bm.verts.new((X[i] + nx * w, Y[i] + ny * w, zs[i])), bm.verts.new((X[i] - nx * w, Y[i] - ny * w, zs[i])))
        if prev is not None and abs(zs[i] - zs[i - 1]) < 1e-3:
            bm.faces.new([prev[0], prev[1], row[1], row[0]])
        prev = row
    bm_to_obj(bm, 'stream_water', col, water)
    # 级间白水：落差处一段竖向短幕
    for i in range(1, len(seq)):
        if zs[i] < zs[i - 1] - 1e-3:
            tx, ty = X[i] - X[i - 1], Y[i] - Y[i - 1]; ln = math.hypot(tx, ty) or 1
            nx, ny = -ty / ln, tx / ln; w = 1.4 + 1.2 * S[i]
            cols_ = []
            for k in range(6):
                f = k / 5; zz = zs[i - 1] - (zs[i - 1] - zs[i] + 0.3) * f; dx = 0.35 * f
                cx, cy = X[i - 1] + tx / ln * (0.3 + dx), Y[i - 1] + ty / ln * (0.3 + dx)
                cols_.append(((cx + nx * w, cy + ny * w, zz), (cx - nx * w, cy - ny * w, zz)))
            _ribbon(f'stream_cascade_{i}', cols_, white, col)
    return (rx, ry)


def falls(col, M, rim):
    """崖口主瀑布（宽 6 → 13 m，落 130 m）+ 沿崖两侧各一道细瀑；水雾体积；背后岩面湿暗。"""
    white = _white_water('e2_fall_white')
    thin = _white_water('e2_fall_thin')
    mist = _mist()
    rx, ry = rim
    th0 = math.atan2(ry, rx)
    specs = [(th0, 10.0, 24.0, 140.0, white, 'fall_main')]
    for dth, nm, a_, b_ in ((-0.075, 'fall_thin_s', 2.0, 5.0), (0.068, 'fall_thin_n', 3.0, 8.0)):
        specs.append((th0 + dth, a_, b_, 90.0, thin, nm))
    for th, w0, w1, H, mat, nm in specs:
        R = float(L.outline_R(np.array(th)))
        px, py = (R - 0.4) * math.cos(th), (R - 0.4) * math.sin(th)
        z0 = float(L.ground_z(px, py)) + (0.25 if nm == 'fall_main' else 0.05)
        if nm != 'fall_main':   # 细瀑从崖口起（不是半崖冒出）
            z0 = max(z0, float(L.ground_z(rx * 0.995, ry * 0.995)) - 0.6)
        ox, oy = math.cos(th), math.sin(th); sx, sy = -oy, ox
        cols_ = []
        for k in range(41):
            f = k / 40; dz = H * f
            out = (0.6 if nm == 'fall_main' else 1.6) + 0.85 * math.sqrt(dz)   # 抛物线外飘（水平流速约 2 m/s）
            w = (w0 + (w1 - w0) * f ** 0.7) / 2
            wob = (2.5 * math.sin(f * 7 + th * 40) + 1.0 * math.sin(f * 19 + th * 13)) * f
            cx, cy = px + ox * out + sx * wob, py + oy * out + sy * wob
            row = []
            for q in (-1.0, -0.5, 0.0, 0.5, 1.0):   # 弧形横截面：中间外鼓 0.15 w
                bow = 0.15 * w * (1 - q * q)
                row.append((cx + sx * w * q + ox * bow, cy + sy * w * q + oy * bow, z0 - dz))
            cols_.append(row)
        _ribbon(nm, cols_, mat, col)
        if nm == 'fall_main':
            for k, (f, r) in enumerate(((0.05, 6.0), (0.3, 12.0), (0.55, 20.0), (0.8, 28.0), (1.0, 34.0))):
                dz = H * f; out = 0.6 + 0.85 * math.sqrt(dz)
                bm = bmesh.new()
                bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0, matrix=Matrix.Translation((px + ox * (out + r * 0.3), py + oy * (out + r * 0.3), z0 - dz)) @ Matrix.Diagonal((r, r, r * 1.4, 1)))
                bm_to_obj(bm, f'fall_mist_{k}', col, mist)
            # 背后岩面：湿暗条（贴崖口下方的薄片，粗糙度低）
            wet = _stone('e2_wet_rock', 'rock_face_03', (0.12, 0.11, 0.1), 0.6, windows=False, grime=0.3)
            bw = next((n for n in wet.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bw is not None:
                bw.inputs['Roughness'].default_value = 0.12
                if bw.inputs['Roughness'].is_linked:
                    wet.node_tree.links.remove(bw.inputs['Roughness'].links[0])
            cols_ = []
            for k in range(13):
                f = k / 12; dz = 26 * f
                rr = (R - 1.2 - 0.9 * dz * 0.9)
                cols_.append(((rr * math.cos(th) + sx * 5, rr * math.sin(th) + sy * 5, z0 - 0.4 - dz), (rr * math.cos(th) - sx * 5, rr * math.sin(th) - sy * 5, z0 - 0.4 - dz)))
            _ribbon('fall_wet_rock', cols_, wet, col)


def water_cone(col):
    """清水倒锥：朝封面相机方向、岩锥中段外侧伸出的倒挂水滴（上缘嵌进岩体）。"""
    a = math.radians(-107.5)
    cx, cy = 125 * math.cos(a), 125 * math.sin(a)
    bm = bmesh.new()
    # 水滴：顶部宽、向下收成尖（倒锥），轮廓用解析式直接建环
    rings = []
    zs = np.linspace(-60.0, -170.0, 36)   # 审图：原来 −110…−232 藏在云领里看不见
    for i, z in enumerate(zs):
        f = i / (len(zs) - 1)
        r = 23.0 * (1 - f) ** 0.85 * (0.75 + 0.25 * math.cos(f * math.pi * 0.5)) + 0.05
        rings.append([bm.verts.new((cx + r * math.cos(t), cy + r * math.sin(t), z)) for t in np.linspace(0, 2 * math.pi, 48, endpoint=False)])
    for r0, r1 in zip(rings[:-1], rings[1:]):
        for j in range(48):
            bm.faces.new([r0[j], r0[(j + 1) % 48], r1[(j + 1) % 48], r1[j]])
    bm.faces.new(rings[0][::-1])
    tip = bm.verts.new((cx, cy, zs[-1] - 3.0))
    for j in range(48):
        bm.faces.new([rings[-1][j], rings[-1][(j + 1) % 48], tip])
    ob = bm_to_obj(bm, 'water_cone', col, _water_cone_mat(), smooth=True)
    return ob


def build(col):
    M = mats()
    outlet(col, M)
    rim = stream(col, M)
    falls(col, M, rim)
    water_cone(col)
