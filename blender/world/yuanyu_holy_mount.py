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
  --save 1 另存 blender/world/out/<ID>.blend；--glb 1 导出 glb（原域 v2 用户 2026-09-28 已确认；2026-09-29 起全线全自动不再等批）
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
BOARD_TITLE = '原域 · 悬浮圣山与诸神殿 —— v2 定稿对照'
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
    ('roads', '放射大道青石方砖 + 路缘、环路；建筑退让车行道（v2）', '仓库推断', '✓'),
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
    M['grass'] = K_.ground_v17('yy_grass', [(.17, .2, .11), (.22, .24, .14)], slope_rock=False)
    M['fields'] = K_.ground_v17('yy_fields', [(.3, .3, .16), (.36, .33, .18)], dry=(.45, .4, .26), slope_rock=False)
    M['leaf'] = C.flat('yy_cypress', (.06, .12, .05), rough=.8, noise=.3)
    M['cobble'] = C.pbr('yy_cobble', 'precast_stone_paving', 1.4, tint=(.78, .8, .84), value=.95, sat=.4)
    M['curb'] = C.flat('yy_curb', (.62, .6, .57), rough=.7, noise=.25)
    M['glass'] = C.flat('yy_glass', (.02, .025, .03), rough=.15, coat=.4)
    for k, c in (('fa1', (.66, .63, .58)), ('fa2', (.74, .66, .54)), ('fa3', (.47, .46, .45))):
        M[k] = facade('yy_' + k, c, seed=len(k) + c[0])
    return M


def facade(name, stone, seed=0.0, cell=(3.4, 3.8)):
    """城区立面：石墙 + 世界坐标窗格（暗玻璃，约三成亮暖灯），首层以下不开窗。"""
    m, nt, b = C.new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs[0])
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sn = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Normal'], sn.inputs[0])
    m1 = nt.nodes.new('ShaderNodeMath'); m1.operation = 'MULTIPLY'; nt.links.new(sep.outputs[1], m1.inputs[0]); nt.links.new(sn.outputs[0], m1.inputs[1])
    m2 = nt.nodes.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'; nt.links.new(sep.outputs[0], m2.inputs[0]); nt.links.new(sn.outputs[1], m2.inputs[1])
    u = nt.nodes.new('ShaderNodeMath'); u.operation = 'SUBTRACT'; nt.links.new(m1.outputs[0], u.inputs[0]); nt.links.new(m2.outputs[0], u.inputs[1])   # 沿墙坐标 = y·nx − x·ny
    cm = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(u.outputs[0], cm.inputs[0]); nt.links.new(sep.outputs[2], cm.inputs[1])
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / cell[0], 1 / cell[1], 1); mp.inputs['Location'].default_value = (seed, 0, 0)
    nt.links.new(cm.outputs[0], mp.inputs[0])
    br = nt.nodes.new('ShaderNodeTexBrick'); br.offset = 0.0
    br.inputs['Scale'].default_value = 1.0; br.inputs['Mortar Size'].default_value = .36; br.inputs['Brick Width'].default_value = 1.0; br.inputs['Row Height'].default_value = 1.0
    br.inputs['Mortar Smooth'].default_value = 0.0
    nt.links.new(mp.outputs[0], br.inputs['Vector'])
    hole = nt.nodes.new('ShaderNodeMath'); hole.operation = 'SUBTRACT'; hole.inputs[0].default_value = 1.0; nt.links.new(br.outputs['Fac'], hole.inputs[1])
    gz = nt.nodes.new('ShaderNodeMath'); gz.operation = 'GREATER_THAN'; gz.inputs[1].default_value = 3.2; nt.links.new(sep.outputs[2], gz.inputs[0])
    hz = nt.nodes.new('ShaderNodeMath'); hz.operation = 'MULTIPLY'; nt.links.new(hole.outputs[0], hz.inputs[0]); nt.links.new(gz.outputs[0], hz.inputs[1])
    fl = nt.nodes.new('ShaderNodeVectorMath'); fl.operation = 'FLOOR'; nt.links.new(mp.outputs[0], fl.inputs[0])
    wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; nt.links.new(fl.outputs[0], wn.inputs['Vector'])
    on = nt.nodes.new('ShaderNodeMath'); on.operation = 'GREATER_THAN'; on.inputs[1].default_value = .7; nt.links.new(wn.outputs['Value'], on.inputs[0])
    lit = nt.nodes.new('ShaderNodeMath'); lit.operation = 'MULTIPLY'; nt.links.new(hz.outputs[0], lit.inputs[0]); nt.links.new(on.outputs[0], lit.inputs[1])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; nt.links.new(hz.outputs[0], mx.inputs['Factor'])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .35; nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeMix'); ramp.data_type = 'RGBA'; nt.links.new(nz.outputs['Fac'], ramp.inputs['Factor'])
    ramp.inputs['A'].default_value = (*[c * .82 for c in stone], 1); ramp.inputs['B'].default_value = (*stone, 1)
    nt.links.new(ramp.outputs['Result'], mx.inputs['A']); mx.inputs['B'].default_value = (.025, .028, .032, 1)
    nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])
    rg = nt.nodes.new('ShaderNodeMapRange'); rg.inputs['To Min'].default_value = .8; rg.inputs['To Max'].default_value = .15; nt.links.new(hz.outputs[0], rg.inputs['Value'])
    nt.links.new(rg.outputs[0], b.inputs['Roughness'])
    b.inputs['Emission Color'].default_value = (1.0, .66, .32, 1)
    es = nt.nodes.new('ShaderNodeMath'); es.operation = 'MULTIPLY'; es.inputs[1].default_value = 2.5; nt.links.new(lit.outputs[0], es.inputs[0])
    nt.links.new(es.outputs[0], b.inputs['Emission Strength'])
    return m


def volume(name, dens, col, aniso=.3, soft=False, glow=0.0):
    """纯散射体积（无吸收，背光面不会发黑成「黑烟」）+ 可选极淡暖金自发光（以太薄雾）。"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    nt.nodes.clear(); out = nt.nodes.new('ShaderNodeOutputMaterial'); v = nt.nodes.new('ShaderNodeVolumeScatter')
    v.inputs['Color'].default_value = (*col, 1); v.inputs['Anisotropy'].default_value = aniso
    tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .004; nz.inputs['Detail'].default_value = 4
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .38; mr.inputs['From Max'].default_value = .62
    mr.inputs['To Min'].default_value = 0.0; mr.inputs['To Max'].default_value = dens; nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
    gr = nt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'; nt.links.new(tc.outputs['Object'], gr.inputs['Vector'])   # 边缘渐隐，不出硬边
    mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; nt.links.new(mr.outputs[0], mu.inputs[0]); nt.links.new(gr.outputs['Fac'], mu.inputs[1])
    dsrc = mu.outputs[0] if soft else mr.outputs[0]; nt.links.new(dsrc, v.inputs['Density'])
    if glow > 0:
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*GOLD, 1)
        gm = nt.nodes.new('ShaderNodeMath'); gm.operation = 'MULTIPLY'; gm.inputs[1].default_value = glow; nt.links.new(dsrc, gm.inputs[0]); nt.links.new(gm.outputs[0], em.inputs['Strength'])
        ad = nt.nodes.new('ShaderNodeAddShader'); nt.links.new(v.outputs[0], ad.inputs[0]); nt.links.new(em.outputs[0], ad.inputs[1]); nt.links.new(ad.outputs[0], out.inputs['Volume'])
    else:
        nt.links.new(v.outputs[0], out.inputs['Volume'])
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
    peri = r >= 25                                           # 大穹顶：鼓座外一圈列柱廊（圣保罗式）；小穹顶：壁柱
    for i in range(n):
        a = i * math.tau / n; a2 = a + math.pi / n
        if peri:
            for da in (-.06, .06):
                B.cyl(x + math.cos(a + da) * r * 1.13, y + math.sin(a + da) * r * 1.13, z + drum_h * .06, r * .028, drum_h * .78, M['white'], 10)
            B.boxc(x + math.cos(a) * r * 1.1, y + math.sin(a) * r * 1.1, z, r * .16, r * .16, drum_h * .06, M['ashlar'])
        else:
            B.boxc(x + math.cos(a) * r, y + math.sin(a) * r, z, r * .09, r * .09, drum_h, M['ashlar'])
        wx, wy = x + math.cos(a2) * (r + .05), y + math.sin(a2) * (r + .05)   # 圆拱长窗
        B.boxc(wx, wy, z + drum_h * .28, r * .09, r * .09, drum_h * .38, M['win'])
        B.sphere(wx, wy, z + drum_h * .66, r * .045, M['win'], seg=8, rings=4, zmin=0)
    if peri:
        B.cyl(x, y, z + drum_h * .84, r * 1.18, drum_h * .1, M['ashlar'], 48)          # 列柱檐部
        B.cyl(x, y, z + drum_h * .94, r * 1.16, drum_h * .06, M['marble'], 48)         # 女儿墙
        for i in range(n * 2):
            a = i * math.tau / (n * 2); B.boxc(x + math.cos(a) * r * 1.16, y + math.sin(a) * r * 1.16, z + drum_h, r * .025, r * .025, r * .05, M['white'])
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


def chapel(B, BW, x, y, z, a, M, L=28.0, W=13.0, H=17.0):
    """哥特小礼拜堂：长轴沿 a（+a 端为入口，接尖塔）；扶壁 + 尖券长窗 + 陡屋面 + 玫瑰窗 + 屋脊小尖塔 + 半圆后殿。"""
    ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux
    Pt = lambda l, w: (x + ux * l + vx * w, y + uy * l + vy * w)
    obox(B, x, y, z, a, L, W, 1.2, M['ashlar'])                           # 台基
    obox(B, x, y, z + 1.2, a, L - 1, W - 1, H - 1.2, M['white'])
    ogable(B, x, y, z + H, a, L, W + 1.2, W * .85, M['slate'])             # 陡屋面（约 60°）
    ax, ay = Pt(-L / 2, 0); B.cyl(ax, ay, z + 1.2, W / 2 - .5, H - 1.2, M['white'], 16)       # 后殿
    B.lathe(ax, ay, z + H, [(W / 2 + .1, 0), (W * .3, W * .35), (0, W * .55)], M['slate'], n=16)
    for k in range(5):                                                   # 两侧扶壁 + 尖券窗
        l = -L / 2 + 3 + k * (L - 6) / 4
        for s in (-1, 1):
            bx, by = Pt(l, s * (W / 2 + .9)); obox(B, bx, by, z + 1.2, a, 1.4, 1.8, H * .78, M['ashlar'])
            bx2, by2 = Pt(l, s * (W / 2 + 1.5)); obox(B, bx2, by2, z + 1.2, a, 1.2, 1.2, H * .45, M['ashlar'])
            B.cyl(bx, by, z + 1.2 + H * .78, .8, 3.2, M['ashlar'], 4, r2=0)      # 扶壁顶小尖
            if k < 4:
                wl = l + (L - 6) / 8; wx, wy = Pt(wl, s * (W / 2 - .45))
                obox(BW, wx, wy, z + 4, a, 2.0, .5, H * .5, M['win'])
                B.cyl(wx, wy, z + 4 + H * .5, 1.0, 2.0, M['win'], 4, r2=0)
    rx, ry = Pt(L / 2 + .05, 0)
    o_n = 20; ring = [(rx + vx * math.cos(t * math.tau / o_n) * 2.6, ry + vy * math.cos(t * math.tau / o_n) * 2.6, z + H - 1.5 + math.sin(t * math.tau / o_n) * 2.6) for t in range(o_n)]
    BW.poly(ring + [(rx, ry, z + H - 1.5)], [(i, (i + 1) % o_n, o_n) for i in range(o_n)], M['win'])
    dx, dy = Pt(L / 2 + .05, 0); obox(BW, dx, dy, z + 1.2, a, .3, 3.0, 5.5, M['glass'])
    mx, my = Pt(-2, 0); B.cyl(mx, my, z + H + W * .6, .9, W * .9, M['slate'], 6, r2=0)     # 屋脊小尖塔（flèche）
    B.cyl(mx, my, z + H + W * .5, .12, W * 1.2, M['gold'], 4, r2=0)


def statue(B, x, y, z, s, m, face=0.0):
    """无面容长袍立像（高约 9·s m），立在方基座上"""
    B.boxc(x, y, z, 2.4 * s, 2.4 * s, 1.2 * s, m)
    z += 1.2 * s
    # 垂褶长袍：下摆外撒、腰收、肩宽（横向拉扁成人形而不是棋子），兜帽低垂，无面容
    B.lathe(x, y, z, [(1.05 * s, 0), (.95 * s, .5 * s), (.78 * s, 2.4 * s), (.62 * s, 3.9 * s), (.7 * s, 4.9 * s), (.8 * s, 5.6 * s), (.42 * s, 6.0 * s), (0, 6.05 * s)], m, n=14, smooth=True)
    for sx in (-1, 1):                                                     # 肩与垂臂（袖）
        B.cyl(x + sx * .62 * s, y, z + 3.3 * s, .26 * s, 2.5 * s, m, 8, r2=.3 * s)
    B.lathe(x, y, z + 5.9 * s, [(.5 * s, 0), (.52 * s, .5 * s), (.36 * s, 1.05 * s), (.1 * s, 1.3 * s), (0, 1.32 * s)], m, n=12)   # 兜帽（整体，无头部球）


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
    prof = [(1.0, 0), (.94, 8), (.85, 25), (.75, 52), (.66, 90), (.58, 135), (.5, 185), (.41, 240), (.32, 300), (.23, 360), (.15, 420), (.08, 472), (.03, 515)]
    rings = []
    for j, (s, d) in enumerate(prof):
        z = Z_TOP - d; pts = []
        for (x, y) in P:
            k = K_.strata_k(x * s, y * s, z, 3, .045, 11.0, .05) if j else 1.0
            aa = math.atan2(y, x)
            if j: k *= 1 + .16 * MN.noise(Vector((x * .006 + 2, y * .006, z * .004))) + .05 * MN.noise(Vector((x * .03, y * .03, z * .02))) \
                + .22 * max(0.0, MN.noise(Vector((math.cos(aa) * 6, math.sin(aa) * 6, z * .0025)))) ** 1.5 - .06 \
                + .09 * math.sin(5 * aa + z * .006 + 1.1) * min(1.0, j / 3)
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
    BANDS = ((150, 166), (262, 274))                   # 黑玄武岩水平带（深度 m）
    for (pa, za), (pb, zb) in zip(dense2[:split], dense2[1:split + 1]):
        dd = Z_TOP - (za + zb) / 2
        K_.loft(B, [(pa, za), (pb, zb)], M['rock'], smooth=False)
        if any(a <= dd <= b for a, b in BANDS):                            # 黑玄武岩带：按方位断续、上下起伏，不成一圈直线
            seg = [(ia, (ia + 1) % n) for ia in range(n) if MN.noise(Vector((math.cos(ia * math.tau / n) * 3, math.sin(ia * math.tau / n) * 3, dd * .01))) > -.15]
            for ia, ib in seg:
                q = [pa[ia], pa[ib], pb[ib], pb[ia]]; zz = [za, za, zb, zb]
                B.poly([(x * 1.004, y * 1.004, z_) for (x, y), z_ in zip(q, zz)], [(0, 1, 2, 3), (3, 2, 1, 0)], M['basalt_rock'])
    K_.loft(BD, dense2[split:], M['rock_dark'], apex=(0, 36, Z_TIP), smooth=False)
    rr = random.Random(21)                                                  # 岩壁露头：打破放样面的「布料感」
    for q in range(420):
        jz = rr.randint(10, len(dense2) - 4); pts, z = dense2[jz]; i = rr.randrange(n); x, y = pts[i]
        r0 = rr.uniform(6, 22) * (1.2 - jz / len(dense2)); dark = jz > split
        C.rock(BD if dark else B, x * .985, y * .985, z - r0 * .3, r0, M['rock_dark'] if dark else M['rock'], seed=q, seg=7, rings=5, sz=rr.uniform(.9, 1.8), rough=.45, facet=.25)
    # 顶面（外台）
    B.poly([(x * .995, y * .995, Z_TOP + .2) for x, y in P], [tuple(range(n))], M['grass'])
    B.strip([(x * .985, y * .985, Z_TOP + .6) for x, y in P + P[:1]], 3.0, 1.4, M['marble'])      # 崖缘矮护墙
    for a in (-1.9, -1.2, -.6):
        anchor('mount', math.cos(a) * rim(a) * 1.08, math.sin(a) * rim(a) * 1.08, Z_TOP - 40); anchor('rock', math.cos(a) * rim(a) * 1.05, math.sin(a) * rim(a) * 1.05, Z_TOP - 70)
    # 次级岩锥与垂石
    rnd = random.Random(7)
    for (cx, cy, z0, r0, L) in ((-78, -22, Z_TOP - 200, 34, 175), (70, 44, Z_TOP - 235, 30, 150), (18, -72, Z_TOP - 190, 24, 130), (-40, 74, Z_TOP - 260, 26, 140)):   # 贴着主锥（离轴太远会把轮廓撑成方盒）
        K_.cone(BD, cx, cy, z0, r0, L, M['rock_dark'], seed=int(cx), bend=(cx * .15, cy * .15), rough=.35, ledge=.05)
    for q in range(34):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(80, 360); ring = K_.ring_at(dense2, Z_TOP - d)
        i = int(a / math.tau * n) % n; x, y = ring[i][0] * .9, ring[i][1] * .9
        K_.cone(BD, x, y, Z_TOP - d, rnd.uniform(4, 11), rnd.uniform(20, 70), M['rock_dark'], seed=q, rough=.3)
    for q in range(6):                                                     # 近尖端的细长垂石
        a = q * math.tau / 6 + .3; K_.cone(BD, math.cos(a) * 30, 36 + math.sin(a) * 30, Z_TIP + 70, 5, 80 + 15 * (q % 3), M['rock_dark'], seed=90 + q, rough=.2)
    # 山底暖金核 + 一道金环
    BG = C.Batch.get('glow_core')
    BG.sphere(0, 36, Z_TIP + 6, 3.0, M['core'], seg=16, rings=8, sz=1.3)
    C.point_light('core_light', (0, 36, Z_TIP - 8), 3.0e5, GOLD, radius=10)
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
        for sy in (-1, 1):
            if sy > 0:      # 北面两角：哥特角塔（原来是无窗白方块 + 近乎平的铅皮顶，从山后看像一块白方盒）
                spire(B, cx + sx * 42, cy + sy * 42, zc + 12, 14, 34, 30, M)
            else:           # 南面两角被门廊与前排尖塔遮住，保持原样
                B.boxc(cx + sx * 42, cy + sy * 42, zc + 12, 30, 30, 26, M['white']); B.pyramid(cx + sx * 42, cy + sy * 42, zc + 38, 30, 30, 6, M['lead'])
    B.boxc(cx, cy, zc + 12, 80, 80, 30, M['white'])
    B.boxc(cx, cy, zc + 12, 82, 82, 2.2, M['ashlar'])                        # 勒脚
    B.boxc(cx, cy, zc + 38.5, 84, 84, 2.2, M['ashlar'])                      # 檐口
    B.boxc(cx, cy, zc + 40.7, 81, 81, 1.3, M['marble'])                      # 女儿墙
    for side in range(4):                                                  # 四面：壁柱 + 两层圆拱窗
        ang = side * math.pi / 2; ux, uy = math.cos(ang), math.sin(ang); vx, vy = -uy, ux
        for k in range(-3, 4):
            px, py_ = cx + ux * 40.4 + vx * k * 10.5, cy + uy * 40.4 + vy * k * 10.5
            B.boxc(px, py_, zc + 14, 2.2, 2.2, 24.5, M['marble'])
            if k < 3:
                wx, wy = cx + ux * 40.15 + vx * (k + .5) * 10.5, cy + uy * 40.15 + vy * (k + .5) * 10.5
                for zw, hw in ((zc + 16, 7.5), (zc + 28, 5.5)):
                    BW.boxc(wx, wy, zw, 3.2 if ux == 0 else .4, 3.2 if uy == 0 else .4, hw, M['win'])
                    BW.cyl(wx, wy, zw + hw, 1.6, .4, M['win'], 10)
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
        chapel(B, BW, x, y, z, a, M)
        tx, ty = x + math.cos(a) * 17, y + math.sin(a) * 17
        spire(B, tx, ty, z, 8, 26, 24, M)
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
        B.strip(pts, 11.0, 2.4, M['marble'])          # 台面加宽：像座基底 3.6 m，原 8.5 m 的窄带托不住
        for q, (xa, ya) in enumerate(arc[1::3]):
            nx, ny = (xa - fx) / ea, (ya - fy) / eb; L = math.hypot(nx, ny) or 1
            statue(B, xa + nx / L * 2.5, ya + ny / L * 2.5, Z_TOP + 16.2, 1.5, M['basalt'] if q % 2 else M['white'])
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
    for av in avenues[5:7]: anchor('roads', math.cos(av) * 420, math.sin(av) * 420, 1)
    def on_street(x, y, pad=0.0):
        r = math.hypot(x, y); a = math.atan2(y, x)
        if r < 150 + pad: return True
        for av in avenues:
            d = math.atan2(math.sin(a - av), math.cos(a - av))
            if abs(d) < math.pi / 2 and abs(math.sin(d)) * r < 13.5 + pad: return True
        for rr in (330, 620, 980, 1400):
            if abs(r - rr) < 9 + pad: return True
        return False
    # 道路：放射大道（青石方砖 + 路缘）、环路；大道 22 m 宽，两侧人行道留给路灯
    R_ = C.Batch.get('city_roads')
    for av in avenues:
        ux, uy = math.cos(av), math.sin(av); vx, vy = -uy, ux
        for off, w, h, m in ((0, 20, .12, M['cobble']), (-10.6, 1.2, .28, M['curb']), (10.6, 1.2, .28, M['curb'])):
            R_.strip([(ux * r + vx * off, uy * r + vy * off, 0) for r in range(118, 3001, 120)], w, h, m)
    for rr in (330, 620, 980, 1400):
        n = int(rr * math.tau / 40)
        R_.strip([(math.cos(t * math.tau / n) * rr, math.sin(t * math.tau / n) * rr, .02) for t in range(n + 1)], 16, .1, M['cobble'])
    R_.cyl(0, 0, .05, 128, .1, M['curb'], 96)
    k = 0; spires = []
    STONES = [M['fa1'], M['fa1'], M['fa2'], M['fa3']]; ROOFS = [M['slate'], M['slate'], M['roof_dark'], M['lead']]
    for gx in range(-3000, 3001, 34):
        for gy in range(-3000, 3001, 34):
            x, y = gx + rnd.uniform(-6, 6), gy + rnd.uniform(-6, 6); r = math.hypot(x, y)
            if r > 3000 or rnd.random() < (r - 1800) / 1400: continue
            if rnd.random() < .12: continue
            ang = math.atan2(y, x) + rnd.choice((0, math.pi / 2)); w, d = rnd.uniform(18, 28), rnd.uniform(18, 30)
            if on_street(x, y, math.hypot(w, d) / 2): continue
            h = rnd.uniform(12, 26) * (1.3 - .5 * min(1, r / 2000))
            obox(B, x, y, 0, ang, w, d, h, rnd.choice(STONES))
            obox(B, x, y, 0, ang, w + .4, d + .4, 1.0, M['city_stone3'])                  # 勒脚
            obox(B, x, y, h - .9, ang, w + .8, d + .8, .9, M['city_stone'])               # 檐口
            ogable(B, x, y, h, ang, w + 1, d + 1, rnd.uniform(5, 9), rnd.choice(ROOFS))
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
                x = math.cos(av) * rr - math.sin(av) * 12.2 * s; y = math.sin(av) * rr + math.cos(av) * 12.2 * s
                BL_.cyl(x, y, 0, .22, .6, M['iron'], 8); BL_.cyl(x, y, .6, .1, 4.6, M['iron'], 6)     # 煤气灯式：座 + 杆 + 灯笼 + 顶帽
                BL_.cyl(x, y, 5.2, .32, .9, M['lamp'], 6); BL_.cyl(x, y, 6.1, .45, .45, M['iron'], 6, r2=0)
    for av in avenues:
        for rr in (300, 500, 700): anchor('lamps', math.cos(av) * rr - math.sin(av) * 12.2, math.sin(av) * rr + math.cos(av) * 12.2, 6.2)


def mist(M):
    col = bpy.context.scene.collection
    mm = volume('yy_mist', .0075, (1.0, .99, .97), aniso=.45, soft=True, glow=.35); rnd = random.Random(4)
    for q in range(22):                                                    # 山腰薄雾：一圈断续的薄雾带（小雾团贴着岩壁）
        a = q * math.tau / 22 + rnd.uniform(-.12, .12); zz = Z_TOP - rnd.uniform(150, 230); r = 175 * (1 - (Z_TOP - zz) / 700) + rnd.uniform(10, 45)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(math.cos(a) * r * 1.2, math.sin(a) * r, zz)); o = bpy.context.active_object
        o.name = f'mist_waist{q}'; o.scale = (rnd.uniform(55, 85), rnd.uniform(55, 85), rnd.uniform(14, 24)); o.rotation_euler[2] = a; o.data.materials.append(mm)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 90)); o = bpy.context.active_object; o.name = 'mist_city'
    o.scale = (26000, 26000, 180); o.data.materials.append(volume('yy_haze', .0016, (.9, .86, .95), aniso=.5))
    anchor('mist', -260, 20, Z_TOP - 180); anchor('mist', 600, -300, 30)


# ============================================================ 出图
def cam(sc, pos, tgt, lens):
    c = C.camera(sc, pos, tgt, lens); c.data.clip_end = 30000; return c


def main():
    sc = C.setup(A['samples'])
    M = mats()
    P = mountain(M)
    summit(M, P)
    stair(M)
    if A['city'] == '1':
        city(M)
    objs = C.Batch.build_all()
    for o in objs:
        if o.name.startswith(('lamps', 'glow', 'summit_win', 'city_win')):
            o.visible_shadow = False
    mist(M)
    C.sky_sun(sc, 'day', sun_az=235.0, sun_el=16.0, sun_e=3.6, sky_s=.2)
    sc.view_settings.exposure = -.1
    sc.cycles.volume_step_rate = 4.0
    sc.cycles.volume_max_steps = 256
    if A['save'] != '0':          # 1 = 存到 blender/world/out/<ID>.blend；其它值 = 直接当作输出路径（工作树里 out/ 可能是指向主工作树的软链）
        dst = os.path.join(OUT, ID + '.blend') if A['save'] == '1' else os.path.abspath(A['save'])
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        try:
            bpy.ops.wm.save_as_mainfile(filepath=dst)
        except RuntimeError as e:
            print('save_as_mainfile failed:', e)
    if A['glb'] == '1':
        os.makedirs(OUT, exist_ok=True)
        bpy.ops.object.select_all(action='DESELECT')
        for o in bpy.context.scene.objects:
            if o.type == 'MESH' and not o.name.startswith('mist'):
                o.select_set(True)
        try:
            bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, ID + '.glb'), export_format='GLB', use_selection=True)
        except RuntimeError as e:
            print('glb export failed:', e)
    base, ext = os.path.splitext(A['out'])
    with open(base + '_items.json', 'w') as fp:
        json.dump({'title': BOARD_TITLE, 'items': [{'key': k, 'text': t, 'source': s, 'status': st} for k, t, s, st in ITEMS]}, fp, ensure_ascii=False, indent=1)
    res = int(A['res'])
    # 主图：南偏东斜俯视，俯角约 22°
    az, pitch = math.radians(-72), math.radians(13)
    tgt = Vector((0, 0, 560))
    d = 2500
    pos = tgt + Vector((math.cos(az) * math.cos(pitch), math.sin(az) * math.cos(pitch), math.sin(pitch))) * d
    cam(sc, tuple(pos), tuple(tgt), 46)
    sc.render.resolution_x = res
    sc.render.resolution_y = int(res / 1.6)
    K_.project_anchors(sc, ANCH, base + '_anchors.json')
    C.render(sc, A['out'], res, 1.6)
    # 顶台近景：看清主殿、礼拜堂环、神像回廊
    az, pitch = math.radians(-78), math.radians(34)
    tgt = Vector((0, -20, Z_TOP + 20))
    d = 620
    pos = tgt + Vector((math.cos(az) * math.cos(pitch), math.sin(az) * math.cos(pitch), math.sin(pitch))) * d
    cam(sc, tuple(pos), tuple(tgt), 45)
    K_.project_anchors(sc, ANCH, base + '_summit_anchors.json')
    C.render(sc, base + '_summit' + ext, res, 1.6)
    if A['ground'] == '1':                                                  # 城区仰视：大道上看山底、步道、神像
        av = 13 * math.pi / 8
        cam(sc, (math.cos(av) * 640 + 3, math.sin(av) * 640, 1.7), (0, 0, 330), 20)
        K_.project_anchors(sc, ANCH, base + '_ground_anchors.json')
        C.render(sc, base + '_ground' + ext, res, 1.6)


if __name__ == '__main__':
    import traceback
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise
