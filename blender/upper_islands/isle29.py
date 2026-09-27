"""isle29 将军官邸 draft.【推断, canon:false】卡里没有具名统帅；紧邻银冠堡【推断】。
Neutral: Georgian/Regency service residence (Royal Hospital Chelsea / Admiralty House refs), gravel parade forecourt,
three plain plinth blocks = the existing 「魔导装甲」 props kept as abstract massing (no weapons, no figures)."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

def build():
    island(95, 29)
    box(0, 12, 0, 56, 18, 15, 'redbrick'); roof(0, 12, 15, 56, 18, 6, 'slate', 'x', 6)
    for sx in (-1, 1):
        box(sx * 34, 2, 0, 12, 34, 11, 'redbrick'); roof(sx * 34, 2, 11, 12, 34, 4, 'slate', 'y', 3)
    box(0, 2.5, 0, 14, 2, 15, 'portland'); roof(0, 2.5, 15, 14, 2.2, 3, 'portland')
    for i in range(4):
        cyl(-5.4 + i * 3.6, 1.2, 0, .6, 12, 'white', 10)
    box(0, -22, 0, 50, 28, .35, 'gravel')      # parade forecourt
    for i in (-1, 0, 1):
        box(i * 12, -28, .35, 4, 4, 3, 'steel')  # abstract plinths (armour props, neutral)
    box(0, -44, 0, 6, 36, .3, 'path')
    cyl(0, 12, 21, 2.5, 5, 'white', 16); dome(0, 12, 26, 2.6, 'lead', .8)
    box(-60, 20, 0, 30, 30, .3, 'gravel'); box(-60, 20, .3, 26, 10, 5, 'lime')  # stables-turned-garage 仓库推断
    ring_trees(80, 30, 29, 1.2, gap=(math.radians(-90), .4))
    pad(0, -88, 12, math.radians(-90), 18)
if __name__ == '__main__':
    run(build)
