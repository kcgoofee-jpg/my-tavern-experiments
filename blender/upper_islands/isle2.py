"""isle2 draft. 原「大主教府邸」礼拜堂已去掉【卡：上层没有教区；大主教府邸并入辉光大教堂别名】。
Now a plain English manor, no marker【推断】: Jacobean H-plan (Blickling / Hatfield refs), no chapel, no spire, no bell tower."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

def build():
    island(90, 2)
    box(0, 8, 0, 44, 12, 12, 'redbrick'); roof(0, 8, 12, 44, 12, 6, 'slate', 'x')
    for sx in (-1, 1):
        box(sx * 25, 8, 0, 10, 34, 12, 'redbrick'); roof(sx * 25, 8, 12, 10, 34, 6, 'slate', 'y')
        box(sx * 25, -10, 12, 10, .6, 4, 'redbrick')  # gable end
    for x in (-8, 8):
        cyl(x, 8, 12, .8, 9, 'redbrick', 8)
    box(0, -20, 0, 50, 22, .35, 'gravel')
    for i in range(2):
        for j in range(2):
            box(-18 + i * 36, 38 + j * 14, .3, 26, 10, 1, 'hedge')
    cyl(0, 45, .3, 3, .6, 'water')
    ring_trees(75, 30, 2, 1.2, gap=(math.radians(-80), .35))
    pad(15, -80, 11, math.radians(-80), 14)
if __name__ == '__main__':
    run(build)
