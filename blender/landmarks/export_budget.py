"""RENDER-B7（D41 B3 预算重导出）：地标 glb 的烘焙导出，标准档 / 低档各跑一遍（低档只烘基色）。

与 blender/landmarks/export_glb.py 的差别（旧脚本保留不动，本脚本是批 7 的升级版）：
  * 每组标准档烘五张图：基色（COMBINED = 查看器 MeshBasic 显示的那张，同旧口径）、切线法线（NORMAL）、
    粗糙度（EMIT）、金属度（EMIT，两者都在材质压平前烘，拿的是真实值）、AO（AO 烘）。
    粗糙度 / 金属度 / AO 由 numpy 合成一张 ORM。法线与 ORM 随 glb 交给 gltf-transform：
    KTX2 基色 / ORM 用 ETC1S、法线用 UASTC（tools/lm_budget.py 按 --slots 分槽跑）。
  * 三角 / 贴图预算来自 --budget-json（组名 → [三角形, 基色边长, 法线边长]）。
  * 数据图（法线 / AO / 粗糙 / 金属 / ORM）一律 Non-Color 存取，不做视图变换；基色走 save_render（AgX，同旧管线）。

用法（队列内；一般由 budget_job.py 以 runpy 调，argv 已摆好）：
  blender -b <id>.blend --python-expr "import runpy; runpy.run_path('blender/landmarks/export_budget.py', run_name='__main__')" \
      -- --tier std --out /tmp/<id>_std_raw.glb --budget-json /tmp/budget.json [--samples 32]
"""
import json
import math
import os
import sys
import traceback

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ARGS = dict(tier='std', out='/tmp/lm_budget_raw.glb', budget_json='', samples='32', log='', skip_data='0')
for k, v in zip(argv[::2], argv[1::2]):
    ARGS[k.lstrip('-').replace('-', '_')] = v   # 统一下划线：--budget-json / --fit-lo 都要能读到
TIER = ARGS['tier']
OUT = os.path.abspath(ARGS['out'])
TEXDIR = os.path.splitext(OUT)[0] + '_tex'
os.makedirs(TEXDIR, exist_ok=True)
SAMPLES = int(ARGS['samples'])
# 体积带（MB）：标准档主力 5–8、其余 4–6.5（驱动经 --fit-lo/--fit-hi 给出），低档 ≤ 2
LO_MB = float(ARGS.get('fit_lo', 4.0 if TIER == 'std' else 0.0))
HI_MB = float(ARGS.get('fit_hi', 8.0 if TIER == 'std' else 2.0))
# 体积估算常数（arms_rnd / silver_crown 2026-10-03 实测分解）：ETC1S 烘焙基色极省 (~0.01 B/px)、
# UASTC+zstd 法线 ~0.79、ETC1S ORM ~0.114、几何 meshopt（基色+法线+UV 量化）~19 B/三形（低档 ~13）
# 低档贴图是 etc1s q96（比标准档 q128 大）且无法线 / ORM、无法线属性：常数按档分开（silver_crown 低档实测反推）
B_BASE, B_NORM, B_ORM = (0.010, 0.79, 0.114) if TIER == 'std' else (0.15, 0.0, 0.0)
B_TRI = 19.0 if TIER == 'std' else 9.0
STEPS = (512, 1024, 2048)
NORM_STEPS = (256, 512, 1024)


def fit_tex_sizes(groups, floors):
    """groups: 组名 → [tris_src]，floors: 组名 → [三角预算下限(0=按源), 基色边长下限]。
    按体积带选每组 (基色, 法线) 档位与三角预算：基色几乎不占体积，尽量大；法线是大头，超带先降法线再降基色；
    三角从预算下限起步（重试轮由驱动按实测体积反推，首轮 = 源三角数），跌破下限前先降贴图。返回 (sizes, tris, 估算 MB)。"""
    sizes = {k: (max((s for s in STEPS if s <= (floors.get(k) or [0, 1024])[1]), default=512), 512) for k in groups}
    tris = {k: ((floors[k][0] or v) if floors.get(k) else v) for k, v in groups.items()}
    floor_tris = {k: (floors[k][0] if floors.get(k) and floors[k][0] > 0 else max(int(v * 0.4), 1000)) for k, v in groups.items()}

    def est():
        tex = sum(b * b * B_BASE + n * n * (B_NORM + B_ORM) for b, n in sizes.values()) / 1048576.0
        return tex + sum(tris.values()) * B_TRI / 1048576.0
    # （低档 B_NORM/B_ORM = 0：法线项自然归零，不用分档写两条公式）
    if ARGS.get('lock_tex') == '1':   # 重试轮：贴图计划冻结（驱动按实测反推了精确三角预算），不再升降贴图
        return sizes, tris, est()
    e = est()
    while e > HI_MB:
        if any(n > NORM_STEPS[0] for _, n in sizes.values()):
            k = max(sizes, key=lambda k: sizes[k][1])
            b, n = sizes[k]
            sizes[k] = (b, max(NORM_STEPS[0], next(s for s in NORM_STEPS if s < n)))
        elif any(b > STEPS[0] for b, _ in sizes.values()):
            k = max(sizes, key=lambda k: sizes[k][0])
            b, n = sizes[k]
            sizes[k] = (max(STEPS[0], next(s for s in STEPS if s < b)), n)
        elif any(tris[k] > floor_tris[k] for k in tris):
            r = max(0.4, min(1.0, (HI_MB - (e - sum(tris.values()) * B_TRI / 1048576.0)) * 1048576.0 / (sum(tris.values()) * B_TRI)))
            tris = {k: max(int(v * r), floor_tris[k]) for k, v in tris.items()}
        else:
            break   # 都到下限：如实落在带外，由驱动上报
        e = est()
    while e < LO_MB:
        grown = False
        if TIER == 'std':   # 低档没有法线贴图，缺带时升基色（上限 1024）
            for k in sorted(sizes, key=lambda k: sizes[k][1]):
                if sizes[k][1] < NORM_STEPS[-1]:
                    b, n = sizes[k]
                    sizes[k] = (b, next(s for s in NORM_STEPS if s > n))
                    grown = True
                    break
        else:
            for k in sorted(sizes, key=lambda k: sizes[k][0]):
                if sizes[k][0] < 1024:
                    b, n = sizes[k]
                    sizes[k] = (next(s for s in STEPS if s > b and s <= 1024), n)
                    grown = True
                    break
        if not grown:
            break   # 基色与法线都到顶：源几何就这么大，宁可低于带也不虚增
        e = est()
    return sizes, tris, e


def log(msg):
    print('[export_budget:%s] %s' % (TIER, msg), flush=True)


def budget_table():
    """组名 → (三角形预算, 基色边长, 法线边长)；缺省法线 = 基色一半、夹在 [256, NORM_CAP]。"""
    tab = {}
    if ARGS['budget_json'] and os.path.exists(ARGS['budget_json']):
        with open(ARGS['budget_json']) as f:
            for name, b in json.load(f).items():
                tris, tex = int(b[0]), int(b[1])
                nrm = int(b[2]) if len(b) > 2 else 512   # 法线档位由 fit_tex_sizes 定，这里只是占位兼容旧三段式预算
                tab[name] = (tris, tex, nrm)
    return tab


BUDGET = budget_table()


def select_only(o):
    bpy.ops.object.select_all(action='DESELECT')
    if o.hide_get():
        o.hide_set(False)
    if hasattr(o, 'hide_viewport'):
        o.hide_viewport = False
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def tris_of(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def v3d_context():
    a = next((a for a in bpy.context.window.screen.areas if a.type == 'VIEW_3D'), None)
    if not a:
        return None
    return bpy.context.temp_override(area=a, region=next((r for r in a.regions if r.type == 'WINDOW'), None))


def smart_uv(J, ctx):
    me = J.data
    uv = me.uv_layers.get('bake') or me.uv_layers.new(name='bake')
    me.uv_layers.active = uv
    select_only(J)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')

    def run():
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0)
        bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
    if ctx:
        with ctx:
            run()
    else:
        run()
    bpy.ops.object.mode_set(mode='OBJECT')


def bake_group(J, size, kind, samples):
    """组 J 上按 'bake' UV 烘一张 kind 图，返回路径。kind: combined|normal|ao|rough|metal"""
    me = J.data
    me.uv_layers.active = me.uv_layers['bake']
    select_only(J)
    data = kind not in ('combined',)      # 数据图：Non-Color，不做视图变换
    img = bpy.data.images.new('%s_%s_%s' % (J.name, kind, TIER), size, size, float_buffer=True)
    if data:
        img.colorspace_settings.name = 'Non-Color'
    added = []
    for slot in J.material_slots:
        m = slot.material
        if m is None:
            continue
        nt = m.node_tree
        uvn = nt.nodes.new('ShaderNodeUVMap')
        uvn.uv_map = 'bake'
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = img
        nt.links.new(uvn.outputs[0], tn.inputs[0])
        nt.nodes.active = tn
        added.append((nt, uvn, tn))
    sc = bpy.context.scene
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    if kind == 'combined':
        # 场景级 use_pass_* + 不带 pass_filter 的调用（与 export_glb.py 同口径；
        # 5.2 下给 bake() 传 pass_filter 会烘出无光照的纯黑，2026-10-03 同一 .blend 对照实测）
        sc.render.bake.use_pass_direct = True
        sc.render.bake.use_pass_indirect = True
        for k in ('diffuse', 'glossy', 'transmission', 'emit'):
            setattr(sc.render.bake, 'use_pass_' + k, k in ('diffuse', 'emit'))
        bpy.ops.object.bake(type='COMBINED', use_clear=True, margin=4)
    elif kind == 'normal':
        bpy.ops.object.bake(type='NORMAL', use_clear=True, margin=4, normal_space='TANGENT')
    elif kind == 'ao':
        bpy.ops.object.bake(type='AO', use_clear=True, margin=4)
    else:
        bpy.ops.object.bake(type='EMIT', use_clear=True, margin=2)
    for nt, uvn, tn in added:
        nt.nodes.remove(uvn)
        nt.nodes.remove(tn)
    path = os.path.join(TEXDIR, '%s_%s_%s.png' % (J.name, kind, TIER))
    sc.render.image_settings.file_format = 'PNG'
    if kind == 'combined':
        img.save_render(path, scene=sc)   # AgX 视图变换，同旧管线（这就是查看器看到的成品色）
    else:
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()
    bpy.data.images.remove(img)
    return path


def emit_swap(nt_out_pairs, source):
    """把每个材质临时改成 Emission（值 = 真实的 Roughness / Metallic 输入），返回还原补丁表。
    存 socket 引用而不是 link 对象：链接 em→Surface 时原 link 立刻失效，拿它还原会把表面接空（烘出纯黑）。"""
    patches = []
    for nt, out, bsdf, _name in nt_out_pairs:
        surf = out.inputs['Surface']
        surf_src = surf.links[0].from_socket if surf.links else None
        sock = bsdf.inputs['Roughness'] if source == 'rough' else bsdf.inputs['Metallic']
        val_src = sock.links[0].from_socket if sock.links else None
        em = nt.nodes.new('ShaderNodeEmission')
        if val_src:
            nt.links.new(val_src, em.inputs['Color'])
        else:
            v = float(sock.default_value)
            em.inputs['Color'].default_value = (v, v, v, 1)
        nt.links.new(em.outputs[0], surf)
        patches.append((nt, em, surf_src, surf))
    return patches


def emit_restore(patches):
    for nt, em, surf_src, surf in patches:
        for l in [l for l in nt.links if l.to_socket == surf]:
            nt.links.remove(l)
        nt.nodes.remove(em)
        if surf_src:
            nt.links.new(surf_src, surf)


def material_pairs():
    """[(node_tree, active_output, principled, material_name)]，只收有 Principled 的材质。"""
    pairs = []
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if out and bsdf:
            pairs.append((nt, out, bsdf, m.name))
    return pairs


def flatten_materials():
    """烘基色前的口径（与 export_glb.py 相同）：金属 / 玻璃 / 光泽压成漫反射，玻璃色抬亮。"""
    for nt, out, bsdf, name in material_pairs():
        for fname, val in (('Metallic', 0.0), ('Transmission Weight', 0.0), ('Coat Weight', 0.0),
                           ('Specular IOR Level', 0.0), ('Sheen Weight', 0.0), ('Roughness', 1.0)):
            s = bsdf.inputs.get(fname)
            if s is None:
                continue
            for l in list(s.links):
                nt.links.remove(l)
            s.default_value = val
        if name.startswith(('stained', 'glass', 'res_glass', 'lantern_glass')):
            bc = bsdf.inputs['Base Color']
            for l in list(bc.links):
                nt.links.remove(l)
            bc.default_value = (0.16, 0.19, 0.24, 1) if not name.startswith('lantern') else (0.9, 0.7, 0.35, 1)
        if name.startswith('gold'):
            bsdf.inputs['Base Color'].default_value = (0.95, 0.66, 0.25, 1)


def assemble_orm(ao_path, rough_path, metal_path, out_path):
    import numpy as np
    imgs = [bpy.data.images.load(p) for p in (ao_path, rough_path, metal_path)]
    for im in imgs:
        im.colorspace_settings.name = 'Non-Color'
    w, h = imgs[0].size
    chans = []
    for im in imgs:
        buf = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(buf)
        chans.append(buf[0::4])
    for im in imgs:
        bpy.data.images.remove(im)
    orm = bpy.data.images.new('orm_%s' % os.path.basename(out_path), w, h, alpha=False)
    orm.colorspace_settings.name = 'Non-Color'
    buf = np.empty(w * h * 4, dtype=np.float32)
    buf[0::4], buf[1::4], buf[2::4], buf[3::4] = chans[0], chans[1], chans[2], 1.0
    orm.pixels.foreach_set(buf)
    orm.filepath_raw = out_path
    orm.file_format = 'PNG'
    orm.save()
    bpy.data.images.remove(orm)
    return out_path


def rebuild_display(J, base_path, norm_path=None, orm_path=None):
    """显示材质：基色 + 法线 + ORM（查看器只读基色；法线 / ORM 是给夜景烘焙与后续 PBR 用的数据）。"""
    me = J.data
    bm = bpy.data.materials.new('m_%s' % J.name)
    nt = bm.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(base_path)
    nt.links.new(t.outputs[0], p.inputs['Base Color'])
    if orm_path:
        o = nt.nodes.new('ShaderNodeTexImage')
        o.image = bpy.data.images.load(orm_path)
        o.image.colorspace_settings.name = 'Non-Color'
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(o.outputs[0], sep.inputs[0])
        nt.links.new(sep.outputs['Green'], p.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], p.inputs['Metallic'])
    if norm_path:
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = bpy.data.images.load(norm_path)
        n.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(n.outputs[0], nm.inputs['Color'])
        nt.links.new(nm.outputs[0], p.inputs['Normal'])
    me.materials.clear()
    me.materials.append(bm)
    for poly in me.polygons:
        poly.material_index = 0
    for l in [l for l in me.uv_layers if l.name != 'bake']:
        me.uv_layers.remove(l)


def main():
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    import tc_common
    global ARGS, TIER, OUT, TEXDIR, SAMPLES, LO_MB, HI_MB, BUDGET
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ARGS = dict(tier='std', out='/tmp/lm_budget_raw.glb', budget_json='', samples='32', log='', skip_data='0')
    for k, v in zip(argv[::2], argv[1::2]):
        ARGS[k.lstrip('-').replace('-', '_')] = v
    TIER = ARGS['tier']
    OUT = os.path.abspath(ARGS['out'])
    TEXDIR = os.path.splitext(OUT)[0] + '_tex'
    os.makedirs(TEXDIR, exist_ok=True)
    SAMPLES = int(ARGS['samples'])
    LO_MB = float(ARGS.get('fit_lo', 4.0 if TIER == 'std' else 0.0))
    HI_MB = float(ARGS.get('fit_hi', 8.0 if TIER == 'std' else 2.0))
    BUDGET = budget_table()

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    tc_common.pick_gpu(sc)
    for o in list(bpy.data.objects):
        if o.type == 'CAMERA' or o.name.startswith('bg_') or o.name.startswith('tuft') or o.hide_render:
            bpy.data.objects.remove(o, do_unlink=True)
    g = bpy.data.objects.get('ground')
    if g:
        for m in list(g.modifiers):
            if m.type == 'NODES':
                g.modifiers.remove(m)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and len(o.data.polygons)
              and not o.name.startswith('mist')]   # yuanyu_holy_mount 的体积雾体不导出（同旧 --glb 口径）
    ctx = v3d_context()
    src = {}
    for J in meshes:   # 阶段一：量源三角数（预算与贴图档位都按真实源几何定）
        select_only(J)
        src[J.name] = tris_of(J)
    floors = {k: [int(BUDGET.get(k, (0, 0))[0]), int(BUDGET.get(k, (0, 1024, 0))[1])] for k in src}
    tex, trib, est_mb = fit_tex_sizes(src, floors)
    info = {}
    for J in meshes:   # 阶段二：按预算减面 + 展 UV
        select_only(J)
        before = src[J.name]
        if before > trib[J.name]:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.remove_doubles(threshold=0.001)
            bpy.ops.object.mode_set(mode='OBJECT')
            d = J.modifiers.new('dec', 'DECIMATE')
            d.ratio = trib[J.name] / max(before, 1)
            d.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier='dec')
            # 若因大量独立碎面/建筑群导致折叠受阻（三角数仍 > 1.5 倍预算），按连通分量抽稀
            if tris_of(J) > trib[J.name] * 1.5:
                import bmesh
                bm = bmesh.new()
                bm.from_mesh(J.data)
                visited = set()
                islands = []
                for f in bm.faces:
                    if f not in visited:
                        isl = [f]
                        visited.add(f)
                        q = [f]
                        while q:
                            curr = q.pop()
                            for e in curr.edges:
                                for lf in e.link_faces:
                                    if lf not in visited:
                                        visited.add(lf)
                                        q.append(lf)
                                        isl.append(lf)
                        islands.append(isl)
                if len(islands) > 200:
                    step = max(2, int(round(tris_of(J) / max(trib[J.name], 1))))
                    del_faces = [f for i, isl in enumerate(islands) if i % step != 0 for f in isl]
                    bmesh.ops.delete(bm, geom=del_faces, context='FACES')
                    bm.to_mesh(J.data)
                    J.data.update()
                bm.free()
        smart_uv(J, ctx)
        info[J.name] = [before, tris_of(J), tex[J.name][0], tex[J.name][1]]
        log('UV %s %d -> %d (tex %d norm %d)' % (J.name, before, tris_of(J), tex[J.name][0], tex[J.name][1]))
    log('fit: est %.2f MB (band %.1f-%.1f)' % (est_mb, LO_MB, HI_MB))
    if TIER == 'std' and ARGS.get('skip_data') != '1':   # 阶段三（材质压平前）：法线 / 粗糙 / 金属，拿真实值
        for J in meshes:
            n_size = info[J.name][3]
            if n_size < 256:
                n_size = 256
            bake_group(J, n_size, 'normal', 1)
            pairs = material_pairs()
            patches = emit_swap(pairs, 'rough')
            bake_group(J, n_size, 'rough', 1)
            emit_restore(patches)
            patches = emit_swap(pairs, 'metal')
            bake_group(J, n_size, 'metal', 1)
            emit_restore(patches)
    flatten_materials()   # 阶段四：压平（同旧口径），只做一次
    for J in meshes:   # 阶段五：AO + 基色 + ORM 合成 + 显示材质
        n_size = max(256, int(info[J.name][3]))
        base_path = bake_group(J, info[J.name][2], 'combined', SAMPLES)
        norm_path = orm_path = None
        if TIER == 'std' and ARGS.get('skip_data') != '1':
            norm_path = os.path.join(TEXDIR, '%s_normal_%s.png' % (J.name, TIER))
            ao_path = bake_group(J, n_size, 'ao', 16)
            rough_path = os.path.join(TEXDIR, '%s_rough_%s.png' % (J.name, TIER))
            metal_path = os.path.join(TEXDIR, '%s_metal_%s.png' % (J.name, TIER))
            orm_path = os.path.join(TEXDIR, '%s_orm_%s.png' % (J.name, TIER))
            assemble_orm(ao_path, rough_path, metal_path, orm_path)
            os.remove(ao_path)
        rebuild_display(J, base_path, norm_path, orm_path)
        log('BAKED %s tex %d' % (J.name, info[J.name][2]))
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_normals=True, export_tangents=False,
                              export_materials='EXPORT', export_image_format='AUTO', export_apply=True,
                              export_lights=False, export_cameras=False)
    man = {'tier': TIER, 'groups': {k: dict(tris_src=v[0], tris=v[1], tex=v[2], tex_norm=v[3]) for k, v in info.items()},
           'tris': sum(v[1] for v in info.values()), 'bytes': os.path.getsize(OUT), 'est_mb': round(est_mb, 2)}
    with open(os.path.splitext(OUT)[0] + '.json', 'w') as f:
        json.dump(man, f, indent=1)
    log('WROTE %s (%.2f MB, %d tris)' % (OUT, man['bytes'] / 1048576.0, man['tris']))


try:
    main()
except Exception:
    msg = traceback.format_exc()
    if ARGS['log']:
        with open(ARGS['log'], 'w') as f:
            f.write(msg)
    print(msg)
    raise
