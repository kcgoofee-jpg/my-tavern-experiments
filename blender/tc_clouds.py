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
import bpy, bmesh, math, os, numpy as np
from mathutils import Vector, Euler
import tc_common as tc
from tc_common import W, H, tick

CLOUD_ZENITH, CLOUD_SUN_ANGLE = 8, 2.5           # 云用太阳：天顶角（度）、太阳圆盘角（度，越大影子越虚）。B2 第 2 轮：14 → 8、5 → 2.5，z 7.4 的岛影偏移 ≤ 0.95 单位，保得住岬角
ISLAND_SHADOWS = False   # 用户指示（2026-09-27）：岛不往云上投影，只留白色云层对岛底的遮挡；用户批准后再改 True
EDEN_RING = False        # 用户决定：去掉伊甸外圈亮云环（伊甸靠尺寸与结界圈已最显眼）；True 恢复
CLOUD_STYLE = 'white'    # 'white'（发布版，方案 B：不动的纯白云底 + 岛缘柔白云边，见 build_white_floor）| 'toon'（旧 metaball 云海）| 'veil'（薄纱云原型）。命令行 --clouds 临时切换。
                         # veil：下方是城市（强制 --below city），城市上方两层半透明的斜向云板 + 岛缘一圈柔白云边；岛不往城市上投影。见 build_veil

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

def _lip_puffs(islands, rng):
    """岛缘压边小云：每座岛 1–3 个云瓣（伊甸 6 瓣，含东南岩楔），瓣 = 沿岸线重叠的 3–6 团（团距 .55 R，融成一整块），
    团心在岸线 .97–1.04 倍处、顶高略高于岛面，外侧再贴 1–2 团往外收；按弧长累计覆盖 12–26 % 周长，优先世界南侧（背光）；
    避开停靠平台 / 码头方向（码头不被云盖住）。"""
    out = []
    for i in islands:
        e = i['isle']; big = i['id'] == 'eden'
        ang = np.arange(0, 2 * math.pi, .05); rr_ = np.array([e.r(a) for a in ang]); per = float(np.sum(rr_ * .05))
        target = per * rng.uniform(.15, .3); n = 6 if big else (1 if per < 1.6 else int(rng.integers(2, 4)))
        south = e.south(); avoid = [d[3] for d in (e.dock, getattr(e, 'dock_small', None)) if d]
        angs = []
        for k in range(80):
            if len(angs) >= n: break
            a = south + rng.normal(0, .8 if not big else 1.2)
            if big and k == 0: a = -math.pi / 2 + .62                                   # 伊甸东南缘露岩的楔形
            if any(abs(math.remainder(a - b, 2 * math.pi)) < .5 for b in avoid): continue
            if any(abs(math.remainder(a - b, 2 * math.pi)) < .6 for b in angs): continue
            angs.append(a)
        for a in angs:
            L = target / max(1, len(angs)); rr = e.r(a)
            R = min(.34 if big else .16, max(.07, L * .4)); nseg = max(3, int(L / (R * .55)) + 1)
            top0 = e.z + rng.uniform(.012, .03)
            for j in range(nseg):
                u = (j - (nseg - 1) / 2) / max(1, (nseg - 1) / 2)                      # -1…1 沿弧
                b = a + u * (L / 2) / max(rr, .1); rb = e.r(b)
                off = rng.uniform(.97, 1.04); Rj = R * (1 - .35 * abs(u)) * rng.uniform(.9, 1.1)   # 瓣中间厚、两头收
                x, y = e.world(math.cos(b) * rb * off, math.sin(b) * rb * off)
                top = top0 + e.h(math.cos(b) * rb * .97, math.sin(b) * rb * .97) - .01 * abs(u)
                out.append((x, y, top - Rj * .5, Rj, .5, 1.0))
                for _ in range(int(rng.integers(1, 3))):                               # 外侧贴一两团，往外收成缓坡
                    c = b + rng.normal(0, .04); rc = e.r(c) * (1 + Rj * rng.uniform(.6, 1.0) / max(e.r(c), .1)); r2 = Rj * rng.uniform(.7, .9)
                    xx, yy = e.world(math.cos(c) * rc, math.sin(c) * rc)
                    out.append((xx, yy, top - .01 - r2 * .5, r2, .5, 1.0))
    return np.array(out, np.float32)

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

SKY = ((.55, .65, .8), .35)   # 与 tiancheng_upper.py 的 world 一致：发光版云按它补「天光」一项
EMIT_GAIN = 1.0              # 发光版整体增益（草稿 A/B 对齐旧版亮度用）

def _cloud_mat_emit(style, sun, lip=False):
    """ISLAND_SHADOWS 关时的云：明暗全部烘进自发光，不接收任何灯光与天光 → 岛（及树、楼）对云既不投影、也不遮天光（没有暗晕）。
    颜色 = 三阶 ramp × tint × [云用太阳直射项 max(n·L, 0) + 天光项 (1 + n_z) / 2 × 只算云自身的 AO]；
    AO 节点 only_local：只看云自己的几何（团与团之间的缝照样变暗），看不到岛。lip=True：岛缘压边的小云——ramp 上移，不带暗面。"""
    m = bpy.data.materials.new(f'cloud_{style}_emit' + ('_lip' if lip else '')); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL'); N.remove(tc.bsdf_of(m))
    geo = N.new('ShaderNodeNewGeometry'); nrm = geo.outputs['Normal']
    ls = -tc.sun_dir()
    dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = (ls.x, ls.y, ls.z); L.new(nrm, dot.inputs[0])
    up = N.new('ShaderNodeSeparateXYZ'); L.new(nrm, up.inputs['Vector'])
    mix = N.new('ShaderNodeMath'); mix.operation = 'MULTIPLY_ADD'; mix.inputs[1].default_value = .6; L.new(dot.outputs['Value'], mix.inputs[0])
    z4 = N.new('ShaderNodeMath'); z4.operation = 'MULTIPLY'; z4.inputs[1].default_value = .4; L.new(up.outputs['Z'], z4.inputs[0]); L.new(z4.outputs['Value'], mix.inputs[2])
    fac = mix.outputs['Value']
    if lip:                                                                          # 压边小云：ramp 输入上移 .3，背光面也落在过渡 / 受光阶
        lf = N.new('ShaderNodeMath'); lf.operation = 'ADD'; lf.inputs[1].default_value = .3; L.new(fac, lf.inputs[0]); fac = lf.outputs['Value']
    ramp = N.new('ShaderNodeValToRGB'); cr = ramp.color_ramp; L.new(fac, ramp.inputs['Fac'])
    shadow, mid, lit = (.46, .52, .64, 1), (.62, .67, .77, 1), (.80, .81, .83, 1)
    cr.elements[0].color, cr.elements[1].color = shadow, lit
    if style == 'toon':
        for pos, c in ((.31, shadow), (.36, mid), (.57, mid), (.62, lit)): e = cr.elements.new(pos); e.color = c
    else:
        cr.elements[0].position = .1; cr.elements[1].position = .85; e = cr.elements.new(.45); e.color = mid
    at = N.new('ShaderNodeAttribute'); at.attribute_name = 'tint'
    alb = N.new('ShaderNodeMixRGB'); alb.blend_type = 'MULTIPLY'; alb.inputs['Fac'].default_value = 1; L.new(ramp.outputs['Color'], alb.inputs[1]); L.new(at.outputs['Fac'], alb.inputs[2])
    # 直射：云用太阳（天顶角 CLOUD_ZENITH）照度 / π × cos
    lc = Vector((0, 0, 1)); lc.rotate(Euler((math.radians(CLOUD_ZENITH), 0, tc.SUN_ROT[2])))
    ds = N.new('ShaderNodeVectorMath'); ds.operation = 'DOT_PRODUCT'; ds.inputs[1].default_value = tuple(lc); L.new(nrm, ds.inputs[0])
    dcl = N.new('ShaderNodeClamp'); L.new(ds.outputs['Value'], dcl.inputs['Value'])
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.only_local = True; ao.inputs['Distance'].default_value = 1.2
    try: ao.samples = 8
    except Exception: pass
    aof = N.new('ShaderNodeMapRange'); aof.inputs['To Min'].default_value = .82; L.new(ao.outputs['AO'], aof.inputs['Value'])   # 直射项：团缝略暗（代替云对云的投影）
    k_sun = sun.data.energy * .7 / math.pi
    sd = N.new('ShaderNodeMath'); sd.operation = 'MULTIPLY'; L.new(dcl.outputs['Result'], sd.inputs[0]); L.new(aof.outputs['Result'], sd.inputs[1])
    sunc = N.new('ShaderNodeMixRGB'); sunc.blend_type = 'MULTIPLY'; sunc.inputs['Fac'].default_value = 1; sunc.inputs[1].default_value = tuple(c * k_sun for c in sun.data.color) + (1,)
    L.new(sd.outputs['Value'], sunc.inputs[2])
    # 天光：半球可见度 (1 + n_z) / 2 × 云自身 AO
    hz = N.new('ShaderNodeMath'); hz.operation = 'MULTIPLY_ADD'; hz.inputs[1].default_value = .5; hz.inputs[2].default_value = .5; L.new(up.outputs['Z'], hz.inputs[0])
    hs = N.new('ShaderNodeMath'); hs.operation = 'MULTIPLY'; L.new(hz.outputs['Value'], hs.inputs[0]); L.new(ao.outputs['AO'], hs.inputs[1])
    skyc = N.new('ShaderNodeMixRGB'); skyc.blend_type = 'MULTIPLY'; skyc.inputs['Fac'].default_value = 1; skyc.inputs[1].default_value = tuple(c * SKY[1] * 1.25 for c in SKY[0]) + (1,)
    L.new(hs.outputs['Value'], skyc.inputs[2])
    tot = N.new('ShaderNodeMixRGB'); tot.blend_type = 'ADD'; tot.inputs['Fac'].default_value = 1; L.new(sunc.outputs['Color'], tot.inputs[1]); L.new(skyc.outputs['Color'], tot.inputs[2])
    col = N.new('ShaderNodeMixRGB'); col.blend_type = 'MULTIPLY'; col.inputs['Fac'].default_value = 1; L.new(alb.outputs['Color'], col.inputs[1]); L.new(tot.outputs['Color'], col.inputs[2])
    em = N.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = EMIT_GAIN; L.new(col.outputs['Color'], em.inputs['Color'])
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    return m

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
    shadows = ISLAND_SHADOWS if layer.opt.get('--island-shadows') is None else str(layer.opt['--island-shadows']) not in ('0', 'False', 'off')   # 验收差分用：--island-shadows 1 临时打开
    for n in ('cloud_floor', 'cloud_wisps'):                # 旧版的两张噪声平面
        o = bpy.data.objects.get(n)
        if o: bpy.data.objects.remove(o, do_unlink=True)
    for o in list(layer.sc.objects):                         # 岛下倒锥形的岩体不投影（旧版水滴形怪影的来源）
        if o.type == 'MESH' and any(ms and ms.name.startswith('rock') for ms in o.data.materials): o.visible_shadow = False
    if layer.data_only: return
    rng = np.random.default_rng(9107)
    col = bpy.data.collections.new('clouds'); layer.sc.collection.children.link(col)
    P = _puffs(islands, rng, style)
    cl = bpy.data.objects.new('cloud_sea', (_meta(P, 'cloud_sea', layer.f('--cloud-res', min(.09, max(.035, .09 * 2000 / layer.res))), next((i for i in islands if i['id'] == 'eden'), None)) if layer.opt.get('--cloud-geo', 'meta') == 'meta' else _mesh(P, 'cloud_sea'))); col.objects.link(cl)
    cl.data.materials.append(_cloud_mat(style) if shadows else _cloud_mat_emit(style, sun))
    if not shadows and layer.opt.get('--no-lip') is None:     # 去影后：岛缘补白云压边（盖住岛缘 10–30 % 周长，优先南侧 / 背光侧），岛不读成贴纸
        LP = _lip_puffs(islands, np.random.default_rng(4411))
        if len(LP):
            lip = bpy.data.objects.new('cloud_lip', _meta(LP, 'cloud_lip', layer.f('--lip-res', min(.03, max(.012, .03 * 2000 / layer.res))))); col.objects.link(lip)
            lip.data.materials.append(_cloud_mat_emit(style, sun, lip=True)); lip.visible_shadow = False
            tick(f'cloud lip: {len(LP)} puffs')
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
        if nm == 'cloud_sun_base' or not shadows: co.light_linking.blocker_collection = blk   # 只让云团挡光：ISLAND_SHADOWS 关时岛不在云上投影
    if layer.opt.get('--island-ghost'):                      # 验收用：岛（及树、楼、塔）只对相机可见，不参与任何光线（影子、环境光遮挡、反射）→ 与正常版做差分
        cl_set = set(col.all_objects)
        for o in layer.sc.objects:
            if o.type == 'MESH' and o not in cl_set:
                o.visible_diffuse = o.visible_glossy = o.visible_transmission = o.visible_shadow = o.visible_volume_scatter = False
        tick('island-ghost: islands camera-only')
    tick(f'cloud sea ({style}): {len(P)} puffs')

# ---------------- 《部落冲突》式薄纱云（CLOUD_STYLE='veil' 原型）----------------
VEIL_LAYERS = (   # (z, 覆盖率, 不透明度范围, 云板尺寸倍数, 种子)：低层密、高层稀薄；岛最低 z = 1.0，都在岛下面
    (.62, .38, (.35, .65), 1.0, 7301),
    (.88, .20, (.15, .3), 1.35, 7302),
)
VEIL_EMIT = 1.0   # 自发光增益（Standard 视图下 1.0 = 贴图原色）
VEIL_TINT = None  # 时段色调（tiancheng_upper --tod 设置；None = 不染色，与此前一致）

def _veil_image(name, rgba):
    h, w = rgba.shape[:2]; img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=True)
    px = rgba[::-1].copy(); px[..., :3] = px[..., :3] ** 2.2                      # 贴图按显示色设计 → 线性；Blender 图像原点在左下
    img.colorspace_settings.name = 'Non-Color'; img.pixels.foreach_set(px.astype(np.float32).ravel()); img.update()
    return img

def _veil_plane(name, img, z, col):
    """铺满画面的平面：颜色 = 贴图 RGB 自发光，不透明度 = 贴图 alpha。不受光、不投影 → 岛与城市都不在它上面留影子。"""
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, z)); o = bpy.context.active_object; o.name = name; o.scale = (W, H, 1)
    for c in o.users_collection: c.objects.unlink(o)
    col.objects.link(o)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL'); N.remove(tc.bsdf_of(m))
    tx = N.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Cubic'; tx.extension = 'CLIP'
    em = N.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = VEIL_EMIT
    if VEIL_TINT is None: L.new(tx.outputs['Color'], em.inputs['Color'])
    else:
        mu = N.new('ShaderNodeMix'); mu.data_type = 'RGBA'; mu.blend_type = 'MULTIPLY'; mu.inputs['Factor'].default_value = 1.0
        L.new(tx.outputs['Color'], mu.inputs[6]); mu.inputs[7].default_value = (*VEIL_TINT, 1); L.new(mu.outputs[2], em.inputs['Color'])
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    L.new(tx.outputs['Alpha'], mx.inputs['Fac']); L.new(tr.outputs['BSDF'], mx.inputs[1]); L.new(em.outputs['Emission'], mx.inputs[2])
    L.new(mx.outputs['Shader'], out.inputs['Surface'])
    if hasattr(m, 'blend_method'): m.blend_method = 'BLEND'
    o.data.materials.append(m)
    o.visible_shadow = o.visible_diffuse = o.visible_glossy = False
    return o

def _lip_rgba(islands, h, w, rng, gain=.6, col=None):
    """岛缘柔白云边：岛轮廓外一圈约 0.1–0.2 单位宽、alpha ≤ .6、边缘很虚的白（岛面本身会盖住轮廓里面）；沿岸用噪声调浓淡，南侧略厚。"""
    import tc_estates as te, cloud_veil as cv
    u = w / W; mask = np.zeros((h, w), np.float32); ys, xs = np.mgrid[0:h, 0:w]
    for i in islands:
        if i['id'] == 'eden' and os.environ.get('TC_EDEN_CUT'): continue                   # 伊甸由 estate2 抠图提供自己的岛缘：不再在名义椭圆外画一圈白晕
        O = np.array(i['isle'].outline_world(1.0, 128)); P = np.stack([(O[:, 0] / W + .5) * w, (.5 - O[:, 1] / H) * h], 1)
        x0, x1 = int(max(0, P[:, 0].min() - 2)), int(min(w, P[:, 0].max() + 2)); y0, y1 = int(max(0, P[:, 1].min() - 2)), int(min(h, P[:, 1].max() + 2))
        if x0 >= x1 or y0 >= y1: continue
        mask[y0:y1, x0:x1] = np.maximum(mask[y0:y1, x0:x1], te.pip_np(xs[y0:y1, x0:x1] + .5, ys[y0:y1, x0:x1] + .5, [tuple(p) for p in P]).astype(np.float32))
    a = cv._blur(mask, .1 * u, .1 * u)
    nz = cv._lowfreq(h, w, rng, 22)
    a = np.clip(a * 2.4, 0, 1) * (.5 + .5 * nz) * gain
    out = np.zeros((h, w, 4), np.float32); out[..., :3] = cv.TOP if col is None else col; out[..., 3] = a
    return out

def build_veil(layer, islands, sun, below):
    """《部落冲突》式薄纱云（原型）：城市上方两层半透明斜向云板，岛缘柔白云边；岛不往城市上投影。
    below：下方城市（及霾）的对象集合——主太阳不照它们，另一盏同向的「城市太阳」只照它们、也只被它们自己挡（楼影照旧，岛影没有）。"""
    import cloud_veil as cv
    col = bpy.data.collections.new('clouds'); layer.sc.collection.children.link(col)
    tw = int(min(layer.res, 4096)); th = int(round(tw * H / W)); u = tw / W
    for k, (z, cover, op, size, seed) in enumerate(VEIL_LAYERS if layer.opt.get('--no-veil') is None else ()):   # --no-veil：只留岛缘云边（动效底图用）
        rng = np.random.default_rng(seed)
        sl = cv.field_slabs(th, tw, rng, u, cover=cover, op=op, size=size)
        rgba = cv.paint(th, tw, sl, blur=(5 * u / 40 * size, 3 * u / 40 * size), soft=3 * u / 40)
        _veil_plane(f'veil_{k}', _veil_image(f'veil_{k}', rgba), z, col); tick(f'veil {k}: {len(sl)} slabs')
    if layer.opt.get('--no-lip') is None:
        _veil_plane('veil_lip', _veil_image('veil_lip', _lip_rgba(islands, th, tw, np.random.default_rng(4412))), .97, col)
    relight_city(sun, below, col)

def relight_city(sun, below, col):
    """下方城市换一盏同向的「城市太阳」：主太阳不照城市，城市太阳只照城市、也只被城市自己挡 → 楼影照旧，岛影没有（用户硬规定：岛不投影）。
    薄纱原型与 upper_city（--below city）共用。"""
    below = [o for o in below if o.type == 'MESH']
    ex = bpy.data.collections.new('city_ex'); rx = bpy.data.collections.new('city_rx')
    for o in below:
        ex.objects.link(o); ex.collection_objects[-1].light_linking.link_state = 'EXCLUDE'; rx.objects.link(o)
    sun.light_linking.receiver_collection = ex
    cs = bpy.data.lights.new('city_sun', 'SUN'); cs.energy = sun.data.energy; cs.color = sun.data.color; cs.angle = sun.data.angle
    co = bpy.data.objects.new('city_sun', cs); col.objects.link(co); co.rotation_euler = sun.rotation_euler
    co.light_linking.receiver_collection = rx; co.light_linking.blocker_collection = rx   # 只有城市自己挡城市的光：没有岛影
    tick(f'city: {len(below)} objects re-lit without island shadows')

# ---------------- 方案 B：不动的纯白云底（CLOUD_STYLE='white'，发布版）----------------
# 用户批准方案 B：「底图可以做个不动的纯白云铺满」。岛下面一整片不透明的近白云底（只有极轻的低频起伏，不透城市、没有灰纱），
# 岛缘一圈柔白云边（同薄纱原型的 lip_only）。云底与云边都是自发光、不受光 → 岛不可能在云上投影（硬规定）。
# 岛本身的建模、材质、主太阳与 toon 版完全一样（岩体同样不投影）；漂移的云由查看器 map/viewer.html 实时叠加。
WHITE_FLOOR = ((.885, .905, .935), (.965, .972, .985))   # 显示色：云谷 ≈ #E2E7EE / 云顶 ≈ #F6F8FB（对比约 8 %：仍读作一片亮白，但比漂移精灵暗，精灵看得见；评审 r1）
WHITE_LIP = (1.0, 1.0, 1.0)                           # 云边比云底更白：在白底上也看得出「岛缘有一圈云」

def build_white_floor(layer, islands, sun):
    import cloud_veil as cv
    for n in ('cloud_floor', 'cloud_wisps'):
        o = bpy.data.objects.get(n)
        if o: bpy.data.objects.remove(o, do_unlink=True)
    for o in list(layer.sc.objects):
        if o.type == 'MESH' and any(ms and ms.name.startswith('rock') for ms in o.data.materials): o.visible_shadow = False
    if layer.data_only: return
    col = bpy.data.collections.new('clouds'); layer.sc.collection.children.link(col)
    tw = int(min(layer.res, 4096)); th = int(round(tw * H / W)); rng = np.random.default_rng(5150)
    f = .45 * cv._lowfreq(th, tw, rng, 9) + .55 * cv._lowfreq(th, tw, rng, 26)   # 柔和的云团起伏（团约为岛的 0.5–1.5 倍，无细碎噪点）
    f = np.clip((f - .3) / .4, 0, 1); f = cv._blur(f * f * (3 - 2 * f), th / 90, th / 90)[..., None]   # smoothstep：云顶成片、云谷收窄；再高斯模糊去掉插值网格的方块感
    rgba = np.ones((th, tw, 4), np.float32); rgba[..., :3] = np.array(WHITE_FLOOR[0]) * (1 - f) + np.array(WHITE_FLOOR[1]) * f
    fl = _veil_plane('white_floor', _veil_image('white_floor', rgba), -.6, col); fl.scale = (W * 1.3, H * 1.3, 1)
    fl.data.materials[0].node_tree.nodes['Image Texture'].extension = 'EXTEND'
    if layer.opt.get('--no-lip') is None:
        _veil_plane('white_lip', _veil_image('white_lip', _lip_rgba(islands, th, tw, np.random.default_rng(4412), layer.f('--lip-gain', 1.0), WHITE_LIP)), .97, col)
    tick('white cloud floor + lip')
