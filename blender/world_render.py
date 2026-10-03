# 世界全景 · Blender 写实渲染
# 用法：Blender -b -P world_render.py -- [--res 3200] [--samples 128] [--tod day|night] [--out path.png]
# 输入：data/ 下由 map/world.html?export 导出的高度场与势力归属（与代码地图同一份地理）
import bpy, json, math, os, sys
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import tc_common
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {'--crop': '', '--clouds': '0', '--tex': '1.5', '--mesh': '2400', '--res': '3200', '--samples': '128', '--out': os.path.join(HERE, '..', 'map', 'art', 'world_preview.png'), '--tilt': '0', '--tod': 'day'}
for i in range(0, len(args) - 1, 2): opt[args[i]] = args[i + 1]
RES, SAMPLES, OUT, TILT = int(opt['--res']), int(opt['--samples']), os.path.abspath(opt['--out']), float(opt['--tilt'])

meta = json.load(open(os.path.join(DATA, 'meta.json')))
GW, GH, SEA = meta['GW'], meta['GH'], meta['SEA']
elev = np.fromfile(os.path.join(DATA, 'elev.f32'), dtype=np.float32).reshape(GH, GW)
owner = np.fromfile(os.path.join(DATA, 'owner.i16'), dtype=np.int16).reshape(GH, GW)
height = np.fromfile(os.path.join(DATA, 'height.f32'), dtype=np.float32).reshape(GH, GW)
kinds = meta['kinds']
land = owner >= 0

# ---------------- 工具：平滑噪声、盒式模糊 ----------------
rng = np.random.default_rng(2088)
def box(a, r):
    if r < 1: return a
    k = 2 * r + 1
    p = np.pad(a, ((r, r), (r, r)) + ((0, 0),) * (a.ndim - 2), mode='edge')
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)) + ((0, 0),) * (a.ndim - 2))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)
def noise(scale, octaves=4):
    out = np.zeros((GH, GW), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        s = max(2, int(scale / 2 ** o))
        g = rng.random((GH // s + 2, GW // s + 2)).astype(np.float32)
        up = np.kron(g, np.ones((s, s), np.float32))[:GH, :GW]
        out += box(up, s // 2) * amp; tot += amp; amp *= .5
    return out / tot

# ---------------- 程序化地形（写实）：脊状多重分形 + 域扭曲 + 流水侵蚀 ----------------
perm = rng.permutation(256); perm = np.concatenate([perm, perm])
GRAD = np.array([(1, 1), (-1, 1), (1, -1), (-1, -1), (1, 0), (-1, 0), (0, 1), (0, -1)], np.float32)
def perlin(x, y):
    xi = np.floor(x).astype(int) & 255; yi = np.floor(y).astype(int) & 255
    xf = x - np.floor(x); yf = y - np.floor(y)
    u = xf * xf * xf * (xf * (xf * 6 - 15) + 10); v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
    def g(ix, iy, dx, dy): gg = GRAD[perm[perm[ix] + iy] & 7]; return gg[..., 0] * dx + gg[..., 1] * dy
    n00 = g(xi, yi, xf, yf); n10 = g(xi + 1, yi, xf - 1, yf); n01 = g(xi, yi + 1, xf, yf - 1); n11 = g(xi + 1, yi + 1, xf - 1, yf - 1)
    return (n00 + u * (n10 - n00)) + v * ((n01 + u * (n11 - n01)) - (n00 + u * (n10 - n00)))
def fbm(x, y, oct=5):
    s_ = 0; a = .5; f = 1
    for _ in range(oct): s_ = s_ + a * perlin(x * f, y * f); a *= .5; f *= 2.03
    return s_
def ridged(x, y, oct=7, gain=2.0, offset=1.0):
    s_ = 0; w = 1.0; f = 1; amp = 1
    for _ in range(oct):
        sig = (offset - np.abs(perlin(x * f, y * f))) ** 2 * w
        w = np.clip(sig * gain, 0, 1); s_ = s_ + sig * amp; f *= 2.05; amp *= .5
    return s_ / 1.9

EH, EW = GH // 2, GW // 2                                                 # 侵蚀网格 800×500
landE = land[::2, ::2]; ownE = owner[::2, ::2]
grp = np.full(ownE.shape, -1, int)
for n_, k in enumerate(kinds):
    gid = 0 if k.startswith('oren') else 1 if k.startswith('fed') else 2 if k == 'xl' else 10 + n_
    grp[ownE == n_] = gid
border = np.zeros(ownE.shape, bool)
for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
    sh = np.roll(np.roll(grp, dy, 0), dx, 1); border |= (sh != grp) & (sh >= 0) & landE
bnear = np.clip(box(border.astype(np.float32), 26) * 5, 0, 1)
MT = {'oren-core': .30, 'oren-prov': .45, 'fed-core': .10, 'fed-knight': .25, 'xl': .95, 'minor': .35, 'overseas': .5}
mtE = np.zeros(ownE.shape, np.float32)
for n_, k in enumerate(kinds): mtE[ownE == n_] = MT[k]
mtE = box(mtE, 10)
inland = box(landE.astype(np.float32), 18)
yy, xx = np.mgrid[0:EH, 0:EW].astype(np.float32)
wx = xx / 150 + fbm(xx / 260 + 3.1, yy / 260 + 7.7, 4) * 1.4; wy = yy / 150 + fbm(xx / 260 + 11.3, yy / 260 + 1.9, 4) * 1.4
rmf = ridged(wx, wy)
Mmask = np.clip(mtE * .9 + bnear * .7, 0, 1) * np.clip(inland * 1.8 - .25, 0, 1)
h = (inland * .05 + Mmask * rmf * .7 + (fbm(xx / 120, yy / 120, 6) * .5 + .5) * .06 * inland).astype(np.float32)
h = np.where(landE, np.maximum(h, .004), 0)

import heapq
def fill_pits(h):
    H, W = h.shape; out = h.copy(); done = ~landE.copy(); pq = []
    edge = landE & (box((~landE).astype(np.float32), 1) > 0)
    for y, x in zip(*np.nonzero(edge)): heapq.heappush(pq, (out[y, x], y, x)); done[y, x] = True
    while pq:
        v, y, x = heapq.heappop(pq)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not done[ny, nx]:
                done[ny, nx] = True
                if out[ny, nx] <= v: out[ny, nx] = v + 1e-5
                heapq.heappush(pq, (out[ny, nx], ny, nx))
    return out
def d8(h):
    H, W = h.shape; ids = np.arange(H * W).reshape(H, W)
    best = np.zeros_like(h); rcv = ids.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0: continue
            sh = np.roll(np.roll(h, -dy, 0), -dx, 1)
            drop = (h - sh) / (1.4142 if dx and dy else 1.0)
            m = drop > best; best = np.where(m, drop, best); rcv = np.where(m, np.roll(np.roll(ids, -dy, 0), -dx, 1), rcv)
    return rcv.ravel(), best
def accumulate(h, rcv):
    order = np.argsort(-h.ravel(), kind='stable').tolist(); A = [1.0] * h.size; r = rcv.tolist()
    for i in order:
        j = r[i]
        if j != i: A[j] += A[i]
    return np.array(A, np.float32).reshape(h.shape)
for it in range(24):
    if it % 6 == 0: h = np.where(landE, fill_pits(h), 0)
    jit = rng.random(h.shape).astype(np.float32) * 4e-6
    rcv, S = d8(h + jit); A = accumulate(h + jit, rcv)
    h = h - 0.0005 * np.sqrt(A) * np.clip(S * 30, 0, 2) * landE
    h = h + 0.12 * (box(h, 1) - h) * landE
    h = np.where(landE, np.maximum(h, .003), 0)
h = np.where(landE, fill_pits(h), 0); jit = rng.random(h.shape).astype(np.float32) * 4e-6; rcv, _ = d8(h + jit); A = accumulate(h + jit, rcv)
river = np.clip((np.log(A) - 6.5) / 2.5, 0, 1) * landE
print('erosion done; max A', A.max(), 'h max', h.max())
# 旷野高地：奥伦境内、离天城 180 以外的最高点（地图坐标 1600×1000），写给查看器
oren = np.isin(ownE, [n_ for n_, k in enumerate(kinds) if k.startswith('oren')])
yyE, xxE = np.mgrid[0:EH, 0:EW]
far = np.hypot(xxE * 2 - 720, yyE * 2 - 470) > 180
cand = np.where(oren & far, h, -1); iy, ix = np.unravel_index(np.argmax(cand), cand.shape)
json.dump({'highland': {'x': int(ix * 2), 'y': int(iy * 2)}}, open(os.path.join(HERE, '..', 'map', 'data', 'derived.json'), 'w'))

# ---------------- 上采样到渲染网格 + 高频细节 ----------------
H2, W2 = int(GH * float(opt['--tex'])), int(GW * float(opt['--tex']))
def up(a):
    y = np.linspace(0, a.shape[0] - 1, H2); x = np.linspace(0, a.shape[1] - 1, W2)
    y0 = np.floor(y).astype(int); x0 = np.floor(x).astype(int); y1 = np.minimum(y0 + 1, a.shape[0] - 1); x1 = np.minimum(x0 + 1, a.shape[1] - 1)
    fy = (y - y0)[:, None]; fx = (x - x0)[None, :]
    if a.ndim == 3: fy = fy[..., None]; fx = fx[..., None]
    return (a[y0][:, x0] * (1 - fy) * (1 - fx) + a[y0][:, x1] * (1 - fy) * fx + a[y1][:, x0] * fy * (1 - fx) + a[y1][:, x1] * fy * fx)
def noise2(shape, scale, octaves=5, ridged_=False):
    Hh, Ww = shape; yy2, xx2 = np.mgrid[0:Hh, 0:Ww].astype(np.float32)
    return (ridged(xx2 / scale, yy2 / scale, octaves) if ridged_ else fbm(xx2 / scale, yy2 / scale, octaves) * .5 + .5)
landU = up(land.astype(np.float32)) > .5
kidxU = up(np.where(land, owner, 0).astype(np.float32)).round().astype(int)
hU = up(h); heightU = up(height); MU = up(Mmask)
# 河流：矢量化——沿汇流网络追踪河道折线，Chaikin 平滑 + 蜿蜒扰动，线宽随流量增大，再栅格化
TSr = float(opt['--tex']) / 1.5
A_MIN = 700
rflat = rcv; Af = A.ravel(); isriv = (Af > A_MIN) & landE.ravel()
upstream = np.zeros(Af.size, bool)
src_idx = np.nonzero(isriv)[0]
upstream[rflat[src_idx]] = True                                    # 有河流汇入的格子
starts = [i for i in src_idx if not upstream[i]]
visited = np.zeros(Af.size, bool); lines = []
for st in starts:
    path = [st]; cur = st
    while True:
        nxt = rflat[cur]
        if nxt == cur or not landE.ravel()[nxt]: path.append(nxt); break
        path.append(nxt)
        if visited[nxt]: break
        visited[nxt] = True; cur = nxt
    if len(path) > 3: lines.append(path)
sxH, syH = W2 / EW, H2 / EH
def chaikin(p, n=3):
    for _ in range(n):
        q = np.empty((len(p) * 2 - 2, 2), np.float32); q[0::2] = p[:-1] * .75 + p[1:] * .25; q[1::2] = p[:-1] * .25 + p[1:] * .75
        q[0] = p[0]; q[-1] = p[-1]; p = q
    return p
classes = [np.zeros((H2, W2), bool) for _ in range(4)]
for path in lines:
    ys, xs = np.divmod(np.array(path), EW)
    pts = np.stack([(xs + .5) * sxH, (ys + .5) * syH], -1).astype(np.float32)
    pts = chaikin(pts, 3)
    # 蜿蜒：沿法线方向加噪声位移
    d = np.gradient(pts, axis=0); nrm = np.stack([-d[:, 1], d[:, 0]], -1); nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-6)
    t = np.cumsum(np.r_[0, np.linalg.norm(np.diff(pts, axis=0), axis=1)])
    wob = (fbm(t / (18 * TSr), np.full_like(t, len(lines) % 97 + .5), 3)) * 3.2 * TSr
    pts = pts + nrm * wob[:, None]
    # 稠密采样后按流量分档
    seg = np.diff(pts, axis=0); L = np.linalg.norm(seg, axis=1)
    k = np.maximum(1, np.ceil(L / .6).astype(int))
    fl = Af[np.array(path)]; fl = np.interp(np.linspace(0, len(fl) - 1, len(pts)), np.arange(len(fl)), fl)
    for a0, sg, kk, f in zip(pts[:-1], seg, k, fl[:-1]):
        tt = np.linspace(0, 1, kk, endpoint=False)[:, None]; pp = a0 + sg * tt
        c = min(3, int(np.log(f / A_MIN) / np.log(4)))
        yi = np.clip(pp[:, 1].astype(int), 0, H2 - 1); xi = np.clip(pp[:, 0].astype(int), 0, W2 - 1)
        classes[c][yi, xi] = True
riverU = np.zeros((H2, W2), np.float32)
for c, m in enumerate(classes):
    r_ = int(round(c * .6 * TSr))
    mm = m.copy()
    for dy in range(-r_, r_ + 1):
        for dx in range(-r_, r_ + 1):
            if dy * dy + dx * dx <= r_ * r_ and (dy or dx): mm |= np.roll(np.roll(m, dy, 0), dx, 1)
    riverU = np.maximum(riverU, mm.astype(np.float32) * (.42 + c * .18))
riverU = box(riverU, 1)
print('rivers', len(lines))
TS = float(opt['--tex']) / 1.5   # 纹理像素尺度：半径、噪声尺度都按它放大
det = noise2((H2, W2), 18 * TS, 4, ridged_=True)
det2 = noise2((H2, W2), 70 * TS, 4)
hU = hU + ((det - .5) * .016 * MU ** 1.5 + (det2 - .5) * .01) * np.clip(hU * 6, 0, 1)
hU = np.where(landU, np.maximum(hU, .003), 0)
mtU = MU
GH, GW = H2, W2; land = landU; elev = hU; height = heightU; owner = np.where(landU, kidxU, -1)
print('terrain ready', GW, GH)

# ---------------- 各势力的写实地貌配色（低 / 中 / 高） ----------------
PAL = {   # 卫星影像真彩色：低饱和、偏暗
    'oren-core':  [(.38, .31, .19), (.33, .27, .18), (.30, .25, .20)],   # 干草原 → 赭色高原
    'oren-prov':  [(.30, .29, .17), (.28, .25, .17), (.28, .25, .20)],
    'fed-core':   [(.025, .07, .022), (.022, .058, .02), (.12, .13, .10)], # 温带阔叶林
    'fed-knight': [(.05, .10, .03), (.04, .08, .028), (.14, .14, .11)],   # 林地 + 田园
    'xl':         [(.17, .17, .15), (.21, .20, .20), (.28, .27, .28)],   # 灰紫岩山
    'minor':      [(.20, .21, .12), (.18, .18, .12), (.24, .22, .18)],
    'overseas':   [(.03, .10, .035), (.025, .08, .03), (.12, .13, .09)], # 湿润丛林
}
kind_arr = np.array(kinds)[np.where(land, owner, 0)]
t = np.clip(elev / .45, 0, 1)[..., None]
col = np.zeros((GH, GW, 3), np.float32); mt = mtU
for k, p in PAL.items():
    m = (kind_arr == k) & land
    if not m.any(): continue
    p0, p1, p2 = [np.array(c, np.float32) for c in p]
    c = np.where(t < .5, p0 + (p1 - p0) * (t * 2), p1 + (p2 - p1) * ((t - .5) * 2))
    col[m] = c[m]
col = box(col, max(1, int(9 * TS)))                                                     # 势力交界处的生物群系自然过渡
n1, n2 = noise2((GH, GW), 50 * TS, 4), noise2((GH, GW), 8 * TS, 3)
n3 = noise2((GH, GW), 160 * TS, 3)
wet = np.array((.72, 1.05, .70), np.float32); dry = np.array((1.15, 1.0, .82), np.float32)
n4 = noise2((GH, GW), 2.5 * TS, 2)
col *= (wet + (dry - wet) * n3[..., None]) * (0.75 + 0.5 * n1[..., None]) * (0.88 + 0.24 * n2[..., None]) * (0.92 + 0.16 * n4[..., None])
gy, gx = np.gradient(elev * 90)
slope = np.clip(np.hypot(gx, gy), 0, 1)
rock = np.array((.22, .20, .18), np.float32)
col = col * (1 - slope[..., None] * .75) + rock * slope[..., None] * .75
# 农田拼块：骑士领、奥伦行省、中小国的低缓地带
cell = max(2, int(6 * TS)); gyc, gxc = np.mgrid[0:GH, 0:GW]
tone = rng.random((GH // cell + 2, GW // cell + 2)).astype(np.float32)
jx = (gxc + (noise2((GH, GW), 30 * TS, 2) * 10).astype(int)) // cell; jy = (gyc + (noise2((GH, GW), 30 * TS, 2) * 10).astype(int)) // cell
fields = tone[np.clip(jy, 0, tone.shape[0] - 1), np.clip(jx, 0, tone.shape[1] - 1)]
farmk = np.isin(kind_arr, ['fed-knight', 'oren-prov', 'minor']) & land
farm = box((farmk & (slope < .25) & (elev < .2)).astype(np.float32), 3) * (n3 > .35)
fcol = np.stack([.20 + .16 * fields, .21 + .10 * fields, .10 + .06 * fields], -1)
col = col * (1 - farm[..., None] * .35) + fcol * farm[..., None] * .35
snow = (np.clip(((elev + (n2 - .5) * .12 + (det - .5) * .10) - .47) * 25, 0, 1) * np.clip(mt * 2 - .5, 0, 1) * np.clip(1.25 - slope * .8, 0, 1))
col = col * (1 - snow[..., None]) + np.array((.80, .82, .86), np.float32) * snow[..., None]
riverU2 = np.clip(riverU * 1.4, 0, 1)
col = col * (1 - riverU2[..., None] * .85) + np.array((.03, .07, .09), np.float32) * riverU2[..., None] * .85
valley = box(riverU, max(1, int(4 * TS)))                                                # 河谷更湿润、更绿
col = col * (1 - valley[..., None] * .25) + np.array((.10, .18, .07), np.float32) * valley[..., None] * .25
coast = box(land.astype(np.float32), max(1, int(1 * TS)))
beach = np.clip((1 - coast) * 2, 0, 1) * land
col = col * (1 - beach[..., None] * .6) + np.array((.48, .44, .33), np.float32) * beach[..., None] * .6
col = col * .95 + np.array((.025, .03, .045), np.float32)   # 大气散射的轻微蓝灰罩
# 水色：按离岸距离（多次模糊陆地掩膜近似）
lf = land.astype(np.float32)
near = box(lf, max(1, int(10 * TS))) * .3 + box(lf, max(1, int(30 * TS))) * .3 + box(lf, max(1, int(80 * TS))) * .4
depth = np.clip(1 - near * 1.7 + (n1 - .5) * .12, 0, 1) ** .5
shallow, deep = np.array((.035, .10, .12), np.float32), np.array((.006, .02, .05), np.float32)
wcol = shallow + (deep - shallow) * depth[..., None]
wcol *= (0.94 + 0.12 * n1[..., None])

def to_image(name, rgb, float_buf=False):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=float_buf)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = rgb if rgb.ndim == 3 else rgb[..., None]
    img.pixels.foreach_set(np.flipud(rgba).ravel())
    img.update(); img.pack()
    return img

# ---------------- 场景 ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
MW, MH = 16.0, 10.0
S_LAND = 1.0                                                             # 垂直夸张

# ---------------- 城市光斑（D41 §0.5 / B7）：三座首都。昼是灰色肌理，夜是图上唯一的灯 ----------------
# 数据网格 1600×1000 格对应 maps.json 的 extent_m 12000×7500 km，即 1 格 = 7.5 km；成图全宽 = 1.48 km/px。
# 天城都会半径约 40 km（8000 px 下 ≈27 px），另两座首府更小；夜里三片光同一半径，没有城市的地方不亮。
_p = json.load(open(os.path.join(HERE, '..', 'map', 'data', 'world_markers.json')))
_f = json.load(open(os.path.join(HERE, '..', 'map', 'data', 'maps.json')))['maps']['world'].get('view', {}).get('focus')
CAPS = sorted([(c['id'], float(c['x']), float(c['y'])) for c in _p['places']
               if c.get('type') == 'capital' and c.get('x') is not None], key=lambda c: c[0] != _f)
CAP_R = [5.3, 3.8, 2.9]                                                 # 都会半径（数据网格格数；1 格 = 7.5 km）
CAP_E = [1.0, .62, .45]                                                 # 夜里的相对亮度：天城最亮
CAP_ROT = [.3, -.2, .6]                                                 # 街网走向
TOD = opt['--tod']
RES_Y = int(RES * (MH * math.cos(math.radians(TILT)) * .97) / (MW * .985))
UX0, UX1 = (1 - .985) / 2, (1 + .985) / 2                              # 成图裁切：横向 98.5%
_vy = MH * math.cos(math.radians(TILT)) * .97 / MH
UY0, UY1 = (1 - _vy) / 2, (1 + _vy) / 2                                # 纵向 cos(pitch)×97%（overlays.py 同一取样）
KM_PX = (UX1 - UX0) * 12000. / RES

def upsample_render(a, wf=None, hf=None):
    """按相机裁切把地形贴图双线性放大到成图尺寸（成图与贴图同一米/像素，标记与比例尺才对得上）。"""
    wf = wf or RES; hf = hf or RES_Y
    xs = (UX0 + (np.arange(wf) + .5) / wf * (UX1 - UX0)) * (a.shape[1] - 1)   # 与 map/app/util.mjs toImg() 同一取样
    ys = (UY0 + (np.arange(hf) + .5) / hf * (UY1 - UY0)) * (a.shape[0] - 1)
    x0 = np.floor(xs).astype(int); x1 = np.minimum(x0 + 1, a.shape[1] - 1); fx = (xs - x0).astype(np.float32)[None, :, None]
    y0 = np.floor(ys).astype(int); y1 = np.minimum(y0 + 1, a.shape[0] - 1); fy = (ys - y0).astype(np.float32)[:, None, None]
    out = np.empty((hf, wf, 3), np.float32)
    for i in range(0, hf, 256):                                          # 分块，免得同时开四个全图临时数组
        j = min(i + 256, hf)
        row = a[y0[i:j]] * (1 - fy[i:j]) + a[y1[i:j]] * fy[i:j]
        out[i:j] = row[:, x0] * (1 - fx) + row[:, x1] * fx
    return out

def city_win(cx, cy, rp, k=1.25):
    half = int(rp * k) + 2
    x0, x1 = max(0, int(cx) - half), min(RES, int(cx) + half + 1)
    y0, y1 = max(0, int(cy) - half), min(RES_Y, int(cy) + half + 1)
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    return (slice(y0, y1), slice(x0, x1)), xx - cx, yy - cy

def city_streets(dx, dy, rp, rot):
    rx = dx * math.cos(rot) + dy * math.sin(rot); ry = -dx * math.sin(rot) + dy * math.cos(rot)
    bw = max(2.2, rp / 3.0)
    su = np.abs((rx / bw + .5) % 1. - .5) * bw
    sv = np.abs((ry / (bw * 1.4) + .5) % 1. - .5) * bw * 1.4
    return rx, ry, np.clip(1.2 - np.minimum(su, sv), 0, 1), bw

def city_day(colf, cx, cy, rp, rot, seed):
    """昼：灰色城市肌理（街区色调 + 街网 + 一片工业用地 + 轮廓起伏），和地形同一层大气罩。"""
    sl, dx, dy = city_win(cx, cy, rp)
    rad = np.hypot(dx, dy) / rp
    nz = fbm(dx / (rp * .5) + seed, dy / (rp * .5), 4) * .5 + .5
    urb = np.clip(1.2 - rad - (nz - .5) * .9, 0, 1) * .95
    rx, ry, street, bw = city_streets(dx, dy, rp, rot)
    blk = (np.floor(rx / bw) * 7. + np.floor(ry / (bw * 1.4)) * 3. + seed) % 1.
    c = np.stack([.168 + .042 * blk, .165 + .040 * blk, .158 + .038 * blk], -1)   # 城比周围的旱地暗一截
    ind = np.clip((fbm(dx / (rp * .9) + seed + 9, dy / (rp * .9), 3) + .5) * 1.6 - .55, 0, 1) * (rad > .4)
    c = c * (1 - ind[..., None] * .45) + np.array((.225, .215, .20), np.float32) * ind[..., None] * .45
    c = c * (1 - street[..., None] * .45) + np.array((.33, .325, .315), np.float32) * street[..., None] * .45
    c = c * (.9 + .2 * np.clip(1.1 - rad, 0, 1))[..., None]
    c = c * .95 + np.array((.022, .024, .030), np.float32)
    a = urb[..., None]
    colf[sl] = colf[sl] * (1 - a) + c * a

def city_night(em, cx, cy, rp, rot, seed, gain):
    """夜：街上的灯（沿街更亮）+ 一条贯通主干道 + 中心暖、外缘冷，外围一圈很淡的辉光。"""
    sl, dx, dy = city_win(cx, cy, rp, 3.0)
    rad = np.hypot(dx, dy) / rp
    _, ry, street, _ = city_streets(dx, dy, rp, rot)
    core = np.clip(1.05 - rad, 0, 1) ** .85
    lit = .22 + .70 * np.clip(1.15 - rad, 0, 1) + .45 * street
    arter = np.clip(1 - np.abs(ry) / (rp * .18), 0, 1) * np.clip(1.15 - rad, 0, 1)
    v = (core * lit + .5 * arter) * gain
    warm = np.array((1., .70, .38), np.float32); edge = np.array((1., .86, .66), np.float32)
    tint = warm + (edge - warm) * np.clip(rad, 0, 1)[..., None]
    e = v[..., None] * tint + np.exp(-(rad / 1.35) ** 2)[..., None] * .05 * gain
    np.maximum(em[sl], e, out=em[sl])

colF = upsample_render(col)                                             # 成图分辨率的底图（地形本身不变）
emitF = np.zeros((RES_Y, RES, 3), np.float32)
lights = []
for _i, (_pid, _u, _v) in enumerate(CAPS):
    _cx = (_u / 1600. - UX0) / (UX1 - UX0) * RES
    _cy = (_v / 1000. - UY0) / (UY1 - UY0) * RES_Y
    _rp = CAP_R[_i] / 1600. * (UX1 - UX0) * RES
    print('city %-12s centre %.0f,%.0f px  radius %.1f px (%.0f km)' % (_pid, _cx, _cy, _rp, _rp * KM_PX))
    city_day(colF, _cx, _cy, _rp, CAP_ROT[_i], 3.1 + _i * 5.7)
    if TOD == 'night':
        # 底图是按相机裁切预先放大好的，自发光贴图却铺满整个 UV 0…1：画灯的坐标要按裁切倒算回去，
        # 否则天城会偏 6 px、圣都偏 37 px（实测互相关 0.99 但位移不等）
        city_night(emitF, _cx / (UX1 - UX0), _cy / (UY1 - UY0), _rp / (UX1 - UX0), CAP_ROT[_i], 3.1 + _i * 5.7, CAP_E[_i])
        lights.append([_cx / RES, _cy / RES_Y])
if TOD == 'night':                                                      # 夜：地面与海只剩很暗的冷灰（月光）
    colF *= np.array((.30, .36, .50), np.float32)
    wcol = wcol * np.array((.22, .30, .46), np.float32)

coastramp = np.clip(box(land.astype(np.float32), int(18 * TS)) * 1.8 - .8, 0, 1) ** 1.5
disp = np.where(land, 0.001 + elev * coastramp, -0.02 - depth * .2).astype(np.float32)
img_h = to_image('height', disp, float_buf=True); img_h.colorspace_settings.name = 'Non-Color'
img_c = to_image('albedo', np.clip(colF, 0, 1)); img_c.colorspace_settings.name = 'sRGB'
img_w = to_image('water', np.clip(wcol, 0, 1)); img_w.colorspace_settings.name = 'sRGB'
img_e = None
if TOD == 'night':                                                      # 城市灯源图：自检用（无源亮斑检查的源）
    img_e = to_image('citylights', np.clip(emitF, 0, 1)); img_e.colorspace_settings.name = 'sRGB'
    img_e.filepath_raw = OUT.replace('.png', '_emit.png'); img_e.file_format = 'PNG'; img_e.save()

MX = min(GW, int(opt['--mesh'])); MY = int(MX * GH / GW)
bpy.ops.mesh.primitive_grid_add(x_subdivisions=MX, y_subdivisions=MY, size=1, calc_uvs=True)
terrain = bpy.context.active_object; terrain.name = 'terrain'
terrain.scale = (MW, MH, 1); bpy.ops.object.transform_apply(scale=True)
# 直接按坐标采样高度写入顶点（比 Displace 修改器可靠）
me = terrain.data; n = len(me.vertices)
co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(n, 3)
px = np.clip(((co[:, 0] / MW + .5) * (GW - 1)).round().astype(int), 0, GW - 1)
py = np.clip(((.5 - co[:, 1] / MH) * (GH - 1)).round().astype(int), 0, GH - 1)
co[:, 2] = disp[py, px] * S_LAND
me.vertices.foreach_set('co', co.ravel()); me.update()
print('terrain z range', co[:, 2].min(), co[:, 2].max(), 'verts', n)
bpy.ops.object.shade_smooth()

def mat_from_image(name, img, rough, detail=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = img; ti.interpolation = 'Cubic'
    if detail:
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 900; nz.inputs['Detail'].default_value = 6
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'OVERLAY'; mix.inputs['Factor'].default_value = detail
        nt.links.new(ti.outputs['Color'], mix.inputs['A']); nt.links.new(nz.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    else:
        nt.links.new(ti.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    return m
terrain.data.materials.append(mat_from_image('terrain', img_c, .92, detail=.18))
if img_e is not None:      # 夜：城市灯当自发光贴图接进地面材质（图上唯一的灯，亮斑都有源）
    _nt = terrain.data.materials[0].node_tree; _b = _nt.nodes['Principled BSDF']
    _ti = _nt.nodes.new('ShaderNodeTexImage'); _ti.image = img_e; _ti.interpolation = 'Cubic'
    if 'Emission Color' in _b.inputs:
        _nt.links.new(_ti.outputs['Color'], _b.inputs['Emission Color']); _b.inputs['Emission Strength'].default_value = 2.1
    else:                   # 旧版 Principled 没有自发光输入：Emission 节点 + Add 混色
        _em = _nt.nodes.new('ShaderNodeEmission'); _nt.links.new(_ti.outputs['Color'], _em.inputs['Color'])
        _em.inputs['Strength'].default_value = 2.1
        _mx = _nt.nodes.new('ShaderNodeMixShader')
        _nt.links.new(_b.outputs['BSDF'], _mx.inputs[1]); _nt.links.new(_em.outputs['Emission'], _mx.inputs[2])
        _nt.links.new(_mx.outputs['Shader'], _nt.nodes['Material Output'].inputs['Surface'])

bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0.0))
water = bpy.context.active_object; water.name = 'water'; water.scale = (MW * 1.3, MH * 1.3, 1)
wm = mat_from_image('water', img_w, .12)
wm.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = .6
water.data.materials.append(wm)

# 天空与太阳：西北来的斜阳；夜：很弱的冷月光 + 近黑蓝的天
world = bpy.data.worlds.new('sky'); sc.world = world; world.use_nodes = True
sky = world.node_tree.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA' if 'NISHITA' in [i.identifier for i in sky.bl_rna.properties['sky_type'].enum_items] else sky.sky_type
try:
    sky.sun_elevation = math.radians(30); sky.sun_rotation = math.radians(135); sky.sun_intensity = .4
except Exception: pass
_bg = world.node_tree.nodes['Background']
if TOD == 'night':
    for _l in list(world.node_tree.links):
        if _l.to_node == _bg: world.node_tree.links.remove(_l)
    _bg.inputs['Color'].default_value = (.010, .016, .034, 1); _bg.inputs['Strength'].default_value = 1.
else:
    world.node_tree.links.new(sky.outputs['Color'], _bg.inputs['Color'])
    _bg.inputs['Strength'].default_value = .45
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = .12 if TOD == 'night' else 3.2
sun.angle = math.radians(1.5); sun.color = (.72, .80, 1.) if TOD == 'night' else (1, .96, .9)
so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
so.rotation_euler = (math.radians(66), 0, math.radians(135))

# 积云层：程序化噪声 + 阈值，会在地面投下阴影
def cloud_layer(name, z, scale, lo, hi, stretch=1.0, dens=1.0, mask_img=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, z)); ob = bpy.context.active_object; ob.name = name
    ob.scale = (MW * (1.0 if mask_img else 1.3), MH * (1.0 if mask_img else 1.3), 1)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale * stretch, scale)
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Detail'].default_value = 14; nz.inputs['Roughness'].default_value = .62
    nz.inputs['Distortion'].default_value = .35
    cr = nt.nodes.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].position = lo; cr.color_ramp.elements[1].position = hi
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], nz.inputs['Vector']); nt.links.new(nz.outputs['Fac'], cr.inputs['Fac'])
    alpha = cr.outputs['Color']
    if mask_img is not None:
        ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = mask_img
        mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
        nt.links.new(cr.outputs['Color'], mul.inputs[0]); nt.links.new(ti.outputs['Color'], mul.inputs[1]); alpha = mul.outputs['Value']
    if dens != 1.0:
        d2 = nt.nodes.new('ShaderNodeMath'); d2.operation = 'MULTIPLY'; d2.inputs[1].default_value = dens
        nt.links.new(alpha, d2.inputs[0]); alpha = d2.outputs['Value']
    nt.links.new(alpha, b.inputs['Alpha'])
    b.inputs['Base Color'].default_value = (.92, .93, .95, 1); b.inputs['Roughness'].default_value = 1
    b.inputs['Subsurface Weight'].default_value = .0
    ob.data.materials.append(m)
    return ob
if opt['--clouds'] == '1':   # 默认不渲云：迷雾与云改由查看器图层按聊天进度控制
    cloud_layer('clouds', 1.4, 2.6, .63, .82, dens=.95)
    cloud_layer('cirrus', 1.6, 1.0, .58, .90, stretch=3.0, dens=.18)
# 虚灵古派：以太薄雾（谷地低雾，只在其领土内）
xlm = np.zeros((GH, GW), np.float32); xlm[(kind_arr == 'xl') & land] = 1
xlm = box(xlm, int(20 * TS)) * np.clip(1 - elev * 3.5, 0, 1) ** 2
img_fog = to_image('xlfog', xlm); img_fog.colorspace_settings.name = 'Non-Color'
if opt['--clouds'] == '1': cloud_layer('xl_mist', .12, 6.0, .40, .85, dens=.42, mask_img=img_fog)

# 正上方正交相机：卫星视角
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = MW * .985
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
tilt = math.radians(TILT)
co.rotation_euler = (tilt, 0, 0)
co.location = (0, -30 * math.sin(tilt), 30 * math.cos(tilt))
sc.render.resolution_x = RES
sc.render.resolution_y = RES_Y

# 渲染设置：Cycles + Metal GPU + 降噪
sc.render.engine = 'CYCLES'
tc_common.pick_gpu(sc, hybrid=True)
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
try: sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = -0.35
except Exception: sc.view_settings.view_transform = 'Filmic'
sc.render.image_settings.file_format = 'PNG'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
if opt['--crop']:   # 局部渲染：x0,y0,x1,y1（0~1，左上为原点），用于在最终精度下检查细节
    x0c, y0c, x1c, y1c = [float(v) for v in opt['--crop'].split(',')]
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x = x0c, x1c
    sc.render.border_min_y, sc.render.border_max_y = 1 - y1c, 1 - y0c
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
# 相机与灯源写进meta（自检与后续接线用；世界图是俯视，不走斜视相机文件）
json.dump({'tod': TOD, 'res': [RES, RES_Y], 'view': 'top-down orthographic',
           'ortho_scale_m': MW * .985 * 750 * 1000, 'm_per_px': MW * .985 * 750 * 1000 / RES,
           'crop': [UX0, UY0, UX1, UY1], 'lights_uv': lights,
           'capitals': [[_pid, _u, _v, CAP_R[_i], CAP_E[_i]] for _i, (_pid, _u, _v) in enumerate(CAPS)]},
          open(OUT + '.meta.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', OUT, sc.render.resolution_x, sc.render.resolution_y)
