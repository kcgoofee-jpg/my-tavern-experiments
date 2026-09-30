"""精英学院（渲染战役 R `isle:isle25`；设定块 docs/upper-islands-checklist.md「精英学院」C1–C2 / S1–S9；设定 §4.4、§8 方台、§9.3 光柱、§9.4）。
卡：上层贵族子弟的学院，教家族管理、以太魔法修习、政治、礼仪、军事基础【卡 L371】。
岛面 —— 人工找平的圆角方台：中央灰石四合院（草坪方庭），北侧铜绿圆顶图书馆，西侧礼仪大厅；东南以太修习圆庭（地面发光法阵环）；
        西南操练场（碎石）+ 悬浮机动装置训练架；东北运动场；南缘长条接送平台，多车位；细格结界。
岛底 —— 灰色修整石，规整的倒阶梯金字塔（五级，每级平台 + 立面）；第二级立面是观测阶梯教室的一圈晶窗；
        以太修习圆庭的光柱从塔尖穿出；一颗核。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C
from mathutils import noise as MN, Vector

ID, NAME = 'isle25', '精英学院'
CAM_DROP, CAM_DIST = .34, 3.8
UCAM_DROP, UCAM_DIST = .4, 3.8
QUAD = (-34.0, 34.0, -30.0, 30.0)                   # 按 1.5 倍放置（placed k）；地面分区用放大后的框
Q15 = tuple(v * 1.5 for v in (-34.0, 34.0, -30.0, 30.0))                   # 四合院外框（岛本地米）
CIRCLE = (82.0, -60.0, 24.0)                        # 以太修习圆庭 x y r
DRILL = (-120.0, -40.0, -95.0, -30.0)               # 操练场 x0 x1 y0 y1
FIELD = (40.0, 130.0, 40.0, 100.0)                  # 运动场

BOARD_TITLE = '精英学院 —— 渲染战役设定对照'
ITEMS = [
    ('card_academy', '上层贵族子弟的学院：管理、以太、政治、礼仪、军事基础', 'L371', '✓'),
    ('outline', '圆角方台，分区清楚', '§8、§4.4', '✓'),
    ('quad', '灰石四合院 + 草坪方庭', '§4.4', '✓'),
    ('library', '铜绿圆顶图书馆', '§4.4', '✓'),
    ('hall', '礼仪大厅', '§4.4', '✓'),
    ('circle', '以太修习圆庭：地面发光法阵环', '§4.4', '✓'),
    ('rig', '操练场 + 悬浮机动装置训练架', '§4.4', '✓'),
    ('dock', '长条接送平台，多车位，没有校车', '§4.4', '✓'),
    ('u_steps', '岛底：倒阶梯金字塔 + 晶窗带 + 光柱', '§9.4、§9.3', '✓'),
]


# ============================================================ 岛面
def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R; rnd = random.Random(25)
    M['meadow25'] = K_.ground_v17('a25_meadow', [(.14, .22, .07), (.17, .24, .08), (.13, .19, .07)], dry=(.36, .33, .18), soil=(.2, .15, .1),
                                  rock=(.5, .5, .48), dots=[(.62, .6, .45)], dot_dens=.12, slope_rock=False)
    M['lawn25'] = C.flat('a25_lawn', (.1, .2, .05), .9, noise=.3)
    M['pave25'] = C.flat('a25_pave', (.52, .51, .48), .85, noise=.4)
    M['gravel25'] = C.flat('a25_gravel', (.5, .45, .38), .95, noise=.6)
    M['field25'] = C.flat('a25_field', (.12, .25, .07), .85, noise=.2)
    M['line25'] = C.flat('a25_line', (.9, .9, .88), .7)
    M['grey25'] = C.ashlar('a25_grey', c=(.58, .58, .56), course=.55, block=1.1)
    M['copper25'] = C.flat('a25_verdigris', (.3, .5, .43), .55, noise=.25)
    M['slate25'] = C.flat('a25_slate', (.16, .17, .19), .8, noise=.3)
    M['rune25'] = C.glow('a25_rune', c=(.45, .8, 1.0), estr=40.0)
    M['frame25'] = C.flat('a25_frame', (.25, .27, .3), .4, metal=.8)
    M['crown25'] = [C.flat('a25_crown%d' % i, c, .85, noise=.5) for i, c in enumerate(((.1, .2, .06), (.14, .22, .07), (.12, .17, .06)))]
    M['ward25'] = K_.hex_ward('a25_ward', cell=5.0, alpha=.05, estr=.8, c=(.6, .85, 1.0), rim=.25)
    tr = K_.Terrain(S, noise=(.25, 50), rough=(.2, 20), brow=(6, 1.6), ground='meadow25')
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    tr.rect(Q15[0] - 80, Q15[1] + 8, Q15[2] - 8, Q15[3] + 50, 'pave25'); tr.rect(Q15[0] + 15, Q15[1] - 15, Q15[2] + 15, Q15[3] - 15, 'lawn25')
    tr.ell(CIRCLE[0], CIRCLE[1], CIRCLE[2] + 5, CIRCLE[2] + 5, 'pave25')
    tr.rect(*DRILL, 'gravel25'); tr.rect(*FIELD, 'field25')
    tr.path([(0, Q15[2] - 6), (0, -S.ry * .95)], 8, 'pave25'); tr.path([(Q15[1] + 6, -10), (CIRCLE[0], CIRCLE[1])], 5, 'pave25')
    tr.path([(Q15[0] - 70, -10), ((DRILL[0] + DRILL[1]) / 2, DRILL[3])], 5, 'pave25')
    tr.build(ctx.B('terrain'), M)
    z0 = tr.h(0, 0)
    ctx.anchor('outline', *S.edge(math.pi / 4, .95), tr.h(*S.edge(math.pi / 4, .9)) + 2)

    def campus():                                                                  # 四合院四翼 + 北侧圆顶图书馆 + 西侧礼仪大厅
        x0, x1, y0, y1 = QUAD; w = 10
        t = 0
        for (a, b, c, d) in ((x0, x1, y0, y0 + w), (x0, x1, y1 - w, y1), (x0, x0 + w, y0 + w, y1 - w), (x1 - w, x1, y0 + w, y1 - w)):
            t = K.block(a, b, c, d, 3, 4.2, M['grey25'], bay=3.4, win=(1.2, 2.4)); K.hip(a, b, c, d, t + .3, 3.6, m=M['slate25'], over=.5)
        K.W.box(-5, 5, y0 - .3, y0 + w + .3, 0, t + 2.5, M['grey25'])                          # 南门楼
        K.hip(-5, 5, y0 - .3, y0 + w + .3, t + 2.8, 3.0, m=M['slate25'], over=.4)
        lx, ly = 0.0, y1 + 20.0                                                               # 图书馆：八角鼓座 + 铜绿圆顶
        K.W.cyl(lx, ly, 0, 14.0, 13.0, M['grey25'], 8, smooth=False); K.W.cyl(lx, ly, 13.0, 14.6, 1.0, K.M['trim'], 8, smooth=False)
        K.R.sphere(lx, ly, 14.0, 12.5, M['copper25'], sz=.85, seg=32, rings=12); K.R.cyl(lx, ly, 24.5, 1.6, 3.0, M['copper25'], 12)
        hx0, hx1 = x0 - 46, x0 - 14                                                           # 礼仪大厅：长厅 + 高窗 + 门廊
        th = K.block(hx0, hx1, -14, 14, 2, 6.0, M['grey25'], bay=4.2, win=(1.8, 4.2)); K.hip(hx0, hx1, -14, 14, th + .3, 5.0, m=M['slate25'], over=.6)
        return t
    t = K_.placed(campus, 0, 0, z0, 0.0, 1.5)
    t *= 1.5; ctx.anchor('quad', 0, 0, z0 + t + 4); ctx.anchor('card_academy', 20, -20, z0 + t + 2)
    ctx.anchor('library', 0, (QUAD[3] + 20) * 1.5, z0 + 40); ctx.anchor('hall', (QUAD[0] - 30) * 1.5, 0, z0 + 22)

    GB = ctx.B('grounds'); cx, cy, cr = CIRCLE; cz = tr.h(cx, cy) + .12                 # 法阵环：三道同心光环 + 八道径向线
    for k, rr in enumerate((cr, cr * .72, cr * .44)):
        pts = [(cx + math.cos(a) * rr, cy + math.sin(a) * rr, cz) for a in (i * math.tau / 96 for i in range(97))]
        GB.strip(pts, 1.0 if k == 0 else .7, .1, M['rune25'])
    for i in range(8):
        a = i * math.tau / 8; GB.strip([(cx + math.cos(a) * cr * .44, cy + math.sin(a) * cr * .44, cz), (cx + math.cos(a) * cr, cy + math.sin(a) * cr, cz)], .6, .1, M['rune25'])
    ctx.anchor('circle', cx, cy, cz + 3)
    rx_, ry_ = (DRILL[0] + DRILL[1]) / 2, (DRILL[2] + DRILL[3]) / 2; rz = tr.h(rx_, ry_)       # 训练架：钢框塔 + 横梁 + 吊索点
    for dx in (-10, 10):
        for dy in (-4, 4): GB.cyl(rx_ + dx, ry_ + dy, rz, .45, 16.0, M['frame25'], 8, smooth=False)
    for zz in (8.0, 16.0): GB.box(rx_ - 10.5, rx_ + 10.5, ry_ - 4.5, ry_ + 4.5, rz + zz - .4, rz + zz + .2, M['frame25'])
    for q in range(5): GB.cyl(rx_ - 8 + q * 4, ry_, rz + 6.0, .08, 10.0, M['frame25'], 6)
    ctx.anchor('rig', rx_, ry_, rz + 18)
    fz = tr.h((FIELD[0] + FIELD[1]) / 2, (FIELD[2] + FIELD[3]) / 2) + .08                # 运动场白线
    f0, f1, g0, g1 = FIELD[0] + 5, FIELD[1] - 5, FIELD[2] + 5, FIELD[3] - 5
    GB.strip([(f0, g0, fz), (f1, g0, fz), (f1, g1, fz), (f0, g1, fz), (f0, g0, fz)], .35, .04, M['line25'])
    GB.strip([((f0 + f1) / 2, g0, fz), ((f0 + f1) / 2, g1, fz)], .35, .04, M['line25'])
    TB = ctx.B('site_trees'); n = 0                                                 # 边缘行树
    for k in range(120):
        a = k * math.tau / 120; x, y = S.edge(a, .86)
        if abs(x) < 10 and y < 0 or rnd.random() < .3: continue
        h = rnd.uniform(9, 15); r = rnd.uniform(2.6, 4.2); z = tr.h(x, y); TB.cyl(x, y, z - .3, .3, h * .4, C.tree_mats()['bark'], 6, smooth=False)
        TB.sphere(x + rnd.uniform(-1, 1), y + rnd.uniform(-1, 1), z + h * .6, r, M['crown25'][rnd.randrange(3)], sz=h * .4 / r, seg=10, rings=6); n += 1
    for q in range(400):                                                            # 草甸上几片小树丛
        x, y = rnd.uniform(-S.rx, S.rx), rnd.uniform(-S.ry, S.ry)
        if S.frac(x, y) > .8 or MN.noise(Vector((x / 30, y / 30, 5.0))) < .3: continue
        if abs(x) < 130 and abs(y) < 90 and not (x < -60 and y > 30): continue
        h = rnd.uniform(9, 14); r = rnd.uniform(2.8, 4.0); z = tr.h(x, y); TB.cyl(x, y, z - .3, .3, h * .4, C.tree_mats()['bark'], 6, smooth=False)
        TB.sphere(x, y, z + h * .6, r, M['crown25'][rnd.randrange(3)], sz=h * .4 / r, seg=10, rings=6); n += 1
    print('isle25 trees', n)
    for k, a in enumerate((-math.pi / 2 - .22, -math.pi / 2, -math.pi / 2 + .22)):      # 长条接送平台：三座连排甲板
        (px, py), br, dz, ang = K_.dock(K, S, tr, (math.cos(a), math.sin(a)), 9.0, cars=3, lights=(k == 1))
        if k == 1: ctx.anchor('dock', px, py, dz + 2)
    WB = ctx.B('ward'); K_.ward_dome(S, ctx.top_z, 40.0, M['ward25'], WB, s=1.04)
    ctx.anchor('ward', *S.edge(2.0, 1.04), tr.h(*S.edge(2.0, .95)) + 15)


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under')
    mr = ctx.m('rock', lambda: K_.rock_v17('a25_stone17', (.5, .5, .48), (.38, .38, .37), .05, moss=(.2, .24, .12), moss_amt=.12, soil=(.24, .2, .15), lichen=(.62, .62, .58)))
    mb = ctx.m('band', lambda: K_.rock_v17('a25_course17', (.46, .46, .44), (.34, .34, .33), .3, moss=(.2, .24, .12), moss_amt=.1, soil=(.22, .18, .14), lichen=(.6, .6, .56)))
    mw = ctx.m('win', lambda: C.window_grid('a25_windows', lit=(.7, .92, 1.0), estr=4.0, cell=(4.0, 3.0)))
    mg = ctx.m('core', lambda: C.glow('a25_core', c=(.62, .88, 1.0), estr=9))
    mbeam = ctx.m('beam', lambda: C.glow('a25_beam', c=(.7, .92, 1.0), estr=2.0, alpha=.15))
    P = S.pts(144); cliff = 20
    K_.cliff_band(ctx, B, P, cliff, mb)
    ring = lambda s: [(x * s + ox, y * s) for x, y in P]
    z = -cliff; s = .985
    for j, s2 in enumerate((.8, .62, .44, .26)):                                    # 每级：立面（竖直）+ 平台（水平收进）
        z2 = z - .14 * R
        K_.loft(B, [(ring(s), z), (ring(s), z2)], mw if j == 1 else (mb if j % 2 else mr), smooth=False)
        K_.loft(B, [(ring(s), z2), (ring(s2), z2)], mr, smooth=False)
        z, s = z2, s2
    K_.loft(B, [(ring(s), z)], mr, apex=(ox, 0, z - .26 * R), smooth=False)
    K_.glow_orb(B, ox + S.rx * .02, -S.ry * .26, z + .07 * R, R * .05, mg)
    B.cyl(ox, 0, z - .26 * R - 1.8 * R, .025 * R, 1.8 * R + 2, mbeam, 24)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
