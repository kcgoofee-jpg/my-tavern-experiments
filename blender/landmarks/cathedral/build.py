"""辉光大教堂（方案 A）：哥特双塔西立面 + 浅色石材 + 飞扶壁 + 交叉处鼓座穹顶（镀金肋、采光亭）+ 南侧扇形拱顶回廊庭院。
全部自建；中立建筑，无文字 / 标志 / 宗教符号（尖顶用镀金球 + 尖顶饰）。

用法（仓库根目录；homebrew 的 blender 包装会吞 stdout，用 --python-expr + runpy，异常写到 --log）：
  blender -b --factory-startup --python-expr "import runpy; runpy.run_path('blender/landmarks/cathedral/build.py', run_name='__main__')" \
      -- --cam c1 --tod day --res 1000 --samples 48 --out /tmp/cath.jpg [--blend /tmp/cath.blend] [--log /tmp/cath.log]
cam: c1 西南斜俯（主图）/ c2 北回廊内（扇形拱顶）/ c3 东南斜俯（后殿 + 穹顶）/ c4 回廊庭院地面
tod: day | dusk（黄昏：低太阳 + 地面投光 + 花窗与采光亭透光 + 回廊灯）
"""
import math, os, sys, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import common as C  # noqa
from layout import *  # noqa

A = C.args(dict(cam='c1', tod='day', res='1000', samples='48', out='/tmp/cath.jpg', blend='', log='', exposure=''))


def main():
    import bpy
    from mathutils import Vector, Matrix
    sc = C.setup(A['samples'])
    DUSK = A['tod'] == 'dusk'
    Batch = C.Batch

    # ------------------------------------------------------------ 材质
    STONE = C.pbr('stone', 'white_sandstone_blocks_02', 2.2, tint=(1.0, 0.97, 0.9), value=0.95, sat=0.55, weather=0.4)
    STONE_D = C.pbr('stone_dressed', 'white_sandstone_blocks_02', 1.4, tint=(1.0, 0.97, 0.9), value=1.2, sat=0.4, nstr=0.4)
    STONE_W = C.pbr('stone_residence', 'white_sandstone_blocks_02', 2.6, tint=(1.0, 0.93, 0.82), value=1.05, sat=0.6, weather=0.25)
    LEAD = C.pbr('lead', 'Metal009', 2.5, tint=(0.36, 0.38, 0.4), value=1.0, sat=0.2, rough_mul=1.6, nstr=0.3, metal=0.35)
    COPPER = C.flat('verdigris', (0.2, 0.42, 0.36), 0.55, noise=0.25)
    GOLD = C.flat('gold', (1.0, 0.72, 0.32), 0.22, metal=1.0)
    SLATE = C.pbr('slate', 'roof_slates_02', 3.0, tint=(0.8, 0.82, 0.86), sat=0.5)
    PAVE = C.pbr('pave', 'precast_stone_paving', 4.0, tint=(0.95, 0.93, 0.9), value=1.05, sat=0.5)
    FLAG = C.pbr('flags', 'patterned_paving', 3.0, tint=(0.95, 0.92, 0.88), sat=0.5)
    GRASS = C.pbr('grass', 'grass_ground', 4.0, tint=(0.85, 0.95, 0.8))
    WOOD = C.flat('door_oak', (0.16, 0.09, 0.05), 0.55, noise=0.3)
    IRON = C.flat('iron', (0.025, 0.027, 0.03), 0.4, metal=0.6)
    BARK = C.flat('bark', (0.18, 0.14, 0.11), 0.9, noise=0.4)
    LEAF = C.flat('leaf', (0.12, 0.2, 0.08), 0.8, noise=0.45)
    YEW = C.flat('yew', (0.05, 0.11, 0.05), 0.85, noise=0.4)
    LAMPG = C.flat('lamp_glass', (1.0, 0.9, 0.7), 0.2, emit=(1.0, 0.72, 0.4), estr=(18.0 if DUSK else 0.0))

    def stained(name, warm=False):
        """花窗：白天深色反光玻璃；黄昏时室内点灯，按 Voronoi 色块透出彩光"""
        m, nt, b = C.new_mat(name)
        b.inputs['Base Color'].default_value = (0.04, 0.05, 0.07, 1)
        b.inputs['Roughness'].default_value = 0.08
        if DUSK:
            tc = nt.nodes.new('ShaderNodeTexCoord')
            vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 2.2
            nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
            col = C._mix(nt, vo.outputs['Color'], (1.0, 0.62, 0.3), 0.55 if not warm else 0.8)
            nt.links.new(col, b.inputs['Emission Color'])
            b.inputs['Emission Strength'].default_value = 2.2 if not warm else 6.0
        return m
    GLASS = stained('stained')
    LANT = stained('lantern_glass', warm=True)
    WIN_RES = C.glass('res_glass', emit=(1.0, 0.7, 0.4) if DUSK else None, estr=1.5)

    # ------------------------------------------------------------ 小工具
    def T(u, v=0.0, n=0.0):
        return Matrix.Translation((u, v, n))

    def vframe(O, D):
        """竖直平面：u = D（水平），v = z，n = D × z"""
        D = Vector(D).normalized(); Z = Vector((0, 0, 1)); N = D.cross(Z)
        M = Matrix((D, Z, N)).transposed().to_4x4(); M.translation = Vector(O)
        return M

    def rect(u0, u1, v0, v1):
        return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]

    def circle(r, n=24, cu=0.0, cv=0.0):
        return [(cu + r * math.cos(i * math.tau / n), cv + r * math.sin(i * math.tau / n)) for i in range(n)]

    def gwin(B, M, w, spring, glass=GLASS, lights=2, frame=0.28, depth=0.35):
        """哥特尖拱窗：玻璃 + 窗套 + 竖棂 + 两个子尖拱 + 圆形窗花（M = 窗底中点、n 朝外）"""
        pts, apex = C.pointed(w, spring)
        if glass is not None:
            C.slab2d(B, M, pts, 0.0, 0.04, glass)
        C.frame2d(B, M, pts, frame, 0.0, depth, STONE_D)
        C.frame2d(B, M, [(u * 1.0 + 0, v) for (u, v) in pts], 0.12, depth, depth + 0.12, STONE_D) if w > 3 else None
        if lights >= 2 and w > 1.6:
            wl = w / 2 - 0.05
            C.slab2d(B, M, rect(-0.09, 0.09, 0, spring + 0.1), 0.0, depth * 0.7, STONE_D)
            for s in (-1, 1):
                sp, _ = C.pointed(wl - 0.2, spring - 0.1)
                C.frame2d(B, M @ T(s * w / 4), sp, 0.1, 0.0, depth * 0.6, STONE_D)
            r = w * 0.16
            C.frame2d(B, M, circle(r, 20, 0, spring + 0.6 * w), 0.1, 0.0, depth * 0.6, STONE_D)
        return apex

    def rose(B, M, r, spokes=16):
        C.slab2d(B, M, circle(r, 40), 0.0, 0.05, GLASS)
        C.frame2d(B, M, circle(r + 0.5, 40), 0.7, 0.0, 0.6, STONE_D)
        C.frame2d(B, M, circle(r * 0.32, 24), 0.18, 0.0, 0.4, STONE_D)
        for i in range(spokes):
            a = i * math.tau / spokes
            R = Matrix.Rotation(a, 4, 'Z')
            C.slab2d(B, M @ R, rect(r * 0.3, r, -0.08, 0.08), 0.0, 0.35, STONE_D)
            ca, sa = math.cos(a + math.pi / spokes), math.sin(a + math.pi / spokes)
            C.frame2d(B, M, circle(r * 0.16, 14, ca * r * 0.7, sa * r * 0.7), 0.07, 0.0, 0.3, STONE_D)

    def pinnacle(B, x, y, z, s, h, m=STONE_D, crockets=True):
        B.boxc(x, y, z, s, s, h * 0.42, m)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):   # 小山花（gablet）
            px, py = x + dx * s * 0.5, y + dy * s * 0.5
            if dx:
                B.poly([(px, py - s / 2, z + h * 0.32), (px, py + s / 2, z + h * 0.32), (px, py, z + h * 0.52)], [(0, 1, 2)], m)
            else:
                B.poly([(px - s / 2, py, z + h * 0.32), (px + s / 2, py, z + h * 0.32), (px, py, z + h * 0.52)], [(0, 1, 2)], m)
        B.cyl(x, y, z + h * 0.42, s * 0.62, h * 0.55, m, n=8, r2=0.02, smooth=False)
        if crockets:
            for k in range(1, 4):
                zz = z + h * 0.42 + h * 0.55 * k / 4; rr = s * 0.62 * (1 - k / 4)
                for j in range(4):
                    a = j * math.pi / 2 + math.pi / 8
                    B.boxc(x + rr * math.cos(a), y + rr * math.sin(a), zz, s * 0.14, s * 0.14, s * 0.12, m)
        B.sphere(x, y, z + h * 0.98, s * 0.13, m, seg=8, rings=5)

    def portal(B, M, w, spring, orders=4, step=0.45, wimperg=True):
        """内收的尖拱门洞：层层拱券 + 木门 + 门楣上的尖山花（wimperg）"""
        pts, apex = C.pointed(w, spring)
        C.slab2d(B, M, rect(-w / 2, w / 2, 0, spring), 0.0, 0.08, WOOD)
        C.slab2d(B, M, pts, -0.05, 0.05, STONE_D)                # 门楣上方的石板（tympanum）
        C.slab2d(B, M, rect(-0.12, 0.12, 0, spring), 0.08, 0.2, IRON)   # 门中缝铁条
        for k in range(orders):
            wk = w + 2 * step * (k + 0.5)
            pk, ak = C.pointed(wk, spring)
            C.frame2d(B, M, pk, step, 0.0, 0.35 + 0.4 * k, STONE_D)
            B_top = ak
        W = w + 2 * step * orders
        C.slab2d(B, M, rect(-W / 2 - 0.4, W / 2 + 0.4, 0, 0.5), 0.0, 0.4 * orders + 0.3, STONE_D)   # 台基
        if wimperg:
            d = 0.4 * orders + 0.1
            tri = [(-W / 2, B_top - 1.2), (W / 2, B_top - 1.2), (0, B_top - 1.2 + W * 0.85)]
            C.slab2d(B, M, tri, d - 0.5, d, STONE)
            C.frame2d(B, M, tri, 0.35, d, d + 0.2, STONE_D)
            C.frame2d(B, M, circle(W * 0.14, 18, 0, B_top - 1.2 + W * 0.3), 0.12, d, d + 0.15, STONE_D)
            for s in (-1, 1):
                p = M @ Vector((s * (W / 2 + 0.3), 0, d - 0.4))
                pinnacle(B, p.x, p.y, 0.0 + (M @ Vector((0, 0, 0))).z, 0.9, B_top + W * 0.55)
            top = M @ Vector((0, B_top - 1.2 + W * 0.85, d - 0.25))
            B.sphere(top.x, top.y, top.z + 0.25, 0.35, STONE_D, seg=8, rings=5)
        return apex

    def flyer(B, O, D, rp, rw, zp, zw, ztop_p, ztop_w, t=0.9, m=STONE_D):
        """飞扶壁：下缘四分之一椭圆拱（扶壁墩 → 高墙，水平落在墙上），上缘直线压顶"""
        M = vframe(O, D)
        pts = []
        for i in range(13):
            th = math.pi / 2 * i / 12
            pts.append((rp - (rp - rw) * math.sin(th), zw - (zw - zp) * math.cos(th)))
        pts += [(rw, ztop_w), (rp, ztop_p)]
        C.slab2d(B, M, pts, -t / 2, t / 2, m)
        # 压顶上的小尖饰（crockets）
        for k in range(1, 6):
            f = k / 6
            r = rp + (rw - rp) * f; z = ztop_p + (ztop_w - ztop_p) * f
            p = M @ Vector((r, z, 0))
            B.boxc(p.x, p.y, p.z - 0.05, 0.28, 0.28, 0.35, m)

    def pier(B, O, D, r0, r1, z1, low_r, low_z):
        """扶壁墩：下段贴墙到 low_z（带收分斜面），上段独立墩到 z1"""
        M = vframe(O, D)
        C.slab2d(B, M, [(low_r, 0), (r1, 0), (r1, low_z), (low_r, low_z)], -1.1, 1.1, STONE)
        C.slab2d(B, M, [(r0, low_z), (r1, low_z), (r1, z1), (r0, z1)], -1.0, 1.0, STONE)
        C.slab2d(B, M, [(r1, low_z - 1.2), (r1 + 0.7, low_z - 1.2), (r1, low_z)], -1.1, 1.1, STONE)   # 收分披水
        p = M @ Vector(((r0 + r1) / 2, z1, 0))
        pinnacle(B, p.x, p.y, z1, 1.7, 9.0)

    # ------------------------------------------------------------ 场地
    site = Batch('site_ground'); fl = Batch('floor_0')
    sx0, sx1, sy0, sy1 = SITE
    site.box(sx0, sx1, sy0, sy1, -0.6, -0.02, PAVE)
    CITY = C.pbr('city_ground', 'asphalt_02', 6.0, tint=(0.7, 0.7, 0.72), sat=0.3)
    Batch('bg_far').box(-1500, 1500, -1500, 1500, -0.9, -0.08, CITY)   # 远处的街区地面（只为挡住地平线下的天空）
    px0, px1, py0, py1 = PIAZZA
    site.box(px0, px1, py0, py1, -0.02, 0.0, FLAG)
    for k in range(3):   # 西门台阶
        site.box(TOWER_X[0] - 3.6 + k * 1.2, TOWER_X[0], -TOWER_Y[1] - 2, TOWER_Y[1] + 2, 0.0, 0.18 * (k + 1), STONE_D)
    # 教堂地坪（略高于广场）
    fl.box(TOWER_X[0], CHOIR_X[1] + AMB_R + 1, -AISLE_HW - 5, AISLE_HW + 5, -0.5, 0.54, STONE_D)
    fl.box(-TRANS_HW - 3, TRANS_HW + 3, -TRANS_Y - 4, TRANS_Y + 4, -0.5, 0.54, STONE_D)
    for s in (-1, 1):
        for k in range(3):
            fl.box(-TRANS_HW + 1, TRANS_HW - 1, s * (TRANS_Y + 4 + 1.2 * k), s * (TRANS_Y + 5.2 + 1.2 * k), -0.3, 0.54 - 0.18 * (k + 1), STONE_D)
    # 广场灯杆 + 树
    pz = Batch('props_piazza')
    lamps = []
    for x in (-140, -122, -104):
        for s in (-1, 1):
            y = s * 30
            pz.cyl(x, y, 0, 0.35, 0.6, IRON, 12); pz.cyl(x, y, 0.6, 0.12, 4.4, IRON, 10)
            pz.boxc(x, y, 5.0, 0.7, 0.7, 0.9, LAMPG); pz.pyramid(x, y, 5.9, 0.95, 0.95, 0.5, IRON)
            pz.cyl(x, y, 6.4, 0.08, 0.5, IRON, 6, r2=0.01)
            lamps.append((x, y, 5.45))

    def tree(B, x, y, h=7.0, r=3.2, m=LEAF, seed=0):
        B.cyl(x, y, 0, 0.3, h * 0.6, BARK, 10, r2=0.18)
        import random
        rnd = random.Random(seed)
        for k in range(7):
            a = rnd.uniform(0, math.tau); d = rnd.uniform(0, r * 0.55)
            B.sphere(x + d * math.cos(a), y + d * math.sin(a), h * 0.62 + rnd.uniform(0, h * 0.35), r * rnd.uniform(0.5, 0.75), m, seg=12, rings=8)
    for i, x in enumerate(range(-146, -94, 9)):
        for s in (-1, 1):
            tree(pz, x, s * 37, 8.5, 3.4, seed=i * 2 + (s > 0))

    # ------------------------------------------------------------ 中殿 + 侧廊
    W = Batch('walls_ext'); R = Batch('roof'); BT = Batch('props_buttress')
    yw = VESSEL_HW + WALL_T / 2          # 高墙外皮
    ya = AISLE_HW + 0.75                 # 侧廊外墙外皮
    x0, x1 = NAVE_X
    W.box(x0, x1, -yw, yw, 0, EAVE, STONE)
    for s in (-1, 1):
        W.box(x0, x1, s * yw, s * ya, 0, AISLE_EAVE, STONE)
        W.box(x0, x1, s * (ya + 0.3), s * (ya - 0.2), 0, 1.2, STONE_D)                 # 勒脚
        W.box(x0, x1, s * (ya + 0.25), s * (ya - 0.2), AISLE_EAVE - 0.6, AISLE_EAVE, STONE_D)   # 檐口线
        W.box(x0, x1, s * (ya + 0.1), s * (ya - 0.3), AISLE_EAVE, AISLE_EAVE + 1.3, STONE_D)   # 侧廊女儿墙
        W.box(x0, x1, s * (yw + 0.25), s * (yw - 0.2), EAVE - 0.7, EAVE, STONE_D)
        W.box(x0, x1, s * (yw + 0.1), s * (yw - 0.35), EAVE, EAVE + 1.5, STONE_D)       # 高墙女儿墙
        W.box(x0, x1, s * (yw + 0.2), s * (yw - 0.1), 19.6, 20.2, STONE_D)              # 高侧窗下的线脚
        # 侧廊单坡顶
        R.poly([(x0, s * (ya - 0.3), AISLE_EAVE + 0.2), (x1, s * (ya - 0.3), AISLE_EAVE + 0.2),
                (x1, s * yw, AISLE_TOP), (x0, s * yw, AISLE_TOP)], [(0, 1, 2, 3) if s < 0 else (3, 2, 1, 0)], LEAD)
    R.gable(x0, x1, -yw + 0.35, yw - 0.35, EAVE + 0.2, ROOF_H, LEAD, 'x')
    R.box(x0, x1, -0.15, 0.15, EAVE + 0.2 + ROOF_H - 0.1, EAVE + ROOF_H + 0.5, LEAD)   # 屋脊
    bw = (x1 - x0) / NAVE_BAYS
    for i in range(NAVE_BAYS):
        xc = x0 + (i + 0.5) * bw
        for s in (-1, 1):
            gwin(W, C.wall_frame((xc, s * yw, 20.6), (0, s, 0)), 4.6, 24.6)
            gwin(W, C.wall_frame((xc, s * ya, 3.6), (0, s, 0)), 4.0, 8.4)
        if i == 0:
            continue
        xb = x0 + i * bw
        for s in (-1, 1):
            O = (xb, 0, 0); D = (0, s, 0)
            pier(BT, O, D, PIER_Y[0], PIER_Y[1], PIER_H, ya - 0.1, AISLE_EAVE + 0.5)
            flyer(BT, O, D, PIER_Y[0], yw, 22.0, 27.2, 25.0, 28.2)
            flyer(BT, O, D, PIER_Y[0], yw, 17.0, 21.5, 19.5, 22.5)
            pinnacle(BT, xb, s * yw, EAVE + 0.2, 1.1, 5.5)
            BT.boxc(xb, s * yw, 0, 1.4, 1.2, EAVE - 0.5, STONE)   # 高墙壁柱

    # ------------------------------------------------------------ 西立面双塔
    WF = Batch('props_westfront')
    tx0, tx1 = TOWER_X
    for s in (-1, 1):
        ty0, ty1 = sorted((s * TOWER_Y[0], s * TOWER_Y[1]))
        tyc = (ty0 + ty1) / 2
        WF.box(tx0, tx1, ty0, ty1, 0, TOWER_H, STONE)
        for zc in (20.0, 37.0, TOWER_H - 1.0):   # 分层线脚
            WF.box(tx0 - 0.35, tx1 + 0.35, ty0 - 0.35, ty1 + 0.35, zc - 0.5, zc, STONE_D)
        # 角扶壁（三段收分）+ 顶上的小尖塔
        for cx in (tx0, tx1):
            for cy in (ty0, ty1):
                for (z0_, z1_, d_) in ((0, 20, 2.4), (20, 37, 1.9), (37, TOWER_H + 1, 1.4)):
                    WF.box(cx - d_ / 2 - (d_ / 2 if cx == tx0 else -d_ / 2), cx + d_ / 2 - (d_ / 2 if cx == tx0 else -d_ / 2),
                           cy - 1.1, cy + 1.1, z0_, z1_, STONE)
                    WF.box(cx - 1.1, cx + 1.1, cy - d_ / 2 - (d_ / 2 if cy == ty0 else -d_ / 2),
                           cy + d_ / 2 - (d_ / 2 if cy == ty0 else -d_ / 2), z0_, z1_, STONE)
                pinnacle(WF, cx, cy, TOWER_H + 1, 2.2, 12.0)
        # 塔身窗：西面 + 外侧面（+ 东面高出屋顶的部分）
        faces = [((tx0, tyc), (-1, 0)), ((0.5 * (tx0 + tx1), s * TOWER_Y[1]), (0, s)), ((tx1, tyc), (1, 0))]
        for (fx, fy), n in faces:
            M = lambda z: C.wall_frame((fx, fy, z), (n[0], n[1], 0))
            if n != (1, 0):
                gwin(WF, M(22.5), 3.6, 29.0 - 22.5 + 0)
            for du in (-2.2, 2.2):
                gwin(WF, M(39.0) @ T(du), 2.6, 10.5, lights=1)
        # 侧门（塔底西面）
        portal(WF, C.wall_frame((tx0, tyc, 0.54), (-1, 0, 0)), 4.0, 7.2, orders=4)
        # 顶部女儿墙（镂空感：一排小尖拱）
        for side in range(4):
            pass
        WF.box(tx0 - 0.3, tx1 + 0.3, ty0 - 0.3, ty1 + 0.3, TOWER_H, TOWER_H + 1.0, STONE_D)
        # 八角钟楼层
        cx, cy = 0.5 * (tx0 + tx1), tyc
        rb = 6.9; zb0 = TOWER_H + 1.0; zb1 = zb0 + BELFRY_H
        WF.cyl(cx, cy, zb0, rb, BELFRY_H, STONE, n=8, smooth=False)
        WF.cyl(cx, cy, zb1 - 0.8, rb + 0.35, 0.8, STONE_D, n=8, smooth=False)
        ri = rb * math.cos(math.pi / 8)
        for k in range(8):
            a = (k + 0.5) * math.pi / 4
            n = (math.cos(a), math.sin(a), 0)
            M = C.wall_frame((cx + ri * n[0], cy + ri * n[1], zb0 + 1.5), n)
            ap = gwin(WF, M, 2.4, 10.0, lights=1, frame=0.22)
            tri = [(-2.3, ap - 0.8 + 1.5 - 1.5), (2.3, ap - 0.8), (0, ap + 3.2)]
            tri = [(-2.4, ap - 1.0), (2.4, ap - 1.0), (0, ap + 3.0)]
            C.slab2d(WF, M, tri, 0.0, 0.35, STONE_D)
            C.frame2d(WF, M, tri, 0.25, 0.35, 0.5, STONE_D)
            # 八角形各角的小尖塔
            b_ = k * math.pi / 4
            pinnacle(WF, cx + (rb + 0.2) * math.cos(b_), cy + (rb + 0.2) * math.sin(b_), zb1 - 0.8, 0.9, 6.0)
        # 镂空尖塔：八根角肋 + 水平环 + 面上的圆形窗花 + 内部暗色芯
        zs0 = zb1; zs1 = zb1 + SPIRE_H; r0 = rb - 0.6
        WF.cyl(cx, cy, zs0, r0 * 0.62, SPIRE_H * 0.8, C.flat('spire_core', (0.18, 0.17, 0.16), 0.9) if 'spire_core' not in bpy.data.materials else bpy.data.materials['spire_core'], n=8, r2=0.3, smooth=False)
        for k in range(8):
            a = k * math.pi / 4
            WF.strip([(cx + r0 * math.cos(a), cy + r0 * math.sin(a), zs0), (cx, cy, zs1 - 0.5)], 0.6, 0.6, STONE_D)
            for j in range(1, 12):   # 角肋上的卷叶饰
                f = j / 12
                WF.boxc(cx + r0 * (1 - f) * math.cos(a) * 1.04, cy + r0 * (1 - f) * math.sin(a) * 1.04, zs0 + SPIRE_H * f, 0.45, 0.45, 0.4, STONE_D)
        rings = 8
        for j in range(1, rings):
            f = j / rings
            rr = r0 * (1 - f)
            WF.strip([(cx + rr * math.cos(k * math.pi / 4), cy + rr * math.sin(k * math.pi / 4), zs0 + SPIRE_H * f) for k in range(9)], 0.35, 0.35, STONE_D)
        for j in range(rings - 2):
            f0, f1 = j / rings, (j + 1) / rings
            fm = (f0 + f1) / 2; rr = r0 * (1 - fm) * math.cos(math.pi / 8)
            for k in range(8):
                a = (k + 0.5) * math.pi / 4
                n = (math.cos(a), math.sin(a), 0)
                zc = zs0 + SPIRE_H * fm
                M = C.wall_frame((cx + rr * n[0], cy + rr * n[1], zc), n)
                tilt = Matrix.Rotation(math.atan2(r0, SPIRE_H), 4, 'X')
                C.frame2d(WF, M @ tilt, circle(r0 * (1 - fm) * 0.3, 14), 0.14, -0.1, 0.12, STONE_D)
        WF.sphere(cx, cy, zs1, 0.9, STONE_D, seg=12, rings=8)
        WF.cyl(cx, cy, zs1 + 0.6, 0.18, 2.4, GOLD, 8, r2=0.02)
    # 双塔之间：中央山墙段（主门 + 玫瑰窗 + 尖山墙）
    xw = tx0 + 2.0
    WF.box(xw, tx1, -TOWER_Y[0], TOWER_Y[0], 0, 36.0, STONE)
    Mw = lambda z: C.wall_frame((xw, 0, z), (-1, 0, 0))
    portal(WF, Mw(0.54), 6.0, 10.0, orders=5)
    rose(WF, Mw(30.0), 5.2)
    C.slab2d(WF, Mw(0), [(-6.5, 36), (6.5, 36), (0, 47.5)], -12.0, 0.0, STONE)           # 西山墙
    C.frame2d(WF, Mw(0), [(-6.5, 36), (6.5, 36), (0, 47.5)], 0.4, 0.0, 0.3, STONE_D)
    for du in (-4.5, -1.5, 1.5, 4.5):   # 山墙下的小尖拱廊（king's gallery 式）
        gwin(WF, Mw(36.3) @ T(du), 2.2, 3.5, lights=1, glass=GLASS, frame=0.2)
    WF.box(xw - 0.6, xw, -TOWER_Y[0], TOWER_Y[0], 35.6, 36.3, STONE_D)
    pinnacle(WF, xw - 0.2, 0, 47.2, 1.2, 6.0)

    # ------------------------------------------------------------ 耳堂
    TR = Batch('props_transept')
    TR.box(-TRANS_HW, TRANS_HW, -TRANS_Y, TRANS_Y, 0, EAVE, STONE)
    R.gable(-TRANS_HW + 0.35, TRANS_HW - 0.35, -TRANS_Y, TRANS_Y, EAVE + 0.2, ROOF_H, LEAD, 'y')
    R.box(-0.15, 0.15, -TRANS_Y, TRANS_Y, EAVE + 0.2 + ROOF_H - 0.1, EAVE + ROOF_H + 0.5, LEAD)
    for s in (-1, 1):
        yf = s * TRANS_Y
        Me = lambda z: C.wall_frame((0, yf, z), (0, s, 0))
        portal(TR, Me(0.54), 4.6, 7.8, orders=4)
        rose(TR, Me(20.0), 6.0)
        C.slab2d(TR, Me(0), [(-TRANS_HW, EAVE), (TRANS_HW, EAVE), (0, EAVE + ROOF_H + 0.6)], -1.5, 0.0, STONE)
        C.frame2d(TR, Me(0), [(-TRANS_HW, EAVE), (TRANS_HW, EAVE), (0, EAVE + ROOF_H + 0.6)], 0.4, 0.0, 0.3, STONE_D)
        pinnacle(TR, 0, yf + s * 0.2, EAVE + ROOF_H + 0.4, 1.1, 5.0)
        for cx in (-TRANS_HW, TRANS_HW):   # 端墙角扶壁 + 尖塔
            TR.box(cx - 1.3, cx + 1.3, yf - s * 1.0, yf + s * 2.4, 0, EAVE + 2.0, STONE)
            pinnacle(TR, cx, yf + s * 0.7, EAVE + 2.0, 2.0, 11.0)
        for cx in (-TRANS_HW, TRANS_HW):   # 端墙上的线脚与女儿墙
            TR.box(min(cx, cx + (1 if cx < 0 else -1) * 0.1), max(cx, cx + (1 if cx < 0 else -1) * 0.1), s * 8, yf, EAVE, EAVE + 1.5, STONE_D)
        for x_ in (-1, 1):   # 耳堂侧墙：高侧窗 + 低窗（侧廊以外的一段）
            for yc in (21.0, 29.0):
                Mx = C.wall_frame((x_ * TRANS_HW, s * yc, 20.6), (x_, 0, 0))
                gwin(TR, Mx, 4.2, 24.4)
                if yc > 20:
                    gwin(TR, C.wall_frame((x_ * TRANS_HW, s * yc, 3.6), (x_, 0, 0)), 3.6, 8.4)
            TR.boxc(x_ * (TRANS_HW + 0.4), s * 25.0, 0, 0.9, 1.4, EAVE - 0.5, STONE)
            TR.box(x_ * TRANS_HW, x_ * (TRANS_HW + 0.4), s * 8, s * TRANS_Y, EAVE, EAVE + 1.5, STONE_D)

    # ------------------------------------------------------------ 唱诗堂 + 后殿 + 放射状小礼拜堂
    AP = Batch('props_apse')
    c0, c1 = CHOIR_X
    AP.box(c0, c1, -yw, yw, 0, EAVE, STONE)
    R.gable(c0, c1, -yw + 0.35, yw - 0.35, EAVE + 0.2, ROOF_H, LEAD, 'x')
    R.box(c0, c1, -0.15, 0.15, EAVE + 0.2 + ROOF_H - 0.1, EAVE + ROOF_H + 0.5, LEAD)
    cbw = (c1 - c0) / 3
    for s in (-1, 1):
        AP.box(c0, c1, s * yw, s * ya, 0, AISLE_EAVE, STONE)
        AP.box(c0, c1, s * (ya + 0.1), s * (ya - 0.3), AISLE_EAVE, AISLE_EAVE + 1.3, STONE_D)
        AP.box(c0, c1, s * (yw + 0.1), s * (yw - 0.35), EAVE, EAVE + 1.5, STONE_D)
        R.poly([(c0, s * (ya - 0.3), AISLE_EAVE + 0.2), (c1, s * (ya - 0.3), AISLE_EAVE + 0.2),
                (c1, s * yw, AISLE_TOP), (c0, s * yw, AISLE_TOP)], [(0, 1, 2, 3) if s < 0 else (3, 2, 1, 0)], LEAD)
        for i in range(3):
            xc = c0 + (i + 0.5) * cbw
            gwin(AP, C.wall_frame((xc, s * yw, 20.6), (0, s, 0)), 4.4, 24.6)
            gwin(AP, C.wall_frame((xc, s * ya, 3.6), (0, s, 0)), 3.8, 8.4)
            if i > 0:
                xb = c0 + i * cbw
                pier(BT, (xb, 0, 0), (0, s, 0), PIER_Y[0], PIER_Y[1], PIER_H, ya - 0.1, AISLE_EAVE + 0.5)
                flyer(BT, (xb, 0, 0), (0, s, 0), PIER_Y[0], yw, 22.0, 27.2, 25.0, 28.2)
    # 后殿（半圆）+ 回廊外墙 + 单坡环形屋顶
    ra = APSE_R + 0.75; ro = AMB_R + 0.75
    AP.lathe(c1, 0, 0, [(ra, 0), (ra, EAVE)], STONE, n=24, a0=-math.pi / 2, a1=math.pi / 2)
    AP.lathe(c1, 0, 0, [(ra + 0.15, EAVE), (ra + 0.15, EAVE + 1.5), (ra - 0.3, EAVE + 1.5)], STONE_D, n=24, a0=-math.pi / 2, a1=math.pi / 2)
    R.lathe(c1, 0, 0, [(ra - 0.2, EAVE + 0.2), (0.05, EAVE + 0.2 + ROOF_H)], LEAD, n=24, a0=-math.pi / 2, a1=math.pi / 2)
    AP.lathe(c1, 0, 0, [(ro, 0), (ro, AISLE_EAVE), (ro - 0.4, AISLE_EAVE + 1.3)], STONE, n=32, a0=-math.pi / 2, a1=math.pi / 2)
    R.lathe(c1, 0, 0, [(ro - 0.3, AISLE_EAVE + 0.2), (ra, AISLE_TOP)], LEAD, n=32, a0=-math.pi / 2, a1=math.pi / 2)
    for a in (-60, -30, 0, 30, 60):
        t = math.radians(a); n = (math.cos(t), math.sin(t), 0)
        gwin(AP, C.wall_frame((c1 + ra * n[0], ra * n[1], 20.6), n), 3.0, 24.6, lights=1)
    for a in (-75, -45, -15, 15, 45, 75):   # 放射状飞扶壁
        t = math.radians(a); D = (math.cos(t), math.sin(t), 0)
        pier(BT, (c1, 0, 0), D, AMB_R + 1.2, AMB_R + 4.4, PIER_H - 1, ro - 0.1, AISLE_EAVE + 0.5)
        flyer(BT, (c1, 0, 0), D, AMB_R + 1.2, ra, 22.0, 27.2, 24.0, 28.2)
    for a in CHAPELS:
        t = math.radians(a); ccx, ccy = c1 + CHAPEL_D * math.cos(t), CHAPEL_D * math.sin(t)
        AP.cyl(ccx, ccy, 0, CHAPEL_R, 13.0, STONE, n=10, smooth=False)
        AP.cyl(ccx, ccy, 13.0, CHAPEL_R + 0.25, 0.8, STONE_D, n=10, smooth=False)
        R.cyl(ccx, ccy, 13.6, CHAPEL_R + 0.3, 5.8, LEAD, n=10, r2=0.05, smooth=False)
        for k in (-1, 0, 1):
            b = t + k * math.radians(36)
            n = (math.cos(b), math.sin(b), 0); rr = CHAPEL_R * math.cos(math.pi / 10)
            gwin(AP, C.wall_frame((ccx + rr * n[0], ccy + rr * n[1], 3.2), n), 1.9, 8.2, lights=1, frame=0.2)
        for k in (-1.5, -0.5, 0.5, 1.5):
            b = t + k * math.radians(36)
            AP.boxc(ccx + (CHAPEL_R + 0.3) * math.cos(b), ccy + (CHAPEL_R + 0.3) * math.sin(b), 0, 1.0, 1.0, 12.0, STONE)
            pinnacle(AP, ccx + (CHAPEL_R + 0.3) * math.cos(b), ccy + (CHAPEL_R + 0.3) * math.sin(b), 12.0, 0.9, 4.5)

    # ------------------------------------------------------------ 交叉处：方座 + 鼓座 + 柱廊 + 穹顶（镀金肋）+ 采光亭
    DM = Batch('props_dome')
    h8 = TRANS_HW + 0.5
    DM.box(-h8, h8, -h8, h8, EAVE - 1.0, CROSS_TOP, STONE)
    DM.box(-h8 - 0.4, h8 + 0.4, -h8 - 0.4, h8 + 0.4, CROSS_TOP - 1.2, CROSS_TOP, STONE_D)
    for cx in (-h8, h8):
        for cy in (-h8, h8):
            DM.cyl(cx, cy, EAVE - 1, 1.7, CROSS_TOP - EAVE + 5, STONE, n=8, smooth=False)
            pinnacle(DM, cx, cy, CROSS_TOP + 4, 1.6, 7.0)
    for s in (-1, 1):
        for ax in ('x', 'y'):
            for du in (-3.2, 0, 3.2):
                if ax == 'x':
                    M = C.wall_frame((s * h8, du, EAVE + ROOF_H + 0.8), (s, 0, 0))
                else:
                    M = C.wall_frame((du, s * h8, EAVE + ROOF_H + 0.8), (0, s, 0))
                C.frame2d(DM, M, rect(-0.9, 0.9, 0, CROSS_TOP - EAVE - ROOF_H - 2.6), 0.2, 0.0, 0.25, STONE_D)
    zd0 = CROSS_TOP; zd1 = zd0 + DRUM_H
    DM.cyl(0, 0, zd0, PERI_R + 1.2, 1.0, STONE_D, n=48)             # 柱廊台基
    DM.cyl(0, 0, zd0, DRUM_R, DRUM_H, STONE, n=48)
    for k in range(32):                                              # 柱廊：32 根柱
        a = k * math.tau / 32
        x, y = PERI_R * math.cos(a), PERI_R * math.sin(a)
        DM.cyl(x, y, zd0 + 1.0, 0.55, 0.4, STONE_D, n=12)
        DM.cyl(x, y, zd0 + 1.4, 0.42, DRUM_H - 3.4, STONE_D, n=12, r2=0.36)
        DM.cyl(x, y, zd1 - 2.0, 0.36, 0.6, STONE_D, n=12, r2=0.6)
    DM.lathe(0, 0, zd1 - 1.4, [(DRUM_R, 0), (PERI_R + 0.9, 0), (PERI_R + 0.9, 1.0), (PERI_R + 1.3, 1.3), (PERI_R + 1.3, 1.8), (DRUM_R, 1.8)], STONE_D, n=48, smooth=False)
    for k in range(64):                                              # 柱廊顶的栏杆
        a = k * math.tau / 64
        DM.cyl((PERI_R + 0.9) * math.cos(a), (PERI_R + 0.9) * math.sin(a), zd1 + 0.4, 0.14, 1.0, STONE_D, n=6)
    DM.lathe(0, 0, zd1 + 1.4, [(PERI_R + 1.1, 0), (PERI_R + 1.1, 0.3), (PERI_R + 0.7, 0.3)], STONE_D, n=48, smooth=False)
    for k in range(16):                                              # 鼓座上的圆拱窗
        a = (k + 0.5) * math.tau / 16
        n = (math.cos(a), math.sin(a), 0)
        M = C.wall_frame((DRUM_R * n[0], DRUM_R * n[1], zd0 + 2.6), n)
        pts = rect(-0.9, 0.9, 0, 4.6)[:2] + [(0.9 * math.cos(i * math.pi / 8), 4.6 + 0.9 * math.sin(i * math.pi / 8)) for i in range(9)]
        C.slab2d(DM, M, pts, 0.0, 0.05, GLASS)
        C.frame2d(DM, M, pts, 0.22, 0.0, 0.3, STONE_D)
    za = zd1 + 1.4
    DM.cyl(0, 0, za, DRUM_R - 0.3, 2.6, STONE, n=48)                 # 顶鼓（attic）
    DM.lathe(0, 0, za + 2.6, [(DRUM_R - 0.1, 0), (DRUM_R - 0.1, 0.5), (DRUM_R - 0.5, 0.5)], STONE_D, n=48, smooth=False)
    rd = DRUM_R - 0.5; zc = za + 3.1
    DM.sphere(0, 0, zc, rd, COPPER, sz=DOME_SZ, seg=48, rings=24, zmin=0.0)
    lr = 2.6
    phl = math.acos(lr / rd)                                         # 采光亭底部所在的纬度
    zl = zc + rd * DOME_SZ * math.sin(phl)
    for k in range(RIBS):                                            # 镀金肋
        a = k * math.tau / RIBS
        pts = []
        for j in range(15):
            ph = phl * j / 14
            r = rd + 0.12
            pts.append((r * math.cos(ph) * math.cos(a), r * math.cos(ph) * math.sin(a), zc + r * DOME_SZ * math.sin(ph)))
        DM.strip(pts, 0.5, 0.3, GOLD)
    DM.lathe(0, 0, zc - 0.1, [(rd + 0.25, 0), (rd + 0.25, 0.5), (rd, 0.7)], GOLD, n=48)   # 穹顶底部的镀金环
    DM.cyl(0, 0, zl - 0.3, lr + 0.4, 1.0, GOLD, n=24)
    DM.cyl(0, 0, zl + 0.7, lr - 0.6, 5.2, LANT, n=24)
    for k in range(8):
        a = k * math.tau / 8
        DM.cyl(lr * math.cos(a), lr * math.sin(a), zl + 0.7, 0.28, 5.2, GOLD, n=8)
    DM.cyl(0, 0, zl + 5.9, lr + 0.3, 0.7, GOLD, n=24)
    DM.sphere(0, 0, zl + 6.6, lr * 0.85, GOLD, sz=1.1, seg=24, rings=12, zmin=0.0)
    DM.cyl(0, 0, zl + 6.6 + lr * 0.85 * 1.1, 0.35, 1.2, GOLD, n=12)
    DM.sphere(0, 0, zl + 8.9 + lr * 0.85 * 1.1 - 1.0, 0.8, GOLD, seg=16, rings=10)
    DM.cyl(0, 0, zl + 8.7 + lr * 0.85 * 1.1, 0.14, 3.2, GOLD, n=8, r2=0.01)
    LANTERN_Z = zl + 3.3

    # ------------------------------------------------------------ 回廊庭院（扇形拱顶）+ 连廊 + 大主教府邸
    CL = Batch('props_cloister')
    X0, X1, Y0, Y1 = CLOISTER
    ww = WALK_W
    vault_m = STONE_D

    def P(ax, s, c, z):
        return (s, c, z) if ax == 'x' else (c, s, z)

    def fan_bay(ax, s0, s1, c0_, c1_):
        """一个方形跨间：四角的扇形锥面（等曲率肋），中间平顶 + 圆形浮雕饰（boss）"""
        sm, cm = (s0 + s1) / 2, (c0_ + c1_) / 2
        Rr = min(abs(s1 - s0), abs(c1_ - c0_)) / 2
        H = VAULT_TOP - VAULT_SPRING
        for (ss, cc) in ((s0, c0_), (s1, c0_), (s1, c1_), (s0, c1_)):
            ds, dc = (1 if sm > ss else -1), (1 if cm > cc else -1)
            base = math.atan2(dc, ds) - math.pi / 4
            na, nt = 10, 9
            vs, fs = [], []
            for i in range(na + 1):
                a = base + (math.pi / 2) * i / na
                for j in range(nt + 1):
                    t = Rr * j / nt
                    z = VAULT_SPRING + H * math.sqrt(max(0.0, 1 - (1 - t / Rr) ** 2))
                    vs.append(P(ax, ss + t * math.cos(a), cc + t * math.sin(a), z))
            for i in range(na):
                for j in range(nt):
                    a_, b_ = i * (nt + 1) + j, (i + 1) * (nt + 1) + j
                    fs.append((a_, a_ + 1, b_ + 1, b_))
            CL.poly(vs, fs, vault_m, smooth=True)
            for i in range(0, na + 1, 2):                                   # 肋
                a = base + (math.pi / 2) * i / na
                pts = []
                for j in range(nt + 1):
                    t = Rr * j / nt
                    z = VAULT_SPRING + H * math.sqrt(max(0.0, 1 - (1 - t / Rr) ** 2)) - 0.06
                    pts.append(P(ax, ss + t * math.cos(a), cc + t * math.sin(a), z))
                CL.strip(pts, 0.09, 0.1, STONE_D)
            for tf in (0.55, 0.8, 1.0):                                     # 横向的环肋（扇面的分格）
                t = Rr * tf; z = VAULT_SPRING + H * math.sqrt(max(0.0, 1 - (1 - tf) ** 2)) - 0.06
                pts = [P(ax, ss + t * math.cos(base + (math.pi / 2) * i / 12), cc + t * math.sin(base + (math.pi / 2) * i / 12), z) for i in range(13)]
                CL.strip(pts, 0.08, 0.1, STONE_D)
            CL.cyl(*P(ax, ss + 0.0, cc, 0)[:2], 0.54, 0.18, VAULT_SPRING, STONE_D, n=8) if False else None
        # 中间平顶（四个锥面之间的菱形空档）+ 浮雕饰
        sq = [P(ax, sm + Rr * math.cos(i * math.pi / 2), cm + Rr * math.sin(i * math.pi / 2), VAULT_TOP) for i in range(4)]
        CL.poly(sq, [(3, 2, 1, 0)], vault_m)
        corners = [P(ax, s0, c0_, VAULT_TOP), P(ax, s1, c0_, VAULT_TOP), P(ax, s1, c1_, VAULT_TOP), P(ax, s0, c1_, VAULT_TOP)]
        CL.poly(corners, [(3, 2, 1, 0)], vault_m) if False else None
        cz = P(ax, sm, cm, VAULT_TOP - 0.25)
        CL.sphere(cz[0], cz[1], cz[2], 0.32, STONE_D, sz=0.6, seg=12, rings=6)
        CL.lathe(cz[0], cz[1], VAULT_TOP - 0.12, [(1.0, 0), (0.9, 0.1)], STONE_D, n=16)

    def walk(ax, s0, s1, c_out, c_in, open0, open1):
        """回廊一边：ax = 走向轴，c_out 外墙线，c_in 拱廊线（朝庭院），[open0, open1] = 有拱廊开口的一段"""
        sg = 1 if c_in > c_out else -1
        # 地面、外墙、拱顶上方的单坡屋顶
        a_ = P(ax, s0, c_out, 0); b_ = P(ax, s1, c_in, 0)
        fl.box(a_[0], b_[0], a_[1], b_[1], 0.0, 0.2, FLAG)
        o0 = P(ax, s0, c_out - sg * 0.9, 0); o1 = P(ax, s1, c_out, 0)
        CL.box(o0[0], o1[0], o0[1], o1[1], 0, WALK_H + 2.6, STONE)
        v = [P(ax, s0, c_in + sg * 0.8, WALK_H), P(ax, s1, c_in + sg * 0.8, WALK_H), P(ax, s1, c_out - sg * 0.3, WALK_H + 2.6), P(ax, s0, c_out - sg * 0.3, WALK_H + 2.6)]
        R.poly(v, [(0, 1, 2, 3)], LEAD)
        # 顶板（盖住拱顶上方的空腔）
        t0 = P(ax, s0, c_out, VAULT_TOP); t1 = P(ax, s1, c_in, VAULT_TOP + 0.3)
        CL.box(t0[0], t1[0], t0[1], t1[1], VAULT_TOP + 0.05, VAULT_TOP + 0.3, STONE)
        # 扇形拱顶
        L = s1 - s0; nb = max(1, round(L / WALK_BAY)); bl = L / nb
        for i in range(nb):
            fan_bay(ax, s0 + i * bl, s0 + (i + 1) * bl, c_out, c_in)
            for (ss, cc) in ((s0 + i * bl, c_out), (s0 + i * bl, c_in)):   # 墙上的束柱（承托扇面）
                p = P(ax, ss, cc, 0)
                CL.cyl(p[0], p[1], 0.2, 0.22, VAULT_SPRING - 0.2, STONE_D, n=8)
                CL.cyl(p[0], p[1], VAULT_SPRING - 0.3, 0.26, 0.35, STONE_D, n=8)
            if i % 2 == 0:                                                 # 外墙上的壁灯
                p = P(ax, s0 + (i + 0.5) * bl, c_out + sg * 0.2, 2.6)
                CL.boxc(p[0], p[1], p[2], 0.34, 0.34, 0.5, LAMPG)
                CL.pyramid(p[0], p[1], p[2] + 0.5, 0.44, 0.44, 0.25, IRON)
                lamps.append((p[0], p[1], p[2] + 0.25))
        # 拱廊墙（朝庭院）：墩 + 矮墙 + 尖拱 + 窗花，拱上是实墙
        ci0, ci1 = c_in - sg * 0.45, c_in + sg * 0.45
        for (a, b, full) in ((s0, open0, True), (open1, s1, True)):
            if b - a > 0.01:
                p0 = P(ax, a, ci0, 0); p1 = P(ax, b, ci1, 0)
                CL.box(p0[0], p1[0], p0[1], p1[1], 0, WALK_H, STONE)
        L2 = open1 - open0; nb2 = max(1, round(L2 / WALK_BAY)); bl2 = L2 / nb2
        D = (1, 0, 0) if ax == 'x' else (0, 1, 0)
        for i in range(nb2):
            sa, sb = open0 + i * bl2, open0 + (i + 1) * bl2
            p0 = P(ax, sa - 0.45, ci0, 0); p1 = P(ax, sa + 0.45, ci1, 0)
            CL.box(p0[0], p1[0], p0[1], p1[1], 0, WALK_H, STONE)                  # 墩
            w = bl2 - 0.9; sp = 2.8
            pts, ap = C.pointed(w, sp)
            mid = P(ax, (sa + sb) / 2, c_in, 0)
            M = vframe(mid, D)
            arch = [pts[k] for k in range(len(pts) - 1, 1, -1)]
            arch = sorted(pts[2:], key=lambda q: q[0])
            span = [(-w / 2, sp)] + [q for q in arch if -w / 2 < q[0] < w / 2] + [(w / 2, sp), (w / 2, WALK_H), (-w / 2, WALK_H)]
            C.slab2d(CL, M, span, -0.45, 0.45, STONE)                             # 拱上墙（spandrel）
            C.slab2d(CL, M, rect(-w / 2, w / 2, 0, 0.85), -0.45, 0.45, STONE)      # 矮墙
            C.frame2d(CL, M @ T(0, 0.85), [(u, v - 0.85 if v > 0 else 0) for (u, v) in pts] if False else [(u, v) for (u, v) in C.pointed(w, sp - 0.85)[0]], 0.16, -0.46, 0.46, STONE_D)
            C.slab2d(CL, M, rect(-0.08, 0.08, 0.85, sp + 0.1), -0.2, 0.2, STONE_D)  # 竖棂
            for s in (-1, 1):
                spi, _ = C.pointed(w / 2 - 0.25, sp - 0.95)
                C.frame2d(CL, M @ T(s * w / 4, 0.85), spi, 0.08, -0.15, 0.15, STONE_D)
            C.frame2d(CL, M, circle(w * 0.13, 16, 0, sp + 0.55 * w), 0.08, -0.15, 0.15, STONE_D)
        p0 = P(ax, open1 - 0.45, ci0, 0); p1 = P(ax, open1 + 0.45, ci1, 0)
        CL.box(p0[0], p1[0], p0[1], p1[1], 0, WALK_H, STONE)
        c2 = P(ax, s0, c_in + sg * 0.5, WALK_H); c3 = P(ax, s1, c_in + sg * 0.9, WALK_H)
        CL.box(c2[0], c3[0], c2[1], c3[1], WALK_H - 0.5, WALK_H + 0.25, STONE_D)   # 檐口线

    gx0, gx1, gy0, gy1 = X0 + ww, X1 - ww, Y0 + ww, Y1 - ww
    walk('x', X0, X1, Y1, gy1, gx0, gx1)                  # 北回廊（靠侧廊）
    walk('x', X0, X1, Y0, gy0, gx0, gx1)                  # 南回廊（靠府邸）
    walk('y', gy0, gy1, X0, gx0, gy0, gy1)                # 西回廊
    walk('y', gy0, gy1, X1, gx1, gy0, gy1)                # 东回廊
    # 庭院（garth）：草坪、十字小径、八角井台、一棵修剪的紫杉
    fl.box(gx0 + 0.45, gx1 - 0.45, gy0 + 0.45, gy1 - 0.45, -0.05, 0.03, GRASS)
    gcx, gcy = (gx0 + gx1) / 2, (gy0 + gy1) / 2
    fl.box(gcx - 1.0, gcx + 1.0, gy0 + 0.45, gy1 - 0.45, 0.0, 0.06, FLAG)
    fl.box(gx0 + 0.45, gx1 - 0.45, gcy - 1.0, gcy + 1.0, 0.0, 0.06, FLAG)
    CL.cyl(gcx, gcy, 0, 2.6, 0.3, STONE_D, n=8, smooth=False)
    CL.cyl(gcx, gcy, 0.3, 1.5, 0.75, STONE_D, n=8, smooth=False)
    CL.cyl(gcx, gcy, 1.02, 1.15, 0.05, C.flat('well_water', (0.02, 0.03, 0.035), 0.05), n=8, smooth=False)
    for k in range(2):
        a = k * math.pi
        CL.boxc(gcx + 1.3 * math.cos(a), gcy, 1.05, 0.16, 0.16, 1.9, IRON)
    CL.box(gcx - 1.4, gcx + 1.4, gcy - 0.08, gcy + 0.08, 2.9, 3.05, IRON)
    for (tx_, ty_) in ((gx0 + 7, gy1 - 6), (gx1 - 7, gy0 + 6)):
        CL.cyl(tx_, ty_, 0, 0.25, 1.2, BARK, 8)
        CL.cyl(tx_, ty_, 1.0, 1.6, 4.5, YEW, 16, r2=0.25)
    for (bx_, by_) in ((gcx - 7, gcy + 1.8), (gcx + 7, gcy - 1.8)):          # 石长凳
        CL.box(bx_ - 1.1, bx_ + 1.1, by_ - 0.25, by_ + 0.25, 0.42, 0.5, STONE_D)
        for dx in (-0.8, 0.8):
            CL.boxc(bx_ + dx, by_, 0, 0.3, 0.4, 0.42, STONE_D)
    # 回廊东北角 → 南耳堂的连廊（slype）
    CL.box(X1, -TRANS_HW, -30.5, -25.5, 0, 6.5, STONE)
    R.gable(X1, -TRANS_HW, -31.0, -25.0, 6.5, 2.4, LEAD, 'x')
    portal(CL, C.wall_frame((X1 + 3.0, -30.5, 0.2), (0, -1, 0)), 1.8, 2.8, orders=2, wimperg=False)

    RS = Batch('props_residence')
    rx0, rx1, ry0, ry1 = RESIDENCE
    RS.box(rx0, rx1, ry0, ry1, 0, RES_H, STONE_W)
    RS.box(rx0 - 0.2, rx1 + 0.2, ry0 - 0.2, ry1 + 0.2, RES_H - 0.6, RES_H, STONE_D)
    R.gable(rx0 - 0.4, rx1 + 0.4, ry0 - 0.3, ry1 + 0.3, RES_H, 6.0, SLATE, 'x', over=0.3)
    for (ex, s) in ((rx0, -1), (rx1, 1)):   # 山墙
        C.slab2d(RS, C.wall_frame((ex, (ry0 + ry1) / 2, 0), (s, 0, 0)), [(-(ry1 - ry0) / 2 - 0.3, RES_H), ((ry1 - ry0) / 2 + 0.3, RES_H), (0, RES_H + 6.3)], -0.6, 0.3, STONE_W)
    for cxx in (rx0 + 9, (rx0 + rx1) / 2, rx1 - 9):   # 烟囱
        RS.boxc(cxx, (ry0 + ry1) / 2, RES_H + 2, 1.4, 3.6, 6.0, STONE_W)
        RS.boxc(cxx, (ry0 + ry1) / 2, RES_H + 7.8, 1.7, 3.9, 0.35, STONE_D)
        for k in (-1, 0, 1):
            RS.cyl(cxx, (ry0 + ry1) / 2 + k * 1.1, RES_H + 8.15, 0.22, 0.8, C.flat('pot', (0.45, 0.25, 0.18), 0.8) if 'pot' not in bpy.data.materials else bpy.data.materials['pot'], 8)
    nwin = 9
    for i in range(nwin):
        xx = rx0 + (rx1 - rx0) * (i + 0.5) / nwin
        for (yy, s, rows) in ((ry0, -1, (1.2, 5.2, 9.2)), (ry1, 1, (10.9,))):
            for z in rows:
                h = 2.6 if z < 9 else 1.9
                M = C.wall_frame((xx, yy, z), (0, s, 0))
                C.slab2d(RS, M, rect(-0.8, 0.8, 0, h), 0.0, 0.04, WIN_RES)
                C.frame2d(RS, M, rect(-0.8, 0.8, 0, h), 0.18, 0.0, 0.18, STONE_D)
                C.slab2d(RS, M, rect(-0.06, 0.06, 0, h), 0.0, 0.14, STONE_D)       # 石竖棂
                C.slab2d(RS, M, rect(-0.8, 0.8, h * 0.62, h * 0.62 + 0.1), 0.0, 0.14, STONE_D)
                C.slab2d(RS, M, rect(-1.05, 1.05, h + 0.12, h + 0.3), 0.0, 0.3, STONE_D)   # 滴水罩（hood mould）
                C.slab2d(RS, M, rect(-1.05, -0.9, h - 0.3, h + 0.3), 0.0, 0.3, STONE_D)
                C.slab2d(RS, M, rect(0.9, 1.05, h - 0.3, h + 0.3), 0.0, 0.3, STONE_D)
    portal(RS, C.wall_frame(((rx0 + rx1) / 2, ry0, 0), (0, -1, 0)), 2.0, 3.0, orders=2, wimperg=False)
    site.box(rx0 - 6, rx1 + 6, ry0 - 16, ry0 - 0.02, -0.02, 0.02, FLAG)
    for i, x in enumerate(range(int(rx0), int(rx1) + 1, 12)):
        tree(pz, x, ry0 - 13, 7.0, 3.0, seed=40 + i)

    objs = Batch.build_all()

    # ------------------------------------------------------------ 光
    if DUSK:
        C.sky_sun(sc, 'dusk', sun_az=250.0, sky_s=0.55)
        warm = (1.0, 0.78, 0.52)
        for (x, y, z) in lamps:
            C.point_light('lamp', (x, y, z), 60 if z > 4 else 18, (1.0, 0.72, 0.42), 0.15)
        # 地面投光（被照亮的浅色石材）：西立面、双塔、穹顶、耳堂端墙
        for (p, t, e, ang) in [((-118, -16, 0.5), (-82, -10, 45), 2.4e5, 38), ((-118, 16, 0.5), (-82, 10, 45), 2.4e5, 38),
                               ((-100, 0, 0.5), (-88, 0, 20), 6.0e4, 40),
                               ((-30, -60, 1.0), (0, 0, 62), 2.0e5, 22), ((40, 55, 1.0), (0, 0, 62), 1.6e5, 22),
                               ((0, -62, 0.5), (0, -34, 18), 6.0e4, 40), ((0, 62, 0.5), (0, 34, 18), 6.0e4, 40),
                               ((60, -45, 0.5), (34, 0, 20), 8.0e4, 45)]:
            C.spot_light('flood', p, t, e, warm, ang, 0.4)
        C.point_light('lantern', (0, 0, LANTERN_Z), 3500, (1.0, 0.72, 0.4), 1.5)
        sc.view_settings.exposure = 0.3
    else:
        C.sky_sun(sc, 'day', sun_az=160.0, sun_el=36.0)
        sc.view_settings.exposure = -0.35
    if A['exposure']:
        sc.view_settings.exposure = float(A['exposure'])

    CAMS = {
        'c1': ((-215, -175, 88), (-35, -18, 30), 35),
        'c2': ((-20.5, Y1 - 2.6, 1.65), (-64, Y1 - 2.4, 3.9), 18),
        'c3': ((150, -120, 95), (5, 0, 32), 38),
        'c4': ((gx0 + 3, gy0 + 3, 1.7), (-8, 2, 30), 22),
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
