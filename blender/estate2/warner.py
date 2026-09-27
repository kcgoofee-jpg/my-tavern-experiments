"""r4d Greystone 客舍：Tudor 式小屋（参考前 Harry Warner 庄园的客舍气质，全部自建）+ 岩洞泳池 + 锦鲤池 + 卵石院。

半木构（奶油灰泥 + 深色木框 + 斜撑）、陡坡石板顶多个交叉山墙、成簇高砖烟囱、菱格铅条窗、拱形石门、墙上爬藤 / 玫瑰。
"""
import math
import numpy as np
import bpy, bmesh
from mathutils import Matrix, Vector
from . import layout as L
from .common import mat_new, bm_to_obj
from .buildings import mats, _box, _gable, _bar

C = L.COTTAGE   # (x, y, 旋转°)


def _tudor_mat():
    m, t = mat_new('e2_tudor')
    if t is None:
        return m
    tc = t.new('ShaderNodeTexCoord', (-1600, 0))
    sep = t.new('ShaderNodeSeparateXYZ', (-1400, 0)); t.link(tc.outputs['Object'], sep.inputs[0])
    X, Y, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    u = t.math('ADD', X, Y)
    post = t.math('LESS_THAN', t.math('FRACT', t.math('DIVIDE', u, 0.95)), 0.16)              # 立柱
    rail = t.math('LESS_THAN', t.math('FRACT', t.math('DIVIDE', t.math('SUBTRACT', Z, 0.2), 1.5)), 0.1)   # 横梁
    diag = t.math('LESS_THAN', t.math('ABSOLUTE', t.math('SUBTRACT', t.math('FRACT', t.math('DIVIDE', t.math('ADD', u, Z), 2.85)), 0.5)), 0.03)  # 斜撑
    timber = t.math('MAXIMUM', t.math('MAXIMUM', post, rail), t.math('MULTIPLY', diag, t.math('GREATER_THAN', Z, 3.2)))
    stone = t.math('LESS_THAN', Z, 1.0)
    nz = t.new('ShaderNodeTexNoise', (-1200, -300), **{'Scale': 2.5, 'Detail': 6.0})
    t.link(tc.outputs['Object'], nz.inputs['Vector'])
    plaster = t.mix(t.math('MULTIPLY', nz.outputs['Fac'], 0.3), (0.86, 0.8, 0.66), (0.7, 0.64, 0.5), loc=(-600, 200))
    col = t.mix(timber, plaster, (0.09, 0.06, 0.04), loc=(-400, 200))
    col = t.mix(stone, col, (0.45, 0.43, 0.4), loc=(-300, 200))
    b = t.bsdf((200, 0), Roughness=0.8)
    t.link(col, b.inputs['Base Color'])
    return m


def _plain(name, rgb, rough=0.6):
    m, t = mat_new(name)
    if t is not None:
        t.bsdf((200, 0), Roughness=rough, **{'Base Color': (*rgb, 1)})
    return m


def _cobble():
    m, t = mat_new('e2_cobble')
    if t is None:
        return m
    tc = t.new('ShaderNodeTexCoord', (-900, 0))
    vo = t.new('ShaderNodeTexVoronoi', (-700, 0), **{'Scale': 3.2})
    vo.feature = 'DISTANCE_TO_EDGE'
    t.link(tc.outputs['Object'], vo.inputs['Vector'])
    joint = t.math('LESS_THAN', vo.outputs['Distance'], 0.06)
    col = t.mix(joint, (0.55, 0.5, 0.44), (0.22, 0.2, 0.18), loc=(-300, 0))
    b = t.bsdf((200, 0), Roughness=0.8)
    t.link(col, b.inputs['Base Color'])
    return m


def _xf(bm, M):
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)


def build(col):
    M = mats()
    tud, brick = _tudor_mat(), _plain('e2_brick_red', (0.24, 0.1, 0.06), 0.85)
    cx, cy, rd = C
    rot = math.radians(rd)
    z0 = L.ground_z(cx, cy)
    R = Matrix.Translation((cx, cy, z0)) @ Matrix.Rotation(rot, 4, 'Z')
    # 体量：主屋 15 × 7（1.5 层）+ 前后两个交叉山墙翼
    blocks = [((0, 0), 15, 7, 5.2, 1.15), ((-4, -4.5), 5, 5, 5.6, 1.3), ((4.5, 3.8), 5.5, 6, 4.4, 1.2)]
    bw, br = bmesh.new(), bmesh.new()
    for (ox, oy), w, d, h, pitch in blocks:
        a, b_ = bmesh.new(), bmesh.new()
        _box(a, -w / 2, -d / 2, -1.2, w / 2, d / 2, h)
        _gable(b_, a, w if (ox, oy) == (0, 0) else min(w, d) - 0.01, d if (ox, oy) == (0, 0) else max(w, d), h, pitch, 0.5)
        for bb in (a, b_):
            _xf(bb, Matrix.Translation((ox, oy, 0)))
        me = bpy.data.meshes.new('tmp'); a.to_mesh(me); a.free(); bw.from_mesh(me)
        me2 = bpy.data.meshes.new('tmp2'); b_.to_mesh(me2); b_.free(); br.from_mesh(me2)
    for bb in (bw, br):
        _xf(bb, R)
    bm_to_obj(bw, 'cottage_walls', col, tud)
    bm_to_obj(br, 'cottage_roof', col, M['slate'])
    # 成簇砖烟囱（3 根八角烟道）
    bc = bmesh.new()
    for (px, py) in ((-6.2, 0.6), (5.8, -0.4)):
        _box(bc, px - 0.9, py - 0.6, 0, px + 0.9, py + 0.6, 9.0)
        for k in range(3):
            bmesh.ops.create_cone(bc, cap_ends=True, segments=8, radius1=0.26, radius2=0.26, depth=2.4, matrix=Matrix.Translation((px - 0.55 + k * 0.55, py, 10.2)))
            bmesh.ops.create_cone(bc, cap_ends=True, segments=8, radius1=0.34, radius2=0.34, depth=0.25, matrix=Matrix.Translation((px - 0.55 + k * 0.55, py, 11.4)))
    _xf(bc, R); bm_to_obj(bc, 'cottage_chimneys', col, brick)
    # 菱格铅条窗（深色玻璃 + 细铅条交叉）+ 拱形石门
    bg, bl, bs = bmesh.new(), bmesh.new(), bmesh.new()
    for x in (-5.5, -1.5, 2.0, 5.5):
        for zc in (1.9, 4.2):
            y = -3.52
            _box(bg, x - 0.55, y - 0.02, zc - 0.6, x + 0.55, y + 0.02, zc + 0.6)
            for s in np.linspace(-0.55, 0.55, 5):
                _bar(bl, (x + s - 0.6, y - 0.05, zc - 0.6), (x + s + 0.6, y - 0.05, zc + 0.6), 0.03, 0.03)
                _bar(bl, (x + s + 0.6, y - 0.05, zc - 0.6), (x + s - 0.6, y - 0.05, zc + 0.6), 0.03, 0.03)
            _box(bs, x - 0.7, y - 0.15, zc - 0.75, x + 0.7, y + 0.05, zc - 0.6)
    ex, ey = -4.0, -7.02
    _box(bs, ex - 1.3, ey - 0.35, 0, ex + 1.3, ey + 0.15, 2.3)
    for k in range(10):   # 拱券
        a0, a1 = math.pi * k / 10, math.pi * (k + 1) / 10
        _bar(bs, (ex + 1.1 * math.cos(a0), ey - 0.25, 2.3 + 0.9 * math.sin(a0)), (ex + 1.1 * math.cos(a1), ey - 0.25, 2.3 + 0.9 * math.sin(a1)), 0.4, 0.45)
    _box(bg, ex - 0.7, ey - 0.4, 0, ex + 0.7, ey - 0.3, 2.4)
    for bb, m, n in ((bg, M['shutter'], 'cottage_glass'), (bl, M['lead'], 'cottage_leads'), (bs, M['plain'], 'cottage_stone')):
        _xf(bb, R); bm_to_obj(bb, n, col, m)
    # 爬藤 / 玫瑰：墙脚与墙面的不规则叶团
    rs = np.random.RandomState(3)
    bi = bmesh.new()
    for k in range(38):
        side = rs.choice([-3.55, 3.55]); x = rs.uniform(-7.2, 7.2); zc = rs.uniform(0.3, 3.8)
        bmesh.ops.create_icosphere(bi, subdivisions=1, radius=rs.uniform(0.35, 0.7), matrix=Matrix.Translation((x, side, zc)) @ Matrix.Diagonal((1.3, 0.45, 1.0, 1)))
    _xf(bi, R); bm_to_obj(bi, 'cottage_ivy', col, M['hedge'])
    bf = bmesh.new()
    for k in range(40):
        x = rs.uniform(-7.2, 7.2)
        bmesh.ops.create_icosphere(bf, subdivisions=1, radius=0.12, matrix=Matrix.Translation((x, -3.75, rs.uniform(0.4, 3.0))))
    _xf(bf, R); bm_to_obj(bf, 'cottage_roses', col, _plain('e2_rose', (0.75, 0.18, 0.3), 0.6))
    # 卵石院（门前 20 × 12 m）
    bcb = bmesh.new(); _box(bcb, -11, -20, -1.0, 11, -8, 0.08); _xf(bcb, R); bm_to_obj(bcb, 'cottage_court', col, _cobble())
    # 岩洞泳池：不规则池 + 置换的岩石围 + 小瀑布
    px, py = 16.0, 2.0
    n = 40
    th = np.linspace(0, 2 * math.pi, n, endpoint=False)
    rr = 5.5 + 1.3 * np.sin(2 * th + 0.5) + 0.6 * np.sin(5 * th)
    bw2 = bmesh.new()
    vs = [bw2.verts.new((px + r * math.cos(a) * 1.3, py + r * math.sin(a), 0.1)) for a, r in zip(th, rr)]
    bw2.faces.new(vs); _xf(bw2, R); bm_to_obj(bw2, 'grotto_water', col, M['pool'])
    brk = bmesh.new()
    for a, r in zip(th, rr):
        for k in range(2):
            s = rs.uniform(0.6, 1.3) * (2.2 if (a > 1.0 and a < 2.2) else 1.0)
            bmesh.ops.create_icosphere(brk, subdivisions=2, radius=s, matrix=Matrix.Translation((px + (r + 0.6 + k * 0.8) * math.cos(a) * 1.3, py + (r + 0.6 + k * 0.8) * math.sin(a), 0.2 + s * 0.4)) @ Matrix.Diagonal((1.2, 1.0, 0.8, 1)))
    _xf(brk, R)
    ob = bm_to_obj(brk, 'grotto_rocks', col, M['rock'])
    tx = bpy.data.textures.new('e2_grotto', 'CLOUDS'); tx.noise_scale = 0.6
    dm = ob.modifiers.new('d', 'DISPLACE'); dm.texture = tx; dm.strength = 0.35
    bsp = bmesh.new()   # 小瀑布
    a = 1.6; r = 5.5 + 1.3 * math.sin(2 * a + 0.5) + 0.6 * math.sin(5 * a)
    fx, fy = px + r * math.cos(a) * 1.3, py + r * math.sin(a)
    v = [bsp.verts.new(p) for p in [(fx - 0.9, fy + 0.4, 3.2), (fx + 0.9, fy + 0.4, 3.2), (fx + 0.9, fy - 0.6, 0.1), (fx - 0.9, fy - 0.6, 0.1)]]
    bsp.faces.new(v); _xf(bsp, R); bm_to_obj(bsp, 'grotto_fall', col, M['spray'])
    # 锦鲤池：卵形浅池 + 石边 + 小喷泉 + 橙白锦鲤
    kx, ky = -15.0, 5.0
    bk, be, bf2 = bmesh.new(), bmesh.new(), bmesh.new()
    bmesh.ops.create_circle(bk, cap_ends=True, segments=48, radius=1.0, matrix=Matrix.Translation((kx, ky, 0.3)) @ Matrix.Diagonal((6.5, 4.2, 1, 1)))
    bmesh.ops.create_cone(be, cap_ends=True, segments=48, radius1=1.0, radius2=1.0, depth=0.8, matrix=Matrix.Translation((kx, ky, -0.2)) @ Matrix.Diagonal((7.2, 4.9, 1, 1)))
    bmesh.ops.create_cone(be, cap_ends=True, segments=16, radius1=0.6, radius2=0.35, depth=1.0, matrix=Matrix.Translation((kx, ky, 0.5)))
    bmesh.ops.create_cone(be, cap_ends=True, segments=24, radius1=0.9, radius2=0.7, depth=0.15, matrix=Matrix.Translation((kx, ky, 1.05)))
    for k in range(14):
        a = rs.uniform(0, 2 * math.pi); r = rs.uniform(1.5, 3.6)
        x, y = kx + r * math.cos(a) * 1.4, ky + r * math.sin(a) * 0.9
        h = rs.uniform(0, math.pi)
        bmesh.ops.create_icosphere(bf2, subdivisions=1, radius=0.22, matrix=Matrix.Translation((x, y, 0.28)) @ Matrix.Rotation(h, 4, 'Z') @ Matrix.Diagonal((2.2, 0.8, 0.3, 1)))
    for bb in (bk, be, bf2):
        _xf(bb, R)
    km = mats()['pool']
    kd, t = mat_new('e2_koi_water')
    if t is not None:
        t.bsdf((200, 0), Roughness=0.03, **{'Base Color': (0.03, 0.08, 0.06, 1)})
    bm_to_obj(bk, 'koi_water', col, kd)
    bm_to_obj(be, 'koi_stone', col, M['plain'])
    bm_to_obj(bf2, 'koi_fish', col, _plain('e2_koi', (0.9, 0.35, 0.05), 0.4))
    bj = bmesh.new()
    bmesh.ops.create_cone(bj, cap_ends=True, segments=12, radius1=0.12, radius2=0.35, depth=1.2, matrix=Matrix.Translation((kx, ky, 1.7)))
    _xf(bj, R); bm_to_obj(bj, 'koi_jet', col, M['spray'])
    return col
