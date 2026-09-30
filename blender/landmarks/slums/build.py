"""贫民窟（tc_low）——只做外观。
设定（docs/landmarks/slums.md，卡 L369 + A29）：下层有贫民窟（瑞秋的出生地），放在下层。
本模型：下层最密的一片棚户——棚屋两到四层错位叠放、木板桥与外挂阶梯、乱接的水管与线缆、巷心公用水点、高脚水箱。
中立性：无人物、无文字 / 标志、无武器类细节（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/slums/manifest.json 的 budgets 里给三角形预算）：
  props_shacks  叠放的棚屋（铁皮 / 胶合板 / 防水布拼贴 + 单坡顶 + 小窗）
  props_pipes   外墙水管、下垂线缆、屋顶炉管、高脚水箱塔
  props_stairs  外挂阶梯、悬空木板桥、竖梯
  props_yard    公用水点 + 水桶 / 托盘 / 油桶 / 旧轮胎 / 废料堆 + 晾杆
  site_ground   踩实泥地 + 碎石 + 积水
bg_*：更远处的棚屋剪影与大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  8 × 7 格，每格 10 m；主巷沿 x 弯过 y≈-4，南北向窄弄在 i=3；水点在 (0, -4)；水箱塔在 (32, 30)。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final slums）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/slums/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/slums.jpg [--blend /tmp/slums.blend] [--log /tmp/slums.log]
cam: c1 主视角（东南俯瞰全片）/ c2 自南口沿主巷看进去 / under 西侧看层叠墙面与木板桥
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/slums.jpg', blend='', log='', exposure='-0.3'))

NX, NY, CELL = 8, 7, 10.0
X_OFF, Y_OFF = -NX * CELL / 2, -NY * CELL / 2 + 5.0


def rot_box(B, x, y, z, sx, sy, sz, ang, m):
    c, s = math.cos(ang), math.sin(ang)
    pts = [(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)]
    vs = [(x + px * c - py * s, y + px * s + py * c, z + h) for h in (0, sz) for (px, py) in pts]
    fs = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    B.poly(vs, fs, m)


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(53)

    SHEETS = [C.pbr('sl_sheet%d' % i, 'box_profile_metal_sheet', 2.4, tint=t, sat=0.6, value=1.0, metal=0.3, weather=1.0)
              for i, t in enumerate(((0.42, 0.34, 0.28), (0.55, 0.26, 0.12), (0.3, 0.38, 0.44), (0.28, 0.4, 0.3), (0.5, 0.42, 0.3)))]
    PLY = C.pbr('sl_ply', 'rough_wood', 2.2, tint=(0.5, 0.4, 0.28), sat=0.4, value=0.8)
    PLYD = C.pbr('sl_plyd', 'dark_wood', 2.0, tint=(0.36, 0.28, 0.2), sat=0.3, value=0.8)
    TARP = C.flat('sl_tarp', (0.16, 0.3, 0.46), 0.8, noise=0.5)
    TARP2 = C.flat('sl_tarp2', (0.5, 0.22, 0.14), 0.8, noise=0.5)
    STEEL = C.pbr('sl_steel', 'Metal009', 2.0, tint=(0.28, 0.29, 0.31), sat=0.15, metal=0.85, weather=0.8)
    RUSTM = C.pbr('sl_rustm', 'Metal009', 2.0, tint=(0.45, 0.24, 0.14), sat=0.6, metal=0.7, weather=1.0)
    RUBBER = C.pbr('sl_rubber', 'Rubber004', 1.2, tint=(0.12, 0.12, 0.12), sat=0.05)
    CONC = C.pbr('sl_conc', 'concrete_wall_008', 4.0, tint=(0.44, 0.43, 0.41), sat=0.15, value=0.85, weather=0.8)
    DIRT = C.pbr('sl_dirt', 'dirt_floor', 6.0, tint=(0.32, 0.28, 0.22), sat=0.3, value=0.6)
    GRAVEL = C.pbr('sl_gravel', 'precast_stone_paving', 3.0, tint=(0.4, 0.38, 0.34), sat=0.2, value=0.6)
    CABLE = C.flat('sl_cable', (0.16, 0.15, 0.14), 0.5)
    WIN = C.flat('sl_win', (0.04, 0.04, 0.05), 0.3)
    WINWARM = C.flat('sl_winwarm', (1, 1, 1), 0.4, emit=(1.0, 0.6, 0.25), estr=5.0)
    LAMP = C.flat('sl_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.85, 0.6), estr=14.0)
    SCRAP = C.flat('sl_scrap', (0.24, 0.2, 0.17), 0.9, noise=0.6)
    PUDDLE = C.flat('sl_puddle', (0.03, 0.035, 0.045), 0.06)
    GROUND = C.flat('sl_bg_ground', (0.16, 0.16, 0.15), 0.95, noise=0.5)
    BG_SHACK = C.flat('sl_bg_shack', (0.26, 0.22, 0.19), 0.9)

    sh = Batch('props_shacks'); pp = Batch('props_pipes'); stt = Batch('props_stairs'); yd = Batch('props_yard')
    placed = []                                            # (cx, cy, w, d, top) 记下每座棚屋，用来拉线缆 / 搭桥

    for i in range(NX):
        for j in range(NY):
            if i == 3 or j == 2: continue                  # 南北窄弄 / 东西主巷
            if rnd.random() < 0.08: continue
            cx = X_OFF + (i + 0.5) * CELL + rnd.uniform(-0.8, 0.8)
            cy = Y_OFF + (j + 0.5) * CELL + rnd.uniform(-0.8, 0.8)
            w, d = rnd.uniform(6.2, 8.4), rnd.uniform(6.2, 8.4)
            floors = rnd.choice((1, 2, 2, 3, 3, 4))
            z = 0.0
            ww, dd = w, d
            for f in range(floors):
                h = rnd.uniform(2.7, 3.2)
                m = rnd.choice(SHEETS + [PLY, PLYD, TARP])
                ox, oy = (rnd.uniform(-0.8, 0.8) if f else 0.0), (rnd.uniform(-0.8, 0.8) if f else 0.0)
                ang = rnd.uniform(-0.05, 0.05)
                rot_box(sh, cx + ox, cy + oy, z, ww, dd, h, ang, m)
                for k in range(rnd.randint(1, 3)):         # 小窗（方洞 / 暖光）
                    side = rnd.choice((0, 1, 2, 3))
                    off = rnd.uniform(-ww * 0.3, ww * 0.3)
                    if side == 0: sh.boxc(cx + ox + off, cy + oy - dd / 2 - 0.05, z + 1.1, 0.9, 0.12, 0.8, WINWARM if rnd.random() < 0.3 else WIN)
                    elif side == 1: sh.boxc(cx + ox + ww / 2 + 0.05, cy + oy + off, z + 1.1, 0.12, 0.9, 0.8, WINWARM if rnd.random() < 0.3 else WIN)
                    elif side == 2: sh.boxc(cx + ox + off, cy + oy + dd / 2 + 0.05, z + 1.1, 0.9, 0.12, 0.8, WIN)
                    else: sh.boxc(cx + ox - ww / 2 - 0.05, cy + oy + off, z + 1.1, 0.12, 0.9, 0.8, WIN)
                z += h
                ww *= rnd.uniform(0.82, 0.95); dd *= rnd.uniform(0.82, 0.95)
                cx += ox * 0.5; cy += oy * 0.5
            # 屋顶：单坡铁皮压旧轮胎 / 防水布
            rm = rnd.choice(SHEETS + [TARP, TARP2])
            sh.poly([(cx - ww / 2 - 0.3, cy - dd / 2 - 0.3, z), (cx + ww / 2 + 0.3, cy - dd / 2 - 0.3, z),
                     (cx + ww / 2 + 0.3, cy + dd / 2 + 0.3, z + 0.9), (cx - ww / 2 - 0.3, cy + dd / 2 + 0.3, z + 0.9)], [(0, 1, 2, 3), (3, 2, 1, 0)], rm)
            for t in range(rnd.randint(0, 3)):
                yd.cyl(cx + rnd.uniform(-ww / 3, ww / 3), cy + rnd.uniform(-dd / 3, dd / 3), z + 0.5, 0.45, 0.18, RUBBER, 12)
            if rnd.random() < 0.3:                         # 屋顶水桶
                yd.cyl(cx - ww / 4, cy + dd / 4, z + 0.4, 0.42, 0.9, RUSTM if rnd.random() < 0.5 else TARP, 12)
            if rnd.random() < 0.35:                        # 斜拉防水布（挑出屋檐）
                sh.poly([(cx - ww / 2, cy - dd / 2 - 0.2, z + 0.1), (cx + ww / 2, cy - dd / 2 - 0.2, z + 0.1), (cx + ww / 2 + 0.6, cy - dd / 2 - 2.4, z - 1.3), (cx - ww / 2 - 0.6, cy - dd / 2 - 2.4, z - 1.3)], [(0, 1, 2, 3), (3, 2, 1, 0)], TARP if rnd.random() < 0.6 else TARP2)
            if rnd.random() < 0.5:                         # 炉管
                pp.cyl(cx + ww / 3, cy - dd / 3, z + 0.4, 0.16, rnd.uniform(1.4, 2.6), STEEL if rnd.random() < 0.5 else RUSTM, 8)
            if rnd.random() < 0.8:                         # 贴墙水管
                px = cx - ww / 2 - 0.15
                pp.tube([(px, cy - dd / 4, 0.3), (px, cy - dd / 4, z - 0.2)], 0.13, RUSTM if rnd.random() < 0.5 else STEEL, 8)
                pp.tube([(px, cy - dd / 4, z * 0.45), (px, cy + dd / 4, z * 0.45)], 0.11, STEEL, 8)   # 横向管线
            placed.append((cx, cy, ww, dd, z))

    # 邻屋间下垂线缆 + 悬空木板桥
    for a in range(len(placed)):
        ax, ay, aw, ad, az = placed[a]
        b = min((k for k in range(len(placed)) if k != a), key=lambda k: (placed[k][0] - ax) ** 2 + (placed[k][1] - ay) ** 2)
        bx, by, bw, bd, bz = placed[b]
        if math.hypot(bx - ax, by - ay) > 15.0: continue
        z0, z1 = az - 0.3, bz - 0.3
        pp.tube([(ax, ay, z0), ((ax + bx) / 2, (ay + by) / 2, min(z0, z1) - 1.4), (bx, by, z1)], 0.07, CABLE, 5)
        pp.tube([(ax + 0.6, ay, z0 - 0.5), ((ax + bx) / 2 + 0.3, (ay + by) / 2, min(z0, z1) - 1.9), (bx + 0.6, by, z1 - 0.5)], 0.06, CABLE, 5)
        if a % 2 == 0 and abs(az - bz) < 4.5 and az > 3.0:
            mx, my = (ax + bx) / 2, (ay + by) / 2
            L = math.hypot(bx - ax, by - ay)
            ang = math.atan2(by - ay, bx - ax)
            rot_box(stt, mx, my, min(az, bz) - 0.9, L * 0.7, 1.5, 0.2, ang, PLY)
            for sg in (-0.75, 0.75):
                stt.tube([(mx - math.cos(ang) * L * 0.35 - math.sin(ang) * sg, my - math.sin(ang) * L * 0.35 + math.cos(ang) * sg, min(az, bz) + 0.1),
                          (mx + math.cos(ang) * L * 0.35 - math.sin(ang) * sg, my + math.sin(ang) * L * 0.35 + math.cos(ang) * sg, min(az, bz) + 0.1)], 0.05, STEEL, 5)

    # 外挂阶梯：几处棚屋南面
    for (ax, ay, aw, ad, az) in placed[::5]:
        n = min(int(az / 0.34), 18)
        for k in range(n):
            stt.boxc(ax - aw / 2 + 0.6 + k * 0.32, ay - ad / 2 - 0.7, k * 0.34, 0.5, 1.0, 0.1, STEEL if k % 2 else PLYD)

    # ------------------------------------------------------------ 公用水点 + 水箱塔 + 杂物
    wx, wy = 0.0, -4.0
    yd.cyl(wx, wy, 0, 0.12, 1.2, STEEL, 8)
    yd.tube([(wx, wy, 1.2), (wx + 0.4, wy, 1.25), (wx + 0.5, wy, 1.0)], 0.05, STEEL, 6)
    yd.cyl(wx, wy, 0, 1.4, 0.15, CONC, 16)
    for k in range(7):
        a = k * math.tau / 7 + 0.3
        yd.cyl(wx + 1.9 * math.cos(a), wy + 1.9 * math.sin(a), 0, 0.32, 0.6, RUSTM if k % 2 else TARP, 12)
    tx, ty = 32.0, 30.0
    for (lx, ly) in ((-1.5, -1.5), (1.5, -1.5), (-1.5, 1.5), (1.5, 1.5)):
        pp.cyl(tx + lx, ty + ly, 0, 0.14, 8.0, STEEL, 6)
    for zz in (3.0, 6.0):
        pp.tube([(tx - 1.5, ty - 1.5, zz), (tx + 1.5, ty + 1.5, zz + 1.0)], 0.05, STEEL, 4)
        pp.tube([(tx + 1.5, ty - 1.5, zz), (tx - 1.5, ty + 1.5, zz + 1.0)], 0.05, STEEL, 4)
    pp.cyl(tx, ty, 8.0, 2.2, 3.0, RUSTM, 20)
    pp.cyl(tx, ty, 11.0, 2.3, 0.3, STEEL, 20, r2=0.4)
    for i in range(16):
        yd.boxc(rnd.uniform(-38, 38), rnd.uniform(-33, -28), 0, rnd.uniform(1.0, 1.6), rnd.uniform(0.9, 1.3), rnd.uniform(0.5, 1.2), PLY)
    for i in range(14): yd.cyl(rnd.uniform(-38, 38), rnd.uniform(-33, -27), 0, 0.46, 0.95, RUSTM if i % 3 else STEEL, 12)
    for (px, py, r) in ((-36, 26, 3.4), (38, -20, 3.0), (-38, -10, 2.6)):
        yd.cyl(px, py, 0, r * 1.6, r, SCRAP, 14, r2=r * 0.3)
    for k in range(4):                                     # 晾杆（只有横杆，无衣物）
        px = -28 + k * 18.0
        yd.cyl(px, -6.2, 0, 0.05, 2.6, STEEL, 6); yd.cyl(px + 4.0, -6.2, 0, 0.05, 2.6, STEEL, 6)
        yd.tube([(px, -6.2, 2.6), (px + 4.0, -6.2, 2.6)], 0.03, STEEL, 4)
    for k in range(4):                                     # 巷灯
        lx = -30 + k * 20.0
        yd.cyl(lx, -1.5, 0, 0.1, 4.6, STEEL, 6); yd.boxc(lx, -1.5, 4.6, 0.6, 0.4, 0.2, LAMP)

    gr = Batch('site_ground')
    gr.box(X_OFF - 6, -X_OFF + 6, Y_OFF - 6, Y_OFF + NY * CELL + 6, -0.3, 0, DIRT)
    gr.box(X_OFF - 6, -X_OFF + 6, -6.5, -1.5, 0, 0.04, GRAVEL)                             # 主巷碎石带
    gr.box(-1.5, 1.5, Y_OFF - 6, Y_OFF + NY * CELL + 6, 0, 0.03, GRAVEL)                    # 南北窄弄（i=3 处，略偏中心）
    for (px, py, rx, ry) in ((0, -4, 2.2, 1.6), (-14, -3.5, 1.6, 1.0), (16, -5, 2.0, 1.0), (2, 12, 1.4, 0.9)):
        gr.boxc(px, py, 0.05, rx * 2, ry * 2, 0.01, PUDDLE)

    bg = Batch('bg_ground'); bg.box(-900, 900, -900, 900, -1.5, -0.5, GROUND)
    bs = Batch('bg_shacks')
    for i in range(80):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(60, 320)
        px, py = math.cos(a) * d * 1.3, math.sin(a) * d
        if abs(px) < 52 and -44 < py < 46: continue
        w, dd = rnd.uniform(6, 16), rnd.uniform(6, 14)
        bs.box(px - w / 2, px + w / 2, py - dd / 2, py + dd / 2, 0, rnd.uniform(3.0, 8.0), BG_SHACK)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=40.0, sun_e=3.6, sky_s=0.5)
    C.point_light('pt_well', (0.0, -4.0, 3.0), 1.2e3, (1.0, 0.8, 0.5), 0.4)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0
    CAMS = {
        'c1': ((70.0, -78.0, 46.0), (0.0, 4.0, 5.0), 32, 0.0),
        'c2': ((0.0, -52.0, 5.0), (0.0, 6.0, 6.0), 34, 0.0),
        'under': ((-72.0, 14.0, 14.0), (0.0, 4.0, 6.0), 32, 0.0),
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
