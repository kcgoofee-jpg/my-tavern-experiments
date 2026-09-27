# 伊甸庄园 · 家具与器物。所有权：INTERIOR 建造者。
# 统一签名：fn(coll, loc, rot=0.0, style=None, **kw) → bpy.types.Object（一件家具一个根物体；多部件时其余部件挂在它下面）
#   coll   目标集合（rooms.furnish 传入 core.room_coll(room)）
#   loc    (x, y, z) 府邸坐标，z = 楼面；物体原点在家具底面中心（靠墙家具在背板中心）
#   rot    绕 z 的弧度。rot = 0 时家具正面朝 −y、背靠 +y 侧的墙；靠西墙 +π/2，靠东墙 −π/2，靠南墙 π
#   style  器型 / 配色（见各函数）；**kw 其他尺寸
# 标记：高于 1.2 m 的立件（衣柜、书架、壁镜、四柱床柱）登记 cut=True；吊灯、壁灯、华盖登记 upper=True（core.link）。
# 硬约束：不做任何性相关或束缚类道具；用途不明的房间只放普通家具（CONTRACT.md §9）。
# 桩实现：每件一个按真实尺寸的盒子，材质取主材。正式实现替换函数体，签名不变。
import math
from . import core, mats


def _piece(name, coll, loc, rot, w, d, h, mat, z0=0.0, upper=False):
    o = core.Batch(name, mats.get(mat)).box(-w / 2, w / 2, -d / 2, d / 2, z0, z0 + h).done()
    o.location = loc; o.rotation_euler = (0, 0, rot)
    return core.link(o, coll, cut=(z0 + h) > 1.2 and not upper, upper=upper)


# ---------------------------------------------------------------- 卫浴（近景重点：马桶、洗手台、浴缸、毛巾）
def toilet(coll, loc, rot=0.0, style='low_tank', **kw):
    """马桶。style：high_tank（高位桃花心木水箱 + 铜链瓷拉手，访客盥洗室）/ low_tank（低位水箱大理石盖，主浴、客房）/
    close_coupled（连体，书房与家庭盥洗室）/ staff（白瓷、镀镍手柄、白座圈）。部件：基座、碗、座圈、盖、水箱、冲水手柄、铭牌。"""
    return _piece('toilet', coll, loc, rot, 0.42, 0.70, 0.80 if style != 'high_tank' else 2.2, 'porcelain')
def basin(coll, loc, rot=0.0, style='vanity', **kw):
    """洗手台。style：vanity（大理石台面 + 桃花心木下柜 + 台下盆 + 鹅颈龙头）/ double（双盆）/ pedestal / staff。"""
    return _piece('basin', coll, loc, rot, 1.6 if style == 'double' else 1.0, 0.55, 0.85, 'marble_calacatta')
def bathtub(coll, loc, rot=0.0, style='clawfoot', **kw):
    """浴缸。style：clawfoot（铸铁爪足，外壁房间色，kw color=材质名）/ monolith（整块 Statuario，立在圆台上，主浴传承件）。"""
    return _piece('bathtub', coll, loc, rot, 0.8 if style != 'monolith' else 0.95, 1.8 if style != 'monolith' else 2.0, 0.7, 'porcelain' if style != 'monolith' else 'marble_statuario')
def shower(coll, loc, rot=0.0, style='brass_glass', **kw):
    return _piece('shower', coll, loc, rot, 1.2, 1.2, 2.3, 'glass_window')
def towel_rail(coll, loc, rot=0.0, style='heated_brass', towels=2, **kw):
    """毛巾架 + 搭挂毛巾（厚 0.02–0.025，垂坠下摆，金线家徽 4.5 cm）。style：heated_brass / heated_nickel / ring。"""
    return _piece('towel_rail', coll, loc, rot, 0.7, 0.12, 1.1, 'towel', z0=0.15)
def towel_stack(coll, loc, rot=0.0, style='hand', count=4, **kw):
    """叠放毛巾（三折，圆角折边 = 0.5 倍厚，层间 3 mm 暗缝，上下错开 5–8 mm）。loc.z = 台面高。style：bath / hand / face / guest_small。"""
    return _piece('towel_stack', coll, loc, rot, 0.32, 0.22, 0.03 * count, 'towel')
def robe(coll, loc, rot=0.0, style='waffle', **kw):
    return _piece('robe', coll, loc, rot, 0.55, 0.15, 1.2, 'cotton_bed', z0=0.5)
def mirror(coll, loc, rot=0.0, style='oval_gilt', w=0.7, h=1.0, **kw):
    return _piece('mirror', coll, loc, rot, w, 0.05, h, 'mirror', z0=kw.get('z0', 1.1))
def hamper(coll, loc, rot=0.0, style='rattan', **kw):
    return _piece('hamper', coll, loc, rot, 0.45, 0.35, 0.5, 'satinwood')

# ---------------------------------------------------------------- 卧室
def bed(coll, loc, rot=0.0, style='four_poster', w=2.0, l=2.1, **kw):
    """床 + 床品（床单、枕、被四边下垂 0.25 m、床尾搭毯三折）。style：four_poster / empire（主卧，华盖另件）/ single / staff。"""
    return _piece('bed', coll, loc, rot, w, l, 0.7, 'cotton_bed')
def canopy(coll, loc, rot=0.0, style='crown', w=2.4, l=2.2, **kw):
    return _piece('canopy', coll, loc, rot, w, l, 0.3, 'silk_ivory', z0=3.2, upper=True)
def nightstand(coll, loc, rot=0.0, style='marble_top', **kw):
    return _piece('nightstand', coll, loc, rot, 0.55, 0.45, 0.65, 'mahogany')
def wardrobe(coll, loc, rot=0.0, style='mahogany_double', w=1.6, **kw):
    return _piece('wardrobe', coll, loc, rot, w, 0.62, 2.3, 'mahogany')
def dresser(coll, loc, rot=0.0, style='triple_mirror', **kw):
    return _piece('dresser', coll, loc, rot, 1.2, 0.5, 0.78, 'satinwood')
def bench(coll, loc, rot=0.0, style='bed_end', w=1.4, **kw):
    return _piece('bench', coll, loc, rot, w, 0.45, 0.48, 'velvet_champagne')

# ---------------------------------------------------------------- 起居与礼仪
def sofa(coll, loc, rot=0.0, style='louis_xvi', w=2.2, **kw):
    return _piece('sofa', coll, loc, rot, w, 0.9, 0.95, kw.get('mat', 'velvet_champagne'))
def armchair(coll, loc, rot=0.0, style='bergere', **kw):
    return _piece('armchair', coll, loc, rot, 0.75, 0.75, 0.95, kw.get('mat', 'velvet_champagne'))
def chair(coll, loc, rot=0.0, style='georgian_dining', **kw):
    return _piece('chair', coll, loc, rot, 0.5, 0.52, 1.0, kw.get('mat', 'mahogany'))
def table(coll, loc, rot=0.0, style='rect', w=1.6, d=0.9, h=0.76, **kw):
    """style：rect / round（w = 直径）/ oval / console（靠墙，大理石台面）/ coffee / card / billiard。"""
    return _piece('table', coll, loc, rot, w, d if style != 'round' else w, h, kw.get('mat', 'walnut'))
def desk(coll, loc, rot=0.0, style='partners', w=1.8, d=0.9, **kw):
    """style：partners（书房 3 × 1.5 m 初代书桌）/ writing / bureau / counter。"""
    return _piece('desk', coll, loc, rot, w, d, 0.78, 'mahogany')
def bookcase(coll, loc, rot=0.0, style='walnut', w=2.0, h=2.4, **kw):
    return _piece('bookcase', coll, loc, rot, w, 0.45, h, 'walnut')
def cabinet(coll, loc, rot=0.0, style='sideboard', w=1.8, h=0.95, d=0.55, **kw):
    """柜类通用：sideboard / display（玻璃门）/ linen_press / plan_chest / filing / safe / bell_board（墙上铃板）/ shelving。"""
    return _piece('cabinet', coll, loc, rot, w, d, h, kw.get('mat', 'mahogany'))
def fireplace(coll, loc, rot=0.0, style='statuario', w=2.0, **kw):
    """壁炉（炉架 + 炉膛 + 炉上镜 / 画另件）。style = 石材名：statuario / levanto / alpi_green / siena / nero / calacatta。"""
    return _piece('fireplace', coll, loc, rot, w, 0.45, 1.3, 'marble_' + style if style in ('statuario', 'calacatta', 'nero', 'siena', 'levanto', 'alpi_green') else 'marble_statuario')
def piano(coll, loc, rot=0.0, style='grand', **kw):
    return _piece('piano', coll, loc, rot, 1.5, 2.1 if style == 'grand' else 0.6, 1.0 if style == 'grand' else 1.3, 'ebony')
def clock(coll, loc, rot=0.0, style='longcase', **kw):
    """style：longcase（大厅 2.6 m 胡桃木长箱钟，传承件）/ mantel / wall。"""
    return _piece('clock', coll, loc, rot, 0.55, 0.3, 2.6 if style == 'longcase' else 0.4, 'walnut')
def rug(coll, loc, rot=0.0, style='aubusson', w=4.0, d=3.0, **kw):
    """地毯：6 mm 厚；style：aubusson / savonnerie / heriz / runner / crimson。"""
    return _piece('rug', coll, loc, rot, w, d, 0.006, {'heriz': 'rug_heriz', 'runner': 'rug_crimson', 'crimson': 'rug_crimson'}.get(style, 'rug_aubusson'))
def curtains(coll, loc, rot=0.0, style='silk_swag', w=1.8, h=3.4, mat='silk_ivory', **kw):
    """窗帘：一扇窗一组（帘盒 + 两幅落地拖 5 cm + 系带 + 纱帘）。loc 在窗洞中心的墙内面。"""
    return _piece('curtains', coll, loc, rot, w + 0.6, 0.15, h, mat)
def chandelier(coll, loc, rot=0.0, style='crystal_24', **kw):
    """吊灯：loc.z = 顶棚高；登记 upper。style：crystal_NN（臂数）/ lantern / brass_12 / billiard_3。"""
    return _piece('chandelier', coll, loc, rot, 1.2, 1.2, 1.0, 'ormolu', z0=-1.0, upper=True)
def sconce(coll, loc, rot=0.0, style='candle', **kw):
    return _piece('sconce', coll, loc, rot, 0.25, 0.2, 0.45, 'ormolu', z0=1.9, upper=True)
def lamp(coll, loc, rot=0.0, style='table', **kw):
    return _piece('lamp', coll, loc, rot, 0.4, 0.4, 0.6 if style == 'table' else 1.6, 'brass_aged')
def painting(coll, loc, rot=0.0, style='portrait', w=1.2, h=1.6, z0=1.6, **kw):
    return _piece('painting', coll, loc, rot, w, 0.08, h, 'ormolu', z0=z0, upper=(z0 > 1.2))
def statue(coll, loc, rot=0.0, style='bust', **kw):
    return _piece('statue', coll, loc, rot, 0.6, 0.6, 1.8, 'marble_statuario')
def vase(coll, loc, rot=0.0, style='blue_white', h=1.4, **kw):
    return _piece('vase', coll, loc, rot, 0.5, 0.5, h, 'sevres_blue')
def plant(coll, loc, rot=0.0, style='citrus', **kw):
    return _piece('plant', coll, loc, rot, 0.8, 0.8, 1.6, 'hedge')
def generic(coll, loc, rot=0.0, style=None, w=1.0, d=0.6, h=0.9, mat='walnut', **kw):
    """占位件（服务房间的台、架、推车等）。"""
    return _piece(style or 'item', coll, loc, rot, w, d, h, mat)
