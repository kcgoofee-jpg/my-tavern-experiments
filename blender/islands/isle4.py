"""维克多庄园（设定 §4.7、§8 斜长脊、§9.3 干瀑槽、§9.4）。本轮只做岛底。全部形制为仓库推断。
岛底 —— 锈褐砂岩；锥体随脊向东北倾斜下垂，锥尖在 3/4 处断裂（断口碎石）；干涸瀑布槽只剩苔痕；枯根；一颗弱核，一道符文环熄着。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C

ID, NAME = 'isle4', '维克多庄园'


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(4)
    mr = ctx.m('rock', lambda: K_.rock_mat('v4_rock', (.48, .31, .2), (.33, .21, .14), .16))
    mb = ctx.m('band', lambda: K_.rock_mat('v4_band', (.42, .28, .19), (.3, .2, .13), .3))
    mm = ctx.m('moss', lambda: C.flat('v4_moss', (.12, .14, .08), .95, noise=.5))
    mroot = ctx.m('root', lambda: C.flat('v4_root', (.2, .15, .1), .9, noise=.4))
    mg = ctx.m('core', lambda: C.glow('v4_core', c=(.6, .72, .78), estr=1.2))
    md = ctx.m('dead', lambda: C.flat('v4_deadring', (.12, .13, .14), .4, metal=.8))
    P = S.pts(144); cliff = 16
    K_.cliff_band(ctx, B, P, cliff, mb)
    rings, _ = K_.body_rings(ctx, P, [(.82, .18), (.62, .42), (.44, .62), (.34, .74)], cliff, amp=.09, tilt=(.55, .25))
    K_.loft(B, rings, mr, cap=True)
    pts, z = rings[-1]
    for i in range(0, len(pts), 5):                                                 # 断口碎石
        x, y = pts[i]; cx, cy = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        C.rock(B, cx + (x - cx) * .8, cy + (y - cy) * .8, z - 1.5, rnd.uniform(3, 7), mr, seed=i, facet=.5)
    a = math.radians(-75); pl = [(*[v + (ox if k == 0 else 0) for k, v in enumerate(S.edge(a))], ctx.top_z(*S.edge(a)))]
    for (ring, zz) in rings[:3]:
        i = int(((a % math.tau) / math.tau) * len(ring)) % len(ring); x, y = ring[i]; pl.append((x + math.cos(a) * .6, y + math.sin(a) * .6, zz))
    B.strip(pl, 8, .6, mm)                                                          # 干瀑槽
    z2 = -cliff - .35 * R; p2 = K_.ring_at(rings, z2); x, y = p2[int(len(p2) * .72)]
    K_.glow_orb(B, x, y, z2, R * .04, mg); K_.band(B, p2, z2, R * .01, md, 1.04, ox)
    K_.hanging(ctx, B, P, 40, (4, 14), mroot, rnd, r=(.12, .25))


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
