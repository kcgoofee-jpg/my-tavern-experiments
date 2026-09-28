"""庄园主联盟会所 v18（设定 docs/upper-setting.md §4.6、§8 八角、§9.3 不设瀑布、§9.4；清单 docs/upper-islands-checklist.md）。
卡：庄园主联盟是顶级贵族的非官方组织，办拍卖会、品鉴会；春秋拍卖季 + 冬季私人拍卖只限会员【卡 L151、L377】。
卡里没有固定会所【卡 L151、L377】——会所为仓库自设，整座岛全部形制都是仓库推断：
  岛面 —— 八角近圆台地（直边 + 轻微起伏、崖缘岩突）；北半是会所平台，南半是三级意式台地花园（直线石挡墙 + 栏杆 + 中轴石阶、
          黄杨花坛、柱形柏、柠檬盆、圆喷泉）；外圈是秋林群落（橙红 / 赭黄树冠成团），林下丘、洼、岩脊露头；
          米黄石意大利宫殿式会所（四翼围合、厚檐口、红陶低坡顶），中庭盖玻璃顶、透暖橙光；北侧顶光拍卖厅（屋脊玻璃采光长窗）；
          2088 层：合金骨架玻璃连廊 + 中轴全息园灯；东南（朝伊甸）环形大平台，十余辆悬浮车，桥头会员结界闸；结界只剩细线。
  岛底 —— 八角棱面的单根粗钝灰岩锥（棱硬、面平、层理层檐），锥顶一圈结界保险库的暗色合金环 + 暖光灯点；一颗核，一道若隐若现的符文环。
  §9.3：不设瀑布。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C
from mathutils import noise as MN, Vector

ID, NAME = 'isle9', '庄园主联盟会所'
ROCK, ROCK2 = (.5, .5, .48), (.38, .38, .37)
CAM_DROP, CAM_DIST = .3, 4.2
UCAM_DROP, UCAM_DIST = .38, 3.9
CUTS, LEVELS = (-52.0, -8.0), (0.0, 5.0, 10.0)      # 意式台地：两道直线挡墙，三级
SPAN = 62.0                                         # 台地园宽（|x| 内是硬挡墙，外面过渡成自然坡）
DOCK_ANG = math.atan2(-7.0 - 6.0, -2.0 + 9.5)       # 朝伊甸：tc_islands.json 伊甸 (-2,-7) − 本岛 (-9.5, 6)

BOARD_TITLE = '庄园主联盟会所 —— v18 设定对照（会所为仓库自设）'
ITEMS = [
    ('card_league', '庄园主联盟：非官方贵族组织，办拍卖会 / 品鉴会；卡无固定会所 → 会所为仓库自设', '卡原文 L151、L377', '✓'),
    ('outline', '轮廓：八角近圆台地（直边 + 崖缘岩突）', '仓库推断', '✓'),
    ('terrain', '平台 + 起伏：北侧会所平台，林下丘、洼、岩脊露头', '仓库推断', '✓'),
    ('garden', '意式台地花园：三级直线石挡墙 + 栏杆 + 中轴石阶、花坛、柱形柏、喷泉', '仓库推断', '✓'),
    ('autumn', '秋林群落：橙红、赭黄树冠成团', '仓库推断', '✓'),
    ('palazzo', '米黄石意大利宫殿式会所，厚檐口 + 红陶屋顶', '仓库推断', '✓'),
    ('atrium', '玻璃中庭透暖橙光（中景唯一一块暖橙）', '仓库推断', '✓'),
    ('auction', '顶光拍卖厅（屋脊玻璃采光长窗）', '仓库推断', '✓'),
    ('glass2088', '2088：合金骨架玻璃连廊 + 中轴全息园灯', '仓库推断', '✓'),
    ('dock', '环形大平台，拍卖夜可停十余辆悬浮车；朝伊甸方向', '仓库推断', '✓'),
    ('gate', '入园结界只认会员身份：桥头会员结界闸', '仓库推断', '✓'),
    ('ward', '结界：只剩细线（格纹极淡）', '仓库推断', '✓'),
    ('nofall', '不设瀑布（§9.3）', '仓库推断', '✓'),
    ('u_cone', '岛底：八角棱面的单根粗钝灰岩锥（棱硬面平、层理层檐）', '仓库推断', '✓'),
    ('u_vault', '锥顶一圈结界保险库的暗色合金环（拍卖厅地下保险库）', '仓库推断', '✓'),
    ('u_core', '一颗核，符文环若隐若现', '仓库推断', '✓'),
]


def SHAPE_FN(th, r):
    """八角近圆：椭圆半径 × 正八边形（直边、顶点在 π/8 + k·π/4）+ 很轻的起伏；两处崖缘岩突"""
    c, s = math.cos(th), math.sin(th)
    re = 1.0 / math.sqrt((c / 165.0) ** 2 + (s / 145.0) ** 2)
    u = ((th + math.pi / 8) % (math.pi / 4)) - math.pi / 8
    k = math.cos(math.pi / 8) / math.cos(u) * (1 + .008 * math.sin(7 * th + .5))
    for a0, amp, wd in ((2.5, .03, .05), (-.4, .025, .04), (1.2, -.02, .04)):
        d = math.atan2(math.sin(th - a0), math.cos(th - a0)); k += amp * math.exp(-(d / wd) ** 2)
    return re * k


def crag(B, x, y, z, r, m, seed, up=1.0):
    rnd = random.Random(seed)
    for q in range(rnd.randint(3, 5)):
        rr = r * rnd.uniform(.45, .9)
        B.sphere(x + rnd.uniform(-r, r) * .6, y + rnd.uniform(-r, r) * .6, z + rr * .25 * up + rnd.uniform(-.3, .5) * r * .3, rr, m,
                 sz=rnd.uniform(.45, .8) * up, sx=rnd.uniform(.8, 1.4), seg=9, rings=6)


def cliff_soil(ctx, B, P, cliff, m_rock, m_soil, soil_d=3.0, dz=1.6, ledge=.03, period=4.0, amp=.02):
    """崖壁：岛缘下 soil_d 米是薄土层，下面灰岩层理 + 层檐（岛缘处不外凸）"""
    ox = ctx.ox; n = len(P); z0s = [ctx.top_z(x, y) for x, y in P]
    nz = max(2, int((max(z0s) + cliff) / dz)); vs = []
    for j in range(nz + 1):
        t = j / nz
        for (x, y), zt in zip(P, z0s):
            z = zt * (1 - t) - cliff * t; s = 1 + (.985 - 1) * t
            if j:
                k = K_.strata_k(x, y, z, ctx.seed, ledge, period, amp); s *= 1 + (k - 1) * min(1.0, (zt - z) / 6.0)
            vs.append((x * s + ox, y * s, z))
    fs, fr = [], []
    for j in range(nz):
        for i in range(n):
            f = (j * n + (i + 1) % n, j * n + i, (j + 1) * n + i, (j + 1) * n + (i + 1) % n)
            (fr if z0s[i] - vs[(j + 1) * n + i][2] > soil_d else fs).append(f)
    B.poly(vs, fr, m_rock, smooth=False); B.poly(vs, fs, m_soil, smooth=True)
    return [(vs[nz * n + i][0] - ox, vs[nz * n + i][1]) for i in range(n)]


def tame_joints(m, big=.01, fine=.15):
    """kit 的节理 Voronoi 太密、像碎地砖：放大节理块，让八个棱面读成大平面"""
    for n in m.node_tree.nodes:
        if n.type == 'TEX_VORONOI':
            sc = n.inputs['Scale'].default_value; n.inputs['Scale'].default_value = big if sc < .2 else fine
    return m


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(9)
    mr = ctx.m('rock', lambda: tame_joints(K_.rock_v17('l9_rock17', ROCK, ROCK2, .03, moss=(.26, .32, .14), moss_amt=.35, soil_z=400.0, lichen=(.72, .72, .66))))
    md = ctx.m('rockd', lambda: tame_joints(K_.rock_v17('l9_rock17d', (.4, .4, .39), (.29, .29, .29), .03, moss=(.22, .28, .12), moss_amt=.2, soil_z=400.0, lichen=(.55, .55, .52))))
    ms = ctx.m('soil', lambda: K_.rock_v17('l9_soil17', (.3, .22, .14), (.18, .13, .08), .05, moss=(.3, .3, .12), moss_amt=.5, soil_z=400.0))
    mv = ctx.m('vault', lambda: C.flat('l9_vault', (.09, .085, .08), .55, metal=.7))
    ml = ctx.m('lamp', lambda: C.glow('l9_lamp', c=(1.0, .68, .36), estr=5))
    mg = ctx.m('core', lambda: C.glow('l9_core', c=(.62, .88, 1.0), estr=2.2))
    mring = ctx.m('ring', lambda: C.glow('l9_ring', c=(.62, .88, 1.0), estr=1.3, alpha=.6))
    mroot = ctx.m('root', lambda: C.flat('l9_root', (.2, .15, .1), .9, noise=.5))
    P = S.pts(192); cliff = 18
    P1 = cliff_soil(ctx, B, P, cliff, mr, ms, soil_d=3.5, dz=1.5, ledge=.035, period=4.2, amp=.012)
    # 粗钝锥：八角棱面（同一八角轮廓按比例收分，棱硬面平），平钝的底；上段浅、下段暗
    prof = [(.93, .05), (.82, .16), (.68, .3), (.54, .44), (.4, .57), (.3, .66), (.24, .7)]
    rings, _ = K_.body_v17(ctx, P1, prof, cliff, dz=3.2, ledge=.025, period=9.0, amp=0.0, lo=(0.0, .02))
    h = len(rings) // 2
    K_.loft(B, rings[:h + 1], mr, smooth=False); K_.loft(B, rings[h:], md, cap=True, smooth=False)
    # 八条棱线上的碎岩块（强调棱）
    for k in range(8):
        a = math.pi / 8 + k * math.tau / 8
        for q in range(3):
            zq = -cliff - rnd.uniform(.1, .7) * R; pr = K_.ring_at(rings, zq)
            i = int(((a % math.tau) / math.tau) * len(pr)) % len(pr); x, y = pr[i]
            B.sphere(x, y, zq, R * rnd.uniform(.015, .03), md, sz=.7, seg=7, rings=5)
    zq = -cliff - .35 * R; pr = K_.ring_at(rings, zq); ctx.anchor('u_cone', *pr[int(len(pr) * .7)], zq)
    zq = -cliff - .6 * R; pr = K_.ring_at(rings, zq); ctx.anchor('u_cone', *pr[int(len(pr) * .78)], zq)
    # 锥顶保险库合金环：略外凸的暗色合金带 + 上下两道檐 + 暖光灯点（环下是「拍卖厅地下保险库」）
    z = -cliff - .07 * R; pts = K_.ring_at(rings, z); r1 = [((x - ox) * 1.035 + ox, y * 1.035) for x, y in pts]
    K_.loft(B, [(r1, z + .03 * R), (r1, z - .03 * R)], mv, smooth=False)
    for dzr in (.03, -.03): K_.band(B, pts, z + dzr * R, R * .006, mv, 1.05, ox)
    for k in range(0, len(r1), 24): x, y = r1[k]; B.box(x - R * .004, x + R * .004, y - R * .004, y + R * .004, z - R * .005, z + R * .005, ml)
    ctx.anchor('u_vault', *r1[int(len(r1) * .72)], z)
    # 一颗核（半嵌在下段岩面）+ 一道暗淡虚线符文环（若隐若现）
    z2 = -cliff - .45 * R; p2 = K_.ring_at(rings, z2); x, y = p2[int(len(p2) * .79)]
    K_.glow_orb(B, (x - ox) * .985 + ox, y * .985, z2, R * .03, mg); ctx.anchor('u_core', x, y, z2)
    ringp = [((x - ox) * 1.12 + ox, y * 1.12) for x, y in K_.ring_at(rings, z2 - .03 * R)]
    C.rune_ring(B, ringp, z2 - .03 * R, R * .007, mring, dash=3)
    # 灰岩：垂根很少（设定无垂根），崖缘只有稀疏短根
    K_.hanging(ctx, B, P, 140, (3, 9), mroot, rnd, r=(.2, .4))


# ============================================================ 岛面
def autumn_tree(B, M, x, y, z, h, r, seed):
    rnd = random.Random(seed); leaves = M['aut']
    B.tube([(x, y, z - .2), (x + rnd.uniform(-.4, .4), y + rnd.uniform(-.4, .4), z + h * .5)], .22, C.tree_mats()['bark'], n=6)
    pal = leaves[rnd.randrange(len(leaves))]
    for q in range(rnd.randint(3, 4)):
        a = rnd.uniform(0, math.tau); d = r * rnd.uniform(.15, .45)
        cr = r * rnd.uniform(.55, .75)
        C._cards(B, rnd, (x + d * math.cos(a), y + d * math.sin(a), z + h * rnd.uniform(.6, .8)), (cr, cr, cr * .7), 45, .5 * max(1.0, r / 4), pal, shell=.6)


def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R
    M['autumn_g'] = K_.ground_v17('l9_litter17', [(.52, .4, .2), (.44, .42, .2), (.6, .36, .16)], dry=(.6, .46, .26), soil=(.36, .26, .16),
                                  rock=(.58, .56, .52), dots=[(.78, .36, .12), (.82, .6, .2)], dot_dens=.3, dot_scale=.9)
    M['meadow'] = K_.ground_v17('l9_meadow17', [(.46, .48, .24), (.56, .5, .28), (.4, .44, .2)], dry=(.62, .54, .34), soil=(.36, .26, .16),
                                rock=(.58, .56, .52), dots=[(.8, .5, .2)], dot_dens=.12)
    M['lawn'] = K_.ground_v17('l9_lawn17', [(.3, .44, .16), (.34, .47, .18)], dry=(.5, .5, .3), stripe=((.33, .47, .18), (.28, .42, .15), 4.0), slope_rock=False)
    M['bank'] = K_.ground_v17('l9_bank17', [(.5, .42, .24), (.42, .42, .22)], dry=(.6, .5, .3), soil=(.34, .25, .16), rock=(.56, .54, .5))
    M['cream'] = C.ashlar('l9_cream', c=(.78, .66, .48), course=.6, block=1.4)
    M['cream_rust'] = C.ashlar('l9_cream_rust', c=(.8, .72, .56), course=1.0, block=2.0, joint=.03)
    M['terracotta'] = C.flat('l9_terracotta', (.5, .17, .07), .7, noise=.35)
    M['gravel_l'] = C.flat('l9_gravel', (.86, .82, .72), .9, noise=.35)
    M['warm'] = C.glow('l9_warm', c=(1.0, .56, .22), estr=6.0)
    M['warm_s'] = C.glow('l9_warm_s', c=(1.0, .72, .42), estr=3.0)
    M['atrium_glass'] = C.glow('l9_atrium_glass', c=(1.0, .5, .18), estr=4.5, alpha=.8)
    M['bed_aut'] = C.flat('l9_bed_aut', (.6, .28, .1), .9, noise=.4)
    M['orb'] = C.glow('l9_orb', c=(1.0, .86, .66), estr=5.0)
    M['lemon'] = C.flat('l9_lemon', (.95, .78, .12), .5)
    M['pot'] = C.flat('l9_pot', (.62, .32, .18), .8, noise=.3)
    M['gate'] = C.glow('l9_gate', c=(.62, .9, 1.0), estr=2.2, alpha=.45)
    M['crag'] = K_.rock_v17('l9_crag17', ROCK, ROCK2, .2, moss=(.3, .34, .14), moss_amt=.4, soil_z=400.0, lichen=(.78, .76, .7))
    M['ward'] = K_.hex_ward('l9_ward17', cell=10.0, alpha=.2, estr=1.4, rim=.04)
    M['aut'] = [[C.flat('l9_leaf_red', (.62, .12, .04), .75, noise=.3), C.flat('l9_leaf_org', (.85, .34, .06), .75, noise=.3)],
                [C.flat('l9_leaf_och', (.8, .56, .12), .75, noise=.3), C.flat('l9_leaf_org2', (.9, .44, .1), .75, noise=.3)],
                [C.flat('l9_leaf_rust', (.5, .18, .06), .75, noise=.3), C.flat('l9_leaf_och2', (.72, .48, .1), .75, noise=.3)],
                [C.flat('l9_leaf_late', (.36, .34, .1), .75, noise=.3), C.flat('l9_leaf_och3', (.76, .5, .14), .75, noise=.3)]]
    ex, ey = S.edge(DOCK_ANG, .9)
    tr = K_.Terrain(S, steps=dict(axis_deg=90, cuts=list(CUTS), levels=list(LEVELS), span=SPAN), noise=(.4, 30), rough=(1.4, 24), brow=(7, 2.6), ground='autumn_g',
                    mounds=[dict(at=(-105, 60), r=34, h=14.0), dict(at=(100, 70), r=30, h=12.0), dict(at=(125, -15), r=22, h=8.0), dict(at=(-125, -20), r=24, h=9.0),
                            dict(at=(-90, -95), r=22, h=-5.0), dict(at=(20, 125), r=24, h=6.0), dict(at=(-40, 128), r=16, h=-3.5), dict(at=(95, -85), r=18, h=-3.5)],
                    ridges=[dict(pts=[(-140, 20), (-120, 60), (-95, 92)], w=12, h=9.0), dict(pts=[(118, 40), (132, 0)], w=10, h=7.0)])
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    L2 = LEVELS[2]
    tr.flats += [(-SPAN + 3, SPAN - 3, -140, CUTS[0] - 2.5, LEVELS[0], 2), (-SPAN + 3, SPAN - 3, CUTS[0] + 2.5, CUTS[1] - 2.5, LEVELS[1], 2), (-SPAN + 3, SPAN - 3, CUTS[1] + 2.5, 12, L2, 2),
                 (-48, 48, 12, 78, L2, 8), (-30, 30, 84, 120, L2, 7), (ex - 14, ex + 14, ey - 14, ey + 14, tr.h(ex, ey), 6)]
    garden = lambda x, y: abs(x) < SPAN and y < 12 and S.frac(x, y) < .9
    tr.fn(lambda x, y: MN.noise(Vector((x * .025, y * .025, 4.4))) > .3, 'meadow')
    tr.fn(garden, 'lawn')
    tr.fn(lambda x, y: abs(x) < SPAN + 12 and y < 12 and not garden(x, y) and S.frac(x, y) < .9, 'bank')
    tr.rect(-52, 52, 10, 80, 'gravel_l'); tr.rect(-34, 34, 80, 124, 'gravel_l')
    for yc in CUTS: tr.rect(-SPAN, SPAN, yc - 1, yc + 7, 'gravel_l')       # 挡墙下园路
    tr.path([(0, -S.ry), (0, 12)], 7.0, 'gravel_l')
    tr.path([(-30, -40), (-SPAN, -40)], 3.5, 'gravel_l'); tr.path([(30, -40), (SPAN, -40)], 3.5, 'gravel_l')
    tr.path([(48, 30), (ex * .95, ey * .95)], 6.0, 'gravel_l')
    tr.path([(-50, 60), (-95, 40), (-128, 0)], 2.4, 'bank'); tr.path([(30, 110), (80, 110), (110, 70)], 2.4, 'bank')
    tr.build(ctx.B('terrain'), M)
    stone = M['cream_rust']
    tr.walls(ctx.B('walls'), stone, h_over=1.0)
    GB = ctx.B('garden'); RK = ctx.B('crags'); Lb = ctx.B('lamps')
    # 挡墙顶栏杆（中轴留口）+ 中轴双跑石阶
    for i, yc in enumerate(CUTS):
        zt = LEVELS[i + 1] + 1.0
        for xs in ((-SPAN + 1, -6.5), (6.5, SPAN - 1)):
            K.balustrade([(xs[0], yc + .8), (xs[1], yc + .8)], zt - 1.0 + .95)
        z0, z1 = LEVELS[i], LEVELS[i + 1]; n = 10
        for k in range(n):
            y0 = yc - 12 + k * 12 / n; GB.box(-6, 6, y0, y0 + 12 / n + .05, z0 - 1, z0 + (z1 - z0) * (k + 1) / n, M['stone_pale'])
        for sx in (-1, 1): GB.box(min(sx * 6, sx * 6.8), max(sx * 6, sx * 6.8), yc - 12, yc + .5, z0 - 1, z1 + 1.0, stone)
    # 下层台：一对花坛 + 圆喷泉；中层台：草坪板 + 柠檬盆；台缘柱形柏
    for sx in (-1, 1):
        K_.placed(lambda: K.parterre(min(sx * 12, sx * 50), max(sx * 12, sx * 50), -95, -60, bed=M['bed_aut']), 0, 0, LEVELS[0] + .15)
    K_.placed(lambda: K.fountain(0, -76, 6.5), 0, 0, LEVELS[0] + .1)
    for sx in (-1, 1):
        for q in range(6):
            x = sx * (16 + q * 7.5)
            for y in (-38, -20):
                z = tr.h(x, y); GB.cyl(x, y, z, .9, 1.0, M['pot'], 12, r2=1.1)
                GB.sphere(x, y, z + 2.0, 1.2, M['hedge'], seg=10, rings=6)
                for c in range(4): GB.sphere(x + .9 * math.cos(c * 1.6), y + .9 * math.sin(c * 1.6), z + 2.0 + .3 * (c % 2), .22, M['lemon'], seg=6, rings=4)
    for sx in (-1, 1):
        for q in range(9):
            y = -100 + q * 12
            x = sx * (SPAN - 3);
            if S.frac(x, y) < .9: C.tree(K.T, x, y, 9.0, 1.2, 'yew_col', seed=300 + q * 3 + sx, z=tr.h(x, y) - .1)
    for sx in (-1, 1):
        for q in range(5): y = 16 + q * 12; C.tree(K.T, sx * 56, y, 9.5, 1.2, 'yew_col', seed=400 + q * 5 + sx, z=L2 - .1)
    ctx.anchor('garden', -32, -78, tr.h(-32, -78) + 1); ctx.anchor('garden', 30, CUTS[1], LEVELS[2] + 1)
    ctx.anchor('nofall', 0, -S.ry * .97, tr.h(0, -S.ry * .95) - 6)
    # ---- 宫殿式会所：四翼围合，中庭玻璃顶透暖橙光
    def palazzo():
        fh = 5.2; X0, X1, Y0, Y1 = -38.0, 38.0, -20.0, 20.0; CX, CY = 24.0, 8.0
        tops = []
        for (a, b, c, d, sk) in ((X0, X1, Y0, -CY, 'n'), (X0, X1, CY, Y1, 's'), (X0, -CX, -CY, CY, 'ns'), (CX, X1, -CY, CY, 'ns')):
            tops.append(K.block(a, b, c, d, 3, fh, M['cream'], bay=4.0, win=(1.5, 2.6), skip=sk))
        t_ = max(tops)
        K.W.box(X0 - 1.6, X1 + 1.6, Y0 - 1.6, Y0 + 1.0, t_ - .9, t_ + .2, M['trim'])            # 厚檐口（宫殿檐口）
        K.W.box(X0 - 1.6, X1 + 1.6, Y1 - 1.0, Y1 + 1.6, t_ - .9, t_ + .2, M['trim'])
        K.W.box(X0 - 1.6, X0 + 1.0, Y0, Y1, t_ - .9, t_ + .2, M['trim']); K.W.box(X1 - 1.0, X1 + 1.6, Y0, Y1, t_ - .9, t_ + .2, M['trim'])
        K.W.box(X0 - .3, X1 + .3, Y0 - .3, Y1 + .3, 0, 5.0, M['cream_rust'])                    # 粗面石首层
        for (a, b, c, d) in ((X0, X1, Y0, -CY), (X0, X1, CY, Y1), (X0, -CX, -CY, CY), (CX, X1, -CY, CY)):
            K.hip(a, b, c, d, t_ + .2, 3.2, m=M['terracotta'], over=1.2)
        K.W.box(-CX, CX, -CY, CY, 0, 1.0, M['warm'])                                          # 中庭：暖光地坪 + 暖光内墙 + 玻璃顶
        for (a, b, c, d) in ((-CX, CX, -CY, -CY + .3), (-CX, CX, CY - .3, CY)): K.W.box(a, b, c, d, 1.0, t_ - 1.0, M['warm_s'])
        K.hip(-CX, CX, -CY, CY, t_ + .6, 4.0, m=M['atrium_glass'], over=.2)
        for k in range(13):
            x = -CX + k * 4.0; K.RL.box(x - .12, x + .12, -CY, CY, t_ + .6, t_ + 1.2, M['alloy'])
        K.portico(0, Y0, 16, 5, 9.5, n=6, face=-1)
        for x in (-30, -12, 12, 30): K.chimney(x, 14, t_ + 1.5, 2.2, 1.4, .8, M['cream'])
        return t_
    t_ = K_.placed(palazzo, 0, 42, L2)
    ctx.anchor('palazzo', -34, 26, L2 + 12); ctx.anchor('palazzo', 30, 30, L2 + t_ + 3)
    ctx.anchor('card_league', 20, 22, L2 + 14)
    ctx.anchor('atrium', 0, 42, L2 + t_ + 3)
    # ---- 顶光拍卖厅：单层高厅，红陶顶屋脊一条玻璃采光长窗（下透暖光）
    def auction():
        tt = K.block(-24, 24, -13, 13, 1, 11.0, M['cream'], bay=6.0, win=(2.2, 7.0))
        K.hip(-24, 24, -13, 13, tt, 5.0, m=M['terracotta'], over=1.0)
        K.W.box(-20, 20, -6.5, 6.5, tt - 1.0, tt + 4.0, M['warm'])
        K.W.box(-20.4, 20.4, -6.9, 6.9, tt + 4.0, tt + 6.4, M['atrium_glass'])
        K.R.gable(-20.6, 20.6, -7.1, 7.1, tt + 6.4, 2.2, M['atrium_glass'], along='x')
        for k in range(14): x = -19.5 + k * 3.0; K.RL.box(x - .12, x + .12, -7.1, 7.1, tt + 4.0, tt + 8.6, M['alloy'])
        return tt
    tt = K_.placed(auction, 0, 102, L2)
    ctx.anchor('auction', 0, 102, L2 + tt + 7)
    K_.placed(lambda: K.glass_gallery([(0, 62), (0, 89)], w=6.0, h=5.0), 0, 0, L2)
    for sx in (-1, 1): K_.placed(lambda: K.glass_gallery([(sx * 47, 16), (sx * 47, 66)], w=6.0, h=5.5), 0, 0, L2)
    ctx.anchor('glass2088', -47, 30, L2 + 6)
    ctx.anchor('glass2088', 3, 76, L2 + 5)
    # 中轴全息园灯
    for y in (-100, -86, -66, -44, -28, -2, 4):
        for sx in (-1, 1):
            x = sx * 5.0 if y > -60 and y < -10 else sx * 5.5; z = tr.h(x, y)
            Lb.cyl(x, y, z, .2, 3.0, M['alloy'], 6); Lb.sphere(x, y, z + 3.5, .95, M['orb'], seg=10, rings=6)
    ctx.anchor('glass2088', 5.5, -86, tr.h(5.5, -86) + 3)
    # ---- 秋林：噪声分团、避开园 / 建筑 / 路 / 平台
    rnd = random.Random(90); k = 0
    y = -S.ry
    while y < S.ry:
        x = -S.rx
        while x < S.rx:
            xj, yj = x + rnd.uniform(-2.5, 2.5), y + rnd.uniform(-2.5, 2.5)
            ok = S.frac(xj, yj) < .93 and MN.noise(Vector((xj * .02, yj * .02, 1.9))) > -.2 \
                and not (abs(xj) < SPAN + 10 and yj < 14) and not (-60 < xj < 60 and 4 < yj < 128) \
                and math.hypot(xj - ex, yj - ey) > 34 and K_.seg_dist(xj, yj, [(48, 30), (ex, ey)]) > 7 \
                and K_.seg_dist(xj, yj, [(-50, 60), (-95, 40), (-128, 0)]) > 3 and K_.seg_dist(xj, yj, [(30, 110), (80, 110), (110, 70)]) > 3
            if ok:
                autumn_tree(K.T, M, xj, yj, tr.h(xj, yj) - .2, rnd.uniform(8, 12.5), rnd.uniform(3.4, 5.0), 9000 + k); k += 1
            x += 8.0
        y += 8.0
    print('AUTUMN TREES', k)
    ctx.anchor('autumn', -110, 50, tr.h(-110, 50) + 10); ctx.anchor('autumn', 105, 60, tr.h(105, 60) + 10)
    # ---- 八角岛缘石路缘（让八条直边读得出）
    KB = ctx.B('kerb'); pk = S.pts(480, .975)
    for (xa, ya), (xb, yb) in zip(pk, pk[1:] + pk[:1]):
        if abs(math.atan2(math.sin(math.atan2(ya, xa) - DOCK_ANG), math.cos(math.atan2(ya, xa) - DOCK_ANG))) < .12: continue
        KB.strip([(xa, ya, tr.h(xa, ya) + .1), (xb, yb, tr.h(xb, yb) + .1)], 1.4, .7, M['cream_rust'])
    ctx.anchor('outline', *S.edge(math.pi / 8 * 5, .975), tr.h(*S.edge(math.pi / 8 * 5, .975)) + 1)
    # ---- 岩突
    r3 = random.Random(77)
    for q in range(22):
        a = r3.uniform(0, math.tau); x, y = S.edge(a, r3.uniform(.88, .95))
        if abs(math.atan2(math.sin(a - DOCK_ANG), math.cos(a - DOCK_ANG))) < .2: continue
        crag(RK, x, y, tr.h(x, y) - .8, r3.uniform(2.2, 4.5), M['crag'], 900 + q)
    for (x, y) in ((-128, 30), (-116, 66), (-100, 88), (124, 30), (130, 8), (-90, -95), (60, 130)):
        crag(RK, x, y, tr.h(x, y) - .6, r3.uniform(3.0, 5.5), M['crag'], int(x * 7 + y), up=1.3)
    ctx.anchor('outline', *S.edge(math.pi / 8 * 7, .98), tr.h(*S.edge(math.pi / 8 * 7, .97)) + 2)
    ctx.anchor('outline', *S.edge(-math.pi / 8 * 3, .98), tr.h(*S.edge(-math.pi / 8 * 3, .97)) + 2)
    ctx.anchor('terrain', -118, 58, tr.h(-118, 58) + 3); ctx.anchor('terrain', -90, -95, tr.h(-90, -95))
    # ---- 环形大平台：朝伊甸；十余辆悬浮车绕环停放；桥头会员结界闸
    (px, py), br, z, ang = K_.dock(K, S, tr, (math.cos(DOCK_ANG), math.sin(DOCK_ANG)), 30, cars=1, approach_m=80)
    DKr = ctx.B('dock_ring')
    for rr_ in (10.0, 25.5): DKr.cyl(px, py, z + .02, rr_, .08, M['orb'], 64, r2=rr_, cap=False)
    for q in range(15):
        a = ang + math.pi + (q + .5) * math.tau / 16
        if abs(math.atan2(math.sin(a - ang - math.pi), math.cos(a - ang - math.pi))) < .3: continue
        K_.placed(lambda: K_.car(K), px + math.cos(a) * 18, py + math.sin(a) * 18, z + 1.35, a + math.pi / 2)
    ctx.anchor('dock', px, py, z + 2); ctx.anchor('dock', px + math.cos(ang) * 18, py + math.sin(ang) * 18, z + 2)
    def gate():
        GT = ctx.B('key_gate')
        for s_ in (-1, 1): GT.box(-1.2, 1.2, s_ * 5 - 1, s_ * 5 + 1, 0, 7, M['alloy']); GT.cyl(0, s_ * 5, 7, .9, 1.0, M['holo'], 12)
        GT.tube([(0, -5, 7), (0, -3, 8.6), (0, 0, 9.2), (0, 3, 8.6), (0, 5, 7)], .6, M['alloy'], n=8)
        GT.poly([(0, -4, .2), (0, 4, .2), (0, 4, 7), (0, 0, 8.6), (0, -4, 7)], [(0, 1, 2, 3, 4)], M['gate'])
    gx, gy = S.edge(ang, .9); gz = tr.h(gx, gy)
    K_.placed(gate, gx, gy, gz, ang, 1.7); ctx.anchor('gate', gx, gy, gz + 15)
    WD = ctx.B('ward'); H = .3 * R; K_.ward_dome(S, lambda x, y: tr.h(x * .99, y * .99), H, M['ward'], WD)
    ctx.anchor('ward', -60, -S.ry * .5, H * .85)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
