#!/usr/bin/env python3
"""上层底图终版的岛屿贴合：tiancheng_upper.py（TC_EDEN_CUT=1，--no-data 1）渲出的整图只有岛体，建筑与园林由各岛抠图贴上，伊甸由 estate2 地图抠图贴上。

用法（仓库根目录；numpy / PIL 在 /usr/bin/python3）：
  python3 tools/upper_base_paste.py <渲染整图.png> <输出整图.png> [--dzi map/art/tc_upper]
抠图在 logs/campaign/<岛>/（git 忽略的本地产物）；宽度 = 渲染岛抠图时的 --cutout 米数，silver_crown / isle4 另乘纵深缩放
（这两座当初就是这样贴的：对旧底图逐像素比对，silver_crown 0.643 误差 0.6、isle4 0.6733 误差 5；其余岛不乘）。
"""
import argparse, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUTS = [('silver_crown', 'silver_crown/cutout.png', 360 * 0.643), ('isle4', 'isle4/cutout.png', 520 * 0.6733),
        ('isle5', 'isle5/cutout.png', 660), ('isle6', 'isle6/cutout2.png', 450), ('isle9', 'isle9/cutout.png', 410),
        ('isle10', 'isle10/cutout4.png', 390), ('isle25', 'isle25/cutout.png', 480), ('isle30', 'isle30/cutout.png', 470)]
EDEN_CUT = 'logs/campaign/eden_r5/final_cut6000.png'


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('full'); ap.add_argument('out'); ap.add_argument('--dzi', default='')
    a = ap.parse_args(); py = sys.executable
    args = [f'{i}={os.path.join(ROOT, "logs/campaign", p)}@{w:.2f}' for i, p, w in CUTS]
    subprocess.check_call([py, os.path.join(ROOT, 'tools/isles_into_upper.py'), a.full, *args, '--out', a.out])
    subprocess.check_call([py, os.path.join(ROOT, 'tools/eden_into_upper.py'), os.path.join(ROOT, EDEN_CUT), a.out, '--no-inpaint'])
    if a.dzi: subprocess.check_call([py, os.path.join(ROOT, 'tools/make_dzi.py'), a.out, a.dzi, '--extent-m', '3000', '1875'])


if __name__ == '__main__':
    main()
