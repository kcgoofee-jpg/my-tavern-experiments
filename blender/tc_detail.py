# 天城三层共用：细节层——楼体部件（女儿墙、退台塔楼、坡顶、屋顶设备、太阳能板、屋顶花园、天窗）、
# 路面标线与斑马线、车流、带 AO 与污渍的城市材质、波纹铁皮材质。
# 只用调用方传入的 rng（与城市生成的随机序列分开），不改变任何楼的平面位置。
# 真实航拍的「真」主要来自屋顶的层次与街道上的小东西，而不是楼的数量。
import bpy, math
import numpy as np
import tc_common as tc
from tc_common import CELL, W, H

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
def corrugated_mat(name, rough=.55, metal=.45, scale=900, rust=1.0, layer='col'):
    """波纹铁皮：颜色属性 × 锈斑，加一层平行波纹的凹凸（俯视时是细密的明暗条）。"""
    m = city_mat(name, rough, .012, rust, metal, layer); nt = m.node_tree; b = tc.bsdf_of(m)
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
    me.update(calc_edges=True)
    C = np.concatenate([np.asarray(colors, np.float32).reshape(-1, 3), np.ones((n, 1), np.float32)], 1)
    per_face = np.concatenate([np.repeat(C, 2, 0).reshape(n, 2, 4).reshape(-1, 4), np.repeat(C, 2, 0)])   # 坡面、山墙同色
    cols = np.concatenate([np.repeat(per_face[:len(Q)], 4, 0), np.repeat(per_face[len(Q):], 3, 0)])
    ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set('color', cols.ravel())
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if m: o.data.materials.append(m)
    return o

# ---------------- 楼体部件 ----------------
STYLE = {   # 各层的屋顶风格（概率与配色）
    'day':   dict(pitch_area=.012, tower=.55, pitch=.35, solar=.12, green=.10, glass=.06, hvac=.7, parapet=1.25,
                  tiles=[(.42, .2, .14), (.3, .3, .32), (.22, .22, .24), (.5, .36, .24)]),
    'night': dict(pitch_area=.012, tower=.65, pitch=.12, solar=.04, green=.02, glass=.1, hvac=.8, parapet=1.35,
                  tiles=[(.08, .08, .09), (.1, .08, .07)]),
    'low':   dict(pitch_area=.04, tower=.0, pitch=.3, solar=0, green=0, glass=0, hvac=.35, parapet=1.2,
                  tiles=[(.3, .15, .09), (.2, .2, .2), (.26, .22, .17)]),
}
def building_kit(B, C, rng, style='day', cap=.3, ztop_min=None):
    """B: (n, 6) 楼体盒子 x, y, w, d, z0, z1；C: (n, 3) 颜色。
    返回 dict：boxes / cols（盒子部件）、prisms / pcols（坡顶）、towers（退台塔楼的顶面，供夜景层挂灯）、lamps（屋顶小灯位置）。"""
    S = STYLE[style]; out = dict(boxes=[], cols=[], prisms=[], pcols=[], towers=[], lamps=[])
    bx, bc = out['boxes'].append, out['cols'].append
    def parapet(x, y, w, d, z, c, t=.003, h=.006):
        k = tuple(min(1, v * S['parapet']) for v in c)
        for (px, py, pw, pd) in ((x, y + d / 2 - t / 2, w, t), (x, y - d / 2 + t / 2, w, t), (x + w / 2 - t / 2, y, t, d - 2 * t), (x - w / 2 + t / 2, y, t, d - 2 * t)):
            bx((px, py, pw, pd, z, z + h)); bc(k)
    def hvac(x, y, w, d, z, c):
        nx, ny = int(rng.integers(1, 4)), int(rng.integers(1, 3)); s = rng.uniform(.007, .012)
        ox, oy = rng.uniform(-.25, .25) * w, rng.uniform(-.25, .25) * d
        for i in range(nx):
            for j in range(ny):
                bx((x + ox + (i - (nx - 1) / 2) * s * 1.5, y + oy + (j - (ny - 1) / 2) * s * 1.5, s, s, z, z + rng.uniform(.004, .009)))
                bc(tuple(min(1, v * rng.uniform(1.2, 1.6)) for v in c))
    for (x, y, w, d, z0, top), c in zip(B, C):
        h = top - z0; area = w * d; c = tuple(float(v) for v in c)
        if area < .0012: continue
        # 小而矮的楼：坡顶
        if h < .45 and area < S['pitch_area'] and rng.random() < S['pitch']:
            long_x = w >= d; tile = S['tiles'][rng.integers(len(S['tiles']))]; tile = tuple(v * rng.uniform(.8, 1.15) for v in tile)
            out['prisms'].append((x, y, w if long_x else d, d if long_x else w, top, min(w, d) * rng.uniform(.25, .4), 0 if long_x else math.pi / 2))
            out['pcols'].append(tile); continue
        roof_c = c
        # 高楼：退台塔楼（1–2 级）
        tiers = [(x, y, w, d, top)]
        if h > 1.4 and area > .006 and rng.random() < S['tower']:
            zt = top
            for _ in range(int(rng.integers(1, 3))):
                pw, pd = tiers[-1][2] * rng.uniform(.55, .78), tiers[-1][3] * rng.uniform(.55, .78)
                px = tiers[-1][0] + rng.uniform(-.15, .15) * (tiers[-1][2] - pw); py = tiers[-1][1] + rng.uniform(-.15, .15) * (tiers[-1][3] - pd)
                zn = min(cap, zt + h * rng.uniform(.08, .22))
                if zn - zt < .02: break
                tc_ = tuple(v * rng.uniform(.9, 1.15) for v in c)
                bx((px, py, pw, pd, zt, zn)); bc(tc_); tiers.append((px, py, pw, pd, zn)); zt = zn
            out['towers'].append(tiers[-1])
        for i, (tx, ty, tw, td, tz) in enumerate(tiers):
            if tw > .04 and td > .04: parapet(tx, ty, tw, td, tz, roof_c)
            last = i == len(tiers) - 1
            if not last: continue
            r = rng.random(); inset = (tx, ty, tw * .78, td * .78)
            if r < S['solar'] and tw * td > .004:                              # 太阳能板：一排排深蓝长条
                for k in np.arange(-inset[3] / 2 + .006, inset[3] / 2 - .004, .013):
                    bx((tx, ty + k, inset[2], .008, tz, tz + .003)); bc((.04, .06, .1))
            elif r < S['solar'] + S['green']:                                    # 屋顶花园
                bx((*inset, tz, tz + .002)); bc((.07, .13, .05))
            elif r < S['solar'] + S['green'] + S['glass'] and tw * td > .003:   # 玻璃天窗 / 中庭
                bx((tx, ty, tw * .45, td * .45, tz, tz + .003)); bc((.28, .34, .38))
                out['lamps'].append((tx, ty, tz + .003))
            if rng.random() < S['hvac'] and tw * td > .003: hvac(tx, ty, tw, td, tz, roof_c)
            if rng.random() < .15: out['lamps'].append((tx + rng.uniform(-.3, .3) * tw, ty + rng.uniform(-.3, .3) * td, tz + .002))
    return out
def build_kit(prefix, kit, m_box, m_roof):
    tc.box_mesh(prefix + '_parts', kit['boxes'], kit['cols'], m_box)
    prism_mesh(prefix + '_roofs', kit['prisms'], kit['pcols'], m_roof)
    tc.tick(f'{prefix}: {len(kit["boxes"])} parts, {len(kit["prisms"])} pitched roofs, {len(kit["towers"])} towers')

# ---------------- 街道：标线、斑马线、车流 ----------------
def avenues(city):
    """主干道中心线：[(轴, 坐标)]，轴 'x' 表示南北向（x 固定）。"""
    return [('x', float(city['xs'][i])) for i in city['AX']] + [('y', float(city['ys'][i])) for i in city['AY']]
def road_marks(city, z, color=(.7, .7, .66), dash=.03, gap=.035):
    """主干道：中央双黄线（实线）、车道虚线、路口斑马线。返回 (boxes, cols)。"""
    xs, ys = city['xs'], city['ys']; AXv, AYv = [xs[i] for i in city['AX']], [ys[i] for i in city['AY']]
    boxes, cols = [], []; yellow = (.62, .5, .16)
    def near_cross(t, cross): return any(abs(t - v) < .135 for v in cross)
    for axis, v in avenues(city):
        L0, L1 = (-H * .58, H * .58) if axis == 'x' else (-W * .56, W * .56); cross = AYv if axis == 'x' else AXv
        for t in np.arange(L0, L1, dash + gap):
            if near_cross(t + dash / 2, cross): continue
            for off in (-.04, .04):                                            # 车道虚线
                p = (v + off, t + dash / 2) if axis == 'x' else (t + dash / 2, v + off)
                boxes.append((*p, .0015, dash) if axis == 'x' else (*p, dash, .0015)); cols.append(color)
        for t in np.arange(L0, L1, .5):                                        # 中央双黄线（分段写，跳过路口）
            if near_cross(t + .25, cross): continue
            for off in (-.003, .003):
                p = (v + off, t + .25) if axis == 'x' else (t + .25, v + off)
                boxes.append((*p, .0015, .5) if axis == 'x' else (*p, .5, .0015)); cols.append(yellow)
    for X in AXv:                                                              # 斑马线：路口四边
        for Y in AYv:
            for sx, sy, along in ((0, .12, 'x'), (0, -.12, 'x'), (.12, 0, 'y'), (-.12, 0, 'y')):
                for k in np.arange(-.09, .091, .012):
                    if along == 'x': boxes.append((X + k, Y + sy, .005, .03))
                    else: boxes.append((X + sx, Y + k, .03, .005))
                    cols.append(color)
    B = np.array([(x, y, w, d, z, z + .0006) for x, y, w, d in boxes], np.float32)
    return B, np.array(cols, np.float32)
CAR_DAY = [(.6, .6, .62), (.08, .08, .09), (.75, .75, .74), (.35, .05, .04), (.1, .15, .3), (.45, .45, .47), (.2, .22, .2)]
def traffic(city, rng, z, density=2.5, jam=None):
    """主干道车流。返回 cars (n, 6)、rot (n,)、方向单位向量 (n, 2)、颜色 (n, 3)。density = 每条车道每单位（100 m）车数。
    jam(x, y) → 0…1 的拥堵系数（可选），越堵车越密。"""
    cars, rots, dirs, cols = [], [], [], []
    xs, ys = city['xs'], city['ys']; AXv, AYv = [xs[i] for i in city['AX']], [ys[i] for i in city['AY']]
    for axis, v in avenues(city):
        L = H * 1.16 if axis == 'x' else W * 1.12; cross = AYv if axis == 'x' else AXv
        for lane, sgn in ((-.062, -1), (-.022, -1), (.022, 1), (.062, 1)):          # 右侧通行：两侧各两条车道
            t = -L / 2 + rng.uniform(0, .3)
            while t < L / 2:
                p = (v + lane, t) if axis == 'x' else (t, v + lane)
                k = jam(*p) if jam else .5
                if not any(abs(t - c) < .12 for c in cross):                     # 路口中间不停车
                    cars.append((*p, .046, .02, z, z + .015)); rots.append(math.pi / 2 if axis == 'x' else 0)
                    dirs.append((0, sgn) if axis == 'x' else (sgn, 0)); cols.append(CAR_DAY[rng.integers(len(CAR_DAY))])
                t += max(.055, rng.exponential(1 / (density * (.4 + 1.2 * k))))
    return np.array(cars, np.float32), np.array(rots, np.float32), np.array(dirs, np.float32), np.array(cols, np.float32)
def car_lights(cars, dirs):
    """夜景车灯：车头白、车尾红（两个小发光块）。返回 (head_boxes, tail_boxes)。"""
    head, tail = [], []
    for (x, y, w, d, z0, z1), (dx, dy) in zip(cars, dirs):
        for s, lst in ((1, head), (-1, tail)):
            px, py = x + dx * s * .021, y + dy * s * .021
            lst.append((px, py, .006 if dx else .016, .016 if dx else .006, z1, z1 + .001))
    return np.array(head, np.float32), np.array(tail, np.float32)
