#!/usr/bin/env python3
"""把卡内各岛三维模型的正交俯视抠图（blender/landmarks/map_cutout.py，透明底，+y 朝上）按岛心贴进上层整图。
tiancheng_upper.py 对 tc_islands.json 里带 cutout 的岛只建岛体（岩壁 + 草面），建筑与园林由这里贴上；伊甸另走 tools/eden_into_upper.py。

用法：python3 tools/isles_into_upper.py <map/art/tc_upper[_city]_full.png> <岛 id>=<抠图.png>@<画幅宽 米>[@cx,cy] ... [--out 路径] [--dzi map/art/tc_upper] [--feather 6]
  例：python3 tools/isles_into_upper.py full.png isle10=kelly.png@160 isle30=roth.png@200
  cx,cy：抠图画幅中心相对岛心的偏移（米，+y 北），默认 0,0。
--feather：抠图 alpha 边缘向内羽化的像素（整图像素），让模型自带的草地与岛面过渡。
"""
import argparse, json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W_U, H_U = 30.0, 18.75          # tc_common.W / H（单位 = 100 m）


def main():
    p = argparse.ArgumentParser()
    p.add_argument('full'); p.add_argument('cuts', nargs='+')
    p.add_argument('--out', default=''); p.add_argument('--dzi', default=''); p.add_argument('--feather', type=float, default=6)
    a = p.parse_args()
    full = Image.open(a.full).convert('RGBA'); FW, FH = full.size
    mpp_full = W_U * 100 / FW
    isl = {i['id']: i for i in json.load(open(os.path.join(ROOT, 'blender/data/tc_islands.json')))['islands']}
    for spec in a.cuts:
        iid, rest = spec.split('=', 1); parts = rest.split('@')
        path, width = parts[0], float(parts[1]); ox, oy = (float(v) for v in parts[2].split(',')) if len(parts) > 2 else (0.0, 0.0)
        cut = Image.open(path).convert('RGBA')
        s = width / cut.width / mpp_full
        cut = cut.resize((max(1, round(cut.width * s)), max(1, round(cut.height * s))), Image.LANCZOS)
        if a.feather > 0:                                   # alpha 向内收一圈再模糊：模型自带地面的硬边不露
            al = cut.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(a.feather / 2))
            cut.putalpha(Image.fromarray(np.minimum(np.asarray(al), np.asarray(cut.getchannel('A')))))
        d = isl[iid]
        cx = ((d['x'] + ox / 100) / W_U + .5) * FW; cy = (.5 - (d['y'] + oy / 100) / H_U) * FH
        full.alpha_composite(cut, (round(cx - cut.width / 2), round(cy - cut.height / 2)))
        print('pasted', iid, path, cut.size, 'at', (round(cx), round(cy)))
    dst = a.out or a.full
    full.convert('RGB').save(dst)
    if a.dzi:
        subprocess.check_call([sys.executable, os.path.join(ROOT, 'tools/make_dzi.py'), dst, a.dzi])


if __name__ == '__main__':
    main()
