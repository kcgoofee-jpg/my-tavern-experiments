"""Quick A/B massing blockouts for the two opening landmarks (cathedral, PM residence).
blender -b -P blender/landmarks/ab_blockout.py -- <cathA|cathB|pmA|pmB> <out.png>
Neutral architecture only, no text/logos. Comparison sheets: blender/landmarks/ab_sheet.py"""
import bpy, sys, math
from mathutils import Vector

V, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
for _o in list(bpy.data.objects):
    bpy.data.objects.remove(_o)
S = bpy.context.scene
MATS = {}


def mat(n, c, r=.6, m=0., e=None):
    if n in MATS:
        return MATS[n]
    M = bpy.data.materials.new(n); nt = M.node_tree; nt.nodes.clear()
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs[0])
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = r
    b.inputs['Metallic'].default_value = m
    if e:
        b.inputs['Emission Color'].default_value = (*e, 1); b.inputs['Emission Strength'].default_value = 3
    MATS[n] = M
    return M


def box(x, y, z, sx, sy, sz, M):
    bpy.ops.mesh.primitive_cube_add(location=(x, y, z + sz / 2))
    o = bpy.context.object; o.scale = (sx / 2, sy / 2, sz / 2); o.data.materials.append(M)
    return o


def cyl(x, y, z, r, h, M, n=32, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=r, depth=h, location=(x, y, z + h / 2))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r, radius2=r2, depth=h, location=(x, y, z + h / 2))
    o = bpy.context.object; o.data.materials.append(M)
    return o


def disc(x, y, z, r, M, axis):
    o = cyl(0, 0, 0, r, .6, M, 32)
    o.rotation_euler = (0, math.pi / 2, 0) if axis == 'x' else (math.pi / 2, 0, 0)
    o.location = (x, y, z)
    return o


def sph(x, y, z, r, M, sz=1.):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=r, location=(x, y, z))
    o = bpy.context.object; o.scale.z = sz; o.data.materials.append(M); bpy.ops.object.shade_smooth()
    return o


def prism(x, y, z, L, W, h, M, along='x'):
    if along == 'x':
        vs = [(-L/2, -W/2, 0), (L/2, -W/2, 0), (L/2, W/2, 0), (-L/2, W/2, 0), (-L/2, 0, h), (L/2, 0, h)]
        fs = [(3, 2, 1, 0), (0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)]
    else:
        vs = [(-W/2, -L/2, 0), (W/2, -L/2, 0), (W/2, L/2, 0), (-W/2, L/2, 0), (0, -L/2, h), (0, L/2, h)]
        fs = [(3, 2, 1, 0), (0, 1, 4), (2, 3, 5), (1, 2, 5, 4), (3, 0, 4, 5)]
    me = bpy.data.meshes.new('p'); me.from_pydata(vs, [], fs); me.update(); me.validate()
    o = bpy.data.objects.new('prism', me); S.collection.objects.link(o); o.location = (x, y, z)
    o.data.materials.append(M)
    return o


STONE = mat('stone', (.86, .83, .76), .7); LEAD = mat('lead', (.35, .38, .42), .5, .3)
GOLD = mat('gold', (1., .76, .33), .25, 1.); GLASS = mat('glass', (.2, .25, .35), .15)
ROSE = mat('rose', (.9, .6, .3), .3, 0, (1., .7, .35)); GRASS = mat('grass', (.35, .5, .28), .9)
PAVE = mat('pave', (.7, .68, .64), .9); BRICK = mat('brick', (.2, .15, .13), .85)
WHITE = mat('white', (.93, .93, .9), .5); BLACK = mat('black', (.03, .03, .035), .3)
SLATE = mat('slate', (.28, .3, .33), .6); STUCCO = mat('stucco', (.95, .94, .9), .6)
LAMP = mat('lamp', (1, .85, .5), .3, 0, (1., .8, .45))
BATH = mat('bathst', (.66, .55, .4), .8)
BARK = mat('bark', (.3, .22, .15)); LEAF = mat('leaf', (.2, .38, .18), .9)


def tree(x, y, h=3, r=3):
    cyl(x, y, 0, .4, h, BARK, 8); sph(x, y, h + r * .7, r, LEAF)


def cathedral(B):
    box(0, 0, -.5, 240, 240, .5, PAVE)
    H = 26  # latin cross: nave along x (west = -x), transept along y
    box(-8, 0, 0, 92, 24, H, STONE); prism(-8, 0, H, 92, 24, 12, LEAD)
    box(18, 0, 0, 22, 70, H, STONE); prism(18, 0, H, 70, 22, 12, LEAD, 'y')
    box(48, 0, 0, 30, 20, H - 2, STONE); prism(48, 0, H - 2, 30, 20, 11, LEAD)
    cyl(62, 0, 0, 10, H - 2, STONE, 24); cyl(62, 0, H - 2, 10.5, 9, LEAD, 24, 0)
    for s in (-1, 1):  # aisles
        box(-8, s * 17, 0, 92, 10, 14, STONE); box(-8, s * 17, 14, 92.4, 10.4, .8, LEAD)
    for i in range(9):  # flying buttresses + pinnacles
        x = -48 + i * 10
        for s in (-1, 1):
            box(x, s * 24, 0, 2, 3, 20, STONE); cyl(x, s * 24, 20, 1.3, 7, STONE, 4, 0)
            b = box(x, s * 18, 17, 1.2, 12, 1.2, STONE); b.rotation_euler.x = -s * .45
    for s in (-1, 1):  # west front twin towers
        box(-60, s * 14, 0, 16, 14, 58, STONE)
        cyl(-60, s * 14, 58, 8.5, 34, STONE, 8, .3)
        for dx in (-7, 7):
            for dy in (-6, 6):
                cyl(-60 + dx, s * 14 + dy, 58, 1.2, 8, STONE, 4, 0)
    box(-60, 0, 0, 16, 14, 36, STONE); prism(-60, 0, 36, 14, 14, 8, STONE, 'y')
    for dy in (-14, 0, 14):  # portals
        box(-68.2, dy, 0, 1, 8 if dy == 0 else 6, 16 if dy == 0 else 12, BLACK)
    if B:
        disc(-68.4, 0, 26, 5.5, ROSE, 'x')
        for s in (-1, 1):
            disc(18, s * 35.3, 24, 6, ROSE, 'y')
        box(18, 0, H, 20, 20, 16, STONE); cyl(18, 0, H + 16, 12, 60, STONE, 8, .2)
        for dx in (-9, 9):
            for dy in (-9, 9):
                cyl(18 + dx, dy, H + 16, 1.3, 10, STONE, 4, 0)
    else:
        disc(-68.4, 0, 26, 4.5, GLASS, 'x')
        cyl(18, 0, H, 14, 14, STONE, 48)  # drum + peristyle
        for i in range(16):
            a = i * math.tau / 16; cyl(18 + 15 * math.cos(a), 15 * math.sin(a), H, 1, 13, WHITE, 8)
        cyl(18, 0, H + 14, 15.5, 1.5, STONE, 48)
        sph(18, 0, H + 15.5, 14, LEAD, 1.15)
        for i in range(12):  # gilded ribs
            o = sph(18, 0, H + 15.5, 14.2, GOLD, 1.15); o.scale.x = .05; o.rotation_euler.z = i * math.pi / 12
        cyl(18, 0, H + 31, 3.5, 7, GOLD, 16); sph(18, 0, H + 39, 3, GOLD); cyl(18, 0, H + 41, .5, 6, GOLD, 8)
    cx, cy = -20, -48  # cloister court on the south (-y)
    box(cx, cy, -.4, 44, 34, .45, GRASS)
    for (x, y, sx, sy) in [(cx, cy - 19, 54, 6), (cx - 24, cy, 6, 38), (cx + 24, cy, 6, 38)]:
        box(x, y, 0, sx, sy, 7, STONE)
        prism(x, y, 7, max(sx, sy), min(sx, sy), 2.5, LEAD, 'x' if sx > sy else 'y')
    for i in range(10):
        box(cx - 20 + i * 4.4, cy - 15.7, 0, 1, 1, 5, WHITE)
    cyl(cx, cy, 0, 2.5, 1.2, STONE, 16)
    return (-5, -5, 22), (-150, -200, 140), 42


def georgian(x, y, w, d, floors, facing, brick=BRICK, pm=False, door_c=None):
    """one terrace house; facing = (fx, fy) unit vector of the street front"""
    fh = 3.6; H = floors * fh
    fx, fy = facing
    sx, sy = (w, d) if fy else (d, w)
    box(x, y, 0, sx, sy, H, brick)
    box(x, y, H, sx + .4, sy + .4, .5, WHITE)  # cornice
    box(x, y, H + .5, sx, sy, .9, brick)       # parapet
    box(x, y, H + .5, sx - 1.5, sy - 1.5, 2.6, SLATE)  # attic
    for s in (-1, 1):  # chimney stacks at party walls
        box(x + (s * w / 2 if fy else 0), y + (0 if fy else s * w / 2), H, 1.6 if fy else 3, 3 if fy else 1.6, 4.8, brick)
    ox, oy = x + fx * d / 2, y + fy * d / 2
    n = 3
    for f in range(floors):
        for i in range(n):
            t = -w / 2 + (i + .5) * w / n
            if f == 0 and i == 1:
                continue
            wx, wy = (x + t, oy) if fy else (ox, y + t)
            hh = 2.6 if f == 1 else 2.1
            box(wx, wy, f * fh + 1, 1.5 if fy else .3, .3 if fy else 1.5, hh, WHITE)
            box(wx + fx * .1, wy + fy * .1, f * fh + 1.15, 1.1 if fy else .3, .3 if fy else 1.1, hh - .3, GLASS)
    dx, dy = (x, oy) if fy else (ox, y)
    dm = BLACK if pm else door_c
    box(dx + fx * .1, dy + fy * .1, 0, 1.5 if fy else .3, .3 if fy else 1.5, 2.8, dm)
    o = disc(dx + fx * .2, dy + fy * .2, 3.0, .8, WHITE, 'y' if fy else 'x'); o.scale.z = .5  # fanlight
    box(dx + fx * .25, dy + fy * .25, 3.6, 2.4 if fy else .5, .5 if fy else 2.4, .3, WHITE)
    box(dx + fx * 1.2, dy + fy * 1.2, 0, 2.4 if fy else 2, 2 if fy else 2.4, .45, PAVE)  # step
    if pm:  # lantern over the door
        box(dx + fx * .9, dy + fy * .9, 3.9, .1, .1, .8, BLACK)
        box(dx + fx * .9, dy + fy * .9, 3.2, .55, .55, .75, LAMP)
    L = w - 3; rx, ry = ox + fx * 1.8, oy + fy * 1.8  # railings
    for side in (-1, 1):
        seg = (L - 2.6) / 2; c = side * (1.3 + seg / 2)
        box(rx + (c if fy else 0), ry + (0 if fy else c), 1.0, seg if fy else .08, .08 if fy else seg, .08, BLACK)
        for i in range(int(seg / .5)):
            t = c - seg / 2 + i * .5
            box(rx + (t if fy else 0), ry + (0 if fy else t), 0, .05, .05, 1.1, BLACK)
    return H


DOORS = [mat('d%d' % i, c, .4) for i, c in enumerate([(.55, .1, .1), (.1, .25, .45), (.12, .35, .2), (.75, .55, .12)])]


def pmA():
    box(0, 0, -.5, 160, 160, .5, PAVE)
    box(0, 13, -.45, 110, 11, .45, mat('road', (.32, .32, .33), .9))
    for i, xx in enumerate((-14, 0, 14)):  # terrace, street to +y, garden to -y
        georgian(xx, 0, 13 if xx else 14, 12, 3, (0, 1), pm=(xx == 0), door_c=DOORS[i])
    box(0, -12, 0, 42, 12, 11, BRICK); box(0, -12, 11, 42.4, 12.4, .5, WHITE)  # rear block
    box(0, -21, 0, 38, 6, .8, STUCCO); box(0, -21, 7.8, 38, 6, 1.4, STUCCO)   # stucco colonnade
    for i in range(11):
        cyl(-18 + i * 3.6, -23.4, .8, .45, 7, STUCCO, 16)
    box(0, -42, -.4, 56, 34, .45, GRASS)
    for p in [(-18, -45), (-10, -54), (19, -50), (12, -36)]:
        tree(*p)
    for x in (-40, -34):  # street gate + sentry box
        box(x, 13, 0, .8, .8, 3.6, BLACK)
    for i in range(10):
        box(-39.4 + i * .6, 13, 0, .07, .07, 3, BLACK)
    box(-37, 13, 3, 5.6, .1, .1, BLACK)
    box(-44, 17, 0, 2, 2, 3, WHITE); prism(-44, 17, 3, 2.2, 2.2, 1, SLATE)
    return (-2, -4, 6), (-70, 95, 70), 42


def pmB():
    box(0, 0, -.5, 180, 180, .5, PAVE)
    box(0, 0, -.45, 44, 28, .45, GRASS)
    for p in [(-14, -8), (-14, 8), (14, -8), (14, 8), (0, 0)]:
        tree(p[0], p[1], 3, 3.5)
    for (x, y, sx, sy) in [(0, 14, 44, .08), (0, -14, 44, .08), (22, 0, .08, 28), (-22, 0, .08, 28)]:
        box(x, y, 1, sx, sy, .08, BLACK)
    k = 0
    for i in range(-2, 3):
        georgian(i * 10, 26, 10, 11, 3, (0, -1), brick=BRICK if i == 0 else BATH, pm=(i == 0), door_c=DOORS[k % 4]); k += 1
        georgian(i * 10, -26, 10, 11, 3, (0, 1), brick=BATH, door_c=DOORS[k % 4]); k += 1
    for i in range(-1, 2):
        georgian(36, i * 10, 10, 11, 3, (-1, 0), brick=BATH, door_c=DOORS[k % 4]); k += 1
        georgian(-36, i * 10, 10, 11, 3, (1, 0), brick=BATH, door_c=DOORS[k % 4]); k += 1
    prism(0, 20.3, 11.3, 10, 1, 2.2, WHITE)  # pediment marks the PM house
    return (0, 4, 4), (-60, -120, 105), 40


target, camp, lens = {'cathA': lambda: cathedral(False), 'cathB': lambda: cathedral(True),
                      'pmA': pmA, 'pmB': pmB}[V]()
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); S.collection.objects.link(cam); S.camera = cam
cam.location = Vector(camp)
cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = lens; cam.data.clip_end = 2000
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); S.collection.objects.link(sun)
sun.data.energy = 4; sun.data.angle = .03
sun.rotation_euler = (math.radians(48), 0, math.radians(200 if V == 'pmA' else -40))
W = bpy.data.worlds.new('w'); S.world = W; wn = W.node_tree; wn.nodes.clear()
bg = wn.nodes.new('ShaderNodeBackground'); wn.links.new(bg.outputs[0], wn.nodes.new('ShaderNodeOutputWorld').inputs[0])
bg.inputs[0].default_value = (.55, .68, .85, 1); bg.inputs[1].default_value = .9
S.render.engine = 'CYCLES'; S.cycles.samples = 32; S.cycles.use_denoising = True
try:
    p = bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type = 'METAL'; p.get_devices()
    for dv in p.devices:
        dv.use = True
    S.cycles.device = 'GPU'
except Exception as e:
    print('cpu fallback', e)
S.render.resolution_x = 1400; S.render.resolution_y = 1000
S.view_settings.view_transform = 'AgX'
S.render.filepath = OUT
bpy.ops.render.render(write_still=True)
