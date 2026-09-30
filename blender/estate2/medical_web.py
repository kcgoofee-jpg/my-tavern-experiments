"""B2 医疗中心（medical_b2.py）→ 网页三维室内 glb 的一块（f_B2_med）。

blender -b --factory-startup --python-expr "import runpy,sys;sys.argv=['x','--','--out','/tmp/med.glb'];runpy.run_path('blender/estate2/medical_web.py',run_name='__main__')"
坐标：F1 = 0（和 house_web.py 一样，页面把整块室内抬到 F1 标高）。材质只保留底色，逐面写进顶点色（页面用同一个 Lambert 顶点色材质）；
超过 --budget 三角形就 collapse 减面。之后由 house_web.sh 用 gltf-transform merge 并进 house.glb。
"""
import os, sys
import bpy, bmesh

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from estate2 import medical_b2   # noqa: E402

a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
A = dict(out='/tmp/med.glb', budget='40000')
for k, v in zip(a[::2], a[1::2]):
    A[k.lstrip('-')] = v
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
obs = [o for o in medical_b2.build(f1_z=0.0) if o and o.type in ('MESH', 'CURVE')]
vl = bpy.context.view_layer
bpy.ops.object.select_all(action='DESELECT')
for o in obs:
    o.select_set(True)
vl.objects.active = obs[0]
bpy.ops.object.convert(target='MESH')
obs = [o for o in bpy.context.selected_objects if o.type == 'MESH']


def base_col(m):
    if m and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                c = n.inputs['Base Color'].default_value
                return (c[0], c[1], c[2], 1.0)
    return (0.8, 0.8, 0.8, 1.0)


for o in obs:   # 逐面底色 → 角点顶点色（合并前做，材质槽还在）
    me = o.data
    if me.users > 1:
        o.data = me = me.copy()
    ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER')
    cols = [base_col(s.material) for s in o.material_slots] or [(0.8, 0.8, 0.8, 1)]
    for p in me.polygons:
        c = cols[min(p.material_index, len(cols) - 1)]
        for li in p.loop_indices:
            ca.data[li].color = c
bpy.ops.object.select_all(action='DESELECT')
for o in obs:
    o.select_set(True)
vl.objects.active = obs[0]
bpy.ops.object.join()
J = vl.objects.active; J.name = 'f_B2_med'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
J.data.materials.clear()
n = sum(len(p.vertices) - 2 for p in J.data.polygons)
if n > int(A['budget']):
    d = J.modifiers.new('dec', 'DECIMATE'); d.ratio = int(A['budget']) / n; d.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
J.data.color_attributes.active_color = J.data.color_attributes['col']
m = bpy.data.materials.new('house'); m.use_nodes = True
J.data.materials.append(m)
bpy.ops.export_scene.gltf(filepath=A['out'], export_format='GLB', use_selection=True, export_materials='EXPORT', export_vertex_color='ACTIVE',
                          export_normals=True, export_lights=False, export_cameras=False)
print('[medical_web] wrote', A['out'], n, '→', sum(len(p.vertices) - 2 for p in J.data.polygons))
