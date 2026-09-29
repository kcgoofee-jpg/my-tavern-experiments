"""旧公寓楼（开局六：玩家租下的第一间房，中层「钢铁与霓虹」某条有日照的街）。
七层老式唐楼 / 1990–2000 年代东亚步梯公寓：马赛克瓷砖立面带雨痕、窗机空调、部分窗装防盗网、
晾衣阳台、外墙水管、中间楼梯间（亮灯的入口）；首层四间铺面（最西一间是早餐店：门口蒸笼冒汽、塑料桌凳）；
人行道上的地铁出入口雨棚；行道树；无字灯箱与全息广告（只有色块）；街角一辆黑色悬浮车。
玩家的房间：五楼、楼梯间东侧那一开间（床、书桌、椅子、墙角小冰箱、卫生间门 + 小镜子），单独成组 props_room。
场景：身后层叠的巨构塔楼、磁悬浮高架；头顶是上一层甲板的底面，东南方向有一道日光缝让晨光斜照立面；雨后湿路面。
坐标：街道沿 x；楼正立面 y = 10（朝 -y），北侧人行道 y 5–10，车道 y -5–5，南侧人行道 y -10–-5；东边 x 13–19 是一条横街。
bg_* 只为渲染，不导出。中立建筑：无文字、无标志、无人物。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/old_apartment/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/oa.jpg [--blend /tmp/oa.blend] [--log /tmp/oa.log] [--exposure 0]
cam: c1 街面斜看（立面 + 早餐店 + 地铁口）/ c2 房间里看窗外街道 / c3 高处看楼在层叠城市里
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='day', res='1000', samples='32', out='/tmp/oa.jpg', blend='', log='', exposure=''))

X0, X1, Y0, Y1 = -12.0, 12.0, 10.0, 22.0     # 楼体
T = 0.25                                     # 外墙厚
GH = 4.2                                     # 首层高
FH = 3.0                                     # 标准层高
NF = 7                                       # 层数（含首层）
TOP = GH + (NF - 1) * FH                     # 屋面
BAYS = [X0 + 1.5 + 3 * i for i in range(8)]  # 开间中心
STAIR = -1.5                                 # 楼梯间开间
ROOM_BAY, ROOM_F = 1.5, 5                    # 玩家房间：开间中心、楼层
WW, WS, WH = 1.5, 0.9, 1.45                  # 窗宽、窗台高、窗高
PV = 0.15                                    # 人行道高


def fz(k):
    return 0.0 if k == 0 else GH + (k - 1) * FH


def tile_mat():
    """老式马赛克瓷砖：灰泥贴图压成奶黄色 + 按世界坐标画 0.2×0.1 m 灰缝 + 雨痕。"""
    m = C.pbr('tile', 'white_stucco', 1.5, tint=(0.86, 0.78, 0.62), sat=0.3, rough_mul=0.6, weather=0.75)
    nt = m.node_tree
    b = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    src = b.inputs['Base Color'].links[0].from_socket
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])

    def M(op, a, bb):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, bb)):
            if isinstance(v, float): n.inputs[i].default_value = v
            else: nt.links.new(v, n.inputs[i])
        return n.outputs[0]
    gu = M('FRACT', M('MULTIPLY', M('ADD', sep.outputs[0], sep.outputs[1]), 5.0), 0.0)
    gv = M('FRACT', M('MULTIPLY', sep.outputs[2], 10.0), 0.0)
    g = M('MAXIMUM', M('GREATER_THAN', gu, 0.9), M('GREATER_THAN', gv, 0.85))
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 1.0; mr.inputs['To Max'].default_value = 0.72
    nt.links.new(g, mr.inputs['Value'])
    col = C._mix(nt, src, (1, 1, 1), 1.0, 'MULTIPLY')
    mx = col.node
    cm = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3): nt.links.new(mr.outputs[0], cm.inputs[i])
    nt.links.new(cm.outputs[0], mx.inputs[7])
    nt.links.new(col, b.inputs['Base Color'])
    return m


def tower_mat(name, base, lit, estr):
    """巨构塔楼：深色金属玻璃 + 按 z 每 4 m 一道窗带，窗带里噪声决定哪些格子亮灯。"""
    m, nt, b = C.new_mat(name)
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = 0.35
    b.inputs['Metallic'].default_value = 0.4
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    m1 = nt.nodes.new('ShaderNodeMath'); m1.operation = 'MULTIPLY'; m1.inputs[1].default_value = 0.25
    nt.links.new(sep.outputs[2], m1.inputs[0])
    fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; nt.links.new(m1.outputs[0], fr.inputs[0])
    band = nt.nodes.new('ShaderNodeMath'); band.operation = 'LESS_THAN'; band.inputs[1].default_value = 0.45
    nt.links.new(fr.outputs[0], band.inputs[0])
    cell = nt.nodes.new('ShaderNodeVectorMath'); cell.operation = 'SNAP'; cell.inputs[1].default_value = (3.0, 3.0, 4.0)
    nt.links.new(tc.outputs['Object'], cell.inputs[0])
    wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'
    nt.links.new(cell.outputs[0], wn.inputs['Vector'])
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.85
    nt.links.new(wn.outputs['Value'], gt.inputs[0])
    mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'
    nt.links.new(band.outputs[0], mu.inputs[0]); nt.links.new(gt.outputs[0], mu.inputs[1])
    s = nt.nodes.new('ShaderNodeMath'); s.operation = 'MULTIPLY'; s.inputs[1].default_value = estr
    nt.links.new(mu.outputs[0], s.inputs[0])
    b.inputs['Emission Color'].default_value = (*lit, 1)
    nt.links.new(s.outputs[0], b.inputs['Emission Strength'])
    return m


def volume_mat(name, dens):
    m = bpy_mat = __import__('bpy').data.materials.new(name)
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    v = nt.nodes.new('ShaderNodeVolumePrincipled'); v.inputs['Density'].default_value = dens
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 6.0
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.45; mr.inputs['To Max'].default_value = dens
    nt.links.new(nz.outputs[0], mr.inputs['Value']); nt.links.new(mr.outputs[0], v.inputs['Density'])
    nt.links.new(v.outputs[0], out.inputs['Volume'])
    return bpy_mat


def board(B, o, u, n, w, h, holos, frame, bar):
    """带框全息广告屏：o 左下角、u 水平方向、n 朝外法向（都沿坐标轴）；三层前后错开的渐变面板 + 底部发射条。"""
    def P(a, b, d):
        return (o[0] + u[0] * a + n[0] * d, o[1] + u[1] * a + n[1] * d, o[2] + b)

    def bx(a0, a1, b0, b1, d0, d1, m):
        p0, p1 = P(a0, b0, d0), P(a1, b1, d1)
        B.box(p0[0], p1[0], p0[1], p1[1], p0[2], p1[2], m)
    t = 0.15
    bx(-t, w + t, -t, 0, 0, 0.3, frame); bx(-t, w + t, h, h + t, 0, 0.3, frame)
    bx(-t, 0, 0, h, 0, 0.3, frame); bx(w, w + t, 0, h, 0, 0.3, frame)
    bx(0, w, -0.02, 0.08, 0.3, 0.75, frame); bx(0.1, w - 0.1, 0.08, 0.14, 0.4, 0.7, bar)   # 发射条
    bx(0, w, 0, h, 0, 0.02, frame)
    for i, (d, s_) in enumerate(((0.05, 1.0), (0.35, 0.72), (0.65, 0.42))):
        a0, a1 = w * (1 - s_) / 2 + (0.15 * w if i == 2 else 0), w * (1 + s_) / 2 + (0.15 * w if i == 2 else 0)
        b0, b1 = h * (1 - s_) / 2 + 0.1 * i, h * (1 + s_) / 2
        B.poly([P(a0, b0, d), P(a1, b0, d), P(a1, b1, d), P(a0, b1, d)], [(0, 1, 2, 3), (3, 2, 1, 0)], holos[i % len(holos)])


def person(B, x, y, z, yaw, rnd, M, h=None):
    """建筑表现式简模行人：裤/裙、外套躯干、手臂、头、头发；按身高比例（头身约 1:7.5）。"""
    h = h or rnd.uniform(1.6, 1.82)
    u = h / 7.5
    c, s_ = math.cos(yaw), math.sin(yaw)

    def P(a, b, zz):   # a 前后（朝向 yaw）、b 左右
        return (x + a * c - b * s_, y + a * s_ + b * c, z + zz)
    coat, pants, skin, hair = rnd.choice(M['coat']), rnd.choice(M['pants']), rnd.choice(M['skin']), rnd.choice(M['hair'])
    step = rnd.uniform(-0.18, 0.18)
    for sd, st in ((-1, step), (1, -step)):   # 腿
        B.tube([P(0, sd * 0.09 * h / 1.7, 3.8 * u), P(st, sd * 0.09 * h / 1.7, 0.08)], 0.065 * h / 1.7, pants, n=6)
        B.tube([P(st - 0.02, sd * 0.09 * h / 1.7, 0.04), P(st + 0.2, sd * 0.09 * h / 1.7, 0.04)], 0.045, M['shoe'], n=5)
    B.tube([P(0, 0, 3.6 * u), P(0.01, 0, 5.4 * u), P(0, 0, 6.3 * u)], 0.17 * h / 1.7, coat, n=8)   # 躯干
    B.tube([P(0, 0, 3.4 * u), P(0, 0, 4.2 * u)], 0.185 * h / 1.7, coat, n=8)   # 外套下摆
    for sd, st in ((-1, -step), (1, step)):   # 手臂
        B.tube([P(0, sd * 0.2 * h / 1.7, 6.1 * u), P(st * 0.6, sd * 0.23 * h / 1.7, 4.8 * u), P(st * 0.8 + 0.05, sd * 0.22 * h / 1.7, 3.7 * u)], 0.05 * h / 1.7, coat, n=6)
    B.cyl(*P(0, 0, 6.3 * u), 0.05, 0.4 * u, skin, 6)
    B.sphere(*P(0.01, 0, 6.95 * u), 0.5 * u, skin, sz=1.2, seg=10, rings=7)
    B.sphere(*P(-0.02, 0, 7.1 * u), 0.53 * u, hair, sz=1.05, seg=10, rings=7, zmin=-0.1)
    if rnd.random() < 0.35:   # 背包 / 手提包
        B.boxc(*P(-0.2 * h / 1.7, 0, 4.6 * u), 0.3, 0.3, 0.4, rnd.choice(M['pants']))


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(6)

    # ------------------------------------------------------------ 材质
    TILE = tile_mat()
    RENDER = C.pbr('render_grey', 'concrete_wall_008', 3.0, tint=(0.72, 0.7, 0.66), sat=0.3, weather=0.8)
    PLINTH = C.pbr('plinth', 'dark_brick_wall', 1.2, tint=(0.55, 0.5, 0.48), sat=0.4)
    CONC = C.pbr('concrete', 'smooth_concrete_floor', 3.0, tint=(0.75, 0.74, 0.72), sat=0.2, weather=0.5)
    ROAD = C.pbr('road_composite', 'smooth_concrete_floor', 4.0, tint=(0.8, 0.82, 0.84), value=1.15, sat=0.1, rough_mul=0.4)
    PAVE = C.pbr('pavement', 'smooth_concrete_floor', 3.0, tint=(0.95, 0.96, 0.97), value=1.45, sat=0.05, rough_mul=0.45)
    _nt = PAVE.node_tree; _b = [n for n in _nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    _src = _b.inputs['Base Color'].links[0].from_socket
    _tc = _nt.nodes.new('ShaderNodeTexCoord'); _sp = _nt.nodes.new('ShaderNodeSeparateXYZ'); _nt.links.new(_tc.outputs['Object'], _sp.inputs[0])
    def _M(op, a, b):
        n = _nt.nodes.new('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, float): n.inputs[i].default_value = v
            else: _nt.links.new(v, n.inputs[i])
        return n.outputs[0]
    _j = _M('MAXIMUM', _M('GREATER_THAN', _M('FRACT', _M('MULTIPLY', _sp.outputs[0], 1 / 0.6), 0.0), 0.97),
            _M('GREATER_THAN', _M('FRACT', _M('MULTIPLY', _sp.outputs[1], 1 / 0.6), 0.0), 0.97))
    _f = _M('SUBTRACT', 1.0, _M('MULTIPLY', _j, 0.35))
    _cm = _nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3): _nt.links.new(_f, _cm.inputs[i])
    _nt.links.new(C._mix(_nt, _src, _cm.outputs[0], 1.0, 'MULTIPLY'), _b.inputs['Base Color'])
    GLASS = C.glass('win_glass', (0.05, 0.06, 0.07), 0.04)
    SHOPG = C.glass('shop_glass', (0.1, 0.09, 0.07), 0.05, emit=(1.0, 0.82, 0.6), estr=1.2)
    ALU = C.flat('aluminium', (0.62, 0.63, 0.64), 0.35, metal=0.9)
    STEEL = C.flat('steel_dark', (0.12, 0.13, 0.14), 0.45, metal=0.8)
    RUST = C.flat('grille_iron', (0.2, 0.17, 0.15), 0.6, metal=0.6, noise=0.4)
    PIPE = C.flat('pipe_pvc', (0.6, 0.6, 0.57), 0.5, noise=0.3)
    ACM = C.flat('ac_unit', (0.8, 0.8, 0.77), 0.45, noise=0.25)
    ACG = C.flat('ac_grille', (0.2, 0.2, 0.2), 0.6)
    SHUT = C.flat('shutter', (0.45, 0.46, 0.47), 0.4, metal=0.7, noise=0.3)
    DOOR = C.flat('door_green', (0.12, 0.2, 0.16), 0.5, noise=0.2)
    LAMPW = C.flat('lamp_warm', (1, 0.9, 0.7), 0.4, emit=(1.0, 0.85, 0.62), estr=8.0)
    LAMPC = C.flat('lamp_cool', (0.9, 0.95, 1), 0.4, emit=(0.85, 0.93, 1.0), estr=6.0)
    INT = C.flat('shop_int', (0.78, 0.76, 0.7), 0.6, noise=0.2)
    STAINLESS = C.flat('stainless', (0.7, 0.7, 0.7), 0.25, metal=1.0)
    BAMBOO = C.flat('bamboo_steamer', (0.62, 0.48, 0.3), 0.7, noise=0.4)
    PLAST = [C.flat('plastic_red', (0.55, 0.06, 0.05), 0.4), C.flat('plastic_blue', (0.05, 0.18, 0.45), 0.4),
             C.flat('plastic_white', (0.82, 0.82, 0.8), 0.4)]
    STEAM = volume_mat('steam', 6.0)
    CLOTH = [C.flat('cloth_%d' % i, c, 0.9, noise=0.2) for i, c in enumerate(
        ((0.7, 0.7, 0.68), (0.3, 0.38, 0.5), (0.55, 0.3, 0.25), (0.25, 0.3, 0.22), (0.72, 0.62, 0.4)))]
    SIGN = [C.flat('lightbox_%d' % i, c, 0.3, emit=c, estr=e) for i, (c, e) in enumerate(
        (((1.0, 0.95, 0.85), 4.0), ((0.95, 0.35, 0.2), 5.0), ((0.2, 0.6, 1.0), 5.0), ((0.35, 0.9, 0.5), 4.0)))]
    HOLO1 = C.holo('holo_cyan', (0.05, 0.6, 1.0), (0.6, 0.1, 1.0), 3.5, 0.75)
    HOLO3 = C.holo('holo_deep', (0.1, 0.25, 1.0), (0.1, 0.9, 0.7), 3.0, 0.6, scan=3.0, scale=0.3)
    HOLO2 = C.holo('holo_rose', (1.0, 0.2, 0.5), (1.0, 0.6, 0.15), 3.5, 0.75)
    CAR = C.flat('car_black', (0.015, 0.015, 0.018), 0.15, metal=0.6, coat=1.0)
    CARG = C.glass('car_glass', (0.02, 0.02, 0.025), 0.03)
    WOOD = C.pbr('wood', 'rough_wood', 1.0, tint=(0.8, 0.7, 0.55))
    LINEN = C.pbr('linen', 'rough_linen', 0.8, tint=(0.7, 0.72, 0.75))
    FLOORV = C.pbr('floor_vinyl', 'rubber_tiles', 1.2, tint=(0.75, 0.7, 0.62), sat=0.4)
    WALLI = C.flat('wall_int', (0.8, 0.79, 0.74), 0.8, noise=0.15)
    FRIDGE = C.flat('fridge', (0.85, 0.85, 0.82), 0.3, noise=0.1)
    MIRROR = C.flat('mirror', (0.9, 0.9, 0.9), 0.02, metal=1.0)
    CRACK = C.flat('mirror_crack', (0.05, 0.05, 0.05), 0.8)
    CURB = C.flat('curb', (0.5, 0.5, 0.49), 0.6, noise=0.3)

    # ------------------------------------------------------------ 外墙（首层墙墩 + 招牌带 + 标准层窗间墙）
    W = Batch('walls_ext')
    for k in range(1, NF):
        z0 = fz(k)
        W.box(X0, X1, Y0, Y0 + T, z0, z0 + WS, TILE)                           # 窗台下
        W.box(X0, X1, Y0, Y0 + T, z0 + WS + WH, z0 + FH, TILE)                 # 窗头上
        W.box(X0 - 0.05, X1 + 0.05, Y0 - 0.12, Y0, z0 - 0.12, z0 + 0.06, RENDER)   # 楼层腰线
        xs = [X0] + sum([[c - WW / 2, c + WW / 2] for c in BAYS], []) + [X1]
        for i in range(0, len(xs), 2):
            W.box(xs[i], xs[i + 1], Y0, Y0 + T, z0 + WS, z0 + WS + WH, TILE)
    # 侧墙 / 背墙（东侧墙有窗）
    W.box(X0 - T, X0, Y0, Y1, 0, TOP, RENDER)
    W.box(X0, X1, Y1 - T, Y1, 0, TOP, RENDER)
    for k in range(1, NF):
        z0 = fz(k)
        W.box(X1, X1 + T, Y0, Y1, z0, z0 + WS, TILE)
        W.box(X1, X1 + T, Y0, Y1, z0 + WS + WH, z0 + FH, TILE)
        ys = [Y0, 13.0, 14.2, 19.0, 20.2, Y1]
        for i in range(0, len(ys), 2):
            W.box(X1, X1 + T, ys[i], ys[i + 1], z0 + WS, z0 + WS + WH, TILE)
    W.box(X1, X1 + T, Y0, Y1, 0, GH, PLINTH)
    # 首层：墙墩 + 招牌带
    piers = [X0, -6.0, -3.0, 0.0, 6.0, X1]
    for x in piers:
        W.box(max(X0, x - 0.3), min(X1, x + 0.3), Y0 - 0.05, Y0 + T, 0, GH, PLINTH)
    W.box(X0, X1, Y0 - 0.05, Y0 + T, 3.3, GH, RENDER)
    # 窗（玻璃 + 铝框）；玩家房间那扇是推拉窗半开
    G = Batch('windows')
    for k in range(1, NF):
        z0 = fz(k)
        for c in BAYS:
            if c == STAIR:
                continue
            zs, ze = z0 + WS, z0 + WS + WH
            G.box(c - WW / 2, c + WW / 2, Y0 + 0.06, Y0 + 0.1, zs, zs + 0.05, ALU)
            G.box(c - WW / 2, c + WW / 2, Y0 + 0.06, Y0 + 0.1, ze - 0.05, ze, ALU)
            G.box(c - WW / 2, c - WW / 2 + 0.05, Y0 + 0.06, Y0 + 0.1, zs, ze, ALU)
            G.box(c + WW / 2 - 0.05, c + WW / 2, Y0 + 0.06, Y0 + 0.1, zs, ze, ALU)
            if k == ROOM_F and c == ROOM_BAY:
                for dy in (0.07, 0.1):   # 两扇都推到左半边，右半边敞开
                    G.box(c - WW / 2 + 0.05, c - 0.02, Y0 + dy - 0.012, Y0 + dy + 0.012, zs + 0.05, ze - 0.05, GLASS)
                    G.box(c - 0.06, c - 0.02, Y0 + dy - 0.02, Y0 + dy + 0.02, zs + 0.05, ze - 0.05, ALU)
                continue
            G.box(c - 0.02, c + 0.02, Y0 + 0.06, Y0 + 0.1, zs, ze, ALU)
            G.box(c - WW / 2 + 0.05, c + WW / 2 - 0.05, Y0 + 0.07, Y0 + 0.09, zs + 0.05, ze - 0.05, GLASS)
        for yc in (13.6, 19.6):
            G.box(X1 + 0.06, X1 + 0.09, yc - 0.6, yc + 0.6, z0 + WS, z0 + WS + WH, GLASS)
    # 楼梯间：错层竖条窗（亮灯）
    for k in range(1, NF):
        z0 = fz(k) + 1.5
        G.box(STAIR - 0.5, STAIR + 0.5, Y0 + 0.05, Y0 + 0.1, z0 - 0.4, z0 + 1.2, SHOPG)
    # 背后的暗室（让开着的窗后面不是空壳）：楼体内部整块用室内墙色的盒子挡住（玩家房间位置挖空，由 props_room 自己封闭）
    I = Batch('bg_interior')
    zr0 = fz(ROOM_F)
    I.box(X0, X1, Y0 + 3.0, Y1 - T, GH, zr0 - 0.05, WALLI)
    I.box(X0, X1, Y0 + 3.0, Y1 - T, zr0 + FH - 0.1, TOP, WALLI)
    I.box(X0, ROOM_BAY - 1.5, Y0 + 3.0, Y1 - T, zr0 - 0.05, zr0 + FH - 0.1, WALLI)
    I.box(ROOM_BAY + 1.5, X1, Y0 + 3.0, Y1 - T, zr0 - 0.05, zr0 + FH - 0.1, WALLI)
    I.box(ROOM_BAY - 1.5, ROOM_BAY + 1.5, Y0 + 4.8, Y1 - T, zr0 - 0.05, zr0 + FH - 0.1, WALLI)

    # ------------------------------------------------------------ 屋面：女儿墙、水箱、楼梯间出屋面小屋、天线
    R = Batch('roof')
    R.box(X0 - T, X1 + T, Y0, Y1, TOP, TOP + 0.25, CONC)
    for (a0, a1, b0, b1) in ((X0 - T, X1 + T, Y0 - 0.05, Y0 + 0.15), (X0 - T, X1 + T, Y1 - 0.2, Y1),
                             (X0 - T, X0, Y0, Y1), (X1, X1 + T, Y0, Y1)):
        R.box(a0, a1, b0, b1, TOP + 0.25, TOP + 1.3, RENDER)
    R.box(STAIR - 1.6, STAIR + 1.6, 14.0, 18.5, TOP + 0.25, TOP + 3.0, RENDER)
    R.box(STAIR - 1.8, STAIR + 1.8, 13.8, 18.7, TOP + 3.0, TOP + 3.2, CONC)
    R.cyl(STAIR, 16.2, TOP + 3.2, 1.1, 1.8, CONC, 20)
    for (x, y) in ((7.5, 18.0), (-8.0, 16.5)):
        R.boxc(x, y, TOP + 0.25, 2.2, 2.0, 1.6, ACM)
    R.tube([(4.0, 15.0, TOP + 0.25), (4.0, 15.0, TOP + 5.0)], 0.04, STEEL, n=6)
    R.tube([(3.4, 15.0, TOP + 4.2), (4.6, 15.0, TOP + 4.2)], 0.02, STEEL, n=4)

    # ------------------------------------------------------------ 阳台、空调、防盗网、水管、晾衣架
    P = Batch('props_balconies')
    bal = {(k, c) for k in range(1, NF) for c in (BAYS[0], BAYS[1], BAYS[6], BAYS[7]) if rnd.random() < 0.7}
    for (k, c) in sorted(bal):
        z0 = fz(k)
        P.box(c - 1.45, c + 1.45, Y0 - 1.1, Y0, z0 - 0.15, z0 + 0.05, CONC)
        P.box(c - 1.45, c + 1.45, Y0 - 1.1, Y0 - 1.0, z0 + 0.05, z0 + 0.55, TILE)    # 矮墙
        P.box(c - 1.45, c + 1.45, Y0 - 1.12, Y0 - 0.98, z0 + 1.05, z0 + 1.1, RUST)   # 扶手
        for i in range(11):
            x = c - 1.4 + i * 0.28
            P.box(x - 0.012, x + 0.012, Y0 - 1.06, Y0 - 1.04, z0 + 0.55, z0 + 1.05, RUST)
        for s in (-1, 1):
            P.box(c + s * 1.45 - 0.05, c + s * 1.45 + 0.05, Y0 - 1.1, Y0, z0 + 0.05, z0 + 1.1, TILE)
        # 伸出去的晾衣杆 + 衣物
        if rnd.random() < 0.75:
            for s in (-0.9, 0.9):
                P.tube([(c + s, Y0 - 1.05, z0 + 1.1), (c + s, Y0 - 1.9, z0 + 1.55)], 0.018, ALU, n=5)
            for yy in (Y0 - 1.5, Y0 - 1.85):
                P.tube([(c - 1.0, yy, z0 + 1.35 + (Y0 - 1.05 - yy) * 0.1), (c + 1.0, yy, z0 + 1.35 + (Y0 - 1.05 - yy) * 0.1)], 0.015, ALU, n=4)
                x = c - 0.9
                while x < c + 0.8:
                    w = rnd.uniform(0.25, 0.55); h = rnd.uniform(0.4, 0.8)
                    zt = z0 + 1.38 + (Y0 - 1.05 - yy) * 0.1
                    P.poly([(x, yy, zt), (x + w, yy, zt), (x + w, yy + 0.02, zt - h), (x, yy + 0.02, zt - h)], [(0, 1, 2, 3), (3, 2, 1, 0)],
                           CLOTH[rnd.randrange(len(CLOTH))])
                    x += w + rnd.uniform(0.05, 0.2)
        P.box(c - 0.7, c + 0.7, Y0 + 0.04, Y0 + 0.08, z0 + 0.05, z0 + 2.3, DOOR)     # 阳台门（盖住窗洞下半）
    for k in range(1, NF):
        z0 = fz(k)
        for c in BAYS:
            if (k, c) in bal or c == STAIR or (k == ROOM_F and c == ROOM_BAY):
                continue
            r = rnd.random()
            if r < 0.55:   # 窗机空调：挂在窗台下
                ax = c + rnd.choice((-0.35, 0.35))
                P.box(ax - 0.36, ax + 0.36, Y0 - 0.55, Y0, z0 + 0.25, z0 + 0.8, ACM)
                P.box(ax - 0.3, ax + 0.3, Y0 - 0.56, Y0 - 0.54, z0 + 0.3, z0 + 0.75, ACG)
                P.box(ax - 0.34, ax - 0.3, Y0 - 0.55, Y0, z0 + 0.15, z0 + 0.25, RUST)
                P.box(ax + 0.3, ax + 0.34, Y0 - 0.55, Y0, z0 + 0.15, z0 + 0.25, RUST)
            if k <= 3 and rnd.random() < 0.6 or r > 0.85:   # 防盗网（外凸铁笼）
                zs, ze = z0 + WS - 0.05, z0 + WS + WH + 0.05
                d = 0.32
                P.box(c - WW / 2 - 0.05, c + WW / 2 + 0.05, Y0 - d, Y0, zs - 0.03, zs, RUST)
                P.box(c - WW / 2 - 0.05, c + WW / 2 + 0.05, Y0 - d, Y0, ze, ze + 0.03, RUST)
                for i in range(9):
                    x = c - WW / 2 + i * WW / 8
                    P.box(x - 0.01, x + 0.01, Y0 - d - 0.01, Y0 - d + 0.01, zs, ze, RUST)
                P.box(c - WW / 2 - 0.05, c + WW / 2 + 0.05, Y0 - d - 0.012, Y0 - d + 0.012, (zs + ze) / 2 - 0.01, (zs + ze) / 2 + 0.01, RUST)
    # 外墙水管（竖管 + 每层支管）、空调冷凝水管
    for x in (-4.6, 4.6, 10.9 + 1.2):
        P.cyl(x, Y0 - 0.12, 0.3, 0.07, TOP + 0.9, PIPE, 10)
        for k in range(1, NF):
            P.tube([(x, Y0 - 0.12, fz(k) + 0.4), (x + 0.5, Y0 - 0.12, fz(k) + 0.55)], 0.04, PIPE, n=6)
    for y in (12.0, 17.5):
        P.cyl(X1 + 0.35, y, 0.3, 0.07, TOP, PIPE, 10)

    # ------------------------------------------------------------ 首层铺面 + 楼梯间入口
    S = Batch('props_shops')
    shops = [(-6.0, -3.0, 1), (0.0, 6.0, 2), (6.0, X1, 3)]
    for (a, b, si) in shops:
        a0, b0 = a + 0.3, b - 0.3 if b < X1 else b - 0.3
        S.box(a0, b0, Y0 + 0.08, Y0 + 0.12, 0.15, 2.9, SHOPG)
        for x in (a0, (a0 + b0) / 2, b0):
            S.box(x - 0.04, x + 0.04, Y0 + 0.02, Y0 + 0.12, 0.15, 2.9, STEEL)
        S.box(a0, b0, Y0 + 0.02, Y0 + 0.12, 2.9, 3.3, SHUT)          # 卷帘盒
        S.box(a0, b0, Y0 + 0.02, Y0 + 0.12, 0.15, 0.45, STEEL)
    for (a, b, cc) in ((-5.8, -3.2, (0.15, 0.35, 0.55)), (0.2, 5.8, (0.2, 0.45, 0.3)), (6.2, 11.8, (0.6, 0.5, 0.15))):
        am = C.flat('awn_%d' % int(a * 10), cc, 0.8, noise=0.2)
        S.poly([(a, Y0, 3.25), (b, Y0, 3.25), (b, Y0 - 1.3, 2.8), (a, Y0 - 1.3, 2.8)], [(0, 1, 2, 3), (3, 2, 1, 0)], am)
        S.box(a, b, Y0 - 1.32, Y0 - 1.28, 2.6, 2.8, am)
    # 楼梯间入口：凹进去的门洞、灯、铁闸
    S.box(-2.7, -0.3, Y0 + 0.1, Y0 + 1.5, 0.15, 0.2, CONC)
    S.box(-2.7, -2.6, Y0, Y0 + 1.5, 0.15, 3.3, TILE)
    S.box(-0.4, -0.3, Y0, Y0 + 1.5, 0.15, 3.3, TILE)
    S.box(-2.6, -0.4, Y0 + 1.5, Y0 + 1.6, 0.15, 3.3, WALLI)
    S.box(-2.6, -0.4, Y0, Y0 + 1.5, 3.2, 3.3, WALLI)
    S.box(-1.9, -1.1, Y0 + 1.3, Y0 + 1.5, 3.0, 3.2, LAMPW)
    for i in range(13):
        x = -2.55 + i * 0.17
        S.box(x - 0.012, x + 0.012, Y0 + 0.2, Y0 + 0.23, 0.2, 2.6, RUST)
    S.box(-2.6, -0.4, Y0 + 0.19, Y0 + 0.24, 2.55, 2.65, RUST)
    S.box(-2.6, -0.4, Y0 + 0.19, Y0 + 0.24, 1.1, 1.18, RUST)
    for k in range(3):   # 门内几级台阶
        S.box(-2.6, -0.4, Y0 + 1.0 + k * 0.17, Y0 + 1.5, 0.2 + k * 0.15, 0.35 + k * 0.15, CONC)
    S.box(-2.8, -0.2, Y0 - 0.6, Y0, 3.3, 3.4, STEEL)                  # 小雨篷
    # 铺面里的暖光
    for (a, b, si) in shops:
        S.box(a + 0.3, b - 0.3, Y0 + 3.0, Y0 + 3.1, 0.15, 3.3, INT)

    # ------------------------------------------------------------ 早餐店（最西一间 x -12..-6：敞开门面）
    Bk = Batch('props_breakfast')
    bx0, bx1 = X0 + 0.3, -6.3
    Bk.box(bx0, bx1, Y0, Y1 - 6, 0.14, 0.15, FLOORV)
    Bk.box(bx0, bx1, Y1 - 6.2, Y1 - 6, 0.15, 3.3, C.flat('bk_tile', (0.85, 0.85, 0.82), 0.3, noise=0.1))
    Bk.box(bx0, bx1, Y0, Y1 - 6, 3.2, 3.3, INT)
    for x in (bx0 + 1.2, (bx0 + bx1) / 2, bx1 - 1.2):
        Bk.box(x - 0.5, x + 0.5, Y0 + 2.0, Y0 + 2.2, 3.1, 3.2, LAMPC)
    # 门口不锈钢台 + 蒸笼（每摞 4–6 层，最上一层有盖）+ 蒸汽
    Bk.box(bx0 + 0.2, bx0 + 2.8, Y0 - 0.75, Y0 + 0.05, 0.15, 1.0, STAINLESS)
    Bk.box(bx0 + 3.0, bx1 - 0.2, Y0 + 0.5, Y0 + 1.2, 0.15, 1.0, STAINLESS)   # 店内柜台
    for (sx, sy, n) in ((bx0 + 0.75, Y0 - 0.35, 6), (bx0 + 1.55, Y0 - 0.35, 5), (bx0 + 2.35, Y0 - 0.35, 4)):
        Bk.cyl(sx, sy, 1.0, 0.36, 0.1, STAINLESS, 20)   # 锅
        for i in range(n):
            Bk.cyl(sx, sy, 1.1 + i * 0.1, 0.33, 0.09, BAMBOO, 20)
        Bk.cyl(sx, sy, 1.1 + n * 0.1, 0.33, 0.06, BAMBOO, 20, r2=0.12)
        Bk.sphere(sx, sy, 1.8 + n * 0.1, 0.45, STEAM, sz=1.8, seg=12, rings=8, sx=0.9)
    AWN = [C.flat('awning_a', (0.75, 0.2, 0.12), 0.8, noise=0.2), C.flat('awning_b', (0.85, 0.8, 0.7), 0.8, noise=0.2)]
    for i in range(12):   # 条纹雨篷
        a = X0 + 0.3 + i * 0.475
        Bk.poly([(a, Y0, 3.3), (a + 0.475, Y0, 3.3), (a + 0.475, Y0 - 1.8, 2.75), (a, Y0 - 1.8, 2.75)], [(0, 1, 2, 3), (3, 2, 1, 0)], AWN[i % 2])
        Bk.poly([(a, Y0 - 1.8, 2.75), (a + 0.475, Y0 - 1.8, 2.75), (a + 0.475, Y0 - 1.8, 2.5), (a, Y0 - 1.8, 2.5)], [(0, 1, 2, 3), (3, 2, 1, 0)], AWN[i % 2])
    for (sx, sy, n) in ((bx0 + 0.75, Y0 - 0.35, 6), (bx0 + 1.55, Y0 - 0.35, 5), (bx0 + 2.35, Y0 - 0.35, 4)):   # 蒸汽缕
        for j in range(3):
            Bk.sphere(sx + rnd.uniform(-0.1, 0.1), sy - 0.2 - j * 0.3, 2.0 + n * 0.1 + j * 0.35, 0.25 + j * 0.1, STEAM, sz=1.6, seg=10, rings=6)
    # 塑料桌凳（人行道上）
    for (tx, ty, ci) in ((-11.0, 8.0, 0), (-9.2, 8.3, 1), (-7.4, 8.0, 0), (-10.2, 6.2, 2), (-8.2, 6.3, 1), (-6.4, 6.4, 2)):
        pm = PLAST[ci]
        Bk.box(tx - 0.4, tx + 0.4, ty - 0.4, ty + 0.4, PV + 0.7, PV + 0.74, pm)
        for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
            Bk.cyl(tx + ex * 0.33, ty + ey * 0.33, PV, 0.02, 0.7, pm, 6)
        for (dx, dy) in ((-0.65, 0.0), (0.65, 0.0), (0.0, 0.7)):
            ox, oy = tx + dx + rnd.uniform(-0.08, 0.08), ty + dy + rnd.uniform(-0.08, 0.08)
            Bk.cyl(ox, oy, PV + 0.42, 0.16, 0.03, PLAST[(ci + 1) % 3 if dy else ci], 14)
            Bk.cyl(ox, oy, PV, 0.14, 0.42, PLAST[(ci + 1) % 3 if dy else ci], 14, r2=0.12, cap=False)

    # ------------------------------------------------------------ 灯箱 + 全息广告（只有色块）
    Sg = Batch('props_signs')
    for (a, b, si) in [(X0, -6.0, 0)] + shops:
        Sg.box(a + 0.4, b - 0.4, Y0 - 0.25, Y0 - 0.05, 3.4, 4.05, SIGN[si])
    for (x, z, si) in ((-9.0, 5.5, 1), (8.5, 5.0, 2), (3.0, 4.6, 3)):   # 竖向伸出式灯箱
        Sg.box(x - 0.1, x + 0.1, Y0 - 1.3, Y0 - 0.1, z, z + 2.4, SIGN[si])
        Sg.box(x - 0.03, x + 0.03, Y0 - 0.3, Y0, z + 0.2, z + 0.26, STEEL)
        Sg.box(x - 0.03, x + 0.03, Y0 - 0.3, Y0, z + 2.1, z + 2.16, STEEL)
    # 东山墙上的大全息屏（悬浮车广告位）
    board(Sg, (-4.2, Y0 - 0.2, 7.6), (0, -1, 0), (-1, 0, 0), 3.4, 4.6, [HOLO2, HOLO1, HOLO3], STEEL, LAMPC)
    board(Sg, (-4.2, Y0 - 3.6, 7.6), (0, 1, 0), (1, 0, 0), 3.4, 4.6, [HOLO1, HOLO3, HOLO2], STEEL, LAMPC)
    board(Sg, (X1 + 0.3, 19.0, 8.2), (0, -1, 0), (1, 0, 0), 7.6, 8.0, [HOLO1, HOLO3, HOLO2], STEEL, LAMPC)
    # 街角旋转全息柱（美容诊所广告位）：底座 + 三片错开角度的面板
    hx, hy = 13.3, 6.0
    Sg.cyl(hx, hy, PV, 0.5, 0.6, STEEL, 20)
    Sg.cyl(hx, hy, PV + 0.6, 0.08, 3.2, STEEL, 10)
    for i in range(3):
        a = i * math.pi / 3 + 0.4
        dx, dy = 1.1 * math.cos(a), 1.1 * math.sin(a)
        Sg.poly([(hx - dx, hy - dy, PV + 1.2), (hx + dx, hy + dy, PV + 1.2), (hx + dx, hy + dy, PV + 4.2), (hx - dx, hy - dy, PV + 4.2)],
                [(0, 1, 2, 3), (3, 2, 1, 0)], HOLO2 if i % 2 else HOLO1)

    # ------------------------------------------------------------ 地铁出入口（人行道上，楼梯向 +x 下行）
    Mt = Batch('props_metro')
    mx0, mx1, my0, my1 = 5.5, 11.5, 6.0, 8.2
    nst = 20
    for i in range(nst):
        x = mx0 + i * (mx1 - 1.0 - mx0) / nst
        Mt.box(x, mx1, my0, my1, -3.6, PV - (i + 1) * (PV + 3.6) / nst, CONC)
    for y in (my0 - 0.2, my1):
        Mt.box(mx0, mx1 + 0.2, y, y + 0.2, -3.8, PV + 0.9, RENDER)
        Mt.box(mx0, mx1 + 0.2, y - 0.02, y + 0.22, PV + 0.9, PV + 0.98, STEEL)
    Mt.box(mx0 - 0.2, mx0, my0 - 0.2, my1 + 0.2, -0.5, PV + 0.9, RENDER)
    MW = C.flat('metro_wall', (0.85, 0.88, 0.9), 0.3)
    Mt.box(mx1 + 3.0, mx1 + 3.2, my0 - 1.5, my1 + 1.5, -3.8, 0.0, C.flat('metro_glow', (0.85, 0.9, 0.92), 0.3, emit=(0.85, 0.93, 1.0), estr=2.5))
    Mt.box(mx1 - 0.2, mx1 + 3.0, my0 - 1.5, my1 + 1.5, -0.2, 0.0, MW)            # 下层大厅顶板（楼梯尽头继续往里走）
    Mt.box(mx1 - 0.2, mx1 + 3.0, my0 - 1.7, my0 - 1.5, -3.8, 0.0, MW)
    Mt.box(mx1 - 0.2, mx1 + 3.0, my1 + 1.5, my1 + 1.7, -3.8, 0.0, MW)
    Mt.box(mx1 - 1.0, mx1 + 3.0, my0 - 1.5, my1 + 1.5, -3.8, -3.6, CONC)
    Mt.box(mx1 - 0.1, mx1 + 2.9, my0 - 1.4, my1 + 1.4, -0.35, -0.25, LAMPC)
    for y in (my0 + 0.08, my1 - 0.08):   # 扶手
        Mt.tube([(mx0 - 0.3, y, PV + 0.9), (mx0, y, PV + 0.9), (mx1 - 1.0, y, -3.6 + 0.9), (mx1 - 0.4, y, -3.6 + 0.9)], 0.025, ALU, n=6)
        for t in (0.0, 0.33, 0.66, 1.0):
            x = mx0 + t * (mx1 - 1.0 - mx0); zb = PV - t * (PV + 3.6)
            Mt.cyl(x, y, zb, 0.02, 0.9, ALU, 6)
    Mt.tube([(mx0 - 0.3, (my0 + my1) / 2, PV + 0.9), (mx1 - 1.0, (my0 + my1) / 2, -3.6 + 0.9)], 0.025, ALU, n=6)
    # 雨棚：钢框 + 磨砂玻璃单坡顶
    for x in (mx0 - 0.1, (mx0 + mx1) / 2, mx1 + 0.1):
        for y in (my0 - 0.1, my1 + 0.1):
            Mt.box(x - 0.06, x + 0.06, y - 0.06, y + 0.06, PV + 0.9, 3.1 - (x - mx0) * 0.03, STEEL)
    Mt.poly([(mx0 - 0.4, my0 - 0.5, 3.15), (mx1 + 0.4, my0 - 0.5, 2.95), (mx1 + 0.4, my1 + 0.5, 2.95), (mx0 - 0.4, my1 + 0.5, 3.15)],
            [(0, 1, 2, 3), (3, 2, 1, 0)], C.glass('canopy_glass', (0.3, 0.35, 0.38), 0.25))
    Mt.box(mx0 - 0.4, mx1 + 0.4, my0 - 0.55, my0 - 0.45, 2.75, 3.15, STEEL)
    Mt.box(mx0 - 0.3, mx0 + 1.5, my0 - 0.58, my0 - 0.55, 2.8, 3.1, SIGN[2])   # 入口色块标识（无字）
    MLED = C.flat('metro_led', (0.8, 0.95, 1.0), 0.3, emit=(0.75, 0.9, 1.0), estr=25.0)
    Mt.box(mx0, mx1, my0, my1, 2.85, 2.9, MLED)
    Mt.box(mx0 - 0.4, mx1 + 0.4, my0 - 0.6, my0 - 0.5, 2.78, 2.88, MLED)
    Mt.box(mx0 - 0.4, mx0 - 0.3, my0 - 0.6, my1 + 0.5, 2.9, 3.0, MLED)
    Mt.cyl(mx0 - 0.9, my0 - 0.4, PV, 0.15, 3.2, STEEL, 12)                    # 入口灯柱（色块，无字）
    Mt.box(mx0 - 1.15, mx0 - 0.65, my0 - 0.65, my0 - 0.15, 2.4, 3.3, SIGN[2])

    # ------------------------------------------------------------ 玩家的房间（五楼 ROOM_BAY 开间）
    Rm = Batch('props_room')
    z0 = fz(ROOM_F)
    rx0, rx1, ry0, ry1 = ROOM_BAY - 1.38, ROOM_BAY + 1.38, Y0 + T, Y0 + 4.6
    Rm.box(rx0, rx1, ry0, ry1, z0, z0 + 0.05, FLOORV)
    Rm.box(rx0, rx1, ry0, ry1, z0 + FH - 0.25, z0 + FH - 0.2, WALLI)
    Rm.box(rx0 - 0.1, rx0, ry0, ry1, z0, z0 + FH - 0.2, WALLI)
    Rm.box(rx1, rx1 + 0.1, ry0, ry1, z0, z0 + FH - 0.2, WALLI)
    Rm.box(rx0, rx1, ry1, ry1 + 0.1, z0, z0 + FH - 0.2, WALLI)
    wx0, wx1 = ROOM_BAY - WW / 2, ROOM_BAY + WW / 2
    for (a, b, c0, c1) in ((rx0, wx0, z0, z0 + FH - 0.2), (wx1, rx1, z0, z0 + FH - 0.2), (wx0, wx1, z0, z0 + WS), (wx0, wx1, z0 + WS + WH, z0 + FH - 0.2)):
        Rm.box(a, b, ry0, ry0 + 0.02, c0, c1, WALLI)
    Rm.box(rx0, rx1, ry0 + 0.02, ry0 + 0.04, z0 + 0.05, z0 + 0.15, WOOD)
    Rm.box(rx0, rx0 + 0.02, ry0, ry1, z0 + 0.05, z0 + 0.15, WOOD)
    Rm.box(rx1 - 0.02, rx1, ry0, ry1, z0 + 0.05, z0 + 0.15, WOOD)
    Rm.cyl(ROOM_BAY, ry0 + 2.3, z0 + FH - 0.32, 0.02, 0.1, ALU, 6)
    Rm.cyl(ROOM_BAY, ry0 + 2.3, z0 + FH - 0.5, 0.25, 0.18, C.flat('shade', (0.9, 0.88, 0.8), 0.6, emit=(1.0, 0.85, 0.62), estr=2.0), 20, r2=0.08, cap=False)
    Rm.box(ROOM_BAY - 0.3, ROOM_BAY + 0.3, ry0 + 2.0, ry0 + 2.6, z0 + FH - 0.28, z0 + FH - 0.25, LAMPW)
    # 窗下书桌 + 椅子
    dz = z0 + 0.75
    Rm.box(ROOM_BAY - 0.6, ROOM_BAY + 0.6, ry0 + 0.03, ry0 + 0.6, dz - 0.03, dz, WOOD)
    for (ex, ey) in ((-1, 0), (1, 0)):
        Rm.box(ROOM_BAY + ex * 0.57 - 0.03, ROOM_BAY + ex * 0.57 + 0.03, ry0 + 0.05, ry0 + 0.58, z0 + 0.05, dz - 0.03, WOOD)
    Rm.box(ROOM_BAY - 0.08, ROOM_BAY + 0.18, ry0 + 0.1, ry0 + 0.3, dz, dz + 0.02, LINEN)   # 一本摊开的本子
    cx, cy = ROOM_BAY - 0.1, ry0 + 0.95
    Rm.box(cx - 0.21, cx + 0.21, cy - 0.2, cy + 0.2, z0 + 0.45, z0 + 0.48, WOOD)
    for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        Rm.box(cx + ex * 0.18 - 0.02, cx + ex * 0.18 + 0.02, cy + ey * 0.17 - 0.02, cy + ey * 0.17 + 0.02, z0 + 0.05, z0 + 0.45, WOOD)
    for ex in (-1, 1):
        Rm.box(cx + ex * 0.18 - 0.02, cx + ex * 0.18 + 0.02, cy + 0.15, cy + 0.2, z0 + 0.48, z0 + 0.95, WOOD)
    Rm.box(cx - 0.2, cx + 0.2, cy + 0.16, cy + 0.19, z0 + 0.72, z0 + 0.92, WOOD)
    Rm.box(cx - 0.16, cx + 0.16, cy + 0.16, cy + 0.19, z0 + 0.55, z0 + 0.6, WOOD)
    # 靠东墙的单人床
    bx, by0, by1 = rx1 - 0.95, ry0 + 1.5, ry0 + 3.5
    Rm.box(bx, rx1 - 0.02, by0, by1, z0 + 0.05, z0 + 0.35, WOOD)
    Rm.box(bx + 0.03, rx1 - 0.05, by0 + 0.03, by1 - 0.03, z0 + 0.35, z0 + 0.52, C.flat('mattress', (0.85, 0.85, 0.82), 0.8))
    Rm.box(bx + 0.02, rx1 - 0.04, by0 + 0.5, by1 - 0.02, z0 + 0.52, z0 + 0.58, LINEN)
    Rm.box(bx + 0.15, rx1 - 0.2, by1 - 0.45, by1 - 0.08, z0 + 0.52, z0 + 0.64, C.flat('pillow', (0.9, 0.9, 0.88), 0.8))
    Rm.box(bx, rx1 - 0.02, by1 - 0.04, by1, z0 + 0.35, z0 + 0.95, WOOD)
    # 墙角小冰箱（西南角）
    Rm.box(rx0 + 0.02, rx0 + 0.5, ry0 + 0.05, ry0 + 0.55, z0 + 0.05, z0 + 0.9, FRIDGE)
    Rm.box(rx0 + 0.45, rx0 + 0.47, ry0 + 0.15, ry0 + 0.18, z0 + 0.55, z0 + 0.8, ALU)
    Rm.box(rx0 + 0.1, rx0 + 0.42, ry0 + 0.15, ry0 + 0.45, z0 + 0.9, z0 + 0.92, LINEN)   # 冰箱顶的垫布
    # 卫生间（西北角）：隔墙 + 半开的门 + 洗手盆 + 带裂纹的小镜子
    wy = ry1 - 1.3
    Rm.box(rx0, rx0 + 1.3, wy - 0.06, wy, z0, z0 + FH - 0.2, WALLI)
    Rm.box(rx0 + 1.3, rx0 + 1.36, wy - 0.06, wy + 0.0, z0, z0 + 2.05, WALLI)
    Rm.box(rx0 + 1.36, rx0 + 1.42, wy - 0.06, ry1, z0 + 2.05, z0 + FH - 0.2, WALLI)
    Rm.box(rx0 + 1.36, rx0 + 1.42, wy + 0.75, ry1, z0, z0 + 2.05, WALLI)
    Rm.poly([(rx0 + 1.36, wy - 0.02, z0 + 0.05), (rx0 + 1.36 - 0.55, wy - 0.45, z0 + 0.05),
             (rx0 + 1.36 - 0.55, wy - 0.45, z0 + 2.0), (rx0 + 1.36, wy - 0.02, z0 + 2.0)], [(0, 1, 2, 3), (3, 2, 1, 0)], DOOR)
    Rm.box(rx0 + 0.02, rx0 + 1.3, wy, ry1, z0 + 0.05, z0 + 0.06, C.flat('bath_tile', (0.8, 0.82, 0.8), 0.3))
    Rm.box(rx0 + 0.35, rx0 + 0.95, ry1 - 0.45, ry1, z0 + 0.8, z0 + 0.9, FRIDGE)
    Rm.box(rx0 + 0.45, rx0 + 0.85, ry1 - 0.03, ry1, z0 + 1.2, z0 + 1.7, MIRROR)
    for (a, b) in (((0.55, 1.62), (0.7, 1.4)), ((0.7, 1.4), (0.8, 1.25)), ((0.7, 1.4), (0.62, 1.22))):
        Rm.tube([(rx0 + a[0], ry1 - 0.035, z0 + a[1]), (rx0 + b[0], ry1 - 0.035, z0 + b[1])], 0.006, CRACK, n=3)

    # ------------------------------------------------------------ 街道：浅灰复合材料路面（雨后湿亮）、人行道、树池
    Gd = Batch('site_ground')
    Gd.box(-80, 80, -5, 5, -0.2, 0.0, ROAD)
    Gd.box(13.0, 19.0, 5, 60, -0.2, 0.0, ROAD)
    for (a, b) in ((-80, mx0 - 0.2), (mx1 + 0.2, 12.8)):
        Gd.box(a, b, 5, Y0, -0.2, PV, PAVE)
    Gd.box(mx0 - 0.2, mx1 + 0.2, 5, my0 - 0.2, -0.2, PV, PAVE)
    Gd.box(mx0 - 0.2, mx1 + 0.2, my1 + 0.2, Y0, -0.2, PV, PAVE)
    Gd.box(mx0, mx1, my0, my1, -3.8, -3.6, CONC)
    Gd.box(19.2, 80, 5, 10, -0.2, PV, PAVE)
    Gd.box(-80, 80, -10, -5, -0.2, PV, PAVE)
    for (a, b, c0, c1) in ((-80, 12.8, 4.85, 5.0), (-80, 80, -5.0, -4.85), (12.8, 13.0, 5, 60), (19.0, 19.2, 5, 60)):
        Gd.box(a, b, c0, c1, -0.2, PV, CURB)
    LANE = C.flat('lane', (0.78, 0.78, 0.76), 0.3)
    for i in range(-20, 21):
        if 12.0 < i * 4 < 20.0: continue
        Gd.box(i * 4 - 1, i * 4 + 0.6, -0.06, 0.06, 0.0, 0.004, LANE)
    # 地上浅水洼（非常薄、镜面）
    PUDS = [C.flat('puddle_%d' % i, (0.06, 0.06, 0.07), r_, coat=0.0) for i, r_ in enumerate((0.02, 0.08, 0.18))]
    for _ in range(40):
        x, y = rnd.uniform(-40, 40), rnd.choice((rnd.uniform(-4.6, 4.6), rnd.uniform(5.2, 9.5)))
        r = rnd.uniform(0.2, 1.8)
        n = 12
        vs = [(x + r * math.cos(i * math.tau / n) * rnd.uniform(0.7, 1.2), y + r * 0.6 * math.sin(i * math.tau / n) * rnd.uniform(0.7, 1.2), 0.006 if abs(y) < 5 else PV + 0.006) for i in range(n)]
        Gd.poly(vs, [tuple(range(n))], rnd.choice(PUDS))
    for (x, y) in ((-15.5, 5.8), (-30.0, 5.8), (-26.0, 5.8), (-10.0, -5.8), (-22.0, -5.8), (24.0, 5.8)):
        Gd.box(x - 0.6, x + 0.6, y - 0.55, y + 0.55, PV, PV + 0.01, C.flat('soil', (0.08, 0.07, 0.06), 0.9))
    for x in [4.8 + i * 1.2 for i in range(6)] + [12.3]:   # 护柱
        Gd.cyl(x, 5.35, PV, 0.1, 0.9, STEEL, 10)
        Gd.cyl(x, 5.35, PV + 0.75, 0.105, 0.06, CURB, 10)
    for (x, y, s) in ((-20.0, 5.4, -1), (0.0, 5.4, -1), (20.0, 5.4, -1), (-8.0, -5.4, 1), (12.0, -5.4, 1)):   # 路灯
        Gd.cyl(x, y, PV, 0.09, 6.5, STEEL, 10)
        Gd.tube([(x, y, PV + 6.4), (x, y + s * 0.4, PV + 6.9), (x, y + s * 1.6, PV + 7.0)], 0.05, STEEL, n=6)
        Gd.box(x - 0.18, x + 0.18, y + s * 1.4 - 0.35, y + s * 1.4 + 0.35, PV + 6.85, PV + 6.95, STEEL)
        Gd.box(x - 0.15, x + 0.15, y + s * 1.4 - 0.3, y + s * 1.4 + 0.3, PV + 6.82, PV + 6.85, LAMPW)
    Tr = Batch('site_trees')
    for i, (x, y) in enumerate(((-15.5, 5.8), (-30.0, 5.8), (-26.0, 5.8), (-10.0, -5.8), (-22.0, -5.8), (24.0, 5.8))):
        C.tree(Tr, x, y, rnd.uniform(5.5, 6.8), rnd.uniform(1.6, 2.1), 'oak', seed=30 + i, z=PV)

    # ------------------------------------------------------------ 早高峰人流（简模、衣着整齐；一部分正从地铁口上来）
    Pp = Batch('props_people')
    PM = {'coat': [C.flat('p_coat_%d' % i, c_, 0.8, noise=0.15) for i, c_ in enumerate(((0.1, 0.12, 0.16), (0.35, 0.3, 0.25), (0.55, 0.52, 0.48), (0.15, 0.2, 0.3), (0.45, 0.12, 0.1), (0.8, 0.8, 0.78), (0.25, 0.3, 0.22)))],
          'pants': [C.flat('p_pants_%d' % i, c_, 0.8) for i, c_ in enumerate(((0.05, 0.05, 0.06), (0.15, 0.17, 0.22), (0.3, 0.28, 0.26)))],
          'skin': [C.flat('p_skin_%d' % i, c_, 0.6) for i, c_ in enumerate(((0.75, 0.58, 0.46), (0.6, 0.43, 0.32), (0.85, 0.68, 0.56)))],
          'hair': [C.flat('p_hair_%d' % i, c_, 0.7) for i, c_ in enumerate(((0.03, 0.025, 0.02), (0.15, 0.1, 0.06), (0.4, 0.38, 0.36)))],
          'shoe': C.flat('p_shoe', (0.03, 0.03, 0.03), 0.4)}
    rp = random.Random(77)
    for k in range(5):   # 楼梯上正上来的人（面向 -x 走出站口）
        t = 0.15 + k * 0.17
        x = mx0 + t * (mx1 - 1.0 - mx0)
        person(Pp, x, my0 + 0.5 + (k % 2) * 1.1, PV - t * (PV + 3.6), math.pi, rp, PM)
    for (x, y, yaw) in ((4.6, 6.8, 2.9), (3.9, 7.9, 3.3), (2.5, 6.3, 3.0), (1.2, 8.6, 3.1), (0.2, 7.0, 2.8), (-1.3, 6.1, 3.2),
                        (-2.4, 8.2, 3.0), (-4.8, 6.6, 3.4), (-5.5, 8.8, 0.1), (-13.5, 7.5, 0.0), (-15.0, 6.2, 3.1),
                        (-18.0, 8.3, 0.05), (4.5, 9.2, 0.2), (12.0, 7.4, 1.6), (-20.0, 6.6, 3.1),
                        (-16.0, -6.5, 0.0), (-12.0, -8.2, 3.1), (-6.0, -7.0, 0.1), (-1.0, -8.8, 3.2), (3.0, -6.4, 0.0),
                        (8.0, -7.6, 3.1), (-9.0, -6.1, 1.6)):
        person(Pp, x, y, PV, yaw, rp, PM)
    # 推婴儿车的人
    person(Pp, -3.2, 7.6, PV, 0.0, rp, PM, h=1.66)
    PR = C.flat('pram', (0.18, 0.22, 0.28), 0.6)
    Pp.box(-2.6, -1.8, 7.35, 7.85, PV + 0.35, PV + 0.75, PR)
    Pp.sphere(-1.95, 7.6, PV + 0.75, 0.3, PR, sz=1.0, seg=12, rings=6, zmin=0.0)
    Pp.tube([(-2.6, 7.4, PV + 0.75), (-2.85, 7.4, PV + 1.0)], 0.015, STEEL, n=4)
    Pp.tube([(-2.6, 7.8, PV + 0.75), (-2.85, 7.8, PV + 1.0)], 0.015, STEEL, n=4)
    Pp.tube([(-2.85, 7.4, PV + 1.0), (-2.85, 7.8, PV + 1.0)], 0.02, STEEL, n=4)
    for (wx, wy) in ((-2.5, 7.35), (-2.5, 7.85), (-1.9, 7.35), (-1.9, 7.85)):
        Pp.cyl(wx, wy, PV + 0.0, 0.1, 0.03, STEEL, 10, rx=True) if False else Pp.sphere(wx, wy, PV + 0.1, 0.1, STEEL, sz=1.0, seg=8, rings=5)

    # ------------------------------------------------------------ 黑色悬浮车（停在横街口）
    Cr = Batch('props_car')
    cx, cy, cz = 13.4, 2.4, 0.75
    Cr.sphere(cx, cy, cz, 1.0, CAR, sz=0.42, seg=28, rings=14, sx=2.5)
    Cr.sphere(cx - 0.2, cy, cz + 0.22, 0.85, CARG, sz=0.45, seg=24, rings=12, sx=1.7, zmin=0.0)
    for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        Cr.cyl(cx + ex * 1.75, cy + ey * 0.95, cz - 0.42, 0.34, 0.2, CAR, 20)
        Cr.cyl(cx + ex * 1.75, cy + ey * 0.95, cz - 0.44, 0.26, 0.02, LAMPC, 16)
    Cr.box(cx + 2.35, cx + 2.42, cy - 0.7, cy + 0.7, cz - 0.05, cz + 0.03, LAMPW)

    # ------------------------------------------------------------ 背景：邻楼、对街铺面、巨构塔楼、磁悬浮高架、上层甲板底面
    SHOPG2 = C.glass('shop_glass2', (0.08, 0.08, 0.08), 0.05, emit=(1.0, 0.85, 0.65), estr=0.35)
    AWNS = [C.flat('awns_%d' % i, c_, 0.8, noise=0.2) for i, c_ in enumerate(((0.5, 0.15, 0.1), (0.12, 0.3, 0.45), (0.2, 0.35, 0.2)))]
    Nb = Batch('bg_neighbours')
    NBW = C.pbr('nb_render', 'concrete_wall_008', 3.0, tint=(0.62, 0.64, 0.66), sat=0.3, weather=0.8)
    NBW2 = C.pbr('nb_render2', 'white_stucco', 3.0, tint=(0.75, 0.66, 0.6), sat=0.3, weather=0.8)
    Nb.box(-40, X0 - T, Y0, 24, 0, 26, NBW)
    Nb.box(19.2, 45, Y0, 30, 0, 34, NBW2)
    for k in range(1, 9):
        z = 4.2 + (k - 1) * 3.0 + 0.9
        for x in range(-38, -13, 3):
            Nb.box(x, x + 1.5, Y0 - 0.02, Y0, z, z + 1.4, GLASS)
        for x in range(21, 44, 3):
            Nb.box(x, x + 1.6, Y0 - 0.02, Y0, z, z + 1.5, GLASS)
        for y in range(12, 29, 3):
            Nb.box(19.18, 19.2, y, y + 1.5, z, z + 1.5, GLASS)
    for (a, b) in ((-40, X0 - T), (19.2, 45)):
        Nb.box(a, b, Y0 - 0.03, Y0, 0.3, 3.0, SHOPG2)
        for xm in range(int(a) + 1, int(b), 3):
            Nb.box(xm - 0.3, xm + 0.3, Y0 - 0.1, Y0, 0.0, 3.3, NBW)
        Nb.box(a, b, Y0 - 0.12, Y0, 0.0, 0.45, STEEL)
        Nb.box(a + 1, b - 1, Y0 - 0.25, Y0, 3.3, 4.0, SIGN[rnd.randrange(4)])
    So = Batch('bg_south')
    RTOP = C.pbr('roof_top', 'concrete_floor_worn_001', 3.0, tint=(0.7, 0.68, 0.64), sat=0.3)
    for i, x in enumerate(range(-60, 60, 8)):
        h = rnd.choice((6.5, 7.5, 8.5))
        So.box(x, x + 7.8, -26, -10, 0, h, NBW if i % 2 else NBW2)
        So.box(x, x + 7.8, -26, -10, h, h + 0.05, RTOP)
        for (a0, a1, b0, b1) in ((x, x + 7.8, -10.2, -10), (x, x + 7.8, -26, -25.8), (x, x + 0.2, -26, -10), (x + 7.6, x + 7.8, -26, -10)):
            So.box(a0, a1, b0, b1, h, h + 0.9, NBW if i % 2 else NBW2)
        for _ in range(rnd.randint(2, 4)):
            So.boxc(rnd.uniform(x + 1.2, x + 6.6), rnd.uniform(-24, -12), h, rnd.uniform(0.8, 2.0), rnd.uniform(0.6, 1.4), rnd.uniform(0.5, 1.3), ACM)
        if i % 3 == 0:
            So.cyl(x + 5.5, -21, h, 0.8, 1.6, CONC, 14)
        So.box(x + 0.4, x + 7.4, -10.03, -10, 0.3, 3.0, SHOPG2)
        for xm in (x + 0.2, x + 3.9, x + 7.6):
            So.box(xm - 0.2, xm + 0.2, -10.12, -10, 0.0, 3.3, NBW2 if i % 2 else NBW)
        So.box(x + 0.4, x + 7.4, -10.12, -10, 0.0, 0.45, STEEL)
        So.poly([(x + 0.5, -10, 3.2), (x + 7.3, -10, 3.2), (x + 7.3, -11.2, 2.8), (x + 0.5, -11.2, 2.8)], [(0, 1, 2, 3), (3, 2, 1, 0)], AWNS[i % 3])
        So.box(x + 0.6, x + 7.2, -10.25, -10, 3.3, 4.0, SIGN[i % 4])
        for z in (5.0,):
            if z + 1.4 < h:
                So.box(x + 1, x + 6.8, -10.02, -10, z, z + 1.3, GLASS)
    board(So, (-6.0, -12.5, 9.5), (1, 0, 0), (0, 1, 0), 9.0, 6.0, [HOLO2, HOLO3, HOLO1], STEEL, LAMPC)
    board(So, (3.0, -12.8, 9.5), (-1, 0, 0), (0, -1, 0), 9.0, 6.0, [HOLO1, HOLO3, HOLO2], STEEL, LAMPC)   # 对街屋顶全息屏
    for x in (-5.0, 2.0):
        So.box(x - 0.15, x + 0.15, -13.0, -12.5, 6.0, 9.5, STEEL)
    Tw = Batch('bg_towers')
    TM = [tower_mat('tower_a', (0.1, 0.11, 0.13), (1.0, 0.85, 0.6), 0.5), tower_mat('tower_b', (0.13, 0.14, 0.16), (0.6, 0.85, 1.0), 0.4)]
    rt = random.Random(11)
    for (x, y, w, d, h) in ((-60, 60, 40, 30, 180), (-10, 70, 30, 30, 220), (30, 55, 34, 26, 160), (80, 75, 40, 40, 200),
                            (-120, 40, 50, 40, 150), (140, 40, 40, 50, 170), (-40, 140, 60, 50, 260), (60, 150, 60, 50, 240),
                            (-150, -80, 50, 50, 190), (-70, -90, 40, 40, 210)):
        z = 0.0
        ww, dd = w, d
        while z < h:   # 退台叠层
            hh = rt.uniform(30, 60)
            Tw.boxc(x, y, z, ww, dd, min(hh, h - z), TM[rt.randrange(2)])
            if math.hypot(x, y) < 90:   # 近处塔楼：朝街一面加竖向窗梃 + 每 4 m 一道挑檐
                fy = y - dd / 2
                for k in range(int(ww / 3) + 1):
                    fx = x - ww / 2 + k * ww / int(ww / 3)
                    Tw.box(fx - 0.25, fx + 0.25, fy - 0.6, fy, z, z + min(hh, h - z), STEEL)
                zz = z + 4.0
                while zz < z + min(hh, h - z):
                    Tw.box(x - ww / 2, x + ww / 2, fy - 0.9, fy, zz - 0.25, zz, STEEL)
                    zz += 4.0
            Tw.boxc(x, y, z + min(hh, h - z), ww + 2, dd + 2, 1.2, STEEL)
            z += min(hh, h - z) + 1.2
            ww *= rt.uniform(0.8, 0.95); dd *= rt.uniform(0.8, 0.95)
    for (x0_, x1_, y_, z_) in ((-60, 30, 60, 90), (-10, 80, 70, 120)):   # 塔间连桥
        Tw.box(x0_, x1_, y_ - 3, y_ + 3, z_, z_ + 4, STEEL)
    rf = random.Random(21)   # 周边一圈低层街区，填满地面
    for gx in range(-200, 220, 30):
        for gy in range(-200, 220, 30):
            if -70 < gx < 70 and -40 < gy < 45: continue
            if rf.random() < 0.3: continue
            Tw.boxc(gx, gy, 0, rf.uniform(16, 24), rf.uniform(16, 24), rf.uniform(12, 45), TM[rf.randrange(2)])
    Mg = Batch('bg_maglev')
    MAG = C.flat('maglev_conc', (0.55, 0.56, 0.58), 0.6, noise=0.3)
    for (y, z) in ((36.0, 42.0),):
        Mg.box(-300, 300, y - 3, y + 3, z, z + 1.6, MAG)
        Mg.box(-300, 300, y - 0.4, y + 0.4, z + 1.6, z + 2.1, STEEL)
        for y2 in (y - 3.1, y + 2.9):
            Mg.box(-300, 300, y2, y2 + 0.2, z + 1.6, z + 2.6, STEEL)
        for x in range(-280, 300, 40):
            Mg.boxc(x, y, 0, 3.0, 3.0, z, MAG)
        Mg.box(-40, 30, y - 1.6, y + 1.6, z + 2.2, z + 5.4, C.flat('train', (0.8, 0.82, 0.85), 0.25, metal=0.5))
        Mg.box(-40, 30, y - 1.62, y + 1.62, z + 3.6, z + 4.4, C.glass('train_win', (0.05, 0.06, 0.08), 0.05, emit=(0.9, 0.95, 1), estr=0.6))
    # 斜穿的第二条高架（更高、更远）
    for i in range(0, 20):
        a = -250 + i * 25
        Mg.box(a, a + 25.5, -60 + 0.0, -54, 70, 71.8, MAG)
    Dk = Batch('bg_deck')
    DZ = 95.0
    DKM = C.flat('deck_under', (0.22, 0.23, 0.25), 0.7, metal=0.3, noise=0.3)
    hx0, hx1, hy0, hy1 = 50.0, 260.0, -170.0, -30.0   # 日光缝
    for (a, b, c0, c1) in ((-600, 600, hy1, 600), (-600, 600, -600, hy0), (-600, hx0, hy0, hy1), (hx1, 600, hy0, hy1)):
        Dk.box(a, b, c0, c1, DZ, DZ + 8, DKM)
    for x in range(-300, 320, 30):   # 甲板底肋
        for (c0, c1) in ((hy1, 300), (-300, hy0)):
            Dk.box(x - 1, x + 1, c0, c1, DZ - 3, DZ, STEEL)
    for y in range(-280, 300, 45):
        if hy0 < y < hy1: continue
        Dk.box(-300, 300, y - 0.6, y + 0.6, DZ - 0.6, DZ - 0.3, LAMPC)
    Dk.box(-600, 600, -600, 600, -0.6, -0.4, CONC)

    Batch.build_all()
    so = C.sky_sun(sc, 'day', sun_az=-40.0, sun_el=20.0, sun_e=7.0, sky_s=0.35)
    so.data.color = (1.0, 0.8, 0.58)
    C.point_light('room_lamp', (ROOM_BAY, Y0 + 2.5, fz(ROOM_F) + FH - 0.45), 60, (1.0, 0.85, 0.65), 0.3)
    fl = bpy.data.lights.new('room_fill', 'AREA'); fl.energy = 120; fl.size = 2.0; fl.color = (1.0, 0.95, 0.88)
    fo = bpy.data.objects.new('room_fill', fl); sc.collection.objects.link(fo)
    fo.location = (ROOM_BAY, Y0 + 0.6, fz(ROOM_F) + FH - 0.3); fo.rotation_euler = (0.0, 0.0, 0.0)
    C.point_light('bk_lamp', (-9.0, Y0 + 2.0, 2.9), 120, (0.9, 0.95, 1.0), 0.5)
    C.point_light('metro_lamp', (8.5, 7.1, 2.6), 250, (0.85, 0.93, 1.0), 0.4)
    sc.view_settings.exposure = 0.0
    if A['exposure']:
        sc.view_settings.exposure = float(A['exposure'])
    zr = fz(ROOM_F)
    CAMS = {
        'c1': ((-15.0, -4.2, 1.7), (5.0, 7.5, 4.5), 20),
        'c2': ((ROOM_BAY + 0.3, Y0 + 0.42, zr + 2.1), (ROOM_BAY - 9.0, 5.5, 0.0), 14),
        'c2b': ((ROOM_BAY - 0.4, Y0 + 0.9, zr + 1.6), (ROOM_BAY + 0.4, Y0 + 4.6, zr + 0.9), 14),
        'c3': ((10.0, -52.0, 64.0), (-2.0, 12.0, 6.0), 26),
    }
    pos, tgt, lens = CAMS[A['cam']]
    C.camera(sc, pos, tgt, lens)
    C.render(sc, A['out'], A['res'], 1.5, A['blend'])


try:
    main()
except Exception:
    msg = traceback.format_exc()
    if A['log']:
        with open(A['log'], 'w') as f:
            f.write(msg)
    print(msg)
    raise
