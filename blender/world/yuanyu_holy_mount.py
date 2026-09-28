"""原域 · 悬浮圣山与诸神殿 v1（设定 docs/world-setting.md §1；清单 §1.3）。
卡：诸神殿坐落于国都原域核心的悬浮圣山之上，供奉各大正统神明神位、签署国家最高决议；
    原域全城哥特尖塔、巴洛克穹顶与黑白石材巨型神像回廊交错，以太薄雾与圣香烟气，煤气灯风格魔导路灯，青石街巷【卡 E44 L5893–L5895、L5912–L5914】。
其余全部仓库推断：倒置山体（椭圆顶台 + 倒锥 + 次级岩锥 + 垂石）、白大理石夹黑玄武岩带、暖金导能脉与山底暖金核；
    三级同心台（外台神像回廊前庭 / 中台九座神位礼拜堂 / 内台诸神殿主殿）；主殿巴洛克鼓座大穹顶 + 包金顶灯亭 + 南门廊 + 两座哥特尖塔；
    朝圣步道 = 悬空石阶从朝圣广场绕山盘旋到前庭南口；城区切片（尖塔 / 穹顶街区、青石巷、暖色路灯、朝圣广场一圈神像）；山腰薄雾 + 城区淡紫灰烟。
画面无文字、徽记、宗教符号；神像无面容、无持物。

运行（仓库根目录，经 tools/blender_run.sh）：
  blender -b --factory-startup --python blender/world/yuanyu_holy_mount.py -- --res 2000 --samples 16 --out docs/drafts/world_v1_yuanyu_holy_mount.jpg
  → <out>（斜俯视主图）、<out 去扩展名>_ground.jpg（城区仰视）、各自 _anchors.json 与 _items.json（交 tools/annotate_board.py）
  --save 1 另存 blender/world/out/<ID>.blend（glb 等用户批准后再导出：--glb 1）
"""
import math, os, random, sys, json
import bpy
from mathutils import Vector, noise as MN

HERE = os.path.dirname(os.path.abspath(__file__)); BL = os.path.dirname(HERE)
for p in (BL, os.path.join(BL, 'landmarks'), os.path.join(BL, 'islands')):
    if p not in sys.path: sys.path.insert(0, p)
import common as C  # noqa
import _kit as K_  # noqa  （复用岩体材质、放样、倒锥、锚点投影）

A = C.args(dict(res='2000', samples='16', out='/tmp/yuanyu.jpg', save='0', glb='0', ground='1', city='1'))
ID, NAME = 'yuanyu_holy_mount', '原域 · 悬浮圣山与诸神殿'
OUT = os.path.join(HERE, 'out')

Z_TIP, Z_TOP = 350.0, 870.0          # 山底尖离地约 350 m；顶台 870 m
RX, RY = 215.0, 175.0                # 顶台椭圆半轴
T_MID, T_IN = 14.0, 32.0              # 中台、内台高出外台
GOLD = (1.0, .66, .25)
BOARD_TITLE = '原域 · 悬浮圣山与诸神殿 —— v1 设定对照'
ITEMS = [
    ('mount', '倒置山体：椭圆顶台 + 约 520 m 倒锥 + 次级岩锥与垂石，悬离城区约 350 m', '仓库推断', '✓'),
    ('rock', '岩色：白大理石 / 浅灰石灰岩夹黑玄武岩水平带，层檐与雨痕（卡：黑白石材）', '卡原文 + 仓库推断', '✓'),
    ('veins', '暖金以太导能脉 + 山底暖金核', '仓库推断', '✓'),
    ('terraces', '三级同心台：外台前庭 / 中台礼拜堂环 / 内台主殿', '仓库推断', '✓'),
    ('pantheon', '诸神殿主殿：巴洛克鼓座 + 大穹顶 + 包金顶灯亭，南面柱廊门廊（卡：坐落于悬浮圣山之上）', '卡原文', '✓'),
    ('spires', '门廊两侧哥特尖塔（卡：哥特式尖塔 + 巴洛克穹顶）', '卡原文', '✓'),
    ('shrines', '神位礼拜堂环：九座小礼拜堂，哥特尖顶，窗透暖光（卡：供奉各大正统神明神位；数量推断）', '卡原文 + 仓库推断', '✓'),
    ('colonnade', '巨型神像回廊：前庭两道弧形合抱柱廊，顶上黑白交替长袍立像（卡原文）', '卡原文', '✓'),
    ('stair', '朝圣步道：悬空石阶绕山盘旋，广场 → 前庭南口，阶侧魔导煤气灯', '仓库推断', '✓'),
    ('mist', '以太薄雾（山腰）与圣香烟气（城区低空淡紫灰）', '卡原文', '✓'),
    ('city', '城区切片：哥特尖塔与巴洛克穹顶交错的密集街区', '卡原文', '✓'),
    ('plaza', '朝圣广场：圣山正下方圆形广场，外圈黑白神像', '仓库推断', '✓'),
    ('lamps', '青石巷道 + 煤气灯风格魔导路灯（暖色点光）', '卡原文', '✓'),
]

ANCH = {}
def anchor(k, x, y, z): ANCH.setdefault(k, []).append((x, y, z))


# ============================================================ 材质
def mats():
    M = {}
    M['rock'] = K_.rock_v17('yy_rock', (.84, .82, .78), (.52, .5, .48), strata=.012, veins=dict(c=GOLD, e=4.0, density=.2),
                            moss=(.3, .33, .2), moss_amt=.35, soil=(.3, .27, .22), soil_z=Z_TOP - 6, lichen=(.93, .92, .88))
    M['rock_dark'] = K_.rock_v17('yy_rock_dark', (.36, .35, .35), (.2, .2, .21), strata=.006, veins=dict(c=GOLD, e=4.0, density=.15),
                                 moss=(.2, .22, .15), moss_amt=.2, soil_z=1e5, lichen=(.5, .5, .5))
    M['basalt_rock'] = K_.rock_v17('yy_basalt_rock', (.12, .12, .13), (.05, .05, .06), strata=.03, veins=dict(c=GOLD, e=6.0, density=.35), moss_amt=.1, soil_z=1e5, lichen=(.3, .3, .3))
    M['marble'] = C.pbr('yy_marble', 'marble_01', 6.0, tint=(1, .98, .95), weather=.5)
    M['basalt'] = C.flat('yy_basalt', (.05, .05, .055), rough=.25, noise=.2, coat=.3)
    M['white'] = C.flat('yy_white', (.86, .85, .82), rough=.45, noise=.12)
    M['ashlar'] = C.ashlar('yy_ashlar', c=(.8, .78, .74), course=1.2, block=2.6, jc=(.45, .43, .4), rustic=.3)
    M['city_stone'] = C.ashlar('yy_city_stone', c=(.55, .52, .48), course=.9, block=2.0, jc=(.35, .33, .3))
    M['paving'] = C.pbr('yy_paving', 'precast_stone_paving', 4.0, tint=(.95, .95, .97), value=1.25, sat=.3)
    M['bluestone'] = C.pbr('yy_bluestone', 'precast_stone_paving', 3.0, tint=(.55, .62, .7), value=.8, sat=.6)
    M['city_stone2'] = C.ashlar('yy_city_stone2', c=(.72, .64, .52), course=.9, block=2.0, jc=(.35, .31, .26))
    M['city_stone3'] = C.ashlar('yy_city_stone3', c=(.42, .41, .4), course=.9, block=2.0, jc=(.2, .2, .2))
    M['roof_dark'] = C.flat('yy_roof_dark', (.12, .12, .14), rough=.6, noise=.3)
    M['slate'] = C.pbr('yy_slate', 'roof_slates_02', 4.0, tint=(.45, .48, .55), value=.8)
    M['lead'] = C.flat('yy_lead', (.3, .33, .3), rough=.8, metal=.1, noise=.35)        # 铅皮带铜绿
    M['gold'] = C.flat('yy_gold', (1.0, .72, .32), rough=.22, metal=1.0)
    M['win'] = C.flat('yy_win', (.1, .07, .04), emit=(1.0, .62, .28), estr=6.0)
    M['lamp'] = C.glow('yy_lamp', (1.0, .7, .35), estr=40.0)
    M['core'] = C.glow('yy_core', GOLD, estr=30.0)
    M['iron'] = C.flat('yy_iron', (.05, .05, .05), rough=.5, metal=.8)
    M['grass'] = K_.ground_v17('yy_grass', [(.2, .27, .1), (.26, .31, .12)], slope_rock=False)
    M['fields'] = K_.ground_v17('yy_fields', [(.3, .3, .16), (.36, .33, .18)], dry=(.45, .4, .26), slope_rock=False)
    M['leaf'] = C.flat('yy_cypress', (.06, .12, .05), rough=.8, noise=.3)
    return M


def volume(name, dens, col, aniso=.3, soft=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    nt.nodes.clear(); out = nt.nodes.new('ShaderNodeOutputMaterial'); v = nt.nodes.new('ShaderNodeVolumePrincipled')
    v.inputs['Color'].default_value = (*col, 1); v.inputs['Density'].default_value = dens; v.inputs['Anisotropy'].default_value = aniso
    tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .004; nz.inputs['Detail'].default_value = 4
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .38; mr.inputs['From Max'].default_value = .62
    mr.inputs['To Min'].default_value = 0.0; mr.inputs['To Max'].default_value = dens; nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
    gr = nt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'; nt.links.new(tc.outputs['Object'], gr.inputs['Vector'])   # 边缘渐隐，不出硬边
    mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; nt.links.new(mr.outputs[0], mu.inputs[0]); nt.links.new(gr.outputs['Fac'], mu.inputs[1])
    nt.links.new(mu.outputs[0] if soft else mr.outputs[0], v.inputs['Density']); nt.links.new(v.outputs[0], out.inputs['Volume'])
    return m


# ============================================================ 基元
def obox(B, cx, cy, z, ang, L, W, H, m):
    """朝向 ang 的长方体（中心 cx, cy，底 z）"""
    ux, uy = math.cos(ang), math.sin(ang); vx, vy = -uy, ux; vs = []
    for zz in (z, z + H):
        for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vs.append((cx + ux * a * L / 2 + vx * b * W / 2, cy + uy * a * L / 2 + vy * b * W / 2, zz))
    B.poly(vs, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], m)


def ogable(B, cx, cy, z, ang, L, W, h, m):
    ux, uy = math.cos(ang), math.sin(ang); vx, vy = -uy, ux
    P = lambda a, b, zz: (cx + ux * a * L / 2 + vx * b * W / 2, cy + uy * a * L / 2 + vy * b * W / 2, zz)
    vs = [P(-1, -1, z), P(1, -1, z), P(1, 1, z), P(-1, 1, z), P(-1, 0, z + h), P(1, 0, z + h)]
    B.poly(vs, [(3, 2, 1, 0), (0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)], m)


def spire(B, x, y, z, w, H, hs, M, pin=True, stone=None):
    """哥特尖塔：方塔身（高 H）+ 四角小尖 + 八角尖顶（高 hs）"""
    stone = stone or M['ashlar']
    B.boxc(x, y, z, w, w, H, stone)
    for zz in (z + H * .35, z + H * .7):                      # 尖拱长窗（暖光）
        for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            B.boxc(x + sx * (w / 2 + .05), y + sy * (w / 2 + .05), zz, (w * .22 if sx == 0 else .2), (w * .22 if sy == 0 else .2), H * .18, M['win'])
    if pin:
        for sx in (-1, 1):
            for sy in (-1, 1): B.cyl(x + sx * w * .44, y + sy * w * .44, z + H, w * .1, hs * .28, stone, 4, r2=0)
    B.cyl(x, y, z + H, w * .47, hs, M['slate'], 8, r2=0, smooth=False)
    B.cyl(x, y, z + H + hs, w * .03, hs * .08, M['gold'], 6, r2=0)


def dome(B, x, y, z, r, M, drum_h=None, lantern=True, ribs=12, k=1.15, shell=None):
    """巴洛克穹顶：鼓座 + 双壳外穹（竖向略拉高 k）+ 肋 + 顶灯亭"""
    drum_h = r * .7 if drum_h is None else drum_h; shell = shell or M['lead']
    B.cyl(x, y, z, r, drum_h, M['white'], 32)
    n = max(8, ribs)
    for i in range(n):                                       # 鼓座壁柱 + 窗
        a = i * math.tau / n
        B.boxc(x + math.cos(a) * r, y + math.sin(a) * r, z, r * .09, r * .09, drum_h, M['ashlar'])
        a2 = a + math.pi / n
        B.boxc(x + math.cos(a2) * (r + .05), y + math.sin(a2) * (r + .05), z + drum_h * .3, r * .1, r * .1, drum_h * .45, M['win'])
    B.cyl(x, y, z + drum_h, r * 1.06, r * .06, M['ashlar'], 32)
    zc = z + drum_h + r * .06
    prof = [(r * math.cos(t), r * k * math.sin(t)) for t in [i * (math.pi / 2) / 14 for i in range(15)]]
    prof[-1] = (0.0, r * k)
    B.lathe(x, y, zc, prof, shell, n=40)
    for i in range(ribs):                                    # 包金 / 白石肋
        a = i * math.tau / ribs; pts = [(x + math.cos(a) * (pr + .3), y + math.sin(a) * (pr + .3), zc + pz + .2) for pr, pz in prof[:-2]]
        B.strip(pts, r * .035, r * .025, M['white'])
    if lantern:
        zl = zc + r * k * .96
        B.cyl(x, y, zl, r * .14, r * .3, M['white'], 12)
        for i in range(8):
            a = i * math.tau / 8; B.boxc(x + math.cos(a) * r * .15, y + math.sin(a) * r * .15, zl + r * .06, r * .03, r * .03, r * .18, M['win'])
        B.lathe(x, y, zl + r * .3, [(r * .16, 0), (r * .12, r * .1), (r * .05, r * .2), (0, r * .32)], M['gold'], n=16)


def statue(B, x, y, z, s, m, face=0.0):
    """无面容长袍立像（高约 9·s m），立在方基座上"""
    B.boxc(x, y, z, 2.4 * s, 2.4 * s, 1.2 * s, m)
    z += 1.2 * s
    B.lathe(x, y, z, [(1.1 * s, 0), (1.0 * s, .8 * s), (.8 * s, 3.2 * s), (.66 * s, 5.0 * s), (.95 * s, 5.7 * s), (.9 * s, 5.95 * s), (.35 * s, 6.3 * s), (0, 6.35 * s)], m, n=12)
    B.sphere(x, y, z + 6.8 * s, .5 * s, m, sz=1.15, seg=12, rings=7)
    B.lathe(x, y, z + 6.3 * s, [(.62 * s, 0), (.55 * s, .6 * s), (.3 * s, 1.25 * s), (0, 1.3 * s)], m, n=12)   # 兜帽


def cypress(B, x, y, z, h, m):
    B.lathe(x, y, z, [(.0, 0), (h * .1, h * .08), (h * .12, h * .35), (h * .08, h * .75), (0, h)], m, n=8)


# ============================================================ 山体
def rim(a):
    """顶台轮廓：椭圆 + 低频起伏 + 两处岩岬"""
    r = RX * RY / math.sqrt((RY * math.cos(a)) ** 2 + (RX * math.sin(a)) ** 2)
    k = 1 + .05 * math.sin(3 * a + .4) + .03 * math.sin(7 * a + 1.3)
    for a0, amp, wd in ((.6, .1, .18), (2.5, .08, .2), (-2.2, -.06, .15), (-math.pi / 2, .1, .35)):
        d = math.atan2(math.sin(a - a0), math.cos(a - a0)); k += amp * math.exp(-(d / wd) ** 2)
    return r * k


def mountain(M):
    B = C.Batch.get('mount_rock'); BD = C.Batch.get('mount_dark'); n = 128
    P = [(math.cos(i * math.tau / n) * rim(i * math.tau / n), math.sin(i * math.tau / n) * rim(i * math.tau / n)) for i in range(n)]
    # 自上而下：崖缘 → 岩壁（先微外凸成肩，再收）→ 倒锥，尖略偏北
    prof = [(1.0, 0), (.97, 14), (.93, 40), (.87, 80), (.86, 130), (.74, 190), (.6, 250), (.46, 310), (.32, 370), (.2, 430), (.1, 480), (.03, 515)]
    rings = []
    for j, (s, d) in enumerate(prof):
        z = Z_TOP - d; pts = []
        for (x, y) in P:
            k = K_.strata_k(x * s, y * s, z, 3, .045, 11.0, .05) if j else 1.0
            aa = math.atan2(y, x)
            if j: k *= 1 + .16 * MN.noise(Vector((x * .006 + 2, y * .006, z * .004))) + .05 * MN.noise(Vector((x * .03, y * .03, z * .02))) \
                + .22 * max(0.0, MN.noise(Vector((math.cos(aa) * 6, math.sin(aa) * 6, z * .0025)))) ** 1.5 - .06
            pts.append((x * s * k, y * s * k + d * .06))
        rings.append((pts, z))
    # 加密环（岩檐更碎）
    dense = []
    for (p0, z0), (p1, z1) in zip(rings, rings[1:]):
        dense.append((p0, z0))
        for q in range(1, 4):
            t = q / 4; z = z0 + (z1 - z0) * t
            dense.append(([(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) for a, b in zip(p0, p1)], z))
    dense.append(rings[-1])
    dense2 = []
    for pts, z in dense:
        dense2.append(([(x * K_.strata_k(x, y, z, 5, .03, 7.0, .03), y * K_.strata_k(x, y, z, 5, .03, 7.0, .03)) for x, y in pts], z))
    split = int(len(dense2) * .55)                             # 下半截换深色湿岩（黑玄武岩为主）
    BANDS = ((55, 72), (140, 165), (235, 250), (330, 350))                   # 黑玄武岩水平带（深度 m）
    for (pa, za), (pb, zb) in zip(dense2[:split], dense2[1:split + 1]):
        dd = Z_TOP - (za + zb) / 2; mm = M['basalt_rock'] if any(a <= dd <= b for a, b in BANDS) else M['rock']
        K_.loft(B, [(pa, za), (pb, zb)], mm, smooth=False)
    K_.loft(BD, dense2[split:], M['rock_dark'], apex=(0, 36, Z_TIP), smooth=False)
    rr = random.Random(21)                                                  # 岩壁露头：打破放样面的「布料感」
    for q in range(420):
        jz = rr.randint(3, len(dense2) - 4); pts, z = dense2[jz]; i = rr.randrange(n); x, y = pts[i]
        r0 = rr.uniform(6, 22) * (1.2 - jz / len(dense2)); dark = jz > split
        C.rock(BD if dark else B, x * .985, y * .985, z - r0 * .3, r0, M['rock_dark'] if dark else M['rock'], seed=q, seg=7, rings=5, sz=rr.uniform(.9, 1.8), rough=.45, facet=.6)
    # 顶面（外台）
    B.poly([(x * .995, y * .995, Z_TOP + .2) for x, y in P], [tuple(range(n))], M['paving'])
    for a in (-1.9, -1.2, -.6):
        anchor('mount', math.cos(a) * rim(a) * 1.08, math.sin(a) * rim(a) * 1.08, Z_TOP - 40); anchor('rock', math.cos(a) * rim(a) * 1.05, math.sin(a) * rim(a) * 1.05, Z_TOP - 70)
    # 次级岩锥与垂石
    rnd = random.Random(7)
    for (cx, cy, z0, r0, L) in ((-120, -40, Z_TOP - 170, 45, 190), (110, 60, Z_TOP - 210, 38, 160), (30, -110, Z_TOP - 150, 30, 140), (-60, 110, Z_TOP - 240, 34, 150)):
        K_.cone(BD, cx, cy, z0, r0, L, M['rock_dark'], seed=int(cx), bend=(cx * .15, cy * .15), rough=.35, ledge=.05)
    for q in range(34):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(80, 360); ring = K_.ring_at(dense2, Z_TOP - d)
        i = int(a / math.tau * n) % n; x, y = ring[i][0] * .9, ring[i][1] * .9
        K_.cone(BD, x, y, Z_TOP - d, rnd.uniform(4, 11), rnd.uniform(20, 70), M['rock_dark'], seed=q, rough=.3)
    for q in range(6):                                                     # 近尖端的细长垂石
        a = q * math.tau / 6 + .3; K_.cone(BD, math.cos(a) * 30, 36 + math.sin(a) * 30, Z_TIP + 70, 5, 80 + 15 * (q % 3), M['rock_dark'], seed=90 + q, rough=.2)
    # 山底暖金核 + 一道金环
    BG = C.Batch.get('glow_core')
    BG.sphere(0, 36, Z_TIP + 4, 6.5, M['core'], seg=20, rings=10, sz=1.4)
    C.point_light('core_light', (0, 36, Z_TIP - 8), 6.0e5, GOLD, radius=6)
    anchor('veins', 0, 36, Z_TIP + 2); anchor('veins', P[100][0] * .8, P[100][1] * .8, Z_TOP - 220)
    return P


def summit(M, P):
    B = C.Batch.get('summit'); BW = C.Batch.get('summit_win'); T = C.Batch.get('trees')
    # 中台 / 内台：椭圆台 + 方整石挡墙 + 铺装
    B.cyl(0, 30, Z_TOP, RY * .66, T_MID, M['ashlar'], 72, rx=RX * .66)
    B.cyl(0, 30, Z_TOP + T_MID, RY * .64, .3, M['paving'], 72, rx=RX * .64)
    B.cyl(0, 40, Z_TOP + T_MID, RY * .4, T_IN - T_MID, M['ashlar'], 64, rx=RX * .36)
    B.cyl(0, 40, Z_TOP + T_IN, RY * .39, .3, M['paving'], 64, rx=RX * .35)
    for k in range(10):
        B.boxc(0, 30 - RY * .66 + 11 - k * 1.2, Z_TOP + k * .8, 24, 2.4, .8, M['marble'])
        B.boxc(0, 40 - RY * .4 + 11 - k * 1.2, Z_TOP + T_MID + k * 1.2, 20, 2.4, 1.2, M['marble'])
    anchor('terraces', -RX * .5, -20, Z_TOP + T_MID + 1); anchor('terraces', RX * .3, 40, Z_TOP + T_IN + 1)
    # ---- 诸神殿主殿（内台中心偏北）
    zc = Z_TOP + T_IN; cx, cy = 0, 52
    B.boxc(cx, cy, zc, 108, 108, 12, M['marble'])                          # 基座
    for sx in (-1, 1):
        for sy in (-1, 1): B.boxc(cx + sx * 42, cy + sy * 42, zc + 12, 30, 30, 26, M['white']); B.pyramid(cx + sx * 42, cy + sy * 42, zc + 38, 30, 30, 6, M['lead'])
    B.boxc(cx, cy, zc + 12, 80, 80, 30, M['white'])
    for sx in (-1, 1):
        for k in range(5): BW.boxc(cx + sx * 40.1, cy - 28 + k * 14, zc + 20, .3, 4, 12, M['win'])
    dome(B, cx, cy, zc + 42, 40, M, drum_h=26, ribs=16, k=1.18)
    anchor('pantheon', cx, cy, zc + 42 + 26 + 40)
    # 南门廊：8 柱 + 山花
    py = cy - 54
    B.boxc(cx, py + 6, zc + 12, 64, 20, 2, M['marble'])
    for i in range(8): B.cyl(cx - 28 + i * 8, py - 2, zc + 14, 1.9, 24, M['white'], 16)
    B.boxc(cx, py + 6, zc + 38, 66, 22, 4, M['white'])
    ogable(B, cx, py + 6, zc + 42, math.pi / 2, 22, 66, 9, M['white'])
    anchor('pantheon', cx, py - 3, zc + 30)
    for sx in (-1, 1):                                                     # 两座哥特尖塔
        spire(B, cx + sx * 46, py + 4, zc + 12, 15, 58, 52, M)
    anchor('spires', cx - 46, py + 4, zc + 12 + 58 + 30); anchor('spires', cx + 46, py + 4, zc + 12 + 58 + 30)
    # ---- 九座神位礼拜堂（中台，避开南轴）
    for i in range(9):
        a = math.radians(-90 + 36 + i * (360 - 72) / 8)
        x, y = math.cos(a) * RX * .52, 30 + math.sin(a) * RY * .52; z = Z_TOP + T_MID
        obox(B, x, y, z, a, 26, 15, 13, M['white']); ogable(B, x, y, z + 13, a, 27, 16, 7, M['slate'])
        for s in (-1, 1): obox(BW, x - math.sin(a) * 7.6 * s, y + math.cos(a) * 7.6 * s, z + 3, a, 16, .3, 7, M['win'])
        tx, ty = x + math.cos(a) * 15, y + math.sin(a) * 15
        spire(B, tx, ty, z, 8, 22, 24, M)
        if i in (1, 4, 7): anchor('shrines', tx, ty, z + 40)
    # ---- 巨型神像回廊：外台前庭，两道弧形合抱柱廊（椭圆 70 × 44，南口开）
    fx, fy = 0, -128; ea, eb = 66, 38
    for side in (-1, 1):
        a0, a1 = (math.radians(-80), math.radians(80)) if side > 0 else (math.radians(100), math.radians(260))
        arc = [(fx + math.cos(a0 + (a1 - a0) * t / 40) * ea, fy + math.sin(a0 + (a1 - a0) * t / 40) * eb) for t in range(41)]
        for (xa, ya) in arc[::2]:
            for rr in (0.0, 5.0):
                nx, ny = (xa - fx) / ea, (ya - fy) / eb; L = math.hypot(nx, ny) or 1
                B.cyl(xa + nx / L * rr, ya + ny / L * rr, Z_TOP, 1.2, 14, M['white'], 12)
        pts = []
        for (xa, ya) in arc:
            nx, ny = (xa - fx) / ea, (ya - fy) / eb; L = math.hypot(nx, ny) or 1; pts.append((xa + nx / L * 2.5, ya + ny / L * 2.5, Z_TOP + 15))
        B.strip(pts, 8.5, 2.4, M['marble'])
        for q, (xa, ya) in enumerate(arc[1::3]):
            nx, ny = (xa - fx) / ea, (ya - fy) / eb; L = math.hypot(nx, ny) or 1
            statue(B, xa + nx / L * 2.5, ya + ny / L * 2.5, Z_TOP + 16.2, 1.8, M['basalt'] if q % 2 else M['white'])
        anchor('colonnade', arc[20][0], arc[20][1], Z_TOP + 22)
    B.cyl(fx, fy, Z_TOP + .2, eb * .98, .25, M['paving'], 64, rx=ea * .98)
    # 柏树：外台崖缘成排、中台挡墙下
    rnd = random.Random(3)
    for i in range(0, 128, 2):
        a = i * math.tau / 128
        if abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < .5: continue
        if i % 8: continue
        r = rim(a) * rnd.uniform(.86, .93); cypress(T, math.cos(a) * r, math.sin(a) * r, Z_TOP, rnd.uniform(11, 17), M['leaf'])
    # 外台园路（放射 + 环）
    for i in range(8):
        a = i * math.tau / 8 + .2
        if abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < .6: continue
        B.strip([(math.cos(a) * RX * .66, 30 + math.sin(a) * RY * .66, Z_TOP + .35), (math.cos(a) * rim(a) * .84, math.sin(a) * rim(a) * .84, Z_TOP + .35)], 5, .3, M['paving'])
    anchor('mount', 0, 0, Z_TOP + 2)


def stair(M):
    """朝圣步道：悬空石阶，从朝圣广场边绕山盘旋 1.25 圈，止于前庭南口"""
    B = C.Batch.get('stair'); BL_ = C.Batch.get('lamps_stair')
    N = 360; z0, z1 = 3.0, Z_TOP - .5; a_end = -math.pi / 2; turns = 1.25
    for i in range(N):
        t = i / (N - 1); a = a_end - turns * math.tau * (1 - t)
        u = min(1.0, max(0.0, (t - .12) / .3)); r = 128 + (250 - 128) * u * u * (3 - 2 * u)
        x, y = math.cos(a) * r, math.sin(a) * r * .97; z = z0 + (z1 - z0) * t ** 1.05
        obox(B, x, y, z - 1.4, a + math.pi / 2, 5.2, 9, 1.4, M['marble'])
        if i % 3 == 0: K_.cone(B, x, y, z - 1.4, 3.2, 5 + 3 * (i % 7) / 7, M['rock'], seed=i, rough=.25, n=8, nr=4)
        if i % 9 == 0:
            ox, oy = math.cos(a) * 5.2, math.sin(a) * 5.2
            BL_.cyl(x + ox, y + oy, z, .3, 5.5, M['iron'], 6); BL_.sphere(x + ox, y + oy, z + 6.2, 1.1, M['lamp'], seg=10, rings=6)
        if i in (40, 180, 300): anchor('stair', x, y, z + 2)
    a0 = a_end - turns * math.tau; B.cyl(math.cos(a0) * 128, math.sin(a0) * 128 * .97, 0, 9, 3.0, M['marble'], 24)     # 广场边的起步平台
    anchor('lamps', 0, -150, 4)


def city(M):
    """城区切片：朝圣广场 + 放射 / 环路 + 尖塔与穹顶街区；青石巷、暖色路灯"""
    G = C.Batch.get('city_ground'); B = C.Batch.get('city_bld'); BW = C.Batch.get('city_win'); BL_ = C.Batch.get('lamps_city')
    E = 3400
    G.cyl(0, 0, -2, E, 2, M['bluestone'], 96); G.box(-13000, 13000, -13000, 13000, -3, -1, M['fields'])
    G.cyl(0, 0, 0, 120, .3, M['paving'], 96)
    for i in range(24):                                                    # 广场外圈神像
        a = i * math.tau / 24; statue(G, math.cos(a) * 112, math.sin(a) * 112, .3, 1.6, M['basalt'] if i % 2 else M['white'])
    anchor('plaza', 0, -112, 12); anchor('plaza', 0, 0, 1)
    rnd = random.Random(11)
    avenues = [i * math.tau / 8 + math.pi / 8 for i in range(8)]
    def on_street(x, y):
        r = math.hypot(x, y); a = math.atan2(y, x)
        if r < 150: return True
        for av in avenues:
            d = math.atan2(math.sin(a - av), math.cos(a - av))
            if abs(d) * r < 14: return True
        for rr in (330, 620, 980, 1400):
            if abs(r - rr) < 10: return True
        return False
    k = 0; spires = []
    STONES = [M['city_stone'], M['city_stone'], M['city_stone2'], M['city_stone3']]; ROOFS = [M['slate'], M['slate'], M['roof_dark'], M['lead']]
    for gx in range(-3000, 3001, 34):
        for gy in range(-3000, 3001, 34):
            x, y = gx + rnd.uniform(-6, 6), gy + rnd.uniform(-6, 6); r = math.hypot(x, y)
            if r > 3000 or on_street(x, y) or rnd.random() < (r - 1800) / 1400: continue
            if rnd.random() < .12: continue
            ang = math.atan2(y, x) + rnd.choice((0, math.pi / 2)); w, d = rnd.uniform(18, 28), rnd.uniform(18, 30); h = rnd.uniform(12, 26) * (1.3 - .5 * min(1, r / 2000))
            obox(B, x, y, 0, ang, w, d, h, rnd.choice(STONES))
            ogable(B, x, y, h, ang, w + 1, d + 1, rnd.uniform(5, 9), rnd.choice(ROOFS))
            if rnd.random() < .5: obox(BW, x, y, h * .45, ang, w + .2, d * .5, 1.4, M['win'])
            k += 1
            q = rnd.random()
            if q < .045 and r > 180: H1 = rnd.uniform(35, 70); spire(B, x, y, h, 11, H1, rnd.uniform(40, 70), M, stone=M['city_stone']); spires.append((x, y, h + H1 + 6))
            elif q < .075 and r > 180: dome(B, x, y, h, rnd.uniform(10, 16), M, ribs=10)
    print('CITY BLDG', k)
    for s in [s for s in spires if math.hypot(s[0], s[1]) < 700][:4]: anchor('city', *s)
    # 路灯：放射大道两侧
    for av in avenues:
        for rr in range(160, 2600, 40):
            for s in (-1, 1):
                x = math.cos(av) * rr - math.sin(av) * 10 * s; y = math.sin(av) * rr + math.cos(av) * 10 * s
                BL_.cyl(x, y, 0, .15, 5, M['iron'], 6); BL_.sphere(x, y, 5.3, .5, M['lamp'], seg=8, rings=5)
    for av in avenues:
        for rr in (300, 500, 700): anchor('lamps', math.cos(av) * rr - math.sin(av) * 10, math.sin(av) * rr + math.cos(av) * 10, 5.8)


def mist(M):
    col = bpy.context.scene.collection
    mm = volume('yy_mist', .012, (1.0, .98, .93), aniso=.6, soft=True); rnd = random.Random(4)
    for q in range(9):                                                     # 山腰薄雾：几团不规则雾包，偏东南
        a = rnd.uniform(-2.6, .6); r = rnd.uniform(200, 290)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(math.cos(a) * r, math.sin(a) * r, Z_TOP - rnd.uniform(120, 260))); o = bpy.context.active_object
        o.name = f'mist_waist{q}'; o.scale = (rnd.uniform(90, 150), rnd.uniform(70, 120), rnd.uniform(35, 60)); o.data.materials.append(mm)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 90)); o = bpy.context.active_object; o.name = 'mist_city'
    o.scale = (26000, 26000, 180); o.data.materials.append(volume('yy_haze', .0014, (.84, .78, .9), aniso=.5))
    anchor('mist', -260, 20, Z_TOP - 180); anchor('mist', 600, -300, 30)


# ============================================================ 出图
def cam(sc, pos, tgt, lens):
    c = C.camera(sc, pos, tgt, lens); c.data.clip_end = 30000; return c


def main():
    sc = C.setup(A['samples']); M = mats()
    P = mountain(M); summit(M, P); stair(M)
    if A['city'] == '1': city(M)
    objs = C.Batch.build_all()
    for o in objs:
        if o.name.startswith(('lamps', 'glow', 'summit_win', 'city_win')): o.visible_shadow = False
    mist(M)
    C.sky_sun(sc, 'day', sun_az=235.0, sun_el=16.0, sun_e=3.6, sky_s=.2); sc.view_settings.exposure = -.1
    sc.cycles.volume_step_rate = 4.0; sc.cycles.volume_max_steps = 256
    if A['save'] == '1':
        os.makedirs(OUT, exist_ok=True); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, ID + '.blend'))
    if A['glb'] == '1':
        os.makedirs(OUT, exist_ok=True); bpy.ops.object.select_all(action='DESELECT')
        for o in bpy.context.scene.objects:
            if o.type == 'MESH' and not o.name.startswith('mist'): o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, ID + '.glb'), export_format='GLB', use_selection=True)
    base, ext = os.path.splitext(A['out'])
    json.dump(dict(title=BOARD_TITLE, items=[dict(key=k, text=t, source=s, status=st) for k, t, s, st in ITEMS]), open(base + '_items.json', 'w'), ensure_ascii=False, indent=1)
    res = int(A['res'])
    # 主图：南偏东斜俯视，俯角约 22°
    az, pitch = math.radians(-72), math.radians(13); tgt = Vector((0, 0, 560)); d = 2500
    pos = tgt + Vector((math.cos(az) * math.cos(pitch), math.sin(az) * math.cos(pitch), math.sin(pitch))) * d
    cam(sc, tuple(pos), tuple(tgt), 46); sc.render.resolution_x = res; sc.render.resolution_y = int(res / 1.6)
    K_.project_anchors(sc, ANCH, base + '_anchors.json'); C.render(sc, A['out'], res, 1.6)
    # 顶台近景：看清主殿、礼拜堂环、神像回廊
    az, pitch = math.radians(-78), math.radians(34); tgt = Vector((0, -20, Z_TOP + 20)); d = 620
    pos = tgt + Vector((math.cos(az) * math.cos(pitch), math.sin(az) * math.cos(pitch), math.sin(pitch))) * d
    cam(sc, tuple(pos), tuple(tgt), 45)
    K_.project_anchors(sc, ANCH, base + '_summit_anchors.json'); C.render(sc, base + '_summit' + ext, res, 1.6)
    if A['ground'] == '1':                                                  # 城区仰视：大道上看山底、步道、神像
        av = 13 * math.pi / 8; cam(sc, (math.cos(av) * 640 + 3, math.sin(av) * 640, 1.7), (0, 0, 330), 20)
        K_.project_anchors(sc, ANCH, base + '_ground_anchors.json'); C.render(sc, base + '_ground' + ext, res, 1.6)


if __name__ == '__main__':
    import traceback
    try: main()
    except Exception: traceback.print_exc(); raise
