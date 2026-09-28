#!/usr/bin/env python3
"""上层 v9：按岛的高度层（tc_islands 的 tier）给俯视整图加霾与云盖——低层离相机远，罩一层云色 + 零碎云絮；中层薄霾；高层不动。
用法：TC_ISLANDS=blender/data/tc_islands_v9A.json python3 tools/upper_haze.py <整图.png> --out <输出>
不画岛影（用户未批准）；只把岛往云色里压。
"""
import argparse, json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W_U, H_U = 30.0, 18.75
HAZE = {'low': .42, 'mid': .14}
CLOUD = np.array([236, 239, 245], np.float32)


def main():
    p = argparse.ArgumentParser(); p.add_argument('full'); p.add_argument('--out', required=True); a = p.parse_args()
    im = Image.open(a.full).convert('RGB'); FW, FH = im.size; px = FW / W_U
    I = json.load(open(os.environ.get('TC_ISLANDS') or os.path.join(ROOT, 'blender/data/tc_islands.json')))['islands']
    arr = np.asarray(im, np.float32)
    rng = np.random.default_rng(7)
    for t, amt in HAZE.items():
        m = Image.new('L', (FW, FH), 0); dr = ImageDraw.Draw(m)
        for d in I:
            if d.get('tier') != t or d['id'] in ('eden', 'silver_crown'): continue
            cx, cy = (d['x'] / W_U + .5) * FW, (.5 - d['y'] / H_U) * FH; r = max(d['rx'], d['ry']) * 1.3 * px
            dr.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
        m = np.asarray(m.filter(ImageFilter.GaussianBlur(px * .25)), np.float32)[..., None] / 255
        if t == 'low':                                    # 云絮：低频噪声，让一部分岛面被云盖住
            n = rng.random((FH // 16 + 1, FW // 16 + 1)).astype(np.float32)
            n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((FW, FH), Image.BICUBIC).filter(ImageFilter.GaussianBlur(px * .12)), np.float32)[..., None] / 255
            k = amt + .35 * np.clip((n - .5) * 2.5, 0, 1)
        else:
            k = amt
        arr = arr * (1 - m * k) + CLOUD * (m * k)
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(a.out); print('haze', a.out)


if __name__ == '__main__':
    main()
