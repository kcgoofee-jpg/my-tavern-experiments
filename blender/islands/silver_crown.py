"""银冠堡（渲染战役 R；设定块 docs/upper-islands-checklist.md「银冠堡」C1–C6 / R1–R18；设定 docs/upper-setting.md §4.9、§8、§9.4）。
卡：议会骑士团总部，一座悬浮要塞，在上层与中层交界【卡 L48、L152】；约 1200 骑士 + 5000 辅助人员【L152】；
    悬浮机动装置【L105】；跨层通行许可 P-xxxxx【L109】；骑士团巡逻空域【L32】。其余形制为仓库推断（地图自设）。
岛面 —— 形制沿用现有要塞模型（blender/landmarks/silver_crown/build.py），移植到岛表的要塞方台轮廓上：
        银灰方石环形城墙（胸墙 + 雉堞 + 墙顶步道）、8 座圆塔（拉丝银锥帽 + 信标）、南面门楼（双塔夹门道 + 半升钢闸）；
        中央主堡（长方形大厅 + 大圆主塔：银冠环、冠尖柱、天线桅杆、深色锥顶）；沿内墙的营房 / 坐骑库长楼；
        东侧巡逻艇停机坪 + 机库；西侧砾石校场；西北骑士出击坪；门外桥头的载具检查平台（升降井口，许可核验）。
岛底 —— 30 m 方石护坡 + 岩崖带，下接银灰整块倒金字塔岩座（四棱锐利、面平）；四棱各一具悬浮发射器 = 四角四核；
        棱线上冷蓝导能脉；不设瀑布、不垂根。无人物、武器、旗帜、徽记、文字。
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit as K_
from _kit import C

ID, NAME = 'silver_crown', '银冠堡'
CAM_DROP, CAM_DIST = .3, 4.2
UCAM_DROP, UCAM_DIST = .42, 3.9
GA = -math.pi / 2                    # 门楼 / 检查平台朝南（朝伊甸一侧，也正对斜视相机）
WALL_IN, WALL_H, WALL_T = 11.0, 11.0, 4.2
CLIFF, SCARP = 30.0, 12.0            # 崖带总高 / 其中上段方石护坡

BOARD_TITLE = '银冠堡 —— 渲染战役设定对照'
ITEMS = [
    ('card_hq', '议会骑士团总部，一座悬浮要塞，在上层与中层交界', '卡原文 L48、L152（C1）', '✓'),
    ('outline', '要塞方台：更方，四角略凸', '仓库推断 §8（R1）', '✓'),
    ('walls', '银灰方石环形城墙，胸墙 + 雉堞 + 墙顶步道；8 座圆塔，银锥帽', '沿用现有模型（R3、R4）', '✓'),
    ('keep', '主堡：长方形大厅 + 大圆主塔（银冠环、深色锥顶、天线桅杆）', '沿用现有模型（R5）', '✓'),
    ('gate', '南面门楼：双塔夹门道，半升钢闸', '沿用现有模型（R6）', '✓'),
    ('vplat', '载具检查平台：门外桥头，闸柱 + 光闸，核验 P-xxxxx 许可', '卡原文 L109 + 仓库推断 §2（C4、R7）', '✓'),
    ('ranges', '营房 / 坐骑库长楼沿内墙（千人驻军）', '卡原文 L152 规模 + 仓库推断（C2、R8）', '✓'),
    ('pad', '巡逻艇停机坪 + 机库，停着巡逻悬浮艇', '卡原文 L32 + 仓库推断（C5、R9、R10）', '✓'),
    ('sortie', '骑士出击坪：悬浮机动装置起降圆坪 + 信标环', '卡原文 L105 + 仓库推断（C3、R11）', '✓'),
    ('yard', '砾石校场', '仓库推断（R2）', '✓'),
    ('crystal', '崖缘冷蓝晶簇（次于罗斯柴尔德）', '仓库推断 §1（R12）', '✓'),
    ('ward', '结界：格边很淡', '仓库推断 §9.4（R13）', '✓'),
    ('u_plinth', '岛底：方石护坡 + 银灰整块倒金字塔岩座，棱线锐利', '仓库推断 §9.4（R14）', '✓'),
    ('u_launcher', '岩座四棱各一具悬浮发射器；棱线导能脉', '仓库推断 §9.4、§9.2（R15、R16）', '✓'),
    ('u_core', '四颗核在四角', '仓库推断 §9.4（R15）', '✓'),
]


# ============================================================ 几何小件（移植自 landmarks/silver_crown/build.py）
def obox(B, p, q, w, z0, z1, m, off=0.0):
    """p→q 为中线、宽 w 的竖直方盒（off = 沿法向偏移）"""
    dx, dy = q[0] - p[0], q[1] - p[1]; L = math.hypot(dx, dy) or 1e-6; nx, ny = -dy / L, dx / L; a0, a1 = off - w / 2, off + w / 2
    P = [(p[0] + nx * a0, p[1] + ny * a0), (q[0] + nx * a0, q[1] + ny * a0), (q[0] + nx * a1, q[1] + ny * a1), (p[0] + nx * a1, p[1] + ny * a1)]
    B.poly([(x, y, z0) for x, y in P] + [(x, y, z1) for x, y in P], [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], m)


def lerp(p, q, t): return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)


def merlons(B, p, q, off, z, m, step=2.4, mw=1.3, mh=1.5, th=.7):
    L = math.hypot(q[0] - p[0], q[1] - p[1]); n = max(1, int(L / step))
    for k in range(n): obox(B, lerp(p, q, (k + .5) / n - mw / 2 / L), lerp(p, q, (k + .5) / n + mw / 2 / L), th, z, z + mh, m, off)


def round_tower(B, M, x, y, r, h, cap_h, n=24):
    """圆塔：斜脚、挑檐、雉堞、帽座、拉丝银锥帽、尖杆 + 信标、箭窗式细缝"""
    B.cyl(x, y, -1.0, r * 1.12, 3.0, M['ash'], n, r2=r); B.cyl(x, y, 2.0, r, h - 2.0, M['ash'], n); B.cyl(x, y, h, r + .8, 1.0, M['ash2'], n)
    for k in range(n // 2):
        a = (k + .25) * math.tau / (n // 2); B.boxc(x + (r + .45) * math.cos(a), y + (r + .45) * math.sin(a), h + 1.0, 1.4, 1.4, 1.4, M['ash2'])
    B.cyl(x, y, h + 1.0, r - .6, 2.2, M['ash'], n); B.cyl(x, y, h + 3.2, r + .3, cap_h, M['silver'], n, r2=0.0)
    top = h + 3.2 + cap_h; B.cyl(x, y, top - .2, .12, 3.0, M['steel'], 6); B.sphere(x, y, top + 3.0, .45, M['beacon'], seg=10, rings=6)
    for k in range(4):
        a = k * math.tau / 4 + .4
        for zz in (h * .35, h * .7):
            F = C.wall_frame((x + r * math.cos(a), y + r * math.sin(a), zz), (math.cos(a), math.sin(a), 0))
            C.slab2d(B, F, [(-.3, 0), (.3, 0), (.3, 2.6), (-.3, 2.6)], -.3, .05, M['void'])
    return top


def hangar(B, M, x, y, w, d, h, face):
    """筒拱机库：沿 x 宽 w、y 深 d；face = ±1 开口朝 ±y；素面钢拱 + 半开钢折叠门"""
    n = 12; prof = [(w / 2 * math.cos(math.pi * k / n), h * .45 + h * .55 * math.sin(math.pi * k / n)) for k in range(n + 1)]
    y0, y1 = y - d / 2, y + d / 2
    B.poly([(x + u, y0, z) for u, z in prof] + [(x + u, y1, z) for u, z in prof], [(k + 1, k, n + 1 + k, n + 2 + k) for k in range(n)], M['steel'])
    B.box(x - w / 2, x - w / 2 + .6, y0, y1, 0, h * .45, M['ash']); B.box(x + w / 2 - .6, x + w / 2, y0, y1, 0, h * .45, M['ash'])
    yb, yf = (y1, y0) if face < 0 else (y0, y1)
    B.poly([(x + u, yb, z) for u, z in prof] + [(x, yb, 0)], [tuple(reversed(tuple(range(n + 1)) + (n + 1,)))], M['ash'])
    B.box(x - w / 2 + .6, x + w / 2 - .6, y0 + .5, y1 - .5, .01, h * .8, M['void'])
    for s in (-1, 1): B.box(x + s * (w / 2 - .6) - s * w * .18, x + s * (w / 2 - .6), yf - .2, yf + .2, 0, h * .45, M['door'])
    B.box(x - w / 2, x + w / 2, yf - .5, yf + .5, h * .45, h * .62, M['ash2'])
    for k in range(1, 6): B.tube([(x + u, y0 + k * d / 6, z + .12) for u, z in prof], .12, M['steel'], n=4)


def patrol_craft(B, M, x, y, z, yaw=0.0):
    """巡逻悬浮艇：楔形细长体 + 座舱 + 四个涵道（无旋翼、无机翼、无武器）"""
    c, s = math.cos(yaw), math.sin(yaw); P = lambda px, py, pz: (x + px * c - py * s, y + px * s + py * c, z + pz)
    prof = [(-5.5, 1.1, .6), (-2.0, 1.6, 1.0), (2.5, 1.4, .9), (5.5, .35, .35)]; vs = []
    for (px, hw, hh) in prof: vs += [P(px, -hw, -hh * .6), P(px, hw, -hh * .6), P(px, hw * .8, hh), P(px, -hw * .8, hh)]
    fs = [(k * 4 + j, k * 4 + (j + 1) % 4, k * 4 + (j + 1) % 4 + 4, k * 4 + j + 4) for k in range(len(prof) - 1) for j in range(4)]
    L = (len(prof) - 1) * 4; B.poly(vs, fs + [(3, 2, 1, 0), (L, L + 1, L + 2, L + 3)], M['hull'])
    q = P(1.0, 0, .8); B.sphere(q[0], q[1], q[2], 1.0, M['canopy'], sz=.55, seg=14, rings=7, zmin=0.0)
    for (px, py) in ((-3.0, -2.8), (-3.0, 2.8), (2.2, -2.4), (2.2, 2.4)):
        q = P(px, py, -.1); B.cyl(q[0], q[1], q[2] - .35, 1.1, .7, M['hull_d'], 16); B.cyl(q[0], q[1], q[2] - .37, .85, .03, M['emit'], 12)
        B.poly([P(px * .5, py * .4, 0), P(px, py, 0), P(px, py, .2), P(px * .5, py * .4, .2)], [(0, 1, 2, 3), (3, 2, 1, 0)], M['hull_d'])


def mount(B, M, x, y, z, yaw):
    """单座悬浮坐骑（悬浮摩托式），素面"""
    c, s = math.cos(yaw), math.sin(yaw); P = lambda px, pz: (x + px * c, y + px * s, z + pz)
    B.sphere(x, y, z, .6, M['hull'], sz=.6, seg=12, rings=6)
    for px in (-1.1, 1.1): q = P(px, -.1); B.cyl(q[0], q[1], q[2] - .2, .55, .35, M['hull_d'], 12); B.cyl(q[0], q[1], q[2] - .21, .42, .02, M['emit'], 10)
    B.tube([P(-1.1, 0), P(1.3, .3)], .25, M['hull'], n=6)


def quarters(B, M, x0, x1, y0, y1, h):
    """驻军长楼：方石体块 + 束带 + 双坡石板顶 + 两侧窗列（底层门洞隔开）"""
    B.box(x0, x1, y0, y1, -.5, h, M['ash']); B.box(x0 - .3, x1 + .3, y0 - .3, y1 + .3, h - .7, h, M['ash2'])
    along = 'x' if x1 - x0 >= y1 - y0 else 'y'; B.gable(x0, x1, y0, y1, h, min(x1 - x0, y1 - y0) * .42, M['slate'], along, over=.6)
    L = (x1 - x0) if along == 'x' else (y1 - y0); n = int(L / 4.2)
    for side in (-1, 1):
        for k in range(n):
            u = (x0 if along == 'x' else y0) + (k + .5) * L / n
            if along == 'x': F = C.wall_frame((u, y1 if side > 0 else y0, 0.0), (0, side, 0))
            else: F = C.wall_frame((x1 if side > 0 else x0, u, 0.0), (side, 0, 0))
            if k % 5 == 2: C.slab2d(B, F, [(-1.3, 0), (1.3, 0), (1.3, 3.4), (-1.3, 3.4)], -.05, .05, M['door'])
            else: C.slab2d(B, F, [(-.5, 1.3), (.5, 1.3), (.5, 3.3), (-.5, 3.3)], -.05, .05, M['glass'])
            for zz in range(1, int(h / 3.6)): C.slab2d(B, F, [(-.5, zz * 3.6 + .9), (.5, zz * 3.6 + .9), (.5, zz * 3.6 + 2.9), (-.5, zz * 3.6 + 2.9)], -.05, .05, M['glass'])


# ============================================================ 材质
def mats(ctx):
    M = ctx.M
    if 'ash' in M: return M
    M['ash'] = C.ashlar('sc_ashlar', (.46, .475, .5), course=.7, block=1.5, joint=.012, jc=(.33, .34, .36))
    M['ash2'] = C.ashlar('sc_ashlar_fine', (.55, .56, .58), course=.45, block=1.0, joint=.012, jc=(.38, .39, .41))
    M['silver'] = C.flat('sc_silver', (.82, .84, .87), .28, metal=1.0)
    M['steel'] = C.flat('sc_steel', (.5, .52, .56), .35, metal=.85, noise=.15)
    M['dark'] = C.flat('sc_cap_dark', (.09, .1, .12), .4, metal=.6)
    M['slate'] = C.flat('sc_slate', (.26, .28, .32), .6, noise=.25)
    M['glass'] = C.glass('sc_glass', tint=(.05, .06, .08))
    M['void'] = C.flat('sc_void', (.015, .015, .017), .9)
    M['gravel'] = C.flat('sc_gravel', (.52, .5, .47), .95, noise=.6)
    M['pave'] = C.flat('sc_pave', (.62, .62, .62), .8, noise=.35)
    M['deck'] = C.flat('sc_deck', (.56, .58, .61), .55, metal=.3, noise=.2)
    M['padm'] = C.flat('sc_padmark', (.82, .84, .86), .6)
    M['beacon'] = C.flat('sc_beacon', (1.0, .95, .85), .2, emit=(1.0, .92, .75), estr=12.0)
    M['emit'] = C.flat('sc_emitter', (.6, .95, 1.0), .2, emit=(.35, .9, 1.0), estr=28.0)
    M['holo'] = C.glow('sc_holo', c=(.62, .88, 1.0), estr=4.0)
    M['lit'] = C.flat('sc_winlit', (.9, .75, .5), .3, emit=(1.0, .78, .5), estr=3.0)
    M['hull'] = C.flat('sc_hull', (.62, .65, .69), .25, metal=.8, coat=.5)
    M['hull_d'] = C.flat('sc_hull_dark', (.12, .13, .15), .35, metal=.6)
    M['canopy'] = C.glass('sc_canopy', tint=(.03, .04, .05))
    M['door'] = C.flat('sc_door_steel', (.3, .32, .35), .45, metal=.7)
    M['crystal'] = C.flat('sc_crystal', (.3, .6, 1.0), .05, emit=(.3, .65, 1.0), estr=4.0)
    M['ward_sc'] = K_.hex_ward('sc_ward', cell=9.0, alpha=.14, estr=1.2, rim=.03)                  # 格边很淡
    M['bailey'] = C.flat('sc_bailey', (.56, .55, .51), .95, noise=.55)                           # 城内硬地（夯土碎石）
    M['turf'] = K_.ground_v17('sc_turf', [(.36, .4, .3), (.42, .45, .34), (.33, .37, .28)], dry=(.55, .53, .45), soil=(.4, .38, .33), rock=(.5, .5, .5))
    return M


# ============================================================ 轮廓工具
def inset_pt(S, a, d):
    """轮廓在角 a 处向内收 d 米的点"""
    r = S.rad(a); return math.cos(a) * (r - d), math.sin(a) * (r - d)


def corner_angles(S):
    """超椭圆方台的四个角（离心最远的方向）"""
    out = []
    for q in range(4):
        a0 = q * math.pi / 2; out.append(max((a0 + k * math.pi / 2 / 90 for k in range(90)), key=S.rad))
    return out


# ============================================================ 岛面
def top(ctx):
    S = ctx.S; R = S.R; M = mats(ctx)
    tr = K_.Terrain(S, noise=(.15, 40), rough=None, brow=(5, 1.2), ground='bailey')
    tr.flats.append((-R, R, -R, R, 0.0, 1))                       # 城墙内外都是人工找平的方台
    ctx.tr = tr; ctx.top_z = lambda x, y: tr.h(x * .999, y * .999)
    YX, YY = -80.0, -8.0; PX, PY = 78.0, -18.0; SPX, SPY, SPR = -76.0, 50.0, 15.0
    tr.fn(lambda x, y: S.frac(x, y) > 1 - (WALL_IN - 2.5) / S.rad(math.atan2(y, x)), 'turf')   # 墙外窄岩缘：矮草
    for (cx, cy, a, b) in ((-40, 64, 14, 8), (40, -30, 16, 9), (-30, -22, 10, 7), (100, 50, 9, 6)):
        tr.ell(cx, cy, a, b, 'turf')                                # 城内零星草块
    tr.rect(YX - 26, YX + 22, YY - 26, YY + 22, 'gravel')          # 校场
    tr.rect(-52, -12, -44, 2, 'pave')                               # 阅兵场
    tr.rect(-7, 7, -S.rad(GA) + WALL_IN, 12, 'pave')               # 门楼 → 主堡大道
    tr.rect(-34, 40, 4, 52, 'pave')                                # 主堡前院
    tr.path([(YX + 22, YY), (-34, 20)], 7, 'pave'); tr.path([(40, 20), (PX - 26, PY + 10)], 7, 'pave')
    tr.build(ctx.B('terrain'), M)
    ctx.anchor('outline', *S.edge(corner_angles(S)[0], .99), 1.0); ctx.anchor('outline', *S.edge(corner_angles(S)[2], .99), 1.0)

    # ---- 环形城墙 + 8 座圆塔（4 角 + 3 边中段；南边中段让给门楼）
    CU = ctx.B('walls'); NW = 96
    WP = [inset_pt(S, i * math.tau / NW, WALL_IN) for i in range(NW)]
    gi = round((GA % math.tau) / math.tau * NW) % NW
    for i in range(NW):
        if i in (gi - 1, gi): continue
        p, q = WP[i], WP[(i + 1) % NW]; L_ = math.hypot(q[0] - p[0], q[1] - p[1]); e_ = .9 / L_
        p, q = lerp(p, q, -e_), lerp(p, q, 1 + e_)                     # 段间搭接，免接缝
        obox(CU, p, q, WALL_T, -1.0, WALL_H, M['ash']); obox(CU, p, q, WALL_T + 1.6, -1.0, 1.5, M['ash'])
        obox(CU, p, q, .6, WALL_H, WALL_H + 1.1, M['ash2'], off=-(WALL_T / 2 - .3)); merlons(CU, p, q, -(WALL_T / 2 - .35), WALL_H + 1.1, M['ash2'])
        obox(CU, p, q, .4, WALL_H, WALL_H + .9, M['ash2'], off=WALL_T / 2 - .2); obox(CU, p, q, WALL_T - 1.0, WALL_H, WALL_H + .08, M['pave'])
        obox(CU, p, q, WALL_T + .5, WALL_H - .6, WALL_H, M['ash2'])
    TW = ctx.B('towers')
    for k, a in enumerate(corner_angles(S) + [0.0, math.pi / 2, math.pi]):
        x, y = inset_pt(S, a, WALL_IN); r = 8.0 if k < 4 else 7.0
        t = round_tower(TW, M, x, y, r, 21.0 if k < 4 else 19.0, 9.5 if k < 4 else 9.0)
        if k in (0, 5): ctx.anchor('walls', x, y, t)

    # ---- 门楼（南）+ 桥 + 载具检查平台（升降井口）
    GT = ctx.B('gate'); gx, gy = inset_pt(S, GA, WALL_IN); gy = min(gy, WP[gi][1])
    GT.box(gx - 9, gx + 9, gy - 6, gy + 6, -1.0, 15.0, M['ash']); GT.box(gx - 9.4, gx + 9.4, gy - 6.4, gy + 6.4, 14.4, 15.2, M['ash2'])
    for xx in range(-4, 5):
        for s in (-1, 1): GT.boxc(gx + xx * 2.0, gy + s * 6.0, 15.2, 1.2, .7, 1.4, M['ash2'])
    for s in (-1, 1): round_tower(GT, M, gx + s * 11.5, gy - 1.0, 6.0, 21.0, 8.0)
    arch, _ = C.pointed(5.0, 5.2, 8, .7)
    for yy, nrm in ((gy - 6.0, -1), (gy + 6.0, 1)):
        F = C.wall_frame((gx, yy, 0.0), (0, nrm, 0)); C.slab2d(GT, F, arch, -1.2, .05, M['void']); C.frame2d(GT, F, arch, .6, -.1, .35, M['ash2'])
    F = C.wall_frame((gx, gy - 6.0, 0.0), (0, -1, 0))
    for u in (-2.0, -1.0, 0.0, 1.0, 2.0): C.slab2d(GT, F, [(u - .08, 4.0), (u + .08, 4.0), (u + .08, 7.5), (u - .08, 7.5)], -.6, -.4, M['steel'])
    ctx.anchor('gate', gx, gy, 17.0)
    rim_y = -S.rad(GA); by0, by1, BZ = gy - 6.0, rim_y - 30.0, 1.2
    GT.box(gx - 5, gx + 5, by1, by0, BZ - .3, BZ, M['pave']); GT.box(gx - 5.3, gx + 5.3, by1, by0, BZ - 2.2, BZ - .3, M['ash'])
    for s in (-1, 1):
        GT.box(gx + s * 5 - .35, gx + s * 5 + .35, by1, by0, BZ, BZ + 1.15, M['ash2'])
        for yy in range(int(by1) + 4, int(by0) - 1, 8):
            GT.cyl(gx + s * 5, yy, BZ + 1.15, .14, 3.6, M['silver'], 8); GT.cyl(gx + s * 5, yy, BZ + 4.75, .32, .7, M['beacon'], 8, r2=.22)
    GT.tube([(gx, rim_y + 2, -16), (gx, (rim_y + by1) / 2, -2.2)], .6, M['steel'], n=10)
    VP = ctx.B('vplat'); DX, DY, DR = gx, by1 - 18.0, 20.0                  # 检查平台：圆甲板 + 下收钢托 + 发射器
    VP.cyl(DX, DY, -1.0, DR, 1.0 + BZ, M['deck'], 48, smooth=False); VP.cyl(DX, DY, -3.2, DR + .3, 2.2, M['steel'], 48, r2=DR * .76, smooth=False)
    VP.cyl(DX, DY, -7.0, DR * .76, 3.8, M['steel'], 40, r2=5.0, smooth=False); VP.cyl(DX, DY, -9.0, 3.0, 2.0, M['emit'], 20, r2=1.5)
    VP.cyl(DX, DY, BZ, DR - 5.5, .03, M['padm'], 48, smooth=False); VP.cyl(DX, DY, BZ, DR - 6.0, .04, M['deck'], 48, smooth=False)
    C.beacon_ring(VP, DX, DY, BZ, DR - .5, M['beacon'], n=16, s=.3)
    for s in (-1, 1):                                                       # 许可核验：闸柱 + 光闸横杆（桥头两道）
        for yy in (by1 + 3.0, by1 + 9.0):
            VP.cyl(gx + s * 4.2, yy, BZ, .45, 3.2, M['steel'], 12); VP.sphere(gx + s * 4.2, yy, BZ + 3.45, .35, M['holo'], seg=10, rings=5)
    for yy in (by1 + 3.0, by1 + 9.0): VP.strip([(gx - 4.0, yy, BZ + 2.5), (gx + 4.0, yy, BZ + 2.5)], .2, .08, M['holo'])
    VP.box(DX + 9, DX + 14, DY - 3.5, DY + 3.5, BZ, BZ + 3.2, M['ash2']); VP.box(DX + 8.7, DX + 14.3, DY - 3.8, DY + 3.8, BZ + 3.2, BZ + 3.6, M['steel'])   # 核验亭
    F = C.wall_frame((DX + 9, DY, BZ + 1.0), (-1, 0, 0)); C.slab2d(VP, F, [(-2.6, 0), (2.6, 0), (2.6, 1.6), (-2.6, 1.6)], -.1, .02, M['glass'])
    ctx.anchor('vplat', gx, by1 + 6, BZ + 3.5); ctx.anchor('vplat', DX, DY, BZ + 2)

    # ---- 主堡：大厅（北）+ 大圆主塔（西端）
    WX = ctx.B('keep'); HX0, HX1, HY0, HY1, HH = -26.0, 30.0, 14.0, 48.0, 20.0
    WX.box(HX0 - 1, HX1 + 1, HY0 - 1, HY1 + 1, -.5, 2.5, M['ash'])
    for k in range(4): WX.box(-7, 7, HY0 - 1 - (k + 1) * .8, HY0 - 1 - k * .8, -.5, 2.5 - .6 * (k + 1), M['ash2'])
    WX.box(HX0, HX1, HY0, HY1, 2.5, HH, M['ash']); WX.box(HX0 - .4, HX1 + .4, HY0 - .4, HY1 + .4, HH - .8, HH, M['ash2'])
    for y in (HY0 - .4, HY1 + .4): WX.box(HX0 - .4, HX1 + .4, y - .3, y + .3, HH, HH + 1.0, M['ash2']); merlons(WX, (HX0, y), (HX1, y), 0.0, HH + 1.0, M['ash2'])
    WX.gable(HX0 + 1, HX1 - 1, HY0 + 1, HY1 - 1, HH, 10.0, M['slate'], 'x')
    for s, yf in ((-1, HY0), (1, HY1)):                                    # 扶壁 + 尖拱高窗
        for k in range(8):
            x = HX0 + 3.5 + k * (HX1 - HX0 - 7) / 7; WX.box(x - .7, x + .7, yf, yf + s * 1.3, 2.5, HH - 3, M['ash2'])
            if k < 7:
                F = C.wall_frame((x + (HX1 - HX0 - 7) / 14, yf, 5.5), (0, s, 0)); pts, _ = C.pointed(1.8, 10.5, 6, .8)
                C.slab2d(WX, F, pts, -.05, .05, M['lit']); C.frame2d(WX, F, pts, .5, 0.0, .2, M['ash2'])
    F = C.wall_frame((2.0, HY0, 2.5), (0, -1, 0)); pts, _ = C.pointed(4.2, 5.0, 8, .7)
    C.slab2d(WX, F, pts, -.1, .08, M['door']); C.frame2d(WX, F, pts, .7, 0.0, .6, M['ash2'])
    WX.box(HX1 - 7, HX1 + 1, 26, 36, HH, HH + 12, M['ash']); WX.pyramid(HX1 - 3, 31, HH + 12, 9.5, 11.5, 6.0, M['silver'])
    TX, TY, TR, TH = HX0 - 2.0, 31.0, 15.0, 52.0
    WX.cyl(TX, TY, -1.0, TR * 1.15, 5.0, M['ash'], 40, r2=TR); WX.cyl(TX, TY, 4.0, TR, TH - 4.0, M['ash'], 40)
    for z in (16.0, 32.0): WX.cyl(TX, TY, z, TR + .35, .7, M['ash2'], 40)
    for k in range(20): a = k * math.tau / 20; WX.boxc(TX + (TR + .6) * math.cos(a), TY + (TR + .6) * math.sin(a), TH - 2.5, 1.0, 1.0, 2.5, M['ash2'])
    WX.cyl(TX, TY, TH, TR + 1.6, 1.2, M['ash2'], 40); WX.cyl(TX, TY, TH + 1.2, TR + 1.6, 1.6, M['silver'], 40); WX.cyl(TX, TY, TH + 2.8, TR + 1.9, .5, M['silver'], 40)
    for k in range(16):                                                    # 冠尖柱 + 天线桅杆
        a = k * math.tau / 16; x, y = TX + (TR + 1.2) * math.cos(a), TY + (TR + 1.2) * math.sin(a)
        WX.cyl(x, y, TH + 3.3, 1.0, 1.2, M['silver'], 8); WX.cyl(x, y, TH + 4.5, .9, 11.0 if k % 2 == 0 else 7.0, M['silver'], 8, r2=.05)
        if k % 4 == 0:
            WX.cyl(x, y, TH + 3.3, .32, 20.0, M['silver'], 8); WX.sphere(x, y, TH + 23.6, .5, M['beacon'], seg=8, rings=5)
            for zz in (TH + 8, TH + 12, TH + 16): WX.box(x - 1.6, x + 1.6, y - .1, y + .1, zz, zz + .18, M['silver'])
    WX.cyl(TX, TY, TH + 1.2, TR - 1.0, 6.0, M['ash'], 40); WX.cyl(TX, TY, TH + 7.2, TR + .2, 22.0, M['dark'], 40, r2=0.0)
    WX.cyl(TX, TY, TH + 7.2, TR + .5, .6, M['silver'], 40); WX.cyl(TX, TY, TH + 28.5, .25, 9.0, M['silver'], 8); WX.sphere(TX, TY, TH + 37.8, .6, M['beacon'], seg=10, rings=6)
    for k in range(10):                                                    # 主塔窄长窗
        a = k * math.tau / 10 + .3
        for z0, hh in ((8.0, 6.0), (20.0, 9.0), (35.0, 9.0)):
            F = C.wall_frame((TX + TR * math.cos(a), TY + TR * math.sin(a), z0), (math.cos(a), math.sin(a), 0)); pts, _ = C.pointed(1.0, hh, 5, .8)
            C.slab2d(WX, F, pts, -.05, .05, M['glass']); C.frame2d(WX, F, pts, .2, 0.0, .12, M['ash2'])
    ctx.anchor('keep', TX, TY, TH + 30); ctx.anchor('keep', 10, 31, HH + 10); ctx.anchor('card_hq', 2, HY0, 10)

    # ---- 校场（西）+ 骑士出击坪（西北）
    YD = ctx.B('yard')
    for (x0, x1, y0, y1) in ((YX - 26.6, YX + 22.6, YY - 26.6, YY - 26), (YX - 26.6, YX + 22.6, YY + 22, YY + 22.6),
                             (YX - 26.6, YX - 26, YY - 26, YY + 22), (YX + 22, YX + 22.6, YY - 26, YY + 22)):
        YD.box(x0, x1, y0, y1, -.05, .3, M['pave'])
    for k in range(6): x = YX - 22 + k * 8.5; YD.cyl(x, YY + 24, 0.0, .18, 4.0, M['steel'], 8); YD.cyl(x, YY + 24, 4.0, .35, .6, M['beacon'], 8)
    ctx.anchor('yard', YX, YY, 1)
    SP = ctx.B('sortie')
    SP.cyl(SPX, SPY, -.3, SPR + 1.0, .6, M['steel'], 48); SP.cyl(SPX, SPY, .3, SPR + .4, .1, M['deck'], 48); SP.cyl(SPX, SPY, .41, SPR * .9, .02, M['padm'], 48, smooth=False)
    SP.cyl(SPX, SPY, .41, SPR * .84, .03, M['deck'], 48, smooth=False)
    for q in range(6):
        a = q * math.tau / 6; x, y = SPX + SPR * .55 * math.cos(a), SPY + SPR * .55 * math.sin(a)
        SP.cyl(x, y, .42, 1.3, .04, M['padm'], 20, smooth=False)
        if q % 2 == 0: mount(SP, M, x, y, 1.3, a + math.pi / 2)
    C.beacon_ring(SP, SPX, SPY, .4, SPR + .6, M['beacon'], n=12, s=.28)
    ctx.anchor('sortie', SPX, SPY, 2)

    # ---- 巡逻艇停机坪（东）+ 机库 + 悬浮坐骑库（西南）
    PD = ctx.B('pad'); PD.box(PX - 26, PX + 20, PY - 22, PY + 20, -.05, .25, M['deck'])
    for (cx, cy) in ((PX - 12, PY - 9), (PX + 6, PY - 9), (PX - 3, PY + 9)):
        PD.cyl(cx, cy, .25, 7.0, .03, M['padm'], 40, smooth=False); PD.cyl(cx, cy, .25, 6.5, .04, M['deck'], 40, smooth=False); PD.cyl(cx, cy, .25, 1.2, .05, M['padm'], 20, smooth=False)
    for k in range(10): PD.cyl(PX - 25 + k * 5, PY - 21.5, .25, .18, .2, M['beacon'], 8)
    HG = ctx.B('hangars'); hangar(HG, M, PX - 14, PY + 33, 18, 22, 10, -1); hangar(HG, M, PX + 7, PY + 33, 18, 22, 10, -1)
    hangar(HG, M, -48, -64, 16, 18, 8, 1); hangar(HG, M, -28, -66, 16, 18, 8, 1)
    CR = ctx.B('craft')
    patrol_craft(CR, M, PX - 12, PY - 9, 1.6, .3); patrol_craft(CR, M, PX + 6, PY - 9, 1.6, -.2); patrol_craft(CR, M, PX + 7, PY + 18, 1.4, math.pi / 2)
    patrol_craft(CR, M, DX - 7, DY - 2, BZ + 1.5, .8)
    for k in range(6): mount(CR, M, -54 + k * 2.4, -52.5, .9, math.pi / 2); mount(CR, M, -34 + k * 2.4, -54.5, .9, math.pi / 2)
    ctx.anchor('pad', PX - 3, PY, 3); ctx.anchor('pad', PX - 3, PY + 33, 11)

    # ---- 营房 / 坐骑库长楼（沿内墙；让开门楼、停机坪、机库、出击坪、主塔）
    RG = ctx.B('ranges')
    for (deg, L, d, h) in ((62, 36, 9, 10), (80, 34, 9, 10), (100, 34, 9, 10), (180, 34, 9, 7), (204, 36, 9, 7),
                           (236, 30, 9, 10), (302, 30, 9, 10), (324, 26, 9, 7)):
        a = math.radians(deg); c = inset_pt(S, a, WALL_IN + WALL_T / 2 + d / 2 + .5)
        p0, p1 = inset_pt(S, a - .02, WALL_IN), inset_pt(S, a + .02, WALL_IN); tx, ty = p1[0] - p0[0], p1[1] - p0[1]; tl = math.hypot(tx, ty); tx, ty = tx / tl, ty / tl
        nx, ny = ty, -tx                                                   # 朝外（墙）的法向
        p, q = (c[0] - tx * L / 2, c[1] - ty * L / 2), (c[0] + tx * L / 2, c[1] + ty * L / 2)
        obox(RG, p, q, d, -.5, h, M['ash'])
        hi = [(p[0] + nx * d / 2, p[1] + ny * d / 2), (q[0] + nx * d / 2, q[1] + ny * d / 2)]
        lo = [(q[0] - nx * (d / 2 + 1), q[1] - ny * (d / 2 + 1)), (p[0] - nx * (d / 2 + 1), p[1] - ny * (d / 2 + 1))]
        vs = [(*hi[0], h + 3.0), (*hi[1], h + 3.0), (*lo[0], h - .4), (*lo[1], h - .4)]
        RG.poly(vs + [(x, y, z - .3) for x, y, z in vs], [(0, 3, 2, 1), (4, 5, 6, 7), (2, 3, 7, 6), (0, 1, 5, 4), (1, 2, 6, 5), (3, 0, 4, 7)], M['slate'])
        for k in range(int(L / 4.0)):
            m_ = lerp(p, q, (k + .5) / int(L / 4.0)); F = C.wall_frame((m_[0] - nx * d / 2, m_[1] - ny * d / 2, 0.0), (-nx, -ny, 0))
            if k % 3 == 1: C.slab2d(RG, F, [(-1.2, 0), (1.2, 0), (1.2, 3.2), (-1.2, 3.2)], -.05, .05, M['door'])
            else: C.slab2d(RG, F, [(-.45, 1.2), (.45, 1.2), (.45, 3.4), (-.45, 3.4)], -.05, .05, M['glass'])
        if deg == 204: ctx.anchor('ranges', c[0], c[1], h + 2)

    # ---- 驻军楼群（C2：千余骑士 + 五千辅助人员）：营房 / 职员宿舍、食堂、马厩、军械与库房
    QB = ctx.B('quarters')
    for (x0, x1, y0, y1, h, key) in ((44, 112, 38, 50, 13, 'barracks'), (44, 112, 58, 70, 13, 'barracks'), (-40, 26, 56, 72, 11, 'refectory'),
                                     (-112, -66, -58, -46, 8, 'stables'), (-112, -66, -78, -64, 10, 'stores'), (14, 44, -80, -50, 12, 'armoury')):
        quarters(QB, M, x0, x1, y0, y1, h)
        if key in ('refectory', 'armoury'): ctx.anchor('ranges', (x0 + x1) / 2, (y0 + y1) / 2, h + 6)

    # ---- 崖缘晶簇（次于罗斯柴尔德）+ 结界（格边很淡）
    MG = ctx.B('rim_crystals'); rnd = random.Random(53)
    for k in range(26):
        a = rnd.uniform(0, math.tau)
        if abs(math.atan2(math.sin(a - GA), math.cos(a - GA))) < .25: continue
        x, y = S.edge(a, 1.0); C.crystal_cluster(MG, x, y, -1.5, rnd.uniform(4, 8), M['crystal'], seed=k * 11 + 5)
        if k in (4, 17): ctx.anchor('crystal', x * 1.04, y * 1.04, 3)
    K_.ward_dome(S, lambda x, y: tr.h(x * .99, y * .99), .3 * R, M['ward_sc'], ctx.B('ward'))
    ctx.anchor('ward', *S.edge(math.radians(20), 1.03), .27 * R)


# ============================================================ 岛底
def underside(ctx):
    S, R, ox = ctx.S, ctx.S.R, ctx.ox; B = ctx.B('under'); rnd = random.Random(7)
    ms = ctx.m('scarp', lambda: C.ashlar('sc_scarp', (.5, .515, .54), course=1.1, block=2.2, joint=.014, jc=(.34, .35, .37)))
    mr = ctx.m('rock', lambda: K_.rock_v17('sc_rock17', (.6, .62, .65), (.53, .55, .59), .02, moss_amt=0.0, soil_z=400.0, lichen=(.64, .66, .69)))
    ma = ctx.m('alloy', lambda: C.flat('sc_u_steel', (.5, .52, .56), .3, metal=.9))
    me = ctx.m('emit', lambda: C.flat('sc_u_emit', (.6, .95, 1.0), .2, emit=(.35, .9, 1.0), estr=28.0))
    mv = ctx.m('vein', lambda: C.glow('sc_vein', c=(.45, .8, 1.0), estr=5.0))
    mc = ctx.m('ucrystal', lambda: C.flat('sc_u_crystal', (.3, .6, 1.0), .05, emit=(.3, .65, 1.0), estr=1.6))
    mcone = ctx.m('cone', lambda: C.glow('sc_cone', c=(.35, .9, 1.0), estr=1.2, alpha=.12))
    P = S.pts(192); n = len(P)
    top_z = getattr(ctx, 'top_z', lambda x, y: 0.0)
    vs = [(x + ox, y, top_z(x, y)) for x, y in P] + [(x * .99 + ox, y * .99, -SCARP) for x, y in P]
    B.poly(vs, [((i + 1) % n, i, n + i, n + (i + 1) % n) for i in range(n)], ms)                      # 护坡：岛缘顶高 → -SCARP（方石）
    B.strip([(x * 1.003 + ox, y * 1.003, -SCARP + .4) for x, y in P + P[:1]], 1.2, .8, ms)       # 护坡脚的束带
    vs = [(x * .99 + ox, y * .99, -SCARP) for x, y in P] + [(x * .97 + ox, y * .97, -CLIFF) for x, y in P]
    B.poly(vs, [((i + 1) % n, i, n + i, n + (i + 1) % n) for i in range(n)], mr)                      # 岩崖：-SCARP → -CLIFF
    # 倒金字塔岩座：轮廓在 0.1R 深度内并成锐角矩形，再线性收到锥尖（四棱锐利、面平）
    ca = corner_angles(S); cx = [S.edge(a, .97) for a in ca]
    hx = sum(abs(p[0]) for p in cx) / 4; hy = sum(abs(p[1]) for p in cx) / 4
    rect = lambda a: 1.0 / max(abs(math.cos(a)) / hx, abs(math.sin(a)) / hy)
    D = .95 * R; zs = [-CLIFF - D * k / 24 for k in range(25)]; RS = []
    for k, z in enumerate(zs[:-1]):
        d = (-CLIFF - z) / R; t = min(1.0, d / .1); s = 1 - (-CLIFF - z) / D
        row = []
        for (x, y) in P:
            a = math.atan2(y, x); r0 = math.hypot(x, y) * .97; r1 = rect(a); r = (r0 * (1 - t) + r1 * t) * s
            r *= 1 + (.012 * math.sin(z * .9 + a * 3) if k else 0)          # 淡层理：面基本平
            row.append((math.cos(a) * r + ox, math.sin(a) * r))
        RS.append((row, z))
    K_.loft(B, RS, mr, apex=(ox, 0.0, zs[-1]), smooth=False)
    zp = -CLIFF - D * .4; kp = (1 - .4) * 1.06; ctx.anchor('u_plinth', ox, -hy * kp, zp)
    B.cyl(ox, 0, zs[-1] - 1.5, 5.0, 6.0, ma, 16, r2=2.0); B.cyl(ox, 0, zs[-1] - 1.8, 3.0, .6, me, 16)       # 锥尖钢帽
    # 四棱：导能脉 + 悬浮发射器（四角四核）
    MC = ctx.B('mist_cones')
    for q, a in enumerate(ca):
        edge = []
        for (row, z) in RS:
            i = min(range(n), key=lambda j: abs(math.atan2(math.sin(math.atan2(row[j][1], row[j][0] - ox) - a), math.cos(math.atan2(row[j][1], row[j][0] - ox) - a))))
            edge.append((row[i][0] * 1.004 - ox * .004, row[i][1] * 1.004, z))
        B.strip(edge[1:], 1.4, .6, mv)
        ex, ey, ez = edge[5]; ez -= 4.0
        B.cyl(ex, ey, ez + 1.0, 4.0, 6.0, ma, 20, r2=5.5); B.cyl(ex, ey, ez - .6, 8.5, 1.6, ma, 32)
        B.cyl(ex, ey, ez - 1.0, 7.2, .5, me, 32); B.cyl(ex, ey, ez - 1.1, 5.2, .4, me, 32); B.cyl(ex, ey, ez - 1.6, 2.4, 1.0, me, 16, r2=1.2)
        B.sphere(ex, ey, ez - 3.4, 2.2, me, seg=16, rings=8)
        if ctx.clay is None: MC.cyl(ex, ey, ez - 46.0, 16.0, 45.0, mcone, 32, r2=7.0, cap=False)
        ctx.anchor('u_launcher', ex, ey, ez); ctx.anchor('u_core', ex, ey, ez - 3.4)
        for j in range(2):                                               # 核附近的下垂晶簇
            e2 = edge[7 + j * 3]; C.crystal_cluster(B, e2[0], e2[1], e2[2], R * rnd.uniform(.04, .07), mc, seed=q * 10 + j, down=True)


if __name__ == '__main__':
    import types; K_.run(types.SimpleNamespace(**globals()))
