#!/usr/bin/env python3
"""上层底图终版的岛屿贴合：tiancheng_upper.py（TC_EDEN_CUT=1，--no-data 1）渲出的整图只有岛体，建筑与园林由各岛抠图贴上，伊甸由 estate2 地图抠图贴上。

用法（仓库根目录；numpy / PIL 在 /usr/bin/python3）：
  python3 tools/upper_base_paste.py <渲染整图.png> <输出整图.png> [--dzi map/art/tc_upper] [--tod-ref <白天的岛体渲染.png>]
--tod-ref：时段版（dawn / dusk / night）用。抠图是白天的光照，贴进别的时段会太亮 / 太黄：按每座岛「本时段岛体渲染 ÷ 白天岛体渲染」在抠图
范围内的逐通道平均比，给该岛抠图乘一个增益（伊甸用各岛增益的平均）。长影、反射不会变，只是色调与亮度跟上。
抠图在 logs/campaign/<岛>/（git 忽略的本地产物）；宽度 = 渲染岛抠图时的 --cutout 米数，silver_crown / isle4 另乘纵深缩放
（这两座当初就是这样贴的：对旧底图逐像素比对，silver_crown 0.643 误差 0.6、isle4 0.6733 误差 5；其余岛不乘）。
"""
import argparse, json, os, subprocess, sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUTS = [('silver_crown', 'silver_crown/cutout.png', 360 * 0.643), ('isle4', 'isle4/cutout.png', 520 * 0.6733),
        ('isle5', 'isle5/cutout_v4.png', 660), ('isle6', 'isle6/cutout2.png', 450), ('isle9', 'isle9/cutout.png', 410),
        ('isle10', 'isle10/cutout4.png', 390), ('isle25', 'isle25/cutout.png', 480), ('isle30', 'isle30/cutout.png', 470)]
EDEN_CUT = 'logs/campaign/eden_r5/final_cut6000.png'


def tint(img, g):
    a = np.asarray(img, np.float32).copy(); a[..., :3] = np.clip(a[..., :3] * g, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def gain_of(cut_path, width_m, iid, tod_img, day_img, isl):
    """该岛抠图覆盖处：本时段岛体渲染 ÷ 白天岛体渲染 的逐通道平均比。"""
    cut = Image.open(cut_path).convert('RGBA'); FW, FH = tod_img.size
    s = width_m / cut.width / (30.0 * 100 / FW); cut = cut.resize((round(cut.width * s), round(cut.height * s)), Image.BOX)
    d = isl[iid]; x0 = round(((d['x'] / 30.0) + .5) * FW - cut.width / 2); y0 = round((.5 - d['y'] / 18.75) * FH - cut.height / 2)
    m = np.asarray(cut.getchannel('A')) > 240; box = (x0, y0, x0 + cut.width, y0 + cut.height)
    t, y = (np.asarray(im.crop(box), np.float32)[m].mean(0) for im in (tod_img, day_img))
    return np.clip(t / np.maximum(y, 1.0), .05, 4.0)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('full'); ap.add_argument('out'); ap.add_argument('--dzi', default='')
    ap.add_argument('--tod-ref', default='')
    a = ap.parse_args(); py = sys.executable
    cuts, eden = [(i, os.path.join(ROOT, 'logs/campaign', p), w) for i, p, w in CUTS], os.path.join(ROOT, EDEN_CUT)
    if a.tod_ref:
        tmp = a.out + '.tint'; os.makedirs(tmp, exist_ok=True)
        isl = {i['id']: i for i in json.load(open(os.path.join(ROOT, 'blender/data/tc_islands.json')))['islands']}
        tod_img, day_img = Image.open(a.full).convert('RGB'), Image.open(a.tod_ref).convert('RGB'); gs, tinted = [], []
        for i, p, w in cuts:
            g = gain_of(p, w, i, tod_img, day_img, isl); gs.append(g); print('gain', i, np.round(g, 3))
            t = os.path.join(tmp, i + '.png'); tint(Image.open(p).convert('RGBA'), g).save(t); tinted.append((i, t, w))
        cuts = tinted; g = np.mean(gs, 0); print('gain eden (mean)', np.round(g, 3))
        eden = os.path.join(tmp, 'eden.png'); tint(Image.open(eden_src := os.path.join(ROOT, EDEN_CUT)).convert('RGBA'), g).save(eden)
    args = [f'{i}={p}@{w:.2f}' for i, p, w in cuts]
    subprocess.check_call([py, os.path.join(ROOT, 'tools/isles_into_upper.py'), a.full, *args, '--out', a.out])
    subprocess.check_call([py, os.path.join(ROOT, 'tools/eden_into_upper.py'), eden, a.out, '--no-inpaint'])
    if a.dzi: subprocess.check_call([py, os.path.join(ROOT, 'tools/make_dzi.py'), a.out, a.dzi, '--extent-m', '3000', '1875'])


if __name__ == '__main__':
    main()
