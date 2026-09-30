# 天城 · 下层（地基区，地面）· Blender 正俯视写实渲染（夜景草稿）
# 用法：Blender -b -P tiancheng_low.py -- [--res 1600] [--samples 64] [--out path.png] [--crop x0,y0,x1,y1 | --crops "x0,y0,x1,y1:名字;..." | --crops-json 文件] [--out-dir 目录] [--preview] [--data-only]
#       [--glow 1]（发光体倍数）[--lamp .3]（钠灯功率）[--ambient .12]（天光）[--no-landmark-glow]（去掉地标光圈 / 描边灯 / 光晕）[--day]（白天版：浊暖灰天 + 日光，钠灯 / 井口冷光熄灭或改暗；[--sun 2.8] 日光能量、[--dayexp .4] 白天曝光档）
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

if tc.blend_cache_open():   # --cache-blend 命中：场景在缓存里（同参重渲），跳过城市生成与本文件全部搭建，直接渲染退出
    tc.cache_render()
    sys.exit(0)
layer = tc.Layer('tc_low', seed=9001, bounces=4, city='low')   # 城市在这里生成（第一个随机调用）：街道位置与上层、中层一致
DAY = layer.day                # --day：白天版（浊一点的暖灰天 + 日光；夜景元素熄灭 / 改暗，几何与随机序列不变）
sc, col_main, city, R, GLOW, LAMP = layer.sc, layer.col, layer.city, layer.rng, 0 if DAY else layer.f('--glow', 1), layer.f('--lamp', .3)   # --day：发光倍数置 0
LM_GLOW = layer.lm_glow and not DAY   # False（--no-landmark-glow / --day 灯圈白天关）：去掉地标的光圈 / 描边灯 / 光晕（含 7 号井竖井冷光），见「地标」一节末尾；随机照常取，只在出图时过滤

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)
SODIUM, SODIUM2, PHOS, WHITE, BLUE, RED = srgb('#f0a040'), srgb('#ff8c2a'), srgb('#9fe870'), srgb('#e8eeff'), srgb('#5a8cff'), srgb('#ff3a2a')
import tc_detail as td, tc_city
from tc_city import CAR, point_in_poly

# ---------------- 地标位置 ----------------
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
def amc_clear(x, y, pad=0.0):                                          # A3：资产管理委员会设施外圈铁丝网以内（含隔离带）不留握手楼——只在出图时去掉，不改城市与 R 的随机序列
    return abs(x - AMC[0]) < 1.4 + pad and abs(y - AMC[1]) < 1.05 + pad
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
# A6：过渡带本身也不沿交界线平行——叠一层二维的确定性起伏（约 ±40 m），城中村的边缘成片地伸进 / 退出，工业带的棚屋堆场补进退出来的空当。
def seam_n(x, y): return .28 * math.sin(x * 2.3 + y * 1.1 + .5) * math.cos(y * 2.9 - x * .7) + .12 * math.sin(x * 5.1 - y * 3.7)
def vf(x, y): return _ss((x - SEAM(y) + seam_n(x, y)) / .9)            # 工业带 → 城中村的交界（起伏的一条线，tc_city.low_seam_x）：城中村一侧约 90 m 内由疏到密
ZONE = np.array([2 if b['dk'] == 'village' else 1 if b['a'] > .015 else 0 for b in city.b], np.int8)   # 0 工人住宅 1 厂房 2 城中村

# 地面：水泥与泥地；路面沥青；荒掉的公园是泥地；水面发黑
tc.road_plane((.075, .07, .065), z=0, m=td.city_mat('lowground', .9, ao=.02, grime=1.4))
city.flat_polys('water', city.water, .002, (.01, .012, .012), mat('water_l', (.01, .012, .012), .1, spec=.6))
# A7 可读性：荒掉的公园原来是和别处一样的褐色泥地，读不出是公园——改成枯草的暗橄榄色，撒一片稀疏的枯树 / 灌木（暗色树冠）；
# 城中村的地面（楼缝、小巷）压暗一档，缺楼处不再露出一块块浅色地面。独立随机（9112），不动 R。
city.flat_polys('mud', city.parks, .002, (.08, .086, .052), td.city_mat('mud', .95, .01, 1.6))
_Pi = next(D['P'] for D in city.districts if D['kind'] == 'industrial')   # 工业带地面：偏冷的深灰水泥（与城中村的暖褐地面分开）
city.flat_polys('ind_ground', [np.array(_Pi, np.float32)], .0011, (.058, .058, .058), td.city_mat('indground', .82, .01, 1.8))
_Pv = next(D['P'] for D in city.districts if D['kind'] == 'village')
city.flat_polys('village_ground', [np.array(_Pv, np.float32)], .0012, (.036, .033, .03), td.city_mat('vground', .95, .01, 1.7))
_trng = np.random.default_rng(9112)
def _compact(P_): return abs(tc_city.poly_area(P_)) / max(1e-6, float(np.sum(np.hypot(*(np.roll(P_, -1, 0) - P_).T))) ** 2)
_bigp = [P_ for P_ in city.parks if abs(tc_city.poly_area(P_)) > .35 and _compact(P_) > .025]   # 细长的绿带（大道中间）不算   # 第 2 轮：只在大公园里（沿路的窄绿带上的枯树读成一团团黑斑）
_dead = [(x_, y_, .0025 + r_ * .45, r_ * _trng.uniform(.6, 1.0)) for x_, y_, r_ in city.trees
         if _trng.random() < .55 and any(point_in_poly(x_, y_, P_) for P_ in _bigp) and all(((x_ - lx) / (rx + .05)) ** 2 + ((y_ - ly) / (ry + .05)) ** 2 > 1 for lx, ly, rx, ry in LM)]
tc.ico_mesh('dead_trees', _dead, mat('deadtree', (.04, .042, .026), .95))
PARK_L = []                                                             # 大公园沿边几盏暗钠灯（小路的灯），公园的轮廓在缩小时读得出
for P_ in _bigp:
    for a_, b_ in zip(P_, np.roll(P_, -1, 0)):
        L_ = float(np.hypot(*(b_ - a_)))
        for t_ in np.arange(_trng.uniform(0, .3), L_, .32):
            if _trng.random() < .45: continue
            q_ = a_ + (b_ - a_) * t_ / max(L_, 1e-6); PARK_L.append((float(q_[0]), float(q_[1]), .0068, .045 * _trng.uniform(.7, 1.2), np.array(SODIUM2) * _trng.uniform(.4, .8)))
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
city.buildings_mesh('sheds', ind, 0, top_ind, c_ind, td.corrugated_mat('shedroof', .45, .55, 320, 1.7, patch=22))   # A3：波纹放大到约 30 cm 一道（8K 下看得出），锈斑加重，叠几米大小的换板 / 锈斑
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
# A6：楼高再按对数正态抖一次（原来同一片的屋顶几乎一样高）；交界过渡带里的握手楼按 vf 成片地缺（留出空地给工业带一侧的棚屋、堆场），
# 交界不再是一条整齐的楼墙。独立随机（9107），不动 R。
_vr = np.random.default_rng(9107)
top_v = (top_v * np.clip(_vr.lognormal(0, .2, len(vil)), .65, 1.6)).astype(np.float32)
_vdrop = np.array([_vr.random() < .6 * (1 - vf(city.b[i]['cx'], city.b[i]['cy'])) ** 1.4 for i in vil], bool)
_vm = np.array([not amc_clear(city.b[i]['cx'], city.b[i]['cy'], .06) for i in vil], bool) & ~_vdrop
vmat = td.city_mat('villagemat', .85, .012, 1.6)
city.buildings_mesh('village', vil[_vm], 0, top_v[_vm], c_v[_vm], vmat)
# A7：交界处去掉的握手楼原地留下拆了一半的地基 / 碎砖堆（暗、矮、比原楼小一圈），不再露出一块块浅色的空地。独立随机（9113）。
_rbr = np.random.default_rng(9113); RB, RBC, RBR = [], [], []
for i in vil[_vdrop]:
    b = city.b[i]
    if amc_clear(b['cx'], b['cy'], .06): continue
    x, y, w, d, rot = b['obb']; r_ = _rbr.random()
    if r_ < .55: RB.append((x, y, w * _rbr.uniform(.7, .95), d * _rbr.uniform(.7, .95), 0, _rbr.uniform(.002, .008))); RBR.append(rot); RBC.append(np.array((.075, .066, .056)) * _rbr.uniform(.55, .95))
    elif r_ < .85:
        for _ in range(int(_rbr.integers(3, 8))):
            u_, v_ = _rbr.uniform(-.4, .4) * w, _rbr.uniform(-.4, .4) * d; cs, sn = math.cos(rot), math.sin(rot)
            RB.append((x + u_ * cs - v_ * sn, y + u_ * sn + v_ * cs, _rbr.uniform(.01, .035), _rbr.uniform(.01, .03), 0, _rbr.uniform(.003, .014))); RBR.append(_rbr.uniform(0, math.pi)); RBC.append(np.array((.12, .09, .07)) * _rbr.uniform(.4, .9))
tc.box_mesh('village_rubble', RB, np.array(RBC, np.float32).reshape(-1, 3), td.city_mat('rubble', .95, .006, 1.8), rot=np.array(RBR, np.float32))
# A6：屋顶杂物的色相收窄到三类——铁锈（两档）、篷布蓝灰（两档）、褪色红，外加一档锈灰的旧铁皮（原来蓝、绿、橙、灰各一，太杂）。条数不变（R 的序列不变）。
SHACK = np.array([(.3, .15, .09), (.22, .125, .08), (.15, .175, .21), (.2, .225, .25), (.33, .16, .13), (.24, .21, .19)], np.float32)
shacks, shc2, shr, vtanks, sho, vto = [], [], [], [], [], []
for i, t in zip(vil, top_v):
    b = city.b[i]; x, y, w, d, rot = b['obb']; cs, sn = math.cos(rot), math.sin(rot)
    for _ in range(int(round(int(R.integers(1, 5 if b.get('dense') else 3)) * (.4 + .6 * vf(x, y))))):   # 屋顶加建的铁皮房、篷布（交界处少）
        u, v = R.uniform(-.3, .3) * w, R.uniform(-.3, .3) * d; sw, sd = R.uniform(.02, .05), R.uniform(.02, .04)
        shacks.append((x + u * cs - v * sn, y + u * sn + v * cs, sw, sd, t, t + R.uniform(.006, .02))); shc2.append(SHACK[R.integers(len(SHACK))] * R.uniform(.7, 1.2)); shr.append(rot + R.normal(0, .08)); sho.append(int(i))
    if R.random() < .6: vtanks.append((x + R.uniform(-.3, .3) * w, y + R.uniform(-.3, .3) * d, t, .008, .012)); vto.append(int(i))   # 屋顶水箱
# A6：屋顶加建层（贴一边的一整层，比屋面小一圈）、天台棚（架在柱子上的一片篷布 / 铁皮）、成组的水箱（不锈钢灰、褪色蓝灰）。
# 只加在留下来的楼上；独立随机（9107 接着用）。
ADD, ADDC, ADDR, CAN, CANC, CANR, VT2, VT2C = [], [], [], [], [], [], [], []
_vkeep = set(int(i) for i in vil[_vm])
for i, t, c in zip(vil, top_v, c_v):
    if int(i) not in _vkeep: continue
    b = city.b[i]; x, y, w, d, rot = b['obb']; cs, sn = math.cos(rot), math.sin(rot); at_ = lambda u, v: (x + u * cs - v * sn, y + u * sn + v * cs)
    k_ = .4 + .6 * vf(x, y); zt = float(t)
    if _vr.random() < .32 * k_:                                          # 加建层：一整层，贴着一条边
        fw, fd = _vr.uniform(.4, .78), _vr.uniform(.45, .85); su, sv = _vr.choice([-1, 1]), _vr.choice([-1, 1])
        hh = _vr.uniform(.012, .028); ADD.append((*at_(su * (1 - fw) / 2 * w, sv * (1 - fd) / 2 * d), w * fw, d * fd, zt, zt + hh)); ADDR.append(rot)
        ADDC.append(np.asarray(c) * _vr.uniform(.8, 1.1) if _vr.random() < .6 else SHACK[_vr.choice([0, 1, 5])] * _vr.uniform(.8, 1.1))
        if _vr.random() < .5: zt += hh                                  # 水箱、棚子有时在加建层顶上
    if _vr.random() < .22 * k_:                                          # 天台棚：薄薄一片，离屋面一人多高
        fw, fd = _vr.uniform(.3, .6), _vr.uniform(.3, .6); u_, v_ = _vr.uniform(-.25, .25) * w, _vr.uniform(-.25, .25) * d; zc = zt + _vr.uniform(.012, .02)
        CAN.append((*at_(u_, v_), w * fw, d * fd, zc, zc + .0015)); CANR.append(rot + _vr.normal(0, .05)); CANC.append(SHACK[_vr.choice([0, 2, 3, 4])] * _vr.uniform(.75, 1.1))
    if _vr.random() < .35 * k_:                                          # 成组的水箱
        u0, v0 = _vr.uniform(-.3, .3) * w, _vr.uniform(-.3, .3) * d; nt = int(_vr.integers(1, 4)); r_ = _vr.uniform(.005, .008)
        tcol = np.array((.34, .34, .35)) if _vr.random() < .6 else np.array((.17, .2, .24))
        for k in range(nt): VT2.append((*at_(u0 + k * r_ * 2.3, v0), zt, r_, r_ * _vr.uniform(1.1, 1.6))); VT2C.append(tcol * _vr.uniform(.8, 1.1))
tc.box_mesh('village_addons', ADD, np.array(ADDC, np.float32).reshape(-1, 3), vmat, rot=np.array(ADDR, np.float32))
tc.box_mesh('village_canopies', CAN, np.array(CANC, np.float32).reshape(-1, 3), td.corrugated_mat('canopyroof', .6, .35, 1500, 1.4), rot=np.array(CANR, np.float32))
tc.cyl_mesh('village_tanks', VT2, td.city_mat('vtank2', .45, .004, 1.1, .35), 10, colors=np.array(VT2C, np.float32).reshape(-1, 3))
tick(f'village A6: dropped at seam {int(_vdrop.sum())}, add-on floors {len(ADD)}, canopies {len(CAN)}, tanks {len(VT2)}')
_sm = [not amc_clear(s_[0], s_[1], .06) and o_ in _vkeep for s_, o_ in zip(shacks, sho)]
tc.box_mesh('shacks', [s_ for s_, k in zip(shacks, _sm) if k], [c for c, k in zip(shc2, _sm) if k], td.corrugated_mat('shackroof', .6, .35, 1500, 1.4), rot=np.array([r_ for r_, k in zip(shr, _sm) if k], np.float32))
tc.cyl_mesh('roof_tanks', [t_ for t_, o_ in zip(vtanks, vto) if not amc_clear(t_[0], t_[1], .06) and o_ in _vkeep], td.city_mat('rooftank', .5, .004, 1.2, .4), 10, colors=(.3, .3, .3))
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
pipes = Batch('pipes', mat('pipe', (.1, .085, .07), .8, .3), smooth=True)   # A7：再压暗、去掉金属高光（原来铜色反光，直角管廊像一个个描边框）
pipe_lamps = []
def pipe_run(x0, y0, x1, y1, z, r):
    L = math.hypot(x1 - x0, y1 - y0); a = math.atan2(y1 - y0, x1 - x0)
    if L < 1e-3: return
    bmesh.ops.create_cone(pipes.bm, cap_ends=True, segments=10, radius1=r, radius2=r, depth=L,
                          matrix=Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, z)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
# A7：管廊原来是每四座厂房两根并排的直角折线（先东西、再南北），缩小看是一个个描边的矩形框。改为：每六座厂房一根（离支柱 < 200 m 才接），
# 走向跟厂房的街网方向（grid_rot）而不是正东西 / 正南北，拐角斜切 45°，中途在随机位置再折一次；灯更少。独立随机（9115）。
_pip = np.random.default_rng(9115)
def pipe_path(x, y, px, py, rot):
    cs, sn = math.cos(rot), math.sin(rot); dx, dy = px - x, py - y; u = dx * cs + dy * sn; v = -dx * sn + dy * cs
    f = _pip.uniform(.3, .7); ch = min(abs(u), abs(v), .12) * _pip.uniform(.4, 1.0)
    pts_ = [(0, 0), (u * f, 0), (u * f, v * .5), (u, v * .5), (u, v)] if _pip.random() < .5 else [(0, 0), (u - math.copysign(ch, u), 0), (u, math.copysign(ch, v)), (u, v)]
    return [(x + a * cs - b * sn, y + a * sn + b * cs) for a, b in pts_]
for i in ind[::6]:
    x, y = city.b[i]['cx'], city.b[i]['cy']; px, py = min(PILLARS, key=lambda p: math.hypot(p[0] - x, p[1] - y))
    if math.hypot(px - x, py - y) > 2.0: continue
    path = pipe_path(x, y, px, py, city.b[i]['obb'][4])
    for (x0, y0), (x1, y1) in zip(path[:-1], path[1:]):
        pipe_run(x0, y0, x1, y1, .175, .014)
        L = math.hypot(x1 - x0, y1 - y0)
        for t in np.arange(.4, L, 1.2): pipe_lamps.append((x0 + (x1 - x0) * t / L, y0 + (y1 - y0) * t / L, .23, SODIUM2))
tick(f'tanks {len(TK)} + pipes')                                        # pipes 在「工业带的边角」一节里补上皮带廊后才生成

# ---------------- 货运铁路：OSM 地面铁路 + 货运站 ----------------
ballast = Batch('ballast', tc.noise_mat('ballast', (.06, .057, .052), (.12, .11, .095), 400, .95, .1))   # A7：道砟压暗、带碎石颗粒（原来是一条条浅褐色的带子）
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
        if b_['dk'] == 'village' and bi not in _vkeep: continue        # A6：交界处去掉的握手楼不占地
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
# A7：城中村成片地越过交界线伸进工业带（原来在 l2 一段城中村停在一条南北向大道上，直边）——交界线以西按一层确定性的起伏
# 划出几块「舌头」（最深约 130 m），里面按握手楼的尺度补楼（楼贴楼、越往西越稀），屋顶带铁皮房、水箱、几盏昏暗的窗光。
# 占位写进 occ_f，后面的堆场 / 工棚不叠上去。独立随机（9114），不动 R。
_sp = np.random.default_rng(9114); SPB, SPZ, SPC, SPS, SPSC, SPSR, SPT, SPL = [], [], [], [], [], [], [], []
from collections import Counter; _rej = Counter()
def lobe(y): return max(0.0, 1.05 * math.sin(y * 1.45 + 2.6) + .45 * math.sin(y * 3.7 + .3) + .15)
for gx in np.arange(-4.5, 3.0, .11):
    for gy in np.arange(-9.2, 9.25, .11):
        x = gx + _sp.uniform(-.02, .02); y = gy + _sp.uniform(-.02, .02)
        d = SEAM(y) - x - seam_n(x, y); reach = lobe(y) * 1.6
        if d < .02 or d > reach or _sp.random() > .97 * (1 - d / max(reach, 1e-6)) ** .45: continue
        if abs(x) > W / 2 or abs(y) > H / 2 or in_zone(x, y) or amc_clear(x, y, .1): _rej['zone'] += 1; continue
        if kd_road.find((x, y, 0))[2] < .075: _rej['road'] += 1; continue
        if in_bldg(x, y, .03): _rej['bldg'] += 1; continue
        if any(point_in_poly(x, y, q) for q in city.parks): _rej['park'] += 1; continue
        rot = grid_rot(x, y) + _sp.normal(0, .05); cs, sn = math.cos(rot), math.sin(rot)
        w_, d_ = _sp.uniform(.1, .145), _sp.uniform(.09, .14)
        if any(kd_road.find((x + u * cs - v * sn, y + u * sn + v * cs, 0))[2] < .05 for u, v in ((-w_ / 2, -d_ / 2), (w_ / 2, -d_ / 2), (w_ / 2, d_ / 2), (-w_ / 2, d_ / 2))): continue
        g = (round(x / .09), round(y / .09))
        if g in occ_f: continue
        for i_ in (-1, 0, 1):
            for j_ in (-1, 0, 1): occ_f.add((g[0] + i_, g[1] + j_))
        zt = float((.06 + _sp.uniform(18, 32) / 45 * .08) * (.55 + .45 * (1 - d / max(reach, 1e-6))) * np.clip(_sp.lognormal(0, .2), .65, 1.6))
        SPB.append((x, y, w_, d_, 0, zt)); SPZ.append(rot); SPC.append(VIL[_sp.integers(len(VIL))] * _sp.uniform(.75, 1.15))
        for _ in range(int(_sp.integers(0, 3))):
            u, v = _sp.uniform(-.3, .3) * w_, _sp.uniform(-.3, .3) * d_
            SPS.append((x + u * cs - v * sn, y + u * sn + v * cs, _sp.uniform(.02, .05), _sp.uniform(.02, .04), zt, zt + _sp.uniform(.006, .02))); SPSR.append(rot + _sp.normal(0, .08)); SPSC.append(SHACK[_sp.integers(len(SHACK))] * _sp.uniform(.7, 1.2))
        if _sp.random() < .5: SPT.append((x + _sp.uniform(-.3, .3) * w_, y + _sp.uniform(-.3, .3) * d_, zt, .008, .012))
        if _sp.random() < .06: SPL.append((x, y, zt + .04, SODIUM2))
tc.box_mesh('village_spill', SPB, np.array(SPC, np.float32).reshape(-1, 3), vmat, rot=np.array(SPZ, np.float32))
tc.box_mesh('village_spill_shacks', SPS, np.array(SPSC, np.float32).reshape(-1, 3), td.corrugated_mat('spillshack', .6, .35, 1500, 1.4), rot=np.array(SPSR, np.float32))
tc.cyl_mesh('village_spill_tanks', SPT, td.city_mat('spilltank', .5, .004, 1.2, .4), 10, colors=(.3, .3, .3))
tc.point_lights('village_spill_light', SPL, LAMP * .4 * GLOW * .8, .01)
tick(f'village spill west of seam: {len(SPB)} buildings, rejected {dict(_rej)}')
for gx in np.arange(-15.2, 2.8, .09):                                  # A6：交界线最东到 x ≈ 2.2
    for gy in np.arange(-9.3, 9.35, .09):
        x = gx + _frng.uniform(-.03, .03); y = gy + _frng.uniform(-.03, .03)
        d = SEAM(y) - x - seam_n(x, y)                                  # 离交界多远（工业带一侧为正；A6：与 vf 同一条二维起伏的过渡线，棚屋补进城中村退出来的空当）
        if d < .12: continue
        nz = .5 + .5 * math.sin(x * 2.3 + 1.1) * math.cos(y * 1.9 - .5)   # 成片、不均匀
        if d < 1.3: p = .9 * (1 - d / 1.3) ** 1.1 * (.55 + .45 * nz); buf = True
        else: p = .07 * nz * nz * 2 * (1 + 1.2 * _ss((-5.0 - y) / 2.0) * _ss((-2.0 - x) / 3.0)); buf = False   # A7：西南空地多补一些堆场
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
_fh = tc.box_mesh('fill_lamp_heads', f_heads, np.tile(srgb('#ffc070'), (len(f_heads), 1)), emit_mat('filllamp', None, 3.0 * GLOW))
if _fh: _fh.visible_shadow = False
tc.point_lights('fill_lamps', f_lamp, LAMP * .5 * GLOW, .01)
tc.point_lights('fill_work', f_work, LAMP * 3.5 * GLOW, .02)
tc.point_lights('fill_fire', f_fire, LAMP * .7 * GLOW, .01)

# ---------------- 光：钠灯 + 少量磷光绿 ----------------
lamp_heads, lamp_lights, extra_flood = [], [], []
# A6：原来每条路单侧每 30 m 一盏、等距；改用 tc_city.street_lamps（按路级别定间距、两侧错开 / 单侧换边、间距抖动、路口转角补灯），
# 独立随机（9108），不动 R。
_lr9 = np.random.default_rng(9108)
# A7：间距抖动加大、分幅干道 / 辅路的平行几排去重（min_sep）；工业带（交界线以西）是老式汞灯（偏绿的冷白，暗），城中村是钠灯——
# 两个片区缩小看颜色就分得开；不投点光的灯头在地面上画一小片渐隐的光池（td.glow_pools）。独立随机（9108 接着用 / 9111）。
MERC = srgb('#c6e6b4')                                                  # A7 第 2 轮：汞灯的偏绿要看得出（原来读成中性 LED 白）
def is_ind(x, y): return x < SEAM(y) - seam_n(x, y) - .05
def ruhr_east(x, y): return _ss((x - SEAM(y) + 4.2) / 3.2)             # 工业带东侧约 400 m：汞灯里混进钠灯，两片区的灯色渐变而不是一刀切（第 3 轮由 250 m 放宽）
MERC_L = srgb('#dfe4d8')                                                # 汞灯投到地上的光：接近中性（绿只留在灯头和贴身的小光池里，工业带不再整片发绿）
LPOOL = []; _pl9 = np.random.default_rng(9111); _headcol = {}
for x, y, ang, c, w in city.street_lamps(_lr9, CAR - {'service'}, side_offset=.008, scale=1.0, corner=.35, one_side=True, jit=.42, min_sep=.17):
    if _lr9.random() < (.6 if blackout(x, y) else .22): continue       # 坏掉的路灯；断电片区大半不亮
    lamp_heads.append((x, y, .012, .012, .07, .073))
    col_ = (MERC if _pl9.random() < .85 - .5 * ruhr_east(x, y) else SODIUM2) if is_ind(x, y) else (SODIUM if _pl9.random() < .7 else SODIUM2)
    _headcol[(round(x, 4), round(y, 4))] = col_
    if _lr9.random() < .5: lamp_lights.append((x, y, .09, MERC_L if col_ == MERC else col_))   # 一半灯头投光（功率加倍补回）
    elif _pl9.random() < .75: LPOOL.append((x, y, .0065, (.028 if col_ == MERC else .05) * _pl9.uniform(.8, 1.25), np.array(col_) * _pl9.uniform(.35, .8)))
pil_lights = []
for (px, py), (rot, w, d, top) in zip(PILLARS, PIL_TOP):             # 柱基旁两盏钠灯（方向随机，不成环；功率按原来一圈 9 盏的总量补回）
    for _ in range(2):
        a, rr = _prng.uniform(0, 2 * math.pi), _prng.uniform(.25, .4)
        lu, lv = math.cos(a - rot), math.sin(a - rot)                  # 在柱墩的本地坐标里，保证灯落在墩外
        rr = max(rr, min(w / 2 / (abs(lu) + 1e-6), d / 2 / (abs(lv) + 1e-6)) + .03)
        lx, ly = px + rr * math.cos(a), py + rr * math.sin(a); pil_lights.append((lx, ly, .1, SODIUM)); lamp_heads.append((lx, ly, .012, .012, .07, .073))
_fl9 = np.random.default_rng(9116)
for i in ind:                                                          # 工业区的高杆泛光灯：偏白、更亮，成片照亮厂区；靠城中村交界 75 m 内多补一半
    if R.random() < (.175 if -.75 < city.b[i]['cx'] - SEAM(city.b[i]['cy']) < 0 else .45): continue
    b = city.b[i]; x, y = b['cx'] + R.uniform(-.1, .1), b['cy'] + R.uniform(-.1, .1)
    # A3：灯杆立在厂房边的场地上（原来在屋顶正上方，平直着色后每个屋顶正中一个亮斑）；斜照过去，屋面的波纹和锈斑才看得出
    _, _, w_, d_, r_ = b['obb']; dx_, dy_ = x - b['cx'], y - b['cy']; L_ = math.hypot(dx_, dy_)
    if L_ < 1e-4: dx_, dy_, L_ = -math.sin(r_), math.cos(r_), 1.0
    dx_, dy_ = dx_ / L_, dy_ / L_; cu_, su_ = math.cos(r_), math.sin(r_)
    t_ = min(w_ / 2 / (abs(dx_ * cu_ + dy_ * su_) + 1e-6), d_ / 2 / (abs(-dx_ * su_ + dy_ * cu_) + 1e-6)) + .05
    x, y = b['cx'] + dx_ * t_, b['cy'] + dy_ * t_
    if _fl9.random() < .4: continue                                    # A7 第 2 轮：高杆灯少四成（R 的序列不变）；只留在厂门、堆场一带的够用
    fc_ = MERC if _fl9.random() > .35 * ruhr_east(x, y) else SODIUM2
    lamp_heads.append((x, y, .02, .02, .35, .353)); extra_flood.append((x, y, .4, MERC_L if fc_ == MERC else fc_)); _headcol[(round(x, 4), round(y, 4))] = fc_   # A7：厂区高杆灯改偏绿的汞灯（原来暖白，整张图一片橙褐）
_hc = np.array([np.array(_headcol[(round(h_[0], 4), round(h_[1], 4))]) * (1.0 if _headcol[(round(h_[0], 4), round(h_[1], 4))] == MERC else 1.25)
                if (round(h_[0], 4), round(h_[1], 4)) in _headcol else srgb('#ffc070') for h_ in lamp_heads], np.float32).reshape(-1, 3)   # A7：灯头颜色跟灯色走
_lh = tc.box_mesh('lamp_heads', lamp_heads, _hc, emit_mat('lamphead', None, 6.0 * GLOW))
if _lh: _lh.visible_shadow = False                                     # A7：灯头就在点光源正下方，挡出一圈圈黑斑（大道上一串圆形暗斑）
tc.point_lights('sodium', lamp_lights, LAMP * 2 * GLOW, .01)
td.glow_pools('park_pools', PARK_L, .3 * GLOW)
tc.box_mesh('park_lamp_heads', [(x_, y_, .01, .01, .05, .052) for x_, y_, *_ in PARK_L], np.array([c_ for *_, c_ in PARK_L], np.float32).reshape(-1, 3), emit_mat('parklamp', None, 5.0 * GLOW))
td.glow_pools('lamp_pools', LPOOL, .25 * GLOW)
tc.point_lights('pillar_sodium', pil_lights, LAMP * 2 * GLOW * 4, .01)
tc.point_lights('pipe_sodium', pipe_lamps, LAMP * .18 * GLOW, .01)
# 棚屋区：昏暗的暖光与磷光绿（霉菌灯、黑市招牌）
glim, gdots = [], []
for (x, y, w, d, z0, z1), o_ in zip(shacks, sho):
    r, m_ = R.random(), .4 + .6 * vf(x, y); k_ = .5 + .5 * vf(x, y)    # 交界处灯少、也暗
    if LM_GLOW: m_ *= .35 + .65 * _ss((math.hypot(x - WELL7[0], y - WELL7[1]) - .9) / .8)   # A7：7 号井周围 ~120 m 城中村的窗光压暗，井口的冷光更显
    if amc_clear(x, y, .06) or o_ not in _vkeep: continue              # （R 照样取，保持序列）
    if r < .04 * m_: glim.append((x, y, z1 + .04, SODIUM2, k_)); gdots.append((x, y, .008, .008, z1, z1 + .002, *(np.array(SODIUM2) * k_)))
    elif r < .045 * m_: glim.append((x, y, z1 + .04, PHOS, k_)); gdots.append((x, y, .01, .006, z1, z1 + .002, *(np.array(PHOS) * k_)))
for q in range(4):                                                     # 亮度分四档（同一档共用一个灯光数据块）
    lo, hi = .5 + q * .125, .5 + (q + 1) * .125 + (.01 if q == 3 else 0)
    g_ = [(x, y, z, c) for x, y, z, c, k_ in glim if lo <= k_ < hi]
    if g_: tc.point_lights(f'slum_light{q}', g_, LAMP * .4 * GLOW * (lo + hi) / 2, .01)
gd = np.array(gdots, np.float32).reshape(-1, 9)
tc.box_mesh('slum_dots', gd[:, :6], gd[:, 6:], emit_mat('slumdot', None, 4.0 * GLOW))
tc.point_lights('flood', extra_flood, LAMP * 3.6 * GLOW, .03)        # A7 第 2 轮：汞灯暗一些（不和 7 号井抢冷色焦点）
# 西南角的暗区（A3）：稀疏的暖色窗光（楼边地面一小片光 + 门头 / 楼梯间的小亮块）、隔很远才一盏的暗钠灯、零星烧桶——暗但有内容。
# 范围按 smoothstep 渐隐（nx < .15、ny > .8 附近最多）；单独的随机（9105），不动 R。
_drng = np.random.default_rng(9105)
def dark_w(x, y): return _ss((-10.4 - x) / 1.8 + .5) * _ss((-5.5 - y) / 1.4 + .5)
DW_L, DW_G, DW_F = [], [], []
for i in np.concatenate([old, ind]):
    b = city.b[i]; wd_ = dark_w(b['cx'], b['cy'])
    if wd_ < .05: continue
    x, y, w, d, rot = b['obb']; cs, sn = math.cos(rot), math.sin(rot)
    if _drng.random() < .5 * wd_:
        side = _drng.choice([-1, 1]); u_ = _drng.uniform(-.4, .4) * w; v_ = side * (d / 2 + .012)
        lx, ly = x + u_ * cs - v_ * sn, y + u_ * sn + v_ * cs
        DW_L.append((lx, ly, .03, srgb('#ffb060'))); DW_G.append((lx, ly, .007, .005, .02, .022, _drng.uniform(.25, .7)))
for x, y, ang, c, _w in city.along(.22, CAR - {'service'}, side_offset=.008, both=False):
    wd_ = dark_w(x, y)
    if wd_ < .05 or _drng.random() > .4 * wd_: continue
    DW_G.append((x, y, .011, .011, .07, .073, _drng.uniform(.2, .45)))
    if _drng.random() < .5: DW_L.append((x, y, .09, SODIUM2))
for _ in range(40):                                                     # 烧桶：空地上零星几处
    x, y = _drng.uniform(-15, -9.5), _drng.uniform(-9.3, -4.8)
    if _drng.random() > dark_w(x, y) or in_bldg(x, y) or kd_road.find((x, y, 0))[2] < .05 or in_zone(x, y): continue
    DW_F.append((x, y, .03, srgb('#ff7a24'))); DW_G.append((x, y, .006, .006, .004, .006, 1.0))
DG = np.array([v[:6] for v in DW_G], np.float32).reshape(-1, 6)
tc.box_mesh('dark_fill_glints', DG, np.array([np.array(srgb('#ffb868')) * v[6] for v in DW_G], np.float32).reshape(-1, 3), emit_mat('darkfill', None, 4.0 * GLOW))
tc.point_lights('dark_fill', DW_L, LAMP * .9 * GLOW, .015)
tc.point_lights('dark_fire', DW_F, LAMP * .7 * GLOW, .01)
tick(f'dark-area fill: spill {len(DW_L)}, glints {len(DW_G)}, fires {len(DW_F)}')
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
LM_DROP, LM_DROP_H = set(), set()                                       # --no-landmark-glow 时要去掉的 extra_lights / LM_HEADS 下标（随机照常取）
def drop_since(n_l, n_h=None):
    LM_DROP.update(range(n_l, len(extra_lights)))
    if n_h is not None: LM_DROP_H.update(range(n_h, len(LM_HEADS)))
def drop_obj(o):                                                        # 已建好的发光体（建的时候取过随机）：出图前删掉
    if not LM_GLOW: bpy.data.objects.remove(o, do_unlink=True)
def lights_scatter(x, y, z, rx, ry, n, c):                            # 几盏投光：位置随机，不成圈
    for _ in range(n): a, r_ = _lrng.uniform(0, 2 * math.pi), _lrng.uniform(.4, 1.0); extra_lights.append((x + rx * r_ * math.cos(a), y + ry * r_ * math.sin(a), z, c))

# 7 号井黑市：中层竖井落到地面的井口（矮井筒 + 中央深色格栅升降台）+ 井口周围乱搭的市集（摊位篷布，沿放射状通道摆，不成圈）
x, y = WELL7
ground(x, y, 1.6, 1.6)
wl = Batch('well7', mat('well_metal', (.18, .18, .19), .4, .8))
wl.ring(x, y, .3, .32, .05, .3, 48)                                   # 竖井筒的底段（顶在 z≈.6；再往上在中层底板以上，剖切图不画）
wl.ring(x, y, 0, .36, .03, .08, 48)
wl.done()
# 升降台（A3 返修：原来是浅色高光金属板，正上方的冷光在正俯视里镜面反射成一块白方块）：
# 底下是黑的井底，上面是深色油污钢的格栅——一根根扁钢条 + 两道横梁，条缝里透黑；粗糙、低金属度，不再镜面反光
pit_ = Batch('well7_pit', emit_mat('well_pit', srgb('#9fc2ff'), .35 * GLOW) if LM_GLOW else mat('well_pit_dark', (.005, .005, .006), 1)); pit_.box(x, y, .018, .38, .38, .004); pit_.done()   # 格栅缝里透出的冷光（竖井深处的天光反上来），很暗
gs = Batch('well7_grate', tc.noise_mat('well_grate', (.025, .026, .028), (.07, .062, .052), 180, .78, .25))
for k in range(19): gs.box(x - .171 + k * .019, y, .022, .0085, .37, .006)   # 扁钢条（条缝约 1 m）
for v_ in (-.12, .12): gs.box(x, y + v_, .022, .37, .014, .0075)              # 横梁
for sx_ in (-1, 1): gs.box(x + sx_ * .186, y, .022, .012, .38, .007); gs.box(x, y + sx_ * .186, .022, .38, .012, .007)   # 四边的框
gs.done()
gr = Batch('well7_cargo', tc.noise_mat('well_cargo', (.03, .028, .025), (.08, .065, .05), 90, .85, .2))
gr.box(x - .06, y + .05, .026, .16, .12, .05, .1)                     # 升降台上的货笼、货箱（不让井口是一块干净的方块）
for _ in range(7): gr.box(x + R.uniform(-.15, .15), y + R.uniform(-.15, .15), .026, R.uniform(.025, .05), R.uniform(.025, .05), R.uniform(.015, .03), R.uniform(0, 1.5))
gr.done()
stalls, stc, strot = [], [], []
TARP = np.array([(.26, .14, .09), (.16, .18, .2), (.22, .15, .1), (.18, .19, .2), (.24, .22, .2)], np.float32)   # A7 第 3 轮：摊位篷布收成锈褐 / 篷布灰两类（原来五色撒点读成彩色纸屑）
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
if LM_GLOW: shaft = bpy.data.lights.new('shaft_sky', 'AREA'); shaft.shape = 'DISK'; shaft.size = .55; shaft.energy = 7.0 * GLOW * LAMP / .3   # 井底被照成一块冷色的光斑：整张下层唯一的冷色焦点（A3：格栅改深色后略降，冷光落在格栅与井圈上，不再过曝）
if LM_GLOW: shaft.color = srgb('#cfe0ff'); so_ = bpy.data.objects.new('shaft_sky', shaft); so_.location = (x, y, .58); col_main.objects.link(so_)
if LM_GLOW: td.glow_pools('well7_pool', [(x, y, .0068, 1.1, srgb('#7aa6e0'))], .07 * GLOW, 32, 2.4)   # 第 3 轮：只留一圈外晕、降饱和（内圈叠上去像 UI 图标）   # A7：井口一圈冷光（缩小看 7 号井是全图唯一的冷色光斑）
for _ in range(10): a, rr_ = R.uniform(0, 2 * math.pi), R.uniform(.45, .75); extra_lights.append((x + rr_ * math.cos(a), y + rr_ * math.sin(a), .1, SODIUM))
for _ in range(2): a, rr_ = R.uniform(0, 2 * math.pi), R.uniform(.45, .75); extra_lights.append((x + rr_ * math.cos(a), y + rr_ * math.sin(a), .1, PHOS))
layer.marker('well7', (x, y, 0), .8)

# 血肉磨坊：椭圆形地下拳场——锈铁外壳、阶梯看台、中央沙坑；刺眼的白光照着坑
x, y = MILL
ground(x, y, 1.2, .95)
ml = Batch('mill', mat('mill_rust', (.17, .125, .1), .7, .5))   # A7 第 3 轮：锈铁外壳降饱和（原来缩小看是一个粉红椭圆）
for k, (rx, ry, hh) in enumerate(((.5, .38, .12), (.42, .31, .09), (.36, .26, .06), (.31, .22, .04))):
    ml.ring(x, y, 0, 1, .05, hh, 56, rx, ry)                           # 外壳 + 阶梯看台
ml.done()
pit = Batch('pit', mat('pit', (.13, .1, .08), .95)); pit.cyl(0, 0, 0, 1, .006, 48); po = pit.done()   # A7：沙坑降饱和（原来是全区最红的一块，像 UI 图标）
po.scale = (.27, .18, 1); po.location = (x, y, 0)                  # 中央沙坑（椭圆）
_h0 = len(LM_HEADS); lamps_irregular(x, y, .125, .5, .38, 9, WHITE, .014, .3); LM_DROP_H.update(range(_h0, len(LM_HEADS)))   # 看台顶上几盏照坑的灯（沿椭圆一圈）
_n0 = len(extra_lights); extra_lights += [(x + dx, y + dy, .25, WHITE) for dx, dy in ((-.15, 0), (.15, 0), (0, .1), (0, -.1))]; drop_since(_n0)   # 照坑的 4 盏白光：把看台照成一块亮椭圆
layer.marker('blood_mill', (x, y, 0), .5)

# 执法局下层分局：围墙院落、方形主楼、车库；冷白 + 执法蓝
x, y = ENF
ground(x, y, 1.3, 1.05)
ef = Batch('enf_low', mat('enf_concrete', (.17, .17, .18), .75))   # 深灰混凝土：灯下不反成一圈白框
for sx in (-1, 1): ef.box(x + sx * .6, y, 0, .03, 1.0, .06); ef.box(x, y + sx * .5, 0, 1.2, .03, .06)
ef.box(x - .1, y + .1, 0, .6, .45, .2); ef.box(x + .38, y - .25, 0, .25, .3, .08)
for k in range(6): ef.box(x - .35 + k * .12, y - .35, 0, .07, .035, .02)   # 装甲车
ef.done()
_eb = Batch('enf_blue', emit_mat('enf_blue', tuple(.5 * c_ + .5 * w_ for c_, w_ in zip(BLUE, WHITE)), 2.2 * GLOW))   # A7：执法蓝压暗、降饱和（冷色焦点只留 7 号井）       # 执法蓝：大门两盏 + 围墙四角（离散的灯，不描边）
for sx in (-1, 1):
    _eb.box(x - .1 + sx * .06, y - .5, .06, .014, .014, .003)
    for sy in (-1, 1): _eb.box(x + sx * .6, y + sy * .5, .06, .014, .014, .003)
drop_obj(_eb.done())
_n0 = len(extra_lights); lights_scatter(x, y, .2, .5, .4, 5, WHITE); drop_since(_n0)
layer.marker('enforcement_low', (x - .1, y + .1, 0), .6)

# 施粥站：半荒废的旧教堂（中殿屋顶塌了一段）+ 前院长桌与排队人流；暖光
x, y = SOUP
ground(x, y, 1.2, .9)
# A3 辨识度：旧教堂按真实体量——拉丁十字的石墙、铅皮坡屋顶（中殿东段塌了一截，露出几根残存的屋架）、东端半圆后殿、
# 西端方钟楼 + 四坡尖顶；前院一圈矮墙围出排队的场地，院里两口大锅的炉火（暖橙）和帆布棚。几何不取随机；火与棚用单独的随机（9104）。
ch = Batch('soup_church', tc.noise_mat('church_stone', (.2, .185, .16), (.34, .31, .27), 70, .85, .15))
ch.box(x - .22, y + .1, 0, .46, .2, .14); ch.box(x + .28, y + .1, 0, .2, .2, .14)       # 中殿（西段完整，东段墙在、屋顶塌了）
ch.box(x + .05, y + .1, 0, .12, .5, .14)                                                # 耳堂
ch.cyl(x + .38, y + .1, 0, .1, .13, 20)                                                 # 后殿（半圆，一半埋在中殿里）
ch.box(x - .5, y + .1, 0, .11, .11, .3)                                                 # 钟楼
for sx_ in (-1, 1): ch.box(x - .05 + sx_ * .5, y - .3, 0, .018, .44, .035)              # 前院矮墙（东西两道 + 南面两段，中间是院门）
for a0, a1 in ((-.55, -.12), (.02, .45)): ch.box(x - .05 + (a0 + a1) / 2, y - .52, 0, a1 - a0, .018, .035)
ch.done()
SOUP_ROOF = [(x - .22, y + .1, .46, .22, .14, .08, 0), (x + .05, y + .1, .52, .14, .14, .07, math.pi / 2)]   # 中殿西段、耳堂的坡顶（铅皮）
td.prism_mesh('soup_roofs', SOUP_ROOF, [(.13, .135, .135), (.12, .125, .125)], td.city_mat('soup_roofm', .5, .01, 1.8, .3))
sp_ = Batch('soup_spire', tc.noise_mat('soup_slate', (.08, .085, .085), (.15, .15, .14), 60, .6, .15)); sp_.cyl(x - .5, y + .1, .3, .078, .16, 4, r2=.004); sp_.cyl(x + .38, y + .1, .13, .1, .05, 20, r2=.02); sp_.done()
ground(x + .28, y + .1, .19, .19, (.02, .018, .016), z=.006)                            # 塌陷处：殿内地面黑洞洞的
rf_ = Batch('soup_rafters', mat('rafter', (.12, .08, .05), .85))                        # 残存的屋架：几根斜着的木梁
for k in range(4): rf_.box(x + .2 + k * .05, y + .1, .14, .012, .22, .012, .12 * (k % 2) - .06)
rf_.done()
_srng9 = np.random.default_rng(9104)
cvs, cvc, cvr = [], [], []
for k in range(3):                                                      # 教堂南墙根的帆布棚（长桌北边，不挡桌上的灯）
    cvs.append((x - .2 + k * .16 + _srng9.normal(0, .01), y - .08 + _srng9.normal(0, .008), .14, .09, .045, .05)); cvc.append(TARP[_srng9.integers(5)] * _srng9.uniform(.6, .9)); cvr.append(_srng9.normal(0, .06))
tc.box_mesh('soup_canopy', cvs, cvc, td.city_mat('soup_tarp', .85, .006, 1.2), rot=np.array(cvr, np.float32))
pots = Batch('soup_pots', mat('pot', (.06, .06, .06), .6, .6)); fire_ = Batch('soup_fire', emit_mat('soup_fire', srgb('#ff7a24'), 2.2 * GLOW))
for px_, py_ in ((x + .32, y - .3), (x + .4, y - .18)):
    pots.cyl(px_, py_, 0, .022, .014, 16); fire_.cyl(px_, py_, .014, .015, .001, 12); extra_lights.append((px_, py_, .06, srgb('#ff9a40')))
pots.done(); fire_.done()
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
ow = Batch('outpost_glow', emit_mat('outpost_white', srgb('#ffe2b8'), 2.5 * GLOW))   # 探照灯头调暗偏暖（审阅：冷白抢 7 号井）
for sx in (-1, 1):
    for sy in (-1, 1): ow.box(x + sx * .6 + _lrng.normal(0, .01), y + sy * .52 + _lrng.normal(0, .01), .16, .014, .014, .003)   # 岗楼顶的探照灯头（小）
for a in (.5, 2.3, 4.4): ow.box(x + .35 + .12 * math.cos(a), y - .2 + .12 * math.sin(a), .008, .01, .01, .003)   # 停机坪边上三盏（不成圈）
drop_obj(ow.done())
_n0 = len(extra_lights); extra_lights += [(x + sx * .55, y + sy * .47, .3, srgb('#ffe2b8')) for sx in (-1, 1) for sy in (-1, 1)]; drop_since(_n0)   # 四角探照灯：连成一个亮框
layer.marker('outpost', (x, y, 0), .7)

# 资产管理委员会下层设施：有围墙的大型管理设施——只做中性的建筑外观
x, y = AMC
ground(x, y, 2.4, 1.7)
# A3 辨识度：比周围握手楼高一截的主楼（约 35 m，带中庭天井、退台的上部、屋顶机房与通信桅杆），屋面是一条条冷白的日光灯天窗——
# 整个下层只有这里是冷白的荧光灯（别处都是钠灯），隔着 800 m 也能认出来；围墙外再一道铁丝网，两道之间是空的碎石隔离带（净空）；
# 院里停着车。几何不取随机；车辆用单独的随机（9106），不动 R。
am = Batch('amc', tc.noise_mat('amc_concrete', (.15, .15, .155), (.24, .24, .245), 50, .75, .12))
awl = Batch('amc_wall', tc.noise_mat('amc_wallc', (.07, .068, .066), (.12, .115, .11), 60, .85, .12))   # 围墙：深一档，灯下不成一圈亮框
for sx in (-1, 1): awl.box(x + sx * 1.15, y, 0, .04, 1.62, .1); awl.box(x, y + sx * .8, 0, 2.3, .04, .1)
awl.done()
MB = (x - .35, y + .15, 1.0, .7)                                        # 主楼：回字形（中间是天井）
for sx in (-1, 1): am.box(MB[0] + sx * .4, MB[1], 0, .2, .7, .34); am.box(MB[0], MB[1] + sx * .27, 0, .6, .16, .34)
am.box(MB[0] - .4, MB[1] + .02, .34, .2, .62, .07)                     # 上部加层：只压在西翼上，天井露着
am.box(x + .6, y + .2, 0, .6, .5, .16); am.box(x + .55, y - .45, 0, .7, .3, .12)
am.box(x - .45, y - .5, 0, .8, .2, .1)
am.done()
am_top = Batch('amc_roofeq', mat('amc_eq', (.2, .2, .2), .6, .3))
for dx, dy, w_, d_, h_ in ((-.38, .15, .12, .09, .03), (-.33, -.12, .08, .1, .025)): am_top.box(MB[0] + dx, MB[1] + dy, .41, w_, d_, h_)
for dx, dy in ((.4, .05), (.02, .27), (.3, -.27)): am_top.box(MB[0] + dx, MB[1] + dy, .34, .07, .05, .018)
am_top.cyl(MB[0] - .4, MB[1] - .22, .41, .006, .28, 8, r2=.002)          # 通信桅杆
for dx in (-.15, 0, .15): am_top.box(x + .6 + dx, y + .2, .16, .05, .05, .015)   # 附楼屋顶的冷却塔格
am_top.done()
sky_ = Batch('amc_skylights', emit_mat('amc_fluor', srgb('#e6e8dc'), .06 * GLOW))   # A7：日光灯改中性偏暖（不做第二个冷色焦点）  # 附楼的天窗里透出的日光灯：很暗的冷色细带，有几格灭着
skd_ = Batch('amc_skyglass', mat('amc_glass', (.03, .035, .04), .2, .6))
for k in range(9):
    for j, (v0, v1) in enumerate(((-.2, -.02), (.02, .2))):
        (skd_ if (k * 2 + j) % 5 == 3 or (k * 2 + j) % 7 == 1 else sky_).box(x + .38 + k * .055, y + .2 + (v0 + v1) / 2, .1601, .007, v1 - v0, .0012)
sky_.done(); skd_.done()
extra_lights.append((MB[0], MB[1], .2, srgb('#efeadc')))                # 天井里冷白的灯光（窗里透出来的日光灯）
ceq = Batch('amc_fence', mat('amc_fence', (.12, .12, .12), .6, .5))    # 外圈铁丝网（细），与围墙之间是碎石隔离带
for sx in (-1, 1): ceq.box(x + sx * 1.33, y, 0, .008, 1.98, .06); ceq.box(x, y + sx * .98, 0, 2.66, .008, .06)
ceq.done()
gz = Batch('amc_buffer', td.city_mat('amc_gravel', .95, .004, 1.6))   # 碎石隔离带：比路面略亮，不是一圈亮框
for sx in (-1, 1): gz.box(x + sx * 1.24, y, 0, .17, 1.96, .005); gz.box(x, y + sx * .89, 0, 2.64, .17, .005)
bo_ = gz.done(); bo_.data.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER').data.foreach_set('color', np.tile((.075, .07, .065, 1), len(bo_.data.loops)).ravel())
_arng = np.random.default_rng(9106); av, avc, avr = [], [], []
for k in range(9):                                                      # 院里的车：两排，间距不齐，有空位
    if _arng.random() < .25: continue
    av.append((x - .75 + k * .085 + _arng.normal(0, .008), y - .22 + _arng.choice([0, .09]), .07, .032, 0, .03)); avc.append(np.array((.14, .15, .16)) * _arng.uniform(.6, 1.2)); avr.append(math.pi / 2 + _arng.normal(0, .05))
tc.box_mesh('amc_vehicles', av, avc, tc.vcol_mat('amc_vm', .4, .5), rot=np.array(avr, np.float32))
extra_lights += [(x - .45, y - .25, .32, srgb('#ffd9a8')), (x + .15, y - .2, .3, srgb('#ffd9a8')), (x + .95, y + .55, .28, srgb('#ffd9a8'))]   # 院子的投光（暖白，不对称；冷色只留给 7 号井）
jk, jkc, jkr = [], [], []                                               # 隔离带外缘不是一刀齐：贴着铁丝网外侧堆着的棚子、集装箱、拖车（审阅：避免描边框感）
for _ in range(34):
    t_ = _arng.uniform(0, 4); e_ = (t_ % 1) * 2 - 1; side = int(t_); o_ = _arng.uniform(1.0, 1.12)
    px_, py_ = [(e_ * 1.33, -.98 * o_), (1.33 * o_, e_ * .98), (e_ * 1.33, .98 * o_), (-1.33 * o_, e_ * .98)][side]
    jk.append((x + px_, y + py_, _arng.uniform(.03, .09), _arng.uniform(.025, .05), 0, _arng.uniform(.01, .04))); jkc.append(SHACK[_arng.integers(len(SHACK))] * _arng.uniform(.5, 1.0)); jkr.append((0 if side % 2 == 0 else math.pi / 2) + _arng.normal(0, .25))
tc.box_mesh('amc_edge_junk', jk, jkc, td.corrugated_mat('amcjunk', .6, .35, 1500, 1.5), rot=np.array(jkr, np.float32))
aw = Batch('amc_glow', emit_mat('amc_white', SODIUM2, 1.8 * GLOW))   # 墙灯改钠色、调暗（冷色只留给 7 号井）
for sx in (-1, 1):                                                     # 围墙四角、大门两盏，外加几盏不规则的墙灯（不连成一圈白点）
    for sy in (-1, 1):
        if _arng.random() < .45: aw.box(x + sx * (1.15 - _arng.uniform(0, .3)), y + sy * .8, .1, .015, .015, .003)   # 角灯不齐：有的缺、有的离角一段
    aw.box(x - .45 + sx * .08, y - .8, .1, .015, .015, .003)
for _ in range(6):
    if R.random() < .5: aw.box(x + R.uniform(-1.1, 1.1), y + (.8 if R.random() < .5 else -.8), .1, .015, .015, .003)
    else: aw.box(x + (1.15 if R.random() < .5 else -1.15), y + R.uniform(-.75, .75), .1, .015, .015, .003)
drop_obj(aw.done())
_n0 = len(extra_lights); extra_lights += [(x + R.uniform(-1, 1), y + (.85 if R.random() < .5 else -.85), .2, SODIUM2 if R.random() < .6 else SODIUM) for _ in range(5)]; drop_since(_n0)   # 几盏不规则的墙灯，不照出一圈白边
layer.marker('amc_facility', (x - .1, y + .1, 0), 1.2)

# 货运站的照明塔
x, y = YARD
yl = Batch('yard_glow', emit_mat('yard_sodium', SODIUM, 5.0 * GLOW))
for gu in np.linspace(-1.4, 1.4, 6):                                    # 沿铁路方向两排
    for sv in (-1, 1):
        px, py = at(gu, sv * .52); yl.box(px, py, .3, .03, .03, .003, YROT); extra_lights.append((*at(gu, sv * .5), .35, SODIUM))
yl.done()
if not LM_GLOW:                                                        # --no-landmark-glow：去掉 7 号井的冷光晕 / 井口光斑 / 周围压暗，拳场看台一圈灯与照坑白光，
    extra_lights = [v for i, v in enumerate(extra_lights) if i not in LM_DROP]   # 执法局蓝灯与白投光，哨所四角探照灯，资管委墙灯
    LM_HEADS = [v for i, v in enumerate(LM_HEADS) if i not in LM_DROP_H]
tc.point_lights('landmark_light', extra_lights, LAMP * 2.5 * GLOW, .02)
if LM_HEADS: tc.box_mesh('landmark_heads', [(x, y, s, s, z, z + .003) for x, y, z, s, c in LM_HEADS], np.array([c for *_, c in LM_HEADS], np.float32).reshape(-1, 3), emit_mat('lmhead', None, 4.5 * GLOW))
tick('landmarks')

# ---------------- 环境：几乎没有天光（中层底面反射下来的一点暗橙）；--day：浊一点的暖灰天 + 斜射日光（头顶是中层结构，不给正午蓝天）----------------
if DAY:
    tc.day_reset()                                             # 夜景灯光全拆（含 7 号井的竖井冷光）、发光面改暗色漆面
    # 2026-09-29：对齐中层白天版的提亮（中层 sun 3.2→4.2 / 天光 .35→1.0 / +.5 档曝光，已自评 7.5/10）。
    # 下层保留「浊暖灰天」的性格（头顶是中层结构，不给蓝天），只抬能量与曝光：1.8→2.8、天光 .32→.8、+.4 档。
    _t = tc.TOD_SUN.get(layer.tod)                              # --tod dawn|dusk：低角度暖色太阳 + 偏暖的灰紫天；不带 --tod 与原白天版一致
    _sun = bpy.data.lights.new('sun', 'SUN'); _sun.energy = layer.f('--sun', 5.6 if _t else 2.8); _sun.angle = math.radians(2.0); _sun.color = _t[1] if _t else (1, .93, .82)
    _so = bpy.data.objects.new('sun', _sun); col_main.objects.link(_so); _so.rotation_euler = (math.radians(_t[0]), 0, tc.SUN_ROT[2]) if _t else tc.sun_rot()   # 三层共用方位；--day 走白天几何（tc.SUN_ROT_DAY）
    layer.finish(world=((tuple(.7 * c + .3 * .4 for c in _t[2]) if _t else (.44, .41, .36)), layer.f('--ambient', 1.2 if _t else .8)), exposure=layer.f('--dayexp', .7 if _t else .4))
else:
    layer.finish(world=((.5, .38, .25), layer.f('--ambient', .12)), glare_opts=dict(threshold=.75, size=9.5, mix=-.7, tight=(.6, 7, .45)))
