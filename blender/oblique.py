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


def underside(B, e, U_, seed=0):
    """按岛表 underside 规格生成岛底（设定 v3 §9.4）：profile 决定收分形状，rock / cliff / depth / 副锥 / 垂根 / 晶簇 / 核心 / 符文环各自取数。
    profile：multi 主锥 + 副锥 | shallow 浅锥 | piers 沿长轴一排桥墩锥 | twin 新月两臂各一锥 | stepped 阶梯收分 | cone 单粗锥
             broken 断尖锥 | jagged 多根黑色尖刺 | plinth 倒金字塔岩座"""
    rnd = random.Random(seed); k = U_['profile']
    m_rock = LC.flat(f'ob_rock_{e.id}', tuple(U_['rock']), .9, noise=.35)
    m_band = LC.flat(f'ob_band_{e.id}', tuple(c * .8 for c in U_['rock']), .9, noise=.5)
    m_glow = LC.glow(f'ob_core_{e.id}', c=tuple(U_['core_c']), estr=U_['core_e']) if U_['cores'] else None
    m_ring = LC.glow(f'ob_ring_{e.id}', c=tuple(U_['core_c']), estr=U_['core_e'] * .5) if U_['rune'] else None
    m_cry = LC.flat(f'ob_cry_{e.id}', (.5, .85, 1.0) if k != 'jagged' else (.55, .65, 1.0), .1, emit=tuple(U_['core_c']), estr=3.0 if k != 'jagged' else 1.5)
    R = max(e.rx, e.ry); D = U_['depth'] * R; cliff = U_['cliff'] * min(1.0, R)
    P = e.outline_world(1.0, 72); n = len(P); cx, cy = e.x, e.y; z0 = e.z - .004
    shrink = {'plinth': .96, 'stepped': .95}.get(k, .92)
    r1 = [(cx + (x - cx) * shrink, cy + (y - cy) * shrink) for x, y in P]
    vs = [(x, y, z0) for x, y in P] + [(x, y, z0 - cliff) for x, y in r1]
    B.poly(vs, [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)], m_band)          # 崖壁带（层理色更深）
    zb = z0 - cliff
    def cone_from(ring, zt, tip, m):
        m_ = len(ring); v2 = [(x, y, zt) for x, y in ring] + [tip]
        B.poly(v2, [(i, m_, (i + 1) % m_) for i in range(m_)], m)
    ax = math.atan2(e.ry, e.rx) if False else e.rot
    if k in ('multi', 'shallow', 'cone', 'broken'):
        tip = (cx, cy, zb - D)
        if k == 'broken':                                            # 断尖：锥在 70 % 处截平
            ring2 = [(cx + (x - cx) * .3, cy + (y - cy) * .3) for x, y in r1]; z2 = zb - D * .7
            v2 = [(x, y, zb) for x, y in r1] + [(x, y, z2) for x, y in ring2]
            B.poly(v2, [(i, n + i, n + (i + 1) % n, (i + 1) % n)[::-1] for i in range(n)], m_rock); B.poly([(x, y, z2) for x, y in ring2], [tuple(range(n))], m_band)
        else: cone_from(r1, zb, tip, m_rock)
    elif k == 'stepped':                                             # 阶梯收分（人工修整）
        zt, ring = zb, r1
        for j, f in enumerate((.8, .6, .4, .2)):
            ring2 = [(cx + (x - cx) * f, cy + (y - cy) * f) for x, y in r1]; zt2 = zt - D * .18
            B.poly([(x, y, zt) for x, y in ring] + [(x, y, zt2) for x, y in ring], [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)], m_rock if j % 2 else m_band)
            B.poly([(x, y, zt2) for x, y in ring] + [(x, y, zt2) for x, y in ring2], [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)], m_rock)
            zt, ring = zt2, ring2
        cone_from(ring, zt, (cx, cy, zt - D * .15), m_rock)
    elif k == 'plinth':                                              # 倒金字塔岩座
        c_, s_ = math.cos(e.rot), math.sin(e.rot); A, Bb = e.rx * .95, e.ry * .95
        sq = [(cx + c_ * u - s_ * v, cy + s_ * u + c_ * v) for u, v in ((-A, -Bb), (A, -Bb), (A, Bb), (-A, Bb))]
        B.poly([(x, y, zb) for x, y in sq] + [(cx, cy, zb - D)], [(i, 4, (i + 1) % 4) for i in range(4)] + [(3, 2, 1, 0)], m_rock)
    elif k == 'piers':                                               # 长脊下一排三根桥墩锥
        cone_from(r1, zb, (cx, cy, zb - D * .35), m_band)
        for f in (-.6, 0, .6):
            px_, py_ = e.world(e.rx * f, 0); B.cyl(px_, py_, zb - D * .35 - D * .65, e.ry * .45, D * .65, m_rock, 10, r2=e.ry * .6, smooth=False)
    elif k == 'twin':                                                # 新月两臂各一锥 + 湾下悬清水倒锥
        cone_from(r1, zb, (cx, cy, zb - D * .3), m_band)
        for a in (.9, -.9):
            px_, py_ = e.world(math.cos(a + math.pi) * e.rx * .5, math.sin(a + math.pi) * e.ry * .5)
            B.cyl(px_, py_, zb - D, R * .32, D * .75, m_rock, 12, r2=R * .45, smooth=False)
        if U_.get('water_cone'):
            wm = LC.glass('ob_water_cone', tint=(.2, .45, .55), rough=.05); px_, py_ = e.world(e.rx * .45, 0)
            B.cyl(px_, py_, zb - D * .8, R * .12, D * .45, wm, 16, r2=R * .22)
    elif k == 'jagged':                                              # 多根不规则黑色尖刺
        cone_from(r1, zb, (cx, cy, zb - D * .45), m_rock)
        for j in range(U_['n_sub'] + 4):
            i = rnd.randrange(n); x, y = r1[i]; f = rnd.uniform(.25, .8); bx, by = cx + (x - cx) * f, cy + (y - cy) * f
            L_ = D * rnd.uniform(.5, 1.1); B.cyl(bx, by, zb - L_, R * rnd.uniform(.08, .16), L_, m_rock, 5, r2=0.0, smooth=False)
    if k in ('multi', 'cone', 'shallow'):
        for j in range(U_['n_sub']):
            i = rnd.randrange(n); x, y = r1[i]; bx, by = cx + (x - cx) * .55, cy + (y - cy) * .55
            B.cyl(bx, by, zb - D * .5, D * .18, D * .5, m_rock, 9, r2=0.0, smooth=False)
    if U_['cores']:                                                  # 核心：均布在主锥中段；符文环两圈
        zc = zb - D * .35
        for j in range(U_['cores']):
            a = j * math.tau / U_['cores'] + .3; d_ = 0 if U_['cores'] == 1 else R * .3
            x, y = cx + math.cos(a) * d_, cy + math.sin(a) * d_; rc = max(.03, R * .06)
            B.sphere(x, y, zc, rc, m_glow, seg=16, rings=8)
            if m_ring:
                for q, rr in enumerate((rc * 2.0 * U_['rune'], rc * 2.8 * U_['rune'])): B.cyl(x, y, zc + q * rc * .5, rr, rc * .1, m_ring, 40, r2=rr, cap=False)
    for j in range(U_['crystals']):
        i = rnd.randrange(n); x, y = r1[i]
        LC.crystal_cluster(B, cx + (x - cx) * .75, cy + (y - cy) * .75, zb - D * .1, R * rnd.uniform(.08, .14), m_cry, seed=seed * 7 + j, down=True)
    if U_['roots']:                                                  # 垂根 / 藤蔓：崖缘下的细线
        m_root = LC.flat(f'ob_root_{e.id}', (.16, .2, .09), .9, noise=.4)
        for j in range(30):
            i = rnd.randrange(n); x, y = P[i]; L_ = rnd.uniform(.06, .2)
            B.tube([(x, y, z0), (x + rnd.uniform(-.01, .01), y + rnd.uniform(-.01, .01), z0 - L_)], .004, m_root, n=4)
    if U_.get('beam'):                                               # 精英学院：以太修习圆庭的光柱穿出岛底
        B.cyl(cx, cy, zb - D * 1.6, R * .05, D * 1.6, LC.glow('ob_beam', estr=3.0, alpha=.5), 16)


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


def cloud_sheet(col, z, cover, name, extent, alpha=.6):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    out = next(x for x in N if x.type == 'OUTPUT_MATERIAL')
    for x in list(N):
        if x.type != 'OUTPUT_MATERIAL': N.remove(x)
    tc_ = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = extent / 3.5; nz.inputs['Detail'].default_value = 8   # 对象坐标 −.5–.5：按铺开尺寸换算，云团约 350 m
    nz.inputs['Roughness'].default_value = .6; L.new(tc_.outputs['Object'], nz.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .62 - cover * .5; mr.inputs['From Max'].default_value = .75 - cover * .3
    mr.inputs['To Max'].default_value = alpha; L.new(nz.outputs['Fac'], mr.inputs['Value'])
    df = N.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (.92, .93, .96, 1)
    n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = extent / 1.2; n2.inputs['Detail'].default_value = 6; L.new(tc_.outputs['Object'], n2.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (.66, .7, .78, 1); ramp.color_ramp.elements[1].color = (.98, .985, 1.0, 1)
    ramp.color_ramp.elements[0].position = .3; ramp.color_ramp.elements[1].position = .7
    mxc = N.new('ShaderNodeMath'); mxc.operation = 'MULTIPLY_ADD'; mxc.inputs[1].default_value = .5; L.new(n2.outputs['Fac'], mxc.inputs[0]); L.new(nz.outputs['Fac'], mxc.inputs[2])
    L.new(mxc.outputs[0], ramp.inputs['Fac'])                   # 云团：亮顶 + 灰蓝云谷，假体积（只自发光，不接收影子）
    em = N.new('ShaderNodeEmission'); L.new(ramp.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = 1.0
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
    tc.setup_render_device(layer.sc)     # 渲染守卫：显式走唯一入口（camera_and_render 内部也会调，幂等；静态检查要求本文件出现这个调用）
    tc.camera_and_render(layer.sc, layer.res, layer.samples, layer.out, layer.opt)
    sc = layer.sc; col = bpy.data.collections.new('oblique'); sc.collection.children.link(col)
    fl = bpy.data.objects.get('white_floor')
    mid = os.environ.get('TC_MID_TEX')
    if fl and mid and os.path.exists(mid):                           # v15：云海底下是中层城市（云隙里透出，压在雾里；设定 §9.1）
        fl.hide_render = True
        im_ = bpy.data.images.load(mid); cm_ = bpy.data.materials.new('ob_city'); cm_.use_nodes = True; nt_ = cm_.node_tree
        for x in list(nt_.nodes):
            if x.type != 'OUTPUT_MATERIAL': nt_.nodes.remove(x)
        tc2 = nt_.nodes.new('ShaderNodeTexCoord'); tx = nt_.nodes.new('ShaderNodeTexImage'); tx.image = im_; tx.extension = 'MIRROR'
        mp = nt_.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 1, 1); nt_.links.new(tc2.outputs['UV'], mp.inputs['Vector']); nt_.links.new(mp.outputs[0], tx.inputs['Vector'])
        mixc = nt_.nodes.new('ShaderNodeMixRGB'); mixc.inputs['Fac'].default_value = .42; mixc.inputs['Color2'].default_value = (.62, .68, .78, 1)
        nt_.links.new(tx.outputs['Color'], mixc.inputs['Color1'])
        em_ = nt_.nodes.new('ShaderNodeEmission'); em_.inputs['Strength'].default_value = .9; nt_.links.new(mixc.outputs[0], em_.inputs['Color'])
        nt_.links.new(em_.outputs[0], next(x for x in nt_.nodes if x.type == 'OUTPUT_MATERIAL').inputs['Surface'])
        bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0)); cf = bpy.context.active_object; cf.name = 'city_below'
        cf.scale = (30 * 3, 18.75 * 3, 1); cf.data.materials.append(cm_); cf.visible_shadow = False
        for poly in cf.data.polygons: pass
        uv = cf.data.uv_layers.active.data
        for li, lp in enumerate(cf.data.loops): uv[li].uv = (uv[li].uv[0] * 3 - 1, uv[li].uv[1] * 3 - 1)   # 中层整图对齐上层画幅（3 倍铺开，镜像延伸）
        cloud_sheet(col, .55, .55, 'sheet_sea', 90, alpha=.92)       # 云海：覆盖约 70 %，云隙里看到城市
    elif fl:
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
        e = i['isle']; U_ = e.d.get('underside')
        if U_: underside(B, e, U_, seed=k + 3)
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
    for iid, i in by.items():                                         # 水：岛表 underside.falls（kind：main / thin / curtain / dry）
        e = i['isle']
        for f in (e.d.get('underside') or {}).get('falls', []):
            ang = math.radians(f['ang']); rr = e.r(ang - e.rot) * .99; x, y = e.x + math.cos(ang) * rr, e.y + math.sin(ang) * rr
            if f['kind'] == 'dry':
                LC.Batch('ob_dry').strip([(x, y, e.z - .01), (x + math.cos(ang) * .03, y + math.sin(ang) * .03, e.z - f['L'])], f['w'], .01, LC.flat('ob_moss', (.1, .11, .08), .95)); LC.Batch.build_all()
            else:
                waterfall(col, x, y, e.z - .03, ang, f['w'], f['L'], fm if f['kind'] == 'main' else fm2, mist, f'fall_{iid}')
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
    if tower: pts.append([tower[0] * U, tower[1] * U, 1560.0])          # 塔冠也要进画框
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
