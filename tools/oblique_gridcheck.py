#!/usr/bin/env python3
"""中层夜景与昼图的两条量化自检（docs/tiancheng-maps.md §0.8 第 3、4 条）。numpy / PIL 在 /usr/bin/python3。
只读成图与 <png>.meta.json（相机文件 + 排除多边形 + 场景单位）。

第 3 条·全网格亮（夜图）：
    /usr/bin/python3 tools/oblique_gridcheck.py grid <夜图.png> [--cell 250] [--min-lit .02] [--lum .5] [--min-frac .8] [--report out.json]
    按 cell（米）切格：格内亮度 > lum 的像素占比≥ min-lit 算「亮格」。公园、运河（meta 的 exclude 多边形）整格剔除；
    亮度中位数 < --open-lum 的按「空地」再剔除并单独报数（要看的就是除空地外还剩多少暗格）。

第 4 条·昼图比上层暗：
    /usr/bin/python3 tools/oblique_gridcheck.py day <中层昼图.png> --upper <上层昼图.png> [--max-ratio .6] [--band .62]
    中层取画面下方 (1 − band) 一段（35° 斜视里是近处街面峡谷），上层取不透明像素（岛面），比中位亮度。
    顺带报画面下三成里的品红 / 青色像素数（昼图里霓虹仍要可辨）。
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None


def load(png):
    im = np.asarray(Image.open(png).convert('RGBA'), np.float32) / 255
    return im, im[..., 0] * .2126 + im[..., 1] * .7152 + im[..., 2] * .0722


def meta_of(png):
    for p in (png + '.meta.json', os.path.splitext(png)[0] + '.meta.json'):
        if os.path.exists(p): return json.load(open(p, encoding='utf-8'))
    raise SystemExit(f'no meta for {png}')


def xy_to_uv(cam, x, y):
    c = cam['frame']['centre_m']; d = [x - c[0], y - c[1], 0.0]
    ru = sum(d[i] * cam['right'][i] for i in range(3)); uv = sum(d[i] * cam['up'][i] for i in range(3))
    return .5 + ru / cam['frame']['w_m'], .5 - uv / cam['frame']['h_m']


def in_poly(x, y, poly):
    ins = False; j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]; xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi: ins = not ins
        j = i
    return ins


def unproject(cam, u, v, z0):
    """画框归一化坐标 → 视线与 z = z0 平面的交点（米），附录 OBLIQUE-CODE B 的 unproject。"""
    f = cam['frame']; c = f['centre_m']
    q = [c[i] + (u - .5) * f['w_m'] * cam['right'][i] - (v - .5) * f['h_m'] * cam['up'][i] for i in range(3)]
    t = (z0 - q[2]) / cam['fwd'][2]
    return q[0] + t * cam['fwd'][0], q[1] + t * cam['fwd'][1]


def grid(png, cell=250., min_lit=.02, lum_t=.5, min_frac=.8, open_lum=.02, cover=.9, foot=(1500., 937.5), report=''):
    im, lum = load(png); meta = meta_of(png); cam = meta['camera']; sc = meta.get('scene') or {}
    H, W = lum.shape
    mpp = cam['frame']['w_m'] / W                      # 这张图实际的米 / 像素（草图是定稿的 1/n）
    px = max(4, int(round(cell / mpp)))
    rows, cols = len(range(0, H, px)), len(range(0, W, px))
    z0 = float(sc.get('z0_m', 410.0))
    ex = meta.get('exclude') or {}
    polys = [p for p in (ex.get('parks') or []) + (ex.get('water') or []) if len(p) > 2]
    sub = 4                                           # 每格再切 4×4 小块算覆盖率：整格几乎全是公园 / 运河才算剔除
    m = Image.new('1', (cols * sub + 1, rows * sub + 1), 0); d = ImageDraw.Draw(m)
    for poly in polys:
        pts = [(u * W / px * sub, v * H / px * sub) for u, v in (xy_to_uv(cam, x, y) for x, y in poly)]
        if len(pts) > 2: d.polygon(pts, fill=1)
    fine = np.asarray(m)[:rows * sub, :cols * sub].reshape(rows, sub, cols, sub).mean(axis=(1, 3))
    exm = fine >= cover
    if foot:                                           # 中心柱以外的格子不算「网格」（画框角上是片外地面与背景）
        ins = np.zeros((rows, cols), bool)
        for r in range(rows):
            for c in range(cols):
                x, y = unproject(cam, (c * px + px / 2) / W, (r * px + px / 2) / H, z0)
                ins[r, c] = abs(x) <= foot[0] and abs(y) <= foot[1]
        exm |= ~ins
    bright = lum > lum_t
    lit = np.zeros((rows, cols), np.float32); med = np.zeros((rows, cols), np.float32)
    for r in range(rows):
        for c in range(cols):
            sl = (slice(r * px, (r + 1) * px), slice(c * px, (c + 1) * px))
            n = bright[sl].size
            lit[r, c] = bright[sl].sum() / max(1, n); med[r, c] = np.median(lum[sl]) if n else 0.
    open_cells = (med < open_lum) & ~exm
    judge = ~exm & ~open_cells
    n_judge = int(judge.sum()); n_lit = int((judge & (lit >= min_lit)).sum())
    frac = n_lit / max(1, n_judge)
    dark = [(int(c), int(r), round(float(lit[r, c]), 4), round(float(med[r, c]), 4)) for r, c in zip(*np.nonzero(judge & (lit < min_lit)))]
    R = dict(png=os.path.basename(png), size=[W, H], cell_m=cell, cell_px=px, m_per_px=round(mpp, 4), cells=rows * cols,
             excluded_cells=int(exm.sum()), open_cells=int(open_cells.sum()), judged_cells=n_judge, lit_cells=n_lit,
             lit_fraction=round(frac, 4), required=min_frac, median_lum=round(float(np.median(lum)), 4),
             mean_lum=round(float(lum.mean()), 4), exclude_polys=len(polys), dark_cells_total=len(dark),
             dark_cells_sample=dark[:16], passed=bool(frac >= min_frac), z0_m=z0)
    if report: json.dump(R, open(report, 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in R.items() if k != 'dark_cells_sample'}, ensure_ascii=False, indent=1))
    return R


def day(png, upper, max_ratio=.6, band=.62, report=''):
    im, lum = load(png)
    a, lum_u = load(upper); mu = a[..., 3] > .5
    H = lum.shape[0]
    near = lum[int(H * band):, :]
    r = float(np.median(near)) / max(1e-6, float(np.median(lum_u[mu])))
    b3 = im[int(H * .7):, :, :3]
    mag = int(((b3[..., 0] > .25) & (b3[..., 0] > b3[..., 2] * 1.6) & (b3[..., 0] > b3[..., 1] * 1.3)).sum())
    cyn = int(((b3[..., 1] > .22) & (b3[..., 2] > .25) & (b3[..., 1] > b3[..., 0] * 1.4)).sum())
    R = dict(mid=os.path.basename(png), upper=os.path.basename(upper), mid_street_median=round(float(np.median(near)), 4),
             upper_island_median=round(float(np.median(lum_u[mu])), 4), ratio=round(r, 4), max_ratio=max_ratio, band_from=band,
             neon_magenta_px=mag, neon_cyan_px=cyn, passed=bool(r <= max_ratio and mag > 0 and cyn > 0))
    if report: json.dump(R, open(report, 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(R, ensure_ascii=False, indent=1))
    return R


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    mode, png = a[0], a[1]; kw = dict(zip(a[2::2], a[3::2]))
    num = lambda k, d: float(kw.get(k, d))
    if mode == 'grid':
        fp = kw.get('--foot', '1500,937.5')
        grid(png, cell=num('--cell', 250.), min_lit=num('--min-lit', .02), lum_t=num('--lum', .5), min_frac=num('--min-frac', .8),
             open_lum=num('--open-lum', .02), cover=num('--cover', .9),
             foot=tuple(float(x) for x in fp.split(',')) if fp else None, report=kw.get('--report', ''))
    elif mode == 'day': day(png, kw['--upper'], num('--max-ratio', .6), num('--band', .62), kw.get('--report', ''))
    else: sys.exit(__doc__)