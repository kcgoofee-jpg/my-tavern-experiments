"""银冠堡（设定 §4.9、§8 要塞方台、§9.4）。本轮只做岛底（岛面沿用现有要塞模型）。全部形制为仓库推断。
岛底 —— 银灰整块倒金字塔岩座（四棱锐利、面平）；岩座四角各一具悬浮发射器（合金短筒 + 发光喷口）= 四颗核。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C

ID, NAME = 'silver_crown', '银冠堡'


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under')
    mr = ctx.m('rock', lambda: K_.rock_mat('s_rock', (.68, .7, .74), (.55, .57, .6), 0.0))
    mb = ctx.m('band', lambda: C.ashlar('s_wall', c=(.7, .72, .76), course=1.2, block=2.4))
    ma = ctx.m('alloy', lambda: C.flat('s_alloy', (.6, .63, .68), .3, metal=.9))
    mg = ctx.m('core', lambda: C.glow('s_core', c=(.75, .9, 1.0), estr=10))
    cs = [S.edge(math.pi / 4 + k * math.tau / 4) for k in range(4)]
    P = []
    for k in range(4):
        (ax, ay), (bx, by) = cs[k], cs[(k + 1) % 4]
        for i in range(36): t = i / 36; P.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    cliff = 30
    K_.cliff_band(ctx, B, P, cliff, mb, inset=.97)
    B.poly([(x * .97 + ox, y * .97, -cliff) for x, y in cs] + [(ox, 0, -cliff - .95 * R)], [(k, (k + 1) % 4, 4)[::-1] for k in range(4)], mr)
    for (x, y) in cs:                                                               # 四角悬浮发射器
        x, y = x * .8 + ox, y * .8; z = -cliff - .1 * R
        B.cyl(x, y, z - R * .12, R * .08, R * .2, ma, 12); B.cyl(x, y, z - R * .26, R * .11, R * .06, ma, 16, r2=R * .08)
        B.sphere(x, y, z - R * .28, R * .06, mg, seg=16, rings=8); B.cyl(x, y, z - R * .13, R * .08, R * .008, mg, 32, cap=False)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
