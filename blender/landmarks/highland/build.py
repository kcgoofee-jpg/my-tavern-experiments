"""旷野高地（开局七）：帝国境内、帝都外荒野中的最高台地（地形为仓库推断）。
卡面：荒野、峭壁；开局时地面焦黑、被翻搅成深色泥坑、碎石，冷风刺骨，下午 14:00。
这里只中性地表现「事后」痕迹：焦土 / 灰烬、湿泥斑、小弹坑状浅坑、碎裂岩块、几缕细烟。不放任何人物、血迹或武器。

场地约 630 × 450 m：
  台地（site_plateau）：y > 崖线 edge(x)，石南 / 丛草 + 裸露基岩，往北缓升；东端（x > 140）是向下的肩坡。
  峭壁（site_cliff）：沿崖线 edge(x)≈-110 的竖向岩壁（层理：按世界 z 的波纹 + 锯齿台阶位移），崖高 80–125 m，
      崖脚倒石堆 / 碎石坡，谷底约 z=-115。
  下山小径（site_trail）：从台地东缘 (120,-10) 起，在东侧肩坡上 Z 字折返下到谷底 (326,-190)。
  焦土区（props_scorch + 地形着色）：中心 (-40,15)，半径约 50 m。
  bg_*：四周延伸地面、南面低谷丘陵、远山、细烟（体积），只为渲染，不导出。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/highland/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/hl.jpg [--blend /tmp/hl.blend] [--log /tmp/hl.log] [--exposure 0]
cam: c1 台地上空俯瞰向崖 / c2 崖边向外 / c3 小径回望台地
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='day', res='1000', samples='32', out='/tmp/hl.jpg', blend='', log='', exposure=''))

X0, X1, Y0, Y1 = -300.0, 330.0, -255.0, 195.0   # 导出场地范围
DX = 2.0
DXC = 1.0                                       # 崖壁列距
VALLEY = -115.0
SC = (-40.0, 20.0); SCR = 105.0                # 焦土中心 / 半径（台地大半）
TRAIL = [(120, -20), (150, 22), (178, -78), (208, 8), (238, -86), (266, 2), (290, -84), (314, -30), (327, -120), (327, -200)]
_cr = random.Random(11)
CRATERS = [(-40, 15, 8.0, 1.8), (-12, 36, 6.0, 1.3), (-72, 2, 6.5, 1.4)]
while len(CRATERS) < 34:
    _a = _cr.uniform(0, math.tau); _q = SCR * 0.85 * math.sqrt(_cr.random())
    _r = _cr.choice((2.2, 2.8, 3.5, 4.5, 5.5))
    CRATERS.append((SC[0] + _q * math.cos(_a), SC[1] + _q * math.sin(_a) * 0.8, _r * 1.3, _r * 0.4))
GULLIES = [(-225, 9.0), (-135, 7.0), (25, 8.0), (95, 6.0)]   # 冲沟 x，宽度
FANS = [g[0] for g in GULLIES] + [-280, -60, 170]            # 崖脚碎石扇


def main():
    import bpy
    from mathutils import Vector, noise, kdtree
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    B = C.Batch
    rnd = random.Random(7)

    def fbm(x, y, o=4, s=0.0):
        a, f, t = 1.0, 1.0, 0.0
        for _ in range(o):
            t += a * noise.noise(Vector((x * f + s, y * f - s, 0.37 * f)))
            a *= 0.5; f *= 2.03
        return t

    def sm(e0, e1, x):
        t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
        return t * t * (3 - 2 * t)

    def edge(x):
        e = -110 + 12 * math.sin(x / 37.0) + 6 * math.sin(x / 13.0 + 1) + 4 * fbm(x / 50.0, 3.1, 3)
        e += 2.2 * fbm(x / 7.0, 8.3, 2)                      # 破碎的崖线
        for (gx, gw) in GULLIES:                             # 冲沟在崖口咬出缺口
            e += 9.0 * math.exp(-((x - gx) / (gw * 1.4)) ** 2)
        return e

    def crater(x, y):
        z = 0.0
        for (cx, cy, r, d) in CRATERS:
            q = math.hypot(x - cx, y - cy) / r
            if q < 1.6:
                z += -d * max(0.0, 1 - q * q) + 0.3 * d * math.exp(-((q - 1) / 0.25) ** 2)
        return z

    def gully(x, y):
        z = 0.0
        for (gx, gw) in GULLIES:
            cx = gx + 10 * math.sin(y / 31.0 + gx) + 4 * fbm(y / 20.0, gx, 2)
            dep = 1.0 + 7.0 * sm(60, -115, y)                # 越近崖口越深
            z -= dep * math.exp(-((x - cx) / gw) ** 2) * sm(170, 120, y)
        return z

    def scorch_w(x, y):
        return sm(SCR + 10, SCR - 25, math.hypot(x - SC[0], y - SC[1]) + 25 * fbm(x / 40.0, y / 40.0, 2, 3.0))

    def plat_raw(x, y):
        z = 6 + 0.06 * (y + 110) + 6 * fbm(x / 140.0, y / 140.0, 3) + 1.6 * fbm(x / 22.0, y / 22.0, 3, 5.0)
        z += 0.35 * fbm(x / 5.0, y / 5.0, 2, 9.0)
        z -= 124 * sm(140, 338, x)
        z += gully(x, y)
        z += 0.45 * fbm(x / 3.0, y / 3.0, 2, 17.0) * scorch_w(x, y)   # 翻搅的泥地
        z -= 1.5 * sm(6, 0, y - edge(x))                                 # 崖口微微下倾
        return z + crater(x, y)

    def valley(x, y):
        # 崖下原野：起伏的荒野 + 远处低谷、丘陵
        z = VALLEY + 4 * fbm(x / 70.0, y / 70.0, 3, 2.0) + 0.5 * fbm(x / 8.0, y / 8.0, 2, 4.0)
        dist = max(0.0, -y - 200) + 0.3 * max(0.0, abs(x) - 600)
        z += 60 * sm(0, 600, dist) * fbm(x / 350.0, y / 350.0, 4, 8.0)
        z += 90 * sm(400, 2500, dist) * (0.4 + fbm(x / 900.0, y / 900.0, 3, 5.0))
        z -= 35 * sm(100, 700, dist) * max(0.0, 1 - abs(fbm(x / 600.0, y / 600.0, 2, 21.0)) * 4)   # 河谷
        return z

    def fan(x):
        return 0.55 + 0.45 * max(math.exp(-((x - f) / 45.0) ** 2) for f in FANS) + 0.08 * fbm(x / 30.0, 2.2, 2)

    def talus_h(x):
        return max(0.0, min(42.0, 0.34 * (plat_raw(x, edge(x)) - VALLEY) * fan(x)))

    def low_raw(x, y):
        d = edge(x) - y
        th = talus_h(x)
        t = th - 0.7 * d + 1.6 * fbm(x / 12.0, y / 12.0, 3, 1.0)
        return valley(x, y) + max(0.0, t)

    def raw(x, y):
        return plat_raw(x, y) if y >= edge(x) else low_raw(x, y)

    def far(x, y):
        # 场地外：台地往北 / 东西逐渐落回原野，四面都是更低的起伏地形
        if y < edge(x):
            return low_raw(x, y) if y > -400 else valley(x, y)
        d = max(0.0, abs(x + 20) - 450) + max(0.0, y - 350)
        pz = plat_raw(x, y)
        base = VALLEY + 10 + 50 * fbm(x / 500.0, y / 500.0, 4, 13.0) + 70 * sm(1500, 3500, d)
        return pz + (base - pz) * sm(0, 900, d)

    # ------------------------------------------------ 小径：加密折线 + 平滑高度 → 切台阶
    P = []
    for (a, b) in zip(TRAIL[:-1], TRAIL[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(2, int(L / 1.0))
        for k in range(n):
            t = k / n
            P.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    P.append(list(TRAIL[-1]))
    # 拐弯处圆滑
    for _ in range(6):
        P = [P[0]] + [[(P[i - 1][0] + 2 * P[i][0] + P[i + 1][0]) / 4, (P[i - 1][1] + 2 * P[i][1] + P[i + 1][1]) / 4]
                      for i in range(1, len(P) - 1)] + [P[-1]]
    PZ = [raw(x, y) for (x, y) in P]
    for _ in range(12):
        PZ = [PZ[0]] + [(PZ[i - 1] + PZ[i] + PZ[i + 1]) / 3 for i in range(1, len(PZ) - 1)] + [PZ[-1]]
    kd = kdtree.KDTree(len(P))
    for i, (x, y) in enumerate(P):
        kd.insert((x, y, 0), i)
    kd.balance()

    def bench(x, y, z):
        co, i, d = kd.find((x, y, 0))
        if d > 5.5:
            return z
        if d < 1.35:
            return PZ[i] - 0.8                       # 踩出的凹槽
        w = 1 - sm(1.35, 5.5, d)
        return z + (PZ[i] + 0.05 - z) * w

    def plat(x, y):
        return bench(x, y, plat_raw(x, y))

    def low(x, y):
        return bench(x, y, low_raw(x, y))

    # ------------------------------------------------ 材质
    def ground_mat(name, force_rock=False, haze=False, scree_on=False):
        m, nt, b = C.new_mat(name)
        L_ = nt.links

        def N(t, **kw):
            n = nt.nodes.new(t)
            for k, v in kw.items():
                if k.startswith('_'):
                    setattr(n, k[1:], v)
                else:
                    n.inputs[k].default_value = v
            return n

        def mr(v, a, b_, c=0.0, d=1.0):
            n = N('ShaderNodeMapRange'); n.inputs['From Min'].default_value = a; n.inputs['From Max'].default_value = b_
            n.inputs['To Min'].default_value = c; n.inputs['To Max'].default_value = d
            L_.new(v, n.inputs['Value']); return n.outputs[0]

        def math_(op, a, b_):
            n = N('ShaderNodeMath', _operation=op)
            for i, v in ((0, a), (1, b_)):
                if isinstance(v, (int, float)):
                    n.inputs[i].default_value = v
                else:
                    L_.new(v, n.inputs[i])
            return n.outputs[0]

        def nz(scale, det=6, rough=0.55, vec=None):
            n = N('ShaderNodeTexNoise', Scale=scale, Detail=det, Roughness=rough)
            L_.new(vec or tc.outputs['Object'], n.inputs['Vector']); return n

        def ramp(v, stops):
            n = N('ShaderNodeValToRGB')
            el = n.color_ramp.elements
            while len(el) > len(stops) and len(el) > 1:
                el.remove(el[-1])
            for i, (p, c) in enumerate(stops):
                e = el[i] if i < len(el) else el.new(p)
                e.position = p; e.color = (*c, 1)
            L_.new(v, n.inputs['Fac']); return n.outputs['Color']

        tc = N('ShaderNodeTexCoord'); geo = N('ShaderNodeNewGeometry')
        sep = N('ShaderNodeSeparateXYZ'); L_.new(geo.outputs['Normal'], sep.inputs[0])
        pos = N('ShaderNodeSeparateXYZ'); L_.new(tc.outputs['Object'], pos.inputs[0])
        slope = math_('SUBTRACT', 1.0, sep.outputs['Z'])
        # 草地：grass_ground 贴图（去饱和、偏枯黄）× 大尺度石南褐 / 枯草黄斑
        mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / 5.0,) * 3
        L_.new(tc.outputs['Object'], mp.inputs['Vector'])
        gd = C._img(nt, C.tex_path('grass_ground', 'diff'), mp.outputs[0])
        hs = N('ShaderNodeHueSaturation', Saturation=0.45, Value=0.8, Hue=0.47); L_.new(gd.outputs[0], hs.inputs['Color'])
        big = nz(0.012, 5, 0.6)
        heath = ramp(big.outputs['Fac'], [(0.3, (0.16, 0.12, 0.08)), (0.5, (0.3, 0.27, 0.16)), (0.7, (0.42, 0.36, 0.2))])
        grass = C._mix(nt, hs.outputs[0], heath, 1.0, 'MULTIPLY')
        grass = C._mix(nt, grass, (1.9, 1.9, 1.7), 1.0, 'MULTIPLY')
        # 岩：世界 z 方向层理
        wv = N('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='Z', Scale=0.045, Distortion=2.5, Detail=4,
               **{'Detail Scale': 1.5})
        wm = N('ShaderNodeMapping'); wm.inputs['Scale'].default_value = (0.3, 0.3, 1.0)
        L_.new(tc.outputs['Object'], wm.inputs['Vector']); L_.new(wm.outputs[0], wv.inputs['Vector'])
        rn = nz(0.25, 8, 0.6)
        rsum = math_('ADD', math_('MULTIPLY', wv.outputs['Fac'], 0.5), math_('MULTIPLY', rn.outputs['Fac'], 0.5))
        rock = ramp(rsum, [(0.2, (0.022, 0.024, 0.027)), (0.42, (0.07, 0.072, 0.075)), (0.6, (0.11, 0.11, 0.11)),
                           (0.78, (0.045, 0.047, 0.05)), (0.92, (0.13, 0.13, 0.13))])
        lich = nz(0.6, 4, 0.5)
        rock = C._mix(nt, rock, (0.1, 0.1, 0.07), mr(lich.outputs['Fac'], 0.58, 0.68, 0, 0.6))
        # 节理 / 裂隙：拉长的 Voronoi 边缘距离 → 深色裂缝 + 硬凹凸
        vm = N('ShaderNodeMapping'); vm.inputs['Scale'].default_value = (0.3, 0.3, 0.07)
        L_.new(tc.outputs['Object'], vm.inputs['Vector'])
        vo = N('ShaderNodeTexVoronoi', _feature='DISTANCE_TO_EDGE', Scale=1.0); L_.new(vm.outputs[0], vo.inputs['Vector'])
        crack = mr(vo.outputs['Distance'], 0.0, 0.035, 1.0, 0.0)
        crack = math_('MULTIPLY', crack, mr(slope, 0.35, 0.7))
        rock = C._mix(nt, rock, (0.01, 0.01, 0.01), math_('MULTIPLY', crack, 0.55))
        # 碎石
        mp2 = N('ShaderNodeMapping'); mp2.inputs['Scale'].default_value = (1 / 3.0,) * 3
        L_.new(tc.outputs['Object'], mp2.inputs['Vector'])
        dd = C._img(nt, C.tex_path('dirt_floor', 'diff'), mp2.outputs[0])
        dh = N('ShaderNodeHueSaturation', Saturation=0.2, Value=1.1); L_.new(dd.outputs[0], dh.inputs['Color'])
        scree = C._mix(nt, dh.outputs[0], (0.17, 0.165, 0.155), 1.0, 'MULTIPLY')
        # 遮罩
        if force_rock:
            rockf = None
        else:
            bed = nz(0.03, 4, 0.6)
            rockf = math_('MAXIMUM', mr(slope, 0.28, 0.45), mr(bed.outputs['Fac'], 0.6, 0.66, 0, 0.85))
        scn = nz(0.08, 4, 0.6)
        scrf = math_('MULTIPLY', mr(slope, 0.05, 0.14), mr(scn.outputs['Fac'], 0.3, 0.45)) if scree_on else 0.0
        # 焦土：到中心的距离（噪声扰动）
        dv = N('ShaderNodeVectorMath', _operation='DISTANCE'); dv.inputs[1].default_value = (SC[0], SC[1], 0)
        flat_ = N('ShaderNodeVectorMath', _operation='MULTIPLY'); flat_.inputs[1].default_value = (1, 1, 0)
        L_.new(tc.outputs['Object'], flat_.inputs[0]); L_.new(flat_.outputs[0], dv.inputs[0])
        wn = nz(0.05, 5, 0.65)
        dist = math_('ADD', dv.outputs['Value'], math_('MULTIPLY', math_('SUBTRACT', wn.outputs['Fac'], 0.5), 45.0))
        scor = mr(dist, SCR, SCR - 30)
        an = nz(0.35, 6, 0.6)
        ash = ramp(an.outputs['Fac'], [(0.35, (0.008, 0.008, 0.008)), (0.55, (0.022, 0.021, 0.02)), (0.72, (0.07, 0.067, 0.064))])
        mn = nz(0.12, 6, 0.6)
        mud = math_('MULTIPLY', scor, mr(mn.outputs['Fac'], 0.5, 0.55))
        # 外缘焦斑（零星）
        spot = nz(0.09, 4, 0.5)
        scor2 = math_('MULTIPLY', mr(dist, SCR + 30, SCR), mr(spot.outputs['Fac'], 0.6, 0.66, 0, 0.8))
        scor = math_('MAXIMUM', scor, scor2)
        if rockf is None:
            col = rock
        else:
            col = C._mix(nt, grass, scree, scrf) if scree_on else grass
            gv = nz(0.045, 5, 0.6)
            col = C._mix(nt, col, scree, mr(gv.outputs['Fac'], 0.6, 0.64, 0, 0.9))   # 碎石地
            col = C._mix(nt, col, rock, rockf)
        rough_ = 0.95
        if not force_rock:
            col = C._mix(nt, col, ash, scor)
            col = C._mix(nt, col, (0.03, 0.022, 0.017), mud)
            rgh = mr(mud, 0, 1, 0.95, 0.06)
            L_.new(rgh, b.inputs['Roughness'])
        else:
            b.inputs['Roughness'].default_value = 0.9
        if haze:
            cam = N('ShaderNodeCameraData')
            hf = N('ShaderNodeMath', _operation='DIVIDE'); L_.new(cam.outputs['View Distance'], hf.inputs[0]); hf.inputs[1].default_value = -float(haze)
            ex = N('ShaderNodeMath', _operation='EXPONENT'); L_.new(hf.outputs[0], ex.inputs[0])
            fac = math_('SUBTRACT', 1.0, ex.outputs[0])
            col = C._mix(nt, col, (0.36, 0.41, 0.5), fac)
        L_.new(col, b.inputs['Base Color'])
        # 凹凸
        fine = nz(2.5, 4, 0.6)
        bh = math_('ADD', math_('MULTIPLY', wv.outputs['Fac'], 0.3), rn.outputs['Fac'])
        bh = math_('ADD', bh, math_('MULTIPLY', crack, -0.6))
        bh = math_('ADD', bh, math_('MULTIPLY', fine.outputs['Fac'], 0.25))
        bp = N('ShaderNodeBump', Strength=0.6 if force_rock else 0.25, Distance=0.25)
        L_.new(bh, bp.inputs['Height']); L_.new(bp.outputs[0], b.inputs['Normal'])
        return m

    GROUND = ground_mat('ground', haze=12000)
    GLOW = ground_mat('ground_talus', scree_on=True, haze=12000)
    CLIFF = ground_mat('cliff_rock', force_rock=True, haze=12000)
    BGG = ground_mat('bg_ground', haze=6000)
    TRAILM = C.pbr('trail_dirt', 'dirt_floor', 3.0, tint=(0.95, 0.82, 0.62), value=1.35, sat=0.5, rough_mul=1.6)
    BOULD = ground_mat('boulder', force_rock=True)
    CHAR = C.flat('rock_charred', (0.035, 0.033, 0.03), 0.85, noise=0.5)
    ASHM = C.flat('ash_grey', (0.11, 0.105, 0.1), 0.95, noise=0.4)

    # ------------------------------------------------ 崖壁（竖向帘：列 = x，行 = z 从崖顶到谷底以下）
    # 岩层：厚薄不一的层（硬层外凸、软层内凹）；每层沿 x 切成宽窄不一的岩块（竖向节理），
    # 岩块各自前后错动，少数整块崩落（内凹的新鲜断面）
    br = random.Random(21)
    BEDS = []
    zt = 40.0
    while zt > VALLEY - 20:
        th = br.choice((2.5, 3.5, 5.0, 7.0, 9.0, 12.0, 15.0))
        hard = br.random()
        cuts, x_ = [], -740.0
        while x_ < 360:
            x_ += br.uniform(4, 22) if hard > 0.4 else br.uniform(10, 40)
            j = br.uniform(-1.8, 1.4)
            if br.random() < 0.13:
                j -= br.uniform(2.5, 5.0)
            cuts.append((x_, j))
        BEDS.append((zt, zt - th, (hard - 0.4) * 6.0, cuts))
        zt -= th

    def bed_off(x, z):
        zz = z + 2.0 * fbm(x / 90.0, 4.4, 2)          # 层面略有起伏
        for (a_, b_, prot, cuts) in BEDS:
            if b_ <= zz <= a_:
                for (cx, j) in cuts:
                    if x <= cx:
                        return prot + j
                return prot
        return 0.0
    fr = random.Random(33)
    FRACS = [(fr.uniform(-650, 300), fr.uniform(-0.12, 0.12), fr.choice((-1, 1)) * fr.uniform(0.5, 2.0)) for _ in range(14)]
    def terrain(Bp_, Bc_, Bl_, xa, xb, dx, dxc, NP, NZ, NL):
        xs = [xa + dx * i for i in range(int(round((xb - xa) / dx)) + 1)]
        rows = []
        for j in range(NP + 1):
            t = (j / NP) ** 1.35   # 崖边附近更密
            rows.append([(x, edge(x) + t * (Y1 - edge(x)), plat(x, edge(x) + t * (Y1 - edge(x)))) for x in xs])
        C.grid(Bp_, rows, GROUND)
        xc = [xa + dxc * i for i in range(int(round((xb - xa) / dxc)) + 1)]
        crows = []
        for k in range(NZ + 1):
            r = []
            for x in xc:
                e = edge(x)
                top = plat(x, e); bot = VALLEY - 8
                H = max(0.5, top - bot)
                z = top - H * (k / NZ)
                dz = top - z
                g = sm(2.5, 9.0, dz)
                lip = -1.8 * sm(0, 1.4, dz) * (1 - sm(3.0, 8.0, dz))   # 盖层岩唇下的内凹 → 微悬
                off = 0.12 * dz + lip + (bed_off(x, z) + 3.5 + 0.7 * fbm(x / 5.0, z / 5.0, 2, 6.0)) * g
                off += 5 * max(0.0, fbm(x / 45.0, z / 30.0, 2, 11.0)) * g
                for (fx, tilt, st) in FRACS:   # 近竖直的断裂面：两侧错开 → 锐利的台阶
                    if x > fx + tilt * (z - VALLEY) and dz > 0.5:
                        off += st
                r.append((x, e - max(-2.0, off), z))
            crows.append(r)
        C.grid(Bc_, crows, CLIFF, flip=True, smooth=False)
        lrows = []
        for j in range(NL + 1):
            t = 1 - (1 - j / NL) ** 1.3
            lrows.append([(x, Y0 + t * (edge(x) - 1.0 - Y0), low(x, Y0 + t * (edge(x) - 1.0 - Y0))) for x in xs])
        C.grid(Bl_, lrows, GLOW)

    Bp = B('site_plateau'); Bc = B('site_cliff')
    terrain(Bp, Bc, Bc, X0, X1, DX, DXC, 130, 115, 90)
    XW = -720.0   # 西侧延伸（只渲染）：消除 x=-300 处的接缝
    terrain(B('bg_plateau_w'), B('bg_cliff_w'), B('bg_low_w'), XW, X0, 4.0, 2.0, 60, 70, 45)

    ex_c2 = min(range(-150, 40), key=edge) * 1.0
    C2P = (ex_c2 - 6, edge(ex_c2) + 3)

    def rock_(B_, x, y, *a, **k):     # c2 相机 15 m 内不放任何多面石块
        if math.hypot(x - C2P[0], y - C2P[1]) < 15:
            return
        return C.rock(B_, x, y, *a, **k)
    # ------------------------------------------------ 小径带（凹槽里的土路 + 两侧路边石）
    Bt = B('site_trail')
    tl, tr = [], []
    for i in range(len(P)):
        a = P[max(0, i - 1)]; b_ = P[min(len(P) - 1, i + 1)]
        tx, ty = b_[0] - a[0], b_[1] - a[1]; l = math.hypot(tx, ty) or 1
        nx, ny = -ty / l, tx / l
        w = 3.0 + 0.25 * math.sin(i * 0.37)
        z = PZ[i] - 0.77
        tl.append((P[i][0] + nx * w, P[i][1] + ny * w, z)); tr.append((P[i][0] - nx * w, P[i][1] - ny * w, z))
    C.grid(Bt, [tr, tl], TRAILM)
    for i in range(0, len(P), 2):
        a = P[max(0, i - 1)]; b_ = P[min(len(P) - 1, i + 1)]
        tx, ty = b_[0] - a[0], b_[1] - a[1]; l = math.hypot(tx, ty) or 1
        for sgn in (-1, 1):
            if rnd.random() < 0.55:
                s_ = sgn * rnd.uniform(3.3, 4.0)
                x, y = P[i][0] - ty / l * s_, P[i][1] + tx / l * s_
                rock_(Bt, x, y, PZ[i] - 0.15, rnd.uniform(0.15, 0.4), BOULD, seed=i * 2 + sgn, seg=6, rings=4, facet=0.25)

    # ------------------------------------------------ 石块
    Br = B('props_rocks')

    def in_scorch(x, y, pad=0.0):
        return math.hypot(x - SC[0], y - SC[1]) < SCR + pad

    def on_trail(x, y, pad=3.0):
        return kd.find((x, y, 0))[2] < pad

    def psize(lo, hi, k=2.2):     # 幂律尺寸：小石多、大石少
        return lo * (hi / lo) ** (rnd.random() ** k)

    n = 0
    while n < 80:     # 台地散石
        x, y = rnd.uniform(X0 + 10, X1 - 10), rnd.uniform(-100, Y1 - 5)
        if y < edge(x) + 4 or on_trail(x, y):
            continue
        r_ = psize(0.4, 3.5)
        rock_(Br, x, y, plat(x, y) - r_ * 0.15, r_, BOULD, seed=100 + n, sz=rnd.uniform(0.45, 0.8), facet=0.1)
        n += 1
    for (tx, ty, k) in ((-190, 60, 7), (70, 120, 6), (-230, -40, 5), (120, -60, 6), (-250, 150, 5), (-160, 150, 4)):   # 基岩露头
        for i in range(k):
            x, y = tx + rnd.uniform(-10, 10), ty + rnd.uniform(-7, 7)
            r_ = rnd.uniform(2.0, 6.0)
            rock_(Br, x, y, plat(x, y) - r_ * 0.12, r_, BOULD, seed=300 + i + tx, sz=rnd.uniform(0.18, 0.35), facet=0.2, rough=0.25)
    n = 0
    while n < 650:    # 崖脚倒石：集中在碎石扇上，离崖越远越少、越大的滚得越远
        f = rnd.choice(FANS + [None, None])
        x = (f + rnd.gauss(0, 22)) if f is not None else rnd.uniform(X0 + 5, 300)
        if not (X0 + 3 < x < 310):
            continue
        r_ = psize(0.25, 6.0, 2.6)
        d = rnd.uniform(2, 30) + r_ * rnd.uniform(2, 12)
        y = edge(x) - 12 - talus_h(x) * 0.6 - d * 0.8 + rnd.uniform(-6, 6)
        if on_trail(x, y) or y < Y0 + 3:
            continue
        rock_(Br, x, y, low(x, y) - r_ * 0.2, r_, BOULD, seed=500 + n, sz=rnd.uniform(0.5, 0.85), facet=0.3, seg=7, rings=5)
        n += 1
    n = 0
    while n < 70:     # 崖口碎块 / 将落未落的岩块
        x = rnd.uniform(X0 + 5, 250)
        y = edge(x) + rnd.uniform(0.5, 7)
        r_ = psize(0.3, 2.2)
        if abs(x - ex_c2) < 25:
            continue
        rock_(Br, x, y, plat(x, y) - r_ * 0.2, r_, BOULD, seed=800 + n, sz=0.5, facet=0.3, seg=7, rings=5)
        n += 1

    for i in range(9):   # c2 前景：崖口崩裂的岩块
        x = ex_c2 + rnd.uniform(4, 30); y = edge(x) + rnd.uniform(0.5, 4.0)
        if math.hypot(x - ex_c2 + 6, y - edge(ex_c2) - 3) < 9:
            continue
        rock_(Br, x, y, plat(x, y) - 0.2, rnd.uniform(0.5, 1.6), BOULD, seed=900 + i, seg=5, rings=3, facet=0.7, sz=0.55)
    # ------------------------------------------------ 焦土：碎裂岩块、焦黑碎片、灰堆、烧焦的树桩
    Bs = B('props_scorch')
    for ci, (cx, cy, r, d) in enumerate(CRATERS):
        for i in range(int(4 + r * 1.6)):
            a = rnd.uniform(0, math.tau); q = rnd.uniform(0.9, 2.2) * r
            x, y = cx + q * math.cos(a), cy + q * math.sin(a)
            if y < edge(x) + 1:
                continue
            r_ = psize(0.12, 0.9)
            rock_(Bs, x, y, plat(x, y) - r_ * 0.15, r_, CHAR if rnd.random() < 0.6 else BOULD, seed=1000 + i + ci * 37,
                   seg=5, rings=3, facet=0.45, sz=rnd.uniform(0.4, 0.8))
    for ci, (cx, cy, r, d) in enumerate(CRATERS):   # 坑沿焦黑环
        for i in range(int(r * 2.2)):
            a = math.tau * i / int(r * 2.2) + rnd.uniform(-0.2, 0.2)
            x, y = cx + r * 1.02 * math.cos(a), cy + r * 1.02 * math.sin(a)
            if y < edge(x) + 1:
                continue
            rock_(Bs, x, y, plat(x, y) - 0.1, rnd.uniform(0.35, 0.7), CHAR, seed=2500 + i + ci * 53, seg=5, rings=3, facet=0.4, sz=0.3)
    for i in range(160):
        a = rnd.uniform(0, math.tau); q = SCR * math.sqrt(rnd.random()) * 0.9
        x, y = SC[0] + q * math.cos(a), SC[1] + q * math.sin(a)
        if y < edge(x) + 1:
            continue
        r_ = psize(0.15, 1.2)
        rock_(Bs, x, y, plat(x, y) - r_ * 0.2, r_, CHAR, seed=1500 + i, seg=5, rings=3, facet=0.5, sz=rnd.uniform(0.3, 0.7))
    for (x, y, r_) in ((-28, 2, 1.8), (-44, 30, 2.2), (-72, 20, 1.6), (-8, 42, 1.4), (-90, -30, 2.0), (10, -20, 1.7)):   # 碎裂的基岩板
        for i in range(6):
            xx, yy = x + rnd.uniform(-2, 2), y + rnd.uniform(-2, 2)
            rock_(Bs, xx, yy, plat(xx, yy) - 0.2, r_ * rnd.uniform(0.4, 0.9), CHAR if i % 2 else BOULD, seed=1800 + i + int(x),
                   seg=5, rings=3, facet=0.6, sz=0.35)
    for i in range(24):   # 低矮灰堆
        a = rnd.uniform(0, math.tau); q = SCR * 0.8 * math.sqrt(rnd.random())
        x, y = SC[0] + q * math.cos(a), SC[1] + q * math.sin(a)
        if y < edge(x) + 2:
            continue
        rock_(Bs, x, y, plat(x, y) - 0.1, rnd.uniform(0.8, 2.2), ASHM, seed=2000 + i, seg=8, rings=4, sz=0.16, rough=0.2)
    BARK_C = C.flat('bark_charred', (0.025, 0.022, 0.02), 0.8, noise=0.4)
    for (x, y, h) in ((-66, -2, 3.2), (-14, 36, 2.2), (-110, 60, 2.8), (30, 70, 1.8), (-60, 90, 2.4)):
        z = plat(x, y)
        Bs.tube([(x, y, z - 0.3), (x + 0.2, y + 0.3, z + h * 0.6), (x + 0.1, y + 0.7, z + h)], 0.22, BARK_C, n=7)
        Bs.tube([(x + 0.2, y + 0.3, z + h * 0.6), (x + 1.2, y + 0.9, z + h * 0.9)], 0.08, BARK_C, n=5)

    # ------------------------------------------------ 植被：被风压向北（+y）的丛草（两节弯叶片）+ 病弱的风吹树
    Bv = B('site_vegetation')
    GR = [C.flat('tussock_straw', (0.36, 0.3, 0.17), 0.85, noise=0.3), C.flat('tussock_olive', (0.2, 0.2, 0.1), 0.85, noise=0.3),
          C.flat('heather_brown', (0.17, 0.1, 0.09), 0.9, noise=0.3), C.flat('tussock_dead', (0.3, 0.27, 0.22), 0.9, noise=0.3)]
    BURNT = [C.flat('grass_burnt', (0.03, 0.025, 0.02), 0.9, noise=0.3), C.flat('grass_singed', (0.11, 0.07, 0.04), 0.9, noise=0.3)]
    WIND = (0.2, 0.62)   # 与 c3 视线（约 (-0.95, 0.3)）垂直

    def tussock(x, y, z, s, mats=None):
        # 一丛 8–15 片三节弯叶：从基部扇形散开，顺风弯成弧形
        k = rnd.randint(8, 15)
        m = (mats or GR)[rnd.choice((0, 0, 1, 1, 3, 2)) % len(mats or GR)]
        for _ in range(k):
            a = rnd.uniform(0, math.tau)
            h = rnd.uniform(0.25, 0.5) * s
            fan_ = rnd.uniform(0.15, 0.35)
            w = 0.018 * s
            ca, sa = math.cos(a + 1.57), math.sin(a + 1.57)
            pts = []
            for t, wf in ((0.0, 1.0), (0.4, 0.8), (0.75, 0.5), (1.0, 0.0)):
                bend = 1.5 * t * t
                px = x + math.cos(a) * fan_ * h * t + WIND[0] * h * bend
                py = y + math.sin(a) * fan_ * h * t + WIND[1] * h * bend
                pz = z - 0.03 + h * (t - 0.45 * t * t)
                pts.append((px, py, pz, wf))
            vs = []
            for (px, py, pz, wf) in pts[:3]:
                vs += [(px - ca * w * wf, py - sa * w * wf, pz), (px + ca * w * wf, py + sa * w * wf, pz)]
            vs.append(pts[3][:3])
            Bv.poly(vs, [(0, 1, 3, 2), (2, 3, 5, 4), (4, 5, 6)], m)

    def place_tussocks(n, xr, yr, dens=1.0):
        c = 0; tries = 0
        while c < n and tries < n * 6:
            tries += 1
            x, y = rnd.uniform(*xr), rnd.uniform(*yr)
            if y < edge(x) + 0.5 or on_trail(x, y, 1.8):
                continue
            sw = scorch_w(x, y)
            if sw > 0.75 and rnd.random() < 0.7:
                continue
            if noise.noise(Vector((x / 18.0, y / 18.0, 0.5))) < -0.25:
                continue
            for _ in range(rnd.randint(2, 5)):
                xx, yy = x + rnd.uniform(-1.2, 1.2), y + rnd.uniform(-1.2, 1.2)
                if yy < edge(xx) + 0.3:
                    continue
                sw = scorch_w(xx, yy)
                if sw > 0.5:
                    tussock(xx, yy, plat(xx, yy), rnd.uniform(0.35, 0.6) * dens, BURNT)      # 烧剩的草茬
                else:
                    tussock(xx, yy, plat(xx, yy), rnd.uniform(0.8, 1.4) * dens, BURNT if sw > 0.15 and rnd.random() < 0.5 else None)
            c += 1
    place_tussocks(220, (X0, X1), (-130, Y1))
    place_tussocks(350, (ex_c2 - 50, ex_c2 + 40), (-135, -60))     # c2 崖边
    place_tussocks(200, (180, 330), (-110, 40))                    # 小径肩坡
    place_tussocks(150, (60, 200), (100, 195))                     # c1 远处
    for i in range(400):   # c3 谷底（相机附近更密）
        x, y = (rnd.uniform(180, 330), rnd.uniform(-250, -120)) if i < 350 else (rnd.uniform(290, 330), rnd.uniform(-215, -150))
        if y > edge(x) - 8 - talus_h(x) / 0.7 or on_trail(x, y, 1.8):
            continue
        for _ in range(rnd.randint(2, 4)):
            xx, yy = x + rnd.uniform(-1.2, 1.2), y + rnd.uniform(-1.2, 1.2)
            tussock(xx, yy, low(xx, yy), rnd.uniform(0.8, 1.3))
    # 树：用 C.tree('oak') 生成后按风向剪切、稀疏叶片、换成枯黄病叶
    sick = [C.flat('leaf_sick_a', (0.16, 0.15, 0.06), 0.8, noise=0.4), C.flat('leaf_sick_b', (0.22, 0.17, 0.07), 0.8, noise=0.4),
            C.flat('leaf_sick_c', (0.12, 0.12, 0.06), 0.8, noise=0.4)]
    M = C.tree_mats()
    import bmesh as _bm
    for (x, y, h, r_, sd) in ((-150, 95, 6.5, 2.6, 1), (-210, -60, 5.0, 2.2, 2), (95, -70, 5.5, 2.4, 3), (60, 140, 7.0, 2.8, 4),
                               (150, 20, 5.0, 2.0, 5), (240, -20, 4.5, 1.9, 6), (-100, -95, 4.2, 1.8, 7), (175, -95, 4.0, 1.7, 8)):
        z = plat(x, y)
        T = B('_tmp_tree')
        C.tree(T, x, y, h, r_, 'oak', seed=sd, z=z)
        leaf_idx = {T.mats.index(M[k]) for k in ('leaf_a', 'leaf_b', 'leaf_c') if M[k] in T.mats}
        for v in T.bm.verts:
            hz = max(0.0, v.co.z - z)
            v.co.x += 0.012 * hz * hz
            v.co.y += 0.03 * hz * hz
        dead = [f for f in T.bm.faces if f.material_index in leaf_idx and rnd.random() < 0.55]
        _bm.ops.delete(T.bm, geom=dead, context='FACES')
        me = bpy.data.meshes.new('_t'); T.bm.to_mesh(me)
        remap = [Bv.mi(m) for m in T.mats]
        for pl in me.polygons:
            pl.material_index = remap[pl.material_index]
        Bv.bm.from_mesh(me)
        bpy.data.meshes.remove(me); T.bm.free(); del C.Batch.ALL['_tmp_tree']
    for i, m in enumerate(Bv.mats):
        for k, s in (('leaf_a', sick[0]), ('leaf_b', sick[1]), ('leaf_c', sick[2])):
            if m is M[k]:
                Bv.mats[i] = s

    # ------------------------------------------------ 背景：延伸地面 / 远谷丘陵 / 远山 / 烟
    Bg = B('bg_ground')
    def axis(lo, hi, S=15.0, out=9000.0):
        v = [lo + S * i for i in range(int(round((hi - lo) / S)) + 1)]
        st, x_ = S, lo
        L_, R_ = [], []
        while x_ > lo - out:
            st *= 1.045; x_ -= st; L_.append(x_)
        st, x_ = S, hi
        while x_ < hi + out:
            st *= 1.045; x_ += st; R_.append(x_)
        return L_[::-1] + v + R_
    gx = axis(XW, X1); gy = axis(Y0, Y1)
    grow = [[(x, y, (raw(x, y) - 30 if (XW < x < X1 and Y0 < y < Y1) else far(x, y))) for x in gx] for y in gy]

    def keep(i, j, q):
        cx = (gx[i] + gx[i + 1]) / 2; cy = (gy[j] + gy[j + 1]) / 2
        return not (XW < cx < X1 and Y0 < cy < Y1)
    C.grid(Bg, grow, BGG, keep=keep)
    # 四面远山：两圈山脊（发一点冷色光 = 大气透视）
    RANGE = C.flat('bg_range', (0.2, 0.23, 0.28), 1.0, emit=(0.3, 0.34, 0.42), estr=0.18, noise=0.5)
    RANGE2 = C.flat('bg_range2', (0.26, 0.29, 0.35), 1.0, emit=(0.34, 0.38, 0.46), estr=0.22, noise=0.5)
    for (R, hmax, m, sd) in ((9500, 750, RANGE, 1.0), (14000, 1500, RANGE2, 4.0)):
        br = B('bg_range_%d' % R)
        top, bot = [], []
        for i in range(361):
            th = math.tau * i / 360
            rr = R + 900 * fbm(math.cos(th) * 3, math.sin(th) * 3, 2, sd)
            hh = hmax * (0.35 + 0.65 * abs(fbm(math.cos(th) * 6, math.sin(th) * 6, 4, sd)))
            top.append((rr * math.cos(th), rr * math.sin(th), -100 + hh))
            bot.append(((rr + 2500) * math.cos(th), (rr + 2500) * math.sin(th), -300))
        C.grid(br, [top, bot], m)
    # 风里的尘沙 / 细砂条带（半透明竖片，顺风向 +y 拉长；只渲染）
    DUST = bpy.data.materials.new('bg_dust'); nt = DUST.node_tree; nt.nodes.clear()
    o_ = nt.nodes.new('ShaderNodeOutputMaterial'); tr_ = nt.nodes.new('ShaderNodeBsdfTransparent')
    df = nt.nodes.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (0.62, 0.55, 0.44, 1)
    mx_ = nt.nodes.new('ShaderNodeMixShader')
    tcd = nt.nodes.new('ShaderNodeTexCoord'); mpd = nt.nodes.new('ShaderNodeMapping'); mpd.inputs['Scale'].default_value = (1.2, 0.04, 1.6)
    nt.links.new(tcd.outputs['Object'], mpd.inputs['Vector'])
    nd = nt.nodes.new('ShaderNodeTexNoise'); nd.inputs['Scale'].default_value = 1.0; nd.inputs['Detail'].default_value = 6
    nt.links.new(mpd.outputs[0], nd.inputs['Vector'])
    mrd = nt.nodes.new('ShaderNodeMapRange'); mrd.inputs['From Min'].default_value = 0.5; mrd.inputs['From Max'].default_value = 0.72
    mrd.inputs['To Max'].default_value = 0.55
    nt.links.new(nd.outputs['Fac'], mrd.inputs['Value'])
    nt.links.new(mrd.outputs[0], mx_.inputs[0]); nt.links.new(tr_.outputs[0], mx_.inputs[1]); nt.links.new(df.outputs[0], mx_.inputs[2])
    nt.links.new(mx_.outputs[0], o_.inputs['Surface'])
    Bd = B('bg_dust')
    dr = random.Random(5)
    spots = [(dr.uniform(-280, 300), dr.uniform(-100, 180)) for _ in range(26)] + \
            [(ex_c2 + dr.uniform(-30, 60), edge(ex_c2) + dr.uniform(5, 40)) for _ in range(6)] + \
            [(dr.uniform(120, 260), dr.uniform(-110, -40)) for _ in range(10)] + [(dr.uniform(250, 325), dr.uniform(-240, -150)) for _ in range(8)]
    for (x, y) in spots:
        L = dr.uniform(18, 60); hgt = dr.uniform(0.6, 2.2)
        dx_, dy_ = WIND[0] / 0.63 * L, WIND[1] / 0.63 * L
        pts = []
        for k in range(9):
            t = k / 8
            px, py = x + dx_ * t + 1.5 * math.sin(t * 5 + x), y + dy_ * t
            pts.append((px, py, plat(px, py) if py > edge(px) else low(px, py)))
        Bd.poly([(px, py, pz - 0.1) for (px, py, pz) in pts] + [(px, py, pz + hgt * math.sin(math.pi * (k / 8)) ** 0.5 + 0.05)
                                                                 for k, (px, py, pz) in enumerate(pts)],
                [(k, k + 1, 9 + k + 1, 9 + k) for k in range(8)], DUST)
    # 细烟（体积，只渲染）
    for k, (x, y, h) in enumerate([(c[0], c[1], 14 + 3 * c[2]) for c in CRATERS[:3]] + [(c[0], c[1], 10 + 2 * c[2]) for c in CRATERS[5:9]]):
        z0 = plat(x, y) - 0.5
        lean = 0.8
        m = bpy.data.materials.new('bg_smoke_%d' % k)
        nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        pv = nt.nodes.new('ShaderNodeVolumePrincipled'); pv.inputs['Color'].default_value = (0.5, 0.5, 0.5, 1)
        nt.links.new(pv.outputs[0], out.inputs['Volume'])
        tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sp.inputs[0])

        def mth(op, a, b_):
            n_ = nt.nodes.new('ShaderNodeMath'); n_.operation = op
            for i_, v in ((0, a), (1, b_)):
                if isinstance(v, (int, float)):
                    n_.inputs[i_].default_value = v
                else:
                    nt.links.new(v, n_.inputs[i_])
            return n_.outputs[0]
        zr = mth('SUBTRACT', sp.outputs['Z'], z0)
        dx = mth('SUBTRACT', sp.outputs['X'], x + 0.0)
        dy = mth('SUBTRACT', mth('SUBTRACT', sp.outputs['Y'], y + 0.0), mth('MULTIPLY', zr, lean))
        dx = mth('SUBTRACT', dx, mth('MULTIPLY', zr, 0.26))
        dist = mth('SQRT', mth('ADD', mth('MULTIPLY', dx, dx), mth('MULTIPLY', dy, dy)), 0)
        rad = mth('ADD', 0.35, mth('MULTIPLY', zr, 0.09))
        core = mth('MAXIMUM', mth('SUBTRACT', 1.0, mth('DIVIDE', dist, rad)), 0.0)
        nzn = nt.nodes.new('ShaderNodeTexNoise'); nzn.inputs['Scale'].default_value = 0.35; nzn.inputs['Detail'].default_value = 5
        nt.links.new(tc.outputs['Object'], nzn.inputs['Vector'])
        wisp = mth('MAXIMUM', mth('SUBTRACT', nzn.outputs['Fac'], 0.42), 0.0)
        fade = mth('MAXIMUM', mth('SUBTRACT', 1.0, mth('DIVIDE', zr, float(h))), 0.0)
        dens = mth('MULTIPLY', mth('MULTIPLY', mth('MULTIPLY', core, wisp), fade), 14.0)
        nt.links.new(dens, pv.inputs['Density'])
        bs = B('bg_smoke_%d' % k)
        rmax = 0.35 + 0.09 * h + 1
        bs.box(x - rmax, x + rmax + 0.26 * h, y - rmax, y + rmax + lean * h, z0, z0 + h, m)

    objs = B.build_all()

    # ------------------------------------------------ 灯光：阴冷的阴天 + 西南方低角度的一道破云阳光
    C.sky_sun(sc, 'day', sun_az=225.0, sun_el=20.0, sun_e=5.0, sky_s=0.18)
    sun = bpy.data.objects['sun']; sun.data.color = (1.0, 0.76, 0.52); sun.data.angle = math.radians(1.5)
    w = sc.world; nt = w.node_tree
    bg = [n for n in nt.nodes if n.type == 'BACKGROUND'][0]; sk = [n for n in nt.nodes if n.type == 'TEX_SKY'][0]
    # 云层：视线方向噪声 → 灰色阴云；混合少量物理天空
    tcw = nt.nodes.new('ShaderNodeTexCoord')
    cn = nt.nodes.new('ShaderNodeTexNoise'); cn.inputs['Scale'].default_value = 2.2; cn.inputs['Detail'].default_value = 8
    cn.inputs['Roughness'].default_value = 0.6
    nt.links.new(tcw.outputs['Generated'], cn.inputs['Vector'])
    cr = nt.nodes.new('ShaderNodeValToRGB'); el = cr.color_ramp.elements
    el[0].position = 0.35; el[0].color = (0.5, 0.56, 0.66, 1); el[1].position = 0.7; el[1].color = (0.2, 0.23, 0.29, 1)
    nt.links.new(cn.outputs['Fac'], cr.inputs['Fac'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'ADD'
    mx.inputs['Factor'].default_value = 1.0
    sks = nt.nodes.new('ShaderNodeMix'); sks.data_type = 'RGBA'; sks.blend_type = 'MULTIPLY'; sks.inputs['Factor'].default_value = 1.0
    nt.links.new(sk.outputs[0], sks.inputs[6]); sks.inputs[7].default_value = (0.06, 0.06, 0.06, 1)
    nt.links.new(cr.outputs['Color'], mx.inputs[6]); nt.links.new(sks.outputs[2], mx.inputs[7])
    nt.links.new(mx.outputs[2], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.22

    sc.view_settings.exposure = 0.4
    if A['exposure']:
        sc.view_settings.exposure = float(A['exposure'])
    ex = min(range(-150, 40), key=edge) * 1.0; ey = edge(ex)   # 崖线最突出的岬角
    p1 = P[len(P) * 3 // 4]
    CAMS = {
        'c1': ((215, -245, 150), (-12, 10, -15), 26),
        'c2': ((ex - 6, ey + 3.0, plat(ex, ey) + 4.5), (ex + 150, edge(ex + 150) - 40, -85), 20),
        'c3': ((P[-1][0] + 45, P[-1][1] - 30, PZ[-1] + 14), (P[len(P) // 2][0], P[len(P) // 2][1], PZ[len(P) // 2]), 28),
    }
    pos, tgt, lens = CAMS[A['cam']]
    cam = C.camera(sc, pos, tgt, lens)
    cam.data.clip_end = 30000
    msg = 'plateau_centre=(-40,40,%.1f) cliff_edge=(%.1f,%.1f,%.1f) trail_start=(%.1f,%.1f,%.1f) trail_end=(%.1f,%.1f,%.1f)\n' % (
        plat(-40, 40), ex, ey, plat(ex, ey), P[0][0], P[0][1], PZ[0], P[-1][0], P[-1][1], PZ[-1])
    for o in objs:
        msg += 'OBJ %s tris=%d\n' % (o.name, sum(len(p.vertices) - 2 for p in o.data.polygons))
    print(msg)
    if A['log']:
        with open(A['log'], 'w') as f:
            f.write(msg)
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
