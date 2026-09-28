"""「Y」的庄园（设定 §4.8、§8 锯齿、§9.4）。本轮只做岛底。全部形制为仓库推断。
岛底 —— 黑色玄武岩，冷峻锯齿形的短主体下挂十几根不规则长尖刺（吊灯状）；核不可见；下半将没进 c3 云海。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C

ID, NAME = 'isle5', '「Y」的庄园'


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); r2 = random.Random(5)
    mr = ctx.m('rock', lambda: K_.rock_mat('y5_rock', (.075, .08, .095), (.04, .045, .055), 0.0))
    P = S.pts(144); cliff = 34
    K_.cliff_band(ctx, B, P, cliff, mr)
    rings, apex = K_.body_rings(ctx, P, [(.78, .14), (.5, .28), (.22, .4), (0, .48)], cliff, amp=.1)
    K_.loft(B, rings, mr, apex=apex, smooth=False)
    for k in range(13):                                                             # 尖刺：五棱、微外斜、长短不一
        a = r2.uniform(0, math.tau); f = r2.uniform(.1, .8); bx, by = math.cos(a) * S.rad(a) * f * .72 + ox, math.sin(a) * S.rad(a) * f * .72
        L = R * r2.uniform(.6, 1.45) * (1.1 - f * .5); rr = R * r2.uniform(.06, .13); z0 = -cliff - R * .08; lean = r2.uniform(.05, .25) * f
        tip = (bx + math.cos(a) * L * lean, by + math.sin(a) * L * lean, z0 - L)
        ring = [(bx + math.cos(q * math.tau / 5 + r2.uniform(-.3, .3)) * rr * r2.uniform(.7, 1.2), by + math.sin(q * math.tau / 5 + r2.uniform(-.3, .3)) * rr * r2.uniform(.7, 1.2)) for q in range(5)]
        mid = [(bx + (x - bx) * .55 + (tip[0] - bx) * .4, by + (y - by) * .55 + (tip[1] - by) * .4) for x, y in ring]
        K_.loft(B, [(ring, z0), (mid, z0 - L * .4)], mr, apex=tip, smooth=False)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
