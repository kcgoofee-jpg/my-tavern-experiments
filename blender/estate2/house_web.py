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

    def pad(self, x0, y0, z0, x1, y1, z1, col, ao=None):
        """Raised floor/carpet pad: top face at z1 and 4 sides from z0 to z1. NO bottom face (prevents z-fighting)."""
        P = lambda x, y, z: (x, y, z)
        self.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), col)           # 顶
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

    def beam3d(self, p0, p1, w, d, col, ao=None):
        """沿 3D 中心线 p0→p1 挤出的立体截面梁（宽 w 沿 X-Z 平面垂直于轴线，厚 d 沿厚度法线）。"""
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
        v = p1 - p0
        L = np.linalg.norm(v)
        if L < 1e-4:
            return
        u = v / L
        # X-Z 平面内的横向垂线
        n = np.array([-u[2], 0.0, u[0]])
        ln = np.linalg.norm(n)
        if ln < 1e-6:
            n = np.array([1.0, 0.0, 0.0])
        else:
            n = n / ln
        # 厚度法向
        m = np.cross(u, n)
        lm = np.linalg.norm(m)
        if lm < 1e-6:
            m = np.array([0.0, 1.0, 0.0])
        else:
            m = m / lm

        hw, hd = w / 2.0, d / 2.0
        a0 = p0 - hw * n - hd * m
        b0 = p0 + hw * n - hd * m
        c0 = p0 + hw * n + hd * m
        d0 = p0 - hw * n + hd * m

        a1 = p1 - hw * n - hd * m
        b1 = p1 + hw * n - hd * m
        c1 = p1 + hw * n + hd * m
        d1 = p1 - hw * n + hd * m

        self.quad(a0, b0, c0, d0, col)
        self.quad(d1, c1, b1, a1, col)
        self.quad(a0, d0, d1, a1, col, ao)
        self.quad(b0, b1, c1, c0, col, ao)
        self.quad(a0, a1, b1, b0, col, ao)
        self.quad(d0, c0, c1, d1, col, ao)

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
    """一跑楼梯：n 级踏步，沿 axis 正向（up=False 反向）升 rise。每级踏步自成梯段厚度，避免共面重叠。"""
    step_h = rise / n
    for k in range(n):
        f0, f1 = k / n, (k + 1) / n
        if not up:
            f0, f1 = 1 - f1, 1 - f0
        zb = z0 + step_h * k
        zt = z0 + step_h * (k + 1)
        if axis == 'y':
            M.box(x0, y0 + (y1 - y0) * f0, zb, x1, y0 + (y1 - y0) * f1, zt, STAIR)
        else:
            M.box(x0 + (x1 - x0) * f0, y0, zb, x0 + (x1 - x0) * f1, y1, zt, STAIR)


def cores(M, fl, z):
    top = fl == 'F3'
    if fl in ('F1', 'F2', 'F3'):   # 塔楼石材双跑梯（楼梯井 10 × 10 m）：西跑向北升一半，平台，东跑向南升另一半；F3 再上一跑到屋顶眺望亭
        half = FH / 2
        flight(M, -21.5, -18.0, -21.5, -14.5, z + 0.01, half, 13, 'y', True)
        M.box(-21.5, -14.5, z + half - 0.2, -12.5, -12.5, z + half, STAIR)                 # 北端平台
        flight(M, -16.0, -12.5, -21.5, -14.5, z + half, half, 13, 'y', False)
        M.box(-18.0, -21.5, z, -16.0, -14.5, z + (FH if not top else half), (0.78, 0.76, 0.72))   # 梯井中墙
    # 仆役核：仆役梯（两跑）+ 食梯 / 服务电梯
    if fl != 'F3':
        flight(M, -19.6, -18.1, -2.6, 2.6, z + 0.01, FH / 2, 13, 'y', True)
        M.box(-19.6, 2.6, z + FH / 2 - 0.2, -16.6, 2.95, z + FH / 2, STAIR)
        flight(M, -18.1, -16.6, -2.6, 2.6, z + FH / 2, FH / 2, 13, 'y', False)
    else:
        flight(M, -19.6, -18.1, -2.6, 2.6, z + 0.01, FH / 2, 13, 'y', True)
    lift(M, -15.9, -2.5, 1.6, 1.6, z)
    if fl in ('B2', 'B1', 'F1', 'F2'):   # 主人通道：螺旋梯 + 单人电梯
        spiral(M, 18.9, -8.9, 0.85, z, FH if fl != 'F2' else FH * 0.5)
        lift(M, 16.3, -9.7, 1.4, 1.4, z)
    if fl in ('B2', 'B1'):   # 疏散梯（东端，B2–B1 再上室外）
        flight(M, 16.3, 18.0, -13.7, -10.3, z + 0.01, FH / 2, 13, 'y', True)
        M.box(16.3, -10.3, z + FH / 2 - 0.2, 19.7, -10.0, z + FH / 2, STAIR)
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


# B1 / B2 室内专属材质与精细化色调 (PBR 映射体系)
C_LEATHER_DK = (0.14, 0.14, 0.15)
C_LEATHER_RD = (0.42, 0.09, 0.12)
C_WOOD_WALNUT = (0.28, 0.18, 0.12)
C_WOOD_OAK = (0.50, 0.36, 0.22)
C_METAL_IRON = (0.20, 0.21, 0.22)
C_METAL_STEEL = (0.75, 0.77, 0.79)
C_METAL_GOLD = (0.78, 0.64, 0.26)
C_WHITE_CAB = (0.88, 0.88, 0.89)
C_GLASS_CYAN = (0.48, 0.70, 0.76)
C_ETHER_CYAN = (0.18, 0.82, 0.92)
C_RED_EMERG = (0.76, 0.08, 0.08)
C_SCREEN_GLOW = (0.08, 0.55, 0.65)
C_MAT_SPARRING = (0.64, 0.66, 0.70)
C_BOTTLE_GLASS = (0.12, 0.26, 0.16)
C_PILLOW_WHITE = (0.86, 0.85, 0.82)
C_CARPET_BURGUNDY = (0.32, 0.06, 0.08)
C_CARPET_GOLD = (0.65, 0.52, 0.20)
C_FLOOR_TATAMI = (0.76, 0.70, 0.58)
C_FLOOR_RUBBER = (0.13, 0.14, 0.15)
C_FLOOR_TEAK = (0.48, 0.32, 0.16)
C_FLOOR_EPOXY = (0.46, 0.56, 0.54)
C_FLOOR_GRID = (0.66, 0.68, 0.70)
C_HAZARD_YEL = (0.85, 0.68, 0.10)
C_HAZARD_BLK = (0.10, 0.10, 0.10)


def build_b1_furn(F, z):
    # ========================================================================
    # 1. 地面材质分区与地毯铺装 (严格阶梯式叠高 ≥0.03m + pad 无底面防共面撕裂)
    # ========================================================================
    # --- B1-C01 主调教室地面：外围黑胡桃实木 (z..z+0.03)，金边地毯底板 (z+0.03..z+0.06)，中央提花天鹅绒深红地毯 + 马鞍皮防护地垫 (z+0.06..z+0.09)
    F.pad(-9.8, -13.8, z, -0.2, -6.2, z + 0.03, C_WOOD_WALNUT)
    F.pad(-7.6, -12.4, z + 0.03, -2.4, -8.0, z + 0.06, C_CARPET_GOLD)
    F.pad(-7.4, -12.2, z + 0.06, -2.6, -8.2, z + 0.09, C_CARPET_BURGUNDY)
    F.pad(-8.2, -13.7, z + 0.06, -4.0, -12.3, z + 0.09, C_LEATHER_DK)

    # --- B1-C02 私人调教室地面：外围黑胡桃木地板 (z..z+0.03)，波斯羊毛金边地毯 (z+0.03..z+0.06)，深酒红毯芯 + 马鞍皮跑道 (z+0.06..z+0.09)
    F.pad(0.15, -13.85, z, 3.65, -6.15, z + 0.03, C_WOOD_WALNUT)
    F.pad(0.30, -13.65, z + 0.03, 3.50, -6.35, z + 0.06, C_CARPET_GOLD)
    F.pad(0.40, -13.55, z + 0.06, 3.40, -6.45, z + 0.09, C_CARPET_BURGUNDY)
    F.pad(0.70, -12.4, z + 0.06, 2.90, -8.4, z + 0.09, C_LEATHER_DK)

    # --- B1-C04 性技巧训练室地面：浅色天然软木榻榻米地面 (z..z+0.03)，金边压条 (z+0.03..z+0.06)，灰蓝硅胶拉伸定位垫 (z+0.06..z+0.09)
    F.pad(3.9, -13.8, z, 6.75, -6.2, z + 0.03, C_FLOOR_TATAMI)
    F.pad(4.25, -12.25, z + 0.03, 5.95, -8.75, z + 0.06, C_CARPET_GOLD)
    F.pad(4.30, -12.20, z + 0.06, 5.90, -8.80, z + 0.09, (0.24, 0.32, 0.38))

    # --- B1-C03 体能训练室地面：EPDM 硫化高密度抗震黑灰橡胶地垫 (z..z+0.03)，白色场馆边界线 (z+0.03..z+0.06)
    F.pad(-7.8, -2.8, z, -2.2, 6.8, z + 0.03, C_FLOOR_RUBBER)
    F.pad(-7.6, -2.6, z + 0.03, -7.5, 6.6, z + 0.06, (0.88, 0.88, 0.88))
    F.pad(-2.5, -2.6, z + 0.03, -2.4, 6.6, z + 0.06, (0.88, 0.88, 0.88))
    F.pad(-7.6, -2.6, z + 0.03, -2.4, -2.5, z + 0.06, (0.88, 0.88, 0.88))
    F.pad(-7.6, 6.5, z + 0.03, -2.4, 6.6, z + 0.06, (0.88, 0.88, 0.88))

    # --- B1-C05 恒温酒窖地面：比利时蓝石板 / 老白橡实木拼花 (z..z+0.03)，品酒台织物地毯 (z+0.03..z+0.06)
    F.pad(-13.8, -2.8, z, -8.2, 1.8, z + 0.03, (0.30, 0.24, 0.18))
    F.pad(-11.8, -1.0, z + 0.03, -9.2, 0.6, z + 0.06, (0.18, 0.26, 0.20))

    # --- 更衣 / 淋浴间地面：干区大理石瓷砖 (z..z+0.03)，湿区淋浴间缅甸水润柚木防滑木格栅 (z+0.03..z+0.06)
    F.pad(10.2, -13.8, z, 15.8, -6.2, z + 0.03, (0.85, 0.84, 0.82))
    F.pad(13.4, -13.6, z + 0.03, 15.7, -9.6, z + 0.06, C_FLOOR_TEAK)

    # ========================================================================
    # 2. 主调教室 B1-C01 核心家具与设施深度构造
    # ========================================================================
    # (1) 2.1 中央双人调教主台与天花悬空骑乘肉铠导轨系统 (Master Gantry Bed & Flesh-Armor Rig)
    # (a) 内缩式黑钛踢脚底座与暗藏暖白洗地漫反射光带
    F.box(-5.68, -11.08, z + 0.10, -4.32, -8.92, z + 0.20, C_METAL_IRON)
    # 底座外沿暗藏暖白下投漫反射氛围光带 (消除笨重感)
    F.box(-5.70, -11.06, z + 0.18, -5.68, -8.94, z + 0.20, (0.96, 0.88, 0.65))
    F.box(-4.32, -11.06, z + 0.18, -4.30, -8.94, z + 0.20, (0.96, 0.88, 0.65))
    F.box(-5.68, -11.08, z + 0.18, -4.32, -11.06, z + 0.20, (0.96, 0.88, 0.65))
    F.box(-5.68, -8.94, z + 0.18, -4.32, -8.92, z + 0.20, (0.96, 0.88, 0.65))

    # (b) 黑胡桃实木主床框与四角金铜防撞护角包边
    F.box(-5.80, -11.20, z + 0.20, -4.20, -8.80, z + 0.58, C_WOOD_WALNUT)
    # 四角加固拉丝金铜 L 型托板
    F.box(-5.805, -11.205, z + 0.21, -5.755, -11.155, z + 0.57, C_METAL_GOLD)
    F.box(-4.245, -11.205, z + 0.21, -4.195, -11.155, z + 0.57, C_METAL_GOLD)
    F.box(-5.805, -8.845, z + 0.21, -5.755, -8.795, z + 0.57, C_METAL_GOLD)
    F.box(-4.245, -8.845, z + 0.21, -4.195, -8.795, z + 0.57, C_METAL_GOLD)

    # (c) 双人复合马鞍皮床垫与法式立体双滚边工艺
    # 下层黑炭高密硬垫基底
    F.box(-5.72, -11.12, z + 0.58, -4.28, -8.88, z + 0.70, C_LEATHER_DK)
    # 床垫接缝处暗色鞍皮法式立体双滚边 (外沿包边凸棱)
    F.box(-5.725, -11.125, z + 0.695, -5.712, -8.875, z + 0.715, C_LEATHER_DK)
    F.box(-4.288, -11.125, z + 0.695, -4.275, -8.875, z + 0.715, C_LEATHER_DK)
    F.box(-5.725, -11.125, z + 0.695, -4.275, -11.112, z + 0.715, C_LEATHER_DK)
    F.box(-5.725, -8.888, z + 0.695, -4.275, -8.875, z + 0.715, C_LEATHER_DK)
    # 上层意大利勃艮第红植鞣牛皮独立双席舒适层
    # 西席 (左席)
    F.box(-5.68, -11.08, z + 0.70, -5.05, -8.92, z + 0.78, C_LEATHER_RD)
    # 东席 (右席)
    F.box(-4.95, -11.08, z + 0.70, -4.32, -8.92, z + 0.78, C_LEATHER_RD)
    # 中轴深色皮革双缝凹槽
    F.box(-5.05, -11.08, z + 0.70, -4.95, -8.92, z + 0.76, C_LEATHER_DK)

    # (d) 奢华床品配件群：分体羽绒真丝双枕 + 床尾折叠天鹅绒被毯
    # 西席床头真丝羽绒枕 (象牙白丝绸面 + 金丝滚边)
    F.box(-5.60, -9.52, z + 0.78, -5.10, -8.96, z + 0.88, C_PILLOW_WHITE)
    F.box(-5.50, -9.42, z + 0.875, -5.20, -9.06, z + 0.885, (0.78, 0.77, 0.75))
    F.box(-5.605, -9.525, z + 0.78, -5.095, -8.955, z + 0.795, C_CARPET_GOLD)
    # 东席床头真丝羽绒枕 (象牙白丝绸面 + 金丝滚边)
    F.box(-4.90, -9.52, z + 0.78, -4.40, -8.96, z + 0.88, C_PILLOW_WHITE)
    F.box(-4.80, -9.42, z + 0.875, -4.50, -9.06, z + 0.885, (0.78, 0.77, 0.75))
    F.box(-4.905, -9.525, z + 0.78, -4.395, -8.955, z + 0.795, C_CARPET_GOLD)
    # 床尾整齐折叠对搭的深勃艮第红丝绒护脚毯 (双层对折 + 金线锁边)
    F.box(-5.70, -11.10, z + 0.78, -4.30, -10.35, z + 0.82, C_CARPET_BURGUNDY)
    F.box(-5.69, -11.09, z + 0.82, -4.31, -10.55, z + 0.85, C_CARPET_BURGUNDY)
    F.box(-5.70, -10.56, z + 0.82, -4.30, -10.54, z + 0.855, C_METAL_GOLD)

    # (e) 床面双排真皮横向约束带与滚轮五金针扣
    # 胸部拘束横带 (宽幅黑牛皮 + 双位金色滚轮扣)
    F.box(-5.72, -9.74, z + 0.782, -4.28, -9.66, z + 0.795, C_LEATHER_DK)
    F.box(-5.42, -9.75, z + 0.790, -5.32, -9.65, z + 0.805, C_METAL_GOLD)
    F.box(-4.68, -9.75, z + 0.790, -4.58, -9.65, z + 0.805, C_METAL_GOLD)
    # 骨盆/大腿拘束横带 (宽幅黑牛皮 + 双位金色滚轮扣)
    F.box(-5.72, -10.54, z + 0.782, -4.28, -10.46, z + 0.795, C_LEATHER_DK)
    F.box(-5.42, -10.55, z + 0.790, -5.32, -10.45, z + 0.805, C_METAL_GOLD)
    F.box(-4.68, -10.55, z + 0.790, -4.58, -10.45, z + 0.805, C_METAL_GOLD)

    # (f) 床框两侧 8 组下沉式精密折叠黄铜 D 环锚点 (西4组 + 东4组)
    for dy in (-11.00, -10.30, -9.70, -9.00):
        # 西侧外沿锚座与 D 环
        F.box(-5.81, dy - 0.045, z + 0.44, -5.795, dy + 0.045, z + 0.52, C_METAL_GOLD)
        F.cyl(-5.80, dy, 0.012, z + 0.45, z + 0.51, C_METAL_STEEL, 6)
        F.box(-5.82, dy - 0.030, z + 0.46, -5.805, dy + 0.030, z + 0.50, C_METAL_GOLD)
        # 东侧外沿锚座与 D 环
        F.box(-4.205, dy - 0.045, z + 0.44, -4.190, dy + 0.045, z + 0.52, C_METAL_GOLD)
        F.cyl(-4.20, dy, 0.012, z + 0.45, z + 0.51, C_METAL_STEEL, 6)
        F.box(-4.195, dy - 0.030, z + 0.46, -4.180, dy + 0.030, z + 0.50, C_METAL_GOLD)

    # (g) 重型镀铬八柱式龙门钢架 (角柱 + 顶部横梁 + 剖切位加固铜箍)
    for px, py in ((-5.80, -11.20), (-4.20, -11.20), (-5.80, -8.80), (-4.20, -8.80)):
        # 柱底法兰盘
        F.cyl(px, py, 0.07, z + 0.10, z + 0.14, C_METAL_GOLD, 6)
        # 镀铬圆柱主立杆 (直径 70mm)
        F.cyl(px, py, 0.035, z + 0.14, z + 3.15, C_METAL_STEEL, 6)
        # 中段标高加固套箍与挂环 (位于 z+1.44..z+1.50，剖切线直接可见)
        F.cyl(px, py, 0.048, z + 1.44, z + 1.50, C_METAL_GOLD, 6)
        F.box(px - 0.05, py - 0.05, z + 1.42, px + 0.05, py + 0.05, z + 1.48, C_METAL_GOLD)
    # 顶部矩形龙门钢梁
    F.box(-5.85, -11.25, z + 3.05, -4.15, -11.15, z + 3.18, C_METAL_STEEL)
    F.box(-5.85, -8.85, z + 3.05, -4.15, -8.75, z + 3.18, C_METAL_STEEL)
    F.box(-5.85, -11.25, z + 3.05, -5.75, -8.75, z + 3.18, C_METAL_STEEL)
    F.box(-4.25, -11.25, z + 3.05, -4.15, -8.75, z + 3.18, C_METAL_STEEL)

    # (h) 天花工字悬吊滑轨与电动马鞍滑车·悬空骑乘肉铠系统 (直通天花延伸至床面上方)
    # 天花纵向工字钢主导轨
    F.box(-5.08, -12.20, z + 3.28, -4.92, -7.80, z + 3.40, C_METAL_IRON)
    # 电动马鞍滑车主体 (金色外壳 + 转向轮组)
    F.box(-5.25, -10.30, z + 3.16, -4.75, -9.70, z + 3.28, C_METAL_GOLD)
    F.cyl(-5.00, -10.00, 0.045, z + 3.12, z + 3.16, C_METAL_STEEL, 6)
    # 四点下垂航空钢缆与张力花兰螺丝 (延伸至床面上方操作高度，剖切面下完全可见)
    for rx, ry in ((-5.18, -10.20), (-4.82, -10.20), (-5.18, -9.80), (-4.82, -9.80)):
        F.cyl(rx, ry, 0.005, z + 1.25, z + 3.12, C_METAL_STEEL, 6)
        F.cyl(rx, ry, 0.014, z + 1.22, z + 1.34, (0.80, 0.75, 0.65), 6)
        F.cyl(rx, ry, 0.022, z + 1.27, z + 1.29, C_METAL_GOLD, 6)
        F.box(rx - 0.018, ry - 0.018, z + 1.15, rx + 0.018, ry + 0.018, z + 1.23, C_METAL_GOLD)
    # 悬空骑乘肉铠马鞍具 (深红与墨黑拼色马鞍软垫 + 金色鞍桥 + 垂吊脚蹬)
    F.box(-5.20, -10.22, z + 1.10, -4.80, -9.78, z + 1.20, C_LEATHER_DK)
    F.box(-5.16, -10.18, z + 1.20, -4.84, -9.82, z + 1.28, C_LEATHER_RD)
    F.box(-5.04, -9.82, z + 1.28, -4.96, -9.74, z + 1.35, C_METAL_GOLD)
    # 悬垂的皮质脚蹬与腿环
    F.box(-5.24, -10.05, z + 0.94, -5.20, -9.95, z + 1.10, C_LEATHER_DK)
    F.box(-4.80, -10.05, z + 0.94, -4.76, -9.95, z + 1.10, C_LEATHER_DK)
    F.box(-5.25, -10.06, z + 0.92, -5.19, -9.94, z + 0.96, C_METAL_GOLD)
    F.box(-4.81, -10.06, z + 0.92, -4.75, -9.94, z + 0.96, C_METAL_GOLD)

    # (2) 2.2 活人家具专区 (Human Furniture & Ballet Onahole Rig Zone)
    # (a) 人体工学活人茶几 (加重生铁底盘 + 脊背工学马鞍垫 + 钢化玻璃台 + 待客醒酒器)
    # 加重黑生铁底盘
    F.box(-3.52, -10.62, z + 0.10, -2.28, -9.38, z + 0.18, C_METAL_IRON)
    # 匍匐跪姿与肘部防滑耐磨凹槽软垫
    F.box(-3.35, -10.45, z + 0.18, -2.45, -9.55, z + 0.21, C_LEATHER_DK)

    # 人体脊背工学马鞍承托皮垫 (贴合受训奴隶脊柱背弓)
    F.box(-3.30, -10.35, z + 0.21, -2.50, -9.65, z + 0.46, C_LEATHER_RD)
    # 脊椎贴合弧线中凹凹槽
    F.box(-3.05, -10.35, z + 0.43, -2.75, -9.65, z + 0.465, C_LEATHER_DK)
    # 双道横向真皮背负拘束束带与金铜滚轮扣
    for sy in (-10.15, -9.85):
        F.box(-3.32, sy - 0.03, z + 0.462, -2.48, sy + 0.03, z + 0.485, C_LEATHER_DK)
        F.box(-3.12, sy - 0.035, z + 0.480, -3.02, sy + 0.035, z + 0.495, C_METAL_GOLD)
        F.box(-2.78, sy - 0.035, z + 0.480, -2.68, sy + 0.035, z + 0.495, C_METAL_GOLD)

    # 四角加厚拉丝金铜方形立柱与吸盘减震座
    for bx, by in ((-3.44, -10.54), (-2.36, -10.54), (-3.44, -9.46), (-2.36, -9.46)):
        F.box(bx - 0.02, by - 0.02, z + 0.18, bx + 0.02, by + 0.02, z + 0.62, C_METAL_GOLD)
        F.box(bx - 0.026, by - 0.026, z + 0.59, bx + 0.026, by + 0.026, z + 0.625, C_METAL_STEEL)

    # 悬空高透光学超白钢化玻璃桌面
    F.box(-3.58, -10.68, z + 0.625, -2.22, -9.32, z + 0.665, C_GLASS_CYAN)

    # 茶几台面待客陈列 (拉丝金铜托盘 + 经典切角方晶醒酒器 + 威士忌杯)
    F.box(-3.05, -10.15, z + 0.665, -2.75, -9.85, z + 0.678, C_METAL_GOLD)
    # 切角水晶醒酒器 (奢华方体切角造型 + 金色瓶塞)
    F.box(-2.98, -10.03, z + 0.678, -2.92, -9.97, z + 0.77, C_GLASS_CYAN)
    F.box(-2.97, -10.02, z + 0.77, -2.93, -9.98, z + 0.795, C_METAL_GOLD)
    # 水晶威士忌杯 (切角方杯 + 金黄酒液)
    F.box(-2.84, -10.04, z + 0.678, -2.76, -9.96, z + 0.735, C_GLASS_CYAN)
    F.box(-2.83, -10.03, z + 0.682, -2.77, -9.97, z + 0.705, C_CARPET_GOLD)

    # (b) 人体跪伏脚凳底座与足部拘束台 (Human Footstool & Kneeling Base)
    # 黑胡桃实木框架与金铜脚座
    F.box(-3.30, -11.10, z + 0.10, -2.50, -10.75, z + 0.25, C_WOOD_WALNUT)
    # 上部深黑厚牛皮跪姿与脚踏复合软垫
    F.box(-3.25, -11.05, z + 0.25, -2.55, -10.80, z + 0.38, C_LEATHER_DK)
    # 双足踏位横向拘束皮带 (带金扣)
    F.box(-3.26, -10.94, z + 0.38, -2.54, -10.88, z + 0.395, C_LEATHER_RD)
    F.box(-3.08, -10.95, z + 0.39, -3.00, -10.87, z + 0.405, C_METAL_GOLD)
    F.box(-2.80, -10.95, z + 0.39, -2.72, -10.87, z + 0.405, C_METAL_GOLD)

    # (c) 便携折叠式真人飞机杯专用台与芭蕾折叠束缚架 (Folding Ballet Onahole Rig)
    # 冷轧黑钛折叠 X 型剪叉底架与拉丝黄铜阻尼关节
    F.box(-3.30, -9.15, z + 0.10, -2.50, -8.55, z + 0.16, C_METAL_IRON)
    # X 剪叉斜撑杆与中轴阻尼转轴
    F.box(-3.20, -9.10, z + 0.16, -3.12, -8.60, z + 0.44, C_METAL_STEEL)
    F.box(-2.68, -9.10, z + 0.16, -2.60, -8.60, z + 0.44, C_METAL_STEEL)
    F.box(-2.94, -8.89, z + 0.28, -2.86, -8.81, z + 0.34, C_METAL_GOLD)
    # 垂直升降主支柱与微调刻度环
    F.box(-2.92, -8.87, z + 0.42, -2.88, -8.83, z + 1.12, C_METAL_STEEL)
    F.box(-2.93, -8.88, z + 0.62, -2.87, -8.82, z + 0.66, C_METAL_GOLD)
    # 倒置/折叠式骨盆承托马鞍垫 (深红马鞍皮)
    F.box(-3.10, -9.02, z + 0.65, -2.70, -8.68, z + 0.76, C_LEATHER_RD)
    F.box(-3.05, -8.98, z + 0.76, -2.75, -8.72, z + 0.785, C_METAL_GOLD)
    # 横向双向丝杆分腿分肢支架与金色手轮
    F.box(-3.28, -8.87, z + 0.79, -2.52, -8.83, z + 0.83, C_METAL_STEEL)
    # 左右双侧大腿/膝部软包护托
    F.box(-3.30, -8.96, z + 0.76, -3.18, -8.74, z + 0.88, C_LEATHER_DK)
    F.box(-2.62, -8.96, z + 0.76, -2.50, -8.74, z + 0.88, C_LEATHER_DK)
    # 外侧双向调节金色旋钮
    F.box(-3.34, -8.89, z + 0.78, -3.28, -8.81, z + 0.84, C_METAL_GOLD)
    F.box(-2.52, -8.89, z + 0.78, -2.46, -8.81, z + 0.84, C_METAL_GOLD)
    # 顶部悬臂式脚踝吊环吊带
    F.box(-3.15, -8.88, z + 1.08, -2.65, -8.82, z + 1.14, C_METAL_STEEL)
    F.box(-3.10, -8.87, z + 0.94, -3.06, -8.83, z + 1.08, C_LEATHER_DK)
    F.box(-2.74, -8.87, z + 0.94, -2.70, -8.83, z + 1.08, C_LEATHER_DK)
    F.box(-3.11, -8.88, z + 0.92, -3.05, -8.82, z + 0.95, C_METAL_GOLD)
    F.box(-2.75, -8.88, z + 0.92, -2.69, -8.82, z + 0.95, C_METAL_GOLD)


    # 姿态矫正跪台与脚凳底座
    F.box(-5.4, -12.3, z + 0.10, -4.6, -11.7, z + 0.45, C_LEATHER_RD)
    F.box(-5.3, -12.2, z + 0.45, -4.7, -11.8, z + 0.52, C_LEATHER_DK)

    # 南侧主控指挥御座 (黑胡桃雕花骨架 + 勃艮第高背深拉扣皮垫)
    F.box(-5.5, -13.6, z + 0.10, -4.5, -12.8, z + 0.58, C_WOOD_WALNUT)
    F.box(-5.4, -13.5, z + 0.58, -4.6, -13.0, z + 0.72, C_LEATHER_RD)
    F.box(-5.4, -13.6, z + 0.72, -4.6, -13.4, z + 1.75, C_LEATHER_RD)
    F.box(-5.45, -13.62, z + 0.72, -4.45, -13.38, z + 1.78, C_WOOD_WALNUT)

    # 寸止射精管理控制台与神经反馈立柱 (POV: 男奴屈服)
    F.box(-7.7, -13.6, z + 0.10, -6.7, -12.6, z + 1.05, C_METAL_IRON)
    F.box(-7.6, -13.5, z + 1.05, -6.8, -13.1, z + 1.55, C_SCREEN_GLOW)
    F.cyl(-7.2, -12.8, 0.08, z + 1.05, z + 1.95, C_ETHER_CYAN, 12)

    # 倒吊重力靴单杠与反向拉伸架
    F.cyl(-9.5, -13.5, 0.05, z + 0.10, z + 2.6, C_METAL_STEEL, 10)
    F.cyl(-8.5, -13.5, 0.05, z + 0.10, z + 2.6, C_METAL_STEEL, 10)
    F.box(-9.55, -13.55, z + 2.45, -8.45, -13.45, z + 2.55, C_METAL_STEEL)
    F.box(-9.2, -13.5, z + 2.2, -8.8, -13.45, z + 2.45, C_LEATHER_DK)
    F.box(-9.5, -13.0, z + 0.10, -8.5, -12.3, z + 0.22, C_MAT_SPARRING)

    # 强迫审讯屈服椅 / 电动分腿椅 (条目111)
    F.cyl(-9.0, -10.4, 0.40, z + 0.04, z + 0.34, C_METAL_STEEL, 16)
    F.box(-9.4, -10.8, z + 0.34, -8.6, -10.0, z + 0.69, C_LEATHER_DK)
    F.box(-9.4, -10.9, z + 0.69, -8.6, -10.7, z + 1.49, C_LEATHER_DK)
    F.box(-9.5, -10.7, z + 0.69, -8.5, -10.1, z + 0.79, C_METAL_GOLD)

    # 阶梯天鹅绒贞操锁陈列玻璃展柜 (和光/爱语风)
    F.box(-9.7, -8.8, z + 0.04, -8.3, -6.8, z + 0.24, C_WOOD_WALNUT)   # 底座
    F.box(-9.7, -8.8, z + 0.24, -8.3, -6.8, z + 2.44, C_GLASS_CYAN) # 玻璃外罩
    F.box(-9.6, -8.7, z + 0.24, -8.4, -6.9, z + 0.79, C_LEATHER_RD)  # 天鹅绒垫层
    # 3层发光层板与微缩贞操锁/道具
    for sz in (z + 0.89, z + 1.44, z + 1.99):
        F.box(-9.65, -8.75, sz, -8.35, -6.85, sz + 0.03, C_ETHER_CYAN)
        for gy in (-8.4, -7.8, -7.2):
            F.box(-9.1, gy - 0.06, sz + 0.03, -8.9, gy + 0.06, sz + 0.18, C_METAL_GOLD)

    # 通顶透明精品橱窗与武器化拘束架 (和光/爱语风)
    F.box(-0.8, -13.7, z + 0.04, -0.1, -9.5, z + 0.29, C_WOOD_WALNUT)
    F.box(-0.8, -13.7, z + 0.29, -0.1, -9.5, z + 2.84, C_GLASS_CYAN)
    F.box(-0.75, -13.65, z + 0.32, -0.70, -9.55, z + 2.79, C_ETHER_CYAN)
    for wy in (-13.0, -12.0, -11.0, -10.0):
        F.box(-0.6, wy - 0.03, z + 1.1, -0.3, wy + 0.03, z + 2.3, C_LEATHER_DK)
        F.box(-0.65, wy - 0.05, z + 2.3, -0.25, wy + 0.05, z + 2.38, C_METAL_GOLD)

    # 润滑剂与耗材恒温补给吧台 + UV-C 消毒充电底座
    F.box(-0.8, -9.0, z + 0.04, -0.1, -6.6, z + 0.94, C_METAL_IRON)
    F.box(-0.7, -8.8, z + 0.94, -0.2, -7.8, z + 1.44, C_METAL_STEEL)
    F.box(-0.7, -7.7, z + 0.94, -0.2, -6.8, z + 1.29, C_SCREEN_GLOW)
    F.box(-0.65, -7.6, z + 1.29, -0.25, -6.9, z + 1.32, C_ETHER_CYAN)

    # 开箱检验与分装操作岛台
    F.box(-3.2, -13.0, z + 0.04, -1.8, -11.2, z + 0.89, C_METAL_STEEL)
    F.box(-3.1, -12.9, z + 0.89, -1.9, -11.3, z + 0.92, C_WHITE_CAB)

    # 折叠真人飞机杯收纳卡台
    F.box(-3.2, -8.8, z + 0.04, -1.8, -7.2, z + 0.54, C_METAL_IRON)
    F.box(-3.1, -8.7, z + 0.54, -1.9, -7.3, z + 0.74, C_LEATHER_DK)
    F.box(-3.0, -8.6, z + 0.74, -2.0, -7.4, z + 0.82, C_METAL_GOLD)

    # ========================================================================
    # 3. 私人调教室 B1-C02 (0..3.75, -14..-6) —— 独立深度精雕
    # ========================================================================
    # (1) 3.1 圣安德鲁十字架 (St. Andrew's Cross Platform)
    # 包含：
    #   1. 重型角钢与铸铁底盘 + 法兰固定地脚螺栓 + 减震橡胶垫
    #   2. 双向对角黑胡桃木 X 主梁 (5°后倾仰角，精密轴向分段) + 法式小牛皮受压软包 + 金铜固定饰钉
    #   3. 中心加固金铜收口套箍 + 恒温电加热深红小牛皮骨盆/腰骶承托垫 + 底部加热引线座
    #   4. 四端万向旋转黄铜转环 + 钢制快速卸力卡扣 + 双层宽幅牛皮护腕/护踝束带 (带针扣与D环)
    #   5. 四肢中段 (大腿/前臂) 导向固定皮带与侧边 D 环
    #   6. 背部 A 形加固斜撑 + 电动液压伸缩套筒推杆 (精钢外筒 + 镀铬高亮活塞杆 + 高压软管)
    #   7. 侧向机械紧急快拆拉手 (鲜红警示手柄) + 生理阈值遥测传感器接口
    # ------------------------------------------------------------------------
    # [1] 重型角钢与铸铁底盘
    F.box(0.65, -13.68, z + 0.10, 1.95, -13.38, z + 0.20, C_METAL_IRON)
    F.box(0.68, -13.66, z + 0.20, 1.92, -13.40, z + 0.22, C_METAL_STEEL)
    # 两端减震橡胶脚垫
    F.box(0.64, -13.69, z + 0.10, 0.76, -13.37, z + 0.12, C_FLOOR_RUBBER)
    F.box(1.84, -13.69, z + 0.10, 1.96, -13.37, z + 0.12, C_FLOOR_RUBBER)
    # 3组重型法兰固定盘与地脚高强螺栓
    for bx in (0.80, 1.30, 1.80):
        F.cyl(bx, -13.53, 0.055, z + 0.20, z + 0.23, C_METAL_IRON, 12)
        F.cyl(bx, -13.53, 0.025, z + 0.23, z + 0.26, C_METAL_STEEL, 8)

    # [2] 双向对角黑胡桃木 X 主梁 (5°后倾仰角，连续立体实木梁芯 + 全通深红小牛皮受压软垫 + 金铜饰钉)
    # 对角 1: 左下 (0.78, z+0.20) -> 右上 (1.82, z+2.24) (前向半搭接 +0.006m)
    p0_d1 = np.array([0.78, -13.48 + 0.006, z + 0.20])
    p1_d1 = np.array([1.82, -13.66 + 0.006, z + 2.24])
    F.beam3d(p0_d1, p1_d1, 0.13, 0.08, C_WOOD_WALNUT)
    # 对角 1 前侧深红小牛皮软包垫
    F.beam3d(p0_d1 + np.array([0.0, 0.051, 0.0]), p1_d1 + np.array([0.0, 0.051, 0.0]), 0.10, 0.022, C_LEATHER_RD)

    # 对角 2: 右下 (1.82, z+0.20) -> 左上 (0.78, z+2.24) (后向半搭接 -0.006m)
    p0_d2 = np.array([1.82, -13.48 - 0.006, z + 0.20])
    p1_d2 = np.array([0.78, -13.66 - 0.006, z + 2.24])
    F.beam3d(p0_d2, p1_d2, 0.13, 0.08, C_WOOD_WALNUT)
    # 对角 2 前侧深红小牛皮软包垫
    F.beam3d(p0_d2 + np.array([0.0, 0.051, 0.0]), p1_d2 + np.array([0.0, 0.051, 0.0]), 0.10, 0.022, C_LEATHER_RD)

    # 两侧实木梁缘的金铜固定饰钉 (沿两梁均匀分布)
    for s_val in (0.12, 0.24, 0.36, 0.64, 0.76, 0.88):
        # 梁1两侧饰钉
        pt1 = p0_d1 + (p1_d1 - p0_d1) * s_val
        F.cyl(pt1[0] - 0.055, pt1[1] + 0.042, 0.007, pt1[2] - 0.007, pt1[2] + 0.007, C_METAL_GOLD, 6)
        F.cyl(pt1[0] + 0.055, pt1[1] + 0.042, 0.007, pt1[2] - 0.007, pt1[2] + 0.007, C_METAL_GOLD, 6)
        # 梁2两侧饰钉
        pt2 = p0_d2 + (p1_d2 - p0_d2) * s_val
        F.cyl(pt2[0] - 0.055, pt2[1] + 0.042, 0.007, pt2[2] - 0.007, pt2[2] + 0.007, C_METAL_GOLD, 6)
        F.cyl(pt2[0] + 0.055, pt2[1] + 0.042, 0.007, pt2[2] - 0.007, pt2[2] + 0.007, C_METAL_GOLD, 6)

    # [3] 四肢中段 (大腿 / 前臂) 导向固定皮带与侧边 D 环
    for sx, sz_strap, sy in (
        (1.04, z + 0.71, -13.525),  # 左大腿
        (1.56, z + 0.71, -13.525),  # 右大腿
        (1.04, z + 1.73, -13.615),  # 左前臂
        (1.56, z + 1.73, -13.615),  # 右前臂
    ):
        F.box(sx - 0.075, sy - 0.050, sz_strap - 0.022, sx + 0.075, sy + 0.065, sz_strap + 0.022, C_LEATHER_DK)
        F.box(sx - 0.084, sy - 0.010, sz_strap - 0.025, sx - 0.075, sy + 0.025, sz_strap + 0.025, C_METAL_GOLD)
        F.box(sx + 0.075, sy - 0.010, sz_strap - 0.025, sx + 0.084, sy + 0.025, sz_strap + 0.025, C_METAL_GOLD)

    # [4] 中心交叉点重型加固金铜套箍与腰骶骨盆恒温小牛皮承托垫
    cy_mid = -13.568
    # 加厚锻造金铜收口套箍 (紧凑适度，烘托 X 造型张力)
    F.box(1.17, cy_mid - 0.065, z + 1.09, 1.43, cy_mid + 0.045, z + 1.35, C_METAL_GOLD)
    # 四角角钢固定扣板与螺栓
    for gx, gz in ((1.16, z + 1.08), (1.44, z + 1.08), (1.16, z + 1.36), (1.44, z + 1.36)):
        F.box(gx - 0.025, cy_mid - 0.062, gz - 0.025, gx + 0.025, cy_mid + 0.040, gz + 0.025, C_METAL_IRON)
        F.cyl(gx, cy_mid + 0.042, 0.009, gz - 0.009, gz + 0.009, C_METAL_GOLD, 6)
    # 恒温电加热深红小牛皮软包主垫 (0.30m x 0.36m，比例精当)
    F.box(1.15, cy_mid + 0.045, z + 1.04, 1.45, cy_mid + 0.092, z + 1.40, C_LEATHER_RD)
    # 腰骶下凹贴合弧度加强垫 (下半段加厚承托骶骨)
    F.box(1.17, cy_mid + 0.092, z + 1.06, 1.43, cy_mid + 0.112, z + 1.22, C_LEATHER_RD)
    # 软垫边缘法式黑色滚边
    F.box(1.14, cy_mid + 0.085, z + 1.03, 1.46, cy_mid + 0.095, z + 1.05, C_LEATHER_DK)
    F.box(1.14, cy_mid + 0.085, z + 1.39, 1.46, cy_mid + 0.095, z + 1.41, C_LEATHER_DK)
    F.box(1.14, cy_mid + 0.085, z + 1.03, 1.16, cy_mid + 0.095, z + 1.41, C_LEATHER_DK)
    F.box(1.44, cy_mid + 0.085, z + 1.03, 1.46, cy_mid + 0.095, z + 1.41, C_LEATHER_DK)
    # 底座恒温电加热线缆接口盒
    F.box(1.26, cy_mid - 0.035, z + 0.98, 1.34, cy_mid + 0.015, z + 1.04, C_METAL_STEEL)

    # [5] 四端万向旋转黄铜转环与宽幅重型真皮拘束带
    # 左上(腕)、右上(腕)、左下(踝)、右下(踝)
    extremities = (
        (0.78, z + 2.24, -13.660),  # 左上 (左腕)
        (1.82, z + 2.24, -13.660),  # 右上 (右腕)
        (0.78, z + 0.20, -13.480),  # 左下 (左踝)
        (1.82, z + 0.20, -13.480),  # 右下 (右踝)
    )
    for cx, cz, cy in extremities:
        # 黄铜端头包角保护套
        F.box(cx - 0.078, cy - 0.055, cz - 0.075, cx + 0.078, cy + 0.042, cz + 0.075, C_METAL_GOLD)
        # 万向旋转环底座凸耳
        F.box(cx - 0.022, cy + 0.042, cz - 0.022, cx + 0.022, cy + 0.072, cz + 0.022, C_METAL_GOLD)
        # 自润滑黄铜万向圆环 (直径 0.11m)
        F.cyl(cx, cy + 0.088, 0.055, cz - 0.015, cz + 0.015, C_METAL_GOLD, 12)
        # 镀铬快速连接卸力卡扣 / 链环
        F.box(cx - 0.016, cy + 0.115, cz - 0.035, cx + 0.016, cy + 0.138, cz + 0.035, C_METAL_STEEL)
        # 双层宽幅牛皮护带主体 (深黑鞍皮)
        F.box(cx - 0.090, cy + 0.130, cz - 0.058, cx + 0.090, cy + 0.170, cz + 0.058, C_LEATHER_DK)
        # 内层深红软牛皮缓冲衬垫
        F.box(cx - 0.082, cy + 0.124, cz - 0.050, cx + 0.082, cy + 0.132, cz + 0.050, C_LEATHER_RD)
        # 双排精钢滚柱针扣
        F.box(cx - 0.068, cy + 0.170, cz - 0.042, cx - 0.032, cy + 0.185, cz - 0.016, C_METAL_STEEL)
        F.box(cx + 0.032, cy + 0.170, cz - 0.042, cx + 0.068, cy + 0.185, cz - 0.016, C_METAL_STEEL)
        # 束带尾舌搭扣
        F.box(cx - 0.055, cy + 0.170, cz + 0.018, cx + 0.055, cy + 0.180, cz + 0.048, C_LEATHER_DK)

    # [6] 背部 A 形斜撑与电动液压伸缩套筒推杆
    # A 形后斜撑双足铰接座
    for sx, sz_base in ((0.76, z + 0.20), (1.84, z + 0.20)):
        F.box(sx - 0.035, -13.68, sz_base, sx + 0.035, -13.62, sz_base + 0.05, C_METAL_IRON)
        F.cyl(sx, -13.65, 0.016, sz_base + 0.01, sz_base + 0.06, C_METAL_STEEL, 8)
    # A 形斜撑无缝连续钢管 (从底座铰座延伸至中心套箍后背)
    F.beam3d((0.76, -13.65, z + 0.23), (1.18, -13.62, z + 1.15), 0.038, 0.038, C_METAL_STEEL)
    F.beam3d((1.84, -13.65, z + 0.23), (1.42, -13.62, z + 1.15), 0.038, 0.038, C_METAL_STEEL)

    # 中央重型液压电动推杆
    # 底座双耳铰支座
    F.box(1.24, -13.67, z + 0.20, 1.36, -13.60, z + 0.26, C_METAL_IRON)
    F.cyl(1.30, -13.635, 0.018, z + 0.21, z + 0.27, C_METAL_STEEL, 8)
    # 外筒 (精钢蓝黑哑光, 直径 0.09m)
    F.cyl(1.30, -13.635, 0.045, z + 0.26, z + 1.05, (0.22, 0.23, 0.25), 12)
    # 液压缸盖密封压圈 (黄铜)
    F.cyl(1.30, -13.635, 0.048, z + 1.05, z + 1.08, C_METAL_GOLD, 12)
    # 内行程活塞杆 (镀铬镜面光亮色, 直径 0.05m)
    F.cyl(1.30, -13.635, 0.025, z + 1.08, z + 1.24, (0.88, 0.90, 0.94), 12)
    # 顶部球铰连接端子 (连接到十字架交叉后背)
    F.box(1.27, -13.64, z + 1.23, 1.33, -13.59, z + 1.29, C_METAL_STEEL)
    # 液压进回油高压软管与管夹
    F.box(1.34, -13.645, z + 0.32, 1.37, -13.625, z + 0.75, (0.12, 0.12, 0.13))
    F.box(1.36, -13.655, z + 0.12, 1.46, -13.625, z + 0.18, C_METAL_IRON)

    # [7] 侧向紧急物理快拆手柄与生理遥测端子
    # 右侧紧急机械快拆手柄 (瞬间脱扣四端插销)
    F.box(1.48, cy_mid - 0.025, z + 1.22, 1.51, cy_mid + 0.015, z + 1.27, C_METAL_IRON)
    F.box(1.51, cy_mid - 0.020, z + 1.15, 1.54, cy_mid + 0.010, z + 1.25, C_RED_EMERG)
    F.box(1.49, cy_mid - 0.010, z + 1.26, 1.53, cy_mid + 0.010, z + 1.29, C_RED_EMERG)
    # 左侧生理遥测导联插座 (监测心率、肌电与皮肤电反应)
    F.box(1.08, cy_mid - 0.025, z + 1.18, 1.12, cy_mid + 0.015, z + 1.24, C_METAL_STEEL)
    F.box(1.075, cy_mid - 0.015, z + 1.20, 1.085, cy_mid + 0.005, z + 1.22, C_ETHER_CYAN)

    # ========================================================================
    # (2) 3.2 单向透视声学观摩大窗与窗台姿态矫正跪台 (Acoustic One-Way Window & Sill & Kneeling Platform)
    # 包含：
    #   1. 黑胡桃木实木深度隔音双层窗套 (南柱/北柱/顶楣梁/承重窗槛 + 两根声学中挺 + 金铜卡扣饰件)
    #   2. 双层声学光学复合玻璃：外侧水银单向镜 (直面主调教室) + 阻尼空腔 + 内侧电控调光雾化玻璃 (私人室侧)
    #   3. 电控透光度调光面板与单向监听拾音孔
    #   4. 悬挑实木观摩窗台台面 (出挑 0.42m，全长 3.90m) + 底下 4 组三角托臂牛腿
    #   5. 人体倚靠深红小牛皮护肘软包扶手 (半圆弧形减压滚边) + 嵌入式金铜器具凹槽
    #   6. 窗台下姿态矫正跪台 (实木重底座 + 镀金护角 + 双层马鞍皮承压垫 + 双位下沉式小腿定位凹槽 + 4组锚固D环)
    # ------------------------------------------------------------------------
    # [1] 深度隔音窗套主框架 (黑胡桃木实木框)
    # 南侧竖向边柱 (Jamb)
    F.box(-0.04, -12.40, z + 0.50, 0.12, -12.28, z + 2.85, C_WOOD_WALNUT)
    # 北侧竖向边柱 (Jamb)
    F.box(-0.04, -8.72, z + 0.50, 0.12, -8.60, z + 2.85, C_WOOD_WALNUT)
    # 顶部声学隔音顶楣梁 (Header)
    F.box(-0.04, -12.40, z + 2.73, 0.12, -8.60, z + 2.85, C_WOOD_WALNUT)
    # 底部承重窗槛骨架 (Sill Sub-frame)
    F.box(-0.04, -12.40, z + 0.50, 0.12, -8.60, z + 0.58, C_WOOD_WALNUT)
    # 两根竖向中间声学加强中挺 (Mullions)
    for my in (-11.16, -9.84):
        F.box(-0.02, my, z + 0.58, 0.10, my + 0.08, z + 2.73, C_WOOD_WALNUT)
        # 中挺上的金铜固定扣件饰件
        F.box(0.095, my + 0.015, z + 1.62, 0.108, my + 0.065, z + 1.69, C_METAL_GOLD)

    # [2] 双层声学光学复合视窗
    # 外层高反水银单向镜 (主调教室侧，高反射水银色)
    F.box(-0.025, -12.28, z + 0.60, -0.015, -8.72, z + 2.71, C_SCREEN_GLOW)
    # 内层电控调光雾化玻璃 (私人调教室侧，高透青幽光色)
    F.box(0.055, -12.28, z + 0.60, 0.065, -8.72, z + 2.71, C_GLASS_CYAN)
    # 内侧暗钛金属固定压条 (上下压线)
    F.box(0.050, -12.28, z + 0.58, 0.072, -8.72, z + 0.60, C_METAL_IRON)
    F.box(0.050, -12.28, z + 2.71, 0.072, -8.72, z + 2.73, C_METAL_IRON)

    # [3] 南边柱嵌入式电控调光面板与单向监听拾音器
    F.box(0.115, -12.38, z + 1.25, 0.125, -12.30, z + 1.45, C_METAL_STEEL)
    F.cyl(0.126, -12.35, 0.012, z + 1.37, z + 1.39, C_METAL_GOLD, 8)
    F.box(0.126, -12.37, z + 1.28, 0.127, -12.33, z + 1.33, C_ETHER_CYAN)

    # [4] 悬挑实木观摩窗台台面与三角支撑牛腿
    # 主窗台板 (出挑 0.42m，全长 3.90m)
    F.box(0.00, -12.45, z + 0.52, 0.42, -8.55, z + 0.58, C_WOOD_WALNUT)
    # 台面下方 4 组三角托臂牛腿
    for cy in (-12.25, -11.05, -9.95, -8.75):
        F.box(0.02, cy - 0.035, z + 0.35, 0.36, cy + 0.035, z + 0.52, C_WOOD_WALNUT)

    # [5] 人体倚靠深红小牛皮扶手软包与嵌入器具槽
    # 弧形护肘软包扶手 (前缘全长铺设)
    F.box(0.38, -12.45, z + 0.58, 0.44, -8.55, z + 0.64, C_LEATHER_RD)
    # 软包上下法式双缝线压条 (深黑鞍皮滚边)
    F.box(0.375, -12.45, z + 0.575, 0.385, -8.55, z + 0.585, C_LEATHER_DK)
    F.box(0.435, -12.45, z + 0.635, 0.445, -8.55, z + 0.645, C_LEATHER_DK)
    # 台面北段嵌入式金铜器具凹槽托盘
    F.box(0.12, -9.20, z + 0.575, 0.32, -8.75, z + 0.585, C_METAL_GOLD)

    # [6] 窗台前姿态矫正下沉跪台 (Ergonomic Posture Kneeling Platform)
    # 碳黑实木重型防滑底座
    F.box(0.45, -11.60, z + 0.10, 1.05, -9.40, z + 0.18, C_WOOD_WALNUT)
    # 四角金铜防撞护角
    for kx, ky in ((0.45, -11.60), (1.05, -11.60), (0.45, -9.40), (1.05, -9.40)):
        F.box(kx - 0.02, ky - 0.02, z + 0.10, kx + 0.02, ky + 0.02, z + 0.19, C_METAL_GOLD)
    # 舒适层主体：深红植鞣马鞍皮软包
    F.box(0.47, -11.55, z + 0.18, 1.03, -9.45, z + 0.30, C_LEATHER_RD)
    # 双位小腿下沉式姿态固定凹槽 (防滑耐磨鞍皮衬底)
    # 南侧跪位凹槽
    F.box(0.55, -11.45, z + 0.28, 0.95, -10.60, z + 0.33, C_LEATHER_DK)
    # 北侧跪位凹槽
    F.box(0.55, -10.40, z + 0.28, 0.95, -9.55, z + 0.33, C_LEATHER_DK)
    # 4 枚侧边与前后埋设金铜锚固 D 环
    for dx, dy in ((0.46, -11.02), (1.04, -11.02), (0.46, -9.98), (1.04, -9.98)):
        F.box(dx - 0.015, dy - 0.03, z + 0.22, dx + 0.015, dy + 0.03, z + 0.26, C_METAL_GOLD)

    # (3) 高级多功能调教皮榻 (内凹悬浮底座 + 马鞍皮主床体 + 侧边D环 + 楔形枕 + 丝绒被褥 + 束带扣具 + 悬吊索具)
    # (a) 内凹悬浮踢脚底座与暗藏暖白洗地漫反射光带
    F.box(1.53, -11.52, z + 0.10, 2.57, -9.28, z + 0.22, C_WOOD_WALNUT)
    # 悬浮底座外沿四周暗藏暖白反光光带 (模拟下投地脚氛围照明)
    F.box(1.515, -11.50, z + 0.20, 1.530, -9.30, z + 0.22, (0.96, 0.88, 0.65))
    F.box(2.570, -11.50, z + 0.20, 2.585, -9.30, z + 0.22, (0.96, 0.88, 0.65))
    F.box(1.530, -11.52, z + 0.20, 2.570, -11.505, z + 0.22, (0.96, 0.88, 0.65))
    F.box(1.530, -9.295, z + 0.20, 2.570, -9.280, z + 0.22, (0.96, 0.88, 0.65))

    # (b) 黑胡桃木床架主框与四角金铜防撞护角五金
    F.box(1.45, -11.60, z + 0.22, 2.65, -9.20, z + 0.48, C_WOOD_WALNUT)
    # 四角加固拉丝金铜护角 L 型托板
    F.box(1.445, -11.605, z + 0.23, 1.485, -11.565, z + 0.47, C_METAL_GOLD)
    F.box(2.615, -11.605, z + 0.23, 2.655, -11.565, z + 0.47, C_METAL_GOLD)
    F.box(1.445, -9.235, z + 0.23, 1.485, -9.195, z + 0.47, C_METAL_GOLD)
    F.box(2.615, -9.235, z + 0.23, 2.655, -9.195, z + 0.47, C_METAL_GOLD)

    # (c) 双层复合马鞍皮床垫与法式真皮双滚边工艺
    # 下层高密支撑黑炭硬质基底床垫
    F.box(1.47, -11.58, z + 0.48, 2.63, -9.22, z + 0.58, C_LEATHER_DK)
    # 床垫接缝处暗色鞍皮法式立体双滚边 (外框包边凸棱)
    F.box(1.465, -11.585, z + 0.575, 1.478, -9.215, z + 0.595, C_LEATHER_DK)
    F.box(2.622, -11.585, z + 0.575, 2.635, -9.215, z + 0.595, C_LEATHER_DK)
    F.box(1.465, -11.585, z + 0.575, 2.635, -11.572, z + 0.595, C_LEATHER_DK)
    F.box(1.465, -9.228, z + 0.575, 2.635, -9.215, z + 0.595, C_LEATHER_DK)
    # 上层意大利深红植鞣牛皮舒适软面 (法式手工拉缝与微倒角)
    F.box(1.48, -11.57, z + 0.58, 2.62, -9.23, z + 0.64, C_LEATHER_RD)
    # 中央轴线手工压合纵向分割线
    F.box(2.045, -11.56, z + 0.638, 2.055, -9.24, z + 0.645, C_LEATHER_DK)

    # (d) 床面一体化真皮横向拘束带与滚轮五金针扣
    # 胸部拘束横带 (宽幅黑牛皮 + 金色滚轮针扣 + 穿带扣环)
    F.box(1.46, -9.94, z + 0.642, 2.64, -9.86, z + 0.655, C_LEATHER_DK)
    F.box(2.00, -9.95, z + 0.650, 2.10, -9.85, z + 0.665, C_METAL_GOLD)
    F.box(2.03, -9.96, z + 0.652, 2.07, -9.84, z + 0.663, C_METAL_STEEL)
    # 骨盆/大腿拘束横带 (宽幅黑牛皮 + 金色滚轮针扣)
    F.box(1.46, -10.94, z + 0.642, 2.64, -10.86, z + 0.655, C_LEATHER_DK)
    F.box(2.00, -10.95, z + 0.650, 2.10, -10.85, z + 0.665, C_METAL_GOLD)
    F.box(2.03, -10.96, z + 0.652, 2.07, -10.84, z + 0.663, C_METAL_STEEL)

    # (e) 奢华床品配件群：分体羽绒真丝双枕 + 骨盆抬高楔形皮枕 + 床尾折叠天鹅绒毯
    # 西侧床头羽绒真丝枕 (象牙白丝绸面 + 金丝滚边底托)
    F.box(1.54, -9.62, z + 0.64, 2.01, -9.28, z + 0.73, C_PILLOW_WHITE)
    F.box(1.64, -9.52, z + 0.725, 1.91, -9.38, z + 0.735, (0.78, 0.77, 0.75))
    F.box(1.535, -9.625, z + 0.64, 2.015, -9.275, z + 0.655, C_CARPET_GOLD)
    # 东侧床头羽绒真丝枕 (象牙白丝绸面 + 金丝滚边底托)
    F.box(2.09, -9.62, z + 0.64, 2.56, -9.28, z + 0.73, C_PILLOW_WHITE)
    F.box(2.19, -9.52, z + 0.725, 2.46, -9.38, z + 0.735, (0.78, 0.77, 0.75))
    F.box(2.085, -9.625, z + 0.64, 2.565, -9.275, z + 0.655, C_CARPET_GOLD)
    # 骨盆抬高楔形调教皮枕 (深红牛皮解剖学三阶斜坡构造，北高南低)
    F.box(1.80, -10.65, z + 0.64, 2.30, -10.15, z + 0.68, C_LEATHER_RD)
    F.box(1.82, -10.55, z + 0.68, 2.28, -10.16, z + 0.72, C_LEATHER_RD)
    F.box(1.84, -10.45, z + 0.72, 2.26, -10.17, z + 0.75, C_LEATHER_RD)
    # 楔形皮枕侧面金色提手扣件
    F.box(2.30, -10.45, z + 0.67, 2.315, -10.35, z + 0.71, C_METAL_GOLD)
    # 床尾整齐折叠搭放的深勃艮第红天鹅绒保暖毯 (双层对折厚度 + 金丝编织锁边)
    F.box(1.46, -11.58, z + 0.64, 2.64, -11.05, z + 0.67, C_CARPET_BURGUNDY)
    F.box(1.47, -11.57, z + 0.67, 2.63, -11.20, z + 0.695, C_CARPET_BURGUNDY)
    F.box(1.46, -11.21, z + 0.67, 2.64, -11.19, z + 0.698, C_METAL_GOLD)

    # (f) 床框两侧 8 组下沉式精密折叠黄铜 D 环锚点 (西4组 + 东4组)
    for dy in (-11.25, -10.55, -9.85, -9.35):
        # 西侧外沿锚座、转轴与旋垂 D 环
        F.box(1.442, dy - 0.045, z + 0.36, 1.452, dy + 0.045, z + 0.44, C_METAL_GOLD)
        F.cyl(1.445, dy, 0.012, z + 0.37, z + 0.43, C_METAL_STEEL, 8)
        F.box(1.432, dy - 0.030, z + 0.38, 1.444, dy + 0.030, z + 0.42, C_METAL_GOLD)
        # 东侧外沿锚座、转轴与旋垂 D 环
        F.box(2.648, dy - 0.045, z + 0.36, 2.658, dy + 0.045, z + 0.44, C_METAL_GOLD)
        F.cyl(2.655, dy, 0.012, z + 0.37, z + 0.43, C_METAL_STEEL, 8)
        F.box(2.656, dy - 0.030, z + 0.38, 2.668, dy + 0.030, z + 0.42, C_METAL_GOLD)

    # (g) 天花悬吊吊架系统与四点高承重悬挂索具 (十字工字钢桁架 + 航空钢缆 + 花兰螺丝 + 快挂锁扣)
    # 顶部纵向主承重钢梁
    F.box(1.97, -11.55, z + 3.42, 2.13, -9.25, z + 3.52, C_METAL_STEEL)
    # 南北两道横向镀金次分配梁
    F.box(1.48, -11.42, z + 3.44, 2.62, -11.28, z + 3.52, C_METAL_GOLD)
    F.box(1.48, -9.52, z + 3.44, 2.62, -9.38, z + 3.52, C_METAL_GOLD)
    # 四点下垂承重索具组件 (垂直延伸至床面上方操作高度，剖切视角可见)
    for hx, hy in ((1.55, -11.35), (2.55, -11.35), (1.55, -9.45), (2.55, -9.45)):
        # 顶板旋转承重法兰座 (天花根部)
        F.cyl(hx, hy, 0.035, z + 3.38, z + 3.44, C_METAL_GOLD, 8)
        # 航空级精编不锈钢吊索 (直径 12mm，自天花贯穿至工作标高)
        F.cyl(hx, hy, 0.006, z + 1.25, z + 3.38, C_METAL_STEEL, 8)
        # 中段可调式花兰螺丝套筒与张力锁紧螺母
        F.cyl(hx, hy, 0.016, z + 1.22, z + 1.34, (0.80, 0.75, 0.65), 8)
        F.cyl(hx, hy, 0.024, z + 1.27, z + 1.29, C_METAL_GOLD, 8)
        # 下端万向旋转登山快挂承重锁扣
        F.box(hx - 0.02, hy - 0.02, z + 1.12, hx + 0.02, hy + 0.02, z + 1.22, C_METAL_GOLD)
        # 垂吊的真皮四肢悬空拘束带 (黑牛皮环带 + 金色滚轮针扣，紧贴床面高度)
        F.box(hx - 0.04, hy - 0.04, z + 0.98, hx + 0.04, hy + 0.04, z + 1.12, C_LEATHER_DK)
        F.box(hx - 0.045, hy - 0.015, z + 1.02, hx - 0.035, hy + 0.015, z + 1.08, C_METAL_GOLD)

    # (4) 东墙南侧：寸止射精管理控制台 & 和光/爱语定制贞操锁展托 (Edging Console & Chastity Showcase)
    # (a) 内缩式黑胡桃木踢脚底座与抽屉式主机底柜
    F.box(3.24, -12.58, z + 0.10, 3.66, -10.42, z + 0.18, C_WOOD_WALNUT)
    # 柜体主箱 (黑胡桃木箱体)
    F.box(3.20, -12.60, z + 0.18, 3.68, -10.40, z + 0.92, C_WOOD_WALNUT)
    # 西侧面向室内的三层抽屉分隔立缝与金色拉手 (面对调教皮榻)
    for dy_sep in (-11.88, -11.16):
        F.box(3.195, dy_sep - 0.005, z + 0.20, 3.205, dy_sep + 0.005, z + 0.90, (0.16, 0.10, 0.07))
    for dz_sep in (0.42, 0.66):
        F.box(3.195, -12.56, z + dz_sep - 0.005, 3.205, -10.44, z + dz_sep + 0.005, (0.16, 0.10, 0.07))
    # 抽屉精密拉丝金铜扁平把手与锁孔铭牌
    for py in (-12.22, -11.52, -10.80):
        for pz in (0.31, 0.54, 0.78):
            F.box(3.185, py - 0.04, z + pz - 0.012, 3.200, py + 0.04, z + pz + 0.012, C_METAL_GOLD)

    # (b) 悬挑拉丝暗灰钛金属工作台面 (倒角金属包边)
    F.box(3.17, -12.63, z + 0.92, 3.71, -10.37, z + 0.96, C_METAL_STEEL)

    # (c) 北段：25°倾角寸止波形分析触控终端与微电流脉冲仪
    # 悬挑斜面铝合金操作控制台前托 (金属拉丝斜座)
    F.box(3.20, -11.35, z + 0.96, 3.32, -10.45, z + 1.03, C_METAL_IRON)
    # 显示器后机体与配重立柱 (靠东墙)
    F.box(3.40, -11.15, z + 0.96, 3.65, -10.65, z + 1.10, C_WOOD_WALNUT)
    F.box(3.34, -11.30, z + 1.04, 3.66, -10.50, z + 1.28, C_METAL_IRON)
    # 14寸液晶显示屏黑色金属倒角边框 (面向室内，西向显露)
    F.box(3.32, -11.28, z + 1.05, 3.34, -10.52, z + 1.27, C_METAL_STEEL)
    # 屏幕高亮显示玻璃屏面与示波器波形区 (西侧突显，绝对不被机壳遮挡)
    F.box(3.305, -11.26, z + 1.06, 3.322, -10.54, z + 1.26, C_SCREEN_GLOW)
    F.box(3.298, -11.23, z + 1.08, 3.310, -10.57, z + 1.24, C_ETHER_CYAN)
    # 顶置呼吸式状态指示灯条 (随生理指标实时变色)
    F.box(3.315, -11.15, z + 1.275, 3.350, -10.65, z + 1.290, C_ETHER_CYAN)

    # 物理操作旋钮阵列：双联滚花金色微调旋钮与紧急红色急停拍钮 (位于前托斜座上)
    F.cyl(3.26, -11.20, 0.022, z + 1.03, z + 1.07, C_METAL_GOLD, 12)
    F.cyl(3.26, -11.08, 0.022, z + 1.03, z + 1.07, C_METAL_GOLD, 12)
    # 红色蘑菇头紧急寸止释放/脉冲切断按钮 (配金色保护座)
    F.cyl(3.26, -10.92, 0.025, z + 1.03, z + 1.05, C_METAL_GOLD, 12)
    F.cyl(3.26, -10.92, 0.020, z + 1.05, z + 1.09, C_RED_EMERG, 12)
    # 双联同轴微电流屏蔽输出端子插座与黑色螺旋引出线缆
    F.cyl(3.26, -10.75, 0.014, z + 1.03, z + 1.06, C_METAL_STEEL, 8)
    F.cyl(3.26, -10.62, 0.014, z + 1.03, z + 1.06, C_METAL_STEEL, 8)
    F.box(3.22, -10.78, z + 0.962, 3.28, -10.58, z + 0.985, C_LEATHER_DK)

    # (d) 中段：医用级导电膏与无菌润滑剂双按压瓶
    # 导电膏瓶 (琥珀色玻璃 + 金色按压泵头)
    F.cyl(3.52, -11.58, 0.028, z + 0.96, z + 1.07, C_BOTTLE_GLASS, 10)
    F.cyl(3.52, -11.58, 0.012, z + 1.07, z + 1.11, C_METAL_GOLD, 8)
    # 润滑剂瓶 (磨砂不锈钢 + 细管按压嘴)
    F.cyl(3.60, -11.58, 0.024, z + 0.96, z + 1.06, C_METAL_STEEL, 10)
    F.cyl(3.60, -11.58, 0.010, z + 1.06, z + 1.10, C_METAL_GOLD, 8)

    # (e) 南段：和光/爱语定制两阶墨绿天鹅绒贞操锁陈列展托
    # 展托外框金铜包边托盘
    F.box(3.20, -12.56, z + 0.96, 3.68, -11.66, z + 1.00, C_METAL_GOLD)
    # 第一阶墨绿天鹅绒衬底 (前低)
    F.box(3.21, -12.54, z + 0.99, 3.67, -11.68, z + 1.04, (0.12, 0.26, 0.18))
    # 第二阶墨绿天鹅绒台阶 (后高，贴东墙)
    F.box(3.44, -12.54, z + 1.04, 3.67, -11.68, z + 1.09, (0.12, 0.26, 0.18))
    F.box(3.43, -12.55, z + 1.03, 3.44, -11.67, z + 1.09, C_METAL_GOLD)

    # (f) 展托上三款高精度定制贞操锁具 (三种口径与制式)
    # 锁具1 (南位 y=-12.35)：短款微弯纯钛锁 (金色基础环 + 钛钢弯管 + 挂锁)
    F.cyl(3.33, -12.35, 0.040, z + 1.04, z + 1.06, C_METAL_GOLD, 12)
    F.cyl(3.33, -12.35, 0.024, z + 1.06, z + 1.14, C_METAL_STEEL, 12)
    F.box(3.31, -12.38, z + 1.07, 3.35, -12.32, z + 1.12, C_METAL_GOLD)
    # 锁具2 (中位 y=-12.02)：标准透气医用精钢笼 (双道加固环 + 栅格笼身 + 导尿插销)
    F.cyl(3.33, -12.02, 0.042, z + 1.04, z + 1.065, C_METAL_STEEL, 12)
    F.cyl(3.33, -12.02, 0.026, z + 1.065, z + 1.16, C_METAL_STEEL, 12)
    F.box(3.29, -12.04, z + 1.08, 3.37, -12.00, z + 1.14, (0.25, 0.27, 0.30))
    F.box(3.31, -12.08, z + 1.06, 3.35, -12.04, z + 1.11, C_METAL_GOLD)
    # 锁具3 (北位 y=-11.72，后高阶)：重型黑钛分段锁 (黑钛卡环 + 实体主壳 + 独立激光刻号铜牌)
    F.cyl(3.55, -11.72, 0.045, z + 1.09, z + 1.12, C_METAL_IRON, 12)
    F.cyl(3.55, -11.72, 0.028, z + 1.12, z + 1.20, C_METAL_IRON, 12)
    F.box(3.52, -11.76, z + 1.12, 3.58, -11.68, z + 1.18, C_METAL_GOLD)

    # (g) 专属天鹅绒钥匙托盘与主奴黄铜密钥
    F.box(3.24, -11.63, z + 1.04, 3.40, -11.48, z + 1.07, C_METAL_GOLD)
    F.box(3.25, -11.62, z + 1.06, 3.39, -11.49, z + 1.09, (0.12, 0.26, 0.18))
    # 交叉摆放的主奴黄铜密钥对
    F.box(3.28, -11.60, z + 1.09, 3.36, -11.51, z + 1.105, C_METAL_GOLD)
    F.cyl(3.34, -11.53, 0.012, z + 1.09, z + 1.11, C_METAL_GOLD, 8)

    # (5) 东墙中北侧：主人专属入墙式器具密柜 & UV-C 恒温精油吧台 (Armamentarium Vitrine)
    # (a) 内缩式黑胡桃木踢脚与柜体框架
    F.box(3.24, -10.18, z + 0.10, 3.66, -8.22, z + 0.18, C_WOOD_WALNUT)
    # 到顶碳化黑胡桃木主柜体与两侧收口门套
    F.box(3.22, -10.20, z + 0.18, 3.68, -8.20, z + 2.70, C_WOOD_WALNUT)

    # (b) 下部双门 UV-C 杀菌抽屉组 (黑色碳钛面板 + 活化荧光除菌狭缝)
    F.box(3.20, -10.16, z + 0.18, 3.22, -8.24, z + 0.86, (0.12, 0.12, 0.13))
    # 抽屉接缝处溢出的 UV-C 荧光青色活化除菌光带 (指示杀菌进行中)
    F.box(3.195, -10.12, z + 0.51, 3.210, -8.28, z + 0.53, C_ETHER_CYAN)
    # 两组拉丝金铜抽屉长拉手
    F.box(3.185, -9.70, z + 0.64, 3.200, -9.40, z + 0.66, C_METAL_GOLD)
    F.box(3.185, -9.00, z + 0.64, 3.200, -8.70, z + 0.66, C_METAL_GOLD)
    F.box(3.185, -9.70, z + 0.32, 3.200, -9.40, z + 0.34, C_METAL_GOLD)
    F.box(3.185, -9.00, z + 0.32, 3.200, -8.70, z + 0.34, C_METAL_GOLD)

    # (c) 中段：恒温精油调配吧台面与温控精油瓶
    F.box(3.18, -10.18, z + 0.86, 3.70, -8.22, z + 0.90, C_METAL_STEEL)
    # 精油瓶恒温凹槽底座与温度数显条 (恒定 38.5℃)
    F.box(3.30, -8.70, z + 0.90, 3.62, -8.30, z + 0.93, C_METAL_IRON)
    F.box(3.295, -8.55, z + 0.91, 3.305, -8.45, z + 0.925, C_ETHER_CYAN)
    # 双联温控精油按压瓶 (深琥珀避光瓶体 + 金铜泵头)
    F.cyl(3.38, -8.58, 0.032, z + 0.93, z + 1.06, C_BOTTLE_GLASS, 12)
    F.cyl(3.38, -8.58, 0.012, z + 1.06, z + 1.11, C_METAL_GOLD, 8)
    F.cyl(3.52, -8.58, 0.032, z + 0.93, z + 1.06, C_BOTTLE_GLASS, 12)
    F.cyl(3.52, -8.58, 0.012, z + 1.06, z + 1.11, C_METAL_GOLD, 8)

    # (d) 上部：珠宝级发光玻璃壁龛与精编皮鞭军械陈列架 (展出4款不同惩诫级刑具)
    # 壁龛发光背板 (深蓝漫反射背景 + 顶照聚光)
    F.box(3.64, -10.12, z + 0.92, 3.67, -8.28, z + 2.62, C_SCREEN_GLOW)
    # 壁龛外侧超白钢化玻璃移门框
    F.box(3.22, -10.16, z + 0.92, 3.24, -8.24, z + 2.64, C_GLASS_CYAN)
    # 壁龛内部两道横向金铜挂杆与挂钩
    F.box(3.40, -10.12, z + 1.48, 3.42, -8.28, z + 1.50, C_METAL_GOLD)
    # 4 款挂墙精编惩诫用具 (从南至北按严苛度陈列，剖切视角全景可见)
    # 器具1 (y=-9.85)：细马鞭 (金雕马头柄 + 挺拔纤维编织杆 + 双层皮拍梢)
    F.cyl(3.38, -9.85, 0.014, z + 1.36, z + 1.48, C_METAL_GOLD, 8)
    F.cyl(3.38, -9.85, 0.007, z + 1.08, z + 1.36, C_LEATHER_DK, 8)
    F.box(3.36, -9.87, z + 1.00, 3.40, -9.83, z + 1.08, C_LEATHER_RD)
    # 器具2 (y=-9.45)：24尾纯袋鼠皮散鞭 (重型滚花握柄 + 双道铜箍 + 密集深红散须)
    F.cyl(3.38, -9.45, 0.018, z + 1.34, z + 1.48, C_METAL_GOLD, 10)
    F.box(3.34, -9.50, z + 1.02, 3.42, -9.40, z + 1.34, C_CARPET_BURGUNDY)
    # 器具3 (y=-9.05)：宽幅厚牛皮受诫打手板 (车削实木握把 + 铆钉冲孔拍面)
    F.cyl(3.38, -9.05, 0.012, z + 1.32, z + 1.47, C_WOOD_WALNUT, 8)
    F.box(3.34, -9.09, z + 1.02, 3.42, -9.01, z + 1.32, C_LEATHER_DK)
    F.cyl(3.38, -9.05, 0.006, z + 1.15, z + 1.17, C_METAL_GOLD, 8)
    # 器具4 (y=-8.65)：加厚双面反光皮拍 (黑胡桃包覆手柄 + 勃艮第红皮面)
    F.cyl(3.38, -8.65, 0.014, z + 1.34, z + 1.48, C_METAL_GOLD, 8)
    F.box(3.35, -8.70, z + 1.04, 3.41, -8.60, z + 1.34, C_LEATHER_RD)

    # (6) 北侧主人观摩与品茗专区：高背翼耳扶手单人沙发、雪茄圆几、落地灯与急停按钮
    # (a) 主人复古摔纹厚牛皮高背翼耳椅 (面向观摩窗与调教皮榻)
    # 黑胡桃木四脚锥形倾斜实木腿
    for fx, fy in ((2.26, -7.62), (2.89, -7.62), (2.26, -6.78), (2.89, -6.78)):
        F.cyl(fx, fy, 0.025, z + 0.10, z + 0.35, C_WOOD_WALNUT, 8)
    # 实木底托边框
    F.box(2.22, -7.66, z + 0.32, 2.93, -6.74, z + 0.38, C_WOOD_WALNUT)
    # 墨绿摔纹厚牛皮坐垫 (厚实加深双密度海绵)
    F.box(2.24, -7.64, z + 0.38, 2.91, -6.76, z + 0.56, (0.18, 0.26, 0.20))
    # 左右双侧卷边宽幅扶手 (带金铜铆钉修边)
    F.box(2.20, -7.66, z + 0.52, 2.32, -6.78, z + 0.78, (0.18, 0.26, 0.20))
    F.box(2.83, -7.66, z + 0.52, 2.95, -6.78, z + 0.78, (0.18, 0.26, 0.20))
    for ny in (-7.55, -7.30, -7.05):
        F.cyl(2.20, ny, 0.008, z + 0.76, z + 0.78, C_METAL_GOLD, 8)
        F.cyl(2.95, ny, 0.008, z + 0.76, z + 0.78, C_METAL_GOLD, 8)
    # 钻石拉扣高背靠枕与双侧包围式翼耳 (标高最高至 z+1.35)
    F.box(2.24, -6.84, z + 0.56, 2.91, -6.70, z + 1.35, (0.18, 0.26, 0.20))
    # 翼耳左右前倾侧挡
    F.box(2.20, -7.05, z + 0.95, 2.28, -6.84, z + 1.35, (0.18, 0.26, 0.20))
    F.box(2.87, -7.05, z + 0.95, 2.95, -6.84, z + 1.35, (0.18, 0.26, 0.20))
    # 靠背中央勃艮第红丝绸腰枕
    F.box(2.36, -6.90, z + 0.56, 2.79, -6.82, z + 0.74, C_CARPET_BURGUNDY)

    # (b) 黑胡桃木雪茄圆几 (车削实木主柱与圆形台面)
    F.cyl(1.85, -7.20, 0.20, z + 0.10, z + 0.14, C_WOOD_WALNUT, 16)
    F.cyl(1.85, -7.20, 0.04, z + 0.14, z + 0.58, C_WOOD_WALNUT, 12)
    F.cyl(1.85, -7.20, 0.28, z + 0.58, z + 0.62, C_WOOD_WALNUT, 20)
    # 几面上置：10寸全息触控平板 (黑钛外框 + 幽蓝控制界面)
    F.box(1.72, -7.32, z + 0.62, 1.96, -7.10, z + 0.64, C_METAL_IRON)
    F.box(1.74, -7.30, z + 0.64, 1.94, -7.12, z + 0.655, C_ETHER_CYAN)
    # 切角透光威士忌水晶杯 (注入琥珀色麦芽威士忌)
    F.cyl(1.98, -7.30, 0.035, z + 0.62, z + 0.70, C_GLASS_CYAN, 12)
    F.cyl(1.98, -7.30, 0.028, z + 0.63, z + 0.67, C_METAL_GOLD, 10)
    # 实心黄铜雪茄烟灰缸与雪茄
    F.cyl(1.75, -7.06, 0.040, z + 0.62, z + 0.65, C_METAL_GOLD, 12)
    F.box(1.71, -7.08, z + 0.65, 1.83, -7.04, z + 0.67, (0.24, 0.16, 0.10))

    # (c) 复古立式落地阅读/聚光铜灯
    # 铸铜圆台梯级底座
    F.cyl(3.10, -6.80, 0.13, z + 0.10, z + 0.14, C_METAL_GOLD, 12)
    F.cyl(3.10, -6.80, 0.08, z + 0.14, z + 0.17, C_METAL_GOLD, 10)
    # 纤细纯铜立柱杆
    F.cyl(3.10, -6.80, 0.014, z + 0.17, z + 1.85, C_METAL_GOLD, 8)
    # 倒锥形墨绿搪瓷金属灯罩与金铜调节铰链
    F.cyl(3.10, -6.80, 0.13, z + 1.74, z + 1.88, (0.18, 0.26, 0.20), 12)
    F.cyl(3.10, -6.80, 0.06, z + 1.70, z + 1.74, (0.96, 0.88, 0.65), 10)

    # (d) 主人专属一键物理紧急脱扣拍钮 (Fail-Safe Mushroom Button)
    # 沙发右手边独立实木圆柱台 (触手可及，人体工学紧急保障)
    F.cyl(2.08, -7.52, 0.055, z + 0.10, z + 0.58, C_WOOD_WALNUT, 12)
    # 金色机械自锁法兰盘底座
    F.cyl(2.08, -7.52, 0.045, z + 0.58, z + 0.62, C_METAL_GOLD, 12)
    # 醒目鲜红大蘑菇头应急自锁拍钮 (拍下瞬间释放全屋电磁拘束)
    F.cyl(2.08, -7.52, 0.038, z + 0.62, z + 0.67, C_RED_EMERG, 12)

    # ========================================================================
    # 4. 性技巧训练室 B1-C04 (3.75..6.9, -14..-6)
    # ========================================================================
    # 多角度电动翻转实训床
    F.cyl(5.1, -10.5, 0.25, z + 0.10, z + 0.45, C_METAL_STEEL, 16)
    F.box(4.55, -11.7, z + 0.45, 5.65, -9.3, z + 0.75, C_LEATHER_RD)
    F.box(4.60, -11.6, z + 0.75, 5.60, -10.5, z + 0.90, C_LEATHER_DK)
    F.box(4.70, -9.7, z + 0.75, 5.50, -9.4, z + 0.82, C_PILLOW_WHITE)
    F.box(4.50, -10.6, z + 0.75, 5.70, -10.4, z + 0.85, C_METAL_GOLD)

    # 阶梯式软包骑乘模拟鞍马
    F.box(3.95, -11.9, z + 0.10, 4.40, -9.1, z + 0.85, C_LEATHER_RD)
    F.box(4.00, -11.8, z + 0.85, 4.35, -9.2, z + 1.00, C_LEATHER_DK)

    # 东侧机械臂实训柱与自动润滑冲洗管线台
    F.box(6.35, -13.4, z + 0.04, 6.78, -9.6, z + 2.24, C_METAL_STEEL)
    F.box(6.40, -13.3, z + 0.44, 6.75, -9.7, z + 2.19, C_ETHER_CYAN)

    # 教学演示终端与 UV-C 快速灭菌柜
    F.box(3.9, -8.2, z + 0.04, 4.5, -6.8, z + 0.89, C_WHITE_CAB)
    F.box(3.95, -8.1, z + 0.89, 4.45, -6.9, z + 1.49, C_SCREEN_GLOW)

    # 全身水银镜面墙与天然实木平衡把杆
    F.box(4.0, -13.68, z + 0.2, 6.6, -13.62, z + 2.8, C_GLASS_CYAN)
    F.box(4.0, -13.55, z + 0.85, 6.6, -13.50, z + 0.90, C_WOOD_WALNUT)
    F.box(4.0, -13.55, z + 1.10, 6.6, -13.50, z + 1.15, C_WOOD_WALNUT)

    # ========================================================================
    # 5. 体能训练室 B1-C03 (-8..-2, -3..7)
    # ========================================================================
    # 加固型格斗擂台 (高 0.25m 基座 + 灰色帆布面 + 4角红蓝白立柱 + 3道围绳)
    F.box(-7.5, 3.3, z + 0.04, -4.3, 6.5, z + 0.29, C_METAL_IRON)
    F.box(-7.45, 3.35, z + 0.29, -4.35, 6.45, z + 0.32, C_MAT_SPARRING)
    # 4角柱：红角、蓝角、双白角
    F.cyl(-7.4, 3.4, 0.06, z + 0.29, z + 1.89, (0.75, 0.10, 0.10), 10)  # 红角
    F.cyl(-4.4, 6.4, 0.06, z + 0.29, z + 1.89, (0.10, 0.25, 0.75), 10)  # 蓝角
    F.cyl(-4.4, 3.4, 0.06, z + 0.29, z + 1.89, (0.85, 0.85, 0.85), 10)  # 白角
    F.cyl(-7.4, 6.4, 0.06, z + 0.29, z + 1.89, (0.85, 0.85, 0.85), 10)  # 白角
    for rz in (z + 0.79, z + 1.24, z + 1.69):
        F.box(-7.38, 3.42, rz - 0.02, -4.42, 6.38, rz + 0.02, C_LEATHER_RD)
    F.box(-4.3, 3.4, z + 0.04, -3.9, 4.2, z + 0.29, C_METAL_STEEL)   # 台阶

    # 重型武器架与体能刑罚锁链架
    F.box(-3.65, 3.6, z + 0.04, -2.35, 6.5, z + 2.34, C_WOOD_WALNUT)
    for wy in (3.9, 4.5, 5.1, 5.7, 6.3):
        F.box(-3.5, wy - 0.03, z + 0.44, -2.5, wy + 0.03, z + 2.14, C_WOOD_OAK)
        F.box(-3.55, wy - 0.05, z + 2.14, -2.45, wy + 0.05, z + 2.22, C_METAL_GOLD)

    # 重型深蹲龙门架与倒吊腹肌斜板
    F.box(-7.6, -0.5, z + 0.04, -6.4, 1.2, z + 2.34, C_METAL_IRON)
    F.box(-7.5, 0.3, z + 1.24, -6.5, 0.4, z + 1.32, C_METAL_STEEL)
    F.cyl(-7.4, 0.35, 0.20, z + 1.09, z + 1.49, C_METAL_IRON, 16)
    F.cyl(-6.6, 0.35, 0.20, z + 1.09, z + 1.49, C_METAL_IRON, 16)
    F.box(-7.6, 1.4, z + 0.04, -6.4, 2.5, z + 0.59, C_LEATHER_DK)

    # 悬挂重型生牛皮沙袋 (万向节与粗铁链)
    F.cyl(-3.0, 0.2, 0.28, z + 0.9, z + 2.3, C_LEATHER_DK, 16)
    F.cyl(-3.0, 0.2, 0.02, z + 2.3, z + 3.4, C_METAL_STEEL, 8)
    F.cyl(-3.0, 1.8, 0.28, z + 0.9, z + 2.3, C_LEATHER_RD, 16)
    F.cyl(-3.0, 1.8, 0.02, z + 2.3, z + 3.4, C_METAL_STEEL, 8)

    # 体能监测中控台与战力测评站
    F.box(-7.6, -2.6, z + 0.04, -6.4, -1.3, z + 0.99, C_METAL_IRON)
    F.box(-7.5, -2.5, z + 0.99, -6.5, -1.4, z + 1.59, C_SCREEN_GLOW)

    # ========================================================================
    # 6. 恒温酒窖 B1-C05 (-14..-8, -3..2)
    # ========================================================================
    # 双面到顶老白橡酒架框架
    F.box(-13.7, 1.2, z + 0.04, -8.3, 1.8, z + 3.24, C_WOOD_WALNUT)
    F.box(-13.7, -2.6, z + 0.04, -13.0, 1.0, z + 3.24, C_WOOD_WALNUT)
    # 6层展示层板 + 横卧红酒瓶阵列 (深绿瓶身 + 金红热缩锡箔帽)
    for bz in np.linspace(z + 0.49, z + 2.99, 6):
        F.box(-13.65, 1.25, bz - 0.02, -8.35, 1.75, bz + 0.02, C_WOOD_OAK)
        F.box(-13.65, -2.5, bz - 0.02, -13.05, 0.9, bz + 0.02, C_WOOD_OAK)
        for bx in np.linspace(-13.2, -8.7, 8):
            F.cyl(bx, 1.45, 0.04, bz + 0.02, bz + 0.20, C_BOTTLE_GLASS, 8)
            F.cyl(bx, 1.45, 0.015, bz + 0.20, bz + 0.26, C_METAL_GOLD, 6)
        for by in np.linspace(-2.2, 0.6, 5):
            F.cyl(-13.35, by, 0.04, bz + 0.02, bz + 0.20, C_BOTTLE_GLASS, 8)
            F.cyl(-13.35, by, 0.015, bz + 0.20, bz + 0.26, C_METAL_GOLD, 6)
    # 波尔多陈酿橡木桶 x3
    for ty in (-1.8, -0.6, 0.6):
        F.cyl(-8.8, ty, 0.35, z + 0.04, z + 0.89, C_WOOD_OAK, 16)
        F.cyl(-8.8, ty, 0.36, z + 0.19, z + 0.26, C_METAL_IRON, 16)
        F.cyl(-8.8, ty, 0.36, z + 0.66, z + 0.73, C_METAL_IRON, 16)
    # 恒温恒湿机组与全景观察视窗
    F.box(-13.7, -2.8, z + 0.04, -9.0, -2.1, z + 2.54, C_WHITE_CAB)
    F.box(-13.6, -2.78, z + 0.24, -9.1, -2.12, z + 2.44, C_GLASS_CYAN)
    # 劳伦黑金大理石品酒吧台
    F.box(-11.5, -0.7, z + 0.07, -9.5, 0.3, z + 0.95, C_WOOD_WALNUT)
    F.box(-11.6, -0.75, z + 0.95, -9.4, 0.35, z + 1.02, (0.12, 0.12, 0.12))
    for sx in (-11.2, -10.6, -10.0, -9.4):
        F.cyl(sx, -0.2, 0.18, z + 0.07, z + 0.79, C_LEATHER_RD, 12)
    F.box(-10.8, -0.3, z + 1.02, -10.2, -0.1, z + 1.32, C_GLASS_CYAN)

    # ========================================================================
    # 7. 更衣 / 淋浴间 (10..16, -14..-6)
    # ========================================================================
    F.box(10.35, -13.5, z + 0.04, 11.15, -7.3, z + 2.34, C_METAL_STEEL)
    F.box(11.65, -12.9, z + 0.04, 12.15, -7.9, z + 0.49, C_WOOD_OAK)
    F.box(13.6, -7.3, z + 0.04, 15.7, -6.3, z + 0.94, C_WHITE_CAB)
    F.box(13.7, -6.38, z + 1.14, 15.6, -6.32, z + 2.14, C_GLASS_CYAN)
    for sy in (-13.5, -12.5, -11.5, -10.5):
        F.box(13.6, sy, z + 0.07, 15.6, sy + 0.9, z + 2.47, C_GLASS_CYAN)
        F.cyl(14.6, sy + 0.45, 0.08, z + 2.27, z + 2.42, C_METAL_STEEL, 12)
    F.box(12.45, -13.5, z + 0.04, 13.25, -10.9, z + 0.89, C_METAL_STEEL)

    # ========================================================================
    # 8. B1 机电与设备间 (-2..20, -3..8)
    # ========================================================================
    F.box(-1.7, -2.0, z + 0.01, -0.6, 4.8, z + 2.41, C_METAL_IRON)
    F.box(0.6, 3.3, z + 0.01, 4.4, 6.7, z + 2.61, C_METAL_STEEL)
    F.box(6.2, 3.4, z + 0.01, 8.0, 6.6, z + 1.81, C_METAL_IRON)
    for gy in (3.8, 4.6, 5.4, 6.2):
        F.cyl(8.8, gy, 0.25, z + 0.01, z + 2.41, C_METAL_GOLD, 14)
    F.cyl(13.5, 4.9, 0.8, z + 0.01, z + 2.31, C_METAL_STEEL, 20)
    F.box(16.5, -2.2, z + 0.01, 19.5, 2.2, z + 2.41, C_METAL_IRON)


def build_b2_furn(F, z):
    # ========================================================================
    # 1. 地面材质分区与工业警戒标识 (严格阶梯式叠高 ≥0.03m + pad 无底面防共面撕裂)
    # ========================================================================
    # --- 惩罚室 B2-C01 地面：重载防滑钢板 (z..z+0.03)，警戒区底板 (z+0.03..z+0.06)，水牢周边黑黄 45度警戒斑马线 (z+0.06..z+0.09)
    F.pad(-9.8, -13.8, z, -5.2, -6.2, z + 0.03, (0.18, 0.19, 0.20))
    F.pad(-9.8, -13.8, z + 0.03, -8.2, -10.3, z + 0.06, C_HAZARD_YEL)
    F.pad(-9.7, -13.7, z + 0.06, -8.3, -10.4, z + 0.09, C_HAZARD_BLK)

    # --- 医疗与改造室 B2-C02 地面：无菌防滑浅灰青环氧地坪 (z..z+0.03)，白色无菌分界线 (z+0.03..z+0.06)，手术中心区 (z+0.06..z+0.09)
    F.pad(-4.8, -13.8, z, 1.1, -6.2, z + 0.03, C_FLOOR_EPOXY)
    F.pad(-3.0, -12.0, z + 0.03, -0.6, -8.6, z + 0.06, (0.92, 0.94, 0.94))
    F.pad(-2.9, -11.9, z + 0.06, -0.7, -8.7, z + 0.09, C_FLOOR_EPOXY)

    # --- 档案室 B2-C03 地面：防静电架空地板网格 (z..z+0.03)
    F.pad(10.2, -13.8, z, 15.8, -10.8, z + 0.03, C_FLOOR_GRID)

    # ========================================================================
    # 2. 惩罚室 B2-C01 (-10..-5, -14..-6)
    # ========================================================================
    # 西侧水牢沉箱蓄水池与加固钢笼 (防渗沉箱 + 深幽反光水面 + 悬挂钢笼 + 顶部滑轮 + 冷却机组)
    F.box(-9.6, -13.5, z + 0.10, -8.6, -11.8, z + 0.50, C_METAL_IRON)   # 沉箱挡水围堰
    F.box(-9.5, -13.4, z + 0.20, -8.7, -11.9, z + 0.45, (0.10, 0.18, 0.24)) # 冷冽深水面
    # 悬挂钢笼主体
    F.box(-9.5, -13.4, z + 0.55, -8.7, -11.9, z + 0.65, C_METAL_IRON) # 笼底
    F.box(-9.5, -13.4, z + 2.30, -8.7, -11.9, z + 2.40, C_METAL_IRON) # 笼顶
    for cx in np.linspace(-9.45, -8.75, 5):
        F.cyl(cx, -13.35, 0.02, z + 0.65, z + 2.30, C_METAL_STEEL, 6)
        F.cyl(cx, -11.95, 0.02, z + 0.65, z + 2.30, C_METAL_STEEL, 6)
    for cy in np.linspace(-13.35, -11.95, 5):
        F.cyl(-9.45, cy, 0.02, z + 0.65, z + 2.30, C_METAL_STEEL, 6)
        F.cyl(-8.75, cy, 0.02, z + 0.65, z + 2.30, C_METAL_STEEL, 6)
    # 顶部吊绳滑轮与工字梁
    F.box(-9.3, -12.8, z + 3.1, -8.9, -12.4, z + 3.3, C_METAL_GOLD)
    F.cyl(-9.1, -12.6, 0.015, z + 2.4, z + 3.1, C_METAL_STEEL, 6)
    # 低温冷冻换热机组与紫铜冷媒管
    F.box(-9.6, -11.5, z + 0.10, -8.6, -10.6, z + 1.5, C_METAL_IRON)
    F.box(-9.55, -11.45, z + 0.9, -8.65, -10.65, z + 1.45, C_SCREEN_GLOW)
    F.cyl(-8.9, -11.6, 0.03, z + 0.5, z + 1.2, C_METAL_GOLD, 8)

    # 中央重型铸铁约束立柱 (焊接法兰盘 + 四向锁链环扣)
    F.cyl(-7.3, -10.0, 0.25, z + 0.04, z + 3.6, C_METAL_IRON, 16)
    for rz in (z + 0.8, z + 1.4, z + 2.0, z + 2.6):
        F.cyl(-7.3, -10.0, 0.30, rz - 0.05, rz + 0.05, C_METAL_STEEL, 16)
        F.box(-7.65, -10.03, rz - 0.12, -6.95, -9.97, rz, C_METAL_STEEL)

    # 生铁圣安德鲁十字架 (重型 A 构架斜撑 + 软包真皮衬垫 + 4端旋转锁扣)
    F.box(-7.8, -11.0, z + 0.04, -6.8, -9.0, z + 0.12, C_METAL_IRON)
    F.box(-7.5, -10.2, z + 0.12, -7.1, -9.8, z + 2.5, C_WOOD_WALNUT)
    F.box(-7.7, -10.1, z + 1.1, -6.9, -9.9, z + 1.4, C_WOOD_WALNUT)
    F.box(-7.45, -10.18, z + 0.2, -7.15, -9.82, z + 2.45, C_LEATHER_RD)
    F.box(-7.65, -10.08, z + 1.15, -6.95, -9.92, z + 1.35, C_LEATHER_RD)
    for cx, cz in ((-7.5, z + 2.3), (-7.1, z + 2.3), (-7.5, z + 0.5), (-7.1, z + 0.5)):
        F.box(cx - 0.06, -10.15, cz - 0.06, cx + 0.06, -9.85, cz + 0.06, C_METAL_GOLD)

    # 皮鞭倾斜受诫台与北联微电击仪 (三段式机械可调 + 束缚皮带)
    F.box(-6.4, -13.3, z + 0.04, -5.5, -11.1, z + 0.29, C_METAL_IRON)
    F.box(-6.3, -13.2, z + 0.29, -5.6, -11.2, z + 0.76, C_LEATHER_DK)
    F.box(-6.3, -11.5, z + 0.76, -5.6, -11.1, z + 0.99, C_LEATHER_RD)
    F.box(-6.4, -11.0, z + 0.04, -5.5, -10.5, z + 0.99, C_METAL_STEEL)
    F.box(-6.35, -10.95, z + 0.99, -5.55, -10.55, z + 1.49, C_SCREEN_GLOW)

    # 通顶惩戒军械库展示橱窗与冷柜 (和光/爱语风)
    F.box(-5.75, -13.5, z + 0.04, -5.15, -8.6, z + 0.29, C_WOOD_WALNUT)
    F.box(-5.75, -13.5, z + 0.29, -5.15, -8.6, z + 2.64, C_GLASS_CYAN)
    F.box(-5.70, -13.45, z + 0.32, -5.20, -8.65, z + 2.59, C_ETHER_CYAN)

    # 地锚跪姿拘束排与羞辱展示台
    F.box(-8.5, -13.7, z + 0.04, -6.0, -12.7, z + 0.22, C_METAL_STEEL)
    for ax in (-8.0, -7.2, -6.5):
        F.box(ax - 0.08, -13.2, z + 0.22, ax + 0.08, -13.0, z + 0.30, C_METAL_GOLD)

    # 门旁惩罚记录监控终端与遥控主控箱
    F.box(-6.1, -8.0, z + 0.04, -5.2, -6.7, z + 0.99, C_METAL_IRON)
    F.box(-6.05, -7.9, z + 0.99, -5.25, -6.8, z + 1.59, C_SCREEN_GLOW)

    # ========================================================================
    # 3. 医疗与改造室 B2-C02 (-5..1.25, -14..-6)
    # ========================================================================
    # 双联立式以太生化恢复/培养舱 (八角防爆底盘 + 聚碳酸酯视窗 + 舱内仿生脊柱导轨与呼吸管路 + 顶部散热穹顶)
    for px in (-4.4, -3.3):
        F.cyl(px, -11.8, 0.55, z + 0.04, z + 0.39, C_METAL_STEEL, 16)
        F.cyl(px, -11.8, 0.50, z + 0.39, z + 2.44, C_GLASS_CYAN, 16)
        F.cyl(px, -11.8, 0.42, z + 0.39, z + 2.24, C_ETHER_CYAN, 16)
        # 舱内仿生脊椎固定导轨
        F.box(px - 0.08, -11.5, z + 0.54, px + 0.08, -11.4, z + 2.04, C_METAL_IRON)
        # 顶部冷凝散热穹顶与状态监控屏
        F.cyl(px, -11.8, 0.52, z + 2.44, z + 2.84, C_METAL_STEEL, 16)
        F.box(px - 0.2, -12.35, z + 2.49, px + 0.2, -12.28, z + 2.79, C_SCREEN_GLOW)
        F.cyl(px, -11.8, 0.06, z + 2.84, z + 3.6, C_METAL_IRON, 8)

    # 改造手术台与辅助机械臂 (多轴动力柱 + 分段人体工学皮垫 + 三联无影灯 + 监护仪)
    F.cyl(-1.8, -10.2, 0.4, z + 0.10, z + 0.35, C_METAL_STEEL, 16)
    F.box(-2.4, -11.2, z + 0.75, -1.2, -9.2, z + 0.88, C_LEATHER_DK)
    # 三联无影灯
    F.cyl(-1.8, -10.2, 0.08, z + 3.0, z + 3.6, C_METAL_STEEL, 8)
    F.box(-2.2, -10.3, z + 2.95, -1.4, -10.1, z + 3.05, C_METAL_STEEL)
    for lx in (-2.3, -1.8, -1.3):
        F.cyl(lx, -10.2, 0.22, z + 2.65, z + 2.75, C_WHITE_CAB, 12)
        F.cyl(lx, -10.2, 0.18, z + 2.63, z + 2.67, C_ETHER_CYAN, 12)
    # 悬臂监护仪双屏
    F.cyl(-2.5, -10.2, 0.04, z + 0.75, z + 1.7, C_METAL_STEEL, 8)
    F.box(-2.65, -10.35, z + 1.45, -2.15, -9.95, z + 1.75, C_SCREEN_GLOW)
    # 侧置不锈钢器械托盘
    F.box(-1.4, -10.3, z + 0.90, -1.0, -9.9, z + 0.95, C_METAL_STEEL)

    # 微电流神经调控柜与全身扫描拱门
    F.box(-4.6, -9.5, z + 0.04, -3.4, -7.7, z + 2.24, C_WHITE_CAB)
    F.box(-4.55, -9.4, z + 0.44, -3.45, -7.8, z + 2.14, C_SCREEN_GLOW)

    # 无菌器械洗消台与药品恒温冷柜
    F.box(0.35, -13.5, z + 0.04, 1.15, -7.6, z + 0.94, C_WHITE_CAB)
    F.box(0.40, -13.4, z + 0.94, 1.10, -7.7, z + 2.24, C_GLASS_CYAN)

    # 脑波监测全息终端与医生调教站
    F.box(-4.6, -7.4, z + 0.04, -3.0, -6.4, z + 0.89, C_METAL_STEEL)
    F.box(-4.5, -7.3, z + 0.89, -3.1, -6.5, z + 1.49, C_SCREEN_GLOW)

    # ========================================================================
    # 4. 档案室 B2-C03 (10..16, -14..-10.67)
    # ========================================================================
    # 北墙 42U 密闭高密服务器机柜群 (阵列指示灯与黄色跳线槽)
    F.box(10.5, -13.5, z + 0.04, 15.5, -12.7, z + 2.44, C_METAL_IRON)
    for fx in (11.2, 12.5, 13.8, 14.8):
        F.box(fx - 0.08, -12.72, z + 0.84, fx + 0.08, -12.68, z + 2.24, C_SCREEN_GLOW)
    F.box(10.4, -12.6, z + 2.45, 15.6, -12.4, z + 2.55, C_HAZARD_YEL)
    F.box(10.45, -12.15, z + 0.04, 11.15, -10.95, z + 2.34, C_METAL_IRON)
    F.box(10.50, -12.10, z + 0.34, 11.10, -11.00, z + 2.24, C_SCREEN_GLOW)
    F.box(14.85, -12.15, z + 0.04, 15.55, -10.95, z + 0.94, C_METAL_GOLD)
    F.box(14.85, -12.15, z + 0.94, 15.55, -10.95, z + 1.84, C_GLASS_CYAN)
    F.box(12.3, -12.0, z + 0.04, 13.7, -11.1, z + 0.79, C_WOOD_WALNUT)
    F.box(12.5, -11.8, z + 0.79, 13.5, -11.3, z + 1.29, C_SCREEN_GLOW)
    F.box(12.6, -11.0, z + 0.04, 13.4, -10.6, z + 1.14, C_LEATHER_DK)

    # ========================================================================
    # 5. 储藏室 B2-C04 (10..16, -10.67..-6)
    # ========================================================================
    F.box(10.45, -10.4, z + 0.01, 11.25, -6.5, z + 2.61, C_METAL_STEEL)
    F.box(14.75, -10.4, z + 0.01, 15.55, -6.5, z + 2.61, C_METAL_STEEL)
    # 紧急医疗急救站 EQ-51 (加厚挂墙双门防爆箱 + 绿色医疗十字 + 双天蓝氧气瓶)
    F.box(11.6, -10.5, z + 0.81, 14.4, -9.7, z + 2.01, C_WHITE_CAB)
    F.box(12.7, -10.52, z + 1.26, 13.3, -10.48, z + 1.56, (0.15, 0.72, 0.32))
    F.box(12.85, -10.52, z + 1.11, 13.15, -10.48, z + 1.71, (0.15, 0.72, 0.32))
    F.cyl(13.8, -10.1, 0.08, z + 0.01, z + 0.86, (0.25, 0.65, 0.85), 12)
    F.cyl(14.1, -10.1, 0.08, z + 0.01, z + 0.86, (0.25, 0.65, 0.85), 12)
    # 中央开箱检修岛台
    F.box(12.35, -8.75, z + 0.01, 13.65, -7.45, z + 0.86, C_METAL_STEEL)

    # ========================================================================
    # 6. 结界发生器室 / 机电设备间 (-14..4, -3..8)
    # ========================================================================
    # 以太结界共鸣核心装置：八角防爆隔离环道 + 黄黑警戒圈 + 以太共鸣核心 + 四角高压绝缘导流柱
    F.box(-6.8, 1.2, z + 0.01, -3.2, 4.8, z + 0.86, C_METAL_IRON)
    F.box(-6.6, 1.4, z + 0.86, -3.4, 4.6, z + 0.89, C_HAZARD_YEL)
    # 中央发电机超导电枢柱与以太脉冲流
    F.cyl(-5.0, 3.0, 0.65, z + 0.01, z + 2.81, C_METAL_IRON, 16)
    F.cyl(-5.0, 3.0, 0.55, z + 1.01, z + 2.41, C_ETHER_CYAN, 16)
    # 3组超导磁体环圈
    for rz in (z + 0.81, z + 1.61, z + 2.41):
        F.cyl(-5.0, 3.0, 0.75, rz - 0.08, rz + 0.08, C_METAL_GOLD, 16)
    # 四角磁束能导流柱与绝缘瓷瓶
    for px, py in ((-6.4, 1.6), (-3.6, 1.6), (-6.4, 4.4), (-3.6, 4.4)):
        F.cyl(px, py, 0.16, z + 0.86, z + 3.0, C_METAL_GOLD, 12)
        for iz in (z + 1.21, z + 1.71, z + 2.21, z + 2.71):
            F.cyl(px, py, 0.22, iz - 0.04, iz + 0.04, (0.45, 0.18, 0.12), 12)
    # 实体 SCADA 工业操作控制台 (带仪表与急停蘑菇按钮)
    F.box(-7.6, -0.5, z + 0.01, -2.4, 0.5, z + 0.86, C_METAL_IRON)
    F.box(-7.5, -0.4, z + 0.86, -2.5, 0.4, z + 1.36, C_SCREEN_GLOW)
    F.cyl(-2.8, 0.2, 0.06, z + 0.86, z + 0.96, C_RED_EMERG, 8)
    # 中置式高压开关柜群
    F.box(-13.5, 3.4, z + 0.01, -9.5, 7.4, z + 2.41, C_METAL_STEEL)
    F.box(-13.5, -2.4, z + 0.01, -9.5, 1.6, z + 2.41, C_METAL_IRON)
    F.box(-0.6, 3.2, z + 0.01, 3.6, 7.6, z + 2.21, C_METAL_IRON)
    F.box(-0.6, -2.6, z + 0.01, 3.6, 1.8, z + 2.21, C_METAL_IRON)


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
                F.box(f[0], f[2], z + 0.01, f[1], f[3], z + furn_height(f), FURN)
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
