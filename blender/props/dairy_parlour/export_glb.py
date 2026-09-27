"""挤奶厅测试件 → 烘焙光照的 glb（浏览器交互测试用）。

两步（仓库根目录；启动 Blender 前先等 GPU 空闲：pgrep -f "[M]acOS/Blender -b" 为空）：
  1. 生成场景 .blend（build.py 末尾会渲一张小图，无所谓）
     Blender -b --factory-startup --python blender/props/dairy_parlour/build.py -- \
         --res 64 --samples 1 --out /tmp/d.png --blend /tmp/dairy.blend
  2. 烘焙 + 导出
     Blender -b --factory-startup /tmp/dairy.blend --python blender/props/dairy_parlour/export_glb.py -- \
         --out /tmp/dairy_raw.glb --samples 64 --scale 1.0
  3. 压缩（先 WebP 贴图、后 meshopt 几何；反过来 webp 会把 meshopt 解掉），写到 map/props/dairy/
     G="npx -y @gltf-transform/cli"
     $G webp /tmp/dairy_raw.glb /tmp/w.glb --quality 80 && $G meshopt /tmp/w.glb map/props/dairy/dairy.glb --level medium
     低档（手机）：$G resize /tmp/dairy_raw.glb /tmp/r.glb --width 1024 --height 1024 && $G webp /tmp/r.glb /tmp/rw.glb --quality 75 \
                  && $G meshopt /tmp/rw.glb map/props/dairy/dairy_low.glb --level medium
  实测（M 系 Mac GPU，256 spp）：烘焙 250 s；原始 15.3 MB → 4.8 MB（低档 2.8 MB），27 万三角形，15 个网格。

做法：按热点分组（每组 = 一个网格 = 一次 draw call），组内合并、按三角形预算 decimate，
新建 bake UV（Smart UV），Cycles COMBINED 烘焙（直射 + 间接 + AO/阴影 + 自发光，不含高光），
金属 / 透射材质烘焙前改成漫反射，结果用场景的 AgX 视图变换存成 8 位 sRGB。
浏览器端用 MeshBasicMaterial（无灯光）直接贴烘焙图。
"""
import json, math, os, re, sys
import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ARGS = dict(out='/tmp/dairy_raw.glb', samples='64', scale='1.0', manifest='')
for k, v in zip(argv[::2], argv[1::2]):
    ARGS[k.lstrip('-')] = v
OUT = os.path.abspath(ARGS['out'])
TEXDIR = os.path.splitext(OUT)[0] + '_tex'
os.makedirs(TEXDIR, exist_ok=True)
SCALE = float(ARGS['scale'])

# 网格（= glb 里的 mesh 名，每个一次 draw call）：名字 → (对象名正则, 三角形预算, 贴图边长)
# 命名约定（内透 / 剖切要用）：roof / walls_ext / interior / floor_N / props_<热点id> / site_*
GROUPS = [
    ('props_cluster',   r'^(shortmilk|shortpulse|lip|mouth|mouthhole|shell|linerstub|nipple|pnip|longmilk|claw_|distrib|hook|pulse_|pulsator)', 120000, 2048),
    ('props_jetters',   r'^(jetter|jet_)', 12000, 1024),
    ('props_milkline',  r'^(milkline|ml_bracket|pulseline|washline|clamp|inlet)', 12000, 1024),
    ('props_receiver',  r'^(receiver|san_|rec_to_trap|transfer_line|milk_pump)', 8000, 1024),
    ('props_tank',      r'^(tank_|manway|agitator|condenser|panel_|grille)', 12000, 1024),
    ('props_vacuum',    r'^(vac_|vacuum_line)', 8000, 1024),
    ('props_meters',    r'^(meter_|hose_hanger)', 8000, 1024),
    ('props_pit',       r'^(pitled_|pitrail|washreel)', 8000, 1024),
    ('props_drain',     r'^(drain|grate_)', 6000, 1024),
    ('props_stalls',    r'^(divider|breast_rail|rump_rail|gantry|base_|kerb|platform_mat|splash|step|handrail)', 16000, 2048),
    ('props_energiser', r'^(energiser|term_|earth_|leadout)', 6000, 512),
    ('props_gate',      r'^(gate_)', 2000, 512),
    ('props_fence',     r'^(post|ins_|insc_|insd_|wire_|tape_|brace)', 24000, 2048),
    ('roof',            r'^(roof|purlin|rafter)', 8000, 2048),
    ('walls_ext',       r'^(wall_|gutter|downpipe|dp_clip|col_web|col_fl)', 12000, 2048),
    ('floor_0',         r'^(floor_|pit_|pitwall|drain|yard|apron)', 12000, 2048),
    ('site_ground',     r'^(ground)$', 14000, 2048),
    ('interior',        r'.*', 40000, 2048),   # 其余：隔墙、灯、水槽、杂物
]
SAMPLES = int(ARGS['samples'])

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type != 'CPU'
sc.cycles.device = 'GPU'
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = False
sc.render.bake.margin = 6

# ---------------------------------------------------------------- 清理
for o in list(bpy.data.objects):
    if o.type == 'CAMERA' or o.name.startswith('tuft'):
        bpy.data.objects.remove(o, do_unlink=True)
g = bpy.data.objects.get('ground')
if g:
    for m in list(g.modifiers):
        if m.type == 'NODES':   # 草丛散布：浏览器端不要，地面贴图里只烘地面
            g.modifiers.remove(m)

meshes = [o for o in bpy.data.objects if o.type in ('MESH', 'CURVE') and not o.hide_render]
for o in bpy.data.objects:
    o.select_set(False)
for o in meshes:
    o.hide_viewport = False
    o.hide_set(False)
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.convert(target='MESH')   # 曲线 → 网格，同时应用修改器
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.hide_render]
for o in meshes:
    if o.data.users > 1:
        o.data = o.data.copy()
bpy.ops.object.select_all(action='DESELECT')

# ---------------------------------------------------------------- 分组 + 合并 + 减面
assigned = {}
for o in meshes:
    for gid, rx, _, _ in GROUPS:
        if re.match(rx, o.name):
            assigned.setdefault(gid, []).append(o)
            break


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


joined = {}
for gid, rx, budget, texsize in GROUPS:
    obs = assigned.get(gid, [])
    if not obs:
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    J = bpy.context.view_layer.objects.active
    J.name = gid
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    before = tris(J)
    if gid == 'site_ground':
        # 地面网格在楼板 / 坑下面的部分是沉下去的（build.py 为了不穿帮）：直接删掉，再按平面合并（collapse 会把沉下去的点拉上来盖住坑）
        import bmesh
        bm = bmesh.new(); bm.from_mesh(J.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.2], context='VERTS')
        bm.to_mesh(J.data); bm.free()
        d = J.modifiers.new('dis', 'DECIMATE'); d.decimate_type = 'DISSOLVE'; d.angle_limit = math.radians(1.5)
        bpy.ops.object.modifier_apply(modifier='dis')
        t = J.modifiers.new('tri', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier='tri')
    elif before > budget:
        d = J.modifiers.new('dec', 'DECIMATE')
        d.ratio = budget / before
        d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='dec')
    print(f'GROUP {gid}: {len(obs)} objs, {before} → {tris(J)} tris')
    joined[gid] = (J, before)

# ---------------------------------------------------------------- 烘焙前把材质改成"只剩漫反射"
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nt = mat.node_tree
    for n in nt.nodes:
        if n.type != 'BSDF_PRINCIPLED':
            continue
        for name, val in (('Metallic', 0.0), ('Transmission Weight', 0.0), ('Coat Weight', 0.0),
                          ('Specular IOR Level', 0.0), ('Sheen Weight', 0.0), ('Roughness', 1.0)):
            s = n.inputs.get(name)
            if s is None:
                continue
            for l in list(s.links):
                nt.links.remove(l)
            s.default_value = val
        a = n.inputs.get('Alpha')
        if a is not None:
            for l in list(a.links):
                nt.links.remove(l)
            a.default_value = 1.0
    # 玻璃 / 透明 BSDF → 漫反射灰
    for n in list(nt.nodes):
        if n.type in ('BSDF_GLASS', 'BSDF_TRANSPARENT', 'BSDF_GLOSSY', 'BSDF_REFRACTION'):
            dfn = nt.nodes.new('ShaderNodeBsdfDiffuse')
            dfn.inputs['Color'].default_value = (0.6, 0.62, 0.63, 1)
            for l in list(n.outputs[0].links):
                nt.links.new(dfn.outputs[0], l.to_socket)
            nt.nodes.remove(n)

sc.render.bake.use_pass_direct = True
sc.render.bake.use_pass_indirect = True
for k in ('diffuse', 'glossy', 'transmission', 'emit'):
    setattr(sc.render.bake, 'use_pass_' + k, k in ('diffuse', 'emit'))

manifest = {'groups': {}}
baked = []
for gid, rx, budget, texsize in GROUPS:
    if gid not in joined:
        continue
    J, before = joined[gid]
    size = max(256, int(texsize * SCALE))
    me = J.data
    uv = me.uv_layers.new(name='bake')
    me.uv_layers.active = uv
    bpy.ops.object.select_all(action='DESELECT')
    J.select_set(True)
    bpy.context.view_layer.objects.active = J
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.003, area_weight=0.0)
    bpy.ops.uv.pack_islands(margin=0.003, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new(f'bake_{gid}', size, size, float_buffer=True)
    added = []
    for slot in J.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes:
            continue
        nt = mat.node_tree
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'bake'
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
        nt.links.new(uvn.outputs[0], tn.inputs[0])
        nt.nodes.active = tn
        added.append((nt, uvn, tn))
    print('BAKE', gid, size, flush=True)
    bpy.ops.object.bake(type='COMBINED', use_clear=True, margin=6)
    for nt, uvn, tn in added:
        nt.nodes.remove(uvn); nt.nodes.remove(tn)
    path = os.path.join(TEXDIR, f'{gid}.jpg')
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 92
    img.save_render(path, scene=sc)   # 带 AgX 视图变换 → 显示空间 8 位
    baked.append((J, path))
    bb = [J.matrix_world @ v.co for v in me.vertices]
    lo = [min(v[i] for v in bb) for i in range(3)]
    hi = [max(v[i] for v in bb) for i in range(3)]
    # glTF 是 Y 朝上：(x, z, -y)
    manifest['groups'][gid] = dict(tris_src=before, tris=tris(J), tex=size,
                                   bbox=[[lo[0], lo[2], -hi[1]], [hi[0], hi[2], -lo[1]]])

# 全部烘完再换材质（免得已烘的组把光照二次带进别组的反弹）
for J, path in baked:
    me = J.data
    gid = J.name
    # 新材质：只有一张烘焙图
    bimg = bpy.data.images.load(path)
    bm = bpy.data.materials.new(f'm_{gid}')
    bm.use_nodes = True
    bnt = bm.node_tree
    bnt.nodes.clear()   # 不按节点名找：用户偏好是中文界面时默认节点名会被翻译
    p = bnt.nodes.new('ShaderNodeBsdfPrincipled')
    mo = bnt.nodes.new('ShaderNodeOutputMaterial'); mo.is_active_output = True
    bnt.links.new(p.outputs[0], mo.inputs['Surface'])
    t = bm.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bimg
    bm.node_tree.links.new(t.outputs[0], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 1.0
    me.materials.clear()
    me.materials.append(bm)
    for poly in me.polygons:
        poly.material_index = 0
    for l in [l for l in me.uv_layers if l.name != 'bake']:
        me.uv_layers.remove(l)
    for a in [a.name for a in me.attributes if not a.name.startswith('.') and a.name not in ('position', 'sharp_face', 'bake')]:
        try:
            me.attributes.remove(me.attributes[a])
        except Exception:
            pass

# ---------------------------------------------------------------- 导出
for o in list(bpy.data.objects):
    if o.type != 'MESH' or o.name not in joined:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_normals=False,
                          export_tangents=False, export_materials='EXPORT', export_image_format='JPEG',
                          export_jpeg_quality=90, export_apply=True, export_lights=False, export_cameras=False)
manifest['tris'] = sum(g['tris'] for g in manifest['groups'].values())
mp = ARGS['manifest'] or os.path.splitext(OUT)[0] + '.json'
with open(mp, 'w') as f:
    json.dump(manifest, f, indent=1)
print('WROTE', OUT, mp, manifest['tris'])
