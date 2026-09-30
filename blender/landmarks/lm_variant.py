"""tools/landmark.py clay / study wrapper: runs blender/landmarks/<id>/build.py as usual, but changes how it renders.
build.py is not edited: the change is applied in a render_pre handler, i.e. to whatever scene the script built.

  --mode clay    geometry only: every mesh gets one neutral matte material, all lights and the world are replaced by a
                 fixed neutral rig (flat grey dome + one sun), standard view transform. Samples come from --samples.
  --mode study   render only a crop of the frame: --region x0,y0,x1,y1 in pixels of the --res frame (the same frame as
                 a draft at that --res). Writes <out>.region.json (W, H, left, top, pad) for tools/region_patch.py.

Usage (repo root, normally through tools/render_queue.sh):
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/lm_variant.py', run_name='__main__')" \
      -- --build blender/landmarks/<id>/build.py --mode clay --cam c1 --res 2000 --samples 16 --out map/art/_x.jpg
"""
import json, os, runpy, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as _common  # noqa: E402  (keeps the render guard's static scan seeing the device helper, like lm_anchors.py)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
A = dict(zip([k.lstrip('-') for k in argv[::2]], argv[1::2]))
MODE = A.get('mode', 'clay')
if MODE not in ('clay', 'study'):
    raise SystemExit('EDEN_ABORT=arg_error lm_variant: --mode must be clay or study')
REGION = [float(v) for v in A['region'].split(',')] if A.get('region') else None
if MODE == 'study' and (not REGION or len(REGION) != 4 or REGION[2] <= REGION[0] or REGION[3] <= REGION[1]):
    raise SystemExit('EDEN_ABORT=arg_error lm_variant: --region x0,y0,x1,y1 (pixels, x1>x0, y1>y0) is required for study')

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

CLAY_GREY = (0.62, 0.61, 0.59)
SUN = dict(az=205.0, el=44.0, energy=3.2)
DONE = {'once': False}


def apply_clay(sc):
    import math
    m = bpy.data.materials.new('clay_override')
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*CLAY_GREY, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.92
    for o in list(sc.objects):
        if o.type == 'LIGHT':
            bpy.data.objects.remove(o, do_unlink=True)
        elif o.type == 'MESH':
            o.data.materials.clear()
            o.data.materials.append(m)
            for mod in o.modifiers:          # procedural displace / texture modifiers would re-introduce look-dev noise
                if mod.type in ('DISPLACE',):
                    mod.show_render = False
    w = bpy.data.worlds.new('clay_world'); w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1.0); bg.inputs['Strength'].default_value = 0.9
    sc.world = w
    ld = bpy.data.lights.new('clay_sun', 'SUN'); ld.energy = SUN['energy']; ld.angle = math.radians(1.5)
    so = bpy.data.objects.new('clay_sun', ld); sc.collection.objects.link(so)
    d = Vector((math.cos(math.radians(SUN['az'])) * math.cos(math.radians(SUN['el'])),
                math.sin(math.radians(SUN['az'])) * math.cos(math.radians(SUN['el'])), math.sin(math.radians(SUN['el']))))
    so.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0.0
    sc.cycles.samples = int(A.get('samples', 16)); sc.cycles.use_denoising = True
    print('CLAY override applied:', sum(1 for o in sc.objects if o.type == 'MESH'), 'meshes')


def apply_study(sc):
    W, H = sc.render.resolution_x, sc.render.resolution_y
    x0, y0, x1, y1 = REGION
    x0, y0, x1, y1 = max(0.0, x0), max(0.0, y0), min(float(W), x1), min(float(H), y1)
    if x1 <= x0 or y1 <= y0:
        raise SystemExit(f'EDEN_ABORT=arg_error lm_variant: region {REGION} is outside the {W}x{H} frame')
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x = x0 / W, x1 / W
    sc.render.border_min_y, sc.render.border_max_y = 1 - y1 / H, 1 - y0 / H      # Blender's border origin is bottom-left
    with open(A['out'] + '.region.json', 'w') as f:
        json.dump({'W': W, 'H': H, 'left': round(x0), 'top': round(y0), 'pad': 0}, f)
    print(f'STUDY region px {x0:.0f},{y0:.0f}-{x1:.0f},{y1:.0f} of {W}x{H}')


@bpy.app.handlers.persistent      # build.py's setup() calls read_factory_settings, which drops every non-persistent handler
def on_render_pre(scene, *_):
    if DONE['once']:
        return
    DONE['once'] = True
    apply_clay(scene)


def patch_study(name):
    """The render border is read when the render starts, before any render_pre handler: set it inside common.render*."""
    orig = getattr(_common, name)

    def wrapped(sc, out, *a, **k):
        if name == 'render':
            res = int(a[0]); aspect = a[1] if len(a) > 1 else k.get('aspect', 1.5)
            sc.render.resolution_x = res; sc.render.resolution_y = int(res / aspect)
        apply_study(sc)
        return orig(sc, out, *a, **k)
    setattr(_common, name, wrapped)


if MODE == 'clay':
    bpy.app.handlers.render_pre.append(on_render_pre)
else:
    patch_study('render'); patch_study('render_cached')
runpy.run_path(A['build'], run_name='__main__')
