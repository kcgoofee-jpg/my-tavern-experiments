"""大骑士领·圣都 外环「临光家族外城驻所」（site_kavalierki）——只做外观。
卡原文（docs/landmarks/linguang_post.md，卡 L89 + L189）：外环有「临光家族外城驻所」；临光是圆桌骑士家族。
本模型：两层宅邸 + 三层瞭望方塔 + 院墙铁门 + 马车房 + 庭院灯 / 水井——棚户带里唯一整洁的石构院落。
中立性：无人物、无文字 / 徽记 / 旗帜、无武器类细节（docs/rejected.md）。

导出组（= 清单「看板条目」的组名；新增组记得同步清单，并在 map/props/linguang_post/manifest.json 的 budgets 里给三角形预算）：
  props_house   两层宅邸（石基白灰墙 + 板石坡顶 + 双烟囱）+ 西侧三层方塔
  props_court   院墙 + 铁艺正门 + 门柱灯 + 马车房 / 马厩 + 庭院灯 + 水井
  site_ground   院 内石铺 + 院外泥地
bg_*：贴墙棚屋剪影、远树、大地（不导出）。

布局（米，地面 z=0；北 = +y）：
  院 60 × 50（x ∈ [-30, 30], y ∈ [-25, 25]）：主楼 (0, 12) 18 × 10 檐高 7；方塔 (-13, 12) 5 × 5 高 11；
  马车房贴西墙 (-25.5, -2) 7 × 12；正门 (0, -25)；井 (6, -6)；庭院灯 (±8, -14)。
用法（仓库根目录；平时用 python3 tools/landmark.py draft / board / final linguang_post）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/linguang_post/build.py', run_name='__main__')" \
      -- --cam c1 --res 800 --samples 16 --out /tmp/linguang_post.jpg [--blend /tmp/linguang_post.blend] [--log /tmp/linguang_post.log]
cam: c1 主视角（东南俯瞰全院）/ c2 正门与主楼正立面 / under 西北看方塔与主楼背侧
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='800', samples='16', out='/tmp/linguang_post.jpg', blend='', log='', exposure=''))

WALL = dict(x0=-30, x1=30, y0=-25, y1=25)    # 院墙
HOUSE = dict(x0=-9, x1=9, y0=7, y1=17)       # 主楼
TOWER = dict(x0=-15.5, x1=-10.5, y0=9.5, y1=14.5)   # 方塔


def main():
    import bpy
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])
    Batch = C.Batch
    rnd = random.Random(31)

    STUCCO = C.pbr('lg_stucco', 'white_stucco', 3.0, tint=(0.87, 0.82, 0.72), sat=0.2, value=1.0, weather=0.35)
    STONE = C.pbr('lg_stone', 'white_sandstone_blocks_02', 3.0, tint=(0.6, 0.58, 0.54), sat=0.15, value=0.9, weather=0.5)
    ROOF = C.pbr('lg_roof', 'roof_slates_02', 2.6, tint=(0.3, 0.32, 0.37), sat=0.25)
    WOOD = C.pbr('lg_wood', 'rough_wood', 2.2, tint=(0.5, 0.4, 0.29), sat=0.45, value=0.7)
    WOOD_D = C.pbr('lg_wood_d', 'dark_wood', 2.0, tint=(0.4, 0.33, 0.26), sat=0.3)
    METAL = C.pbr('lg_metal', 'Metal009', 2.0, tint=(0.3, 0.28, 0.26), sat=0.2, metal=0.8, rough_mul=0.8)
    COBBLE = C.pbr('lg_cobble', 'precast_stone_paving', 3.5, tint=(0.56, 0.51, 0.42), sat=0.3, value=0.85)
    DIRT = C.pbr('lg_dirt', 'dirt_floor', 7.0, tint=(0.4, 0.35, 0.27), sat=0.4, value=0.6)
    WIN = C.flat('lg_win', (0.07, 0.065, 0.06), 0.35)
    WINLIT = C.flat('lg_winlit', (1, 1, 1), 0.4, emit=(1.0, 0.8, 0.5), estr=5.0)
    LAMP = C.flat('lg_lamp', (1, 1, 1), 0.4, emit=(1.0, 0.85, 0.55), estr=9.0)
    GROUND = C.flat('lg_bg_ground', (0.19, 0.21, 0.15), 0.95, noise=0.5)
    CANV_T = C.flat('lg_canv_t', (0.62, 0.56, 0.42), 0.85, noise=0.35)
    BG_SHACK = C.flat('lg_bg_shack', (0.28, 0.26, 0.24), 0.9)
    LEAF = C.flat('lg_leaf', (0.13, 0.2, 0.1), 0.8, noise=0.4)

    # ------------------------------------------------------------ 主楼 + 方塔
    hs = Batch('props_house')
    x0, x1, y0, y1 = HOUSE['x0'], HOUSE['x1'], HOUSE['y0'], HOUSE['y1']
    HE = 7.0
    hs.box(x0, x1, y0, y1, 0, 3.0, STONE)         # 石砌一层
    hs.box(x0, x1, y0, y1, 3.0, HE, STUCCO)       # 白灰二层
    hs.gable(x0, x1, y0, y1, HE, 3.0, ROOF, over=0.7)
    for cx in (x0 + 3.2, x1 - 3.2):               # 双烟囱
        hs.boxc(cx, (y0 + y1) / 2, HE + 2.2, 1.2, 1.2, 2.6, STONE)
    for i in range(4):                            # 一层拱窗（朝南）
        wx = x0 + 3 + i * 4.0
        hs.boxc(wx, y0 - 0.1, 1.2, 1.2, 0.14, 1.6, WINLIT if i % 2 == 0 else WIN)
    for i in range(4):                            # 二层窗
        wx = x0 + 3 + i * 4.0
        hs.boxc(wx, y0 - 0.1, 4.4, 1.2, 0.14, 1.5, WIN)
    hs.boxc(0, y0 - 0.12, 0, 2.0, 0.16, 2.8, WOOD_D)   # 正门（朝南）
    hs.boxc(0, y0 - 0.35, 2.8, 2.6, 0.8, 0.25, STONE)  # 门楣
    for sx in (x0 + 0.2, x1 - 0.2):               # 山墙窗（东西）
        hs.boxc(sx + (0.08 if sx == x1 else -0.08), (y0 + y1) / 2, 4.4, 0.14, 1.2, 1.5, WIN)
    # 三层瞭望方塔（贴西北角）
    tx0, tx1, ty0, ty1 = TOWER['x0'], TOWER['x1'], TOWER['y0'], TOWER['y1']
    hs.box(tx0, tx1, ty0, ty1, 0, 3.0, STONE)
    hs.box(tx0, tx1, ty0, ty1, 3.0, 10.2, STUCCO)
    hs.box(tx0 - 0.35, tx1 + 0.35, ty0 - 0.35, ty1 + 0.35, 10.2, 11.0, STONE)   # 平顶女儿墙
    for fz in (4.2, 7.4):                          # 塔身窄窗
        hs.boxc((tx0 + tx1) / 2, ty0 - 0.12, fz, 0.9, 0.14, 1.4, WIN)
        hs.boxc(tx0 - 0.12, (ty0 + ty1) / 2, fz, 0.14, 0.9, 1.4, WIN)
    hs.boxc((tx0 + tx1) / 2, ty0 - 0.12, 10.4, 1.2, 0.2, 0.5, WINLIT)   # 塔顶灯室
    for i in range(6):                             # 塔身爬梯（北壁外挂）
        hs.boxc(tx1 + 0.3, ty1 - 0.4 - i * 0.9, 0.4 + i * 1.5, 0.6, 0.3, 0.08, METAL)

    # ------------------------------------------------------------ 院墙 + 门 + 附属
    ct = Batch('props_court')
    fx0, fx1, fy0, fy1 = WALL['x0'], WALL['x1'], WALL['y0'], WALL['y1']
    WH_ = 2.6

    def wall_run(px0, py0, px1, py1, m=STONE):
        n = max(1, int(math.hypot(px1 - px0, py1 - py0) / 6))
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            ct.box(px0 + (px1 - px0) * t0, px0 + (px1 - px0) * t1,
                   py0 + (py1 - py0) * t0, py0 + (py1 - py0) * t1, 0, WH_, m)
        ct.strip([(px0, py0, WH_ + 0.08), (px1, py1, WH_ + 0.08)], 0.3, 0.14, STONE)   # 压顶

    wall_run(fx0, fy0, -4, fy0)
    wall_run(4, fy0, fx1, fy0)                     # 南墙留正门口
    wall_run(fx0, fy1, fx1, fy1)
    wall_run(fx0, fy0, fx0, fy1)
    wall_run(fx1, fy0, fx1, fy1)
    # 铁艺双开门 + 门柱灯
    for gx in (-4, 4):
        ct.boxc(gx, fy0, 0, 0.7, 0.7, 3.4, STONE)  # 门柱
        ct.boxc(gx, fy0, 3.0, 0.4, 0.4, 0.3, LAMP)
    for sgn in (-1, 1):
        ct.boxc(sgn * 1.9, fy0, 0, 3.4, 0.08, 2.9, METAL)
        for bz in (0.8, 1.6, 2.3):                 # 门上素面竖条（无徽记）
            ct.strip([(sgn * 3.1, fy0, bz), (sgn * 0.4, fy0, bz)], 0.06, 0.06, METAL)
    ct.strip([(-3.6, fy0, 3.1), (3.6, fy0, 3.1)], 0.1, 0.14, METAL)   # 门楣横杆
    # 马车房 / 马厩（贴西墙）
    sx0, sx1, sy0, sy1 = fx0 + 0.8, fx0 + 8.2, -9, 3
    ct.box(sx0, sx1, sy0, sy1, 0, 4.2, STUCCO)
    ct.gable(sx0, sx1, sy0, sy1, 4.2, 1.6, ROOF, along='y', over=0.5)
    for dy in (sy0 + 2, (sy0 + sy1) / 2, sy1 - 2):  # 朝东三个木门大开口
        ct.boxc(sx1 + 0.06, dy, 0, 0.14, 2.2, 3.0, WOOD_D)
    # 庭院灯两盏 + 水井
    for lx, ly in ((-8, -14), (8, -14)):
        ct.cyl(lx, ly, 0, 0.1, 3.4, METAL, 8)
        ct.cyl(lx, ly, 3.4, 0.3, 0.4, METAL, 8)
        ct.boxc(lx, ly, 3.15, 0.45, 0.45, 0.3, LAMP)
    ct.cyl(6, -6, 0, 1.3, 0.9, STONE, 14)
    ct.cyl(6, -6, 0.9, 1.45, 0.25, STONE, 14)
    for wx in (6.9, 5.1):                          # 井架两柱 + 小顶
        ct.strip([(wx, -6, 1.1), (wx, -6, 2.9)], 0.1, 0.1, WOOD_D)
    ct.gable(5.0, 7.0, -6.25, -5.75, 2.9, 0.5, ROOF, over=0.2)
    # 四轮货运马车（停在大帐……停在南半院，车头朝门）
    cartx, carty = -10.0, -12.0
    ct.boxc(cartx, carty, 1.05, 4.6, 2.2, 0.18, WOOD_D)          # 车板
    ct.boxc(cartx + 1.5, carty, 1.23, 1.6, 2.0, 0.55, WOOD)      # 前部挡板 / 货
    ct.boxc(cartx - 1.2, carty, 1.23, 2.2, 2.2, 0.5, WOOD_D)     # 盖布货堆
    ct.poly([(cartx - 2.4, carty - 1.2, 1.45), (cartx + 0.1, carty - 1.2, 1.45),
             (cartx + 0.1, carty + 1.2, 1.45), (cartx - 2.4, carty + 1.2, 1.45)],
            [(3, 2, 1, 0)], CANV_T)                               # 米色防雨布
    for wx_, wy_ in ((1.7, -1.05), (1.7, 1.05), (-1.7, -1.05), (-1.7, 1.05)):
        ct.cyl(cartx + wx_, carty + wy_, 0.25, 0.55, 0.12, WOOD_D, 12)
    ct.strip([(cartx - 2.3, carty - 0.7, 1.0), (cartx - 4.4, carty - 0.7, 0.85)], 0.07, 0.07, WOOD_D)   # 车辕
    ct.strip([(cartx - 2.3, carty + 0.7, 1.0), (cartx - 4.4, carty + 0.7, 0.85)], 0.07, 0.07, WOOD_D)
    for i in range(3):                                             # 马车房门口货堆
        ct.boxc(-22.0 + rnd.uniform(-0.6, 0.6), -4 + i * 1.6, 0, 1.1, 1.1, 0.9, WOOD_D)
    # 北墙根一排杂木（贴主楼背侧外侧也行，放院内北缘）
    for i in range(4):
        C.tree(ct, -24 + i * 14 + rnd.uniform(-2, 2), 21 + rnd.uniform(-1, 1),
               rnd.uniform(4.5, 6.5), rnd.uniform(1.8, 2.6), 'yew_col', seed=610 + i)

    # ------------------------------------------------------------ 场地
    gr = Batch('site_ground')
    gr.box(-64, 64, -54, 54, -0.3, 0, DIRT)
    gr.box(fx0 - 1, fx1 + 1, fy0 - 1, fy1 + 1, 0, 0.06, COBBLE)   # 院内石铺（含门口缓冲）

    # ------------------------------------------------------------ bg
    bg = Batch('bg_ground')
    bg.box(-700, 700, -700, 700, -1.6, -0.5, GROUND)
    sil = Batch('bg_shacks')
    for _ in range(30):
        sx = rnd.uniform(-280, 280)
        sy = rnd.uniform(90, 240) if rnd.random() < 0.5 else rnd.uniform(-240, -100)
        if abs(sx) < 75 and abs(sy) < 65:
            continue
        sil.boxc(sx, sy, -0.5, rnd.uniform(6, 14), rnd.uniform(5, 10), rnd.uniform(2.4, 4.0), BG_SHACK)
    forest = Batch('bg_trees')
    for i in range(4):
        C.tree(forest, -60 + i * 40 + rnd.uniform(-6, 6), 66 + rnd.uniform(-4, 6),
               rnd.uniform(9, 13), rnd.uniform(3.2, 4.6), 'oak', seed=620 + i)

    for o in Batch.build_all():
        print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), flush=True)

    C.sky_sun(sc, 'day', sun_az=205.0, sun_el=44.0)
    sc.view_settings.exposure = float(A['exposure']) if A['exposure'] else 0.1
    CAMS = {
        'c1': ((-62.0, -78.0, 52.0), (0.0, 4.0, 5.0), 32, 0.0),
        'c2': ((-14.0, -52.0, 5.0), (0.0, 10.0, 6.0), 34, 0.0),
        'under': ((-52.0, 44.0, 20.0), (2.0, 8.0, 7.0), 35, 0.0),
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
