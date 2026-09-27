"""建筑体量：海湖式主楼群、客房楼、林中别墅、树屋、Breakers 别馆、Greystone 石屋、连廊、缆车、吊桥、停靠平台、喷泉、栏杆。

外观细节（窗、檐口、烟囱、条纹遮阳篷）只做到航拍能读出的程度；不做室内。
"""
import math
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix
from . import layout as L
from .common import NT, mat_new, link_obj, bm_to_obj, coll, rng, rot2

FH = 4.5   # 层高
ARCHED = {'hall', 'w_wing_a', 'e_wing_a', 'w_wing_b', 'e_wing_b', 'w_pav', 'e_pav', 'n_link', 'w_low', 'e_low', 'breakers'}   # r3 首层拱窗


# ---------------------------------------------------------------- 材质
def _stone(name, tex, tint, tint_amt, windows=True, grime=0.18, ashlar=False):
    m, t = mat_new(name)
    if t is None:
        return m
    v, tc = t.coords('Object', 1 / 2.6, (-2200, 0))
    c, r, n = t.pbr_tex(tex, v, (-1700, 300), 0.6)
    base = t.mix(tint_amt, c, tint, loc=(-1300, 300))
    # 风化：竖向雨痕 + 墙脚泛潮 + 角落积灰
    st = t.new('ShaderNodeMapping', (-1700, -500))
    st.inputs['Scale'].default_value = (1.4, 1.4, 0.12)
    t.link(tc.outputs['Object'], st.inputs['Vector'])
    nz = t.new('ShaderNodeTexNoise', (-1500, -500), **{'Scale': 1.2, 'Detail': 4.0})
    t.link(st.outputs['Vector'], nz.inputs['Vector'])
    streak = t.new('ShaderNodeMapRange', (-1300, -500), **{'From Min': 0.52, 'From Max': 0.75, 'To Min': 0.0, 'To Max': grime})
    t.link(nz.outputs['Fac'], streak.inputs['Value'])
    sep = t.new('ShaderNodeSeparateXYZ', (-1700, -900))
    t.link(tc.outputs['Object'], sep.inputs[0])
    foot = t.new('ShaderNodeMapRange', (-1500, -900), **{'From Min': 1.6, 'From Max': 0.0, 'To Min': 0.0, 'To Max': 0.28})
    t.link(sep.outputs['Z'], foot.inputs['Value'])
    ao = t.new('ShaderNodeAmbientOcclusion', (-1500, -1200), Distance=0.8)
    aof = t.math('SUBTRACT', 1.0, ao.outputs['AO'], (-1300, -1200))
    dirt = t.math('ADD', streak.outputs[0], foot.outputs[0], (-1100, -700))
    dirt = t.math('ADD', dirt, t.math('MULTIPLY', aof, 0.35), (-1000, -700), clamp=True)
    col = t.mix(dirt, base, (0.36, 0.34, 0.3), 'MULTIPLY', (-900, 300))
    rough = t.math('ADD', r, 0.15, (-900, 0), clamp=True)
    if ashlar:
        # r3 石灰岩琢石砌（ashlar）：0.6 m 一皮、1.4 m 一块，错缝；接缝细、块与块之间有极轻的色差
        sep0 = t.new('ShaderNodeSeparateXYZ', (-1900, 900))
        t.link(tc.outputs['Object'], sep0.inputs[0])
        ns0 = t.new('ShaderNodeSeparateXYZ', (-1900, 1100))
        t.link(tc.outputs['Normal'], ns0.inputs[0])
        side = t.math('GREATER_THAN', t.math('ABSOLUTE', ns0.outputs['X']), 0.5, (-1700, 1100))
        uu0 = t.math('ADD', t.math('MULTIPLY', side, sep0.outputs['Y']), t.math('MULTIPLY', t.math('SUBTRACT', 1.0, side), sep0.outputs['X']), (-1500, 1000))
        cv = t.new('ShaderNodeCombineXYZ', (-1300, 1000))
        t.link(uu0, cv.inputs[0]); t.link(sep0.outputs['Z'], cv.inputs[1])
        br = t.new('ShaderNodeTexBrick', (-1100, 1000), **{'Scale': 1.0, 'Mortar Size': 0.012, 'Mortar Smooth': 0.3, 'Bias': 0.0,
                                                          'Brick Width': 1.4, 'Row Height': 0.6})
        br.offset = 0.5
        br.inputs['Color1'].default_value = (1.0, 1.0, 1.0, 1)
        br.inputs['Color2'].default_value = (0.93, 0.92, 0.9, 1)
        br.inputs['Mortar'].default_value = (0.62, 0.6, 0.56, 1)
        t.link(cv.outputs[0], br.inputs['Vector'])
        col = t.mix(1.0, col, br.outputs['Color'], 'MULTIPLY', (-800, 500))
        bmp = t.new('ShaderNodeBump', (-800, -300), Strength=0.35, Distance=0.02)
        t.link(br.outputs['Fac'], bmp.inputs['Height'])
        t.link(n, bmp.inputs['Normal'])
        n = bmp.outputs['Normal']
    if windows:
        # 窗：物体局部坐标；开间 bay、层高 fh、顶部 top 来自物体自定义属性
        bay = t.attr('bay', 'OBJECT', (-2000, -1600)).outputs['Fac']
        fh = t.attr('fh', 'OBJECT', (-2000, -1800)).outputs['Fac']
        top = t.attr('top', 'OBJECT', (-2000, -2000)).outputs['Fac']
        nsep = t.new('ShaderNodeSeparateXYZ', (-1900, -1400))
        t.link(tc.outputs['Normal'], nsep.inputs[0])
        ax = t.math('ABSOLUTE', nsep.outputs['X'], None, (-1700, -1400))
        az = t.math('ABSOLUTE', nsep.outputs['Z'], None, (-1700, -1300))
        sidef = t.math('GREATER_THAN', ax, 0.5, (-1550, -1400))
        u = t.mix(sidef, sep.outputs['X'], sep.outputs['Y'], loc=(-1400, -1500))
        uu = t.new('ShaderNodeSeparateColor', (-1250, -1500))
        t.link(u, uu.inputs[0])
        fu = t.math('FRACT', t.math('DIVIDE', t.math('ADD', uu.outputs[0], t.math('MULTIPLY', bay, 0.5)), bay))
        fz = t.math('FRACT', t.math('DIVIDE', sep.outputs['Z'], fh))
        wu = t.math('MULTIPLY', t.math('GREATER_THAN', fu, 0.3), t.math('LESS_THAN', fu, 0.7))
        wz = t.math('MULTIPLY', t.math('GREATER_THAN', fz, 0.24), t.math('LESS_THAN', fz, 0.8))
        wtop = t.math('LESS_THAN', sep.outputs['Z'], t.math('SUBTRACT', top, 1.0))
        wz0 = t.math('MAXIMUM', t.attr('wz0', 'OBJECT', (-2000, -2200)).outputs['Fac'], 0.4)
        wbot = t.math('GREATER_THAN', sep.outputs['Z'], wz0)
        vert = t.math('LESS_THAN', az, 0.3)
        win = t.math('MULTIPLY', t.math('MULTIPLY', wu, wz), t.math('MULTIPLY', t.math('MULTIPLY', wtop, wbot), vert), (-800, -1500))
        col = t.mix(win, col, (0.018, 0.022, 0.028), loc=(-600, 300))
        rough = t.mix(win, rough, (0.06, 0.06, 0.06), loc=(-600, 0))
    b = t.bsdf((200, 0))
    t.link(col, b.inputs['Base Color'])
    t.link(rough, b.inputs['Roughness'])
    t.link(n, b.inputs['Normal'])
    return m


def _roof(name, tex, tint, amt, scale=1 / 2.2):
    m, t = mat_new(name)
    if t is None:
        return m
    v, tc = t.coords('Object', scale, (-1800, 0))
    c, r, n = t.pbr_tex(tex, v, (-1400, 200), 1.6)
    oi = t.new('ShaderNodeObjectInfo', (-1400, 600))
    hue = t.new('ShaderNodeHueSaturation', (-900, 300))
    hue.inputs['Saturation'].default_value = 0.85
    t.link(t.math('ADD', t.math('MULTIPLY', oi.outputs['Random'], 0.06), 0.47), hue.inputs['Hue'])
    t.link(t.math('ADD', t.math('MULTIPLY', oi.outputs['Random'], 0.25), 0.72), hue.inputs['Value'])
    t.link(t.mix(amt, c, tint, loc=(-1100, 300)), hue.inputs['Color'])
    # 瓦面积灰 / 青苔斑
    nz = t.new('ShaderNodeTexNoise', (-1100, -300), **{'Scale': 0.9, 'Detail': 5.0})
    t.link(tc.outputs['Object'], nz.inputs['Vector'])
    blot = t.new('ShaderNodeMapRange', (-900, -300), **{'From Min': 0.55, 'From Max': 0.8, 'To Max': 0.35})
    t.link(nz.outputs['Fac'], blot.inputs['Value'])
    col = t.mix(blot.outputs[0], hue.outputs[0], (0.2, 0.19, 0.15), loc=(-600, 300))
    b = t.bsdf((200, 0))
    t.link(col, b.inputs['Base Color'])
    t.link(r, b.inputs['Roughness'])
    t.link(n, b.inputs['Normal'])
    return m


def _plain(name, col, rough=0.5, metal=0.0, emit=None):
    m, t = mat_new(name)
    if t is None:
        return m
    b = t.bsdf((200, 0), Roughness=rough, Metallic=metal, **{'Base Color': (*col, 1)})
    if emit:
        b.inputs['Emission Color'].default_value = (*emit[0], 1)
        b.inputs['Emission Strength'].default_value = emit[1]
    return m


def _awning():
    m, t = mat_new('e2_awning')
    if t is None:
        return m
    v, tc = t.coords('Object', 1.0)
    w = t.new('ShaderNodeTexWave', (-800, 0), wave_type='BANDS', bands_direction='X', **{'Scale': 0.9, 'Distortion': 0.0})
    t.link(v, w.inputs['Vector'])
    s = t.math('GREATER_THAN', t.math('SINE', t.math('MULTIPLY', w.outputs['Fac'], 6.283)), 0.0)
    col = t.mix(s, (0.9, 0.88, 0.8), (0.85, 0.66, 0.14))
    b = t.bsdf((200, 0), Roughness=0.8)
    t.link(col, b.inputs['Base Color'])
    return m


def _wood():
    m, t = mat_new('e2_wood')
    if t is None:
        return m
    v, _ = t.coords('Object', 1 / 1.5)
    c, r, n = t.pbr_tex('bark_brown_02', v, (-1000, 0), 0.5)
    b = t.bsdf((200, 0))
    t.link(t.mix(0.4, c, (0.28, 0.17, 0.09), loc=(-500, 0)), b.inputs['Base Color'])
    t.link(r, b.inputs['Roughness'])
    t.link(n, b.inputs['Normal'])
    return m


def _pool():
    m, t = mat_new('e2_pool')
    if t is None:
        return m
    # r4b 泳池：绿松石
    v, _ = t.coords('Object', 1.0)
    n = t.new('ShaderNodeTexNoise', (-800, -200), **{'Scale': 0.6, 'Detail': 6.0})
    t.link(v, n.inputs['Vector'])
    bump = t.new('ShaderNodeBump', (-400, -200), Strength=0.1, Distance=0.1)
    t.link(n.outputs['Fac'], bump.inputs['Height'])
    b = t.bsdf((200, 0), Roughness=0.03, **{'Base Color': (0.04, 0.4, 0.45, 1)})
    t.link(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def _honed():
    """磨面石灰岩铺地：1.2 × 0.8 m 大板，细缝，微光泽。"""
    m, t = mat_new('e2_honed')
    if t is None:
        return m
    v, tc = t.coords('Object', 1.0)
    sep = t.new('ShaderNodeSeparateXYZ', (-1000, 0))
    t.link(tc.outputs['Object'], sep.inputs[0])
    cv = t.new('ShaderNodeCombineXYZ', (-800, 0))
    t.link(sep.outputs['X'], cv.inputs[0]); t.link(sep.outputs['Y'], cv.inputs[1])
    br = t.new('ShaderNodeTexBrick', (-600, 0), **{'Scale': 1.0, 'Mortar Size': 0.006, 'Brick Width': 1.2, 'Row Height': 0.8})
    br.offset = 0.0
    br.inputs['Color1'].default_value = (0.86, 0.83, 0.77, 1)
    br.inputs['Color2'].default_value = (0.8, 0.77, 0.7, 1)
    br.inputs['Mortar'].default_value = (0.55, 0.52, 0.47, 1)
    t.link(cv.outputs[0], br.inputs['Vector'])
    nz = t.new('ShaderNodeTexNoise', (-600, -300), **{'Scale': 3.0, 'Detail': 6.0})
    t.link(v, nz.inputs['Vector'])
    col = t.mix(t.math('MULTIPLY', nz.outputs['Fac'], 0.25), br.outputs['Color'], (0.7, 0.66, 0.58), loc=(-300, 0))
    b = t.bsdf((200, 0), Roughness=0.32)
    t.link(col, b.inputs['Base Color'])
    return m


def _hedge():
    """修剪黄杨绿篱：深绿 + 细密叶面噪声凹凸（航拍可读的“剪过”质感）。"""
    m, t = mat_new('e2_hedge')
    if t is None:
        return m
    v, tc = t.coords('Object', 1.0)
    n = t.new('ShaderNodeTexNoise', (-900, -200), **{'Scale': 9.0, 'Detail': 6.0, 'Roughness': 0.7})
    t.link(v, n.inputs['Vector'])
    n2 = t.new('ShaderNodeTexNoise', (-900, 200), **{'Scale': 0.4, 'Detail': 2.0})
    t.link(v, n2.inputs['Vector'])
    col = t.mix(n2.outputs['Fac'], (0.025, 0.07, 0.018), (0.06, 0.13, 0.03), loc=(-500, 200))
    col = t.mix(t.math('MULTIPLY', n.outputs['Fac'], 0.5), col, (0.1, 0.18, 0.05), loc=(-300, 200))
    bump = t.new('ShaderNodeBump', (-400, -200), Strength=0.6, Distance=0.05)
    t.link(n.outputs['Fac'], bump.inputs['Height'])
    b = t.bsdf((200, 0), Roughness=0.8)
    t.link(col, b.inputs['Base Color'])
    t.link(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def _spray():
    """喷泉水柱：半透明白 + 微自发光。"""
    m, t = mat_new('e2_spray')
    if t is None:
        return m
    b = t.bsdf((200, 0), Roughness=0.2, **{'Base Color': (0.9, 0.95, 1.0, 1), 'Transmission Weight': 0.6, 'Alpha': 0.75})
    b.inputs['Emission Color'].default_value = (0.85, 0.9, 1.0, 1)
    b.inputs['Emission Strength'].default_value = 0.25
    return m


MATS = {}
ROOF_OVR = {'g1': 'copper', 'g3': 'terracotta', 'spa': 'copper', 'w_g1': 'terracotta', 'svc_n': 'terracotta', 'svc_s': 'terracotta', 'svc_w': 'terracotta', 'svc_e': 'terracotta', 'club': 'copper'}


def mats():
    if MATS:
        return MATS
    MATS.update(
        # r3：清爽白石（Portland / 石灰华调），降低风化，不再是奶油墙
        white=_stone('e2_stone_white', 'castle_brick_02_white', (0.92, 0.9, 0.85), 0.82, grime=0.07, ashlar=True),
        plain=_stone('e2_stone_plain', 'castle_brick_02_white', (0.94, 0.925, 0.88), 0.85, windows=False, grime=0.05),
        ashlar=_stone('e2_stone_ashlar', 'castle_brick_02_white', (0.93, 0.91, 0.86), 0.85, windows=False, grime=0.06, ashlar=True),
        honed=_honed(),
        wallstone=_stone('e2_stone_wall', 'castle_wall_varriation', (0.66, 0.61, 0.52), 0.3, windows=False, grime=0.22),
        beige=_stone('e2_stone_beige', 'castle_brick_02_white', (0.66, 0.56, 0.42), 0.7),
        grey=_stone('e2_stone_grey', 'castle_wall_varriation', (0.4, 0.39, 0.37), 0.35, grime=0.25),
        grey_plain=_stone('e2_stone_grey_plain', 'castle_wall_varriation', (0.4, 0.39, 0.37), 0.35, windows=False),
        # r3：屋顶从陶土红瓦改成浅灰石板（用户定）；键名沿用 terra 以少改调用处
        terra=_roof('e2_roof_lightslate', 'grey_roof_tiles_02', (0.2, 0.23, 0.27), 0.55, 1 / 1.2),   # r3b：中灰蓝石板，和白墙拉开
        slate=_roof('e2_roof_slate', 'grey_roof_tiles_02', (0.2, 0.21, 0.23), 0.4, 1 / 2.0),
        wood=_wood(),
        bronze=_plain('e2_bronze', (0.18, 0.12, 0.07), 0.35, 0.9),
        gold=_plain('e2_gold', (0.85, 0.62, 0.25), 0.25, 1.0),
        dark=_plain('e2_dark_recess', (0.16, 0.13, 0.1), 0.8),
        glass=_plain('e2_glass', (0.05, 0.07, 0.08), 0.05),
        awning=_awning(),
        pool=_pool(),
        shutter=_plain('e2_window_glass', (0.05, 0.07, 0.09), 0.03, 0.65),
        hedge=_hedge(),
        copper=_plain('e2_copper_verdigris', (0.22, 0.46, 0.38), 0.55, 0.2),
        terracotta=_roof('e2_roof_terracotta', 'clay_roof_tiles_02', (0.5, 0.2, 0.1), 0.35, 1 / 1.2),
        metal=_plain('e2_metal_roof', (0.55, 0.57, 0.58), 0.3, 0.8),
        greenglass=_plain('e2_glasshouse', (0.55, 0.7, 0.68), 0.05, 0.3),
        concrete=_stone('e2_concrete', 'castle_brick_02_white', (0.62, 0.62, 0.6), 0.9, windows=False, grime=0.1),
        lead=_plain('e2_lead', (0.52, 0.53, 0.54), 0.4, 0.3),
        steel=_plain('e2_steel', (0.03, 0.03, 0.032), 0.35, 0.8),
        spray=_spray(),
        rock=_stone('e2_rock', 'rock_face_03', (0.22, 0.2, 0.18), 0.45, windows=False, grime=0.3),
    )
    return MATS


# ---------------------------------------------------------------- 几何工具
def _obj(name, bm, mat, loc=(0, 0, 0), rot=0.0, props=None, col=None):
    ob = bm_to_obj(bm, name, col, mat)
    ob.location = loc
    ob.rotation_euler.z = rot
    for k, v in (props or {}).items():
        ob[k] = v
    return ob


def _box(bm, x0, y0, z0, x1, y1, z1):
    vs = [bm.verts.new(v) for v in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                     (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
    for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
        bm.faces.new([vs[i] for i in f])


def _hip(bm, w, d, z, pitch, ov):
    """四坡屋顶（局部坐标，中心在原点），屋脊沿长边。"""
    W, D = w / 2 + ov, d / 2 + ov
    if W >= D:
        rise = D * pitch
        r = W - D
        top = [bm.verts.new((-r, 0, z + rise)), bm.verts.new((r, 0, z + rise))]
    else:
        rise = W * pitch
        r = D - W
        top = [bm.verts.new((0, -r, z + rise)), bm.verts.new((0, r, z + rise))]
    c = [bm.verts.new(p) for p in [(-W, -D, z), (W, -D, z), (W, D, z), (-W, D, z)]]
    if W >= D:
        bm.faces.new([c[0], c[1], top[1], top[0]])
        bm.faces.new([c[1], c[2], top[1]])
        bm.faces.new([c[2], c[3], top[0], top[1]])
        bm.faces.new([c[3], c[0], top[0]])
    else:
        bm.faces.new([c[0], c[1], top[0]])
        bm.faces.new([c[1], c[2], top[1], top[0]])
        bm.faces.new([c[2], c[3], top[1]])
        bm.faces.new([c[3], c[0], top[0], top[1]])
    # 檐口厚度
    b = [bm.verts.new((p.co.x, p.co.y, z - 0.35)) for p in c]
    for i in range(4):
        bm.faces.new([b[i], b[(i + 1) % 4], c[(i + 1) % 4], c[i]])
    bm.faces.new(b[::-1])
    return rise


def _bar(bm, p0, p1, w, h):
    """p0→p1 的细长方条（屋脊 / 斜脊铅皮压顶）。"""
    from mathutils import Vector as V
    a, b = V(p0), V(p1)
    d = b - a
    ln = d.length
    if ln < 1e-3:
        return
    q = d.to_track_quat('X', 'Z')
    M = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((ln, w, h, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=M)


def roof_details(bm_roof, bm_trim, bm_lead, bm_glass, w, d, z, pitch, r, dormers=True, skylights=False):
    """r4 俯视可读的屋面细部：铅皮屋脊 / 斜脊、老虎窗（小四坡顶）、天窗、脊上烟囱。局部坐标同 _hip。"""
    W, D = w / 2, d / 2
    swap = W < D
    if swap:
        W, D = D, W
    rise = D * pitch
    rr = W - D
    P = (lambda x, y, zz: (y, x, zz)) if swap else (lambda x, y, zz: (x, y, zz))
    top = [P(-rr, 0, z + rise), P(rr, 0, z + rise)]
    c = [P(-W, -D, z), P(W, -D, z), P(W, D, z), P(-W, D, z)]
    _bar(bm_lead, top[0], top[1], 0.45, 0.35)
    for a, b in ((c[0], top[0]), (c[3], top[0]), (c[1], top[1]), (c[2], top[1])):
        _bar(bm_lead, a, b, 0.4, 0.3)
    if dormers and D > 4.5:
        n = int((2 * rr + D) // 4.8)
        xs = [(-(n - 1) / 2 + i) * 4.8 for i in range(n)]
        for sy in (-1, 1):
            for x in xs:
                if abs(x) > rr + D * 0.35:
                    continue
                t = 0.42
                y0 = sy * D * (1 - t)
                zc = z + rise * t
                lo = [P(x - 0.8, y0, zc - 0.2), P(x + 0.8, y0, zc - 0.2)]
                # 竖窗墙：向屋脊方向伸 2 m
                y1 = y0 - sy * 2.2
                for (xa, ya, za, xb, yb, zb) in [(x - 0.8, min(y0, y1), zc - 0.4, x + 0.8, max(y0, y1), zc + 1.5)]:
                    q = [P(xa, ya, za), P(xb, yb, zb)]
                    bm = bm_trim
                    lo3 = [min(q[0][k], q[1][k]) for k in range(3)]
                    hi3 = [max(q[0][k], q[1][k]) for k in range(3)]
                    _box(bm, *lo3, *hi3)
                # 小双坡顶
                gy = sy * 0.12
                ap = [bm_roof.verts.new(P(x - 1.05, y0 + gy, zc + 1.45)), bm_roof.verts.new(P(x, y0 + gy, zc + 2.2)),
                      bm_roof.verts.new(P(x + 1.05, y0 + gy, zc + 1.45)), bm_roof.verts.new(P(x - 1.05, y1, zc + 1.45)),
                      bm_roof.verts.new(P(x, y1, zc + 2.2)), bm_roof.verts.new(P(x + 1.05, y1, zc + 1.45))]
                bm_roof.faces.new([ap[0], ap[1], ap[4], ap[3]])
                bm_roof.faces.new([ap[1], ap[2], ap[5], ap[4]])
                bm_glass.faces.new([bm_glass.verts.new(P(x - 0.55, y0 + sy * 0.02, zc - 0.1)), bm_glass.verts.new(P(x + 0.55, y0 + sy * 0.02, zc - 0.1)),
                                    bm_glass.verts.new(P(x + 0.55, y0 + sy * 0.02, zc + 1.2)), bm_glass.verts.new(P(x - 0.55, y0 + sy * 0.02, zc + 1.2))])
    if skylights and rr > 3:
        for x in (-rr * 0.6, -rr * 0.2, rr * 0.2, rr * 0.6):
            for sy in (-1, 1):
                t = 0.72
                y0, y1 = sy * D * (1 - t) - sy * 1.2, sy * D * (1 - t) + sy * 1.2
                z0, z1 = z + rise * (1 - abs(y0) / D) + 0.08, z + rise * (1 - abs(y1) / D) + 0.08
                v = [bm_glass.verts.new(P(x - 1.0, y0, z0)), bm_glass.verts.new(P(x + 1.0, y0, z0)),
                     bm_glass.verts.new(P(x + 1.0, y1, z1)), bm_glass.verts.new(P(x - 1.0, y1, z1))]
                bm_glass.faces.new(v)
    return [P(x, 0, z + rise) for x in (-rr * 0.75, rr * 0.75)] if rr > 2 else [P(0, 0, z + rise)]


def _gable(bm_roof, bm_wall, w, d, z, pitch, ov):
    """双坡（屋脊沿长边），山墙三角进墙体网格。"""
    long_x = w >= d
    W, D = (w / 2, d / 2) if long_x else (d / 2, w / 2)
    rise = D * pitch

    def P(a, b, c):
        return (a, b, c) if long_x else (b, a, c)
    e = [bm_roof.verts.new(P(sx * (W + ov * 0.6), sy * (D + ov), z - ov * pitch)) for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    rg = [bm_roof.verts.new(P(sx * (W + ov * 0.6), 0, z + rise)) for sx in (-1, 1)]
    bm_roof.faces.new([e[0], e[1], rg[1], rg[0]])
    bm_roof.faces.new([e[2], e[3], rg[0], rg[1]])
    for sx in (-1, 1):
        t = [bm_wall.verts.new(P(sx * W, -D, z)), bm_wall.verts.new(P(sx * W, D, z)), bm_wall.verts.new(P(sx * W, 0, z + rise))]
        bm_wall.faces.new(t)
    return rise


def _facade_detail(bm, w, d, ht, fh, bay, zbase, bg=None, arched=False, steel=None):
    """窗套（侧框 + 窗楣 + 窗台，外凸 0.18 m，和着色器画的暗窗对齐）、每层腰线、双层檐口。"""
    pr = 0.18
    for face in ('x-', 'x+', 'y-', 'y+'):
        L_ = d if face[0] == 'x' else w
        half_o = (w if face[0] == 'x' else d) / 2
        sgn = -1 if face[1] == '-' else 1
        nb = int((L_ / 2 - bay * 0.35) // bay)
        us = [k * bay for k in range(-nb, nb + 1)]

        def B(u0, u1, z0, z1, o0, o1, tgt=None):
            tb = tgt or bm
            if face[0] == 'x':
                _box(tb, sgn * half_o + (o0 if sgn > 0 else -o1), u0, z0, sgn * half_o + (o1 if sgn > 0 else -o0), u1, z1)
            else:
                _box(tb, u0, sgn * half_o + (o0 if sgn > 0 else -o1), z0, u1, sgn * half_o + (o1 if sgn > 0 else -o0), z1)
        nf = int(round((ht) / fh))
        for f in range(nf):
            zf = f * fh
            z0, z1 = zf + 0.24 * fh, zf + 0.8 * fh
            if arched and f == 0 and bg is not None:
                # r3 首层拱形落地窗：钢框玻璃 + 石拱券（Borgo 式），半圆拱用 7 级台阶近似
                hw = 0.26 * bay
                za, zc = 0.35, 0.6 * fh
                for u in us:
                    B(u - hw, u + hw, za, zc, 0, 0.13, bg)
                    for k in range(16):
                        a0, a1 = k / 16, (k + 1) / 16
                        hwk = hw * math.sqrt(max(0.0, 1 - a1 ** 2))
                        B(u - hwk, u + hwk, zc + hw * a0, zc + hw * a1, 0, 0.13, bg)
                    for k in range(9):   # 拱券石（楔石一圈）
                        th = math.pi * (k + 0.5) / 9
                        cu, cz = u + (hw + 0.16) * math.cos(th), zc + (hw + 0.16) * math.sin(th)
                        B(cu - 0.2, cu + 0.2, cz - 0.2, cz + 0.2, 0, pr + 0.04)
                    B(u - hw - 0.24, u - hw, za, zc, 0, pr)
                    B(u + hw, u + hw + 0.24, za, zc, 0, pr)
                    if steel is not None:   # 细钢框：竖梃 2 道 + 横档 2 道 + 拱内放射档
                        for du in (-hw / 3, hw / 3):
                            B(u + du - 0.03, u + du + 0.03, za, zc + hw * 0.9, 0, 0.17, steel)
                        for zz in (za + (zc - za) * 0.45, zc):
                            B(u - hw, u + hw, zz - 0.03, zz + 0.03, 0, 0.17, steel)
                continue
            if z1 > ht - 1.0 or z0 < 0.4:
                continue
            for u in us:
                hw = 0.2 * bay
                B(u - hw - 0.22, u - hw, z0, z1, 0, pr)          # 侧框
                B(u + hw, u + hw + 0.22, z0, z1, 0, pr)
                B(u - hw - 0.35, u + hw + 0.35, z1, z1 + 0.32, 0, pr + 0.08)   # 窗楣
                B(u - hw - 0.3, u + hw + 0.3, z0 - 0.14, z0, 0, pr + 0.1)      # 窗台
                if bg is not None:
                    B(u - hw, u + hw, z0, z1, 0, 0.13, bg)                       # 玻璃
                    B(u - 0.05, u + 0.05, z0, z1, 0, 0.16)                       # 竖梃
                    zt = z0 + (z1 - z0) * 0.7
                    B(u - hw, u + hw, zt - 0.05, zt + 0.05, 0, 0.16)             # 横档
            if f > 0:
                B(-L_ / 2 - 0.12, L_ / 2 + 0.12, zf - 0.12, zf + 0.1, 0, 0.12)   # 腰线
        B(-L_ / 2 - 0.25, L_ / 2 + 0.25, ht - 1.0, ht - 0.75, 0, 0.25)            # 檐下线脚
        B(-L_ / 2 - 0.2, L_ / 2 + 0.2, zbase, 0.6, 0, 0.15)                       # 勒脚


def baluster_run(bm, p0, p1, z0, z1=None, h=1.0, pitch=0.42, rail=0.26):
    """栏杆段（局部坐标）：底座 + 瓶式栏杆柱（方截面收腰）+ 扶手，可斜（楼梯）。"""
    z1 = z0 if z1 is None else z1
    (x0, y0), (x1, y1) = p0, p1
    ln = math.hypot(x1 - x0, y1 - y0)
    if ln < 0.3:
        return
    n = max(1, int(ln / pitch))
    tx, ty = (x1 - x0) / ln, (y1 - y0) / ln
    nx, ny = -ty, tx

    def quad_bar(za0, za1, hw, th):   # 沿段方向的长条（底座 / 扶手），允许斜
        c = [(x0 + nx * s_ * hw, y0 + ny * s_ * hw) for s_ in (-1, 1)] + [(x1 + nx * s_ * hw, y1 + ny * s_ * hw) for s_ in (1, -1)]
        zs = [za0, za0, za1, za1]
        vb = [bm.verts.new((c[i][0], c[i][1], zs[i])) for i in range(4)]
        vt = [bm.verts.new((c[i][0], c[i][1], zs[i] + th)) for i in range(4)]
        bm.faces.new(vb[::-1]); bm.faces.new(vt)
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new([vb[i], vb[j], vt[j], vt[i]])
    quad_bar(z0, z1, rail / 2 + 0.03, 0.22)
    quad_bar(z0 + h - 0.16, z1 + h - 0.16, rail / 2 + 0.04, 0.16)
    for k in range(n + 1):
        f = k / n
        x, y, z = x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f
        if k in (0, n):
            _box(bm, x - 0.2, y - 0.2, z, x + 0.2, y + 0.2, z + h + 0.1)      # 端墩
            continue
        _box(bm, x - 0.06, y - 0.06, z + 0.22, x + 0.06, y + 0.06, z + h - 0.16)
        _box(bm, x - 0.1, y - 0.1, z + 0.3, x + 0.1, y + 0.1, z + 0.55)        # 瓶身鼓出


def balustrade_rect(bm, w, d, z, inset=0.1, h=1.0):
    W, D = w / 2 - inset, d / 2 - inset
    c = [(-W, -D), (W, -D), (W, D), (-W, D)]
    for i in range(4):
        baluster_run(bm, c[i], c[(i + 1) % 4], z, h=h)


def rustication(bm, w, d, zbase, top):
    """首层横向凹缝石（rusticated base）+ 转角隅石：做成外凸的石条，缝就是条与条之间的阴影。"""
    course = 0.62
    z = max(zbase, -0.6)
    k = 0
    while z + course <= top + 0.01:
        for face in ('x-', 'x+', 'y-', 'y+'):
            L_ = d if face[0] == 'x' else w
            half_o = (w if face[0] == 'x' else d) / 2
            sg = -1 if face[1] == '-' else 1
            a, b = -L_ / 2 - 0.1, L_ / 2 + 0.1
            if face[0] == 'x':
                _box(bm, sg * half_o - 0.1 * (sg < 0), a, z + 0.05, sg * half_o + 0.1 * (sg > 0), b, z + course - 0.05)
            else:
                _box(bm, a, sg * half_o - 0.1 * (sg < 0), z + 0.05, b, sg * half_o + 0.1 * (sg > 0), z + course - 0.05)
        z += course
        k += 1


def quoins(bm, w, d, z0, z1):
    """转角隅石：长短交替的外凸石块。"""
    z, k, hh = z0, 0, 0.55
    while z + hh <= z1:
        a = 1.3 if k % 2 == 0 else 0.8
        for sx in (-1, 1):
            for sy in (-1, 1):
                x, y = sx * w / 2, sy * d / 2
                _box(bm, min(x, x - sx * a), y - 0.09 if sy < 0 else y - 0.02, z + 0.04, max(x, x - sx * a), y + 0.02 if sy < 0 else y + 0.09, z + hh - 0.04)
                _box(bm, x - 0.09 if sx < 0 else x - 0.02, min(y, y - sy * a), z + 0.04, x + 0.02 if sx < 0 else x + 0.09, max(y, y - sy * a), z + hh - 0.04)
        z += hh
        k += 1


def colonnade(col, spec, face='-y', depth=3.6, h=None, name=None):
    """首层外廊：一排圆柱 + 额枋 + 平屋面露台 + 栏杆（翼楼正面的柱廊）。"""
    M = mats()
    bid, cx, cy, w, d, fl, rot_deg, *_r = spec
    rot = math.radians(rot_deg)
    z0, _ = site_z(cx, cy, w, d, rot)
    h = h or FH
    bm = bmesh.new()
    L_ = w if face in ('-y', '+y') else d
    off = (d if face in ('-y', '+y') else w) / 2
    sg = -1 if face[0] == '-' else 1

    def P(u, o):
        return (u, sg * o) if face in ('-y', '+y') else (sg * o, u)
    n = max(2, int(L_ / 3.2))
    for i in range(n + 1):
        u = -L_ / 2 + 0.6 + i * (L_ - 1.2) / n
        x, y = P(u, off + depth - 0.5)
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.34, radius2=0.29, depth=h - 1.0,
                              matrix=Matrix.Translation((x, y, 0.45 + (h - 1.0) / 2)))
        _box(bm, x - 0.45, y - 0.45, 0, x + 0.45, y + 0.45, 0.45)
        _box(bm, x - 0.45, y - 0.45, h - 0.55, x + 0.45, y + 0.45, h - 0.35)
    a, b = P(-L_ / 2, off), P(L_ / 2, off + depth)
    _box(bm, min(a[0], b[0]), min(a[1], b[1]), -1.0, max(a[0], b[0]), max(a[1], b[1]), 0.12)        # 台基
    _box(bm, min(a[0], b[0]) - 0.2, min(a[1], b[1]) - 0.2, h - 0.35, max(a[0], b[0]) + 0.2, max(a[1], b[1]) + 0.2, h + 0.35)   # 额枋 + 屋面
    p0, p1 = P(-L_ / 2 + 0.2, off + depth), P(L_ / 2 - 0.2, off + depth)
    baluster_run(bm, p0, p1, h + 0.35, h=0.95)
    for uu in (-L_ / 2 + 0.2, L_ / 2 - 0.2):
        baluster_run(bm, P(uu, off), P(uu, off + depth), h + 0.35, h=0.95)
    _obj(name or f'{bid}_colonnade', bm, M['plain'], (cx, cy, z0), rot, None, col)
    bm = bmesh.new()   # 廊下阴影面
    a, b = P(-L_ / 2, off - 0.05), P(L_ / 2, off + 0.05)
    _box(bm, min(a[0], b[0]), min(a[1], b[1]), 0.12, max(a[0], b[0]), max(a[1], b[1]), h - 0.35)
    _obj((name or f'{bid}_colonnade') + '_shade', bm, M['dark'], (cx, cy, z0), rot, None, col)


def site_z(cx, cy, w, d, rot):
    pts = [(0, 0)] + [rot2(sx * w / 2, sy * d / 2, rot) for sx in (-1, 1) for sy in (-1, 1)]
    zs = [L.ground_z(cx + px, cy + py) for px, py in pts]
    return max(zs[0], np.percentile(zs, 70)), min(zs)


# ---------------------------------------------------------------- 单栋
def building(spec, col, r):
    bid, cx, cy, w, d, floors, rot_deg, roof, mk = spec
    M = mats()
    rot = math.radians(rot_deg)
    z0, zmin = site_z(cx, cy, w, d, rot)
    fh = FH if bid not in ('v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10') else 3.8
    if mk == 'grey':
        fh = 4.0
    ht = floors * fh
    wall_m = M[mk]
    plain_m = M['grey_plain'] if mk == 'grey' else M['plain']
    roof_m = M['slate'] if mk == 'grey' else M[ROOF_OVR.get(bid, 'terra')]
    obs = []
    if roof == 'tower':
        bm = bmesh.new()
        _box(bm, -w / 2, -d / 2, zmin - z0 - 1.5, w / 2, d / 2, ht - fh)
        obs.append(_obj(f'{bid}_body', bm, wall_m, (cx, cy, z0), rot, dict(bay=3.0, fh=fh, top=ht - fh), col))
        bm = bmesh.new()   # 顶层敞廊：四角墩 + 内缩暗面
        p = 1.1
        for sx in (-1, 1):
            for sy in (-1, 1):
                _box(bm, sx * w / 2 - (p if sx > 0 else 0), sy * d / 2 - (p if sy > 0 else 0), ht - fh,
                     sx * w / 2 + (p if sx < 0 else 0), sy * d / 2 + (p if sy < 0 else 0), ht)
        for f in (-1 / 6, 1 / 6):   # 每面两根中柱 → 三开间敞廊
            for sx in (-1, 1):
                _box(bm, w * f - 0.3, sx * d / 2 - 0.3, ht - fh, w * f + 0.3, sx * d / 2 + 0.3, ht)
                _box(bm, sx * w / 2 - 0.3, d * f - 0.3, ht - fh, sx * w / 2 + 0.3, d * f + 0.3, ht)
        _box(bm, -w / 2 - 0.3, -d / 2 - 0.3, ht - fh - 0.4, w / 2 + 0.3, d / 2 + 0.3, ht - fh)   # 腰线
        _box(bm, -w / 2, -d / 2, ht - fh, w / 2, d / 2, ht - fh + 1.0)                            # 敞廊栏板
        _box(bm, -w / 2 - 0.4, -d / 2 - 0.4, ht, w / 2 + 0.4, d / 2 + 0.4, ht + 0.5)
        obs.append(_obj(f'{bid}_loggia', bm, plain_m, (cx, cy, z0), rot, None, col))
        bm = bmesh.new()
        _box(bm, -w / 2 + 1.2, -d / 2 + 1.2, ht - fh, w / 2 - 1.2, d / 2 - 1.2, ht)
        obs.append(_obj(f'{bid}_recess', bm, M['dark'], (cx, cy, z0), rot, None, col))
        bm = bmesh.new()
        _hip(bm, w, d, ht + 0.5, 0.75, 1.0)
        obs.append(_obj(f'{bid}_roof', bm, roof_m, (cx, cy, z0), rot, None, col))
        return obs, z0
    bm = bmesh.new()
    _box(bm, -w / 2, -d / 2, zmin - z0 - 1.5, w / 2, d / 2, ht)
    arched = mk == 'white' and bid in ARCHED
    obs.append(_obj(f'{bid}_body', bm, wall_m, (cx, cy, z0), rot, dict(bay=3.4 if mk != 'grey' else 3.0, fh=fh, top=ht, wz0=fh if arched else 0.4), col))
    bm = bmesh.new()
    bmg = bmesh.new()
    bms = bmesh.new()
    _facade_detail(bm, w, d, ht, fh, 3.4 if mk != 'grey' else 3.0, zmin - z0 - 1.5, bmg, arched, bms)
    obs.append(_obj(f'{bid}_glass', bmg, M['shutter'] if mk != 'grey' else M['glass'], (cx, cy, z0), rot, None, col))
    obs.append(_obj(f'{bid}_steel', bms, M['steel'], (cx, cy, z0), rot, None, col))
    if roof != 'gable':
        # r3 檐口：三道叠涩（檐下线脚 → 齿饰带 → 挑檐板），比 r2 的一块板更像石作
        _box(bm, -w / 2 - 0.25, -d / 2 - 0.25, ht - 0.9, w / 2 + 0.25, d / 2 + 0.25, ht - 0.6)
        _box(bm, -w / 2 - 0.45, -d / 2 - 0.45, ht - 0.6, w / 2 + 0.45, d / 2 + 0.45, ht - 0.35)
        _box(bm, -w / 2 - 0.75, -d / 2 - 0.75, ht - 0.35, w / 2 + 0.75, d / 2 + 0.75, ht)
        if mk != 'grey':
            rustication(bm, w, d, zmin - z0 - 1.5, min(fh, ht) - 0.1)
            quoins(bm, w, d, min(fh, ht), ht - 0.9)
        if roof in ('hip', 'hip_low', 'flat') and not bid.startswith('svc'):
            balustrade_rect(bm, w + 1.2, d + 1.2, ht, 0.2, 1.05)   # 屋顶女儿墙栏杆
    else:
        _box(bm, -w / 2 - 0.2, -d / 2 - 0.2, 0, w / 2 + 0.2, d / 2 + 0.2, 0.5)            # 勒脚
    rise = 0
    bm_roof = bmesh.new()
    bm_lead, bm_sky = bmesh.new(), bmesh.new()
    ridge_pts = []
    if roof == 'hip':
        rise = _hip(bm_roof, w - 1.0, d - 1.0, ht + 0.3, 0.5, 0.0)   # 栏杆后的低坡石板顶
        ridge_pts = roof_details(bm_roof, bm, bm_lead, bm_sky, w - 1.0, d - 1.0, ht + 0.3, 0.5, r,
                                 dormers=bid not in ('v1',) and min(w, d) > 10, skylights=bid in ('hall', 'n_link', 'e_wing_a', 'w_wing_a', 'spa'))
    elif roof == 'hip_low':   # Breakers：低坡四坡顶 + 屋顶栏杆
        rise = _hip(bm_roof, w - 2.4, d - 2.4, ht + 0.4, 0.42, 0.0)
        ridge_pts = roof_details(bm_roof, bm, bm_lead, bm_sky, w - 2.4, d - 2.4, ht + 0.4, 0.42, r, dormers=True)
    elif roof == 'barrel':   # r4b 机库：弧形金属顶（沿长边）
        n = 16
        R = d / 2 + 0.3
        for i in range(n):
            a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
            v = [bm_roof.verts.new((x, R * math.cos(a), ht + R * 0.55 * math.sin(a))) for x in (-w / 2 - 0.4, w / 2 + 0.4) for a in (a0, a1)]
            bm_roof.faces.new([v[0], v[1], v[3], v[2]])
            for k in range(1, 8):
                x = -w / 2 + w * k / 8
                pass
        for k in range(9):   # 肋
            x = -w / 2 + w * k / 8
            for i in range(n):
                a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
                _bar(bm_lead, (x, R * math.cos(a0), ht + 0.08 + R * 0.55 * math.sin(a0)), (x, R * math.cos(a1), ht + 0.08 + R * 0.55 * math.sin(a1)), 0.25, 0.15)
    elif roof == 'glass':    # r4b 温室：白框玻璃双坡
        v = [bm_roof.verts.new(p) for p in [(-w / 2, -d / 2, ht), (w / 2, -d / 2, ht), (w / 2, 0, ht + d * 0.35), (-w / 2, 0, ht + d * 0.35), (w / 2, d / 2, ht), (-w / 2, d / 2, ht)]]
        bm_roof.faces.new([v[0], v[1], v[2], v[3]]); bm_roof.faces.new([v[3], v[2], v[4], v[5]])
        for k in range(int(w / 1.2) + 1):
            x = -w / 2 + k * 1.2
            _bar(bm_lead, (x, -d / 2, ht), (x, 0, ht + d * 0.35), 0.12, 0.1)
            _bar(bm_lead, (x, 0, ht + d * 0.35), (x, d / 2, ht), 0.12, 0.1)
    elif roof == 'flat':
        _box(bm_roof, -w / 2 + 0.3, -d / 2 + 0.3, ht - 0.1, -w / 2 + w * 0.45, d / 2 - 0.3, ht + 3.0)   # 屋顶小亭
    elif roof == 'gable':
        bm_w2 = bmesh.new()
        rise = _gable(bm_roof, bm_w2, w, d, ht, 1.05, 0.5)
        obs.append(_obj(f'{bid}_gables', bm_w2, plain_m, (cx, cy, z0), rot, None, col))
    obs.append(_obj(f'{bid}_trim', bm, plain_m, (cx, cy, z0), rot, None, col))
    obs.append(_obj(f'{bid}_lead', bm_lead, M['lead'], (cx, cy, z0), rot, None, col))
    obs.append(_obj(f'{bid}_sky', bm_sky, M['shutter'], (cx, cy, z0), rot, None, col))
    if roof == 'flat':
        obs.append(_obj(f'{bid}_roofbox', bm_roof, plain_m, (cx, cy, z0), rot, None, col))
    elif roof == 'barrel':
        obs.append(_obj(f'{bid}_roof', bm_roof, M['metal'], (cx, cy, z0), rot, None, col))
    elif roof == 'glass':
        obs.append(_obj(f'{bid}_roof', bm_roof, M['greenglass'], (cx, cy, z0), rot, None, col))
    else:
        obs.append(_obj(f'{bid}_roof', bm_roof, roof_m, (cx, cy, z0), rot, None, col))
    # 烟囱
    if roof in ('hip', 'hip_low', 'gable') and max(w, d) > 11:
        bm = bmesh.new()
        n = {'hip': 2, 'hip_low': 6, 'gable': 4}[roof] + (1 if max(w, d) > 28 else 0)
        for i in range(n):
            if roof == 'hip_low':
                px = (-1 if i % 2 else 1) * (w / 2 - 5 - (i // 2) * 9)
                py = (-1 if i % 3 else 1) * (d / 2 - 4)
            elif ridge_pts and roof == 'hip':
                rp = ridge_pts[i % len(ridge_pts)]
                px, py = rp[0] + (0 if i < len(ridge_pts) else r.uniform(-1, 1) * 2), rp[1]
            else:
                px = r.uniform(-0.4, 0.4) * w
                py = r.uniform(-0.3, 0.3) * d
            hh = ht + rise * 0.8 + (4.5 if roof == 'gable' else 2.2)
            _box(bm, px - 0.7, py - 0.5, ht - 1, px + 0.7, py + 0.5, hh)
            _box(bm, px - 0.9, py - 0.7, hh, px + 0.9, py + 0.7, hh + 0.4)
        obs.append(_obj(f'{bid}_chimneys', bm, plain_m, (cx, cy, z0), rot, None, col))
    return obs, z0


def portico(col):
    """主楼正门门廊：6 根科林斯式大柱（简化为带柱础柱头的圆柱）+ 额枋 + 三角山花，朝 −y。"""
    M = mats()
    spec = [b for b in L.MAIN if b[0] == 'porch'][0]
    _, cx, cy, w, d, *_r = spec
    z0, _zmin = site_z(cx, cy, w, d, 0)
    H = 9.0
    y0, y1 = cy - d / 2, cy + d / 2
    bm = bmesh.new()
    _box(bm, cx - w / 2 - 1, y0 - 2.5, z0 - 1.5, cx + w / 2 + 1, y1, z0 + 0.6)          # 基座
    for k in range(4):                                                                   # 台阶
        _box(bm, cx - 5, y0 - 2.5 - (k + 1) * 0.5, z0 - 1.5, cx + 5, y0 - 2.5 - k * 0.5, z0 + 0.6 - (k + 1) * 0.15)
    for i in range(6):
        x = cx - w / 2 + 1 + i * (w - 2) / 5
        for yy in (y0 + 0.9, y0 + 4.2):
            bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.62, radius2=0.52, depth=H - 1.2,
                                  matrix=Matrix.Translation((x, yy, z0 + 0.6 + (H - 1.2) / 2 + 0.3)))
            _box(bm, x - 0.8, yy - 0.8, z0 + 0.6, x + 0.8, yy + 0.8, z0 + 0.95)               # 柱础
            _box(bm, x - 0.8, yy - 0.8, z0 + H - 0.4, x + 0.8, yy + 0.8, z0 + H)              # 柱头
    _box(bm, cx - w / 2, y0, z0 + H, cx + w / 2, y1, z0 + H + 1.4)                          # 额枋
    _box(bm, cx - w / 2 - 0.4, y0 - 0.4, z0 + H + 1.4, cx + w / 2 + 0.4, y1, z0 + H + 1.8)  # 檐口
    zt = z0 + H + 1.8
    a = [bm.verts.new(v) for v in [(cx - w / 2 - 0.4, y0 - 0.4, zt), (cx + w / 2 + 0.4, y0 - 0.4, zt), (cx, y0 - 0.4, zt + 3.4)]]
    bm.faces.new(a)                                                                       # 山花
    bm_to_obj(bm, 'portico', col, M['plain'])
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in [(cx - w / 2 - 0.8, y0 - 0.8, zt - 0.1), (cx + w / 2 + 0.8, y0 - 0.8, zt - 0.1), (cx, y0 - 0.8, zt + 3.5),
                                    (cx - w / 2 - 0.8, y1 + 1, zt - 0.1), (cx + w / 2 + 0.8, y1 + 1, zt - 0.1), (cx, y1 + 1, zt + 3.5)]]
    bm.faces.new([v[0], v[3], v[5], v[2]])
    bm.faces.new([v[1], v[2], v[5], v[4]])
    bm_to_obj(bm, 'portico_roof', col, M['terra'])
    bm = bmesh.new()   # 门廊后的深色门洞
    _box(bm, cx - 2.2, y1 - 0.05, z0 + 0.6, cx + 2.2, y1 + 0.05, z0 + 5.5)
    bm_to_obj(bm, 'portico_door', col, M['shutter'])


def dome(col):
    """大厅上方的鼓座 + 穹顶 + 灯亭（设定：大厅穹顶挂以太水晶吊灯）。"""
    M = mats()
    spec = [b for b in L.MAIN if b[0] == 'hall'][0]
    _, cx, cy, w, d, fl, *_r = spec
    z0, _ = site_z(cx, cy, w, d, 0)
    zb = z0 + fl * FH + 3.0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=6.2, radius2=6.2, depth=4.5, matrix=Matrix.Translation((cx, cy + 2, zb + 2.25)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=6.7, radius2=6.7, depth=0.6, matrix=Matrix.Translation((cx, cy + 2, zb + 4.8)))
    for k in range(12):
        a = 2 * math.pi * k / 12
        _box(bm, cx + 6.25 * math.cos(a) - 0.3, cy + 2 + 6.25 * math.sin(a) - 0.3, zb, cx + 6.25 * math.cos(a) + 0.3, cy + 2 + 6.25 * math.sin(a) + 0.3, zb + 4.5)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=1.1, radius2=1.1, depth=2.0, matrix=Matrix.Translation((cx, cy + 2, zb + 10.2)))
    bm_to_obj(bm, 'dome_drum', col, M['plain'])
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=16, radius=6.2, matrix=Matrix.Translation((cx, cy + 2, zb + 5.1)) @ Matrix.Diagonal((1, 1, 0.85, 1)))
    bm_to_obj(bm, 'dome_shell', col, M['slate'])
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.5, matrix=Matrix.Translation((cx, cy + 2, zb + 11.6)))
    bm_to_obj(bm, 'dome_finial', col, M['gold'])


def arc_colonnade(col):
    """半圆回廊（海湖庄园），院内草坪。内侧一层拱廊（柱 + 暗面），外侧带窗。"""
    M = mats()
    cx, cy = L.ARC['c']
    R, dp = L.ARC['R'], L.ARC['depth']
    a0, a1 = map(math.radians, (L.ARC['a0'], L.ARC['a1']))
    ht = L.ARC['floors'] * FH
    z0 = L.PLATEAU_Z
    n = 48
    angs = np.linspace(a0, a1, n + 1)
    ri, ro = R - dp / 2, R + dp / 2

    def ring(bm, rad, z):
        return [bm.verts.new((cx + rad * math.cos(a), cy + rad * math.sin(a), z)) for a in angs]
    # 墙体
    bm = bmesh.new()
    lo_o, hi_o = ring(bm, ro, z0 - 1), ring(bm, ro, z0 + ht)
    lo_i, hi_i = ring(bm, ri + 2.2, z0 - 1), ring(bm, ri + 2.2, z0 + ht)
    for i in range(n):
        bm.faces.new([lo_o[i], lo_o[i + 1], hi_o[i + 1], hi_o[i]])
        bm.faces.new([lo_i[i + 1], lo_i[i], hi_i[i], hi_i[i + 1]])
    for L1, L2 in ((lo_o, lo_i), (hi_o, hi_i)):
        for idx in (0, n):
            pass
    bm.faces.new([lo_o[0], hi_o[0], hi_i[0], lo_i[0]])
    bm.faces.new([lo_o[n], lo_i[n], hi_i[n], hi_o[n]])
    ob = bm_to_obj(bm, 'arc_body', col, M['white'])
    ob['bay'], ob['fh'], ob['top'] = 3.2, FH, z0 + ht
    # 廊下暗面 + 柱列 + 二层楼板
    bm = bmesh.new()
    for i in range(0, n + 1, 1):
        a = angs[i]
        px, py = cx + (ri + 0.4) * math.cos(a), cy + (ri + 0.4) * math.sin(a)
        _box(bm, px - 0.35, py - 0.35, z0, px + 0.35, py + 0.35, z0 + FH)
    lo, hi = ring(bm, ri, z0 + FH), ring(bm, ri + 2.2, z0 + FH)
    for i in range(n):
        bm.faces.new([lo[i], lo[i + 1], hi[i + 1], hi[i]])
    lo2, hi2 = ring(bm, ri, z0 + ht), ring(bm, ri, z0 + FH)
    for i in range(n):
        bm.faces.new([lo2[i], lo2[i + 1], hi2[i + 1], hi2[i]])
    bm_to_obj(bm, 'arc_columns', col, M['plain'])
    # 屋面：圆环形双坡
    bm = bmesh.new()
    ov = 0.8
    e_o, e_i = ring(bm, ro + ov, z0 + ht), ring(bm, ri - ov, z0 + ht)
    rid = ring(bm, R, z0 + ht + dp / 2 * 0.5)
    for i in range(n):
        bm.faces.new([e_o[i + 1], e_o[i], rid[i], rid[i + 1]])
        bm.faces.new([e_i[i], e_i[i + 1], rid[i + 1], rid[i]])
    bm.faces.new([e_o[0], e_i[0], rid[0]])
    bm.faces.new([e_i[n], e_o[n], rid[n]])
    bm_to_obj(bm, 'arc_roof', col, M['terra'])
    # 条纹遮阳篷（海湖庄园招牌），挂在回廊内侧中段
    bm = bmesh.new()
    for i in range(14, 34):
        a, b = angs[i], angs[i + 1]
        p = [(ri - 0.1, z0 + FH + 0.2), (ri - 2.6, z0 + FH - 0.9)]
        v = [bm.verts.new((cx + rr * math.cos(aa), cy + rr * math.sin(aa), zz)) for aa in (a, b) for rr, zz in p]
        bm.faces.new([v[0], v[2], v[3], v[1]])
    ob = bm_to_obj(bm, 'arc_awning', col, M['awning'])


def sweep(name, pts, profile, mat, col, closed=False):
    """沿 3D 折线扫掠截面。profile: [(横向, 竖向)]。"""
    bm = bmesh.new()
    rings = []
    P = [Vector(p) for p in pts]
    for i, p in enumerate(P):
        a = P[max(i - 1, 0)]
        b = P[min(i + 1, len(P) - 1)]
        t = (b - a)
        t.z = 0
        t.normalize()
        nrm = Vector((-t.y, t.x, 0))
        rings.append([bm.verts.new(p + nrm * u + Vector((0, 0, v))) for u, v in profile])
    m = len(profile)
    for i in range(len(rings) - 1):
        for j in range(m - (0 if closed else 1)):
            j2 = (j + 1) % m
            bm.faces.new([rings[i][j], rings[i + 1][j], rings[i + 1][j2], rings[i][j2]])
    return bm_to_obj(bm, name, col, mat)


def _resample(pts, step):
    out = []
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.dist(a, b) / step))
        for k in range(n):
            t = k / n
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    out.append(pts[-1])
    return out


def walkway(i, pts, col):
    """有顶连廊（Nekajui）：柱 + 红瓦双坡顶，跟地形逐段升降。"""
    M = mats()
    s = _resample(pts, 1.5)
    z = np.array([L.ground_z(x, y) for x, y in s])
    k = np.ones(5) / 5
    zs = np.convolve(np.pad(z, 2, mode='edge'), k, 'valid')
    zs = np.maximum(zs, z)
    base = [(x, y, zz) for (x, y), zz in zip(s, zs)]
    sweep(f'walk{i}_roof', [(x, y, zz + 3.4) for x, y, zz in base],
          [(-2.0, -0.1), (-2.0, 0.0), (0, 0.7), (2.0, 0.0), (2.0, -0.1)], M['slate'], col)
    sweep(f'walk{i}_floor', [(x, y, zz + 0.15) for x, y, zz in base],
          [(-1.6, -1.2), (-1.6, 0.0), (1.6, 0.0), (1.6, -1.2)], M['plain'], col)
    bm = bmesh.new()
    acc = 0
    for j in range(len(base)):
        if j % 2:
            continue
        x, y, zz = base[j]
        a = base[max(j - 1, 0)]
        b = base[min(j + 1, len(base) - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, ty) or 1
        nx, ny = -ty / ln, tx / ln
        for sgn in (-1, 1):
            px, py = x + nx * 1.7 * sgn, y + ny * 1.7 * sgn
            _box(bm, px - 0.16, py - 0.16, zz - 1.0, px + 0.16, py + 0.16, zz + 3.4)
    bm_to_obj(bm, f'walk{i}_posts', col, M['plain'])


def balustrade_path(name, pts, z, col, h=1.05, closed=False):
    M = mats()
    s = _resample(pts + ([pts[0]] if closed else []), 2.0)
    zz = z if not callable(z) else None
    sweep(name, [(x, y, (zz if zz is not None else z(x, y))) for x, y in s],
          [(-0.22, -0.3), (-0.22, h), (0.22, h), (0.22, -0.3)], M['plain'], col)


def retaining_wall(name, pts, z, c, col):
    """台地挡土墙：真实砌石墙面（从台面到外侧地面以下 1 m）+ 外挑压顶。"""
    M = mats()
    s = _resample(pts, 2.0)
    bm = bmesh.new()
    top, bot, off = [], [], []
    for x, y in s:
        dx, dy = x - c[0], y - c[1]
        ln = math.hypot(dx, dy) or 1
        ox, oy = x + dx / ln * 1.8, y + dy / ln * 1.8     # 台地坡脚在轮廓外 0–1.6 m，墙面放在坡外把它挡住
        off.append((x + dx / ln * 0.95, y + dy / ln * 0.95))
        zb = min(L.ground_z(x + dx / ln * 4, y + dy / ln * 4), z - 0.5) - 1.0
        top.append(bm.verts.new((ox, oy, z + 0.02)))
        bot.append(bm.verts.new((ox, oy, zb)))
    for i in range(len(s) - 1):
        bm.faces.new([bot[i], bot[i + 1], top[i + 1], top[i]])
    bm_to_obj(bm, name, col, M['ashlar'])   # r3：挡土墙也用石灰岩琢石砌
    sweep(name + '_coping', [(x, y, z + 0.05) for x, y in off], [(-1.2, -0.35), (-1.2, 0.0), (1.2, 0.0), (1.2, -0.35)], M['plain'], col)


def pad_outline(p, n=160, filt=None):
    cx, cy = p['c']
    rot = p.get('rot', 0.0)
    out = []
    if p['kind'] == 'ellipse':
        rx, ry = p['r']
        for k in range(n + 1):
            a = 2 * math.pi * k / n
            x, y = rot2(rx * math.cos(a), ry * math.sin(a), rot)
            out.append((cx + x, cy + y))
    else:
        w, d = p['s']
        r = p.get('r', 4.0)
        pts = []
        for (qx, qy, a0) in [(w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)]:
            for k in range(7):
                a = math.radians(a0 + 15 * k)
                pts.append((qx + r * math.cos(a), qy + r * math.sin(a)))
        pts.append(pts[0])
        for x, y in pts:
            x2, y2 = rot2(x, y, rot)
            out.append((cx + x2, cy + y2))
    if filt:
        segs, cur = [], []
        for q in out:
            if filt(*q):
                cur.append(q)
            elif cur:
                segs.append(cur)
                cur = []
        if cur:
            segs.append(cur)
        return segs
    return [out]


def balustrades(col):
    for p in L.PADS:
        if p['edge'] not in ('stone', 'mixed') or p['id'] == 'club':
            continue
        z = p['zv'] if not isinstance(p['zv'], tuple) else p['zv'][1]
        base = lambda x, y: True
        if p['id'] == 'plateau':
            base = lambda x, y: y < 24
        elif p['id'] == 'terrace':
            base = lambda x, y: y < -66 and not (abs(x) < 8 and y > -70)
        # 只在台地真实存在处立栏杆（岛缘附近台地被淡出，栏杆会悬空）
        filt = lambda x, y, b=base, zz=z: b(x, y) and float(L.edge_dist(x, y)) > 8 and abs(L.ground_z(x, y) - zz) < 2.5
        for k, seg in enumerate(pad_outline(p, filt=filt)):
            if len(seg) > 1:
                balustrade_path(f'bal_{p["id"]}_{k}', seg, z - 0.1, col)
                retaining_wall(f'wall_{p["id"]}_{k}', seg, z, p['c'], col)


def grand_stairs(col):
    """前庭台地 → 主楼台地的大台阶（中轴，宽 14 m，中段平台）。"""
    M = mats()
    bm = bmesh.new()
    y_top, z_top, z_bot = -68.0, L.PLATEAU_Z, L.TERRACE_Z
    steps = 22
    run = 0.75
    for k in range(steps):
        zt = z_top - (k + 1) * (z_top - z_bot) / steps
        y1 = y_top - k * run
        _box(bm, -7, y1 - run, z_bot - 0.5, 7, y1 + 1.0, zt + (z_top - z_bot) / steps)
    for sx in (-1, 1):   # 两侧颊墙
        _box(bm, sx * 7 - 0.6 * (sx < 0), y_top - steps * run, z_bot - 0.5, sx * 7 + 0.6 * (sx > 0), y_top + 1, z_top + 1.0)
    bm_to_obj(bm, 'grand_stairs', col, M['plain'])


def fountain(col):
    M = mats()
    fx, fy = L.FOUNTAIN
    z = L.TERRACE_Z
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=9.5, radius2=9.5, depth=0.9,
                          matrix=Matrix.Translation((fx, fy, z + 0.45)))
    for rad, hz, dz in ((3.2, 1.4, 1.4), (1.8, 0.35, 3.0), (0.6, 3.4, 2.2), (1.1, 0.25, 4.3), (0.35, 1.3, 4.9)):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=rad, radius2=rad * 0.9, depth=hz,
                              matrix=Matrix.Translation((fx, fy, z + dz)))
    bm_to_obj(bm, 'fountain_stone', col, M['plain'])
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=9.0, matrix=Matrix.Translation((fx, fy, z + 0.8)))
    bm_to_obj(bm, 'fountain_water', col, M['pool'])
    # 喷泉周围的环形花坛（低矮花境，不做刺绣花坛网格）


def dock(col):
    """访客停靠平台：伸出岛缘的圆台，铜栏 + 金色引导环 + 小候机亭。"""
    M = mats()
    cx, cy, z = 0.0, -268.0, 8.5
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=72, radius1=20, radius2=20, depth=1.4, matrix=Matrix.Translation((cx, cy, z - 0.7)))
    bm_to_obj(bm, 'dock_deck', col, M['wallstone'])
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=72, radius1=19.5, radius2=4, depth=22, matrix=Matrix.Translation((cx, cy, z - 12.4)))
    ob = bm_to_obj(bm, 'dock_rockbase', col, M['rock'])
    tx = bpy.data.textures.new('e2_dock_rock', 'CLOUDS'); tx.noise_scale = 3.0
    ob.modifiers.new('sub', 'SUBSURF').levels = 2
    dm = ob.modifiers.new('disp', 'DISPLACE'); dm.texture = tx; dm.strength = 2.5
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=3.2, radius2=3.2, depth=4.2, matrix=Matrix.Translation((cx, cy + 12, z + 2.1)))
    bm_to_obj(bm, 'dock_stone', col, M['plain'])
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=3.6, matrix=Matrix.Translation((cx, cy + 12, z + 4.2)) @ Matrix.Diagonal((1, 1, 0.6, 1)))
    bm_to_obj(bm, 'dock_dome', col, M['bronze'])
    ring = [(cx + 19.6 * math.cos(a), cy + 19.6 * math.sin(a)) for a in np.linspace(math.radians(200), math.radians(340 + 360 * 0), 60)]
    ring = [(cx + 19.6 * math.cos(a), cy + 19.6 * math.sin(a)) for a in np.linspace(math.radians(-200), math.radians(20), 70)]
    sweep('dock_rail', [(x, y, z) for x, y in ring], [(-0.08, 0), (-0.08, 1.1), (0.08, 1.1), (0.08, 0)], M['bronze'], col)
    g = [(cx + 13 * math.cos(a), cy + 13 * math.sin(a), z + 0.02) for a in np.linspace(0, 2 * math.pi, 97)]
    sweep('dock_guide', g, [(-0.35, 0), (0.35, 0)], M['gold'], col)


def funicular(col):
    M = mats()
    (x0, y0), (x1, y1) = L.FUNICULAR
    z0 = L.PLATEAU_Z + 0.3
    z1 = L.WATER_Z + 1.5
    n = 30
    pts = [(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t) for t in np.linspace(0, 1, n)]
    sweep('funi_track', pts, [(-1.4, -0.6), (-1.4, 0.1), (1.4, 0.1), (1.4, -0.6)], M['plain'], col)
    bm = bmesh.new()
    for k in range(3, n - 2, 4):
        x, y, z = pts[k]
        g = L.ground_z(x, y)
        if z - g > 1.5:
            _box(bm, x - 0.5, y - 0.5, g - 1, x + 0.5, y + 0.5, z - 0.6)
    bm_to_obj(bm, 'funi_piers', col, M['plain'])
    # 缆车厢（半程）
    t = 0.42
    cxx, cyy, czz = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t
    bm = bmesh.new()
    _box(bm, -1.3, -3.2, 0.1, 1.3, 3.2, 3.0)
    ang = math.atan2(y1 - y0, x1 - x0) - math.pi / 2
    ob = bm_to_obj(bm, 'funi_car', col, M['glass'])
    ob.location = (cxx, cyy, czz)
    ob.rotation_euler.z = ang
    bm = bmesh.new()
    _box(bm, -1.45, -3.35, 3.0, 1.45, 3.35, 3.35)
    ob = bm_to_obj(bm, 'funi_car_roof', col, M['plain'])
    ob.location = (cxx, cyy, czz)
    ob.rotation_euler.z = ang


def rope_bridge(col):
    M = mats()
    (x0, y0), (x1, y1) = L.ROPE_BRIDGE
    z0, z1 = L.ground_z(x0, y0) + 0.5, L.ground_z(x1, y1) + 0.5
    pts = []
    for t in np.linspace(0, 1, 40):
        sag = 3.5 * 4 * t * (1 - t)
        pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t - sag))
    sweep('bridge_deck', pts, [(-0.9, -0.1), (-0.9, 0.05), (0.9, 0.05), (0.9, -0.1)], M['wood'], col)
    sweep('bridge_rope_l', [(x, y, z + 1.1) for x, y, z in pts], [(-0.95, 0), (-0.95, 0.08), (-0.87, 0.08)], M['wood'], col)
    sweep('bridge_rope_r', [(x, y, z + 1.1) for x, y, z in pts], [(0.95, 0), (0.95, 0.08), (0.87, 0.08)], M['wood'], col)


def treehouse(i, x, y, rot_deg, col):
    M = mats()
    g = L.ground_z(x, y)
    zp = g + 8.0
    rot = math.radians(rot_deg)
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            _box(bm, sx * 2.6 - 0.2, sy * 2.6 - 0.2, -9.5, sx * 2.6 + 0.2, sy * 2.6 + 0.2, 0)
    _box(bm, -4.2, -4.2, -0.3, 4.2, 4.2, 0)       # 平台
    _box(bm, -2.6, -2.6, 0, 2.6, 2.6, 3.0)        # 木屋
    _obj(f'tree_house{i}', bm, M['wood'], (x, y, zp), rot, None, col)
    bm = bmesh.new()
    _hip(bm, 5.2, 5.2, 3.0, 0.9, 0.8)
    _obj(f'tree_house{i}_roof', bm, M['slate'], (x, y, zp), rot, None, col)


def plunge_pool(name, cx, cy, rot_deg, z, col, w=4.0, d=9.0):
    M = mats()
    bm = bmesh.new()
    _box(bm, -w / 2 - 1.2, -d / 2 - 1.2, -1.0, w / 2 + 1.2, d / 2 + 1.2, 0.12)
    _obj(f'{name}_deck', bm, M['plain'], (cx, cy, z), math.radians(rot_deg), None, col)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, matrix=Matrix.Diagonal((w, d, 1, 1)))
    _obj(f'{name}_water', bm, M['pool'], (cx, cy, z + 0.14), math.radians(rot_deg), None, col)


def awning(name, spec, z0, face, col, frac=0.6):
    """在建筑某面（'-y' / '+y' / '-x' / '+x'）一层窗上挂条纹遮阳篷。"""
    M = mats()
    bid, cx, cy, w, d, *_r = spec
    rot = math.radians(spec[6])
    bm = bmesh.new()
    half = (w if face in ('-y', '+y') else d) * frac / 2
    off = (d if face in ('-y', '+y') else w) / 2
    sgn = -1 if face[0] == '-' else 1
    pts = []
    for u in (-half, half):
        for o, z in ((off + 0.05, 3.9), (off + 2.8, 2.9)):
            if face in ('-y', '+y'):
                pts.append((u, sgn * o, z))
            else:
                pts.append((sgn * o, u, z))
    v = [bm.verts.new(p) for p in pts]
    bm.faces.new([v[0], v[1], v[3], v[2]])
    _obj(name, bm, M['awning'], (cx, cy, z0), rot, None, col)


def rotunda(col):
    """湖心亭：湖心小岛上的 8 柱圆亭（台基 + 柱 + 檐 + 铅灰穹顶）。"""
    M = mats()
    x, y, r = L.ISLET
    z = L.ground_z(x, y)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=4.4, radius2=4.4, depth=0.8, matrix=Matrix.Translation((x, y, z + 0.4)))
    for k in range(8):
        a = 2 * math.pi * k / 8
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.26, radius2=0.22, depth=4.2,
                              matrix=Matrix.Translation((x + 3.6 * math.cos(a), y + 3.6 * math.sin(a), z + 2.9)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=4.3, radius2=4.3, depth=0.7, matrix=Matrix.Translation((x, y, z + 5.35)))
    bm_to_obj(bm, 'rotunda_stone', col, M['plain'])
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=12, radius=4.2, matrix=Matrix.Translation((x, y, z + 5.7)) @ Matrix.Diagonal((1, 1, 0.55, 1)))
    bm_to_obj(bm, 'rotunda_dome', col, M['slate'])


def build_all():
    col = coll('buildings')
    r = rng(5)
    zmap = {}
    for spec in L.all_buildings():
        if spec[7] == 'sketch':
            continue
        if spec[0] == 'porch':
            zmap['porch'] = site_z(*spec[1:5], 0)[0]
            continue
        _, z0 = building(spec, col, r)
        zmap[spec[0]] = z0
    arc_colonnade(col)
    rotunda(col)
    portico(col)
    dome(col)
    for i, pts in enumerate(L.WALKWAYS):
        walkway(i, pts, col)
    balustrades(col)
    from . import gardens
    gardens.build(col)
    dock(col)
    funicular(col)
    rope_bridge(col)
    for i, (x, y, a) in enumerate(L.TREEHOUSES):
        treehouse(i, x, y, a, col)
    specs = {s[0]: s for s in L.all_buildings()}
    for bid, face in (('club', '+y'), ('spa', '-y')):
        awning(f'awn_{bid}', specs[bid], zmap[bid], face, col)
    for bid, face in (('e_wing_a', '-y'), ('w_wing_a', '-y'), ('e_wing_b', '+x'), ('w_wing_b', '-x'), ('breakers', '-y')):
        colonnade(col, specs[bid], face, 3.6 if bid != 'breakers' else 4.5, FH if bid != 'breakers' else 5.0)
    for bid, dx, dy in (('breakers', 0, -30),):
        s = specs[bid]
        x, y = rot2(dx, dy, math.radians(s[6]))
        if bid == 'breakers':
            plunge_pool('pool_breakers', s[1] + x, s[2] + y, s[6], zmap[bid] + 0.05, col, 8, 22)
        else:
            plunge_pool(f'pool_{bid}', s[1] + x, s[2] + y, s[6] + 90, zmap[bid] + 0.05, col)
    return col
