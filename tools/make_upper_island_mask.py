#!/usr/bin/env python3
"""Islands-only alpha mask for the upper-tier composite (FOG-1 / D40).

Cuts the islands out of the current top-down upper-tier base images: renders the
island outlines from the pack's island table (map/data/tc_upper.json, normalized
frame coordinates) into a white-on-transparent PNG that the viewer uses as a
destination-in mask (map/app/tier-fog.mjs). The interim for the top-down images
until the oblique islands-alpha renders land (SETTING-1 / D41); re-run after the
island table changes:

    python3 tools/make_upper_island_mask.py

The polygons are shrunk toward their centroid before the soft edge so the cut
does not carry cloud-sea pixels from the base image rim.
"""
import json
import math
import pathlib
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'map/data/tc_upper.json'
OUT = ROOT / 'map/data/tc_upper_islands_mask.png'
W = 1200
SHRINK = 0.985          # pull each outline toward its centroid (drop the sea rim)
FEATHER = max(2, round(W * 0.004))   # soft edge, ~0.4 % of the frame width


def shrink(poly):
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    return [(cx + (x - cx) * SHRINK, cy + (y - cy) * SHRINK) for x, y in poly]


def main():
    data = json.loads(SRC.read_text(encoding='utf-8'))
    islands = [i for i in data['islands'] if i.get('outline')]
    if not islands:
        raise SystemExit('no island outlines in ' + str(SRC))
    aspect = data['extent_m'][1] / data['extent_m'][0]
    h = round(W * aspect)
    img = Image.new('L', (W * 2, h * 2), 0)   # 2x supersample for a smooth edge
    d = ImageDraw.Draw(img)
    for i in islands:
        pts = [(x * W * 2, y * h * 2) for x, y in shrink(i['outline'])]
        d.polygon(pts, fill=255)
    img = img.resize((W, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(FEATHER / 2))
    out = Image.new('RGBA', (W, h), (255, 255, 255, 0))
    out.putalpha(img)
    out.save(OUT, optimize=True)
    print(f'{OUT.relative_to(ROOT)} {W}x{h} islands={len(islands)} feather={FEATHER}px')


if __name__ == '__main__':
    main()
