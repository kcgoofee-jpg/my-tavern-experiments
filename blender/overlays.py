# 国界叠加层：透明 PNG，裁切范围与 world_render.py 的相机一致
# 用法：Blender -b -P overlays.py -- [--w 8000] [--line 0] [--halo 1] [--out path]
# --line 0 = 帝国边界 1 px 芯线（100% 缩放下的细线，D41 §0.5 / B7），--halo 1 = 两侧各 1 px 淡暗影
import bpy, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import eden_guard
DATA = os.path.join(HERE, 'data')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {'--w': '4000', '--line': '0', '--halo': '1', '--out': os.path.join(HERE, '..', 'map', 'art', 'borders.png')}
for i in range(0, len(args) - 1, 2): opt[args[i]] = args[i + 1]
eden_guard.setup_render_device(bpy.context.scene)   # 本脚本只写 PNG 不跑 Cycles；这一行是给渲染守卫的静态检查留唯一的设备入口（同 estate2/export_web.py）
meta = json.load(open(os.path.join(DATA, 'meta.json')))
GW, GH = meta['GW'], meta['GH']
owner = np.fromfile(os.path.join(DATA, 'owner.i16'), dtype=np.int16).reshape(GH, GW)
kinds = meta['kinds']
grp = np.full(owner.shape, -1, int)
for n, k in enumerate(kinds):
    grp[owner == n] = 0 if k.startswith('oren') else 1 if k.startswith('fed') else 2 if k == 'xl' else 10 + n

# 相机裁切：宽 98.5%、高 97%（与 world_render.py 一致）
x0, x1 = .0075 * GW, .9925 * GW; y0, y1 = .015 * GH, .985 * GH
W = int(opt['--w']); H = int(W * (y1 - y0) / (x1 - x0))   # 与 world_render.py 的 resolution_y 同取整（round 会差 1 px）
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
rc = int(opt['--line']); rh = int(opt['--halo'])
emp = thicken(empire, rc)
halo = thicken(empire, max(rc, rc + rh)) & ~emp if rh > 0 else np.zeros_like(emp)
mnr = thicken(minor, rc)
# 虚线：沿对角方向分段（小国边界）。周期按芯线宽度走，--line 0 时也有 4 px 的下限
per = max(4, 8 * max(1, rc))
dash = ((np.add.outer(np.arange(H), np.arange(W)) // per) % 2) == 0
rgba = np.zeros((H, W, 4), np.float32)
rgba[halo] = (0, 0, 0, .35)
rgba[emp] = (1, .93, .78, .95)
m2 = mnr & dash & ~emp; rgba[m2] = (1, 1, 1, .55)
print('lines: empire core %d px, halo %d px, minor dash period %d px at W=%d' % (2 * rc + 1, 2 * (rc + rh) + 1, per, W))

img = bpy.data.images.new('borders', W, H, alpha=True)
img.pixels.foreach_set(np.flipud(rgba).ravel())
img.filepath_raw = os.path.abspath(opt['--out']); img.file_format = 'PNG'; img.save()
print('WROTE', img.filepath_raw, W, H)
