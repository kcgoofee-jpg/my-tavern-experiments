# 《部落冲突》式薄纱云（CLOUD_STYLE='veil' 的原型，待用户批准）：纯 numpy，不依赖 bpy。
# 云 = 一堆沿等轴测斜向（约 35°，左下 → 右上）拉长的圆角「云板」，前面（画面下方）的叠在后面的上面；
#      每块板 = 白顶面 + 往下错开一点的浅冷灰侧面（读出一点厚度），整体再做沿斜向拉长的高斯模糊 → 软、边缘虚、没有描边。
# 输出预乘前的 RGBA（0..1）。tc_clouds.build_veil 拿它贴到城市上方的半透明平面上；tools/proto_cloud_sprites.py 拿它出 PNG 精灵。
import math, numpy as np

ANGLE = math.radians(35)                       # 云板长轴与水平方向的夹角（画面坐标，向右上）
TOP, SIDE = np.array([.97, .975, .99]), np.array([.835, .86, .90])   # 侧面 ≈ #D5DBE5（美术评审：暗部不深于它）   # 顶面近白、侧面浅冷灰（对比很低）

def _blur(img, sig_u, sig_v, ang=ANGLE):
    """沿 ang 方向 sig_u、垂直方向 sig_v（像素）的各向异性高斯模糊，FFT 实现（边界环绕，调用方自己留边）。img: (h, w) 或 (h, w, c)。"""
    h, w = img.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.rfftfreq(w)[None, :]
    c, s = math.cos(ang), math.sin(ang)
    fu = fx * c - fy * s; fv = fx * s + fy * c                      # 画面 y 向下：长轴方向 (c, -s)
    K = np.exp(-2 * math.pi ** 2 * (sig_u ** 2 * fu ** 2 + sig_v ** 2 * fv ** 2))
    if img.ndim == 2: return np.fft.irfft2(np.fft.rfft2(img) * K, s=(h, w))
    return np.stack([np.fft.irfft2(np.fft.rfft2(img[..., k]) * K, s=(h, w)) for k in range(img.shape[2])], -1)

def _slab(ax, ay, cx, cy, L, Wd, soft):
    """圆角长条的覆盖率（0..1）：中心 (cx, cy)、长 L、宽 Wd（像素），沿 ANGLE。ax, ay 为局部像素网格。"""
    c, s = math.cos(ANGLE), math.sin(ANGLE); dx, dy = ax - cx, ay - cy
    u = dx * c - dy * s; v = dx * s + dy * c
    r = Wd * .45
    qx = np.maximum(np.abs(u) - (L / 2 - r), 0); qy = np.maximum(np.abs(v) - (Wd / 2 - r), 0)
    d = np.hypot(qx, qy) - r
    return np.clip(.5 - d / soft, 0, 1)

def paint(h, w, slabs, depth=.35, soft=2.0, blur=(10, 4), pad=None):
    """slabs: [(cx, cy, L, Wd, opacity)]（像素）。返回 (h, w, 4) 直通 alpha 的 RGBA。
    depth：侧面往下错开的量（相对板宽）；blur：(沿斜向, 垂直) 高斯 σ（像素）。"""
    pad = pad if pad is not None else int(3 * max(blur)) + 4
    H2, W2 = h + 2 * pad, w + 2 * pad
    rgb = np.zeros((H2, W2, 3), np.float32); a = np.zeros((H2, W2), np.float32)   # 预乘
    for cx, cy, L, Wd, op in sorted(slabs, key=lambda t: t[1]):                 # 画面上方的先画，下方（更近）的盖上去
        cx += pad; cy += pad; R = int(L / 2 + Wd + soft * 2 + Wd * depth) + 2
        x0, x1, y0, y1 = max(0, int(cx - R)), min(W2, int(cx + R)), max(0, int(cy - R)), min(H2, int(cy + R + Wd * depth))
        if x0 >= x1 or y0 >= y1: continue
        ay, ax = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        for col, oy in ((SIDE, Wd * depth), (TOP, 0.0)):                        # 先侧面（往下错开），再顶面
            k = _slab(ax, ay, cx, cy + oy, L, Wd, soft) * op
            if oy == 0:                                                          # 顶面：板中间略亮、靠下沿略暗一点（很淡的体积）
                c, s = math.cos(ANGLE), math.sin(ANGLE); v = ((ax - cx) * s + (ay - cy) * c) / (Wd / 2)
                col = col[None, None] * (1 - .035 * np.clip(v, 0, 1))[..., None]
            else: col = col[None, None]
            rgb[y0:y1, x0:x1] = rgb[y0:y1, x0:x1] * (1 - k[..., None]) + col * k[..., None]
            a[y0:y1, x0:x1] = a[y0:y1, x0:x1] * (1 - k) + k
    rgb = _blur(rgb, *blur); a = _blur(a, *blur)
    rgb, a = rgb[pad:pad + h, pad:pad + w], np.clip(a[pad:pad + h, pad:pad + w], 0, 1)
    out = np.zeros((h, w, 4), np.float32); out[..., 3] = a
    out[..., :3] = np.clip(rgb / np.maximum(a, 1e-4)[..., None], 0, 1); out[a < 1e-4, :3] = TOP
    return out

def _lowfreq(h, w, rng, cells=5):
    g = rng.random((cells + 3, int(cells * w / h) + 3)).astype(np.float32)
    ys = np.linspace(1, g.shape[0] - 2.001, h); xs = np.linspace(1, g.shape[1] - 2.001, w)
    iy, ix = ys.astype(int), xs.astype(int); fy, fx = (ys - iy)[:, None], (xs - ix)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a, b, c, d = g[iy][:, ix], g[iy][:, ix + 1], g[iy + 1][:, ix], g[iy + 1][:, ix + 1]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy

def field_slabs(h, w, rng, unit, cover=.5, op=(.35, .65), size=1.0, avoid=None):
    """铺满 (h, w) 画面的云板：沿斜向成带、带里一串长短不一的板；低频噪声决定哪里有云、哪里是云缝（cover 越大云越多）。
    unit：1 世界单位多少像素；avoid(x, y) → 0..1 的压低系数（伊甸周围、岛心不堆云）。"""
    dens = _lowfreq(h, w, rng, 4)
    c, s = math.cos(ANGLE), math.sin(ANGLE); diag = math.hypot(w, h)
    out = []; step = 1.5 * unit * size                                          # 带间距（垂直于长轴）
    for vv in np.arange(-diag / 2, diag / 2, step):
        uu = -diag / 2 + rng.uniform(0, 2 * unit)
        while uu < diag / 2:
            Wd = rng.uniform(1.1, 2.0) * unit * size; L = Wd * rng.uniform(1.6, 2.6)   # 短厚的圆角板（长宽比 ≈ 2–3）
            cx = w / 2 + (uu + L / 2) * c + vv * s + rng.uniform(-.2, .2) * unit
            cy = h / 2 - (uu + L / 2) * s + vv * c + rng.uniform(-.25, .25) * unit
            uu += L * rng.uniform(.95, 1.35)
            if not (-L < cx < w + L and -L < cy < h + L): continue
            d = dens[int(np.clip(cy, 0, h - 1)), int(np.clip(cx, 0, w - 1))]
            if avoid is not None: d *= avoid(cx, cy)
            if d < 1 - cover: continue
            k = (d - (1 - cover)) / max(cover, 1e-3)
            out.append((cx, cy, L, Wd, float(np.clip(op[0] + (op[1] - op[0]) * k * rng.uniform(.7, 1.2), 0, 1))))
    return out

def write_png(path, rgba):
    """最小 PNG 写入（RGBA 8 位），不依赖 PIL。"""
    import zlib, struct
    h, w = rgba.shape[:2]; px = (np.clip(rgba, 0, 1) * 255 + .5).astype(np.uint8)
    raw = b''.join(b'\x00' + px[y].tobytes() for y in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw, 6)) + ch(b'IEND', b''))
