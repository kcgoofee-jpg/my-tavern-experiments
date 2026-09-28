"""精英学院 v18（设定 docs/upper-setting.md §4.4、§8 方台、§9.3 光柱、§9.4；清单 docs/upper-islands-checklist.md）。
卡：上层贵族子弟的学院，教家族管理、以太魔法修习、政治、礼仪、军事基础【卡 L371】（通识 + 人脉教育，不是骑士团军官培养）。
其余全部仓库推断：
  岛面 —— 方正圆角平台，几乎没有碎口；人工找平成两级：西侧学术台（高 6 m，灰石挡墙）+ 东侧操练 / 运动低台；
          西北一座小林丘、崖缘几处岩突、南侧一片浅洼草甸（打破「方蛋糕」但保持规整）；
          灰石学院四合院（门楼）、铜绿圆顶图书馆、礼仪大厅（门廊）；岛心以太修习圆庭（地面法阵环 + 圆心光井）；
          操练场（碎石）+ 运动场（跑道椭圆 + 条纹草坪）；操练场旁悬浮机动装置训练架；2088：玻璃连廊、全息园灯；
          东缘操练场一侧长条接送平台，多车位（私家悬浮车），无校车；结界格边变细。
  岛底 —— 人工修整的灰石倒阶梯金字塔（五级立面 + 收进平台，层理、苔在平台面）；第二级立面是观测阶梯教室的晶窗带；
          一颗核 + 符文环；圆庭光柱从塔尖穿出向下。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C
from mathutils import noise as MN, Vector

ID, NAME = 'isle25', '精英学院'
ROCK, ROCK2 = (.62, .62, .6), (.44, .44, .43)
CAM_DROP, CAM_DIST = .3, 4.2
UCAM_DROP, UCAM_DIST = .3, 3.7
L_HI, L_LO, CUT_X = 6.0, 0.0, 42.0          # 西侧学术台 / 东侧操练低台，分界 x
COURT = (-8.0, -6.0, 22.0)                  # 以太修习圆庭（在学术台东缘，光柱从这里向下穿岛底）
DOCK_ANG = math.radians(-12)                # 东缘（操练场一侧）
BOARD_TITLE = '精英学院 —— v18 设定对照'
ITEMS = [
    ('card_academy', '上层贵族子弟的学院：家族管理、以太魔法修习、政治、礼仪、军事基础（通识 + 人脉，不是军官培养）', '卡原文', '✓'),
    ('outline', '轮廓：方正圆角平台，几乎没有碎口', '仓库推断', '✓'),
    ('terrain', '人工找平两级台（学术台 + 操练低台，灰石挡墙）；草甸群落、林丘、浅洼、崖缘岩突', '仓库推断', '✓'),
    ('quad', '灰石学院四合院（门楼、坡顶、内院草坪）', '仓库推断', '✓'),
    ('library', '铜绿圆顶图书馆', '仓库推断', '✓'),
    ('hall', '礼仪大厅（石门廊）', '仓库推断', '✓'),
    ('court', '以太修习圆庭：地面可见法阵环', '仓库推断', '✓'),
    ('drill', '操练场（碎石）+ 运动场（跑道、条纹草坪）分区', '仓库推断', '✓'),
    ('trainer', '操练场旁悬浮机动装置训练架', '仓库推断', '✓'),
    ('glass2088', '2088：玻璃连廊 + 全息园灯 + 悬浮玻璃亭 + 光球花钵；崖缘晶簇中等（与首相府同级）', '仓库推断', '✓'),
    ('dock', '操练场一侧长条接送平台，多车位私家密封悬浮车（草图尺度下车小，不易读）；没有校车', '仓库推断', '弱'),
    ('ward', '结界：格边变细', '仓库推断', '✓'),
    ('beacon', '接送平台外沿一圈引导信标 + 下滑约 5° 进场光点串', '仓库推断', '✓'),
    ('u_steps', '岛底：规整阶梯状收分（倒阶梯金字塔），人工修整的灰石', '仓库推断', '✓'),
    ('u_windows', '岛底：岩锥凿成观测阶梯教室，最下立面一圈晶窗带（隔窗看核心）', '仓库推断', '✓'),
    ('u_beam', '圆庭光柱穿出岛底（学院的竖向标记，不设瀑布）', '仓库推断', '✓'),
    ('u_core', '岛底一颗核 + 三道符文环（挂塔尖下，晶窗带看得见）', '仓库推断', '✓'),
    ('u_veins', '导能脉沿各级立面下行汇到塔尖', '仓库推断', '✓'),
    ('u_ballast', '最下一级两簇压舱晶（学院级：少）', '仓库推断', '✓'),
]


def SHAPE_FN(th, r):
    """方正圆角：超椭圆（n=5），几乎不加起伏"""
    a, b, n = 188.0, 150.0, 5.0
    c, s = abs(math.cos(th)), abs(math.sin(th))
    rr = 1.0 / ((c / a) ** n + (s / b) ** n) ** (1 / n)
    return rr * (1 + .006 * math.sin(7 * th + .3))


# ============================================================ 岛底
def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(25)
    mr = ctx.m('rock', lambda: K_.rock_v17('a25_rock17', ROCK, ROCK2, .06, moss=(.26, .34, .14), moss_amt=.6, soil_z=400.0, lichen=(.8, .8, .74)))
    mc = ctx.m('course', lambda: C.ashlar('a25_dressed', c=(.47, .47, .45), course=2.2, block=4.5, jc=(.2, .2, .2), var=.12))
    mw = ctx.m('win', lambda: C.window_grid('a25_windows', lit=(.7, .92, 1.0), estr=4.0, cell=(5.0, 3.5)))
    mg = ctx.m('core', lambda: C.glow('a25_core', c=(.8, .95, 1.0), estr=9))
    mring = ctx.m('ring', lambda: C.glow('a25_ring', c=(.7, .92, 1.0), estr=2.2))
    mbeam = ctx.m('beam', lambda: C.glow('a25_beam', c=(.75, .93, 1.0), estr=3.0, alpha=.45))
    mcry = ctx.m('cry', lambda: C.flat('a25_cry', (.3, .6, 1.0), .05, emit=(.3, .65, 1.0), estr=1.4))
    P = S.pts(160); cliff = 16
    P1 = K_.cliff_v17(ctx, B, P, cliff, mr, dz=1.6, ledge=.02, period=4.0, amp=.012)
    ring = lambda s: [(x * s + ox, y * s) for x, y in P1]
    z = -cliff; s = 1.0; rise = .075 * R
    for j, s2 in enumerate((.84, .68, .52, .36, .2)):            # 五级：立面（修整石 / 晶窗带）+ 收进平台（天然岩面，苔积在平面上）
        z2 = z - rise
        K_.loft(B, [(ring(s), z), (ring(s * .985), z2)], mw if j == 3 else mc, smooth=False)
        if j == 3:
            K_.loft(B, [(ring(s * 1.004), z - rise * .12), (ring(s * 1.004), z - rise * .2)], mc, smooth=False)   # 窗带上檐
            p = ring(s); x, y = p[int(len(p) * .77)]; ctx.anchor('u_windows', x, y, z - rise * .5)
            x, y = p[int(len(p) * .66)]; ctx.anchor('u_windows', x, y, z - rise * .5)
        K_.loft(B, [(ring(s * .985), z2), (ring(s2), z2 - .8)], mr, smooth=False)
        if j in (0, 3): p = ring(s); x, y = p[int(len(p) * .72)]; ctx.anchor('u_steps', x, y, z - rise * .4)
        z, s = z2 - .8, s2
    apex_z = z - .16 * R
    K_.loft(B, [(ring(s), z)], mr, apex=(COURT[0] + ox, COURT[1], apex_z), smooth=False)   # 塔尖正对圆庭：光柱从这里穿出
    # 一颗核：挂在第四级下，带两道符文环
    cz = -cliff - 3.3 * rise
    kx, ky, kz = COURT[0] + ox, COURT[1], apex_z - R * .05          # 一颗核：挂在塔尖下、正对晶窗带的视线里，三道符文环（倾斜错开）
    K_.glow_orb(B, kx, ky, kz, R * .04, mg)
    for q, rr in enumerate((.07, .095, .12)): B.cyl(kx, ky, kz - R * .01 + q * R * .012, R * rr, R * .006, mring, 64, r2=R * rr, cap=False)
    for k in range(12):
        a = k * math.tau / 12; B.box(kx + math.cos(a) * R * .12 - .8, kx + math.cos(a) * R * .12 + .8, ky + math.sin(a) * R * .12 - .8, ky + math.sin(a) * R * .12 + .8, kz + R * .02, kz + R * .02 + 2.2, mring)
    ctx.anchor('u_core', kx + R * .12, ky, kz)
    pr = ring(.5); K_.band(B, pr, cz, R * .008, mring, 1.0, ox)
    mvein = ctx.m('vein', lambda: C.glow('a25_vein', c=(.6, .88, 1.0), estr=3.0))       # 导能脉：沿各级立面竖向下行，汇到塔尖
    for k in range(10):
        i = int(len(P1) * k / 10); pth = []
        for jj, (ss, zz) in enumerate(((1.0, -cliff - 2), (.84, -cliff - rise - 1), (.68, -cliff - 2 * rise - 2), (.52, -cliff - 3 * rise - 3), (.36, -cliff - 4 * rise - 4))):
            x, y = P1[i]; pth.append((x * ss * 1.004 + ox, y * ss * 1.004, zz)); pth.append((x * ss * .99 * .985 + ox, y * ss * .99 * .985, zz - rise + 1.5))
        B.tube(pth, .5, mvein, n=4)
    x, y = P1[int(len(P1) * .75)]; ctx.anchor('u_veins', x * .84 + ox, y * .84, -cliff - rise * 1.4)
    # 圆庭光柱：从塔尖穿出，向下直落
    bx, by = COURT[0] + ox, COURT[1]
    B.cyl(bx, by, apex_z - R * 1.6, R * .03, R * 1.6 + 2, mbeam, 24)
    B.cyl(bx, by, apex_z - R * .9, R * .012, R * .9, mg, 16)
    ctx.anchor('u_beam', bx, by, apex_z - R * .5)
    # 压舱晶两簇（学院级：少）
    for k, fr in enumerate((.3, .8)):
        p = ring(.36); x, y = p[int(len(p) * fr)]; zc = -cliff - 5 * rise - 5
        C.crystal_cluster(B, x, y, zc, R * .06, mcry, seed=250 + k, down=True); ctx.anchor('u_ballast', x, y, zc - R * .04)


# ============================================================ 岛面
def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R; rnd = random.Random(26)
    M['meadow'] = K_.ground_v17('a25_meadow', [(.3, .42, .16), (.4, .48, .2), (.34, .44, .18)], dry=(.64, .58, .34), soil=(.36, .28, .18),
                                rock=ROCK, dots=[(.96, .95, .86), (.9, .78, .3)], dot_dens=.16, dot_scale=.7)       # 草甸：高低草成片 + 干草斑 + 野花点
    M['lawn_s'] = K_.ground_v17('a25_lawn', [(.22, .38, .12), (.26, .42, .14), (.24, .4, .13)], dry=(.3, .42, .16), stripe=((.2, .36, .1), (.3, .47, .16), 6.0), slope_rock=False)
    M['drillg'] = K_.ground_v17('a25_drill', [(.7, .64, .52), (.66, .6, .48), (.74, .68, .56)], dry=(.68, .62, .5), soil=(.55, .48, .38), slope_rock=False)
    M['pave_g'] = K_.ground_v17('a25_pave', [(.74, .74, .72), (.7, .7, .68), (.78, .77, .74)], dry=(.72, .72, .7), soil=(.6, .6, .58), slope_rock=False)
    M['wood'] = K_.ground_v17('a25_wood', [(.16, .22, .08), (.22, .24, .1), (.18, .26, .1)], dry=(.36, .3, .16), soil=(.24, .18, .1), rock=ROCK)
    M['track_r'] = C.flat('a25_track', (.55, .28, .2), .9, noise=.3)
    M['greystone'] = C.ashlar('a25_greystone', c=(.64, .64, .61), course=.55, block=1.2)
    M['copper'] = C.flat('a25_verdigris', (.3, .56, .48), .5, noise=.3)
    M['rune_g'] = C.glow('a25_rune', c=(.45, .85, 1.0), estr=12.0)
    M['well'] = C.glow('a25_well', c=(.6, .9, 1.0), estr=16.0)
    M['crag'] = K_.rock_v17('a25_crag', ROCK, ROCK2, .22, moss=(.28, .36, .14), moss_amt=.5, soil_z=400.0)
    M['crystal'] = C.flat('a25_rimcry', (.3, .6, 1.0), .05, emit=(.3, .65, 1.0), estr=1.4)
    M['ward'] = K_.hex_ward('a25_ward', cell=9.0, alpha=.22, estr=2.0, rim=.3)          # 格边变细
    cx, cy, cr = COURT
    tr = K_.Terrain(S, steps=dict(axis_deg=0, cuts=[CUT_X], levels=[L_HI, L_LO]),
                    mounds=[dict(at=(-150, 105), r=34, h=9.0), dict(at=(-60, -125), r=30, h=-2.4), dict(at=(160, 110), r=20, h=3.0), dict(at=(-165, -40), r=22, h=3.5)],
                    noise=(.4, 40), rough=(.5, 20), ridges=[dict(pts=[(-175, 60), (-160, 125), (-120, 140)], w=12, h=4.5)], brow=(6, 2.0), ground='meadow')
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    QX, QY = -105.0, 35.0                                    # 四合院中心（70 × 64）
    tr.flats += [(QX - 40, QX + 40, QY - 38, QY + 38, L_HI, 6), (-60, 20, 70, 125, L_HI, 6), (-130, -60, -110, -55, L_HI, 5),
                 (cx - cr - 4, cx + cr + 4, cy - cr - 4, cy + cr + 4, L_HI, 5), (CUT_X + 6, 185, -115, 135, L_LO, 4)]
    tr.fn(lambda x, y: math.hypot(x + 150, y - 105) < 36 or K_.seg_dist(x, y, [(-175, 60), (-160, 125), (-120, 140)]) < 12, 'wood')
    DX0, DX1, DY0, DY1 = 60, 170, -95, 10                    # 操练场
    tr.rect(DX0, DX1, DY0, DY1, 'drillg')
    FX, FY, FA, FB = 112, 75, 55, 34                         # 运动场椭圆
    tr.ell(FX, FY, FA + 6, FB + 6, 'lawn_s')
    tr.rect(QX - 26, QX + 26, QY - 23, QY + 23, 'lawn_s')
    paths = [[(-200, 0), (cx - cr, cy)], [(cx + cr, cy), (CUT_X + 8, cy), (DX0, -20)], [(cx, cy + cr), (-20, 70)], [(QX + 36, QY), (cx - cr, cy)],
             [(cx, cy - cr), (-95, -55)], [(DX0, 10), (FX - FA, FY)], [(-20, 125), (-20, 70)]]
    for p in paths: tr.path(p, 6.0, 'pave_g')
    tr.ell(cx, cy, cr + 4, cr + 4, 'pave_g')
    tr.build(ctx.B('terrain'), M, step=1.5); tr.walls(ctx.B('walls'), M['greystone'], 1.2)
    ctx.anchor('terrain', CUT_X, -60, L_HI); ctx.anchor('terrain', -150, 105, tr.h(-150, 105) + 6)
    ctx.anchor('outline', *S.edge(math.radians(-40), .98), tr.h(*S.edge(math.radians(-40), .95)))
    ctx.anchor('card_academy', -20, 30, L_HI + 22)
    G = ctx.B('grounds'); Lb = ctx.B('lamps')
    # ---- 灰石四合院：四翼 + 南门楼
    def quad():
        hw, hh, d = 35.0, 32.0, 10.0; stone = M['greystone']
        for (x0, x1, y0, y1) in ((-hw, hw, hh - d, hh), (-hw, -hw + d, -hh + d, hh - d), (hw - d, hw, -hh + d, hh - d)):
            t_ = K.block(x0, x1, y0, y1, 3, 4.4, stone, bay=3.4); K.hip(x0, x1, y0, y1, t_, 4.5, over=.6)
        for (x0, x1) in ((-hw, -6), (6, hw)):
            t_ = K.block(x0, x1, -hh, -hh + d, 3, 4.4, stone, bay=3.4); K.hip(x0, x1, -hh, -hh + d, t_, 4.5, over=.6)
        t_ = K.block(-6, 6, -hh - 1, -hh + d + 1, 4, 4.4, stone, bay=3.0); K.hip(-6, 6, -hh - 1, -hh + d + 1, t_, 5.0, over=.4)   # 门楼
        for sx in (-1, 1): K.tower(sx * 7.5, -hh - 1, 2.6, 22.0, 6.0, m=stone)
        for (x, y) in ((-hw, hh), (hw, hh)): K.chimney(x + (4 if x < 0 else -4), y - 5, 3 * 4.4 + 3.5, 3.0, m=stone)
    K_.placed(quad, QX, QY, L_HI)
    ctx.anchor('quad', QX + 20, QY - 30, L_HI + 16); ctx.anchor('quad', QX, QY, L_HI + 2)
    # ---- 铜绿圆顶图书馆（北）
    def library():
        stone = M['greystone']
        t_ = K.block(-26, 26, -9, 9, 2, 5.0, stone, bay=3.6); K.hip(-26, 26, -9, 9, t_, 3.5, over=.5)
        K.W.cyl(0, 0, 0, 14.0, 17.0, stone, 40); K.W.cyl(0, 0, 16.5, 14.8, 1.0, M['trim'], 40)
        K.W.cyl(0, 0, 17.5, 11.5, 5.0, stone, 40)
        for k in range(16):
            a = k * math.tau / 16; K.WN.box(11.45 * math.cos(a) - .7, 11.45 * math.cos(a) + .7, 11.45 * math.sin(a) - .7, 11.45 * math.sin(a) + .7, 18.5, 21.5, M['glass'])
        K.R.sphere(0, 0, 22.5, 12.0, M['copper'], sz=.95, seg=40, rings=20, zmin=0.0)
        K.R.cyl(0, 0, 33.8, 2.2, 3.0, M['copper'], 16); K.R.sphere(0, 0, 36.8, 2.4, M['copper'], sz=.8, seg=16, rings=8, zmin=0.0)
        K.portico(0, -14, 14, 5, 9.0, n=6)
    K_.placed(library, -20, 98, L_HI)
    ctx.anchor('library', -20, 98, L_HI + 32)
    # ---- 礼仪大厅（西南，门廊朝南）
    def hall():
        t_ = K.block(-28, 28, -12, 12, 2, 6.5, M['greystone'], bay=4.2, win=(1.6, 4.2)); K.hip(-28, 28, -12, 12, t_, 6.0, over=.6)
        K.portico(0, -12, 20, 6, 11.0, n=6)
        for x in (-20, 20): K.chimney(x, 0, t_ + 3, 3.0, m=M['greystone'])
    K_.placed(hall, -95, -82, L_HI)
    ctx.anchor('hall', -95, -96, L_HI + 12)
    # ---- 2088：玻璃连廊（四合院东翼 → 圆庭）
    K_.placed(lambda: K.glass_gallery([(0, 0.0), (36.0, 0.0)], w=5.0), QX + 36, QY - 16, L_HI)
    ctx.anchor('glass2088', QX + 55, QY - 16, L_HI + 5)
    # ---- 以太修习圆庭：石环 + 地面法阵环（多道同心 + 放射短划）+ 圆心光井
    RC = ctx.B('court'); z0 = L_HI + .08
    RC.cyl(cx, cy, L_HI - .4, cr, .5, M['stone_pale'], 64)
    ring_pts = lambda r, n=96: [(cx + math.cos(a) * r, cy + math.sin(a) * r) for a in (k * math.tau / n for k in range(n))]
    for r_, w_, dsh in ((cr - 1.5, .5, 1), (cr - 4.5, .35, 3), (cr - 8, .4, 1), (cr - 11.5, .3, 2)):
        C.rune_ring(RC, ring_pts(r_), z0 + .05, w_, M['rune_g'], dash=dsh)
    for k in range(12):
        a = k * math.tau / 12; RC.strip([(cx + math.cos(a) * (cr - 8), cy + math.sin(a) * (cr - 8), z0 + .05), (cx + math.cos(a) * (cr - 4.5), cy + math.sin(a) * (cr - 4.5), z0 + .05)], .3, .05, M['rune_g'])
    RC.cyl(cx, cy, z0, 4.5, .12, M['well'], 32); RC.cyl(cx, cy, z0 - .05, cr - 11.5, .08, C.glow('a25_court_floor', c=(.4, .75, 1.0), estr=1.2), 64)
    for k in range(8):
        a = k * math.tau / 8 + .2; x, y = cx + math.cos(a) * (cr + 2.5), cy + math.sin(a) * (cr + 2.5)
        Lb.cyl(x, y, L_HI, .18, 3.2, M['alloy'], 6); Lb.sphere(x, y, L_HI + 3.6, .5, M['holo'], seg=8, rings=4)
    for pth in paths[:4]:
        for (ax, ay), (bx, by) in zip(pth, pth[1:]):
            L_ = math.hypot(bx - ax, by - ay)
            for k in range(1, int(L_ / 14)):
                t = k * 14 / L_; x, y = ax + (bx - ax) * t, ay + (by - ay) * t; nx, ny = -(by - ay) / L_ * 4.5, (bx - ax) / L_ * 4.5
                for sg in (-1, 1):
                    zz = tr.h(x + nx * sg, y + ny * sg); Lb.cyl(x + nx * sg, y + ny * sg, zz, .15, 3.4, M['alloy'], 6); Lb.sphere(x + nx * sg, y + ny * sg, zz + 3.8, .8, M['holo'], seg=8, rings=4)
    ctx.anchor('glass2088', -60, -3, L_HI + 4)
    PV = ctx.B('pavilion'); pvx, pvy, pvz = 20.0, 60.0, L_HI + 12       # 悬浮玻璃亭（图书馆前草地上空）
    PV.cyl(pvx, pvy, pvz, 7.0, .6, M['alloy'], 32); PV.sphere(pvx, pvy, pvz + .6, 6.5, M['glass_roof'], sz=.8, seg=24, rings=12, zmin=0.0)
    PV.cyl(pvx, pvy, pvz - .8, 8.0, .3, M['holo'], 32, r2=8.0, cap=False); ctx.anchor('glass2088', pvx, pvy, pvz + 4)
    mbush = C.flat('a25_orbshrub', (.14, .26, .08), .9, noise=.5)
    for k in range(6):                                                   # 光球花钵：圆庭北路两侧
        for sg in (-1, 1):
            x, y = cx + sg * 6, cy + cr + 8 + k * 8; zz = tr.h(x, y)
            PV.sphere(x, y, zz + 1.6, 1.4, M['glass_roof'], seg=12, rings=8); G.sphere(x, y, zz + 1.2, 1.0, mbush, sz=.8, seg=8, rings=5); Lb.sphere(x, y, zz + 3.3, .5, M['holo'], seg=8, rings=4)
    ctx.anchor('court', cx + 8, cy - 8, z0 + .5); ctx.anchor('glass2088', cx + cr + 2.5, cy + 3, L_HI + 3.6)
    # ---- 运动场：跑道椭圆环 + 内场条纹草坪
    tv = []
    for k in range(64):
        a = k * math.tau / 64
        for s_ in (1.0, 1.14): tv.append((FX + math.cos(a) * FA * s_, FY + math.sin(a) * FB * s_, L_LO + tr.h(FX, FY) - L_LO + .15))
    G.poly(tv, [(2 * k, 2 * ((k + 1) % 64), 2 * ((k + 1) % 64) + 1, 2 * k + 1) for k in range(64)], M['track_r'])
    ctx.anchor('drill', FX, FY + FB * .6, tr.h(FX, FY) + .5); ctx.anchor('drill', (DX0 + DX1) / 2, (DY0 + DY1) / 2, tr.h((DX0 + DX1) / 2, -40) + .5)
    # 操练场：碎石面上的低矮障碍墙、标线
    for k in range(5): G.box(DX0 + 18 + k * 16, DX0 + 20 + k * 16, -70, -52, tr.h(DX0 + 18, -60) - .2, tr.h(DX0 + 18, -60) + 1.4, M['greystone'])
    for k in range(3): G.strip([(DX0 + 6, -20 - k * 8, tr.h(DX0, -20) + .1), (DX1 - 20, -20 - k * 8, tr.h(DX0, -20) + .1)], .35, .03, M['mark'])
    # ---- 悬浮机动装置训练架（操练场北侧）：合金门架 + 悬空环 + 浮动平台
    def trainer():
        TB = ctx.B('trainer'); H = 22.0
        for (x, y) in ((-16, -6), (16, -6), (-16, 6), (16, 6)): TB.cyl(x, y, 0, .6, H, M['alloy'], 10)
        for y in (-6, 6): TB.box(-16.6, 16.6, y - .5, y + .5, H - 1, H, M['alloy'])
        for x in (-16, 0, 16): TB.box(x - .5, x + .5, -6.5, 6.5, H - 1, H, M['alloy'])
        for k, x in enumerate((-10, -2, 6, 12)):
            zz = 8 + k * 3.0; TB.cyl(x, 0, zz, 2.2, .35, M['holo'], 24, cap=False, r2=2.2); TB.tube([(x, 0, zz + 2.2), (x, 0, H - 1)], .06, M['iron'], n=4)
        for k, (x, zz) in enumerate(((-6, 5.0), (10, 11.0))): TB.cyl(x, 0, zz, 3.0, .5, M['alloy'], 20); TB.cyl(x, 0, zz - .2, 3.2, .1, M['aether'], 20)
    tx, ty = 95.0, 22.0
    K_.placed(trainer, tx, ty, tr.h(tx, ty))
    ctx.anchor('trainer', tx, ty, tr.h(tx, ty) + 20)
    # ---- 树：林丘成团、行道紫杉、院外零星橡树
    for k in range(34):
        a = rnd.uniform(0, math.tau); d = 32 * math.sqrt(rnd.random()); x, y = -150 + math.cos(a) * d, 105 + math.sin(a) * d
        if S.frac(x, y) < .93: C.tree(K.T, x, y, rnd.uniform(10, 15), rnd.uniform(4, 6), 'oak' if rnd.random() < .7 else 'cedar', seed=3000 + k, z=tr.h(x, y) - .3)
    for k in range(9):
        for sy in (-1, 1): x = -196 + 18 + k * 12; C.tree(K.T, x, cy + sy * 6, 6, .9, 'yew_col', seed=3100 + k * 2 + (sy > 0), z=tr.h(x, cy + sy * 6))
    for (x, y) in ((-40, 20), (20, 50), (-60, -30), (-150, -100), (30, -95), (175, -110), (178, 130), (-10, -125), (60, 125)):
        if S.frac(x, y) < .92: C.tree(K.T, x, y, rnd.uniform(10, 13), rnd.uniform(4, 5.5), 'oak', seed=int(x * 5 + y), z=tr.h(x, y) - .3)
    # ---- 崖缘岩突（少，规整台地只在转角和西北林丘处露岩）
    for k in range(20):
        a = rnd.uniform(0, math.tau); x, y = S.edge(a, rnd.uniform(.93, .98))
        if abs(a - (DOCK_ANG % math.tau)) < .35 or abs(a - DOCK_ANG) < .35: continue
        C.rock(G, x, y, tr.h(x, y) - 1.0, rnd.uniform(2.5, 5.0), M['crag'], seed=k + 40, facet=.3, sz=rnd.uniform(.5, .9))
    # ---- 崖缘晶簇（学院级：少量）
    MG = ctx.B('rim_crystals')
    for k in range(18):
        a = k * math.tau / 18 + .31; x, y = S.edge(a, 1.0)
        C.crystal_cluster(MG, x, y, tr.h(x * .98, y * .98) - 2.5, rnd.uniform(5, 8), M['crystal'], seed=k * 11 + 5)
        if k in (3, 13): ctx.anchor('glass2088', x, y, tr.h(x * .98, y * .98) + 2)
    # ---- 长条接送平台（东缘操练场一侧）：沿岛缘展开的长甲板，多车位，信标沿外缘，进场光点串
    ex, ey = S.edge(DOCK_ANG, 1.0); ux, uy = math.cos(DOCK_ANG), math.sin(DOCK_ANG); vx, vy = -uy, ux; zd = tr.h(ex * .97, ey * .97) - .2
    loc = lambda u, v, z: (ex + ux * u + vx * v, ey + uy * u + vy * v, z)
    DK = ctx.B('dock_deck'); U0, U1, V = -4.0, 18.0, 42.0
    cr4 = [loc(U0, -V, zd), loc(U1, -V, zd), loc(U1, V, zd), loc(U0, V, zd)]
    DK.poly(cr4 + [(x, y, z - 1.4) for x, y, z in cr4], [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M['deck'])
    for v in range(-36, 37, 12):
        DK.strip([loc(2, v - 5.8, zd + .02), loc(U1 - 2, v - 5.8, zd + .02)], .25, .02, M['mark'])
    for k, v in enumerate(range(-30, 31, 12)):
        if k == 2: continue
        K_.placed(lambda: K_.car(K), *loc(9, v, zd + 1.35)[:2], zd + 1.35, DOCK_ANG + math.pi / 2)
    for v in range(-40, 41, 5): DK.cyl(*loc(U1 + .3, v, 0)[:2], zd - .1, .5, 1.2, M['aether'], 10); DK.sphere(*loc(U1 + .3, v, 0)[:2], zd + 1.4, .7, M['aether'], seg=8, rings=4)
    for u in range(-2, 19, 5):
        for v in (-V - .3, V + .3): DK.cyl(*loc(u, v, 0)[:2], zd - .1, .5, 1.2, M['aether'], 10); DK.sphere(*loc(u, v, 0)[:2], zd + 1.4, .7, M['aether'], seg=8, rings=4)
    ctx.anchor('beacon', *loc(U1, 36, zd + 1.5))
    for v in (-30, 0, 30): DK.tube([loc(U1 - 4, v, zd - 1.4), loc(-10, v, zd - 20)], .7, M['steel'], n=6)
    AP = ctx.B('dock_approach')
    for k in range(1, 12):
        d = U1 + k * 6; x, y, _ = loc(d, 0, 0); AP.sphere(x, y, zd + 1 - d * math.tan(math.radians(5)), .5, M['aether'], seg=8, rings=4)
    ctx.anchor('dock', *loc(9, 20, zd + 2)); ctx.anchor('dock', *loc(9, -24, zd + 2))
    WD = ctx.B('ward'); H = .3 * R; K_.ward_dome(S, lambda x, y: tr.h(x * .99, y * .99), H, M['ward'], WD)
    ctx.anchor('ward', 40, -S.ry * .5, H * .85)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
