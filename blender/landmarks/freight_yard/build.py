"""货运站（tc_low）——只做外观。
卡原文（docs/landmarks/freight_yard.md，卡 L104 + L12）：下层的主要交通是老旧地面轨道、货运通道和步行；卡没有写具体货运站。
本模型：下层旧地面轨道枢纽——三条主线并向支线、一条岔线拐进货棚站台、桁架信号门架 + 扳道房、停着的旧货车、集装箱堆场。
中立性：无人物、无文字 / 标志、无武器类细节（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/freight_yard/manifest.json 的 budgets 里给三角形预算）：
  props_shed     货棚（砖墙铁皮顶）+ 货运站台 + 披檐钢柱
  props_rail     三条主线 + 岔线（枕木 / 钢轨 / 碴石）+ 车挡
  props_signal   桁架信号门架 + 两层扳道房 + 外挂钢梯
  props_stock    停着的旧货车（两节棚车、一节油罐车、一节敞车）
  props_yard     集装箱堆场 + 托盘 / 油桶 / 废料堆 + 灯杆 + 围栏
  site_ground    碴石道床 + 站台前硬化面
bg_*：棚屋剪影与大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  三条主线 y = -12 / -4 / 4，沿 x 贯穿 -58..58；岔线从 y=4 线在 x≈-30 处拐到 y=9，贴货棚站台（站台 y 11..14.5，x -12..22）；
  货棚 x -12..22、y 14.5..26.5（檐高 6.5）；信号门架在 x=34 跨三线；扳道房在 (44, 12)；堆场在南 y -32..-18。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final freight_yard）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/freight_yard/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/freight_yard.jpg [--blend /tmp/freight_yard.blend] [--log /tmp/freight_yard.log]
cam: c1 主视角（东南俯瞰全场）/ c2 站台与货棚立面 / under 西端沿线看并线与信号门架
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/freight_yard.jpg', blend='', log='', exposure='-0.3'))

TRACKS = (-12.0, -4.0, 4.0)      # 三条主线的 y
X0, X1 = -58.0, 58.0


def rot_box(B, x, y, z, sx, sy, sz, ang, m):
    """绕竖轴转 ang 的长方体（底面中心 x, y, z；尺寸 sx × sy × sz）"""
    c, s = math.cos(ang), math.sin(ang)
    pts = [(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)]
    vs = [(x + px * c - py * s, y + px * s + py * c, z + h) for h in (0, sz) for (px, py) in pts]
    fs = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    B.poly(vs, fs, m)


def branch_pts():
    """岔线：从 y=4 主线在 x=-32 处平顺拐到 y=9，再平行到 x=26（车挡）"""
    pts = []
    for i in range(0, 21):
        t = i / 20.0
        pts.append((-32.0 + t * 18.0, 4.0 + 5.0 * (t * t * (3 - 2 * t))))
    pts += [(-14.0 + j * 2.0, 9.0) for j in range(1, 21)]
    return pts


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(23)

    BRICK = C.pbr('fy_brick', 'dark_brick_wall', 2.6, tint=(0.5, 0.36, 0.3), sat=0.4, value=0.95, weather=0.85)
    SHEET = C.pbr('fy_sheet', 'box_profile_metal_sheet', 2.6, tint=(0.4, 0.34, 0.28), sat=0.4, value=1.0, metal=0.4, weather=1.0)
    RUST = C.pbr('fy_rust', 'box_profile_metal_sheet', 2.4, tint=(0.55, 0.25, 0.12), sat=0.8, value=1.05, metal=0.3, weather=1.0)
    BLUEG = C.pbr('fy_blue', 'box_profile_metal_sheet', 2.4, tint=(0.25, 0.34, 0.42), sat=0.5, value=1.0, metal=0.3, weather=1.0)
    GREEN = C.pbr('fy_green', 'box_profile_metal_sheet', 2.4, tint=(0.25, 0.36, 0.28), sat=0.5, value=1.0, metal=0.3, weather=1.0)
    STEEL = C.pbr('fy_steel', 'Metal009', 2.0, tint=(0.3, 0.3, 0.32), sat=0.15, metal=0.85, weather=0.8)
    RAILM = C.pbr('fy_rail', 'Metal009', 1.6, tint=(0.5, 0.42, 0.36), sat=0.35, metal=0.9, rough_mul=0.8)
    IRON = C.flat('fy_iron', (0.05, 0.05, 0.055), 0.5, metal=0.7)
    CONC = C.pbr('fy_conc', 'concrete_wall_008', 4.0, tint=(0.45, 0.44, 0.42), sat=0.15, value=0.85, weather=0.7)
    WOOD = C.pbr('fy_wood', 'rough_wood', 2.2, tint=(0.4, 0.31, 0.22), sat=0.4, value=0.7)
    WOODP = C.pbr('fy_woodp', 'dark_wood', 2.0, tint=(0.5, 0.4, 0.3), sat=0.35, value=0.85)
    BALLAST = C.pbr('fy_ballast', 'dirt_floor', 5.0, tint=(0.3, 0.28, 0.25), sat=0.2, value=0.55)
    ASPH = C.pbr('fy_asph', 'asphalt_02', 5.0, tint=(0.3, 0.3, 0.32), sat=0.1, value=0.7)
    WIN = C.flat('fy_win', (0.04, 0.04, 0.05), 0.3)
    WINWARM = C.flat('fy_winwarm', (1, 1, 1), 0.4, emit=(1.0, 0.6, 0.25), estr=4.0)
    SIGR = C.flat('fy_sig_red', (1, 1, 1), 0.4, emit=(1.0, 0.1, 0.06), estr=30.0)
    SIGG = C.flat('fy_sig_green', (1, 1, 1), 0.4, emit=(0.2, 1.0, 0.3), estr=30.0)
    FLOOD = C.flat('fy_flood', (1, 1, 1), 0.4, emit=(1.0, 0.9, 0.7), estr=20.0)
    SCRAP = C.flat('fy_scrap', (0.24, 0.2, 0.17), 0.9, noise=0.6)
    GROUND = C.flat('fy_bg_ground', (0.16, 0.16, 0.15), 0.95, noise=0.5)
    BG_SHACK = C.flat('fy_bg_shack', (0.26, 0.22, 0.19), 0.9)

    # ------------------------------------------------------------ 货棚 + 站台
    sh = Batch('props_shed')
    sx0, sx1, sy0, sy1, SE = -12.0, 22.0, 14.5, 26.5, 6.5
    sh.box(sx0, sx1, sy0, sy1, 0, SE, BRICK)
    sh.gable(sx0, sx1, sy0, sy1, SE, 2.8, SHEET, over=0.7)
    for k in range(5):                                            # 南墙推拉门 + 壁柱 + 高窗
        px = sx0 + 3.5 + k * 6.5
        sh.boxc(px, sy0 - 0.12, 0, 3.2, 0.24, 4.6, RUST if k % 2 else BLUEG)
        sh.boxc(px + 3.2, sy0 - 0.15, 0, 0.7, 0.3, SE, CONC)
        sh.boxc(px, sy0 - 0.08, 5.0, 2.0, 0.14, 1.0, WIN)
    for k in range(5): sh.boxc(sx0 + 4 + k * 6.5, sy1 + 0.08, 4.6, 2.0, 0.14, 1.2, WIN)
    sh.boxc(sx1 + 0.1, (sy0 + sy1) / 2, 0, 0.2, 3.4, 4.2, RUST)       # 东山墙小门
    sh.cyl(sx1 - 3.0, sy1 + 0.6, SE + 2.8, 0.7, 2.0, STEEL, 12)       # 屋脊排气筒
    sh.box(sx0 - 2, sx1 + 2, 11.0, sy0, 0, 1.1, CONC)                 # 站台（高 1.1）
    for k in range(9):                                                # 站台披檐钢柱 + 披檐
        sh.cyl(sx0 - 1.0 + k * 4.0, 11.6, 1.1, 0.14, 4.4, STEEL, 8)
    sh.poly([(sx0 - 2, 10.8, 5.2), (sx1 + 2, 10.8, 5.2), (sx1 + 2, sy0, 6.3), (sx0 - 2, sy0, 6.3)], [(0, 1, 2, 3), (3, 2, 1, 0)], SHEET)
    for k in range(4):                                                # 站台上的货箱
        sh.boxc(sx0 + 3 + k * 6.0, 12.6, 1.1, 1.8, 1.4, 1.3, WOODP)

    # ------------------------------------------------------------ 轨道
    rl = Batch('props_rail')
    def straight(y, xa, xb):
        rl.strip([(xa, y - 0.72, 0.36), (xb, y - 0.72, 0.36)], 0.14, 0.18, RAILM)
        rl.strip([(xa, y + 0.72, 0.36), (xb, y + 0.72, 0.36)], 0.14, 0.18, RAILM)
        n = int((xb - xa) / 0.95)
        for i in range(n): rl.boxc(xa + 0.5 + i * 0.95, y, 0.06, 0.3, 2.6, 0.22, WOOD)
    for y in TRACKS: straight(y, X0, X1)
    bp = branch_pts()
    for sgn in (-0.72, 0.72):
        line = []
        for i, (px, py) in enumerate(bp):
            a = math.atan2(bp[min(i + 1, len(bp) - 1)][1] - bp[max(i - 1, 0)][1], bp[min(i + 1, len(bp) - 1)][0] - bp[max(i - 1, 0)][0])
            line.append((px - math.sin(a) * sgn, py + math.cos(a) * sgn, 0.36))
        rl.strip(line, 0.14, 0.18, RAILM)
    for i, (px, py) in enumerate(bp):
        if i % 2: continue
        a = math.atan2(bp[min(i + 1, len(bp) - 1)][1] - bp[max(i - 1, 0)][1], bp[min(i + 1, len(bp) - 1)][0] - bp[max(i - 1, 0)][0])
        rot_box(rl, px, py, 0.06, 0.3, 2.6, 0.22, a, WOOD)
    for (bx, by) in ((26.6, 9.0),):                                     # 岔线车挡
        rl.boxc(bx, by, 0.3, 0.7, 2.4, 1.4, IRON)
        rl.boxc(bx - 0.5, by, 0.3, 0.9, 0.3, 0.6, STEEL)
    for y in TRACKS:                                                    # 主线东端车挡
        rl.boxc(X1 - 0.6, y, 0.3, 0.7, 2.4, 1.2, IRON)
    for xj in (-28.0, -20.0):                                           # 道岔转辙器（示意：尖轨 + 转辙机箱）
        rl.boxc(xj, 5.6, 0.0, 0.9, 0.7, 0.7, STEEL)

    # ------------------------------------------------------------ 信号门架 + 扳道房
    sg = Batch('props_signal')
    gx = 34.0
    for yy in (-16.0, 8.0):
        sg.boxc(gx, yy, 0, 0.9, 0.9, 9.0, STEEL)
        for k in range(4): sg.tube([(gx, yy, 0.6 + k * 2.2), (gx + 0.0, yy + (0.0), 1.6 + k * 2.2)], 0.05, STEEL, 4)
    sg.boxc(gx, -4.0, 8.6, 0.8, 26.0, 0.8, STEEL)                       # 跨三线桁梁
    sg.boxc(gx, -4.0, 9.6, 0.4, 26.0, 0.3, STEEL)
    for k in range(9):                                                  # 斜撑
        yy = -16.0 + k * 3.0
        sg.tube([(gx, yy, 9.6), (gx, yy + 1.5, 8.6)], 0.05, STEEL, 4)
        sg.tube([(gx, yy + 1.5, 8.6), (gx, yy + 3.0, 9.6)], 0.05, STEEL, 4)
    for i, y in enumerate(TRACKS):                                       # 每线一盏信号灯（红 / 绿色点）
        sg.boxc(gx - 0.5, y, 7.2, 0.5, 0.9, 1.3, IRON)
        sg.sphere(gx - 0.8, y, 8.1, 0.28, SIGR if i != 1 else SIGG, seg=10, rings=6)
        sg.sphere(gx - 0.8, y, 7.5, 0.28, SIGG if i != 1 else SIGR, seg=10, rings=6)
    cx, cy = 44.0, 12.0                                                 # 扳道房：两层，砖基木板
    sg.box(cx - 3, cx + 3, cy - 2.5, cy + 2.5, 0, 3.0, BRICK)
    sg.box(cx - 3.3, cx + 3.3, cy - 2.8, cy + 2.8, 3.0, 3.3, CONC)
    sg.box(cx - 3, cx + 3, cy - 2.5, cy + 2.5, 3.3, 6.2, WOODP)
    sg.gable(cx - 3.6, cx + 3.6, cy - 3.1, cy + 3.1, 6.2, 1.6, SHEET, over=0.3)
    for dx in (-1.8, 0.0, 1.8): sg.boxc(cx + dx, cy - 2.56, 3.9, 1.1, 0.12, 1.4, WINWARM if dx == 0 else WIN)
    sg.boxc(cx, cy - 2.53, 0, 1.0, 0.14, 2.2, RUST)                     # 底层门
    for k in range(9):                                                  # 外挂钢梯（东侧）
        sg.boxc(cx + 3.7, cy - 2.0 + k * 0.2, k * 0.34, 0.8, 0.9, 0.1, STEEL)
    sg.box(cx + 3.3, cx + 4.3, cy - 2.4, cy - 0.4, 3.0, 3.1, STEEL)     # 梯顶平台

    # ------------------------------------------------------------ 停着的旧货车
    st = Batch('props_stock')
    def wagon(x, y, L, kind, col):
        st.boxc(x, y, 0.55, L, 2.4, 0.3, IRON)                        # 底架
        for dx in (-L * 0.32, L * 0.32):                              # 转向架 + 轮
            st.boxc(x + dx, y, 0.2, 2.6, 2.0, 0.4, STEEL)
            for wy in (-0.72, 0.72): st.sphere(x + dx - 0.5, y + wy, 0.42, 0.42, STEEL, seg=10, rings=6, sz=0.35)
        if kind == 'box':
            st.boxc(x, y, 0.85, L - 0.6, 2.6, 2.9, col)
            st.gable(x - (L - 0.6) / 2, x + (L - 0.6) / 2, y - 1.4, y + 1.4, 3.75, 0.5, SHEET, over=0.15)
            st.boxc(x, y - 1.33, 0.9, 1.6, 0.1, 2.3, IRON)
        elif kind == 'tank':
            st.tube([(x - L * 0.42, y, 2.1), (x + L * 0.42, y, 2.1)], 1.35, col, 18)
            st.sphere(x - L * 0.42, y, 2.1, 1.35, col, seg=14, rings=8)
            st.sphere(x + L * 0.42, y, 2.1, 1.35, col, seg=14, rings=8)
            st.boxc(x, y, 3.4, 1.4, 0.8, 0.5, IRON)
        else:  # open wagon
            st.box(x - L / 2, x + L / 2, y - 1.3, y + 1.3, 0.85, 1.9, col)
            st.box(x - L / 2 + 0.2, x + L / 2 - 0.2, y - 1.1, y + 1.1, 1.0, 1.95, SCRAP)
    wagon(-14.0, -4.0, 11.0, 'box', RUST)
    wagon(-2.0, -4.0, 11.0, 'box', GREEN)
    wagon(10.0, -4.0, 11.0, 'tank', BLUEG)
    wagon(4.0, 9.0, 10.0, 'open', RUST)
    wagon(-40.0, -12.0, 11.0, 'box', BLUEG)

    # ------------------------------------------------------------ 堆场
    yd = Batch('props_yard')
    def cont(x, y, z, col, ang=0.0):
        rot_box(yd, x, y, z, 6.0, 2.4, 2.6, ang, col)
    for (x, y, lv) in ((-30, -26, 2), (-23, -26, 3), (-16, -26, 1), (-30, -22.5, 1), (-8, -26, 2), (0, -25, 1), (6.5, -25.5, 2), (36, -24, 1), (42.5, -24, 2)):
        for j in range(lv): cont(x, y, j * 2.6, (RUST, BLUEG, GREEN, RUST, BLUEG)[(int(x) + j) % 5], rnd.uniform(-0.04, 0.04))
    for i in range(10):                                                # 托盘垛
        px, py = rnd.uniform(-48, 50), rnd.uniform(-19, -16.5)
        for j in range(rnd.randint(2, 4)): yd.boxc(px, py, j * 0.15, 1.2, 1.0, 0.15, WOOD)
    for i in range(16):                                                # 油桶
        yd.cyl(rnd.uniform(-52, 54), rnd.uniform(-20, -17), 0, 0.46, 0.95, RUST if i % 3 else STEEL, 12)
    for (px, py, r) in ((-48, -30, 3.4), (46, -30, 3.0), (18, -31, 2.6)):   # 废料堆
        yd.cyl(px, py, 0, r * 1.6, r, SCRAP, 14, r2=r * 0.3)
    for k in range(6):                                                 # 灯杆
        px = -48 + k * 20.0
        yd.cyl(px, -18.5, 0, 0.14, 7.0, STEEL, 6); yd.boxc(px, -18.5, 7.0, 1.0, 0.6, 0.3, FLOOD)
    for i in range(5):                                                 # 围栏（南缘，断续）
        xa = -56 + i * 24.0
        if i == 2: continue
        for k in range(5): yd.cyl(xa + k * 4.5, -34.0, 0, 0.11, 2.4, STEEL, 6)
        for zz in (0.5, 1.3, 2.2): yd.tube([(xa, -34.0, zz), (xa + 18.0, -34.0, zz)], 0.04, STEEL, 4)

    # ------------------------------------------------------------ 场地
    gr = Batch('site_ground')
    gr.box(-64, 64, -38, 30, -0.3, 0, BALLAST)
    gr.box(-14, 24, 6.0, 14.5, 0, 0.04, ASPH)                          # 站台前硬化面（岔线之间）
    gr.box(-56, 56, -19, -16, 0, 0.04, ASPH)                           # 堆场通道

    bg = Batch('bg_ground'); bg.box(-900, 900, -900, 900, -1.5, -0.5, GROUND)
    bs = Batch('bg_shacks')
    for i in range(70):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(70, 340)
        px, py = math.cos(a) * d * 1.4, math.sin(a) * d
        if abs(px) < 70 and abs(py) < 44: continue
        w, dd = rnd.uniform(6, 16), rnd.uniform(6, 14)
        bs.box(px - w / 2, px + w / 2, py - dd / 2, py + dd / 2, 0, rnd.uniform(3.0, 6.5), BG_SHACK)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=40.0, sun_e=3.6, sky_s=0.5)
    C.point_light('pt_sig', (gx - 0.8, -4.0, 8.0), 2.0e3, (0.3, 1.0, 0.4), 0.4)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0
    CAMS = {
        'c1': ((92.0, -84.0, 56.0), (2.0, 2.0, 3.0), 30, 0.0),
        'c2': ((36.0, -32.0, 11.0), (4.0, 14.0, 3.0), 32, 0.0),
        'under': ((-84.0, -4.0, 9.0), (10.0, 0.0, 4.0), 30, 0.0),
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
