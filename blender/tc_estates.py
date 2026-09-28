# 天城 · 上层浮岛与庄园（tiancheng_upper.py 调用）。设计与自评见 docs/upper-estates.md。
# 目标（用户：「每个岛都长一个样，这很致命」）：
#   轮廓 —— 按岛 id 定种子的极坐标轮廓：椭圆 × 几个谐波（海岬、内湾）；少数长条、双峰（葫芦形）岛。
#   地形 —— 岛心留给园子（平缓），外圈起伏；按数据加台地（不规则多边形，单侧挡土墙）、湖（可能带瀑布出水口）、裸岩峰。
#   岛缘 —— 按角度分 3–6 段混用：崖边 / 石墙 / 林带 / 垂根 / 无（草直接到崖口），不再是统一的一圈。
#   园林 —— 英式风景园（连续蛇形湖、回车圆、隐垣、成团的树 + 菜园 / 神庙 / 林荫道 / 果园 / 船屋 / 鹿苑）、
#            法式规整园（5 个布局族：中轴水渠 / 护城河 / 水镜 + 鹅掌路 / T 形运河 + 下沉花坛 / 狩猎小楼 + 星形林路；3 种主楼平面）、
#            苏州园林（贴岸白墙围合、以池为心、厅—池—山、九曲桥、连续廊、分院墙）、岭南园林（镬耳山墙的梳式院落、前方池 + 水榭廊桥、方阁、园外榕树荔枝）。
#   第 5 版（B2 第 2 轮）：树冠按真实尺度（冠幅半径 .045–.09，即 9–18 m），密度 ÷5；地标岛补整园；航线在岛外寻路。
# 坐标：岛的「本地」坐标以岛心为原点、沿岛的 rot 转；1 单位 = 100 m。所有几何按材料合批（tc.Batch），最后统一生成。
import bpy, bmesh, math, hashlib, bisect, heapq, numpy as np
import tc_common as tc
from tc_common import W, H, tick
from mathutils import Matrix

def seed_of(s): return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)
def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0))) if e1 != e0 else float(x >= e0); return t * t * (3 - 2 * t)
TAU = 2 * math.pi

# ---------------- 几何小工具（本地坐标的多边形）----------------
def pip(x, y, P):
    ins, j = False, len(P) - 1
    for i in range(len(P)):
        xi, yi = P[i]; xj, yj = P[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: ins = not ins
        j = i
    return ins
def pip_np(X, Y, P):
    ins = np.zeros(X.shape, bool)
    for i in range(len(P)):
        (xi, yi), (xj, yj) = P[i], P[i - 1]
        if yi == yj: continue
        ins ^= ((yi > Y) != (yj > Y)) & (X < (xj - xi) * (Y - yi) / (yj - yi) + xi)
    return ins
def ray_dist(px, py, th, P):
    """(px, py) 沿 th 方向到多边形边界的距离。"""
    dx, dy = math.cos(th), math.sin(th); best = None
    for i in range(len(P)):
        (x1, y1), (x2, y2) = P[i - 1], P[i]; ex, ey = x2 - x1, y2 - y1; den = dx * ey - dy * ex
        if abs(den) < 1e-12: continue
        t = ((x1 - px) * ey - (y1 - py) * ex) / den; u = ((x1 - px) * dy - (y1 - py) * dx) / den
        if t > 1e-9 and -1e-9 <= u <= 1 + 1e-9 and (best is None or t < best): best = t
    return best or 0.0
def poly_area(P): return .5 * abs(sum(P[i - 1][0] * P[i][1] - P[i][0] * P[i - 1][1] for i in range(len(P))))
def rect_pts(cx, cy, w, d, a):
    c, s = math.cos(a), math.sin(a)
    return [(cx + dx * c - dy * s, cy + dx * s + dy * c) for dx, dy in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]
def ell_pts(cx, cy, A, Bb, ang=0.0, n=16):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + A * math.cos(t) * c - Bb * math.sin(t) * s, cy + A * math.cos(t) * s + Bb * math.sin(t) * c) for t in np.linspace(0, TAU, n, endpoint=False)]
def te_ell(c, r): return ell_pts(c[0], c[1], r, r, 0, 16)
def _seg_dist(x, y, a, b):
    ex, ey = b[0] - a[0], b[1] - a[1]; L2 = ex * ex + ey * ey
    t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, ((x - a[0]) * ex + (y - a[1]) * ey) / L2))
    return math.hypot(x - a[0] - t * ex, y - a[1] - t * ey)
def chaikin(P, it=2):
    for _ in range(it):
        Q = [P[0]]
        for (ax, ay), (bx, by) in zip(P, P[1:]): Q += [(.75 * ax + .25 * bx, .75 * ay + .25 * by), (.25 * ax + .75 * bx, .25 * ay + .75 * by)]
        Q.append(P[-1]); P = Q
    return P

# ---------------- 材料 ----------------
GRASS = {   # 岛面草色（暗, 亮）：英式深绿草场、法式修剪浅绿、苏州偏黄绿、岭南浓荫深绿、伊甸明绿、银冠堡干草
    'english': ((.055, .12, .03), (.12, .21, .055)), 'chateau': ((.15, .26, .075), (.23, .34, .11)),
    'suzhou': ((.12, .16, .065), (.19, .24, .10)), 'lingnan': ((.045, .10, .03), (.09, .16, .045)),
    'neoclassical': ((.13, .25, .075), (.21, .33, .11)), 'fortress': ((.17, .19, .11), (.25, .26, .17)),
}
# v9 群落（biome）：岛面主色决定俯视整体色调（用户 2026-09-28：不要每座岛都是绿草坪）。(暗, 亮) + 岩面露头比例 + 树种替换
GRASS.update({
    'meadow':   ((.16, .22, .06), (.30, .33, .10)),    # 野花草甸：黄绿
    'autumn':   ((.20, .11, .03), (.38, .22, .07)),    # 秋林：赭 / 橙
    'conifer':  ((.04, .08, .05), (.08, .13, .08)),    # 针叶 / 高山：冷墨绿
    'rock':     ((.24, .22, .19), (.40, .37, .33)),    # 崖壁碎石：灰褐
    'heath':    ((.16, .09, .12), (.26, .16, .17)),    # 石南荒原：紫褐
    'vineyard': ((.20, .16, .08), (.30, .26, .13)),    # 葡萄梯田：土黄
    'water':    ((.06, .16, .07), (.12, .26, .12)),    # 水景园：浓绿
    'orchard':  ((.11, .18, .05), (.20, .28, .09)),    # 果园：中绿
})
BIOME_TREES = {   # 群落 → 树种替换（tree1/tree2 → 该群落的冠色）
    'autumn': ('tree_au1', 'tree_au2'), 'conifer': ('tree_cf', 'tree_cf'), 'rock': ('tree_cf', 'tree_cf'),
    'heath': ('tree_heath', 'tree_cf'), 'orchard': ('tree_orch', 'tree_orch'), 'vineyard': ('tree_orch', 'tree2'),
}
TOPIARY = {'topiary'}                 # 修剪紫杉 / 黄杨球：冠幅下限的白名单
CROWN_MIN = .04                       # 其余树冠半径 ≥ 4 m
NOCOV = {'lawn', 'lawn2', 'lawn_e', 'lawn_e2', 'meadow'}   # 「空草坪」：不计入园林覆盖
_M = {}
def mats():
    if 'rock_under' in _M: return _M
    m, nm = tc.mat, tc.noise_mat
    _M.update({
        'rock_under': nm('rock_under', (.20, .18, .16), (.36, .32, .28), 14, .95, .7),   # 岛底岩体（名字以 rock 开头：云海里不投影）
        'stone_warm': nm('st_warm', (.52, .46, .36), (.62, .56, .46), 60, .8, .15),     # 英式蜂蜜色石
        'marble': nm('st_marble', (.78, .77, .73), (.86, .85, .81), 50, .6, .05),       # 法式白石
        'whitewall': m('st_whitewall', (.82, .81, .78), .7),                              # 苏州粉墙
        'greybrick': nm('st_greybrick', (.30, .33, .35), (.36, .39, .41), 150, .85, .1),  # 岭南青砖（偏青，均值约 .33/.36/.38）
        'brick': nm('st_brick', (.36, .17, .12), (.44, .22, .15), 120, .85, .1),           # 围墙菜园的红砖墙
        'stone': nm('st_stone', (.42, .41, .40), (.56, .55, .52), 30, .8, .2),
        'gravel': nm('gr_gravel', (.47, .44, .38), (.56, .52, .45), 300, .9, .1),          # 砾石（压暗，不再抢眼）
        'path': m('gr_path', (.62, .59, .52), .7),
        'paving': nm('gr_paving', (.38, .37, .34), (.47, .45, .41), 220, .85, .08),       # 苏州花街铺地（灰褐）
        'paving_g': nm('gr_paving_g', (.33, .35, .35), (.41, .43, .43), 200, .85, .08),   # 岭南青石板
        'lawn': nm('gr_lawn', (.20, .34, .11), (.27, .41, .15), 90, .85, .05),          # 修剪草坪（花坛底）
        'lawn_p': nm('gr_lawn_p', (.20, .34, .11), (.27, .41, .15), 90, .85, .05),       # 花坛格里的草（设计过的，计入园林覆盖）
        'lawn_p2': nm('gr_lawn_p2', (.16, .30, .09), (.22, .36, .12), 90, .85, .05),
        'lawn2': nm('gr_lawn2', (.16, .30, .09), (.22, .36, .12), 90, .85, .05),        # 条纹割草的另一色
        'lawn_e': nm('gr_lawn_e', (.15, .27, .08), (.21, .33, .11), 90, .85, .05),       # 伊甸下沉草坪（与岛面草色明度差 ≤ 8 %）
        'lawn_e2': nm('gr_lawn_e2', (.13, .245, .07), (.18, .30, .095), 90, .85, .05),   # 下沉草坪的坡面（略暗）
        'meadow': nm('gr_meadow', (.20, .22, .09), (.30, .30, .13), 40, .9, .1),        # 野花草甸（偏黄）
        'hedge': nm('gr_hedge', (.035, .085, .025), (.06, .13, .04), 200, .9, .4),     # 修剪黄杨
        'beds': nm('gr_beds', (.30, .20, .12), (.40, .30, .16), 40, .9, .2),            # 菜畦 / 花境的泥土
        'flowers': nm('gr_flowers', (.55, .30, .35), (.75, .60, .30), 120, .9, .1),
        'tea': nm('gr_tea', (.10, .20, .06), (.15, .27, .08), 200, .9, .5),             # 茶垄
        'water': m('wt_water', (.04, .14, .19), .03, spec=.9),
        'water_l': m('wt_water_l', (.07, .20, .22), .03, spec=.9),                        # 浅池 / 水渠（偏青）
        'foam': m('wt_foam', (.85, .88, .9), .4),
        'glass': m('bl_glass', (.55, .66, .70), .05, metal=.2, spec=.9),                  # 温室玻璃
        'pad': m('bl_pad', (.46, .48, .52), .4, metal=.3),
        'dark': m('bl_dark', (.16, .16, .18), .6),
        'gold': m('bl_gold', (.70, .54, .22), .3, metal=1),
        'roots': nm('rk_roots', (.10, .08, .05), (.18, .15, .09), 60, .95, .6),          # 岛缘垂根 / 藤
        'boulder': nm('rock_boulder', (.36, .34, .31), (.52, .49, .45), 20, .95, .6),    # 裸岩、假山石（也不投影到云上）
        'rockery': nm('rock_rockery', (.46, .46, .44), (.64, .63, .60), 40, .9, .8),     # 太湖石假山（偏白灰）
        'car': m('bl_car', (.10, .11, .14), .2, metal=.8),
        'airship': m('bl_airship', (.80, .80, .78), .45),                                 # 悬浮载具（浅色车身；卡里没有飞艇）
        'roof_lead': m('bl_roof_lead', (.40, .42, .45), .5, metal=.3),
        'marble_d': m('st_marble_d', (.70, .69, .65), .5),                                      # 伊甸岛缘栏杆（压暗）
        'aether': tc.emit_mat('bl_aether', (.45, .9, 1.0), 4.0),                                    # 以太晶簇（自发光青）
        'tree_au1': m('tr_au1', (.42, .16, .04), .9), 'tree_au2': m('tr_au2', (.50, .32, .06), .9), 'tree_cf': m('tr_cf', (.02, .06, .04), .9),
        'tree_heath': m('tr_heath', (.10, .10, .05), .9), 'tree_orch': m('tr_orch', (.14, .22, .06), .9),
        'tree1': m('tr_oak', (.05, .12, .04), .9), 'tree2': m('tr_lime', (.085, .17, .05), .9),
        'tree3': m('tr_bamboo', (.13, .23, .07), .9), 'tree4': m('tr_banyan', (.03, .085, .03), .9),
        'tree5': m('tr_blossom', (.52, .36, .40), .9), 'tree6': m('tr_conifer', (.03, .08, .045), .9),
        'topiary': m('tr_topiary', (.03, .075, .03), .9),
        'sz_ground': nm('gr_sz_ground', (.17, .20, .12), (.36, .33, .27), 18, .9, .1),       # 苏州园地：苔地与暖色花街铺地各半（B2 第 3 轮）
        'paving_w': nm('gr_paving_w', (.40, .37, .31), (.48, .44, .37), 220, .85, .08),       # 暖色花街铺地
        # 岭南（B2 第 3 轮）
        'ln_ear': m('ln_ear', (.11, .12, .125), .7),                                          # 镬耳墙头（深色压顶）
        'ln_ridge': m('ln_ridge', (.58, .58, .55), .6),                                       # 屋脊灰塑脊线
        'ln_tile': m('ln_tile', (.15, .19, .17), .6),                                         # 灰绿瓦（亭、楼阁攒尖）
        'ln_pave': nm('gr_ln_pave', (.36, .34, .30), (.44, .41, .36), 200, .85, .08),        # 禾坪 / 天井麻石（暖灰，小块）
        'ln_hepin': nm('gr_ln_hepin', (.27, .26, .23), (.33, .31, .27), 160, .85, .08),       # 禾坪（偏暗，不当停车场读）
        'ln_lane': nm('gr_ln_lane', (.20, .19, .18), (.26, .25, .23), 200, .85, .08),        # 巷道暗砖
        'ln_ground': nm('gr_ln_ground', (.07, .13, .05), (.12, .19, .075), 60, .9, .1),     # 园地（苔绿，计入园林覆盖）
        'ln_water': m('wt_ln_water', (.04, .09, .07), .05, spec=.7),                              # 岭南塘水：偏绿褐的浑水（不当泳池读）
        'ln_curb': nm('gr_ln_curb', (.24, .23, .21), (.31, .30, .27), 90, .9, .2),          # 麻石驳岸（暗、不规则）
        'ln_timber': m('ln_timber', (.30, .13, .08), .6),                                     # 木构（亭柱、水榭）
    })
    return _M

def top_mat(style):
    """岛面：两色噪声草地 × 低频斑块（±8 %）× 每座岛的随机明暗 / 色偏；只有真正陡的坡（法线 z < .80–.88）露岩，台地缓坡不再出灰晕。"""
    key = 'top_' + style
    if key in _M: return _M[key]
    (c1, c2) = GRASS.get(style, GRASS['english'])
    m = bpy.data.materials.new(key); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links; b = tc.bsdf_of(m)
    tco = N.new('ShaderNodeTexCoord')
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0; nz.inputs['Detail'].default_value = 10; L.new(tco.outputs['Object'], nz.inputs['Vector'])
    nz2 = N.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 40; nz2.inputs['Detail'].default_value = 6; L.new(tco.outputs['Object'], nz2.inputs['Vector'])
    mix = N.new('ShaderNodeMath'); mix.operation = 'MULTIPLY_ADD'; mix.inputs[1].default_value = .35; L.new(nz2.outputs['Fac'], mix.inputs[0]); L.new(nz.outputs['Fac'], mix.inputs[2])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (*c1, 1); ramp.color_ramp.elements[1].color = (*c2, 1)
    ramp.color_ramp.elements[0].position = .35; ramp.color_ramp.elements[1].position = 1.0; L.new(mix.outputs['Value'], ramp.inputs['Fac'])
    nz3 = N.new('ShaderNodeTexNoise'); nz3.inputs['Scale'].default_value = .8; nz3.inputs['Detail'].default_value = 2; L.new(tco.outputs['Object'], nz3.inputs['Vector'])
    lf = N.new('ShaderNodeMapRange'); lf.inputs['From Min'].default_value = .35; lf.inputs['From Max'].default_value = .65
    lf.inputs['To Min'].default_value = .86; lf.inputs['To Max'].default_value = 1.14      # B2 第 3 轮：低频斑块 ±8 % → ±14 %; L.new(nz3.outputs['Fac'], lf.inputs['Value'])
    patch = N.new('ShaderNodeMixRGB'); patch.blend_type = 'MULTIPLY'; patch.inputs['Fac'].default_value = 1
    L.new(ramp.outputs['Color'], patch.inputs['Color1']); L.new(lf.outputs['Result'], patch.inputs['Color2'])
    oi = N.new('ShaderNodeObjectInfo')                                                     # 每座岛：明度 ±15%、色相微偏
    hsv = N.new('ShaderNodeHueSaturation'); L.new(patch.outputs['Color'], hsv.inputs['Color'])
    hu = N.new('ShaderNodeMapRange'); hu.inputs['To Min'].default_value = .47; hu.inputs['To Max'].default_value = .53; L.new(oi.outputs['Random'], hu.inputs['Value']); L.new(hu.outputs['Result'], hsv.inputs['Hue'])
    va = N.new('ShaderNodeMapRange'); va.inputs['To Min'].default_value = .85; va.inputs['To Max'].default_value = 1.15; L.new(oi.outputs['Random'], va.inputs['Value']); L.new(va.outputs['Result'], hsv.inputs['Value'])
    rock = N.new('ShaderNodeValToRGB'); rock.color_ramp.elements[0].color = (.26, .24, .21, 1); rock.color_ramp.elements[1].color = (.40, .37, .33, 1)
    L.new(nz2.outputs['Fac'], rock.inputs['Fac'])
    geo = N.new('ShaderNodeNewGeometry'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], sep.inputs['Vector'])
    sl = N.new('ShaderNodeMapRange'); sl.inputs['From Min'].default_value = .80; sl.inputs['From Max'].default_value = .88; L.new(sep.outputs['Z'], sl.inputs['Value'])
    mx = N.new('ShaderNodeMixRGB'); L.new(sl.outputs['Result'], mx.inputs['Fac']); L.new(rock.outputs['Color'], mx.inputs[1]); L.new(hsv.outputs['Color'], mx.inputs[2])
    L.new(mx.outputs['Color'], b.inputs['Base Color']); tc.set_in(b, 'Roughness', .9)
    _M[key] = m; return m

# ---------------- 合批 ----------------
_BAT, TREES, ROOFS, ROOFC = {}, {}, [], []
def B(key, smooth_=False):
    if key not in _BAT: _BAT[key] = tc.Batch('up_' + key, mats()[key], smooth_)
    return _BAT[key]
def flush():
    """所有合批几何生成物体（树按种类、坡屋顶用三棱柱批量网格）。"""
    for bb in _BAT.values(): bb.done()
    for k, pts in TREES.items(): tc.ico_mesh('up_' + k, [p for p in pts if p is not None], mats()[k])
    if ROOFS:
        import tc_detail as td
        td.prism_mesh('up_roofs', ROOFS, ROOFC, tc.vcol_mat('up_roofs_v', .7))
    n = sum(sum(p is not None for p in v) for v in TREES.values()); _BAT.clear(); TREES.clear(); ROOFS.clear(); ROOFC.clear(); return n

ROOF_SLATE, ROOF_MANSARD, ROOF_TILE, ROOF_REDTILE = (.20, .21, .23), (.15, .17, .22), (.10, .10, .11), (.34, .16, .11)
LN_FAMS = ('village', 'ancestral', 'tower', 'boathall', 'rockery', 'twinpond')   # 岭南布局族（est_lingnan / _LnKit）
ROOF_LN = (.15, .19, .17)                     # 岭南灰绿瓦（苏州是黛黑瓦 ROOF_TILE）
HUB = None                 # 伊甸中心（世界坐标）：地标岛的停靠平台朝它开；tiancheng_upper.py 设置

# 布局族与主楼平面：同风格普通岛按 id 排序后轮流分配（并排的 6 座不重复）；地标岛另起一轮
FAMILIES = {
    'english': (('kitchen', 'folly', 'avenue', 'kitchen', 'orchard', 'boathouse', 'kitchen', 'deerpark'), ('L', 'H', 'E', 'court')),
    'chateau': (('axis', 'moat', 'miroir', 'tcanal', 'hunt'), ('U', 'block', 'range')),
    'suzhou': (('bay', 'islet', 'twin', 'court', 'hill', 'bay'), ('two', 'three', 'two', 'three', 'two', 'three')),
    'lingnan': (LN_FAMS, ('c1x2', 'c2x2', 'c0', 'c0', 'c0', 'c2x1')),
}
def assign_families(isles):
    """给数据里没写 layout / plan 的岛按 id 轮流分配（就地修改 dict）。"""
    num = lambda d: int(''.join(ch for ch in d['id'] if ch.isdigit()) or 0)
    for st, (fams, plans) in FAMILIES.items():
        for lm in (False, True):
            ds = sorted([d for d in isles if d.get('estate_style') == st and bool(d.get('role')) == lm], key=num)
            for i, d in enumerate(ds):
                fl = [f for f in fams if not (lm and f == 'hunt')]
                d.setdefault('layout', fl[(i + (2 if lm else 0)) % len(fl)]); d.setdefault('plan', plans[i % len(plans)])

# ---------------- 一座岛 ----------------
class Isle:
    def __init__(self, d, style=None):
        self.d, self.id = d, d['id']; self.x, self.y, self.z = d['x'], d['y'], d['z']; self.rx, self.ry, self.rot = d['rx'], d['ry'], d.get('rot', 0.0)
        self.style = style or d.get('estate_style', 'english'); self.R = np.random.default_rng(seed_of(self.id))
        R = self.R
        self.shape = d.get('shape') or (('round', 'cape', 'long', 'twin')[int(R.choice(4, p=[.4, .35, .15, .1]))] if self.style not in ('neoclassical', 'fortress') else 'cape')
        k0 = {'round': (2, 5), 'cape': (3, 7), 'long': (2, 5), 'twin': (2, 4)}[self.shape]
        self.harm = [(int(k), float(R.uniform(.03, .09 if self.shape != 'cape' else .13)), float(R.uniform(0, TAU))) for k in R.integers(k0[0], k0[1] + 1, 4)]
        if self.style in ('neoclassical', 'fortress'): self.harm = [(k, a * .45, p) for k, a, p in self.harm]   # 伊甸、银冠堡：轮廓更稳重
        self.harm.append((int(R.integers(9, 14)), float(R.uniform(.012, .025)), float(R.uniform(0, TAU))))   # 细碎的岸线
        if self.shape == 'long': self.ex, self.ey = 1.25, .72
        else: self.ex, self.ey = 1.0, 1.0
        self.F = min(self.rx, self.ry)                                                      # 岛的「尺度」：园子与建筑按它缩放
        self.rim = d.get('rim') or self._pick(dict(english=('cliff', 'hedge', 'roots'), chateau=('wall', 'wall', 'cliff'), suzhou=('roots', 'cliff', 'wall'),
                                                   lingnan=('roots', 'hedge', 'cliff'), neoclassical=('wall',), fortress=('cliff',))[self.style])
        self.terrain = d.get('terrain') or self._pick(dict(english=('meadow', 'lake', 'terrace', 'crag'), chateau=('terrace', 'meadow', 'terrace'), suzhou=('lake', 'meadow'),
                                                           lingnan=('meadow', 'lake'), neoclassical=('meadow',), fortress=('crag',))[self.style])
        self.layout, self.plan = d.get('layout', ''), d.get('plan', '')
        self.spots, self.occ, self.occ_poly, self.water = [], [], [], []                    # 地形点、占地圆、占地多边形、湖面椭圆（本地）
        self.flats = []                                                                     # 压平的园林核心（椭圆内地形噪声 → 0）
        if self.style in ('suzhou', 'lingnan', 'chateau'): self.flats.append((0.0, 0.0, .8 * self.rx * self.ex, .8 * self.ry * self.ey))
        if self.style == 'neoclassical': self.flats.append((0.0, .1, .9 * self.rx, .9 * self.ry))
        self.plat, self.terrace_spans, self.dock, self.lake = None, [], None, None
        self.main, self.dock_small = (0.0, 0.0), None                                       # 主楼位置（锚点、码头小路用）、普通岛的小码头
        self.fp, self.bldg, self.crowns, self.wl, self._tix = [], [], [], 0, []                            # 占地记录（inside 校验）、建筑外包、树冠、白名单深度
        self.noise = [(float(R.uniform(2, 6)) / max(self.F, .25), float(R.uniform(0, math.pi)), float(R.uniform(0, 6.3)), float(R.uniform(.4, 1))) for _ in range(4)]
        self._rim_segments(); self._cov_init()
    def _pick(self, opts): return opts[int(self.R.integers(len(opts)))]
    # 轮廓：极坐标半径（本地角度）
    def r(self, th):
        c, s = math.cos(th), math.sin(th)
        base = 1 / math.sqrt((c / (self.rx * self.ex)) ** 2 + (s / (self.ry * self.ey)) ** 2)
        f = 1 + sum(a * math.sin(k * th + p) for k, a, p in self.harm)
        if self.shape == 'twin': f *= .42 + .6 * abs(c) ** .7                              # 葫芦形：腰宽 ≤ 两头的 55 %
        return base * f
    def r_np(self, th):
        c, s = np.cos(th), np.sin(th)
        base = 1 / np.sqrt((c / (self.rx * self.ex)) ** 2 + (s / (self.ry * self.ey)) ** 2)
        f = 1 + sum(a * np.sin(k * th + p) for k, a, p in self.harm)
        if self.shape == 'twin': f = f * (.42 + .6 * np.abs(c) ** .7)
        return base * f
    def inside(self, lx, ly, s=1.0): return math.hypot(lx, ly) <= s * self.r(math.atan2(ly, lx))
    def sfrac(self, lx, ly): return math.hypot(lx, ly) / max(1e-6, self.r(math.atan2(ly, lx)))
    def world(self, lx, ly):
        c, s = math.cos(self.rot), math.sin(self.rot); return self.x + lx * c - ly * s, self.y + lx * s + ly * c
    def local(self, X, Y):
        c, s = math.cos(-self.rot), math.sin(-self.rot); dx, dy = X - self.x, Y - self.y; return dx * c - dy * s, dx * s + dy * c
    def south(self): return -math.pi / 2 - self.rot                                        # 世界正南在本地的角度
    def reach(self, lx, ly, ang, s=.85, step=.02):
        """从 (lx, ly) 沿 ang 走到出 inside(s) 为止的距离。"""
        d, c, sn = 0.0, math.cos(ang), math.sin(ang)
        while d < 8 and self.inside(lx + c * (d + step), ly + sn * (d + step), s): d += step
        return d
    # 岛缘分段
    def _rim_segments(self):
        R = self.R
        if self.style in ('neoclassical', 'fortress'): self.rcuts, self.rtypes = [0.0], [self.rim]; return
        n = int(R.integers(3, 7)); cuts = sorted(float(v) for v in R.uniform(0, TAU, n))
        alt = {'cliff': ('hedge', 'roots'), 'hedge': ('cliff', 'roots'), 'roots': ('cliff', 'hedge'), 'wall': ('hedge', 'cliff')}[self.rim]
        types = []
        for i in range(n):
            u = R.random(); types.append(self.rim if u < .6 else ('none' if u > .85 else alt[int(R.integers(len(alt)))]))
        lens = [((cuts[(i + 1) % n] - cuts[i]) % TAU) for i in range(n)]
        order = sorted(range(n), key=lambda i: -lens[i]); types[order[0]] = self.rim
        if 'none' not in types: types[order[-1]] = 'none'                                   # 约 15 %：草直接到崖口
        if len(set(types)) < 3 and n >= 3: types[order[1]] = alt[0]
        self.rcuts, self.rtypes = cuts, types
    def rim_at(self, th):
        th %= TAU; i = bisect.bisect_right(self.rcuts, th) - 1
        return self.rtypes[i]                                                               # i = -1：绕回最后一段
    def rim_segs(self):
        n = len(self.rcuts)
        if n == 1: return [(0.0, TAU, self.rtypes[0])]
        return [(self.rcuts[i], self.rcuts[i] + (self.rcuts[(i + 1) % n] - self.rcuts[i]) % TAU, self.rtypes[i]) for i in range(n)]
    def _cliffw(self, th): return sum(self.rim_at(th + d) == 'cliff' for d in (-.12, 0, .12)) / 3
    # 台地轮廓（绕台地中心的极坐标）
    def plat_r(self, phi):
        p = self.plat
        if p['kind'] == 'rect':
            u = phi - p['ang']; return 1 / ((abs(math.cos(u)) / p['rr']) ** 4 + (abs(math.sin(u)) / (p['rr'] * p['asp'])) ** 4) ** .25
        return p['rr'] * (1 + sum(a * math.sin(k * phi + ph) for k, a, ph in p['harm']))
    def on_plateau(self, lx, ly, m=0.0):
        if not self.plat: return True
        cx, cy = self.plat['c']; return math.hypot(lx - cx, ly - cy) <= self.plat_r(math.atan2(ly - cy, lx - cx)) - m
    # 地形高度（相对岛面基准 z）
    def h(self, lx, ly):
        s = self.sfrac(lx, ly); th = math.atan2(ly, lx)
        n = sum(a * math.sin(f * (lx * math.cos(p) + ly * math.sin(p)) + ph) for f, p, ph, a in self.noise) / 2.6
        amp = .003 + .012 * smooth(.55, .95, s) * self.F                                    # 园子（岛心）平，外圈起伏
        fl = 0.0
        for cx, cy, A, Bb in self.flats: fl = max(fl, 1 - smooth(.75, 1.0, math.hypot((lx - cx) / A, (ly - cy) / Bb)))
        v = n * amp * (1 - fl)
        for kind, cx, cy, rr, hh in self.spots:
            dd = math.hypot(lx - cx, ly - cy)
            if kind == 'plateau': pr = self.plat_r(math.atan2(ly - cy, lx - cx)); v += hh * smooth(pr + .14 * max(self.F, .4), pr, dd)   # 缓坡，不露岩
            elif kind == 'bump': v += hh * math.exp(-(dd / rr) ** 2)
            elif kind == 'dip': v -= hh * smooth(rr, rr * .6, dd)
        wc = self._cliffw(th)
        if wc > 0: v -= wc * (.05 + .05 * self.F) * smooth(.88, 1.0, s) ** 1.6 * (1 + .4 * math.sin(5 * th + 1.3))
        return v - (1 - wc) * .012 * smooth(.95, 1.0, s)
    def Z(self, lx, ly): return self.z + self.h(lx, ly)
    # ---- 园林覆盖栅格（本地）----
    def _cov_init(self):
        rm = max(self.r(t) for t in np.linspace(0, TAU, 120, endpoint=False)) * 1.02; G = 96 if self.rx > 2 else 64
        xs = np.linspace(-rm, rm, G); self._gx, self._gy = np.meshgrid(xs, xs); self._x0, self._cs, self._G = -rm, xs[1] - xs[0], G
        self._mask = np.hypot(self._gx, self._gy) <= self.r_np(np.arctan2(self._gy, self._gx)); self._cov = np.zeros_like(self._mask)
    def _span(self, lo, hi):
        i0 = max(0, int(math.floor((lo - self._x0) / self._cs))); i1 = min(self._G, int(math.ceil((hi - self._x0) / self._cs)) + 1); return i0, i1
    def _mark_poly(self, P):
        xs, ys = [p[0] for p in P], [p[1] for p in P]; i0, i1 = self._span(min(xs), max(xs)); j0, j1 = self._span(min(ys), max(ys))
        if i1 <= i0 or j1 <= j0: return
        self._cov[j0:j1, i0:i1] |= pip_np(self._gx[j0:j1, i0:i1], self._gy[j0:j1, i0:i1], P)
    def _mark_circle(self, cx, cy, r):
        i0, i1 = self._span(cx - r, cx + r); j0, j1 = self._span(cy - r, cy + r)
        if i1 <= i0 or j1 <= j0: return
        self._cov[j0:j1, i0:i1] |= (self._gx[j0:j1, i0:i1] - cx) ** 2 + (self._gy[j0:j1, i0:i1] - cy) ** 2 <= r * r
    def coverage(self): return float((self._cov & self._mask).sum() / max(1, self._mask.sum()))
    # ---- 占地：园子里的东西互相避开 ----
    def _in_polys(self, x, y, rr=0.0, skip=None):
        for P, (x0, x1, y0, y1) in self.occ_poly:
            if P is skip or x < x0 - rr or x > x1 + rr or y < y0 - rr or y > y1 + rr: continue
            if pip(x, y, P) or (rr > 0 and any(pip(x + dx, y + dy, P) for dx, dy in ((rr, 0), (-rr, 0), (0, rr), (0, -rr)))): return True
        return False
    def free(self, lx, ly, rr, smax=.82, skip=None):
        if self.sfrac(lx, ly) + rr / max(self.F, .1) * .6 > smax: return False
        if any(math.hypot(lx - a, ly - b) < rr + c for a, b, c in self.occ): return False
        if any(((lx - a) / (A + rr)) ** 2 + ((ly - b) / (Bb + rr)) ** 2 < 1 for a, b, A, Bb, _ in self.water): return False
        return not self._in_polys(lx, ly, rr, skip)
    def claim(self, lx, ly, rr): self.occ.append((lx, ly, rr))
    def claim_poly(self, P):
        xs, ys = [p[0] for p in P], [p[1] for p in P]; self.occ_poly.append((P, (min(xs), max(xs), min(ys), max(ys)))); return P
    def claim_rect(self, cx, cy, w, d, a, pad=.01): return self.claim_poly(rect_pts(cx, cy, w + 2 * pad, d + 2 * pad, a))
    def in_bldg(self, lx, ly, m=0.0):
        return any(pip(lx, ly, P) or (m > 0 and any(pip(lx + dx, ly + dy, P) for dx, dy in ((m, 0), (-m, 0), (0, m), (0, -m)))) for P in self.bldg)
    def spot(self, rr, smax=.8, tries=60, near=None):
        """找一个空位（本地坐标）；near=(x, y, 半径) 时只在附近找。"""
        for _ in range(tries):
            if near: a = self.R.uniform(0, TAU); d = near[2] * math.sqrt(self.R.random()); lx, ly = near[0] + math.cos(a) * d, near[1] + math.sin(a) * d
            else:
                a = self.R.uniform(0, TAU); d = math.sqrt(self.R.random()) * smax; lx, ly = math.cos(a) * d * self.r(a), math.sin(a) * d * self.r(a)
            if self.free(lx, ly, rr, smax): return lx, ly
        return None
    # ---- 放东西（本地坐标 → 世界；z 贴地形）；每件记录占地（inside 校验、园林覆盖、建筑外包）----
    def _rec(self, key, P, h=0.0):
        if self.wl: return
        self.fp.append((key, P))
        if key not in NOCOV: self._mark_poly(P)
        if h >= .01: self.bldg.append(P)
    def box(self, key, lx, ly, w, d, h, a=0.0, dz=0.0):
        X, Y = self.world(lx, ly); B(key).box(X, Y, self.Z(lx, ly) + dz, w, d, h, self.rot + a); self._rec(key, rect_pts(lx, ly, w, d, a), h)
    def cyl(self, key, lx, ly, r, h, seg=16, dz=0.0, r2=None):
        X, Y = self.world(lx, ly); B(key).cyl(X, Y, self.Z(lx, ly) + dz, r, h, seg, r2); self._rec(key, ell_pts(lx, ly, r, r, 0, 12), h)
    def disc(self, key, lx, ly, a, b, ang=0.0, dz=.002, seg=40, z=None):
        X, Y = self.world(lx, ly); zz = (self.Z(lx, ly) if z is None else z) + dz
        bmesh.ops.create_circle(B(key).bm, cap_ends=True, segments=seg, radius=1,
                                matrix=Matrix.Translation((X, Y, zz)) @ Matrix.Rotation(self.rot + ang, 4, 'Z') @ Matrix.Diagonal((a, b, 1, 1)))
        self._rec(key, ell_pts(lx, ly, a, b, ang, 16))
    def patch(self, key, P, dz=.002, rings=3):
        """任意（对质心星形的）多边形面片，顶点贴地形：池面、铺地、蛇形湖。"""
        cx, cy = sum(p[0] for p in P) / len(P), sum(p[1] for p in P) / len(P); bm = B(key).bm; n = len(P)
        def v(x, y): X, Y = self.world(x, y); return bm.verts.new((X, Y, self.Z(x, y) + dz))
        c0 = v(cx, cy); rings_v = [[v(cx + (px - cx) * f, cy + (py - cy) * f) for px, py in P] for f in [(k + 1) / rings for k in range(rings)]]
        for i in range(n): bm.faces.new((c0, rings_v[0][i - 1], rings_v[0][i]))
        for a_, b_ in zip(rings_v, rings_v[1:]):
            for i in range(n): bm.faces.new((a_[i - 1], b_[i - 1], b_[i], a_[i]))
        self._rec(key, P)
    def tree(self, lx, ly, r, kind='tree1', dz=0.0, sz=None):
        bt = BIOME_TREES.get(self.d.get('biome'))
        if bt and kind in ('tree1', 'tree2', 'tree6'): kind = bt[0] if kind != 'tree2' else bt[1]
        X, Y = self.world(lx, ly); TREES.setdefault(kind, []).append((X, Y, self.Z(lx, ly) + dz + r * .55, r))
        self.crowns.append((r, kind)); self._mark_circle(lx, ly, r * .9); self._tix.append((kind, len(TREES[kind]) - 1, lx, ly, r, len(self.crowns) - 1))
    def prune_trees(self, P, f=.6):
        """园子建好后：先前种下的树（岛缘林带、湖边树）若冠心在园内、或树冠压进园墙超过 (1 - f)，就拿掉。"""
        n = 0
        for kind, i, x, y, r, ci in self._tix:
            if TREES[kind][i] is None: continue
            dmin = min(_seg_dist(x, y, P[k - 1], P[k]) for k in range(len(P)))
            if pip(x, y, P) or dmin < r * f: TREES[kind][i] = None; self.crowns[ci] = None; n += 1
        return n
    def plant(self, lx, ly, r, kind='tree1', smax=.95, fr=.5, pull=False):
        d, rt = math.hypot(lx, ly), self.r(math.atan2(ly, lx))
        if d + r * .75 > rt * .99:                                                           # 树冠不伸出岸线（pull：往里挪到刚好放得下）
            if not pull or rt * .99 - r * .75 < rt * .5: return False
            f = (rt * .99 - r * .75) / d; lx, ly = lx * f, ly * f
        if self.free(lx, ly, r * fr, smax): self.tree(lx, ly, r, kind); return True
        return False
    def roof(self, lx, ly, w, d, zb, ht, a, col):
        f = float(self.R.uniform(.94, 1.06))                                                 # 屋面明度 ±6 %
        X, Y = self.world(lx, ly); ROOFS.append((X, Y, w, d, zb, ht, self.rot + a)); ROOFC.append(tuple(min(1, c * f) for c in col))
    def house(self, key, lx, ly, w, d, h, a, col, ridge=None):
        """一栋楼：墙体 + 坡屋顶（ridge=屋脊高，默认按进深）；自动占地。"""
        z0 = min(self.Z(lx + dx, ly + dy) for dx in (-w / 2, w / 2) for dy in (-d / 2, d / 2))
        X, Y = self.world(lx, ly); B(key).box(X, Y, z0 - .01, w, d, h + .01, self.rot + a); self._rec(key, rect_pts(lx, ly, w, d, a), max(h, .01))
        self.roof(lx, ly, w * 1.04, d * 1.1, z0 + h, ridge if ridge is not None else d * .38, a, col); self.claim_rect(lx, ly, w, d, a); return z0
    def ear(self, lx, ly, span, t, zb, hgt, a, key='greybrick'):
        """岭南镬耳山墙：一片竖立的弧形墙头（本地 a 方向为墙厚，span 沿进深），高出屋脊。"""
        bm = B(key).bm; ca, sa = math.cos(self.rot + a), math.sin(self.rot + a); X0, Y0 = self.world(lx, ly)
        prof = [(-span / 2, zb - .006)] + [(span / 2 * math.cos(u), zb + hgt * (.25 + .75 * math.sin(u))) for u in np.linspace(math.pi, 0, 9)] + [(span / 2, zb - .006)]
        faces = []
        for off in (-t / 2, t / 2):
            faces.append([bm.verts.new((X0 + off * ca - v_ * sa, Y0 + off * sa + v_ * ca, z)) for v_, z in prof])
        bm.faces.new(faces[0][::-1]); bm.faces.new(faces[1])
        for i in range(len(prof) - 1): bm.faces.new((faces[0][i], faces[0][i + 1], faces[1][i + 1], faces[1][i]))
    def blimp(self, lx, ly, z, L, ang):
        X, Y = self.world(lx, ly)
        bmesh.ops.create_icosphere(B('airship', True).bm, subdivisions=2, radius=1,
                                   matrix=Matrix.Translation((X, Y, z)) @ Matrix.Rotation(self.rot + ang, 4, 'Z') @ Matrix.Diagonal((L / 2, L / 6, L / 7.5, 1)))
    def hover(self, lx, ly, z, L, ang):
        """悬浮载具：扁平流线车身（长 L，宽 L/2.6，高 L/9），贴着停靠面。"""
        X, Y = self.world(lx, ly)
        bmesh.ops.create_icosphere(B('airship', True).bm, subdivisions=2, radius=1,
                                   matrix=Matrix.Translation((X, Y, z + L / 18)) @ Matrix.Rotation(self.rot + ang, 4, 'Z') @ Matrix.Diagonal((L / 2, L / 5.2, L / 18, 1)))
    def wall_line(self, key, pts, t, h, closed=False, dz=0.0):
        n = len(pts)
        for i in range(n if closed else n - 1):
            (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]; L = math.hypot(bx - ax, by - ay)
            if L < 1e-4: continue
            self.box(key, (ax + bx) / 2, (ay + by) / 2, L + t, t, h, math.atan2(by - ay, bx - ax), dz)
    def tile_line(self, pts, w, zoff, col=ROOF_TILE, closed=False, ht=.002):
        """墙顶 / 廊顶的黛瓦带（窄三棱柱）。"""
        n = len(pts)
        for i in range(n if closed else n - 1):
            (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]; L = math.hypot(bx - ax, by - ay)
            if L < 1e-4: continue
            mx, my = (ax + bx) / 2, (ay + by) / 2; self.roof(mx, my, L, w, self.Z(mx, my) + zoff, ht, math.atan2(by - ay, bx - ax), col)
    def outline(self, s=1.0, n=64): return [(math.cos(a) * s * self.r(a), math.sin(a) * s * self.r(a)) for a in np.linspace(0, TAU, n, endpoint=False)]
    def outline_world(self, s=1.0, n=96): return [self.world(x, y) for x, y in self.outline(s, n)]
    def parterre(self, qx, qy, cw, ch, a, pat):
        """一格花坛：0 同心十字、1 圆点环 + 花心、2 X、3 卷草（broderie：两条镜像涡卷绿篱，碎砖底）。"""
        c, s = math.cos(a), math.sin(a); Q = lambda dx, dy: (qx + dx * c - dy * s, qy + dx * s + dy * c)
        self.box('beds' if pat == 3 else 'lawn_p', qx, qy, cw, ch, .0025, a)
        self.wall_line('hedge', [Q(-cw / 2, -ch / 2), Q(cw / 2, -ch / 2), Q(cw / 2, ch / 2), Q(-cw / 2, ch / 2)], .004, .006, closed=True)
        if pat == 0:
            for k in range(3): self.box('hedge', qx, qy, cw * (.8 - k * .25), .004, .006, a); self.box('hedge', qx, qy, .004, ch * (.8 - k * .25), .006, a)
        elif pat == 1:
            for k in range(12): t = k / 12 * TAU; self.box('hedge', *Q(math.cos(t) * cw * .32, math.sin(t) * ch * .32), .006, .006, .007, a)
            self.box('flowers', qx, qy, cw * .3, ch * .3, .003, a)
        elif pat == 2:
            for k in (-1, 1): self.box('hedge', qx, qy, math.hypot(cw, ch) * .85, .004, .006, a + k * math.atan2(ch, cw))
        else:
            for sg in (-1, 1):
                pts = [Q(sg * (cw * .12 + cw * .3 * (1 - t) * (.5 + .5 * math.cos(2.6 * math.pi * t))), ch * .38 * (1 - t) * math.sin(2.6 * math.pi * t) + ch * .05 * t) for t in np.linspace(0, 1, 16)]
                self.wall_line('hedge', pts, .004, .006)
        for dx in (-1, 1):
            for dy in (-1, 1): X, Y = self.world(*Q(dx * cw * .42, dy * ch * .42)); TREES.setdefault('topiary', []).append((X, Y, self.Z(qx, qy) + .006, .006)); self.crowns.append((.006, 'topiary'))
    def bosquet(self, cx, cy, bw, bh, a, sp=.085, kind='tree2'):
        """法式丛林块：方块内规则种树（边上一圈绿篱）。"""
        # B2 第 3 轮：去点阵——块尺寸 0.7–1.0 倍、树位抖动 ±35 % 间距、按块内噪声抽稀 10–30 %
        R = self.R; c, s = math.cos(a), math.sin(a); f = float(R.uniform(.7, 1.0)); bw, bh = bw * f, bh * f
        nx_, ny_ = max(1, int(bw / sp)), max(1, int(bh / sp)); n = 0; thin = float(R.uniform(.1, .3)); ph = float(R.uniform(0, TAU))
        for i in range(nx_):
            for j in range(ny_):
                if (math.sin(i * 1.7 + j * 2.3 + ph) * .5 + .5) * R.random() < thin * .6: continue
                dx, dy = (i - (nx_ - 1) / 2 + R.uniform(-.35, .35)) * sp, (j - (ny_ - 1) / 2 + R.uniform(-.35, .35)) * sp; px, py = cx + dx * c - dy * s, cy + dx * s + dy * c
                if self.inside(px, py, .9) and self.plant(px, py, float(R.uniform(.042, .06)), kind if R.random() < .85 else 'tree6', .92, .3): n += 1
        return n
    def make_dock(self, rad, toward=None, th0=None):
        """岸外停靠平台：一半伸出岸线的圆台 + 金环；航线端点取它的中心（在岛外）。"""
        if th0 is None:
            th0 = (math.atan2(toward[1] - self.y, toward[0] - self.x) - self.rot) if toward else float(self.R.uniform(0, TAU))
        pick = th0
        for dt in (0, .2, -.2, .4, -.4, .6, -.6, .9, -.9, 1.2, -1.2, 1.6, -1.6):
            th = th0 + dt; rr = self.r(th)
            if not any(self.in_bldg(math.cos(th) * rr * f, math.sin(th) * rr * f, .03) or self._in_polys(math.cos(th) * rr * f, math.sin(th) * rr * f) for f in (.72, .82, .92)):
                pick = th; break
        th = pick; rr = self.r(th); cx, cy = math.cos(th) * (rr + rad * .35), math.sin(th) * (rr + rad * .35)
        zs = self.Z(math.cos(th) * rr * .96, math.sin(th) * rr * .96); dz = zs - self.Z(cx, cy)
        self.dock_z = zs + .002                                                              # 平台顶面（放载具用）
        self.wl += 1
        self.cyl('pad', cx, cy, rad, .006, 40, dz=dz - .004); self.cyl('gold', cx, cy, rad * 1.04, .004, 40, dz=dz - .0065)
        self.box('pad', math.cos(th) * rr * .9, math.sin(th) * rr * .9, rr * .12 + rad * .2, .014, .004, th, dz=0)
        self.wl -= 1
        self.claim(cx, cy, rad + .02); self.claim(math.cos(th) * rr * .9, math.sin(th) * rr * .9, .04)
        self.dock = (cx, cy, rad, th); return cx, cy
    def _under_crown(self, px, py, m=.01):
        return any(TREES[k][i] is not None and math.hypot(px - x, py - y) < r + m for k, i, x, y, r, _ in self._tix)
    def anchor(self):
        """标记锚点（本地）。伊甸 = 停靠平台；其余 = 主楼旁的实地（B2 第 3 轮：不落在树冠、水面、建筑外包上，优先主楼南侧 6–30 m）。"""
        if self.id == 'eden' and self.dock: return self.dock[:2]
        mx, my = self.main; th0 = self.south()
        ok = lambda px, py: (self.inside(px, py, .85) and not self.in_bldg(px, py, .02) and not self._under_crown(px, py)
                             and not any(((px - a) / A) ** 2 + ((py - b) / Bb) ** 2 < 1.1 for a, b, A, Bb, _ in self.water))
        for d in (.06, .09, .12, .16, .2, .25, .3):
            for k in range(24):
                th = th0 + (k + 1) // 2 * .26 * (1 if k % 2 else -1); px, py = mx + math.cos(th) * d, my + math.sin(th) * d
                if ok(px, py): return px, py
        for k in range(48):
            th = th0 + (k + 1) // 2 * .13 * (1 if k % 2 else -1)
            for f in (.8, .74, .86, .68):
                px, py = math.cos(th) * self.r(th) * f, math.sin(th) * self.r(th) * f
                if not self.in_bldg(px, py, .03) and not any(((px - a) / A) ** 2 + ((py - b) / Bb) ** 2 < 1 for a, b, A, Bb, _ in self.water): return px, py
        return math.cos(th0) * self.r(th0) * .8, math.sin(th0) * self.r(th0) * .8

    # ---------------- 岛体 ----------------
    def build_body(self, col):
        R = self.R
        # 台地：不规则多边形（圆角方台 / 谐波台），挡土墙只砌朝岸一侧的开口弧（≤ 220°），另一侧顺坡
        if self.terrain == 'terrace':
            a = R.uniform(0, TAU); d = R.uniform(0, .2) * self.F; cx, cy = math.cos(a) * d, math.sin(a) * d
            self.plat = dict(c=(cx, cy), kind='rect' if (self.style == 'chateau' or R.random() < .4) else 'blob', rr=float(R.uniform(.34, .46)) * self.F,
                             ang=float(R.uniform(0, math.pi)), asp=float(R.uniform(.7, 1.0)), harm=[(k, float(R.uniform(.05, .12)), float(R.uniform(0, TAU))) for k in (2, 3)])
            for _ in range(14):
                if all(self.inside(cx + math.cos(t) * (self.plat_r(t) + .14 * max(self.F, .4)), cy + math.sin(t) * (self.plat_r(t) + .14 * max(self.F, .4)), .88) for t in np.linspace(0, TAU, 36)): break
                self.plat['rr'] *= .9
            self.spots.append(('plateau', cx, cy, self.plat['rr'], float(R.uniform(.018, .03))))
            phi0 = math.atan2(cy, cx) if d > .05 * self.F else float(R.uniform(0, TAU)); span = float(R.uniform(2.3, 3.5))
            self.terrace_spans.append(math.degrees(span))
            pts = [(cx + math.cos(t) * (self.plat_r(t) + .008), cy + math.sin(t) * (self.plat_r(t) + .008)) for t in np.linspace(phi0 - span / 2, phi0 + span / 2, 30)]
            self.wall_line('stone', pts[:14], .006, .014, dz=-.006); self.wall_line('stone', pts[16:], .006, .014, dz=-.006)   # 中间留台阶口
        if self.terrain == 'crag':
            for _ in range(int(R.integers(2, 5))):
                a = R.uniform(0, TAU); s = R.uniform(.6, .85); rr = R.uniform(.07, .13) * max(self.F, .4)
                self.spots.append(('bump', math.cos(a) * s * self.r(a), math.sin(a) * s * self.r(a), rr, R.uniform(.04, .09)))
        if self.terrain == 'lake':
            a = R.uniform(0, TAU); s = R.uniform(.35, .6) if self.style != 'suzhou' else R.uniform(.0, .15)
            cx, cy = math.cos(a) * s * self.r(a), math.sin(a) * s * self.r(a)
            A, Bb = R.uniform(.22, .32) * self.F, R.uniform(.13, .2) * self.F
            if self.style not in ('suzhou', 'lingnan'): self.spots.append(('dip', cx, cy, max(A, Bb) * 1.05, .012))   # 苏州：池由 est_suzhou 画在压平的园心，不下凹
            self.lake = (cx, cy, A, Bb, float(R.uniform(0, math.pi)))
            if self.style not in ('suzhou', 'lingnan'): self.water.append(self.lake)                # 岭南：lake 地形 = 园池放大 1.3 倍（est_lingnan）                           # 苏州：湖就是园池，由 est_suzhou 画
        # 岛面：极坐标网格（环 × 角），顶点高度 = 地形；坡陡处材质自动露岩
        NA = int(min(320, max(96, 110 * max(self.rx, self.ry)))); NR = int(min(40, max(10, 14 * max(self.rx, self.ry))))
        ths = np.linspace(0, TAU, NA, endpoint=False); rs = np.array([self.r(t) for t in ths])
        V = [(self.x, self.y, self.Z(0, 0))]; c, s_ = math.cos(self.rot), math.sin(self.rot)
        for j in range(1, NR + 1):
            f = j / NR
            for i, t in enumerate(ths):
                lx, ly = math.cos(t) * rs[i] * f, math.sin(t) * rs[i] * f
                V.append((self.x + lx * c - ly * s_, self.y + lx * s_ + ly * c, self.Z(lx, ly)))
        F = [(0, 1 + i, 1 + (i + 1) % NA) for i in range(NA)]
        for j in range(NR - 1):
            a0, a1 = 1 + j * NA, 1 + (j + 1) * NA
            F += [(a0 + i, a1 + i, a1 + (i + 1) % NA, a0 + (i + 1) % NA) for i in range(NA)]
        me = bpy.data.meshes.new('top_' + self.id); me.from_pydata(V, [], F); me.update()
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        top = bpy.data.objects.new('top_' + self.id, me); col.objects.link(top); me.materials.append(top_mat(self.d.get('biome') or self.style))
        # 岛底岩体：从岸线往下收成倒锥；第 1 层缩到 .86，抖动后也不超出岸线（不在影子反方向露边）
        depth = (self.rx + self.ry) * .85
        UV, UF = [], []
        levels = [(.0, 1.0), (.12, .86), (.35, .76), (.6, .52), (.82, .26), (.95, .08)]
        for k, (dz, sc) in enumerate(levels):
            for i, t in enumerate(ths):
                jit = 1 + .08 * math.sin(3 * t + k * 1.7 + seed_of(self.id) % 7) + .05 * math.sin(7 * t + k)
                lx, ly = math.cos(t) * rs[i] * sc * (jit if k else 1), math.sin(t) * rs[i] * sc * (jit if k else 1)
                UV.append((self.x + lx * c - ly * s_, self.y + lx * s_ + ly * c, self.z + (self.h(math.cos(t) * rs[i], math.sin(t) * rs[i]) if k == 0 else -dz * depth) - .004))
        for k in range(len(levels) - 1):
            UF += [(k * NA + i, k * NA + (i + 1) % NA, (k + 1) * NA + (i + 1) % NA, (k + 1) * NA + i) for i in range(NA)]
        UV.append((self.x, self.y, self.z - depth)); tip = len(UV) - 1; kk = (len(levels) - 1) * NA
        UF += [(kk + i, kk + (i + 1) % NA, tip) for i in range(NA)]
        mu = bpy.data.meshes.new('under_' + self.id); mu.from_pydata(UV, [], UF); mu.update()
        und = bpy.data.objects.new('under_' + self.id, mu); col.objects.link(und); mu.materials.append(mats()['rock_under']); und.visible_shadow = False
        # 湖面与瀑布（苏州的湖留给园池）
        for cx, cy, A, Bb, ang in self.water:
            zl = self.Z(cx, cy) + .004
            self.disc('water', cx, cy, A, Bb, ang, z=zl, dz=0, seg=48)
            for k in range(int(2 + 4 * self.F)): a = R.uniform(0, TAU); self.tree(cx + math.cos(a) * A * 1.25, cy + math.sin(a) * Bb * 1.3, float(R.uniform(.045, .06)), 'tree2')
            th = math.atan2(cy, cx); edge = self.r(th)
            if math.hypot(cx, cy) + max(A, Bb) > edge * .55:                                 # 湖靠岸：一道出水溪流流到岛缘（瀑布口，白名单）
                self.wl += 1; n = 10; p0 = (cx + math.cos(th) * A * .9, cy + math.sin(th) * Bb * .9)
                for k in range(n):
                    f = k / (n - 1); px = p0[0] + (math.cos(th) * edge * .99 - p0[0]) * f; py = p0[1] + (math.sin(th) * edge * .99 - p0[1]) * f
                    self.disc('water_l', px, py, .012 + .004 * f, .012 + .004 * f, dz=.003, seg=10)
                for k in range(-2, 3):                                                       # 瀑布口：沿岸线的细长水花弧片
                    t2 = th + k * .018; self.disc('foam', math.cos(t2) * self.r(t2) * .995, math.sin(t2) * self.r(t2) * .995, .012, .005, t2 + math.pi / 2, dz=.004, seg=10)
                X, Y = self.world(math.cos(th) * edge * 1.03, math.sin(th) * edge * 1.03); B('foam').box(X, Y, self.z - .5, .04, .04, .49, self.rot + th)   # 侧面看得到的一条白练
                self.wl -= 1
        # 裸岩（岩峰上的大石头）
        for kind, cx, cy, rr, hh in self.spots:
            if kind == 'bump':
                for _ in range(int(3 + rr * 60)):
                    a = R.uniform(0, TAU); d = R.uniform(0, rr * .9); X, Y = self.world(cx + math.cos(a) * d, cy + math.sin(a) * d)
                    B('boulder', True).ico(X, Y, self.Z(cx + math.cos(a) * d, cy + math.sin(a) * d), R.uniform(.006, .02), sz=.7)
                self.claim(cx, cy, rr); self._mark_circle(cx, cy, rr * .8)                    # 裸岩峰：不是草坪
        if self.style != 'neoclassical': self.build_rim()                                  # 伊甸的石栏在 build_eden 里

    def build_rim(self):
        """岛缘按角度分段混用；树、垂根、碎石都成团（泊松团），垂根有长有短。"""
        R = self.R; M = max(self.rx, self.ry); self.wl += 1
        for t0, t1, kind in self.rim_segs():
            frac = (t1 - t0) / TAU
            if kind == 'wall':                                                              # 石墙（带墩柱）
                pts = [(math.cos(a) * .975 * self.r(a), math.sin(a) * .975 * self.r(a)) for a in np.linspace(t0, t1, max(3, int(90 * M * frac)))]
                self.wall_line('stone', pts, .008, .012)
                for i in range(0, len(pts), 4): self.box('stone', pts[i][0], pts[i][1], .014, .014, .018)
            elif kind == 'hedge':                                                           # 林带：岸线内成团的大树；按角度分段约 60 % 有树（留视线缺口），带宽用噪声在 0.3–1.5 倍间变
                p1, p2, k1, k2 = float(R.uniform(0, TAU)), float(R.uniform(0, TAU)), int(R.integers(3, 6)), int(R.integers(7, 11))
                for a in np.linspace(t0, t1, max(2, int(34 * M * frac * TAU / 2)), endpoint=False):
                    g = math.sin(k1 * a + p1) + .6 * math.sin(k2 * a + p2)
                    if g < -.3: continue
                    bw = .3 + 1.2 * min(1.0, (g + .3) / 1.6)
                    for _ in range(max(1, int(round(R.integers(1, 4) * bw)))):
                        b = a + R.normal(0, .03); rt = float(R.uniform(.04, .07)) * (1.15 if self.style == 'lingnan' else 1); s = min(R.uniform(.93 - .09 * bw, .95), 1 - .8 * rt / self.r(b))
                        if s > .6: self.tree(math.cos(b) * s * self.r(b), math.sin(b) * s * self.r(b), rt, 'tree6' if R.random() < .4 else 'tree1')
            elif kind == 'roots':                                                           # 垂根：岸线外挂成团的深色藤根
                for a in np.linspace(t0, t1, max(2, int(45 * M * frac * TAU / 2)), endpoint=False):
                    for _ in range(int(R.integers(2, 7))):
                        b = a + R.normal(0, .025); rr = self.r(b); X, Y = self.world(math.cos(b) * rr * 1.01, math.sin(b) * rr * 1.01)
                        B('roots', True).ico(X, Y, self.z - .02, float(R.uniform(.007, .016)), sz=float(R.uniform(1.2, 3.8)))
                    if R.random() < .35: self.plant(math.cos(a) * self.r(a) * .88, math.sin(a) * self.r(a) * .88, float(R.uniform(.04, .05)), 'tree4', .97, .2)
            elif kind == 'cliff':                                                           # 崖边：外圈塌陷露岩 + 成团碎石
                for a in np.linspace(t0, t1, max(2, int(30 * M * frac * TAU / 2)), endpoint=False):
                    for _ in range(int(R.integers(1, 5))):
                        b = a + R.normal(0, .03); s = R.uniform(.93, .99); lx, ly = math.cos(b) * s * self.r(b), math.sin(b) * s * self.r(b)
                        X, Y = self.world(lx, ly); B('boulder', True).ico(X, Y, self.Z(lx, ly), R.uniform(.004, .012), sz=.7)
        self.wl -= 1

    # ---------------- 园林与建筑（按风格）----------------
    def build_estate(self):
        role = self.d.get('role')
        if role:                                                                            # 有名有主的府邸：专门的主楼 + 按风格的完整园子
            lx, ly, a, L, g0 = getattr(self, 'role_' + role)(); self.main = (lx, ly)
            getattr(self, 'garden_' + self.style)(lx, ly, a, L, g0)
        else: getattr(self, 'est_' + self.style)()
        if self.dock is None: self.small_dock()
        self.fill_trees()

    def small_dock(self):
        """普通岛的小码头（B2 第 3 轮）：岸边一座伸出岸线的石埠 / 台阶码头（约 .05·F 宽），一条小路通到主楼或园门（碰到园墙、建筑就停）。
        苏州 = 临水石埠（白石）、岭南 = 村口埠头（麻石）、英式 / 法式 = 台阶码头（石 + 三道台阶线）。朝伊甸方向优先。"""
        th0 = (math.atan2(HUB[1] - self.y, HUB[0] - self.x) - self.rot) if HUB else self.south()
        pick = None
        for dt in (0, .25, -.25, .5, -.5, .8, -.8, 1.1, -1.1, 1.5, -1.5, 2.0, -2.0, 2.6, -2.6, 3.1):
            th = th0 + dt; rr = self.r(th)
            if all(not self.in_bldg(math.cos(th) * rr * f, math.sin(th) * rr * f, .02) and not self._in_polys(math.cos(th) * rr * f, math.sin(th) * rr * f)
                   and not any(((math.cos(th) * rr * f - a) / A) ** 2 + ((math.sin(th) * rr * f - b) / Bb) ** 2 < 1 for a, b, A, Bb, _ in self.water) for f in (.8, .9, .97)):
                pick = th; break
        if pick is None: return
        th = pick; rr = self.r(th); F = max(self.F, .25); w, L = .03 + .02 * F, .035 + .03 * F
        key = {'suzhou': 'marble', 'lingnan': 'ln_pave'}.get(self.style, 'stone')
        cx, cy = math.cos(th) * (rr + L * .25), math.sin(th) * (rr + L * .25); ang = th
        zs = self.Z(math.cos(th) * rr * .95, math.sin(th) * rr * .95)
        self.wl += 1
        self.box(key, cx, cy, L, w, .008, ang, dz=zs - self.Z(cx, cy) - .004)
        if self.style in ('english', 'chateau'):
            for k in range(3): self.box('dark', cx + math.cos(ang) * (L * .5 - .004 - k * .007), cy + math.sin(ang) * (L * .5 - .004 - k * .007), .0015, w * .9, .001, ang, dz=zs - self.Z(cx, cy) + .004)
        for k in (-1, 1): self.cyl('dark', cx + math.cos(ang) * L * .45 - math.sin(ang) * w * .45 * k, cy + math.sin(ang) * L * .45 + math.cos(ang) * w * .45 * k, .003, .014, 6, dz=zs - self.Z(cx, cy))   # 系缆桩
        self.wl -= 1
        self.claim(cx, cy, max(w, L) * .6)
        pts = []; mx, my = self.main
        x0, y0 = math.cos(th) * rr * .84, math.sin(th) * rr * .84
        for t in np.linspace(0, 1, 24):
            px, py = x0 + (mx - x0) * t, y0 + (my - y0) * t
            if t > 0 and (not self.inside(px, py, .78) or self.in_bldg(px, py, .01) or self._in_polys(px, py) or any(((px - a) / A) ** 2 + ((py - b) / Bb) ** 2 < 1 for a, b, A, Bb, _ in self.water)): break
            pts.append((px, py))
        if len(pts) > 2:
            self.wall_line('path' if self.style != 'lingnan' else 'ln_pave', pts, .01, .0018)
            for q in pts[1::2]: self.claim(q[0], q[1], .012)
        self.dock_small = (cx, cy, max(w, L), th)

    def _frame(self, rr, front=None):
        """地标主楼的位置与朝向（不再整圈占地：各部件自己 claim）。front：正面（-v）朝向本地角度。"""
        lx, ly = self.main_spot(rr)
        if front is None:
            best = max(((self.reach(lx, ly, k * math.pi / 2 - math.pi / 2, .85) + self.R.uniform(0, .05), k * math.pi / 2) for k in range(4)))
            a = best[1] + self.R.uniform(-.1, .1)
        else: a = front + math.pi / 2
        c, s = math.cos(a), math.sin(a)
        return lx, ly, a, (lambda dx, dy: (lx + dx * c - dy * s, ly + dx * s + dy * c))
    def _fits(self, parts, s=.9):
        return all(self.inside(x, y, s) for cx, cy, w, d, a in parts for x, y in rect_pts(cx, cy, w, d, a) + [(cx, cy)])

    # 首相府：对称官邸（中央楼 + 两翼围出荣誉庭院）+ 旗帜广场 + 岗亭；岸外公务停靠平台
    def role_pm_residence(self):
        F = max(self.F, .5); L = .85 * F
        for k in range(8):                                                                  # 旗帜广场 inside(.9) 校验：不过就转向或缩 15 %
            lx, ly, a, P = self._frame(L * .5)
            parts = [(*P(0, 0), L, L * .22, a), (*P(0, -L * .42), L * .72, L * .36, a), (*P(0, -L * .8), L * .8, L * .3, a)]
            if self._fits(parts): break
            if k % 2: L *= .85
            else: self.R.random()
        self.house('marble', *P(0, 0), L, L * .22, .06, a, ROOF_SLATE, ridge=L * .07)
        self.house('marble', *P(0, -L * .12), L * .22, L * .16, .075, a, ROOF_SLATE, ridge=L * .09)          # 中央凸出楼
        for sx in (-1, 1): self.house('marble', *P(sx * L * .45, -L * .28), L * .14, L * .42, .05, a, ROOF_SLATE, ridge=L * .05)
        self.box('gravel', *P(0, -L * .42), L * .72, L * .36, .002, a); self.claim_rect(*P(0, -L * .42), L * .72, L * .36, a)   # 荣誉庭院
        self.box('stone', *P(0, -L * .8), L * .8, L * .3, .003, a); self.claim_rect(*P(0, -L * .8), L * .8, L * .3, a)          # 旗帜广场
        for k in range(5):
            qx, qy = P((k - 2) * L * .15, -L * .9); self.cyl('pad', qx, qy, .002, .05, 6); self.box('gold', qx + .006, qy, .012, .002, .008, a, dz=.04)
        for sx in (-1, 1): self.house('stone', *P(sx * L * .42, -L * .98), .025, .025, .02, a, ROOF_SLATE, ridge=.008)   # 岗亭
        self.make_dock(.08 * F, HUB)
        return lx, ly, a, L, L * .2

    # 将军官邸：堡垒化别墅（五边形尖角棱堡）+ 阅兵场 + 装甲机库 + 瞭望塔
    def role_general_residence(self):
        F = max(self.F, .5); L = .55 * F; lx, ly, a, P = self._frame(L * .8)
        self.house('stone', *P(0, 0), L, L * .6, .05, a, (.22, .24, .22), ridge=L * .1)
        pts = [P(dx * L * .85, dy * L * .6) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        self.wall_line('stone', pts, .012, .02, closed=True); self.claim_poly([P(dx * L * .95, dy * L * .7) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        for (qx, qy), (dx, dy) in zip(pts, ((-1, -1), (1, -1), (1, 1), (-1, 1))):             # 棱堡：箭头形五边形
            t = math.atan2(qy - ly, qx - lx); b = .045
            pent = [(qx, qy), (qx + math.cos(t - 1.2) * b * .7, qy + math.sin(t - 1.2) * b * .7), (qx + math.cos(t) * b * 1.3, qy + math.sin(t) * b * 1.3),
                    (qx + math.cos(t + 1.2) * b * .7, qy + math.sin(t + 1.2) * b * .7)]
            self.wall_line('stone', pent, .01, .025, closed=True); self.patch('stone', pent, dz=.02, rings=1)
        g = self.spot(.2 * F, smax=.72)
        if g:
            self.box('gravel', g[0], g[1], .3 * F, .2 * F, .002, a); self.claim_rect(g[0], g[1], .3 * F, .2 * F, a)        # 阅兵场 + 地面标线
            for k in range(-2, 3): self.box('path', g[0], g[1] + k * .035 * F, .26 * F, .003, .0025, a)
        h = self.spot(.1 * F, smax=.75)
        if h:
            self.house('dark', h[0], h[1], .14 * F, .08 * F, .03, a, (.2, .22, .2), ridge=.02)
            for k in range(3): X, Y = self.world(h[0] + (k - 1) * .04 * F, h[1] - .07 * F); B('car', True).ico(X, Y, self.Z(*h) + .01, .014 * F, sz=.8)   # 魔导装甲
        t = self.spot(.03, smax=.85)
        if t: self.cyl('stone', t[0], t[1], .018, .12, 8); self.cyl('dark', t[0], t[1], .026, .02, 8, dz=.12); self.claim(t[0], t[1], .03)
        return lx, ly, a, L, L * .75

    # 财团家族庄园（罗斯柴尔德庄园 R-02）：玻璃塔楼别墅 + 叠落白色平台 + 无边泳池（宽 8 m）+ 岸外私人悬浮载具停靠平台
    def role_zaibatsu_estate(self):
        F = max(self.F, .5); L = .6 * F; lx, ly, a, P = self._frame(L * .6)
        for k in range(6):
            parts = [(*P(L * (.15 + .12 * j), -L * .05 * j), L * .5, L * .3, a) for j in range(3)] + [(*P(L * .55, -L * .3), L * .8, .08, a)]
            if self._fits(parts, .88): break
            L *= .88
        self.box('glass', *P(0, 0), L * .22, L * .22, .32, a); self.box('pad', *P(0, 0), L * .24, L * .24, .006, a, dz=.32); self.claim_rect(*P(0, 0), L * .24, L * .24, a)   # 塔楼
        self.box('glass', *P(0, 0), L * .18, L * .18, .002, a, dz=.326)                                  # 顶面深色玻璃带
        for k in range(3): self.box('whitewall', *P(L * (.15 + .12 * k), -L * .05 * k), L * .5, L * .3, .02, a, dz=k * .02); self.claim_rect(*P(L * (.15 + .12 * k), -L * .05 * k), L * .5, L * .3, a)
        self.box('water_l', *P(L * .55, -L * .3), L * .8, .08, .004, a); self.claim_rect(*P(L * .55, -L * .3), L * .8, .08, a)   # 无边泳池
        cx, cy = self.make_dock(.09 * F, HUB)
        self.wl += 1
        for k in range(12): t = k / 12 * TAU; self.cyl('gold', cx + math.cos(t) * .08 * F, cy + math.sin(t) * .08 * F, .004, .008, 6)
        self.wl -= 1
        for k in (-1, 1): self.hover(cx + k * .03 * F, cy, self.dock_z, .06, .6)                     # 两台悬浮载具停在平台上
        for _ in range(6):                                                                            # 雕塑庭院
            q = self.spot(.02, near=(lx, ly, L * 1.2))
            if q: self.cyl('marble', q[0], q[1], .006, .02, 8); self.claim(q[0], q[1], .015)
        return lx, ly, a, L, L * .25

    # 大主教府邸：十字形礼拜堂（中殿 + 横厅 + 交叉处穹顶 + 钟楼）+ 贴中殿南侧的回廊庭院（以太一轨）
    def role_archbishop_palace(self):
        F = max(self.F, .5); L = .7 * F; lx, ly, a, P = self._frame(L * .5)
        self.house('marble', *P(0, 0), L, L * .22, .06, a, ROOF_SLATE, ridge=L * .1)                       # 中殿
        self.house('marble', *P(L * .15, 0), L * .22, L * .6, .055, a, ROOF_SLATE, ridge=L * .1)          # 横厅
        X, Y = self.world(*P(L * .15, 0)); z0 = self.Z(*P(L * .15, 0))
        B('marble').cyl(X, Y, z0, L * .1, .085, 24); B('gold', True).ico(X, Y, z0 + .085, L * .095, sz=.8, sub=3)   # 穹顶（金）
        self.cyl('marble', *P(-L * .55, L * .1), .02, .13, 8); self.cyl('dark', *P(-L * .55, L * .1), .026, .03, 8, dz=.13, r2=.002)   # 钟楼
        w = L * .45; cx, cy = P(-L * .2, -L * .11 - w / 2)
        pts = [P(-L * .2 + dx * w / 2, -L * .11 - w / 2 + dy * w / 2) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        self.wall_line('whitewall', pts, .012, .012, closed=True); self.box('lawn', cx, cy, w * .8, w * .8, .0025, a)
        self.cyl('marble', cx, cy, .015, .01, 16); self.disc('water_l', cx, cy, .011, .011, dz=.01, seg=16)
        self.claim_rect(cx, cy, w, w, a)
        return lx, ly, a, L, L * .35

    # 庄园主联盟会所：宴会厅（玻璃顶长厅）+ 环形车道与喷泉 + 花架露台 + 岸外停靠平台（品鉴宴在此）
    def role_league_club(self):
        F = max(self.F, .5); L = .7 * F; lx, ly, a, P = self._frame(L * .5)
        self.house('marble', *P(0, 0), L, L * .3, .05, a, ROOF_MANSARD, ridge=L * .06)
        self.box('glass', *P(0, 0), L * .6, L * .12, .012, a, dz=.05)
        c = P(0, -L * .55); self.disc('gravel', c[0], c[1], L * .32, L * .32, dz=.002, seg=48); self.disc('lawn', c[0], c[1], L * .2, L * .2, dz=.0025, seg=48)
        self.cyl('marble', c[0], c[1], .03, .008, 24); self.disc('water_l', c[0], c[1], .025, .025, dz=.008, seg=24); self.claim(c[0], c[1], L * .33)
        for k in range(6): q = P((k - 2.5) * L * .16, L * .3); self.box('path', q[0], q[1], .01, L * .2, .012, a)   # 花架
        self.claim_rect(*P(0, L * .3), L, L * .22, a)
        self.make_dock(.07 * F, HUB)
        return lx, ly, a, L, L * .45

    # 以太研究院：中央尖塔 + 发光以太晶簇 + 环形法阵广场 + 放射状实验楼 + 三座晶柱
    def role_aether_institute(self):
        F = max(self.F, .5); L = .45 * F; lx, ly, a, P = self._frame(L * 1.1)
        for k in range(4): self.disc('stone' if k % 2 else 'gravel', lx, ly, L * (1 - k * .2), L * (1 - k * .2), dz=.002 + k * .0004, seg=64)   # 法阵同心环
        self.claim(lx, ly, L)
        self.cyl('marble', lx, ly, .03, .2, 12, r2=.008)                                            # 尖塔
        for k in range(7):
            t = k / 7 * TAU; X, Y = self.world(lx + math.cos(t) * .025, ly + math.sin(t) * .025)
            B('aether', True).ico(X, Y, self.Z(lx, ly) + .2 + (k % 3) * .01, .012, sz=2.5, sub=1)
        for k in range(5):
            t = a + k / 5 * TAU; q = (lx + math.cos(t) * L * 1.25, ly + math.sin(t) * L * 1.25)
            if self._fits([(q[0], q[1], L * .35, L * .14, t)], .88): self.house('marble', q[0], q[1], L * .35, L * .14, .03, t, (.25, .27, .3), ridge=.01)
        for k in range(3):
            t = a + .5 + k / 3 * TAU; q = (lx + math.cos(t) * L * .7, ly + math.sin(t) * L * .7)
            X, Y = self.world(*q); B('aether', True).ico(X, Y, self.Z(*q) + .03, .01, sz=3.0, sub=1); self.cyl('stone', q[0], q[1], .012, .01, 6)
        return lx, ly, a, L, L * 1.45

    def main_spot(self, rr):
        """主楼位置：台地中心，或岛心附近的随机点（不都放正中）。"""
        if self.plat: return self.plat['c']
        p = self.spot(rr, smax=.45) or (0.0, 0.0); return p

    def outbuildings(self, n, key, col):
        """附属建筑：温室、马厩 / 机库、仆役楼、亭；数量与种类随岛。"""
        R = self.R; F = self.F
        kinds = ['glass', 'stable', 'staff', 'gazebo', 'hangar']
        for _ in range(n):
            k = kinds[int(R.integers(len(kinds)))]; rr = {'glass': .07, 'stable': .09, 'staff': .06, 'gazebo': .03, 'hangar': .09}[k] * max(F, .5)
            p = self.spot(rr, smax=.72)
            if not p: continue
            lx, ly = p; a = R.uniform(0, math.pi)
            if not self._fits([(lx, ly, rr * 1.9, rr * 1.9, a)], .9): continue          # 整栋附属建筑都要在岛内（inside .92 自检）
            self.claim(lx, ly, rr)
            if k == 'glass':                                                                 # 温室：白框玻璃长屋
                self.box('glass', lx, ly, rr * 1.6, rr * .6, .012, a); self.box('whitewall', lx, ly, rr * 1.65, .004, .014, a)
            elif k == 'stable':                                                              # 马厩院：四面围合 + 中间院子
                w = rr * 1.4
                self.box('gravel', lx, ly, w * .7, w * .7, .002, a)
                for dx, dy, ww, dd in ((0, -w / 2, w, w * .22), (0, w / 2, w, w * .22), (-w / 2, 0, w * .22, w), (w / 2, 0, w * .22, w)):
                    c_, s_ = math.cos(a), math.sin(a); self.house(key, lx + dx * c_ - dy * s_, ly + dx * s_ + dy * c_, ww, dd, .018, a, col, ridge=min(ww, dd) * .35)
            elif k == 'staff': self.house(key, lx, ly, rr * 1.5, rr * .6, .022, a, col)
            elif k == 'gazebo': self.cyl('marble', lx, ly, rr * .6, .012, 12); self.cyl('dark', lx, ly, rr * .75, .01, 12, dz=.012, r2=.002)
            else:                                                                            # 悬浮载具库 + 停靠坪
                self.box('pad', lx, ly, rr * 1.8, rr * 1.2, .003, a); self.house('stone', lx + math.cos(a) * rr * .4, ly + math.sin(a) * rr * .4, rr * .9, rr * .7, .02, a, (.3, .31, .33), ridge=rr * .15)
                X, Y = self.world(lx - math.cos(a) * rr * .5, ly - math.sin(a) * rr * .5)
                B('car', True).ico(X, Y, self.Z(lx, ly) + .01, rr * .25, sz=.45)

    def fill_trees(self):
        """其余空地按风格补树，树冠按真实尺度（半径 .045–.09 = 冠幅 9–18 m），密度约为旧版 1/5：
        英式 = 外圈林带偏置 + 3–6 个大树团 + 少量孤植；法式只在岛缘林带（园内是方块丛林）；苏州 / 岭南只在园外；伊甸另排。"""
        R = self.R; st = self.style
        if st == 'neoclassical': return
        dens = {'english': 95, 'chateau': 30, 'suzhou': 40, 'lingnan': 110, 'fortress': 8}[st]   # 每平方单位（1 万 m²）的树数
        n = int(dens * math.pi * self.rx * self.ry)
        kinds = {'english': ('tree1', 'tree1', 'tree2', 'tree6'), 'chateau': ('tree2', 'tree2', 'tree6'), 'suzhou': ('tree3', 'tree3', 'tree2', 'tree6'),
                 'lingnan': ('tree1', 'tree2', 'tree1', 'tree4', 'tree3'), 'fortress': ('tree6',)}[st]   # 岭南：荔枝、龙眼成团，少量榕树、竹
        sig = .05 * min(1.0, max(self.F, .4) / .6)
        if st == 'english':                                                                 # 布朗式：3–6 个大树团
            for _ in range(int(R.integers(3, 7))):
                p = self.spot(.05, smax=.78)
                if not p: continue
                for _ in range(int(R.integers(15, 26)) if self.F > .45 else int(R.integers(5, 10))):
                    self.plant(p[0] + R.normal(0, sig * 1.4), p[1] + R.normal(0, sig * 1.4), float(R.uniform(.05, .09)), kinds[int(R.integers(len(kinds)))])
        if st == 'chateau' and getattr(self, 'axis', None):                                  # 法式：沿中轴对齐的规则种植，每 4 行 / 列留一条笔直园路 → 方块丛林
            lx0, ly0, a0 = self.axis; c, s = math.cos(a0), math.sin(a0); sp = .08; m = int(1.3 * max(self.rx, self.ry) / sp) + 2
            for i in range(-m, m + 1):
                for j in range(-m, m + 1):
                    if i % 4 == 3 or j % 4 == 3: continue
                    dx, dy = i * sp, j * sp; px, py = lx0 + dx * c - dy * s, ly0 + dx * s + dy * c
                    if not self.inside(px, py, .9): continue
                    if not self.plant(px, py, float(R.uniform(.045, .052)), 'tree2' if (i // 4 + j // 4) % 3 else 'tree6', .93, .45) and all(self.inside(qx, qy, .9) for qx, qy in rect_pts(px, py, sp * .9, sp * .9, a0)) and self.free(px, py, .02, .92):
                        self.box('hedge', px, py, sp * .9, sp * .9, .012, a0); self.claim(px, py, .03)   # 放不下大树处：修剪的鹅耳枥方块（palissade）
        k = 0
        while k < n:
            a = R.uniform(0, TAU)
            if st == 'chateau' and self.F < .35:                                             # 小法式岛：不撒外圈树团（不再是甜甜圈树环），改成沿岸一圈等距修剪树的环园林荫道，中轴两端留视线缺口
                a0 = getattr(self, 'axis', (0, 0, 0.0))[2] + math.pi / 2
                for t in np.arange(0, TAU, .07 / max(self.F * .8, .1)):
                    if min(abs(math.remainder(t - a0, TAU)), abs(math.remainder(t - a0 - math.pi, TAU))) < .35: continue
                    self.plant(math.cos(t) * self.r(t) * .8, math.sin(t) * self.r(t) * .8, .04, 'tree2', .9, .3)
                break
            if st == 'chateau': d = R.uniform(.87, .95)
            elif st == 'english' and R.random() < .6: d = .75 + .2 * R.random()
            else: d = math.sqrt(R.random()) * .93
            lx, ly = math.cos(a) * d * self.r(a), math.sin(a) * d * self.r(a)
            m = int(R.integers(3, 8)) if st in ('english', 'lingnan', 'chateau') else int(R.integers(1, 4))
            for _ in range(m):
                r = float(R.uniform(.045, .09)) * (1.4 if st == 'lingnan' and R.random() < .3 else 1)
                self.plant(lx + R.normal(0, sig), ly + R.normal(0, sig), r, kinds[int(R.integers(len(kinds)))], .97, 1.0 if st == 'suzhou' else .6, pull=True)
            k += m

    # ================= 英国乡村庄园 =================
    def est_english(self):
        lx, ly, a, L = self.main_english(); self.main = (lx, ly); self.garden_english(lx, ly, a, L)
    def main_english(self):
        """蜂蜜色石头主楼（L / H / E / 回字平面，石板瓦坡顶）；正面（-v）朝向岛上最开阔的一侧（隔着草坡看湖）。"""
        R = self.R; F = max(self.F, .3); col = ROOF_SLATE
        L = min(.75, .55 * F); lx, ly = self.main_spot(L * .7)
        plan = self.plan if self.plan in ('L', 'H', 'E', 'court') else ['L', 'H', 'E', 'court'][int(R.integers(4))]
        heads = sorted(((self.reach(lx, ly, k * math.pi / 4 - math.pi / 2, .85) + R.uniform(0, .04), k * math.pi / 4) for k in range(8)), reverse=True)
        jit = R.uniform(-.12, .12)
        for tr in range(24):                                                                 # 所有部件都要在 inside(.9) 里：换朝向，不行就缩
            a = heads[tr % 8][1] + jit; D_ = L * .28; c, s = math.cos(a), math.sin(a); P = lambda dx, dy: (lx + dx * c - dy * s, ly + dx * s + dy * c)
            parts = [(lx, ly, L, D_, a), (*P(-(L / 2 - D_ / 2), D_ * .9), D_ * 1.6, D_, a), (*P(L / 2 - D_ / 2, D_ * .9), D_ * 1.6, D_, a)]
            if plan == 'court': parts += [(*P(0, D_ * 1.8), L, D_, a), (*P(-(L / 2 - D_ / 2), D_ * .9), D_ * 2.6, D_, a), (*P(L / 2 - D_ / 2, D_ * .9), D_ * 2.6, D_, a)]
            if plan == 'E': parts.append((*P(0, -D_ * .8), D_ * .8, D_ * .9, a))
            if self._fits(parts, .9): break
            if tr % 8 == 7: L *= .85
        self.house('stone_warm', lx, ly, L, D_, .045, a, col)
        if plan in ('L', 'E', 'H'):
            for sx in ((1,) if plan == 'L' else (-1, 1)): self.house('stone_warm', *P(sx * (L / 2 - D_ / 2), D_ * .9), D_, D_ * 1.6, .04, a + math.pi / 2, col)
        if plan == 'E': self.house('stone_warm', *P(0, -D_ * .8), D_ * .9, D_ * .8, .05, a + math.pi / 2, col)
        if plan == 'court':
            self.house('stone_warm', *P(0, D_ * 1.8), L, D_, .04, a, col)
            for sx in (-1, 1): self.house('stone_warm', *P(sx * (L / 2 - D_ / 2), D_ * .9), D_ * .9, D_ * 2.6, .04, a + math.pi / 2, col)
        self.claim(lx, ly, L * .35)
        return lx, ly, a, L
    def garden_english(self, lx, ly, a, L, g0=None):
        """回车圆 + 车道、连续蛇形湖（主楼正前方）、神庙、隐垣；按布局族加菜园 / 眺望塔 / 林荫道 / 果园 / 船屋 / 鹿苑。
        g0 不为空（地标岛）：正面归地标的广场，湖放到园林一侧（+v）。"""
        R = self.R; F = max(self.F, .3); fam = self.layout or 'kitchen'
        c, s = math.cos(a), math.sin(a); P = lambda dx, dy: (lx + dx * c - dy * s, ly + dx * s + dy * c)
        gdir = a - math.pi / 2 if g0 is None else a + math.pi / 2                          # 湖的方向
        D_ = L * .28
        if g0 is None:                                                                      # 回车圆 + 从岛缘绕进来的车道
            sw = P(0, -D_ * .5 - .035 * F - .02); rs = .03 * F + .015
            if all(self.inside(x, y, .9) for x, y in te_ell(sw, rs)):
                self.disc('gravel', sw[0], sw[1], rs, rs, dz=.002, seg=32); self.disc('lawn', sw[0], sw[1], rs * .5, rs * .5, dz=.0024, seg=24); self.claim(sw[0], sw[1], rs + .01)
                th0 = gdir + R.choice([-1, 1]) * R.uniform(.9, 1.4); e0 = (math.cos(th0) * self.r(th0) * .84, math.sin(th0) * self.r(th0) * .84)
                ctrl = ((e0[0] + sw[0]) / 2 + math.cos(gdir) * .15 * F, (e0[1] + sw[1]) / 2 + math.sin(gdir) * .15 * F)
                pts = [((1 - t) ** 2 * e0[0] + 2 * (1 - t) * t * ctrl[0] + t * t * sw[0], (1 - t) ** 2 * e0[1] + 2 * (1 - t) * t * ctrl[1] + t * t * sw[1]) for t in np.linspace(0, 1, 14)]
                pts = [p for p in pts if self.inside(*p, .82) and self.inside(*p, 1 - (.012 * F + .02) / max(.05, self.r(math.atan2(p[1], p[0]))))]
                if len(pts) > 2: self.wall_line('gravel', pts, .01 * F + .006, .002); [self.claim(p[0], p[1], .012) for p in pts[::2]]
        # 连续蛇形湖（不是几块水洼）：沿正弦曲线的一条带状水面，一头收成小溪
        lake = None
        if not self.water and F > .28:
            d0 = L * .4 + .08 * F + (g0 or 0); Rg = self.reach(lx, ly, gdir, .8)
            if Rg - d0 > .1 * F:
                dc = d0 + (Rg - d0) * .45; cx, cy = lx + math.cos(gdir) * dc, ly + math.sin(gdir) * dc; pd = gdir + math.pi / 2
                half = min(self.reach(cx, cy, pd, .84), self.reach(cx, cy, pd + math.pi, .84)) * .9; wmax = min(.07 * F + .02, (Rg - d0) * .32)
                for _ in range(7):
                    if half < .12 * F: break
                    ph = R.uniform(0, TAU); us = np.linspace(-half, half, 22); side = []
                    for u in us:
                        off = wmax * .9 * math.sin(2 * math.pi * u / (half * 1.3) + ph); w = wmax * (.3 + .7 * smooth(-half, -.2 * half, u)) * (1 - .25 * smooth(.6 * half, half, u))
                        side.append((u, off, w))
                    pl = [(cx + math.cos(pd) * u + math.cos(gdir) * (o + w / 2), cy + math.sin(pd) * u + math.sin(gdir) * (o + w / 2)) for u, o, w in side]
                    pr = [(cx + math.cos(pd) * u + math.cos(gdir) * (o - w / 2), cy + math.sin(pd) * u + math.sin(gdir) * (o - w / 2)) for u, o, w in side]
                    poly = pl + pr[::-1]
                    if all(self.inside(x, y, .86) and not self._in_polys(x, y) and not self.in_bldg(x, y, .02) for x, y in poly): lake = poly; break
                    half *= .85
            if lake:
                cen = [((a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2) for a_, b_ in zip(pl, pr)]
                for i in range(len(cen) - 1):                                                # 带状面：逐段四边形（不必星形）
                    self.patch('water', [pl[i], pl[i + 1], pr[i + 1], pr[i]], dz=.003, rings=1)
                self.claim_poly(lake); self.lake_poly = lake
                end = pl[-1]; tp = (end[0] + math.cos(gdir) * .03, end[1] + math.sin(gdir) * .03)       # 湖端的圆形 tholos：8 柱 + 穹顶
                if self.inside(*tp, .84) and self.free(tp[0], tp[1], .02, .9):
                    rt = .012 + .008 * F; self.cyl('stone_warm', tp[0], tp[1], rt * 1.3, .004, 16)
                    for k in range(8): t = k / 8 * TAU; self.cyl('marble', tp[0] + math.cos(t) * rt, tp[1] + math.sin(t) * rt, .0025, .014, 6, dz=.004)
                    self.cyl('roof_lead', tp[0], tp[1], rt * 1.15, .008, 16, dz=.018, r2=rt * .3); self.claim(tp[0], tp[1], rt * 1.6)
        # 隐垣（ha-ha）：主楼与草场之间一道弧形下沉墙线 + 阴影线
        if fam in ('folly', 'deerpark', 'avenue') or R.random() < .4:
            rh = L * .55 + .05 * F; hd = gdir + math.pi if lake else gdir
            pts = [(lx + math.cos(t) * rh, ly + math.sin(t) * rh) for t in np.linspace(hd - 1.0, hd + 1.0, 14)]
            pts = [p for p in pts if self.inside(*p, .86) and not self._in_polys(*p) and not self.in_bldg(*p, .02)]
            if len(pts) > 4:
                self.wall_line('stone', pts, .005, .004, dz=-.004)
                self.wall_line('dark', [(x + math.cos(math.atan2(y - ly, x - lx)) * .005, y + math.sin(math.atan2(y - ly, x - lx)) * .005) for x, y in pts], .004, .0015)
        if fam == 'boathouse' and not lake: fam = 'kitchen'
        if fam == 'kitchen' and F > .28:                                                     # 围墙菜园：方 / D 形 / 圆，红砖墙 + 菜畦 + 靠北墙的温室
            w = R.uniform(.18, .26) * F; p = self.spot(w * .8, smax=.7)
            if p:
                shp = ('square', 'D', 'round')[int(R.integers(3))]; ga = a + R.choice([0, math.pi / 2]); cg, sg = math.cos(ga), math.sin(ga)
                Q = lambda dx, dy: (p[0] + dx * cg - dy * sg, p[1] + dx * sg + dy * cg)
                if shp == 'square': wp = [Q(-w / 2, -w / 2), Q(w / 2, -w / 2), Q(w / 2, w / 2), Q(-w / 2, w / 2)]
                elif shp == 'round': wp = [Q(math.cos(t) * w / 2, math.sin(t) * w / 2) for t in np.linspace(0, TAU, 20, endpoint=False)]
                else: wp = [Q(-w / 2, w / 2), Q(-w / 2, -w / 6)] + [Q(math.cos(t) * w / 2, -w / 6 + math.sin(t) * w / 2 * .9) for t in np.linspace(math.pi, TAU, 10)] + [Q(w / 2, w / 2)]
                self.wall_line('brick', wp, .004, .008, closed=True); self.claim_poly(wp)
                n = 4
                for i in range(n):
                    for j in range(n):
                        q = Q((i - 1.5) * w / n * .92, (j - 1.5) * w / n * .92)
                        if pip(q[0], q[1], wp): self.box('beds' if (i + j) % 2 else 'lawn2', *q, w / n * .8, w / n * .8, .002, ga)
                self.box('glass', *Q(0, w / 2 - .012), w * .7, .014, .01, ga)
        elif fam == 'folly':                                                                 # 眺望塔（folly）：远端小丘上的塔 + 割出来的草径
            p = self.spot(.03, smax=.74)
            if p:
                self.cyl('stone_warm', p[0], p[1], .014 + .006 * F, .06, 8); self.cyl('dark', p[0], p[1], .02 + .006 * F, .02, 8, dz=.06, r2=.003); self.claim(p[0], p[1], .04)
                self.wall_line('lawn', [(lx + (p[0] - lx) * t + .03 * math.sin(t * 5), ly + (p[1] - ly) * t) for t in np.linspace(.3, .95, 10)], .008, .0015)
        elif fam == 'avenue':                                                                # 林荫大道：从主楼背面笔直到岸
            ad = a + math.pi / 2 if g0 is None else a - math.pi / 2; Ln = self.reach(lx, ly, ad, .9)
            for d in np.arange(L * .45, Ln, .09):
                for off in (-.06, .06):
                    px, py = lx + math.cos(ad) * d - math.sin(ad) * off, ly + math.sin(ad) * d + math.cos(ad) * off
                    self.plant(px, py, .045, 'tree2', .92, .3)
        elif fam == 'orchard':                                                               # 果园：梅花形网格
            p = self.spot(.15 * F, smax=.7)
            if p:
                b_ = R.uniform(0, math.pi)
                for i in range(-3, 4):
                    for j in range(-2, 3):
                        dx, dy = i * .085 + (.042 if j % 2 else 0), j * .075; px, py = p[0] + dx * math.cos(b_) - dy * math.sin(b_), p[1] + dx * math.sin(b_) + dy * math.cos(b_)
                        if self.inside(px, py, .88): self.plant(px, py, .04, 'tree5' if (i + j) % 3 == 0 else 'tree2', .9, .3)
        elif fam == 'boathouse':                                                             # 船屋 + 栈桥（湖头）
            for q in (lake[len(lake) // 2], lake[len(lake) // 4], lake[3 * len(lake) // 4], lake[0]):
                qa = math.atan2(q[1] - ly, q[0] - lx)
                if self._fits([(q[0], q[1], .04 + .02 * F, .025, qa), (q[0] - math.cos(qa) * .03, q[1] - math.sin(qa) * .03, .04, .006, qa)], .9):
                    self.house('stone_warm', q[0], q[1], .04 + .02 * F, .025, .014, qa, ROOF_SLATE, ridge=.01); self.box('path', q[0] - math.cos(qa) * .03, q[1] - math.sin(qa) * .03, .04, .006, .003, qa); break
        elif fam == 'deerpark':                                                              # 鹿苑：一圈木栅（深色细线）围出草场 + 几株孤植大橡树
            th = gdir + math.pi + R.uniform(-.5, .5); pts = [(math.cos(t) * self.r(t) * .8, math.sin(t) * self.r(t) * .8) for t in np.linspace(th - .9, th + .9, 18)]
            pts = [p for p in pts if not self._in_polys(*p) and not self.in_bldg(*p, .02)]
            if len(pts) > 3: self.wall_line('dark', pts, .003, .005)
            for _ in range(int(3 + 5 * F)):
                t = th + R.uniform(-.8, .8); f = R.uniform(.45, .72); self.plant(math.cos(t) * self.r(t) * f, math.sin(t) * self.r(t) * f, float(R.uniform(.07, .09)), 'tree1', .9)
        self.outbuildings((int(R.integers(1, 4)) if F > .4 else 1) if g0 is None else int(R.integers(0, 2)), 'stone_warm', ROOF_SLATE)
        for _ in range(int(1 + 2 * F)):                                                     # 草甸上割出来的弯曲步道
            th = R.uniform(0, TAU); pts = [(math.cos(th + t * .8) * self.r(th + t * .8) * (.3 + .4 * t), math.sin(th + t * .8) * self.r(th + t * .8) * (.3 + .4 * t)) for t in np.linspace(0, 1, 10)]
            pts = [p for p in pts if not self._in_polys(*p) and not self.in_bldg(*p, .01)]
            if len(pts) > 2: self.wall_line('lawn', pts, .01, .0015)

    # ================= 法国城堡与规整园 =================
    def est_chateau(self):
        lx, ly, a, L = self.main_chateau(); self.main = (lx, ly); self.garden_chateau(lx, ly, a, L)
    def main_chateau(self):
        """主楼三种平面：U 形（主体 + 两翼 + 角楼）/ 方楼（四角亭 + 中央穹顶）/ 长楼（中央凸出楼 + 端亭）；深灰蓝孟莎顶。
        正面（-v）是砾石荣誉庭院，园林立面（+v）朝岛上最长的方向。"""
        R = self.R; F = max(self.F, .3); col = ROOF_MANSARD; fam = self.layout or 'axis'
        L = min(.7, .5 * F) * (.7 if fam == 'hunt' else 1); lx, ly = self.main_spot(L * .6)
        if fam == 'hunt': a = float(R.uniform(0, TAU))
        else:
            best = max(((self.reach(lx, ly, k * math.pi / 4 + math.pi / 2, .85) + .4 * self.reach(lx, ly, k * math.pi / 4 - math.pi / 2, .85) + R.uniform(0, .03), k * math.pi / 4) for k in range(8)))
            a = best[1] + R.uniform(-.06, .06)
        c, s = math.cos(a), math.sin(a); P = lambda dx, dy: (lx + dx * c - dy * s, ly + dx * s + dy * c)
        plan = self.plan if self.plan in ('U', 'block', 'range') else 'U'
        if plan == 'U':
            self.house('marble', *P(0, 0), L, L * .2, .055, a, col, ridge=L * .08)
            for sx in (-1, 1):
                self.house('marble', *P(sx * L * .42, -L * .2), L * .16, L * .45, .05, a, col, ridge=L * .06)
                X, Y = self.world(*P(sx * L * .5, L * .06)); z0 = self.Z(*P(sx * L * .5, L * .06))
                B('marble').cyl(X, Y, z0, L * .05, .07, 16); B('dark').cyl(X, Y, z0 + .07, L * .055, L * .08, 16, r2=.002)   # 角楼 + 尖顶
            box_ = (-L * .5, L * .5, -L * .43, L * .1)
        elif plan == 'block':
            self.house('marble', *P(0, 0), L * .6, L * .42, .06, a, col, ridge=L * .12)
            for sx in (-1, 1):
                for sy in (-1, 1): self.house('marble', *P(sx * L * .3, sy * L * .21), L * .16, L * .16, .072, a, col, ridge=L * .07)
            X, Y = self.world(lx, ly); B('roof_lead', True).ico(X, Y, self.Z(lx, ly) + .07, L * .08, sz=.8, sub=2)
            box_ = (-L * .38, L * .38, -L * .29, L * .29)
        else:
            self.house('marble', *P(0, 0), L * 1.1, L * .16, .05, a, col, ridge=L * .06)
            self.house('marble', *P(0, -L * .06), L * .22, L * .22, .065, a, col, ridge=L * .09)
            for sx in (-1, 1): self.house('marble', *P(sx * L * .55, 0), L * .14, L * .24, .06, a, col, ridge=L * .07)
            box_ = (-L * .62, L * .62, -L * .17, L * .12)
        self.mainbox = box_
        if fam not in ('moat', 'hunt'):                                                     # 荣誉庭院：砾石，只在正面；不许跨出台地
            dh = min(L * .5, max(.03, self.reach(lx, ly, a - math.pi / 2, .85) - L * .3)); w = (box_[1] - box_[0]) * .8
            for _ in range(8):
                cc = P(0, box_[2] - dh / 2)
                if all(self.on_plateau(x, y) for x, y in rect_pts(*cc, w, dh, a)) and self._fits([(*cc, w, dh, a)], .88): break
                dh *= .8; w *= .92
            self.box('gravel', *cc, w, dh, .002, a); self.claim_rect(*cc, w, dh, a)
            self.court = (cc, w, dh)
        return lx, ly, a, L
    def _canal(self, P, a, y0, wd, lim=None):
        """中轴水渠：沿 +v 每 .02 采样，inside(.85) 截断；返回 (起点, 长度) 或 None。"""
        y = y0
        while y - y0 < (lim or 9) and all(self.inside(*P(sx * wd / 2, y + .02), .85) for sx in (-1, 0, 1)) and not self._in_polys(*P(0, y + .02)): y += .02
        cl = y - y0
        if cl < .08: return None
        self.box('water_l', *P(0, y0 + cl / 2), wd, cl, .003, a); self.claim_rect(*P(0, y0 + cl / 2), wd, cl, a, pad=.006); return y0, cl
    def _cross(self, P, a, yc, wd, cl):
        """横渠：半长 = min(cl · .35, 到岸距离 · .8)，两端都截在岸内。"""
        hl = min(cl * .35, self.reach(*P(0, yc), a, .85) * .8, self.reach(*P(0, yc), a + math.pi, .85) * .8)
        if hl < .05: return
        self.box('water_l', *P(0, yc), hl * 2, wd, .003, a); self.claim_rect(*P(0, yc), hl * 2, wd, a, pad=.006)
    def garden_chateau(self, lx, ly, a, L, g0=None):
        """园林立面（+v）：按布局族排花坛、水面、丛林块；园外只有方块丛林与林荫道。"""
        R = self.R; F = max(self.F, .3); fam = self.layout or 'axis'
        c, s = math.cos(a), math.sin(a); P = lambda dx, dy: (lx + dx * c - dy * s, ly + dx * s + dy * c)
        box_ = getattr(self, 'mainbox', (-L * .5, L * .5, -L * .3, L * .15))
        if fam == 'hunt': return self._hunt(lx, ly, a, L)
        gy = (g0 if g0 is not None else box_[3] + .015)
        if fam == 'moat':                                                                   # 护城河（douves）：方形水环包住主楼，正面一座桥
            mw = .025 * F + .014; m_ = .03; x0, x1, y0, y1 = box_[0] - m_, box_[1] + m_, box_[2] - m_, box_[3] + m_
            for cx, cy, w, d in (((x0 + x1) / 2, y0 - mw / 2, x1 - x0 + 2 * mw, mw), ((x0 + x1) / 2, y1 + mw / 2, x1 - x0 + 2 * mw, mw),
                                 (x0 - mw / 2, (y0 + y1) / 2, mw, y1 - y0), (x1 + mw / 2, (y0 + y1) / 2, mw, y1 - y0)):
                self.box('water_l', *P(cx, cy), w, d, .003, a)
            self.claim_rect(*P((x0 + x1) / 2, (y0 + y1) / 2), x1 - x0 + 2 * mw, y1 - y0 + 2 * mw, a)
            self.box('path', *P(0, y0 - mw / 2), .02, mw * 1.6, .005, a); self.box('gravel', *P(0, y0 - mw - .03), (x1 - x0) * .6, .05, .002, a)
            gy = y1 + mw + .02
        Lg = self.reach(*P(0, gy), a + math.pi / 2, .85)
        pw = L * 1.6; ph = min({'axis': .45, 'moat': .5, 'miroir': .25, 'tcanal': .35}[fam] * Lg, L * 1.2)
        for _ in range(10):                                                                 # 花坛要整块在岛内
            if ph > .03 and self._fits([(*P(0, gy + ph / 2), pw, ph, a)], .86) and not any(self._in_polys(x, y) for x, y in rect_pts(*P(0, gy + ph / 2), pw, ph, a)): break
            pw *= .9; ph *= .92
        if ph > .03:
            self.box('gravel', *P(0, gy + ph / 2), pw * 1.04, ph * 1.02, .002, a)
            nx_ = 3 if pw > .3 else 2; ny_ = 2 if ph > .16 else 1; cw, ch = pw / nx_ * .84, ph / ny_ * .82
            for i in range(nx_):
                for j in range(ny_):
                    q = P((i + .5 - nx_ / 2) * pw / nx_, gy + (j + .5) * ph / ny_)
                    if fam == 'tcanal':                                                      # 下沉阶梯花坛：三级台阶
                        for k in range(3): self.box('lawn_p2' if k % 2 else 'lawn_p', q[0], q[1], cw * (1 - .12 * k), ch * (1 - .12 * k), .0025 + .0004 * k, a)
                        self.wall_line('hedge', rect_pts(q[0], q[1], cw, ch, a), .004, .006, closed=True)
                    else: self.parterre(q[0], q[1], cw, ch, a, 3 if (i + j) % 2 == 0 else (i + j + int(R.integers(3))) % 3)
            for fy in range(ny_ + 1): q = P(0, gy + fy * ph / ny_); self.disc('water_l', q[0], q[1], .018 * F + .006, .018 * F + .006, dz=.004, seg=24)
            self.claim_rect(*P(0, gy + ph / 2), pw * 1.04, ph * 1.02, a)
        else: ph = 0
        y = gy + ph + .02; wd = .07 * F + .02
        if fam == 'axis':                                                                   # 大水渠 + （一半的岛）横渠
            cn = self._canal(P, a, y, wd)
            if cn and R.random() < .5: self._cross(P, a, cn[0] + cn[1] * .6, wd * .85, cn[1])
        elif fam == 'tcanal':                                                               # T 形大运河：长轴 + 末端横臂
            cn = self._canal(P, a, y, wd * .9)
            if cn: self._cross(P, a, cn[0] + cn[1] - wd * .45, wd * .9, max(cn[1], .3))
        elif fam == 'miroir':                                                               # 水镜 + 鹅掌放射林荫道（正面）
            d = min(.3 * Lg, .35 * F + .05); mwd = pw * .8
            for _ in range(8):
                if self._fits([(*P(0, y + d / 2), mwd, d, a)], .85) and not self._in_polys(*P(0, y + d / 2)): break
                d *= .85; mwd *= .92
            if d > .04: self.box('water_l', *P(0, y + d / 2), mwd, d, .003, a); self.cyl('marble', *P(0, y + d / 2), .006, .004, 8); self.claim_rect(*P(0, y + d / 2), mwd, d, a)
            cc = getattr(self, 'court', ((lx, ly), 0, 0))[0]
            for t in (-.6, 0, .6):                                                            # patte d'oie：三条林荫道从前庭放射到岸
                ang = a - math.pi / 2 + t; Ln = self.reach(cc[0], cc[1], ang, .88)
                for dd in np.arange(.06, Ln, .085):
                    for off in (-.04, .04):
                        px, py = cc[0] + math.cos(ang) * dd - math.sin(ang) * off, cc[1] + math.sin(ang) * dd + math.cos(ang) * off
                        self.plant(px, py, .045, 'tree2', .9, .3)
        elif fam == 'moat': q = P(0, y + .04); self.disc('water_l', q[0], q[1], .03 * F + .01, .03 * F + .01, dz=.003, seg=24) if self.inside(*q, .85) else None
        # 两侧方块丛林（bosquet），块间直园路
        side0 = pw / 2 + .03; bw = .16 * F + .05; Lb = self.reach(*P(0, gy), a + math.pi / 2, .88)
        nb = max(1, int(Lb / (.2 * F + .1)))
        for sx in (-1, 1):
            for k in range(nb):
                y0 = gy + k * Lb / nb; bh = Lb / nb - .025
                if bh < .06: continue
                self.bosquet(*P(sx * (side0 + bw / 2), y0 + bh / 2), bw, bh, a)
            self.box('gravel', *P(sx * (side0 - .012), gy + Lb / 2), .014, Lb, .002, a) if self._fits([(*P(sx * (side0 - .012), gy + Lb / 2), .014, Lb, a)], .9) else None
        # 橘园
        if F > .4:
            p = self.spot(.08 * F, smax=.72)
            if p: self.house('marble', p[0], p[1], .16 * F, .04 * F, .025, a, ROOF_MANSARD, ridge=.01)
        if g0 is None: self.outbuildings(int(R.integers(0, 3)), 'marble', ROOF_MANSARD)
        self.axis = (lx, ly, a)
    def _bosquet_grid(self, lx, ly, a, F):
        """其余园地：沿中轴对齐的方块丛林网格（块间是笔直的园路），勒诺特尔式园林的「底」——不留随机撒点的树。"""
        c, s = math.cos(a), math.sin(a); bs = .14 * F + .06; al = .026; st = bs + al; n = int(1.2 * max(self.rx, self.ry) / st) + 2
        for i in range(-n, n + 1):
            for j in range(-n, n + 1):
                dx, dy = i * st, j * st + st / 2; cx, cy = lx + dx * c - dy * s, ly + dx * s + dy * c
                if not self.inside(cx, cy, .88) or self._in_polys(cx, cy, bs * .2) or self.in_bldg(cx, cy, bs * .3): continue
                self.bosquet(cx, cy, bs, bs, a, sp=.08, kind='tree2' if (i + j) % 3 else 'tree6')
    def _hunt(self, lx, ly, a, L):
        """狩猎小楼 + 星形林路：圆形林间空地（rond-point）放射 6–8 条笔直的林路，其余是规则种植的林子。"""
        R = self.R; F = max(self.F, .3); n = int(R.choice([6, 8])); rp = L * .75 + .02
        self.disc('gravel', lx, ly, rp, rp, dz=.0018, seg=48); self.claim(lx, ly, rp)
        rides = [a + k * TAU / n for k in range(n)]
        for t in rides:
            Ln = self.reach(lx, ly, t, .86)
            if Ln > rp: self.box('gravel', lx + math.cos(t) * (rp + Ln) / 2, ly + math.sin(t) * (rp + Ln) / 2, Ln - rp, .022, .002, t)
        sp = .09
        for i in range(-30, 31):
            for j in range(-30, 31):
                px, py = lx + i * sp + R.uniform(-.01, .01), ly + j * sp + R.uniform(-.01, .01); dx, dy = px - lx, py - ly; d = math.hypot(dx, dy)
                if d < rp + .03 or not self.inside(px, py, .9): continue
                if any(abs(-dx * math.sin(t) + dy * math.cos(t)) < .035 and dx * math.cos(t) + dy * math.sin(t) > 0 for t in rides): continue
                self.plant(px, py, float(R.uniform(.045, .06)), 'tree2' if R.random() < .7 else 'tree6', .92, .3)

    # ================= 苏州园林 =================
    def est_suzhou(self):
        """园墙贴岸（.84 r(θ)）围出占岛 ≥ 70 % 的园子；以池为心（池 ≈ 园的 37 %，带水口）；厅在池南、假山在池北（厅—池—山）；
        九曲桥 + 平板石桥；三面以上连续的廊；2–3 道带洞门缺口的分院墙；地面是花街铺地，不是草坪。"""
        R = self.R; F = max(self.F, .3); col = ROOF_TILE; fam = self.layout or 'bay'
        ph0 = float(R.uniform(0, TAU))
        # B2 第 3 轮去模板：court / hill 两族做「偏置园」——园墙只围岛的 ~2/3，偏向一侧，园外留竹林、草坡
        gk, go = (.84, (0.0, 0.0))
        if fam in ('court', 'hill'):
            gph = float(R.uniform(0, TAU))
            for gk in (.66, .62, .58, .54):
                go = (math.cos(gph) * .14 * self.r(gph), math.sin(gph) * .14 * self.r(gph))
                if all(self.inside(go[0] + math.cos(t) * gk * self.r(t), go[1] + math.sin(t) * gk * self.r(t), .86) for t in np.linspace(0, TAU, 48, endpoint=False)): break
        G = [(go[0] + math.cos(t) * gk * self.r(t) * (1 + .02 * math.sin(6 * t + ph0)), go[1] + math.sin(t) * gk * self.r(t) * (1 + .02 * math.sin(6 * t + ph0))) for t in np.linspace(0, TAU, 56, endpoint=False)]
        Ag = poly_area(G); Rg = math.sqrt(Ag / math.pi); sc = min(1.0, Rg / .5)
        self.prune_trees(G, .45)
        self.patch('sz_ground', G, dz=.0012)                                                # 花街铺地与苔地各半（不再满铺灰）
        self.wall_line('whitewall', G, .008, .008, closed=True); self.tile_line(G, .004, .008, closed=True)   # 白墙露边：墙厚 .008、瓦带 .004
        # 池：绕池心的极坐标多边形，按面积迭代到园的 ~37 %
        gcx, gcy = sum(p[0] for p in G) / len(G), sum(p[1] for p in G) / len(G)
        po = float(R.uniform(0, TAU)); pd_ = float(R.uniform(.1, .3)) * Rg                    # 池心偏离园心 .1–.3 Rg，方向随种子
        pc = (gcx + math.cos(po) * pd_, gcy + math.sin(po) * pd_)
        pr_t = float(R.uniform(.25, .40)) * (.75 if fam in ('court', 'hill') else 1)         # 池占园 .25–.40（分院 / 大假山族再少一些，给院子和山让地）
        h1, h2 = float(R.uniform(0, TAU)), float(R.uniform(0, TAU)); inl = [float(R.uniform(0, TAU)) for _ in range(2)]
        ths = np.linspace(0, TAU, 72, endpoint=False); bd = [ray_dist(pc[0], pc[1], t, G) for t in ths]
        def pool(k):
            out = []
            for t, b in zip(ths, bd):
                f = k * (1 + .1 * math.sin(2 * t + h1) + .07 * math.sin(3 * t + h2))
                if fam == 'twin': f *= .7 + .3 * abs(math.cos(t - h1))                         # 两个池面由窄水道连起来
                for ti in inl: f = max(f, .8 * max(0.0, 1 - abs(math.remainder(t - ti, TAU)) / .16))   # 水口：伸向墙角的水湾
                f = min(f, .8); out.append((pc[0] + math.cos(t) * b * f, pc[1] + math.sin(t) * b * f))
            return out
        k = .6
        for _ in range(6): Pp = pool(k); k *= math.sqrt(pr_t / max(.05, poly_area(Pp) / Ag))
        Pp = pool(k); self.patch('water', Pp, dz=.003); self.pool_ratio = poly_area(Pp) / Ag
        pr = lambda t: ray_dist(pc[0], pc[1], t, Pp)
        occ = []                                                                            # 园内占地（本函数自己的避让）
        def ok(x, y, rr): return pip(x, y, G) and not pip(x, y, Pp) and all(math.hypot(x - a_, y - b_) > rr + c_ for a_, b_, c_ in occ)
        if fam == 'islet':                                                                  # 池中小岛 + 亭
            ix, iy = pc[0] + math.cos(h2) * pr(h2) * .3, pc[1] + math.sin(h2) * pr(h2) * .3; ri = math.sqrt(.15 * poly_area(Pp) / math.pi)   # 池中岛 ≈ 池面 15 %
            self.disc('paving', ix, iy, ri, ri * .8, h1, dz=.0035, seg=20); self.cyl('whitewall', ix, iy, .01 * sc + .004, .01, 6, dz=.003); self.cyl('dark', ix, iy, .015 * sc + .005, .01, 6, dz=.013, r2=.002)
            self.tree(ix + ri * .5, iy, .04, 'tree2')
        # 主厅：池南，面阔约 15 m，朝北临池；屋脊一条浅灰脊线
        ts = self.south() + float(R.uniform(-1.1, 1.1)); hw = min(.15, .5 * Rg); hd = hw * .4; dist = pr(ts) + hd / 2 + .012   # 厅的朝向随岛变（不再都坐南朝北）
        room = ray_dist(pc[0], pc[1], ts, G)
        if dist + hd / 2 + .01 > room: hw *= .7; hd = hw * .4; dist = min(dist, room - hd / 2 - .012)
        hx, hy = pc[0] + math.cos(ts) * dist, pc[1] + math.sin(ts) * dist
        for _ in range(8):                                                                  # 主厅整栋在 inside(.9) 里：不过就往池心收、缩小
            if self._fits([(hx, hy, hw, hd, ts + math.pi / 2)], .9): break
            hw *= .9; hd = hw * .4; dist -= .01; hx, hy = pc[0] + math.cos(ts) * dist, pc[1] + math.sin(ts) * dist
        z0 = self.house('whitewall', hx, hy, hw, hd, .014, ts + math.pi / 2, col, ridge=.01); self.box('stone', hx, hy, hw * .95, .0025, .002, ts + math.pi / 2, dz=z0 - self.Z(hx, hy) + .0235)
        self.box('paving', hx - math.cos(ts) * (hd / 2 + .008), hy - math.sin(ts) * (hd / 2 + .008), hw * .8, .012, .003, ts + math.pi / 2)   # 临池平台
        occ.append((hx, hy, hw * .55)); self.main = (hx, hy)
        # 假山：池北岸一大团 + 1–2 小团（密集石堆，约 8 × 12 m）
        tn = ts + math.pi
        hill = fam == 'hill'
        for kk, t in enumerate([tn] + [tn + R.uniform(1.2, 2.2) * R.choice([-1, 1]) for _ in range(int(R.integers(1, 3)))]):
            m_ = 2.2 if (hill and kk == 0) else 1.0                                            # hill 族：北岸一座大假山（约占园 12 %）+ 山顶亭
            d = pr(t) + .025 * sc * m_; cx, cy = pc[0] + math.cos(t) * d, pc[1] + math.sin(t) * d; A, Bb = ((.06 if kk == 0 else .035) * sc + .01) * m_, ((.04 if kk == 0 else .025) * sc + .008) * m_
            if hill and kk == 0:
                while not pip(cx, cy, G) and d > pr(t): d -= .01; cx, cy = pc[0] + math.cos(t) * d, pc[1] + math.sin(t) * d
            for _ in range(int((40 if kk == 0 else 18) * max(sc, .4) * m_ * m_)):
                u, v = R.normal(0, .45), R.normal(0, .45); px, py = cx + (u * A * math.cos(t + math.pi / 2) - v * Bb * math.sin(t + math.pi / 2)), cy + (u * A * math.sin(t + math.pi / 2) + v * Bb * math.cos(t + math.pi / 2))
                if pip(px, py, G): X, Y = self.world(px, py); B('rockery', True).ico(X, Y, self.Z(px, py), float(R.uniform(.007, .016)) * max(sc, .5), sz=1.8)
            self.disc('rockery', cx, cy, A * .8, Bb * .8, t + math.pi / 2, dz=.0025, seg=20)
            if hill and kk == 0: self.cyl('whitewall', cx, cy, .01, .012, 6, dz=.02); self.cyl('dark', cx, cy, .018, .012, 6, dz=.032, r2=.002)   # 山顶亭
            occ.append((cx, cy, max(A, Bb)))
        # 其它厅、轩、亭、舫：绕池
        nb_ = int(R.integers(5, 9))
        for j in range(nb_):
            t = ts + (j + 1) * TAU / (nb_ + 1) + R.uniform(-.2, .2)
            if abs(math.remainder(t - tn, TAU)) < .45: continue
            p1, b = pr(t), ray_dist(pc[0], pc[1], t, G); kind = ('ting', 'xuan', 'ting', 'fang')[j % 4]
            if kind == 'ting':                                                               # 六角亭：半伸进池
                d = p1 + .004; x, y = pc[0] + math.cos(t) * d, pc[1] + math.sin(t) * d
                if ok(x, y, .02): self.cyl('whitewall', x, y, .01 * sc + .005, .01, 6); self.cyl('dark', x, y, .016 * sc + .007, .012, 6, dz=.01, r2=.002); occ.append((x, y, .02))
            else:
                w = (.07 if kind == 'xuan' else .05) * max(sc, .5) + .02; dd = .03 * max(sc, .5) + .01; d = p1 + dd / 2 + .01 if kind == 'xuan' else p1 - dd * .2
                if d + dd / 2 > b - .02: continue
                x, y = pc[0] + math.cos(t) * d, pc[1] + math.sin(t) * d
                if not all(math.hypot(x - a_, y - b_) > w * .55 + c_ for a_, b_, c_ in occ) or not self._fits([(x, y, w, dd, t + math.pi / 2)], .9): continue
                if kind == 'fang': self.box('stone', x, y, w, dd, .006, t + math.pi / 2); self.roof(x, y, w * .7, dd * .9, self.Z(x, y) + .012, .006, t + math.pi / 2, col)   # 石舫
                else: z0 = self.house('whitewall', x, y, w, dd, .012, t + math.pi / 2, col, ridge=.008); self.box('stone', x, y, w * .95, .002, .002, t + math.pi / 2, dz=z0 - self.Z(x, y) + .0195)
                occ.append((x, y, w * .55))
        # 廊：沿墙内侧连续（1–2 段，合计约 65 % 周长 → 至少三面），段端放亭
        Gi = [(x * .96, y * .96) for x, y in G]; nG = len(Gi); runs = [(int(R.integers(nG)), int(nG * R.uniform(.55, .75)))]
        if R.random() < .5: s0, ln = runs[0]; runs = [(s0, ln // 2 - 2), ((s0 + ln // 2 + 2) % nG, ln // 2)]
        for s0, ln in runs:
            pts = [Gi[(s0 + i) % nG] for i in range(ln)]
            self.tile_line(pts, .03, .01, ht=.006)
            for q in (pts[0], pts[-1]): self.cyl('whitewall', q[0], q[1], .008, .012, 6); self.cyl('dark', q[0], q[1], .014, .01, 6, dz=.012, r2=.002)
            for x, y in pts[::3]: self._mark_circle(x, y, .012)
        # 分院墙：从园墙拉向池岸，中间一道洞门缺口
        for _ in range(3 if self.plan == 'three' else 2):
            t = float(R.uniform(0, TAU)); i = int((t % TAU) / TAU * len(G)); a0 = G[i]; tt = math.atan2(a0[1] - pc[1], a0[0] - pc[0])
            e = (pc[0] + math.cos(tt) * (pr(tt) + .03), pc[1] + math.sin(tt) * (pr(tt) + .03))
            m1 = (a0[0] + (e[0] - a0[0]) * .42, a0[1] + (e[1] - a0[1]) * .42); m2 = (a0[0] + (e[0] - a0[0]) * .58, a0[1] + (e[1] - a0[1]) * .58)
            if math.hypot(e[0] - a0[0], e[1] - a0[1]) < .06: continue
            for seg in ((a0, m1), (m2, e)):
                if any(math.hypot((seg[0][0] + seg[1][0]) / 2 - a_, (seg[0][1] + seg[1][1]) / 2 - b_) < c_ for a_, b_, c_ in occ): continue
                self.wall_line('whitewall', list(seg), .008, .008); self.tile_line(list(seg), .004, .008)
        if fam == 'twin':                                                                   # 两池之间（腰部）一道水廊：石台 + 黛瓦廊顶
            tw = h1 + math.pi / 2; d1, d2 = pr(tw + math.pi), pr(tw)
            while d1 > .02 and not self.inside(pc[0] - math.cos(tw) * d1, pc[1] - math.sin(tw) * d1, .86): d1 -= .005
            while d2 > .02 and not self.inside(pc[0] + math.cos(tw) * d2, pc[1] + math.sin(tw) * d2, .86): d2 -= .005
            a_w = (pc[0] - math.cos(tw) * d1, pc[1] - math.sin(tw) * d1); b_w = (pc[0] + math.cos(tw) * d2, pc[1] + math.sin(tw) * d2)
            self.wall_line('stone', [a_w, b_w], .02, .005, dz=.002); self.tile_line([a_w, b_w], .03, .014, ht=.006)
        if fam == 'court':                                                                  # 分院：池对面一座无池的小院（白墙围合 + 小厅 + 铺地 + 一株树）
            tc_ = po + math.pi; bd_ = ray_dist(gcx, gcy, tc_, G); cx, cy = gcx + math.cos(tc_) * bd_ * .6, gcy + math.sin(tc_) * bd_ * .6; w_ = min(.14, bd_ * .55)
            if pip(cx, cy, G) and not pip(cx, cy, Pp):
                cp = rect_pts(cx, cy, w_, w_ * .8, tc_); self.box('paving_w', cx, cy, w_, w_ * .8, .0024, tc_)
                self.wall_line('whitewall', cp, .008, .012, closed=True); self.tile_line(cp, .004, .012, closed=True)
                self.house('whitewall', cx + math.cos(tc_) * w_ * .25, cy + math.sin(tc_) * w_ * .25, w_ * .7, w_ * .25, .014, tc_ + math.pi / 2, col, ridge=.008)
                self.tree(cx - math.cos(tc_) * w_ * .15, cy - math.sin(tc_) * w_ * .15, .045, 'tree2'); occ.append((cx, cy, w_ * .7))
        # 九曲桥（石色，每段交替转 ±45°，长约池宽 60 %）+ 平板石桥（水口上）
        tb = ts + math.pi / 2 + R.uniform(-.9, .9); nd = tb + math.pi / 2; wid = pr(tb) + pr(tb + math.pi)
        mx, my, h1_, h2_ = pc[0], pc[1], pr(tb) * .3, pr(tb + math.pi) * .3
        for o in np.linspace(0, .85, 18):
            mx, my = pc[0] + math.cos(nd) * pr(nd) * o, pc[1] + math.sin(nd) * pr(nd) * o
            if not pip(mx, my, Pp): continue
            h1_, h2_ = ray_dist(mx, my, tb, Pp), ray_dist(mx, my, tb + math.pi, Pp)
            if h1_ + h2_ <= .6 * wid: break
        a_, b_ = (mx - math.cos(tb) * (h2_ + .008), my - math.sin(tb) * (h2_ + .008)), (mx + math.cos(tb) * (h1_ + .008), my + math.sin(tb) * (h1_ + .008))
        nseg = 9; zz = []
        for i in range(nseg + 1):
            f = i / nseg; lat = (.5 if i % 2 else -.5) * (h1_ + h2_) / nseg * (0 if i in (0, nseg) else 1)
            zz.append((a_[0] + (b_[0] - a_[0]) * f - math.sin(tb) * lat, a_[1] + (b_[1] - a_[1]) * f + math.cos(tb) * lat))
        self.wall_line('stone', zz, .008, .003, dz=.002); self.bridge = zz
        ti = inl[0]; d = pr(ti) * .8; x, y = pc[0] + math.cos(ti) * d, pc[1] + math.sin(ti) * d
        self.box('path', x, y, .04 * max(sc, .5) + .02, .012, .004, ti + math.pi / 2)
        # 花木地被：园内 4–7 块不规则的灌丛种植池（深绿），树种在上面——铺地不再是一整片浅色
        beds = []
        for _ in range(int(R.integers(4, 8)) * 3):
            if len(beds) >= 7: break
            t = R.uniform(0, TAU); p1, b = pr(t), ray_dist(pc[0], pc[1], t, G)
            if b - p1 < .045: continue
            d = (p1 + b) / 2; x, y = pc[0] + math.cos(t) * d, pc[1] + math.sin(t) * d; A = min(.05 * max(sc, .5) + .02, (b - p1) * .4); Bb = A * R.uniform(.55, .85)
            if not ok(x, y, A) or self.in_bldg(x, y, A * .8) or not all(self.inside(px_, py_, .9) for px_, py_ in ell_pts(x, y, A, Bb, t + math.pi / 2, 12)): continue
            self.disc('hedge', x, y, A, Bb, t + math.pi / 2, dz=.0025, seg=18); beds.append((x, y, A)); occ.append((x, y, A * .6))
            for _ in range(int(R.integers(1, 3))): self.tree(x + R.normal(0, A * .3), y + R.normal(0, Bb * .3), float(R.uniform(.04, .05)), 'tree2' if R.random() < .5 else 'tree3')
        # 园内花木：以竹、常绿为主；1–2 株大乔木（白皮松）点景；池边 1–2 株粉花（≤ 5 %）
        pink, n_in = 0, int(8 + 24 * Rg)
        for _ in range(n_in * 4):
            if n_in <= 0: break
            t = R.uniform(0, TAU); p1, b = pr(t), ray_dist(pc[0], pc[1], t, G)
            if b - p1 < .05: continue
            d = R.uniform(p1 + .02, b - .025); x, y = pc[0] + math.cos(t) * d, pc[1] + math.sin(t) * d
            if not ok(x, y, .03) or self.in_bldg(x, y, .01): continue
            if pink < 2 and d < p1 + .04 and R.random() < .3: self.tree(x, y, .04, 'tree5'); pink += 1
            else: self.tree(x, y, float(R.uniform(.04, .055)), 'tree3' if R.random() < .45 else 'tree2')
            occ.append((x, y, .025)); n_in -= 1
        for _ in range(int(R.integers(1, 3))):
            t = R.uniform(0, TAU); d = (pr(t) + ray_dist(pc[0], pc[1], t, G)) / 2; x, y = pc[0] + math.cos(t) * d, pc[1] + math.sin(t) * d
            if ok(x, y, .04) and not self.in_bldg(x, y, .02): self.tree(x, y, .08, 'tree6'); occ.append((x, y, .06))
        self.claim_poly(G)
        if fam in ('court', 'hill'):                                                         # 偏置园：园外一片竹林 + 草坡
            for _ in range(int(20 + 40 * self.F)):
                t = R.uniform(0, TAU); f = R.uniform(.5, .92); x, y = math.cos(t) * self.r(t) * f, math.sin(t) * self.r(t) * f
                if not pip(x, y, G): self.plant(x, y, float(R.uniform(.04, .05)), 'tree3', .95, .6)
        # 园外：竹林团 + 茶垄只留在海岬尖端
        rs = [self.r(t) for t in np.linspace(0, TAU, 72, endpoint=False)]; rm = sum(rs) / len(rs)
        for i, t in enumerate(np.linspace(0, TAU, 72, endpoint=False)):
            if rs[i] > rm * 1.06 and i % 3 == 0:
                for _ in range(int(R.integers(2, 5))):
                    b = t + R.normal(0, .04); f = R.uniform(.88, .95); self.plant(math.cos(b) * self.r(b) * f, math.sin(b) * self.r(b) * f, float(R.uniform(.04, .05)), 'tree3', .97, .3)
    def garden_suzhou(self, lx, ly, a, L, g0=None): self.est_suzhou()

    # ================= 岭南园林（B2 第 3 轮重写）=================
    # 上一版「灰水泥满铺 + 成排长屋 + 直角方池」俯视读成营房 / 圈舍，整段推倒。现在每座岛是一处岭南园林 / 村口：
    #   镬耳山墙（高出屋脊 1.2 m 的深色弧形墙头，40° 太阳下投出弧形影子）、灰绿瓦（不是苏州的黛黑瓦）、青砖墙；
    #   祠堂三进（头门—中堂—后寝，天井 + 两廊）+ 禾坪 + 半月塘 + 村口大榕树；梳式小屋只作陪衬（≤ 2 × 2，长短、进深错开，巷口种树）；
    #   园林部分取四座名园的构图：余荫山房（方池 + 八角池、廊桥）、可园（L 形连房 + 四层可楼 + 园外湖）、清晖园（船厅 + 长池）、梁园（池中石峰 + 草堂）；
    #   地面是园地（苔绿）+ 天井 / 禾坪小块铺地，不再满铺。6 座岛 6 个布局族，互不相同。
    def ln_pyr(self, key, lx, ly, rad, h, n=4, rot=0.0, dz=0.0):
        """攒尖屋顶（n 边锥）：亭、楼阁。rot 为本地角。"""
        X, Y = self.world(lx, ly)
        bmesh.ops.create_cone(B(key).bm, cap_ends=True, cap_tris=False, segments=n, radius1=rad, radius2=.0005, depth=h,
                              matrix=Matrix.Translation((X, Y, self.Z(lx, ly) + dz + h / 2)) @ Matrix.Rotation(self.rot + rot, 4, 'Z'))
        self._rec(key, ell_pts(lx, ly, rad, rad, 0, 12), h)

    def est_lingnan(self):
        R = self.R; fam = self.layout if self.layout in LN_FAMS else 'village'
        kit = _LnKit(self)
        big = 1.3 if self.terrain == 'lake' else 1.0                                        # lake 地形：池放大
        fn = getattr(kit, 'fam_' + fam)
        # 找位置：朝向 12 个 × 偏移 5 个 × 缩放 1 → .55；所有占地要在 inside(.84) 里、不压裸岩 / 台地墙
        best = None; a0 = float(R.uniform(0, TAU))
        for s in ((1.1, 1.0, .92) if fam == 'ancestral' else (1.35, 1.2, 1.1, 1.0)) + (.84, .76, .68, .6, .52):
            for k in range(12):
                a = a0 + k * math.pi / 6
                for ox, oy in ((0, 0), (.05, 0), (-.05, 0), (0, .05), (0, -.05)):
                    kit.begin(a, s, (ox * self.F / .3, oy * self.F / .3), draw=False); fn(big)
                    if kit.fits(): best = (a, s, (ox * self.F / .3, oy * self.F / .3)); break
                if best: break
            if best: break
        if best is None: best = (a0, .5, (0, 0))
        a, s, o = best; self.ln_fit = (round(a, 3), s)
        kit.begin(a, s, o, draw=True); fn(big); self.main = kit.P(0, -.02)
        self.pond_ratio = kit.water_area / max(1e-6, math.pi * self.rx * self.ry * self.ex * self.ey)
        for P in kit.claims: self.claim_poly(P)
    def garden_lingnan(self, lx, ly, a, L, g0=None): self.est_lingnan()

    def est_fortress(self): pass
    def est_neoclassical(self): pass

    def export(self, norm):
        pts = []
        for t in np.linspace(0, TAU, 36, endpoint=False):
            rr = self.r(t); X, Y = self.world(math.cos(t) * rr, math.sin(t) * rr); nx, ny = norm((X, Y, self.z)); pts.append([nx, ny])
        return pts

# ---------------- 岭南园林工具箱（设计坐标 u 右、v 进深，+v 为后；× 缩放 s、转 a、平移 o → 岛的本地坐标）----------------
class _LnKit:
    """同一套调用跑两遍：draw=False 只记占地（找位置用），draw=True 真正生成。随机数每遍重新起种，两遍一致。"""
    def __init__(self, isle): self.e = isle
    def begin(self, a, s, o, draw):
        self.a, self.s, self.o, self.draw = a, s, o, draw; self.c, self.sn = math.cos(a), math.sin(a)
        self.polys, self.claims, self.water_area = [], [], 0.0
        self.rng = np.random.default_rng(seed_of(self.e.id) + 77); self.rng2 = np.random.default_rng(seed_of(self.e.id) + 78)   # rng：两遍都走；rng2：只在生成时用
    def P(self, u, v): s = self.s; return (self.o[0] + s * (u * self.c - v * self.sn), self.o[1] + s * (u * self.sn + v * self.c))
    def rp(self, u, v, w, d, rot=0.0): return rect_pts(*self.P(u, v), w * self.s, d * self.s, self.a + rot)
    def fits(self):
        e = self.e
        for Pl in self.polys:
            cx, cy = sum(p[0] for p in Pl) / len(Pl), sum(p[1] for p in Pl) / len(Pl)
            for x, y in Pl + [(cx, cy)]:
                if not e.inside(x, y, .84) or any(math.hypot(x - a_, y - b_) < c_ for a_, b_, c_ in e.occ): return False
        return True
    # ---- 基本件 ----
    def ground(self, pts, wall=False, gate=None, key='ln_ground'):
        """园地（苔绿）一片；wall=True 时沿边砌青砖矮墙 + 灰绿瓦压顶，gate = 缺口所在的点序号（园门）。"""
        L = [self.P(u, v) for u, v in pts]; self.polys.append(L)
        if not self.draw: return L
        self.e.prune_trees(L, .5); self.e.patch(key, L, dz=.0011, rings=2); self.claims.append(L)
        if wall:
            n = len(L); seq = [L[(gate + 1 + k) % n] for k in range(n - 1)] if gate is not None else L + [L[0]]
            self.e.wall_line('greybrick', seq, .006, .018); self.e.tile_line(seq, .009, .018, col=ROOF_LN, ht=.003)
        return L
    def pave(self, u, v, w, d, key='ln_pave', rot=0.0):
        self.polys.append(self.rp(u, v, w, d, rot))
        if self.draw: self.e.box(key, *self.P(u, v), w * self.s, d * self.s, .0022, self.a + rot); self.claims.append(self.rp(u, v, w, d, rot))
    def house(self, u, v, w, d, h, ears=True, along=0.0, col=ROOF_LN, rg=.3):
        """一栋硬山顶房：屋脊沿 along（0 = 沿 u）；两端镬耳山墙（深色弧形墙头，高出屋脊 1.5 m）；屋脊一条浅灰脊线。"""
        ang = self.a + along; W, D = w * self.s, d * self.s; self.polys.append(rect_pts(*self.P(u, v), W, D, ang))
        if not self.draw: return
        e = self.e; x, y = self.P(u, v); ridge = max(.012, D * rg)
        f = float(self.rng2.uniform(.9, 1.1)); cc = tuple(min(1, k * f) for k in col)            # 每栋屋面明度 ±10 %
        z0 = e.house('greybrick', x, y, W, D, h, ang, cc, ridge=ridge)
        e.box('ln_ridge', x, y, W * .92, .0045, .004, ang, dz=z0 + h + ridge - e.Z(x, y) - .002)
        if ears:
            ca, sa = math.cos(ang), math.sin(ang)
            for k in (-1, 1): e.ear(x + k * (W / 2 - .004) * ca, y + k * (W / 2 - .004) * sa, D * 1.22, .013, z0 + h, ridge + .026, ang, key='ln_ear')   # 墙头宽 1.3 m、高出屋脊 2.6 m：俯视一道深色山墙带，40° 太阳下投出弧形影
    def tower(self, u, v, sz, fl):
        """可楼式方阁：fl 层，逐层收分，每层一圈灰绿瓦檐（俯视是一圈套一圈的方檐），攒尖顶。"""
        self.polys.append(self.rp(u, v, sz * 1.2, sz * 1.2))
        if not self.draw: return
        e = self.e; x, y = self.P(u, v); S = sz * self.s
        for k in range(fl):
            side = S * (1 - .08 * k); e.box('greybrick', x, y, side, side, .036, self.a, dz=k * .036)
            e.ln_pyr('ln_tile', x, y, side * .86, .014 if k < fl - 1 else .05, 4, self.a + math.pi / 4, dz=k * .036 + .03)
        e.claim_rect(x, y, S * 1.2, S * 1.2, self.a)
    def pav(self, u, v, r, n=4, dz=0.0):
        """亭：石台 + 木构 + 攒尖顶（4 / 6 / 8 角）。"""
        self.polys.append(self.rp(u, v, r * 2.4, r * 2.4))
        if not self.draw: return
        e = self.e; x, y = self.P(u, v); rr = max(.018, r * self.s)
        e.cyl('stone', x, y, rr * 1.3, .004 + dz, n); e.cyl('ln_timber', x, y, rr * .75, .026, n, dz=.004 + dz)
        e.ln_pyr('ln_tile', x, y, rr * 1.35, .026, n, self.a + math.pi / n, dz=.028 + dz); e.claim(x, y, rr * 1.4)
    def halfmoon(self, u, v, R):
        """半月塘：直边在 v（靠祠堂 / 禾坪一侧），弧向前（-v）；石砌塘岸。"""
        pts = [self.P(u + R * math.cos(t), v - .8 * R * math.sin(t)) for t in np.linspace(0, math.pi, 22)]; self.polys.append(pts)
        if not self.draw: return
        e = self.e; e.patch('ln_water', pts, dz=.003, rings=2); e.wall_line('ln_curb', pts, .006, .004, closed=True); self.claims.append(pts)
        c = self.P(u, v - .4 * R); e.water.append((c[0], c[1], R * self.s * 1.05, .5 * R * self.s, self.a)); self.water_area += math.pi * R * R * .4 * self.s ** 2
    def pond(self, u, v, A, Bb, rot=0.0, wob=.12, rocks=True):
        """曲岸池：绕池心的谐波多边形，岸边零散湖石。"""
        p1, p2 = float(self.rng.uniform(0, TAU)), float(self.rng.uniform(0, TAU))
        cr, sr = math.cos(rot), math.sin(rot); pts = []
        for t in np.linspace(0, TAU, 40, endpoint=False):
            f = 1 + wob * math.sin(2 * t + p1) + wob * .6 * math.sin(3 * t + p2); du, dv = A * math.cos(t) * f, Bb * math.sin(t) * f
            pts.append(self.P(u + du * cr - dv * sr, v + du * sr + dv * cr))
        self.polys.append(pts)
        if not self.draw: return pts
        e = self.e; e.patch('ln_water', pts, dz=.003, rings=3); c = self.P(u, v); self.claims.append(pts)
        e.water.append((c[0], c[1], A * self.s, Bb * self.s, self.a + rot)); self.water_area += poly_area(pts)
        if rocks:
            for k in range(0, 40, 3):
                if self.rng2.random() < .55:
                    x, y = pts[k]; X, Y = e.world(x, y); B('rockery', True).ico(X, Y, e.Z(x, y) + .002, float(self.rng2.uniform(.005, .01)), sz=1.4)
        return pts
    def rectpond(self, u, v, w, d, key='ln_water'):
        self.polys.append(self.rp(u, v, w, d))
        if not self.draw: return
        e = self.e; x, y = self.P(u, v); e.box(key, x, y, w * self.s, d * self.s, .003, self.a); self.claims.append(self.rp(u, v, w, d))
        e.wall_line('ln_curb', rect_pts(x, y, w * self.s + .006, d * self.s + .006, self.a), .004, .005, closed=True)
        e.water.append((x, y, w * self.s / 2, d * self.s / 2, self.a)); self.water_area += w * d * self.s ** 2
    def octpond(self, u, v, r):
        pts = [self.P(u + r * math.cos(t), v + r * math.sin(t)) for t in np.linspace(math.pi / 8, TAU + math.pi / 8, 8, endpoint=False)]; self.polys.append(pts)
        if not self.draw: return
        e = self.e; e.patch('ln_water', pts, dz=.003, rings=1); e.wall_line('ln_curb', pts, .006, .004, closed=True); self.claims.append(pts)
        c = self.P(u, v); e.water.append((c[0], c[1], r * self.s, r * self.s, 0)); self.water_area += poly_area(pts)
    def waterside(self, u, v, w, d, along=0.0):
        """水榭：伸进池里的石台 + 敞轩（卷棚顶，不带镬耳）。"""
        self.polys.append(self.rp(u, v, w, d, along))
        if not self.draw: return
        e = self.e; x, y = self.P(u, v); ang = self.a + along
        e.box('stone', x, y, w * self.s * 1.15, d * self.s * 1.25, .006, ang); z0 = e.house('ln_timber', x, y, w * self.s, d * self.s, .03, ang, ROOF_LN, ridge=d * self.s * .22)
        e.box('ln_ridge', x, y, w * self.s * .9, .004, .003, ang, dz=z0 + .03 + d * self.s * .22 - e.Z(x, y) - .002)
    def bridge(self, u0, v0, u1, v1, covered=False, zig=0):
        """石板桥 / 廊桥（covered：桥上一道灰绿瓦顶）/ 曲桥（zig 段数）。"""
        if not self.draw: return
        e = self.e; pts = [(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t) for t in np.linspace(0, 1, (zig or 1) + 1)]
        if zig:
            L = math.hypot(u1 - u0, v1 - v0); nx_, ny_ = -(v1 - v0) / max(L, 1e-6), (u1 - u0) / max(L, 1e-6)
            pts = [(p[0] + nx_ * (.02 if i % 2 else -.02) * (0 < i < zig), p[1] + ny_ * (.02 if i % 2 else -.02) * (0 < i < zig)) for i, p in enumerate(pts)]
        LP = [self.P(*p) for p in pts]; e.wall_line('ln_pave', LP, .018 if not covered else .022, .006, dz=.002)
        if covered:
            for (ax, ay), (bx, by) in zip(LP, LP[1:]):
                mx, my = (ax + bx) / 2, (ay + by) / 2; e.roof(mx, my, math.hypot(bx - ax, by - ay) + .01, .034, e.Z(mx, my) + .03, .01, math.atan2(by - ay, bx - ax), ROOF_LN)
    def rocks(self, u, v, rad, n, peak=False):
        if not self.draw: return
        e = self.e
        for _ in range(n):
            t = self.rng2.uniform(0, TAU); d = rad * math.sqrt(self.rng2.random()); x, y = self.P(u + math.cos(t) * d, v + math.sin(t) * d)
            X, Y = e.world(x, y); B('rockery', True).ico(X, Y, e.Z(x, y) + .002, float(self.rng2.uniform(.006, .014)), sz=float(self.rng2.uniform(3.0, 4.5)) if peak else 1.6)
    def wall(self, pts):
        if not self.draw: return
        L = [self.P(u, v) for u, v in pts]; self.e.wall_line('greybrick', L, .006, .018); self.e.tile_line(L, .009, .018, col=ROOF_LN, ht=.003)
    def tree(self, u, v, r, kind, fr=.3):
        if not self.draw: return
        x, y = self.P(u, v); self.e.plant(x, y, r, kind, .95, fr, pull=True)
    def grove(self, u, v, rad, n, kinds, rmin=.04, rmax=.055):
        if not self.draw: return
        for _ in range(n):
            t = self.rng2.uniform(0, TAU); d = rad * math.sqrt(self.rng2.random())
            self.tree(u + math.cos(t) * d, v + math.sin(t) * d, float(self.rng2.uniform(rmin, rmax)), kinds[int(self.rng2.integers(len(kinds)))])
    def banyan(self, u, v, r=.11):
        """村口大榕树：特大深色树冠 + 旁边两团小冠（气根成林）。"""
        if not self.draw: return
        self.tree(u, v, r, 'tree4', .6)
        for k in range(2): t = self.rng2.uniform(0, TAU); self.tree(u + math.cos(t) * r * .9, v + math.sin(t) * r * .9, r * .5, 'tree4', .3)
    def comb(self, u0, v0, ncol, nrow, along_v=False):
        """梳式小屋（陪衬）：ncol 条巷 × nrow 进；每栋长短、前后错开，屋前小天井，巷口种树。along_v：巷沿 u。"""
        x = u0
        for i in range(ncol):
            w = float(self.rng.uniform(.10, .13)); y = v0 + (.045 if i % 2 else 0) + float(self.rng.uniform(-.01, .01))   # 相邻两巷前后错开半进
            for j in range(nrow):
                d = float(self.rng.uniform(.075, .09)); ww = w * float(self.rng.uniform(.85, 1.0))
                self.house(x + w / 2, y + d / 2, ww, d, .04)
                self.pave(x + w / 2, y - .018, ww * .6, .03)                              # 屋前天井
                y += d + .045
            if i < ncol - 1:
                self.pave(x + w + .016, v0 + (y - v0) / 2 - .02, .024, y - v0, key='ln_lane')
                self.tree(x + w + .016, v0 - .05, .045, 'tree1')                           # 巷口的树
            x += w + .032
        return x
    # ---- 布局族 ----
    def fam_village(self, big):
        """村口：两进小祠堂 + 禾坪 + 半月塘 + 大榕树；一侧一列两栋梳式小屋；竹丛。"""
        self.house(0, .02, .13, .07, .045); self.pave(0, .085, .09, .05); self.house(0, .15, .14, .085, .052)
        for k in (-1, 1): self.house(k * .058, .085, .05, .022, .03, ears=False, along=math.pi / 2)
        self.pave(0, -.07, .18, .065, key='ln_hepin')
        self.halfmoon(0, -.105, .12 * big)
        ncol = int(self.e.plan[1]) if self.e.plan[:1] == 'c' else 1
        if ncol: self.comb(.11, -.02, 1, 2)
        self.banyan(-.17, -.2, .1)
        self.grove(-.16, .12, .05, 5, ('tree3', 'tree3', 'tree2')); self.grove(.05, .27, .06, 4, ('tree1', 'tree2'))
    def fam_ancestral(self, big):
        """大祠堂三进（头门—中堂—后寝，两个天井 + 两廊）+ 禾坪 + 半月塘；东侧两巷两进梳式屋；西侧园林：曲池 + 水榭 + 曲桥 + 三层阁。"""
        self.house(0, -.05, .16, .075, .048); self.house(0, .085, .17, .1, .06); self.house(0, .215, .16, .08, .052)
        for yy, dd in ((.0175, .06), (.15, .03)):
            self.pave(0, yy, .11, dd)
            for k in (-1, 1): self.house(k * .07, yy, dd + .01, .025, .032, ears=False, along=math.pi / 2)
        self.wall([(-.085, -.09), (-.085, .26)]); self.wall([(.085, -.09), (.085, .26)])
        self.pave(0, -.135, .24, .075, key='ln_hepin')                                        # 禾坪（小块、偏暗的麻石）
        self.halfmoon(0, -.175, .16 * big)
        self.comb(.13, -.02, 2, 1); self.grove(.2, .17, .05, 4, ('tree1', 'tree2'))
        self.banyan(-.22, -.25, .12); self.banyan(.24, -.24, .09)
        g = [(-.37 + .17 * math.cos(t) * (1 + .1 * math.sin(3 * t + .7)), .07 + .2 * math.sin(t) * (1 + .08 * math.sin(2 * t))) for t in np.linspace(0, TAU, 24, endpoint=False)]
        self.ground(g, wall=True, gate=12)
        self.pond(-.37, .04, .1 * big, .07 * big, .3); self.waterside(-.27, .02, .06, .045, math.pi / 2)
        self.bridge(-.45, .0, -.33, .1, zig=4); self.tower(-.38, .2, .07, 3); self.pav(-.46, .12, .022, 6)
        self.grove(-.3, -.07, .05, 4, ('tree3', 'tree3', 'tree2')); self.grove(-.46, .2, .04, 3, ('tree3', 'tree1'))
    def fam_tower(self, big):
        """可园：L 形连房围出园心草地（中间一座方亭 + 竹），转角一座四层可楼；园外东南一片曲岸湖（可湖）+ 水榭 + 曲桥；榕树。"""
        for u in (-.1, .04):
            self.house(u, .15, .13, .075, .045)
        self.house(-.2, .01, .13, .075, .045, along=math.pi / 2); self.house(-.2, -.12, .08, .06, .04, along=math.pi / 2)
        self.tower(-.2, .15, .085, 4)
        self.ground([(-.15, -.19), (.12, -.19), (.12, .1), (-.15, .1)])
        self.wall([(-.24, -.2), (.13, -.2), (.13, .11)])
        self.pav(-.02, -.04, .026, 4); self.grove(.06, .04, .04, 4, ('tree3', 'tree3', 'tree2'))
        self.pond(.2, -.25, .13 * big, .075 * big, -.4, .1); self.waterside(.09, -.25, .06, .04)
        self.bridge(.16, -.33, .27, -.18, zig=4); self.banyan(.25, .13, .1)
        self.grove(-.05, -.33, .06, 4, ('tree1', 'tree2', 'tree3'))
    def fam_boathall(self, big):
        """清晖园：一头长池 + 船厅（二层长屋，船头石台伸进池）+ 方亭 + 草堂；腰部一道廊桥；另一头三栋镬耳屋围一方天井，芭蕉竹丛。"""
        self.rectpond(-.24, -.01, .19 * big, .1 * big); self.house(-.24, .1, .17, .06, .06, ears=False, rg=.2)
        self.waterside(-.24, .04, .07, .035); self.pav(-.36, -.09, .024, 4); self.house(-.12, -.1, .08, .05, .04)
        self.bridge(-.11, .02, .11, .02, covered=True)
        self.house(.24, .1, .13, .07, .045); self.house(.16, -.04, .1, .06, .04, along=math.pi / 2); self.house(.32, -.04, .1, .06, .04, along=math.pi / 2)
        self.pave(.24, -.02, .1, .09)
        self.ground([(-.36, -.16), (-.12, -.16), (-.1, .15), (-.36, .15)])
        self.grove(-.12, .13, .03, 3, ('tree3', 'tree3')); self.grove(.24, -.14, .04, 4, ('tree3', 'tree2', 'tree5'))
        self.tree(.37, .12, .08, 'tree4', .5)
    def fam_rockery(self, big):
        """梁园：曲池里立几座湖石峰，北岸草堂（带镬耳）+ 前廊，东岸石山上一座六角亭，曲桥，西岸一栋小书斋；竹。"""
        self.ground([(.26 * math.cos(t) * (1 + .1 * math.sin(3 * t + 1.1)), .02 + .22 * math.sin(t) * (1 + .07 * math.sin(2 * t + .4))) for t in np.linspace(0, TAU, 20, endpoint=False)], wall=True, gate=15)
        self.pond(-.01, -.03, .14 * big, .09 * big, .2, .1, rocks=False)
        self.rocks(-.04, -.03, .06 * big, 6, peak=True); self.rocks(.05, -.06, .03, 3, peak=True)
        self.house(0, .13, .15, .08, .05); self.pave(0, .075, .12, .03)
        self.rocks(.17, .0, .05, 14); self.pav(.17, .0, .024, 6, dz=.012)
        self.bridge(-.12, -.1, .02, .06, zig=4); self.house(-.18, .02, .08, .05, .04, along=math.pi / 2)
        self.grove(-.16, -.13, .04, 4, ('tree3', 'tree3', 'tree2')); self.grove(.12, .15, .03, 2, ('tree3',))
        self.banyan(.02, -.26, .09)
    def fam_twinpond(self, big):
        """余荫山房：园墙内西方池、东八角池，中间一道廊桥（浣红跨绿）；八角池心八角水榭（玲珑水榭），方池北岸深柳堂（镬耳）；
        东北临池别馆；园外后面两栋梳式屋、园门口榕树。"""
        g = [(.27 * math.copysign(abs(math.cos(t)) ** .6, math.cos(t)), .03 + .2 * math.copysign(abs(math.sin(t)) ** .6, math.sin(t))) for t in np.linspace(0, TAU, 28, endpoint=False)]
        self.ground(g, wall=True, gate=21)
        self.rectpond(-.12, -.03, .15 * big, .13 * big); self.octpond(.12, -.04, .08 * big)
        self.pav(.12, -.04, .03, 8); self.bridge(-.04, -.03, .05, -.035, covered=True)
        self.house(-.12, .13, .15, .08, .05); self.house(.13, .12, .1, .07, .042)
        self.grove(-.2, -.15, .03, 3, ('tree3', 'tree3')); self.grove(.22, .1, .03, 2, ('tree1', 'tree3'))
        if self.e.plan[:1] == 'c' and int(self.e.plan[1]): self.comb(-.14, .3, int(self.e.plan[1]), 1)
        self.banyan(.0, -.3, .1)

# ---------------- 伊甸庄园（按 docs/eden-estate.md 的室外布局）----------------
def build_eden(isle, layer):
    """伊甸：约 680 × 548 m。府邸坐岛心偏前，正面朝 -y。前半法式（前庭花坛、双排林荫大道、方块丛林），后半英式（湖、树团、草坡），
    y ≈ .8 一道隐垣分开；两侧两块不同的下沉草坪（加建用地）；停靠平台直径 52 m。"""
    import eden_manor
    R = isle.R; e = isle
    my = .25                                                                                # 府邸中心（本地 y）
    eden_manor.build_eden_manor(layer, (*e.world(0, my), e.Z(0, my) + .002), e.rot, .01)
    e.claim(0, my, .62); e.bldg.append(rect_pts(0, my, 1.1, .5, 0)); e.claim_rect(0, my, 1.1, .5, 0)
    # 前庭：砾石广场 1.9 × .65 + 刺绣花坛左右各 3 × 2 格（每格约 24 × 26 m，含卷草纹）+ 中央大喷泉
    e.box('gravel', 0, -.42, 1.9, .65, .002)
    e.cyl('marble', 0, -.42, .085, .006, 40); e.disc('water_l', 0, -.42, .075, .075, dz=.006, seg=40); e.cyl('marble', 0, -.42, .014, .02, 16)
    for sx in (-1, 1):
        for i in range(3):
            for j in range(2): e.parterre(sx * (.28 + i * .26), -.28 - j * .28, .24, .26, 0, 3 if (i + j) % 2 == 0 else (i + 2 * j) % 3)
    e.claim_rect(0, -.42, 1.9, .65, 0)
    # 中轴：tapis vert（条纹草坪）+ 两侧砾石园路 + 双排林荫 + 雕像台座，直通停靠平台
    edge_y = -e.r(-math.pi / 2); y0, y1 = -.76, edge_y * .88; Ln = y0 - y1; ym = (y0 + y1) / 2
    for k in range(6): e.box('lawn2' if k % 2 else 'lawn', 0, y0 - Ln * (k + .5) / 6, .32, Ln / 6 * .98, .0022)
    for sx in (-1, 1):
        e.box('gravel', sx * .2, ym, .04, Ln, .002)
        for j in range(int(Ln / .09)):
            yy = y0 - .05 - j * .09
            if yy < y1 + .02: break
            for xx in (.27, .34): e.tree(sx * xx, yy, .042, 'tree2')
        for j in range(int(Ln / .16)): e.box('marble', sx * .228, y0 - .08 - j * .16, .01, .01, .018)
    e.claim_rect(0, ym, .76, Ln, 0)
    # 访客停靠平台：直径 52 m，白石 + 金环；平台边小亭；两台悬浮载具
    rad = .26; pc = (0, edge_y - rad * .35)
    e.wl += 1
    zs = e.Z(0, edge_y * .97)
    e.box('gravel', 0, (y1 + edge_y) / 2, .36, y1 - edge_y + .02, .002)                                   # 大道尽头到平台的砾石前场（白名单）
    e.cyl('marble', *pc, rad, .01, 64, dz=zs - e.Z(*pc) - .004); e.cyl('gold', *pc, rad * 1.035, .006, 64, dz=zs - e.Z(*pc) - .006)
    e.cyl('stone', *pc, rad * .55, .002, 48, dz=zs - e.Z(*pc) + .006)
    e.cyl('marble', pc[0], pc[1] + rad * .55, .03, .015, 12, dz=zs - e.Z(*pc)); e.cyl('gold', pc[0], pc[1] + rad * .55, .032, .004, 12, dz=zs - e.Z(*pc) + .015)
    for sx in (-1, 1): e.hover(pc[0] + sx * rad * .4, pc[1] - rad * .1, zs + .006, .07, math.pi / 2)
    e.wl -= 1
    e.dock = (pc[0], pc[1], rad, -math.pi / 2); e.claim(*pc, rad + .03)
    # 后庭：花园厅台阶直接下来的连续白石台地 + 人工湖（不规则）+ 湖心圆亭 + 水榭
    e.box('marble', 0, .64, .5, .2, .004); e.wall_line('marble', [(-.25, .74), (.25, .74)], .008, .012); e.claim_rect(0, .64, .5, .2, 0)
    lc = (.1, 1.25)
    for j, (dx, dy, A, Bb, t) in enumerate(((0, 0, .55, .26, .1), (-.4, .12, .3, .18, -.4), (.42, -.06, .28, .16, .5), (.1, .2, .25, .14, 0))):
        e.disc('water', lc[0] + dx, lc[1] + dy, A, Bb, t, dz=.003 + .0004 * j, seg=64)
    e.water.append((lc[0], lc[1], .8, .34, 0))
    e.cyl('stone', lc[0] + .05, lc[1] + .02, .05, .004, 24, dz=.003); e.cyl('marble', lc[0] + .05, lc[1] + .02, .028, .015, 16, dz=.007); e.cyl('marble', lc[0] + .05, lc[1] + .02, .03, .01, 16, dz=.022, r2=.004)
    e.box('stone', .62, 1.18, .16, .10, .012); e.cyl('marble', .62, 1.18, .05, .06, 8, dz=.012); e.cyl('roof_lead', .62, 1.18, .07, .02, 8, dz=.072, r2=.01)   # J 水榭（石台 + 敞亭）
    # 隐垣（ha-ha）：y ≈ .8 一道下沉石墙 + 阴影线，东西横贯，分开法式前半与英式后半
    hp = [(x, .82 + .05 * (x / 1.25) ** 2) for x in np.linspace(-1.25, 1.25, 26)]
    e.wall_line('stone', hp, .006, .006, dz=-.006); e.wall_line('dark', [(x, y + .007) for x, y in hp], .005, .0015)
    # 两侧加建用地：两种不同的下沉草坪（boulingrin），草色与岛面明度差 ≤ 8 %，十字路为砾石
    cx_, cy_, w, d = -1.75, .15, 1.05, .95                                                   # 西：方形，花境 + 坡面 + 中央水池 + 四角小丛林
    e.wall_line('hedge', rect_pts(cx_, cy_, w, d, 0), .012, .01, closed=True)
    for bw_, key, hh in ((w - .03, 'flowers', .0022), (w - .11, 'lawn_e2', .0025), (w - .19, 'lawn_e', .0028)): e.box(key, cx_, cy_, bw_, bw_ * d / w, hh)
    e.box('gravel', cx_, cy_, w - .19, .06, .0031); e.box('gravel', cx_, cy_, .06, d - .19, .0031)   # 宽砾石十字园路（四分园），不是细线十字
    for sx in (-1, 1):
        for sy in (-1, 1): e.box('flowers', cx_ + sx * (w - .19) / 4 + sx * .015, cy_ + sy * (d - .19) / 4 + sy * .015, (w - .19) / 2 - .09, (d - .19) / 2 - .09, .0032)
    e.cyl('marble', cx_, cy_, .085, .004, 32); e.disc('water_l', cx_, cy_, .075, .075, dz=.0045, seg=32)
    for dx in (-1, 1):
        for dy in (-1, 1):
            for i in range(2):
                for j in range(2): e.tree(cx_ + dx * (w / 2 - .06 - i * .07), cy_ + dy * (d / 2 - .06 - j * .07), .04, 'tree2')
    e.claim_rect(cx_, cy_, w, d, 0)
    cx_ = 1.75                                                                              # 东：椭圆，gazon coupé（草坪里切出砾石卷草纹）+ 中心雕像 + 四角树团
    e.wall_line('hedge', ell_pts(cx_, cy_, .5, .45, 0, 40), .012, .01, closed=True)
    e.disc('flowers', cx_, cy_, .48, .43, dz=.0022, seg=64); e.disc('lawn_e2', cx_, cy_, .44, .39, dz=.0024, seg=64); e.disc('lawn_e', cx_, cy_, .39, .34, dz=.0026, seg=64)
    # B2 第 3 轮：原来 4 条同向弯折的砾石臂（只有 90° 旋转对称）→ 镜像对称的圆形花园；再按合规审阅去掉「环 + 贯穿十字 + 中心点」的准星读法：
    # 外砾石环 + 四条只连外环与绿篱的短轴路（不穿圆心）+ 中心实心花床（直径为外环的 ~55 %）+ 喷泉池；45° 方向不放任何点状物
    for sx in (-1, 1): e.disc('flowers', cx_ + sx * .13, cy_, .15, .2, dz=.0027, seg=40)      # 左右两片镜像的椭圆花床（不留十字、刻度、同心细环：避免准星 / 靶心读法）
    e.cyl('marble', cx_, cy_, .012, .02, 12)                                                 # 中央雕像
    for dx in (-1, 1):
        for dy in (-1, 1):
            for k in range(3): e.tree(cx_ + dx * (.46 + .05 * (k % 2)), cy_ + dy * (.41 + .05 * (k // 2)), .045, 'tree6')
    e.claim_rect(cx_, cy_, 1.05, .95, 0)
    # 东北：围墙花园 + 橘园；西北：服务区（docs/eden-estate.md §2.2 E–H）
    kg = (1.45, 1.35); e.wall_line('brick', rect_pts(kg[0], kg[1], .7, .5, 0), .006, .01, closed=True)
    for i in range(6):
        for j in range(4): e.box('beds' if (i + j) % 2 else 'flowers', kg[0] - .29 + i * .116, kg[1] - .18 + j * .12, .1, .1, .002)
    e.box('stone', kg[0], kg[1] + .22, .48, .1, .07); e.box('glass', kg[0], kg[1] + .21, .44, .09, .002, dz=.07)   # 橘园：石柱 + 玻璃屋（48 × 10 × 7 m）
    e.claim_rect(*kg, .7, .5, 0)
    e.house('stone', -1.5, 1.18, .44, .14, .09, 0, ROOF_SLATE, ridge=.04)                            # E 仆役楼（2 层 + 阁楼）
    e.house('stone', -1.5, 1.42, .40, .10, .05, 0, ROOF_SLATE, ridge=.03)                            # F 马车房 / 马厩
    e.house('stone', -1.7, 1.30, .08, .30, .04, 0, (.3, .31, .33), ridge=.015)                       # G 工坊
    e.box('pad', -1.05, 1.30, .30, .26, .003); X, Y = e.world(-1.05, 1.3); B('car', True).ico(X, Y, e.Z(-1.05, 1.3) + .012, .03, sz=.4)
    e.house('dark', -1.07, 1.55, .30, .20, .09, 0, (.22, .23, .25), ridge=.03)                       # H 机库（30 × 20 × 9 m）
    e.claim(-1.4, 1.35, .5)
    # 帕拉第奥五段式的两端：C 图书馆塔亭（西）、D 音乐厅亭（东），各有一段爱奥尼亚柱廊连到两翼
    e.house('marble', -.9, .25, .24, .24, .10, 0, ROOF_SLATE, ridge=.03)
    e.cyl('marble', -.9, .25, .06, .28, 8); e.cyl('roof_lead', -.9, .25, .065, .04, 8, dz=.28, r2=.01); X, Y = e.world(-.9, .25); B('gold', True).ico(X, Y, e.Z(-.9, .25) + .33, .012, sub=2)
    e.house('marble', .9, .25, .24, .32, .11, 0, ROOF_SLATE, ridge=.05); e.cyl('marble', .9, .41, .08, .09, 24)
    for sx in (-1, 1):
        e.box('marble', sx * .66, .25, .24, .06, .003)
        for k in range(8): e.cyl('marble', sx * (.555 + k * .03), .22, .004, .055, 8)
        e.box('roof_lead', sx * .66, .25, .24, .06, .006, dz=.055)
    e.claim(-.9, .25, .2); e.claim(.9, .25, .22); e.claim(-.66, .25, .06); e.claim(.66, .25, .06)
    # 玫瑰园（东前）、迷园（西前）：移到前庭花坛外侧；果园（东北，梅花形）
    rc = (1.28, -.74)
    e.disc('flowers', rc[0], rc[1], .24, .24, dz=.0022, seg=64)                                 # 玫瑰园：整片花床 + 外圈花架（不再有 8 辐、也不做同心细环）
    for k in range(40): t = k / 40 * TAU; e.disc('flowers', rc[0] + math.cos(t) * .18, rc[1] + math.sin(t) * .18, .016, .016, dz=.003, seg=10)
    for k in range(24): t = k / 24 * TAU; e.box('dark', rc[0] + math.cos(t) * .235, rc[1] + math.sin(t) * .235, .004, .004, .02, t)
    e.cyl('dark', rc[0], rc[1], .02, .02, 8); e.claim(*rc, .27)
    mc = (-1.28, -.74)
    for k, rr in enumerate((.22, .17, .12, .07)):
        gap = k * 1.3; pts = [(mc[0] + math.cos(t) * rr, mc[1] + math.sin(t) * rr) for t in np.linspace(gap + .35, gap + TAU - .1, 48)]
        e.wall_line('hedge', pts, .012, .014)
    e.cyl('stone', *mc, .012, .012, 12); e.claim(*mc, .25)
    oc = (2.15, 1.05)
    for i in range(-2, 3):
        for j in range(-2, 3):
            px, py = oc[0] + i * .1 + (.05 if j % 2 else 0), oc[1] + j * .09
            if e.inside(px, py, .9): e.tree(px, py, .042, 'tree5' if (i + j) % 3 == 0 else 'tree2')
    e.claim(*oc, .28)
    # 观景台：后轴 0.97·r(π/2) 一座半圆台 + 小圆亭；东西各一座小圆亭（白名单：在岸边）
    e.wl += 1; e.belvederes = []
    for t, r_ in ((math.pi / 2, .1), (0, .045), (math.pi, .045)):
        px, py = math.cos(t) * e.r(t) * .97, math.sin(t) * e.r(t) * .97
        e.cyl('marble', px, py, r_, .004, 24); e.cyl('marble', px, py, r_ * .4, .05, 8); e.cyl('roof_lead', px, py, r_ * .5, .015, 8, dz=.05, r2=.004); e.claim(px, py, r_ + .04)
        e.belvederes.append((px, py))
    e.wl -= 1
    # 结界锚碑 ×4：按 0.82·r(t) 取点（方尖碑，碑顶嵌以太晶）；与别的部件冲突时沿轮廓挪开
    e.anchors = []
    for t0 in (.45, math.pi - .45, math.pi + .45, TAU - .45):
        for dt in (0, .08, -.08, .16, -.16, .24, -.24, .32, -.32, .4, -.4):
            t = t0 + dt; px, py = math.cos(t) * e.r(t) * .82, math.sin(t) * e.r(t) * .82
            if e.free(px, py, .05, .9): break
        e.box('stone', px, py, .03, .03, .01); e.cyl('marble', px, py, .012, .09, 4, dz=.01, r2=.003)
        X, Y = e.world(px, py); B('aether', True).ico(X, Y, e.Z(px, py) + .105, .008, sz=1.6, sub=1); e.claim(px, py, .06); e.anchors.append((px, py))
    # 前半：两侧方块丛林（每侧 2 列 × 3 排），块间直园路
    for sx in (-1, 1):
        for xa, xb in ((.44, .80), (.88, 1.24), (1.32, 1.68), (1.76, 2.12)):
            for ya, yb in ((-.98, -1.38), (-1.46, -1.86), (-1.94, -2.3)):
                e.bosquet(sx * (xa + xb) / 2, (ya + yb) / 2, xb - xa, yb - ya if yb > ya else ya - yb, 0, sp=.09)
        e.box('gravel', sx * .84, -1.525, .035, 1.15, .002)
    # 后半：布朗式——5–8 个大树团 + 草坡上的孤植大树
    nclump = 0
    for t, f in ((.3, .74), (.72, .7), (1.2, .74), (1.42, .8), (1.78, .76), (2.05, .74), (2.45, .7), (2.85, .74)):   # 后半的开阔草坡上（按轮廓取点）
        cx, cy = math.cos(t) * e.r(t) * f, math.sin(t) * e.r(t) * f
        n0 = len(e.crowns)
        for _ in range(int(R.integers(22, 34))):
            e.plant(cx + R.normal(0, .12), cy + R.normal(0, .09), float(R.uniform(.05, .08)), ('tree1', 'tree1', 'tree2', 'tree6')[int(R.integers(4))], .9, .35)
        if len(e.crowns) - n0 >= 8: nclump += 1; e.claim(cx, cy, .12)
    e.clumps = nclump
    for _ in range(60):
        p = e.spot(.06, smax=.8)
        if p and p[1] > .9: e.tree(p[0], p[1], float(R.uniform(.08, .1)), 'tree1'); e.claim(p[0], p[1], .08)
    # 外圈林带（前轴与停靠平台前留空）
    for t in np.linspace(0, TAU, 380, endpoint=False):
        s = R.uniform(.84, .95); lx, ly = math.cos(t) * s * e.r(t), math.sin(t) * s * e.r(t)
        if abs(lx) < .5 and ly < 0: continue
        e.plant(lx, ly, float(R.uniform(.045, .07)), 'tree1' if R.random() < .6 else 'tree6', .98, .5)
    # 岛缘石栏（整圈，白名单）
    e.wl += 1
    pts = e.outline(.975, 240); i = 0                                                      # B2 第 3 轮：栏杆压暗（.70/.69/.65），每 40–60 m 断开一次（不再是一整圈白描边）
    while i < len(pts):
        seg = pts[i:i + int(R.integers(5, 8))]; i += len(seg) + 1
        if len(seg) > 1: e.wall_line('marble_d', seg, .01, .014)
        e.box('marble_d', seg[0][0], seg[0][1], .018, .018, .022)
    e.wl -= 1

def build_silver_crown(isle):
    """银冠堡：议会骑士团总部。沿真实轮廓的城墙与塔楼、主堡、校场与停机坪；岸外停靠平台朝伊甸。"""
    e = isle; pts = e.outline(.9, 64)
    e.wl += 1
    e.wall_line('stone', pts, .05, .09, closed=True)
    for i in range(0, 64, 8): e.cyl('stone', pts[i][0], pts[i][1], .07, .2, 16); e.cyl('dark', pts[i][0], pts[i][1], .08, .08, 16, dz=.2, r2=.004)
    e.wl -= 1
    e.box('stone', 0, 0, .5, .35, .25); e.cyl('stone', 0, 0, .12, .2, 24, dz=.25); e.cyl('dark', 0, 0, .13, .12, 24, dz=.45, r2=.01)
    e.box('gravel', -.45, .25, .5, .3, .003); e.box('pad', .55, -.2, .35, .2, .006)
    for k in range(3): X, Y = e.world(.45 + k * .1, -.2); B('car', True).ico(X, Y, e.Z(.5, -.2) + .015, .03, sz=.4)
    e.claim(0, 0, .6); e.claim(.55, -.2, .22); e.claim(-.45, .25, .3)
    e.make_dock(.12, HUB)

# ---------------- 航线：只连岸外停靠平台，在岛外寻路 ----------------
class RouteGrid:
    """所有岛的「离岸距离」栅格（沿径向，单位 = 100 m）；A* 在外扩 buf 的障碍外寻路，拉直后拐点都在岛外。"""
    def __init__(self, isles, cell=.08):
        self.x0, self.y0, self.cell = -W * .55, -H * .55, cell
        self.nx, self.ny = int(W * 1.1 / cell) + 1, int(H * 1.1 / cell) + 1
        GX, GY = np.meshgrid(self.x0 + np.arange(self.nx) * cell, self.y0 + np.arange(self.ny) * cell)
        d = np.full(GX.shape, 99.0)
        for e in isles:
            c, s = math.cos(-e.rot), math.sin(-e.rot); dx, dy = GX - e.x, GY - e.y; lx, ly = dx * c - dy * s, dx * s + dy * c
            d = np.minimum(d, np.hypot(lx, ly) - e.r_np(np.arctan2(ly, lx)))
        self.dout = d; self.isles = isles
    def idx(self, x, y): return int(round((y - self.y0) / self.cell)), int(round((x - self.x0) / self.cell))
    def xy(self, j, i): return self.x0 + i * self.cell, self.y0 + j * self.cell
    def path(self, A, Bp):
        for buf in (.4, .3, .22, .15):
            blk = self.dout < buf
            for (x, y) in (A, Bp):                                                          # 端点（停靠平台）附近的岛外格子放行
                j, i = self.idx(x, y); r = int(.55 / self.cell) + 1
                jj, ii = np.mgrid[max(0, j - r):min(self.ny, j + r + 1), max(0, i - r):min(self.nx, i + r + 1)]
                m = ((jj - j) ** 2 + (ii - i) ** 2 <= r * r) & (self.dout[jj, ii] > .025)
                blk[jj[m], ii[m]] = False
            p = self._astar(blk, self.idx(*A), self.idx(*Bp))
            if p is None: continue
            pts = [A] + [self.xy(*q) for q in p[1:-1]] + [Bp]
            pts = self._pull(pts, blk); sm = chaikin(pts, 2)
            return sm if self._clear(sm, blk) else pts
        return [A, Bp]
    def _astar(self, blk, s, t):
        ny, nx = blk.shape; B_ = blk.ravel().tolist(); pen = np.clip((.6 - self.dout) * 4, 0, 3).ravel().tolist()
        S, T = s[0] * nx + s[1], t[0] * nx + t[1]; tj, ti = t
        g = {S: 0.0}; came = {}; h = lambda k: math.hypot(k // nx - tj, k % nx - ti)
        pq = [(h(S), S)]; nb = [(-1, 0, 1), (1, 0, 1), (0, -1, 1), (0, 1, 1), (-1, -1, 1.414), (-1, 1, 1.414), (1, -1, 1.414), (1, 1, 1.414)]
        while pq:
            f, k = heapq.heappop(pq)
            if k == T:
                out = [k]
                while k in came: k = came[k]; out.append(k)
                return [(q // nx, q % nx) for q in out[::-1]]
            j, i = divmod(k, nx); gk = g[k]
            for dj, di, w in nb:
                jj, ii = j + dj, i + di
                if not (0 <= jj < ny and 0 <= ii < nx): continue
                kk = jj * nx + ii
                if B_[kk] and kk != T: continue
                ng = gk + w * (1 + pen[kk])
                if ng < g.get(kk, 1e18): g[kk] = ng; came[kk] = k; heapq.heappush(pq, (ng + h(kk), kk))
        return None
    def _seg_ok(self, a, b, blk):
        n = max(2, int(math.hypot(b[0] - a[0], b[1] - a[1]) / (self.cell * .4)))
        for t in np.linspace(0, 1, n):
            j, i = self.idx(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            if 0 <= j < blk.shape[0] and 0 <= i < blk.shape[1] and blk[j, i]: return False
        return True
    def _pull(self, pts, blk):
        out, i = [pts[0]], 0
        while i < len(pts) - 1:
            j = len(pts) - 1
            while j > i + 1 and not self._seg_ok(pts[i], pts[j], blk): j -= 1
            out.append(pts[j]); i = j
        return out
    def _clear(self, pts, blk): return all(self._seg_ok(a, b, blk) for a, b in zip(pts, pts[1:]))

def routes(isles, norm):
    """航线（本机画成可开关的叠加层）：
    lane —— 有停靠平台的地标岛 ↔ 伊甸 / 银冠堡，端点是岸外平台中心，在各岛外扩 40 m 的障碍外寻路（放不下时逐步收到 15 m）；
    patrol —— 银冠堡巡逻环；patrol_city —— 骑士团巡空大环线，经过各地标岛平台（或岸）外 70 m 的航点。归一化坐标，左上原点。"""
    by = {e.id: e for e in isles}; eden, sc = by.get('eden'), by.get('silver_crown')
    G = RouteGrid(isles); out = []
    hubs = [h for h in (eden, sc) if h is not None and h.dock]
    for e in isles:
        if e.dock is None or e in hubs: continue
        for he in hubs:
            pts = G.path(e.world(*e.dock[:2]), he.world(*he.dock[:2]))
            out.append({'kind': 'lane', 'from': e.id, 'to': he.id, 'pts': pts})
    if sc:
        ring = [(sc.x + math.cos(t) * 2.5, sc.y + math.sin(t) * 1.8) for t in np.linspace(0, TAU, 33)]
        out.append({'kind': 'patrol', 'from': 'silver_crown', 'to': 'silver_crown', 'pts': ring})
        loop = [e for e in (sc, by.get('isle29'), by.get('isle6'), by.get('isle30'), eden, by.get('isle9')) if e]
        cx, cy = sum(e.x for e in loop) / len(loop), sum(e.y for e in loop) / len(loop)
        wps = []
        for e in loop:
            th = e.dock[3] if e.dock else math.atan2(*e.local(cx, cy)[::-1])
            wps.append(e.world(math.cos(th) * (e.r(th) + (e.dock[2] * 1.35 if e.dock else 0) + .7), math.sin(th) * (e.r(th) + (e.dock[2] * 1.35 if e.dock else 0) + .7)))
        wps.append(wps[0]); pts = []
        for a_, b_ in zip(wps, wps[1:]): pts += G.path(a_, b_)[:-1]
        pts.append(wps[-1])
        out.append({'kind': 'patrol_city', 'from': 'silver_crown', 'to': 'silver_crown', 'pts': pts})
    for r in out: r['world'] = [(float(x), float(y)) for x, y in r['pts']]; r['pts'] = [[round(a, 4), round(b, 4)] for a, b in (norm((x, y, 3)) for x, y in r['pts'])]
    return out
