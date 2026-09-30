"""r5 室外补件（eden:r5，docs/eden-requirements.md 的缺口）：卡里后庭园的四样 + 以太凝水塔，以及观景台的绿篱带。

卡（card-digest §6）：后庭园 = 露天训练场、草坪、小型人工湖、围栏区、凉亭；室外另有以太凝水塔（供水）。
- 露天训练场：沙土场 + 白色三道横栏 + 单杠架 / 双杠 / 攀爬架 / 跳箱（晨间体能训练）
- 围栏区：白色三道横栏围起的一片草场（留一扇门）
- 凉亭：主楼 → 湖中轴尽头的白石 8 柱圆顶亭，铜绿穹顶（俯视和湖心亭的铅灰顶区分开）
- 以太凝水塔：农场台地上的细高白石塔，顶上淡青凝水晶罩（微光）+ 铜环，塔脚一圈石台
- 观景台（layout.LOOKOUTS）：栏杆内侧 1.2 m 宽低绿篱环，朝岛心留入口
坐标全部来自 layout.py（TRAINING / PADDOCK / PAVILION / WATER_TOWER / LOOKOUTS）。
"""
import math
import bmesh
from mathutils import Matrix
from . import layout as L
from .common import bm_to_obj
from .buildings import mats, _box, _plain, _stone, sweep


def _mat_cache():
    M = mats()
    if 'sand_court' not in M:
        M['sand_court'] = _stone('e2_sand_court', 'gravel_floor', (0.7, 0.58, 0.4), 0.7, windows=False, grime=0.06)
        M['rail_white'] = _plain('e2_rail_white', (0.86, 0.85, 0.82), 0.5)
        M['crystal'] = _plain('e2_condense_crystal', (0.62, 0.8, 0.86), 0.04, 0.0, ((0.55, 0.85, 1.0), 0.6))   # 淡青微光（以太凝水）
    return M


def _rbox(bm, x, y, z0, z1, ln, w, ang):
    """绕中心旋转的立方体：长 ln（沿 ang）、宽 w、高 z0..z1。"""
    m = Matrix.Translation((x, y, (z0 + z1) / 2)) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Diagonal((ln, w, z1 - z0, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def _rail_fence(bm, pts, z, gate=None, h=1.25, rails=3, post=2.4):
    """三道横栏木围栏（漆白），pts 为闭合多边形（局部 → 世界坐标已算好）；gate = 在第几条边中点留 3 m 门。"""
    for i, (a, b) in enumerate(zip(pts, pts[1:] + pts[:1])):
        ln = math.dist(a, b)
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        n = max(1, round(ln / post))
        for k in range(n + 1):
            t = k / n
            x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            if gate == i and abs(t - 0.5) * ln < 1.5:
                continue
            _rbox(bm, x, y, z - 0.4, z + h + 0.1, 0.14, 0.14, ang)
        spans = [(0.0, 0.5 - 1.5 / ln), (0.5 + 1.5 / ln, 1.0)] if gate == i else [(0.0, 1.0)]
        for t0, t1 in spans:
            mx, my = a[0] + (b[0] - a[0]) * (t0 + t1) / 2, a[1] + (b[1] - a[1]) * (t0 + t1) / 2
            for r in range(rails):
                zr = z + h * (r + 1) / rails
                _rbox(bm, mx, my, zr - 0.07, zr + 0.07, ln * (t1 - t0), 0.05, ang)


def _rect(cx, cy, w, d, rot_deg):
    a = math.radians(rot_deg)
    return [(cx + u * math.cos(a) - v * math.sin(a), cy + u * math.sin(a) + v * math.cos(a))
            for u, v in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]


def training(col):
    """露天训练场：沙土场 + 白栏 + 器械。"""
    M = _mat_cache()
    (cx, cy), (w, d), rd = L.TRAINING
    z = L.ground_z(cx, cy)
    a = math.radians(rd)
    P = lambda u, v: (cx + u * math.cos(a) - v * math.sin(a), cy + u * math.sin(a) + v * math.cos(a))
    bm = bmesh.new()
    _rbox(bm, cx, cy, z - 0.3, z + 0.06, w, d, a)
    bm_to_obj(bm, 'train_court', col, M['sand_court'])
    bm = bmesh.new()
    _rail_fence(bm, _rect(cx, cy, w + 1.6, d + 1.6, rd), z, gate=3)
    bm_to_obj(bm, 'train_fence', col, M['rail_white'])
    st = bmesh.new()
    for u in (-9.0, -6.0, -3.0):          # 单杠架：三副不同高度
        h = 2.1 + (u + 9.0) / 10
        for v in (-1.0, 1.0):
            x, y = P(u, -3.0 + v)
            _rbox(st, x, y, z, z + h, 0.1, 0.1, a)
        x, y = P(u, -3.0)
        _rbox(st, x, y, z + h - 0.05, z + h + 0.05, 0.08, 2.1, a)
    for v in (2.6, 3.4):                  # 双杠
        for u in (-8.0, -5.0):
            x, y = P(u, v)
            _rbox(st, x, y, z, z + 1.35, 0.08, 0.08, a)
        x, y = P(-6.5, v)
        _rbox(st, x, y, z + 1.3, z + 1.4, 3.4, 0.06, a)
    for u in (2.0, 6.0):                  # 攀爬架（两门框 + 顶梁）
        for v in (-2.0, 2.0):
            x, y = P(u, v)
            _rbox(st, x, y, z, z + 3.2, 0.12, 0.12, a)
    for v in (-2.0, 2.0):
        x, y = P(4.0, v)
        _rbox(st, x, y, z + 3.15, z + 3.3, 4.2, 0.12, a)
    bm_to_obj(st, 'train_rigs', col, M['steel'])
    wd = bmesh.new()
    for i, (u, v) in enumerate(((9.5, -3.5), (10.6, -3.4), (11.6, -3.6))):   # 跳箱
        x, y = P(u, v)
        _rbox(wd, x, y, z, z + 0.45 + 0.15 * i, 0.9, 0.7, a)
    bm_to_obj(wd, 'train_boxes', col, M['wood'])


def paddock(col):
    """围栏区：白色三道横栏围起的草场（圆角矩形，门朝主楼）。"""
    M = _mat_cache()
    (cx, cy), (w, d), rd = L.PADDOCK
    z = L.ground_z(cx, cy)
    bm = bmesh.new()
    _rail_fence(bm, _rect(cx, cy, w, d, rd), z, gate=0)
    bm_to_obj(bm, 'paddock_fence', col, M['rail_white'])


def pavilion(col):
    """凉亭：白石台基 3 级踏步 + 8 根柱 + 檐 + 铜绿穹顶。"""
    M = _mat_cache()
    (x, y), r = L.PAVILION
    z = L.ground_z(x, y)
    bm = bmesh.new()
    for k, (rr, h) in enumerate(((r + 1.3, 0.18), (r + 0.95, 0.36), (r + 0.6, 0.54))):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=rr, radius2=rr, depth=h, matrix=Matrix.Translation((x, y, z + h / 2)))
    for k in range(8):
        t = 2 * math.pi * (k + 0.5) / 8
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.24, radius2=0.2, depth=3.6,
                              matrix=Matrix.Translation((x + (r - 0.3) * math.cos(t), y + (r - 0.3) * math.sin(t), z + 0.54 + 1.8)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=r + 0.3, radius2=r + 0.2, depth=0.6, matrix=Matrix.Translation((x, y, z + 4.44)))
    bm_to_obj(bm, 'pavilion_stone', col, M['plain'])
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=12, radius=r, matrix=Matrix.Translation((x, y, z + 4.7)) @ Matrix.Diagonal((1, 1, 0.6, 1)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.25, radius2=0.02, depth=1.0, matrix=Matrix.Translation((x, y, z + 4.7 + 0.6 * r + 0.4)))
    bm_to_obj(bm, 'pavilion_dome', col, M['copper'])


def water_tower(col):
    """以太凝水塔：石台 + 收分白石塔身（腰线两道）+ 铜环 + 淡青凝水晶罩。"""
    M = _mat_cache()
    x, y, r, h = L.WATER_TOWER
    z = L.ground_z(x, y)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=r + 2.2, radius2=r + 2.2, depth=1.0, matrix=Matrix.Translation((x, y, z + 0.1)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=r, radius2=r * 0.78, depth=h, matrix=Matrix.Translation((x, y, z + 0.6 + h / 2)))
    for f in (0.36, 0.7):
        rr = r - (r - r * 0.78) * f + 0.18
        bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=rr, radius2=rr, depth=0.45, matrix=Matrix.Translation((x, y, z + 0.6 + h * f)))
    bm_to_obj(bm, 'water_tower_stone', col, M['ashlar'])
    top = z + 0.6 + h
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=r * 0.9, radius2=r * 0.9, depth=0.6, matrix=Matrix.Translation((x, y, top + 0.3)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=r * 0.7, radius2=r * 0.7, depth=0.35, matrix=Matrix.Translation((x, y, top + 3.9)))
    bm_to_obj(bm, 'water_tower_ring', col, M['copper'])
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=r * 0.72, matrix=Matrix.Translation((x, y, top + 2.0)) @ Matrix.Diagonal((1, 1, 1.25, 1)))
    bm_to_obj(bm, 'water_tower_crystal', col, M['crystal'])


def lookout_hedges(col):
    """观景台：栏杆内侧 2 m 处一圈 1.2 m 宽、0.85 m 高的低绿篱，朝岛心方向留 ±20° 入口。"""
    M = _mat_cache()
    for pid in L.LOOKOUTS:
        p = next(q for q in L.PADS if q['id'] == pid)
        (cx, cy), (rx, ry), rot = p['c'], p['r'], p.get('rot', 0.0)
        z = p['zv'] if not isinstance(p['zv'], tuple) else p['zv'][1]
        a_in = math.atan2(-cy, -cx) - rot
        pts = []
        for k in range(73):
            t = a_in + math.radians(20) + math.radians(320) * k / 72
            u, v = (rx - 2.0) * math.cos(t), (ry - 2.0) * math.sin(t)
            pts.append((cx + u * math.cos(rot) - v * math.sin(rot), cy + u * math.sin(rot) + v * math.cos(rot), z))
        sweep(f'look_hedge_{pid}', pts, [(-0.6, -0.2), (-0.55, 0.85), (0.55, 0.85), (0.6, -0.2)], M['hedge'], col)


def build(col):
    training(col)
    paddock(col)
    pavilion(col)
    water_tower(col)
    lookout_hedges(col)
