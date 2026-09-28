"""凯莉的宅邸（设定 docs/upper-setting.md §4.5、§8 台地、§9.3 细溪瀑、§9.4；清单 docs/upper-islands-checklist.md）。
卡：凯莉·露易丝，贵族寡妇、首相之妹，住自己的宅邸；放在上层是用户决定【卡 L85、L177、L403】。
其余全部仓库推断：
  岛面 —— 圆角近方台地；自南向北三层果园梯台（砂岩矮挡墙），宅邸在最高台；果树成行、粉白花冠，行间低矮全息防霜灯；
          砖墙围合菜园（成条畦垄 + 靠墙暖棚）；合金骨架弧形玻璃的果园温室长廊；中轴路两侧光球花钵；
          细溪从宅邸东侧泉池沿梯台跌落，到东南崖成细溪瀑；西缘单座小平台朝伊甸，一辆悬浮车；魔导极少，不加晶簇。
  岛底 —— 浅而宽的蜂蜜色砂岩碗，水平层理，两道小台阶（呼应梯台）；崖缘垂藤带粉白花；一颗暖金核、只有一道符文环。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C

ID, NAME = 'isle10', '凯莉的宅邸'
ROCK, ROCK2 = (.74, .53, .3), (.55, .37, .21)
CAM_DROP, CAM_DIST = .3, 4.3
UCAM_DROP, UCAM_DIST = .22, 3.6
VILLA_SCALE = 1.4


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(10)
    mr = ctx.m('rock', lambda: K_.rock_mat('k10_rock', ROCK, ROCK2, .2))
    mb = ctx.m('band', lambda: K_.rock_mat('k10_band', tuple(c * .92 for c in ROCK), ROCK2, .35))
    mg = ctx.m('core', lambda: C.glow('k10_core', c=(1.0, .8, .45), estr=9))
    mring = ctx.m('ring', lambda: C.glow('k10_ring', c=(1.0, .82, .5), estr=4))
    mvine = ctx.m('vine', lambda: C.flat('k10_vine', (.2, .32, .1), .9, noise=.4))
    mfl = ctx.m('vfl', lambda: C.flat('k10_vfl', (.96, .78, .84), .7))
    P = S.pts(144); cliff = 18
    K_.cliff_band(ctx, B, P, cliff, mb)
    # 浅碗：两道水平小台阶（像梯台一样一层层收），再圆收到浅底
    prof = [(.95, .03), (.85, .045), (.84, .1), (.72, .115), (.7, .17), (.52, .23), (.3, .3), (.1, .35), (0, .37)]   # 两道明显的平台檐
    rings, apex = K_.body_rings(ctx, P, prof, cliff, amp=.035)
    K_.loft(B, rings, mr, apex=apex)
    # 一颗暖金核（半嵌在南面），一道符文环绕碗
    z = -cliff - .2 * R; pts = K_.ring_at(rings, z)
    x, y = pts[int(len(pts) * .72)]; K_.glow_orb(B, x, y, z, R * .055, mg)
    K_.band(B, pts, z, R * .012, mring, 1.03, ox)
    # 垂藤（带粉白花），集中在南、西两面
    K_.hanging(ctx, B, P, 80, (6, 22), mvine, rnd, r=(.25, .45), flower=mfl)
    K_.hanging(ctx, B, P, 260, (10, 22), mvine, rnd, r=(.3, .6), flower=mfl)


# ============================================================ 岛面
CREEK = [(24, 42), (30, 30), (26, 14), (38, -8), (36, -30), (52, -50), (70, -74), (92, -96)]


def fruit_tree(B, M, x, y, z, h, r, seed):
    rnd = random.Random(seed)
    B.tube([(x, y, z - .2), (x + rnd.uniform(-.3, .3), y + rnd.uniform(-.3, .3), z + h * .45)], .17, C.tree_mats()['bark'], n=6)
    C._cards(B, rnd, (x, y, z + h * .72), (r, r, r * .75), 95, .5, [M['blossom_a'], M['blossom_a'], M['blossom_b'], M['blossom_g'], M['blossom_g']], shell=.6)


def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R
    M['meadow_soft'] = K_.speckle_mat('k10_meadow', (.28, .45, .14), (.97, .8, .86), .16, .5)
    M['orchard_grass'] = K_.speckle_mat('k10_orchard', (.33, .5, .17), (.97, .78, .85), .24, .7)
    M['gravel_cream'] = C.flat('k10_gravel', (.87, .83, .75), .9, noise=.3)
    M['soil'] = C.flat('k10_soil', (.3, .2, .13), .95, noise=.5)
    M['veg'] = C.flat('k10_veg', (.24, .44, .13), .85, noise=.4)
    M['stucco'] = C.pbr('k10_stucco', 'white_stucco', 3.0, tint=(1.0, .98, .95), value=1.05, sat=.4)
    M['frost'] = C.glow('k10_frost', c=(.55, .92, 1.0), estr=5.0)
    M['orb'] = C.glow('k10_orb', c=(1.0, .9, .72), estr=6.0)
    M['blossom_a'] = C.flat('k10_bl_pink', (.95, .56, .7), .7, noise=.2)
    M['blossom_b'] = C.flat('k10_bl_white', (.97, .88, .9), .7, noise=.2)
    M['blossom_g'] = C.flat('k10_bl_leaf', (.3, .45, .16), .8, noise=.3)
    M['meadow_low'] = K_.speckle_mat('k10_low', (.44, .5, .2), (.97, .8, .86), .3, .8)
    M['creek'] = C.flat('k10_creek', (.2, .42, .5), .05, coat=1.0)
    M['citrus'] = C.flat('k10_citrus', (.95, .55, .1), .5)
    tr = K_.Terrain(S, steps=dict(axis_deg=90, cuts=[-45, 22], levels=[0.0, 11.0, 22.0]), noise=(.35, 35), brow=(6, 1.5), ground='meadow_soft')
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    tr.flats += [(-30, 30, 52, 92, 22.0, 6), (-120, -25, 42, 58, 22.0, 5), (36, 108, 36, 104, 22.0, 5)]
    tr.fn(lambda x, y: y < 20, 'orchard_grass'); tr.fn(lambda x, y: y < -47, 'meadow_low')
    tr.rect(36, 108, 36, 104, 'soil')
    dock_ang = math.atan2(-.32, -.95); dpath = [(-2, -8), (-60, -30), S.edge(dock_ang, .95)]
    tr.path([(0, -S.ry), (0, 52)], 4.5, 'gravel_cream'); tr.ell(0, 44, 18, 8, 'gravel_cream')
    tr.path(dpath, 4, 'gravel_cream'); tr.path([(-30, 50), (-118, 50)], 3, 'gravel_cream')
    tr.build(ctx.B('terrain'), M); tr.walls(ctx.B('walls'), M['stone_sand'], 1.6)
    OT = ctx.B('orchard'); L = ctx.B('lamps'); W = ctx.B('water')
    # 摄政风白灰泥别墅：两层，宽檐浅坡四坡石板顶，正立面两只整高半圆弓窗，中间铁艺游廊（绿铜顶）
    def villa():
        X0, X1, Y0, Y1 = -21.0, 21.0, -8.0, 8.0; fh = 4.4
        t_ = K.block(X0, X1, Y0, Y1, 2, fh, M['stucco'], bay=3.2, win=(1.4, 2.6))
        K.hip(X0, X1, Y0, Y1, t_, 3.6, over=1.4)
        for sx in (-12, 12):
            K.W.lathe(sx, Y0, 0, [(4.2, 0), (4.2, 2 * fh + .4)], M['stucco'], n=16, a0=math.pi, a1=math.tau)
            for k in range(5):
                a = math.pi + (k + .5) * math.pi / 5
                for f in range(2): K.WN.box(sx + 4.25 * math.cos(a) - .55, sx + 4.25 * math.cos(a) + .55, Y0 + 4.25 * math.sin(a) - .55, Y0 + 4.25 * math.sin(a) + .55, f * fh + 1.0, f * fh + 3.6, M['glass'])
            K.R.lathe(sx, Y0, 2 * fh + .4, [(4.6, 0), (3.0, 1.4), (.1, 1.9)], M['lead'], n=16, a0=math.pi, a1=math.tau)
        K.RL.box(-7.5, 7.5, Y0 - 3.2, Y0, fh - .1, fh + .15, M['copper'])
        for x in (-7, -3.5, 0, 3.5, 7): K.RL.cyl(x, Y0 - 3, 0, .12, fh, M['iron'], 6)
        for x in (-15, -5, 5, 15): K.chimney(x, 0, t_ + 2.2, 2.6, 1.8, .9, M['stucco'])
        K.block(21, 33, -5, 7, 1, 4.0, M['stucco'], bay=3.0); K.hip(21, 33, -5, 7, 4.55, 2.4, over=1.0)   # 东侧服务翼
    K_.placed(villa, 0, 71, 22.0, 0.0, VILLA_SCALE)
    # 果园温室长廊：合金肋 + 弧形玻璃拱，里面一排柑橘
    def glasshouse():
        GH = ctx.B('glasshouse'); arc = lambda x: [(x, 4 * math.cos(t), 3.1 + 4 * math.sin(t)) for t in (i * math.pi / 10 for i in range(11))]
        GH.box(-45, 45, -4, 4, 0, .9, M['stone_sand']); GH.box(-45, 45, -4, 4, .9, 3.1, M['glass_roof'])
        for k in range(31): GH.tube(arc(-45 + k * 3.0), .11, M['alloy'], n=5)
        GH.poly(arc(-45) + arc(45), [(i, i + 1, 12 + i, 11 + i) for i in range(10)], M['glass_roof'])
        for k in range(14):
            x = -40 + k * 6.1; GH.sphere(x, 0, 2.6, 1.3, M['blossom_g'], seg=10, rings=6)
            for q in range(4): GH.sphere(x + math.cos(q) * 1.1, math.sin(q) * 1.1, 2.6 + .4 * (q % 2), .22, M['citrus'], seg=6, rings=4)
    K_.placed(glasshouse, -72, 50, 22.0)
    # 砖墙菜园：畦垄成条 + 北墙暖棚
    def kitchen():
        KG = ctx.B('kitchen'); x0, x1, y0, y1 = -34, 34, -32, 32
        for (a, b, c, d) in ((x0, -3, y0, y0 + .6), (3, x1, y0, y0 + .6), (x0, x1, y1 - .6, y1), (x0, x0 + .6, y0, y1), (x1 - .6, x1, y0, y1)): KG.box(a, b, c, d, -.5, 2.8, M['brick'])
        for k in range(14): y = y0 + 3 + k * 4.3; KG.box(x0 + 3, x1 - 3, y, y + 1.9, 0, .35, M['veg'] if k % 3 else M['blossom_g'])
        KG.box(x0 + 2, x1 - 2, y1 - 4, y1 - .6, 0, 3.2, M['glass_roof'])
    K_.placed(kitchen, 72, 70, 22.0)
    # 果园：两层梯台上的行列果树（粉白花冠），行间低矮全息防霜灯
    rnd = random.Random(10); k = 0
    for (y0, y1) in ((-130, -49), (-41, 18)):
        y = y0 + 3; row = 0
        while y < y1 - 2:
            x = -S.rx
            while x < S.rx:
                if abs(x) > 6 and S.frac(x, y) < .9 and K_.seg_dist(x, y, CREEK) > 6 and K_.seg_dist(x, y, dpath) > 5.5:
                    fruit_tree(OT, M, x + rnd.uniform(-.3, .3), y, tr.h(x, y) - .1, rnd.uniform(4.6, 5.6), rnd.uniform(2.9, 3.4), 5000 + k); k += 1
                    if row % 2 == 0 and int((x + 200) / 8.5) % 2 == 0 and S.frac(x, y + 3.5) < .9:
                        z = tr.h(x + 3.2, y + 3.5); L.cyl(x + 3.2, y + 3.5, z, .15, 1.4, M['alloy'], 6); L.sphere(x + 3.2, y + 3.5, z + 1.6, .5, M['frost'], seg=8, rings=4)
                x += 8.5
            y += 9.0; row += 1
    print('ORCHARD TREES', k)
    # 细溪：泉池 → 沿梯台跌落 → 东南崖细溪瀑
    W.cyl(24, 46, 21.7, 5, .5, M['stone_sand'], 24); W.cyl(24, 46, 22.22, 4.3, .08, M['water_clear'], 24)
    ex, ey = S.edge(math.atan2(-.72, .69)); pts = CREEK + [(ex * .99, ey * .99)]
    K_.drape(tr, pts, 5.0, M['stone_sand'], W, dz=.02); K_.drape(tr, pts, 3.2, M['creek'], W, dz=.14)
    K_.waterfall(ex, ey, tr.h(ex * .99, ey * .99), math.atan2(ey, ex), 1.8, R * .6, 1.0, .65, name='k10_creek')
    # 光球花钵：沿中轴路成对（合金钵 + 花 + 下方悬浮暖光球）
    for y in (-110, -80, -52, -30, -5, 12, 36):
        for sx in (-1, 1):
            x = sx * 4.8; z = tr.h(x, y); L.cyl(x, y, z + 1.3, .9, .5, M['alloy'], 16, r2=1.2)
            C._cards(L, random.Random(int(y * 10 + sx)), (x, y, z + 2.0), (1.0, 1.0, .5), 25, .3, [M['blossom_a'], M['blossom_b'], M['blossom_g']], shell=.5)
            L.sphere(x, y, z + .7, .38, M['orb'], seg=10, rings=6)
    for (x, y) in ((-28, 30), (28, 28), (-40, 94), (-8, 110), (14, 116), (-60, 104)):
        if S.frac(x, y) < .9: C.tree(K.T, x, y, 11, 4.5, 'oak', seed=int(x * 3 + y), z=tr.h(x, y) - .2)
    for k in range(9): C.tree(K.T, -22 + k * 5.5, 32, 4.5, .8, 'yew', seed=610 + k, z=22.0)
    K_.dock(K, S, tr, (-.95, -.32), 9, cars=1, approach_m=60)
    WD = ctx.B('ward'); K_.ward_dome(S, lambda x, y: tr.h(x * .99, y * .99), .33 * R, M['ward'], WD)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
