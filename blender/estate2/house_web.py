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

    def box(self, x0, y0, z0, x1, y1, z1, col, ao=None, cap_top=None, cap_bottom=None):
        if cap_bottom is None:
            cap_bottom = not any(abs(z0 - fl_z) < 0.015 for fl_z in (-9.0, -4.5, 0.0, 4.5, 9.0))
        if cap_top is None:
            cap_top = not any(abs(z1 - (fl_z + 4.2)) < 0.015 for fl_z in (-9.0, -4.5, 0.0, 4.5, 9.0))
        P = lambda x, y, z: (x, y, z)
        if cap_top:
            self.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), col)           # 顶
        if cap_bottom:
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

    def obox(self, p0, p1, t, z0, z1, col, ao=None, cap_top=None, cap_bottom=None):
        """沿 p0→p1 的墙段（厚 t，居中）。"""
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
        d = p1 - p0; L = np.linalg.norm(d)
        if L < 1e-4 or z1 - z0 < 1e-4:
            return
        u = d / L; n = np.array([-u[1], u[0]]) * t / 2
        A, B, C, D = p0 - n, p1 - n, p1 + n, p0 + n   # 底面四角（逆时针）
        V = lambda q, z: (q[0], q[1], z)
        if cap_bottom is None:
            cap_bottom = not any(abs(z0 - fl_z) < 0.015 for fl_z in (-9.0, -4.5, 0.0, 4.5, 9.0))
        if cap_top is None:
            cap_top = not any(abs(z1 - (fl_z + 4.2)) < 0.015 for fl_z in (-9.0, -4.5, 0.0, 4.5, 9.0))
        if cap_top:
            self.quad(V(A, z1), V(B, z1), V(C, z1), V(D, z1), col)
        if cap_bottom:
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

    def prism(self, poly, z0, z1, col, side_faces=True):
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
        if side_faces:
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
        M.obox(P(x), P(h0), t, z, z + WALL_H, col, z, cap_bottom=False, cap_top=False)
        if zb > 0:
            M.obox(P(h0), P(h1), t, z, z + zb, col, z, cap_bottom=False, cap_top=True)
        M.obox(P(h0), P(h1), t, z + zt, z + WALL_H, col, z, cap_bottom=True, cap_top=False)
        x = h1
    M.obox(P(x), P(L), t, z, z + WALL_H, col, z, cap_bottom=False, cap_top=False)


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
    M.box(x0, y0 + d - t, z, x0 + w, y0 + d, z + WALL_H, (0.72, 0.72, 0.72), z, cap_bottom=False, cap_top=False)
    M.box(x0, y0, z, x0 + t, y0 + d, z + WALL_H, (0.72, 0.72, 0.72), z, cap_bottom=False, cap_top=False)
    M.box(x0 + w - t, y0, z, x0 + w, y0 + d, z + WALL_H, (0.72, 0.72, 0.72), z, cap_bottom=False, cap_top=False)
    M.box(x0 + 0.2, y0 + 0.2, z + 0.05, x0 + w - 0.2, y0 + d - 0.2, z + 2.3, LIFT, cap_bottom=False)


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
        M.box(px - 0.6, py - 0.6, z, px + 0.6, py + 0.6, z + WALL_H, PIER, z, cap_bottom=False, cap_top=False)
    if fl.startswith('B'):   # 地下柱网（与 F1 墙线对齐）
        for px in (-20, -10, 0, 10, 20):
            for py in (-14, -6, -3, 8):
                if (px, py) in PIERS:
                    continue
                M.box(px - 0.35, py - 0.35, z, px + 0.35, py + 0.35, z + WALL_H, PIER, z, cap_bottom=False, cap_top=False)
    if fl == 'F3':   # 鼓座转换梁框 20 × 12 m（F3 顶板下）
        zt = z + WALL_H
        for (x0, y0, x1, y1) in ((-10, -9.4, 10, -8.6), (-10, 2.6, 10, 3.4), (-10.4, -9, -9.6, 3), (9.6, -9, 10.4, 3)):
            M.box(x0, y0, zt - 0.9, x1, y1, zt, PIER, cap_top=False)
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

# ---------------------------------------------------------------- 室内真实材质色板 (docs/eden-estate.md §6)
C_MARBLE_STATUARIO   = (0.95, 0.94, 0.92)  # #F2F0EC 卡拉拉白 (大厅、过厅、主浴室地面、壁炉)
C_MARBLE_NERO        = (0.015, 0.015, 0.016) # #1E1E20 黑金花 (棋盘格、饰带)
C_MARBLE_GOLD        = (0.88, 0.84, 0.77)  # #F1ECE2 卡拉卡塔金 (浴室墙面、台面、壁炉)
C_MARBLE_GREEN       = (0.07, 0.12, 0.09)  # #2F4A3C 阿尔卑斯绿 (绿厅壁炉)
C_MARBLE_SIENA       = (0.69, 0.47, 0.15)  # #D9B66E 西耶纳黄 (家徽镶嵌、餐室壁炉)
C_MARBLE_LEVANTO     = (0.19, 0.03, 0.03)  # #7A2E2A 勒万托红 (候见室壁炉)
C_PORPHYRY           = (0.15, 0.03, 0.04)  # #6B2E35 仿斑岩人造大理石 (大厅柱)
C_PARQUET_VERSAILLES = (0.38, 0.20, 0.07)  # #A57A4B 凡尔赛拼橡木
C_OAK_HERRINGBONE    = (0.35, 0.18, 0.06)  # 人字拼橡木
C_WOOD_MAHOGANY      = (0.11, 0.02, 0.01)  # #5E2A1A 桃花心木 (餐桌、衣柜、床架)
C_WOOD_SATINWOOD     = (0.68, 0.48, 0.18)  # #D8B777 缎木 (写字台、化妆台)
C_WOOD_EBONY         = (0.02, 0.015, 0.01) # #1C1512 乌木 (琴键、座圈、边饰)
C_WALL_PLASTER       = (0.80, 0.75, 0.63)  # #E9E1CF 奶油灰泥室内墙
C_WALL_PANEL         = (0.84, 0.79, 0.68)  # #EDE6D6 油漆护墙板
C_BRASS_ORMOLU       = (0.58, 0.36, 0.07)  # #C9A24B 鎏金铜 (吊灯、壁灯、爪足、线脚)
C_BRASS_POLISHED     = (0.46, 0.29, 0.05)  # #B5913F 抛光黄铜 (龙头、扶手、电梯)
C_FABRIC_DAMASK_RED  = (0.19, 0.015, 0.025)# #7B1E2B 深红丝缎锦 (会客厅、肖像廊、沙发)
C_FABRIC_SKY_BLUE    = (0.025, 0.05, 0.13) # #2C3E63 天城蓝丝 (餐厅、主人起居室、客房 A)
C_FABRIC_EMPIRE_GREEN= (0.03, 0.11, 0.07)  # #2F5D4E 帝政绿 (绿厅、客房 C)
C_FABRIC_ROSE_SILK   = (0.58, 0.32, 0.29)  # #C99A93 玫瑰粉丝 (客房 B)
C_FABRIC_CHAMPAGNE   = (0.60, 0.46, 0.26)  # #CDB58A 香槟丝绒 (沙发面料)
C_LINEN_IVORY        = (0.85, 0.80, 0.70)  # #EEE7D8 象牙亚麻 (窗纱、软包)
C_LINEN_WHITE        = (0.93, 0.90, 0.86)  # #F7F4EE 埃及棉床品
C_RUG_AUBUSSON       = (0.75, 0.65, 0.48)  # #E3D4B8 奥布松地毯象牙底
C_RUG_HERIZ          = (0.19, 0.025, 0.015)# #7A2A22 赫里兹地毯深红
C_PORCELAIN_WHITE    = (0.92, 0.90, 0.86)  # #F6F4EF 卫浴白瓷
C_SEVRES_BLUE        = (0.015, 0.05, 0.28) # #1F3F8F 塞夫尔蓝瓷
C_LIGHT_WARM2700     = (1.00, 0.88, 0.65)  # 2,700K 暖光灯芯发光色
C_LIGHT_WARM3000     = (1.00, 0.92, 0.75)  # 3,000K 服务间灯芯发光色


def add_chandelier(F, cx, cy, cz, r=1.0, arms=8, col_arm=C_BRASS_ORMOLU, light_col=C_LIGHT_WARM2700):
    """天花垂挂枝形吊灯 (实心铜链/吊杆 + 放射状灯臂 + 仿烛发光灯芯)。"""
    F.cyl(cx, cy, 0.04, cz, cz + 0.8, col_arm, 6)
    F.cyl(cx, cy, r * 0.25, cz - 0.04, cz + 0.08, col_arm, 8)
    for j in range(arms):
        ang = 2 * math.pi * j / arms
        ax = cx + r * math.cos(ang)
        ay = cy + r * math.sin(ang)
        F.box(min(cx, ax) - 0.015, min(cy, ay) - 0.015, cz, max(cx, ax) + 0.015, max(cy, ay) + 0.015, cz + 0.03, col_arm)
        F.cyl(ax, ay, 0.05, cz + 0.02, cz + 0.06, col_arm, 6)
        F.cyl(ax, ay, 0.025, cz + 0.06, cz + 0.20, light_col, 6)


def add_sconce(F, wx, wy, wz, nx, ny, col=C_BRASS_ORMOLU, light_col=C_LIGHT_WARM2700):
    """墙壁鎏金烛台式壁灯 (墙面底座 + 弯曲灯臂 + 暖光灯芯)。nx, ny 是朝室内的单位法向。"""
    F.box(wx - 0.08, wy - 0.08, wz - 0.12, wx + 0.08, wy + 0.08, wz + 0.12, col)
    ax, ay = wx + nx * 0.25, wy + ny * 0.25
    F.box(min(wx, ax) - 0.02, min(wy, ay) - 0.02, wz - 0.02, max(wx, ax) + 0.02, max(wy, ay) + 0.02, wz + 0.02, col)
    F.cyl(ax, ay, 0.05, wz, wz + 0.04, col, 6)
    F.cyl(ax, ay, 0.025, wz + 0.04, wz + 0.15, light_col, 6)


def add_fireplace(F, fx, fy, fz, w=2.2, d=0.6, h=1.4, orient='n', marble_col=C_MARBLE_STATUARIO):
    """经典雕花大理石壁炉 (炉架台面 + 左右壁柱 + 幽暗内膛)。orient 指炉口朝向。"""
    hw, hd = w / 2.0, d / 2.0
    F.box(fx - hw, fy - hd, fz + 0.01, fx + hw, fy + hd, fz + h, marble_col)
    if orient in ('n', 's'):
        pw = hw - 0.35
        y0 = fy if orient == 'n' else fy - hd - 0.01
        y1 = fy + hd + 0.01 if orient == 'n' else fy
        F.box(fx - pw, y0, fz + 0.01, fx + pw, y1, fz + h - 0.25, (0.08, 0.08, 0.09))
        F.box(fx - hw - 0.05, fy - hd - 0.05, fz + h, fx + hw + 0.05, fy + hd + 0.05, fz + h + 0.08, marble_col)
        dy = 0.5 if orient == 'n' else -0.5
        F.pad(fx - hw, min(fy, fy + dy), fz + 0.01, fx + hw, max(fy, fy + dy), fz + 0.04, marble_col)
    else:
        ph = hd - 0.35
        x0 = fx if orient == 'e' else fx - hw - 0.01
        x1 = fx + hw + 0.01 if orient == 'e' else fx
        F.box(x0, fy - ph, fz + 0.01, x1, fy + ph, fz + h - 0.25, (0.08, 0.08, 0.09))
        F.box(fx - hw - 0.05, fy - hd - 0.05, fz + h, fx + hw + 0.05, fy + hd + 0.05, fz + h + 0.08, marble_col)
        dx = 0.5 if orient == 'e' else -0.5
        F.pad(min(fx, fx + dx), fy - hd, fz + 0.01, max(fx, fx + dx), fy + hd, fz + 0.04, marble_col)


def add_table_lamp(F, tx, ty, tz, base_col=C_BRASS_POLISHED, shade_col=C_LIGHT_WARM2700):
    """书桌 / 床头台灯 (金属/瓷座 + 暖光漫射灯罩)。"""
    F.cyl(tx, ty, 0.08, tz, tz + 0.05, base_col, 8)
    F.cyl(tx, ty, 0.02, tz + 0.05, tz + 0.35, base_col, 6)
    F.cyl(tx, ty, 0.14, tz + 0.30, tz + 0.48, shade_col, 8)


def build_b1_furn(F, z):
    # ========================================================================
    # 1. 地面材质分区与地毯铺装 (严格阶梯式叠高 ≥0.03m + pad 无底面防共面撕裂)
    # ========================================================================
    # --- B1-C01 主调教室地面：金边地毯底板 (z+0.035..z+0.040)，中央提花天鹅绒深红地毯 + 马鞍皮防护地垫 (z+0.075..z+0.080)
    F.pad(-7.6, -12.4, z + 0.035, -2.4, -8.0, z + 0.040, C_CARPET_GOLD)
    F.pad(-7.4, -12.2, z + 0.075, -2.6, -8.2, z + 0.080, C_CARPET_BURGUNDY)
    F.pad(-8.2, -13.7, z + 0.075, -4.0, -12.3, z + 0.080, C_LEATHER_DK)

    # --- B1-C02 私人调教室地面：波斯羊毛金边地毯 (z+0.035..z+0.040)，深酒红毯芯 + 马鞍皮跑道 (z+0.075..z+0.080)
    F.pad(0.30, -13.65, z + 0.035, 3.50, -6.35, z + 0.040, C_CARPET_GOLD)
    F.pad(0.40, -13.55, z + 0.075, 3.40, -6.45, z + 0.080, C_CARPET_BURGUNDY)
    F.pad(0.70, -12.4, z + 0.075, 2.90, -8.4, z + 0.080, C_LEATHER_DK)

    # --- B1-C04 性技巧训练室地面：金边压条 (z+0.035..z+0.040)，灰蓝硅胶拉伸定位垫 (z+0.075..z+0.080)
    F.pad(4.25, -12.25, z + 0.035, 5.95, -8.75, z + 0.040, C_CARPET_GOLD)
    F.pad(4.30, -12.20, z + 0.075, 5.90, -8.80, z + 0.080, (0.24, 0.32, 0.38))

    # --- B1-C03 体能训练室地面：白色场馆边界线 (z+0.035..z+0.040)
    F.pad(-7.6, -2.6, z + 0.035, -7.5, 6.6, z + 0.040, (0.88, 0.88, 0.88))
    F.pad(-2.5, -2.6, z + 0.035, -2.4, 6.6, z + 0.040, (0.88, 0.88, 0.88))
    F.pad(-7.6, -2.6, z + 0.035, -2.4, -2.5, z + 0.040, (0.88, 0.88, 0.88))
    F.pad(-7.6, 6.5, z + 0.035, -2.4, 6.6, z + 0.040, (0.88, 0.88, 0.88))

    # --- B1-C05 恒温酒窖地面：品酒台织物地毯 (z+0.035..z+0.040)
    F.pad(-11.8, -1.0, z + 0.035, -9.2, 0.6, z + 0.040, (0.18, 0.26, 0.20))

    # --- 更衣 / 淋浴间地面：湿区淋浴间缅甸水润柚木防滑木格栅 (z+0.035..z+0.040)
    F.pad(13.4, -13.6, z + 0.035, 15.7, -9.6, z + 0.040, C_FLOOR_TEAK)

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
        F.box(-5.82, dy - 0.030, z + 0.45, -5.805, dy + 0.030, z + 0.51, C_METAL_STEEL)
        # 东侧外沿锚座与 D 环
        F.box(-4.205, dy - 0.045, z + 0.44, -4.190, dy + 0.045, z + 0.52, C_METAL_GOLD)
        F.box(-4.195, dy - 0.030, z + 0.45, -4.180, dy + 0.030, z + 0.51, C_METAL_STEEL)

    # (g) 重型镀铬八柱式龙门钢架 (角柱 + 顶部横梁 + 剖切位加固铜箍)
    for px, py in ((-5.80, -11.20), (-4.20, -11.20), (-5.80, -8.80), (-4.20, -8.80)):
        # 柱底法兰盘
        F.box(px - 0.06, py - 0.06, z + 0.10, px + 0.06, py + 0.06, z + 0.14, C_METAL_GOLD)
        # 镀铬方钢主立柱 (80x80mm 重型方柱)
        F.box(px - 0.035, py - 0.035, z + 0.14, px + 0.035, py + 0.035, z + 3.15, C_METAL_STEEL)
        # 中段标高加固套箍与挂环 (位于 z+1.44..z+1.50，剖切线直接可见)
        F.box(px - 0.048, py - 0.048, z + 1.44, px + 0.048, py + 0.048, z + 1.50, C_METAL_GOLD)
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
    F.box(-5.04, -10.04, z + 3.12, -4.96, -9.96, z + 3.16, C_METAL_STEEL)
    # 四点下垂航空钢缆与张力花兰螺丝 (延伸至床面上方操作高度，剖切面下完全可见)
    for rx, ry in ((-5.18, -10.20), (-4.82, -10.20), (-5.18, -9.80), (-4.82, -9.80)):
        F.box(rx - 0.005, ry - 0.005, z + 1.25, rx + 0.005, ry + 0.005, z + 3.12, C_METAL_STEEL)
        F.box(rx - 0.014, ry - 0.014, z + 1.22, rx + 0.014, ry + 0.014, z + 1.34, (0.80, 0.75, 0.65))
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


    # (4) 2.4 南侧主控指挥御座区与神经反馈控制中枢 (Master Throne & Neurofeedback / Edging Console Zone)
    # (a) 面向主床的姿态矫正跪台 (Posture Correction Kneeling Bench)
    F.box(-5.45, -12.25, z + 0.10, -4.55, -11.75, z + 0.32, C_WOOD_WALNUT)
    F.box(-5.40, -12.20, z + 0.32, -4.60, -11.80, z + 0.46, C_LEATHER_RD)
    F.box(-5.41, -12.21, z + 0.45, -4.59, -11.79, z + 0.48, C_LEATHER_DK)
    # 前端手部支撑把手横杆
    F.box(-5.30, -11.84, z + 0.48, -4.70, -11.80, z + 0.52, C_METAL_STEEL)

    # (b) 南侧主人主控指挥高背御座 (Master Command Throne)
    # 黑胡桃重型椅身骨架与四角金铜柱脚护套
    F.box(-5.55, -13.65, z + 0.10, -4.45, -12.75, z + 0.48, C_WOOD_WALNUT)
    for tx, ty in ((-5.54, -13.64), (-4.46, -13.64), (-5.54, -12.76), (-4.46, -12.76)):
        F.box(tx - 0.02, ty - 0.02, z + 0.10, tx + 0.02, ty + 0.02, z + 0.18, C_METAL_GOLD)
    # 勃艮第红厚牛皮坐垫
    F.box(-5.45, -13.55, z + 0.48, -4.55, -12.85, z + 0.62, C_LEATHER_RD)
    # 左右双侧卷边扶手与右手紧急脱扣拍钮
    F.box(-5.54, -13.55, z + 0.60, -5.42, -12.85, z + 0.74, C_LEATHER_DK)
    F.box(-4.58, -13.55, z + 0.60, -4.46, -12.85, z + 0.74, C_LEATHER_DK)
    F.box(-4.53, -13.05, z + 0.74, -4.47, -12.95, z + 0.79, C_RED_EMERG)
    # 高耸复古翼耳靠背 (到顶 z+1.46，剖切面立体呈现)
    F.box(-5.50, -13.65, z + 0.62, -4.50, -13.52, z + 1.46, C_WOOD_WALNUT)
    F.box(-5.42, -13.58, z + 0.64, -4.58, -13.50, z + 1.44, C_LEATHER_RD)
    F.box(-5.20, -13.52, z + 0.66, -4.80, -13.44, z + 0.78, C_CARPET_BURGUNDY)

    # (c) 寸止射精管理控制台与神经反馈电极中枢 (Edging Console & Neurofeedback Station)
    # 黑胡桃机柜与暗灰钛金属操作台面
    F.box(-7.65, -13.65, z + 0.10, -6.65, -12.65, z + 0.88, C_WOOD_WALNUT)
    F.box(-7.68, -13.68, z + 0.88, -6.62, -12.62, z + 0.92, C_METAL_STEEL)
    # 倾斜嵌入式全息触控监视屏 (显示微电流脉冲界面)
    F.box(-7.55, -13.55, z + 0.92, -6.85, -13.15, z + 1.32, C_SCREEN_GLOW)
    F.box(-7.50, -13.50, z + 1.00, -6.90, -13.20, z + 1.26, C_ETHER_CYAN)
    # 神经反馈屏蔽立柱与微电流旋钮面板
    F.box(-7.28, -12.90, z + 0.92, -7.12, -12.74, z + 1.48, C_METAL_STEEL)
    F.box(-7.30, -12.85, z + 1.12, -7.10, -12.79, z + 1.35, C_METAL_GOLD)
    F.box(-7.25, -12.85, z + 1.35, -7.15, -12.75, z + 1.46, C_METAL_GOLD)

    # (3) 2.3 西侧强迫屈服与体能区 (West Forced Submission & Gravity Rig Zone)
    # (a) 重型审讯屈服椅 / 电动分腿拘束椅 (旋转铸铁底盘 + 会阴压迫槽 + 铰接手铐扶手 + 枕颈圈)
    # 加重旋转铸铁底盘
    F.box(-9.45, -10.75, z + 0.10, -8.55, -10.05, z + 0.22, C_METAL_IRON)
    # 中心液压升降立柱与阻尼锁紧手柄
    F.box(-9.06, -10.46, z + 0.22, -8.94, -10.34, z + 0.52, C_METAL_STEEL)
    F.box(-9.05, -10.45, z + 0.42, -8.95, -10.35, z + 0.46, C_METAL_GOLD)
    # 黑胡桃实木椅身底框与双踝固定托架
    F.box(-9.40, -10.70, z + 0.52, -8.60, -10.10, z + 0.60, C_WOOD_WALNUT)
    # 双侧外展脚踝固定皮环 (带金扣)
    F.box(-9.45, -10.25, z + 0.26, -9.35, -10.15, z + 0.38, C_LEATHER_DK)
    F.box(-8.65, -10.25, z + 0.26, -8.55, -10.15, z + 0.38, C_LEATHER_DK)
    F.box(-9.46, -10.26, z + 0.30, -9.34, -10.14, z + 0.34, C_METAL_GOLD)
    F.box(-8.66, -10.26, z + 0.30, -8.54, -10.14, z + 0.34, C_METAL_GOLD)

    # 凹陷马鞍分腿皮垫与会阴压迫电极槽
    F.box(-9.35, -10.65, z + 0.60, -8.65, -10.15, z + 0.70, C_LEATHER_RD)
    F.box(-9.05, -10.55, z + 0.68, -8.95, -10.25, z + 0.72, C_METAL_GOLD)

    # 左右双侧金属宽扶手与一体化内置手铐
    for ax in (-9.48, -8.52):
        F.box(ax - 0.05, -10.60, z + 0.72, ax + 0.05, -10.05, z + 0.79, C_METAL_STEEL)
        F.box(ax - 0.04, -10.18, z + 0.79, ax + 0.04, -10.08, z + 0.85, C_METAL_GOLD)

    # 高耸硬质拘束靠背板与胸腹交叉加宽约束带
    F.box(-9.32, -10.82, z + 0.60, -8.68, -10.68, z + 1.46, C_LEATHER_DK)
    # 胸部与骨盆横向约束带 (带金扣)
    F.box(-9.34, -10.83, z + 0.88, -8.66, -10.67, z + 0.94, C_LEATHER_RD)
    F.box(-9.34, -10.83, z + 1.12, -8.66, -10.67, z + 1.18, C_LEATHER_RD)
    F.box(-9.06, -10.84, z + 0.89, -8.94, -10.66, z + 0.93, C_METAL_GOLD)
    F.box(-9.06, -10.84, z + 1.13, -8.94, -10.66, z + 1.17, C_METAL_GOLD)
    # 顶部可升降锁头枕颈圈 (拉丝金铜伸缩臂)
    F.box(-9.18, -10.80, z + 1.28, -8.82, -10.70, z + 1.42, C_LEATHER_RD)
    F.box(-9.20, -10.81, z + 1.32, -9.16, -10.69, z + 1.38, C_METAL_GOLD)
    F.box(-8.84, -10.81, z + 1.32, -8.80, -10.69, z + 1.38, C_METAL_GOLD)

    # (b) 倒吊重力靴单杠与反向脊柱拉伸架 (Gravity Inversion Bar & Traction Rig)
    # 防滑格斗缓冲地垫
    F.box(-9.60, -13.55, z + 0.10, -8.40, -12.35, z + 0.16, C_MAT_SPARRING)
    # 重型冷轧黑钛双立柱 (西柱与东柱)
    for lx in (-9.45, -8.55):
        F.box(lx - 0.06, -13.46, z + 0.16, lx + 0.06, -13.34, z + 0.22, C_METAL_IRON)
        F.box(lx - 0.038, -13.438, z + 0.22, lx + 0.038, -13.362, z + 2.80, C_METAL_IRON)
    # 剖切线醒目加固中位横杆与挂环 (位于 z+1.44..z+1.50，剖切状态完全贯通)
    F.box(-9.48, -13.44, z + 1.44, -8.52, -13.36, z + 1.50, C_METAL_GOLD)
    F.box(-9.15, -13.43, z + 1.38, -9.05, -13.37, z + 1.44, C_METAL_GOLD)
    F.box(-8.95, -13.43, z + 1.38, -8.85, -13.37, z + 1.44, C_METAL_GOLD)

    # 顶部镀铬倒挂横梁与悬挂的重力靴配件
    F.box(-9.50, -13.44, z + 2.56, -8.50, -13.36, z + 2.66, C_METAL_STEEL)
    # 双只倒吊重力靴 (倒置钢钩 + 鞍皮护套 + 双联金扣)
    for bx in (-9.15, -8.85):
        F.box(bx - 0.02, -13.43, z + 2.45, bx + 0.02, -13.37, z + 2.56, C_METAL_STEEL)
        F.box(bx - 0.06, -13.44, z + 2.22, bx + 0.06, -13.36, z + 2.45, C_LEATHER_DK)
        F.box(bx - 0.07, -13.45, z + 2.28, bx + 0.07, -13.35, z + 2.38, C_METAL_GOLD)

    # 反向脊柱牵引拉伸斜板 (斜向支撑于双柱前，坡度延伸至剖切面内)
    F.box(-9.25, -13.20, z + 0.16, -8.75, -13.12, z + 0.60, C_METAL_STEEL)
    # 倾斜主皮垫与防滑收边
    F.box(-9.25, -13.15, z + 0.35, -8.75, -12.45, z + 0.48, C_LEATHER_RD)
    # 上部脚踝倒置防滑固定滚轴 (深色软包 + 金色轴心)
    F.box(-9.28, -12.55, z + 0.52, -8.72, -12.45, z + 0.62, C_LEATHER_DK)
    F.box(-9.30, -12.52, z + 0.55, -8.70, -12.48, z + 0.59, C_METAL_GOLD)
    # 下部双手抓握拉力防滑手柄
    F.box(-9.35, -13.15, z + 0.42, -9.25, -13.05, z + 0.48, C_METAL_STEEL)
    F.box(-8.75, -13.15, z + 0.42, -8.65, -13.05, z + 0.48, C_METAL_STEEL)

    # (5) 2.5 东侧和光/爱语成人玩具军械库通顶精品橱窗群与武器化拘束架 (East Armamentarium Showcase)
    # 碳化黑胡桃实木底框与顶部封顶板 (底框抬高至 z+0.10)
    F.box(-0.80, -13.70, z + 0.10, -0.08, -9.50, z + 0.32, C_WOOD_WALNUT)
    F.box(-0.80, -13.70, z + 2.80, -0.08, -9.50, z + 2.92, C_WOOD_WALNUT)
    # 通顶超白钢化玻璃展示壁龛与微孔微蓝导光背板
    F.box(-0.80, -13.70, z + 0.32, -0.10, -9.50, z + 2.80, C_GLASS_CYAN)
    F.box(-0.15, -13.65, z + 0.35, -0.08, -9.55, z + 2.75, C_ETHER_CYAN)
    # 4组武器化与高阶拘束装备陈列挂架 (自南向北：项圈、束缚衣、分腿架、全包头套)
    for wy in (-13.0, -12.0, -11.0, -10.0):
        # 金铜横向承重挂架
        F.box(-0.65, wy - 0.04, z + 2.25, -0.25, wy + 0.04, z + 2.32, C_METAL_GOLD)
        # 挂载皮质主体装备
        F.box(-0.60, wy - 0.03, z + 1.15, -0.30, wy + 0.03, z + 2.25, C_LEATHER_DK)
        # 装备外挂金属扣具与导电片
        F.box(-0.62, wy - 0.02, z + 1.65, -0.28, wy + 0.02, z + 1.75, C_METAL_GOLD)

    # (6) 2.6 东北侧恒温补给吧台、UV-C 消毒充电底座与阶梯式天鹅绒贞操锁陈列柜
    # (a) 润滑剂与耗材恒温补给吧台 + UV-C 杀菌充电抽屉
    # 黑生铁柜体与下部 UV-C 紫外线杀菌抽屉狭缝 (底座抬高至 z+0.10)
    F.box(-0.80, -9.10, z + 0.10, -0.08, -6.60, z + 0.92, C_METAL_IRON)
    F.box(-0.78, -9.00, z + 0.42, -0.15, -6.70, z + 0.46, C_ETHER_CYAN)
    # 拉丝钛金操作台面与数显温控屏
    F.box(-0.82, -9.12, z + 0.92, -0.06, -6.58, z + 0.95, C_METAL_STEEL)
    F.box(-0.72, -7.70, z + 0.95, -0.22, -6.80, z + 1.28, C_SCREEN_GLOW)
    # 恒温精油调配按压瓶与硅胶耗材盒
    F.box(-0.60, -8.70, z + 0.95, -0.40, -8.30, z + 1.15, C_GLASS_CYAN)
    F.box(-0.52, -8.52, z + 1.15, -0.48, -8.48, z + 1.20, C_METAL_GOLD)

    # (b) 阶梯式天鹅绒贞操锁陈列玻璃展柜 (西北角，底座抬高至 z+0.10 消除闪烁)
    F.box(-9.70, -8.80, z + 0.10, -8.30, -6.80, z + 0.35, C_WOOD_WALNUT)
    # 超白钢化玻璃外罩
    F.box(-9.70, -8.80, z + 0.35, -8.30, -6.80, z + 2.45, C_GLASS_CYAN)
    # 阶梯天鹅绒展托
    F.box(-9.60, -8.70, z + 0.35, -8.40, -6.90, z + 0.75, C_LEATHER_RD)
    # 3层发光层板与微缩纯钛/金铜贞操锁陈列
    for sz in (z + 0.85, z + 1.35, z + 1.85):
        F.box(-9.65, -8.75, sz, -8.35, -6.85, sz + 0.03, C_ETHER_CYAN)
        for gy in (-8.4, -7.8, -7.2):
            F.box(-9.12, gy - 0.04, sz + 0.03, -8.88, gy + 0.04, sz + 0.16, C_METAL_GOLD)

    # (c) 开箱检验与分装操作岛台 (洁净钢台面 + 白色哑光柜身，底座抬高至 z+0.10)
    F.box(-3.20, -13.00, z + 0.10, -1.80, -11.40, z + 0.88, C_WHITE_CAB)
    F.box(-3.22, -13.02, z + 0.88, -1.78, -11.38, z + 0.92, C_METAL_STEEL)
    F.box(-3.05, -12.80, z + 0.92, -1.95, -11.60, z + 0.95, C_METAL_STEEL)

    # ========================================================================
    # 3. 私人调教室 B1-C02 (0..3.75, -14..-6) —— 独立深度精雕
    # ========================================================================
    # (1) 3.1 圣安德鲁十字架 (St. Andrew's Cross Platform - Hyper-Realistic Architectural Remake)
    # 构件体系：
    #   [1] 重型角钢与铸铁底盘 + 法兰固定地脚螺栓 + 减震橡胶垫 (全宽 1.85m 阔度稳固基座)
    #   [2] 双向对角黑胡桃木 X 主梁 (标准人体大字形 1.35m 阔度开角，26°俯仰倾角；全构件控制在 z+1.42m 内，剖切视角全景无裁切完整呈现)
    #   [3] 锻造金铜八角中心交叉套箍 + 人体工学骨盆承托马鞍垫 (双侧收腰造型 + 脊椎减压泄力凹槽 + 法式滚边 + 腰带D环)
    #   [4] 顺梁对齐解剖定位分段软垫 (前臂护垫 + 大腿承托垫 + 侧边金铜马鞍圆顶饰钉)
    #   [5] 四端顺梁斜切金铜套箍端帽 + 万向旋转环 + 紧锁真皮护腕/护踝束带 (精钢滚柱针扣 + 真实下垂舌带)
    #   [6] 背部 A 形加固斜撑桁架 + 重型电动液压伸缩套筒推杆 (蓝黑亚光外筒 + 镀铬高亮活塞杆 + 双路高压铜管)
    #   [7] 侧向机械紧急快拆手柄 (鲜红安全 T 形拉手 + 钢丝解脱锁缆) + 生理阈值遥测传感器插座 (以太青冷光指示灯)
    # ------------------------------------------------------------------------
    # [1] 重型角钢与铸铁底盘
    F.box(0.95, -13.70, z + 0.10, 2.80, -13.22, z + 0.18, C_METAL_IRON)
    F.box(0.98, -13.68, z + 0.18, 2.77, -13.24, z + 0.21, C_METAL_STEEL)
    # 三组重型防滑减震橡胶脚垫 (左、中、右)
    F.box(0.94, -13.72, z + 0.10, 1.12, -13.20, z + 0.125, C_FLOOR_RUBBER)
    F.box(1.77, -13.72, z + 0.10, 1.98, -13.20, z + 0.125, C_FLOOR_RUBBER)
    F.box(2.63, -13.72, z + 0.10, 2.81, -13.20, z + 0.125, C_FLOOR_RUBBER)
    # 4 组重型法兰固定盘与地脚高强螺栓
    for bx in (1.10, 1.58, 2.17, 2.65):
        F.cyl(bx, -13.26, 0.050, z + 0.20, z + 0.23, C_METAL_IRON, 12)
        F.cyl(bx, -13.26, 0.020, z + 0.23, z + 0.265, C_METAL_STEEL, 8)

    # [2] 双向对角黑胡桃木 X 主梁 (高 1.10m，宽 1.35m，实长 1.82m，最高标高 z+1.38m 完美位于剖切面下)
    # 对角 1: 左下 (1.20, -13.28, z+0.28) -> 右上 (2.55, -13.82, z+1.38) (前半搭接 +0.004m)
    p0_d1 = np.array([1.20, -13.28 + 0.004, z + 0.28])
    p1_d1 = np.array([2.55, -13.82 + 0.004, z + 1.38])
    # 对角 2: 右下 (2.55, -13.28, z+0.28) -> 左上 (1.20, -13.82, z+1.38) (后半搭接 -0.004m)
    p0_d2 = np.array([2.55, -13.28 - 0.004, z + 0.28])
    p1_d2 = np.array([1.20, -13.82 - 0.004, z + 1.38])

    v1 = p1_d1 - p0_d1
    L1 = np.linalg.norm(v1)
    u1 = v1 / L1
    v2 = p1_d2 - p0_d2
    L2 = np.linalg.norm(v2)
    u2 = v2 / L2
    norm_offset = np.array([0.0, 0.045, 0.022])

    # 主实木大梁 (深色黑胡桃木，宽 0.14m x 厚 0.08m)
    F.beam3d(p0_d1, p1_d1, 0.14, 0.08, C_WOOD_WALNUT)
    F.beam3d(p0_d2, p1_d2, 0.14, 0.08, C_WOOD_WALNUT)
    # 前向阶梯工艺台口压条 (浅金橡木面板，宽 0.10m x 厚 0.015m)
    F.beam3d(p0_d1 + norm_offset * 0.35, p1_d1 + norm_offset * 0.35, 0.10, 0.015, C_WOOD_OAK)
    F.beam3d(p0_d2 + norm_offset * 0.35, p1_d2 + norm_offset * 0.35, 0.10, 0.015, C_WOOD_OAK)

    # 四端顺梁斜切金铜收口套箍端帽 (沿梁轴向精准套接，完全在剖切面下完整闭合)
    F.beam3d(p1_d1 - u1 * 0.06, p1_d1 + u1 * 0.01, 0.155, 0.095, C_METAL_GOLD)
    F.beam3d(p0_d1 - u1 * 0.01, p0_d1 + u1 * 0.06, 0.155, 0.095, C_METAL_GOLD)
    F.beam3d(p1_d2 - u2 * 0.06, p1_d2 + u2 * 0.01, 0.155, 0.095, C_METAL_GOLD)
    F.beam3d(p0_d2 - u2 * 0.01, p0_d2 + u2 * 0.06, 0.155, 0.095, C_METAL_GOLD)

    # [3] 锻造金铜八角中心交叉套箍与人体工学骨盆承托马鞍垫
    cy_mid = -13.55
    cz_mid = z + 0.83
    # 八角锻造钢制中心承力板与金铜加固压板
    F.box(1.75, cy_mid - 0.055, cz_mid - 0.13, 2.00, cy_mid + 0.035, cz_mid + 0.13, C_METAL_IRON)
    F.box(1.77, cy_mid - 0.050, cz_mid - 0.11, 1.98, cy_mid + 0.040, cz_mid + 0.11, C_METAL_GOLD)
    # 四角固定螺栓
    for gx, gz in ((1.77, cz_mid - 0.09), (1.98, cz_mid - 0.09), (1.77, cz_mid + 0.09), (1.98, cz_mid + 0.09)):
        F.cyl(gx, cy_mid + 0.042, 0.008, gz - 0.008, gz + 0.008, C_METAL_GOLD, 6)

    # 人体工学骨盆真皮马鞍软垫 (深红小牛皮，宽 0.20m x 高 0.24m，精巧贴合骨盆，绝不遮挡 X 主体张力)
    F.box(1.775, cy_mid + 0.038, cz_mid - 0.12, 1.975, cy_mid + 0.082, cz_mid + 0.12, C_LEATHER_RD)
    # 中央垂直脊椎泄力凹槽 (深黑色阴影槽，减缓腰椎受压)
    F.box(1.860, cy_mid + 0.060, cz_mid - 0.11, 1.890, cy_mid + 0.084, cz_mid + 0.11, C_LEATHER_DK)
    # 软垫边缘黑色法式双缝滚边
    F.box(1.765, cy_mid + 0.075, cz_mid - 0.13, 1.985, cy_mid + 0.084, cz_mid - 0.11, C_LEATHER_DK)
    F.box(1.765, cy_mid + 0.075, cz_mid + 0.11, 1.985, cy_mid + 0.084, cz_mid + 0.13, C_LEATHER_DK)
    F.box(1.765, cy_mid + 0.075, cz_mid - 0.13, 1.785, cy_mid + 0.084, cz_mid + 0.13, C_LEATHER_DK)
    F.box(1.965, cy_mid + 0.075, cz_mid - 0.13, 1.985, cy_mid + 0.084, cz_mid + 0.13, C_LEATHER_DK)
    # 两侧骨盆腰带金铜锚固 D 环
    for dx_ring in (1.745, 2.005):
        F.box(dx_ring - 0.015, cy_mid + 0.025, cz_mid - 0.02, dx_ring + 0.015, cy_mid + 0.065, cz_mid + 0.02, C_METAL_GOLD)
        F.cyl(dx_ring, cy_mid + 0.068, 0.018, cz_mid - 0.006, cz_mid + 0.006, C_METAL_GOLD, 8)

    # [4] 顺梁对齐解剖定位分段软垫 (前臂护垫 + 大腿承托垫，沿梁向精细铺设)
    # 下半段大腿承托垫 (承托股骨与腘窝)
    p_leg1_0 = p0_d1 + u1 * 0.18 + norm_offset
    p_leg1_1 = p0_d1 + u1 * 0.50 + norm_offset
    F.beam3d(p_leg1_0, p_leg1_1, 0.095, 0.024, C_LEATHER_RD)
    p_leg2_0 = p0_d2 + u2 * 0.18 + norm_offset
    p_leg2_1 = p0_d2 + u2 * 0.50 + norm_offset
    F.beam3d(p_leg2_0, p_leg2_1, 0.095, 0.024, C_LEATHER_RD)

    # 上半段前臂护垫 (承托尺骨与小臂内侧)
    p_arm1_0 = p0_d1 + u1 * 1.25 + norm_offset
    p_arm1_1 = p0_d1 + u1 * 1.55 + norm_offset
    F.beam3d(p_arm1_0, p_arm1_1, 0.095, 0.024, C_LEATHER_RD)
    p_arm2_0 = p0_d2 + u2 * 1.25 + norm_offset
    p_arm2_1 = p0_d2 + u2 * 1.55 + norm_offset
    F.beam3d(p_arm2_0, p_arm2_1, 0.095, 0.024, C_LEATHER_RD)

    # 金铜圆顶固定马鞍钉 (沿前臂与大腿垫两侧均匀排布)
    for p_seg_0, p_seg_1 in ((p_leg1_0, p_leg1_1), (p_leg2_0, p_leg2_1), (p_arm1_0, p_arm1_1), (p_arm2_0, p_arm2_1)):
        for s_stud in (0.18, 0.50, 0.82):
            p_stud = p_seg_0 + (p_seg_1 - p_seg_0) * s_stud
            F.cyl(p_stud[0] - 0.052, p_stud[1] + 0.012, 0.006, p_stud[2] - 0.006, p_stud[2] + 0.006, C_METAL_GOLD, 6)
            F.cyl(p_stud[0] + 0.052, p_stud[1] + 0.012, 0.006, p_stud[2] - 0.006, p_stud[2] + 0.006, C_METAL_GOLD, 6)

    # [5] 四肢端部万向旋转环与紧定护腕/护踝束带 (直接贴合安装在实木大梁端头)
    cuffs_data = (
        (p0_d2 + u2 * (L2 * 0.92) + norm_offset, u2, "TL"),  # 左腕
        (p0_d1 + u1 * (L1 * 0.92) + norm_offset, u1, "TR"),  # 右腕
        (p0_d1 + u1 * (L1 * 0.08) + norm_offset, u1, "BL"),  # 左踝
        (p0_d2 + u2 * (L2 * 0.08) + norm_offset, u2, "BR"),  # 右踝
    )
    for p_cuff, u_cuff, tag in cuffs_data:
        # 万向旋转环法兰座
        F.cyl(p_cuff[0], p_cuff[1] - 0.010, 0.024, p_cuff[2] - 0.008, p_cuff[2] + 0.008, C_METAL_GOLD, 8)
        # 精钢快速卸扣卡环
        F.box(p_cuff[0] - 0.014, p_cuff[1] - 0.008, p_cuff[2] - 0.020,
              p_cuff[0] + 0.014, p_cuff[1] + 0.015, p_cuff[2] + 0.010, C_METAL_GOLD)
        # 顺梁对齐的双层宽幅牛皮护带 (贴紧木梁表面，深黑鞍皮)
        F.beam3d(p_cuff - u_cuff * 0.04, p_cuff + u_cuff * 0.04, 0.11, 0.035, C_LEATHER_DK)
        # 内层包裹深红小牛皮缓冲衬垫
        F.beam3d(p_cuff - u_cuff * 0.035, p_cuff + u_cuff * 0.035, 0.105, 0.038, C_LEATHER_RD)
        # 双排精钢滚柱针扣
        F.box(p_cuff[0] - 0.045, p_cuff[1] + 0.018, p_cuff[2] - 0.015,
              p_cuff[0] - 0.020, p_cuff[1] + 0.028, p_cuff[2] + 0.008, C_METAL_STEEL)
        F.box(p_cuff[0] + 0.020, p_cuff[1] + 0.018, p_cuff[2] - 0.015,
              p_cuff[0] + 0.045, p_cuff[1] + 0.028, p_cuff[2] + 0.008, C_METAL_STEEL)
        # 自然下垂的皮带尾舌 (Tail Strap)
        F.box(p_cuff[0] - 0.025, p_cuff[1] + 0.015, p_cuff[2] - 0.065,
              p_cuff[0] + 0.025, p_cuff[1] + 0.025, p_cuff[2] - 0.020, C_LEATHER_DK)

    # [6] 背部 A 形加固斜撑桁架与电动液压伸缩套筒推杆
    # A 形后斜撑双足铰接底座
    for sx, sz_base in ((1.20, z + 0.20), (2.55, z + 0.20)):
        F.box(sx - 0.035, -13.38, sz_base, sx + 0.035, -13.28, sz_base + 0.050, C_METAL_IRON)
        F.cyl(sx, -13.33, 0.016, sz_base + 0.01, sz_base + 0.06, C_METAL_STEEL, 8)
    # A 形斜撑无缝连续厚壁钢管 (自底座斜向汇聚至十字架后背中心金铜套箍)
    F.beam3d((1.20, -13.33, z + 0.24), (1.78, -13.56, cz_mid - 0.06), 0.036, 0.036, C_METAL_STEEL)
    F.beam3d((2.55, -13.33, z + 0.24), (1.97, -13.56, cz_mid - 0.06), 0.036, 0.036, C_METAL_STEEL)

    # 中央重型液压电动俯仰推杆
    # 地面双耳固定铰轴座
    F.box(1.81, -13.38, z + 0.20, 1.94, -13.28, z + 0.28, C_METAL_IRON)
    F.cyl(1.875, -13.33, 0.020, z + 0.21, z + 0.29, C_METAL_STEEL, 8)
    # 倾斜液压外筒 (工业蓝黑亚光防刮涂层, 直径 0.088m)
    p_cyl_base = np.array([1.875, -13.33, z + 0.26])
    p_cyl_head = np.array([1.875, -13.51, z + 0.65])
    p_piston_top = np.array([1.875, -13.58, cz_mid - 0.02])
    F.beam3d(p_cyl_base, p_cyl_head, 0.088, 0.088, (0.20, 0.22, 0.25))
    # 缸口金铜重型导向套与密封端盖
    F.beam3d(p_cyl_head, p_cyl_head + (p_piston_top - p_cyl_head) * 0.12, 0.096, 0.096, C_METAL_GOLD)
    # 内行程高亮活塞杆 (镀硬铬镜面高反光, 直径 0.050m)
    F.beam3d(p_cyl_head + (p_piston_top - p_cyl_head) * 0.12, p_piston_top, 0.050, 0.050, (0.88, 0.90, 0.95))
    # 顶部万向球铰叉头 (连接十字架后交叉主梁承力板)
    F.box(1.84, -13.62, cz_mid - 0.03, 1.91, -13.56, cz_mid + 0.03, C_METAL_STEEL)
    # 双路高压耐油软管与紫铜快插接头
    F.box(1.92, -13.48, z + 0.28, 1.945, -13.46, z + 0.58, (0.12, 0.12, 0.13))
    F.box(1.805, -13.48, z + 0.28, 1.83, -13.46, z + 0.58, (0.12, 0.12, 0.13))
    F.box(1.915, -13.49, z + 0.26, 1.95, -13.45, z + 0.30, C_METAL_GOLD)
    F.box(1.80, -13.49, z + 0.26, 1.835, -13.45, z + 0.30, C_METAL_GOLD)

    # [7] 侧向机械紧急快拆拉手与生理遥测端子
    # 右侧机械应急瞬脱 T 形拉手 (亮红警示手柄，拉动即刻脱开四肢卡口)
    F.box(2.03, cy_mid - 0.025, cz_mid - 0.02, 2.07, cy_mid + 0.015, cz_mid + 0.04, C_METAL_IRON)
    F.box(2.07, cy_mid - 0.020, cz_mid - 0.07, 2.10, cy_mid + 0.010, cz_mid + 0.03, C_RED_EMERG)
    F.box(2.05, cy_mid - 0.010, cz_mid + 0.03, 2.12, cy_mid + 0.010, cz_mid + 0.06, C_RED_EMERG)
    # 左侧生理阈值监测导联接线箱 (心率、血氧与皮肤电阻遥测接口)
    F.box(1.68, cy_mid - 0.025, cz_mid - 0.06, 1.72, cy_mid + 0.015, cz_mid + 0.02, C_METAL_STEEL)
    F.box(1.675, cy_mid - 0.015, cz_mid - 0.04, 1.685, cy_mid + 0.005, cz_mid - 0.02, C_ETHER_CYAN)
    F.box(1.675, cy_mid - 0.015, cz_mid - 0.01, 1.685, cy_mid + 0.005, cz_mid + 0.01, (0.85, 0.65, 0.15))

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
    # 到顶碳化黑胡桃木主柜体框架（背板 + 顶板 + 南北侧板 + 底板，内部空心容纳抽屉与壁龛）
    F.box(3.64, -10.20, z + 0.18, 3.68, -8.20, z + 2.70, C_WOOD_WALNUT)         # 东背板
    F.box(3.22, -10.20, z + 2.66, 3.68, -8.20, z + 2.70, C_WOOD_WALNUT)         # 顶板
    F.box(3.22, -10.20, z + 0.18, 3.68, -10.16, z + 2.70, C_WOOD_WALNUT)        # 南侧板
    F.box(3.22, -8.24, z + 0.18, 3.68, -8.20, z + 2.70, C_WOOD_WALNUT)         # 北侧板
    F.box(3.22, -10.20, z + 0.18, 3.68, -8.20, z + 0.22, C_WOOD_WALNUT)         # 底板

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
    # (1) 4.1 多角度电动翻转实训床 (Electric Tilt Training Bed)
    # 中央重型液压单柱底座 (底座抬高至 z+0.10，消除与地面闪烁)
    F.box(4.88, -10.72, z + 0.10, 5.32, -10.28, z + 0.45, C_METAL_STEEL)
    F.box(4.96, -10.64, z + 0.45, 5.24, -10.36, z + 0.55, C_METAL_GOLD)
    # 重型黑胡桃木电动翻转床架底盘
    F.box(4.50, -11.75, z + 0.55, 5.70, -9.25, z + 0.65, C_WOOD_WALNUT)
    # 宫殿红双密度真皮承托床垫
    F.box(4.55, -11.70, z + 0.65, 5.65, -9.30, z + 0.78, C_LEATHER_RD)
    # 骨盆前倾抬升防滑马鞍皮垫 (中心区)
    F.box(4.65, -10.80, z + 0.78, 5.55, -10.00, z + 0.86, C_LEATHER_DK)
    # 大腿固定防滑皮托与金铜搭扣 (左右双侧)
    F.box(4.55, -10.55, z + 0.86, 4.80, -10.25, z + 0.92, C_LEATHER_DK)
    F.box(4.52, -10.50, z + 0.88, 4.56, -10.30, z + 0.94, C_METAL_GOLD)
    F.box(5.40, -10.55, z + 0.86, 5.65, -10.25, z + 0.92, C_LEATHER_DK)
    F.box(5.64, -10.50, z + 0.88, 5.68, -10.30, z + 0.94, C_METAL_GOLD)
    # 北端头部定位双层丝绸羽绒软枕
    F.box(4.75, -9.65, z + 0.78, 5.45, -9.35, z + 0.86, C_PILLOW_WHITE)
    # 床身侧向电动调节手持手柄与角度数显屏
    F.box(5.70, -10.20, z + 0.65, 5.76, -10.00, z + 0.80, C_METAL_STEEL)
    F.box(5.72, -10.18, z + 0.72, 5.77, -10.02, z + 0.82, C_SCREEN_GLOW)

    # (2) 4.2 阶梯式软包骑乘模拟鞍马 (Stepped Saddle Mount / Riding Vault)
    # 4足钢构支脚 (底座抬高至 z+0.10)
    F.box(3.98, -11.75, z + 0.10, 4.06, -11.67, z + 0.50, C_METAL_IRON)
    F.box(4.29, -11.75, z + 0.10, 4.37, -11.67, z + 0.50, C_METAL_IRON)
    F.box(3.98, -9.33, z + 0.10, 4.06, -9.25, z + 0.50, C_METAL_IRON)
    F.box(4.29, -9.33, z + 0.10, 4.37, -9.25, z + 0.50, C_METAL_IRON)
    # 实木鞍体基座框
    F.box(3.95, -11.80, z + 0.50, 4.40, -9.20, z + 0.65, C_WOOD_WALNUT)
    # 三段式法式缝线加厚马鞍皮骑乘躯干
    F.box(3.98, -9.90, z + 0.65, 4.37, -9.25, z + 0.82, C_LEATHER_RD)
    F.box(3.98, -11.00, z + 0.65, 4.37, -9.90, z + 0.95, C_LEATHER_RD)
    F.box(3.98, -11.75, z + 0.65, 4.37, -11.00, z + 0.88, C_LEATHER_RD)
    # 顶部双握持把手与深色马鞍中缝
    F.box(4.02, -10.95, z + 0.95, 4.33, -9.95, z + 0.98, C_LEATHER_DK)
    F.box(4.14, -10.60, z + 0.95, 4.21, -10.30, z + 1.05, C_METAL_GOLD)
    # 侧边内置多频偏心振动调速旋钮
    F.box(4.39, -10.53, z + 0.70, 4.43, -10.47, z + 0.76, C_METAL_GOLD)

    # (3) 4.3 全身水银镜面墙与天然老橡木双层平衡把杆 (South Wall)
    # 黑胡桃木抗声学共振深色镜套框
    F.box(3.96, -13.72, z + 0.18, 6.64, -13.66, z + 2.82, C_WOOD_WALNUT)
    # 全身水银防畸变镜面 (高亮反射玻璃)
    F.box(4.00, -13.68, z + 0.20, 6.60, -13.67, z + 2.80, C_GLASS_CYAN)
    # 4组重型黄铜墙壁悬挑托架
    for bx in (4.20, 5.00, 5.80, 6.40):
        F.box(bx - 0.03, -13.66, z + 1.08, bx + 0.03, -13.52, z + 1.14, C_METAL_GOLD)
        F.box(bx - 0.03, -13.66, z + 0.83, bx + 0.03, -13.52, z + 0.89, C_METAL_GOLD)
    # 上下双层天然老橡木芭蕾形体平衡把杆
    F.box(4.00, -13.54, z + 1.08, 6.60, -13.50, z + 1.14, C_WOOD_OAK)
    F.box(4.00, -13.54, z + 0.83, 6.60, -13.50, z + 0.89, C_WOOD_OAK)

    # (4) 4.4 东侧机械臂实训柱与自动润滑冲洗管线台 (East Wall)
    # 垂直滑轨导轨立柱 (底座抬高至 z+0.10)
    F.box(6.55, -11.60, z + 0.10, 6.78, -11.20, z + 2.30, C_METAL_STEEL)
    F.box(6.53, -11.43, z + 0.30, 6.56, -11.37, z + 2.20, C_ETHER_CYAN)
    # 多轴机械臂伸缩支架与快换接头
    F.box(6.30, -11.50, z + 1.10, 6.55, -11.30, z + 1.25, C_METAL_IRON)
    F.box(5.95, -11.45, z + 1.15, 6.30, -11.35, z + 1.22, C_METAL_STEEL)
    F.box(5.80, -11.43, z + 1.05, 5.95, -11.37, z + 1.20, C_METAL_GOLD)
    # 自动润滑与清洗管线操作吧台 (底座抬高至 z+0.10)
    F.box(6.40, -13.10, z + 0.10, 6.78, -11.80, z + 0.90, C_WHITE_CAB)
    F.box(6.38, -13.12, z + 0.90, 6.80, -11.78, z + 0.93, C_METAL_STEEL)
    # 双联高压恒温储液罐与铜质压力阀门
    F.box(6.45, -12.95, z + 0.93, 6.65, -12.65, z + 1.25, C_GLASS_CYAN)
    F.box(6.45, -12.45, z + 0.93, 6.65, -12.15, z + 1.25, C_GLASS_CYAN)
    F.box(6.50, -12.85, z + 1.25, 6.60, -12.75, z + 1.30, C_METAL_GOLD)
    F.box(6.50, -12.35, z + 1.25, 6.60, -12.25, z + 1.30, C_METAL_GOLD)
    # 柔性防污软管连接段
    F.box(6.25, -12.00, z + 0.93, 6.40, -11.50, z + 1.15, C_FLOOR_RUBBER)

    # (5) 4.5 教学演示终端与 UV-C 快速灭菌柜 (Northwest Corner)
    # 医用级白色哑光密闭储物柜 (底座抬高至 z+0.10)
    F.box(3.90, -8.20, z + 0.10, 4.50, -6.80, z + 0.90, C_WHITE_CAB)
    F.box(3.92, -8.18, z + 0.10, 4.48, -6.82, z + 0.18, C_WOOD_WALNUT)
    F.box(3.95, -8.10, z + 0.40, 4.45, -6.90, z + 0.45, C_ETHER_CYAN)
    # 教学视讯液晶触控显示终端
    F.box(4.15, -7.60, z + 0.90, 4.25, -7.40, z + 1.05, C_METAL_STEEL)
    F.box(3.98, -8.02, z + 1.03, 4.42, -6.98, z + 1.57, C_METAL_IRON)
    F.box(4.00, -8.00, z + 1.05, 4.40, -7.00, z + 1.55, C_SCREEN_GLOW)
    # 台面 38.5℃ 恒温精油加温槽与按压龙头
    F.box(4.30, -8.10, z + 0.90, 4.45, -7.80, z + 0.98, C_GLASS_CYAN)
    F.box(4.35, -7.98, z + 0.98, 4.42, -7.92, z + 1.05, C_METAL_GOLD)

    # ========================================================================
    # 5. 体能训练室 B1-C03 (-8..-2, -3..7)
    # ========================================================================
    # (1) 5.1 加固型综合格斗擂台 (Reinforced Sparring Ring, 3.2m x 3.2m)
    # 重型钢架抬高平台基座 (底座抬高至 z+0.10，消除闪烁)
    F.box(-7.50, 3.30, z + 0.10, -4.30, 6.50, z + 0.35, C_METAL_IRON)
    F.box(-7.52, 3.28, z + 0.32, -4.28, 6.52, z + 0.36, C_LEATHER_DK)
    # 高弹减震灰色厚帆布擂台台面
    F.box(-7.45, 3.35, z + 0.36, -4.35, 6.45, z + 0.40, C_MAT_SPARRING)
    # 台面中央对战分割与防滑定位标记
    F.box(-5.92, 3.45, z + 0.40, -5.88, 6.35, z + 0.405, C_CARPET_GOLD)

    # 4角加固防撞立柱 (红角、蓝角、双白中立角)
    F.cyl(-7.40, 3.40, 0.07, z + 0.35, z + 1.88, (0.80, 0.12, 0.12), 12)  # 红角 (西南)
    F.cyl(-4.40, 6.40, 0.07, z + 0.35, z + 1.88, (0.12, 0.28, 0.80), 12)  # 蓝角 (东北)
    F.cyl(-7.40, 6.40, 0.07, z + 0.35, z + 1.88, (0.88, 0.88, 0.88), 10)  # 白角 (西北)
    F.cyl(-4.40, 3.40, 0.07, z + 0.35, z + 1.88, (0.88, 0.88, 0.88), 10)  # 白角 (东南)

    # 4角厚质软包防撞角垫 (高 z+0.40..z+1.45，剖切线下完全可见)
    F.box(-7.46, 3.34, z + 0.40, -7.26, 3.54, z + 1.45, (0.80, 0.12, 0.12))
    F.box(-4.54, 6.26, z + 0.40, -4.34, 6.46, z + 1.45, (0.12, 0.28, 0.80))
    F.box(-7.46, 6.26, z + 0.40, -7.26, 6.46, z + 1.45, (0.88, 0.88, 0.88))
    F.box(-4.54, 3.34, z + 0.40, -4.34, 3.54, z + 1.45, (0.88, 0.88, 0.88))

    # 3道防缠绕高拉力真皮围绳 (标高 z+0.75, z+1.10, z+1.45，全位于 z+1.50 剖切面下)
    for rz in (z + 0.75, z + 1.10, z + 1.45):
        # 西、东两侧围绳
        F.box(-7.38, 3.42, rz - 0.02, -7.34, 6.38, rz + 0.02, C_LEATHER_RD)
        F.box(-4.46, 3.42, rz - 0.02, -4.42, 6.38, rz + 0.02, C_LEATHER_RD)
        # 南、北两侧围绳
        F.box(-7.38, 3.42, rz - 0.02, -4.42, 3.46, rz + 0.02, C_LEATHER_RD)
        F.box(-7.38, 6.34, rz - 0.02, -4.42, 6.38, rz + 0.02, C_LEATHER_RD)
        # 四转角金铜张力螺栓卡套
        F.box(-7.40, 3.40, rz - 0.03, -7.32, 3.48, rz + 0.03, C_METAL_GOLD)
        F.box(-4.48, 6.32, rz - 0.03, -4.40, 6.40, rz + 0.03, C_METAL_GOLD)
        F.box(-7.40, 6.32, rz - 0.03, -7.32, 6.40, rz + 0.03, C_METAL_GOLD)
        F.box(-4.48, 3.40, rz - 0.03, -4.40, 3.48, rz + 0.03, C_METAL_GOLD)

    # 4面围绳中间防分散垂直垂直拉带
    F.box(-5.92, 3.40, z + 0.70, -5.88, 3.48, z + 1.48, C_LEATHER_DK)
    F.box(-5.92, 6.32, z + 0.70, -5.88, 6.40, z + 1.48, C_LEATHER_DK)
    F.box(-7.40, 4.88, z + 0.70, -7.32, 4.92, z + 1.48, C_LEATHER_DK)
    F.box(-4.48, 4.88, z + 0.70, -4.40, 4.92, z + 1.48, C_LEATHER_DK)

    # 东南角登台双级踏步 (底座抬高至 z+0.10)
    F.box(-4.15, 3.45, z + 0.10, -3.85, 4.15, z + 0.22, C_METAL_STEEL)
    F.box(-4.30, 3.50, z + 0.22, -4.15, 4.10, z + 0.35, C_METAL_STEEL)
    F.box(-4.12, 3.50, z + 0.22, -3.88, 4.10, z + 0.23, C_FLOOR_RUBBER)

    # (2) 5.2 重型武器展示与惩罚锁链架 (East Wall)
    # 黑胡桃木主架构架 (底座抬高至 z+0.10)
    F.box(-3.65, 3.60, z + 0.10, -2.35, 6.50, z + 2.34, C_WOOD_WALNUT)
    F.box(-3.63, 3.75, z + 0.30, -2.45, 6.35, z + 2.20, (0.08, 0.08, 0.09))
    # 4层老橡木陈列横托梁
    for wy in (3.90, 4.50, 5.10, 5.70, 6.30):
        F.box(-3.52, wy - 0.04, z + 0.44, -2.48, wy + 0.04, z + 2.14, C_WOOD_OAK)
        F.box(-3.56, wy - 0.06, z + 2.14, -2.44, wy + 0.06, z + 2.22, C_METAL_GOLD)
    # 武器道具陈列：木刀、训诫藤杖与宽幅生皮拍
    F.box(-3.55, 3.90, z + 0.65, -2.55, 3.96, z + 0.72, C_WOOD_OAK)
    F.box(-3.55, 4.50, z + 0.65, -2.75, 4.62, z + 0.70, C_LEATHER_DK)
    # 垂直悬挂合金拘束锁链与黄铜手铐
    F.box(-3.50, 5.15, z + 0.60, -3.46, 5.22, z + 1.45, C_METAL_STEEL)
    F.box(-3.50, 5.75, z + 0.60, -3.46, 5.82, z + 1.45, C_METAL_STEEL)
    F.box(-3.52, 5.12, z + 1.42, -3.44, 5.25, z + 1.50, C_METAL_GOLD)
    F.box(-3.52, 5.72, z + 1.42, -3.44, 5.85, z + 1.50, C_METAL_GOLD)

    # (3) 5.3 重型深蹲龙门架与倒吊腹肌斜板 (West Wall)
    # [1] 重型四柱方钢深蹲架 (底座抬高至 z+0.10)
    F.box(-7.60, -0.50, z + 0.10, -6.40, 1.20, z + 0.18, C_METAL_IRON)
    # 4根方钢主立柱 (100x100mm 截面，网格对齐，meshopt 极优)
    F.box(-7.58, -0.48, z + 0.18, -7.48, -0.38, z + 2.30, C_METAL_IRON)
    F.box(-6.52, -0.48, z + 0.18, -6.42, -0.38, z + 2.30, C_METAL_IRON)
    F.box(-7.58, 1.08, z + 0.18, -7.48, 1.18, z + 2.30, C_METAL_IRON)
    F.box(-6.52, 1.08, z + 0.18, -6.42, 1.18, z + 2.30, C_METAL_IRON)
    # 顶部十字连接横梁与引体横杆
    F.box(-7.58, -0.48, z + 2.25, -6.42, 1.18, z + 2.32, C_METAL_IRON)
    # 奥林匹克滚花杠铃主杆与双侧高密度铸铁配重片组
    F.box(-7.70, 0.33, z + 1.25, -6.30, 0.37, z + 1.29, C_METAL_STEEL)
    F.box(-7.55, 0.18, z + 1.10, -7.45, 0.52, z + 1.44, C_METAL_IRON)
    F.box(-6.55, 0.18, z + 1.10, -6.45, 0.52, z + 1.44, C_METAL_IRON)
    F.box(-7.60, 0.30, z + 1.23, -7.56, 0.40, z + 1.31, C_METAL_GOLD)
    F.box(-6.44, 0.30, z + 1.23, -6.40, 0.40, z + 1.31, C_METAL_GOLD)

    # [2] 重型倒吊腹肌斜板 (带脚踝自锁固定轴，底座抬高至 z+0.10)
    F.box(-7.50, 1.40, z + 0.10, -6.50, 2.50, z + 0.35, C_METAL_STEEL)
    F.box(-7.45, 1.45, z + 0.35, -6.55, 2.45, z + 0.65, C_LEATHER_DK)
    # 上下双滚轴自锁海绵脚套与金铜调节插销
    F.box(-7.35, 2.32, z + 0.65, -6.65, 2.45, z + 0.78, (0.15, 0.15, 0.15))
    F.box(-7.35, 2.32, z + 0.50, -6.65, 2.45, z + 0.63, (0.15, 0.15, 0.15))
    F.box(-6.62, 2.35, z + 0.68, -6.55, 2.42, z + 0.75, C_METAL_GOLD)

    # (4) 5.4 悬挂重型生牛皮沙袋群与体能监测中控台
    # [1] 天花悬挂重型生牛皮沙袋群 (80kg 黑色重型沙袋 + 红黑拼色靶心沙袋)
    F.box(-3.10, -0.20, z + 3.25, -2.90, 2.20, z + 3.40, C_METAL_IRON)
    # 沙袋 1 (南侧，墨黑厚牛皮)
    F.box(-3.02, 0.18, z + 2.30, -2.98, 0.22, z + 3.25, C_METAL_STEEL)
    F.cyl(-3.00, 0.20, 0.25, z + 0.95, z + 2.30, C_LEATHER_DK, 12)
    # 沙袋 2 (北侧，宫殿红与黑色靶心带)
    F.box(-3.02, 1.78, z + 2.30, -2.98, 1.82, z + 3.25, C_METAL_STEEL)
    F.cyl(-3.00, 1.80, 0.25, z + 0.95, z + 2.30, C_LEATHER_RD, 12)
    F.cyl(-3.00, 1.80, 0.255, z + 1.45, z + 1.75, C_LEATHER_DK, 12)

    # [2] 体能监测中控台与战力测评站 (西南角，底座抬高至 z+0.10)
    F.box(-7.60, -2.60, z + 0.10, -6.40, -1.30, z + 0.95, C_METAL_IRON)
    F.box(-7.62, -2.62, z + 0.95, -6.38, -1.28, z + 0.98, C_METAL_STEEL)
    # 倾斜式战力与心率波形双联监视屏
    F.box(-7.50, -2.50, z + 0.98, -6.50, -1.40, z + 1.58, C_METAL_IRON)
    F.box(-7.48, -2.48, z + 1.00, -6.52, -1.42, z + 1.56, C_SCREEN_GLOW)
    # 地面握力与爆发力测力踏板
    F.box(-6.30, -2.20, z + 0.10, -5.80, -1.70, z + 0.13, C_METAL_STEEL)

    # ========================================================================
    # 6. 恒温酒窖 B1-C05 (-14..-8, -3..2)
    # ========================================================================
    # (1) 6.1 双面到顶老白橡酒架框架与陈列红酒瓶列阵 (底座抬高至 z+0.10，柜体起于 z+0.20 踢脚之上)
    # 踢脚防潮收口 (z+0.10..z+0.20)
    F.box(-13.70, 1.20, z + 0.10, -8.30, 1.80, z + 0.20, (0.08, 0.08, 0.08))
    F.box(-13.70, -2.60, z + 0.10, -13.00, 1.00, z + 0.20, (0.08, 0.08, 0.08))
    # 北面酒架框架 (空心框：背板 + 顶板 + 侧立板)
    F.box(-13.70, 1.75, z + 0.20, -8.30, 1.80, z + 3.24, C_WOOD_WALNUT)         # 北背板
    F.box(-13.70, 1.20, z + 3.20, -8.30, 1.80, z + 3.24, C_WOOD_WALNUT)         # 顶板
    F.box(-13.70, 1.20, z + 0.20, -13.65, 1.80, z + 3.24, C_WOOD_WALNUT)        # 西立柱
    F.box(-8.35, 1.20, z + 0.20, -8.30, 1.80, z + 3.24, C_WOOD_WALNUT)          # 东立柱
    # 西面酒架框架 (空心框：西背板 + 顶板 + 南北立柱)
    F.box(-13.70, -2.60, z + 0.20, -13.65, 1.00, z + 3.24, C_WOOD_WALNUT)        # 西背板
    F.box(-13.70, -2.60, z + 3.20, -13.00, 1.00, z + 3.24, C_WOOD_WALNUT)        # 顶板
    F.box(-13.70, -2.60, z + 0.20, -13.00, -2.55, z + 3.24, C_WOOD_WALNUT)       # 南立柱
    F.box(-13.70, 0.95, z + 0.20, -13.00, 1.00, z + 3.24, C_WOOD_WALNUT)         # 北立柱
    # 6层展示层板 + 横卧红酒瓶阵列 (深绿瓶身 + 金红热缩锡箔帽)
    for bz in np.linspace(z + 0.49, z + 2.99, 6):
        F.box(-13.65, 1.25, bz - 0.02, -8.35, 1.75, bz + 0.02, C_WOOD_OAK)
        F.box(-13.65, -2.50, bz - 0.02, -13.05, 0.90, bz + 0.02, C_WOOD_OAK)
        for bx in np.linspace(-13.0, -8.9, 5):
            F.cyl(bx, 1.45, 0.04, bz + 0.02, bz + 0.20, C_BOTTLE_GLASS, 8)
            F.cyl(bx, 1.45, 0.015, bz + 0.20, bz + 0.26, C_METAL_GOLD, 6)
        for by in np.linspace(-2.0, 0.4, 4):
            F.cyl(-13.35, by, 0.04, bz + 0.02, bz + 0.20, C_BOTTLE_GLASS, 8)
            F.cyl(-13.35, by, 0.015, bz + 0.20, bz + 0.26, C_METAL_GOLD, 6)

    # (2) 6.2 波尔多陈酿橡木桶组 x3 (配黑生铁桶圈、铜龙头与防震垫，底座抬高至 z+0.10)
    for ty in (-1.8, -0.6, 0.6):
        F.box(-9.20, ty - 0.25, z + 0.10, -8.40, ty + 0.25, z + 0.22, C_WOOD_WALNUT)
        F.cyl(-8.80, ty, 0.35, z + 0.22, z + 0.89, C_WOOD_OAK, 12)
        F.cyl(-8.80, ty, 0.36, z + 0.35, z + 0.42, C_METAL_IRON, 12)
        F.cyl(-8.80, ty, 0.36, z + 0.70, z + 0.77, C_METAL_IRON, 12)
        F.box(-8.45, ty - 0.025, z + 0.50, -8.38, ty + 0.025, z + 0.58, C_METAL_GOLD)

    # (3) 6.4 恒温恒湿机房与全景观察视窗 (南侧，底座抬高至 z+0.10)
    F.box(-13.70, -2.80, z + 0.10, -9.00, -2.10, z + 2.54, C_WHITE_CAB)
    F.box(-13.60, -2.105, z + 0.30, -9.10, -2.095, z + 2.44, C_GLASS_CYAN)
    F.box(-11.50, -2.095, z + 1.20, -10.50, -2.055, z + 1.60, C_SCREEN_GLOW)

    # (4) 6.3 劳伦黑金大理石品酒吧台与真皮高脚吧台椅 (中岛区，底座抬高至 z+0.10)
    F.box(-11.50, -0.70, z + 0.10, -9.50, 0.30, z + 0.95, C_WOOD_WALNUT)
    F.box(-11.60, -0.75, z + 0.95, -9.40, 0.35, z + 1.02, (0.12, 0.12, 0.12))
    F.box(-11.62, -0.77, z + 0.99, -9.38, 0.37, z + 1.02, C_METAL_GOLD)
    for sx in (-11.20, -10.60, -10.00, -9.40):
        F.cyl(sx, -0.20, 0.16, z + 0.10, z + 0.13, C_METAL_GOLD, 8)
        F.cyl(sx, -0.20, 0.025, z + 0.13, z + 0.70, C_METAL_GOLD, 8)
        F.cyl(sx, -0.20, 0.10, z + 0.30, z + 0.33, C_METAL_GOLD, 8)
        F.cyl(sx, -0.20, 0.16, z + 0.70, z + 0.79, C_LEATHER_RD, 10)
    # 水晶醒酒器与郁金香酒杯托盘
    F.box(-10.80, -0.30, z + 1.02, -10.20, -0.10, z + 1.30, C_GLASS_CYAN)
    F.box(-10.00, -0.30, z + 1.02, -9.60, -0.10, z + 1.05, C_METAL_GOLD)

    # ========================================================================
    # 7. 更衣 / 淋浴水疗室 (10..16, -14..-6)
    # ========================================================================
    # (1) 7.1 干区磨砂金属储物更衣柜群与换鞋更衣长凳 (底座抬高至 z+0.10)
    F.box(10.35, -13.50, z + 0.10, 11.15, -7.30, z + 2.34, C_METAL_STEEL)
    for ey in np.linspace(-13.0, -7.8, 6):
        F.box(11.15, ey - 0.03, z + 1.15, 11.18, ey + 0.03, z + 1.25, C_METAL_GOLD)
    # 加厚白橡木更衣长凳 (不锈钢支脚 + 整木凳面)
    F.box(11.75, -12.80, z + 0.10, 12.05, -12.60, z + 0.40, C_METAL_STEEL)
    F.box(11.75, -8.20, z + 0.10, 12.05, -8.00, z + 0.40, C_METAL_STEEL)
    F.box(11.65, -12.90, z + 0.40, 12.15, -7.90, z + 0.48, C_WOOD_OAK)

    # (2) 7.2 湿区 4 组独立磨砂玻璃冲淋隔间与热带雨林花洒 (底座抬高至 z+0.10)
    for sy in (-13.50, -12.50, -11.50, -10.50):
        F.box(13.60, sy, z + 0.10, 15.60, sy + 0.90, z + 2.45, C_GLASS_CYAN)
        F.box(14.45, sy + 0.35, z + 2.35, 14.75, sy + 0.55, z + 2.42, C_METAL_STEEL)
        F.box(13.62, sy + 0.40, z + 1.10, 13.68, sy + 0.50, z + 1.25, C_METAL_GOLD)

    # (3) 7.3 大理石一体化梳妆台与防雾镜、下吹式除菌烘干站 (底座抬高至 z+0.10)
    F.box(13.60, -7.30, z + 0.10, 15.70, -6.30, z + 0.90, C_WHITE_CAB)
    F.box(13.58, -7.32, z + 0.90, 15.72, -6.28, z + 0.94, C_METAL_STEEL)
    F.box(13.70, -6.38, z + 1.14, 15.60, -6.32, z + 2.14, C_GLASS_CYAN)
    F.box(12.45, -13.50, z + 0.10, 13.25, -10.90, z + 0.90, C_WHITE_CAB)
    F.box(12.48, -13.48, z + 0.90, 13.22, -10.92, z + 0.94, C_METAL_STEEL)

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
    # --- 惩罚室 B2-C01 地面：警戒区底板 (z+0.035..z+0.040)，水牢周边黑黄 45度警戒斑马线 (z+0.075..z+0.080)
    F.pad(-9.8, -13.8, z + 0.035, -8.2, -10.3, z + 0.040, C_HAZARD_YEL)
    F.pad(-9.7, -13.7, z + 0.075, -8.3, -10.4, z + 0.080, C_HAZARD_BLK)

    # --- 医疗与改造室 B2-C02 地面：白色无菌分界线 (z+0.035..z+0.040)，手术中心区 (z+0.075..z+0.080)
    F.pad(-3.0, -12.0, z + 0.035, -0.6, -8.6, z + 0.040, (0.92, 0.94, 0.94))
    F.pad(-2.9, -11.9, z + 0.075, -0.7, -8.7, z + 0.080, C_FLOOR_EPOXY)

    # --- 档案室 B2-C03 地面：查阅区真皮地垫 (z+0.035..z+0.040)
    F.pad(11.8, -12.3, z + 0.035, 14.2, -10.7, z + 0.040, C_LEATHER_DK)

    # --- 储藏室 B2-C04 地面：通道分装区地坪垫 (z+0.035..z+0.040)
    F.pad(12.0, -9.0, z + 0.035, 14.0, -7.2, z + 0.040, (0.32, 0.35, 0.38))

    # --- 机电设备间与结界发生器地面：结界核心黄黑防爆警戒环 (z+0.035..z+0.080)
    F.pad(-7.2, 0.8, z + 0.035, -2.8, 5.2, z + 0.040, C_HAZARD_YEL)
    F.pad(-7.0, 1.0, z + 0.075, -3.0, 5.0, z + 0.080, (0.16, 0.17, 0.18))
    F.pad(-6.8, -1.7, z + 0.035, -3.2, -0.6, z + 0.040, C_LEATHER_DK)


    # ========================================================================

    # 2. 惩罚室 B2-C01 (-10..-5, -14..-6)
    # ========================================================================
    # 2.1 沉箱式水牢钢笼 (浸没式防逃逸沉箱 + 加固粗钢方管栅条 + 顶部提升滑轮组 + 冰水制冷压缩机组)
    # (a) 沉箱底座与水体 (x: -9.7..-8.3, y: -13.6..-11.6)
    F.box(-9.7, -13.6, z + 0.03, -8.3, -11.6, z + 0.30, C_METAL_IRON)   # 外围重型铸铁防渗围堰
    F.box(-9.55, -13.45, z + 0.10, -8.45, -11.75, z + 0.26, (0.08, 0.16, 0.22)) # 深水面（冷冽折射暗蓝）
    F.pad(-9.50, -13.40, z + 0.08, -8.50, -11.80, z + 0.12, C_FLOOR_GRID) # 沉箱底部防滑排水钢格栅
    # (b) 钢笼底框与立柱角钢 (最高点控制在 z+1.44m，留出 6cm 净空防剖切削顶)
    F.box(-9.48, -13.38, z + 0.28, -8.52, -11.82, z + 0.36, C_METAL_IRON) # 笼底加固角钢框
    F.box(-9.48, -13.38, z + 1.28, -8.52, -11.82, z + 1.35, C_METAL_IRON) # 笼顶加固受力梁框
    # 四角粗重工字角钢立柱 (0.05 x 0.05m)
    for cx, cy in ((-9.48, -13.38), (-8.57, -13.38), (-9.48, -11.87), (-8.57, -11.87)):
        F.box(cx, cy, z + 0.36, cx + 0.05, cy + 0.05, z + 1.28, C_METAL_IRON)
    # 热浸镀锌加固方钢栅条 (工业方形粗钢条，防扭曲高强度，n=4)
    # 北面与南面 (y = -11.85 与 y = -13.35)
    for bx in (-9.30, -9.00, -8.70):
        F.cyl(bx, -11.85, 0.016, z + 0.36, z + 1.28, C_METAL_STEEL, 4)
    for bx in (-9.20, -8.80):
        F.cyl(bx, -13.35, 0.016, z + 0.36, z + 1.28, C_METAL_STEEL, 4)
    # 西面栅条 (x = -9.45)
    for by in (-12.90, -12.30):
        F.cyl(-9.45, by, 0.016, z + 0.36, z + 1.28, C_METAL_STEEL, 4)
    # 东面固定栅条 (正面两侧)
    for by in (-13.10, -12.10):
        F.cyl(-8.55, by, 0.016, z + 0.36, z + 1.28, C_METAL_STEEL, 4)
    # 正面活动门扇框架 (y: -12.9..-12.3)
    F.box(-8.56, -12.88, z + 0.38, -8.51, -12.32, z + 1.26, C_METAL_STEEL) # 门扇边框
    for by in (-12.72, -12.48):
        F.cyl(-8.53, by, 0.014, z + 0.40, z + 1.24, C_METAL_STEEL, 4)
    # 精密滑动门栓导轨、插销横杆与金铜实心重型挂锁
    F.box(-8.50, -12.75, z + 0.80, -8.46, -12.45, z + 0.84, C_METAL_STEEL) # 门栓横杆
    F.box(-8.48, -12.52, z + 0.74, -8.44, -12.46, z + 0.82, C_METAL_GOLD)  # 挂锁锁体
    F.box(-8.47, -12.50, z + 0.82, -8.45, -12.48, z + 0.86, C_METAL_STEEL) # 挂锁锁梁
    # (c) 顶部悬吊绞盘滑轮组与斜拉受力缆绳 (最高点 z+1.44m)
    F.box(-9.25, -12.80, z + 1.35, -8.75, -12.40, z + 1.39, C_METAL_IRON)  # 顶部滑轮支架底座
    F.beam3d((-9.45, -13.35, z + 1.35), (-9.00, -12.60, z + 1.41), 0.03, 0.03, C_METAL_STEEL) # 斜拉钢缆1
    F.beam3d((-8.55, -13.35, z + 1.35), (-9.00, -12.60, z + 1.41), 0.03, 0.03, C_METAL_STEEL) # 斜拉钢缆2
    F.beam3d((-9.45, -11.85, z + 1.35), (-9.00, -12.60, z + 1.41), 0.03, 0.03, C_METAL_STEEL) # 斜拉钢缆3
    F.beam3d((-8.55, -11.85, z + 1.35), (-9.00, -12.60, z + 1.41), 0.03, 0.03, C_METAL_STEEL) # 斜拉钢缆4
    # 双联导向滑轮 (锻造金铜轮盘，自然收口于 1.44m)
    F.box(-9.06, -12.72, z + 1.39, -9.00, -12.48, z + 1.44, C_METAL_GOLD)
    F.box(-8.98, -12.72, z + 1.39, -8.92, -12.48, z + 1.44, C_METAL_GOLD)
    # (d) 侧向冰水循环机组与紫铜冷媒弯管 (x: -9.65..-8.75, y: -11.45..-10.65)
    F.box(-9.65, -11.45, z + 0.03, -8.75, -10.65, z + 0.86, C_METAL_IRON) # 机柜箱体
    # 百叶散热排风栅格 (多道金属横条纹)
    for lz in (z + 0.25, z + 0.40, z + 0.55):
        F.box(-8.74, -11.35, lz, -8.72, -10.75, lz + 0.05, C_METAL_STEEL)
    # 顶部倾斜温控电控面板与蓝色数字温度表
    F.box(-9.55, -11.35, z + 0.86, -8.85, -10.75, z + 0.94, C_METAL_STEEL) # 控制台凸台
    F.box(-9.40, -11.20, z + 0.94, -9.00, -10.90, z + 0.96, C_SCREEN_GLOW) # 水温显示表 (4°C 恒温)
    F.cyl(-9.48, -10.82, 0.02, z + 0.94, z + 0.98, C_RED_EMERG, 6)          # 紧急停机红色旋钮
    # 双路进出水紫铜冷媒管 (管径 0.03m，接入水牢沉箱壁)
    F.beam3d((-9.15, -11.45, z + 0.40), (-9.15, -11.60, z + 0.25), 0.03, 0.03, C_METAL_GOLD)
    F.beam3d((-9.35, -11.45, z + 0.55), (-9.35, -11.60, z + 0.25), 0.03, 0.03, C_METAL_GOLD)

    # 2.2 生铁重型约束立柱 (八角铸铁地锚底盘 + 4颗膨胀螺栓 + 双段真皮防擦衬垫 + 4向吊耳与重力下垂锁链手铐)
    # 中心坐标 x = -7.20, y = -9.80
    F.cyl(-7.20, -9.80, 0.38, z + 0.03, z + 0.16, C_METAL_IRON, 6)   # 六角形重型铸铁法兰底座
    # 4 颗六角膨胀地锚螺栓 (金铜材质，分布在 r=0.30m 圆周)
    for th in np.linspace(0, 2 * math.pi, 4, endpoint=False):
        bx = -7.20 + 0.30 * math.cos(th); by = -9.80 + 0.30 * math.sin(th)
        F.cyl(bx, by, 0.020, z + 0.16, z + 0.20, C_METAL_GOLD, 4)
    # 阶梯式铸铁过渡台
    F.cyl(-7.20, -9.80, 0.24, z + 0.16, z + 0.22, C_METAL_STEEL, 6)
    # 主立柱管身 (r=0.18m，生铁锻黑，n=6)
    F.cyl(-7.20, -9.80, 0.18, z + 0.22, z + 1.34, C_METAL_IRON, 6)
    # 下段环抱真皮防擦衬垫 (腰臀位 z+0.42..z+0.72, r=0.22, C_LEATHER_RD)
    F.cyl(-7.20, -9.80, 0.22, z + 0.42, z + 0.72, C_LEATHER_RD, 6)
    F.cyl(-7.20, -9.80, 0.225, z + 0.40, z + 0.43, C_METAL_STEEL, 6) # 下精钢压圈
    F.cyl(-7.20, -9.80, 0.225, z + 0.71, z + 0.74, C_METAL_STEEL, 6) # 上精钢压圈
    # 上段环抱真皮防擦衬垫 (胸肩位 z+0.86..z+1.16, r=0.22, C_LEATHER_RD)
    F.cyl(-7.20, -9.80, 0.22, z + 0.86, z + 1.16, C_LEATHER_RD, 6)
    F.cyl(-7.20, -9.80, 0.225, z + 0.84, z + 0.87, C_METAL_STEEL, 6) # 下精钢压圈
    F.cyl(-7.20, -9.80, 0.225, z + 1.15, z + 1.18, C_METAL_STEEL, 6) # 上精钢压圈
    # 四向锻造金铜锁链吊耳与垂直自然下垂锁链 (肩高处 z+1.12m)
    for dx, dy in ((0.22, 0), (-0.22, 0), (0, 0.22), (0, -0.22)):
        F.box(-7.20 + dx - 0.03, -9.80 + dy - 0.03, z + 1.10, -7.20 + dx + 0.03, -9.80 + dy + 0.03, z + 1.18, C_METAL_GOLD)
    # 南北两侧自然下垂的精钢锁链条 (垂至 z+0.72m)
    for dy in (0.24, -0.24):
        for cz in (z + 0.80, z + 0.95):
            F.box(-7.22, -9.80 + dy - 0.015, cz, -7.18, -9.80 + dy + 0.015, cz + 0.08, C_METAL_STEEL)
        # 链端悬挂的一对实心铸铜手铐
        F.box(-7.24, -9.80 + dy - 0.04, z + 0.68, -7.16, -9.80 + dy + 0.04, z + 0.76, C_METAL_GOLD)
        F.cyl(-7.20, -9.80 + dy, 0.026, z + 0.69, z + 0.75, C_METAL_IRON, 6) # 手铐空心腕洞
    # 柱顶阶梯法兰与锻铁球形端盖 (最高点 z+1.43m，完全未切，自然完整圆润收口！)
    F.cyl(-7.20, -9.80, 0.22, z + 1.34, z + 1.38, C_METAL_STEEL, 6)
    F.cyl(-7.20, -9.80, 0.12, z + 1.38, z + 1.43, C_METAL_GOLD, 6)

    # 2.3 皮鞭机械受诫台 (三段式可调翻折铰链骨架 + 深红马鞍真皮台面 + 脊椎泄压中缝 + 大腿外展托架 + 滚柱针扣绑带 + 台底器具抽屉)
    # 中心坐标 x = -5.85, y = -12.30, 走向南北，长 1.85m，宽 0.70m
    # (a) 双主承重工字钢地梁与液压俯仰机构
    F.box(-6.15, -13.15, z + 0.03, -6.07, -11.45, z + 0.28, C_METAL_IRON) # 西纵梁
    F.box(-5.63, -13.15, z + 0.03, -5.55, -11.45, z + 0.28, C_METAL_IRON) # 东纵梁
    F.box(-6.15, -13.10, z + 0.03, -5.55, -13.02, z + 0.12, C_METAL_STEEL) # 南横拉杆
    F.box(-6.15, -11.58, z + 0.03, -5.55, -11.50, z + 0.12, C_METAL_STEEL) # 北横拉杆
    # 4 处调平地脚底盘
    for fx in (-6.11, -5.59):
        for fy in (-13.10, -11.50):
            F.cyl(fx, fy, 0.035, z + 0.03, z + 0.07, C_METAL_GOLD, 6)
    # 中部角度调节液压缸与铰接齿轮盘
    F.cyl(-5.85, -12.30, 0.05, z + 0.10, z + 0.42, C_METAL_STEEL, 8)
    F.box(-5.92, -12.34, z + 0.38, -5.78, -12.26, z + 0.46, C_METAL_GOLD)
    # (b) 三段式分体床面 (深红马鞍真皮 C_LEATHER_RD + 法式双缝外滚边 C_LEATHER_DK)
    # 段 1：胸腹躯干前倾板 (y: -13.15..-12.45, 倾斜升起 z+0.42..z+0.58)
    F.beam3d((-5.85, -13.15, z + 0.44), (-5.85, -12.45, z + 0.58), 0.58, 0.09, C_LEATHER_RD)
    # 脊椎泄压中缝 (中央 0.06m 宽下凹暗槽)
    F.beam3d((-5.85, -13.15, z + 0.455), (-5.85, -12.45, z + 0.595), 0.07, 0.02, C_LEATHER_DK)
    # 段 2：骨盆臀部主承重板 (y: -12.45..-11.95, 水平段，高 z+0.58..z+0.67)
    F.box(-6.14, -12.45, z + 0.58, -5.56, -11.95, z + 0.67, C_LEATHER_RD)
    F.box(-6.15, -12.46, z + 0.57, -5.55, -11.94, z + 0.59, C_LEATHER_DK) # 边缘真皮滚边
    # 段 3：小腿屈曲折叠板 (y: -11.95..-11.45, 向北下折 z+0.67..z+0.48)
    F.beam3d((-5.85, -11.95, z + 0.65), (-5.85, -11.45, z + 0.48), 0.58, 0.09, C_LEATHER_RD)
    # (c) 两侧大腿外展弧形托架 (左右外挑精钢管 + 真皮腿垫)
    for tx in (-6.25, -5.45):
        F.box(tx - 0.04, -12.35, z + 0.50, tx + 0.04, -12.05, z + 0.66, C_METAL_STEEL) # 托架钢构
        F.box(tx - 0.05, -12.33, z + 0.64, tx + 0.05, -12.07, z + 0.70, C_LEATHER_DK)   # 大腿支撑软垫
    # (d) 4 组精钢双排滚柱针扣真皮约束带 (带自然垂直下垂的皮带尾舌)
    for sy in (-12.85, -12.60, -12.20, -11.70):
        sz = z + 0.50 if sy < -12.5 else (z + 0.68 if sy < -12.0 else z + 0.58)
        # 横向黑色真皮带
        F.box(-6.15, sy - 0.022, sz, -5.55, sy + 0.022, sz + 0.016, C_LEATHER_DK)
        # 两侧针扣五金 (精钢 C_METAL_STEEL)
        F.box(-6.17, sy - 0.025, sz - 0.005, -6.13, sy + 0.025, sz + 0.022, C_METAL_STEEL)
        F.box(-5.57, sy - 0.025, sz - 0.005, -5.53, sy + 0.025, sz + 0.022, C_METAL_STEEL)
        # 受重力自然贴着台侧下垂的皮带尾舌 (垂长 0.10m)
        F.box(-6.17, sy - 0.02, sz - 0.10, -6.15, sy + 0.02, sz, C_LEATHER_DK)
    # (e) 台底抽拉式五金工具承托盘与训诫皮拍
    F.box(-6.08, -12.40, z + 0.28, -5.62, -12.00, z + 0.38, C_METAL_STEEL) # 托盘抽屉
    F.box(-5.61, -12.25, z + 0.31, -5.57, -12.15, z + 0.35, C_METAL_GOLD)  # 镀金拉手
    F.box(-6.00, -12.35, z + 0.38, -5.70, -12.05, z + 0.40, C_WOOD_WALNUT) # 摆放的训诫木拍

    # 2.4 北联进口微电击拘束仪与军械展示橱窗 (19英寸机架台 + 脉冲表盘 + 急停开关 + 和光/爱语风通顶防爆玻璃冷柜)
    # (a) 北联机架式微电击控制台 (x: -6.35..-5.55, y: -10.75..-9.95, 高 z+0.03..z+1.08m)
    F.box(-6.35, -10.75, z + 0.03, -5.55, -9.95, z + 0.72, C_METAL_IRON)   # 重型工业机柜底座
    # 前百叶散热孔与工业锁孔
    for bz in (z + 0.20, z + 0.40):
        F.box(-6.36, -10.65, bz, -6.34, -10.05, bz + 0.05, C_METAL_STEEL)
    # 25度倾角 19 英寸控制操作斜台 (z+0.72..z+1.08)
    F.box(-6.30, -10.70, z + 0.72, -5.60, -10.00, z + 0.98, C_METAL_STEEL) # 仪表斜台基板
    # 双联圆形模拟微安表盘 (高光刻度表与微光荧光背景)
    for my in (-10.55, -10.25):
        F.cyl(-5.95, my, 0.065, z + 0.98, z + 1.01, C_METAL_IRON, 8)
        F.cyl(-5.95, my, 0.055, z + 1.01, z + 1.02, C_SCREEN_GLOW, 8)
    # 4 颗步进式精细微安调节旋钮 (金铜凸起)
    for kx in (-6.18, -6.10):
        for ky in (-10.55, -10.25):
            F.cyl(kx, ky, 0.018, z + 0.98, z + 1.03, C_METAL_GOLD, 6)
    # 紧急红色大蘑菇急停切断拍钮
    F.cyl(-5.75, -10.55, 0.032, z + 0.98, z + 1.05, C_RED_EMERG, 8)
    F.cyl(-5.75, -10.55, 0.040, z + 0.98, z + 1.00, C_METAL_IRON, 8) # 急停保护防误触座
    # 双极脉冲输出接线柱插座
    F.cyl(-5.75, -10.25, 0.015, z + 0.98, z + 1.04, C_RED_EMERG, 4)   # 正极红
    F.cyl(-5.75, -10.15, 0.015, z + 0.98, z + 1.04, C_METAL_IRON, 4)  # 负极黑

    # (b) 通顶嵌入式防爆玻璃刑具展柜 (x: -5.75..-5.15, y: -9.50..-6.80, 高度严格收口于 z+1.44m！)
    F.box(-5.75, -9.50, z + 0.03, -5.15, -6.80, z + 0.30, C_WOOD_WALNUT) # 黑胡桃实木踢脚底座
    F.box(-5.75, -9.50, z + 1.36, -5.15, -6.80, z + 1.44, C_WOOD_WALNUT) # 黑胡桃实木顶盖 (自然收口于 1.44m！)
    # 展柜立柱骨架
    for yk in (-9.50, -6.85):
        F.box(-5.75, yk, z + 0.30, -5.70, yk + 0.05, z + 1.36, C_WOOD_WALNUT)
        F.box(-5.20, yk, z + 0.30, -5.15, yk + 0.05, z + 1.36, C_WOOD_WALNUT)
    # 防爆玻璃外罩 (青绿高透 C_GLASS_CYAN)
    F.box(-5.72, -9.48, z + 0.30, -5.18, -6.82, z + 1.36, C_GLASS_CYAN)
    # 内部两层钢化发光玻璃隔板 (z+0.65 与 z+1.00)
    for gz in (z + 0.65, z + 1.00):
        F.box(-5.68, -9.42, gz, -5.22, -6.88, gz + 0.02, C_ETHER_CYAN)
    # 下层展物：真皮束颈软包项圈与金属锁具托盘
    F.box(-5.62, -9.20, z + 0.32, -5.28, -8.30, z + 0.35, C_CARPET_BURGUNDY) # 天鹅绒陈列托盘
    for cy in (-9.00, -8.65):
        F.cyl(-5.45, cy, 0.065, z + 0.35, z + 0.42, C_LEATHER_DK, 4)       # 真皮项圈
        F.cyl(-5.45, cy, 0.050, z + 0.35, z + 0.43, C_WOOD_WALNUT, 4)      # 颈模支撑芯
        F.box(-5.53, cy - 0.015, z + 0.36, -5.49, cy + 0.015, z + 0.41, C_METAL_GOLD) # 金铜扣件
    # 中层展物：训诫皮鞭与手柄挂放
    for by in (-9.10, -8.40, -7.70, -7.00):
        F.box(-5.55, by - 0.02, z + 0.67, -5.35, by + 0.02, z + 0.70, C_LEATHER_RD)  # 散鞭/马鞭
        F.cyl(-5.56, by, 0.012, z + 0.67, z + 0.71, C_METAL_GOLD, 4)                 # 金铜手柄圈
    # 上层展物：微电击备用导电电极盒与特种医用润滑瓶组
    for py in (-7.70, -7.30):
        F.cyl(-5.45, py, 0.035, z + 1.02, z + 1.15, C_BOTTLE_GLASS, 4)               # 玻璃瓶
        F.cyl(-5.45, py, 0.015, z + 1.15, z + 1.19, C_METAL_GOLD, 4)                 # 金铜瓶塞

    # 2.5 地锚跪姿拘束排与羞辱展示台 (x: -8.5..-6.4, y: -13.7..-12.7)
    F.box(-8.50, -13.70, z + 0.03, -6.40, -12.70, z + 0.16, C_WOOD_WALNUT) # 黑胡桃基底台
    F.box(-8.45, -13.65, z + 0.16, -6.45, -12.75, z + 0.21, C_LEATHER_DK)   # 加厚高密度防滑深黑皮革跪垫
    # 3 组地面双孔工字地锚卡槽与金铜 D 形拉环 (ax = -8.0, -7.4, -6.8)
    for ax in (-8.0, -7.4, -6.8):
        F.box(ax - 0.15, -13.35, z + 0.21, ax + 0.15, -13.05, z + 0.24, C_METAL_STEEL) # 地锚不锈钢基板
        for dy in (-13.25, -13.15):
            F.cyl(ax, dy, 0.025, z + 0.24, z + 0.28, C_METAL_GOLD, 4)               # 金铜 D 环

    # 2.6 门旁监控记录终端与遥控主控箱 (x: -6.1..-5.25, y: -7.8..-6.7, 高度 z+0.03..z+1.35m)
    F.box(-6.10, -7.80, z + 0.03, -5.25, -6.70, z + 0.82, C_METAL_IRON)   # 下部机柜
    F.box(-6.05, -7.75, z + 0.82, -5.30, -6.75, z + 0.90, C_METAL_STEEL)  # 键盘操作台面
    F.box(-5.95, -7.60, z + 0.83, -5.40, -7.10, z + 0.85, C_LEATHER_DK)   # 键盘键位区
    # 上部斜面双联防爆工业监控显示器 (荧光深青 C_SCREEN_GLOW)
    F.box(-6.02, -7.70, z + 0.90, -5.35, -6.80, z + 1.35, C_METAL_IRON)   # 显示器外壳 (收口于 1.35m)
    F.box(-5.98, -7.65, z + 0.94, -5.39, -6.85, z + 1.31, C_SCREEN_GLOW)  # 监视屏荧光画面

    # ========================================================================
    # 3. 医疗与改造室 B2-C02 (-5..1.25, -14..-6)
    # ========================================================================
    # 3.1 双联立式以太生化恢复/培养舱 (八角防爆底盘 + 聚碳酸酯视窗 + 舱内仿生脊柱导轨与呼吸管路 + 顶部冷凝换热环)
    # 严格控制最高点在 z+1.43m，完全保留冷凝穹顶，杜绝平切削顶！
    for px in (-4.30, -3.20):
        # 防爆底座法兰 (r=0.52m, 五边形, 高 z+0.03..z+0.22)
        F.cyl(px, -11.80, 0.52, z + 0.03, z + 0.22, C_METAL_STEEL, 5)
        # 聚碳酸酯外视窗 (r=0.46m, 五边形, 高 z+0.22..z+1.32, C_GLASS_CYAN)
        F.cyl(px, -11.80, 0.46, z + 0.22, z + 1.32, C_GLASS_CYAN, 5)
        # 内部以太培养液与冷光核心 (立体发光方柱, 高 z+0.24..z+1.28, C_ETHER_CYAN)
        F.box(px - 0.28, -12.08, z + 0.24, px + 0.28, -11.52, z + 1.28, C_ETHER_CYAN)
        # 舱内仿生脊椎固定导轨 (带颈腰卡托, 生铁 C_METAL_IRON)
        F.box(px - 0.06, -11.55, z + 0.35, px + 0.06, -11.45, z + 1.15, C_METAL_IRON)
        F.box(px - 0.12, -11.53, z + 0.70, px + 0.12, -11.47, z + 0.74, C_METAL_STEEL) # 腰托横杆
        # 顶部冷凝换热环与状态监视环 (最高点收口于 z+1.43m！)
        F.cyl(px, -11.80, 0.48, z + 1.32, z + 1.38, C_METAL_STEEL, 5)
        F.box(px - 0.25, -12.05, z + 1.38, px + 0.25, -11.55, z + 1.43, C_METAL_GOLD)

    # 3.2 多轴机械改造手术台与侧向弧形仪器托盘 (中心旋转液压柱 + 四段可调床面 + 精细器械摆放)
    # 中心坐标 x = -1.80, y = -10.20
    # (a) 重型液压旋转底盘 (r=0.36m, 高 z+0.03..z+0.18, C_METAL_STEEL, n=6)
    F.cyl(-1.80, -10.20, 0.36, z + 0.03, z + 0.18, C_METAL_STEEL, 6)
    # 伸缩液压动力主柱 (r=0.14m, 镀硬铬高光精钢, 高 z+0.18..z+0.52)
    F.cyl(-1.80, -10.20, 0.14, z + 0.18, z + 0.52, C_METAL_STEEL, 6)
    # (b) 四段式分节手术床面 (长 1.90m, 宽 0.64m, 高 z+0.52..z+0.66)
    # 骨盆臀段 (中段, 水平承重基盘)
    F.box(-2.12, -10.45, z + 0.52, -1.48, -9.95, z + 0.66, C_LEATHER_DK)
    F.box(-2.14, -10.46, z + 0.52, -1.46, -9.94, z + 0.55, C_METAL_STEEL) # 不锈钢附件导轨
    # 胸背躯干段 (南段, 微倾 8°)
    F.beam3d((-1.80, -10.45, z + 0.59), (-1.80, -11.05, z + 0.62), 0.62, 0.12, C_LEATHER_DK)
    # 头部可调节呼吸枕托 (最南端, 设颈椎凹槽, 高 z+0.62..z+0.70m)
    F.box(-1.96, -11.25, z + 0.60, -1.64, -11.05, z + 0.70, C_LEATHER_DK)
    # 双腿分叉独立腿托 (北段, 分左右两扇下倾板)
    F.beam3d((-2.00, -9.95, z + 0.58), (-2.00, -9.35, z + 0.46), 0.26, 0.10, C_LEATHER_DK) # 左腿托
    F.beam3d((-1.60, -9.95, z + 0.58), (-1.60, -9.35, z + 0.46), 0.26, 0.10, C_LEATHER_DK) # 右腿托
    # (c) 侧向弧形器械托盘与精细外科器械 (x: -1.35..-0.95, y: -10.40..-9.90, 高 z+0.70..z+0.78m)
    F.beam3d((-1.48, -10.20, z + 0.54), (-1.25, -10.15, z + 0.70), 0.03, 0.03, C_METAL_STEEL) # 悬臂铰链
    F.box(-1.35, -10.40, z + 0.70, -0.95, -9.90, z + 0.73, C_METAL_STEEL)                      # 医用不锈钢托盘
    # 托盘上精细摆放的外科手术刀 (高光精钢与金铜手柄圈)
    F.box(-1.30, -10.18, z + 0.73, -1.02, -10.14, z + 0.745, C_METAL_STEEL)
    F.box(-1.05, -10.19, z + 0.73, -1.00, -10.13, z + 0.750, C_METAL_GOLD)

    # 3.3 移动式三联铰接无影灯 (配重防滑底座 + 双平衡弹簧机械臂 + 三联圆形 LED 灯盘)
    # 基座坐标 x = -2.55, y = -11.35 (立式落地无影灯，彻底移出切面截削区，收口于 z+1.42m！)
    # (a) 配重三脚架底盘
    F.cyl(-2.55, -11.35, 0.28, z + 0.03, z + 0.12, C_METAL_STEEL, 5) # 配重盘
    # (b) 垂直平衡立柱
    F.cyl(-2.55, -11.35, 0.045, z + 0.12, z + 0.88, C_WHITE_CAB, 4)
    # (c) 双平行铰接悬臂 (从 z+0.88 伸向手术台方向，在 z+1.34 处支撑灯盘)
    F.beam3d((-2.55, -11.35, z + 0.88), (-2.20, -10.85, z + 1.34), 0.035, 0.035, C_METAL_STEEL) # 下悬臂
    F.beam3d((-2.20, -10.85, z + 1.34), (-1.95, -10.45, z + 1.38), 0.030, 0.030, C_METAL_STEEL) # 上悬臂
    # (d) 三联多角度 LED 灯盘 (中心 x = -1.95, y = -10.45, 倾角朝向手术台，最高点 z+1.42m)
    for dx, dy in ((-0.16, 0.05), (0.16, 0.05), (0.00, -0.16)):
        lx = -1.95 + dx; ly = -10.45 + dy
        F.cyl(lx, ly, 0.14, z + 1.36, z + 1.42, C_WHITE_CAB, 4)       # 银白灯盘罩
        F.box(lx - 0.08, ly - 0.08, z + 1.35, lx + 0.08, ly + 0.08, z + 1.37, C_ETHER_CYAN) # 冷白高亮以太青发光面

    # 3.4 悬臂监护仪双联大屏 (连接立柱，显示多导联生命体征曲线)
    F.cyl(-2.40, -9.80, 0.035, z + 0.03, z + 1.05, C_METAL_STEEL, 4) # 支架立柱
    F.box(-2.55, -9.95, z + 0.90, -2.15, -9.65, z + 1.32, C_METAL_IRON)   # 双屏外壳
    F.box(-2.52, -9.92, z + 0.94, -2.18, -9.68, z + 1.28, C_SCREEN_GLOW)  # 青光心电体征曲线屏

    # 3.5 EQ-50/51 急救站、高温高压蒸汽灭菌柜与不锈钢洗消台柜 (x: 0.25..1.15, y: -13.5..-7.6)
    # (a) 医用洗消底柜长台 (高 z+0.03..z+0.86m, 白色洁净柜身 + 不锈钢台面)
    F.box(0.25, -13.50, z + 0.03, 1.15, -7.60, z + 0.82, C_WHITE_CAB)
    F.box(0.23, -13.52, z + 0.82, 1.17, -7.58, z + 0.86, C_METAL_STEEL) # 不锈钢操作台面
    # (b) 嵌入式双槽洗手池与感应水龙头 (y: -13.2..-12.2)
    F.box(0.38, -13.20, z + 0.65, 0.98, -12.20, z + 0.86, C_METAL_STEEL) # 水池下凹不锈钢槽
    F.box(0.66, -12.38, z + 0.86, 0.70, -12.34, z + 1.12, C_METAL_STEEL) # 感应水龙头立柱
    F.box(0.66, -12.44, z + 1.08, 0.70, -12.34, z + 1.12, C_METAL_STEEL) # 出水咀横管
    # (c) 高温高压蒸汽灭菌柜 (y: -11.9..-10.8, 圆形密封舱门, 最高点 z+1.40m)
    F.box(0.32, -11.90, z + 0.86, 1.08, -10.80, z + 1.38, C_METAL_STEEL) # 灭菌柜主体
    F.cyl(0.31, -11.35, 0.20, z + 0.95, z + 1.30, C_METAL_IRON, 5)       # 圆形防爆加压舱门
    F.cyl(0.29, -11.35, 0.06, z + 1.08, z + 1.17, C_METAL_GOLD, 4)       # 旋转加压转轮把手
    # (d) EQ-50 挂墙急救箱与绿色医疗十字 (y: -10.4..-9.2, 高 z+0.92..z+1.42m)
    F.box(0.40, -10.40, z + 0.92, 1.12, -9.20, z + 1.42, C_WHITE_CAB)    # 急救箱双门柜
    # 醒目绿色医疗十字 (0.15, 0.72, 0.32)
    F.box(0.38, -9.90, z + 1.08, 0.40, -9.70, z + 1.28, (0.15, 0.72, 0.32)) # 竖条
    F.box(0.38, -10.00, z + 1.14, 0.40, -9.60, z + 1.22, (0.15, 0.72, 0.32)) # 横条
    # (e) 医疗供氧瓶组 (天蓝高压氧气瓶 2 瓶, y: -8.8..-8.2)
    F.cyl(0.72, -8.70, 0.10, z + 0.03, z + 0.86, (0.25, 0.65, 0.85), 4)
    F.cyl(0.72, -8.35, 0.10, z + 0.03, z + 0.86, (0.25, 0.65, 0.85), 4)
    F.cyl(0.72, -8.70, 0.03, z + 0.86, z + 0.92, C_METAL_GOLD, 4)        # 减压阀
    F.cyl(0.72, -8.35, 0.03, z + 0.86, z + 0.92, C_METAL_GOLD, 4)

    # 3.6 全身生物扫描拱门与微电流神经调控机柜 (x: -4.6..-3.4, y: -9.6..-8.2)
    # (a) 防静电穿行踏板
    F.pad(-4.50, -9.50, z + 0.03, -3.50, -8.30, z + 0.07, C_FLOOR_GRID)
    # (b) 双立柱与顶部扫描拱桥 (最高点严格收口于 z+1.44m！)
    F.box(-4.55, -9.50, z + 0.07, -4.35, -8.30, z + 1.36, C_WHITE_CAB) # 西侧立柱
    F.box(-3.65, -9.50, z + 0.07, -3.45, -8.30, z + 1.36, C_WHITE_CAB) # 东侧立柱
    F.box(-4.55, -9.50, z + 1.36, -3.45, -8.30, z + 1.44, C_WHITE_CAB) # 顶部横跨拱桥
    # 拱桥内侧激光扫描光带 (青光 C_ETHER_CYAN)
    F.box(-4.34, -9.45, z + 1.32, -3.66, -8.35, z + 1.36, C_ETHER_CYAN)
    # (c) 侧置微电流神经调控操作台 (y: -8.1..-7.4)
    F.box(-4.55, -8.10, z + 0.03, -3.85, -7.40, z + 0.85, C_WHITE_CAB) # 机柜
    F.box(-4.50, -8.05, z + 0.85, -3.90, -7.45, z + 1.15, C_SCREEN_GLOW) # 调控监视屏

    # 3.7 脑波监测全息终端与主治调教医生工作站 (x: -4.6..-3.0, y: -7.3..-6.3)
    F.box(-4.55, -7.30, z + 0.03, -3.05, -6.40, z + 0.74, C_WHITE_CAB)  # 人体工学办公长台
    F.box(-4.50, -7.25, z + 0.74, -3.10, -6.45, z + 0.77, C_WOOD_WALNUT) # 深胡桃台面
    # 双联多通道脑电示波大曲面屏 (最高点 z+1.32m)
    F.box(-4.40, -7.05, z + 0.77, -3.20, -6.65, z + 1.28, C_METAL_IRON)
    F.box(-4.35, -7.00, z + 0.80, -3.25, -6.70, z + 1.25, C_SCREEN_GLOW)
    # 医生高背办公转椅 (五星滚轮脚 + 深黑真皮椅面, 收口于 z+1.05m)
    F.cyl(-3.75, -6.85, 0.22, z + 0.03, z + 0.10, C_METAL_STEEL, 5) # 五星底座
    F.cyl(-3.75, -6.85, 0.03, z + 0.10, z + 0.42, C_METAL_STEEL, 4) # 气压杆
    F.box(-3.95, -7.02, z + 0.42, -3.55, -6.68, z + 0.48, C_LEATHER_DK) # 坐垫
    F.box(-3.95, -7.02, z + 0.48, -3.55, -6.94, z + 0.98, C_LEATHER_DK) # 高靠背

    # ========================================================================
    # 4. 档案室 B2-C03 (20 ㎡, 10..16, -14..-10.67)
    # ========================================================================
    # 4.1 南墙绝密契约防爆保险箱机柜群 (Top-Secret Contract Vault Cubicles, 5m 跨度, 最高点 z+1.44m)
    F.box(10.50, -13.60, z + 0.03, 15.50, -12.70, z + 0.12, C_METAL_IRON)
    F.box(10.50, -13.60, z + 0.12, 15.50, -12.70, z + 1.36, (0.24, 0.26, 0.28))
    F.box(10.45, -13.65, z + 1.36, 15.55, -12.65, z + 1.44, C_METAL_IRON) # 顶部精钢联锁横梁 (z+1.44m)
    # 4 扇加厚防钻碳化钨合金门扇 (面向北侧操作面 y: -12.70)
    F.box(10.60, -12.70, z + 0.18, 15.40, -12.66, z + 1.30, C_METAL_STEEL) # 贯通式碳化钨重装防钻防护门板
    for cx in (11.20, 12.40, 13.60, 14.80):
        F.box(cx - 0.12, -12.66, z + 0.82, cx + 0.12, -12.64, z + 1.06, C_METAL_GOLD)  # 机械密码轮盘
        F.box(cx - 0.08, -12.66, z + 0.52, cx + 0.08, -12.64, z + 0.62, C_SCREEN_GLOW) # 电子芯片感应插槽

    # 4.2 西墙物理断网独立闭路监控机柜阵列 (Air-Gapped CCTV Server Racks)
    F.box(10.45, -12.20, z + 0.03, 11.20, -10.95, z + 0.10, C_METAL_IRON) # 防震底座
    F.box(10.45, -12.20, z + 0.10, 11.20, -10.95, z + 1.38, (0.18, 0.20, 0.22)) # 主柜体
    F.box(10.45, -11.75, z + 1.38, 11.20, -11.45, z + 1.44, C_METAL_STEEL) # 顶部弱电桥架 (z+1.44m)
    F.box(11.20, -12.05, z + 0.35, 11.23, -11.10, z + 1.15, C_SCREEN_GLOW) # 蓝色监控数据流与状态指示屏

    # 4.3 东墙身份鉴权与契约激光封印台 (Authentication & Sealing Terminal)
    F.box(14.85, -12.20, z + 0.03, 15.55, -10.95, z + 0.85, (0.28, 0.30, 0.32)) # 合金柜台
    F.box(14.80, -12.25, z + 0.85, 15.60, -10.90, z + 0.90, C_METAL_GOLD)        # 钛金台面
    F.box(15.00, -11.90, z + 0.90, 15.40, -11.50, z + 1.25, C_GLASS_CYAN)        # 防辐射激光压罩 (z+1.25m)

    # 4.4 中央档案查阅与审核台 (Consultation & Review Desk)
    F.box(12.20, -12.00, z + 0.03, 13.80, -11.20, z + 0.74, C_WOOD_WALNUT)       # 黑胡桃木桌身
    F.box(12.15, -12.05, z + 0.74, 13.85, -11.15, z + 0.78, C_WOOD_WALNUT)       # 台面
    F.box(12.60, -11.80, z + 0.78, 13.40, -11.40, z + 1.15, C_SCREEN_GLOW)       # 保密档案审核液晶屏
    # 查阅转椅 (气压立柱底座 + 鞍皮座垫 + 深红小牛皮高靠背, 收口于 z+1.05m)
    F.box(12.82, -12.52, z + 0.03, 13.18, -12.18, z + 0.42, C_METAL_STEEL)       # 气压立柱底座
    F.box(12.78, -12.55, z + 0.42, 13.22, -12.15, z + 0.48, C_LEATHER_DK)        # 鞍皮座垫
    F.box(12.78, -12.55, z + 0.48, 13.22, -12.47, z + 1.05, C_LEATHER_RD)        # 深红高靠背

    # ========================================================================
    # 5. 储藏室 B2-C04 (30 ㎡, 10..16, -10.67..-6)
    # ========================================================================
    # 5.1 西侧与东侧重型角钢防潮物料货架群与标准化航空铝箱
    # (a) 西侧重型货架 (x: 10.45..11.25, y: -10.4..-6.5, 最高点 z+1.38m)
    F.box(10.45, -10.40, z + 0.03, 10.55, -6.50, z + 1.38, C_METAL_STEEL)         # 靠墙角钢背板立柱
    F.box(10.45, -10.40, z + 0.03, 11.25, -6.50, z + 0.12, C_METAL_IRON)          # 底层框架
    F.box(10.45, -10.40, z + 0.52, 11.25, -6.50, z + 0.55, C_METAL_IRON)          # 中层层板
    F.box(10.45, -10.40, z + 0.92, 11.25, -6.50, z + 0.95, C_METAL_IRON)          # 高层层板
    F.box(10.45, -10.40, z + 1.35, 11.25, -6.50, z + 1.38, C_METAL_STEEL)         # 顶梁框 (z+1.38m)
    # 3 层标准化密封航空铝特种物资箱群
    for by0, by1 in ((-10.15, -8.55), (-8.35, -6.75)):
        F.box(10.55, by0, z + 0.12, 11.18, by1, z + 0.48, (0.72, 0.74, 0.76))
        F.box(10.55, by0, z + 0.55, 11.18, by1, z + 0.88, (0.72, 0.74, 0.76))
        F.box(10.55, by0, z + 0.95, 11.18, by1, z + 1.28, (0.72, 0.74, 0.76))

    # (b) 东侧重型货架 (x: 14.75..15.55, y: -10.4..-6.5, 最高点 z+1.38m)
    F.box(15.45, -10.40, z + 0.03, 15.55, -6.50, z + 1.38, C_METAL_STEEL)         # 靠墙角钢背板立柱
    F.box(14.75, -10.40, z + 0.03, 15.55, -6.50, z + 0.12, C_METAL_IRON)
    F.box(14.75, -10.40, z + 0.52, 15.55, -6.50, z + 0.55, C_METAL_IRON)
    F.box(14.75, -10.40, z + 0.92, 15.55, -6.50, z + 0.95, C_METAL_IRON)
    F.box(14.75, -10.40, z + 1.35, 15.55, -6.50, z + 1.38, C_METAL_STEEL)
    for by0, by1 in ((-10.15, -8.55), (-8.35, -6.75)):
        F.box(14.82, by0, z + 0.12, 15.45, by1, z + 0.48, (0.72, 0.74, 0.76))
        F.box(14.82, by0, z + 0.55, 15.45, by1, z + 0.88, (0.72, 0.74, 0.76))
        F.box(14.82, by0, z + 0.95, 15.45, by1, z + 1.28, (0.72, 0.74, 0.76))

    # 5.2 应急医疗急救站 EQ-51 (位于南墙东侧 x: 13.65..14.65, y: -10.50..-9.85，避开 x=13.0 门洞)
    F.box(13.65, -10.50, z + 0.03, 14.65, -9.85, z + 1.36, C_WHITE_CAB)            # 医用白柜体
    F.box(13.62, -10.52, z + 1.36, 14.68, -9.83, z + 1.42, C_METAL_STEEL)          # 顶部收口顶盖 (z+1.42m)
    F.box(13.85, -9.85, z + 0.70, 14.45, -9.82, z + 1.06, (0.12, 0.72, 0.28))     # 柜门立体凸起绿色医疗十字
    # 壁挂高压氧气钢瓶组 (天蓝瓶体 + 金铜减压阀)
    F.box(14.40, -9.82, z + 0.12, 14.62, -9.70, z + 0.96, (0.25, 0.65, 0.85))
    F.box(14.42, -9.80, z + 0.96, 14.60, -9.72, z + 1.05, C_METAL_GOLD)

    # 5.3 应急防汛排污泵组与管道逆止阀 (位于南墙西侧 x: 11.35..12.35, y: -10.50..-9.80)
    F.box(11.35, -10.50, z + 0.03, 12.35, -9.80, z + 0.16, C_METAL_IRON)          # 积水井铸铁围堰
    F.box(11.40, -10.45, z + 0.16, 12.30, -9.85, z + 0.18, C_FLOOR_GRID)          # 排水格栅
    # 双联排污泵与排污立管
    F.box(11.50, -10.35, z + 0.18, 12.20, -10.05, z + 0.58, (0.22, 0.24, 0.26))   # 双联排污泵体
    F.box(11.55, -10.30, z + 0.58, 12.15, -10.15, z + 1.35, C_METAL_IRON)         # 排污立管组 (z+1.35m)
    F.box(11.52, -10.32, z + 0.85, 12.18, -10.13, z + 0.98, C_METAL_GOLD)         # 金铜逆止阀体

    # 5.4 中央拆包、质检与分装岛台 (x: 12.40..13.60, y: -8.85..-7.85)
    F.box(12.40, -8.85, z + 0.03, 13.60, -7.85, z + 0.78, (0.32, 0.35, 0.38))     # 不锈钢主架
    F.box(12.35, -8.90, z + 0.78, 13.65, -7.80, z + 0.84, C_METAL_STEEL)          # 厚实拉丝不锈钢台面
    F.box(12.70, -8.55, z + 0.84, 13.30, -8.10, z + 1.05, (0.68, 0.70, 0.72))     # 待检航空特种零件工具箱

    # ========================================================================
    # 6. 机电设备间与结界发生器 (198 ㎡, -14..4, -3..8)
    # ========================================================================
    # 6.1 浮岛以太结界共鸣核心 (八角沉箱定子环道 + 正交四向导磁线圈 + 中央以太共鸣晶核 + 顶部等离子体聚焦发射罩)
    xc, yc = -5.0, 3.0
    # (a) 六角绝缘防爆环道与环形导磁定子基座 (外径 1.85m, 六角棱柱)
    F.cyl(xc, yc, 1.85, z + 0.12, z + 0.32, C_METAL_IRON, 6)
    F.cyl(xc, yc, 1.62, z + 0.22, z + 0.33, (0.10, 0.28, 0.38), 6)   # 以太冷却循环环槽
    # 4 组四向重型定子电磁导磁线圈组 (东、南、西、北)
    for ca, sa in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        rx, ry = xc + 1.25 * ca, yc + 1.25 * sa
        F.box(rx - 0.15, ry - 0.15, z + 0.32, rx + 0.15, ry + 0.15, z + 0.65, C_METAL_GOLD)
    # (b) 中央以太共鸣晶体基座与能量晶核
    F.cyl(xc, yc, 0.68, z + 0.12, z + 0.48, C_METAL_IRON, 6)   # 六角锻造合金基座
    F.cyl(xc, yc, 0.56, z + 0.48, z + 0.58, C_METAL_GOLD, 6)   # 次级电磁悬浮驱动环
    F.cyl(xc, yc, 0.40, z + 0.58, z + 1.26, C_ETHER_CYAN, 6)   # 耐压以太共鸣晶体柱 (n=6)
    # (c) 顶部等离子体聚焦端盖与六角端帽 (最高点严格收口在 z+1.43m，留出 7cm 剖切净空)
    F.cyl(xc, yc, 0.48, z + 1.26, z + 1.34, C_METAL_IRON, 6)
    F.cyl(xc, yc, 0.32, z + 1.34, z + 1.43, C_METAL_GOLD, 6)

    # 6.2 四角磁束能导流柱 (四根重型金属方管导轨 + 阶梯绝缘陶瓷套管 + 顶部大电流铜质汇流排)
    for px, py in ((-6.4, 1.6), (-3.6, 1.6), (-6.4, 4.4), (-3.6, 4.4)):
        F.box(px - 0.16, py - 0.16, z + 0.09, px + 0.16, py + 0.16, z + 0.18, C_METAL_IRON)   # 底部铸铁地锚底盘
        F.box(px - 0.07, py - 0.07, z + 0.18, px + 0.07, py + 0.07, z + 1.35, C_METAL_STEEL)  # 垂直精钢方柱导轨
        # 特高压绝缘陶瓷套管 (采用特高压棕红绝缘色，高硬度方柱节)
        F.box(px - 0.14, py - 0.14, z + 0.65, px + 0.14, py + 0.14, z + 0.85, (0.48, 0.20, 0.12))
        F.box(px - 0.10, py - 0.10, z + 1.28, px + 0.10, py + 0.10, z + 1.35, C_METAL_GOLD)   # 柱顶金铜接线套管

    # 顶部铜质大电流汇流排框架 (Heavy-Current Busbar，高度 z+1.36..z+1.42m，连接四角导流柱)
    F.box(-6.44, 1.56, z + 1.36, -6.36, 4.44, z + 1.42, C_METAL_GOLD) # 西侧主母排
    F.box(-3.64, 1.56, z + 1.36, -3.56, 4.44, z + 1.42, C_METAL_GOLD) # 东侧主母排
    F.box(-6.44, 1.56, z + 1.36, -3.56, 1.64, z + 1.42, C_METAL_GOLD) # 南侧主母排
    F.box(-6.44, 4.36, z + 1.36, -3.56, 4.44, z + 1.42, C_METAL_GOLD) # 北侧主母排

    # 6.3 远程主控 SCADA 实体物理控制台 (面向主视口与结界核心)
    # (a) 承重主下柜 (z+0.03..z+0.72)
    F.box(-7.4, -0.50, z + 0.03, -2.6, 0.25, z + 0.72, C_METAL_IRON)
    F.box(-7.3, 0.25, z + 0.08, -2.7, 0.28, z + 0.68, (0.24, 0.26, 0.28))   # 柜体正面检修门
    # (b) 操作台面与人体工学前倾托腕
    F.box(-7.3, 0.12, z + 0.72, -2.7, 0.24, z + 0.76, C_LEATHER_DK)          # 鞍皮防疲劳托腕
    F.box(-7.2, -0.15, z + 0.72, -2.8, 0.12, z + 0.76, (0.22, 0.24, 0.26))   # 操控键盘区
    # (c) 斜面物理仪表盘与微型带刻度指示表 (北向斜立板，面向操作席与视口，严格 <= z+1.45m)
    F.box(-7.3, -0.48, z + 0.78, -2.7, -0.22, z + 1.30, (0.16, 0.17, 0.19)) # 仪表斜立板
    for mx in (-5.6, -4.4):
        F.box(mx - 0.22, -0.22, z + 0.94, mx + 0.22, -0.20, z + 1.20, C_METAL_GOLD) # 双联大型工业表盘
        F.box(mx - 0.02, -0.20, z + 1.00, mx + 0.02, -0.18, z + 1.16, C_RED_EMERG)   # 红色指示指针
    # 发光状态矩阵与遥测指示屏 (朝向北侧视口)
    F.box(-7.1, -0.22, z + 0.92, -6.6, -0.20, z + 1.18, C_SCREEN_GLOW)
    F.box(-3.4, -0.22, z + 0.92, -2.9, -0.20, z + 1.18, C_ETHER_CYAN)
    # (d) 紧急红蘑菇安全急停开关 (带安全翻盖保护框)
    F.box(-2.98, -0.08, z + 0.76, -2.82, 0.08, z + 0.80, C_HAZARD_YEL)       # 黄色警戒底盘
    F.box(-2.96, -0.06, z + 0.80, -2.84, 0.06, z + 0.92, C_RED_EMERG)        # 红色大蘑菇按钮
    F.box(-3.02, -0.12, z + 0.80, -2.78, 0.12, z + 0.96, C_GLASS_CYAN)        # 透明防误触保护框
    # (e) 操纵席工业旋转座椅 (位于操作台北侧，面向控制台)
    F.box(-5.20, 0.55, z + 0.03, -4.80, 0.95, z + 0.12, C_METAL_STEEL)       # 四星脚
    F.box(-5.04, 0.71, z + 0.12, -4.96, 0.79, z + 0.44, C_METAL_STEEL)       # 升降立柱
    F.box(-5.25, 0.55, z + 0.44, -4.75, 0.95, z + 0.54, C_LEATHER_DK)        # 坐垫
    F.box(-5.25, 0.90, z + 0.54, -4.75, 0.98, z + 0.98, C_LEATHER_DK)        # 靠背

    # 6.4 配电与变压柜群 (工业灰开关柜 + 百叶散热窗 + 顶部线缆桥架，控制在 z+1.44m 以内)
    # (a) 西北主高压配电柜群 (NW Main HV Switchgear, x: -13.5..-9.6, y: 3.4..7.4)
    F.box(-13.5, 3.6, z + 0.03, -9.6, 7.2, z + 1.38, (0.34, 0.38, 0.40))     # 柜排主柜体
    F.box(-9.62, 4.4, z + 0.40, -9.58, 6.4, z + 1.25, (0.24, 0.26, 0.28))     # 柜体东向操作门
    F.box(-9.64, 4.8, z + 0.85, -9.60, 6.0, z + 1.05, C_SCREEN_GLOW)          # 东向微机测控屏
    F.box(-13.5, 5.2, z + 1.38, -9.6, 5.6, z + 1.44, C_METAL_IRON)           # 顶部母线桥架

    # (b) 西南副开关柜与直流电源屏 (SW DC Power, x: -13.5..-9.6, y: -2.4..1.6)
    F.box(-13.5, -2.2, z + 0.03, -9.6, 1.4, z + 1.38, (0.32, 0.35, 0.38))     # 柜排主柜体
    F.box(-13.4, 1.40, z + 0.40, -9.7, 1.44, z + 1.25, (0.22, 0.24, 0.26))   # 柜门板
    F.box(-12.2, 1.44, z + 0.85, -11.0, 1.46, z + 1.05, (0.85, 0.85, 0.88))  # 电压表板
    F.box(-13.5, -0.6, z + 1.38, -9.6, -0.2, z + 1.44, C_METAL_IRON)          # 顶部桥架

    # (c) 东北以太循环水冷与变频控制柜群 (NE Cooling, x: -0.6..3.6, y: 3.4..7.4)
    F.box(-0.6, 3.6, z + 0.03, 3.6, 7.2, z + 1.38, (0.35, 0.39, 0.41))       # 柜排主柜体
    F.box(-0.5, 3.56, z + 0.40, 3.5, 3.60, z + 1.25, (0.24, 0.28, 0.30))     # 柜门板
    F.box(0.5, 3.54, z + 0.85, 2.5, 3.56, z + 1.05, C_ETHER_CYAN)             # 冷却遥测屏
    F.box(-0.6, 5.2, z + 1.38, 3.6, 5.6, z + 1.44, C_METAL_IRON)             # 顶部桥架

    # (d) 东南备用电源与母联馈线柜群 (SE ATS Feeder, x: -0.6..3.6, y: -2.4..1.6)
    F.box(-0.6, -2.2, z + 0.03, 3.6, 1.4, z + 1.38, (0.34, 0.37, 0.39))      # 柜排主柜体
    F.box(-0.5, 1.40, z + 0.40, 3.5, 1.44, z + 1.25, (0.22, 0.25, 0.27))     # 柜门板
    F.box(0.5, 1.44, z + 0.85, 2.5, 1.46, z + 1.05, C_SCREEN_GLOW)            # 电源状态屏

    # ========================================================================
    # 7. B2 通道与前室防爆气密门 (位于主廊与主人前室交界处 x: 16.0, y: -4.9..-3.5)
    # ========================================================================
    # (a) 防爆重载合金门框柱与顶部承压过梁 (最高点 z+1.44m)
    F.box(15.88, -4.90, z + 0.03, 16.12, -4.75, z + 1.44, C_METAL_IRON)           # 南门柱
    F.box(15.88, -3.65, z + 0.03, 16.12, -3.50, z + 1.44, C_METAL_IRON)           # 北门柱
    F.box(15.86, -4.90, z + 1.36, 16.14, -3.50, z + 1.44, C_METAL_IRON)           # 顶部过梁
    # (b) 潜艇级实心耐压防水气密门扇与防爆加强筋
    F.box(15.94, -4.72, z + 0.05, 16.06, -3.68, z + 1.34, (0.24, 0.26, 0.28))     # 门扇主体
    F.box(15.92, -4.68, z + 0.30, 16.08, -3.72, z + 1.10, C_METAL_IRON)           # 防爆加强筋
    # (c) 旋转式铸钢气密把手手轮
    F.box(15.88, -4.24, z + 0.76, 15.94, -4.16, z + 0.84, C_METAL_GOLD)           # 轴套
    F.box(15.86, -4.30, z + 0.72, 15.88, -4.10, z + 0.88, C_METAL_STEEL)          # 气密转盘手轮
    # (d) 军用级双向门禁 RFID 读卡控制面板 (北侧门柱西面)
    F.box(15.84, -3.62, z + 0.90, 15.88, -3.52, z + 1.15, C_METAL_IRON)
    F.box(15.83, -3.60, z + 0.98, 15.85, -3.54, z + 1.10, C_SCREEN_GLOW)          # 芯片感应区
    # (e) 地面防滑斜角压条踏板
    F.pad(15.85, -4.75, z + 0.03, 16.15, -3.65, z + 0.05, C_METAL_STEEL)






def build_f1_furn(F, z):
    # ========================================================================
    # 1. 大厅 101 (-10..10, -16..-6)
    # ========================================================================
    # (a) 卡拉拉白与黑金花大理石 1.2m 斜置棋盘格地面
    for ix, x in enumerate(np.arange(-9.6, 9.6, 1.2)):
        for iy, y in enumerate(np.arange(-15.6, -6.0, 1.2)):
            col = C_MARBLE_NERO if (ix + iy) % 2 == 1 else C_MARBLE_STATUARIO
            F.pad(x, y, z + 0.01, x + 1.18, y + 1.18, z + 0.02, col)
    # (b) 中心家族纹章嵌盘 (半径 2.0m，西耶纳黄大理石 + 鎏金铜包边)
    F.cyl(0.0, -11.0, 2.0, z + 0.02, z + 0.035, C_BRASS_ORMOLU, 24)
    F.cyl(0.0, -11.0, 1.8, z + 0.035, z + 0.045, C_MARBLE_SIENA, 24)
    F.cyl(0.0, -11.0, 0.6, z + 0.045, z + 0.055, C_BRASS_ORMOLU, 16)
    # (c) 仿斑岩人造大理石科林斯柱廊 (x=±8.0, 4对)
    for cx in (-8.0, 8.0):
        for cy in (-14.5, -12.2, -9.8, -7.5):
            F.box(cx - 0.55, cy - 0.55, z + 0.01, cx + 0.55, cy + 0.55, z + 0.30, C_MARBLE_STATUARIO)
            F.cyl(cx, cy, 0.45, z + 0.30, z + WALL_H - 0.40, C_PORPHYRY, 16)
            F.box(cx - 0.55, cy - 0.55, z + WALL_H - 0.40, cx + 0.55, cy + 0.55, z + WALL_H, C_BRASS_ORMOLU)
            add_sconce(F, cx + (0.46 if cx < 0 else -0.46), cy, z + 2.2, 1.0 if cx < 0 else -1.0, 0.0)
    # (d) 鎏金雕花靠墙长凳与大理石台面边桌
    for by in (-13.5, -8.5):
        F.box(-9.8, by - 1.0, z + 0.01, -9.1, by + 1.0, z + 0.48, C_BRASS_ORMOLU)
        F.box(-9.75, by - 0.95, z + 0.48, -9.15, by + 0.95, z + 0.55, C_FABRIC_DAMASK_RED)
        F.box(9.1, by - 1.0, z + 0.01, 9.8, by + 1.0, z + 0.48, C_BRASS_ORMOLU)
        F.box(9.15, by - 0.95, z + 0.48, 9.75, by + 0.95, z + 0.55, C_FABRIC_DAMASK_RED)
    # (e) 初代奠基人长箱钟 (-7.5, -6.4)
    F.box(-7.8, -6.6, z + 0.01, -7.2, -6.2, z + 2.60, C_WOOD_WALNUT)
    F.box(-7.75, -6.55, z + 1.80, -7.25, -6.18, z + 2.50, C_BRASS_ORMOLU)
    # (f) 奥布松天城蓝迎宾长毯与青花大瓷瓶
    F.pad(-2.5, -15.8, z + 0.03, 2.5, -7.0, z + 0.045, C_FABRIC_SKY_BLUE)
    F.cyl(-2.2, -15.4, 0.35, z + 0.01, z + 1.40, C_SEVRES_BLUE, 12)
    F.cyl(2.2, -15.4, 0.35, z + 0.01, z + 1.40, C_SEVRES_BLUE, 12)
    # (g) 48臂铅水晶中央大吊灯
    add_chandelier(F, 0.0, -13.5, z + 3.3, r=1.4, arms=12)
    add_chandelier(F, 0.0, -8.5, z + 3.3, r=1.4, arms=12)

    # ========================================================================
    # 2. 会客厅 119 (10..20, -16..-10)
    # ========================================================================
    F.pad(11.5, -15.2, z + 0.03, 18.5, -10.8, z + 0.05, C_RUG_AUBUSSON)
    add_fireplace(F, 19.4, -13.0, z, w=2.4, d=0.6, h=1.4, orient='w', marble_col=C_MARBLE_STATUARIO)
    F.box(19.45, -14.0, z + 1.50, 19.55, -12.0, z + 3.40, C_BRASS_ORMOLU)
    F.box(13.2, -14.2, z + 0.05, 14.2, -11.8, z + 0.85, C_BRASS_ORMOLU)
    F.box(13.3, -14.1, z + 0.40, 14.1, -11.9, z + 0.52, C_FABRIC_DAMASK_RED)
    F.box(16.0, -14.5, z + 0.05, 17.0, -13.5, z + 0.85, C_BRASS_ORMOLU)
    F.box(16.1, -14.4, z + 0.40, 16.9, -13.6, z + 0.52, C_FABRIC_DAMASK_RED)
    F.box(16.0, -12.5, z + 0.05, 17.0, -11.5, z + 0.85, C_BRASS_ORMOLU)
    F.box(16.1, -12.4, z + 0.40, 16.9, -11.6, z + 0.52, C_FABRIC_DAMASK_RED)
    F.box(14.8, -13.6, z + 0.05, 15.6, -12.4, z + 0.50, C_WOOD_MAHOGANY)
    F.box(14.75, -13.65, z + 0.50, 15.65, -12.35, z + 0.54, C_MARBLE_STATUARIO)
    F.box(10.5, -15.5, z + 0.01, 11.2, -13.0, z + 2.80, C_WOOD_MAHOGANY)
    F.box(11.18, -15.4, z + 0.40, 11.22, -13.1, z + 2.70, C_GLASS_CYAN)
    add_chandelier(F, 13.5, -13.0, z + 3.2, r=1.0, arms=8)
    add_chandelier(F, 17.0, -13.0, z + 3.2, r=1.0, arms=8)

    # ========================================================================
    # 3. 餐厅 113 (-10..-2, -3..8)
    # ========================================================================
    F.pad(-8.5, -1.8, z + 0.03, -3.5, 6.8, z + 0.05, C_CARPET_BURGUNDY)
    F.box(-6.9, -0.8, z + 0.05, -5.1, 5.8, z + 0.78, C_WOOD_MAHOGANY)
    for ty in np.linspace(-0.2, 5.2, 7):
        F.cyl(-6.6, ty, 0.16, z + 0.78, z + 0.81, C_SEVRES_BLUE, 10)
        F.cyl(-5.4, ty, 0.16, z + 0.78, z + 0.81, C_SEVRES_BLUE, 10)
        F.box(-7.6, ty - 0.22, z + 0.05, -7.0, ty + 0.22, z + 0.95, C_WOOD_MAHOGANY)
        F.box(-7.5, ty - 0.20, z + 0.42, -7.0, ty + 0.20, z + 0.48, C_LEATHER_RD)
        F.box(-5.0, ty - 0.22, z + 0.05, -4.4, ty + 0.22, z + 0.95, C_WOOD_MAHOGANY)
        F.box(-5.0, ty - 0.20, z + 0.42, -4.5, ty + 0.20, z + 0.48, C_LEATHER_RD)
    add_fireplace(F, -9.4, 2.5, z, w=2.2, d=0.6, h=1.4, orient='e', marble_col=C_MARBLE_STATUARIO)
    F.box(-9.6, -2.0, z + 0.01, -9.0, 0.5, z + 1.10, C_WOOD_MAHOGANY)
    F.box(-9.65, -2.05, z + 1.10, -8.95, 0.55, z + 1.15, C_MARBLE_STATUARIO)
    add_chandelier(F, -6.0, 0.0, z + 3.2, r=1.0, arms=8)
    add_chandelier(F, -6.0, 2.5, z + 3.2, r=1.0, arms=8)
    add_chandelier(F, -6.0, 5.0, z + 3.2, r=1.0, arms=8)

    # ========================================================================
    # 4. 后勤区、备餐间与北廊楼
    # ========================================================================
    F.box(-13.5, -2.0, z + 0.01, -11.5, 0.5, z + 0.90, C_METAL_STEEL)
    F.box(-13.5, 2.0, z + 0.01, -11.5, 4.5, z + 0.90, C_METAL_STEEL)
    F.box(-30.0, 2.0, z + 0.01, -26.0, 5.0, z + 0.95, C_METAL_IRON)
    F.box(-28.0, 7.0, z + 0.01, -24.0, 10.0, z + 0.90, C_METAL_STEEL)
    F.box(-19.5, -11.5, z + 0.01, -17.5, -6.5, z + 2.80, C_WOOD_MAHOGANY)
    F.box(-13.5, -11.5, z + 0.01, -11.0, -9.5, z + 0.85, C_WHITE_CAB)
    F.cyl(-12.0, -7.5, 0.28, z + 0.01, z + 0.45, C_PORCELAIN_WHITE, 12)
    F.box(-6.5, 11.0, z + 0.01, -4.0, 14.5, z + 1.00, C_WOOD_EBONY)
    F.pad(2.0, 10.5, z + 0.03, 8.0, 15.5, z + 0.05, C_RUG_AUBUSSON)
    F.box(3.0, 11.5, z + 0.05, 7.0, 12.5, z + 0.85, C_FABRIC_CHAMPAGNE)
    add_chandelier(F, 0.0, 12.5, z + 3.2, r=1.1, arms=8)


def build_f2_furn(F, z):
    # ========================================================================
    # 1. 主人书房 212 (-2..8, -16..-11)
    # ========================================================================
    F.pad(-0.5, -15.5, z + 0.03, 6.8, -11.5, z + 0.05, C_RUG_HERIZ)
    F.box(-1.6, -11.6, z + 0.01, 7.5, -11.1, z + 3.80, C_WOOD_WALNUT)
    F.box(7.1, -15.5, z + 0.01, 7.6, -11.6, z + 3.80, C_WOOD_WALNUT)
    F.box(-1.6, -11.2, z + 2.40, 7.5, -11.1, z + 2.45, C_BRASS_POLISHED)
    F.box(1.5, -14.4, z + 0.05, 4.5, -12.8, z + 0.78, C_WOOD_MAHOGANY)
    F.box(1.6, -14.3, z + 0.78, 4.4, -12.9, z + 0.79, C_FABRIC_EMPIRE_GREEN)
    F.box(2.6, -12.4, z + 0.05, 3.4, -11.7, z + 1.25, C_LEATHER_RD)
    F.box(1.8, -15.2, z + 0.05, 2.6, -14.5, z + 0.90, C_LEATHER_DK)
    F.box(3.4, -15.2, z + 0.05, 4.2, -14.5, z + 0.90, C_LEATHER_DK)
    add_fireplace(F, -1.4, -13.5, z, w=2.0, d=0.55, h=1.35, orient='e', marble_col=C_MARBLE_NERO)
    add_table_lamp(F, 1.8, -13.2, z + 0.79, base_col=C_BRASS_POLISHED, shade_col=C_FABRIC_EMPIRE_GREEN)
    F.box(4.0, -13.3, z + 0.79, 4.3, -13.0, z + 1.05, C_BRASS_POLISHED)
    F.cyl(5.8, -14.2, 0.42, z + 0.05, z + 1.20, C_BRASS_POLISHED, 12)
    add_chandelier(F, 3.0, -13.5, z + 3.2, r=1.0, arms=8, col_arm=C_BRASS_POLISHED)

    # ========================================================================
    # 2. 主人主卧 (8..20, -16..-6)
    # ========================================================================
    F.pad(9.5, -15.5, z + 0.03, 18.5, -7.5, z + 0.05, C_RUG_AUBUSSON)
    F.box(12.8, -15.4, z + 0.05, 15.2, -13.0, z + 0.55, C_WOOD_MAHOGANY)
    F.box(12.9, -15.3, z + 0.55, 15.1, -13.1, z + 0.78, C_LINEN_WHITE)
    F.box(13.1, -15.2, z + 0.78, 13.9, -14.7, z + 0.88, C_LINEN_WHITE)
    F.box(14.1, -15.2, z + 0.78, 14.9, -14.7, z + 0.88, C_LINEN_WHITE)
    F.box(12.9, -13.3, z + 0.78, 15.1, -13.0, z + 0.81, C_CARPET_GOLD)
    for px, py in ((12.8, -15.4), (15.2, -15.4), (12.8, -13.0), (15.2, -13.0)):
        F.cyl(px, py, 0.06, z + 0.05, z + 2.80, C_BRASS_ORMOLU, 8)
    F.box(12.7, -15.5, z + 2.75, 15.3, -12.9, z + 2.85, C_BRASS_ORMOLU)
    F.box(12.75, -15.45, z + 1.20, 15.25, -12.95, z + 2.75, C_LINEN_IVORY)
    F.box(11.8, -15.4, z + 0.05, 12.6, -14.6, z + 0.68, C_WOOD_MAHOGANY)
    F.box(15.4, -15.4, z + 0.05, 16.2, -14.6, z + 0.68, C_WOOD_MAHOGANY)
    add_table_lamp(F, 12.2, -15.0, z + 0.68)
    add_table_lamp(F, 15.8, -15.0, z + 0.68)
    add_fireplace(F, 14.0, -6.6, z, w=2.2, d=0.55, h=1.35, orient='s', marble_col=C_MARBLE_STATUARIO)
    F.box(10.5, -10.5, z + 0.05, 12.0, -8.5, z + 0.75, C_FABRIC_CHAMPAGNE)
    add_chandelier(F, 14.0, -10.5, z + 3.2, r=1.1, arms=10)

    # ========================================================================
    # 3. 客房套间与卫浴 (-12..-2, -16..-6)
    # ========================================================================
    F.pad(-11.5, -15.5, z + 0.03, -7.5, -10.5, z + 0.05, C_FABRIC_SKY_BLUE)
    F.box(-11.0, -15.2, z + 0.05, -9.0, -13.0, z + 0.55, C_WOOD_MAHOGANY)
    F.box(-10.9, -15.1, z + 0.55, -9.1, -13.1, z + 0.75, C_LINEN_WHITE)
    add_table_lamp(F, -8.6, -15.0, z + 0.65)
    F.pad(-6.5, -15.5, z + 0.03, -2.5, -10.5, z + 0.05, C_FABRIC_ROSE_SILK)
    F.box(-6.0, -15.2, z + 0.05, -4.0, -13.0, z + 0.55, C_WOOD_MAHOGANY)
    F.box(-5.9, -15.1, z + 0.55, -4.1, -13.1, z + 0.75, C_LINEN_WHITE)
    add_table_lamp(F, -3.6, -15.0, z + 0.65)
    for bx in (-9.5, -4.5):
        F.box(bx - 0.9, -8.5, z + 0.05, bx + 0.9, -7.3, z + 0.65, C_PORCELAIN_WHITE)
        F.cyl(bx, -8.7, 0.04, z + 0.05, z + 0.95, C_BRASS_POLISHED, 6)
        F.box(bx - 0.5, -9.8, z + 0.01, bx + 0.5, -9.1, z + 0.85, C_WHITE_CAB)
    F.box(11.0, -2.0, z + 0.01, 13.0, 0.5, z + 0.55, C_WOOD_OAK)
    F.box(11.1, -1.9, z + 0.55, 12.9, 0.4, z + 0.72, C_LINEN_WHITE)
    F.box(14.0, -2.5, z + 0.01, 15.5, -0.5, z + 2.40, C_WOOD_WALNUT)

    # ========================================================================
    # 4. 东侧长廊与艺术陈列 (52.7..64.2, -6.0..20.8)
    # ========================================================================
    F.pad(54.0, -4.5, z + 0.03, 63.0, 19.5, z + 0.05, C_RUG_AUBUSSON)
    for gy in np.linspace(-2.0, 16.0, 4):
        F.box(53.2, gy - 0.8, z + 0.01, 54.0, gy + 0.8, z + 0.48, C_BRASS_ORMOLU)
        F.box(53.25, gy - 0.75, z + 0.48, 53.95, gy + 0.75, z + 0.55, C_FABRIC_DAMASK_RED)
        F.box(62.9, gy - 0.8, z + 0.01, 63.7, gy + 0.8, z + 0.48, C_BRASS_ORMOLU)
        F.box(62.95, gy - 0.75, z + 0.48, 63.65, gy + 0.75, z + 0.55, C_FABRIC_DAMASK_RED)
        F.box(52.8, gy - 0.9, z + 1.6, 52.9, gy + 0.9, z + 2.9, C_BRASS_ORMOLU)
        F.box(52.88, gy - 0.8, z + 1.7, 52.92, gy + 0.8, z + 2.8, C_FABRIC_DAMASK_RED)
        F.box(52.85, gy - 0.4, z + 2.95, 53.15, gy + 0.4, z + 3.0, C_BRASS_POLISHED)
        add_chandelier(F, 58.5, gy, z + 3.2, r=1.0, arms=8)


def build_f3_furn(F, z):
    # ========================================================================
    # 1. 14 间正式母畜个人寝室 (8间南向，6间北向)
    # ========================================================================
    south_rooms = [
        (-12.0, -8.4), (-8.4, -4.8), (-4.8, -1.2), (-1.2, 2.4),
        (2.4, 6.0), (6.0, 9.6), (9.6, 13.2), (13.2, 16.8)
    ]
    for rx0, rx1 in south_rooms:
        F.pad(rx0 + 0.5, -15.5, z + 0.03, rx1 - 0.5, -11.5, z + 0.045, C_RUG_AUBUSSON)
        F.box(rx0 + 0.35, -15.4, z + 0.05, rx0 + 1.65, -13.2, z + 0.52, C_WOOD_OAK)
        F.box(rx0 + 0.40, -15.3, z + 0.52, rx0 + 1.60, -13.3, z + 0.70, C_LINEN_WHITE)
        F.box(rx0 + 0.55, -15.2, z + 0.70, rx0 + 1.45, -14.7, z + 0.80, C_LINEN_WHITE)
        F.box(rx0 + 1.80, -15.4, z + 0.05, rx0 + 2.30, -14.8, z + 0.60, C_WOOD_WALNUT)
        add_table_lamp(F, rx0 + 2.05, -15.1, z + 0.60, base_col=C_BRASS_POLISHED)
        F.box(rx1 - 0.90, -15.4, z + 0.01, rx1 - 0.25, -13.0, z + 2.20, C_WOOD_WALNUT)
        F.box(rx0 + 0.40, -12.4, z + 0.01, rx0 + 1.80, -11.4, z + 0.75, C_WOOD_OAK)
        add_chandelier(F, (rx0 + rx1) / 2, -13.5, z + 3.2, r=0.4, arms=4)

    north_rooms = [
        (-7.0, -3.4), (-3.4, 0.2), (0.2, 3.8), (3.8, 7.4), (7.4, 11.2), (11.2, 15.0)
    ]
    for rx0, rx1 in north_rooms:
        F.pad(rx0 + 0.5, 3.5, z + 0.03, rx1 - 0.5, 7.5, z + 0.045, C_RUG_AUBUSSON)
        F.box(rx0 + 0.35, 5.8, z + 0.05, rx0 + 1.65, 7.8, z + 0.52, C_WOOD_OAK)
        F.box(rx0 + 0.40, 5.9, z + 0.52, rx0 + 1.60, 7.7, z + 0.70, C_LINEN_WHITE)
        F.box(rx0 + 0.55, 7.2, z + 0.70, rx0 + 1.45, 7.7, z + 0.80, C_LINEN_WHITE)
        F.box(rx0 + 1.80, 7.2, z + 0.05, rx0 + 2.30, 7.8, z + 0.60, C_WOOD_WALNUT)
        add_table_lamp(F, rx0 + 2.05, 7.5, z + 0.60, base_col=C_BRASS_POLISHED)
        F.box(rx1 - 0.90, 5.5, z + 0.01, rx1 - 0.25, 7.8, z + 2.20, C_WOOD_WALNUT)
        F.box(rx0 + 0.40, 3.4, z + 0.01, rx0 + 1.80, 4.4, z + 0.75, C_WOOD_OAK)
        add_chandelier(F, (rx0 + rx1) / 2, 5.5, z + 3.2, r=0.4, arms=4)

    # ========================================================================
    # 2. 新进公共寝区 (-15..-7, 3..8)
    # ========================================================================
    for by in (3.5, 5.8):
        F.box(-14.5, by, z + 0.01, -12.5, by + 1.8, z + 1.90, C_WOOD_OAK)
        F.box(-14.4, by + 0.1, z + 0.45, -12.6, by + 1.7, z + 0.65, C_LINEN_WHITE)
        F.box(-14.4, by + 0.1, z + 1.40, -12.6, by + 1.7, z + 1.60, C_LINEN_WHITE)
        F.box(-11.5, by, z + 0.01, -9.5, by + 1.8, z + 1.90, C_WOOD_OAK)
        F.box(-11.4, by + 0.1, z + 0.45, -9.6, by + 1.7, z + 0.65, C_LINEN_WHITE)
        F.box(-11.4, by + 0.1, z + 1.40, -9.6, by + 1.7, z + 1.60, C_LINEN_WHITE)

    # ========================================================================
    # 3. 三楼公共浴室 (-14..-8, -9..-1)
    # ========================================================================
    F.pad(-13.5, -8.0, z + 0.03, -10.0, -4.0, z + 0.05, C_MARBLE_STATUARIO)
    F.box(-13.2, -7.8, z + 0.01, -10.3, -4.2, z + 0.45, C_MARBLE_STATUARIO)
    F.pad(-13.0, -7.6, z + 0.35, -10.5, -4.4, z + 0.40, C_GLASS_CYAN)
    for sy in (-3.5, -2.2):
        F.box(-13.5, sy, z + 0.01, -12.0, sy + 0.9, z + 2.40, C_GLASS_CYAN)
        F.box(-12.8, sy + 0.35, z + 2.25, -12.5, sy + 0.55, z + 2.35, C_METAL_STEEL)

    # ========================================================================
    # 4. 杂鱼女仆集体间 (15..20, -11..5)
    # ========================================================================
    for my in np.linspace(-10.0, 3.5, 6):
        F.box(15.5, my, z + 0.01, 18.2, my + 1.2, z + 0.55, C_WOOD_OAK)
        F.box(15.6, my + 0.08, z + 0.55, 18.1, my + 1.12, z + 0.70, C_LINEN_WHITE)

    # ========================================================================
    # 5. 前廊、后廊通道长毯与照明
    # ========================================================================
    F.pad(-12.0, -10.5, z + 0.03, 15.0, -9.5, z + 0.045, C_CARPET_BURGUNDY)
    F.pad(-14.0, 1.5, z + 0.03, 15.0, 2.5, z + 0.045, C_CARPET_BURGUNDY)
    for lx in np.linspace(-10.0, 14.0, 5):
        add_chandelier(F, lx, -10.0, z + 3.2, r=0.4, arms=4)
        add_chandelier(F, lx, 2.0, z + 3.2, r=0.4, arms=4)


ROOM_FLOOR_COL = {
    # B1 训导与功能区
    ('B1', '主调教室'): C_WOOD_WALNUT,
    ('B1', '私人调教室'): C_WOOD_WALNUT,
    ('B1', '性技巧训练室'): C_FLOOR_TATAMI,
    ('B1', '体能训练室'): C_FLOOR_RUBBER,
    ('B1', '恒温酒窖'): (0.30, 0.24, 0.18),
    ('B1', '更衣 / 淋浴'): (0.85, 0.84, 0.82),
    # B2 惩戒与医护区
    ('B2', '惩罚室'): (0.18, 0.19, 0.20),
    ('B2', '医疗与改造室'): C_FLOOR_EPOXY,
    ('B2', '档案室'): C_FLOOR_GRID,
    ('B2', '储藏室'): (0.24, 0.26, 0.28),
    ('B2', '机电设备间'): (0.20, 0.22, 0.24),
    # F1 礼仪层 (docs/eden-estate.md §4 & §6)
    ('F1', '大厅'): C_MARBLE_STATUARIO,          # 卡拉拉白与黑金花大理石 1.2m 棋盘格地面
    ('F1', '会客厅'): C_PARQUET_VERSAILLES,       # 凡尔赛拼橡木 + 萨伏纳里地毯
    ('F1', '餐厅'): C_PARQUET_VERSAILLES,         # 凡尔赛拼橡木 + 绛红奥布松地毯
    ('F1', '独立食物准备间'): (0.72, 0.70, 0.67),   # 防滑石砖地面
    ('F1', '厨房与后勤区'): (0.68, 0.66, 0.63),     # 后勤耐磨石砖地面
    ('F1', '衣物清洗与维护间'): (0.85, 0.85, 0.84), # 卫浴白瓷砖地面
    ('F1', '道具清洗消毒间'): (0.82, 0.84, 0.85),   # 消毒白瓷砖地面
    ('F1', '物资仓库'): (0.65, 0.64, 0.62),       # 仓储地坪
    ('F1', '衣帽间 / 访客卫生间'): C_OAK_HERRINGBONE, # 人字拼橡木 + 卫生间大理石
    ('F1', '门廊（正门）'): (0.80, 0.78, 0.73),    # 波特兰粗面白石柱廊地面
    ('F1', '主廊'): C_MARBLE_STATUARIO,          # Statuario 大理石带黑金花饰边
    ('F1', '服务过道'): (0.75, 0.73, 0.70),       # 石材地面
    ('F1', '北过厅'): C_MARBLE_STATUARIO,        # Statuario 大理石地面
    ('F1', '服务走廊'): (0.75, 0.73, 0.70),       # 石材地面
    ('F1', '服务连廊'): (0.75, 0.73, 0.70),       # 石材地面
    ('F1', '北廊楼（通后庭）'): C_PARQUET_VERSAILLES,# 花园起居厅凡尔赛拼花
    ('F1', '东连廊'): C_MARBLE_STATUARIO,        # 柱廊大理石地面
    ('F1', '主人通道前室'): C_MARBLE_STATUARIO,    # 大理石前室地面
    ('F1', '塔楼前厅'): C_MARBLE_STATUARIO,       # 大理石前厅地面
    # F2 日常层
    ('F2', '主人主卧'): C_PARQUET_VERSAILLES,     # 凡尔赛拼橡木 + 奥布松满铺地毯
    ('F2', '主人书房'): C_OAK_HERRINGBONE,        # 人字拼橡木 + 赫里兹地毯
    ('F2', '书房前等候廊'): C_OAK_HERRINGBONE,     # 人字拼橡木
    ('F2', '客房'): C_PARQUET_VERSAILLES,         # 橡木地板 + 羊毛地毯
    ('F2', '客房卫浴 ×2'): C_MARBLE_GOLD,         # 卡拉卡塔金大理石
    ('F2', '布草 / 服务间'): (0.78, 0.76, 0.72),   # 仿橡木油毡
    ('F2', '女仆长寝室'): C_PARQUET_VERSAILLES,    # 橡木地板
    ('F2', '女仆长卫浴'): (0.84, 0.84, 0.82),     # 卫浴白瓷砖
    ('F2', '仆役前室'): (0.76, 0.75, 0.72),       # 瓷砖地面
    ('F2', '主廊'): C_PARQUET_VERSAILLES,         # 凡尔赛拼橡木
    ('F2', '东侧长廊'): C_PARQUET_VERSAILLES,     # 肖像画廊橡木地板
    ('F2', '东翼走廊'): C_PARQUET_VERSAILLES,     # 橡木地板
    ('F2', '连廊'): C_PARQUET_VERSAILLES,         # 橡木地板
    # F3 私人层
    ('F3', '正式母畜个人寝室'): C_PARQUET_VERSAILLES, # 橡木地板
    ('F3', '新进公共寝区'): C_PARQUET_VERSAILLES, # 橡木地板
    ('F3', '三楼公共浴室'): C_MARBLE_STATUARIO,   # Statuario 大理石 + 淋浴瓷砖
    ('F3', '杂鱼女仆集体间'): C_PARQUET_VERSAILLES, # 橡木地板
    ('F3', '公共清洁间'): (0.82, 0.82, 0.80),     # 防滑瓷砖
    ('F3', '集体间储物'): C_PARQUET_VERSAILLES,   # 储物地板
    ('F3', '三楼公共区'): C_OAK_HERRINGBONE,      # 人字拼橡木
    ('F3', '前廊'): C_OAK_HERRINGBONE,           # 人字拼橡木走廊
    ('F3', '后廊'): C_OAK_HERRINGBONE,           # 人字拼橡木走廊
    ('F3', '仆役前室 / 布草'): (0.78, 0.76, 0.72), # 瓷砖
    ('F3', '走廊'): C_OAK_HERRINGBONE,           # 人字拼橡木
    ('F3', '布草间'): (0.78, 0.76, 0.72),         # 瓷砖
}


def build_floor(fl):
    rooms = [r for r in FP.ROOMS if r['floor'] == fl]
    z = ZF[fl]
    S, F = Mesh(), Mesh()
    for r in rooms:   # 楼板
        col = ROOM_FLOOR_COL.get((fl, r['name']), KIND_COL.get(r['kind'], KIND_COL['open']))
        S.prism(r['poly'], z - SLAB, z, col, side_faces=False)
    wall_rooms = [r for r in rooms if r['block'] != 'porch' and r['kind'] != 'medical']   # 门廊是敞开柱廊，不出墙；医疗中心（kind=medical）的墙 / 门 / 设备由 medical_b2.py 出（medical_web.py）
    segs = walls_for(wall_rooms)
    dark_slab = (0.75, 0.73, 0.70)
    for s in segs:
        if s['ext']:
            S.quad((s['a'][0], s['a'][1], z - SLAB), (s['b'][0], s['b'][1], z - SLAB),
                   (s['b'][0], s['b'][1], z), (s['a'][0], s['a'][1], z), dark_slab)
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
    elif fl == 'F1':
        build_f1_furn(F, z)
    elif fl == 'F2':
        build_f2_furn(F, z)
    elif fl == 'F3':
        build_f3_furn(F, z)
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
