"""奶牛挤奶厅测试件（双 8 位鱼骨式 + 奶罐间 + 电围栏围场），全部自建，无动物、无品牌。

用法（仓库根目录）：
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python blender/props/dairy_parlour/build.py -- --cam c1 --res 1000 --samples 24 --out /tmp/x.png
cam: c1 室内沿坑 / c2 杯组特写 / c3 外景围场。素材先跑 python3 blender/props/fetch_assets.py。
"""
import math, os, random, sys
import bpy, bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from layout import *  # noqa

DATA = os.path.abspath(os.path.join(HERE, '..', '..', 'data', 'props'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ARGS = dict(cam='c1', res='1000', samples='24', out='/tmp/dairy.png', blend='')
for k, v in zip(argv[::2], argv[1::2]):
    ARGS[k.lstrip('-')] = v
random.seed(7)

# ---------------------------------------------------------------- 场景
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type != 'CPU'
sc.cycles.device = 'GPU'
sc.cycles.samples = int(ARGS['samples'])
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 8
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'


def tex_path(aid, kind):
    if aid[0].isupper():   # ambientCG
        m = {'diff': 'Color', 'rough': 'Roughness', 'nor_gl': 'NormalGL', 'metal': 'Metalness'}[kind]
        return os.path.join(DATA, 'tex', aid, f'{aid}_2K-JPG_{m}.jpg')
    return os.path.join(DATA, 'tex', aid, f'{aid}_{kind}_2k.jpg')


def img(nt, path, coords, noncolor=False):
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        n.image.colorspace_settings.name = 'Non-Color'
    n.projection = 'BOX'
    n.projection_blend = 0.25
    nt.links.new(coords, n.inputs['Vector'])
    return n


def new_mat(name):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    return m, nt, bsdf


def coords(nt, scale):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (scale,) * 3
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    return mp.outputs[0]


def pbr(name, aid, tile, tint=None, rough_mul=1.0, wet=0.0, nstr=1.0, metal=0.0, desat=False, grime=False):
    """box 投影 PBR；wet>0 时用噪声做积水（压暗 + 降粗糙度）。"""
    m, nt, b = new_mat(name)
    c = coords(nt, 1.0 / tile)
    d = img(nt, tex_path(aid, 'diff'), c)
    r = img(nt, tex_path(aid, 'rough'), c, True)
    n = img(nt, tex_path(aid, 'nor_gl'), c, True)
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = nstr
    nt.links.new(n.outputs[0], nm.inputs['Color'])
    nt.links.new(nm.outputs[0], b.inputs['Normal'])
    col = d.outputs[0]
    if desat:
        hs = nt.nodes.new('ShaderNodeHueSaturation')
        hs.inputs['Saturation'].default_value = 0.0
        hs.inputs['Value'].default_value = 1.6
        nt.links.new(col, hs.inputs['Color'])
        col = hs.outputs[0]
    if tint:
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
        mx.inputs['Factor'].default_value = 1.0
        nt.links.new(col, mx.inputs[6]); mx.inputs[7].default_value = (*tint, 1)
        col = mx.outputs[2]
    rm = nt.nodes.new('ShaderNodeMath'); rm.operation = 'MULTIPLY'
    rm.inputs[1].default_value = rough_mul
    nt.links.new(r.outputs[0], rm.inputs[0])
    rough = rm.outputs[0]
    if wet > 0:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 0.9
        nz.inputs['Detail'].default_value = 6
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = 0.6 - wet * 0.08
        ramp.color_ramp.elements[1].position = 0.75 - wet * 0.08
        nt.links.new(nz.outputs[0], ramp.inputs[0])
        dk = nt.nodes.new('ShaderNodeMix'); dk.data_type = 'RGBA'; dk.blend_type = 'MULTIPLY'
        nt.links.new(ramp.outputs[0], dk.inputs['Factor'])
        nt.links.new(col, dk.inputs[6]); dk.inputs[7].default_value = (0.55, 0.55, 0.55, 1)
        col = dk.outputs[2]
        rw = nt.nodes.new('ShaderNodeMix'); rw.data_type = 'FLOAT'
        nt.links.new(ramp.outputs[0], rw.inputs['Factor'])
        nt.links.new(rough, rw.inputs[2]); rw.inputs[3].default_value = 0.09
        rough = rw.outputs[0]
        # 积水处法线变平
        nf = nt.nodes.new('ShaderNodeMix'); nf.data_type = 'FLOAT'
        nt.links.new(ramp.outputs[0], nf.inputs['Factor'])
        nf.inputs[2].default_value = nstr; nf.inputs[3].default_value = 0.1
        nt.links.new(nf.outputs[0], nm.inputs['Strength'])
    if grime:
        # 墙根泥溅：世界 z 0–0.6 m 渐变 × 噪声，压暗偏棕、变粗糙
        gp = nt.nodes.new('ShaderNodeNewGeometry'); sz = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(gp.outputs['Position'], sz.inputs[0])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 0.9
        mr.inputs['To Min'].default_value = 1.0; mr.inputs['To Max'].default_value = 0.0
        nt.links.new(sz.outputs[2], mr.inputs['Value'])
        gn = nt.nodes.new('ShaderNodeTexNoise'); gn.inputs['Scale'].default_value = 7; gn.inputs['Detail'].default_value = 12
        nt.links.new(gp.outputs['Position'], gn.inputs['Vector'])
        gm_ = nt.nodes.new('ShaderNodeMath'); gm_.operation = 'MULTIPLY'
        nt.links.new(mr.outputs[0], gm_.inputs[0])
        g2 = nt.nodes.new('ShaderNodeMath'); g2.operation = 'MULTIPLY_ADD'; g2.inputs[1].default_value = 2.4; g2.inputs[2].default_value = -0.35
        nt.links.new(gn.outputs[0], g2.inputs[0]); nt.links.new(g2.outputs[0], gm_.inputs[1])
        cl = nt.nodes.new('ShaderNodeMath'); cl.operation = 'MINIMUM'; cl.inputs[1].default_value = 1.0
        nt.links.new(gm_.outputs[0], cl.inputs[0])
        gmix = nt.nodes.new('ShaderNodeMix'); gmix.data_type = 'RGBA'
        nt.links.new(cl.outputs[0], gmix.inputs['Factor']); nt.links.new(col, gmix.inputs[6])
        gmix.inputs[7].default_value = (0.1, 0.075, 0.05, 1)
        col = gmix.outputs[2]
    nt.links.new(col, b.inputs['Base Color'])
    nt.links.new(rough, b.inputs['Roughness'])
    b.inputs['Metallic'].default_value = metal
    return m


def steel(name, base_rough=0.22, brushed=True, tile=0.6, color=(0.78, 0.78, 0.8)):
    """不锈钢：ambientCG Metal009 的拉丝粗糙度 + 各向异性。"""
    m, nt, b = new_mat(name)
    c = coords(nt, 1.0 / tile)
    r = img(nt, tex_path('Metal009', 'rough'), c, True)
    n = img(nt, tex_path('Metal009', 'nor_gl'), c, True)
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value = base_rough * 0.6
    mr.inputs['To Max'].default_value = base_rough * 1.6
    nt.links.new(r.outputs[0], mr.inputs['Value'])
    nt.links.new(mr.outputs[0], b.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.4
    nt.links.new(n.outputs[0], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = 1.0
    if brushed:
        b.inputs['Anisotropic'].default_value = 0.6
    # 水垢 / 手摸痕：噪声斑块把粗糙度抬高、颜色压灰
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 22; nz.inputs['Detail'].default_value = 6
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    rp = nt.nodes.new('ShaderNodeValToRGB')
    rp.color_ramp.elements[0].position = 0.6; rp.color_ramp.elements[1].position = 0.75
    nt.links.new(nz.outputs[0], rp.inputs[0])
    mxr = nt.nodes.new('ShaderNodeMix'); mxr.data_type = 'FLOAT'
    nt.links.new(rp.outputs[0], mxr.inputs['Factor']); nt.links.new(mr.outputs[0], mxr.inputs[2]); mxr.inputs[3].default_value = 0.42
    nt.links.new(mxr.outputs[0], b.inputs['Roughness'])
    mxc = nt.nodes.new('ShaderNodeMix'); mxc.data_type = 'RGBA'
    nt.links.new(rp.outputs[0], mxc.inputs['Factor'])
    mxc.inputs[6].default_value = (*color, 1); mxc.inputs[7].default_value = (0.7, 0.69, 0.66, 1)
    nt.links.new(mxc.outputs[2], b.inputs['Base Color'])
    return m


def galvanised(name='galv'):
    m, nt, b = new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 14
    nz.inputs['Detail'].default_value = 8
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.42, 0.43, 0.44, 1)
    ramp.color_ramp.elements[1].color = (0.7, 0.71, 0.72, 1)
    nt.links.new(nz.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], b.inputs['Base Color'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value = 0.28; mr.inputs['To Max'].default_value = 0.5
    nt.links.new(nz.outputs[0], mr.inputs['Value'])
    nt.links.new(mr.outputs[0], b.inputs['Roughness'])
    b.inputs['Metallic'].default_value = 1.0
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.05
    nt.links.new(nz.outputs[0], bp.inputs['Height']); nt.links.new(bp.outputs[0], b.inputs['Normal'])
    return m


def plastic(name, color, rough=0.45, sss=0.0, coat=0.0):
    m, nt, b = new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 60
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value = rough * 0.8; mr.inputs['To Max'].default_value = rough * 1.25
    nt.links.new(nz.outputs[0], mr.inputs['Value']); nt.links.new(mr.outputs[0], b.inputs['Roughness'])
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Subsurface Weight'].default_value = sss
    b.inputs['Coat Weight'].default_value = coat
    return m


def rubber(name, color=(0.02, 0.02, 0.02), tile=0.3):
    m = pbr(name, 'Rubber004', tile, tint=None, rough_mul=1.0, nstr=0.5)
    b = m.node_tree.nodes['Principled BSDF']
    # 黑橡胶：丢掉贴图颜色，保留粗糙度 / 法线
    for l in list(b.inputs['Base Color'].links):
        m.node_tree.links.remove(l)
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Specular IOR Level'].default_value = 0.35
    nt = m.node_tree
    tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 400
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.05
    nt.links.new(nz.outputs[0], bp.inputs['Height'])
    nt.links.new(nt.nodes['Normal Map'].outputs[0], bp.inputs['Normal'])
    nt.links.new(bp.outputs[0], b.inputs['Normal'])
    return m


def clear_hose(name='clear_hose'):
    m, nt, b = new_mat(name)
    b.inputs['Base Color'].default_value = (0.92, 0.95, 0.93, 1)
    b.inputs['Transmission Weight'].default_value = 0.85
    b.inputs['Roughness'].default_value = 0.18
    b.inputs['IOR'].default_value = 1.49
    return m


def emissive(name, strength):
    m, nt, b = new_mat(name)
    b.inputs['Base Color'].default_value = (0.95, 0.95, 0.95, 1)
    b.inputs['Emission Color'].default_value = (1.0, 0.97, 0.92, 1)
    b.inputs['Emission Strength'].default_value = strength
    b.inputs['Transmission Weight'].default_value = 0.4
    b.inputs['Roughness'].default_value = 0.5
    return m


def paint(name, color, rough=0.5, dirt=0.3):
    m, nt, b = new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3; nz.inputs['Detail'].default_value = 10
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    mx.inputs[6].default_value = (*color, 1)
    mx.inputs[7].default_value = (color[0] * 0.55, color[1] * 0.5, color[2] * 0.45, 1)
    ramp = nt.nodes.new('ShaderNodeMath'); ramp.operation = 'MULTIPLY'; ramp.inputs[1].default_value = dirt
    nt.links.new(nz.outputs[0], ramp.inputs[0]); nt.links.new(ramp.outputs[0], mx.inputs['Factor'])
    nt.links.new(mx.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    return m


M = {}
M['floor'] = pbr('floor_wet', 'concrete_floor_worn_001', 2.5, rough_mul=0.9, wet=0.55, tint=(0.5, 0.5, 0.5), desat=True)
M['yard'] = pbr('yard', 'concrete_floor_worn_001', 3.0, wet=0.3)
M['mat'] = pbr('rubber_mat', 'rubber_tiles', 0.6, wet=0.4, rough_mul=0.9)
M['block'] = pbr('block', 'concrete_wall_008', 2.0, tint=(0.95, 0.95, 0.93), grime=True)
M['pitwall'] = pbr('pitwall', 'smooth_concrete_floor', 1.5, tint=(0.62, 0.63, 0.62), wet=0.3, desat=True)
M['clad'] = pbr('cladding', 'box_profile_metal_sheet', 1.5, tint=(0.62, 0.66, 0.64), metal=0.5, desat=True)
M['wood'] = pbr('post_wood', 'rough_wood', 0.8, tint=(0.8, 0.72, 0.62))
M['grass_ground'] = pbr('grass_ground', 'grass_ground', 2.0)
M['steel'] = steel('steel_brushed')
M['steel_polish'] = steel('steel_polished', base_rough=0.24, tile=0.1)
M['tank'] = steel('tank_brushed', base_rough=0.38, tile=1.0, color=(0.7, 0.7, 0.71))
M['psu'] = clear_hose('polysulfone')
_b = M['psu'].node_tree.nodes['Principled BSDF']
_b.inputs['Base Color'].default_value = (0.98, 0.9, 0.74, 1); _b.inputs['Transmission Weight'].default_value = 1.0; _b.inputs['Roughness'].default_value = 0.08; _b.inputs['IOR'].default_value = 1.63
M['jet_old'] = plastic('jetter_worn', (0.78, 0.76, 0.68), rough=0.5)
M['galv'] = galvanised()
M['rubber'] = rubber('rubber_black')
M['hose'] = clear_hose()
M['frame'] = paint('frame_paint', (0.28, 0.33, 0.3), rough=0.55, dirt=0.4)
M['yellow'] = plastic('insulator_yellow', (0.85, 0.6, 0.02), rough=0.35, sss=0.15)
M['white_pvc'] = plastic('pvc_white', (0.85, 0.85, 0.82), rough=0.3)
M['grey_box'] = plastic('energiser_grey', (0.18, 0.2, 0.22), rough=0.4, coat=0.3)
M['red'] = plastic('terminal_red', (0.6, 0.03, 0.02), rough=0.3)
M['green'] = plastic('terminal_green', (0.05, 0.35, 0.08), rough=0.3)
M['tape'] = plastic('fence_tape', (0.9, 0.9, 0.86), rough=0.6, sss=0.2)
M['wire'] = plastic('polywire', (0.85, 0.85, 0.8), rough=0.5)
M['lamp'] = emissive('lamp_diffuser', 18.0)
M['glass'] = clear_hose('receiver_glass')
M['glass'].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value = 1.0
M['glass'].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.05
M['display'] = emissive('display', 2.0)
M['lcd'] = emissive('lcd', 1.2)
M['lcd'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.02, 0.03, 0.03, 1)
M['lcd'].node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (0.35, 0.6, 0.75, 1)
M['lcd'].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value = 0.0
M['lcd'].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.08
M['display'].node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (0.2, 0.9, 0.4, 1)

# 屋面：压型钢板 + 每 3 m 一条采光板
roof, nt, b = new_mat('roof')
c = coords(nt, 1 / 1.5)
for k in ('diff', 'rough', 'nor_gl'):
    pass
d = img(nt, tex_path('box_profile_metal_sheet', 'diff'), c)
r = img(nt, tex_path('box_profile_metal_sheet', 'rough'), c, True)
n = img(nt, tex_path('box_profile_metal_sheet', 'nor_gl'), c, True)
nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(n.outputs[0], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
hs = nt.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = 0.0
nt.links.new(d.outputs[0], hs.inputs['Color']); nt.links.new(hs.outputs[0], b.inputs['Base Color']); nt.links.new(r.outputs[0], b.inputs['Roughness'])
b.inputs['Metallic'].default_value = 0.6
tr = nt.nodes.new('ShaderNodeBsdfPrincipled')
tr.inputs['Base Color'].default_value = (0.9, 0.92, 0.9, 1)
tr.inputs['Transmission Weight'].default_value = 0.9; tr.inputs['Roughness'].default_value = 0.6
nt.links.new(nm.outputs[0], tr.inputs['Normal'])
tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(tc.outputs['Object'], sep.inputs[0])
md = nt.nodes.new('ShaderNodeMath'); md.operation = 'FLOORED_MODULO'; md.inputs[1].default_value = 5.0
nt.links.new(sep.outputs[0], md.inputs[0])
lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = 1.2
nt.links.new(md.outputs[0], lt.inputs[0])
mix = nt.nodes.new('ShaderNodeMixShader')
nt.links.new(lt.outputs[0], mix.inputs[0]); nt.links.new(b.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], nt.nodes['Material Output'].inputs[0])
M['roof'] = roof

COL = bpy.data.collections.new('parlour'); sc.collection.children.link(COL)


def link(ob):
    COL.objects.link(ob)
    return ob


def box(name, x0, x1, y0, y1, z0, z1, mat, bev=0.006):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = (x1 - x0) * v.co.x
        v.co.y = (y1 - y0) * v.co.y
        v.co.z = (z1 - z0) * v.co.z
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    me.materials.append(mat)
    if bev:
        mo = ob.modifiers.new('bev', 'BEVEL'); mo.width = bev; mo.segments = 2; mo.limit_method = 'ANGLE'
        mo.harden_normals = True
    return ob


def cyl(name, loc, r, h, mat, axis='Z', seg=32, bev=0.003, rot=None, r2=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me))
    ob.location = loc
    if rot:
        ob.rotation_euler = rot
    elif axis == 'X':
        ob.rotation_euler = (0, math.pi / 2, 0)
    elif axis == 'Y':
        ob.rotation_euler = (math.pi / 2, 0, 0)
    me.materials.append(mat)
    if bev:
        mo = ob.modifiers.new('bev', 'BEVEL'); mo.width = bev; mo.segments = 2; mo.limit_method = 'ANGLE'
        mo.harden_normals = True
    return ob


def sphere(name, loc, r, mat, scale=(1, 1, 1)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=r)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me))
    ob.location = loc; ob.scale = scale
    me.materials.append(mat)
    return ob


def tube(name, pts, r, mat, smooth=True, ribbon=0.0, res=10):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.resolution_u = res
    if ribbon:
        cu.extrude = ribbon
    else:
        cu.bevel_depth = r
        cu.bevel_resolution = 6
        cu.use_fill_caps = True
    if smooth:
        sp = cu.splines.new('BEZIER')
        sp.bezier_points.add(len(pts) - 1)
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
    else:
        sp = cu.splines.new('POLY')
        sp.points.add(len(pts) - 1)
        for pp, p in zip(sp.points, pts):
            pp.co = (*p, 1)
    ob = link(bpy.data.objects.new(name, cu))
    cu.materials.append(mat)
    return ob


def bent(pts, rad=0.12):
    """折线的拐角倒成圆弧（弯管）。"""
    out = [Vector(pts[0])]
    for a, b, c in zip(pts, pts[1:], pts[2:]):
        a, b, c = Vector(a), Vector(b), Vector(c)
        u = (a - b).normalized(); w = (c - b).normalized()
        rr = min(rad, (a - b).length / 2.2, (c - b).length / 2.2)
        p0, p2 = b + u * rr, b + w * rr
        for t in (0, 0.25, 0.5, 0.75, 1):
            out.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t * t * p2)
    out.append(Vector(pts[-1]))
    return [tuple(p) for p in out]


def pipe(name, pts, r, mat, rad=0.12):
    return tube(name, bent(pts, rad), r, mat, smooth=False)


def import_gltf(aid, loc, rot=(0, 0, 0), scale=1.0):
    p = os.path.join(DATA, 'models', aid, f'{aid}_1k.gltf')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=p)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location = loc; o.rotation_euler = rot; o.scale = (scale,) * 3
    return new


# ---------------------------------------------------------------- 地面 / 坑
X0, X1, Y0, Y1 = SHED
PX0, PX1, PY0, PY1 = PIT
HOLE = (PX0 - 1.2, PX1 + 0.9)             # 坑洞：西端 1.2 m 是下坑台阶
FZ = -0.3                                 # 楼板底
D = PIT_DEPTH
box('floor_w', X0, HOLE[0], Y0, Y1, FZ, 0, M['floor'], 0)
box('floor_e', HOLE[1], X1, Y0, Y1, FZ, 0, M['floor'], 0)
box('floor_n', HOLE[0], HOLE[1], PY1, Y1, FZ, 0, M['floor'], 0)
box('floor_s', HOLE[0], HOLE[1], Y0, PY0, FZ, 0, M['floor'], 0)
box('pit_floor', HOLE[0], HOLE[1], PY0, PY1, -D - 0.3, -D, M['floor'], 0)
box('pit_mat', PX0, PX1 + 0.2, PY0 + 0.25, PY1 - 0.25, -D, -D + 0.018, M['mat'], 0.004)
# 坑壁贴面（浅色光面混凝土）+ 不锈钢包边
for s in (1, -1):
    yy = s * PY1
    box(f'pitwall_{s}', HOLE[0], HOLE[1], yy - 0.01 * s if s > 0 else yy, yy if s > 0 else yy + 0.01, -D, -0.001, M['pitwall'], 0)
    box(f'kerb_{s}', HOLE[0], HOLE[1], min(yy, yy + s * 0.06), max(yy, yy + s * 0.06), -0.004, 0.012, M['steel'], 0.003)
    box(f'kerb_face_{s}', HOLE[0], HOLE[1], min(yy, yy - s * 0.004), max(yy, yy - s * 0.004), -0.18, 0.012, M['steel'], 0.002)
box('pitwall_e', HOLE[1] - 0.01, HOLE[1], PY0, PY1, -D, 0, M['pitwall'], 0)
# 下坑台阶（西端）
for i in range(4):
    z = -D + (i + 1) * D / 5
    box(f'step_{i}', HOLE[0], HOLE[0] + 1.2 - i * 0.3, -0.7, 0.7, -D, z, M['pitwall'], 0.01)
for s in (1, -1):
    pipe(f'handrail_{s}', [(HOLE[0] + 0.05, s * 0.8, 0.95), (HOLE[0] + 0.05, s * 0.8, 0.0), (HOLE[0] + 1.25, s * 0.8, -D + 0.9), (HOLE[0] + 1.25, s * 0.8, -D)], 0.022, M['steel'])
# 坑底排水沟 + 不锈钢篦子
box('drain', PX0 + 0.3, PX1, -0.09, 0.09, -D - 0.06, -D + 0.002, M['floor'], 0)
for i in range(int((PX1 - PX0 - 0.3) / 0.03)):
    x = PX0 + 0.32 + i * 0.03
    box(f'grate_{i}', x, x + 0.008, -0.09, 0.09, -D - 0.02, -D + 0.004, M['steel'], 0)

# 牛站台橡胶垫
for s in (1, -1):
    box(f'platform_mat_{s}', PX0, PX1, min(s * (PY1 + 0.07), s * (PY1 + PLATFORM_W)), max(s * (PY1 + 0.07), s * (PY1 + PLATFORM_W)), 0, 0.02, M['mat'], 0.004)

# ---------------------------------------------------------------- 牛栏（镀锌管）
t = math.radians(STALL_ANGLE)
SX = [STALL_X0 + i * STALL_PITCH for i in range(STALLS_PER_SIDE)]
for s in (1, -1):
    ye = s * PY1
    yr = ye + s * 0.14                       # 臀栏
    yf = ye + s * (PLATFORM_W - 0.1)         # 胸栏
    for z in (0.62, 1.08):
        pipe(f'rump_rail_{s}_{z}', [(PX0 - 0.2, yr, z), (PX1 + 0.2, yr, z)], 0.030, M['galv'])
        pipe(f'breast_rail_{s}_{z}', [(PX0 - 0.2, yf, z + 0.05), (PX1 + 0.2, yf, z + 0.05)], 0.030, M['galv'])
    # 不锈钢挡粪板（臀栏下，挡住坑）
    box(f'splash_{s}', PX0 - 0.2, PX1 + 0.2, min(yr, yr + s * 0.004), max(yr, yr + s * 0.004), 0.1, 0.55, M['steel'], 0.002)
    for i, x in enumerate(SX + [SX[-1] + STALL_PITCH]):
        # 斜向隔栏（弯管）：从臀栏斜到胸栏
        xa = x + 0.25
        xb = xa + (PLATFORM_W - 0.3) / math.tan(t) * 0.55
        pipe(f'divider_{s}_{i}', [(xa, yr, 0.62), (xa + 0.12, yr + s * 0.1, 1.05), (xb, yf - s * 0.05, 1.12), (xb, yf, 0.3)], 0.024, M['galv'], rad=0.15)
    for x in [PX0 - 0.2] + [PX0 + 2.2 * k for k in range(1, 5)] + [PX1 + 0.2]:
        for yy, top in ((yr, 2.35), (yf, 1.25)):
            cyl(f'post_{s}_{x:.1f}_{yy:.1f}', (x, yy, top / 2), 0.038, top, M['galv'])
            cyl(f'base_{s}_{x:.1f}_{yy:.1f}', (x, yy, 0.005), 0.08, 0.01, M['galv'], seg=24)
# 跨坑横梁（吊奶管 / 脉动管）
for x in [PX0 - 0.2] + [PX0 + 2.2 * k for k in range(1, 5)] + [PX1 + 0.2]:
    pipe(f'gantry_{x:.1f}', [(x, -(PY1 + 0.14), 2.35), (x, PY1 + 0.14, 2.35)], 0.035, M['galv'])

# ---------------------------------------------------------------- 奶管 / 脉动管 / 杯组
def torus(name, center, axis, R, r, mat, seg=32, rseg=12):
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(rseg):
            b_ = 2 * math.pi * j / rseg
            ring.append(bm.verts.new(((R + r * math.cos(b_)) * math.cos(a), (R + r * math.cos(b_)) * math.sin(a), r * math.sin(b_))))
        rings.append(ring)
    for i in range(seg):
        for j in range(rseg):
            bm.faces.new((rings[i][j], rings[(i + 1) % seg][j], rings[(i + 1) % seg][(j + 1) % rseg], rings[i][(j + 1) % rseg]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    o = link(bpy.data.objects.new(name, me))
    o.location = tuple(center)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector(axis).to_track_quat('Z', 'Y')
    return o


def cyl_between(name, p0, p1, r, mat, r2=None, bev=0.002, seg=24):
    p0, p1 = Vector(p0), Vector(p1)
    o = cyl(name, tuple((p0 + p1) / 2), r, (p1 - p0).length, mat, seg=seg, bev=bev, r2=r2)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = (p1 - p0).to_track_quat('Z', 'Y')
    return o


PULSE_Z = 1.9          # 脉动 / 真空管仍在架子高处
GZ = 2.35


def cluster(tag, C, face):
    """现代杯组，静止挂在钩上：爪在上，四个奶杯靠短奶管垂在下面，杯口（衬垫唇口）朝下。
    C = 爪中心；face = 朝坑外（牛那侧）的单位向量（x, y）。返回 (出奶口, 脉动分配器顶) 位置。"""
    C = Vector(C)
    # 爪：不锈钢底座 + 透明聚砜上罩 + 顶上黑色脉动分配器 + 挂环
    cyl(f'claw_base_{tag}', tuple(C + Vector((0, 0, -0.022))), 0.062, 0.03, M['steel_polish'], seg=48, bev=0.012)
    sphere(f'claw_bowl_{tag}', tuple(C + Vector((0, 0, 0.0))), 0.06, M['psu'], (1, 1, 0.75))
    cyl(f'distrib_{tag}', tuple(C + Vector((0, 0, 0.055))), 0.017, 0.03, M['grey_box'], bev=0.005)
    ring = C + Vector((0, 0, 0.078))
    cyl(f'claw_ring_{tag}', tuple(ring), 0.012, 0.004, M['steel'], axis='X', bev=0)
    # 出奶口（侧面，朝钩那边）
    fx, fy = face
    out0 = C + Vector((fx * 0.05, fy * 0.05, -0.028))
    out1 = out0 + Vector((fx * 0.035, fy * 0.035, -0.02))   # 底座下沿，朝外下倾 30°
    cyl_between(f'claw_outlet_{tag}', out0, out1, 0.009, M['steel'])
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        d = Vector((math.cos(a), math.sin(a), 0))
        # 爪上的短进奶嘴：斜向上外
        n0 = C + d * 0.04 + Vector((0, 0, 0.02))
        n1 = n0 + (d * 0.7 + Vector((0, 0, 0.7))).normalized() * 0.035
        cyl_between(f'nipple_{tag}_{k}', n0, n1, 0.0055, M['steel'])
        # 奶杯倒挂：杯壳长 145 mm、Ø 40 mm；上端是衬垫出口（短奶管），下端是唇口
        jitter = random.uniform(-0.01, 0.01)
        top = C + d * (0.085 + jitter) + Vector((0, 0, -0.035 + random.uniform(-0.01, 0.01)))
        tilt = d * 0.08 + Vector((random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), 0))
        axis = (Vector((0, 0, -1)) + tilt).normalized()
        bot = top + axis * 0.145
        cyl_between(f'shell_{tag}_{k}', top, bot, 0.016, M['steel_polish'], bev=0.004, seg=32, r2=0.021)   # 杯底（倒挂时朝上）细、杯口粗
        # 唇口：软黑橡胶，比壳粗一圈；中间是乳头孔
        lip1 = bot + axis * 0.028
        cyl_between(f'mouth_{tag}_{k}', bot - axis * 0.004, lip1, 0.0235, M['rubber'], bev=0.006, seg=32)
        torus(f'lip_{tag}_{k}', lip1 - axis * 0.004, axis, 0.019, 0.0075, M['rubber'])   # 翻边唇口
        cyl_between(f'mouthhole_{tag}_{k}', lip1 - axis * 0.002, lip1 + axis * 0.0005, 0.009, M['frame'], bev=0, seg=16)
        # 衬垫从杯壳上端伸出变成短奶管，拐弯接到爪上的进奶嘴
        stub = top - axis * 0.018
        cyl_between(f'linerstub_{tag}_{k}', top + axis * 0.004, stub, 0.011, M['rubber'], bev=0.003)
        tube(f'shortmilk_{tag}_{k}', [tuple(stub), tuple(stub - axis * 0.03 + d * 0.01), tuple(n1 + (n1 - n0).normalized() * 0.03), tuple(n1)], 0.0065, M['rubber'], res=16)
        # 杯壳侧面脉动嘴 + 细短脉动管到分配器
        side = top + axis * 0.02 + d * 0.021
        cyl_between(f'pnip_{tag}_{k}', side, side + d * 0.012, 0.003, M['steel'], bev=0)
        dist = C + Vector((0, 0, 0.055)) + d * 0.017
        tube(f'shortpulse_{tag}_{k}', [tuple(side + d * 0.012), tuple(side + d * 0.015 + Vector((0, 0, 0.02))), tuple(dist + d * 0.015 + Vector((0, 0, 0.01))), tuple(dist)], 0.0028, M['rubber'], res=16)
    return out1, C + Vector((0, 0, 0.07))


for s in (1, -1):
    ym = s * (PY1 + 0.05)
    yml = s * (PY1 - 0.09)   # 低位奶管贴坑壁
    pipe(f'milkline_{s}', [(PX0 - 0.3, yml, MILK_LINE_Z + 0.04), (PX1 + 0.1, yml, MILK_LINE_Z - 0.05), (RECEIVER[0], s * 0.2, -0.16), (RECEIVER[0], s * 0.2, -0.2)], 0.025, M['steel'], rad=0.2)
    for x in [PX0 + 1.1 * k for k in range(11)]:
        box(f'ml_bracket_{s}_{x:.1f}', x - 0.02, x + 0.02, min(s * PY1, yml), max(s * PY1, yml), MILK_LINE_Z - 0.04, MILK_LINE_Z - 0.025, M['steel'], 0.002)
    pipe(f'pulseline_{s}', [(PX0 - 0.3, 0, 2.6), (PX0 - 0.3, ym, 2.6), (PX0 - 0.3, ym, PULSE_Z), (PX1 + 0.3, ym, PULSE_Z)], 0.019, M['white_pvc'])
    for x in [PX0 + 1.1 * k for k in range(11)]:
        cyl(f'clamp_{s}_{x:.1f}', (x, ym, (PULSE_Z + GZ) / 2), 0.006, GZ - PULSE_Z, M['steel'])
    # 坑壁清洗托（jetter）供水管
    yw = s * (PY1 - 0.05)
    pipe(f'washline_{s}', [(PX0 - 0.2, yw, -0.62), (PX1 + 0.3, yw, -0.62)], 0.02, M['steel'])
    for i, x in enumerate(SX):
        cx, cy, cz = x + 0.3, s * (PY1 - 0.17), 0.36
        # 杯组挂钩：从臀栏伸进坑、向下弯出钩，钩住爪顶挂环
        pipe(f'hook_{s}_{i}', [(cx, s * (PY1 + 0.14), 0.62), (cx, s * (PY1 - 0.05), 0.62), (cx, cy, 0.5), (cx, cy, cz + 0.078), (cx + 0.02, cy, cz + 0.1)], 0.005, M['steel'], rad=0.03)
        outlet, ptop = cluster(f'{s}_{i}', (cx, cy, cz), (0, s))
        # 长奶管 Ø16（透明）：侧出口 → 下垂 → 上到奶管上半部的进奶口
        tube(f'longmilk_{s}_{i}', [tuple(outlet), tuple(outlet + Vector((0.03, s * 0.02, -0.08))), (cx - 0.05, s * (PY1 - 0.06), 0.1), (x + 0.05, yml, MILK_LINE_Z + 0.03)], 0.008, M['hose'])
        cyl(f'inlet_{s}_{i}', (x + 0.05, yml, MILK_LINE_Z + 0.02), 0.012, 0.05, M['steel'])
        # 双脉动长管（黑，两根并在一起）：分配器 → 脉动器
        for off in (-0.0065, 0.0065):
            tube(f'pulse_{s}_{i}_{off}', [tuple(ptop + Vector((off, 0, 0))), tuple(ptop + Vector((off - 0.02, s * 0.04, 0.12))), (cx - 0.1 + off, s * (PY1 + 0.03), 0.95), (x + 0.2 + off, s * (PY1 + 0.05), PULSE_Z - 0.08)], 0.0062, M['rubber'])
        box(f'pulsator_{s}_{i}', x + 0.14, x + 0.26, s * (PY1 + 0.05) - 0.04, s * (PY1 + 0.05) + 0.04, PULSE_Z - 0.1, PULSE_Z - 0.02, M['grey_box'], 0.008)
        # 清洗托：坑壁上一组四个开口朝上的白色清洗杯
        jz = -0.2 + random.uniform(-0.01, 0.01)
        box(f'jet_bracket_{s}_{i}', cx - 0.1, cx + 0.1, min(s * PY1, s * (PY1 - 0.26)), max(s * PY1, s * (PY1 - 0.26)), jz - 0.07, jz - 0.055, M['steel'], 0.003)
        for k, (dx, dy) in enumerate(((-0.065, 0.11), (0.065, 0.11), (-0.065, 0.23), (0.065, 0.23))):
            dx += random.uniform(-0.006, 0.006)
            jy = s * (PY1 - dy)
            jo = cyl(f'jetter_{s}_{i}_{k}', (cx + dx, jy, jz), 0.026, 0.08, random.choice((M['white_pvc'], M['jet_old'])), bev=0.006, seg=32, r2=0.03)
            jo.rotation_euler = (random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), 0)
            cyl(f'jetter_hole_{s}_{i}_{k}', (cx + dx, jy, jz + 0.0405), 0.023, 0.002, M['frame'], bev=0, seg=24)
            pipe(f'jet_feed_{s}_{i}_{k}', [(cx + dx, jy, jz - 0.04), (cx + dx, jy, jz - 0.12), (cx + dx, yw, -0.62)], 0.006, M['steel'], rad=0.03)

# 集乳罐 + 奶泵
rx, ry = RECEIVER
cyl('receiver_glass', (rx, ry, -0.45), 0.17, 0.5, M['glass'], bev=0.01)
cyl('receiver_top', (rx, ry, -0.18), 0.19, 0.05, M['steel_polish'], bev=0.01)
cyl('receiver_bot', (rx, ry, -0.73), 0.19, 0.05, M['steel_polish'], bev=0.01)
for k in range(3):
    a = k * 2 * math.pi / 3
    cyl(f'receiver_leg_{k}', (rx + math.cos(a) * 0.17, ry + math.sin(a) * 0.17, -0.84), 0.015, 0.23, M['steel'])
box('milk_pump', rx - 0.25, rx + 0.1, 0.3, 0.6, -D, -D + 0.3, M['steel'], 0.02)
pipe('transfer_line', [(rx, ry, -0.15), (rx, ry, 1.1), (MILK_ROOM_X + 0.6, ry, 1.1), (TANK[0], TANK[1] + TANK[2] / 2 - 0.2, 2.25), ], 0.02, M['steel'], rad=0.2)
pipe('vacuum_line', [(PX0 - 0.3, 0, 2.6), (MILK_ROOM_X, 0, 2.6), (MILK_ROOM_X + 1.5, 0, 2.6), (MILK_ROOM_X + 1.5, 3.8, 2.6), (MILK_ROOM_X + 1.5, 3.8, 1.0)], 0.035, M['white_pvc'])

# ---------------------------------------------------------------- 奶罐间
tx, ty, tl, td, tleg = TANK
tz = tleg + td / 2
cyl('tank_body', (tx, ty, tz), td / 2, tl - td * 0.5, M['tank'], axis='Y', seg=64, bev=0)
for s in (1, -1):
    sphere(f'tank_end_{s}', (tx, ty + s * (tl - td * 0.5) / 2, tz), td / 2, M['tank'], (1, 0.32, 1))
    for u in (-1, 1):
        cyl(f'tank_leg_{s}_{u}', (tx + u * td * 0.32, ty + s * (tl / 2 - 0.55), tleg / 2 + 0.05), 0.035, tleg + 0.1, M['steel'])
        cyl(f'tank_foot_{s}_{u}', (tx + u * td * 0.32, ty + s * (tl / 2 - 0.55), 0.015), 0.07, 0.03, M['steel'])
for yy in (-0.9, 0, 0.9):
    cyl(f'tank_band_{yy}', (tx, ty + yy, tz), td / 2 + 0.006, 0.03, M['steel'], axis='Y', seg=64, bev=0.004)
cyl('manway', (tx, ty + 0.5, tz + td / 2 + 0.02), 0.25, 0.1, M['steel_polish'], bev=0.012)
cyl('manway_lid', (tx, ty + 0.5, tz + td / 2 + 0.085), 0.27, 0.03, M['steel'], bev=0.01)
cyl('agitator_motor', (tx, ty - 0.6, tz + td / 2 + 0.15), 0.1, 0.28, M['white_pvc'])
box('agitator_box', tx - 0.12, tx + 0.12, ty - 0.72, ty - 0.48, tz + td / 2 + 0.3, tz + td / 2 + 0.42, M['white_pvc'], 0.01)
pipe('tank_outlet', [(tx, ty - tl / 2 + 0.3, tleg + 0.1), (tx, ty - tl / 2 - 0.2, tleg + 0.1)], 0.03, M['steel'])
cyl('tank_valve', (tx, ty - tl / 2 - 0.22, tleg + 0.1), 0.05, 0.1, M['steel'], axis='Y')
# 控制箱：支架立在罐端外 0.25 m，灰色机箱 + 深色边框 + 显示屏 + 按键
py0 = ty + tl / 2 + 0.3
for u in (-0.15, 0.15):
    cyl(f'panel_stand_{u}', (tx + u, py0 + 0.06, (tz - 0.25) / 2), 0.015, tz - 0.25, M['steel'])
box('tank_panel', tx - 0.2, tx + 0.2, py0, py0 + 0.12, tz - 0.25, tz + 0.2, M['white_pvc'], 0.012)
box('tank_bezel', tx - 0.15, tx + 0.15, py0 + 0.12, py0 + 0.13, tz - 0.02, tz + 0.15, M['grey_box'], 0.004)
box('tank_display', tx - 0.11, tx + 0.03, py0 + 0.13, py0 + 0.132, tz + 0.04, tz + 0.12, M['lcd'], 0)
for k_ in range(4):
    cyl(f'tank_btn_{k_}', (tx + 0.07 + (k_ % 2) * 0.04, py0 + 0.135, tz + 0.05 + (k_ // 2) * 0.05), 0.012, 0.01, M['red'] if k_ == 0 else M['grey_box'], axis='Y', bev=0.003)
cyl('tank_estop', (tx - 0.1, py0 + 0.13, tz - 0.12), 0.025, 0.02, M['red'], axis='Y', bev=0.006)
tube('panel_cable', [(tx, py0, tz - 0.2), (tx, py0 - 0.15, tz - 0.3), (tx, ty + tl / 2 - 0.1, tz - 0.1)], 0.006, M['rubber'])
# 制冷机组
box('condenser', X1 - 0.75, X1 - 0.12, -5.2, -3.9, 0, 0.8, M['frame'], 0.02)
cyl('condenser_fan', (X1 - 0.75, -4.55, 0.42), 0.26, 0.02, M['galv'], axis='X')
for k in range(5):
    cyl(f'grille_{k}', (X1 - 0.765, -4.55, 0.42), 0.05 + k * 0.05, 0.004, M['steel'], axis='X', seg=48, bev=0)
# 卫生阱（奶和真空之间的不锈钢小罐）+ 真空稳压罐 + 真空泵机组
stx, sty = RECEIVER[0] - 0.05, 0.62
TZ = -0.45
cyl('san_trap', (stx, sty, TZ), 0.13, 0.36, M['steel_polish'], seg=48, bev=0.02)
cyl('san_trap_lid', (stx, sty, TZ + 0.195), 0.14, 0.03, M['steel'], seg=48, bev=0.008)
cyl('san_trap_valve', (stx, sty, TZ - 0.25), 0.03, 0.14, M['steel'])
for k in range(3):
    a = k * 2 * math.pi / 3
    cyl(f'san_leg_{k}', (stx + math.cos(a) * 0.12, sty + math.sin(a) * 0.12, (-D + TZ - 0.18) / 2), 0.012, TZ - 0.18 + D, M['steel'])
pipe('san_to_vac', [(stx, sty, TZ + 0.21), (stx, sty, 2.6), (stx, 0, 2.6)], 0.03, M['white_pvc'])
pipe('rec_to_trap', [(rx + 0.12, ry + 0.1, -0.17), (rx + 0.12, ry + 0.1, -0.05), (stx, sty - 0.1, -0.05), (stx, sty, TZ + 0.2)], 0.025, M['steel'], rad=0.06)
vrx, vry = MILK_ROOM_X + 1.5, 4.6
cyl('vac_receiver', (vrx, vry, 0.85), 0.2, 0.8, M['steel'], seg=48, bev=0.03)
sphere('vac_receiver_top', (vrx, vry, 1.25), 0.2, M['steel'], (1, 1, 0.35))
cyl('vac_gauge', (vrx, vry - 0.2, 1.05), 0.045, 0.02, M['white_pvc'], axis='Y', bev=0.004)
for k in range(3):
    a = k * 2 * math.pi / 3 + 0.5
    cyl(f'vac_leg_{k}', (vrx + math.cos(a) * 0.17, vry + math.sin(a) * 0.17, 0.225), 0.015, 0.45, M['steel'])
pipe('vac_drop', [(MILK_ROOM_X + 1.5, 3.8, 1.0), (vrx, 3.8, 1.35), (vrx, vry, 1.35)], 0.035, M['white_pvc'])
box('vac_pump_base', X1 - 1.9, X1 - 0.6, 4.2, 5.1, 0, 0.12, M['frame'], 0.01)
cyl('vac_motor', (X1 - 1.0, 4.65, 0.4), 0.17, 0.5, M['frame'], axis='X', seg=48, bev=0.02)
for k in range(10):
    cyl(f'vac_fin_{k}', (X1 - 1.2 + k * 0.045, 4.65, 0.4), 0.18, 0.008, M['frame'], axis='X', seg=48, bev=0)
cyl('vac_pump', (X1 - 1.55, 4.65, 0.4), 0.2, 0.3, M['steel'], axis='X', seg=48, bev=0.02)
box('vac_motor_foot', X1 - 1.3, X1 - 0.8, 4.5, 4.8, 0.12, 0.25, M['frame'], 0.01)
pipe('vac_pump_line', [(X1 - 1.55, 4.65, 0.6), (X1 - 1.55, 4.65, 0.9), (vrx + 0.2, vry, 0.9)], 0.03, M['white_pvc'])
# 奶罐间配件：配电柜、冲洗水管、筐
import_gltf('utility_box_01', (X1 - 0.3, 2.5, 0.0), rot=(math.pi / 2, 0, math.pi / 2))
import_gltf('garden_hose_wall_mounted_01', (MILK_ROOM_X + 0.05, 4.5, 1.4), rot=(math.pi / 2, 0, 0))
import_gltf('plastic_crate_01', (tx + 1.3, ty + 0.8, 0.0), rot=(math.pi / 2, 0, 0.3))
box('wash_trough', MILK_ROOM_X + 0.15, MILK_ROOM_X + 0.75, -5.6, -4.2, 0.75, 0.95, M['steel_polish'], 0.01)
for yy in (-5.5, -4.3):
    cyl(f'trough_leg_{yy}', (MILK_ROOM_X + 0.45, yy, 0.37), 0.02, 0.75, M['steel'])

# ---------------------------------------------------------------- 牛舍
WT = 0.2
def wall(name, x0, x1, y0, y1, gaps=()):
    """墙裙混凝土砌块 + 上部压型钢板；gaps: [(a, b, ztop)] 沿墙方向的门洞。"""
    along_x = abs(x1 - x0) > abs(y1 - y0)
    a0, a1 = (x0, x1) if along_x else (y0, y1)
    cuts = sorted(gaps)
    segs, cur = [], a0
    for g0, g1, gz in cuts:
        segs.append((cur, g0, 0)); segs.append((g0, g1, gz)); cur = g1
    segs.append((cur, a1, 0))
    for k, (s0, s1, zb) in enumerate(segs):
        if s1 - s0 < 1e-3:
            continue
        bx = (s0, s1, y0, y1) if along_x else (x0, x1, s0, s1)
        if zb == 0:
            box(f'{name}_blk{k}', *bx, 0, WALL_SOLID, M['block'], 0.01)
            if name == 'wall_n':
                box(f'{name}_clad{k}', *bx, NORTH_OPEN[1], EAVE, M['clad'], 0)
            else:
                box(f'{name}_clad{k}', *bx, WALL_SOLID, EAVE, M['clad'], 0)
        else:
            box(f'{name}_lintel{k}', *bx, zb, EAVE, M['clad'], 0)


wall('wall_s', X0, X1, Y0 - WT, Y0, [])
wall('wall_n', X0, X1, Y1, Y1 + WT, [(3.4, 5.4, 2.6)])
wall('wall_w', X0 - WT, X0, Y0, Y1, [(-PY1 - PLATFORM_W, -PY1 - 0.1, 2.4), (-0.7, 0.7, 2.2), (PY1 + 0.1, PY1 + PLATFORM_W, 2.4)])
wall('wall_e', X1, X1 + WT, Y0, Y1, [])
wall('partition', MILK_ROOM_X - 0.1, MILK_ROOM_X + 0.1, Y0, Y1, [(-0.45, 0.45, 2.1), (1.8, 2.8, 2.1)])
# 檐沟 + 落水管
for s_ in (1, -1):
    gy = s_ * (Y1 + 0.5)
    cyl(f'gutter_{s_}', ((X0 + X1) / 2, gy, EAVE - 0.08), 0.07, X1 - X0 + 0.8, M['galv'], axis='X', seg=24, bev=0.004)
    for gx in (X0 + 0.4, (X0 + X1) / 2, X1 - 0.4):
        wy = s_ * (Y1 + WT + 0.07)
        pipe(f'downpipe_{s_}_{gx:.1f}', [(gx, gy, EAVE - 0.12), (gx, gy, EAVE - 0.35), (gx, wy, EAVE - 0.6), (gx, wy, 0.2), (gx, s_ * (Y1 + WT + 0.25), 0.06)], 0.045, M['galv'], rad=0.12)
        gyd = s_ * (Y1 + WT + 0.38)
        box(f'drain_pit_{s_}_{gx:.1f}', gx - 0.17, gx + 0.17, gyd - 0.17, gyd + 0.17, -0.1, -0.004, M['frame'], 0.005)
        for kb in range(9):
            bx_ = gx - 0.14 + kb * 0.035
            box(f'drain_bar_{s_}_{gx:.1f}_{kb}', bx_, bx_ + 0.012, gyd - 0.15, gyd + 0.15, -0.012, 0.004, M['galv'], 0)
        for bz in (1.0, 2.2, 3.4):
            box(f'dp_clip_{s_}_{gx:.1f}_{bz}', gx - 0.06, gx + 0.06, min(wy, s_ * (Y1 + WT)), max(wy, s_ * (Y1 + WT)), bz, bz + 0.03, M['galv'], 0.002)
# 钢门架（I 型钢简化：翼缘 + 腹板）
for x in range(int(X0), int(X1) + 1, 5):
    for s in (1, -1):
        yy = s * (Y1 - 0.15)
        box(f'col_web_{x}_{s}', x - 0.01, x + 0.01, yy - 0.12, yy + 0.12, 0, EAVE, M['frame'], 0.002)
        for f in (-0.12, 0.12):
            box(f'col_fl_{x}_{s}_{f}', x - 0.08, x + 0.08, yy + f - 0.008, yy + f + 0.008, 0, EAVE, M['frame'], 0.002)
        # 斜梁
        p0 = Vector((x, yy, EAVE)); p1 = Vector((x, 0, RIDGE))
        L = (p1 - p0).length
        rb = box(f'rafter_{x}_{s}', x - 0.08, x + 0.08, -L / 2, L / 2, -0.18, 0.0, M['frame'], 0.003)
        rb.location = (x, yy / 2, (EAVE + RIDGE) / 2)
        rb.rotation_euler = (s * math.atan2(RIDGE - EAVE, Y1 - 0.15), 0, 0)
# 屋面 + 檩条
slope = math.atan2(RIDGE - EAVE, Y1)
L = math.hypot(Y1 + 0.4, RIDGE - EAVE + 0.4 * (RIDGE - EAVE) / Y1)
for s in (1, -1):
    rf = box(f'roof_{s}', X0 - 0.4, X1 + 0.4, -L / 2, L / 2, 0.02, 0.05, M['roof'], 0)
    rf.location = (0.0 + (X0 + X1) / 2, s * (Y1 + 0.4) / 2, (EAVE + RIDGE) / 2 - 0.03)
    rf.rotation_euler = (s * slope, 0, 0)
    for k in range(5):
        f = (k + 0.5) / 5
        y = s * (Y1 * (1 - f)); z = EAVE + (RIDGE - EAVE) * f
        box(f'purlin_{s}_{k}', X0, X1, y - 0.035, y + 0.035, z - 0.2, z - 0.04, M['galv'], 0.002)
# 灯：防水三防灯（白壳 + 乳白罩），沿坑两排
for s in (1, -1):
    for k in range(6):
        x = PX0 + 0.6 + k * 1.95
        y = s * 1.0
        box(f'lamp_body_{s}_{k}', x - 0.65, x + 0.65, y - 0.06, y + 0.06, 3.3, 3.38, M['white_pvc'], 0.01)
        cyl(f'lamp_diff_{s}_{k}', (x, y, 3.3), 0.05, 1.26, M['lamp'], axis='X', bev=0.01)
        cyl(f'lamp_rod_{s}_{k}', (x, y, 3.3 + (EAVE + 0.4 - 3.3) / 2), 0.004, EAVE + 0.4 - 3.3, M['steel'], bev=0)
for k in range(2):
    x = MILK_ROOM_X + 1.2 + k * 2.4
    box(f'mr_lamp_{k}', x - 0.65, x + 0.65, -0.06 - 1.0, 0.06 - 1.0, 3.3, 3.38, M['white_pvc'], 0.01)
    cyl(f'mr_diff_{k}', (x, -1.0, 3.3), 0.05, 1.26, M['lamp'], axis='X', bev=0.01)

# ---------------------------------------------------------------- 室外：场地、草、围栏
box('yard', X0 - 0.2, X1 + 0.2, Y1 + WT, PADDOCK[2] - 0.6, -0.3, -0.005, M['yard'], 0.02)
box('apron_w', X0 - 3.0, X0 - WT, Y0 - 2, Y1 + 2, -0.3, -0.005, M['yard'], 0.02)
# 草地网格 + 草丛实例（几何节点）
gx0, gx1, gy0, gy1 = -40, 40, -30, 60
me = bpy.data.meshes.new('ground')
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=160, y_segments=180, size=1.0)
for v in bm.verts:
    v.co.x = (gx0 + gx1) / 2 + v.co.x * (gx1 - gx0) / 2
    v.co.y = (gy0 + gy1) / 2 + v.co.y * (gy1 - gy0) / 2
    v.co.z = -0.02 + 0.06 * math.sin(v.co.x * 0.21) * math.sin(v.co.y * 0.17)
bm.to_mesh(me); bm.free()
ground = link(bpy.data.objects.new('ground', me))
me.materials.append(M['grass_ground'])
attr = me.attributes.new('grass', 'FLOAT', 'POINT')


def in_rect(x, y, r, pad=0.0):
    return r[0] - pad <= x <= r[1] + pad and r[2] - pad <= y <= r[3] + pad


for i, v in enumerate(me.vertices):
    x, y = v.co.x, v.co.y
    w = 1.0
    if in_rect(x, y, (X0 - 3.0, X1 + 0.2, Y0 - 2.2, PADDOCK[2] - 0.6), 0.2):
        w = 0.0
    if in_rect(x, y, (X0 - 3.0, X1 + 0.2, Y0 - 2.2, PADDOCK[2] - 0.6), 0.1):
        v.co.z = -0.4   # 楼板 / 场地下面
    if in_rect(x, y, (HOLE[0], HOLE[1], PY0, PY1), 0.6):
        v.co.z = -1.6   # 坑下面：地面沉到坑底以下（别处被楼板盖住）
    attr.data[i].value = w

# 草丛原型：每簇 14 片弯叶
tufts = bpy.data.collections.new('tufts')
sc.collection.children.link(tufts)
tufts.hide_render = False
gm, gnt, gb = new_mat('grass_blade')
oi = gnt.nodes.new('ShaderNodeObjectInfo')
ramp = gnt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (0.10, 0.17, 0.035, 1)
ramp.color_ramp.elements[1].color = (0.30, 0.33, 0.1, 1)
e = ramp.color_ramp.elements.new(0.85); e.color = (0.45, 0.4, 0.2, 1)
gnt.links.new(oi.outputs['Random'], ramp.inputs[0])
gnt.links.new(ramp.outputs[0], gb.inputs['Base Color'])
gb.inputs['Roughness'].default_value = 0.55
gb.inputs['Subsurface Weight'].default_value = 0.0
gb.inputs['Transmission Weight'].default_value = 0.15
for tI in range(4):
    me2 = bpy.data.meshes.new(f'tuft{tI}')
    bm = bmesh.new()
    for k in range(14):
        a = random.uniform(0, 2 * math.pi)
        h = random.uniform(0.08, 0.2)
        lean = random.uniform(0.1, 0.6)
        wdt = random.uniform(0.004, 0.007)
        ox, oy = random.uniform(-0.04, 0.04), random.uniform(-0.04, 0.04)
        dx, dy = math.cos(a), math.sin(a)
        prev = None
        for j in range(5):
            f = j / 4
            cx = ox + dx * lean * h * f * f
            cy = oy + dy * lean * h * f * f
            cz = h * f
            ww = wdt * (1 - f * 0.9)
            v1 = bm.verts.new((cx - dy * ww, cy + dx * ww, cz))
            v2 = bm.verts.new((cx + dy * ww, cy - dx * ww, cz))
            if prev:
                bm.faces.new((prev[0], prev[1], v2, v1))
            prev = (v1, v2)
    bm.to_mesh(me2); bm.free()
    for p in me2.polygons:
        p.use_smooth = True
    me2.materials.append(gm)
    o = bpy.data.objects.new(f'tuft{tI}', me2)
    tufts.objects.link(o)
    o.hide_render = True
    o.hide_viewport = True
ng = bpy.data.node_groups.new('grass_scatter', 'GeometryNodeTree')
ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
N = ng.nodes
gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
dist = N.new('GeometryNodeDistributePointsOnFaces')
dist.inputs['Density'].default_value = float(ARGS.get('grass', 90))
na = N.new('GeometryNodeInputNamedAttribute'); na.data_type = 'FLOAT'; na.inputs['Name'].default_value = 'grass'
ci = N.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = tufts
ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
iop = N.new('GeometryNodeInstanceOnPoints'); iop.inputs['Pick Instance'].default_value = True
def rin(node, typ, lo, hi):
    ins = [i for i in node.inputs if i.type == typ and i.name in ('Min', 'Max')]
    ins[0].default_value = lo; ins[1].default_value = hi


rv = N.new('FunctionNodeRandomValue'); rv.data_type = 'FLOAT_VECTOR'
rin(rv, 'VECTOR', (0, 0, 0), (0.15, 0.15, 6.28))
rs = N.new('FunctionNodeRandomValue'); rs.data_type = 'FLOAT'
rin(rs, 'VALUE', 0.6, 1.6)
ri = N.new('FunctionNodeRandomValue'); ri.data_type = 'INT'
rin(ri, 'INT', 0, 3)
join = N.new('GeometryNodeJoinGeometry')
L_ = ng.links
L_.new(gi.outputs[0], dist.inputs['Mesh'])
L_.new(na.outputs['Attribute'], dist.inputs['Selection'])
L_.new(dist.outputs['Points'], iop.inputs['Points'])
L_.new(ci.outputs[0], iop.inputs['Instance'])
L_.new([o for o in ri.outputs if o.type == 'INT'][0], iop.inputs['Instance Index'])
L_.new([o for o in rv.outputs if o.type == 'VECTOR'][0], iop.inputs['Rotation'])
L_.new([o for o in rs.outputs if o.type == 'VALUE'][0], iop.inputs['Scale'])
L_.new(gi.outputs[0], join.inputs[0])
L_.new(iop.outputs[0], join.inputs[0])
L_.new(join.outputs[0], go.inputs[0])
ground.modifiers.new('grass', 'NODES').node_group = ng

# 电围栏
qx0, qx1, qy0, qy1 = PADDOCK


def fence_line(a, b, skip=()):
    ax, ay = a; bx, by = b
    L = math.hypot(bx - ax, by - ay)
    n = max(1, math.ceil(L / POST_STEP - 0.05))
    return [(ax + (bx - ax) * k / n, ay + (by - ay) * k / n) for k in range(n + 1)]


sides = [((qx0, qy0), (GATE[0], qy0)), ((GATE[1], qy0), (qx1, qy0)), ((qx1, qy0), (qx1, qy1)), ((qx1, qy1), (qx0, qy1)), ((qx0, qy1), (qx0, qy0))]
postset = {}
for si, (a, b) in enumerate(sides):
    pts = fence_line(a, b)
    for p in pts:
        postset[(round(p[0], 2), round(p[1], 2))] = p
    for z, kind in ((INSULATOR_Z[1], 'tape'), (INSULATOR_Z[0], 'wire')):
        seg = []
        for p0, p1 in zip(pts, pts[1:]):
            L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            for k in range(8):
                f = k / 8
                sag = 4 * f * (1 - f) * (0.045 if kind == 'tape' else 0.035) * L / POST_STEP
                seg.append((p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, z + 0.02 - sag))
        seg.append((pts[-1][0], pts[-1][1], z + 0.02))
        # 带/线挂在绝缘子外侧（朝场内偏 6 cm）
        cxm, cym = (qx0 + qx1) / 2, (qy0 + qy1) / 2
        seg2 = []
        for (x, y, zz) in seg:
            dx, dy = cxm - x, cym - y
            if abs(b[0] - a[0]) > abs(b[1] - a[1]):
                seg2.append((x, y + math.copysign(0.07, dy), zz))
            else:
                seg2.append((x + math.copysign(0.07, dx), y, zz))
        if kind == 'tape':
            to = tube(f'tape_{si}', seg2, 0, M['tape'], smooth=False, ribbon=0.02)
            for k_, pt in enumerate(to.data.splines[0].points):
                pt.tilt = 0.35 * math.sin(k_ * 0.9 + si)
        else:
            tube(f'wire_{si}', seg2, 0.0022, M['wire'], smooth=False)
for (x, y) in postset.values():
    corner = (x in (qx0, qx1)) and (y in (qy0, qy1))
    gate = abs(abs(x) - GATE[1]) < 0.01 and abs(y - qy0) < 0.01
    r = (0.1 if corner or gate else 0.06) * random.uniform(0.9, 1.15)
    if corner or gate:
        # 撑桩：沿每条相邻边斜撑一根木撑（上端 1.0 m 顶桩，下端 2.2 m 外入地）
        for (dx, dy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            tx_, ty_ = x + dx * 2.2, y + dy * 2.2
            if not (qx0 - 0.01 <= tx_ <= qx1 + 0.01 and qy0 - 0.01 <= ty_ <= qy1 + 0.01):
                continue
            if abs(ty_ - y) > 0 and not (abs(x - qx0) < 0.01 or abs(x - qx1) < 0.01):
                continue
            if abs(tx_ - x) > 0 and not (abs(y - qy0) < 0.01 or abs(y - qy1) < 0.01):
                continue
            if gate and abs(ty_ - y) > 0:
                continue
            if gate and (GATE[0] < tx_ < GATE[1]):
                continue
            pipe(f'brace_{x:.1f}_{y:.1f}_{dx}_{dy}', [(x + dx * r, y + dy * r, 1.0), (tx_, ty_, -0.05)], 0.045, M['wood'])
            cyl(f'brace_block_{x:.1f}_{y:.1f}_{dx}_{dy}', (tx_, ty_, -0.02), 0.09, 0.06, M['wood'], bev=0.01)
    p = cyl(f'post_{x:.1f}_{y:.1f}', (x, y, POST_H / 2 - 0.15), r, POST_H + 0.3, M['wood'], seg=16, bev=0.008)
    p.rotation_euler = (random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), random.uniform(0, 6.28))
    cxm, cym = (qx0 + qx1) / 2, (qy0 + qy1) / 2
    # 绝缘子朝场内
    if abs(y - qy0) < 0.01 or abs(y - qy1) < 0.01:
        ix, iy = x, y + math.copysign(r + 0.02, cym - y)
        ax_ = 'Y'
    else:
        ix, iy = x + math.copysign(r + 0.02, cxm - x), y
        ax_ = 'X'
    for z in INSULATOR_Z:
        cyl(f'ins_{x:.1f}_{y:.1f}_{z}', (ix, iy, z + 0.02), 0.014, 0.05, M['yellow'], axis=ax_, bev=0.004)
        cyl(f'insd_{x:.1f}_{y:.1f}_{z}', (ix, iy, z + 0.02), 0.024, 0.008, M['yellow'], axis=ax_, bev=0.003)
        cyl(f'insc_{x:.1f}_{y:.1f}_{z}', (ix, iy, z + 0.045), 0.009, 0.03, M['yellow'], bev=0.003)
# 闸门：黄色把手 + 带
for z in INSULATOR_Z:
    hx = GATE[1] - 0.25
    box(f'gate_handle_{z}', hx - 0.08, hx + 0.08, qy0 + 0.06, qy0 + 0.1, z - 0.03, z + 0.07, M['yellow'], 0.01)
    tube(f'gate_tape_{z}', [(GATE[0] + 0.07, qy0 + 0.08, z + 0.02), (0, qy0 + 0.08, z - 0.08), (hx - 0.08, qy0 + 0.08, z + 0.01)], 0, M['tape'], ribbon=0.02)
# 控制器（挂北墙外）+ 引出线 + 接地桩
ex, ey, ez = ENERGISER
ey = Y1 + WT
box('energiser', ex - 0.16, ex + 0.16, ey, ey + 0.12, ez - 0.14, ez + 0.14, M['grey_box'], 0.02)
box('energiser_face', ex - 0.12, ex + 0.12, ey + 0.12, ey + 0.123, ez - 0.02, ez + 0.1, M['frame'], 0)
cyl('energiser_led', (ex + 0.08, ey + 0.125, ez + 0.07), 0.006, 0.006, M['display'], axis='Y', bev=0)
cyl('term_fence', (ex - 0.07, ey + 0.08, ez - 0.16), 0.012, 0.04, M['red'])
cyl('term_earth', (ex + 0.07, ey + 0.08, ez - 0.16), 0.012, 0.04, M['green'])
post0 = min(postset.values(), key=lambda p: math.hypot(p[0] - ex, p[1] - qy0) if abs(p[1] - qy0) < 0.01 else 1e9)
tube('leadout', [(ex - 0.07, ey + 0.08, ez - 0.18), (ex - 0.1, ey + 0.1, 0.5), (ex - 0.2, ey + 0.3, 0.05), (post0[0] - 0.8, post0[1] - 0.8, 0.05), (post0[0], post0[1] - 0.12, 0.3), (post0[0] + 0.05, post0[1] + 0.07, INSULATOR_Z[1] + 0.02)], 0.004, M['rubber'])
for k in range(3):
    gxk = ex + 0.6 + k * 1.0
    cyl(f'earth_rod_{k}', (gxk, ey + 0.4, 0.05), 0.009, 0.2, M['galv'])
    cyl(f'earth_clamp_{k}', (gxk, ey + 0.4, 0.1), 0.016, 0.03, M['galv'])
tube('earth_lead', [(ex + 0.07, ey + 0.08, ez - 0.18), (ex + 0.1, ey + 0.1, 0.3), (ex + 0.6, ey + 0.4, 0.12), (ex + 1.6, ey + 0.4, 0.12), (ex + 2.6, ey + 0.4, 0.12)], 0.0035, M['green'])
cyl('fence_sign_post', (post0[0] + 2.4, post0[1], 0.0), 0.0, 0.0, M['wood'], bev=0) if False else None

# ---------------------------------------------------------------- 灯光 / 世界
w = bpy.data.worlds.new('w'); sc.world = w
wn = w.node_tree
env = wn.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(os.path.join(DATA, 'hdri', 'farmland_overcast_2k.hdr'))
bg = wn.nodes['Background']; bg.inputs['Strength'].default_value = 1.0
mp = wn.nodes.new('ShaderNodeMapping'); tcw = wn.nodes.new('ShaderNodeTexCoord')
mp.inputs['Rotation'].default_value = (0, 0, math.radians(120))
wn.links.new(tcw.outputs['Generated'], mp.inputs['Vector']); wn.links.new(mp.outputs[0], env.inputs['Vector'])
wn.links.new(env.outputs[0], bg.inputs['Color'])
# 灯具下方补面光（模拟乳白罩的配光）
for s in (1, -1):
    for k in range(6):
        x = PX0 + 0.6 + k * 1.95
        ld = bpy.data.lights.new(f'al_{s}_{k}', 'AREA'); ld.shape = 'RECTANGLE'; ld.size = 1.2; ld.size_y = 0.1
        ld.energy = 120; ld.color = (1.0, 0.96, 0.9)
        lo = link(bpy.data.objects.new(f'al_{s}_{k}', ld)); lo.location = (x, s * 1.0, 3.24)
for k in range(2):
    ld = bpy.data.lights.new(f'mr_{k}', 'AREA'); ld.shape = 'RECTANGLE'; ld.size = 1.2; ld.size_y = 0.1; ld.energy = 120
    lo = link(bpy.data.objects.new(f'mr_{k}', ld)); lo.location = (MILK_ROOM_X + 1.2 + k * 2.4, -1.0, 3.24)

# ---------------------------------------------------------------- 相机
CAMS = {
    'c1': ((PX0 - 1.0, -0.35, 0.95), (PX1, 0.35, 0.3), 16),
    'c2': ((SX[3] + 0.6, -(PY1 - 0.85), 0.5), (SX[3] + 0.3, -(PY1 - 0.17), 0.26), 40),
    'c3': ((-12.5, 15.5, 1.55), (-2.0, 6.5, 1.3), 24),
    'c4': ((X1 - 0.5, 5.3, 1.7), (TANK[0], TANK[1] - 0.5, 1.0), 20),
}
pos, tgt, lens = CAMS[ARGS['cam']]
cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.sensor_width = 36
cam = link(bpy.data.objects.new('cam', cd)); cam.location = pos
dvec = Vector(tgt) - Vector(pos)
cam.rotation_euler = dvec.to_track_quat('-Z', 'Y').to_euler()
if ARGS['cam'] == 'c2':
    cd.dof.use_dof = True; cd.dof.focus_distance = dvec.length; cd.dof.aperture_fstop = 5.6
sc.camera = cam
if ARGS['cam'] in ('c1', 'c2', 'c4'):
    sc.view_settings.exposure = 0.3
res = int(ARGS['res'])
sc.render.resolution_x = res; sc.render.resolution_y = int(res * 2 / 3)
sc.render.image_settings.file_format = 'PNG'
sc.render.filepath = ARGS['out']
if ARGS['blend']:
    bpy.ops.wm.save_as_mainfile(filepath=ARGS['blend'])
bpy.ops.render.render(write_still=True)
print('WROTE', ARGS['out'])
