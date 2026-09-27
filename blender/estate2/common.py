"""estate2 公共：路径、PBR 材质、网格小工具。只在 Blender 里 import。"""
import math, os, random
import bpy, bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DATA = os.path.join(ROOT, 'blender', 'data', 'estate2')
TEX = os.path.join(DATA, 'tex')


def tex_path(aid, m):
    if aid == 'Leaf001':
        return os.path.join(TEX, aid, f'Leaf001_1K-JPG_{m}.jpg')
    return os.path.join(TEX, aid, f'{aid}_{m}_1k.jpg')


def img(path, colour=True):
    im = bpy.data.images.load(path, check_existing=True)
    if not colour:
        im.colorspace_settings.name = 'Non-Color'
    return im


# ---------------------------------------------------------------- 节点小工具
class NT:
    """给材质节点树省点字。"""

    def __init__(self, mat):
        mat.use_nodes = True
        self.t = mat.node_tree
        self.n = self.t.nodes
        self.l = self.t.links
        for x in list(self.n):
            self.n.remove(x)
        self.out = self.new('ShaderNodeOutputMaterial', (900, 0))

    def new(self, kind, loc=(0, 0), **kw):
        nd = self.n.new(kind)
        nd.location = loc
        for k, v in kw.items():
            if hasattr(nd, k):
                setattr(nd, k, v)
            else:
                nd.inputs[k].default_value = v
        return nd

    def link(self, a, b):
        self.l.new(a, b)

    def math(self, op, a, b=None, loc=(0, 0), clamp=False):
        nd = self.new('ShaderNodeMath', loc, operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                nd.inputs[i].default_value = v
            else:
                self.link(v, nd.inputs[i])
        return nd.outputs[0]

    def mix(self, fac, a, b, blend='MIX', loc=(0, 0)):
        nd = self.new('ShaderNodeMix', loc, data_type='RGBA', blend_type=blend)
        for sock, v in ((nd.inputs[0], fac), (nd.inputs[6], a), (nd.inputs[7], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, tuple):
                sock.default_value = v if len(v) == 4 else (*v, 1)
            else:
                self.link(v, sock)
        return nd.outputs[2]

    def pbr_tex(self, aid, vec, loc=(0, 0), normal_strength=1.0):
        """贴图组：返回 (颜色, 粗糙度, 法线) 输出。vec 为坐标输出。"""
        x, y = loc
        c = self.new('ShaderNodeTexImage', (x, y), image=img(tex_path(aid, 'diff')))
        r = self.new('ShaderNodeTexImage', (x, y - 280), image=img(tex_path(aid, 'rough'), False))
        nm = self.new('ShaderNodeTexImage', (x, y - 560), image=img(tex_path(aid, 'nor_gl'), False))
        for t in (c, r, nm):
            t.projection = 'BOX'
            t.projection_blend = 0.25
            self.link(vec, t.inputs['Vector'])
        nmap = self.new('ShaderNodeNormalMap', (x + 300, y - 560), Strength=normal_strength)
        self.link(nm.outputs['Color'], nmap.inputs['Color'])
        return c.outputs['Color'], r.outputs['Color'], nmap.outputs['Normal']

    def coords(self, kind='Object', scale=1.0, loc=(-1400, 0)):
        tc = self.new('ShaderNodeTexCoord', loc)
        mp = self.new('ShaderNodeMapping', (loc[0] + 200, loc[1]))
        mp.inputs['Scale'].default_value = (scale, scale, scale)
        self.link(tc.outputs[kind], mp.inputs['Vector'])
        return mp.outputs['Vector'], tc

    def bsdf(self, loc=(600, 0), **kw):
        b = self.new('ShaderNodeBsdfPrincipled', loc)
        for k, v in kw.items():
            b.inputs[k].default_value = v
        self.link(b.outputs[0], self.out.inputs['Surface'])
        return b

    def attr(self, name, kind='GEOMETRY', loc=(0, 0)):
        return self.new('ShaderNodeAttribute', loc, attribute_name=name, attribute_type=kind)


def mat_new(name):
    m = bpy.data.materials.get(name)
    if m:
        return m, None
    m = bpy.data.materials.new(name)
    return m, NT(m)


# ---------------------------------------------------------------- 网格工具
def link_obj(name, me, coll=None, mat=None):
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    if mat is not None:
        if isinstance(mat, (list, tuple)):
            for m in mat:
                me.materials.append(m)
        else:
            me.materials.append(mat)
    return ob


def bm_to_obj(bm, name, coll=None, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return link_obj(name, me, coll, mat)


def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def rng(seed):
    return random.Random(seed)


def rot2(x, y, a):
    c, s = math.cos(a), math.sin(a)
    return x * c - y * s, x * s + y * c
