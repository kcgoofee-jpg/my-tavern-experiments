"""维克多庄园（渲染战役 R；设定块 docs/upper-islands-checklist.md「维克多庄园」C1–C3 / R1–R12；设定 docs/upper-setting.md §4.7、§8、§9.3、§9.4）。
卡：凯莉亡夫的庄园，现在已不属于她【卡 L86】；埃德蒙·维克多伯爵已故【卡 L191】；其余：
岛面 —— 斜长脊（岛表 ridge 轮廓，收尖端朝西北）：沿长轴从东南高端向西北末端下垂的长坡；旧砖褐英式旧宅在东南高端，藤蔓半掩、
        屋顶缺瓦；荒掉的围墙菜园、塌了半边的温室骨架、马车房；去饱和秋林（暗橙 / 赭 / 灰褐），几株已光秃，落叶满地；
        长草的碎石车道；崖缘一道干涸瀑布槽；旧停靠平台，信标一半熄灭 / 缺失；无结界、无晶簇。
岛底 —— 锈褐砂岩，锥体随脊向西北倾斜，锥尖在约 3/4 处断裂（断口碎石 + 浅色内芯）；崖缘枯根；一颗弱核，一道符文环暗着。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C

ID, NAME = 'isle4', '维克多庄园'
CAM_DROP, CAM_DIST = .32, 4.0
UCAM_DROP, UCAM_DIST = .3, 3.8
AX = 2.4                                         # 长轴（岛表 silhouette.dir）：朝西北的收尖端 = 下垂端
UX, UY = math.cos(AX), math.sin(AX)
HIGH, LOW = 18.0, -58.0                          # 东南高端 / 西北末端的高差
HOUSE = (70.0, -60.0)                            # 旧宅中心（岛本地米）；victor_estate 标记热点
DOCK_ANG = math.atan2(-6.4 - 4.25, -2.0 - 9.0)   # 朝伊甸（tc_islands.json：伊甸 (-2,-6.4)，本岛 (9,4.25)）
FALL_ANG = math.radians(-75)                     # 干瀑槽出口（岛表 falls.ang）

BOARD_TITLE = '维克多庄园 —— 渲染战役设定对照'
ITEMS = [
    ('card_home', '凯莉亡夫的庄园，现已不属于她；维克多伯爵已故', 'L86、L191', '✓'),
    ('outline', '斜长脊，西北端收尖下垂；旧宅在东南高端', '§8', '✓'),
    ('manor', '旧砖褐英式旧宅：L 形、陡石板顶、高烟囱、藤蔓半掩、缺瓦', '§4.7', '✓'),
    ('ruins', '荒菜园（残砖墙）、半塌温室骨架、马车房', '', '✓'),
    ('autumn', '去饱和秋林，几株光秃，落叶满地', '§4.7', '✓'),
    ('drive', '长草的碎石车道', '', '✓'),
    ('dryfall', '崖缘干涸瀑布槽，只剩苔痕', '§9.3', '✓'),
    ('dock', '旧平台，信标少一半，无车', '§9.4', '✓'),
    ('u_rock', '岛底：锈褐砂岩倾斜锥，锥尖断裂', '§9.4', '✓'),
    ('u_root', '崖缘枯根；干瀑槽苔痕下延', '§9.3', '✓'),
    ('u_core', '一颗弱核，一道符文环暗着', '§4.7', '✓'),
]


def _sm(t): t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)


class VTerrain(K_.Terrain):
    def base(self, x, y):
        p = x * UX + y * UY                                                          # 沿长轴，西北为正
        return HIGH + (LOW - HIGH) * _sm((p + 40) / 240) ** 2.2 + super().base(x, y)        # 近末端才陡：末端下垂


def autumn_mats(M):
    if 'leaf_rust' in M: return
    for k, c in (('leaf_rust', (.42, .16, .05)), ('leaf_ochre', (.52, .33, .08)), ('leaf_grey', (.32, .22, .12)), ('leaf_pale', (.56, .38, .15))):
        M[k] = C.flat('v4_' + k, c, .8, noise=.35)


def autumn_tree(B, M, x, y, z, h, r, seed, bare=False):
    rnd = random.Random(seed); bark = C.tree_mats()['bark']
    tz = h * rnd.uniform(.35, .45); B.tube([(x, y, z - .3), (x + rnd.uniform(-.4, .4), y + rnd.uniform(-.4, .4), z + tz)], r * .07 + .15, bark, n=6)
    for q in range(4 if bare else 3):                                                # 主枝
        a = rnd.uniform(0, math.tau); L = r * rnd.uniform(.6, .95)
        B.tube([(x, y, z + tz * .9), (x + math.cos(a) * L, y + math.sin(a) * L, z + tz + h * rnd.uniform(.25, .45))], r * .035 + .06, bark, n=5)
    if bare: return
    mats = [M['leaf_rust'], M['leaf_ochre'], M['leaf_grey'], M['leaf_pale']]; rnd.shuffle(mats)
    for q in range(3):
        cx, cy = x + rnd.uniform(-.35, .35) * r, y + rnd.uniform(-.35, .35) * r
        C._cards(B, rnd, (cx, cy, z + tz + (h - tz) * .55), (r * .7, r * .7, (h - tz) * .45), 26, r * .22, mats[:3] if q else mats[1:], shell=.7)


# ============================================================ 岛面
def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R; autumn_mats(M)
    M['litter'] = K_.ground_v17('v4_litter', [(.3, .16, .07), (.36, .22, .09), (.26, .24, .12)], dry=(.42, .3, .15), soil=(.2, .14, .08),
                                rock=(.45, .36, .27), dots=[(.55, .26, .08), (.62, .45, .16)], dot_dens=.3, dot_scale=.9)
    M['rough'] = K_.ground_v17('v4_rough', [(.28, .3, .14), (.34, .32, .16), (.3, .24, .12)], dry=(.44, .36, .2), soil=(.22, .16, .1), rock=(.45, .36, .27),
                               dots=[(.5, .3, .12)], dot_dens=.15)
    M['drive'] = C.flat('v4_drive', (.44, .4, .33), .95, noise=.6)
    M['brick_old'] = C.pbr('v4_brick', 'dark_brick_wall', 1.6, tint=(.8, .52, .42), value=.8, sat=.6)
    M['slate_old'] = C.flat('v4_slate', (.2, .21, .23), .7, noise=.35)
    M['ivy'] = C.flat('v4_ivy', (.18, .2, .09), .9, noise=.5)
    M['iron_old'] = C.flat('v4_iron', (.12, .1, .09), .6, metal=.6, noise=.3)
    M['moss'] = C.flat('v4_moss', (.2, .22, .11), .95, noise=.5)
    M['stone_old'] = C.ashlar('v4_stone', c=(.52, .46, .38), course=.5, block=1.1)
    tr = VTerrain(S, noise=(.6, 30), rough=(1.2, 22), brow=(7, 2.4), ground='litter')
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    hx, hy = HOUSE
    tr.flats.append((hx - 30, hx + 30, hy - 22, hy + 24, tr.base(hx, hy), 10))
    tr.fn(lambda x, y: (x * UX + y * UY) > 60, 'rough')                              # 下垂端：荒草多于落叶
    drive = [(hx - 10, hy - 26), (hx - 40, hy - 52), (hx - 70, hy - 66)] + [S.edge(DOCK_ANG, .9)]
    tr.path(drive, 6, 'drive')
    tr.build(ctx.B('terrain'), M)
    zh = tr.h(hx, hy)
    ctx.anchor('outline', *S.edge(AX, .95), tr.h(*S.edge(AX, .9)) + 2); ctx.anchor('outline', *S.edge(AX + math.pi, .9), tr.h(*S.edge(AX + math.pi, .85)) + 2)

    def manor():                                                                     # L 形旧宅：主楼三层 + 东翼两层；缺瓦 = 屋面上几块黑洞
        t = K.block(-20, 20, -7, 7, 3, 4.0, M['brick_old'], bay=3.4, win=(1.2, 2.2)); K.hip(-20, 20, -7, 7, t, 6.0, m=M['slate_old'], over=.8)
        t2 = K.block(12, 24, 7, 30, 2, 4.0, M['brick_old'], bay=3.4, win=(1.2, 2.2)); K.hip(12, 24, 7, 30, t2, 5.0, m=M['slate_old'], over=.8)
        for x in (-16, -4, 8): K.chimney(x, 0, t + 3.0, 4.2, 1.6, 1.0, M['brick_old'])
        K.chimney(18, 24, t2 + 2.5, 3.6, 1.4, .9, M['brick_old'])
        for (x, y) in ((-9, -3.2), (5, 2.6), (17, 16)): K.W.box(x - 1.3, x + 1.3, y - 1.0, y + 1.0, t + 1.6, t + 2.0, M['iron'])
        rnd = random.Random(41)
        for q in range(70):                                                          # 藤蔓：贴墙的暗绿团
            side = rnd.choice(('s', 'w', 'e')); z = rnd.uniform(.5, t * .8)
            x, y = {'s': (rnd.uniform(-20, 20), -7.3), 'w': (-20.3, rnd.uniform(-7, 7)), 'e': (24.3, rnd.uniform(7, 30))}[side]
            K.W.sphere(x, y, z, rnd.uniform(1.0, 2.2), M['ivy'], sz=1.3, seg=8, rings=5)
        K.W.box(-4, 4, -9.5, -7, 0, .5, M['stone_old'])                               # 前门台阶
        return t
    t = K_.placed(manor, hx, hy, zh)
    ctx.anchor('manor', hx, hy, zh + t + 8); ctx.anchor('card_home', hx - 12, hy - 8, zh + 6)

    RB = ctx.B('ruins'); rnd = random.Random(7)                                      # 荒菜园：残缺砖墙 + 长草畦垄
    gx0, gx1, gy0, gy1 = hx - 70, hx - 36, hy + 8, hy + 40
    for (a, b) in (((gx0, gy0), (gx1, gy0)), ((gx1, gy0), (gx1, gy1)), ((gx1, gy1), (gx0, gy1)), ((gx0, gy1), (gx0, gy0))):
        n = 12
        for k in range(n):
            if rnd.random() < .25: continue
            p, q = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n), (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)
            z0 = tr.h(*p); hh = rnd.uniform(1.2, 3.0)
            RB.box(min(p[0], q[0]) - .3, max(p[0], q[0]) + .3, min(p[1], q[1]) - .3, max(p[1], q[1]) + .3, z0 - .5, z0 + hh, M['brick_old'])
    for k in range(6):
        y = gy0 + 4 + k * 5; RB.box(gx0 + 3, gx1 - 3, y - 1, y + 1, tr.h(gx0 + 15, y) - .2, tr.h(gx0 + 15, y) + .45, M['rough'])
    cx, cy = hx - 50, hy - 20; cz = tr.h(cx, cy)                                     # 半塌温室骨架：一半拱肋还在
    for k in range(9):
        y = cy - 12 + k * 3; hh = 5.0 if k < 5 else 5.0 * (1 - (k - 4) * .22)
        RB.tube([(cx - 5, y, cz), (cx - 4.2, y, cz + hh * .7), (cx, y, cz + hh), (cx + 4.2, y, cz + hh * .7), (cx + 5, y, cz)] if k < 6 else
                [(cx - 5, y, cz), (cx - 4, y, cz + hh * .6), (cx - 1.5, y, cz + hh * .5)], .12, M['iron_old'], n=5)
    RB.box(cx - 5.4, cx + 5.4, cy - 12.4, cy + 12.4, cz - .5, cz + .6, M['brick_old'])
    for q in range(8): C.rock(RB, cx + rnd.uniform(-4, 4), cy + rnd.uniform(0, 12), cz + .2, rnd.uniform(.4, .9), M['iron_old'], seed=q, seg=5, rings=3, sz=.3, facet=.6)
    mx, my = hx + 44, hy + 30; mz = tr.h(mx, my)                                     # 马车房
    RB.box(mx - 9, mx + 9, my - 5, my + 5, mz - .5, mz + 5.5, M['brick_old']); RB.gable(mx - 9.4, mx + 9.4, my - 5.4, my + 5.4, mz + 5.5, 3.2, M['slate_old'], 'x')
    for k in range(3):
        F = C.wall_frame((mx - 6 + k * 6, my - 5, mz), (0, -1, 0)); C.slab2d(RB, F, [(-1.8, 0), (1.8, 0), (1.8, 3.6), (-1.8, 3.6)], -.05, .05, M['slate_old'])
    ctx.anchor('ruins', (gx0 + gx1) / 2, (gy0 + gy1) / 2, tr.h((gx0 + gx1) / 2, (gy0 + gy1) / 2) + 4); ctx.anchor('ruins', cx, cy, cz + 6)
    ctx.anchor('drive', *drive[2], tr.h(*drive[2]) + 1)

    # ---- 干瀑槽：宅西南一口干涸石池 → 石砌干沟 → 崖口溢流口（苔痕）
    FB = ctx.B('dryfall'); fx0, fy0 = hx - 18, hy - 36; ex, ey = S.edge(FALL_ANG, .985)
    FB.cyl(fx0, fy0, tr.h(fx0, fy0) - .6, 7.0, .9, M['stone_old'], 32); FB.cyl(fx0, fy0, tr.h(fx0, fy0) - .2, 6.2, .55, M['moss'], 32)
    pts = [(fx0 + (ex - fx0) * k / 24, fy0 + (ey - fy0) * k / 24 + 6 * math.sin(k / 24 * math.pi)) for k in range(25)]
    for s_ in (-1, 1): FB.strip([(x + s_ * 1.8, y, tr.h(x, y) + .2) for x, y in pts], .7, .8, M['stone_old'])
    FB.strip([(x, y, tr.h(x, y) - .05) for x, y in pts], 3.0, .12, M['moss'])
    ctx.anchor('dryfall', ex, ey, tr.h(ex, ey) + 1)

    # ---- 秋林：成团的去饱和秋树 + 几株光秃；让开宅院、车道、菜园、温室
    TB = ctx.B('site_trees'); rnd = random.Random(19); n = 0
    busy = [(hx - 34, hx + 34, hy - 30, hy + 40), (gx0 - 4, gx1 + 4, gy0 - 4, gy1 + 4), (cx - 9, cx + 9, cy - 16, cy + 16), (mx - 12, mx + 12, my - 8, my + 8), (fx0 - 9, fx0 + 9, fy0 - 9, fy0 + 9)]
    from mathutils import noise as MN, Vector
    y_ = -R
    while y_ < R:                                                                    # 密林：噪声定林块（约七成覆盖），林块内 9 m 一株抖开
        x_ = -R
        while x_ < R:
            x, y = x_ + rnd.uniform(-4, 4), y_ + rnd.uniform(-4, 4); x_ += 9.0
            if S.frac(x, y) > .92 or any(a <= x <= b and c <= y <= d for a, b, c, d in busy) or K_.seg_dist(x, y, drive) < 7: continue
            if MN.noise(Vector((x / 70, y / 70, 2.3))) < -.25: continue
            autumn_tree(TB, M, x, y, tr.h(x, y), rnd.uniform(12, 18), rnd.uniform(5.0, 7.5), 900 + n, bare=rnd.random() < .08); n += 1
        y_ += 9.0
    print('isle4 trees', n)
    for q in range(40):
        x, y = rnd.uniform(-R, R) * .6, rnd.uniform(-R, R) * .5
        if S.frac(x, y) < .7 and MN.noise(Vector((x / 70, y / 70, 2.3))) > .1: ctx.anchor('autumn', x, y, tr.h(x, y) + 18); break

    # ---- 旧停靠平台：锈蚀甲板 + 栏杆，信标一半熄灭 / 缺失，无车
    DK = ctx.B('site_dock'); ang = DOCK_ANG; e0 = S.edge(ang, .97); dz = tr.h(*e0) - .3; r = 9.0
    px, py = e0[0] + math.cos(ang) * (r + 1), e0[1] + math.sin(ang) * (r + 1)
    DK.cyl(px, py, dz - .6, r + .3, .55, M['iron_old'], 40, smooth=False); DK.cyl(px, py, dz - .05, r, .08, M['drive'], 40, smooth=False)
    DK.cyl(px, py, dz - 3.2, r * .7, 2.6, M['iron_old'], 32, r2=r * .9, smooth=False)
    lit = C.flat('v4_beacon', (1.0, .85, .6), .3, emit=(1.0, .8, .5), estr=5.0)
    for k in range(10):
        a = ang + math.pi / 2 + k * math.pi / 9
        if k in (2, 5, 7): continue                                                  # 缺失
        x, y = px + math.cos(a) * (r - .4), py + math.sin(a) * (r - .4)
        DK.cyl(x, y, dz, .12, 1.0, M['iron_old'], 6); DK.sphere(x, y, dz + 1.1, .22, lit if k % 2 == 0 else M['iron_old'], seg=8, rings=4)
    for s_ in (-1, 1):
        a2 = ang + s_ * .5; DK.tube([(px + math.cos(a2) * r * .7, py + math.sin(a2) * r * .7, dz - .6), (e0[0] * .95 + math.cos(a2) * 2, e0[1] * .95 + math.sin(a2) * 2, dz - r * 1.4)], .45, M['iron_old'], n=6)
    ctx.anchor('dock', px, py, dz + 2)


# ============================================================ 岛底
def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(4)
    mr = ctx.m('rock', lambda: K_.rock_v17('v4_rock17', (.5, .33, .21), (.43, .28, .18), .02, moss=(.2, .21, .11), moss_amt=.35, soil=(.22, .15, .09), lichen=(.62, .55, .44)))
    mi = ctx.m('inner', lambda: K_.rock_v17('v4_inner17', (.66, .5, .36), (.55, .41, .29), .09, moss_amt=0.0, soil_z=400.0))
    mm = ctx.m('moss', lambda: C.flat('v4_umoss', (.17, .19, .09), .95, noise=.5))
    mroot = ctx.m('root', lambda: C.flat('v4_root', (.2, .15, .1), .9, noise=.4))
    mg = ctx.m('core', lambda: C.glow('v4_core', c=(.6, .72, .78), estr=1.2))
    md = ctx.m('deadring', lambda: C.flat('v4_deadring', (.12, .13, .14), .4, metal=.8))
    P = S.pts(160); cliff = 18
    P1 = K_.cliff_v17(ctx, B, P, cliff, mr, inset=.97, dz=1.6, ledge=.035, period=4.5, amp=.03, spur=.06)
    rings, _ = K_.body_rings(ctx, P1, [(.84, .14), (.66, .32), (.5, .5), (.38, .64), (.3, .74)], cliff, amp=.1, tilt=(UX * .7, UY * .7))
    K_.loft(B, rings, mr)
    pts, z = rings[-1]; cxm = sum(p[0] for p in pts) / len(pts); cym = sum(p[1] for p in pts) / len(pts)
    from mathutils import noise as MN, Vector
    n_ = len(pts); inner = [(cxm + (x - cxm) * .55, cym + (y - cym) * .55) for x, y in pts]   # 断口：外圈贴锥壁，内圈参差起伏，中心下凹
    vs = [(x, y, z) for x, y in pts] + [(x, y, z + 7 * MN.noise(Vector((x * .06, y * .06, .7)))) for x, y in inner] + [(cxm + 6, cym - 4, z - 6)]
    B.poly(vs, [((i + 1) % n_, i, n_ + i, n_ + (i + 1) % n_) for i in range(n_)] + [(n_ + (i + 1) % n_, n_ + i, 2 * n_) for i in range(n_)], mi)
    for q in range(7):                                                               # 断口残留的下垂石片
        x, y = pts[rnd.randrange(n_)]; K_.cone(B, cxm + (x - cxm) * .6, cym + (y - cym) * .6, z + 2, rnd.uniform(4, 8), rnd.uniform(10, 22), mr, seed=70 + q, rough=.45, n=8, nr=5)
    for i in range(0, len(pts), 4):                                                  # 断口碎石
        x, y = pts[i]; C.rock(B, cxm + (x - cxm) * rnd.uniform(.3, .95), cym + (y - cym) * rnd.uniform(.3, .95), z + rnd.uniform(-1, 1.5), rnd.uniform(3, 7), mr, seed=i, facet=.5)
    ctx.anchor('u_rock', *K_.ring_at(rings, -cliff - .3 * R)[int(len(pts) * .75)], -cliff - .3 * R)
    ctx.anchor('u_rock', cxm, cym, z - 2)
    a = FALL_ANG; top_ = S.edge(a, .99); pl = [(top_[0] + ox, top_[1], ctx.top_z(*top_) - .3)]  # 干瀑槽苔痕下延
    for (ring, zz) in rings[:4]:
        i = int(((a % math.tau) / math.tau) * len(ring)) % len(ring); x, y = ring[i]; pl.append((x + math.cos(a) * .8, y + math.sin(a) * .8, zz))
    for (x0, y0, z0), (x1, y1, z1) in zip(pl, pl[1:]):                               # 苔痕：沿崖面逐渐变窄、断续的苔斑
        for k in range(6):
            t = k / 6; w = 4.0 * (1 - t * .5)
            B.sphere(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, rnd.uniform(1.5, w), mm, sz=.35, seg=8, rings=4)
    z2 = -cliff - .3 * R; p2 = K_.ring_at(rings, z2); x, y = p2[int(len(p2) * .7)]
    K_.glow_orb(B, x, y, z2, R * .03, mg); K_.band(B, p2, z2, R * .008, md, 1.03, ox)
    ctx.anchor('u_core', x, y, z2)
    K_.hanging(ctx, B, P, 90, (4, 16), mroot, rnd, r=(.12, .28))
    ctx.anchor('u_root', *[v + (ox if k == 0 else 0) for k, v in enumerate(S.edge(-2.0, 1.0))], -8)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
