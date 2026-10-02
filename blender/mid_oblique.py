"""中层斜视成图（D41 批 2；设定 docs/tiancheng-maps.md §0.3 / §0.4 / §0.8，相机文件格式见附录 OBLIQUE-CODE B）。

由 blender/tiancheng_mid.py 在 TC_OBLIQUE=1 时调用：城市已经按一套几何建好（100 m 单位，地面 z = Z_GROUND），
这里接管时段光照、共用正交相机、画框拟合、成图与相机文件。相机是三层共用那套（§0.2：正交、方位 165°、俯角 35°、0.44 m/px），
中层底板 50 m（L33）；本层各时段同一画框，因此相机文件哈希相同。

时段：--obtod day|dusk|night。构建始终走夜景那一份几何与灯光（脚本参数 --tod night），白昼与黄昏只是把自发光与
灯按比例调上去 / 调下来（§0.4：昼约夜的四成、昏约七成；夜里整张网格都亮）。中层的天光比上层暗：太阳只照楼冠，
街面常年在阴影里，浮岛正下方的天光被头顶的浮岛遮挡板挡掉（只投影的板留着，顶视图用的半透明暗盘在 35° 斜视里
会变成浮在街上的灰片，藏掉）。

用法（经 tools/render_queue.sh 提交）：
  blender -b --factory-startup --python-expr "import os, runpy; os.environ['TC_OBLIQUE']='1'; runpy.run_path('blender/tiancheng_mid.py', run_name='__main__')" -- \
      --tod night --obtod night --samples 16 --obres 2000 --no-data --out logs/campaign/rb2/night_2000.png [--exr 1]
  --obres：成图宽；0 或不给 = 相机文件里的定稿像素（同一画框的低分辨率草图，哈希不变）。
  --exr 1：夜检用，另出 <out>_emit.png 源图（只有相机直接看到的发光面），灯光对象位置写进 meta。
每张成图旁写 <out>.meta.json：相机文件、时段、画框来源、公园 / 运河多边形（自检排除用）、灯光对象画框坐标。
"""
import json, math, os, sys, time
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
import tc_common as tc
import project as PJ
import oblique as OB
from tc_common import Z_GROUND as ZG

UNIT = 100.0                             # 层脚本 1 单位 = 100 m
TIER = (50.0, 800.0)                     # 中层高度范围（L33）：底板 50 m，楼顶按真实高度
COLUMN = (1500.0, 937.5)                 # 中心柱半宽 / 半高（三层同一块 3000 × 1875 m 片区）
Z0 = TIER[0] - ZG * UNIT                 # 场景 z = 0 对应的海拔（米）：地面 −3.6 单位 → 底板 50 m
Z_C = sum(TIER) / 2
FLAT = ('mid_ground', 'roads', 'water', 'parks', 'ground')      # 地面平铺只是衬底，不参与画框拟合
CORE = (0.0, 3.0, 4.6)                   # 核心 / 高区中心（平面单位，靠近执法局总局与辉光大教堂）：窗偏冷白，其余暖黄
T0 = time.time()

# 时段：太阳高度 °、太阳色、太阳能量、照明用天光、相机看到的地平 / 天顶色、曝光、自发光倍数、点光倍数、窗灯比例、窗灯强度
PERIODS = {
    'day':   dict(el=42.0, sun=(1.0, .95, .88), e=13.0, sky=.13, sky_horizon=(1.15, 1.22, 1.30), sky_zenith=(.45, .62, .92), exp=-.35, emit=.50, lamp=.55, win=.16, ws=1.4),
    'dusk':  dict(el=13.0, sun=(1.0, .55, .30), e=9.0, sky=.07, sky_horizon=(1.50, .78, .44), sky_zenith=(.26, .28, .48), exp=-.35, emit=.70, lamp=.80, win=.30, ws=2.2),
    'night': dict(el=50.0, sun=(.60, .70, 1.0), e=.05, sky=0.0, exp=0.0, emit=1.0, lamp=1.0, win=.74, ws=2.5),
}
# 立面窗：材质名 → (开灯比例, 强度, 色温 K)。窗是自发光贴图，不摆点光（§0.8 台账备注）。
WIN_MATS = {
    'citymat0': (.60, 1.0, 2700.), 'citymat1': (.60, 1.0, 2700.), 'citymat2': (.55, 1.0, 2900.), 'citymat3': (.55, 1.0, 2900.),
    'kfillmat': (.65, 1.0, 2400.), 'kfilleq': (.65, 1.0, 2400.),
    'cath_stone': (.35, .8, 4200.), 'cath_spire': (.35, .8, 4200.), 'council_stone': (.45, .9, 3400.),
    'univ_wall': (.45, .9, 4200.), 'univ_wall2': (.45, .9, 4200.), 'univ_slate2': (.40, .9, 4200.),
}
WIN_CELL = (.034, .034, .031)            # 房间格（平面单位）：3.4 m 一间、3.1 m 一层


def tick(msg): print(f'[mid_oblique {time.time() - T0:6.1f}s] {msg}', flush=True)


def to_m(p):
    """层脚本坐标（100 m 单位）→ 米制世界（x 东、y 北、z 海拔）。"""
    return [p[0] * UNIT, p[1] * UNIT, p[2] * UNIT + Z0]


def corners(sc, skip=()):
    """场景里可见实体的包围盒角点（米）。只有整个包围盒都在中心柱之内的对象参与画框拟合：
    地面平铺只是衬底，伸出柱外的悬空连线（通区全城的导轨光带与站台，一件网格就是整片）也不该把画框撑大——
    中层画框由中心柱定（§0.2：约 3520 × 2200 m），柱外的部分在边上出画。"""
    pts, out = [], []
    for o in sc.objects:
        if o.type != 'MESH' or o.hide_render or o.name in skip or not o.visible_get(): continue
        cs = [to_m(o.matrix_world @ Vector(c)) for c in o.bound_box]
        if any(abs(p[0]) > COLUMN[0] or abs(p[1]) > COLUMN[1] for p in cs):
            out.append(o.name); continue
        pts += cs
    tick(f'frame: {len(pts) // 8} objects in, {len(out)} out' + (': ' + ', '.join(out[:12]) if out else ''))
    return pts


def fit_camera(sc):
    """画框（§0.2）：中心柱在本层高度范围内的投影 + 本层全部实体，外扩 3 %，补齐 16 : 10，取整像素。"""
    box = [[sx * COLUMN[0], sy * COLUMN[1], z] for sx in (-1, 1) for sy in (-1, 1) for z in TIER]
    cam = PJ.cam_file(PJ.ortho_frame(box + corners(sc, FLAT), z_c=Z_C))
    f = cam['frame']
    tick(f"frame {f['px']} {f['w_m']} x {f['h_m']} m  hash {cam['hash']}")
    return cam


def ground_out(sc, k=2.6):
    """地面衬底铺到画框外，并换成真正的沥青材质。
    两件事都得做：① 顶视图只把地面铺到 1.2 倍片区，35° 斜视里地面在画面上压缩成 sin35 ≈ 0.57，
    要盖住 2178 m 高的画框得铺到 3 km 以外，不铺远就会看见地块的硬边；② tc_common.road_plane 给的是
    city_mat（基色取顶点色 'col'），而 primitive_plane_add 建的面没有顶点色 → 基色全黑，地面既不反光
    也不接灯池，整块地就是一片死黑。换成 tc_detail.asphalt_mat，街灯光池、车灯流才画得出来。
    tc_common.road_plane 建的面叫 'Plane'（没改名），认不出来就会把地块的硬边算进画框。"""
    import tc_detail as td
    hit = []
    for o in sc.objects:
        if o.type == 'MESH' and o.name in ('Plane', 'road', 'ground'):
            o.scale = (o.scale[0] * k, o.scale[1] * k, 1.0); o.name = 'mid_ground'
            mg = td.asphalt_mat('mid_ground_mat', (.022, .022, .020), 1.2)
            tc.set_in(tc.bsdf_of(mg), ('Specular IOR Level', 'Specular'), .06)   # 沥青的高光很弱，否则地面整片泛灰
            o.data.materials.clear(); o.data.materials.append(mg)
            hit.append(o.name)
    tick(f'ground plate x{k}: {hit}')


# ---------------------------------------------------------------- 灯光
def emission_scale(k):
    """全部自发光材质强度乘 k（霓虹、全息、窗、导轨光带……）：白昼四成、黄昏七成（§0.4）。"""
    n = 0
    for m in bpy.data.materials:
        nt = getattr(m, 'node_tree', None)
        if nt is None: continue
        for nd in nt.nodes:
            if nd.type == 'EMISSION' and not nd.inputs['Strength'].is_linked: nd.inputs['Strength'].default_value *= k; n += 1
            elif nd.type == 'BSDF_PRINCIPLED' and not nd.inputs['Emission Strength'].is_linked:
                nd.inputs['Emission Strength'].default_value *= k; n += 1
    return n


def _mul(N, L, a, b):
    """两个节点输出相乘（窗形遮罩逐轴收紧用）。"""
    n = N.new('ShaderNodeMath'); n.operation = 'MULTIPLY'; L.new(a.outputs[0], n.inputs[0]); L.new(b.outputs[0], n.inputs[1])
    return n


def emission_names(tokens, k):
    """名字含 tokens 的自发光材质强度乘 k（俯视里合适的亮度，斜视里往往过亮——线条在斜视里更长更抢眼）。"""
    n = 0
    for m in bpy.data.materials:
        nt = getattr(m, 'node_tree', None)
        if nt is None or not any(t in m.name for t in tokens): continue
        for nd in nt.nodes:
            if nd.type == 'EMISSION' and not nd.inputs['Strength'].is_linked: nd.inputs['Strength'].default_value *= k; n += 1
            elif nd.type == 'BSDF_PRINCIPLED' and not nd.inputs['Emission Strength'].is_linked:
                nd.inputs['Emission Strength'].default_value *= k; n += 1
    return n


def _core_mask(N, L, vec):
    """核心 / 高区遮罩：平面坐标离 CORE 越近越接近 1（远处 0）。核心区与高区是写字楼白窗，外围居住区暖黄窗。"""
    sp = N.new('ShaderNodeSeparateXYZ'); L.new(vec.outputs[0], sp.inputs[0])
    dv = N.new('ShaderNodeVectorMath'); dv.operation = 'SUBTRACT'
    dv.inputs[1].default_value = (CORE[0], CORE[1], 0.0); L.new(vec.outputs[0], dv.inputs[0])
    ln = N.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; L.new(dv.outputs[0], ln.inputs[0])
    mr = N.new('ShaderNodeMapRange'); mr.clamp = True
    mr.inputs['From Min'].default_value = CORE[2]; mr.inputs['From Max'].default_value = CORE[2] * .45
    L.new(ln.outputs['Value'], mr.inputs['Value'])
    return mr


def facade_windows(frac, strength, seed=0.0):
    """立面窗：按房间格（对象坐标 floor(p / cell)）随机开灯，格子里只有中间那块是窗（fract 出的矩形），其余是墙；
    比例 frac、强度 strength，2700–4200 K，逐格亮度有差别。法线 z 分量不小于 0.5 的面不亮（屋面、坡顶、天桥）。
    窗是自发光贴图，不摆点光（几千扇窗的点光会拖死采样）。"""
    hit = 0
    for name, (m_frac, mul, temp) in WIN_MATS.items():
        m = bpy.data.materials.get(name)
        if m is None or not m.node_tree: continue
        nt = m.node_tree; N, L = nt.nodes, nt.links
        b = next((n for n in N if n.type == 'BSDF_PRINCIPLED'), None)
        if b is None: continue
        for s in ('Emission Color', 'Emission Strength'):
            for lk in list(b.inputs[s].links): L.remove(lk)
        if frac <= 0 or strength <= 0:
            b.inputs['Emission Strength'].default_value = 0.0; hit += 1; continue
        vec = N.new('ShaderNodeMapping'); tcn = N.new('ShaderNodeTexCoord')
        vec.inputs['Scale'].default_value = tuple(1 / c for c in WIN_CELL)
        vec.inputs['Location'].default_value = (seed * .37, seed * .71, seed * .13); L.new(tcn.outputs['Object'], vec.inputs['Vector'])
        fl = N.new('ShaderNodeVectorMath'); fl.operation = 'FLOOR'; L.new(vec.outputs[0], fl.inputs[0])
        wn = N.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; L.new(fl.outputs[0], wn.inputs['Vector'])
        on = N.new('ShaderNodeMath'); on.operation = 'LESS_THAN'; on.inputs[1].default_value = frac * m_frac
        L.new(wn.outputs['Value'], on.inputs[0])                                   # 这一格开不开灯
        fr = N.new('ShaderNodeVectorMath'); fr.operation = 'FRACTION'; L.new(vec.outputs[0], fr.inputs[0])
        sf = N.new('ShaderNodeSeparateXYZ'); L.new(fr.outputs[0], sf.inputs[0])
        mask = None
        for ax, half in (('X', .31), ('Y', .31), ('Z', .26)):                      # 窗形：格子里居中的一小块
            c_ = N.new('ShaderNodeMath'); c_.operation = 'SUBTRACT'; c_.inputs[1].default_value = .5
            L.new(sf.outputs[ax], c_.inputs[0])
            a_ = N.new('ShaderNodeMath'); a_.operation = 'ABSOLUTE'; L.new(c_.outputs[0], a_.inputs[0])
            k_ = N.new('ShaderNodeMath'); k_.operation = 'LESS_THAN'; k_.inputs[1].default_value = half
            L.new(a_.outputs[0], k_.inputs[0])
            mask = k_ if mask is None else _mul(N, L, mask, k_)
        st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; L.new(on.outputs[0], st.inputs[0]); L.new(mask.outputs[0], st.inputs[1])
        sep = N.new('ShaderNodeSeparateColor'); L.new(wn.outputs['Color'], sep.inputs[0])
        var = N.new('ShaderNodeMapRange'); var.inputs['To Min'].default_value = .3 * strength * mul
        var.inputs['To Max'].default_value = strength * mul; L.new(sep.outputs[0], var.inputs['Value'])
        lit = N.new('ShaderNodeMath'); lit.operation = 'MULTIPLY'; L.new(st.outputs[0], lit.inputs[0]); L.new(var.outputs['Result'], lit.inputs[1])
        geo = N.new('ShaderNodeNewGeometry'); sepn = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], sepn.inputs[0])
        up = N.new('ShaderNodeMath'); up.operation = 'LESS_THAN'; up.inputs[1].default_value = .5
        L.new(sepn.outputs['Z'], up.inputs[0])                                   # 只在竖直面上亮（法线 z 分量 < 0.5）
        gate = N.new('ShaderNodeMath'); gate.operation = 'MULTIPLY'; L.new(lit.outputs[0], gate.inputs[0]); L.new(up.outputs[0], gate.inputs[1])
        core = _core_mask(N, L, vec)                                              # 核心 / 高区：写字楼白窗、外围居住区暖黄窗（§0.4）
        bb = N.new('ShaderNodeBlackbody'); bb.inputs['Temperature'].default_value = temp
        bc = N.new('ShaderNodeBlackbody'); bc.inputs['Temperature'].default_value = 5200.
        mx = N.new('ShaderNodeMixRGB'); mx.blend_type = 'MIX'
        L.new(core.outputs[0], mx.inputs['Fac']); L.new(bb.outputs[0], mx.inputs['Color1']); L.new(bc.outputs[0], mx.inputs['Color2'])
        dim = N.new('ShaderNodeMapRange'); dim.inputs['To Min'].default_value = 1.0; dim.inputs['To Max'].default_value = .8
        L.new(core.outputs[0], dim.inputs['Value'])                               # 核心区的窗略暗一档，通透不刺眼
        lit2 = _mul(N, L, gate, dim)
        L.new(mx.outputs[0], b.inputs['Emission Color']); L.new(lit2.outputs[0], b.inputs['Emission Strength'])
        hit += 1
    return hit


def water_tune(rough=.14, color=(.005, .007, .011)):
    """河面：俯视里是一层深色高光，斜视里 35° 看水面就是一大片天光反射，会把整张昼图拉平发灰。
    这里把水压暗、糙化，让它回到「暗色水面 + 一条天光带」的位置。"""
    m = bpy.data.materials.get('water_n')
    if m is None or not m.node_tree: return 0
    b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None: return 0
    tc.set_in(b, 'Base Color', (*color, 1)); tc.set_in(b, 'Roughness', rough)
    tick(f'water tuned: rough {rough}, colour {color}')
    return 1


def sky_and_sun(sc, P):
    """天光与太阳：天光比上层暗（§0.4 峡谷光，街面常年在阴影里），太阳走西南（OBLIQUE_SUN_AZ = 225），影子落向东北。
    物理天空是绝对辐亮度：一档要同时当「可见的昼空」和「街道的照明」是做不到的——照明给足了街道就发白，
    压到街道够暗天空就变成傍晚。所以按光线路由分两档：相机光线看到正常的昼空（sky_cam），
    照明光线只拿其中很小一份（sky）。夜里天空本来就接近黑蓝，不分档。"""
    w = bpy.data.worlds.new('obl_world'); sc.world = w; nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    if P['sky'] > 0:
        sk = nt.nodes.new('ShaderNodeTexSky'); sk.sky_type = 'MULTIPLE_SCATTERING'; sk.sun_disc = False
        sk.sun_elevation = math.radians(P['el']); sk.sun_rotation = math.radians((90 - PJ.OBLIQUE_SUN_AZ) % 360); sk.altitude = 300
        lit = nt.nodes.new('ShaderNodeBackground'); nt.links.new(sk.outputs[0], lit.inputs[0]); lit.inputs[1].default_value = P['sky']
        cam = nt.nodes.new('ShaderNodeBackground'); cam.inputs[1].default_value = 1.0      # 相机看到的是干净的两段天色，不带物理天空的斑驳
        tcn = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tcn.outputs['Generated'], sp.inputs[0])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.clamp = True
        mr.inputs['From Min'].default_value = -.25; mr.inputs['From Max'].default_value = .45
        nt.links.new(sp.outputs['Z'], mr.inputs['Value'])
        ramp = nt.nodes.new('ShaderNodeValToRGB'); e0, e1 = ramp.color_ramp.elements
        e0.color = (*P['sky_horizon'], 1); e1.color = (*P['sky_zenith'], 1)
        nt.links.new(mr.outputs['Result'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], cam.inputs[0])
        lp = nt.nodes.new('ShaderNodeLightPath'); mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs['Fac'])
        # 注意：本 build 的 Mix Shader 与 Light Path 组合下，Is Camera Ray = 1 时生效的是 inputs[1]（与常见接法相反，实测确认）
        nt.links.new(cam.outputs[0], mx.inputs[1]); nt.links.new(lit.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs['Surface'])
        tick(f'world {sc.world.name}: ' + ', '.join(sorted(n.bl_idname.replace("ShaderNode", "") for n in nt.nodes))
             + f' | lit {P["sky"]} horizon {P["sky_horizon"]}')
    else:
        bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs[0].default_value = (.010, .014, .028, 1); bg.inputs[1].default_value = 1.0
        nt.links.new(bg.outputs[0], out.inputs['Surface'])
    ld = bpy.data.lights.new('sun', 'SUN'); ld.energy = P['e']; ld.color = P['sun']; ld.angle = math.radians(.8 if P['sky'] else .5)
    so = bpy.data.objects.new('sun', ld); sc.collection.objects.link(so)
    el, a = math.radians(P['el']), math.radians(PJ.OBLIQUE_SUN_AZ)
    d = Vector((math.cos(el) * math.cos(a), math.cos(el) * math.sin(a), math.sin(el)))
    so.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


def apply_period(sc, P, tod):
    """时段：场景自带的天光太阳换成时段太阳（西南），点光与自发光按倍数缩放，立面窗按比例亮起。"""
    for o in [o for o in sc.objects if o.type == 'LIGHT' and o.data.type == 'SUN']: bpy.data.objects.remove(o, do_unlink=True)
    n = 0
    for l in bpy.data.lights:
        if l.type in ('POINT', 'AREA', 'SPOT'): l.energy *= P['lamp']; n += 1
    for o in sc.objects:                                                # 顶视图的浮岛暗盘在斜视里会浮在街上：藏掉（遮挡板留着）
        if o.name.startswith('isle_shade'): o.hide_render = True
    ground_out(sc)
    water_tune()
    sky_and_sun(sc, P)
    ws = emission_scale(P['emit'])
    # 导轨光带与站台灯：俯视里是细线，35° 斜视里六条线横贯全画、比楼还抢眼，压到一半（§0.4 仍是发光的线）
    ws += emission_names(('railglow', 'stglow', 'bridgeglow'), .4)
    win = facade_windows(P['win'] * P['ws'] / 7.0, P['ws'])                # win 是开灯比例，亮度由 ws 给
    tick(f'period {tod}: lights x{P["lamp"]} ({n}), emission x{P["emit"]} ({ws} shaders), facade windows frac {P["win"]:.2f} ({win} materials)')


# ---------------------------------------------------------------- 渲染
def cycles(sc, samples, noise, bounces=4):
    sc.render.engine = 'CYCLES'
    gpu = tc.setup_render_device(sc); sc.cycles.device = 'GPU' if gpu else 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = noise
    sc.cycles.use_denoising = True
    try: sc.cycles.denoising_use_gpu = gpu
    except AttributeError: pass
    try: sc.cycles.use_light_tree = True                   # 几千盏小灯：光源树按重要性采样
    except AttributeError: pass
    c = sc.cycles; c.max_bounces = bounces; c.diffuse_bounces = min(bounces, 2); c.glossy_bounces = min(bounces, 2)
    c.transmission_bounces = min(bounces, 2); c.volume_bounces = 0; c.transparent_max_bounces = 8
    c.caustics_reflective = c.caustics_refractive = False
    c.use_auto_tile = True; c.tile_size = 2048
    sc.render.film_transparent = False                     # 中层是完整不透明画面（§0.3）
    s = sc.render.image_settings; s.file_format = 'PNG'; s.color_mode = 'RGBA'; s.color_depth = '8'; s.compression = 15
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'


def emit_only(sc):
    """源图（§0.8 第 2 条）：关掉太阳、天光与所有灯光对象；自发光不再照亮别处，成图里亮的只剩相机直接看到的发光面。"""
    for ob in sc.objects:
        if ob.type == 'LIGHT': ob.hide_render = True
        elif ob.type == 'MESH': ob.visible_diffuse = ob.visible_glossy = ob.visible_transmission = False
    for m in bpy.data.materials:
        try: m.cycles.emission_sampling = 'NONE'
        except AttributeError: pass
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
    c = sc.cycles; c.samples = 4; c.use_denoising = False; c.max_bounces = 0


def lights_uv(cam):
    """夜检：所有灯光对象的画框坐标——亮斑要么在源图里有源，要么旁边有灯。"""
    W, H = cam['frame']['px']; out = []
    for ob in bpy.context.scene.objects:
        if ob.type == 'LIGHT' and ob.data.type != 'SUN':
            u, v = PJ.project_ortho(to_m(ob.matrix_world.translation), cam)
            if 0 <= u <= 1 and 0 <= v <= 1: out.append([round(u, 5), round(v, 5)])
    return out


OB_ARGS = ('--obtod', '--obres', '--obel', '--obsun', '--obsky', '--obexp', '--obemit', '--oblamp', '--obwin', '--obws',
           '--exr', '--noise', '--fog', '--tight', '--samples', '--tod', '--out', '--res', '--no-data')
OB_KEYS = ('el', 'e', 'sky', 'exp', 'emit', 'lamp', 'win', 'ws')      # 调参用：--obsky 0.1 / --obsun 6 / --obexp -.3 / --obwin 0


def probe_pixels(sc, cam, uvs=((.03, .04), (.5, .10), (.95, .5), (.5, .93), (.2, .6))):
    """调试：从相机往几个画框坐标打射线，报出打到的对象——用来确认画面上那片灰蓝到底是什么。
    正交投影：射线互相平行（方向恒为 fwd），起点随画框坐标平移；场景是 100 m 单位，起点要按 unit / z0 换算。"""
    dg = bpy.context.evaluated_depsgraph_get(); f = cam['frame']
    R, U, F = (Vector(c) for c in (cam['right'], cam['up'], cam['fwd']))
    for u, v in uvs:
        q = Vector(f['centre_m']) + R * ((u - .5) * f['w_m']) + U * ((.5 - v) * f['h_m']) - F * 6000.0
        o = Vector((q.x / UNIT, q.y / UNIT, (q.z - Z0) / UNIT))
        hit, loc, _n, _i, ob, _m = sc.ray_cast(dg, o, F)
        tick(f'probe uv({u},{v}) -> {ob.name if hit else "sky/none"}'
             + (f' at {round(loc.x * UNIT)} m E, {round(loc.y * UNIT)} m N, alt {round(to_m(loc)[2])} m' if hit else ''))


def main(layer, city=None):
    opt = layer.opt; sc = layer.sc
    tod = str(opt.get('--obtod', 'night')); P = dict(PERIODS[tod])
    for k in OB_KEYS:
        if f'--ob{k}' in opt: P[k] = float(opt[f'--ob{k}'])
    out = os.path.abspath(str(opt['--out'])); samples = int(opt.get('--samples', 64))
    res = int(opt.get('--obres', 0) or 0); exr = str(opt.get('--exr', '0')) == '1'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cycles(sc, samples, float(opt.get('--noise', .015)))
    apply_period(sc, P, tod)
    bpy.context.view_layer.update()
    cam = fit_camera(sc)
    probe_pixels(sc, cam)
    OB.ortho_camera(sc, cam, res or None, unit=UNIT, z0=Z0)
    gl = tuple(map(float, str(opt.get('--fog', '.85,9.5,-.6')).split(',')))          # 合成器光晕：夜里的真实感主要靠它
    ti = tuple(map(float, str(opt.get('--tight', '.8,6.5,1.8')).split(',')))
    if tod == 'night': tc.glare(sc, gl[0], gl[1], gl[2], tight=ti)
    sc.view_settings.exposure = P['exp']; sc.render.filepath = out
    t1 = time.time(); bpy.ops.render.render(write_still=True)
    tick(f'WROTE {out} {sc.render.resolution_x}x{sc.render.resolution_y} in {(time.time() - t1) / 60:.1f} min')
    meta = dict(camera=cam, islands={}, markers={}, lights_uv=lights_uv(cam) if exr else [],
                period=dict(P, tod=tod), scene=dict(script='blender/tiancheng_mid.py (TC_OBLIQUE=1)', unit_m=UNIT, z0_m=Z0,
                tier=list(TIER), flat_skipped=list(FLAT), blender=bpy.app.version_string),
                render=dict(tod=tod, samples=samples, res=[sc.render.resolution_x, sc.render.resolution_y],
                            minutes=round((time.time() - t1) / 60, 2)))
    if city is not None:                                                          # 自检排除格：公园、运河（§0.8 第 3 条）
        meta['exclude'] = dict(parks=[[to_m([x, y, 0])[:2] for x, y in p] for p in getattr(city, 'parks', [])],
                               water=[[to_m([x, y, 0])[:2] for x, y in p] for p in getattr(city, 'water', [])])
    json.dump(meta, open(out + '.meta.json', 'w'), ensure_ascii=False, indent=1)
    if exr:
        emit_only(sc); OB.ortho_camera(sc, cam, res or None, unit=UNIT, z0=Z0)
        sc.render.filepath = os.path.splitext(out)[0] + '_emit.png'; bpy.ops.render.render(write_still=True)
        tick('WROTE ' + sc.render.filepath)


if __name__ == '__main__':
    sys.exit('由 blender/tiancheng_mid.py 调用（TC_OBLIQUE=1），不要单独跑')