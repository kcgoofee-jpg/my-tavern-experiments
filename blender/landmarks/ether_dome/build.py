"""大骑士领·圣都 核心区「以太穹顶」（site_kavalierki）——只做外观。
**仓库推断**：卡（`docs/card-digest.md` L89）写的核心区只有 商业联合会大厦 / 太阳骑士大竞技场 /
圆桌骑士议事殿 / 会所，「以太穹顶」不在卡里，是仓库自设的以太技术展示场（同 `docs/card-buildings.md` 的标注）。
中立性：无人物、无文字 / 标志（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/ether_dome/manifest.json 的 budgets 里给三角形预算）：
  props_dome   穹顶本体：环形墩座 + 20 道肋 + 玻璃幕扇 + 顶部以太核心
  props_field  场环：两圈悬浮发光环 + 四支以太晶簇
  site_ground  台基铺装 + 四向台阶 + 环道
  props_lights 场外灯柱
bg_*：既有城建（远景楼群与地面，只为成图挡地平线，不导出）。

布局（米，地面 z=0，台基顶面 z=3）：穹顶在原点，墩座环 r=48、肋拱顶高约 52；
四支晶簇在 r=62 的 45°/135°/225°/315°；场环悬在 z≈30 与 z≈40；四向台阶在 0/90/180/270。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final ether_dome）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/ether_dome/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/ed.jpg [--blend /tmp/ed.blend] [--log /tmp/ed.log] [--exposure 0.0]
cam: c1 主视角（西南高位，连台基一起）/ c2 正立面（南）/ c3 东侧（看场环与晶簇）
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/ed.jpg', blend='', log='', exposure=''))

PL = 3.0        # 台基高
R_POD = 48.0    # 墩座环半径
R_DOME = 46.0   # 穹顶半径
N_RIB = 20      # 肋数
DOME_Z = 12.0   # 起拱高度（台基之上）


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch

    ASHLAR = C.pbr('ed_ashlar', 'white_sandstone_blocks_02', 3.0, tint=(0.93, 0.91, 0.85), sat=0.18, weather=0.2)
    MARBLE = C.pbr('ed_marble', 'Marble021', 2.2, tint=(0.95, 0.95, 0.93), sat=0.1)
    PAVE = C.pbr('ed_pave', 'patterned_paving', 4.5, tint=(0.78, 0.77, 0.72), sat=0.2)
    ROAD = C.pbr('ed_road', 'asphalt_02', 6.0, tint=(0.34, 0.34, 0.36), sat=0.2, value=0.8)
    BRONZE = C.pbr('ed_bronze', 'Metal009', 2.0, tint=(0.56, 0.44, 0.22), sat=0.35, metal=0.7)
    GLASS = C.glass('ed_glass', (0.10, 0.13, 0.15))
    GLASS_L = C.glass('ed_glass_l', (0.14, 0.16, 0.14), emit=(0.75, 0.9, 1.0), estr=2.4)   # 以太偏青蓝
    ETHER = C.flat('ed_ether', (0.72, 0.86, 1.0), 0.3, emit=(0.68, 0.86, 1.0), estr=8.0)
    ETHER_W = C.flat('ed_ether_w', (0.80, 0.90, 1.0), 0.35, emit=(0.86, 0.92, 1.0), estr=4.0)
    GOLD = C.flat('ed_gold', (0.78, 0.62, 0.22), 0.28, metal=0.85, coat=0.5)
    SHELL = C.flat('ed_shell', (0.76, 0.83, 0.88), 0.16, coat=0.65)      # 穹面：浅色搪瓷壳（玻璃渲出来是鸟笼）
    LAMP = C.flat('ed_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.9, 0.72), estr=13.0)

    points = []

    # ------------------------------------------------------------ 穹顶：墩座 + 肋 + 玻璃幕扇 + 顶部以太核心
    dome = Batch('props_dome')
    dome.cyl(0, 0, PL, R_POD + 4, 1.2, MARBLE, 64, r2=R_POD + 3)              # 墩座压顶
    for i in range(N_RIB):                                                    # 20 道墩（肋脚）
        a = i * math.tau / N_RIB
        px, py = math.cos(a) * R_POD, math.sin(a) * R_POD
        dome.boxc(px, py, PL + 1.2, 3.2, 3.2, DOME_Z - 1.2, ASHLAR)
        dome.boxc(px, py, PL + DOME_Z - 0.2, 4.0, 4.0, 1.4, MARBLE)
    dome.cyl(0, 0, PL + 1.2, R_POD - 2.6, DOME_Z - 1.4, ASHLAR, 64, r2=R_POD - 3.4)   # 鼓座（墩后的实壁）
    # 玻璃幕扇（在肋之间，环形带窗）
    for i in range(N_RIB):
        a0 = (i + 0.12) * math.tau / N_RIB; a1 = (i + 0.88) * math.tau / N_RIB
        dome.lathe(0, 0, PL + 4.0, [(R_DOME - 2.2, 0), (R_DOME - 2.2, 5.4)], GLASS_L, 8, a0=a0, a1=a1)
    # 穹顶：肋 + 扇面（用旋转体近似球冠，肋单独加厚成拱）
    prof = []
    for k in range(13):
        t = k / 12.0
        rr = R_DOME * math.cos(t * math.pi / 2 * 0.98)
        dz = DOME_Z + (R_DOME * 0.92) * math.sin(t * math.pi / 2 * 0.98) * 0.86
        prof.append((max(rr, 1.6), dz))
    dome.lathe(0, 0, PL, [(R_DOME - 0.6, DOME_Z - 0.4)] + prof, SHELL, 64)    # 穹面（浅色壳）
    for i in range(N_RIB):                                                    # 肋（贴着穹面加一圈细拱）
        a = i * math.tau / N_RIB
        pts = []
        for k in range(13):
            t = k / 12.0
            rr = (R_DOME + 0.5) * math.cos(t * math.pi / 2 * 0.98)
            dz = PL + DOME_Z + (R_DOME * 0.92) * math.sin(t * math.pi / 2 * 0.98) * 0.86
            pts.append((math.cos(a) * max(rr, 0.4), math.sin(a) * max(rr, 0.4), dz))
        dome.tube(pts, 0.75, MARBLE, 6)
    dome.cyl(0, 0, PL + DOME_Z + R_DOME * 0.80, 4.2, 1.2, GOLD, 24, r2=3.4)   # 顶环
    dome.sphere(0, 0, PL + DOME_Z + R_DOME * 0.80 + 1.6, 3.0, ETHER, seg=24, rings=14)   # 顶部以太核心
    points.append(((0, 0, PL + DOME_Z + R_DOME * 0.82 + 2.6), 3.2e4, (0.72, 0.88, 1.0)))

    # ------------------------------------------------------------ 场环 + 以太晶簇
    field = Batch('props_field')
    field.lathe(0, 0, PL + 26.0, [(R_DOME + 12.0, 0), (R_DOME + 12.0, 1.1), (R_DOME + 9.0, 1.1)], ETHER_W, 72)
    field.lathe(0, 0, PL + 38.0, [(R_DOME + 4.0, 0), (R_DOME + 4.0, 0.9), (R_DOME + 1.6, 0.9)], ETHER_W, 64)
    for k in range(4):                                                        # 四支以太晶簇
        a = k * math.tau / 4 + math.tau / 8
        cx, cy = math.cos(a) * 62.0, math.sin(a) * 62.0
        field.cyl(cx, cy, PL, 5.2, 2.2, ASHLAR, 16, r2=4.4)
        field.pyramid(cx, cy, PL + 2.2, 4.6, 4.6, 22.0, ETHER_W)
        field.pyramid(cx, cy, PL + 2.2, 2.4, 2.4, 30.0, ETHER)
        for d in (-1, 1):                                                     # 簇侧小晶
            dx, dy = -math.sin(a) * d * 3.4, math.cos(a) * d * 3.4
            field.pyramid(cx + dx, cy + dy, PL + 2.2, 2.0, 2.0, 13.0, ETHER_W)
        points.append(((cx, cy, PL + 20.0), 1.4e4, (0.72, 0.88, 1.0)))

    # ------------------------------------------------------------ 台基 + 环道 + 四向台阶
    ground = Batch('site_ground')
    ground.cyl(0, 0, 0, R_POD + 22, PL, PAVE, 72, r2=R_POD + 16)
    ground.cyl(0, 0, PL - 0.12, R_POD + 3, 0.12, MARBLE, 64, r2=R_POD + 3)
    ringn = 64
    for i in range(ringn):
        a0 = i * math.tau / ringn; a1 = (i + 1) * math.tau / ringn
        rr = R_POD + 30
        ground.strip([(math.cos(a0) * rr, math.sin(a0) * rr, 0),
                      (math.cos(a1) * rr, math.sin(a1) * rr, 0)], 9.0, 0.08, ROAD)
    for k in range(4):                                                        # 四向台阶
        a = k * math.tau / 4
        ground.strip([(math.cos(a) * (R_POD + 22), math.sin(a) * (R_POD + 22), 0),
                      (math.cos(a) * (R_POD - 2), math.sin(a) * (R_POD - 2), PL)], 30.0, 0.35, MARBLE)
    for k in range(8):                                                        # 台基边缘栏杆
        a = k * math.tau / 8 + math.tau / 16
        for t in (0.0, 0.5):
            aa = a + t * math.tau / 8 * 0.35
            px, py = math.cos(aa) * (R_POD + 18), math.sin(aa) * (R_POD + 18)
            ground.cyl(px, py, PL, 0.32, 1.5, MARBLE, 8)

    # ------------------------------------------------------------ 灯柱
    lights = Batch('props_lights')
    for i in range(12):
        a = i * math.tau / 12 + math.tau / 24
        lx, ly = math.cos(a) * (R_POD + 10), math.sin(a) * (R_POD + 10)
        lights.cyl(lx, ly, PL, 0.3, 5.6, BRONZE, 10)
        lights.cyl(lx, ly, PL + 5.6, 0.66, 1.3, LAMP, 10, r2=0.44)
        points.append(((lx, ly, PL + 6.4), 3.0e3, (1.0, 0.9, 0.72)))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：既有城建 + 上方甲板
    BG = C.flat('bg_conc', (0.36, 0.33, 0.29), 0.85, noise=0.3)
    BG2 = C.flat('bg_dark', (0.17, 0.17, 0.19), 0.85, noise=0.35)
    WGB = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.2, 3.6), seed=i * 4.1) for i, c in
           enumerate(((1.0, 0.85, 0.6), (0.7, 0.85, 1.0)))]
    far = Batch('bg_deck')
    far.box(-5200, 5200, -5200, 5200, -6, -4, BG)
    bt = Batch('bg_towers')
    rb = random.Random(41)
    cam1 = Vector((-260.0, -330.0))
    cam_bearing = math.degrees(math.atan2(cam1.y, cam1.x)) % 360
    placed = []
    for k in range(84):
        for _ in range(60):
            a = rb.uniform(0, math.tau); d = rb.uniform(300, 2000)
            x, y = math.cos(a) * d, math.sin(a) * d
            w, dd = rb.uniform(26, 58), rb.uniform(26, 58)
            clear = all(abs(x - px) > (w + pw) / 2 + 10 or abs(y - py) > (dd + pd) / 2 + 10 for px, py, pw, pd in placed)
            bearing = math.degrees(a) % 360
            in_cam_lane = (d < 560) and (abs((bearing - cam_bearing + 180) % 360 - 180) < 26)
            if clear and not in_cam_lane:
                break
        else:
            continue
        placed.append((x, y, w, dd))
        h = rb.uniform(22, 110)
        bt.box(x - w / 2, x + w / 2, y - dd / 2, y + dd / 2, 0, h, rb.choice(WGB) if k % 3 else BG2)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光：日间，以太偏冷蓝
    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=38.0, sun_e=4.4, sky_s=0.5)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.25)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0

    CAMS = {
        'c1': ((-190.0, -240.0, 108.0), (0.0, 0.0, 30.0), 30, 0.0),
        'c2': ((0.0, -215.0, 48.0), (0.0, 0.0, 34.0), 30, 0.0),
        'c3': ((225.0, 95.0, 62.0), (0.0, 0.0, 30.0), 30, 0.0),
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
