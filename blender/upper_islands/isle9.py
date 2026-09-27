"""isle9 庄园主联盟会所 draft.【卡】庄园主联盟 = 顶级贵族非官方组织, 举办拍卖会和品鉴会；制度纪念日大型拍卖会在上层。
【推断】固定会所本身与位置。Pall Mall clubhouse palazzo (Reform / Travellers Club refs) + top-lit auction saleroom
(Christie's King Street ref). Tasting dinners rotate between estates (card) → no dedicated banquet hall here."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

def build():
    island(100, 9)
    box(-15, 10, 0, 50, 34, 20, 'portland'); box(-15, 10, 20, 52, 36, 1.4, 'portland')  # palazzo w/ cornice
    for r in range(3):
        for i in range(9):
            box(-37 + i * 5.5, -7.1, 3.5 + r * 6, 2, .4, 3.5, 'glass')
    box(-15, 10, 21.4, 30, 16, .8, 'glass')  # glazed atrium (Reform Club saloon)
    box(28, 10, 0, 34, 30, 12, 'portland'); roof(28, 10, 12, 34, 30, 5, 'lead', 'x', 10)  # saleroom
    box(28, 10, 14, 14, 8, 2.5, 'glass')  # rooflight lantern
    box(0, -25, 0, 70, 20, .35, 'gravel'); box(0, -45, 0, 6, 30, .3, 'path')
    ring_trees(82, 30, 9, 1.2, gap=(math.radians(-90), .4))
    pad(0, -90, 13, math.radians(-90), 20); vehicle(-3, -92, 0, .3); vehicle(4, -86, 0, 1.9)
if __name__ == '__main__':
    run(build)
