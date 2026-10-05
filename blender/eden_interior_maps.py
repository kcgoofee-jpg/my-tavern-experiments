# 伊甸庄园 · 窗内箱体贴图出图入口（INTERIOR-WINDOWS 1）。渲染一律经 tools/render_queue.sh 提交：
#   bash tools/render_queue.sh submit draft -- --log logs/campaign/interior-windows/rooms.log --asset estate_interior_maps \
#     --kind draft --res 512 --spp 16 -- -b --factory-startup --python-expr \
#     "import runpy; runpy.run_path('blender/eden_interior_maps.py', run_name='__main__')" \
#     -- --res 512 --samples 16 --variant both --no-assets --allow-unmatched 1 \
#     --out logs/campaign/interior-windows/rooms.json
# 实现在 blender/estate/interior_maps.py（面表与房间表在那儿）；--out 只当 render_truth 的哨兵，图在 --out-dir 下按
# <时段>/<类别>_<面>.png 出，默认目录 logs/campaign/interior-windows/。
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

EDEN_ARGS = ('--out-dir', '--out', '--res', '--samples', '--variant', '--rooms', '--allow-unmatched',
             '--no-assets', '--no-furniture', '--no-export', '--preview', '--fast', '--data-only', '--closeup')
# 设备在这个入口点名一次（提交端 preflight 查的就是它），views.configure 建完场景再配一次
if __name__ == '__main__':
    import bpy, tc_common as tc
    tc.setup_render_device(bpy.context.scene)
    from estate import interior_maps
    interior_maps.main()
