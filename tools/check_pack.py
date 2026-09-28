#!/usr/bin/env python3
"""校验设定包（通用化，docs/generalize/README.md）：结构（JSON Schema）+ 跨文件一致性。

用法：python3 tools/check_pack.py [<id> ...]      # 不给 id = map/packs/ 下全部
检查：
  manifest.json ↔ map/data/schema/pack.schema.json；id = 目录名；data 里的文件都在
  maps.json ↔ maps.schema.json；start / groups.layers / link / link3d 指向的地图存在；points 数据 ↔ points.schema.json，
  每个标记都有坐标、坐标里没有多余 id；底图 .dzi 与瓦片目录在（make_dzi --verify 同一套）
  events.json ↔ events.schema.json；types.g 是已声明的大类；alias 指向已有类型；layers.map 是包里的地图
  worldbook.json：entries[{name, content}]
eden 包的数据仍由 tools/check_maps.py 校验（这里只查清单）。退出码：有错误 1。
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jsonschema_lite import validate
from make_dzi import verify as dzi_verify

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP = os.path.join(ROOT, 'map')
SCH = {n: json.load(open(os.path.join(MAP, 'data', 'schema', n + '.schema.json'), encoding='utf-8')) for n in ('pack', 'maps', 'points', 'events')}


def check(pid):
    errs = []
    d = os.path.join(MAP, 'packs', pid)
    mp = os.path.join(d, 'manifest.json')
    if not os.path.exists(mp): return [f'{pid}: 没有 manifest.json']
    m = json.load(open(mp, encoding='utf-8'))
    errs += [f'{pid}/manifest.json {e}' for e in validate(m, SCH['pack'])]
    if m.get('id') != pid: errs.append(f'{pid}: 清单 id {m.get("id")!r} 与目录名不一致')
    base = MAP if pid == 'eden' else d   # eden 的路径相对 map/
    for k, v in (m.get('data') or {}).items():
        if v != 'builtin' and not os.path.exists(os.path.join(base, v)): errs.append(f'{pid}: data.{k} 指向的 {v} 不存在')
    if pid == 'eden': return errs   # 其余由 check_maps.py 负责
    if (m.get('data') or {}).get('events') == 'builtin': errs.append(f'{pid}: events: builtin 只给 eden 用；写自己的 events.json')
    def load(rel):
        try: return json.load(open(os.path.join(d, rel), encoding='utf-8'))
        except Exception as e: errs.append(f'{pid}: 读不了 {rel}：{e}'); return None
    reg = load(m['data']['maps'])
    if reg:
        errs += [f'{pid}/maps.json {e}' for e in validate(reg, SCH['maps'])]
        maps = reg.get('maps', {})
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


def main():
    ids = sys.argv[1:] or sorted(x for x in os.listdir(os.path.join(MAP, 'packs')) if os.path.isdir(os.path.join(MAP, 'packs', x)))
    bad = 0
    for pid in ids:
        e = check(pid)
        for x in e: print('错误', x)
        print(f'{pid}：' + ('通过' if not e else f'{len(e)} 个问题')); bad += len(e)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
