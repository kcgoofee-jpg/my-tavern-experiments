#!/usr/bin/env python3
"""从 DZI 瓦片拼一张指定宽度附近的整图（取不超过 --width 的最高一级）。斜视主地图用它做云隙下的中层城市底（blender/oblique.py，TC_MID_TEX）。
用法：python3 tools/dzi_mosaic.py map/art/tc_mid_files --width 2000 --out /tmp/mid.png"""
import argparse, glob, os
from PIL import Image
p = argparse.ArgumentParser(); p.add_argument("files"); p.add_argument("--width", type=int, default=2000); p.add_argument("--out", required=True); a = p.parse_args()
lv = [int(os.path.basename(x)) for x in glob.glob(os.path.join(a.files, "*")) if os.path.basename(x).isdigit()]
best = None
for L in sorted(lv):
    cols = len(glob.glob(os.path.join(a.files, str(L), "*_0.jpg")))
    t = Image.open(os.path.join(a.files, str(L), "0_0.jpg")); T = t.width - 1
    if cols * T <= a.width * 1.3: best = (L, cols, T)
L, cols, T = best; rows = len(glob.glob(os.path.join(a.files, str(L), "0_*.jpg")))
m = Image.new("RGB", (cols * T, rows * T))
for c in range(cols):
    for r in range(rows):
        t = Image.open(os.path.join(a.files, str(L), f"{c}_{r}.jpg")); ox, oy = (1 if c else 0), (1 if r else 0)
        m.paste(t.crop((ox, oy, ox + T, oy + T)), (c * T, r * T))
bb = Image.eval(m.convert("L"), lambda v: 255 if v > 2 else 0).getbbox(); m = m.crop(bb) if bb else m
m.save(a.out); print("mosaic", L, m.size, a.out)
