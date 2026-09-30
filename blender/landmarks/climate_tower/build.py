"""以太气候调节塔（上层）：只做塔的顶段（约 700–950 m）+ 塔冠。
与 blender/tiancheng_upper.py 150–176 行的地图表现一致：直径约 40 m 的深色石塔、近顶处外伸环台、金色冠环、
塔顶上方悬浮的细长发光以太晶体、云面上一圈淡青光晕。
本模型：带竖向凹槽的深色石塔身 + 竖向钢肋 + 检修爬梯 / 升降轨；三圈环台（只用素色环带区分编号，无数字无文字）
+ 栏杆；环台外伸的放射状发射叶片与以太导管；环台上的小型检修悬浮艇泊位；换气百叶；金色冠环；悬浮晶冠。
bg_*（云海、光晕、远处浮岛、没入云中的下段塔身、被塑形的云气）只为渲染，export_glb.py 不导出。
中立：无人物、无文字、无徽记、无武器。坐标：塔心 (0,0)，z 为真实高度（米）。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/climate_tower/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/ct.jpg [--blend /tmp/ct.blend] [--log /tmp/ct.log]
cam: c1 近处浮岛高度看全塔顶段 / c2 二号环台上顺着叶片看 / c3 仰看晶冠
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', res='900', samples='24', out='/tmp/ct.jpg', blend='', log='', exposure=''))

R0 = 20.0                     # 塔身半径
ZB, ZT = 690.0, 950.0         # 导出段底 / 塔顶
CLOUD_Z = 705.0               # 云海顶面
RINGS = [(800.0, 36.0), (870.0, 34.0), (928.0, 31.0)]   # 一 / 二 / 三号环台：台面高、外半径
CROWN_Z = 956.0


def main():
    import bpy
    from mathutils import Matrix, Vector
    sc = C.setup(A['samples'])
    if C.CACHED: return C.render_cached(sc, A['out'], A['blend'])   # --cache-blend 命中：场景已从缓存载入，跳过搭建直接渲染
    Batch = C.Batch
    AETHER = (0.62, 0.9, 1.0)

    def crys_mat():
        m, nt, b = C.new_mat('ct_crystal')
        b.inputs['Base Color'].default_value = (0.02, 0.4, 0.75, 1)
        b.inputs['Roughness'].default_value = 0.04
        b.inputs['Transmission Weight'].default_value = 0.4
        b.inputs['IOR'].default_value = 1.5
        b.inputs['Emission Color'].default_value = (0.0, 0.65, 1.0, 1)
        b.inputs['Emission Strength'].default_value = 3.5
        return m

    def shell_mat():
        m = bpy.data.materials.new('bg_crystal_halo'); nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs[0].default_value = 0.35
        inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
        nt.links.new(lw.outputs['Facing'], inv.inputs[1])
        mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 0.15
        nt.links.new(inv.outputs[0], mul.inputs[0])
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (0.1, 0.8, 1.0, 1); em.inputs['Strength'].default_value = 1.0
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(mul.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
        return m

    STONE = C.ashlar('ct_darkstone', c=(0.16, 0.15, 0.14), course=1.2, block=2.6, joint=0.03, jc=(0.02, 0.02, 0.022), var=0.1, rough=0.85)
    STONE2 = C.flat('ct_stone_band', (0.12, 0.12, 0.125), 0.8, noise=0.3)
    STEEL = C.flat('ct_steel', (0.22, 0.24, 0.26), 0.35, metal=0.85)
    DSTEEL = C.flat('ct_dark_steel', (0.05, 0.055, 0.06), 0.45, metal=0.7)
    DECK = C.pbr('ct_deck', 'hangar_concrete_floor', 5.0, tint=(0.62, 0.63, 0.66), sat=0.3)
    BAND = C.flat('ct_ring_band', (0.72, 0.74, 0.76), 0.5)                    # 环台编号：素色环带
    GOLD = C.flat('ct_gold', (0.9, 0.68, 0.3), 0.22, metal=1.0)
    GLOW = C.flat('ct_aether_line', (0.3, 0.75, 0.95), 0.3, emit=(0.28, 0.78, 1.0), estr=1.4)      # 强度别高过约 1.5：烘焙时会剪成纯白（glb 里成了白块 / 白条）
    GLOW2 = C.flat('ct_aether_dim', (0.25, 0.55, 0.8), 0.3, emit=(0.25, 0.65, 0.95), estr=0.7)
    CRYS = crys_mat()
    CORE = C.flat('ct_crystal_core', (0.3, 0.9, 1.0), 0.2, emit=(0.05, 0.75, 1.0), estr=7.0)
    CRYS_OLD = C.flat('ct_crystal', (0.75, 0.95, 1.0), 0.05, emit=(0.5, 0.88, 1.0), estr=9.0, coat=1.0)
    LOUV = C.flat('ct_louvre', (0.12, 0.13, 0.14), 0.5, metal=0.6)
    VENT = C.flat('ct_vent_dark', (0.01, 0.012, 0.014), 0.9)
    CRAFT = C.flat('ct_craft', (0.62, 0.64, 0.66), 0.3, metal=0.5, coat=0.5)
    CGL = C.glass('ct_craft_glass', tint=(0.03, 0.05, 0.06))
    HAZ = C.hazard('ct_pad_edge', c1=(0.75, 0.6, 0.12))

    TIPS = []
    W = Batch('walls_ext'); RG = Batch('props_rings'); VN = Batch('props_vanes'); CR = Batch('props_crown')
    CY = Batch('props_crystals'); DK = Batch('props_docks'); LT = Batch('props_lights'); SV = Batch('props_services')

    def rot(a):
        return Matrix.Rotation(a, 4, 'Z')

    def rbox(B, a, r0, r1, w, z0, z1, m):
        """径向盒：沿角度 a 方向从 r0 到 r1，宽 w"""
        B.box(r0, r1, -w / 2, w / 2, z0, z1, m, mat=rot(a))

    def ring_tube(B, r, z, rad, m, n=96, k=8):
        B.tube([(r * math.cos(i * math.tau / n), r * math.sin(i * math.tau / n), z) for i in range(n)], rad, m, n=k, closed=True)
        # closed=True 只是去掉端盖；补最后一段
        B.tube([(r * math.cos(-math.tau / n), r * math.sin(-math.tau / n), z), (r, 0, z)], rad, m, n=k)

    # ------------------------------------------------------------ 塔身：带 32 道凹槽的深色石柱
    NF = 32; NS = NF * 4
    zs = [ZB + k * (ZT - ZB) / 13 for k in range(14)]
    def tp(z):   # 向上略收分
        return 1.0 - 0.035 * (z - ZB) / (ZT - ZB)
    def rr(i):
        t = (i % 4)
        return R0 - (0.9 if t in (1, 2) else 0.0)
    rows = [[(rr(i) * tp(z) * math.cos(i * math.tau / NS), rr(i) * tp(z) * math.sin(i * math.tau / NS), z) for i in range(NS + 1)] for z in zs]
    C.grid(W, rows, STONE, smooth=False)
    for i in range(NF):   # 凹槽里的以太导管（发光线）
        a = (i * 4 + 1.5) * math.tau / NS
        rg = random.Random(i * 13 + 5); z = ZB
        while z < ZT - 8:   # 分段、长短不一、宽窄不一的发光线
            seg = rg.uniform(6, 30)
            if rg.random() < 0.18 and i % 3 != 1:
                w = rg.choice((0.18, 0.3, 0.45))
                rbox(LT, a, R0 - 0.95, R0 - 0.6, w, z, min(z + seg, ZT - 4), GLOW if rg.random() < 0.7 else GLOW2)
            z += seg + rg.uniform(2, 14)
    for i in range(NF):   # 凹槽之间的竖向钢肋
        a = i * 4 * math.tau / NS + 0.5 * math.tau / NS
        rbox(W, a, R0 - 1.2, R0 + 0.45, 0.6, ZB, ZT - 2, DSTEEL)
    # 石带（每 26 m 一道横向深色石箍）
    for z in range(700, 945, 20):   # 每 20 m 一道石带（束腰线脚）
        if any(abs(z - zr_) < 5 for (zr_, _) in RINGS):
            continue
        W.lathe(0, 0, z, [(R0 * tp(z) + 0.55, 0), (R0 * tp(z) + 0.95, 0.4), (R0 * tp(z) + 0.95, 1.3), (R0 * tp(z) + 0.55, 1.7)], STONE2, n=NS // 2, smooth=False)
    # 塔顶檐口 + 顶盘
    W.lathe(0, 0, ZT - 6, [(R0 + 0.6, 0), (R0 + 1.6, 1.5), (R0 + 1.6, 4.0), (R0 + 2.6, 5.0), (R0 + 2.6, 6.0), (R0 - 2, 6.0), (0.01, 6.3)], STONE2, n=96)
    # 换气百叶：各环台之间，一圈 8 组斜百叶窗
    for (zc, h) in ((760, 16), (835, 14), (900, 12)):
        for k in range(8):
            a = (k + 0.5) * math.tau / 8
            M = rot(a)
            W.box(R0 - 0.2, R0 + 0.3, -3.6, 3.6, zc, zc + h, VENT, mat=M)
            for j in range(int(h / 0.9)):
                z = zc + 0.4 + j * 0.9
                SV.poly([(R0 + 0.3, -3.4, z), (R0 + 0.3, 3.4, z), (R0 + 1.0, 3.4, z + 0.55), (R0 + 1.0, -3.4, z + 0.55)], [(0, 1, 2, 3), (3, 2, 1, 0)], LOUV, mat=M)
            SV.box(R0 + 0.2, R0 + 1.1, -3.8, -3.5, zc, zc + h, STEEL, mat=M)
            SV.box(R0 + 0.2, R0 + 1.1, 3.5, 3.8, zc, zc + h, STEEL, mat=M)
    # 检修爬梯（两道，带护笼箍）+ 升降轨与轿厢
    for a in (math.radians(100), math.radians(280)):
        M = rot(a)
        for s in (-0.3, 0.3):
            SV.box(R0 + 0.6, R0 + 0.72, s - 0.04, s + 0.04, ZB, ZT - 2, STEEL, mat=M)
        z = ZB
        while z < ZT - 3:
            SV.box(R0 + 0.62, R0 + 0.7, -0.3, 0.3, z, z + 0.05, STEEL, mat=M)
            z += 0.6
        z = ZB
        while z < ZT - 3:
            SV.box(R0 + 0.6, R0 + 1.5, -0.55, -0.5, z, z + 0.08, STEEL, mat=M)
            SV.box(R0 + 0.6, R0 + 1.5, 0.5, 0.55, z, z + 0.08, STEEL, mat=M)
            SV.box(R0 + 1.45, R0 + 1.5, -0.55, 0.55, z, z + 0.08, STEEL, mat=M)
            z += 3.0
    for a in (math.radians(190),):
        M = rot(a)
        for s in (-1.4, 1.4):
            SV.box(R0 + 0.5, R0 + 1.0, s - 0.15, s + 0.15, ZB, ZT - 2, STEEL, mat=M)
        for zc in (782.0, 905.0):
            SV.box(R0 + 1.0, R0 + 3.6, -1.7, 1.7, zc, zc + 3.2, CRAFT, mat=M)
            SV.box(R0 + 3.6, R0 + 3.7, -1.3, 1.3, zc + 1.2, zc + 2.8, CGL, mat=M)

    # ------------------------------------------------------------ 三圈环台
    for ri, (zr, ro) in enumerate(RINGS):
        # 台板（外缘斜切）+ 下挑檐 + 编号环带（1 / 2 / 3 道素色环带）
        RG.lathe(0, 0, zr - 2.4, [(R0 + 0.4, 0), (ro - 3, 0), (ro, 1.2), (ro, 2.4), (R0 + 0.4, 2.4)], DECK, n=96, smooth=False)
        RG.lathe(0, 0, zr - 2.4, [(ro - 3, 0), (R0 + 0.4, 0), (R0 + 0.3, -4)], STONE2, n=96, smooth=False)
        for b in range(ri + 1):
            RG.lathe(0, 0, zr - 2.25 + b * 0.55, [(ro + 0.12, 0), (ro + 0.12, 0.3)], BAND, n=96, smooth=False)
        for b in range(ri + 1):   # 台面上靠内的一圈素色地面环带（同样按圈数）
            RG.lathe(0, 0, zr + 0.01, [(R0 + 3 + b * 1.0, 0), (R0 + 3.5 + b * 1.0, 0)], BAND, n=96, smooth=False)
        # 下方钢悬挑桁架：上弦 + 斜撑 + 竖杆，外缘边梁 + 封檐板
        for k in range(24):
            M = rot(k * math.tau / 24)
            RG.box(R0 - 0.5, ro - 1.2, -0.3, 0.3, zr - 3.2, zr - 2.4, DSTEEL, mat=M)
            RG.strip([tuple(M @ Vector((R0 - 0.3, 0, zr - 13))), tuple(M @ Vector((ro - 1.6, 0, zr - 3.0)))], 0.45, 0.45, DSTEEL)
            xm = (R0 + ro) / 2
            RG.strip([tuple(M @ Vector((xm, 0, zr - 3.1))), tuple(M @ Vector((xm, 0, zr - 3.1 - (xm - R0) / (ro - 1.6 - R0) * 0 - (1 - (xm - R0) / (ro - 1.6 - R0)) * 10)))], 0.25, 0.25, STEEL)
            RG.boxc(*(M @ Vector((R0 + 0.2, 0, 0))).xy, zr - 14, 1.2, 1.2, 1.6, DSTEEL, mat=None)
        RG.lathe(0, 0, zr - 3.6, [(ro - 1.6, 0), (ro + 0.25, 0), (ro + 0.25, 1.2), (ro - 1.6, 1.2)], DSTEEL, n=96, smooth=False)   # 边梁
        RG.lathe(0, 0, zr - 2.5, [(ro + 0.08, 0), (ro + 0.08, 2.5)], STEEL, n=96, smooth=False)   # 封檐板
        # 栏杆：立柱 + 扶手 + 中栏
        rp = ro - 0.4; npst = int(math.tau * rp / 2.4)
        for k in range(npst):
            a = k * math.tau / npst
            RG.boxc(rp * math.cos(a), rp * math.sin(a), zr, 0.1, 0.1, 1.15, STEEL)
        ring_tube(RG, rp, zr + 1.15, 0.05, STEEL, n=96, k=6)
        ring_tube(RG, rp, zr + 0.6, 0.03, STEEL, n=96, k=4)
        ring_tube(LT, ro - 0.2, zr + 0.05, 0.08, GLOW, n=96, k=4)   # 台边冷光灯带
        # 放射状发射叶片（12 片）：从栏杆外伸，外缘一道以太发光边
        nv = 12
        L = 16.0 - ri * 2.0
        for k in range(nv):
            a = (k + 0.5 * (ri % 2)) * math.tau / nv
            h0, h1 = 3.6, 1.4
            M = rot(a)
            # 箱形截面发射叶片：安装座 + 铰节 + 作动筒 + 百叶格栅 + 外缘发射尖
            def hz(t):
                return zr + 0.6 + 0.5 * t, zr + h0 - (h0 - h1 - 0.5) * t
            x0v, x1v = ro + 0.5, ro + L
            def bw(t):
                return 0.45 - 0.25 * t
            vs = []
            for t in (0.0, 1.0):
                x = x0v + t * (x1v - x0v); z0, z1 = hz(t); w = bw(t)
                vs += [(x, -w, z0), (x, w, z0), (x, w, z1), (x, -w, z1)]
            VN.poly(vs, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 4, 7, 3), (1, 2, 6, 5), (0, 1, 5, 4), (3, 7, 6, 2)], DSTEEL, mat=M)
            for j in range(1, 6):   # 两侧百叶格栅（斜片）
                t = j / 6.0; x = x0v + t * (x1v - x0v); z0, z1 = hz(t); w = bw(t) + 0.02
                for s_ in (-1, 1):
                    VN.box(x - 0.75, x + 0.75, s_ * w - 0.03, s_ * w + 0.03, z0 + 0.25, z1 - 0.25, VENT, mat=M)
                    zz = z0 + 0.35
                    while zz < z1 - 0.45:
                        VN.poly([(x - 0.7, s_ * (w + 0.02), zz), (x + 0.7, s_ * (w + 0.02), zz), (x + 0.7, s_ * (w + 0.14), zz + 0.2), (x - 0.7, s_ * (w + 0.14), zz + 0.2)],
                                [(0, 1, 2, 3), (3, 2, 1, 0)], STEEL, mat=M)
                        zz += 0.32
                VN.box(x + 0.8, x + 0.95, -w - 0.05, w + 0.05, z0 - 0.02, z1 + 0.02, STEEL, mat=M)   # 箍板
            z0b, z1b = hz(1)
            VN.poly([(x1v, -0.2, z0b), (x1v, 0.2, z0b), (x1v + 1.6, 0, (z0b + z1b) / 2), (x1v, -0.2, z1b), (x1v, 0.2, z1b)],
                    [(0, 2, 1), (3, 4, 2), (0, 3, 2), (1, 2, 4)], GLOW, mat=M)
            TIPS.append((tuple(M @ Vector((x1v + 1.6, 0, (z0b + z1b) / 2))), a))
            # 安装座（落在台板上）+ 铰节
            VN.box(ro - 3.2, ro + 0.6, -0.9, 0.9, zr, zr + 0.35, STEEL, mat=M)
            for s_ in (-1, 1):
                VN.box(ro - 0.4, ro + 0.4, s_ * 0.55 - 0.1, s_ * 0.55 + 0.1, zr + 0.35, zr + 2.6, STEEL, mat=M)
            VN.tube([tuple(M @ Vector((ro, -0.75, zr + 1.5))), tuple(M @ Vector((ro, 0.75, zr + 1.5)))], 0.38, DSTEEL, n=12)
            for s_ in (-1, 1):   # 作动筒：缸体 + 活塞杆
                pa_ = M @ Vector((ro - 2.9, s_ * 0.5, zr + 0.4)); pm_ = M @ Vector((ro - 0.4, s_ * 0.5, zr + 2.6)); pb_ = M @ Vector((ro + 2.2, s_ * 0.5, zr + 3.4))
                VN.tube([tuple(pa_), tuple(pa_.lerp(pm_, 0.6))], 0.2, STEEL, n=8)
                VN.tube([tuple(pa_.lerp(pm_, 0.55)), tuple(pb_)], 0.08, GOLD, n=6)
            # 以太导管：从塔身沿叶片根部接出
            p0 = M @ Vector((R0 + 0.6, 0, zr + 3.0)); p1 = M @ Vector((ro - 1.5, 0, zr + 3.0)); p2 = M @ Vector((ro - 3.0, 0, zr + 0.3))
            VN.tube([tuple(p0), tuple(p1), tuple(p2)], 0.13, STEEL, n=6)
            q0 = M @ Vector((R0 + 0.6, 0, zr + 3.0))
            VN.cyl(q0.x, q0.y, q0.z - 0.3, 0.22, 0.6, GLOW, 8)
        # 检修舱门（塔身上）+ 小吊臂
        ah = math.radians(70 + 25 * ri); Mh = rot(ah); rh = R0 * tp(zr) + 0.45
        W.box(rh - 0.2, rh + 0.35, -1.6, 1.6, zr, zr + 3.4, STEEL, mat=Mh)
        W.box(rh + 0.3, rh + 0.4, -1.3, 1.3, zr + 0.05, zr + 3.0, DSTEEL, mat=Mh)
        W.box(rh + 0.38, rh + 0.48, 0.9, 1.1, zr + 1.3, zr + 1.6, STEEL, mat=Mh)
        LT.box(rh + 0.3, rh + 0.5, -0.3, 0.3, zr + 3.1, zr + 3.3, GLOW, mat=Mh)
        dv = Mh @ Vector((ro - 2.0, 3.5, 0))
        SV.cyl(dv.x, dv.y, zr, 0.5, 0.3, STEEL, 12)
        SV.cyl(dv.x, dv.y, zr + 0.3, 0.2, 4.2, HAZ, 10)
        tip_ = Mh @ Vector((ro + 1.8, 3.5, 0))
        SV.tube([(dv.x, dv.y, zr + 4.3), (tip_.x, tip_.y, zr + 4.6)], 0.14, HAZ, n=8)
        SV.tube([(tip_.x, tip_.y, zr + 4.6), (tip_.x, tip_.y, zr + 1.8)], 0.02, DSTEEL, n=4)
        SV.boxc(tip_.x, tip_.y, zr + 1.5, 0.3, 0.3, 0.3, DSTEEL)
        if ri == 2:   # 三号环停机检修：黄黑警示路障（无文字）
            for k in range(10):
                Mb = rot(k * math.tau / 10 + 0.15)
                for s_ in (-1, 1):
                    SV.box(R0 + 4.0, R0 + 4.12, s_ * 1.3 - 0.06, s_ * 1.3 + 0.06, zr, zr + 1.05, DSTEEL, mat=Mb)
                SV.box(R0 + 3.95, R0 + 4.17, -1.45, 1.45, zr + 0.7, zr + 1.05, HAZ, mat=Mb)
                SV.box(R0 + 3.95, R0 + 4.17, -1.45, 1.45, zr + 0.25, zr + 0.45, HAZ, mat=Mb)
        # 检修悬浮艇泊位（两处）：外挑小平台 + 停着的小艇
        for dk in range(2):
            a = math.radians(35 + 180 * dk + 40 * ri)
            M = rot(a)
            DK.box(ro - 1, ro + 9, -4.5, 4.5, zr - 0.8, zr, DECK, mat=M)
            DK.box(ro - 1, ro + 9.2, -4.7, 4.7, zr - 1.2, zr - 0.8, DSTEEL, mat=M)
            DK.box(ro + 8.8, ro + 9.2, -4.7, 4.7, zr, zr + 0.06, HAZ, mat=M)
            for s in (-1, 1):
                DK.box(ro - 1, ro + 9.2, s * 4.5 - 0.05, s * 4.5 + 0.05, zr + 1.0, zr + 1.1, STEEL, mat=M)
                for x in (ro + 1, ro + 4, ro + 7, ro + 9):
                    DK.box(x - 0.05, x + 0.05, s * 4.5 - 0.05, s * 4.5 + 0.05, zr, zr + 1.1, STEEL, mat=M)
                p = M @ Vector((ro + 8.6, s * 4.3, zr))
                LT.cyl(p.x, p.y, p.z, 0.12, 0.5, GLOW, 8)
            c = M @ Vector((ro + 4.2, 0, zr + 1.1))
            ca = a
            T = Matrix.Translation(c) @ rot(ca)
            # 小艇：流线艇身 + 座舱罩 + 两侧涵道
            b = Batch.get('props_docks')
            tmp = Batch('_tmp_craft')
            tmp.sphere(0, 0, 0, 1.0, CRAFT, sz=0.45, seg=16, rings=8, sx=2.4)
            tmp.sphere(0.5, 0, 0.25, 0.7, CGL, sz=0.5, seg=12, rings=6, sx=1.4, zmin=0.0)
            for s in (-1, 1):
                tmp.cyl(-0.4, s * 1.5, -0.25, 0.6, 0.35, CRAFT, 16)
                tmp.cyl(-0.4, s * 1.5, -0.27, 0.48, 0.02, GLOW, 12)
                tmp.box(-0.7, -0.1, s * 0.7, s * 1.0, -0.15, 0.05, CRAFT)
            for f in tmp.bm.faces:
                m = tmp.mats[f.material_index]
                b.poly([tuple(T @ v.co) for v in f.verts], [tuple(range(len(f.verts)))], m, smooth=f.smooth)
            tmp.bm.free(); del Batch.ALL['_tmp_craft']

    # ------------------------------------------------------------ 金色冠环 + 支柱
    CR.lathe(0, 0, CROWN_Z, [(23.0, 0), (25.0, 0.6), (25.4, 1.6), (24.6, 2.6), (22.6, 2.8), (22.2, 1.2), (23.0, 0)], GOLD, n=128)
    for k in range(16):
        a = k * math.tau / 16
        p0 = (R0 * 0.9 * math.cos(a), R0 * 0.9 * math.sin(a), ZT + 0.5)
        p1 = (23.4 * math.cos(a), 23.4 * math.sin(a), CROWN_Z + 0.3)
        CR.tube([p0, p1], 0.35, GOLD, n=8)
        pa = (23.8 * math.cos(a), 23.8 * math.sin(a), CROWN_Z + 2.7)
        CR.cyl(*pa, 0.35, 3.0 + 1.5 * (k % 2), GOLD, 8, r2=0.02)
    CC = (0, 0, ZT + 38.0)   # 晶簇中心
    for k in range(6):   # 冠环上的托座 + 6 支向内指向晶簇的场发射尖
        a = k * math.tau / 6 + 0.26
        px, py = 24.0 * math.cos(a), 24.0 * math.sin(a)
        CR.cyl(px, py, CROWN_Z + 2.6, 1.3, 1.2, GOLD, 12, r2=1.0)
        CR.cyl(px, py, CROWN_Z + 3.8, 0.7, 3.0, DSTEEL, 10, r2=0.55)
        base = Vector((px, py, CROWN_Z + 6.8)); d_ = (Vector(CC) - base)
        tip = base + d_ * 0.55
        CR.tube([tuple(base), tuple(base.lerp(tip, 0.35)), tuple(tip)], 0.45, GOLD, n=10)
        CR.tube([tuple(base.lerp(tip, 0.3)), tuple(base.lerp(tip, 0.45))], 0.75, DSTEEL, n=10)
        q = tip + d_.normalized() * 1.2
        CY.poly([tuple(tip + Vector((0.4, 0, 0))), tuple(tip + Vector((-0.4, 0, 0))), tuple(tip + Vector((0, 0.4, 0))), tuple(tip + Vector((0, -0.4, 0))), tuple(q)],
                [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4)], CORE)
    # 顶盘中央的发射基座（晶冠托座）
    CR.lathe(0, 0, ZT + 0.3, [(9, 0), (9, 1.2), (6, 3.0), (4, 3.4), (4, 4.0), (0.01, 4.0)], DSTEEL, n=64)
    for k in range(8):
        a = k * math.tau / 8
        CR.tube([(8.5 * math.cos(a), 8.5 * math.sin(a), ZT + 1.3), (5.5 * math.cos(a), 5.5 * math.sin(a), ZT + 6), (3 * math.cos(a), 3 * math.sin(a), ZT + 9)], 0.3, GOLD, n=6)
    LT.lathe(0, 0, ZT + 4.1, [(3.8, 0), (0.01, 0)], GLOW2, n=32)

    # ------------------------------------------------------------ 悬浮晶冠：细长六棱双锥晶体
    SHELL = shell_mat(); HB = Batch('bg_crystal_halo')
    def bipyr(B, Mc, r, h, m, seg):
        vs = [(0, 0, -h * 0.42)] + [(r * math.cos(i * math.tau / seg), r * math.sin(i * math.tau / seg), 0) for i in range(seg)] + [(0, 0, h * 0.58)]
        top = seg + 1
        fs = [(0, 1 + (i + 1) % seg, 1 + i) for i in range(seg)] + [(1 + i, 1 + (i + 1) % seg, top) for i in range(seg)]
        B.poly(vs, fs, m, mat=Mc)

    def crystal(x, y, z, r, h, tilt, az, seg=6):
        Mc = Matrix.Translation((x, y, z)) @ rot(az) @ Matrix.Rotation(tilt, 4, 'Y')
        bipyr(CY, Mc, r, h, CRYS, seg)
        bipyr(CY, Mc, r * 0.3, h * 0.7, CORE, 4)
        bipyr(HB, Mc, r * 1.7, h * 1.12, SHELL, 8)
    crystal(0, 0, ZT + 40, 3.6, 40, 0, 0.3)          # 主晶
    for j in range(8):                                 # 内圈：8 支等距等高
        a = j * math.tau / 8
        crystal(8.5 * math.cos(a), 8.5 * math.sin(a), ZT + 34, 1.5, 18, math.radians(10), a + math.pi)
    for j in range(12):                                # 外圈：12 支小晶
        a = (j + 0.5) * math.tau / 12
        crystal(14.5 * math.cos(a), 14.5 * math.sin(a), ZT + 30, 0.8, 9, math.radians(18), a + math.pi)
    C.point_light('crown_core', (0, 0, ZT + 40), 60000, AETHER, 3.0)
    for j in range(3):
        a = j * math.tau / 3
        C.point_light('crown_%d' % j, (12 * math.cos(a), 12 * math.sin(a), ZT + 34), 12000, AETHER, 2.0)

    # ------------------------------------------------------------ 背景
    def cloud_mat():
        m, nt, b = C.new_mat('bg_cloud_sea')
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.006, 0.006, 0.006)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.0; nz.inputs['Detail'].default_value = 10
        nz.inputs['Roughness'].default_value = 0.62
        nt.links.new(mp.outputs[0], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 0.35; mr.inputs['From Max'].default_value = 0.7
        mr.inputs['To Min'].default_value = 0.55; mr.inputs['To Max'].default_value = 0.88
        nt.links.new(nz.outputs[0], mr.inputs['Value'])
        cm = nt.nodes.new('ShaderNodeCombineColor')
        for i in range(3):
            nt.links.new(mr.outputs[0], cm.inputs[i])
        nt.links.new(cm.outputs[0], b.inputs['Base Color'])
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.9; bp.inputs['Distance'].default_value = 8.0
        nt.links.new(nz.outputs[0], bp.inputs['Height']); nt.links.new(bp.outputs[0], b.inputs['Normal'])
        b.inputs['Roughness'].default_value = 1.0
        b.inputs['Subsurface Weight'].default_value = 0.3
        return m

    def glow_fade(name, col, strength, r_in, r_out, alpha):
        """径向淡出的透明发光（光晕 / 云气）：以对象坐标到塔轴距离做衰减"""
        m = bpy.data.materials.new(name); nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Object'], sep.inputs[0])
        mx_ = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(sep.outputs[0], mx_.inputs[0]); nt.links.new(sep.outputs[1], mx_.inputs[1])
        ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; nt.links.new(mx_.outputs[0], ln.inputs[0])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = r_in; mr.inputs['From Max'].default_value = r_out
        mr.inputs['To Min'].default_value = alpha; mr.inputs['To Max'].default_value = 0.0
        nt.links.new(ln.outputs['Value'], mr.inputs['Value'])
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.03; nz.inputs['Detail'].default_value = 4
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
        nt.links.new(mr.outputs[0], mul.inputs[0]); nt.links.new(nz.outputs[0], mul.inputs[1])
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*col, 1); em.inputs['Strength'].default_value = strength
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(mul.outputs[0], mix.inputs[0]); nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs[0])
        return m

    CLOUD = cloud_mat()

    def sheet_mat(name, alpha, bright, scale, seed):
        m = bpy.data.materials.new(name); nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale, scale); mp.inputs['Location'].default_value = (seed * 3.1, seed * 1.7, 0)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.0; nz.inputs['Detail'].default_value = 8; nz.inputs['Roughness'].default_value = 0.6
        nt.links.new(mp.outputs[0], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.38; mr.inputs['From Max'].default_value = 0.68
        mr.inputs['To Min'].default_value = 0.0; mr.inputs['To Max'].default_value = alpha
        nt.links.new(nz.outputs[0], mr.inputs['Value'])
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        b.inputs['Base Color'].default_value = (bright, bright, bright * 1.02, 1); b.inputs['Roughness'].default_value = 1.0
        b.inputs['Subsurface Weight'].default_value = 0.4
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.6; bp.inputs['Distance'].default_value = 6.0
        nt.links.new(nz.outputs[0], bp.inputs['Height']); nt.links.new(bp.outputs[0], b.inputs['Normal'])
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(mr.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(b.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
        return m
    cl = Batch('bg_clouds')
    cl.box(-8000, 8000, -8000, 8000, CLOUD_Z - 80, CLOUD_Z - 60, CLOUD)
    from mathutils import noise as _nz
    for li, (dz, amp, sc_, al, br) in enumerate(((-45, 18, 0.004, 1.0, 0.8), (-28, 14, 0.006, 0.85, 0.88), (-14, 10, 0.009, 0.6, 0.95), (-3, 7, 0.013, 0.35, 1.0))):
        sm = sheet_mat('bg_cloud_sheet_%d' % li, al, br, sc_ * 1.3, li)
        sb = Batch('bg_cloud_sheet_%d' % li)
        N = 70; E = 3200.0; off = Vector((li * 37.0, li * 11.0, 0))
        rows = []
        for j in range(N + 1):
            row = []
            for i in range(N + 1):
                x = -E + 2 * E * i / N; y = -E + 2 * E * j / N
                d = math.hypot(x, y)
                h = _nz.fractal(Vector((x * sc_, y * sc_, li)) + off, 0.6, 2.0, 4) * amp
                h *= min(1.0, max(0.15, (d - 30) / 150))   # 塔身附近被「梳平」
                row.append((x, y, CLOUD_Z + dz + h))
            rows.append(row)
        C.grid(sb, rows, sm)
    rnd = random.Random(8)
    for k in range(0):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(45, 2600)
        x, y = d * math.cos(a), d * math.sin(a)
        for j in range(3):
            cl.sphere(x + rnd.uniform(-60, 60), y + rnd.uniform(-60, 60), CLOUD_Z - 15, rnd.uniform(40, 120) * (0.4 if d < 200 else 1), CLOUD, sz=0.22, seg=16, rings=8, zmin=-0.1)
    # 下段塔身（没入云中）
    lo = Batch('bg_lower_shaft')
    lo.cyl(0, 0, 300, R0, ZB - 300 + 1, STONE, 64)
    # 云面光晕
    hb = Batch('bg_halo')
    hb.cyl(0, 0, CLOUD_Z + 5.0, 420, 0.1, glow_fade('bg_halo', (0.3, 0.85, 1.0), 16.0, 25, 420, 1.0), 96, cap=True, smooth=False)
    # 被塑形的云气：绕塔的几圈扁平螺旋云带（半透明白）
    wisp = glow_fade('bg_wisp', (0.92, 0.96, 1.0), 1.3, 20, 120, 0.8)
    MIST = glow_fade('bg_mist', (0.35, 0.88, 1.0), 4.0, 25, 140, 0.95)
    mb = Batch('bg_mist')
    rm = random.Random(4)
    for (tp_, a0) in TIPS:
        n = 14; vs = []; fs = []; ln = rm.uniform(40, 70); cw = rm.choice((-1, 1))
        for i in range(n + 1):
            t = i / n
            r_ = math.hypot(tp_[0], tp_[1]) + ln * t
            a_ = a0 + cw * 0.35 * t * t
            z_ = tp_[2] - 14 * t * t + 2 * math.sin(t * 5 + a0)
            w_ = 0.8 + 9 * t
            c_, s_ = math.cos(a_), math.sin(a_)
            vs.append((r_ * c_ - s_ * w_ / 2, r_ * s_ + c_ * w_ / 2, z_))
            vs.append((r_ * c_ + s_ * w_ / 2, r_ * s_ - c_ * w_ / 2, z_ + 0.3))
        for i in range(n):
            fs.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
        mb.poly(vs, fs, MIST, smooth=True)
    wb = Batch('bg_wisps')
    for (z, r, w) in ((760, 60, 24), (835, 52, 18), (905, 45, 14)):
        n = 64; vs = []; fs = []
        for i in range(n + 1):
            a = i * math.tau * 1.15 / n
            rz = z + 10 * i / n
            vs.append(((r - w / 2) * math.cos(a), (r - w / 2) * math.sin(a), rz))
            vs.append(((r + w / 2) * math.cos(a), (r + w / 2) * math.sin(a), rz + 3))
        for i in range(n):
            fs.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
        wb.poly(vs, fs, wisp, smooth=True)
    # 远处浮岛（庄园）
    FAR = C.flat('bg_far_island', (0.4, 0.44, 0.5), 0.95, noise=0.2)
    ROCKF = C.flat('bg_far_rock', (0.3, 0.29, 0.3), 0.95, noise=0.4)
    TREEF = C.flat('bg_far_tree', (0.16, 0.24, 0.18), 0.9, noise=0.3)
    FARG = C.flat('bg_far_green', (0.3, 0.38, 0.33), 0.95, noise=0.2)
    for (fx, fy, fz, fr, seed) in ((-900, 250, 830, 110, 22), (700, 900, 790, 90, 23), (-1500, 1300, 860, 160, 24), (-500, 1600, 780, 120, 25)):
        fi = Batch('bg_far_island_%d' % seed)
        r2 = random.Random(seed); n = 40
        n = 36; rows = []
        for j in range(9):   # 圆润的草顶（低矮穹面）
            t = j / 8
            row = []
            for i in range(n + 1):
                a_ = i * math.tau / n; w = 1 + 0.06 * math.sin(3 * a_ + seed)
                rr_ = fr * w * math.sin(t * math.pi / 2)
                row.append((fx + rr_ * math.cos(a_), fy + 0.8 * rr_ * math.sin(a_), fz + fr * 0.08 * math.cos(t * math.pi / 2)))
            rows.append(row)
        C.grid(fi, rows[::-1], FARG)
        rows = []
        for j in range(8):   # 岩石倒悬底座
            t = j / 7
            row = []
            for i in range(n + 1):
                a_ = i * math.tau / n
                rr_ = fr * (1 - t ** 1.4) * (1 + r2.uniform(-0.08, 0.08)) + 0.5
                row.append((fx + rr_ * math.cos(a_), fy + 0.8 * rr_ * math.sin(a_), fz - fr * 0.9 * t + r2.uniform(-3, 3) * (0 < t < 1)))
            rows.append(row)
        C.grid(fi, rows, ROCKF, smooth=False)
        for k in range(26):   # 树丛（远景，用团块）
            a_ = r2.uniform(0, math.tau); d_ = r2.uniform(0.3, 0.85) * fr
            tx, ty = fx + d_ * math.cos(a_), fy + 0.8 * d_ * math.sin(a_)
            fi.sphere(tx, ty, fz + fr * 0.05 + 4, r2.uniform(4, 8), TREEF, sz=0.8, seg=8, rings=5)
        for k in range(7):
            bx, by = fx + r2.uniform(-0.5, 0.5) * fr, fy + r2.uniform(-0.4, 0.4) * fr
            fi.boxc(bx, by, fz + fr * 0.05, r2.uniform(10, 22), r2.uniform(10, 22), r2.uniform(8, 26), FAR)

    Batch.build_all()
    C.sky_sun(sc, 'day', sun_az=150.0, sun_el=34.0)
    sc.view_settings.exposure = -0.3
    if A['exposure']:
        sc.view_settings.exposure = float(A['exposure'])
    CAMS = {
        'c1': ((240, -280, 930), (-10, 10, 872), 28),
        'c2': ((-5, -31.5, 871.7), (44, -52, 871.5), 24),
        'c3': ((-62, 74, 948), (0, 0, 984), 30),
    }
    pos, tgt, lens = CAMS[A['cam']]
    C.camera(sc, pos, tgt, lens)
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
