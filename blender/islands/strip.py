"""8 座岛岛底灰模对比条：各岛文件的 underside(ctx) 原样调用，统一灰泥材质、最大半径归一到 100 m，正交侧视，证明剪影各不相同。
  blender -b --factory-startup --python blender/islands/strip.py -- --res 2400 --samples 32 --out /tmp/strip.png
"""
import importlib.util, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import _kit as K_
from _kit import C, A

ORDER = ['isle10', 'isle6', 'isle30', 'isle25', 'isle9', 'isle4', 'isle5', 'silver_crown']


def load(iid):
    sp = importlib.util.spec_from_file_location('isl_' + iid, os.path.join(os.path.dirname(os.path.abspath(__file__)), iid + '.py'))
    m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m


def main():
    sc = C.setup(A['samples']); gap = 280.0; N = len(ORDER)
    clay = bpy.data.materials.new('clay'); clay.use_nodes = True
    bs = clay.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (.55, .55, .55, 1); bs.inputs['Roughness'].default_value = .8
    for k, iid in enumerate(ORDER):
        ox = (k - (N - 1) / 2) * gap; mod = load(iid); ctx = K_.Ctx(iid, norm=100.0, clay=clay, ox=ox, seed=k + 1, shape_fn=getattr(mod, 'SHAPE_FN', None))
        P = ctx.S.pts(144); B = ctx.B('cap')
        B.poly([(ox, 0, 0)] + [(x + ox, y, 0) for x, y in P], [(0, i + 1, (i + 1) % len(P) + 1) for i in range(len(P))], clay)
        mod.underside(ctx)
    C.Batch.build_all()
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (.8, .82, .85, 1); bg.inputs[1].default_value = .45
    ld = bpy.data.lights.new('key', 'SUN'); ld.energy = 3.0; so = bpy.data.objects.new('key', ld); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), 0, math.radians(-30))
    cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = N * gap * 1.01; cd.clip_end = 8000
    co = bpy.data.objects.new('cam', cd); sc.collection.objects.link(co); sc.camera = co
    pitch = math.radians(8); co.location = (0, -3000 * math.cos(pitch), -70 + 3000 * math.sin(pitch)); co.rotation_euler = (math.radians(90) - pitch, 0, 0)
    sc.view_settings.view_transform = 'Standard'
    C.render(sc, A['out'], A['res'], N * gap / 300.0)


if __name__ == '__main__':
    import traceback
    try: main()
    except Exception: traceback.print_exc(); raise
