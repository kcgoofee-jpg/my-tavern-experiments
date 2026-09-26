# 伊甸府邸（伊甸庄园主楼）· Blender 模型：新古典白石府邸，外观 + 按层剖切。
# 楼层、房间与尺寸依据 docs/eden-estate.md（多为推断，出处见该文档）；硬约束：只建中性建筑与普通家具。
#
# 两种用法：
#   1) 上层底图里调用：build_eden_manor(layer, center=(x, y, z), rot=弧度, scale=.01)   # 模型单位是米，上层 1 单位 = 100 m
#   2) 独立出图（等轴正交相机）：
#      blender -b -P blender/eden_manor.py -- --floor F1 --res 2000 --samples 32 --out docs/drafts/eden_manor_f1.png
#      --floor ext（默认，外观）| F1 … F5（剖切：切掉该层以上，墙截到约 1.2 m，显示房间地面与中性家具）
#
# 平面（米，府邸中心为原点，正面朝 -y，即前庭 / 访客停靠方向）：
#   中央主楼 x ±20、y ±22，F1–F4（18 m），屋顶平台上是 F5 眺望亭（圆形鼓座 + 穹顶 + 灯亭）；
#   左右两翼 x 20–54、y ±16，F1–F3（13.5 m），平屋顶 + 栏杆女儿墙；
#   正面巨柱式柱廊（6 柱，贯通三层）+ 山花；背面台阶下到后庭。
import bpy, bmesh, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tc_common as tc
from mathutils import Matrix, Vector

FH = 4.5                                   # 层高（米）
LV = {'F1': 0.0, 'F2': 4.5, 'F3': 9.0, 'F4': 13.5, 'F5': 18.85}   # F5 = 中央屋顶平台面
CUT = 1.2                                  # 剖切后留下的墙高
C_BLK = (-20, 20, -22, 22)                 # 中央主楼（x0, x1, y0, y1）
L_BLK = (-54, -20, -16, 16)                # 左翼
R_BLK = (20, 54, -16, 16)                  # 右翼
BLOCKS = [(C_BLK, 18.0), (L_BLK, 13.5), (R_BLK, 13.5)]
DRUM = (0.0, -2.0, 7.0)                    # F5 眺望亭：圆心 x、y，半径

# 房间：(名称, 类型, x0, x1, y0, y1)。类型决定地面材料与家具；中性房间只放普通家具
ROOMS = {
    'F1': [('大厅', 'hall', -20, 20, -22, 4), ('仆从值班室', 'staff', -20, -2, 4, 22), ('楼梯电梯前厅', 'lobby', -2, 20, 4, 22),
           ('餐厅', 'dining', -53, -21, -15, 15), ('会客厅', 'reception', 21, 53, -15, 15)],
    'F2': [('大厅上空', 'void', -20, 20, -22, 4), ('起居茶室', 'lounge', -20, -2, 4, 22), ('楼梯电梯前厅', 'lobby', -2, 20, 4, 22),
           ('书房', 'study', -53, -29, -12, 8), ('二层廊', 'corridor', -29, -21, -15, 15), ('客房 A', 'guest', 21, 53, -15, 0), ('客房 B', 'guest', 21, 53, 0, 15)],
    'F3': [('廊厅', 'gallery', -20, 20, -22, 4), ('私人通道厅', 'lobby', -20, -2, 4, 22), ('楼梯电梯前厅', 'lobby', -2, 20, 4, 22),
           ('主卧', 'master', -53, -32, -15, 15), ('更衣室', 'dressing', -32, -21, -15, 0), ('浴室', 'bath', -32, -21, 0, 15),
           ('私人房间 A', 'private', 21, 41, -8, 8), ('三层廊', 'corridor', 41, 53, -15, 15)],
    'F4': [('女仆长办公室', 'office', -20, -4, -22, -8), ('附属用房', 'annex', -20, 0, -8, 8), ('洗衣 / 储藏', 'laundry', 2, 20, -22, -8),
           ('监控室', 'monitor', 6, 20, -8, 4), ('四层廊', 'corridor', 0, 6, -8, 4), ('楼梯电梯前厅', 'lobby', -2, 20, 4, 22), ('后廊', 'corridor', -20, -2, 8, 22)],
    'F5': [('私人电梯厅', 'lift', -7, 7, -9, 5)],
}
SHAFTS = [('主楼梯', 'stair', 4, 12, 12, 20, 'F1 F2 F3 F4 F5'), ('电梯', 'lift', 14, 18, 14, 19, 'F1 F2 F3 F4 F5'),
          ('主人通道', 'master', -6, -2, 16, 20, 'F1 F3 F5')]
FLOORMAT = {'hall': 'marble', 'lobby': 'marble', 'gallery': 'marble', 'corridor': 'marble', 'lift': 'marble',
            'dining': 'parquet', 'reception': 'parquet', 'lounge': 'parquet', 'study': 'parquet', 'guest': 'parquet', 'master': 'parquet',
            'private': 'parquet', 'office': 'parquet', 'dressing': 'parquet', 'annex': 'lino', 'staff': 'lino', 'laundry': 'tile', 'bath': 'tile', 'monitor': 'lino'}

def _mats():
    M = {
        'stone': tc.noise_mat('em_stone', (.80, .78, .73), (.88, .86, .81), 90, .75, .04),     # 白石（略暖）
        'stone2': tc.noise_mat('em_stone2', (.72, .70, .66), (.80, .78, .73), 60, .8, .08),   # 底层粗面石 / 台基
        'trim': tc.mat('em_trim', (.92, .91, .88), .6),                                         # 檐口、窗套、柱
        'roof': tc.noise_mat('em_roof', (.46, .47, .48), (.53, .54, .55), 40, .7, .05),        # 铅灰屋面
        'glass': tc.mat('em_glass', (.08, .11, .14), .08, metal=.3, spec=.9),
        'gold': tc.mat('em_gold', (.72, .55, .24), .3, metal=1),
        'marble': tc.noise_mat('em_marble', (.83, .82, .80), (.93, .92, .90), 14, .25, .0),
        'parquet': tc.noise_mat('em_parquet', (.36, .23, .13), (.47, .31, .18), 55, .5, .02),
        'tile': tc.noise_mat('em_tile', (.72, .76, .78), (.80, .83, .85), 30, .4, .0),
        'lino': tc.noise_mat('em_lino', (.56, .56, .54), (.62, .62, .60), 30, .6, .0),
        'wall_in': tc.mat('em_wall_in', (.86, .83, .76), .8),                                     # 室内墙（奶油色抹灰）
        'wood': tc.mat('em_wood', (.30, .19, .11), .5),                                           # 家具木作
        'fabric': tc.mat('em_fabric', (.55, .50, .44), .9),                                       # 沙发、床品（中性米灰）
        'fabric2': tc.mat('em_fabric2', (.24, .30, .36), .9),                                     # 深蓝灰软装
        'rug': tc.noise_mat('em_rug', (.42, .20, .16), (.52, .30, .22), 8, .95, .0),
        'metal': tc.mat('em_metal', (.35, .36, .38), .4, metal=.8),
        'screen': tc.mat('em_screen', (.05, .07, .09), .2),
        'water': tc.mat('em_water', (.10, .22, .28), .05, spec=.9),
        'plant': tc.mat('em_plant', (.10, .22, .08), .9),
        'shaft_stair': tc.mat('em_shaft_stair', (.78, .52, .25), .7), 'shaft_lift': tc.mat('em_shaft_lift', (.28, .55, .60), .5),
        'shaft_master': tc.mat('em_shaft_master', (.45, .35, .60), .6),
    }
    return M

class _B:
    """按材料分批的几何收集器（tc.Batch），最后挂到一个空物体下统一平移、旋转、缩放。"""
    def __init__(self, M): self.M, self.b = M, {}
    def __call__(self, key, smooth=False):
        if key not in self.b: self.b[key] = tc.Batch('eden_' + key, self.M[key], smooth)
        return self.b[key]
    def done(self, parent):
        obs = []
        for bb in self.b.values():
            o = bb.done(); o.parent = parent; obs.append(o)
        return obs

def _walls(B, key, x0, x1, y0, y1, z0, h, t=.6, gaps=()):
    """矩形四面墙；gaps = [(边 'S'/'N'/'W'/'E', 中心坐标, 宽)] 开门洞。"""
    def seg(a0, a1, fixed, horiz, side):
        cuts = sorted((c - w / 2, c + w / 2) for s, c, w in gaps if s == side)
        cur = a0
        for c0, c1 in cuts + [(a1, a1)]:
            if c0 > cur + .05:
                L, mid = c0 - cur, (cur + c0) / 2
                if horiz: B(key).box(mid, fixed, z0, L, t, h)
                else: B(key).box(fixed, mid, z0, t, L, h)
            cur = max(cur, c1)
    seg(x0, x1, y0, True, 'S'); seg(x0, x1, y1, True, 'N'); seg(y0, y1, x0, False, 'W'); seg(y0, y1, x1, False, 'E')

def _balustrade(B, pts, z, h=1.1, step=.55, closed=True):
    """栏杆：底座条 + 宝瓶柱（小方柱）+ 扶手。pts 为折线顶点。"""
    n = len(pts)
    for i in range(n if closed else n - 1):
        (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]
        L = math.hypot(bx - ax, by - ay); ang = math.atan2(by - ay, bx - ax); mx, my = (ax + bx) / 2, (ay + by) / 2
        B('trim').box(mx, my, z, L + .3, .5, .18, ang); B('trim').box(mx, my, z + h - .16, L + .3, .45, .16, ang)
        k = max(1, int(L / step))
        for j in range(1, k):
            f = j / k; B('trim').box(ax + (bx - ax) * f, ay + (by - ay) * f, z + .18, .2, .2, h - .34, ang)

def _rect(x0, x1, y0, y1): return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

def _windows(B, blk, z_top, bay=4.2, skip=()):
    """立面窗：每层每开间一扇（深色玻璃 + 白色窗套 + 窗楣），底层是半圆拱意象的高窗。skip = [(x0, x1, 边)] 不开窗的段（柱廊后）。"""
    x0, x1, y0, y1 = blk
    for side, (a0, a1, fixed, horiz, out) in {'S': (x0, x1, y0, True, -1), 'N': (x0, x1, y1, True, 1),
                                              'W': (y0, y1, x0, False, -1), 'E': (y0, y1, x1, False, 1)}.items():
        L = a1 - a0; n = max(1, int((L - 3) / bay))
        for k in range(n):
            a = a0 + (k + .5) * L / n
            if any(s == side and s0 <= a <= s1 for s0, s1, s in skip): continue
            for fz in range(int(z_top // FH + .01)):
                zb = fz * FH + (1.0 if fz else .8); wh = 2.6 if fz else 3.0
                off = fixed + out * .32
                if horiz:
                    B('glass').box(a, off, zb, 1.5, .1, wh); B('trim').box(a, off + out * .06, zb - .25, 2.1, .3, .25)
                    B('trim').box(a, off + out * .06, zb + wh, 2.2, .35, .35)                              # 窗楣
                    for s in (-1, 1): B('trim').box(a + s * .9, off + out * .04, zb, .22, .2, wh)
                else:
                    B('glass').box(off, a, zb, .1, 1.5, wh); B('trim').box(off + out * .06, a, zb - .25, .3, 2.1, .25)
                    B('trim').box(off + out * .06, a, zb + wh, .35, 2.2, .35)
                    for s in (-1, 1): B('trim').box(off + out * .04, a + s * .9, zb, .2, .22, wh)

def _block_exterior(B, blk, h, cut_z=None, hole=None):
    """一个体块的外观：实心墙体（剖切时只到 cut_z）、底层粗面石、层间腰线、檐口、女儿墙栏杆、屋面。"""
    x0, x1, y0, y1 = blk; top = h if cut_z is None else cut_z
    cx, cy, w, d = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
    if cut_z is None:
        B('stone').box(cx, cy, FH, w, d, h - FH)
        B('stone2').box(cx, cy, 0, w + .2, d + .2, FH)                                               # 底层粗面石
        for fz in range(1, int(h // FH + .01)): _band(B, blk, fz * FH - .15)                          # 腰线
        B('trim').box(cx, cy, h, w + 1.6, d + 1.6, .7)                                                # 檐口
        B('roof').box(cx, cy, h + .7, w - .8, d - .8, .15)                                            # 屋面
        _balustrade(B, _rect(x0 - .4, x1 + .4, y0 - .4, y1 + .4), h + .7)
        if blk != C_BLK: _hip_roof(B, x0 + 1.6, x1 - 1.6, y0 + 1.6, y1 - 1.6, h + .85, 4.0)            # 两翼：藏在栏杆后的低坡铅皮四坡顶 + 烟囱
        else: _terrace(B, blk, h + .85)
    else:
        lo = cut_z - CUT                                                                              # 剖切层的地坪
        if lo > 0:                                                                                    # 下面几层只建外壳（空心），大厅上空才看得见楼下
            _walls(B, 'stone2', x0, x1, y0, y1, 0, min(FH, lo), .8)
            if lo > FH: _walls(B, 'stone', x0, x1, y0, y1, FH, lo - FH, .6)
            for fz in range(1, int(lo // FH + .01) + 1):
                if fz * FH < lo - .1: _band(B, blk, fz * FH - .15)
        # 剖切层：整块地台（顶面比外墙高 1 cm，不和墙顶共面）+ 外墙截到 1.2 m；体块相接的那面开一道 3 m 的门
        if hole and blk == C_BLK:                                                                     # 大厅挑空：地台只铺在挑空以外
            hy = hole[3]; B('lino').box(cx, (hy + y1) / 2, lo - .35, w, y1 - hy, .36)
        else: B('lino').box(cx, cy, lo - .35, w, d, .36)
        j = [('E', 0, 99)] if blk == L_BLK else [('W', 0, 99)] if blk == R_BLK else [('W', 0, 3), ('E', 0, 3), ('S', 0, 4)]   # 翼楼与主楼相接的那面墙由主楼出（不重叠），主楼在接缝处开 3 m 门
        _walls(B, 'stone', x0, x1, y0, y1, lo, CUT, .6, j)
    return top

def _band(B, blk, z, t=.3, h=.3):
    """沿外墙一圈的腰线（只是一圈边，不是整块板）。"""
    x0, x1, y0, y1 = blk; w, d = x1 - x0, y1 - y0
    B('trim').box((x0 + x1) / 2, y0, z, w + .5, .6 + t, h); B('trim').box((x0 + x1) / 2, y1, z, w + .5, .6 + t, h)
    B('trim').box(x0, (y0 + y1) / 2, z, .6 + t, d + .5, h); B('trim').box(x1, (y0 + y1) / 2, z, .6 + t, d + .5, h)

def _hip_roof(B, x0, x1, y0, y1, z, ht):
    """四坡顶（屋脊沿长边）+ 两组烟囱。"""
    bm = B('roof').bm; w, d = x1 - x0, y1 - y0; cy = (y0 + y1) / 2; inset = d / 2
    vs = [bm.verts.new(v) for v in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), (x0 + inset, cy, z + ht), (x1 - inset, cy, z + ht))]
    for f in ((0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)): bm.faces.new([vs[i] for i in f])
    for sx in (.3, .7):
        x = x0 + w * sx
        for sy in (-1, 1): B('stone').box(x, cy + sy * d * .22, z, 1.4, 2.8, ht * .55 + 2.2); B('trim').box(x, cy + sy * d * .22, z + ht * .55 + 2.2, 1.7, 3.1, .35)

def _terrace(B, blk, z):
    """中央屋顶平台：石板分格、四周花槽。"""
    x0, x1, y0, y1 = blk
    for gx in range(int(x0) + 4, int(x1), 4): B('trim').box(gx, (y0 + y1) / 2, z - .02, .12, y1 - y0 - 2, .03)
    for gy in range(int(y0) + 4, int(y1), 4): B('trim').box((x0 + x1) / 2, gy, z - .02, x1 - x0 - 2, .12, .03)
    for k in range(4):
        for sy in (y0 + 1.6, y1 - 1.6):
            x = x0 + 5 + k * (x1 - x0 - 10) / 3; B('stone2').box(x, sy, z, 3.2, 1.2, .7); B('plant', smooth=True).ico(x, sy, z + .9, .75, sz=.7, sub=2)

def _portico(B, h=13.5):
    """正面巨柱式柱廊：6 根柱贯通三层，山花三角楣，台阶。"""
    y = -28.5
    for k in range(6):
        x = -12.5 + k * 5
        B('trim').cyl(x, y, .6, .85, h - 1.4, seg=20); B('trim').box(x, y, 0, 2.1, 2.1, .6); B('trim').box(x, y, h - .8, 2.1, 2.1, .8)   # 柱身、柱础、柱头
    B('trim').box(0, -25.5, h, 31, 8, 1.2)                                                            # 额枋
    B('stone').box(0, -25, 0, 31, 7, .6)                                                              # 柱廊地坪
    for s in range(4): B('stone2').box(0, -29.5 - s * 1.1, 0, 34 + s * 2, 1.1, .6 - s * .15)          # 台阶
    # 山花：三棱柱（坡屋面沿 y 方向，斜面朝上）
    bm = B('roof').bm; ht = 4.2; z = h + 1.2
    vs = [bm.verts.new(v) for v in ((-15.5, -29.5, z), (15.5, -29.5, z), (0, -29.5, z + ht), (-15.5, -21.5, z), (15.5, -21.5, z), (0, -21.5, z + ht))]
    for f in ((0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (1, 4, 5, 2)): bm.faces.new([vs[i] for i in f])
    B('trim').box(0, -29.7, z, 31.5, .4, .5)                                                          # 山花底檐

def _belvedere(B, open_top=True):
    """F5 眺望亭：圆形鼓座（私人电梯厅）+ 穹顶 + 灯亭 + 金色顶饰。"""
    x, y, r = DRUM
    B('stone').cyl(x, y, 18.85, r, 4.0, seg=48)
    for k in range(16):                                                                               # 鼓座壁柱
        a = k / 16 * 2 * math.pi; B('trim').box(x + math.cos(a) * (r + .15), y + math.sin(a) * (r + .15), 18.85, .5, .5, 4.0, a)
    B('trim').cyl(x, y, 22.85, r + .6, .5, seg=48)                                                   # 鼓座檐口
    if open_top:
        B('roof', smooth=True).ico(x, y, 23.2, r * .98, sz=.78, sub=4)                              # 穹顶（下半在鼓座里）
        B('trim').cyl(x, y, 23.2 + r * .76, 1.3, 2.2, seg=16); B('roof').cyl(x, y, 23.2 + r * .76 + 2.2, 1.5, .3, seg=16, r2=.2)
        B('gold').ico(x, y, 23.2 + r * .76 + 2.9, .45, sub=2)

# ---------------- 家具（中性）----------------
def _furnish(B, kind, x0, x1, y0, y1, z):
    cx, cy, w, d = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
    def sofa_set(x, y, rot=0):
        c, s = math.cos(rot), math.sin(rot); P = lambda dx, dy: (x + dx * c - dy * s, y + dx * s + dy * c)
        B('rug').box(x, y, z, 6, 4.6, .03, rot)
        px, py = P(0, -1.6); B('fabric').box(px, py, z, 3.2, .95, .8, rot)
        for sx in (-2.1, 2.1): px, py = P(sx, 0); B('fabric').box(px, py, z, .95, .95, .8, rot)
        px, py = P(0, 0); B('wood').box(px, py, z, 1.6, .9, .42, rot)
    def bed(x, y, big=False, rot=0):
        bw, bl = (2.4, 2.4) if big else (1.8, 2.2); c, s = math.cos(rot), math.sin(rot)
        B('wood').box(x, y, z, bw + .2, bl + .2, .45, rot); B('fabric').box(x, y, z + .45, bw, bl, .2, rot)
        hx, hy = x - (bl / 2 + .1) * -s, y + -(bl / 2 + .1) * c
        B('wood').box(hx, hy, z, bw + .3, .15, 1.3, rot)                                              # 床头板
        for sx in (-1, 1): B('wood').box(x + sx * (bw / 2 + .5) * c - (-(bl / 2 - .3)) * s, y + sx * (bw / 2 + .5) * s + (-(bl / 2 - .3)) * c, z, .5, .45, .55, rot)
    def shelves_along(side, n=None):
        if side in 'NS':
            yy = y1 - .35 if side == 'N' else y0 + .35; L = w - 2
            B('wood').box(cx, yy, z, L, .45, 2.2)
        else:
            xx = x1 - .35 if side == 'E' else x0 + .35; L = d - 2
            B('wood').box(xx, cy, z, .45, L, 2.2)
    def plant(x, y): B('wood').cyl(x, y, z, .35, .5, seg=10); B('plant', smooth=True).ico(x, y, z + 1.0, .55, sub=1)
    if kind == 'hall':
        B('rug').box(cx, cy - 2, z, 14, 9, .03)
        B('wood').cyl(cx, cy - 2, z, 1.6, .8, seg=24)                                                 # 中央圆桌（花台）
        B('plant', smooth=True).ico(cx, cy - 2, z + 1.1, .8, sub=2)
        for sx in (-1, 1):
            for yy in (y0 + 4, y1 - 4): B('trim').box(cx + sx * 12, yy, z, 1.2, 1.2, 1.1); B('stone', smooth=True).ico(cx + sx * 12, yy, z + 1.8, .6, sz=1.3, sub=2)   # 雕像（台座 + 抽象体块）
            B('fabric').box(cx + sx * 7, cy - 2, z, 1.0, 4.5, .5)                                     # 长凳
    elif kind == 'dining':
        B('rug').box(cx, cy, z, 8, w - 6, .03, math.pi / 2)
        B('wood').box(cx, cy, z, 3.2, d - 10, .78)                                                    # 长餐桌
        n = int((d - 12) / 1.3)
        for k in range(n):
            yy = y0 + 6 + (k + .5) * (d - 12) / n
            for sx in (-1, 1): B('fabric2').box(cx + sx * 2.2, yy, z, .55, .55, .95)
        for yy in (y0 + 3.2, y1 - 3.2): B('fabric2').box(cx, yy, z, .6, .6, 1.1)
        for sx in (-1, 1): B('wood').box(cx + sx * (w / 2 - 1), cy, z, .6, d - 8, 1.0)                # 餐边柜
    elif kind == 'reception':
        sofa_set(cx - 7, cy - 6); sofa_set(cx + 7, cy - 6); sofa_set(cx, cy + 7, math.pi)
        B('wood').box(x1 - 4, y1 - 4, z, 1.6, 2.3, 1.0, .3)                                           # 三角钢琴的体量（简化）
        plant(x0 + 2, y0 + 2); plant(x1 - 2, y0 + 2)
    elif kind in ('lounge',):
        sofa_set(cx - 3, cy - 2); B('wood').cyl(cx + 5, cy + 4, z, 1.1, .75, seg=20)
        for a in range(4): B('fabric').box(cx + 5 + 1.8 * math.cos(a * math.pi / 2), cy + 4 + 1.8 * math.sin(a * math.pi / 2), z, .6, .6, .9)
        shelves_along('W'); plant(x1 - 2, y1 - 2)
    elif kind == 'study':
        B('rug').box(cx, cy, z, 9, 7, .03); B('wood').box(cx, cy - 2, z, 3.6, 1.8, .78); B('fabric2').box(cx, cy - 3.4, z, .8, .8, 1.1)
        for sd in 'NWE': shelves_along(sd)
        sofa_set(cx, cy + 4.5, math.pi); B('metal', smooth=True).ico(x1 - 2.5, y0 + 2.5, z + 1.1, .45, sub=2); B('wood').cyl(x1 - 2.5, y0 + 2.5, z, .25, .7, seg=8)
    elif kind == 'guest':
        bed(cx - 3, cy); B('wood').box(x1 - 1, cy, z, .6, 2.4, 2.1); B('wood').box(cx + 5, y0 + 1.5, z, 1.6, .7, .76); B('fabric').box(cx + 5, y0 + 2.4, z, .6, .6, .9)
        B('fabric').box(cx + 3, cy + 3, z, 1.0, 1.0, .85); plant(x0 + 1.5, y1 - 1.5)
    elif kind == 'master':
        B('rug').box(cx, cy + 1, z, 8, 7, .03); bed(cx, cy + 3, big=True); sofa_set(cx, y0 + 5)
        B('wood').box(x0 + 1.2, cy, z, .6, 5, 2.1); B('wood').box(x1 - 2, y0 + 2, z, 1.8, .8, .76)
    elif kind == 'dressing':
        B('wood').box(x0 + .4, cy, z, .6, d - 1.5, 2.3); B('wood').box(x1 - .4, cy, z, .6, d - 1.5, 2.3); B('wood').box(cx, cy, z, 1.4, d * .45, .9)
    elif kind == 'bath':
        B('trim').box(cx, cy + 2, z, 1.9, 3.6, .6); B('water').box(cx, cy + 2, z + .45, 1.5, 3.2, .1)       # 浴缸
        B('trim').box(x1 - .5, cy - 3, z, .6, 3.4, .9); B('glass').box(x0 + 1.8, y0 + 1.8, z, 2.6, 2.6, .05)
    elif kind == 'private':
        bed(cx - 3, cy + 1); sofa_set(cx + 4, cy - 3); B('wood').box(x1 - .8, cy + 3, z, .6, 3, 2.1); shelves_along('S')
    elif kind == 'gallery':
        for k in range(5):
            x = x0 + 4 + k * (w - 8) / 4; B('trim').box(x, cy, z, 1.0, 1.0, 1.1); B('stone', smooth=True).ico(x, cy, z + 1.7, .5, sz=1.4, sub=2)
            B('fabric').box(x, cy + 3.5, z, 2.2, .7, .45)
        for sd in ('S',): B('wood').box(cx, y0 + .5, z + 1.2, w - 6, .12, 1.4)                          # 画框（贴南墙的长条）
    elif kind == 'staff':
        B('wood').box(cx, cy, z, 6, 1.6, .76)
        for sx in (-2, 0, 2):
            for sy in (-1.2, 1.2): B('fabric2').box(cx + sx, cy + sy, z, .5, .5, .9)
        B('metal').box(x0 + .4, cy, z, .5, d - 4, 1.9)                                               # 储物柜
    elif kind == 'office':
        B('wood').box(cx, cy, z, 2.8, 1.4, .76); B('fabric2').box(cx, cy - 1.2, z, .6, .6, 1.0); B('metal').box(x1 - .4, cy, z, .5, d - 3, 1.5)
        for sx in (-1, 1): B('fabric').box(cx + sx * .9, cy + 1.6, z, .6, .6, .9)
    elif kind == 'annex':
        for k in range(3): B('wood').box(x0 + 3 + k * 5, cy + 4, z, 4, .6, 2.0)
        B('wood').box(cx, cy - 3, z, 4, 1.8, .76)
        for sx in (-1.2, 0, 1.2): B('fabric').box(cx + sx, cy - 4.4, z, .5, .5, .9)
    elif kind == 'laundry':
        for k in range(6): B('metal').box(x0 + 2 + k * 1.1, y1 - 1, z, .9, .9, 1.0)
        B('wood').box(cx, cy - 1, z, 5, 1.4, .9); B('wood').box(x1 - .5, cy, z, .6, d - 3, 2.0)
    elif kind == 'monitor':
        B('wood').box(cx, cy, z, 6, 1.4, .76)
        for k in range(4): B('screen').box(cx - 2.25 + k * 1.5, cy + .45, z + .76, 1.3, .1, .8)
        for k in range(3): B('fabric2').box(cx - 1.5 + k * 1.5, cy - 1.2, z, .6, .6, 1.0)
        B('metal').box(x1 - .6, y1 - 2, z, .8, 2.5, 2.0)
    elif kind == 'lobby':
        B('fabric').box(cx - 3, cy - 3, z, 3, .8, .5); plant(x0 + 1.5, y0 + 1.5); plant(x1 - 1.5, y0 + 1.5)
    elif kind == 'corridor':
        B('rug').box(cx, cy, z, w * .5 if w < d else w - 2, d - 2 if w < d else d * .5, .03)
    elif kind == 'lift':
        B('fabric').box(0, -6.5, z, 4, .8, .5); plant(-4.5, 2.5); plant(4.5, 2.5)

def _stairs(B, x0, x1, y0, y1, z, rise=FH):
    """双跑楼梯：两段踏步 + 中间平台（看得出是楼梯即可）。"""
    n = 12; half = (x1 - x0) / 2
    for k in range(n):
        B('marble').box(x0 + half / 2, y0 + .5 + k * (y1 - y0 - 1.5) / n, z, half - .2, (y1 - y0 - 1.5) / n + .02, (k + 1) * rise / 2 / n)
        B('marble').box(x1 - half / 2, y1 - 1.5 - k * (y1 - y0 - 1.5) / n, z, half - .2, (y1 - y0 - 1.5) / n + .02, rise / 2 + (k + 1) * rise / 2 / n)
    B('marble').box((x0 + x1) / 2, y1 - .75, z, x1 - x0, 1.5, rise / 2)                              # 休息平台

def _floor_plan(B, fl):
    """剖切层：房间地面（按类型的材料）、内隔墙（1.2 m，带门洞）、家具、竖井。"""
    z = LV[fl] + .02
    for name, kind, x0, x1, y0, y1 in ROOMS[fl]:
        if kind == 'void':                                                                            # 大厅上空：显示下面一层的大厅，四周是栏杆
            B('marble').box((x0 + x1) / 2, (y0 + y1) / 2, 0, x1 - x0, y1 - y0, .05); _furnish(B, 'hall', x0, x1, y0, y1, .05)
            _balustrade(B, _rect(x0 + 2.5, x1 - 2.5, y0 + 2.5, y1 - .5), z)
            for (a0, a1, b0, b1) in ((x0, x1, y0, y0 + 2.5), (x0, x1, y1 - .5, y1), (x0, x0 + 2.5, y0, y1), (x1 - 2.5, x1, y0, y1)):
                B('marble').box((a0 + a1) / 2, (b0 + b1) / 2, z - .3, a1 - a0, b1 - b0, .3)        # 回廊
            continue
        if kind == 'lift': _furnish(B, kind, x0, x1, y0, y1, z); continue                         # F5 私人电梯厅在圆形鼓座里（墙另建）
        B(FLOORMAT.get(kind, 'marble')).box((x0 + x1) / 2, (y0 + y1) / 2, z - .3, x1 - x0, y1 - y0, .3)
        gaps = [(s, c, 1.8) for s, c in (('S', (x0 + x1) / 2), ('N', (x0 + x1) / 2), ('W', (y0 + y1) / 2), ('E', (y0 + y1) / 2))]
        _walls(B, 'wall_in', x0 + .15, x1 - .15, y0 + .15, y1 - .15, z, CUT, .25, gaps)   # 各房间的墙往里收一点：相邻房间的墙并排，不重叠
        _furnish(B, kind, x0, x1, y0, y1, z)
    for name, kind, x0, x1, y0, y1, fls in SHAFTS:
        if fl not in fls.split(): continue
        key = {'stair': 'shaft_stair', 'lift': 'shaft_lift', 'master': 'shaft_master'}[kind]
        _walls(B, key, x0, x1, y0, y1, z, CUT + .3, .3, [('S', (x0 + x1) / 2, 1.6)])
        if kind == 'stair' and fl != 'F5': _stairs(B, x0 + .3, x1 - .3, y0 + .3, y1 - .3, z)
        else: B(key).box((x0 + x1) / 2, (y0 + y1) / 2, z, x1 - x0 - .7, y1 - y0 - .7, .05)

def build_eden_manor(layer, center=(0, 0, 0), rot=0.0, scale=1.0, cutaway=None):
    """建伊甸府邸。center、rot、scale：放进场景的位置、朝向（弧度，0 = 正面朝 -y）与比例（米 → 场景单位）。
    cutaway：None = 完整外观；'F1'…'F5' = 切掉该层以上，墙截到 1.2 m，显示该层房间与家具。返回根空物体。"""
    col = layer.col if layer is not None else bpy.context.scene.collection
    root = bpy.data.objects.new('eden_manor', None); col.objects.link(root)
    root.location = center; root.rotation_euler = (0, 0, rot); root.scale = (scale, scale, scale)
    B = _B(_mats())
    if cutaway is None:
        for blk, h in BLOCKS:
            skip = [(-15.5, 15.5, 'S')] if blk == C_BLK else []
            _block_exterior(B, blk, h); _windows(B, blk, h, skip=skip)
        _portico(B); _belvedere(B)
        _balustrade(B, _rect(-20.4, 20.4, -22.4, 22.4), 18.85)                                       # 中央屋顶平台栏杆（F5 露台）
        for s in range(5): B('stone2').box(0, 22.8 + s * 1.2, 0, 24 - s * 1.2, 1.2, 1.0 - s * .2)       # 背面台阶（下到后庭）
    else:
        k = int(cutaway[1]); cz = LV[cutaway] + CUT
        for blk, h in BLOCKS:
            hole = next(((r[2], r[3], r[4], r[5]) for r in ROOMS[cutaway] if r[1] == 'void'), None)
            if LV[cutaway] < h - .1: _block_exterior(B, blk, h, cut_z=cz, hole=hole); _windows(B, blk, LV[cutaway], skip=[(-15.5, 15.5, 'S')] if blk == C_BLK else [])
            else: _block_exterior(B, blk, h); _windows(B, blk, h, skip=[(-15.5, 15.5, 'S')] if blk == C_BLK else [])   # 该层以下已到顶的体块（两翼在 F4、F5 时）保持完整
        if cutaway == 'F5':                                                                            # 屋顶平台（中央体块已按完整外观建到檐口与栏杆）
            x, y, r = DRUM; B('marble').cyl(x, y, 18.85, r - .4, .05, seg=48)
            bm = B('stone')
            for a in range(48):                                                                        # 鼓座墙截到 1.2 m，南侧开门
                a0 = a / 48 * 2 * math.pi
                if abs(math.cos(a0 + math.pi / 2)) > .97 and math.sin(a0) < 0: continue
                bm.box(x + math.cos(a0) * r, y + math.sin(a0) * r, 18.85, 1.0, .5, CUT, a0 + math.pi / 2)
            for k2 in range(6): B('fabric').box(-14 + k2 * 5.6, -18, 18.9, .8, 2.0, .35)                 # 露台躺椅
            for sx in (-1, 1): B('plant', smooth=True).ico(sx * 16, 16, 19.6, 1.0, sub=2); B('wood').box(sx * 16, 16, 18.85, 1.4, 1.4, .6)
        _floor_plan(B, cutaway)
    obs = B.done(root)
    return root

# ---------------- 独立出图 ----------------
def _standalone():
    opt = tc.parse_args({'--floor': 'ext', '--res': '2000', '--samples': '32', '--out': os.path.join(tc.HERE, '..', 'docs', 'drafts', 'eden_manor_ext.png')})
    fl = str(opt['--floor']); fl = None if fl in ('ext', 'exterior') else fl.upper()
    rng, sc, col = tc.setup()
    class L: pass
    L.col = col
    build_eden_manor(L, (0, 0, 0), 0.0, 1.0, fl)
    # 场地：府邸所在的台地（前庭铺装、两侧草坪、后庭台阶下的水面一角），只作为草稿底座
    Mg = {'lawn': tc.noise_mat('lawn', (.20, .33, .11), (.27, .40, .15), 30, .85, .05), 'pave': tc.noise_mat('pave', (.70, .68, .63), (.78, .76, .71), 40, .8, .05),
          'water': tc.mat('water', (.08, .2, .26), .05, spec=.9)}
    gb = tc.Batch('site_lawn', Mg['lawn']); gb.box(0, 0, -.3, 170, 120, .3); gb.done()
    pb = tc.Batch('site_pave', Mg['pave']); pb.box(0, -44, -.02, 40, 22, .05); pb.box(0, 32, -.02, 30, 8, .05); pb.done()
    wb = tc.Batch('site_water', Mg['water']); wb.box(0, 48, -.05, 60, 14, .08); wb.done()
    fb = tc.Batch('site_fountain', bpy.data.materials['em_trim'] if 'em_trim' in bpy.data.materials else None); fb.cyl(0, -44, 0, 4.5, .7, seg=40); fb.done()
    fw = tc.Batch('site_fountain_w', Mg['water']); fw.cyl(0, -44, .05, 4.0, .7, seg=40); fw.done()
    # 光：太阳（与三层同方位）+ 天空
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.4; sun.angle = math.radians(2); sun.color = (1, .96, .9)
    so = bpy.data.objects.new('sun', sun); col.objects.link(so); so.rotation_euler = tc.SUN_ROT
    w = bpy.data.worlds.new('sky'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (.55, .65, .8, 1); bg.inputs['Strength'].default_value = .45
    # 等轴正交相机（从西南上方看：看得到正面柱廊和西翼）
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = 150 if fl is None else 135; cam.clip_end = 1000
    co = bpy.data.objects.new('cam', cam); col.objects.link(co); sc.camera = co
    d = Vector((-1, -1, math.sqrt(2) * math.tan(math.radians(35.264)))).normalized()
    co.location = Vector((0, -2, 8 if fl else 10)) + d * 300
    co.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    res = int(opt['--res']); sc.render.resolution_x = res; sc.render.resolution_y = int(res * .75)
    sc.render.engine = 'CYCLES'; sc.cycles.samples = int(opt['--samples']); sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'Standard'
    out = os.path.abspath(opt['--out']); os.makedirs(os.path.dirname(out), exist_ok=True); sc.render.filepath = out
    tc.tick(f'eden manor {fl or "exterior"}: render'); bpy.ops.render.render(write_still=True); tc.tick('done ' + out)

if __name__ == '__main__': _standalone()
