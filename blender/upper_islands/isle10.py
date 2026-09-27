"""isle10 凯莉的宅邸 draft.【卡】开局三的计划地点；卡未写层与位置 → 上层【用户】, 落在 isle10【推断】。
Needs one recognisable main house vs. the generic manors: compact Regency white-stucco villa with a full-height bow
and Ionic portico (Belsay Hall / Sezincote-less Regency villa refs), walled garden. Not 维克多庄园 (another place, not mapped)."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

def build():
    island(85, 10)
    box(0, 10, 0, 34, 22, 13, 'stucco'); roof(0, 10, 13, 34, 22, 4, 'slate', 'x', 11)
    cyl(0, 21, 0, 8, 13, 'stucco', 32); cyl(0, 21, 13, 8.3, 3, 'slate', 32, 1)  # garden-front bow
    box(0, -2, 0, 12, 4, 11, 'stucco'); roof(0, -2, 11, 12, 4.5, 2.5, 'stucco')
    for i in range(4):
        cyl(-4.5 + i * 3, -3.5, 0, .45, 11, 'white', 10)
    box(-24, 6, 0, 12, 14, 7, 'stucco'); box(-24, 6, 7, 12.4, 14.4, .5, 'slate')  # service wing
    # walled garden
    for (x, y, sx, sy) in ((30, 30, 30, 1), (30, 60, 30, 1), (15, 45, 1, 30), (45, 45, 1, 30)):
        box(x, y - 15, 0, sx, sy, 2.5, 'redbrick')
    for i in range(3):
        box(30, 36 - i * 8, .3, 24, 4, .6, 'soil')
    box(0, -25, 0, 30, 24, .35, 'gravel'); cyl(0, -25, .35, 4, .6, 'water')
    ring_trees(70, 26, 10, 1.1, gap=(math.radians(-100), .4))
    pad(-15, -78, 11, math.radians(-100), 14)
if __name__ == '__main__':
    run(build)
