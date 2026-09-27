"""r3：用户提供的 Sketchfab 模型（CC-BY 4.0，见 CREDITS.md）。模型文件在 gitignore 的 blender/data/estate2/sketchfab/，不入库。

- 林中别墅：Modern Coastal Hillside Villa（Visthétique），去掉自带的地形 / 树 / 石头 / 室内家具 / 保时捷，
  按 0.15 缩放到约 20 × 25 m，三种变体（原样 / 镜像 + 白石替换混凝土 / 深胡桃木 + 石灰华），以集合实例放 V1–V10。
- 车：Mercedes-Benz Maybach 2022（Mpgs Studios）、2017 Aston Martin DB11（Hari）。删掉车标 / 徽章 / 车牌，
  Maybach 原始 237 万面，减面到约 10%。
"""
import math, os
import numpy as np
import bpy
from mathutils import Vector, Matrix
from . import layout as L
from .common import DATA, coll

SF = os.path.join(DATA, 'sketchfab')
VILLA_SCALE = 0.15
VILLA_DROP = ('Oak', 'Dogwood', 'Bonsai', 'Plane.003', 'Plane.004', 'Plane.006', 'Plane_rock_wall', 'rock', 'ferns',
              'trop_leav', 'Porsche', 'plants', 'Faucet', 'DiningTable', 'Cylinder_Couch', 'Sphere.001', 'Plane.001',
              'Plane.002', 'Plane.005', 'Plane_Black')


def _import(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    meshes = []
    for o in new:
        if o.type == 'MESH':
            mw = o.matrix_world.copy()
            o.parent = None
            if o.data.users > 1:
                o.data = o.data.copy()
            o.data.transform(mw)
            o.matrix_world = Matrix.Identity(4)
            meshes.append(o)
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    return meshes


def _bbox(obs):
    lo = np.full(3, 1e9); hi = -lo
    for o in obs:
        co = np.empty(len(o.data.vertices) * 3, np.float32)
        o.data.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        if len(co):
            lo = np.minimum(lo, co.min(0)); hi = np.maximum(hi, co.max(0))
    return lo, hi


def _to_coll(obs, c):
    for o in obs:
        for uc in list(o.users_collection):
            uc.objects.unlink(o)
        c.objects.link(o)


def _hidden_coll(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    bpy.context.view_layer.layer_collection.children[c.name].exclude = True
    return c


def _instance(src, name, loc, rot_z, scale=(1, 1, 1), parent_coll=None):
    ob = bpy.data.objects.new(name, None)
    ob.instance_type = 'COLLECTION'
    ob.instance_collection = src
    ob.location = loc
    ob.rotation_euler.z = rot_z
    ob.scale = scale
    (parent_coll or bpy.context.scene.collection).objects.link(ob)
    return ob


# ---------------------------------------------------------------- 别墅
def _swap(obs, mapping):
    for o in obs:
        for i, m in enumerate(o.data.materials):
            if m and m.name.split('.')[0] in mapping:
                o.data.materials[i] = mapping[m.name.split('.')[0]]


def _tint_copy(m, name, rgb, amt):
    """复制材质，把 Base Color 与一个颜色按 amt 相乘混合（换木色 / 石色）。"""
    m2 = m.copy()
    m2.name = name
    nt = m2.node_tree
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None:
        return m2
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = amt
    mix.inputs[7].default_value = (*rgb, 1)
    if b.inputs['Base Color'].is_linked:
        nt.links.new(b.inputs['Base Color'].links[0].from_socket, mix.inputs[6])
    else:
        mix.inputs[6].default_value = b.inputs['Base Color'].default_value
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    return m2


def build_villas(white_stone):
    path = os.path.join(SF, 'modern_coastal_hillside_villa', 'scene.gltf')
    if not os.path.exists(path):
        print('[sketchfab] 缺别墅模型，跳过')
        return None
    obs = _import(path)
    keep = []
    trop = []
    for o in obs:
        if o.name.startswith(('trop_leav', 'ferns')):
            trop.append(o)
            continue
        if any(o.name.startswith(p) for p in VILLA_DROP):
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            keep.append(o)
    plaster = [o for o in keep if 'Plaster' in o.name]
    lo, hi = _bbox(plaster)
    c = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 19.0))
    M = Matrix.Diagonal((VILLA_SCALE,) * 3 + (1,)) @ Matrix.Translation(-c)
    for o in keep:
        o.data.transform(M)
    lo, hi = _bbox(keep)
    print(f'[sketchfab] 别墅 {len(keep)} 件, {sum(len(o.data.polygons) for o in keep)} 面, 尺寸 {hi - lo}')
    va = _hidden_coll('e2_villa_A')
    _to_coll(keep, va)
    # 变体 B：混凝土换白石（和主楼群同一种白石），木作不变
    vb = _hidden_coll('e2_villa_B')
    vc = _hidden_coll('e2_villa_C')
    mats = {m.name.split('.')[0]: m for o in keep for m in o.data.materials if m}
    walnut = {k: _tint_copy(m, f'{k}_walnut', (0.45, 0.3, 0.2), 0.8) for k, m in mats.items() if k.startswith('Wood')}
    warm = {k: _tint_copy(m, f'{k}_warm', (1.0, 0.95, 0.86), 1.0) for k, m in mats.items() if k in ('Plaster', 'TilesTravertine')}
    for tgt, mapping in ((vb, {'Concrete048': white_stone}), (vc, {**walnut, **warm, 'Concrete048': mats.get('TilesTravertine', white_stone)})):
        cp = []
        for o in keep:
            o2 = o.copy()
            o2.data = o.data.copy()
            cp.append(o2)
            tgt.objects.link(o2)
        _swap(cp, mapping)
    # 热带植物原型（龟背竹 / 蕨类卡片）：各自归零到原点，按模型比例缩放，给 vegetation 散布
    tc = _hidden_coll('e2_tropic_protos')
    for o in trop:
        a, b = _bbox([o])
        o.data.transform(Matrix.Diagonal((VILLA_SCALE * 1.3,) * 3 + (1,)) @ Matrix.Translation((-(a[0] + b[0]) / 2, -(a[1] + b[1]) / 2, -a[2])))
    _to_coll(trop, tc)
    return dict(A=va, B=vb, C=vc, lo=lo, hi=hi, tropic=tc)


def place_villas(v, plinth_mat):
    import bmesh
    from .buildings import _box
    col = coll('villas')
    lo, hi = v['lo'], v['hi']
    order = ['A', 'B', 'C', 'B', 'A', 'C', 'B', 'A', 'C', 'B']
    for i, spec in enumerate(L.VILLAS):
        bid, cx, cy, w, d, fl, rot_deg, *_ = spec
        rot = math.radians(rot_deg)
        pts = [(cx, cy)] + [(cx + math.cos(rot) * sx * w / 2 - math.sin(rot) * sy * d / 2,
                             cy + math.sin(rot) * sx * w / 2 + math.cos(rot) * sy * d / 2) for sx in (-1, 1) for sy in (-1, 1)]
        zs = [L.ground_z(x, y) for x, y in pts]
        z0 = float(np.percentile(zs, 60))
        mirror = -1 if i % 2 else 1
        _instance(v[order[i]], f'villa_{bid}', (cx, cy, z0), rot, (mirror, 1, 1), col)
        bm = bmesh.new()
        _box(bm, lo[0] * 0.92, lo[1] * 0.92, min(zs) - z0 - 2.0, hi[0] * 0.92, hi[1] * 0.92, 0.05)
        me = bpy.data.meshes.new(f'villa_{bid}_plinth')
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(me.name, me)
        me.materials.append(plinth_mat)
        ob.location = (cx, cy, z0)
        ob.rotation_euler.z = rot
        ob.scale.x = mirror
        col.objects.link(ob)
    return col


# ---------------------------------------------------------------- 车
def _strip_car(obs, kind):
    keep = []
    for o in obs:
        nm = o.name.lower()
        mn = ' '.join(m.name.lower() for m in o.data.materials if m)
        bad = any(k in nm or k in mn for k in ('badge', 'logo', 'emblem', 'license', 'plate', 'sticker'))
        if not bad and len(o.data.polygons) <= 16:
            bad = True   # 自带地面 / 影子片
        if bad:
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            keep.append(o)
    if kind == 'maybach':   # 名字没标车标：删掉中线上车头 / 车尾的小件（立标、格栅星标、尾标）
        lo, hi = _bbox(keep)
        out = []
        for o in keep:
            a, b = _bbox([o])
            size = (b - a).max()
            cxo, cyo = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            if size < 0.3 and abs(cyo) < 0.25 and (cxo > hi[0] - 0.6 or cxo < lo[0] + 0.6):
                bpy.data.objects.remove(o, do_unlink=True)
            else:
                out.append(o)
        keep = out
    for o in keep:
        n = len(o.data.polygons)
        if n > 20000:
            md = o.modifiers.new('dec', 'DECIMATE')
            md.ratio = max(0.04, 6000 / n)
    return keep


def build_cars():
    cars = {}
    for kind, folder, length_axis in (('maybach', 'mercedes-benz_maybach_2022', 'x'), ('db11', '2017_aston_martin_db11_5.2l_twin-turbo_v12', 'y')):
        path = os.path.join(SF, folder, 'scene.gltf')
        if not os.path.exists(path):
            continue
        obs = _strip_car(_import(path), kind)
        lo, hi = _bbox(obs)
        # 统一：车长沿 +y（车头朝 +y），车底 z=0，中心在原点
        M = Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))
        if length_axis == 'x':
            M = Matrix.Rotation(math.pi / 2, 4, 'Z') @ M
        for o in obs:
            o.data.transform(M)
        c = _hidden_coll(f'e2_car_{kind}')
        _to_coll(obs, c)
        cars[kind] = c
        print(f'[sketchfab] {kind}: {len(obs)} 件')
    return cars


def place_cars(cars):
    if not cars:
        return
    col = coll('cars')
    zf = L.ground_z(0, -40)
    spots = [  # (车型, x, y, 朝向°)  朝向 0 = 车头朝 +y
        ('maybach', 5.5, -37.5, 90), ('db11', -6.0, -37.8, 90),                 # 主楼门廊前的车道
        ('maybach', -8.5, -258.5, 30), ('db11', 9.0, -259.0, -35),              # 停靠平台接驳
        ('maybach', -136.0, 130.0, 125), ('db11', -141.0, 133.5, 125), ('maybach', -146.0, 137.0, 125),   # 车库前
    ]
    for i, (k, x, y, a) in enumerate(spots):
        if k not in cars:
            continue
        z = zf if abs(y + 38) < 5 else (8.5 if y < -250 else L.ground_z(x, y))
        _instance(cars[k], f'car_{i}_{k}', (x, y, z + 0.02), math.radians(a), (1, 1, 1), col)


def build(white_stone, plinth_mat):
    v = build_villas(white_stone)
    if v:
        place_villas(v, plinth_mat)
    place_cars(build_cars())
    return v['tropic'] if v else None
