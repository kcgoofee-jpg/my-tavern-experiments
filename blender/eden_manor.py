# 伊甸庄园 · Blender 出图入口（任务 8）。模型在 blender/estate/，约定见 blender/estate/CONTRACT.md。
#   blender -b -P blender/eden_manor.py -- --view ext|all|F1..F5|B1|island[,…] --res 2000 --samples 32 --out docs/drafts/estate_b1_{view}.png
#           [--crops "x0,y0,x1,y1:名字;…" | --crops-json 文件 | --crop x0,y0,x1,y1] [--out-dir 目录]
#           [--room 316 --closeup] [--preview] [--data-only] [--no-export] [--no-furniture] [--no-assets] [--fast]
#   python3 blender/eden_manor.py -- …（pip 装的 bpy 模块，参数相同）
# 每个剖切 / 外观视图顺带把房间多边形写进 map/data/eden_estate_tiles.json（--no-export 关闭）。
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 天城上层底图（blender/tc_estates.py build_eden）仍以 1:100 调这个函数：暂时转给旧版模型，SHELL 建造者换成新模型后改这一行。
from estate.legacy_manor import build_eden_manor  # noqa: E402,F401

if __name__ == '__main__':
    import estate
    estate.main()
