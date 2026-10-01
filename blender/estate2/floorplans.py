"""伊甸主楼分层平面（B2 / B1 / F1 / F2 / F3）：房间表只取 docs/card-digest.md §6，家具只画中性色块。

python3 blender/estate2/floorplans.py            → docs/drafts/eden2_plan_{B2,B1,F1,F2,F3}.png + eden2_plans_sheet.png
                                                  + map/data/eden_estate_rooms.json
坐标与 layout.py 相同：x 向东、y 向北（−y 是正面 / 入口），单位 m；体块取 layout.MAIN（外观一致）。
规则：卡里的房间用卡的名字；楼梯 / 电梯 / 走廊 / 卫生间 / 机房这类建筑必需空间标「辅助」；没有指定用途的体量留白，不编用途。
卡房间编号（card_id）= 楼层 + 卡内顺序（如 B1-C01），见 CARD_ROOMS；房间名一律照抄卡的原名（2026-09-28 用户决定：按原卡，不转换）。
kind = restricted 的房间只写名字：只画空白框，不画任何家具、不描述。
"""
import json, math, os, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import Polygon, Circle, Rectangle, FancyBboxPatch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import layout as L

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
for f in ('/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/STHeiti Medium.ttc'):
    if os.path.exists(f):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break

# ---------------------------------------------------------------- 卡房间表（卡「庄园布局」条目的房间，按卡内顺序编号）
# cid, 楼层, 卡原名（照抄卡），卡里的其他写法（只收卡原文出现过的）
CARD_ROOMS = [
    ('F1-C01', 'F1', '大厅', []), ('F1-C02', 'F1', '餐厅', []), ('F1-C03', 'F1', '独立食物准备间', ['食物准备间']),
    ('F1-C04', 'F1', '会客厅', []), ('F1-C05', 'F1', '厨房与后勤区', ['厨房']), ('F1-C06', 'F1', '衣物清洗与维护间', []),
    ('F1-C07', 'F1', '道具清洗消毒间', []), ('F1-C08', 'F1', '物资仓库', []),
    ('F2-C01', 'F2', '主人主卧', ['主卧']), ('F2-C02', 'F2', '主人书房', ['书房']), ('F2-C03', 'F2', '女仆长寝室', []),
    ('F2-C04', 'F2', '客房', []), ('F2-C05', 'F2', '客房', []), ('F2-C06', 'F2', '东侧长廊', []),
    ('F3-C01', 'F3', '正式母畜个人寝室', ['个人寝室']),   # 卡权限表也写「个人寝室」
    ('F3-C02', 'F3', '新进公共寝区', ['新进寝区']), ('F3-C03', 'F3', '三楼公共浴室', ['三楼浴室']),
    ('F3-C04', 'F3', '杂鱼女仆集体间', ['集体间']), ('F3-C05', 'F3', '公共清洁间', []),
    ('B1-C01', 'B1', '主调教室', []), ('B1-C02', 'B1', '私人调教室', []),
    ('B1-C03', 'B1', '体能训练室', []), ('B1-C04', 'B1', '性技巧训练室', []), ('B1-C05', 'B1', '恒温酒窖', ['酒窖']),
    ('B2-C01', 'B2', '惩罚室', []), ('B2-C02', 'B2', '医疗与改造室', []),
    ('B2-C03', 'B2', '档案室', []), ('B2-C04', 'B2', '储藏室', []),
    ('EX-C01', 'ext', '前庭花园', ['前庭']), ('EX-C02', 'ext', '后庭园', ['后庭']),   # 室外：maps.json eden_estate.areas / zones.json
]
# 通用叫法（不是卡原文，是这些卡房间的普通说法，如「卧室」「浴室」）：只作识别词，一律落到对应的卡房间（std = 卡名），不另成房间
SYNONYMS = {'F1-C01': ['门厅', '玄关'], 'F1-C02': ['饭厅'], 'F1-C04': ['客厅', '沙龙'], 'F1-C08': ['仓库'], 'F1-C06': ['洗衣房'],
            'F2-C01': ['主卧室', '卧室', '衣帽间', '私人衣帽间', '更衣室'], 'F2-C02': ['图书室'], 'F2-C06': ['长廊'],
            'F3-C01': ['寝室', '寝', '宿舍'], 'F3-C03': ['公共浴室', '浴室', '浴池', '盥洗室'], 'F3-C04': ['集体宿舍', '女仆宿舍'],
            'B1-C03': ['健身房']}
# 旧编号 → 新编号（v0.9.6 及以前存进聊天的自定义叫法 / 飞行目标仍能落点）
CARD_ID_ALIAS = {'B2-受限': 'B2-C01', 'B2-医疗室': 'B2-C02', 'B2-档案室': 'B2-C03', 'B2-储藏室': 'B2-C04',
                 'B1-受限A': 'B1-C01', 'B1-受限B': 'B1-C02', 'B1-体能训练室': 'B1-C03', 'B1-受限C': 'B1-C04', 'B1-酒窖': 'B1-C05',
                 'F1-大厅': 'F1-C01', 'F1-餐厅': 'F1-C02', 'F1-备餐间': 'F1-C03', 'F1-会客厅': 'F1-C04', 'F1-厨房': 'F1-C05',
                 'F1-洗衣': 'F1-C06', 'F1-消毒': 'F1-C07', 'F1-仓库': 'F1-C08', 'F2-主卧': 'F2-C01', 'F2-书房': 'F2-C02',
                 'F2-女仆长寝室': 'F2-C03', 'F2-客房1': 'F2-C04', 'F2-客房2': 'F2-C05', 'F2-东侧长廊': 'F2-C06', 'F3-个人寝室': 'F3-C01',
                 'F3-新人寝区': 'F3-C02', 'F3-公共浴室': 'F3-C03', 'F3-女仆团集体间': 'F3-C04', 'F3-清洁间': 'F3-C05'}
# 仓库以前自己编的名字（不是卡的写法）→ 新编号：只用于读旧聊天数据，不进识别词表、不在界面出现
RETIRED_NAMES = {'受限房间': 'B2-C01', '附属室': 'B2-C01', '附属室D': 'B2-C01', '受限房间 A': 'B1-C01', '附属室A': 'B1-C01',
                 '受限房间 B': 'B1-C02', '附属室B': 'B1-C02', '受限房间 C': 'B1-C04', '附属室C': 'B1-C04', '医疗室': 'B2-C02',
                 '备餐间': 'F1-C03', '衣物清洗维护间': 'F1-C06', '器具清洗消毒间': 'F1-C07', '新人公共寝区': 'F3-C02', '女仆团集体间': 'F3-C04'}

FLOORS = [  # id, 名称, 楼面标高（相对 F1 地坪，m）
    ('B2', '地下二层', -9.0), ('B1', '地下一层', -4.5), ('F1', '一层', 0.0), ('F2', '二层', 4.5), ('F3', '三层', 9.0)]
FH = 4.5

# ---------------------------------------------------------------- 体块（外观）
BLK = {b[0]: b for b in L.MAIN}
STOREYS = {'hall': 3, 'porch': 1, 'tower': 3, 'w_wing_a': 2, 'w_wing_b': 2, 'w_pav': 3, 'e_wing_a': 2, 'e_wing_b': 2,
           'e_pav': 3, 'belvedere': 3, 'n_link': 2, 'w_low': 1, 'e_low': 1}   # 外观层数取整；塔楼 / 望楼顶上是屋顶构筑物
BLK_CN = {'hall': '主楼', 'porch': '门廊', 'tower': '塔楼', 'w_wing_a': '西翼', 'w_wing_b': '西北翼', 'w_pav': '西角亭', 'e_wing_a': '东翼',
          'e_wing_b': '东北翼', 'e_pav': '东角亭', 'belvedere': '东望楼', 'n_link': '北廊楼', 'w_low': '西连楼', 'e_low': '东连楼'}
BASEMENT_RECT = (-20, 20, -14, 8)   # 地下两层只在主楼下（40 × 22 m）


def blk_poly(bid, inset=0.0):
    _, cx, cy, w, d, _f, rot, *_ = BLK[bid]
    return loc(bid, [(-w / 2 + inset, -d / 2 + inset), (w / 2 - inset, -d / 2 + inset), (w / 2 - inset, d / 2 - inset), (-w / 2 + inset, d / 2 - inset)])


def loc(bid, pts):
    """体块局部坐标（原点在体块中心，未旋转）→ 世界坐标。"""
    _, cx, cy, w, d, _f, rot, *_ = BLK[bid]
    a = math.radians(rot); c, s = math.cos(a), math.sin(a)
    return [(round(cx + x * c - y * s, 3), round(cy + x * s + y * c, 3)) for x, y in pts]


def R(x0, x1, y0, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def LR(bid, x0, x1, y0, y1):
    return loc(bid, R(x0, x1, y0, y1))


def area(p):
    return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2


# kind: card 卡房间 / restricted 只写名字（不描述） / support 辅助（楼梯、电梯、卫浴、机房…）/ circ 走廊 / open 未定用途的体量 / owner 主人专用
# card_area: 卡面积（㎡）；range: 面积区间；furn: 中性家具块 [(x0, x1, y0, y1)] 世界坐标
ROOMS = []


def room(fl, name, poly, kind, card_area=None, note='', access='', furn=(), cid=None, rng=None, block='hall'):
    ROOMS.append(dict(floor=fl, name=name, poly=poly, kind=kind, card_area=card_area, range=rng, note=note, access=access,
                      furn=list(furn), card_id=cid, block=block))


def beds(x0, y0, n, dx=0.0, dy=0.0, w=1.0, l=2.0):
    return [(x0 + i * dx, x0 + i * dx + w, y0 + i * dy, y0 + i * dy + l) for i in range(n)]


# ======================================================================== 竖向交通（逐层对齐）
TOWER = R(-22, -12, -22, -12)          # 塔楼：主楼梯（主人 / 访客），F1–F3，顶上是屋顶眺望亭（不算楼层）
SVC = R(-20, -14, -3, 3)               # 仆役核：仆役楼梯 + 食梯 + 服务电梯，B2–F3；B2 门禁（仅主人 / 女仆长芯片）
OWN = R(16, 20, -10, -6)               # 主人专用通道：螺旋梯 + 单人电梯，B2–F2；F1 接会客厅暗门，F2 开进主卧衣帽间
CORR = R(-20, 20, -6, -3)              # 主楼东西主廊（各层同位，承重墙对齐）


def cores(fl):
    if fl in ('F1', 'F2', 'F3'):
        room(fl, '主楼梯（塔楼）', TOWER, 'support', note='石材双跑梯，F1–F3；F3 再上一跑到屋顶眺望亭（屋顶构筑物）', access='主人 / 访客 / 住客', block='tower')
    room(fl, '仆役核', SVC, 'support', note='仆役楼梯 + 食梯 + 服务电梯，B2–F3 贯通' + ('；B2 楼梯间门禁：仅主人、女仆长芯片' if fl == 'B2' else ''),
         access='仆从动线')
    if fl != 'F3':
        room(fl, '主人通道', OWN, 'owner', note='主人专用通道：螺旋梯 + 单人电梯，B2–F2；F1 与会客厅暗门相接，F2 开进主卧衣帽间', access='仅主人')


# ======================================================================== B2
cores('B2')
room('B2', '走廊', R(-14, 16, -6, -3), 'circ')
room('B2', '惩罚室', R(-10, -5, -14, -6), 'restricted', 40, note='无窗；重型约束立柱、悬吊禁闭笼、束缚惩戒长凳、刑具壁柜', access='主人 / 女仆长 / 被带去的人', cid='B2-C01',
     furn=[(-7.8, -6.8, -11.0, -9.0), (-9.7, -8.5, -13.6, -10.6), (-5.8, -5.1, -13.6, -8.5), (-8.5, -6.0, -13.7, -12.7), (-6.1, -5.2, -8.0, -6.7)])
room('B2', '医疗与改造室', R(-5, 1.25, -14, -6), 'card', 50, note='体检、手术、恢复舱：以太生化恢复舱、改造手术台、全身扫描拱门', access='主人 / 女仆长 / 被带去的人', cid='B2-C02',
     furn=[(-2.6, -1.0, -11.5, -9.0), (-4.7, -3.2, -13.6, -10.2), (-4.7, -3.3, -9.6, -7.6), (0.3, 1.15, -13.6, -7.6), (-4.6, -3.0, -7.4, -6.4)])
room('B2', '档案室', R(10, 16, -14, -10.67), 'card', 20, note='协议原件、影像服务器；只有主人和女仆长能进', access='仅主人 / 女仆长', cid='B2-C03',
     furn=[(10.4, 15.6, -13.6, -12.7), (10.4, 11.2, -12.2, -10.9), (14.8, 15.6, -12.2, -10.9), (12.3, 13.7, -12.0, -11.1)])
room('B2', '储藏室', R(10, 16, -10.67, -6), 'card', 30, note='备用设备、季节衣物、紧急医疗急救站（EQ-51）', access='主人 / 女仆长 / 被带去的人', cid='B2-C04',
     furn=[(10.4, 11.3, -10.4, -6.5), (14.7, 15.6, -10.4, -6.5), (11.6, 14.4, -10.5, -9.7), (12.3, 13.7, -8.8, -7.4)])
room('B2', '设备间', R(1.25, 10, -14, -6), 'support', note='')
room('B2', '设备间', R(-20, -10, -14, -6), 'support', note='')
room('B2', '疏散楼梯', R(16, 20, -14, -10), 'support', note='第二安全出口：B2–B1，经东侧下沉天井上到室外地坪（建筑必需）')
room('B2', '机电设备间', R(-14, 4, -3, 8), 'support', note='地下机电与以太结界发生器：共鸣核心、导流柱、监控总台',
     furn=[(-6.8, -3.2, 1.2, 4.8), (-7.6, -2.4, -0.6, 0.6), (-13.6, -9.4, 3.2, 7.6), (-13.6, -9.4, -2.6, 1.8), (-0.6, 3.6, 3.2, 7.6), (-0.6, 3.6, -2.6, 1.8)])
room('B2', '仆役前室', R(-20, -14, 3, 8), 'support')
room('B2', '走廊', R(-20, -14, -6, -3), 'circ')
room('B2', '主人通道前室', R(16, 20, -6, -3), 'owner', note='B2 受限楼层前室：门禁（主人 / 女仆长芯片）', access='仅主人 / 女仆长 / 被带去的人')
# ======================================================================== B1
cores('B1')
room('B1', '走廊', R(-20, 20, -6, -3), 'circ')
room('B1', '主调教室', R(-10, 0, -14, -6), 'restricted', 80, note='中央双人调教台、天花悬挂滑轨、木马与训诫椅、器具陈列柜', cid='B1-C01',
     furn=[(-5.8, -4.2, -11.2, -8.8), (-6.6, -3.4, -11.8, -8.2), (-3.6, -2.2, -10.6, -9.4), (-5.5, -4.5, -12.4, -11.6), (-5.6, -4.4, -13.7, -12.7), (-7.8, -6.6, -13.7, -12.5), (-9.7, -8.3, -13.7, -12.2), (-9.7, -8.3, -11.2, -9.6), (-9.7, -8.3, -8.8, -6.8), (-0.8, -0.1, -13.7, -9.5), (-0.8, -0.1, -9.0, -6.6), (-3.2, -1.8, -13.0, -11.2), (-3.2, -1.8, -8.8, -7.2)])
room('B1', '私人调教室', R(0, 3.75, -14, -6), 'restricted', 30, note='圣安德鲁十字架、观摩大窗、多功能调教皮榻、寸止控制台与器具密柜', cid='B1-C02',
     furn=[(1.45, 2.65, -11.6, -9.2), (0.0, 1.05, -12.45, -8.55), (3.18, 3.70, -12.6, -8.2), (1.7, 3.1, -7.7, -6.7), (0.64, 1.96, -13.69, -13.37)])
room('B1', '性技巧训练室', R(3.75, 6.9, -14, -6), 'restricted', 25, note='姿态技巧软垫床、平衡把杆与镜面墙、示范台与精油恒温柜', cid='B1-C04',
     furn=[(4.5, 5.7, -11.8, -9.2), (3.9, 4.45, -12.0, -9.0), (6.35, 6.8, -13.5, -9.5), (3.9, 4.5, -8.2, -6.8), (4.0, 6.6, -13.7, -12.6)])
room('B1', '体能训练室', R(-8, -2, -3, 7), 'card', 60, note='健身、柔韧训练；加固型格斗区和武器架', access='住客（按任务开放）', cid='B1-C03',
     furn=[(-7.6, -4.2, 3.2, 6.6), (-3.7, -2.3, 3.5, 6.6), (-7.7, -6.3, -0.6, 2.6), (-3.7, -2.3, -0.6, 2.6), (-7.7, -6.3, -2.7, -1.2)])
room('B1', '恒温酒窖', R(-14, -8, -3, 2), 'card', 30, note='藏酒两千余瓶：双面到顶酒架群、品酒长台、恒温恒湿机组', cid='B1-C05',
     furn=[(-13.7, -8.3, 1.2, 1.8), (-13.7, -13.0, -2.6, 1.0), (-13.7, -9.0, -2.8, -2.1), (-11.5, -9.5, -0.7, 0.3)])
room('B1', '设备间', R(6.9, 10, -14, -6), 'support')
room('B1', '更衣 / 淋浴', R(10, 16, -14, -6), 'support', note='储物更衣柜、长凳、独立淋浴隔间、洗手盆台',
     furn=[(10.3, 11.2, -13.6, -7.2), (11.6, 12.2, -13.0, -7.8), (13.6, 15.7, -7.3, -6.3), (13.5, 15.7, -13.6, -9.8), (12.4, 13.3, -13.6, -10.8)])
room('B1', '疏散楼梯', R(16, 20, -14, -10), 'support', note='第二安全出口：B2–B1，经东侧下沉天井上到室外地坪（建筑必需）')
room('B1', '设备间', R(-20, -10, -14, -6), 'support', note='')
room('B1', '机电设备间', R(-2, 20, -3, 8), 'support', note='',
     furn=[(-1.7, -0.6, -2.0, 4.8), (0.5, 4.5, 3.2, 6.8), (6.0, 9.5, 3.2, 6.8), (11.5, 15.5, 3.0, 6.8), (16.5, 19.5, -2.2, 2.2)])
room('B1', '走廊', R(-8, -2, 7, 8), 'circ')
room('B1', '仆役前室', R(-20, -14, 3, 8), 'support')
room('B1', '走廊', R(-14, -8, 2, 8), 'circ')

# ======================================================================== F1
cores('F1')
room('F1', '门廊（正门）', R(-8, 8, -24.5, -16), 'support', note='柱廊；车道落客', block='porch')
room('F1', '大厅', R(-10, 10, -16, -6), 'card', 200, note='正门入口、接待；中央圆形下沉区（晨间报到）；墙面全息屏', access='全体（新人可进）', cid='F1-C01')
room('F1', '会客厅', R(10, 20, -16, -10), 'card', 60, note='壁炉、隔音；北墙暗门通主人专用通道', access='主人 / 访客', cid='F1-C04',
     furn=[(12.0, 15.0, -14.2, -13.2), (12.0, 15.0, -12.0, -11.0), (13.0, 14.0, -12.9, -12.3), (19.2, 19.8, -14.5, -12.0)])
room('F1', '主人通道前室', R(10, 16, -10, -6), 'owner', note='6 × 4 m 前室：南墙是会客厅暗门，东接螺旋梯与单人电梯；主廊一侧是普通墙板门（平时锁闭）', access='仅主人')
room('F1', '塔楼前厅', R(-12, -10, -16, -12), 'circ')
room('F1', '衣帽间 / 访客卫生间', R(-20, -10, -12, -6), 'support', note='内部房间（无需外窗），机械通风')
room('F1', '主廊', R(-20, 20, -6, -3), 'circ', note='主人动线：大厅 ↔ 餐厅 ↔ 东西翼')
room('F1', '餐厅', R(-10, -2, -3, 8), 'card', 80, note='胡桃木长桌可坐 20 人；北墙是通高玻璃隔断开向北廊楼（北廊楼北面落地窗采光）', access='主人', cid='F1-C02',
     furn=[(-7.2, -4.8, -1.2, 6.2)] + [(-7.9, -7.5, -1.0 + i * 0.75, -0.6 + i * 0.75) for i in range(10)] + [(-4.5, -4.1, -1.0 + i * 0.75, -0.6 + i * 0.75) for i in range(10)])
room('F1', '独立食物准备间', R(-14, -10, -3, 8), 'card', None, note='餐厅的独立食物准备间', access='仆从动线', cid='F1-C03',
     furn=[(-13.7, -13.1, -2.7, 7.7)])
room('F1', '服务过道', R(-20, -14, 3, 8), 'circ', note='厨房 ↔ 仆役核 ↔ 备餐间', access='仆从动线')
room('F1', '北过厅', R(-2, 2, -3, 8), 'circ', note='通北廊楼、后庭园')
room('F1', '东后厅', R(2, 20, -3, 8), 'open', note='')
room('F1', '厨房与后勤区', R(-31, -20, 0, 12), 'card', None, note='全自动烹饪；后勤三间在西翼', access='仆从动线', cid='F1-C05', block='w_low',
     furn=[(-30.6, -29.9, 0.4, 11.6), (-27.0, -23.5, 4.5, 7.5), (-20.8, -20.2, 8.0, 11.6)])
room('F1', '衣物清洗与维护间', R(-52, -42, -15, -5), 'card', None, note='厨房与后勤区', access='仆从动线', cid='F1-C06', block='w_wing_a',
     furn=[(-51.6, -51.0, -14.6, -8.0), (-47.0, -44.0, -11.0, -9.0)])
room('F1', '道具清洗消毒间', R(-42, -34, -15, -5), 'card', None, note='厨房与后勤区', access='仆从动线', cid='F1-C07', block='w_wing_a',
     furn=[(-41.6, -34.4, -14.6, -14.0)])
room('F1', '物资仓库', R(-34, -22, -15, -5), 'card', None, note='厨房与后勤区', access='仆从动线', cid='F1-C08', block='w_wing_a',
     furn=[(-33.6, -22.4, -14.6, -14.0), (-33.6, -22.4, -12.0, -11.4), (-33.6, -22.4, -9.4, -8.8)])
room('F1', '服务走廊', R(-52, -22, -5, -1), 'circ', access='仆从动线', block='w_wing_a')
room('F1', '服务连廊', R(-22, -20, -12, -1), 'circ', access='仆从动线', note='只开门进仆役核，不开向主廊：仆从经 西翼服务走廊 → 服务连廊 → 仆役核 → 服务过道 → 备餐间，不走主人动线')
room('F1', '北廊楼（通后庭）', R(-11, 11, 8, 17), 'circ', note='廊厅；通后庭园与半圆回廊', block='n_link')
room('F1', '东连楼', R(20, 31, 1.5, 12), 'open', note='', block='e_low')
room('F1', '东连廊', R(20, 22, -13.5, 0), 'circ')

# ======================================================================== F2
cores('F2')
room('F2', '主人主卧', [(8, -16), (20, -16), (20, -10), (16, -10), (16, -6), (8, -6)], 'card', 100, note='带衣帽间和独立浴室；床头呼叫面板；东北角是主人专用通道', access='主人', cid='F2-C01',
     furn=[(9.5, 11.5, -15.4, -13.0), (8.5, 9.1, -15.4, -9.0)])
room('F2', '主人书房', R(-2, 8, -16, -11), 'card', 50, note='全息终端、监控总览屏、南向落地窗（门廊上方）', access='主人（上锁）', cid='F2-C02',
     furn=[(1.5, 4.5, -14.0, -13.0), (-1.6, -1.0, -15.6, -11.4), (5.0, 7.6, -12.0, -11.4)])
room('F2', '书房前等候廊', R(-2, 8, -11, -6), 'circ', note='卡：门外走廊是等候位；主廊放宽成 5 m 的等候凹廊，顶上 F3 天窗井（R(-2, 8, -11, -9) 上方）采光')
room('F2', '客房', R(-12, -7, -16, -10), 'card', 30, note='访客短住', cid='F2-C04', furn=[(-11.6, -10.0, -15.6, -13.6), (-8.0, -7.4, -12.0, -10.4)])
room('F2', '客房', R(-7, -2, -16, -10), 'card', 30, note='访客短住', cid='F2-C05', furn=[(-6.6, -5.0, -15.6, -13.6), (-3.0, -2.4, -12.0, -10.4)])
room('F2', '客房卫浴 ×2', R(-12, -2, -10, -6), 'support')
room('F2', '布草 / 服务间', R(-20, -12, -12, -6), 'support', access='仆从动线')
room('F2', '主廊', R(-20, 20, -6, -3), 'circ', note='女仆长寝室与主卧隔此走廊相对（专用直通门）')
room('F2', '女仆长寝室', R(10, 16, -3, 3.7), 'card', 40, note='住处兼管理终端；与主卧隔走廊相对，有专用直通门', access='女仆长', cid='F2-C03',
     furn=[(13.4, 15.6, 0.8, 3.3), (10.4, 12.6, -2.6, -2.0)])
room('F2', '女仆长卫浴', R(10, 16, 3.7, 8), 'support')
room('F2', '二层北厅', R(-14, 10, -3, 8), 'open', note='北墙贴北廊楼，靠 F3 穹顶天窗井与北廊楼屋面高侧窗采光')
room('F2', '东后间', R(16, 20, -3, 8), 'open', note='')
room('F2', '仆役前室', R(-20, -14, 3, 8), 'support', access='仆从动线')
room('F2', '西翼二层', R(-52, -22, -15, -1), 'open', note='', block='w_wing_a')
room('F2', '连廊', R(-22, -20, -12, -1), 'circ')
room('F2', '连廊', R(20, 22, -13.5, 0), 'circ')
room('F2', '东翼走廊', R(22, 48, -3, 1.5), 'circ', block='e_wing_a')
room('F2', '东翼二层', R(22, 48, -13.5, -3), 'open', note='', block='e_wing_a')
room('F2', '东侧长廊', LR('e_wing_b', 0, 7, -13, 13), 'card', None, note='整面落地窗朝东：早上看云海，夜里看中层灯火', cid='F2-C06', block='e_wing_b')
room('F2', '东北翼二层', LR('e_wing_b', -7, 0, -13, 13), 'open', note='', block='e_wing_b')
room('F2', '北廊楼二层', R(-11, 11, 8, 17), 'open', note='', block='n_link')

# ======================================================================== F3（只有主楼、塔楼、两座角亭、东望楼到三层）
cores('F3')
_xs = [-12 + 3.6 * i for i in range(9)]
for i in range(8):
    room('F3', '正式母畜个人寝室', R(_xs[i], _xs[i + 1], -16, -11), 'card', None, rng=(15, 20), note='正式住客每人一间；门是单向玻璃；南窗', access='正式住客',
         cid='F3-C01', furn=[(_xs[i] + 0.3, _xs[i] + 1.3, -15.6, -13.6), (_xs[i + 1] - 1.0, _xs[i + 1] - 0.4, -15.6, -14.4)])
for x0, x1 in ((-7, -3.4), (-3.4, 0.2), (0.2, 3.8), (3.8, 7.4), (7.4, 11.2), (11.2, 15)):
    room('F3', '正式母畜个人寝室', R(x0, x1, 3, 8), 'card', None, rng=(15, 20), note='正式住客每人一间；门是单向玻璃；北窗', access='正式住客',
         cid='F3-C01', furn=[(x0 + 0.3, x0 + 1.3, 5.6, 7.6), (x1 - 1.0, x1 - 0.4, 6.4, 7.6)])
room('F3', '新进公共寝区', R(-15, -7, 3, 8), 'card', 40, note='4 床；入住第一个月的住处', access='新人', cid='F3-C02',
     furn=beds(-14.6, 5.6, 4, dx=2.0, w=0.9))
room('F3', '三楼公共浴室', R(-14, -8, -9, -1), 'card', 50, note='住客共用（顶部天窗）', access='住客 / 新人', cid='F3-C03',
     furn=[(-13.7, -8.3, -8.7, -8.1)])
room('F3', '杂鱼女仆集体间', R(15, 20, -11, 5), 'card', 80, note='大通铺；东窗；北端是公共清洁间', access='女仆团', cid='F3-C04',
     furn=[(18.4, 19.6, -10.6 + 2.5 * i, -8.8 + 2.5 * i) for i in range(6)])
room('F3', '公共清洁间', R(15, 20, 5, 8), 'card', None, note='集体间尽头', cid='F3-C05', access='女仆团')
room('F3', '集体间储物', R(16.8, 20, -16, -11), 'support')
room('F3', '三楼公共区', R(-8, 15, -9, 1), 'open', None, note='卡只在权限表里提到「F3 公共区」，没写面积与功能；穹顶灯亭天窗采光', access='住客 / 新人', cid=None,
     furn=[(-2.0, 2.0, -5.0, -3.0), (6.0, 9.0, -6.0, -5.2), (6.0, 9.0, -1.8, -1.0)])
room('F3', '前廊', R(-12, 15, -11, -9), 'circ')
room('F3', '后廊', R(-14, 15, 1, 3), 'circ')
room('F3', '仆役前室 / 布草', R(-20, -14, -12, -3), 'support', access='仆从动线')
room('F3', '走廊', R(-14, -12, -12, -9), 'circ')
room('F3', '布草间', R(-20, -15, 3, 8), 'support')
room('F3', '走廊', R(-14, -8, -1, 1), 'circ')

for bid in ('w_pav', 'e_pav', 'belvedere'):
    room('F3', BLK_CN[bid] + '三层', blk_poly(bid), 'open', note='', block=bid)
for fl in ('F1', 'F2'):
    for bid in ('w_wing_b', 'w_pav', 'e_pav', 'belvedere') + (('e_wing_a',) if fl == 'F1' else ()) + (('e_wing_b',) if fl == 'F1' else ()):
        if fl == 'F1' and bid == 'e_wing_a':
            room(fl, '东翼一层', R(22, 48, -13.5, 1.5), 'open', note='', block=bid); continue
        room(fl, BLK_CN[bid] + ('一层' if fl == 'F1' else '二层'), blk_poly(bid), 'open', note='', block=bid)

# ======================================================================== B2 医疗中心（放在最后，房间 id 不挪）
# 地下医疗中心（B2）：原「设备」未定用途体量的东段 16 × 11 m（不占卡房间）。
# 2088 年的庄园急救 / 医疗设施（再生医学、假肢与仿生肢适配、诊断）；模型 blender/estate2/medical_b2.py，同一坐标。
# 洁净流线：医护 主廊 → 主人通道前室 → 缓冲更衣间（气闸、更衣、刷手）→ 无菌处置室；患者 主廊 → 前厅 → 气密转运门；器械 前厅 → 洗消间 → 传递窗。
MED_U = dict(access='主人 / 女仆长 / 医护')
room('B2', '医疗中心前厅', R(4, 8, -3, 8), 'medical', note='地下医疗中心（B2）入口：接诊台、转运床停放；南接主廊，东墙气密患者转运门进无菌处置室、另一门进器械洗消间', **MED_U)
room('B2', '器械洗消间', R(8, 14, -3, 1.5), 'medical', note='器械清洗、灭菌柜；传递窗通无菌处置室', **MED_U)
room('B2', '缓冲更衣间', R(14, 20, -3, 1.5), 'medical', note='气闸 + 更衣：两道互锁密闭门、风淋、洁净服柜、刷手槽；南门接主人通道前室', **MED_U)
room('B2', '无菌处置室', R(8, 20, 1.5, 8), 'medical', note='急救 / 处置 / 小手术：手术台、无影灯、吊塔监护、呼吸机、除颤、抢救车、医用气体、洁净送风天花',
     furn=[(13.1, 14.9, 3.8, 5.8), (8.3, 9.0, 3.0, 7.0)], **MED_U)


# ======================================================================== 输出
INFER = lambda r: '未定用途体量'
for _r in ROOMS:
    if _r['kind'] == 'open' and _r['name'] != '三楼公共区':
        _r['name'] = INFER(_r)
    if _r['block'] not in ('hall', 'porch', 'tower', 'w_low', 'n_link') and _r['kind'] == 'open':
        _r['note'] = (_r['note'] + '；' if _r['note'] else '') + '与相邻体块直接相通（门洞在两体块相接的墙上）'
_n = 0
for _r in ROOMS:
    if _r['card_id'] == 'F3-C01':
        _n += 1; _r['no'] = _n
KIND_C = {'card': '#f4ecd8', 'restricted': '#d9d4cc', 'support': '#e3e6ea', 'circ': '#fbfaf7', 'open': '#e4ecd9', 'owner': '#e6dcef', 'medical': '#dcecef'}
KIND_CN = {'card': '房间', 'restricted': '房间（只写名字，不描述）', 'support': '辅助：楼梯 / 电梯 / 卫浴 / 设备', 'circ': '走廊 / 过厅', 'open': '未定用途体量（留白）', 'owner': '主人专用通道', 'medical': '医疗中心房间'}


def check():
    """面积核对（卡面积 ±15%）+ 同层重叠检查（0.25 m 栅格）。"""
    bad = []
    for r in ROOMS:
        a = area(r['poly']); r['area'] = round(a, 1)
        if r['card_area'] and abs(a - r['card_area']) / r['card_area'] > 0.15:
            bad.append(f"{r['floor']} {r['name']} {a:.0f} vs 卡 {r['card_area']}")
        if r['range'] and not (r['range'][0] * 0.95 <= a <= r['range'][1] * 1.05):
            bad.append(f"{r['floor']} {r['name']} {a:.0f} 不在 {r['range']}")
    for fl, *_ in FLOORS:
        g = np.zeros((int(140 / .25), int(160 / .25)), np.int16)
        for r in ROOMS:
            if r['floor'] != fl:
                continue
            xs = [p[0] for p in r['poly']]; ys = [p[1] for p in r['poly']]
            if len(r['poly']) == 4 and len(set(xs)) == 2:   # 轴对齐矩形
                i0, i1 = int((min(ys) + 60) / .25 + .5), int((max(ys) + 60) / .25 + .5)
                j0, j1 = int((min(xs) + 80) / .25 + .5), int((max(xs) + 80) / .25 + .5)
                g[i0:i1, j0:j1] += 1
        if (g > 1).any():
            bad.append(f'{fl} 有房间重叠 {(g > 1).sum() * .0625:.1f} ㎡')
    return bad


def draw(fl, ax, title=True, small=False):
    fs = 5.2 if small else 7.2
    ax.set_facecolor('#ffffff')
    zf = [z for i, n, z in FLOORS if i == fl][0]
    # 体块外轮廓（本层存在的）
    for bid, b in BLK.items():
        st = STOREYS[bid]
        if fl.startswith('B'):
            continue
        if int(fl[1]) > st:
            if fl == 'F2' and bid == 'porch':
                continue
            ax.add_patch(Polygon(blk_poly(bid), closed=True, fc='none', ec='#b8b8b8', lw=0.6, ls=(0, (4, 3)), zorder=1))   # 下层屋面
            continue
    if fl.startswith('B'):
        x0, x1, y0, y1 = BASEMENT_RECT
        ax.add_patch(Polygon(R(-54, 54, -24.5, 17), closed=True, fc='none', ec='#c8c8c8', lw=0.5, ls=(0, (4, 3)), zorder=1))
    for r in sorted([r for r in ROOMS if r['floor'] == fl], key=lambda r: r['kind'] != 'open'):
        ax.add_patch(Polygon(r['poly'], closed=True, fc=KIND_C[r['kind']], ec='#3a3a3a', lw=0.9, zorder=2,
                             hatch=None))
        for f in r['furn']:
            ax.add_patch(Rectangle((f[0], f[2]), f[1] - f[0], f[3] - f[2], fc='#cfc6b4', ec='#8a8272', lw=0.35, zorder=3))
    # 外墙加粗
    outer = []
    if fl.startswith('B'):
        outer = [R(*BASEMENT_RECT)]
    else:
        outer = [blk_poly(b) for b in BLK if STOREYS[b] >= int(fl[1]) and not (b == 'porch')]
    for p in outer:
        ax.add_patch(Polygon(p, closed=True, fc='none', ec='#111', lw=2.2 if not small else 1.4, zorder=1.9))
    if fl == 'F1':
        ax.add_patch(Polygon(R(-8, 8, -24.5, -16), closed=True, fc='none', ec='#111', lw=0.8, ls=(0, (2, 2)), zorder=4))
        for i in range(6):
            ax.add_patch(Circle((-7.2 + i * 2.88, -24.0), 0.45, fc='#555', ec='none', zorder=5))
        ax.add_patch(Circle((0, -11), 4.0, fc='none', ec='#7a6a50', lw=0.8, ls=(0, (3, 2)), zorder=5))
        ax.text(0, -11.2, '圆形下沉区', ha='center', va='center', fontsize=fs * .8, color='#7a6a50', zorder=6)
    if fl == 'F3':
        ax.add_patch(Circle((0, -2), 6.2, fc='none', ec='#7a6a50', lw=0.8, ls=(0, (5, 3)), zorder=5))
        ax.text(0, 0.1, '上方：穹顶鼓座（转换梁框 20×12 m，四角墩柱）\n中央灯亭天窗采光，不算楼层', ha='center', va='center', fontsize=fs * .75, color='#7a6a50', zorder=6)
        ax.text(-17, -17, '上方：屋顶眺望亭', ha='center', va='center', fontsize=fs * .7, color='#7a6a50', zorder=6)
    # 穹顶结构：鼓座落在 20 × 12 m 转换梁框上，四角墩柱 (±10, −9) / (±10, 3) 从 B2 贯到 F3（落在大厅 / 餐厅墙角）
    for px, py in ((-10, -9), (10, -9), (-10, 3), (10, 3)):
        ax.add_patch(Rectangle((px - 0.6, py - 0.6), 1.2, 1.2, fc='#333', ec='none', zorder=6))
    if fl == 'F3':
        ax.add_patch(Rectangle((-10, -9), 20, 12, fc='none', ec='#7a6a50', lw=0.9, ls=(0, (6, 2, 1, 2)), zorder=5))
    if fl.startswith('B'):   # 地下柱网（与 F1 墙线对齐）；±0.0 为转换板
        for px in (-20, -10, 0, 10, 20):
            for py in (-14, -6, -3, 8):
                ax.add_patch(Rectangle((px - 0.35, py - 0.35), 0.7, 0.7, fc='#555', ec='none', zorder=6))
        ax.text(0, 9.5, '柱网 10 m × (8 / 3 / 11 m)，与 F1 墙线对齐；±0.0 为转换板', ha='center', fontsize=fs * .75, color='#555')
    if fl == 'F1':
        ax.text(0, -8.2, '穹顶墩柱（B2–F3 贯通）', ha='center', fontsize=fs * .7, color='#333', zorder=7)
    # 楼梯踏步线
    for (x0, x1, y0, y1), n in (((-21.5, -18, -21.5, -12.5), 10), ((-16, -12.5, -21.5, -12.5), 10), ((-19.6, -16.6, -2.6, 2.6), 9)):
        if fl.startswith('B') and y1 < -10:
            continue
        if not (fl in ('F1', 'F2', 'F3') or x0 > -20):
            continue
        for k in range(n + 1):
            yy = y0 + (y1 - y0) * k / n
            ax.plot([x0, x1], [yy, yy], color='#777', lw=0.35, zorder=5)
    ax.add_patch(Rectangle((-15.9, -2.5), 1.6, 1.6, fc='none', ec='#555', lw=0.6, zorder=5))
    ax.plot([-15.9, -14.3], [-2.5, -0.9], color='#555', lw=0.5, zorder=5); ax.plot([-15.9, -14.3], [-0.9, -2.5], color='#555', lw=0.5, zorder=5)
    if fl != 'F3':
        ax.add_patch(Circle((18.9, -8.9), 0.8, fc='none', ec='#6a4c90', lw=0.6, zorder=5))
        ax.add_patch(Rectangle((16.3, -9.7), 1.4, 1.4, fc='none', ec='#6a4c90', lw=0.6, zorder=5))
    # 标签
    for r in [r for r in ROOMS if r['floor'] == fl]:
        xs = [p[0] for p in r['poly']]; ys = [p[1] for p in r['poly']]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        w = max(xs) - min(xs); h = max(ys) - min(ys)
        nm = r['name']
        if r['kind'] in ('circ',) and area(r['poly']) < 30:
            continue
        lab = nm if 'no' not in r else f"寝{r['no']}"
        if 'no' in r:
            ax.text(cx, cy, lab, ha='center', va='center', fontsize=fs * .8, zorder=7); continue
        if r['kind'] in ('card', 'restricted') or area(r['poly']) >= 25:
            lab += f"\n{r['area']:.0f} ㎡" + (f"（卡 {r['card_area']}）" if r['card_area'] else (f"（卡 {r['range'][0]}–{r['range'][1]}）" if r['range'] else ''))
        rot = 90 if (h > w * 1.6 and w < 6) else 0
        ax.text(cx, cy, lab, ha='center', va='center', fontsize=fs if r['kind'] in ('card', 'restricted', 'owner') else fs * .82, rotation=rot,
                color='#222' if r['kind'] != 'open' else '#666', zorder=7, linespacing=1.1,
                fontweight='bold' if r['kind'] in ('card', 'restricted') else 'normal')
    # 轴网（主楼 5 m 柱网）
    gx = list(range(-20, 21, 5)); gy = [-16, -11, -6, -3, 3, 8]
    for i, x in enumerate(gx):
        ax.plot([x, x], [-27.5, -25.5], color='#999', lw=0.4, zorder=0)
        ax.add_patch(Circle((x, -28.5), 0.9, fc='white', ec='#888', lw=0.5, zorder=6))
        ax.text(x, -28.5, 'ABCDEFGHI'[i], ha='center', va='center', fontsize=fs * .7, zorder=7)
    for i, y in enumerate(gy if fl[0] == 'B' else []):
        ax.add_patch(Circle((-58 if fl[0] == 'F' else -25, y), 0.9, fc='white', ec='#888', lw=0.5, zorder=6))
        ax.text(-58 if fl[0] == 'F' else -25, y, str(i + 1), ha='center', va='center', fontsize=fs * .7, zorder=7)
    if fl.startswith('B'):
        ax.set_xlim(-28, 24); ax.set_ylim(-31, 12)
    else:
        ax.set_xlim(-80, 76); ax.set_ylim(-31, 46)
    ax.set_aspect('equal'); ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)
    # 比例尺 + 指北
    bx, by = (ax.get_xlim()[1] - 12, ax.get_ylim()[0] + 2.5)
    for k in range(2):
        ax.add_patch(Rectangle((bx + k * 5, by), 5, 0.7, fc='#222' if k == 0 else 'white', ec='#222', lw=0.5, zorder=8))
    ax.text(bx, by + 1.4, '0', fontsize=fs * .7, ha='center'); ax.text(bx + 10, by + 1.4, '10 m', fontsize=fs * .7, ha='center')
    nx, ny = ax.get_xlim()[1] - 4, ax.get_ylim()[1] - 6
    ax.annotate('', xy=(nx, ny + 3), xytext=(nx, ny - 1), arrowprops=dict(arrowstyle='-|>', color='#222', lw=1))
    ax.text(nx, ny + 4, 'N', ha='center', fontsize=fs)
    if title:
        name = [n for i, n, z in FLOORS if i == fl][0]
        ax.set_title(f'伊甸庄园主楼 · {fl} {name}（楼面 {zf:+.1f} m）', fontsize=fs * 1.6, loc='left')


def legend(ax, fs=7):
    hs = [Rectangle((0, 0), 1, 1, fc=KIND_C[k], ec='#3a3a3a', lw=.6, hatch=None) for k in KIND_C]
    ax.legend(hs, [KIND_CN[k] for k in KIND_C], loc='upper left', fontsize=fs, frameon=False, ncol=4, bbox_to_anchor=(0, -0.01))


NOTE = ('房间名、面积、功能只取 docs/card-digest.md §6（地上 3 层 + 地下 2 层）；穹顶与塔顶眺望亭是屋顶构筑物，不算楼层。'
        '竖向：塔楼主楼梯 F1–F3（主人 / 访客）；仆役核 B2–F3（仆从动线，B2 门禁）；主人专用通道 B2–F2（会客厅暗门、主卧衣帽间）。'
        '未定用途的体量留白，不编用途；家具只画中性色块。')


def main():
    bad = check()
    if bad:
        print('核对未过：'); [print('  ', b) for b in bad]
    out = os.path.join(ROOT, 'docs', 'drafts')
    for fl, *_ in FLOORS:
        big = fl.startswith('F')
        fig, ax = plt.subplots(figsize=(16, 8.6) if big else (11, 9.6), dpi=150)
        fig.subplots_adjust(0.01, 0.09 if big else 0.14, 0.99, 0.95)
        draw(fl, ax); legend(ax)
        fig.text(0.01, 0.012, NOTE, fontsize=6.3, color='#555', wrap=True)
        if fl == 'F3':
            fig.text(0.44, 0.93, '个人寝室面积（卡 15–20 ㎡）\n' + '\n'.join(f"寝{r['no']}  {r['area']:.0f} ㎡" for r in ROOMS if 'no' in r), fontsize=7, va='top', family=plt.rcParams['font.family'])
        fig.savefig(os.path.join(out, f'eden2_plan_{fl}.png'), facecolor='white'); plt.close(fig)
    fig = plt.figure(figsize=(24, 17), dpi=110)
    lay = {'F3': (0.01, 0.645, 0.64, 0.30), 'F2': (0.01, 0.34, 0.64, 0.31), 'F1': (0.01, 0.02, 0.64, 0.31),
           'B1': (0.66, 0.52, 0.33, 0.40), 'B2': (0.66, 0.10, 0.33, 0.40)}
    for fl, rect in lay.items():
        ax = fig.add_axes(rect); draw(fl, ax, small=True)
    ax = fig.add_axes((0.66, 0.02, 0.33, 0.06)); ax.axis('off'); legend(ax, fs=8)
    fig.text(0.01, 0.985, '伊甸庄园主楼 · 分层平面（B2–F3）', fontsize=18, va='top')
    fig.text(0.40, 0.985, NOTE, fontsize=8, va='top', color='#555', wrap=True)
    fig.savefig(os.path.join(out, 'eden2_plans_sheet.png'), facecolor='white'); plt.close(fig)
    # 数据
    WORDS = {c: w for c, f, n, w in CARD_ROOMS}
    data = dict(
        _note='伊甸主楼分层房间多边形（blender/estate2/floorplans.py 生成，不要手改）。坐标与 blender/estate2/layout.py 相同：x 东、y 北、米，−y 是正门；'
              '楼层按卡：F1–F3 + B1–B2，穹顶与塔顶眺望亭是屋顶构筑物。kind：card 有卡内编号的房间 / restricted 只写名字不描述（name 照抄卡原名）/ support 辅助 / circ 走廊 / open 未定用途的体量 / owner 主人专用 / medical 医疗中心。',
        version=1, src='docs/card-digest.md §6', units='m',
        floors=[dict(id=i, name=n, z=z) for i, n, z in FLOORS],
        blocks=[dict(id=b, name=BLK_CN[b], storeys=STOREYS[b], poly=blk_poly(b)) for b in BLK],
        basement=R(*BASEMENT_RECT),
        cores=[dict(id='stair', name='主楼梯（塔楼）', floors=['F1', 'F2', 'F3'], poly=TOWER, access='主人 / 访客 / 住客'),
               dict(id='service', name='仆役核', floors=['B2', 'B1', 'F1', 'F2', 'F3'], poly=SVC, access='仆从动线；B2 门禁'),
               dict(id='owner', name='主人专用通道', floors=['B2', 'B1', 'F1', 'F2'], poly=OWN, access='仅主人')],
        rooms=[dict(no=r.get('no'), id=f"{r['floor']}-{k:02d}", floor=r['floor'], name=r['name'], kind=r['kind'], block=r['block'], area=r['area'],
                    card_area=r['card_area'], card_range=r['range'], card_id=r['card_id'], note=r['note'], access=r['access'],
                    words=WORDS.get(r['card_id'], []), synonyms=SYNONYMS.get(r['card_id'], []), poly=[list(p) for p in r['poly']])
               for k, r in enumerate(ROOMS)],
        card_rooms=[dict(cid=c, floor=f, order=int(c[-2:]), name=n, words=w, synonyms=SYNONYMS.get(c, []),
                         poly_ids=[f"{r['floor']}-{k:02d}" for k, r in enumerate(ROOMS) if r['card_id'] == c]) for c, f, n, w in CARD_ROOMS],
        card_id_alias=CARD_ID_ALIAS, retired_names=RETIRED_NAMES,
    )
    with open(os.path.join(ROOT, 'map', 'data', 'eden_estate_rooms.json'), 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    n = sum(1 for r in ROOMS if r['kind'] in ('card', 'restricted'))
    print(f'出图 5 张 + 总图；卡房间 {n} 间；核对问题 {len(bad)} 条')


if __name__ == '__main__':
    main()
