# 伊甸庄园 · 房间饰面与陈设。所有权：INTERIOR 建造者。
# 接口（由 estate.build 调用，每个房间一次）：
#   finish(room, coll)    地面饰面（楼面上 2 cm）+ 墙面衬层（贴墙内面 2 cm，留门窗洞）+ 顶棚饰面（upper）
#   furnish(room, coll)   按 room['kind'] 摆家具（furniture.*），数量与件名依 docs/eden-estate.md §4
#   closeups(room)        近景机位 [dict(name, eye=(x, y, z), target=(x, y, z), lens=mm, hide=[物体名前缀...])]，views 用它出 --closeup
# room 是 plan.ROOMS 的一项；coll = core.room_coll(room)。坐标都是府邸坐标（米），z 取 room['z']。
# 墙中线在 rect 边上：净空 = rect 各边内收 半墙厚（外墙 0.45，承重 0.3，隔墙 0.15，见 inner_rect）。
import math
from . import core, mats, plan, furniture as F


def inner_rect(room):
    """房间净空矩形（扣掉半墙厚）。"""
    x0, x1, y0, y1 = room['rect']
    def half(side):
        ext = any(e[0] == side for e in plan.exterior_edges(room))
        return plan.WALL_EXT / 2 if ext else plan.WALL_PART / 2
    return (x0 + half('W'), x1 - half('E'), y0 + half('S'), y1 - half('N'))


def finish(room, coll):
    """桩：只铺地面饰面（2 cm）。"""
    if room['void'] or room['kind'] in ('hall_void',): return
    z = room['z']
    t = 0.012 if room['container'] else 0.02          # 底面房间（F5 屋顶平台）薄一点，上面的亭子地面不和它共面
    if room.get('round'):
        cx, cy, r = room['round']
        o = core.Batch(f'floor.{room["id"]}', mats.get(room['floor_mat'])).cyl(cx, cy, z, r, t, seg=48).done()
    else:
        x0, x1, y0, y1 = inner_rect(room)
        o = core.Batch(f'floor.{room["id"]}', mats.get(room['floor_mat'])).box(x0, x1, y0, y1, z, z + t).done()
    core.link(o, coll, room=room['id'])


# kind → 陈设配方。桩：每类放几件占位，位置按净空比例。正式实现按设定逐件摆。
def furnish(room, coll):
    k, z = room['kind'], room['z']
    x0, x1, y0, y1 = inner_rect(room); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; w, d = x1 - x0, y1 - y0
    if room['void'] or room['container'] or k in ('service_stair', 'master_passage', 'stair_hall', 'stair_landing', 'kiosk', 'hall_void'): return
    P = lambda fx, fy: (x0 + fx * w, y0 + fy * d, z)
    if k in ('powder_room', 'washroom', 'staff_washroom', 'master_bath'):
        wcs = room['parts'].get('wc') or [(x0, x0 + min(w, 3.0), y1 - 2.5, y1)]
        for r in (wcs if isinstance(wcs, list) else [wcs]):
            F.toilet(coll, ((r[0] + r[1]) / 2, r[3] - 0.5, z), 0.0, 'high_tank' if k == 'powder_room' else 'staff' if k == 'staff_washroom' else 'low_tank')
        F.basin(coll, P(0.5, 0.08), math.pi, 'double' if k == 'master_bath' else 'vanity')
        F.towel_rail(coll, (x0 + 0.1, cy, z), -math.pi / 2)
        if k == 'master_bath': F.bathtub(coll, P(0.55, 0.5), 0.0, 'monolith')
    elif k in ('guest_suite', 'second_suite', 'spare_bedroom', 'master_bedroom', 'staff_bedroom', 'neutral_private'):
        bed_r = room['parts'].get('bed', (x0, x1, y0, y1))
        bx = (bed_r[0] + bed_r[1]) / 2
        F.bed(coll, (bx, y1 - 1.3, z), 0.0, 'single' if k in ('staff_bedroom', 'neutral_private') else 'empire' if k == 'master_bedroom' else 'four_poster',
              w=0.9 if k in ('staff_bedroom', 'neutral_private') else 2.4 if k == 'master_bedroom' else 2.0)
        F.wardrobe(coll, (x0 + 0.4, cy, z), -math.pi / 2)
        if 'bath' in room['parts']:
            b = room['parts']['bath']
            F.bathtub(coll, ((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, z), math.pi / 2)
            F.toilet(coll, (b[1] - 0.5, b[3] - 0.5, z), 0.0)
    elif k in ('dining', 'family_dining', 'staff_hall'):
        F.rug(coll, (cx, cy, z), 0.0, 'crimson', w=w * 0.7, d=d * 0.5)
        F.table(coll, (cx, cy, z), 0.0, 'rect', w=w * 0.6, d=1.4)
    elif k in ('study', 'library', 'archive', 'secretary', 'head_maid_office', 'porter'):
        F.desk(coll, (cx, cy, z), 0.0)
        F.bookcase(coll, (cx, y1 - 0.25, z), 0.0, w=w * 0.8)
    elif k in ('garden_hall', 'sitting_room', 'drawing_room', 'anteroom', 'green_parlour', 'master_sitting', 'family_sitting', 'guest_sitting', 'tea_room', 'reading_room', 'music_room'):
        F.rug(coll, (cx, cy, z), 0.0, 'aubusson', w=w * 0.6, d=d * 0.5)
        F.sofa(coll, (cx, cy - 1.2, z), math.pi); F.table(coll, (cx, cy, z), 0.0, 'coffee', w=1.2, d=0.7, h=0.45)
        F.fireplace(coll, (cx, y1 - 0.25, z), 0.0)
    elif k == 'hall':
        F.rug(coll, (cx, y0 + 3, z), 0.0, 'aubusson', w=6, d=4)
        F.clock(coll, (x0 + 0.3, cy + 4, z), -math.pi / 2, 'longcase')
    elif k == 'billiards':
        F.table(coll, (cx, cy, z), 0.0, 'billiard', w=1.6, d=3.0, h=0.8, mat='felt_green')
    elif k in ('cross_hall', 'wing_corridor', 'attic_corridor', 'portrait_gallery'):
        F.rug(coll, (cx, cy, z), 0.0, 'runner', w=w * 0.8 if w > d else 1.6, d=1.6 if w > d else d * 0.8)
    elif k == 'belvedere':
        F.table(coll, (room['round'][0], room['round'][1], z), 0.0, 'round', w=1.6)
    else:
        F.generic(coll, (cx, cy, z), 0.0, style=k)


def closeups(room):
    """近景机位。桩：主浴室一个（整块浴缸，C3 评审 R4-6 要排第 1）。"""
    if room['id'] == '316':
        z = room['z']
        return [dict(name='tub', eye=(-42.0, 3.5, z + 1.6), target=(-47.0, 9.0, z + 0.6), lens=28)]
    x0, x1, y0, y1 = inner_rect(room); z = room['z']
    return [dict(name='room', eye=(x0 + 0.6, y0 + 0.6, z + 1.7), target=((x0 + x1) / 2, (y0 + y1) / 2, z + 0.8), lens=20)]
