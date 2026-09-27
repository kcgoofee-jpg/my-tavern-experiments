# 伊甸庄园 · 建筑壳：楼板、外墙与立面（窗、腰线、檐部）、内墙与门洞、竖井与楼梯、屋面、门廊、眺望亭、两翼、塔亭、音乐厅、柱廊。
# 所有权：SHELL 建造者。
# 接口：build(ctx)。全部楼层一次建完（外观视图也要用）；物体按 CONTRACT.md §4 放进 <F>.shell / <F>.roof 并打 cut / upper 标记。
# 墙体规则：房间 rect 的边 = 墙中线。同一条线上的边合并成一段，按门洞切开；厚度：体块外边 WALL_EXT，BEARING_LINES 上 WALL_BEARING，其余 WALL_PART。
# 主楼与两翼的墙逐层分段（楼面到上层楼面），不跨层；塔亭 C、音乐厅 D 按房间净高。
# 桩实现：实心墙 + 贴在外表面的深色玻璃 + 窗台窗楣；屋面、柱、穹顶都是简单体块。
import math
from . import core, mats, plan

DOOR_H = 2.8


def build(ctx):
    for fl in plan.FLOOR_ORDER:
        _floor(fl)
    _roofs()
    _portico()
    _belvedere()
    _pavilions()


# ---------------------------------------------------------------- 墙
def _top(fl, room=None):
    """该层墙顶（世界 z）。"""
    z = plan.fz(fl)
    if room is not None and plan.block_of(room) in ('C', 'D'): return z + room['h'] + plan.SLAB
    if fl == 'F5': return z + (room['h'] if room else 3.2)
    if fl == 'B1': return plan.fz('F1') - plan.SLAB
    nxt = plan.FLOOR_ORDER[plan.FLOOR_ORDER.index(fl) + 1]
    return plan.fz(nxt) if fl != 'F4' else plan.MAIN_TOP


def _thickness(fl, axis, fixed, a0, a1):
    for b in plan.BLOCKS.values():
        if fl not in b['floors']: continue
        x0, x1, y0, y1 = b['rect']
        if axis == 'y' and fixed in (y0, y1) and x0 - 1e-6 <= a0 and a1 <= x1 + 1e-6: return plan.WALL_EXT
        if axis == 'x' and fixed in (x0, x1) and y0 - 1e-6 <= a0 and a1 <= y1 + 1e-6: return plan.WALL_EXT
    for ax, f, b0, b1, fls in plan.BEARING_LINES:
        if ax == axis and abs(f - fixed) < 1e-6 and fl in fls.split() and b0 - 1e-6 <= a0 and a1 <= b1 + 1e-6: return plan.WALL_BEARING
    return plan.WALL_PART


def _segments(fl):
    """该层所有墙段：{(轴, 固定坐标): [(a0, a1, 墙顶, 房间)]}。轴 'y' = 沿 x 走的墙（固定 y）。"""
    lines = {}
    for r in plan.rooms(fl):
        if r['container'] or r.get('round'): continue
        x0, x1, y0, y1 = r['rect']; top = _top(fl, r)
        for axis, fixed, a0, a1 in (('y', y0, x0, x1), ('y', y1, x0, x1), ('x', x0, y0, y1), ('x', x1, y0, y1)):
            lines.setdefault((axis, fixed), []).append((a0, a1, top))
    out = {}
    for key, segs in lines.items():                     # 同一条线上的重叠段合并（取最高墙顶）
        segs.sort(); merged = []
        for a0, a1, top in segs:
            if merged and a0 <= merged[-1][1] + 1e-6:
                m = merged[-1]; merged[-1] = (m[0], max(m[1], a1), max(m[2], top))
            else: merged.append((a0, a1, top))
        out[key] = merged
    return out


def _gaps(fl):
    """门洞：{(轴, 固定坐标): [(中心, 宽, 类型)]}（同一扇门在两侧房间各出现一次，这里去重）。"""
    g = {}
    for r in plan.rooms(fl):
        x0, x1, y0, y1 = r['rect']
        for d in plan.doors(r):
            if d['at'] is None or d['w'] <= 0: continue
            key = {'S': ('y', y0), 'N': ('y', y1), 'W': ('x', x0), 'E': ('x', x1)}[d['edge']]
            lst = g.setdefault(key, [])
            if not any(abs(c - d['at']) < 0.05 for c, _, _ in lst): lst.append((d['at'], d['w'], d['kind']))
    return g


def _floor(fl):
    z = plan.fz(fl)
    col = core.floor_coll(fl)
    ext = core.Batch(f'{fl}.walls_ext', mats.get('stone_rustic' if fl in ('F1', 'B1') else 'stone_portland'))
    inn = core.Batch(f'{fl}.walls_int', mats.get('plaster_cream'))
    lintel = core.Batch(f'{fl}.lintels', mats.get('plaster_cream'))
    gaps = _gaps(fl)
    for (axis, fixed), segs in _segments(fl).items():
        for a0, a1, top in segs:
            t = _thickness(fl, axis, fixed, a0, a1)
            B = ext if t == plan.WALL_EXT else inn
            cur = a0
            for c, w, kind in sorted(g for g in gaps.get((axis, fixed), []) if a0 < g[0] < a1):
                if kind == 'secret': continue                         # 暗门：墙面保持完整（与石缝对齐）
                g0, g1 = max(a0, c - w / 2), min(a1, c + w / 2)
                _wall(B, axis, fixed, cur, g0, z, top, t)
                hd = DOOR_H + (1.2 if kind in ('arch', 'double_door') else 0)
                if z + hd < top: _wall(lintel, axis, fixed, g0, g1, z + hd, top, t)
                cur = g1
            _wall(B, axis, fixed, cur, a1, z, top, t)
    for b in (ext, inn):
        if not b.empty(): core.link(b.done(), col, cut=True)
    if not lintel.empty(): core.link(lintel.done(), col, upper=True)
    _slabs(fl, col)
    _windows(fl, col)
    _stairs(fl, col)


def _wall(B, axis, fixed, a0, a1, z0, z1, t):
    if a1 - a0 < 1e-3 or z1 - z0 < 1e-3: return
    if axis == 'y': B.box(a0, a1, fixed - t / 2, fixed + t / 2, z0, z1)
    else: B.box(fixed - t / 2, fixed + t / 2, a0, a1, z0, z1)


def _slabs(fl, col):
    z = plan.fz(fl)
    B = core.Batch(f'{fl}.slab', mats.get('stone_rustic' if fl == 'F1' else 'plaster_ceiling'))
    for r in plan.rooms(fl):
        if fl == 'F5' or r['void'] or r['kind'] in ('stair_landing',) or r.get('round') or r['container']: continue   # F5 的板就是 _roofs 的屋面板
        if r['kind'] in ('service_stair', 'master_passage') and fl != 'B1': continue
        x0, x1, y0, y1 = r['rect']
        B.box(x0, x1, y0, y1, z - plan.SLAB, z)
    for part in (r['parts'].get('gallery') for r in plan.rooms(fl)):
        if part: B.box(part[0], part[1], part[2], part[3], z - plan.SLAB, z)
    if not B.empty(): core.link(B.done(), col)


def _windows(fl, col):
    glass = core.Batch(f'{fl}.glass', mats.get('glass_window'))
    trim = core.Batch(f'{fl}.window_trim', mats.get('stone_trim'))
    heads = core.Batch(f'{fl}.window_heads', mats.get('stone_trim'))
    z = plan.fz(fl); o = plan.WALL_EXT / 2 + 0.03
    for r in plan.rooms(fl):
        x0, x1, y0, y1 = r['rect']
        for w in plan.windows(r):
            zb, zt = z + w['sill'], z + w['sill'] + w['h']
            if w['edge'] in 'SN':
                f, s = (y0, -1) if w['edge'] == 'S' else (y1, 1)
                glass.box(w['at'] - w['w'] / 2, w['at'] + w['w'] / 2, f + s * o - 0.03, f + s * o + 0.03, zb, zt)
                trim.box(w['at'] - w['w'] / 2 - 0.2, w['at'] + w['w'] / 2 + 0.2, f + s * o - 0.1, f + s * o + 0.1, zb - 0.2, zb)
                heads.box(w['at'] - w['w'] / 2 - 0.25, w['at'] + w['w'] / 2 + 0.25, f + s * o - 0.12, f + s * o + 0.12, zt, zt + 0.35)
            else:
                f, s = (x0, -1) if w['edge'] == 'W' else (x1, 1)
                glass.box(f + s * o - 0.03, f + s * o + 0.03, w['at'] - w['w'] / 2, w['at'] + w['w'] / 2, zb, zt)
                trim.box(f + s * o - 0.1, f + s * o + 0.1, w['at'] - w['w'] / 2 - 0.2, w['at'] + w['w'] / 2 + 0.2, zb - 0.2, zb)
                heads.box(f + s * o - 0.12, f + s * o + 0.12, w['at'] - w['w'] / 2 - 0.25, w['at'] + w['w'] / 2 + 0.25, zt, zt + 0.35)
    for b, tag in ((glass, 'cut'), (trim, 'cut'), (heads, 'upper')):
        if not b.empty(): core.link(b.done(), col, **{tag: True})


def _stairs(fl, col):
    """桩：楼梯做成台阶体块，电梯井是黄铜框。"""
    z = plan.fz(fl)
    B = core.Batch(f'{fl}.stairs', mats.get('stone_portland'))
    for s in plan.SHAFTS:
        if fl not in s['floors']: continue
        x0, x1, y0, y1 = s['rect']
        if s['id'] == 'stair' and fl in ('F1', 'F2'):
            n = 14
            for k in range(n):
                for sx in (x0 + 0.4, x1 - 2.6):
                    B.box(sx, sx + 2.2, y0 + 1 + k * (y1 - y0 - 3) / n, y0 + 1 + (k + 1) * (y1 - y0 - 3) / n, z, z + (k + 1) * 4.5 / n / 2 + (0 if sx < x0 + 1 else 2.25))
        elif s['id'] == 'service' and fl != 'F5':
            for k in range(10):
                B.box(x0 + 0.3, x1 - 0.3, y0 + 0.5 + k * 0.7, y0 + 1.2 + k * 0.7, z, z + (k + 1) * 0.45)
    if not B.empty(): core.link(B.done(), col, cut=True)
    for s in plan.SHAFTS:
        if s['id'] == 'lift' and fl in s['floors']:
            x0, x1, y0, y1 = s['rect']
            core.box(f'{fl}.lift', x0, x1, y0, y1, z, _top(fl), mats.get('brass'), col, cut=True)


# ---------------------------------------------------------------- 屋面
def _roofs():
    # 两翼：13.5 m 铅皮平屋顶 + 檐口 + 栏杆 + 烟囱 → F4.roof（F3 剖切时隐藏，F4 / F5 视图里完整）
    col = core.floor_coll('F4', 'roof')
    lead, trim, stone = (core.Batch('F4.wing_roof', mats.get('lead_roof')), core.Batch('F4.wing_cornice', mats.get('stone_trim')),
                         core.Batch('F4.wing_chimneys', mats.get('stone_portland')))
    for k in ('BW', 'BE'):
        x0, x1, y0, y1 = plan.BLOCKS[k]['rect']; z = plan.WING_TOP
        xa, xb = (x0 - 0.45, x1) if k == 'BW' else (x0, x1 + 0.45)
        lead.box(xa, xb, y0 - 0.45, y1 + 0.45, z - 0.3, z)
        trim.box(xa - (0.8 if k == 'BW' else 0), xb + (0.8 if k == 'BE' else 0), y0 - 1.25, y0 - 0.45, z - 0.9, z)
        trim.box(xa - (0.8 if k == 'BW' else 0), xb + (0.8 if k == 'BE' else 0), y1 + 0.45, y1 + 1.25, z - 0.9, z)
        for yy in (y0 - 0.6, y1 + 0.6): trim.box(xa, xb, yy - 0.2, yy + 0.2, z, z + 1.1)          # 栏杆（桩：实心）
        xe = x0 - 0.6 if k == 'BW' else x1 + 0.6; trim.box(xe - 0.2, xe + 0.2, y0 - 0.6, y1 + 0.6, z, z + 1.1)
    for cx, cy in plan.CHIMNEYS: stone.box(cx - 0.7, cx + 0.7, cy - 1.4, cy + 1.4, plan.WING_TOP, plan.WING_TOP + 3.0)
    for b in (lead, trim, stone): core.link(b.done(), col)
    # 主楼：F4 顶上的檐部（F4 剖切时隐藏）+ F5 屋顶平台板、栏杆
    x0, x1, y0, y1 = plan.BLOCKS['A']['rect']
    ent = core.Batch('F4.main_entablature', mats.get('stone_trim'))
    zc, hc = plan.CORNICE['z'], plan.CORNICE['h']
    for (a, b, c, d) in ((x0 - 1.2, x1 + 1.2, y0 - 1.2, y0 - 0.45), (x0 - 1.2, x1 + 1.2, y1 + 0.45, y1 + 1.2),
                         (x0 - 1.2, x0 - 0.45, y0 - 0.45, y1 + 0.45), (x1 + 0.45, x1 + 1.2, y0 - 0.45, y1 + 0.45)):
        ent.box(a, b, c, d, zc + hc - 0.9, zc + hc)
    core.link(ent.done(), core.floor_coll('F4'), upper=True)
    col5 = core.floor_coll('F5')
    z5 = plan.fz('F5')
    core.box('F5.roof_deck', x0 - 0.45, x1 + 0.45, y0 - 0.45, y1 + 0.45, plan.MAIN_TOP, z5, mats.get('portland_paving'), col5)
    par = core.Batch('F5.parapet', mats.get('stone_trim'))
    for (a, b, c, d) in ((x0 - 0.45, x1 + 0.45, y0 - 0.45, y0), (x0 - 0.45, x1 + 0.45, y1, y1 + 0.45), (x0 - 0.45, x0, y0, y1), (x1, x1 + 0.45, y0, y1)):
        par.box(a, b, c, d, z5, z5 + 1.1)
    core.link(par.done(), col5, cut=True)


def _portico():
    p = plan.PORTICO; r = p['col_d'] / 2
    for fl, z0, z1 in (('F1', 0.0, 4.5), ('F2', 4.5, 9.0), ('F3', 9.0, 13.5)):
        B = core.Batch(f'{fl}.portico_columns', mats.get('stone_trim'), smooth=True)
        for x in p['col_x']: B.cyl(x, p['col_y'], z0, r, z1 - z0, seg=24)
        core.link(B.done(), core.floor_coll(fl), cut=True)
    x0, x1, y0, y1 = p['rect']
    core.box('F1.portico_floor', x0, x1, y0, y1, -0.3, 0.0, mats.get('stone_rustic'), core.floor_coll('F1'))
    ent = core.Batch('F4.portico_entablature', mats.get('stone_trim'))
    zt = p['col_h']; ent.box(x0, x1, y0, y1, zt, zt + p['entablature'])
    ht = (x1 - x0) / 2 * p['pediment_pitch']; zp = zt + p['entablature']
    ent.prism([(x0, y0), (x1, y0), (x1, y0 + 0.01), (x0, y0 + 0.01)], zp, zp + 0.01)                       # 占位：山花用三棱柱
    tri = core.Batch('F4.pediment', mats.get('lead_roof'))
    bm = tri.bm; vs = [bm.verts.new(v) for v in ((x0, y0, zp), (x1, y0, zp), (0, y0, zp + ht), (x0, y1, zp), (x1, y1, zp), (0, y1, zp + ht))]
    for f in ((0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (1, 4, 5, 2), (0, 3, 4, 1)): bm.faces.new([vs[i] for i in f])
    core.link(ent.done(), core.floor_coll('F4'), upper=True); core.link(tri.done(), core.floor_coll('F4'), upper=True)
    core.link(core.Batch('F4.crest', mats.get('gold_leaf')).sphere(0, y0 - 0.2, zp + ht * 0.4, 0.9, sz=1.1).done(), core.floor_coll('F4'), upper=True)


def _belvedere():
    b = plan.BELVEDERE; cx, cy = b['c']; z = b['z']
    col = core.floor_coll('F5')
    core.link(core.Batch('F5.drum', mats.get('stone_portland')).ring(cx, cy, z, b['r_out'], b['r_in'], b['drum_h'], gaps=[(-math.pi / 2, 1.8)]).done(), col, cut=True)
    dome = core.Batch('F5.dome', mats.get('lead_roof'), smooth=True).sphere(cx, cy, z + b['drum_h'], b['r_out'] + 0.3, sz=0.8, sub=4)
    dome.cyl(cx, cy, z + b['drum_h'] + b['r_out'] * 0.8, 1.2, 2.2, seg=16)
    core.link(dome.done(), col, upper=True)
    core.link(core.Batch('F5.finial', mats.get('gold_leaf')).sphere(cx, cy, z + b['drum_h'] + b['r_out'] * 0.8 + 2.8, 0.45).done(), col, upper=True)
    for rid in ('503', '504', '505'):
        x0, x1, y0, y1 = plan.ROOM_BY_ID[rid]['rect']
        core.box(f'F5.kiosk_roof.{rid}', x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3, z + 3.2, z + 3.5, mats.get('lead_roof'), col, upper=True)


def _pavilions():
    # 柱廊连廊：爱奥尼亚单排柱 + 屋面
    for k in ('CW', 'CE'):
        x0, x1, y0, y1 = plan.BLOCKS[k]['rect']; top = plan.BLOCKS[k]['top']
        cols = core.Batch(f'F1.colonnade.{k}', mats.get('stone_trim'), smooth=True)
        n = 8
        for i in range(n):
            x = x0 + (i + 0.5) * (x1 - x0) / n
            cols.cyl(x, y0 + 0.5, 0, 0.3, top - 0.8, seg=16)
        cols.box(x0, x1, y1 - 0.45, y1 + 0.45, 0, top - 0.8)                         # 背墙（北侧）
        core.link(cols.done(), core.floor_coll('F1'), cut=True)
        core.box(f'F1.colonnade_roof.{k}', x0, x1, y0 - 0.2, y1 + 0.5, top - 0.8, top, mats.get('lead_roof'), core.floor_coll('F1'), upper=True)
        core.box(f'F1.colonnade_floor.{k}', x0, x1, y0, y1, -0.3, 0.0, mats.get('stone_rustic'), core.floor_coll('F1'))
    # 图书馆塔亭：两层 10 m + 八角塔身到 28 m（F2 上部）
    x0, x1, y0, y1 = plan.BLOCKS['C']['rect']; t = plan.BLOCKS['C']['tower']
    core.box('F2.library_roof', x0 - 0.45, x1 + 0.45, y0 - 0.45, y1 + 0.45, 9.7, 10.0, mats.get('lead_roof'), core.floor_coll('F2'), upper=True)
    oct_ = [((x0 + x1) / 2 + t['r'] * math.cos(math.pi / 8 + k * math.pi / 4), (y0 + y1) / 2 + t['r'] * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]
    core.link(core.Batch('F2.library_tower', mats.get('stone_portland')).prism(oct_, 10.0, t['top'] - 3).done(), core.floor_coll('F2'), upper=True)
    core.link(core.Batch('F2.library_cupola', mats.get('lead_roof'), smooth=True).sphere((x0 + x1) / 2, (y0 + y1) / 2, t['top'] - 3, t['r'] * 0.9, sz=0.7).done(),
              core.floor_coll('F2'), upper=True)
    # 音乐厅：单层 11 m，筒拱屋面 + 北端半圆后殿
    x0, x1, y0, y1 = plan.BLOCKS['D']['rect']; top = plan.BLOCKS['D']['top']; a = plan.BLOCKS['D']['apse']
    core.link(core.Batch('F1.music_apse', mats.get('stone_portland')).ring(a['c'][0], a['c'][1], 0, a['r'], a['r'] - 0.9, top).done(), core.floor_coll('F1'), cut=True)
    vault = core.Batch('F1.music_vault', mats.get('lead_roof'), smooth=True)
    for k in range(12):
        a0, a1 = math.pi * k / 12, math.pi * (k + 1) / 12; R = (x1 - x0) / 2 + 0.45; c = (x0 + x1) / 2
        vault.prism([(c - R * math.cos(a0), y0 - 0.45), (c - R * math.cos(a1), y0 - 0.45), (c - R * math.cos(a1), y1 + 0.45), (c - R * math.cos(a0), y1 + 0.45)],
                    top + R * 0.35 * math.sin(a0) - 0.3, top + R * 0.35 * math.sin(a0))
    core.link(vault.done(), core.floor_coll('F1'), upper=True)
