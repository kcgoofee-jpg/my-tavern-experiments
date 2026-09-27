"""isle6 首相府 draft.【卡】首相去首相府开会（开局五）；位置未写 → 上层【推断】。
形制【用户 2026-09-28 选方案 A】= blender/landmarks/pm_residence: dark-brick 3-storey + attic Georgian terrace
(Downing Street), street-end iron gate + sentry box, garden-side white stucco colonnade. 公务停靠平台 (= card 访客停靠平台; 「公务」 仓库推断) kept, hover vehicles only."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

def build():
    island(95, 6)
    box(0, -20, 0, 90, 14, .3, 'granite')  # the street (cul-de-sac)
    box(0, -30, 0, 90, 6, .3, 'path')
    for i in range(5):  # terrace houses, slightly varied heights
        h = (12, 14.5, 13, 15.5, 12.8)[i]; dy = 1 if i == 2 else 0
        box(-32 + i * 16, -6 + dy, 0, 15.8, 12, h, 'brick'); box(-32 + i * 16, -6, h, 16, 12.4, .8, 'white')
        box(-32 + i * 16, -6, h + .8, 15, 10, 3.4, 'slate')  # mansard attic
        for c in (-5, 0, 5):
            cyl(-32 + i * 16 + c, -.5, h + .8, .5, 5, 'brick', 8)  # chimney stacks
        box(-32 + i * 16, -12.1, 0, 1.6, .3, 3, 'iron')  # black front door
        for r in range(3):
            for w in (-5, -2.5, 2.5, 5):
                box(-32 + i * 16 + w, -12.1, 3.5 + r * 3.3, 1.2, .2, 2, 'white')
    box(-44, -20, .3, .4, 14, 3, 'iron'); box(-44, -12, .3, 2.5, 2.5, 3, 'white')  # gate + sentry box
    box(0, 2.5, 0, 70, 5, 6, 'stucco')  # garden colonnade
    for i in range(12):
        cyl(-33 + i * 6, 4.8, 0, .5, 6, 'white', 10)
    box(0, 40, 0, 90, 40, .35, 'lawn'); box(0, 40, .35, 60, 2, .2, 'path')
    ring_trees(80, 30, 6, 1.1, gap=(math.radians(-150), .4))
    pad(-72, -45, 13, math.radians(-150), 20); vehicle(-70, -44, 0, .8)
if __name__ == '__main__':
    run(build)
