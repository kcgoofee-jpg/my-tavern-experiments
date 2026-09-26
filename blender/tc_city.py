# 天城城市骨架（OpenStreetMap 真实路网与建筑轮廓，见 tc_osm.py）——三层共用。
# 数据 © OpenStreetMap contributors（ODbL）。
# 各层只决定：楼的高度怎么映射（中层楼高 / 下层压低）、配色、灯光；轮廓、道路、公园、铁路完全一致，三层天然对位。
import bpy, json, math, os
import numpy as np
import tc_common as tc
from tc_common import W, H, tick

HERE = os.path.dirname(os.path.abspath(__file__))
CAR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'motorway_link', 'trunk_link',
       'primary_link', 'secondary_link', 'tertiary_link', 'living_street', 'service'}
MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'}

def poly_area(P): x, y = P[:, 0], P[:, 1]; return .5 * (np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))
def obb(P):
    """最小外接矩形（按边方向枚举）：返回 (cx, cy, w, d, rot)，w 为长边。"""
    best = None
    for i in range(len(P)):
        e = P[(i + 1) % len(P)] - P[i]; L = math.hypot(*e)
        if L < 1e-6: continue
        a = math.atan2(e[1], e[0]); c, s = math.cos(a), math.sin(a)
        u = P @ np.array([c, s]); v = P @ np.array([-s, c])
        ar = (u.max() - u.min()) * (v.max() - v.min())
        if best is None or ar < best[0]: best = (ar, a, u.min(), u.max(), v.min(), v.max())
    _, a, u0, u1, v0, v1 = best; c, s = math.cos(a), math.sin(a); uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    w, d = u1 - u0, v1 - v0
    if d > w: w, d, a = d, w, a + math.pi / 2
    return uc * c - vc * s, uc * s + vc * c, w, d, a
def point_in_poly(x, y, P):
    inside = False; n = len(P); j = n - 1
    for i in range(n):
        xi, yi = P[i]; xj, yj = P[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi: inside = not inside
        j = i
    return inside

# ---------------- 城区拼接：每层按城区取不同的参考城市 ----------------
# poly：天城平面上的城区多边形；region：data/osm/<region>.json；offset：区域原点放在天城平面的哪里；
# k：中层楼高倍数（真实楼高 × k / 100 = 平面单位）；kind：各层按它决定配色、霓虹、片区肌理。
F = 15.3; G = 9.55                                              # 片区外框（比 ±15 × ±9.375 略大，边上不留空）
def low_seam_x(y):
    """下层工业带 / 城中村的交界：不是 x = 1 的直线，而是随 y 起伏的一条线（确定性的三层正弦，不消耗随机）。
    平均仍在 x = 1，起伏约 ±70 m，交界大道沿它走。"""
    return 1 + .42 * math.sin(y * 1.3 + .7) + .22 * math.sin(y * 3.1 + 2.0) + .09 * math.sin(y * 7.3 + .4)
_SEAM = [(round(low_seam_x(y), 4), round(float(y), 4)) for y in np.linspace(-G, G, 64)]
def mid_seam_x(y):
    """中层核心区（曼哈顿）/ 外围（布鲁克林）的交界（A3）：不再是 x = -6 的竖线，而是一条斜着走的起伏林荫大道——
    北端偏东、南端偏西（斜度介于曼哈顿的竖向街网与布鲁克林约 60° 的街网之间），叠两层确定性正弦（不消耗随机），起伏约 ±45 m。
    平均仍在 x ≈ -6。"""
    return -6 + .1 * (y - 3) + .3 * math.sin(y * .9 + .4) + .12 * math.sin(y * 2.3 + 1.9) + .05 * math.sin(y * 5.9 + .8)
_MSEAM = [(round(mid_seam_x(y), 4), round(float(y), 4)) for y in np.linspace(-3.5, G, 40)]   # 南 → 北
DISTRICTS = {
    'mid': [
        dict(kind='core', region='manhattan', offset=(4.5, 3.05), k=1.25,         # 核心区与高区：曼哈顿中城
             poly=[(F, -3.5), (F, G)] + _MSEAM[::-1]),                               # 西边界是斜向起伏的交界大道（mid_seam_x）
        dict(kind='commercial', region='kowloon', offset=(0, -5.2), k=3.0,         # 商业区：九龙旺角最密的一段（C 区检查点在这里）
             poly=[(-9, -G), (F, -G), (F, -3.5), (-9, -3.5)]),
        dict(kind='outer', region='brooklyn', offset=(-10.5, 0), k=1.6,            # 外围居住区：布鲁克林联排住宅与旧仓库
             poly=[(-F, -G), (-9, -G), (-9, -3.5)] + _MSEAM + [(-F, G)]),
    ],
    'low': [
        dict(kind='industrial', region='ruhr', offset=(-7, 0), k=1.0,              # 工业带：鲁尔区钢厂、货运铁路、储罐
             poly=[(-F, -G)] + _SEAM + [(-F, G)]),                                  # 东边界是起伏的交界线（low_seam_x）
        dict(kind='village', region='shenzhen', offset=(8, 0), k=1.0, synth=True,  # 城中村：深圳的道路骨架 + 按握手楼尺度生成的楼（7 号井一带按九龙城寨的密度）
             poly=[(F, -G), (F, G)] + _SEAM[::-1]),
    ],
}
DISTRICTS['upper'] = DISTRICTS['mid']                           # 上层俯视的下方城市就是中层
BAND = .75                                                      # 城区交界的过渡带（75 m）：楼的密度从交界处往里渐变
BLVD_W = .16                                                    # 交界处的林荫大道宽度

def sdist(x, y, P):
    """到多边形边界的距离，在内为正、在外为负。"""
    d = min(seg_dist(x, y, P[i], P[(i + 1) % len(P)]) for i in range(len(P)))
    return d if point_in_poly(x, y, P) else -d
def seg_dist(x, y, a, b):
    ax, ay = a; bx, by = b; dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L2))
    return math.hypot(x - ax - t * dx, y - ay - t * dy)
def inner_edges(dists):
    """城区之间的交界线（去掉片区外框上的边），用来铺林荫大道。"""
    out = []
    for D in dists:
        P = D['poly']
        for a, b in zip(P, P[1:] + P[:1]):
            if (abs(a[0]) >= F and abs(b[0]) >= F and a[0] == b[0]) or (abs(a[1]) >= G and abs(b[1]) >= G and a[1] == b[1]): continue
            key = tuple(sorted((a, b)))
            if key not in [tuple(sorted(e)) for e in out]: out.append((a, b))
    return out

def drop_on_roads(B, roads):
    """去掉压在车行道中线上的「楼」：OSM 里偶尔有跨好几个街区的建筑关系（地下通道、高架之类），当楼画出来就是一条横穿街区的长带。"""
    from mathutils.kdtree import KDTree
    pts = []
    for r in roads:
        if r['c'] not in CAR or r['c'] == 'service': continue
        Q = r['p']
        for u, v in zip(Q[:-1], Q[1:]):
            n = max(1, int(float(np.hypot(*(v - u))) / .04))
            for t in range(n + 1): pts.append(u + (v - u) * t / n)
    if not pts: return B
    kd = KDTree(len(pts))
    for i, p in enumerate(pts): kd.insert((p[0], p[1], 0), i)
    kd.balance(); out = []
    for b in B:
        x, y, w, d, rot = b['obb']
        hits = sum(1 for co_, i, dd in kd.find_range((b['cx'], b['cy'], 0), max(w, d) / 2 + .01) if point_in_poly(co_[0], co_[1], b['p']))
        if hits < 3: out.append(b)
    return out

class City:
    def __init__(self, rng, layer='mid'):
        self.layer = layer; self.districts = DISTRICTS[layer]; self.credit = '© OpenStreetMap contributors (ODbL)'
        B, roads, parks, water, rail, tanks, ind = [], [], [], [], [], [], []
        cache = {}
        for di, D in enumerate(self.districts):
            P = [tuple(map(float, v)) for v in D['poly']]; D['P'] = P; ox, oy = D['offset']
            if D['region'] not in cache: cache[D['region']] = json.load(open(os.path.join(HERE, 'data', 'osm', D['region'] + '.json')))
            d = cache[D['region']]
            for b in d['buildings']:
                Q = np.array(b['p'], np.float32) + (ox, oy)
                if len(Q) < 3: continue
                if poly_area(Q) < 0: Q = Q[::-1]
                a = poly_area(Q)
                if a < .0004: continue                                # 小于 4 m² 的碎片
                cx, cy = Q.mean(0)
                if abs(cx) > W / 2 + .3 or abs(cy) > H / 2 + .3: continue
                dd = sdist(cx, cy, P)
                if dd < .12 or min(sdist(qx, qy, P) for qx, qy in Q[::max(1, len(Q) // 6)]) < .05: continue   # 让出交界大道
                if dd < BAND and rng.random() > .35 + .65 * (dd - .12) / (BAND - .12): continue          # 过渡带：密度渐变
                ob = obb(Q)
                if a > .3 and ob[2] / max(ob[3], 1e-3) > 8: continue  # 细长的巨型多边形（地下通道、高架之类的关系），不当楼画
                h = b['h'] or (b['lv'] * 3.2 if b['lv'] else None)
                n = tc.district(cx, cy)
                if not h: h = float(rng.uniform(20, 70) * (.6 + .8 * n)) if D['kind'] in ('commercial', 'core') else float(rng.uniform(8, 20))
                B.append(dict(p=Q, cx=float(cx), cy=float(cy), a=float(a), h=float(h), n=n, obb=ob, k=D['k'], dk=D['kind'], di=di))
            for r in d['roads']:                                      # 道路：交界大道以内的段
                Q = np.array(r['p'], np.float32) + (ox, oy); seg = [Q[0]]
                for u, v in zip(Q[:-1], Q[1:]):
                    if sdist(*((u + v) / 2), P) > BLVD_W / 2 - .02: seg.append(v)
                    else:
                        if len(seg) > 1: roads.append(dict(c=r['c'], w=r['w'], p=np.array(seg), br=r.get('br', 0), dk=D['kind']))
                        seg = [v]
                if len(seg) > 1: roads.append(dict(c=r['c'], w=r['w'], p=np.array(seg), br=r.get('br', 0), dk=D['kind']))
            for key, lst in (('parks', parks), ('water', water), ('tanks', tanks), ('industrial', ind)):
                for q in d.get(key, []):
                    Q = np.array(q['p'], np.float32) + (ox, oy)
                    if len(Q) > 2 and sdist(*Q.mean(0), P) > .12: lst.append(Q)
            for q in d.get('rail', []):
                Q = np.array(q['p'], np.float32) + (ox, oy); keep_ = [p for p in Q if sdist(*p, P) > .1]
                if len(keep_) > 1: rail.append(np.array(keep_))
        for a, b in inner_edges(self.districts):                      # 交界处的林荫大道：两侧城区的路都接到它上面
            roads.append(dict(c='secondary', w=BLVD_W, p=np.array([a, b], np.float32), br=0, dk='boulevard'))
        B = drop_on_roads(B, roads)
        self.b, self.roads, self.parks, self.water, self.rail, self.tanks, self.industrial = B, roads, parks, water, rail, tanks, ind
        for D in self.districts:
            if D.get('synth'): self.synth_village(D, rng)
        C = np.array([tc.ROOF[i] for i in rng.choice(len(tc.ROOF), size=len(self.b), p=tc.ROOF_W)], np.float32)
        self.roof = C * rng.uniform(.85, 1.15, (len(self.b), 1)).astype(np.float32)
        self.trees = []
        for P_ in self.parks:                                         # 公园里的树：按面积撒点
            x0, y0 = P_.min(0); x1, y1 = P_.max(0); a = abs(poly_area(P_))
            for _ in range(int(a * 160)):
                x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
                if point_in_poly(x, y, P_): self.trees.append((float(x), float(y), float(rng.uniform(.012, .03))))
        from collections import Counter
        tick(f'city ({layer}): {len(self.b)} buildings {dict(Counter(b["dk"] for b in self.b))}, {len(self.roads)} roads, '
             f'{len(self.parks)} parks, {len(self.rail)} rail, {len(self.tanks)} tanks, {len(self.trees)} trees')
    def district_at(self, x, y):
        for D in self.districts:
            if point_in_poly(x, y, D['P']): return D['kind']
        return self.districts[0]['kind']

    def synth_village(self, D, rng, dense_at=(4.6, -6.9), dense_r=1.8):
        """城中村：OSM 里城中村的楼几乎没画，按握手楼的真实尺度生成——楼宽 10–15 m、楼距 1–3 m，沿最近的道路方向排成一片片；
        dense_at 附近（7 号井）按九龙城寨的密度：楼距几乎为零、楼更高。"""
        from mathutils.kdtree import KDTree
        P = D['P']; pts, half = [], []
        for r in self.roads:
            Q = r['p']
            for u, v in zip(Q[:-1], Q[1:]):
                L = float(np.hypot(*(v - u))); n = max(1, int(L / .03))
                for t in range(n + 1): pts.append(u + (v - u) * t / n); half.append(r['w'] / 2)
        kd = KDTree(len(pts))
        for i, p in enumerate(pts): kd.insert((p[0], p[1], 0), i)
        kd.balance()
        kb = KDTree(max(1, len(self.b)))
        for i, b in enumerate(self.b): kb.insert((b['cx'], b['cy'], 0), i)
        kb.balance()
        occ = set(); n0 = len(self.b)
        areas = [(q, (*q.min(0), *q.max(0))) for q in self.parks + self.water]   # 公园、水面里不盖楼
        xs = [p[0] for p in P]; ys = [p[1] for p in P]
        for px in np.arange(min(xs), max(xs), 1.2):
            for py in np.arange(min(ys), max(ys), 1.2):
                co_, i, _ = kd.find((px, py, 0)); j = min(i + 1, len(pts) - 1)
                ang = math.atan2(pts[j][1] - pts[i][1], pts[j][0] - pts[i][0]) + rng.normal(0, .05)   # 片区朝向跟最近的路
                cs, sn = math.cos(ang), math.sin(ang)
                dense = math.hypot(px - dense_at[0], py - dense_at[1]) < dense_r
                bw, gap = rng.uniform(.1, .15), (rng.uniform(.004, .012) if dense else rng.uniform(.012, .03))
                for u in np.arange(-.65, .65, bw + gap):
                    for v in np.arange(-.65, .65, bw + gap):
                        x, y = px + u * cs - v * sn, py + u * sn + v * cs
                        g = (round(x / .09), round(y / .09))
                        if g in occ or sdist(x, y, P) < .14: continue
                        _, ri, rd = kd.find((x, y, 0))
                        if rd < half[ri] + bw * .5 + .01: continue           # 离路太近（城中村贴着路盖；synth 只有下层用）
                        if any(b0[0] - .05 < x < b0[2] + .05 and b0[1] - .05 < y < b0[3] + .05 and point_in_poly(x, y, q) for q, b0 in areas): continue
                        _, bi, bd = kb.find((x, y, 0))
                        if bi is not None and bi < n0 and bd < .12: continue   # OSM 已经画了的楼
                        occ.add(g)
                        ds = 1.12 if dense else 1.0                                       # 城寨一带楼挨楼（只放大轮廓，不多取随机）
                        w_, d_ = bw * rng.uniform(.85, 1.1) * ds, bw * rng.uniform(.8, 1.2) * ds
                        Q = np.array([(x + (-w_ / 2) * cs - (-d_ / 2) * sn, y + (-w_ / 2) * sn + (-d_ / 2) * cs), (x + (w_ / 2) * cs - (-d_ / 2) * sn, y + (w_ / 2) * sn + (-d_ / 2) * cs),
                                      (x + (w_ / 2) * cs - (d_ / 2) * sn, y + (w_ / 2) * sn + (d_ / 2) * cs), (x + (-w_ / 2) * cs - (d_ / 2) * sn, y + (-w_ / 2) * sn + (d_ / 2) * cs)], np.float32)
                        h = float(rng.uniform(36, 45) if dense else rng.uniform(18, 32))   # 握手楼 6–10 层；城寨一带 12–14 层
                        self.b.append(dict(p=Q, cx=float(x), cy=float(y), a=float(w_ * d_), h=h, n=tc.district(x, y), obb=(float(x), float(y), w_, d_, ang),
                                           k=D['k'], dk=D['kind'], di=self.districts.index(D), synth=True, dense=dense))
        tick(f'village: {len(self.b) - n0} handshake buildings generated')

    # ---------- 选择 ----------
    def keep(self, zones):
        """去掉落在地标区（椭圆 (x, y, rx, ry) 或 ('rect', x0, y0, x1, y1)）里的楼。返回布尔数组。"""
        k = np.ones(len(self.b), bool)
        for i, b in enumerate(self.b):
            for z in zones:
                if callable(z):
                    if z(b['cx'], b['cy']): k[i] = False
                elif z[0] == 'rect':
                    if z[1] < b['cx'] < z[3] and z[2] < b['cy'] < z[4]: k[i] = False
                elif ((b['cx'] - z[0]) / z[2]) ** 2 + ((b['cy'] - z[1]) / z[3]) ** 2 < 1: k[i] = False
        return k
    def clip_roads(self, zones, keep_major=True):
        """地标区里的小路去掉（大路保留，穿过去更真实）。"""
        def inz(x, y):
            for z in zones:
                if callable(z):
                    if z(x, y): return True
                elif z[0] == 'rect':
                    if z[1] < x < z[3] and z[2] < y < z[4]: return True
                elif ((x - z[0]) / z[2]) ** 2 + ((y - z[1]) / z[3]) ** 2 < 1: return True
            return False
        out = []
        for r in self.roads:
            if keep_major and r['c'] in MAJOR: out.append(r); continue
            P = r['p']; seg = [P[0]]
            for a, b in zip(P[:-1], P[1:]):
                if inz(*(a + b) / 2):
                    if len(seg) > 1: out.append(dict(r, p=np.array(seg)))
                    seg = [b]
                else: seg.append(b)
            if len(seg) > 1: out.append(dict(r, p=np.array(seg)))
        self.roads = out

    # ---------- 网格 ----------
    def buildings_mesh(self, name, idx, z0, z1, colors, m):
        """idx 中的楼按轮廓挤出：顶面 n 边形 + 侧面四边形。z0 / z1 为每栋楼的底 / 顶（数组或常数）。"""
        return poly_prisms(name, [self.b[i]['p'] for i in idx], np.broadcast_to(z0, len(idx)), np.broadcast_to(z1, len(idx)), colors, m)
    def roads_mesh(self, name, z, m, classes=None, widen=1.0, color=(.09, .09, .1)):
        """道路：每段一个四边形 + 每个节点一个八边形（补转角的缝）。"""
        quads, discs = [], []
        for r in self.roads:
            if classes and r['c'] not in classes: continue
            P, w = r['p'], r['w'] * widen
            for a, b in zip(P[:-1], P[1:]):
                d = b - a; L = float(np.hypot(*d))
                if L < 1e-5: continue
                quads.append(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L, w, math.atan2(d[1], d[0])))
            for p in P: discs.append((float(p[0]), float(p[1]), w / 2))
        Q = np.array(quads, np.float32)
        o1 = tc.box_mesh(name, np.c_[Q[:, :4], np.full(len(Q), z - .0005), np.full(len(Q), z)], np.tile(color, (len(Q), 1)), m, rot=Q[:, 4])
        D = np.array(discs, np.float32)
        o2 = tc.cyl_mesh(name + '_joints', np.c_[D[:, :2], np.full(len(D), z - .0005), D[:, 2], np.full(len(D), .0005)], m, 8)
        return o1, o2
    def flat_polys(self, name, polys, z, color, m):
        return poly_prisms(name, polys, np.full(len(polys), z - .001), np.full(len(polys), z), np.tile(color, (len(polys), 1)), m)

    # ---------- 沿路的东西 ----------
    def along(self, spacing, classes=None, side_offset=None, both=True, jitter=0.0, rng=None):
        """沿道路等距取点：[(x, y, 方向角, 道路等级, 宽度)]；side_offset=None 时取路中线，否则取两侧（偏移 = 半宽 + side_offset）。"""
        out = []
        for r in self.roads:
            if classes and r['c'] not in classes: continue
            P = r['p']; carry = 0.0
            for a, b in zip(P[:-1], P[1:]):
                d = b - a; L = float(np.hypot(*d))
                if L < 1e-5: continue
                u = d / L; nrm = np.array([-u[1], u[0]]); ang = math.atan2(u[1], u[0])
                t = carry
                while t < L:
                    p = a + u * t
                    if side_offset is None: out.append((float(p[0]), float(p[1]), ang, r['c'], r['w']))
                    else:
                        for s in ((-1, 1) if both else (1,)):
                            q = p + nrm * s * (r['w'] / 2 + side_offset)
                            out.append((float(q[0]), float(q[1]), ang, r['c'], r['w']))
                    t += spacing * (1 + (rng.uniform(-jitter, jitter) if rng is not None and jitter else 0))
                carry = t - L
        return out
    def road_marks(self, z, color=(.7, .7, .66), dash=.03, gap=.035):
        """车道虚线（宽路）与中央双黄线（主干道）。返回 (boxes, rot, cols)。"""
        boxes, rot, cols = [], [], []; yellow = (.62, .5, .16)
        for r in self.roads:
            if r['c'] not in CAR or r['w'] < .12: continue
            P, w = r['p'], r['w']
            for a, b in zip(P[:-1], P[1:]):
                d = b - a; L = float(np.hypot(*d))
                if L < .05: continue
                u = d / L; nrm = np.array([-u[1], u[0]]); ang = math.atan2(u[1], u[0])
                for t in np.arange(.06, L - .06, dash + gap):              # 车道虚线（离路口留一段）
                    for off in (-w / 4, w / 4):
                        p = a + u * (t + dash / 2) + nrm * off; boxes.append((p[0], p[1], dash, .0015, z, z + .0006)); rot.append(ang); cols.append(color)
                if r['c'] in ('primary', 'trunk', 'secondary') and L > .14:  # 中央双黄线
                    for off in (-.003, .003):
                        p = (a + b) / 2 + nrm * off; boxes.append((p[0], p[1], L - .12, .0015, z, z + .0006)); rot.append(ang); cols.append(yellow)
        return np.array(boxes, np.float32).reshape(-1, 6), np.array(rot, np.float32), np.array(cols, np.float32).reshape(-1, 3)
    def traffic(self, rng, z, density=2.5, weight=None, platoon=False):
        """车流：每条能走车的路两个方向各一条车道。返回 cars (n, 6)、rot、方向 (n, 2)、颜色。density = 每条车道每 100 m 车数。
        platoon=True（中层）：车 2–5 辆一队（红绿灯放出来的一串），队内间距 5–7 m，队与队之间按指数分布拉开，车在车道里左右略有偏；
        默认关，保持上层的随机序列不变。"""
        cars, rots, dirs, cols = [], [], [], []
        for r in self.roads:
            if r['c'] not in CAR or r['c'] == 'service': continue
            P, w = r['p'], r['w']
            for a, b in zip(P[:-1], P[1:]):
                d = b - a; L = float(np.hypot(*d))
                if L < .06: continue
                u = d / L; nrm = np.array([-u[1], u[0]]); ang = math.atan2(u[1], u[0])
                for s in (1, -1):                                          # 靠左 / 右两个方向
                    k = weight((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) if weight else .5
                    t = rng.uniform(0, .1)
                    if platoon:
                        while t < L - .03:
                            for _ in range(int(rng.integers(2, 6))):
                                if t >= L - .03: break
                                p = a + u * t + nrm * s * (w / 4 + rng.uniform(-w / 10, w / 10))
                                cars.append((p[0], p[1], .046, .02, z, z + .015)); rots.append(ang); dirs.append(u * s); cols.append(td_car_color(rng))
                                t += rng.uniform(.05, .07)
                            t += max(.055, rng.exponential(3 / (density * (.3 + 1.4 * k))))
                        continue
                    while t < L - .03:
                        p = a + u * t + nrm * s * w / 4
                        cars.append((p[0], p[1], .046, .02, z, z + .015)); rots.append(ang); dirs.append(u * s)
                        cols.append(td_car_color(rng))
                        t += max(.055, rng.exponential(1 / (density * (.3 + 1.4 * k))))
        return (np.array(cars, np.float32).reshape(-1, 6), np.array(rots, np.float32), np.array(dirs, np.float32).reshape(-1, 2),
                np.array(cols, np.float32).reshape(-1, 3))
    def road_kd(self, classes):
        """道路采样点的 KD 树：用来算「离某类道路多远」（商业街权重、地标避让）。"""
        from mathutils.kdtree import KDTree
        pts = [(x, y) for x, y, *_ in self.along(.04, classes)]
        kd = KDTree(max(1, len(pts)))
        for i, (x, y) in enumerate(pts): kd.insert((x, y, 0), i)
        kd.balance(); return kd

CAR_COLORS = [(.6, .6, .62), (.08, .08, .09), (.75, .75, .74), (.35, .05, .04), (.1, .15, .3), (.45, .45, .47), (.2, .22, .2)]
def td_car_color(rng): return CAR_COLORS[rng.integers(len(CAR_COLORS))]

def poly_prisms(name, polys, z0, z1, colors, m=None):
    """一批多边形挤出成一个网格（顶面 + 侧面，底面看不到）。colors: (n, 3) 写进颜色属性 col。"""
    co, loops, totals, fcol = [], [], [], []
    base = 0
    for P, a, b, c in zip(polys, z0, z1, colors):
        k = len(P); c4 = (float(c[0]), float(c[1]), float(c[2]), 1.0)
        for x, y in P: co.append((x, y, a))
        for x, y in P: co.append((x, y, b))
        loops.extend(range(base + k, base + 2 * k)); totals.append(k); fcol.append(c4)       # 顶面
        if b - a > 1e-4:
            for i in range(k):
                j = (i + 1) % k; loops.extend((base + i, base + j, base + k + j, base + k + i)); totals.append(4); fcol.append(c4)
        base += 2 * k
    if not totals: return None
    me = bpy.data.meshes.new(name); me.vertices.add(len(co)); me.vertices.foreach_set('co', np.array(co, np.float32).ravel())
    L = np.array(loops, np.int32); T = np.array(totals, np.int32); S = np.concatenate([[0], np.cumsum(T)[:-1]]).astype(np.int32)
    me.loops.add(len(L)); me.loops.foreach_set('vertex_index', L)
    me.polygons.add(len(T)); me.polygons.foreach_set('loop_start', S); me.polygons.foreach_set('loop_total', T)
    me.polygons.foreach_set('use_smooth', np.zeros(len(me.polygons), bool))   # Blender 4.1+ 新建网格默认平滑着色：楼顶四周发暗、侧面斜向渐变，改回平直
    me.update(calc_edges=True)
    ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set('color', np.repeat(np.array(fcol, np.float32), T, axis=0).ravel())
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if m: o.data.materials.append(m)
    return o

# ---------------- 楼顶部件（多边形版）----------------
STYLE = {
    'day':   dict(tower=.5, pitch=.0, solar=.12, green=.1, glass=.06, hvac=.75, parapet=1.2, lamps=.0),
    'night': dict(tower=.6, pitch=.0, solar=.04, green=.02, glass=.1, hvac=.8, parapet=1.3, lamps=.06),
    'low':   dict(tower=.0, pitch=.35, solar=0, green=0, glass=0, hvac=.4, parapet=1.15, lamps=0,
                  tiles=[(.3, .15, .09), (.2, .2, .2), (.26, .22, .17)]),
}
def roof_kit(city, idx, tops, cols, rng, style, cap=.3, tall=1.2, zbase=None):
    """idx 里每栋楼的女儿墙（沿轮廓的每条边）、退台塔楼（轮廓向中心收缩后再挤出）、设备、太阳能板、屋顶花园、天窗；
    下层的小楼改坡顶。返回 dict：box / brot / bcol、tower_polys / tz0 / tz1 / tcol、prisms / pcols、towers（塔顶 (x, y, z)）、lamps。"""
    S = STYLE[style]; o = dict(box=[], brot=[], bcol=[], tower_polys=[], tz0=[], tz1=[], tcol=[], prisms=[], pcols=[], towers=[], lamps=[])
    def box(x, y, w, d, z0, z1, rot, c): o['box'].append((x, y, w, d, z0, z1)); o['brot'].append(rot); o['bcol'].append(c)
    def parapet(P, z, c):
        k = tuple(min(1, v * S['parapet']) for v in c)
        for a, b in zip(P, np.roll(P, -1, 0)):
            d = b - a; L = float(np.hypot(*d))
            if L < .008: continue
            nrm = np.array([-d[1], d[0]]) / L; m_ = (a + b) / 2 + nrm * .0015      # 往里收半个墙厚（轮廓逆时针，左法线朝里）
            box(m_[0], m_[1], L, .003, z, z + .006, math.atan2(d[1], d[0]), k)
    for i, top, c in zip(idx, tops, cols):
        b = city.b[i]; P = b['p']; c = tuple(float(v) for v in c); x, y, w, d, rot = b['obb']
        h = top - (zbase if zbase is not None else tc.Z_GROUND)
        if b['a'] < .0015: continue
        cs, sn = math.cos(rot), math.sin(rot)
        at = lambda u, v: (x + u * cs - v * sn, y + u * sn + v * cs)
        if style == 'low' and b['a'] < .02 and rng.random() < S['pitch']:   # 坡顶（屋脊沿长边）
            t = S['tiles'][rng.integers(len(S['tiles']))]; t = tuple(v * rng.uniform(.8, 1.15) for v in t)
            o['prisms'].append((x, y, w, d, top, min(w, d) * rng.uniform(.25, .4), rot)); o['pcols'].append(t); continue
        parapet(P, top, c); zt = top
        if h > tall and b['a'] > .006 and rng.random() < S['tower']:         # 退台塔楼：1–2 级
            Q = P; cen = np.array([b['cx'], b['cy']], np.float32)
            for _ in range(int(rng.integers(1, 3))):
                s = rng.uniform(.55, .78); Q = cen + (Q - cen) * s
                zn = min(cap, zt + h * rng.uniform(.08, .22))
                if zn - zt < .02: break
                tcol = tuple(v * rng.uniform(.9, 1.15) for v in c)
                o['tower_polys'].append(Q); o['tz0'].append(zt); o['tz1'].append(zn); o['tcol'].append(tcol); parapet(Q, zn, c); zt = zn
            o['towers'].append((b['cx'], b['cy'], zt)); w, d = w * s, d * s
        r = rng.random(); iw, idp = w * .7, d * .7
        if r < S['solar'] and iw * idp > .003:
            for k in np.arange(-idp / 2 + .006, idp / 2 - .004, .013): box(*at(0, k), iw, .008, zt, zt + .003, rot, (.04, .06, .1))
        elif r < S['solar'] + S['green']: box(x, y, iw, idp, zt, zt + .002, rot, (.07, .13, .05))
        elif r < S['solar'] + S['green'] + S['glass'] and iw * idp > .002:
            box(x, y, iw * .5, idp * .5, zt, zt + .003, rot, (.28, .34, .38)); o['lamps'].append((x, y, zt + .003))
        if rng.random() < S['hvac'] and w * d > .002:                         # 屋顶设备：一小片冷却塔 / 水箱
            nx, ny = int(rng.integers(1, 4)), int(rng.integers(1, 3)); s_ = rng.uniform(.007, .012)
            ou, ov = rng.uniform(-.25, .25) * w, rng.uniform(-.25, .25) * d
            for ii in range(nx):
                for jj in range(ny):
                    box(*at(ou + (ii - (nx - 1) / 2) * s_ * 1.5, ov + (jj - (ny - 1) / 2) * s_ * 1.5), s_, s_, zt, zt + rng.uniform(.004, .009), rot,
                        tuple(min(1, v * rng.uniform(1.2, 1.6)) for v in c))
        if rng.random() < S['lamps']: o['lamps'].append((*at(rng.uniform(-.3, .3) * w, rng.uniform(-.3, .3) * d), zt + .002))
    return o
def build_roof_kit(prefix, kit, m_box, m_roof, prism_fn=None):
    if kit['box']: tc.box_mesh(prefix + '_parts', kit['box'], kit['bcol'], m_box, rot=np.array(kit['brot'], np.float32))
    if kit['tower_polys']: poly_prisms(prefix + '_towers', kit['tower_polys'], kit['tz0'], kit['tz1'], kit['tcol'], m_box)
    if kit['prisms'] and prism_fn: prism_fn(prefix + '_roofs', kit['prisms'], kit['pcols'], m_roof)
    tick(f'{prefix}: {len(kit["box"])} roof parts, {len(kit["tower_polys"])} tower tiers, {len(kit["prisms"])} pitched roofs')

def _ss(t): t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)
def core_w(city, x, y, band=1.0):
    """核心区 ↔ 外围居住区的风格权重（1 = 纯核心，0 = 纯外围）：按到外围多边形的有向距离，交界两侧各 band（默认 100 m）内平滑过渡。
    与商业区的交界不受影响（远离外围时恒为 1）。没有外围城区的层返回 1。"""
    s = _core_s(city, x, y)
    return 1.0 if s is None else _ss((s + band) / (2 * band))
def _core_s(city, x, y):
    """有向距离：在核心区里为「离外围多远」（正），在外围里为「离核心多远」的相反数（负）。只量两区之间，不量片区外框。"""
    Po = next((D['P'] for D in city.districts if D['kind'] == 'outer' and 'P' in D), None)
    Pc = next((D['P'] for D in city.districts if D['kind'] == 'core' and 'P' in D), None)
    if Po is None or Pc is None: return None
    return max(0.0, -sdist(x, y, Po)) - max(0.0, -sdist(x, y, Pc))
def tops_mid(city, cap=.1):
    """中层城市（上层远景与中层夜景共用）：楼顶高度 = 中层地面 + 真实楼高 × 城区倍数 k（旺角放大成垂直超大城市，曼哈顿本来就高），封顶在悬浮轨道以下。
    核心区与外围交界：天际线不是一级台阶——核心一侧 150 m 内的楼逐渐压低，外围一侧 80 m 内的楼略微加高（按距离，不取随机）。"""
    h = np.array([b['h'] * b.get('k', 3.0) for b in city.b], np.float32)
    for i, b in enumerate(city.b):
        if b['dk'] not in ('core', 'outer'): continue
        s = _core_s(city, b['cx'], b['cy'])
        if s is None: break
        if b['dk'] == 'core' and s < 1.5: h[i] *= .4 + .6 * _ss(s / 1.5)          # 核心一侧：离外围越近越矮
        elif b['dk'] == 'outer' and s > -.8: h[i] *= 1 + .6 * (1 - _ss(-s / .8))  # 外围一侧：贴着核心的略高
    return np.minimum(cap, tc.Z_GROUND + np.clip(h / 100, .12, 3.7))
