"""庄园主联盟会所（卡无固定会所【卡 L151、L377】；设定 §4.6、§8 八角、§9.4）。本轮只做岛底。
岛底 —— 八角棱面的单根粗钝灰岩锥（棱线硬、面平），锥顶一圈结界保险库的暗色合金环 + 暖光灯点；一颗暖色核，一道环。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C

ID, NAME = 'isle9', '庄园主联盟会所'


def octagon(S, n=144):
    cs = [S.edge(math.pi / 8 + k * math.tau / 8) for k in range(8)]; out = []
    for k in range(8):
        (ax, ay), (bx, by) = cs[k], cs[(k + 1) % 8]
        for i in range(n // 8): t = i / (n // 8); out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under')
    mr = ctx.m('rock', lambda: K_.rock_mat('l9_rock', (.52, .52, .5), (.4, .4, .39), .12))
    mb = ctx.m('band', lambda: K_.rock_mat('l9_band', (.47, .47, .45), (.36, .36, .35), .25))
    mv = ctx.m('vault', lambda: C.flat('l9_vault', (.25, .2, .16), .35, metal=.9))
    ml = ctx.m('lamp', lambda: C.glow('l9_lamp', c=(1.0, .7, .4), estr=6))
    mg = ctx.m('core', lambda: C.glow('l9_core', c=(1.0, .7, .4), estr=7))
    P = octagon(S); cliff = 24
    K_.cliff_band(ctx, B, P, cliff, mb)
    rings, apex = K_.body_rings(ctx, P, [(.95, .15), (.9, .4), (.78, .7), (.58, .95), (.36, 1.1), (.18, 1.18), (0, 1.22)], cliff)
    K_.loft(B, rings, mr, apex=apex, smooth=False)
    z = -cliff - .2 * R; pts = K_.ring_at(rings, z); r1 = [((x - ox) * 1.025 + ox, y * 1.025) for x, y in pts]
    K_.loft(B, [(r1, z + .035 * R), (r1, z - .035 * R)], mv, smooth=False)
    for k in range(0, len(r1), 9): x, y = r1[k]; B.cyl(x, y, z - R * .01, R * .012, R * .02, ml, 8)
    z2 = -cliff - .45 * R; p2 = K_.ring_at(rings, z2); x, y = p2[int(len(p2) * .72)]
    K_.glow_orb(B, x, y, z2, R * .05, mg); K_.band(B, p2, z2, R * .01, ml, 1.04, ox)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
