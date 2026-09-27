"""isle30 罗斯柴尔德庄园 · 悬浮岛 R-02 draft.【卡】伊莎贝拉家族庄园、冬季宴会举办地（视觉样例·请柬）。
Everything else 仓库推断: glass-tower villa kept from v7, + winter banquet hall / ballroom wing (Waddesdon / Banqueting House refs),
private hover-vehicle platform (no airship)."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

def build():
    island(115, 30)
    # main villa (v7 style kept, 仓库推断): stone podium + glass tower
    box(-25, 10, 0, 60, 36, 12, 'portland'); box(-25, 10, 12, 52, 30, 10, 'glass')
    box(-38, 18, 22, 18, 18, 34, 'glass'); box(-38, 18, 56, 20, 20, 1.2, 'portland')
    box(-25, 10, 22, 54, 32, .8, 'portland')
    # winter banquet hall / ballroom (仓库推断 per card: 冬季宴会): double-cube hall, tall windows, hipped lead roof
    box(30, 10, 0, 50, 26, 16, 'portland'); roof(30, 10, 16, 50, 26, 7, 'lead', 'x', 10)
    for i in range(8):
        box(8 + i * 6.3, -3.1, 3, 3, .4, 10, 'glass')
    box(30, -8, 0, 22, 10, 11, 'portland'); roof(30, -8, 11, 22, 10, 3, 'portland')   # porte-cochere
    for i in range(4):
        cyl(22 + i * 5.3, -13, 0, .8, 11, 'white', 12)
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
