"""Shared helpers for upper-tier island DRAFT blockouts (upper_islands r1).
Neutral architecture only, no text/logos/figures. Each <id>.py defines build(K) and calls run().
Run one:  blender -b --python-expr "import runpy;runpy.run_path('blender/upper_islands/isle30.py',run_name='__main__')" -- out.jpg
Run all:  blender -b --python-expr "import runpy;runpy.run_path('blender/upper_islands/render_all.py')" -- docs/drafts
Draft settings: 1200x800, 32 spp Cycles, 3/4 aerial. Units = metres (island ~ 140-220 m across)."""
import bpy, math, sys, random
from mathutils import Vector

MATS = {}
R = [100]


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    MATS.clear()
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)


def mat(n, c, r=.6, m=0., e=None, es=3., tr=0.):
    if n in MATS:
        return MATS[n]
    M = bpy.data.materials.new(n); M.use_nodes = True; nt = M.node_tree; nt.nodes.clear()
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs[0])
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = r
    b.inputs['Metallic'].default_value = m
    if tr:
        b.inputs['Transmission Weight'].default_value = tr
    if e:
        b.inputs['Emission Color'].default_value = (*e, 1); b.inputs['Emission Strength'].default_value = es
    MATS[n] = M
    return M


class K:
    """palette"""
    @staticmethod
    def m(name):
        P = {
            'grass': ((.16, .26, .09), .9), 'lawn': ((.22, .34, .11), .85), 'hedge': ((.07, .15, .05), .95),
            'tree': ((.06, .13, .05), .95), 'rock': ((.28, .25, .22), .95), 'soil': ((.20, .16, .12), .95),
            'path': ((.62, .58, .50), .8), 'gravel': ((.55, .52, .46), .9), 'water': ((.10, .20, .25), .08),
            'lime': ((.78, .74, .64), .7), 'stucco': ((.86, .84, .78), .6), 'brick': ((.20, .09, .06), .85),
            'redbrick': ((.42, .16, .10), .85), 'slate': ((.13, .14, .16), .7), 'lead': ((.30, .32, .33), .5),
            'copper': ((.23, .42, .36), .5), 'glass': ((.10, .13, .16), .05), 'steel': ((.35, .36, .38), .35),
            'pad': ((.40, .41, .43), .6), 'white': ((.90, .90, .88), .5), 'iron': ((.03, .03, .03), .5),
            'granite': ((.45, .44, .42), .75), 'sand': ((.70, .62, .48), .8), 'portland': ((.80, .77, .68), .7),
        }
        c, r = P[name]
        if name == 'glass':
            return mat(name, c, r, .6)
        if name == 'water':
            return mat(name, c, r, .2)
        return mat(name, c, r, .8 if name in ('steel', 'lead', 'copper') else 0.)


def _put(o, M):
    o.data.materials.append(M if not isinstance(M, str) else K.m(M))
    return o


def box(x, y, z, sx, sy, sz, M, rz=0.):
    bpy.ops.mesh.primitive_cube_add(location=(x, y, z + sz / 2), rotation=(0, 0, rz))
    o = bpy.context.object; o.scale = (sx / 2, sy / 2, sz / 2)
    return _put(o, M)


def cyl(x, y, z, r, h, M, n=32, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=r, depth=h, location=(x, y, z + h / 2))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r, radius2=r2, depth=h, location=(x, y, z + h / 2))
    return _put(bpy.context.object, M)


def dome(x, y, z, r, M, sz=1.):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r, location=(x, y, z))
    o = bpy.context.object; o.scale.z = sz; bpy.ops.object.shade_smooth()
    return _put(o, M)


def roof(x, y, z, L, W, h, M, along='x', hip=0.):
    """gable (hip=0) or hipped roof (hip = inset of ridge ends)"""
    if along == 'y':
        L, W = W, L
    a = L / 2 - hip
    vs = [(-L/2, -W/2, 0), (L/2, -W/2, 0), (L/2, W/2, 0), (-L/2, W/2, 0), (-a, 0, h), (a, 0, h)]
    fs = [(3, 2, 1, 0), (0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)]
    me = bpy.data.meshes.new('roof'); me.from_pydata(vs, [], fs); me.update()
    o = bpy.data.objects.new('roof', me); bpy.context.collection.objects.link(o)
    o.location = (x, y, z)
    if along == 'y':
        o.rotation_euler.z = math.pi / 2
    return _put(o, M)


def island(r=90, seed=1, rim='rock', top='grass', depth=70):
    """floating island: flattened top disc + tapered rocky underside (cone) with noise"""
    rnd = random.Random(seed); R[0] = r
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=r, depth=4, location=(0, 0, -2))
    _put(bpy.context.object, top)
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=r * .15, radius2=r * 1.01, depth=depth,
                                    location=(0, 0, -4 - depth / 2))
    o = bpy.context.object; _put(o, rim)
    me = o.data
    for v in me.vertices:
        if v.co.z < depth / 2 - 1:
            k = 1 + rnd.uniform(-.12, .12)
            v.co.x *= k; v.co.y *= k; v.co.z += rnd.uniform(-4, 4)
    return o


def tree(x, y, s=1., M='tree'):
    cyl(x, y, 0, .5 * s, 3 * s, 'soil', 6)
    dome(x, y, 5 * s, 3.2 * s, M, 1.1)


def trees(pts, s=1.):
    for p in pts:
        tree(p[0], p[1], p[2] if len(p) > 2 else s)


def ring_trees(r, n, seed=2, s=1., gap=None):
    rnd = random.Random(seed)
    for i in range(n):
        a = i / n * math.tau + rnd.uniform(-.05, .05)
        if gap and abs(((a - gap[0] + math.pi) % math.tau) - math.pi) < gap[1]:
            continue
        rr = r + rnd.uniform(-3, 3)
        tree(rr * math.cos(a), rr * math.sin(a), s * rnd.uniform(.8, 1.2))


def pad(x, y, r=12, rz=0., arm=20):
    """private hover-vehicle platform (card: 访客停靠平台) cantilevered off the island edge; neutral, no markings"""
    cyl(x, y, 0, r, .5, 'granite', 48)
    cyl(x, y, .5, r * .55, .05, 'path', 48)  # inset ring only, no text
    box(x - arm / 2 * math.cos(rz), y - arm / 2 * math.sin(rz), 0, arm, 5, .4, 'path', rz)
    for a in range(0, 360, 30):
        t = math.radians(a)
        cyl(x + r * math.cos(t), y + r * math.sin(t), .5, .12, 1.1, 'steel', 6)


def vehicle(x, y, z, rz=0.):
    z += .5
    """generic private hover vehicle, a sealed lozenge (no rotors, no wings)"""
    o = dome(x, y, z + 1.1, 1, 'slate', .5)
    o.scale = (3.2, 1.4, .55); o.rotation_euler.z = rz
    g = dome(x, y, z + 1.6, 1, 'glass', .4); g.scale = (1.6, 1.0, .5); g.rotation_euler.z = rz


def scene(cam_dist=None, cam_h=None, az=-35, target=(0, 0, 10), lens=50, res=(1200, 800), spp=32):
    cam_dist = cam_dist or R[0] * 2.9; cam_h = cam_h or R[0] * 1.35
    S = bpy.context.scene
    S.render.engine = 'CYCLES'
    try:
        bpy.context.preferences.addons['cycles'].preferences.compute_device_type = 'METAL'
        S.cycles.device = 'GPU'
    except Exception:
        pass
    S.cycles.samples = spp; S.cycles.use_denoising = True
    S.render.resolution_x, S.render.resolution_y = res; S.render.resolution_percentage = 100
    S.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in S.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    S.render.image_settings.file_format = 'JPEG'; S.render.image_settings.quality = 88
    S.view_settings.exposure = -1.0
    W = bpy.data.worlds.new('w'); S.world = W; W.use_nodes = True; nt = W.node_tree; nt.nodes.clear()
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs[0].default_value = (.45, .62, .9, 1); bg.inputs[1].default_value = .8
    nt.links.new(bg.outputs[0], nt.nodes.new('ShaderNodeOutputWorld').inputs[0])
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(52), 0, math.radians(210)))
    bpy.context.object.data.energy = 4.2; bpy.context.object.data.angle = math.radians(1.5)
    # cloud-sea floor far below (no island shadow reading: sun shadows land 300 m down, soft)
    bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 0, -320))
    _put(bpy.context.object, mat('cloud', (.82, .84, .88), .9))
    bpy.context.object.visible_shadow = False
    a = math.radians(az)
    bpy.ops.object.camera_add(location=(target[0] + cam_dist * math.cos(a), target[1] + cam_dist * math.sin(a), cam_h))
    c = bpy.context.object; c.data.lens = lens; S.camera = c
    d = Vector(target) - c.location; c.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def run(build, out=None, **cam):
    if out is None:
        a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
        out = a[0] if a else '/tmp/upper_isle_draft.jpg'
    reset(); build(); scene(**cam)
    bpy.context.scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('WROTE', out)
