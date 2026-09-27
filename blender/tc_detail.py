# 天城三层共用：材质（带 AO 与污渍的城市材质、波纹铁皮、沥青）与坡屋顶网格。
# 楼顶部件、路面标线、车流在 tc_city.py（按 OSM 轮廓与道路生成）。
import bpy, math
import numpy as np
import tc_common as tc
from tc_common import W, H

# ---------------- 材质 ----------------
def city_mat(name, rough=.75, ao=.018, grime=1.0, metal=0.0, layer='col'):
    """颜色属性 × 细噪声（材料斑驳）× 粗噪声（片区脏旧）× AO（女儿墙根、设备脚下、楼缝的接触阴影）。"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = tc.bsdf_of(m)
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = layer
    tco = nt.nodes.new('ShaderNodeTexCoord')
    def noise(scale, lo, hi, detail=4):
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = detail
        nt.links.new(tco.outputs['Object'], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .3; mr.inputs['From Max'].default_value = .7
        mr.inputs['To Min'].default_value = lo; mr.inputs['To Max'].default_value = hi
        nt.links.new(nz.outputs['Fac'], mr.inputs['Value']); return mr.outputs['Result']
    def mul(a, f):
        mx = nt.nodes.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = 1
        nt.links.new(a, mx.inputs['Color1'])
        if isinstance(f, float): mx.inputs['Color2'].default_value = (f, f, f, 1)
        else: nt.links.new(f, mx.inputs['Color2'])
        return mx.outputs['Color']
    c = mul(vc.outputs['Color'], noise(420, 1 - .22 * grime, 1 + .1 * grime, 6))
    c = mul(c, noise(9, 1 - .18 * grime, 1 + .05 * grime, 3))
    if ao:
        a = nt.nodes.new('ShaderNodeAmbientOcclusion'); a.inputs['Distance'].default_value = ao; a.samples = 8
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = .35; mr.inputs['To Max'].default_value = 1
        nt.links.new(a.outputs['AO'], mr.inputs['Value']); c = mul(c, mr.outputs['Result'])
    nt.links.new(c, b.inputs['Base Color'])
    rr = noise(160, rough - .15, min(1, rough + .15)); nt.links.new(rr, b.inputs['Roughness'])
    tc.set_in(b, 'Metallic', metal)
    return m
def corrugated_mat(name, rough=.55, metal=.45, scale=900, rust=1.0, layer='col', patch=0):
    """波纹铁皮：颜色属性 × 锈斑，加一层平行波纹的凹凸（俯视时是细密的明暗条）。
    patch > 0：再叠一层几米大小的斑块（换过的新板、锈穿的旧板、油污），深浅差约 ±30%——大屋面平直着色后不再是一整块匀净的灰。"""
    m = city_mat(name, rough, .012, rust, metal, layer); nt = m.node_tree; b = tc.bsdf_of(m)
    if patch:
        tco_ = next(n for n in nt.nodes if n.type == 'TEX_COORD')
        vr = nt.nodes.new('ShaderNodeTexVoronoi'); vr.inputs['Scale'].default_value = patch; nt.links.new(tco_.outputs['Object'], vr.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = .62; mr.inputs['To Max'].default_value = 1.3
        nt.links.new(vr.outputs['Color'], mr.inputs['Value'])
        mx = nt.nodes.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = 1
        link = b.inputs['Base Color'].links[0]; nt.links.new(link.from_socket, mx.inputs['Color1']); nt.links.new(mr.outputs['Result'], mx.inputs['Color2'])
        nt.links.new(mx.outputs['Color'], b.inputs['Base Color'])
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = scale; wv.wave_profile = 'SIN'
    tco = next(n for n in nt.nodes if n.type == 'TEX_COORD'); nt.links.new(tco.outputs['Object'], wv.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .35
    nt.links.new(wv.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m
def asphalt_mat(name, color, grime=1.0):
    """路面：沥青颗粒 + 补丁 + 车辙的深浅。"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = tc.bsdf_of(m)
    tco = nt.nodes.new('ShaderNodeTexCoord'); last = None
    for scale, lo, hi in ((900, .8, 1.1), (60, .75, 1.08), (6, .85, 1.05)):
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 5
        nt.links.new(tco.outputs['Object'], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .3; mr.inputs['From Max'].default_value = .7
        mr.inputs['To Min'].default_value = 1 - (1 - lo) * grime; mr.inputs['To Max'].default_value = 1 + (hi - 1) * grime
        nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
        mx = nt.nodes.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = 1
        if last is None: mx.inputs['Color1'].default_value = (*color, 1)
        else: nt.links.new(last, mx.inputs['Color1'])
        nt.links.new(mr.outputs['Result'], mx.inputs['Color2']); last = mx.outputs['Color']
    nt.links.new(last, b.inputs['Base Color']); tc.set_in(b, 'Roughness', .85)
    return m

# ---------------- 坡屋顶（三棱柱）----------------
def prism_mesh(name, P, colors, m=None):
    """P: (n, 7) = x, y, w, d, z0, 屋脊高, rot；屋脊沿本地 x（w 为长边）。两片坡面 + 两个山墙三角。"""
    P = np.asarray(P, np.float32).reshape(-1, 7); n = len(P)
    if n == 0: return None
    lx = np.array([-.5, .5, .5, -.5, -.5, .5], np.float32); ly = np.array([-.5, -.5, .5, .5, 0, 0], np.float32); lz = np.array([0, 0, 0, 0, 1, 1], np.float32)
    X, Y = lx * P[:, 2:3], ly * P[:, 3:4]; c, s = np.cos(P[:, 6:7]), np.sin(P[:, 6:7])
    V = np.empty((n, 6, 3), np.float32)
    V[:, :, 0] = P[:, :1] + X * c - Y * s; V[:, :, 1] = P[:, 1:2] + X * s + Y * c; V[:, :, 2] = P[:, 4:5] + lz * P[:, 5:6]
    quads = np.array([[0, 1, 5, 4], [2, 3, 4, 5]], np.int32); tris = np.array([[1, 2, 5], [3, 0, 4]], np.int32)
    off = (np.arange(n, dtype=np.int32) * 6)[:, None, None]
    Q = (quads[None] + off).reshape(-1, 4); T = (tris[None] + off).reshape(-1, 3)
    loops = np.concatenate([Q.ravel(), T.ravel()]); totals = np.concatenate([np.full(len(Q), 4, np.int32), np.full(len(T), 3, np.int32)])
    starts = np.concatenate([[0], np.cumsum(totals)[:-1]]).astype(np.int32)
    me = bpy.data.meshes.new(name); me.vertices.add(n * 6); me.vertices.foreach_set('co', V.ravel())
    me.loops.add(len(loops)); me.loops.foreach_set('vertex_index', loops)
    me.polygons.add(len(totals)); me.polygons.foreach_set('loop_start', starts); me.polygons.foreach_set('loop_total', totals)
    me.polygons.foreach_set('use_smooth', np.zeros(len(me.polygons), bool))   # Blender 4.1+ 新建网格默认平滑着色：楼顶四周发暗、侧面斜向渐变，改回平直
    me.update(calc_edges=True)
    C = np.concatenate([np.asarray(colors, np.float32).reshape(-1, 3), np.ones((n, 1), np.float32)], 1)
    per_face = np.concatenate([np.repeat(C, 2, 0).reshape(n, 2, 4).reshape(-1, 4), np.repeat(C, 2, 0)])   # 坡面、山墙同色
    cols = np.concatenate([np.repeat(per_face[:len(Q)], 4, 0), np.repeat(per_face[len(Q):], 3, 0)])
    ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set('color', cols.ravel())
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if m: o.data.materials.append(m)
    return o

def car_lights(cars, dirs):
    """夜景车灯：车头白、车尾红，各是左右两个小点（横向 ±.005），不连成一条光带。返回 (head, tail) 盒子与朝向角（两者一一对应）。"""
    head, tail, rot = [], [], []
    for (x, y, w, d, z0, z1), (dx, dy) in zip(cars, dirs):
        a = math.atan2(dy, dx); nx, ny = -dy, dx
        for s in (-.005, .005):
            rot.append(a)
            head.append((x + dx * .021 + nx * s, y + dy * .021 + ny * s, .005, .005, z1, z1 + .001)); tail.append((x - dx * .021 + nx * s, y - dy * .021 + ny * s, .005, .005, z1, z1 + .001))
    return np.array(head, np.float32).reshape(-1, 6), np.array(tail, np.float32).reshape(-1, 6), np.array(rot, np.float32)

# ---------------- A7：路灯的地面光池（加性、边缘渐隐的发光圆盘，不挡住下面的路面）----------------
def glow_pools(name, P, strength=1.0, seg=14, fall=2.2):
    """P: [(x, y, z, 半径, (r, g, b))]。每个光池一个扇形圆盘：圆心亮、边缘为零（按 fall 次方衰减），
    材质 = 透明 + 自发光（加性），圆盘不挡光、不投影；路灯底下的路面、人行道被照出一小片暖光，而不是只有一个亮点。"""
    P = list(P); n = len(P)
    if n == 0: return None
    a = np.linspace(0, 2 * np.pi, seg, endpoint=False); ca, sa = np.cos(a), np.sin(a)
    X = np.array([p[0] for p in P], np.float32); Y = np.array([p[1] for p in P], np.float32); Z = np.array([p[2] for p in P], np.float32)
    Rr = np.array([p[3] for p in P], np.float32); C = np.array([p[4] for p in P], np.float32).reshape(-1, 3)
    V = np.empty((n, seg + 1, 3), np.float32)
    V[:, 0, 0], V[:, 0, 1] = X, Y; V[:, 1:, 0] = X[:, None] + ca * Rr[:, None]; V[:, 1:, 1] = Y[:, None] + sa * Rr[:, None]; V[:, :, 2] = Z[:, None]
    k = np.arange(seg, dtype=np.int32); tri = np.stack([np.zeros(seg, np.int32), k + 1, (k + 1) % seg + 1], 1)
    F = (tri[None] + (np.arange(n, dtype=np.int32) * (seg + 1))[:, None, None]).reshape(-1, 3)
    me = bpy.data.meshes.new(name); me.vertices.add(n * (seg + 1)); me.vertices.foreach_set('co', V.ravel())
    me.loops.add(F.size); me.loops.foreach_set('vertex_index', F.ravel())
    me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', np.arange(0, F.size, 3, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(len(F), 3, np.int32))
    me.update(calc_edges=True)
    pc = me.color_attributes.new('pc', 'FLOAT_COLOR', 'POINT'); pf = me.color_attributes.new('pf', 'FLOAT_COLOR', 'POINT')
    pc.data.foreach_set('color', np.repeat(np.c_[C, np.ones(n, np.float32)], seg + 1, 0).ravel())
    fv = np.zeros((n, seg + 1, 4), np.float32); fv[:, 0, :] = 1; fv[:, :, 3] = 1; pf.data.foreach_set('color', fv.ravel())
    m = bpy.data.materials.new(name + '_m'); m.use_nodes = True; nt = m.node_tree
    for nd in list(nt.nodes):
        if nd.type != 'OUTPUT_MATERIAL': nt.nodes.remove(nd)
    out = next(nd for nd in nt.nodes if nd.type == 'OUTPUT_MATERIAL')
    a1 = nt.nodes.new('ShaderNodeAttribute'); a1.attribute_name = 'pc'; a2 = nt.nodes.new('ShaderNodeAttribute'); a2.attribute_name = 'pf'
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = fall; nt.links.new(a2.outputs['Fac'], pw.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(a1.outputs['Color'], em.inputs['Color'])
    sm = nt.nodes.new('ShaderNodeMath'); sm.operation = 'MULTIPLY'; sm.inputs[1].default_value = strength; nt.links.new(pw.outputs[0], sm.inputs[0]); nt.links.new(sm.outputs[0], em.inputs['Strength'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); ad = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(tr.outputs['BSDF'], ad.inputs[0]); nt.links.new(em.outputs['Emission'], ad.inputs[1]); nt.links.new(ad.outputs['Shader'], out.inputs['Surface'])
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); o.data.materials.append(m)
    o.visible_shadow = False
    try: o.visible_diffuse = False; o.visible_glossy = False     # 只给相机看：不当成光源去照别的东西（省采样、不出噪点）
    except Exception: pass
    return o
