# 天城 · 下层（地基区，地面）· Blender 正俯视写实渲染（夜景草稿）
# 用法：Blender -b -P tiancheng_low.py -- [--res 1600] [--samples 64] [--out path.png] [--crop x0,y0,x1,y1] [--preview] [--data-only]
#       [--glow 1]（发光体倍数）[--lamp .3]（钠灯功率）[--ambient .12]（天光）
#       或 python3 tiancheng_low.py -- ...（pip 装的 bpy）。参数与导出格式三层一致，见 docs/tiancheng-maps.md
# 与上层、中层同一相机、同一平面坐标、同一套 OSM 路网与建筑轮廓（tc_city，© OpenStreetMap contributors）：
# 楼的轮廓沿用，只压低高度、按片区换成厂房 / 旧楼；贫民窟里的楼轮廓内塞满铁皮棚屋。
# 设定：「工厂、资源处理设施」「老旧地面轨道、货运通道、步行为主」「几乎没有自然光，黑市与帮派活跃」。
# 光：几乎没有天光；钠灯橙黄点光为主，少量磷光绿。头顶是中层结构，巨大支柱的柱基均匀分布。
import bpy, bmesh, math, os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tc_common as tc
from tc_common import W, H, Z_GROUND as ZG, tick, mat, emit_mat, Batch
import numpy as np
from mathutils import Matrix
from mathutils.kdtree import KDTree

layer = tc.Layer('tc_low', seed=9001, bounces=4, city='low')   # 城市在这里生成（第一个随机调用）：街道位置与上层、中层一致
sc, col_main, city, R, GLOW, LAMP = layer.sc, layer.col, layer.city, layer.rng, layer.f('--glow', 1), layer.f('--lamp', .3)

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)
SODIUM, SODIUM2, PHOS, WHITE, BLUE, RED = srgb('#f0a040'), srgb('#ff8c2a'), srgb('#9fe870'), srgb('#e8eeff'), srgb('#5a8cff'), srgb('#ff3a2a')
import tc_detail as td, tc_city
from tc_city import CAR, point_in_poly

# ---------------- 地标位置（全部为推断）----------------
WELL7 = (4.6, -6.9)          # 7 号井黑市：正对中层 C 区检查点的竖井下方
MILL = (-5.8, -3.3)          # 黑拳场「血肉磨坊」
ENF = (-1.8, 3.1)            # 执法局下层分局（名义六个、实际运转三个；只画一个）
SOUP = (8.4, .5)             # 圣光教会施粥站（下层教区的旧教堂）
OUTPOST = (-12.3, -6.6)      # 防卫军前沿哨所
AMC = (10.6, 5.6)            # 资产管理委员会下层设施：只画有围墙的大型管理设施（中性外观）
# 铁路：取 OSM 的地面铁路；货运站放在铁路上离 7 号井不远的一段（「老旧地面轨道、货运通道」）
RP = np.concatenate(city.rail) if city.rail else np.array([[-2.5, -7.8], [0, -7.2]], np.float32)
yi = int(np.argmin(np.hypot(RP[:, 0] + 9.0, RP[:, 1] - 5.0))); YARD = (float(RP[yi, 0]), float(RP[yi, 1]))   # 工业带（鲁尔区）的铁路编组场附近
nb_ = RP[max(0, yi - 3):yi + 4]; YROT = math.atan2(nb_[-1, 1] - nb_[0, 1], nb_[-1, 0] - nb_[0, 0]) if len(nb_) > 1 else 0.0
# 巨大支柱：均匀网格（约 300 m 间距），避开地标
PILLARS = [(float(px), float(py)) for px in np.arange(-13.5, 13.6, 3.0) for py in np.arange(-7.5, 7.6, 3.0)]
LM = [(*WELL7, .85, .85), (*MILL, .7, .55), (*ENF, .75, .6), (*SOUP, .7, .55), (*OUTPOST, .8, .7), (*AMC, 1.25, .9), (*YARD, 1.7, 1.7)]
PILLARS = [p for p in PILLARS if all(((p[0] - x) / (rx + .4)) ** 2 + ((p[1] - y) / (ry + .4)) ** 2 > 1 for x, y, rx, ry in LM)]
def in_yard(x, y):                                                     # 货运站：沿铁路方向的长方形
    c, s_ = math.cos(YROT), math.sin(YROT); u = (x - YARD[0]) * c + (y - YARD[1]) * s_; v = -(x - YARD[0]) * s_ + (y - YARD[1]) * c
    return abs(u) < 1.7 and abs(v) < .6
kd_rail = KDTree(max(1, len(RP)))
for i_, (x, y) in enumerate(RP): kd_rail.insert((x, y, 0), i_)
kd_rail.balance()
def on_rail(x, y): return len(RP) > 0 and kd_rail.find((x, y, 0))[2] < .06
zones = [z for z in LM if z[:2] != YARD] + [(px, py, .34, .34) for px, py in PILLARS] + [in_yard, on_rail]
city.clip_roads(zones)
keep = city.keep(zones)

# ---------------- 片区：按参考城市分（tc_city.DISTRICTS['low']）----------------
# 工业带（鲁尔区）：大轮廓 → 厂房，小轮廓 → 工人住宅（旧城）；城中村（深圳 + 九龙城寨的密度）：握手楼，屋顶极密
def blackout(x, y): return math.sin(x * .41 + 2.1) * math.cos(y * .37 + .4) + .4 * math.sin(x * .9 - y * .7) > .75   # 断电的片区
ZONE = np.array([2 if b['dk'] == 'village' else 1 if b['a'] > .015 else 0 for b in city.b], np.int8)   # 0 工人住宅 1 厂房 2 城中村

# 地面：水泥与泥地；路面沥青；荒掉的公园是泥地；水面发黑
tc.road_plane((.075, .07, .065), z=0, m=td.city_mat('lowground', .9, ao=.02, grime=1.4))
city.flat_polys('water', city.water, .002, (.01, .012, .012), mat('water_l', (.01, .012, .012), .1, spec=.6))
city.flat_polys('mud', city.parks, .002, (.09, .075, .05), td.city_mat('mud', .95, .01, 1.5))
city.roads_mesh('roads', .004, td.asphalt_mat('road', (.035, .033, .03), 1.3))

# 旧城：沿用 OSM 轮廓，高度压到 3–25 m；女儿墙、坡顶、设备
old = np.where(keep & (ZONE == 0))[0]
h_old = np.array([city.b[i]['h'] for i in old], np.float32); top_old = .03 + .22 * np.clip(h_old / 80, 0, 1) ** 1.2
OLD = np.array([(.22, .2, .18), (.18, .17, .16), (.26, .22, .18), (.2, .19, .2), (.28, .16, .1)], np.float32)   # 水泥、焦油、锈红
c_old = OLD[R.integers(len(OLD), size=len(old))] * R.uniform(.75, 1.15, (len(old), 1))
omat = td.city_mat('oldcity', .8, grime=1.5)
city.buildings_mesh('buildings', old, 0, top_old, c_old, omat)
kit = tc_city.roof_kit(city, old, top_old, c_old, R, 'low', cap=.3, zbase=0)
tc_city.build_roof_kit('old', kit, omat, td.corrugated_mat('oldroof', .7, .2, 1400), prism_fn=td.prism_mesh)

# 工业区：同一轮廓的低矮大厂房（锯齿采光带、波纹钢板），院子里有储罐
ind = np.where(keep & (ZONE == 1))[0]
top_ind = R.uniform(.07, .16, len(ind)).astype(np.float32)
METAL = np.array([(.3, .3, .3), (.24, .25, .26), (.34, .26, .18), (.2, .21, .2), (.28, .2, .14)], np.float32)
c_ind = METAL[R.integers(len(METAL), size=len(ind))] * R.uniform(.85, 1.1, (len(ind), 1))
city.buildings_mesh('sheds', ind, 0, top_ind, c_ind, td.corrugated_mat('shedroof', .5, .5, 1100, 1.2))
sky, skr, TK = [], [], []
for i, t in zip(ind, top_ind):
    x, y, w, d, rot = city.b[i]['obb']
    if w * d < .004: continue
    u = (math.cos(rot), math.sin(rot))
    for k in np.arange(-w / 2 + .02, w / 2 - .01, .028): sky.append((x + u[0] * k, y + u[1] * k, .007, d * .85, t, t + .005)); skr.append(rot)
    if R.random() < .25:                                               # 厂房旁的储罐
        v = (-u[1], u[0]); o = d / 2 + .05
        for k in range(int(R.integers(1, 4))): TK.append((x + v[0] * o + u[0] * (k - 1) * .08, y + v[1] * o + u[1] * (k - 1) * .08, 0, R.uniform(.025, .04), R.uniform(.05, .1)))
tc.box_mesh('skylights', sky, np.tile((.4, .42, .42), (len(sky), 1)), tc.vcol_mat('skym', .15, .6), rot=np.array(skr, np.float32))
tick(f'old buildings {len(old)}, industrial sheds {len(ind)}')

# 城中村：握手楼的轮廓挤出（压低到 6–18 m），屋顶极密——水箱、搭出来的铁皮房、蓝色篷布；七号井一带按九龙城寨的密度更高、更乱
vil = np.where(keep & (ZONE == 2))[0]
VIL = np.array([(.3, .29, .27), (.24, .23, .22), (.34, .3, .26), (.28, .16, .1), (.2, .21, .22)], np.float32)   # 水泥、瓷砖、锈、深灰
top_v = np.array([(.1 if city.b[i].get('dense') else .06) + city.b[i]['h'] / 45 * .08 for i in vil], np.float32)
c_v = VIL[R.integers(len(VIL), size=len(vil))] * R.uniform(.75, 1.15, (len(vil), 1))
city.buildings_mesh('village', vil, 0, top_v, c_v, td.city_mat('villagemat', .85, .012, 1.6))
SHACK = np.array([(.3, .14, .08), (.36, .2, .12), (.1, .16, .26), (.3, .3, .28), (.22, .2, .17), (.16, .2, .12)], np.float32)
shacks, shc2, shr, vtanks = [], [], [], []
for i, t in zip(vil, top_v):
    b = city.b[i]; x, y, w, d, rot = b['obb']; cs, sn = math.cos(rot), math.sin(rot)
    for _ in range(int(R.integers(1, 5 if b.get('dense') else 3))):        # 屋顶加建的铁皮房、篷布
        u, v = R.uniform(-.3, .3) * w, R.uniform(-.3, .3) * d; sw, sd = R.uniform(.02, .05), R.uniform(.02, .04)
        shacks.append((x + u * cs - v * sn, y + u * sn + v * cs, sw, sd, t, t + R.uniform(.006, .02))); shc2.append(SHACK[R.integers(len(SHACK))] * R.uniform(.7, 1.2)); shr.append(rot + R.normal(0, .08))
    if R.random() < .6: vtanks.append((x + R.uniform(-.3, .3) * w, y + R.uniform(-.3, .3) * d, t, .008, .012))   # 屋顶水箱
tc.box_mesh('shacks', shacks, shc2, td.corrugated_mat('shackroof', .6, .35, 1500, 1.4), rot=np.array(shr, np.float32))
tc.cyl_mesh('roof_tanks', vtanks, td.city_mat('rooftank', .5, .004, 1.2, .4), 10)
tick(f'village: {len(vil)} buildings, {len(shacks)} rooftop shacks, {len(vtanks)} water tanks')

# ---------------- 储罐与管道：管道从工业区通向最近的支柱（物资顺着支柱里的货梯往上送）----------------
for P in city.parks:                                                   # 荒掉的公园：一部分变成罐区
    if R.random() < .3 and abs(tc_city.poly_area(P)) > .02:
        cx, cy = P.mean(0)
        for dx in (-.06, .06):
            for dy in (-.06, .06):
                if point_in_poly(cx + dx, cy + dy, P): TK.append((cx + dx, cy + dy, 0, R.uniform(.035, .05), R.uniform(.06, .12)))
for P in city.tanks:                                                   # OSM 里标出来的储罐 / 筒仓（鲁尔区）
    cx, cy = P.mean(0); TK.append((float(cx), float(cy), 0, float(np.hypot(*(P - (cx, cy)).T).mean()), float(R.uniform(.12, .25))))
tc.cyl_mesh('tanks', TK, td.city_mat('tank', .45, .01, 1.3, .5), 24)
pipes = Batch('pipes', mat('pipe', (.3, .22, .15), .5, .7), smooth=True)
def pipe_run(x0, y0, x1, y1, z, r):
    L = math.hypot(x1 - x0, y1 - y0); a = math.atan2(y1 - y0, x1 - x0)
    if L < 1e-3: return
    bmesh.ops.create_cone(pipes.bm, cap_ends=True, segments=10, radius1=r, radius2=r, depth=L,
                          matrix=Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, z)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
for i in ind[::4]:                                                     # 每四座厂房一束管道，走到最近的支柱
    x, y = city.b[i]['cx'], city.b[i]['cy']; px, py = min(PILLARS, key=lambda p: math.hypot(p[0] - x, p[1] - y))
    for o in (0, .018): pipe_run(x, y + o, px, y + o, .17 + o * .3, .007); pipe_run(px + o, y, px + o, py, .18, .007)
pipes.done(); tick(f'tanks {len(TK)} + pipes')

# ---------------- 货运铁路：OSM 地面铁路 + 货运站 ----------------
ballast = Batch('ballast', mat('ballast', (.17, .15, .12), .95))
rails = Batch('rails', mat('rail', (.5, .48, .45), .25, 1))
def track(x0, y0, x1, y1):
    L = math.hypot(x1 - x0, y1 - y0); a = math.atan2(y1 - y0, x1 - x0); mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    if L < 1e-4: return
    ballast.box(mx, my, 0, L * 1.02, .045, .006, a)
    for o in (-.008, .008): rails.box(mx - o * math.sin(a), my + o * math.cos(a), .006, L * 1.02, .0025, .003, a)
cars, carc, carr = [], [], []
CARC = np.array([(.32, .12, .07), (.1, .16, .24), (.24, .23, .2), (.2, .24, .14)], np.float32)
for P in city.rail:
    for a_, b_ in zip(P[:-1], P[1:]): track(a_[0], a_[1], b_[0], b_[1])
    if len(P) > 4 and R.random() < .5:                                 # 一列停着的货车
        k0 = int(R.integers(0, len(P) - 3))
        for a_, b_ in zip(P[k0:k0 + 3], P[k0 + 1:k0 + 4]):
            L = math.hypot(*(b_ - a_)); ang = math.atan2(b_[1] - a_[1], b_[0] - a_[0])
            for t in np.arange(0, L, .065): cars.append((a_[0] + math.cos(ang) * t, a_[1] + math.sin(ang) * t, .06, .026, .006, .03)); carc.append(CARC[R.integers(4)] * R.uniform(.8, 1.2)); carr.append(ang)
# 货运站：沿铁路方向的一片平行股道 + 集装箱 + 龙门吊
x, y = YARD; cu, su = math.cos(YROT), math.sin(YROT)
at = lambda u, v: (x + u * cu - v * su, y + u * su + v * cu)
ballast.box(x, y, 0, 3.3, 1.1, .005, YROT)
for k in range(11):
    v = -.45 + k * .09; track(*at(-1.6, v), *at(1.6, v))
    if R.random() < .7:
        u0 = R.uniform(-1.5, .3)
        for j in range(int(R.integers(6, 20))): cars.append((*at(u0 + j * .065, v), .06, .026, .006, .03)); carc.append(CARC[R.integers(4)] * R.uniform(.8, 1.2)); carr.append(YROT)
crane = Batch('cranes', mat('crane', (.45, .3, .08), .5, .6))
for gu in (-.8, .5):
    crane.box(*at(gu, 0), .12, .05, 1.2, .03, YROT)                  # 龙门吊横梁
    for sv in (-1, 1): crane.box(*at(gu, sv * .58), 0, .06, .04, .15, YROT)
crane.done()
layer.marker('freight_yard', (x, y, 0), 1.6)
tc.box_mesh('freight_cars', cars, carc, tc.vcol_mat('carm', .6, .4), rot=np.array(carr, np.float32))
ballast.done(); rails.done(); tick('rail')

# ---------------- 中层支柱的柱基 ----------------
tc.cyl_mesh('pillar_base', [(px, py, 0, .3, .05) for px, py in PILLARS], td.city_mat('pillar0', .85, .02, 1.2), 48)
tc.cyl_mesh('pillars', [(px, py, 0, .22, 2.5) for px, py in PILLARS], td.city_mat('pillar', .85, .02, 1.2), 48)   # 柱身（俯视只看到柱顶的圆面）
pil = Batch('pillar_buttress', mat('pillarb', (.2, .195, .19), .85))
for px, py in PILLARS:
    for k in range(4): a = k * math.pi / 2 + math.pi / 4; pil.box(px + .24 * math.cos(a), py + .24 * math.sin(a), 0, .08, .08, .5, a)   # 扶壁
pil.done()

# ---------------- 光：钠灯 + 少量磷光绿 ----------------
lamp_heads, lamp_lights, extra_flood = [], [], []
for x, y, ang, c, w in city.along(.3, CAR - {'service'}, side_offset=.008, both=False):
    if R.random() < (.85 if blackout(x, y) else .2): continue          # 坏掉的路灯；断电片区几乎全黑
    lamp_heads.append((x, y, .012, .012, .07, .073))
    if len(lamp_heads) % 2 == 0: lamp_lights.append((x, y, .09, SODIUM if R.random() < .7 else SODIUM2))   # 一半灯头投光（功率加倍补回）
for px, py in PILLARS:                                               # 柱基上的一圈钠灯
    for k in range(6):
        a = k / 6 * 2 * math.pi; lamp_lights.append((px + .34 * math.cos(a), py + .34 * math.sin(a), .1, SODIUM))
        lamp_heads.append((px + .31 * math.cos(a), py + .31 * math.sin(a), .012, .012, .05, .053))
for i in ind:                                                          # 工业区的高杆泛光灯：偏白、更亮，成片照亮厂区
    if R.random() < .7: continue
    b = city.b[i]; x, y = b['cx'] + R.uniform(-.1, .1), b['cy'] + R.uniform(-.1, .1)
    lamp_heads.append((x, y, .02, .02, .35, .353)); extra_flood.append((x, y, .4, srgb('#ffd7a0')))
tc.box_mesh('lamp_heads', lamp_heads, np.tile(srgb('#ffc070'), (len(lamp_heads), 1)), emit_mat('lamphead', None, 6.0 * GLOW))
tc.point_lights('sodium', lamp_lights, LAMP * 2 * GLOW, .01)
# 棚屋区：昏暗的暖光与磷光绿（霉菌灯、黑市招牌）
glim, gdots = [], []
for x, y, w, d, z0, z1 in shacks:
    r = R.random()
    if r < .04: glim.append((x, y, z1 + .04, SODIUM2)); gdots.append((x, y, .008, .008, z1, z1 + .002, *SODIUM2))
    elif r < .055: glim.append((x, y, z1 + .04, PHOS)); gdots.append((x, y, .01, .006, z1, z1 + .002, *PHOS))
tc.point_lights('slum_light', glim, LAMP * .4 * GLOW, .01)
gd = np.array(gdots, np.float32).reshape(-1, 9)
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
stalls, stc, strot = [], [], []
TARP = np.array([(.4, .12, .08), (.12, .22, .36), (.36, .3, .12), (.18, .3, .16), (.3, .3, .3)], np.float32)
for rr_ in np.arange(.43, .8, .065):                                    # 一圈圈摊位，圈与圈之间是走道；每隔一段留一条放射状通道
    n_ = int(2 * math.pi * rr_ / .034)
    for k in range(n_):
        a = k / n_ * 2 * math.pi
        if (k % 14) in (0, 1): continue
        if R.random() < .08: continue
        stalls.append((x + rr_ * math.cos(a), y + rr_ * math.sin(a), R.uniform(.026, .032), R.uniform(.03, .042), 0, R.uniform(.01, .018)))
        stc.append(TARP[R.integers(5)] * R.uniform(.8, 1.3)); strot.append(a)
tc.box_mesh('stalls', stalls, stc, td.city_mat('tarp', .85, .008, 1.2), rot=np.array(strot))
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
for gu in np.linspace(-1.4, 1.4, 6):                                    # 沿铁路方向两排
    for sv in (-1, 1):
        px, py = at(gu, sv * .52); yl.box(px, py, .3, .03, .03, .003, YROT); extra_lights.append((*at(gu, sv * .5), .35, SODIUM))
yl.done()
tc.point_lights('landmark_light', extra_lights, LAMP * 2.5 * GLOW, .02)
tick('landmarks')

# ---------------- 环境：几乎没有天光（中层底面反射下来的一点暗橙）----------------
layer.finish(world=((.5, .38, .25), layer.f('--ambient', .12)), glare_opts=dict(threshold=.9, size=6, mix=-.7))
