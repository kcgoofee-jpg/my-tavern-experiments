"""r3 园林：双跑大台阶（帝国式）+ 壁泉、带水的三层喷泉、黄杨绿篱花坛（parterre）、修剪锥形树。

尺寸按真实园林：台阶踏步 0.18 × 0.39 m，栏杆高 1.0 m；绿篱 0.7 m 宽 0.8 m 高；锥形黄杨 2.4–3.2 m。
"""
import math
import numpy as np
import bpy, bmesh
from mathutils import Matrix
from . import layout as L
from .common import bm_to_obj
from .buildings import mats, _box, baluster_run, sweep


def wall_y(x):
    """主台地挡土墙外皮的 y（椭圆轮廓外 1.8 m）。"""
    p = [q for q in L.PADS if q['id'] == 'plateau'][0]
    (cx, cy), (rx, ry) = p['c'], p['r']
    return cy - ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2)) - 1.8


def imperial_stairs(col):
    """前庭台地 (z20) → 主台地 (z30)：两跑贴墙对称上行，中间是壁泉。"""
    M = mats()
    zb, zt = L.TERRACE_Z, L.PLATEAU_Z
    n = 56
    x_lo, x_hi, wid = 7.0, 29.0, 4.6
    rise, run = (zt - zb) / n, (x_hi - x_lo) / n
    bm = bmesh.new()
    bb = bmesh.new()
    bt = bmesh.new()
    for s in (-1, 1):
        for k in range(n):
            xa, xb = s * (x_lo + k * run), s * (x_lo + (k + 1) * run + 0.02)
            yw = wall_y((xa + xb) / 2)
            ztop = zb + (k + 1) * rise
            _box(bm, min(xa, xb), yw - wid, zb - 0.6, max(xa, xb), yw + 0.3, ztop - 0.06)
            _box(bt, min(xa, xb) - 0.03, yw - wid - 0.05, ztop - 0.07, max(xa, xb) + 0.03, yw + 0.3, ztop)   # 踏步石（带前沿）
        # 顶部平台：接到台面
        xa, xb = s * x_hi, s * (x_hi + 5.0)
        yw = wall_y(s * (x_hi + 2.5))
        _box(bm, min(xa, xb), yw - wid, zb - 0.6, max(xa, xb), yw + 2.5, zt)
        # 底部起步平台
        xa, xb = s * 5.2, s * x_lo
        _box(bm, min(xa, xb), wall_y(s * 6) - wid - 0.6, zb - 0.6, max(xa, xb), wall_y(s * 6) + 0.3, zb + 0.12)
        # 外侧斜栏杆（分段跟着墙的弧度）
        segs = 6
        for j in range(segs):
            xa = s * (x_lo + (x_hi - x_lo) * j / segs)
            xb = s * (x_lo + (x_hi - x_lo) * (j + 1) / segs)
            za = zb + (abs(xa) - x_lo) * (zt - zb) / (x_hi - x_lo)
            zb2 = zb + (abs(xb) - x_lo) * (zt - zb) / (x_hi - x_lo)
            baluster_run(bb, (xa, wall_y(xa) - wid + 0.15), (xb, wall_y(xb) - wid + 0.15), za + 0.1, zb2 + 0.1, h=1.0, pitch=0.5)
        x2 = s * (x_hi + 5.0)
        baluster_run(bb, (s * x_hi, wall_y(s * x_hi) - wid + 0.15), (x2, wall_y(x2) - wid + 0.15), zt, h=1.0)
        baluster_run(bb, (x2, wall_y(x2) - wid + 0.15), (x2 + s * 0.01, wall_y(x2) + 0.3), zt, h=1.0)
        # 起步处的墩柱 + 石瓶
        x0 = s * 5.4
        y0 = wall_y(x0) - wid - 0.3
        _box(bb, x0 - 0.5, y0 - 0.5, zb, x0 + 0.5, y0 + 0.5, zb + 1.5)
        bmesh.ops.create_uvsphere(bb, u_segments=12, v_segments=8, radius=0.45, matrix=Matrix.Translation((x0, y0, zb + 2.0)))
    bm_to_obj(bm, 'imperial_stairs', col, M['ashlar'])
    bm_to_obj(bt, 'imperial_stairs_treads', col, M['plain'])
    bm_to_obj(bb, 'imperial_stairs_bal', col, M['plain'])
    # 墙顶（主台地边缘）中央观景栏杆 + 壁泉
    wall_fountain(col)


def wall_fountain(col):
    M = mats()
    zb, zt = L.TERRACE_Z, L.PLATEAU_Z
    yw = wall_y(0)
    bm = bmesh.new()
    # 壁龛框：两侧壁柱 + 拱顶线脚
    for s in (-1, 1):
        _box(bm, s * 3.6 - 0.5, yw - 0.6, zb, s * 3.6 + 0.5, yw + 0.2, zt - 0.8)
    _box(bm, -4.3, yw - 0.8, zt - 1.6, 4.3, yw + 0.2, zt - 0.8)
    _box(bm, -3.1, yw - 0.1, zb, 3.1, yw + 0.4, zt - 1.6)                  # 龛背
    # 半圆水池：池沿
    r0, r1 = 5.0, 5.7
    angs = np.linspace(math.pi, 2 * math.pi, 33)
    vi = [bm.verts.new((r0 * math.cos(a), yw + r0 * math.sin(a), zb + 0.75)) for a in angs]
    vo = [bm.verts.new((r1 * math.cos(a), yw + r1 * math.sin(a), zb + 0.75)) for a in angs]
    vol = [bm.verts.new((r1 * math.cos(a), yw + r1 * math.sin(a), zb - 0.2)) for a in angs]
    for i in range(len(angs) - 1):
        bm.faces.new([vi[i], vi[i + 1], vo[i + 1], vo[i]])
        bm.faces.new([vo[i], vo[i + 1], vol[i + 1], vol[i]])
    # 三级跌水石盘
    for k, (rad, z) in enumerate(((1.8, zt - 3.5), (2.6, zt - 6.0))):
        a2 = np.linspace(math.pi, 2 * math.pi, 17)
        c = [bm.verts.new((rad * math.cos(a), yw + rad * math.sin(a), z)) for a in a2]
        c2 = [bm.verts.new((rad * math.cos(a), yw + rad * math.sin(a), z - 0.35)) for a in a2]
        cen = bm.verts.new((0, yw, z)); cen2 = bm.verts.new((0, yw, z - 0.35))
        for i in range(len(a2) - 1):
            bm.faces.new([cen, c[i + 1], c[i]])
            bm.faces.new([c[i], c[i + 1], c2[i + 1], c2[i]])
            bm.faces.new([cen2, c2[i], c2[i + 1]])
    bm_to_obj(bm, 'wall_fountain', col, M['plain'])
    bm = bmesh.new()   # 水面 + 跌水帘
    cen = bm.verts.new((0, yw, zb + 0.6))
    vv = [bm.verts.new((r0 * math.cos(a), yw + r0 * math.sin(a), zb + 0.6)) for a in angs]
    for i in range(len(angs) - 1):
        bm.faces.new([cen, vv[i + 1], vv[i]])
    bm_to_obj(bm, 'wall_fountain_water', col, M['pool'])
    bm = bmesh.new()
    for rad, z0, z1 in ((1.8, zt - 3.5, zt - 6.0), (2.6, zt - 6.0, zb + 0.6)):
        a2 = np.linspace(math.pi * 1.1, math.pi * 1.9, 12)
        top = [bm.verts.new((rad * math.cos(a), yw + rad * math.sin(a), z0 - 0.3)) for a in a2]
        bot = [bm.verts.new((rad * 1.12 * math.cos(a), yw + rad * 1.12 * math.sin(a), z1)) for a in a2]
        for i in range(len(a2) - 1):
            bm.faces.new([top[i], top[i + 1], bot[i + 1], bot[i]])
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.12, radius2=0.35, depth=2.2,
                          matrix=Matrix.Translation((0, yw - 0.6, zt - 2.4)) @ Matrix.Rotation(math.radians(-40), 4, 'X'))
    bm_to_obj(bm, 'wall_fountain_spray', col, M['spray'])


def fountain(col):
    """前庭喷泉：直径 20 m 的石池（有水），三层石盘，中心高喷 + 12 道弧形水柱。"""
    M = mats()
    fx, fy = L.FOUNTAIN
    z = L.TERRACE_Z
    bm = bmesh.new()
    R0, R1 = 9.4, 10.2
    n = 72
    angs = np.linspace(0, 2 * math.pi, n, endpoint=False)
    ri = [bm.verts.new((fx + R0 * math.cos(a), fy + R0 * math.sin(a), z + 0.85)) for a in angs]
    ro = [bm.verts.new((fx + R1 * math.cos(a), fy + R1 * math.sin(a), z + 0.85)) for a in angs]
    rob = [bm.verts.new((fx + (R1 + 0.25) * math.cos(a), fy + (R1 + 0.25) * math.sin(a), z - 0.3)) for a in angs]
    rib = [bm.verts.new((fx + R0 * math.cos(a), fy + R0 * math.sin(a), z + 0.2)) for a in angs]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([ri[i], ri[j], ro[j], ro[i]])
        bm.faces.new([ro[i], ro[j], rob[j], rob[i]])
        bm.faces.new([rib[i], rib[j], ri[j], ri[i]])
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=R0, radius2=R0, depth=0.1, matrix=Matrix.Translation((fx, fy, z + 0.2)))
    # 石盘 + 柱身（下大上小）
    for rad, hz, dz in ((1.6, 2.4, 1.5), (4.2, 0.35, 2.9), (0.8, 2.2, 4.1), (2.3, 0.3, 5.3), (0.45, 1.4, 6.1), (1.1, 0.25, 6.9)):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=rad, radius2=rad * (0.72 if hz < 0.5 else 0.85), depth=hz,
                              matrix=Matrix.Translation((fx, fy, z + dz)))
    # 池外八个小石瓶 / 灯柱
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        x, y = fx + (R1 + 0.1) * math.cos(a), fy + (R1 + 0.1) * math.sin(a)
        _box(bm, x - 0.45, y - 0.45, z + 0.85, x + 0.45, y + 0.45, z + 1.6)
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.42, matrix=Matrix.Translation((x, y, z + 2.0)))
    bm_to_obj(bm, 'fountain_stone', col, M['plain'])
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=72, radius=R0, matrix=Matrix.Translation((fx, fy, z + 0.7)))
    for rad, dz in ((3.95, 3.08), (2.1, 5.46)):
        bmesh.ops.create_circle(bm, cap_ends=True, segments=40, radius=rad, matrix=Matrix.Translation((fx, fy, z + dz)))
    bm_to_obj(bm, 'fountain_water', col, M['pool'])
    # 水：中心高喷、石盘溢流水帘、12 道弧形水柱
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.35, radius2=0.06, depth=5.0, matrix=Matrix.Translation((fx, fy, z + 7.0 + 2.5)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.9, radius2=0.2, depth=0.9, matrix=Matrix.Translation((fx, fy, z + 12.0)))
    for rad, z0, z1 in ((4.2, 3.0, 0.75), (2.3, 5.4, 3.1)):
        a2 = np.linspace(0, 2 * math.pi, 49)
        top = [bm.verts.new((fx + rad * math.cos(a), fy + rad * math.sin(a), z + z0)) for a in a2]
        bot = [bm.verts.new((fx + rad * 1.08 * math.cos(a), fy + rad * 1.08 * math.sin(a), z + z1)) for a in a2]
        for i in range(48):
            bm.faces.new([top[i], top[i + 1], bot[i + 1], bot[i]])
    bm_to_obj(bm, 'fountain_spray', col, M['spray'])
    for k in range(12):
        a = 2 * math.pi * k / 12
        pts = []
        for t in np.linspace(0, 1, 14):
            rr = R0 - 0.3 - t * 4.2
            pts.append((fx + rr * math.cos(a), fy + rr * math.sin(a), z + 0.9 + 3.2 * 4 * t * (1 - t) - 0.2 * t))
        sweep(f'fountain_jet{k}', pts, [(-0.07, 0), (0, 0.1), (0.07, 0), (0, -0.1)], M['spray'], col, closed=True)


def _hedge_rect(bm, cx, cy, w, d, hw=0.35, h=0.8):
    for (x0, y0, x1, y1) in ((cx - w / 2, cy - d / 2, cx + w / 2, cy - d / 2 + 2 * hw), (cx - w / 2, cy + d / 2 - 2 * hw, cx + w / 2, cy + d / 2),
                             (cx - w / 2, cy - d / 2, cx - w / 2 + 2 * hw, cy + d / 2), (cx + w / 2 - 2 * hw, cy - d / 2, cx + w / 2, cy + d / 2)):
        _box(bm, x0, y0, -0.3, x1, y1, h)


def _cone(bm, x, y, z, r, h, seg=14):
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=0.05, depth=h, matrix=Matrix.Translation((x, y, z + h / 2)))


def parterres(col):
    """前庭两侧的黄杨花坛：外圈绿篱，十字砾石路分四块，每块绿篱镶边内种白 / 粉玫瑰（地表着色器 beds），角上锥形黄杨。"""
    M = mats()
    bm = bmesh.new()
    z = L.TERRACE_Z
    for gid, _, kind, (cx, cy), (hx, hy), _r in L.GARDENS:
        if gid not in ('rose', 'rose_w'):
            continue
        w, d = 2 * hx, 2 * hy
        _hedge_rect(bm, cx, cy, w, d, 0.4, 0.9)
        # 四块花床的绿篱镶边（留出 3 m 十字路 + 2 m 外圈路）
        bw, bd = (w - 2 * 2.6 - 3.0) / 2, (d - 2 * 2.6 - 3.0) / 2
        for sx in (-1, 1):
            for sy in (-1, 1):
                bx, by = cx + sx * (1.5 + bw / 2), cy + sy * (1.5 + bd / 2)
                _hedge_rect(bm, bx, by, bw, bd, 0.3, 0.6)
                # 花床中心的圆形绿篱小圈 + 中心锥形树
                _cone(bm, bx, by, 0.0, 0.9, 2.6)
        for sx in (-1, 1):
            for sy in (-1, 1):
                _cone(bm, cx + sx * (w / 2 + 1.4), cy + sy * (d / 2 + 1.4), 0.0, 1.1, 3.2)
    for ob_z in (z,):
        pass
    ob = bm_to_obj(bm, 'parterre_hedges', col, M['hedge'])
    ob.location.z = z
    # 花坛中心：小水盘
    bm = bmesh.new()
    bw_ = bmesh.new()
    for gid, _, kind, (cx, cy), (hx, hy), _r in L.GARDENS:
        if gid not in ('rose', 'rose_w'):
            continue
        bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=1.4, radius2=1.4, depth=0.6, matrix=Matrix.Translation((cx, cy, z + 0.3)))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.25, radius2=0.2, depth=1.4, matrix=Matrix.Translation((cx, cy, z + 1.0)))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.7, radius2=0.5, depth=0.25, matrix=Matrix.Translation((cx, cy, z + 1.8)))
        bmesh.ops.create_circle(bw_, cap_ends=True, segments=32, radius=1.2, matrix=Matrix.Translation((cx, cy, z + 0.55)))
    bm_to_obj(bm, 'parterre_basins', col, M['plain'])
    bm_to_obj(bw_, 'parterre_basin_water', col, M['pool'])


def esplanade_hedges(col):
    """大道两侧：低绿篱镶边的花境 + 每 20 m 一对锥形黄杨（替换 r2 的空草坪边）。"""
    M = mats()
    bm = bmesh.new()
    for sx in (-1, 1):
        for y0 in np.arange(-246, -150, 20.0):
            for y in (y0, y0 + 10):
                zz = L.ground_z(sx * 25.5, y)
                _box(bm, sx * 25.5 - 0.35, y - 0.2, zz - 0.4, sx * 25.5 + 0.35, y + 10.2, zz + 0.55)
                zz2 = L.ground_z(sx * 29.5, y)
                _box(bm, sx * 29.5 - 0.35, y - 0.2, zz2 - 0.4, sx * 29.5 + 0.35, y + 10.2, zz2 + 0.55)
            zz = L.ground_z(sx * 24.5, y0)
            _cone(bm, sx * 24.2, y0, zz, 0.8, 2.6)
    bm_to_obj(bm, 'esplanade_hedges', col, M['hedge'])


def vignette_terrace(col):
    """东翼柱廊前的磨面石灰岩露台（r3 人眼小景）：石板铺地 + 外沿矮石栏 + 石瓶。"""
    M = mats()
    z = L.PLATEAU_Z
    bm = bmesh.new()
    x0, x1, y0, y1 = 16.0, 50.0, -29.0, -17.0
    _box(bm, x0, y0, z - 0.6, x1, y1, z + 0.12)
    ob = bm_to_obj(bm, 'terrace_paving', col, M['honed'])
    bm = bmesh.new()
    _box(bm, x0 - 0.3, y0 - 0.35, z - 0.6, x1 + 0.3, y0, z + 0.3)           # 外沿压边石
    for x in (x0 + 0.2, x1 - 0.2):
        _box(bm, x - 0.45, y0 - 0.3, z + 0.12, x + 0.45, y0 + 0.6, z + 1.0)
        bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.25, radius2=0.45, depth=0.7, matrix=Matrix.Translation((x, y0 + 0.15, z + 1.35)))
    bm_to_obj(bm, 'terrace_edge', col, M['plain'])


def build(col):
    vignette_terrace(col)
    imperial_stairs(col)
    fountain(col)
    parterres(col)
    esplanade_hedges(col)
