"""斜视主地图（view: oblique，docs/design/depth-system.md §8；设定 docs/upper-setting.md v3 §9）。层无关：只读该层的 depth 配置与岛表。
由层脚本（目前 tiancheng_upper.py，TC_OBLIQUE=1）在建好岛体之后调用 finish()，替代正交俯视的 layer.finish：
  1. 岛底：崖壁 + 收尖倒锥 + 副锥 + 以太悬浮核心 / 符文环 + 向下晶簇（landmarks/common.py 部件）
  2. 三维模型：按 TC_MODELS（json：岛 id → {blend, origin:[x, y]}）追加 .blend，放到岛面，乘纵深 scale
  3. 水：瀑布帘 + 水雾（设定 §9.3）；干瀑槽
  4. 三张高度层云片（真三维，只挡在它下面的岛）；不投影
  5. 相机：project.fit_camera（焦点 / 画框 / 俯角来自 view.camera）；成图旁写 meta（相机 dict、每岛三维锚点与投影多边形），前端 / 三维模式 / 合成都只读它
TC_OBLIQUE_GREY=1：灰模构图测试（不追加模型、材质统一灰）。
"""
import json, math, os, random, sys
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import project as PJ
import depth as DP
import importlib.util as _ilu
_sp = _ilu.spec_from_file_location('lm_common', os.path.join(HERE, 'landmarks', 'common.py')); LC = _ilu.module_from_spec(_sp); _sp.loader.exec_module(LC)

U = 100.0                                          # 岛表单位 = 100 m
to_m = lambda X, Y, Z: [X * U, Y * U, Z * U + 700.0]   # 场景（100 m，z 0 = 700 m）→ 米制世界


def underside(B, e, depth_u, m_rock, m_glow, m_ring, m_cry, n_sub=2, seed=0):
    """崖壁 + 主倒锥 + 副锥；核心嵌在主锥中段"""
    rnd = random.Random(seed)
    P = e.outline_world(1.0, 72); n = len(P); cx, cy = e.x, e.y; z0 = e.z - .004
    cliff = min(.45, .18 + depth_u * .15)
    r1 = [(cx + (x - cx) * .93, cy + (y - cy) * .93) for x, y in P]
    vs = [(x, y, z0) for x, y in P] + [(x, y, z0 - cliff) for x, y in r1] + [(cx, cy, z0 - depth_u)]
    fs = [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)] + [(n + i, 2 * n, n + (i + 1) % n) for i in range(n)]
    B.poly(vs, fs, m_rock)
    for k in range(n_sub):                          # 副锥：从崖底斜挂出去
        i = rnd.randrange(n); x, y = r1[i]; bx, by = cx + (x - cx) * .55, cy + (y - cy) * .55
        B.cyl(bx, by, z0 - cliff - depth_u * .45, depth_u * .18, depth_u * .45, m_rock, 9, r2=0.0, smooth=False)
        B.cyl(bx, by, z0 - cliff - depth_u * .45, depth_u * .18, 0.001, m_rock, 9)
    zc = z0 - cliff - depth_u * .35; rc = max(.05, depth_u * .09)
    B.sphere(cx, cy, zc, rc, m_glow, seg=16, rings=8)
    for j, rr in enumerate((rc * 2.2, rc * 3.0)):
        B.cyl(cx, cy, zc - rc * .1 + j * rc * .5, rr, rc * .12, m_ring, 48, r2=rr, cap=False)
    for k in range(6):
        i = rnd.randrange(n); x, y = r1[i]
        LC.crystal_cluster(B, cx + (x - cx) * .7, cy + (y - cy) * .7, z0 - cliff - depth_u * .1, depth_u * rnd.uniform(.08, .14), m_cry, seed=seed * 7 + k, down=True)


def fall_mat(name, strength=1.2, alpha=.85):
    """瀑布：白色自发光 + 沿本地 z 往下渐隐（生成坐标 z：顶 1 → 底 0）"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    out = next(x for x in N if x.type == 'OUTPUT_MATERIAL')
    for x in list(N):
        if x.type != 'OUTPUT_MATERIAL': N.remove(x)
    tc_ = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc_.outputs['Generated'], sep.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 18; L.new(tc_.outputs['Generated'], nz.inputs['Vector'])
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; L.new(sep.outputs['Z'], mu.inputs[0]); L.new(nz.outputs['Fac'], mu.inputs[1])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .05; mr.inputs['From Max'].default_value = .5
    mr.inputs['To Max'].default_value = alpha; L.new(mu.outputs[0], mr.inputs['Value'])
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (.93, .96, 1, 1); em.inputs['Strength'].default_value = strength
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    L.new(mr.outputs['Result'], mx.inputs['Fac']); L.new(tr.outputs[0], mx.inputs[1]); L.new(em.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], out.inputs['Surface'])
    if hasattr(m, 'blend_method'): m.blend_method = 'BLEND'
    return m


def waterfall(col, x, y, z, ang, width, length, mat, mist_mat, name):
    """崖缘 (x, y, z) 处朝 ang 方向坠落：略外弧的竖直帘 + 底部水雾团"""
    me = bpy.data.meshes.new(name); n = 10; vs, fs = [], []
    ux, uy = math.cos(ang), math.sin(ang); px, py = -uy, ux
    for i in range(n + 1):
        t = i / n; out = .06 * length * math.sin(t * math.pi / 2)
        for s in (-1, 1): vs.append((x + ux * out + px * s * width / 2 * (1 + t * .6), y + uy * out + py * s * width / 2 * (1 + t * .6), z - t * length))
    for i in range(n): fs.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    me.from_pydata(vs, [], fs); ob = bpy.data.objects.new(name, me); col.objects.link(ob); me.materials.append(mat); ob.visible_shadow = False
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=width * 1.6, location=(x + ux * .06 * length, y + uy * .06 * length, z - length * .95))
    mo = bpy.context.active_object; mo.name = name + '_mist'; mo.scale = (1.6, 1.6, .6); mo.data.materials.append(mist_mat); mo.visible_shadow = False
    return ob


def cloud_sheet(col, z, cover, name, extent):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    out = next(x for x in N if x.type == 'OUTPUT_MATERIAL')
    for x in list(N):
        if x.type != 'OUTPUT_MATERIAL': N.remove(x)
    tc_ = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .35; nz.inputs['Detail'].default_value = 8
    nz.inputs['Roughness'].default_value = .6; L.new(tc_.outputs['Object'], nz.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .62 - cover * .5; mr.inputs['From Max'].default_value = .75 - cover * .3
    mr.inputs['To Max'].default_value = .6; L.new(nz.outputs['Fac'], mr.inputs['Value'])
    df = N.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (.92, .93, .96, 1)
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (.93, .945, .965, 1); em.inputs['Strength'].default_value = 1.0
    ad = em                                                 # 只自发光：云片不接收岛影（用户硬规定）
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    L.new(mr.outputs['Result'], mx.inputs['Fac']); L.new(tr.outputs[0], mx.inputs[1]); L.new(ad.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], out.inputs['Surface'])
    if hasattr(m, 'blend_method'): m.blend_method = 'BLEND'
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, z)); o = bpy.context.active_object; o.name = name; o.scale = (extent, extent, 1)
    o.data.materials.append(m); o.visible_shadow = False; col.objects.link(o) if o.name not in col.objects else None
    return o


def append_model(col, blend, origin, X, Y, Z, s, skip=('bg_', 'cam', 'sun', 'white_floor', 'white_lip', 'cloud', 'sky')):
    with bpy.data.libraries.load(blend, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if not any(n.lower().startswith(p) for p in skip)]
    root = bpy.data.objects.new('model_' + os.path.basename(blend), None); col.objects.link(root)
    root.location = (X - origin[0] / U * s, Y - origin[1] / U * s, Z); root.scale = (s / U, s / U, s / U)
    for o in dst.objects:
        if o is None or o.type in ('CAMERA', 'LIGHT'): continue
        col.objects.link(o)
        if o.parent is None: o.parent = root
    return root


def finish(layer, islands, sun, world, tower=None, cfg=None):
    cfg = cfg or DP.load(); view = cfg['view']; vc = view['camera']; grey = bool(os.environ.get('TC_OBLIQUE_GREY'))
    import tc_common as tc
    tc.camera_and_render(layer.sc, layer.res, layer.samples, layer.out, layer.opt)
    sc = layer.sc; col = bpy.data.collections.new('oblique'); sc.collection.children.link(col)
    fl = bpy.data.objects.get('white_floor')
    if fl:
        fl.scale = (fl.scale[0] * 4, fl.scale[1] * 4, 1)          # 斜视看得到画框外：云海底铺远
        fm_ = bpy.data.materials.new('ob_floor'); fm_.use_nodes = True; nt_ = fm_.node_tree
        for x in list(nt_.nodes):
            if x.type != 'OUTPUT_MATERIAL': nt_.nodes.remove(x)
        em_ = nt_.nodes.new('ShaderNodeEmission'); em_.inputs['Color'].default_value = (.93, .945, .965, 1); em_.inputs['Strength'].default_value = 1.0
        nt_.links.new(em_.outputs[0], next(x for x in nt_.nodes if x.type == 'OUTPUT_MATERIAL').inputs['Surface'])
        fl.data.materials.clear(); fl.data.materials.append(fm_)      # 纯自发光云底：不接收任何影子（无岛影，用户硬规定）
    B = LC.Batch('ob_under')
    m_rock = LC.flat('ob_rock', (.34, .31, .28), .9, noise=.35); m_glow = LC.glow('ob_core', estr=9.0)
    m_ring = LC.glow('ob_ring', estr=5.0); m_cry = LC.flat('ob_cry', (.5, .85, 1.0), .1, emit=LC.AETHER_C, estr=3.0)
    CH = {i['id']: DP.island(i['id'], cfg) for i in islands if i['id'] in cfg['islands']}
    for k, i in enumerate(islands):
        e = i['isle']
        dep = (1.1 if i['id'] != 'silver_crown' else .8) * max(e.rx, e.ry) * (.55 if i['id'] == 'eden' else 1)
        underside(B, e, dep, m_rock, m_glow, m_ring, m_cry, n_sub=3 if i['id'] == 'isle5' else 2, seed=k + 3)
    for o in LC.Batch.build_all(): pass
    models = json.loads(os.environ.get('TC_MODELS', '{}')) if not grey else {}
    by = {i['id']: i for i in islands}
    for iid, spec in models.items():
        if iid not in by: continue
        e = by[iid]['isle']; s = CH.get(iid, {}).get('scale', 1.0) if iid != 'eden' else CH['eden']['scale']
        zt = e.z if iid == 'eden' else e.Z(0.0, 0.0) + .003
        append_model(col, spec['blend'], spec.get('origin', [0, 0]), e.x, e.y, zt, s * spec.get('model_scale', 1.0))
    # 水（设定 §9.3）：伊甸东崖主瀑 + 两道细瀑；罗斯柴尔德湾内小帘瀑（小、远，不抢戏）；凯莉细溪瀑；维克多干瀑槽
    fm, fm2, mist = fall_mat('ob_fall', 1.3, .9), fall_mat('ob_fall_thin', 1.0, .6), LC.glow('ob_mist', c=(.95, .97, 1.0), estr=.3, alpha=.12)
    if 'eden' in by:
        e = by['eden']['isle']; ex = e.x + e.rx * .98
        for da, w, L_, m_ in ((0.0, .14, 2.4, fm), (-.12, .04, 1.7, fm2), (.1, .035, 1.6, fm2)):   # 东南崖（东侧沟谷的出口），朝向相机
            ang = math.radians(-40) + da; rr = e.r(ang - e.rot) * .99
            waterfall(col, e.x + math.cos(ang) * rr, e.y + math.sin(ang) * rr, e.z - .05, ang, w, L_, m_, mist, 'fall_eden')
    if 'isle30' in by:
        e = by['isle30']['isle']; s = CH['isle30']['scale']; ang = e.d.get('silhouette', {}).get('dir', 0.0) + e.rot
        waterfall(col, e.x + math.cos(ang) * e.r(0.0) * .5, e.y + math.sin(ang) * e.r(0.0) * .5, e.z - .02, ang, .12, .9, fm2, mist, 'fall_roth')
    if 'isle10' in by:
        e = by['isle10']['isle']; waterfall(col, e.x - e.rx * .98, e.y, e.z - .02, math.pi, .025, .9, fm2, mist, 'fall_kelly')
    if 'isle4' in by:                                            # 干瀑槽：崖面上一道深色苔痕
        e = by['isle4']['isle']; D = LC.Batch('ob_dry')
        D.strip([(e.x + e.rx * .99, e.y, e.z - .01), (e.x + e.rx * 1.02, e.y, e.z - .5)], .06, .01, LC.flat('ob_moss', (.12, .13, .09), .95))
        LC.Batch.build_all()
    # 云片（真三维，按高度只挡更低的岛）
    for c in ([] if grey else cfg.get('cloud_sheets', [])):
        cloud_sheet(col, (c['alt'] - 700) / U, c.get('cover', .2), 'sheet_' + c['id'], 60)
    if grey:
        gm = bpy.data.materials.new('grey'); gm.use_nodes = True
        bpy.context.view_layer.material_override = gm
    # 相机
    pts, polys = [], {}
    for i in islands:
        e = i['isle']; s = 1.0                                # 岛表尺寸已在层脚本里乘过纵深 scale
        cx, cy = e.x, e.y
        ring = [((cx + (x - cx) * s), (cy + (y - cy) * s)) for x, y in e.outline_world(1.0, 48)]
        dep = (1.1 if i['id'] != 'silver_crown' else .8) * max(e.rx, e.ry) * s
        top = [to_m(x, y, e.z) for x, y in ring]; tip = to_m(cx, cy, e.z - dep)
        polys[i['id']] = dict(top=top, tip=tip); pts += top + [tip]
    alt = lambda iid: cfg['islands'][iid]['alt']
    focus = [by[vc['focus']]['x'] * U, by[vc['focus']]['y'] * U, alt(vc['focus'])] if vc.get('focus') in by else [0, 0, 1000]
    aspect = vc.get('aspect', 1.6)
    cam = PJ.fit_camera(view, focus, pts, aspect)
    res = layer.res; sc.render.resolution_x = res; sc.render.resolution_y = int(round(res / aspect))
    cd = bpy.data.cameras.new('ob_cam'); cd.lens = vc['lens_mm']; cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = vc.get('sensor_mm', 36.0)
    cd.clip_start = .1; cd.clip_end = 5000
    co = bpy.data.objects.new('ob_cam', cd); sc.collection.objects.link(co); sc.camera = co
    R, Up, F = Vector(cam['right']), Vector(cam['up']), Vector(cam['fwd'])
    co.matrix_world = Matrix(((R.x, Up.x, -F.x, cam['pos'][0] / U), (R.y, Up.y, -F.y, cam['pos'][1] / U), (R.z, Up.z, -F.z, (cam['pos'][2] - 700) / U), (0, 0, 0, 1)))
    # meta：相机（唯一来源）+ 每岛三维锚点 / 投影多边形（合成、标注、前端都读）
    meta = dict(view=view, camera=cam, width=res, height=sc.render.resolution_y, depth_hash=None, islands={})
    for i in islands:
        iid = i['id']
        if iid not in cfg['islands']: continue
        a = [i['x'] * U, i['y'] * U, alt(iid) + view.get('anchor_dz_m', 20)]
        p = polys[iid]; meta['islands'][iid] = dict(marker=i['isle'].d.get('marker', iid), anchor=a, anchor_uv=PJ.project(a, cam),
                                                    poly_uv=[PJ.project(q, cam)[:2] for q in p['top']], tip_uv=PJ.project(p['tip'], cam)[:2],
                                                    depth=PJ.project([i['x'] * U, i['y'] * U, alt(iid)], cam)[2])
    import hashlib
    meta['depth_hash'] = hashlib.sha256(open(os.path.join(HERE, '..', 'map', 'data', 'upper_depth.json'), 'rb').read()).hexdigest()[:16]
    json.dump(meta, open(layer.out + '.meta.json', 'w'), ensure_ascii=False, indent=1)
    w = bpy.data.worlds.new('sky'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (.72, .79, .88, 1); bg.inputs['Strength'].default_value = .9
    sc.render.filepath = layer.out; sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True); print('WROTE', layer.out)
