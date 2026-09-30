"""首相府（设定 §4.3、§8 长脊、§9.4）。本轮只做岛底；岛面等样岛通过后再做。
岛底 —— 深色玄武岩；长脊下是一排三根柱状节理桥墩（六棱石柱簇，底部参差）；两颗核互为备份（公务岛不能掉），符文环规整。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C

ID, NAME = 'isle6', '首相府'


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(6)
    mr = ctx.m('rock', lambda: K_.rock_mat('p6_basalt', (.17, .17, .19), (.09, .09, .11), 0.0))
    mb = ctx.m('band', lambda: K_.rock_mat('p6_band', (.2, .2, .22), (.1, .1, .12), .3))
    mg = ctx.m('core', lambda: C.glow('p6_core', c=(.62, .88, 1.0), estr=9))
    mring = ctx.m('ring', lambda: C.glow('p6_ring', c=(.62, .88, 1.0), estr=5))
    P = S.pts(144); cliff = 22
    K_.cliff_band(ctx, B, P, cliff, mb)
    rings, apex = K_.body_rings(ctx, P, [(.9, .08), (.7, .15), (.4, .2), (0, .22)], cliff, amp=.015)
    K_.loft(B, rings, mr, apex=apex)
    z0 = -cliff - R * .06
    for (u, r0, L) in ((-.62, .25, .95), (0.0, .29, 1.05), (.6, .23, .88)):          # 三座柱状节理桥墩
        bx = u * S.rx + ox; r0 *= R; L *= R; rr = r0 * .3
        cols = [(0, 0, 1.0)] + [(math.cos(a) * r0 * .55, math.sin(a) * r0 * .55, rnd.uniform(.6, .88)) for a in (k * math.tau / 6 + .5 for k in range(6))] \
               + [(math.cos(a) * r0 * .98, math.sin(a) * r0 * .98, rnd.uniform(.28, .52)) for a in (k * math.tau / 10 + .2 for k in range(10))]
        for (hx, hy, f) in cols:
            B.cyl(bx + hx, hy, z0 - L * f, rr, L * f + R * .05, mr, 6, smooth=False)
            B.cyl(bx + hx, hy, z0 - L * f - rr * .3, rr * .8, rr * .3, mb, 6, r2=rr, smooth=False)
    for u in (-.31, .31):                                                            # 两颗核，各两道规整圆环
        x = u * S.rx + ox; z = -cliff - .14 * R
        K_.glow_orb(B, x + R * .02, -S.ry * .55, z, R * .05, mg)
        for q in range(2): B.cyl(x, 0, z - q * R * .03, S.ry * (.62 + .05 * q), R * .006, mring, 64, cap=False, rx=S.rx * .32)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
