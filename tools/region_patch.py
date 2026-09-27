#!/usr/bin/env python3
"""把 style_frame.py --region 渲出的局部块合回整图，可选只重切受影响的 DZI 瓦片。

用法：
  1) 局部重渲（与整图同一视图 / 分辨率 / 采样）：
     blender -b -P blender/estate2/style_frame.py -- --view whole --res 4000 --samples 128 \
         --region=x0,y0,z0,x1,y1,z1 --out /tmp/part.png
     （世界坐标包围盒；脚本投到相机上设 render border + crop，旁写 /tmp/part.png.region.json）
  2) 合成：
     python3 tools/region_patch.py <整图> /tmp/part.png [--out 新整图] [--feather 16] \
         [--dzi map/art/xxx [--tile 512 --overlap 1 --format jpg --quality 80]]
整图可以是 jpg / png；尺寸与渲染分辨率一致，或等比例（局部块会按比例缩放）。
--dzi：只重写与改动像素框相交的瓦片（全部层级），金字塔缩放与 tools/make_dzi.py 一致（逐级 LANCZOS）。
"""
import argparse, json, math, os
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None


def feather_mask(w, h, f):
    if f <= 0:
        return Image.new('L', (w, h), 255)
    m = Image.new('L', (w, h), 0)
    m.paste(255, (f, f, max(f + 1, w - f), max(f + 1, h - f)))
    return m.filter(ImageFilter.GaussianBlur(f / 2))


def patch(full, part, box, feather):
    sx, sy = full.width / box['W'], full.height / box['H']
    l, t = round(box['left'] * sx), round(box['top'] * sy)
    w, h = round(part.width * sx), round(part.height * sy)
    if (w, h) != part.size:
        part = part.resize((w, h), Image.LANCZOS)
    f = min(feather, box.get('pad', feather))   # 羽化不超过外扩像素，改动区本身保持原样
    full.paste(part.convert(full.mode), (l, t), feather_mask(w, h, round(f * sx)))
    return (l, t, l + w, t + h)


def dzi_update(img, prefix, rect, tile, overlap, fmt, quality):
    W, H = img.size
    top = math.ceil(math.log2(max(W, H)))
    cur, n = img, 0
    for level in range(top, -1, -1):
        s = 2 ** (top - level)
        w, h = max(1, math.ceil(W / s)), max(1, math.ceil(H / s))
        if (w, h) != cur.size:
            cur = cur.resize((w, h), Image.LANCZOS)
        x0, y0 = rect[0] // s - 2, rect[1] // s - 2
        x1, y1 = -(-rect[2] // s) + 2, -(-rect[3] // s) + 2
        d = os.path.join(prefix + '_files', str(level))
        os.makedirs(d, exist_ok=True)
        for c in range(max(0, x0 // tile), min(math.ceil(w / tile), x1 // tile + 1)):
            for r in range(max(0, y0 // tile), min(math.ceil(h / tile), y1 // tile + 1)):
                b = (max(0, c * tile - overlap), max(0, r * tile - overlap), min(w, (c + 1) * tile + overlap), min(h, (r + 1) * tile + overlap))
                t = cur.crop(b)
                p = os.path.join(d, f'{c}_{r}.{fmt}')
                if fmt == 'jpg':
                    t.convert('RGB').save(p, quality=quality, optimize=True)
                else:
                    t.save(p, optimize=True)
                n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('full')
    ap.add_argument('part')
    ap.add_argument('--out', default='')
    ap.add_argument('--feather', type=int, default=16)
    ap.add_argument('--dzi', default='')
    ap.add_argument('--tile', type=int, default=512)
    ap.add_argument('--overlap', type=int, default=1)
    ap.add_argument('--format', default='jpg')
    ap.add_argument('--quality', type=int, default=80)
    a = ap.parse_args()
    box = json.load(open(a.part + '.region.json'))
    full = Image.open(a.full)
    full = full.convert('RGBA' if full.mode == 'RGBA' else 'RGB')
    rect = patch(full, Image.open(a.part), box, a.feather)
    out = a.out or a.full
    if out.lower().endswith(('.jpg', '.jpeg')):
        full.convert('RGB').save(out, quality=92)
    else:
        full.save(out)
    print(f'合成 {rect} → {out}')
    if a.dzi:
        print(f'重切瓦片 {dzi_update(full, a.dzi, rect, a.tile, a.overlap, a.format, a.quality)} 张')


if __name__ == '__main__':
    main()
