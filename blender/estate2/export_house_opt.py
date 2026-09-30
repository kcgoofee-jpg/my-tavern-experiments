"""Final 庄园主楼 GLB 优化：把现有 map/estate/model/house.glb 走 blender/export_optimized.py
（合并材质 → LOD0/LOD1 → Draco/KTX2），产出轻量优化资产 house_opt_*。

本脚本不渲染（不触发渲染守卫的 GPU 规则，直接 `blender -b -P` 起即可）：
  blender -b -P blender/estate2/export_house_opt.py -- \
      --out map/estate/model --name house_opt --lod1 0.45 --draco --ktx2 --max-mb 8

注意：house.glb 的视觉全在顶点色里（无贴图），所以这里 monkeypatch export_glb 加上
export_vertex_color='ALL'，避免重导出丢色。Draco/KTX2 由 export_optimized 串 gltf-transform 完成。
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))   # blender/estate2 → 仓库根
sys.path.insert(0, REPO)
sys.path.insert(0, os.path.join(REPO, 'blender'))
import bpy
try:
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
except Exception:
    pass
import export_optimized as EO


def _export_glb_vc(path, objects=None):
    """保留顶点色的 GLB 导出（覆盖 export_optimized 默认，避免 house 丢色）。"""
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=bool(objects),
                              export_vertex_color='ACTIVE')
    return os.path.getsize(path) if os.path.exists(path) else 0


def main():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = EO.parse_args(a)
    src = os.path.abspath(args.src) if args.src else os.path.join(REPO, 'map', 'estate', 'model', 'house.glb')
    if not args.src:
        bpy.ops.import_scene.gltf(filepath=src)
    EO.export_glb = _export_glb_vc          # 保色
    args.out = os.path.abspath(args.out)
    manifest = EO.build(args)
    print('house_opt done:', manifest.get('outputs'))
    return manifest


if __name__ == '__main__':
    main()
