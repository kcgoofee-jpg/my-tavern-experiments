# 天城 · 下层（地基区，地面）· Blender 正俯视写实渲染（夜景草稿）
# 用法：Blender -b -P tiancheng_low.py -- [--res 1600] [--samples 64] [--out path.png] [--crop x0,y0,x1,y1] [--preview] [--data-only]
#       [--glow 1]（发光体倍数）[--lamp .3]（钠灯功率）[--ambient .12]（天光）
#       或 python3 tiancheng_low.py -- ...（pip 装的 bpy）。参数与导出格式三层一致，见 docs/tiancheng-maps.md
# 与上层、中层同一相机、同一平面坐标、同一张街道网（tc_common.city_blocks，同一随机种子）：
# 楼的平面位置沿用城市布局，只压低高度、按片区换成厂房 / 旧楼；贫民窟格子里的楼换成密集的铁皮棚屋。
# 设定：「工厂、资源处理设施」「老旧地面轨道、货运通道、步行为主」「几乎没有自然光，黑市与帮派活跃」。
# 光：几乎没有天光；钠灯橙黄点光为主，少量磷光绿。头顶是中层结构，巨大支柱的柱基均匀分布。
import bpy, bmesh, math, os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tc_common as tc
from tc_common import W, H, Z_GROUND as ZG, tick, mat, emit_mat, Batch
import numpy as np
from mathutils import Matrix

layer = tc.Layer('tc_low', seed=9001, bounces=4)   # 城市在这里生成（第一个随机调用）：街道位置与上层、中层一致
sc, col_main, city, R, GLOW, LAMP = layer.sc, layer.col, layer.city, layer.rng, layer.f('--glow', 1), layer.f('--lamp', .3)

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)
SODIUM, SODIUM2, PHOS, WHITE, BLUE, RED = srgb('#f0a040'), srgb('#ff8c2a'), srgb('#9fe870'), srgb('#e8eeff'), srgb('#5a8cff'), srgb('#ff3a2a')
S = tc.CELL; xs, ys, AX, AY = city['xs'], city['ys'], city['AX'], city['AY']
near = lambda arr, idx, v: min(idx, key=lambda k: abs(arr[k] - v))

# ---------------- 地标位置（全部为推断）----------------
WELL7 = (4.6, -6.9)          # 7 号井黑市：正对中层 C 区检查点的竖井下方
MILL = (-5.8, -3.3)          # 黑拳场「血肉磨坊」
ENF = (-1.8, 3.1)            # 执法局下层分局（名义六个、实际运转三个；只画一个）
SOUP = (8.4, .5)             # 圣光教会施粥站（下层教区的旧教堂）
OUTPOST = (-12.3, -6.6)      # 防卫军前沿哨所
AMC = (10.6, 5.6)            # 资产管理委员会下层设施：只画有围墙的大型管理设施（中性外观）
RAIL_Y = [ys[near(ys, AY, 5.2)], ys[near(ys, AY, -2.4)]]   # 两条东西向货运铁路：沿主干道
RAIL_X = [xs[near(xs, AX, 1.0)]]                             # 一条南北向
YARD = (-7.6, RAIL_Y[0])     # 货运站 / 旧地面轨道枢纽：铁路汇入处
# 巨大支柱：均匀网格（约 300 m 间距），避开地标
PILLARS = [(px, py) for px in np.arange(-13.5, 13.6, 3.0) for py in np.arange(-7.5, 7.6, 3.0)]
LM = [(*WELL7, .85, .85), (*MILL, .7, .55), (*ENF, .75, .6), (*SOUP, .7, .55), (*OUTPOST, .8, .7), (*AMC, 1.25, .9), (*YARD, 1.7, .6)]
PILLARS = [p for p in PILLARS if all(((p[0] - x) / (rx + .4)) ** 2 + ((p[1] - y) / (ry + .4)) ** 2 > 1 for x, y, rx, ry in LM)]
zones = LM + [(px, py, .34, .34) for px, py in PILLARS]
zones += [('rect', -20, y - .09, 20, y + .09) for y in RAIL_Y] + [('rect', x - .09, -12, x + .09, 12) for x in RAIL_X]
B = city['boxes']; keep = tc.keep_mask(city, zones)

# ---------------- 片区：按街坊分成工业 / 贫民窟 / 旧城 ----------------
# 地基区沿用同一张街道网与街坊划分；每个街坊整体是一种肌理（真实城市里工业区、棚户区都是成片的，不是楼挨楼混着）
import tc_detail as td
def industrial(x, y): return math.sin(x * .35 + .7) * math.cos(y * .4 - 1.2) + .5 * math.sin(x * .13 + y * .2 + 1) > .45
def slum(x, y, n): return not industrial(x, y) and n < .62 and math.sin(x * .5 - 1) * math.sin(y * .6 + .3) + .3 * math.cos(x * .21 - y * .17) > -.15
def blackout(x, y): return math.sin(x * .41 + 2.1) * math.cos(y * .37 + .4) + .4 * math.sin(x * .9 - y * .7) > .75   # 断电的片区
kind, par, dist, blk = city['kind'], city['parent'], city['district'], city['block']
nblk = int(blk.max()) + 1; BB = np.tile(np.array([1e9, 1e9, -1e9, -1e9], np.float32), (nblk, 1))
for (x, y, w, d, z0, z1), k, b_ in zip(B, kind, blk):                   # 街坊范围：由地面盒子拼出
    if k in (tc.K_GROUND, tc.K_PARK):
        BB[b_] = (min(BB[b_, 0], x - w / 2), min(BB[b_, 1], y - d / 2), max(BB[b_, 2], x + w / 2), max(BB[b_, 3], y + d / 2))
ZONE = np.zeros(nblk, np.int8)                                         # 0 旧城 1 工业 2 贫民窟
for i in range(1, nblk):
    if BB[i, 0] > 1e8: continue
    x, y = (BB[i, 0] + BB[i, 2]) / 2, (BB[i, 1] + BB[i, 3]) / 2
    ZONE[i] = 1 if industrial(x, y) else 2 if slum(x, y, tc.district(x, y)) else 0
Zb = ZONE[blk]
def keep_boxes(boxes):                                                 # 新加的东西也要避开地标、柱基、铁路
    A = np.asarray(boxes, np.float32).reshape(-1, 6)
    return tc.keep_mask({'boxes': A, 'parent': np.full(len(A), -1)}, zones) if len(A) else np.zeros(0, bool)

# 地面：旧城水泥、工业区硬地、棚户区泥地；公园早已荒成泥地或堆场
gnd = ((kind == tc.K_GROUND) | (kind == tc.K_PARK)) & keep
Bg = B[gnd].copy(); Bg[:, 4] = 0; Bg[:, 5] = .004
cg = np.array([(.075, .07, .065), (.1, .098, .095), (.07, .058, .045)], np.float32)[Zb[gnd]]
cg[kind[gnd] == tc.K_PARK] = (.09, .075, .05)
tc.road_plane(None, z=0, m=td.asphalt_mat('road', (.035, .033, .03), 1.3))
gmat = td.city_mat('lowground', .9, ao=.02, grime=1.4)
tc.box_mesh('ground', Bg, cg, gmat)

# 旧城：沿用地块，高度压到 3–25 m；女儿墙、坡顶、屋顶水箱
old_b = (kind == tc.K_BUILDING) & keep & (Zb == 0)
Bb = B[old_b].copy(); h = (Bb[:, 5] - ZG) / 3.7; Bb[:, 4] = 0; Bb[:, 5] = .03 + .22 * np.clip(h, 0, 1) ** 1.4
top_of = np.zeros(len(B), np.float32); top_of[old_b] = Bb[:, 5]
eqp = (kind == tc.K_EQUIP) & keep & old_b[np.maximum(par, 0)] & (par >= 0)
Be = B[eqp].copy(); pt = top_of[par[eqp]]; Be[:, 5] = pt + (Be[:, 5] - Be[:, 4]) * 1.5; Be[:, 4] = pt
OLD = np.array([(.22, .2, .18), (.18, .17, .16), (.26, .22, .18), (.2, .19, .2), (.28, .16, .1)], np.float32)   # 水泥、焦油、锈红
cb = OLD[R.integers(len(OLD), size=len(Bb))] * R.uniform(.75, 1.15, (len(Bb), 1))
omat = td.city_mat('oldcity', .8, grime=1.5)
tc.box_mesh('buildings', Bb, cb, omat)
tc.box_mesh('equipment', Be, np.tile((.22, .21, .2), (len(Be), 1)) * R.uniform(.7, 1.3, (len(Be), 1)), omat)
kit = td.building_kit(Bb, cb, R, 'low', cap=.3)
td.build_kit('old', kit, omat, td.corrugated_mat('oldroof', .7, .2, 1400))

# 工业区：整个街坊是一到三座大厂房（锯齿采光带、波纹钢板），剩下的是罐区和堆场
sheds, shc, sky, tanks_ = [], [], [], []
METAL = np.array([(.3, .3, .3), (.24, .25, .26), (.34, .26, .18), (.2, .21, .2), (.28, .2, .14)], np.float32)
for i in np.where(ZONE == 1)[0]:
    x0, y0, x1, y1 = BB[i] + np.array([.035, .035, -.035, -.035], np.float32)
    if x1 - x0 < .1 or y1 - y0 < .1: continue
    long_x = (x1 - x0) >= (y1 - y0); L0, L1 = (x0, x1) if long_x else (y0, y1)
    cuts = sorted(R.uniform(L0 + .15, L1 - .15, R.integers(0, 3))) if L1 - L0 > .4 else []
    edges = [L0] + list(cuts) + [L1]
    for k, (a0, a1) in enumerate(zip(edges[:-1], edges[1:])):
        a0 += .015; a1 -= .015
        if a1 - a0 < .06: continue
        if k == len(edges) - 2 and R.random() < .35:                  # 最后一段做罐区
            for tx in np.arange(a0 + .05, a1 - .03, .1):
                for ty in np.arange((y0 if long_x else x0) + .05, (y1 if long_x else x1) - .03, .1):
                    tanks_.append((tx, ty) if long_x else (ty, tx))
            continue
        cx_, cy_ = ((a0 + a1) / 2, (y0 + y1) / 2) if long_x else ((x0 + x1) / 2, (a0 + a1) / 2)
        w_, d_ = (a1 - a0, y1 - y0) if long_x else (x1 - x0, a1 - a0)
        hgt = R.uniform(.07, .16); sheds.append((cx_, cy_, w_, d_, 0, hgt)); shc.append(METAL[R.integers(len(METAL))] * R.uniform(.85, 1.1))
        if w_ >= d_:                                                   # 采光带垂直于长边
            for t in np.arange(-w_ / 2 + .02, w_ / 2 - .01, .028): sky.append((cx_ + t, cy_, .007, d_ * .88, hgt, hgt + .005))
        else:
            for t in np.arange(-d_ / 2 + .02, d_ / 2 - .01, .028): sky.append((cx_, cy_ + t, w_ * .88, .007, hgt, hgt + .005))
ks = keep_boxes(sheds); sheds = [b_ for b_, k in zip(sheds, ks) if k]; shc = [c for c, k in zip(shc, ks) if k]
sky = [b_ for b_, k in zip(sky, keep_boxes(sky)) if k]
tc.box_mesh('sheds', sheds, shc, td.corrugated_mat('shedroof', .5, .5, 1100, 1.2))
tc.box_mesh('skylights', sky, np.tile((.4, .42, .42), (len(sky), 1)), tc.vcol_mat('skym', .15, .6))
tick(f'old buildings {len(Bb)}, industrial sheds {len(sheds)}')

# 贫民窟：整片铁皮棚屋，留出一米来宽的窄巷（锈红、蓝色篷布、灰铁皮）
SHACK = np.array([(.3, .14, .08), (.36, .2, .12), (.1, .16, .26), (.3, .3, .28), (.22, .2, .17), (.16, .2, .12)], np.float32)
shacks, shc2, shr = [], [], []
for i in np.where(ZONE == 2)[0]:
    x0, y0, x1, y1 = BB[i] + np.array([.03, .03, -.03, -.03], np.float32)
    for yy in np.arange(y0 + .02, y1 - .015, .05):                    # 一行行棚屋，行间是窄巷
        xx = x0 + R.uniform(0, .01)
        while xx < x1 - .015:
            w, d = R.uniform(.018, .05), R.uniform(.025, .04)
            if R.random() > .06:                                       # 偶尔空一块：水井、垃圾堆、小空地
                shacks.append((xx + w / 2, yy + R.uniform(-.004, .004), w, d, 0, R.uniform(.01, .035)))
                shc2.append(SHACK[R.integers(len(SHACK))] * R.uniform(.7, 1.2)); shr.append(R.normal(0, .05))
            xx += w + R.uniform(0, .004)
ks = keep_boxes(shacks)
shacks = [b_ for b_, k in zip(shacks, ks) if k]; shc2 = [c for c, k in zip(shc2, ks) if k]; shr = [r for r, k in zip(shr, ks) if k]
tc.box_mesh('shacks', shacks, shc2, td.corrugated_mat('shackroof', .6, .35, 1500, 1.4), rot=np.array(shr))
tick(f'slum blocks {(ZONE == 2).sum()}, shacks {len(shacks)}')

# ---------------- 储罐与管道：管道从工业区通向最近的支柱（物资顺着支柱里的货梯往上送）----------------
T_ = np.array([(x, y, 0, 0, 0, 0) for x, y in tanks_], np.float32).reshape(-1, 6); kt = keep_boxes(T_)
TK = [(x, y, 0, R.uniform(.03, .045), R.uniform(.06, .12)) for (x, y), k in zip(tanks_, kt) if k]
for i in np.where((kind == tc.K_PARK) & keep)[0]:                      # 荒掉的公园：一部分变成罐区
    if R.random() < .4:
        TK += [(B[i, 0] + dx, B[i, 1] + dy, 0, R.uniform(.035, .05), R.uniform(.06, .12)) for dx in (-.06, .06) for dy in (-.06, .06)]
tc.cyl_mesh('tanks', TK, td.city_mat('tank', .45, .01, 1.3, .5), 24)
pipes = Batch('pipes', mat('pipe', (.3, .22, .15), .5, .7), smooth=True)
def pipe_run(x0, y0, x1, y1, z, r):
    L = math.hypot(x1 - x0, y1 - y0); a = math.atan2(y1 - y0, x1 - x0)
    if L < 1e-3: return
    bmesh.ops.create_cone(pipes.bm, cap_ends=True, segments=10, radius1=r, radius2=r, depth=L,
                          matrix=Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, z)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
for i in np.where(ZONE == 1)[0]:                                       # 每个工业街坊一束管道，沿街走到最近的支柱
    x, y = (BB[i, 0] + BB[i, 2]) / 2, (BB[i, 1] + BB[i, 3]) / 2
    px, py = min(PILLARS, key=lambda p: math.hypot(p[0] - x, p[1] - y))
    yr = y + (BB[i, 3] - BB[i, 1]) / 2 + .1                             # 先沿街坊北侧的街走
    for o in (0, .018):
        pipe_run(x, yr + o, px, yr + o, .14 + o * .3, .007); pipe_run(px + o, yr, px + o, py, .15, .007)
pipes.done(); tick('tanks + pipes')

# ---------------- 货运铁路 ----------------
ballast = Batch('ballast', mat('ballast', (.17, .15, .12), .95))
rails = Batch('rails', mat('rail', (.5, .48, .45), .25, 1))
def track(x0, y0, x1, y1):
    L = math.hypot(x1 - x0, y1 - y0); a = math.atan2(y1 - y0, x1 - x0); mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    ballast.box(mx, my, 0, L, .045, .006, a)
    for o in (-.008, .008): rails.box(mx - o * math.sin(a), my + o * math.cos(a), .006, L, .0025, .003, a)
for y in RAIL_Y:
    for o in (-.04, .04): track(-W * .6, y + o, W * .6, y + o)
for x in RAIL_X:
    for o in (-.04, .04): track(x + o, -H * .6, x + o, H * .6)
cars, carc, carr = [], [], []
CARC = np.array([(.32, .12, .07), (.1, .16, .24), (.24, .23, .2), (.2, .24, .14)], np.float32)
def train(x, y, a, n):
    for k in range(n):
        cars.append((x + math.cos(a) * k * .065, y + math.sin(a) * k * .065, .06, .026, .006, .03)); carc.append(CARC[R.integers(4)] * R.uniform(.8, 1.2)); carr.append(a)
for y in RAIL_Y: train(R.uniform(-12, 8), y + .04, 0, R.integers(8, 16))
for x in RAIL_X: train(x - .04, R.uniform(-8, 4), math.pi / 2, R.integers(8, 14))

# 货运站：一片平行股道 + 集装箱 + 龙门吊
x, y = YARD
ballast.box(x, y, 0, 3.3, 1.1, .005)
for k in range(11): track(x - 1.6, y - .45 + k * .09, x + 1.6, y - .45 + k * .09)
for k in range(11):
    if R.random() < .7: train(x - 1.5 + R.uniform(0, 1.2), y - .45 + k * .09, 0, R.integers(6, 20))
crane = Batch('cranes', mat('crane', (.45, .3, .08), .5, .6))
for gx in (x - .8, x + .5):
    crane.box(gx, y, .12, .05, 1.2, .03)                             # 龙门吊横梁
    for sy in (-1, 1): crane.box(gx, y + sy * .58, 0, .06, .04, .15)
crane.done()
layer.marker('freight_yard', (x, y, 0), 1.6)
tc.box_mesh('freight_cars', cars, carc, tc.vcol_mat('carm', .6, .4), rot=np.array(carr))
ballast.done(); rails.done(); tick('rail')

# ---------------- 中层支柱的柱基 ----------------
pil = Batch('pillars', mat('pillar', (.2, .195, .19), .85))
for px, py in PILLARS:
    pil.cyl(px, py, 0, .3, .05, 48)                                 # 柱基
    pil.cyl(px, py, 0, .22, 2.5, 48)                                # 柱身（俯视只看到柱顶的圆面）
    for k in range(4): a = k * math.pi / 2 + math.pi / 4; pil.box(px + .24 * math.cos(a), py + .24 * math.sin(a), 0, .08, .08, .5, a)   # 扶壁
pil.done()

# ---------------- 光：钠灯 + 少量磷光绿 ----------------
lamp_heads, lamp_lights, extra_flood = [], [], []
for x, y, w, d, rot in tc.road_lines(city, .012):
    if rot: continue                                                 # 斜向大道在地基区没有（只是上层的路）
    L = max(w, d); ux, uy = (0, 1) if d > w else (1, 0)
    for t in np.arange(-L / 2, L / 2, .3):
        s = 1 if R.random() < .5 else -1; px, py = x + ux * t + uy * .07 * s, y + uy * t - ux * .07 * s
        if R.random() < (.85 if blackout(px, py) else .2): continue  # 坏掉的路灯；断电片区几乎全黑
        lamp_heads.append((px, py, .012, .012, .07, .073))
        if len(lamp_heads) % 2 == 0: lamp_lights.append((px, py, .09, SODIUM if R.random() < .7 else SODIUM2))   # 一半灯头投光（功率加倍补回），渲染快一倍
for px, py in PILLARS:                                               # 柱基上的一圈钠灯
    for k in range(6):
        a = k / 6 * 2 * math.pi; lamp_lights.append((px + .34 * math.cos(a), py + .34 * math.sin(a), .1, SODIUM))
        lamp_heads.append((px + .31 * math.cos(a), py + .31 * math.sin(a), .012, .012, .05, .053))
tc.box_mesh('lamp_heads', lamp_heads, np.tile(srgb('#ffc070'), (len(lamp_heads), 1)), emit_mat('lamphead', None, 6.0 * GLOW))
for i in np.where(ZONE == 1)[0]:                                       # 工业区的高杆泛光灯：偏白、更亮，成片照亮厂区
    if BB[i, 0] > 1e8 or R.random() < .3: continue
    x, y = (BB[i, 0] + BB[i, 2]) / 2 + R.uniform(-.2, .2), (BB[i, 1] + BB[i, 3]) / 2 + R.uniform(-.2, .2)
    lamp_heads.append((x, y, .02, .02, .35, .353)); extra_flood.append((x, y, .4, srgb('#ffd7a0')))
tc.point_lights('sodium', lamp_lights, LAMP * 2 * GLOW, .01)
# 棚屋区：昏暗的暖光与磷光绿（霉菌灯、黑市招牌）
glim, gdots = [], []
for x, y, w, d, z0, z1 in shacks:
    r = R.random()
    if r < .04: glim.append((x, y, z1 + .04, SODIUM2)); gdots.append((x, y, .008, .008, z1, z1 + .002, *SODIUM2))
    elif r < .055: glim.append((x, y, z1 + .04, PHOS)); gdots.append((x, y, .01, .006, z1, z1 + .002, *PHOS))
tc.point_lights('slum_light', glim, LAMP * .4 * GLOW, .01)
gd = np.array(gdots, np.float32)
tc.box_mesh('slum_dots', gd[:, :6], gd[:, 6:], emit_mat('slumdot', None, 4.0 * GLOW))
tc.point_lights('flood', extra_flood, LAMP * 6 * GLOW, .03)
tick(f'lights {len(lamp_lights) + len(glim) + len(extra_flood)}')

# ---------------- 地标 ----------------
def lamp_ring(b, x, y, z, rx, ry, n, s=.012):
    for k in range(n): a = k / n * 2 * math.pi; b.box(x + rx * math.cos(a), y + ry * math.sin(a), z, s, s, .003)
def ground(x, y, w, d, c, rot=0, z=.004):
    b = Batch('pl', mat('pl', c, .85)); b.box(x, y, 0, w, d, z, rot); return b.done()
extra_lights = []
def lights_ring(x, y, z, rx, ry, n, c):
    for k in range(n): a = k / n * 2 * math.pi; extra_lights.append((x + rx * math.cos(a), y + ry * math.sin(a), z, c))

# 7 号井黑市：中层竖井落到地面的井口 + 环形市集（摊位篷布、灯串）
x, y = WELL7
ground(x, y, 1.6, 1.6, (.08, .07, .06))
wl = Batch('well7', mat('well_metal', (.18, .18, .19), .4, .8))
wl.ring(x, y, .3, .32, .05, 2.1, 48)                                  # 竖井筒（从中层 C 区检查点垂下来，中空）
wl.box(x, y, .3, .5, .06, .04, .7); wl.box(x, y, .3, .06, .5, .04, .7)  # 井筒里的升降平台支架
wl.ring(x, y, 0, .36, .03, .08, 48)
wl.done()
stalls, stc = [], []
TARP = np.array([(.4, .12, .08), (.12, .22, .36), (.36, .3, .12), (.18, .3, .16), (.3, .3, .3)], np.float32)
for _ in range(260):
    a = R.uniform(0, 2 * math.pi); r = R.uniform(.42, .78)
    stalls.append((x + r * math.cos(a), y + r * math.sin(a), R.uniform(.025, .045), R.uniform(.02, .035), 0, R.uniform(.01, .02))); stc.append(TARP[R.integers(5)] * R.uniform(.8, 1.3))
tc.box_mesh('stalls', stalls, stc, tc.vcol_mat('tarp', .8))
wg = Batch('well_glow', emit_mat('well_sodium', SODIUM, 5.0 * GLOW)); lamp_ring(wg, x, y, 2.4, .3, .3, 16); wg.done()
# 竖井漏下来的一束冷色天光：整个下层唯一的自然光（参考米德加板下的「天窗」）
shaft = bpy.data.lights.new('shaft_sky', 'AREA'); shaft.shape = 'DISK'; shaft.size = .55; shaft.energy = 18 * GLOW * LAMP / .3
shaft.color = srgb('#cfe0ff'); so_ = bpy.data.objects.new('shaft_sky', shaft); so_.location = (x, y, 2.3); col_main.objects.link(so_)
wp = Batch('well_phos', emit_mat('well_phos', PHOS, 2.5 * GLOW))
for rr_ in (.5, .7): lamp_ring(wp, x, y, .03, rr_, rr_, 28, .008)
wp.done()
lights_ring(x, y, .1, .5, .5, 10, SODIUM); lights_ring(x, y, .1, .7, .7, 6, PHOS)
layer.marker('well7', (x, y, 0), .8)

# 血肉磨坊：椭圆形地下拳场——锈铁外壳、阶梯看台、中央沙坑；刺眼的白光照着坑
x, y = MILL
ground(x, y, 1.2, .95, (.07, .06, .05))
ml = Batch('mill', mat('mill_rust', (.26, .13, .08), .6, .6))
for k, (rx, ry, hh) in enumerate(((.5, .38, .12), (.42, .31, .09), (.36, .26, .06), (.31, .22, .04))):
    ml.ring(x, y, 0, 1, .05, hh, 56, rx, ry)                           # 外壳 + 阶梯看台
ml.done()
pit = Batch('pit', mat('pit', (.2, .09, .06), .95)); pit.cyl(0, 0, 0, 1, .006, 48); po = pit.done()
po.scale = (.27, .18, 1); po.location = (x, y, 0)                  # 中央沙坑（椭圆）
mg = Batch('mill_glow', emit_mat('mill_white', WHITE, 4.0 * GLOW)); lamp_ring(mg, x, y, .125, .5, .38, 12); mg.done()
extra_lights += [(x + dx, y + dy, .25, WHITE) for dx, dy in ((-.15, 0), (.15, 0), (0, .1), (0, -.1))]
layer.marker('blood_mill', (x, y, 0), .5)

# 执法局下层分局：围墙院落、方形主楼、车库；冷白 + 执法蓝
x, y = ENF
ground(x, y, 1.3, 1.05, (.1, .1, .1))
ef = Batch('enf_low', mat('enf_concrete', (.3, .3, .31), .75))
for sx in (-1, 1): ef.box(x + sx * .6, y, 0, .03, 1.0, .06); ef.box(x, y + sx * .5, 0, 1.2, .03, .06)
ef.box(x - .1, y + .1, 0, .6, .45, .2); ef.box(x + .38, y - .25, 0, .25, .3, .08)
for k in range(6): ef.box(x - .35 + k * .12, y - .35, 0, .07, .035, .02)   # 装甲车
ef.done()
eb = Batch('enf_blue', emit_mat('enf_blue', BLUE, 5.0 * GLOW))
for sx in (-1, 1): eb.box(x + sx * .6, y, .06, .006, .96, .002); eb.box(x, y + sx * .5, .06, 1.16, .006, .002)
eb.done()
lights_ring(x, y, .2, .55, .45, 8, WHITE)
layer.marker('enforcement_low', (x - .1, y + .1, 0), .6)

# 施粥站：半荒废的旧教堂（中殿屋顶塌了一段）+ 前院长桌与排队人流；暖光
x, y = SOUP
ground(x, y, 1.2, .9, (.1, .09, .07))
ch = Batch('soup_church', mat('church_stone', (.3, .28, .25), .8))
ch.box(x - .3, y + .1, 0, .3, .2, .14); ch.box(x + .2, y + .1, 0, .3, .2, .14)          # 中殿（中间一段塌了）
ch.box(x + .05, y + .1, 0, .1, .5, .14)                                                 # 耳堂
ch.box(x - .5, y + .1, 0, .1, .1, .26)                                                  # 钟楼
ch.done()
ground(x + .05, y + .1, .2, .2, (.04, .035, .03), z=.006)                               # 塌陷处露出的黑洞
tb = Batch('soup_tables', mat('table', (.3, .22, .14), .8))
for k in range(5): tb.box(x - .25 + k * .12, y - .22, 0, .08, .018, .012)
tb.done()
q, qc = [], []
for k in range(80): q.append((x - .45 + k * .011 + R.normal(0, .002), y - .36 + R.normal(0, .006), .006, .006, 0, .008)); qc.append((.12, .11, .1))
tc.box_mesh('queue', q, qc, tc.vcol_mat('queuem', .9))
sg = Batch('soup_glow', emit_mat('soup_warm', srgb('#ffd08a'), 4.0 * GLOW)); lamp_ring(sg, x - .05, y - .22, .03, .35, .08, 10); sg.done()
lights_ring(x - .05, y - .22, .12, .3, .1, 5, srgb('#ffd08a'))
layer.marker('soup_kitchen', (x, y + .05, 0), .55)

# 防卫军前沿哨所：沙袋墙、四角岗楼、车辆与停机坪；白色探照灯
x, y = OUTPOST
ground(x, y, 1.4, 1.2, (.1, .1, .085))
op = Batch('outpost', mat('outpost_olive', (.16, .18, .12), .8))
for sx in (-1, 1): op.box(x + sx * .6, y, 0, .05, 1.05, .05); op.box(x, y + sx * .52, 0, 1.2, .05, .05)
for sx in (-1, 1):
    for sy in (-1, 1): op.box(x + sx * .6, y + sy * .52, 0, .09, .09, .16)
for k in range(3): op.box(x - .25 + k * .22, y + .22, 0, .16, .3, .06)                # 营房
for k in range(5): op.box(x - .3 + k * .1, y - .25, 0, .07, .035, .025)
op.done()
pad = Batch('outpost_pad', mat('pad', (.25, .25, .24), .7)); pad.cyl(x + .35, y - .2, 0, .12, .008, 32); pad.done()
ow = Batch('outpost_glow', emit_mat('outpost_white', WHITE, 5.0 * GLOW))
for sx in (-1, 1):
    for sy in (-1, 1): ow.box(x + sx * .6, y + sy * .52, .16, .03, .03, .003)
ow.ring(x + .35, y - .2, .008, .12, .006, .002, 24); ow.done()
extra_lights += [(x + sx * .55, y + sy * .47, .3, WHITE) for sx in (-1, 1) for sy in (-1, 1)]
layer.marker('outpost', (x, y, 0), .7)

# 资产管理委员会下层设施：有围墙的大型管理设施——只做中性的建筑外观
x, y = AMC
ground(x, y, 2.4, 1.7, (.12, .12, .12))
am = Batch('amc', mat('amc_concrete', (.34, .34, .35), .7))
for sx in (-1, 1): am.box(x + sx * 1.15, y, 0, .04, 1.62, .1); am.box(x, y + sx * .8, 0, 2.3, .04, .1)
am.box(x - .35, y + .15, 0, 1.0, .7, .22); am.box(x + .6, y + .2, 0, .6, .5, .16); am.box(x + .55, y - .45, 0, .7, .3, .12)
am.box(x - .45, y - .5, 0, .8, .2, .1)
am.done()
aw = Batch('amc_glow', emit_mat('amc_white', WHITE, 4.0 * GLOW))
for t in np.linspace(-1.1, 1.1, 16): aw.box(x + t, y + .8, .1, .015, .015, .003); aw.box(x + t, y - .8, .1, .015, .015, .003)
for t in np.linspace(-.75, .75, 10): aw.box(x + 1.15, y + t, .1, .015, .015, .003); aw.box(x - 1.15, y + t, .1, .015, .015, .003)
aw.done()
extra_lights += [(x + t, y + s * .85, .2, WHITE) for t in np.linspace(-1, 1, 6) for s in (-1, 1)]
layer.marker('amc_facility', (x - .1, y + .1, 0), 1.2)

# 货运站的照明塔
x, y = YARD
yl = Batch('yard_glow', emit_mat('yard_sodium', SODIUM, 5.0 * GLOW))
for gx in np.linspace(x - 1.4, x + 1.4, 6):
    for sy in (-1, 1): yl.box(gx, y + sy * .52, .3, .03, .03, .003); extra_lights.append((gx, y + sy * .5, .35, SODIUM))
yl.done()
tc.point_lights('landmark_light', extra_lights, LAMP * 2.5 * GLOW, .02)
tick('landmarks')

# ---------------- 环境：几乎没有天光（中层底面反射下来的一点暗橙）----------------
layer.finish(world=((.5, .38, .25), layer.f('--ambient', .12)), glare_opts=dict(threshold=.9, size=6, mix=-.7))
