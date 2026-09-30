"""下层区酒吧（tc_low）——只做外观。
设定（docs/landmarks/lower_bar.md，卡 L78）：下层有一间酒吧，瑞秋过去的经历发生在这里（放在下层）。
本模型：下层街角老酒吧——一层红砖 + 二层灰泥暖光窗、扇形遮阳篷 + 无字琥珀灯牌、露天小桌、东侧后巷（酒桶 / 木箱 / 垃圾箱 / 消防梯）。
中立性：无人物、无文字 / 标志、无武器类细节（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/lower_bar/manifest.json 的 budgets 里给三角形预算）：
  props_bar     酒吧主楼（砖墙 + 灰泥二层 + 平屋顶排烟管 / 水箱）+ 遮阳篷 + 琥珀灯牌
  props_alley   后巷：邻楼山墙 + 后门 + 酒桶 / 木箱 / 垃圾箱 + 之字形消防梯
  props_street  露天小桌 / 凳 + 路灯
  site_ground   人行道 + 沥青街面 + 路中线 + 积水
bg_*：街对面棚屋剪影与大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  酒吧 x -16..4、y -6..10（两层，檐高 7.2）；南面人行道 y -12..-6；街 y -26..-12；东侧后巷 x 4..14，邻楼 x 14..30（高 9）。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final lower_bar）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/lower_bar/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/lower_bar.jpg [--blend /tmp/lower_bar.blend] [--log /tmp/lower_bar.log]
cam: c1 主视角（东南俯瞰街角）/ c2 街面看门与遮阳篷 / under 东侧看后巷与消防梯
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/lower_bar.jpg', blend='', log='', exposure='-0.3'))

BX0, BX1, BY0, BY1 = -16.0, 4.0, -6.0, 10.0
H1, HE = 3.6, 7.2


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(41)

    BRICK = C.pbr('lb_brick', 'dark_brick_wall', 2.6, tint=(0.52, 0.34, 0.28), sat=0.5, value=0.95, weather=0.85)
    BRICK_D = C.pbr('lb_brick_d', 'dark_brick_wall', 2.6, tint=(0.32, 0.26, 0.24), sat=0.25, value=0.8, weather=1.0)
    PLASTER = C.pbr('lb_plaster', 'white_stucco', 2.8, tint=(0.62, 0.55, 0.42), sat=0.5, value=0.9, weather=0.9)
    WOOD = C.pbr('lb_wood', 'rough_wood', 2.2, tint=(0.4, 0.3, 0.2), sat=0.4, value=0.75)
    WOODD = C.pbr('lb_woodd', 'dark_wood', 2.0, tint=(0.3, 0.22, 0.15), sat=0.3, value=0.8)
    STEEL = C.pbr('lb_steel', 'Metal009', 2.0, tint=(0.28, 0.29, 0.31), sat=0.15, metal=0.85, weather=0.8)
    RUST = C.pbr('lb_rust', 'box_profile_metal_sheet', 2.4, tint=(0.5, 0.26, 0.13), sat=0.7, value=1.0, metal=0.3, weather=1.0)
    GREEN = C.pbr('lb_green', 'box_profile_metal_sheet', 2.4, tint=(0.22, 0.34, 0.26), sat=0.5, value=1.0, metal=0.3, weather=1.0)
    CONC = C.pbr('lb_conc', 'concrete_wall_008', 4.0, tint=(0.46, 0.45, 0.43), sat=0.15, value=0.85, weather=0.7)
    ASPH = C.pbr('lb_asph', 'asphalt_02', 5.0, tint=(0.28, 0.28, 0.3), sat=0.1, value=0.7)
    CANVAS = C.flat('lb_canvas', (0.5, 0.18, 0.14), 0.85, noise=0.4)
    CANVAS2 = C.flat('lb_canvas2', (0.72, 0.62, 0.42), 0.85, noise=0.4)
    WIN = C.flat('lb_win', (0.04, 0.04, 0.05), 0.3)
    WINWARM = C.flat('lb_winwarm', (1, 1, 1), 0.4, emit=(1.0, 0.58, 0.22), estr=7.0)
    SIGN = C.flat('lb_sign', (1, 1, 1), 0.4, emit=(1.0, 0.55, 0.12), estr=5.0)
    LAMP = C.flat('lb_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.85, 0.6), estr=18.0)
    MARK = C.flat('lb_mark', (0.75, 0.72, 0.6), 0.7)
    PUDDLE = C.flat('lb_puddle', (0.03, 0.035, 0.045), 0.06)
    GROUND = C.flat('lb_bg_ground', (0.16, 0.16, 0.15), 0.95, noise=0.5)
    BG_SHACK = C.flat('lb_bg_shack', (0.26, 0.22, 0.19), 0.9)

    # ------------------------------------------------------------ 酒吧主楼
    br = Batch('props_bar')
    br.box(BX0, BX1, BY0, BY1, 0, H1, BRICK)
    br.box(BX0, BX1, BY0, BY1, H1, HE, PLASTER)
    br.box(BX0 - 0.3, BX1 + 0.3, BY0 - 0.3, BY1 + 0.3, H1 - 0.15, H1 + 0.15, CONC)             # 层间腰线
    br.box(BX0 - 0.35, BX1 + 0.35, BY0 - 0.35, BY1 + 0.35, HE, HE + 0.35, CONC)                # 檐口
    for (a, b, c, d) in ((BX0, BX1, BY0, BY0 + 0.4), (BX0, BX1, BY1 - 0.4, BY1), (BX0, BX0 + 0.4, BY0, BY1), (BX1 - 0.4, BX1, BY0, BY1)):
        br.box(a, b, c, d, HE + 0.35, HE + 1.1, BRICK_D)                                          # 女儿墙
    for k in range(3):                                                                            # 南面一层暖光大窗
        wx = BX0 + 3.5 + k * 4.2
        br.boxc(wx, BY0 - 0.06, 0.9, 2.6, 0.14, 2.0, WINWARM)
        br.boxc(wx, BY0 - 0.1, 0.7, 3.0, 0.16, 0.2, WOODD); br.boxc(wx, BY0 - 0.1, 2.9, 3.0, 0.16, 0.2, WOODD)
    br.boxc(BX1 - 3.2, BY0 - 0.08, 0, 2.0, 0.16, 2.8, WOODD)                                     # 双开木门
    br.boxc(BX1 - 3.2, BY0 - 0.16, 0, 0.12, 0.18, 2.8, STEEL)
    for k in range(5):                                                                            # 二层木框窗（暖光 / 暗）
        wx = BX0 + 2.2 + k * 3.7
        br.boxc(wx, BY0 - 0.06, H1 + 0.9, 1.3, 0.14, 1.8, WINWARM if k in (1, 3) else WIN)
        br.boxc(wx, BY0 - 0.1, H1 + 0.8, 1.7, 0.16, 0.14, WOODD); br.boxc(wx, BY0 - 0.1, H1 + 2.7, 1.7, 0.16, 0.14, WOODD)
    for k in range(3):                                                                            # 东面（巷内）窗
        br.boxc(BX1 + 0.06, BY0 + 3.0 + k * 4.5, H1 + 0.9, 0.14, 1.3, 1.8, WINWARM if k == 1 else WIN)
    br.boxc(BX1 + 0.08, BY0 + 8.0, 0, 0.16, 1.6, 2.6, RUST)                                      # 后门
    for k in range(2):                                                                            # 平屋顶排烟管 + 水箱
        br.cyl(BX0 + 4 + k * 5, BY1 - 3, HE + 0.35, 0.28, 3.4, STEEL, 10)
    for (lx, ly) in ((-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)):
        br.cyl(BX0 + 10 + lx, BY0 + 8 + ly, HE + 0.35, 0.1, 1.4, STEEL, 6)
    br.cyl(BX0 + 10, BY0 + 8, HE + 1.75, 1.5, 1.7, WOOD, 16)
    br.cyl(BX0 + 10, BY0 + 8, HE + 3.45, 1.55, 0.2, STEEL, 16, r2=0.3)
    # 扇形遮阳篷（红 / 米交替条）
    n = 7; ax0, ax1 = BX0 + 1.0, BX1 - 0.5
    for i in range(n):
        xa = ax0 + (ax1 - ax0) * i / n; xb = ax0 + (ax1 - ax0) * (i + 1) / n
        br.poly([(xa, BY0, 3.4), (xb, BY0, 3.4), (xb, BY0 - 3.8, 2.6), (xa, BY0 - 3.8, 2.6)], [(0, 1, 2, 3), (3, 2, 1, 0)], CANVAS if i % 2 else CANVAS2)
    for xx in (ax0, ax1): br.cyl(xx, BY0 - 3.8, 0, 0.07, 2.6, STEEL, 6)
    # 街角灯牌：只有一块琥珀色发光板（无字）
    br.tube([(BX0 - 0.02, BY0 - 0.02, 5.0), (BX0 - 1.4, BY0 - 1.4, 5.0)], 0.05, STEEL, 6)
    br.boxc(BX0 - 1.5, BY0 - 1.5, 4.4, 0.25, 1.3, 1.5, SIGN)
    br.boxc(BX0 - 1.5, BY0 - 1.5, 4.3, 0.35, 1.5, 0.12, WOODD); br.boxc(BX0 - 1.5, BY0 - 1.5, 5.85, 0.35, 1.5, 0.12, WOODD)

    # ------------------------------------------------------------ 后巷
    al = Batch('props_alley')
    al.box(14.0, 24.0, BY0, BY1, 0, 7.6, BRICK_D)                                                # 邻楼山墙
    for k in range(3):
        for j in range(2):
            al.boxc(14.0 - 0.06, BY0 + 2.6 + k * 4.5, 1.6 + j * 3.2, 0.14, 1.2, 1.7, WIN if (k + j) % 3 else WINWARM)
    al.box(4.0, 14.0, BY1, BY1 + 0.5, 0, 7.0, BRICK_D)                                           # 巷尾封墙
    fx = BX1 + 0.5                                                                                # 之字形消防梯（东墙）：下跑上行到二层平台，回折上跑到屋顶平台
    al.box(fx, fx + 1.5, BY0 + 6.0, BY0 + 8.2, H1 - 0.12, H1 + 0.03, STEEL)                       # 二层平台（后门前）
    al.box(fx, fx + 1.5, BY0 + 0.8, BY0 + 3.0, HE - 0.12, HE + 0.03, STEEL)                       # 屋顶平台
    for i in range(10):
        al.boxc(fx + 0.5, BY0 + 3.2 + i * 0.28, i * 0.36, 1.0, 0.3, 0.1, STEEL)                   # 下跑（向 +y 上行）
        al.boxc(fx + 0.5, BY0 + 5.9 - i * 0.28, H1 + i * 0.36, 1.0, 0.3, 0.1, STEEL)              # 上跑（回折向 -y 上行）
    for yy in (BY0 + 6.0, BY0 + 8.2):
        al.tube([(fx + 1.45, yy, H1 + 0.03), (fx + 1.45, yy, H1 + 1.0)], 0.03, STEEL, 4)
    al.tube([(fx + 1.45, BY0 + 6.0, H1 + 1.0), (fx + 1.45, BY0 + 8.2, H1 + 1.0)], 0.03, STEEL, 4)
    for i in range(8):                                                                            # 酒桶
        al.cyl(6.5 + (i % 4) * 0.8, BY1 - 1.6 - (i // 4) * 0.8, 0, 0.36, 0.75, WOOD, 12)
    for i in range(7):                                                                            # 木条箱
        al.boxc(rnd.uniform(6, 12.6), rnd.uniform(BY0 + 1.0, BY0 + 5), 0, rnd.uniform(0.8, 1.2), rnd.uniform(0.8, 1.1), rnd.uniform(0.7, 1.0), WOOD)
    for k in range(2):                                                                            # 垃圾箱
        al.boxc(9.5 + k * 2.4, BY0 + 6.8, 0, 1.8, 1.0, 1.1, GREEN)
        al.boxc(9.5 + k * 2.4, BY0 + 6.8, 1.1, 1.9, 1.1, 0.1, STEEL)
    for i in range(6):                                                                            # 酒瓶垛（暗色小圆柱）
        al.cyl(7.0 + i * 0.3, BY0 + 0.8, 0, 0.09, 0.3, WIN, 6)

    # ------------------------------------------------------------ 街面：露天桌 + 路灯
    st = Batch('props_street')
    for k in range(3):
        tx = BX0 + 4.0 + k * 4.5; ty = BY0 - 2.0
        st.cyl(tx, ty, 0, 0.06, 0.75, STEEL, 6); st.cyl(tx, ty, 0.75, 0.5, 0.05, WOODD, 16)
        for a in (0.6, 2.7, 4.8):
            st.cyl(tx + 0.75 * math.cos(a), ty + 0.75 * math.sin(a), 0, 0.04, 0.45, STEEL, 6)
            st.cyl(tx + 0.75 * math.cos(a), ty + 0.75 * math.sin(a), 0.45, 0.2, 0.05, WOOD, 10)
    for k in range(3):
        lx = -22.0 + k * 20.0
        st.cyl(lx, -12.6, 0, 0.13, 6.2, STEEL, 8); st.tube([(lx, -12.6, 6.2), (lx, -12.0, 6.5), (lx, -11.3, 6.5)], 0.06, STEEL, 6)
        st.boxc(lx, -11.2, 6.2, 0.7, 0.5, 0.25, LAMP)
    for k in range(4): st.cyl(-20.0 + k * 9.0, -11.6, 0, 0.14, 0.9, STEEL, 8)                    # 路缘柱

    # ------------------------------------------------------------ 场地
    gr = Batch('site_ground')
    gr.box(-30, 28, -34, 14, -0.3, 0, ASPH)
    gr.box(-30, 32, -12, BY0, 0, 0.16, CONC)                                                     # 人行道
    gr.box(4.0, 14.0, BY0 - 0.1, BY1, 0, 0.05, CONC)                                             # 后巷地面
    for k in range(9): gr.boxc(-26 + k * 7.0, -19.0, 0.02, 3.4, 0.2, 0.03, MARK)                 # 路中虚线
    for (px, py, rx, ry) in ((-6, -14.6, 1.8, 1.0), (10, -16, 2.2, 1.2), (8, -2, 1.2, 0.8), (-24, -22, 2.0, 1.1)):
        gr.boxc(px, py, 0.05, rx * 2, ry * 2, 0.01, PUDDLE)

    bg = Batch('bg_ground'); bg.box(-900, 900, -900, 900, -1.5, -0.5, GROUND)
    bs = Batch('bg_shacks')
    for i in range(70):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(48, 300)
        px, py = math.cos(a) * d * 1.3, math.sin(a) * d - 8
        if -34 < px < 36 and -40 < py < 18: continue
        w, dd = rnd.uniform(6, 16), rnd.uniform(6, 14)
        bs.box(px - w / 2, px + w / 2, py - dd / 2, py + dd / 2, 0, rnd.uniform(3.0, 8.0), BG_SHACK)
    for k in range(5):                                                                            # 街对面成排低矮棚屋
        bx = -30 + k * 13.0
        bs.box(bx, bx + 11, -42, -34, 0, rnd.uniform(4.0, 6.0), BG_SHACK)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=40.0, sun_e=3.6, sky_s=0.5)
    C.point_light('pt_sign', (BX0 - 1.5, BY0 - 1.5, 5.2), 2.5e3, (1.0, 0.65, 0.2), 0.4)
    for k in range(3): C.point_light('pt_l%d' % k, (-22.0 + k * 20.0, -11.2, 6.0), 1.5e3, (1.0, 0.85, 0.6), 0.3)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0
    CAMS = {
        'c1': ((46.0, -56.0, 36.0), (-3.0, -2.0, 4.0), 32, 0.0),
        'c2': ((-4.0, -30.0, 5.0), (-6.0, -6.0, 3.5), 34, 0.0),
        'under': ((9.0, -34.0, 9.0), (9.0, 4.0, 4.0), 30, 0.0),
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
