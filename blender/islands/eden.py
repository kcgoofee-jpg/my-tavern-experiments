"""伊甸庄园 · 焦点岛（渲染战役 R `isle:eden`；设定块 docs/upper-islands-checklist.md「伊甸庄园」C1–C6 / R1–R14；设定 docs/upper-setting.md §4.1）。
卡：玩家的庄园，独占一座悬浮岛；新古典白色石材，地上 3 层；前庭石板步道 + 喷泉（地标）+ 访客停靠平台（结界边界）；
    后庭露天训练场、草坪、小型人工湖、围栏区、凉亭，上方结界穹顶；以太凝水塔供水；外层结界覆盖全岛【card-digest L199–L229】。
设计：主楼坐高台（前庭同层），石栏挡土墙 + 大台阶下到中轴柏树大道与两道水渠，止于南缘悬挑平台；后庭向北跌落到湖；
    湖东岸凝水塔；岛缘连续混交林带 + 白石栏杆；岛底全区最大的暖白石灰岩锥，中段悬清水倒锥，湖水从北缘溢流成瀑。
主楼外壳直接调 blender/estate（shell.build，府邸坐标 +y 朝湖、正门朝 −y），整体平移到岛坐标 (0, 25) 与台地标高。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C
from mathutils import noise as MN, Vector

ID, NAME = 'eden', '伊甸庄园'
CAM_AZ = float(os.environ.get('EDEN_CAM_AZ', -75)); CAM_DROP = float(os.environ.get('EDEN_CAM_DROP', .3)); CAM_DIST = float(os.environ.get('EDEN_CAM_DIST', 3.4))
UCAM_DROP, UCAM_DIST = .45, 3.6
MANOR = (0.0, 25.0)                 # 府邸原点在岛坐标里的位置（plan.MANOR_IN_ISLAND）
L_TOP, L_AV, L_REAR, L_LAKE = 6.0, 1.2, 2.4, -1.2   # 主楼 + 前庭台地 / 中轴大道 / 后庭草坪 / 湖面
FRONT_Y = -64.0                     # 前台地南缘挡土墙
LOBES = [(18, 132, 60, 28, .1), (-24, 146, 34, 18, -.4), (60, 122, 30, 16, .5), (24, 152, 26, 14, 0.0)]   # 湖（cx, cy, a, b, 转角）
TRAIN = (-118, -52, 70, 108)        # 露天训练场
PADDOCK = (-190, -132, 58, 124)     # 围栏区
PAV = (78, 100)                     # 湖岸凉亭
TOWER = (112, 150)                  # 以太凝水塔
FALL_ANG = math.radians(98)         # 湖水北缘溢流
ROCK, ROCK2 = (.8, .76, .68), (.7, .65, .57)
VEIN = dict(c=(.55, .82, 1.0), density=.35, e=.6)

BOARD_TITLE = '伊甸庄园 —— 渲染战役设定对照'
ITEMS = [
    ('manor', '白石新古典主楼：柱廊山花正门朝南、两翼、屋顶鼓座眺望亭', '卡 L201（C2）+ blender/estate', '✓'),
    ('fountain', '前庭石板 + 三层圆形喷泉（庄园地标）', '卡 L226（C3）', '✓'),
    ('avenue', '石栏台地 + 大台阶 → 柏树中轴大道 + 双水渠', '', '✓'),
    ('dock', '南缘悬挑停靠平台 + 信标 + 悬浮车；门槛一线 = 结界边界', '卡 L226、L98（C3）', '✓'),
    ('rear', '后庭：训练场、草坪、围栏区、湖岸凉亭', '卡 L227（C4）', '✓'),
    ('lake', '小型人工湖（深蓝，识别点）', '卡 L227（C4）', '✓'),
    ('tower', '以太凝水塔', '卡 L228（C5）', '✓'),
    ('ward', '外层结界：几乎透明的扁穹', '卡 L229（C6）', '弱'),
    ('woods', '岛缘连续混交林带 + 白石栏杆', '', '✓'),
    ('u_rock', '岛底：暖白石灰岩大锥', '§4.1', '✓'),
    ('u_wcone', '岛底中段清水倒锥', '§4.1', '✓'),
    ('u_fall', '湖水北缘溢流瀑布', '', '✓'),
    ('u_core', '三颗淡青以太核 + 符文环', '', '✓'),
]


def lake_e(x, y):
    """点到湖的椭圆度量（< 1 在湖内）"""
    e = 9.0
    for cx, cy, a, b, t in LOBES:
        dx, dy = x - cx, y - cy; u = dx * math.cos(t) + dy * math.sin(t); v = -dx * math.sin(t) + dy * math.cos(t)
        e = min(e, math.hypot(u / a, v / b))
    return e


class ETerrain(K_.Terrain):
    def base(self, x, y):
        f = self.S.frac(x, y); z = 3.0 * (1 - f * f) + super().base(x, y)       # 岛心略鼓 + 园中缓丘 / 洼地（mounds）
        e = lake_e(x, y)
        if e < 1.35:                                                             # 湖盆：岸线外 0.35 过渡到湖面下 3 m
            t = min(1.0, (1.35 - e) / .35); t = t * t * (3 - 2 * t); zl = L_LAKE - 3.0 * max(0.0, 1 - e)
            z = z * (1 - t) + zl * t
        return z


def _mats(M):
    M['lawn_e'] = K_.ground_v17('e_lawn', [(.19, .34, .09), (.22, .38, .11), (.25, .41, .12)], dry=(.3, .4, .15), stripe=((.17, .32, .08), (.28, .45, .14), 6.0), slope_rock=False)
    M['park_e'] = K_.ground_v17('e_park', [(.2, .3, .09), (.3, .36, .13), (.25, .33, .1)], dry=(.5, .46, .26), soil=(.3, .23, .15), rock=ROCK,
                                dots=[(.9, .88, .82), (.7, .5, .7)], dot_dens=.05, dot_scale=.4)
    M['meadow_e'] = K_.ground_v17('e_meadow', [(.36, .38, .16), (.44, .42, .2), (.3, .34, .13)], dry=(.6, .52, .3), soil=(.34, .26, .16), rock=ROCK,
                                  dots=[(.92, .9, .84), (.62, .5, .78), (.85, .72, .2)], dot_dens=.1, dot_scale=.5)
    M['walk_e'] = K_.ground_v17('e_walk', [(.62, .58, .48), (.66, .62, .52), (.58, .54, .45)], dry=(.6, .56, .46), slope_rock=False)
    M['shore_e'] = K_.ground_v17('e_shore', [(.16, .22, .08), (.22, .24, .1), (.3, .28, .16)], dry=(.36, .32, .2), soil=(.24, .2, .14), slope_rock=False)
    M['reed_e'] = C.flat('e_reed', (.3, .34, .12), .8, noise=.4)
    M['rose_e'] = C.flat('e_rose', (.92, .9, .86), .6, noise=.2)
    M['lav_e'] = C.flat('e_lav', (.42, .34, .6), .8, noise=.4)
    M['box_e'] = C.flat('e_box', (.07, .15, .05), .85, noise=.35)
    for k, c in (('beech', (.24, .08, .07)), ('lime', (.2, .3, .08)), ('birch', (.32, .36, .12)), ('pine', (.06, .11, .07))):
        M['leaf_' + k] = C.flat('e_leaf_' + k, c, .75, noise=.35)
    M['wood_e'] = K_.ground_v17('e_wood', [(.11, .16, .06), (.17, .18, .08), (.14, .2, .07)], dry=(.34, .26, .14), soil=(.22, .16, .1), rock=ROCK)
    M['pave_e'] = K_.ground_v17('e_pave', [(.82, .8, .75), (.86, .84, .79), (.78, .76, .71)], dry=(.8, .78, .72), soil=(.7, .68, .62), slope_rock=False)
    M['sand_e'] = K_.ground_v17('e_sand', [(.72, .6, .44), (.76, .64, .48), (.68, .57, .42)], dry=(.72, .6, .44), soil=(.6, .5, .36), slope_rock=False)
    M['lake_e'] = C.flat('e_lake', (.02, .07, .13), .03, coat=1.0)
    M['fence_e'] = C.flat('e_fence', (.9, .89, .86), .5)
    M['beacon_e'] = C.flat('e_beacon', (.8, .93, 1.0), .15, emit=(.62, .86, 1.0), estr=6.0)
    M['sill_e'] = C.glow('e_sill', c=(.55, .85, 1.0), estr=3.0, alpha=.8)
    M['ward_e'] = K_.hex_ward('e_ward', cell=10.0, alpha=.05, estr=.5, rim=.0)


def parterre(G, M, KM, x0, x1, y0, y1):
    """刺绣花坛：碎石底 + 黄杨边篱 + 中心圆篱 + 四块绿床（弧形黄杨卷纹）+ 白玫瑰点 + 薰衣草条"""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; w, d = (x1 - x0) / 2, (y1 - y0) / 2
    G.box(x0, x1, y0, y1, -.02, .04, KM['gravel'])
    for (a, b, c, e) in ((x0, x1, y0, y0 + .6), (x0, x1, y1 - .6, y1), (x0, x0 + .6, y0, y1), (x1 - .6, x1, y0, y1)): G.box(a, b, c, e, 0, .7, M['box_e'])
    ring = lambda r, n=40, a0=0.0, a1=math.tau: [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n), .25) for k in range(n + 1)]
    G.strip(ring(min(w, d) * .28), .5, .5, M['box_e']); G.cyl(cx, cy, 0, min(w, d) * .2, .08, M['lav_e'], 24)
    rnd = random.Random(int(cx * 3 + cy))
    for sx in (-1, 1):
        for sy in (-1, 1):
            bx0, bx1 = sorted((cx + sx * 1.6, cx + sx * (w - 1.6))); by0, by1 = sorted((cy + sy * 1.6, cy + sy * (d - 1.6)))
            G.box(bx0, bx1, by0, by1, 0, .1, KM['lawn'])
            qx, qy = (bx0 + bx1) / 2, (by0 + by1) / 2; rr = min(bx1 - bx0, by1 - by0) * .36
            a0 = math.atan2(-sy, -sx)
            G.strip([(qx + rr * math.cos(a0 + math.pi * .9 * k / 16), qy + rr * math.sin(a0 + math.pi * .9 * k / 16), .2) for k in range(17)], .35, .4, M['box_e'])
            G.strip([(qx + rr * .5 * math.cos(a0 + math.pi + math.pi * .9 * k / 12), qy + rr * .5 * math.sin(a0 + math.pi + math.pi * .9 * k / 12), .2) for k in range(13)], .3, .35, M['box_e'])
            G.box(bx0 + .2, bx1 - .2, (by0 if sy < 0 else by1) - (0 if sy < 0 else .7), (by0 if sy < 0 else by1) + (.7 if sy < 0 else 0), 0, .35, M['lav_e'])
            for k in range(10): G.sphere(rnd.uniform(bx0 + .6, bx1 - .6), rnd.uniform(by0 + .6, by1 - .6), .3, .38, M['rose_e'], seg=8, rings=4)


def tree_var(B, M, x, y, z, h, r, seed, kind):
    """园林混交林的其他树种：铜叶山毛榉 / 椴树（亮绿）/ 桦（浅黄绿、窄冠）/ 伞松（高干平顶）"""
    rnd = random.Random(seed); bark = C.tree_mats()['bark']
    if kind == 'pine':
        B.tube([(x, y, z - .3), (x + rnd.uniform(-1, 1), y + rnd.uniform(-1, 1), z + h * .7)], .35, bark, n=6)
        for q in range(3):
            C._cards(B, rnd, (x + rnd.uniform(-1.5, 1.5), y + rnd.uniform(-1.5, 1.5), z + h * rnd.uniform(.78, .9)), (r, r, h * .09), 70, .5, [M['leaf_pine'], C.tree_mats()['conifer']], flatz=2.0, shell=.5)
        return
    mats = {'beech': [M['leaf_beech'], C.tree_mats()['leaf_a']], 'lime': [M['leaf_lime'], C.tree_mats()['leaf_c']], 'birch': [M['leaf_birch'], M['leaf_lime']]}[kind]
    narrow = .6 if kind == 'birch' else 1.0; tz = h * .35
    B.tube([(x, y, z - .3), (x, y, z + tz)], .1 + r * .05, bark, n=6)
    for q in range(4):
        cx, cy = x + rnd.uniform(-.4, .4) * r * narrow, y + rnd.uniform(-.4, .4) * r * narrow
        C._cards(B, rnd, (cx, cy, z + tz + (h - tz) * rnd.uniform(.35, .65)), (r * .6 * narrow, r * .6 * narrow, (h - tz) * .4), 36, r * .16, mats, shell=.7)


def fence(B, pts, zf, m, h=1.3, step=3.0):
    """白栏：立柱 + 两道横杆，贴地"""
    for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
        L = math.hypot(xb - xa, yb - ya); n = max(1, int(L / step))
        for k in range(n + 1):
            x, y = xa + (xb - xa) * k / n, ya + (yb - ya) * k / n; B.cyl(x, y, zf(x, y) - .2, .09, h + .2, m, 6, smooth=False)
        for hh in (.55, h - .05):
            B.strip([(xa + (xb - xa) * k / n, ya + (yb - ya) * k / n, zf(xa + (xb - xa) * k / n, ya + (yb - ya) * k / n) + hh) for k in range(n + 1)], .08, .1, m)


def manor(ctx, z):
    """blender/estate 的建筑壳（外观用：不建室内），整体移到岛坐标"""
    import bpy
    from estate import core as EC, shell as ES
    before = set(bpy.data.objects)
    ES.build(EC.Ctx({'--view': 'ext'}))
    for o in set(bpy.data.objects) - before:
        if o.parent is None: o.location = (o.location[0] + MANOR[0], o.location[1] + MANOR[1], o.location[2] + z)
    ctx.anchor('manor', MANOR[0], MANOR[1], z + 26); ctx.anchor('manor', MANOR[0] - 70, MANOR[1], z + 14); ctx.anchor('manor', MANOR[0] + 70, MANOR[1], z + 14)


def pavilion(B, M):
    """湖岸凉亭：白石圆亭，8 柱 + 圆顶"""
    B.cyl(0, 0, -.6, 6.2, 1.2, M['stone_pale'], 40); B.cyl(0, 0, .6, 5.6, .25, M['stone_pale'], 40)
    for k in range(8): a = k * math.tau / 8; B.cyl(math.cos(a) * 4.6, math.sin(a) * 4.6, .85, .38, 5.2, M['stone_pale'], 14)
    B.cyl(0, 0, 6.05, 5.3, .9, M['trim'], 40); B.sphere(0, 0, 6.95, 4.9, M['stone_pale'], sz=.62, seg=32, rings=12, zmin=0.0)
    B.cyl(0, 0, 9.9, .5, 1.1, M['gilt'], 10)


def water_tower(B, M, mw, mg):
    """以太凝水塔：白石基座 + 收分塔身 + 柱廊鼓座 + 透明凝水穹罩（内含淡光核）"""
    B.cyl(0, 0, -.5, 7.0, 2.0, M['stone_pale'], 32); B.cyl(0, 0, 1.5, 5.2, 12.0, M['stone_pale'], 32, r2=4.6)
    B.cyl(0, 0, 13.5, 5.6, .7, M['trim'], 36)
    for k in range(12): a = k * math.tau / 12; B.cyl(math.cos(a) * 4.9, math.sin(a) * 4.9, 14.2, .3, 5.0, M['stone_pale'], 10)
    B.cyl(0, 0, 14.2, 3.4, 5.0, mw, 32); B.sphere(0, 0, 16.7, 1.2, mg, seg=16, rings=8)
    B.cyl(0, 0, 19.2, 5.7, 1.0, M['trim'], 36); B.sphere(0, 0, 20.2, 4.6, mw, sz=.7, seg=32, rings=10, zmin=0.0)
    B.cyl(0, 0, 23.3, .2, 2.0, M['gilt'], 8)


# ============================================================ 岛面
def top(ctx):
    S, K, M = ctx.S, ctx.K, ctx.M; R = S.R; _mats(M)
    tr = ETerrain(S, mounds=[dict(at=[-200, -90], r=80, h=9), dict(at=[190, -110], r=90, h=11), dict(at=[-230, 110], r=70, h=7), dict(at=[220, 60], r=60, h=8),
                             dict(at=[-110, -170], r=50, h=-4), dict(at=[120, -40], r=45, h=-3)],
                  noise=(1.4, 45), rough=(.5, 18), brow=(8, 2.4), ground='meadow_e')
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    y_dock = -S.rad(-math.pi / 2) * .97
    tr.flats += [(-112, 112, FRONT_Y, 58, L_TOP, 1.2),                                     # 主楼 + 前庭台地（南缘挡土墙：硬台阶）
                 (-18, 18, y_dock + 2, FRONT_Y - 10, L_AV, 10),                           # 中轴大道
                 (TRAIN[0] - 4, TRAIN[1] + 4, TRAIN[2] - 4, TRAIN[3] + 4, L_REAR, 10), (PADDOCK[0], PADDOCK[1], PADDOCK[2], PADDOCK[3], L_REAR + .6, 14),
                 (-34, 34, 58, 70, L_TOP - 1.6, 5)]
    tr.fn(lambda x, y: MN.noise(Vector((x / 90, y / 90, 1.7))) > -.1 and S.frac(x, y) < .8, 'park_e')
    tr.fn(lambda x, y: math.hypot(x / 1.4, y - 5) < 130, 'park_e')
    tr.fn(lambda x, y: S.frac(x, y) > .8 + .05 * MN.noise(Vector((x * .03, y * .03, 7.0))), 'wood_e')
    walks = [[(-24, FRONT_Y - 20), (-90, -120), (-170, -150), (-250, -60), (-240, 40), (-200, 60)], [(24, FRONT_Y - 20), (100, -130), (190, -170), (260, -60), (250, 40), (140, 130)],
             [(-60, 120), (-110, 170), (-40, 205), (40, 200), (110, 175)]]

    tr.rect(-112, 112, FRONT_Y + 2, 58, 'lawn_e'); tr.rect(-34, 34, 58, 70, 'pave_e')
    tr.rect(-40, 40, FRONT_Y + 2, -4, 'pave_e'); tr.rect(-20, 20, -8, 4, 'pave_e')
    tr.rect(-6, 6, y_dock, FRONT_Y, 'pave_e'); tr.rect(-18, 18, y_dock, FRONT_Y - 4, 'lawn_e')
    tr.rect(*TRAIN, 'sand_e'); tr.rect(PADDOCK[0], PADDOCK[1], PADDOCK[2], PADDOCK[3], 'lawn_e')
    tr.fn(lambda x, y: lake_e(x, y) < 1.18, 'shore_e')
    tr.build(ctx.B('terrain'), M)
    z0 = lambda x, y: tr.h(x, y)

    manor(ctx, L_TOP)
    for w in walks: K_.drape(tr, w, 3.0, M['walk_e'], ctx.B('walks'), dz=.06, step=1.5, h=.05)          # 园路：贴地带状，不走地形网格

    # ---- 前庭：石板圆庭 + 三层喷泉 + 两侧花坛；南缘挡土墙 + 石栏 + 大台阶
    G = ctx.B('garden'); W = ctx.B('water')
    fy = -30.0
    K_.placed(lambda: (K.lawn(K.ellipse(0, 0, 24, 24, 64), K.M['pave'], z=.04), K.lawn(K.ellipse(0, 0, 16, 16, 64), M['lawn_e'], z=.06)), 0, fy, L_TOP)
    def fountain3():
        G.lathe(0, 0, 0, [(9.0, 0.0), (9.0, .7), (8.5, .7), (8.5, .45), (.01, .45)], K.M['stone_pale'], n=64); W.cyl(0, 0, .4, 8.45, .2, K.M['water'], 64)
        G.lathe(0, 0, .45, [(1.2, 0.0), (.8, 1.8), (4.6, 2.2), (4.6, 2.55), (4.2, 2.55), (.01, 2.4)], K.M['stone_pale'], n=48); W.cyl(0, 0, 2.65, 4.2, .12, K.M['water'], 48)
        G.lathe(0, 0, 2.9, [(.6, 0.0), (.4, 1.5), (2.2, 1.8), (2.2, 2.05), (.01, 1.95)], K.M['stone_pale'], n=36); W.cyl(0, 0, 4.8, 2.0, .1, K.M['water'], 36)
        G.lathe(0, 0, 4.95, [(.35, 0.0), (.2, 1.6), (.45, 1.9), (.01, 2.3)], K.M['stone_pale'], n=20)
        for k in range(12): a = k * math.tau / 12; W.tube([(math.cos(a) * 1.8, math.sin(a) * 1.8, 4.9), (math.cos(a) * 3.6, math.sin(a) * 3.6, 3.4), (math.cos(a) * 4.4, math.sin(a) * 4.4, 2.8)], .12, K.M['water_clear'], n=5)
    K_.placed(fountain3, 0, fy, L_TOP)
    ctx.anchor('fountain', 0, fy, L_TOP + 7)
    for sx in (-1, 1):
        for (a, b) in ((34, 58), (62, 86)):
            K_.placed(lambda a=a, b=b, sx=sx: parterre(G, M, K.M, min(sx * a, sx * b), max(sx * a, sx * b), -54, -14), 0, 0, L_TOP + .02)
        for k in range(6): C.tree(K.T, sx * (30 + k * 12), -8, 5.0, .9, 'yew_col', seed=300 + k + (sx > 0) * 20, z=L_TOP)
    wall = [(x, FRONT_Y) for x in range(-110, 111, 2)]
    for (xa, ya), (xb, yb) in zip(wall, wall[1:]):
        if abs((xa + xb) / 2) < 13: continue
        G.box(xa, xb, ya - 1.2, ya + .2, min(z0(xa, ya - 3), z0(xb, ya - 3)) - 1.0, L_TOP + .3, K.M['stone_pale'])
    K.balustrade([(-110, FRONT_Y - .5), (-13, FRONT_Y - .5)], L_TOP + .3); K.balustrade([(13, FRONT_Y - .5), (110, FRONT_Y - .5)], L_TOP + .3)
    nst = 16; sd = (L_TOP - L_AV) / nst
    for k in range(nst): G.box(-13 + k * .15, 13 - k * .15, FRONT_Y - 1.2 - (k + 1) * .6, FRONT_Y - 1.2 - k * .6 + .01, L_AV - .5, L_TOP - k * sd, K.M['stone_pale'])
    for sx in (-1, 1): G.box(sx * 13 - .8, sx * 13 + .8, FRONT_Y - 11.5, FRONT_Y + .2, L_AV - .5, L_TOP + .6, K.M['stone_pale'])

    # ---- 中轴大道：石板路 + 两道细长水渠 + 柱状柏树，止于停靠平台
    y0, y1 = y_dock + 6, FRONT_Y - 12
    for sx in (-1, 1):
        x = sx * 10.5; G.box(x - 1.6, x + 1.6, y0 + 6, y1 - 2, L_AV - .2, L_AV + .25, K.M['stone_pale']); W.box(x - 1.2, x + 1.2, y0 + 6.4, y1 - 2.4, L_AV - .1, L_AV + .12, K.M['water'])
        n = int((y1 - y0) / 7.5)
        for k in range(n + 1): C.tree(K.T, sx * 15.5, y0 + 3 + k * (y1 - y0 - 6) / n, 11.0, 1.5, 'yew_col', seed=500 + k * 2 + (sx > 0), z=z0(sx * 15.5, y0 + k * 7.5) - .2)
    ctx.anchor('avenue', 0, (y0 + y1) / 2, L_AV + 4)

    # ---- 停靠平台（卡：前庭花园边缘，结界边界）：悬挑圆台 + 信标 + 悬浮车；平台内缘门槛一线淡光
    (px, py), br, dz, ang = K_.dock(K, S, tr, (0, -1), 16.0, cars=1, approach_m=90)
    ex, ey = S.edge(-math.pi / 2, .965); zs = z0(ex, ey) + .06
    G.strip([(ex + t, ey, zs) for t in (-14, -7, 0, 7, 14)], .5, .08, M['sill_e'])
    ctx.anchor('dock', px, py, dz + 3); ctx.anchor('ward', ex, ey, zs + 2)

    # ---- 后庭：石铺台地 → 训练场（沙地 + 白栏 + 标靶桩）、围栏区、草坪、湖、凉亭、凝水塔
    FB = ctx.B('fences')
    x0, x1, yy0, yy1 = TRAIN
    fence(FB, [(x0, yy0), (x1, yy0), (x1, yy1), (x0, yy1), (x0, yy0)], lambda x, y: L_REAR, M['fence_e'])
    for k in range(5): FB.cyl(x0 + 10 + k * 11, yy1 - 8, L_REAR, .25, 1.8, M['fence_e'], 8); FB.cyl(x0 + 10 + k * 11, yy1 - 8, L_REAR + 1.8, .55, .12, K.M['track'], 16)
    x0, x1, yy0, yy1 = PADDOCK
    fence(FB, [(x0, yy0), (x1, yy0), (x1, yy1), (x0, yy1), (x0, yy0)], lambda x, y: z0(x, y), M['fence_e'])
    ctx.anchor('rear', (TRAIN[0] + TRAIN[1]) / 2, (TRAIN[2] + TRAIN[3]) / 2, L_REAR + 2); ctx.anchor('rear', (PADDOCK[0] + PADDOCK[1]) / 2, 90, L_REAR + 2)
    for sx in (-1, 1): G.box(sx * 34 - 1, sx * 34 + 1, 58, 70, L_TOP - 2.5, L_TOP - 1.0, K.M['stone_pale'])
    for xa, xb in ((-112, -34), (34, 112)):                                     # 主台地北缘挡土墙 + 石栏（与南缘同式）
        for x in range(xa, xb, 2): G.box(x, x + 2, 57.8, 59.2, min(z0(x, 61), z0(x + 2, 61)) - 1.0, L_TOP + .3, K.M['stone_pale'])
        K.balustrade([(xa, 58.5), (xb, 58.5)], L_TOP + .3)
    K.balustrade([(-34, 70.5), (-6, 70.5)], L_TOP - 1.6); K.balustrade([(6, 70.5), (34, 70.5)], L_TOP - 1.6)
    ctx.anchor('rear', 0, 64, L_TOP)
    WL = ctx.B('lake')
    for j, (cx, cy, a, b, t) in enumerate(LOBES):
        pts = [(a * math.cos(u) * math.cos(t) - b * math.sin(u) * math.sin(t), a * math.cos(u) * math.sin(t) + b * math.sin(u) * math.cos(t)) for u in (k * math.tau / 72 for k in range(72))]
        n = len(pts); WL.poly([(cx, cy, L_LAKE + .004 * j)] + [(cx + x, cy + y, L_LAKE + .004 * j) for x, y in pts], [(0, i + 1, (i + 1) % n + 1) for i in range(n)], M['lake_e'])
    ctx.anchor('lake', 18, 132, L_LAKE + 1); ctx.anchor('lake', -24, 146, L_LAKE + 1)
    rnd = random.Random(11)
    for k in range(140):                                                         # 石岸：岸线上的浅色块石
        a = k * math.tau / 140; cx, cy, A, Bb, t = LOBES[k % len(LOBES)]
        x, y = cx + A * 1.02 * math.cos(a) * math.cos(t) - Bb * 1.02 * math.sin(a) * math.sin(t), cy + A * 1.02 * math.cos(a) * math.sin(t) + Bb * 1.02 * math.sin(a) * math.cos(t)
        if lake_e(x, y) < .98: continue
        if k % 3: C.rock(G, x, y, L_LAKE + .05, rnd.uniform(.4, .9), K.M['stone_grey'], seed=k, seg=6, rings=4, sz=.4, facet=.5)
        else:
            for q in range(14): G.cyl(x + rnd.uniform(-2, 2), y + rnd.uniform(-2, 2), L_LAKE - .2, .05, rnd.uniform(1.2, 2.0), M['reed_e'], 4, r2=.01, smooth=False)
    K_.placed(lambda: pavilion(G, K.M), PAV[0], PAV[1], z0(*PAV) + .4); ctx.anchor('rear', PAV[0], PAV[1], z0(*PAV) + 9)
    mw = K.M['water_clear']; mg = C.glow('e_tcore', c=(.62, .9, 1.0), estr=6.0)
    K_.placed(lambda: water_tower(G, K.M, mw, mg), TOWER[0], TOWER[1], z0(*TOWER)); ctx.anchor('tower', TOWER[0], TOWER[1], z0(*TOWER) + 24)
    rill = [TOWER, (90, 138), (74, 128)]                                        # 塔 → 湖的石砌水渠
    G.strip([(x, y, z0(x, y) + .1) for x, y in rill], 2.6, .35, K.M['stone_pale']); W.strip([(x, y, z0(x, y) + .3) for x, y in rill], 1.6, .1, K.M['water'])
    ex, ey = S.edge(FALL_ANG, .99); outlet = [(8, 160), (6, 190), (ex * .97, ey * .97)]        # 湖北溢流口 → 溪沟 → 崖口
    G.strip([(x, y, z0(x, y) - .2) for x, y in outlet], 7.0, .3, K.M['stone_pale']); W.strip([(x, y, z0(x, y) - .05) for x, y in outlet], 5.6, .12, K.M['water'])

    # ---- 林：岛缘连续混交林带 + 园中树丛；让开台地、大道、后庭、湖
    busy = [(-116, 116, FRONT_Y - 14, 74), (-24, 24, y_dock - 20, FRONT_Y), (TRAIN[0] - 8, TRAIN[1] + 8, TRAIN[2] - 8, TRAIN[3] + 8),
            (PADDOCK[0] - 5, PADDOCK[1] + 5, PADDOCK[2] - 5, PADDOCK[3] + 5), (TOWER[0] - 14, TOWER[0] + 14, TOWER[1] - 14, TOWER[1] + 14), (PAV[0] - 10, PAV[0] + 10, PAV[1] - 10, PAV[1] + 10)]
    rnd = random.Random(19); n = 0; step = 8.5; yq = -R
    while yq < R:
        xq = -R
        while xq < R:
            x, y = xq + rnd.uniform(-4, 4), yq + rnd.uniform(-4, 4); xq += step * rnd.uniform(.7, 1.3); f = S.frac(x, y)
            if f > .955 or any(a <= x <= b and c <= y <= d for a, b, c, d in busy) or lake_e(x, y) < 1.25 or K_.seg_dist(x, y, outlet) < 6: continue
            belt = f > .8 + .05 * MN.noise(Vector((x * .03, y * .03, 7.0)))
            if not belt and MN.noise(Vector((x / 60, y / 60, 4.1))) < .18 + .25 * rnd.random(): continue           # 林缘羽化
            if not belt and any(K_.seg_dist(x, y, w) < 5 for w in walks): continue
            q = rnd.random(); zt = z0(x, y) - .3
            if q < .55: C.tree(K.T, x, y, rnd.uniform(10, 17), rnd.uniform(4.0, 6.8), 'oak', seed=2000 + n, z=zt)
            elif q < .68: C.tree(K.T, x, y, rnd.uniform(14, 19), rnd.uniform(4.5, 6.0), 'cedar', seed=2000 + n, z=zt)
            else: tree_var(K.T, M, x, y, zt, rnd.uniform(11, 18), rnd.uniform(3.5, 6.0), 2000 + n, ('beech', 'lime', 'lime', 'birch', 'pine')[int((q - .68) / .32 * 5)])
            n += 1
        yq += step
    for q in range(60):                                                          # 园中孤植树
        x, y = rnd.uniform(-260, 260), rnd.uniform(-220, 200)
        if S.frac(x, y) < .75 and lake_e(x, y) > 1.3 and not any(a - 6 <= x <= b + 6 and c - 6 <= y <= d + 6 for a, b, c, d in busy):
            kd = rnd.choice(('cedar', 'oak', 'beech', 'lime'))
            if kd in ('cedar', 'oak'): C.tree(K.T, x, y, rnd.uniform(13, 17), rnd.uniform(6, 8), kd, seed=4000 + q, z=z0(x, y) - .3)
            else: tree_var(K.T, M, x, y, z0(x, y) - .3, rnd.uniform(14, 18), rnd.uniform(6, 7.5), 4000 + q, kd)
    print('eden trees', n)
    ctx.anchor('woods', *S.edge(math.radians(20), .88), z0(*S.edge(math.radians(20), .88)) + 14); ctx.anchor('woods', *S.edge(math.radians(200), .88), z0(*S.edge(math.radians(200), .88)) + 14)

    # ---- 岛缘白石栏杆（让开停靠平台）
    P = S.pts(360, .975); seg = []
    for i, (x, y) in enumerate(P + P[:1]):
        if abs(math.atan2(y, x) + math.pi / 2) < .09: seg = []; continue
        seg.append((x, y))
        if len(seg) == 2:
            z = min(z0(*seg[0]), z0(*seg[1])); K.balustrade(seg, z - .1, .95); seg = [seg[-1]]

    # ---- 外层结界（卡 C6）：几乎透明的扁穹，只在格线上极淡发光
    K_.ward_dome(S, ctx.top_z, 70.0, M['ward_e'], ctx.B('ward'))


# ============================================================ 岛底
def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(7)
    mr = ctx.m('rock', lambda: K_.rock_v17('e_rock', ROCK, ROCK2, .02, VEIN, moss=(.22, .32, .12), moss_amt=.5, soil_z=-6.0, lichen=(.86, .84, .76)))
    mb = ctx.m('band', lambda: K_.rock_v17('e_band', ROCK, ROCK2, .03, VEIN, moss=(.22, .32, .12), moss_amt=.7, soil_z=-7.0))
    mg = ctx.m('core', lambda: C.glow('e_core', c=(.4, .72, 1.0), estr=3.5))
    mring = ctx.m('ring', lambda: C.glow('e_ring', c=(.4, .72, 1.0), estr=1.1))
    mcry = ctx.m('cry', lambda: C.flat('e_cry', (.4, .7, .95), .06, emit=(.5, .8, 1.0), estr=1.0))
    mwat = ctx.m('wcone', lambda: C.clear_glass('e_wcone', tint=(.62, .86, .92)))
    mroot = ctx.m('root', lambda: C.flat('e_root', (.2, .15, .1), .9, noise=.4))
    P = S.pts(288); cliff = 26
    K_.cliff_v17(ctx, B, P, cliff, mb, dz=1.5, ledge=.03, period=3.6, amp=.02, spur=.05)
    rings, apex = K_.body_v17(ctx, [(x * .985, y * .985) for x, y in P], [(.86, .1), (.7, .2), (.5, .32), (.3, .44), (.12, .54), (0, .6)], cliff,
                              dz=2.5, ledge=.04, period=6.5, amp=.03)
    K_.loft(B, rings, mr, apex=apex)
    for (u, v, r, d, sd) in ((-.5, .2, .16, .5, 1), (.48, -.25, .14, .42, 2), (.1, .55, .12, .36, 3)):            # 三座副锥
        K_.cone(B, u * S.rx + ox, v * S.ry, -cliff - R * .06, r * R, d * R, mr, seed=sd, rough=.25, n=32, nr=36, ledge=.06)
    for zq, fq in ((-cliff - .08 * R, .7), (-cliff - .2 * R, .3)):
        x, y = K_.ring_at(rings, zq)[int(len(P) * fq)]; ctx.anchor('u_rock', x, y, zq)
    ctx.anchor('u_rock', ox, 0, -cliff - .58 * R)
    # 清水倒锥（凝水蓄水体）：挂在主锥中段外侧，像一颗倒挂的水滴
    x, y, z = .06 * S.rx + ox, -.62 * S.ry, -cliff - .3 * R                     # 南侧、主锥已收进的位置：从正面仰视看得到
    B.cyl(x, y, z - .38 * R, .004 * R, .38 * R, mwat, 48, r2=.1 * R); B.sphere(x, y, z, .1 * R, mwat, sz=.4, seg=48, rings=10, zmin=0.0)
    B.cyl(x, y, z - .005 * R, .104 * R, R * .006, mring, 64, r2=.104 * R, cap=False)
    B.tube([(x, y + .02 * R, z + .03 * R), (x * .6, y * .6, z + .1 * R)], .012 * R, mr, n=8)                  # 与主锥相连的岩茎
    ctx.anchor('u_wcone', x, y - .02 * R, z - .15 * R)
    # 三核 + 符文环
    pts = K_.ring_at(rings, -cliff - .15 * R); K_.band(B, pts, -cliff - .15 * R, R * .004, mring, 1.02, ox); K_.band(B, pts, -cliff - .19 * R, R * .003, mring, 1.01, ox)
    for fq in (.2, .55, .85):
        x, y = pts[int(len(pts) * fq)]; K_.glow_orb(B, x, y, -cliff - .17 * R, R * .018, mg); ctx.anchor('u_core', x, y, -cliff - .17 * R)
    K_.crystals_down(B, rings, R, 6, mcry, rnd, cliff=cliff, s=(.025, .05))
    K_.hanging(ctx, B, P, 300, (5, 20), mroot, rnd, r=(.2, .45))
    mmoss = ctx.m('moss', lambda: C.flat('e_moss', (.2, .3, .1), .95, noise=.5)); K_.hanging(ctx, B, P, 120, (3, 8), mmoss, rnd, r=(.5, .9))
    # 湖水溢流：北缘主瀑 + 两道细瀑
    for da, w, L, st, al in ((0, 20.0, R * 1.3, 2.8, .95), (-.07, 4.0, R * .9, 2.8, .9), (.08, 3.5, R * .8, 2.8, .9)):
        a = FALL_ANG + da; ex, ey = S.edge(a, 1.0); K_.waterfall(ex + ox, ey, ctx.top_z(ex * .99, ey * .99) - .5, a, w, L, st, al, name='fall_e%d' % int(da * 100 + 50))
    ex, ey = S.edge(FALL_ANG, 1.0); ctx.anchor('u_fall', ex + ox, ey, -cliff - .1 * R)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
