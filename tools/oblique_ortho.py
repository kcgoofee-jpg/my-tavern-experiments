#!/usr/bin/env python3
"""正交斜视成图的后处理与自检（D41；docs/tiancheng-maps.md §0.6、§0.8，附录 OBLIQUE-CODE B）。numpy / PIL 在 /usr/bin/python3。层无关，只读成图与 <png>.meta.json。

  /usr/bin/python3 tools/oblique_ortho.py post <成图.png> [--publish map/data/cam/<名>.json] [--report <自检.json>]
      ① 遮挡：按深度画家算法求每岛可见比例 → normal / lift / dot，写回 meta 的 islands 与 markers；
      ② 对位：每岛顶面投影多边形（poly_uv）与成图不透明 alpha 的左 / 右边界偏差（像素，按成图分辨率）；
      ③ 曝光：不透明像素里通道 = 255 的比例；夜图另数每岛的暖色窗灯像素与冷色信标像素；
      ④ --publish：相机文件写到 map/data/cam/；已存在时哈希必须相同（同一层各时段同框），否则报错退出。
  python3 tools/oblique_ortho.py tiles <成图.png> <map/art/前缀>        PNG 瓦片（保留 alpha），切完校验
  python3 tools/oblique_ortho.py sheet <输出.jpg> <成图.png> ...        联系表（透明处垫深灰底，每张缩到 1200 px 宽）
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'blender'))
import project as PJ


def hull(P):
    P = sorted(set(map(tuple, P)))
    if len(P) < 3: return P
    def half(pts):
        h = []
        for p in pts:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0: h.pop()
            h.append(p)
        return h
    lo, up = half(P), half(P[::-1]); return lo[:-1] + up[:-1]


def post(png, publish='', report=''):
    meta = json.load(open(png + '.meta.json', encoding='utf-8')); cam = meta['camera']; I = meta['islands']
    im = np.asarray(Image.open(png).convert('RGBA')); H, W = im.shape[:2]; A = im[..., 3]
    s = max(1, W // 2000); h2, w2 = H // s, W // s
    px = lambda uv, k=1: (uv[0] * W / k, uv[1] * H / k)
    order = sorted(I, key=lambda k: -I[k]['depth']); idmap = np.full((h2, w2), -1, np.int16); full = {}
    for n, k in enumerate(order):                                        # ① 远 → 近画，近的盖远的
        m = Image.new('L', (w2, h2), 0); ImageDraw.Draw(m).polygon([px(q, s) for q in hull(I[k]['poly_uv'] + [I[k]['tip_uv']])], fill=255)
        mm = np.asarray(m) > 0; full[k] = int(mm.sum()); idmap[mm] = n
    occ = dict(hide_ratio=0.4, lift_label=True, dot_when_hidden=True)
    for n, k in enumerate(order):
        r = float((idmap == n).sum()) / max(1, full[k]); I[k]['visible_ratio'] = round(r, 3); I[k]['label'] = PJ.label_rule(r, occ)
        ys, xs = np.nonzero(idmap == n)
        I[k]['visible_top_uv'] = [round(float(xs[ys.argmin()]) * s / W, 4), round(float(ys.min()) * s / H, 4)] if len(ys) else None
    meta['markers'] = {I[k]['marker']: dict(u=I[k]['anchor_uv'][0], v=I[k]['anchor_uv'][1], rule=I[k]['label'], visible_ratio=I[k]['visible_ratio'],
                                           label_uv=(I[k]['visible_top_uv'] if I[k]['label'] == 'lift' else I[k]['anchor_uv'][:2])) for k in I}
    for k, d in meta.get('markers_extra', {}).items():
        u, v = PJ.project_ortho(d['anchor'], cam); meta['markers'][k] = dict(u=round(u, 5), v=round(v, 5), rule='normal', visible_ratio=1.0, label_uv=[round(u, 5), round(v, 5)])
    R = dict(png=os.path.relpath(png, ROOT), size=[W, H], hash=cam['hash'], islands={})
    solid = A > 230; opaque = A > 0
    for k in I:                                                         # ② 对位：顶面多边形的左右端 vs 该岛所在行段里不透明 alpha 的左右端
        P = np.array([px(q) for q in I[k]['poly_uv']]); x0, x1 = P[:, 0].min(), P[:, 0].max(); y0, y1 = P[:, 1].min(), P[:, 1].max()
        yc0, yc1 = int(max(0, y0 + (y1 - y0) * .25)), int(min(H, y1 - (y1 - y0) * .25))
        cx0, cx1 = int(max(0, x0 - 80)), int(min(W, x1 + 80))
        win = solid[yc0:yc1, cx0:cx1]; cols = np.nonzero(win.any(0))[0]
        dev = [round(float(abs(cx0 + cols.min() - x0)), 1), round(float(abs(cx0 + cols.max() + 1 - x1)), 1)] if len(cols) else None
        isl = dict(bbox_px=[round(x0), round(y0), round(x1), round(y1)], lr_dev_px=dev, visible_ratio=I[k]['visible_ratio'], label=I[k]['label'])
        m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon([px(q) for q in hull(I[k]['poly_uv'] + [I[k]['tip_uv']])], fill=255); mk = np.asarray(m) > 0
        rgb = im[..., :3].astype(np.int16)[mk & opaque]; r_, g_, b_ = rgb[:, 0], rgb[:, 1], rgb[:, 2]
        isl['warm_px'] = int(((r_ > 150) & (r_ > g_ * 1.15) & (g_ > b_ * 1.2)).sum())
        isl['cool_px'] = int(((b_ > 170) & (g_ > 140) & (r_ < g_ * .9)).sum())
        R['islands'][k] = isl
    clip = (im[..., :3] == 255).any(-1) & solid                        # 半透明像素是非预乘色，几乎全透明处会饱和但不可见：只数不透明像素
    R['clip_pct'] = round(100.0 * clip.sum() / max(1, solid.sum()), 3); R['opaque_pct'] = round(100.0 * opaque.mean(), 2)
    lum = (im[..., :3].astype(np.float32) / 255 * [.2126, .7152, .0722]).sum(-1)
    R['median_lum_solid'] = round(float(np.median(lum[solid])), 3) if solid.any() else None
    devs = [min(v['lr_dev_px']) for v in R['islands'].values() if v['lr_dev_px']]   # 每岛取较干净的一侧（另一侧常有停靠平台 / 瀑布 / 邻岛伸出）
    R['lr_dev_best_side_px'] = {k: min(v['lr_dev_px']) for k, v in R['islands'].items() if v['lr_dev_px']}
    R['lr_dev_median_px'] = round(float(np.median(devs)), 1) if devs else None
    json.dump(meta, open(png + '.meta.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if publish:
        dst = os.path.join(ROOT, publish) if not os.path.isabs(publish) else publish
        if os.path.exists(dst):
            old = json.load(open(dst, encoding='utf-8'))
            if old.get('hash') != cam['hash']: sys.exit(f'相机文件 {publish} 哈希 {old.get("hash")} ≠ 本图 {cam["hash"]}：同一层各时段必须同框')
        os.makedirs(os.path.dirname(dst), exist_ok=True); json.dump(cam, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        R['published'] = publish
    if report: json.dump(R, open(report, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in R.items() if k != 'islands'}, ensure_ascii=False))
    for k, v in R['islands'].items(): print(' ', k, v)
    return R


def tiles(png, prefix):
    subprocess.check_call([sys.executable, os.path.join(ROOT, 'tools', 'make_dzi.py'), png, prefix, '--format', 'png'])
    subprocess.check_call([sys.executable, os.path.join(ROOT, 'tools', 'make_dzi.py'), '--verify', prefix])


def sheet(out, pngs, w=1200, bg=(46, 50, 58)):
    ims = []
    for p in pngs:
        im = Image.open(p).convert('RGBA'); im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        base = Image.new('RGBA', im.size, (*bg, 255)); base.alpha_composite(im); ims.append(base.convert('RGB'))
    cols = 2; rows = (len(ims) + 1) // 2; ch = max(i.height for i in ims)
    S = Image.new('RGB', (cols * w + 3 * 12, rows * ch + (rows + 1) * 12), (20, 22, 26))
    for i, im in enumerate(ims): S.paste(im, (12 + (i % cols) * (w + 12), 12 + (i // cols) * (ch + 12)))
    S.save(out, quality=88); print('sheet', out, S.size)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    if a[0] == 'post':
        kw = dict(zip(a[2::2], a[3::2])); post(a[1], kw.get('--publish', ''), kw.get('--report', ''))
    elif a[0] == 'tiles': tiles(a[1], a[2])
    elif a[0] == 'sheet': sheet(a[1], a[2:])
    else: sys.exit(__doc__)
