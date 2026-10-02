"""上层斜视成图（D41 批 1；设定 docs/tiancheng-maps.md §0，相机文件格式见附录 OBLIQUE-CODE B）。
米制世界坐标：原点在中心柱中心，x 东、y 北、z 海拔（米）。一个场景：
  伊甸 = estate2（与上层俯视底图同一座 r5 庄园）+ 岛底三颗以太核心与符文环 + 停靠信标与进场光带（伊甸没有结界边）；
  卡内其余八岛 = blender/islands/<id>.py 的岛资产（岛面、岛底、核心、水、停靠、结界）；以太气候调节塔（塔身从本层下限 800 m 起）；
  三张高度层云片 c1–c3（半透明，按云密度给 alpha）。没有云海底、没有城市：胶片透明，查看器把中层同时段斜视图合成在下面（D40）。
共用正交相机：blender/project.py OBLIQUE（方位 165°、俯角 35°、0.44 m/px），画框按本层内容拟合并补齐 16 : 10。
时段（--tod）：晨 / 昼 / 昏 / 夜；夜里只有很弱的冷月光，亮的都是真实光源（窗、园灯、信标、核心、晶簇、结界弧、塔冠）。
用法（经 tools/render_queue.sh 提交）：
  blender -b --factory-startup --python blender/upper_oblique.py -- --tod day --res 7920 --samples 128 \
      --out logs/campaign/full/tc_upper_obl_day_full.png [--eden-out <插图.png>] [--eden-res 0] [--grey 1]
  --res：主图像素宽；小于定稿宽（相机文件里的 px）时是同一画框的低分辨率草图，相机文件不变。
  --eden-out：同一场景再渲伊甸插图（同朝向，伊甸投影包围盒外扩 10 %，0.22 m/px，左上角落在主图像素网格上）；--eden-res 同理可出草图。
每张成图旁写 <out>.meta.json（相机文件 + 每岛锚点 / 投影多边形 / 深度）；tools/oblique_post.py --ortho 做遮挡、相机文件发布与自检。
"""
import json, math, os, random, sys, time
import bpy
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
for _p in (os.path.join(HERE, 'landmarks'), os.path.join(HERE, 'islands'), HERE):
    if _p not in sys.path: sys.path.insert(0, _p)
import tc_common as tc
import project as PJ
import depth as DP
import oblique as OB

EDEN_ARGS = ('--tod', '--res', '--samples', '--out', '--eden-out', '--eden-res', '--grey', '--noise', '--density', '--exr')   # --exr 1：夜检（灯光对象位置写进 meta，另出 <out>_emit.png 源图）
T0 = time.time()
def tick(msg): print(f'[upper_oblique {time.time() - T0:6.1f}s] {msg}', flush=True)


def opts():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = dict(tod='day', res='0', samples='16', out='/tmp/upper_obl.png', grey='0', noise='.012', density='1.0')
    o['eden-out'] = ''; o['eden-res'] = '0'; o['exr'] = '0'
    for k, v in zip(a[::2], a[1::2]):
        if k not in EDEN_ARGS: raise SystemExit(f'unknown arg {k}')
        o[k[2:]] = v
    return o


CARD = ['isle10', 'isle6', 'isle30', 'isle25', 'isle9', 'isle4', 'isle5', 'silver_crown']
TIER = (800.0, 1500.0)                       # 上层高度范围（L32）
COLUMN = (1500.0, 937.5)                      # 中心柱半宽 / 半高（3000 × 1875 m）
Z_C = 1150.0                                  # 画框中心取在本层中部的海拔
# 时段：太阳高度 °、太阳色、太阳能量、天空强度、云顶色、云谷色、云亮度、窗灯比例、窗灯强度、园灯、曝光
PERIODS = {
    'day':   dict(el=50, sun=(1.0, .96, .9), e=3.4, sky=.22, top=(.98, .985, 1.0), val=(.62, .67, .76), cl=.95, win=0.0, ws=0.0, lamps=False, exp=-.5, water=1.0, ward=.6),
    'dawn':  dict(el=11, sun=(1.0, .72, .46), e=5.2, sky=.16, top=(1.0, .84, .66), val=(.42, .47, .6), cl=.75, win=.12, ws=4.0, lamps=False, exp=0.0, water=.6, ward=.5),
    'dusk':  dict(el=6, sun=(1.0, .5, .24), e=6.0, sky=.14, top=(1.0, .66, .46), val=(.3, .29, .4), cl=.6, win=.45, ws=5.0, lamps=False, exp=0.0, water=.45, ward=.45),
    'night': dict(el=50, sun=(.62, .72, 1.0), e=.06, sky=0.0, top=(.05, .06, .09), val=(.012, .015, .03), cl=1.0, win=.7, ws=7.0, lamps=True, exp=0.0, water=.05, ward=.3),
}


# ---------------------------------------------------------------- 场景搭建
def new_root(name, loc):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e); e.location = loc
    return e


def adopt(before, rt):
    """搭建期间新建的对象都挂到 rt 下（只平移：对象坐标与原搭建坐标相同）。"""
    new = [o for o in bpy.data.objects if o.name not in before and o is not rt]
    for o in new:
        if o.parent is None: o.parent = rt
    return new


def position_to_object(objs):
    """平移后 World Position 会变：材质里取 Geometry.Position 的地方改取对象坐标（estate2 地形按湖面标高压暗湖底）。"""
    seen = set()
    for o in objs:
        for s in getattr(o, 'material_slots', []):
            m = s.material
            if not m or not m.use_nodes or m.name in seen: continue
            seen.add(m.name); nt = m.node_tree
            for lk in [l for l in nt.links if l.from_node.type == 'NEW_GEOMETRY' and l.from_socket.name == 'Position']:
                tcn = nt.nodes.new('ShaderNodeTexCoord'); to = lk.to_socket; nt.links.remove(lk); nt.links.new(tcn.outputs['Object'], to)


def build_eden(alt, density):
    from estate2 import terrain, buildings, vegetation, sketchfab, waterworks
    from estate2.common import coll
    before = {o.name for o in bpy.data.objects}
    terrain.build_island(res_m=0.6); terrain.build_lake(); buildings.build_all(); waterworks.build(coll('waterworks'))
    M = buildings.mats(); tropic = sketchfab.build(M['plain'], M['wallstone']); vegetation.build(density, tropic_protos=tropic)
    rt = new_root('eden_root', (0.0, 0.0, alt)); objs = adopt(before, rt); position_to_object(objs)
    tick(f'eden (estate2) {len(objs)} objects')
    return rt


def load_island(iid):
    import importlib.util
    sp = importlib.util.spec_from_file_location('isl_' + iid, os.path.join(HERE, 'islands', iid + '.py'))
    m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m


def build_card(iid, x, y, alt, k):
    import _kit as K_, upper_estates as UE
    mod = load_island(iid); random.seed(4100 + k)
    before = {o.name for o in bpy.data.objects}
    K = UE.Kit(bpy.context.scene); K_.top_mats(K)
    ctx = K_.Ctx(iid, shape_fn=getattr(mod, 'SHAPE_FN', None)); ctx.K, ctx.M = K, K.M
    if hasattr(mod, 'top'): mod.top(ctx)
    mod.underside(ctx)
    for o in K_.C.Batch.build_all():
        if o.name.startswith(('ward', 'lamps', 'dock_approach', 'rim_crystals', 'glow')): o.visible_shadow = False
    rt = new_root('isle_root_' + iid, (x, y, alt)); objs = adopt(before, rt)
    tick(f'{iid} {len(objs)} objects')
    return rt, K, ctx.S


def nodes_of(m):
    try: m.use_nodes = True                                           # Blender 5 起恒为 True（属性弃用）
    except Exception: pass
    return m.node_tree


def glow(name, c, estr, alpha=1.0):
    import common as C
    return C.glow(name, c=c, estr=estr, alpha=alpha)


def eden_extras(rt, alt):
    """伊甸岛底：三颗以太核心呈三角排布、嵌在主锥朝南（朝镜头）一侧的中段，各带两圈符文环与晶簇；停靠平台信标环 + 进场光带。"""
    import common as C
    from estate2 import layout as L
    import _kit as K_
    B = C.Batch('eden_cores'); BL = C.Batch('eden_beacons'); R = C.Batch('eden_subcones')
    m_core, m_ring = glow('eden_core', C.AETHER_C, 10.0), glow('eden_ring', C.AETHER_C, 5.0)
    m_cry = C.flat('eden_cry', (.5, .85, 1.0), .1, emit=C.AETHER_C, estr=2.5); m_bea = glow('eden_beacon', (.75, .92, 1.0), 6.0)
    m_rock = K_.rock_v17('eden_rock17', (.66, .63, .58), (.82, .8, .76), .05, soil_z=400.0, lichen=(.86, .84, .78))
    K_.cone(R, 0.0, -20.0, -150.0, 125.0, 240.0, m_rock, seed=3, rough=.22, n=40, nr=18, ledge=.03)      # 主锥尖：全区最深（约 −390 m）
    for k, (cx, cy, r0, Lc) in enumerate(((0.0, -150.0, 58.0, 210.0), (-135.0, -95.0, 50.0, 175.0), (135.0, -95.0, 50.0, 185.0))):
        K_.cone(R, cx, cy, -105.0, r0, Lc, m_rock, seed=11 + k, rough=.25, n=28, nr=14, ledge=.03)
        zc = -105.0 - Lc * .3; rr = r0 * (.7 ** .75); d = Vector((cx, cy, 0)).normalized() if (cx or cy) else Vector((0, -1, 0))
        d = (d + Vector((0, -1.2, 0))).normalized(); p = Vector((cx, cy, zc)) + d * (rr - 4.0); rc = 12.0
        B.sphere(p.x, p.y, p.z, rc, m_core, seg=24, rings=12)                    # 以太核心：嵌在副锥朝南（朝镜头）一面
        q = d.to_track_quat('Z', 'Y')
        for rad, w in ((rc * 2.0, 1.0), (rc * 2.8, .75)):                   # 两圈符文环（虚线：12 段亮 8 段）
            for j in range(12):
                if j % 3 == 2: continue
                a0, a1 = j * math.tau / 12, (j + .8) * math.tau / 12
                pts = [p + q @ Vector((math.cos(t) * rad, math.sin(t) * rad, 0)) for t in (a0 + (a1 - a0) * s_ / 4 for s_ in range(5))]
                B.tube([tuple(v) for v in pts], w, m_ring, n=6)
        for j in range(3):
            v = Vector((cx, cy, -105.0 - Lc * (.12 + .2 * j))) + d * r0 * (.75 - .2 * j)
            C.crystal_cluster(B, v.x, v.y, v.z, 7.0, m_cry, seed=31 + k * 7 + j, down=True)
    dk = next(q for q in L.PADS if q['id'] == 'dock'); (cx, cy), (rx, ry), z = dk['c'], dk['r'], L.ground_z(*dk['c']) + .6
    for j in range(14):
        t = j * math.tau / 14; BL.sphere(cx + math.cos(t) * (rx + 1.5), cy + math.sin(t) * (ry + 1.5), z, .7, m_bea, seg=10, rings=5)
    for j in range(1, 16):                                            # 进场光带：向南沿约 5° 下滑角外伸
        d_ = ry + 6.0 * j; BL.sphere(cx - 3, cy - d_, z - d_ * math.tan(math.radians(5)), .55, m_bea, seg=8, rings=4)
        BL.sphere(cx + 3, cy - d_, z - d_ * math.tan(math.radians(5)), .55, m_bea, seg=8, rings=4)
    before = {o.name for o in bpy.data.objects}
    for o in C.Batch.build_all():
        if not o.name.startswith('eden_subcones'): o.visible_shadow = False
    adopt(before, rt)


def tower(x, y):
    """以太气候调节塔（米）：深色细塔身从本层下限 800 m 起（下面属于中层图），竖肋、每 40 m 一道金属箍、窄窗带；
    两圈外伸环台；金冠 + 以太晶冠（约 1530 m）；三道淡场环。"""
    import common as C
    B = C.Batch('tower'); G = C.Batch('tower_glow'); W = C.Batch('tower_windows')
    dark = C.flat('tower_dark', (.07, .075, .085), .45, metal=.5, noise=.15); pad = C.flat('tower_pad', (.42, .44, .48), .4, metal=.6)
    gold = C.flat('tower_gold', (.7, .54, .22), .3, metal=1.0); aet = glow('tower_aether', C.AETHER_C, 6.0)
    win = C.glass('tower_glass', tint=(.05, .06, .08)); TR, z0, z1 = 9.0, TIER[0], 1480.0
    B.cyl(x, y, z0, TR, z1 - z0, dark, 40)
    for j in range(8):
        t = j / 8 * math.tau; B.cyl(x + math.cos(t) * TR, y + math.sin(t) * TR, z0, 1.1, z1 - z0, pad, 6)
    for z in range(int(z0) + 20, int(z1), 40): B.cyl(x, y, z, TR + 1.0, 1.2, pad, 32)
    for j in range(4):
        t = (j + .5) / 4 * math.tau
        for z in range(int(z0) + 26, int(z1) - 10, 40): W.boxc(x + math.cos(t) * (TR + .2), y + math.sin(t) * (TR + .2), z + 14, 1.4, 1.4, 22, win)
    for k, zz in enumerate((1290.0, 1370.0)):
        r = 30 - k * 4.5; B.cyl(x, y, zz, r, 2.5, pad, 64); B.cyl(x, y, zz + 2.5, r - 3, 1.2, dark, 64)
        for j in range(12): t = j / 12 * math.tau; G.cyl(x + math.cos(t) * (r - 1), y + math.sin(t) * (r - 1), zz + 2.5, .8, 1.2, aet, 8)
    B.cyl(x, y, z1, 20.0, 5.0, gold, 48)
    for j in range(9):
        t = j / 9 * math.tau; rr = 6 + 7 * (j % 3) / 2
        G.sphere(x + math.cos(t) * rr, y + math.sin(t) * rr, z1 + 12 + 8 * (j % 3), 5 + 2 * (j % 2), aet, sz=2.6, seg=10, rings=6)
    G.sphere(x, y, z1 + 28, 9, aet, sz=2.2, seg=16, rings=8)
    C.field_rings(G, x, y, z1 - 20, (45.0, 75.0, 110.0), 1.4, glow('tower_field', (.3, .55, .85), 1.6, alpha=.45))
    for o in C.Batch.build_all():
        if o.name.startswith('tower_glow'): o.visible_shadow = False
    return dict(win=win)


def cloud_sheet(z, cover, name, P, extent=9000.0, feature=600.0, alpha=.5):
    """高度层云片（米）：两级噪声的云团，亮顶 + 云谷，只自发光（不接收岛影）；按云密度给 alpha。"""
    m = bpy.data.materials.new(name); nt = nodes_of(m); N, L = nt.nodes, nt.links
    out = next(x for x in N if x.type == 'OUTPUT_MATERIAL')
    for x in list(N):
        if x.type != 'OUTPUT_MATERIAL': N.remove(x)
    tcn = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = extent / feature
    nz.inputs['Detail'].default_value = 8; nz.inputs['Roughness'].default_value = .6; L.new(tcn.outputs['Generated'], nz.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .64 - cover * .3; mr.inputs['From Max'].default_value = .76 - cover * .2
    mr.inputs['To Max'].default_value = alpha; L.new(nz.outputs['Fac'], mr.inputs['Value'])
    n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = extent / feature * 3; n2.inputs['Detail'].default_value = 6; L.new(tcn.outputs['Generated'], n2.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB'); e0, e1 = ramp.color_ramp.elements
    e0.color = (*P['val'], 1); e1.color = (*P['top'], 1); e0.position, e1.position = .3, .7
    mx_ = N.new('ShaderNodeMath'); mx_.operation = 'MULTIPLY_ADD'; mx_.inputs[1].default_value = .5
    L.new(n2.outputs['Fac'], mx_.inputs[0]); L.new(nz.outputs['Fac'], mx_.inputs[2]); L.new(mx_.outputs[0], ramp.inputs['Fac'])
    em = N.new('ShaderNodeEmission'); L.new(ramp.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = P['cl']
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    L.new(mr.outputs['Result'], mx.inputs['Fac']); L.new(tr.outputs[0], mx.inputs[1]); L.new(em.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], out.inputs['Surface'])
    me = bpy.data.meshes.new(name); h = extent / 2
    me.from_pydata([(-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0)], [], [(0, 1, 2, 3)]); me.materials.append(m)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); o.location = (0, 0, z); o.scale = (1, 1, 1)
    o.visible_shadow = False; o.visible_diffuse = False                      # 不挡光、不照岛（云只是半透明的一层，不给岛加无源亮光）
    o['upper_cloud'] = 1
    return o


def scale_emission(tokens, k):
    """名字含 tokens 的材质：自发光强度乘 k（瀑布 / 溪瀑 / 水雾是只自发光的白水，夜里不能自己发亮；结界只留淡反光）。"""
    n = 0
    for m in bpy.data.materials:
        if not m.node_tree or not any(t in m.name for t in tokens): continue
        for nd in m.node_tree.nodes:
            if nd.type == 'EMISSION' and not nd.inputs['Strength'].is_linked: nd.inputs['Strength'].default_value *= k; n += 1
            elif nd.type == 'BSDF_PRINCIPLED' and not nd.inputs['Emission Strength'].is_linked: nd.inputs['Emission Strength'].default_value *= k; n += 1
    return n


# ---------------------------------------------------------------- 灯（真实光源）
def light_windows(mat, frac, strength, cell=(4.2, 4.2, 3.4), seed=0.0, temp=2700.0):
    """窗：按「房间格」（对象坐标 floor(p / cell)）随机亮灯，比例 frac，亮度 0.6–1.0 × strength，2700 K 黑体色。"""
    if not mat or not mat.use_nodes: return
    nt = mat.node_tree; b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None: return
    for s in ('Emission Color', 'Emission Strength'):
        for lk in list(b.inputs[s].links): nt.links.remove(lk)
    if frac <= 0 or strength <= 0:
        b.inputs['Emission Strength'].default_value = 0.0; return
    N, L = nt.nodes, nt.links
    tcn = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = tuple(1 / c for c in cell)
    mp.inputs['Location'].default_value = (seed * .37, seed * .71, seed * .13); L.new(tcn.outputs['Object'], mp.inputs['Vector'])
    fl = N.new('ShaderNodeVectorMath'); fl.operation = 'FLOOR'; L.new(mp.outputs[0], fl.inputs[0])
    wn = N.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; L.new(fl.outputs[0], wn.inputs['Vector'])
    on = N.new('ShaderNodeMath'); on.operation = 'LESS_THAN'; on.inputs[1].default_value = frac; L.new(wn.outputs['Value'], on.inputs[0])
    sep = N.new('ShaderNodeSeparateColor'); L.new(wn.outputs['Color'], sep.inputs[0])
    var = N.new('ShaderNodeMapRange'); var.inputs['To Min'].default_value = .6 * strength; var.inputs['To Max'].default_value = strength
    L.new(sep.outputs[0], var.inputs['Value'])
    st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; L.new(on.outputs[0], st.inputs[0]); L.new(var.outputs['Result'], st.inputs[1])
    bb = N.new('ShaderNodeBlackbody'); bb.inputs['Temperature'].default_value = temp
    L.new(bb.outputs[0], b.inputs['Emission Color']); L.new(st.outputs[0], b.inputs['Emission Strength'])


def ray_down(sc, dg, x, y, z_top, skip):
    o, d = Vector((x, y, z_top)), Vector((0, 0, -1))
    for _ in range(10):
        hit, loc, nrm, _i, ob, _m = sc.ray_cast(dg, o, d, distance=900)
        if not hit: return None
        if any(t in ob.name for t in skip): o = loc + d * .05; continue
        return loc, nrm, ob
    return None


LAMP_SKIP = ('ward', 'mist', 'fall', 'curtain', 'dock_approach', 'glow', 'cloud', 'creek', 'lamps', 'beam')
LAMP_DENY = ('roof', 'walls', 'window', 'tree', 'hedge', 'props', 'crown', 'chimney', 'railing', 'water', 'car', 'rock', 'crag', 'stair', 'bush')


def garden_lamps(sc, islands):
    """园灯 / 路灯：每座卡内岛按三圈（0.9 / 0.62 / 0.32 R）取点，从岛上方往下打射线，落在平地（法线 z > 0.85、不是屋顶 / 墙 / 树 / 水）上才立灯：
    灯柱 + 3000 K 暖光灯头（自发光）+ 一盏 60 W 点光（地面上有光池）。"""
    import common as C
    dg = bpy.context.evaluated_depsgraph_get(); B = C.Batch('garden_lamps'); n = 0
    post = C.flat('lamp_post', (.04, .04, .045), .5, metal=.6); head = bpy.data.materials.new('lamp_head')
    nodes_of(head); hb = next(x for x in head.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'); hb.inputs['Base Color'].default_value = (1, .9, .75, 1)
    bbn = head.node_tree.nodes.new('ShaderNodeBlackbody'); bbn.inputs['Temperature'].default_value = 3000.0
    head.node_tree.links.new(bbn.outputs[0], hb.inputs['Emission Color']); hb.inputs['Emission Strength'].default_value = 40.0
    for iid, (x0, y0, alt, S) in islands.items():
        for f, step in ((.9, 22.0), (.62, 30.0), (.32, 34.0)):
            R = S.R * f; k = max(6, int(math.tau * R / step))
            for j in range(k):
                t = j / k * math.tau + f; ex, ey = S.edge(t, f)
                r = ray_down(sc, dg, x0 + ex, y0 + ey, alt + 300, LAMP_SKIP)
                if not r: continue
                loc, nrm, ob = r
                if nrm.z < .85 or any(t_ in ob.name for t_ in LAMP_DENY) or not (alt - 25 < loc.z < alt + 45): continue
                B.cyl(loc.x, loc.y, loc.z, .12, 3.4, post, 6); B.sphere(loc.x, loc.y, loc.z + 3.6, .32, head, seg=10, rings=6)
                ld = bpy.data.lights.new(f'glamp{n}', 'POINT'); ld.energy = 60.0; ld.shadow_soft_size = .2
                ld.color = (1.0, .74, .48); lo = bpy.data.objects.new(f'glamp{n}', ld); sc.collection.objects.link(lo); lo.location = (loc.x, loc.y, loc.z + 3.3)
                n += 1
    C.Batch.build_all(); tick(f'garden lamps {n}')


# ---------------------------------------------------------------- 光照、时段
def apply_period(sc, P, grey):
    w = bpy.data.worlds.new('obl_world'); sc.world = w; nt = nodes_of(w); nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground'); nt.links.new(bg.outputs[0], out.inputs[0])
    az = PJ.OBLIQUE_SUN_AZ
    if P['sky'] > 0:
        sk = nt.nodes.new('ShaderNodeTexSky'); sk.sky_type = 'MULTIPLE_SCATTERING'; sk.sun_disc = False
        sk.sun_elevation = math.radians(P['el']); sk.sun_rotation = math.radians((90 - az) % 360); sk.altitude = 1200
        nt.links.new(sk.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = P['sky']
    else:                                                               # 夜：天空接近黑蓝，只给一点冷环境
        bg.inputs[0].default_value = (.010, .014, .028, 1); bg.inputs[1].default_value = 1.0
    ld = bpy.data.lights.new('sun', 'SUN'); ld.energy = P['e']; ld.color = P['sun']; ld.angle = math.radians(.8 if P['sky'] else .5)
    so = bpy.data.objects.new('sun', ld); sc.collection.objects.link(so)
    el, a = math.radians(P['el']), math.radians(az)
    d = Vector((math.cos(el) * math.cos(a), math.cos(el) * math.sin(a), math.sin(el))); so.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = P['exp']
    if grey:
        gm = bpy.data.materials.new('grey'); gb = next(x for x in nodes_of(gm).nodes if x.type == 'BSDF_PRINCIPLED')
        gb.inputs['Base Color'].default_value = (.6, .6, .6, 1); gb.inputs['Roughness'].default_value = .8
        bpy.context.view_layer.material_override = gm


def cycles(sc, samples, noise):
    sc.render.engine = 'CYCLES'; gpu = tc.setup_render_device(sc); sc.cycles.device = 'GPU' if gpu else 'CPU'
    c = sc.cycles; c.samples = samples; c.use_adaptive_sampling = True; c.adaptive_threshold = noise
    c.use_denoising = True
    try: c.denoising_use_gpu = gpu
    except AttributeError: pass
    try: c.use_light_tree = True
    except AttributeError: pass
    c.max_bounces = 8; c.diffuse_bounces = 3; c.glossy_bounces = 3; c.transmission_bounces = 4; c.volume_bounces = 0
    c.transparent_max_bounces = 24; c.caustics_reflective = c.caustics_refractive = False
    c.use_auto_tile = True; c.tile_size = 2048
    sc.render.film_transparent = True
    s = sc.render.image_settings; s.file_format = 'PNG'; s.color_mode = 'RGBA'; s.color_depth = '8'; s.compression = 15


# ---------------------------------------------------------------- 画框、meta
def corners(objs):
    pts = []
    for o in objs:
        if o.type != 'MESH' or o.hide_render or not o.visible_get() or o.get('upper_cloud'): continue
        mw = o.matrix_world; pts += [list(mw @ Vector(c)) for c in o.bound_box]
    return pts


def descendants(rt):
    return [o for o in bpy.data.objects if o.parent is rt or (o.parent and o.parent.parent is rt)]


def emit_only(sc):
    """源图（§0.8 第 2 条）：关掉太阳、天光、所有灯光对象；自发光不再照亮别处（emission_sampling NONE、物体对漫反射 / 光泽光线不可见）；
    这样成图里亮的只剩相机直接看到的发光面。"""
    for ob in sc.objects:
        if ob.type == 'LIGHT': ob.hide_render = True
        elif ob.type == 'MESH': ob.visible_diffuse = ob.visible_glossy = ob.visible_transmission = False
    for m in bpy.data.materials:
        try: m.cycles.emission_sampling = 'NONE'
        except AttributeError: pass
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
    c = sc.cycles; c.samples = 4; c.use_denoising = False; c.max_bounces = 0


def lights_uv(cam):
    """夜检（§0.8 第 2 条）：所有灯光对象的画框坐标——亮斑要么在 Emit 通道里有源，要么旁边有灯。"""
    out = []
    for ob in bpy.context.scene.objects:
        if ob.type == 'LIGHT' and ob.data.type != 'SUN':
            u, v = PJ.project_ortho(list(ob.matrix_world.translation), cam)
            if 0 <= u <= 1 and 0 <= v <= 1: out.append([round(u, 5), round(v, 5)])
    return out


def write_meta(path, cam, info, render, extra=None):
    I = {}
    for iid, d in info.items():
        if iid.startswith('_'): continue
        a = [d['x'], d['y'], d['alt'] + 20.0]
        I[iid] = dict(marker=d['marker'], anchor=a, anchor_uv=[round(v, 5) for v in PJ.project_ortho(a, cam)],
                      poly_uv=[[round(v, 5) for v in PJ.project_ortho(q, cam)] for q in d['top']],
                      tip_uv=[round(v, 5) for v in PJ.project_ortho(d['tip'], cam)], depth=round(PJ.ortho_depth([d['x'], d['y'], d['alt']], cam), 2))
    json.dump(dict(camera=cam, render=render, islands=I, markers_extra=info.get('_extra', {}), **(extra or {})), open(path + '.meta.json', 'w'), ensure_ascii=False, indent=1)


def main():
    o = opts(); P = PERIODS[o['tod']]; grey = o['grey'] == '1'
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    cycles(sc, int(o['samples']), float(o['noise']))
    cfg = DP.load(); ISL = {i['id']: i for i in json.load(open(os.path.join(HERE, 'data', 'tc_islands.json')))['islands']}
    alt = lambda iid: float(cfg['islands'][iid]['alt'])
    roots, info, lamp_isl, win_mats = {}, {}, {}, []
    ed = ISL['eden']; roots['eden'] = build_eden(alt('eden'), float(o['density']))
    eden_extras(roots['eden'], alt('eden'))
    from estate2 import layout as EL, buildings as EB
    th = [k * math.tau / 96 for k in range(96)]; rr = EL.outline_R(th)
    info['eden'] = dict(marker=ed.get('marker', 'eden'), x=ed['x'] * 100, y=ed['y'] * 100, alt=alt('eden'),
                        top=[[ed['x'] * 100 + math.cos(t) * r, ed['y'] * 100 + math.sin(t) * r, alt('eden')] for t, r in zip(th, rr)])
    EM = EB.mats(); win_mats += [(EM[k], s) for k, s in (('glass', 1.0), ('shutter', 1.2), ('greenglass', .5)) if k in EM]
    for k, iid in enumerate(CARD):
        d = ISL[iid]; x, y = d['x'] * 100, d['y'] * 100
        rt, K, S = build_card(iid, x, y, alt(iid), k); roots[iid] = rt; lamp_isl[iid] = (x, y, alt(iid), S)
        win_mats.append((K.M['glass'], 1.0))
        info[iid] = dict(marker=d.get('marker', iid), x=x, y=y, alt=alt(iid), top=[[x + px, y + py, alt(iid)] for px, py in S.pts(96)])
    ta = json.load(open(os.path.join(HERE, 'data', 'tc_islands.json'))).get('anchors', {}).get('climate_tower', {})
    tx, ty = ta.get('x', 13.309) * 100, ta.get('y', -6.433) * 100
    before = {ob.name for ob in bpy.data.objects}; tw = tower(tx, ty); trt = new_root('tower_root', (0, 0, 0)); adopt(before, trt)
    win_mats.append((tw['win'], 1.0))
    bpy.context.view_layer.update()
    for iid, rt in roots.items():                                        # 岛底锥尖：该岛内容的最低点（岛心正下方）
        zs = [p[2] for p in corners(descendants(rt))]; info[iid]['tip'] = [info[iid]['x'], info[iid]['y'], min(zs) if zs else info[iid]['alt'] - 200]
    info['_extra'] = {'climate_tower': dict(anchor=[tx, ty, 1372.5])}
    # 画框：中心柱在本层高度范围内的投影 + 本层全部实体
    box = [[sx * COLUMN[0], sy * COLUMN[1], z] for sx in (-1, 1) for sy in (-1, 1) for z in TIER]
    ents = corners([ob for ob in bpy.data.objects if ob.parent in roots.values() or ob.parent is trt or (ob.parent and ob.parent.parent in roots.values())])
    cam = PJ.cam_file(PJ.ortho_frame(box + ents, z_c=Z_C))
    f = cam['frame']; L_, T_ = PJ.ortho_ru(f['centre_m'], cam['right'], cam['up']); L_, T_ = L_ - f['w_m'] / 2, T_ + f['h_m'] / 2
    ecam = PJ.cam_file(PJ.ortho_frame(corners(descendants(roots['eden'])), PJ.OBLIQUE['m_per_px'] / 2, None, .1, alt('eden'),
                                      snap=(PJ.OBLIQUE['m_per_px'], L_, T_)), PJ.OBLIQUE['m_per_px'] / 2)
    tick(f"frame main {f['px']} {f['w_m']} x {f['h_m']} m  hash {cam['hash']}; eden inset {ecam['frame']['px']} hash {ecam['hash']}")
    # 时段：天光、太阳、窗、园灯、伊甸夜灯、云片
    apply_period(sc, P, grey)
    for k, (m, s) in enumerate(win_mats): light_windows(m, P['win'], P['ws'] * s, seed=k * 3.1)
    tick(f"emission scaled: water {scale_emission(('fall', 'curtain', 'creek', 'mist'), P['water'])}, ward {scale_emission(('ward',), P['ward'])}")
    if P['lamps'] and not grey:
        garden_lamps(sc, lamp_isl)
        from estate2 import style_frame as SF                           # estate2 夜景：园路 / 大道灯、窗光溢出、喷泉灯、泳池灯（伊甸本地坐标）
        before = {ob.name for ob in bpy.data.objects}; SF.night(sc); adopt(before, roots['eden'])
        sc.world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
        for ob in sc.objects:
            if ob.type == 'LIGHT' and ob.data.type == 'SUN': ob.data.energy = P['e']; ob.data.color = P['sun']
    if not grey:
        for c in cfg.get('cloud_sheets', []): cloud_sheet(c['alt'], c.get('cover', .2), 'sheet_' + c['id'], P)
    render = dict(tod=o['tod'], samples=int(o['samples']), script='blender/upper_oblique.py', blender=bpy.app.version_string)
    jobs = [(cam, int(o['res']) or cam['frame']['px'][0], o['out'], 'main')]
    if o['eden-out']: jobs.append((ecam, int(o['eden-res']) or ecam['frame']['px'][0], o['eden-out'], 'eden'))
    for cm, rx, out, kind in jobs:
        OB.ortho_camera(sc, cm, rx); os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True); sc.render.filepath = out
        t1 = time.time(); bpy.ops.render.render(write_still=True)
        extra = dict(lights_uv=lights_uv(cm)) if o['exr'] == '1' else None
        write_meta(out, cm, info, dict(render, kind=kind, res=[sc.render.resolution_x, sc.render.resolution_y], minutes=round((time.time() - t1) / 60, 2)), extra)
        tick(f'WROTE {out} {sc.render.resolution_x}x{sc.render.resolution_y}')
    if o['exr'] == '1':                                                  # 夜检源图：只留相机直接看到的自发光（灯、窗、核心……），其余全黑
        emit_only(sc); OB.ortho_camera(sc, cam, int(o['res']) or cam['frame']['px'][0])
        sc.render.filepath = os.path.splitext(o['out'])[0] + '_emit.png'; bpy.ops.render.render(write_still=True); tick('WROTE ' + sc.render.filepath)


if __name__ == '__main__':
    main()
