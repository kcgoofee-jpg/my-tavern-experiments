"""凯莉的宅邸 v17（设定 docs/upper-setting.md §4.5、§8 台地、§9.3 细溪瀑、§9.4；清单 docs/upper-islands-checklist.md）。
卡：凯莉·露易丝，贵族寡妇、首相之妹，住自己的宅邸；放在上层是用户决定【卡 L85、L177、L403】。
其余：
  岛面 —— 圆角近方台地（轮廓加不规则起伏 + 崖缘岩突，破「方蛋糕」）；自南向北三层果园梯台，台缘是弧线砂岩挡墙 + 下方草岩陡坎（高差夸张）；
          台面有丘、洼、岩脊露头；宅邸在最高台；果树成行但分块成团（中间留空地），粉白花冠，行间低矮全息防霜灯；
          砖墙围合菜园；合金骨架弧形玻璃的果园温室长廊；中轴路两侧光球花钵；
          路网分级：米色碎石中轴 > 次级碎石路 > 窄土径；地被：粉白落花 + 嫩绿 + 米色碎石，绿色不占主导；
          水：宅邸东侧泉池 → 石砌溪沟（每道挡墙一段小跌水）→ 下层台的池塘 → 东南崖口宽约 7 m 的溪瀑（带水雾）。
  岛底 —— 浅而宽的蜂蜜色砂岩碗，水平层理 + 层檐，两道小台阶（呼应梯台）；崖缘土层 + 垂根 + 苔；垂藤带粉白花；一颗暖金核、只有一道符文环。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C
from mathutils import noise as MN, Vector

ID, NAME = 'isle10', '凯莉的宅邸'
ROCK, ROCK2 = (.74, .55, .33), (.6, .43, .26)
CAM_DROP, CAM_DIST = .3, 4.3
UCAM_DROP, UCAM_DIST = .22, 3.6
VILLA_SCALE = 1.4
LEVELS = (0.0, 13.0, 28.0)          # 三层梯台（高差夸张）
WALL_H = 3.0                         # 挡墙露出高度；其余高差由墙下陡坎承担
BANK = 24.0                          # 陡坎水平宽

BOARD_TITLE = '凯莉的宅邸 —— v17 设定对照'
ITEMS = [
    ('card_home', '凯莉·露易丝的宅邸（贵族寡妇、首相之妹，住自己的宅邸）', '', '✓'),
    ('outline', '圆角近方台地，缓台阶角；轮廓起伏 + 崖缘岩突', '', '✓'),
    ('terraces', '自南向北三层果园梯台，弧线砂岩挡墙；宅邸在最高台', '', '✓'),
    ('water', '细溪：泉池 → 石砌溪沟逐级跌水 → 池塘 → 东南崖溪瀑', '', '✓'),
    ('orchard', '果树成行（分块成团），粉白花冠；行间全息防霜灯', '', '✓'),
    ('kitchen', '砖墙围合菜园，畦垄成条', '', '✓'),
    ('palette', '地面：粉白落花 + 嫩绿 + 米色碎石，魔导极少（浅绿面积仍偏大）', '', '弱'),
    ('villa', '摄政风白灰泥别墅：半圆弓窗、浅坡石板顶、铁艺阳台', '', '✓'),
    ('glasshouse', '2088 层：果园温室长廊 + 光球花钵，无晶簇', '', '✓'),
    ('dock', '西缘单座小平台，一辆密封悬浮车', '', '✓'),
    ('ward', '结界：近档，淡青六角格边清楚', '', '✓'),
    ('under', '岛底：蜂蜜色砂岩碗，层檐 + 副岩锥、下部暗湿、垂根垂藤；一核一环', '', '✓'),
]


def SHAPE_FN(th, r):
    """打破方正：低频起伏 + 两处岩岬外凸 + 一处小湾"""
    k = 1 + .045 * math.sin(3 * th + .7) + .03 * math.sin(5 * th + 2.1) + .015 * math.sin(11 * th + .4)
    for a0, amp, wd in ((-2.35, .15, .2), (.35, .06, .14), (1.95, -.06, .2), (-.2, -.14, .15), (3.35, -.06, .04), (1.55, -.05, .04), (-.55, -.05, .035), (-1.7, -.04, .03)):
        d = math.atan2(math.sin(th - a0), math.cos(th - a0)); k += amp * math.exp(-(d / wd) ** 2)
    return r * k


def cut_y(i, x):
    """第 i 道台缘的弧线 y(x)"""
    if i == 0: return -46 + 7 * math.sin(x / 38 + .5) + 3 * math.sin(x / 15)
    return 22 + 6 * math.sin(x / 31 + 2.0) + 2.5 * math.sin(x / 13 + 1)


def _sm(t): t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)


class KTerrain(K_.Terrain):
    """台阶线改成弧线；墙下是一段陡坎（草 + 露岩），墙本身只露 WALL_H"""
    def base(self, x, y):
        z = LEVELS[0]
        for i in range(2):
            d = y - cut_y(i, x); dl = LEVELS[i + 1] - LEVELS[i]
            z += dl if d >= 0 else (dl - WALL_H) * _sm((d + BANK) / BANK) ** 1.3
        for m in self.mounds:
            d2 = ((x - m['at'][0]) ** 2 + (y - m['at'][1]) ** 2) / m['r'] ** 2
            z += m['h'] * math.exp(-2.2 * d2) * (1 + .35 * MN.noise(Vector((x * .06, y * .06, 1.3))))
        return z


def curved_walls(S, tr, B, m, cap, gaps=()):
    """沿弧线台缘的挡墙：逐 1.5 m 取点，墙顶 = 上台面 + .9，墙底埋进陡坎；gaps=[(x0, x1)] 留口（跌水 / 台阶）"""
    for i in range(2):
        seg = []
        def flush(seg):
            if len(seg) < 3: return
            vs, fs = [], []
            for (x, y) in seg:
                zt = max(tr.h(x, y + .8), LEVELS[i + 1]) + .9; zb = LEVELS[i + 1] - WALL_H - 1.8
                for (dx, z) in ((-.7, zb), (-.7, zt), (.7, zt), (.7, zb)): vs.append((x, y + dx, z))
            for k in range(len(seg) - 1):
                for q in range(4): a, b = k * 4 + q, k * 4 + (q + 1) % 4; fs.append((a, b, b + 4, a + 4))
            B.poly(vs, fs, m)
            vs2 = [(x, y + dx, max(tr.h(x, y + .8), LEVELS[i + 1]) + .9 + dz) for (x, y) in seg for (dx, dz) in ((-.9, 0), (.9, 0), (.9, .3), (-.9, .3))]
            B.poly(vs2, [(k * 4 + q, k * 4 + (q + 1) % 4, k * 4 + 4 + (q + 1) % 4, k * 4 + 4 + q) for k in range(len(seg) - 1) for q in range(4)], cap)
        for k in range(-200, 201):
            x = k * 1.5; y = cut_y(i, x)
            ok = S.frac(x, y) < .975 and not any(a <= x <= b for (a, b) in gaps)
            if ok: seg.append((x, y))
            else: flush(seg); seg = []
        flush(seg)


def crag(B, x, y, z, r, m, seed, up=1.0):
    """岩突：三五块压扁、错位的岩团叠成一簇"""
    rnd = random.Random(seed)
    for q in range(rnd.randint(3, 5)):
        rr = r * rnd.uniform(.45, .9)
        B.sphere(x + rnd.uniform(-r, r) * .6, y + rnd.uniform(-r, r) * .6, z + rr * .25 * up + rnd.uniform(-.3, .5) * r * .3, rr, m,
                 sz=rnd.uniform(.45, .8) * up, sx=rnd.uniform(.8, 1.4), seg=9, rings=6)


def cliff_soil(ctx, B, P, cliff, m_rock, m_soil, soil_d=3.2, **kw):
    """cliff_v17 的本地版：岛缘下 soil_d 米内的面用土层材质（不同台面高度处都只有一条薄土带），以下是岩"""
    ox = ctx.ox; n = len(P); z0s = [ctx.top_z(x, y) for x, y in P]; dz = kw.get('dz', 1.6)
    nz = max(2, int((max(z0s) + cliff) / dz)); vs = []; inset = kw.get('inset', .985); spur = kw.get('spur', 0.0)
    for j in range(nz + 1):
        t = j / nz
        for (x, y), zt in zip(P, z0s):
            z = zt * (1 - t) - cliff * t; s = 1 + (inset - 1) * t
            if j:
                a = math.atan2(y, x)
                k = K_.strata_k(x, y, z, ctx.seed, kw.get('ledge', .03), kw.get('period', 4.0), kw.get('amp', .025))
                k = 1 + (k - 1) * min(1.0, (zt - z) / 6.0)                   # 岛缘处不外凸（不出悬檐），往下才出层檐
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


def tame_joints(m, big=.022, fine=.3, zs=.3):
    """本岛局部调参：kit 的节理 Voronoi 太密、像碎拼地砖；放大节理块、竖向拉长（砂岩的竖直节理）"""
    for n in m.node_tree.nodes:
        if n.type == 'TEX_VORONOI':
            sc = n.inputs['Scale'].default_value; n.inputs['Scale'].default_value = big if sc < .2 else fine
        if n.type == 'MAPPING' and abs(n.inputs['Scale'].default_value[2] - .55) < 1e-3: n.inputs['Scale'].default_value = (1.0, 1.0, zs)
    return m


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(10)
    mr = ctx.m('rock', lambda: tame_joints(K_.rock_v17('k10_rock17', ROCK, ROCK2, .035, moss=(.24, .34, .1), moss_amt=.85, soil_z=400.0, lichen=(.86, .8, .64)), big=.012, fine=.18))
    mw = ctx.m('rockw', lambda: tame_joints(K_.rock_v17('k10_rock17w', (.5, .37, .24), (.33, .24, .16), .035, moss=(.2, .3, .1), moss_amt=.6, soil_z=400.0, lichen=(.6, .58, .5)), big=.012, fine=.18))
    ms = ctx.m('soil', lambda: K_.rock_v17('k10_soil17', (.3, .2, .12), (.18, .12, .07), .05, moss=(.24, .33, .1), moss_amt=.7, soil_z=400.0))
    mg = ctx.m('core', lambda: C.glow('k10_core', c=(1.0, .8, .45), estr=4.5))
    mring = ctx.m('ring', lambda: C.glow('k10_ring', c=(1.0, .82, .5), estr=1.6))
    mvine = ctx.m('vine', lambda: C.flat('k10_vine', (.2, .32, .1), .9, noise=.4))
    mroot = ctx.m('root', lambda: C.flat('k10_root', (.22, .15, .09), .9, noise=.5))
    mfl = ctx.m('vfl', lambda: C.flat('k10_vfl', (.96, .78, .84), .7))
    P = S.pts(180); cliff = 20
    P1 = cliff_soil(ctx, B, P, cliff, mr, ms, soil_d=4.5, dz=1.4, ledge=.035, period=4.5, amp=.022, spur=.05)
    # 浅碗：两道水平小台阶（呼应梯台），再圆收到浅底；层檐密
    prof = [(.96, .03), (.86, .06), (.85, .11), (.74, .13), (.7, .19), (.56, .26), (.4, .33), (.22, .4), (.08, .45), (0, .47)]
    rings, apex = K_.body_v17(ctx, P1, prof, cliff, dz=2.4, ledge=.075, period=4.5, amp=.04, lo=(.13, .045))
    h = len(rings) // 2                                             # 上半本色砂岩，下半更暗、更湿
    K_.loft(B, rings[:h + 1], mr); K_.loft(B, rings[h:], mw, apex=apex)
    for q, (fr, dd, L, rr) in enumerate(((.18, .2, .16, .09), (.43, .26, .12, .07), (.62, .16, .1, .06), (.9, .3, .14, .08))):   # 几根短副岩锥
        zc = -cliff - dd * R; pc = K_.ring_at(rings, zc); cx, cy = pc[int(len(pc) * fr)]
        K_.cone(B, cx * .9 - ox * .9 + ox, cy * .9, zc + 4, R * rr, R * L, mw, seed=40 + q, rough=.35, ledge=.06)
    z = -cliff - .2 * R; pts = K_.ring_at(rings, z)
    x, y = pts[int(len(pts) * .72)]; K_.glow_orb(B, x, y, z, R * .035, mg)
    K_.band(B, pts, z, R * .005, mring, 1.03, ox)
    ctx.anchor('under', x, y, z)
    zb = -cliff - .06 * R; pb = K_.ring_at(rings, zb); ctx.anchor('under', *pb[int(len(pb) * .78)], zb)
    # 垂根（深褐细根，满周）+ 垂藤（带粉白花，集中南、西）
    K_.hanging(ctx, B, P, 900, (5, 22), mroot, rnd, r=(.3, .6))
    K_.hanging(ctx, B, P, 260, (8, 26), mvine, rnd, r=(.35, .6), flower=mfl)
    K_.hanging(ctx, B, P, 220, (10, 30), mvine, rnd, r=(.35, .7))


# ============================================================ 岛面
SPRING = (44, 42)
CREEK = [SPRING, (40, 32), (33, 22), (30, 8), (36, -8), (31, -26), (27, -46), (30, -62), (34, -80)]
POND = (38, -92, 20, 13)             # 池塘（下层台）：中心、半轴
CREEK2 = [(46, -99), (60, -108), (74, -118)]


def fruit_tree(B, M, x, y, z, h, r, seed):
    rnd = random.Random(seed)
    B.tube([(x, y, z - .2), (x + rnd.uniform(-.3, .3), y + rnd.uniform(-.3, .3), z + h * .45)], .17, C.tree_mats()['bark'], n=6)
    C._cards(B, rnd, (x, y, z + h * .72), (r, r, r * .75), 90, .5, [M['blossom_a'], M['blossom_a'], M['blossom_b'], M['blossom_b'], M['blossom_g']], shell=.6)


def water_line(tr, pts, step=1.5):
    out = []
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, by - ay); n = max(1, int(L / step))
        for k in range(n): t = k / n; out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    out.append(pts[-1]); return out


def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R
    PINK, CREAM = (.95, .74, .8), (.97, .93, .86)
    M['meadow'] = K_.ground_v17('k10_meadow17', [(.36, .52, .18), (.5, .58, .26), (.3, .46, .15)], dry=(.66, .6, .38), soil=(.42, .32, .22),
                                rock=(.7, .58, .4), dots=[PINK, CREAM], dot_dens=.2, dot_scale=.7)
    M['petal'] = K_.ground_v17('k10_petal17', [(.78, .5, .56), (.42, .56, .22), (.82, .6, .6)], dry=(.7, .6, .42), soil=(.45, .34, .24),
                               rock=(.7, .58, .4), dots=[PINK, (.98, .88, .9)], dot_dens=.3, dot_scale=.9)
    M['bloom'] = K_.ground_v17('k10_bloom17', [(.84, .46, .58), (.88, .6, .66), (.44, .56, .24)], dry=(.74, .6, .52), soil=(.45, .34, .24),
                               rock=(.72, .6, .42), dots=[(.95, .5, .66), (.98, .9, .9)], dot_dens=.4, dot_scale=1.1)
    M['lawn'] = K_.ground_v17('k10_lawn17', [(.36, .52, .2), (.42, .56, .24), (.33, .48, .18)], dry=(.62, .6, .4), dots=[CREAM, PINK], dot_dens=.08,
                              stripe=((.4, .56, .22), (.35, .5, .19), 5.0), slope_rock=False)
    M['bank'] = K_.ground_v17('k10_bank17', [(.34, .46, .18), (.46, .5, .24), (.3, .4, .16)], dry=(.62, .56, .36), soil=(.36, .26, .17),
                              rock=(.62, .48, .32), dots=[PINK, CREAM], dot_dens=.2)
    M['gravel_cream'] = C.flat('k10_gravel', (.9, .85, .74), .9, noise=.35)
    M['gravel_2'] = C.flat('k10_gravel2', (.84, .78, .66), .92, noise=.45)
    M['footpath'] = C.flat('k10_foot', (.56, .45, .32), .95, noise=.5)
    M['soil'] = C.flat('k10_soil', (.3, .2, .13), .95, noise=.5)
    M['veg'] = C.flat('k10_veg', (.3, .46, .15), .85, noise=.4)
    M['stucco'] = C.flat('k10_stucco', (.93, .91, .86), .8, noise=.15)   # 本地无 white_stucco 贴图
    M['frost'] = C.glow('k10_frost', c=(.55, .92, 1.0), estr=3.0)
    M['orb'] = C.glow('k10_orb', c=(1.0, .9, .72), estr=6.0)
    M['blossom_a'] = C.flat('k10_bl_pink', (.96, .52, .68), .7, noise=.2)
    M['blossom_b'] = C.flat('k10_bl_white', (.98, .9, .92), .7, noise=.2)
    M['blossom_g'] = C.flat('k10_bl_leaf', (.36, .5, .18), .8, noise=.3)
    M['creek'] = C.flat('k10_creek', (.26, .5, .62), .02, metal=.3, coat=1.0)
    M['pool'] = C.flat('k10_pool', (.2, .42, .55), .02, metal=.35, coat=1.0)
    M['foam'] = C.flat('k10_foam', (.93, .96, 1.0), .5)
    M['mist'] = C.glow('k10_lipmist', c=(.95, .97, 1.0), estr=.25, alpha=.07)
    M['citrus'] = C.flat('k10_citrus', (.95, .55, .1), .5)
    M['crag'] = tame_joints(K_.rock_v17('k10_crag17', ROCK, ROCK2, .22, moss=(.3, .38, .14), moss_amt=.45, soil_z=400.0, lichen=(.88, .84, .7)), big=.08, fine=.5)
    M['ward'] = K_.hex_ward('k10_ward17', cell=9.0, alpha=.3, estr=2.2, rim=.28)
    tr = KTerrain(S, steps=None, noise=(.5, 30), rough=(1.6, 22), brow=(8, 2.8), ground='meadow',
                  mounds=[dict(at=(-78, -100), r=30, h=5.0), dict(at=(92, -30), r=24, h=4.0), dict(at=(-92, -8), r=20, h=3.5),
                          dict(at=(-40, -10), r=16, h=-2.2), dict(at=(-60, 105), r=24, h=4.5), dict(at=(100, 110), r=18, h=-1.8),
                          dict(at=(-20, -118), r=18, h=2.5)],
                  ridges=[dict(pts=[(-118, -72), (-104, -40), (-112, -10)], w=13, h=6.0), dict(pts=[(108, -70), (118, -40)], w=11, h=5.0),
                          dict(pts=CREEK, w=5.5, h=-1.3), dict(pts=CREEK2 + [(90, -130)], w=6, h=-1.4)])
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    L2 = LEVELS[2]; px, py, pa, pb = POND
    tr.flats += [(-34, 50, 56, 86, L2, 6), (-120, -25, 44, 56, L2, 5), (36, 108, 36, 104, L2, 5),
                 (SPRING[0] - 3, SPRING[0] + 3, SPRING[1] - 3, SPRING[1] + 3, L2 - .8, 4), (px - pa * .55, px + pa * .55, py - pb * .5, py + pb * .5, -1.6, 7)]
    # ---- 地被分区（后加的优先）
    orch = lambda x, y: y < cut_y(1, x) - BANK and y > -200
    bank = lambda x, y: any(-BANK - 1 < y - cut_y(i, x) < 0 for i in range(2))
    tr.fn(lambda x, y: orch(x, y) and not bank(x, y), 'petal')
    tr.fn(lambda x, y: MN.noise(Vector((x * .03, y * .03, 7.7))) > .36 and not bank(x, y), 'bloom')      # 成片的粉白花甸
    tr.fn(bank, 'bank')
    tr.fn(lambda x, y: y > cut_y(1, x) and abs(x) < 34 and 30 < y < 58, 'lawn')                           # 宅前小草坪（唯一一块规整绿）
    tr.rect(36, 108, 36, 104, 'soil')
    tr.ell(px, py, pa + 3.5, pb + 3.5, 'gravel_2')                                                        # 池岸碎石
    # 路网：中轴（6 m 米色碎石）> 次级碎石路（3.5 m）> 窄土径（1.6 m）
    dock_ang = math.atan2(-.5, -1.0); de = S.edge(dock_ang, .93)
    main = [(0, -S.ry * 1.05), (0, 52)]
    sec = [[(-2, -78), (-40, -74), (-80, -70), de], [(2, -8), (40, -2), (78, -12), (104, -6)], [(-2, -12), (-50, -20), (-96, -18)],
           [(0, 40), (-30, 50), (-118, 50)], [(4, 44), (30, 46), (SPRING[0] - 4, SPRING[1])]]
    foot = [[(2, -100), (20, -96), (px - pa, py)], [(px + pa, py + 2), (60, -70), (84, -60), (98, -80)], [(-4, -30), (-22, -38), (-40, -10), (-62, -2)],
            [(-60, -70), (-72, -96), (-50, -118)], [(30, -30), (48, -40), (70, -34)], [(-60, 60), (-60, 96), (-30, 112), (10, 118)]]
    for f in foot: tr.path(f, 2.0, 'footpath')
    for s in sec: tr.path(s, 4.2, 'gravel_2')
    tr.path(main, 6.0, 'gravel_cream'); tr.ell(0, 44, 20, 9, 'gravel_cream')
    tr.build(ctx.B('terrain'), M)
    stone = M['stone_sand']
    curved_walls(S, tr, ctx.B('walls'), stone, stone, gaps=[(-4, 4)] + [(x - 3.5, x + 3.5) for x in (33.5, 27.3)])
    OT = ctx.B('orchard'); Lb = ctx.B('lamps'); W = ctx.B('water'); RK = ctx.B('crags'); ST = ctx.B('stairs')
    # 中轴过墙石阶
    for i in range(2):
        yc = cut_y(i, 0); z0 = tr.h(0, yc - BANK - 1); z1 = LEVELS[i + 1]; n = 16
        for k in range(n):
            y0 = yc - BANK - 1 + k * (BANK + 1) / n; ST.box(-3.4, 3.4, y0, y0 + (BANK + 1) / n + .05, z0 - 2, z0 + (z1 - z0) * (k + 1) / n + .05, stone)
        for sx in (-1, 1): ST.box(sx * 3.4 - .6, sx * 3.4 + .6, yc - BANK - 1, yc + .5, z0 - 2, z1 + 1.0, stone)
    # 摄政风白灰泥别墅
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
        K.block(21, 33, -5, 7, 1, 4.0, M['stucco'], bay=3.0); K.hip(21, 33, -5, 7, 4.55, 2.4, over=1.0)
    K_.placed(villa, 0, 71, L2, 0.0, VILLA_SCALE)
    ctx.anchor('villa', -20, 60, L2 + 10); ctx.anchor('card_home', 12, 75, L2 + 16)
    def glasshouse():
        GH = ctx.B('glasshouse'); arc = lambda x: [(x, 4 * math.cos(t), 3.1 + 4 * math.sin(t)) for t in (i * math.pi / 10 for i in range(11))]
        GH.box(-45, 45, -4, 4, 0, .9, M['stone_sand']); GH.box(-45, 45, -4, 4, .9, 3.1, M['glass_roof'])
        for k in range(31): GH.tube(arc(-45 + k * 3.0), .11, M['alloy'], n=5)
        GH.poly(arc(-45) + arc(45), [(i, i + 1, 12 + i, 11 + i) for i in range(10)], M['glass_roof'])
        for k in range(14):
            x = -40 + k * 6.1; GH.sphere(x, 0, 2.6, 1.3, M['blossom_g'], seg=10, rings=6)
            for q in range(4): GH.sphere(x + math.cos(q) * 1.1, math.sin(q) * 1.1, 2.6 + .4 * (q % 2), .22, M['citrus'], seg=6, rings=4)
    K_.placed(glasshouse, -72, 50, L2)
    ctx.anchor('glasshouse', -72, 50, L2 + 6)
    def kitchen():
        KG = ctx.B('kitchen'); x0, x1, y0, y1 = -34, 34, -32, 32
        for (a, b, c, d) in ((x0, -3, y0, y0 + .6), (3, x1, y0, y0 + .6), (x0, x1, y1 - .6, y1), (x0, x0 + .6, y0, y1), (x1 - .6, x1, y0, y1)): KG.box(a, b, c, d, -.5, 2.8, M['brick'])
        for k in range(14): y = y0 + 3 + k * 4.3; KG.box(x0 + 3, x1 - 3, y, y + 1.9, 0, .35, M['veg'] if k % 3 else M['blossom_g'])
        KG.box(x0 + 2, x1 - 2, y1 - 4, y1 - .6, 0, 3.2, M['glass_roof'])
    K_.placed(kitchen, 72, 70, L2)
    ctx.anchor('kitchen', 72, 55, L2 + 1)
    # ---- 水：泉池 → 溪沟（石砌岸）→ 每道挡墙一段跌水 → 池塘 → 东南崖口溪瀑
    sx_, sy_ = SPRING; zs = L2 - .8
    W.cyl(sx_, sy_, zs - .6, 7.5, 1.3, stone, 28); W.cyl(sx_, sy_, zs + .55, 6.4, .12, M['pool'], 28)
    for q in range(3): W.cyl(sx_ + 2 * math.cos(q * 2.1), sy_ + 2 * math.sin(q * 2.1), zs + .5, .6 + .25 * q, .2, M['foam'], 10)
    wl = water_line(tr, CREEK[1:])
    creek_pts = [(x, y, tr.h(x, y)) for x, y in wl]
    def lay(pts, w, h, dz, m):
        for a, b in zip(pts, pts[1:]): W.strip([(a[0], a[1], a[2] + dz), (b[0], b[1], b[2] + dz)], w, h, m)
    # 石岸（两条窄条）+ 水面（按坡度分：平段清水，陡段白色跌水）
    for s_ in (-1, 1):
        edge = []
        for k, (x, y, z) in enumerate(creek_pts):
            (ax, ay, _), (bx, by, _) = creek_pts[max(0, k - 1)], creek_pts[min(len(creek_pts) - 1, k + 1)]
            tx, ty = bx - ax, by - ay; l = math.hypot(tx, ty) or 1; nx, ny = -ty / l, tx / l
            edge.append((x + nx * 3.9 * s_, y + ny * 3.4 * s_, z + .15))
        lay(edge, 1.3, .9, 0, stone)
    for a, b in zip(creek_pts, creek_pts[1:]):
        steep = abs(b[2] - a[2]) / max(.1, math.hypot(b[0] - a[0], b[1] - a[1])) > .5
        W.strip([(a[0], a[1], a[2] + .25), (b[0], b[1], b[2] + .25)], 6.2, .3 if not steep else .6, M['foam'] if steep else M['creek'])
    # 挡墙处跌水：墙顶到墙脚一道白水帘 + 墙脚小水潭
    for i, xw in ((1, 33.5), (0, 27.3)):
        yc = cut_y(i, xw); zt = LEVELS[i + 1] + .2; zb = tr.h(xw, yc - 3)
        W.poly([(xw - 2.6, yc + .8, zt), (xw + 2.6, yc + .8, zt), (xw + 3.0, yc - 1.4, zb + .3), (xw - 3.0, yc - 1.4, zb + .3)], [(0, 1, 2, 3)], M['foam'])
        W.sphere(xw, yc - 2.2, zb + .3, 3.6, M['foam'], sz=.25, seg=12, rings=5)
        if i == 0: ctx.anchor('water', xw, yc - 2, zb + 2)
    # 池塘（下层台）
    pv = [(px + (pa + 2) * math.cos(t) * (1 + .08 * math.sin(3 * t)), py + (pb + 2) * math.sin(t) * (1 + .08 * math.cos(2 * t)), -.55) for t in (k * math.tau / 40 for k in range(40))]
    W.poly(pv + [(px, py, -.55)], [(k, (k + 1) % 40, 40) for k in range(40)], M['pool'])
    for k in range(7):
        a = k * .9 + .3; crag(W, px + (pa + 3.5) * math.cos(a), py + (pb + 3.5) * math.sin(a), -.6, 1.6, M['crag'], 700 + k, up=.6)
    ctx.anchor('water', px, py, 0)
    # 出水溪 → 崖口
    ang = math.atan2(-118, 74); ex, ey = S.edge(ang, 1.0)
    wl2 = water_line(tr, [(px + pa * .9, py - pb * .6)] + CREEK2 + [(ex, ey)])
    p2 = [(x, y, tr.h(x, y)) for x, y in wl2 if S.frac(x, y) < .97] + [(ex, ey, tr.h(ex, ey) - .3)]
    for a, b in zip(p2, p2[1:]): W.strip([(a[0], a[1], a[2] + .25), (b[0], b[1], b[2] + .25)], 7.0, .3, M['creek'])
    ez = tr.h(ex, ey)
    ux, uy = math.cos(ang), math.sin(ang); fx, fy = ex + ux * 7, ey + uy * 7          # 水舌先抛出崖口几米，再垂落，避开崖檐
    lip = [(ex + ux * t, ey + uy * t, ez - .1 - .09 * t * t) for t in (0, 2, 4, 5.5, 7)]
    for a, b in zip(lip, lip[1:]): W.strip([a, b], 9.0, .5, M['foam'])
    K_.waterfall(fx, fy, lip[-1][2], ang, 3.0, R * .7, 1.6, .7, name='k10_creek')
    K_.waterfall(fx + ux, fy + uy, lip[-1][2] - .3, ang, 1.2, R * .5, 2.0, .85, name='k10_creek_core')
    K_.waterfall(fx - ux, fy - uy, lip[-1][2] - 1, ang, 5.0, R * .8, .5, .25, name='k10_creek_splay')    # 外层散帘：越往下越宽
    rt = random.Random(5)
    for q in range(26):                                              # 翻白的崖口水舌
        t = rt.uniform(0, 7); w_ = rt.uniform(-4.5, 4.5)
        W.sphere(ex + ux * t - uy * w_, ey + uy * t + ux * w_, ez - .09 * t * t + .2, rt.uniform(.8, 1.6), M['foam'], sz=.5, seg=8, rings=5)
    for q in range(14):                                              # 水雾羽：沿水帘向下越来越大
        t = q / 13; zq = lip[-1][2] - 4 - t * R * .8; rq = 4 + t * 14
        W.sphere(fx + ux * (2 + t * 8) - uy * rt.uniform(-4, 4) * (1 + t), fy + uy * (2 + t * 8) + ux * rt.uniform(-4, 4) * (1 + t), zq, rq, M['mist'], sz=.8, seg=20, rings=12)
    ctx.anchor('water', ex, ey, ez - 8)
    # ---- 果园：行列，但按噪声分成几块（中间留空地、花甸）；行间低矮全息防霜灯（稀）
    rnd = random.Random(10); k = 0; first = None
    for band_i in range(2):
        y = -200 if band_i == 0 else cut_y(0, 0) + 4
        while y < 200:
            x = -S.rx
            while x < S.rx:
                yb = y + (cut_y(0, x) - cut_y(0, 0)) * .5
                zone_ok = (band_i == 0 and yb < cut_y(0, x) - BANK - 2) or (band_i == 1 and cut_y(0, x) + 4 < yb < cut_y(1, x) - BANK - 2)
                if zone_ok and abs(x) > 6 and S.frac(x, yb) < .88 and MN.noise(Vector((x * .025, yb * .025, 2.2))) < .18 \
                        and K_.seg_dist(x, yb, CREEK) > 8 and K_.seg_dist(x, yb, CREEK2) > 7 and ((x - px) / (pa + 7)) ** 2 + ((yb - py) / (pb + 7)) ** 2 > 1 \
                        and all(K_.seg_dist(x, yb, s) > 4.5 for s in sec[:3]) and tr.zone(x, yb) not in ('bloom', 'footpath'):
                    z = tr.h(x, yb); fruit_tree(OT, M, x + rnd.uniform(-.4, .4), yb, z - .1, rnd.uniform(4.4, 5.8), rnd.uniform(2.7, 3.5), 5000 + k); k += 1
                    if first is None and x > 10: first = (x, yb, z + 5)
                    if k % 7 == 0: L_z = tr.h(x + 3.2, yb + 3.5); Lb.cyl(x + 3.2, yb + 3.5, L_z, .15, 1.2, M['alloy'], 6); Lb.sphere(x + 3.2, yb + 3.5, L_z + 1.35, .4, M['frost'], seg=8, rings=4)
                x += 8.5
            y += 9.0
            if band_i == 0 and y > cut_y(0, 0) - BANK: break
            if band_i == 1 and y > cut_y(1, 0) - BANK: break
    print('ORCHARD TREES', k)
    ctx.anchor('orchard', 60, -20, tr.h(60, -20) + 5)
    # 光球花钵：沿中轴路成对
    for y in (-110, -84, -60, -24, -2, 44):
        for sx in (-1, 1):
            x = sx * 5.2; z = tr.h(x, y); Lb.cyl(x, y, z + 1.3, .9, .5, M['alloy'], 16, r2=1.2)
            C._cards(Lb, random.Random(int(y * 10 + sx)), (x, y, z + 2.0), (1.0, 1.0, .5), 25, .3, [M['blossom_a'], M['blossom_b'], M['blossom_g']], shell=.5)
            Lb.sphere(x, y, z + .7, .38, M['orb'], seg=10, rings=6)
    # 成团的庭荫树（不绕岛一圈）：宅后一团、西北一团、东坡一团
    for (cx, cy, n, sd) in ((-50, 100, 6, 1), (20, 112, 5, 2), (100, -40, 4, 3), (-100, -30, 3, 4)):
        r2 = random.Random(sd)
        for q in range(n):
            x, y = cx + r2.uniform(-14, 14), cy + r2.uniform(-10, 10)
            if S.frac(x, y) < .9: C.tree(K.T, x, y, r2.uniform(9, 13), r2.uniform(3.8, 5.2), 'oak', seed=int(x * 3 + y), z=tr.h(x, y) - .2)
    for q in range(9): C.tree(K.T, -22 + q * 5.5, 32 + 1.5 * math.sin(q), 4.5, .8, 'yew', seed=610 + q, z=tr.h(-22 + q * 5.5, 32))
    # ---- 岩突：崖缘岩岬、陡坎露头、岩脊上的岩簇
    r3 = random.Random(77)
    for q in range(46):
        a = r3.uniform(0, math.tau); f = r3.uniform(.9, .985); x, y = S.edge(a, f)
        if abs(a - dock_ang) < .15 or math.hypot(x - ex, y - ey) < 14: continue
        crag(RK, x, y, tr.h(x, y) - .8, r3.uniform(2.2, 5.0), M['crag'], 900 + q)
    for (x, y) in ((-112, -58), (-106, -36), (-110, -16), (112, -60), (116, -44), (-60, -44), (70, -40), (-88, 12), (84, 18)):
        crag(RK, x, y, tr.h(x, y) - .6, r3.uniform(3.0, 5.5), M['crag'], int(x * 7 + y), up=1.3)
    for i in range(2):
        for q in range(-9, 10):
            x = q * 13 + r3.uniform(-4, 4); y = cut_y(i, x) - r3.uniform(5, BANK - 4)
            if S.frac(x, y) > .9 or abs(x) < 8 or abs(x - 30) < 9: continue
            if r3.random() < .6: crag(RK, x, y, tr.h(x, y) - .8, r3.uniform(2.0, 4.0), M['crag'], 1300 + q * 3 + i)
            else: C.tree(K.T, x, y, r3.uniform(4, 6), r3.uniform(1.8, 2.6), 'oak', seed=1400 + q * 5 + i, z=tr.h(x, y) - .3)
    ctx.anchor('outline', *S.edge(-2.35, .97), tr.h(*S.edge(-2.35, .97)) + 2)
    ctx.anchor('terraces', -40, cut_y(0, -40), LEVELS[1] + 1)
    ctx.anchor('palette', -20, -70, tr.h(-20, -70))
    dres = K_.dock(K, S, tr, (math.cos(dock_ang), math.sin(dock_ang)), 9, cars=1, approach_m=60)
    ctx.anchor('dock', dres[0][0], dres[0][1], dres[2] + 1.5)
    WD = ctx.B('ward'); H = .33 * R; K_.ward_dome(S, lambda x, y: tr.h(x * .99, y * .99), H, M['ward'], WD)
    ctx.anchor('ward', 0, -S.ry * .55, tr.h(0, -S.ry * .55) + H * .8)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
