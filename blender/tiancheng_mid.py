# 天城 · 中层（钢铁霓虹区，约 700 m 以下）· Blender 正俯视写实渲染（夜景草稿）
# 用法：Blender -b -P tiancheng_mid.py -- [--res 1600] [--samples 64] [--out path.png] [--crop x0,y0,x1,y1]
#       或 python3 tiancheng_mid.py -- ...（pip 装的 bpy）
# 与上层同一相机、同一平面坐标、同一片城市（tc_common.city_blocks，同一随机种子）。
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

HERE = tc.HERE
opt = tc.parse_args({'--res': '1600', '--samples': '64', '--out': os.path.join(HERE, '..', 'map', 'art', 'tc_mid_preview.png'), '--glow': '1'})
RES, SAMPLES, OUT, GLOW = int(opt['--res']), int(opt['--samples']), os.path.abspath(opt['--out']), float(opt['--glow'])
rng, sc, col_main = tc.setup()
city = tc.city_blocks(rng)                     # 必须是第一个随机调用：街道与楼的位置与上层、下层一致
R = np.random.default_rng(7001); random.seed(7001)   # 本层自己的随机（霓虹、广告、轨道），不影响城市布局

def srgb(h):                                   # '#ff3d9a' → 线性 RGB
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)
PINK, CYAN, VIOLET, AMBER, ICE = srgb('#ff3d9a'), srgb('#3de0ff'), srgb('#9a4dff'), srgb('#ffa640'), srgb('#cfe6ff')
NEON = [PINK, CYAN, VIOLET, AMBER]; NEON_P = [.36, .34, .22, .08]
markers = []

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
B = city['boxes']; keep = tc.keep_mask(city, zones)
# 环带：去掉落在带内的盒子
ex, ey = B[:, 0] / RING['a'], B[:, 1] / RING['b']; rr = np.hypot(ex, ey); ang = np.arctan2(B[:, 1], B[:, 0]) % (2 * math.pi)
inband = (np.abs(rr - 1) * RING['a'] < RING['w'] / 2 + .05) & (ang > RING['a0']) & (ang < RING['a1'])
par = city['parent']; inband |= np.where(par >= 0, inband[np.maximum(par, 0)], False)
keep &= ~inband
Bk, Kk, Dk = B[keep], city['kind'][keep], city['district'][keep]

# ---------------- 城市：夜间配色（楼顶暗色）----------------
n = len(Bk); cols = np.empty((n, 3), np.float32)
g = R.uniform(.06, .13, n).astype(np.float32)                       # 楼顶：暗灰，略带冷暖差
tint = R.choice(np.array([[1, 1, 1.08], [1.05, 1, .95], [.95, 1, 1.05], [1, .98, 1]], np.float32), n)
cols[:] = g[:, None] * tint
cols[Kk == tc.K_GROUND] = (.035, .035, .04)
cols[Kk == tc.K_PARK] = (.02, .035, .02)
eq = Kk == tc.K_EQUIP; cols[eq] *= 1.3
tc.road_plane((.008, .008, .01))
tc.box_mesh('city', Bk, cols, tc.vcol_mat('citymat', .55, .15))
trees = Batch('trees', mat('treen', (.01, .018, .01), .9), smooth=True)
for x, y, z, r in city['trees']:
    if tc.keep_mask({'boxes': np.array([[x, y, 0, 0, 0, 0]], np.float32), 'parent': np.array([-1])}, zones)[0]: trees.ico(x, y, z + r * .55, r, .8)
trees.done(); tick('city (night)')

# ---------------- 路灯：主干道两侧一盏盏的灯（暖白，弱），不是连续光带 ----------------
lamps = []
for x, y, w, d, rot in tc.road_lines(city, .012):
    L = max(w, d); ux, uy = (-math.sin(rot), math.cos(rot)) if d > w else (1, 0)
    for s in (-1, 1):                                                  # 双侧
        ox, oy = .07 * s * uy, -.07 * s * ux
        for t in np.arange(-L / 2, L / 2, .12):
            lamps.append((x + ux * t + ox, y + uy * t + oy, .012, .012, ZG + .004, ZG + .006))
tc.box_mesh('streetlight', lamps, np.tile(srgb('#ffe0b0'), (len(lamps), 1)), emit_mat('streetglow', None, 3.0 * GLOW))
# ---------------- 霓虹：楼顶边缘灯带 + 外墙挑出的招牌 + 楼顶全息广告 ----------------
bi = np.where(Kk == tc.K_BUILDING)[0]
strips, scol, signs, sigc, holo, holc = [], [], [], [], [], []
for i in bi:
    x, y, w, d, z0, top = Bk[i]; dist = Dk[i]
    c = NEON[R.choice(4, p=NEON_P)]
    if R.random() < .02 + .07 * dist:                                   # 楼顶边缘灯带（高楼区更密）
        for e in R.choice(4, size=1, replace=False):
            if e == 0: strips.append((x, y + d / 2 - .004, w * .9, .007, top, top + .004))
            elif e == 1: strips.append((x, y - d / 2 + .004, w * .9, .007, top, top + .004))
            elif e == 2: strips.append((x + w / 2 - .004, y, .007, d * .9, top, top + .004))
            else: strips.append((x - w / 2 + .004, y, .007, d * .9, top, top + .004))
            scol.append(c)
    if R.random() < .03 + .07 * dist and top > -3.0:                   # 外墙挑出的招牌：从墙面水平伸出，俯视能在楼缝里看到
        for _ in range(R.integers(1, 4)):
            e = R.integers(4); L = R.uniform(.018, .04); s = R.uniform(.025, .07); z = R.uniform(max(ZG + .3, top - 1.2), top - .05)
            if e == 0: signs.append((x + R.uniform(-.3, .3) * w, y + d / 2 + L / 2, s, L, z, z + .004))
            elif e == 1: signs.append((x + R.uniform(-.3, .3) * w, y - d / 2 - L / 2, s, L, z, z + .004))
            elif e == 2: signs.append((x + w / 2 + L / 2, y + R.uniform(-.3, .3) * d, L, s, z, z + .004))
            else: signs.append((x - w / 2 - L / 2, y + R.uniform(-.3, .3) * d, L, s, z, z + .004))
            sigc.append(NEON[R.choice(4, p=NEON_P)])
    if top > -1.3 and w * d > .012 and R.random() < .03 + .07 * dist:  # 全息广告：高楼楼顶上方的发光平面
        holo.append((x, y, w * .82, d * .82, top + .03, top + .031)); holc.append(NEON[R.choice(3, p=[.4, .4, .2])])
tc.box_mesh('neon_strips', strips, scol, emit_mat('neon', None, 5.0 * GLOW))
tc.box_mesh('neon_signs', signs, sigc, emit_mat('signs', None, 3.0 * GLOW))
tc.box_mesh('holo_ads', holo, np.array(holc) * .9, emit_mat('holo', None, .7 * GLOW, stripes=60, alpha=.6))
# 楼顶小灯（设备、天窗透光）：暖白点
eqi = np.where(eq)[0]; eqi = eqi[R.random(len(eqi)) < .18]
dots = [(Bk[i, 0], Bk[i, 1], .01, .01, Bk[i, 5], Bk[i, 5] + .002) for i in eqi]
tc.box_mesh('roof_dots', dots, np.tile(srgb('#ffd9a0'), (len(dots), 1)), emit_mat('dots', None, 2.0 * GLOW))
spill = []
for (x, y, w, d, z0, z1), c in list(zip(signs, sigc)) + list(zip(strips, scol)):
    if R.random() < .15: spill.append((x, y, z1 + .06, c))
tc.point_lights('neon_spill', spill, .08 * GLOW)
tick(f'neon spill {len(spill)}')
tick(f'neon strips {len(strips)} signs {len(signs)} holo {len(holo)}')

# ---------------- 天桥：相邻高楼之间的连廊（「层层叠叠」）----------------
tall = [i for i in bi if Bk[i, 5] > -1.4]
kd = KDTree(len(tall))
for j, i in enumerate(tall): kd.insert((Bk[i, 0], Bk[i, 1], 0), j)
kd.balance()
bridges, blines, brot = [], [], []
for j, i in enumerate(tall):
    if R.random() > .35: continue
    for (co_, k, dd) in kd.find_range((Bk[i, 0], Bk[i, 1], 0), .7):
        if k <= j or dd < .2: continue
        o = tall[k]; z = min(Bk[i, 5], Bk[o, 5]) - R.uniform(.1, .6)
        mx, my = (Bk[i, 0] + Bk[o, 0]) / 2, (Bk[i, 1] + Bk[o, 1]) / 2; rot = math.atan2(Bk[o, 1] - Bk[i, 1], Bk[o, 0] - Bk[i, 0])
        bridges.append((mx, my, dd, .03, z, z + .015)); blines.append((mx, my, dd * .95, .004, z + .015, z + .017)); brot.append(rot)
        break
if bridges:
    tc.box_mesh('skybridges', bridges, np.full((len(bridges), 3), .05), tc.vcol_mat('bridgemat', .4, .6), rot=np.array(brot))
    tc.box_mesh('skybridge_lines', blines, np.array([CYAN if R.random() < .6 else PINK for _ in blines]), emit_mat('bridgeglow', None, 3.0 * GLOW), rot=np.array(brot))
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
def lamp_ring(b, x, y, z, rx, ry, n, s=.012, rot=0):
    for k in range(n):
        a = k / n * 2 * math.pi; px, py = rx * math.cos(a), ry * math.sin(a)
        b.box(x + px * math.cos(rot) - py * math.sin(rot), y + px * math.sin(rot) + py * math.cos(rot), z, s, s, .003)
def ground(x, y, w, d, c, rot=0, z=ZG + .006):
    b = Batch('pl', mat('pl', c, .7)); b.box(x, y, z - .006, w, d, .006, rot); return b.done()

# 执法局总局：总部大楼 + 前广场 + 围墙；冷白 + 执法蓝灯
x, y = HQ; blue = srgb('#4f8dff')
ground(x, y, 1.9, 1.5, (.04, .042, .05))
hq = Batch('hq', mat('hq_roof', (.07, .075, .085), .4, .5))
hq.box(x, y + .15, ZG, 1.05, .62, 3.3)                          # 裙楼
hq.box(x, y + .2, ZG, .5, .44, 3.72)                            # 主楼（顶在 z≈.12）
for dx in (-.4, .4): hq.box(x + dx, y + .2, ZG, .16, .38, 3.55)
for sx in (-1, 1):                                              # 围墙
    hq.box(x + sx * .92, y, ZG, .03, 1.42, .25); hq.box(x, y + sx * .72, ZG, 1.86, .03, .25)
hq.done()
hl = Batch('hq_lights', emit_mat('hq_blue', blue, 4.0 * GLOW))
for sx in (-1, 1):
    hl.box(x + sx * .92, y, ZG + .25, .01, 1.38, .003); hl.box(x, y + sx * .72, ZG + .25, 1.82, .01, .003)
hl.box(x, y + .2 + .22, ZG + 3.72, .48, .008, .003); hl.box(x, y + .2 - .22, ZG + 3.72, .48, .008, .003)
hl.done()
hw = Batch('hq_white', emit_mat('hq_white', ICE, 3.0 * GLOW))
hw.ring(x, y + .2, ZG + 3.72, .1, .008, .003, 24)              # 楼顶停机坪
lamp_ring(hw, x, y - .45, ZG + .01, .35, .15, 14)
hw.done()
markers.append({'id': 'enforcement_hq', 'pos': (x, y + .2, 0)})

# 辉光大教堂：十字形平面、双塔西立面、东端半圆后殿、中央穹顶；金色辉光（区别于霓虹）
x, y = CATH; gold = srgb('#ffc56b')
ground(x - .2, y, 2.1, 1.5, (.07, .065, .06))
ca = Batch('cathedral', mat('cath_stone', (.36, .34, .31), .55))
ca.box(x, y, ZG, 1.35, .32, 3.35)                               # 中殿
ca.box(x + .2, y, ZG, .3, .9, 3.35)                             # 耳堂
ca.cyl(x + .68, y, ZG, .16, 3.3, 32)                            # 后殿
for sy in (-1, 1): ca.box(x - .62, y + sy * .13, ZG, .15, .15, 3.72)   # 西立面双塔
ca.cyl(x + .2, y, ZG + 3.35, .14, .14, 32, r2=.06)              # 穹顶
for k in range(7): ca.box(x - .5 + k * .16, y, ZG, .03, .44, 3.2)       # 飞扶壁
ca.done()
cg = Batch('cath_glow', emit_mat('cath_gold', gold, 3.2 * GLOW))
cg.box(x, y, ZG + 3.35, 1.3, .008, .003); cg.box(x + .2, y, ZG + 3.35, .008, .86, .003)   # 屋脊金线
cg.ring(x + .2, y, ZG + 3.49, .075, .01, .003, 32)              # 穹顶灯环
for sy in (-1, 1): cg.box(x - .62, y + sy * .13, ZG + 3.72, .05, .05, .003)
lamp_ring(cg, x - 1.0, y, ZG + .01, .28, .5, 18)                # 前广场灯
cg.done()
ground(x - 1.0, y, .6, 1.1, (.12, .11, .09))                    # 前广场石面（比街区亮）
markers.append({'id': 'radiance_cathedral', 'pos': (x + .1, y, 0)})

# 圣铁摇篮：独立院落——高墙、四面回廊、中庭训练场、小礼拜堂；灯光稀少
x, y = CRADLE
ground(x, y, 1.45, 1.2, (.05, .05, .052))
cr = Batch('cradle', mat('cradle_roof', (.09, .09, .1), .5, .6))
for sx in (-1, 1): cr.box(x + sx * .7, y, ZG, .05, 1.2, .5); cr.box(x, y + sx * .58, ZG, 1.45, .05, .5)
for sx in (-1, 1): cr.box(x + sx * .45, y, ZG, .2, .8, 1.2); cr.box(x, y + sx * .36, ZG, .7, .16, 1.2)   # 回廊四翼
cr.box(x + .52, y - .45, ZG, .22, .12, 1.8); cr.cyl(x - .52, y - .45, ZG, .07, 1.9, 16)             # 礼拜堂、钟楼
cr.done()
ground(x, y, .66, .52, (.16, .13, .09))                          # 中庭训练场（沙地）
cl = Batch('cradle_lights', emit_mat('cradle_warm', srgb('#ffcf8a'), 2.2 * GLOW))
lamp_ring(cl, x, y, ZG + .01, .28, .21, 12, .01)
for sx in (-1, 1): cl.box(x + sx * .7, y, ZG + .5, .006, 1.1, .002)
cl.done()
markers.append({'id': 'iron_cradle', 'pos': (x, y, 0)})

# 环城军营带：沿西缘的一段环带——营房长楼、操场、双层围墙、探照灯塔
bm_ = Batch('barracks', mat('barracks_roof', (.07, .08, .07), .6, .3))
bl = Batch('barracks_lights', emit_mat('barracks_white', ICE, 3.5 * GLOW))
yard = Batch('barracks_yard', mat('yard', (.06, .062, .06), .8))
N = 90
for i in range(N):
    t0, t1 = i / N, (i + 1) / N
    x0, y0, _ = ring_pt(t0); x1, y1, _ = ring_pt(t1); a = math.atan2(y1 - y0, x1 - x0); L = math.hypot(x1 - x0, y1 - y0) * 1.04
    for off in (-RING['w'] / 2, RING['w'] / 2):                 # 围墙（内外两道）
        px, py, _ = ring_pt((t0 + t1) / 2, off); bm_.box(px, py, ZG, L, .03, .3, a)
        if i % 6 == 0: bl.box(px, py, ZG + .3, .02, .02, .003)
    px, py, _ = ring_pt((t0 + t1) / 2); yard.box(px, py, ZG, L, RING['w'] * .95, .006, a)
    seg = i % 10
    if seg < 7:                                                # 营房：垂直于环带的长条楼
        for off in (-.24, .2):
            if seg % 2 == 0:
                px, py, _ = ring_pt((t0 + t1) / 2, off); bm_.box(px, py, ZG, .07, .3, R.uniform(.9, 1.3), a)
    elif seg == 8:                                             # 探照灯塔
        px, py, _ = ring_pt((t0 + t1) / 2, 0); bm_.cyl(px, py, ZG, .03, 1.6, 12); bl.box(px, py, ZG + 1.6, .05, .05, .003)
bm_.done(); bl.done(); yard.done()
markers.append({'id': 'barracks_ring', 'pos': (*ring_pt(.5)[:2], 0)})

# 星渊大学：草坪方庭、图书馆玻璃穹顶、天文台；路灯暖白
x, y = UNIV
ground(x, y, 3.0, 2.1, (.02, .028, .02))
lawn = Batch('univ_lawn', mat('univ_lawn', (.02, .045, .02), .9))
for dx, dy in ((-.6, .3), (.5, .3), (-.6, -.45), (.5, -.45)): lawn.box(x + dx, y + dy, ZG + .006, .7, .5, .004)
lawn.done()
un = Batch('univ', mat('univ_roof', (.13, .11, .09), .6))
for dx in (-1.25, 1.2):
    for dy in (-.8, -.2, .5): un.box(x + dx, y + dy, ZG, .28, .42, 2.4)
for dx in (-.6, .5): un.box(x + dx, y + .78, ZG, .7, .16, 2.6); un.box(x + dx, y - .9, ZG, .7, .14, 2.4)
un.cyl(x - .05, y - .08, ZG, .22, 2.8, 32)                       # 图书馆
un.done()
dome = Batch('univ_dome', emit_mat('univ_dome_glow', srgb('#7fc8ff'), 1.2 * GLOW))
dome.cyl(x - .05, y - .08, ZG + 2.8, .18, .02, 32)
dome.done()
obs = Batch('observatory', mat('obs', (.3, .31, .33), .3, .8)); obs.cyl(x + 1.2, y + .95, ZG, .1, 3.0, 24); obs.ico(x + 1.2, y + .95, ZG + 3.0, .1, .8); obs.done()
ul = Batch('univ_lights', emit_mat('univ_warm', srgb('#ffe2b0'), 2.2 * GLOW))
for dx in np.linspace(-1.05, 1.0, 12):
    ul.box(x + dx, y - .08, ZG + .01, .01, .01, .003)
for dy in np.linspace(-.8, .7, 8):
    ul.box(x - .05, y + dy, ZG + .01, .01, .01, .003)
ul.done()
markers.append({'id': 'starabyss_univ', 'pos': (x - .05, y - .08, 0)})

# 层间检查点：中层 C 区 → 下层 7 号井通道——竖井口、闸口、排队通道；琥珀 / 红色警示灯
x, y = CHECK
ground(x, y, 1.6, 1.2, (.05, .05, .045))
ck = Batch('checkpoint', mat('ck', (.1, .1, .1), .5, .5))
ck.ring(x, y, ZG, .34, .06, .35, 48)                            # 井口围墙
for sx in (-1, 1): ck.box(x + sx * .55, y - .1, ZG, .22, .55, .7)          # 两侧闸楼
for k in range(5): ck.box(x - .2 + k * .1, y - .5, ZG, .012, .3, .1)      # 排队通道隔栏
ck.done()
void = Batch('shaft', mat('shaft', (.0, .0, .0), 1)); void.cyl(x, y, ZG - 2, .32, 2.01, 48); void.done()
cw = Batch('ck_warn', emit_mat('ck_amber', AMBER, 3.0 * GLOW)); cw.ring(x, y, ZG + .35, .34, .012, .003, 48)
for sx in (-1, 1): cw.box(x + sx * .55, y - .1, ZG + .7, .2, .01, .003)
cw.done()
cr_ = Batch('ck_red', emit_mat('ck_red', srgb('#ff3030'), 3.0 * GLOW))
for k in range(6): cr_.box(x - .25 + k * .1, y - .66, ZG + .1, .06, .008, .003)   # 栏杆红灯
cr_.done()
markers.append({'id': 'checkpoint_c', 'pos': (x, y, 0)})
# 天城议会：半圆形议事厅 + 扁穹顶 + 前庭；暖白灯，比周围的霓虹安静
x, y = COUNCIL
ground(x, y - .2, 1.9, 1.4, (.06, .06, .06))
cc = Batch('council', mat('council_stone', (.3, .29, .27), .5))
cc.cyl(x, y, ZG, .42, 3.45, 48)                                  # 议事厅（圆形主体）
cc.cyl(x, y, ZG + 3.45, .34, .08, 48, r2=.12)                    # 扁穹顶
for sx in (-1, 1): cc.box(x + sx * .6, y - .05, ZG, .3, .5, 3.2)  # 两翼办公楼
for k in range(9): cc.box(x - .32 + k * .08, y - .47, ZG, .02, .02, 3.3)   # 柱廊
cc.done()
ground(x, y - .75, .9, .4, (.14, .13, .11))                      # 前庭石面
cw_ = Batch('council_glow', emit_mat('council_warm', srgb('#fff0d0'), 2.6 * GLOW))
cw_.ring(x, y, ZG + 3.53, .2, .008, .003, 36)
lamp_ring(cw_, x, y - .75, ZG + .01, .4, .16, 14)
cw_.done()
markers.append({'id': 'council', 'pos': (x, y, 0)})
tick('landmarks')

# ---------------- 头顶浮岛的投影：暗色、低对比的椭圆轮廓 ----------------
fill = Batch('isle_shade', tc.shade_mat('isle_shade', (0, 0, 0), .42))
rim = Batch('isle_rim', tc.shade_mat('isle_rim', (0, 0, 0), .9))
for iid, ix, iy, rx, ry, rot, alt in tc.upper_islands():
    bm = fill.bm; ret = bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=1)
    bmesh.ops.transform(bm, verts=ret['verts'], matrix=Matrix.Translation((ix, iy, .6)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((rx, ry, 1, 1)))
    rim.ring(ix, iy, .61, 1, .09, .002, 64, rx, ry, rot)
for o in (fill.done(), rim.done()): o.visible_shadow = False
tick('island shadows')

# ---------------- 环境光：没有日照，只剩上层漏下来的一点冷色天光 ----------------
world = bpy.data.worlds.new('sky'); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (.35, .42, .6, 1); bg.inputs['Strength'].default_value = float(opt.get('--ambient', .7))
co = tc.camera_and_render(sc, RES, SAMPLES, OUT, opt)
sc.cycles.light_sampling_threshold = .01
tc.glare(sc, threshold=.9, size=6, mix=-.55)
tc.write_data('tc_mid', sc, co, markers)
tc.render(sc, OUT, f'markers {len(markers)}')
