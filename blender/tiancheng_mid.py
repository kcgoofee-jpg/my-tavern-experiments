# 天城 · 中层（钢铁霓虹区，约 700 m 以下）· Blender 正俯视写实渲染（夜景草稿）
# 用法：Blender -b -P tiancheng_mid.py -- [--res 1600] [--samples 64] [--out path.png] [--crop x0,y0,x1,y1 | --crops "x0,y0,x1,y1:名字;..." | --crops-json 文件] [--out-dir 目录] [--preview] [--data-only]
#       [--glow 1]（所有发光的倍数）[--ambient .7]（天光）[--no-landmark-glow]（去掉地标围墙上连成框 / 圈的灯）[--day]（白天版：日光 + 天光，霓虹 / 轨道光带熄灭或改暗）
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
DAY = layer.day                                    # --day：白天版（日光；夜景元素熄灭 / 改暗，几何与随机序列不变，见文末与各处 DAY 分支）
sc, col_main, city, R, GLOW = layer.sc, layer.col, layer.city, layer.rng, 0 if DAY else layer.f('--glow', 1)   # --day：发光倍数置 0

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
         ('rect', UNIV[0] - 1.66, UNIV[1] - 1.2, UNIV[0] + 1.66, UNIV[1] + 1.2), (*CHECK, .85, .65), (*COUNCIL, 1.05, .8)]   # 大学：方形校园，围墙外留一圈净空（A3）
# 核心 / 外围交界（A3）：交界大道（tc_city.mid_seam_x，斜向起伏）上串三个小广场——两套街网在这里各自收头，不再硬碰
import tc_city
PLAZAS = [(tc_city.mid_seam_x(y), y, .36, .27) for y in (-2.2, 3.4, 7.6)]
zones += PLAZAS
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
# 楼顶材料（A3）：按楼分四档——沥青卷材（最暗、最糙）、水泥（灰）、浅色防水膜 / 砾石（亮一档）、金属 / 玻璃顶（暗、带天光反光）。
# 颜色与粗糙度一起变；核心区全用，往外围按 core_w 渐弱（外围本来就是杂色联排）。单独的随机（7104），不动 R。
_vrng = np.random.default_rng(7104)
RCLS = [((.045, .045, .05), .92, 0.0), ((.095, .095, .1), .72, .05), ((.12, .116, .11), .85, 0.0), ((.065, .075, .085), .32, .55)]   # 审阅：楼顶宁暗，浅档压到 .12
rcls = _vrng.choice(4, size=n, p=[.28, .38, .16, .18])
rjit = _vrng.uniform(.8, 1.15, n).astype(np.float32); rtint = _vrng.uniform(-.012, .012, (n, 3)).astype(np.float32)
bw_core = np.array([tc_city.core_w(city, city.b[i]['cx'], city.b[i]['cy']) if city.b[i]['dk'] in ('core', 'outer') else .55 for i in idx], np.float32)
# A6 交界材质过渡：核心 / 商业交界两侧约 120 m 内，楼顶材料的混合比例也渐变（原来商业区恒为 .55、核心恒为 1，交界一刀切）
def _dmixw(x, y, band=2.4):                                             # 宽过渡带的城区权重（交界处各半，往里约 120 m 渐变到纯色）
    w_ = [(D['kind'], tc_city._ss(tc_city.sdist(x, y, D['P']) / band + .5)) for D in city.districts]; s_ = sum(v for _, v in w_) or 1
    return {k: v / s_ for k, v in w_}
MIXW = [_dmixw(city.b[i]['cx'], city.b[i]['cy']) for i in idx]
for j, i in enumerate(idx):
    dk_ = city.b[i]['dk']
    if dk_ == 'commercial': bw_core[j] = .55 + .45 * MIXW[j].get('core', 0)
    elif dk_ == 'core': bw_core[j] = bw_core[j] * (1 - .45 * MIXW[j].get('commercial', 0))
for j in range(n):
    c_ = np.array(RCLS[rcls[j]][0], np.float32) * rjit[j] + rtint[j]
    cols[j] = cols[j] * (1 - .85 * bw_core[j]) + np.clip(c_, .01, 1) * .85 * bw_core[j]
# A6 核心区亮度：A5 缩小看核心区比外围暗一档、楼的高低读不出。按楼高排名给屋面亮度（矮楼 ×.84 → 最高 ×1.18，平均约 1），
# 整体再 ×1.08；由 real_mesh 的 CORE_SHADE 让最高一级屋面偏亮偏暖、低的退台更暗（最高一级合计提亮约 20%，屋面平均约 12%）。
core_j = np.array([j for j, i in enumerate(idx) if city.b[i]['dk'] == 'core'], np.int64)
if len(core_j):
    rk = np.argsort(np.argsort(tops[core_j])) / max(1, len(core_j) - 1)
    # A7：缩小看核心区仍偏暗、楼高层次弱——排名亮度拉开（矮楼 ×.74 → 最高 ×1.62），整体再提约 15%；退台曲线更陡（低退台更暗、顶级更亮更暖）
    cols[core_j] *= (1.25 * (.55 + .95 * rk ** 1.5))[:, None].astype(np.float32)
CORE_SHADE = dict(lo=.4, span=.9, gamma=1.15, top=(1.14, 1.05, .9))
# A6 交界亮度过渡：各城区（远离交界处）屋面的平均亮度——核心区按真实楼屋面的实际色调折算（REAL_TONES × CORE_SHADE 顶级）——
# 交界两侧约 120 m 内按宽过渡带的城区权重，把每栋楼的亮度往「混合后的目标亮度」拉，拼缝两边不再差一档。纯确定性。
LUM = np.array([.2126, .7152, .0722], np.float32)
EFF = {'core': float(np.dot(tc_city.REAL_TONE_P, [np.dot(t, LUM) for t in tc_city.REAL_TONES])) * 1.12, 'commercial': 1.0, 'outer': 1.0}
lum = (cols @ LUM) * np.array([EFF.get(city.b[i]['dk'], 1.0) for i in idx], np.float32)
DL = {}
for k in EFF:
    sel_ = [j for j, i in enumerate(idx) if city.b[i]['dk'] == k and MIXW[j].get(k, 0) > .99]
    if sel_: DL[k] = float(np.mean(lum[sel_]))
for j, i in enumerate(idx):
    own = city.b[i]['dk']
    if own not in DL or MIXW[j].get(own, 0) > .99: continue
    tgt = sum(v * DL.get(k, DL[own]) for k, v in MIXW[j].items())
    cols[j] *= float(np.clip(tgt / DL[own], .75, 1.35))
tick('district roof luminance ' + ', '.join(f'{k} {v:.3f}' for k, v in DL.items()))
for k_, (_, rough_, metal_) in enumerate(RCLS):
    sel = np.where(rcls == k_)[0]
    if len(sel): city.buildings_mesh(f'city{k_}', idx[sel], ZG, tops[sel], cols[sel], td.city_mat(f'citymat{k_}', rough_, .09, 1.0 + .3 * (k_ == 0), metal_), shade=CORE_SHADE)   # A7：AO 距离 2 m → 9 m：高楼脚下的矮楼顶、窄街更暗，楼高层次读得出
kit = tc_city.roof_kit(city, idx, tops, cols, R, 'night', cap=.18)
# 天窗（roof_kit 的玻璃块 + 中间一盏小灯）原来都在楼顶正中，整片街区看是一格一个亮点的点阵：挪到偏心的位置、大小不一，灯只留一部分、亮度不一
_srng = np.random.default_rng(7105)
GLASS = (.28, .34, .38); moved = {}
for j_, (bx_, c_) in enumerate(zip(kit['box'], kit['bcol'])):
    if tuple(round(v, 3) for v in c_) != GLASS: continue
    x_, y_, w_, d_, z0_, z1_ = bx_; a_ = kit['brot'][j_]; ou, ov = _srng.uniform(-.9, .9) * w_, _srng.uniform(-.9, .9) * d_
    nx_, ny_ = x_ + ou * math.cos(a_) - ov * math.sin(a_), y_ + ou * math.sin(a_) + ov * math.cos(a_); s_ = _srng.uniform(.45, 1.0)
    kit['box'][j_] = (nx_, ny_, w_ * s_ * _srng.uniform(.7, 1.3), d_ * s_, z0_, z1_); kit['bcol'][j_] = tuple(v * _srng.uniform(.55, 1.0) for v in GLASS)
    moved[(round(x_, 4), round(y_, 4))] = (nx_, ny_)
ROOF_DOT = []
for x_, y_, z_ in kit['lamps']:
    if _srng.random() < .55: continue                                   # 大半天窗是黑的（没人 / 拉了帘）
    x_, y_ = moved.get((round(x_, 4), round(y_, 4)), (x_ + _srng.normal(0, .01), y_ + _srng.normal(0, .01)))
    ROOF_DOT.append((x_, y_, z_, _srng.uniform(.2, 1.0)))
tc_city.build_roof_kit('city', kit, cmat, td.city_mat('roofmat', .5))
# 屋顶设备（A3）：按楼高与面积分布——机房（高楼）、水箱（中高层的木水箱，曼哈顿式）、冷却塔（大面积）、天台花园（中低层）、停机坪（最高最大的楼）。
# 位置跟楼的朝向走、偏心摆放；全部单独的随机（7105 接着用），不动 R。
TWR = {(round(tx, 3), round(ty, 3)): tz for tx, ty, tz in kit['towers']}
EQ, EQC, EQR, WT, WTC, GARD, GRR, GTR, PADS, PADR, PADL = [], [], [], [], [], [], [], [], [], [], []
for j, (i, top) in enumerate(zip(idx, tops)):
    b = city.b[i]; x, y, w, d, rot = tc_city.top_obb(b); hgt = top - ZG; a = b['a'] if 'real' not in b else w * d; wc = float(bw_core[j])
    if a < .002: continue
    zt = TWR.get((round(b['cx'], 3), round(b['cy'], 3))); inner = .2 if zt is not None else .32
    top = tc_city.roof_top(b, top); zt = top if zt is None else zt       # 真实楼：放在最高一级（够大的）屋面上
    cs, sn = math.cos(rot), math.sin(rot); at = lambda u, v: (x + u * cs - v * sn, y + u * sn + v * cs)
    base = np.array(cols[j]) * 1.0
    def spot(fw, fd): return at(_srng.uniform(-inner, inner) * w * (1 - fw), _srng.uniform(-inner, inner) * d * (1 - fd))
    r = _srng.random()
    if hgt > 1.7 and a > .02 and zt == top and r < .3 * wc:              # 停机坪：浅色混凝土方块 + 几盏不齐的暗灯（不画圈、不画字）
        s_ = min(w, d) * .42; px_, py_ = spot(.42, .42)
        PADS.append((px_, py_, s_, s_, zt, zt + .003)); PADR.append(rot + _srng.normal(0, .02))
        for _ in range(int(_srng.integers(2, 5))):
            q = _srng.uniform(0, 4); e = (q % 1 - .5) * s_; side = int(q)
            lx_, ly_ = [(e, -s_ / 2), (s_ / 2, e), (e, s_ / 2), (-s_ / 2, e)][side]
            PADL.append((px_ + lx_ * cs - ly_ * sn, py_ + lx_ * sn + ly_ * cs, zt + .003, _srng.uniform(.2, .7)))
    if hgt > .7 and _srng.random() < .6:                                 # 机房 / 电梯机房：一两个方块，比屋面亮或暗一档
        for _ in range(int(_srng.integers(1, 3))):
            fw, fd = _srng.uniform(.18, .38), _srng.uniform(.15, .32); px_, py_ = spot(fw, fd)
            EQ.append((px_, py_, w * fw, d * fd, zt, zt + _srng.uniform(.012, .03))); EQR.append(rot); EQC.append(np.clip(base * _srng.choice([.7, 1.15, 1.3]), .02, .13))
    if .35 < hgt < 2.0 and _srng.random() < .45 * (.3 + .7 * wc):       # 木水箱：一到三个，架在屋面上
        for _ in range(int(_srng.integers(1, 4))):
            px_, py_ = spot(.1, .1); rr = _srng.uniform(.005, .009)
            WT.append((px_, py_, zt + .004, rr, rr * _srng.uniform(1.2, 1.8))); WTC.append(np.array((.2, .14, .09)) * _srng.uniform(.6, 1.1))
    if a > .012 and _srng.random() < .35:                                # 冷却塔：一排两到四格，格顶是深色的风扇口
        nct = int(_srng.integers(2, 5)); cz = _srng.uniform(.013, .018); u0, v0 = _srng.uniform(-.2, .2) * w, _srng.uniform(-.2, .2) * d
        for k in range(nct):
            px_, py_ = at(u0 + (k - (nct - 1) / 2) * cz * 1.05, v0)
            EQ.append((px_, py_, cz, cz, zt, zt + .008)); EQR.append(rot); EQC.append((.11, .11, .11))
            WT.append((px_, py_, zt + .008, cz * .38, .0012)); WTC.append((.02, .02, .022))
    if .25 < hgt < 1.3 and _srng.random() < .13 * (.3 + .7 * wc):       # 天台花园：一块绿地 + 几棵小树
        fw, fd = _srng.uniform(.35, .6), _srng.uniform(.35, .6); px_, py_ = spot(fw, fd)
        GARD.append((px_, py_, w * fw, d * fd, zt, zt + .002)); GRR.append(rot)
        for _ in range(int(_srng.integers(2, 7))):
            u_, v_ = _srng.uniform(-.45, .45) * w * fw, _srng.uniform(-.45, .45) * d * fd; rr = _srng.uniform(.004, .008)
            GTR.append((px_ + u_ * cs - v_ * sn, py_ + u_ * sn + v_ * cs, zt + .002 + rr * .5, rr))
eqm = td.city_mat('roof_eq', .6, .01, 1.2, .2)
tc.box_mesh('roof_equipment', EQ, EQC, eqm, rot=np.array(EQR, np.float32))
tc.cyl_mesh('roof_tanks', WT, eqm, 12, colors=np.array(WTC, np.float32).reshape(-1, 3))
tc.box_mesh('roof_gardens', GARD, np.tile((.025, .045, .02), (len(GARD), 1)), td.city_mat('roof_garden', .95, .01, 1.4), rot=np.array(GRR, np.float32))
tc.ico_mesh('roof_trees', GTR, mat('roof_treen', (.02, .035, .015), .9))
tc.box_mesh('helipads', PADS, np.tile((.12, .12, .115), (len(PADS), 1)), td.city_mat('helipad', .8, .005, .8), rot=np.array(PADR, np.float32))
tick(f'roof equipment {len(EQ)}, tanks {len(WT)}, gardens {len(GARD)}, helipads {len(PADS)}')
tk = [t for t in city.trees if not any(z(t[0], t[1]) if callable(z) else ((z[1] < t[0] < z[3] and z[2] < t[1] < z[4]) if z[0] == 'rect' else ((t[0] - z[0]) / z[2]) ** 2 + ((t[1] - z[1]) / z[3]) ** 2 < 1) for z in ZONES)]
tc.ico_mesh('trees', [(x, y, ZG + .004 + r * .55, r) for x, y, r in tk], mat('treen', (.01, .018, .01), .9)); tick('city (night)')

# ---------------- A7：九龙西段（布鲁克林 / 核心交界一侧）的空地补楼 ----------------
# OSM 在这一段的楼少（立交、停车场、过渡带按密度渐变去掉的楼），缩小看是一大片黑地上撒满车灯。按旺角的街坊尺度在空地上补中低层楼：
# 朝向跟最近的路、让开道路 / 地标 / 公园 / 已有的楼，按一层低频起伏成片地补（不是均匀铺满）。独立随机（7115），不动 R 与城市序列。
_frng7 = np.random.default_rng(7115)
_Pk = next(D['P'] for D in city.districts if D['kind'] == 'commercial')
_rp, _rh = [], []
for r in city.roads:
    if r['c'] not in CAR or r['c'] == 'service': continue                 # 步道、停车场通道上可以盖楼（九龙的楼本来就压着小巷）
    Q = r['p']
    for u, v in zip(Q[:-1], Q[1:]):
        nn = max(1, int(float(np.hypot(*(v - u))) / .03))
        for t in range(nn + 1): _rp.append(u + (v - u) * t / nn); _rh.append(r['w'] / 2)
_kr = KDTree(len(_rp))
for i_, p_ in enumerate(_rp): _kr.insert((p_[0], p_[1], 0), i_)
_kr.balance()
_kb = KDTree(max(1, len(idx)))
for j_, i_ in enumerate(idx): _kb.insert((city.b[i_]['cx'], city.b[i_]['cy'], 0), int(i_))
_kb.balance()
def _in_bld(x, y, pad=.03):
    for _, bi, dd in _kb.find_range((x, y, 0), 1.2):
        b_ = city.b[bi]; ow, od = b_['obb'][2], b_['obb'][3]
        if dd < max(ow, od) / 2 + pad and (dd < min(ow, od) / 2 + pad or tc_city.point_in_poly(x, y, b_['p'])): return True
    return False
def _in_zone(x, y):
    for z in ZONES:
        if callable(z):
            if z(x, y): return True
        elif z[0] == 'rect':
            if z[1] < x < z[3] and z[2] < y < z[4]: return True
        elif ((x - z[0]) / z[2]) ** 2 + ((y - z[1]) / z[3]) ** 2 < 1.1: return True
    return False
_areas = [(q, (*q.min(0), *q.max(0))) for q in city.parks + city.water]
_kcols = cols[[j for j, i in enumerate(idx) if city.b[i]['dk'] == 'commercial']]
_Pc = next(D['P'] for D in city.districts if D['kind'] == 'core')
_ccols = cols[[j for j, i in enumerate(idx) if city.b[i]['dk'] == 'core']]
FP, FZ, FC, FEQ, FEQC, FEQR, FSG, FSGC, FSGR = [], [], [], [], [], [], [], [], []
_occ7 = set(); from collections import Counter; _rj7 = Counter()
# A7 第 2 轮：核心区一侧交界带（离 mid_hseam_y 约 100 m 内，过渡带按密度去掉了不少楼，缩小看是一条空荡的宽带）也补楼，
# 颜色取核心区的屋面色，少量取九龙的（九龙的低层楼渗进核心区最后一排）。
for gx in np.arange(-10.5, 15.2, .085):
    for gy in np.arange(-9.4, -1.6, .085):
        x, y = gx + _frng7.uniform(-.025, .025), gy + _frng7.uniform(-.025, .025)
        in_k = tc_city.point_in_poly(x, y, _Pk)
        if in_k:
            if x > 2.0 or tc_city.sdist(x, y, _Pk) < .16: continue
            patch = .5 + .5 * math.sin(x * 1.7 + 1.3) * math.cos(y * 2.1 - .4) + .25 * math.sin(x * 4.3 - y * 3.1)
            if _frng7.random() > min(1.0, max(0.0, patch + .35)) * (1 - tc_city._ss((x - .5) / 1.5)): continue
        else:
            if not tc_city.point_in_poly(x, y, _Pc) or tc_city.sdist(x, y, _Pc) < .14 or y - tc_city.mid_hseam_y(x) > 1.0: continue
            if _frng7.random() > .8 * (1 - tc_city._ss((y - tc_city.mid_hseam_y(x) - .4) / .6)): continue
        g = (round(x / .085), round(y / .085))
        if g in _occ7 or _in_zone(x, y): _rj7['zone'] += 1; continue
        co_, ri, rd = _kr.find((x, y, 0)); j2 = min(ri + 1, len(_rp) - 1)
        w_, d_ = float(np.clip(_frng7.lognormal(math.log(.085), .3), .045, .17)), float(np.clip(_frng7.lognormal(math.log(.07), .25), .04, .12))
        if rd < _rh[ri] + .035: _rj7['road'] += 1; continue
        w_, d_ = w_ * 1.45, d_ * 1.4                                          # 旺角的街坊楼：比原来的尺寸大一号
        if any(b0[0] - .05 < x < b0[2] + .05 and b0[1] - .05 < y < b0[3] + .05 and tc_city.point_in_poly(x, y, q) for q, b0 in _areas): continue
        ang = math.atan2(_rp[j2][1] - _rp[ri][1], _rp[j2][0] - _rp[ri][0]) + _frng7.normal(0, .04); cs, sn = math.cos(ang), math.sin(ang)
        corners = [(x + u * cs - v * sn, y + u * sn + v * cs) for u, v in ((-w_ / 2, -d_ / 2), (w_ / 2, -d_ / 2), (w_ / 2, d_ / 2), (-w_ / 2, d_ / 2))]
        if _in_bld(x, y) or any(_in_bld(cx_, cy_, .015) for cx_, cy_ in corners): _rj7['bldg'] += 1; continue
        if any(_kr.find((cx_, cy_, 0))[2] < _rh[_kr.find((cx_, cy_, 0))[1]] + .01 for cx_, cy_ in corners): _rj7['road'] += 1; continue
        for di_ in (-1, 0, 1):
            for dj_ in (-1, 0, 1): _occ7.add((g[0] + di_, g[1] + dj_))
        h_ = float(np.clip(_frng7.lognormal(math.log(.45), .45), .15, 1.3))
        FP.append(np.array(corners, np.float32)); FZ.append(ZG + h_)
        _src = _kcols if (in_k or _frng7.random() < .25) else _ccols
        FC.append(np.clip(_src[_frng7.integers(len(_src))] * _frng7.uniform(.8, 1.15), .02, 1))
        for _ in range(int(_frng7.integers(0, 3))):                          # 屋顶设备
            u_, v_ = _frng7.uniform(-.3, .3) * w_, _frng7.uniform(-.3, .3) * d_; s_ = _frng7.uniform(.008, .02)
            FEQ.append((x + u_ * cs - v_ * sn, y + u_ * sn + v_ * cs, s_, s_ * _frng7.uniform(.7, 1.4), ZG + h_, ZG + h_ + _frng7.uniform(.005, .015))); FEQR.append(ang); FEQC.append(np.array(FC[-1]) * 1.3)
        if _frng7.random() < (.35 if in_k else .1):                           # 临街一侧一两块小招牌（暗、短）
            side = 1 if (x - co_[0]) * -sn + (y - co_[1]) * cs < 0 else -1
            for _ in range(int(_frng7.integers(1, 3))):
                u_ = _frng7.uniform(-.4, .4) * w_; v_ = side * (d_ / 2 + .008); z_ = ZG + _frng7.uniform(.05, max(.06, h_ - .03))
                FSG.append((x + u_ * cs - v_ * sn, y + u_ * sn + v_ * cs, float(np.clip(_frng7.lognormal(math.log(.02), .4), .008, .045)), .012, z_, z_ + .003)); FSGR.append(ang)
                FSGC.append(np.array(NEON[_frng7.choice(4, p=NEON_P)]) * _frng7.uniform(.25, .7))
if FP:
    tc_city.poly_prisms('kowloon_fill', FP, np.full(len(FP), ZG, np.float32), np.array(FZ, np.float32), np.array(FC, np.float32).reshape(-1, 3), td.city_mat('kfillmat', .7, .018, 1.2, .1))
    if FSG: tc.box_mesh('kowloon_fill_signs', FSG, np.array(FSGC, np.float32).reshape(-1, 3), emit_mat('kfsigns', None, 4.0 * GLOW), rot=np.array(FSGR, np.float32))
    tc.box_mesh('kowloon_fill_eq', FEQ, np.array(FEQC, np.float32).reshape(-1, 3), td.city_mat('kfilleq', .6, .01, 1.2, .2), rot=np.array(FEQR, np.float32))
tick(f'kowloon west fill: {len(FP)} buildings, {len(FSG)} signs, rejected {dict(_rj7)}')

# ---------------- 商业街：OSM 的主干道（干线、次干线、支线）就是霓虹走廊 ----------------
# 霓虹、全息广告、车流、溢光都向它们聚集（真实城市的夜景是一条条亮街，不是均匀撒点）
CORR = {'trunk', 'primary', 'secondary', 'tertiary'}
kd_c = city.road_kd(CORR)
def corr_near(x, y): co_, _, d = kd_c.find((x, y, 0)); return co_, d
# 城区决定夜景气质：核心区（曼哈顿中城）霓虹克制、楼里透出暖光；商业区（旺角）霓虹最密；外围（布鲁克林）几乎没有霓虹
NEON_DF = {'core': .12, 'commercial': 1.0, 'outer': .012}
TRAFFIC_DF = {'core': .9, 'commercial': 1.0, 'outer': .18}          # A7：悬浮轨道是主要公共交通——外围居住区车很少
# 交界不一刀切：按到各城区多边形的有向距离做 smoothstep 权重（交界处各半，往里 75 m 渐变到纯色），按位置缓存
# A6：九龙东侧（约 x = 10.5）是旺角街网里一条笔直的南北向大路，路东是公园、楼稀，霓虹在这条直线上戛然而止。
# 霓虹密度按一条起伏的线（确定性正弦）在路西约 100 m 内渐弱，让熄灭的边缘不贴着这条直路。
from functools import lru_cache
def _ss(t): t = min(1, max(0, t)); return t * t * (3 - 2 * t)
@lru_cache(maxsize=None)
def _dmix(xk, yk):
    x, y = xk * .02, yk * .02; w_ = [(D['kind'], _ss(tc_city.sdist(x, y, D['P']) / 1.5 + .5)) for D in city.districts]   # A6：过渡带放宽到交界两侧约 75 m
    s_ = sum(v for _, v in w_) or 1; return tuple((k, v / s_) for k, v in w_)
def dmix(x, y): return _dmix(round(x / .02), round(y / .02))
def dval(x, y, tab): return sum(v * tab[k] for k, v in dmix(x, y))
def corr_w(x, y): return math.exp(-corr_near(x, y)[1] / .2)
def kow_east(x, y): return .3 + .7 * _ss((10.2 + .45 * math.sin(y * 1.9 + .4) + .2 * math.sin(y * 4.3 + 2.1) - x) / 1.1 + .5)
def glow_w(x, y): return corr_w(x, y) * (.55 + .45 * tc.district(x, y)) * dval(x, y, NEON_DF) * kow_east(x, y)
# A7：核心 / 九龙交界两侧约 120 m 内（一条曼哈顿东西向干道 + 交界大道 + 九龙北缘的几条路挤在一起），车灯、路灯叠成一条横向亮带；
# 九龙西段（布鲁克林交界一侧的立交与空地）车流也偏密。按到交界曲线的距离与西段权重压低车流与路灯。纯确定性。
def seam_quiet(x, y):
    q = .12 + .88 * _ss((abs(y - tc_city.mid_hseam_y(x)) - .2) / 1.4) if x > tc_city._CW[0] - .5 else 1.0
    if dval(x, y, {'core': 0, 'commercial': 1, 'outer': 0}) > .3:
        q *= .28 + .72 * _ss((x + 1.5) / 3.0)                       # 九龙西段（x < 约 0）车少大半
    return q

# ---------------- 街道：路灯（商业街亮、背街暗）、标线、车流（车头白、车尾红）----------------
# A6：原来沿每条路两侧每 12 m 一盏，整张图是一排排等距的点阵。改为 tc_city.street_lamps：按路级别定间距（干道两侧错开 27–30 m，
# 支路单侧 34–50 m，隔一段换边），间距抖动，路口转角补灯。独立随机（7110）。
_lp = city.street_lamps(np.random.default_rng(7110), CAR, side_offset=.008, jit=.38, min_sep=.13, corner=.22)   # 路口转角补灯少一些（原来每个路口一颗亮珠）   # A7：间距抖动加大、分幅干道的平行两排去重
lamps = [(x, y, .01, .01, ZG + .006, ZG + .008) for x, y, *_ in _lp]
lw = np.array([max(glow_w(l[0], l[1]), .5 * dval(l[0], l[1], {'core': 1, 'commercial': 0, 'outer': 0})) for l in lamps])   # 核心区的街灯也亮
# 路灯（A3）：不再是两排等距的白点——按道路等级分亮度与色温（干道 LED 偏白、次干道暖白、居住街钠灯暖黄且暗、小巷稀少），
# 沿路方向再抖开、按等级再缺一部分、每盏亮度不一。单独的随机（7106），不动 R。
_lrng2 = np.random.default_rng(7106)
LAMP_TIER = {'trunk': ('#fff2e2', 1.0, .92), 'primary': ('#fff2e2', 1.0, .92), 'secondary': ('#ffe8cc', .85, .88), 'tertiary': ('#ffdcaa', .6, .8),
             'unclassified': ('#ffcf96', .42, .7), 'residential': ('#ffc486', .36, .62), 'living_street': ('#ffc486', .3, .5), 'service': ('#ffb878', .22, .3)}
SL, SLC = [], []
for (x, y, ang, c, _w), l, wv in zip(_lp, lamps, lw):
    col_, k_, keep_ = LAMP_TIER.get(c, ('#ffcf96', .4, .6))
    if _lrng2.random() > .45 + .45 * keep_: continue                  # A6：间距已按路级别拉开，这里只再缺少量（A7 再缺约一成）
    s_ = _lrng2.normal(0, .025); x, y = x + s_ * math.cos(ang), y + s_ * math.sin(ang)
    kk = 1.25 * k_ * (1.0 if wv > .35 else .45) * _lrng2.uniform(.55, 1.1) * (.2 if _lrng2.random() < .04 else 1)   # 商业街 / 核心区亮，背街暗；个别灯快坏了
    kk *= seam_quiet(x, y)                                                  # A7：交界亮带压暗
    SL.append((x, y, .01, .01, ZG + .006, ZG + .008)); SLC.append(np.array(srgb(col_)) * kk)
tc.box_mesh('streetlights', SL, np.array(SLC, np.float32).reshape(-1, 3), emit_mat('streetglow', None, 3.5 * GLOW))
# A7：路灯的地面光池——灯下一小片（半径 4–8 m）渐隐的暖光，路面与人行道被照亮，而不是只有一个亮点。独立随机（7113）。
_plr = np.random.default_rng(7113)
POOLS = [(x, y, ZG + .0056, (.045 + .04 * min(1.0, float(np.max(c)) / .9)) * _plr.uniform(.75, 1.3), np.asarray(c) / max(float(np.max(c)), 1e-6) * min(1.0, float(np.max(c))))
         for (x, y, *_), c in zip(SL, SLC) if float(np.max(c)) > .08]
td.glow_pools('lamp_pools', POOLS, .13 * GLOW)
mb, mr, mc = city.road_marks(ZG + .0045, color=(.3, .3, .28)); tc.box_mesh('road_marks', mb, mc, td.city_mat('markmat', .6, ao=0), rot=mr)
# A6：车流改 tc_city.traffic2——按路级别、城区、每条路的繁忙度（约四分之一几乎没车）定密度，成队 + 大间隙，交叉口前排队。独立随机（7111）。
cars, crot, cdir, ccol = city.traffic2(np.random.default_rng(7111), ZG + .004, 2.1, weight=lambda x, y: .1 + .9 * corr_w(x, y) * dval(x, y, TRAFFIC_DF), scale=lambda x, y: seam_quiet(x, y) ** 1.6)   # A7：总量约减三成（悬浮轨道为主），交界带再压   # A7：交界与九龙西段车少
tc.box_mesh('cars', cars, ccol * .35, tc.vcol_mat('carmat', .25, .6), rot=crot)
# A7 第 3 轮：交界带（含九龙西段的立交）每条路的密度已压到很低，但路多、车道多，缩小看仍是一片车灯——再按 seam_quiet 随机去掉一部分车。独立随机（7118）。
_cq = np.random.default_rng(7118); _ck = np.array([_cq.random() < min(1.0, seam_quiet(float(c[0]), float(c[1])) / .45) for c in cars], bool)
cars, crot, cdir, ccol = cars[_ck], crot[_ck], cdir[_ck], ccol[_ck]
hb, tb, lr = td.car_lights(cars, cdir)
tc.box_mesh('headlights', hb, np.tile(srgb('#fff4e0'), (len(hb), 1)), emit_mat('head', None, 3.5 * GLOW), rot=lr)
tc.box_mesh('taillights', tb, np.tile(srgb('#ff2a1a'), (len(tb), 1)), emit_mat('tail', None, 3.0 * GLOW), rot=lr)
tick(f'street: lamps {len(lamps)}, cars {len(cars)}')

# ---------------- 霓虹：朝商业街那一面的挑出招牌、临街楼顶灯带、塔楼全息广告 ----------------
strips, srot, scol, signs, sgrot, sigc, holo, hrot, holc, spill = [], [], [], [], [], [], [], [], [], []
# A6：招牌长短、亮度、色相原来是均匀分布，整片九龙读成同一种亮条。改为对数正态：多数是小灯箱，少量大招牌（更大、单位面积略暗）；
# 每块的亮度、色相（±约 10°）、饱和度各自抖动；招牌数随离商业街的远近变化，同一栋楼的招牌聚在临街立面的一段（铺面）上。
# 原来的 R 调用保留（高度、颜色仍取自 R），尺寸、亮度、色相另用独立随机（7112）。
import colorsys
_nrng = np.random.default_rng(7112)
def njit(c, k=1.0):
    h_, s_, v_ = colorsys.rgb_to_hsv(*c); h_ = (h_ + _nrng.normal(0, .028)) % 1; s_ *= _nrng.uniform(.72, 1.0)
    return np.array(colorsys.hsv_to_rgb(h_, s_, v_), np.float32) * k
def nbright(): return float(np.clip(_nrng.lognormal(0, .5), .25, 2.6))
for i, top in zip(idx, tops):
    b = city.b[i]; x, y, w, d, rot = b['obb']; wgt = glow_w(b['cx'], b['cy']); nd = dval(b['cx'], b['cy'], NEON_DF)   # nd：城区的霓虹底数（外围几乎为零）
    rtop = tc_city.roof_top(b, top)
    if 'real' in b: top = ZG + (top - ZG) * .3                        # 真实楼：招牌只挂在退台以下的外墙上（上面几级往里收，挂出去会悬空）
    u = np.array([math.cos(rot), math.sin(rot)]); v = np.array([-u[1], u[0]]); c0 = np.array([x, y])
    (px, py, _), _d = corr_near(b['cx'], b['cy']); to = np.array([px - x, py - y]); to /= (np.linalg.norm(to) + 1e-9)
    faces = [(u, w / 2, v, d), (-u, w / 2, v, d), (v, d / 2, u, w), (-v, d / 2, u, w)]      # (外法线, 半宽, 切向, 面长)
    nrm, half, tan_, flen = max(faces, key=lambda f: float(f[0] @ to))
    pal = [NEON[R.choice(4, p=NEON_P)] for _ in range(2)]                                   # 一栋楼的招牌一两种颜色
    ta = math.atan2(tan_[1], tan_[0])
    if R.random() < .03 * nd + .75 * wgt:                              # 挑出招牌：从临街外墙水平伸出，俯视能在楼缝里看到
        nsg = max(1, int(round(int(R.integers(2, 7)) * (.35 + 1.3 * wgt) * _nrng.lognormal(0, .35))))
        cu = _nrng.uniform(-.3, .3)                                     # 这栋楼的铺面在临街立面的哪一段
        for _ in range(nsg):
            big = _nrng.random() < .04 + .07 * wgt
            sz = _nrng.uniform(.07, .15) if big else float(np.clip(_nrng.lognormal(math.log(.022), .55), .007, .07))
            L = _nrng.uniform(.03, .05) if big else float(np.clip(sz * _nrng.lognormal(-.3, .3), .008, .035))
            z = R.uniform(max(ZG + .05, top - .9), max(ZG + .06, top - .03))
            p = c0 + nrm * (half + L / 2) + tan_ * float(np.clip(cu + _nrng.normal(0, .14), -.45, .45)) * flen
            signs.append((p[0], p[1], sz, L, z, z + .003)); sgrot.append(ta); sigc.append(njit(pal[R.integers(2)], nbright() * (.6 if big else 1.0)))
        if R.random() < .2: spill.append((signs[-1][0], signs[-1][1], signs[-1][5] + .05, tuple(float(v) for v in sigc[-1] / max(float(sigc[-1].max()), 1e-6))))
    if R.random() < .02 * nd + .3 * wgt and flen > .04:                # 临街一侧的楼顶灯带
        if 'real' in b:                                                 # 真实楼：贴着最高一级屋面临街那条边（tobb），高度是该级屋面
            tx, ty, tw, td_, tr = b['tobb']; tu = np.array([math.cos(tr), math.sin(tr)]); tv = np.array([-tu[1], tu[0]])
            tn, th_, tt, tl = max([(tu, tw / 2, tv, td_), (-tu, tw / 2, tv, td_), (tv, td_ / 2, tu, tw), (-tv, td_ / 2, tu, tw)], key=lambda f: float(f[0] @ to))
            fl = float(np.clip(_nrng.lognormal(math.log(.5), .5), .12, .92)); off_ = _nrng.uniform(-.5, .5) * (1 - fl) * tl   # A6：灯带长短不一、不居中
            p = np.array([tx, ty]) + tn * (th_ - .004) + tt * off_; strips.append((p[0], p[1], tl * fl, .004, rtop + .006, rtop + .009)); srot.append(math.atan2(tt[1], tt[0])); scol.append(njit(pal[0], nbright()))
        else:
            fl = float(np.clip(_nrng.lognormal(math.log(.5), .5), .12, .92)); off_ = _nrng.uniform(-.5, .5) * (1 - fl) * flen
            p = c0 + nrm * (half - .004) + tan_ * off_; strips.append((p[0], p[1], flen * fl, .004, top + .006, top + .009)); srot.append(ta); scol.append(njit(pal[0], nbright()))
    if b['dk'] == 'commercial' and top > -1.9 and w * d > .006 and R.random() < .02 + .35 * wgt:   # 全息广告：只在商业区，楼顶竖立的窄屏（扫描线纹理）
        holo.append((x, y, w * .5, .004, top + .01, top + .07)); hrot.append(rot); holc.append((PINK, CYAN)[R.integers(2)])
for x, y, *_ in city.along(.35, CORR):                                 # 商业街的彩色溢光：沿街一串点光，染亮路面与低层楼顶
    if glow_w(x, y) > .6: spill.append((x + R.uniform(-.04, .04), y + R.uniform(-.04, .04), ZG + .25, NEON[R.choice(3)]))
tc.box_mesh('neon_strips', strips, scol, emit_mat('neon', None, 5.0 * GLOW), rot=np.array(srot, np.float32))
tc.box_mesh('neon_signs', signs, sigc, emit_mat('signs', None, 4.0 * GLOW), rot=np.array(sgrot, np.float32))
tc.box_mesh('holo_ads', holo, np.array(holc).reshape(-1, 3) * .9, tc.shade_mat('holo', (.85, .87, .9), .45) if DAY else emit_mat('holo', None, .55 * GLOW, stripes=220, alpha=.25), rot=np.array(hrot, np.float32))   # --day：全息广告改半透明白板
lampsR = ROOF_DOT + PADL                                               # 楼顶小灯、天窗透光（已打散、亮度不一）+ 停机坪边的暗灯
tc.box_mesh('roof_dots', [(x, y, .008, .008, z, z + .002) for x, y, z, k in lampsR], np.array([np.array(srgb('#ffd9a0')) * k for *_, k in lampsR], np.float32).reshape(-1, 3), emit_mat('dots', None, 2.5 * GLOW))
warn = [(x, y, .008, .008, z, z + .003) for x, y, z in kit['towers'] if z > -.6 and R.random() < .6]   # 最高的塔顶才有航空障碍灯（红）
tc.box_mesh('aviation_lights', warn, np.tile(srgb('#ff2020'), (len(warn), 1)), emit_mat('aviation', None, 8.0 * GLOW))
if len(spill) > 1600:                                                  # 点光太多会拖慢渲染：随机留 1600 盏，功率按比例补回
    keep_s = R.choice(len(spill), 1600, replace=False); boost = len(spill) / 1600; spill = [spill[i] for i in keep_s]
else: boost = 1
tc.point_lights('neon_spill', spill, .15 * GLOW * min(boost, 1.6))
# 核心区：楼内透出的暖光——高楼顶冠的灯带、退台上的暖光、少量暖色溢光。单独的随机，不动 R。
# A6：楼冠灯带只留给核心区按楼高排名前约 5% 的楼（地标自己的灯另算）；其余一律不画——A5 里只亮部分边的细金线读成 L 形 / 三角形的选中框。
# 留下的这几十栋不画线（草稿 1：整圈连续的细线仍读成一个个选中框），改为楼冠上方一盏暖色投光，把最高一级屋面和女儿墙照出一片暖光——
# 读作「被照亮的楼冠」而不是描边。
_crng = np.random.default_rng(7103)
crown, warm = [], []
_ct = [t for i, t in zip(idx, tops) if city.b[i]['dk'] == 'core' and 'real' in city.b[i]]
CROWN_Z = float(np.quantile(_ct, .95)) if _ct else 1e9                  # 核心区楼高前 5% 的门槛
for i, top in zip(idx, tops):
    b = city.b[i]
    if b['dk'] not in ('core', 'outer') or top < -2.6: continue        # 约 80 m 以上的楼
    wc = tc_city.core_w(city, b['cx'], b['cy'])
    if wc < .03: continue
    x, y, w, d, rot = b['obb']
    if 'real' in b:
        rz = tc_city.roof_top(b, top); P_ = b['top_p']
        if top >= CROWN_Z and b['tobb'][2] * b['tobb'][3] > .0008:
            tx_, ty_, tw3, td3, tr3 = b['tobb']; su_, sv_ = _crng.choice([-1, 1]), _crng.choice([-1, 1])   # 草稿 2：灯在正中像每栋楼一个亮点，改从一角斜打
            ox_, oy_ = su_ * (tw3 / 2 + .01), sv_ * (td3 / 2 + .01); c3, s3 = math.cos(tr3), math.sin(tr3)
            crown.append((tx_ + ox_ * c3 - oy_ * s3, ty_ + ox_ * s3 + oy_ * c3, rz + .025, srgb('#ffd29a')))   # 楼冠边上的暖色投光
        x, y = b['tobb'][:2]; w, d = b['tobb'][2:4]; top = rz
    if _crng.random() < .2 * wc: warm.append((x + _crng.uniform(-.3, .3) * w, y + _crng.uniform(-.3, .3) * d, top - _crng.uniform(.1, .5), srgb('#ffcf8f')))
tc.point_lights('core_crown_flood', crown, .6 * GLOW, .03)
tc.point_lights('core_warm', warm, .25 * GLOW, .05)
tick(f'core warm light: crown floods {len(crown)}, spill {len(warm)}')
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
    # A7：原来整条天桥一根发光线（长到 45 m），九龙里读成一道道斜长的激光线。改成连廊玻璃里透出的几格暖白窗光（短、暗、有缺），
    # 霓虹色只留给少数、且只在短连廊上。R 的调用次数不变（颜色照取）；窗格用独立随机（7114）。
    _brng = np.random.default_rng(7114); bl2, bc2, br2 = [], [], []
    bcol = [CYAN if R.random() < .6 else PINK for _ in blines]
    for (mx, my, L, _w, z0, z1), c, a in zip(blines, bcol, brot):
        neon = L < .28 and _brng.random() < .25
        nseg = max(1, int(L / .05)); ca_, sa_ = math.cos(a), math.sin(a)
        for k in range(nseg):
            if _brng.random() < .45: continue
            t = (k + .5) / nseg - .5; px_, py_ = mx + ca_ * t * L, my + sa_ * t * L
            bl2.append((px_, py_, L / nseg * .55, .003, z0, z1)); br2.append(a)
            bc2.append(np.array(c) * .6 if neon else np.array(srgb('#ffe2b8')) * _brng.uniform(.25, .6))
    if bl2: tc.box_mesh('skybridge_lines', bl2, np.array(bc2, np.float32), emit_mat('bridgeglow', None, 1.0 * GLOW), rot=np.array(br2, np.float32))
tick(f'skybridges {len(bridges)}')

# ---------------- 悬浮轨道：贯穿全片区的发光曲线 ----------------
ROUTES = [                                                     # 线路走向为推断：串起核心区、教堂、大学、检查点
    [(-16.5, -1.6), (-9, -.4), (-3.5, 2.6), (2, 3.2), (8, 1.4), (16.5, 2.8)],
    [(-7, -10.5), (-4.6, -4), (-2.2, 1.0), (-4.2, 6.5), (-2.5, 10.5)],
    [(3.2, -10.5), (3.45, -7.4), (4.3, -5.0), (6.0, 1.8), (9.4, 5.2), (12.5, 10.5)],   # A3：从检查点西侧约 40 m 外经过，与 5 号线在检查点以北约 180 m 处交叉
    [(-16.5, 7.2), (-8.4, 4.9), (-1.5, 7.8), (6.5, 6.4), (16.5, 8.4)],
    [(-16.5, -7.0), (-7.5, -6.2), (0, -3.8), (5.2, -5.35), (10, -4.4), (16.5, -6.0)],  # A3：北移，不再贴着检查点的提升机房
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
# --day：轨道发光线改金属反光（一套几何两套材质）；夜景照旧
rail_m = mat('railglow', (.5, .52, .55), .28, 1) if DAY else emit_mat('railglow', ICE, 1.2 * GLOW)                    # A7：导轨光带压暗约一半（原来像矢量描线），车站仍是轨道上最亮的点
rail_m2 = mat('railglow2', (.42, .44, .47), .32, 1) if DAY else emit_mat('railglow2', tuple(.55 * c_ + .45 * i_ for c_, i_ in zip(CYAN, ICE)), 1.0 * GLOW)
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
LMP_DROP = set()                                                # --no-landmark-glow 时去掉的 LMP 下标：围墙上连成框 / 圈的灯（随机照常取，出图前过滤）
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
_n0 = len(LMP)
for sx in (-1, 1):                                              # 围墙上的灯：不等距、有缺
    lamps_along(x + sx * .92, y - .6, x + sx * .92, y + .6, ZG + .25, blue, 5, .012, 1.4); lamps_along(x - .8, y + sx * .72, x + .8, y + sx * .72, ZG + .25, blue, 6, .012, 1.4)
LMP_DROP.update(range(_n0, len(LMP)))                           # 执法蓝的围墙灯：缩小看是一圈蓝色虚线框
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
_n0 = len(LMP)
for sx in (-1, 1): lamps_along(x + sx * .7, y - .5, x + sx * .7, y + .5, ZG + .5, srgb('#ffcf8a'), 4, .01, .9)
LMP_DROP.update(range(_n0, len(LMP)))                           # 东西围墙上的两列灯
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
        if LR.random() < .14: _n0 = len(LMP); lamp(px, py, ZG + .3, ICE, .02, 1.3); LMP_DROP.update(range(_n0, len(LMP)))   # 墙灯：不等距、亮度不一（沿环带一圈）
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
# A3 辨识度：校园围墙 + 墙内一圈行道树（与外面的联排街坊隔开一条净空）、草坪上的浅色石铺步道（十字 + 斜穿）、北排正中的钟楼；
# 多一盏从东北打过来的主投光，把坡屋顶的受光面照出来。单独的随机（7107），不动 LR。
_urng = np.random.default_rng(7107)
uw = Batch('univ_wall', stone('univ_wall2', (.09, .08, .07), (.15, .13, .11)))
for sx in (-1, 1):
    for a0, a1 in ((-1.05, -.12), (.12, 1.05)):                         # 东西墙：中间留校门
        uw.box(x + sx * 1.5, y + (a0 + a1) / 2, ZG, .02, a1 - a0, .12)
    for a0, a1 in ((-1.5, -.2), (.2, 1.5)):                             # 南北墙
        uw.box(x + (a0 + a1) / 2, y + sx * 1.05, ZG, a1 - a0, .02, .12)
uw.box(x - .05, y + .8, ZG, .09, .09, 3.15)                              # 钟楼
uw.done()
Batch_ct = Batch('univ_clock_roof', stone('univ_slate2', (.09, .09, .095), (.15, .15, .15), .6)); Batch_ct.cyl(x - .05, y + .8, ZG + 3.15, .064, .12, 4, r2=.004); Batch_ct.done()
pth = Batch('univ_paths', td.city_mat('univ_path', .85, .006, 1.2))
PATHS = [(-1.1, -.12, 1.05, -.1), (-.05, -.95, -.05, .75)]
for lx, ly, lw2, ld2 in LAWNS:                                          # 每块草坪一对斜穿的小路（人走出来的对角线）
    PATHS += [(lx - x - lw2 * .45, ly - y - ld2 * .45, lx - x + lw2 * .45, ly - y + ld2 * .45), (lx - x - lw2 * .45, ly - y + ld2 * .45, lx - x + lw2 * .45, ly - y - ld2 * .45)]
pcol = []
for x0_, y0_, x1_, y1_ in PATHS:
    L_ = math.hypot(x1_ - x0_, y1_ - y0_); pth.box(x + (x0_ + x1_) / 2, y + (y0_ + y1_) / 2, ZG + .006, L_, .018 if L_ > 1 else .011, .0045, math.atan2(y1_ - y0_, x1_ - x0_))
po_ = pth.done(); po_.data.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER').data.foreach_set('color', np.tile((.1, .095, .085, 1), len(po_.data.loops)).ravel())
tk_w = []
for _ in range(90):                                                     # 墙内的行道树：沿围墙一圈，间距不齐
    t_ = _urng.uniform(0, 4); e_ = (t_ % 1) * 2 - 1; side = int(t_)
    px_, py_ = [(e_ * 1.42, -.97), (1.42, e_ * .97), (e_ * 1.42, .97), (-1.42, e_ * .97)][side]
    if abs(px_) < .25 and abs(py_) > .9 or abs(py_) < .2 and abs(px_) > 1.3: continue   # 校门处留空
    rr = _urng.uniform(.022, .038); tk_w.append((x + px_ + _urng.normal(0, .015), y + py_ + _urng.normal(0, .015), ZG + .01 + rr * .55, rr))
tc.ico_mesh('univ_trees2', tk_w, mat('treeu2', (.028, .045, .022), .9))
KEY += [(x + .75, y + .55, ZG + 2.9, srgb('#ffe2b0'))]
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

L_ = [l for i, l in enumerate(LMP) if (layer.lm_glow and not DAY) or i not in LMP_DROP]   # --day：地标围墙灯圈白天关闭
tc.box_mesh('landmark_lamps', [(x, y, s, s, z, z + .003) for x, y, z, s, c in L_], np.array([c for *_, c in L_], np.float32).reshape(-1, 3), emit_mat('lm_lamp', None, 3.2 * GLOW))
RG = np.array(RIDGE, np.float32).reshape(-1, 7)
tc.box_mesh('landmark_ridges', RG[:, :6], np.tile((.22, .22, .21), (len(RG), 1)), td.city_mat('ridgem', .5, 0, 1.2, .4), rot=RG[:, 6])
tc.point_lights('landmark_flood', FLOOD, 1.2 * GLOW, .15)       # 补光
tc.point_lights('landmark_key', KEY, 14.0 * GLOW, .08)
tc.point_lights('landmark_key_soft', KEY_SOFT, 6.0 * GLOW, .08)            # 主投光：把屋面照出明暗（坡面、穹顶的受光面与背光面）
tick(f'landmarks: lamps {len(L_)}, flood {len(FLOOD)}')

# ---------------- 核心 / 外围交界的小广场（A3）：石铺地面、沿边的树、几盏不齐的灯杆、报亭 / 地铁口一类的小构筑物 ----------------
_prng7 = np.random.default_rng(7108)
PL_L, PL_T = [], []
plz = Batch('plazas', td.city_mat('plaza_stone', .8, .008, 1.3))
for px_, py_, rx_, ry_ in PLAZAS:
    a_ = math.atan2(1, .1)                                              # 广场长轴顺着交界大道（大道斜度约 1:10）
    plz.box(px_, py_, ZG + .0035, rx_ * 1.9, ry_ * 1.9, .002, a_)
    for _ in range(int(_prng7.integers(2, 4))):                         # 报亭、地铁口、公厕
        u_, v_ = _prng7.uniform(-.6, .6) * rx_, _prng7.uniform(-.6, .6) * ry_
        plz.box(px_ + u_, py_ + v_, ZG, _prng7.uniform(.02, .045), _prng7.uniform(.015, .03), _prng7.uniform(.02, .04), a_ + _prng7.normal(0, .1))
    for _ in range(int(_prng7.integers(14, 24))):                       # 树：沿广场边缘，间距不齐
        t_ = _prng7.uniform(0, 2 * math.pi); rr_ = _prng7.uniform(.78, .97)
        rt = _prng7.uniform(.018, .03); PL_T.append((px_ + rx_ * rr_ * math.cos(t_), py_ + ry_ * rr_ * math.sin(t_), ZG + .01 + rt * .55, rt))
    for _ in range(int(_prng7.integers(6, 11))):                        # 灯杆：散在广场里，不成圈
        t_ = _prng7.uniform(0, 2 * math.pi); rr_ = math.sqrt(_prng7.uniform(.05, .8))
        PL_L.append((px_ + rx_ * rr_ * math.cos(t_), py_ + ry_ * rr_ * math.sin(t_), _prng7.uniform(.2, .6)))
po_ = plz.done(); po_.data.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER').data.foreach_set('color', np.tile((.042, .04, .037, 1), len(po_.data.loops)).ravel())   # 审阅：广场地面压到接近路面
tc.ico_mesh('plaza_trees', PL_T, mat('plaza_tree', (.018, .03, .015), .9))
tc.box_mesh('plaza_lamps', [(x_, y_, .01, .01, ZG + .006, ZG + .008) for x_, y_, _ in PL_L], np.array([np.array(srgb('#ffe8cc')) * k_ for *_, k_ in PL_L], np.float32).reshape(-1, 3), emit_mat('plaza_lamp', None, 3.5 * GLOW))
tc.point_lights('plaza_light', [(x_, y_, ZG + .12, srgb('#ffd8a8')) for x_, y_, k_ in PL_L if k_ > .45], .05 * GLOW, .02)

# ---------------- 外围左上角的暗区（A3）：稀疏的暖色窗光（楼边地面上的一小片光 + 楼顶楼梯间 / 天窗的小亮块）、暗路灯 ----------------
# 读作「暗但有内容」，不提亮整片。范围按 smoothstep 渐隐（nx < .2、ny < .15 附近最多），单独的随机（7109）。
_drng = np.random.default_rng(7109)
def dark_w(x, y): return _ss((-9.0 - x) / 1.6 + .5) * _ss((y - 6.4) / 1.4 + .5)
WIN_L, WIN_D = [], []
for i, top in zip(idx, tops):
    b = city.b[i]; wd_ = dark_w(b['cx'], b['cy'])
    if wd_ < .05 or b['dk'] != 'outer': continue
    x, y, w, d, rot = b['obb']; cs, sn = math.cos(rot), math.sin(rot)
    if _drng.random() < .45 * wd_:                                      # 窗光落在楼前人行道上
        side = _drng.choice([-1, 1]); u_ = _drng.uniform(-.4, .4) * w; v_ = side * (d / 2 + .012)
        WIN_L.append((x + u_ * cs - v_ * sn, y + u_ * sn + v_ * cs, ZG + .025, srgb('#ffc27a') if _drng.random() < .8 else srgb('#ffe0b8')))
    if _drng.random() < .35 * wd_:                                      # 楼顶的楼梯间灯 / 天窗
        u_, v_ = _drng.uniform(-.35, .35) * w, _drng.uniform(-.35, .35) * d; s_ = _drng.uniform(.005, .011)
        WIN_D.append((x + u_ * cs - v_ * sn, y + u_ * sn + v_ * cs, s_, s_ * _drng.uniform(.8, 1.6), top + .001, top + .003, _drng.uniform(.15, .55)))
for x, y, ang, c, _w in city.along(.16, CAR - {'service'}, side_offset=.008, both=False):   # 暗路灯：钠灯、稀、暗
    wd_ = dark_w(x, y)
    if wd_ < .05 or _drng.random() > .45 * wd_: continue
    WIN_D.append((x, y, .009, .009, ZG + .006, ZG + .008, _drng.uniform(.12, .3)))
WD = np.array([v[:6] for v in WIN_D], np.float32).reshape(-1, 6)
tc.box_mesh('dark_fill_glints', WD, np.array([np.array(srgb('#ffc88a')) * v[6] for v in WIN_D], np.float32).reshape(-1, 3), emit_mat('darkfill', None, 3.0 * GLOW))
tc.point_lights('window_spill', WIN_L, .05 * GLOW, .02)
tick(f'plazas {len(PLAZAS)}, dark-area fill: window spill {len(WIN_L)}, glints {len(WIN_D)}')

# ---------------- A7 第 2 轮：交界大道的行道树（两侧各一排，间距不齐、有缺）——交界读成一条林荫大道，而不是一片车灯 ----------------
_brt = np.random.default_rng(7116); BT = []
for r in city.roads:
    if r.get('dk') != 'boulevard': continue
    P = np.asarray(r['p'], np.float64)
    for a_, b_ in zip(P[:-1], P[1:]):
        dv = b_ - a_; L = float(np.hypot(*dv))
        if L < 1e-4: continue
        u = dv / L; nrm = np.array([-u[1], u[0]]); t = float(_brt.uniform(0, .06))
        while t < L:
            for sd in (-1, 1):
                if _brt.random() < .18: continue
                q = a_ + u * t + nrm * sd * (tc_city.BLVD_W / 2 - .018 + _brt.normal(0, .004))
                if not _in_zone(float(q[0]), float(q[1])): rr_ = _brt.uniform(.016, .026); BT.append((float(q[0]), float(q[1]), ZG + .006 + rr_ * .55, rr_))
            t += _brt.uniform(.06, .1)
tc.ico_mesh('boulevard_trees', BT, mat('blvd_tree', (.014, .024, .012), .9))
# 外围居住区（布鲁克林）：整片稀疏的暖色窗光与楼梯间灯（原来只在左上角暗区有），密度约核心区的三分之一。独立随机（7117）。
_wrng = np.random.default_rng(7117); WG = []
for i, top in zip(idx, tops):
    b = city.b[i]
    if b['dk'] != 'outer' or dark_w(b['cx'], b['cy']) > .05 or _wrng.random() > .16: continue
    x, y, w, d, rot = b['obb']; cs, sn = math.cos(rot), math.sin(rot); u_, v_ = _wrng.uniform(-.35, .35) * w, _wrng.uniform(-.35, .35) * d; s_ = _wrng.uniform(.005, .01)
    WG.append((x + u_ * cs - v_ * sn, y + u_ * sn + v_ * cs, s_, s_ * _wrng.uniform(.8, 1.6), top + .001, top + .003, _wrng.uniform(.15, .5)))
# A7 第 3 轮：核心区楼顶的「楼里透出的光」——楼梯间 / 机房门口、玻璃顶、顶层窗边的小块暖光（1–3 处，亮度不一，大半楼是黑的），
# 核心区屋面不再是一片没有生气的灰盒子。高楼更可能亮。独立随机（7119）。
_krng = np.random.default_rng(7119); CG = []
for i, top in zip(idx, tops):
    b = city.b[i]
    if b['dk'] != 'core': continue
    hq_ = float(np.clip((top - ZG) / 3.0, 0, 1))
    if _krng.random() > .22 + .4 * hq_: continue
    x, y, w, d, rot = tc_city.top_obb(b); zt_ = tc_city.roof_top(b, top); cs, sn = math.cos(rot), math.sin(rot)
    for _ in range(int(_krng.integers(1, 4))):
        edge = _krng.random() < .55                                         # 一半贴着屋面边缘（顶层窗户透到女儿墙内侧的一条光）
        if edge:
            sd = _krng.choice([-1, 1]); u_ = _krng.uniform(-.4, .4) * w; v_ = sd * (d / 2 - .006); lw_, ld_ = _krng.uniform(.012, .04), .004
        else:
            u_, v_ = _krng.uniform(-.35, .35) * w, _krng.uniform(-.35, .35) * d; lw_ = _krng.uniform(.006, .014); ld_ = lw_ * _krng.uniform(.6, 1.4)
        CG.append((x + u_ * cs - v_ * sn, y + u_ * sn + v_ * cs, lw_, ld_, zt_ + .001, zt_ + .003, rot, _krng.uniform(.15, .6) * (.6 + .6 * hq_)))
tc.box_mesh('core_window_glints', [v[:6] for v in CG], np.array([np.array(srgb('#ffd29a')) * v[7] for v in CG], np.float32).reshape(-1, 3), emit_mat('coreglint', None, 3.0 * GLOW), rot=np.array([v[6] for v in CG], np.float32))
tick(f'core window glints {len(CG)}')
tc.box_mesh('outer_window_glints', [v[:6] for v in WG], np.array([np.array(srgb('#ffc27a')) * v[6] for v in WG], np.float32).reshape(-1, 3), emit_mat('outerglint', None, 3.0 * GLOW))
tick(f'boulevard trees {len(BT)}, outer glints {len(WG)}')

# ---------------- 头顶浮岛的投影：夜里没有日照，挡住的是上方漫射下来的天光，所以影子在岛的正下方、边缘很虚 ----------------
# 用三层逐渐缩小的半透明暗面叠出柔和的边（不画描边）。岛的轮廓由查看器的「上层投影」叠加层给出。
soft = [Batch(f'isle_shade{k}', tc.shade_mat(f'isle_shade{k}', (0, 0, 0), a)) for k, a in enumerate((.1, .12, .14))]
for iid, ix, iy, rx, ry, rot, alt in tc.upper_islands():
    for k, sc_ in enumerate((1.2, 1.0, .78)):
        bm = soft[k].bm; ret = bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=1)
        bmesh.ops.transform(bm, verts=ret['verts'], matrix=Matrix.Translation((ix, iy, .6 + k * .01)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((rx * sc_, ry * sc_, 1, 1)))
for b_ in soft: b_.done().visible_shadow = False
# A7 第 2 轮：「缝隙天光」只从浮岛之间漏下来——每座岛一块相机看不见、只挡光线的实心遮挡板（高于全部城市），
# 岛下是纯人造光，岛与岛之间才有一条条斜照的冷光和柔和的楼影。遮挡板不参与漫反射 / 反射，只参与阴影。
occ = Batch('isle_occluders', mat('isle_occ', (0, 0, 0), 1))
for iid, ix, iy, rx, ry, rot, alt in tc.upper_islands():
    ret = bmesh.ops.create_circle(occ.bm, cap_ends=True, segments=48, radius=1)
    bmesh.ops.transform(occ.bm, verts=ret['verts'], matrix=Matrix.Translation((ix, iy, 1.4)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((rx * 1.05, ry * 1.05, 1, 1)))
_oo = occ.done(); _oo.visible_camera = False; _oo.visible_diffuse = False; _oo.visible_glossy = False; _oo.visible_transmission = False
tick('island shadows')

# ---------------- 环境光：没有日照，只剩上层漏下来的一点冷色天光 ----------------
# 光晕两层：贴着灯管的小光晕（Bloom：霓虹、车灯边缘的溢光）+ 大范围的雾光（Fog Glow 半径加大到真正会扩散的尺度，强度略降，不整体过曝）
_tight = tuple(map(float, str(layer.opt.get('--tight', '.8,6.5,1.8')).split(',')))   # 调参用：--tight 阈值,尺度,强度
_fog = tuple(map(float, str(layer.opt.get('--fog', '.7,9.5,-.6')).split(',')))
# A7：楼高层次——全漫射的天光下楼顶只按颜色分高低，缩小看核心区是一片均匀的灰。加一盏很弱的冷色平行光（上层浮岛之间漏下来的天光，
# 方向与三层共用的太阳相同、软影），高楼在矮楼顶和街道上投下柔和的影子，楼高一眼读得出；天光相应略降，总亮度不变。
if DAY:
    # --day：白天版——太阳走 tc.sun_rot() 白天几何（215° 方位不变，天顶角 35° / 高度角 55°，比夜景 40° 更高：tc_common SUN_ROT_DAY），
    # 高楼与浮岛遮挡板把直射光挡在外面：楼顶亮、街道峡谷暗的强对比；天光用与上层白天一致的天蓝；夜景灯光全拆、发光面改暗色漆面。
    tc.day_reset()
    _sun = bpy.data.lights.new('sun', 'SUN'); _sun.energy = layer.f('--sun', 3.2); _sun.angle = math.radians(1.2); _sun.color = (1, .96, .9)
    _so = bpy.data.objects.new('sun', _sun); col_main.objects.link(_so); _so.rotation_euler = tc.sun_rot()
    layer.finish(world=((.55, .65, .8), .35))
else:
    _sky = bpy.data.lights.new('gap_skylight', 'SUN'); _sky.energy = layer.f('--gapsun', .8); _sky.angle = math.radians(6); _sky.color = (.72, .8, 1.0)
    _so = bpy.data.objects.new('gap_skylight', _sky); col_main.objects.link(_so); _so.rotation_euler = tc.SUN_ROT
    layer.finish(world=((.35, .42, .6), layer.f('--ambient', .58)), glare_opts=dict(threshold=_fog[0], size=_fog[1], mix=_fog[2], tight=_tight))
