"""罗斯柴尔德庄园 · 悬浮岛 R-02（设定 docs/upper-setting.md §4.2、§8 新月、§9.3 帘瀑、§9.4；清单 docs/upper-islands-checklist.md）。
卡：伊莎贝拉·罗斯柴尔德的居所，军工与以太能源财阀；冬季宴会、品鉴宴凭请柬和结界密钥入场【卡 L47、L179、L376】。
其余全部仓库推断：
  岛面 —— 新月，东侧深湾；西高东低三级水景台地（蜂蜜色石挡墙），中轴长水池池底冷蓝晶板发光，池端在湾内弧溢成帘瀑；
          北臂林丘（雪松 + 橡树成团）、南臂岩台；沃德斯登式府邸在最高台，正立面朝东对水池；冬园玻璃宴会厅；崖缘晶簇全区最多；
          宾客大平台在南臂外端，结界密钥闸口 + 最长进场光带；家族私用小平台在岛背面（西）。
  岛底 —— 浅蜂蜜色石灰岩 + 冷蓝导能脉；新月两臂下各一根外弯的深獠牙；正中挂「以太储能钟」（巨晶 + 合金笼架）；湾下悬清水倒锥；4 核。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C

ID, NAME = 'isle30', '罗斯柴尔德庄园'
ROCK, ROCK2, VEIN = (.66, .5, .3), (.46, .34, .21), dict(c=(.12, .5, 1.0), e=2.5, density=.3)
CAM_DROP, CAM_DIST = .5, 5.6


def SHAPE_FN(th, r):
    """新月湾加深：底图轮廓的湾只收到 0.48R，斜视里看不出新月；本岛再往里挖到约 0.33R（设定 §8「东侧挖一个深湾」）"""
    dd = math.atan2(math.sin(th), math.cos(th)); return r * (1 - .32 * math.exp(-(dd / .55) ** 2))


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(30)
    mr = ctx.m('rock', lambda: K_.rock_mat('r30_rock', ROCK, ROCK2, .09, VEIN))
    mb = ctx.m('band', lambda: K_.rock_mat('r30_band', tuple(c * .9 for c in ROCK), ROCK2, .2, VEIN))
    mg = ctx.m('core', lambda: C.glow('r30_core', c=(.45, .8, 1.0), estr=14))
    mring = ctx.m('ring', lambda: C.glow('r30_ring', c=(.45, .8, 1.0), estr=6))
    mcry = ctx.m('cry', lambda: C.flat('r30_cry', (.4, .75, 1.0), .06, emit=(.35, .72, 1.0), estr=2.5))
    mcage = ctx.m('cage', lambda: C.flat('r30_cage', (.74, .76, .8), .25, metal=1.0))
    mbell = ctx.m('bell', lambda: C.flat('r30_bell', (.55, .85, 1.0), .05, emit=(.45, .8, 1.0), estr=8.0))
    mwat = ctx.m('wcone', lambda: C.glass('r30_water', tint=(.3, .55, .62), rough=.03))
    P = S.pts(144); cliff = 26
    K_.cliff_band(ctx, B, P, cliff, mb)
    # 主岩体浅：新月的身子只下沉 0.34R，重量交给两根獠牙
    rings, apex = K_.body_rings(ctx, P, [(.88, .08), (.72, .16), (.52, .24), (.28, .3), (0, .34)], cliff, amp=.06)
    K_.loft(B, rings, mr, apex=apex)
    # 新月两臂下的獠牙：从臂根向外弯，北长南短
    for (u, v, r, d, sd) in ((.38, .62, .26, 1.3, 1), (.38, -.62, .24, 1.12, 2)):
        x, y = u * S.rx + ox, v * S.ry; a = math.atan2(v * S.ry, u * S.rx)
        K_.cone(B, x, y, -cliff - R * .05, r * R, d * R, mr, seed=sd, bend=(math.cos(a) * R * .16, math.sin(a) * R * .16))
    K_.cone(B, -.45 * S.rx + ox, .1 * S.ry, -cliff - R * .05, .2 * R, .6 * R, mr, seed=3)
    # 以太储能钟：六棱双锥巨晶 + 合金笼架 + 三根吊杆（家族私有能源储备）
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
    # 湾下清水倒锥（凝水 / 回收）+ 一圈凝结光环
    x, y, z = .62 * S.rx + ox, 0.0, -cliff - .22 * R
    B.cyl(x, y, z - .42 * R, .002 * R, .42 * R, mwat, 32, r2=.1 * R)
    B.cyl(x, y, z, .108 * R, R * .012, mring, 48, r2=.108 * R, cap=False)
    # 4 颗核：两根獠牙中段各一、后锥一、主体南面一；獠牙上各两道符文环
    for (u, v, d, rr) in ((.38, .62, .45, .26), (.38, -.62, .42, .24)):
        x, y = u * S.rx + ox, v * S.ry; zc = -cliff - d * R; t = (d - .05) / 1.2; rk = rr * R * (1 - t) ** .75
        K_.glow_orb(B, x + .26 * rk, y - .97 * rk, zc, R * .05, mg)
        for q in range(2): B.cyl(x + R * .16 * t * t * math.cos(math.atan2(v, u)), y, zc - q * R * .035, rk * (1.22 + .1 * q), R * .006, mring, 48, cap=False)
    K_.glow_orb(B, -.45 * S.rx + ox + .26 * R * .1, .1 * S.ry - .97 * R * .12, -cliff - .25 * R, R * .045, mg)
    pts = K_.ring_at(rings, -cliff - .14 * R); K_.band(B, pts, -cliff - .14 * R, R * .014, mring, 1.03, ox); K_.band(B, pts, -cliff - .18 * R, R * .01, mring, 1.0, ox)
    x, y = pts[int(len(pts) * .72)]; K_.glow_orb(B, x, y, -cliff - .16 * R, R * .05, mg)
    K_.crystals_down(B, rings, R, 34, mcry, rnd, cliff=cliff)


# ============================================================ 岛面
def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R; rnd = random.Random(31)
    M['lawn_stripe'] = K_.stripe_mat('r30_lawn', (.2, .36, .1), (.28, .46, .14), 7.0)
    M['woodland'] = C.flat('r30_wood', (.16, .19, .08), .95, noise=.5)
    M['rock_top'] = K_.rock_mat('r30_rocktop', (.72, .62, .46), (.52, .44, .33), .15)
    M['gravel_gold'] = C.flat('r30_gravel', (.82, .72, .52), .9, noise=.3)
    M['crys_floor'] = C.flat('r30_crysfloor', (.05, .3, .75), .05, emit=(.1, .45, 1.0), estr=1.6, coat=1.0)
    M['crystal'] = C.flat('r30_rimcry', (.5, .85, 1.0), .06, emit=(.35, .72, 1.0), estr=2.5)
    M['gate'] = C.hex_ward_mat('r30_gate', scale=.6, alpha=.9, estr=7.0)
    tr = K_.Terrain(S, steps=dict(axis_deg=0, cuts=[-40, 24], levels=[26.0, 13.0, 1.0], span=58),
                    mounds=[dict(at=[70, 120], r=52, h=24), dict(at=[70, -118], r=44, h=14)], noise=(.5, 45), brow=(7, 2.0), ground='lawn_stripe')
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    xe = S.rad(0.0) - 3
    tr.flats += [(-140, -58, -44, 44, 26.0, 6), (-140, -76, 48, 98, 26.0, 6)]
    tr.flats += [(-56, -42, -9, 9, 24.2, 1.0), (-37, 21, -9, 9, 11.2, 1.0), (27, xe + 3, -9, 9, -.8, 1.0)]   # 池坑
    tr.fn(lambda x, y: (x - 70) ** 2 + (y - 120) ** 2 < 42 ** 2, 'woodland')
    tr.fn(lambda x, y: (x - 70) ** 2 + (y + 118) ** 2 < 36 ** 2, 'rock_top')
    for (x0, x1) in ((-37, 21), (27, xe - 6)):
        for sy in (-1, 1): tr.rect(x0, x1, min(sy * 10, sy * 31), max(sy * 10, sy * 31), 'gravel_gold')
    tr.rect(-58, xe + 2, -9, 9, 'gravel_gold')
    tr.rect(-124, -76, -44, 44, 'gravel_gold'); tr.ell(-100, -54, 17, 13, 'gravel_gold')
    dock_ang = math.atan2(-.44, .9); de = S.edge(dock_ang, .9)
    tr.path([(-100, -50), (-60, -78), (20, -104), de], 7, 'gravel_gold')
    tr.path([(-140, 0), S.edge(math.pi + .15, .95)], 5, 'gravel_gold')
    B = ctx.B('terrain'); tr.build(B, M); tr.walls(ctx.B('walls'), M['stone'], 2.0)
    G = ctx.B('garden'); W = ctx.B('water'); L = ctx.B('lamps')
    # 长水池：三级水盆，池底冷蓝晶板 + 合金接缝 + 清水面；级间跌水；池端帘瀑
    for (x0, x1, lv) in ((-56, -42, 26.0), (-37, 21, 13.0), (27, xe, 1.0)):
        end = x1 >= xe
        G.box(x0 - 1.5, x1 + (0 if end else 1.5), -10.5, 10.5, lv - 1.5, lv - .3, M['stone_pale'])          # 池底石板 + 四边池沿
        for (a_, b_, c_, d_) in ((x0 - 1.5, x1 + 1.5, -10.5, -9), (x0 - 1.5, x1 + 1.5, 9, 10.5), (x0 - 1.5, x0, -8, 8)) + (() if end else ((x1, x1 + 1.5, -8, 8),)):
            G.box(a_, b_, c_, d_, lv - .3, lv + .45, M['stone_pale'])
        W.box(x0, x1 + (1.5 if end else 0), -9, 9, lv - .3, lv - .1, M['crys_floor'])
        for k in range(int((x1 - x0) / 4)): W.box(x0 + k * 4, x0 + k * 4 + .25, -9, 9, lv - .1, lv - .06, M['alloy'])
        for k in range(int((x1 - x0) / 7) + 1):
            for sy in (-1, 1): L.cyl(x0 + k * 7, sy * 12, lv + .3, .14, 3.0, M['holo'], 6)
    mf = C.flat('r30_foam', (.92, .96, 1.0), .3, emit=(.8, .9, 1.0), estr=.6)
    for (xa, za, zb) in ((-42, 26.0, 13.0), (21, 13.0, 1.0)): K_.cascade(W, xa, -6, 6, za + .1, zb - .1, mf, mf)
    K_.waterfall(xe + 1.5, 0, .9, 0.0, 34, R * 1.0, 1.25, .9, name='r30_curtain')
    K_.waterfall(xe + 1.6, 0, .8, 0.0, 40, R * .55, 3.0, .45, name='r30_curtain_blue')
    # 规整水景花坛（对称，冬季深红花床）+ 紫杉柱列
    for (x0, x1, lv) in ((-37, 21, 13.0), (27, xe - 8, 1.0)):
        w = x1 - x0; nb = max(1, int(w / 19))
        for k in range(nb):
            a = x0 + k * w / nb + 1; b = a + w / nb - 2
            for (y0, y1) in ((12, 29), (-29, -12)): K_.placed(lambda a=a, b=b, y0=y0, y1=y1: K.parterre(a, b, y0, y1), 0, 0, lv + .05)
        for sy in (-1, 1):
            for k in range(int(w / 6)): C.tree(K.T, x0 + 3 + k * 6, sy * 33, 5.5, .8, 'yew_col', seed=900 + k + int(x0) + sy * 50, z=lv)
    # 府邸：沃德斯登式（本地朝南建，转 90° 正立面朝东）
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
    K_.placed(chateau, -100, 0, 26.0, math.pi / 2)
    # 冬园玻璃宴会厅：合金肋拱玻璃长厅 + 中央玻璃穹；玻璃连廊接府邸
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
    K_.placed(winter_garden, -108, 74, 26.0)
    K_.placed(lambda: K.glass_gallery([(0, 0.0), (0, 30.0)], w=5.0), -118, 33, 26.0)
    K_.placed(lambda: (K.lawn(K.ellipse(0, 0, 16, 12), M['gravel_gold']), K.lawn(K.ellipse(0, 0, 9, 6), M['lawn'], z=.06), K.fountain(0, 0, 3.4)), -100, -54, 26.0)
    # 北臂林丘：雪松与橡树成团；南臂岩台：岩块 + 零星雪松；背面（西）雪松林带
    for (cx, cy, n, kd, rk) in ((70, 120, 60, 'mix', 0), (70, -118, 9, 'cedar', 28)):
        for k in range(n):
            a = rnd.uniform(0, math.tau); d = 44 * math.sqrt(rnd.random()); x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
            if S.frac(x, y) > .93: continue
            C.tree(K.T, x, y, rnd.uniform(11, 17), rnd.uniform(4.5, 7), 'cedar' if (kd == 'cedar' or k % 3 == 0) else 'oak', seed=1000 + k + cx, z=tr.h(x, y) - .3)
        for k in range(rk):
            a = rnd.uniform(0, math.tau); d = 36 * math.sqrt(rnd.random()); x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
            if S.frac(x, y) < .95: C.rock(G, x, y, tr.h(x, y), rnd.uniform(2.5, 6.5), M['rock_top'], seed=k + 77, facet=.35)
    for k in range(80):
        a = rnd.uniform(math.pi * .55, math.pi * 1.45); f = rnd.uniform(.8, .95); x, y = math.cos(a) * S.rad(a) * f, math.sin(a) * S.rad(a) * f
        if -146 < x < -50 and -52 < y < 102: continue
        if K_.seg_dist(x, y, [(-140, 0), S.edge(math.pi + .15, .95)]) < 7: continue
        C.tree(K.T, x, y, rnd.uniform(12, 18), rnd.uniform(4, 6.5), 'cedar' if k % 2 else 'oak', seed=2000 + k, z=tr.h(x, y) - .3)
    # 园林树：南臂车道两侧椴树林荫道；大草坪上成团的雪松 / 橡树（英式园林点景）
    drive = [(-100, -50), (-60, -78), (20, -104), de]
    for (ax, ay), (bx, by) in zip(drive, drive[1:]):
        Lg = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / Lg, (by - ay) / Lg
        for k in range(int(Lg / 11)):
            for s_ in (-1, 1):
                x, y = ax + ux * k * 11 - uy * s_ * 7, ay + uy * k * 11 + ux * s_ * 7
                if S.frac(x, y) < .92: C.tree(K.T, x, y, 10, 3.2, 'oak', seed=3000 + k * 2 + s_ + int(ax), z=tr.h(x, y) - .2)
    for (cx, cy, n) in ((-40, 80, 5), (10, 70, 4), (-30, -70, 5), (30, -60, 3), (-150, -80, 4)):
        for k in range(n):
            x, y = cx + rnd.uniform(-14, 14), cy + rnd.uniform(-10, 10)
            if S.frac(x, y) < .9: C.tree(K.T, x, y, rnd.uniform(12, 18), rnd.uniform(5, 7.5), 'cedar' if k % 2 == 0 else 'oak', seed=3500 + k + cx, z=tr.h(x, y) - .3)
    # 崖缘晶簇（全区最多）+ 岛缘符文环
    MG = ctx.B('rim_crystals')
    for k in range(30):
        a = k * math.tau / 30 + rnd.uniform(-.08, .08); x, y = S.edge(a, 1.0)
        C.crystal_cluster(MG, x, y, tr.h(x * .98, y * .98) - 2.5, rnd.uniform(4, 8), M['crystal'], seed=k * 7 + 3)
    C.rune_ring(MG, [(x, y) for x, y in S.pts(160, 1.012)], .6, .7, M['rune'])
    # 宾客大平台 + 结界密钥闸口 + 最长进场光带；家族私用小平台
    (px, py), (gx, gy), z, ang = K_.dock(K, S, tr, (.9, -.44), 14, cars=2, approach_m=150)
    def gate():
        GT = ctx.B('key_gate')
        for s_ in (-1, 1): GT.box(-1.8, 1.8, s_ * 9 - 1.5, s_ * 9 + 1.5, 0, 20, M['alloy']); GT.cyl(0, s_ * 9, 20, 1.4, 2.0, M['holo'], 12)
        GT.tube([(0, -9, 20), (0, -6, 24), (0, 0, 26), (0, 6, 24), (0, 9, 20)], 1.0, M['alloy'], n=8)
        GT.poly([(0, -7.5, .2), (0, 7.5, .2), (0, 7.5, 20), (0, 0, 25), (0, -7.5, 20)], [(0, 1, 2, 3, 4)], M['gate'])
    gx2, gy2 = gx - math.cos(ang) * 6, gy - math.sin(ang) * 6
    K_.placed(gate, gx2, gy2, tr.h(gx2, gy2), ang)
    K_.dock(K, S, tr, (-1, .15), 8, cars=1, lights=False)
    WD = ctx.B('ward'); K_.ward_dome(S, lambda x, y: tr.h(x * .99, y * .99), .33 * R, M['ward'], WD)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
