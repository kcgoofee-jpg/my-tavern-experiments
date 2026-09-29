"""大骑士领·圣都「魔导军工研发中心」（site_kavalierki）——只做外观。
卡里没有这个地点（maps.json 标记 layer_src: repo-inferred）：研制「以太回路装甲 · 智能锁」，
放在圣都为仓库自设。本模型：三层实验主楼 + 屋顶以太聚能环 + 圆形约束场试验场 + 立式试架。
中立性：无人物、无文字 / 标志；不做武器建模，装甲只作为试验挂板（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/arms_rnd/manifest.json 的 budgets 里给三角形预算）：
  props_lab     三层实验主楼（混凝土板 + 金属带窗）+ 入口雨棚六边锁纹 + 屋顶以太聚能环
  props_yard    圆形约束场（双环刻纹 + 六边结界）+ 立式试架与装甲挂板 + 架空导束管 + 设备柜 / 灯杆
  site_ground   混凝土场坪 + 泥地周边
bg_*：棚屋剪影、远树、大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  场区 70 × 55（x ∈ [-35, 35], y ∈ [-27, 28]）：主楼 (0, 16) 26 × 16；约束场圆心 (0, -8) r=9；
  试架在场心；导束管主楼南壁 → 试架顶；设备柜贴东南；灯杆四角。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final arms_rnd）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/arms_rnd/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/arms_rnd.jpg [--blend /tmp/arms_rnd.blend] [--log /tmp/arms_rnd.log]
cam: c1 主视角（东南俯瞰）/ c2 主楼入口与约束场 / under 西侧看试架与聚能环
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/arms_rnd.jpg', blend='', log='', exposure=''))

LAB = dict(x0=-13, x1=13, y0=8, y1=24)      # 主楼
RING = (0.0, -8.0, 9.0)                      # 约束场圆心与半径


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(37)

    CONC = C.pbr('ar_conc', 'concrete_wall_008', 4.0, tint=(0.52, 0.52, 0.51), sat=0.12, value=0.9, weather=0.4)
    METALP = C.pbr('ar_metalp', 'Metal009', 3.0, tint=(0.34, 0.37, 0.4), sat=0.25, value=1.0, metal=0.6, rough_mul=0.9)
    DARKM = C.pbr('ar_darkm', 'Metal009', 2.0, tint=(0.2, 0.21, 0.22), sat=0.15, metal=0.75)
    CONC_F = C.pbr('ar_conc_f', 'concrete_floor_worn_001', 5.0, tint=(0.52, 0.5, 0.45), sat=0.2, value=1.1)
    DIRT = C.pbr('ar_dirt', 'dirt_floor', 7.0, tint=(0.38, 0.34, 0.27), sat=0.35, value=0.6)
    WOOD_D = C.pbr('ar_wood_d', 'dark_wood', 2.0, tint=(0.4, 0.33, 0.26), sat=0.3)
    STEEL = C.pbr('ar_steel', 'Metal009', 2.2, tint=(0.42, 0.44, 0.46), sat=0.15, metal=0.85)
    AETHER = C.AETHER_C if hasattr(C, 'AETHER_C') else (0.4, 0.9, 1.0)
    GLOWC = C.glow('ar_glow_c', AETHER, estr=7.0)
    GLOWW = C.glow('ar_glow_w', (0.55, 0.85, 1.0), estr=5.0)
    WINBAND = C.flat('ar_winband', (0.09, 0.12, 0.14), 0.25, emit=(0.75, 0.9, 1.0), estr=3.5)
    LAMP = C.flat('ar_lamp', (1, 1, 1), 0.4, emit=(0.85, 0.93, 1.0), estr=10.0)
    GROUND = C.flat('ar_bg_ground', (0.19, 0.21, 0.15), 0.95, noise=0.5)
    BG_SHACK = C.flat('ar_bg_shack', (0.28, 0.26, 0.24), 0.9)
    ARMOR = C.pbr('ar_armor', 'Metal009', 1.6, tint=(0.24, 0.3, 0.34), sat=0.4, metal=0.85, rough_mul=0.7)

    # ------------------------------------------------------------ 主楼
    lb = Batch('props_lab')
    x0, x1, y0, y1 = LAB['x0'], LAB['x1'], LAB['y0'], LAB['y1']
    H1, H2, H3 = 4.0, 8.0, 12.0
    lb.box(x0, x1, y0, y1, 0, H1, CONC)
    lb.box(x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3, H1, H2, METALP)   # 二层金属带（略出挑）
    lb.box(x0, x1, y0, y1, H2, H3, CONC)
    for fz, lit in ((1.2, False), (5.2, True), (9.2, False)):        # 三层带窗
        m = WINBAND if lit else DARKM
        lb.boxc(0, y0 - 0.42, fz, 22.0, 0.14, 1.5, m)
        lb.boxc(0, y1 + 0.42, fz, 22.0, 0.14, 1.5, DARKM)
    for sx in (x0 - 0.42, x1 + 0.42):
        lb.boxc(sx, (y0 + y1) / 2, 5.2, 0.14, 12.0, 1.5, WINBAND)
    lb.box(x0 - 1.2, x1 + 1.2, y0 - 1.6, y0, H3, H3 + 0.7, DARKM)    # 檐口压边
    # 入口雨棚 + 六边锁纹
    lb.box(-3.5, 3.5, y0 - 4.2, y0, 3.4, 3.8, DARKM)
    for px in (-3.0, 3.0):
        lb.cyl(px, y0 - 3.6, 0, 0.14, 3.4, STEEL, 8)
    pts = C.ring_pts(0, y0 - 4.2, lambda a: 1.4, 6, 1.0)
    C.hex_ward(lb, pts, 2.0, 1.2, GLOWW)                              # 智能锁意象（无字）
    # 屋顶以太聚能环
    CXc, CYc = 0.0, (y0 + y1) / 2
    lb.cyl(CXc, CYc, H3 + 0.7, 0.5, 4.2, STEEL, 10)                   # 竖杆
    for i, rr in enumerate((2.6, 1.7)):
        zr = H3 + 3.0 + i * 1.2
        prof = []
        lb.lathe(CXc, CYc, zr, [(rr, 0.0), (rr + 0.18, 0.0), (rr + 0.18, 0.22), (rr, 0.22)], METALP, n=28)
        lb.lathe(CXc, CYc, zr + 0.26, [(rr, 0.0), (rr + 0.18, 0.0), (rr + 0.18, 0.16), (rr, 0.16)], GLOWC, n=28)
    lb.cyl(CXc, CYc, H3 + 5.4, 0.12, 1.0, GLOWC, 8)                   # 顶针光

    # ------------------------------------------------------------ 试验场
    yd = Batch('props_yard')
    rx, ry, rr = RING
    # 地面双环刻纹 + 六边结界光环
    for rad, w in ((rr, 0.35), (rr - 1.6, 0.25)):
        pp = C.ring_pts(rx, ry, lambda a, r=rad: r, 72, 1.0)
        C.rune_ring(yd, pp, 0.06, w, GLOWC, dash=4)
    hexpts = C.ring_pts(rx, ry, lambda a: rr - 3.0, 6, 1.0)
    C.hex_ward(yd, hexpts, 0.15, 0.5, GLOWW)
    # 立式试架（框架 + 装甲挂板，非武器）
    fx, fy, fh = rx, ry, 6.4
    for dx in (-2.0, 2.0):
        yd.strip([(fx + dx, fy, 0), (fx + dx, fy, fh)], 0.32, 0.32, STEEL)
        yd.strip([(fx + dx - 1.1, fy, 1.1), (fx + dx, fy, fh)], 0.22, 0.22, STEEL)    # 斜撑
        yd.boxc(fx + dx, fy, fh, 1.4, 0.55, 0.28, DARKM)                              # 顶横梁端
    yd.boxc(fx, fy, 1.1, 4.6, 0.7, 0.35, STEEL)                                       # 底梁
    plates = [(-1.1, 2.4, 1.9, 1.4), (1.1, 3.5, 1.6, 2.0), (-0.6, 5.0, 2.0, 1.1), (1.2, 5.3, 1.2, 0.9)]
    for (px, pz, pw, ph) in plates:
        yd.boxc(fx + px, fy, pz, pw, 0.18, ph, ARMOR)
        yd.boxc(fx + px, fy - 0.14, pz + ph / 2 - 0.1, pw * 0.7, 0.05, 0.06, GLOWC)   # 回路光丝
    # 架空导束管（主楼南壁 → 试架顶）
    C.conduit(yd, (x0 + 4, y0 - 0.4), (fx - 0.8, fy), H1 - 0.5, fh + 0.5, 0.14, STEEL, GLOWC, n=14, sag=1.2)
    # 设备柜两只 + 条箱垛 + 灯杆
    yd.boxc(24, 14, 0, 6.2, 2.5, 2.6, METALP)
    yd.boxc(24, 14, 2.6, 6.2, 2.5, 2.6, DARKM)
    yd.boxc(24, 20, 0, 6.2, 2.5, 2.6, METALP)
    for i in range(3):
        yd.boxc(20 + rnd.uniform(-0.5, 0.5), -20 + i * 1.5, 0, 1.2, 1.2, 0.9, WOOD_D)
    for lx, ly in ((-26, -22), (26, -22), (-26, 2), (26, -2)):
        yd.cyl(lx, ly, 0, 0.12, 6.5, STEEL, 8)
        yd.boxc(lx, ly, 6.3, 0.6, 0.35, 0.2, LAMP)

    # ------------------------------------------------------------ 场地
    gr = Batch('site_ground')
    gr.box(-40, 40, -30, 32, -0.3, 0, DIRT)
    gr.box(-28, 28, -26, 26, 0, 0.06, CONC_F)                        # 场坪
    gr.lathe(rx, ry, 0.06, [(rr + 0.6, 0.0), (rr + 0.6, 0.05), (rr, 0.05), (rr, 0.0)], CONC_F, n=48)  # 约束场圆台

    # ------------------------------------------------------------ bg
    bg = Batch('bg_ground')
    bg.box(-700, 700, -700, 700, -1.6, -0.5, GROUND)
    sil = Batch('bg_shacks')
    for _ in range(26):
        sx = rnd.uniform(-280, 280)
        sy = rnd.uniform(80, 240) if rnd.random() < 0.5 else rnd.uniform(-240, -100)
        if abs(sx) < 90 and abs(sy) < 70:
            continue
        sil.boxc(sx, sy, -0.5, rnd.uniform(6, 14), rnd.uniform(5, 10), rnd.uniform(2.4, 4.0), BG_SHACK)
    forest = Batch('bg_trees')
    for i in range(5):
        C.tree(forest, -70 + i * 35 + rnd.uniform(-5, 5), 44 + rnd.uniform(-4, 6),
               rnd.uniform(9, 13), rnd.uniform(3.2, 4.6), 'oak', seed=700 + i)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=44.0)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.1
    CAMS = {
        'c1': ((-58.0, -72.0, 48.0), (0.0, -2.0, 5.0), 32, 0.0),
        'c2': ((-4.0, -46.0, 4.5), (0.0, 6.0, 6.0), 34, 0.0),
        'under': ((-52.0, 18.0, 16.0), (6.0, -6.0, 5.0), 35, 0.0),
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
