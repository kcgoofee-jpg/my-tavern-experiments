#!/usr/bin/env python3
"""地图注册表与渲染数据的一致性检查（不依赖 Blender / Pillow）。

用法：python3 tools/check_maps.py            # 有错误时退出码 1
      python3 tools/check_maps.py --committed [REV]   # 校验提交内容（默认 HEAD）而不是工作区：文件没 git add 就算缺（C-1，ship.sh 用）
检查：
  - maps.json 结构：start / parent / group / overlay.from / link 指向的地图都存在
  - 已上线的地图：底图 DZI 与瓦片目录存在；points 地图的数据文件存在
  - 标记：渲染数据里的每个 id 在 maps.json 里有名称；maps.json 里的每个标记在数据里有坐标；nx/ny 在 0…1
  - 标记字段：name、tag（set / inf）、src 必填；alias 为非空列表
  - 跨层对齐：link 两端的地点在平面上应当重合（同一套平面坐标），偏差超过 2% 图宽报错
  - 三层数据的 extent_m 一致
  - 岛轮廓 islands[].outline（可选）：至少 8 个点，坐标在 0…1
  - kind=estate（三维庄园剖面，iframe 嵌入）：不要底图 / 点位数据；src 页面存在、有 parent、alias 为非空列表；rooms / areas（可选）是字符串列表且不重叠
  - points 地图的 districts（可选）：大区叫法，字符串列表
  - 事件大类 / 类型（events.mjs）在 en.json 的 names 里都有英文
  - 上层 routes（航线折线、巡逻环）：kind 已知、至少 2 个点、坐标在 0…1
"""
import json, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'map')
errors, warns = [], []
# --committed：路径存在性与 JSON 读取都走 git 的提交树（新切的瓦片 / 数据没提交也能过门控 = C-1）
import subprocess as _sp
REV = None
if '--committed' in sys.argv:
    i = sys.argv.index('--committed'); REV = sys.argv[i + 1] if len(sys.argv) > i + 1 and not sys.argv[i + 1].startswith('-') else 'HEAD'
    _top = os.path.join(ROOT, '..')
    _files = set(_sp.run(['git', 'ls-tree', '-r', '--name-only', REV, '--', 'map'], cwd=_top, capture_output=True, text=True, check=True).stdout.split('\n')) - {''}
    _dirs = {f.rsplit('/', n)[0] for f in _files for n in range(1, f.count('/') + 1)}
def _rel(p): return os.path.relpath(os.path.normpath(p), os.path.join(ROOT, '..')).replace(os.sep, '/')
def exists(p): return os.path.exists(p) if REV is None else (_rel(p) in _files or _rel(p) in _dirs)
def isdir(p): return os.path.isdir(p) if REV is None else _rel(p) in _dirs
def load(p):
    if REV is None: return json.load(open(p, encoding='utf-8'))
    r = _sp.run(['git', 'show', f'{REV}:{_rel(p)}'], cwd=os.path.join(ROOT, '..'), capture_output=True)
    if r.returncode: raise FileNotFoundError(f'{_rel(p)} 不在 {REV} 里')
    return json.loads(r.stdout.decode('utf-8'))
def err(m): errors.append(m)
def warn(m): warns.append(m)

reg = load(os.path.join(ROOT, 'data', 'maps.json'))
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
        if not src or not exists(os.path.join(ROOT, src)): err(f'{mid}: 缺庄园页面 src {src!r}')
        if not m.get('parent'): err(f'{mid}: estate 地图要有 parent（面包屑回到哪一层）')
        if m.get('viewer3d') and not exists(os.path.join(ROOT, 'props', m['viewer3d'], 'manifest.json')): err(f"{mid}: viewer3d 清单 props/{m['viewer3d']}/manifest.json 不存在")
        if not m.get('test') and (not isinstance(m.get('alias'), list) or not m['alias']): err(f'{mid}: alias 应为非空列表（当前地点匹配房间用）')
        if m.get('group') and not (m.get('layer') or {}).get('name'): err(f'{mid}: 在 group 里要有 layer.name（层切换器显示）')
        for f in ('rooms', 'rooms_en', 'areas', 'areas_en'):   # 当前地点 → 庄园房间 / 室外区域（map/here.mjs）
            if f in m and not (isinstance(m[f], list) and all(isinstance(w, str) and w for w in m[f])): err(f'{mid}.{f} 应为非空字符串列表')
        both = set(m.get('rooms', [])) & set(m.get('areas', []))
        if both: err(f'{mid}: {sorted(both)} 同时在 rooms 与 areas 里（当前地点会落到哪里不确定）')
        continue
    base = m.get('base')
    if not base: err(f'{mid} 没有 base'); continue
    if not exists(os.path.join(ROOT, base)): err(f'{mid}: 缺底图 {base}')
    if base.endswith('.dzi') and not isdir(os.path.join(ROOT, base[:-4] + '_files')): err(f'{mid}: 缺瓦片目录 {base[:-4]}_files/')
    alt = m.get('alt') or {}
    if alt and not exists(os.path.join(ROOT, alt.get('base', ''))): warn(f"{mid}: alt 底图 {alt.get('base')} 还没渲染（查看器里的开关会提示并自动关掉）")
    ov = m.get('overlay') or {}
    if ov.get('type') == 'dzi' and not exists(os.path.join(ROOT, ov.get('src', ''))): err(f"{mid}: 缺叠加层 {ov.get('src')}")
    if ov.get('from') and ov['from'] not in maps: err(f"{mid}.overlay.from → {ov['from']} 不存在")
    if m.get('kind') != 'points': continue
    if 'districts' in m and not (isinstance(m['districts'], list) and all(isinstance(w, str) and w for w in m['districts'])): err(f'{mid}.districts 应为非空字符串列表（当前地点只写到大区时落到这一层）')
    if not m.get('data'): err(f'{mid}: points 地图没有 data'); continue
    p = os.path.join(ROOT, m['data'])
    if not exists(p): err(f"{mid}: 缺数据 {m['data']}"); continue
    d = data[mid] = load(p)
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
    # 航线叠加层（查看器按 routes 画：lane = 航线、patrol / patrol_city = 骑士团巡逻环）
    for j, rt in enumerate(d.get('routes', []) or []):
        if not isinstance(rt, dict): err(f'{mid}.routes[{j}] 应为对象'); continue
        if rt.get('kind') not in ('lane', 'patrol', 'patrol_city'): warn(f"{mid}.routes[{j}].kind={rt.get('kind')!r} 查看器不认识（按航线画）")
        pts = rt.get('pts')
        if not isinstance(pts, list) or len(pts) < 2: err(f'{mid}.routes[{j}]: pts 至少 2 个点'); continue
        bad = [q for q in pts if not (isinstance(q, (list, tuple)) and len(q) == 2 and all(isinstance(v, (int, float)) and 0 <= v <= 1 for v in q))]
        if bad: err(f'{mid}.routes[{j}]: {len(bad)} 个点不是 0…1 内的 [x, y]（如 {bad[0]}）')
    # 岛轮廓（查看器的结界 / 上层投影叠加层按它画平滑闭合曲线；没有时画椭圆）：归一化 [x, y] 列表，至少 8 个点，坐标在 0…1
    for isl in d.get('islands', []):
        if 'outline' not in isl: continue
        o, iid = isl['outline'], isl.get('id', '?')
        if not isinstance(o, list) or len(o) < 8: err(f'{mid}.islands.{iid}: outline 至少要 8 个点（现在 {len(o) if isinstance(o, list) else type(o).__name__}）'); continue
        bad = [q for q in o if not (isinstance(q, (list, tuple)) and len(q) == 2 and all(isinstance(v, (int, float)) and 0 <= v <= 1 for v in q))]
        if bad: err(f'{mid}.islands.{iid}: outline 有 {len(bad)} 个点不是 0…1 内的 [x, y]（如 {bad[0]}）')
# view：尺度与默认缩放
wm = load(os.path.join(ROOT, 'data', 'world_markers.json'))
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
for gid, g in reg.get('groups', {}).items():   # 同组各层共用一套平面坐标（切层保持 x / y）
    ext = {tuple(data[k].get('extent_m', [])) for k in g['layers'] if data.get(k, {}).get('extent_m')}
    if len(ext) > 1: err(f'group {gid} 各层 extent_m 不一致：{ext}')
    if g.get('place') and g['place'] not in place_ids | {f.get('id') for f in wm.get('fiefs', [])}: err(f"group {gid}.place → {g['place']} 不是世界图的地点 / 封地 id")
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
    if not exists(fp): err(f'缺界面语言文件 map/i18n/{lg}.json'); continue
    i18n[lg] = load(fp)
if len(i18n) == 2:
    for k in (set(i18n['zh']) ^ set(i18n['en'])) - {'names'}: err(f'i18n：键 {k} 只在一种语言里有')
    # 事件体系（map/tavern/events.mjs 的 GROUPS / CATS）：每个大类、每种类型在 en.json 的 names 里要有英文（英文界面的图例、事件卡用）
    import shutil, subprocess
    def run_node():
        js = "import('./map/tavern/events.mjs').then(m=>console.log(JSON.stringify([...Object.keys(m.GROUPS),...Object.keys(m.CATS)])))"
        return subprocess.run(['node', '-e', js], capture_output=True, text=True, cwd=os.path.join(ROOT, '..'), timeout=30)
    names = None
    if shutil.which('node') is None:
        warn('没有 node，跳过事件类型英文名检查')
    else:
        # node 在、模块却加载不出来（顶层报错、循环依赖、语法错）→ 这是错误，不是警告：
        # 以前这里一律降级成警告，events.mjs 加载失败也能过门控，用户侧事件系统整个挂掉。
        try:
            r = run_node()
            if r.returncode != 0: err(f'events.mjs 加载失败（node 退出码 {r.returncode}）：{(r.stderr or "").strip().splitlines()[-1:] or [""]}')
            else: names = set(json.loads(r.stdout))
        except (ValueError, subprocess.TimeoutExpired) as e:
            err(f'events.mjs 加载失败：{type(e).__name__}: {e}')
    if names is not None:
        for k in sorted(names - set(i18n['en'].get('names', {}))): err(f'i18n：事件大类 / 类型「{k}」在 en.json 的 names 里没有英文')
# 地图补充地点 ↔ 世界书附加条目（map/data/addon_places.json → tools/build_worldbook_addon.py「地图补充-*」）：
# 用户决定 / 仓库自设的标记都要有一条；条目引用的标记要存在；庄园条目的叫法要能落到 eden_estate（加、改、删地点时三处同步）
ap_path = os.path.join(ROOT, 'data', 'addon_places.json')
if not exists(ap_path): err('缺 map/data/addon_places.json（地图补充地点，世界书附加条目从它生成）')
else:
    ap = load(ap_path).get('places', [])
    refs = {r for p in ap for r in p.get('refs', [])}
    est = maps.get('eden_estate', {}); est_words = set(est.get('rooms', [])) | set(est.get('areas', []))
    for p in ap:
        for f in ('id', 'name', 'src', 'text'):
            if not p.get(f): err(f"addon_places.{p.get('id', '?')}: 缺 {f}")
        if not isinstance(p.get('alias'), list) or not p['alias']: err(f"addon_places.{p.get('id')}: alias 应为非空列表（世界书关键词）")
        if not str(p.get('src', '')).startswith(('user', 'repo')): err(f"addon_places.{p.get('id')}: src 应以 user / repo 开头")
        for r in p.get('refs', []):
            mid, _, k = r.partition('.')
            if k not in (maps.get(mid, {}).get('markers') or {}): err(f'addon_places.{p["id"]}: refs {r} 不存在（地点删了或改了 id？同步删改这一条）')
        if p.get('site') and not p.get('refs'): err(f'addon_places.{p["id"]}: 开局地点地图的条目要有 refs')
        if p.get('estate') and not est_words & set(p.get('alias', [])): err(f'addon_places.{p["id"]}: 庄园条目的 alias 没有一个在 eden_estate 的 rooms / areas 里')
    for mid, m in maps.items():   # 开局地点的简易地图（site:true）：每张至少一条附加条目引用它的地标
        if m.get('site') and not any(r.startswith(mid + '.') for r in refs): err(f'{mid}：开局地点地图在 addon_places.json 里没有条目（世界书附加条目缺它）')
    def added(v):
        return v.get('canon') is False or v.get('sub_src') or v.get('layer_src') or any(w in v.get('src', '') for w in ('仓库自设', '用户'))
    for mid, m in maps.items():
        for k, v in (m.get('markers') or {}).items():
            if added(v) and f'{mid}.{k}' not in refs: err(f'{mid}.{k}：用户决定 / 仓库自设的地点，addon_places.json 里没有对应条目（世界书附加条目缺它）')
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
print(f"检查完{'（提交 ' + REV + '）' if REV else ''}：{len(maps)} 张地图、{n} 个渲染标记；{len(errors)} 个错误，{len(warns)} 个警告")
sys.exit(1 if errors else 0)
