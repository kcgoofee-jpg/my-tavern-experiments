"""地下医疗中心（B2）：庄园的急救 / 医疗设施（2088 年：再生医学、假肢与仿生肢适配、诊断）。
房间多边形取 map/data/eden_estate_rooms.json（blender/estate2/floorplans.py 生成，kind=medical）：
  医疗中心前厅 / 器械洗消间 / 缓冲更衣间 / 无菌处置室。坐标 = 庄园坐标（x 东、y 北、米），B2 楼面 = 主楼 F1 − 9.0 m。
内容规则：只放中性、真实的医疗设备（无任何束缚件；床 / 台上没有绑带）。参考板 docs/b2-medical-references.md。

复用（合进主楼室内 glb）：
    from estate2 import medical_b2
    medical_b2.build(col, f1_z=主楼 F1 楼面标高)      # 返回对象列表；f1_z 省略时按 buildings.site_z 算
草图渲染（单独跑，不依赖地形 / 植被）：
    blender -b --python-expr "import runpy,sys;sys.argv=['x','--','--view','cleanroom','--out','/tmp/a.jpg'];runpy.run_path('blender/estate2/medical_b2.py',run_name='__main__')"
"""
import json, math, os, sys
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
import tc_common

import bpy, bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if __name__ == '__main__':
    sys.path.insert(0, os.path.dirname(HERE))
    from estate2.common import mat_new, bm_to_obj, coll   # noqa: E402
else:
    from .common import mat_new, bm_to_obj, coll

B2_DZ = -9.0       # B2 楼面相对 F1
CLEAR = 3.0        # 净高（上面是 1.5 m 设备层：洁净送风、医用气体、电缆桥架）
WALL_T = 0.2
ROOMS_JSON = os.path.join(ROOT, 'map', 'data', 'eden_estate_rooms.json')
NAMES = ('医疗中心前厅', '器械洗消间', '缓冲更衣间', '无菌处置室')


def rooms():
    d = json.load(open(ROOMS_JSON, encoding='utf-8'))
    out = {}
    for r in d['rooms']:
        if r['floor'] == 'B2' and r['name'] in NAMES:
            xs = [p[0] for p in r['poly']]; ys = [p[1] for p in r['poly']]
            out[r['name']] = (min(xs), max(xs), min(ys), max(ys))
    assert len(out) == len(NAMES), f'eden_estate_rooms.json 缺医疗中心房间：{set(NAMES) - set(out)}'
    return out


# ---------------------------------------------------------------- 材质（显式 Principled）
_M = {}


def mat(name, rgb, rough=0.5, metal=0.0, emit=0.0, trans=0.0, coat=0.0):
    key = 'b2m_' + name
    if key in _M:
        return _M[key]
    m, t = mat_new(key)
    if t is not None:
        kw = {'Base Color': (*rgb, 1), 'Roughness': rough, 'Metallic': metal}
        b = t.bsdf((200, 0), **kw)
        if emit:
            b.inputs['Emission Color'].default_value = (*rgb, 1)
            b.inputs['Emission Strength'].default_value = emit
        if trans:
            b.inputs['Transmission Weight'].default_value = trans
            b.inputs['IOR'].default_value = 1.5
        if coat:
            b.inputs['Coat Weight'].default_value = coat
    _M[key] = m
    return m


def mats():
    return dict(
        vinyl=mat('vinyl', (0.33, 0.35, 0.35), 0.55, coat=0.05),          # 无缝 PVC 卷材，浅灰蓝
        vinyl_dk=mat('vinyl_dk', (0.22, 0.27, 0.29), 0.5),              # 踢脚圆弧收边、导向色带
        panel=mat('panel', (0.72, 0.71, 0.68), 0.45, coat=0.1),         # 洁净板墙（抗菌涂层钢板）
        seam=mat('seam', (0.30, 0.32, 0.33), 0.5),
        ceil=mat('ceil', (0.74, 0.75, 0.75), 0.6),
        led=mat('led', (0.93, 0.96, 1.0), 0.3, emit=1.8),                # 冷白 LED 平板
        vinyl_cl=mat('vinyl_cl', (0.30, 0.34, 0.35), 0.55, coat=0.05),   # 洁侧卷材（换色 = 脏 / 洁分界）
        grille=mat('grille', (0.6, 0.62, 0.63), 0.45, 0.6),
        led_soft=mat('led_soft', (0.9, 0.94, 1.0), 0.3, emit=1.4),
        steel=mat('steel', (0.78, 0.79, 0.80), 0.22, 1.0),              # 不锈钢
        brushed=mat('brushed', (0.70, 0.71, 0.72), 0.35, 0.85),
        white=mat('white', (0.74, 0.75, 0.76), 0.4),                    # 设备外壳
        grey=mat('grey', (0.35, 0.37, 0.39), 0.4),
        dark=mat('dark', (0.05, 0.055, 0.06), 0.35),
        glass=mat('glass', (0.55, 0.62, 0.64), 0.05, trans=0.6),
        screen=mat('screen', (0.05, 0.16, 0.2), 0.15, emit=0.5),         # 监护 / 显示屏（青色 UI）
        screen_g=mat('screen_g', (0.05, 0.2, 0.1), 0.15, emit=0.5),
        pad=mat('pad', (0.16, 0.30, 0.38), 0.55),                        # 手术台垫（深蓝灰聚氨酯）
        red=mat('red', (0.62, 0.06, 0.05), 0.4),                         # 抢救车
        yellow=mat('yellow', (0.85, 0.66, 0.08), 0.45),                  # 除颤仪外壳 / 警示
        green_s=mat('green_s', (0.2, 0.75, 0.3), 0.3, emit=2.0),        # 门禁状态灯
        amber_s=mat('amber_s', (1.0, 0.55, 0.1), 0.3, emit=2.0),
        blue_gas=mat('gas_o2', (0.8, 0.8, 0.8), 0.3),
        gas_n2o=mat('gas_n2o', (0.1, 0.25, 0.6), 0.35),                   # N2O 蓝（ISO 32）
        chrome=mat('chrome', (0.85, 0.86, 0.87), 0.12, 1.0),
        teal=mat('teal', (0.16, 0.45, 0.48), 0.5),
        gown=mat('gown', (0.35, 0.55, 0.62), 0.85),                      # 一次性无纺布隔离衣（浅蓝）                       # 洁净服
        linen=mat('linen', (0.86, 0.88, 0.9), 0.8),
    )


# ---------------------------------------------------------------- 网格
class Kit:
    """按材质分桶的 bmesh；最后一次性成对象。坐标 = 庄园坐标（z 已含 B2 楼面）。"""

    def __init__(self, col, z0, prefix, for_web=False):
        self.col, self.z0, self.pre, self.b = col, z0, prefix, {}
        self.for_web = for_web

    def bm(self, k):
        if k not in self.b:
            self.b[k] = bmesh.new()
        return self.b[k]

    def box(self, k, x0, y0, z0, x1, y1, z1, cap_bottom=True):
        bm = self.bm(k); z0 += self.z0; z1 += self.z0
        x0, x1 = min(x0, x1), max(x0, x1); y0, y1 = min(y0, y1), max(y0, y1)
        if self.for_web and z0 <= self.z0 + 0.005:
            cap_bottom = False
        vs = [bm.verts.new(v) for v in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        faces = [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        if cap_bottom:
            faces.insert(0, (0, 3, 2, 1))
        for f in faces:
            bm.faces.new([vs[i] for i in f])

    def cyl(self, k, x, y, z0, z1, r, seg=24, axis='z', r2=None):
        bm = self.bm(k)
        m = Matrix.Translation((x, y, self.z0 + (z0 + z1) / 2 if axis == 'z' else self.z0 + z0))
        if axis == 'z':
            bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=z1 - z0, matrix=m)
        else:   # 沿 x / y 的圆柱：z0 = 中心高，z1 = 长度
            rot = Matrix.Rotation(math.pi / 2, 4, 'Y' if axis == 'x' else 'X')
            bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=z1, matrix=m @ rot)

    def done(self, M):
        obs = []
        for k, bm in self.b.items():
            obs.append(bm_to_obj(bm, f'{self.pre}_{k}', self.col, M[k]))
        self.b = {}
        return obs


# ---------------------------------------------------------------- 房间壳：墙（带门洞）、圆弧踢脚、吊顶 + LED 平板
def wall(K, x0, y0, x1, y1, gaps=(), h=CLEAR, t=WALL_T, head=2.2):
    """沿轴线的墙段；gaps = [(沿墙起点距, 终点距)]，门洞上方留门头。"""
    L = abs(x1 - x0) + abs(y1 - y0); horiz = abs(y1 - y0) < 1e-6
    cuts = [0.0] + [v for g in sorted(gaps) for v in g] + [L]
    lo = min(x0, x1) if horiz else min(y0, y1)
    for i in range(0, len(cuts), 2):
        a, b = lo + cuts[i], lo + cuts[i + 1]
        if b - a < 1e-3:
            continue
        if horiz:
            K.box('panel', a, y0 - t / 2, 0, b, y0 + t / 2, h)
        else:
            K.box('panel', x0 - t / 2, a, 0, x0 + t / 2, b, h)
    for g0, g1 in gaps:   # 门头
        a, b = lo + g0, lo + g1
        if horiz:
            K.box('panel', a, y0 - t / 2, head, b, y0 + t / 2, h)
        else:
            K.box('panel', x0 - t / 2, a, head, x0 + t / 2, b, h)


def shell(K, r, gaps):
    """房间壳：地面卷材、四周圆弧踢脚（卷材上翻 10 cm，45° 近似）、墙板竖缝、吊顶 + LED 平板。
    gaps: {'S'|'N'|'W'|'E': [(起, 止)]}（沿 x / y 增向）。墙画在房间内侧半厚，相邻房间各画一次（合成一堵 0.2 m 墙）。"""
    x0, x1, y0, y1 = r; t = WALL_T / 2
    if not K.for_web:
        K.box('vinyl', x0, y0, -0.02, x1, y1, 0.0)
    for side, (a0, b0, a1, b1) in dict(S=(x0, y0 + t / 2, x1, y0 + t / 2), N=(x0, y1 - t / 2, x1, y1 - t / 2),
                                        W=(x0 + t / 2, y0, x0 + t / 2, y1), E=(x1 - t / 2, y0, x1 - t / 2, y1)).items():
        wall(K, a0, b0, a1, b1, gaps.get(side, ()), t=t)
    ix0, ix1, iy0, iy1 = x0 + t, x1 - t, y0 + t, y1 - t
    # 防滑地面面层（EQ-51）：无缝防滑 PVC 卷材上的微凸防滑条带
    ny_steps = int((iy1 - iy0 - 0.6) / 1.2)
    for i in range(ny_steps):
        ny = iy0 + 0.3 + (i + 1) * (iy1 - iy0 - 0.6) / (ny_steps + 1)
        K.box('vinyl_dk', ix0 + 0.2, ny - 0.015, 0.0, ix1 - 0.2, ny + 0.015, 0.002)
    for (a, b, c, d) in ((ix0, iy0, ix1, iy0 + 0.06), (ix0, iy1 - 0.06, ix1, iy1), (ix0, iy0, ix0 + 0.06, iy1), (ix1 - 0.06, iy0, ix1, iy1)):
        K.box('vinyl_dk', a, b, 0.0, c, d, 0.1)                            # 圆弧踢脚（上翻卷材）
    if not K.for_web:
        for x in _steps(ix0, ix1, 1.2):                                        # 墙板竖缝（1.2 m 模数）
            for yy, s in ((iy0, 1), (iy1, -1)):
                K.box('seam', x - 0.004, yy, 0.1, x + 0.004, yy + s * 0.004, CLEAR)
        for y in _steps(iy0, iy1, 1.2):
            for xx, s in ((ix0, 1), (ix1, -1)):
                K.box('seam', xx, y - 0.004, 0.1, xx + s * 0.004, y + 0.004, CLEAR)
        K.box('ceil', x0, y0, CLEAR, x1, y1, CLEAR + 0.05)
    return ix0, ix1, iy0, iy1


def _steps(a, b, s):
    n = int((b - a) / s)
    return [a + (b - a) * (i + 1) / (n + 1) for i in range(n)] if n else []


def led_grid(K, x0, x1, y0, y1, nx, ny, w=1.2, d=0.6, skip=None):
    if K.for_web:
        return
    for i in range(nx):
        for j in range(ny):
            cx = x0 + (x1 - x0) * (i + 0.5) / nx; cy = y0 + (y1 - y0) * (j + 0.5) / ny
            if skip and skip(cx, cy):
                continue
            K.box('seam', cx - w / 2 - 0.02, cy - d / 2 - 0.02, CLEAR - 0.012, cx + w / 2 + 0.02, cy + d / 2 + 0.02, CLEAR)
            K.box('led', cx - w / 2, cy - d / 2, CLEAR - 0.02, cx + w / 2, cy + d / 2, CLEAR - 0.012)


def hermetic_door(K, x, y, along='x', w=1.4, glass_panel=True, state='green'):
    """气密推拉门（医院手术部密闭门）：门扇 + 视窗 + 顶部导轨罩 + 感应踢板 + 门禁状态灯。x, y = 门洞中心（墙轴线上）。"""
    t = 0.07
    if along == 'x':
        K.box('white', x - w / 2, y - 0.14, 0.0, x + w / 2, y - 0.14 + t, 2.18)        # 门扇贴墙南侧
        if glass_panel:
            K.box('glass', x - 0.25, y - 0.15, 1.2, x + 0.25, y - 0.06, 1.75)
        K.box('brushed', x - w / 2 - 0.1, y - 0.2, 2.18, x + w * 1.5 + 0.1, y - 0.1, 2.36)  # 导轨罩（门扇滑向东）
        K.box('brushed', x - w / 2, y - 0.145, 0.05, x + w / 2, y - 0.13, 0.35)            # 踢板
        K.box('steel', x + w / 2 - 0.12, y - 0.2, 0.9, x + w / 2 - 0.04, y - 0.14, 1.3)   # 竖拉手
        K.box('green_s' if state == 'green' else 'amber_s', x - 0.3, y - 0.21, 2.42, x + 0.3, y - 0.2, 2.47)
        K.box('dark', x + w / 2 + 0.25, y - 0.12, 1.1, x + w / 2 + 0.4, y - 0.1, 1.3)      # 刷卡 / 免触开门感应器
        K.box('screen_g', x + w / 2 + 0.28, y - 0.125, 1.15, x + w / 2 + 0.37, y - 0.12, 1.25)
    else:
        K.box('white', x + 0.07, y - w / 2, 0.0, x + 0.14, y + w / 2, 2.18)
        if glass_panel:
            K.box('glass', x + 0.06, y - 0.25, 1.2, x + 0.15, y + 0.25, 1.75)
        K.box('brushed', x + 0.1, y - w / 2 - 0.1, 2.18, x + 0.2, y + w * 1.5 + 0.1, 2.36)
        K.box('green_s', x + 0.2, y - 0.3, 2.42, x + 0.21, y + 0.3, 2.47)


# ---------------------------------------------------------------- 设备
def op_table(K, cx, cy):
    """电动手术 / 处置台（沿 y 放）：柱式底座 + 可分段台面 + 头板 + 侧轨（接附件用的标准侧轨，无任何绑带）。"""
    K.box('white', cx - 0.35, cy - 0.55, 0.0, cx + 0.35, cy + 0.55, 0.12)            # 底座
    K.box('white', cx - 0.16, cy - 0.3, 0.12, cx + 0.16, cy + 0.2, 0.62)             # 升降柱
    K.box('brushed', cx - 0.3, cy - 1.0, 0.62, cx + 0.3, cy + 1.0, 0.72)              # 台面骨架
    for y0, y1 in ((-1.0, -0.36), (-0.34, 0.44), (0.46, 0.98)):
        K.box('pad', cx - 0.27, cy + y0, 0.72, cx + 0.27, cy + y1, 0.8)
    K.box('pad', cx - 0.14, cy + 1.0, 0.7, cx + 0.14, cy + 1.3, 0.79)                 # 头板
    for s in (-1, 1):
        K.box('steel', cx + s * 0.31, cy - 0.95, 0.66, cx + s * 0.33, cy + 0.95, 0.69)  # 侧轨
    K.box('linen', cx - 0.26, cy - 0.98, 0.8, cx + 0.26, cy + 0.2, 0.805)              # 一次性铺单


def surgical_light(K, cx, cy):
    """双头 LED 无影灯：吸顶中心轴 + 两节平衡臂 + 两个灯头（下面发光）。"""
    K.cyl('white', cx, cy, CLEAR - 0.25, CLEAR, 0.12)
    K.cyl('brushed', cx, cy, CLEAR - 0.55, CLEAR - 0.25, 0.04)
    for dx, dy, hz, rr, ex in ((0.45, 0.35, 1.9, 0.55, (0.9, -0.3)), (-0.45, -0.5, 2.1, 0.48, (-0.8, 0.5))):   # 主灯头 Ø1.1 m / 副灯头 Ø0.96 m，都在台面上方
        mx, my = cx + ex[0], cy + ex[1]                                                # 肘关节
        for (ax, ay, bx, by, z) in ((cx, cy, mx, my, CLEAR - 0.55), (mx, my, cx + dx, cy + dy, CLEAR - 0.8)):
            L = math.hypot(bx - ax, by - ay); n = max(2, int(L / 0.08))
            for k in range(n + 1):                                                     # 斜臂：沿线小段拼
                t = k / n; px, py = ax + (bx - ax) * t, ay + (by - ay) * t
                K.box('white', px - 0.055, py - 0.055, z - 0.045, px + 0.055, py + 0.055, z + 0.045)
        K.cyl('grey', mx, my, CLEAR - 0.83, CLEAR - 0.52, 0.045)                       # 肘关节套筒
        K.cyl('white', cx + dx, cy + dy, hz + 0.18, CLEAR - 0.8, 0.025)
        K.cyl('white', cx + dx, cy + dy, hz, hz + 0.1, rr, seg=48, r2=rr * 0.82)      # 灯头外壳（穹顶：下沿 → 上收）
        K.cyl('white', cx + dx, cy + dy, hz + 0.1, hz + 0.2, rr * 0.82, seg=48, r2=rr * 0.35)
        K.cyl('grey', cx + dx, cy + dy, hz - 0.015, hz, rr * 0.96, seg=48)            # 下沿防眩环
        K.cyl('led_soft', cx + dx, cy + dy, hz - 0.013, hz - 0.01, rr * 0.93, seg=48, r2=rr * 0.93)   # 微亮的环形出光面
        for ring, rn in ((0.78, 10), (0.5, 7)):                                        # 多透镜 LED 模组（两圈 + 中心）
            for k in range(rn):
                a = 2 * math.pi * k / rn
                K.cyl('led', cx + dx + rr * ring * math.cos(a), cy + dy + rr * ring * math.sin(a), hz - 0.022, hz - 0.015, rr * 0.11, seg=12)
        K.cyl('dark', cx + dx, cy + dy, hz - 0.16, hz, 0.035)                          # 中心无菌手柄
        K.cyl('grey', cx + dx, cy + dy, hz - 0.17, hz - 0.14, 0.05)


def ceiling_boom(K, cx, cy, arm_dx, arm_dy, kind):
    """吊塔：吸顶 + 横臂 + 下垂塔身；kind='anesthesia'（麻醉 / 呼吸：医用气体终端 + 呼吸机 + 监护）或 'equipment'（显示屏 + 电外科 + 搁板）。"""
    K.cyl('white', cx, cy, CLEAR - 0.15, CLEAR, 0.18)
    ex, ey = cx + arm_dx, cy + arm_dy
    x0, x1 = sorted((cx, ex)); y0, y1 = sorted((cy, ey))
    K.box('white', x0 - 0.08, y0 - 0.08, CLEAR - 0.42, x1 + 0.08, y1 + 0.08, CLEAR - 0.3)
    K.cyl('white', ex, ey, CLEAR - 0.42, CLEAR - 0.15, 0.1)
    K.box('white', ex - 0.22, ey - 0.16, 0.95, ex + 0.22, ey + 0.16, CLEAR - 0.42)  # 塔身
    for i in range(4):   # 医用气体快插（O2 白 / 空气 黑白 / 负压 黄 / N2O 蓝）——按 ISO 32 色标
        K.cyl(('blue_gas', 'dark', 'yellow', 'gas_n2o')[i], ex - 0.23, ey - 0.09 + i * 0.06, 1.6, 0.04, 0.018, seg=12, axis='x')
    for zz in (1.1, 1.45):
        K.box('brushed', ex - 0.3, ey - 0.25, zz, ex + 0.3, ey + 0.25, zz + 0.03)   # 设备搁板
    if kind == 'anesthesia':
        K.box('white', ex - 0.24, ey - 0.2, 1.13, ex + 0.24, ey + 0.18, 1.42)     # 呼吸机主机
        K.box('screen', ex - 0.18, ey - 0.205, 1.2, ex + 0.12, ey - 0.2, 1.38)
        K.cyl('grey', ex + 0.2, ey - 0.26, 1.3, 0.1, 0.035, seg=12, axis='y')
    if kind == 'anesthesia':
        K.box('dark', ex - 0.3, ey - 0.3, 1.78, ex + 0.3, ey - 0.26, 2.12)             # 监护屏（唯一一块吊塔屏）
        K.box('screen', ex - 0.27, ey - 0.305, 1.81, ex + 0.27, ey - 0.3, 2.09)
        K.box('brushed', ex - 0.04, ey - 0.26, 1.9, ex + 0.04, ey - 0.16, 2.0)
    else:
        for i in range(3):                                                           # 电源插座 / 数据口块
            K.box('grey', ex - 0.23, ey - 0.12 + i * 0.1, 1.75, ex - 0.22, ey - 0.05 + i * 0.1, 1.85)
        K.box('white', ex - 0.22, ey - 0.2, 1.48, ex + 0.2, ey + 0.18, 1.7)            # 电外科主机


def anesthesia_machine(K, x, y):
    """麻醉工作站：带脚轮底柜 + 工作台面 + 挥发罐 + 流量计柱 + 呼吸回路臂 + CO2 吸收罐。"""
    K.box('white', x - 0.4, y - 0.3, 0.12, x + 0.4, y + 0.3, 0.85)
    K.box('grey', x - 0.42, y - 0.32, 0.85, x + 0.42, y + 0.32, 0.88)
    K.box('white', x - 0.35, y + 0.05, 0.88, x + 0.35, y + 0.3, 1.45)
    for i in range(2):
        K.box('yellow' if i else 'gas_n2o', x - 0.3 + i * 0.16, y - 0.02, 1.0, x - 0.18 + i * 0.16, y + 0.05, 1.25)   # 挥发罐
    K.cyl('glass', x + 0.2, y - 0.05, 0.95, 1.2, 0.06, seg=16)                     # CO2 吸收罐
    K.box('white', x - 0.35, y + 0.15, 1.45, x + 0.35, y + 0.3, 1.5)                # 顶部搁板
    K.cyl('glass', x - 0.25, y - 0.1, 1.1, 1.38, 0.07, seg=16)                     # 风箱（透明罩）
    K.cyl('grey', x - 0.25, y - 0.1, 1.1, 1.14, 0.075, seg=16)
    K.cyl('brushed', x + 0.25, y + 0.2, 1.5, 1.62, 0.025)                          # 监护臂
    K.box('dark', x - 0.05, y - 0.02, 1.62, x + 0.45, y + 0.05, 1.95)
    K.box('screen_g', x - 0.02, y - 0.025, 1.65, x + 0.42, y - 0.02, 1.92)
    for i in range(3):                                                             # 医用气体软管上吊塔
        K.cyl(('blue_gas', 'dark', 'yellow')[i], x - 0.3 + i * 0.05, y + 0.28, 1.5, CLEAR - 0.5, 0.012, seg=6)
    K.cyl('grey', x + 0.35, y - 0.1, 1.05, 0.35, 0.02, seg=10, axis='x')           # 回路臂
    for sx in (-0.35, 0.35):
        for sy in (-0.25, 0.25):
            K.cyl('dark', x + sx, y + sy, 0.0, 0.12, 0.05, seg=12)


def crash_cart(K, x, y):
    """抢救车（红色五屉 + 顶部除颤监护仪 + 侧挂氧气瓶 + 背板 CPR 按压板）。"""
    K.box('red', x - 0.38, y - 0.28, 0.12, x + 0.38, y + 0.28, 1.0)
    for i in range(5):
        z = 0.2 + i * 0.16
        K.box('seam', x - 0.36, y - 0.285, z, x + 0.36, y - 0.28, z + 0.005)
        K.box('brushed', x - 0.12, y - 0.3, z + 0.06, x + 0.12, y - 0.28, z + 0.08)
    K.box('grey', x - 0.4, y - 0.3, 1.0, x + 0.4, y + 0.3, 1.03)
    K.box('yellow', x - 0.2, y - 0.16, 1.03, x + 0.2, y + 0.14, 1.32)              # 除颤仪
    K.box('screen_g', x - 0.14, y - 0.165, 1.14, x + 0.06, y - 0.16, 1.28)
    K.box('dark', x + 0.09, y - 0.165, 1.08, x + 0.18, y - 0.16, 1.28)
    K.cyl('steel', x + 0.46, y, 0.3, 0.95, 0.06)                                    # 氧气瓶
    K.box('dark', x - 0.3, y + 0.28, 0.35, x + 0.3, y + 0.3, 0.95)                  # CPR 板
    for sx in (-0.3, 0.3):
        for sy in (-0.22, 0.22):
            K.cyl('dark', x + sx, y + sy, 0.0, 0.1, 0.05, seg=12)


def ventilator(K, x, y):
    """移动式 ICU 呼吸机：五星脚 + 立柱 + 主机 + 屏 + 管路臂。"""
    for a in range(5):
        t = a * 2 * math.pi / 5
        K.box('grey', x, y - 0.02, 0.05, x + 0.3 * math.cos(t), y + 0.3 * math.sin(t) + 0.02, 0.09)
    K.cyl('brushed', x, y, 0.05, 0.9, 0.03)
    K.box('white', x - 0.2, y - 0.18, 0.9, x + 0.2, y + 0.18, 1.3)
    K.box('dark', x - 0.18, y - 0.25, 1.3, x + 0.18, y - 0.18, 1.62)
    K.box('screen', x - 0.16, y - 0.255, 1.33, x + 0.16, y - 0.25, 1.59)
    K.box('brushed', x + 0.18, y - 0.02, 1.2, x + 0.5, y + 0.02, 1.24)


def monitor_stand(K, x, y):
    K.cyl('grey', x, y, 0.0, 0.06, 0.28, seg=20)
    K.cyl('brushed', x, y, 0.06, 1.25, 0.025)
    K.box('dark', x - 0.2, y - 0.08, 1.25, x + 0.2, y + 0.02, 1.55)
    K.box('screen_g', x - 0.18, y - 0.085, 1.27, x + 0.18, y - 0.08, 1.53)


def cabinets(K, x0, x1, y, depth=0.45, face=1, glass=True):
    """嵌墙洁净柜：不锈钢框 + 玻璃门（内见耗材盒）+ 下柜。沿 x 放，face=+1 朝北。"""
    ys, ye = (y, y + face * depth)
    K.box('white', x0, ys, 0.1, x1, ye, 0.9)                                       # 下柜
    K.box('steel', x0, ys, 0.9, x1, ye, 0.93)                                       # 台面（不外挑）
    K.box('white', x0, ys, 1.4, x1, y + face * 0.3, 2.4)                           # 上柜（嵌墙，只凸出 0.3 m）
    n = max(1, int((x1 - x0) / 0.6))
    for i in range(n):
        a = x0 + (x1 - x0) * i / n; b = x0 + (x1 - x0) * (i + 1) / n
        K.box('glass' if glass else 'white', a + 0.02, y + face * 0.3, 1.44, b - 0.02, y + face * 0.31, 2.36)
        for k, zz in enumerate((1.5, 1.8, 2.1)):
            K.box(('linen', 'white', 'teal')[(i + k) % 3],
                  a + 0.06, y + face * 0.05, zz, b - 0.06, y + face * 0.26, zz + 0.2)
        K.box('seam', b - 0.005, ys + face * depth, 0.12, b + 0.005, ye + face * 0.005, 0.88)
        K.box('brushed', (a + b) / 2 - 0.12, ye, 0.8, (a + b) / 2 + 0.12, ye + face * 0.02, 0.82)


def scrub_sink(K, x0, x1, y, face=1):
    """不锈钢刷手槽（感应 / 膝控龙头，每 0.8 m 一位）+ 上方镜柜 + 刷手计时屏。沿 x 放。"""
    d = 0.55
    K.box('steel', x0, y, 0.75, x1, y + face * d, 0.95)
    K.box('brushed', x0 + 0.05, y + face * 0.08, 0.8, x1 - 0.05, y + face * (d - 0.06), 0.951)
    K.box('steel', x0, y, 0.95, x1, y + face * 0.05, 1.25)                           # 挡水板
    n = max(1, int((x1 - x0) / 0.8))
    for i in range(n):
        cx = x0 + (x1 - x0) * (i + 0.5) / n
        K.cyl('steel', cx, y + face * 0.05, 1.15, 0.2, 0.015, seg=10, axis='y')     # 鹅颈龙头
        K.box('dark', cx - 0.06, y + face * 0.02, 1.12, cx + 0.06, y + face * 0.04, 1.2)   # 感应窗
        K.box('brushed', cx - 0.12, y + face * (d + 0.0), 0.35, cx + 0.12, y + face * (d + 0.03), 0.5)  # 膝控板
    K.box('glass', x0 + 0.1, y + face * 0.01, 1.4, x1 - 0.1, y + face * 0.02, 2.0)
    K.box('white', x0 + 0.05, y + face * 0.02, 1.3, x0 + 0.17, y + face * 0.12, 1.55)   # 手术刷手液 / 皂液器（肘控）
    K.box('brushed', x0 + 0.07, y + face * 0.12, 1.3, x0 + 0.15, y + face * 0.2, 1.33)
    K.box('dark', x1 - 0.5, y + face * 0.02, 2.05, x1 - 0.1, y + face * 0.03, 2.25)
    K.box('screen', x1 - 0.48, y + face * 0.03, 2.07, x1 - 0.12, y + face * 0.035, 2.23)


def extract_grille(K, x, y, face_x=0, face_y=0):
    """低位回风 / 排风格栅（0.4 × 0.3 m，底边离地 0.2 m），贴墙角。face 指向房间内。"""
    if face_x:
        K.box('grille', x, y - 0.2, 0.2, x + face_x * 0.02, y + 0.2, 0.5)
        for i in range(6):
            K.box('dark', x + face_x * 0.021, y - 0.18, 0.23 + i * 0.045, x + face_x * 0.024, y + 0.18, 0.25 + i * 0.045)
    else:
        K.box('grille', x - 0.2, y, 0.2, x + 0.2, y + face_y * 0.02, 0.5)
        for i in range(6):
            K.box('dark', x - 0.18, y + face_y * 0.021, 0.23 + i * 0.045, x + 0.18, y + face_y * 0.024, 0.25 + i * 0.045)


def env_panel(K, x0, y, face=1):
    """门边的手术部控制面板：压差 / 温度 / 湿度、计时、灯光与送风模式（平嵌墙面）。"""
    K.box('dark', x0, y, 1.25, x0 + 0.9, y + face * 0.015, 1.8)
    K.box('screen', x0 + 0.04, y + face * 0.016, 1.29, x0 + 0.56, y + face * 0.02, 1.76)
    for i in range(3):
        K.box('screen_g', x0 + 0.6, y + face * 0.016, 1.3 + i * 0.16, x0 + 0.86, y + face * 0.02, 1.42 + i * 0.16)


def pass_hatch(K, x, y, face=1):
    """传递窗（互锁双门不锈钢箱，嵌在洗消间 / 处置室之间的墙里）。"""
    K.box('steel', x - 0.35, y - 0.14, 0.95, x + 0.35, y + 0.14, 1.6)
    K.box('glass', x - 0.28, y + face * 0.141, 1.02, x + 0.28, y + face * 0.15, 1.53)
    K.box('brushed', x - 0.3, y + face * 0.15, 1.0, x + 0.3, y + face * 0.16, 1.02)
    K.box('amber_s', x + 0.2, y + face * 0.15, 1.62, x + 0.3, y + face * 0.16, 1.66)
    K.box('green_s', x + 0.08, y + face * 0.15, 1.62, x + 0.18, y + face * 0.16, 1.66)


def gas_panel(K, x, y0, y1, face=1):
    """墙上医用气体终端 + 电源条（设备带），沿 y 放在西墙上。"""
    K.box('white', x, y0, 1.35, x + face * 0.08, y1, 1.6)
    n = int((y1 - y0) / 0.15)
    for i in range(n):
        yy = y0 + 0.1 + i * 0.15
        K.cyl(('blue_gas', 'dark', 'yellow', 'gas_n2o', 'blue_gas')[i % 5], x + face * 0.09, yy, 1.48, 0.03, 0.022, seg=12, axis='x')


def wall_display(K, x0, x1, y, face=-1):
    """墙嵌影像屏（PACS 阅片 / 手术导航）：与墙板齐平嵌装，外圈不锈钢收边，屏面平时暗、只显示淡的影像。"""
    K.box('brushed', x0 - 0.03, y, 1.17, x1 + 0.03, y + face * 0.012, 2.33)
    K.box('dark', x0, y, 1.2, x1, y + face * 0.014, 2.3)
    K.box('screen', x0 + 0.04, y + face * 0.015, 1.24, x1 - 0.04, y + face * 0.017, 2.26)


def prosthetic_bench(K, x, y):
    """仿生肢适配工作台（假肢 / 仿生肢调校）：带显示臂的洁净工作台 + 支架上的一只仿生前臂（中性医疗器械）。"""
    K.box('white', x - 0.6, y - 0.3, 0.0, x + 0.6, y + 0.3, 0.9)
    K.box('steel', x - 0.62, y - 0.32, 0.9, x + 0.62, y + 0.32, 0.93)
    K.cyl('brushed', x - 0.2, y + 0.1, 0.93, 1.05, 0.05)
    K.cyl('white', x - 0.2, y + 0.1, 1.05, 0.42, 0.045, seg=16, axis='x')          # 前臂壳
    K.cyl('grey', x + 0.05, y + 0.1, 1.05, 0.08, 0.04, seg=16, axis='x')            # 腕关节
    for i in range(4):
        K.box('white', x + 0.1, y + 0.03 + i * 0.035, 1.03, x + 0.24, y + 0.055 + i * 0.035, 1.06)
    K.box('dark', x + 0.3, y + 0.2, 1.1, x + 0.6, y + 0.28, 1.35)
    K.box('screen', x + 0.32, y + 0.195, 1.12, x + 0.58, y + 0.2, 1.33)


def gown_rack(K, x, y0, y1):
    """开放式不锈钢洁净服架（贴西墙，沿 y）：四层线网搁板放叠好的洗手衣 / 帽 / 鞋套，上方挂衣杆挂隔离衣，底层鞋套机。"""
    d = 0.45
    for yy in (y0, y1):
        for xx in (x + 0.03, x + d - 0.03):
            K.box('chrome', xx - 0.012, yy - 0.012, 0.0, xx + 0.012, yy + 0.012, 1.95)       # 立柱
    for zz in (0.15, 0.5, 0.85):
        K.box('chrome', x, y0, zz, x + d, y1, zz + 0.02)                               # 搁板
        for i in range(8):
            K.box('seam', x + 0.02, y0 + (y1 - y0) * (i + 0.5) / 8 - 0.004, zz + 0.02, x + d - 0.02, y0 + (y1 - y0) * (i + 0.5) / 8 + 0.004, zz + 0.024)
    stacks = (('teal', 0.12), ('teal', 0.16), ('linen', 0.1), ('teal', 0.14))
    for zz in (0.52, 0.87):
        for k, (m, h) in enumerate(stacks):
            a = y0 + 0.05 + k * (y1 - y0 - 0.1) / 4
            K.box(m, x + 0.06, a + 0.02, zz + 0.02, x + d - 0.06, a + (y1 - y0 - 0.1) / 4 - 0.02, zz + 0.02 + h + (k % 2) * 0.03)
    for k in range(3):                                                                 # 底层：鞋套 / 帽盒（白色纸盒）
        a = y0 + 0.08 + k * 0.5
        K.box('white', x + 0.05, a, 0.17, x + d - 0.05, a + 0.4, 0.4)
    for zz in (1.2, 1.55):                                                             # 上两层：无菌包装的隔离衣包（平叠）
        K.box('chrome', x, y0, zz, x + d, y1, zz + 0.02)
        for k in range(6):
            a = y0 + 0.04 + k * (y1 - y0 - 0.08) / 6
            for j in range(2 + (k % 2)):
                K.box('gown' if (k + j) % 3 else 'linen', x + 0.05, a + 0.015, zz + 0.02 + j * 0.05, x + d - 0.05, a + (y1 - y0 - 0.08) / 6 - 0.015, zz + 0.065 + j * 0.05)
    K.box('white', x, y0 + 0.3, 1.9, x + 0.1, y1 - 0.3, 2.2)                         # 墙上帽子 / 口罩分配盒
    for k in range(3):
        a = y0 + 0.35 + k * (y1 - y0 - 0.6) / 3
        K.box('dark', x + 0.1, a, 1.93, x + 0.105, a + (y1 - y0 - 0.6) / 3 - 0.05, 1.98)
    K.box('white', x + 0.02, y1 + 0.1, 0.0, x + 0.42, y1 + 0.45, 0.85)                 # 自动鞋套机
    K.box('dark', x + 0.1, y1 + 0.15, 0.85, x + 0.34, y1 + 0.4, 0.86)


def gown_lockers(K, x0, x1, y, face=-1):
    K.box('white', x0, y, 0.1, x1, y + face * 0.5, 2.1)
    n = max(1, int((x1 - x0) / 0.45))
    for i in range(n):
        a = x0 + (x1 - x0) * i / n; b = x0 + (x1 - x0) * (i + 1) / n
        K.box('seam', b - 0.005, y + face * 0.5, 0.1, b + 0.005, y + face * 0.505, 2.1)
        K.box('glass', a + 0.05, y + face * 0.505, 1.2, b - 0.05, y + face * 0.51, 1.95)
        K.box('teal', a + 0.08, y + face * 0.2, 1.25, b - 0.08, y + face * 0.4, 1.8)   # 叠好的洁净服
        K.box('brushed', b - 0.08, y + face * 0.51, 0.9, b - 0.05, y + face * 0.53, 1.1)


def step_bench(K, x, y0, y1):
    """跨越式更衣凳：把缓冲间分成外侧（脏）/ 内侧（洁）两半；地面导向色带标线。"""
    K.box('brushed', x - 0.2, y0, 0.42, x + 0.2, y1, 0.47)
    for yy in (y0 + 0.1, y1 - 0.1):
        K.box('steel', x - 0.15, yy - 0.03, 0.0, x + 0.15, yy + 0.03, 0.42)
    K.box('vinyl_dk', x - 0.04, y0 - 0.4, 0.0, x + 0.04, y1 + 0.4, 0.003)


def air_shower_nozzles(K, x0, x1, y, face=1):
    """气闸风淋：墙上两列不锈钢喷嘴板。"""
    K.box('steel', x0, y, 0.3, x1, y + face * 0.12, 2.1)
    for i in range(10):
        for j in range(2):
            K.cyl('dark', x0 + 0.15 + j * (x1 - x0 - 0.3), y + face * 0.12, 0.5 + i * 0.16, 0.04, 0.02, seg=10, axis='y')


def sterilizer(K, x0, y, face=1):
    """双门脉动真空灭菌柜 + 清洗消毒机（器械洗消间）。"""
    K.box('brushed', x0, y, 0.0, x0 + 1.1, y + face * 0.9, 1.9)
    K.cyl('steel', x0 + 0.55, y + face * 0.9, 1.05, 0.05, 0.36, seg=36, axis='y')
    K.box('dark', x0 + 0.8, y + face * 0.905, 1.55, x0 + 1.05, y + face * 0.91, 1.8)
    K.box('screen_g', x0 + 0.82, y + face * 0.91, 1.57, x0 + 1.03, y + face * 0.915, 1.78)
    K.box('steel', x0 + 1.2, y, 0.0, x0 + 1.9, y + face * 0.7, 0.9)
    K.box('glass', x0 + 1.25, y + face * 0.705, 0.1, x0 + 1.85, y + face * 0.71, 0.8)


def reception(K, x0, x1, y):
    K.box('white', x0, y, 0.0, x1, y + 0.6, 1.05)
    K.box('steel', x0 - 0.05, y - 0.05, 1.05, x1 + 0.05, y + 0.65, 1.08)
    K.box('dark', (x0 + x1) / 2 - 0.3, y + 0.2, 1.08, (x0 + x1) / 2 + 0.3, y + 0.25, 1.45)
    K.box('screen', (x0 + x1) / 2 - 0.28, y + 0.195, 1.1, (x0 + x1) / 2 + 0.28, y + 0.2, 1.43)


def stretcher(K, x, y):
    """转运床（担架车）：四轮底架 + 可升降床面 + 侧护栏（折下状态）。"""
    K.box('grey', x - 0.3, y - 0.95, 0.15, x + 0.3, y + 0.95, 0.22)
    K.box('brushed', x - 0.05, y - 0.5, 0.22, x + 0.05, y + 0.5, 0.6)
    K.box('brushed', x - 0.34, y - 1.0, 0.6, x + 0.34, y + 1.0, 0.66)
    K.box('pad', x - 0.3, y - 0.98, 0.66, x + 0.3, y + 0.98, 0.74)
    K.box('linen', x - 0.28, y + 0.6, 0.74, x + 0.28, y + 0.95, 0.8)
    for sx in (-0.26, 0.26):
        for sy in (-0.85, 0.85):
            K.cyl('dark', x + sx, y + sy, 0.0, 0.15, 0.075, seg=12)


def emergency_kit_station(K, x, y, face=1):
    """紧急医疗急救包专属挂站（EQ-51）：红色高可见外壳 + 白十字标 + 便携急救箱 + 医用氧气瓶。"""
    d = 0.22
    # 挂壁式急救站主柜
    K.box('white', x - 0.38, y, 1.15, x + 0.38, y + face * d, 1.75)
    K.box('red', x - 0.34, y + face * (d + 0.002), 1.2, x + 0.34, y + face * (d + 0.006), 1.7)
    # 红底白十字标识
    K.box('white', x - 0.14, y + face * (d + 0.008), 1.42, x + 0.14, y + face * (d + 0.012), 1.48)
    K.box('white', x - 0.03, y + face * (d + 0.008), 1.31, x + 0.03, y + face * (d + 0.012), 1.59)
    # 便携急救手提箱（放于站下托盘上）
    K.box('red', x - 0.25, y + face * 0.04, 0.85, x + 0.25, y + face * (d - 0.02), 1.1)
    K.box('white', x - 0.06, y + face * d, 0.95, x + 0.06, y + face * (d + 0.004), 1.0)
    # 小型便携应急氧气筒
    K.cyl('steel', x + 0.46, y + face * 0.1, 0.9, 1.45, 0.05)


# ---------------------------------------------------------------- 组装
def build(col=None, f1_z=None, for_web=False):
    """在 col（默认新建「B2_医疗中心」集合）里建四间房；返回对象列表。"""
    if f1_z is None:
        try:
            from .buildings import site_z   # 主楼 F1 楼面（与 buildings.building 同一算法）
            f1_z = site_z(0, -4, 40, 24, 0.0)[0]
        except Exception:
            f1_z = 0.0
    z0 = f1_z + B2_DZ
    col = col or coll('B2_医疗中心')
    M = mats(); R = rooms(); obs = []

    # --- 无菌处置室 (8..20, 1.5..8)
    x0, x1, y0, y1 = R['无菌处置室']
    K = Kit(col, z0, 'b2_cleanroom', for_web=for_web)
    ix0, ix1, iy0, iy1 = shell(K, R['无菌处置室'], {'S': [(8.3, 9.7)], 'W': [(1.4, 3.0)]})   # 南墙 → 缓冲更衣间；西墙 y 2.9–4.5 患者转运门
    tx, ty = 14.0, 4.9
    led_grid(K, ix0 + 0.3, ix1 - 0.3, iy0 + 0.3, iy1 - 0.3, 6, 5, skip=lambda cx, cy: abs(cx - tx) < 1.8 and abs(cy - ty) < 1.9)
    if not for_web:
        cw, cd = 1.5, 1.6                                                          # 层流送风天花（HEPA 散流板 3.0 × 3.2 m）+ 0.1 m 导流裙边
        K.box('seam', tx - cw, ty - cd, CLEAR - 0.03, tx + cw, ty + cd, CLEAR - 0.001)
        K.box('led_soft', tx - cw + 0.05, ty - cd + 0.05, CLEAR - 0.035, tx + cw - 0.05, ty + cd - 0.05, CLEAR - 0.03)
        for a in (-1, 1):
            K.box('brushed', tx - cw - 0.02, ty + a * cd - 0.02, CLEAR - 0.13, tx + cw + 0.02, ty + a * cd + 0.02, CLEAR)
            K.box('brushed', tx + a * cw - 0.02, ty - cd - 0.02, CLEAR - 0.13, tx + a * cw + 0.02, ty + cd + 0.02, CLEAR)
        for i in range(1, 6):                                                      # 散流板分格
            K.box('seam', tx - cw + 0.05, ty - cd + i * 2 * cd / 6 - 0.006, CLEAR - 0.037, tx + cw - 0.05, ty - cd + i * 2 * cd / 6 + 0.006, CLEAR - 0.035)
        surgical_light(K, tx, ty + 0.2)
        ceiling_boom(K, tx - 1.1, ty + 1.2, -0.9, 0.3, 'anesthesia')
        ceiling_boom(K, tx + 1.2, ty + 1.2, 1.0, 0.2, 'equipment')
    op_table(K, tx, ty)
    crash_cart(K, 10.0, 2.25)
    ventilator(K, 11.6, 5.9)
    anesthesia_machine(K, tx - 0.75, ty + 1.95)                               # 头端麻醉机
    K.box('steel', tx + 0.9, ty - 1.6, 0.8, tx + 1.6, ty - 1.1, 0.83); K.box('brushed', tx + 0.9, ty - 1.6, 0.35, tx + 1.6, ty - 1.1, 0.37)   # 器械台（Mayo / 后台）
    for sx in (0.93, 1.57):
        for sy in (-1.57, -1.13):
            K.cyl('brushed', tx + sx, ty + sy, 0.0, 0.8, 0.012, seg=8)
    cabinets(K, ix0 + 0.05, 13.2, iy1, face=-1)                              # 北墙洁净柜
    cabinets(K, 15.6, ix1 - 1.2, iy1, face=-1)
    gas_panel(K, ix0, 4.8, 5.8)                                               # 西墙设备带
    wall_display(K, 13.2, 15.6, iy1 - 0.02)
    pass_hatch(K, 11.0, y0, face=1)                                           # 南墙传递窗（洗消间 → 处置室）
    hermetic_door(K, 17.0, iy0 + 0.16, 'x', state='green')
    env_panel(K, 15.0, iy0, 1)
    emergency_kit_station(K, 9.5, iy0, face=1)                                # 专属急救站（EQ-51）
    for ex, ey, fx, fy in ((ix0, iy0 + 0.4, 1, 0), (ix0, iy1 - 0.6, 1, 0), (ix1, iy1 - 0.6, -1, 0), (ix1, iy0 + 0.4, -1, 0)):
        extract_grille(K, ex, ey, fx, fy)
    K.box('brushed', ix1 - 0.06, 2.4, 0.0, ix1, 3.9, 0.1)                         # 东墙防撞条
    for zz in (0.85, 1.0):
        K.box('grey', ix1 - 0.05, 1.2, zz, ix1, 7.0, zz + 0.05)
    obs += K.done(M)

    # --- 缓冲更衣间 (14..20, -3..1.5)
    K = Kit(col, z0, 'b2_anteroom', for_web=for_web)
    ax0, ax1, ay0, ay1 = shell(K, R['缓冲更衣间'], {'N': [(2.3, 3.7)], 'S': [(2.3, 3.7)]})
    led_grid(K, ax0 + 0.3, ax1 - 0.3, ay0 + 0.3, ay1 - 0.3, 3, 3)
    hermetic_door(K, 17.0, ay0 - 0.02 + 0.16, 'x', state='amber')             # 南门（主人通道前室侧）：互锁，另一扇开时亮琥珀
    K.box('brushed', 15.2, -0.9, 0.42, 18.8, -0.5, 0.47)                      # 跨越式更衣凳（东西向，分脏 / 洁两侧）
    for xx in (15.4, 18.6):
        K.box('steel', xx - 0.03, -0.85, 0.0, xx + 0.03, -0.55, 0.42)
    K.box('vinyl_dk', ax0, -0.72, 0.0, ax1, -0.68, 0.004)
    K.box('vinyl_cl', ax0, -0.68, 0.0, ax1, ay1, 0.003)                       # 洁侧地面换色
    K.box('dark', 17.9, ay0 + 0.0, 2.05, 18.3, ay0 + 0.01, 2.3); K.box('screen_g', 17.92, ay0 + 0.01, 2.07, 18.28, ay0 + 0.015, 2.28)   # 南门压差表
    for ex, ey, fx, fy in ((ax0, ay1 - 0.5, 1, 0), (ax1, ay0 + 0.4, -1, 0)):
        extract_grille(K, ex, ey, fx, fy)
    gown_rack(K, ax0 + 0.02, -2.75, -1.05)                                   # 西墙开放式洁净服架（外侧 = 脏侧）
    scrub_sink(K, 14.3, 16.1, ay1, face=-1)                                   # 北墙西段刷手槽（进处置室前）
    emergency_kit_station(K, 15.0, ay0, face=1)                               # 缓冲间急救站（EQ-51）
    K.box('steel', ax1 - 0.1, 0.0, 0.3, ax1, 1.2, 2.1)                        # 东墙风淋喷嘴板（洁侧）
    for i in range(9):
        for yy in (0.2, 1.0):
            K.cyl('dark', ax1 - 0.1, yy, 0.5 + i * 0.18, 0.03, 0.022, seg=10, axis='x')
    K.box('white', 18.3, ay1 - 0.12, 1.1, 18.8, ay1, 1.5)                    # 手消 / 口罩 / 帽子分配器（进门前最后一步）
    K.box('dark', 18.45, ay1 - 0.125, 1.2, 18.65, ay1 - 0.12, 1.3)
    obs += K.done(M)

    # --- 器械洗消间 (8..14, -3..1.5)
    K = Kit(col, z0, 'b2_sterile_proc', for_web=for_web)
    shell(K, R['器械洗消间'], {'W': [(2.5, 3.9)]})
    led_grid(K, 8.4, 13.6, -2.6, 1.1, 3, 3)
    sterilizer(K, 8.3, -2.9 + 0.1, face=1)
    K.box('steel', 11.0, -2.9, 0.0, 13.8, -2.3, 0.92); K.box('brushed', 11.3, -2.8, 0.75, 12.5, -2.4, 0.921)   # 清洗槽台
    pass_hatch(K, 11.0, 1.5, face=-1)
    obs += K.done(M)

    # --- 医疗中心前厅 (4..8, -3..8)
    K = Kit(col, z0, 'b2_med_lobby', for_web=for_web)
    shell(K, R['医疗中心前厅'], {'S': [(1.3, 2.9)], 'E': [(2.5, 3.9), (5.9, 7.5)]})
    led_grid(K, 4.4, 7.6, -2.6, 7.6, 2, 7)
    reception(K, 4.4, 6.6, 3.2)
    stretcher(K, 6.9, 5.2)
    emergency_kit_station(K, 4.4 + 0.1, 0.8, face=1)                           # 前厅急救站（EQ-51）
    hermetic_door(K, 7.65, 3.7, 'y', w=1.6)                             # 患者转运门（气密、互锁）→ 无菌处置室
    obs += K.done(M)
    return obs


# ---------------------------------------------------------------- 草图渲染
VIEWS = {   # 相机（庄园坐标，z 相对 B2 楼面）、目标、焦距
    'cleanroom': ((19.6, 1.85, 1.7), (12.6, 5.6, 1.0), 19),
    'anteroom': ((18.9, -2.75, 1.65), (15.4, 0.6, 1.15), 17),
}


def render(view, out, res=1400, samples=64):
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    build(f1_z=0.0)
    sc = bpy.context.scene
    w = bpy.data.worlds.get('b2w') or bpy.data.worlds.new('b2w'); sc.world = w
    w.use_nodes = True; nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Color'].default_value = (0.02, 0.02, 0.022, 1); bg.inputs['Strength'].default_value = 1.0
    wo = nt.nodes.new('ShaderNodeOutputWorld'); nt.links.new(bg.outputs[0], wo.inputs['Surface'])
    R = rooms()
    for name, (x0, x1, y0, y1) in R.items():   # 每块吊顶下补面光（LED 平板是自发光，面光只为降噪）
        for i in range(max(1, int((x1 - x0) / 3))):
            for j in range(max(1, int((y1 - y0) / 3))):
                n = max(1, int((x1 - x0) / 3)); m = max(1, int((y1 - y0) / 3))
                ld = bpy.data.lights.new(f'{name}{i}{j}', 'AREA'); ld.shape = 'RECTANGLE'
                ld.size = (x1 - x0) / n * 0.8; ld.size_y = (y1 - y0) / m * 0.8
                ld.energy = 9 * ld.size * ld.size_y; ld.color = (0.93, 0.97, 1.0)
                lo = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(lo)
                lo.location = (x0 + (x1 - x0) * (i + 0.5) / n, y0 + (y1 - y0) * (j + 0.5) / m, B2_DZ + CLEAR - 0.05)
    loc, tgt, lens = VIEWS[view]
    cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.clip_start = 0.05
    cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    p = Vector((loc[0], loc[1], loc[2] + B2_DZ)); t = Vector((tgt[0], tgt[1], tgt[2] + B2_DZ))
    cam.location = p; cam.rotation_euler = (t - p).to_track_quat('-Z', 'Y').to_euler()
    sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    tc_common.pick_gpu(sc, hybrid=True)
    sc.render.resolution_x = res; sc.render.resolution_y = int(res * 0.625)
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -1.45
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    import argparse
    a = argparse.ArgumentParser()
    a.add_argument('--view', default='cleanroom'); a.add_argument('--out', required=True)
    a.add_argument('--res', type=int, default=1400); a.add_argument('--samples', type=int, default=64)
    ar = a.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    render(ar.view, ar.out, ar.res, ar.samples)

