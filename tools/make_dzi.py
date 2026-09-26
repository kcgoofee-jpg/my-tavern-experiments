#!/usr/bin/env python3
"""把一张大图切成 Deep Zoom（DZI）瓦片金字塔，供 OpenSeadragon 按需加载。

用法：
  python3 tools/make_dzi.py <源图> <输出前缀> [--tile 256] [--format jpg|png] [--quality 82]
输出：<前缀>.dzi 与 <前缀>_files/<层级>/<列>_<行>.<格式>。依赖 Pillow（pip3 install --user pillow）。
"""
import argparse, math, os, shutil
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--tile', type=int, default=256); ap.add_argument('--overlap', type=int, default=1)
    ap.add_argument('--format', default='jpg', choices=['jpg', 'png']); ap.add_argument('--quality', type=int, default=82)
    a = ap.parse_args()
    img = Image.open(a.src).convert('RGBA' if a.format == 'png' else 'RGB')
    W, H = img.size
    top = math.ceil(math.log2(max(W, H)))
    files = a.out + '_files'
    shutil.rmtree(files, ignore_errors=True)
    n = 0
    for level in range(top, -1, -1):
        s = 2 ** (top - level)
        w, h = max(1, math.ceil(W / s)), max(1, math.ceil(H / s))
        if (w, h) != img.size:   # 带透明通道时用预乘 alpha 缩放，避免透明像素的颜色渗进边缘
            img = img.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA') if img.mode == 'RGBA' else img.resize((w, h), Image.LANCZOS)
        d = os.path.join(files, str(level)); os.makedirs(d)
        T, O = a.tile, a.overlap
        for c in range(math.ceil(w / T)):
            for r in range(math.ceil(h / T)):
                box = (max(0, c * T - O), max(0, r * T - O), min(w, (c + 1) * T + O), min(h, (r + 1) * T + O))
                t = img.crop(box); p = os.path.join(d, f'{c}_{r}.{a.format}')
                if a.format == 'jpg': t.save(p, quality=a.quality, optimize=True, progressive=False)
                else: t.save(p, optimize=True)
                n += 1
    with open(a.out + '.dzi', 'w') as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" '
                f'Format="{a.format}" Overlap="{a.overlap}" TileSize="{a.tile}"><Size Width="{W}" Height="{H}"/></Image>\n')
    print(f'{a.out}.dzi：{W}×{H}，{top + 1} 层，{n} 张瓦片')


if __name__ == '__main__':
    main()
