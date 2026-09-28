"""开局地标 → 烘焙光照的 glb（map/props/viewer3d.html 用）。做法同 blender/props/dairy_parlour/export_glb.py：
每个 Batch 对象 = 一个组 = 一个网格 / 一次 draw call；按三角形预算 decimate，Smart UV，Cycles COMBINED 烘焙
（直射 + 间接，不含高光），金属 / 玻璃先改成漫反射，存成带 AgX 视图变换的 8 位 JPEG，浏览器端 MeshBasicMaterial。
bg_* 对象（远处地面，只为渲染时挡地平线）不导出。

步骤（仓库根目录；每次启动 Blender 前：while pgrep -x Blender >/dev/null; do sleep 30; done）：
  1. build.py 存 .blend：... build.py -- --res 64 --samples 1 --out /tmp/x.png --blend /tmp/<id>.blend
  2. blender -b --factory-startup /tmp/<id>.blend --python-expr "import runpy; runpy.run_path('blender/landmarks/export_glb.py', run_name='__main__')" \
        -- --out /tmp/<id>_raw.glb --samples 32 --scale 0.5 [--log /tmp/e.log]
  3. 压缩（低档）：G="npx -y @gltf-transform/cli"; $G webp /tmp/<id>_raw.glb /tmp/w.glb --quality 75 \
        && $G meshopt /tmp/w.glb map/props/<id>/<id>_low.glb --level medium
"""
import json, math, os, sys, traceback
import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ARGS = dict(out='/tmp/lm_raw.glb', samples='32', scale='0.5', log='')
for k, v in zip(argv[::2], argv[1::2]):
    ARGS[k.lstrip('-')] = v

# 组名 → (三角形预算, 贴图边长 @ scale 1)
BUDGET = {
    'walls_ext': (60000, 2048), 'roof': (20000, 2048), 'floor_0': (8000, 1024), 'site_ground': (8000, 2048),
    'site_garden': (20000, 1024),
    'props_westfront': (90000, 2048), 'props_dome': (60000, 2048), 'props_buttress': (50000, 2048),
    'props_transept': (40000, 2048), 'props_apse': (40000, 2048), 'props_cloister': (80000, 2048),
    'props_residence': (20000, 1024), 'props_piazza': (12000, 1024),
    'props_door': (8000, 1024), 'props_railings': (20000, 1024), 'props_chimneys': (4000, 512),
    'props_gate': (12000, 1024), 'props_colonnade': (30000, 1024),
    'windows': (20000, 1024), 'props_balconies': (40000, 1024), 'props_shops': (30000, 1024),
    'props_breakfast': (20000, 1024), 'props_signs': (10000, 1024), 'props_metro': (15000, 1024),
    'props_room': (20000, 1024), 'props_car': (8000, 512), 'site_trees': (30000, 1024),
    'props_people': (20000, 512),
    # lower_quarter（铁皮屋区 + 旧货市场）
    'props_shacks_a': (40000, 2048), 'props_shacks_b': (40000, 2048), 'props_alleys': (20000, 1024),
    'props_pipes': (12000, 1024),
    'props_market': (8000, 1024), 'props_stalls': (8000, 1024), 'props_goods': (16000, 1024), 'props_lights': (10000, 512),
    # well7（层间检查点 + 7 号井黑市；props_market / props_lights 与 lower_quarter 共用上面的预算）
    'site_deck': (12000, 2048), 'props_checkpoint': (30000, 2048), 'props_gates': (30000, 1024),
    'props_shaft': (40000, 2048), 'props_lift': (12000, 1024), 'props_shop': (12000, 1024), 'props_terminal': (6000, 512),
    'props_taxpoint': (12000, 1024), 'props_walls': (30000, 2048),
    # highland（旷野高地：台地 / 峭壁 / 小径 / 石块 / 焦土 / 丛草与树）
    'site_plateau': (55000, 2048), 'site_cliff': (80000, 2048), 'site_trail': (5000, 1024),
    'props_rocks': (30000, 1024), 'props_scorch': (12000, 1024), 'site_vegetation': (60000, 1024),
    # amc_facility（资产管理委员会下层设施；walls_ext / site_ground / props_gate / props_lights 共用上面的预算）
    'props_wall': (30000, 2048), 'props_works': (50000, 2048), 'props_post': (12000, 1024),
    'props_vehicles': (20000, 1024), 'props_roof': (6000, 512),
    # enforcement_low（执法局下层分局；walls_ext / site_ground / props_gate / props_lights / props_vehicles 共用上面的预算）
    'props_counter': (6000, 1024), 'props_motorpool': (20000, 1024), 'props_security': (12000, 1024),
    # outpost（防卫军前沿哨所；walls_ext / site_ground / props_gate / props_lights / props_vehicles 共用上面的预算）
    'props_tower': (8000, 1024), 'props_perimeter': (40000, 2048), 'props_barricade': (30000, 2048),
    'props_utility': (8000, 1024), 'props_breach': (20000, 2048),
    # prison（下层监狱外观；walls_ext / site_ground / props_wall / props_lights / props_vehicles 共用上面的预算）
    'props_blocks': (40000, 2048), 'props_towers': (10000, 1024), 'props_yard': (25000, 1024),
    # soup_kitchen（施粥站 + 收容所 + 义诊；walls_ext / roof / site_ground / props_lights / props_utility / props_yard 用上面的）
    'props_canopy': (8000, 1024), 'props_serving': (16000, 1024), 'props_tables': (4000, 1024), 'props_queue': (10000, 512),
    'props_clinic': (4000, 1024), 'props_shelter': (6000, 1024),
    # civic_core（中层核心区政务区；site_ground / props_lights / props_signs 用上面的）
    'props_council': (70000, 2048), 'props_executive': (35000, 2048), 'props_admin': (30000, 2048),
    'props_reserve': (25000, 2048), 'props_culture': (20000, 1024), 'site_plaza': (45000, 2048),
}


def main():
    OUT = os.path.abspath(ARGS['out'])
    TEXDIR = os.path.splitext(OUT)[0] + '_tex'
    os.makedirs(TEXDIR, exist_ok=True)
    SCALE = float(ARGS['scale'])
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type != 'CPU'
        sc.cycles.device = 'GPU'
    except Exception as e:  # noqa
        print('cpu', e)
    sc.cycles.samples = int(ARGS['samples'])
    sc.cycles.use_denoising = False
    for o in list(bpy.data.objects):
        if o.type == 'CAMERA' or o.name.startswith('bg_'):
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']

    def tris(o):
        return sum(len(p.vertices) - 2 for p in o.data.polygons)

    info = {}
    for J in meshes:
        budget, texsize = BUDGET.get(J.name, (20000, 1024))
        bpy.ops.object.select_all(action='DESELECT')
        J.select_set(True); bpy.context.view_layer.objects.active = J
        before = tris(J)
        if before > budget:
            d = J.modifiers.new('dec', 'DECIMATE'); d.ratio = budget / before; d.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier='dec')
        info[J.name] = (before, tris(J), max(256, int(texsize * SCALE)))
        print('GROUP', J.name, before, '->', tris(J), flush=True)

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
            # 深色玻璃烘成漫反射会发黑：抬到中灰偏冷，像反射天空的窗
            if mat.name.startswith(('stained', 'glass', 'res_glass', 'lantern_glass')):
                bc = n.inputs['Base Color']
                for l in list(bc.links):
                    nt.links.remove(l)
                bc.default_value = (0.16, 0.19, 0.24, 1) if not mat.name.startswith('lantern') else (0.9, 0.7, 0.35, 1)
            if mat.name.startswith('gold'):
                n.inputs['Base Color'].default_value = (0.95, 0.66, 0.25, 1)

    sc.render.bake.use_pass_direct = True
    sc.render.bake.use_pass_indirect = True
    for k in ('diffuse', 'glossy', 'transmission', 'emit'):
        setattr(sc.render.bake, 'use_pass_' + k, k in ('diffuse', 'emit'))

    groups = {}
    baked = []
    for J in meshes:
        before, after, size = info[J.name]
        me = J.data
        uv = me.uv_layers.new(name='bake'); me.uv_layers.active = uv
        bpy.ops.object.select_all(action='DESELECT')
        J.select_set(True); bpy.context.view_layer.objects.active = J
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0)
        bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        img = bpy.data.images.new(f'bake_{J.name}', size, size, float_buffer=True)
        added = []
        for slot in J.material_slots:
            m = slot.material
            if m is None:
                continue
            nt = m.node_tree
            uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'bake'
            tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
            nt.links.new(uvn.outputs[0], tn.inputs[0]); nt.nodes.active = tn
            added.append((nt, uvn, tn))
        print('BAKE', J.name, size, flush=True)
        bpy.ops.object.bake(type='COMBINED', use_clear=True, margin=4)
        for nt, uvn, tn in added:
            nt.nodes.remove(uvn); nt.nodes.remove(tn)
        path = os.path.join(TEXDIR, f'{J.name}.jpg')
        sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
        img.save_render(path, scene=sc)
        baked.append((J, path))
        bb = [J.matrix_world @ v.co for v in me.vertices]
        lo = [min(v[i] for v in bb) for i in range(3)]; hi = [max(v[i] for v in bb) for i in range(3)]
        groups[J.name] = dict(tris_src=before, tris=after, tex=size,
                              bbox=[[round(lo[0], 2), round(lo[2], 2), round(-hi[1], 2)], [round(hi[0], 2), round(hi[2], 2), round(-lo[1], 2)]])

    for J, path in baked:
        me = J.data
        bimg = bpy.data.images.load(path)
        bm = bpy.data.materials.new(f'm_{J.name}')
        bnt = bm.node_tree; bnt.nodes.clear()
        p = bnt.nodes.new('ShaderNodeBsdfPrincipled')
        mo = bnt.nodes.new('ShaderNodeOutputMaterial'); mo.is_active_output = True
        bnt.links.new(p.outputs[0], mo.inputs['Surface'])
        t = bnt.nodes.new('ShaderNodeTexImage'); t.image = bimg
        bnt.links.new(t.outputs[0], p.inputs['Base Color'])
        me.materials.clear(); me.materials.append(bm)
        for poly in me.polygons:
            poly.material_index = 0
        for l in [l for l in me.uv_layers if l.name != 'bake']:
            me.uv_layers.remove(l)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_normals=False, export_tangents=False,
                              export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=88,
                              export_apply=True, export_lights=False, export_cameras=False)
    man = {'groups': groups, 'tris': sum(g['tris'] for g in groups.values())}
    with open(os.path.splitext(OUT)[0] + '.json', 'w') as f:
        json.dump(man, f, indent=1)
    print('WROTE', OUT, man['tris'])


try:
    main()
except Exception:
    msg = traceback.format_exc()
    if ARGS['log']:
        with open(ARGS['log'], 'w') as f:
            f.write(msg)
    print(msg)
    raise
