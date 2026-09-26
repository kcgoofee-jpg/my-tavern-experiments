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
  - 岛轮廓 islands[].outline（可选）：至少 8 个点，坐标在 0…1
  - kind=estate（三维庄园剖面，iframe 嵌入）：不要底图 / 点位数据；src 页面存在、有 parent、alias 为非空列表
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
    if m.get('kind') not in ('world', 'points', 'estate'): err(f"{mid}.kind 应为 world / points / estate，现在是 {m.get('kind')}")
    if m.get('kind') == 'estate':
        src = m.get('src', '')
        if not src or not os.path.exists(os.path.join(ROOT, src)): err(f'{mid}: 缺庄园页面 src {src!r}')
        if not m.get('parent'): err(f'{mid}: estate 地图要有 parent（面包屑回到哪一层）')
        if not isinstance(m.get('alias'), list) or not m['alias']: err(f'{mid}: alias 应为非空列表（当前地点匹配房间用）')
        if m.get('group') and not (m.get('layer') or {}).get('name'): err(f'{mid}: 在 group 里要有 layer.name（层切换器显示）')
        continue
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
    # 岛轮廓（查看器的结界 / 上层投影叠加层按它画平滑闭合曲线；没有时画椭圆）：归一化 [x, y] 列表，至少 8 个点，坐标在 0…1
    for isl in d.get('islands', []):
        if 'outline' not in isl: continue
        o, iid = isl['outline'], isl.get('id', '?')
        if not isinstance(o, list) or len(o) < 8: err(f'{mid}.islands.{iid}: outline 至少要 8 个点（现在 {len(o) if isinstance(o, list) else type(o).__name__}）'); continue
        bad = [q for q in o if not (isinstance(q, (list, tuple)) and len(q) == 2 and all(isinstance(v, (int, float)) and 0 <= v <= 1 for v in q))]
        if bad: err(f'{mid}.islands.{iid}: outline 有 {len(bad)} 个点不是 0…1 内的 [x, y]（如 {bad[0]}）')
# view：尺度与默认缩放
wm = json.load(open(os.path.join(ROOT, 'data', 'world_markers.json')))
place_ids = {p.get('id') for p in wm.get('places', [])}
for mid, m in maps.items():
    v = m.get('view')
    if v is None:
        if m.get('status') != 'planned' and m.get('kind') != 'estate': warn(f'{mid}: 没有 view（初始缩放沿用查看器的默认值）')
        continue
    ext = v.get('extent_m')
    if not (isinstance(ext, list) and len(ext) == 2 and all(isinstance(x, (int, float)) and x > 0 for x in ext)): err(f'{mid}.view.extent_m 应为 [宽, 高]（米）'); continue
    wv, mn = v.get('width_m'), v.get('min_width_m')
    if not isinstance(wv, (int, float)) or not 0 < wv <= ext[0]: err(f'{mid}.view.width_m 应在 0 与 extent_m 宽度之间')
    if not isinstance(mn, (int, float)) or not 0 < mn <= (wv or 0): err(f'{mid}.view.min_width_m 应大于 0 且不超过 width_m')
    f = v.get('focus')
    if f and m.get('kind') == 'points' and f not in (m.get('markers') or {}): err(f'{mid}.view.focus → {f} 不是本图的标记')
    if f and m.get('kind') == 'world' and f not in place_ids: err(f'{mid}.view.focus → {f} 不是世界图的地点 id')
    de = data.get(mid, {}).get('extent_m')
    if de and [round(x) for x in de] != [round(x) for x in ext]: err(f'{mid}.view.extent_m {ext} 与渲染数据的 extent_m {de} 不一致')
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
# 英文界面（map/i18n）：地图标题、层名、地标都要有英文名（没有时查看器显示中文原文）
for mid, m in maps.items():
    if m.get('status') == 'planned': continue
    if not m.get('title_en'): warn(f'{mid}: 没有 title_en（英文界面显示中文标题）')
    if m.get('layer') and not m['layer'].get('name_en'): warn(f'{mid}.layer: 没有 name_en')
    for i, v in (m.get('markers') or {}).items():
        if not v.get('name_en'): warn(f'{mid}.{i}: 没有 name_en（英文界面显示中文名）')
        if v.get('sub') and not v.get('sub_en'): warn(f'{mid}.{i}: 有 sub 没有 sub_en')
i18n = {}
for lg in ('zh', 'en'):
    fp = os.path.join(ROOT, 'i18n', f'{lg}.json')
    if not os.path.exists(fp): err(f'缺界面语言文件 map/i18n/{lg}.json'); continue
    i18n[lg] = json.load(open(fp, encoding='utf-8'))
if len(i18n) == 2:
    for k in (set(i18n['zh']) ^ set(i18n['en'])) - {'names'}: err(f'i18n：键 {k} 只在一种语言里有')
# 外部事件数据源（map/events.js 定时拉取）：feeds: [{label, url, every}]
feeds = reg.get('feeds', [])
if not isinstance(feeds, list): err('feeds 应为列表')
else:
    for j, f in enumerate(feeds):
        if not isinstance(f, dict) or not str(f.get('url', '')).startswith(('https://', 'http://', './', 'data/')): err(f'feeds[{j}].url 应为 https:// 地址或相对 map/ 的路径'); continue
        if not f.get('label'): warn(f'feeds[{j}] 没有 label（地点卡里的「来源」会空着）')
        if 'every' in f and not (isinstance(f['every'], (int, float)) and f['every'] >= 60): err(f'feeds[{j}].every 应为 ≥ 60 的秒数')

for w in warns: print('警告', w)
for e in errors: print('错误', e)
n = sum(len(d.get('markers', [])) for d in data.values())
print(f"检查完：{len(maps)} 张地图、{n} 个渲染标记；{len(errors)} 个错误，{len(warns)} 个警告")
sys.exit(1 if errors else 0)
