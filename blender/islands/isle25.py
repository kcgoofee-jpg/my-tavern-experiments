"""精英学院（设定 §4.4、§8 方台、§9.3 光柱、§9.4）。本轮只做岛底；岛面等样岛通过后再做。全部形制为仓库推断。
岛底 —— 灰色修整石，规整的倒阶梯金字塔（五级，每级平台 + 立面）；第二级立面是观测阶梯教室的一圈晶窗；
        以太修习圆庭的光柱从塔尖穿出；一颗核。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C

ID, NAME = 'isle25', '精英学院'


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under')
    mr = ctx.m('rock', lambda: K_.rock_mat('a25_stone', (.6, .6, .58), (.47, .47, .46), 0.0))
    mb = ctx.m('band', lambda: K_.rock_mat('a25_course', (.55, .55, .53), (.42, .42, .41), .6))
    mw = ctx.m('win', lambda: C.window_grid('a25_windows', lit=(.7, .92, 1.0), estr=4.0, cell=(4.0, 3.0)))
    mg = ctx.m('core', lambda: C.glow('a25_core', c=(.62, .88, 1.0), estr=9))
    mbeam = ctx.m('beam', lambda: C.glow('a25_beam', c=(.7, .92, 1.0), estr=3.0, alpha=.45))
    P = S.pts(144); cliff = 20
    K_.cliff_band(ctx, B, P, cliff, mb)
    ring = lambda s: [(x * s + ox, y * s) for x, y in P]
    z = -cliff; s = .985
    for j, s2 in enumerate((.8, .62, .44, .26)):                                    # 每级：立面（竖直）+ 平台（水平收进）
        z2 = z - .14 * R
        K_.loft(B, [(ring(s), z), (ring(s), z2)], mw if j == 1 else (mb if j % 2 else mr), smooth=False)
        K_.loft(B, [(ring(s), z2), (ring(s2), z2)], mr, smooth=False)
        z, s = z2, s2
    K_.loft(B, [(ring(s), z)], mr, apex=(ox, 0, z - .26 * R), smooth=False)
    K_.glow_orb(B, ox + S.rx * .02, -S.ry * .26, z + .07 * R, R * .05, mg)
    B.cyl(ox, 0, z - .26 * R - 1.8 * R, .05 * R, 1.8 * R + 2, mbeam, 24)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
