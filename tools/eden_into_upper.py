#!/usr/bin/env python3
"""把伊甸 r4 的地图俯视抠图（blender/estate2/map_cutout.py，0.375 m/px，透明底）贴进上层整图的伊甸岛位置。

用法：python3 tools/eden_into_upper.py <抠图.png> <map/art/tc_upper[_city]_full.png> [--dzi map/art/tc_upper[_city]]
步骤：① 旧伊甸岛（map/data/tc_upper.json 的 eden 轮廓，外扩 --grow 像素，含岛缘云边）用周围像素的归一化模糊补掉；
      ② 抠图按岛心对齐（tc_islands.json 的 eden x / y，1 单位 = 100 m，与上层同一 0.375 m/px）做 alpha 合成；
      ③ 可选整张重切 DZI（tools/make_dzi.py）。
"""
import argparse, json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W_U, H_U = 30.0, 18.75          # tc_common.W / H（单位 = 100 m）


def _blur(a, r):
    """float 高斯模糊（PIL 的 F 模式不支持 GaussianBlur，用可分离卷积）。"""
    k = np.exp(-.5 * (np.arange(-3 * r, 3 * r + 1) / r) ** 2); k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, 3 * r, mode='edge'), k, 'valid'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v, 3 * r, mode='edge'), k, 'valid'), 1, a)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('cut'); p.add_argument('full')
    p.add_argument('--out', default='')
    p.add_argument('--dzi', default='')
    p.add_argument('--grow', type=int, default=240)
    p.add_argument('--fill', default='', help='upper_city 用：tiancheng_upper.py --below city --city-only 1 --crop x0,y0,x1,y1 渲出的纯城市块，用它补旧岛（不用模糊）')
    p.add_argument('--fill-box', default='', help='--fill 的归一化 crop 框 x0,y0,x1,y1（与渲染时 --crop 相同）')
    a = p.parse_args()
    full = Image.open(a.full).convert('RGB'); FW, FH = full.size
    isl = next(i for i in json.load(open(os.environ.get('TC_ISLANDS') or os.path.join(ROOT, 'blender/data/tc_islands.json')))['islands'] if i['id'] == 'eden')
    ed = next(i for i in json.load(open(os.path.join(ROOT, 'map/data/tc_upper.json')))['islands'] if i['id'] == 'eden')
    # ① 旧岛掩膜 → 归一化模糊补洞（在 1/8 尺度上算，再放大）
    m = Image.new('L', (FW, FH), 0)
    ImageDraw.Draw(m).polygon([(x * FW, y * FH) for x, y in ed['outline']], fill=255)
    m = m.filter(ImageFilter.MaxFilter(1)).filter(ImageFilter.GaussianBlur(a.grow / 2)).point(lambda v: 255 if v > 8 else 0)
    bb = m.getbbox(); pad = 400
    box = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(FW, bb[2] + pad), min(FH, bb[3] + pad))
    reg = np.asarray(full.crop(box), np.float32); mk = np.asarray(m.crop(box), np.float32) / 255
    s = 8; sw, sh = reg.shape[1] // s, reg.shape[0] // s
    small = np.asarray(Image.fromarray(reg.astype(np.uint8)).resize((sw, sh), Image.BOX), np.float32)
    keep = 1 - np.asarray(Image.fromarray((mk * 255).astype(np.uint8)).resize((sw, sh), Image.BOX), np.float32) / 255
    keep = (keep > .999).astype(np.float32)
    keep = np.asarray(Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)), np.float32) / 255   # 离洞边再退 2 格，避开残留的岛缘白边
    num = np.zeros_like(small); den = np.zeros_like(keep)
    for c in range(3):
        num[..., c] = _blur(small[..., c] * keep, 40)
    den = _blur(keep, 40)
    num = np.where(keep[..., None] > .5, small, num / np.maximum(den[..., None], 1e-4))
    big = np.asarray(Image.fromarray(np.clip(num, 0, 255).astype(np.uint8)).resize((reg.shape[1], reg.shape[0]), Image.BICUBIC), np.float32)
    soft = np.asarray(Image.fromarray((mk * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(40)), np.float32)[..., None] / 255
    reg = reg * (1 - soft) + big * soft
    full.paste(Image.fromarray(reg.astype(np.uint8)), box[:2])
    if a.fill:                                             # 纯城市块：旧岛掩膜再外扩 160 px（盖住上一步的模糊带），但不碰其他岛
        x0, y0, x1, y1 = [float(v) for v in a.fill_box.split(',')]
        fl = Image.open(a.fill).convert('RGB'); L_, T_ = round(x0 * FW), round(y0 * FH)
        fm = m.filter(ImageFilter.GaussianBlur(80)).point(lambda v: 255 if v > 4 else 0).filter(ImageFilter.GaussianBlur(20))
        other = Image.new('L', (FW, FH), 0); dr = ImageDraw.Draw(other)
        for i in json.load(open(os.path.join(ROOT, 'map/data/tc_upper.json')))['islands']:
            if i['id'] != 'eden': dr.polygon([(x * FW, y * FH) for x, y in i['outline']], fill=255)
        other = other.filter(ImageFilter.MaxFilter(1)).filter(ImageFilter.GaussianBlur(30)).point(lambda v: 255 if v > 8 else 0)
        fm = Image.fromarray((np.asarray(fm, np.float32) * (1 - np.asarray(other, np.float32) / 255)).astype(np.uint8))
        full.paste(fl, (L_, T_), fm.crop((L_, T_, L_ + fl.width, T_ + fl.height)))
    # ② 抠图按岛心贴上（抠图画幅 = 750 m 宽，与整图同一 m/px 时不缩放）
    cut = Image.open(a.cut).convert('RGBA')
    mpp_full = W_U * 100 / FW; mpp_cut = 750.0 / cut.width
    if abs(mpp_cut / mpp_full - 1) > 1e-3:
        cut = cut.resize((round(cut.width * mpp_cut / mpp_full), round(cut.height * mpp_cut / mpp_full)), Image.LANCZOS)
    cx, cy = (isl['x'] / W_U + .5) * FW, (.5 - isl['y'] / H_U) * FH
    out = full.convert('RGBA'); out.alpha_composite(cut, (round(cx - cut.width / 2), round(cy - cut.height / 2)))
    dst = a.out or a.full
    out.convert('RGB').save(dst)
    print('patched', dst, 'old-eden box', box, 'cut at', (round(cx), round(cy)))
    if a.dzi:
        subprocess.check_call([sys.executable, os.path.join(ROOT, 'tools/make_dzi.py'), dst, a.dzi])


if __name__ == '__main__':
    main()
