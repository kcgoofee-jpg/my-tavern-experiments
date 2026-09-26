#!/usr/bin/env python3
# 真实 3D 建筑几何（试点，见 docs/real-3d-buildings.md）：纽约市 3D Building Model（2014 航测，CityGML，LOD1.5 为主 + 约 100 栋地标 LOD2）
# → 天城平面坐标里的轻量多边形网格（blender/data/real3d/<区域>.npz，进 git）。
# 数据：NYC Office of Technology and Innovation（原 DoITT）3-D Building Model，NYC Open Data（使用条款见 opendata.cityofnewyork.us/overview/#termsofuse）。
# 坐标：原始数据是 EPSG:2263（NAD83 纽约长岛州平面，美国测量英尺），这里反算回经纬度后，走 tc_osm.projector 同一个投影、旋转，
# 所以与 data/osm/<区域>.json 的轮廓、道路完全对位（NAD83 与 WGS84 差约 1 m，忽略）。
#
# 用法（build 需要 numpy；本机可用 Blender 自带的 python：/Applications/Blender.app/Contents/Resources/*/python/bin/python3.*，
#       它没有系统证书，fetch 用系统的 python3）：
#   python3 blender/tc_real3d.py fetch [区域]   # 从 maps.nyc.gov 的 DA_WISE_GML.zip 里只取覆盖该区域的 DA 分块（HTTP Range，不下整包 874 MB）
#                                               # → blender/data/real3d/raw/（不进 git）
#   python3 blender/tc_real3d.py build [区域]   # raw/*.gml → blender/data/real3d/<区域>.npz
# 目前只有 manhattan（REGIONS 里另外几个区域不在纽约市范围内，或是布鲁克林——需要时加 DA 即可）。
#
# <区域>.npz（全部以区域中心为原点、tc_osm 同一旋转；1 平面单位 = 100 m）：
#   V   (n, 3) int16   顶点：x、y 按 1/Q 平面单位量化，z = 离本楼地面的高度（米）× 10（0.1 m）
#   FL  (m,) uint16    每个面的顶点数；FI (Σ,) uint32 面的顶点下标（全局）
#   FT  (m,) uint8     面类型：1 屋顶、2 外墙（地面不存，俯视看不到）
#   BF  (k+1,) uint32  每栋楼的面在 FL 里的起止（第 i 栋 = FL[BF[i]:BF[i+1]]；顶点也按楼连续存放，只被本楼的面引用）
#   BH  (k,) float32   楼高（米，最高点 - 地面）；BC (k, 2) 轮廓中心；BA (k,) 占地面积（平面单位²）；BIN (k,) 纽约楼号
#   BP  各楼的地面轮廓：BPL (k,) 顶点数、BPV (Σ, 2) int16（同 V 的量化）——tc_city 的 City.b['p'] 用它
#   TOP 各楼最高一级（够大的）屋顶面的轮廓：TPL (k,)、TPV (Σ, 2) int16——霓虹、楼冠灯带、女儿墙与设备按最高那一级退台放
#   RH  (k,) float32   最高屋面高度（米，面积 ≥ 20 m² 的屋顶面里最高的一块；不含尖顶、天线）——tc_city 用它定楼高
#   TZ  (k,) float32   TOP 那一级屋面的高度（米，≤ RH）
# build 时的清理（A5）：同一块屋顶面的 z 取中位数压平（真正的 LOD2 坡面除外）；很小的屋面体块（< 25 m²，机房、水箱、天线座）
# 并入它下面那一级（顶点压到支撑面的高度，四周的墙随之变成零高、被过滤）；面积为零的退化面（重复点、共线点）去掉。
import io, math, os, re, struct, sys, glob, urllib.request, zipfile
import xml.etree.ElementTree as ET
try: import numpy as np                     # fetch 不需要 numpy（可用系统 python3，证书齐全）；build 需要
except ImportError: np = None

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tc_osm

OUT = os.path.join(HERE, 'data', 'real3d')
RAW = os.path.join(OUT, 'raw')
URL = 'https://maps.nyc.gov/download/3dmodel/DA_WISE_GML.zip'
CREDIT = 'NYC 3-D Building Model © City of New York (Office of Technology and Innovation), NYC Open Data'
Q = 2000                       # 量化：1 平面单位（100 m）= 2000 格 → 5 cm；int16 能放 ±16 单位（区域半宽 12 + 余量）
FT = 0.3048006096012192        # 美国测量英尺 → 米

# ---------------- EPSG:2263（Lambert 等角圆锥，双标准纬线，GRS80）----------------
_a = 6378137.0; _f = 1 / 298.257222101; _e = math.sqrt(2 * _f - _f * _f)
_p1, _p2, _p0, _l0 = map(math.radians, (40.66666666666666, 41.03333333333333, 40.16666666666666, -74.0)); _FE = 984250.0 * FT
def _m(p): return math.cos(p) / math.sqrt(1 - _e * _e * math.sin(p) ** 2)
def _t(p): return math.tan(math.pi / 4 - p / 2) / ((1 - _e * math.sin(p)) / (1 + _e * math.sin(p))) ** (_e / 2)
_n = (math.log(_m(_p1)) - math.log(_m(_p2))) / (math.log(_t(_p1)) - math.log(_t(_p2))); _F = _m(_p1) / (_n * _t(_p1) ** _n); _r0 = _a * _F * _t(_p0) ** _n
def sp_forward(lat, lon):
    """经纬度（度）→ EPSG:2263（英尺）。"""
    r = _a * _F * _t(math.radians(lat)) ** _n; th = _n * (math.radians(lon) - _l0)
    return (_FE + r * math.sin(th)) / FT, (_r0 - r * math.cos(th)) / FT
def sp_inverse(X, Y):
    """EPSG:2263（英尺，numpy 数组）→ 经纬度（度）。"""
    x = np.asarray(X, np.float64) * FT - _FE; y = _r0 - np.asarray(Y, np.float64) * FT
    r = np.sign(_n) * np.hypot(x, y); th = np.arctan2(x, y); t = (r / (_a * _F)) ** (1 / _n)
    lon = th / _n + _l0; phi = math.pi / 2 - 2 * np.arctan(t)
    for _ in range(6): phi = math.pi / 2 - 2 * np.arctan(t * ((1 - _e * np.sin(phi)) / (1 + _e * np.sin(phi))) ** (_e / 2))
    return np.degrees(phi), np.degrees(lon)
def plane(name):
    """EPSG:2263 → 区域平面坐标（与 tc_osm.projector 同一公式，向量化）。"""
    R = tc_osm.REGIONS[name]; mx = 111320.0 * math.cos(math.radians(R['lat'])); a = math.radians(R['rot']); c, s = math.cos(a), math.sin(a)
    def f(X, Y):
        lat, lon = sp_inverse(X, Y); e = (lon - R['lon']) * mx / 100; n = (lat - R['lat']) * tc_osm.MY / 100
        return e * c - n * s, e * s + n * c
    return f

# ---------------- 下载：远程 zip 按需取成员（HTTP Range）----------------
class Remote:
    """只读的远程文件：zipfile 读中央目录、成员时按需发 Range 请求，不下载整包。"""
    def __init__(self, url):
        self.url, self.pos = url, 0
        with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=60) as r: self.size = int(r.headers['Content-Length'])
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, o, w=0): self.pos = o if w == 0 else (self.pos + o if w == 1 else self.size + o); return self.pos
    def read(self, n=-1):
        if n is None or n < 0: n = self.size - self.pos
        if n == 0 or self.pos >= self.size: return b''
        b0, buf = getattr(self, '_b0', -1), getattr(self, '_buf', b'')
        if b0 <= self.pos and self.pos + n <= b0 + len(buf):              # 命中上次取回的块
            out = buf[self.pos - b0:self.pos - b0 + n]; self.pos += len(out); return out
        end = min(self.size, self.pos + max(n, 1 << 20)) - 1          # 至少取 1 MB，减少请求次数
        for k in range(5):
            try:
                with urllib.request.urlopen(urllib.request.Request(self.url, headers={'Range': f'bytes={self.pos}-{end}'}), timeout=120) as r: d = r.read()
                break
            except Exception as ex:
                if k == 4: raise
                print('retry', ex, flush=True)
        self._b0, self._buf = self.pos, d; out = d[:n]; self.pos += len(out); return out

def delivery_areas():
    """raw/DeliveryArea.shp → {DA 号: (x0, y0, x1, y1)}（EPSG:2263 外接框）。"""
    d = open(os.path.join(RAW, 'DeliveryArea.shp'), 'rb').read(); pos, out = 100, {}
    dbf = open(os.path.join(RAW, 'DeliveryArea.dbf'), 'rb').read(); nrec, hlen, rlen = struct.unpack('<IHH', dbf[4:12])
    fl = dbf[32 + 16]                                                   # 第一列 DELIVERY_A 的字段宽度
    ids = [int(dbf[hlen + i * rlen + 1: hlen + i * rlen + 1 + fl].decode().strip() or 0) for i in range(nrec)]
    i = 0
    while pos < len(d):
        _, cl = struct.unpack('>ii', d[pos:pos + 8]); c = d[pos + 8:pos + 8 + cl * 2]; pos += 8 + cl * 2
        out[ids[i]] = struct.unpack('<4d', c[4:36]); i += 1
    return out
def region_box(name, margin=1.05):
    s, w, n, e = tc_osm.bbox(name, margin)
    P = [sp_forward(la, lo) for la in (s, n) for lo in (w, e)]
    return min(p[0] for p in P), min(p[1] for p in P), max(p[0] for p in P), max(p[1] for p in P)

def fetch(name):
    os.makedirs(RAW, exist_ok=True)
    z = zipfile.ZipFile(Remote(URL))
    for i in z.infolist():
        if i.filename.startswith('DeliveryArea') and not os.path.exists(os.path.join(RAW, i.filename)):
            open(os.path.join(RAW, i.filename), 'wb').write(z.read(i))
    x0, y0, x1, y1 = region_box(name)
    das = [k for k, (a, b, c, d) in delivery_areas().items() if not (c < x0 or a > x1 or d < y0 or b > y1)]
    print(name, 'delivery areas', das, flush=True)
    for k in das:
        fn = f'DA_WISE_GMLs/DA{k}_3D_Buildings_Merged.gml'; dst = os.path.join(RAW, os.path.basename(fn))
        info = z.getinfo(fn)
        if os.path.exists(dst) and os.path.getsize(dst) == info.file_size: print('have', dst); continue
        print('get', fn, info.compress_size // 2**20, 'MB compressed', flush=True)
        with z.open(info) as src, open(dst + '.part', 'wb') as out:
            while True:
                b = src.read(1 << 22)
                if not b: break
                out.write(b)
        os.replace(dst + '.part', dst); print('wrote', dst, os.path.getsize(dst) // 2**20, 'MB', flush=True)

# ---------------- 处理：CityGML → npz ----------------
NS = {'bldg': 'http://www.opengis.net/citygml/building/1.0', 'gml': 'http://www.opengis.net/gml', 'gen': 'http://www.opengis.net/citygml/generics/1.0'}
TAG_B = '{%s}Building' % NS['bldg']
KIND = {'{%s}RoofSurface' % NS['bldg']: 1, '{%s}WallSurface' % NS['bldg']: 2, '{%s}GroundSurface' % NS['bldg']: 0}
def parse_building(el):
    """一栋楼 → (BIN, [(类型, 外环 (k, 3) 英尺)])。只取外环（这份数据几乎没有内环）。"""
    bin_ = None
    for a in el.iter('{%s}stringAttribute' % NS['gen']):
        if a.get('name') == 'BIN': bin_ = a.findtext('{%s}value' % NS['gen']); break
    faces = []
    for bb in el.iter('{%s}boundedBy' % NS['bldg']):
        for surf in bb:
            k = KIND.get(surf.tag)
            if k is None: continue
            for ext in surf.iter('{%s}exterior' % NS['gml']):
                pl = ext.find('.//{%s}posList' % NS['gml'])
                if pl is None or not pl.text: continue
                P = np.array(pl.text.split(), np.float64).reshape(-1, 3)
                if len(P) > 3 and np.allclose(P[0], P[-1]): P = P[:-1]
                if len(P) >= 3: faces.append((k, P))
    return bin_, faces

def ring_area(P): x, y = P[:, 0], P[:, 1]; return .5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))
def area3(P):
    """三维多边形面积（Newell）。"""
    return .5 * float(np.linalg.norm(np.cross(P, np.roll(P, -1, 0)).sum(0)))
def pip(X, Y, P):
    """点 (X, Y)（数组）是否在多边形 P 内（射线法，向量化）。"""
    ins = np.zeros(len(X), bool); n = len(P)
    for i in range(n):
        (x1, y1), (x2, y2) = P[i], P[i - 1]
        c = ((y1 > Y) != (y2 > Y)) & (X < (x2 - x1) * (Y - y1) / (y2 - y1 + 1e-12) + x1)
        ins ^= c
    return ins
SMALL_M2 = 25.0                # 小于这个面积的屋面体块并入下一级
RH_M2 = 20.0                   # 「最高屋面」至少要这么大（去掉天线座、尖顶的碎面）
TOP_M2 = 40.0                  # 最高一级退台（楼冠灯带、设备用）至少这么大，或占地 3%
def clean_building(segs):
    """segs: [[类型, xy (n, 2) 平面单位, z (n,) 米]]（不含地面）。原地清理：压平屋面、并掉小体块、去退化面。返回 (留下的 segs, 坡面下标集合)。"""
    Qk = lambda xy: [(int(a), int(b)) for a, b in np.round(xy * Q)]
    roofs = [j for j, s in enumerate(segs) if s[0] == 1]; slope = set()
    # 1. 压平：同一块屋面 z 取中位数；拟合平面残差小、坡度 > 约 5° 的是真的坡面（LOD2 地标），不动
    snap = {}
    for j in roofs:
        xy, z = segs[j][1], segs[j][2]
        if np.ptp(z) < .01: continue
        if np.ptp(z) > .5 and len(z) >= 3:
            M = np.c_[xy * 100, np.ones(len(z))]; cf = np.linalg.lstsq(M, z, rcond=None)[0]
            if math.sqrt(float(np.mean((M @ cf - z) ** 2))) < .15 and math.hypot(cf[0], cf[1]) > .08: slope.add(j); continue
        zm = float(np.median(z))
        for k_, zz in zip(Qk(xy), z): snap.setdefault((*k_, int(round(zz * 10))), []).append(zm)
        segs[j][2] = np.full(len(z), zm)
    if snap:
        for s in segs:
            if s[0] != 2: continue
            for t, (k_, zz) in enumerate(zip(Qk(s[1]), s[2])):
                v = snap.get((*k_, int(round(zz * 10))))
                if v: s[2][t] = sum(v) / len(v)
    # 2. 小体块并入下一级：按高度从上往下，支撑高度 = 围着它的墙的墙底里最高的那个
    flat = [j for j in roofs if j not in slope]
    for j in sorted(flat, key=lambda j: -float(np.median(segs[j][2]))):
        xy, z = segs[j][1], segs[j][2]
        if abs(ring_area(xy)) * 1e4 >= SMALL_M2 or len([r for r in roofs if abs(ring_area(segs[r][1])) * 1e4 >= 1]) <= 1: continue
        zs = float(np.median(z)); keys = set(Qk(xy)); bot = []
        for s in segs:
            if s[0] != 2: continue
            m = [(k_ in keys) and abs(zz - zs) < .05 for k_, zz in zip(Qk(s[1]), s[2])]
            if sum(m) >= 2 and s[2].min() < zs - .05: bot.append(float(s[2].min()))
        if not bot: continue
        zt = max(bot)
        for s in segs:
            sel = np.abs(s[2] - zs) < .05
            if not sel.any(): continue
            kk = Qk(s[1]); sel &= np.array([k_ in keys for k_ in kk]) | pip(s[1][:, 0], s[1][:, 1], xy)
            s[2][sel] = zt
    # 3. 退化面：量化后连续重复点去掉；三维面积 < 0.05 m² 的去掉（并掉的体块四周的墙在这里消失）
    out = []
    for j, s in enumerate(segs):
        k_ = np.c_[np.round(s[1] * Q), np.round(s[2] * 10)]
        keep = np.any(k_ != np.roll(k_, 1, 0), axis=1)
        xy, z = s[1][keep], s[2][keep]
        if len(z) < 3 or area3(np.c_[xy * 100, z]) < .05: continue
        out.append([s[0], xy, z, j in slope])
    return out

def build(name):
    files = sorted(glob.glob(os.path.join(RAW, 'DA*_3D_Buildings_Merged.gml')))
    if not files: sys.exit(f'没有原始数据：先运行 python3 {sys.argv[0]} fetch {name}')
    R = tc_osm.REGIONS[name]; HW, HH = R['w'] / 200, R['h'] / 200; proj = plane(name)
    X0, Y0, X1, Y1 = region_box(name, 1.02)
    V, FLn, FI, FTy, BH, BC, BA, BINs, BPL, BPV, TPL, TPV, BF = [], [], [], [], [], [], [], [], [], [], [], [], [0]
    RHs, TZs = [], []
    nv = 0; seen = set(); nb = 0; nsm = 0
    for fn in files:
        print('parse', os.path.basename(fn), flush=True)
        for ev, el in ET.iterparse(fn, events=('end',)):
            if el.tag != TAG_B: continue
            nb += 1
            bin_, faces = parse_building(el); el.clear()
            if not faces: continue
            A = np.concatenate([f[1] for f in faces])
            cx_, cy_ = A[:, 0].mean(), A[:, 1].mean()
            if not (X0 < cx_ < X1 and Y0 < cy_ < Y1): continue
            key = (bin_, round(cx_), round(cy_))
            if key in seen: continue                                   # 相邻 DA 分块的重叠
            seen.add(key)
            px, py = proj(A[:, 0], A[:, 1])
            cx, cy = float(px.mean()), float(py.mean())
            if abs(cx) > HW or abs(cy) > HH: continue                  # 与 tc_osm 相同：中心在取材框里的楼
            zg = min(f[1][:, 2].min() for f in faces if f[0] == 0) if any(f[0] == 0 for f in faces) else A[:, 2].min()
            XY = np.c_[px, py]; Z = (A[:, 2] - zg) * FT
            segs, ground, o = [], None, 0
            for k, P in faces:
                xy, z = XY[o:o + len(P)], Z[o:o + len(P)]; o += len(P)
                if k == 0:                                             # 地面：只取最大的一块当轮廓
                    if ground is None or abs(ring_area(xy)) > abs(ring_area(ground)): ground = xy
                else: segs.append([k, xy.copy(), np.clip(z, 0, 3000).astype(np.float64)])
            segs = clean_building(segs)
            if not segs: continue
            RS = [(float(np.median(s[2])), abs(ring_area(s[1])) * 1e4, s[1]) for s in segs if s[0] == 1]
            if not RS: continue
            if ground is None: ground = segs[0][1]
            if ring_area(ground) < 0: ground = ground[::-1]
            big = [r for r in RS if r[1] >= RH_M2] or RS
            rh = max(r[0] for r in big)
            thr = max(TOP_M2, .03 * abs(ring_area(ground)) * 1e4)
            cand = [r for r in RS if r[1] >= thr] or [max(RS, key=lambda r: r[1])]
            zmax = max(r[0] for r in cand); tz, _, tp = max([r for r in cand if r[0] > zmax - .5], key=lambda r: r[1])
            if ring_area(tp) < 0: tp = tp[::-1]
            # 顶点：本楼内去重
            PXY = np.concatenate([s[1] for s in segs]); PZ = np.concatenate([s[2] for s in segs])
            qa = np.c_[np.round(PXY * Q), np.round(PZ * 10)].astype(np.int32)
            uq, inv = np.unique(qa, axis=0, return_inverse=True); inv = inv.ravel()
            V.append(uq); o = 0; nf = 0
            for s in segs:
                idx = inv[o:o + len(s[2])]; o += len(s[2])
                FLn.append(len(idx)); FI.extend(int(i) + nv for i in idx); FTy.append(s[0]); nf += 1
            nv += len(uq)
            BF.append(BF[-1] + nf); BH.append(float(PZ.max())); RHs.append(max(rh, 1.0)); TZs.append(min(tz, rh)); BC.append((cx, cy)); BA.append(abs(ring_area(ground))); BINs.append(int(bin_ or 0))
            BPL.append(len(ground)); BPV.append(np.round(ground * Q).astype(np.int16)); TPL.append(len(tp)); TPV.append(np.round(tp * Q).astype(np.int16))
            nsm += sum(1 for s in segs if s[3])
            if len(BH) % 2000 == 0: print(' ', len(BH), 'buildings kept /', nb, 'read', flush=True)
    V = np.concatenate(V); assert np.abs(V[:, :2]).max() < 32767 and V[:, 2].max() < 32767
    out = dict(V=V.astype(np.int16), FL=np.array(FLn, np.uint16), FI=np.array(FI, np.uint32), FT=np.array(FTy, np.uint8),
               BF=np.array(BF, np.uint32), BH=np.array(BH, np.float32), RH=np.array(RHs, np.float32), TZ=np.array(TZs, np.float32), BC=np.array(BC, np.float32), BA=np.array(BA, np.float32),
               BIN=np.array(BINs, np.uint32), BPL=np.array(BPL, np.uint16), BPV=np.concatenate(BPV), TPL=np.array(TPL, np.uint16), TPV=np.concatenate(TPV),
               Q=np.array(Q), credit=np.array(CREDIT), region=np.array(name))
    os.makedirs(OUT, exist_ok=True); fn = os.path.join(OUT, f'{name}.npz')
    np.savez_compressed(fn, **out)
    print(f'{name}: {len(BH)} buildings, {len(V)} verts, {len(FLn)} faces (roof {int((out["FT"] == 1).sum())}, wall {int((out["FT"] == 2).sum())}); '
          f'{nsm} sloped roof faces kept; max height {max(BH):.0f} m, max roof {max(RHs):.0f} m; wrote {fn} {os.path.getsize(fn) / 2**20:.1f} MB', flush=True)

# ---------------- 读取（给 Blender 端用）----------------
def load(name):
    """读 <区域>.npz → dict：平面坐标已反量化；'faces' 按楼切好的迭代器由调用方自己按 BF 取。"""
    d = dict(np.load(os.path.join(OUT, f'{name}.npz')))
    q = float(d['Q']); d['Vf'] = np.c_[d['V'][:, :2] / q, d['V'][:, 2] / 10.0].astype(np.float32)
    d['FS'] = np.concatenate([[0], np.cumsum(d['FL'].astype(np.int64))])                 # 每个面在 FI 里的起点
    for k in ('BP', 'TP'):
        L = d[k + 'L'].astype(np.int64); S = np.concatenate([[0], np.cumsum(L)])
        d[k] = [d[k + 'V'][S[i]:S[i + 1]] / q for i in range(len(L))]
    return d

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    names = sys.argv[2:] or ['manhattan']
    if cmd not in ('fetch', 'build'): sys.exit('用法：python3 blender/tc_real3d.py fetch|build [manhattan]')
    for n in names: (fetch if cmd == 'fetch' else build)(n)
