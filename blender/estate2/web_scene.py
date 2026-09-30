"""estate2 r4 场景 → 网页三维（map/estate/）用的 .blend + 对象清单。

blender -b -P blender/estate2/web_scene.py -- --save /path/scene.blend [--dump /path/objects.json]
和 style_frame.py --view map 同一套构建（地形 1.0 m、湖、白底、建筑、Sketchfab 别墅、植被），光照用上层地图的太阳（高 50°、方位 125°）。
奶牛农场要先把 props/dairy_parlour/build.py 存成 .blend，环境变量 E2_DAIRY_BLEND 指向它（见 RESUME.md r4d）。
下一步：export_web.py 读这个 .blend 烘焙 + 导出 glb。
"""
import argparse, json, os, sys, time
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from estate2 import terrain, buildings, vegetation, sketchfab   # noqa: E402
import style_frame as SF   # noqa: E402


def main():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser(); p.add_argument('--save', required=True); p.add_argument('--dump', default=''); p.add_argument('--density', type=float, default=1.0)
    a = p.parse_args(a)
    t0 = time.time()
    SF.reset()
    sc = bpy.context.scene
    SF.gpu(sc, 32)
    SF.world(sc, 'map')
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0.0
    terrain.build_island(res_m=1.0)
    terrain.build_lake()
    terrain.build_white_floor()
    buildings.build_all()
    from estate2 import waterworks
    from estate2.common import coll
    waterworks.build(coll('waterworks'))   # r5 湖溢流瀑布 + 清水倒锥（体积水雾烘焙时不导出）
    M = buildings.mats()
    tropic = sketchfab.build(M['plain'], M['wallstone'])
    vegetation.build(a.density, tropic_protos=tropic)
    SF.camera(sc, 'map', 2000)
    bpy.ops.wm.save_as_mainfile(filepath=a.save)
    if a.dump:
        out = []
        dg = bpy.context.evaluated_depsgraph_get()
        for o in bpy.data.objects:
            if o.type not in ('MESH', 'CURVE', 'EMPTY'):
                continue
            cols = [c.name for c in o.users_collection]
            rec = dict(name=o.name, type=o.type, cols=cols, parent=o.parent.name if o.parent else None, hide=o.hide_render,
                       mods=[m.type for m in o.modifiers])
            if o.type == 'MESH':
                bb = [o.matrix_world @ __import__('mathutils').Vector(c) for c in o.bound_box]
                rec['lo'] = [round(min(v[i] for v in bb), 2) for i in range(3)]
                rec['hi'] = [round(max(v[i] for v in bb), 2) for i in range(3)]
                rec['tris'] = sum(len(pp.vertices) - 2 for pp in o.data.polygons)
                rec['mats'] = [s.material.name for s in o.material_slots if s.material]
            out.append(rec)
        with open(a.dump, 'w') as f:
            json.dump(out, f, ensure_ascii=False, indent=0)
    print(f'[web_scene] saved {a.save} {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
