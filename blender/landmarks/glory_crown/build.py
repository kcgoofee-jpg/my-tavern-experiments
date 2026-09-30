"""大骑士领·圣都 核心区「荣光冠冕」（site_kavalierki）——只做外观。
卡原文（docs/landmarks/glory_crown.md，卡 L89）：核心区「荣光冠冕」＝ 商业联合会大厦、太阳骑士大竞技场、
圆桌骑士议事殿、会所；中环「竞赛与狂欢回廊」、外环「铁锈与落败领」另有标记，不在这套模型里。
中立性：无人物、无文字 / 标志（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/glory_crown/manifest.json 的 budgets 里给三角形预算）：
  props_main    圆桌骑士议事殿：环形列柱 + 鼓座 + 穹顶 + 冠环（12 尖齿）+ 顶光球
  props_arena   太阳骑士大竞技场：椭圆外墙 + 三层看台 + 沙场 + 拱门
  props_tower   商业联合会大厦：退台塔身 + 玻璃幕带 + 塔冠桁架与尖顶
  props_club    会所：门廊列柱 + 山花屋脊 + 玻璃前厅 + 露台与水池
  site_ground   台地铺装 + 环路 + 四条放射大道 + 台阶
  props_lights  广场灯柱 + 泛光灯
bg_*：既有城建（远景楼群与甲板地面，只为成图挡地平线，不导出）。

布局（米，地面 z=0，台地顶面 z=2）：
  议事殿在原点（占位 x -36..36、y -36..36、高约 58）；竞技场在东 x≈175（椭圆 rx 78 / ry 52）；
  大厦在北 y≈185（塔身 60×60，高约 112）；会所在南 y≈-165（96×54、高约 24）；环路 r≈140。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final glory_crown）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/glory_crown/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/gc.jpg [--blend /tmp/gc.blend] [--log /tmp/gc.log] [--exposure 0.0]
cam: c1 核心区俯瞰（西南高位）/ c2 议事殿与穹顶正视 / c3 竞技场侧视
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/gc.jpg', blend='', log='', exposure='-0.4'))

PL = 2.0                     # 台地（plinth）高度
HALL_R = 28.0                # 议事殿鼓座半径
COL_R = 30.6                 # 列柱环半径
N_COL = 18                   # 列柱数
AR_CX, AR_CY, AR_RX, AR_RY = 175.0, 0.0, 78.0, 52.0     # 竞技场
TWR_CX, TWR_CY = 0.0, 185.0                            # 大厦
CLB_CX, CLB_CY = 0.0, -165.0                           # 会所
RING_R = 140.0               # 环路半径
DECK_Z = 380.0               # 上方甲板底面（背景）


def main():
    import bpy
    from mathutils import Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    rnd = random.Random(97)

    # ------------------------------------------------------------ 材质
    ASHLAR = C.pbr('gc_ashlar', 'white_sandstone_blocks_02', 3.0, tint=(0.94, 0.92, 0.86), sat=0.18, weather=0.25)
    MARBLE = C.pbr('gc_marble', 'Marble021', 2.2, tint=(0.96, 0.95, 0.91), sat=0.1)
    PAVE = C.pbr('gc_pave', 'patterned_paving', 4.5, tint=(0.8, 0.78, 0.72), sat=0.22)
    ROAD = C.pbr('gc_road', 'asphalt_02', 6.0, tint=(0.32, 0.32, 0.34), sat=0.2, value=0.75)
    ROOF = C.pbr('gc_roof', 'roof_slates_02', 2.6, tint=(0.24, 0.26, 0.3), sat=0.3)
    GOLD = C.flat('gc_gold', (0.78, 0.62, 0.22), 0.28, metal=0.85, coat=0.5)
    BRONZE = C.pbr('gc_bronze', 'Metal009', 2.0, tint=(0.56, 0.43, 0.2), sat=0.35, metal=0.7)
    GLASS = C.glass('gc_glass', (0.09, 0.11, 0.13))
    GLASS_L = C.glass('gc_glass_l', (0.16, 0.15, 0.11), emit=(1.0, 0.9, 0.72), estr=2.2)
    SAND = C.pbr('gc_sand', 'dirt_floor', 6.0, tint=(0.86, 0.74, 0.5), sat=0.5)
    GRASS = C.pbr('gc_grass', 'grass_ground', 4.0, tint=(0.5, 0.6, 0.35), sat=0.4)
    WOOD = C.pbr('gc_wood', 'dark_wood', 2.0, tint=(0.5, 0.42, 0.34), sat=0.3)
    LEAF = C.flat('gc_leaf', (0.14, 0.3, 0.13), 0.8, noise=0.5)
    LAMP = C.flat('gc_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.88, 0.68), estr=14.0)
    GLOW = C.flat('gc_glow', (1, 1, 1), 0.35, emit=(1.0, 0.86, 0.6), estr=22.0)
    WG = C.window_grid('gc_wg', lit=(1.0, 0.86, 0.62), estr=3.0, cell=(3.0, 3.4), seed=2.2)
    WG2 = C.window_grid('gc_wg2', lit=(0.72, 0.86, 1.0), estr=3.0, cell=(3.2, 3.0), seed=7.1)

    points = []

    # ------------------------------------------------------------ 圆桌骑士议事殿（核心，冠冕）
    hall = Batch('props_main')
    hall.cyl(0, 0, PL, 36.0, 0.7, MARBLE, 48, r2=35.2)                    # 台阶基座
    hall.cyl(0, 0, PL + 0.7, 34.0, 1.6, MARBLE, 48, r2=34.0)              # 台基
    z0 = PL + 2.3
    hall.cyl(0, 0, z0, HALL_R, 13.0, ASHLAR, 48, r2=HALL_R)               # 下层鼓座
    hall.lathe(0, 0, z0 + 13.0, [(HALL_R + 1.4, 0), (HALL_R + 1.4, 1.0), (HALL_R + 0.2, 1.0)], MARBLE, 48)   # 檐口线脚
    for i in range(N_COL):                                                # 环形列柱 + 柱头
        a = i * math.tau / N_COL
        cx, cy = math.cos(a) * COL_R, math.sin(a) * COL_R
        hall.cyl(cx, cy, z0, 1.35, 12.2, MARBLE, 12)
        hall.cyl(cx, cy, z0 + 12.2, 1.6, 0.5, MARBLE, 12)
        hall.cyl(cx, cy, z0 + 12.7, 1.5, 0.5, GOLD, 12)
        if i % 3 == 0:                                                    # 柱间灯
            points.append(((cx * 0.92, cy * 0.92, z0 + 9.0), 3.5e3, (1.0, 0.86, 0.62)))
    hall.cyl(0, 0, z0 + 13.2, COL_R + 2.6, 2.6, ASHLAR, 48, r2=COL_R + 2.6)   # 檐部（额枋）
    hall.cyl(0, 0, z0 + 15.8, COL_R + 2.6, 0.7, GOLD, 48, r2=COL_R + 1.8)
    z1 = z0 + 16.5
    hall.cyl(0, 0, z1, 24.0, 8.0, ASHLAR, 40, r2=23.4)                    # 上层鼓座
    for i in range(16):                                                   # 鼓座高窗（发光带）
        a = i * math.tau / 16
        cx, cy = math.cos(a) * 24.1, math.sin(a) * 24.1
        hall.cyl(cx, cy, z1 + 2.0, 1.1, 4.0, GLASS_L, 8)
    hall.cyl(0, 0, z1 + 8.0, 25.2, 0.8, MARBLE, 40, r2=25.2)              # 穹顶座
    hall.sphere(0, 0, z1 + 8.8, 24.6, MARBLE, sz=1.0, seg=32, rings=16, zmin=0.0)     # 穹顶
    hall.cyl(0, 0, z1 + 8.8, 24.8, 0.9, GOLD, 40, r2=24.2)                # 穹顶金箍
    z2 = z1 + 8.8 + 24.6                                                  # ≈ 51.9：穹顶顶
    # 冠环：一圈带座 + 12 尖齿 + 顶光球（「荣光冠冕」的剪影）
    hall.lathe(0, 0, z2 - 1.2, [(20.0, 0), (23.0, 0.6), (23.0, 3.0), (20.0, 3.4)], GOLD, 40)
    for i in range(12):
        a = i * math.tau / 12
        cx, cy = math.cos(a) * 21.5, math.sin(a) * 21.5
        hall.pyramid(cx, cy, z2 + 2.2, 3.2, 3.2, 8.5, GOLD)
        hall.cyl(cx, cy, z2 + 1.0, 0.9, 1.6, BRONZE, 8)
    hall.cyl(0, 0, z2 + 1.0, 3.4, 4.0, BRONZE, 16, r2=2.2)                # 中央灯柱
    hall.cyl(0, 0, z2 + 5.0, 2.6, 9.0, GOLD, 12, r2=0.2)                  # 尖顶
    hall.sphere(0, 0, z2 + 13.6, 2.6, GLOW, seg=20, rings=12)             # 顶光球
    points.append(((0, 0, z2 + 13.6), 2.6e4, (1.0, 0.86, 0.6)))

    # ------------------------------------------------------------ 太阳骑士大竞技场（东）
    arena = Batch('props_arena')
    arena.cyl(AR_CX, AR_CY, PL, AR_RY + 6, 2.4, ASHLAR, 48, r2=AR_RY + 5.2, rx=AR_RX + 6)   # 基座
    arena.cyl(AR_CX, AR_CY, PL + 2.4, AR_RY + 4, 13.0, ASHLAR, 48, r2=AR_RY + 1.2, rx=AR_RX + 4)   # 外墙（内收）
    arena.cyl(AR_CX, AR_CY, PL + 15.4, AR_RY - 1.0, 1.2, MARBLE, 48, r2=AR_RY - 1.0, rx=AR_RX - 1.0)   # 檐口
    for i in range(24):                                                   # 外墙壁柱（3.4 m 宽，14 m 高）+ 压顶
        a = i * math.tau / 24
        px, py = AR_CX + math.cos(a) * (AR_RX + 5.4), AR_CY + math.sin(a) * (AR_RY + 5.4)
        arena.boxc(px, py, PL + 2.4, 3.4, 3.4, 14.0, ASHLAR)
        arena.boxc(px, py, PL + 16.4, 4.0, 4.0, 1.6, MARBLE)
    arena.lathe(AR_CX, AR_CY, PL + 16.6, [(AR_RY + 2.0, 0), (AR_RY + 3.2, 0.6), (AR_RY + 3.2, 2.6), (AR_RY - 2.0, 2.6)], MARBLE, 48)
    for t, (rr, zh) in enumerate(((AR_RY - 6.0, 3.2), (AR_RY - 13.0, 6.4), (AR_RY - 20.0, 9.6))):      # 三层看台（石 / 大理石交替）
        arena.cyl(AR_CX, AR_CY, PL + 2.4 + zh, rr, 3.0, ASHLAR if t % 2 == 0 else MARBLE, 44, r2=rr, rx=AR_RX - 6.0 - t * 7.0)
        arena.cyl(AR_CX, AR_CY, PL + 2.4 + zh + 3.0, rr + 0.6, 0.35, GOLD, 44, r2=rr + 0.6, rx=AR_RX - 6.0 - t * 7.0)
    arena.cyl(AR_CX, AR_CY, PL + 2.4, 30.0, 0.35, BRONZE, 44, r2=30.0, rx=AR_RX - 24.0)    # 场边石环
    arena.cyl(AR_CX, AR_CY, PL + 2.4, 27.0, 0.5, SAND, 44, r2=27.0, rx=AR_RX - 27.0)       # 沙场
    arena.lathe(AR_CX, AR_CY, PL + 2.4 + 12.0, [(28.0, 0), (30.5, 1.2), (30.5, 2.6)], BRONZE, 44)     # 场边护栏
    for a_deg in (0, 90, 180, 270):                                        # 四向拱门（半环拱）
        a = math.radians(a_deg)
        px, py = AR_CX + math.cos(a) * (AR_RX + 2.0), AR_CY + math.sin(a) * (AR_RY + 6.0)
        arena.lathe(px, py, PL + 2.4, [(7.0, -1.0), (7.0, 1.4)], GOLD, 16, a0=a - math.pi / 2, a1=a + math.pi / 2)
        arena.cyl(px + math.cos(a) * 6.6, py + math.sin(a) * 6.6, PL + 2.4, 1.6, 11.0, ASHLAR, 10)
        arena.cyl(px - math.cos(a) * 6.6, py - math.sin(a) * 6.6, PL + 2.4, 1.6, 11.0, ASHLAR, 10)
    for a_deg in (45, 135, 225, 315):                                      # 四座灯塔（场角）
        a = math.radians(a_deg)
        px, py = AR_CX + math.cos(a) * (AR_RX - 2.0), AR_CY + math.sin(a) * (AR_RY + 8.0)
        arena.cyl(px, py, PL + 2.4, 2.2, 16.0, ASHLAR, 12, r2=1.4)
        arena.cyl(px, py, PL + 18.4, 2.6, 2.0, LAMP, 12, r2=2.6)
        points.append(((px, py, PL + 19.4), 9e3, (1.0, 0.9, 0.72)))

    # ------------------------------------------------------------ 商业联合会大厦（北）
    twr = Batch('props_tower')
    twr.boxc(TWR_CX, TWR_CY, PL, 86, 86, 7.0, ASHLAR)                       # 裙楼
    twr.boxc(TWR_CX, TWR_CY, PL + 7.0, 60, 60, 42.0, ASHLAR)                # 塔身一（石材主面，幕带另贴）
    twr.boxc(TWR_CX, TWR_CY, PL + 7.0, 62, 62, 2.0, MARBLE)
    for f in range(5):                                                      # 幕带（四立面各一条）
        zb = PL + 9.0 + f * 7.6
        for (bx, by, bw, bd) in ((TWR_CX, TWR_CY - 30.2, 50.0, 0.4), (TWR_CX, TWR_CY + 30.2, 50.0, 0.4),
                                 (TWR_CX - 30.2, TWR_CY, 0.4, 50.0), (TWR_CX + 30.2, TWR_CY, 0.4, 50.0)):
            twr.boxc(bx, by, zb, bw, bd, 3.6, GLASS_L)
    for (sx, sy) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):                   # 塔身一角柱
        twr.boxc(TWR_CX + sx * 29.0, TWR_CY + sy * 29.0, PL + 7.0, 3.0, 3.0, 44.0, BRONZE)
    twr.boxc(TWR_CX, TWR_CY, PL + 7.0 + 42.0, 48, 48, 32.0, WG2)            # 塔身二（退台）
    twr.boxc(TWR_CX, TWR_CY, PL + 51.0, 50, 50, 2.4, MARBLE)
    twr.boxc(TWR_CX, TWR_CY, PL + 83.0, 34, 34, 24.0, WG)                   # 塔身三
    twr.boxc(TWR_CX, TWR_CY, PL + 107.0, 36, 36, 2.4, MARBLE)
    for i in range(4):                                                      # 塔冠四角桁架 + 尖顶
        sx = -1 if i < 2 else 1
        sy = -1 if i % 2 == 0 else 1
        mx, my = TWR_CX + sx * 14.0, TWR_CY + sy * 14.0
        twr.cyl(mx, my, PL + 109.4, 1.2, 14.0, BRONZE, 8, r2=0.8)
    twr.cyl(TWR_CX, TWR_CY, PL + 109.4, 9.0, 3.0, BRONZE, 16, r2=8.0)
    twr.cyl(TWR_CX, TWR_CY, PL + 112.4, 3.2, 20.0, BRONZE, 12, r2=1.2)
    twr.sphere(TWR_CX, TWR_CY, PL + 133.6, 2.4, GLOW, seg=20, rings=12)
    twr.boxc(TWR_CX, TWR_CY - 46.0, PL, 40, 8, 12.0, ASHLAR)                # 临街柱廊门厅
    for k in range(6):
        twr.cyl(TWR_CX - 15.0 + k * 6.0, TWR_CY - 49.0, PL, 0.9, 12.0, MARBLE, 10)
    points.append(((TWR_CX, TWR_CY, PL + 133.6), 1.6e4, (1.0, 0.9, 0.7)))

    # ------------------------------------------------------------ 会所（南）
    club = Batch('props_club')
    club.boxc(CLB_CX, CLB_CY, PL, 96, 54, 22.0, ASHLAR)
    for sx in (-1, 1):                                                      # 两侧翼楼（压低、后退，读成一栋而不是两间棚子）
        club.boxc(CLB_CX + sx * 60.0, CLB_CY - 6.0, PL, 28, 38, 9.5, ASHLAR)
        club.gable(CLB_CX + sx * 60.0 - 14, CLB_CX + sx * 60.0 + 14, CLB_CY - 25, CLB_CY + 13, PL + 9.5, 3.6, ROOF, along='x', over=0.6)
    club.boxc(CLB_CX, CLB_CY, PL, 98, 56, 1.2, MARBLE)                      # 基座线脚
    club.gable(CLB_CX - 49, CLB_CX + 49, CLB_CY - 28, CLB_CY + 28, PL + 22.0, 9.0, ROOF, along='y', over=1.2)   # 屋脊南北向：c1 看到山墙面
    for k in range(4):                                                      # 屋顶老虎窗
        x = CLB_CX - 33.0 + k * 22.0
        club.boxc(x, CLB_CY - 16.0, PL + 22.0, 4.0, 6.0, 3.4, ASHLAR)
        club.gable(x - 2.0, x + 2.0, CLB_CY - 19.0, CLB_CY - 13.0, PL + 25.4, 1.6, ROOF, along='x', over=0.3)
    club.boxc(CLB_CX, CLB_CY + 27.6, PL + 0.6, 46, 0.6, 11.0, GLASS_L)      # 玻璃前厅（朝广场）
    for k in range(8):                                                      # 门廊列柱
        x = CLB_CX - 28.0 + k * 8.0
        club.cyl(x, CLB_CY + 33.0, PL, 1.1, 15.0, MARBLE, 12)
        club.cyl(x, CLB_CY + 33.0, PL + 15.0, 1.35, 0.5, GOLD, 12)
    club.boxc(CLB_CX, CLB_CY + 33.0, PL + 15.5, 74, 5.0, 2.2, MARBLE)       # 额枋
    club.gable(CLB_CX - 37, CLB_CX + 37, CLB_CY + 30, CLB_CY + 36, PL + 17.7, 4.0, MARBLE, along='x', over=0.6)
    club.cyl(CLB_CX, CLB_CY + 52.0, PL, 9.0, 0.6, MARBLE, 32, r2=9.0)       # 露台水池
    club.cyl(CLB_CX, CLB_CY + 52.0, PL + 0.6, 7.6, 0.3, GLASS, 32, r2=7.6)
    club.cyl(CLB_CX, CLB_CY + 52.0, PL + 0.9, 1.0, 2.6, MARBLE, 12)
    points.append(((CLB_CX, CLB_CY + 33.0, PL + 12.0), 6e3, (1.0, 0.88, 0.68)))

    # ------------------------------------------------------------ 台地铺装 + 环路 + 放射大道 + 台阶
    ground = Batch('site_ground')
    ground.cyl(0, 0, 0, RING_R + 8, PL, PAVE, 64, r2=RING_R - 6)            # 台地铺装（环形）
    ground.cyl(0, 0, PL - 0.15, 34.5, 0.15, MARBLE, 48, r2=34.5)            # 殿前石材环
    ringn = 72
    for i in range(ringn):                                                  # 环路
        a0 = i * math.tau / ringn; a1 = (i + 1) * math.tau / ringn
        ground.strip([(math.cos(a0) * RING_R, math.sin(a0) * RING_R, 0),
                      (math.cos(a1) * RING_R, math.sin(a1) * RING_R, 0)], 9.0, 0.08, ROAD)
    for k in range(4):                                                      # 四条放射大道（从台地边缘起，不穿广场）
        a = k * math.tau / 4 + math.tau / 8
        ground.strip([(math.cos(a) * (RING_R + 1), math.sin(a) * (RING_R + 1), 0),
                      (math.cos(a) * (RING_R + 120), math.sin(a) * (RING_R + 120), 0)], 15.0, 0.06, ROAD)
        for t in (0.34, 0.52, 0.70):                                        # 大道两侧行道树
            for sd in (-1, 1):
                rr = RING_R + t * 130
                tx, ty = math.cos(a) * rr - sd * math.sin(a) * 13, math.sin(a) * rr + sd * math.cos(a) * 13
                ground.cyl(tx, ty, 0, 0.28, 3.2, WOOD, 8)
                ground.sphere(tx, ty, 3.7, 1.7, LEAF, seg=10, rings=6)
    for k in range(8):                                                      # 台地台阶（八向）
        a = k * math.tau / 8
        ground.strip([(math.cos(a) * (RING_R + 6), math.sin(a) * (RING_R + 6), 0),
                      (math.cos(a) * (RING_R - 2), math.sin(a) * (RING_R - 2), PL)], 26.0, 0.35, MARBLE)
    for (gx, gy, gw, gd) in ((-3.0, 96.0, 86.0, 46.0), (3.0, -96.0, 86.0, 46.0),
                             (-96.0, 3.0, 46.0, 86.0), (96.0, -3.0, 46.0, 86.0)):
        ground.boxc(gx, gy, PL - 0.05, gw, gd, 0.1, GRASS)                  # 四角草坪
    ground.lathe(0, 0, PL + 0.02, [(RING_R - 9, 0), (RING_R - 9, 0.08), (RING_R - 12, 0.08)], BRONZE, 72)   # 铺装内的青铜镶环
    for i in range(16):                                                     # 放射铺装带（深浅相间）
        a = i * math.tau / 16 + math.tau / 32
        ground.strip([(math.cos(a) * 40, math.sin(a) * 40, PL + 0.04),
                      (math.cos(a) * (RING_R - 6), math.sin(a) * (RING_R - 6), PL + 0.04)], 8.0, 0.06,
                     MARBLE if i % 2 else PAVE)
    for i in range(48):                                                     # 台地边缘栏杆（柱 + 压顶）
        a = i * math.tau / 48
        px, py = math.cos(a) * (RING_R + 1.5), math.sin(a) * (RING_R + 1.5)
        ground.cyl(px, py, PL, 0.32, 1.5, MARBLE, 8)
    ground.lathe(0, 0, PL + 1.5, [(RING_R + 2.0, 0), (RING_R + 2.0, 0.5), (RING_R + 1.0, 0.5)], BRONZE, 64)

    # ------------------------------------------------------------ 广场灯柱
    lights = Batch('props_lights')
    for i in range(16):
        a = i * math.tau / 16 + math.tau / 32
        lx, ly = math.cos(a) * 66.0, math.sin(a) * 66.0
        lights.cyl(lx, ly, PL, 0.34, 6.4, BRONZE, 10)
        lights.cyl(lx, ly, PL + 6.4, 0.72, 1.5, LAMP, 10, r2=0.5)
        points.append(((lx, ly, PL + 7.2), 3.2e3, (1.0, 0.86, 0.62)))
    for (fx, fy) in ((-205.0, -95.0), (-205.0, 95.0), (205.0, -95.0), (205.0, 95.0)):   # 场外泛光
        lights.cyl(fx, fy, 0, 1.0, 18.0, BRONZE, 10, r2=0.7)
        lights.boxc(fx, fy, 18.0, 3.6, 1.2, 1.6, LAMP)
        points.append(((fx, fy, 19.2), 1.4e4, (1.0, 0.9, 0.75)))

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 背景：既有城建 + 上方甲板
    BG = C.flat('bg_conc', (0.36, 0.33, 0.29), 0.85, noise=0.3)          # 暖石材色，别让远景发蓝
    BG2 = C.flat('bg_dark', (0.16, 0.16, 0.18), 0.85, noise=0.35)
    WGB = [C.window_grid('bg_wg%d' % i, lit=c, estr=3.0, cell=(3.2, 3.6), seed=i * 4.1) for i, c in
           enumerate(((1.0, 0.85, 0.6), (0.7, 0.85, 1.0)))]
    far = Batch('bg_deck')
    far.box(-5200, 5200, -5200, 5200, -6, -4, BG)

    bt = Batch('bg_towers')
    rb = random.Random(53)
    cam_bearings = [math.degrees(math.atan2(cy, cx)) % 360 for cx, cy in ((-330.0, -420.0), (0.0, -560.0), (430.0, -330.0))]   # 三台镜头各留一条空视线
    placed = []
    for k in range(96):
        for _ in range(60):
            a = rb.uniform(0, math.tau); d = rb.uniform(380, 2200)
            x, y = math.cos(a) * d, math.sin(a) * d
            w, dd = rb.uniform(26, 58), rb.uniform(26, 58)
            clear = all(abs(x - px) > (w + pw) / 2 + 10 or abs(y - py) > (dd + pd) / 2 + 10 for px, py, pw, pd in placed)
            bearing = math.degrees(a) % 360
            in_cam_lane = (d < 620) and any(abs((bearing - cb + 180) % 360 - 180) < 30 for cb in cam_bearings)
            if clear and not in_cam_lane:
                break
        else:
            continue
        placed.append((x, y, w, dd))
        h = rb.uniform(22, 118)
        bt.box(x - w / 2, x + w / 2, y - dd / 2, y + dd / 2, 0, h, rb.choice(WGB) if k % 3 else BG2)

    # 上层甲板（bg_overhead）在预览镜头里只会在天际线上切出一道黑边，已取消

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    # ------------------------------------------------------------ 世界 / 光：日间，庄重通透
    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=38.0, sun_e=4.4, sky_s=0.5)     # 太阳压低一点、加强，石材才出暖调
    a = math.radians(205.0)
    for d in (420.0,):
        ld = bpy.data.lights.new('sun_fill', 'AREA'); ld.energy = 2.4e5; ld.size = 900; ld.color = (0.95, 0.9, 0.8)
        o = bpy.data.objects.new('sun_fill', ld); sc.collection.objects.link(o)
        o.location = (math.cos(a) * d, math.sin(a) * d, 260.0)
    for i, (loc, e, c) in enumerate(points):
        C.point_light('pt_%d' % i, loc, e, c, 0.2)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.0

    CAMS = {
        'c1': ((-330.0, -420.0, 250.0), (20.0, 0.0, 30.0), 26, 0.0),
        'c2': ((0.0, -560.0, 120.0), (0.0, 20.0, 45.0), 30, 0.0),
        'c3': ((430.0, -330.0, 95.0), (AR_CX, 0.0, 20.0), 28, 0.0),
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
