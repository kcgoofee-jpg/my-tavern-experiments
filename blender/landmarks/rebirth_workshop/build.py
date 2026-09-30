"""新生工坊（tc_mid）——只做外观。
卡原文（docs/landmarks/rebirth_workshop.md，卡 L74）：新生工坊是天城最大的同类（精密改造）中心；层与位置卡里没写，放在中层低区为仓库自设。
本模型：白 / 灰 / 玻璃的大型改造中心——三层主楼 + 深蓝玻璃幕墙与遮阳肋、南面半球玻璃穹厅、两座恢复病房翼、后勤塔、前庭水景与悬浮车位。
中立性：无人物、无文字 / 标志、无宗教符号、无器械与血腥细节（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/rebirth_workshop/manifest.json 的 budgets 里给三角形预算）：
  props_main   主楼（白板墙 + 玻璃幕墙 + 遮阳肋 + 屋顶机组 + 雨篷）+ 后勤塔
  props_dome   玻璃穹厅（金属肋 + 半透明壳 + 暖光）
  props_wings  东西恢复病房翼（阳台带 + 种植槽 + 屋顶停机坪）
  props_court  前庭：水景 + 行道树 + 路灯 + 三个悬浮车位
  site_ground  铺装前庭 + 草坪带 + 车道
bg_*：中层街区楼群剪影与大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  主楼 x -20..20、y 4..26（高 12）；玻璃穹厅圆心 (0, 0)、半径 8；东西翼 x ±(22..40)、y 6..22（高 8.4）；
  后勤塔 (0, 32) 8 × 8 高 22；前庭 y -38..-8。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final rebirth_workshop）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/rebirth_workshop/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/rebirth_workshop.jpg [--blend /tmp/rebirth_workshop.blend] [--log /tmp/rebirth_workshop.log]
cam: c1 主视角（东南俯瞰全场）/ c2 自南看玻璃穹厅与主立面 / under 西侧看病房翼与后勤塔
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/rebirth_workshop.jpg', blend='', log='', exposure='-0.2'))

MX0, MX1, MY0, MY1, MH = -20.0, 20.0, 4.0, 26.0, 12.0
DOME = (0.0, 0.0, 8.0)


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(61)

    WALL = C.pbr('rw_wall', 'white_stucco', 2.8, tint=(0.82, 0.83, 0.84), sat=0.1, value=1.0, weather=0.35)
    WALLG = C.pbr('rw_wallg', 'white_stucco', 2.8, tint=(0.55, 0.58, 0.62), sat=0.1, value=0.9, weather=0.4)
    CONC = C.pbr('rw_conc', 'smooth_concrete_floor', 4.0, tint=(0.6, 0.6, 0.6), sat=0.08, value=0.9)
    PAVE = C.pbr('rw_pave', 'patterned_paving', 4.0, tint=(0.7, 0.7, 0.68), sat=0.1, value=0.85)
    ASPH = C.pbr('rw_asph', 'asphalt_02', 5.0, tint=(0.3, 0.3, 0.32), sat=0.1, value=0.7)
    STEEL = C.pbr('rw_steel', 'Metal009', 2.0, tint=(0.62, 0.64, 0.68), sat=0.1, metal=0.9, weather=0.3)
    GLASSM = C.flat('rw_glass', (0.06, 0.14, 0.24), 0.08, metal=0.0, coat=0.6)
    GLOW = C.flat('rw_glow', (1, 1, 1), 0.4, emit=(0.75, 0.92, 1.0), estr=5.0)
    WARM = C.flat('rw_warm', (1, 1, 1), 0.4, emit=(1.0, 0.86, 0.62), estr=9.0)
    DOMEG = C.clear_glass('rw_domeg', tint=(0.8, 0.92, 0.98))
    LAWN = C.pbr('rw_lawn', 'grass_ground', 4.0, tint=(0.4, 0.55, 0.28), sat=0.6)
    LEAF = C.flat('rw_leaf', (0.14, 0.32, 0.14), 0.8, noise=0.5)
    BARK = C.flat('rw_bark', (0.22, 0.16, 0.12), 0.8, noise=0.3)
    WATER = C.glass('rw_water', tint=(0.05, 0.16, 0.2), rough=0.03)
    CAR = C.flat('rw_car', (0.85, 0.86, 0.88), 0.25, metal=0.6, coat=0.6)
    CARG = C.glass('rw_carg', tint=(0.03, 0.04, 0.05))
    PLANT = C.flat('rw_plant', (0.12, 0.3, 0.12), 0.8, noise=0.5)
    GROUND = C.flat('rw_bg_ground', (0.34, 0.35, 0.36), 0.95, noise=0.3)
    BG = C.flat('rw_bg', (0.5, 0.52, 0.55), 0.85, noise=0.2)
    BGW = C.flat('rw_bg_w', (0.2, 0.22, 0.25), 0.8)

    # ------------------------------------------------------------ 主楼 + 后勤塔
    mn = Batch('props_main')
    mn.box(MX0, MX1, MY0, MY1, 0, MH, WALL)
    mn.box(MX0 - 0.4, MX1 + 0.4, MY0 - 0.4, MY1 + 0.4, MH, MH + 0.5, CONC)                        # 檐口
    for fl in range(3):                                                                            # 南立面：玻璃幕墙带 + 竖向遮阳肋
        z = 0.8 + fl * 3.8
        mn.boxc(0, MY0 - 0.1, z, MX1 * 2 - 3, 0.16, 2.7, GLASSM)
    for k in range(-9, 10):
        mn.boxc(k * 2.0, MY0 - 0.35, 0.4, 0.28, 0.7, MH - 0.6, WALLG)
    for fl in range(3):
        for k in range(-6, 7): mn.boxc(k * 3.0, MY1 + 0.08, 1.2 + fl * 3.8, 1.4, 0.14, 1.8, GLASSM)  # 北立面窗
    for (sx) in (-1, 1):                                                                           # 侧立面窗
        for fl in range(3):
            for k in range(4): mn.boxc(sx * (MX1 + 0.08), MY0 + 3.2 + k * 5.0, 1.2 + fl * 3.8, 0.14, 1.8, 1.8, GLASSM)
    for k in range(6):                                                                             # 屋顶冷却机组
        mn.boxc(-14 + k * 5.6, 14.0 + (k % 2) * 4.0, MH + 0.5, 3.2, 2.4, 1.8, CONC)
        mn.cyl(-14 + k * 5.6, 14.0 + (k % 2) * 4.0, MH + 2.3, 0.9, 0.3, STEEL, 12)
    # 南门厅雨篷：平板 + 四根钢柱
    mn.boxc(0, MY0 - 5.5, 4.2, 14.0, 6.0, 0.3, WALLG)
    for (px, py) in ((-6.5, -8.2), (6.5, -8.2), (-6.5, MY0 - 1.5), (6.5, MY0 - 1.5)):
        mn.cyl(px, py, 0, 0.22, 4.2, STEEL, 10)
    # 后勤塔
    tx, ty = 0.0, 32.0
    mn.box(tx - 4, tx + 4, ty - 4, ty + 4, 0, 22.0, WALLG)
    for zz in (4, 8, 12, 16):
        mn.boxc(tx, ty - 4.06, zz, 5.0, 0.12, 1.2, GLOW)                                           # 通风格栅（冷光）
    mn.cyl(tx + 2.0, ty + 1.0, 22.0, 0.7, 5.0, STEEL, 14)
    mn.cyl(tx - 2.0, ty - 1.0, 22.0, 0.5, 3.5, STEEL, 12)
    mn.box(tx - 4.3, tx + 4.3, ty - 4.3, ty + 4.3, 22.0, 22.5, CONC)

    # ------------------------------------------------------------ 玻璃穹厅
    dm = Batch('props_dome')
    cx, cy, R = DOME
    dm.cyl(cx, cy, 0, R + 0.3, 0.5, CONC, 40)
    prof = [(R * math.cos(t), R * math.sin(t) * 1.2 + 0.5) for t in [j * (math.pi / 2) / 12 for j in range(13)]]
    dm.lathe(cx, cy, 0.5, prof, DOMEG, n=40)
    nrib = 16
    for k in range(nrib):
        a = k * math.tau / nrib
        pts = [(cx + (R + 0.05) * math.cos(a) * math.cos(t), cy + (R + 0.05) * math.sin(a) * math.cos(t), 0.5 + R * 1.2 * math.sin(t)) for t in [j * (math.pi / 2 * 0.99) / 10 for j in range(11)]]
        dm.tube(pts, 0.14, STEEL, 6)
    for t in (0.4, 0.8, 1.2):
        rr = (R + 0.05) * math.cos(t)
        dm.tube([(cx + rr * math.cos(i * math.tau / 40), cy + rr * math.sin(i * math.tau / 40), 0.5 + R * 1.2 * math.sin(t)) for i in range(40)], 0.12, STEEL, 6, closed=True)
    dm.sphere(cx, cy, 5.0, 2.2, WARM, seg=20, rings=10)                                            # 穹内暖白光球（新生的意象，无符号）
    dm.cyl(cx, cy, 0.5, 2.8, 2.6, WALLG, 16, r2=1.6)                                               # 穹内中庭台

    # ------------------------------------------------------------ 两翼
    wg = Batch('props_wings')
    for sx in (-1, 1):
        x0, x1 = (22.0, 40.0) if sx > 0 else (-40.0, -22.0)
        wg.box(x0, x1, 6.0, 22.0, 0, 8.4, WALL)
        wg.box(x0 - 0.3, x1 + 0.3, 5.7, 22.3, 8.4, 8.8, CONC)
        for fl in range(2):
            z = 0.9 + fl * 4.0
            wg.boxc((x0 + x1) / 2, 5.9, z, x1 - x0 - 2, 0.14, 2.2, GLASSM)
            wg.boxc((x0 + x1) / 2, 5.4, z - 0.15, x1 - x0 + 0.4, 1.4, 0.16, WALLG)               # 阳台带
            wg.boxc((x0 + x1) / 2, 4.9, z + 0.05, x1 - x0 + 0.4, 0.14, 0.9, STEEL)               # 栏杆
            for k in range(6): wg.boxc(x0 + 2.0 + k * 3.0, 5.0, z + 0.05, 1.8, 0.5, 0.6, PLANT)  # 种植槽
        for k in range(4): wg.boxc((x0 + x1) / 2 - 6 + k * 4.0, 22.08, 1.2 + (k % 2) * 4.0, 2.0, 0.14, 1.8, GLASSM)
    wg.cyl(31.0, 14.0, 8.8, 6.5, 0.25, CONC, 32)                                                   # 东翼屋顶停机坪
    wg.cyl(31.0, 14.0, 9.0, 5.3, 0.06, WALLG, 32)
    wg.cyl(31.0, 14.0, 9.05, 3.6, 0.06, CONC, 32)
    for k in range(8):
        a = k * math.tau / 8
        wg.cyl(31.0 + 6.5 * math.cos(a), 14.0 + 6.5 * math.sin(a), 8.8, 0.15, 0.3, WARM, 6)
    wg.boxc(-31.0, 14.0, 8.8, 5.0, 3.0, 1.4, CONC)                                                # 西翼屋顶机房
    wg.cyl(-31.0, 14.0, 10.2, 0.4, 3.0, STEEL, 10)

    # ------------------------------------------------------------ 前庭
    ct = Batch('props_court')
    px, py = 0.0, -22.0
    ct.cyl(px, py, 0, 8.4, 0.5, CONC, 40)
    ct.cyl(px, py, 0.5, 7.6, 0.05, WATER, 40)
    ct.cyl(px, py, 0.5, 1.2, 1.4, STEEL, 16, r2=0.4)
    for k in range(6):
        a = k * math.tau / 6
        ct.tube([(px + 0.5 * math.cos(a), py + 0.5 * math.sin(a), 1.9), (px + 3.4 * math.cos(a), py + 3.4 * math.sin(a), 0.9), (px + 5.5 * math.cos(a), py + 5.5 * math.sin(a), 0.5)], 0.05, STEEL, 4)
    for k in range(6):                                                                             # 行道树
        for sx in (-1, 1):
            tx2, ty2 = sx * 30.0, -8.0 - k * 6.0
            ct.cyl(tx2, ty2, 0, 0.25, 4.0, BARK, 8)
            ct.sphere(tx2, ty2, 5.4, 2.4, LEAF, seg=12, rings=8)
    for k in range(5):                                                                             # 路灯
        lx = -24 + k * 12.0
        ct.cyl(lx, -8.6, 0, 0.12, 5.0, STEEL, 8); ct.boxc(lx, -8.6, 5.0, 0.7, 0.4, 0.2, GLOW)
    for k in range(3):                                                                             # 悬浮车位（无轮流线车身）
        cx2, cy2 = 18.0 + k * 0.0, -14.0 - k * 6.5
        ct.cyl(cx2, cy2, 0.0, 3.4, 0.06, CONC, 24)
        ct.sphere(cx2, cy2, 1.05, 1.0, CAR, sz=0.5, seg=24, rings=12, sx=2.3)
        ct.sphere(cx2 + 0.3, cy2, 1.35, 0.8, CARG, sz=0.55, seg=20, rings=10, sx=1.5, zmin=0.0)
        for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
            ct.cyl(cx2 + ex * 1.7, cy2 + ey * 1.2, 0.7, 0.5, 0.25, CAR, 16)
    for k in range(6): ct.cyl(-16 + k * 6.4, -12.4, 0, 0.16, 0.9, STEEL, 8)                        # 路缘柱

    # ------------------------------------------------------------ 场地
    gr = Batch('site_ground')
    gr.box(-52, 52, -44, 44, -0.3, 0, ASPH)
    gr.box(-42, 42, -38, -8, 0, 0.12, PAVE)                                                       # 铺装前庭
    for sx in (-1, 1): gr.box(sx * 22 - 8, sx * 22 + 8, -36, -10, 0.12, 0.2, LAWN)                # 草坪带
    gr.box(-6, 6, -8, 4, 0, 0.14, PAVE)                                                           # 门厅前铺装
    gr.box(-42, 42, 26, 40, 0, 0.1, CONC)                                                         # 北侧硬化

    bg = Batch('bg_ground'); bg.box(-900, 900, -900, 900, -1.5, -0.5, GROUND)
    bt = Batch('bg_towers')
    for i in range(70):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(75, 340)
        px2, py2 = math.cos(a) * d * 1.3, math.sin(a) * d
        if abs(px2) < 62 and abs(py2) < 52: continue
        if any(math.hypot(px2 - cx3, py2 - cy3) < 60 for (cx3, cy3) in ((84.0, -92.0), (0.0, -74.0), (-92.0, 26.0))): continue   # 镜头前不放楼
        w, dd = rnd.uniform(12, 30), rnd.uniform(12, 28)
        bt.box(px2 - w / 2, px2 + w / 2, py2 - dd / 2, py2 + dd / 2, 0, rnd.uniform(14, 60), BG if i % 3 else BGW)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=42.0, sun_e=4.0, sky_s=0.55)
    C.point_light('pt_dome', (0.0, 0.0, 5.0), 2.5e3, (1.0, 0.86, 0.62), 0.5)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0
    CAMS = {
        'c1': ((84.0, -92.0, 58.0), (0.0, 8.0, 6.0), 32, 0.0),
        'c2': ((0.0, -74.0, 9.0), (0.0, 6.0, 9.0), 34, 0.0),
        'under': ((-92.0, 26.0, 20.0), (0.0, 12.0, 9.0), 32, 0.0),
    }
    cv = CAMS[A['cam']]
    C.camera(sc, cv[0], cv[1], cv[2], cv[3])
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
