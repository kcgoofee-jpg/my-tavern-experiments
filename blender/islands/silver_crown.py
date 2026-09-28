"""银冠堡 v18（设定 docs/upper-setting.md §4.9、§8 要塞方台、§9.4；清单 docs/upper-islands-checklist.md）。
卡：议会骑士团总部，一座悬浮要塞，在上层与中层交界【卡 L48、L152】。全部形制为仓库推断：
  岛面 —— 要塞方台，四角略凸；沿用现有模型的银灰城墙 + 圆塔（port 自 blender/tc_estates.py build_silver_crown，
          重做成 v18 岛面基元：城墙带雉堞、四角 + 四边中段共 8 座圆塔、中央方形主堡）；
          校场 / 内院砂石地；骑士出击坪（悬浮机动装置起降的圆坪 + 信标环）；
          载具检查平台位于升降井口（银冠堡为轴的垂直通道），闸柱 + 拦栏，负责许可核验；结界格边很淡。
  岛底 —— 银灰整块倒金字塔岩座（棱线锐利）；四角各一具悬浮发射器 = 四颗核（已实现，本轮只加锚点）。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C

ID, NAME = 'silver_crown', '银冠堡'
CAM_DROP, CAM_DIST = .3, 4.2
UCAM_DROP, UCAM_DIST = .38, 3.9
# 升降井口检查平台：以银冠堡为轴的垂直通道，朝向取伊甸方向（tc_islands.json：伊甸 (-2,-7)，银冠堡 (-10,13)）
DOCK_ANG = math.atan2(-7.0 - 13.0, -2.0 + 10.0)

BOARD_TITLE = '银冠堡 —— v18 设定对照（沿用现有要塞模型 + 骑士出击坪 / 载具检查平台）'
ITEMS = [
    ('card_hq', '议会骑士团总部，一座悬浮要塞，在上层与中层交界', '卡原文 L48、L152', '✓'),
    ('outline', '轮廓：要塞方台，四角略凸', '仓库推断 §8', '✓'),
    ('walls', '建筑：银灰城墙（雉堞）与圆塔——沿用现有模型', '仓库推断 §4.9', '✓'),
    ('keep', '主堡：中央方形石堡 + 雉堞 + 角楼', '仓库推断', '✓'),
    ('sortie', '骑士出击坪：供悬浮机动装置起降的圆坪 + 信标环', '仓库推断 §4.9', '✓'),
    ('vplat', '载具检查平台：位于升降井口，负责许可核验', '仓库推断 §4.9、§2 L43-47', '✓'),
    ('crystal', '崖缘晶簇更密（次于罗斯柴尔德）', '仓库推断 §2 L36', '✓'),
    ('ward', '结界：格边很淡', '仓库推断 §9.4', '✓'),
    ('u_plinth', '岛底：银灰整块倒金字塔岩座，棱线锐利', '仓库推断 §9.4', '✓'),
    ('u_launcher', '岛底特征：岩座四角各一具悬浮发射器', '仓库推断 §9.4', '✓'),
    ('u_core', '岛底核心：四颗核在四角', '仓库推断 §9.4', '✓'),
    ('well', '银冠堡升降井：以银冠堡为轴的柱状垂直通道（半径尺度是composite层，本岛只做井口检查平台）', '卡原文 L109、仓库推断 §2 L43-47', '弱'),
    ('camp', '骑士团营区在银冠堡正下方（中层，composite 层）', '卡原文 L367', '缺'),
    ('patrol', '骑士团巡空巡逻（composite 层的展开态/航线）', '卡原文 L56、L367', '缺'),
]


def SHAPE_FN(th, r):
    """要塞方台：超椭圆近方形（略偏长于 x）+ 四角轻微外凸（略凸的角楼位）"""
    a, b, n = 148.0, 108.0, 6.0
    c, s = abs(math.cos(th)), abs(math.sin(th))
    rr = 1.0 / ((c / a) ** n + (s / b) ** n) ** (1 / n)
    for k in range(4):
        ca = math.pi / 4 + k * math.pi / 2
        d = math.atan2(math.sin(th - ca), math.cos(th - ca))
        rr *= 1 + .09 * math.exp(-(d / .16) ** 2)
    return rr * (1 + .006 * math.sin(9 * th + .4))


# ============================================================ 岛底（已实现，本轮只补锚点）
def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under')
    mr = ctx.m('rock', lambda: K_.rock_mat('s_rock', (.68, .7, .74), (.55, .57, .6), 0.0))
    mb = ctx.m('band', lambda: C.ashlar('s_wall', c=(.7, .72, .76), course=1.2, block=2.4))
    ma = ctx.m('alloy', lambda: C.flat('s_alloy', (.6, .63, .68), .3, metal=.9))
    mg = ctx.m('core', lambda: C.glow('s_core', c=(.75, .9, 1.0), estr=10))
    cs = [S.edge(math.pi / 4 + k * math.tau / 4) for k in range(4)]
    P = []
    for k in range(4):
        (ax, ay), (bx, by) = cs[k], cs[(k + 1) % 4]
        for i in range(36): t = i / 36; P.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    cliff = 30
    K_.cliff_band(ctx, B, P, cliff, mb, inset=.97)
    B.poly([(x * .97 + ox, y * .97, -cliff) for x, y in cs] + [(ox, 0, -cliff - .95 * R)], [(k, (k + 1) % 4, 4)[::-1] for k in range(4)], mr)
    ctx.anchor('u_plinth', cs[0][0] * .5 + ox, cs[0][1] * .5, -cliff - .3 * R)
    for (x, y) in cs:                                                               # 四角悬浮发射器 = 四颗核
        x, y = x * .8 + ox, y * .8; z = -cliff - .1 * R
        B.cyl(x, y, z - R * .12, R * .08, R * .2, ma, 12); B.cyl(x, y, z - R * .26, R * .11, R * .06, ma, 16, r2=R * .08)
        B.sphere(x, y, z - R * .28, R * .06, mg, seg=16, rings=8); B.cyl(x, y, z - R * .13, R * .08, R * .008, mg, 32, cap=False)
        ctx.anchor('u_launcher', x, y, z - R * .15); ctx.anchor('u_core', x, y, z - R * .28)


# ============================================================ 岛面
def crenellate(B, pts, z, m, tooth=1.4, gap=1.1, h=1.1, t=.5, closed=False):
    """雉堞：沿墙顶一排齿垛"""
    per = tooth + gap
    for (xa, ya), (xb, yb) in zip(pts, pts[1:] + (pts[:1] if closed else [])):
        L = math.hypot(xb - xa, yb - ya)
        if L < 1e-3: continue
        ux, uy = (xb - xa) / L, (yb - ya) / L; nx, ny = -uy, ux
        n = max(1, int(L / per))
        for k in range(n):
            cx, cy = xa + ux * (k + .5) * L / n, ya + uy * (k + .5) * L / n
            if (k * L / n) % per > tooth: continue
            B.box(cx - ux * tooth * .4 - nx * t, cx + ux * tooth * .4 + nx * t, cy - uy * tooth * .4 - ny * t, cy + uy * tooth * .4 + ny * t, z, z + h, m)


def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R
    M['s_wall'] = C.ashlar('sc_wall', c=(.52, .54, .58), course=.55, block=1.15)
    M['s_wall_d'] = C.ashlar('sc_wall_d', c=(.4, .42, .46), course=.5, block=1.05)
    M['s_yard'] = K_.ground_v17('sc_yard', [(.5, .5, .48), (.56, .56, .52), (.46, .46, .43)], dry=(.58, .56, .5), soil=(.42, .4, .35), rock=(.42, .42, .4), slope_rock=False)
    M['s_gravel'] = C.flat('sc_gravel', (.58, .58, .56), .85, noise=.3)
    M['s_deck'] = C.flat('sc_deck', (.52, .54, .57), .5, metal=.35)
    M['s_alloy'] = C.flat('sc_alloy', (.42, .45, .5), .3, metal=.85)
    M['s_holo'] = C.glow('sc_holo', c=(.62, .88, 1.0), estr=4.0)
    M['s_mark'] = C.flat('sc_mark', (.7, .73, .76), .7)
    M['s_crystal'] = C.flat('sc_crystal', (.3, .6, 1.0), .05, emit=(.3, .65, 1.0), estr=1.4)
    M['s_ward'] = K_.hex_ward('sc_ward', cell=9.0, alpha=.16, estr=1.4, rim=.03)     # 格边很淡
    tr = K_.Terrain(S, steps=dict(axis_deg=0, cuts=[], levels=[0.0]), noise=(.25, 40), rough=(.5, 22), brow=(6, 1.6), ground='s_yard')
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    SPx, SPy = -R * .45, R * .45; spr = R * .17
    VPang = DOCK_ANG; VPx0, VPy0 = R * .95 * math.cos(VPang), R * .95 * math.sin(VPang)
    tr.flats += [(-R * .82, R * .82, -R * .82, R * .82, 0.0, 8),                    # 城墙内是人工找平的方台
                 (SPx - spr - 1, SPx + spr + 1, SPy - spr - 1, SPy + spr + 1, 0.0, 3),   # 出击坪：完全找平
                 (VPx0 - 26, VPx0 + 26, VPy0 - 26, VPy0 + 26, 0.0, 6)]              # 检查平台伸出墙外一段也找平
    tr.rect(-R * .74, R * .74, -R * .74, R * .74, 's_gravel')                       # 校场砂石地
    tr.build(ctx.B('terrain'), M)
    ctx.anchor('outline', *S.edge(math.pi / 4, .98), tr.h(*S.edge(math.pi / 4, .95)) + 2)
    ctx.anchor('outline', *S.edge(math.pi / 4 * 3, .98), tr.h(*S.edge(math.pi / 4 * 3, .95)) + 2)
    ctx.anchor('card_hq', 0, R * .1, 40)

    # ---- 城墙 + 雉堞（沿轮廓内收一圈，port 自 tc_estates.build_silver_crown 的城墙 + 圆塔布局；检查平台朝向留一段闸口缺口）
    WB = ctx.B('walls'); wall_h, wall_t = 9.0, 3.0
    P = S.pts(64, .9)
    gate_ang = DOCK_ANG
    for (xa, ya), (xb, yb) in zip(P, P[1:] + P[:1]):
        L = math.hypot(xb - xa, yb - ya)
        if L < 1e-3: continue
        mx, my = (xa + xb) / 2, (ya + yb) / 2
        seg_ang = math.atan2(my, mx); da = math.atan2(math.sin(seg_ang - gate_ang), math.cos(seg_ang - gate_ang))
        if abs(da) < .1: continue                                                   # 闸口缺口：让检查平台的甲板露出去
        ux, uy = (xb - xa) / L, (yb - ya) / L; nx, ny = -uy, ux
        z0 = tr.h(mx, my)
        WB.poly([(xa - nx * wall_t / 2, ya - ny * wall_t / 2, z0), (xb - nx * wall_t / 2, yb - ny * wall_t / 2, z0),
                 (xb + nx * wall_t / 2, yb + ny * wall_t / 2, z0), (xa + nx * wall_t / 2, ya + ny * wall_t / 2, z0),
                 (xa - nx * wall_t / 2, ya - ny * wall_t / 2, z0 + wall_h), (xb - nx * wall_t / 2, yb - ny * wall_t / 2, z0 + wall_h),
                 (xb + nx * wall_t / 2, yb + ny * wall_t / 2, z0 + wall_h), (xa + nx * wall_t / 2, ya + ny * wall_t / 2, z0 + wall_h)],
                [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M['s_wall'])
        z_top = max(z0 + wall_h, tr.h(xa, ya) + wall_h, tr.h(xb, yb) + wall_h)
        crenellate(WB, [(xa, ya), (xb, yb)], z_top, M['s_wall_d'])
    for s_ in (-1, 1):                                                              # 闸口两侧的门柱塔（比常规圆塔矮粗）
        ga = gate_ang + s_ * .13; gx, gy = S.edge(ga, .9); gz = tr.h(gx, gy)
        K.tower(gx, gy, R * .05, wall_h + 1.5, R * .045, m=M['s_wall'])
    # 8 座圆塔：4 角 + 4 边中段
    tower_ang = [math.pi / 4 + k * math.pi / 2 for k in range(4)] + [k * math.pi / 2 for k in range(4)]
    for i, a in enumerate(tower_ang):
        x, y = S.edge(a, .9); z0 = tr.h(x, y); r_t = R * .07 if i < 4 else R * .055
        K.tower(x, y, r_t, wall_h + r_t * 1.6, r_t * 1.1, m=M['s_wall'])
        if i == 0: ctx.anchor('walls', x, y, z0 + wall_h + r_t * 3)
    ctx.anchor('walls', *S.edge(0, .9), tr.h(*S.edge(0, .9)) + wall_h + 2)

    # ---- 主堡：中央方形石堡，雉堞 + 四角小角楼
    def keep():
        hw = R * .16; fh = 6.0; floors = 3
        t_ = K.block(-hw, hw, -hw, hw, floors, fh, M['s_wall'], bay=hw * .6, win=(1.6, 2.4))
        crenellate(K.W, [(-hw, -hw), (hw, -hw), (hw, hw), (-hw, hw)], t_, M['s_wall_d'], tooth=1.6, gap=1.0, h=1.3, t=.55, closed=True)
        for sx, sy in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
            K.tower(sx * hw, sy * hw, hw * .22, t_ + hw * .55, hw * .3, m=M['s_wall'])
        return t_
    t_ = K_.placed(keep, 0, 0, tr.h(0, 0))
    ctx.anchor('keep', 0, 0, tr.h(0, 0) + t_ + R * .1)
    ctx.anchor('card_hq', 0, 0, tr.h(0, 0) + t_ * .5)

    # ---- 骑士出击坪：内院一侧圆坪（比地面抬 .3 m，读得出是甲板而非土丘），供悬浮机动装置起降，信标环 + 若干起降标位
    spz = tr.h(SPx, SPy) + .3
    SP = ctx.B('sortie')
    SP.cyl(SPx, SPy, spz - .32, spr + .9, .3, M['s_alloy'], 40)                      # 合金基座（明显区别于地面）
    SP.cyl(SPx, SPy, spz - .02, spr + .5, .1, M['s_deck'], 40); SP.cyl(SPx, SPy, spz + .01, spr, .02, M['s_mark'], 40)
    for q in range(6):
        a = q * math.tau / 6; x, y = SPx + spr * .72 * math.cos(a), SPy + spr * .72 * math.sin(a)
        SP.cyl(x, y, spz + .02, .6, .015, M['s_mark'], 20); SP.cyl(x, y, spz - .1, .14, .35, M['s_alloy'], 8)
        SP.sphere(x, y, spz + .38, .18, M['s_holo'], seg=8, rings=4)
    C.beacon_ring(SP, SPx, SPy, spz, spr + 1.1, M['s_alloy'], n=10, s=.4)
    ctx.anchor('sortie', SPx, SPy, spz + 2)
    ctx.anchor('sortie', SPx + spr * .6, SPy, spz + 1.5)

    # ---- 载具检查平台：升降井口，闸柱 + 拦栏，负责许可核验；甲板从城墙闸口一直伸到墙外，压在结界边缘外沿
    ang = DOCK_ANG; VPx, VPy = VPx0, VPy0; vpz = tr.h(VPx, VPy)
    ux_, uy_ = math.cos(ang), math.sin(ang); vx_, vy_ = -uy_, ux_
    VP = ctx.B('vplat'); U0, U1, Vh = -18.0, 16.0, 6.0
    loc = lambda u, v, z: (VPx + ux_ * u + vx_ * v, VPy + uy_ * u + vy_ * v, z)
    cr4 = [loc(U0, -Vh, vpz), loc(U1, -Vh, vpz), loc(U1, Vh, vpz), loc(U0, Vh, vpz)]
    VP.poly(cr4 + [(x, y, z - 1.2) for x, y, z in cr4], [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M['s_deck'])
    for v in (-Vh + 1.2, Vh - 1.2):
        VP.strip([loc(U0 + 1, v, vpz + .02), loc(U1 - 1, v, vpz + .02)], .3, .02, M['s_mark'])
    for s_ in (-1, 1):                                                              # 闸柱 + 拦栏（许可核验闸口）
        x, y, _ = loc(6, s_ * (Vh - 1.5), vpz)
        VP.cyl(x, y, vpz, .5, 3.2, M['s_alloy'], 12); VP.sphere(x, y, vpz + 3.4, .35, M['s_holo'], seg=10, rings=5)
    bx, by, _ = loc(6, -(Vh - 1.5), vpz); ex_, ey_, _ = loc(6, Vh - 1.5, vpz)
    VP.tube([(bx, by, vpz + 2.6), (ex_, ey_, vpz + 2.6)], .12, M['s_alloy'], n=6)
    VP.strip([(bx, by, vpz + 2.5), (ex_, ey_, vpz + 2.5)], .2, .06, M['s_holo'])     # 许可核验光闸
    for v in range(int(-Vh), int(Vh) + 1, 3):
        x, y, _ = loc(U1 + .5, v, vpz)
        VP.cyl(x, y, vpz - .1, .3, 1.0, M['s_alloy'], 8); VP.sphere(x, y, vpz + 1.0, .3, M['s_holo'], seg=8, rings=4)
    ctx.anchor('vplat', *loc(6, 0, vpz + 3))
    ctx.anchor('vplat', VPx, VPy, vpz + 1.5)

    # ---- 崖缘晶簇：密度次于罗斯柴尔德（比精英学院密），沿墙外侧斜伸出
    MG = ctx.B('rim_crystals'); rnd = random.Random(53)
    for k in range(34):
        a = rnd.uniform(0, math.tau)
        if abs(math.atan2(math.sin(a - DOCK_ANG), math.cos(a - DOCK_ANG))) < .18: continue    # 让开闸口
        x, y = S.edge(a, 1.0)
        C.crystal_cluster(MG, x, y, tr.h(x * .96, y * .96) - 1.5, rnd.uniform(4, 8), M['s_crystal'], seed=k * 11 + 5)
        if k in (5, 20): ctx.anchor('crystal', x, y, tr.h(x * .96, y * .96) + 2)

    # ---- 结界：格边很淡
    WD = ctx.B('ward'); H = .28 * R; K_.ward_dome(S, lambda x, y: tr.h(x * .99, y * .99), H, M['s_ward'], WD)
    ctx.anchor('ward', -R * .6, -R * .3, H * .85)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
