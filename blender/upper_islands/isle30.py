"""isle30 罗斯柴尔德庄园 · 悬浮岛 R-02 draft.【卡】伊莎贝拉家族庄园、冬季宴会举办地（视觉样例·请柬）。
Everything else: glass-tower villa kept from v7, + winter banquet hall / ballroom wing (Waddesdon / Banqueting House refs),
private hover-vehicle platform (no airship)."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

def build():
    island(115, 30)
    # main villa (v7 style kept): stone podium + glass tower
    box(-25, 10, 0, 60, 36, 12, 'portland'); box(-25, 10, 12, 52, 30, 10, 'glass')
    box(-38, 18, 22, 18, 18, 18, 'glass'); roof(-38, 18, 40, 20, 20, 5, 'lead', 'x', 10)
    box(-25, 10, 22, 54, 32, .8, 'portland')
    # winter banquet hall / ballroom (per card: 冬季宴会): double-cube hall, tall windows, hipped lead roof
    box(30, 10, 0, 36, 18, 18, 'portland'); roof(30, 10, 18, 36, 18, 6, 'lead', 'x', 9)
    for i in range(6):
        box(15 + i * 6, .9, 4, 2.6, .4, 11, 'glass')
    box(53, 10, 0, 10, 14, 11, 'portland'); roof(53, 10, 11, 10, 14, 3, 'portland', 'y')   # porte-cochere
    for i in range(4):
        cyl(58.5, 4.5 + i * 3.7, 0, .8, 11, 'white', 12)
    box(3, 10, 0, 8, 12, 10, 'glass')  # glazed link
    # winter garden terrace + parterre
    box(0, -40, 0, 70, 24, .4, 'gravel')
    for i in range(4):
        box(-24 + i * 16, -40, .4, 10, 16, 1, 'hedge')
    cyl(0, -40, .4, 3, .8, 'water')
    box(0, -18, 0, 6, 40, .35, 'path')
    ring_trees(95, 38, 30, 1.3, gap=(math.radians(-60), .5))
    pad(60, -95, 14, math.radians(-60), 30); vehicle(62, -97, 0, .5)
if __name__ == '__main__':
    run(build)
