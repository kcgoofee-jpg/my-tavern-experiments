"""「Y」的庄园（渲染战役 R `isle:isle5`；设定块 docs/upper-islands-checklist.md「Y」的庄园 C1–C2 / R1–R10；设定 §4.8、§8 锯齿、§9.4）。
卡：全天城最大的庄园，庄园主从不露面、不入联盟【卡 L151】；其余：
岛面 —— 锯齿巨岛，崎岖黑岩脊纵横；深墨绿针叶林连续覆盖，俯视只见林冠；一座黑石宅邸半埋林中，只露长屋脊与高烟囱；
        一条窄石道穿林通到北缘（背离伊甸）的暗平台；全区唯一看得出厚度的冷光结界边。
岛底 —— 黑色玄武岩，冷峻锯齿形的短主体下挂十几根不规则长尖刺（吊灯状）；核不可见；下半将没进 c3 云海。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C
from mathutils import noise as MN, Vector

ID, NAME = 'isle5', '「Y」的庄园'
CAM_DROP, CAM_DIST = .3, 3.8
UCAM_DROP, UCAM_DIST = .6, 4.2
HOUSE = (-20.0, 10.0)                        # 宅邸中心（岛本地米）；y_estate 标记热点
RIDGES = [[(-220, -60), (-120, -20), (-40, 5), (60, 30), (170, 80)], [(-60, -170), (-20, -90), (10, -30)], [(40, 170), (90, 100), (150, 20), (200, -60)]]

BOARD_TITLE = '「Y」的庄园 —— 渲染战役设定对照'
ITEMS = [
    ('card_y', '全天城最大的庄园；庄园主从不露面、不入联盟', 'L151', '✓'),
    ('outline', '冷峻锯齿巨岛，黑岩脊纵横', '§4.8、§8', '✓'),
    ('forest', '深墨绿针叶林，俯视只见林冠', '§4.8', '✓'),
    ('house', '黑石宅邸：只露长屋脊与高烟囱，半埋林中', '§4.8', '✓'),
    ('lane', '窄石道穿林通到背面平台', '', '✓'),
    ('dock', '北缘背面暗平台', '§4.8', '✓'),
    ('ward', '冷光厚结界边（全区唯一）', '§4.8、§2', '✓'),
    ('u_spikes', '岛底：黑玄武岩吊灯状长尖刺', '§9.4', '✓'),
]


def spruce(B, M, x, y, z, h, r, rnd):
    """深墨绿针叶树：细干 + 三节叠锥（俯视只见尖顶林冠）"""
    B.cyl(x, y, z - .3, r * .08 + .1, h * .3, M['bark5'], 5, smooth=False)
    m = (M['needle_a'], M['needle_b'], M['needle_c'])[rnd.randrange(3)]; nt = rnd.randint(3, 5)
    for k in range(nt):
        f = k / nt; rr = r * (1 - .62 * f) * rnd.uniform(.85, 1.1); z0 = .16 + .7 * f
        B.cyl(x + rnd.uniform(-.3, .3), y + rnd.uniform(-.3, .3), z + h * z0, rr, h * (.9 / nt + .1), m, 7, r2=rr * .1, smooth=False)


# ============================================================ 岛面
def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R; rnd = random.Random(55)
    M['litter5'] = K_.ground_v17('y5_litter', [(.07, .09, .06), (.1, .1, .07), (.08, .08, .07)], dry=(.2, .18, .14), soil=(.1, .09, .08), rock=(.09, .1, .12))
    M['bark5'] = C.flat('y5_bark', (.08, .07, .06), .9)
    M['needle_a'] = C.flat('y5_needle_a', (.018, .04, .026), .85, noise=.5); M['needle_b'] = C.flat('y5_needle_b', (.025, .05, .03), .85, noise=.5)
    M['needle_c'] = C.flat('y5_needle_c', (.03, .045, .028), .85, noise=.5)
    M['rock5'] = C.flat('y5_rocktop', (.03, .031, .035), .96, noise=.6)
    M['wardrim5'] = C.glow('y5_wardrim', c=(.5, .72, 1.0), estr=1.4, alpha=.08); M['wardline5'] = C.glow('y5_wardline', c=(.55, .8, 1.0), estr=5.0)
    M['blackstone'] = C.flat('y5_stone', (.035, .034, .036), .95, noise=.4)
    M['slate5'] = C.flat('y5_slate', (.025, .026, .03), .92, noise=.3)
    M['lane5'] = C.flat('y5_lane', (.22, .22, .23), .9, noise=.5)
    M['ward5'] = K_.hex_ward('y5_ward', cell=5.0, alpha=.04, estr=.6, c=(.55, .75, 1.0), rim=.35)
    tr = K_.Terrain(S, noise=(3.0, 40), rough=(1.6, 14), ridges=[dict(pts=p, w=44, h=30) for p in RIDGES] + [dict(pts=[(-150, 90), (-80, 140)], w=30, h=-8)],
                    brow=(8, 3.0), ground='litter5')
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    hx, hy = HOUSE; tr.flats.append((hx - 36, hx + 36, hy - 12, hy + 12, tr.base(hx, hy) + 16, 8))
    lane = [(hx + 10, hy + 14), (hx + 40, hy + 60), (hx + 30, hy + 120), S.edge(math.pi / 2 + .15, .9)]
    tr.path(lane, 4, 'lane5')
    tr.fn(lambda x, y: any(K_.seg_dist(x, y, p) < 9 + 4 * MN.noise(Vector((x * .05, y * .05, 2.0))) for p in RIDGES), 'rock5')
    tr.build(ctx.B('terrain'), M)
    zh = tr.h(hx, hy)
    ctx.anchor('outline', *S.edge(-.4, .95), tr.h(*S.edge(-.4, .9)) + 4); ctx.anchor('outline', *S.edge(2.6, .95), tr.h(*S.edge(2.6, .9)) + 4)

    def house():                                                                    # 长条黑石宅：三层、陡石板坡、高烟囱、窄高窗
        t = K.block(-32, 32, -8, 8, 3, 4.4, M['blackstone'], bay=3.0, win=(.9, 2.6)); K.hip(-32, 32, -8, 8, t, 9.0, m=M['slate5'], over=.6)
        K.block(20, 32, 8, 22, 2, 4.4, M['blackstone'], bay=3.0, win=(.9, 2.6)); K.hip(20, 32, 8, 22, 2 * 4.4 + .55, 7.0, m=M['slate5'], over=.6)
        for x in (-26, -12, 4, 18, 30): K.chimney(x, 0, t + 6.0, 11.0, 1.6, 1.0, M['blackstone'])
        return t
    t = K_.placed(house, hx, hy, zh)
    ctx.anchor('house', hx, hy, zh + t + 10); ctx.anchor('card_y', hx - 20, hy, zh + t + 4)

    TB = ctx.B('site_trees'); n = 0; step = 7.0; yq = -R                            # 针叶林：满岛，只让开宅、石道、岩脊顶
    while yq < R:
        xq = -R
        while xq < R:
            x, y = xq + rnd.uniform(-3.5, 3.5), yq + rnd.uniform(-3.5, 3.5); xq += step * rnd.uniform(.6, 1.4)
            if MN.noise(Vector((x / 45, y / 45, 6.0))) < -.35: continue                            # 林窗
            if S.frac(x, y) > .95 or (abs(x - hx) < 36 and abs(y - hy) < 13) or K_.seg_dist(x, y, lane) < 4: continue
            d = min(K_.seg_dist(x, y, p) for p in RIDGES)
            if d < 11 or (d < 18 and rnd.random() < .6): continue                                    # 脊顶露黑岩
            spruce(TB, M, x, y, tr.h(x, y), rnd.uniform(12, 30), rnd.uniform(2.4, 4.6), rnd); n += 1
        yq += step
    print('isle5 trees', n)
    ctx.anchor('forest', *S.edge(-2.2, .6), tr.h(*S.edge(-2.2, .6)) + 24); ctx.anchor('lane', *lane[2], tr.h(*lane[2]) + 2)
    (px, py), br, dz, ang = K_.dock(K, S, tr, (math.cos(math.pi / 2 + .15), math.sin(math.pi / 2 + .15)), 8.0, cars=1, lights=False)
    ctx.anchor('dock', px, py, dz + 2)
    WB = ctx.B('ward')
    K_.ward_dome(S, ctx.top_z, 55.0, M['ward5'], WB, s=1.04)                              # 穹面几乎透明
    P = S.pts(288, 1.04); nP = len(P); vs = []                                          # 冷光厚边：岛缘一圈 14 m 高的半透明光墙
    for x, y in P: z = tr.h(x / 1.04 * .98, y / 1.04 * .98); vs += [(x, y, z - 4), (x, y, z + 14)]
    WB.poly(vs, [(2 * i, 2 * ((i + 1) % nP), 2 * ((i + 1) % nP) + 1, 2 * i + 1) for i in range(nP)], M['wardrim5'])
    top_ = [vs[2 * i + 1] for i in range(nP)]; WB.strip(top_ + top_[:1], .5, .25, M['wardline5'])      # 光墙顶一道细亮线
    ctx.anchor('ward', *S.edge(-1.2, 1.04), tr.h(*S.edge(-1.2, .95)) + 20)



def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); r2 = random.Random(5)
    mr = ctx.m('rock', lambda: K_.rock_v17('y5_rock17', (.06, .065, .075), (.04, .045, .052), 0.0, moss=(.06, .08, .05), moss_amt=.15, soil=(.07, .06, .05), lichen=(.2, .22, .24)))
    P = S.pts(144); cliff = 34
    K_.cliff_band(ctx, B, P, cliff, mr)
    rings, apex = K_.body_rings(ctx, P, [(.78, .14), (.5, .28), (.22, .4), (0, .48)], cliff, amp=.1)
    K_.loft(B, rings, mr, apex=apex, smooth=False)
    for k in range(13):                                                             # 尖刺：五棱、微外斜、长短不一
        a = r2.uniform(0, math.tau); f = r2.uniform(.1, .8); bx, by = math.cos(a) * S.rad(a) * f * .72 + ox, math.sin(a) * S.rad(a) * f * .72
        L = R * r2.uniform(.6, 1.45) * (1.1 - f * .5); rr = R * r2.uniform(.06, .13); z0 = -cliff - R * .08; lean = r2.uniform(.05, .25) * f
        tip = (bx + math.cos(a) * L * lean, by + math.sin(a) * L * lean, z0 - L)
        ring = [(bx + math.cos(q * math.tau / 7 + r2.uniform(-.25, .25)) * rr * r2.uniform(.6, 1.3), by + math.sin(q * math.tau / 7 + r2.uniform(-.25, .25)) * rr * r2.uniform(.6, 1.3)) for q in range(7)]
        mid = [(bx + (x - bx) * .55 + (tip[0] - bx) * .4, by + (y - by) * .55 + (tip[1] - by) * .4) for x, y in ring]
        K_.loft(B, [(ring, z0), (mid, z0 - L * .4)], mr, apex=tip, smooth=False)
        if k in (0, 5): ctx.anchor('u_spikes', tip[0], tip[1], tip[2] + L * .3)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
