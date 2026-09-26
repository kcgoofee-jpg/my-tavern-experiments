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
# 巨大支柱：约 300 m 间距的网格打乱排列（工程上按承重就近落在街坊里，不是一排排圆点），偶尔缺一根（由相邻的加粗柱分担）
# 用单独的随机序列，不消耗城市与本层的随机
_prng = np.random.default_rng(3301)
PILLARS, PIL_R = [], []
for px in np.arange(-13.5, 13.6, 3.0):
    for py in np.arange(-7.5, 7.6, 3.0):
        jx, jy, drop, rr = _prng.uniform(-.75, .75), _prng.uniform(-.6, .6), _prng.random(), _prng.uniform(.8, 1.25)
        if drop < .14: continue
        PILLARS.append((float(px + jx), float(py + jy))); PIL_R.append(float(rr))
LM = [(*WELL7, .6, .6), (*MILL, .7, .55), (*ENF, .75, .6), (*SOUP, .7, .55), (*OUTPOST, .8, .7), (*AMC, 1.25, .9), (*YARD, 1.7, 1.7)]
_ok = [all(((p[0] - x) / (rx + .4)) ** 2 + ((p[1] - y) / (ry + .4)) ** 2 > 1 for x, y, rx, ry in LM) for p in PILLARS]
PILLARS = [p for p, k in zip(PILLARS, _ok) if k]; PIL_R = [r for r, k in zip(PIL_R, _ok) if k]
def in_yard(x, y):                                                     # 货运站：沿铁路方向的长方形
    c, s_ = math.cos(YROT), math.sin(YROT); u = (x - YARD[0]) * c + (y - YARD[1]) * s_; v = -(x - YARD[0]) * s_ + (y - YARD[1]) * c
    return abs(u) < 1.7 and abs(v) < .6
kd_rail = KDTree(max(1, len(RP)))
for i_, (x, y) in enumerate(RP): kd_rail.insert((x, y, 0), i_)
kd_rail.balance()
def on_rail(x, y): return len(RP) > 0 and kd_rail.find((x, y, 0))[2] < .06
zones = [z for z in LM if z[:2] != YARD] + [(px, py, .26, .26) for px, py in PILLARS] + [in_yard, on_rail]
city.clip_roads(zones)
keep = city.keep(zones)

# ---------------- 片区：按参考城市分（tc_city.DISTRICTS['low']）----------------
# 工业带（鲁尔区）：大轮廓 → 厂房，小轮廓 → 工人住宅（旧城）；城中村（深圳 + 九龙城寨的密度）：握手楼，屋顶极密
def blackout(x, y): return math.sin(x * .41 + 2.1) * math.cos(y * .37 + .4) + .4 * math.sin(x * .9 - y * .7) > 1.0   # 断电的片区
def _ss(t): t = min(1, max(0, t)); return t * t * (3 - 2 * t)
SEAM = tc_city.low_seam_x
def vf(x, y): return _ss((x - SEAM(y)) / .75)                         # 工业带 → 城中村的交界（起伏的一条线，tc_city.low_seam_x）：城中村一侧 75 m 内由疏到密
ZONE = np.array([2 if b['dk'] == 'village' else 1 if b['a'] > .015 else 0 for b in city.b], np.int8)   # 0 工人住宅 1 厂房 2 城中村

# 地面：水泥与泥地；路面沥青；荒掉的公园是泥地；水面发黑
tc.road_plane((.075, .07, .065), z=0, m=td.city_mat('lowground', .9, ao=.02, grime=1.4))
city.flat_polys('water', city.water, .002, (.01, .012, .012), mat('water_l', (.01, .012, .012), .1, spec=.6))
city.flat_polys('mud', city.parks, .002, (.09, .075, .05), td.city_mat('mud', .95, .01, 1.5))
city.flat_polys('ind_yard', city.industrial, .0015, (.13, .12, .1), td.city_mat('indyard', .9, .01, 1.6))   # 工业用地：混凝土 / 碎石场地
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
top_v = np.array([((.1 if city.b[i].get('dense') else .06) + city.b[i]['h'] / 45 * .08) * (.4 + .6 * vf(city.b[i]['cx'], city.b[i]['cy'])) for i in vil], np.float32)
c_v = VIL[R.integers(len(VIL), size=len(vil))] * R.uniform(.75, 1.15, (len(vil), 1))
city.buildings_mesh('village', vil, 0, top_v, c_v, td.city_mat('villagemat', .85, .012, 1.6))
SHACK = np.array([(.3, .14, .08), (.36, .2, .12), (.1, .16, .26), (.3, .3, .28), (.22, .2, .17), (.16, .2, .12)], np.float32)
shacks, shc2, shr, vtanks = [], [], [], []
for i, t in zip(vil, top_v):
    b = city.b[i]; x, y, w, d, rot = b['obb']; cs, sn = math.cos(rot), math.sin(rot)
    for _ in range(int(round(int(R.integers(1, 5 if b.get('dense') else 3)) * (.4 + .6 * vf(x, y))))):   # 屋顶加建的铁皮房、篷布（交界处少）
        u, v = R.uniform(-.3, .3) * w, R.uniform(-.3, .3) * d; sw, sd = R.uniform(.02, .05), R.uniform(.02, .04)
        shacks.append((x + u * cs - v * sn, y + u * sn + v * cs, sw, sd, t, t + R.uniform(.006, .02))); shc2.append(SHACK[R.integers(len(SHACK))] * R.uniform(.7, 1.2)); shr.append(rot + R.normal(0, .08))
    if R.random() < .6: vtanks.append((x + R.uniform(-.3, .3) * w, y + R.uniform(-.3, .3) * d, t, .008, .012))   # 屋顶水箱
tc.box_mesh('shacks', shacks, shc2, td.corrugated_mat('shackroof', .6, .35, 1500, 1.4), rot=np.array(shr, np.float32))
tc.cyl_mesh('roof_tanks', vtanks, td.city_mat('rooftank', .5, .004, 1.2, .4), 10, colors=(.3, .3, .3))
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
_crng = np.random.default_rng(3302)                                    # 储罐颜色的浮动：单独的随机，不动 R
TKC = np.array([(.36, .34, .31), (.42, .4, .37), (.3, .22, .16), (.22, .23, .22), (.33, .3, .22)], np.float32)   # 水泥灰、旧白漆、锈、深灰、褪色土黄
TKC = TKC * .8 + TKC.mean(1, keepdims=True) * .2                        # 再压低 20% 饱和
TK = [(x_ + _crng.normal(0, .007), y_ + _crng.normal(0, .007), z_, r_ * _crng.uniform(.85, 1.12), h_ * _crng.uniform(.8, 1.15)) for x_, y_, z_, r_, h_ in TK]   # 位置、尺寸不齐
tc.cyl_mesh('tanks', TK, td.city_mat('tank', .5, .012, 2.2, .45), 24, colors=TKC[_crng.integers(len(TKC), size=len(TK))] * _crng.uniform(.6, 1.1, (len(TK), 1)))
pipes = Batch('pipes', mat('pipe', (.24, .18, .12), .55, .6), smooth=True)   # 暗锈色：夜里只在灯下看得出，不成一条条亮线
pipe_lamps = []
def pipe_run(x0, y0, x1, y1, z, r):
    L = math.hypot(x1 - x0, y1 - y0); a = math.atan2(y1 - y0, x1 - x0)
    if L < 1e-3: return
    bmesh.ops.create_cone(pipes.bm, cap_ends=True, segments=10, radius1=r, radius2=r, depth=L,
                          matrix=Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, z)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
for i in ind[::4]:                                                     # 每四座厂房一束管道，走到最近的支柱
    x, y = city.b[i]['cx'], city.b[i]['cy']; px, py = min(PILLARS, key=lambda p: math.hypot(p[0] - x, p[1] - y))
    for o in (0, .036): pipe_run(x, y + o, px, y + o, .17 + o * .3, .016); pipe_run(px + o, y, px + o, py, .18, .016)
    for x0, y0, x1, y1, ox, oy in ((x, y, px, y, 0, .018), (px, y, px, py, .018, 0)):   # 沿管线每 40 m 一盏低功率钠灯：物资往支柱汇聚的线
        L = math.hypot(x1 - x0, y1 - y0)
        for t in np.arange(.3, L, .8)[::2]: pipe_lamps.append((x0 + (x1 - x0) * t / L + ox, y0 + (y1 - y0) * t / L + oy, .23, SODIUM2))
tick(f'tanks {len(TK)} + pipes')                                        # pipes 在「工业带的边角」一节里补上皮带廊后才生成

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
CARC = CARC * .8 + CARC.mean(1, keepdims=True) * .2                   # 货车：压低 20% 饱和（锈、褪色的漆）
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
# 俯视是剖切图：柱身在中层底板处截断，只画 16–22 m 高的柱基段。柱基是方形的混凝土墩，朝向跟最近的楼走，顶上搭着机房、水箱、铁皮房，
# 混在街坊里，不是一个个圆点。新增的随机都接在 _prng 之后，不动 R。
kd_b = KDTree(max(1, len(city.b)))
for i_, b_ in enumerate(city.b): kd_b.insert((b_['cx'], b_['cy'], 0), i_)
kd_b.balance()
pb, pbc, pbr, pk, pkc, pkr, PIL_TOP = [], [], [], [], [], [], []
for (px, py), r in zip(PILLARS, PIL_R):
    _, bi, _ = kd_b.find((px, py, 0)); rot = city.b[bi]['obb'][4] if bi is not None else 0.0
    w, d, top = .44 * r, .38 * r, float(_prng.uniform(.16, .22)); cs, sn = math.cos(rot), math.sin(rot)
    pb.append((px, py, w, d, 0, top)); pbc.append(OLD[_prng.integers(len(OLD))] * .9); pbr.append(rot); PIL_TOP.append((rot, w, d, top))
    for _ in range(int(_prng.integers(4, 9))):                         # 柱顶的机房 / 水箱 / 铁皮房
        u, v = _prng.uniform(-.38, .38) * w, _prng.uniform(-.38, .38) * d; sw, sd = _prng.uniform(.02, .05), _prng.uniform(.02, .05)
        pk.append((px + u * cs - v * sn, py + u * sn + v * cs, sw, sd, top, top + _prng.uniform(.006, .02))); pkc.append(SHACK[_prng.integers(len(SHACK))] * _prng.uniform(.7, 1.2)); pkr.append(rot + _prng.normal(0, .08))
tc.box_mesh('pillars', pb, pbc, omat, rot=np.array(pbr, np.float32))
tc.box_mesh('pillar_roof', pk, pkc, td.corrugated_mat('pillarroof', .6, .35, 1500, 1.4), rot=np.array(pkr, np.float32))

# ---------------- 工业带的边角：交界缓冲带、空地上的堆场与工棚、高炉 ----------------
# 1) 交界缓冲带：工业带一侧离交界 130 m 以内，空地上是低矮的仓棚、堆场、临时工棚——离交界越近越密，和城中村的疏密接上，不留一条黑缝。
# 2) 工业带其他空地：稀疏的集装箱堆、废料堆、拖车和少量工棚，有几盏工作灯；断电片区里是烧桶的火光——暗，但有东西。
# 3) 钢厂：最大的厂房旁边一组高炉（炉身 + 热风炉 + 除尘器）、几根烟囱，出铁场的橙光；皮带廊通向最近的支柱（物资向上）。
# 全部用单独的随机（9102），不动 R；边界用 SEAM（确定性的正弦线）。
_frng = np.random.default_rng(9102)
kd_road = city.road_kd(CAR)
def in_bldg(x, y, pad=.02, reach=2.2):
    for co_, bi, dd in kd_b.find_range((x, y, 0), reach):             # reach 要够大：大厂房的中心离得远，轮廓却可能盖到这里
        b_ = city.b[bi]; ow, od = b_['obb'][2], b_['obb'][3]
        if dd < max(ow, od) / 2 + pad and (dd < min(ow, od) / 2 + pad or point_in_poly(x, y, b_['p'])): return True
    return False
def in_zone(x, y):
    for z in zones:
        if callable(z):
            if z(x, y): return True
        elif ((x - z[0]) / z[2]) ** 2 + ((y - z[1]) / z[3]) ** 2 < 1: return True
    return False
def grid_rot(x, y):
    _, bi, _ = kd_b.find((x, y, 0)); return city.b[bi]['obb'][4] if bi is not None else 0.0
F_BOX, F_COL, F_ROT, F_SHK, F_SHC, F_SHR = [], [], [], [], [], []   # 仓棚 / 集装箱 / 废料（金属材质）；工棚（铁皮）
f_lamp, f_fire, f_work, f_heads = [], [], [], []
CONT = np.array([(.3, .16, .1), (.14, .19, .25), (.27, .26, .23), (.2, .24, .17), (.32, .27, .15)], np.float32) * .85 + .04   # 集装箱：锈红、褪色蓝、灰、军绿、土黄（压低饱和）
def put(lst_b, lst_c, lst_r, x, y, w, d, z0, z1, rot, c): lst_b.append((x, y, w, d, z0, z1)); lst_c.append(c); lst_r.append(rot)
def lot(x, y, kind, rot):
    cs, sn = math.cos(rot), math.sin(rot); at_ = lambda u, v: (x + u * cs - v * sn, y + u * sn + v * cs)
    if kind == 'shed':                                                  # 低矮仓棚（波纹钢板）
        w, d = _frng.uniform(.1, .22), _frng.uniform(.05, .1); h = _frng.uniform(.02, .045)
        put(F_BOX, F_COL, F_ROT, x, y, w, d, 0, h, rot, METAL[_frng.integers(len(METAL))] * _frng.uniform(.6, .95))
        if _frng.random() < .25: f_lamp.append((*at_(w / 2 + .01, 0), .04, SODIUM2))
    elif kind == 'huts':                                                # 临时工棚：几间挤在一起
        for _ in range(int(_frng.integers(2, 6))):
            u, v = _frng.uniform(-.05, .05), _frng.uniform(-.04, .04); sw, sd = _frng.uniform(.022, .045), _frng.uniform(.02, .035)
            put(F_SHK, F_SHC, F_SHR, *at_(u, v), sw, sd, 0, _frng.uniform(.01, .022), rot + _frng.normal(0, .15), SHACK[_frng.integers(len(SHACK))] * _frng.uniform(.6, 1.05))
        if _frng.random() < .4:
            lx, ly = at_(_frng.uniform(-.04, .04), _frng.uniform(-.04, .04)); f_lamp.append((lx, ly, .04, SODIUM2 if _frng.random() < .8 else PHOS)); f_heads.append((lx, ly, .006, .006, .025, .027))
    elif kind == 'stack':                                               # 集装箱堆 / 拖车
        n = int(_frng.integers(1, 5))
        for k in range(n):
            layers = int(_frng.integers(1, 4)) if _frng.random() < .6 else 1
            for l_ in range(layers):
                put(F_BOX, F_COL, F_ROT, *at_(0, (k - (n - 1) / 2) * .03 + _frng.normal(0, .002)), .06, .025, l_ * .026, (l_ + 1) * .026 - .001, rot + _frng.normal(0, .03), CONT[_frng.integers(len(CONT))] * _frng.uniform(.65, 1.1))
    elif kind == 'scrap':                                               # 废料堆：一堆乱放的小块
        for _ in range(int(_frng.integers(5, 14))):
            u, v = _frng.normal(0, .025), _frng.normal(0, .02)
            put(F_BOX, F_COL, F_ROT, *at_(u, v), _frng.uniform(.008, .03), _frng.uniform(.006, .02), 0, _frng.uniform(.003, .012), _frng.uniform(0, math.pi), np.array((.22, .15, .1)) * _frng.uniform(.5, 1.2))
    if kind in ('stack', 'scrap') and _frng.random() < .12:            # 堆场的工作灯（偏白）
        f_work.append((x, y, .16, srgb('#ffe2b8'))); f_heads.append((x, y, .012, .012, .12, .123))
occ_f = set(); n_buf = n_lot = 0
for gx in np.arange(-15.2, 2.0, .09):
    for gy in np.arange(-9.3, 9.35, .09):
        x = gx + _frng.uniform(-.03, .03); y = gy + _frng.uniform(-.03, .03)
        d = SEAM(y) - x                                                 # 离交界多远（工业带一侧为正）
        if d < .12: continue
        nz = .5 + .5 * math.sin(x * 2.3 + 1.1) * math.cos(y * 1.9 - .5)   # 成片、不均匀
        if d < 1.3: p = .9 * (1 - d / 1.3) ** 1.1 * (.55 + .45 * nz); buf = True
        else: p = .07 * nz * nz * 2; buf = False
        if _frng.random() > p: continue
        if abs(x) > W / 2 or abs(y) > H / 2 or in_zone(x, y) or kd_road.find((x, y, 0))[2] < .1 or in_bldg(x, y): continue
        g = (round(x / .09), round(y / .09))
        if g in occ_f: continue
        occ_f.add(g)
        if blackout(x, y) and _frng.random() < .12: f_fire.append((x + _frng.uniform(-.02, .02), y + _frng.uniform(-.02, .02), .03, srgb('#ff7a24')))   # 断电片区：烧桶的火
        rot = grid_rot(x, y) + _frng.normal(0, .06)
        r = _frng.random()
        if buf: kind = 'huts' if r < .38 + .3 * (1 - d / 1.3) else 'shed' if r < .8 else 'stack' if r < .92 else 'scrap'
        else: kind = 'stack' if r < .4 else 'scrap' if r < .75 else 'shed' if r < .9 else 'huts'
        lot(x, y, kind, rot); n_buf += buf; n_lot += not buf
tc.box_mesh('fill_yards', F_BOX, F_COL, td.city_mat('fillm', .6, .01, 1.8, .35), rot=np.array(F_ROT, np.float32))
tc.box_mesh('fill_huts', F_SHK, F_SHC, td.corrugated_mat('fillhut', .6, .35, 1500, 1.5), rot=np.array(F_SHR, np.float32))
tick(f'industrial fill: buffer {n_buf}, lots {n_lot}, lamps {len(f_lamp)}, work {len(f_work)}, fires {len(f_fire)}')

# 钢厂：在最大的厂房旁找一块够大的空地放高炉组
big = max(ind, key=lambda i: city.b[i]['a']) if len(ind) else None
FURN = None
if big is not None:
    bx, by = city.b[big]['cx'], city.b[big]['cy']; best = None
    for fx in np.arange(bx - 2.5, bx + 2.5, .12):
        for fy in np.arange(by - 2.5, by + 2.5, .12):
            if SEAM(fy) - fx < 1.4 or abs(fx) > W / 2 - 1 or abs(fy) > H / 2 - 2.5 or in_zone(fx, fy): continue
            if any(in_bldg(fx + .3 * math.cos(a), fy + .3 * math.sin(a), .02, 3.5) for a in np.arange(0, 2 * math.pi, math.pi / 4)) or in_bldg(fx, fy, .02, 3.5): continue
            clear = min([dd - max(city.b[bi]['obb'][2], city.b[bi]['obb'][3]) / 2 for _, bi, dd in kd_b.find_range((fx, fy, 0), 1.0)] + [1.0])
            clear = min(clear, kd_road.find((fx, fy, 0))[2] - .08, (kd_rail.find((fx, fy, 0))[2] - .05) if len(RP) else 1.0)
            score = min(clear, .5) - .15 * math.hypot(fx - bx, fy - by)
            if clear > .2 and (best is None or score > best[0]): best = (score, fx, fy)
    if best: FURN = (best[1], best[2])
if FURN:
    x, y = FURN; rot = grid_rot(x, y); cs, sn = math.cos(rot), math.sin(rot); at_ = lambda u, v: (x + u * cs - v * sn, y + u * sn + v * cs)
    fm = Batch('furnace', mat('furnace_steel', (.2, .17, .14), .55, .7), smooth=True)
    fm.cyl(x, y, 0, .1, .3, 24, r2=.08); fm.cyl(x, y, .3, .08, .07, 24, r2=.045)          # 高炉炉身 + 炉顶
    for k in range(3): fm.cyl(*at_(-.17 - k * .11, .14), 0, .052, .3, 20); fm.ico(*at_(-.17 - k * .11, .14), .3, .052, .7, 2)   # 热风炉（一排三座，圆顶）
    fm.cyl(*at_(.14, .1), 0, .045, .22, 20, r2=.03)                                     # 除尘器
    for (u, v, r_, h_) in ((.28, -.12, .03, .55), (.36, .05, .024, .48), (-.42, -.1, .034, .6)):   # 烟囱
        fm.cyl(*at_(u, v), 0, r_, h_, 16, r2=r_ * .8)
    fm.done()
    fb = Batch('furnace_hall', mat('casthouse', (.22, .2, .18), .7, .3))
    fb.box(*at_(0, -.15), 0, .3, .16, .08, rot); fb.box(*at_(-.25, -.14), 0, .22, .12, .06, rot)   # 出铁场、鼓风机房
    fb.box(*at_(.3, .23), .12, .5, .035, .012, rot + .35)                               # 上料皮带廊
    fb.done()
    fire = Batch('furnace_hot', emit_mat('furnace_hot', srgb('#ff5a14'), 1.2 * GLOW))
    for (u, v, r_, h_) in ((.28, -.12, .03, .55), (.36, .05, .024, .48), (-.42, -.1, .034, .6)):
        fire.cyl(*at_(u, v), h_, r_ * .55, .002, 12)                                    # 烟囱口的余热（暗红）
    fire.done()
    f_work += [(*at_(0, -.26), .06, srgb('#ff8a30')), (*at_(.05, -.2), .12, srgb('#ffb060'))]   # 出铁场的橙光
    px, py = min(PILLARS, key=lambda p: math.hypot(p[0] - x, p[1] - y))                # 皮带廊通向最近的支柱：矿石 / 钢坯往上送
    pipe_run(x, y, px, y, .2, .022); pipe_run(px, y, px, py, .2, .022)
    for x0, y0, x1, y1 in ((x, y, px, y), (px, y, px, py)):
        L = math.hypot(x1 - x0, y1 - y0)
        for t in np.arange(.25, L, .5): pipe_lamps.append((x0 + (x1 - x0) * t / max(L, 1e-6), y0 + (y1 - y0) * t / max(L, 1e-6), .24, SODIUM2))
    tick(f'steelworks at ({x:.2f}, {y:.2f})')
pipes.done()
tc.box_mesh('fill_lamp_heads', f_heads, np.tile(srgb('#ffc070'), (len(f_heads), 1)), emit_mat('filllamp', None, 3.0 * GLOW))
tc.point_lights('fill_lamps', f_lamp, LAMP * .5 * GLOW, .01)
tc.point_lights('fill_work', f_work, LAMP * 3.5 * GLOW, .02)
tc.point_lights('fill_fire', f_fire, LAMP * .7 * GLOW, .01)

# ---------------- 光：钠灯 + 少量磷光绿 ----------------
lamp_heads, lamp_lights, extra_flood = [], [], []
for x, y, ang, c, w in city.along(.3, CAR - {'service'}, side_offset=.008, both=False):
    if R.random() < (.6 if blackout(x, y) else .2): continue           # 坏掉的路灯；断电片区大半不亮
    lamp_heads.append((x, y, .012, .012, .07, .073))
    if len(lamp_heads) % 2 == 0: lamp_lights.append((x, y, .09, SODIUM if R.random() < .7 else SODIUM2))   # 一半灯头投光（功率加倍补回）
pil_lights = []
for (px, py), (rot, w, d, top) in zip(PILLARS, PIL_TOP):             # 柱基旁两盏钠灯（方向随机，不成环；功率按原来一圈 9 盏的总量补回）
    for _ in range(2):
        a, rr = _prng.uniform(0, 2 * math.pi), _prng.uniform(.25, .4)
        lu, lv = math.cos(a - rot), math.sin(a - rot)                  # 在柱墩的本地坐标里，保证灯落在墩外
        rr = max(rr, min(w / 2 / (abs(lu) + 1e-6), d / 2 / (abs(lv) + 1e-6)) + .03)
        lx, ly = px + rr * math.cos(a), py + rr * math.sin(a); pil_lights.append((lx, ly, .1, SODIUM)); lamp_heads.append((lx, ly, .012, .012, .07, .073))
for i in ind:                                                          # 工业区的高杆泛光灯：偏白、更亮，成片照亮厂区；靠城中村交界 75 m 内多补一半
    if R.random() < (.175 if -.75 < city.b[i]['cx'] - SEAM(city.b[i]['cy']) < 0 else .45): continue
    b = city.b[i]; x, y = b['cx'] + R.uniform(-.1, .1), b['cy'] + R.uniform(-.1, .1)
    lamp_heads.append((x, y, .02, .02, .35, .353)); extra_flood.append((x, y, .4, srgb('#ffd7a0')))
tc.box_mesh('lamp_heads', lamp_heads, np.tile(srgb('#ffc070'), (len(lamp_heads), 1)), emit_mat('lamphead', None, 6.0 * GLOW))
tc.point_lights('sodium', lamp_lights, LAMP * 2 * GLOW, .01)
tc.point_lights('pillar_sodium', pil_lights, LAMP * 2 * GLOW * 4, .01)
tc.point_lights('pipe_sodium', pipe_lamps, LAMP * .18 * GLOW, .01)
# 棚屋区：昏暗的暖光与磷光绿（霉菌灯、黑市招牌）
glim, gdots = [], []
for x, y, w, d, z0, z1 in shacks:
    r, m_ = R.random(), .4 + .6 * vf(x, y); k_ = .5 + .5 * vf(x, y)    # 交界处灯少、也暗
    if r < .04 * m_: glim.append((x, y, z1 + .04, SODIUM2, k_)); gdots.append((x, y, .008, .008, z1, z1 + .002, *(np.array(SODIUM2) * k_)))
    elif r < .045 * m_: glim.append((x, y, z1 + .04, PHOS, k_)); gdots.append((x, y, .01, .006, z1, z1 + .002, *(np.array(PHOS) * k_)))
for q in range(4):                                                     # 亮度分四档（同一档共用一个灯光数据块）
    lo, hi = .5 + q * .125, .5 + (q + 1) * .125 + (.01 if q == 3 else 0)
    g_ = [(x, y, z, c) for x, y, z, c, k_ in glim if lo <= k_ < hi]
    if g_: tc.point_lights(f'slum_light{q}', g_, LAMP * .4 * GLOW * (lo + hi) / 2, .01)
gd = np.array(gdots, np.float32).reshape(-1, 9)
tc.box_mesh('slum_dots', gd[:, :6], gd[:, 6:], emit_mat('slumdot', None, 4.0 * GLOW))
tc.point_lights('flood', extra_flood, LAMP * 6 * GLOW, .03)
tick(f'lights {len(lamp_lights) + len(glim) + len(extra_flood) + len(pil_lights) + len(pipe_lamps)}')

# ---------------- 地标 ----------------
_lrng = np.random.default_rng(9103)                                    # 地标灯：单独的随机
LM_HEADS = []                                                           # (x, y, z, 尺寸, 颜色×亮度)
def lamps_irregular(x, y, z, rx, ry, n, c, s=.012, miss=.2):
    """沿一圈围墙 / 看台随手装的灯：角度、半径抖开，亮度不一，缺几盏——不连成一圈等距的点。"""
    for k in range(n):
        if _lrng.random() < miss: continue
        a = (k + _lrng.uniform(-.45, .45)) / n * 2 * math.pi; rr = _lrng.uniform(.85, 1.08)
        LM_HEADS.append((x + rx * rr * math.cos(a), y + ry * rr * math.sin(a), z, s * _lrng.uniform(.7, 1.3), np.array(c) * _lrng.uniform(.3, 1.0)))
def ground(x, y, w, d, c=(.042, .039, .035), rot=0, z=.004):     # 地标底板：默认接近路面、带沥青斑驳，不像一块面板
    b = Batch('pl', td.asphalt_mat('pl', c, 1.4)); b.box(x, y, 0, w, d, z, rot); return b.done()
extra_lights = []
def lights_scatter(x, y, z, rx, ry, n, c):                            # 几盏投光：位置随机，不成圈
    for _ in range(n): a, r_ = _lrng.uniform(0, 2 * math.pi), _lrng.uniform(.4, 1.0); extra_lights.append((x + rx * r_ * math.cos(a), y + ry * r_ * math.sin(a), z, c))

# 7 号井黑市：中层竖井落到地面的井口（矮井筒 + 中央深色格栅升降台）+ 井口周围乱搭的市集（摊位篷布，沿放射状通道摆，不成圈）
x, y = WELL7
ground(x, y, 1.6, 1.6)
wl = Batch('well7', mat('well_metal', (.18, .18, .19), .4, .8))
wl.ring(x, y, .3, .32, .05, .3, 48)                                   # 竖井筒的底段（顶在 z≈.6；再往上在中层底板以上，剖切图不画）
wl.ring(x, y, 0, .36, .03, .08, 48)
wl.done()
gr = Batch('well7_grate', mat('well_grate', (.08, .08, .08), .4, .8)); gr.box(x, y, .02, .38, .38, .006)   # 升降台
gr.box(x - .06, y + .05, .026, .16, .12, .05, .1)                     # 升降台上的货笼、货箱（不让井口是一块干净的亮方块）
for _ in range(7): gr.box(x + R.uniform(-.15, .15), y + R.uniform(-.15, .15), .026, R.uniform(.025, .05), R.uniform(.025, .05), R.uniform(.015, .03), R.uniform(0, 1.5))
gr.done()
stalls, stc, strot = [], [], []
TARP = np.array([(.4, .12, .08), (.12, .22, .36), (.36, .3, .12), (.18, .3, .16), (.3, .3, .3)], np.float32)
TARP = TARP * .8 + TARP.mean(1, keepdims=True) * .2                  # 篷布旧、褪色
# 摊位：不以井为心排放射状，而是跟着周围街巷的方向摆成一段段的摊排（两排对着开，中间是走道），摊排之间散着零星的摊子
GRID_W = grid_rot(x, y)
for _ in range(30):
    a, r0 = R.uniform(0, 2 * math.pi), R.uniform(.46, .82)
    cx_, cy_ = x + r0 * math.cos(a), y + r0 * math.sin(a)
    ang = GRID_W + (math.pi / 2 if R.random() < .5 else 0) + R.normal(0, .1); ca_, sa_ = math.cos(ang), math.sin(ang)
    per = int(R.integers(3, 9))
    for row in (-1, 1) if R.random() < .7 else (1,):
        for j in range(per):
            if R.random() < .12: continue
            u_, v_ = (j - per / 2) * .042 + R.normal(0, .005), row * .03 + R.normal(0, .004)
            px_, py_ = cx_ + u_ * ca_ - v_ * sa_, cy_ + u_ * sa_ + v_ * ca_
            if not .42 < math.hypot(px_ - x, py_ - y) < .86: continue
            stalls.append((px_, py_, R.uniform(.028, .045), R.uniform(.022, .04), 0, R.uniform(.01, .018))); stc.append(TARP[R.integers(5)] * R.uniform(.7, 1.2)); strot.append(ang + R.normal(0, .06))
for _ in range(70):                                                     # 零星的摊子
    a, r2 = R.uniform(0, 2 * math.pi), R.uniform(.42, .85)
    stalls.append((x + r2 * math.cos(a), y + r2 * math.sin(a), R.uniform(.02, .045), R.uniform(.02, .04), 0, R.uniform(.008, .016))); stc.append(TARP[R.integers(5)] * R.uniform(.7, 1.2)); strot.append(GRID_W + R.uniform(-.6, .6))
tc.box_mesh('stalls', stalls, stc, td.city_mat('tarp', .85, .008, 1.2), rot=np.array(strot))
wg = Batch('well_glow', emit_mat('well_sodium', SODIUM, 5.0 * GLOW))
for _ in range(5): a = R.uniform(0, 2 * math.pi); wg.box(x + .32 * math.cos(a), y + .32 * math.sin(a), .6, .012, .012, .003)   # 井口几盏钠灯（随机位置）
wg.done()
# 竖井漏下来的一束冷色天光：整个下层唯一的自然光（参考米德加板下的「天窗」）；光源放在井筒口内，只照井底与近处
shaft = bpy.data.lights.new('shaft_sky', 'AREA'); shaft.shape = 'DISK'; shaft.size = .55; shaft.energy = 9.0 * GLOW * LAMP / .3   # 井底被照成一块冷白的光斑：整张下层唯一的冷色焦点（第 3 轮审阅：之前压得太暗，看不出来）
shaft.color = srgb('#cfe0ff'); so_ = bpy.data.objects.new('shaft_sky', shaft); so_.location = (x, y, .58); col_main.objects.link(so_)
for _ in range(10): a, rr_ = R.uniform(0, 2 * math.pi), R.uniform(.45, .75); extra_lights.append((x + rr_ * math.cos(a), y + rr_ * math.sin(a), .1, SODIUM))
for _ in range(2): a, rr_ = R.uniform(0, 2 * math.pi), R.uniform(.45, .75); extra_lights.append((x + rr_ * math.cos(a), y + rr_ * math.sin(a), .1, PHOS))
layer.marker('well7', (x, y, 0), .8)

# 血肉磨坊：椭圆形地下拳场——锈铁外壳、阶梯看台、中央沙坑；刺眼的白光照着坑
x, y = MILL
ground(x, y, 1.2, .95)
ml = Batch('mill', mat('mill_rust', (.26, .13, .08), .6, .6))
for k, (rx, ry, hh) in enumerate(((.5, .38, .12), (.42, .31, .09), (.36, .26, .06), (.31, .22, .04))):
    ml.ring(x, y, 0, 1, .05, hh, 56, rx, ry)                           # 外壳 + 阶梯看台
ml.done()
pit = Batch('pit', mat('pit', (.2, .09, .06), .95)); pit.cyl(0, 0, 0, 1, .006, 48); po = pit.done()
po.scale = (.27, .18, 1); po.location = (x, y, 0)                  # 中央沙坑（椭圆）
lamps_irregular(x, y, .125, .5, .38, 9, WHITE, .014, .3)             # 看台顶上几盏照坑的灯
extra_lights += [(x + dx, y + dy, .25, WHITE) for dx, dy in ((-.15, 0), (.15, 0), (0, .1), (0, -.1))]
layer.marker('blood_mill', (x, y, 0), .5)

# 执法局下层分局：围墙院落、方形主楼、车库；冷白 + 执法蓝
x, y = ENF
ground(x, y, 1.3, 1.05)
ef = Batch('enf_low', mat('enf_concrete', (.17, .17, .18), .75))   # 深灰混凝土：灯下不反成一圈白框
for sx in (-1, 1): ef.box(x + sx * .6, y, 0, .03, 1.0, .06); ef.box(x, y + sx * .5, 0, 1.2, .03, .06)
ef.box(x - .1, y + .1, 0, .6, .45, .2); ef.box(x + .38, y - .25, 0, .25, .3, .08)
for k in range(6): ef.box(x - .35 + k * .12, y - .35, 0, .07, .035, .02)   # 装甲车
ef.done()
eb = Batch('enf_blue', emit_mat('enf_blue', BLUE, 5.0 * GLOW))       # 执法蓝：大门两盏 + 围墙四角（离散的灯，不描边）
for sx in (-1, 1):
    eb.box(x - .1 + sx * .06, y - .5, .06, .014, .014, .003)
    for sy in (-1, 1): eb.box(x + sx * .6, y + sy * .5, .06, .014, .014, .003)
eb.done()
lights_scatter(x, y, .2, .5, .4, 5, WHITE)
layer.marker('enforcement_low', (x - .1, y + .1, 0), .6)

# 施粥站：半荒废的旧教堂（中殿屋顶塌了一段）+ 前院长桌与排队人流；暖光
x, y = SOUP
ground(x, y, 1.2, .9)
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
for k in range(9):                                                     # 长桌上方拉的一串灯泡：间距不等、有坏的
    if _lrng.random() < .25: continue
    LM_HEADS.append((x - .3 + k * .07 + _lrng.normal(0, .01), y - .22 + _lrng.normal(0, .012), .03, .01, np.array(srgb('#ffd08a')) * _lrng.uniform(.3, 1.0)))
lights_scatter(x - .05, y - .22, .12, .3, .1, 4, srgb('#ffd08a'))
layer.marker('soup_kitchen', (x, y + .05, 0), .55)

# 防卫军前沿哨所：沙袋墙、四角岗楼、车辆与停机坪；白色探照灯
x, y = OUTPOST
ground(x, y, 1.4, 1.2)
op = Batch('outpost', mat('outpost_olive', (.16, .18, .12), .8))
for sx in (-1, 1): op.box(x + sx * .6, y, 0, .05, 1.05, .05); op.box(x, y + sx * .52, 0, 1.2, .05, .05)
for sx in (-1, 1):
    for sy in (-1, 1): op.box(x + sx * .6, y + sy * .52, 0, .09, .09, .16)
for k in range(3): op.box(x - .27 + k * .22 + _lrng.normal(0, .015), y + .22 + _lrng.normal(0, .02), 0, .16 * _lrng.uniform(.8, 1.1), .3 * _lrng.uniform(.75, 1.05), .06 * _lrng.uniform(.8, 1.2), _lrng.normal(0, .03))   # 营房（大小不一）
for k in range(5):                                                      # 停着的车辆：不排成一排等距的方块
    if _lrng.random() < .2: continue
    op.box(x - .3 + k * .1 + _lrng.normal(0, .02), y - .25 + _lrng.normal(0, .03), 0, .07, .035, .025, _lrng.normal(0, .25))
for _ in range(6): op.box(x + _lrng.uniform(-.5, .2), y + _lrng.uniform(-.45, .0), 0, _lrng.uniform(.03, .08), _lrng.uniform(.02, .05), _lrng.uniform(.01, .03), _lrng.uniform(0, 1.5))   # 物资箱、沙袋堆
op.done()
pad = Batch('outpost_pad', mat('pad', (.25, .25, .24), .7)); pad.cyl(x + .35, y - .2, 0, .12, .008, 32); pad.done()
ow = Batch('outpost_glow', emit_mat('outpost_white', WHITE, 5.0 * GLOW))
for sx in (-1, 1):
    for sy in (-1, 1): ow.box(x + sx * .6 + _lrng.normal(0, .01), y + sy * .52 + _lrng.normal(0, .01), .16, .014, .014, .003)   # 岗楼顶的探照灯头（小）
for a in (.5, 2.3, 4.4): ow.box(x + .35 + .12 * math.cos(a), y - .2 + .12 * math.sin(a), .008, .01, .01, .003)   # 停机坪边上三盏（不成圈）
ow.done()
extra_lights += [(x + sx * .55, y + sy * .47, .3, WHITE) for sx in (-1, 1) for sy in (-1, 1)]
layer.marker('outpost', (x, y, 0), .7)

# 资产管理委员会下层设施：有围墙的大型管理设施——只做中性的建筑外观
x, y = AMC
ground(x, y, 2.4, 1.7)
am = Batch('amc', mat('amc_concrete', (.2, .2, .21), .7))   # 深灰混凝土：灯下不反成一圈白框
for sx in (-1, 1): am.box(x + sx * 1.15, y, 0, .04, 1.62, .1); am.box(x, y + sx * .8, 0, 2.3, .04, .1)
am.box(x - .35, y + .15, 0, 1.0, .7, .22); am.box(x + .6, y + .2, 0, .6, .5, .16); am.box(x + .55, y - .45, 0, .7, .3, .12)
am.box(x - .45, y - .5, 0, .8, .2, .1)
am.done()
aw = Batch('amc_glow', emit_mat('amc_white', WHITE, 4.0 * GLOW))
for sx in (-1, 1):                                                     # 围墙四角、大门两盏，外加几盏不规则的墙灯（不连成一圈白点）
    for sy in (-1, 1): aw.box(x + sx * 1.15, y + sy * .8, .1, .015, .015, .003)
    aw.box(x - .45 + sx * .08, y - .8, .1, .015, .015, .003)
for _ in range(6):
    if R.random() < .5: aw.box(x + R.uniform(-1.1, 1.1), y + (.8 if R.random() < .5 else -.8), .1, .015, .015, .003)
    else: aw.box(x + (1.15 if R.random() < .5 else -1.15), y + R.uniform(-.75, .75), .1, .015, .015, .003)
aw.done()
extra_lights += [(x + R.uniform(-1, 1), y + (.85 if R.random() < .5 else -.85), .2, SODIUM2 if R.random() < .6 else WHITE) for _ in range(5)]   # 几盏不规则的墙灯，不照出一圈白边
layer.marker('amc_facility', (x - .1, y + .1, 0), 1.2)

# 货运站的照明塔
x, y = YARD
yl = Batch('yard_glow', emit_mat('yard_sodium', SODIUM, 5.0 * GLOW))
for gu in np.linspace(-1.4, 1.4, 6):                                    # 沿铁路方向两排
    for sv in (-1, 1):
        px, py = at(gu, sv * .52); yl.box(px, py, .3, .03, .03, .003, YROT); extra_lights.append((*at(gu, sv * .5), .35, SODIUM))
yl.done()
tc.point_lights('landmark_light', extra_lights, LAMP * 2.5 * GLOW, .02)
if LM_HEADS: tc.box_mesh('landmark_heads', [(x, y, s, s, z, z + .003) for x, y, z, s, c in LM_HEADS], np.array([c for *_, c in LM_HEADS], np.float32).reshape(-1, 3), emit_mat('lmhead', None, 4.5 * GLOW))
tick('landmarks')

# ---------------- 环境：几乎没有天光（中层底面反射下来的一点暗橙）----------------
layer.finish(world=((.5, .38, .25), layer.f('--ambient', .12)), glare_opts=dict(threshold=.75, size=9.5, mix=-.7, tight=(.6, 7, .45)))
