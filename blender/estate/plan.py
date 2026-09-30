# 伊甸庄园 · 平面数据（唯一数据源）。由 docs/eden-estate.md 转录；别名与英文名沿用 map/estate/plan.js（与 maps.json eden_estate 对齐）。
# 纯 Python，不依赖 bpy：`python3 blender/estate/plan.py` 运行自检（validate）。
# 所有权：架构（lead）。两位建造者只读；要改数据，先在 CONTRACT.md 的「变更记录」里写一行。
#
# 坐标（CONTRACT.md §1）：
#   府邸坐标 = Blender 世界坐标：原点在中央主楼中心，x 向东，+y 向后（湖），正面 = −y（前庭、停靠平台），z 向上，1 单位 = 1 m。
#   岛坐标：原点在岛顶面中心，轴向相同；岛 y = 府邸 y + 25（i2m / m2i）。
#   z：F1 楼面 = 花园地坪 = 0.00。
#   房间 rect = (x0, x1, y0, y1)，是墙中线围成的矩形（相邻房间共用边，墙厚向两侧各分一半）。
import math

# ---------------------------------------------------------------- 楼层
SLAB = 0.30                     # 楼板厚（楼面以下）
FLOORS = {                      # id: 楼面标高 z, 默认净高, 中文, 英文
    'B1': dict(z=-4.50, h=3.6, name='地道前室', name_en='Basement'),
    'F1': dict(z=0.00, h=4.2, name='礼仪层', name_en='State Floor'),
    'F2': dict(z=4.50, h=4.2, name='日常层', name_en='Daily Floor'),
    'F3': dict(z=9.00, h=4.2, name='私人层', name_en='Private Floor'),
    'F4': dict(z=13.50, h=4.2, name='服务层', name_en='Service Floor'),
    'F5': dict(z=18.85, h=4.0, name='眺望层', name_en='Lookout Floor'),
}
FLOOR_ORDER = ['B1', 'F1', 'F2', 'F3', 'F4', 'F5']
CUT = 1.20                      # 剖切：该层楼面以上 1.2 m
GROUND_Z = 0.00                 # 室外地坪（设定：花园地坪 = F1 楼面）
MAIN_TOP = 18.00                # 主楼 F4 顶棚结构面；18.00–18.85 是屋面构造，F5 屋顶平台面 18.85
WING_TOP = 13.50                # 两翼屋面（铅皮平屋顶面）
def fz(fl): return FLOORS[fl]['z']

# ---------------------------------------------------------------- 墙厚
WALL_EXT = 0.90                 # 外墙：砖芯白石贴面承重墙（中线在体块边）
WALL_BEARING = 0.60             # 内部承重墙：BEARING_LINES 上的墙
WALL_PART = 0.30                # 普通房间隔墙
WALL_SUB = 0.15                 # 套间内部小隔墙（parts）
BEARING_LINES = [               # (轴, 坐标, 范围 a0, a1, 楼层)：主楼过厅两侧、眺望亭鼓座下的方框、主楼与两翼相接的原外墙
    ('y', -2.0, -20, 20, 'F1 F2 F3 F4'), ('y', 6.0, -20, 20, 'F1 F2 F3 F4'),
    ('x', -8.0, -22, 22, 'F4'), ('x', 8.0, -22, 22, 'F4'), ('y', -10.0, -8, 8, 'F4'),
    ('x', -20.0, -22, 22, 'F1 F2 F3'), ('x', 20.0, -22, 22, 'F1 F2 F3'),
    ('y', -2.0, -54, -20, 'F1 F2 F3'), ('y', 2.0, -54, -20, 'F1 F2 F3'), ('y', -2.0, 20, 54, 'F1 F2 F3'), ('y', 2.0, 20, 54, 'F1 F2 F3'),
]

# ---------------------------------------------------------------- 体块（外墙中线）
BLOCKS = {
    'A':  dict(name='中央主楼', name_en='Main House', rect=(-20, 20, -22, 22), floors=['F1', 'F2', 'F3', 'F4'], top=MAIN_TOP, roof='terrace'),
    'BW': dict(name='西翼', name_en='West Wing', rect=(-54, -20, -16, 16), floors=['F1', 'F2', 'F3'], top=WING_TOP, roof='lead_flat'),
    'BE': dict(name='东翼', name_en='East Wing', rect=(20, 54, -16, 16), floors=['F1', 'F2', 'F3'], top=WING_TOP, roof='lead_flat'),
    'CW': dict(name='西柱廊连廊', name_en='West Colonnade', rect=(-78, -54, -3, 3), floors=['F1'], top=5.5, roof='lead_flat', open=True),
    'CE': dict(name='东柱廊连廊', name_en='East Colonnade', rect=(54, 78, -3, 3), floors=['F1'], top=5.5, roof='lead_flat', open=True),
    'C':  dict(name='图书馆塔亭', name_en='Library Pavilion', rect=(-102, -78, -12, 12), floors=['F1', 'F2'], top=10.0, roof='lead_flat',
               tower=dict(shape='octagon', r=6.0, top=28.0, cupola='lead', finial='armillary_gold')),
    'D':  dict(name='音乐厅亭', name_en='Music Pavilion', rect=(78, 102, -16, 16), floors=['F1'], top=11.0, roof='barrel_lead',
               apse=dict(c=(90, 16), r=6.0)),     # 北端（+y）半圆后殿安管风琴
}
PORTICO = dict(rect=(-15.5, 15.5, -29.5, -22), col_x=[-13, -8, -3, 3, 8, 13], col_y=-28.5, col_d=1.35, col_h=13.5,
               order='corinthian', entablature=2.9, pediment_pitch=1 / 4.5, crest='gold_leaf', steps=2)
BELVEDERE = dict(c=(0.0, -2.0), r_out=7.0, r_in=6.4, wall=0.6, z=18.85, drum_h=4.0, pilasters=16, arch_windows=8,
                 dome='lead', lantern=True, finial='gold_pinecone')
CHIMNEYS = [(-44, -9), (-30, -9), (-44, 9), (-30, 9), (30, -9), (44, -9), (30, 9), (44, 9)]   # 两翼屋面烟囱（落在承重墙线附近）

# ---------------------------------------------------------------- 立面开间（窗轴，府邸坐标）
# 决定：主楼正面按门廊柱间距排窗（5 个柱间 + 两侧各 1），不用 4.2 m 等分，免得窗被柱子挡住；其余立面 4.2 m 开间。
FACADE = {
    'A.S':  dict(axes=[-17.75, -10.5, -5.5, 0.0, 5.5, 10.5, 17.75], line=-22, door_axis=0.0),      # 正面：中轴是大门
    'A.N':  dict(axes=[-16.8 + 4.2 * k for k in range(9)], line=22, door_axis=0.0, french=[-4.2, 0.0, 4.2]),   # 背面 9 开间，花园厅 3 扇落地窗
    'A.W':  dict(axes=[-19.0, 19.0], line=-20),          # 主楼侧面只在两翼前后露出的 6 m 段各 1 窗；F4 全长见 A.W4
    'A.E':  dict(axes=[-19.0, 19.0], line=20),
    'A.W4': dict(axes=[-16.8 + 4.2 * k for k in range(9)], line=-20, floors=['F4']),
    'A.E4': dict(axes=[-16.8 + 4.2 * k for k in range(9)], line=20, floors=['F4']),
    'BW.S': dict(axes=[-37 + 4.2 * k for k in range(-3, 4)], line=-16),
    'BW.N': dict(axes=[-37 + 4.2 * k for k in range(-3, 4)], line=16),
    'BW.W': dict(axes=[4.2 * k for k in range(-3, 4)], line=-54, door_axis=None),
    'BE.S': dict(axes=[37 + 4.2 * k for k in range(-3, 4)], line=-16),
    'BE.N': dict(axes=[37 + 4.2 * k for k in range(-3, 4)], line=16),
    'BE.E': dict(axes=[4.2 * k for k in range(-3, 4)], line=54, door_axis=None),
}
WINDOWS = {   # 每层窗型：宽、高、窗台高（相对楼面）、头部。F2 为主层（piano nobile）
    'F1': dict(w=1.5, h=3.0, sill=0.8, head='arch', rusticated=True),
    'F2': dict(w=1.6, h=3.3, sill=0.5, head='pediment_alt', balconette=True),     # 三角 / 弧形窗楣交替
    'F3': dict(w=1.5, h=2.2, sill=0.9, head='flat'),
    'F4': dict(w=1.2, h=1.1, sill=3.0, head='flat', attic=True),                   # 檐口以上的顶楼小方窗
    'glass': '6+6', 'glass_color': '#2B3238', 'frame': 'stone_trim',
}
BELT_Z = [4.35, 8.85]           # 腰线
CORNICE = dict(z=13.5, h=2.9)   # 主楼檐部与门廊檐部同高（F3 顶），两翼檐口同一标高

# ---------------------------------------------------------------- 房间
# R(id, 中文名, 英文名, 楼层, rect, **字段)。字段：
#   kind       陈设配方（rooms.furnish 按它分派；见 CONTRACT.md §5）
#   zone       叠加层分区：guest / master / family / staff（颜色见 ZONE_COLORS）
#   rank       1 主要房间（有近景）/ 2 次要 / 3 服务
#   floor_mat / wall_mat  地面与墙面饰面（材质名，见 CONTRACT.md 材质表）
#   h          净高（缺省取楼层净高；0 = 无顶，如大厅上空）
#   minor      走廊、楼梯平台类：剖切图上不标名字
#   void       挑空（无楼板）；container  只是底面，上面还有其他房间（F5 屋顶平台）
#   round      圆形房间 (cx, cy, r)
#   parts      套间内部分间 {名字: rect 或 [rect, ...]}；由 shell 建 0.15 m 隔墙
#   alias / alias_en  查看器命中用的叫法（maps.json eden_estate 的 rooms / rooms_en 必须全部命中）
#   use / heritage   设定摘录（家具到件见 docs/eden-estate.md §4）
def R(id, name, name_en, floor, rect, **kw):
    d = dict(id=id, name=name, name_en=name_en, floor=floor, rect=tuple(float(v) for v in rect), kind='generic', zone='guest', rank=2,
             floor_mat='oak_plank', wall_mat='plaster_cream', h=None, minor=False, void=False, container=False, round=None, parts={},
             alias=[], alias_en=[], use='', heritage='')
    d.update(kw)
    if d['h'] is None: d['h'] = FLOORS[floor]['h']
    d['z'] = FLOORS[floor]['z']
    return d

ROOMS = [

    # ---------------- F1 ----------------
    R('101', '大厅', 'Grand Hall', 'F1', (-12, 12, -22, -2), kind='hall', zone='guest', rank=1, floor_mat='marble_checker_diag', wall_mat='plaster_stone', h=8.7, alias=['大厅', '门厅', '玄关'], alias_en=['Grand Hall', 'Entrance Hall', 'Hall'], use='入口大厅，通高 8.7 m：斜置棋盘格大理石地面，中心嵌家徽圆盘；x = ±8 两列仿斑岩科林斯柱；镀金边桌与壁镜、红丝绒长凳、落地长箱钟、铜框告示板、青花大瓶', heritage='初代奠基人订制的胡桃木长箱钟，高 2.6 m，表盘上是天城初建时的星图，每到整点报出庄园的建成日。'),
    R('102', '衣帽间', 'Cloakroom', 'F1', (-20, -12, -22, -12), kind='cloakroom', zone='guest', rank=3, floor_mat='oak_herringbone', wall_mat='panel_mahogany', alias=['衣帽间'], alias_en=['Cloakroom'], use='桃花心木衣柜到顶，40 个编号黄铜衣钩，伞架、靴凳、鎏金全身镜、手套与帽盒柜', heritage='每个挂钩下有珐琅编号牌，二代时为舞会订制，至今没有换过。'),
    R('103', '访客盥洗室', 'Guest Cloakroom', 'F1', (-20, -12, -12, -2), kind='powder_room', zone='guest', rank=2, floor_mat='marble_checker_small', wall_mat='silk_green', parts={'wc': [(-20, -16, -8, -2), (-16, -12, -8, -2)]}, alias=['访客盥洗室', '洗手间'], alias_en=['Guest Cloakroom', 'Powder Room'], use='前室（缎木化妆台、软凳、小沙发）+ 两间独立化妆间：高位桃花心木水箱马桶、大理石洗手台、椭圆镜、蜂窝纹擦手巾与叠放小方巾', heritage='水箱侧面有铸铜铭牌，写着制造厂和「第三代翻新」的年份。'),
    R('104', '门房', "Porter's Lodge", 'F1', (12, 20, -22, -12), kind='porter', zone='guest', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['门房'], alias_en=["Porter's Lodge"], use='柜台式写字台、访客登记簿台、钥匙柜、温莎椅、访客艇停泊信号面板', heritage='历代访客签名簿全部存在这里，最早一册的皮面已经褪成浅棕。'),
    R('105', '候见室', 'Anteroom', 'F1', (12, 20, -12, -2), kind='anteroom', zone='guest', rank=2, floor_mat='oak_versailles', wall_mat='damask_crimson', alias=['候见室'], alias_en=['Anteroom', 'Waiting Room'], use='勒万托红大理石壁炉、一对扶手椅、三人沙发、茶几、报刊架、赫里兹地毯、两幅天城下层风景画', heritage='壁炉上挂的风景画是天城建城初期的「下层港口」，画里的港口今天已经不存在。'),
    R('106', '一层过厅', 'Cross Hall', 'F1', (-20, 20, -2, 6), kind='cross_hall', zone='guest', rank=2, floor_mat='marble_statuario', wall_mat='plaster_stone', alias=['过厅', '一层过厅'], alias_en=['Cross Hall'], use='东西贯通的横厅，两端门对两翼，形成 204 m 景深；大理石边桌、历代家主胸像台座 ×6、铜框玻璃灯笼', heritage='六尊胸像按年代排开，最新一座台座留空，给现任家主。'),
    R('107', '花园厅', 'Garden Hall', 'F1', (-8, 8, 6, 22), kind='garden_hall', zone='guest', rank=1, floor_mat='oak_versailles', wall_mat='silk_duckegg', alias=['花园厅'], alias_en=['Garden Hall', 'Garden Room'], use='面湖的厅：两组香槟丝绒沙发、圆形镶嵌桌、三角钢琴、四面落地镜对三扇落地窗，出窗即后庭台阶', heritage='钢琴盖板内侧写着三代家主婚礼那天的日期，此后每一场婚礼都在这里弹奏同一首曲子。'),
    R('108', '主楼梯厅', 'Stair Hall', 'F1', (8, 20, 6, 22), kind='stair_hall', zone='guest', rank=2, floor_mat='marble_statuario', wall_mat='plaster_stone', h=13.2, alias=['楼梯厅', '主楼梯厅', '楼梯'], alias_en=['Stair Hall', 'Grand Staircase'], use='石材悬挑双跑回转梯（F1 → F3，梯段宽 2.2 m，锻铁鎏金栏杆），梯井中央是黄铜笼式电梯，顶部天光井', heritage='黄铜笼式电梯是第三代装的第一部以太电梯。楼层指针还是原装的机械表盘，指针停在「3」的时候会轻响一声。'),
    R('109', '仆役楼梯', 'Service Stair', 'F1', (-20, -14, 6, 14), kind='service_stair', zone='staff', rank=3, floor_mat='stone_flag', wall_mat='panel_paint_ivory', minor=True, alias=['仆役楼梯'], alias_en=['Service Stair'], use='石踏步、铁栏杆，贯通 B1–F5；内有 1.2 × 1.2 m 食梯'),
    R('110', '值班室', 'Staff Duty Room', 'F1', (-20, -14, 14, 22), kind='duty_room', zone='staff', rank=3, floor_mat='lino', wall_mat='panel_paint_ivory', alias=['值班室', '仆从值班室'], alias_en=['Staff Duty Room', 'Duty Room'], use='铃板（36 个房间铃，以太指示灯）、值班桌、排班表板、制服衣柜、茶水台', heritage='铃板上最旧的那块铜牌写着「育婴室」，这个房间早已改作他用，但铜牌一直留着。'),
    R('111', '银器室', 'Silver Room', 'F1', (-14, -8, 6, 14), kind='silver_room', zone='staff', rank=3, floor_mat='stone_flag', wall_mat='panel_paint_ivory', alias=['银器室'], alias_en=['Silver Room'], use='保险柜门、擦银台、垫呢银器抽屉、瓷器登记簿', heritage='二代订制的 120 件银餐具，每件底部刻有家徽和序号，至今一件不缺。'),
    R('112', '主人通道底站', 'Master Passage (Ground)', 'F1', (-14, -8, 14, 22), kind='master_passage', zone='master', rank=3, floor_mat='stone_flag', wall_mat='panel_walnut', alias=['主人通道底站'], alias_en=['Master Passage (Ground)'], use='石材螺旋梯加单人电梯（胡桃木轿厢）；后墙有一道与石缝对齐的暗门，出门是通往机库的紫藤廊'),
    R('113', '餐厅', 'Dining Room', 'F1', (-44, -20, -16, -2), kind='dining', zone='guest', rank=1, floor_mat='oak_versailles', wall_mat='silk_blue', alias=['餐厅', '饭厅'], alias_en=['Dining Room'], use='可伸缩桃花心木长餐桌（最长 18 m，24 座）、两台餐具柜、两座卡拉拉白壁炉、历代宴会图、塞夫尔蓝金边餐具、三盏 36 臂水晶吊灯', heritage='主位椅背上雕着家徽，是唯一不配套的一把椅子，初代从旧宅带来。'),
    R('114', '早餐室', 'Breakfast Room', 'F1', (-54, -44, -16, -2), kind='breakfast', zone='guest', rank=2, floor_mat='marble_checker_small', wall_mat='plaster_yellow_mural', alias=['早餐室'], alias_en=['Breakfast Room'], use='胡桃木圆桌加 8 把椅子、边柜、黄铜罩早餐保温柜、盆栽柑橘；手绘藤蔓墙画', heritage='墙画里的藤蔓间藏着历代孩子的名字缩写，是每一代装修时画师偷偷加的。'),
    R('115', '西翼廊', 'West Corridor', 'F1', (-54, -20, -2, 2), kind='wing_corridor', zone='guest', rank=2, floor_mat='marble_statuario', wall_mat='plaster_stone', minor=True, alias=['西翼廊'], alias_en=['West Corridor'], use='大理石地面，拱顶，一排肖像'),
    R('116', '备餐间', 'Servery', 'F1', (-34, -20, 2, 16), kind='servery', zone='staff', rank=3, floor_mat='stone_flag', wall_mat='tile_white', alias=['备餐间', '厨房'], alias_en=['Servery', 'Kitchen'], use='保温柜、大理石备餐台、铜洗杯槽、食梯出口；连餐厅', heritage='墙上的旧式摇铃拉杆没有拆，改接了以太铃线。'),
    R('117', '瓷器与花艺室', 'China and Flower Room', 'F1', (-46, -34, 2, 16), kind='china_flower', zone='staff', rank=3, floor_mat='stone_flag', wall_mat='panel_paint_ivory', alias=['瓷器室', '花艺室'], alias_en=['China and Flower Room'], use='到顶玻璃门瓷器柜、大理石水槽、插花工作台、花器架', heritage='柜里有一套只在新家主继任宴上用的金边蓝瓷。'),
    R('118', '家族门厅', 'Family Entrance', 'F1', (-54, -46, 2, 16), kind='family_entrance', zone='family', rank=2, floor_mat='stone_flag', wall_mat='panel_walnut', alias=['家族门厅'], alias_en=['Family Entrance'], use='家人日常出入的门厅，西门通柱廊连廊与图书馆塔亭：靴凳、伞架、手杖架、温莎椅、地图柜', heritage='门框上有历代孩子量身高的刻线，漆过几遍都没有盖掉。'),
    R('119', '会客厅', 'Drawing Room', 'F1', (20, 44, -16, -2), kind='drawing_room', zone='guest', rank=1, floor_mat='oak_versailles', wall_mat='damask_crimson', alias=['会客厅', '客厅', '沙龙'], alias_en=['Drawing Room', 'Salon'], use='两组镀金红丝缎沙发、安乐椅、镶嵌边桌、Statuario 壁炉与 3 m 壁镜、家主全身肖像 ×2、瓷器陈列柜', heritage='壁炉上方原本是第二代家主的全身肖像，每一代新家主继位就把前任的肖像移到过厅，自己的挂上去；现在挂的是上一代。'),
    R('120', '绿厅', 'Green Room', 'F1', (44, 54, -16, -2), kind='green_parlour', zone='guest', rank=2, floor_mat='oak_plank', wall_mat='silk_green', alias=['绿厅', '小客厅', '小会客室'], alias_en=['Green Room', 'Small Parlour'], use='双人沙发、两把扶手椅、写字桌、书柜、阿尔卑斯绿大理石壁炉', heritage='写字桌抽屉里有一沓空白的家徽信笺，信头的烫金用的是和山花同一批金箔。'),
    R('121', '东翼廊', 'East Corridor', 'F1', (20, 54, -2, 2), kind='wing_corridor', zone='guest', rank=2, floor_mat='marble_statuario', wall_mat='plaster_stone', minor=True, alias=['东翼廊'], alias_en=['East Corridor'], use='大理石地面，拱顶，一排肖像'),
    R('122', '台球室', 'Billiard Room', 'F1', (20, 34, 2, 16), kind='billiards', zone='guest', rank=2, floor_mat='oak_plank', wall_mat='panel_walnut', alias=['台球室'], alias_en=['Billiard Room'], use='桃花心木台球桌、球杆架、记分板、高背皮椅 ×4、雪茄柜、小吧台', heritage='记分板上还用粉笔写着上一局的比分，按家规不擦。'),
    R('123', '珍藏室', 'Cabinet of Curiosities', 'F1', (34, 46, 2, 16), kind='collection', zone='guest', rank=2, floor_mat='oak_plank', wall_mat='panel_walnut', alias=['珍藏室'], alias_en=['Cabinet of Curiosities', 'Collection Room'], use='乌木框玻璃展柜：古地图、钱币、早期以太仪器、天城初建测绘图；中间一张放大镜阅读桌', heritage='天城初建的测绘图原件，边上有初代亲笔标注的「此岛可筑园」。'),
    R('124', '东门厅', 'East Entrance', 'F1', (46, 54, 2, 16), kind='family_entrance', zone='guest', rank=3, floor_mat='stone_flag', wall_mat='plaster_stone', alias=['东门厅'], alias_en=['East Entrance'], use='通向柱廊连廊和音乐厅的门厅：靴凳、伞架、衣帽架'),
    R('C1', '图书馆塔亭', 'Library Pavilion', 'F1', (-102, -78, -12, 12), kind='library', zone='guest', rank=1, floor_mat='oak_herringbone', wall_mat='panel_walnut', h=4.2, alias=['图书馆', '图书馆塔亭', '塔亭'], alias_en=['Library Pavilion', 'Pavilion Library'], use='两层通高书库（约 4 万册）：胡桃木书架与回廊、阅览长桌、天城早期以太学手稿柜；八角塔身到 28 m，顶上金色浑天仪', heritage='塔顶的金色浑天仪每年转一格，一圈正好是一百年。'),
    R('D1', '音乐厅', 'Music Room', 'F1', (78, 102, -16, 16), kind='music_room', zone='guest', rank=1, floor_mat='oak_versailles', wall_mat='plaster_stone', h=11.0, alias=['音乐厅', '音乐厅亭'], alias_en=['Music Room', 'Music Pavilion'], use='单层通高 11 m，筒拱藻井；北端半圆后殿安贴金管风琴（32 尺音管），厅内可排 120 座', heritage='管风琴最低的那根音管上刻着四代家主和建造匠人的名字。'),

    # ---------------- F2 ----------------
    R('201', '大厅上空', 'Hall Gallery', 'F2', (-12, 12, -22, -2), kind='hall_void', zone='guest', rank=3, floor_mat=None, wall_mat='plaster_stone', h=0.0, minor=True, void=True, parts={'gallery': (-12, 12, -4, -2)}, alias=['楼座', '乐师廊'], alias_en=['Hall Gallery'], use='大厅通高空间；后侧挑出 1.8 m 深的楼座作乐师廊，锻铁鎏金栏杆'),
    R('202', '茶室', 'Tea Room', 'F2', (-20, -12, -22, -2), kind='tea_room', zone='guest', rank=1, floor_mat='oak_herringbone', wall_mat='paper_chinoiserie', alias=['茶室'], alias_en=['Tea Room'], use='手绘中国风壁纸；三扇朝前庭的窗下各一组茶座，长沙发、漆器茶柜、银茶炊', heritage='中国风壁纸是二代的原物，一块褪色处保留原样，旁边玻璃框里存着当年的订货单。'),
    R('203', '客用侍从间', "Guest Valets' Room", 'F2', (12, 20, -22, -12), kind='valet', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['客用侍从间'], alias_en=["Guest Valets' Room"], use='侍从桌椅、熨衣台、客人行李架、铃板分机'),
    R('204', '客用布草间', 'Guest Linen Room', 'F2', (12, 20, -12, -2), kind='linen', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['客用布草间'], alias_en=['Guest Linen Room'], use='布草柜，毛巾按房间分格、每格标铜牌'),
    R('205', '二层过厅', 'First-floor Hall', 'F2', (-20, 20, -2, 6), kind='cross_hall', zone='guest', rank=2, floor_mat='oak_plank', wall_mat='plaster_stone', minor=True, alias=['二层过厅'], alias_en=['First-floor Hall'], use='橡木地面；两幅天城建城史巨幅挂毯'),
    R('206', '起居室', 'Morning Room', 'F2', (-8, 8, 6, 22), kind='sitting_room', zone='guest', rank=1, floor_mat='oak_versailles', wall_mat='silk_duckegg', alias=['起居室', '起居'], alias_en=['Morning Room', 'Sitting Room', 'Living Room'], use='L 形象牙沙发、安乐椅、棋桌、书柜、胡桃木立式钢琴、缎木写字台、卡拉卡塔金壁炉、三代同框的家庭群像', heritage='棋桌上的残局是四代家主去世前那一盘，至今没有人动过。'),
    R('207', '主楼梯平台', 'Stair Landing', 'F2', (8, 20, 6, 22), kind='stair_landing', zone='guest', rank=2, floor_mat='marble_statuario', wall_mat='plaster_stone', h=0.0, minor=True, alias=['主楼梯平台'], alias_en=['Stair Landing'], use='主楼梯二层平台与回廊'),
    R('209', '楼层配餐间', 'Floor Pantry', 'F2', (-20, -14, 14, 22), kind='floor_pantry', zone='staff', rank=3, floor_mat='tile_white', wall_mat='tile_white', alias=['配餐间'], alias_en=['Floor Pantry'], use='食梯出口、保温柜、茶水台、茶具柜'),
    R('211', '小储藏', 'Store Cupboard', 'F2', (-14, -8, 6, 14), kind='store', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['小储藏'], alias_en=['Store Cupboard'], use='文具、蜡烛、备用灯芯'),
    R('212', '书房', 'Study', 'F2', (-40, -20, -16, -2), kind='study', zone='master', rank=1, floor_mat='oak_herringbone', wall_mat='panel_walnut', alias=['书房', '图书室'], alias_en=['Study', 'Library'], use='胡桃木书架到顶（黄铜滑轨书梯）、初代桃花心木大写字台、切斯特菲尔德沙发、落地地球仪、以太悬浮天城仪、地图抽屉柜、黑金花壁炉与初代肖像、以太终端', heritage='书桌是初代从旧宅搬来的，桌面的皮子换过四次，右手边那道墨水渍一直留着。'),
    R('213', '秘书室', "Secretary's Office", 'F2', (-54, -40, -16, -2), kind='secretary', zone='master', rank=2, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['秘书室'], alias_en=["Secretary's Office"], use='两张写字台、以太录写台、文件柜墙、访客长凳、挂钟', heritage='墙上的挂钟比长箱钟快两分钟，按家规，秘书室的时间要永远早于主人。'),
    R('214', '西二层廊', 'West Upper Corridor', 'F2', (-54, -20, -2, 2), kind='wing_corridor', zone='guest', rank=2, floor_mat='marble_statuario', wall_mat='plaster_stone', minor=True, alias=['西二层廊'], alias_en=['West Upper Corridor'], use='同西翼廊'),
    R('215', '档案与地图室', 'Archive and Map Room', 'F2', (-34, -20, 2, 16), kind='archive', zone='master', rank=3, floor_mat='oak_plank', wall_mat='panel_walnut', alias=['档案室', '地图室'], alias_en=['Archive and Map Room'], use='恒温防火档案柜、平放式地图柜、阅读长桌；存历代地契、改建图纸、宴会名单'),
    R('216', '保险库', 'Strong Room', 'F2', (-40, -34, 9, 16), kind='strong_room', zone='master', rank=3, floor_mat='oak_plank', wall_mat='panel_walnut', alias=['保险库'], alias_en=['Strong Room'], use='钢门外包胡桃木板，内有家族文书与珠宝抽屉'),
    R('217', '书房盥洗室', 'Study Washroom', 'F2', (-40, -34, 2, 9), kind='washroom', zone='master', rank=2, floor_mat='marble_checker_small', wall_mat='marble_calacatta', alias=['书房盥洗室'], alias_en=['Study Washroom'], use='连体低水箱马桶（乌木座圈、黄铜杠杆）、单盆洗手台、镀镍电热毛巾架挂深绿手巾、黄铜框方镜', heritage='墙上挂一面初代用过的剃须镜，镜面已经雾化。'),
    R('218', '晨读室', 'Reading Room', 'F2', (-54, -40, 2, 16), kind='reading_room', zone='master', rank=2, floor_mat='oak_plank', wall_mat='silk_ivory', alias=['晨读室', '阅览室'], alias_en=['Reading Room'], use='朝北光线柔和：扶手椅 ×2、脚凳、阅读灯、报刊桌、窗前躺椅、书柜', heritage='窗台上的黄铜望远镜对准人工湖的湖心圆亭。'),
    R('219', '客房 A', 'Guest Room A', 'F2', (20, 37, -16, -2), kind='guest_suite', zone='guest', rank=1, floor_mat='oak_plank', wall_mat='silk_blue', parts={'bath': (20, 26, -16, -8), 'dress': (20, 26, -8, -2), 'bed': (26, 37, -16, -2)}, alias=['客房', '客房A', '客房 A'], alias_en=['Guest Room', 'Guest Room A'], use='天城蓝客房套间：卧室（四柱床、床头柜与台灯、写字台、安乐椅、梳妆台、小壁炉）+ 更衣室（双门衣柜、抽屉柜、穿衣镜）+ 浴室（铸铁爪足浴缸、洗手台、马桶、黄铜电热毛巾架）', heritage='窗外正对大道，住过历代到访的最尊贵客人，床头柜抽屉里有一本历任住客的留言簿。'),
    R('220', '客房 B', 'Guest Room B', 'F2', (37, 54, -16, -2), kind='guest_suite', zone='guest', rank=2, floor_mat='oak_plank', wall_mat='silk_rose', parts={'bath': (48, 54, -16, -8), 'dress': (48, 54, -8, -2), 'bed': (37, 48, -16, -2)}, alias=['客房B', '客房 B'], alias_en=['Guest Room B'], use='玫瑰粉客房套间：卧室（四柱床、床头柜与台灯、写字台、安乐椅、梳妆台、小壁炉）+ 更衣室（双门衣柜、抽屉柜、穿衣镜）+ 浴室（铸铁爪足浴缸、洗手台、马桶、黄铜电热毛巾架）', heritage='梳妆台是一位曾祖母的嫁妆。'),
    R('221', '东二层廊', 'East Upper Corridor', 'F2', (20, 54, -2, 2), kind='wing_corridor', zone='guest', rank=2, floor_mat='marble_statuario', wall_mat='plaster_stone', minor=True, alias=['东二层廊'], alias_en=['East Upper Corridor'], use='同东翼廊'),
    R('222', '客房 C', 'Guest Room C', 'F2', (20, 37, 2, 16), kind='guest_suite', zone='guest', rank=2, floor_mat='oak_plank', wall_mat='silk_green', parts={'bath': (20, 26, 8, 16), 'dress': (20, 26, 2, 8), 'bed': (26, 37, 2, 16)}, alias=['客房C', '客房 C'], alias_en=['Guest Room C'], use='帝政绿客房套间：卧室（四柱床、床头柜与台灯、写字台、安乐椅、梳妆台、小壁炉）+ 更衣室（双门衣柜、抽屉柜、穿衣镜）+ 浴室（铸铁爪足浴缸、洗手台、马桶、黄铜电热毛巾架）', heritage='壁炉上方挂着湖景的第一幅写生，画的时候湖还没挖完。'),
    R('223', '客用起居室', "Guests' Sitting Room", 'F2', (37, 54, 2, 16), kind='guest_sitting', zone='guest', rank=2, floor_mat='oak_plank', wall_mat='silk_ivory', alias=['客用起居室'], alias_en=["Guests' Sitting Room"], use='两组沙发、写字台、书柜、牌桌、小吧台、湖景大窗、壁炉'),
    R('C2', '塔亭阅览廊', 'Library Gallery', 'F2', (-102, -78, -12, 12), kind='library_gallery', zone='guest', rank=2, floor_mat='oak_plank', wall_mat='panel_walnut', h=5.2, alias=['阅览廊', '塔亭阅览廊'], alias_en=['Library Gallery'], use='图书馆上层回廊与阅览龛，手稿柜，通八角塔身楼梯', heritage='图书馆塔亭藏书约 4 万册，其中有天城早期的以太学手稿。'),

    # ---------------- F3 ----------------
    R('301', '肖像廊', 'Portrait Gallery', 'F3', (-12, 12, -22, -2), kind='portrait_gallery', zone='guest', rank=1, floor_mat='oak_herringbone', wall_mat='damask_crimson', alias=['廊厅', '肖像廊'], alias_en=['Gallery Hall', 'Portrait Gallery'], use='绛红丝缎锦墙布挂历代家族肖像 ×12，x = ±8 各 4 根爱奥尼亚柱承托鼓座；丝绒长凳 ×4、大理石边桌与纹章盾', heritage='最末一个画框是空的（金框里衬着深红丝），留给现任家主。'),
    R('302', '主人侍从间', "Valet's Room", 'F3', (-20, -12, -22, -2), kind='valet', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['主人侍从间'], alias_en=["Valet's Room"], use='熨烫台、以太衣物蒸汽机、擦鞋台、布草柜、侍从桌、铃板分机'),
    R('303', '布草间', 'Linen Room', 'F3', (12, 20, -22, -12), kind='linen', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['布草间'], alias_en=['Linen Room'], use='布草柜与熨台'),
    R('304', '家庭盥洗室', 'Family Washroom', 'F3', (12, 20, -12, -2), kind='washroom', zone='family', rank=2, floor_mat='marble_checker_small', wall_mat='marble_calacatta', alias=['家庭盥洗室'], alias_en=['Family Washroom'], use='连体马桶（乌木座圈）、单盆洗手台、电热毛巾架挂象牙白毛巾、黄铜框镜'),
    R('305', '三层过厅', 'Second-floor Hall', 'F3', (-20, 20, -2, 6), kind='cross_hall', zone='guest', rank=2, floor_mat='oak_plank', wall_mat='plaster_stone', minor=True, alias=['三层过厅'], alias_en=['Second-floor Hall'], use='西端门禁门通主人私区，东端通家人区'),
    R('306', '家庭餐室', 'Family Dining Room', 'F3', (-8, 8, 6, 22), kind='family_dining', zone='family', rank=2, floor_mat='oak_plank', wall_mat='silk_duckegg', alias=['家庭餐室'], alias_en=['Family Dining Room'], use='胡桃木椭圆桌（8 人）、边柜、茶具柜、窗边早餐桌、西耶纳黄壁炉；窗外正对人工湖', heritage='餐桌下地板上有一块补过的木片，是某一代孩子在桌下藏了一只小猫，挠坏的。'),
    R('307', '主楼梯顶层平台', 'Top Stair Landing', 'F3', (8, 20, 6, 22), kind='stair_landing', zone='guest', rank=2, floor_mat='marble_statuario', wall_mat='plaster_stone', h=4.2, minor=True, alias=['主楼梯顶层平台'], alias_en=['Top Stair Landing'], use='主楼梯到此为止，上方是天光井'),
    R('309', '侍从待命室', "Footmen's Waiting Room", 'F3', (-20, -14, 14, 22), kind='footmen', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['侍从待命室'], alias_en=["Footmen's Waiting Room"], use='铃板、两把椅子、茶水台'),
    R('310', '主人通道三层站', 'Master Passage (2F)', 'F3', (-14, -8, 14, 22), kind='master_passage', zone='master', rank=3, floor_mat='stone_flag', wall_mat='panel_walnut', alias=['主人通道三层站'], alias_en=['Master Passage (2F)'], use='螺旋梯与单人电梯在本层开门'),
    R('311', '主人前厅', "Master's Lobby", 'F3', (-14, -8, 6, 14), kind='master_lobby', zone='master', rank=3, floor_mat='oak_plank', wall_mat='panel_walnut', alias=['主人前厅'], alias_en=["Master's Lobby"], use='胡桃木护墙、衣帽架、镜子，门通过厅和西翼'),
    R('312', '主人起居室', "Master's Sitting Room", 'F3', (-40, -20, -16, -2), kind='master_sitting', zone='master', rank=2, floor_mat='oak_versailles', wall_mat='silk_blue', alias=['主人起居室'], alias_en=["Master's Sitting Room"], use='大沙发、一对扶手椅、缎木镶嵌写字台、书柜 ×2、以太留声机、Statuario 壁炉与鎏金铜座钟', heritage='座钟由第三代家主亲手修过，底座里压着他写的一张纸条：「慢一点也无妨」。'),
    R('313', '更衣室', 'Dressing Room', 'F3', (-54, -40, -16, -2), kind='dressing_room', zone='master', rank=2, floor_mat='oak_plank', wall_mat='panel_mahogany', alias=['更衣室'], alias_en=['Dressing Room'], use='桃花心木衣柜墙、大理石面中岛抽屉柜、三折穿衣镜、梳妆台、鞋柜、配饰抽屉、躺椅', heritage='一只衣柜的门内侧贴着历代家主的制服尺码表，墨色从褐色一路变到黑色。'),
    R('314', '西三层廊', 'Private Corridor', 'F3', (-54, -20, -2, 2), kind='wing_corridor', zone='master', rank=2, floor_mat='oak_plank', wall_mat='plaster_stone', minor=True, alias=['西三层廊'], alias_en=['Private Corridor'], use='主人私区，入口有门禁，墙上挂小幅风景画'),
    R('315', '主卧', 'Master Bedroom', 'F3', (-40, -20, 2, 16), kind='master_bedroom', zone='master', rank=1, floor_mat='oak_versailles', wall_mat='silk_ivory', alias=['主卧', '主卧室', '卧室', '寝室'], alias_en=['Master Bedroom', 'Bedroom'], use='帝政式床（2.4 × 2.2 m，皇冠华盖、丝缎帷幔）、大理石面床头柜与台灯、躺椅、扶手椅、写字桌、三折镜梳妆台、Statuario 壁炉；窗外湖景', heritage='床头板里的家徽，是初代订制的第一件以家徽为饰的家具，历代只换过软包。'),
    R('316', '主浴室', 'Master Bathroom', 'F3', (-54, -40, 2, 16), kind='master_bath', zone='master', rank=1, floor_mat='marble_statuario', wall_mat='marble_calacatta', parts={'wc': (-54, -51, 13, 16)}, alias=['主浴室', '浴室', '浴池', '盥洗室'], alias_en=['Master Bathroom', 'Bathroom'], use='整块 Statuario 独立浴缸立在圆台上、玻璃黄铜淋浴间、双盆洗手台、独立马桶间、两组电热毛巾架与叠放毛巾、浴袍、三折化妆镜；顶上圆形天光', heritage='浴缸是三代家主用一整块大理石雕的，石料来自已经封矿的旧采石场。'),
    R('317', '寝', 'Second Bedroom', 'F3', (20, 40, -16, -2), kind='second_suite', zone='family', rank=2, floor_mat='oak_plank', wall_mat='silk_ivory', parts={'bath': (20, 26, -16, -9), 'dress': (20, 26, -9, -2), 'bed': (26, 40, -16, -2)}, alias=['寝', '次卧'], alias_en=['Second Bedroom'], use='珍珠灰与淡金的次卧套间：卧室（四柱床、床头柜与台灯、写字台、安乐椅、梳妆台、小壁炉）+ 更衣室（双门衣柜、抽屉柜、穿衣镜）+ 浴室（铸铁爪足浴缸、洗手台、马桶、黄铜电热毛巾架）；浴室为镀镍五金', heritage='床头挂一幅小小的祖母刺绣，内容是家徽上的苹果树。'),
    R('318', '家庭客厅', 'Family Sitting Room', 'F3', (40, 54, -16, -2), kind='family_sitting', zone='family', rank=2, floor_mat='oak_plank', wall_mat='silk_ivory', alias=['家庭客厅'], alias_en=['Family Sitting Room'], use='沙发、扶手椅、书柜、牌桌、壁炉、留声机，墙上挂家人照片'),
    R('319', '东三层廊', 'Family Corridor', 'F3', (20, 54, -2, 2), kind='wing_corridor', zone='family', rank=2, floor_mat='oak_plank', wall_mat='plaster_stone', minor=True, alias=['东三层廊'], alias_en=['Family Corridor'], use='家人区走廊，有门禁'),
    R('320', '私人房间 A', 'Private Room A', 'F3', (20, 36, 2, 16), kind='neutral_private', zone='family', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['私人房间', '私人房间A', '私人房间 A'], alias_en=['Private Room', 'Private Room A'], use='用途未设定，只放普通家具：沙发、扶手椅、书桌加椅子、书柜、衣柜、单人床、茶几、台灯'),
    R('321', '备用卧室', 'Spare Bedroom', 'F3', (36, 54, 2, 16), kind='spare_bedroom', zone='family', rank=2, floor_mat='oak_plank', wall_mat='panel_paint_ivory', parts={'bath': (49, 54, 11, 16)}, alias=['备用卧室'], alias_en=['Spare Bedroom'], use='床、床头柜、衣柜、写字桌、扶手椅、壁炉，小浴室（马桶、洗手台、毛巾架）'),

    # ---------------- F4 ----------------
    R('401', '女仆长办公室', "Head Maid's Office", 'F4', (-20, -8, -22, -12), kind='head_maid_office', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['女仆长办公室', '办公室'], alias_en=["Head Maid's Office"], use='桃花心木写字台加扶手椅、排班板、钥匙柜、账簿柜、访客椅 ×2、小壁炉、员工名册框', heritage='女仆长办公室墙上挂着历任女仆长的名册，每个名字后面有一枚小铜钥匙，象征交接。'),
    R('402', '女仆长卧室', "Head Maid's Bedroom", 'F4', (-20, -8, -12, -2), kind='staff_bedroom', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='silk_duckegg', parts={'bath': (-11.5, -8, -5.5, -2)}, alias=['女仆长卧室'], alias_en=["Head Maid's Bedroom"], use='单人床、床头柜、衣柜、写字桌、扶手椅；带小浴室'),
    R('403', '附属用房', 'Ancillary Room', 'F4', (-8, 8, -22, -10), kind='neutral_ancillary', zone='staff', rank=3, floor_mat='lino', wall_mat='panel_paint_ivory', alias=['附属用房'], alias_en=['Ancillary Room'], use='长桌、椅子、储物柜、书架、吸顶灯（用途未设定，只放普通家具）'),
    R('404', '员工起居室', "Servants' Hall", 'F4', (-8, 8, -10, -2), kind='staff_hall', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['员工起居室', '仆役厅', '员工餐厅'], alias_en=["Servants' Hall", 'Staff Sitting Room'], use='长餐桌与 12 把椅子、沙发、书架、茶水台'),
    R('405', '洗衣房', 'Laundry', 'F4', (8, 20, -22, -12), kind='laundry', zone='staff', rank=3, floor_mat='tile_white', wall_mat='tile_white', alias=['洗衣房', '洗衣'], alias_en=['Laundry'], use='熨烫台 ×3、以太熨烫机、折叠台、晾衣架、布草推车（大件在仆役楼洗）'),
    R('406', '储藏室', 'Store', 'F4', (8, 20, -12, -2), kind='store', zone='staff', rank=3, floor_mat='lino', wall_mat='panel_paint_ivory', alias=['储藏室', '储藏'], alias_en=['Store'], use='分格货架（灯芯、蜡、瓷器、银器备品）、梯子、登记台'),
    R('407', '四层廊', 'Attic Corridor', 'F4', (-20, 20, -2, 6), kind='attic_corridor', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', minor=True, alias=['四层廊'], alias_en=['Attic Corridor'], use='布草推车停放位、公告板'),
    R('408', '监控室', 'Security Room', 'F4', (-8, 8, 6, 14), kind='security', zone='staff', rank=3, floor_mat='lino', wall_mat='panel_paint_ivory', alias=['监控室', '监控', '安保室'], alias_en=['Security Room'], use='黄铜框以太监视墙、操作台、两把转椅、档案柜'),
    R('409', '结界值守室', 'Ward Room', 'F4', (-8, 8, 14, 22), kind='ward_room', zone='staff', rank=3, floor_mat='stone_flag', wall_mat='plaster_stone', alias=['结界值守室'], alias_en=['Ward Room'], use='黄铜加以太晶的结界主控台、四座锚碑的状态表盘、值守桌'),
    R('410', '员工卧室', 'Staff Bedrooms', 'F4', (8, 20, 6, 22), kind='staff_bedrooms', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', parts={'void': (8, 12, 8, 20)}, alias=['员工卧室'], alias_en=['Staff Bedrooms'], use='员工卧室 ×3：单人床、床头柜、衣柜、小书桌；电梯在本层凭钥匙开门，楼梯厅的天光井穿过这里'),
    R('412', '员工盥洗室', 'Staff Washroom', 'F4', (-20, -14, 14, 22), kind='staff_washroom', zone='staff', rank=3, floor_mat='marble_checker_small', wall_mat='tile_white', alias=['员工盥洗室'], alias_en=['Staff Washroom'], use='淋浴 ×2、马桶 ×2（镀镍手柄、白色座圈）、洗手台 ×2、每人一格的毛巾架'),
    R('413', '布草储藏', 'Linen Store', 'F4', (-14, -8, 6, 14), kind='linen', zone='staff', rank=3, floor_mat='oak_plank', wall_mat='panel_paint_ivory', alias=['布草储藏'], alias_en=['Linen Store'], use='布草柜到顶，按房间编号分格'),

    # ---------------- F5 ----------------
    R('501', '屋顶露台', 'Roof Terrace', 'F5', (-20, 20, -22, 22), kind='roof_terrace', zone='guest', rank=2, floor_mat='portland_paving', wall_mat='plaster_stone', h=0.0, container=True, alias=['露台', '观景露台', '屋顶', '屋顶露台'], alias_en=['Roof Terrace', 'Terrace'], use='波特兰石板铺地，栏杆从立面退进 1.5 m；柚木躺椅 ×6、柑橘与月桂花钵 ×4；紫藤廊连主人通道出口亭与眺望亭'),
    R('502', '眺望亭', 'Belvedere', 'F5', (-7, 7, -9, 5), kind='belvedere', zone='guest', rank=1, floor_mat='marble_compass', wall_mat='plaster_stone', h=4.0, round=(0, -2, 6.4), alias=['眺望亭', '电梯厅', '私人电梯厅', '穹顶'], alias_en=['Belvedere', 'Private Lift Hall', 'Dome'], use='穹顶下的圆厅：罗盘星形拼花地面、16 根壁柱与 8 扇拱窗、环形蓝丝绒软座、黄铜天文望远镜、刻天城全图的地图桌、以太气象仪；穹顶内画金色星座', heritage='星座图是按第三代建亭那一夜的星空画的，那颗「家族之星」贴的是真金箔。'),
    R('503', '主人通道出口亭', 'Master Passage Kiosk', 'F5', (-14, -8, 14, 22), kind='kiosk', zone='master', rank=3, floor_mat='stone_flag', wall_mat='plaster_stone', h=3.2, alias=['主人通道出口亭'], alias_en=['Master Passage Kiosk'], use='铅皮屋顶小石亭，经 20 m 紫藤廊通眺望亭'),
    R('504', '电梯出口亭', 'Lift Kiosk', 'F5', (12, 16, 12, 17), kind='kiosk', zone='guest', rank=3, floor_mat='marble_statuario', wall_mat='plaster_stone', h=3.2, alias=['电梯出口亭'], alias_en=['Lift Kiosk'], use='小石亭，黄铜门'),
    R('505', '仆役楼梯出口亭', 'Service Stair Kiosk', 'F5', (-20, -14, 6, 14), kind='kiosk', zone='staff', rank=3, floor_mat='stone_flag', wall_mat='plaster_stone', h=3.2, alias=['仆役楼梯出口亭'], alias_en=['Service Stair Kiosk'], use='检修用，门上锁'),
    # ---------------- 竖井在各层占的格子（设定 §4 / §5；plan.js 没有单列）----------------
    R('208', '仆役楼梯', 'Service Stair', 'F2', (-20, -14, 6, 14), kind='service_stair', zone='staff', rank=3, floor_mat='stone_flag', wall_mat='panel_paint_ivory', minor=True, alias=['仆役楼梯'], alias_en=['Service Stair']),
    R('210', '主人通道', 'Master Passage', 'F2', (-14, -8, 14, 22), kind='master_passage', zone='master', rank=3, floor_mat='stone_flag', wall_mat='panel_walnut', minor=True, alias=['主人通道'], alias_en=['Master Passage'], use='F2 不停站：封闭井'),
    R('308', '仆役楼梯', 'Service Stair', 'F3', (-20, -14, 6, 14), kind='service_stair', zone='staff', rank=3, floor_mat='stone_flag', wall_mat='panel_paint_ivory', minor=True, alias=['仆役楼梯'], alias_en=['Service Stair']),
    R('411', '仆役楼梯', 'Service Stair', 'F4', (-20, -14, 6, 14), kind='service_stair', zone='staff', rank=3, floor_mat='stone_flag', wall_mat='panel_paint_ivory', minor=True, alias=['仆役楼梯'], alias_en=['Service Stair']),
    R('414', '主人通道', 'Master Passage', 'F4', (-14, -8, 14, 22), kind='master_passage', zone='master', rank=3, floor_mat='stone_flag', wall_mat='panel_walnut', minor=True, alias=['主人通道'], alias_en=['Master Passage'], use='F4 不停站：封闭井'),
    R('B01', '地道前室', 'Tunnel Lobby', 'B1', (-20, -14, 6, 14), kind='tunnel_lobby', zone='staff', rank=3, floor_mat='stone_flag', wall_mat='tile_white', h=3.6, alias=['地道前室'], alias_en=['Tunnel Lobby'], use='以太轨道小推车站、推车 ×2、工具柜、打卡钟；向西接服务地道'),
]
ROOM_BY_ID = {r['id']: r for r in ROOMS}
def rooms(floor=None): return [r for r in ROOMS if floor is None or r['floor'] == floor]
ZONE_COLORS = {'master': '#7A5FA0', 'staff': '#C98A40', 'guest': '#4C8C99', 'family': '#7A5FA0'}

# ---------------------------------------------------------------- 竖井（跨层）
SHAFTS = [
    dict(id='stair', name='主楼梯', name_en='Main Stair', rect=(8, 20, 6, 22), floors=['F1', 'F2', 'F3'], stops=['F1', 'F2', 'F3'], zone='guest',
         use='石材悬挑双跑回转梯，波特兰石整块踏步宽 2.2 m，锻铁鎏金栏杆，桃花心木扶手；顶部椭圆穹顶天窗'),
    dict(id='lift', name='电梯', name_en='Lift', rect=(12.5, 15.5, 12.5, 16.5), floors=['F1', 'F2', 'F3', 'F4', 'F5'], stops=['F1', 'F2', 'F3', 'F5'], key=['F4'],
         zone='guest', use='黄铜笼式以太电梯（三代），折叠铜门，桃花心木轿厢'),
    dict(id='service', name='仆役楼梯', name_en='Service Stair', rect=(-20, -14, 6, 14), floors=['B1', 'F1', 'F2', 'F3', 'F4', 'F5'],
         stops=['B1', 'F1', 'F2', 'F3', 'F4', 'F5'], zone='staff', dumbwaiter=(1.2, 1.2), use='石踏步、铁栏杆、1.2 × 1.2 m 食梯'),
    dict(id='master', name='主人通道', name_en='Master Passage', rect=(-14, -8, 14, 22), floors=['F1', 'F2', 'F3', 'F4', 'F5'], stops=['F1', 'F3', 'F5'],
         zone='master', use='石材螺旋梯 + 1.4 × 1.4 m 胡桃木单人电梯；F1 后墙（y = 22）有暗门通紫藤廊'),
]
LIGHTWELL = dict(rect=(8, 12, 8, 20), floors=['F4', 'F5'], use='主楼梯厅天光井，穿过 F4 的 410，屋面开天窗')
SKYLIGHT_316 = dict(c=(-47.0, 9.0), r=1.6, use='西翼屋面在主浴室上方开的圆形天窗')   # 设定 §8 第 6 条写约 −50…−44 × 6…12
WISTERIA_WALK = [(-11.0, 14.0), (-5.0, 8.0), (0.0, 4.6)]   # F5：主人通道出口亭 → 眺望亭，约 20 m

# ---------------------------------------------------------------- 门洞（自动 + 补充）
# 自动规则（doors()）：房间与「交通类」房间（CIRCULATION）共边 ≥ 1.5 m 时，在共边中点开一扇 1.2 m 门；交通类之间也互通。
# 补充（EXTRA_DOORS）：设定里写到的其他连接、外门、宽洞口。at = 共边上的坐标（S/N 边给 x，W/E 边给 y）；None = 共边中点。
CIRCULATION = {'cross_hall', 'wing_corridor', 'stair_hall', 'stair_landing', 'attic_corridor', 'hall', 'hall_void', 'roof_terrace'}
NO_AUTO_DOOR = {'112', '210', '310', '414', '503', '216', '109', '208', '308', '411', '505'}   # 主人通道、保险库、仆役楼梯只走补充门
EXTRA_DOORS = [
    # (房间 a, 房间 b 或 'ext', 边 of a, at, 宽, 类型)
    ('101', 'ext', 'S', 0.0, 3.0, 'double_door'),          # 正门（门廊后）
    ('101', '106', 'N', 0.0, 4.0, 'arch'),                # 大厅 → 过厅：宽拱
    ('101', '102', 'W', -17.0, 1.4, 'door'), ('101', '103', 'W', -7.0, 1.4, 'door'),
    ('101', '104', 'E', -17.0, 1.4, 'door'), ('101', '105', 'E', -7.0, 1.4, 'door'),
    ('106', '107', 'N', 0.0, 3.0, 'double_door'),
    ('106', '115', 'W', None, 2.4, 'double_door'), ('106', '121', 'E', None, 2.4, 'double_door'),
    ('118', 'ext', 'W', 9.0, 2.0, 'double_door'), ('124', 'ext', 'E', 9.0, 2.0, 'double_door'),   # 家族门厅 / 东门厅 → 柱廊连廊
    ('116', '109', 'E', 10.0, 1.2, 'door'), ('106', '109', 'N', -17.0, 1.2, 'door'),
    ('112', 'ext', 'N', -11.0, 1.0, 'secret'),           # 主人通道底站后墙暗门（与石缝对齐）→ 紫藤廊
    ('112', '107', 'E', 18.0, 1.0, 'jib_door'),         # 主人通道底站 → 花园厅（护墙暗门）
    ('208', '205', 'S', -17.0, 1.2, 'door'), ('308', '305', 'S', -17.0, 1.2, 'door'), ('411', '407', 'S', -17.0, 1.2, 'door'),
    ('310', '311', 'S', -11.0, 1.0, 'door'),             # 主人通道三层站 → 主人前厅
    ('311', '305', 'S', -11.0, 1.2, 'door'),
    ('215', '216', 'W', 12.5, 1.0, 'vault_door'),       # 保险库只从档案室进
    ('315', '316', 'W', 9.0, 1.4, 'door'),               # 主卧 → 主浴室
    ('401', '402', 'N', -14.0, 1.0, 'door'),
    ('501', '502', None, None, 1.6, 'door'),             # 屋顶平台 → 眺望亭（鼓座南门）
]

# ---------------------------------------------------------------- 岛（与 blender/tc_estates.py Isle('eden') 同一条轮廓）
# tc_islands.json：eden rx = 3.35, ry = 2.5（1 单位 = 100 m），shape = cape，rot = 0。HARM 由 tc_estates.Isle 的随机序列算出后抄在这里，
# validate() 在能 import tc_estates 时会复核。岛坐标原点 = 岛顶面中心。
ISLAND = dict(rx=335.0, ry=250.0, rot=0.0, top_z=0.0,
              harm=[(3, 0.039604075555602386, 5.82645612543514), (5, 0.055443933254910184, 2.2840104599234197),
                    (6, 0.05149712881839658, 0.19392042018496997), (4, 0.031185463941111005, 3.196131428830149),
                    (13, 0.024895231399284866, 5.06049158671162)],
              rim_wall=0.975, belt=(0.84, 0.95), rock_depth=120.0)   # 白石栏杆在 0.975 半径；林带 0.84–0.95；倒锥岩基深约 120 m
MANOR_IN_ISLAND = (0.0, 25.0)
def i2m(X, Y): return (X - MANOR_IN_ISLAND[0], Y - MANOR_IN_ISLAND[1])
def m2i(x, y): return (x + MANOR_IN_ISLAND[0], y + MANOR_IN_ISLAND[1])
def island_r(th):
    """岛缘半径（米，岛坐标，th = 本地角度）。"""
    c, s = math.cos(th), math.sin(th)
    base = 1 / math.sqrt((c / ISLAND['rx']) ** 2 + (s / ISLAND['ry']) ** 2)
    return base * (1 + sum(a * math.sin(k * th + p) for k, a, p in ISLAND['harm']))
def island_outline(n=360, s=1.0, frame='island'):
    """岛缘折线 [(x, y)]；frame = 'island' 或 'manor'。"""
    pts = [(math.cos(t) * s * island_r(t), math.sin(t) * s * island_r(t)) for t in (2 * math.pi * k / n for k in range(n))]
    return pts if frame == 'island' else [i2m(x, y) for x, y in pts]
def island_frac(X, Y):
    """点在岛上的相对半径（< 1 在岛内）。"""
    return math.hypot(X, Y) / island_r(math.atan2(Y, X))
def on_rim(th, s=ISLAND['rim_wall']):
    return (math.cos(th) * s * island_r(th), math.sin(th) * s * island_r(th))

# ---------------------------------------------------------------- 附属建筑与构筑物（岛坐标，设定 §2.2）
# rect = (x0, x1, y0, y1)；c = 中心；h = 檐高
OUTBUILDINGS = [
    dict(id='E', name='仆役楼', name_en='Staff Wing', rect=(-172, -128, 111, 125), h=9.0, storeys='2 + 阁楼', alias=['仆役楼', '仆人楼', '主厨房'], alias_en=['Staff Wing', "Servants' Block"]),
    dict(id='F', name='马车房', name_en='Carriage House', rect=(-170, -130, 137, 147), h=6.5, storeys='1 + 草料阁', alias=['马车房', '车库', '马厩'], alias_en=['Carriage House', 'Stables']),
    dict(id='G', name='工坊', name_en='Workshop', rect=(-182, -174, 115, 145), h=5.0, alias=['工坊'], alias_en=['Workshop'],
         note='设定 x −174…−166 与仆役楼、马车房重叠，西移 8 m（同 three.js 版）'),
    dict(id='H', name='机库', name_en='Hangar', rect=(-122, -92, 145, 165), h=9.0, alias=['机库'], alias_en=['Hangar']),
    dict(id='H2', name='机坪', name_en='Apron', rect=(-120, -90, 117, 143), h=0.0, alias=['机坪'], alias_en=['Apron']),
    dict(id='I', name='橘园', name_en='Orangery', rect=(121, 169, 152, 162), h=7.0, alias=['橘园', '温室'], alias_en=['Orangery']),
    dict(id='J', name='水榭', name_en='Water Pavilion', c=(62, 118), size=(16, 10), h=6.0, alias=['水榭', '凉亭', '船屋'], alias_en=['Water Pavilion', 'Boathouse']),
    dict(id='K', name='湖心圆亭', name_en='Lake Temple', c=(15, 127), r=2.8, islet_r=5.0, h=7.0, columns=8, alias=['湖心圆亭', '湖心亭', '圆亭'], alias_en=['Lake Temple']),
    dict(id='L', name='停靠平台', name_en='Landing Platform', c=(0, -252), r=16.0, kiosk=dict(c=(0, -242), r=3.0, h=5.0),
         alias=['停靠平台', '停机坪', '码头', '平台', '候机亭'], alias_en=['Landing Platform', 'Landing Stage']),
    dict(id='M1', name='后轴观景台', name_en='North Lookout', c=(0, 222), r=10.0, alias=['观景台', '后轴观景台'], alias_en=['Lookout'],
         note='设定 (0, 240) 在岛缘 231 m 之外；放到岛缘 0.975 处'),
    dict(id='M2', name='西观景亭', name_en='West Lookout', c=(-315, 0), r=4.0, alias=['西观景亭'], alias_en=['West Lookout']),
    dict(id='M3', name='东观景亭', name_en='East Lookout', c=(315, 0), r=4.0, alias=['东观景亭'], alias_en=['East Lookout']),
] + [dict(id=f'N{i + 1}', name='结界锚碑', name_en='Ward Anchor', bearing=(sx * 235, sy * 165), size=(2, 2), h=9.0, alias=['结界锚碑', '锚碑'],
          alias_en=['Ward Anchor'], note='设定 (±235, ±165) 有三座落在岛缘外；沿同一方位放到 0.90 半径')
     for i, (sx, sy) in enumerate(((-1, 1), (1, 1), (-1, -1), (1, -1)))]
def anchor_pos(o, s=0.90):
    th = math.atan2(o['bearing'][1], o['bearing'][0]); return on_rim(th, s)
TUNNEL = dict(path=[(-128, 118), (-17, 35)], w=3.0, depth=-6.0)   # 服务地道：地面不可见

# ---------------------------------------------------------------- 园林分区（岛坐标，设定 §2.3）
AREAS = [
    dict(id='forecourt', name='前庭', name_en='Forecourt', rect=(-55, 55, -45, -11), alias=['前庭', '喷泉', '前院', '荣誉庭院'], alias_en=['Forecourt', 'Fountain'],
         fountain=dict(c=(0, -28), r=7.0, tiers=3, statue='持苹果的少女（铜像）')),
    dict(id='parterre_w', name='西花坛', name_en='Parterre', rect=(-56, -16, -42.5, -13.5), alias=['花坛', '花园', '庭园', '刺绣花坛'], alias_en=['Gardens', 'Garden', 'Parterre'],
         cells=dict(nx=3, ny=2, w=12, d=13)),
    dict(id='parterre_e', name='东花坛', name_en='East Parterre', rect=(16, 56, -42.5, -13.5), alias=['东花坛'], alias_en=['East Parterre'], cells=dict(nx=3, ny=2, w=12, d=13)),
    dict(id='avenue', name='中轴大道', name_en='Grand Avenue', rect=(-25, 25, -245, -45), alias=['大道', '中轴大道', '林荫道', '条纹草坪'], alias_en=['Avenue', 'Grand Avenue'],
         path_w=6.0, limes_x=7.0, statues=dict(n=16, x=4.5, len=56)),
    dict(id='rose', name='玫瑰园', name_en='Rose Garden', rect=(70, 120, -70, -20), alias=['玫瑰园'], alias_en=['Rose Garden']),
    dict(id='maze', name='迷园', name_en='Hedge Maze', rect=(-120, -70, -70, -20), alias=['迷园', '树篱迷宫', '迷宫'], alias_en=['Hedge Maze', 'Maze']),
    dict(id='rear_court', name='后庭', name_en='Rear Court', rect=(-30, 30, 47, 76), alias=['后庭', '后院', '台地'], alias_en=['Rear Court', 'Terrace Garden'],
         steps=(47, 53), court=(53, 68), shore_terrace=(-25, 25, 68, 76)),
    dict(id='lake', name='人工湖', name_en='Lake', rect=(-60, 75, 95, 160), alias=['人工湖', '湖'], alias_en=['Lake'],
         lobes=[(7.5, 127.5, 55, 26, 0.1), (-32.5, 139.5, 30, 18, -0.4), (49.5, 121.5, 28, 16, 0.5), (17.5, 147.5, 25, 14, 0.0)]),   # (cx, cy, a, b, 转角)
    dict(id='park', name='英式风景园', name_en='Landscape Park', rect=(-110, 110, 60, 230), alias=['英式风景园', '风景园'], alias_en=['Landscape Park']),
    dict(id='kitchen_garden', name='围墙花园', name_en='Kitchen Garden', rect=(110, 180, 110, 160), alias=['围墙花园', '菜园', '厨房花园'], alias_en=['Kitchen Garden', 'Walled Garden'], wall_h=3.5),
    dict(id='orchard', name='果园', name_en='Orchard', rect=(190, 240, 80, 130), alias=['果园'], alias_en=['Orchard']),
    dict(id='reserve_w', name='西预留草坪', name_en='Reserve Lawn', rect=(-227.5, -122.5, -32.5, 62.5), alias=['预留草坪', '设计草坪'], alias_en=['Reserve Lawn']),
    dict(id='reserve_e', name='东预留草坪', name_en='East Reserve Lawn', rect=(122.5, 227.5, -32.5, 62.5), alias=['东预留草坪'], alias_en=['East Reserve Lawn']),
    dict(id='service_yard', name='服务区', name_en='Service Yard', rect=(-185, -85, 105, 170), alias=['服务区'], alias_en=['Service Yard']),
]
AREA_BY_ID = {a['id']: a for a in AREAS}
MAIN_AREA = dict(id='manor', name='伊甸庄园 · 主楼', name_en='Eden Manor', alias=['伊甸庄园', '伊甸', '庄园', '主楼', '中央主楼', '府邸'], alias_en=['Eden Manor', 'Main House', 'Manor'])

# ---------------------------------------------------------------- 几何工具
def rect_c(r): return ((r[0] + r[1]) / 2, (r[2] + r[3]) / 2)
def rect_area(r): return (r[1] - r[0]) * (r[3] - r[2])
def rect_poly(r): return [(r[0], r[2]), (r[1], r[2]), (r[1], r[3]), (r[0], r[3])]
def overlap(a, b, eps=1e-6): return min(a[1], b[1]) - max(a[0], b[0]) > eps and min(a[3], b[3]) - max(a[2], b[2]) > eps
def inside(inner, outer, eps=1e-6): return inner[0] >= outer[0] - eps and inner[1] <= outer[1] + eps and inner[2] >= outer[2] - eps and inner[3] <= outer[3] + eps
def room_poly(room, n=48):
    """房间外轮廓（府邸坐标，逆时针）。圆形房间给 n 边形。"""
    if room.get('round'):
        cx, cy, r = room['round']; return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    return rect_poly(room['rect'])
def shared_edge(a, b, eps=1e-6):
    """两个矩形共边：返回 (a 的边 'S'/'N'/'W'/'E', 固定坐标, 起, 止)，没有时 None。"""
    ra, rb = a['rect'], b['rect']
    for side, fa, fb, lo, hi in (('S', ra[2], rb[3], (ra[0], rb[0]), (ra[1], rb[1])), ('N', ra[3], rb[2], (ra[0], rb[0]), (ra[1], rb[1])),
                                 ('W', ra[0], rb[1], (ra[2], rb[2]), (ra[3], rb[3])), ('E', ra[1], rb[0], (ra[2], rb[2]), (ra[3], rb[3]))):
        if abs(fa - fb) < eps:
            s0, s1 = max(lo), min(hi)
            if s1 - s0 > eps: return side, fa, s0, s1
    return None
def block_of(room):
    for k, b in BLOCKS.items():
        if room['floor'] in b['floors'] and inside(room['rect'], b['rect']): return k
    return None
def exterior_edges(room):
    """房间落在体块外墙上的边：[(边, 固定坐标, 起, 止)]。"""
    k = block_of(room)
    if not k: return []
    b, r, out = BLOCKS[k]['rect'], room['rect'], []
    for side, f, bf, a0, a1 in (('S', r[2], b[2], r[0], r[1]), ('N', r[3], b[3], r[0], r[1]), ('W', r[0], b[0], r[2], r[3]), ('E', r[1], b[1], r[2], r[3])):
        if abs(f - bf) < 1e-6:
            if k == 'A' and side in 'WE' and room['floor'] != 'F4':       # 主楼侧墙 F1–F3 被两翼挡住的中段（y −16…16）不算外墙
                segs = [(a0, min(a1, -16)), (max(a0, 16), a1)]
            elif k in ('BW', 'BE') and side == ('E' if k == 'BW' else 'W'): segs = []   # 两翼贴主楼的那面
            else: segs = [(a0, a1)]
            out += [(side, f, s0, s1) for s0, s1 in segs if s1 - s0 > 1e-6]
    return out
def windows(room):
    """房间外墙上的窗：[dict(edge, at, w, h, sill, head)]，窗轴取 FACADE。"""
    k, out = block_of(room), []
    if not k or room['void'] or room['container']: return out
    wt = WINDOWS.get(room['floor'])
    if not wt: return out
    for side, f, s0, s1 in exterior_edges(room):
        for key, fa in FACADE.items():
            blk, sd = key.split('.')
            if blk != k or sd[0] != side or abs(fa['line'] - f) > 1e-6: continue
            if 'floors' in fa and room['floor'] not in fa['floors']: continue
            if k == 'A' and side in 'WE' and 'floors' not in fa and room['floor'] == 'F4': continue   # F4 侧面用 A.W4 / A.E4
            for a in fa['axes']:
                a = round(a, 3)
                if not (s0 <= a < s1) or (room['floor'] == 'F1' and a == fa.get('door_axis') and side == 'S'): continue   # 正门由 EXTRA_DOORS 给
                kind = 'french_window' if a in fa.get('french', []) and room['floor'] == 'F1' else 'window'
                near = min(a - s0, s1 - a) < wt['w'] / 2 + WALL_PART / 2 + 0.05     # 窗轴落在隔墙上：隔墙在窗前收住，做盲窗
                out.append(dict(edge=side, at=a, w=wt['w'], h=wt['h'] + (wt['sill'] if kind != 'window' else 0), sill=0.0 if kind != 'window' else wt['sill'],
                                head=wt['head'], kind=kind, partition=near))
    return out
def doors(room):
    """房间的门洞：[dict(edge, at, w, to, kind)]；自动规则 + EXTRA_DOORS。每扇门在两侧房间里各出现一次。"""
    out = []
    if room['void'] or room['container']: return out
    same = [o for o in ROOMS if o['floor'] == room['floor'] and o is not room and not o['container']]
    if room['id'] not in NO_AUTO_DOOR:
        for o in same:
            if o['id'] in NO_AUTO_DOOR: continue
            if room['kind'] in CIRCULATION or o['kind'] in CIRCULATION:
                if room['kind'] in CIRCULATION and o['kind'] in CIRCULATION and room['kind'] == o['kind'] == 'hall': continue
                e = shared_edge(room, o)
                if e and e[3] - e[2] >= 1.5 and not any(d[0] in (room['id'], o['id']) and d[1] in (room['id'], o['id']) for d in EXTRA_DOORS):
                    out.append(dict(edge=e[0], at=round((e[2] + e[3]) / 2, 3), w=1.2, to=o['id'], kind='door'))
    for a, b, side, at, w, kind in EXTRA_DOORS:
        if a == room['id'] or b == room['id']:
            other = b if a == room['id'] else a
            if other == 'ext':
                out.append(dict(edge=side, at=at, w=w, to='ext', kind=kind)); continue
            if other not in ROOM_BY_ID: continue
            e = shared_edge(room, ROOM_BY_ID[other])
            if e is None: continue
            pos = at if at is not None else round((e[2] + e[3]) / 2, 3)
            out.append(dict(edge=e[0], at=pos, w=w, to=other, kind=kind))
    return out
def openings(room):
    """门 + 窗（CONTRACT.md §4 的格式）。"""
    return [dict(d, type='door') for d in doors(room)] + [dict(w, type='window') for w in windows(room)]

# ---------------------------------------------------------------- 别名
def lookup(term):
    """叫法 → ('room', id) / ('area', id) / ('estate', None) / None。查看器与导出共用这一套命中规则。"""
    t = term.strip()
    for r in ROOMS:
        if t == r['name'] or t in r['alias'] or t == r['name_en'] or t in r['alias_en']: return ('room', r['id'])
    for a in AREAS + OUTBUILDINGS:
        if t == a['name'] or t in a.get('alias', []) or t == a.get('name_en') or t in a.get('alias_en', []): return ('area', a['id'])
    if t in MAIN_AREA['alias'] or t in MAIN_AREA['alias_en']: return ('estate', None)
    return None

# ---------------------------------------------------------------- 自检
def _doc_rects():
    """从 docs/eden-estate.md 抓 `x0…x1 × y0…y1` 形式的房间坐标（带编号的条目与 F4 表）。"""
    import os, re
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'docs', 'eden-estate.md')
    if not os.path.exists(p): return {}
    num = r'(−?-?\d+(?:\.\d+)?)'
    pat = re.compile(r'(?:\*\*|\| )(\d{3}) [^`|*]*?(?:\*\*)?\s*(?:\|[^|`]*\|)?\s*`' + num + '…' + num + ' × ' + num + '…' + num + '`')
    out = {}
    for m in pat.finditer(open(p, encoding='utf-8').read()):
        v = [float(x.replace('−', '-')) for x in m.groups()[1:]]
        out.setdefault(m.group(1), tuple(v))
    return out
def validate(verbose=True):
    errs, warns = [], []
    ids = [r['id'] for r in ROOMS]
    if len(ids) != len(set(ids)): errs.append('duplicate room ids')
    for fl in FLOOR_ORDER:
        rs = [r for r in rooms(fl) if not r['container']]
        for i, a in enumerate(rs):
            for b in rs[i + 1:]:
                if overlap(a['rect'], b['rect']) and not (a.get('round') or b.get('round')): errs.append(f'{fl}: {a["id"]} overlaps {b["id"]}')
            for k, v in a['parts'].items():
                for pr in (v if isinstance(v, list) else [v]):
                    if not inside(pr, a['rect']): errs.append(f'{a["id"]}: part {k} {pr} outside room')
    for k, b in BLOCKS.items():                                         # 每层体块被房间铺满（敞开的柱廊除外）
        for fl in ([] if b.get('open') else b['floors']):
            area = sum(rect_area(r['rect']) for r in rooms(fl) if inside(r['rect'], b['rect']) and not r['container'])
            if abs(area - rect_area(b['rect'])) > 1e-3:
                (warns if k in ('C', 'D') else errs).append(f'{k} {fl}: rooms cover {area:.0f} of {rect_area(b["rect"]):.0f} m²')
    try:                                                                # maps.json 的叫法全部命中
        import json, os
        mp = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'map', 'data', 'maps.json')
        e = json.load(open(mp, encoding='utf-8'))['maps']['eden_estate']
        for key in ('rooms', 'rooms_en'):
            for t in e[key]:
                hit = lookup(t)
                if not hit or hit[0] != 'room': errs.append(f'maps.json {key} {t!r} not matched to a room ({hit})')
        for key in ('areas', 'areas_en'):
            for t in e[key]:
                if not lookup(t): errs.append(f'maps.json {key} {t!r} not matched')
    except FileNotFoundError: warns.append('maps.json not found; alias check skipped')
    doc = _doc_rects()                                                  # 与设定逐条核对
    for rid, dr in doc.items():
        r = ROOM_BY_ID.get(rid)
        if r is None: errs.append(f'doc room {rid} {dr} missing'); continue
        if any(abs(a - b) > 1e-6 for a, b in zip(r['rect'], dr)) and not r.get('round'): errs.append(f'{rid}: rect {r["rect"]} != doc {dr}')
    if len(doc) < 60: warns.append(f'only {len(doc)} rooms parsed from docs/eden-estate.md')
    for r in ROOMS:                                                     # 门：补充门必须落在共边上；窗与隔墙冲突列出
        for a, b, *_ in EXTRA_DOORS:
            if a == r['id'] and b != 'ext' and b in ROOM_BY_ID and ROOM_BY_ID[b]['floor'] == r['floor'] and not shared_edge(r, ROOM_BY_ID[b]) \
                    and not (r['container'] or ROOM_BY_ID[b].get('round')):
                errs.append(f'EXTRA_DOORS {a}-{b}: no shared edge')
    clashes = [f'{r["id"]} {w["edge"]}{w["at"]:+.1f}' for r in ROOMS for w in windows(r) if w['partition']]
    if clashes: warns.append(f'{len(clashes)} windows meet a partition (shell: stop the partition short, blind window behind): ' + ', '.join(sorted(set(clashes))))
    try:                                                                # 岛轮廓与 tc_estates 一致
        import os, sys
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
        import json, tc_estates as te
        d = [i for i in json.load(open(os.path.join(te.HERE if hasattr(te, 'HERE') else os.path.dirname(te.__file__), 'data', 'tc_islands.json')))['islands'] if i['id'] == 'eden'][0]
        e = te.Isle(d)
        for th in (0, 1, 2, 3, 4, 5):
            if abs(e.r(th) * 100 - island_r(th)) > 1e-6: errs.append('island outline differs from tc_estates'); break
    except Exception as ex: warns.append(f'island cross-check skipped ({type(ex).__name__})')
    for o in OUTBUILDINGS:
        c = rect_c(o['rect']) if 'rect' in o else o.get('c') or anchor_pos(o)
        f = island_frac(*c)
        if o['id'] not in ('L',) and f > 0.975: errs.append(f'{o["id"]} at {c} outside the rim wall ({f:.2f})')
    for a in AREAS:
        for p in rect_poly(a['rect']):
            if island_frac(*p) > 1.0: warns.append(f'area {a["id"]} corner {p} beyond the rim ({island_frac(*p):.2f})')
    if verbose:
        for w in warns: print('WARN', w)
        for e in errs: print('ERROR', e)
        print(f'plan: {len(ROOMS)} rooms, {len(SHAFTS)} shafts, {len(OUTBUILDINGS)} outbuildings, {len(AREAS)} areas, doc rects checked {len(doc)}; '
              f'{len(errs)} errors, {len(warns)} warnings')
    return errs, warns

if __name__ == '__main__':
    import sys
    sys.exit(1 if validate()[0] else 0)
