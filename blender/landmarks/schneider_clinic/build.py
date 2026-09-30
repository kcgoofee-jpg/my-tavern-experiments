"""施奈德精密改造诊所（tc_mid）——只做外观。
设定（docs/landmarks/schneider_clinic.md，卡 L73 + L184）：伊薇特开的私人诊所，只接受预约，放在中层高区。
本模型：低调的联排宅邸式诊所——三层石灰石对称立面 + 双柱门廊 + 板石四坡顶带老虎窗、东侧车库（悬浮车）、西后玻璃温室、铁艺栅栏前院。
中立性：无人物、无文字 / 标志、无宗教符号、无器械与血腥细节（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/schneider_clinic/manifest.json 的 budgets 里给三角形预算）：
  props_clinic  主楼（石灰石立面 + 门廊 + 窗 + 檐口）+ 板石四坡顶 + 老虎窗 + 烟囱
  props_wing    东侧车库（含悬浮车）+ 西后玻璃温室
  props_front   铁艺栅栏 + 双开门 + 门柱灯 + 黄杨球 / 整形树 + 石水盆
  site_ground   砾石与铺装前院 + 人行道 + 街面
bg_*：左右联排宅邸体块、对面街区楼群与大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  主楼 x -12..12、y 0..14（三层，层高 3.8，檐高 11.4）；车库 x 12..22、y 1..11；温室 x -22..-12、y 3..13；
  前院 y -22..0，栅栏在 y=-20，街面 y -34..-24。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final schneider_clinic）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/schneider_clinic/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/schneider_clinic.jpg [--blend /tmp/schneider_clinic.blend] [--log /tmp/schneider_clinic.log]
cam: c1 主视角（东南俯瞰全场）/ c2 自南看门廊与正立面 / under 西侧看温室与后立面
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/schneider_clinic.jpg', blend='', log='', exposure='-0.2'))

X0, X1, Y0, Y1 = -12.0, 12.0, 0.0, 14.0
FL, NF = 3.8, 3
HE = FL * NF


def hip(B, x0, x1, y0, y1, z, h, m, over=0.6):
    x0 -= over; x1 += over; y0 -= over; y1 += over
    d = min(x1 - x0, y1 - y0) / 2
    ym = (y0 + y1) / 2
    r0, r1 = (x0 + d, ym, z + h), (x1 - d, ym, z + h)
    vs = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), r0, r1]
    fs = [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4), (3, 2, 1, 0)]
    B.poly(vs, fs, m)


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(71)

    STONE = C.pbr('sc_stone', 'white_sandstone_blocks_02', 3.0, tint=(0.88, 0.82, 0.7), sat=0.4, value=1.0, weather=0.4)
    MARBLE = C.pbr('sc_marble', 'Marble021', 2.4, tint=(0.94, 0.93, 0.9), sat=0.1)
    SLATE = C.pbr('sc_slate', 'roof_slates_02', 2.4, tint=(0.28, 0.3, 0.34), sat=0.3)
    COPPER = C.flat('sc_copper', (0.32, 0.5, 0.44), 0.55, noise=0.25)
    BRASS = C.flat('sc_brass', (0.78, 0.6, 0.25), 0.3, metal=0.9)
    IRON = C.flat('sc_iron', (0.03, 0.03, 0.035), 0.45, metal=0.6)
    GLASSD = C.glass('sc_glass', tint=(0.06, 0.07, 0.09))
    FROST = C.flat('sc_frost', (1, 1, 1), 0.5, emit=(1.0, 0.82, 0.6), estr=2.2)
    WARM = C.flat('sc_warm', (1, 1, 1), 0.4, emit=(1.0, 0.8, 0.55), estr=6.0)
    CLEAR = C.clear_glass('sc_clear', tint=(0.78, 0.9, 0.95))
    GRAVEL = C.pbr('sc_gravel', 'precast_stone_paving', 2.0, tint=(0.95, 0.9, 0.8), sat=0.35, value=0.9)
    PAVE = C.pbr('sc_pave', 'white_sandstone_blocks_02', 2.0, tint=(0.8, 0.77, 0.7), sat=0.35)
    ASPH = C.pbr('sc_asph', 'asphalt_02', 5.0, tint=(0.3, 0.3, 0.32), sat=0.1, value=0.7)
    LAWN = C.pbr('sc_lawn', 'grass_ground', 4.0, tint=(0.36, 0.52, 0.24), sat=0.6)
    HEDGE = C.flat('sc_hedge', (0.07, 0.18, 0.07), 0.85, noise=0.4)
    LEAF = C.flat('sc_leaf', (0.13, 0.3, 0.12), 0.8, noise=0.5)
    BARK = C.flat('sc_bark', (0.2, 0.15, 0.11), 0.8, noise=0.3)
    WATER = C.glass('sc_water', tint=(0.04, 0.12, 0.14), rough=0.03)
    CAR = C.flat('sc_car', (0.12, 0.13, 0.16), 0.25, metal=0.6, coat=0.6)
    CARG = C.glass('sc_carg', tint=(0.03, 0.04, 0.05))
    LAMP = C.flat('sc_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.86, 0.62), estr=12.0)
    GROUND = C.flat('sc_bg_ground', (0.34, 0.35, 0.36), 0.95, noise=0.3)
    BG = C.flat('sc_bg', (0.6, 0.55, 0.47), 0.85, noise=0.2)
    BGT = C.flat('sc_bg_t', (0.5, 0.52, 0.56), 0.85, noise=0.2)

    # ------------------------------------------------------------ 主楼
    cl = Batch('props_clinic')
    cl.box(X0, X1, Y0, Y1, 0, HE, STONE)
    for fl in range(1, NF):                                                                     # 层间线脚
        cl.box(X0 - 0.15, X1 + 0.15, Y0 - 0.2, Y1 + 0.15, fl * FL - 0.12, fl * FL + 0.12, MARBLE)
    cl.box(X0 - 0.5, X1 + 0.5, Y0 - 0.7, Y1 + 0.5, HE, HE + 0.5, MARBLE)                       # 檐口
    cl.box(X0 - 0.3, X1 + 0.3, Y0 - 0.4, Y1 + 0.3, 0, 0.7, MARBLE)                              # 勒脚
    for k in range(-4, 5):                                                                       # 南立面窗：一层磨砂 / 上层深色带栏杆
        if k == 0: continue
        wx = k * 2.7
        cl.boxc(wx, Y0 - 0.06, 1.1, 1.3, 0.14, 2.0, FROST)
        for fl in (1, 2):
            cl.boxc(wx, Y0 - 0.06, fl * FL + 0.9, 1.3, 0.14, 2.2, GLASSD if (k + fl) % 3 else WARM)
            cl.boxc(wx, Y0 - 0.06, fl * FL + 0.9, 1.7, 0.2, 0.12, MARBLE)
            cl.boxc(wx, Y0 - 0.32, fl * FL + 0.05, 1.7, 0.5, 0.12, MARBLE)                      # 小阳台
            cl.boxc(wx, Y0 - 0.52, fl * FL + 0.15, 1.7, 0.06, 0.8, IRON)
    for fl in range(NF):                                                                          # 北 / 东 / 西立面窗
        for k in range(-3, 4): cl.boxc(k * 3.2, Y1 + 0.06, fl * FL + 1.0, 1.3, 0.14, 2.0, GLASSD if (k + fl) % 3 else WARM)
        for k in range(3):
            cl.boxc(X1 + 0.06, 3.0 + k * 4.2, fl * FL + 1.0, 0.14, 1.3, 2.0, GLASSD)
            cl.boxc(X0 - 0.06, 3.0 + k * 4.2, fl * FL + 1.0, 0.14, 1.3, 2.0, GLASSD)
    # 门廊：双柱 + 三角山花 + 大理石门框；无字黄铜板
    cl.boxc(0, Y0 - 1.6, 0, 6.4, 3.2, 0.5, MARBLE)
    for sx in (-1, 1): cl.cyl(sx * 2.6, Y0 - 2.6, 0.5, 0.42, 4.2, MARBLE, 16)
    cl.boxc(0, Y0 - 1.6, 4.7, 7.0, 3.6, 0.5, MARBLE)
    cl.gable(-3.5, 3.5, Y0 - 3.4, Y0 + 0.2, 5.2, 1.2, MARBLE, along='x')
    cl.boxc(0, Y0 - 0.1, 0, 2.2, 0.3, 3.6, MARBLE)                                              # 门框
    cl.boxc(0, Y0 - 0.22, 0, 1.6, 0.14, 3.2, IRON)                                              # 门
    cl.boxc(1.7, Y0 - 0.2, 1.4, 0.4, 0.06, 0.55, BRASS)                                          # 门边无字黄铜板（空白）
    # 板石四坡屋面 + 老虎窗 + 烟囱
    hip(cl, X0, X1, Y0, Y1, HE + 0.5, 4.2, SLATE, over=0.7)
    for k in range(-1, 2):
        dx = k * 6.0
        cl.box(dx - 0.9, dx + 0.9, Y0 + 0.8, Y0 + 2.6, HE + 0.5, HE + 2.2, STONE)
        cl.gable(dx - 1.1, dx + 1.1, Y0 + 0.6, Y0 + 2.8, HE + 2.2, 1.0, SLATE, along='y')
        cl.boxc(dx, Y0 + 0.74, HE + 0.7, 1.0, 0.1, 1.2, WARM if k == 0 else GLASSD)
    for cx in (-8.0, 8.0): cl.box(cx - 0.6, cx + 0.6, Y1 - 2.0, Y1 - 0.8, HE + 0.5, HE + 4.2, STONE)
    cl.box(0 - 1.4, 1.4, Y0 + 5.5, Y0 + 8.5, HE + 4.5, HE + 4.9, COPPER)                        # 屋脊铜饰

    # ------------------------------------------------------------ 侧翼
    wg = Batch('props_wing')
    wg.box(12.0, 22.0, 1.0, 11.0, 0, 4.2, STONE)                                               # 东：车库
    wg.box(11.8, 22.4, 0.8, 11.2, 4.2, 4.5, MARBLE)
    wg.boxc(17.0, 0.9, 0, 5.4, 0.16, 3.2, IRON)                                                 # 车库门
    wg.cyl(17.0, 6.0, 4.5, 1.0, 0.6, COPPER, 12)                                                # 屋顶采光小圆亭
    wg.sphere(17.0, 6.0, 5.1, 0.9, CLEAR, seg=12, rings=6, zmin=0.0)
    cx, cy = 17.0, -5.0                                                                          # 悬浮车（门前上客位）
    wg.sphere(cx, cy, 0.95, 1.0, CAR, sz=0.5, seg=24, rings=12, sx=2.3)
    wg.sphere(cx + 0.3, cy, 1.25, 0.8, CARG, sz=0.55, seg=20, rings=10, sx=1.5, zmin=0.0)
    for (ex, ey) in ((-1, -1), (-1, 1), (1, -1), (1, 1)): wg.cyl(cx + ex * 1.7, cy + ey * 1.2, 0.6, 0.5, 0.25, CAR, 16)
    wg.box(-22.0, -12.0, 3.0, 13.0, 0, 0.5, MARBLE)                                              # 西后：玻璃温室
    wg.box(-22.0, -12.0, 3.0, 13.0, 0.5, 5.2, CLEAR)
    for k in range(6):
        wg.boxc(-22.0 + k * 2.0, 3.0, 0.5, 0.14, 0.14, 4.7, IRON); wg.boxc(-22.0 + k * 2.0, 13.0, 0.5, 0.14, 0.14, 4.7, IRON)
    for k in range(6):
        wg.boxc(-22.0, 3.0 + k * 2.0, 0.5, 0.14, 0.14, 4.7, IRON); wg.boxc(-12.0, 3.0 + k * 2.0, 0.5, 0.14, 0.14, 4.7, IRON)
    hip(wg, -22.0, -12.0, 3.0, 13.0, 5.2, 2.6, CLEAR, over=0.3)
    for k in range(4):
        wg.sphere(-19.0 + (k % 2) * 4.0, 6.0 + (k // 2) * 4.0, 0.5, 0.9, LEAF, seg=10, rings=6, sz=1.3, zmin=0.0)   # 温室里的植物

    # ------------------------------------------------------------ 前院
    fr = Batch('props_front')
    fx0, fx1, fy = -22.0, 22.0, -20.0
    for xs in (fx0, -4.0, 4.0, fx1):
        fr.boxc(xs, fy, 0, 1.0, 1.0, 2.6, MARBLE)
        fr.sphere(xs, fy, 2.9, 0.34, LAMP, seg=10, rings=6)
    for (a, b) in ((fx0, -4.0), (4.0, fx1)):
        n = int((b - a) / 0.6)
        for i in range(n + 1): fr.cyl(a + i * 0.6, fy, 0, 0.03, 1.9, IRON, 4)
        for zz in (0.3, 1.8): fr.tube([(a, fy, zz), (b, fy, zz)], 0.05, IRON, 4)
    for sx in (-1, 1):                                                                            # 双开门（半开示意）
        for i in range(8): fr.cyl(sx * (0.6 + i * 0.4), fy, 0, 0.03, 1.8, IRON, 4)
        fr.tube([(sx * 0.6, fy, 0.3), (sx * 3.6, fy, 0.3)], 0.05, IRON, 4)
        fr.tube([(sx * 0.6, fy, 1.7), (sx * 3.6, fy, 1.7)], 0.05, IRON, 4)
    fr.boxc(5.0, fy + 0.6, 0, 0.4, 0.3, 1.3, MARBLE)                                             # 对讲立柱（无字）
    fr.sphere(-8.0, -10.0, 1.0, 1.0, HEDGE, seg=12, rings=8)                                       # 黄杨球
    fr.sphere(8.0, -10.0, 1.0, 1.0, HEDGE, seg=12, rings=8)
    for sx in (-1, 1):
        fr.cyl(sx * 14.0, -12.0, 0, 0.22, 3.2, BARK, 8); fr.sphere(sx * 14.0, -12.0, 4.4, 2.0, LEAF, seg=12, rings=8)
    for sx in (-1, 1):                                                                            # 前院两侧低篱
        fr.box(sx * 14.0 - 8.0, sx * 14.0 + 8.0, -19.5, -18.7, 0, 0.9, HEDGE)
    fr.cyl(0, -10.0, 0, 1.6, 0.6, MARBLE, 20)                                                     # 石水盆
    fr.cyl(0, -10.0, 0.6, 1.4, 0.05, WATER, 20)

    # ------------------------------------------------------------ 场地
    gr = Batch('site_ground')
    gr.box(-40, 40, -40, 26, -0.3, 0, ASPH)
    gr.box(-40, 40, -30, -24, 0, 0.15, PAVE)                                                      # 人行道
    gr.box(-24, 24, -24, 0, 0, 0.1, GRAVEL)                                                       # 前院砾石
    gr.box(-2.6, 2.6, -24, Y0 - 0.2, 0.1, 0.16, PAVE)                                             # 入户铺装带
    for sx in (-1, 1): gr.box(sx * 14.0 - 7.0, sx * 14.0 + 7.0, -18.0, -3.0, 0.1, 0.16, LAWN)   # 草坪块
    gr.box(-40, 40, 14.5, 26, 0, 0.1, PAVE)

    bg = Batch('bg_ground'); bg.box(-900, 900, -900, 900, -1.5, -0.5, GROUND)
    bs = Batch('bg_neighbors')
    bs.box(-44, -24, 0, 14, 0, 11.4, BG); bs.box(24, 44, 0, 14, 0, 11.4, BG)                    # 左右联排宅邸
    bs.box(-44, -24, -3, 0, 0, 3.0, BG); bs.box(24, 44, -3, 0, 0, 3.0, BG)
    bt = Batch('bg_towers')
    for i in range(60):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(70, 320)
        px, py = math.cos(a) * d * 1.3, math.sin(a) * d
        if abs(px) < 50 and abs(py) < 44: continue
        if any(math.hypot(px - cx3, py - cy3) < 55 for (cx3, cy3) in ((52.0, -60.0), (0.0, -46.0), (-34.0, 40.0))): continue
        w, dd = rnd.uniform(10, 24), rnd.uniform(10, 22)
        bt.box(px - w / 2, px + w / 2, py - dd / 2, py + dd / 2, 0, rnd.uniform(12, 46), BG if i % 3 else BGT)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=42.0, sun_e=4.0, sky_s=0.55)
    for xs in (-22.0, 22.0): C.point_light('pt_g%d' % int(xs), (xs, -20.0, 3.0), 1.2e3, (1.0, 0.85, 0.6), 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0
    CAMS = {
        'c1': ((52.0, -60.0, 36.0), (0.0, 4.0, 6.0), 32, 0.0),
        'c2': ((0.0, -46.0, 5.5), (0.0, 6.0, 7.0), 34, 0.0),
        'under': ((-34.0, 40.0, 19.0), (-12.0, 8.0, 4.0), 30, 0.0),
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
