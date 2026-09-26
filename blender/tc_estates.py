# 天城 · 上层浮岛与庄园（tiancheng_upper.py 调用）。设计与自评见 docs/upper-estates.md。
# 目标（用户：「每个岛都长一个样，这很致命」）：
#   轮廓 —— 按岛 id 定种子的极坐标轮廓：椭圆 × 几个谐波（海岬、内湾）；少数长条、双峰（葫芦形）岛。
#   地形 —— 岛心留给园子（平缓），外圈起伏；按风格与岛随机加台地（主楼坐在台地上）、湖（可能带瀑布出水口）、裸岩峰。
#            坡度大的地方自动露岩（材质按法线），所以台地边、崖边一眼能看出。
#   岛缘 —— 崖边（外圈下塌露岩）/ 石墙 / 绿篱林带 / 垂根（岛缘外挂一圈深色藤根），不再是统一的浅色描边圈。
#   园林 —— 英式风景园（蛇形湖、成团的树、围墙菜园、马厩院、神庙小品）、法式规整园（刺绣花坛、大水渠、丛林块、橘园）、
#            苏州园林（不规则白墙围合、池、假山、曲桥、亭廊、竹林、茶垄）、岭南园林（青砖院落群、方池水榭、大榕树、荔枝林），
#            主楼位置、朝向、平面（L / H / E / 回字）和附属建筑（温室、马厩 / 机库、仆役楼、亭）的数量都随岛变化。
# 坐标：岛的「本地」坐标以岛心为原点、沿岛的 rot 转；1 单位 = 100 m。所有几何按材料合批（tc.Batch），最后统一生成。
import bpy, bmesh, math, hashlib, numpy as np
import tc_common as tc
from tc_common import W, H, tick
from mathutils import Matrix

def seed_of(s): return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)
def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0))) if e1 != e0 else float(x >= e0); return t * t * (3 - 2 * t)

# ---------------- 材料 ----------------
GRASS = {   # 岛面草色（暗, 亮）：英式深绿草场、法式修剪浅绿、苏州偏黄绿、岭南浓荫深绿、伊甸明绿、银冠堡干草
    'english': ((.055, .12, .03), (.12, .21, .055)), 'chateau': ((.15, .26, .075), (.23, .34, .11)),
    'suzhou': ((.12, .16, .065), (.19, .24, .10)), 'lingnan': ((.045, .10, .03), (.09, .16, .045)),
    'neoclassical': ((.13, .25, .075), (.21, .33, .11)), 'fortress': ((.17, .19, .11), (.25, .26, .17)),
}
_M = {}
def mats():
    if 'rock_under' in _M: return _M
    m, nm = tc.mat, tc.noise_mat
    _M.update({
        'rock_under': nm('rock_under', (.20, .18, .16), (.36, .32, .28), 14, .95, .7),   # 岛底岩体（名字以 rock 开头：云海里不投影）
        'stone_warm': nm('st_warm', (.52, .46, .36), (.62, .56, .46), 60, .8, .15),     # 英式蜂蜜色石
        'marble': nm('st_marble', (.78, .77, .73), (.86, .85, .81), 50, .6, .05),       # 法式白石
        'whitewall': m('st_whitewall', (.80, .79, .76), .7),                              # 苏州粉墙
        'greybrick': nm('st_greybrick', (.30, .30, .30), (.38, .37, .36), 150, .85, .1),  # 岭南青砖
        'brick': nm('st_brick', (.36, .17, .12), (.44, .22, .15), 120, .85, .1),           # 围墙菜园的红砖墙
        'stone': nm('st_stone', (.42, .41, .40), (.56, .55, .52), 30, .8, .2),
        'gravel': nm('gr_gravel', (.58, .55, .48), (.68, .65, .58), 300, .9, .1),
        'path': m('gr_path', (.66, .62, .54), .7),
        'lawn': nm('gr_lawn', (.20, .34, .11), (.27, .41, .15), 90, .85, .05),          # 修剪草坪（比岛面亮）
        'lawn2': nm('gr_lawn2', (.16, .30, .09), (.22, .36, .12), 90, .85, .05),        # 条纹割草的另一色
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
        'car': m('bl_car', (.10, .11, .14), .2, metal=.8),
        'roof_lead': m('bl_roof_lead', (.40, .42, .45), .5, metal=.3),
        'aether': tc.emit_mat('bl_aether', (.45, .9, 1.0), 4.0),                                    # 以太晶簇（自发光青）
        'tree1': m('tr_oak', (.05, .12, .04), .9), 'tree2': m('tr_lime', (.085, .17, .05), .9),
        'tree3': m('tr_bamboo', (.13, .23, .07), .9), 'tree4': m('tr_banyan', (.03, .085, .03), .9),
        'tree5': m('tr_blossom', (.52, .36, .40), .9), 'tree6': m('tr_conifer', (.03, .08, .045), .9),
    })
    return _M

def top_mat(style):
    """岛面：两色噪声草地 × 每座岛的随机明暗 / 色偏（Object Info · Random）；坡度大的地方露岩（按法线 z）。"""
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
    oi = N.new('ShaderNodeObjectInfo')                                                     # 每座岛：明度 ±15%、色相微偏
    hsv = N.new('ShaderNodeHueSaturation'); L.new(ramp.outputs['Color'], hsv.inputs['Color'])
    hu = N.new('ShaderNodeMapRange'); hu.inputs['To Min'].default_value = .47; hu.inputs['To Max'].default_value = .53; L.new(oi.outputs['Random'], hu.inputs['Value']); L.new(hu.outputs['Result'], hsv.inputs['Hue'])
    va = N.new('ShaderNodeMapRange'); va.inputs['To Min'].default_value = .85; va.inputs['To Max'].default_value = 1.15; L.new(oi.outputs['Random'], va.inputs['Value']); L.new(va.outputs['Result'], hsv.inputs['Value'])
    rock = N.new('ShaderNodeValToRGB'); rock.color_ramp.elements[0].color = (.26, .24, .21, 1); rock.color_ramp.elements[1].color = (.46, .43, .39, 1)
    L.new(nz2.outputs['Fac'], rock.inputs['Fac'])
    geo = N.new('ShaderNodeNewGeometry'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], sep.inputs['Vector'])
    sl = N.new('ShaderNodeMapRange'); sl.inputs['From Min'].default_value = .93; sl.inputs['From Max'].default_value = .975; L.new(sep.outputs['Z'], sl.inputs['Value'])
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
    for k, pts in TREES.items(): tc.ico_mesh('up_' + k, pts, mats()[k])
    if ROOFS:
        import tc_detail as td
        td.prism_mesh('up_roofs', ROOFS, ROOFC, tc.vcol_mat('up_roofs_v', .7))
    n = sum(len(v) for v in TREES.values()); _BAT.clear(); TREES.clear(); ROOFS.clear(); ROOFC.clear(); return n

ROOF_SLATE, ROOF_MANSARD, ROOF_TILE, ROOF_REDTILE = (.20, .21, .23), (.15, .17, .22), (.11, .11, .12), (.34, .16, .11)

# ---------------- 一座岛 ----------------
class Isle:
    def __init__(self, d, style=None):
        self.d, self.id = d, d['id']; self.x, self.y, self.z = d['x'], d['y'], d['z']; self.rx, self.ry, self.rot = d['rx'], d['ry'], d.get('rot', 0.0)
        self.style = style or d.get('estate_style', 'english'); self.R = np.random.default_rng(seed_of(self.id))
        R = self.R
        self.shape = d.get('shape') or (('round', 'cape', 'long', 'twin')[int(R.choice(4, p=[.4, .35, .15, .1]))] if self.style not in ('neoclassical', 'fortress') else 'cape')
        k0 = {'round': (2, 5), 'cape': (3, 7), 'long': (2, 5), 'twin': (2, 4)}[self.shape]
        self.harm = [(int(k), float(R.uniform(.03, .09 if self.shape != 'cape' else .13)), float(R.uniform(0, 2 * math.pi))) for k in R.integers(k0[0], k0[1] + 1, 4)]
        if self.style in ('neoclassical', 'fortress'): self.harm = [(k, a * .45, p) for k, a, p in self.harm]   # 伊甸、银冠堡：轮廓更稳重
        self.harm.append((int(R.integers(9, 14)), float(R.uniform(.012, .025)), float(R.uniform(0, 2 * math.pi))))   # 细碎的岸线
        if self.shape == 'long': self.ex, self.ey = 1.25, .72
        else: self.ex, self.ey = 1.0, 1.0
        self.F = min(self.rx, self.ry)                                                      # 岛的「尺度」：园子与建筑按它缩放
        self.rim = d.get('rim') or self._pick(dict(english=('cliff', 'hedge', 'roots'), chateau=('wall', 'wall', 'cliff'), suzhou=('roots', 'cliff', 'wall'),
                                                   lingnan=('roots', 'hedge', 'cliff'), neoclassical=('wall',), fortress=('cliff',))[self.style])
        self.terrain = d.get('terrain') or self._pick(dict(english=('meadow', 'lake', 'terrace', 'crag'), chateau=('terrace', 'meadow', 'terrace'), suzhou=('lake', 'crag', 'lake'),
                                                           lingnan=('meadow', 'crag', 'lake'), neoclassical=('meadow',), fortress=('crag',))[self.style])
        self.spots, self.occ, self.pads = [], [], []                                        # pads：停靠平台（本地坐标，导出航线用）                                                       # 地形点（台地 / 凸起 / 凹地）、占地圆
        self.noise = [(float(R.uniform(2, 6)) / max(self.F, .25), float(R.uniform(0, math.pi)), float(R.uniform(0, 6.3)), float(R.uniform(.4, 1))) for _ in range(4)]
        self.water = []                                                                     # 湖面（本地）：(cx, cy, a, b, 角) —— 园子避开
    def _pick(self, opts): return opts[int(self.R.integers(len(opts)))]
    # 轮廓：极坐标半径（本地角度）
    def r(self, th):
        c, s = math.cos(th), math.sin(th)
        base = 1 / math.sqrt((c / (self.rx * self.ex)) ** 2 + (s / (self.ry * self.ey)) ** 2)
        f = 1 + sum(a * math.sin(k * th + p) for k, a, p in self.harm)
        if self.shape == 'twin': f *= .62 + .42 * abs(c) ** .7                              # 葫芦形：上下收腰
        return base * f
    def inside(self, lx, ly, s=1.0): return math.hypot(lx, ly) <= s * self.r(math.atan2(ly, lx))
    def sfrac(self, lx, ly): return math.hypot(lx, ly) / max(1e-6, self.r(math.atan2(ly, lx)))
    def world(self, lx, ly):
        c, s = math.cos(self.rot), math.sin(self.rot); return self.x + lx * c - ly * s, self.y + lx * s + ly * c
    # 地形高度（相对岛面基准 z）
    def h(self, lx, ly):
        s = self.sfrac(lx, ly); th = math.atan2(ly, lx)
        n = sum(a * math.sin(f * (lx * math.cos(p) + ly * math.sin(p)) + ph) for f, p, ph, a in self.noise) / 2.6
        amp = .003 + .012 * smooth(.55, .95, s) * self.F                                    # 园子（岛心）平，外圈起伏
        v = n * amp
        for kind, cx, cy, rr, hh in self.spots:
            dd = math.hypot(lx - cx, ly - cy)
            if kind == 'plateau': v += hh * smooth(rr + .035 * max(self.F, .4), rr, dd)
            elif kind == 'bump': v += hh * math.exp(-(dd / rr) ** 2)
            elif kind == 'dip': v -= hh * smooth(rr, rr * .6, dd)
        if self.rim == 'cliff': v -= (.05 + .05 * self.F) * smooth(.88, 1.0, s) ** 1.6 * (1 + .4 * math.sin(5 * th + 1.3))
        else: v -= .012 * smooth(.95, 1.0, s)
        return v
    def Z(self, lx, ly): return self.z + self.h(lx, ly)
    # 占地：园子里的东西互相避开
    def free(self, lx, ly, rr, smax=.82):
        if self.sfrac(lx, ly) + rr / max(self.F, .1) * .6 > smax: return False
        if any(math.hypot(lx - a, ly - b) < rr + c for a, b, c in self.occ): return False
        if any(((lx - a) / (A + rr)) ** 2 + ((ly - b) / (Bb + rr)) ** 2 < 1 for a, b, A, Bb, _ in self.water): return False
        return True
    def claim(self, lx, ly, rr): self.occ.append((lx, ly, rr))
    def spot(self, rr, smax=.8, tries=60, near=None):
        """找一个空位（本地坐标）；near=(x, y, 半径) 时只在附近找。"""
        for _ in range(tries):
            if near: a = self.R.uniform(0, 2 * math.pi); d = near[2] * math.sqrt(self.R.random()); lx, ly = near[0] + math.cos(a) * d, near[1] + math.sin(a) * d
            else:
                a = self.R.uniform(0, 2 * math.pi); d = math.sqrt(self.R.random()) * smax; lx, ly = math.cos(a) * d * self.r(a), math.sin(a) * d * self.r(a)
            if self.free(lx, ly, rr, smax): return lx, ly
        return None
    # ---- 放东西（本地坐标 → 世界；z 贴地形）----
    def box(self, key, lx, ly, w, d, h, a=0.0, dz=0.0):
        X, Y = self.world(lx, ly); B(key).box(X, Y, self.Z(lx, ly) + dz, w, d, h, self.rot + a)
    def cyl(self, key, lx, ly, r, h, seg=16, dz=0.0, r2=None):
        if key == 'pad' and r >= .03: self.pads.append((lx, ly))
        X, Y = self.world(lx, ly); B(key).cyl(X, Y, self.Z(lx, ly) + dz, r, h, seg, r2)
    def disc(self, key, lx, ly, a, b, ang=0.0, dz=.002, seg=40, z=None):
        X, Y = self.world(lx, ly); zz = (self.Z(lx, ly) if z is None else z) + dz
        bmesh.ops.create_circle(B(key).bm, cap_ends=True, segments=seg, radius=1,
                                matrix=Matrix.Translation((X, Y, zz)) @ Matrix.Rotation(self.rot + ang, 4, 'Z') @ Matrix.Diagonal((a, b, 1, 1)))
    def tree(self, lx, ly, r, kind='tree1', dz=0.0, sz=None):
        X, Y = self.world(lx, ly); TREES.setdefault(kind, []).append((X, Y, self.Z(lx, ly) + dz + r * .55, r))
    def roof(self, lx, ly, w, d, zb, ht, a, col):
        X, Y = self.world(lx, ly); ROOFS.append((X, Y, w, d, zb, ht, self.rot + a)); ROOFC.append(col)
    def house(self, key, lx, ly, w, d, h, a, col, ridge=None):
        """一栋楼：墙体 + 坡屋顶（ridge=屋脊高，默认按进深）。"""
        z0 = min(self.Z(lx + dx, ly + dy) for dx in (-w / 2, w / 2) for dy in (-d / 2, d / 2))
        X, Y = self.world(lx, ly); B(key).box(X, Y, z0 - .01, w, d, h + .01, self.rot + a)
        self.roof(lx, ly, w * 1.04, d * 1.1, z0 + h, ridge if ridge is not None else d * .38, a, col); return z0
    def wall_line(self, key, pts, t, h, closed=False, dz=0.0):
        n = len(pts)
        for i in range(n if closed else n - 1):
            (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]; L = math.hypot(bx - ax, by - ay)
            if L < 1e-4: continue
            self.box(key, (ax + bx) / 2, (ay + by) / 2, L + t, t, h, math.atan2(by - ay, bx - ax), dz)
    def outline(self, s=1.0, n=64): return [(math.cos(a) * s * self.r(a), math.sin(a) * s * self.r(a)) for a in np.linspace(0, 2 * math.pi, n, endpoint=False)]

    # ---------------- 岛体 ----------------
    def build_body(self, col):
        R = self.R
        # 地形点：台地（主楼坐在上面）、裸岩峰（外圈）、湖（凹地 + 水面，靠岸时开一道出水口 / 瀑布）
        if self.terrain == 'terrace':
            a = R.uniform(0, 2 * math.pi); d = R.uniform(0, .25) * self.F
            self.spots.append(('plateau', math.cos(a) * d, math.sin(a) * d, R.uniform(.28, .42) * self.F, R.uniform(.025, .045)))
        if self.terrain == 'crag':
            for _ in range(int(R.integers(2, 5))):
                a = R.uniform(0, 2 * math.pi); s = R.uniform(.6, .85); rr = R.uniform(.07, .13) * max(self.F, .4)
                self.spots.append(('bump', math.cos(a) * s * self.r(a), math.sin(a) * s * self.r(a), rr, R.uniform(.04, .09)))
        if self.terrain == 'lake':
            a = R.uniform(0, 2 * math.pi); s = R.uniform(.35, .6); cx, cy = math.cos(a) * s * self.r(a), math.sin(a) * s * self.r(a)
            A, Bb = R.uniform(.22, .32) * self.F, R.uniform(.13, .2) * self.F
            self.spots.append(('dip', cx, cy, max(A, Bb) * 1.05, .012)); self.water.append((cx, cy, A, Bb, float(R.uniform(0, math.pi))))
        # 岛面：极坐标网格（环 × 角），顶点高度 = 地形；坡陡处材质自动露岩
        NA = int(min(320, max(96, 110 * max(self.rx, self.ry)))); NR = int(min(40, max(10, 14 * max(self.rx, self.ry))))
        ths = np.linspace(0, 2 * math.pi, NA, endpoint=False); rs = np.array([self.r(t) for t in ths])
        V = [(self.x, self.y, self.Z(0, 0))]; c, s_ = math.cos(self.rot), math.sin(self.rot)
        for j in range(1, NR + 1):
            f = j / NR; f = f if j < NR - 3 else f                                           # 外圈加密由 NR 决定
            for i, t in enumerate(ths):
                lx, ly = math.cos(t) * rs[i] * f, math.sin(t) * rs[i] * f
                V.append((self.x + lx * c - ly * s_, self.y + lx * s_ + ly * c, self.Z(lx, ly)))
        F = [(0, 1 + i, 1 + (i + 1) % NA) for i in range(NA)]
        for j in range(NR - 1):
            a0, a1 = 1 + j * NA, 1 + (j + 1) * NA
            F += [(a0 + i, a1 + i, a1 + (i + 1) % NA, a0 + (i + 1) % NA) for i in range(NA)]
        me = bpy.data.meshes.new('top_' + self.id); me.from_pydata(V, [], F); me.update()
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        top = bpy.data.objects.new('top_' + self.id, me); col.objects.link(top); me.materials.append(top_mat(self.style))
        # 岛底岩体：从岸线往下收成倒锥，边上有凸凹（俯视看不见，不投影到云上；中层投影由查看器按轮廓画）
        depth = (self.rx + self.ry) * .85; ring = 1 + (NR - 1) * NA
        UV, UF = [], []
        levels = [(.0, 1.0), (.12, .93), (.35, .78), (.6, .52), (.82, .26), (.95, .08)]
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
        # 湖面与瀑布
        for cx, cy, A, Bb, ang in self.water:
            zl = self.Z(cx, cy) + .004
            self.disc('water', cx, cy, A, Bb, ang, z=zl, dz=0, seg=48)
            for k in range(int(4 + 10 * self.F)): a = R.uniform(0, 2 * math.pi); self.tree(cx + math.cos(a) * A * 1.1, cy + math.sin(a) * Bb * 1.15, .02 + R.random() * .02, 'tree2')
            th = math.atan2(cy, cx); edge = self.r(th)
            if math.hypot(cx, cy) + max(A, Bb) > edge * .55:                                 # 湖靠岸：一道出水溪流流到岛缘（瀑布口）
                n = 10; p0 = (cx + math.cos(th) * A * .9, cy + math.sin(th) * Bb * .9)
                for k in range(n):
                    f = k / (n - 1); px = p0[0] + (math.cos(th) * edge * .99 - p0[0]) * f; py = p0[1] + (math.sin(th) * edge * .99 - p0[1]) * f
                    self.disc('water_l', px, py, .012 + .004 * f, .012 + .004 * f, dz=.003, seg=10)
                ex_, ey_ = math.cos(th) * edge * 1.0, math.sin(th) * edge * 1.0
                self.disc('foam', ex_, ey_, .03, .02, th, dz=.004, seg=16)
                X, Y = self.world(ex_ * 1.03, ey_ * 1.03); B('foam').box(X, Y, self.z - .5, .04, .04, .49, self.rot + th)   # 瀑布（从侧面看得到的一条白练）
        # 裸岩（岩峰上的大石头）
        for kind, cx, cy, rr, hh in self.spots:
            if kind == 'bump':
                for _ in range(int(3 + rr * 60)):
                    a = R.uniform(0, 2 * math.pi); d = R.uniform(0, rr * .9); X, Y = self.world(cx + math.cos(a) * d, cy + math.sin(a) * d)
                    B('boulder', True).ico(X, Y, self.Z(cx + math.cos(a) * d, cy + math.sin(a) * d), R.uniform(.006, .02), sz=.7)
                self.claim(cx, cy, rr)
        self.build_rim()

    def build_rim(self):
        R = self.R; pts = self.outline(.975, max(48, int(90 * max(self.rx, self.ry))))
        if self.rim == 'wall':                                                              # 石墙（带墩柱）
            self.wall_line('stone', pts, .008, .012, closed=True)
            for i in range(0, len(pts), 4): self.box('stone', pts[i][0], pts[i][1], .014, .014, .018)
        elif self.rim == 'hedge':                                                           # 林带：岸线内一圈密树
            for a in np.linspace(0, 2 * math.pi, int(160 * max(self.rx, self.ry)), endpoint=False):
                s = R.uniform(.88, .97); self.tree(math.cos(a) * s * self.r(a), math.sin(a) * s * self.r(a), R.uniform(.018, .03) * (1.3 if self.style == 'lingnan' else 1), 'tree6' if R.random() < .4 else 'tree1')
        elif self.rim == 'roots':                                                           # 垂根：岸线外挂一圈深色藤根 + 灌木
            for a in np.linspace(0, 2 * math.pi, int(220 * max(self.rx, self.ry)), endpoint=False):
                rr = self.r(a); X, Y = self.world(math.cos(a) * rr * 1.01, math.sin(a) * rr * 1.01)
                B('roots', True).ico(X, Y, self.z - .02, R.uniform(.008, .016), sz=2.2)
                if R.random() < .5: self.tree(math.cos(a) * rr * .96, math.sin(a) * rr * .96, R.uniform(.01, .018), 'tree4')
        else:                                                                               # 崖边：外圈塌陷露岩 + 碎石
            for a in np.linspace(0, 2 * math.pi, int(70 * max(self.rx, self.ry)), endpoint=False):
                s = R.uniform(.93, .99); lx, ly = math.cos(a) * s * self.r(a), math.sin(a) * s * self.r(a)
                X, Y = self.world(lx, ly); B('boulder', True).ico(X, Y, self.Z(lx, ly), R.uniform(.004, .012), sz=.7)

    # ---------------- 园林与建筑（按风格）----------------
    def build_estate(self):
        role = self.d.get('role')
        if role: getattr(self, 'role_' + role)(); self.garden_lite()                         # 有名有主的府邸：专门的主楼 + 按风格的简化园子
        else: getattr(self, 'est_' + self.style)()
        self.fill_trees()

    def garden_lite(self):
        """地标府邸的园子：按风格留一种标志（英式树团湖、法式绿篱格、苏州池石、岭南榕树）。"""
        R = self.R; F = max(self.F, .3)
        if self.style == 'chateau':
            p = self.spot(.18 * F, smax=.7)
            if p:
                for i in range(-2, 3):
                    for j in range(-1, 2): self.box('hedge', p[0] + i * .05 * F, p[1] + j * .06 * F, .04 * F, .05 * F, .006)
                self.claim(p[0], p[1], .2 * F)
        elif self.style in ('english', 'neoclassical') and not self.water:
            p = self.spot(.15 * F, smax=.7)
            if p: self.disc('water', p[0], p[1], .14 * F, .07 * F, R.uniform(0, 3), dz=.003); self.water.append((p[0], p[1], .15 * F, .08 * F, 0))
        elif self.style == 'lingnan':
            for _ in range(3):
                q = self.spot(.05 * F, smax=.85)
                if q: self.tree(q[0], q[1], .06 * F, 'tree4'); self.claim(q[0], q[1], .05 * F)

    def _frame(self, rr):
        lx, ly = self.main_spot(rr); a = self.R.choice([0, math.pi / 2, math.pi, -math.pi / 2]) + self.R.uniform(-.1, .1)
        c, s = math.cos(a), math.sin(a); self.claim(lx, ly, rr)
        return lx, ly, a, (lambda dx, dy: (lx + dx * c - dy * s, ly + dx * s + dy * c))

    # 首相府：对称官邸（中央楼 + 两翼围出荣誉庭院）+ 旗帜广场 + 公务飞艇坪 + 岗亭
    def role_pm_residence(self):
        F = max(self.F, .5); L = .5 * F; lx, ly, a, P = self._frame(L * .9)
        self.house('marble', *P(0, 0), L, L * .22, .06, a, ROOF_SLATE, ridge=L * .07)
        self.house('marble', *P(0, -L * .12), L * .22, L * .16, .075, a, ROOF_SLATE, ridge=L * .09)          # 中央凸出楼
        for sx in (-1, 1): self.house('marble', *P(sx * L * .45, -L * .28), L * .14, L * .42, .05, a, ROOF_SLATE, ridge=L * .05)
        self.box('gravel', *P(0, -L * .42), L * .72, L * .36, .002, a)                                   # 荣誉庭院
        self.box('stone', *P(0, -L * .8), L * .8, L * .3, .003, a)                                       # 旗帜广场
        for k in range(5):
            qx, qy = P((k - 2) * L * .15, -L * .9); self.cyl('pad', qx, qy, .002, .05, 6); self.box('gold', qx + .006, qy, .012, .002, .008, a, dz=.04)
        for sx in (-1, 1): self.house('stone', *P(sx * L * .42, -L * .98), .025, .025, .02, a, ROOF_SLATE, ridge=.008)   # 岗亭
        p = self.spot(.1 * F, smax=.8)
        if p:
            self.cyl('pad', p[0], p[1], .08 * F, .005, 32); self.claim(p[0], p[1], .09 * F)
            for k in (-1, 1): X, Y = self.world(p[0] + k * .03 * F, p[1]); B('car', True).ico(X, Y, self.Z(*p) + .012, .02 * F, sz=.4)

    # 将军官邸：堡垒化别墅（角堡）+ 阅兵场 + 装甲机库 + 瞭望塔
    def role_general_residence(self):
        F = max(self.F, .5); L = .32 * F; lx, ly, a, P = self._frame(L * 1.1)
        self.house('stone', *P(0, 0), L, L * .6, .05, a, (.22, .24, .22), ridge=L * .1)
        pts = [P(dx * L * .85, dy * L * .6) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        self.wall_line('stone', pts, .012, .02, closed=True)
        for q in pts: self.cyl('stone', q[0], q[1], .03, .03, 5)                                      # 角堡
        g = self.spot(.2 * F, smax=.75)
        if g:
            self.box('gravel', g[0], g[1], .3 * F, .2 * F, .002, a); self.claim(g[0], g[1], .2 * F)        # 阅兵场 + 地面标线
            for k in range(-2, 3): self.box('path', g[0], g[1] + k * .035 * F, .26 * F, .003, .0025, a)
        h = self.spot(.1 * F, smax=.8)
        if h:
            self.house('dark', h[0], h[1], .14 * F, .08 * F, .03, a, (.2, .22, .2), ridge=.02); self.claim(h[0], h[1], .1 * F)
            for k in range(3): X, Y = self.world(h[0] + (k - 1) * .04 * F, h[1] - .07 * F); B('car', True).ico(X, Y, self.Z(*h) + .01, .014 * F, sz=.8)   # 魔导装甲
        t = self.spot(.03, smax=.9)
        if t: self.cyl('stone', t[0], t[1], .018, .12, 8); self.cyl('dark', t[0], t[1], .026, .02, 8, dz=.12)

    # 财团家族庄园：玻璃塔楼别墅 + 叠落白色平台 + 无边泳池 + 私人飞艇港（科技一轨）
    def role_zaibatsu_estate(self):
        F = max(self.F, .5); L = .35 * F; lx, ly, a, P = self._frame(L)
        self.box('glass', *P(0, 0), .07, .07, .28, a); self.box('pad', *P(0, 0), .08, .08, .006, a, dz=.28)     # 塔楼
        for k in range(3): self.box('whitewall', *P(L * (.15 + .12 * k), -L * .05 * k), L * .5, L * .3, .02, a, dz=k * .02)   # 叠落平台
        self.box('water_l', *P(L * .55, -L * .35), L * .8, .03, .004, a)                                  # 无边泳池
        p = self.spot(.12 * F, smax=.85)
        if p:
            self.cyl('pad', p[0], p[1], .09 * F, .006, 48); self.claim(p[0], p[1], .1 * F)
            for k in range(12): t = k / 12 * 2 * math.pi; self.cyl('gold', p[0] + math.cos(t) * .085 * F, p[1] + math.sin(t) * .085 * F, .004, .008, 6)
            X, Y = self.world(*p); B('car', True).ico(X, Y, self.Z(*p) + .015, .035 * F, sz=.35)
        for _ in range(6):                                                                            # 雕塑庭院
            q = self.spot(.02, near=(lx, ly, L * 1.2))
            if q: self.cyl('marble', q[0], q[1], .006, .02, 8); self.claim(q[0], q[1], .015)

    # 大主教府邸：十字形礼拜堂（中殿 + 横厅 + 交叉处穹顶 + 钟楼）+ 回廊庭院（以太一轨）
    def role_archbishop_palace(self):
        F = max(self.F, .5); L = .4 * F; lx, ly, a, P = self._frame(L * .9)
        self.house('marble', *P(0, 0), L, L * .22, .06, a, ROOF_SLATE, ridge=L * .1)                       # 中殿
        self.house('marble', *P(L * .15, 0), L * .22, L * .6, .055, a, ROOF_SLATE, ridge=L * .1)          # 横厅
        X, Y = self.world(*P(L * .15, 0)); z0 = self.Z(*P(L * .15, 0))
        B('marble').cyl(X, Y, z0, L * .1, .085, 24); B('gold', True).ico(X, Y, z0 + .085, L * .095, sz=.8, sub=3)   # 穹顶（金）
        self.cyl('marble', *P(-L * .55, L * .1), .02, .13, 8); self.cyl('dark', *P(-L * .55, L * .1), .026, .03, 8, dz=.13, r2=.002)   # 钟楼
        cx, cy = P(-L * .1, -L * .45); w = L * .45
        pts = [(cx + dx * w / 2, cy + dy * w / 2) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        self.wall_line('whitewall', pts, .012, .012, closed=True); self.box('lawn', cx, cy, w * .8, w * .8, .0025, a)
        self.cyl('marble', cx, cy, .015, .01, 16); self.disc('water_l', cx, cy, .011, .011, dz=.01, seg=16)
        self.claim(cx, cy, w * .6)

    # 庄园主联盟会所：宴会厅（玻璃顶长厅）+ 环形车道与喷泉 + 停靠平台 + 花架露台（品鉴宴在此）
    def role_league_club(self):
        F = max(self.F, .5); L = .42 * F; lx, ly, a, P = self._frame(L * .8)
        self.house('marble', *P(0, 0), L, L * .3, .05, a, ROOF_MANSARD, ridge=L * .06)
        self.box('glass', *P(0, 0), L * .6, L * .12, .012, a, dz=.05)
        c = P(0, -L * .55); self.disc('gravel', c[0], c[1], L * .32, L * .32, dz=.002, seg=48); self.disc('lawn', c[0], c[1], L * .2, L * .2, dz=.0025, seg=48)
        self.cyl('marble', c[0], c[1], .03, .008, 24); self.disc('water_l', c[0], c[1], .025, .025, dz=.008, seg=24)
        for k in range(6): q = P((k - 2.5) * L * .16, L * .3); self.box('path', q[0], q[1], .01, L * .2, .012, a)   # 花架
        th = math.atan2(-1, 0) + a; rr = self.r(th - self.rot) if False else self.r(th)
        q = (math.cos(th) * rr * .97, math.sin(th) * rr * .97); self.cyl('pad', q[0], q[1], .07 * F, .006, 32, dz=-.004); self.claim(q[0], q[1], .08 * F)

    # 以太研究院：中央尖塔 + 发光以太晶簇 + 环形法阵广场 + 放射状实验楼 + 三座晶柱
    def role_aether_institute(self):
        F = max(self.F, .5); L = .3 * F; lx, ly, a, P = self._frame(L * 1.2)
        for k in range(4): self.disc('stone' if k % 2 else 'gravel', lx, ly, L * (1 - k * .2), L * (1 - k * .2), dz=.002 + k * .0004, seg=64)   # 法阵同心环
        self.cyl('marble', lx, ly, .03, .2, 12, r2=.008)                                            # 尖塔
        for k in range(7):
            t = k / 7 * 2 * math.pi; X, Y = self.world(lx + math.cos(t) * .025, ly + math.sin(t) * .025)
            B('aether', True).ico(X, Y, self.Z(lx, ly) + .2 + (k % 3) * .01, .012, sz=2.5, sub=1)
        for k in range(5):
            t = a + k / 5 * 2 * math.pi; q = (lx + math.cos(t) * L * 1.25, ly + math.sin(t) * L * 1.25)
            if self.inside(*q, .85): self.house('marble', q[0], q[1], L * .35, L * .14, .03, t, (.25, .27, .3), ridge=.01)
        for k in range(3):
            t = a + .5 + k / 3 * 2 * math.pi; q = (lx + math.cos(t) * L * .7, ly + math.sin(t) * L * .7)
            X, Y = self.world(*q); B('aether', True).ico(X, Y, self.Z(*q) + .03, .01, sz=3.0, sub=1); self.cyl('stone', q[0], q[1], .012, .01, 6)

    def main_spot(self, rr):
        """主楼位置：台地中心，或岛心附近的随机点（不都放正中）。"""
        pl = next((sp for sp in self.spots if sp[0] == 'plateau'), None)
        if pl: return pl[1], pl[2]
        p = self.spot(rr, smax=.45) or (0.0, 0.0); return p

    def outbuildings(self, n, key, col):
        """附属建筑：温室、马厩 / 机库、仆役楼、亭；数量与种类随岛。"""
        R = self.R; F = self.F
        kinds = ['glass', 'stable', 'staff', 'gazebo', 'hangar']
        for _ in range(n):
            k = kinds[int(R.integers(len(kinds)))]; rr = {'glass': .07, 'stable': .09, 'staff': .06, 'gazebo': .03, 'hangar': .09}[k] * max(F, .5)
            p = self.spot(rr, smax=.78)
            if not p: continue
            lx, ly = p; a = R.uniform(0, math.pi); self.claim(lx, ly, rr)
            if k == 'glass':                                                                 # 温室：白框玻璃长屋
                self.box('glass', lx, ly, rr * 1.6, rr * .6, .012, a); self.box('whitewall', lx, ly, rr * 1.65, .004, .014, a)
            elif k == 'stable':                                                              # 马厩院：四面围合 + 中间院子
                w = rr * 1.4
                for dx, dy, ww, dd, aa in ((0, -w / 2, w, w * .22, 0), (0, w / 2, w, w * .22, 0), (-w / 2, 0, w * .22, w, 0), (w / 2, 0, w * .22, w, 0)):
                    c_, s_ = math.cos(a), math.sin(a); self.house(key, lx + dx * c_ - dy * s_, ly + dx * s_ + dy * c_, ww, dd, .018, a + aa, col, ridge=min(ww, dd) * .35)
                self.box('gravel', lx, ly, w * .7, w * .7, .002, a)
            elif k == 'staff': self.house(key, lx, ly, rr * 1.5, rr * .6, .022, a, col)
            elif k == 'gazebo': self.cyl('marble', lx, ly, rr * .6, .012, 12); self.cyl('dark', lx, ly, rr * .75, .01, 12, dz=.012, r2=.002)
            else:                                                                            # 机库 + 停机坪（天城的私人飞艇）
                self.box('pad', lx, ly, rr * 1.8, rr * 1.2, .003, a); self.house('stone', lx + math.cos(a) * rr * .4, ly + math.sin(a) * rr * .4, rr * .9, rr * .7, .02, a, (.3, .31, .33), ridge=rr * .15)
                X, Y = self.world(lx - math.cos(a) * rr * .5, ly - math.sin(a) * rr * .5)
                B('car', True).ico(X, Y, self.Z(lx, ly) + .01, rr * .25, sz=.45)

    def fill_trees(self):
        """其余空地：按风格补树（英式散植孤树 + 树团、法式在规整园外、苏州竹、岭南浓荫），让园林占满岛面。"""
        R = self.R; st = self.style
        dens = {'english': 420, 'chateau': 220, 'suzhou': 480, 'lingnan': 700, 'neoclassical': 110, 'fortress': 30}[st]   # 每平方单位（1 万 m²）的树数
        n = int(dens * math.pi * self.rx * self.ry)
        kinds = {'english': ('tree1', 'tree1', 'tree2', 'tree6'), 'chateau': ('tree2', 'tree2', 'tree6'), 'suzhou': ('tree3', 'tree3', 'tree2', 'tree5'),
                 'lingnan': ('tree4', 'tree4', 'tree1', 'tree3'), 'neoclassical': ('tree1', 'tree2', 'tree6'), 'fortress': ('tree6',)}[st]
        clump = st in ('english', 'lingnan', 'neoclassical')
        k = 0
        while k < n:
            a = R.uniform(0, 2 * math.pi); d = math.sqrt(R.random()) * .93; lx, ly = math.cos(a) * d * self.r(a), math.sin(a) * d * self.r(a)
            m = int(R.integers(3, 9)) if clump else 1
            for _ in range(m):
                px, py = lx + R.normal(0, .025) * max(self.F, .4), ly + R.normal(0, .025) * max(self.F, .4)
                if not self.free(px, py, .01, .95): continue
                r = R.uniform(.012, .026) * (1.9 if st == 'lingnan' and R.random() < .3 else 1)
                self.tree(px, py, r, kinds[int(R.integers(len(kinds)))])
            k += m

    # 英国乡村庄园：蜂蜜色石头主楼（L / H / E / 回字平面，石板瓦坡顶）、蛇形湖、成团的树、弯曲车道、围墙菜园、马厩院、神庙小品
    def est_english(self):
        R = self.R; F = max(self.F, .3); col = ROOF_SLATE
        L = min(.75, .55 * F); D_ = L * .28; lx, ly = self.main_spot(L * .7); a = R.uniform(0, 2 * math.pi); self.claim(lx, ly, L * .75)
        plan = ['L', 'H', 'E', 'court'][int(R.integers(4))]; c, s = math.cos(a), math.sin(a); P = lambda dx, dy: (lx + dx * c - dy * s, ly + dx * s + dy * c)
        self.house('stone_warm', lx, ly, L, D_, .045, a, col)
        if plan in ('L', 'E', 'H'):
            for sx in ((1,) if plan == 'L' else (-1, 1)): self.house('stone_warm', *P(sx * (L / 2 - D_ / 2), D_ * .9), D_, D_ * 1.6, .04, a + math.pi / 2, col)
        if plan == 'E': self.house('stone_warm', *P(0, -D_ * .8), D_ * .9, D_ * .8, .05, a + math.pi / 2, col)
        if plan == 'court': self.house('stone_warm', *P(0, D_ * 1.8), L, D_, .04, a, col); [self.house('stone_warm', *P(sx * (L / 2 - D_ / 2), D_ * .9), D_ * .9, D_ * 2.6, .04, a + math.pi / 2, col) for sx in (-1, 1)]
        # 车道：从岛缘绕进来
        th0 = R.uniform(0, 2 * math.pi); pts = []
        for k in range(18):
            f = k / 17; th = th0 + .9 * math.sin(f * 2.2) ; rr = self.r(th) * (.92 - .75 * f)
            pts.append((lx + (math.cos(th) * rr - lx) * (1 - f) if False else math.cos(th) * rr * (1 - f) + lx * f, math.sin(th) * rr * (1 - f) + ly * f))
        self.wall_line('gravel', pts, .012 * F + .006, .002)
        # 蛇形湖（若地形没有湖）
        if not self.water and F > .35:
            p = self.spot(.25 * F, smax=.7)
            if p:
                ang = R.uniform(0, math.pi)
                for k in range(3):
                    cx, cy = p[0] + math.cos(ang) * (k - 1) * .16 * F, p[1] + math.sin(ang) * (k - 1) * .16 * F + .04 * F * math.sin(k * 2.1)
                    self.disc('water', cx, cy, (.1 - .02 * abs(k - 1)) * F, .05 * F, ang + .3 * (k - 1), dz=.003)
                self.water.append((p[0], p[1], .28 * F, .1 * F, ang))
                q = self.spot(.03, near=(p[0], p[1], .3 * F))
                if q: self.cyl('stone_warm', q[0], q[1], .018 * F + .006, .014, 12); self.cyl('dark', q[0], q[1], .02 * F + .007, .01, 12, dz=.014, r2=.003)   # 湖边小神庙
        # 围墙菜园（英式的标志）：红砖围墙 + 菜畦网格 + 靠北墙的温室
        if F > .3:
            w = R.uniform(.18, .26) * F; p = self.spot(w * .8, smax=.72)
            if p:
                ga = a + R.choice([0, math.pi / 2]); cg, sg = math.cos(ga), math.sin(ga); Q = lambda dx, dy: (p[0] + dx * cg - dy * sg, p[1] + dx * sg + dy * cg)
                self.claim(p[0], p[1], w * .75)
                self.wall_line('brick', [Q(-w / 2, -w / 2), Q(w / 2, -w / 2), Q(w / 2, w / 2), Q(-w / 2, w / 2)], .004, .008, closed=True)
                n = 4
                for i in range(n):
                    for j in range(n):
                        self.box('beds' if (i + j) % 2 else 'lawn2', *Q((i - 1.5) * w / n * .92, (j - 1.5) * w / n * .92), w / n * .8, w / n * .8, .002, ga)
                self.box('glass', *Q(0, w / 2 - .012), w * .8, .014, .01, ga)
        self.outbuildings(int(R.integers(1, 4)) if F > .4 else 1, 'stone_warm', col)
        # 草甸上割出来的弯曲步道
        for _ in range(int(1 + 3 * F)):
            th = R.uniform(0, 2 * math.pi); pts = [(math.cos(th + t * .8) * self.r(th + t * .8) * (.3 + .4 * t), math.sin(th + t * .8) * self.r(th + t * .8) * (.3 + .4 * t)) for t in np.linspace(0, 1, 10)]
            self.wall_line('lawn', pts, .01, .0015)

    # 法国城堡：U 形主楼 + 角楼（深灰蓝孟莎顶）；中轴：前庭、刺绣花坛（绿篱格 + 圆池）、大水渠、两侧丛林块（bosquet）与林荫道；侧面橘园
    def est_chateau(self):
        R = self.R; F = max(self.F, .3); col = ROOF_MANSARD
        L = min(.7, .5 * F); a = R.choice([0, math.pi / 2, math.pi, -math.pi / 2]) + R.uniform(-.15, .15)
        lx, ly = self.main_spot(L * .6); c, s = math.cos(a), math.sin(a); P = lambda dx, dy: (lx + dx * c - dy * s, ly + dx * s + dy * c)
        self.house('marble', *P(0, 0), L, L * .2, .055, a, col, ridge=L * .08)
        for sx in (-1, 1):
            self.house('marble', *P(sx * L * .42, -L * .2), L * .16, L * .45, .05, a, col, ridge=L * .06)
            X, Y = self.world(*P(sx * L * .5, L * .06)); z0 = self.Z(*P(sx * L * .5, L * .06))
            B('marble').cyl(X, Y, z0, L * .05, .07, 16); B('dark').cyl(X, Y, z0 + .07, L * .055, L * .08, 16, r2=.002)   # 角楼 + 尖顶
        self.claim(lx, ly, L * .6)
        # 中轴（朝 -y 本地方向延伸到岛缘）
        axis_len = self.r(a - math.pi / 2) * .85 + (lx * math.sin(a) - ly * math.cos(a))
        nx_, ny_ = int(R.integers(2, 4)), int(R.integers(2, 4))
        pw, ph = L * .95, min(axis_len * .45, L * .9)
        cx0, cy0 = P(0, -L * .25 - ph / 2)
        self.box('gravel', cx0, cy0, pw * 1.1, ph * 1.05, .002, a); self.claim(cx0, cy0, max(pw, ph) * .6)
        for i in range(nx_):
            for j in range(ny_):
                fx, fy = (i + .5) / nx_ - .5, (j + .5) / ny_ - .5; qx, qy = P(fx * pw, -L * .25 - ph / 2 + fy * ph)
                cw, ch = pw / nx_ * .82, ph / ny_ * .8
                self.box('lawn', qx, qy, cw, ch, .0025, a)
                pat = int(R.integers(3))                                                    # 刺绣花坛：三种图案
                if pat == 0:
                    for k in range(3): self.box('hedge', qx, qy, cw * (.9 - k * .28), .004, .006, a); self.box('hedge', qx, qy, .004, ch * (.9 - k * .28), .006, a)
                elif pat == 1:
                    for k in range(12): t = k / 12 * 2 * math.pi; self.box('hedge', qx + math.cos(t) * cw * .32, qy + math.sin(t) * ch * .32, .006, .006, .007, a)
                    self.box('flowers', qx, qy, cw * .3, ch * .3, .003, a)
                else:
                    for k in (-1, 1): self.box('hedge', qx, qy, cw * .9, .004, .006, a + k * .6)
                self.tree(qx + cw * .42 * c, qy + cw * .42 * s, .006, 'tree6', sz=None)
        for fy in range(ny_ + 1):                                                          # 中轴上的圆池
            qx, qy = P(0, -L * .25 - fy * ph / ny_); self.disc('water_l', qx, qy, .018 * F + .006, .018 * F + .006, dz=.004, seg=24)
        # 大水渠 + 横渠（有的岛有）
        cl = axis_len - L * .3 - ph
        if cl > .08:
            qx, qy = P(0, -L * .25 - ph - cl / 2); self.box('water_l', qx, qy, .03 * F + .01, cl * .9, .003, a)
            if R.random() < .5: qx2, qy2 = P(0, -L * .25 - ph - cl * .6); self.box('water_l', qx2, qy2, cl * .6, .025 * F + .008, .003, a)
            self.claim(qx, qy, .03)
        # 丛林块与林荫道
        for sx in (-1, 1):
            for j in range(int(4 + 6 * F)):
                qx, qy = P(sx * pw * .68, -L * .2 - j * .045); self.tree(qx, qy, .014 * F + .008, 'tree2')
            bx, by = P(sx * pw * 1.05, -L * .25 - ph / 2)
            for i in range(int(10 + 30 * F)):
                ox, oy = R.uniform(-.5, .5) * pw * .45, R.uniform(-.5, .5) * ph
                q = (bx + ox * c - oy * s, by + ox * s + oy * c)
                if self.inside(*q, .9): self.tree(*q, .016 + R.random() * .01, 'tree2')
        # 橘园（长条石屋 + 前面一排盆栽）
        if F > .4:
            p = self.spot(.08 * F, smax=.75)
            if p: self.house('marble', p[0], p[1], .16 * F, .04 * F, .025, a, col, ridge=.01); self.claim(p[0], p[1], .09 * F)
        self.outbuildings(int(R.integers(0, 3)), 'marble', col)

    # 苏州园林：不规则白墙围合（2–4 个院），池、假山、曲桥、亭与厅、廊；园外竹林与茶垄
    def est_suzhou(self):
        R = self.R; F = max(self.F, .3); col = ROOF_TILE
        cx, cy = self.main_spot(.3 * F); rr = min(.62, .55 * F) ; self.claim(cx, cy, rr)
        k = int(R.integers(5, 9)); ang0 = R.uniform(0, 2 * math.pi)
        poly = [(cx + math.cos(ang0 + t) * rr * R.uniform(.75, 1.1), cy + math.sin(ang0 + t) * rr * R.uniform(.6, .95)) for t in np.linspace(0, 2 * math.pi, k, endpoint=False)]
        self.wall_line('whitewall', poly, .004, .008, closed=True)
        for i in range(len(poly)):                                                           # 墙顶黛瓦
            (ax, ay), (bx, by) = poly[i], poly[(i + 1) % len(poly)]; X, Y = self.world((ax + bx) / 2, (ay + by) / 2)
            ROOFS.append((X, Y, math.hypot(bx - ax, by - ay), .009, self.Z((ax + bx) / 2, (ay + by) / 2) + .008, .003, self.rot + math.atan2(by - ay, bx - ax))); ROOFC.append(col)
        for _ in range(int(R.integers(1, 3))):                                               # 院墙（分院）
            i = int(R.integers(len(poly))); self.wall_line('whitewall', [poly[i], (cx + R.uniform(-.1, .1) * rr, cy + R.uniform(-.1, .1) * rr)], .004, .008)
        # 池：几块椭圆拼成的不规则水面
        pa = R.uniform(0, math.pi); pc = (cx + R.uniform(-.15, .15) * rr, cy + R.uniform(-.15, .15) * rr)
        for j in range(int(R.integers(3, 6))):
            t = pa + j * R.uniform(.8, 1.6); d = R.uniform(0, .25) * rr
            self.disc('water', pc[0] + math.cos(t) * d, pc[1] + math.sin(t) * d, R.uniform(.12, .22) * rr, R.uniform(.08, .14) * rr, t, dz=.003)
        self.water.append((pc[0], pc[1], .35 * rr, .25 * rr, pa))
        for _ in range(int(15 + 40 * F)):                                                    # 假山石
            t = R.uniform(0, 2 * math.pi); X, Y = self.world(pc[0] + math.cos(t) * .38 * rr * R.uniform(.9, 1.2), pc[1] + math.sin(t) * .28 * rr * R.uniform(.9, 1.2))
            B('boulder', True).ico(X, Y, self.Z(pc[0], pc[1]), .004 + R.random() * .01, sz=1.2)
        zz = [(pc[0] + (-.3 + .12 * j) * rr * math.cos(pa), pc[1] + (-.3 + .12 * j) * rr * math.sin(pa) + (.02 if j % 2 else -.02) * rr) for j in range(6)]
        self.wall_line('path', zz, .008, .003, dz=.002)                                      # 曲桥
        # 厅（沿北墙）、亭（池边）、轩
        for j in range(int(R.integers(2, 5))):
            t = R.uniform(0, 2 * math.pi); px, py = pc[0] + math.cos(t) * .5 * rr, pc[1] + math.sin(t) * .38 * rr
            if j == 0: self.house('whitewall', px, py, .1 * F + .03, .035 * F + .012, .014, t + math.pi / 2, col, ridge=.012)
            else: self.cyl('whitewall', px, py, .012 * F + .005, .01, 6); self.cyl('dark', px, py, .018 * F + .007, .012, 6, dz=.01, r2=.002)
        for i in range(len(poly)):                                                           # 沿墙的廊（窄长黛瓦）
            if R.random() < .5: continue
            (ax, ay), (bx, by) = poly[i], poly[(i + 1) % len(poly)]; mx, my = ax * .5 + bx * .5 + (cx - (ax + bx) / 2) * .08, ay * .5 + by * .5 + (cy - (ay + by) / 2) * .08
            X, Y = self.world(mx, my); ROOFS.append((X, Y, math.hypot(bx - ax, by - ay) * .8, .014, self.Z(mx, my) + .01, .005, self.rot + math.atan2(by - ay, bx - ax))); ROOFC.append(col)
        # 园外：竹林团 + 茶垄（顺着岛的弧线）
        for _ in range(int(3 + 6 * F)):
            p = self.spot(.05, smax=.9)
            if p:
                for _ in range(20): self.tree(p[0] + R.normal(0, .02), p[1] + R.normal(0, .02), .008 + R.random() * .005, 'tree3')
        if F > .35:
            t0 = R.uniform(0, 2 * math.pi)
            for row in range(int(4 + 6 * F)):
                s = .72 + row * .02
                pts = [(math.cos(t) * s * self.r(t), math.sin(t) * s * self.r(t)) for t in np.linspace(t0, t0 + 1.1, 16)]
                self.wall_line('tea', pts, .006, .004)
        self.outbuildings(int(R.integers(0, 2)), 'whitewall', col)

    # 岭南园林：青砖灰瓦院落群（三进两院 / 多组），方池 + 水榭，大榕树，荔枝林（网格）
    def est_lingnan(self):
        R = self.R; F = max(self.F, .3); col = ROOF_TILE
        lx, ly = self.main_spot(.3 * F); a = R.uniform(0, 2 * math.pi); c, s = math.cos(a), math.sin(a); P = lambda dx, dy: (lx + dx * c - dy * s, ly + dx * s + dy * c)
        nx_, ny_ = int(R.integers(2, 4)), int(R.integers(1, 3)); u = .09 * F + .03
        for i in range(nx_):
            for j in range(ny_):
                ox, oy = (i - (nx_ - 1) / 2) * u * 1.25, (j - (ny_ - 1) / 2) * u * 1.6
                for dy in (-.3, .3): self.house('greybrick', *P(ox, oy + dy * u), u, u * .35, .016, a, col, ridge=u * .12)
                self.box('path', *P(ox, oy), u * .9, u * .25, .002, a)                     # 天井
        self.claim(lx, ly, max(nx_ * u * 1.25, ny_ * u * 1.6) * .6)
        p = self.spot(.12 * F, smax=.7)                                                      # 方池 + 水榭
        if p:
            w = .16 * F + .04; self.box('water', p[0], p[1], w, w * .6, .003, a); self.claim(p[0], p[1], w * .6)
            self.house('greybrick', p[0] + w * .3 * c, p[1] + w * .3 * s, w * .28, w * .28, .012, a, col, ridge=w * .1)
            self.water.append((p[0], p[1], w * .55, w * .35, a))
        for _ in range(int(2 + 4 * F)):                                                      # 大榕树
            q = self.spot(.05 * F, smax=.85)
            if q: self.tree(q[0], q[1], (.05 + .03 * R.random()) * max(F, .5), 'tree4'); self.claim(q[0], q[1], .04 * F)
        if F > .35:                                                                          # 荔枝林：网格
            q = self.spot(.15 * F, smax=.75)
            if q:
                g = .03; b_ = R.uniform(0, math.pi)
                for i in range(-3, 4):
                    for j in range(-2, 3):
                        px, py = q[0] + (i * math.cos(b_) - j * math.sin(b_)) * g, q[1] + (i * math.sin(b_) + j * math.cos(b_)) * g
                        if self.inside(px, py, .9): self.tree(px, py, .011, 'tree1')
                self.claim(q[0], q[1], .12)
        self.outbuildings(int(R.integers(0, 3)), 'greybrick', col)

    def est_fortress(self): pass
    def est_neoclassical(self): pass

    def export(self, norm):
        pts = []
        for t in np.linspace(0, 2 * math.pi, 36, endpoint=False):
            rr = self.r(t); X, Y = self.world(math.cos(t) * rr, math.sin(t) * rr); nx, ny = norm((X, Y, self.z)); pts.append([nx, ny])
        return pts

# ---------------- 伊甸庄园（按 docs/eden-estate.md 的室外布局）----------------
def build_eden(isle, layer):
    """伊甸：约 670 × 500 m。府邸坐岛心偏前，正面朝 -y（前庭、访客停靠平台）；后庭人工湖；两侧大片设计过的草坪（给以后加建留的地），外圈林带与石栏。"""
    import eden_manor
    R = isle.R; e = isle
    my = .25                                                                                # 府邸中心（本地 y）
    eden_manor.build_eden_manor(layer, (*e.world(0, my), e.Z(0, my) + .002), e.rot, .01)
    e.claim(0, my, .62)
    # 前庭：砾石广场 + 刺绣花坛（左右各 3 × 2 格）+ 中央大喷泉 + 两侧林荫道
    e.box('gravel', 0, -.28, 1.1, .34, .002)
    e.cyl('marble', 0, -.28, .07, .006, 40); e.disc('water_l', 0, -.28, .062, .062, dz=.006, seg=40); e.cyl('marble', 0, -.28, .012, .02, 16)
    for sx in (-1, 1):
        for i in range(3):
            for j in range(2):
                qx, qy = sx * (.22 + i * .14), -.2 - j * .16
                e.box('lawn', qx, qy, .12, .13, .0025)
                for k in range(3): e.box('hedge', qx, qy, .11 - k * .033, .003, .005); e.box('hedge', qx, qy, .003, .12 - k * .036, .005)
                e.disc('flowers', qx, qy, .015, .015, dz=.004, seg=16)
    # 中轴大道：前庭 → 访客停靠平台（岛缘，正前方）
    edge_y = -e.r(-math.pi / 2) * .99
    e.box('gravel', 0, (edge_y - .45) / 2, .06, abs(edge_y) - .45, .002)
    for sx in (-1, 1):
        for j in range(int((abs(edge_y) - .5) / .04)): e.tree(sx * .07, -.5 - j * .04, .016, 'tree2')
        for j in range(8): e.box('marble', sx * .045, -.5 - j * .08, .01, .01, .018)                 # 大道两侧的雕像台座
    for k in range(4): e.box('lawn2' if k % 2 else 'lawn', 0, -.55 - k * .12 if False else -.5 - (abs(edge_y) - .5) * (k + .5) / 4, .5, (abs(edge_y) - .5) / 4 * .98, .0022)   # 条纹草坪（tapis vert）
    # 访客停靠平台：伸出岛缘的圆形平台 + 小候机亭 + 两艘飞艇
    pc = (0, edge_y - .05)
    e.cyl('pad', pc[0], pc[1], .16, .01, 48, dz=-.004); e.cyl('marble', pc[0], pc[1] + .1, .03, .015, 12); e.cyl('gold', pc[0], pc[1] + .1, .032, .004, 12, dz=.015)
    for sx in (-1, 1):
        X, Y = e.world(pc[0] + sx * .07, pc[1] - .03); B('car', True).ico(X, Y, e.Z(0, edge_y * .98) + .012, .025, sz=.4)
    e.claim(*pc, .18); e.claim(0, (edge_y - .45) / 2, .1)
    # 后庭：人工湖（不规则）+ 湖心圆亭 + 船屋；湖边台阶平台
    lc = (.1, 1.25)
    for j, (dx, dy, A, Bb, t) in enumerate(((0, 0, .55, .26, .1), (-.4, .12, .3, .18, -.4), (.42, -.06, .28, .16, .5), (.1, .2, .25, .14, 0))):
        e.disc('water', lc[0] + dx, lc[1] + dy, A, Bb, t, dz=.003, seg=64)
    e.water.append((lc[0], lc[1], .8, .34, 0))
    e.cyl('stone', lc[0] + .05, lc[1] + .02, .05, .004, 24, dz=.003); e.cyl('marble', lc[0] + .05, lc[1] + .02, .028, .015, 16, dz=.007); e.cyl('marble', lc[0] + .05, lc[1] + .02, .03, .01, 16, dz=.022, r2=.004)
    e.box('marble', 0, .72, .5, .08, .004)
    e.box('stone', .62, 1.18, .16, .10, .012); e.cyl('marble', .62, 1.18, .05, .06, 8, dz=.012); e.cyl('roof_lead', .62, 1.18, .07, .02, 8, dz=.072, r2=.01)   # J 水榭（石台 + 敞亭）
    # 两侧：设计过的大草坪（以后加建用地）—— 绿篱框、四角雕像、十字步道
    for sx in (-1, 1):
        cx_, cy_ = sx * 1.75, .15; w, d = 1.05, .95
        e.box('lawn', cx_, cy_, w, d, .0022); e.wall_line('hedge', [(cx_ - w / 2, cy_ - d / 2), (cx_ + w / 2, cy_ - d / 2), (cx_ + w / 2, cy_ + d / 2), (cx_ - w / 2, cy_ + d / 2)], .012, .008, closed=True)
        e.box('gravel', cx_, cy_, w, .02, .0026); e.box('gravel', cx_, cy_, .02, d, .0026)
        e.disc('water_l', cx_, cy_, .03, .03, dz=.004, seg=24)
        for dx in (-1, 1):
            for dy in (-1, 1): e.box('marble', cx_ + dx * (w / 2 - .04), cy_ + dy * (d / 2 - .04), .014, .014, .02)
        for k in range(10): e.box('lawn2', cx_ - w / 2 + (k + .5) * w / 10, cy_ + d * .25, w / 10 * .5, d * .45, .0024)   # 条纹割草
        e.claim(cx_, cy_, .62)
    # 东北：围墙花园 + 橘园；西北：马厩与机库、仆役楼；西南 / 东南：树林小径
    kg = (1.45, 1.35); e.wall_line('brick', [(kg[0] - .35, kg[1] - .25), (kg[0] + .35, kg[1] - .25), (kg[0] + .35, kg[1] + .25), (kg[0] - .35, kg[1] + .25)], .006, .01, closed=True)
    for i in range(6):
        for j in range(4): e.box('beds' if (i + j) % 2 else 'flowers', kg[0] - .29 + i * .116, kg[1] - .18 + j * .12, .1, .1, .002)
    e.box('stone', kg[0], kg[1] + .22, .48, .1, .07); e.box('glass', kg[0], kg[1] + .21, .44, .09, .002, dz=.07)   # 橘园：石柱 + 玻璃屋（48 × 10 × 7 m）
    e.claim(*kg, .42)
    # 西北服务区（docs/eden-estate.md §2.2 E–H）：仆役楼、马车房、工坊、机坪 + 机库；用树团挡住
    e.house('stone', -1.5, 1.18, .44, .14, .09, 0, ROOF_SLATE, ridge=.04)                            # E 仆役楼（2 层 + 阁楼）
    e.house('stone', -1.5, 1.42, .40, .10, .05, 0, ROOF_SLATE, ridge=.03)                            # F 马车房 / 马厩
    e.house('stone', -1.7, 1.30, .08, .30, .04, 0, (.3, .31, .33), ridge=.015)                       # G 工坊
    e.box('pad', -1.05, 1.30, .30, .26, .003); X, Y = e.world(-1.05, 1.3); B('car', True).ico(X, Y, e.Z(-1.05, 1.3) + .012, .03, sz=.4)
    e.house('dark', -1.07, 1.55, .30, .20, .09, 0, (.22, .23, .25), ridge=.03)                       # H 机库（30 × 20 × 9 m）
    e.claim(-1.4, 1.35, .5)
    # 帕拉第奥五段式的两端：C 图书馆塔亭（西，八角塔身 + 铅皮小穹顶 + 金色浑天仪）、D 音乐厅亭（东，筒拱 + 北端半圆后殿），各有一段爱奥尼亚柱廊连到两翼
    e.house('marble', -.9, .25, .24, .24, .10, 0, ROOF_SLATE, ridge=.03)
    e.cyl('marble', -.9, .25, .06, .28, 8); e.cyl('roof_lead', -.9, .25, .065, .04, 8, dz=.28, r2=.01); X, Y = e.world(-.9, .25); B('gold', True).ico(X, Y, e.Z(-.9, .25) + .33, .012, sub=2)
    e.house('marble', .9, .25, .24, .32, .11, 0, ROOF_SLATE, ridge=.05); e.cyl('marble', .9, .41, .08, .09, 24)
    for sx in (-1, 1):
        e.box('marble', sx * .66, .25, .24, .06, .003)
        for k in range(8): e.cyl('marble', sx * (.555 + k * .03), .22, .004, .055, 8)
        e.box('roof_lead', sx * .66, .25, .24, .06, .006, dz=.055)
    e.claim(-.9, .25, .2); e.claim(.9, .25, .22); e.claim(-.66, .25, .06); e.claim(.66, .25, .06)
    # M 岛缘观景台 ×3（后轴一座半圆台，东西各一座小圆亭）、N 结界锚碑 ×4（方尖碑，碑顶嵌以太晶）
    for (px, py, r_) in ((0, 2.3, .1), (3.05, 0, .04), (-3.05, 0, .04)):
        if e.inside(px, py, .98): e.cyl('marble', px, py, r_, .004, 24); e.cyl('marble', px, py, r_ * .4, .05, 8); e.cyl('roof_lead', px, py, r_ * .5, .015, 8, dz=.05, r2=.004); e.claim(px, py, r_ + .03)
    for sx in (-1, 1):
        for sy in (-1, 1):
            px, py = sx * 2.35, sy * 1.65
            if e.inside(px, py, .95):
                e.box('stone', px, py, .03, .03, .01); e.cyl('marble', px, py, .012, .09, 4, dz=.01, r2=.003)
                X, Y = e.world(px, py); B('aether', True).ico(X, Y, e.Z(px, py) + .105, .008, sz=1.6, sub=1); e.claim(px, py, .04)
    # 玫瑰园（东前，圆形下沉园 + 放射小径 + 铁艺凉亭 + 蔷薇拱廊）、迷园（西前，紫杉同心环 + 日晷）、果园（东北，梅花形）
    rc = (.95, -.45)
    e.disc('lawn', rc[0], rc[1], .24, .24, dz=.0022, seg=64)
    for k in range(4): e.box('gravel', rc[0], rc[1], .46, .012, .0026, k * math.pi / 4)
    for k in range(40): t = k / 40 * 2 * math.pi; e.disc('flowers', rc[0] + math.cos(t) * .18, rc[1] + math.sin(t) * .18, .016, .016, dz=.003, seg=10)
    for k in range(24): t = k / 24 * 2 * math.pi; e.box('dark', rc[0] + math.cos(t) * .235, rc[1] + math.sin(t) * .235, .004, .004, .02, t)
    e.cyl('dark', rc[0], rc[1], .02, .02, 8); e.claim(*rc, .27)
    mc = (-.95, -.45)
    for k, rr in enumerate((.22, .17, .12, .07)):
        gap = k * 1.3
        pts = [(mc[0] + math.cos(t) * rr, mc[1] + math.sin(t) * rr) for t in np.linspace(gap + .35, gap + 2 * math.pi - .1, 48)]
        e.wall_line('hedge', pts, .012, .014)
    e.cyl('stone', *mc, .012, .012, 12); e.claim(*mc, .25)
    oc = (2.15, 1.05)
    for i in range(-3, 4):
        for j in range(-3, 4):
            px, py = oc[0] + i * .07 + (.035 if j % 2 else 0), oc[1] + j * .06
            if e.inside(px, py, .9): e.tree(px, py, .018, 'tree5' if (i + j) % 3 == 0 else 'tree2')
    e.claim(*oc, .28)
    # 岛缘石栏（整圈）+ 林带
    pts = e.outline(.975, 240); e.wall_line('marble', pts, .01, .014, closed=True)
    for i in range(0, len(pts), 6): e.box('marble', pts[i][0], pts[i][1], .018, .018, .022)
    for t in np.linspace(0, 2 * math.pi, 900, endpoint=False):
        if abs(math.sin(t) + 1) < .02: continue                                              # 正前方中轴不种
        s = R.uniform(.84, .95); lx, ly = math.cos(t) * s * e.r(t), math.sin(t) * s * e.r(t)
        if e.free(lx, ly, .01, .98): e.tree(lx, ly, R.uniform(.02, .035), 'tree1' if R.random() < .6 else 'tree6')
    for _ in range(40):                                                                     # 园中孤植大树
        p = e.spot(.03, smax=.8)
        if p: e.tree(p[0], p[1], R.uniform(.03, .05), 'tree1'); e.claim(p[0], p[1], .05)
    e.fill_trees()                                                                          # 其余空地：树团与林间草地

def build_silver_crown(isle):
    """银冠堡：议会骑士团总部。沿真实轮廓的城墙与塔楼、主堡、校场与停机坪。"""
    e = isle; pts = e.outline(.9, 64)
    e.wall_line('stone', pts, .05, .09, closed=True)
    for i in range(0, 64, 8): e.cyl('stone', pts[i][0], pts[i][1], .07, .2, 16); e.cyl('dark', pts[i][0], pts[i][1], .08, .08, 16, dz=.2, r2=.004)
    e.box('stone', 0, 0, .5, .35, .25); e.cyl('stone', 0, 0, .12, .2, 24, dz=.25); e.cyl('dark', 0, 0, .13, .12, 24, dz=.45, r2=.01)
    e.box('gravel', -.45, .25, .5, .3, .003); e.box('pad', .55, -.2, .35, .2, .006)
    for k in range(3): X, Y = e.world(.45 + k * .1, -.2); B('car', True).ico(X, Y, e.Z(.5, -.2) + .015, .03, sz=.4)
    e.claim(0, 0, .6)

def routes(isles, norm):
    """航线（本机画成可开关的叠加层）：各停靠平台 ↔ 伊甸 / 银冠堡的航线（略带弧度的折线），银冠堡巡逻环，骑士团巡空大环线。归一化坐标，左上原点。"""
    by = {e.id: e for e in isles}; eden, sc = by.get('eden'), by.get('silver_crown')
    P = lambda e, p: norm((*e.world(*p), e.z))
    def arc(a, b, bend=.12, n=12):
        (ax, ay), (bx, by_) = a, b; mx, my = (ax + bx) / 2 - (by_ - ay) * bend, (ay + by_) / 2 + (bx - ax) * bend
        return [((1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * bx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * by_) for t in np.linspace(0, 1, n)]
    def w(e, p): return e.world(*p)
    out = []
    hubs = [(eden, eden.pads[0]) if eden and eden.pads else None, (sc, (.55, -.2)) if sc else None]
    hubs = [h for h in hubs if h]
    for e in isles:
        for p in e.pads:
            if e is eden: continue
            for he, hp in hubs:
                if he is e: continue
                pts = arc(w(e, p), w(he, hp), .08 if he is eden else -.08)
                out.append({'kind': 'lane', 'from': e.id, 'to': he.id, 'pts': [list(norm((x, y, e.z))) for x, y in pts]})
    if sc:                                                                                   # 银冠堡巡逻环（半径约 250 m）
        ring = [(sc.x + math.cos(t) * 2.5, sc.y + math.sin(t) * 1.8) for t in np.linspace(0, 2 * math.pi, 33)]
        out.append({'kind': 'patrol', 'from': 'silver_crown', 'to': 'silver_crown', 'pts': [list(norm((x, y, sc.z))) for x, y in ring]})
        loop = [e for e in (by.get('silver_crown'), by.get('isle29'), by.get('isle6'), by.get('isle30'), eden, by.get('isle9'), by.get('silver_crown')) if e]
        pts = []
        for a_, b_ in zip(loop, loop[1:]): pts += arc((a_.x, a_.y), (b_.x, b_.y), .1, 8)[:-1]
        pts.append((loop[-1].x, loop[-1].y))
        out.append({'kind': 'patrol_city', 'from': 'silver_crown', 'to': 'silver_crown', 'pts': [list(norm((x, y, 3))) for x, y in pts]})
    for r in out: r['pts'] = [[round(a, 4), round(b, 4)] for a, b in r['pts']]
    return out
