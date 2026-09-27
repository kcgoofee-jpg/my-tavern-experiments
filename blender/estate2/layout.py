"""伊甸庄园 estate2 总平面（纯 numpy，不依赖 bpy）。

坐标：岛坐标，米，原点在岛顶面中心，x 向东，**正面 = −y**（停靠平台、前庭），+y 向后庭与湖。
参考板（docs/eden-references.md 已定一节）：
- 海湖庄园：主楼群多翼相连、高低错落、观景塔、半圆回廊庭院、层叠红瓦坡屋顶与烟囱、棕榈与热带植被包围、大草坪。
- 比特摩尔：从停靠平台上来的长轴大道（esplanade）+ 坡道两侧车道，尺度感。
- The Breakers：东南角崖岬上的单栋宫殿式别馆，红瓦四坡顶、面海大露台。
- Greystone：西南角坡地上的灰石都铎老宅，陡板岩山墙屋顶、高烟囱、台地英式花园。
- Nekajui：地形起伏的台地与崖岸；主楼坐高台；客房沿等高线用有顶连廊相连；林中散落别墅 / 树屋；
  崖边观景台；缆车从高台崖顶下到湖边俱乐部；吊桥跨林间沟谷。
设定（docs/eden-estate.md）：岛约 670 × 500 m，前庭喷泉、后庭人工湖、访客停靠平台（岛前缘 (0, −252)）。
"""
import math
import numpy as np

A, B = 335.0, 250.0          # 岛半轴
WATER_Z = 4.5                # 湖面标高
PLATEAU_Z = 30.0             # 主楼群台地
TERRACE_Z = 20.0             # 前庭台地


# ---------------------------------------------------------------- 岛轮廓
def _bump(th, c, w, a):
    d = np.angle(np.exp(1j * (th - c)))
    return a * np.exp(-(d / w) ** 2)


def outline_R(th):
    th = np.asarray(th, dtype=float)
    r = A * B / np.sqrt((B * np.cos(th)) ** 2 + (A * np.sin(th)) ** 2)
    f = (1 + 0.045 * np.sin(3 * th + 0.7) + 0.03 * np.sin(5 * th + 2.1)
         + 0.018 * np.sin(11 * th + 0.3) + 0.01 * np.sin(23 * th + 1.3))
    f += _bump(th, math.atan2(-150, 232), 0.20, 0.085)   # 东南崖岬（Breakers）
    f += _bump(th, -math.pi / 2, 0.07, 0.035)             # 前缘停靠平台
    f += _bump(th, math.atan2(-125, -235), 0.22, 0.05)    # 西南坡（Greystone）
    f += _bump(th, 2.45, 0.18, -0.07)                     # 西北小湾
    f += _bump(th, 0.55, 0.12, -0.04)                     # 东北崖湾
    return r * f


def edge_dist(x, y):
    """到岛缘的近似距离（米），岛内为正。"""
    th = np.arctan2(y, x)
    R = outline_R(th)
    return (1 - np.hypot(x, y) / R) * R


# ---------------------------------------------------------------- 伪噪声
def fbm(x, y, scale, octaves=3, seed=0):
    rs = np.random.RandomState(seed)
    v = np.zeros(np.broadcast(x, y).shape)
    amp, f, tot = 1.0, 1.0 / scale, 0.0
    for _ in range(octaves):
        for _ in range(5):
            a, ph = rs.uniform(0, 2 * math.pi, 2)
            v += amp * np.sin((x * math.cos(a) + y * math.sin(a)) * f * 2 * math.pi + ph)
        tot += amp * 5 * 0.5
        amp *= 0.5
        f *= 2.03
    return v / tot


def _seg_dist(x, y, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = np.clip(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(x - ax - t * dx, y - ay - t * dy)


def poly_dist(x, y, pts):
    d = np.full(np.broadcast(x, y).shape, 1e9)
    for a, b in zip(pts[:-1], pts[1:]):
        d = np.minimum(d, _seg_dist(x, y, a, b))
    return d


RAVINE = [(140, -55), (185, 5), (225, 60), (262, 118)]   # 东侧林间沟谷（吊桥跨过）


def natural_h(x, y):
    h = 5 + 21 * np.exp(-((x / 235) ** 2 + ((y - 15) / 175) ** 2))
    h += 9.0 * fbm(x, y, 150, 3, 1) + 1.6 * fbm(x, y, 30, 2, 2)
    h += 7 * np.exp(-(((x - 205) / 60) ** 2 + ((y + 20) / 90) ** 2)) + 6 * np.exp(-(((x + 190) / 70) ** 2 + ((y - 60) / 80) ** 2))
    h -= 9 * np.exp(-(poly_dist(x, y, RAVINE) / 13) ** 2)
    e = edge_dist(x, y)
    t = np.clip((28 - e) / 28, 0, 1)
    h -= t ** 2 * (5 + 5 * (0.5 + 0.5 * fbm(x, y, 60, 2, 3)))
    h -= np.clip(-e, 0, None) * 6.0
    return h


# ---------------------------------------------------------------- 台地（pad）
def _sd_ellipse(x, y, cx, cy, rx, ry, rot=0.0):
    c, s = math.cos(-rot), math.sin(-rot)
    lx, ly = (x - cx) * c - (y - cy) * s, (x - cx) * s + (y - cy) * c
    return (np.sqrt((lx / rx) ** 2 + (ly / ry) ** 2) - 1) * min(rx, ry)


def _sd_rect(x, y, cx, cy, w, d, rot=0.0, r=4.0):
    c, s = math.cos(-rot), math.sin(-rot)
    lx, ly = (x - cx) * c - (y - cy) * s, (x - cx) * s + (y - cy) * c
    qx, qy = np.abs(lx) - (w / 2 - r), np.abs(ly) - (d / 2 - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def _local_y(x, y, cx, cy, rot):
    c, s = math.cos(-rot), math.sin(-rot)
    return (x - cx) * s + (y - cy) * c


def _auto_z(cx, cy, off=0.0):
    xs = cx + np.array([0, 12, -12, 0, 0])
    ys = cy + np.array([0, 0, 0, 12, -12])
    return float(np.mean(natural_h(xs, ys))) + off


# edge：stone = 白石挡土墙（有栏杆），rock = 天然崖，soft = 草坡
PADS = [
    dict(id='lake', kind='ellipse', c=(-12, 142), r=(100, 44), rot=0.06, z=0.5, blend=14, edge='soft', noise=6),
    dict(id='plateau', kind='ellipse', c=(0, 8), r=(128, 76), z=PLATEAU_Z, blend=1.6, edge='mixed', noise=0),
    dict(id='terrace', kind='rect', c=(0, -104), s=(156, 80), z=TERRACE_Z, blend=1.6, edge='stone', r=10),
    dict(id='esplanade', kind='rect', c=(0, -196), s=(92, 104), z=(8.5, 19.2), blend=12, edge='soft', r=6),
    dict(id='dock', kind='ellipse', c=(0, -256), r=(30, 18), z=8.5, blend=8, edge='soft'),
    dict(id='breakers', kind='ellipse', c=(236, -152), r=(70, 46), rot=-0.45, z='auto+2', blend=1.6, edge='stone'),
    dict(id='grey_house', kind='rect', c=(-232, -100), s=(64, 40), rot=0.35, z='auto+4', blend=1.6, edge='stone', r=3),
    dict(id='grey_t1', kind='rect', c=(-243, -134), s=(64, 22), rot=0.35, z='prev-3', blend=1.6, edge='stone', r=2),
    dict(id='islet', kind='ellipse', c=(-22, 150), r=(9, 8), z=WATER_Z + 1.3, blend=3, edge='soft'),
    dict(id='club', kind='ellipse', c=(70, 132), r=(18, 12), z=WATER_Z + 1.2, blend=1.2, edge='stone'),
    dict(id='view_rear', kind='ellipse', c=(34, 84), r=(13, 10), z=PLATEAU_Z, blend=1.2, edge='stone'),
    dict(id='view_east', kind='ellipse', c=(300, 4), r=(14, 11), z='auto+1', blend=1.2, edge='stone'),
    dict(id='view_ne', kind='ellipse', c=(222, 122), r=(12, 9), z='auto+4', blend=1.2, edge='stone'),
]


def _resolve_pads():
    prev = None
    for p in PADS:
        z = p['z']
        if isinstance(z, str):
            if z.startswith('auto'):
                p['zv'] = _auto_z(*p['c'], float(z[4:] or 0))
            else:
                p['zv'] = prev + float(z[4:])
        else:
            p['zv'] = z
        prev = p['zv'] if not isinstance(p['zv'], tuple) else p['zv'][1]


_resolve_pads()


def pad_sd(p, x, y):
    if p['kind'] == 'ellipse':
        sd = _sd_ellipse(x, y, *p['c'], *p['r'], p.get('rot', 0.0))
    else:
        sd = _sd_rect(x, y, *p['c'], *p['s'], p.get('rot', 0.0), p.get('r', 4.0))
    if p.get('noise'):
        sd = sd + p['noise'] * fbm(x, y, 40, 2, 11)
    if p['id'] == 'plateau':   # 北侧（朝湖）是天然崖：边线加噪声
        sd = sd + np.clip((y - 20) / 40, 0, 1) * 6 * fbm(x, y, 30, 2, 12)
    return sd


def pad_z(p, x, y):
    z = p['zv']
    if isinstance(z, tuple):
        ly = _local_y(x, y, *p['c'], p.get('rot', 0.0))
        t = np.clip((ly + p['s'][1] / 2) / p['s'][1], 0, 1)
        return z[0] + (z[1] - z[0]) * t
    return z


def smooth01(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def terrain(x, y):
    """返回 (高度, 属性字典)。属性：lawn / gravel / built（白石挡土墙）/ padmask / lake。"""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    h = natural_h(x, y)
    padmask = np.zeros_like(h)
    built = np.zeros_like(h)
    lawn = np.zeros_like(h)
    lake = np.zeros_like(h)
    for p in PADS:
        sd = pad_sd(p, x, y)
        m = smooth01(-sd / p['blend'] + 1) if p['blend'] > 0 else (sd < 0).astype(float)
        if p['id'] not in ('dock', 'lake'):
            m = m * smooth01((edge_dist(x, y) - 2) / 12)   # 台地不越出岛缘（否则岩基上会挂白墙裙边）
        zp = pad_z(p, x, y)
        if p['id'] == 'lake':
            h = h * (1 - m) + np.minimum(h, zp) * m
            lake = np.maximum(lake, smooth01(-sd / 6))
            continue
        h = h * (1 - m) + zp * m
        inner = (sd < -1.0).astype(float)
        padmask = np.maximum(padmask, m)
        ring = ((sd > -2.6) & (sd < 1.8)).astype(float)
        if p['edge'] == 'stone':
            built = np.maximum(built, ring)
        elif p['edge'] == 'mixed':   # 主台地：南半圈白石墙，北半圈天然崖
            built = np.maximum(built, ring * (y < 25))
        if p['id'] in ('plateau', 'terrace', 'breakers', 'grey_house', 'grey_t1', 'grey_t2', 'view_rear',
                       'view_east', 'view_ne', 'club'):
            lawn = np.maximum(lawn, inner)
        if p['id'] == 'esplanade':
            lawn = np.maximum(lawn, (np.abs(x) < 26).astype(float) * (sd < -3))
            lawn = np.maximum(lawn, 0.55 * (sd < -3))
    built = built * smooth01((edge_dist(x, y) - 3) / 4)   # 岛缘外不画白石墙（避免白色裙边）
    gravel = gravel_mask(x, y)
    cv = cover(x, y, padmask, lake)
    lawn = lawn * (1 - gravel) * (1 - cv['paved']) * (1 - cv['beds'])
    gravel = gravel * (1 - cv['paved'])
    return h, dict(lawn=lawn, gravel=gravel, built=built, padmask=padmask, lake=lake, **cv)


def cover(x, y, padmask, lake):
    """地表分类（v2 用户意见）：白石 / 石灰华铺装、种植床、水渠、湖岸沙砾、外坡草甸、别墅周边热带林下。"""
    pl = [p for p in PADS if p['id'] == 'plateau'][0]
    te = [p for p in PADS if p['id'] == 'terrace'][0]
    fp = footprint_sd(x, y, 0.0)
    sd_pl, sd_te = pad_sd(pl, x, y), pad_sd(te, x, y)
    rc = np.hypot(x - FOUNTAIN[0], y - FOUNTAIN[1])
    paved = ((fp < 9) & (sd_pl < -1)).astype(float)                              # 主楼群周边石铺台地
    paved = np.maximum(paved, ((sd_pl < -1) & (y < -24) & (y > -36) & (np.abs(x) < 26)).astype(float))   # 主楼前平台
    paved = np.maximum(paved, ((sd_te > -7) & (sd_te < -1.5)).astype(float))    # 前庭台地沿挡土墙的石铺步道
    paved = np.maximum(paved, ((rc > COURT_R) & (rc < COURT_R + 5)).astype(float))
    paved = np.maximum(paved, ((sd_pl > -4) & (sd_pl < -1.5) & (y < 25)).astype(float))
    arc_r = np.hypot(x - ARC['c'][0], y - ARC['c'][1])
    paved *= 1 - ((arc_r < ARC['R'] - ARC['depth'] / 2 - 3) & (y > ARC['c'][1])).astype(float)   # 回廊院内留草坪
    beds = np.zeros_like(paved)
    parterre_gravel = np.zeros_like(paved)
    for gid, _, kind, c, sz, rot in GARDENS:
        if gid in ('rose', 'rose_w'):
            lx, ly = np.abs(x - c[0]), np.abs(y - c[1])
            inside = (lx < sz[0]) & (ly < sz[1])
            path = inside & ((lx < 1.5) | (ly < 1.5) | (lx > sz[0] - 2.6) | (ly > sz[1] - 2.6) | (np.hypot(x - c[0], y - c[1]) < 3.2))
            beds = np.maximum(beds, (inside & ~path).astype(float))
            parterre_gravel = np.maximum(parterre_gravel, path.astype(float))
            parterre_gravel = np.maximum(parterre_gravel, ((lx < sz[0] + 3.5) & (ly < sz[1] + 3.5) & ~inside).astype(float))
    beds = np.maximum(beds, ((np.abs(np.abs(x) - 27.5) < 1.6) & (y > -246) & (y < -148)).astype(float))   # 大道两侧花境
    beds = np.maximum(beds, ((sd_te > -11) & (sd_te < -8) & (np.abs(x) > 12)).astype(float))            # 前庭沿墙花境
    rill = np.zeros_like(paved)   # r4：大道中轴改成真水渠（gardens.canal）
    rill = np.maximum(rill, ((np.abs(x) < 0.9) & (y > -100) & (y < -88)).astype(float))
    dc = np.hypot(x - 72, y - 134)
    sand = ((dc < 34) & (lake < 0.95) & (dc > 10)).astype(float) * smooth01((34 - dc) / 6)
    e = edge_dist(x, y)
    meadow = smooth01((55 - e) / 20) * smooth01(0.5 + 2.2 * fbm(x, y, 70, 2, 31)) * (1 - padmask)
    under = np.zeros_like(paved)
    for b in VILLAS:
        under = np.maximum(under, smooth01((24 - np.hypot(x - b[1], y - b[2])) / 8))
    for tx, ty, _ in TREEHOUSES:
        under = np.maximum(under, smooth01((20 - np.hypot(x - tx, y - ty)) / 8))
    meadow = np.maximum(meadow, clearing(x, y) * (1 - padmask) * (1 - lake))
    wm = wood_mask(x, y)
    meadow = np.maximum(meadow * wm, (1 - wm) * (1 - lake))   # r4：林带外全是草甸 / 园地
    return dict(paved=np.maximum(paved, parterre_gravel), beds=beds, rill=rill, sand=sand, meadow=meadow * (1 - under), tropic=under)


def wood_mask(x, y):
    """r4（用户：树太多且雷同）：林地只留外坡林带 + 别墅周边 + 沟谷，其余是草坪 / 草甸 / 设计过的树阵。"""
    e = edge_dist(x, y)
    belt = smooth01((52 + 14 * fbm(x, y, 60, 2, 61) - e) / 10)
    for b in VILLAS:
        belt = np.maximum(belt, smooth01((46 - np.hypot(x - b[1], y - b[2])) / 10))
    belt = np.maximum(belt, smooth01((22 - poly_dist(x, y, RAVINE)) / 8))
    # 视线走廊：主楼 → 湖、主楼 → 停靠平台，保持开敞
    belt *= 1 - smooth01((70 - np.abs(x)) / 12) * ((y > 30) & (y < 110))
    belt *= 1 - smooth01((60 - np.abs(x)) / 10) * (y < -60)
    return belt


def clearing(x, y):
    """r3：林中空地（草甸），打破均匀林冠；别墅 / 主台地附近不开。"""
    c = smooth01((fbm(x, y, 85, 2, 41) - 0.28) / 0.12)
    c *= smooth01((np.hypot(x / 1.2, y) - 150) / 30)
    return c


# ---------------------------------------------------------------- 路网
DRIVES = [  # (折线, 宽度)
    ([(-33, -262), (-33, -146)], 7),
    ([(33, -262), (33, -146)], 7),
    ([(-33, -262), (-12, -268), (12, -268), (33, -262)], 7),
    ([(-40, -42), (40, -42)], 9),                # 主楼前车道
    ([(0, -64), (0, -44)], 14),                  # 大台阶
]
FOOTPATHS = [
    [(78, -60), (100, -40), (120, -12), (138, 22), (150, 60), (175, 95), (205, 112), (222, 122)],
    [(185, 5), (205, 22), (240, 20), (285, 8), (300, 4)],
    [(-78, -60), (-110, -50), (-150, -40), (-190, -60), (-225, -82)],
    [(-110, -50), (-140, -5), (-170, 40), (-205, 80), (-190, 120), (-150, 150), (-100, 196)],
    [(-66, 60), (-90, 90), (-120, 100)],
    [(70, 132), (110, 150), (150, 165), (190, 150)],
    [(150, -60), (190, -100), (215, -128)],
    [(-110, -50), (-150, -110), (-190, -140), (-200, -150)],   # → 迷宫
    [(-128, 118), (-100, 96), (-66, 60), (-62, 58)],            # 服务区 → 训练场（仆从动线）
    [(-40, 110), (-80, 205), (-40, 222), (20, 220), (70, 205)],
]
FOUNTAIN = (0.0, -113.0)
COURT_R = 26.0


def gravel_mask(x, y):
    g = np.zeros(np.broadcast(x, y).shape)
    for pts, w in DRIVES:
        g = np.maximum(g, smooth01((w / 2 - poly_dist(x, y, pts)) / 1.0 + 0.5))
    for pts in FOOTPATHS:
        g = np.maximum(g, 0.85 * smooth01((1.3 - poly_dist(x, y, pts)) / 0.8 + 0.5))
    rc = np.hypot(x - FOUNTAIN[0], y - FOUNTAIN[1])
    g = np.maximum(g, smooth01((COURT_R - rc) / 1.0 + 0.5) * (rc > 16.5))   # 前庭环形砾石广场
    g = np.maximum(g, smooth01((COURT_R - 1 - np.abs(x)) / 1) * ((y > -140) & (y < -64)) * (np.abs(x) < 7))
    return g


# ---------------------------------------------------------------- 建筑清单
# (id, cx, cy, w, d, 层数, 旋转°, 屋顶, 材质)   坐标为岛坐标；z 自动取所在台地
MAIN = [  # 海湖式主楼群（高台）
    ('hall', 0, -4, 40, 24, 3, 0, 'hip', 'white'),
    ('porch', 0, -20, 16, 9, 2, 0, 'hip', 'white'),
    ('tower', -17, -17, 10, 10, 4.3, 0, 'tower', 'white'),
    ('w_wing_a', -37, -8, 30, 14, 2, 0, 'hip', 'white'),
    ('w_wing_b', -58, 7, 14, 28, 2.5, 12, 'hip', 'white'),
    ('w_pav', -68, 32, 20, 17, 3, 12, 'hip', 'white'),
    ('e_wing_a', 35, -6, 26, 15, 2, 0, 'hip', 'white'),
    ('e_wing_b', 55, 8, 14, 26, 2, -10, 'hip', 'white'),
    ('e_pav', 63, 33, 20, 16, 3, -10, 'hip', 'white'),
    ('belvedere', 47, -19, 8, 8, 3.2, 0, 'tower', 'white'),
    ('n_link', 0, 12, 22, 10, 2, 0, 'hip', 'white'),
    ('w_low', -24, 6, 14, 12, 1.5, 0, 'hip', 'white'),
    ('e_low', 24, 6, 14, 12, 1.5, 0, 'hip', 'white'),
]
ARC = dict(c=(0, 30), R=31, depth=8, a0=12, a1=168, floors=1.6)   # 半圆回廊（院内是草坪 + 棕榈，不做水池）

GUEST = [  # 沿东侧等高线的客房楼，有顶连廊相接
    ('g1', 100, -44, 16, 11, 2, -35, 'hip', 'white'),
    ('g2', 126, -12, 15, 11, 2, -55, 'hip', 'white'),
    ('g3', 141, 26, 15, 11, 2, -70, 'hip', 'white'),
    ('g4', 150, 64, 15, 10, 2, -80, 'hip', 'white'),
    ('spa', -104, -46, 22, 13, 1.5, 20, 'hip', 'white'),
    ('w_g1', -140, -12, 15, 11, 2, 50, 'hip', 'white'),
    ('w_g2', -166, 30, 15, 11, 2, 62, 'hip', 'white'),
]
VILLAS = [  # 林中散落别墅（平顶带屋顶露台 or 红瓦四坡）
    ('v1', 200, 110, 22, 23, 2, 25, 'sketch', 'white'),
    ('v2', 262, 50, 22, 23, 2, -15, 'sketch', 'white'),
    ('v3', 196, -40, 22, 23, 2, 40, 'sketch', 'white'),
    ('v4', 240, 20, 22, 23, 2, 10, 'sketch', 'white'),
    ('v5', -208, 82, 22, 23, 2, -20, 'sketch', 'white'),
    ('v6', -268, 34, 22, 23, 2, 30, 'sketch', 'white'),
    ('v7', -150, 152, 22, 23, 2, -40, 'sketch', 'white'),
    ('v8', 105, 208, 22, 23, 2, 10, 'sketch', 'white'),
    ('v9', -95, 200, 22, 23, 2, -10, 'sketch', 'white'),
    ('v10', -290, -40, 22, 23, 2, 60, 'sketch', 'white'),
]
VILLAS = [(b[0], b[1], b[2], b[3], b[4], b[5], round(math.degrees(math.atan2(b[2], b[1]))) - 90, *b[7:]) for b in VILLAS]   # 露台 / 泳池（模型 +y）朝岛外
TREEHOUSES = [(-185, 120, 20), (160, 150, -30), (40, 222, 5), (-255, 70, 45), (285, 70, -60), (-60, 225, 15)]
CLUB = ('club', 72, 134, 24, 11, 1.5, -25, 'hip', 'white')
BREAKERS = ('breakers', 232, -148, 50, 32, 4, -26, 'hip_low', 'beige')
GREYSTONE = [  # 都铎灰石老宅：几组陡山墙
    ('gs_main', -230, -98, 36, 13, 2.5, 20, 'gable', 'grey'),
    ('gs_wing', -246, -90, 12, 26, 2.5, 20, 'gable', 'grey'),
    ('gs_east', -213, -104, 11, 20, 2, 20, 'gable', 'grey'),
    ('gs_tower', -238, -110, 6, 6, 3.5, 20, 'gable', 'grey'),
]
FUNICULAR = ((34, 90), (66, 126))   # 崖顶站 → 湖边俱乐部
ROPE_BRIDGE = ((180, 30), (216, 12))

WALKWAYS = [  # 有顶连廊（跟地形）
    [(48, -6), (72, -28), (88, -40)],
    [(72, -28), (104, -30), (118, -16)],
    [(118, -16), (132, 6), (138, 18)],
    [(138, 18), (148, 42), (150, 56)],
    [(-52, -8), (-78, -30), (-94, -40)],
    [(-94, -40), (-122, -30), (-134, -16)],
    [(-134, -16), (-152, 6), (-160, 22)],
    [(20, 38), (34, 60), (34, 76)],          # 回廊 → 崖顶观景台 / 缆车站
]


# ---------------------------------------------------------------- v2：设定空间落位（docs/eden-lore-space.md）
# 服务区（西北，湖西侧林后；主人动线不经过），载具停靠坪给私人悬浮载具（卡里没有飞艇；车库、停靠坪是用户要求加的）
SERVICE = [
    ('svc_house', -168, 112, 40, 13, 2.5, 35, 'hip', 'white'),     # 仆役楼：女仆团后勤、布草、员工餐厅
    ('hangar', -214, 150, 30, 20, 2, 35, 'flat', 'white'),          # 悬浮载具库（载具停靠坪在旁）
    ('garage', -140, 138, 26, 10, 1.2, 35, 'hip', 'white'),         # 悬浮车库（用户要求）
    ('greenhouse', -118, 168, 34, 9, 1.4, 20, 'flat', 'white'),    # 温室 / 橘园（菜园北墙）
]
WATERSIDE = ('waterside', -34, 100, 16, 9, 1.2, -4, 'hip', 'white')   # 水榭：湖南岸石台敞亭，半挑出水面
ISLET = (-22, 150, 9)                       # 湖心小岛 (x, y, 半径)；岛上 8 柱圆亭 = 湖心亭
WATER_TOWER = (-196, 88, 5.5, 22)          # 以太凝水塔：圆塔 (x, y, 半径, 高)，给喷泉供水
HELIPAD = (-190, 176, 14)                  # 载具停靠坪 (x, y, 半径)（用户要求）
GARDENS = [  # (id, 名称, kind, 中心, 尺寸, 旋转°)
    ('training', '露天训练场', 'rect', (-62, 58), (28, 14), 8),
    ('rear_lawn', '后庭草坪', 'ellipse', (0, 44), (20, 12), 0),
    ('pavilion', '凉亭', 'circle', (-84, 118), (5, 5), 0),
    ('rose', '玫瑰园（白玫瑰）', 'rect', (58, -104), (14, 19), 0),      # r3：黄杨花坛（半宽, 半深）
    ('rose_w', '玫瑰园（西）', 'rect', (-58, -104), (14, 19), 0),
    ('kitchen_garden', '菜园（厨房花园）', 'rect', (-118, 150), (40, 26), 20),
    ('maze', '树篱迷宫', 'rect', (-200, -150), (30, 30), 20),
    ('orchard', '果园', 'ellipse', (205, 145), (28, 20), 0),
]
COURTS = [(-168, -72, 22), (168, -100, -28), (-230, 95, -20)]   # r4 网球场 (x, y, 旋转°)，36.6 × 18.3 m 含外场
BARRIER_STONES = [(-235, -165), (235, -165), (-235, 165), (235, 165)]   # 结界锚碑

# 主楼群按翼 / 层落位（B2…F3 对应卡里的地上三层 + 地下两层；观景塔是屋顶眺望亭，不算楼层，键名沿用 F5）
PROGRAM = {
    'hall':      {'F1': ['大厅', '会客厅'], 'F2': ['书房', '主卧（含衣帽间、浴室）', '女仆长寝室'], 'F3': ['三楼公共浴室'],
                  'B1': ['酒窖', '体能训练室', '附属室 A*', '附属室 B*', '附属室 C*'],
                  'B2': ['档案室', '储藏室', '医务室', '结界发生器', '附属室 D*']},
    'porch':     {'F1': ['门廊（正门）']},
    'tower':     {'F5': ['观景塔 / 屋顶眺望亭']},
    'w_wing_a':  {'F1': ['餐厅', '备餐间'], 'F2': ['客房 ×2'], 'F3': ['新人公共寝室']},
    'w_wing_b':  {'F1': ['厨房', '洗衣房'], 'F3': ['女仆团集体宿舍']},
    'w_pav':     {'F1': ['物资仓库', '清洗消毒间', '服务楼梯'], 'F2': ['值班室 / 监控室']},
    'e_wing_a':  {'F2': ['东侧长廊（落地窗朝云海）'], 'F3': ['住客个人寝室 ×6']},
    'e_wing_b':  {'F2': ['起居室', '茶室'], 'F3': ['住客个人寝室 ×6']},
    'e_pav':     {'F1': ['图书室'], 'F3': ['观景室（朝云海）']},
    'belvedere': {'F4': ['小望楼']},
    'n_link':    {'F1': ['廊厅（通后庭）']},
    'w_low':     {'F1': ['主人专用通道 / 电梯厅']},
    'e_low':     {'F1': ['小客厅']},
    'arc':       {'F1': ['半圆回廊（后庭）']},
    'breakers':  {'F1': ['宾客馆：长住访客（阿斯特丽德等）']},
    'gs_main':   {'F1': ['旧宅：家族藏书与收藏']},
    'spa':       {'F1': ['水疗馆']},
    'club':      {'F1': ['湖边俱乐部']},
    'svc_house': {'F1': ['仆役厅', '员工餐厅', '附属用房']},
    'waterside': {'F1': ['水榭']},
}
# 地下层平面（主楼 hall 40×24、东角亭 e_pav 20×16 下方），格子 = (名称, x0, y0, x1, y1) 局部米，−y 为正面
BASEMENT = {
    'hall': {'B1': [('酒窖', -20, -12, -10, 0), ('体能训练室', -10, -12, 6, 0), ('附属室 A*', 6, -12, 20, 0),
                    ('楼梯 / 电梯厅', -20, 0, -10, 12), ('走廊', -10, 0, 6, 12), ('附属室 B*', 6, 0, 13, 12), ('附属室 C*', 13, 0, 20, 12)],
             'B2': [('档案室', -20, -12, -10, 0), ('医务室', -10, -12, 6, 0), ('附属室 D*', 6, -12, 20, 0),
                    ('储藏室', -20, 0, -10, 12), ('结界发生器', -10, 0, 6, 12), ('楼梯 / 电梯厅', 6, 0, 20, 12)]},
}
BASEMENT_LINK = '地下两层只在主楼下方；仆役楼梯与主人专用电梯都通到 B2'
# 林中别墅：留给以后入住的外部人物（卡未写入住，先不定人）
VILLA_NOTE = '别墅 V1–V10 与客房楼 g1–g4 / w_g1–w_g2 预留给外部人物长住（伊莎贝拉、维多利亚、克洛伊、塞拉菲娜、神宫寺凛、叶梨莎、玛嘉烈等）'


def all_buildings():
    out = []
    for grp in (MAIN, GUEST, VILLAS, GREYSTONE, SERVICE):
        out += list(grp)
    out += [CLUB, BREAKERS, WATERSIDE]
    return out


def ground_z(x, y):
    h, _ = terrain(np.array([x]), np.array([y]))
    return float(h[0])


def footprint_sd(x, y, pad=0.0):
    """到最近建筑的有符号距离（粗略，用于排除树）。"""
    d = np.full(np.broadcast(x, y).shape, 1e9)
    for b in all_buildings():
        _, cx, cy, w, dd, *_rest = b
        rot = math.radians(b[6])
        d = np.minimum(d, _sd_rect(x, y, cx, cy, w + 2 * pad, dd + 2 * pad, rot, 1.0))
    d = np.minimum(d, np.abs(np.hypot(x - ARC['c'][0], y - ARC['c'][1]) - ARC['R']) - ARC['depth'] / 2 - pad)
    for tx, ty, _ in TREEHOUSES:
        d = np.minimum(d, np.hypot(x - tx, y - ty) - 5 - pad)
    for cx, cy, a in COURTS:
        d = np.minimum(d, _sd_rect(x, y, cx, cy, 20 + 2 * pad, 38 + 2 * pad, math.radians(a), 1.0))
    d = np.minimum(d, _sd_rect(x, y, 0, -198, 9 + 2 * pad, 100, 0, 1.0))   # 大道水渠
    return d
