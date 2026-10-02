#!/usr/bin/env python3
"""Luminance profile across a city-tier border (FOG-1 / D39, probe side).

Reads one screenshot and reports what the eye is supposed to read: the mist
outside the drawn area, the image band just inside its border, and the
luminance step across the border itself. A hard rectangle shows up as a large
``grad_max``; a light halo at night shows up as ``mist.*.p99`` sitting far above
``mist.*.mean``; mist with no world terrain under it has a near-zero spread
(``mist.*.sd``).

    python3 tools/fog_lum.py shot.png --rect 0.31,0.22,0.69,0.78

``--rect`` is the city's on-screen rectangle as fractions of the image
(x0, y0, x1, y1); the viewer probe measures it from the OpenSeadragon item
bounds and shoots the map element, so the fractions are of that image.
Prints one JSON object on stdout. Luminance is 0..255 (PIL's L conversion,
ITU-R 601-2 luma). Bands are fractions of the rect's short side, so the
numbers mean the same thing at every zoom level.
"""
import argparse
import json
import math
import sys

from PIL import Image, ImageChops, ImageDraw, ImageStat

# 城外雾的分圈：名称 + (内沿, 外沿)，单位 = 城区矩形短边的比例
BANDS = (
    ('edge', 0.000, 0.030),   # 紧贴边界：还在城区自己的像素里
    ('near', 0.045, 0.120),   # 第一圈薄雾：世界地形还隐约透得出来
    ('mid', 0.180, 0.340),    # 更外：雾已经吃满
)
INNER_BANDS = (('edge', 0.000, 0.030), ('core', 0.060, 0.400))
SCANLINES = 120              # 每条边界上的扫描线数（梯度）


def clamp(box, size):
    w, h = size
    x0, y0, x1, y1 = box
    return (max(0, int(round(x0))), max(0, int(round(y0))),
            min(w, int(round(x1))), min(h, int(round(y1))))


def moments(im, box):
    """(mean, sd, n) of a rectangle, clamped to the image."""
    c = im.crop(clamp(box, im.size))
    if c.size[0] < 1 or c.size[1] < 1:
        return None
    st = ImageStat.Stat(c)
    return st.mean[0], st.stddev[0], c.size[0] * c.size[1]


def ring_moments(im, rect, b0, b1):
    """Mean and spread of the band b0..b1 short-sides *outside* the rect.

    Outer rectangle minus inner rectangle, by area: no pixel of the city itself
    is counted, and the second moment comes out of mean / sd.
    """
    rx0, ry0, rx1, ry1 = rect
    s = min(rx1 - rx0, ry1 - ry0)
    o = moments(im, (rx0 - b1 * s, ry0 - b1 * s, rx1 + b1 * s, ry1 + b1 * s))
    i = moments(im, (rx0 - b0 * s, ry0 - b0 * s, rx1 + b0 * s, ry1 + b0 * s))
    if not o or not i or o[2] <= i[2]:
        return None
    om, osd, on = o
    im_, isd, in_ = i
    n = on - in_
    mean = (om * on - im_ * in_) / n
    o_sq, i_sq = osd ** 2 + om ** 2, isd ** 2 + im_ ** 2
    sq = (o_sq * on - i_sq * in_) / n
    return mean, math.sqrt(max(0.0, sq - mean ** 2)), n


def ring_mask(size, rect, b0, b1):
    """255 inside the band, 0 elsewhere — for p99 / max of the mist."""
    rx0, ry0, rx1, ry1 = rect
    s = min(rx1 - rx0, ry1 - ry0)
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    d.rectangle(clamp((rx0 - b1 * s, ry0 - b1 * s, rx1 + b1 * s, ry1 + b1 * s), size), fill=255)
    d.rectangle(clamp((rx0 - b0 * s, ry0 - b0 * s, rx1 + b0 * s, ry1 + b0 * s), size), fill=0)
    return m


def ring_extrema(im, rect, b0, b1):
    """(p99, max, count) of the mist band: the mask keeps the band, the histogram reads it."""
    masked = ImageChops.multiply(im, ring_mask(im.size, rect, b0, b1))
    hist = masked.histogram()
    total = sum(hist[1:])                       # bin 0 is everything the mask kept out
    if not total:
        return None, None, 0
    mx = next(v for v in range(255, -1, -1) if hist[v])
    p99, acc = mx, 0
    for v in range(255, -1, -1):
        acc += hist[v]
        if acc >= total * .99:
            p99 = v
            break
    return float(p99), float(mx), total


def border_grad(im, rect, band):
    """Per-pixel luminance step when crossing the rect border, per scanline.

    Returns (max over all steps, mean, median of the per-line maxima, line count).
    The median is the honest number for "is the image edge hard": a hard rectangle
    steps on every line, while a marker or a label sitting on the border only
    steps on the few lines that cross it.
    """
    rx0, ry0, rx1, ry1 = rect
    w, h = im.size
    steps, per_line = [], []

    def run(box):
        vals = list(im.crop(box).tobytes())      # 'L' 一行 / 一列 = 原始字节
        if len(vals) < 2:
            return
        d = [abs(b - a) for a, b in zip(vals, vals[1:])]
        steps.extend(d)
        per_line.append(max(d))

    for i in range(SCANLINES):
        t = (i + .5) / SCANLINES
        y = int(ry0 + (ry1 - ry0) * t)
        x = int(rx0 + (rx1 - rx0) * t)
        if 0 <= y < h:
            for a, b in ((rx0 - band, rx0 + band), (rx1 - band, rx1 + band)):
                box = clamp((a, y, b, y + 1), im.size)
                if box[2] - box[0] > 1:
                    run(box)
        if 0 <= x < w:
            for a, b in ((ry0 - band, ry0 + band), (ry1 - band, ry1 + band)):
                box = clamp((x, a, x + 1, b), im.size)
                if box[3] - box[1] > 1:
                    run(box)
    if not steps:
        return None, None, None, 0
    per_line.sort()
    return (round(max(steps), 2), round(sum(steps) / len(steps), 2),
            round(per_line[len(per_line) // 2], 2), len(steps))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--rect', default='', help='x0,y0,x1,y1 as fractions of the image')
    a = ap.parse_args()
    im = Image.open(a.image).convert('L')
    w, h = im.size
    hist = im.histogram()
    lit = sum(hist[1:])
    n = w * h
    out = {'image': a.image, 'size': [w, h], 'mean': round(moments(im, (0, 0, w, h))[0], 2),
           'hi_frac': round(sum(hist[121:]) / n, 4)}   # 亮于 120 的像素占比：夜里一块亮斑就是这个数在涨
    if lit:
        mx = next(v for v in range(255, -1, -1) if hist[v])
        acc, p99 = 0, mx
        for v in range(255, -1, -1):
            acc += hist[v]
            if acc >= lit * .99:
                p99 = v
                break
        out['p99'], out['max'] = p99, mx
    if not a.rect:
        print(json.dumps(out))
        return
    fr = [float(v) for v in a.rect.split(',')]
    rect = (fr[0] * w, fr[1] * h, fr[2] * w, fr[3] * h)
    s = min(rect[2] - rect[0], rect[3] - rect[1])
    out['rect_px'] = [round(v) for v in rect]
    out['inside'] = {}
    for name, a0, a1 in INNER_BANDS:
        m = moments(im, (rect[0] + a0 * s, rect[1] + a0 * s, rect[2] - a0 * s, rect[3] - a0 * s))
        out['inside'][name] = None if not m else {'mean': round(m[0], 2), 'sd': round(m[1], 2), 'px': m[2]}
    out['mist'] = {}
    for name, b0, b1 in BANDS:
        mm = ring_moments(im, rect, b0, b1)
        p99, mx, n = ring_extrema(im, rect, b0, b1)
        out['mist'][name] = None if not mm else {'mean': round(mm[0], 2), 'sd': round(mm[1], 2), 'p99': p99, 'max': mx, 'px': n}
    gmax, gmean, gmed, n = border_grad(im, rect, max(2, int(.05 * s)))
    out['grad_max'], out['grad_mean'], out['grad_p50'], out['grad_n'] = gmax, gmean, gmed, n
    print(json.dumps(out))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:                       # noqa: BLE001 - the probe reads the error and fails its check
        print(json.dumps({'error': str(e).splitlines()[0]}))
        sys.exit(1)
