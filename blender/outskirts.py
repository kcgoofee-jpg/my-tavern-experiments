"""外圈环图（D41 批 4；设定 docs/tiancheng-maps.md §0.5 尺度 / §0.4 分层光照 / §0.8 自检，相机文件格式见附录 OBLIQUE-CODE B）。

中心柱四周约 12 × 7.5 km 的那一圈低清外圈：同一相机朝向（§0.2：正交、方位 165°、俯角 35°）、画框中心与本层主图
相同，画框放到 14 080 × 8 800 m、4000 × 2500 px（约 3.5 m / px）。柱内不生成任何东西（主图就压在那里），
城市肌理向外延续、越往外楼越稀越暗、雾越厚，到画框外缘完全融进 FOG-1 的雾色——所以这张图的矩形边看不出来。

中层三张（昼 / 昏 / 夜）：城市肌理继续向外，楼高随距离降低；外围居住区之后环城军营带沿外圈继续成弧
（同一地点的延续，不加新标记）；昼仍有霓虹（夜里的一半都不到），夜里窗口与车灯成流、军营探照灯是白色泛光。
下层两张（白班 / 夜班）：工业带、编组场与货运铁路向外放射，贫民窟连片，钠灯点越往外越稀，最后全黑；
下层没有日照也没有天光（§0.4），环境光只有中层底板漏下来的一点暗橙。

用法（经 tools/render_queue.sh 提交）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/tiancheng_mid.py', run_name='__main__')" -- \
      --outskirts --obtod day --samples 16 --obres 2000 --no-data --out logs/campaign/rb4/mid_day_2000.png [--exr 1]
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/tiancheng_low.py', run_name='__main__')" -- \
      --outskirts --obtod nightshift --samples 64 --no-data --out logs/campaign/full/tc_low_out_nightshift_full.png
  --obtod：中层 day|dusk|night；下层 dayshift|nightshift（与该层主图同一个时段名，两班 / 三时段的光照规则照 §0.4）。
  --obres：成图宽；0 或不给 = 相机文件里的定稿像素（同一画框的低分辨率草图，哈希不变）。
  --exr 1：夜检用，另出 <out>_emit.png 源图（只有相机直接看到的发光面），灯光对象位置写进 meta。
  --dark 1：只出暗检图（--out 给什么就写什么，512 px，所有灯与自发光关掉，不渲主图）——下层 §0.8 第 5 条。
光晕阈值一律高于雾色本身的亮度：否则外圈那一大片雾自己会发光，画框外缘就不再落在雾色令牌上。
每张成图旁写 <out>.meta.json：相机文件、时段、雾色令牌与色标、分带统计、灯光对象画框坐标。
"""
import json, math, os, sys, time
import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
import tc_common as tc
import project as PJ
import oblique as OB

COL = (1500.0, 937.5)                    # 中心柱半宽 / 半高（米）：三层同一块 3000 × 1875 m 片区
FRAME_M = (14080.0, 8800.0)              # §0.5：画框约 14 080 × 8 800 m
FRAME_PX = (4000, 2500)                  # 4000 × 2500 px（约 3.5 m / px）
M_PER_PX = FRAME_M[0] / FRAME_PX[0]
GROUND_SPAN = 24000.0                    # 地面衬底铺到画框外（22 km 见方，35° 斜视里画框外露的是雾）
STANDOFF = 12000.0                       # 相机沿视线后退（米）：画框半高 4400 m，相机必须退到
                                         # 4400·cos35 / sin35 ≈ 6300 m 以上，否则画框下缘的光线起点落在地面以下
FOG_R = (2200.0, 6300.0)                 # 雾：柱边薄、画框外缘满（画框最近的一圈边离柱心 7040 m，噪声最多往下推 600 m）
FOG_RAMP = ((0.0, .03), (.30, .07), (.58, .18), (.82, .45), (1.0, 1.0))   # 位置 / 浓度：不是一圈同心圆，边界由噪声打散
WIN_CELL = 14.0                          # 窗格（米）：3.52 m / px 下约 4 px，夜里的城市读成细密的亮点而不是噪点
KEEP_OUT = 1850.0                        # 柱内（含主图画框 1742 m）不生成任何东西
TIER = {                                 # 每层的地面海拔、相机中心高度、相机文件（D41 §0.2 的层高度范围）
    'mid': dict(ground=50.0, z_c=425.0, cam='map/data/cam/tc_mid_obl.json'),
    'low': dict(ground=0.0, z_c=100.0, cam='map/data/cam/tc_low_obl.json'),
}
# FOG-1 的雾色令牌（map/ui/tokens.css；外缘要正好落在这些色上，矩形的边才看不出来）
FOG_TOKEN = {'day': '#e9edee', 'dawn': '#e6dcd4', 'dusk': '#d8c0b0', 'night': '#161d2c'}
FOG = (.8, .84, .85)                     # 线性雾色（main() 按时段令牌与曝光设好）
T0 = time.time()

# 班次 / 时段：与各层主图同一套光照规则（§0.4），但太阳能量按外圈自己的受光情况定：主图是峡谷光（街面常年在
# 阴影里，所以太阳给到 13 W），外圈没有峡谷、每个屋顶都摊在太阳下，用中层主图那 13 W 会把屋顶全部打白——
# 因此外圈取与上层同一档（上层是敞开的岛面，太阳 3.4 W），曝光与天光也按那一档，雾色按 2^-exp 补回来。
# el / e / sky 是太阳高度、能量与照明天光；amb 是下层那点暗橙。
# win = 立面窗开灯比例，ws = 窗与灯头的自发光强度；neon / car = 霓虹与车灯流；ind / mkt = 工业区与零碎霓虹组。
PERIODS = {
    'mid': {
        'day':   dict(tok='day', el=50.0, sun=(1.0, .96, .90), e=5.0, sky=.16,
                      horizon=(1.15, 1.22, 1.30), zenith=(.45, .62, .92), exp=-.35,
                      win=.30, ws=1.5, neon=.45, car=.40, flood=1.0, glare=None),
        'dusk':  dict(tok='dusk', el=13.0, sun=(1.0, .55, .30), e=5.5, sky=.16,
                      horizon=(1.50, .78, .44), zenith=(.26, .28, .48), exp=-.35,
                      win=.52, ws=2.2, neon=.70, car=.70, flood=1.0, glare=(1.1, 9.5, -.6), tight=(1.0, 6.5, 1.8)),
        'night': dict(tok='night', el=50.0, sun=(.60, .70, 1.0), e=.05, sky=0.0, exp=0.0,
                      win=.74, ws=2.5, neon=1.0, car=1.0, flood=1.0, glare=(1.1, 9.5, -.6), tight=(1.0, 6.5, 1.8)),
    },
    'low': {
        # 光晕阈值必须高于雾色本身的亮度（昼班的外圈有一半是浅色雾，阈值 0.6–0.75 会把整片雾都点亮，
        # 外缘就不再落在雾色令牌上）；这里只让灯头与霓虹起晕。
        'dayshift':   dict(tok='day', amb=(.50, .38, .25), ambi=.19, exp=0.0,
                           win=.42, ws=1.7, sodium=1.0, ind=1.7, mkt=.55, car=.5, glare=(1.15, 9.5, -.7), tight=(1.0, 7, .45)),
        'nightshift': dict(tok='night', amb=(.50, .38, .25), ambi=.09, exp=0.0,
                           win=.26, ws=1.3, sodium=.9, ind=.40, mkt=1.55, car=1.0, glare=(1.15, 9.5, -.7), tight=(1.0, 7, .45)),
    },
}
# 中层街区（r0, r1 离柱心米，cell 街格边长米，k 每格几栋，fill 覆盖率，h 楼高范围，rot 街网朝向）
MID_BANDS = [
    dict(r0=KEEP_OUT, r1=3050., cell=210., k=2, fill=.86, h=(42., 150.), rot=math.radians(24.), street=30.),
    dict(r0=3050., r1=4250., cell=250., k=2, fill=.74, h=(24., 72.), rot=math.radians(-19.), street=32.),
    dict(r0=4250., r1=5450., cell=310., k=2, fill=.55, h=(13., 34.), rot=math.radians(41.), street=34.),
    dict(r0=5450., r1=6650., cell=390., k=1, fill=.26, h=(8., 20.), rot=math.radians(8.), street=36.),
]
# 环城军营带（§0.5：外围居住区之后沿外圈继续成弧；主图里是 148°–212° 那一段，这里同一地点向外延续）
BARRACKS = dict(r0=4380., r1=4980., a0=math.radians(141.), a1=math.radians(219.))
# 下层：工业带 / 编组场 / 贫民窟（r0, r1，cell，fill，h，rot）
LOW_BANDS = [
    dict(r0=KEEP_OUT, r1=3050., cell=190., k=2, fill=.62, h=(9., 26.), rot=math.radians(15.), street=34.),
    dict(r0=3050., r1=4350., cell=240., k=2, fill=.48, h=(8., 20.), rot=math.radians(-27.), street=36.),
    dict(r0=4350., r1=5650., cell=300., k=2, fill=.30, h=(6., 15.), rot=math.radians(36.), street=38.),
    dict(r0=5650., r1=6650., cell=380., k=1, fill=.12, h=(5., 11.), rot=math.radians(-8.), street=40.),
]
FREIGHT = 6                               # 向外放射的货运铁路条数
SLUM_ANGLES = ((18., 74.), (128., 168.), (214., 262.), (300., 336.))   # 贫民窟连片的扇区（度）


def tick(msg): print(f'[outskirts {time.time() - T0:6.1f}s] {msg}', flush=True)


# ---------------------------------------------------------------- 雾（FOG-1）
def srgb_to_linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def set_fog(tok, exposure=0.0):
    """按 FOG-1 的时段令牌设雾色（线性）。曝光不为 0 时按 2^-exp 补回来：画框外缘那圈永远正好落在令牌色上。"""
    global FOG
    h = FOG_TOKEN[tok].lstrip('#')
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    k = 2.0 ** (-exposure)
    FOG = tuple(srgb_to_linear(c) * k for c in rgb)
    return FOG_TOKEN[tok]


def fog_out(nt, shader, colour=None):
    """在材质输出前混一层「越远越浓的雾」：世界坐标的平面半径 →（两段噪声把边界打散）→ 色标 → 与雾自发光混合。
    画框那一圈（离柱心 7040 m 以上）落到 1.0，所以外缘正好是雾色；柱边只有 5 %，主图的羽化带压上来时接得住。"""
    N, L = nt.nodes, nt.links
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
    geo = N.new('ShaderNodeNewGeometry')
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Position'], sep.inputs[0])
    cmb = N.new('ShaderNodeCombineXYZ'); L.new(sep.outputs['X'], cmb.inputs['X']); L.new(sep.outputs['Y'], cmb.inputs['Y'])
    ln = N.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; L.new(cmb.outputs[0], ln.inputs[0])
    r = ln.outputs['Value']
    for scale, amp in ((1 / 2400., 450.), (1 / 640., 150.)):          # 雾边是有机的，不是一圈同心圆
        nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 4
        L.new(geo.outputs['Position'], nz.inputs['Vector'])
        c = N.new('ShaderNodeMath'); c.operation = 'SUBTRACT'; c.inputs[1].default_value = .5; L.new(nz.outputs['Fac'], c.inputs[0])
        m = N.new('ShaderNodeMath'); m.operation = 'MULTIPLY_ADD'; m.inputs[1].default_value = 2 * amp
        L.new(c.outputs[0], m.inputs[0]); L.new(r, m.inputs[2])
        r = m.outputs[0]
    mr = N.new('ShaderNodeMapRange'); mr.clamp = True; mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = FOG_R
    L.new(r, mr.inputs['Value'])
    ramp = N.new('ShaderNodeValToRGB'); els = ramp.color_ramp.elements
    els[0].position, els[0].color = FOG_RAMP[0][0], (FOG_RAMP[0][1],) * 3 + (1,)
    els[1].position, els[1].color = FOG_RAMP[-1][0], (FOG_RAMP[-1][1],) * 3 + (1,)
    for pos, val in FOG_RAMP[1:-1]:
        e = els.new(pos); e.color = (val, val, val, 1)
    L.new(mr.outputs['Result'], ramp.inputs['Fac'])
    em = N.new('ShaderNodeEmission'); em.name = em.label = 'fog_em'
    em.inputs['Color'].default_value = (*(colour or FOG), 1); em.inputs['Strength'].default_value = 1.0
    # 一层大尺度疏密：雾在浓淡之间有结构（不然大片平滑的浅色读起来像一张色片）。两端不动，
    # 所以画框外缘那一圈仍然精确落在雾色上。
    nz2 = N.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 1 / 3100.; nz2.inputs['Detail'].default_value = 5
    L.new(geo.outputs['Position'], nz2.inputs['Vector'])
    b1 = N.new('ShaderNodeMath'); b1.operation = 'MULTIPLY_ADD'; b1.inputs[1].default_value = -.8; b1.inputs[2].default_value = .8
    L.new(nz2.outputs['Fac'], b1.inputs[0])
    f = ramp.outputs['Color']
    fs = N.new('ShaderNodeSeparateColor'); L.new(f, fs.inputs[0])
    om = N.new('ShaderNodeMath'); om.operation = 'SUBTRACT'; om.inputs[0].default_value = 1.0
    L.new(fs.outputs[0], om.inputs[1])
    mid = N.new('ShaderNodeMath'); mid.operation = 'MULTIPLY'; L.new(fs.outputs[0], mid.inputs[0]); L.new(om.outputs[0], mid.inputs[1])
    wob = N.new('ShaderNodeMath'); wob.operation = 'MULTIPLY'; L.new(mid.outputs[0], wob.inputs[0]); L.new(b1.outputs[0], wob.inputs[1])
    fmix = N.new('ShaderNodeMath'); fmix.operation = 'SUBTRACT'; L.new(fs.outputs[0], fmix.inputs[0]); L.new(wob.outputs[0], fmix.inputs[1])
    fpos = N.new('ShaderNodeMath'); fpos.operation = 'MAXIMUM'; fpos.inputs[1].default_value = 0.0
    L.new(fmix.outputs[0], fpos.inputs[0])
    mix = N.new('ShaderNodeMixShader')
    L.new(fpos.outputs[0], mix.inputs['Fac']); L.new(shader, mix.inputs[1]); L.new(em.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs['Surface'])
    return em


# ---------------------------------------------------------------- 材质
def _mul(N, L, a, b):
    n = N.new('ShaderNodeMath'); n.operation = 'MULTIPLY'; L.new(a.outputs[0], n.inputs[0]); L.new(b.outputs[0], n.inputs[1])
    return n


def surface_mat(name, col, rough=.9, spec=.2, metal=0.0, vcol=False, emit=None, estr=0.0, fog=True):
    """表面材质：基色取常量或网格颜色属性（每栋楼自己的色），可选自发光（灯头、招牌、车灯），最后统一混雾。"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = tc.bsdf_of(m)
    if vcol:
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'col'; nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
    else:
        tc.set_in(b, 'Base Color', (*col, 1))
    tc.set_in(b, 'Roughness', rough); tc.set_in(b, 'Metallic', metal); tc.set_in(b, ('Specular IOR Level', 'Specular'), spec)
    if emit is not None:
        for s in ('Emission Color', 'Emission Strength'):
            for lk in list(b.inputs[s].links): nt.links.remove(lk)
        tc.set_in(b, 'Emission Color', (*emit, 1)); tc.set_in(b, 'Emission Strength', estr)
    if fog: fog_out(nt, b.outputs['BSDF'])
    return m


def window_mat(name, frac, strength, temp=2700., cell=WIN_CELL, rough=.78):
    """立面窗：按房间格（世界坐标 floor(p / cell)）随机开灯，格子里居中的一小块是窗、其余是墙；
    比例 frac、强度 strength、色温 temp，每格亮度有差别。法线 z 分量不小于 0.5 的面不亮（屋面、坡顶）。
    窗是自发光贴图，不摆点光（几千扇窗的点光会拖死采样）。"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    b = tc.bsdf_of(m)
    vc = N.new('ShaderNodeVertexColor'); vc.layer_name = 'col'; L.new(vc.outputs['Color'], b.inputs['Base Color'])
    tc.set_in(b, 'Roughness', rough); tc.set_in(b, ('Specular IOR Level', 'Specular'), .12)
    for s in ('Emission Color', 'Emission Strength'):
        for lk in list(b.inputs[s].links): L.remove(lk)
    tcn = N.new('ShaderNodeTexCoord')
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / cell,) * 3; L.new(tcn.outputs['Object'], mp.inputs['Vector'])
    fl = N.new('ShaderNodeVectorMath'); fl.operation = 'FLOOR'; L.new(mp.outputs[0], fl.inputs[0])
    wn = N.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; L.new(fl.outputs[0], wn.inputs['Vector'])
    on = N.new('ShaderNodeMath'); on.operation = 'LESS_THAN'; on.inputs[1].default_value = frac; L.new(wn.outputs['Value'], on.inputs[0])
    fr = N.new('ShaderNodeVectorMath'); fr.operation = 'FRACTION'; L.new(mp.outputs[0], fr.inputs[0])
    sf = N.new('ShaderNodeSeparateXYZ'); L.new(fr.outputs[0], sf.inputs[0])
    mask = None
    for ax, half in (('X', .30), ('Y', .30), ('Z', .34)):
        c_ = N.new('ShaderNodeMath'); c_.operation = 'SUBTRACT'; c_.inputs[1].default_value = .5; L.new(sf.outputs[ax], c_.inputs[0])
        a_ = N.new('ShaderNodeMath'); a_.operation = 'ABSOLUTE'; L.new(c_.outputs[0], a_.inputs[0])
        k_ = N.new('ShaderNodeMath'); k_.operation = 'LESS_THAN'; k_.inputs[1].default_value = half; L.new(a_.outputs[0], k_.inputs[0])
        mask = k_ if mask is None else _mul(N, L, mask, k_)
    st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; L.new(on.outputs[0], st.inputs[0]); L.new(mask.outputs[0], st.inputs[1])
    sep = N.new('ShaderNodeSeparateColor'); L.new(wn.outputs['Color'], sep.inputs[0])
    vr = N.new('ShaderNodeMapRange'); vr.inputs['To Min'].default_value = .25 * strength; vr.inputs['To Max'].default_value = strength
    L.new(sep.outputs[0], vr.inputs['Value'])
    lit = N.new('ShaderNodeMath'); lit.operation = 'MULTIPLY'; L.new(st.outputs[0], lit.inputs[0]); L.new(vr.outputs['Result'], lit.inputs[1])
    geo = N.new('ShaderNodeNewGeometry'); nz = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], nz.inputs[0])
    up = N.new('ShaderNodeMath'); up.operation = 'LESS_THAN'; up.inputs[1].default_value = .5; L.new(nz.outputs['Z'], up.inputs[0])
    gate = N.new('ShaderNodeMath'); gate.operation = 'MULTIPLY'; L.new(lit.outputs[0], gate.inputs[0]); L.new(up.outputs[0], gate.inputs[1])
    bb = N.new('ShaderNodeBlackbody'); bb.inputs['Temperature'].default_value = temp
    L.new(bb.outputs[0], b.inputs['Emission Color']); L.new(gate.outputs[0], b.inputs['Emission Strength'])
    fog_out(nt, b.outputs['BSDF'])
    return m


def ground_mat(name, c1, c2, scale=1400.):
    """地面：世界坐标上的噪声调色（不用对象坐标——外圈的地是一块 24 km 的大平面，对象坐标的噪声尺度会跟着缩放走）。"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    b = tc.bsdf_of(m)
    geo = N.new('ShaderNodeNewGeometry')
    n1 = N.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 1 / scale; n1.inputs['Detail'].default_value = 6
    L.new(geo.outputs['Position'], n1.inputs['Vector'])
    mx = N.new('ShaderNodeMixRGB'); mx.inputs['Color1'].default_value = (*c1, 1); mx.inputs['Color2'].default_value = (*c2, 1)
    L.new(n1.outputs['Fac'], mx.inputs['Fac'])
    L.new(mx.outputs['Color'], b.inputs['Base Color'])
    tc.set_in(b, 'Roughness', .92); tc.set_in(b, ('Specular IOR Level', 'Specular'), .06)
    fog_out(nt, b.outputs['BSDF'])
    return m


def flat_mat(name, col, rough=.95):
    """纯色地面片（公园、运河、军营操场、水面）：不参与画框拟合，只是衬底。"""
    m = bpy.data.materials.new(name); m.use_nodes = True; b = tc.bsdf_of(m)
    tc.set_in(b, 'Base Color', (*col, 1)); tc.set_in(b, 'Roughness', rough); tc.set_in(b, ('Specular IOR Level', 'Specular'), .05)
    fog_out(m.node_tree, b.outputs['BSDF'])
    return m


# ---------------------------------------------------------------- 几何
def plane(name, sx, sy, z, m):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-sx / 2, -sy / 2, z), (sx / 2, -sy / 2, z), (sx / 2, sy / 2, z), (-sx / 2, sy / 2, z)], [], [(0, 1, 2, 3)])
    me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(m)
    return o


def put(name, boxes, cols, m, rot=None):
    """一批盒子 → 一件网格（顶点色 col）。空批直接跳过。"""
    B = np.asarray(boxes, np.float32).reshape(-1, 6)
    if not len(B): return None
    C = np.asarray(cols, np.float32).reshape(-1, 3) if cols is not None else None
    o = tc.box_mesh(name, B, C, m, rot=np.asarray(rot, np.float32) if rot is not None else None)
    return o


def seg(a, b):
    """线段 a→b 的中点、长度、朝向（盒子用：x, y, w=长, d=宽, z0, z1, rot）。"""
    dx, dy = b[0] - a[0], b[1] - a[1]
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), math.hypot(dx, dy), math.atan2(dy, dx)


def outside(x, y, margin=140.0):
    """柱外（含余量）：柱内不生成任何东西——主图就压在这一片上（§0.5）。"""
    return not (abs(x) < COL[0] + margin and abs(y) < COL[1] + margin)


def blocks(band, rng, gz, hmul=1.0, kinds=('block',)):
    """一个带里的街区：旋转街格 → 每格 k × k 个地块 → 楼。返回 (boxes, cols, rot, extra)。
    楼高随离柱心的距离在带内下降（§0.5「楼高随距离降低」）。"""
    s, k, fill = band['cell'], band['k'], band['fill']
    st = band['street']; plot = (s - k * st) / k
    n = int(9400. / s) + 1
    ii, jj = np.meshgrid(np.arange(-n, n + 1), np.arange(-n, n + 1), indexing='ij')
    c, s_ = math.cos(band['rot']), math.sin(band['rot'])
    u, v = ii.ravel() * s, jj.ravel() * s
    x0, y0 = u * c - v * s_, u * s_ + v * c
    r = np.hypot(x0, y0)
    keep = (r >= band['r0']) & (r < band['r1'])
    keep &= ~((np.abs(x0) < COL[0] + 90) & (np.abs(y0) < COL[1] + 90))
    keep &= rng.random(len(x0)) < fill
    x0, y0, r = x0[keep], y0[keep], r[keep]
    if not len(x0): return [], [], [], {}
    fall = 1.0 - .34 * (r - band['r0']) / max(1., band['r1'] - band['r0'])
    B, C, R, extra = [], [], [], {}
    for gx in range(k):
        for gy in range(k):
            ox = (gx - (k - 1) / 2.) * (plot + st)
            oy = (gy - (k - 1) / 2.) * (plot + st)
            px = x0 + ox * c - oy * s_ + rng.normal(0, plot * .06, len(x0))
            py = y0 + ox * s_ + oy * c + rng.normal(0, plot * .06, len(x0))
            w = np.clip(rng.uniform(.62, .98, len(x0)) * plot, 12., None)
            d = np.clip(rng.uniform(.62, .98, len(x0)) * plot, 12., None)
            h = rng.uniform(*band['h']) * fall * hmul
            if band['r0'] < 3000.:                                        # 内圈偶尔来一栋塔
                h = h * np.where(rng.random(len(x0)) < .05, 2.1, 1.0)
            if 'shed' in kinds:                                            # 厂房：长条、低矮
                w = np.clip(rng.uniform(1.6, 3.4, len(x0)) * plot, 30., None); d = np.clip(rng.uniform(.5, .9, len(x0)) * plot, 14., None)
                h = rng.uniform(*band['h']) * fall * .55
            B.append(np.stack([px, py, w, d, np.full(len(px), gz + .6), np.full(len(px), gz + .6 + h)], 1))
            g = rng.uniform(.55, 1.5, (len(px), 1)) * np.array([.150, .146, .138], np.float32)
            C.append(np.clip(g * rng.uniform(.8, 1.25, (len(px), 1)), .010, .45))
            R.append(np.full(len(px), band['rot'] + rng.normal(0, .05, len(x0))))
    extra['n'] = int(len(x0) * k * k)
    return np.concatenate(B), np.concatenate(C), np.concatenate(R), extra


def road_net(gz, radials, rings, road_w=30.):
    """放射干道 + 环路（返回盒子与朝向）。城市肌理靠它连起来，外圈的放射感也靠它。"""
    B, R = [], []
    for a in radials:                                        # 从柱边向外的一条干道
        p0, p1 = radial_ends(a, 6800.)
        (x, y), L, rot = seg(p0, p1)
        B.append((x, y, L, road_w, gz + .3, gz + 1.1)); R.append(rot)
    for rr in rings:                                         # 环路（略椭，和主图那片一样不是正圆）
        a = np.linspace(0, 2 * math.pi, 96, endpoint=False)
        p = np.stack([np.cos(a) * rr, np.sin(a) * rr * .68], 1)
        for i in range(len(p)):
            (x, y), L, rot = seg(p[i], p[(i + 1) % len(p)])
            B.append((x, y, L + 8, road_w * .8, gz + .3, gz + 1.0)); R.append(rot)
    return B, R


def radial_ends(deg, r_max, margin=1.03):
    """一条放射干道：从柱边（按它的方位出柱）到 r_max。"""
    a = math.radians(deg)
    dx, dy = math.cos(a), math.sin(a)
    d0 = (COL[0] / abs(dx) if abs(dx) > abs(dy) else COL[1] / abs(dy)) * margin if abs(dx) > 1e-3 or abs(dy) > 1e-3 else 0.
    return (dx * d0, dy * d0), (dx * r_max, dy * r_max)


def traffic(pts, gz, k, rng, warm=(1., .62, .28), cool=(1., .95, .88)):
    """车灯流：沿折线撒小发光盒，白天按比例留（§0.4 夜里「主干道是车灯流」）。返回盒子与顶点色。"""
    B, C = [], []
    n = max(2, int(len(pts) * k))
    for i in range(n):
        t = (i + .5) / n * (len(pts) - 1); j = min(len(pts) - 2, int(t)); f = t - j
        x = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f + rng.normal(0, 3.5)
        y = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f + rng.normal(0, 3.5)
        c = warm if i % 2 else cool
        B.append((x, y, 7., 3.4, gz + 1.2, gz + 2.6)); C.append(c)
    return B, C


def chord_pts(d, bearing, r_max=6800., n=90):
    """离柱心 d 的一条弦（磁悬轨道 / 运河用）：两端在画面外，中段穿过外圈。"""
    a = math.radians(bearing); px, py = -math.sin(a), math.cos(a)
    s = np.linspace(-r_max, r_max, n)
    return [(px * t + math.cos(a) * d, py * t + math.sin(a) * d) for t in s]


def chord_box(d, bearing, length, w, z, h=.4):
    """弦 → (盒子, 朝向)（运河、河道）。盒子必须带朝向，否则会横着躺在图上。"""
    a = math.radians(bearing)
    cx, cy = math.cos(a) * d, math.sin(a) * d
    (x, y), L, rot = seg((cx - math.sin(a) * length / 2, cy + math.cos(a) * length / 2),
                         (cx + math.sin(a) * length / 2, cy - math.cos(a) * length / 2))
    return (x, y, L, w, z, z + h), rot


# ---------------------------------------------------------------- 中层内容
def mid_content(sc, rng, P, gz):
    mats = {}
    mats['ground'] = ground_mat('out_ground', (.0165, .0165, .0155), (.030, .029, .026), 1500.)
    mats['road'] = surface_mat('out_road', (.052, .050, .047), .9, .06, emit=(1., .66, .34), estr=.05 * P['car'])
    mats['park'] = flat_mat('out_park', (.020, .034, .019))
    mats['water'] = flat_mat('out_water', (.006, .010, .014), .12)
    mats['rail'] = surface_mat('out_rail', (.05, .05, .05), .5, .3, emit=(.62, .84, 1.), estr=(2.2 * P['neon'] + .5) * .42)
    mats['head'] = surface_mat('out_head', (0, 0, 0), emit=(1., .93, .82), estr=6. * P['flood'])
    # 楼：四个带各一档窗（越往外越暗、越稀）
    win = []
    for i, f in enumerate((1.0, .82, .62, .45)):
        win.append(window_mat(f'out_win{i}', P['win'] * f, P['ws'] * f, 2700. + 350. * i))
    NEON = [(1., .24, .60), (.24, .87, 1.), (.62, .36, 1.), (1., .65, .25)]
    car = surface_mat('out_car', (0, 0, 0), vcol=True, emit=(1., 1., 1.), estr=3.2 * P['car'])
    plane('out_ground', GROUND_SPAN, GROUND_SPAN, gz, mats['ground'])

    stat = {}
    nb, nc, ni = [], [], []
    for i, band in enumerate(MID_BANDS):                      # 街区
        B, C, R, ex = blocks(band, rng, gz)
        put(f'out_blocks{i}', B, C, win[i], R)
        stat[f'band{i}'] = dict(r=[band['r0'], band['r1']], n=ex.get('n', 0))
        # 霓虹招牌：内圈商业延续，越往外越稀（§0.4 商业区最密、外围居住区稀疏）——挂在刚建好的那批楼上
        pick = np.nonzero(rng.random(len(B)) < (.34, .16, .06, .02)[i])[0]
        for j in pick:
            x, y, w, d, _z0, z1 = B[j]
            a = rng.random() * math.tau; r = w / 2 + 2.
            nb.append((x + r * math.cos(a), y + r * math.sin(a), rng.uniform(10., 30.), 3.4, z1 - rng.uniform(10., 46.), z1 - 4.))
            nc.append(NEON[int(rng.random() * 4)]); ni.append(R[j] + a)
    put('out_neon', nb, nc, surface_mat('out_neon', (0, 0, 0), vcol=True, emit=(1., 1., 1.), estr=5. * P['neon']), ni)
    # 公园、运河（§0.4：只有公园、运河、空地保持暗）
    pk = []
    for a, r0, r1 in ((22, 2350., 2950.), (151, 3300., 4050.), (286, 4550., 5150.), (68, 5100., 5900.)):
        aa = math.radians(a); pk.append((math.cos(aa) * (r0 + r1) / 2, math.sin(aa) * (r0 + r1) / 2, r1 - r0, (r1 - r0) * .62, gz + .4, gz + .8))
    put('out_parks', pk, None, mats['park'])
    for d, bear, L in ((-1900., 118., 2600.), (2100., 300., 2400.)):    # 两条斜穿的运河（都在柱外）
        b, rot = chord_box(d, bear, L, 130., gz + .5)
        put('out_water', [b], None, mats['water'], [rot])
    # 路网 + 车灯流（§0.4 夜里「主干道是车灯流」）
    radials = (8, 27, 48, 71, 95, 118, 141, 163, 186, 208, 232, 255, 278, 300, 322, 344)
    rings = (2600., 3900., 5200., 6300.)
    B, R = road_net(gz, radials, rings)
    put('out_roads', B, None, mats['road'], R)
    cbm, ccm = [], []
    for a in radials[:9]:
        p0, p1 = radial_ends(a, 6700., 1.05)
        pts = [(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t) for t in np.linspace(0, 1, 70)]
        b, c = traffic(pts, gz, P['car'], rng); cbm += b; ccm += c
    for rr in rings[:3]:
        a = np.linspace(0, 2 * math.pi, 64, endpoint=False)
        pts = [tuple(p) for p in np.stack([np.cos(a) * rr, np.sin(a) * rr * .68], 1)]
        b, c = traffic(pts + pts[:1], gz, P['car'] * .7, rng); cbm += b; ccm += c
    put('out_car', cbm, ccm, car)
    # 悬浮轨道：发光的线，带列车（§0.4）。柱内不画，所以逐段判是否在柱外
    rb, rr_, tb, tr = [], [], [], []
    for d, bear in ((-2600., 24.), (3100., -38.)):
        pts = chord_pts(d, bear)
        for i in range(len(pts) - 1):
            (x, y), L, rot = seg(pts[i], pts[i + 1])
            if not outside(x, y, 120.): continue
            rb.append((x, y, L + 8, 13., gz + 22., gz + 27.)); rr_.append(rot)
        k = len(pts) // 3
        for t in (k, 2 * k):
            for i in range(t, min(t + 14, len(pts) - 1)):
                (x, y), L, rot = seg(pts[i], pts[i + 1])
                if not outside(x, y, 200.): continue
                tb.append((x, y, L + 10, 16., gz + 20., gz + 30.)); tr.append(rot)
    put('out_rail', rb, None, mats['rail'], rr_)
    put('out_train', tb, None, surface_mat('out_train', (.10, .10, .11), .4, .3, emit=(.9, .95, 1.), estr=(.4 + 1.6 * P['neon']) * .5), tr)
    # 环城军营带：营房 + 操场 + 白色探照灯（§0.5 同一地点沿外圈继续成弧，不加新标记）
    bb, bc, br, hb, lights = [], [], [], [], []
    for row in range(3):
        rr = BARRACKS['r0'] + row * ((BARRACKS['r1'] - BARRACKS['r0']) / 3)
        a = BARRACKS['a0'] + (BARRACKS['a1'] - BARRACKS['a0']) * np.linspace(0, 1, 34)
        px, py = np.cos(a) * rr, np.sin(a) * rr
        for j in range(len(a) - 1):
            (x, y), L, rot = seg((px[j], py[j]), (px[j + 1], py[j + 1]))
            if row == 1: continue                                   # 中间一行是操场
            bb.append((x, y, L + 10, 15., gz + .6, gz + 12.)); bc.append((.13, .135, .12)); br.append(rot + math.pi / 2)
        for j in range(0, len(a), 3):                              # 探照灯杆
            hb.append((px[j], py[j], 7., 7., gz + 12., gz + 34.))
            if len(lights) < 44: lights.append((float(px[j]), float(py[j]), gz + 33.))
    for row in range(2):                                           # 操场（沙土色）
        rr = BARRACKS['r0'] + (row + .5) * ((BARRACKS['r1'] - BARRACKS['r0']) / 3)
        a = np.linspace(BARRACKS['a0'], BARRACKS['a1'], 40)
        for j in range(len(a) - 1):
            (x, y), L, rot = seg((math.cos(a[j]) * rr, math.sin(a[j]) * rr), (math.cos(a[j + 1]) * rr, math.sin(a[j + 1]) * rr))
            bb.append((x, y, L + 10, 150., gz + .3, gz + .5)); bc.append((.115, .105, .082)); br.append(rot + math.pi / 2)
    put('out_barracks', bb, bc, win[1], br)
    put('out_floodmast', hb, None, mats['head'])
    tc.point_lights('out_flood', [(x, y, z, (1., .96, .90)) for x, y, z in lights], 9000. * P['flood'], 12.)
    stat.update(barracks=dict(rows=3, lights=len(lights), arc=[math.degrees(BARRACKS['a0']), math.degrees(BARRACKS['a1'])]),
                roads=len(radials), rings=len(rings), neon=len(nb), cars=len(cbm))
    return mats, stat


# ---------------------------------------------------------------- 下层内容
def low_content(sc, rng, P, gz):
    mats = {}
    mats['ground'] = ground_mat('out_ground', (.0135, .0125, .0115), (.026, .023, .020), 1200.)
    mats['road'] = surface_mat('out_road', (.046, .040, .034), .92, .05, emit=(1., .60, .26), estr=.20 * P['sodium'])
    mats['ballast'] = surface_mat('out_ballast', (.040, .036, .031), .95, .04)
    mats['shed'] = window_mat('out_shed', P['win'] * .5, P['ws'] * .45, 3000.)
    mats['slum'] = window_mat('out_slum', P['win'] * .8, P['ws'] * .7, 2400., cell=9.)
    mats['vent'] = surface_mat('out_vent', (0, 0, 0), emit=(1., .52, .18), estr=1.9 * P['ind'])
    mats['sodium'] = surface_mat('out_sodium', (0, 0, 0), emit=(1., .63, .28), estr=7. * P['sodium'])
    mats['head'] = surface_mat('out_head', (0, 0, 0), emit=(.92, .95, 1.), estr=9.)
    NEON = [(1., .24, .60), (.24, .87, 1.), (.62, .36, 1.)]
    mats['neon'] = surface_mat('out_neon', (0, 0, 0), vcol=True, emit=(1., 1., 1.), estr=5. * P['mkt'])
    mats['shack'] = window_mat('out_shack', P['win'] * .35, P['ws'] * .30, 2200., cell=7.)
    plane('out_ground', GROUND_SPAN, GROUND_SPAN, gz, mats['ground'])
    stat = {}
    for i, band in enumerate(LOW_BANDS):                     # 工业带：长条低矮的厂房（最外一档换成铁皮窝棚）
        B, C, R, ex = blocks(band, rng, gz, kinds=('shed',))
        put(f'out_sheds{i}', B, C, mats['shack'] if i == len(LOW_BANDS) - 1 else mats['shed'], R)
        stat[f'band{i}'] = dict(r=[band['r0'], band['r1']], n=ex.get('n', 0))
        vb = [(b[0], b[1], b[2] * .26, b[3] * .42, b[5] + .8, b[5] + 1.8) for b in B[::4]]     # 屋顶天窗透出橙光
        put(f'out_vent{i}', vb, None, mats['vent'])
    # 贫民窟：连片往外伸（§0.5 贫民窟连片）
    sb, sc_, sr = [], [], []
    for a0, a1 in SLUM_ANGLES:
        AA, RR = np.meshgrid(np.radians(np.linspace(a0, a1, 26)), np.arange(KEEP_OUT, 6300., 95.), indexing='ij')
        x, y = (np.cos(AA) * RR).ravel(), (np.sin(AA) * RR).ravel(); r = np.hypot(x, y)
        k2 = rng.random(len(x)) < np.clip(.9 - (r - KEEP_OUT) / 5200., .05, .9)   # 越往外越稀
        x, y = x[k2], y[k2]
        h = rng.uniform(4., 9.5, len(x)); w = rng.uniform(6., 16., len(x))
        sb.append(np.stack([x, y, w, w * rng.uniform(.7, 1.3, len(x)), np.full(len(x), gz + .5), np.full(len(x), gz + .5) + h], 1))
        sc_.append(np.clip(rng.uniform(.055, .105, (len(x), 1)) * np.array([1., .92, .82], np.float32), .01, .4))
        sr.append(rng.uniform(0, math.pi, len(x)))
    if sb:
        put('out_slum', np.concatenate(sb), np.concatenate(sc_), mats['slum'], np.concatenate(sr))
        stat['slum'] = int(sum(len(b) for b in sb))
    # 货运铁路：向外放射的干线 + 编组场（§0.5）
    fb, yb, hb, sb2, lights = [], [], [], [], []
    for i in range(FREIGHT):
        a = 12 + i * 360. / FREIGHT + 6
        p0, p1 = radial_ends(a, 6700.)
        (x, y), L, rot = seg(p0, p1)
        fb.append((x, y, L, 15., gz + .4, gz + 1.2)); yb.append(rot)
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        t0 = 2400. + i * 260.                                   # 编组场：扇形股道
        for j in range(11):
            off = (j - 5) * 26.
            q0 = (ca * t0 - sa * off, sa * t0 + ca * off)
            (x, y), L, rot = seg(q0, (q0[0] + ca * 620., q0[1] + sa * 620.))
            yb.append(rot); fb.append((x, y, L, 13., gz + .4, gz + 1.1))
        tt = 1500. + i * 700.                                   # 一列货车 + 车头灯
        for j in range(9):
            u = tt + j * 17.
            fb.append((ca * u, sa * u, 16., 3.4, gz + 1.2, gz + 5.2)); yb.append(rot)
        hb.append((ca * (tt - 12.), sa * (tt - 12.), 5., 4., gz + 2.4, gz + 4.4))
        lights.append((ca * (tt - 26.), sa * (tt - 26.), gz + 3.4))
        for u in np.arange(math.hypot(*p0), 6700., 78.):        # 沿线的钠灯：越往外越稀（§0.5「钠灯点越往外越稀」）
            if rng.random() > max(.35, .95 - .62 * (u - 1500.) / 5200.): continue
            sb2.append((ca * u + 11., sa * u + 11., 3.4, 3.4, gz + 7.5, gz + 9.))
    put('out_freight', fb, None, mats['ballast'], yb)
    put('out_trainhead', hb, None, mats['head'])
    put('out_sodium', sb2, None, mats['sodium'])
    tc.point_lights('out_headlight', [(x, y, z, (1., .95, .88)) for x, y, z in lights], 26000., 8.)
    # 干道 + 零碎霓虹（黑市 / 汤锅一带，夜班更亮）
    radials = (20, 65, 110, 155, 200, 245, 290, 335)
    B, R = road_net(gz, radials, (2500., 4100., 5600.), road_w=26.)
    nb, nc = [], []
    for a in radials:
        p0, _p1 = radial_ends(a, 6600., 1.05)
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        for u in np.arange(math.hypot(*p0), 6600., 240.):
            if rng.random() > .55 + .3 * P['mkt']: continue      # 夜班黑市一带的零碎霓虹更多
            nb.append((ca * u + rng.uniform(-14, 14), sa * u + rng.uniform(-14, 14), rng.uniform(6., 18.), 3., gz + 5., gz + 9.))
            nc.append(NEON[int(rng.random() * 3)])
    put('out_roads', B, None, mats['road'], R)
    put('out_neon', nb, nc, mats['neon'])
    stat.update(freight=dict(lines=FREIGHT, trains=FREIGHT, headlight=len(lights), sodium=len(sb2)),
                roads=len(radials), neon=len(nb))
    return mats, stat


# ---------------------------------------------------------------- 相机与渲染
def ring_camera(tier):
    """外圈相机：与本层主图同一朝向、同一画框中心（直接取已发布的相机文件的 centre_m 与轴），
    画框放到 14 080 × 8 800 m、4000 × 2500 px（约 3.5 m / px）。同一层的三个时段 / 两班因此同一哈希。"""
    src = os.path.join(HERE, '..', TIER[tier]['cam'])
    old = json.load(open(src, encoding='utf-8'))
    frame = dict(centre_m=old['frame']['centre_m'], w_m=FRAME_M[0], h_m=FRAME_M[1], px=list(FRAME_PX))
    cam = PJ.cam_file(frame, m_per_px=M_PER_PX)
    tick(f"camera from {TIER[tier]['cam']} hash {old['hash']} -> ring hash {cam['hash']} "
         f"({cam['frame']['px'][0]}x{cam['frame']['px'][1]} px, {M_PER_PX:.2f} m/px)")
    return cam, old['hash']


def sky_and_sun(sc, tier, P):
    """天光与太阳（§0.4）：太阳走西南（OBLIQUE_SUN_AZ = 225），影子落向东北；中层的天光比上层暗。
    下层没有日照也没有天光（L34）：不建太阳，世界只有中层底板漏下来的一点暗橙。"""
    w = bpy.data.worlds.new('obl_world'); sc.world = w; nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    if tier == 'low' or not P.get('sky'):
        bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs[0].default_value = (*P.get('amb', (.010, .014, .028)), 1)
        bg.inputs[1].default_value = P.get('ambi', 1.0)
        nt.links.new(bg.outputs[0], out.inputs['Surface'])
    else:
        sk = nt.nodes.new('ShaderNodeTexSky'); sk.sky_type = 'MULTIPLE_SCATTERING'; sk.sun_disc = False
        sk.sun_elevation = math.radians(P['el']); sk.sun_rotation = math.radians((90 - PJ.OBLIQUE_SUN_AZ) % 360); sk.altitude = 300
        lit = nt.nodes.new('ShaderNodeBackground'); nt.links.new(sk.outputs[0], lit.inputs[0]); lit.inputs[1].default_value = P['sky']
        cam = nt.nodes.new('ShaderNodeBackground'); cam.inputs[1].default_value = 1.0
        tcn = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tcn.outputs['Generated'], sp.inputs[0])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.clamp = True
        mr.inputs['From Min'].default_value = -.25; mr.inputs['From Max'].default_value = .45
        nt.links.new(sp.outputs['Z'], mr.inputs['Value'])
        ramp = nt.nodes.new('ShaderNodeValToRGB'); e0, e1 = ramp.color_ramp.elements
        e0.color = (*P['horizon'], 1); e1.color = (*P['zenith'], 1)
        nt.links.new(mr.outputs['Result'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], cam.inputs[0])
        lp = nt.nodes.new('ShaderNodeLightPath'); mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs['Fac'])
        nt.links.new(cam.outputs[0], mx.inputs[1]); nt.links.new(lit.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs['Surface'])
    if tier == 'low' or P.get('sky', 0) <= 0: return
    ld = bpy.data.lights.new('sun', 'SUN'); ld.energy = P['e']; ld.color = P['sun']; ld.angle = math.radians(.8)
    so = bpy.data.objects.new('sun', ld); sc.collection.objects.link(so)
    el, a = math.radians(P['el']), math.radians(PJ.OBLIQUE_SUN_AZ)
    from mathutils import Vector
    d = Vector((math.cos(el) * math.cos(a), math.cos(el) * math.sin(a), math.sin(el)))
    so.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


def cycles(sc, samples, noise, bounces=4):
    sc.render.engine = 'CYCLES'
    gpu = tc.setup_render_device(sc); sc.cycles.device = 'GPU' if gpu else 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = noise
    sc.cycles.use_denoising = True
    try: sc.cycles.denoising_use_gpu = gpu
    except AttributeError: pass
    try: sc.cycles.use_light_tree = True
    except AttributeError: pass
    c = sc.cycles; c.max_bounces = bounces; c.diffuse_bounces = min(bounces, 2); c.glossy_bounces = min(bounces, 2)
    c.transmission_bounces = min(bounces, 2); c.volume_bounces = 0; c.transparent_max_bounces = 8
    c.caustics_reflective = c.caustics_refractive = False
    c.use_auto_tile = True; c.tile_size = 2048
    sc.render.film_transparent = False                     # 外圈是完整不透明画面（§0.3 / §0.5）
    s = sc.render.image_settings; s.file_format = 'PNG'; s.color_mode = 'RGBA'; s.color_depth = '8'; s.compression = 15
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'


def kill_emission(sc, keep=()):
    """关掉所有自发光强度（含雾），只留 keep 里的材质。源图 / 暗检用。"""
    n = 0
    for m in bpy.data.materials:
        if m.name in keep: continue
        nt = getattr(m, 'node_tree', None)
        if nt is None: continue
        for nd in nt.nodes:                                  # 不看有没有连线：被顶点色之类驱动时，链接还在就等于没关
            if nd.type == 'EMISSION':
                for lk in list(nd.inputs['Strength'].links): nt.links.remove(lk)
                nd.inputs['Strength'].default_value = 0.0; n += 1
            elif nd.type == 'BSDF_PRINCIPLED':
                for lk in list(nd.inputs['Emission Strength'].links): nt.links.remove(lk)
                nd.inputs['Emission Strength'].default_value = 0.0; n += 1


def emit_only(sc):
    """源图（§0.8 第 2 条）：关掉所有灯光对象，自发光不再照亮别处，成图里亮的只剩相机直接看到的发光面。"""
    for ob in sc.objects:
        if ob.type == 'LIGHT': ob.hide_render = True
        elif ob.type == 'MESH': ob.visible_diffuse = ob.visible_glossy = ob.visible_transmission = False
    for m in bpy.data.materials:
        try: m.cycles.emission_sampling = 'NONE'
        except AttributeError: pass
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
    c = sc.cycles; c.samples = 4; c.use_denoising = False; c.max_bounces = 0


def dark_pass(sc):
    """暗检（§0.8 第 5 条，下层）：所有灯与自发光关掉、世界归零——外圈里没有天光，应该整张全黑。"""
    for ob in sc.objects:
        if ob.type == 'LIGHT': ob.hide_render = True
    kill_emission(sc)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
    c = sc.cycles; c.samples = 8; c.use_denoising = False; c.max_bounces = 1


def lights_uv(cam):
    """所有灯光对象的画框坐标——亮斑要么在源图里有源，要么旁边有灯。"""
    out = []
    for ob in bpy.context.scene.objects:
        if ob.type == 'LIGHT' and ob.data.type != 'SUN':
            u, v = PJ.project_ortho(list(ob.matrix_world.translation), cam)
            if 0 <= u <= 1 and 0 <= v <= 1: out.append([round(u, 5), round(v, 5)])
    return out


def main(tier):
    opt = tc.parse_args({})
    tod = str(opt.get('--obtod', 'night' if tier == 'mid' else 'nightshift'))
    P = dict(PERIODS[tier][tod])
    gz, z_c = TIER[tier]['ground'], TIER[tier]['z_c']
    out = os.path.abspath(str(opt['--out'])); samples = int(opt.get('--samples', 64))
    res = int(opt.get('--obres', 0) or 0); exr = str(opt.get('--exr', '0')) == '1'; dark = str(opt.get('--dark', '0')) == '1'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tok = set_fog(P['tok'], float(opt.get('--exp', P['exp'])))
    rng = np.random.default_rng(int(opt.get('--seed', 20261003)))
    _, sc, _ = tc.setup()
    tick(f'{tier} outskirts {tod}: fog {tok} {FOG}, ground {gz} m, frame {FRAME_M[0]:.0f} x {FRAME_M[1]:.0f} m')
    mats, stat = (mid_content(sc, rng, P, gz) if tier == 'mid' else low_content(sc, rng, P, gz))
    tick('content: ' + ', '.join(f'{k}={v}' for k, v in stat.items() if not isinstance(v, dict)))
    bpy.context.view_layer.update()
    cycles(sc, samples, float(opt.get('--noise', .015)))
    sky_and_sun(sc, tier, P)
    sc.view_settings.exposure = float(opt.get('--exp', P['exp']))
    cam, src_hash = ring_camera(tier)
    OB.ortho_camera(sc, cam, res or None, standoff=STANDOFF)
    if dark:
        dark_pass(sc)
        OB.ortho_camera(sc, cam, 512, standoff=STANDOFF)
        sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
        json.dump(dict(camera=cam, period=dict(P, tod=tod), check='dark pass', fog=dict(token=P['tok'], hex=tok)),
                  open(sc.render.filepath + '.meta.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        tick('WROTE ' + sc.render.filepath); return
    if P.get('glare'): tc.glare(sc, *P['glare'], tight=P.get('tight'))
    sc.render.filepath = out
    t1 = time.time(); bpy.ops.render.render(write_still=True)
    tick(f'WROTE {out} {sc.render.resolution_x}x{sc.render.resolution_y} in {(time.time() - t1) / 60:.1f} min')
    meta = dict(camera=cam, islands={}, markers={}, lights_uv=lights_uv(cam) if exr else [], period=dict(P, tod=tod),
                fog=dict(token=P['tok'], tod=tod, hex=tok, rgb_linear=[round(c, 5) for c in FOG], r_m=list(FOG_R), ramp=[list(x) for x in FOG_RAMP],
                         noise=[[1 / 2400., 450.], [1 / 640., 150.]], border_m=7040.),
                content=stat, keep_out_m=KEEP_OUT, column_m=list(COL),
                scene=dict(script=f'blender/outskirts.py (tier {tier}, via tiancheng_{tier}.py --outskirts)', unit_m=1.0,
                           ground_m=gz, tier_cam=TIER[tier]['cam'], tier_cam_hash=src_hash, blender=bpy.app.version_string),
                render=dict(tod=tod, samples=samples, res=[sc.render.resolution_x, sc.render.resolution_y],
                            minutes=round((time.time() - t1) / 60, 2), m_per_px=M_PER_PX))
    json.dump(meta, open(out + '.meta.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if exr:
        emit_only(sc); OB.ortho_camera(sc, cam, res or None, standoff=STANDOFF)
        sc.render.filepath = os.path.splitext(out)[0] + '_emit.png'; bpy.ops.render.render(write_still=True)
        tick('WROTE ' + sc.render.filepath)


if __name__ == '__main__':
    sys.exit('由层脚本调用（--outskirts），不要单独跑')
