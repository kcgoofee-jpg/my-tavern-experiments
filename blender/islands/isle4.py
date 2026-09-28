"""维克多庄园 v18（设定 docs/upper-setting.md §4.7、§8 斜长脊、§9.3 干瀑槽、§9.4；清单 docs/upper-islands-checklist.md）。
卡：凯莉亡夫的庄园，现在已不属于她【卡 L86】；埃德蒙·维克多伯爵已故【卡 L191】；位置卡没写，数据里记为 unplaced【卡 L404】。
其余全部仓库推断：
  岛面 —— 斜长脊，末端下垂；沿长轴向东北一端倾斜的长坡，旧宅在高端（西南）；去饱和秋林（暗橙、灰褐树冠），落叶满地，几株已光秃；
          旧砖褐英式旧宅，藤蔓半掩、几处瓦片缺损；崖缘一道干涸瀑布槽，只剩苔痕、枯根垂下；旧停靠平台，信标少一半（一半熄灭 / 缺失）；
          结界看不到，不建穹面；不加晶簇（联盟只在活跃的岛才加）。
  岛底 —— 锈褐砂岩，锥体随脊向东北倾斜下垂，锥尖在约 3/4 处断裂（断口碎石、裸露内芯）；崖缘薄土 + 枯苔 + 枯根；
          一颗弱核（光很弱、忽明忽暗），一道符文环暗着（几乎不发光）。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C
from mathutils import noise as MN, Vector

ID, NAME = 'isle4', '维克多庄园'
ROCK, ROCK2 = (.42, .27, .18), (.28, .18, .12)
CAM_DROP, CAM_DIST = .32, 4.2
UCAM_DROP, UCAM_DIST = .3, 3.8
AXIS = 2.4                          # 脊向：tc_islands.json isle4 silhouette.dir（斜长脊长轴）
HOUSE_Z, DROOP_Z = 46.0, -34.0       # 高端（旧宅）与末端下垂处的高差（v18 修订：拉大坡度，斜长脊要看得出来）
EDEN = (-2.0, -7.0); SELF = (9.0, 10.0)               # tc_islands.json：伊甸 / 本岛世界坐标
DOCK_ANG = math.atan2(EDEN[1] - SELF[1], EDEN[0] - SELF[0])

BOARD_TITLE = '维克多庄园 —— v18 设定对照'
ITEMS = [
    ('card_home', '凯莉亡夫的庄园，现已不属于她；埃德蒙·维克多伯爵已故', '卡原文 L86、L191', '✓'),
    ('unplaced', '位置卡没写，数据记为 unplaced；放上层是仓库布局', '卡原文 L404 / 仓库推断', '—'),
    ('outline', '轮廓：斜长脊，末端下垂', '仓库推断', '✓'),
    ('slope', '地形：向东北一端倾斜的长坡，旧宅在高端（西南）', '仓库推断', '✓'),
    ('autumn', '种植：去饱和秋林（暗橙 / 灰褐），落叶满地，几株已光秃', '仓库推断', '✓'),
    ('manor', '建筑：旧砖褐英式旧宅，藤蔓半掩、瓦片缺损', '仓库推断', '✓'),
    ('dryfall', '崖缘干涸瀑布槽，只剩苔痕、零星水线；枯根垂下', '仓库推断', '✓'),
    ('dock', '旧平台，信标少一半（熄灭 / 缺失）；朝伊甸方向', '仓库推断', '✓'),
    ('ward', '结界：看不到，不建穹面', '仓库推断', '—'),
    ('u_rock', '岛底：锈褐砂岩，锥体随脊向东北倾斜下垂', '仓库推断', '✓'),
    ('u_broken', '锥尖在约 3/4 处断裂，断口碎石、裸露内芯', '仓库推断', '✓'),
    ('u_root', '崖缘薄土 + 枯苔 + 枯根', '仓库推断', '✓'),
    ('u_core', '一颗弱核（光很弱、忽明忽暗），一道符文环暗着', '仓库推断', '✓'),
    ('legacy', '大概率作为遗产转给维克多家其他继承人，和凯莉再无关系（叙事，非可视条目）', '仓库推断', '—'),
]


def SHAPE_FN(th, r):
    """斜长脊：沿 AXIS 方向的一端（droop）收窄下垂，另一端（house）略钝；轮廓加不规则起伏与几处崖缘缺口"""
    d = math.atan2(math.sin(th - AXIS), math.cos(th - AXIS))       # 0 = droop 端方向，±pi = house 端
    k = 1 + .022 * math.sin(3 * th + .6) + .014 * math.sin(7 * th + 1.7) + .008 * math.sin(13 * th + .3)
    k -= .34 * math.exp(-((d) / .5) ** 2)                          # droop 端收窄
    k += .1 * math.exp(-((abs(d) - math.pi) / .55) ** 2)           # house 端略外扩
    for a0, amp, wd in ((AXIS + .9, -.05, .16), (AXIS - 1.1, -.045, .14), (AXIS + math.pi + .6, .03, .12)):
        dd = math.atan2(math.sin(th - a0), math.cos(th - a0)); k += amp * math.exp(-(dd / wd) ** 2)
    return r * k


def crag(B, x, y, z, r, m, seed, up=1.0):
    rnd = random.Random(seed)
    for q in range(rnd.randint(3, 5)):
        rr = r * rnd.uniform(.45, .9)
        B.sphere(x + rnd.uniform(-r, r) * .6, y + rnd.uniform(-r, r) * .6, z + rr * .25 * up + rnd.uniform(-.3, .5) * r * .3, rr, m,
                 sz=rnd.uniform(.45, .8) * up, sx=rnd.uniform(.8, 1.4), seg=9, rings=6)


def tame_joints(m, big=.02, fine=.28, zs=.35):
    for n in m.node_tree.nodes:
        if n.type == 'TEX_VORONOI':
            sc = n.inputs['Scale'].default_value; n.inputs['Scale'].default_value = big if sc < .2 else fine
        if n.type == 'MAPPING' and abs(n.inputs['Scale'].default_value[2] - .55) < 1e-3: n.inputs['Scale'].default_value = (1.0, 1.0, zs)
    return m


class KTerrain(K_.Terrain):
    """斜长脊：沿 AXIS 方向线性下沉（house 高、droop 低），末端额外加速下垂；叠丘、噪声"""
    def base(self, x, y):
        p = x * math.cos(AXIS) + y * math.sin(AXIS)                # -R(house 侧) .. +R(droop 侧)
        R = self.S.R; t = max(0.0, min(1.0, (p + R) / (2 * R)))     # 0=house, 1=droop
        z = HOUSE_Z + (DROOP_Z - HOUSE_Z) * (t ** 1.4)              # 越靠 droop 端下沉越快（末端下垂）
        for m in self.mounds:
            d2 = ((x - m['at'][0]) ** 2 + (y - m['at'][1]) ** 2) / m['r'] ** 2
            z += m['h'] * math.exp(-2.2 * d2) * (1 + .35 * MN.noise(Vector((x * .06, y * .06, 1.3))))
        return z


def autumnize_trees():
    """把共享的 tree_mats() 叶片颜色改成去饱和秋林（暗橙 / 赭黄 / 灰褐）；本进程只建这一座岛，改了不影响别的岛。"""
    M = C.tree_mats()
    for key, col in (('leaf_a', (.36, .19, .07)), ('leaf_b', (.46, .28, .1)), ('leaf_c', (.3, .26, .16))):
        m = M[key]
        for n in m.node_tree.nodes:
            if n.type == 'MIX':
                try: n.inputs[7].default_value = (*col, 1)
                except Exception: pass


def dead_tree(K_T, x, y, z, h, r, seed, bare=False):
    """去饱和秋林 / 稀冠树：光秃的用更小、更稀的冠代替（common.tree 没有真正的落叶枝干型）"""
    C.tree(K_T, x, y, r * .55 if bare else r, h * .7 if bare else h, 'oak', seed=seed, z=z)


def old_dock(ctx, K, S, tr, ang, r=17.0):
    """旧平台：破损甲板 + 半数信标熄灭 / 缺失（本岛专属，不改公用 Kit.dock）。v18 修订：放大到接近其它岛 dock 的可读尺寸。"""
    M = ctx.M; DK = ctx.B('dock'); ux, uy = math.cos(ang), math.sin(ang)
    ex, ey = S.edge(ang); ez = tr.h(ex * .97, ey * .97)
    R0 = S.rad(ang); px, py = ux * (R0 + r + 8.0), uy * (R0 + r + 8.0); z = ez - 6.0
    DK.cyl(px, py, z - .8, r + .6, .8, M['deck_stone'], 44, smooth=False)
    DK.cyl(px, py, z - .1, r, .1, M['deck_old'], 44, smooth=False)
    bx0, by0 = ux * (R0 - 4), uy * (R0 - 4); bx1, by1 = ux * (R0 + 2.5), uy * (R0 + 2.5)
    DK.strip([(bx0, by0, z - .03), (bx1, by1, z - .03)], 7.0, .5, M['deck_old'])
    rnd = random.Random(44)
    for q in range(10):                                              # 甲板裂缝里的落叶 / 碎石
        a = rnd.uniform(0, math.tau); rr = rnd.uniform(1.5, r - 1.2)
        DK.sphere(px + rr * math.cos(a), py + rr * math.sin(a), z + .1, rnd.uniform(.6, 1.2), M['leaf_pile'], sz=.3, seg=6, rings=4)
    n = 10
    for k in range(n):
        a = math.tau * k / n
        lit = (k % 2 == 0) and k != n // 2                          # 半数熄灭 / 拆掉（正对来向的一个位置索性缺失）
        bx, by = px + (r + 2.2) * math.cos(a), py + (r + 2.2) * math.sin(a)
        if k == n // 2: continue                                    # 缺失一根信标
        DK.cyl(bx, by, z - .2, .28, lit and 1.9 or 1.3, M['iron_rust'], 8)
        DK.sphere(bx, by, z + (lit and 1.9 or 1.3), 1.1 if lit else .7, M['aether_dim'] if lit else M['aether_dead'], seg=8, rings=4)
    for s_ in (-1, 1):                                               # 斜撑回岩体（设定 §9.2）
        a2 = ang + s_ * .5; ex, ey = S.edge(a2)
        DK.tube([(px + math.cos(a2) * r * .7, py + math.sin(a2) * r * .7, z - .6),
                  (ex * .95, ey * .95, z - r * 1.3)], .7, M['iron_rust'], n=6)
    ctx.anchor('dock', px, py, z + 2.5)


def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(4)
    mr = ctx.m('rock', lambda: tame_joints(K_.rock_v17('v4_rock17', ROCK, ROCK2, .05, moss=(.14, .16, .09), moss_amt=.75, soil_z=400.0, lichen=(.5, .48, .38)), big=.014, fine=.2))
    mw = ctx.m('rockw', lambda: tame_joints(K_.rock_v17('v4_rock17w', (.32, .21, .15), (.2, .14, .1), .05, moss=(.13, .15, .08), moss_amt=.6, soil_z=400.0, lichen=(.4, .38, .3)), big=.014, fine=.2))
    ms = ctx.m('soil', lambda: K_.rock_v17('v4_soil17', (.24, .17, .1), (.15, .1, .06), .06, moss=(.14, .16, .08), moss_amt=.55, soil_z=400.0))
    mcore = ctx.m('core', lambda: C.flat('v4_inner', (.3, .19, .13), .55, noise=.4))     # 断口裸露内芯
    mg = ctx.m('glow', lambda: C.glow('v4_core', c=(.22, .3, .34), estr=.6))             # 弱核：暗底色 + 极低发光，忽明忽暗
    mring = ctx.m('ring', lambda: C.glow('v4_ring', c=(.14, .17, .19), estr=.12))        # 符文环暗着，几乎不发光
    mroot = ctx.m('root', lambda: C.flat('v4_root', (.16, .12, .08), .9, noise=.5))
    mmoss = ctx.m('moss', lambda: C.flat('v4_moss', (.12, .14, .08), .95, noise=.5))
    P = S.pts(180); cliff = 18
    P1 = K_.cliff_v17(ctx, B, P, cliff, mr, dz=1.5, ledge=.04, period=4.2, amp=.028, spur=.04)
    prof = [(.96, .04), (.82, .1), (.66, .18), (.52, .28), (.4, .4), (.3, .52), (.21, .64), (.14, .76), (.08, .88), (0, .96)]   # v18 协调：深而收尖的锥，断口在细段
    rings, apex = K_.body_v17(ctx, P1, prof, cliff, dz=2.2, ledge=.07, period=4.0, amp=.035, lo=(.06, .03))
    # 锥体随脊倾斜（AXIS 方向偏移，越往下越偏，呼应斜长脊）
    ux, uy = math.cos(AXIS), math.sin(AXIS)
    rings2 = []
    for i, (ring, z) in enumerate(rings):
        t = i / max(1, len(rings) - 1); off = (t ** 1.3) * .62 * R                # 更大的倾斜量，随深度加速偏移（呼应「随脊倾斜下垂」）
        rings2.append(([(x + ux * off, y + uy * off) for x, y in ring], z))
    nb = int(len(rings2) * .8)                                     # 断口在约 3/4 处
    K_.loft(B, rings2[:nb + 1], mr)
    # 断口碎石 + 裸露内芯（明显破损：不规则断面 + 大量外凸碎石堆）
    bp, bz = rings2[nb]; cx = sum(p[0] for p in bp) / len(bp); cy = sum(p[1] for p in bp) / len(bp)
    rnd2 = random.Random(901)
    bp_jag = [(x + rnd2.uniform(-2.5, 2.5), y + rnd2.uniform(-2.5, 2.5)) for x, y in bp]
    B.poly([(x, y, bz + rnd2.uniform(-1.5, 1.0)) for x, y in bp_jag] + [(cx, cy, bz - 2.5)],
           [(i, (i + 1) % len(bp_jag), len(bp_jag)) for i in range(len(bp_jag))], mcore, smooth=False)
    for i in range(0, len(bp), 3):
        x, y = bp[i]; crag(B, cx + (x - cx) * .9, cy + (y - cy) * .9, bz - rnd.uniform(1.0, 4.0), rnd.uniform(3.0, 7.0), mw, seed=900 + i)
    # 干涸瀑布槽（只剩苔痕、零星水线）
    a = math.radians(-75); pl = [(*[v + (ox if k == 0 else 0) for k, v in enumerate(S.edge(a))], ctx.top_z(*S.edge(a)))]
    for (ring, zz) in rings2[:4]:
        i = int(((a % math.tau) / math.tau) * len(ring)) % len(ring); x, y = ring[i]; pl.append((x + math.cos(a) * .6, y + math.sin(a) * .6, zz))
    B.strip(pl, 7, .5, mmoss); B.strip([(x, y, z - .05) for (x, y, z) in pl], 2.2, .1, mmoss)
    ctx.anchor('dryfall', *pl[-1])
    # 弱核 + 暗符文环（嵌在断口以上的完整锥体内段，不悬空）
    _, z_mid = rings2[int(nb * .45)]; z2 = z_mid; p2 = K_.ring_at(rings2[:nb + 1], z2); x2, y2 = p2[int(len(p2) * .68)]
    K_.glow_orb(B, x2, y2, z2, R * .03, mg); K_.band(B, p2, z2, R * .007, mring, 1.03, ox)
    ctx.anchor('u_core', x2, y2, z2)
    mr_ring, mz = rings2[int(nb * .55)]; ux_, uy_ = mr_ring[int(len(mr_ring) * .75)]
    ctx.anchor('u_rock', ux_ * 1.02, uy_ * 1.02, mz); ctx.anchor('u_broken', cx, cy, bz - 6)
    # 崖缘薄土 + 枯苔 + 枯根
    K_.hanging(ctx, B, P, 60, (5, 16), mroot, rnd, r=(.12, .3))
    ctx.anchor('u_root', *S.edge(a + .3), ctx.top_z(*S.edge(a + .3)) - 4)


# ============================================================ 岛面
def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R
    autumnize_trees()
    LEAF, DEAD = (.5, .3, .12), (.4, .34, .24)
    M['leaflit'] = K_.ground_v17('v4_leaflit17', [(.44, .27, .1), (.52, .33, .13), (.36, .24, .1)], dry=(.46, .34, .2), soil=(.3, .22, .14),
                                 rock=(.42, .38, .32), dots=[LEAF, (.36, .3, .2)], dot_dens=.45, dot_scale=1.1, slope_rock=True)
    M['duskmeadow'] = K_.ground_v17('v4_duskmeadow17', [(.4, .34, .18), (.36, .28, .14), (.44, .32, .16)], dry=(.42, .34, .2), soil=(.3, .22, .14),
                                    rock=(.42, .38, .32), dots=[DEAD, LEAF], dot_dens=.3, dot_scale=.9, slope_rock=True)
    M['path_old'] = C.flat('v4_path', (.44, .38, .32), .92, noise=.55)
    M['stone_old'] = tame_joints(K_.rock_v17('v4_stone17', (.5, .42, .34), (.35, .29, .23), .08, moss=(.16, .18, .1), moss_amt=.6, soil_z=400.0))
    M['brick_old'] = C.flat('v4_brick', (.34, .18, .13), .78, noise=.35)
    M['slate_old'] = C.flat('v4_slate', (.2, .18, .18), .55, noise=.25)
    M['ivy'] = C.flat('v4_ivy', (.16, .22, .1), .85, noise=.4)
    M['glass_dark'] = C.flat('v4_glassd', (.1, .12, .13), .3, metal=.2, coat=.6)
    M['deck_stone'] = tame_joints(K_.rock_v17('v4_deckstone17', (.44, .4, .34), (.3, .27, .23), .07, moss=(.14, .16, .09), moss_amt=.5, soil_z=400.0))
    M['deck_old'] = C.flat('v4_deckold', (.36, .32, .26), .8, noise=.4)
    M['leaf_pile'] = C.flat('v4_leafpile', (.42, .27, .12), .8, noise=.4)
    M['iron_rust'] = C.flat('v4_ironrust', (.3, .18, .12), .5, metal=.6)
    M['aether_dim'] = C.glow('v4_aetherdim', c=(.5, .62, .68), estr=1.0)
    M['aether_dead'] = C.flat('v4_aetherdead', (.2, .22, .24), .3, metal=.3)
    tr = KTerrain(S, steps=None, noise=(.6, 26), rough=(1.4, 18), brow=(7, 2.4), ground='duskmeadow',
                  mounds=[dict(at=(20, -30), r=26, h=3.0), dict(at=(-30, 40), r=22, h=2.6), dict(at=(50, 30), r=18, h=-2.0),
                          dict(at=(-50, -20), r=20, h=2.0)],
                  ridges=[dict(pts=[S.edge(math.radians(-75), .0), S.edge(math.radians(-75), 1.0)], w=6, h=-1.6)])
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    hx, hy = math.cos(AXIS + math.pi) * R * .42, math.sin(AXIS + math.pi) * R * .42          # 旧宅在高端
    hz = tr.h(hx, hy)
    tr.flats += [(hx - 26, hx + 26, hy - 18, hy + 18, hz, 6)]
    tr.fn(lambda x, y: MN.noise(Vector((x * .03, y * .03, 4.4))) > -.05, 'leaflit')            # 落叶斑块，占主导
    tr.rect(hx - 30, hx + 30, hy - 22, hy + 22, 'path_old')
    tr.build(ctx.B('terrain'), M)
    # 旧砖褐英式旧宅（藤蔓半掩、瓦片缺损）
    def manor():
        X0, X1, Y0, Y1 = -16.0, 16.0, -9.0, 9.0; fh = 4.0
        t_ = K.block(X0, X1, Y0, Y1, 2, fh, M['brick_old'], bay=3.4, win=(1.3, 2.2))
        K.hip(X0, X1, Y0, Y1, t_, 3.2, M['slate_old'], over=1.1)
        K.chimney(-10, 0, t_ + 1.8, 2.4, 1.6, .9, M['brick_old']); K.chimney(9, -2, t_ + 1.8, 2.6, 1.7, .9, M['brick_old'])
        K.block(16, 25, -5, 5, 1, 3.2, M['brick_old'], bay=3.0)      # 侧翼小屋
        rnd = random.Random(400)
        for q in range(60):                                          # 藤蔓半掩墙面
            side = rnd.choice(((X0, 0), (X1, 0), (0, Y0), (0, Y1)))
            x = side[0] if side[1] == 0 else rnd.uniform(X0 + 2, X1 - 2)
            y = rnd.uniform(Y0 + 1, Y1 - 1) if side[1] == 0 else side[1]
            K.WN.sphere(x, y, rnd.uniform(.5, fh * 1.7), rnd.uniform(.6, 1.4), M['ivy'], sz=.4, seg=6, rings=4, sx=1.2)
    K_.placed(manor, hx, hy, hz)
    ctx.anchor('manor', hx - 10, hy, hz + 8)
    ctx.anchor('card_home', hx, hy + 4, hz + 10)
    # 去饱和秋林（暗橙、灰褐，成团）+ 几株光秃
    rnd = random.Random(41); k = 0; bare_k = 0
    for _ in range(240):
        a = rnd.uniform(0, math.tau); f = rnd.uniform(.08, .92); x, y = S.rad(a) * f * math.cos(a), S.rad(a) * f * math.sin(a)
        if S.frac(x, y) > .96: continue
        if math.hypot(x - hx, y - hy) < 30: continue
        if MN.noise(Vector((x * .028, y * .028, 6.6))) < .18: continue
        z = tr.h(x, y); bare = rnd.random() < .18
        dead_tree(K.T, x, y, z - .2, rnd.uniform(6, 10), rnd.uniform(2.6, 3.6), 6000 + k, bare=bare)
        k += 1; bare_k += bare
    print('AUTUMN TREES', k, 'bare', bare_k)
    ctx.anchor('autumn', 40, -10, tr.h(40, -10) + 6)
    # 崖缘岩突（散落，呼应衰败）
    r3 = random.Random(78)
    for q in range(28):
        a = r3.uniform(0, math.tau); f = r3.uniform(.9, .985); x, y = S.edge(a, f)
        if abs(math.atan2(math.sin(a - DOCK_ANG), math.cos(a - DOCK_ANG))) < .18: continue
        crag(ctx.B('crags'), x, y, tr.h(x, y) - .6, r3.uniform(2.0, 4.2), M['stone_old'], 1000 + q)
    ctx.anchor('outline', *S.edge(0.0, .97), tr.h(*S.edge(0.0, .97)) + 2)
    ctx.anchor('slope', *S.edge(AXIS, .8), tr.h(*S.edge(AXIS, .8)))
    # 旧停靠平台，朝伊甸方向，信标少一半
    old_dock(ctx, K, S, tr, DOCK_ANG)
    # 结界：看不到，不建穹面（§9.4）


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
