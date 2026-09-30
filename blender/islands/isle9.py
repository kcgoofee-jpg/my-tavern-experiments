"""庄园主联盟会所（渲染战役 R `isle:isle9`；设定块 docs/upper-islands-checklist.md「庄园主联盟会所」C1–C2 / S1–S9；设定 §4.6、§8 八角、§9.4）。
卡：庄园主联盟办拍卖会和品鉴会【卡 L151】；春秋拍卖季 + 冬季私人拍卖，只限会员【卡 L377】；卡无固定会所。
岛面 —— 八角台地：中央平台上米黄石意大利宫殿式会所（红陶四坡顶、正门拱廊），后接顶光拍卖厅，玻璃中庭透暖橙光；
        四周三级意式台地花园（挡土墙、对称石阶、绿篱、水渠），秋林成团；南缘环形大平台停十余辆车；结界只剩细线。
岛底 —— 八角棱面的单根粗钝灰岩锥（棱线硬、面平），锥顶一圈结界保险库的暗色合金环 + 暖光灯点；一颗暖色核，一道环。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C
from mathutils import noise as MN, Vector
import isle4 as V4                                   # 秋树（去饱和秋林的同一套树）

ID, NAME = 'isle9', '庄园主联盟会所'
CAM_DROP, CAM_DIST = .34, 3.8
UCAM_DROP, UCAM_DIST = .4, 3.8
LEVELS = [(.34, 20.0), (.56, 12.0), (.76, 5.0)]      # 台地：轮廓分数以内的抬高（米）
PAL = (-30.0, 30.0, -12.0, 12.0)                    # 会所主楼
HALL = (-16.0, 16.0, 12.0, 34.0)                    # 顶光拍卖厅
DOCK_ANG = -math.pi / 2

BOARD_TITLE = '庄园主联盟会所 —— 渲染战役设定对照'
ITEMS = [
    ('card_league', '庄园主联盟：拍卖会与品鉴会，只限会员', 'L151、L377', '✓'),
    ('outline', '八角台地 + 三级意式台地花园', '§8、§4.6', '✓'),
    ('palazzo', '米黄石宫殿式会所，红陶四坡顶，正门拱廊', '§4.6', '✓'),
    ('hall', '顶光拍卖厅，玻璃中庭透暖橙光', '§4.6', '✓'),
    ('garden', '秋林成团 + 绿篱 + 水渠', '§4.6', '✓'),
    ('dock', '环形大平台，十余车位', '§4.6', '✓'),
    ('ward', '结界只剩细线', '§9.4', '✓'),
    ('u_cone', '岛底：八角粗钝灰岩锥 + 保险库合金环', '§9.4、§4.6', '✓'),
]


def _sm(t): t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)


class TerraceTerrain(K_.Terrain):
    """三级台地：按轮廓分数逐级抬高，级间是很窄的陡坎（挡土墙位置）"""
    def base(self, x, y):
        f = self.S.frac(x, y); z = super().base(x, y)
        z += sum((h - hn) * _sm((f0 + .012 - f) / .024) for (f0, h), hn in zip(LEVELS, [l[1] for l in LEVELS[1:]] + [0.0]))
        return z


# ============================================================ 岛面
def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R; rnd = random.Random(99); V4.autumn_mats(M)
    M['lawn9'] = K_.ground_v17('l9_lawn', [(.16, .22, .08), (.2, .24, .09), (.22, .2, .09)], dry=(.42, .34, .16), soil=(.24, .16, .09),
                               rock=(.62, .56, .44), dots=[(.55, .3, .08), (.62, .45, .15)], dot_dens=.25, dot_scale=.8)
    M['gravel9'] = C.flat('l9_gravel', (.62, .56, .45), .95, noise=.5)
    M['terra9'] = C.flat('l9_terracotta', (.5, .17, .07), .75, noise=.35)
    M['stone9'] = C.ashlar('l9_stone', c=(.78, .68, .5), course=.6, block=1.2)
    M['amber9'] = C.glass('l9_amber', tint=(.3, .2, .1), rough=.05, emit=(1.0, .62, .28), estr=3.0)
    M['sky9'] = C.glass('l9_sky', tint=(.5, .55, .5), rough=.05, emit=(1.0, .7, .4), estr=1.2)
    M['chan9'] = C.glass('l9_chan', tint=(.04, .12, .14), rough=.03)
    M['wline9'] = C.glow('l9_wline', c=(.6, .85, 1.0), estr=3.0)
    tr = TerraceTerrain(S, noise=(.3, 40), rough=(.3, 20), brow=(6, 1.6), ground='lawn9')
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    ax = [(0, -S.ry * .95), (0, HALL[3] + 8)]
    tr.path(ax, 10, 'gravel9'); tr.rect(PAL[0] - 8, PAL[1] + 8, PAL[2] - 10, HALL[3] + 6, 'gravel9')
    for sx in (-1, 1): tr.path([(sx * 26, -S.ry * .2), (sx * 26, -S.ry * .75)], 3, 'gravel9')
    tr.build(ctx.B('terrain'), M)
    z0 = tr.h(0, 0)
    ctx.anchor('outline', *S.edge(math.pi / 8, .95), tr.h(*S.edge(math.pi / 8, .9)) + 2)

    def palazzo():                                                                 # 三层宫殿式主楼 + 拍卖厅 + 暖光中庭
        t = K.block(*PAL, 3, 4.6, M['stone9'], bay=3.4, win=(1.3, 2.6)); K.hip(*PAL, t + .5, 5.0, m=M['terra9'], over=.9)
        K.W.box(-7, 7, -5, 5, t + .6, t + 6.5, M['amber9'])                                     # 玻璃中庭：屋面中间透暖橙光
        K.portico(0, PAL[2], 16.0, 5.0, 9.0, n=6, face=-1)
        t2 = K.block(*HALL, 2, 5.0, M['stone9'], bay=4.0, win=(1.6, 3.2)); K.hip(*HALL, t2 + .4, 3.6, m=M['terra9'], over=.7)
        K.W.box(-4, 4, HALL[2] + 2, HALL[3] - 2, t2 + .45, t2 + 4.2, M['sky9'])                     # 顶光：长条玻璃天窗
        return t
    t = K_.placed(palazzo, 0, 0, z0)
    ctx.anchor('palazzo', 0, PAL[2] - 5, z0 + 10); ctx.anchor('card_league', PAL[0] + 8, 0, z0 + t + 3)
    ctx.anchor('hall', 0, (HALL[2] + HALL[3]) / 2, z0 + 14)

    GB = ctx.B('garden'); P8 = S.pts(144)                                            # 挡土墙：每级陡坎外沿一圈米黄石矮墙
    for f0, h in LEVELS:
        ring = [(x * f0, y * f0) for x, y in P8] ; ring.append(ring[0])
        GB.strip([(x, y, tr.h(x * 1.02, y * 1.02) + .9) for x, y in ring], 1.2, 2.4, M['stone9'])
    for y in (-S.ry * .38, -S.ry * .6):                                             # 对称台阶上的绿篱花坛 + 水渠
        for sx in (-1, 1):
            cx = sx * 40; zz = tr.h(cx, y)
            K_.placed(lambda: K.hedge_rect(-12, 12, -6, 6, h=1.1, t=.8), cx, y, zz)
    for sx in (-1, 1): GB.box(sx * 3 - .8, sx * 3 + .8, -S.ry * .8, PAL[2] - 12, tr.h(0, -S.ry * .5) - .3, tr.h(0, -S.ry * .5) + .1, M['chan9'])
    ctx.anchor('garden', 40, -S.ry * .5, tr.h(40, -S.ry * .5) + 6)
    TB = ctx.B('site_trees'); n = 0                                                 # 秋林：外两级台地成团
    for q in range(900):
        x, y = rnd.uniform(-R, R), rnd.uniform(-R, R); f = S.frac(x, y)
        if f < .4 or f > .92 or abs(x) < 12 and y < 0: continue
        if MN.noise(Vector((x / 50, y / 50, 3.3))) < -.05: continue
        if any(abs(x - sx * 40) < 15 and abs(y - yy) < 9 for sx in (-1, 1) for yy in (-S.ry * .38, -S.ry * .6)): continue
        V4.autumn_tree(TB, M, x, y, tr.h(x, y), rnd.uniform(10, 15), rnd.uniform(4.0, 6.0), 700 + n, bare=False); n += 1
        if n > 260: break
    print('isle9 trees', n)
    (px, py), br, dz, ang = K_.dock(K, S, tr, (math.cos(DOCK_ANG), math.sin(DOCK_ANG)), 18.0, cars=7, lights=True)
    ctx.anchor('dock', px, py, dz + 2)
    P = S.pts(288, 1.02); WB = ctx.B('ward')                                        # 结界：只剩一道细亮线
    WB.strip([(x, y, tr.h(x / 1.02 * .98, y / 1.02 * .98) + 6) for x, y in P + P[:1]], .25, .12, M['wline9'])
    ctx.anchor('ward', *S.edge(2.4, 1.02), tr.h(*S.edge(2.4, .95)) + 6)


def octagon(S, n=144):
    cs = [S.edge(math.pi / 8 + k * math.tau / 8) for k in range(8)]; out = []
    for k in range(8):
        (ax, ay), (bx, by) = cs[k], cs[(k + 1) % 8]
        for i in range(n // 8): t = i / (n // 8); out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under')
    mr = ctx.m('rock', lambda: K_.rock_v17('l9_rock17', (.3, .29, .27), (.2, .195, .185), .1, moss=(.2, .22, .12), moss_amt=.2, soil=(.2, .15, .1), lichen=(.55, .53, .48)))
    mb = ctx.m('band', lambda: K_.rock_v17('l9_band17', (.34, .32, .28), (.22, .21, .19), .15, moss=(.22, .26, .12), moss_amt=.45, soil=(.24, .17, .1), lichen=(.6, .58, .5)))
    mv = ctx.m('vault', lambda: C.flat('l9_vault', (.25, .2, .16), .35, metal=.9))
    ml = ctx.m('lamp', lambda: C.glow('l9_lamp', c=(1.0, .7, .4), estr=6))
    mg = ctx.m('core', lambda: C.glow('l9_core', c=(1.0, .7, .4), estr=7))
    P = octagon(S); cliff = 24
    K_.cliff_band(ctx, B, P, cliff, mb)
    rings, apex = K_.body_rings(ctx, P, [(.95, .15), (.9, .4), (.78, .7), (.58, .95), (.36, 1.1), (.18, 1.18), (0, 1.22)], cliff)
    K_.loft(B, rings, mr, apex=apex, smooth=False)
    z = -cliff - .2 * R; pts = K_.ring_at(rings, z); r1 = [((x - ox) * 1.025 + ox, y * 1.025) for x, y in pts]
    K_.loft(B, [(r1, z + .035 * R), (r1, z - .035 * R)], mv, smooth=False)
    for k in range(0, len(r1), 9): x, y = r1[k]; B.cyl(x, y, z - R * .01, R * .012, R * .02, ml, 8)
    z2 = -cliff - .45 * R; p2 = K_.ring_at(rings, z2); x, y = p2[int(len(p2) * .72)]
    K_.glow_orb(B, x, y, z2, R * .05, mg); K_.band(B, p2, z2, R * .006, ml, 1.005, ox)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
