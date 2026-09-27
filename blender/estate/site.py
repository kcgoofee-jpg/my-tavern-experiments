# 伊甸庄园 · 岛体与园林、附属建筑（SITE.*，从不剖切）。所有权：SHELL 建造者。
# 接口：build(ctx)。坐标：plan 里园林与附属建筑是岛坐标，这里一律用 plan.i2m 换成府邸坐标（= Blender 世界坐标）。
# 桩实现：岛面（按 tc_estates 同一轮廓）+ 倒锥岩基 + 前庭 / 大道 / 花坛 / 湖 / 喷泉的平面块 + 附属建筑体块。
import math
from . import core, mats, plan


def build(ctx):
    _island()
    _gardens()
    _outbuildings()


def _island():
    pts = plan.island_outline(180, 1.0, 'manor')
    top = core.Batch('SITE.island_top', mats.get('lawn')).prism(pts, plan.GROUND_Z - 1.0, plan.GROUND_Z - 0.05)
    core.link(top.done(), core.site_coll('island'))
    rock = core.Batch('SITE.island_rock', mats.get('rock'))
    bm = rock.bm; cx, cy = plan.i2m(0, 0)
    ring = [bm.verts.new((x, y, plan.GROUND_Z - 1.0)) for x, y in pts]
    tip = bm.verts.new((cx, cy, -plan.ISLAND['rock_depth']))
    for i in range(len(ring)): bm.faces.new((ring[(i + 1) % len(ring)], ring[i], tip))
    core.link(rock.done(), core.site_coll('island'))


def _flat(name, mat, rect, dz=0.0, part='garden'):
    x0, y0 = plan.i2m(rect[0], rect[2]); x1, y1 = plan.i2m(rect[1], rect[3])
    return core.box(name, x0, x1, y0, y1, plan.GROUND_Z - 0.05 + dz, plan.GROUND_Z - 0.02 + dz, mats.get(mat), core.site_coll(part))


def _gardens():
    A = plan.AREA_BY_ID
    _flat('SITE.forecourt', 'gravel', A['forecourt']['rect'], 0.001)
    av = A['avenue']; _flat('SITE.avenue_lawn', 'lawn_dark', av['rect'], 0.001)
    _flat('SITE.avenue_path', 'gravel', (-av['path_w'] / 2, av['path_w'] / 2, av['rect'][2], av['rect'][3]), 0.002)
    for k in ('parterre_w', 'parterre_e'): _flat(f'SITE.{k}', 'hedge', A[k]['rect'], 0.002)
    _flat('SITE.rear_court', 'stone_portland', A['rear_court']['rect'], 0.002)
    for k in ('rose', 'maze', 'kitchen_garden', 'orchard', 'reserve_w', 'reserve_e'): _flat(f'SITE.{k}', 'hedge' if k == 'maze' else 'lawn_dark', A[k]['rect'], 0.001)
    water = core.Batch('SITE.lake', mats.get('water'))
    for j, (cx, cy, a, b, t) in enumerate(A['lake']['lobes']):
        mx, my = plan.i2m(cx, cy)
        pts = [(mx + a * math.cos(u) * math.cos(t) - b * math.sin(u) * math.sin(t), my + a * math.cos(u) * math.sin(t) + b * math.sin(u) * math.cos(t))
               for u in (2 * math.pi * k / 48 for k in range(48))]
        water.prism(pts, plan.GROUND_Z - 0.6 - 0.01 * j, plan.GROUND_Z - 0.01 - 0.003 * j)       # 桩：几个椭圆叠成湖，错开顶面免得重面
    core.link(water.done(), core.site_coll('water'))
    f = A['forecourt']['fountain']; fx, fy = plan.i2m(*f['c'])
    core.link(core.Batch('SITE.fountain', mats.get('stone_trim')).ring(fx, fy, 0, f['r'], f['r'] - 0.4, 0.6).cyl(fx, fy, 0, 1.2, 2.4).done(), core.site_coll('garden'))
    core.link(core.Batch('SITE.fountain_water', mats.get('water')).cyl(fx, fy, 0, f['r'] - 0.4, 0.45, seg=48).done(), core.site_coll('water'))


def _outbuildings():
    B = core.Batch('SITE.outbuildings', mats.get('stone_portland'))
    for o in plan.OUTBUILDINGS:
        h = o.get('h', 3.0)
        if 'rect' in o:
            x0, y0 = plan.i2m(o['rect'][0], o['rect'][2]); x1, y1 = plan.i2m(o['rect'][1], o['rect'][3])
            if h > 0: B.box(x0, x1, y0, y1, 0, h)
            else: core.box(f'SITE.{o["id"]}', x0, x1, y0, y1, -0.04, 0.0, mats.get('stone_rustic'), core.site_coll('out'))
        elif 'bearing' in o:
            x, y = plan.i2m(*plan.anchor_pos(o)); B.box(x - 1, x + 1, y - 1, y + 1, 0, h)
        elif 'size' in o:
            x, y = plan.i2m(*o['c']); w, d = o['size']; B.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, 0, h)
        else:
            x, y = plan.i2m(*o['c']); B.cyl(x, y, 0, o['r'], max(h if o['id'] not in ('L',) else 0.4, 0.4), seg=32)
    core.link(B.done(), core.site_coll('out'))
