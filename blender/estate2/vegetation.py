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


def plan_points(seed=7, density=1.0):
    """返回 [(类别, x, y, 原型序号, 缩放)]，纯 numpy，也给 plan2d 用。"""
    rs = np.random.RandomState(seed)
    X, Y = _poisson(7.5 / math.sqrt(density), rs)
    H, at = L.terrain(X, Y)
    e = L.edge_dist(X, Y)
    fp = L.footprint_sd(X, Y, 3.0)
    wk = np.full(X.shape, 1e9)
    for pts in L.WALKWAYS:
        wk = np.minimum(wk, L.poly_dist(X, Y, pts))
    open_ = (at['lawn'] > 0.3) | (at['gravel'] > 0.2) | (at['lake'] > 0.2) | (at['built'] > 0.3) | (at['padmask'] > 0.6)
    ok = (e > 5) & (fp > 0) & (wk > 3.5) & ~open_
    # 林中空地：稀疏一些，别墅 / 树屋周边留出视野
    thin = L.fbm(X, Y, 45, 2, 21)
    ok &= rs.uniform(0, 1, X.shape) < np.clip(0.78 + 0.5 * thin, 0.25, 1)
    ok &= rs.uniform(0, 1, X.shape) > at['meadow'] * 0.85        # 外坡草甸：只留零星树
    w = np.array([p[2] for p in PROTOS]); w = w / w.sum()
    forest_idx = rs.choice(len(PROTOS), size=X.shape, p=w)
    edge_band = (e < 30)
    forest_idx = np.where(edge_band & (rs.uniform(0, 1, X.shape) < 0.35), 3, forest_idx)
    out = [('forest', X[ok], Y[ok], H[ok], forest_idx[ok], rs.uniform(0.75, 1.25, ok.sum()))]
    # 林缘灌木：在树点之间补
    X2, Y2 = _poisson(5.0, rs)
    H2, at2 = L.terrain(X2, Y2)
    fp2 = L.footprint_sd(X2, Y2, 1.5)
    ok2 = (L.edge_dist(X2, Y2) > 3) & (fp2 > 0) & (at2['gravel'] < 0.2) & (at2['lake'] < 0.2) & (at2['lawn'] < 0.3) & (at2['paved'] < 0.3) & (rs.uniform(0, 1, X2.shape) < 0.3 + 0.6 * at2['tropic'] - 0.2 * at2['meadow'])
    out.append(('shrub', X2[ok2], Y2[ok2], H2[ok2], np.zeros(ok2.sum(), int), rs.uniform(0.7, 1.4, ok2.sum())))
    # 园林：大道行道树、前庭与主台地的孤植大树
    gx, gy = [], []
    for y in np.arange(-248, -150, 10):
        gx += [-22, 22]; gy += [y, y]
    for a in np.linspace(0, 2 * math.pi, 10, endpoint=False):
        gx.append(L.FOUNTAIN[0] + 42 * math.cos(a)); gy.append(L.FOUNTAIN[1] + 30 * math.sin(a))
    for x, y in [(-92, -10), (92, -10), (-100, 40), (98, 44), (-30, 70), (40, 66), (-70, -70), (70, -72), (0, 48)]:
        gx.append(x); gy.append(y)
    pl = [p for p in L.PADS if p['id'] == 'plateau'][0]
    for a in np.linspace(0, 2 * math.pi, 64, endpoint=False):   # 主台地外圈树团（海湖：建筑被植被包围）
        for rr in (0.9, 0.82):
            x, y = pl['c'][0] + pl['r'][0] * rr * math.cos(a), pl['c'][1] + pl['r'][1] * rr * math.sin(a)
            if abs(x) > 30 or y > 0:
                gx.append(x); gy.append(y)
    gx, gy = np.array(gx, float), np.array(gy, float)
    gx += rs.uniform(-1.5, 1.5, gx.shape); gy += rs.uniform(-1.5, 1.5, gy.shape)
    keep = (L.footprint_sd(gx, gy, 4.0) > 0) & (L.gravel_mask(gx, gy) < 0.3)
    for pts in L.WALKWAYS:
        keep &= L.poly_dist(gx, gy, pts) > 4
    gx, gy = gx[keep], gy[keep]
    gh, _ = L.terrain(gx, gy)
    w2 = np.array([p[3] for p in PROTOS]); w2 = w2 / w2.sum()
    out.append(('garden', gx, gy, gh, rs.choice(len(PROTOS), size=gx.shape, p=w2), rs.uniform(0.85, 1.15, gx.shape)))
    return out


def build(density=1.0, seed=7):
    col = coll('vegetation')
    protos = bpy.data.collections.new('e2_tree_protos')
    bpy.context.scene.collection.children.link(protos)
    for i, (aid, h, _, _) in enumerate(PROTOS):
        _import_proto(aid, h, protos, i)
    shrubs = bpy.data.collections.new('e2_shrub_protos')
    bpy.context.scene.collection.children.link(shrubs)
    _import_proto(SHRUB[0], SHRUB[1], shrubs, 0)
    for c in (protos, shrubs):   # 原型本身不渲染（只经实例出现）
        bpy.context.view_layer.layer_collection.children[c.name].exclude = True
    rs = np.random.RandomState(seed + 1)
    n = 0
    for kind, X, Y, H, idx, s in plan_points(seed, density):
        P = np.stack([X, Y, H], 1)
        rot = np.stack([rs.uniform(-0.05, 0.05, len(X)), rs.uniform(-0.05, 0.05, len(X)), rs.uniform(0, 2 * math.pi, len(X))], 1)
        scl = np.repeat(s[:, None], 3, 1)
        _points_obj(f'veg_{kind}', P, idx, rot, scl, shrubs if kind == 'shrub' else protos, col)
        n += len(X)
    print(f'[vegetation] {n} 株实例')
    return col
