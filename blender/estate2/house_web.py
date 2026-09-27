"""伊甸主楼室内体量 → glb（网页三维 map/estate/ 的「内透 / 剖切」用）。纯 Python + numpy，不开 Blender。

python3 blender/estate2/house_web.py --out /tmp/house_raw.glb [--doors /tmp/doors.json]
然后压缩（meshopt，页面用 GLTFLoader + MeshoptDecoder）：
  npx -y @gltf-transform/cli meshopt /tmp/house_raw.glb map/estate/model/house.glb --level medium

数据只来自 floorplans.py（round-3 平面，房间多边形 = map/data/eden_estate_rooms.json）：
  楼板（按房间 kind 着中性色）、墙（相邻房间共用墙只出一次；外墙 0.45 m、内墙 0.2 m）、门洞（按走廊可达规则推断）、外墙窗洞（地上层）、
  竖向交通（塔楼双跑梯、仆役梯 + 服务电梯、主人螺旋梯 + 单人电梯、疏散梯）、穹顶四墩（B2–F3）、F3 顶上的鼓座转换梁框、门廊柱、大厅下沉圆区、
  中性家具块（floorplans 里的 furn 矩形；只按尺寸给高度，没有任何具体道具）。
按原卡的房间（kind = restricted，名字是占位「（按原卡）」）：只有空白楼板 + 墙 + 一个通走廊的门洞，没有家具和细节。
坐标：floorplans / layout 是 x 东、y 北、z 上（F1 地坪 = 0）；glTF 是 Y 上：(x, z, −y)。
网格：每层两块 f_<层>_struct / f_<层>_furn（每块一次 draw call），颜色在顶点色里（含一层便宜的墙脚 AO 渐变）。
"""
import argparse, json, math, os, struct, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import floorplans as FP   # noqa: E402

FH = 4.5          # 层高
SLAB = 0.3        # 楼板厚
WALL_H = FH - SLAB
T_EXT, T_INT = 0.45, 0.2
DOOR_W, DOOR_H = 1.1, 2.4
WIN_W, WIN_SILL, WIN_HEAD, WIN_STEP = 1.6, 0.9, 3.3, 4.0

KIND_COL = {   # 楼面中性色（线性 0–1）
    'card': (0.60, 0.47, 0.35), 'circ': (0.80, 0.78, 0.73), 'support': (0.66, 0.68, 0.70), 'owner': (0.58, 0.55, 0.62),
    'restricted': (0.60, 0.60, 0.60), 'user': (0.62, 0.70, 0.72), 'inferred': (0.74, 0.74, 0.70), 'open': (0.74, 0.74, 0.70)}
WALL_INT, WALL_EXT = (0.90, 0.88, 0.84), (0.94, 0.92, 0.87)
FURN = (0.76, 0.70, 0.60)
STAIR = (0.84, 0.82, 0.78)
PIER = (0.86, 0.84, 0.80)
LIFT = (0.36, 0.40, 0.44)
ZF = {f[0]: f[2] for f in FP.FLOORS}


class Mesh:
    def __init__(self):
        self.p, self.n, self.c, self.i = [], [], [], []

    def quad(self, a, b, c, d, col, z0=None):
        """a b c d 逆时针（从外看）。"""
        a, b, c, d = map(np.asarray, (a, b, c, d))
        nrm = np.cross(b - a, d - a); ln = np.linalg.norm(nrm)
        if ln < 1e-9:
            return
        nrm = nrm / ln
        k = len(self.p)
        for v in (a, b, c, d):
            self.p.append(v); self.n.append(nrm)
            f = 1.0
            if z0 is not None:   # 墙脚 AO：离楼面 1.2 m 内从 0.72 渐变到 1
                f = 0.72 + 0.28 * min(1.0, max(0.0, (v[2] - z0) / 1.2))
            self.c.append((col[0] * f, col[1] * f, col[2] * f))
        self.i += [k, k + 1, k + 2, k, k + 2, k + 3]

    def box(self, x0, y0, z0, x1, y1, z1, col, ao=None):
        P = lambda x, y, z: (x, y, z)
        self.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), col)           # 顶
        self.quad(P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), P(x0, y0, z0), col)           # 底
        self.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), col, ao)       # -y
        self.quad(P(x1, y1, z0), P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), col, ao)       # +y
        self.quad(P(x0, y1, z0), P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), col, ao)       # -x
        self.quad(P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), col, ao)       # +x

    def obox(self, p0, p1, t, z0, z1, col, ao=None):
        """沿 p0→p1 的墙段（厚 t，居中）。"""
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
        d = p1 - p0; L = np.linalg.norm(d)
        if L < 1e-4 or z1 - z0 < 1e-4:
            return
        u = d / L; n = np.array([-u[1], u[0]]) * t / 2
        A, B, C, D = p0 - n, p1 - n, p1 + n, p0 + n   # 底面四角（逆时针）
        V = lambda q, z: (q[0], q[1], z)
        self.quad(V(A, z1), V(B, z1), V(C, z1), V(D, z1), col)
        self.quad(V(D, z0), V(C, z0), V(B, z0), V(A, z0), col)
        self.quad(V(A, z0), V(B, z0), V(B, z1), V(A, z1), col, ao)
        self.quad(V(C, z0), V(D, z0), V(D, z1), V(C, z1), col, ao)
        self.quad(V(D, z0), V(A, z0), V(A, z1), V(D, z1), col, ao)
        self.quad(V(B, z0), V(C, z0), V(C, z1), V(B, z1), col, ao)

    def prism(self, poly, z0, z1, col):
        """多边形楼板（凸或 L 形都用耳切三角化）+ 侧面。"""
        pts = [tuple(map(float, p)) for p in poly]
        if _signed_area(pts) < 0:
            pts = pts[::-1]
        tri = _earclip(pts)
        k = len(self.p)
        for x, y in pts:
            self.p.append((x, y, z1)); self.n.append((0, 0, 1)); self.c.append(col)
        for a, b, c in tri:
            self.i += [k + a, k + b, k + c]
        k = len(self.p)
        dark = tuple(v * 0.8 for v in col)
        for x, y in pts:
            self.p.append((x, y, z0)); self.n.append((0, 0, -1)); self.c.append(dark)
        for a, b, c in tri:
            self.i += [k + a, k + c, k + b]
        for j in range(len(pts)):
            a, b = pts[j], pts[(j + 1) % len(pts)]
            self.quad((a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1), dark)

    def cyl(self, cx, cy, r, z0, z1, col, n=16):
        for j in range(n):
            a0, a1 = 2 * math.pi * j / n, 2 * math.pi * (j + 1) / n
            p0 = (cx + r * math.cos(a0), cy + r * math.sin(a0)); p1 = (cx + r * math.cos(a1), cy + r * math.sin(a1))
            self.quad((p0[0], p0[1], z0), (p1[0], p1[1], z0), (p1[0], p1[1], z1), (p0[0], p0[1], z1), col, z0)
            k = len(self.p)
            for v in ((cx, cy, z1), (p0[0], p0[1], z1), (p1[0], p1[1], z1)):
                self.p.append(v); self.n.append((0, 0, 1)); self.c.append(col)
            self.i += [k, k + 1, k + 2]

    def arrays(self):
        P = np.asarray(self.p, np.float32)
        P = np.stack([P[:, 0], P[:, 2], -P[:, 1]], 1)      # → glTF Y 上
        N = np.asarray(self.n, np.float32); N = np.stack([N[:, 0], N[:, 2], -N[:, 1]], 1)
        C = np.clip(np.asarray(self.c, np.float32), 0, 1)
        return P, N, C, np.asarray(self.i, np.uint32)


def _signed_area(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2


def _earclip(pts):
    idx = list(range(len(pts))); out = []
    def inside(p, a, b, c):
        d = lambda p1, p2, p3: (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
        d1, d2, d3 = d(p, a, b), d(p, b, c), d(p, c, a)
        return not ((d1 < -1e-9 or d2 < -1e-9 or d3 < -1e-9) and (d1 > 1e-9 or d2 > 1e-9 or d3 > 1e-9))
    guard = 0
    while len(idx) > 3 and guard < 1000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = pts[i0], pts[i1], pts[i2]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-9:
                continue
            if any(inside(pts[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            out.append((i0, i1, i2)); idx.pop(k); break
    if len(idx) == 3:
        out.append(tuple(idx))
    return out


# ---------------------------------------------------------------- 墙段：共线重叠求交
def edges_of(poly):
    return [(tuple(poly[j]), tuple(poly[(j + 1) % len(poly)])) for j in range(len(poly))]


def overlap(e, f, tol=0.06):
    """f 与 e 共线时，返回 f 在 e 参数上覆盖的区间 (t0, t1)，否则 None。"""
    a, b = np.asarray(e[0], float), np.asarray(e[1], float)
    d = b - a; L = np.linalg.norm(d)
    if L < 1e-6:
        return None
    u = d / L; n = np.array([-u[1], u[0]])
    c, e2 = np.asarray(f[0], float), np.asarray(f[1], float)
    if abs(np.dot(c - a, n)) > tol or abs(np.dot(e2 - a, n)) > tol:
        return None
    t0, t1 = sorted((np.dot(c - a, u) / L, np.dot(e2 - a, u) / L))
    t0, t1 = max(0.0, t0), min(1.0, t1)
    return (t0, t1) if (t1 - t0) * L > 0.05 else None


def walls_for(rooms):
    """→ [dict(a, b, rooms={i, j…}, ext)]，每段只出一次。"""
    E = [(i, e) for i, r in enumerate(rooms) for e in edges_of(r['poly'])]
    segs = []
    for i, e in E:
        cov = [(j, ov) for j, f in E if j != i for ov in [overlap(e, f)] if ov]
        cuts = sorted({0.0, 1.0, *[t for _, ov in cov for t in ov]})
        a, b = np.asarray(e[0], float), np.asarray(e[1], float)
        for t0, t1 in zip(cuts, cuts[1:]):
            if t1 - t0 < 1e-4:
                continue
            tm = (t0 + t1) / 2
            nb = {j for j, ov in cov if ov[0] - 1e-6 <= tm <= ov[1] + 1e-6}
            if nb and min(nb) < i:
                continue   # 由编号小的房间出
            segs.append(dict(a=a + (b - a) * t0, b=a + (b - a) * t1, rooms={i} | nb, ext=not nb))
    # 合并同一对房间的相邻共线段
    out = []
    for s in segs:
        m = next((o for o in out if o['rooms'] == s['rooms'] and np.allclose(o['b'], s['a'], atol=1e-3)
                  and abs(float((o['b'] - o['a'])[0] * (s['b'] - s['a'])[1] - (o['b'] - o['a'])[1] * (s['b'] - s['a'])[0])) < 1e-6), None)
        if m:
            m['b'] = s['b']
        else:
            out.append(dict(s))
    return out


NO_DOOR = {('服务连廊', '主廊')}   # floorplans：服务连廊只开进仆役核，不开向主廊
WIDE = ('circ',)


def doors_for(rooms, segs):
    """→ {seg_index: [(t_center, width, height)]}。规则：
    1 与走廊（circ）相邻的房间开一扇门（走廊之间开宽洞）；
    2 还没门的非 restricted房间，向共用墙最长的非 restricted邻居开一扇；
    3 restricted 房间只走规则 1；门廊（support, block=porch）不算墙。"""
    D = {}; has = set()
    L = lambda s: float(np.linalg.norm(s['b'] - s['a']))
    pairs = {}
    for k, s in enumerate(segs):
        if len(s['rooms']) != 2:
            continue
        i, j = sorted(s['rooms'])
        if (i, j) not in pairs or L(segs[pairs[(i, j)]]) < L(s):
            pairs[(i, j)] = k
    def add(k, wide=False):
        s = segs[k]; l = L(s)
        w = min(l - 0.5, 3.2) if wide else DOOR_W
        if l < w + 0.4 or w < 0.8:
            return False
        D.setdefault(k, []).append((0.5, w, DOOR_H if not wide else 3.0))
        has.update(s['rooms']); return True
    for (i, j), k in pairs.items():
        ri, rj = rooms[i], rooms[j]
        names = {(ri['name'], rj['name']), (rj['name'], ri['name'])}
        if names & NO_DOOR:
            continue
        ci, cj = ri['kind'] == 'circ', rj['kind'] == 'circ'
        if ci or cj:
            add(k, wide=ci and cj)
        elif ri['block'] != rj['block'] and ri['kind'] == rj['kind'] == 'inferred':
            add(k, wide=True)   # 相邻体块的卡未写体量直接相通
    for i, r in enumerate(rooms):
        if i in has or r['kind'] == 'restricted':
            continue
        cand = [(L(segs[k]), k) for (a, b), k in pairs.items() if i in (a, b) and rooms[b if a == i else a]['kind'] != 'restricted']
        for _, k in sorted(cand, reverse=True):
            if add(k):
                break
    return D


def wall_pieces(M, s, t, z, openings, windows):
    """墙段挖门 / 窗洞：沿长度切成实墙 + 洞口（洞口下 / 上补窗台、过梁）。"""
    a, b = s['a'], s['b']; L = float(np.linalg.norm(b - a))
    holes = []   # (s0, s1, bottom, top)
    for tc, w, h in openings:
        holes.append((tc * L - w / 2, tc * L + w / 2, 0.0, h))
    if windows:
        n = int((L - 1.2) // WIN_STEP)
        if n >= 1:
            off = (L - (n - 1) * WIN_STEP) / 2
            for k in range(n):
                c = off + k * WIN_STEP
                if all(c + WIN_W / 2 + 0.3 < h0 or c - WIN_W / 2 - 0.3 > h1 for h0, h1, *_ in holes):
                    holes.append((c - WIN_W / 2, c + WIN_W / 2, WIN_SILL, WIN_HEAD))
    holes.sort()
    col = WALL_EXT if s['ext'] else WALL_INT
    P = lambda q: a + (b - a) * (q / L)
    x = 0.0
    for h0, h1, zb, zt in holes:
        h0, h1 = max(h0, x), min(h1, L)
        if h1 <= h0:
            continue
        M.obox(P(x), P(h0), t, z, z + WALL_H, col, z)
        if zb > 0:
            M.obox(P(h0), P(h1), t, z, z + zb, col, z)
        M.obox(P(h0), P(h1), t, z + zt, z + WALL_H, col, z)
        x = h1
    M.obox(P(x), P(L), t, z, z + WALL_H, col, z)


# ---------------------------------------------------------------- 竖向交通 / 结构
def flight(M, x0, x1, y0, y1, z0, rise, n, axis='y', up=True):
    """一跑楼梯：n 级，沿 axis 正向（up=False 反向）升 rise。实心台阶体块。"""
    for k in range(n):
        f0, f1 = k / n, (k + 1) / n
        if not up:
            f0, f1 = 1 - f1, 1 - f0
        zt = z0 + rise * (k + 1) / n
        if axis == 'y':
            M.box(x0, y0 + (y1 - y0) * f0, z0, x1, y0 + (y1 - y0) * f1, zt, STAIR)
        else:
            M.box(x0 + (x1 - x0) * f0, y0, z0, x0 + (x1 - x0) * f1, y1, zt, STAIR)


def cores(M, fl, z):
    top = fl == 'F3'
    if fl in ('F1', 'F2', 'F3'):   # 塔楼石材双跑梯（楼梯井 10 × 10 m）：西跑向北升一半，平台，东跑向南升另一半；F3 再上一跑到屋顶眺望亭
        half = FH / 2
        flight(M, -21.5, -18.0, -21.5, -14.5, z, half, 13, 'y', True)
        M.box(-21.5, -14.5, z, -12.5, -12.5, z + half, STAIR)                 # 北端平台
        flight(M, -16.0, -12.5, -21.5, -14.5, z + half, half, 13, 'y', False)
        M.box(-18.0, -21.5, z, -16.0, -14.5, z + (FH if not top else half), (0.78, 0.76, 0.72))   # 梯井中墙
    # 仆役核：仆役梯（两跑）+ 食梯 / 服务电梯
    if fl != 'F3':
        flight(M, -19.6, -18.1, -2.6, 2.6, z, FH / 2, 13, 'y', True)
        M.box(-19.6, 2.6, z, -16.6, 2.95, z + FH / 2, STAIR)
        flight(M, -18.1, -16.6, -2.6, 2.6, z + FH / 2, FH / 2, 13, 'y', False)
    else:
        flight(M, -19.6, -18.1, -2.6, 2.6, z, FH / 2, 13, 'y', True)
    lift(M, -15.9, -2.5, 1.6, 1.6, z)
    if fl in ('B2', 'B1', 'F1', 'F2'):   # 主人通道：螺旋梯 + 单人电梯
        spiral(M, 18.9, -8.9, 0.85, z, FH if fl != 'F2' else FH * 0.5)
        lift(M, 16.3, -9.7, 1.4, 1.4, z)
    if fl in ('B2', 'B1'):   # 疏散梯（东端，B2–B1 再上室外）
        flight(M, 16.3, 18.0, -13.7, -10.3, z, FH / 2, 13, 'y', True)
        M.box(16.3, -10.3, z, 19.7, -10.0, z + FH / 2, STAIR)
        flight(M, 18.0, 19.7, -13.7, -10.3, z + FH / 2, FH / 2, 13, 'y', False)


def lift(M, x0, y0, w, d, z):
    """电梯井：三面薄壁（开口朝 −y / 走廊）+ 深色轿厢。"""
    t = 0.12
    M.box(x0, y0 + d - t, z, x0 + w, y0 + d, z + WALL_H, (0.72, 0.72, 0.72), z)
    M.box(x0, y0, z, x0 + t, y0 + d, z + WALL_H, (0.72, 0.72, 0.72), z)
    M.box(x0 + w - t, y0, z, x0 + w, y0 + d, z + WALL_H, (0.72, 0.72, 0.72), z)
    M.box(x0 + 0.2, y0 + 0.2, z + 0.05, x0 + w - 0.2, y0 + d - 0.2, z + 2.3, LIFT)


def spiral(M, cx, cy, r, z, rise, n=16):
    M.cyl(cx, cy, 0.09, z, z + rise + 1.0, (0.5, 0.5, 0.5), 8)
    for k in range(n):
        a0, a1 = 2 * math.pi * k / n * 0.95, 2 * math.pi * (k + 1) / n * 0.95
        zt = z + rise * (k + 1) / n
        p = [(cx, cy)] + [(cx + r * math.cos(a), cy + r * math.sin(a)) for a in (a0, a1)]
        M.prism(p, zt - 0.06, zt, STAIR)


PIERS = ((-10, -9), (10, -9), (-10, 3), (10, 3))   # 穹顶四墩（B2–F3 贯通）


def structure(M, fl, z):
    for px, py in PIERS:
        M.box(px - 0.6, py - 0.6, z, px + 0.6, py + 0.6, z + WALL_H, PIER, z)
    if fl.startswith('B'):   # 地下柱网（与 F1 墙线对齐）
        for px in (-20, -10, 0, 10, 20):
            for py in (-14, -6, -3, 8):
                if (px, py) in PIERS:
                    continue
                M.box(px - 0.35, py - 0.35, z, px + 0.35, py + 0.35, z + WALL_H, PIER, z)
    if fl == 'F3':   # 鼓座转换梁框 20 × 12 m（F3 顶板下）
        zt = z + WALL_H
        for (x0, y0, x1, y1) in ((-10, -9.4, 10, -8.6), (-10, 2.6, 10, 3.4), (-10.4, -9, -9.6, 3), (9.6, -9, 10.4, 3)):
            M.box(x0, y0, zt - 0.9, x1, y1, zt, PIER)
    if fl == 'F1':
        for i in range(6):   # 门廊 6 柱
            M.cyl(-7.2 + i * 2.88, -24.0, 0.45, z, z + 2 * FH - SLAB, (0.93, 0.91, 0.86), 16)
        # 大厅中央圆形下沉区：外圈石沿 + 下沉圆面（颜色压暗，示意）
        ring, n = 4.0, 32
        for k in range(n):
            a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
            p = [(ring * math.cos(a0), -11 + ring * math.sin(a0)), (ring * math.cos(a1), -11 + ring * math.sin(a1)),
                 ((ring - 0.5) * math.cos(a1), -11 + (ring - 0.5) * math.sin(a1)), ((ring - 0.5) * math.cos(a0), -11 + (ring - 0.5) * math.sin(a0))]
            M.prism(p, z, z + 0.08, (0.78, 0.74, 0.66))
        M.prism([((ring - 0.5) * math.cos(2 * math.pi * k / n), -11 + (ring - 0.5) * math.sin(2 * math.pi * k / n)) for k in range(n)], z, z + 0.02, (0.46, 0.40, 0.34))


def furn_height(f):
    w, d = f[1] - f[0], f[3] - f[2]
    lo, hi = sorted((w, d))
    if lo <= 0.7 and hi >= 1.8:
        return 1.9   # 靠墙柜 / 架
    if 0.8 <= lo <= 2.3 and 1.8 <= hi <= 2.6:
        return 0.55  # 床
    if hi <= 0.6:
        return 0.45  # 坐具
    return 0.75      # 桌 / 台


def build_floor(fl):
    rooms = [r for r in FP.ROOMS if r['floor'] == fl]
    z = ZF[fl]
    S, F = Mesh(), Mesh()
    for r in rooms:   # 楼板
        S.prism(r['poly'], z - SLAB, z, KIND_COL.get(r['kind'], KIND_COL['inferred']))
    wall_rooms = [r for r in rooms if r['block'] != 'porch' and r['kind'] != 'user']   # 门廊是敞开柱廊，不出墙；医疗中心（kind=user）的墙 / 门 / 设备由 medical_b2.py 出（medical_web.py）
    segs = walls_for(wall_rooms)
    doors = doors_for(wall_rooms, segs)
    # 外墙开门：门廊 → 大厅（正门）、北廊楼 → 后庭
    for k, s in enumerate(segs):
        if not s['ext'] or fl != 'F1':
            continue
        r = wall_rooms[next(iter(s['rooms']))]
        mid = (s['a'] + s['b']) / 2
        if (r['name'] == '大厅' and abs(mid[1] + 16) < 0.1) or (r['name'].startswith('北廊楼') and abs(mid[1] - 17) < 0.1):
            doors.setdefault(k, []).append((0.5, 3.2, 3.4))
    for k, s in enumerate(segs):
        wall_pieces(S, s, T_EXT if s['ext'] else T_INT, z, doors.get(k, []), windows=s['ext'] and not fl.startswith('B'))
    cores(S, fl, z)
    structure(S, fl, z)
    for r in rooms:
        if r['kind'] in ('restricted', 'user'):
            continue   # restricted 房间：空白；医疗中心设备走 medical_web.py
        for f in r.get('furn', []):
            F.box(f[0], f[2], z, f[1], f[3], z + furn_height(f), FURN)
    info = dict(walls=len(segs), doors=sum(len(v) for v in doors.values()),
                door_list=[dict(rooms=sorted(wall_rooms[i]['name'] for i in segs[k]['rooms']), at=[round(float(v), 2) for v in (segs[k]['a'] + segs[k]['b']) / 2]) for k in doors])
    return S, F, info


# ---------------------------------------------------------------- glb 写出
def write_glb(path, meshes):
    """meshes: [(name, P, N, C, I)] → 一个场景、每块一个节点；顶点色 COLOR_0（float），无材质贴图。"""
    bins, views, accs, gm, nodes = [], [], [], [], []
    off = 0
    def add(arr, target, comp, typ, mm=False):
        nonlocal off
        b = arr.tobytes(); pad = (-len(b)) % 4
        views.append(dict(buffer=0, byteOffset=off, byteLength=len(b), target=target))
        bins.append(b + b'\0' * pad); off += len(b) + pad
        a = dict(bufferView=len(views) - 1, componentType=comp, count=int(arr.shape[0]), type=typ)
        if mm:
            a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a); return len(accs) - 1
    mats = [dict(name='house', pbrMetallicRoughness=dict(baseColorFactor=[1, 1, 1, 1], metallicFactor=0, roughnessFactor=0.9))]
    for name, P, N, C, I in meshes:
        if not len(I):
            continue
        ap = add(P, 34962, 5126, 'VEC3', True); an = add(N, 34962, 5126, 'VEC3'); ac = add(C, 34962, 5126, 'VEC3')
        ai = add(I, 34963, 5125, 'SCALAR')
        gm.append(dict(name=name, primitives=[dict(attributes=dict(POSITION=ap, NORMAL=an, COLOR_0=ac), indices=ai, material=0)]))
        nodes.append(dict(name=name, mesh=len(gm) - 1))
    js = dict(asset=dict(version='2.0', generator='estate2/house_web.py'), scene=0, scenes=[dict(nodes=list(range(len(nodes))))],
              nodes=nodes, meshes=gm, materials=mats, accessors=accs, bufferViews=views, buffers=[dict(byteLength=off)])
    jb = json.dumps(js, separators=(',', ':')).encode(); jb += b' ' * ((-len(jb)) % 4)
    bb = b''.join(bins)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(bb)))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(bb), 0x004E4942)); f.write(bb)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); ap.add_argument('--doors', default='')
    a = ap.parse_args()
    FP.check()   # 顺带算 area
    meshes, info = [], {}
    for fl, _, _ in FP.FLOORS:
        S, F, inf = build_floor(fl)
        meshes.append((f'f_{fl}_struct', *S.arrays())); meshes.append((f'f_{fl}_furn', *F.arrays()))
        info[fl] = inf
        print(fl, 'tris', len(S.i) // 3, '+', len(F.i) // 3, 'walls', inf['walls'], 'doors', inf['doors'])
    write_glb(a.out, meshes)
    if a.doors:
        with open(a.doors, 'w') as f:
            json.dump(info, f, ensure_ascii=False, indent=1)
    print('wrote', a.out, os.path.getsize(a.out))


if __name__ == '__main__':
    main()
