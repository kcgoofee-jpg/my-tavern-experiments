"""五席封地场景（fief1..fief5 共用）——只做外观。
每个 blender/landmarks/fiefN/build.py 只挑一套预设（PRESETS[fiefN]）后调 run(fief_id, A)。改本文件会影响五个封地，改动请留在对应预设 / 函数里。

场景：一座城堡 + 骑士团驻地 + 领地城镇 + 领地农田，落在各自的地貌上（湖山 / 海岸 / 河谷 / 林地 / 平原）。
中立性：无人物、无动物、无文字 / 标志、无武器类细节；旗帜只有素色三角旗，无纹章。

导出组（= 清单「看板条目」的组名）：
  site_terrain   地形（草地 / 滩沙 / 崖石三种材质的高度场网格）
  props_water    湖 / 海 / 河的水面（无水的封地为空组）
  props_castle   城堡：围墙 + 角塔 + 门楼 + 主塔楼 + 大厅
  props_order    骑士团驻地：院墙 + 营房 + 马厩（不画马）+ 校场 + 瞭望塔
  props_village  领地城镇：房屋 + 钟塔大厅 + 井 + 集市摊棚
  props_fields   领地农田：随地形铺的作物垄 + 草垛 + 谷仓
  props_roads    道路（沿地形铺的土路）
  props_trees    树木 + 篱林
  props_extra    各封地专属：湖码头 / 海港栈桥与船 / 河上石桥 / 林中猎屋 / 比武场
bg_*：远处大地与水面（不导出）。
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C  # noqa

X0, X1, Y0, Y1 = -330.0, 330.0, -260.0, 260.0   # 地形范围（米）
WL = -0.4                                        # 水面高度


def sm(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def hills(x, y, amp):
    return amp * (0.55 * math.sin(x / 61 + 1.3) * math.cos(y / 47) + 0.3 * math.sin(x / 27 + y / 33 + 2) + 0.15 * math.sin(x / 13 - y / 17))


def river_x(y):
    return 40 + 22 * math.sin(y / 75 + 0.5)


# 预设：kind 地貌；castle / order / village 中心 (x, y)；roof 房顶色；stone 石色；trees 树数；fields 农田块数
PRESETS = {
    'fief1': dict(kind='lake', amp=9, base=5, seed=11, castle=(-60, 80, 12), order=(-190, -50), village=(70, -10), trees=190, conifer=0.3,
                  fields=12, stone=(0.62, 0.6, 0.56), roof=(0.2, 0.3, 0.46), houses=((0.55, 0.24, 0.16), (0.4, 0.34, 0.24), (0.3, 0.32, 0.36)),
                  leaf=((0.08, 0.2, 0.07), (0.12, 0.26, 0.08), (0.2, 0.3, 0.1)), grass=(0.5, 0.62, 0.26), extra='dock'),
    'fief2': dict(kind='coast', amp=6, base=7, seed=22, castle=(120, -55, 14), order=(-190, 40), village=(-20, -98), trees=70, conifer=0.1,
                  fields=10, stone=(0.72, 0.68, 0.6), roof=(0.5, 0.22, 0.14), houses=((0.75, 0.7, 0.6), (0.6, 0.52, 0.4), (0.5, 0.28, 0.2)),
                  leaf=((0.12, 0.2, 0.08), (0.2, 0.26, 0.1), (0.26, 0.3, 0.12)), grass=(0.6, 0.62, 0.3), extra='harbour'),
    'fief3': dict(kind='valley', amp=8, base=6, seed=33, castle=(-120, 60, 20), order=(-175, -80), village=(150, -35), trees=210, conifer=0.15,
                  fields=13, stone=(0.55, 0.52, 0.48), roof=(0.36, 0.2, 0.16), houses=((0.6, 0.56, 0.48), (0.5, 0.3, 0.2), (0.42, 0.4, 0.38)),
                  leaf=((0.06, 0.18, 0.06), (0.1, 0.24, 0.07), (0.16, 0.28, 0.09)), grass=(0.48, 0.6, 0.24), extra='bridge'),
    'fief4': dict(kind='forest', amp=10, base=6, seed=44, castle=(0, 65, 18), order=(-150, -45), village=(115, -30), trees=430, conifer=0.55,
                  fields=4, stone=(0.4, 0.38, 0.36), roof=(0.22, 0.2, 0.18), houses=((0.36, 0.28, 0.2), (0.3, 0.24, 0.18), (0.4, 0.32, 0.22)),
                  leaf=((0.04, 0.13, 0.05), (0.07, 0.17, 0.06), (0.1, 0.2, 0.06)), grass=(0.36, 0.5, 0.2), extra='lodge'),
    'fief5': dict(kind='plain', amp=3, base=4, seed=55, castle=(0, 95, 6), order=(-185, -30), village=(115, -45), trees=60, conifer=0.05,
                  fields=24, stone=(0.78, 0.74, 0.66), roof=(0.5, 0.36, 0.2), houses=((0.8, 0.76, 0.66), (0.58, 0.3, 0.2), (0.7, 0.62, 0.42)),
                  leaf=((0.1, 0.22, 0.07), (0.16, 0.28, 0.08), (0.24, 0.32, 0.1)), grass=(0.6, 0.66, 0.28), extra='lists'),
}


class Land:
    def __init__(s, P):
        s.P = P; s.sites = []; s.roads = []; s.plots = []
        s.sites_fixed = False

    def raw(s, x, y):
        P = s.P; k = P['kind']; b = max(hills(x, y, P['amp']) + P['base'], 3.6)
        if k == 'lake':
            d = ((x - 215) / 120) ** 2 + ((y + 150) / 80) ** 2
            w = sm(1.5, 0.8, d); b = b * (1 - w) - 9 * w
        elif k == 'coast':
            shore = -168 + 14 * math.sin(x / 45) + 7 * math.sin(x / 17 + 1)
            w = sm(shore + 22, shore - 8, y); b = b * (1 - w) - 9 * w
        elif k == 'valley':
            dist = abs(x - river_x(y)); b += 0.0007 * min(dist, 130) ** 2
            w = sm(30, 7, dist); b = b * (1 - w) - 8 * w
        return b

    def h(s, x, y):
        v = s.raw(x, y)
        for (cx, cy, ri, ro, hs) in s.sites:
            d = math.hypot(x - cx, y - cy)
            if d < ro:
                w = sm(ro, ri, d); v = v * (1 - w) + hs * w
        return v

    def add_site(s, cx, cy, ri, ro, lift=0.0):
        hs = max(s.raw(cx, cy), 2.6) + lift
        s.sites.append((cx, cy, ri, ro, hs)); return hs

    def near_site(s, x, y, pad=0.0):
        return any(math.hypot(x - cx, y - cy) < ro + pad for (cx, cy, ri, ro, hs) in s.sites)

    def near_road(s, x, y, d=7.0):
        for pl in s.roads:
            for a, b in zip(pl, pl[1:]):
                vx, vy = b[0] - a[0], b[1] - a[1]; L2 = vx * vx + vy * vy or 1.0
                t = max(0.0, min(1.0, ((x - a[0]) * vx + (y - a[1]) * vy) / L2))
                if math.hypot(x - a[0] - t * vx, y - a[1] - t * vy) < d: return True
        return False

    def land(s, x, y, m=1.6):
        return s.h(x, y) > WL + m

    def slope(s, x, y):
        e = 3.0
        return math.hypot(s.h(x + e, y) - s.h(x - e, y), s.h(x, y + e) - s.h(x, y - e)) / (2 * e)


def M_(P):
    """材质表（每次调用新建，名字带前缀防冲突）。"""
    st, ro = P['stone'], P['roof']
    M = {}
    M['grass'] = C.pbr('fs_grass', 'grass_ground', 5.0, tint=P['grass'], sat=0.9, value=0.75)
    M['sand'] = C.pbr('fs_sand', 'dirt_floor', 5.0, tint=(0.8, 0.7, 0.5), sat=0.5, value=1.0)
    M['rock'] = C.pbr('fs_rock', 'concrete_wall_008', 8.0, tint=(0.4, 0.37, 0.33), sat=0.3, value=0.85, weather=0.6)
    M['stone'] = C.pbr('fs_stone', 'white_sandstone_blocks_02', 3.0, tint=st, sat=0.25, value=1.0, weather=0.6)
    M['stoned'] = C.pbr('fs_stoned', 'concrete_wall_008', 3.0, tint=(st[0] * 0.7, st[1] * 0.7, st[2] * 0.7), sat=0.25, value=0.9, weather=0.7)
    M['roof'] = C.pbr('fs_roof', 'roof_slates_02', 2.6, tint=ro, sat=0.6, value=1.0)
    M['stucco'] = C.pbr('fs_stucco', 'white_stucco', 2.6, tint=(0.85, 0.8, 0.7), sat=0.4, value=1.0, weather=0.5)
    M['timber'] = C.pbr('fs_timber', 'dark_wood', 2.0, tint=(0.34, 0.26, 0.18), sat=0.3, value=0.9)
    M['wood'] = C.pbr('fs_wood', 'rough_wood', 2.2, tint=(0.5, 0.4, 0.28), sat=0.4, value=0.85)
    M['road'] = C.pbr('fs_road', 'dirt_floor', 4.0, tint=(0.6, 0.5, 0.36), sat=0.4, value=1.0)
    M['yard'] = C.pbr('fs_yard', 'dirt_floor', 4.0, tint=(0.72, 0.6, 0.42), sat=0.4, value=1.05)
    M['win'] = C.flat('fs_win', (0.05, 0.05, 0.06), 0.4)
    M['gold'] = C.flat('fs_gold', (0.8, 0.6, 0.22), 0.3, metal=0.9)
    M['water'] = C.flat('fs_water', (0.05, 0.16, 0.2), 0.06, coat=0.8)
    M['bark'] = C.flat('fs_bark', (0.16, 0.12, 0.09), 0.9, noise=0.3)
    M['hay'] = C.flat('fs_hay', (0.68, 0.55, 0.22), 0.9, noise=0.6)
    M['flag_a'] = C.flat('fs_flag_a', (0.6, 0.16, 0.12), 0.8, noise=0.3)
    M['flag_b'] = C.flat('fs_flag_b', (0.14, 0.24, 0.5), 0.8, noise=0.3)
    M['canvas'] = C.flat('fs_canvas', (0.86, 0.82, 0.7), 0.85, noise=0.3)
    M['hull'] = C.flat('fs_hull', (0.22, 0.16, 0.12), 0.6, noise=0.3)
    M['sail'] = C.flat('fs_sail', (0.9, 0.88, 0.8), 0.8, noise=0.2)
    M['leaf'] = [C.flat('fs_leaf%d' % i, (c[0] * 0.55, c[1] * 0.6, c[2] * 0.5), 0.9, noise=0.7) for i, c in enumerate(P['leaf'] + ((0.2, 0.2, 0.05),))]
    M['conif'] = C.flat('fs_conif', (0.02, 0.07, 0.04), 0.9, noise=0.6)
    M['crop'] = [C.flat('fs_crop%d' % i, c, 0.9, noise=0.5) for i, c in enumerate(
        ((0.3, 0.5, 0.14), (0.62, 0.5, 0.16), (0.24, 0.42, 0.12), (0.4, 0.28, 0.14), (0.7, 0.6, 0.24), (0.34, 0.56, 0.2)))]
    return M


# ------------------------------------------------------------------ 地形
def terrain(L, M):
    B_g = C.Batch.get('site_terrain')
    xs = [X0 + i * 8.0 for i in range(int((X1 - X0) / 8) + 1)]; ys = [Y0 + j * 8.0 for j in range(int((Y1 - Y0) / 8) + 1)]
    rows = [[(x, y, L.h(x, y)) for x in xs] for y in ys]

    def kind(i, j, q):
        z = sum(v.co.z for v in q) / 4; cx = (q[0].co.x + q[2].co.x) / 2; cy = (q[0].co.y + q[2].co.y) / 2
        if z < WL + 2.3 or min(v.co.z for v in q) < WL + 0.4: return 'sand'
        if L.slope(cx, cy) > 0.85: return 'rock'
        return 'grass'
    for name in ('grass', 'sand', 'rock'):
        C.grid(B_g, rows, M[name], keep=lambda i, j, q, n=name: kind(i, j, q) == n)
    return rows


def water(L, M):
    W = C.Batch.get('props_water')
    if L.P['kind'] in ('lake', 'coast', 'valley'):
        W.box(X0 + 1.0, X1 - 1.0, Y0 + 1.0, Y1 - 1.0, -3.0, WL, M['water'])


def draped(B, L, x0, y0, x1, y1, m, lift=0.3, nx=2, ny=7):
    rows = [[(x0 + (x1 - x0) * i / (nx - 1), y0 + (y1 - y0) * j / (ny - 1), L.h(x0 + (x1 - x0) * i / (nx - 1), y0 + (y1 - y0) * j / (ny - 1)) + lift)
             for i in range(nx)] for j in range(ny)]
    C.grid(B, rows, m, smooth=False)


# ------------------------------------------------------------------ 城堡
def castle(L, M, cx, cy, z, tall=1.0):
    B = C.Batch.get('props_castle'); P = L.P
    hw, hd, wh, th = 34.0, 27.0, 9.0, 3.2
    zb = z - 6.0
    S, SD, R = M['stone'], M['stoned'], M['roof']
    for (x0, x1, y0, y1) in ((cx - hw, cx + hw, cy + hd - th, cy + hd), (cx - hw, cx - 6, cy - hd, cy - hd + th), (cx + 6, cx + hw, cy - hd, cy - hd + th),
                             (cx - hw, cx - hw + th, cy - hd, cy + hd), (cx + hw - th, cx + hw, cy - hd, cy + hd)):
        B.box(x0, x1, y0, y1, zb, z + wh, S)
        n = int(max(x1 - x0, y1 - y0) / 3.4)
        for k in range(n):
            if x1 - x0 > y1 - y0:
                B.boxc(x0 + 1.7 + k * 3.4, (y0 + y1) / 2, z + wh, 1.7, th * 0.55, 1.3, S)
            else:
                B.boxc((x0 + x1) / 2, y0 + 1.7 + k * 3.4, z + wh, th * 0.55, 1.7, 1.3, S)
    for (tx, ty) in ((cx - hw, cy - hd), (cx + hw, cy - hd), (cx - hw, cy + hd), (cx + hw, cy + hd)):   # 角塔
        B.cyl(tx, ty, zb, 6.6, wh + 6 + 6, S, 18)
        B.cyl(tx, ty, z + wh + 6, 7.0, 1.2, SD, 18)
        B.lathe(tx, ty, z + wh + 7.2, [(7.4, 0), (5.2, 3.2 * tall), (2.4, 7.4 * tall), (0.15, 11.5 * tall)], R, n=18)
        B.boxc(tx + 6.65, ty, z + 6, 0.2, 0.9, 1.7, M['win']); B.boxc(tx, ty - 6.65, z + 6, 0.9, 0.2, 1.7, M['win'])
    gx, gy = cx, cy - hd                                                                # 门楼
    for sx in (-1, 1):
        B.box(gx + sx * 8.5 - 3.4, gx + sx * 8.5 + 3.4, gy - 5.5, gy + 3.2, zb, z + wh + 6, S)
        B.gable(gx + sx * 8.5 - 3.4, gx + sx * 8.5 + 3.4, gy - 5.5, gy + 3.2, z + wh + 6, 3.4, R, along='y', over=0.4)
    B.box(gx - 6, gx + 6, gy - 5.5, gy + 3.2, z + 8, z + wh + 6, S)
    B.boxc(gx, gy - 5.55, z, 7.0, 0.3, 7.2, M['win'])
    B.boxc(gx, gy - 5.62, z + 7.2, 7.4, 0.5, 0.6, SD)
    kx, ky = cx + 4.0, cy + 6.0                                                           # 主塔楼
    kh = 26 * tall
    B.box(kx - 11, kx + 11, ky - 11, ky + 11, zb, z + kh, S)
    for (ax, ay) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        B.cyl(kx + ax * 11, ky + ay * 11, z, 3.4, kh + 6, S, 12)
        B.lathe(kx + ax * 11, ky + ay * 11, z + kh + 6, [(3.9, 0), (2.4, 2.2), (0.12, 7.0)], R, n=12)
    B.pyramid(kx, ky, z + kh, 23.0, 23.0, 11 * tall, R)
    for k in range(3):
        for sx in (-1, 1):
            B.boxc(kx + sx * 11.02, ky - 5 + k * 5, z + 8 + (k % 2) * 6, 0.12, 1.2, 2.4, M['win'])
            B.boxc(kx - 5 + k * 5, ky - 11.02, z + 8 + (k % 2) * 6, 1.2, 0.12, 2.4, M['win'])
    B.cyl(kx, ky, z + kh + 11 * tall, 0.18, 6.0, M['timber'], 6)
    B.poly([(kx, ky, z + kh + 11 * tall + 6), (kx, ky, z + kh + 11 * tall + 3.6), (kx + 4.0, ky, z + kh + 11 * tall + 4.8)], [(0, 1, 2), (2, 1, 0)], M['flag_a'])
    hx0, hx1, hy0, hy1 = cx - hw + th + 1, cx - 12, cy + 4, cy + hd - th - 1                # 内院大厅
    B.box(hx0, hx1, hy0, hy1, zb, z + 8, M['stucco'])
    B.gable(hx0, hx1, hy0, hy1, z + 8, 5.2, R, along='x', over=0.6)
    for k in range(5): B.boxc(hx0 + 3 + k * 4.2, hy0 - 0.02, z + 2.2, 1.1, 0.12, 2.4, M['win'])
    B.box(cx - hw + th, cx + hw - th, cy - hd + th, cy + hd - th, z - 0.6, z + 0.02, M['yard'])


# ------------------------------------------------------------------ 骑士团驻地
def order(L, M, cx, cy, z, rnd):
    B = C.Batch.get('props_order'); S = M['stone']; R = M['roof']
    hw, hd = 40.0, 28.0; zb = z - 3.0
    for (x0, x1, y0, y1) in ((cx - hw, cx + hw, cy + hd - 1.6, cy + hd), (cx - hw, cx - 5, cy - hd, cy - hd + 1.6), (cx + 5, cx + hw, cy - hd, cy - hd + 1.6),
                             (cx - hw, cx - hw + 1.6, cy - hd, cy + hd), (cx + hw - 1.6, cx + hw, cy - hd, cy + hd)):
        B.box(x0, x1, y0, y1, zb, z + 3.6, S)
    B.box(cx - 5, cx + 5, cy - hd - 2, cy - hd + 3, zb, z + 8.5, S)                        # 门楼
    B.box(cx - 2.4, cx + 2.4, cy - hd - 2.05, cy - hd - 1.9, z, z + 5.0, M['win'])
    B.gable(cx - 5, cx + 5, cy - hd - 2, cy - hd + 3, z + 8.5, 3.0, R, along='y', over=0.4)
    B.box(cx - hw + 2, cx + hw - 2, cy - hd + 2, cy + hd - 2, z - 0.5, z + 0.04, M['yard'])
    for k, yy in enumerate((cy + 15.0, cy + 2.0)):                                        # 营房
        B.box(cx - 34, cx - 2, yy - 4.8, yy + 4.8, zb, z + 5.4, M['stucco'])
        B.gable(cx - 34, cx - 2, yy - 4.8, yy + 4.8, z + 5.4, 3.2, R, along='x', over=0.6)
        for i in range(8): B.boxc(cx - 31 + i * 4.0, yy - 4.85, z + 1.6, 1.0, 0.1, 1.8, M['win'])
    B.box(cx + 4, cx + 36, cy + 6, cy + 17, zb, z + 4.6, M['timber'])                    # 马厩（不画马）
    B.gable(cx + 4, cx + 36, cy + 6, cy + 17, z + 4.6, 3.0, M['roof'], along='x', over=0.6)
    for i in range(8): B.boxc(cx + 7 + i * 3.6, cy + 5.94, z, 1.5, 0.12, 2.6, M['wood'])
    B.box(cx + 22, cx + 30, cy - 20, cy - 12, zb, z + 20, S)                             # 瞭望塔
    B.pyramid(cx + 26, cy - 16, z + 20, 9.6, 9.6, 6.0, R)
    B.cyl(cx + 26, cy - 16, z + 26, 0.14, 5.0, M['timber'], 6)
    B.poly([(cx + 26, cy - 16, z + 31), (cx + 26, cy - 16, z + 28.8), (cx + 29.4, cy - 16, z + 29.9)], [(0, 1, 2), (2, 1, 0)], M['flag_b'])
    for k in range(6):                                                                    # 校场围栏（立柱 + 横杆）
        B.cyl(cx - 26 + k * 3.0, cy - 12, z, 0.1, 1.2, M['timber'], 6)
    B.tube([(cx - 26, cy - 12, 1.0 + z), (cx - 11, cy - 12, 1.0 + z)], 0.05, M['timber'], 5)


# ------------------------------------------------------------------ 领地城镇
def village(L, M, cx, cy, z, rnd):
    B = C.Batch.get('props_village'); P = L.P
    roofs = [C.flat('fs_vroof%d' % i, c, 0.85, noise=0.4) for i, c in enumerate(P['houses'])]
    walls = (M['stucco'], M['timber'], M['stone'], M['stucco'])
    for gx in range(-4, 5):
        for gy in (-2, -1, 1, 2):
            if abs(gx) <= 1 and abs(gy) == 1: continue
            if rnd.random() < 0.18: continue
            x = cx + gx * 17 + rnd.uniform(-1.5, 1.5); y = cy + gy * 15 + rnd.uniform(-1.2, 1.2)
            w, d, h = rnd.uniform(8, 12), rnd.uniform(7, 9.5), rnd.uniform(4.2, 5.6)
            B.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, z - 2.0, z + h, walls[rnd.randrange(4)])
            B.gable(x - w / 2, x + w / 2, y - d / 2, y + d / 2, z + h, 3.0, roofs[rnd.randrange(3)], along='x' if rnd.random() < 0.5 else 'y', over=0.5)
            B.boxc(x + rnd.uniform(-w / 4, w / 4), y, z + h + 1.0, 0.9, 0.9, 3.0, M['stoned'])
            B.boxc(x, y - d / 2 - 0.03, z + 0.2, 1.3, 0.1, 2.3, M['win'])
    B.box(cx - 17, cx + 17, cy - 8, cy + 8, z - 2.0, z + 8.5, M['stone'])                # 钟塔大厅（无标志）
    B.gable(cx - 17, cx + 17, cy - 8, cy + 8, z + 8.5, 5.0, M['roof'], along='x', over=0.7)
    B.box(cx + 11, cx + 17, cy - 3, cy + 3, z - 2.0, z + 21, M['stone'])
    B.pyramid(cx + 14, cy, z + 21, 6.8, 6.8, 7.5, M['roof'])
    for k in range(5): B.boxc(cx - 13 + k * 6, cy - 8.03, z + 2.2, 1.3, 0.1, 3.0, M['win'])
    wx, wy = cx - 28.0, cy + 0.0                                                          # 井
    B.cyl(wx, wy, z, 1.4, 1.0, M['stone'], 12); B.cyl(wx, wy, z + 1.0, 1.1, 0.1, M['water'], 12)
    for sx in (-1, 1): B.cyl(wx + sx * 1.2, wy, z, 0.1, 2.6, M['timber'], 6)
    B.gable(wx - 1.6, wx + 1.6, wy - 1.2, wy + 1.2, z + 2.6, 0.9, M['roof'], along='x')
    for k in range(4):                                                                    # 集市摊棚
        sx = cx - 8 + k * 6.2
        B.boxc(sx, cy - 20.0, z, 4.0, 3.0, 0.9, M['wood'])
        B.gable(sx - 2.3, sx + 2.3, cy - 21.7, cy - 18.3, z + 2.0, 0.8, M['canvas'] if k % 2 else M['flag_a'], along='x')
        for ex in (-1, 1): B.cyl(sx + ex * 2.0, cy - 21.4, z, 0.06, 2.0, M['timber'], 4); B.cyl(sx + ex * 2.0, cy - 18.6, z, 0.06, 2.0, M['timber'], 4)


# ------------------------------------------------------------------ 农田
def fields(L, M, rnd, n):
    B = C.Batch.get('props_fields'); placed = 0; tries = 0
    while placed < n and tries < 900:
        tries += 1
        w, d = rnd.uniform(34, 56), rnd.uniform(24, 40)
        x, y = rnd.uniform(X0 + 40, X1 - 40), rnd.uniform(Y0 + 40, Y1 - 40)
        pts = [(x + a * w / 2, y + b * d / 2) for a in (-1, 0, 1) for b in (-1, 0, 1)]
        if any((not L.land(px, py, 2.2)) or L.near_site(px, py, 6) or L.near_road(px, py, 8) for px, py in pts): continue
        hs = [L.h(px, py) for px, py in pts]
        if max(hs) - min(hs) > 3.4: continue
        if any(abs(x - q[0]) < (w + q[2]) / 2 + 4 and abs(y - q[1]) < (d + q[3]) / 2 + 4 for q in L.plots): continue
        L.plots.append((x, y, w, d)); placed += 1
        kind = rnd.random()
        ns = int(w / 3.0)
        for i in range(ns):
            xa = x - w / 2 + i * w / ns
            m = M['crop'][(i % 2) if kind < 0.7 else 3 + (i % 2)] if kind < 0.9 else M['crop'][5]
            draped(B, L, xa, y - d / 2, xa + w / ns - 0.35, y + d / 2, m)
        if rnd.random() < 0.35:
            hx, hy = x + w / 2 + 4, y - d / 2 + 4
            for k in range(3):
                B.cyl(hx + k * 3.6, hy, L.h(hx, hy), 1.3, 2.6, M['hay'], 8, r2=1.0)
                B.lathe(hx + k * 3.6, hy, L.h(hx, hy) + 2.6, [(1.4, 0), (0.6, 1.0), (0.05, 1.7)], M['hay'], n=8)


# ------------------------------------------------------------------ 道路 / 树
def road(L, M, pts):
    B = C.Batch.get('props_roads'); L.roads.append(pts)
    dense = []
    for a, b in zip(pts, pts[1:]):
        n = max(2, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 10))
        for i in range(n): dense.append((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n))
    dense.append(pts[-1])
    B.strip([(x, y, L.h(x, y) + 0.2) for x, y in dense], 5.0, 0.2, M['road'])


def trees(L, M, rnd, n):
    B = C.Batch.get('props_trees'); P = L.P; got = 0; tries = 0
    while got < n and tries < n * 12:
        tries += 1
        x, y = rnd.uniform(X0 + 10, X1 - 10), rnd.uniform(Y0 + 10, Y1 - 10)
        if not L.land(x, y, 2.4) or L.near_site(x, y, 4) or L.near_road(x, y, 6) or L.slope(x, y) > 0.7: continue
        if any(abs(x - q[0]) < q[2] / 2 + 3 and abs(y - q[1]) < q[3] / 2 + 3 for q in L.plots): continue
        z = L.h(x, y); got += 1
        h = rnd.uniform(8, 15)
        if rnd.random() < P['conifer']:
            B.cyl(x, y, z - 0.3, 0.35, 1.6, M['bark'], 5)
            B.lathe(x, y, z + 1.0, [(3.0, 0), (2.2, h * 0.3), (1.3, h * 0.58), (0.05, h * 0.9)], M['conif'], n=8)
        else:
            B.cyl(x, y, z - 0.3, 0.5, h * 0.55, M['bark'], 6, r2=0.3)
            for j in range(3):
                B.sphere(x + rnd.uniform(-1.6, 1.6), y + rnd.uniform(-1.6, 1.6), z + h * 0.68 + rnd.uniform(-0.8, 1.6), rnd.uniform(2.2, 3.4),
                         M['leaf'][(got + j * 2) % 4], seg=7, rings=5, sz=0.85)


# ------------------------------------------------------------------ 各封地专属
def extras(L, M, rnd, cast_z):
    B = C.Batch.get('props_extra'); P = L.P; e = P['extra']; vx, vy = P['village']
    if e == 'dock':                                                                        # 湖码头：沿城镇→湖心方向走到岸边
        dx, dy = 215 - vx, -150 - vy; dl = math.hypot(dx, dy); dx, dy = dx / dl, dy / dl
        t = 40.0
        while L.land(vx + dx * t, vy + dy * t, 1.0) and t < 300: t += 3.0
        ex, ey = vx + dx * t, vy + dy * t
        B.strip([(ex - dx * 8, ey - dy * 8, 0.6), (ex + dx * 30, ey + dy * 30, 0.6)], 3.6, 0.3, M['wood'])
        for k in range(8): B.cyl(ex + dx * (k * 4.0 - 4) + dy * 1.9, ey + dy * (k * 4.0 - 4) - dx * 1.9, -2.2, 0.16, 3.0, M['timber'], 6)
        B.sphere(ex + dx * 22 + dy * 7, ey + dy * 22 - dx * 7, -0.1, 3.0, M['hull'], sz=0.3, seg=10, rings=6, sx=2.2, zmin=-0.2)
    elif e == 'harbour':                                                                   # 栈桥 + 两条船
        px, py = vx + 20, vy - 8
        while L.land(px, py, 0.5) and py > -200: py -= 3.0
        B.strip([(px, py + 40, 0.9), (px + 2, py - 8, 0.9), (px + 4, py - 30, 0.9)], 4.6, 0.4, M['wood'])
        for k in range(10): B.cyl(px + 2.4 + (k % 2) * 4.2 - 2.0, py + 30 - k * 6.0, -3.0, 0.22, 4.4, M['timber'], 6)
        for k, (bx, by) in enumerate(((px + 12, py - 16), (px - 10, py - 30))):
            B.sphere(bx, by, -0.1, 4.4, M['hull'], sz=0.32, seg=12, rings=6, sx=2.4, zmin=-0.4)
            B.cyl(bx, by, 0.0, 0.14, 9.0, M['timber'], 6)
            B.poly([(bx, by + 0.05, 8.4), (bx, by + 0.05, 2.2), (bx + 4.2, by + 0.05, 2.4)], [(0, 1, 2), (2, 1, 0)], M['sail'])
        lx, ly = P['castle'][0] + 24, P['castle'][1] - 34
        B.cyl(lx, ly, L.h(lx, ly) - 1.0, 2.8, 16, M['stone'], 12, r2=2.1)                    # 灯塔
        B.cyl(lx, ly, L.h(lx, ly) + 15, 3.0, 0.5, M['stoned'], 12)
        B.lathe(lx, ly, L.h(lx, ly) + 15.5, [(2.6, 0), (2.6, 2.2), (0.2, 4.0)], M['roof'], n=12)
    elif e == 'bridge':                                                                    # 河上石桥
        by = vy + 12; bx0, bx1 = river_x(by) - 40, river_x(by) + 40
        zt = 2.0
        B.box(bx0, bx1, by - 2.6, by + 2.6, zt - 0.6, zt, M['stone'])
        for sy in (-2.6, 2.6): B.box(bx0, bx1, by + sy - 0.3, by + sy + 0.3, zt, zt + 1.0, M['stone'])
        for k in range(3):
            px = river_x(by) - 14 + k * 14
            B.box(px - 1.4, px + 1.4, by - 2.4, by + 2.4, -6.0, zt - 0.6, M['stoned'])
        L.roads.append([(bx0 - 20, by), (bx1 + 20, by)])
    elif e == 'lodge':                                                                     # 林中猎屋
        lx, ly = -60.0, -100.0
        z = L.h(lx, ly)
        B.box(lx - 7, lx + 7, ly - 5, ly + 5, z - 1.5, z + 4.2, M['timber'])
        B.gable(lx - 7, lx + 7, ly - 5, ly + 5, z + 4.2, 3.2, M['roof'], along='x', over=0.7)
        B.boxc(lx, ly - 5.03, z + 0.2, 1.3, 0.1, 2.4, M['win'])
        B.cyl(lx + 3.5, ly + 1.0, z + 6.0, 0.35, 3.2, M['stoned'], 8)
    elif e == 'lists':                                                                     # 比武场
        lx, ly = -55.0, -95.0; z = L.h(lx, ly)
        B.box(lx - 40, lx + 40, ly - 14, ly + 14, z - 0.4, z + 0.06, M['yard'])
        for sy in (-14, 14):
            for k in range(0, 40):
                B.cyl(lx - 40 + k * 2.0 + 1.0, ly + sy, z, 0.07, 1.1, M['timber'], 4)
            B.tube([(lx - 40, ly + sy, z + 1.0), (lx + 40, ly + sy, z + 1.0)], 0.05, M['timber'], 4)
        B.tube([(lx - 40, ly, z + 0.55), (lx + 40, ly, z + 0.55)], 0.05, M['timber'], 4)
        for k in range(4):                                                                  # 看台
            B.box(lx - 22, lx + 22, ly + 16 + k * 2.0, ly + 18 + k * 2.0, z - 0.5, z + 0.8 + k * 0.7, M['wood'])
        B.gable(lx - 24, lx + 24, ly + 15, ly + 28, z + 6.2, 2.4, M['canvas'], along='x', over=0.5)
        for px in (-24, -8, 8, 24):
            for py in (15.0, 27.0): B.cyl(lx + px, ly + py, z, 0.14, 6.4, M['timber'], 6)
        for sx, m in ((-1, M['flag_a']), (1, M['flag_b'])):
            B.cyl(lx + sx * 44, ly, z, 0.12, 6.6, M['timber'], 6)
            B.poly([(lx + sx * 44, ly, z + 6.4), (lx + sx * 44, ly, z + 4.4), (lx + sx * 44 - sx * 3.2, ly, z + 5.4)], [(0, 1, 2), (2, 1, 0)], m)
    return B


CAMS = {   # 各封地的相机：(位置, 目标, 焦距)；c1 俯瞰，c2 从城镇看城堡，under 看骑士团驻地
    'fief1': dict(c1=((330, -330, 210), (-20, 10, 8), 30), c2=((70, 120, 36), (-56, 88, 28), 30), under=((-120, -150, 40), (-190, -50, 8), 30)),
    'fief2': dict(c1=((330, -300, 220), (10, -20, 6), 30), c2=((80, -110, 18), (120, -55, 14), 30), under=((-120, -20, 36), (-190, 40, 10), 30)),
    'fief3': dict(c1=((330, -330, 220), (-10, 0, 10), 30), c2=((-60, -20, 26), (-120, 60, 34), 28), under=((-110, -160, 40), (-175, -80, 12), 30)),
    'fief4': dict(c1=((330, -330, 210), (0, 10, 10), 30), c2=((10, -10, 26), (0, 65, 26), 28), under=((-90, -130, 34), (-150, -45, 12), 30)),
    'fief5': dict(c1=((330, -330, 190), (0, 10, 6), 30), c2=((0, 20, 18), (0, 95, 16), 30), under=((-110, -130, 32), (-185, -30, 8), 30)),
}


def run(fid, A, cams=None):
    try:
        _run(fid, A, cams)
    except Exception:
        msg = traceback.format_exc()
        if A['log']:
            with open(A['log'], 'w') as f: f.write(msg)
        print(msg)
        raise


def _run(fid, A, cams=None):
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    P = PRESETS[fid]; rnd = random.Random(P['seed']); L = Land(P)
    cx, cy, lift = P['castle']
    zc = L.add_site(cx, cy, 46, 92, lift)
    ox, oy = P['order']; zo = L.add_site(ox, oy, 46, 66)
    vx, vy = P['village']; zv = L.add_site(vx, vy, 62, 82)
    if P['extra'] == 'lists': L.add_site(-55, -95, 50, 70)
    if P['extra'] == 'lodge': L.add_site(-60, -100, 14, 26)
    M = M_(P)
    gate = (cx, cy - 27 - 6)
    if P['extra'] == 'bridge':                                                             # 河谷：两条过河路都走石桥
        by = vy + 12; rx = river_x(by)
        road(L, M, [gate, (rx - 45, by), (rx + 45, by), (vx, vy + 26)])
        road(L, M, [(vx - 40, vy), (rx + 45, by), (rx - 45, by), (ox + 40, oy)])
    else:
        road(L, M, [gate, ((cx + vx) / 2, (cy + vy) / 2 + 5), (vx, vy + 26)])
        road(L, M, [(vx - 40, vy), ((vx + ox) / 2, (vy + oy) / 2 - 8), (ox + 40, oy)])
    road(L, M, [(ox, oy - 28 - 6), ((ox + cx) / 2 - 10, (oy + cy) / 2 - 25), gate])
    terrain(L, M); water(L, M)
    castle(L, M, cx, cy, zc, 1.0 if fid != 'fief4' else 0.85)
    order(L, M, ox, oy, zo, rnd)
    village(L, M, vx, vy, zv, rnd)
    extras(L, M, rnd, zc)
    fields(L, M, rnd, P['fields'])
    trees(L, M, rnd, P['trees'])
    bg = C.Batch.get('bg_ground'); bg.box(-2600, 2600, -2600, 2600, -12.0, -10.0, M['grass'])
    mt = C.Batch.get('bg_hills'); MC = C.flat('fs_bg_hill', (0.2, 0.3, 0.26), 0.95, noise=0.8)
    for i in range(26):
        a = i * math.tau / 26 + rnd.uniform(-0.1, 0.1); d = rnd.uniform(1500, 2300)
        mt.lathe(math.cos(a) * d, math.sin(a) * d, -10.0, [(rnd.uniform(380, 620), 0), (rnd.uniform(260, 380), rnd.uniform(60, 110)), (rnd.uniform(120, 200), rnd.uniform(120, 200)), (0.1, rnd.uniform(170, 300))], MC, n=12)
    for o in C.Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)
    C.sky_sun(sc, 'day', sun_az=215.0, sun_el=34.0, sun_e=4.6, sky_s=0.32)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0
    pos, tgt, lens = (cams or CAMS[fid])[A['cam']]
    C.camera(sc, pos, tgt, lens)
    C.render(sc, A['out'], A['res'], 1.5, A['blend'])
