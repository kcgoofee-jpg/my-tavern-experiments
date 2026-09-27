"""废弃教堂区（开局四的目的地，下层边缘 / 地基层）：旧时代遗留的石砌小教堂群（参考 St Dunstan-in-the-East 花园废墟、惠特比修道院、
威廉皇帝纪念教堂断塔、火烧后只剩外墙的中殿）。
主堂：罗曼 / 早期哥特式教区堂，中殿屋顶塌落，只剩几榀木桁架 + 铁拉杆和东端一小段残存板岩屋面；尖拱窗花格残破，少量玻璃碎片；
西端钟塔（尖顶断折）；东北小礼拜堂（屋顶尚存一半）；围墙墓园（杂草、苔藓、有顶门 lychgate）；碎石、积水。
残余以太场：中殿里悬浮的冷蓝微光点、几片薄光幕、地面发光裂纹（抽象，无符号、无文字、无宗教图像，只有朴素建筑）。
场地：城市地基层——巨型混凝土支柱、头顶远处中层底面与零星人工灯、管道、城缘老围墙。bg_* 只为渲染，不导出。
坐标：主堂中殿沿 x（钟塔在 -x，东端在 +x），墓园门在 +y。

用法（仓库根目录）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/ruined_churches/build.py', run_name='__main__')" \
      -- --cam c1 --res 900 --samples 24 --out /tmp/rc.jpg [--blend /tmp/rc.blend] [--log /tmp/rc.log]
cam: c1 斜俯主图 / c2 中殿内 / c3 墓园与钟塔
"""
import math, os, sys, traceback, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa

A = C.args(dict(cam='c1', tod='night', res='1000', samples='32', out='/tmp/rc.jpg', blend='', log='', exposure=''))

NX0, NX1, NY0, NY1 = -12.0, 14.0, -5.5, 5.5    # 中殿外廓
WT = 0.9                                        # 墙厚
WH = 10.5                                       # 墙高
TX0, TX1, TY0, TY1 = -18.5, -12.0, -3.25, 3.25  # 钟塔
TH = 24.0
CX0, CX1, CY0, CY1 = 8.0, 16.0, 12.0, 17.0      # 小礼拜堂
YX0, YX1, YY0, YY1 = -26.0, 26.0, -14.0, 26.0   # 墓园围墙
GATE = (2.0, YY1)


def main():
    import bpy
    from mathutils import Vector, Matrix
    sc = C.setup(A['samples'])
    Batch = C.Batch
    rnd = random.Random(4)

    DARK_V = C.flat('void_e', (0.01, 0.01, 0.012), 1.0)
    STONE = C.pbr('stone', 'white_sandstone_blocks_02', 1.4, tint=(0.42, 0.41, 0.39), value=0.7, sat=0.3, weather=1.0)
    STONE2 = C.pbr('stone_dark', 'white_sandstone_blocks_02', 1.4, tint=(0.32, 0.31, 0.3), value=0.7, sat=0.3, weather=1.0)
    TRIM = C.pbr('stone_trim', 'marble_01', 2.0, tint=(0.55, 0.54, 0.5), value=0.8, sat=0.3, weather=0.6)
    PAVE = C.pbr('flags', 'precast_stone_paving', 3.0, tint=(0.5, 0.5, 0.48), value=0.8, sat=0.4)
    DIRT = C.pbr('dirt', 'dirt_floor', 4.0, tint=(0.3, 0.29, 0.27), value=0.6, sat=0.4)
    CONC = C.pbr('concrete', 'concrete_wall_008', 6.0, tint=(0.5, 0.5, 0.5), value=0.8, weather=0.9)
    CONCF = C.pbr('concrete_floor', 'concrete_floor_worn_001', 6.0, tint=(0.5, 0.5, 0.5), value=0.7)
    SLATE = C.pbr('slate', 'roof_slates_02', 2.0, tint=(0.5, 0.5, 0.52), value=0.8)
    WOOD = C.pbr('charred_wood', 'rough_wood', 1.0, tint=(0.13, 0.11, 0.1), value=0.5, sat=0.4, rough_mul=1.2)

    def overlay(name, col, zlo=None, zhi=None, alpha=0.85, nscale=1.2):
        # 贴墙的半透明污渍层：噪声斑驳 ×（可选）按世界 z 渐隐（zlo 处最浓 → zhi 处消失）
        m, nt, b = C.new_mat(name)
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        df = nt.nodes.new('ShaderNodeBsdfPrincipled'); df.inputs['Base Color'].default_value = (*col, 1); df.inputs['Roughness'].default_value = 0.95
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mx = nt.nodes.new('ShaderNodeMixShader')
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = nscale; nz.inputs['Detail'].default_value = 8
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.4; mr.inputs['From Max'].default_value = 0.6
        mr.inputs['To Max'].default_value = alpha
        nt.links.new(nz.outputs[0], mr.inputs['Value'])
        fac = mr.outputs[0]
        if zlo is not None:
            sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sp.inputs[0])
            zr = nt.nodes.new('ShaderNodeMapRange'); zr.inputs['From Min'].default_value = zlo; zr.inputs['From Max'].default_value = zhi
            zr.inputs['To Min'].default_value = 1.0; zr.inputs['To Max'].default_value = 0.0
            nt.links.new(sp.outputs[2], zr.inputs['Value'])
            ml = nt.nodes.new('ShaderNodeMath'); ml.operation = 'MULTIPLY'
            nt.links.new(fac, ml.inputs[0]); nt.links.new(zr.outputs[0], ml.inputs[1]); fac = ml.outputs[0]
        nt.links.new(fac, mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(df.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
        return m
    DAMP = overlay('damp_moss', (0.03, 0.045, 0.025), 0.0, 2.2, 0.95, 2.5)
    SOOT = overlay('soot', (0.015, 0.013, 0.012), None, None, 0.9, 0.8)
    IRON = C.flat('iron', (0.12, 0.08, 0.06), 0.7, metal=0.7, noise=0.5)
    GLASS = C.glass('glass_shard', tint=(0.18, 0.22, 0.2), rough=0.08)
    MOSS = C.flat('moss', (0.035, 0.05, 0.025), 0.95, noise=0.8)
    WATER = C.flat('puddle', (0.02, 0.025, 0.03), 0.03, coat=1.0)
    RUST = C.flat('pipe_rust', (0.2, 0.12, 0.08), 0.6, metal=0.5, noise=0.5)
    LAMP_S = C.flat('lamp_sodium', (1, 0.6, 0.3), 0.4, emit=(1.0, 0.55, 0.22), estr=30)
    LAMP_W = C.flat('lamp_white', (0.9, 0.95, 1), 0.4, emit=(0.8, 0.9, 1.0), estr=40)
    GLOW_F = C.flat('aether_faint', (0.02, 0.05, 0.12), 0.5, emit=(0.08, 0.4, 1.0), estr=0.15)
    GLOW = C.flat('aether_glow', (0.02, 0.08, 0.2), 0.5, emit=(0.08, 0.4, 1.0), estr=0.45)

    # 光幕：透明 + 竖向渐隐的发光
    VEIL, nt, b = C.new_mat('aether_veil')
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (0.2, 0.55, 1.0, 1); em.inputs['Strength'].default_value = 1.2
    ad = nt.nodes.new('ShaderNodeAddShader')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.35; mr.inputs['From Max'].default_value = 0.7
    nt.links.new(nz.outputs[0], mr.inputs['Value'])
    sn = nt.nodes.new('ShaderNodeMath'); sn.operation = 'MULTIPLY'
    nt.links.new(mr.outputs[0], sn.inputs[0]); sn.inputs[1].default_value = 0.05
    nt.links.new(sn.outputs[0], em.inputs['Strength'])
    nt.links.new(tr.outputs[0], ad.inputs[0]); nt.links.new(em.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], out.inputs[0])

    Wl = Batch('walls_ext'); R = Batch('roof'); F0 = Batch('floor_0'); site = Batch('site_ground')
    TW = Batch('props_tower'); CH = Batch('props_chapel'); YD = Batch('props_churchyard'); RB = Batch('props_rubble')
    AE = Batch('props_aether'); TRC = Batch('props_tracery'); VG = Batch('site_vegetation')

    def rot(ax, ang, cx, cy, cz):
        return Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(ang, 4, ax) @ Matrix.Translation((-cx, -cy, -cz))

    # ------------------------------------------------------------ 窗墙：沿一面墙的若干尖拱窗开口，墙顶按段参差（破损）
    def window_wall(B, p0, p1, normal, n_win, sill, ww, hs, top, mat, seed, broken=1.5, trace=True):
        r2 = random.Random(seed)
        P0, P1 = Vector(p0), Vector(p1)
        L = (P1 - P0).length; d = (P1 - P0).normalized()
        nrm = Vector(normal).normalized()
        M = C.wall_frame(P0, nrm)
        # wall_frame 的 u 方向 = z × n；若与 d 相反则镜像 u
        sgn = 1 if M.col[0].xyz.dot(d) > 0 else -1
        pts, apex = C.pointed(ww, hs - sill, 8, 0.8)
        bay = L / n_win
        def U(u):
            return u * sgn
        segs = []
        for i in range(n_win):
            c = bay * (i + 0.5)
            t = top - r2.uniform(0, broken)
            segs.append(t)
            u0, u1 = bay * i, bay * (i + 1)
            # 窗间墙墩
            for a, b2 in ((u0, c - ww / 2), (c + ww / 2, u1)):
                ta = t - (r2.uniform(0, broken) if b2 > c else 0)
                # 参差台阶状断口：主体到 ta-1.2，再叠 2-3 级逐渐变窄的残砌
                base_t = max(sill + 0.5, ta - 1.2)
                C.slab2d(B, M, [(U(a), 0), (U(b2), 0), (U(b2), base_t), (U(a), base_t)][::sgn], -WT, 0, mat)
                aa, bb, zz = a, b2, base_t
                for st in range(r2.randint(1, 2)):
                    wdt = bb - aa
                    if wdt < 0.4: break
                    cut = wdt * r2.uniform(0.15, 0.4)
                    if r2.random() < 0.5: aa += cut
                    else: bb -= cut
                    z2 = zz + r2.uniform(0.3, 0.6)
                    C.slab2d(B, M, [(U(aa), zz), (U(bb), zz), (U(bb - (bb - aa) * r2.uniform(0, 0.3)), z2), (U(aa + (bb - aa) * r2.uniform(0, 0.3)), z2)][::sgn], -WT, 0, mat)
                    zz = z2
                # 掉落的压顶石 / 砌块：堆在墙脚
                for k in range(r2.randint(1, 3)):
                    uu = r2.uniform(a, b2); pw = M @ Vector((U(uu), 0, r2.uniform(0.3, 1.6)))
                    RB.boxc(pw.x, pw.y, -0.05, r2.uniform(0.4, 0.8), r2.uniform(0.3, 0.5), r2.uniform(0.25, 0.4), mat,
                            mat=rot((r2.random(), r2.random(), 0.3), r2.uniform(0.2, 0.9), pw.x, pw.y, 0.2))
            # 墙脚潮湿 / 苔藓渐变（内外两面）
            for dd in (0.012, -WT - 0.012):
                C.slab2d(B, M, [(U(u0), 0), (U(u1), 0), (U(u1), 2.2), (U(u0), 2.2)][::sgn], dd, dd + 0.002, DAMP)
            # 窗洞上方的烟熏火痕（外面向上扩散的舌形）
            sh = min(t - sill - apex, 3.2)
            if sh > 0.4:
                ytop = sill + apex * 0.7 + sh
                C.slab2d(B, M, [(U(c - ww * 0.45), sill + apex * 0.6), (U(c + ww * 0.45), sill + apex * 0.6), (U(c + ww * 0.8), ytop), (U(c - ww * 0.8), ytop)][::sgn], 0.013, 0.015, SOOT)
            C.slab2d(B, M, [(U(c - ww / 2), 0), (U(c + ww / 2), 0), (U(c + ww / 2), sill), (U(c - ww / 2), sill)][::sgn], -WT, 0, mat)
            top_v = sill + apex
            if t > top_v + 0.3:
                C.slab2d(B, M, [(U(c - ww / 2), top_v), (U(c + ww / 2), top_v), (U(c + ww / 2), t), (U(c - ww / 2), t)][::sgn], -WT, 0, mat)
                # 拱肩（矩形上角减去尖拱）
                arc = [(c + u, sill + v) for (u, v) in pts[2:]]
                half = len(arc) // 2
                right = [(c + ww / 2, sill + pts[2][1])] + arc[:half + 1] + [(c + ww / 2, top_v)]
                left = [(c - u + 2 * c - 2 * c, v) for (u, v) in []]
                left = [(2 * c - u, v) for (u, v) in right]
                C.slab2d(B, M, [(U(u), v) for (u, v) in right][::sgn], -WT, 0, mat)
                C.slab2d(B, M, [(U(u), v) for (u, v) in left][::-sgn], -WT, 0, mat)
                if trace:
                    fr0 = None
                    fr = [(U(c + u), sill + v) for (u, v) in pts]
                    C.frame2d(TRC, M, fr if sgn > 0 else fr[::-1], 0.12, -WT * 0.6, -WT * 0.3, TRIM)
                    # 中梃（一些断掉）
                    mh = hs - sill if r2.random() < 0.6 else (hs - sill) * r2.uniform(0.3, 0.6)
                    C.slab2d(TRC, M, [(U(c - 0.06), sill), (U(c + 0.06), sill), (U(c + 0.06), sill + mh), (U(c - 0.06), sill + mh)][::sgn], -WT * 0.6, -WT * 0.3, TRIM)
                    if mh > (hs - sill) * 0.9:   # 尖拱内的简单 Y 形花格
                        for s in (-1, 1):
                            q = [(c, hs), (c + s * ww * 0.3, sill + apex * 0.92)]
                            TRC.strip([tuple(M @ Vector((U(u), v, -WT * 0.45))) for (u, v) in q], 0.1, 0.12, TRIM)
                    # 残留玻璃碎片（贴框的小三角）
                    for k in range(r2.randint(1, 3)):
                        su = c + r2.choice((-1, 1)) * (ww / 2 - 0.1); sv = sill + r2.uniform(0.3, hs - sill)
                        tri = [(U(su), sv), (U(su - math.copysign(r2.uniform(0.15, 0.4), su - c)), sv + r2.uniform(-0.2, 0.2)), (U(su), sv + r2.uniform(0.3, 0.6))]
                        C.slab2d(TRC, M, tri, -WT * 0.47, -WT * 0.44, GLASS)
            if trace and not (t > top_v + 0.3):
                # 拱已塌：只剩窗台上的中梃残桩和两侧窗套下段
                mh = r2.uniform(0.5, 2.2)
                C.slab2d(TRC, M, [(U(c - 0.07), sill), (U(c + 0.07), sill), (U(c + 0.07), sill + mh), (U(c - 0.07), sill + mh)][::sgn], -WT * 0.6, -WT * 0.3, TRIM)
                for s in (-1, 1):
                    jh = min(t, sill + r2.uniform(1.5, hs - sill))
                    C.slab2d(TRC, M, [(U(c + s * ww / 2 - 0.12), sill), (U(c + s * ww / 2 + 0.0), sill), (U(c + s * ww / 2), jh), (U(c + s * ww / 2 - 0.12), jh)][::sgn] if s > 0 else
                             [(U(c - ww / 2), sill), (U(c - ww / 2 + 0.12), sill), (U(c - ww / 2 + 0.12), jh), (U(c - ww / 2), jh)][::sgn], -WT * 0.6, -WT * 0.3, TRIM)
        return segs

    # ------------------------------------------------------------ 主堂
    # 南北侧墙（外表面在 NY0/NY1），每侧 5 窗
    window_wall(Wl, (NX0, NY0 + WT, 0), (NX1 - 4.0, NY0 + WT, 0), (0, -1, 0), 4, 2.6, 1.8, 6.6, WH, STONE, 11)
    window_wall(Wl, (NX0, NY1 - WT, 0), (NX1 - 4.0, NY1 - WT, 0), (0, 1, 0), 4, 2.6, 1.8, 6.6, WH, STONE, 12, broken=3.5)
    # 东端（高坛段）：墙较完整，东窗大
    Wl.box(NX1 - 4.0, NX1, NY0, NY0 + WT, 0, WH, STONE)
    Wl.box(NX1 - 4.0, NX1, NY1 - WT, NY1, 0, WH - 1.2, STONE)
    window_wall(Wl, (NX1 - WT, NY0, 0), (NX1 - WT, NY1, 0), (1, 0, 0), 1, 2.0, 3.6, 7.2, WH + 3.0, STONE, 13, broken=0.2)
    # 东窗加两根中梃（部分断）+ 山墙上的圆窗（素面圆环，半边塌落）
    for (yy, hh) in ((-1.0, 5.2), (1.0, 3.1)):
        Wl.box(NX1 - WT * 0.6, NX1 - WT * 0.3, yy - 0.07, yy + 0.07, 2.0, 2.0 + hh, TRIM)
    ring = [(NX1 - WT * 0.5, 1.3 * math.cos(a), 12.2 + 1.3 * math.sin(a)) for a in [i * math.tau / 20 - 1.0 for i in range(15)]]
    TRC.tube(ring, 0.16, TRIM, n=6)
    Wl.cyl(0, 0, 0, 1.15, WT * 0.4, DARK_V, 20, mat=Matrix.Translation((NX1 - WT * 0.9, 0, 12.2)) @ Matrix.Rotation(1.5708, 4, 'Y'))
    # 空祭坛台座（素面石块）
    F0.box(NX1 - 3.4, NX1 - 1.9, -1.3, 1.3, 0.35, 1.35, TRIM)
    F0.box(NX1 - 3.55, NX1 - 1.75, -1.45, 1.45, 1.35, 1.5, TRIM)
    # 东山墙三角
    Wl.poly([(NX1 - WT, NY0, WH + 3.0), (NX1, NY0, WH + 3.0), (NX1, NY1, WH + 3.0), (NX1 - WT, NY1, WH + 3.0),
             (NX1 - WT, 0, WH + 6.0), (NX1, 0, WH + 6.0)], [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)], STONE)
    # 扶壁
    for x in [NX0 + 6.5 * i for i in range(5)]:
        for (y0, y1) in ((NY0 - 1.1, NY0), (NY1, NY1 + 1.1)):
            h = rnd.uniform(5.5, 8.0)
            Wl.box(x - 0.45, x + 0.45, y0, y1, 0, h, STONE2)
            Wl.poly([(x - 0.45, y0, h), (x + 0.45, y0, h), (x + 0.45, y1, h), (x - 0.45, y1, h),
                     (x - 0.45, NY0 if y0 < 0 else NY1, h + 1.2), (x + 0.45, NY0 if y0 < 0 else NY1, h + 1.2)],
                    [(0, 1, 5, 4) if y0 < 0 else (1, 0, 4, 5), (1, 2, 5) if y0 < 0 else (2, 3, 4), (3, 0, 4) if y0 < 0 else (0, 1, 5)], STONE2)
    # 扶壁转角的琢石隅石（交替长短）
    for x in [NX0 + 6.5 * i for i in range(5)]:
        for yo in (NY0 - 1.1, NY1 + 1.1):
            z = 0.0; k = 0
            while z < 5.0:
                l = 0.55 if k % 2 else 0.3
                for sx in (-1, 1):
                    Wl.box(x + sx * 0.47 - 0.02 * sx, x + sx * 0.47 - sx * l, yo - 0.02 * (1 if yo < 0 else -1), yo + (l if yo < 0 else -l), z, z + 0.32, TRIM)
                z += 0.34; k += 1
    # 束腰线脚
    for y in (NY0 - 0.12, NY1 + 0.12):
        Wl.box(NX0, NX1, y - 0.12, y + 0.12, 2.3, 2.5, TRIM)
    # 西墙（与塔相接，中间门洞）
    Wl.box(NX0, NX0 + WT, NY0, -1.4, 0, WH, STONE); Wl.box(NX0, NX0 + WT, 1.4, NY1, 0, WH - 2.0, STONE)
    # 南门（圆拱门套）
    dM = C.wall_frame((2.5, NY0 - 0.02, 0), (0, -1, 0))
    arch = [(-1.1, 0), (1.1, 0)] + [(1.1 * math.cos(a * math.pi / 10), 2.6 + 1.1 * math.sin(a * math.pi / 10)) for a in range(11)]
    C.frame2d(TRC, dM, arch, 0.25, 0, 0.25, TRIM)

    # 屋顶残余：3 榀剪刀桁架 + 铁拉杆，东端一小段椽子 + 板岩；一榀斜塌落
    def truss(x, tilt=0.0, broken=False):
        mat = rot((1, 0, 0), tilt, x, NY0, WH) if tilt else None
        pts = [(x, NY0 + 0.4, WH), (x, 0, WH + 5.2), (x, NY1 - 0.4, WH)]
        def S(ps, w, h, m):
            ps2 = [tuple(mat @ Vector(p)) for p in ps] if mat else ps
            R.strip(ps2, w, h, m)
        S(pts[:2], 0.3, 0.35, WOOD)
        if not broken:
            S(pts[1:], 0.3, 0.35, WOOD)
            S([(x, NY0 + 0.6, WH + 0.2), (x, 1.5, WH + 3.4)], 0.2, 0.22, WOOD)
            S([(x, NY1 - 0.6, WH + 0.2), (x, -1.5, WH + 3.4)], 0.2, 0.22, WOOD)
        S([(x, NY0 + 0.4, WH + 0.4), (x, NY1 - 0.4, WH + 0.4)], 0.06, 0.06, IRON)
    truss(NX1 - 2.2); truss(NX1 - 6.0); truss(1.0, broken=True); truss(-5.0, broken=True)
    # 墙头上的桁架残桩（烧断，端头劈裂）
    for x in (-8.0, -2.0, 4.0):
        for (y0, y1) in ((NY0 + 0.4, NY0 + rnd.uniform(1.2, 2.2)), (NY1 - 0.4, NY1 - rnd.uniform(1.0, 2.0))):
            R.strip([(x, y0, WH - 1.3), (x, y1, WH - 1.3 + abs(y1 - y0) * 0.9)], 0.3, 0.35, WOOD)
            for k in range(3):
                R.cyl(0, 0, 0, 0.07, rnd.uniform(0.3, 0.6), WOOD, 5, r2=0.005,
                      mat=Matrix.Translation((x + rnd.uniform(-0.1, 0.1), y1, WH - 1.3 + abs(y1 - y0) * 0.9)) @ Matrix.Rotation(rnd.uniform(0.6, 1.2) * (1 if y1 > y0 else -1), 4, 'X'))
    # 断桁架端头的劈裂木刺
    for x in (1.0, -5.0):
        for k in range(4):
            R.cyl(0, 0, 0, 0.08, rnd.uniform(0.4, 0.9), WOOD, 5, r2=0.005,
                  mat=Matrix.Translation((x + rnd.uniform(-0.1, 0.1), 0.0, WH + 5.1)) @ Matrix.Rotation(rnd.uniform(-0.8, 0.8), 4, 'X') @ Matrix.Rotation(rnd.uniform(-0.4, 0.4), 4, 'Y'))
    # 一榀塌落斜搭在北墙与地面之间
    R.strip([(-2.0, NY0 + 1.5, 0.3), (-1.2, NY1 - 1.2, 7.6)], 0.3, 0.35, WOOD)
    R.strip([(-3.2, NY0 + 2.0, 0.2), (-0.4, 2.5, 3.5)], 0.25, 0.3, WOOD)
    # 纵向檩条（断）
    for y, z in ((-2.6, WH + 2.6), (2.6, WH + 2.6)):
        R.strip([(NX1 - 1.0, y, z), (NX1 - 8.5, y, z)], 0.22, 0.22, WOOD)
    # 残存屋面：东端南坡一小块
    sl = [(NX1 - 0.2, NY0 - 0.3, WH - 0.1), (NX1 - 5.0, NY0 - 0.3, WH - 0.1), (NX1 - 4.2, -0.3, WH + 5.0), (NX1 - 0.2, -0.3, WH + 5.0)]
    R.poly(sl + [(p[0], p[1], p[2] + 0.12) for p in sl], [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], SLATE)
    for i in range(7):   # 露出的椽子
        x = NX1 - 5.5 - i * 0.7
        R.strip([(x, NY0 + 0.3, WH), (x, -0.2, WH + 5.0 - (0 if i < 3 else rnd.uniform(1.5, 4.5)))], 0.12, 0.16, WOOD)

    # 地坪：旧石板（中殿），高坛台阶
    F0.box(NX0 + WT, NX1 - WT, NY0 + WT, NY1 - WT, -0.1, 0.02, PAVE)
    F0.box(NX1 - 5.0, NX1 - WT, NY0 + WT, NY1 - WT, 0.02, 0.35, PAVE)
    # 积水
    for (px, py, r) in ((-6.0, -1.5, 1.6), (4.5, 2.0, 1.1), (-9.0, 3.0, 0.8), (7.5, -2.8, 0.9)):
        n = 14
        F0.poly([(px + r * math.cos(i * math.tau / n) * rnd.uniform(0.7, 1.1), py + r * 0.7 * math.sin(i * math.tau / n) * rnd.uniform(0.7, 1.1), 0.03) for i in range(n)],
                [tuple(range(n))], WATER)

    # ------------------------------------------------------------ 钟塔（西端，上部断折，尖顶只剩残段）
    TW.box(TX0, TX1, TY0, TY1, 0, TH - 3.0, STONE2)
    # 断口：四角参差
    for (x0, x1, y0, y1, h) in ((TX0, TX0 + 2.0, TY0, TY1, 3.0), (TX1 - 2.2, TX1, TY0, TY0 + 2.0, 1.4), (TX0 + 2.0, TX1, TY1 - 1.0, TY1, 0.8)):
        TW.box(x0, x1, y0, y1, TH - 3.0, TH - 3.0 + h, STONE2)
    # 角扶壁 + 层间线脚
    for (x, y) in ((TX0, TY0), (TX0, TY1), (TX1, TY0), (TX1, TY1)):
        TW.box(x - 0.5, x + 0.5, y - 0.5, y + 0.5, 0, TH - 8 + rnd.uniform(0, 3), STONE)
    for z in (8.0, 15.5):
        TW.box(TX0 - 0.2, TX1 + 0.2, TY0 - 0.2, TY1 + 0.2, z, z + 0.3, TRIM)
    # 钟室开口（深色凹入）
    DARK = C.flat('void', (0.01, 0.01, 0.012), 1.0)
    for (y, s) in ((TY0 - 0.02, -1), (TY1 + 0.02, 1)):
        M = C.wall_frame(((TX0 + TX1) / 2, y, 0), (0, s, 0))
        for off in (-1.2, 1.2):
            pts, apex = C.pointed(1.4, 17.0 - 17.0 + 3.2, 6, 0.8)
            fr = [(u + off, 16.5 + v) for (u, v) in pts]
            C.slab2d(TW, M, fr, 0.0, 0.02, DARK)
            C.frame2d(TW, M, fr, 0.14, 0.0, 0.18, TRIM)
    # 残存尖顶骨架（歪斜的木 / 铁骨，一侧断）
    base = (TX0 + TX1) / 2, 0.0, TH - 2.0
    for (dx, dy) in ((-2.6, -2.6), (2.6, -2.6), (2.6, 2.6)):
        top = (base[0] + dx * 0.35 + 0.6, base[1] + dy * 0.35, base[2] + 6.5 - (3.5 if dx > 0 and dy > 0 else 0))
        TW.strip([(base[0] + dx, base[1] + dy, base[2]), top], 0.35, 0.35, WOOD)
    TW.strip([(base[0] - 2.6, base[1] + 2.6, base[2]), (base[0] - 1.0, base[1] + 1.2, base[2] + 3.2)], 0.35, 0.35, WOOD)
    # 尖顶底部的方形圈梁 + 一道残存的中层圈梁（缺一边）+ 铁箍
    sq = [(base[0] - 2.6, -2.6, base[2]), (base[0] + 2.6, -2.6, base[2]), (base[0] + 2.6, 2.6, base[2]), (base[0] - 2.6, 2.6, base[2]), (base[0] - 2.6, -2.6, base[2])]
    TW.strip(sq, 0.3, 0.3, WOOD)
    TW.strip([(base[0] - 1.55, -1.7, base[2] + 2.8), (base[0] + 2.0, -1.7, base[2] + 2.8), (base[0] + 2.0, 1.3, base[2] + 2.0)], 0.22, 0.22, WOOD)
    TW.strip([(base[0] - 2.6, -2.6, base[2]), (base[0] + 2.0, -1.7, base[2] + 2.8)], 0.18, 0.18, WOOD)
    # 塌下的尖顶残段躺在塔脚
    sp = rot((0, 1, 0), 1.35, TX0 - 4.0, 5.5, 0.9)
    TW.poly([(TX0 - 4.0 - 1.0, 4.5, 0.9), (TX0 - 4.0 + 1.0, 4.5, 0.9), (TX0 - 4.0 + 1.0, 6.5, 0.9), (TX0 - 4.0 - 1.0, 6.5, 0.9), (TX0 - 4.0, 5.5, 6.5)],
            [(3, 2, 1, 0), (0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], SLATE, mat=sp)
    # 塔门
    dM = C.wall_frame((TX0 - 0.02, 0, 0), (-1, 0, 0))
    C.slab2d(TW, dM, [(-1.0, 0), (1.0, 0)] + [(math.cos(a * math.pi / 10), 2.4 + math.sin(a * math.pi / 10)) for a in range(11)], 0.0, 0.02, DARK)

    # ------------------------------------------------------------ 小礼拜堂（东北，屋顶残存一半）
    window_wall(CH, (CX0, CY0 + 0.7, 0), (CX1, CY0 + 0.7, 0), (0, -1, 0), 2, 1.8, 1.2, 4.4, 6.0, STONE, 21, broken=0.6)
    window_wall(CH, (CX0, CY1 - 0.7, 0), (CX1, CY1 - 0.7, 0), (0, 1, 0), 2, 1.8, 1.2, 4.4, 6.0, STONE, 22, broken=0.6)
    CH.box(CX0, CX0 + 0.7, CY0, CY1, 0, 6.0, STONE)
    CH.poly([(CX0, CY0, 6.0), (CX0 + 0.7, CY0, 6.0), (CX0 + 0.7, CY1, 6.0), (CX0, CY1, 6.0), (CX0, (CY0 + CY1) / 2, 9.0), (CX0 + 0.7, (CY0 + CY1) / 2, 9.0)],
            [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)], STONE)
    # 东端半圆后殿
    CH.lathe(CX1, (CY0 + CY1) / 2, 0, [(2.5, 0), (2.5, 5.2)], STONE, n=12, a0=-math.pi / 2, a1=math.pi / 2)
    CH.lathe(CX1, (CY0 + CY1) / 2, 0, [(1.8, 0), (1.8, 5.2)], STONE, n=12, a0=-math.pi / 2, a1=math.pi / 2)
    CH.lathe(CX1, (CY0 + CY1) / 2, 5.2, [(2.5, 0), (2.0, 0.9), (1.2, 1.5), (0.05, 1.8)], SLATE, n=12, a0=-math.pi / 2, a1=math.pi / 2)
    # 西半屋顶尚存（板岩双坡），东半只剩椽
    CH.gable(CX0, CX0 + 4.0, CY0, CY1, 6.0, 3.0, SLATE, along='x', over=0.4)
    for i in range(6):
        x = CX0 + 4.3 + i * 0.6
        for s in (-1, 1):
            CH.strip([(x, (CY0 + CY1) / 2 + s * 2.9, 5.9), (x, (CY0 + CY1) / 2 + (0.2 if i % 3 else 1.2) * s, 8.9 - (0 if i % 3 else 2.0))], 0.1, 0.14, WOOD)
    F0.box(CX0 + 0.7, CX1, CY0 + 0.7, CY1 - 0.7, -0.05, 0.05, PAVE)
    dM = C.wall_frame((CX0 - 0.02, (CY0 + CY1) / 2, 0), (-1, 0, 0))
    C.slab2d(CH, dM, [(-0.8, 0), (0.8, 0)] + [(0.8 * math.cos(a * math.pi / 8), 2.1 + 0.8 * math.sin(a * math.pi / 8)) for a in range(9)], 0.0, 0.02, DARK)

    # ------------------------------------------------------------ 墓园：围墙（压顶石、部分坍塌）、有顶门、墓碑（素面）、草
    def yard_wall(p0, p1, gap=None):
        x0, y0 = p0; x1, y1 = p1
        L = math.hypot(x1 - x0, y1 - y0); n = int(L / 2.0)
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            a = (x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0); b2 = (x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1)
            mx = (a[0] + b2[0]) / 2
            if gap and abs(mx - gap[0]) < 1.6 and abs(a[1] - gap[1]) < 0.1:
                continue
            h = 1.9 if rnd.random() > 0.15 else rnd.uniform(0.4, 1.1)
            if abs(x1 - x0) > abs(y1 - y0):
                YD.box(a[0], b2[0], a[1] - 0.3, a[1] + 0.3, 0, h, STONE2)
                if h > 1.5: YD.box(a[0], b2[0], a[1] - 0.38, a[1] + 0.38, h, h + 0.15, TRIM)
            else:
                YD.box(a[0] - 0.3, a[0] + 0.3, a[1], b2[1], 0, h, STONE2)
                if h > 1.5: YD.box(a[0] - 0.38, a[0] + 0.38, a[1], b2[1], h, h + 0.15, TRIM)
            if h < 1.5:
                for k in range(4):
                    RB.boxc(mx + rnd.uniform(-1, 1), a[1] + rnd.uniform(-1.5, 1.5) if abs(x1 - x0) > abs(y1 - y0) else (a[1] + b2[1]) / 2 + rnd.uniform(-1, 1),
                            0, rnd.uniform(0.3, 0.6), rnd.uniform(0.25, 0.5), rnd.uniform(0.2, 0.4), STONE2)
    yard_wall((YX0, YY1), (YX1, YY1), gap=GATE)
    yard_wall((YX0, YY0), (YX1, YY0))
    yard_wall((YX0, YY0), (YX0, YY1))
    yard_wall((YX1, YY0), (YX1, YY1))
    # 有顶门：石基 + 木柱 + 双坡小屋顶（缺瓦）
    gx, gy = GATE
    for sx in (-1.7, 1.7):
        YD.box(gx + sx - 0.35, gx + sx + 0.35, gy - 1.2, gy + 1.2, 0, 0.8, STONE2)
        for sy in (-0.9, 0.9):
            YD.box(gx + sx - 0.12, gx + sx + 0.12, gy + sy - 0.12, gy + sy + 0.12, 0.8, 3.0, WOOD)
        YD.box(gx + sx - 0.14, gx + sx + 0.14, gy - 1.3, gy + 1.3, 3.0, 3.25, WOOD)
    YD.box(gx - 2.1, gx + 2.1, gy - 0.12, gy + 0.12, 3.0, 3.2, WOOD)
    YD.gable(gx - 2.3, gx + 2.3, gy - 1.6, gy + 1.6, 3.25, 1.6, SLATE, along='x', over=0.0)
    YD.strip([(gx - 1.4, gy - 0.1, 0.1), (gx + 0.2, gy + 0.9, 1.5)], 0.06, 1.6, WOOD)  # 半开的木门扇
    # 墓碑（素面石板，歪斜）+ 平卧墓板
    for i in range(34):
        while True:
            x, y = rnd.uniform(YX0 + 2, YX1 - 2), rnd.uniform(YY0 + 2, YY1 - 2)
            if not (NX0 - 8 < x < NX1 + 3 and NY0 - 3 < y < NY1 + 3) and not (CX0 - 2 < x < CX1 + 4 and CY0 - 2 < y < CY1 + 2) and abs(x - gx) > 3:
                break
        m = rot((1, 0, 0), rnd.uniform(-0.25, 0.25), x, y, 0) @ rot((0, 0, 1), rnd.uniform(-0.2, 0.2), x, y, 0)
        if rnd.random() < 0.7:
            h = rnd.uniform(0.7, 1.3)
            YD.boxc(x, y, -0.2, rnd.uniform(0.5, 0.8), 0.12, h, STONE if rnd.random() < 0.5 else TRIM, mat=m)
        else:
            YD.boxc(x, y, 0, 0.9, 1.9, 0.25, STONE2, mat=rot((0, 0, 1), rnd.uniform(-0.1, 0.1), x, y, 0))
    # 院中老树（枯 / 半枯）
    # 枯树：只有树干与枝杈，无叶
    BARK = C.tree_mats()['bark']
    tx, ty = -20.0, 18.0
    VG.tube([(tx, ty, -0.2), (tx + 0.3, ty, 3.0), (tx - 0.2, ty + 0.4, 6.0), (tx - 0.8, ty + 0.2, 8.5)], 0.35, BARK, n=10)
    for i in range(7):
        a = i * math.tau / 7 + rnd.uniform(-0.3, 0.3); z0 = rnd.uniform(3.0, 7.0); L = rnd.uniform(2.0, 4.5)
        e = (tx + L * math.cos(a), ty + L * math.sin(a), z0 + rnd.uniform(0.5, 2.5))
        VG.tube([(tx, ty, z0), ((tx + e[0]) / 2, (ty + e[1]) / 2, (z0 + e[2]) / 2 + 0.3), e], 0.12, BARK, n=6)
        for j in range(2):
            VG.tube([e, (e[0] + rnd.uniform(-1, 1), e[1] + rnd.uniform(-1, 1), e[2] + rnd.uniform(0.3, 1.2))], 0.04, BARK, n=4)
    VG.tube([(18.0, -8.0, -0.2), (18.2, -8.1, 2.4), (18.6, -7.9, 3.1)], 0.3, BARK, n=8)   # 断树桩

    # ------------------------------------------------------------ 碎石：中殿内塌落的石块 + 墙脚堆
    def rubble_pile(cx, cy, r, n, mat=STONE2, h=0.5):
        for k in range(n):
            a = rnd.uniform(0, math.tau); d = r * rnd.random() ** 0.7
            x, y = cx + d * math.cos(a), cy + d * math.sin(a)
            s = rnd.uniform(0.25, 0.8) * (1.2 - d / r * 0.6)
            z = max(0, h * (1 - d / r)) * rnd.random()
            RB.boxc(x, y, z - 0.1, s * rnd.uniform(0.8, 1.6), s, s * rnd.uniform(0.5, 0.9), mat,
                    mat=rot((rnd.random(), rnd.random(), rnd.random() + 0.01), rnd.uniform(0, 0.7), x, y, z))
    # 墙脚塌落的碎石锥（土石混合的锥堆 + 表面石块）
    for (cx, cy, r, h) in ((-6.5, NY1 - 1.6, 2.4, 1.3), (-6.5, NY1 + 1.8, 2.2, 1.1), (0.5, NY1 + 1.6, 1.8, 0.9), (-1.0, NY1 - 1.5, 1.6, 0.8),
                           (-9.5, NY0 + 1.5, 1.3, 0.6), (TX0 - 1.2, -3.2, 2.6, 1.4), (TX1 + 1.4, 3.0, 1.5, 0.8), (CX1 + 1.5, CY0 - 1.2, 1.3, 0.6)):
        RB.cyl(cx, cy, -0.1, r, h, DIRT, 14, r2=r * 0.15)
        rubble_pile(cx, cy, r * 0.9, int(12 * r), h=h)
    # 落在地上的板岩碎片
    for k in range(15):
        x, y = rnd.uniform(NX0 + 1, NX1 - 1), rnd.uniform(NY0 + 1, NY1 - 1)
        RB.boxc(x, y, 0.02, rnd.uniform(0.25, 0.45), rnd.uniform(0.2, 0.35), 0.03, SLATE, mat=rot((0, 0, 1), rnd.uniform(0, 3), x, y, 0))
    # 倒下的石柱段
    RB.cyl(0, 0, 0, 0.4, 3.2, TRIM, 12, mat=Matrix.Translation((3.0, -2.5, 0.4)) @ Matrix.Rotation(1.5708, 4, 'Y') @ Matrix.Rotation(0.4, 4, 'X'))
    # 苔藓：墙脚与墙顶的块

    # 杂草：叶卡簇（地面 / 石缝 / 墙顶）
    M = C.tree_mats()
    weeds = [M['leaf_a'], M['leaf_b'], M['leaf_c']]
    for k in range(140):   # 成丛的草（每丛密集小叶卡，贴地；中殿里避开 c2 镜头前方）
        if k < 30:
            x, y = rnd.uniform(NX0 + 1, NX1 - 9), rnd.choice((rnd.uniform(NY0 + 0.6, NY0 + 1.6), rnd.uniform(NY1 - 1.6, NY1 - 0.6)))
        else:
            x, y = rnd.uniform(YX0 + 1, YX1 - 1), rnd.uniform(YY0 + 1, YY1 - 1)
        C._cards(VG, rnd, (x, y, 0.12), (0.32, 0.32, 0.16), 45, 0.045, weeds, flatz=-0.6, shell=0.5)
    for k in range(20):   # 墙顶草
        x = rnd.uniform(NX0, NX1 - 5); y = rnd.choice((NY0 + WT / 2, NY1 - WT / 2))
        C._cards(VG, rnd, (x, y, WH - 1.2), (0.6, 0.3, 0.3), 10, 0.08, weeds, shell=0.2)
    # 爬藤：塔身与南墙
    # 常春藤：贴墙的成团叶簇，从墙脚向上收窄
    IVY = [M['leaf_a'], M['yew'], M['conifer']]
    for (x0, yf, s, hmax) in ((TX0 + 1.5, TY0 - 0.6, -1, 9), (TX1 - 1.0, TY1 + 0.6, 1, 6), (-9.0, NY0, -1, 7), (5.0, NY0, -1, 5), (-4.0, NY1, 1, 6), (CX0 + 2, CY0, -1, 4)):
        z = 0.3; r = 1.4
        while z < hmax:
            C._cards(VG, rnd, (x0 + rnd.uniform(-0.4, 0.4), yf + s * 0.2, z), (r, 0.18, 0.8), int(60 * r), 0.09, IVY, shell=0.4)
            z += rnd.uniform(0.7, 1.1); r *= rnd.uniform(0.75, 0.9)

    # ------------------------------------------------------------ 残余以太场：地面裂纹、悬浮光点、光幕
    def crack(x, y, a, L, depth=0):
        pts = [(x, y, 0.035)]
        for i in range(int(L / 0.5)):
            a += rnd.uniform(-0.6, 0.6)
            x += 0.5 * math.cos(a); y += 0.5 * math.sin(a)
            if not (NX0 + WT < x < NX1 - 1.2 and NY0 + WT < y < NY1 - WT):
                break
            pts.append((x, y, 0.035))
            if depth < 2 and rnd.random() < 0.18:
                crack(x, y, a + rnd.choice((-1, 1)) * rnd.uniform(0.6, 1.2), L * 0.45, depth + 1)
        if len(pts) > 1:
            # 断续：只保留部分段落，看起来是渗出而不是连续的线
            segs2 = [pts[i:i + 3] for i in range(0, len(pts) - 1, 2) if rnd.random() < 0.65 - 0.08 * i / 2]
            for sg in segs2:
                if len(sg) > 1:
                    AE.strip(sg, 0.022 if depth == 0 else 0.014, 0.012, GLOW_F if abs(sg[0][0] - ALT[0]) > 4 else GLOW)
    ALT = (NX1 - 2.6, 0.0)
    for k in range(6):
        crack(ALT[0] - 1.2, ALT[1] + rnd.uniform(-0.5, 0.5), math.pi + rnd.uniform(-1.3, 1.3), rnd.uniform(2.5, 6.5))
    for k in range(70):
        d = rnd.expovariate(1 / 3.5); a = rnd.uniform(math.pi * 0.5, math.pi * 1.5)
        x, y = ALT[0] + d * math.cos(a), max(NY0 + 1.2, min(NY1 - 1.2, ALT[1] + d * math.sin(a)))
        if x < NX0 + 2: continue
        z = rnd.uniform(0.6, 6.0)
        AE.sphere(x, y, z, rnd.uniform(0.012, 0.028), GLOW if d < 4 else GLOW_F, seg=6, rings=4)
    for k in range(3):   # 薄光幕：只在高坛附近
        x = ALT[0] - rnd.uniform(1.5, 4.5); y = rnd.uniform(-2.0, 2.0); a = rnd.uniform(0, math.pi)
        w, h = rnd.uniform(1.5, 3.0), rnd.uniform(4, 8); z0 = rnd.uniform(0.8, 2.5)
        cols = 6; vs = []; fs = []
        for j in range(2):
            for i in range(cols + 1):
                t = i / cols - 0.5
                vs.append((x + t * w * math.cos(a) + 0.3 * math.sin(t * 3) * math.sin(a), y + t * w * math.sin(a), z0 + j * h + 0.3 * math.sin(t * 5 + j)))
        fs = [(i, i + 1, cols + 2 + i, cols + 1 + i) for i in range(cols)]
        AE.poly(vs, fs, VEIL)

    # ------------------------------------------------------------ 场地
    site.box(-60, 60, -40, 60, -0.3, -0.05, DIRT)
    site.box(YX0, YX1, YY0, YY1, -0.2, -0.02, DIRT)
    site.box(-60, 60, 30, 60, -0.28, -0.03, CONCF)   # 墓园外的旧路面
    for (px, py, r) in ((5.0, 29.0, 2.5), (-12.0, 33.0, 1.8), (18.0, 31.0, 1.4)):
        n = 14
        site.poly([(px + r * math.cos(i * math.tau / n) * rnd.uniform(0.7, 1.1), py + r * 0.6 * math.sin(i * math.tau / n), -0.01) for i in range(n)], [tuple(range(n))], WATER)

    # ------------------------------------------------------------ 背景：地基支柱、中层底面、管道、城缘老墙
    bp = Batch('bg_pillars'); bc = Batch('bg_ceiling'); bpi = Batch('bg_pipes'); bw = Batch('bg_perimeter'); bl = Batch('bg_lights')
    CEIL = 160.0
    for (x, y, s) in ((-55, 40, 14), (62, 78, 16), (70, -20, 18), (-75, -25, 16), (-30, -110, 22), (-20, 95, 18), (110, 70, 20), (-120, 60, 20), (30, -75, 16), (160, 10, 22)):
        bp.box(x - s / 2, x + s / 2, y - s / 2, y + s / 2, -1 if y > -40 else -400, CEIL, CONC)
        bp.box(x - s / 2 - 2, x + s / 2 + 2, y - s / 2 - 2, y + s / 2 + 2, CEIL - 12, CEIL, CONC)   # 柱帽
        for z in (22.0, 58.0, 95.0):   # 柱面灯
            bl.box(x - 1, x + 1, y + s / 2, y + s / 2 + 0.3, z, z + 0.5, LAMP_S if (x + z) % 3 else LAMP_W)
    CONC_D = C.pbr('concrete_dark', 'concrete_wall_008', 8.0, tint=(0.18, 0.18, 0.2), value=0.6)
    bc.box(-600, 600, -600, 600, CEIL, CEIL + 8, CONC_D)
    for i in range(18):   # 中层底面的梁格
        bc.box(-600, 600, -300 + i * 36, -300 + i * 36 + 4, CEIL - 6, CEIL, CONC_D)
    r3 = random.Random(9)
    for k in range(70):
        x, y = r3.uniform(-300, 300), r3.uniform(-200, 300)
        bl.box(x, x + 1.5, y, y + 1.5, CEIL - 6.6, CEIL - 6.3, LAMP_S if r3.random() < 0.6 else LAMP_W)
    for k in range(6):   # 管道：沿柱下行再横过天空
        x, y = r3.uniform(-80, 80), r3.uniform(40, 120)
        bpi.tube([(x, y, CEIL - 6), (x, y, 40 + k * 8), (x + 60, y - 30, 40 + k * 8)], r3.uniform(0.8, 1.6), RUST, n=10)
    bpi.tube([(-200, -48, 18), (200, -48, 18)], 1.4, RUST, n=10)
    bpi.tube([(-200, -47, 21), (200, -47, 21)], 0.8, RUST, n=8)
    # 城缘：地基板在 y=-44 处截断成断崖（板厚 40 m，下面是深渊），边上一道老围墙（几处坍口）+ 灯杆
    bw.box(-400, 400, -44, -40, -40, -0.3, CONC)          # 边缘地基板截面
    bw.box(-400, 400, -44.5, -44, -60, -0.3, CONCF)       # 断崖立面
    x = -400.0
    while x < 400:
        L = rnd.uniform(8, 16)
        h = 7.0 if rnd.random() > 0.2 else rnd.uniform(1.0, 2.5)   # 坍口
        bw.box(x, x + L, -43.6, -42.4, -0.3, h, CONC)
        if h > 5: bw.box(x, x + L, -43.9, -42.1, h, h + 0.4, CONC)
        x += L
    for i in range(-10, 11):
        xx = i * 24.0
        bw.box(xx - 0.8, xx + 0.8, -42.4, -41.2, -0.3, 8.0, CONC)            # 墙垛
        bl.box(xx - 0.3, xx + 0.3, -41.2, -40.9, 6.6, 7.0, LAMP_S)
    # 断崖外远处下方：朦胧的雾海 + 更低处稀疏灯点
    HAZE = C.flat('bg_haze', (0.02, 0.025, 0.035), 1.0, emit=(0.06, 0.08, 0.12), estr=0.4)
    bw.box(-3000, 3000, -3000, -45, -160, -150, HAZE)
    for k in range(60):
        xx, yy = r3.uniform(-900, 900), r3.uniform(-900, -120)
        bl.box(xx, xx + 3, yy, yy + 3, -149, -148, LAMP_S if r3.random() < 0.5 else LAMP_W)

    Batch.build_all()

    # ------------------------------------------------------------ 灯光：暗、主要人工光
    w = bpy.data.worlds.new('w'); sc.world = w
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.03, 0.04, 0.06, 1); bg.inputs[1].default_value = 1.0
    # 镜头直接看到的「天空」是深渊般的黑暗，只保留环境照明
    wn = w.node_tree; lp = wn.nodes.new('ShaderNodeLightPath'); bk = wn.nodes.new('ShaderNodeBackground')
    bk.inputs[0].default_value = (0.004, 0.005, 0.008, 1); mx = wn.nodes.new('ShaderNodeMixShader')
    wo = wn.nodes['World Output']
    wn.links.new(lp.outputs['Is Camera Ray'], mx.inputs[0]); wn.links.new(bg.outputs[0], mx.inputs[1]); wn.links.new(bk.outputs[0], mx.inputs[2])
    wn.links.new(mx.outputs[0], wo.inputs[0])
    # 冷色环境 + 中层底面的点状工作灯（窄光束，从很高处照下）
    C.spot_light('fill_top', (0, 5, 150), (0, 5, 0), 2.2e5, (0.55, 0.66, 0.9), angle=70, radius=25)
    for (i, (x, y, tx, ty, e, col)) in enumerate(((-22, 30, -4, 2, 3.2e5, (0.75, 0.85, 1.0)), (35, -10, 6, 0, 2.4e5, (0.75, 0.85, 1.0)),
                                                  (-40, -5, -16, 0, 1.6e5, (1.0, 0.62, 0.3)), (12, 60, 4, 22, 1.2e5, (1.0, 0.62, 0.3)))):
        C.spot_light('ceil_%d' % i, (x, y, 150), (tx, ty, 0), e, col, angle=12, radius=1.5)
    C.spot_light('east_light', (NX1 + 40, 2, 22), (NX1 - 6, 0, 1), 3.0e4, (0.7, 0.8, 1.0), angle=10, radius=0.5)   # 穿过东窗
    C.spot_light('edge_wall', (0, -30, 12), (0, -43, 3), 2.0e4, (1.0, 0.6, 0.28), angle=100, radius=1.0)
    for (x, y, z, e) in ((NX1 - 3.5, 0.0, 1.0, 200), (NX1 - 5.5, 0.5, 3.0, 70), (-2, -1, 2, 25)):
        C.point_light('aether_%d' % x, (x, y, z), e, (0.35, 0.7, 1.0), radius=1.0)
    C.point_light('lamp_gate', (GATE[0], GATE[1] + 4, 4.5), 300, (1.0, 0.6, 0.3), radius=0.2)
    sc.view_settings.exposure = 1.0
    if A['exposure']:
        sc.view_settings.exposure = float(A['exposure'])
    CAMS = {
        'c1': ((42, 50, 30), (-1, 2, 3), 28),
        'c2': ((NX0 + 4.5, -1.6, 1.7), (NX1, 0.4, 4.2), 20),
        'c3': ((8, 21, 4.2), (-15, 2, 10), 22),
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
