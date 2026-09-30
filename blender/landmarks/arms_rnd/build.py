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
  场区 70 × 55（x ∈ [-35, 35], y ∈ [-27, 28]）：主楼 (0, 16) 26 × 16；约束场圆心 (-11, -8) r=8（偏西，让出入口轴线，
  入口前铺一条 4 m 宽的步道）；试架在场心；导束管主楼南壁 → 试架左立柱顶（沿途立支墩）；两只设备柜贴东侧；灯杆四角。
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
RING = (-11.0, -8.0, 8.0)                      # 约束场圆心与半径


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
    WINBAND = C.flat('ar_winband', (0.09, 0.12, 0.14), 0.25, emit=(0.75, 0.9, 1.0), estr=2.2)   # 亮着灯的窗格
    GLASS = C.flat('ar_glass', (0.05, 0.08, 0.1), 0.15, metal=0.3, emit=(0.5, 0.7, 0.85), estr=0.4)  # 暗窗格
    PATH = C.flat('ar_path', (0.26, 0.25, 0.23), 0.85, noise=0.3)
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
    # 楼层线（挑出的腰线）+ 壁柱：三层的节奏
    for zb in (H1 - 0.2, H2):
        lb.box(x0 - 0.5, x1 + 0.5, y0 - 0.5, y1 + 0.5, zb, zb + 0.2, DARKM)
    pil = [-12.0 + 3.0 * i for i in range(9)]
    for px in pil:
        lb.boxc(px, y0 - 0.06, 0, 0.4, 0.12, H3, CONC)
        lb.boxc(px, y1 + 0.06, 0, 0.4, 0.12, H3, CONC)
    # 带窗：每层 8 格窗（暗玻璃 + 少数亮灯），二层面在金属带外皮上（出挑 0.3）
    xs = [-10.5 + 3.0 * i for i in range(8)]
    for fl, (fz, off) in enumerate(((1.0, 0.0), (5.0, 0.3), (9.0, 0.0))):
        for i, wx in enumerate(xs):
            lit = (i * 3 + fl * 2) % 5 == 0
            m = WINBAND if lit else GLASS
            if not (fl == 0 and abs(wx) < 2.0):                     # 一层正中让给入口
                if not (fl == 1 and abs(wx) < 2.0):                 # 二层正中让给六边锁
                    lb.boxc(wx, y0 - off - 0.08, fz, 1.9, 0.14, 1.8, m)
            if fl == 0 and i % 2:                                   # 北墙一层：通风百叶代替窗
                lb.boxc(wx, y1 + 0.06, 1.1, 1.6, 0.1, 1.0, DARKM)
            else:
                lb.boxc(wx, y1 + off + 0.08, fz, 1.9, 0.14, 1.8, m)
        for sx in (x0 - off - 0.08, x1 + off + 0.08):
            for j in range(4):
                lit = (j + fl) % 3 == 0
                lb.boxc(sx, y0 + 2.5 + 3.5 * j, fz, 0.14, 2.2, 1.8, WINBAND if lit else GLASS)
    lb.box(x0 - 1.2, x1 + 1.2, y0 - 1.6, y0, H3, H3 + 0.7, DARKM)    # 檐口压边
    for cx in (x0 + 0.4, x1 - 0.4):                                   # 落水管
        lb.cyl(cx, y0 - 0.42, 0, 0.09, H3, STEEL, 8)
    # 入口：双扇门 + 两级台阶 + 雨棚 + 步道
    for sx in (-0.8, 0.8):
        lb.boxc(sx, y0 - 0.08, 0, 1.5, 0.12, 2.6, DARKM)
        lb.boxc(sx, y0 - 0.15, 0.5, 1.0, 0.05, 1.8, GLASS)
    lb.box(-1.9, 1.9, y0 - 0.2, y0, 2.6, 2.8, STEEL)                  # 门楣
    lb.box(-3.0, 3.0, y0 - 1.0, y0, 0, 0.2, CONC)
    lb.box(-3.0, 3.0, y0 - 1.8, y0 - 1.0, 0, 0.1, CONC)
    lb.box(-3.5, 3.5, y0 - 4.2, y0, 3.4, 3.8, DARKM)
    for px in (-3.0, 3.0):
        lb.cyl(px, y0 - 3.6, 0, 0.14, 3.4, STEEL, 8)
    # 智能锁意象：二层正中的六边锁环 + 锁孔条 + U 形锁梁（无字）
    lz, ly, lr = 5.9, y0 - 0.4, 0.95
    hx = [(lr * math.cos(math.radians(60 * k)), lr * math.sin(math.radians(60 * k))) for k in range(7)]
    lb.strip([(hx_, ly, lz + hz) for hx_, hz in hx], 0.14, 0.16, GLOWW)
    hx2 = [(0.55 * a_, 0.55 * b_) for a_, b_ in hx]
    lb.strip([(hx_, ly, lz + hz) for hx_, hz in hx2], 0.1, 0.1, GLOWW)
    lb.boxc(0, ly, lz - 0.35, 0.14, 0.1, 0.5, GLOWW)                 # 锁孔条
    # 屋顶设备：两台空调机组 + 楼梯间
    for hxx, hyy in ((-7.0, 12.0), (8.0, 20.0)):
        lb.boxc(hxx, hyy, H3, 3.0, 2.0, 1.4, METALP)
        lb.cyl(hxx, hyy, H3 + 1.4, 0.7, 0.12, DARKM, 12)
    lb.boxc(8.0, 11.5, H3, 3.0, 3.0, 2.6, CONC)
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
    # 架空导束管（主楼南壁 → 试架左立柱顶）：粗管 + 卡箍 + 沿途立支墩
    n_t = 12
    p0, p1 = (-11.0, y0 - 0.55, 3.5), (fx - 2.0, fy, fh)
    pts = [(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t - 1.2 * 4 * t * (1 - t))
           for t in (i / n_t for i in range(n_t + 1))]
    yd.tube(pts, 0.28, DARKM, n=10)
    for i in range(2, n_t - 1, 3):
        px, py, pz = pts[i]
        yd.boxc(px, py, pz - 0.36, 0.76, 0.64, 0.72, STEEL)                    # 卡箍
        yd.boxc(px, py, pz - 0.36, 0.5, 0.68, 0.1, GLOWC)                      # 微光缝
        yd.cyl(px, py, 0, 0.14, pz - 0.7, STEEL, 8)                            # 支墩
        yd.boxc(px, py, 0, 0.9, 0.9, 0.12, CONC)
    yd.boxc(p0[0], p0[1] + 0.25, p0[2] - 0.5, 0.9, 0.3, 1.0, STEEL)            # 墙侧法兰
    # 设备柜两只（集装箱式，波纹肋 + 端门）+ 条箱垛
    for cy in (8.0, 16.0):
        yd.boxc(25.0, cy, 0, 2.5, 6.2, 2.6, METALP)
        for i in range(10):
            yd.boxc(25.0 - 1.28, cy - 2.7 + i * 0.6, 0.15, 0.05, 0.14, 2.3, DARKM)
        for dx in (-0.6, 0.6):
            yd.boxc(25.0 + dx, cy - 3.13, 0.2, 1.1, 0.05, 2.2, DARKM)
        yd.boxc(25.0, cy - 3.17, 2.0, 0.3, 0.05, 0.15, GLOWW)                   # 状态灯
    for dx, dy, dz in ((0, 0, 0), (1.3, 0, 0), (0.65, 1.3, 0), (0.65, 0.5, 0.9)):
        yd.boxc(20 + dx, -20 + dy, dz, 1.2, 1.2, 0.9, WOOD_D)
    for lx, ly in ((-26, -22), (26, -22), (-26, 2), (26, -2)):
        yd.cyl(lx, ly, 0, 0.12, 6.5, STEEL, 8)
        yd.boxc(lx, ly, 6.3, 0.6, 0.35, 0.2, LAMP)

    # ------------------------------------------------------------ 场地
    gr = Batch('site_ground')
    gr.box(-40, 40, -30, 32, -0.3, 0, DIRT)
    gr.box(-28, 28, -26, 26, 0, 0.06, CONC_F)                        # 场坪
    gr.lathe(rx, ry, 0.06, [(rr + 0.6, 0.0), (rr + 0.6, 0.05), (rr, 0.05), (rr, 0.0)], CONC_F, n=48)  # 约束场圆台
    gr.box(-2.0, 2.0, -26, y0 - 1.8, 0.06, 0.1, PATH)                # 入口步道
    for jx in range(-24, 25, 8):                                     # 伸缩缝
        gr.boxc(jx, 0, 0.06, 0.08, 52, 0.012, DARKM)
    for jy in range(-24, 25, 8):
        gr.boxc(0, jy, 0.06, 56, 0.08, 0.012, DARKM)

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
        'c2': ((0.0, -48.0, 4.5), (-3.0, 6.0, 6.0), 34, 0.0),
        'under': ((-52.0, 18.0, 16.0), (-8.0, -8.0, 5.0), 35, 0.0),
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
