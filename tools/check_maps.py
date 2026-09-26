#!/usr/bin/env python3
"""地图注册表与渲染数据的一致性检查（不依赖 Blender / Pillow）。

用法：python3 tools/check_maps.py            # 有错误时退出码 1
检查：
  - maps.json 结构：start / parent / group / overlay.from / link 指向的地图都存在
  - 已上线的地图：底图 DZI 与瓦片目录存在；points 地图的数据文件存在
  - 标记：渲染数据里的每个 id 在 maps.json 里有名称；maps.json 里的每个标记在数据里有坐标；nx/ny 在 0…1
  - 标记字段：name、tag（set / inf）、src 必填；alias 为非空列表
  - 跨层对齐：link 两端的地点在平面上应当重合（同一套平面坐标），偏差超过 2% 图宽报错
  - 三层数据的 extent_m 一致
"""
import json, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'map')
errors, warns = [], []
def err(m): errors.append(m)
def warn(m): warns.append(m)

reg = json.load(open(os.path.join(ROOT, 'data', 'maps.json')))
maps = reg['maps']
if reg.get('start') not in maps: err(f"start 指向不存在的地图 {reg.get('start')}")
for gid, g in reg.get('groups', {}).items():
    for k in g['layers']:
        if k not in maps: err(f'group {gid} 里的 {k} 不存在')
data = {}
for mid, m in maps.items():
    if m.get('parent') and m['parent'] not in maps: err(f"{mid}.parent → {m['parent']} 不存在")
    if m.get('group') and m['group'] not in reg.get('groups', {}): err(f"{mid}.group → {m['group']} 不存在")
    if m.get('status') == 'planned': continue
    base = m.get('base')
    if not base: err(f'{mid} 没有 base'); continue
    if not os.path.exists(os.path.join(ROOT, base)): err(f'{mid}: 缺底图 {base}')
    if base.endswith('.dzi') and not os.path.isdir(os.path.join(ROOT, base[:-4] + '_files')): err(f'{mid}: 缺瓦片目录 {base[:-4]}_files/')
    alt = m.get('alt') or {}
    if alt and not os.path.exists(os.path.join(ROOT, alt.get('base', ''))): warn(f"{mid}: alt 底图 {alt.get('base')} 还没渲染（查看器里的开关会提示并自动关掉）")
    ov = m.get('overlay') or {}
    if ov.get('type') == 'dzi' and not os.path.exists(os.path.join(ROOT, ov.get('src', ''))): err(f"{mid}: 缺叠加层 {ov.get('src')}")
    if ov.get('from') and ov['from'] not in maps: err(f"{mid}.overlay.from → {ov['from']} 不存在")
    if m.get('kind') != 'points': continue
    if not m.get('data'): err(f'{mid}: points 地图没有 data'); continue
    p = os.path.join(ROOT, m['data'])
    if not os.path.exists(p): err(f"{mid}: 缺数据 {m['data']}"); continue
    d = data[mid] = json.load(open(p))
    ids = {k['id']: k for k in d.get('markers', [])}
    meta = m.get('markers', {})
    for i, k in ids.items():
        if i not in meta: warn(f'{mid}: 数据里的 {i} 在 maps.json 里没有名称（查看器不会显示）')
        if not (0 <= k['nx'] <= 1 and 0 <= k['ny'] <= 1): err(f"{mid}.{i}: 坐标超出底图 ({k['nx']}, {k['ny']})")
    for i, v in meta.items():
        if i not in ids: err(f'{mid}.{i}: maps.json 有名称，但渲染数据里没有坐标（重跑该层脚本，或加 --data-only 只导出点位）')
        for f in ('name', 'tag', 'src'):
            if not v.get(f): err(f'{mid}.{i}: 缺 {f}')
        if v.get('tag') not in ('set', 'inf'): err(f"{mid}.{i}: tag 应为 set 或 inf，现在是 {v.get('tag')}")
        if not isinstance(v.get('alias'), list) or not v['alias']: err(f'{mid}.{i}: alias 应为非空列表')
    if m.get('focus') and m['focus'] not in meta: err(f"{mid}.focus → {m['focus']} 不是本图的标记")
# 跨层通道
for mid, m in maps.items():
    for i, v in (m.get('markers') or {}).items():
        l = v.get('link')
        if not l: continue
        if l.get('map') not in maps: err(f"{mid}.{i}.link → 地图 {l.get('map')} 不存在"); continue
        if l.get('marker') and l['marker'] not in (maps[l['map']].get('markers') or {}): err(f"{mid}.{i}.link → {l['map']}.{l['marker']} 不存在"); continue
        a = next((k for k in data.get(mid, {}).get('markers', []) if k['id'] == i), None)
        b = next((k for k in data.get(l['map'], {}).get('markers', []) if k['id'] == l.get('marker')), None)
        if a and b and maps[mid].get('group') and maps[mid].get('group') == maps[l['map']].get('group'):
            dx, dy = a['nx'] - b['nx'], (a['ny'] - b['ny']) * 1875 / 3000
            if (dx * dx + dy * dy) ** .5 > .02: err(f"{mid}.{i} 与 {l['map']}.{l['marker']} 在平面上没对齐（偏差 {(dx * dx + dy * dy) ** .5:.3f} 图宽）")
ext = {tuple(d.get('extent_m', [])) for d in data.values() if d.get('extent_m')}
if len(ext) > 1: err(f'各层 extent_m 不一致：{ext}')

for w in warns: print('警告', w)
for e in errors: print('错误', e)
n = sum(len(d.get('markers', [])) for d in data.values())
print(f"检查完：{len(maps)} 张地图、{n} 个渲染标记；{len(errors)} 个错误，{len(warns)} 个警告")
sys.exit(1 if errors else 0)
