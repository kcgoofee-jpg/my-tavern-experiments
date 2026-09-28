"""首相府 v18（设定 docs/upper-setting.md §4.3、§8 长脊、§9.4；清单 docs/upper-islands-checklist.md）。
卡：首相阿斯特丽德·露易丝办公、开会的地方；位置卡没写【卡 L69、L178、L257、L324】。
其余全部仓库推断：
  岛面 —— 长脊约 1.6 : 1，东端收尖；沿长轴一条「街」的平直台面（灰石铺路），两侧草甸缓坡、岩脊露头；
          唐宁街式深色砖联排（高低错落的几段）+ 白柱廊，女儿墙内一排细小银桩（结界节点）；后院深色合金框玻璃内阁厅；
          街两侧列植行道树；不加晶簇、不设瀑布；南缘双座公务平台，各带信标双环；岛外 300 m 禁停圈只用一圈信标点；结界中档细格边。
  岛底 —— 深色玄武岩（柱状节理、层檐、崖缘薄土 + 苔）；长脊下一排三根桥墩式六棱石柱簇；两颗核互为备份，各两道规整符文环。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C
from mathutils import noise as MN, Vector

ID, NAME = 'isle6', '首相府'
ROCK, ROCK2 = (.1, .105, .12), (.05, .055, .065)
CAM_DROP, CAM_DIST = .3, 4.1
UCAM_DROP, UCAM_DIST = .4, 3.9
LV = 16.0                       # 街台面高
STREET_Y = -8.0

BOARD_TITLE = '首相府 —— v18 设定对照'
ITEMS = [
    ('card_home', '首相阿斯特丽德·露易丝办公、开会的地方', '卡原文', '✓'),
    ('outline', '轮廓：长脊约 1.6 : 1，东端收尖', '仓库推断', '✓'),
    ('street', '沿长轴一条「街」的平直台面', '仓库推断', '✓'),
    ('meadow', '两侧草甸缓坡（草甸群落，近档最深色块）+ 岩脊露头', '仓库推断', '✓'),
    ('avenue', '列植行道树，秩序感', '仓库推断', '✓'),
    ('terrace', '唐宁街式深色砖联排 + 白柱廊，克制', '仓库推断', '✓'),
    ('cabinet', '后院深色合金框玻璃内阁厅', '仓库推断', '✓'),
    ('posts', '2088：女儿墙内一排细小银桩（结界节点）；不加晶簇', '仓库推断', '✓'),
    ('dock', '双座公务平台，信标双环', '仓库推断', '✓'),
    ('nostop', '周围 300 m 禁停圈：只用信标点表示', '仓库推断', '✓'),
    ('ward', '结界：中档细格边', '仓库推断', '✓'),
    ('nofall', '不设瀑布', '仓库推断', '✓'),
    ('u_rock', '岛底：深色玄武岩，柱状节理、层檐', '仓库推断', '✓'),
    ('u_piers', '长脊下一排三根桥墩锥（六棱石柱簇）', '仓库推断', '✓'),
    ('u_core', '两颗核互为备份，符文环规整', '仓库推断', '✓'),
    ('palette', '配色：深砖 + 深橄榄草甸，近档最深色块；克制、秩序而非财富', '仓库推断', '✓'),
    ('cloud', '1300 m、雾 5%、下缘轻触 c1 云（合成场景处理，单岛图不做）', '仓库推断', '缺'),
]


def SHAPE_FN(th, r):
    """长脊：东端两肩内收 → 收尖；西端圆钝；轮廓加小起伏"""
    d = math.atan2(math.sin(th), math.cos(th))
    k = 1 + .015 * math.sin(4 * th + .9) + .01 * math.sin(9 * th + 2.3)
    k *= 1 + .06 * math.cos(2 * th) - .08 * math.sin(th) ** 2
    k -= .42 * math.exp(-((abs(d) - .7) / .45) ** 2)          # 东端两肩内收
    k += .14 * math.exp(-(d / .14) ** 2)                      # 尖端略外伸
    for a0, amp, wd in ((2.4, .03, .15), (-2.2, -.02, .12)):
        dd = math.atan2(math.sin(th - a0), math.cos(th - a0)); k += amp * math.exp(-(dd / wd) ** 2)
    return r * k


def crag(B, x, y, z, r, m, seed, up=1.0):
    rnd = random.Random(seed)
    for q in range(rnd.randint(3, 5)):
        rr = r * rnd.uniform(.45, .9)
        B.sphere(x + rnd.uniform(-r, r) * .6, y + rnd.uniform(-r, r) * .6, z + rr * .25 * up, rr, m,
                 sz=rnd.uniform(.45, .8) * up, sx=rnd.uniform(.8, 1.4), seg=9, rings=6)


def cliff_soil(ctx, B, P, cliff, m_rock, m_soil, soil_d=3.0, dz=1.5, ledge=.03, period=4.0, amp=.022, spur=0.0, inset=.985):
    """岛缘下 soil_d 米内用薄土层材质，以下玄武岩；层檐往下才出（同 isle10 的本地版）"""
    ox = ctx.ox; n = len(P); z0s = [ctx.top_z(x, y) for x, y in P]
    nz = max(2, int((max(z0s) + cliff) / dz)); vs = []
    for j in range(nz + 1):
        t = j / nz
        for (x, y), zt in zip(P, z0s):
            z = zt * (1 - t) - cliff * t; s = 1 + (inset - 1) * t
            if j:
                a = math.atan2(y, x)
                k = K_.strata_k(x, y, z, ctx.seed, ledge, period, amp)
                k = 1 + (k - 1) * min(1.0, (zt - z) / 6.0)
                k *= 1 + spur * max(0.0, MN.noise(Vector((math.cos(a) * 3 + ctx.seed, math.sin(a) * 3, .5)))) * min(1.0, t * 4)
                s *= k
            vs.append((x * s + ox, y * s, z))
    fsoil, frock = [], []
    for j in range(nz):
        for i in range(n):
            f = (j * n + (i + 1) % n, j * n + i, (j + 1) * n + i, (j + 1) * n + (i + 1) % n)
            (frock if z0s[i] - vs[(j + 1) * n + i][2] > soil_d else fsoil).append(f)
    B.poly(vs, frock, m_rock, smooth=True); B.poly(vs, fsoil, m_soil, smooth=True)
    return [(vs[nz * n + i][0] - ox, vs[nz * n + i][1]) for i in range(n)]


def columnar(m, zs=.25):
    """玄武岩柱状节理：节理 Voronoi 竖向拉长"""
    if m is None or not getattr(m, 'node_tree', None): return m
    for n in m.node_tree.nodes:
        if n.type == 'MAPPING' and abs(n.inputs['Scale'].default_value[2] - .55) < 1e-3: n.inputs['Scale'].default_value = (1.0, 1.0, zs)
    return m


# ============================================================ 岛底
def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(6)
    mr = ctx.m('rock', lambda: columnar(K_.rock_v17('p6_basalt17', ROCK, ROCK2, .008, moss=(.2, .28, .1), moss_amt=.35, soil_z=400.0, lichen=(.5, .52, .48))))
    mw = ctx.m('rockw', lambda: columnar(K_.rock_v17('p6_basalt17w', (.08, .085, .1), (.04, .045, .055), .006, moss=(.16, .22, .08), moss_amt=.2, soil_z=400.0, lichen=(.4, .42, .4))))
    ms = ctx.m('soil', lambda: K_.rock_v17('p6_soil17', (.24, .18, .12), (.14, .1, .07), .05, moss=(.2, .3, .1), moss_amt=.7, soil_z=400.0))
    mcol = ctx.m('col', lambda: C.flat('p6_col', (.16, .16, .18), .75, noise=.35))
    mcap = ctx.m('colcap', lambda: C.flat('p6_colcap', (.24, .24, .26), .8, noise=.4))
    mg = ctx.m('core', lambda: C.glow('p6_core', c=(.62, .88, 1.0), estr=7))
    mring = ctx.m('ring', lambda: C.glow('p6_ring', c=(.62, .88, 1.0), estr=3))
    mroot = ctx.m('root', lambda: C.flat('p6_root', (.18, .13, .09), .9, noise=.5))
    mmoss = ctx.m('moss', lambda: C.flat('p6_moss', (.16, .24, .09), .95, noise=.5))
    P = S.pts(200); cliff = 22
    P1 = cliff_soil(ctx, B, P, cliff, mr, ms, soil_d=3.0, dz=1.5, ledge=.03, period=3.2, amp=.02, spur=.04)
    prof = [(.93, .03), (.84, .07), (.7, .11), (.52, .15), (.28, .19), (0, .21)]      # 长脊下的扁平岩体，下面挂三墩
    rings, apex = K_.body_v17(ctx, P1, prof, cliff, dz=2.2, ledge=.06, period=3.5, amp=.035, lo=(.08, .04))
    h = len(rings) // 2
    K_.loft(B, rings[:h + 1], mr); K_.loft(B, rings[h:], mw, apex=apex)
    z0 = -cliff - R * .08
    for q, (u, r0, L) in enumerate(((-.56, .14, .5), (-.02, .16, .6), (.5, .12, .45))):     # 三座柱状节理桥墩（成锥）
        bx = u * S.rx; r0 *= R; L *= R; rr = r0 * .2
        K_.cone(B, bx + ox, 0, z0 + R * .06, r0 * 1.15, L, mw, seed=60 + q, rough=.12, n=6, nr=40, ledge=.08, power=.9)
        cols = [(math.cos(a) * r0 * rd, math.sin(a) * r0 * rd, f) for (rd, nn, f0) in ((.45, 6, .62), (.85, 10, .34)) for a, f in
                ((k * math.tau / nn + .3 * rd, f0 * rnd.uniform(.8, 1.1)) for k in range(nn))]
        for (hx, hy, f) in cols:
            zb = z0 - L * f
            B.cyl(bx + hx + ox, hy, zb, rr, L * f + R * .04, mr, 6, smooth=False)
            B.cyl(bx + hx + ox, hy, zb - rr * .35, rr * .75, rr * .35, mcap, 6, r2=rr, smooth=False)
        ctx.anchor('u_piers', bx + ox, -r0 * .9, z0 - L * .4)
    for u in (-.31, .29):                                                            # 两颗核，各两道规整圆环
        x = u * S.rx; z = -cliff - .13 * R
        K_.glow_orb(B, x + ox, -S.ry * .3, z - R * .01, R * .04, mg)
        for q in range(2): B.cyl(x + ox, 0, z - q * R * .028, S.ry * (.3 + .04 * q), R * .005, mring, 64, cap=False, rx=S.rx * (.2 + .026 * q))
        ctx.anchor('u_core', x + ox, -S.ry * .3, z)
    for fq in (.7, .78):
        zq = -cliff - .05 * R; x, y = K_.ring_at(rings, zq)[int(len(rings[0][0]) * fq)]; ctx.anchor('u_rock', x, y, zq)
    K_.hanging(ctx, B, P, 420, (4, 14), mroot, rnd, r=(.3, .6))
    K_.hanging(ctx, B, P, 200, (5, 12), mmoss, rnd, r=(1.0, 1.8))


# ============================================================ 岛面
def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R; rnd = random.Random(61)
    M['meadow'] = K_.ground_v17('p6_meadow17', [(.07, .1, .045), (.09, .12, .05), (.1, .12, .06)], dry=(.22, .22, .14), soil=(.26, .2, .13),
                                rock=(.3, .3, .32), dots=[(.86, .84, .72), (.55, .42, .7), (.85, .7, .25)], dot_dens=.12, dot_scale=.55)
    M['meadow2'] = K_.ground_v17('p6_meadow17b', [(.12, .14, .07), (.14, .15, .08), (.1, .13, .06)], dry=(.26, .25, .16), soil=(.26, .2, .13),
                                 rock=(.3, .3, .32), dots=[(.9, .88, .78), (.6, .45, .72)], dot_dens=.18, dot_scale=.6)
    M['lawn6'] = K_.ground_v17('p6_lawn17', [(.16, .28, .08), (.19, .31, .1)], dry=(.25, .33, .12), stripe=((.15, .27, .08), (.21, .34, .11), 4.0), slope_rock=False)
    M['paving'] = C.flat('p6_pave', (.46, .46, .47), .85, noise=.3)
    M['kerb'] = C.flat('p6_kerb', (.62, .62, .6), .8, noise=.2)
    M['gravel6'] = C.flat('p6_gravel', (.58, .56, .52), .9, noise=.4)
    M['door'] = C.flat('p6_door', (.02, .02, .025), .3, metal=.2)
    M['dalloy'] = C.flat('p6_dalloy', (.1, .11, .13), .3, metal=1.0)
    M['silver'] = C.flat('p6_silver', (.88, .9, .94), .12, metal=1.0, emit=(.7, .9, 1.0), estr=2.0)
    M['crag6'] = columnar(K_.rock_v17('p6_crag17', (.26, .26, .28), ROCK2, .2, moss=(.24, .32, .12), moss_amt=.5, soil_z=400.0, lichen=(.6, .62, .56)))
    M['ward'] = K_.hex_ward('p6_ward17', cell=7.0, alpha=.2, estr=1.8, rim=.04)
    tr = K_.Terrain(S, mounds=[dict(at=(-120, 70), r=34, h=5.0), dict(at=(40, 75), r=30, h=4.0), dict(at=(-60, -85), r=30, h=-3.0),
                               dict(at=(70, -70), r=26, h=3.5), dict(at=(-150, -40), r=26, h=4.0)],
                    noise=(.8, 35), rough=(1.0, 18), brow=(8, 2.6), ground='meadow',
                    ridges=[dict(pts=[(-150, 60), (-100, 92), (-40, 98)], w=10, h=4.5), dict(pts=[(20, -84), (80, -74), (120, -52)], w=9, h=4.0)])
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    tr.flats += [(-175, 165, -24, 56, LV, 55)]
    tr.fn(lambda x, y: MN.noise(Vector((x * .025, y * .025, 4.1))) > .25, 'meadow2')
    tr.rect(-120, 20, 18, 62, 'lawn6')
    tr.path([(-175, STREET_Y), (165, STREET_Y)], 11, 'paving')
    tr.path([(-172, STREET_Y), (172, STREET_Y)], 13.5, 'kerb'); tr.path([(-175, STREET_Y), (165, STREET_Y)], 11, 'paving')
    de1, de2 = math.radians(-62), math.radians(-112)
    for a in (de1, de2): ex_, ey_ = S.edge(a, .95); tr.path([(ex_, STREET_Y - 6), (ex_, ey_)], 3.0, 'gravel6')
    tr.path([(-60, 50), (-60, 18)], 3, 'gravel6')
    tr.build(ctx.B('terrain'), M)
    ctx.anchor('street', 100, STREET_Y, LV + .5); ctx.anchor('street', -150, STREET_Y, LV + .5)
    ctx.anchor('meadow', -40, -80, tr.h(-40, -80) + 1); ctx.anchor('meadow', 60, 85, tr.h(60, 85) + 1)
    ctx.anchor('palette', 20, -60, tr.h(20, -60) + 1)

    # 唐宁街式联排：北侧沿街一段段接起来，檐高错落；正面朝南，街面一侧白柱廊；女儿墙内一排银桩
    FRONT = 5.0
    segs = [(-110, -84, 3), (-84, -56, 4), (-56, -20, 4), (-20, 6, 3), (6, 30, 4)]
    def terrace():
        for (x0, x1, fl) in segs:
            t_ = K.block(x0, x1, FRONT, FRONT + 15, fl, 4.0, M['brick'], bay=3.0, win=(1.2, 2.4))
            K.W.box(x0 + .1, x1 - .1, FRONT + .1, FRONT + 14.9, t_, t_ + 1.3, M['brick'])                        # 女儿墙
            K.W.box(x0 - .1, x1 + .1, FRONT - .1, FRONT + .3, t_ + 1.3, t_ + 1.5, M['trim'])
            K.R.box(x0 + 1.2, x1 - 1.2, FRONT + 1.5, FRONT + 13.5, t_ - .3, t_ + .6, M['lead'])                  # 平顶
            for k in range(int((x1 - x0) / 2.2)):                                                            # 银桩（结界节点）
                x = x0 + 1.1 + k * 2.2; K.RL.cyl(x, FRONT + 1.0, t_ + .5, .28, 3.2, M['silver'], 6); K.RL.sphere(x, FRONT + 1.0, t_ + 3.8, .4, M['silver'], seg=6, rings=3)
            for k in range(int((x1 - x0) / 9)): K.chimney(x0 + 4.5 + k * 9, FRONT + 11, t_ + .5, 2.2, 2.2, 1.0, M['brick'])
            for k in range(int((x1 - x0) / 9)):                                                              # 黑门 + 白门框
                x = x0 + 4.5 + k * 9
                K.W.box(x - 1.4, x + 1.4, FRONT - .25, FRONT, 0, 3.6, M['trim']); K.WN.box(x - .9, x + .9, FRONT - .3, FRONT - .2, .9, 3.3, M['door'])
        K.portico(-38, FRONT, 20, 5.0, 9.0, n=6)                                                                # 主入口白柱廊
        K.RL.box(-111, 31, FRONT - 7, FRONT - 6.6, 0, 1.2, M['iron'])                                         # 铁栏
        for x in range(-108, 31, 4): K.RL.cyl(x, FRONT - 6.8, 1.2, .06, .4, M['iron'], 6)
    K_.placed(terrace, 0, 0, LV)
    ctx.anchor('terrace', -70, FRONT, LV + 12); ctx.anchor('card_home', -38, FRONT - 3, LV + 11)
    ctx.anchor('posts', 18, FRONT + 1, LV + 19); ctx.anchor('posts', -100, FRONT + 1, LV + 15)

    # 后院内阁厅：深色合金框玻璃长厅
    def cabinet():
        CB = ctx.B('cabinet'); X0, X1, Y0, Y1, H = -18.0, 18.0, -9.0, 9.0, 7.0
        CB.box(X0 - 1, X1 + 1, Y0 - 1, Y1 + 1, 0, .8, M['stone_grey']); CB.box(X0, X1, Y0, Y1, .8, H, M['glass_roof'])
        for k in range(13):
            x = X0 + k * 3.0
            for y in (Y0, Y1): CB.box(x - .2, x + .2, y - .2, y + .2, .8, H, M['dalloy'])
        for k in range(7):
            y = Y0 + k * 3.0
            for x in (X0, X1): CB.box(x - .2, x + .2, y - .2, y + .2, .8, H, M['dalloy'])
        CB.box(X0 - .4, X1 + .4, Y0 - .4, Y1 + .4, H, H + .6, M['dalloy'])
        for k in range(13): x = X0 + k * 3.0; CB.box(x - .12, x + .12, Y0, Y1, H + .6, H + .8, M['dalloy'])
        CB.box(X0 + .3, X1 - .3, Y0 + .3, Y1 - .3, H + .6, H + .7, M['glass_roof'])
        CB.box(-1.5, 1.5, -28.5, Y0, .8, 4.0, M['glass_roof'])                                            # 连到联排的玻璃廊
        for x in (-1.6, 1.6): CB.box(x - .15, x + .15, -28.5, Y0, .8, 4.2, M['dalloy'])
    K_.placed(cabinet, -38, 49, LV)
    ctx.anchor('cabinet', -38, 45, LV + 8)
    for q in range(10): C.tree(K.T, -116 + q * 2.4 * 5, 50, 4.5, .8, 'yew_col', seed=600 + q, z=LV)

    # 行道树：街两侧整齐列植
    for sy in (STREET_Y - 9, STREET_Y + 8.2):
        for x in range(-165, 160, 12):
            if sy > STREET_Y and -112 < x < 32: continue
            if S.frac(x, sy) > .93: continue
            C.tree(K.T, x, sy, 9.0, 3.0, 'oak', seed=int(x * 3 + sy), z=tr.h(x, sy) - .2)
    for x in range(-108, 32, 8): C.tree(K.T, x, STREET_Y - 9, 9.0, 3.0, 'oak', seed=int(x * 7), z=LV - .2)
    ctx.anchor('avenue', 80, STREET_Y - 9, LV + 9); ctx.anchor('avenue', -140, STREET_Y + 8, LV + 9)
    # 岛东段：公务用的小广场 + 纪念性的空（无雕像、无徽记）
    # 草甸上零星树团与岩脊露头
    RK = ctx.B('crags')
    for (cx, cy, n) in ((-120, 75, 5), (40, 78, 4), (-150, -45, 3), (70, -70, 3)):
        for q in range(n):
            x, y = cx + rnd.uniform(-14, 14), cy + rnd.uniform(-9, 9)
            if S.frac(x, y) < .88: C.tree(K.T, x, y, rnd.uniform(9, 12), rnd.uniform(3.5, 5), 'oak' if q % 3 else 'cedar', seed=700 + int(x + y * 3), z=tr.h(x, y) - .3)
    for pts in ([(-150, 60), (-100, 92), (-40, 98)], [(20, -84), (80, -74), (120, -52)]):
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            for t in (.2, .55, .85):
                x, y = ax + (bx - ax) * t, ay + (by - ay) * t
                if S.frac(x, y) < .95: crag(RK, x, y, tr.h(x, y) - .8, rnd.uniform(2.5, 4.5), M['crag6'], int(x * 5 + y))
    for q in range(34):
        a = rnd.uniform(0, math.tau); x, y = S.edge(a, rnd.uniform(.9, .98))
        if min(abs(math.atan2(math.sin(a - d), math.cos(a - d))) for d in (de1, de2)) < .14: continue
        crag(RK, x, y, tr.h(x, y) - .8, rnd.uniform(2.0, 4.2), M['crag6'], 900 + q)
    ctx.anchor('outline', *S.edge(0.0, .97), tr.h(*S.edge(0.0, .9)) + 2)
    ctx.anchor('nofall', *S.edge(-1.2, .98), tr.h(*S.edge(-1.2, .95)) - 6)

    # 双座公务平台（南缘，并排）+ 信标双环
    Lb = ctx.B('lamps')
    for a in (de1, de2):
        (px, py), _, z, ang = K_.dock(K, S, tr, (math.cos(a), math.sin(a)), 10, cars=1, approach_m=72)
        C.beacon_ring(Lb, px, py, z + .2, 10 + 5.0, M['aether'], n=16, s=.5)
        ctx.anchor('dock', px, py, z + 1.5)
    # 禁停圈：岛外 300 m 一圈稀疏信标点（不画实线）
    for k in range(56):
        a = k * math.tau / 56; rr = 300.0 * (S.rx / 184.0)
        Lb.sphere(math.cos(a) * rr, math.sin(a) * rr * .8, LV - 4, 1.4, M['aether'], seg=8, rings=4)
        if k in (40, 47): ctx.anchor('nostop', math.cos(a) * rr, math.sin(a) * rr * .8, LV - 4)
    WD = ctx.B('ward'); H = .3 * R; K_.ward_dome(S, lambda x, y: tr.h(x * .99, y * .99), H, M['ward'], WD)
    ctx.anchor('ward', 60, -S.ry * .5, tr.h(60, -S.ry * .5) + H * .75)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
