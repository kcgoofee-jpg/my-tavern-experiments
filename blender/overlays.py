# 国界叠加层：透明 PNG，裁切范围与 world_render.py 的相机一致
# 用法：Blender -b -P overlays.py -- [--w 4000] [--out path]
import bpy, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {'--w': '4000', '--out': os.path.join(HERE, '..', 'map', 'art', 'borders.png')}
for i in range(0, len(args) - 1, 2): opt[args[i]] = args[i + 1]
meta = json.load(open(os.path.join(DATA, 'meta.json')))
GW, GH = meta['GW'], meta['GH']
owner = np.fromfile(os.path.join(DATA, 'owner.i16'), dtype=np.int16).reshape(GH, GW)
kinds = meta['kinds']
grp = np.full(owner.shape, -1, int)
for n, k in enumerate(kinds):
    grp[owner == n] = 0 if k.startswith('oren') else 1 if k.startswith('fed') else 2 if k == 'xl' else 10 + n

# 相机裁切：宽 98.5%、高 97%（与 world_render.py 一致）
x0, x1 = .0075 * GW, .9925 * GW; y0, y1 = .015 * GH, .985 * GH
W = int(opt['--w']); H = int(round(W * (y1 - y0) / (x1 - x0)))
xs = np.clip((x0 + (np.arange(W) + .5) / W * (x1 - x0)).astype(int), 0, GW - 1)
ys = np.clip((y0 + (np.arange(H) + .5) / H * (y1 - y0)).astype(int), 0, GH - 1)
g = grp[ys][:, xs]

def edges(a, cond):
    e = np.zeros(a.shape, bool)
    for dy, dx in ((0, 1), (1, 0)):
        b = np.roll(np.roll(a, -dy, 0), -dx, 1); e |= cond(a, b)
    return e
empire = edges(g, lambda a, b: (a != b) & (a >= 0) & (b >= 0) & ((a < 10) | (b < 10)))
minor = edges(g, lambda a, b: (a != b) & (a >= 10) & (b >= 10))
def thicken(e, r):
    out = e.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy * dy + dx * dx <= r * r: out |= np.roll(np.roll(e, dy, 0), dx, 1)
    return out
r = max(1, W // 2000)
emp = thicken(empire, r + 1); halo = thicken(empire, r + 3) & ~emp
mnr = thicken(minor, r)
# 虚线：沿对角方向分段
dash = ((np.add.outer(np.arange(H), np.arange(W)) // (8 * r)) % 2) == 0
rgba = np.zeros((H, W, 4), np.float32)
rgba[halo] = (0, 0, 0, .35)
rgba[emp] = (1, .93, .78, .95)
m2 = mnr & dash & ~emp; rgba[m2] = (1, 1, 1, .55)

img = bpy.data.images.new('borders', W, H, alpha=True)
img.pixels.foreach_set(np.flipud(rgba).ravel())
img.filepath_raw = os.path.abspath(opt['--out']); img.file_format = 'PNG'; img.save()
print('WROTE', img.filepath_raw, W, H)
