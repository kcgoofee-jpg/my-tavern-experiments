"""原域城区（yuanyu_city）——只做外观。
卡原文（docs/landmarks/yuanyu_city.md，卡 E44 L5912–L5914）：原域风貌是西式古典神圣美学与神秘色彩；高耸入云的哥特式尖塔、繁复华丽的巴洛克穹顶与黑白石材雕琢的巨型神像回廊交错分布；街道常年笼罩淡淡的以太薄雾与圣香烟气；煤气灯风格的魔导路灯照亮铺满青石的幽深街巷。
本模型：一片城区切片——东门与城墙、圆形朝圣广场（一圈黑白交替的无面容长袍立像）、北半的尖塔区与南半的穹顶区，青石街巷与暖色路灯。
中立性：无人物、无文字 / 标志、无宗教符号、无武器类细节（docs/rejected.md）；立像无面容、无持物。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/yuanyu_city/manifest.json 的 budgets 里给三角形预算）：
  site_ground   青石街巷 + 朝圣广场地面
  props_gate    东侧城墙 + 东门（双塔门楼）
  props_plaza   朝圣广场：立像环 + 中心石盘
  props_spires  尖塔区：哥特式高屋 + 尖塔
  props_domes   穹顶区：巴洛克鼓座穹顶屋
  props_lamps   魔导路灯
bg_*：远景大地与悬浮圣山的倒锥轮廓（不导出）。

布局（米，地面 z=0；北 = +y）：
  朝圣广场圆心 (0,0) 半径 70；东门 x=250；街区网格 x 间距 52、y 间距 44；y>0 尖塔区，y<0 穹顶区。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final yuanyu_city）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/yuanyu_city/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/yuanyu_city.jpg [--blend /tmp/yuanyu_city.blend] [--log /tmp/yuanyu_city.log]
cam: c1 东侧高空俯瞰 / c2 城外看东门 / c3 广场上看尖塔区
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/yuanyu_city.jpg', blend='', log='', exposure='0.0'))

# 相机：(位置, 目标, 焦距)。c1 俯瞰 / c2 城外看东门 / c3 广场上看尖塔区；landmark.py final 按这里的 cN 行找定稿镜头
CAMS = {
    'c1': ((520, -330, 230), (20, 10, 10), 30),
    'c2': ((345, -60, 26), (250, 0, 16), 26),
    'c3': ((-10, -78, 12), (20, 140, 30), 30),
}


def robed(B, x, y, z, m, a, s=1.0):
    """无面容、无持物的长袍立像：外扩的袍摆 + 收腰 + 宽肩 + 兜帽（兜帽里不做五官）。"""
    B.lathe(x, y, z, [(2.4 * s, 0), (2.1 * s, 1.2 * s), (1.5 * s, 4.5 * s), (1.15 * s, 8.0 * s), (1.6 * s, 10.6 * s), (1.0 * s, 11.6 * s)], m, n=14)
    B.sphere(x, y, z + 12.2 * s, 1.15 * s, m, sz=1.25, seg=10, rings=7)                     # 兜帽
    B.tube([(x + 1.5 * s * math.cos(a + 1.57), y + 1.5 * s * math.sin(a + 1.57), z + 10.2 * s), (x + 0.9 * s * math.cos(a), y + 0.9 * s * math.sin(a), z + 6.6 * s)], 0.28 * s, m, n=5)
    B.tube([(x + 1.5 * s * math.cos(a - 1.57), y + 1.5 * s * math.sin(a - 1.57), z + 10.2 * s), (x + 0.9 * s * math.cos(a), y + 0.9 * s * math.sin(a), z + 6.6 * s)], 0.28 * s, m, n=5)


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(2046)

    MARB = C.pbr('yc_marble', 'white_sandstone_blocks_02', 3.0, tint=(0.9, 0.88, 0.84), sat=0.15, value=1.0, weather=0.6)
    MARB2 = C.pbr('yc_marble2', 'white_sandstone_blocks_02', 3.0, tint=(0.72, 0.7, 0.68), sat=0.2, value=0.95, weather=0.7)
    BAS = C.pbr('yc_basalt', 'concrete_wall_008', 3.0, tint=(0.16, 0.16, 0.18), sat=0.1, value=0.8, weather=0.8)
    STREET = C.pbr('yc_street', 'precast_stone_paving', 3.0, tint=(0.36, 0.42, 0.5), sat=0.5, value=0.85, weather=0.5)
    PLAZA = C.pbr('yc_plaza', 'precast_stone_paving', 3.0, tint=(0.62, 0.64, 0.68), sat=0.3, value=1.0, weather=0.4)
    SLATE = C.pbr('yc_slate', 'roof_slates_02', 2.6, tint=(0.2, 0.22, 0.3), sat=0.4, value=0.9)
    SLATE2 = C.pbr('yc_slate2', 'roof_slates_02', 2.6, tint=(0.3, 0.28, 0.34), sat=0.4, value=0.9)
    COPPER = C.flat('yc_copper', (0.22, 0.52, 0.44), 0.45, metal=0.7)
    GOLD = C.flat('yc_gold', (0.85, 0.66, 0.24), 0.3, metal=0.9)
    WIN = C.flat('yc_win', (0.04, 0.04, 0.05), 0.4)
    WINL = C.flat('yc_winlit', (1, 1, 1), 0.4, emit=(1.0, 0.72, 0.36), estr=5.0)
    LAMP = C.flat('yc_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.72, 0.38), estr=22.0)
    IRON = C.flat('yc_iron', (0.05, 0.05, 0.06), 0.5, metal=0.6)
    BGG = C.flat('yc_bgground', (0.07, 0.075, 0.1), 0.95, noise=0.5)
    ROCK = C.flat('yc_rock', (0.3, 0.3, 0.34), 0.9, noise=0.6)

    # ------------------------------------------------------------ 地面：青石街巷 + 广场
    gr = Batch('site_ground')
    gr.box(-290, 300, -230, 230, -0.6, 0.0, STREET)
    gr.cyl(0, 0, 0.0, 72.0, 0.25, PLAZA, 64)
    for r in (20.0, 36.0, 54.0):                                                            # 广场同心铺石环（无符号，只有圈线）
        gr.lathe(0, 0, 0.25, [(r, 0), (r, 0.12), (r + 1.2, 0.12), (r + 1.2, 0)], MARB2, n=64)
    gr.strip([(72, 0, 0.12), (250, 0, 0.12)], 14.0, 0.1, PLAZA)                              # 东门大道

    # ------------------------------------------------------------ 东墙 + 东门
    gt = Batch('props_gate')
    gt.box(246, 254, -215, -14, 0, 14, MARB2); gt.box(246, 254, 14, 215, 0, 14, MARB2)
    for yy in [y for y in range(-214, 215, 7) if abs(y) > 16]:
        gt.box(246, 254, yy, yy + 3.5, 14, 16.2, MARB2)                                     # 垛口
    for sy in (-1, 1):
        ty = sy * 18.0
        gt.box(240, 258, ty - 8, ty + 8, 0, 34, MARB)
        gt.lathe(249, ty, 34.0, [(7.6, 0), (5.2, 6.0), (2.0, 24.0), (0.15, 40.0)], SLATE, n=12)
        for (cx_, cy_) in ((-7.4, -7.4), (7.4, -7.4), (-7.4, 7.4), (7.4, 7.4)):
            gt.lathe(249 + cx_ * 0.8, ty + cy_ * 0.8, 34.0, [(1.3, 0), (0.9, 4.0), (0.08, 12.0)], SLATE, n=8)
        for k in range(3): gt.boxc(239.9, ty, 8 + k * 7, 0.2, 1.2, 3.0, WIN)
    gt.box(240, 258, -10, 10, 16, 34, MARB)                                                 # 门楼横梁
    for xf in (258.15, 239.85):                                                              # 尖拱门洞（暗）
        gt.poly([(xf, -6, 0), (xf, 6, 0), (xf, 6, 11), (xf, 0, 19), (xf, -6, 11)], [(0, 1, 2, 3, 4), (4, 3, 2, 1, 0)], WIN)
    for sy in (-1, 1):
        for yy in (sy * 7.2, sy * 28.8):
            gt.box(236, 240, yy - 1.0, yy + 1.0, 0, 22, MARB2); gt.box(258, 262, yy - 1.0, yy + 1.0, 0, 22, MARB2)
    gt.lathe(249, 0, 34.0, [(6.0, 0), (3.6, 7.0), (0.15, 18.0)], SLATE, n=10)

    # ------------------------------------------------------------ 朝圣广场：黑白交替的立像环 + 中心石盘
    pz = Batch('props_plaza')
    for k in range(24):
        a = k * math.tau / 24
        sx, sy = 62.0 * math.cos(a), 62.0 * math.sin(a)
        m = BAS if k % 2 else MARB
        pz.cyl(sx, sy, 0.25, 2.6, 2.4, MARB2, 12)
        robed(pz, sx, sy, 2.6, m, a)
    for sy_ in (-26.0, 26.0):                                                               # 东门大道两侧的神像回廊：列柱 + 顶梁 + 黑白巨像
        for k, xx in enumerate(range(92, 236, 16)):
            pz.cyl(xx, sy_, 0.1, 1.5, 15.0, MARB2, 10); pz.cyl(xx, sy_, 15.1, 2.0, 0.8, MARB, 10)
            robed(pz, xx, sy_, 15.9, BAS if (k + (sy_ > 0)) % 2 else MARB, math.pi / 2 if sy_ < 0 else -math.pi / 2, 0.85)
        pz.box(90, 236, sy_ - 1.0, sy_ + 1.0, 14.6, 15.6, MARB2)
    pz.cyl(0, 0, 0.25, 12.0, 1.0, MARB, 40); pz.cyl(0, 0, 1.25, 9.0, 0.6, MARB2, 40)
    pz.cyl(0, 0, 1.85, 1.6, 6.0, MARB, 12); pz.sphere(0, 0, 8.4, 1.4, GOLD, seg=12, rings=8)

    # ------------------------------------------------------------ 街区：y>0 尖塔区，y<0 穹顶区
    sp = Batch('props_spires'); dm = Batch('props_domes'); lp = Batch('props_lamps')
    for i in range(-4, 5):
        for j in range(-4, 5):
            x, y = i * 52.0, j * 44.0
            if math.hypot(x, y) < 96 or x > 222 or abs(y) > 180: continue
            if abs(y) < 30 and x > 60: continue                                          # 东门大道
            if rnd.random() < 0.1: continue
            x += rnd.uniform(-3, 3); y += rnd.uniform(-2, 2)
            w, d = rnd.uniform(24, 40), rnd.uniform(20, 32)
            h = rnd.choice((12, 16, 20, 24, 30, 38)) + rnd.uniform(-2, 3)
            gothic = y > 0 or (y == 0 and i % 2)
            B = sp if gothic else dm
            wall = MARB if rnd.random() < 0.6 else MARB2
            B.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, 0, h, wall)
            for k in range(4):                                                              # 窗（暗 / 亮相间）
                B.boxc(x - w / 2 + 4 + k * (w - 8) / 3, y - d / 2 - 0.05, 4.0, 1.4, 0.12, 3.2, WINL if (i + j + k) % 3 == 0 else WIN)
                B.boxc(x - w / 2 + 4 + k * (w - 8) / 3, y - d / 2 - 0.05, h - 7.0, 1.4, 0.12, 3.2, WIN)
            if gothic:
                B.gable(x - w / 2, x + w / 2, y - d / 2, y + d / 2, h, rnd.uniform(9, 14), SLATE if (i + j) % 2 else SLATE2, along='x', over=0.6)
                sh = rnd.uniform(34, 70)                                                   # 中央高尖塔
                B.cyl(x, y, h, 3.4, sh * 0.35, wall, 8)
                B.lathe(x, y, h + sh * 0.35, [(3.8, 0), (2.4, sh * 0.25), (1.0, sh * 0.5), (0.08, sh * 0.65)], SLATE, n=8)
                for (ax, ay) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                    B.lathe(x + ax * (w / 2 - 1.6), y + ay * (d / 2 - 1.6), h, [(1.4, 0), (0.9, 5.0), (0.07, 13.0)], SLATE2, n=6)
            else:
                dr = rnd.uniform(9.5, 12.5)
                B.cyl(x, y, h, dr, 6.0, wall, 20)
                B.sphere(x, y, h + 6.0, dr * 1.05, COPPER if (i + j) % 2 else MARB, sz=0.95, seg=20, rings=10, zmin=0.0)
                B.cyl(x, y, h + 6.0 + dr * 0.95, 1.4, 2.6, MARB, 8); B.sphere(x, y, h + 9.4 + dr * 0.95, 1.0, GOLD, seg=8, rings=6)
                for (ax, ay) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                    B.cyl(x + ax * (w / 2 - 2.0), y + ay * (d / 2 - 2.0), h, 1.2, 4.0, wall, 8); B.sphere(x + ax * (w / 2 - 2.0), y + ay * (d / 2 - 2.0), h + 4.6, 1.3, COPPER, sz=0.9, seg=8, rings=5, zmin=0.0)
            lx, ly = x + w / 2 + 5.0, y - d / 2 - 4.0                                     # 街口路灯
            lp.cyl(lx, ly, 0, 0.14, 5.4, IRON, 6); lp.sphere(lx, ly, 5.8, 0.7, LAMP, seg=6, rings=4)
    for k in range(24):                                                                     # 广场外圈路灯
        a = (k + 0.5) * math.tau / 24
        lx, ly = 79.0 * math.cos(a), 79.0 * math.sin(a)
        lp.cyl(lx, ly, 0, 0.16, 6.0, IRON, 6); lp.sphere(lx, ly, 6.4, 0.75, LAMP, seg=6, rings=4)
    for xx in range(86, 246, 14):                                                           # 东门大道两侧
        for sy in (-9.0, 9.0):
            lp.cyl(xx, sy, 0, 0.14, 5.4, IRON, 6); lp.sphere(xx, sy, 5.8, 0.7, LAMP, seg=6, rings=4)

    bg = Batch('bg_ground'); bg.box(-3000, 3000, -3000, 3000, -2.0, -0.7, BGG)
    bm = Batch('bg_mountain')                                                               # 悬浮圣山的倒锥轮廓（远景，不导出）
    bm.lathe(0, 0, 330.0, [(0.1, 0), (60, 90), (150, 210), (210, 320), (215, 340)], ROCK, n=24)
    bm.cyl(0, 0, 670.0, 215, 14, MARB2, 24)
    for k in range(14):
        a = k * math.tau / 14 + 0.2
        bm.lathe(math.cos(a) * 1300, math.sin(a) * 1300, -2.0, [(rnd.uniform(260, 420), 0), (rnd.uniform(120, 200), rnd.uniform(90, 160)), (0.1, rnd.uniform(200, 320))], ROCK, n=10)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=235.0, sun_el=19.0, sun_e=3.2, sky_s=0.28)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0
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
