"""伊甸主楼室内体量 → glb（网页三维 map/estate/ 的「内透 / 剖切」用）。纯 Python + numpy，不开 Blender。

python3 blender/estate2/house_web.py --out /tmp/house_raw.glb [--doors /tmp/doors.json]
然后压缩（meshopt，页面用 GLTFLoader + MeshoptDecoder）：
  npx -y @gltf-transform/cli meshopt /tmp/house_raw.glb map/estate/model/house.glb --level medium

数据只来自 floorplans.py（round-3 平面，房间多边形 = map/data/eden_estate_rooms.json）：
  楼板（按房间 kind 着中性色）、墙（相邻房间共用墙只出一次；外墙 0.45 m、内墙 0.2 m）、门洞（按走廊可达规则推断）、外墙窗洞（地上层）、
  竖向交通（塔楼双跑梯、仆役梯 + 服务电梯、主人螺旋梯 + 单人电梯、疏散梯）、穹顶四墩（B2–F3）、F3 顶上的鼓座转换梁框、门廊柱、大厅下沉圆区、
  中性家具块（floorplans 里的 furn 矩形；只按尺寸给高度，没有任何具体道具）。
只写名字的卡房间（kind = restricted，名字照抄卡）：只有空白楼板 + 墙 + 一个通走廊的门洞，没有家具和细节。
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
    'restricted': (0.60, 0.60, 0.60), 'medical': (0.62, 0.70, 0.72), 'open': (0.74, 0.74, 0.70)}
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
        elif ri['block'] != rj['block'] and ri['kind'] == rj['kind'] == 'open':
            add(k, wide=True)   # 相邻体块的未定用途体量直接相通
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


# B1 / B2 室内专属材质色调
C_LEATHER_DK = (0.16, 0.15, 0.15)
C_LEATHER_RD = (0.42, 0.10, 0.12)
C_WOOD_WALNUT = (0.32, 0.20, 0.13)
C_WOOD_OAK = (0.50, 0.36, 0.22)
C_METAL_IRON = (0.22, 0.23, 0.24)
C_METAL_STEEL = (0.75, 0.77, 0.79)
C_METAL_GOLD = (0.76, 0.62, 0.28)
C_WHITE_CAB = (0.86, 0.87, 0.88)
C_GLASS_CYAN = (0.50, 0.72, 0.78)
C_ETHER_CYAN = (0.20, 0.82, 0.92)
C_RED_EMERG = (0.75, 0.08, 0.08)
C_SCREEN_GLOW = (0.08, 0.55, 0.65)
C_MAT_SPARRING = (0.24, 0.32, 0.42)
C_BOTTLE_GLASS = (0.18, 0.35, 0.22)


def build_b1_furn(F, z):
    # --- 主调教室 B1-C01 (-10..0, -14..-6)
    # 中央双人调教台 (金属基座 + 实木框架 + 红色皮革双软垫 + 头枕 + 吊装龙门架)
    F.box(-6.5, -11.5, z, -3.5, -8.5, z + 0.15, C_METAL_IRON)
    F.box(-6.3, -11.3, z + 0.15, -3.7, -8.7, z + 0.68, C_WOOD_WALNUT)
    F.box(-6.1, -11.1, z + 0.68, -5.1, -8.9, z + 0.82, C_LEATHER_RD)
    F.box(-4.9, -11.1, z + 0.68, -3.9, -8.9, z + 0.82, C_LEATHER_RD)
    F.box(-6.0, -11.0, z + 0.82, -5.2, -10.3, z + 0.92, C_LEATHER_DK)
    F.box(-4.8, -11.0, z + 0.82, -4.0, -10.3, z + 0.92, C_LEATHER_DK)
    for cx, cy in ((-6.2, -11.2), (-3.8, -11.2), (-6.2, -8.8), (-3.8, -8.8),
                   (-6.2, -10.0), (-3.8, -10.0), (-5.0, -11.2), (-5.0, -8.8)):
        F.box(cx - 0.06, cy - 0.06, z + 0.68, cx + 0.06, cy + 0.06, z + 0.78, C_METAL_GOLD)
    for px, py in ((-6.4, -11.4), (-3.6, -11.4), (-6.4, -8.6), (-3.6, -8.6)):
        F.cyl(px, py, 0.05, z, z + 3.2, C_METAL_STEEL, 12)
    F.box(-6.45, -11.45, z + 3.15, -3.55, -11.35, z + 3.25, C_METAL_STEEL)
    F.box(-6.45, -8.65, z + 3.15, -3.55, -8.55, z + 3.25, C_METAL_STEEL)
    F.box(-6.45, -11.45, z + 3.15, -6.35, -8.55, z + 3.25, C_METAL_STEEL)
    F.box(-3.65, -11.45, z + 3.15, -3.55, -8.55, z + 3.25, C_METAL_STEEL)
    F.box(-5.2, -10.2, z + 3.1, -4.8, -9.8, z + 3.2, C_METAL_GOLD)

    # 训诫木马与高背训诫椅
    F.box(-9.0, -13.0, z + 0.65, -8.2, -11.8, z + 0.95, C_WOOD_WALNUT)
    F.box(-8.8, -12.9, z + 0.95, -8.4, -11.9, z + 1.02, C_LEATHER_DK)
    for lx, ly in ((-8.9, -12.9), (-8.3, -12.9), (-8.9, -11.9), (-8.3, -11.9)):
        F.cyl(lx, ly, 0.04, z, z + 0.65, C_METAL_STEEL, 8)
    F.box(-9.0, -11.4, z, -8.2, -10.8, z + 0.52, C_WOOD_WALNUT)
    F.box(-8.9, -11.3, z + 0.52, -8.3, -10.9, z + 0.60, C_LEATHER_DK)
    F.box(-9.0, -11.4, z + 0.60, -8.2, -11.2, z + 1.65, C_WOOD_WALNUT)
    F.box(-9.05, -11.3, z + 0.75, -8.95, -10.8, z + 0.82, C_METAL_GOLD)
    F.box(-8.25, -11.3, z + 0.75, -8.15, -10.8, z + 0.82, C_METAL_GOLD)

    # 靠墙器具展柜
    F.box(-9.6, -7.8, z, -7.0, -6.5, z + 0.85, C_WOOD_WALNUT)
    F.box(-9.6, -7.7, z + 0.85, -7.0, -6.5, z + 2.4, C_WOOD_WALNUT)
    F.box(-9.5, -7.72, z + 0.9, -7.1, -7.68, z + 2.35, C_GLASS_CYAN)
    for ix in (-9.1, -8.6, -8.1, -7.6):
        F.box(ix - 0.03, -7.6, z + 1.1, ix + 0.03, -7.55, z + 2.1, C_LEATHER_DK)
        F.box(ix - 0.04, -7.62, z + 2.1, ix + 0.04, -7.53, z + 2.15, C_METAL_GOLD)

    # 等候席矮凳与镜面墙
    F.box(-2.5, -13.2, z, -0.8, -12.4, z + 0.45, C_WOOD_WALNUT)
    F.box(-2.4, -13.1, z + 0.45, -0.9, -12.5, z + 0.52, C_LEATHER_DK)
    F.box(-2.5, -6.52, z + 0.2, -1.0, -6.48, z + 2.6, C_GLASS_CYAN)
    F.box(-2.5, -6.68, z + 0.93, -1.0, -6.64, z + 0.97, C_METAL_STEEL)
    F.box(-0.9, -7.6, z + 0.1, -0.4, -7.0, z + 0.85, C_METAL_STEEL)
    F.box(-0.85, -7.55, z + 0.85, -0.45, -7.05, z + 0.98, C_WHITE_CAB)

    # --- 私人调教室 B1-C02 (0..3.75, -14..-6)
    # 圣安德鲁十字架
    F.box(0.6, -13.6, z, 1.6, -13.4, z + 0.12, C_METAL_IRON)
    F.box(0.7, -13.55, z + 0.1, 1.5, -13.45, z + 2.3, C_WOOD_WALNUT)
    F.box(0.5, -13.52, z + 1.1, 1.7, -13.48, z + 1.3, C_WOOD_WALNUT)
    for cx, cz in ((0.7, z + 2.1), (1.5, z + 2.1), (0.7, z + 0.4), (1.5, z + 0.4)):
        F.box(cx - 0.08, -13.58, cz - 0.08, cx + 0.08, -13.42, cz + 0.08, C_LEATHER_RD)
        F.box(cx - 0.05, -13.60, cz - 0.05, cx + 0.05, -13.40, cz + 0.05, C_METAL_GOLD)
    # 单人可调调教椅
    F.cyl(1.9, -10.5, 0.35, z, z + 0.25, C_METAL_STEEL, 16)
    F.box(1.5, -10.9, z + 0.25, 2.3, -10.1, z + 0.65, C_LEATHER_DK)
    F.box(1.5, -11.0, z + 0.65, 2.3, -10.8, z + 1.45, C_LEATHER_DK)
    F.box(1.4, -10.8, z + 0.65, 2.4, -10.2, z + 0.75, C_METAL_GOLD)
    # 器具壁柜与休息皮榻
    F.box(0.5, -6.9, z + 0.7, 3.3, -6.5, z + 2.1, C_WOOD_WALNUT)
    F.box(1.8, -6.95, z + 1.3, 2.0, -6.88, z + 1.5, C_METAL_GOLD)
    F.box(2.3, -13.5, z, 3.4, -11.7, z + 0.48, C_WOOD_WALNUT)
    F.box(2.35, -13.45, z + 0.48, 3.35, -11.75, z + 0.60, C_LEATHER_DK)
    F.box(2.4, -13.4, z + 0.60, 3.3, -13.0, z + 0.72, C_LEATHER_RD)

    # --- 性技巧训练室 B1-C04 (3.75..6.9, -14..-6)
    F.box(4.5, -12.1, z, 6.1, -9.9, z + 0.32, C_METAL_STEEL)
    F.box(4.55, -12.05, z + 0.32, 6.05, -9.95, z + 0.52, C_LEATHER_RD)
    F.box(4.6, -12.0, z + 0.52, 6.0, -11.0, z + 0.70, C_LEATHER_RD)
    F.box(4.7, -11.9, z + 0.70, 5.9, -11.5, z + 0.82, C_LEATHER_DK)
    F.box(4.0, -6.52, z + 0.3, 6.6, -6.48, z + 2.7, C_GLASS_CYAN)
    F.box(4.0, -6.68, z + 0.85, 6.6, -6.64, z + 0.90, C_WOOD_WALNUT)
    F.box(4.0, -6.68, z + 1.10, 6.6, -6.64, z + 1.15, C_WOOD_WALNUT)
    F.box(4.1, -13.5, z, 5.2, -12.9, z + 0.82, C_WHITE_CAB)
    F.box(4.15, -13.45, z + 0.82, 5.15, -12.95, z + 0.88, C_LEATHER_DK)
    F.box(5.5, -13.5, z + 0.82, 6.6, -13.0, z + 1.7, C_WHITE_CAB)
    F.box(5.9, -13.02, z + 1.4, 6.2, -12.98, z + 1.55, C_SCREEN_GLOW)

    # --- 体能训练室 B1-C03 (-8..-2, -3..7)
    F.box(-7.6, 2.6, z, -3.6, 6.6, z + 0.08, C_MAT_SPARRING)
    F.box(-7.7, 2.5, z, -3.5, 6.7, z + 0.04, C_METAL_IRON)
    F.cyl(-6.5, 4.0, 0.28, z + 1.1, z + 2.4, C_LEATHER_DK, 16)
    F.cyl(-6.5, 4.0, 0.02, z + 2.4, z + 3.5, C_METAL_STEEL, 8)
    F.cyl(-4.6, 5.5, 0.30, z, z + 0.2, C_METAL_IRON, 12)
    F.cyl(-4.6, 5.5, 0.22, z + 0.2, z + 1.4, C_LEATHER_DK, 12)
    F.cyl(-4.6, 5.5, 0.12, z + 1.4, z + 1.7, C_LEATHER_DK, 10)
    F.box(-7.6, -2.6, z, -6.8, 0.4, z + 1.8, C_WOOD_WALNUT)
    for wy in (-2.2, -1.6, -1.0, -0.4, 0.2):
        F.box(-7.4, wy - 0.02, z + 0.4, -7.0, wy + 0.02, z + 1.7, C_WOOD_OAK)
    for px, py in ((-4.4, -2.5), (-2.6, -2.5), (-4.4, -0.5), (-2.6, -0.5)):
        F.box(px - 0.04, py - 0.04, z, px + 0.04, py + 0.04, z + 2.3, C_METAL_IRON)
    F.box(-4.4, -2.5, z + 2.25, -2.6, -0.5, z + 2.33, C_METAL_IRON)
    F.box(-4.6, -1.55, z + 1.2, -2.4, -1.45, z + 1.28, C_METAL_STEEL)
    F.cyl(-4.3, -1.5, 0.22, z + 1.05, z + 1.45, C_METAL_IRON, 16)
    F.cyl(-2.7, -1.5, 0.22, z + 1.05, z + 1.45, C_METAL_IRON, 16)
    F.box(-3.8, -2.2, z, -3.2, -0.8, z + 0.48, C_LEATHER_DK)
    F.box(-3.0, 0.8, z, -2.4, 3.2, z + 0.85, C_METAL_STEEL)
    for dy in (1.1, 1.6, 2.1, 2.6, 3.0):
        F.box(-2.9, dy - 0.08, z + 0.45, -2.5, dy + 0.08, z + 0.58, C_METAL_IRON)
        F.box(-2.9, dy - 0.08, z + 0.85, -2.5, dy + 0.08, z + 0.98, C_METAL_IRON)
    F.box(-2.95, 3.8, z, -2.9, 6.4, z + 2.8, C_WOOD_OAK)
    for rz in np.linspace(z + 0.3, z + 2.7, 12):
        F.box(-2.98, 3.9, rz - 0.015, -2.87, 6.3, rz + 0.015, C_WOOD_OAK)

    # --- 恒温酒窖 B1-C05 (-14..-8, -3..2)
    for ry in (-2.4, -0.6, 1.2):
        F.box(-13.6, ry - 0.3, z, -8.4, ry + 0.3, z + 3.2, C_WOOD_OAK)
        for bz in np.linspace(z + 0.4, z + 2.9, 6):
            F.box(-13.4, ry - 0.28, bz - 0.04, -8.6, ry + 0.28, bz + 0.04, C_BOTTLE_GLASS)
    F.box(-13.2, -1.8, z, -8.8, -1.2, z + 0.95, C_WOOD_WALNUT)
    for sx in (-12.4, -11.2, -10.0, -8.8):
        F.cyl(sx, -1.5, 0.18, z, z + 0.72, C_LEATHER_DK, 12)
    F.box(-11.2, -1.6, z + 0.95, -10.8, -1.4, z + 1.25, C_GLASS_CYAN)
    F.box(-13.6, 1.6, z + 2.2, -12.4, 1.9, z + 3.0, C_WHITE_CAB)
    F.box(-13.2, 1.58, z + 2.4, -12.8, 1.62, z + 2.6, C_SCREEN_GLOW)

    # --- 更衣 / 淋浴间 (10..16, -14..-6)
    F.box(10.4, -13.6, z, 15.6, -12.8, z + 2.2, C_METAL_STEEL)
    F.box(10.6, -11.8, z, 15.4, -11.2, z + 0.45, C_WOOD_OAK)
    for sx in (10.6, 12.3, 14.0):
        F.box(sx, -7.5, z, sx + 1.5, -6.5, z + 2.2, C_GLASS_CYAN)
        F.cyl(sx + 0.75, -7.0, 0.1, z + 2.1, z + 2.2, C_METAL_STEEL, 12)
    F.box(10.4, -9.6, z, 13.0, -8.6, z + 0.9, C_WHITE_CAB)
    F.box(10.6, -8.62, z + 1.1, 12.8, -8.58, z + 2.0, C_GLASS_CYAN)

    # --- B1 机电与走廊设施
    F.box(-1.6, -2.6, z, 2.4, -0.6, z + 2.2, C_METAL_IRON)
    F.box(4.0, 4.0, z, 8.0, 7.6, z + 2.4, C_METAL_IRON)
    F.box(12.0, 4.0, z, 18.0, 7.6, z + 2.4, C_METAL_IRON)


def build_b2_furn(F, z):
    # --- 惩罚室 B2-C01 (-10..-5, -14..-6)
    # 中央重型约束立柱
    F.cyl(-7.5, -10.0, 0.22, z, z + 3.6, C_METAL_STEEL, 16)
    for rz in (z + 0.8, z + 1.4, z + 2.0, z + 2.6):
        F.cyl(-7.5, -10.0, 0.28, rz - 0.05, rz + 0.05, C_METAL_IRON, 16)
        F.box(-7.85, -10.03, rz - 0.15, -7.15, -9.97, rz, C_METAL_IRON)
    # 悬吊禁闭铁笼
    F.box(-9.4, -13.4, z + 0.4, -8.0, -12.0, z + 0.48, C_METAL_IRON)
    F.box(-9.4, -13.4, z + 2.3, -8.0, -12.0, z + 2.38, C_METAL_IRON)
    for cx in np.linspace(-9.35, -8.05, 6):
        F.cyl(cx, -13.35, 0.02, z + 0.48, z + 2.3, C_METAL_IRON, 6)
        F.cyl(cx, -12.05, 0.02, z + 0.48, z + 2.3, C_METAL_IRON, 6)
    for cy in np.linspace(-13.35, -12.05, 6):
        F.cyl(-9.35, cy, 0.02, z + 0.48, z + 2.3, C_METAL_IRON, 6)
        F.cyl(-8.05, cy, 0.02, z + 0.48, z + 2.3, C_METAL_IRON, 6)
    F.cyl(-8.7, -12.7, 0.04, z + 2.38, z + 3.6, C_METAL_STEEL, 8)
    # 束缚惩戒长凳
    F.box(-6.4, -13.3, z, -5.5, -11.1, z + 0.25, C_METAL_IRON)
    F.box(-6.3, -13.2, z + 0.25, -5.6, -11.2, z + 0.75, C_LEATHER_DK)
    for rz in (z + 0.35, z + 0.55, z + 0.7):
        F.box(-6.32, -12.8, rz - 0.03, -5.58, -12.7, rz + 0.03, C_METAL_GOLD)
    # 壁挂刑具展柜与冲洗地沟
    F.box(-9.6, -7.0, z + 1.0, -6.5, -6.5, z + 2.3, C_METAL_IRON)
    F.box(-9.8, -10.2, z - 0.02, -5.2, -9.8, z, C_METAL_STEEL)

    # --- 医疗与改造室 B2-C02 (-5..1.25, -14..-6)
    # 双联以太生化恢复舱
    for px in (-3.8, -2.4):
        F.cyl(px, -12.2, 0.55, z, z + 0.35, C_METAL_STEEL, 20)
        F.cyl(px, -12.2, 0.50, z + 0.35, z + 2.4, C_GLASS_CYAN, 20)
        F.cyl(px, -12.2, 0.42, z + 0.35, z + 2.2, C_ETHER_CYAN, 20)
        F.cyl(px, -12.2, 0.52, z + 2.4, z + 2.8, C_METAL_STEEL, 20)
        F.box(px - 0.2, -12.75, z + 2.45, px + 0.2, -12.68, z + 2.75, C_SCREEN_GLOW)
    # 改造手术台与辅助机械臂
    F.cyl(0.0, -11.8, 0.4, z, z + 0.25, C_METAL_STEEL, 16)
    F.box(-0.4, -12.8, z + 0.65, 0.4, -10.8, z + 0.78, C_LEATHER_DK)
    F.cyl(-0.5, -11.8, 0.05, z + 0.65, z + 1.6, C_METAL_STEEL, 8)
    F.cyl(0.5, -11.8, 0.05, z + 0.65, z + 1.6, C_METAL_STEEL, 8)
    F.box(-0.6, -11.9, z + 1.5, -0.2, -11.5, z + 1.65, C_SCREEN_GLOW)
    F.box(0.2, -11.9, z + 1.5, 0.6, -11.5, z + 1.65, C_SCREEN_GLOW)
    F.cyl(0.0, -11.8, 0.5, z + 2.6, z + 2.75, C_WHITE_CAB, 20)
    F.cyl(0.0, -11.8, 0.42, z + 2.58, z + 2.62, C_ETHER_CYAN, 20)
    # 全身扫描拱门
    F.box(-4.2, -8.0, z, -2.2, -7.6, z + 2.5, C_WHITE_CAB)
    F.box(-3.9, -7.98, z + 0.3, -2.5, -7.62, z + 2.2, C_SCREEN_GLOW)
    # 药剂冷藏柜与器械台
    F.box(-1.0, -7.0, z, 0.8, -6.5, z + 2.1, C_WHITE_CAB)
    F.box(-0.9, -7.02, z + 0.3, 0.7, -6.98, z + 2.0, C_GLASS_CYAN)
    F.box(-0.8, -6.95, z + 0.5, 0.6, -6.7, z + 0.7, C_ETHER_CYAN)

    # --- 档案室 B2-C03 (10..16, -14..-10.67)
    F.box(10.4, -13.7, z, 15.6, -13.0, z + 2.2, C_METAL_IRON)
    for fx in (11.0, 12.5, 14.0, 15.0):
        F.box(fx - 0.08, -13.02, z + 1.1, fx + 0.08, -12.98, z + 1.25, C_METAL_GOLD)
    F.box(10.4, -11.8, z, 12.4, -11.0, z + 2.3, C_METAL_IRON)
    F.box(10.5, -11.82, z + 0.3, 12.3, -11.78, z + 2.1, C_SCREEN_GLOW)
    F.box(13.2, -11.8, z, 15.6, -11.0, z + 0.75, C_WOOD_WALNUT)
    F.box(13.8, -11.4, z + 0.75, 14.8, -11.3, z + 1.25, C_SCREEN_GLOW)
    F.box(13.9, -12.4, z, 14.7, -11.8, z + 1.2, C_LEATHER_DK)

    # --- 储藏室 B2-C04 (10..16, -10.67..-6)
    F.box(10.4, -10.3, z, 15.6, -9.5, z + 2.5, C_METAL_STEEL)
    F.box(10.4, -8.5, z, 13.0, -7.8, z + 2.5, C_METAL_STEEL)
    F.box(10.4, -6.9, z, 15.6, -6.45, z + 2.2, C_WOOD_WALNUT)
    # 紧急医疗急救站 (EQ-51 Emergency Kit)
    F.box(13.8, -8.5, z + 0.8, 15.6, -7.8, z + 2.0, C_RED_EMERG)
    F.box(14.4, -8.52, z + 1.35, 15.0, -8.48, z + 1.45, C_WHITE_CAB)
    F.box(14.65, -8.52, z + 1.20, 14.75, -8.48, z + 1.60, C_WHITE_CAB)
    F.box(14.0, -8.4, z, 14.8, -7.9, z + 0.45, C_RED_EMERG)
    F.cyl(15.1, -8.1, 0.08, z, z + 0.85, C_METAL_STEEL, 12)
    F.cyl(15.35, -8.1, 0.08, z, z + 0.85, C_METAL_STEEL, 12)

    # --- 结界发生器室 / 机电设备间 (-14..4, -3..8)
    # 以太结界共鸣核心装置
    F.box(-6.2, 1.3, z, -3.8, 3.7, z + 0.4, C_METAL_IRON)
    F.box(-6.0, 1.5, z + 0.4, -4.0, 3.5, z + 0.75, C_METAL_STEEL)
    F.cyl(-5.0, 2.5, 0.6, z + 0.75, z + 2.2, C_ETHER_CYAN, 24)
    for px, py in ((-5.9, 1.6), (-4.1, 1.6), (-5.9, 3.4), (-4.1, 3.4)):
        F.cyl(px, py, 0.08, z + 0.4, z + 2.8, C_METAL_GOLD, 12)
    F.box(-12.0, 0.0, z, -9.0, 5.0, z + 2.4, C_METAL_IRON)
    F.box(-11.8, 0.2, z + 2.4, -9.2, 4.8, z + 2.65, C_METAL_STEEL)
    F.box(-13.0, 6.5, z, -8.5, 7.5, z + 0.9, C_METAL_IRON)
    F.box(-12.8, 6.6, z + 0.9, -8.7, 6.75, z + 1.8, C_SCREEN_GLOW)
    F.box(0.5, 2.5, z, 3.5, 6.5, z + 2.4, C_METAL_IRON)


def build_floor(fl):
    rooms = [r for r in FP.ROOMS if r['floor'] == fl]
    z = ZF[fl]
    S, F = Mesh(), Mesh()
    for r in rooms:   # 楼板
        S.prism(r['poly'], z - SLAB, z, KIND_COL.get(r['kind'], KIND_COL['open']))
    wall_rooms = [r for r in rooms if r['block'] != 'porch' and r['kind'] != 'medical']   # 门廊是敞开柱廊，不出墙；医疗中心（kind=medical）的墙 / 门 / 设备由 medical_b2.py 出（medical_web.py）
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
    if fl == 'B1':
        build_b1_furn(F, z)
    elif fl == 'B2':
        build_b2_furn(F, z)
    else:
        for r in rooms:
            if r['kind'] in ('restricted', 'medical'):
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
