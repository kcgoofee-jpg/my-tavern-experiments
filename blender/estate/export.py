# 伊甸庄园 · 剖切图房间多边形导出 → map/data/eden_estate_tiles.json（格式见 CONTRACT.md §7）。所有权：SHELL 建造者。
# 接口：
#   view_data(view, ctx, cam) → dict            该视图里每个房间 / 室外区域的归一化多边形（左上原点）
#   write(view, data, file_stem, path=TILES)     合并写入（只替换这个视图；rooms / areas 索引每次按 plan 重写）
import json, os
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
from . import plan

HERE = os.path.dirname(os.path.abspath(__file__))
TILES = os.path.abspath(os.path.join(HERE, '..', '..', 'map', 'data', 'eden_estate_tiles.json'))
VERSION = 1


def _proj(sc, cam, p):
    v = world_to_camera_view(sc, cam, Vector(p))
    return [round(v.x, 5), round(1 - v.y, 5)]


def _offset(fl):
    r = bpy.data.objects.get(f'{fl}.root')
    return tuple(r.location) if r else (0.0, 0.0, 0.0)


def view_data(view, ctx, cam):
    sc = ctx.scene
    out = {'floor': view if view in plan.FLOORS else None, 'rooms': {}, 'areas': {}}
    if view in plan.FLOORS or view == 'all':
        fls = [view] if view in plan.FLOORS else plan.FLOOR_ORDER[1:]
        for fl in fls:
            ox, oy, oz = _offset(fl)
            for r in plan.rooms(fl):
                if r['container'] and fl != 'F5': continue
                z = r['z'] + 0.02 + oz
                poly = [_proj(sc, cam, (x + ox, y + oy, z)) for x, y in plan.room_poly(r, n=24)]
                cx, cy = plan.rect_c(r['rect']) if not r.get('round') else r['round'][:2]
                out['rooms'][r['id']] = {'poly': poly, 'c': _proj(sc, cam, (cx + ox, cy + oy, z))}
    else:                                                             # 外观 / 整岛：室外区域与附属建筑（地面高度），主楼外轮廓（屋面高度）
        for a in plan.AREAS:
            x0, y0 = plan.i2m(a['rect'][0], a['rect'][2]); x1, y1 = plan.i2m(a['rect'][1], a['rect'][3])
            out['areas'][a['id']] = {'poly': [_proj(sc, cam, (x, y, 0.0)) for x, y in plan.rect_poly((x0, x1, y0, y1))]}
        for o in plan.OUTBUILDINGS:
            if 'rect' not in o: continue
            x0, y0 = plan.i2m(o['rect'][0], o['rect'][2]); x1, y1 = plan.i2m(o['rect'][1], o['rect'][3])
            out['areas'][o['id']] = {'poly': [_proj(sc, cam, (x, y, o.get('h', 0.0))) for x, y in plan.rect_poly((x0, x1, y0, y1))]}
        for k, b in plan.BLOCKS.items():
            out['areas'][f'block_{k}'] = {'poly': [_proj(sc, cam, (x, y, b['top'])) for x, y in plan.rect_poly(b['rect'])]}
    return out


def _index():
    rooms = {r['id']: {k: r[k] for k in ('name', 'name_en', 'alias', 'alias_en', 'floor', 'zone', 'rank', 'minor', 'kind')} for r in plan.ROOMS}
    areas = {a['id']: {k: a.get(k) for k in ('name', 'name_en', 'alias', 'alias_en')} for a in plan.AREAS + plan.OUTBUILDINGS}
    areas['manor'] = {k: plan.MAIN_AREA[k] for k in ('name', 'name_en', 'alias', 'alias_en')}
    return rooms, areas


def write(view, data, file_stem, ctx, path=TILES):
    try: doc = json.load(open(path, encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError): doc = {}
    rooms, areas = _index()
    from . import views
    doc.update({
        '_note': '伊甸庄园剖切等轴图的房间多边形（blender/eden_manor.py 生成，不要手改）。坐标归一化到图像宽高，左上原点；'
                 'views.<视图>.rooms.<id>.poly 是该房间地面的轮廓，c 是标签点。rooms / areas 是叫法索引（alias 与 maps.json eden_estate 一致）。格式见 blender/estate/CONTRACT.md §7。',
        'version': VERSION,
        'camera': {'type': 'ortho', 'azimuth_deg': views.CAM['azimuth'], 'elevation_deg': views.CAM['elevation'], 'ortho_m': views.CAM['ortho'],
                   'target': list(views.CAM['target']), 'aspect': views.ASPECT, 'frames': views.FRAMES},
        'floors': {k: {'z': v['z'], 'name': v['name'], 'name_en': v['name_en']} for k, v in plan.FLOORS.items()},
        'zones': plan.ZONE_COLORS, 'rooms': rooms, 'areas': areas,
    })
    doc.setdefault('views', {})[view] = dict(file=file_stem, **data)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(doc, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('DATA', path, view, len(data['rooms']), 'rooms', len(data['areas']), 'areas')
