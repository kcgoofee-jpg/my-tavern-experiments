# 【旧版，冻结】伊甸府邸 · 任务 8 之前的 Blender 模型（原 blender/eden_manor.py）。
# 只因 blender/tc_estates.py 的 build_eden 在天城上层底图里以 1:100 调 build_eden_manor 而保留；新模型在 blender/estate/，
# 等 SHELL 建造者提供 estate 版的 build_eden_manor(layer, center, rot, scale) 后删掉本文件。独立出图请用 blender/eden_manor.py。
# 伊甸府邸（伊甸庄园主楼）· Blender 模型：新古典白石府邸，外观 + 按层剖切。
# 楼层、房间与尺寸依据 docs/eden-estate.md（出处见该文档）；硬约束：只建中性建筑与普通家具。
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
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # blender/（tc_common）
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

# 房间：(编号 名称, 类型, x0, x1, y0, y1)——按 docs/eden-estate.md §4（2026-09-27 三合一顾问重写版）。类型决定地面材料与家具；中性房间只放普通家具
ROOMS = {
    'F1': [('101 大厅', 'hall', -12, 12, -22, -2), ('102 衣帽间', 'dressing', -20, -12, -22, -12), ('103 访客盥洗室', 'wc', -20, -12, -12, -2),
           ('104 门房', 'office', 12, 20, -22, -12), ('105 候见室', 'lounge', 12, 20, -12, -2), ('106 一层过厅', 'corridor', -20, 20, -2, 6),
           ('107 花园厅', 'garden_hall', -8, 8, 6, 22), ('108 主楼梯厅', 'lobby', 8, 20, 6, 22), ('110 值班室', 'staff', -20, -14, 14, 22),
           ('111 银器室', 'store', -14, -8, 6, 14), ('113 餐厅', 'dining', -44, -20, -16, -2), ('114 早餐室', 'breakfast', -54, -44, -16, -2),
           ('115 西翼廊', 'corridor', -54, -20, -2, 2), ('116 备餐间', 'pantry', -34, -20, 2, 16), ('117 瓷器与花艺室', 'store', -46, -34, 2, 16),
           ('118 家族门厅', 'lobby', -54, -46, 2, 16), ('119 会客厅', 'reception', 20, 44, -16, -2), ('120 绿厅', 'lounge', 44, 54, -16, -2),
           ('121 东翼廊', 'corridor', 20, 54, -2, 2), ('122 台球室', 'billiards', 20, 34, 2, 16), ('123 珍藏室', 'gallery', 34, 46, 2, 16), ('124 东门厅', 'lobby', 46, 54, 2, 16)],
    'F2': [('201 大厅上空', 'void', -12, 12, -22, -2), ('202 茶室', 'lounge', -20, -12, -22, -2), ('203 客用侍从间', 'staff', 12, 20, -22, -12),
           ('204 客用布草间', 'store', 12, 20, -12, -2), ('205 二层过厅', 'corridor', -20, 20, -2, 6), ('206 起居室', 'lounge', -8, 8, 6, 22),
           ('207 主楼梯平台', 'lobby', 8, 20, 6, 22), ('209 楼层配餐间', 'pantry', -20, -14, 14, 22), ('211 小储藏', 'store', -14, -8, 6, 14),
           ('212 书房', 'study', -40, -20, -16, -2), ('213 秘书室', 'office', -54, -40, -16, -2), ('214 西二层廊', 'corridor', -54, -20, -2, 2),
           ('215 档案与地图室', 'archive', -34, -20, 2, 16), ('216 保险库', 'vault', -40, -34, 9, 16), ('217 书房盥洗室', 'wc', -40, -34, 2, 9),
           ('218 晨读室', 'lounge', -54, -40, 2, 16), ('219 客房 A', 'guest', 20, 37, -16, -2), ('220 客房 B', 'guest', 37, 54, -16, -2),
           ('221 东二层廊', 'corridor', 20, 54, -2, 2), ('222 客房 C', 'guest', 20, 37, 2, 16), ('223 客用起居室', 'lounge', 37, 54, 2, 16)],
    'F3': [('301 肖像廊', 'gallery', -12, 12, -22, -2), ('302 主人侍从间', 'staff', -20, -12, -22, -2), ('303 布草间', 'store', 12, 20, -22, -12),
           ('304 家庭盥洗室', 'wc', 12, 20, -12, -2), ('305 三层过厅', 'corridor', -20, 20, -2, 6), ('306 家庭餐室', 'breakfast', -8, 8, 6, 22),
           ('307 主楼梯顶层平台', 'lobby', 8, 20, 6, 22), ('309 侍从待命室', 'staff', -20, -14, 14, 22), ('311 主人前厅', 'lobby', -14, -8, 6, 14),
           ('312 主人起居室', 'lounge', -40, -20, -16, -2), ('313 更衣室', 'dressing', -54, -40, -16, -2), ('314 西三层廊', 'corridor', -54, -20, -2, 2),
           ('315 主卧', 'master', -40, -20, 2, 16), ('316 主浴室', 'bath', -54, -40, 2, 16), ('317 寝（次卧套间）', 'guest', 20, 40, -16, -2),
           ('318 家庭客厅', 'lounge', 40, 54, -16, -2), ('319 东三层廊', 'corridor', 20, 54, -2, 2), ('320 私人房间 A', 'private', 20, 36, 2, 16),
           ('321 备用卧室', 'guest', 36, 54, 2, 16)],
    'F4': [('401 女仆长办公室', 'office', -20, -8, -22, -12), ('402 女仆长卧室', 'bedroom_s', -20, -8, -12, -2), ('403 附属用房', 'annex', -8, 8, -22, -10),
           ('404 员工起居室', 'staff', -8, 8, -10, -2), ('405 洗衣房', 'laundry', 8, 20, -22, -12), ('406 储藏室', 'store', 8, 20, -12, -2),
           ('407 四层廊', 'corridor', -20, 20, -2, 6), ('408 监控室', 'monitor', -8, 8, 6, 14), ('409 结界值守室', 'ward', -8, 8, 14, 22),
           ('410 员工卧室', 'dorm', 8, 20, 6, 22), ('412 员工盥洗室', 'wc', -20, -14, 14, 22), ('413 布草储藏', 'store', -14, -8, 6, 14)],
    'F5': [('502 眺望亭', 'lookout', -7, 7, -9, 5)],
}
# 竖井：(名称, 类型, x0, x1, y0, y1, 停靠层)。主楼梯厅里是双跑楼梯 + 井心笼式电梯
SHAFTS = [('108 主楼梯', 'stair', 8, 20, 6, 22, 'F1 F2 F3'), ('电梯', 'lift', 12.5, 15.5, 12.5, 16.5, 'F1 F2 F3 F4 F5'),
          ('109 仆役楼梯', 'service', -20, -14, 6, 14, 'F1 F2 F3 F4 F5'), ('112 主人通道', 'master', -14, -8, 14, 22, 'F1 F3 F5')]
FLOORMAT = {'hall': 'marble', 'lobby': 'marble', 'gallery': 'marble', 'corridor': 'marble', 'lookout': 'marble', 'garden_hall': 'marble_check',
            'dining': 'parquet', 'reception': 'parquet', 'lounge': 'parquet', 'study': 'parquet', 'guest': 'parquet', 'master': 'parquet', 'billiards': 'parquet',
            'private': 'parquet', 'office': 'parquet', 'dressing': 'parquet', 'archive': 'parquet', 'bedroom_s': 'parquet', 'dorm': 'parquet',
            'breakfast': 'marble_check', 'wc': 'marble_check', 'annex': 'lino', 'staff': 'parquet', 'laundry': 'tile', 'bath': 'marble', 'monitor': 'lino',
            'store': 'lino', 'pantry': 'tile', 'vault': 'lino', 'ward': 'stone2'}

def _check_mat():
    """黑白棋盘格大理石（早餐室、访客盥洗室、花园厅）。"""
    m = bpy.data.materials.new('em_marble_check'); m.use_nodes = True; nt = m.node_tree; b = tc.bsdf_of(m)
    tco = nt.nodes.new('ShaderNodeTexCoord'); ch = nt.nodes.new('ShaderNodeTexChecker'); ch.inputs['Scale'].default_value = 1.0
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1.25, 1.25, 1.25)   # 物体坐标（米）→ 0.8 m 一格
    nt.links.new(tco.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], ch.inputs['Vector'])
    ch.inputs['Color1'].default_value = (.85, .84, .81, 1); ch.inputs['Color2'].default_value = (.04, .04, .045, 1)
    nt.links.new(ch.outputs['Color'], b.inputs['Base Color']); tc.set_in(b, 'Roughness', .2); return m

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
        'marble_check': _check_mat(), 'marble_black': tc.mat('em_marble_black', (.03, .03, .035), .15, spec=.8),
        'mahogany': tc.noise_mat('em_mahogany', (.16, .06, .035), (.24, .10, .05), 60, .35, .02), 'brass': tc.mat('em_brass', (.78, .60, .28), .25, metal=1),
        'porcelain': tc.mat('em_porcelain', (.93, .93, .91), .08, spec=.9), 'towel': tc.noise_mat('em_towel', (.88, .86, .80), (.95, .93, .88), 400, 1.0, .3),
        'linen': tc.mat('em_linen', (.90, .88, .83), .9), 'felt': tc.mat('em_felt', (.06, .22, .12), .95),
        'aether': tc.emit_mat('em_aether', (.45, .9, 1.0), 3.0), 'gold_crest': tc.mat('em_gold_crest', (.90, .76, .42), .25, metal=1),
        'shaft_service': tc.mat('em_shaft_service', (.79, .54, .25), .7),
        'shaft_stair': tc.mat('em_shaft_stair', (.62, .50, .30), .7), 'shaft_lift': tc.mat('em_shaft_lift', (.30, .55, .60), .5),
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
    y = -28.5; ent = 2.9                                                                            # 科林斯：柱径 1.35 m、柱高 10D；檐部 2.9 m；中间一跨放宽到 6 m
    for x in (-13, -8, -3, 3, 8, 13):
        B('trim').cyl(x, y, .6, .675, h - 1.6, seg=24); B('trim').box(x, y, 0, 1.8, 1.8, .6)                      # 柱身、柱础
        B('trim').cyl(x, y, h - 1.0, .75, .6, seg=16, r2=.95); B('trim').box(x, y, h - .4, 1.9, 1.9, .4)            # 柱头（外张的钟形 + 顶板）
    B('trim').box(0, -25.5, h, 31, 8, 1.0); B('stone').box(0, -25.5, h + 1.0, 31, 8, 1.1); B('trim').box(0, -25.5, h + 2.1, 32, 8.6, .8)   # 额枋、檐壁、檐口
    B('stone').box(0, -25, 0, 31, 7, .6)                                                              # 柱廊地坪
    for s in range(4): B('stone2').box(0, -29.5 - s * 1.1, 0, 34 + s * 2, 1.1, .6 - s * .15)          # 台阶
    # 山花：三棱柱（坡屋面沿 y 方向，斜面朝上）
    bm = B('roof').bm; ht = 3.6; z = h + ent
    vs = [bm.verts.new(v) for v in ((-15.5, -29.5, z), (15.5, -29.5, z), (0, -29.5, z + ht), (-15.5, -21.5, z), (15.5, -21.5, z), (0, -21.5, z + ht))]
    for f in ((0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (1, 4, 5, 2)): bm.faces.new([vs[i] for i in f])
    B('trim').box(0, -29.7, z, 31.5, .4, .5)                                                          # 山花底檐
    B('gold_crest', smooth=True).ico(0, -29.75, z + 1.4, 1.0, sz=1.0, sub=2)                            # 山花中心的金色家徽（鎏金 #E6C36A）

def _kiosks(B, open_=False):
    """屋顶平台上的三座出口小亭（主人通道、电梯、仆役楼梯）+ 主人通道出口到眺望亭之间的紫藤廊。"""
    z = 18.85; h = CUT if open_ else 3.2
    for (x0, x1, y0, y1) in ((-14, -8, 14, 22), (12, 16, 12, 17), (-20, -14, 6, 14)):
        if open_: _walls(B, 'stone', x0, x1, y0, y1, z, h, .4, [('S', (x0 + x1) / 2, 1.4)])
        else: B('stone').box((x0 + x1) / 2, (y0 + y1) / 2, z, x1 - x0, y1 - y0, h); B('trim').box((x0 + x1) / 2, (y0 + y1) / 2, z + h, x1 - x0 + .6, y1 - y0 + .6, .35)
    for k in range(6):                                                                                 # 紫藤廊：主人通道出口 (−11, 14) → 眺望亭 (0, 5)
        f = k / 5; x, y = -11 + 9 * f, 13 - 7 * f
        for s in (-1, 1): B('trim').box(x + s * 1.1, y + s * .9, z, .25, .25, 2.6)
        B('wood').box(x, y, z + 2.6, 3.2, .3, .15, -.66); B('plant', smooth=True).ico(x, y, z + 2.9, .9, sz=.4, sub=1)

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
    elif kind == 'lookout':                                                                         # F5 眺望厅：环形软座 + 望远镜
        for k in range(10): a = k / 10 * 2 * math.pi; B('fabric2').box(DRUM[0] + math.cos(a) * 5.4, DRUM[1] + math.sin(a) * 5.4, z, .9, 2.4, .45, a)
        B('brass').cyl(DRUM[0], DRUM[1] + 2, z, .12, 1.3, seg=10); B('brass').box(DRUM[0], DRUM[1] + 2.4, z + 1.3, .3, 1.2, .3, .3)
    elif kind == 'wc':                                                                              # 盥洗室：隔间里的马桶（座 + 水箱）、洗手台、毛巾架与毛巾
        n = max(1, int((w if w > d else d) / 4))
        for k in range(n):
            if w > d: tx, ty = x0 + (k + .5) * w / n, y1 - 1.0
            else: tx, ty = x1 - 1.0, y0 + (k + .5) * d / n
            B('porcelain').cyl(tx, ty, z, .22, .42, seg=16); B('mahogany').box(tx, ty, z + .42, .44, .52, .05)   # 马桶与座圈
            B('porcelain').box(tx + (0 if w > d else .35), ty + (.35 if w > d else 0), z + .45, .5 if w > d else .2, .2 if w > d else .5, .45)   # 水箱
            B('brass').box(tx + .15, ty + .3, z + .8, .08, .03, .03)                                   # 冲水手柄
        B('marble').box(cx, y0 + .5, z, min(w - 1, 2.4), .6, .85); B('porcelain').box(cx, y0 + .5, z + .85, .5, .4, .06)   # 洗手台
        B('brass').box(x0 + .25, cy, z + 1.0, .05, 1.2, .05); B('towel').box(x0 + .3, cy, z + .55, .1, .9, .5)   # 毛巾架 + 挂着的毛巾
    elif kind == 'breakfast':
        B('rug').box(cx, cy, z, w * .6, d * .5, .03); B('mahogany').cyl(cx, cy, z, 1.4, .76, seg=32)
        for k in range(8): a = k / 8 * 2 * math.pi; B('fabric').box(cx + math.cos(a) * 2.0, cy + math.sin(a) * 2.0, z, .5, .5, .95, a)
        B('wood').box(x0 + .4, cy, z, .5, d * .5, 1.0)
    elif kind == 'garden_hall':                                                                     # 花园厅：棋盘格地面、棕榈盆栽、两组沙发，朝后庭
        for dx in (-1, 1):
            for dy in (-1, 1): plant(cx + dx * (w / 2 - 1.5), cy + dy * (d / 2 - 1.5))
        B('fabric').box(cx, cy - 2, z, 3.4, .9, .8); B('fabric').box(cx, cy + 2, z, 3.4, .9, .8); B('marble').box(cx, cy, z, 1.6, 1.0, .45)
    elif kind == 'pantry':                                                                          # 备餐：沿墙台面 + 中岛
        B('marble').box(cx, y1 - .5, z, w - 1, .7, .9); B('marble').box(x0 + .5, cy, z, .7, d - 2, .9); B('wood').box(cx, cy, z, min(4, w * .4), 1.2, .9)
    elif kind == 'store':
        for k in range(max(1, int(w / 2.2))): B('wood').box(x0 + 1.1 + k * 2.2, cy, z, .5, d - 2, 2.2)
    elif kind == 'archive':
        for k in range(max(1, int(d / 2.4))): B('mahogany').box(cx, y0 + 1.2 + k * 2.4, z, w - 3, .45, 2.2)
        B('mahogany').box(x1 - 2.5, cy, z, 2.0, 1.2, .9)                                            # 地图柜
    elif kind == 'vault':
        for k in range(3): B('metal').box(x0 + 1 + k * 1.8, y1 - .6, z, 1.4, .8, 1.9)
        B('brass').cyl(cx, y0 + .4, z + .6, .5, .1, seg=24)                                          # 金库门的圆转盘（贴在门口）
    elif kind == 'billiards':
        B('mahogany').box(cx, cy, z, 1.7, 3.1, .78); B('felt').box(cx, cy, z + .78, 1.5, 2.9, .03)
        B('wood').box(x0 + .4, cy, z, .4, 3, 1.4); sofa_set(cx, y1 - 3, math.pi)
    elif kind == 'ward':                                                                            # 结界值守室：黄铜主控台 + 以太晶 + 四个锚碑表盘
        B('brass').box(cx, cy, z, 4, 1.2, .95); B('aether', smooth=True).ico(cx, cy, z + 1.4, .35, sz=1.8, sub=2)
        for k in range(4): B('brass').cyl(x0 + 2 + k * (w - 4) / 3, y1 - .4, z + 1.2, .45, .08, seg=20)
        B('fabric2').box(cx, cy - 1.4, z, .6, .6, 1.0)
    elif kind == 'dorm':
        for k in range(3): bed(x0 + 2, y0 + 2.5 + k * (d - 3) / 3); B('wood').box(x1 - .5, y0 + 2.5 + k * (d - 3) / 3, z, .6, 1.2, 2.0)
    elif kind == 'bedroom_s':
        bed(cx - 2, cy); B('wood').box(x1 - .5, cy, z, .6, 2.0, 2.0); B('wood').box(cx + 2.5, y0 + .8, z, 1.4, .6, .76)

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
        if kind == 'lookout': _furnish(B, kind, x0, x1, y0, y1, z); continue                      # F5 眺望厅在圆形鼓座里（墙另建）
        B(FLOORMAT.get(kind, 'marble')).box((x0 + x1) / 2, (y0 + y1) / 2, z - .3, x1 - x0, y1 - y0, .3)
        gaps = [(s, c, 1.8) for s, c in (('S', (x0 + x1) / 2), ('N', (x0 + x1) / 2), ('W', (y0 + y1) / 2), ('E', (y0 + y1) / 2))]
        _walls(B, 'wall_in', x0 + .15, x1 - .15, y0 + .15, y1 - .15, z, CUT, .25, gaps)   # 各房间的墙往里收一点：相邻房间的墙并排，不重叠
        _furnish(B, kind, x0, x1, y0, y1, z)
    for name, kind, x0, x1, y0, y1, fls in SHAFTS:
        if fl not in fls.split(): continue
        key = {'stair': 'shaft_stair', 'lift': 'shaft_lift', 'master': 'shaft_master', 'service': 'shaft_service'}[kind]
        if kind == 'stair':                                                                          # 楼梯厅：沿东西两侧的两跑楼梯，中间是笼式电梯
            _walls(B, key, x0, x1, y0, y1, z, CUT + .3, .3, [('S', (x0 + x1) / 2, 2.4), ('W', (y0 + y1) / 2, 2.0)])
            if fl != 'F3': _stairs(B, x0 + .3, x0 + 4.3, y0 + .3, y1 - .3, z); _stairs(B, x1 - 4.3, x1 - .3, y0 + .3, y1 - .3, z)
            continue
        if kind == 'lift':                                                                           # 黄铜笼式轿厢
            for dx in (-1, 1):
                for dy in (-1, 1): B('brass').box((x0 + x1) / 2 + dx * (x1 - x0) / 2, (y0 + y1) / 2 + dy * (y1 - y0) / 2, z, .12, .12, CUT + .4)
            B('brass').box((x0 + x1) / 2, (y0 + y1) / 2, z + CUT + .3, x1 - x0, y1 - y0, .1); B(key).box((x0 + x1) / 2, (y0 + y1) / 2, z, x1 - x0 - .3, y1 - y0 - .3, .05)
            continue
        _walls(B, key, x0, x1, y0, y1, z, CUT + .3, .3, [('S', (x0 + x1) / 2, 1.6)])
        if kind == 'service' and fl != 'F5': _stairs(B, x0 + .3, x1 - .3, y0 + .3, y1 - .3, z)
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
        _portico(B); _belvedere(B); _kiosks(B)
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
            _kiosks(B, open_=True)
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
    tc.setup_render_device(sc)                                  # 渲染守卫：唯一设备入口（以前没设，后台模式默认 CPU）
    tc.tick(f'eden manor {fl or "exterior"}: render'); bpy.ops.render.render(write_still=True); tc.tick('done ' + out)

if __name__ == '__main__': _standalone()
