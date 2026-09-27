# 天城 · 上层云海（tiancheng_upper.py --below clouds 时调用）。调研与取舍见 docs/clouds.md。
# 思路：云海 = 一层 metaball 融合的积云（每团 = 主团 + 一圈小团 + 顶上几个鼓包），团与团之间留出云缝，
#       云缝里是低 250 m、更暗的一层灰蓝底云（云团的影子落进去，读出厚度）。两种着色风格：
#   --clouds toon（默认，选定）：《部落冲突》式——按主太阳方向算的三阶明暗烘进底色，背光面蓝灰，边缘干净；
#   --clouds soft：写实积云对照版——更碎的团、连续明暗、细噪声凹凸。
# 岛影：旧版影子是一块块水滴形的深色斑，离岛很远——
#   ①岛下面倒锥形的岩体也在投影（水滴形），②太阳天顶角 40°，岛比云高 1–8 单位，影子偏出 1–7 单位（100–700 m）。
#   新版：岩体不投影，影子只由岛面（及上面的树和楼）投出，和俯视看到的岛形一致；
#   云只接收「云用太阳」（灯光链接）：方位角与三层共用的太阳相同（tc.SUN_ROT 的 215°），天顶角 8°，
#   影子落在岛的同一侧、离岛不远；太阳圆盘角 2.5°，高岛的影子也保得住岬角。底云另有一盏同向的灯，只有云团挡它：岛影不落进云缝。
#   主太阳照岛、不照云；云用太阳只照云。
# 伊甸庄园（主角岛）周围一圈云更密、更高、更亮。
import bpy, bmesh, math, numpy as np
import tc_common as tc
from tc_common import W, H, tick

CLOUD_ZENITH, CLOUD_SUN_ANGLE = 8, 2.5           # 云用太阳：天顶角（度）、太阳圆盘角（度，越大影子越虚）。B2 第 2 轮：14 → 8、5 → 2.5，z 7.4 的岛影偏移 ≤ 0.95 单位，保得住岬角
ISLAND_SHADOWS = False   # 用户指示（2026-09-27）：岛不往云上投影，只留白色云层对岛底的遮挡；用户批准后再改 True
EDEN_RING = False        # 用户决定：去掉伊甸外圈亮云环（伊甸靠尺寸与结界圈已最显眼）；True 恢复

# 两种风格的云团参数：间距 S、主团半径 R0 + R1 × 浓度、周围小团个数与相对半径、顶上鼓包个数
STYLES = {
    'toon': dict(S=3.0, R0=1.0, R1=1.7, sat=(3, 6), sr=(.5, .75), caps=(2, 5)),     # 大而少的圆团，轮廓干净
    'soft': dict(S=2.2, R0=.8, R1=1.3, sat=(5, 9), sr=(.35, .6), caps=(2, 5)),      # 更碎的积云
}

def _fbm(nx, ny, seed, oct=4):
    """平滑值噪声（numpy），返回 f(x, y) → 0..1。"""
    rng = np.random.default_rng(seed); grids = [rng.random((ny * 2 ** o + 2, nx * 2 ** o + 2)) for o in range(oct)]
    def f(x, y):
        v, a, tot = 0.0, 1.0, 0.0
        for o, g in enumerate(grids):
            gx = (x / (W * 1.3) + .5) * nx * 2 ** o; gy = (y / (H * 1.3) + .5) * ny * 2 ** o
            ix, iy = int(np.clip(gx, 0, g.shape[1] - 2)), int(np.clip(gy, 0, g.shape[0] - 2)); fx, fy = gx - ix, gy - iy
            sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
            top = g[iy, ix] * (1 - sx) + g[iy, ix + 1] * sx; bot = g[iy + 1, ix] * (1 - sx) + g[iy + 1, ix + 1] * sx
            v += a * (top * (1 - sy) + bot * sy); tot += a; a *= .5
        return v / tot
    return f

def _ico(sub=2):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1)
    v = np.array([p.co[:] for p in bm.verts], np.float32); f = np.array([[p.index for p in fc.verts] for fc in bm.faces], np.int32); bm.free()
    return v, f

def _puffs(islands, rng, style):
    """返回 [(x, y, z, r, 扁度, 亮度)]：云团的球。"""
    dens = _fbm(3, 2, int(rng.integers(1 << 30))); lump = _fbm(9, 6, int(rng.integers(1 << 30)), 3)
    eden = next((i for i in islands if i['id'] == 'eden'), None)
    st = STYLES[style]; S = st['S']                          # 云团间距（1 单位 = 100 m）
    out = []
    for gy in np.arange(-H * .62, H * .62, S * .87):
        for gx in np.arange(-W * .62, W * .62, S):
            x = gx + (S / 2 if round(gy / (S * .87)) % 2 else 0) + rng.uniform(-.35, .35) * S; y = gy + rng.uniform(-.3, .3) * S
            dv = dens(x, y); d = .65 * dv + .35 * lump(x, y); tint = 1.0
            if eden:                                         # 伊甸（按真实轮廓的 q）：环内侧不留缝；环外 1.6–2.6 一道浓带，环本身另排
                q = _q(eden, x, y)
                if q < 1.2: d = max(d, .5)
                if EDEN_RING and 1.6 < q < 2.6: w = 1 - abs(q - 2.1) / .5; d = max(d, .45 + .3 * w)
            if dv < .3 and d < .3: continue                  # 云缝只由低频浓度决定：lump 造成的小黑洞被填上
            R = (st['R0'] + st['R1'] * (d - .3)) * rng.uniform(.85, 1.15)
            top = -.1 + .8 * (d - .3) + rng.uniform(-.08, .08)
            fz = .62
            out.append((x, y, top - R * fz, R, fz, tint))
            for k in range(int(rng.integers(*st['sat']))):   # 周围一圈小团
                a = rng.uniform(0, 2 * math.pi); dist = R * rng.uniform(.55, 1.0); r = R * rng.uniform(*st['sr'])
                t = top - R * rng.uniform(.1, .35)
                out.append((x + math.cos(a) * dist, y + math.sin(a) * dist, t - r * fz, r, fz, tint))
            for k in range(int(rng.integers(*st['caps']))):  # 顶上的鼓包（花椰菜的顶）
                a = rng.uniform(0, 2 * math.pi); dist = R * rng.uniform(.1, .45); r = R * rng.uniform(.35, .5)
                t = top + R * rng.uniform(.05, .15)
                out.append((x + math.cos(a) * dist, y + math.sin(a) * dist, t - r * fz, r, fz, tint))
    if eden and EDEN_RING:                                   # 伊甸亮云环：沿真实轮廓 × 1.25–1.5 排约 30 团，环顶 .95（高出周围，向外投一圈影），tint 1.12
        isle = eden['isle']; n = 30
        for k in range(n):
            a = 2 * math.pi * k / n + rng.uniform(-.06, .06); q = rng.uniform(1.25, 1.5); rr = isle.r(a) * q
            x, y = isle.world(math.cos(a) * rr, math.sin(a) * rr); R = rng.uniform(.75, 1.0); top = .95 + rng.uniform(-.04, .06)
            out.append((x, y, top - R * .62, R, .62, 1.12))
            for j in range(4):
                b = rng.uniform(0, 2 * math.pi); r = R * rng.uniform(.4, .6)
                out.append((x + math.cos(b) * R * .6, y + math.sin(b) * R * .6, top + R * .05 - r * .62, r, .62, 1.12))
    # 不许穿过低空的岛：在岛的投影范围（外扩一点）里，云顶压到岛面以下
    P = np.array(out, np.float32)
    for i in islands:                                        # 按真实轮廓（长条岛到 1.43 rx 也罩得住）
        c, s = math.cos(-i['rot']), math.sin(-i['rot']); dx, dy = P[:, 0] - i['x'], P[:, 1] - i['y']; lx, ly = dx * c - dy * s, dx * s + dy * c
        hit = np.hypot(lx, ly) < i['isle'].r_np(np.arctan2(ly, lx)) * 1.15 + P[:, 3]; lim = i['z'] - .35
        over = hit & (P[:, 2] + P[:, 3] * P[:, 4] > lim); P[over, 2] = lim - P[over, 3] * P[over, 4]
    return P

def _mesh(P, name):
    v0, f0 = _ico(2); n, nv = len(P), len(v0)
    V = (v0[None] * np.stack([P[:, 3], P[:, 3], P[:, 3] * P[:, 4]], 1)[:, None]) + P[:, None, :3]
    F = (f0[None] + (np.arange(n) * nv)[:, None, None]).reshape(-1, 3)
    me = bpy.data.meshes.new(name); me.vertices.add(n * nv); me.vertices.foreach_set('co', V.reshape(-1))
    me.loops.add(len(F) * 3); me.loops.foreach_set('vertex_index', F.reshape(-1))
    me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', np.arange(len(F), dtype=np.int32) * 3)
    me.update(); me.validate()
    me.polygons.foreach_set('use_smooth', np.ones(len(F), bool))
    at = me.attributes.new('tint', 'FLOAT', 'POINT'); at.data.foreach_set('value', np.repeat(P[:, 5], nv))
    return me

def _q(eden, x, y):
    """到伊甸的「轮廓倍数」：点到岛心距离 / 该方向的岸线半径（标量或 numpy）。"""
    isle = eden['isle']; c, s = math.cos(-eden['rot']), math.sin(-eden['rot']); dx, dy = x - eden['x'], y - eden['y']
    lx, ly = dx * c - dy * s, dx * s + dy * c
    if np.ndim(lx): return np.hypot(lx, ly) / isle.r_np(np.arctan2(ly, lx))
    return math.hypot(lx, ly) / isle.r(math.atan2(ly, lx))

def _tint(x, y, eden):
    """伊甸亮环：沿真实轮廓 × 1.05–1.75 提亮，1.4 倍处最亮（+12 %）。"""
    if not eden or not EDEN_RING: return np.ones_like(x)
    q = _q(eden, x, y)
    return (1 + .12 * np.clip(1 - np.abs(q - 1.4) / .35, 0, 1)).astype(np.float32)

def _meta(P, name, res=.09, eden=None):
    """metaball：各团互相融合成一整块积云（没有球与球相交的折痕），再转成网格；tint 取最近的团。"""
    mb = bpy.data.metaballs.new(name); mb.resolution = mb.render_resolution = res; mb.threshold = .6
    for x, y, z, r, fz, t in P:
        el = mb.elements.new(type='ELLIPSOID'); el.co = (x, y, z); el.radius = r * 1.25; el.size_x = el.size_y = 1; el.size_z = fz
    tmp = bpy.data.objects.new(name + '_mb', mb); bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.metaballs.remove(mb)
    co = np.zeros(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    tint = _tint(co[:, 0], co[:, 1], eden)
    at = me.attributes.new('tint', 'FLOAT', 'POINT'); at.data.foreach_set('value', tint)
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), bool))
    return me

def _cloud_mat(style):
    """云的颜色 = 按「主太阳方向」算的明暗（烘进底色：toon 三阶、soft 连续）× 伊甸亮环；
    再由几乎垂直的云用太阳照亮——顶面受光均匀，岛影直接压暗底色，影子干净。云的明暗方向因此与岛上的光一致。"""
    m = bpy.data.materials.new(f'cloud_{style}'); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL'); N.remove(tc.bsdf_of(m))
    geo = N.new('ShaderNodeNewGeometry'); nrm = geo.outputs['Normal']
    if style == 'soft':                                                              # 碎细节：噪声凹凸改法线（明暗跟着起伏）
        tco = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.5; nz.inputs['Detail'].default_value = 4
        nz.inputs['Roughness'].default_value = .6; L.new(tco.outputs['Object'], nz.inputs['Vector'])
        bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .18; bp.inputs['Distance'].default_value = .3
        L.new(nz.outputs['Fac'], bp.inputs['Height']); nrm = bp.outputs['Normal']
    ls = -tc.sun_dir()                                                               # 指向主太阳
    dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = (ls.x, ls.y, ls.z)
    L.new(nrm, dot.inputs[0])
    up = N.new('ShaderNodeSeparateXYZ'); L.new(nrm, up.inputs['Vector'])             # 朝上的面更亮、侧面与底部更暗（团与团之间的缝）
    mix = N.new('ShaderNodeMath'); mix.operation = 'MULTIPLY_ADD'; mix.inputs[1].default_value = .6
    L.new(dot.outputs['Value'], mix.inputs[0])
    z4 = N.new('ShaderNodeMath'); z4.operation = 'MULTIPLY'; z4.inputs[1].default_value = .4; L.new(up.outputs['Z'], z4.inputs[0]); L.new(z4.outputs['Value'], mix.inputs[2])
    ramp = N.new('ShaderNodeValToRGB'); cr = ramp.color_ramp; L.new(mix.outputs['Value'], ramp.inputs['Fac'])
    shadow, mid, lit = (.46, .52, .64, 1), (.62, .67, .77, 1), (.80, .81, .83, 1)   # 背光蓝灰 → 过渡 → 受光（不到纯白，留余量给岛）
    cr.elements[0].color, cr.elements[1].color = shadow, lit
    if style == 'toon':
        # 三阶，但阶与阶之间留 0.05 的窄过渡：8K 下不会沿网格面片出现锯齿
        for pos, c in ((.31, shadow), (.36, mid), (.57, mid), (.62, lit)): e = cr.elements.new(pos); e.color = c
    else:
        cr.elements[0].position = .1; cr.elements[1].position = .85
        e = cr.elements.new(.45); e.color = mid
    at = N.new('ShaderNodeAttribute'); at.attribute_name = 'tint'
    mul = N.new('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs['Fac'].default_value = 1
    L.new(ramp.outputs['Color'], mul.inputs[1]); L.new(at.outputs['Fac'], mul.inputs[2])
    dif = N.new('ShaderNodeBsdfDiffuse'); L.new(mul.outputs['Color'], dif.inputs['Color'])
    L.new(dif.outputs['BSDF'], out.inputs['Surface'])
    return m

def build_cloud_sea(layer, islands, sun):
    """在上层场景里建云海。islands：tiancheng_upper.py 的岛列表（x, y, z, rx, ry, rot, id）；sun：主太阳对象。"""
    style = str(layer.opt.get('--clouds', 'toon'))
    for n in ('cloud_floor', 'cloud_wisps'):                # 旧版的两张噪声平面
        o = bpy.data.objects.get(n)
        if o: bpy.data.objects.remove(o, do_unlink=True)
    for o in list(layer.sc.objects):                         # 岛下倒锥形的岩体不投影（旧版水滴形怪影的来源）
        if o.type == 'MESH' and any(ms and ms.name.startswith('rock') for ms in o.data.materials): o.visible_shadow = False
    if layer.data_only: return
    rng = np.random.default_rng(9107)
    col = bpy.data.collections.new('clouds'); layer.sc.collection.children.link(col)
    P = _puffs(islands, rng, style)
    cl = bpy.data.objects.new('cloud_sea', (_meta(P, 'cloud_sea', layer.f('--cloud-res', min(.09, max(.035, .09 * 2000 / layer.res))), next((i for i in islands if i['id'] == 'eden'), None)) if layer.opt.get('--cloud-geo', 'meta') == 'meta' else _mesh(P, 'cloud_sea'))); col.objects.link(cl); cl.data.materials.append(_cloud_mat(style))
    # 云缝下面的底云：低 250 m、更暗的灰蓝——云团的影子落进云缝，一眼读出云层的厚度
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -2.6)); base = bpy.context.active_object; base.name = 'cloud_base'
    base.scale = (W * 1.4, H * 1.4, 1)
    for c in base.users_collection: c.objects.unlink(base)
    col.objects.link(base)
    bm_ = tc.noise_mat('cloud_base', (.40, .47, .60), (.50, .56, .68), 1.2, .95, .0); base.data.materials.append(bm_)
    bb = tc.bsdf_of(bm_); lk = next(l for l in bm_.node_tree.links if l.to_node == bb and l.to_socket.name == 'Base Color')
    em_in = bb.inputs.get('Emission Color') or bb.inputs.get('Emission')
    if em_in is not None: bm_.node_tree.links.new(lk.from_socket, em_in); tc.set_in(bb, 'Emission Strength', .2)   # 底云自发光 0.2：云缝最深处也不发黑
    # 灯光链接：主太阳不照云；云用太阳只照云团（岛照样挡它 → 岛影落在云顶）；
    # 底云单独一盏同方向的灯，只让云团挡它——云团照样在云缝里投蓝灰影带，岛影不再落进云缝成远处的暗斑
    ex = bpy.data.collections.new('cloud_ex'); rx = bpy.data.collections.new('cloud_rx'); rxb = bpy.data.collections.new('cloud_rx_base'); blk = bpy.data.collections.new('cloud_blk_base')
    for o in (cl, base): ex.objects.link(o); ex.collection_objects[-1].light_linking.link_state = 'EXCLUDE'
    rx.objects.link(cl); rxb.objects.link(base); blk.objects.link(cl)
    sun.light_linking.receiver_collection = ex
    for nm, rcv in (('cloud_sun', rx), ('cloud_sun_base', rxb)):
        cs = bpy.data.lights.new(nm, 'SUN'); cs.energy = sun.data.energy * layer.f('--cloud-light', .7); cs.color = sun.data.color; cs.angle = math.radians(CLOUD_SUN_ANGLE)
        co = bpy.data.objects.new(nm, cs); col.objects.link(co)
        co.rotation_euler = (math.radians(CLOUD_ZENITH), 0, tc.SUN_ROT[2]); co.light_linking.receiver_collection = rcv
        if nm == 'cloud_sun_base' or not ISLAND_SHADOWS: co.light_linking.blocker_collection = blk   # 只让云团挡光：ISLAND_SHADOWS 关时岛不在云上投影
    tick(f'cloud sea ({style}): {len(P)} puffs')
