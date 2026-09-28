#!/usr/bin/env python3
"""斜视成图后处理（层无关；docs/design/depth-system.md §8）：读成图旁的 meta.json（相机、每岛锚点与投影多边形），
① 按远近画家算法求每岛可见比例 → 遮挡规则（normal / lift / dot）写回 meta 的 markers；
② 逐岛纵深通道（去饱和 / 对比 / 乘色 / 雾，数值全来自 depth 模块）；伊甸不动；
③ 可选：标注版（名、海拔、档、群落、卡依据；标签位置按遮挡规则）与 375 px 手机裁切（以焦点岛锚点为中心）。
用法：python3 tools/oblique_post.py <beauty.png> --out <final.png> [--annotate a.jpg] [--phone p.jpg] [--depth map/data/upper_depth.json]
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'blender')); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import depth as DP
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


def main():
    p = argparse.ArgumentParser(); p.add_argument('beauty'); p.add_argument('--out', required=True)
    p.add_argument('--annotate', default=''); p.add_argument('--phone', default=''); p.add_argument('--depth', default='map/data/upper_depth.json')
    a = p.parse_args()
    meta = json.load(open(a.beauty + '.meta.json', encoding='utf-8')); CFG = DP.load(a.depth); occ = meta['view'].get('occlusion', {})
    im = Image.open(a.beauty).convert('RGB'); FW, FH = im.size; arr = np.asarray(im, np.float32)
    I = meta['islands']; order = sorted(I, key=lambda k: -I[k]['depth'])             # 远 → 近
    px = lambda uv: (uv[0] * FW, uv[1] * FH)
    full, vis = {}, {}
    idmap = np.full((FH, FW), -1, np.int16)
    for n, k in enumerate(order):
        m = Image.new('L', (FW, FH), 0); ImageDraw.Draw(m).polygon([px(q) for q in hull(I[k]['poly_uv'] + [I[k]['tip_uv']])], fill=255)
        mm = np.asarray(m) > 0; full[k] = int(mm.sum()); idmap[mm] = n
    for n, k in enumerate(order):
        vis[k] = int((idmap == n).sum()); r = vis[k] / max(1, full[k])
        I[k]['visible_ratio'] = round(r, 3); I[k]['label'] = PJ.label_rule(r, occ)
        ys, xs = np.nonzero(idmap == n)
        I[k]['visible_top_uv'] = [round(float(xs[ys.argmin()]) / FW, 4), round(float(ys.min()) / FH, 4)] if len(ys) else None
    # ② 纵深通道：只在该岛可见像素上做（羽化）
    CLOUD = np.array(DP.haze_color(CFG), np.float32)
    for n, k in enumerate(order):
        if k == 'eden' or k not in CFG['islands']: continue
        c = DP.island(k, CFG); t = c['tint']; hz = c['haze']
        m = np.asarray(Image.fromarray(((idmap == n) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), np.float32)[..., None] / 255
        col = arr.copy(); lum = col.mean(-1, keepdims=True)
        col = lum + (col - lum) * (1 + t['sat']); col = 255 * np.clip(col / 255, 0, 1) ** (1 / t['gamma'])
        col = col * np.array(t['mul'], np.float32); col = col * (1 - hz) + CLOUD * hz
        arr = arr * (1 - m) + col * m
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)); out.save(a.out)
    meta['markers'] = {I[k]['marker']: dict(u=I[k]['anchor_uv'][0], v=I[k]['anchor_uv'][1], rule=I[k]['label'], visible_ratio=I[k]['visible_ratio'],
                                           label_uv=(I[k]['visible_top_uv'] if I[k]['label'] == 'lift' else I[k]['anchor_uv'][:2])) for k in I}
    json.dump(meta, open(a.beauty + '.meta.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('oblique post', a.out, {k: (I[k]['visible_ratio'], I[k]['label']) for k in I})
    if a.annotate:
        import upper_annotate as UA
        ov = Image.new('RGBA', out.size, (0, 0, 0, 0)); dr = ImageDraw.Draw(ov); F1, F2 = UA.font(max(14, FW // 110)), UA.font(max(11, FW // 150))
        boxes = []
        for k in sorted(I, key=lambda k: I[k]['depth']):          # 近的先放；后放的与已放的重叠时往下让
            if k not in UA.NOTES: continue
            nm, biome, note = UA.NOTES[k]; c = DP.island(k, CFG); alt = CFG['islands'][k]['alt']
            ax, ay = px(I[k]['anchor_uv']); rule = I[k]['label']
            if rule == 'dot':
                dr.ellipse((ax - 5, ay - 5, ax + 5, ay + 5), fill=(255, 255, 255, 230)); continue
            lx, ly = px(I[k]['visible_top_uv']) if rule == 'lift' and I[k]['visible_top_uv'] else (ax, ay)
            lines = [(nm, F1), (f'{alt} m · {UA.TIER(c["d"])}（d {c["d"]:.2f}）· {biome}' + (' · 被遮挡，标签上移' if rule == 'lift' else ''), F2), (note, F2)]
            w = max(dr.textlength(t, font=f) for t, f in lines) + 16; h = sum(f.size + 5 for _, f in lines) + 10
            bx = min(max(8, lx - w / 2), FW - w - 8); by = max(8, ly - h - 24)
            for _ in range(20):
                if not any(bx < x1 and bx + w > x0 and by < y1 and by + h > y0 for x0, y0, x1, y1 in boxes): break
                by += 12
            boxes.append((bx, by, bx + w, by + h))
            dr.line([(ax, ay), (min(max(ax, bx), bx + w), by + h)], fill=(255, 255, 255, 210), width=2)
            dr.ellipse((ax - 4, ay - 4, ax + 4, ay + 4), fill=(255, 255, 255, 255))
            dr.rounded_rectangle((bx, by, bx + w, by + h), 6, fill=(15, 20, 30, 190)); yy = by + 6
            for t, f in lines: dr.text((bx + 8, yy), t, font=f, fill=(255, 255, 255, 255) if f is F1 else (210, 222, 235, 255)); yy += f.size + 5
        Image.alpha_composite(out.convert('RGBA'), ov).convert('RGB').save(a.annotate, quality=86)
    if a.phone:
        foc = meta['view']['camera'].get('focus') or 'eden'; cx, cy = px(I[foc]['anchor_uv']) if foc in I else (FW / 2, FH / 2)
        w, h = 375, 667; x0 = int(min(max(0, cx - w / 2), FW - w)); y0 = int(min(max(0, cy - h / 2), FH - h))
        out.crop((x0, y0, x0 + w, y0 + h)).save(a.phone, quality=85)


if __name__ == '__main__':
    main()
