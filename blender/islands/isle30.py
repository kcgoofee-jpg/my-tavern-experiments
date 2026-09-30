"""罗斯柴尔德庄园 · 悬浮岛 R-02（v17；设定 docs/upper-setting.md §4.2、§8 新月、§9.3 帘瀑、§9.4；清单 docs/upper-islands-checklist.md）。
卡：伊莎贝拉·罗斯柴尔德的居所，军工与以太能源财阀；冬季宴会、品鉴宴凭请柬和结界密钥入场【卡 L47、L179、L376】。
其余：
  岛面 —— 新月，东侧深湾（表里 silhouette depth .72，俯视轮廓同步）；两臂抬成高岩丘（北臂林丘、南臂岩台，脊上露岩），
          西高东低三级水景台地（蜂蜜色石挡墙，高差夸张），中轴长水池池底冷蓝晶板，池端从湾内弧溢成宽帘瀑；
          台地外是起伏的英式园林：洼地里一汪自然池塘、成团雪松 / 橡树、三级路网（金砂车道 > 园路 > 踏径）；
          沃德斯登式府邸在最高台；冬园玻璃宴会厅；崖缘晶簇全区最多；宾客大平台在南臂角尖（湾口）+ 结界密钥闸口；家族私用小平台在西背面。
  岛底 —— 浅蜂蜜色石灰岩（层檐、裂隙、苔、土层）+ 冷蓝导能脉；两臂下各一根外弯獠牙；正中挂「以太储能钟」；湾下悬清水倒锥；4 核。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C
from mathutils import Vector, noise as MN

ID, NAME = 'isle30', '罗斯柴尔德庄园'
ROCK, ROCK2, VEIN = (.78, .64, .44), (.52, .4, .26), dict(c=(.12, .5, 1.0), e=4.0, density=.45)
CAM_DROP, CAM_DIST = .5, 5.3
UCAM_AZ = -75
CAM_AZ = -45      # v17：从东南 45° 看（湾口朝东，正南视角里湾是侧面、读不出新月；俯角仍 35°）
BOARD_TITLE = '罗斯柴尔德庄园 · 悬浮岛 R-02 —— v17 设定对照'
L_TOP, L_MID, L_LOW = 30.0, 16.0, 3.0
CUTS = (-78.0, -14.0)
ITEMS = [
    ('card_home', '伊莎贝拉·罗斯柴尔德的居所（军工与以太能源财阀）', '', '✓'),
    ('roots', '岛缘土层下垂根 / 苔（仰视里偏细）', '', '弱'),
    ('card_key', '宴会凭请柬和结界密钥入场 → 宾客平台的结界密钥闸口', '', '✓'),
    ('bay', '轮廓：新月形，东侧深湾，湾口朝东', '', '✓'),
    ('terrain', '两臂岩丘（北林丘 / 南岩台）+ 三级水景台地 + 蜂蜜色石挡墙', '', '✓'),
    ('water', '中轴长水池（冷蓝晶板池底）→ 湾内弧宽帘瀑', '', '✓'),
    ('pond', '园林洼地的自然池塘', '', '✓'),
    ('garden', '对称黄杨花坛 + 冬季深红花床；雪松橡树成团', '', '✓'),
    ('paths', '路网三级：金砂车道 > 园路 > 踏径', '', '✓'),
    ('chateau', '沃德斯登式蜂蜜色石府邸（陡石板顶、圆塔尖顶）', '', '✓'),
    ('winter', '2088：冬园玻璃宴会厅 + 全息园灯', '', '✓'),
    ('crystal', '崖缘晶簇全区最多', '', '✓'),
    ('dock', '湾口宾客大平台 + 最长进场光带', '', '✓'),
    ('dock_private', '岛背面家族私用小平台', '', '✓'),
    ('ward', '结界：扁穹六角格反光（中档）', '', '弱'),
    ('u_rock', '岛底：浅蜂蜜色石灰岩层理 + 冷蓝导能脉密布', '', '✓'),
    ('u_tusk', '新月两臂下双獠牙', '', '✓'),
    ('u_bell', '以太储能钟（巨晶 + 合金笼架）', '', '✓'),
    ('u_wcone', '湾下清水倒锥', '', '✓'),
    ('u_core', '岛底 4 颗核、冷蓝最亮', '', '✓'),
]


# ============================================================ 岛底
def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(30)
    mr = ctx.m('rock', lambda: K_.rock_v17('r30_rock', ROCK, ROCK2, .045, VEIN, moss=(.24, .32, .12), moss_amt=.45, soil_z=-6.0))
    mb = ctx.m('band', lambda: K_.rock_v17('r30_band', ROCK, ROCK2, .07, VEIN, moss=(.22, .3, .1), moss_amt=.7, soil_z=-7.0))
    mg = ctx.m('core', lambda: C.glow('r30_core', c=(.45, .8, 1.0), estr=7))
    mring = ctx.m('ring', lambda: C.glow('r30_ring', c=(.45, .8, 1.0), estr=2.5))
    mcry = ctx.m('cry', lambda: C.flat('r30_cry', (.3, .6, .9), .06, emit=(.35, .72, 1.0), estr=1.1))
    mcage = ctx.m('cage', lambda: C.flat('r30_cage', (.74, .76, .8), .25, metal=1.0))
    mbell = ctx.m('bell', lambda: C.flat('r30_bell', (.55, .85, 1.0), .05, emit=(.45, .8, 1.0), estr=8.0))
    mwat = ctx.m('wcone', lambda: C.glass('r30_water', tint=(.3, .55, .62), rough=.03))
    mroot = ctx.m('root', lambda: C.flat('r30_root', (.2, .14, .09), .9, noise=.4))
    P = S.pts(288); cliff = 30
    K_.cliff_v17(ctx, B, P, cliff, mb, dz=1.5, ledge=.03, period=3.5, amp=.02, spur=.05)
    rings, apex = K_.body_v17(ctx, [(x * .985, y * .985) for x, y in P], [(.88, .08), (.72, .16), (.52, .24), (.28, .3), (0, .34)], cliff,
                              dz=2.5, ledge=.04, period=6.0, amp=.03)
    K_.loft(B, rings, mr, apex=apex)
    for (u, v, r, d, sd) in ((.38, .62, .26, 1.3, 1), (.38, -.62, .24, 1.12, 2)):   # 獠牙：臂根外弯，北长南短
        x, y = u * S.rx + ox, v * S.ry; a = math.atan2(v * S.ry, u * S.rx)
        K_.cone(B, x, y, -cliff - R * .05, r * R, d * R, mr, seed=sd, bend=(math.cos(a) * R * .16, math.sin(a) * R * .16), rough=.22, n=40, nr=60, ledge=.07)
        ctx.anchor('u_tusk', x + math.cos(a) * R * .1, y + math.sin(a) * R * .1 - r * R * .45, -cliff - R * .5)
    K_.cone(B, -.45 * S.rx + ox, .1 * S.ry, -cliff - R * .05, .2 * R, .6 * R, mr, seed=3, n=36, nr=40, ledge=.07)
    for zq, fq in ((-cliff - .06 * R, .66), (-cliff - .02 * R, .78)):
        x, y = K_.ring_at(rings, zq)[int(len(P) * fq)]; ctx.anchor('u_rock', x, y, zq)
    # 以太储能钟
    bx, by, zb, r = -.06 * S.rx + ox, 0.0, -cliff - .52 * R, .13 * R
    top_, bot_ = zb + r * 1.3, zb - r * 1.7
    hexr = [(bx + math.cos(k * math.tau / 6) * r * .75, by + math.sin(k * math.tau / 6) * r * .75) for k in range(6)]
    B.poly([(x, y, zb) for x, y in hexr] + [(bx, by, top_), (bx, by, bot_)], [(k, (k + 1) % 6, 6) for k in range(6)] + [((k + 1) % 6, k, 7) for k in range(6)], mbell)
    for k in range(8):
        a = k * math.tau / 8
        B.tube([(bx + math.cos(a) * r * .5, by + math.sin(a) * r * .5, top_ + r * .3), (bx + math.cos(a) * r * 1.05, by + math.sin(a) * r * 1.05, zb + r * .3),
                (bx + math.cos(a) * r, by + math.sin(a) * r, zb - r * .6), (bx + math.cos(a) * r * .3, by + math.sin(a) * r * .3, bot_ - r * .15)], r * .035, mcage, n=6)
    for zz, rr in ((zb + r * .3, r * 1.05), (zb - r * .6, r), (top_ + r * .3, r * .5)): B.cyl(bx, by, zz, rr, r * .05, mcage, 48, r2=rr, cap=False)
    for k in range(3):
        a = k * math.tau / 3 + .3; B.tube([(bx + math.cos(a) * r * .45, by + math.sin(a) * r * .45, top_ + r * .3), (bx + math.cos(a) * r * 1.1, by + math.sin(a) * r * 1.1, -cliff - R * .2)], r * .045, mcage, n=6)
    ctx.anchor('u_bell', bx, by - r, zb - r * .3)
    # 湾下清水倒锥：挂在湾内弧下（深湾后湾底在 x≈54）
    x, y, z = .05 * S.rx + ox, -.3 * S.ry, -cliff - .16 * R
    B.cyl(x, y, z - .42 * R, .002 * R, .42 * R, mwat, 32, r2=.1 * R)
    B.cyl(x, y, z, .108 * R, R * .012, mring, 48, r2=.108 * R, cap=False)
    ctx.anchor('u_wcone', x, y - .05 * R, z - .2 * R)
    # 4 核
    for (u, v, d, rr) in ((.38, .62, .45, .26), (.38, -.62, .42, .24)):
        x, y = u * S.rx + ox, v * S.ry; zc = -cliff - d * R; t = (d - .05) / 1.2; rk = rr * R * (1 - t) ** .75
        K_.glow_orb(B, x + .26 * rk, y - .97 * rk, zc, R * .05, mg); ctx.anchor('u_core', x + .26 * rk, y - .97 * rk, zc)
        for q in range(2): B.cyl(x + R * .16 * t * t * math.cos(math.atan2(v, u)), y, zc - q * R * .035, rk * (1.22 + .1 * q), R * .006, mring, 48, cap=False)
    K_.glow_orb(B, -.45 * S.rx + ox + .26 * R * .1, .1 * S.ry - .97 * R * .12, -cliff - .25 * R, R * .045, mg)
    pts = K_.ring_at(rings, -cliff - .14 * R); K_.band(B, pts, -cliff - .14 * R, R * .014, mring, 1.03, ox); K_.band(B, pts, -cliff - .18 * R, R * .01, mring, 1.0, ox)
    x, y = pts[int(len(pts) * .72)]; K_.glow_orb(B, x, y, -cliff - .16 * R, R * .05, mg); ctx.anchor('u_core', x, y, -cliff - .16 * R)
    K_.crystals_down(B, rings, R, 40, mcry, rnd, cliff=cliff)
    # 垂根 + 崖缘土下的根须（深褐细）
    K_.hanging(ctx, B, P, 420, (6, 26), mroot, rnd, r=(.2, .5))
    mmoss = ctx.m('moss', lambda: C.flat('r30_moss', (.2, .3, .1), .95, noise=.5))
    K_.hanging(ctx, B, P, 140, (3, 9), mmoss, rnd, r=(.5, .9))
    for fq in (.62, .7, .8): x, y = P[int(len(P) * fq)]; ctx.anchor('roots', x * .99 + ox, y * .99, ctx.top_z(x, y) - 8)


# ============================================================ 岛面
def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R; rnd = random.Random(31)
    M['park'] = K_.ground_v17('r30_park', [(.14, .22, .07), (.3, .34, .12), (.22, .3, .1)], dry=(.52, .46, .27), soil=(.3, .23, .15), rock=ROCK,
                              dots=[(.62, .08, .1), (.9, .88, .8)], dot_dens=.05, dot_scale=.35)
    M['lawn_stripe'] = K_.ground_v17('r30_lawn', [(.2, .33, .1), (.23, .37, .12), (.26, .4, .13)], dry=(.3, .4, .15), stripe=((.18, .32, .09), (.3, .45, .15), 5.0), slope_rock=False)
    M['woodland'] = K_.ground_v17('r30_wood', [(.12, .14, .06), (.2, .16, .08), (.16, .2, .08)], dry=(.36, .24, .12), soil=(.22, .15, .09), rock=ROCK)
    M['rock_top'] = K_.rock_v17('r30_rocktop', ROCK, ROCK2, .25, moss=(.3, .36, .14), moss_amt=.5, soil_z=999.0)
    M['gravel_gold'] = K_.ground_v17('r30_gravel', [(.8, .7, .5), (.84, .74, .54), (.76, .66, .47)], dry=(.72, .62, .44), soil=(.6, .5, .36), slope_rock=False)
    M['path_foot'] = K_.ground_v17('r30_foot', [(.55, .47, .34), (.5, .44, .3), (.6, .52, .38)], dry=(.5, .46, .32), slope_rock=False)
    M['meadow'] = K_.ground_v17('r30_meadow', [(.42, .4, .2), (.5, .44, .24), (.34, .36, .16)], dry=(.62, .52, .32), soil=(.34, .26, .16), rock=ROCK,
                                dots=[(.62, .1, .12), (.92, .9, .84)], dot_dens=.09, dot_scale=.5)
    M['crys_floor'] = C.flat('r30_crysfloor', (.05, .3, .75), .05, emit=(.1, .45, 1.0), estr=2.2, coat=1.0)
    M['crystal'] = C.flat('r30_rimcry', (.3, .6, .9), .06, emit=(.35, .72, 1.0), estr=1.1)
    M['gate'] = C.hex_ward_mat('r30_gate', scale=.6, alpha=.9, estr=7.0)
    M['pondw'] = C.flat('r30_pond', (.06, .16, .2), .04, coat=1.0)
    M['ward'] = K_.hex_ward('r30_ward', cell=9.0, alpha=.4, estr=2.2, rim=.16)
    xe = S.rad(0.0) - 3
    arms_n = [(-60, 150), (10, 150), (70, 130), (110, 112)]; arms_s = [(-60, -150), (10, -150), (72, -128), (110, -110)]
    tr = K_.Terrain(S, steps=dict(axis_deg=0, cuts=list(CUTS), levels=[L_TOP, L_MID, L_LOW], span=60),
                    mounds=[dict(at=[70, 130], r=48, h=52), dict(at=[72, -128], r=44, h=36), dict(at=[-95, 128], r=26, h=-7),
                            dict(at=[-150, 110], r=40, h=8), dict(at=[-150, -110], r=40, h=6), dict(at=[-20, 120], r=30, h=6), dict(at=[-20, -120], r=30, h=5)],
                    noise=(3.0, 50), rough=(1.1, 16), ridges=[dict(pts=arms_n, w=26, h=14), dict(pts=arms_s, w=24, h=10)], brow=(9, 3.0), ground='park')
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    tr.flats += [(-170, -80, -52, 52, L_TOP, 8), (-150, -110, 56, 98, L_TOP, 8)]
    tr.flats += [(-104, -84, -9, 9, L_TOP - 1.8, 1.0), (-72, -20, -9, 9, L_MID - 1.2, 1.0), (-8, xe + 3, -9, 9, L_LOW - 1.8, 1.0)]   # 池坑
    tr.flats += [(-106, -82, 10, 50, L_TOP, 3), (-106, -82, -50, -10, L_TOP, 3), (-74, -18, 10, 56, L_MID, 3), (-74, -18, -56, -10, L_MID, 3), (-10, 40, 10, 44, L_LOW, 3), (-10, 40, -44, -10, L_LOW, 3)]
    tr.fn(lambda x, y: S.frac(x, y) > .78 + .08 * MN.noise(Vector((x * .03, y * .03, 7.0))) or (x > 20 and abs(y) > 70), 'meadow')
    tr.fn(lambda x, y: math.hypot(x - 70, y - 130) < 40 or K_.seg_dist(x, y, arms_n) < 14, 'woodland')
    tr.fn(lambda x, y: math.hypot(x - 72, y + 128) < 34, 'rock_top')
    tr.fn(lambda x, y: -106 <= x <= xe and abs(y) <= 58 and abs(y) >= 10, 'lawn_stripe')
    drive = [(-110, -44), (-80, -80), (-30, -104), (40, -104), S.edge(math.radians(-45), .9)]
    tr.path(drive, 8, 'gravel_gold'); tr.rect(-106, -82, -9, 9, 'gravel_gold')
    tr.rect(-80, xe, 9, 12, 'gravel_gold'); tr.rect(-80, xe, -12, -9, 'gravel_gold')           # 池边步道
    tr.ell(-116, -48, 20, 14, 'gravel_gold')
    back = [(-170, 0), S.edge(math.pi + .17, .95)]; tr.path(back, 5, 'gravel_gold')
    sec = [[(-106, 50), (-80, 80), (-40, 96), (0, 112), (40, 104)], [(-70, -56), (-60, -90)], [(-110, 52), (-110, 60)], [(-40, 58), (-40, 96)]]
    for p in sec: tr.path(p, 3.6, 'gravel_gold')
    foot = [[(-80, 80), (-95, 110), (-110, 140)], [(0, 112), (30, 140), (60, 150)], [(40, -104), (55, -128), (80, -140)], [(-150, 60), (-160, 120)], [(-150, -52), (-150, -120)]]
    for p in foot: tr.path(p, 1.6, 'path_foot')
    B = ctx.B('terrain'); tr.build(B, M, step=1.2); tr.walls(ctx.B('walls'), M['stone'], 2.0)
    G = ctx.B('garden'); W = ctx.B('water'); L = ctx.B('lamps')
    ctx.anchor('paths', -30, -104, tr.h(-30, -104)); ctx.anchor('paths', -40, 90, tr.h(-40, 90)); ctx.anchor('paths', 30, 140, tr.h(30, 140))
    ctx.anchor('terrain', -78, 40, L_TOP); ctx.anchor('terrain', 70, 130, tr.h(70, 130) + 12); ctx.anchor('terrain', 72, -128, tr.h(72, -128))
    ctx.anchor('bay', xe + 20, 30, L_LOW - 10); ctx.anchor('bay', 112, 112, tr.h(110, 110))
    # 自然池塘：西北洼地
    pz = min(tr.h(-95 + dx, 128 + dy) for dx in (-6, 0, 6) for dy in (-6, 0, 6)) + .6
    W.poly([(-95 + math.cos(a) * 21 * (1 + .12 * math.sin(3 * a)), 128 + math.sin(a) * 15 * (1 + .1 * math.cos(2 * a)), pz) for a in (k * math.tau / 48 for k in range(48))], [tuple(range(48))], M['pondw'])
    ctx.anchor('pond', -95, 128, pz)
    # 长水池
    for (x0, x1, lv) in ((-104, -84, L_TOP), (-72, -20, L_MID), (-8, xe, L_LOW)):
        end = x1 >= xe
        G.box(x0 - 1.5, x1 + (0 if end else 1.5), -10.5, 10.5, lv - 2.0, lv - .3, M['stone_pale'])
        for (a_, b_, c_, d_) in ((x0 - 1.5, x1 + 1.5, -10.5, -9), (x0 - 1.5, x1 + 1.5, 9, 10.5), (x0 - 1.5, x0, -8, 8)) + (() if end else ((x1, x1 + 1.5, -8, 8),)):
            G.box(a_, b_, c_, d_, lv - .3, lv + .45, M['stone_pale'])
        W.box(x0, x1 + (1.5 if end else 0), -9, 9, lv - .5, lv - .1, M['crys_floor'])
        W.box(x0, x1 + (1.5 if end else 0), -9, 9, lv - .1, lv + .05, M['water_clear'])
        for k in range(int((x1 - x0) / 4)): W.box(x0 + k * 4, x0 + k * 4 + .25, -9, 9, lv - .1, lv - .06, M['alloy'])
        for k in range(int((x1 - x0) / 7) + 1):
            for sy in (-1, 1): L.cyl(x0 + k * 7, sy * 12, lv + .3, .14, 3.0, M['holo'], 6); L.sphere(x0 + k * 7, sy * 12, lv + 3.6, .45, M['holo'], seg=8, rings=4)
    ctx.anchor('water', -46, 0, L_MID); ctx.anchor('winter', -30, 12, L_MID + 3)
    mf = C.flat('r30_foam', (.92, .96, 1.0), .3, emit=(.8, .9, 1.0), estr=.6)
    for (xa, za, zb) in ((-84, L_TOP, L_MID), (-20, L_MID, L_LOW)): K_.cascade(W, xa, -8, 8, za + .1, zb - .1, mf, mf)
    # 帘瀑：池端溢到湾内弧，沿整段内弧（北侧内壁正对相机）铺开；湾沿一道溢水石槽把水引过去
    K_.curtain_arc(S, tr.h, math.radians(-26), math.radians(38), R * 1.0, 2.2, .95, name='r30_curtain', n=56)
    K_.curtain_arc(S, tr.h, math.radians(-10), math.radians(24), R * .35, 3.2, .4, name='r30_curtain_blue', n=30, seed=4)
    mfoam = C.flat('r30_lip', (.95, .97, 1.0), .4, emit=(.85, .92, 1.0), estr=1.2)
    for a in range(-26, 39, 2):
        x, y = S.edge(math.radians(a), 1.0); W.sphere(x, y, tr.h(x * .99, y * .99) - .8, 2.2, mfoam, sz=.5, seg=8, rings=4)
    arc = [S.edge(math.radians(a), .965) for a in range(-26, 39, 3)]
    for (ax, ay), (bx, by) in zip(arc, arc[1:]):
        W.strip([(ax, ay, tr.h(ax, ay) + .2), (bx, by, tr.h(bx, by) + .2)], 4.0, .3, M['stone_pale']); W.strip([(ax, ay, tr.h(ax, ay) + .45), (bx, by, tr.h(bx, by) + .45)], 2.6, .1, M['crys_floor'])
    for a in (8, 26): x, y = S.edge(math.radians(a), 1.0); ctx.anchor('water', x + 4, y, tr.h(x, y) - 45)
    # 规整花坛 + 紫杉柱列
    for (x0, x1, lv) in ((-104, -84, L_TOP), (-72, -20, L_MID), (-8, xe - 10, L_LOW)):
        w = x1 - x0; nb = max(1, int(w / 19))
        for k in range(nb):
            a = x0 + k * w / nb + 1; b = a + w / nb - 2
            for (y0, y1) in ((14, 36), (-36, -14)): K_.placed(lambda a=a, b=b, y0=y0, y1=y1: K.parterre(a, b, y0, y1), 0, 0, lv + .05)
        for sy in (-1, 1):
            for k in range(int(w / 6)): C.tree(K.T, x0 + 3 + k * 6, sy * 40, 5.5, .8, 'yew_col', seed=900 + k + int(x0) + sy * 50, z=lv)
    ctx.anchor('garden', -46, 25, L_MID); ctx.anchor('garden', 40, 118, tr.h(40, 118) + 10)
    # 府邸（本地朝南建，转 90° 正立面朝东）
    def chateau():
        X0, X1, Y0, Y1 = -32.0, 32.0, -9.0, 9.0
        t_ = K.block(X0, X1, Y0, Y1, 3, 4.8, M['stone'], bay=3.4)
        K.hip(X0, X1, Y0, Y1, t_, 10.0); K.dormers(X0 + 5, X1 - 5, Y0, t_ + 1.2, 10, -1); K.dormers(X0 + 5, X1 - 5, Y1, t_ + 1.2, 10, 1)
        for x in (-22, -8, 8, 22): K.chimney(x, 0, t_ + 7.0, 4.2)
        for (x, y) in ((X0, Y0), (X0, Y1), (X1, Y0), (X1, Y1)): K.tower(x, y, 4.2, t_ + 3.0, 11.0)
        K.block(-6, 6, Y0 - 6, Y0, 4, 4.8, M['stone'], bay=3.0, skip='n'); K.hip(-6, 6, Y0 - 6, Y0, 4 * 4.8 + .55, 9.0, over=.3)
        K.R.cyl(0, Y0 - 3, 4 * 4.8 + 9.5, .12, 3.2, M['lead'], 8); K.portico(0, Y0 - 6, 10, 4, 6.5)
        for (a, b) in ((32, 48), (-48, -32)):
            K.block(a, b, -6, 6, 2, 4.6, M['stone'], bay=3.2); K.hip(a, b, -6, 6, 2 * 4.6 + .55, 5.5)
        for x in (48, -48): K.tower(x, 0, 3.4, 12.0, 8.0)
    K_.placed(chateau, -128, 0, L_TOP, math.pi / 2)
    ctx.anchor('chateau', -120, -20, L_TOP + 16); ctx.anchor('card_home', -128, 20, L_TOP + 22)
    # 冬园玻璃宴会厅 + 玻璃连廊
    def winter_garden():
        X0, X1, Y1 = -26.0, 26.0, 11.0; MG = ctx.B('wintergarden'); arc = lambda x: [(x, Y1 * math.cos(t), 6.0 + 9.0 * math.sin(t)) for t in (i * math.pi / 12 for i in range(13))]
        MG.box(X0, X1, -Y1, Y1, 0, 1.0, M['stone_pale']); MG.box(X0, X1, -Y1, Y1, 1.0, 6.0, M['glass_roof'])
        for k in range(27): MG.tube(arc(X0 + k * 2.0), .13, M['alloy'], n=5)
        vs = arc(X0) + arc(X1); MG.poly(vs, [(i, i + 1, 14 + i, 13 + i) for i in range(12)], M['glass_roof'])
        MG.cyl(0, 0, 13.5, 8.5, 3.0, M['alloy'], 32); MG.sphere(0, 0, 16.5, 8.0, M['glass_roof'], sz=.9, seg=32, rings=16, zmin=0.0)
        for k in range(12):
            a = k * math.tau / 12; MG.tube([(8 * math.cos(a) * math.cos(t), 8 * math.sin(a) * math.cos(t), 16.5 + 7.2 * math.sin(t)) for t in (i * math.pi / 16 for i in range(9))], .15, M['alloy'], n=5)
        MG.cyl(0, 0, 23.7, .5, 2.0, M['holo'], 8)
        for k in range(10): C.tree(K.T, -20 + k * 4.4, 0, 4.5, 1.6, 'oak', seed=700 + k, z=1.0)
    K_.placed(winter_garden, -130, 78, L_TOP)
    K_.placed(lambda: K.glass_gallery([(0, 0.0), (0, 14.0)], w=5.0), -128, 54, L_TOP)
    ctx.anchor('winter', -130, 78, L_TOP + 18)
    K_.placed(lambda: (K.lawn(K.ellipse(0, 0, 16, 11), M['gravel_gold']), K.lawn(K.ellipse(0, 0, 9, 6), M['lawn'], z=.06), K.fountain(0, 0, 3.4)), -116, -48, L_TOP)
    # 林木：北臂林丘成团、南臂岩台零星雪松 + 岩块；园林点景成团；西背面林带（断续，不成环）
    def grove(cx, cy, rad, n, seed, cedar=.4, hmin=11, hmax=18):
        for k in range(n):
            a = rnd.uniform(0, math.tau); d = rad * math.sqrt(rnd.random()); x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
            if S.frac(x, y) > .94 or (-106 <= x <= xe and abs(y) <= 58): continue
            C.tree(K.T, x, y, rnd.uniform(hmin, hmax), rnd.uniform(4.5, 7), 'cedar' if rnd.random() < cedar else 'oak', seed=seed + k, z=tr.h(x, y) - .3)
    grove(62, 132, 40, 60, 1000); grove(0, 140, 22, 18, 1100); grove(-60, 150, 18, 12, 1150, .7)
    grove(60, -126, 36, 8, 1200, 1.0); grove(0, -135, 20, 14, 1250); grove(-170, 90, 22, 16, 1300, .6); grove(-175, -80, 20, 14, 1350, .6)
    grove(-40, 90, 12, 6, 1400); grove(-10, -80, 12, 5, 1450); grove(-150, -150, 16, 8, 1500)
    msh = C.flat('r30_shrub', (.1, .17, .06), .9, noise=.5)
    for k in range(160):    # 灌丛：沿草坪边、林缘成簇
        x, y = rnd.uniform(-190, 110), rnd.uniform(-170, 170)
        if S.frac(x, y) > .9 or (-110 <= x <= S.rad(0.0) and abs(y) <= 62) or MN.noise(Vector((x * .02, y * .02, 3.0))) < .1: continue
        for q in range(rnd.randint(2, 5)): G.sphere(x + rnd.uniform(-3, 3), y + rnd.uniform(-3, 3), tr.h(x, y) + .6, rnd.uniform(1.2, 2.4), msh, sz=.6, seg=8, rings=5)
    for k in range(40):     # 岩台 / 臂脊露岩
        if k < 26: a = rnd.uniform(0, math.tau); d = 32 * math.sqrt(rnd.random()); x, y = 72 + math.cos(a) * d, -128 + math.sin(a) * d
        else: p = arms_n[rnd.randrange(3)]; x, y = p[0] + rnd.uniform(-16, 16), p[1] + rnd.uniform(-6, 6)
        if S.frac(x, y) < .95: C.rock(G, x, y, tr.h(x, y) - 1.0, rnd.uniform(2.5, 7.5), M['rock_top'], seed=k + 77, facet=.35, sz=rnd.uniform(.6, 1.1))
    # 崖缘晶簇（全区最多）+ 岛缘符文环
    MG = ctx.B('rim_crystals')
    for k in range(36):
        a = k * math.tau / 36 + rnd.uniform(-.06, .06); x, y = S.edge(a, 1.0)
        C.crystal_cluster(MG, x, y, tr.h(x * .98, y * .98) - 2.5, rnd.uniform(4, 8), M['crystal'], seed=k * 7 + 3)
        if k in (2, 9, 30): ctx.anchor('crystal', x, y, tr.h(x * .98, y * .98) + 2)
    C.rune_ring(MG, [(x, y) for x, y in S.pts(160, 1.012)], .6, .7, M['rune'])
    # 宾客大平台（南臂角尖，湾口）+ 结界密钥闸口 + 最长进场光带；家族私用小平台（西背面）
    (px, py), (gx, gy), z, ang = K_.dock(K, S, tr, (math.cos(math.radians(-45)), math.sin(math.radians(-45))), 14, cars=2, approach_m=160)
    def gate():
        GT = ctx.B('key_gate')
        for s_ in (-1, 1): GT.box(-1.8, 1.8, s_ * 9 - 1.5, s_ * 9 + 1.5, 0, 20, M['alloy']); GT.cyl(0, s_ * 9, 20, 1.4, 2.0, M['holo'], 12)
        GT.tube([(0, -9, 20), (0, -6, 24), (0, 0, 26), (0, 6, 24), (0, 9, 20)], 1.0, M['alloy'], n=8)
        GT.poly([(0, -7.5, .2), (0, 7.5, .2), (0, 7.5, 20), (0, 0, 25), (0, -7.5, 20)], [(0, 1, 2, 3, 4)], M['gate'])
    gx2, gy2 = gx - math.cos(ang) * 6, gy - math.sin(ang) * 6; gz = tr.h(gx2, gy2)
    K_.placed(gate, gx2, gy2, gz, ang)
    ctx.anchor('card_key', gx2, gy2, gz + 22); ctx.anchor('dock', px, py, z + 1); ctx.anchor('dock', px + math.cos(ang) * 90, py + math.sin(ang) * 90, z - 7)
    (qx, qy), _, qz, _ = K_.dock(K, S, tr, (math.cos(math.pi + .17), math.sin(math.pi + .17)), 8, cars=1, lights=False)
    ctx.anchor('dock_private', qx, qy, qz + 1)
    WD = ctx.B('ward'); K_.ward_dome(S, lambda x, y: tr.h(x * .99, y * .99), .33 * R, M['ward'], WD)
    ctx.anchor('ward', -40, -60, .33 * R * .9 + 20)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
