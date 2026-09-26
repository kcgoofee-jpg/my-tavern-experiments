# 天城 · 中层（钢铁霓虹区，约 700 m 以下）· Blender 正俯视写实渲染（夜景草稿）
# 用法：Blender -b -P tiancheng_mid.py -- [--res 1600] [--samples 64] [--out path.png] [--crop x0,y0,x1,y1] [--preview] [--data-only]
#       [--glow 1]（所有发光的倍数）[--ambient .7]（天光）
#       或 python3 tiancheng_mid.py -- ...（pip 装的 bpy）。参数与导出格式三层一致，见 docs/tiancheng-maps.md
# 与上层同一相机、同一平面坐标、同一片城市（tc_city：OpenStreetMap 真实路网与建筑轮廓，© OpenStreetMap contributors）。
# 设定：「层层叠叠的立体建筑群」「全息广告覆盖外墙」「日照被上层遮住，靠人造光」「悬浮轨道是主要公共交通工具，四通八达」。
# 画面：楼顶暗色，霓虹（粉 / 青 / 紫）散布在楼顶边缘与外墙挑出的招牌上，全息广告是楼顶上方的发光平面；
# 几条贯穿全片区的发光悬浮轨道；头顶浮岛（取 map/data/tc_upper.json）在对应位置投下暗色、低对比的椭圆轮廓。
# 曝光：Standard 色彩映射，发光保守，宁暗勿曝。
import bpy, bmesh, math, os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tc_common as tc
from tc_common import W, H, Z_GROUND as ZG, tick, mat, emit_mat, Batch
import numpy as np
from mathutils import Matrix
from mathutils.kdtree import KDTree

layer = tc.Layer('tc_mid', seed=7001, bounces=4)   # 城市在这里生成（第一个随机调用）；本层自己的随机另起种子，不影响城市布局
sc, col_main, city, R, GLOW = layer.sc, layer.col, layer.city, layer.rng, layer.f('--glow', 1)

def srgb(h):                                   # '#ff3d9a' → 线性 RGB
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)
PINK, CYAN, VIOLET, AMBER, ICE = srgb('#ff3d9a'), srgb('#3de0ff'), srgb('#9a4dff'), srgb('#ffa640'), srgb('#cfe6ff')
NEON = [PINK, CYAN, VIOLET, AMBER]; NEON_P = [.36, .34, .22, .08]

# ---------------- 地标位置（全部为推断，除非设定写明）----------------
HQ = (-3.5, 1.5)            # 天城执法局总局：中层核心区（高楼核心之一）
CATH = (6.6, 3.6)           # 辉光大教堂：中层高区（东侧高楼核心旁）
CRADLE = (10.9, 6.6)        # 圣铁摇篮：中层高区的独立院落
UNIV = (-8.2, 6.4)          # 星渊大学
COUNCIL = (.6, -2.3)        # 天城议会（路线图列为中层地标；位置为推断）
CHECK = (4.6, -6.9)         # 层间检查点：中层 C 区 → 下层 7 号井（下层 7 号井在同一平面位置）
RING = dict(cx=0, cy=0, a=14.0, b=9.3, a0=math.radians(148), a1=math.radians(212), w=.95)   # 环城军营带：沿片区西缘的一段环带
def ring_pt(t, off=0):      # t ∈ [0,1] 沿环带；off 为径向偏移（0 = 中线）
    a = RING['a0'] + (RING['a1'] - RING['a0']) * t
    return RING['cx'] + (RING['a'] + off) * math.cos(a), RING['cy'] + (RING['b'] + off * RING['b'] / RING['a']) * math.sin(a), a

zones = [(*HQ, 1.0, .8), (*CATH, 1.15, .85), ('rect', CRADLE[0] - .75, CRADLE[1] - .62, CRADLE[0] + .75, CRADLE[1] + .62),
         (*UNIV, 1.6, 1.15), (*CHECK, .85, .65), (*COUNCIL, 1.05, .8)]
def in_ring(x, y):                                     # 环带内（军营）
    rr = math.hypot(x / RING['a'], y / RING['b']); ang = math.atan2(y, x) % (2 * math.pi)
    return abs(rr - 1) * RING['a'] < RING['w'] / 2 + .05 and RING['a0'] < ang < RING['a1']
ZONES = zones + [in_ring]
city.clip_roads(ZONES)                                 # 地标院落里的小路去掉，大路照常穿过
city.clip_roads([(*CHECK, .45, .45)], keep_major=False)  # 检查点井口一圈连大路也断开（车不从井口上穿过）
keep = city.keep(ZONES); idx = np.where(keep)[0]

# ---------------- 城市：OSM 轮廓挤出，夜间配色（楼顶暗色）+ 楼顶部件 ----------------
import tc_detail as td, tc_city
from tc_city import CAR
tops = tc_city.tops_mid(city, cap=.18)[idx]            # 塔楼顶在悬浮轨道（z≈.22）以下
n = len(idx)
g = R.uniform(.06, .13, n).astype(np.float32)                       # 楼顶：暗灰，略带冷暖差
tint = R.choice(np.array([[1, 1, 1.08], [1.05, 1, .95], [.95, 1, 1.05], [1, .98, 1]], np.float32), n)
cols = g[:, None] * tint
tc.road_plane((.035, .035, .04), m=td.city_mat('ground', .8, .02, 1.2))            # 人行道、地块硬地
city.flat_polys('water', city.water, ZG + .002, (.01, .015, .02), mat('water_n', (.01, .015, .02), .04, spec=.8))
city.flat_polys('parks', city.parks, ZG + .002, (.02, .035, .02), td.city_mat('parkmat', .9, .01, 1.3))
city.roads_mesh('roads', ZG + .004, td.asphalt_mat('road', (.02, .02, .022)))
cmat = td.city_mat('citymat', .55, metal=.15)
city.buildings_mesh('city', idx, ZG, tops, cols, cmat)
kit = tc_city.roof_kit(city, idx, tops, cols, R, 'night', cap=.18)
tc_city.build_roof_kit('city', kit, cmat, td.city_mat('roofmat', .5))
tk = [t for t in city.trees if not any(z(t[0], t[1]) if callable(z) else ((z[1] < t[0] < z[3] and z[2] < t[1] < z[4]) if z[0] == 'rect' else ((t[0] - z[0]) / z[2]) ** 2 + ((t[1] - z[1]) / z[3]) ** 2 < 1) for z in ZONES)]
tc.ico_mesh('trees', [(x, y, ZG + .004 + r * .55, r) for x, y, r in tk], mat('treen', (.01, .018, .01), .9)); tick('city (night)')

# ---------------- 商业街：OSM 的主干道（干线、次干线、支线）就是霓虹走廊 ----------------
# 霓虹、全息广告、车流、溢光都向它们聚集（真实城市的夜景是一条条亮街，不是均匀撒点）
CORR = {'trunk', 'primary', 'secondary', 'tertiary'}
kd_c = city.road_kd(CORR)
def corr_near(x, y): co_, _, d = kd_c.find((x, y, 0)); return co_, d
# 城区决定夜景气质：核心区（曼哈顿中城）霓虹克制、楼里透出暖光；商业区（旺角）霓虹最密；外围（布鲁克林）几乎没有霓虹
NEON_DF = {'core': .12, 'commercial': 1.0, 'outer': .012}
TRAFFIC_DF = {'core': .9, 'commercial': 1.0, 'outer': .35}
# 交界不一刀切：按到各城区多边形的有向距离做 smoothstep 权重（交界处各半，往里 75 m 渐变到纯色），按位置缓存
from functools import lru_cache
def _ss(t): t = min(1, max(0, t)); return t * t * (3 - 2 * t)
@lru_cache(maxsize=None)
def _dmix(xk, yk):
    x, y = xk * .02, yk * .02; w_ = [(D['kind'], _ss(tc_city.sdist(x, y, D['P']) / .75 + .5)) for D in city.districts]
    s_ = sum(v for _, v in w_) or 1; return tuple((k, v / s_) for k, v in w_)
def dmix(x, y): return _dmix(round(x / .02), round(y / .02))
def dval(x, y, tab): return sum(v * tab[k] for k, v in dmix(x, y))
def corr_w(x, y): return math.exp(-corr_near(x, y)[1] / .2)
def glow_w(x, y): return corr_w(x, y) * (.55 + .45 * tc.district(x, y)) * dval(x, y, NEON_DF)

# ---------------- 街道：路灯（商业街亮、背街暗）、标线、车流（车头白、车尾红）----------------
lamps = [(x, y, .01, .01, ZG + .006, ZG + .008) for x, y, *_ in city.along(.12, CAR, side_offset=.008, jitter=.25, rng=R)]
lamps = [l for l in lamps if R.random() >= .15]                      # 间距不齐、偶尔缺一盏，不成等距的珠链
lw = np.array([max(glow_w(l[0], l[1]), .5 * dval(l[0], l[1], {'core': 1, 'commercial': 0, 'outer': 0})) for l in lamps])   # 核心区的街灯也亮
tc.box_mesh('streetlight_main', [l for l, w in zip(lamps, lw) if w > .35], np.tile(srgb('#ffe0b0'), (int((lw > .35).sum()), 1)), emit_mat('streetglow', None, 3.5 * GLOW))
tc.box_mesh('streetlight_back', [l for l, w in zip(lamps, lw) if w <= .35], np.tile(srgb('#ffd0a0'), (int((lw <= .35).sum()), 1)), emit_mat('streetglow2', None, 1.2 * GLOW))
mb, mr, mc = city.road_marks(ZG + .0045, color=(.3, .3, .28)); tc.box_mesh('road_marks', mb, mc, td.city_mat('markmat', .6, ao=0), rot=mr)
cars, crot, cdir, ccol = city.traffic(R, ZG + .004, 3.2, weight=lambda x, y: .08 + .92 * corr_w(x, y) * dval(x, y, TRAFFIC_DF), platoon=True)   # 主干道车多，外围稀疏；车成队
tc.box_mesh('cars', cars, ccol * .35, tc.vcol_mat('carmat', .25, .6), rot=crot)
hb, tb, lr = td.car_lights(cars, cdir)
tc.box_mesh('headlights', hb, np.tile(srgb('#fff4e0'), (len(hb), 1)), emit_mat('head', None, 3.5 * GLOW), rot=lr)
tc.box_mesh('taillights', tb, np.tile(srgb('#ff2a1a'), (len(tb), 1)), emit_mat('tail', None, 3.0 * GLOW), rot=lr)
tick(f'street: lamps {len(lamps)}, cars {len(cars)}')

# ---------------- 霓虹：朝商业街那一面的挑出招牌、临街楼顶灯带、塔楼全息广告 ----------------
strips, srot, scol, signs, sgrot, sigc, holo, hrot, holc, spill = [], [], [], [], [], [], [], [], [], []
for i, top in zip(idx, tops):
    b = city.b[i]; x, y, w, d, rot = b['obb']; wgt = glow_w(b['cx'], b['cy']); nd = dval(b['cx'], b['cy'], NEON_DF)   # nd：城区的霓虹底数（外围几乎为零）
    u = np.array([math.cos(rot), math.sin(rot)]); v = np.array([-u[1], u[0]]); c0 = np.array([x, y])
    (px, py, _), _d = corr_near(b['cx'], b['cy']); to = np.array([px - x, py - y]); to /= (np.linalg.norm(to) + 1e-9)
    faces = [(u, w / 2, v, d), (-u, w / 2, v, d), (v, d / 2, u, w), (-v, d / 2, u, w)]      # (外法线, 半宽, 切向, 面长)
    nrm, half, tan_, flen = max(faces, key=lambda f: float(f[0] @ to))
    pal = [NEON[R.choice(4, p=NEON_P)] for _ in range(2)]                                   # 一栋楼的招牌一两种颜色
    ta = math.atan2(tan_[1], tan_[0])
    if R.random() < .03 * nd + .75 * wgt:                              # 挑出招牌：从临街外墙水平伸出，俯视能在楼缝里看到
        for _ in range(R.integers(2, 7)):
            L = R.uniform(.012, .03); sz = R.uniform(.02, .06); z = R.uniform(max(ZG + .05, top - .9), max(ZG + .06, top - .03))
            p = c0 + nrm * (half + L / 2) + tan_ * R.uniform(-.4, .4) * flen
            signs.append((p[0], p[1], sz, L, z, z + .003)); sgrot.append(ta); sigc.append(pal[R.integers(2)])
        if R.random() < .2: spill.append((signs[-1][0], signs[-1][1], signs[-1][5] + .05, sigc[-1]))
    if R.random() < .02 * nd + .3 * wgt and flen > .04:                # 临街一侧的楼顶灯带
        p = c0 + nrm * (half - .004); strips.append((p[0], p[1], flen * .9, .004, top + .006, top + .009)); srot.append(ta); scol.append(pal[0])
    if b['dk'] == 'commercial' and top > -1.9 and w * d > .006 and R.random() < .02 + .35 * wgt:   # 全息广告：只在商业区，楼顶竖立的窄屏（扫描线纹理）
        holo.append((x, y, w * .5, .004, top + .01, top + .07)); hrot.append(rot); holc.append((PINK, CYAN)[R.integers(2)])
for x, y, *_ in city.along(.35, CORR):                                 # 商业街的彩色溢光：沿街一串点光，染亮路面与低层楼顶
    if glow_w(x, y) > .6: spill.append((x + R.uniform(-.04, .04), y + R.uniform(-.04, .04), ZG + .25, NEON[R.choice(3)]))
tc.box_mesh('neon_strips', strips, scol, emit_mat('neon', None, 5.0 * GLOW), rot=np.array(srot, np.float32))
tc.box_mesh('neon_signs', signs, sigc, emit_mat('signs', None, 4.0 * GLOW), rot=np.array(sgrot, np.float32))
tc.box_mesh('holo_ads', holo, np.array(holc).reshape(-1, 3) * .9, emit_mat('holo', None, .55 * GLOW, stripes=220, alpha=.25), rot=np.array(hrot, np.float32))
lampsR = np.array(kit['lamps'], np.float32).reshape(-1, 3)             # 楼顶小灯、天窗透光
tc.box_mesh('roof_dots', [(x, y, .008, .008, z, z + .002) for x, y, z in lampsR], np.tile(srgb('#ffd9a0'), (len(lampsR), 1)), emit_mat('dots', None, 2.5 * GLOW))
warn = [(x, y, .008, .008, z, z + .003) for x, y, z in kit['towers'] if z > -.6 and R.random() < .6]   # 最高的塔顶才有航空障碍灯（红）
tc.box_mesh('aviation_lights', warn, np.tile(srgb('#ff2020'), (len(warn), 1)), emit_mat('aviation', None, 8.0 * GLOW))
if len(spill) > 1600:                                                  # 点光太多会拖慢渲染：随机留 1600 盏，功率按比例补回
    keep_s = R.choice(len(spill), 1600, replace=False); boost = len(spill) / 1600; spill = [spill[i] for i in keep_s]
else: boost = 1
tc.point_lights('neon_spill', spill, .15 * GLOW * min(boost, 1.6))
# 核心区：楼内透出的暖光——高楼顶冠的金色灯带（装饰艺术风格的楼冠）、退台上的暖光、少量暖色溢光
# 不是一圈统一粗细的描边：每条边是否亮、亮几段、段长、粗细、亮度各不相同；出现的概率和亮度按核心区权重（tc_city.core_w）
# 从核心区往外围逐渐减弱（交界两侧各 100 m），不按城区二选一。单独的随机，不动 R。
_crng = np.random.default_rng(7103)
crown, crot_, ccol_, warm = [], [], [], []
CROWN = np.array(srgb('#ffd9a0'))
for i, top in zip(idx, tops):
    b = city.b[i]
    if b['dk'] not in ('core', 'outer') or top < -2.6: continue        # 约 80 m 以上的楼
    wc = tc_city.core_w(city, b['cx'], b['cy'])
    if wc < .03: continue
    x, y, w, d, rot = b['obb']; u = np.array([math.cos(rot), math.sin(rot)]); v = np.array([-u[1], u[0]]); c0 = np.array([x, y])
    if _crng.random() < .55 * wc:
        kb = wc * _crng.uniform(.4, 1.1)                               # 这栋楼的亮度
        th = _crng.uniform(.0025, .0055)                               # 灯带粗细
        for nrm, half, flen, ang, tan_ in ((v, d / 2, w, rot, u), (-v, d / 2, w, rot, u), (u, w / 2, d, rot + math.pi / 2, v), (-u, w / 2, d, rot + math.pi / 2, v)):
            if _crng.random() < .3: continue                           # 这一面不亮（灯坏了 / 背面没装）
            t = -.46 * flen + _crng.uniform(0, .08) * flen
            while t < .46 * flen:                                      # 一段段的，中间断开
                L = min(_crng.uniform(.15, .6) * flen, .46 * flen - t)
                if L > .004:
                    p = c0 + nrm * (half - .003) + tan_ * (t + L / 2)
                    crown.append((p[0], p[1], L, th, top + .002, top + .005)); crot_.append(ang); ccol_.append(CROWN * kb * _crng.uniform(.55, 1.1))
                t += L + _crng.uniform(.04, .22) * flen
    if _crng.random() < .25 * wc: warm.append((x + _crng.uniform(-.3, .3) * w, y + _crng.uniform(-.3, .3) * d, top - _crng.uniform(.1, .5), srgb('#ffcf8f')))
tc.box_mesh('core_crowns', crown, np.array(ccol_, np.float32).reshape(-1, 3), emit_mat('crown', None, 4.0 * GLOW), rot=np.array(crot_, np.float32))
tc.point_lights('core_warm', warm, .25 * GLOW, .05)
tick(f'core warm light: crown segments {len(crown)}, spill {len(warm)}')
tick(f'neon: signs {len(signs)}, roof strips {len(strips)}, holo {len(holo)}, spill {len(spill)}, aviation {len(warn)}')

# ---------------- 天桥：相邻高楼之间的连廊（「层层叠叠」）----------------
tall = [(city.b[i]['cx'], city.b[i]['cy'], t) for i, t in zip(idx, tops) if t > -1.9]
kd = KDTree(max(1, len(tall)))
for j, (x, y, t) in enumerate(tall): kd.insert((x, y, 0), j)
kd.balance()
bridges, blines, brot = [], [], []
for j, (x, y, t) in enumerate(tall):
    if R.random() > .35: continue
    for (co_, k, dd) in kd.find_range((x, y, 0), .45):
        if k <= j or dd < .2: continue
        x2, y2, t2 = tall[k]; z = min(t, t2) - R.uniform(.1, .6)
        mx, my = (x + x2) / 2, (y + y2) / 2; rot = math.atan2(y2 - y, x2 - x)
        bridges.append((mx, my, dd, .03, z, z + .015)); blines.append((mx, my, dd * .95, .004, z + .015, z + .017)); brot.append(rot)
        break
if bridges:
    tc.box_mesh('skybridges', bridges, np.full((len(bridges), 3), .05), tc.vcol_mat('bridgemat', .4, .6), rot=np.array(brot))
    tc.box_mesh('skybridge_lines', blines, np.array([CYAN if R.random() < .6 else PINK for _ in blines]), emit_mat('bridgeglow', None, 1.2 * GLOW), rot=np.array(brot))
tick(f'skybridges {len(bridges)}')

# ---------------- 悬浮轨道：贯穿全片区的发光曲线 ----------------
ROUTES = [                                                     # 线路走向为推断：串起核心区、教堂、大学、检查点
    [(-16.5, -1.6), (-9, -.4), (-3.5, 2.6), (2, 3.2), (8, 1.4), (16.5, 2.8)],
    [(-7, -10.5), (-4.6, -4), (-2.2, 1.0), (-4.2, 6.5), (-2.5, 10.5)],
    [(3.2, -10.5), (4.2, -5.6), (6.0, 1.8), (9.4, 5.2), (12.5, 10.5)],
    [(-16.5, 7.2), (-8.4, 4.9), (-1.5, 7.8), (6.5, 6.4), (16.5, 8.4)],
    [(-16.5, -7.0), (-7.5, -6.2), (0, -3.8), (4.6, -6.2), (10, -4.4), (16.5, -6.0)],
    [(-13.6, 10.5), (-12.6, 3), (-13.5, -3), (-11.8, -10.5)],  # 沿军营环带的外环线
]
def catmull(pts, n=24):
    P = [pts[0]] + pts + [pts[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = map(np.array, P[i - 1:i + 3])
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(np.array(pts[-1])); return out
def curve_obj(name, pts, z, bevel, m):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = bevel; cu.bevel_resolution = 2; cu.fill_mode = 'FULL'
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts): p.co = (q[0], q[1], z, 1)
    o = bpy.data.objects.new(name, cu); col_main.objects.link(o); o.data.materials.append(m)
    return o
guide_m = mat('guideway', (.05, .055, .06), .35, .7)
rail_m = emit_mat('railglow', ICE, 2.2 * GLOW)
rail_m2 = emit_mat('railglow2', CYAN, 2.0 * GLOW)
trains, trc, trrot, plat, platrot = [], [], [], [], []
for k, r in enumerate(ROUTES):
    pts = catmull(r); zt = .22 + .05 * (k % 3)                  # 不同线路高度错开，交叉处上下穿行
    curve_obj(f'guide{k}', pts, zt, .03, guide_m)
    for s in (-1, 1):                                          # 两条导轨光带
        off = []
        for i, p in enumerate(pts):
            q = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]; nrm = np.array([-q[1], q[0]]) / (np.linalg.norm(q) + 1e-9)
            off.append(p + nrm * .016 * s)
        curve_obj(f'rail{k}{s}', off, zt + .03, .003, rail_m if k % 2 == 0 else rail_m2)
    L = np.cumsum([0] + [np.linalg.norm(pts[i + 1] - pts[i]) for i in range(len(pts) - 1)])
    def at(dist):
        i = int(np.searchsorted(L, dist)); i = min(max(i, 1), len(pts) - 1); t = (dist - L[i - 1]) / (L[i] - L[i - 1] + 1e-9)
        p = pts[i - 1] + (pts[i] - pts[i - 1]) * t; q = pts[i] - pts[i - 1]; return p, math.atan2(q[1], q[0])
    for dist in np.arange(3.0, L[-1] - 1, 6.5):                # 车站：轨道旁的发光站台
        p, a = at(dist); plat.append((p[0], p[1], .5, .16, zt - .02, zt + .012)); platrot.append(a)
    for _ in range(2):                                         # 列车：一串车厢
        d0 = R.uniform(1, L[-1] - 2)
        for c in range(6):
            p, a = at(d0 + c * .085); trains.append((p[0], p[1], .08, .04, zt + .035, zt + .06)); trc.append((.5, .52, .55)); trrot.append(a)
tc.box_mesh('stations', plat, np.full((len(plat), 3), .09), tc.vcol_mat('platmat', .5, .3), rot=np.array(platrot))
st_edge = [(x, y, w * .96, .01, z1, z1 + .002) for x, y, w, d, z0, z1 in plat]
tc.box_mesh('station_glow', st_edge, np.tile(ICE, (len(st_edge), 1)), emit_mat('stglow', None, 3.0 * GLOW), rot=np.array(platrot))
tc.box_mesh('trains', trains, trc, tc.vcol_mat('trainmat', .25, .8), rot=np.array(trrot))
tc.box_mesh('train_windows', [(x, y, w * .8, .012, z1, z1 + .002) for x, y, w, d, z0, z1 in trains],
            np.tile(srgb('#fff2d0'), (len(trains), 1)), emit_mat('trainwin', None, 2.5 * GLOW), rot=np.array(trrot))
tick('maglev')

# ---------------- 地标 ----------------
# 原则：地标靠建筑体量（坡屋顶、穹顶、塔楼的高度差）和被灯照亮的屋面来认，不靠灯点摆出的圈、线、十字。
# 灯：位置有抖动、亮度各不相同、会缺几盏；全部收进一个网格（亮度写在颜色里）。地标的随机单独起种子，不动 R。
LR = np.random.default_rng(7102)
LMP = []                                                        # (x, y, z, 尺寸, 颜色)
def lamp(x, y, z, c, s=.01, k=1.0, jit=0.0, miss=0.0):
    if LR.random() < miss: return
    LMP.append((x + LR.normal(0, jit) if jit else x, y + LR.normal(0, jit) if jit else y, z, s * LR.uniform(.75, 1.25), np.array(c) * k * LR.uniform(.3, 1.0)))
def lamps_along(x0, y0, x1, y1, z, c, n, s=.01, k=1.0, miss=.3):
    """沿一条线的几盏灯：间距不等、亮度不等、有缺。"""
    for t in np.sort(LR.uniform(0, 1, n)): lamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z, c, s, k, .006, miss)
def lamps_scatter(x, y, rx, ry, z, c, n, s=.01, k=1.0, miss=.2):
    """一片区域里随手立的灯（广场、院子）：不成圈。"""
    for _ in range(n):
        a, r = LR.uniform(0, 2 * math.pi), math.sqrt(LR.uniform(.05, 1))
        lamp(x + rx * r * math.cos(a), y + ry * r * math.sin(a), z, c, s, k, 0, miss)
def ground(x, y, w, d, c=(.026, .026, .028), rot=0, z=ZG + .006):   # 地标底板：默认与路面同色、带沥青斑驳，不像一块面板
    b = Batch('pl', td.asphalt_mat('pl', c, 1.3)); b.box(x, y, z - .006, w, d, .006, rot); return b.done()
def stone(name, c1, c2, rough=.7, scale=60): return tc.noise_mat(name, c1, c2, scale, rough, .15)   # 石材 / 铅皮：带斑驳的底色
ROOFS, ROOFC = [], []                                           # 地标的坡屋顶（td.prism_mesh）：(x, y, 长, 宽, 檐口高, 屋脊高, 朝向)
RIDGE = []                                                      # 屋脊压条（铅皮 / 石材的脊瓦）：俯视时坡屋顶中间那道折线
def gable(x, y, L, wd, z, rh, rot, c):
    ROOFS.append((x, y, L, wd, z, rh, rot)); ROOFC.append(tuple(v * LR.uniform(.9, 1.1) for v in c))
    RIDGE.append((x, y, L * .99, max(.008, wd * .045), z + rh - .01, z + rh + .004, rot))
FLOOD, KEY = [], []                                             # 照亮屋面的投光（从周围楼顶打过来，位置不对称）；KEY 是贴着一侧的主投光，照出坡面、穹顶的明暗面

# 执法局总局：总部大楼 + 前广场 + 围墙；冷白 + 执法蓝灯
x, y = HQ; blue = srgb('#4f8dff')
ground(x, y, 1.9, 1.5)
hq = Batch('hq', mat('hq_roof', (.07, .075, .085), .4, .5))
hq.box(x, y + .15, ZG, 1.05, .62, 3.3)                          # 裙楼
hq.box(x, y + .2, ZG, .5, .44, 3.72)                            # 主楼（顶在 z≈.12）
for dx in (-.4, .4): hq.box(x + dx, y + .2, ZG, .16, .38, 3.55)
for sx in (-1, 1):                                              # 围墙
    hq.box(x + sx * .92, y, ZG, .03, 1.42, .25); hq.box(x, y + sx * .72, ZG, 1.86, .03, .25)
hq.box(x + .06, y + .24, ZG + 3.72, .2, .2, .004)               # 楼顶停机坪（比屋面略浅的一块，不画灯圈）
hq.box(x - .14, y + .08, ZG + 3.72, .08, .06, .03); hq.box(x + .17, y + .05, ZG + 3.72, .05, .09, .02)   # 楼顶机房
hq.done()
for sx in (-1, 1):                                              # 围墙上的灯：不等距、有缺
    lamps_along(x + sx * .92, y - .6, x + sx * .92, y + .6, ZG + .25, blue, 5, .012, 1.4); lamps_along(x - .8, y + sx * .72, x + .8, y + sx * .72, ZG + .25, blue, 6, .012, 1.4)
lamp(x - .2, y + .38, ZG + 3.72, srgb('#ff2020'), .012, 1.6); lamp(x + .21, y + .01, ZG + 3.72, srgb('#ff2020'), .012, 1.6)   # 航空障碍灯（两角，不对称）
for _ in range(3): lamp(x + .06 + LR.uniform(-.1, .1), y + .24 + LR.choice([-.1, .1]), ZG + 3.73, ICE, .008, 1.0)            # 停机坪边上几盏
lamps_scatter(x, y - .45, .45, .16, ZG + .01, ICE, 9, .011, 1.2)  # 前广场的灯杆
FLOOD += [(x - .5, y - .3, ZG + 4.2, ICE), (x + .35, y + .55, ZG + 4.1, ICE)]
layer.marker('enforcement_hq', (x, y + .2, 0), .9)

# 辉光大教堂：拉丁十字平面——中殿与耳堂是铅皮坡屋顶，两侧低矮的侧廊，飞扶壁，交叉处鼓座 + 穹顶，东端半圆后殿与放射状小礼拜堂，
# 西立面双塔 + 八角尖塔。「辉光」只在穹顶采光亭和被投光照亮的屋面上，不画灯串。
x, y = CATH; gold = srgb('#ffc56b')
ground(x - .2, y, 2.1, 1.5)
ground(x - .98, y, .5, .95, (.075, .07, .062))                  # 西侧前广场（石铺，比街区略亮）
ca = Batch('cathedral', stone('cath_stone', (.24, .22, .2), (.4, .37, .33)))
EAVE, AISLE = ZG + 3.0, ZG + 2.78
ca.box(x - .06, y, ZG, 1.12, .3, 3.0)                           # 中殿墙体（檐口 EAVE）
ca.box(x + .14, y, ZG, .28, .86, 3.0)                           # 耳堂墙体
for sy in (-1, 1):
    ca.box(x - .25, y + sy * .22, ZG, .74, .14, 2.78)           # 侧廊（低一截）
    for k in range(6):                                          # 扶壁墩 + 飞扶壁（跨过侧廊顶，搭到中殿墙上）
        bx = x - .56 + k * .125
        ca.box(bx, y + sy * .305, ZG, .045, .05, 2.93)
        ca.box(bx, y + sy * .23, AISLE + .06, .022, .16, .035)
ca.cyl(x + .5, y, ZG, .15, 2.96, 24)                            # 后殿（半圆，一半埋在中殿里）
for a in (-1.0, 0, 1.0):                                        # 放射状小礼拜堂
    ca.cyl(x + .5 + .17 * math.cos(a), y + .17 * math.sin(a), ZG, .055, 2.7, 16)
for sy in (-1, 1): ca.box(x - .68, y + sy * .12, ZG, .15, .15, 3.4)   # 西立面双塔
ca.box(x - .68, y, ZG, .1, .12, 3.05)                           # 双塔之间的山墙门廊
ca.cyl(x + .14, y, EAVE, .115, .2, 24)                          # 交叉处鼓座
ca.done()
roofm = td.city_mat('cath_roofm', .45, .01, 1.6, .5)
LEAD = (.12, .13, .13)
gable(x - .06, y, 1.12, .32, EAVE, .2, 0, LEAD)                # 中殿坡顶（屋脊东西向）
gable(x + .14, y, .88, .3, EAVE, .2, math.pi / 2, LEAD)        # 耳堂坡顶（屋脊南北向）
for sy in (-1, 1): gable(x - .25, y + sy * .22, .74, .14, AISLE, .03, 0, (.14, .14, .13))   # 侧廊的低坡顶
td.prism_mesh('cath_roofs', ROOFS[-4:], ROOFC[-4:], roofm)
sp = Batch('cath_spires', stone('cath_spire', (.1, .11, .11), (.2, .21, .2), .5))
sp.cyl(x + .5, y, ZG + 2.96, .15, .12, 24, r2=.02)              # 后殿的锥形屋顶
for a in (-1.0, 0, 1.0): sp.cyl(x + .5 + .17 * math.cos(a), y + .17 * math.sin(a), ZG + 2.7, .055, .06, 16, r2=.01)
for sy in (-1, 1): sp.cyl(x - .68, y + sy * .12, ZG + 3.4, .075, .38, 8, r2=.004)   # 八角尖塔
sp.done()
dm = Batch('cath_dome', stone('cath_dome', (.1, .15, .13), (.2, .26, .22), .45, 40), smooth=True)   # 铜绿穹顶
dm.ico(x + .14, y, EAVE + .2, .115, .85, 3); dm.cyl(x + .14, y, EAVE + .3, .028, .06, 12)
dm.done()
lan = Batch('cath_lantern', emit_mat('cath_gold', gold, .7 * GLOW)); lan.cyl(x + .14, y, EAVE + .36, .012, .004, 12); lan.done()   # 采光亭里透出的一点金光
FLOOD += [(x + .55, y + .5, ZG + 3.8, gold), (x - .95, y + .3, ZG + 3.5, gold)]
KEY += [(x - .3, y - .45, EAVE + .06, gold), (x + .35, y - .5, EAVE + .1, gold)]
lamps_scatter(x - .98, y, .22, .42, ZG + .01, gold, 9, .011, 1.1)   # 前广场的灯杆
layer.marker('radiance_cathedral', (x + .1, y, 0), 1.0)

# 圣铁摇篮：独立院落——高墙、四面回廊、中庭训练场、小礼拜堂；灯光稀少
x, y = CRADLE
ground(x, y, 1.45, 1.2)
cr = Batch('cradle', mat('cradle_roof', (.09, .09, .1), .5, .6))
for sx in (-1, 1): cr.box(x + sx * .7, y, ZG, .05, 1.2, .5); cr.box(x, y + sx * .58, ZG, 1.45, .05, .5)
for sx in (-1, 1): cr.box(x + sx * .45, y, ZG, .2, .8, 1.2); cr.box(x, y + sx * .36, ZG, .7, .16, 1.2)   # 回廊四翼
cr.box(x + .52, y - .45, ZG, .22, .12, 1.8); cr.cyl(x - .52, y - .45, ZG, .07, 1.9, 16)             # 礼拜堂、钟楼
cr.done()
ground(x, y, .66, .52, (.16, .13, .09))                          # 中庭训练场（沙地）
lamps_scatter(x, y, .3, .22, ZG + .01, srgb('#ffcf8a'), 7, .01, .9)
for sx in (-1, 1): lamps_along(x + sx * .7, y - .5, x + sx * .7, y + .5, ZG + .5, srgb('#ffcf8a'), 4, .01, .9)
layer.marker('iron_cradle', (x, y, 0), .7)

# 环城军营带：沿西缘的一段环带——营房长楼、操场、双层围墙、探照灯塔
bm_ = Batch('barracks', mat('barracks_roof', (.07, .08, .07), .6, .3))
yard = Batch('barracks_yard', mat('yard', (.06, .062, .06), .8))
N = 90
for i in range(N):
    t0, t1 = i / N, (i + 1) / N
    x0, y0, _ = ring_pt(t0); x1, y1, _ = ring_pt(t1); a = math.atan2(y1 - y0, x1 - x0); L = math.hypot(x1 - x0, y1 - y0) * 1.04
    for off in (-RING['w'] / 2, RING['w'] / 2):                 # 围墙（内外两道）
        px, py, _ = ring_pt((t0 + t1) / 2, off); bm_.box(px, py, ZG, L, .03, .3, a)
        if LR.random() < .14: lamp(px, py, ZG + .3, ICE, .02, 1.3)   # 墙灯：不等距、亮度不一
    px, py, _ = ring_pt((t0 + t1) / 2); yard.box(px, py, ZG, L, RING['w'] * .95, .006, a)
    seg = i % 10
    if seg < 7:                                                # 营房：垂直于环带的长条楼
        for off in (-.24, .2):
            if seg % 2 == 0:
                px, py, _ = ring_pt((t0 + t1) / 2, off); bm_.box(px, py, ZG, .07, .3, R.uniform(.9, 1.3), a)
    elif seg == 8:                                             # 探照灯塔
        px, py, _ = ring_pt((t0 + t1) / 2, 0); bm_.cyl(px, py, ZG, .03, 1.6, 12); lamp(px, py, ZG + 1.6, ICE, .045, 1.4, 0, .2)
bm_.done(); yard.done()
layer.marker('barracks_ring', (*ring_pt(.5)[:2], 0), 1.0)

# 星渊大学：草坪方庭、坡顶的学院楼（长短、朝向略有出入，不是对称的方框）、图书馆的深色玻璃穹顶、天文台；庭院里的树；路灯暖白
x, y = UNIV
ground(x, y, 3.0, 2.1)
lawn = Batch('univ_lawn', mat('univ_lawn', (.02, .045, .02), .9))
LAWNS = [(x + dx + LR.uniform(-.04, .04), y + dy + LR.uniform(-.03, .03), .7 * LR.uniform(.85, 1.05), .5 * LR.uniform(.85, 1.05)) for dx, dy in ((-.6, .3), (.5, .3), (-.6, -.45), (.5, -.45))]
for lx, ly, lw2, ld2 in LAWNS: lawn.box(lx, ly, ZG + .006, lw2, ld2, .004)
lawn.done()
un = Batch('univ', stone('univ_wall', (.1, .085, .07), (.17, .14, .11)))
n0 = len(ROOFS); SLATE = (.11, .1, .1)
for dx in (-1.25, 1.2):                                         # 东西两排学院楼（南北向长楼，坡顶）
    for dy in (-.8, -.2, .5):
        L2 = .42 * LR.uniform(.75, 1.15); ww = .26 * LR.uniform(.85, 1.1); hh = LR.uniform(2.1, 2.6); cx_ = x + dx + LR.uniform(-.05, .05)
        un.box(cx_, y + dy, ZG, ww, L2, hh); gable(cx_, y + dy, L2, ww + .02, ZG + hh, ww * .35, math.pi / 2, SLATE)
for dx in (-.6, .5):                                            # 南北两排（东西向长楼）
    for dy, hh in ((.78, 2.6), (-.9, 2.4)):
        L2 = .7 * LR.uniform(.8, 1.05); ww = .15 * LR.uniform(.9, 1.15); cx_ = x + dx + LR.uniform(-.06, .06)
        un.box(cx_, y + dy, ZG, L2, ww, hh); gable(cx_, y + dy, L2, ww + .02, ZG + hh, ww * .4, 0, SLATE)
un.cyl(x - .05, y - .08, ZG, .22, 2.6, 32)                       # 图书馆（圆形阅览室的鼓座）
un.done()
td.prism_mesh('univ_roofs', ROOFS[n0:], ROOFC[n0:], td.city_mat('univ_roofm', .55, .01, 1.5, .2))
gl_ = mat('univ_glass', (.025, .03, .035), .1, .9)              # 玻璃穹顶：深色、反光（映出投光），不自发光
dome = Batch('univ_dome', gl_, smooth=True); dome.ico(x - .05, y - .08, ZG + 2.6, .2, .6, 3); dome.done()
obs = Batch('observatory', mat('obs', (.3, .31, .33), .3, .8), smooth=True); obs.cyl(x + 1.2, y + .95, ZG, .1, 3.0, 24); obs.ico(x + 1.2, y + .95, ZG + 3.0, .1, .8, 2); obs.done()
tk_u = []                                                       # 庭院里的树：沿草坪边缘多、中间少
for lx, ly, lw2, ld2 in LAWNS:
    for _ in range(int(LR.integers(5, 11))):
        u_, v_ = LR.uniform(-.5, .5), LR.uniform(-.5, .5)
        if abs(u_) < .35 and abs(v_) < .35 and LR.random() < .7: continue
        r_ = LR.uniform(.02, .04); tk_u.append((lx + u_ * lw2, ly + v_ * ld2, ZG + .01 + r_ * .55, r_))
tc.ico_mesh('univ_trees', tk_u, mat('treeu', (.03, .05, .025), .9))
lamps_along(x - 1.05, y - .12, x - .3, y - .12, ZG + .01, srgb('#ffe2b0'), 5, .01, 1.1)   # 草坪之间的步道灯（不等距、有缺）
lamps_along(x + .22, y - .1, x + 1.0, y - .05, ZG + .01, srgb('#ffe2b0'), 5, .01, 1.1)
lamps_along(x - .07, y - .8, x - .03, y - .35, ZG + .01, srgb('#ffe2b0'), 3, .01, 1.1)
lamps_along(x - .05, y + .2, x - .09, y + .7, ZG + .01, srgb('#ffe2b0'), 3, .01, 1.1)
FLOOD += [(x - .5, y + .3, ZG + 3.2, srgb('#ffe2b0'))]
KEY += [(x - .4, y - .45, ZG + 2.75, srgb('#ffe2b0'))]
layer.marker('starabyss_univ', (x - .05, y - .08, 0), 1.4)

# 层间检查点：中层 C 区 → 下层 7 号井通道——竖井口、闸口、排队通道；琥珀 / 红色警示灯
x, y = CHECK
ground(x, y - .1, 1.6, 1.4)
ck = Batch('checkpoint', mat('ck', (.1, .1, .1), .5, .5))
ck.ring(x, y, ZG, .34, .06, .35, 28)                            # 井口围墙（圆形混凝土井圈）
ck.box(x - .02, y + .36, ZG, .3, .13, .52)                      # 井口北侧的提升机房（跨在井圈上）
ck.box(x + .27, y + .2, ZG, .09, .12, .42); ck.box(x - .3, y + .12, ZG, .07, .09, .4)   # 井圈边的配电房、值班室
for sx in (-1, 1): ck.box(x + sx * .55, y - .1, ZG, .22, .55, .7)          # 两侧闸楼
nl = int(R.integers(6, 9)); lw_ = .06; x0 = x - nl * lw_ / 2         # 排队闸道：6–8 条平行
for k in range(nl + 1): ck.box(x0 + k * lw_, y - .58, ZG, .006, .26, .05)  # 闸道隔栏
for k in range(nl): ck.box(x0 + (k + .5) * lw_, y - .43, ZG, .04, .04, .06)   # 闸道头的岗亭
ck.done()
cn = Batch('ck_canopy', mat('ck_canopy', (.14, .14, .13), .6, .5)); cn.box(x, y - .25, ZG + .37, .9, .35, .012); cn.done()   # 井口南侧的半边雨棚
eq = []                                                         # 闸楼屋顶设备
for sx in (-1, 1):
    for _ in range(int(R.integers(3, 6))):
        eq.append((x + sx * .55 + R.uniform(-.07, .07), y - .1 + R.uniform(-.22, .22), R.uniform(.02, .045), R.uniform(.02, .04), ZG + .7, ZG + .7 + R.uniform(.01, .03)))
tc.box_mesh('ck_roof_eq', eq, np.full((len(eq), 3), .16), tc.vcol_mat('ck_eqm', .6, .4))
void = Batch('shaft', mat('shaft', (.0, .0, .0), 1)); void.cyl(x, y, ZG - 2, .3, 2.01, 28); void.done()
ck_l = []
for k in range(nl):                                             # 闸道头的琥珀灯、闸道尾的红灯：亮度不一，个别不亮
    lx, ly = x0 + (k + .5) * lw_, y - .43; lamp(lx, ly, ZG + .06, AMBER, .01, 1.1, .002, .15); ck_l.append((lx, ly, ZG + .1, AMBER))
    lamp(lx, y - .71, ZG + .05, srgb('#ff3030'), .01, 1.1, .002, .25)
lamp(x + .55 + .07, y - .28, ZG + .7, AMBER, .012, .8); lamp(x - .55 - .04, y + .05, ZG + .7, AMBER, .012, .5)   # 闸楼顶的两盏工作灯（不对称）
tc.point_lights('ck_lamps', ck_l, .08 * GLOW, .01)
FLOOD += [(x + .25, y - .75, ZG + 1.2, AMBER), (x - .6, y + .45, ZG + 1.4, ICE)]
layer.marker('checkpoint_c', (x, y, 0), .6)

# 天城议会：H 形的政府大楼——主楼中央鼓座 + 穹顶 + 采光亭，南面柱廊门廊与台阶，两翼坡顶，后面两个内院；暖白投光，比周围的霓虹安静
x, y = COUNCIL
ground(x, y - .2, 1.9, 1.4)
ground(x, y - .74, .9, .38, (.075, .07, .064))                   # 前庭石面
cc = Batch('council', stone('council_stone', (.22, .21, .2), (.36, .34, .31)))
MAIN = ZG + 3.1
cc.box(x, y + .05, ZG, 1.2, .36, 3.1)                           # 主楼
for sx in (-1, 1):
    cc.box(x + sx * .62, y + .02, ZG, .3, .86, 3.0)             # 两翼（南北向）
    cc.box(x + sx * .3, y + .38, ZG, .08, .32, 2.9)             # 后部连廊（围出两个内院）
cc.box(x, y + .47, ZG, 1.0, .12, 2.9)                           # 后楼
cc.cyl(x, y + .05, MAIN, .19, .13, 32)                          # 鼓座
for k in range(9): cc.box(x - .2 + k * .05, y - .24, ZG, .022, .022, 2.95)   # 门廊柱子
for k, (w_, d_) in enumerate(((.62, .07), (.54, .06), (.46, .05))): cc.box(x, y - .33 - k * .045, ZG, w_, d_, .015 * (3 - k))   # 台阶
cc.done()
gable(x, y + .05, 1.2, .38, MAIN, .11, 0, (.15, .15, .14))      # 主楼坡顶
for sx in (-1, 1): gable(x + sx * .62, y + .02, .86, .32, ZG + 3.0, .1, math.pi / 2, (.15, .15, .14))
gable(x, y + .47, 1.0, .14, ZG + 2.9, .04, 0, (.15, .15, .14))
gable(x, y - .25, .16, .5, ZG + 2.95, .07, math.pi / 2, (.3, .29, .27))   # 门廊山花（石材）
td.prism_mesh('council_roofs', ROOFS[-5:], ROOFC[-5:], td.city_mat('council_roofm', .5, .01, 1.5, .3))
cd = Batch('council_dome', stone('council_dome', (.13, .14, .14), (.24, .25, .24), .4, 40), smooth=True)
cd.ico(x, y + .05, MAIN + .13, .18, .7, 3); cd.cyl(x, y + .05, MAIN + .24, .03, .06, 12); cd.done()
cl_ = Batch('council_lantern', emit_mat('council_warm', srgb('#fff0d0'), .3 * GLOW)); cl_.cyl(x, y + .05, MAIN + .3, .012, .004, 12); cl_.done()
lamps_scatter(x, y - .74, .4, .15, ZG + .01, srgb('#fff0d0'), 8, .011, 1.0)   # 前庭灯杆
FLOOD += [(x + .45, y - .65, ZG + 3.7, srgb('#fff0d0')), (x + .7, y + .7, ZG + 3.6, srgb('#ffe2b0'))]
KEY_SOFT = [(x - .3, y - .75, MAIN + .08, srgb('#fff0d0')), (x + .35, y - .7, MAIN + .15, srgb('#fff0d0'))]   # 议会：投光弱一些（石材浅，容易过曝）
layer.marker('council', (x, y, 0), .9)

L_ = [l for l in LMP]
tc.box_mesh('landmark_lamps', [(x, y, s, s, z, z + .003) for x, y, z, s, c in L_], np.array([c for *_, c in L_], np.float32).reshape(-1, 3), emit_mat('lm_lamp', None, 3.2 * GLOW))
RG = np.array(RIDGE, np.float32).reshape(-1, 7)
tc.box_mesh('landmark_ridges', RG[:, :6], np.tile((.22, .22, .21), (len(RG), 1)), td.city_mat('ridgem', .5, 0, 1.2, .4), rot=RG[:, 6])
tc.point_lights('landmark_flood', FLOOD, 1.2 * GLOW, .15)       # 补光
tc.point_lights('landmark_key', KEY, 14.0 * GLOW, .08)
tc.point_lights('landmark_key_soft', KEY_SOFT, 6.0 * GLOW, .08)            # 主投光：把屋面照出明暗（坡面、穹顶的受光面与背光面）
tick(f'landmarks: lamps {len(L_)}, flood {len(FLOOD)}')

# ---------------- 头顶浮岛的投影：夜里没有日照，挡住的是上方漫射下来的天光，所以影子在岛的正下方、边缘很虚 ----------------
# 用三层逐渐缩小的半透明暗面叠出柔和的边（不画描边）。岛的轮廓由查看器的「上层投影」叠加层给出。
soft = [Batch(f'isle_shade{k}', tc.shade_mat(f'isle_shade{k}', (0, 0, 0), a)) for k, a in enumerate((.1, .12, .14))]
for iid, ix, iy, rx, ry, rot, alt in tc.upper_islands():
    for k, sc_ in enumerate((1.2, 1.0, .78)):
        bm = soft[k].bm; ret = bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=1)
        bmesh.ops.transform(bm, verts=ret['verts'], matrix=Matrix.Translation((ix, iy, .6 + k * .01)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((rx * sc_, ry * sc_, 1, 1)))
for b_ in soft: b_.done().visible_shadow = False
tick('island shadows')

# ---------------- 环境光：没有日照，只剩上层漏下来的一点冷色天光 ----------------
# 光晕两层：贴着灯管的小光晕（Bloom：霓虹、车灯边缘的溢光）+ 大范围的雾光（Fog Glow 半径加大到真正会扩散的尺度，强度略降，不整体过曝）
layer.finish(world=((.35, .42, .6), layer.f('--ambient', .7)), glare_opts=dict(threshold=.7, size=9.5, mix=-.6, tight=(.55, 7, .55)))
