"""首相府（渲染战役 R `isle:isle6`；设定块 docs/upper-islands-checklist.md「首相府」C1–C2 / S1–S10；设定 docs/upper-setting.md §4.3、§8、§9.4）。
卡：首相阿斯特丽德·露易丝办公、开会的地方（开局五）【卡 L69、L178、L257】；首相由上层选举，任期 7 年【卡 L149】。
岛面 —— 长脊一端收尖；沿长轴一条「街」的平直台面，两侧草甸缓坡、列植行道树；唐宁街式深色砖联排 + 正门白柱廊，
        后院深色合金框玻璃内阁厅；女儿墙内一排细小银桩（结界节点）；双座公务平台、信标双环；中档细格结界边。
岛底 —— 深色玄武岩；长脊下是一排三根柱状节理桥墩；两颗核互为备份，符文环规整。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C
from mathutils import noise as MN, Vector

ID, NAME = 'isle6', '首相府'
CAM_DROP, CAM_DIST = .32, 3.8
UCAM_DROP, UCAM_DIST = .5, 4.0
STREET_Y, STREET_Z = -6.0, 6.0                  # 街中线（岛本地米）与街台面抬高
ROW = (-48.0, 40.0, 4.0, 18.0)                  # 联排：x0 x1 y0 y1（街北侧，正面朝南）
HALL = (-14.0, 14.0, 30.0, 48.0)                # 后院玻璃内阁厅

BOARD_TITLE = '首相府 —— 渲染战役设定对照'
ITEMS = [
    ('card_pm', '首相办公、开会的地方（开局五）', 'L69、L178、L257', '✓'),
    ('outline', '长脊一端收尖；街台面 + 两侧草甸缓坡', '§4.3、§8', '✓'),
    ('row', '唐宁街式深色砖联排 + 正门白柱廊', '§4.3', '✓'),
    ('hall', '后院深色合金框玻璃内阁厅', '§4.3', '✓'),
    ('pins', '女儿墙内一排细小银桩（结界节点）', '§4.3', '✓'),
    ('trees', '街两侧列植行道树', '§4.3', '✓'),
    ('dock', '双座公务平台，信标双环', '§4.3、§9.4', '✓'),
    ('ward', '中档细格结界边', '§2', '✓'),
    ('u_piers', '岛底：三根柱状节理桥墩；两颗核', '§9.4、§4.3', '✓'),
]


def street_tree(B, M, x, y, z, h, r):
    """修剪整齐的行道树：直干 + 规整卵形树冠"""
    B.cyl(x, y, z - .3, .35, h * .45, M['bark6'], 6, smooth=False)
    B.sphere(x, y, z + h * .62, r, M['crown6'], sz=h * .42 / r, seg=12, rings=7)


def _sm(t): t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)


class SlopeTerrain(K_.Terrain):
    """街台面两侧草甸缓坡落向岛缘；收尖的东端（+x）再压低一截"""
    def base(self, x, y):
        S = self.S; f = abs(y - STREET_Y) / max(1.0, S.ry)
        return super().base(x, y) - 16 * _sm((f - .25) / .75) - 14 * _sm((x / S.rx - .55) / .45)


# ============================================================ 岛面
def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R; rnd = random.Random(66)
    M['meadow6'] = K_.ground_v17('p6_meadow', [(.09, .12, .05), (.11, .13, .06), (.08, .1, .05)], dry=(.24, .22, .13), soil=(.2, .16, .1),
                                 rock=(.35, .35, .36), dots=[(.62, .6, .4), (.5, .45, .6)], dot_dens=.18, dot_scale=.8, slope_rock=False)
    M['lawn6'] = C.flat('p6_lawn', (.08, .16, .04), .9, noise=.45)
    M['street6'] = C.flat('p6_street', (.16, .16, .17), .85, noise=.4)
    M['kerb6'] = C.flat('p6_kerb', (.55, .55, .53), .8, noise=.3)
    M['brick6'] = C.pbr('p6_brick', 'dark_brick_wall', 1.4, tint=(.55, .42, .38), value=.55, sat=.5)
    M['slate6'] = C.flat('p6_slate', (.035, .037, .045), .92, noise=.3)
    M['white6'] = C.flat('p6_white', (.86, .85, .82), .6, noise=.15)
    M['alloy6'] = C.flat('p6_alloy', (.07, .075, .085), .35, metal=.8)
    M['cglass6'] = C.glass('p6_cglass', tint=(.12, .16, .18), rough=.04, emit=(1.0, .85, .6), estr=.6)
    M['silver6'] = C.flat('p6_silver', (.8, .82, .86), .25, metal=1.0)
    M['bark6'] = C.flat('p6_bark', (.12, .09, .07), .9)
    M['crown6'] = C.flat('p6_crown', (.1, .2, .06), .85, noise=.5)
    M['ward6'] = K_.hex_ward('p6_ward', cell=6.0, alpha=.06, estr=.9, c=(.6, .85, 1.0), rim=.3)
    sy0, sy1 = STREET_Y - 14, HALL[3] + 6                                          # 街台面：从街南沿到内阁厅后
    tr = SlopeTerrain(S, noise=(1.4, 36), rough=(.8, 16), brow=(7, 2.0), ground='meadow6')
    tr.flats.append((-S.rx * .62, S.rx * .5, sy0, sy1, tr.base(0, 0) + STREET_Z, 30))
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    street = [(-S.rx * .6, STREET_Y), (S.rx * .48, STREET_Y)]
    tr.path(street, 9, 'street6')
    tr.rect(-S.rx * .6, S.rx * .48, STREET_Y + 4.5, STREET_Y + 6, 'kerb6'); tr.rect(-S.rx * .6, S.rx * .48, STREET_Y - 6, STREET_Y - 4.5, 'kerb6')
    tr.rect(HALL[0] - 10, HALL[1] + 10, ROW[3], HALL[3] + 5, 'lawn6')                  # 后院草坪
    tr.build(ctx.B('terrain'), M)
    z0 = tr.h(0, 0)
    ctx.anchor('outline', *S.edge(0.0, .95), tr.h(*S.edge(0.0, .9)) + 2); ctx.anchor('outline', *S.edge(math.pi, .92), tr.h(*S.edge(math.pi, .88)) + 2)

    def row():                                                                     # 联排：五段高低略错的深砖立面 + 白窗套、黑门、烟囱帽成排
        x0, x1, y0, y1 = ROW; segs = [(x0, x0 + 18, 4), (x0 + 18, x0 + 36, 3), (x0 + 36, x0 + 54, 4), (x0 + 54, x0 + 72, 4), (x0 + 72, x1, 3)]
        tops = []
        for (a, b, fl) in segs:
            t = K.block(a, b, y0, y1, fl, 3.8, M['brick6'], bay=2.6, win=(1.1, 2.2)); tops.append(t)
            K.W.box(a, b, y0, y1, t, t + 1.1, M['brick6'])                                # 女儿墙
            K.hip(a + .6, b - .6, y0 + .6, y1 - .6, t + .2, 3.0, m=M['slate6'], over=0.0)
            for cx in (a + 1.2, b - 1.2): K.chimney(cx, (y0 + y1) / 2, t + 1.0, 3.4, 1.0, 3.2, M['brick6'])
            for k in range(int((b - a) / 3.2)):                                           # 银桩：女儿墙内侧一排细小银色桩
                K.W.cyl(a + 1.6 + k * 3.2, y0 + .9, t + 1.1, .09, .9, M['silver6'], 6, smooth=False)
        for k in range(10):                                                             # 黑漆门 + 白门框
            dx = x0 + 4 + k * 9.2
            K.W.box(dx - 1.0, dx + 1.0, y0 - .12, y0 + .02, .9, 3.4, M['white6']); K.W.box(dx - .7, dx + .7, y0 - .18, y0 - .08, .9, 3.1, M['alloy6'])
        K.portico(x0 + 45, y0, 12.0, 4.5, 8.0, n=6, face=-1)                             # 正门白柱廊
        return max(tops)
    zr = tr.h((ROW[0] + ROW[1]) / 2, (ROW[2] + ROW[3]) / 2)
    t = K_.placed(row, 0, 0, zr)
    ctx.anchor('row', ROW[0] + 45, ROW[2] - 3, zr + 10); ctx.anchor('card_pm', ROW[0] + 20, ROW[2], zr + t + 2)
    ctx.anchor('pins', ROW[0] + 60, ROW[2] + 1, zr + t + 1.5)

    def hall():                                                                    # 玻璃内阁厅：深色合金框、平顶、暖光透出
        x0, x1, y0, y1 = HALL; h = 7.5
        K.W.box(x0 - .5, x1 + .5, y0 - .5, y1 + .5, 0, .8, M['alloy6'])
        K.WN.box(x0 + .15, x1 - .15, y0 + .15, y1 - .15, .8, h, M['cglass6'])
        K.W.box(x0 - .6, x1 + .6, y0 - .6, y1 + .6, h, h + .7, M['alloy6'])
        for k in range(int((x1 - x0) / 2.4) + 1):
            x = x0 + k * 2.4
            for y in (y0, y1): K.RL.box(x - .09, x + .09, y - .1, y + .1, .8, h, M['alloy6'])
        for k in range(int((y1 - y0) / 2.4) + 1):
            y = y0 + k * 2.4
            for x in (x0, x1): K.RL.box(x - .1, x + .1, y - .09, y + .09, .8, h, M['alloy6'])
        K.W.box(-2, 2, ROW[3], y0, 0, 3.2, M['alloy6'])                                   # 连廊
        return h
    zh = tr.h(0, (HALL[2] + HALL[3]) / 2); K_.placed(hall, 0, 0, zh)
    ctx.anchor('hall', 0, (HALL[2] + HALL[3]) / 2, zh + 9)

    TB = ctx.B('site_trees')                                                        # 行道树：街两侧等距列植
    for side in (STREET_Y - 8.5, STREET_Y + 8.5):
        x = -S.rx * .58
        while x < S.rx * .46:
            street_tree(TB, M, x, side, tr.h(x, side), 11.0, 3.2)
            x += 10.0
    ctx.anchor('trees', -S.rx * .4, STREET_Y - 8.5, tr.h(-S.rx * .4, STREET_Y - 8.5) + 10)
    n = 0                                                                           # 草甸缓坡上零星成团的树
    for q in range(260):
        x, y = rnd.uniform(-S.rx, S.rx), rnd.uniform(-S.ry, S.ry)
        if S.frac(x, y) > .9 or sy0 - 4 < y < sy1 + 4 and -S.rx * .66 < x < S.rx * .54: continue
        if MN.noise(Vector((x / 40, y / 40, 4.0))) < .15: continue
        street_tree(TB, M, x, y, tr.h(x, y), rnd.uniform(9, 14), rnd.uniform(2.6, 3.8)); n += 1
    print('isle6 trees', n)
    for k, a in enumerate((-math.pi / 2 - .35, -math.pi / 2 + .35)):                   # 双座公务平台（街南侧）
        (px, py), br, dz, ang = K_.dock(K, S, tr, (math.cos(a), math.sin(a)), 9.0, cars=2, lights=True)
        if k == 0: ctx.anchor('dock', px, py, dz + 2)
    WB = ctx.B('ward'); K_.ward_dome(S, ctx.top_z, 45.0, M['ward6'], WB, s=1.04)
    ctx.anchor('ward', *S.edge(1.2, 1.04), tr.h(*S.edge(1.2, .95)) + 18)


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(6)
    mr = ctx.m('rock', lambda: K_.rock_v17('p6_basalt17', (.055, .058, .065), (.035, .037, .042), .04, moss=(.05, .07, .04), moss_amt=.1, soil=(.06, .05, .04), lichen=(.2, .21, .22)))
    mb = ctx.m('band', lambda: K_.rock_v17('p6_band17', (.07, .072, .08), (.04, .042, .05), .08, moss=(.08, .12, .05), moss_amt=.3, soil=(.08, .06, .04), lichen=(.25, .26, .26)))
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
