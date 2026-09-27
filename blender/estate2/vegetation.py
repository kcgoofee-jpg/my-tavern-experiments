"""植被：Poly Haven 扫描树 / 灌木（CC0，glTF 1k，fetch_assets.py 下载）+ 几何节点散布。

不做程序化球形树。原型只加载一次，林冠用实例（Instance on Points），所以几千株也只占原型的内存。
布局来自 layout.py：林地连续覆盖（Nekajui：只露屋顶），主台地 / 前庭 / 大道只放孤植与行道树。
"""
import math, os
import numpy as np
import bpy
from . import layout as L
from .common import DATA, coll

MODELS = os.path.join(DATA, 'models')
# (Poly Haven id, 目标高度 m, 林地权重, 园林权重)
PROTOS = [
    ('island_tree_01', 15.0, 0.34, 0.0),
    ('island_tree_02', 13.0, 0.34, 0.25),
    ('island_tree_03', 19.0, 0.16, 0.55),
    ('searsia_burchellii', 7.0, 0.16, 0.2),
]
SHRUB = ('searsia_burchellii', 3.2)   # searsia_lucida 的叶片没有透明通道，渲染成白色卡片，弃用


def _import_proto(aid, height, protos_coll, i):
    path = os.path.join(MODELS, aid, f'{aid}_1k.gltf')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    for o in new:   # 先把层级烘进网格
        o.select_set(False)
    bpy.context.view_layer.update()
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.data = o.data.copy() if o.data.users > 1 else o.data
        o.data.transform(mw)
        o.matrix_world.identity()
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = f'p{i}_{aid}'
    co = np.empty(len(ob.data.vertices) * 3, np.float32)
    ob.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    lo, hi = co.min(0), co.max(0)
    s = height / max(hi[2] - lo[2], 1e-3)
    co[:, 0] = (co[:, 0] - (lo[0] + hi[0]) / 2) * s
    co[:, 1] = (co[:, 1] - (lo[1] + hi[1]) / 2) * s
    co[:, 2] = (co[:, 2] - lo[2]) * s - (1.4 if height > 5 else 0.3)   # 埋进地面（坡地上根盘不外露）
    ob.data.vertices.foreach_set('co', co.ravel())
    ob.data.update()
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    protos_coll.objects.link(ob)
    _vary_leaves(ob)
    return ob


def _vary_leaves(ob):
    """每株实例随机色相 / 明度（Object Info Random 对实例也各不相同），打破林冠一片同色。"""
    for slot in ob.material_slots:
        m = slot.material
        if not m or not m.use_nodes or m.get('e2_varied'):
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf or not bsdf.inputs['Base Color'].is_linked:
            continue
        src = bsdf.inputs['Base Color'].links[0].from_socket
        oi = nt.nodes.new('ShaderNodeObjectInfo')
        hs = nt.nodes.new('ShaderNodeHueSaturation')
        mh = nt.nodes.new('ShaderNodeMath'); mh.operation = 'MULTIPLY_ADD'
        mh.inputs[1].default_value = 0.07; mh.inputs[2].default_value = 0.465
        mv = nt.nodes.new('ShaderNodeMath'); mv.operation = 'MULTIPLY_ADD'
        mv.inputs[1].default_value = 0.5; mv.inputs[2].default_value = 0.95
        nt.links.new(oi.outputs['Random'], mh.inputs[0]); nt.links.new(oi.outputs['Random'], mv.inputs[0])
        nt.links.new(mh.outputs[0], hs.inputs['Hue']); nt.links.new(mv.outputs[0], hs.inputs['Value'])
        hs.inputs['Saturation'].default_value = 1.15
        nt.links.new(src, hs.inputs['Color']); nt.links.new(hs.outputs[0], bsdf.inputs['Base Color'])
        m['e2_varied'] = 1


def _scatter_node_group(protos):
    ng = bpy.data.node_groups.new('e2_scatter_' + protos.name, 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, Lk = ng.nodes, ng.links
    gi = N.new('NodeGroupInput')
    go = N.new('NodeGroupOutput')
    ci = N.new('GeometryNodeCollectionInfo')
    ci.inputs['Separate Children'].default_value = True
    ci.inputs['Reset Children'].default_value = True
    ci.transform_space = 'ORIGINAL'
    iop = N.new('GeometryNodeInstanceOnPoints')
    iop.inputs['Pick Instance'].default_value = True

    def named(name, dtype):
        n = N.new('GeometryNodeInputNamedAttribute')
        n.data_type = dtype
        n.inputs['Name'].default_value = name
        return n.outputs['Attribute']
    e2r = N.new('FunctionNodeEulerToRotation')
    Lk.new(named('rot', 'FLOAT_VECTOR'), e2r.inputs[0])
    Lk.new(gi.outputs['Geometry'], iop.inputs['Points'])
    ci.inputs['Collection'].default_value = protos
    Lk.new(ci.outputs[0], iop.inputs['Instance'])
    Lk.new(named('idx', 'INT'), iop.inputs['Instance Index'])
    Lk.new(e2r.outputs[0], iop.inputs['Rotation'])
    Lk.new(named('scl', 'FLOAT_VECTOR'), iop.inputs['Scale'])
    Lk.new(iop.outputs['Instances'], go.inputs['Geometry'])
    return ng


def _points_obj(name, P, idx, rot, scl, protos, col):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(P))
    me.vertices.foreach_set('co', P.astype(np.float32).ravel())
    for k, v, t in (('idx', idx, 'INT'), ('rot', rot, 'FLOAT_VECTOR'), ('scl', scl, 'FLOAT_VECTOR')):
        a = me.attributes.new(k, t, 'POINT')
        a.data.foreach_set('value' if t == 'INT' else 'vector', v.astype(np.int32 if t == 'INT' else np.float32).ravel())
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    md = ob.modifiers.new('scatter', 'NODES')
    md.node_group = bpy.data.node_groups.get('e2_scatter_' + protos.name) or _scatter_node_group(protos)
    return ob


def _poisson(step, rs, box=(-350, 350, -270, 270)):
    xs = np.arange(box[0], box[1], step)
    ys = np.arange(box[2], box[3], step * 0.866)
    X, Y = np.meshgrid(xs, ys)
    X = X + (np.arange(len(ys))[:, None] % 2) * step / 2
    X = X + rs.uniform(-0.42, 0.42, X.shape) * step
    Y = Y + rs.uniform(-0.42, 0.42, Y.shape) * step
    return X.ravel(), Y.ravel()


# r4 树种（用户：树太多且雷同 → 减 50–60%，≥ 6 种各有分区）
# kind: (原型 Poly Haven id 或 'proc_*', 高度 m, 色调 (H 偏移, S 倍, V 倍), 混色 (rgb, 量), 缩放 xy/z)
KINDS = {
    'oak':     [('island_tree_01', 14.0, (0.49, 1.15, 1.0), ((0.06, 0.12, 0.05), 0.15), (1.0, 1.0)),     # 冬青栎：深、偏蓝绿，外坡林带
                ('island_tree_02', 12.0, (0.47, 1.1, 1.0), ((0.05, 0.11, 0.05), 0.2), (1.0, 1.0))],
    'pine':    [('island_tree_03', 15.0, (0.46, 0.7, 1.35), ((0.3, 0.36, 0.2), 0.4), (1.7, 0.7))],   # 伞松：宽平冠、灰绿，草坪孤植
    'olive':   [('searsia_burchellii', 6.0, (0.47, 0.35, 1.5), ((0.5, 0.55, 0.46), 0.55), (1.5, 1.0))],  # 橄榄：银灰绿，台地树阵
    'bloom':   [('island_tree_02', 10.0, (0.5, 1.0, 1.0), ((0.42, 0.3, 0.75), 0.8), (1.1, 0.9)),       # 蓝花楹
                ('island_tree_02', 9.0, (0.5, 1.0, 1.0), ((0.95, 0.9, 0.9), 0.75), (1.0, 0.9)),         # 白玉兰
                ('island_tree_01', 12.0, (0.5, 1.0, 1.0), ((0.62, 0.22, 0.07), 0.7), (1.0, 1.0))],       # 秋色（红叶山毛榉 / 枫）
    'cypress': [('proc_cypress', 14.0, None, None, (1.0, 1.0))],                                      # 意大利柏：柱状，大道与台地
    'palm':    [('proc_palm', 11.0, None, None, (1.3, 1.0))],                                         # 棕榈：别墅、湖边俱乐部、Breakers
}


def _ok_ground(X, Y, pad=4.0, allow_lawn=False):
    H, at = L.terrain(X, Y)
    ok = (L.edge_dist(X, Y) > 6) & (L.footprint_sd(X, Y, pad) > 0) & (at['gravel'] < 0.2) & (at['lake'] < 0.1) & (at['paved'] < 0.3) & (at['beds'] < 0.3)
    if not allow_lawn:
        ok &= (at['lawn'] < 0.3) & (at['padmask'] < 0.5)
    for pts in L.WALKWAYS:
        ok &= L.poly_dist(X, Y, pts) > 4
    for pts in L.FOOTPATHS:
        ok &= L.poly_dist(X, Y, pts) > 3
    return ok, H


def _pts(xy, rs, jit=0.0):
    a = np.array(xy, float).reshape(-1, 2)
    if jit:
        a = a + rs.uniform(-jit, jit, a.shape)
    return a[:, 0], a[:, 1]


def plan_points(seed=7, density=1.0):
    """返回 [(kind, X, Y, H, 原型序号, 缩放)]，纯 numpy，也给 plan2d 用。"""
    rs = np.random.RandomState(seed)
    out = []
    # 1) 外坡林带（冬青栎）：只在 wood_mask 内，间距 9 m
    X, Y = _poisson(9.0 / math.sqrt(density), rs)
    ok, H = _ok_ground(X, Y, 3.0)
    wm = L.wood_mask(X, Y)
    ok &= (wm > 0.5) & (rs.uniform(0, 1, X.shape) < 0.93)
    for b in L.VILLAS:
        ok &= np.hypot(X - b[1], Y - b[2]) > 20
    out.append(('oak', X[ok], Y[ok], H[ok], rs.randint(0, 2, ok.sum()), rs.uniform(0.8, 1.35, ok.sum())))
    # 2) 园中树团（5–9 株冬青栎 + 1 株伞松）
    clumps = [(-140, -115), (125, -80), (-120, 60), (115, 95), (-60, -180), (70, -175), (-235, 0), (205, 60), (-40, 205), (160, -10)]
    cx, cy, ck = [], [], []
    for (x0, y0) in clumps:
        n = rs.randint(5, 9)
        for k in range(n):
            a, r = rs.uniform(0, 2 * math.pi), rs.uniform(0, 14)
            cx.append(x0 + r * math.cos(a)); cy.append(y0 + r * math.sin(a)); ck.append(0)
    X, Y = np.array(cx), np.array(cy)
    ok, H = _ok_ground(X, Y, 3.0)
    out.append(('oak', X[ok], Y[ok], H[ok], rs.randint(0, 2, ok.sum()), rs.uniform(0.9, 1.3, ok.sum())))
    # 3) 伞松孤植：草甸 / 湖岸 / 主台地外
    spec = [(-95, -60), (95, -62), (-175, -30), (180, -60), (-60, 95), (85, 70), (-110, 125), (35, 175), (-5, 190), (-200, 40),
            (160, 110), (-120, -150), (120, -140), (-80, -230), (85, -225), (250, -40), (-270, -80), (-230, 125), (125, 185), (-150, 20)]
    X, Y = _pts(spec, rs, 3)
    ok, H = _ok_ground(X, Y, 6.0)
    out.append(('pine', X[ok], Y[ok], H[ok], np.zeros(ok.sum(), int), rs.uniform(1.25, 1.6, ok.sum())))
    # 4) 意大利柏：大道两侧行列、前庭台地四角、Greystone 与 Breakers 的引道
    cyp = []
    for y in np.arange(-248, -150, 8):
        cyp += [(-40.5, y), (40.5, y)]
    for sx in (-1, 1):
        for y in np.arange(-140, -70, 9):
            cyp.append((sx * 84, y))
        cyp += [(sx * 10, -60), (sx * 10, -66)]
    for t in np.linspace(0, 1, 9):
        cyp.append((-205 + 30 * t, -125 + 40 * t)); cyp.append((190 + 30 * t, -115 - 25 * t))
    X, Y = _pts(cyp, rs, 0.3)
    ok, H = _ok_ground(X, Y, 2.0, allow_lawn=True)
    out.append(('cypress', X[ok], Y[ok], H[ok], np.zeros(ok.sum(), int), rs.uniform(1.25, 1.4, ok.sum())))
    # 5) 橄榄树阵：大道外侧坡地（梅花形 10 m）+ 前庭台地东西两端
    ol = []
    for sx in (-1, 1):
        for i, y in enumerate(np.arange(-240, -150, 10)):
            for x in np.arange(52, 100, 10):
                ol.append((sx * (x + 5 * (i % 2)), y))
    X, Y = _pts(ol, rs, 0.6)
    ok, H = _ok_ground(X, Y, 3.0, allow_lawn=True)
    ok &= L.wood_mask(X, Y) < 0.5
    out.append(('olive', X[ok], Y[ok], H[ok], np.zeros(ok.sum(), int), rs.uniform(0.85, 1.15, ok.sum())))
    # 6) 开花树点缀：湖岸、主台地后侧、客房楼前
    bl = [(-80, 105), (50, 108), (-100, 170), (20, 190), (-45, 60), (45, 58), (108, -58), (-120, -60), (135, 40), (-150, -30),
          (-92, -128), (92, -128), (-20, 118), (100, 160), (-175, -40), (170, -40), (-60, 150), (75, 105), (-130, 95), (215, 150),
          (-255, 60), (260, -20), (-40, -150), (45, -150), (0, 160), (-210, -110), (150, -150), (-165, 150)]
    X, Y = _pts(bl, rs, 2)
    ok, H = _ok_ground(X, Y, 4.0, allow_lawn=True)
    out.append(('bloom', X[ok], Y[ok], H[ok], (np.arange(ok.sum()) % 3), rs.uniform(1.1, 1.45, ok.sum())))
    # 7) 棕榈：别墅泳池侧、湖边俱乐部、Breakers 草坪、回廊院
    pa = []
    for b in L.VILLAS:
        rot = math.radians(b[6])
        for u, v in ((-13, 14), (13, 15), (-15, -4), (15, -6), (0, 20)):
            pa.append((b[1] + u * math.cos(rot) - v * math.sin(rot), b[2] + u * math.sin(rot) + v * math.cos(rot)))
    for a in np.linspace(0, 2 * math.pi, 9, endpoint=False):
        pa.append((72 + 22 * math.cos(a), 134 + 15 * math.sin(a)))
    for a in np.linspace(-2.6, -0.4, 8):
        pa.append((236 + 58 * math.cos(a - 0.45), -152 + 38 * math.sin(a - 0.45)))
    for a in np.linspace(0.4, 2.7, 6):
        pa.append((0 + 18 * math.cos(a), 30 + 18 * math.sin(a)))
    X, Y = _pts(pa, rs, 1.5)
    ok, H = _ok_ground(X, Y, 1.5, allow_lawn=True)
    out.append(('palm', X[ok], Y[ok], H[ok], np.zeros(ok.sum(), int), rs.uniform(0.85, 1.2, ok.sum())))
    # 8) 林缘灌木：只在林带边缘
    X2, Y2 = _poisson(6.0, rs)
    ok2, H2 = _ok_ground(X2, Y2, 1.5)
    w2 = L.wood_mask(X2, Y2)
    ok2 &= (w2 > 0.2) & (w2 < 0.8) & (rs.uniform(0, 1, X2.shape) < 0.5)
    out.append(('shrub', X2[ok2], Y2[ok2], H2[ok2], np.zeros(ok2.sum(), int), rs.uniform(0.7, 1.4, ok2.sum())))
    return out


def flower_points(seed=13):
    """r3 开花灌木团（绣线菊式白花）：主台地前沿、露台外沿、花坛外圈、大道花境。返回 (X, Y, H, scale)。"""
    rs = np.random.RandomState(seed)
    xs, ys = [], []
    pl = [p for p in L.PADS if p['id'] == 'plateau'][0]
    for a in np.linspace(math.pi * 1.02, math.pi * 1.98, 170):   # 主台地南沿（墙内 3 m）
        x, y = pl['c'][0] + (pl['r'][0] - 3.2) * math.cos(a), pl['c'][1] + (pl['r'][1] - 3.2) * math.sin(a)
        if abs(x) > 36 and rs.uniform() < 0.8:
            xs.append(x); ys.append(y)
    for x in np.arange(17, 50, 1.3):                              # 东翼露台外沿
        xs += [x, x + 0.6]; ys += [-30.6, -31.6]
        xs += [-x, -x - 0.6]; ys += [-30.6, -31.6]
    for gid, _, kind, c, sz, rot in L.GARDENS:
        if gid in ('rose', 'rose_w'):
            for t in np.linspace(0, 1, 60):
                for (ax, ay, bx, by) in ((-1, -1, 1, -1), (1, -1, 1, 1), (1, 1, -1, 1), (-1, 1, -1, -1)):
                    x = c[0] + (sz[0] + 5.2) * (ax + (bx - ax) * t)
                    y = c[1] + (sz[1] + 5.2) * (ay + (by - ay) * t)
                    if rs.uniform() < 0.55:
                        xs.append(x); ys.append(y)
    for sx in (-1, 1):
        for y in np.arange(-244, -152, 2.6):
            xs.append(sx * 27.5 + rs.uniform(-0.6, 0.6)); ys.append(y)
    X, Y = np.array(xs, float), np.array(ys, float)
    X += rs.uniform(-0.5, 0.5, X.shape); Y += rs.uniform(-0.5, 0.5, Y.shape)
    ok = (L.footprint_sd(X, Y, 0.5) > 0) & (L.gravel_mask(X, Y) < 0.3)
    X, Y = X[ok], Y[ok]
    H, _ = L.terrain(X, Y)
    return X, Y, H, rs.uniform(0.3, 0.48, len(X))


def _flowering(src):
    """复制灌木原型，叶片里 45% 换成白色小花团（绣线菊 / 白色山茶的航拍观感）。"""
    ob = src.copy()
    ob.data = src.data.copy()
    ob.name = src.name + '_flower'
    for i, slot in enumerate(ob.material_slots):
        m = slot.material
        if not m or not m.use_nodes:
            continue
        m2 = m.copy(); m2.name = m.name + '_flower'
        nt = m2.node_tree
        b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b is None or not b.inputs['Base Color'].is_linked:
            continue
        src_sock = b.inputs['Base Color'].links[0].from_socket
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 6.0; nz.inputs['Detail'].default_value = 2.0
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 0.54; mr.inputs['From Max'].default_value = 0.56
        nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        nt.links.new(mr.outputs[0], mix.inputs[0])
        nt.links.new(src_sock, mix.inputs[6])
        mix.inputs[7].default_value = (1.0, 0.99, 0.95, 1)
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        ob.material_slots[i].material = m2
    return ob


def tropic_points(seed=11):
    """别墅周边的热带林下层（Nekajui 式浓密）：每 2.2 m 一株，半径 12–32 m 的环带。"""
    rs = np.random.RandomState(seed)
    X, Y = _poisson(3.2, rs)
    keep = np.zeros(X.shape, bool)
    for b in L.VILLAS:
        dd = np.hypot(X - b[1], Y - b[2])
        keep |= (dd > 13) & (dd < 26) & (rs.uniform(0, 1, X.shape) < np.clip((34 - dd) / 14, 0, 1))
    X, Y = X[keep], Y[keep]
    H, at = L.terrain(X, Y)
    ok = (L.edge_dist(X, Y) > 3) & (at['gravel'] < 0.3) & (at['lake'] < 0.2) & (L.footprint_sd(X, Y, 1.0) > 0)
    return X[ok], Y[ok], H[ok]


def _variant(src, name, hsv, mixc):
    ob = src.copy(); ob.data = src.data.copy(); ob.name = name
    for i, slot in enumerate(ob.material_slots):
        m = slot.material
        if not m or not m.use_nodes:
            continue
        m2 = m.copy(); m2.name = f'{m.name}_{name}'
        nt = m2.node_tree
        b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b is None or not b.inputs['Base Color'].is_linked:
            continue
        sock = b.inputs['Base Color'].links[0].from_socket
        hs = next((n for n in nt.nodes if n.type == 'HUE_SAT'), None)
        if hs is not None:   # _vary_leaves 已插的色相节点：改它的基准
            mh = hs.inputs['Hue'].links[0].from_node
            mh.inputs[2].default_value = hsv[0] - 0.035
            hs.inputs['Saturation'].default_value = hsv[1]
            vn = hs.inputs['Value'].links[0].from_node; vn.inputs[1].default_value = 0.2; vn.inputs[2].default_value = hsv[2] * 0.9
        if mixc:
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MIX'
            mix.inputs[0].default_value = mixc[1]
            nt.links.new(sock, mix.inputs[6]); mix.inputs[7].default_value = (*mixc[0], 1)
            # 保留叶片明暗：再乘回原图亮度
            ov = nt.nodes.new('ShaderNodeMix'); ov.data_type = 'RGBA'; ov.blend_type = 'SOFT_LIGHT'
            ov.inputs[0].default_value = 0.6
            nt.links.new(mix.outputs[2], ov.inputs[6]); nt.links.new(sock, ov.inputs[7])
            nt.links.new(ov.outputs[2], b.inputs['Base Color'])
        ob.material_slots[i].material = m2
    return ob


def _leaf_mat(name, c1, c2, rough=0.8):
    from .common import mat_new
    m, t = mat_new(name)
    if t is None:
        return m
    v, tc = t.coords('Object', 1.0)
    n = t.new('ShaderNodeTexNoise', (-900, -200), **{'Scale': 2.2, 'Detail': 8.0, 'Roughness': 0.75})
    t.link(v, n.inputs['Vector'])
    oi = t.new('ShaderNodeObjectInfo', (-900, 300))
    col = t.mix(n.outputs['Fac'], c1, c2, loc=(-500, 0))
    col = t.mix(t.math('MULTIPLY', oi.outputs['Random'], 0.35), col, (c1[0] * 0.7, c1[1] * 0.8, c1[2] * 0.7), loc=(-300, 0))
    bump = t.new('ShaderNodeBump', (-400, -300), Strength=0.9, Distance=0.15)
    t.link(n.outputs['Fac'], bump.inputs['Height'])
    b = t.bsdf((200, 0), Roughness=rough)
    t.link(col, b.inputs['Base Color']); t.link(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def _proc_cypress(h, coll_):
    """柱状意大利柏：纺锤形，表面置换出簇状叶团（不是球形树）。"""
    import bmesh
    from mathutils import Matrix, noise, Vector
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=24, radius=1.0)
    for v in bm.verts:
        z = v.co.z
        t = (z + 1) / 2                             # 0 底 → 1 顶
        prof = math.sin(math.pi * min(1, t * 1.15) ** 0.8) ** 0.7 * (1 - 0.25 * t)
        d = 1 + 0.28 * noise.noise(Vector((v.co.x * 3, v.co.y * 3, z * 9)))
        v.co.x *= 1.6 * prof * d; v.co.y *= 1.6 * prof * d
        v.co.z = t * h
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.2, radius2=0.15, depth=1.5, matrix=Matrix.Translation((0, 0, -0.5)))
    me = bpy.data.meshes.new('proc_cypress'); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(_leaf_mat('e2_cypress', (0.02, 0.05, 0.025), (0.05, 0.1, 0.04)))
    ob = bpy.data.objects.new('proc_cypress', me); coll_.objects.link(ob)
    return ob


def _proc_palm(h, coll_):
    """棕榈：微弯树干 + 16 片下垂羽状叶（叶轴两侧锯齿小叶，俯视成星形）。"""
    import bmesh
    from mathutils import Matrix
    bm = bmesh.new(); bl = bmesh.new()
    top = (0.6, 0.2, h)
    for k in range(10):
        t0, t1 = k / 10, (k + 1) / 10
        z = (t0 + t1) / 2 * h
        bmesh.ops.create_cone(bm, cap_ends=False, segments=8, radius1=0.24 - 0.06 * t0, radius2=0.24 - 0.06 * t1, depth=h / 10,
                              matrix=Matrix.Translation((0.6 * ((t0 + t1) / 2) ** 2, 0.2 * (t0 + t1) / 2, z)))
    for f in range(16):
        a = 2 * math.pi * f / 16 + (0.2 if f % 2 else 0)
        L_ = 4.2 + 0.6 * math.sin(f * 1.7)
        up = 0.5 if f % 2 else 0.2
        ca, sa = math.cos(a), math.sin(a)
        prev = None
        n = 12
        for i in range(n + 1):
            s = i / n
            r = L_ * s
            z = top[2] + up * L_ * s - 1.9 * L_ * s * s / 2.2
            w = 0.9 * math.sin(math.pi * min(1, s * 1.1)) * (1 - 0.4 * s)
            cx, cy = top[0] + r * ca, top[1] + r * sa
            px, py = -sa, ca
            row = [bl.verts.new((cx - px * w, cy - py * w, z - 0.25 * w)), bl.verts.new((cx, cy, z)), bl.verts.new((cx + px * w, cy + py * w, z - 0.25 * w))]
            if prev:
                bl.faces.new([prev[0], prev[1], row[1], row[0]])
                bl.faces.new([prev[1], prev[2], row[2], row[1]])
            prev = row
    me = bpy.data.meshes.new('proc_palm_trunk'); bm.to_mesh(me); bm.free()
    from . import buildings
    me.materials.append(buildings.mats()['wood'])
    ml = bpy.data.meshes.new('proc_palm_fronds'); bl.to_mesh(ml); bl.free()
    ml.materials.append(_leaf_mat('e2_palm', (0.1, 0.17, 0.04), (0.2, 0.28, 0.07), 0.6))
    # 羽状锯齿：叶面上用条纹透明 → 不用 alpha；改成暗条纹
    ob = bpy.data.objects.new('proc_palm', me); coll_.objects.link(ob)
    ob2 = bpy.data.objects.new('proc_palm_fr', ml); coll_.objects.link(ob2)
    for o in (ob, ob2):
        o.select_set(False)
    ctx = {'active_object': ob, 'selected_editable_objects': [ob, ob2], 'selected_objects': [ob, ob2]}
    with bpy.context.temp_override(**ctx):
        bpy.ops.object.join()
    return ob


def build(density=1.0, seed=7, tropic_protos=None):
    col = coll('vegetation')
    src = bpy.data.collections.new('e2_src_protos')
    bpy.context.scene.collection.children.link(src)
    cache = {}
    kcoll = {}
    for kind, variants in KINDS.items():
        kc = bpy.data.collections.new('e2_' + kind)
        bpy.context.scene.collection.children.link(kc)
        for vi, (aid, h, hsv, mixc, sc) in enumerate(variants):
            if aid == 'proc_cypress':
                ob = _proc_cypress(h, kc)
            elif aid == 'proc_palm':
                ob = _proc_palm(h, kc)
            else:
                key = (aid, h)
                if key not in cache:
                    cache[key] = _import_proto(aid, h, src, len(cache))
                ob = _variant(cache[key], f'{kind}{vi}', hsv, mixc)
                kc.objects.link(ob)
            ob.scale = (sc[0], sc[0], sc[1])
            bpy.context.view_layer.update()
            ob.data.transform(ob.matrix_basis); ob.matrix_basis.identity()
            ob.name = f'{kind}_{vi}'
        kcoll[kind] = kc
    shrubs = bpy.data.collections.new('e2_shrub_protos')
    bpy.context.scene.collection.children.link(shrubs)
    _import_proto('searsia_burchellii', 3.2, shrubs, 99)
    kcoll['shrub'] = shrubs
    for c in [src, shrubs] + list(kcoll.values()):
        lc = bpy.context.view_layer.layer_collection.children.get(c.name)
        if lc:
            lc.exclude = True
    rs = np.random.RandomState(seed + 1)
    n = 0
    counts = {}
    for kind, X, Y, H, idx, s in plan_points(seed, density):
        if not len(X):
            continue
        P = np.stack([X, Y, H], 1)
        rot = np.stack([rs.uniform(-0.04, 0.04, len(X)), rs.uniform(-0.04, 0.04, len(X)), rs.uniform(0, 2 * math.pi, len(X))], 1)
        scl = np.repeat(s[:, None], 3, 1)
        _points_obj(f'veg_{kind}_{n}', P, idx, rot, scl, kcoll[kind], col)
        n += len(X); counts[kind] = counts.get(kind, 0) + len(X)
    fl = bpy.data.collections.new('e2_flower_protos')
    bpy.context.scene.collection.children.link(fl)
    fl.objects.link(_flowering(shrubs.objects[0]))
    bpy.context.view_layer.layer_collection.children[fl.name].exclude = True
    X, Y, H, sc = flower_points()
    P = np.stack([X, Y, H + 0.1], 1)
    rot = np.stack([np.zeros(len(X)), np.zeros(len(X)), rs.uniform(0, 2 * math.pi, len(X))], 1)
    scl = np.stack([sc * 1.25, sc * 1.25, sc], 1)
    _points_obj('veg_flowers', P, np.zeros(len(X), int), rot, scl, fl, col)
    n += len(X)
    if tropic_protos is not None and len(tropic_protos.objects):
        X, Y, H = tropic_points()
        k = len(tropic_protos.objects)
        idx = rs.randint(0, k, len(X))
        P = np.stack([X, Y, H - 0.2], 1)
        rot = np.stack([np.zeros(len(X)), np.zeros(len(X)), rs.uniform(0, 2 * math.pi, len(X))], 1)
        scl = np.repeat(rs.uniform(0.8, 1.6, len(X))[:, None], 3, 1)
        _points_obj('veg_tropic', P, idx, rot, scl, tropic_protos, col)
        n += len(X)
    print(f'[vegetation] {n} 株实例 {counts}')
    return col
