"""estate2 r4 场景 → 网页三维整岛外观 glb（map/estate/model/site.glb + site_low.glb）。

  0. 奶牛农场 .blend（gardens.dairy 链入）：Blender -b --factory-startup -P blender/props/dairy_parlour/build.py -- --res 64 --samples 1 --out /tmp/d.png --blend /tmp/dairy.blend
  1. 场景：E2_DAIRY_BLEND=/tmp/dairy.blend Blender -b --factory-startup -P blender/estate2/web_scene.py -- --save /tmp/scene.blend
  2. 烘焙 + 导出：Blender -b /tmp/scene.blend -P blender/estate2/export_web.py -- --out /tmp/site_raw.glb [--samples 64] [--top 4096]
  3. 压缩（先 WebP、后 meshopt）：
       G="npx -y @gltf-transform/cli"
       $G webp /tmp/site_raw.glb /tmp/w.glb --quality 78 && $G meshopt /tmp/w.glb map/estate/model/site.glb --level medium
       $G resize /tmp/site_raw.glb /tmp/r.glb --width 2048 --height 2048 && $G webp /tmp/r.glb /tmp/rw.glb --quality 72 && $G meshopt /tmp/rw.glb map/estate/model/site_low.glb --level medium
     （tools 里的一键脚本：bash blender/estate2/export_web.sh）

做法（与 props/dairy_parlour/export_glb.py 同一路子，浏览器端 MeshBasicMaterial 直接贴烘焙图，无灯光）：
  地面 = 岛面（法线朝上的面）+ 湖面：用正交俯视渲染当贴图（平面 UV），渲染时把要单独出三维的建筑设为「相机不可见」但仍投影，
         所以贴图里有树冠、花园、园路、水面和建筑 / 树的影子，却没有屋顶；
  岩基 = 岛体其余的面：Smart UV + Cycles COMBINED 烘焙；
  建筑 = 分四组（主楼外壳 house_shell / 中区 site_c / 西区 site_w / 东区 site_e），组内合并、按预算减面、Smart UV、COMBINED 烘焙。
  扁平的东西（水面、网球场、标线、路缘、花坛矮篱、喷泉水花…）不出三维，只在地面贴图里。
光照：style_frame 的 'day'（HDRI + 太阳高 24°、方位 132°，AgX Medium High Contrast），与整岛航拍封面一致。
坐标：glTF 导出自动 Z 上 → Y 上：(x, y, z) → (x, z, −y)。F1 地坪 = 世界 z 30.0（hall_body 底 28.5 + 1.5 m 基座）。
"""
import json, math, os, re, sys, time
import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
import style_frame as SF   # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
A = dict(out='/tmp/site_raw.glb', samples='64', top='4096', scale='1.0', only='')
for k, v in zip(argv[::2], argv[1::2]):
    A[k.lstrip('-')] = v
OUT = os.path.abspath(A['out'])
TEX = os.path.splitext(OUT)[0] + '_tex'
os.makedirs(TEX, exist_ok=True)
SAMPLES, TOPW, SCALE = int(A['samples']), int(A['top']), float(A['scale'])
T0 = time.time()
log = lambda *a: print(f'[export_web {time.time() - T0:5.0f}s]', *a, flush=True)

# 俯视贴图覆盖的范围（世界 x / y，米）：整岛约 670 × 500
TX0, TX1, TY0, TY1 = -352.0, 352.0, -264.0, 264.0

HOUSE = ('hall', 'porch', 'tower', 'w_wing_a', 'w_wing_b', 'w_pav', 'e_wing_a', 'e_wing_b', 'e_pav', 'belvedere', 'n_link', 'w_low', 'e_low')
HOUSE_RX = re.compile(r'^(' + '|'.join(HOUSE) + r')_|^(portico|dome_|arc_)')
FLAT_RX = re.compile(r'(_water$|_koi$|^koi_fish|_marks$|^tennis|_in$|_line$|^kerb|^canal_|_guide$|parterre_box|_spray$|^fountain_jet|^grotto_fall|_cascade_white|_sky$|_steel$|^awn_|^helipad_marks|_court$)')
# Window / glass material names (Blender side) — separated so night-look.mjs can glow them
GLASS_MATS = {'e2_glass', 'e2_window_glass', 'e2_glasshouse', 'e2_clear_glass'}
GROUPS = [  # 名 → (三角形预算, 贴图边长)
    ('house_shell', 60000, 2048),
    ('house_shell_glass', 15000, 512),
    ('site_c', 30000, 2048),
    ('site_w', 40000, 2048),
    ('site_e', 35000, 2048),
]

sc = bpy.context.scene
vl = bpy.context.view_layer

# ---------------------------------------------------------------- 光照：换成 day（航拍封面同款）
for o in [o for o in bpy.data.objects if o.type == 'LIGHT']:
    bpy.data.objects.remove(o, do_unlink=True)
SF.gpu(sc, SAMPLES)
import eden_guard                    # 设备实际由 SF.gpu → eden_guard 设置；这里显式再调一次（幂等），
eden_guard.setup_render_device(sc)   # 让渲染守卫的静态检查在本文件也能查到唯一的设备入口
SF.world(sc, 'day')
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = -0.1
wf = bpy.data.objects.get('white_floor')
if wf:
    bpy.data.objects.remove(wf, do_unlink=True)

# ---------------------------------------------------------------- 车删掉；集合实例（Sketchfab 别墅）实体化
for o in list(bpy.data.objects):
    if o.type == 'EMPTY' and o.name.startswith('car_'):
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
inst = [o for o in bpy.data.objects if o.type == 'EMPTY' and o.instance_type == 'COLLECTION' and o.instance_collection
        and o.instance_collection.name.startswith('e2_villa')]
for o in inst:
    o.select_set(True)
if inst:
    vl.objects.active = inst[0]
    bpy.ops.object.duplicates_make_real(use_base_parent=False, use_hierarchy=False)
    log('villa instances realized', len(inst))


def in_scene(o):
    return o.name in vl.objects


def world_bb(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return [min(v[i] for v in bb) for i in range(3)], [max(v[i] for v in bb) for i in range(3)]


def col_names(o):
    out = set()
    for c in o.users_collection:
        out.add(c.name)
        for p in bpy.data.collections:
            if c.name in p.children:
                out.add(p.name)
    return out


# 三维集合：buildings / villas / dairy 下的网格（和实体化出来的别墅网格）
SITE_COLS = ('buildings', 'villas', 'dairy')
cand = []
for o in bpy.data.objects:
    if o.type not in ('MESH', 'CURVE') or not in_scene(o) or o.hide_render:
        continue
    cn = col_names(o)
    if not cn & set(SITE_COLS):
        continue
    if o.name in ('island', 'island_caps', 'lake'):
        continue
    if FLAT_RX.search(o.name.split('.')[0]):
        continue
    lo, hi = world_bb(o)
    if hi[2] - lo[2] < 0.5:
        continue
    cand.append(o)
log('3D candidates', len(cand))


def is_glass(o):
    n = o.name
    if n.endswith('_glass') or n == 'portico_door':
        return True
    if '_Glass_' in n:
        return True
    if o.type == 'MESH' and o.data and getattr(o.data, 'materials', None):
        for m in o.data.materials:
            if m and (m.name in GLASS_MATS or 'glass' in m.name.lower()):
                return True
    return False


def group_of(o):
    if HOUSE_RX.search(o.name):
        if is_glass(o):
            return 'house_shell_glass'
        return 'house_shell'
    lo, hi = world_bb(o)
    cx = (lo[0] + hi[0]) / 2
    return 'site_w' if cx < -100 else 'site_e' if cx > 100 else 'site_c'


# ---------------------------------------------------------------- 1 俯视地面贴图（三维建筑相机不可见、仍投影）
if A['only'] in ('', 'top'):
    for o in cand:
        o.visible_camera = False
    for n in ('fountain_spray', 'wall_fountain_spray') + tuple(f'fountain_jet{i}' for i in range(12)):
        o = bpy.data.objects.get(n)
        if o:
            o.visible_camera = False
    cd = bpy.data.cameras.new('topcam'); cam = bpy.data.objects.new('topcam', cd); sc.collection.objects.link(cam)
    cd.type = 'ORTHO'; cd.ortho_scale = TX1 - TX0; cd.clip_start = 1; cd.clip_end = 5000
    cam.location = ((TX0 + TX1) / 2, (TY0 + TY1) / 2, 1500); cam.rotation_euler = (0, 0, 0)
    sc.camera = cam
    sc.render.resolution_x = TOPW; sc.render.resolution_y = int(round(TOPW * (TY1 - TY0) / (TX1 - TX0))); sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.cycles.samples = max(32, SAMPLES // 2)
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 92
    sc.render.filepath = os.path.join(TEX, 'ground_top.jpg')
    log('render top', sc.render.resolution_x, sc.render.resolution_y)
    bpy.ops.render.render(write_still=True)
    for o in cand:
        o.visible_camera = True
    sc.cycles.samples = SAMPLES
    log('top done')
TOP_IMG = os.path.join(TEX, 'ground_top.jpg')

# ---------------------------------------------------------------- 2 地形：减面，拆成岛面（俯视贴图）/ 岩基（烘焙）
isl = bpy.data.objects['island']
bpy.ops.object.select_all(action='DESELECT')
T = isl.copy(); T.data = isl.data.copy(); sc.collection.objects.link(T); T.name = 'terrain_src'
for m in list(T.modifiers):
    T.modifiers.remove(m)
vl.objects.active = T; T.select_set(True)
caps = bpy.data.objects.get('island_caps')
if caps:
    C = caps.copy(); C.data = caps.data.copy(); sc.collection.objects.link(C); C.select_set(True)
bpy.ops.object.join()
T = vl.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
before = len(T.data.polygons)
d = T.modifiers.new('dec', 'DECIMATE'); d.ratio = 260000 / max(1, sum(len(p.vertices) - 2 for p in T.data.polygons)); d.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier='dec')
log('terrain decimated', before, '→', len(T.data.polygons))
# 拆：法线朝上（nz > 0.45）且在俯视范围内 → ground；其余 → rock
bm = bmesh.new(); bm.from_mesh(T.data); bm.faces.ensure_lookup_table()
up = [f for f in bm.faces if f.normal.z > 0.45 and f.calc_center_median().z > -20]
bmesh.ops.split(bm, geom=up, use_only_faces=True)
bm.to_mesh(T.data); bm.free()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
for p in T.data.polygons:
    p.select = p.normal.z > 0.45 and p.center.z > -20
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
ground = [o for o in bpy.context.selected_objects if o is not T][0]
ground.name = 'ground'; T.name = 'rock'
for o, target in ((ground, 120000), (T, 36000)):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); vl.objects.active = o
    t0 = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if t0 > target:
        d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = target / t0; d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='dec')
lake = bpy.data.objects.get('lake')
if lake:
    Lk = lake.copy(); Lk.data = lake.data.copy(); sc.collection.objects.link(Lk)
    for m in list(Lk.modifiers):
        Lk.modifiers.remove(m)
    bpy.ops.object.select_all(action='DESELECT'); Lk.select_set(True); ground.select_set(True); vl.objects.active = ground
    bpy.ops.object.join()
    ground = vl.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# 平面 UV
me = ground.data
for l in list(me.uv_layers):
    me.uv_layers.remove(l)
uv = me.uv_layers.new(name='bake')
for poly in me.polygons:
    for li in poly.loop_indices:
        v = me.vertices[me.loops[li].vertex_index].co
        uv.data[li].uv = ((v.x - TX0) / (TX1 - TX0), (v.y - TY0) / (TY1 - TY0))
log('ground tris', sum(len(p.vertices) - 2 for p in me.polygons), 'rock tris', sum(len(p.vertices) - 2 for p in T.data.polygons))

# ---------------------------------------------------------------- 3 建筑分组 + 合并 + 减面
bpy.ops.object.select_all(action='DESELECT')
work = []
for o in cand:
    c = o.copy()
    if o.data:
        c.data = o.data.copy()
    sc.collection.objects.link(c)
    c.parent = None
    c.matrix_world = o.matrix_world.copy()
    c['grp'] = group_of(o)
    work.append(c)
bpy.ops.object.select_all(action='DESELECT')
for c in work:
    c.select_set(True)
vl.objects.active = work[0]
bpy.ops.object.convert(target='MESH')   # 曲线 → 网格 + 应用修改器
joined = {}
byg = {}
TEX_MAX = 600   # 三角形不多的部件（墙体、屋面、山墙…着色器画的窗在这些面上）走贴图烘焙；细部（线脚、柱廊、栏杆、玻璃格）走顶点色烘焙
for c in work:
    if c.name in vl.objects and c.type == 'MESH' and len(c.data.polygons):
        n = sum(len(p.vertices) - 2 for p in c.data.polygons)
        if c['grp'] == 'house_shell_glass':
            byg.setdefault('house_shell_glass', []).append(c.name)
        else:
            byg.setdefault(c['grp'] + ('' if n <= TEX_MAX else '_vc'), []).append(c.name)


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def join_group(gid, names, budget):
    obs = [bpy.data.objects[n] for n in names]
    if not obs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        if o.data.users > 1:
            o.data = o.data.copy()
        o.select_set(True)
    vl.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    J = vl.objects.active; J.name = gid
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    b0 = tris(J)
    bm = bmesh.new(); bm.from_mesh(J.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.005); bm.to_mesh(J.data); bm.free()
    if budget and tris(J) > budget:
        d = J.modifiers.new('dec', 'DECIMATE'); d.ratio = budget / tris(J); d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='dec')
    log(f'group {gid}: {len(obs)} objs {b0} → {tris(J)} tris')
    return J, b0


for gid, budget, texsize in GROUPS:
    r = join_group(gid, byg.get(gid, []), 0)
    if r:
        joined[gid] = (r[0], r[1], texsize)
    r = join_group(gid + '_vc', byg.get(gid + '_vc', []), budget)
    if r:
        joined[gid + '_vc'] = (r[0], r[1], 0)
joined['rock'] = (T, 0, 2048)

# ---------------------------------------------------------------- 4 烘焙（只剩漫反射 + 自发光）
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nt = mat.node_tree
    for n in nt.nodes:
        if n.type != 'BSDF_PRINCIPLED':
            continue
        for name, val in (('Metallic', 0.0), ('Transmission Weight', 0.0), ('Coat Weight', 0.0), ('Specular IOR Level', 0.0), ('Sheen Weight', 0.0), ('Roughness', 1.0)):
            s = n.inputs.get(name)
            if s is None:
                continue
            for l in list(s.links):
                nt.links.remove(l)
            s.default_value = val
        a = n.inputs.get('Alpha')
        if a is not None and not re.search(r'leaf|ivy|rose|hedge|flower', mat.name):
            for l in list(a.links):
                nt.links.remove(l)
            a.default_value = 1.0
    for n in list(nt.nodes):
        if n.type in ('BSDF_GLASS', 'BSDF_TRANSPARENT', 'BSDF_GLOSSY', 'BSDF_REFRACTION'):
            dfn = nt.nodes.new('ShaderNodeBsdfDiffuse'); dfn.inputs['Color'].default_value = (0.2, 0.24, 0.27, 1)
            for l in list(n.outputs[0].links):
                nt.links.new(dfn.outputs[0], l.to_socket)
            nt.nodes.remove(n)
sc.render.bake.use_pass_direct = True
sc.render.bake.use_pass_indirect = True
for k in ('diffuse', 'glossy', 'transmission', 'emit'):
    setattr(sc.render.bake, 'use_pass_' + k, k in ('diffuse', 'emit'))
sc.render.bake.margin = 8
manifest = {'groups': {}, 'top': dict(file='ground_top.jpg', x0=TX0, x1=TX1, y0=TY0, y1=TY1)}
baked = []
VC = []
for gid, (J, b0, texsize) in joined.items():
    me = J.data
    if not texsize:   # 顶点色烘焙
        ca = me.color_attributes.new('bake', 'FLOAT_COLOR', 'POINT')   # 浮点：烘焙值不截断，LUT 之后再落到显示值
        me.color_attributes.active_color = ca
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except Exception:
            pass
        bpy.ops.object.select_all(action='DESELECT'); J.select_set(True); vl.objects.active = J
        log('bake vc', gid, tris(J))
        bpy.ops.object.bake(type='COMBINED', target='VERTEX_COLORS', use_clear=True)
        VC.append(J)
        manifest['groups'][gid] = dict(tris_src=b0, tris=tris(J), tex=0)
        continue
    size = max(256, int(texsize * SCALE))
    uv = me.uv_layers.new(name='bake'); me.uv_layers.active = uv
    bpy.ops.object.select_all(action='DESELECT'); J.select_set(True); vl.objects.active = J
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0)
    bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new(f'bake_{gid}', size, size, float_buffer=True)
    added = []
    if not J.material_slots:
        J.data.materials.append(bpy.data.materials.get('e2_rock') or bpy.data.materials.new('tmp'))
    for slot in J.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes:
            continue
        nt = mat.node_tree
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'bake'
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
        nt.links.new(uvn.outputs[0], tn.inputs[0]); nt.nodes.active = tn
        added.append((nt, uvn, tn))
    log('bake', gid, size, tris(J))
    bpy.ops.object.bake(type='COMBINED', use_clear=True, margin=8)
    for nt, uvn, tn in added:
        nt.nodes.remove(uvn); nt.nodes.remove(tn)
    path = os.path.join(TEX, f'{gid}.jpg')
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 92
    img.save_render(path, scene=sc)
    baked.append((J, path))
    lo = [min((J.matrix_world @ v.co)[i] for v in me.vertices) for i in range(3)]
    hi = [max((J.matrix_world @ v.co)[i] for v in me.vertices) for i in range(3)]
    manifest['groups'][gid] = dict(tris_src=b0, tris=tris(J), tex=size, bbox=[[lo[0], lo[2], -hi[1]], [hi[0], hi[2], -lo[1]]])
baked.append((ground, TOP_IMG))
manifest['groups']['ground'] = dict(tris=tris(ground), tex=TOPW)


def bake_mat(gid, path):
    im = bpy.data.images.load(path)
    mat_name = 'm_win_glass' if 'glass' in gid else f'm_{gid}'
    m = bpy.data.materials.new(mat_name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); o = nt.nodes.new('ShaderNodeOutputMaterial'); o.is_active_output = True
    nt.links.new(p.outputs[0], o.inputs['Surface'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = im
    nt.links.new(t.outputs[0], p.inputs['Base Color']); p.inputs['Roughness'].default_value = 1.0
    return m


for J, path in baked:
    me = J.data
    m = bake_mat(J.name, path)
    me.materials.clear(); me.materials.append(m)
    for poly in me.polygons:
        poly.material_index = 0
    for l in [l for l in me.uv_layers if l.name != 'bake']:
        me.uv_layers.remove(l)
    for a in [a.name for a in me.attributes if not a.name.startswith('.') and a.name not in ('position', 'sharp_face', 'bake')]:
        try:
            me.attributes.remove(me.attributes[a])
        except Exception:
            pass

# 顶点色：烘焙结果是场景线性值，没有视图变换。用一条灰阶 LUT（同一个 AgX 视图变换存图再读回）逐通道映射成显示值，
# 再按 sRGB 存（three 解码成线性、输出时再编码回来 = 与贴图烘焙同一观感）
if VC:
    import numpy as np
    N = 1024
    vals = 2.0 ** np.linspace(-12, 4, N)
    im = bpy.data.images.new('lut', N, 1, float_buffer=True)
    px = np.zeros((N, 4), np.float32); px[:, 0] = px[:, 1] = px[:, 2] = vals; px[:, 3] = 1
    im.pixels.foreach_set(px.ravel())
    lp = os.path.join(TEX, '_lut.png'); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '16'
    im.save_render(lp, scene=sc)
    li = bpy.data.images.load(lp); li.colorspace_settings.name = 'Non-Color'
    q = np.empty(N * 4, np.float32); li.pixels.foreach_get(q); disp = q.reshape(N, 4)[:, 1]
    lv = np.log2(vals)
    for J in VC:
        ca = J.data.color_attributes['bake']
        c = np.empty(len(ca.data) * 4, np.float32); ca.data.foreach_get('color', c); c = c.reshape(-1, 4)
        d = np.interp(np.log2(np.maximum(c[:, :3], 2 ** -12)), lv, disp)
        out = np.concatenate([d, np.ones((len(d), 1), np.float32)], 1)
        ca.data.foreach_set('color_srgb', out.ravel())
        mat_name = 'm_win_glass' if 'glass' in J.name else f'm_{J.name}'
        m = bpy.data.materials.new(mat_name); m.use_nodes = True
        nt = m.node_tree; nt.nodes.clear()
        pr = nt.nodes.new('ShaderNodeBsdfPrincipled'); o = nt.nodes.new('ShaderNodeOutputMaterial'); o.is_active_output = True
        nt.links.new(pr.outputs[0], o.inputs['Surface'])
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'bake'
        nt.links.new(vc.outputs[0], pr.inputs['Base Color']); pr.inputs['Roughness'].default_value = 1.0
        J.data.materials.clear(); J.data.materials.append(m)
        for poly in J.data.polygons:
            poly.material_index = 0
        for l in list(J.data.uv_layers):
            J.data.uv_layers.remove(l)
        for a in [a.name for a in J.data.attributes if not a.name.startswith('.') and a.name not in ('position', 'sharp_face', 'bake')]:
            try:
                J.data.attributes.remove(J.data.attributes[a])
            except Exception:
                pass
    log('vc tone-mapped', [J.name for J in VC])
keep = {J.name for J, _ in baked} | {J.name for J in VC}
for o in list(bpy.data.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_normals=False, export_tangents=False, export_materials='EXPORT',
                          export_image_format='JPEG', export_jpeg_quality=90, export_vertex_color='ACTIVE', export_apply=True, export_lights=False, export_cameras=False)
manifest['tris'] = sum(g['tris'] for g in manifest['groups'].values())
manifest['f1_z'] = 30.0
with open(os.path.splitext(OUT)[0] + '.json', 'w') as f:
    json.dump(manifest, f, indent=1)
log('WROTE', OUT, manifest['tris'])
