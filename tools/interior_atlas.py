#!/usr/bin/env python3
"""窗内箱体贴图的拼版与自检（INTERIOR-WINDOWS 1）。numpy / PIL 只在 /usr/bin/python3 里有。

  /usr/bin/python3 tools/interior_atlas.py build --faces logs/campaign/interior-windows \
      --out map/estate/model [--night-cell 512] [--day-cell 256] [--low-cell 256] [--quality 90]
  /usr/bin/python3 tools/interior_atlas.py check --faces <同上目录>

拼版 = 一张 6 列 × 6 行的格子图：列按类别顺序（bedroom / corridor / study / salon / service / stairs），
行按 FACES 顺序（远墙 / 近墙 / 右墙 / 左墙 / 顶 / 底），行从图集顶部往下数 —— 与
map/three/interior-look.mjs 的 FACES 与 cellUv() 同一套（tests/interior_faces.test.mjs 对拍）。每格把 Blender
出的非方形面拉成方形：着色器用的 uv 是「占这张箱面的比例」，存成方形和按真实比例存是同一件事。
空处（clip_end 切在箱面上，箱内没有墙的地方 = 门洞外）补成该面不透明像素的平均色。
"""
import argparse, json, os, sys

CATS = ('bedroom', 'corridor', 'study', 'salon', 'service', 'stairs')
FACES = ('far', 'near', 'right', 'left', 'top', 'bottom')
VARIANTS = ('day', 'night')
FALLBACK = (12, 11, 14)


def face_path(faces_dir, variant, cat, face):
    return os.path.join(faces_dir, variant, f'{cat}_{face}.png')


def _alpha(path):
    from PIL import Image
    with Image.open(path) as im:
        return im.convert('RGBA').getchannel('A')


def border_opaque(path):
    """四条边上不透明的比例：像平面正好贴在箱面上时，箱面应当铺满画面，哪条边空了一块就是取景 / 移轴不对。"""
    a = _alpha(path)
    w, h = a.size
    sides = [a.crop((0, 0, w, 1)), a.crop((0, h - 1, w, h)), a.crop((0, 0, 1, h)), a.crop((w - 1, 0, w, h))]
    return min(sum(1 for p in s.getdata() if p > 24) / max(1, s.size[0] * s.size[1]) for s in sides)


def fill_cell(path, size):
    """读一张面图 → 空处补平均色的 PIL RGB 图（size×size）。"""
    from PIL import Image
    with Image.open(path) as im:
        im = im.convert('RGBA')
        px = list(im.getdata())
        opaque = [p[:3] for p in px if p[3] > 24]
        mean = tuple(round(sum(c[i] for c in opaque) / len(opaque)) for i in range(3)) if opaque else FALLBACK
        flat = []
        for p in px:
            flat.extend(p[:3] if p[3] > 24 else mean)
        out = Image.new('RGB', im.size)
        out.putdata([tuple(flat[i:i + 3]) for i in range(0, len(flat), 3)])
        return out.resize((size, size), Image.LANCZOS), len(opaque), len(px), mean


def build(faces_dir, out_dir, night_cell, day_cell, low_cell, quality):
    from PIL import Image
    meta = json.load(open(os.path.join(faces_dir, 'rooms.json'), encoding='utf-8'))
    cats = meta.get('cats') or list(CATS)
    if tuple(cats) != CATS: raise SystemExit(f'rooms.json cats {cats} != {list(CATS)}')
    if meta.get('faces') and tuple(meta['faces']) != FACES:
        raise SystemExit(f"rooms.json faces {meta['faces']} != {list(FACES)}")
    written = {}
    plans = [('night', 'std', night_cell), ('day', 'std', day_cell), ('night', 'low', low_cell)]
    for variant, tier, cell in plans:
        atlas = Image.new('RGB', (cell * len(cats), cell * len(FACES)))
        holes = 0
        for ci, cat in enumerate(cats):                 # 列 = 房间类别（着色器里的 room 一列）
            for ri, face in enumerate(FACES):           # 行 = 箱面，从图集顶部往下 = FACES 顺序
                p = face_path(faces_dir, variant, cat, face)
                if not os.path.exists(p):
                    print(f'[atlas] 缺面图 {p}'); sys.exit(1)
                img, op, total, _mean = fill_cell(p, cell)
                holes += 1 - op / max(1, total)
                atlas.paste(img, (ci * cell, ri * cell))
        name = f'interior_{variant}{"" if tier == "std" else "_low"}.jpg'
        path = os.path.join(out_dir, name)
        os.makedirs(out_dir, exist_ok=True)
        atlas.save(path, 'JPEG', quality=quality, optimize=True)
        written[f'{variant}/{tier}'] = dict(path=path, size=[atlas.width, atlas.height],
                                            cell=cell, holes=round(holes / (len(cats) * len(FACES)), 4),
                                            kb=round(os.path.getsize(path) / 1024, 1))
    for k, v in written.items(): print(f'[atlas] {k}: {v["path"]} {v["size"][0]}x{v["size"][1]} {v["kb"]} KB 空处 {v["holes"]:.1%}')
    return written


def check(faces_dir):
    """自检：每面都有图、空处比例、四条边铺满（取景 / 移轴对不对）、以及夜面里必须有暖色亮像素（灯真的在图里）。
    空处 = 箱面后面没有几何（走廊的尽头是门洞、顶层房间的顶面在楼板之上），拼版时补平均色，所以只拦 3/4 以上。
    暖色按该面平均亮度取阈值（夜面本来就暗，写死 120 会把有灯的暗面判成没灯）。"""
    from PIL import Image
    rows = []
    for variant in VARIANTS:
        for cat in CATS:
            for face in FACES:
                p = face_path(faces_dir, variant, cat, face)
                if not os.path.exists(p):
                    rows.append(dict(variant=variant, cat=cat, face=face, missing=True)); continue
                img, op, total, mean = fill_cell(p, 64)
                small = img.resize((48, 48))
                thr = max(40.0, mean[0] * 0.9)
                warm = sum(1 for q in small.getdata() if q[0] > thr and q[0] > q[2] + 24)
                rows.append(dict(variant=variant, cat=cat, face=face, missing=False,
                                 hole=round(1 - op / max(1, total), 3), mean=list(mean),
                                 border=round(border_opaque(p), 3), warm=round(warm / (48 * 48), 4)))
    bad = [r for r in rows if r.get('missing')]
    nights = [r for r in rows if r['variant'] == 'night']
    loww = [r for r in nights if r['warm'] < 0.05]
    big = [r for r in rows if r['hole'] > 0.75]
    edge = [r for r in rows if r['border'] < 0.9]
    print(json.dumps(dict(total=len(rows), missing=len(bad), night_low_warm=len(loww),
                          over_half_hole=len(big), thin_border=len(edge)), indent=1))
    for r in rows: print('  ', r['variant'], r['cat'], r['face'], 'hole', r.get('hole'), 'border', r.get('border'), 'warm', r.get('warm'))
    for r in bad + loww + big + edge: print('  FAIL', r)
    return 1 if (bad or loww or big or edge) else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=('build', 'check'))
    ap.add_argument('--faces', default='logs/campaign/interior-windows')
    ap.add_argument('--out', default='map/estate/model')
    ap.add_argument('--night-cell', type=int, default=512)
    ap.add_argument('--day-cell', type=int, default=256)
    ap.add_argument('--low-cell', type=int, default=256)
    ap.add_argument('--quality', type=int, default=90)
    a = ap.parse_args()
    if a.cmd == 'check': sys.exit(check(a.faces))
    build(a.faces, a.out, a.night_cell, a.day_cell, a.low_cell, a.quality)


if __name__ == '__main__':
    main()
