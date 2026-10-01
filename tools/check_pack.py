#!/usr/bin/env python3
"""校验设定包（通用化，docs/generalize/README.md）：结构（JSON Schema）+ 跨文件一致性。

用法：python3 tools/check_pack.py [<id> ...]      # 不给 id = map/packs/ 下全部
检查：
  manifest.json ↔ map/data/schema/pack.schema.json；id = 目录名；data 里的文件都在
  maps.json ↔ maps.schema.json；start / groups.layers / link / link3d 指向的地图存在；points 数据 ↔ points.schema.json，
  每个标记都有坐标、坐标里没有多余 id；底图 .dzi 与瓦片目录在（make_dzi --verify 同一套）
  events.json ↔ events.schema.json；types.g 是已声明的大类；alias 指向已有类型；layers.map 是包里的地图
  worldbook.json：entries[{name, content}]
  overlay.v2.json（可选，包目录里）：schema-2 节点叠加层（清单 data.overlay 声明），交给 tools/check_overlay.mjs（K-R67）
eden 包的数据仍由 tools/check_maps.py 校验（这里只查清单）。退出码：有错误 1。
"""
import glob, json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jsonschema_lite import validate
from make_dzi import verify as dzi_verify

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP = os.path.join(ROOT, 'map')
SCH = {n: json.load(open(os.path.join(MAP, 'data', 'schema', n + '.schema.json'), encoding='utf-8')) for n in ('pack', 'maps', 'points', 'events', 'depth')}


LOCKED = [re.compile(x) for x in (r'^fc\.nav\.consent', r'^fc\.reason\.', r'^fc\.[A-Za-z]+\.cost$', r'^lic\.disclaimer$', r'^s\.lic_disc_v$')]   # docs/ui-refactor.md §2.7 (core/locked-strings.mjs): texts a pack may not override


def locked_strings(pid, m):
    flat = dict(m.get('strings') or {})
    for v in ((m.get('ui') or {}).get('strings') or {}).values():
        if isinstance(v, dict): flat.update(v)
    flat.update({k: 1 for k in ((m.get('ui') or {}).get('strings') or {}) if not isinstance((m.get('ui') or {}).get('strings')[k], dict)})
    return [f'{pid}: strings 里的 {k} 是内核固定文字（同意说明、健康原因、费用行、免责声明），包不能改' for k in sorted(flat) if any(r.match(k.replace('@en', '')) for r in LOCKED)]


def check(pid):
    errs = []
    d = os.path.join(MAP, 'packs', pid)
    mp = os.path.join(d, 'manifest.json')
    if not os.path.exists(mp): return [f'{pid}: 没有 manifest.json']
    m = json.load(open(mp, encoding='utf-8'))
    if m.get('schema') == 2: return locked_strings(pid, m) + check_v2(pid, d, m)
    errs += locked_strings(pid, m)
    errs += [f'{pid}/manifest.json {e}' for e in validate(m, SCH['pack'])]
    if m.get('id') != pid: errs.append(f'{pid}: 清单 id {m.get("id")!r} 与目录名不一致')
    base = MAP if pid == 'eden' else d   # eden 的路径相对 map/
    for k, v in (m.get('data') or {}).items():
        for f in (v.values() if isinstance(v, dict) else [v]):   # data.names = { 语言码: 路径 }（S4-4）
            if f != 'builtin' and not os.path.exists(os.path.join(base, f)): errs.append(f'{pid}: data.{k} 指向的 {f} 不存在')
    for p in (m.get('preload') or []):   # 启动预取清单里的文件也要真实存在
        if not os.path.exists(os.path.join(base, p)): errs.append(f'{pid}: preload 指向的 {p} 不存在')
    errs += check_overlay(pid, d, m)
    if pid == 'eden': return errs   # 其余由 check_maps.py 负责
    if (m.get('data') or {}).get('events') == 'builtin': errs.append(f'{pid}: events: builtin 只给 eden 用；写自己的 events.json')
    def load(rel):
        try: return json.load(open(os.path.join(d, rel), encoding='utf-8'))
        except Exception as e: errs.append(f'{pid}: 读不了 {rel}：{e}'); return None
    reg = load(m['data']['maps'])
    if reg:
        errs += [f'{pid}/maps.json {e}' for e in validate(reg, SCH['maps'])]
        maps = reg.get('maps', {})
        for mid_, mm_ in maps.items():                   # 纵深系统数据（可选，每层一份）
            if isinstance(mm_, dict) and mm_.get('depth'):
                dd_ = load(mm_['depth'])
                if dd_ is not None:
                    errs += [f'{pid}/{mm_["depth"]} {e}' for e in validate(dd_, SCH['depth'])]
                    errs += [f'{pid}: {mm_["depth"]} 的岛 {i.get("id")} 不是 {mid_} 的标记' for i in dd_.get('islands', []) if i.get('id') not in (mm_.get('markers') or {})]
        if reg.get('start') not in maps: errs.append(f'{pid}: start {reg.get("start")!r} 不是包里的地图')
        for gid, g in reg.get('groups', {}).items():
            for l in g.get('layers', []):
                if l not in maps: errs.append(f'{pid}: groups.{gid}.layers 里的 {l} 不存在')
        for mid, mm in maps.items():
            for mk, v in (mm.get('markers') or {}).items():
                for lk in ('link', 'link3d'):
                    t = v.get(lk)
                    if t and t['map'] not in maps: errs.append(f'{pid}: {mid}.{mk}.{lk} 指向不存在的地图 {t["map"]}')
                    if t and t.get('marker') and t['marker'] not in (maps.get(t['map'], {}).get('markers') or {}): errs.append(f'{pid}: {mid}.{mk}.{lk} 指向不存在的标记 {t["marker"]}')
            if mm.get('kind') == 'points' and mm.get('status') != 'planned':
                pts = load(mm['data']) if mm.get('data') else None
                if not pts: errs.append(f'{pid}: {mid} 缺 data'); continue
                errs += [f'{pid}/{mm["data"]} {e}' for e in validate(pts, SCH['points'])]
                ids = {p['id'] for p in pts.get('markers', [])}
                for mk in (mm.get('markers') or {}):
                    if mk not in ids: errs.append(f'{pid}: {mid}.{mk} 没有坐标（{mm["data"]}）')
                for x in ids - set(mm.get('markers') or {}): errs.append(f'{pid}: {mm["data"]} 的 {x} 不在 maps.json 里')
            b = mm.get('base')
            if b and not re.match(r'^[a-z]+:', b):
                dzi = os.path.join(d, b)
                if not os.path.exists(dzi): errs.append(f'{pid}: {mid} 底图 {b} 不存在'); continue
                ext = (mm.get('view') or {}).get('extent_m')
                errs += [f'{pid}: {b} {e}' for e in dzi_verify(dzi, dzi[:-4] + '_files', ext)]
    ev = load(m['data']['events']) if m['data'].get('events') else None
    if ev:
        errs += [f'{pid}/events.json {e}' for e in validate(ev, SCH['events'])]
        gs = set(ev.get('groups', {})) | {'其他'}
        for k, v in ev.get('types', {}).items():
            if v.get('g') not in gs: errs.append(f'{pid}: 事件类型 {k} 的大类 {v.get("g")!r} 没声明')
        for a, t in ev.get('alias', {}).items():
            if t not in ev.get('types', {}): errs.append(f'{pid}: 事件别名 {a} → {t} 不是已有类型')
        for l in ev.get('layers', []):
            if reg and l['map'] not in reg.get('maps', {}): errs.append(f'{pid}: 事件层 {l["name"]} 的地图 {l["map"]} 不存在')
    wb = load(m['data']['worldbook']) if m['data'].get('worldbook') else None
    if wb is not None:
        es = wb.get('entries') if isinstance(wb, dict) else None
        if not isinstance(es, list) or not all(isinstance(e, dict) and e.get('name') and e.get('content') for e in es): errs.append(f'{pid}: worldbook.json 要是 {{entries: [{{name, content}}]}}')
    return errs


BLOCKS2 = ('nodes', 'views', 'vars', 'entities', 'items', 'events', 'layers', 'ui', 'llm', 'media', 'transit')


def _lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4 for v in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]


def _ratio(a, b):
    x, y = _lum(a), _lum(b)
    return (max(x, y) + .05) / (min(x, y) + .05)


def _over(hexc, alpha, back):   # composite hexc at alpha over a solid back colour
    f = lambda i: round(int(hexc[i:i + 2], 16) * alpha + int(back[i:i + 2], 16) * (1 - alpha))
    return '#%02x%02x%02x' % (f(1), f(3), f(5))


HEX6 = re.compile(r'^#[0-9a-fA-F]{6}$')
SURFACE = {'dark': ('#151b20', '#101418'), 'light': ('#f8f5ee', '#efeae0')}   # tokens.css --surface, --bg per theme


def check_theme(pid, ov):
    """K-R70 (S7-2): contrast of the pack-wide chrome accent and of every per-view accent, in both themes (docs/ui-refactor.md 2.7): --on-accent on accent >= 4.5; accent on glass-1 (80 % surface)
    composited over black and over white >= 3; --map-label-ink on --map-label-bg >= 4.5. A value that is not a six-digit hex (a var() or rgba) is skipped."""
    th = ((ov.get('ui') or {}).get('theme')) or {}
    errs = []
    def pair(where, accent, on, theme, glass=True):   # glass: the chrome accent sits on glass; a per-view (map-space) accent never does, so only the chrome accent is measured against it
        if accent and HEX6.match(accent):
            surf = SURFACE[theme][0]
            for back in (('#000000', '#ffffff') if glass else ()):
                r = _ratio(accent, _over(surf, .8, back))
                if r < 3: errs.append(f'{pid}: {where} 强调色 {accent} 在 {theme} 毛玻璃（叠在 {back} 上）对比 {r:.2f} < 3')
            if on and HEX6.match(on):
                r = _ratio(accent, on)
                if r < 4.5: errs.append(f'{pid}: {where} 强调色 {accent} 上的 on-accent {on} 对比 {r:.2f} < 4.5')
    ch = th.get('chrome') or {}
    if ch.get('accent'):
        from_on = ch.get('onAccent') or ('#101418' if _ratio(ch['accent'], '#101418') >= _ratio(ch['accent'], '#ffffff') else '#ffffff')
        for theme in ('dark', 'light'): pair('ui.theme.chrome', ch['accent'], from_on, theme)
    for vid, v in (th.get('views') or {}).items():
        for part, theme in (('tokens', 'dark'), ('light', 'light')):
            t = (v or {}).get(part) or {}
            pair(f'ui.theme.views.{vid}.{part}', t.get('--map-accent') or t.get('--accent'), t.get('--on-accent'), theme, glass=False)
            ink, bg = t.get('--map-label-ink'), t.get('--map-label-bg')
            if ink and bg and HEX6.match(ink) and HEX6.match(bg) and _ratio(ink, bg) < 4.5: errs.append(f'{pid}: ui.theme.views.{vid}.{part} 标签字 {ink} 在 {bg} 上对比 < 4.5')
    return errs


def check_overlay(pid, d, m):
    """schema 1 包旁边的 v2 叠加层 overlay.v2.json（docs/kernel-schema.md K-R67）：交给 tools/check_overlay.mjs（节点 id / 名字 / 父节点 / alias 含名字 / at / 树无环）。没有这个文件 = 无事。"""
    if not os.path.exists(os.path.join(d, 'overlay.v2.json')): return []
    if not (m.get('data') or {}).get('overlay'): return [f'{pid}: 有 overlay.v2.json，清单 data.overlay 没声明（查看器只取声明了的）']
    try: theme_errs = check_theme(pid, json.load(open(os.path.join(d, 'overlay.v2.json'), encoding='utf-8')))
    except Exception: theme_errs = []
    try:
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'check_overlay.mjs'), pid], capture_output=True, text=True, timeout=60)
    except Exception as e:
        return [f'{pid}: overlay.v2.json 没能检查：{e}']
    return theme_errs + [x for x in r.stdout.splitlines() if x.strip()] + ([f'{pid}: check_overlay 异常退出：{r.stderr.strip()[:200]}'] if r.returncode not in (0, 1) else [])


def check_v2(pid, d, m):
    """schema 2（docs/kernel-schema.md）：清单与每个块过 map/data/schema/v2（块内联或是包内文件）；再查树与引用（K-R06）：id 不重复、parent 存在、不成环、enter 是子节点、显式 alias 含 name、节点 / 视图 / 特效 / 大类引用都存在、时段从早到晚。"""
    S = lambda n: json.load(open(os.path.join(MAP, 'data', 'schema', 'v2', n + '.schema.json'), encoding='utf-8'))
    b, errs = {}, [f'{pid}/manifest.json {e}' for e in validate(m, S('manifest'))] + ([] if m.get('id') == pid else [f'{pid}: 清单 id {m.get("id")!r} 与目录名不一致'])
    for k in BLOCKS2:
        v = m.get(k)
        if isinstance(v, str):
            if not os.path.exists(os.path.join(d, v)): errs.append(f'{pid}: {k} 指向的 {v} 不存在'); continue
            v = json.load(open(os.path.join(d, v), encoding='utf-8'))
        if v is not None: errs += [f'{pid}/{k} {e}' for e in validate(v, S(k))]; b[k] = v
    nodes, views, ev, ui, ent, items = [n for n in (b.get('nodes') or []) if isinstance(n, dict)], b.get('views') or {}, b.get('events') or {}, b.get('ui') or {}, b.get('entities') or {}, b.get('items') or {}
    ids = [n.get('id') for n in nodes]; par = {n.get('id'): n.get('parent') for n in nodes}
    errs += [f'{pid}: 节点 id 重复 {i}' for i in sorted({i for i in ids if ids.count(i) > 1})]
    vrefs = [o.get('from') for v in views.values() if isinstance(v, dict) for o in (v.get('overlays') or [])]
    for n in nodes:
        i, seen = n.get('id'), set()
        while i in par and i not in seen: seen.add(i); i = par[i]
        if i in seen: errs.append(f'{pid}: 节点 {n.get("id")} 的祖先成环')
        refs = [n.get('parent'), n.get('enter')] + [x.get('to') for x in (n.get('links') or []) if isinstance(x, dict)]
        errs += [f'{pid}: 节点 {n.get("id")} 引用了不存在的节点 {r}' for r in refs if r and r not in par]
        if n.get('enter') in par and par[n['enter']] != n.get('id'): errs.append(f'{pid}: 节点 {n.get("id")} 的 enter 不是它的子节点')
        if isinstance(n.get('alias'), list) and n.get('name') not in n['alias'] + list(n.get('hints') or []): errs.append(f'{pid}: 节点 {n.get("id")} 的 alias 没列 name（不想让名字强匹配就把它放进 hints）')
        vrefs += ([n['view']] if isinstance(n.get('view'), str) else list(n.get('view') or [])) + [(n.get('at') or {}).get('view')]
    errs += [f'{pid}: 引用了不存在的视图 {v}' for v in vrefs if v and v not in views]
    refs = [r.get('node') for r in (items.get('stash') or [])] + [r.get('node') for g in (ent.get('groups') or []) for r in (g.get('fallback') or [])]
    refs += [ui.get('start')] + [x for k, vs in (ui.get('levels') or {}).items() for x in [k, *vs]]
    refs += [x for v in views.values() if isinstance(v, dict) for x in [(v.get('home') or {}).get('focus')] + [i.get('node') for i in (v.get('insets') or [])]]
    tr = b.get('transit') or {}   # K-R107: stations / districts name nodes and views of this pack
    refs += [x.get('node') for x in (tr.get('stations') or []) + (tr.get('districts') or []) if isinstance(x, dict)]
    errs += [f'{pid}: transit 引用了不存在的视图 {x.get("view")}' for x in (tr.get('stations') or []) + (tr.get('districts') or []) if isinstance(x, dict) and x.get('view') and views and x['view'] not in views]
    if nodes: errs += [f'{pid}: 引用了不存在的节点 {r}' for r in refs if r and r not in par]
    gs, fx = {g.get('id') for g in (ev.get('groups') or [])} | {'other'}, set(ev.get('fx_presets') or {}) | {'none', 'glitch', 'flash', 'shake', 'tint', 'pulse'}
    errs += [f'{pid}: 事件类型 {k} 的大类 {t.get("group")!r} 没声明' for k, t in (ev.get('types') or {}).items() if t.get('group') not in gs]
    errs += [f'{pid}: 事件类型 {k} 的特效 {t.get("fx")!r} 既不是预设也不是内核积木' for k, t in (ev.get('types') or {}).items() if t.get('fx') and t['fx'] not in fx]
    errs += check_media(pid, d, b.get('media') or {}, nodes, views)
    st = [str(p.get('start')) for p in ((b.get('vars') or {}).get('periods') or []) if isinstance(p, dict)]
    if st != sorted(set(st)): errs.append(f'{pid}: vars.periods 的 start 要从早到晚、不重复')
    return errs


def check_media(pid, d, media, nodes, views):
    """K-R101 pack pictures: at most 200 items; a path source exists under the pack folder; data URLs stay within 3 MB decoded; node.media and an image view's media name items of the block; an image view has src or media."""
    errs = []
    if not isinstance(media, dict): return errs
    if len(media) > 200: errs.append(f'{pid}: media 最多 200 项，现在 {len(media)}')
    for k, it in media.items():
        src = it.get('src') if isinstance(it, dict) else None
        if not isinstance(src, str): continue
        if src.startswith('data:'):
            n = len(src) - src.find(',') - 1
            if n * 3 // 4 > 3 << 20: errs.append(f'{pid}: media.{k} 的内嵌图超过 3 MB')
        elif not src.startswith('https://') and not os.path.exists(os.path.join(d, src)): errs.append(f'{pid}: media.{k} 的图 {src} 不在包目录里')
    for n in nodes:
        errs += [f'{pid}: 节点 {n.get("id")} 的 media {m} 不在 media 块里' for m in (n.get('media') or []) if m not in media]
    for vk, v in views.items():
        if not isinstance(v, dict) or v.get('kind') != 'image': continue
        if v.get('media') is not None and v['media'] not in media: errs.append(f'{pid}: 视图 {vk} 的 media {v["media"]} 不在 media 块里')
        if v.get('src') is None and v.get('media') is None: errs.append(f'{pid}: image 视图 {vk} 要有 src 或 media')
    return errs


def check_index():
    """map/packs/index.json（K-R92）：每个列出的包都在、id 不重复、default 在列表里、schema 与清单一致、schema-2 行的 match 等于清单的 match。"""
    ip = os.path.join(MAP, 'packs', 'index.json')
    if not os.path.exists(ip): return ['packs/index.json: 不存在']
    try: ix = json.load(open(ip, encoding='utf-8'))
    except Exception as e: return [f'packs/index.json: 读不了：{e}']
    errs, rows = [], ix.get('packs') if isinstance(ix, dict) else None
    if not isinstance(ix, dict) or ix.get('schema') != 1 or not isinstance(rows, list) or not rows: return ['packs/index.json: 要是 {schema: 1, default, packs: [...]}']
    ids = [r.get('id') for r in rows if isinstance(r, dict)]
    errs += [f'packs/index.json: id 重复 {i}' for i in sorted({i for i in ids if ids.count(i) > 1})]
    if ix.get('default') not in ids: errs.append(f'packs/index.json: default {ix.get("default")!r} 不在 packs 里')
    for r in rows:
        if not isinstance(r, dict) or not r.get('id') or not r.get('title'): errs.append('packs/index.json: 每一行要有 id 与 title'); continue
        mp = os.path.join(MAP, 'packs', r['id'], 'manifest.json')
        if not os.path.exists(mp): errs.append(f'packs/index.json: {r["id"]} 没有对应的包目录'); continue
        m = json.load(open(mp, encoding='utf-8'))
        if r.get('schema') != m.get('schema'): errs.append(f'packs/index.json: {r["id"]} 的 schema {r.get("schema")!r} 与清单 {m.get("schema")!r} 不一致')
        if m.get('schema') == 2 and r.get('match') != m.get('match'): errs.append(f'packs/index.json: {r["id"]} 的 match 与清单不一致（schema 2 的 match 以清单为准）')
    return errs


def check_scene3d():
    """K-R104：每份随仓 3D 清单（主场景 map/estate/model + 每个 map/props/<id>）过 map/data/schema/v2/scene3d.schema.json，并过 core/scene3d-manifest.mjs 的 validate（node）。清单数据这里不改，只报。"""
    sch = json.load(open(os.path.join(MAP, 'data', 'schema', 'v2', 'scene3d.schema.json'), encoding='utf-8'))
    files = [os.path.join(MAP, 'estate', 'model', 'manifest.json')] + sorted(glob.glob(os.path.join(MAP, 'props', '*', 'manifest.json')))
    errs = []
    for f in files:
        rel = os.path.relpath(f, MAP)
        try: m = json.load(open(f, encoding='utf-8'))
        except Exception as e: errs.append(f'{rel}: 读不出来：{e}'); continue
        errs += [f'{rel} {e}' for e in validate(m, sch)]
    js = "import('./map/core/scene3d-manifest.mjs').then(async M=>{const fs=await import('node:fs');for(const f of process.argv.slice(1)){for(const e of M.validate(JSON.parse(fs.readFileSync(f,'utf8'))))console.log(f+': '+e)}})"
    try:
        r = subprocess.run(['node', '-e', js, *files], capture_output=True, text=True, timeout=60, cwd=ROOT)
        errs += [os.path.relpath(x, MAP) if x.startswith(MAP) else x for x in r.stdout.splitlines() if x.strip()]
    except Exception as e: errs.append(f'3D 清单没能过 core 校验：{e}')
    return errs


def main():
    ids = sys.argv[1:] or sorted(x for x in os.listdir(os.path.join(MAP, 'packs')) if os.path.isdir(os.path.join(MAP, 'packs', x)))
    bad = 0
    if not sys.argv[1:]:
        e = check_index()
        for x in e: print('错误', x)
        print('index：' + ('通过' if not e else f'{len(e)} 个问题')); bad += len(e)
    for pid in ids:
        e = check(pid)
        for x in e: print('错误', x)
        print(f'{pid}：' + ('通过' if not e else f'{len(e)} 个问题')); bad += len(e)
    if not sys.argv[1:]:
        e = check_scene3d()
        for x in e: print('错误', x)
        print('3D 清单：' + ('通过' if not e else f'{len(e)} 个问题')); bad += len(e)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
