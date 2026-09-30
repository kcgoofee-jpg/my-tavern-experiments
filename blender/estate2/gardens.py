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
        # 顶部平台（r5 修）：只贴到墙面、不插进墙体；台面与压顶同高，另铺一块门槛石板跨过压顶盖住草坪边
        xa, xb = s * x_hi, s * (x_hi + STAIR_HEAD_W)
        yw = min(wall_y(xa), wall_y(xb))
        _box(bm, min(xa, xb), yw - wid, zb - 0.6, max(xa, xb), yw + 0.3, zt + 0.05)
        _box(bt, min(xa, xb) + 0.3, yw - 0.4, zt - 0.3, max(xa, xb) - 0.3, yw + 1.8 + 1.6, zt + 0.1)
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
        x2 = s * (x_hi + STAIR_HEAD_W)
        yl = yw - wid + 0.15
        baluster_run(bb, (s * x_hi, yl), (x2 - s * 0.5, yl), zt + 0.05, h=1.0)
        baluster_run(bb, (x2 - s * 0.35, yl + 0.5), (x2 - s * 0.35, yw - 0.4), zt + 0.05, h=1.0)
        for px, py in ((s * x_hi, yl), (x2 - s * 0.35, yl)):   # 平台两角墩柱 + 石瓶，栏杆落在墩柱之间
            _box(bb, px - 0.4, py - 0.4, zt + 0.05, px + 0.4, py + 0.4, zt + 1.3)
            bmesh.ops.create_uvsphere(bb, u_segments=12, v_segments=8, radius=0.35, matrix=Matrix.Translation((px, py, zt + 1.7)))
        stair_head_pavilion(col, s * (x_hi + STAIR_HEAD_W / 2), yw)
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


STAIR_HEAD_W = 5.5   # 顶部平台沿墙长度


def stair_head_pavilion(col, cx, yw):
    """r5：梯顶小亭。退到台地里（离墙外皮 7.3 m，离草坪边 5.5 m），4 根塔斯干柱 + 檐部 + 低四坡石板顶；门槛石板到亭子铺一条 2.4 m 石径。"""
    M = mats()
    zt = L.PLATEAU_Z
    cy = yw + 1.8 + 3.0 + 2.6
    a, h = 2.6, 3.4
    bm = bmesh.new()
    _box(bm, cx - a - 0.4, cy - a - 0.4, zt - 0.3, cx + a + 0.4, cy + a + 0.4, zt + 0.35)          # 台基
    _box(bm, cx - 1.2, yw + 1.8 + 1.4, zt - 0.2, cx + 1.2, cy - a - 0.4, zt + 0.08)                   # 石径
    for sx in (-1, 1):
        for sy in (-1, 1):
            px, py = cx + sx * (a - 0.3), cy + sy * (a - 0.3)
            _box(bm, px - 0.38, py - 0.38, zt + 0.35, px + 0.38, py + 0.38, zt + 0.6)
            bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.3, radius2=0.25, depth=h - 0.5,
                                  matrix=Matrix.Translation((px, py, zt + 0.6 + (h - 0.5) / 2)))
    _box(bm, cx - a, cy - a, zt + h + 0.35, cx + a, cy + a, zt + h + 0.95)                          # 檐部
    _box(bm, cx - a - 0.25, cy - a - 0.25, zt + h + 0.95, cx + a + 0.25, cy + a + 0.25, zt + h + 1.15)   # 檐口
    bm_to_obj(bm, 'stair_head_pavilion', col, M['plain'])
    rb = bmesh.new()
    zr, e = zt + h + 1.15, a + 0.25
    v = [rb.verts.new(p) for p in ((cx - e, cy - e, zr), (cx + e, cy - e, zr), (cx + e, cy + e, zr), (cx - e, cy + e, zr), (cx, cy, zr + 1.3))]
    for i in range(4):
        rb.faces.new([v[i], v[(i + 1) % 4], v[4]])
    rb.faces.new(v[3::-1])
    bm_to_obj(rb, 'stair_head_pavilion_roof', col, M['slate'])


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


def canal(col):
    """r4 大道中轴：6 m 宽跌水水渠，分 9 段（每段平水面 + 石压顶），每段之间 0.4–1.3 m 小跌水；两端圆池。"""
    M = mats()
    bmS, bmW = bmesh.new(), bmesh.new()
    ys = np.linspace(-246, -152, 10)
    for y0, y1 in zip(ys[:-1], ys[1:]):
        z = L.ground_z(0, (y0 + y1) / 2) - 0.1
        _box(bmS, -3.6, y0, z - 1.5, 3.6, y1, z - 0.2)    # 槽底
        for sx in (-1, 1):
            _box(bmS, sx * 2.9, y0, z - 0.2, sx * 3.6, y1, z + 0.35)   # 石压顶
        bmW.faces.new([bmW.verts.new(v) for v in [(-2.9, y0 + 0.4, z + 0.22), (2.9, y0 + 0.4, z + 0.22), (2.9, y1 - 0.4, z + 0.22), (-2.9, y1 - 0.4, z + 0.22)]])
        _box(bmS, -3.6, y1 - 0.3, z - 0.2, 3.6, y1, z + 0.3)   # 跌水堰
    for yc in (-250.0, -148.0):
        z = L.ground_z(0, yc) - 0.1
        bmesh.ops.create_cone(bmS, cap_ends=True, segments=48, radius1=6.5, radius2=6.5, depth=1.6, matrix=Matrix.Translation((0, yc, z - 0.4)))
        bmesh.ops.create_circle(bmW, cap_ends=True, segments=48, radius=5.8, matrix=Matrix.Translation((0, yc, z + 0.43)))
        bmesh.ops.create_cone(bmS, cap_ends=True, segments=16, radius1=0.7, radius2=0.5, depth=1.6, matrix=Matrix.Translation((0, yc, z + 1.0)))
    bm_to_obj(bmS, 'canal_stone', col, M['plain'])
    bm_to_obj(bmW, 'canal_water', col, M['pool'])


def tennis(col):
    """r4 网球场：硬地（深绿外场 + 蓝色内场）+ 白线 + 绿色围网立柱。"""
    from .common import mat_new
    court, t = mat_new('e2_court')
    if t is not None:
        t.bsdf((200, 0), Roughness=0.8, **{'Base Color': (0.42, 0.14, 0.07, 1)})
    inner, t = mat_new('e2_court_in')
    if t is not None:
        t.bsdf((200, 0), Roughness=0.8, **{'Base Color': (0.5, 0.18, 0.08, 1)})
    white, t = mat_new('e2_line')
    if t is not None:
        t.bsdf((200, 0), Roughness=0.6, **{'Base Color': (0.9, 0.9, 0.88, 1)})
    M = mats()
    for i, (cx, cy, a) in enumerate(L.COURTS):
        z = L.ground_z(cx, cy) + 0.05
        rot = math.radians(a)
        parts = {}
        bm = bmesh.new(); _box(bm, -9.1, -18.3, -2.5, 9.1, 18.3, 0.1); parts['court'] = (bm, court)
        bm = bmesh.new(); _box(bm, -5.49, -11.89, 0.1, 5.49, 11.89, 0.12); parts['in'] = (bm, inner)
        bm = bmesh.new()
        lw = 0.05
        for x in (-5.49, -4.11, 4.11, 5.49):
            _box(bm, x - lw, -11.89, 0.12, x + lw, 11.89, 0.14)
        for y in (-11.89, 11.89, -6.4, 6.4):
            _box(bm, -5.49 if abs(y) > 7 else -4.11, y - lw, 0.12, 5.49 if abs(y) > 7 else 4.11, y + lw, 0.14)
        _box(bm, -lw, -6.4, 0.12, lw, 6.4, 0.14)
        _box(bm, -6.4, -0.05, 0.12, 6.4, 0.05, 1.0)   # 球网
        parts['line'] = (bm, white)
        bm = bmesh.new()
        for x in np.linspace(-9.1, 9.1, 7):
            for y in (-18.3, 18.3):
                _box(bm, x - 0.06, y - 0.06, 0, x + 0.06, y + 0.06, 3.5)
        for y in np.linspace(-18.3, 18.3, 12):
            for x in (-9.1, 9.1):
                _box(bm, x - 0.06, y - 0.06, 0, x + 0.06, y + 0.06, 3.5)
        parts['post'] = (bm, M['steel'])
        for k, (bm, m) in parts.items():
            ob = bm_to_obj(bm, f'tennis{i}_{k}', col, m)
            ob.location = (cx, cy, z); ob.rotation_euler.z = rot


def pergolas(col):
    """r4 玫瑰园北侧木构藤架：石柱 + 木梁 + 横条（俯视成细密条纹），上面零星爬藤。"""
    M = mats()
    bmS, bmW = bmesh.new(), bmesh.new()
    z = L.TERRACE_Z
    for gid, _, kind, (cx, cy), (hx, hy), _r in L.GARDENS:
        if gid not in ('rose', 'rose_w'):
            continue
        y = cy + hy + 3.8
        x0, x1 = cx - hx - 2, cx + hx + 2
        for x in np.arange(x0, x1 + 0.1, 3.6):
            for yy in (y - 1.6, y + 1.6):
                _box(bmS, x - 0.25, yy - 0.25, z, x + 0.25, yy + 0.25, z + 2.8)
        for yy in (y - 1.6, y + 1.6):
            _box(bmW, x0 - 0.4, yy - 0.12, z + 2.8, x1 + 0.4, yy + 0.12, z + 3.1)
        for x in np.arange(x0, x1, 0.6):
            _box(bmW, x - 0.05, y - 2.3, z + 3.1, x + 0.05, y + 2.3, z + 3.25)
    bm_to_obj(bmS, 'pergola_posts', col, M['plain'])
    bm_to_obj(bmW, 'pergola_beams', col, M['wood'])


def parterre_box(col):
    """r4 花坛内的修剪黄杨图案：每块花床一圈内框 + 对角交叉 + 中心圆环（俯视可读的几何纹）。"""
    M = mats()
    bm = bmesh.new()
    z = L.TERRACE_Z
    for gid, _, kind, (cx, cy), (hx, hy), _r in L.GARDENS:
        if gid not in ('rose', 'rose_w'):
            continue
        w, d = 2 * hx, 2 * hy
        bw, bd = (w - 2 * 2.6 - 3.0) / 2, (d - 2 * 2.6 - 3.0) / 2
        for sx in (-1, 1):
            for sy in (-1, 1):
                bx, by = cx + sx * (1.5 + bw / 2), cy + sy * (1.5 + bd / 2)
                _hedge_rect(bm, bx, by, bw - 2.2, bd - 2.2, 0.22, 0.45)
                from .buildings import _bar
                for a, b in (((bx - bw / 2 + 0.6, by - bd / 2 + 0.6), (bx + bw / 2 - 0.6, by + bd / 2 - 0.6)),
                             ((bx - bw / 2 + 0.6, by + bd / 2 - 0.6), (bx + bw / 2 - 0.6, by - bd / 2 + 0.6))):
                    _bar(bm, (a[0], a[1], 0.2), (b[0], b[1], 0.2), 0.4, 0.45)
                bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=1.6, radius2=1.6, depth=0.5, matrix=Matrix.Translation((bx, by, 0.2)))
    ob = bm_to_obj(bm, 'parterre_box', col, M['hedge'])
    ob.location.z = z


def kerbs(col):
    """r4b 主车道两侧石路缘（0.3 m 宽，高出 0.15 m），375 px 下给路一条亮边。"""
    M = mats()
    for k, (pts, w) in enumerate(L.DRIVES[:4]):
        from .buildings import _resample
        ss = _resample(pts, 2.0)
        for sgn in (-1, 1):
            q = []
            for j, (x, y) in enumerate(ss):
                a = ss[max(j - 1, 0)]; b = ss[min(j + 1, len(ss) - 1)]
                tx, ty = b[0] - a[0], b[1] - a[1]; ln = math.hypot(tx, ty) or 1
                px, py = x - ty / ln * sgn * (w / 2 + 0.15), y + tx / ln * sgn * (w / 2 + 0.15)
                q.append((px, py, L.ground_z(px, py) + 0.02))
            sweep(f'kerb{k}_{sgn}', q, [(-0.18, -0.3), (-0.18, 0.15), (0.18, 0.15), (0.18, -0.3)], M['ashlar'], col)


def grey_terraces(col):
    """r4b Greystone 下方台地花园：修剪黄杨方格 + 中轴园路 + 两排修剪紫杉锥。"""
    M = mats()
    p = [q for q in L.PADS if q['id'] == 'grey_t1'][0]
    (cx, cy), (w, d), rot = p['c'], p['s'], p['rot']
    z = p['zv']
    bm = bmesh.new()
    for i in (0, 1, 4, 5):
        for j in range(2):
            bx = -w / 2 + 6 + i * (w - 12) / 5.0
            by = -d / 2 + 5.5 + j * (d - 11)
            _hedge_rect(bm, bx, by, 8, 7, 0.3, 0.6)
            _cone(bm, bx, by, 0.0, 0.8, 2.4)
    ob = bm_to_obj(bm, 'grey_terr_box', col, M['hedge'])
    ob.location = (cx, cy, z); ob.rotation_euler.z = rot


def helipad(col):
    """r4d 载具停靠坪（src: user）：混凝土圆台 + 白圈 + H 标记（悬浮载具库旁，和停靠平台 O-03 分开；不放飞行器）。"""
    M = mats()
    x, y, r = L.HELIPAD
    z = L.ground_z(x, y)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=r, radius2=r, depth=1.4, matrix=Matrix.Translation((x, y, z - 0.5)))
    bm_to_obj(bm, 'helipad_deck', col, M['concrete'])
    from .common import mat_new
    wm, t = mat_new('e2_line_w')
    if t is not None:
        t.bsdf((200, 0), Roughness=0.6, **{'Base Color': (0.92, 0.92, 0.9, 1)})
    bm = bmesh.new()
    for k in range(64):
        a0, a1 = 2 * math.pi * k / 64, 2 * math.pi * (k + 1) / 64
        from .buildings import _bar
        _bar(bm, (x + (r - 1.2) * math.cos(a0), y + (r - 1.2) * math.sin(a0), z + 0.22), (x + (r - 1.2) * math.cos(a1), y + (r - 1.2) * math.sin(a1), z + 0.22), 0.5, 0.04)
    _box(bm, x - 3.2, y - 4.5, z + 0.2, x - 2.0, y + 4.5, z + 0.24)
    _box(bm, x + 2.0, y - 4.5, z + 0.2, x + 3.2, y + 4.5, z + 0.24)
    _box(bm, x - 2.0, y - 0.6, z + 0.2, x + 2.0, y + 0.6, z + 0.24)
    bm_to_obj(bm, 'helipad_marks', col, wm)


def dairy(col):
    """r4d 奶牛农场：导入 props/dairy_parlour 的整套（由 e4r/dairy_save.py 另跑 build.py 存成 .blend，不改原文件）。"""
    import os
    path = os.environ.get('E2_DAIRY_BLEND', '')
    if not path or not os.path.exists(path):
        print('[dairy] Error: 缺奶牛农场 .blend（E2_DAIRY_BLEND），成图 / glb 里不会有奶牛农场'); return   # r5：日志检查（grep Error）能抓到
    with bpy.data.libraries.load(path) as (src, dst):
        dst.objects = [n for n in src.objects if n != 'ground']
    fx, fy, rd = L.DAIRY
    z = L.ground_z(fx, fy)
    emp = bpy.data.objects.new('dairy_root', None); col.objects.link(emp)
    emp.location = (fx, fy, z); emp.rotation_euler.z = math.radians(rd)
    fc = bpy.data.collections.new('dairy'); col.children.link(fc)
    for o in dst.objects:
        if o is None or o.type in ('CAMERA', 'LIGHT'):
            continue
        fc.objects.link(o)
        if o.parent is None:
            o.parent = emp
    print(f'[dairy] {len(dst.objects)} 件')


def _gsw(u, v):
    a = math.radians(L.GS_ROT)
    return L.GS_C[0] + u * math.cos(a) - v * math.sin(a), L.GS_C[1] + u * math.sin(a) + v * math.cos(a)


def greystone_gardens(col):
    """r4d Greystone 园林（Thiene 式）：上台地黄杨花坛 + 长倒影池 + 喷泉；车场圆形喷泉；南侧双石阶；下花园锦鲤倒影池；跌水溪。"""
    M = mats()
    rot = math.radians(L.GS_ROT)
    up = [q for q in L.PADS if q['id'] == 'gs_upper'][0]
    zu = up['zv']
    bmh, bms, bmw = bmesh.new(), bmesh.new(), bmesh.new()
    yew = bmesh.new()   # r5（遗留：光滑锥体）：柱状紫杉改成两团叠放的不规则叶团
    cx, cy = up['c']
    def put(bm, M_):
        bmesh.ops.transform(bm, matrix=M_, verts=bm.verts)
    # 上台地：中轴长倒影池 30 × 4 + 两端喷泉；两侧四块黄杨花坛
    loc = Matrix.Translation((cx, cy, zu)) @ Matrix.Rotation(rot, 4, 'Z')
    a, b, w_ = bmesh.new(), bmesh.new(), bmesh.new()
    _box(a, -16, -2.8, -0.6, 16, 2.8, 0.35)
    w_.faces.new([w_.verts.new(v) for v in [(-15.3, -2.1, 0.4), (15.3, -2.1, 0.4), (15.3, 2.1, 0.4), (-15.3, 2.1, 0.4)]])
    for sx in (-1, 1):
        bmesh.ops.create_cone(a, cap_ends=True, segments=32, radius1=2.6, radius2=2.6, depth=0.7, matrix=Matrix.Translation((sx * 19, 0, 0)))
        bmesh.ops.create_circle(w_, cap_ends=True, segments=32, radius=2.2, matrix=Matrix.Translation((sx * 19, 0, 0.37)))
        bmesh.ops.create_cone(a, cap_ends=True, segments=12, radius1=0.35, radius2=0.25, depth=2.0, matrix=Matrix.Translation((sx * 19, 0, 1.0)))
        for sy in (-1, 1):
            _hedge_rect(b, sx * 8, sy * 7.5, 13, 5.5, 0.3, 0.6)
            _hedge_rect(b, sx * 8, sy * 7.5, 8, 2.5, 0.25, 0.5)
            for k in range(4):
                x_, y_ = sx * (3 + k * 3.5), sy * 11   # 柱状紫杉
                for zc, rr, hh in ((0.95, 0.72, 1.25), (2.15, 0.56, 1.05)):
                    bmesh.ops.create_icosphere(yew, subdivisions=2, radius=1.0, matrix=Matrix.Translation((x_, y_, zc)) @ Matrix.Diagonal((rr, rr, hh, 1)))
    for v in yew.verts:   # 叶团表面起伏（按位置的确定性扰动）
        f = 1.0 + 0.09 * math.sin(v.co.x * 7.1 + v.co.z * 5.3) * math.cos(v.co.y * 6.7 - v.co.z * 3.1)
        v.co.x *= f; v.co.y *= f
    for bm_ in (a, b, w_, yew):
        put(bm_, loc)
    bm_to_obj(a, 'gs_upper_stone', col, M['wallstone'])   # r5（遗留：台阶 / 石作纯白）：Greystone 园林石作改暖灰旧石
    bm_to_obj(b, 'gs_upper_box', col, M['hedge'])
    bm_to_obj(yew, 'gs_upper_yews', col, M['hedge'])
    bm_to_obj(w_, 'gs_upper_water', col, M['pool'])
    # 车场：圆形石铺 + 中央喷泉
    mx, my = [q for q in L.PADS if q['id'] == 'gs_motor'][0]['c']
    zm = L.ground_z(mx, my)
    a, w_ = bmesh.new(), bmesh.new()
    bmesh.ops.create_cone(a, cap_ends=True, segments=40, radius1=3.2, radius2=3.2, depth=0.8, matrix=Matrix.Translation((mx, my, zm)))
    bmesh.ops.create_cone(a, cap_ends=True, segments=16, radius1=0.4, radius2=0.3, depth=2.2, matrix=Matrix.Translation((mx, my, zm + 1.2)))
    bmesh.ops.create_circle(w_, cap_ends=True, segments=40, radius=2.8, matrix=Matrix.Translation((mx, my, zm + 0.42)))
    bm_to_obj(a, 'gs_motor_fountain', col, M['wallstone']); bm_to_obj(w_, 'gs_motor_water', col, M['pool'])
    # 南侧弧形双石阶（主楼台地 → 下花园）
    hz = [q for q in L.PADS if q['id'] == 'grey_house'][0]['zv']
    lz = [q for q in L.PADS if q['id'] == 'grey_t1'][0]['zv']
    a = bmesh.new()
    for sx in (-1, 1):
        for k in range(10):
            t = k / 10
            u = sx * (14 + 6 * math.sin(t * math.pi / 2)); v = -29.5 - t * 7
            z = hz - (hz - lz) * t
            x, y = _gsw(u, v)
            _box(a, x - 3, y - 0.5, z - 3, x + 3, y + 0.5, z)
    bm_to_obj(a, 'gs_stairs', col, M['wallstone'])
    # 下花园：中央锦鲤倒影池 26 × 6（加锦鲤）
    lo = [q for q in L.PADS if q['id'] == 'grey_t1'][0]
    loc = Matrix.Translation((*lo['c'], lz)) @ Matrix.Rotation(rot, 4, 'Z')
    a, w_, f = bmesh.new(), bmesh.new(), bmesh.new()
    _box(a, -13.6, -3.6, -0.6, 13.6, 3.6, 0.35)
    w_.faces.new([w_.verts.new(v) for v in [(-13, -3, 0.4), (13, -3, 0.4), (13, 3, 0.4), (-13, 3, 0.4)]])
    rs = np.random.RandomState(9)
    for k in range(18):
        bmesh.ops.create_icosphere(f, subdivisions=1, radius=0.22, matrix=Matrix.Translation((rs.uniform(-12, 12), rs.uniform(-2.5, 2.5), 0.42)) @ Matrix.Rotation(rs.uniform(0, 3), 4, 'Z') @ Matrix.Diagonal((2.2, 0.8, 0.3, 1)))
    for bm_ in (a, w_, f):
        put(bm_, loc)
    bm_to_obj(a, 'gs_lower_pool_stone', col, M['wallstone'])
    from .common import mat_new
    kd, t = mat_new('e2_koi_water')
    if t is not None:
        t.bsdf((200, 0), Roughness=0.03, **{'Base Color': (0.03, 0.08, 0.06, 1)})
    bm_to_obj(w_, 'gs_lower_pool_water', col, kd)
    km, t = mat_new('e2_koi')
    if t is not None:
        t.bsdf((200, 0), Roughness=0.4, **{'Base Color': (0.9, 0.35, 0.05, 1)})
    bm_to_obj(f, 'gs_lower_koi', col, km)
    # 跌水溪：沿坡一串小池（岩边）+ 池间白水
    a, w_, sp = bmesh.new(), bmesh.new(), bmesh.new()
    pts = L.GS_CASCADE
    prev = None
    for i, (x, y) in enumerate(pts[:-1]):
        z = L.ground_z(x, y)
        r = 3.2 + 0.6 * (i % 2)
        for k in range(10):
            ang = 2 * math.pi * k / 10
            bmesh.ops.create_icosphere(a, subdivisions=1, radius=rs.uniform(0.6, 1.1), matrix=Matrix.Translation((x + (r + 0.5) * math.cos(ang), y + (r + 0.5) * math.sin(ang), z + 0.1)))
        bmesh.ops.create_circle(w_, cap_ends=True, segments=24, radius=r, matrix=Matrix.Translation((x, y, z + 0.15)))
        if prev:
            px_, py_, pz = prev
            dx, dy = x - px_, y - py_; ln = math.hypot(dx, dy)
            nx, ny = -dy / ln * 0.8, dx / ln * 0.8
            v = [sp.verts.new(p) for p in [(px_ + nx, py_ + ny, pz + 0.2), (px_ - nx, py_ - ny, pz + 0.2), (x - nx, y - ny, z + 0.2), (x + nx, y + ny, z + 0.2)]]
            sp.faces.new(v)
        prev = (x, y, z)
    bm_to_obj(a, 'gs_cascade_rocks', col, M['rock'])
    bm_to_obj(w_, 'gs_cascade_water', col, M['pool'])
    bm_to_obj(sp, 'gs_cascade_white', col, M['spray'])


def build(col):
    greystone_gardens(col)
    helipad(col)
    dairy(col)
    kerbs(col)
    grey_terraces(col)
    canal(col)
    tennis(col)
    pergolas(col)
    parterre_box(col)
    pass   # r4：露台小景暂时不做（用户定）
    imperial_stairs(col)
    fountain(col)
    parterres(col)
    esplanade_hedges(col)
