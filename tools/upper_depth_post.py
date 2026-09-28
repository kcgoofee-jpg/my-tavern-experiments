#!/usr/bin/env python3
"""上层纵深系统 P1（合成器，2D）：逐岛大气透视 + 暖→冷色偏 + 去饱和 / 降对比，三张高度层云片（c1 / c2 / c3），云隙里极淡的中层楼顶。
docs/upper-setting.md v2 §2「各通道」：d 越大（越远越低）→ 雾越重、越冷、越灰；云片只盖比自己低的岛。伊甸不动。无岛影。

参数全部来自纵深系统（map/data/upper_depth.json，数学 blender/depth.py）；这里只做像素操作，不写常数。
用法：python3 tools/upper_depth_post.py <贴好模型抠图的整图.png> --outlines <轮廓.json> --out <输出.png> [--islands blender/data/tc_islands.json]
      [--mid-tiles map/art/tc_mid_files]（中层楼顶透出，Q8；不给就跳过）
轮廓 json 由 tiancheng_upper.py 在 TC_DUMP_OUTLINES 下写出（世界坐标，单位 100 m）。
"""
import argparse, glob, json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'blender'))
import depth as DP
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None
W_U, H_U = 30.0, 18.75
TOWER = (8.5, -5.0)


def hexc(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def lowfreq(h, w, rng, cells, blur):
    n = rng.random((max(2, h // cells), max(2, w // cells))).astype(np.float32)
    im = Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(im, np.float32) / 255


def main():
    p = argparse.ArgumentParser()
    p.add_argument('full'); p.add_argument('--islands', default=os.environ.get('TC_ISLANDS') or 'blender/data/tc_islands.json'); p.add_argument('--outlines', required=True); p.add_argument('--out', required=True)
    p.add_argument('--mid-tiles', default='')
    a = p.parse_args()
    im = Image.open(a.full).convert('RGB'); FW, FH = im.size; px = FW / W_U
    D = json.load(open(a.islands, encoding='utf-8')); I = {d['id']: d for d in D['islands']}; CFG = DP.load()
    CH = {iid: DP.island(iid, CFG) for iid in I}; CLOUD = np.array(CFG['channels']['haze'].get('color', [236, 239, 245]), np.float32)
    OL = json.load(open(a.outlines))
    to_px = lambda x, y: ((x / W_U + .5) * FW, (.5 - y / H_U) * FH)
    arr = np.asarray(im, np.float32)

    def mask(iid, feather=.04, grow=1.0):
        m = Image.new('L', (FW, FH), 0); d = I[iid]; cx, cy = d['x'], d['y']
        ImageDraw.Draw(m).polygon([to_px(cx + (x - cx) * grow, cy + (y - cy) * grow) for x, y in OL[iid]], fill=255)
        return np.asarray(m.filter(ImageFilter.GaussianBlur(px * feather)), np.float32)[..., None] / 255

    masks = {iid: mask(iid) for iid in I if iid in OL}
    # ① 逐岛（纵深通道）：去饱和（tint.sat）→ 降对比（tint.gamma）→ 乘色（tint.mul，近暖远冷）→ 混向雾色（haze）
    for iid in I:
        if iid not in masks or iid == 'eden': continue           # 伊甸不动（成图原样；避开已否决的「伊甸光环」）
        c = CH[iid]; hz, t = c['haze'], c['tint']; m = masks[iid]
        col = arr.copy(); lum = col.mean(-1, keepdims=True)
        col = lum + (col - lum) * (1 + t['sat'])
        col = 255 * np.clip(col / 255, 0, 1) ** (1 / t['gamma'])
        col = col * np.array(t['mul'], np.float32)
        col = col * (1 - hz) + CLOUD * hz
        arr = arr * (1 - m) + col * m
    # ② 三张云片：每张只盖海拔低于它的岛（和云海）；越低的岛被叠的云越多。覆盖率 15–30 %，关阴影（2D，本来就没有影）
    rng = np.random.default_rng(1150)
    tower = Image.new('L', (FW, FH), 0); tx, ty = to_px(*TOWER); r = .32 * px
    ImageDraw.Draw(tower).ellipse((tx - r, ty - r, tx + r, ty + r), fill=255)
    tower = np.asarray(tower.filter(ImageFilter.GaussianBlur(px * .05)), np.float32)[..., None] / 255
    layers = sorted(CFG['cloud_sheets'], key=lambda c: c['alt'])         # c3 → c2 → c1（从下往上叠）
    for k, c in enumerate(layers):
        f = .6 * lowfreq(FH, FW, rng, int(px * 1.6), px * .35) + .4 * lowfreq(FH, FW, rng, int(px * .5), px * .12)
        cov = c.get('cover', .2)
        thr = np.quantile(f, 1 - cov)
        al = np.clip((f - thr) / (f.max() - thr + 1e-6) * 1.6, 0, 1) * (.85 - .12 * k)
        al = al[..., None]
        above = np.zeros((FH, FW, 1), np.float32)
        for iid, d in I.items():
            if c['id'] not in CH[iid]['clouds'] and iid in masks: above = np.maximum(above, masks[iid])   # 这张云片不在它上面 → 挖掉
        above = np.maximum(above, tower)                                  # 塔冠（1500 m）在所有云片之上；塔身被云切断
        al = al * (1 - above)
        shade = (CLOUD * (.93 + .07 * f[..., None]))
        arr = arr * (1 - al) + shade * al
    # ③ 中层楼顶透出（Q8）：银冠堡一侧一处云隙里，极淡（8 %）的中层底图
    if a.mid_tiles and os.path.isdir(a.mid_tiles):
        lv = max(int(os.path.basename(x)) for x in glob.glob(os.path.join(a.mid_tiles, '*')) if os.path.basename(x).isdigit())
        while lv > 0:
            ts = sorted(glob.glob(os.path.join(a.mid_tiles, str(lv), '*_0.jpg')))
            if len(ts) * 510 <= FW * 1.2: break
            lv -= 1
        cols = len(glob.glob(os.path.join(a.mid_tiles, str(lv), '*_0.jpg'))); rows = len(glob.glob(os.path.join(a.mid_tiles, str(lv), '0_*.jpg')))
        tile0 = Image.open(os.path.join(a.mid_tiles, str(lv), '0_0.jpg')); T = tile0.width - 1
        mosaic = Image.new('RGB', (cols * T, rows * T))
        for cx_ in range(cols):
            for cy_ in range(rows):
                t = Image.open(os.path.join(a.mid_tiles, str(lv), f'{cx_}_{cy_}.jpg')); ox = 1 if cx_ else 0; oy = 1 if cy_ else 0
                mosaic.paste(t.crop((ox, oy, ox + T, oy + T)), (cx_ * T, cy_ * T))
        mosaic = np.asarray(mosaic.resize((FW, FH), Image.BILINEAR), np.float32)
        sc = I.get('silver_crown')
        if sc:
            gx, gy = to_px(sc['x'] + 1.6, sc['y'] + 1.3); gr = px * 1.1
            g = Image.new('L', (FW, FH), 0); ImageDraw.Draw(g).ellipse((gx - gr, gy - gr * .7, gx + gr, gy + gr * .7), fill=255)
            g = np.asarray(g.filter(ImageFilter.GaussianBlur(px * .45)), np.float32)[..., None] / 255 * .08
            for m in masks.values(): g = g * (1 - m)
            arr = arr * (1 - g) + (mosaic * .6 + CLOUD * .4) * g
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(a.out); print('depth post', a.out)


if __name__ == '__main__':
    main()
