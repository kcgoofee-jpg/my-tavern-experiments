"""isle25 以太研究院 draft.【推断, canon:false】卡里没有这座研究院 → 地图保持「仓库自设」, 建筑不加戏。
Low-key research campus (Cavendish West Cambridge / Rothamsted refs): quadrangle + lab wings + one plain services mast.
Card's 以太气候调节塔 location is unwritten → NOT placed here."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

def build():
    island(100, 25)
    for (x, y, sx, sy) in ((0, 25, 60, 12), (0, -15, 60, 12), (-24, 5, 12, 28), (24, 5, 12, 28)):
        box(x, y, 0, sx, sy, 10, 'portland'); box(x, y, 10, sx - 1, sy - 1, .6, 'lead')
    box(0, 5, 0, 30, 20, .3, 'gravel'); cyl(0, 5, .3, 2.5, .6, 'water')
    box(-55, -5, 0, 26, 40, 7, 'glass'); box(-55, -5, 7, 27, 41, .6, 'steel')  # glasshouse/lab hall
    box(50, 10, 0, 22, 22, 6, 'portland'); cyl(50, 10, 6, 7, 5, 'copper', 32, 1)  # small observatory-style roof
    cyl(35, -40, 0, 1.2, 28, 'steel', 12)  # plain services mast
    ring_trees(82, 32, 25, 1.1, gap=(math.radians(-40), .4))
    pad(60, -58, 11, math.radians(-40), 16)
if __name__ == '__main__':
    run(build)
