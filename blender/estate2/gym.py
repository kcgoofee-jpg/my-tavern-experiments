"""r4e 玻璃健身亭（用户新增，src: user）：网球场旁 20 × 12 m 钢框玻璃盒，薄檐平顶，石灰华平台；透过玻璃可见器械（全部自建）。
卡里的「体能训练室」仍在主楼 B1，本亭是户外附属设施。"""
import math
import numpy as np
import bpy, bmesh
from mathutils import Matrix
from . import layout as L
from .common import mat_new, bm_to_obj
from .buildings import mats, _box


def _mat(name, rgb, rough=0.5, metal=0.0, trans=0.0):
    m, t = mat_new(name)
    if t is not None:
        b = t.bsdf((200, 0), Roughness=rough, Metallic=metal, **{'Base Color': (*rgb, 1)})
        if trans:
            b.inputs['Transmission Weight'].default_value = trans
            b.inputs['IOR'].default_value = 1.45
    return m


def build(col):
    M = mats()
    cx, cy, rd = L.GYM
    rot = math.radians(rd)
    z = L.ground_z(cx, cy)
    R = Matrix.Translation((cx, cy, z)) @ Matrix.Rotation(rot, 4, 'Z')
    glass = _mat('e2_clear_glass', (0.95, 0.97, 0.97), 0.0, 0.0, 1.0)
    black = _mat('e2_gym_black', (0.02, 0.02, 0.022), 0.4)
    chrome = _mat('e2_chrome', (0.8, 0.8, 0.82), 0.15, 1.0)
    rubber = _mat('e2_rubber_floor', (0.05, 0.05, 0.055), 0.8)
    oak = M['wood']
    W, D, H = 20.0, 12.0, 4.2
    parts = {k: bmesh.new() for k in ('deck', 'floor', 'steel', 'glass', 'roof', 'black', 'chrome')}
    _box(parts['deck'], -W / 2 - 3, -D / 2 - 3, -1.2, W / 2 + 3, D / 2 + 2, 0.15)           # 石灰华平台
    _box(parts['floor'], -W / 2, -D / 2, 0.15, W / 2, D / 2, 0.2)                           # 橡胶地面
    for x in np.linspace(-W / 2, W / 2, 6):
        for y in (-D / 2, D / 2):
            _box(parts['steel'], x - 0.09, y - 0.09, 0.2, x + 0.09, y + 0.09, H)
    for y in np.linspace(-D / 2, D / 2, 4):
        for x in (-W / 2, W / 2):
            _box(parts['steel'], x - 0.09, y - 0.09, 0.2, x + 0.09, y + 0.09, H)
    for (x0, y0, x1, y1) in ((-W / 2, -D / 2, W / 2, -D / 2), (-W / 2, D / 2, W / 2, D / 2), (-W / 2, -D / 2, -W / 2, D / 2), (W / 2, -D / 2, W / 2, D / 2)):
        _box(parts['glass'], min(x0, x1) - 0.02, min(y0, y1) - 0.02, 0.2, max(x0, x1) + 0.02, max(y0, y1) + 0.02, H - 0.05)
    _box(parts['roof'], -W / 2 - 0.9, -D / 2 - 0.9, H, W / 2 + 0.9, D / 2 + 0.9, H + 0.35)     # 平顶 + 薄檐
    # 器械：面朝南（−y，看台球场）一排跑步机、一排单车；北侧力量区（深蹲架、卧推凳、哑铃架）
    b, c = parts['black'], parts['chrome']
    for i in range(5):   # 跑步机
        x = -8 + i * 2.2
        _box(b, x - 0.45, -4.6, 0.2, x + 0.45, -2.6, 0.45)
        _box(b, x - 0.4, -4.55, 0.45, x + 0.4, -2.75, 0.47)
        for sx in (-1, 1):
            _box(c, x + sx * 0.4 - 0.03, -4.55, 0.45, x + sx * 0.4 + 0.03, -4.49, 1.35)
        _box(b, x - 0.45, -4.62, 1.3, x + 0.45, -4.45, 1.6)
    for i in range(4):   # 动感单车
        x = 3.5 + i * 1.6
        _box(b, x - 0.12, -4.2, 0.2, x + 0.12, -3.0, 0.3)
        _box(c, x - 0.04, -3.9, 0.3, x + 0.04, -3.82, 1.0)
        _box(b, x - 0.15, -3.95, 1.0, x + 0.15, -3.7, 1.05)
        _box(c, x - 0.03, -3.25, 0.3, x + 0.03, -3.19, 1.15)
        _box(b, x - 0.25, -3.3, 1.12, x + 0.25, -3.12, 1.18)
        bmesh.ops.create_cone(c, cap_ends=True, segments=20, radius1=0.25, radius2=0.25, depth=0.06, matrix=Matrix.Translation((x, -3.3, 0.55)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    for i in range(2):   # 深蹲架
        x = -7 + i * 4
        for sx in (-1, 1):
            for sy in (-1, 1):
                _box(b, x + sx * 0.6 - 0.04, 3.4 + sy * 0.6 - 0.04, 0.2, x + sx * 0.6 + 0.04, 3.4 + sy * 0.6 + 0.04, 2.4)
        _box(b, x - 0.65, 2.75, 2.35, x + 0.65, 4.05, 2.42)
        bmesh.ops.create_cone(c, cap_ends=True, segments=12, radius1=0.015, radius2=0.015, depth=2.2, matrix=Matrix.Translation((x, 2.7, 1.45)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
        for sx in (-1, 1):
            bmesh.ops.create_cone(b, cap_ends=True, segments=24, radius1=0.22, radius2=0.22, depth=0.06, matrix=Matrix.Translation((x + sx * 0.9, 2.7, 1.45)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    for i in range(3):   # 卧推凳
        x = 1.5 + i * 2.2
        _box(b, x - 0.15, 2.6, 0.2, x + 0.15, 3.8, 0.62)
        _box(c, x - 0.05, 2.7, 0.2, x + 0.05, 2.8, 0.45)
    _box(b, 7.5, 1.6, 0.2, 9.2, 5.2, 0.45)          # 哑铃架
    for k in range(10):
        y = 1.8 + k * 0.33
        for sx in (-1, 1):
            bmesh.ops.create_cone(c, cap_ends=True, segments=10, radius1=0.08, radius2=0.08, depth=0.07, matrix=Matrix.Translation((8.35 + sx * 0.18, y, 0.58)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        _box(c, 8.15, y - 0.015, 0.565, 8.55, y + 0.015, 0.595)
    ld = bpy.data.lights.new('gym_ceiling', 'AREA'); ld.shape = 'RECTANGLE'; ld.size, ld.size_y = W - 2, D - 2
    ld.energy = 1500; ld.color = (1.0, 0.92, 0.82)
    lo = bpy.data.objects.new('gym_ceiling', ld); col.objects.link(lo); lo.matrix_world = R @ Matrix.Translation((0, 0, H - 0.1))
    mats_ = dict(deck=M['honed'], floor=rubber, steel=M['steel'], glass=glass, roof=M['plain'], black=black, chrome=chrome)
    for k, bm in parts.items():
        bmesh.ops.transform(bm, matrix=R, verts=bm.verts)
        bm_to_obj(bm, f'gym_{k}', col, mats_[k])
