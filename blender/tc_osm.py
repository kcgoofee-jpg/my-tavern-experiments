#!/usr/bin/env python3
# OpenStreetMap → 天城城市骨架（纯 Python，不依赖 Blender）。
# 数据 © OpenStreetMap contributors，ODbL 1.0（https://www.openstreetmap.org/copyright）。
# 取材区域：香港九龙油麻地—旺角—太子一带（南北约 3 km、东西约 1.875 km），世界上最密的高层街区之一，
# OSM 的建筑轮廓与层数在这里很完整。天城是虚构城市：整块区域旋转 90°（北 → 东）放进 3 km × 1.875 km 的片区，
# 不保留任何名称标签，地标另按设定叠加。
#
# 用法：
#   python3 blender/tc_osm.py fetch      # 从 api.openstreetmap.org 分块下载原始 .osm 到 blender/data/osm/raw/（不进 git）
#   python3 blender/tc_osm.py build      # 原始 .osm → blender/data/osm/city.json（进 git，三层渲染只读这个）
# city.json：平面坐标（1 单位 = 100 m，片区 x ∈ [-15, 15]、y ∈ [-9.375, 9.375]），
#   roads[{c 等级, w 宽度, p [[x, y], …]}]、buildings[{p 轮廓, h 高度 m 或 null, lv 层数或 null}]、
#   parks / water [{p}]、rail [{p}]。
import json, math, os, sys, glob, urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OSM = os.path.join(HERE, 'data', 'osm')
RAW = os.path.join(OSM, 'raw')
S, N, W_, E = 22.3035, 22.3305, 114.1595, 114.1777          # 取材范围（纬度 3 km × 经度 1.875 km）
LAT0, LON0 = (S + N) / 2, (W_ + E) / 2
MY = 110574.0; MX = 111320.0 * math.cos(math.radians(LAT0))  # 每度的米数
HALF_W, HALF_H = 15.0, 9.375
CREDIT = '© OpenStreetMap contributors (ODbL)'

ROAD_W = {   # 道路等级 → 路面宽度（平面单位，1 = 100 m）；只保留走得了车或人的路
    'motorway': .26, 'trunk': .24, 'primary': .2, 'secondary': .16, 'tertiary': .13, 'unclassified': .09, 'residential': .09,
    'motorway_link': .1, 'trunk_link': .1, 'primary_link': .1, 'secondary_link': .09, 'tertiary_link': .08,
    'living_street': .06, 'service': .05, 'pedestrian': .07, 'footway': .025, 'path': .02, 'steps': .025,
}
def project(lat, lon):
    """经纬度 → 平面坐标：旋转 90°（北 → +x，西 → +y），1 单位 = 100 m。"""
    e = (lon - LON0) * MX / 100; n = (lat - LAT0) * MY / 100
    return round(n, 3), round(-e, 3)

def fetch():
    os.makedirs(RAW, exist_ok=True)
    k = 0
    for i in range(4):
        for lo0, lo1 in ((W_, (W_ + E) / 2), ((W_ + E) / 2, E)):
            k += 1; la0 = S + (N - S) * i / 4; la1 = S + (N - S) * (i + 1) / 4
            url = f'https://api.openstreetmap.org/api/0.6/map?bbox={lo0:.5f},{la0:.5f},{lo1:.5f},{la1:.5f}'
            out = os.path.join(RAW, f'tile{k}.osm'); print('fetch', url)
            req = urllib.request.Request(url, headers={'User-Agent': 'tiancheng-map-build/1 (github.com/kcgoofee-jpg/my-tavern-experiments)'})
            with urllib.request.urlopen(req, timeout=300) as r, open(out, 'wb') as f: f.write(r.read())

def num(v):
    try: return float(str(v).replace('m', '').replace(',', '.').split(';')[0].strip())
    except (ValueError, TypeError): return None

def build():
    files = sorted(glob.glob(os.path.join(RAW, '*.osm')))
    if not files: sys.exit(f'没有原始数据：先运行 python3 {sys.argv[0]} fetch（或把 .osm 放进 {RAW}）')
    nodes, ways, rels = {}, {}, {}
    for fn in files:
        for ev, el in ET.iterparse(fn, events=('end',)):
            if el.tag == 'node': nodes[el.get('id')] = (float(el.get('lat')), float(el.get('lon')))
            elif el.tag == 'way':
                ways[el.get('id')] = ([nd.get('ref') for nd in el.findall('nd')], {t.get('k'): t.get('v') for t in el.findall('tag')})
            elif el.tag == 'relation':
                rels[el.get('id')] = ([(m.get('type'), m.get('ref'), m.get('role')) for m in el.findall('member')], {t.get('k'): t.get('v') for t in el.findall('tag')})
            if el.tag in ('way', 'relation'): el.clear()
    print(f'nodes {len(nodes)}, ways {len(ways)}, relations {len(rels)}')
    def line(refs):
        pts = [project(*nodes[r]) for r in refs if r in nodes]
        return pts
    def inside(pts, pad=.5): return any(abs(x) < HALF_W + pad and abs(y) < HALF_H + pad for x, y in pts)
    out = {'credit': CREDIT, 'source': 'OpenStreetMap, 22.3035–22.3305 N, 114.1595–114.1777 E, rotated 90°', 'roads': [], 'buildings': [], 'parks': [], 'water': [], 'rail': []}
    used_outer = set()
    for rid, (mem, tags) in rels.items():                      # 多边形关系里的建筑：取外环
        if tags.get('type') == 'multipolygon' and 'building' in tags:
            for t, ref, role in mem:
                if t == 'way' and role == 'outer' and ref in ways:
                    refs, wt = ways[ref]
                    if len(refs) > 3 and refs[0] == refs[-1]:
                        pts = line(refs)
                        if inside(pts): out['buildings'].append({'p': pts[:-1], 'h': num(tags.get('height')), 'lv': num(tags.get('building:levels'))}); used_outer.add(ref)
    for wid, (refs, tags) in ways.items():
        if len(refs) < 2: continue
        closed = refs[0] == refs[-1] and len(refs) > 3
        hw = tags.get('highway')
        if hw in ROAD_W and tags.get('area') != 'yes':
            if tags.get('tunnel') in ('yes', 'building_passage') or tags.get('layer', '0').startswith('-'): continue   # 地下的不画
            pts = line(refs)
            if len(pts) > 1 and inside(pts): out['roads'].append({'c': hw, 'w': ROAD_W[hw], 'p': pts, 'br': 1 if tags.get('bridge') == 'yes' else 0})
        elif 'building' in tags and closed and wid not in used_outer and tags.get('building') not in ('roof',):
            pts = line(refs)
            if inside(pts, 0): out['buildings'].append({'p': pts[:-1], 'h': num(tags.get('height')), 'lv': num(tags.get('building:levels'))})
        elif closed and (tags.get('leisure') in ('park', 'garden', 'pitch', 'playground') or tags.get('landuse') in ('grass', 'recreation_ground', 'village_green')):
            pts = line(refs)
            if inside(pts): out['parks'].append({'p': pts[:-1]})
        elif closed and (tags.get('natural') == 'water' or tags.get('landuse') in ('basin', 'reservoir')):
            pts = line(refs)
            if inside(pts): out['water'].append({'p': pts[:-1]})
        elif tags.get('railway') in ('rail', 'light_rail') and tags.get('tunnel') != 'yes' and not tags.get('layer', '0').startswith('-'):
            pts = line(refs)
            if len(pts) > 1 and inside(pts): out['rail'].append({'p': pts})
    for k in ('roads', 'buildings', 'parks', 'water', 'rail'): print(k, len(out[k]))
    hs = [b for b in out['buildings'] if b['h'] or b['lv']]; print(f'buildings with height/levels: {len(hs)} / {len(out["buildings"])}')
    os.makedirs(OSM, exist_ok=True)
    with open(os.path.join(OSM, 'city.json'), 'w') as f: json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote', os.path.join(OSM, 'city.json'), os.path.getsize(os.path.join(OSM, 'city.json')) // 1024, 'KB')

if __name__ == '__main__':
    {'fetch': fetch, 'build': build}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__ or '用法：tc_osm.py fetch|build'))()
