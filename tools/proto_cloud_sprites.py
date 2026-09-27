# 《部落冲突》式云精灵（原型 map/_proto/clouds.html 用）：每张 = 2–6 块沿等轴测斜向叠起的圆角云板，模糊、半透明，四周淡出到 0。
# 用法（Blender 自带的 Python，有 numpy；不需要 PIL）：
#   /Applications/Blender.app/Contents/Resources/<版本>/python/bin/python3.x tools/proto_cloud_sprites.py [输出目录，默认 map/_proto/clouds]
# 云板的形状与明暗和 Blender 静态版共用 blender/cloud_veil.py。
import os, sys, math, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'blender'))
import cloud_veil as cv

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'map', '_proto', 'clouds')
os.makedirs(OUT, exist_ok=True)
W, H = 800, 440                                   # 精灵尺寸（2:1 左右，斜向拉长的一串）；页面里按 CSS 缩放
SPEC = [   # (云板个数, 基本板宽 px, 不透明度范围, 种子)
    (3, 96, (.75, .95), 11), (5, 74, (.6, .9), 12), (4, 90, (.7, .95), 13),
    (2, 112, (.8, 1.0), 14), (5, 70, (.55, .85), 15), (4, 84, (.65, .9), 16),
]
c, s = math.cos(cv.ANGLE), math.sin(cv.ANGLE)
for n, (k, wd, op, seed) in enumerate(SPEC):
    rng = np.random.default_rng(seed); sl = []
    for j in range(k):                             # 沿长轴排开、垂直方向错一点，前后交叠
        Wd = wd * rng.uniform(.8, 1.2); L = Wd * rng.uniform(1.8, 2.7)
        t = (j - (k - 1) / 2) * wd * rng.uniform(.9, 1.25); o = rng.uniform(-.55, .55) * wd
        sl.append((W / 2 + t * c + o * s, H / 2 - t * s + o * c, L, Wd, float(rng.uniform(*op))))
    rgba = cv.paint(H, W, sl, depth=.3, soft=3, blur=(8, 5))
    yy, xx = np.mgrid[0:H, 0:W]                   # 四周 12 % 淡出，缩放后也不会露出方边
    e = np.minimum(np.minimum(xx, W - 1 - xx) / (W * .12), np.minimum(yy, H - 1 - yy) / (H * .12))
    rgba[..., 3] *= np.clip(e, 0, 1) ** 1.5
    p = os.path.join(OUT, f'puff{n + 1}.png'); cv.write_png(p, rgba); print('WROTE', p, os.path.getsize(p))
