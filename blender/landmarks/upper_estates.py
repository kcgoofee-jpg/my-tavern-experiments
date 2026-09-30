"""上层卡内三岛的标准版三维（共用一套部件）：罗斯柴尔德庄园（isle30）、庄园主联盟会所（isle9）、精英学院（isle25）。
各岛的 build.py 只写 SITE = '<id>' 然后调 run()。岛面轮廓直接取 tc_estates.Isle（与上层底图同一座岛，同一形状、同一朝向，+y = 地图北），
所以 blender/landmarks/map_cutout.py 的俯视抠图能原样盖在上层底图的岛上。

卡依据（docs/card-digest.md）：
- 罗斯柴尔德庄园 · 悬浮岛 R-02：伊莎贝拉家族的庄园、冬季宴会的举办地（视觉样例·请柬）。形制【仓库推断】：沃德斯登式法国文艺复兴府邸
  （蜂蜜色石、陡石板顶、圆塔尖顶、老虎窗）+ 冬季宴会用的双立方宴会厅（高窗、铅皮四坡顶、门廊车道）+ 玻璃连廊 + 冬园台地花坛。
- 庄园主联盟会所：卡有联盟（办拍卖会、品鉴会；冬季私人拍卖只限会员竞投），固定会所与位置【仓库推断】：
  蓓尔美尔街俱乐部式意大利宫殿楼（中庭玻璃顶）+ 顶光拍卖厅（冬季私人拍卖）；品鉴宴轮流做东 → 不画专属宴会厅。
- 精英学院：卡「贵族子弟接受私人教育或进入精英学院」，课程含家族管理、以太魔法修习、政治学、资产经营、礼仪与社交、军事基础。
  形制【仓库推断】：学院式四合院（门楼塔 + 讲堂楼）、礼仪大厅、图书馆、以太修习圆庭（中性铺地环）、操练场 + 运动场。卡说教会进不了悬浮岛 → 不画礼拜堂。
全部自建；中立建筑：无文字、无徽记、无人物；交通只有私人悬浮载具（停靠平台 + 悬浮车），不画飞艇。
bg_*（岛下岩体、云海、远处浮岛）只为成图，export_glb.py 不导出，map_cutout.py 也隐藏。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/<id>/build.py', run_name='__main__')" \\
      -- --cam c1 --res 2000 --samples 16 --out /tmp/x.jpg [--blend /tmp/x.blend]
cam: c1 3/4 鸟瞰（主图）/ c2 主楼近景
"""
import json, math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='day', res='1000', samples='32', out='/tmp/ue.jpg', blend='', log='', exposure=''))
ISLE = dict(rothschild_estate='isle30', league_club='isle9', elite_academy='isle25')


def island(site):
    """(轮廓点 [(x, y) 米，岛心为原点，+y 北], 朝伊甸的单位向量)"""
    import tc_estates as te
    d = next(i for i in json.load(open(os.environ.get('TC_ISLANDS') or os.path.join(HERE, '..', 'data', 'tc_islands.json')))['islands'] if i['id'] == ISLE[site])
    d = dict(d); d.setdefault('z', 0.0)                 # v12：岛表不再有 z（海拔在 map/data/upper_depth.json）；模型只要轮廓
    e = te.Isle(d)
    P = [((x - e.x) * 100, (y - e.y) * 100) for x, y in e.outline_world(1.0, 128)]
    hx, hy = 1.5 - e.x, 0.8 - e.y; n = math.hypot(hx, hy)
    return P, (hx / n, hy / n)


def radius_at(P, ang):
    best = 0.0
    for x, y in P:
        a = math.atan2(y, x)
        if abs(math.atan2(math.sin(a - ang), math.cos(a - ang))) < 0.04: best = max(best, math.hypot(x, y))
    return best or min(math.hypot(x, y) for x, y in P)


class Kit:
    def __init__(self, sc):
        self.sc = sc
        M = self.M = {}
        M['stone'] = C.ashlar('stone_honey', c=(0.74, 0.64, 0.48), course=0.6, block=1.2)
        M['stone_pale'] = C.ashlar('stone_portland', c=(0.8, 0.78, 0.72), course=0.55, block=1.3)
        M['stone_grey'] = C.ashlar('stone_grey', c=(0.6, 0.6, 0.58), course=0.5, block=1.0)
        M['brick'] = C.pbr('brick', 'dark_brick_wall', 1.6, tint=(0.95, 0.6, 0.48), value=1.05, sat=0.85)
        M['trim'] = C.flat('trim', (0.86, 0.84, 0.78), 0.55, noise=0.12)
        M['slate'] = C.pbr('slate', 'roof_slates_02', 2.0, tint=(0.55, 0.6, 0.68), sat=0.5)
        M['lead'] = C.flat('lead', (0.38, 0.4, 0.42), 0.5, metal=0.3, noise=0.1)
        M['copper'] = C.flat('verdigris', (0.32, 0.5, 0.44), 0.55, noise=0.25)
        M['glass'] = C.glass('glass', tint=(0.05, 0.06, 0.08))
        M['glass_roof'] = C.clear_glass('glass_roof', tint=(0.75, 0.85, 0.9))
        M['iron'] = C.flat('iron', (0.03, 0.03, 0.035), 0.45, metal=0.5)
        M['gilt'] = C.flat('gilt', (0.8, 0.62, 0.3), 0.3, metal=1.0)
        M['grass'] = C.pbr('grass', 'grass_ground', 5.0, tint=(0.62, 0.95, 0.5), sat=1.05)
        M['lawn'] = C.flat('lawn', (0.16, 0.3, 0.08), 0.85, noise=0.25)
        M['lawn2'] = C.flat('lawn_stripe', (0.2, 0.35, 0.1), 0.85, noise=0.2)
        M['gravel'] = C.pbr('gravel', 'precast_stone_paving', 2.0, tint=(0.95, 0.9, 0.8), sat=0.4)
        M['pave'] = C.pbr('paving', 'white_sandstone_blocks_02', 2.0, tint=(0.92, 0.9, 0.84), sat=0.5)
        M['hedge'] = C.flat('hedge', (0.06, 0.14, 0.05), 0.85, noise=0.4)
        M['bed'] = C.flat('bed_winter', (0.35, 0.12, 0.14), 0.9, noise=0.5)
        M['water'] = C.glass('water', tint=(0.04, 0.12, 0.14), rough=0.03)
        M['track'] = C.flat('track', (0.55, 0.3, 0.22), 0.9, noise=0.3)
        M['deck'] = C.pbr('pad_deck', 'hangar_concrete_floor', 5.0, tint=(0.8, 0.8, 0.82), sat=0.3)
        M['steel'] = C.flat('pad_steel', (0.23, 0.25, 0.27), 0.4, metal=0.8)
        M['mark'] = C.flat('pad_mark', (0.75, 0.76, 0.76), 0.7)
        M['car'] = C.flat('car_body', (0.12, 0.13, 0.16), 0.25, metal=0.6, coat=0.6)
        M['carg'] = C.glass('car_glass', tint=(0.03, 0.04, 0.05))
        M['aether'] = C.flat('aether_lamp', (0.8, 0.93, 1.0), 0.15, emit=(0.62, 0.86, 1.0), estr=5.0)
        M['rock'] = C.pbr('rock', 'concrete_wall_008', 6.0, tint=(0.6, 0.52, 0.44), sat=0.4, nstr=2.0)
        M['cloud'] = C.flat('cloud', (0.9, 0.92, 0.95), 1.0, noise=0.1)
        M['far'] = C.flat('far_island', (0.5, 0.58, 0.7), 1.0, noise=0.1)
        self.W = C.Batch('walls_ext'); self.R = C.Batch('roof'); self.WN = C.Batch('windows')
        self.CH = C.Batch('props_chimneys'); self.G = C.Batch('site_ground'); self.GD = C.Batch('site_garden')
        self.T = C.Batch('site_trees'); self.DK = C.Batch('site_dock'); self.HC = C.Batch('props_hovercar')
        self.RL = C.Batch('props_railings')

    # ------------------------------------------------ 岛面
    def ground(self, P):
        M, G = self.M, self.G
        n = len(P)
        G.poly([(0, 0, 0)] + [(x, y, 0) for x, y in P], [(0, i + 1, (i + 1) % n + 1) for i in range(n)], M['grass'])
        for i in range(n):                                   # 岛缘石护沿
            (xa, ya), (xb, yb) = P[i], P[(i + 1) % n]
            self.RL.strip([(xa, ya, 0.0), (xb, yb, 0.0)], 0.7, 0.45, M['stone_grey'])
        rk = C.Batch('bg_island_rock')                       # 岛下倒锥岩体（只为成图）
        ring = [(x, y, -0.02) for x, y in P]; mid = [(x * .7, y * .7, -22) for x, y in P]
        vs = ring + mid + [(0, 0, -60)]
        fs = [(i, (i + 1) % n, n + (i + 1) % n, n + i)[::-1] for i in range(n)] + [(n + i, n + (i + 1) % n, 2 * n)[::-1] for i in range(n)]
        rk.poly(vs, fs, M['rock'])

    def lawn(self, pts, m=None, z=0.03):
        n = len(pts); cx = sum(p[0] for p in pts) / n; cy = sum(p[1] for p in pts) / n
        self.GD.poly([(cx, cy, z)] + [(x, y, z) for x, y in pts], [(0, i + 1, (i + 1) % n + 1) for i in range(n)], m or self.M['lawn'])

    def rect(self, x0, x1, y0, y1, m, z=0.04, h=0.0, B=None):
        (B or self.GD).box(x0, x1, y0, y1, z - 0.02 if not h else z, z + (h or 0.0), m)

    def path(self, pts, w, m=None, z=0.05):
        self.GD.strip([(x, y, z) for x, y in pts], w, 0.04, m or self.M['gravel'])

    def ellipse(self, cx, cy, a, b, n=40, a0=0.0):
        return [(cx + a * math.cos(a0 + k * math.tau / n), cy + b * math.sin(a0 + k * math.tau / n)) for k in range(n)]

    def hedge_rect(self, x0, x1, y0, y1, h=0.9, t=0.6, gaps=True):
        M, B = self.M, self.GD
        xm, ym = (x0 + x1) / 2, (y0 + y1) / 2; g = 1.6 if gaps else 0
        for (a, b, c, d) in ((x0, xm - g, y0, y0 + t), (xm + g, x1, y0, y0 + t), (x0, xm - g, y1 - t, y1), (xm + g, x1, y1 - t, y1),
                             (x0, x0 + t, y0, ym - g), (x0, x0 + t, ym + g, y1), (x1 - t, x1, y0, ym - g), (x1 - t, x1, ym + g, y1)):
            if b > a and d > c: B.box(a, b, c, d, 0, h, M['hedge'])

    def parterre(self, x0, x1, y0, y1, bed=None):
        """黄杨绿篱框 + 冬季花床（深红叶草）+ 中心修剪紫杉"""
        M = self.M
        self.rect(x0, x1, y0, y1, M['gravel'])
        self.hedge_rect(x0 + 0.6, x1 - 0.6, y0 + 0.6, y1 - 0.6, 0.7, 0.5)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; w, d = (x1 - x0) / 2 - 2.2, (y1 - y0) / 2 - 2.2
        for sx in (-1, 1):
            for sy in (-1, 1):
                self.rect(cx + sx * 1.0, cx + sx * (1.0 + w * .8), cy + sy * 1.0, cy + sy * (1.0 + d * .8), bed or M['bed'], z=0.08)
        C.tree(self.T, cx, cy, 2.2, 0.8, 'yew', seed=int(cx * 7 + cy))

    def fountain(self, x, y, r):
        M = self.M
        self.GD.lathe(x, y, 0, [(r, 0.0), (r, 0.55), (r - 0.4, 0.55), (r - 0.4, 0.35), (0.01, 0.35)], M['stone_pale'], n=40)
        self.GD.cyl(x, y, 0.3, r - 0.45, 0.2, M['water'], 40)
        self.GD.lathe(x, y, 0.35, [(0.6, 0.0), (0.35, 1.2), (r * .35, 1.5), (r * .35, 1.65), (0.2, 1.7), (0.15, 2.6), (0.3, 2.7), (0.01, 2.9)], M['stone_pale'], n=24)

    # ------------------------------------------------ 建筑部件
    def block(self, x0, x1, y0, y1, floors, fh=4.2, wall=None, bay=3.6, base=0.0, cornice=True, win=(1.3, 2.3), skip=(), rustic_ground=True):
        """矩形楼体：墙、首层石台基、各层窗（深色玻璃 + 石窗套）、檐口；返回檐口顶高。skip：不开窗的面 'n' 's' 'e' 'w'"""
        M = self.M; W = self.W; wall = wall or M['stone']
        top = base + floors * fh
        W.box(x0, x1, y0, y1, base, top, wall)
        W.box(x0 - 0.25, x1 + 0.25, y0 - 0.25, y1 + 0.25, base, base + 0.9, M['stone_grey'])        # 台基
        if cornice:
            W.box(x0 - 0.6, x1 + 0.6, y0 - 0.6, y1 + 0.6, top, top + 0.55, M['trim'])
            W.box(x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3, top - 0.35, top, M['trim'])
        for f in range(floors):
            zb = base + f * fh + (1.1 if f == 0 else 0.9); ww, wh = win[0], win[1] * (1.1 if f == 1 else (0.8 if f == floors - 1 and floors > 2 else 1.0))
            if f: W.box(x0 - 0.12, x1 + 0.12, y0 - 0.12, y1 + 0.12, base + f * fh - 0.1, base + f * fh + 0.15, M['trim'])   # 层间线脚
            for side in 'nsew':
                if side in skip: continue
                if side in 'ns':
                    L = x1 - x0; n = max(1, int(L / bay)); y = y1 if side == 'n' else y0; o = 0.06 if side == 'n' else -0.06
                    for k in range(n):
                        x = x0 + (k + 0.5) * L / n
                        self.WN.box(x - ww / 2, x + ww / 2, y - 0.02, y + o, zb, zb + wh, M['glass'])
                        W.box(x - ww / 2 - 0.15, x + ww / 2 + 0.15, y - 0.02, y + o * 2, zb - 0.15, zb, M['trim'])
                        W.box(x - ww / 2 - 0.12, x + ww / 2 + 0.12, y - 0.02, y + o * 2, zb + wh, zb + wh + 0.25, M['trim'])
                else:
                    L = y1 - y0; n = max(1, int(L / bay)); x = x1 if side == 'e' else x0; o = 0.06 if side == 'e' else -0.06
                    for k in range(n):
                        y = y0 + (k + 0.5) * L / n
                        self.WN.box(x - 0.02, x + o, y - ww / 2, y + ww / 2, zb, zb + wh, M['glass'])
                        W.box(x - 0.02, x + o * 2, y - ww / 2 - 0.15, y + ww / 2 + 0.15, zb - 0.15, zb, M['trim'])
                        W.box(x - 0.02, x + o * 2, y - ww / 2 - 0.12, y + ww / 2 + 0.12, zb + wh, zb + wh + 0.25, M['trim'])
        return top + (0.55 if cornice else 0.0)

    def hip(self, x0, x1, y0, y1, z, h, m=None, over=0.5):
        B, m = self.R, m or self.M['slate']
        x0 -= over; x1 += over; y0 -= over; y1 += over
        d = min(x1 - x0, y1 - y0) / 2
        if x1 - x0 >= y1 - y0:
            ym = (y0 + y1) / 2; r0, r1 = (x0 + d, ym, z + h), (x1 - d, ym, z + h)
            vs = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), r0, r1]
            fs = [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4), (3, 2, 1, 0)]
        else:
            xm = (x0 + x1) / 2; r0, r1 = (xm, y0 + d, z + h), (xm, y1 - d, z + h)
            vs = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), r0, r1]
            fs = [(0, 1, 4), (2, 3, 5), (1, 2, 5, 4), (3, 0, 4, 5), (3, 2, 1, 0)]
        B.poly(vs, fs, m)
        B.strip([r0, r1], 0.35, 0.2, self.M['lead'])

    def dormers(self, x0, x1, y, z, n, face=-1, h=2.4, w=1.6):
        """老虎窗：沿 y 面一排（face=-1 南坡、+1 北坡）"""
        M = self.M
        for k in range(n):
            x = x0 + (k + 0.5) * (x1 - x0) / n
            yy = y + face * 0.4
            self.R.box(x - w / 2, x + w / 2, yy - 1.4, yy + 1.4, z, z + h, M['stone'])
            self.WN.box(x - w / 2 + 0.3, x + w / 2 - 0.3, yy + face * 1.4 - 0.02 * face, yy + face * 1.46, z + 0.3, z + h - 0.4, M['glass'])
            self.R.gable(x - w / 2 - 0.2, x + w / 2 + 0.2, yy - 1.5, yy + 1.5, z + h, 1.1, M['slate'], along='y')

    def chimney(self, x, y, z, h=3.2, sx=1.4, sy=0.9, m=None):
        self.CH.boxc(x, y, z, sx, sy, h, m or self.M['stone'])
        self.CH.boxc(x, y, z + h, sx + 0.3, sy + 0.3, 0.3, self.M['trim'])
        for k in (-1, 1): self.CH.cyl(x + k * sx * 0.25, y, z + h + 0.3, 0.16, 0.6, self.M['brick'], 10)

    def tower(self, x, y, r, h, cone, m=None, roof=None, finial=True):
        M = self.M
        self.W.cyl(x, y, 0, r, h, m or M['stone'], 28, smooth=True)
        self.W.cyl(x, y, h - 0.3, r + 0.35, 0.5, M['trim'], 28)
        for k in range(6):
            a = k * math.tau / 6 + 0.26
            for zz in (h * .3, h * .6):
                self.WN.box(x + (r - 0.05) * math.cos(a) - 0.5, x + (r - 0.05) * math.cos(a) + 0.5, y + (r - 0.05) * math.sin(a) - 0.5,
                            y + (r - 0.05) * math.sin(a) + 0.5, zz, zz + 2.0, M['glass'])
        self.R.cyl(x, y, h + 0.2, r + 0.5, cone, roof or M['slate'], 28, r2=0.05, smooth=True)
        if finial: self.R.cyl(x, y, h + 0.2 + cone, 0.08, 2.2, M['lead'], 8)

    def balustrade(self, pts, z, h=0.9):
        M = self.M
        self.RL.strip([(x, y, z + h) for x, y in pts], 0.3, 0.14, M['trim'])
        for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
            L = math.hypot(xb - xa, yb - ya); n = max(1, int(L / 0.45))
            for k in range(n):
                t = (k + 0.5) / n; self.RL.cyl(xa + (xb - xa) * t, ya + (yb - ya) * t, z, 0.09, h, M['trim'], 6, smooth=False)

    def portico(self, x, y0, w, d, h, n=4, face=-1):
        """门廊：n 根柱 + 山花（沿 x 居中于 x；face=-1 朝南伸出）"""
        M = self.M
        y1 = y0 + face * d; ya, yb = min(y0, y1), max(y0, y1)
        self.W.box(x - w / 2, x + w / 2, ya, yb, 0, 0.6, M['stone_grey'])
        for k in range(n):
            cx = x - w / 2 + 0.8 + k * (w - 1.6) / (n - 1)
            self.W.cyl(cx, y1 - face * 0.8, 0.6, 0.42, h - 0.6, M['stone_pale'], 16)
        self.W.box(x - w / 2, x + w / 2, ya, yb, h, h + 1.0, M['trim'])
        self.R.gable(x - w / 2 - 0.3, x + w / 2 + 0.3, ya - 0.2, yb + 0.2, h + 1.0, 2.4, M['stone_pale'], along='y')

    def glass_gallery(self, pts, w=5.0, h=4.5):
        """玻璃连廊：石基 + 铸铁细框玻璃墙 + 双坡玻璃顶"""
        M = self.M
        for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
            x0, x1, y0, y1 = min(xa, xb) - (w / 2 if xa == xb else 0), max(xa, xb) + (w / 2 if xa == xb else 0), \
                min(ya, yb) - (w / 2 if ya == yb else 0), max(ya, yb) + (w / 2 if ya == yb else 0)
            self.W.box(x0, x1, y0, y1, 0, 0.8, M['stone_grey'])
            self.WN.box(x0 + 0.1, x1 - 0.1, y0 + 0.1, y1 - 0.1, 0.8, h, M['glass_roof'])
            self.R.gable(x0, x1, y0, y1, h, 1.6, M['glass_roof'], along='x' if ya == yb else 'y')
            L = max(x1 - x0, y1 - y0)
            for k in range(int(L / 2.5) + 1):
                t = k * 2.5
                if ya == yb: self.RL.box(x0 + t - 0.06, x0 + t + 0.06, y0, y1, 0.8, h + 0.1, M['iron'])
                else: self.RL.box(x0, x1, y0 + t - 0.06, y0 + t + 0.06, 0.8, h + 0.1, M['iron'])

    def trees_ring(self, P, s0, s1, n, seed, avoid, kinds=('oak', 'oak', 'cedar')):
        rnd = random.Random(seed); k = 0; tries = 0
        while k < n and tries < n * 30:
            tries += 1
            i = rnd.randrange(len(P)); s = rnd.uniform(s0, s1); x, y = P[i][0] * s, P[i][1] * s
            if any(a <= x <= b and c <= y <= d for a, b, c, d in avoid): continue
            kd = kinds[k % len(kinds)]
            C.tree(self.T, x, y, rnd.uniform(9, 14) if kd != 'cedar' else rnd.uniform(12, 16), rnd.uniform(3.5, 5.5), kd, seed=seed * 100 + k)
            k += 1

    # ------------------------------------------------ 停靠平台 + 悬浮车（卡：岛间只有私人悬浮载具）
    def dock(self, P, toward, r=9.0):
        M, DK = self.M, self.DK
        ang = math.atan2(toward[1], toward[0]); R0 = radius_at(P, ang)
        ux, uy = math.cos(ang), math.sin(ang); px, py = ux * (R0 + r + 1.0), uy * (R0 + r + 1.0)
        DK.cyl(px, py, -0.55, r + 0.3, 0.5, M['steel'], 48, smooth=False)
        DK.cyl(px, py, -0.05, r, 0.05, M['deck'], 48, smooth=False)
        DK.cyl(px, py, 0.0, r - 0.4, 0.012, M['mark'], 48, smooth=False)
        DK.cyl(px, py, 0.0, r - 0.75, 0.02, M['deck'], 48, smooth=False)
        bx0, by0 = ux * (R0 - 3), uy * (R0 - 3); bx1, by1 = ux * (R0 + 1.5), uy * (R0 + 1.5)
        DK.strip([(bx0, by0, -0.02), (bx1, by1, -0.02)], 4.6, 0.3, M['deck'])
        for k in range(20):
            a0 = ang + math.pi + (k - 10) * math.tau / 24
            if abs(k - 10) < 2: continue
            p0 = (px + (r - 0.1) * math.cos(a0), py + (r - 0.1) * math.sin(a0)); a1 = a0 + math.tau / 24
            p1 = (px + (r - 0.1) * math.cos(a1), py + (r - 0.1) * math.sin(a1))
            DK.strip([(p0[0], p0[1], 1.05), (p1[0], p1[1], 1.05)], 0.06, 0.06, M['iron'])
            DK.cyl(p0[0], p0[1], 0.0, 0.035, 1.08, M['iron'], 6)
        for k in range(6):
            a = k * math.tau / 6; DK.cyl(px + (r + 0.05) * math.cos(a), py + (r + 0.05) * math.sin(a), -0.1, 0.12, 0.2, M['aether'], 10)
        C.beacon_ring(DK, px, py, 0.0, r + 1.2, M['aether'], n=10, s=0.25)
        DK.strip([(bx0, by0, 0.3), (px, py, 0.3)], 0.25, 0.1, M['aether'])   # 进场引导光带
        # 悬浮车（无轮、无旋翼：流线车身 + 底部四个悬浮环）
        cx, cy, cz = px, py, 1.35; HC = self.HC
        rot = C.Matrix.Rotation(ang, 4, 'Z') if hasattr(C, 'Matrix') else None
        HC.sphere(cx, cy, cz, 1.0, M['car'], sz=0.5, seg=24, rings=12, sx=2.3)
        HC.sphere(cx + 0.3, cy, cz + 0.3, 0.8, M['carg'], sz=0.55, seg=20, rings=10, sx=1.5, zmin=0.0)
        for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
            HC.cyl(cx + ex * 1.7, cy + ey * 1.2, cz - 0.3, 0.55, 0.3, M['car'], 20)
            HC.cyl(cx + ex * 1.7, cy + ey * 1.2, cz - 0.33, 0.42, 0.02, M['aether'], 16)
        return (px, py), (bx0, by0)


    # ------------------------------------------------ 2088 魔导科技层（用户 2026-09-28 v11：英式庄园 × 玻璃 / 合金 / 全息园灯 / 悬浮构件）
    def magitech(self, P, seed=1, avoid=()):
        """岛缘符文环 + 结界六角格边 + 岛底以太悬浮核心与晶簇 + 悬浮玻璃亭 + 全息园灯 + 悬浮光球花钵"""
        M = self.M; rnd = random.Random(seed)
        if 'glow' not in M:
            M['glow'] = C.glow('aether_glow', estr=8.0); M['rune'] = C.glow('rune', estr=5.0)
            M['ward'] = C.hex_ward_mat('ward_hex', scale=0.08, alpha=0.45)
            M['crystal'] = C.flat('aether_crystal', (0.5, 0.85, 1.0), 0.1, emit=C.AETHER_C, estr=3.0)
            M['alloy'] = C.flat('alloy', (0.62, 0.64, 0.68), 0.25, metal=0.9)
            M['holo'] = C.glow('holo_light', c=(0.7, 0.95, 1.0), estr=4.0)
        MG = C.Batch('props_magitech'); WD = C.Batch('props_ward'); UN = C.Batch('props_underside')
        n = len(P); cx = sum(p[0] for p in P) / n; cy = sum(p[1] for p in P) / n
        C.rune_ring(MG, [(cx + (x - cx) * 1.015, cy + (y - cy) * 1.015) for x, y in P], 0.35, 0.5, M['rune'])
        C.hex_ward(WD, [(cx + (x - cx) * 1.05, cy + (y - cy) * 1.05) for x, y in P], -0.5, 9.0, M['ward'])
        R = max(math.hypot(x - cx, y - cy) for x, y in P)
        for k in range(3):                                   # 岛底核心（俯视看不到，斜俯与三维里看得到）
            a = k * math.tau / 3 + 0.4; d = R * 0.35
            C.aether_core(UN, cx + math.cos(a) * d, cy + math.sin(a) * d, -18, 7.0, M['rock'], M['glow'], M['rune'], seed=seed + k)
        for k in range(7):                                   # 岛缘晶簇（从崖边斜伸出去，俯视可见）
            i = rnd.randrange(n); x, y = P[i]
            C.crystal_cluster(MG, cx + (x - cx) * 1.02, cy + (y - cy) * 1.02, -1.5, rnd.uniform(4, 7), M['crystal'], seed=seed * 10 + k)
            C.crystal_cluster(UN, cx + (x - cx) * 0.8, cy + (y - cy) * 0.8, -10, rnd.uniform(5, 9), M['crystal'], seed=seed * 20 + k, down=True)
        free = lambda x, y: not any(a <= x <= b and c <= y <= d for a, b, c, d in avoid)
        placed = 0
        for t in range(200):                                 # 悬浮玻璃亭：合金圆台 + 玻璃穹，离地 6 m，下面一圈光环
            if placed >= 2: break
            i = rnd.randrange(n); f = rnd.uniform(.45, .7); x, y = cx + (P[i][0] - cx) * f, cy + (P[i][1] - cy) * f
            if not free(x, y): continue
            MG.cyl(x, y, 6.0, 4.5, 0.5, M['alloy'], 32); MG.sphere(x, y, 6.5, 4.0, M['glass_roof'], sz=0.8, seg=24, rings=12, zmin=0.0)
            MG.cyl(x, y, 5.7, 4.8, 0.1, M['rune'], 32, r2=4.8, cap=False); placed += 1
        for k in range(28):                                  # 全息园灯（细光柱）+ 悬浮光球花钵
            i = rnd.randrange(n); f = rnd.uniform(.3, .85); x, y = cx + (P[i][0] - cx) * f, cy + (P[i][1] - cy) * f
            if not free(x, y): continue
            if k % 3: MG.cyl(x, y, 0.0, 0.12, 2.6, M['holo'], 6)
            else: MG.sphere(x, y, 3.2, 0.9, M['holo'], seg=12, rings=6); MG.cyl(x, y, 2.2, 0.8, 0.5, M['alloy'], 12)

    # ------------------------------------------------ 背景 + 光 + 相机
    def finish(self, cams, P):
        M = self.M
        cl = C.Batch('bg_clouds'); rnd = random.Random(8)
        for k in range(14):
            a = rnd.uniform(0, math.tau); d = rnd.uniform(500, 1600)
            for j in range(4):
                cl.sphere(d * math.cos(a) + rnd.uniform(-40, 40), d * math.sin(a) + rnd.uniform(-40, 40), -420, rnd.uniform(70, 130), M['cloud'], sz=0.3, seg=16, rings=8, zmin=-0.1)
        cl.box(-6000, 6000, -6000, 6000, -470, -460, M['cloud'])
        for (fx, fy, fz, fr, seed) in ((-900, 700, -60, 70, 22), (1100, -500, 40, 55, 23), (300, 1300, -20, 60, 24)):
            fi = C.Batch('bg_far_island_%d' % seed); r2 = random.Random(seed); n = 40
            top = [(fx + fr * math.cos(i * math.tau / n) * r2.uniform(.9, 1.05), fy + fr * .8 * math.sin(i * math.tau / n) * r2.uniform(.9, 1.05), fz) for i in range(n)]
            fi.poly(top + [(fx, fy, fz - fr * .8)], [tuple(range(n))] + [(i, n, (i + 1) % n)[::-1] for i in range(n)], M['far'])
            for k in range(8):
                fi.boxc(fx + r2.uniform(-.5, .5) * fr, fy + r2.uniform(-.4, .4) * fr, fz, r2.uniform(6, 14), r2.uniform(6, 14), r2.uniform(6, 20), M['far'])
        C.Batch.build_all()
        import bpy
        for ob in bpy.data.objects:
            if ob.name.startswith('bg_clouds') or ob.name.startswith('props_ward') or ob.name.startswith('props_magitech'): ob.visible_shadow = False
        C.sky_sun(self.sc, 'day', sun_az=125.0, sun_el=40.0)        # 与上层底图同一太阳方位（东南偏南，逆光少）
        self.sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else -0.2
        pos, tgt, lens = cams[A['cam']]
        C.camera(self.sc, pos, tgt, lens)
        C.render(self.sc, A['out'], A['res'], 1.5, A['blend'])


# ====================================================================== 罗斯柴尔德庄园
def rothschild(K, P, toward):
    M = K.M
    M['stone'] = C.ashlar('stone_honey_r', c=(0.84, 0.64, 0.38), course=0.6, block=1.2)      # 设定「蜂蜜色石」：只改本函数用的石色，不动 Kit 共用的
    M['glass_hall'] = C.clear_glass('glass_hall', tint=(0.7, 0.85, 0.95))
    # 主府邸：沃德斯登式——长主楼 + 两端圆塔 + 中央阶梯塔楼，陡石板顶带老虎窗
    X0, X1, Y0, Y1 = -34.0, 24.0, 8.0, 24.0
    top = K.block(X0, X1, Y0, Y1, 3, 4.6, M['stone'], bay=3.4)
    K.hip(X0, X1, Y0, Y1, top, 9.0)
    K.dormers(X0 + 4, X1 - 4, Y0, top + 1.2, 9, -1); K.dormers(X0 + 4, X1 - 4, Y1, top + 1.2, 9, +1)
    for x in (X0 + 6, -10, 6, X1 - 6): K.chimney(x, (Y0 + Y1) / 2, top + 6.5, 4.0)
    for (x, y) in ((X0, Y0), (X0, Y1), (X1, Y0), (X1, Y1)): K.tower(x, y, 3.6, top + 2.0, 8.5)
    K.block(-9.0, -1.0, Y0 - 5.0, Y0, 4, 4.6, M['stone'], bay=2.8, skip='n')        # 中央楼梯塔（前凸）
    K.hip(-9.0, -1.0, Y0 - 5.0, Y0, 4 * 4.6 + 0.55, 7.5, over=0.3)
    K.R.cyl(-5.0, Y0 - 2.5, 4 * 4.6 + 8.0, 0.1, 2.5, M['lead'], 8)
    K.block(X1, X1 + 12, Y0 + 2, Y1 - 2, 2, 4.4, M['stone'], bay=3.2)                # 东侧矮翼
    K.hip(X1, X1 + 12, Y0 + 2, Y1 - 2, 2 * 4.4 + 0.55, 5.0)
    K.portico(-5.0, Y0 - 5.0, 9.0, 4.0, 6.0)
    # 冬季宴会厅：双立方（36 × 18 × 18 m），高窗、铅皮四坡顶、门廊车道；玻璃连廊接主楼西端
    BX0, BX1, BY0, BY1 = -62.0, -44.0, -24.0, 12.0
    ht = K.block(BX0, BX1, BY0, BY1, 2, 8.4, M['stone'], bay=4.5, win=(2.2, 5.4))
    K.hip(BX0, BX1, BY0, BY1, ht, 9.0, M['glass_hall'], over=0.2)                  # 设定：合金骨架的玻璃宴会厅——玻璃四坡顶 + 铁骨架
    for xf in (BX0 + 4.5, BX0 + 9.0, BX1 - 4.5):
        K.R.strip([(xf, BY0 + 0.5, ht + 0.4), (xf, BY1 - 0.5, ht + 0.4)], 0.22, 0.18, M['iron'])
    K.balustrade([(BX0 - .3, BY0 - .3), (BX1 + .3, BY0 - .3), (BX1 + .3, BY1 + .3), (BX0 - .3, BY1 + .3), (BX0 - .3, BY0 - .3)], ht)
    for k in range(3): K.R.box(BX0 + 5, BX1 - 5, BY0 + 6 + k * 10, BY0 + 10 + k * 10, ht + 6.0, ht + 7.4, M['glass_roof'])   # 屋脊采光
    K.portico(-53.0, BY0, 12.0, 5.0, 8.0, n=6)
    K.glass_gallery([(BX1, 16.0), (X0 - 3.6, 16.0)], w=5.5)
    # 前庭：南侧回车圆 + 车道通停靠平台
    K.lawn(K.ellipse(-5, -20, 15, 11), M['gravel']); K.lawn(K.ellipse(-5, -20, 9, 6), M['lawn'], z=0.06); K.fountain(-5, -20, 3.2)
    K.path([(-5, -9), (-5, Y0 - 5)], 8, M['gravel'])
    K.path([(-53, BY0 - 5), (-53, -32), (-20, -30)], 7, M['gravel'])
    # 冬园台地（北侧）：石栏台地 + 四块花坛 + 长水池
    K.rect(-30, 20, Y1 + 1, Y1 + 12, M['pave'], z=0.0, h=0.6, B=K.W)
    K.balustrade([(-30, Y1 + 12), (20, Y1 + 12)], 0.6)
    for k in range(4): K.parterre(-28 + k * 12.2, -18 + k * 12.2, Y1 + 14, Y1 + 30)
    K.GD.box(-24, 14, Y1 + 32, Y1 + 36, 0.02, 0.35, M['stone_pale']); K.GD.box(-23.4, 13.4, Y1 + 32.6, Y1 + 35.4, 0.3, 0.38, M['water'])
    K.path([(-30, Y1 + 13), (20, Y1 + 13)], 3, M['gravel'])
    # 东草坪 + 林带
    K.lawn(K.ellipse(46, -12, 22, 26), M['lawn2'])
    avoid = [(BX0 - 8, X1 + 16, BY0 - 14, Y1 + 40), (-25, 15, -40, -5)]
    K.trees_ring(P, .72, .92, 38, 30, avoid)
    for k in range(10): C.tree(K.T, 40 + 7 * math.cos(k), -12 + 12 * math.sin(k * 1.7), 11, 4.5, 'oak' if k % 3 else 'cedar', seed=300 + k)
    dk, br = K.dock(P, toward)
    K.path([br, (br[0] * .6, br[1] * .6), (-53, -32)], 6, M['gravel'])
    tx, ty = toward                                      # c3：从岛心一侧看湾口宾客停靠平台
    c3 = ((dk[0] - tx * 62 - ty * 26, dk[1] - ty * 62 + tx * 26, 30), (dk[0], dk[1], 0), 34)
    return {'c1': ((-150, -170, 110), (-10, 2, 0), 40), 'c2': ((-40, -75, 22), (-18, 6, 10), 30), 'c3': c3}


# ====================================================================== 庄园主联盟会所
def league(K, P, toward):
    M = K.M
    # 设定（docs/upper-setting.md §4.6）：米黄石 + 红陶屋顶 + 玻璃中庭透暖光 + 秋林；本函数只改会所自己的材质，不动 Kit 里其它庄园共用的
    M['stone_cream'] = C.ashlar('stone_cream', c=(0.86, 0.74, 0.52), course=0.55, block=1.3)
    M['terracotta'] = C.flat('terracotta', (0.5, 0.16, 0.07), 0.7, noise=0.35)
    M['atrium'] = C.flat('atrium_warm', (1, 1, 1), 0.2, emit=(1.0, 0.62, 0.25), estr=6.0)
    tm = C.tree_mats()                                   # 秋林：橙红 / 赭黄 / 金黄的叶色（每次运行只建一座岛，覆盖不外溢）
    for k, col in (('leaf_a', (0.55, 0.16, 0.05)), ('leaf_b', (0.62, 0.33, 0.06)), ('leaf_c', (0.66, 0.5, 0.1))):
        m = C.flat('tree_autumn_' + k, col, 0.75, noise=0.35)
        b = [n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]
        b.inputs['Subsurface Weight'].default_value = 0.0; b.inputs['Transmission Weight'].default_value = 0.0
        tm[k] = m
    # 意大利宫殿式会所（改革俱乐部）：40 × 34 m 方楼，三层 + 大檐口，红陶四坡顶，中庭玻璃顶
    X0, X1, Y0, Y1 = -20.0, 20.0, -10.0, 20.0
    top = K.block(X0, X1, Y0, Y1, 3, 5.2, M['stone_cream'], bay=3.3, win=(1.4, 2.6))
    K.W.box(X0 - 1.1, X1 + 1.1, Y0 - 1.1, Y1 + 1.1, top - 0.2, top + 0.6, M['trim'])      # 大檐口（宫殿式）
    K.R.box(X0 - 0.2, X1 + 0.2, Y0 - 0.2, Y1 + 0.2, top + 0.6, top + 0.9, M['lead'])
    K.hip(X0 - 0.4, X1 + 0.4, Y0 - 0.4, Y1 + 0.4, top + 0.9, 4.2, M['terracotta'], over=0.4)      # 红陶屋顶
    K.R.box(-8, 8, -1, 11, top + 4.6, top + 5.1, M['iron'])
    K.R.poly([(-7.6, -0.6, top + 5.1), (7.6, -0.6, top + 5.1), (7.6, 10.6, top + 5.1), (-7.6, 10.6, top + 5.1), (0, 5, top + 8.4)],
             [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], M['glass_roof'])                  # 中庭玻璃顶（穿出屋面的采光亭）
    K.R.box(-7.0, 7.0, -0.2, 10.2, top + 4.6, top + 5.0, M['atrium'])                        # 中庭透出的暖橙光
    for x in (-15, -5, 5, 15): K.chimney(x, Y1 - 2, top + 0.9, 2.2, 1.6, 0.8)
    K.portico(0, Y0, 8.0, 3.5, 5.5, n=4)
    # 顶光拍卖厅（冬季私人拍卖，只限会员）：长厅 + 三道采光天窗，东接主楼
    AX0, AX1, AY0, AY1 = 20.0, 44.0, -4.0, 16.0
    ht = K.block(AX0, AX1, AY0, AY1, 1, 9.0, M['stone_cream'], bay=5.0, win=(1.6, 3.2), skip='w')
    K.R.box(AX0, AX1 + .2, AY0 - .2, AY1 + .2, ht, ht + 0.4, M['lead'])
    for k in range(3):
        x = AX0 + 3 + k * 7
        K.R.gable(x, x + 4.5, AY0 + 3, AY1 - 3, ht + 0.4, 2.2, M['glass_roof'], along='y')
    # 前庭：回车圆 + 圆喷泉；宫殿楼两侧意式台地花园（黄杨方格 + 柏树列）
    K.lawn(K.ellipse(0, -26, 14, 9), M['gravel']); K.lawn(K.ellipse(0, -26, 8, 4.5), M['lawn'], z=0.06); K.fountain(0, -26, 2.8)
    K.path([(0, -17), (0, Y0 - 3.5)], 8, M['gravel'])
    for sx in (-1,):
        x0 = -48
        K.rect(x0, x0 + 24, -10, 20, M['gravel'])
        for i in range(2):
            for j in range(3): K.parterre(x0 + 1 + i * 11.5, x0 + 11 + i * 11.5, -9 + j * 10, -0.5 + j * 10, M['lawn2'])
        for j in range(7): C.tree(K.T, x0 + 23.5, -9 + j * 4.8, 7.5, 0.9, 'yew_col', seed=550 + j)
    avoid = [(-52, 48, -38, 26)]
    K.trees_ring(P, .7, .93, 30, 9, avoid, kinds=('oak', 'cedar'))
    dk, br = K.dock(P, toward)
    K.path([br, (br[0] * .6, br[1] * .6), (14, -26)], 6, M['gravel'])
    tx, ty = toward                                      # c3：从岛心一侧看停靠平台（环形大平台 + 悬浮车）
    c3 = ((dk[0] - tx * 62 - ty * 26, dk[1] - ty * 62 + tx * 26, 30), (dk[0], dk[1], 0), 34)
    return {'c1': ((150, -150, 105), (0, 10, 0), 40), 'c2': ((42, -58, 20), (0, 6, 9), 30), 'c3': c3}


# ====================================================================== 精英学院
def academy(K, P, toward):
    """isle25 是南北向长岛（约 117 × 190 m）：先按东西向摆，再整体转 90°（院门朝东）、南移 4 m。"""
    M = K.M
    mark = {n: len(b.bm.verts) for n, b in C.Batch.ALL.items()}
    # 学院四合院（60 × 50 m）：灰石三层，南面正中门楼塔；四角楼梯塔
    X0, X1, Y0, Y1, T = -30.0, 30.0, -20.0, 30.0, 11.0
    for (a, b, c, d, sk) in ((X0, X1, Y0, Y0 + T, ''), (X0, X1, Y1 - T, Y1, ''), (X0, X0 + T, Y0 + T, Y1 - T, ''), (X1 - T, X1, Y0 + T, Y1 - T, '')):
        tp = K.block(a, b, c, d, 3, 4.2, M['stone_grey'], bay=3.2, win=(1.2, 2.2), skip=sk)
        K.hip(a, b, c, d, tp, 4.2)
    for x in range(-24, 25, 12):
        K.chimney(x, Y0 + T / 2, tp + 3.0, 2.6, 1.2, 0.8); K.chimney(x, Y1 - T / 2, tp + 3.0, 2.6, 1.2, 0.8)
    gt = K.block(-5.0, 5.0, Y0 - 2.0, Y0 + T + 1.0, 5, 4.2, M['stone_grey'], bay=3.0)   # 门楼塔
    K.W.box(-5.4, 5.4, Y0 - 2.4, Y0 + T + 1.4, gt, gt + 1.6, M['stone_grey'])
    for (x, y) in ((-5, Y0 - 2), (5, Y0 - 2), (-5, Y0 + T + 1), (5, Y0 + T + 1)): K.W.cyl(x, y, 0, 1.0, gt + 3.2, M['stone_grey'], 12)
    K.R.box(-4.6, 4.6, Y0 - 1.6, Y0 + T + 0.6, gt + 1.4, gt + 1.7, M['lead'])
    for (x, y) in ((X0, Y0), (X1, Y0), (X0, Y1), (X1, Y1)): K.tower(x, y, 3.0, 16.0, 5.0, M['stone_grey'])
    # 院心：草坪四块 + 十字石径（牛津式方院）
    for sx in (-1, 1):
        for sy in (-1, 1): K.rect(sx * 1.8, sx * (X1 - T - 1.0), 5 + sy * 1.8, 5 + sy * (Y1 - T - 5 - 1.0), M['lawn2'], z=0.05)
    K.path([(X0 + T, 5), (X1 - T, 5)], 3.0, M['pave']); K.path([(0, Y0 + T), (0, Y1 - T)], 3.0, M['pave'])
    # 礼仪大厅（礼仪与社交课）：东侧，高窗 + 铅皮顶 + 屋脊小灯亭
    HX0, HX1, HY0, HY1 = X1 + 4, X1 + 20, -6.0, 26.0
    ht = K.block(HX0, HX1, HY0, HY1, 2, 6.5, M['stone_pale'], bay=4.0, win=(1.8, 4.2))
    K.hip(HX0, HX1, HY0, HY1, ht, 6.0, M['lead'])
    K.W.cyl((HX0 + HX1) / 2, 10, ht + 5.0, 1.6, 3.0, M['trim'], 8); K.R.cyl((HX0 + HX1) / 2, 10, ht + 8.0, 2.0, 2.5, M['lead'], 8, r2=0.1)
    K.glass_gallery([(X1, 10.0), (HX0, 10.0)], w=4.0)
    # 图书馆：西侧，圆顶阅览室（拉德克利夫式的小一号）
    K.W.cyl(X0 - 16, 6, 0, 9.5, 14.0, M['stone_pale'], 32)
    for k in range(16):
        a = k * math.tau / 16; K.WN.box(X0 - 16 + 9.46 * math.cos(a) - .5, X0 - 16 + 9.46 * math.cos(a) + .5, 6 + 9.46 * math.sin(a) - .5, 6 + 9.46 * math.sin(a) + .5, 4, 11, M['glass'])
    K.W.cyl(X0 - 16, 6, 14.0, 10.2, 0.8, M['trim'], 32)
    K.R.lathe(X0 - 16, 6, 14.8, [(9.2, 0), (8.6, 2.5), (7.0, 5.0), (4.2, 7.0), (1.4, 8.0), (0.01, 8.2)], M['lead'], n=40)
    K.R.cyl(X0 - 16, 6, 23.0, 1.0, 2.2, M['trim'], 12); K.R.cyl(X0 - 16, 6, 25.2, 1.2, 1.2, M['lead'], 12, r2=0.1)
    K.path([(X0 - 6.5, 6), (X0, 6)], 4.0, M['pave'])
    # 以太修习圆庭（以太魔法修习课）：北侧，同心铺地环 + 四根低矮灯柱（中性，无符号）
    ex, ey = 0.0, Y1 + 16
    K.lawn(K.ellipse(ex, ey, 11, 11, 48), M['pave'], z=0.04); K.lawn(K.ellipse(ex, ey, 8.5, 8.5, 48), M['stone_grey'], z=0.06)
    K.lawn(K.ellipse(ex, ey, 5.5, 5.5, 48), M['pave'], z=0.08)
    for k in range(4):
        a = k * math.tau / 4 + math.pi / 4; K.GD.cyl(ex + 9.8 * math.cos(a), ey + 9.8 * math.sin(a), 0, 0.35, 2.6, M['stone_pale'], 10)
        K.GD.cyl(ex + 9.8 * math.cos(a), ey + 9.8 * math.sin(a), 2.6, 0.45, 0.6, M['aether'], 10)
    K.path([(0, Y1), (0, ey - 11)], 4.0, M['pave'])
    # 操练场 + 运动场（军事基础课）：南侧砾石操练场 + 400 m 跑道式草场（按岛缩成 1/2）
    K.rect(-26, 26, -46, -28, M['gravel'])
    K.rect(34, 54, -42, -26, M['track'], z=0.04); K.rect(35.5, 52.5, -40.5, -27.5, M['lawn2'], z=0.06)
    for x in (35.5, 44.0, 52.5): K.GD.box(x - .1, x + .1, -40.5, -27.5, 0.06, 0.08, M['mark'])
    K.path([(0, -28), (0, Y0 - 2)], 6.0, M['gravel'])
    T_ = lambda x, y: (-(y - 4.0), x)                    # 本地 → 岛面：南移 4 m 后逆时针转 90°
    for n, b in C.Batch.ALL.items():
        b.bm.verts.ensure_lookup_table()
        for v in b.bm.verts[mark.get(n, 0):]:
            v.co.x, v.co.y = T_(v.co.x, v.co.y)
    avoid = [(-(Y1 + 32) + 4, 54, X0 - 30, HX1 + 6), (22 + 4, 46 + 4, 30, 58)]
    K.trees_ring(P, .72, .93, 34, 25, avoid, kinds=('oak', 'oak', 'cedar'))
    dk, br = K.dock(P, toward)
    K.path([br, (br[0] * .6, br[1] * .6), T_(-26, -38)], 6, M['gravel'])
    return {'c1': ((170, -120, 105), (0, 0, 0), 40), 'c2': ((80, -30, 24), (5, 0, 10), 30)}


SITES = dict(rothschild_estate=rothschild, league_club=league, elite_academy=academy)


def run(site):
    import traceback
    try:
        from mathutils import Matrix
        C.Matrix = Matrix
        sc = C.setup(A['samples'])
        P, toward = island(site)
        xs, ys = [p[0] for p in P], [p[1] for p in P]; print('ISLAND BBOX', site, round(min(xs)), round(max(xs)), round(min(ys)), round(max(ys)))
        K = Kit(sc); K.ground(P)
        cams = SITES[site](K, P, toward)
        if os.environ.get('UE_MAGITECH', '1') == '1': K.magitech(P, seed=len(site), avoid=[(-70, 70, -50, 50)])
        import bpy as _b
        K.finish(cams, P)
    except Exception:
        msg = traceback.format_exc()
        if A['log']: open(A['log'], 'w').write(msg)
        print(msg); raise
